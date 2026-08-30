/* ==========================================================================
   조선스텔라 — 학급 실시간 연결
   단계 4의 예상을 학생 각자의 기기에서 누르면 교사 화면에 바로 모인다.

   서버로 나가는 것은 익명 표 하나뿐이다.
     · 기기마다 무작위 토큰을 하나 만들어 "한 기기 한 표"를 지킨다
     · 이름·학번·측정 기록은 보내지 않는다
   연결이 안 되면 앱은 그대로 혼자 쓰는 모드로 동작한다.
   ========================================================================== */
(function (global) {
  'use strict';

  var Live = {
    code: null,        // 지금 참여 중인 수업 코드
    role: null,        // 'host'(교사) | 'guest'(학생)
    ws: null,
    ready: false,
    tally: null,       // { counts, total }
    mine: null,        // 내가 고른 것(서버 기준)
    listeners: [],
    seq: 1,
    waiting: {},
    retry: 0
  };

  /* 기기마다 하나. 이름이 아니라 무작위 값이라 누가 눌렀는지는 서버도 모른다. */
  function token() {
    var t = Store.get('liveToken', null);
    if (!t) {
      t = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      Store.set('liveToken', t);
    }
    return t;
  }

  Live.onChange = function (fn) { Live.listeners.push(fn); };
  function notify() {
    for (var i = 0; i < Live.listeners.length; i++) {
      try { Live.listeners[i](Live); } catch (e) { console.warn(e); }
    }
  }

  /** 이 앱이 Worker 위에서 돌고 있는가(= 학급 기능을 쓸 수 있는가) */
  Live.available = function () {
    return location.protocol === 'http:' || location.protocol === 'https:';
  };

  /* ---------------------------------------------------------------- 연결 */

  function wsUrl(code) {
    var p = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return p + '//' + location.host + '/ws?code=' + encodeURIComponent(code);
  }

  Live.connect = function (code, role) {
    Live.disconnect();
    Live.code = code;
    Live.role = role || 'guest';
    Store.set('liveCode', code);
    Store.set('liveRole', Live.role);

    var ws;
    try { ws = new WebSocket(wsUrl(code)); }
    catch (e) { notify(); return; }
    Live.ws = ws;

    ws.onopen = function () {
      Live.retry = 0;
      Live.send('join', { token: token() }, function (err, d) {
        if (!err && d) { Live.tally = { counts: d.counts, total: d.total }; Live.mine = d.mine; }
        Live.ready = true;
        notify();
      });
    };

    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.t === 'ack') {
        var cb = Live.waiting[msg.i];
        delete Live.waiting[msg.i];
        if (cb) cb(msg.err || null, msg.d);
        return;
      }
      if (msg.t === 'tally' && msg.d) {
        Live.tally = { counts: msg.d.counts, total: msg.d.total };
        notify();
      }
    };

    ws.onclose = function () {
      Live.ready = false;
      notify();
      // 수업 중 잠깐 끊겨도 스스로 돌아온다
      if (Live.code && Live.retry < 6) {
        Live.retry++;
        setTimeout(function () {
          if (Live.code) Live.connect(Live.code, Live.role);
        }, Math.min(8000, 800 * Live.retry));
      }
    };

    ws.onerror = function () { /* onclose 가 이어서 처리한다 */ };
  };

  Live.disconnect = function () {
    if (Live.ws) { try { Live.ws.close(); } catch (e) { /* 무시 */ } }
    Live.ws = null;
    Live.ready = false;
  };

  Live.leave = function () {
    Live.code = null; Live.role = null; Live.tally = null; Live.mine = null;
    Store.remove('liveCode'); Store.remove('liveRole');
    Live.disconnect();
    notify();
  };

  Live.send = function (type, data, cb) {
    if (!Live.ws || Live.ws.readyState !== 1) { if (cb) cb('연결되지 않았습니다.'); return; }
    var id = Live.seq++;
    if (cb) Live.waiting[id] = cb;
    Live.ws.send(JSON.stringify({ t: type, i: id, d: data }));
  };

  /* ---------------------------------------------------------------- 사용 */

  /** 교사: 새 수업을 연다 */
  Live.openClass = function (done) {
    fetch('api/new-code', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('no worker'); return r.json(); })
      .then(function (d) {
        Live.joinInfo = d;                 // { code, joinUrl, qr }
        Live.connect(d.code, 'host');
        done(null, d);
      })
      .catch(function () {
        done('학급 기능을 쓸 수 없습니다. Cloudflare Worker 로 배포한 주소에서만 됩니다.');
      });
  };

  /** 학생: 코드로 들어간다 */
  Live.joinClass = function (raw, done) {
    var code = String(raw || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
    if (code.length !== 6) { done('코드 6자리를 넣어 주세요.'); return; }
    Live.connect(code, 'guest');
    var t = setTimeout(function () { done('연결하지 못했습니다. 코드를 확인해 주세요.'); }, 6000);
    var once = function () {
      if (!Live.ready) return;
      clearTimeout(t);
      Live.onChange = Live.onChange;      // (구독은 그대로 둔다)
      done(null, code);
    };
    Live.onChange(function () { once(); });
  };

  /** 예상 한 표 (다시 고르면 바뀐다) */
  Live.vote = function (key) {
    Live.mine = key;
    Live.send('vote', { token: token(), key: key }, function (err, d) {
      if (!err && d) { Live.tally = { counts: d.counts, total: d.total }; notify(); }
    });
  };

  /** 교사: 다음 반을 위해 표를 비운다 */
  Live.reset = function () {
    Live.send('reset', {}, function () { /* 브로드캐스트로 갱신된다 */ });
  };

  /* 새로고침해도 붙어 있던 수업으로 돌아간다.
     주소에 ?code=XXXXXX 가 붙어 오면(QR) 그 수업으로 바로 들어간다. */
  Live.restore = function () {
    if (!Live.available()) return;
    var fromUrl = new URLSearchParams(location.search).get('code');
    var code = fromUrl || Store.get('liveCode', null);
    if (!code) return;
    code = String(code).toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
    if (code.length !== 6) return;
    Live.connect(code, fromUrl ? 'guest' : (Store.get('liveRole', 'guest')));
  };

  global.Live = Live;

})(window);
