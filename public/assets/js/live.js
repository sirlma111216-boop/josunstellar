/* ==========================================================================
   Night Code 1395 — 학급 실시간 연결
   단계 5-3 의 예상을 학생 각자의 기기에서 누르면 교사 화면에 바로 모인다.

   서버로 나가는 것은 수업 중에 함께 보려고 올리는 것뿐이다.
     · 기기마다 무작위 토큰을 하나 만들어 "한 기기 한 표"를 지킨다
     · 학생이 스스로 정한 닉네임, 예상 한 표,
       잰 자국의 크기(반 전체 산점도용), 오늘의 결론 한 문장
     · 실명·학번·반은 보내지 않는다
   연결이 안 되면 앱은 그대로 혼자 쓰는 모드로 동작한다.
   ========================================================================== */
(function (global) {
  'use strict';

  var Live = {
    code: null,        // 지금 참여 중인 수업 코드
    role: null,        // 'host'(교사) | 'guest'(학생)
    ws: null,
    ready: false,
    nick: null,        // 내가 쓴 닉네임(이 기기에만 저장된다)
    members: [],       // [{ nick, on, voted }] — 닉네임 말고는 아무것도 오지 않는다
    joined: 0,         // 한 번이라도 들어온 사람 수
    online: 0,         // 지금 붙어 있는 사람 수
    work: null,        // 반 전체 자료 { pts, people, notes, ranks, plans }
    myRank: null,      // 서버에 남아 있던 내 순서 답 (차시가 나뉘어도 되살린다)
    tally: null,       // { counts, total }
    stage: null,       // 교사가 보고 있는 단계 { step, sub }
    following: true,   // 학생이 교사 화면을 따라가는가
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

  /** 반 전체 자료를 서버가 준 그대로 받는다. 빠진 칸만 기본값으로 채운다. */
  function takeWork(d) {
    if (!d) return null;
    var w = {};
    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) w[k] = d[k];
    w.pts = w.pts || [];
    w.people = w.people || 0;
    w.notes = w.notes || [];
    w.ranks = w.ranks || [];
    w.plans = w.plans || [];
    w.spots = w.spots || {};
    return w;
  }

  /** 서버가 내려준 집계·명단을 그대로 받아 넣는다 */
  function take(d) {
    if (!d) return;
    if (d.counts) Live.tally = { counts: d.counts, total: d.total };
    if (d.members) { Live.members = d.members; Live.joined = d.joined; Live.online = d.online; }
    if (d.pts) Live.work = takeWork(d);
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
      Live.send('join', { token: token(), nick: Live.nick }, function (err, d) {
        if (!err && d) {
          take(d);
          Live.mine = d.mine;
          if (d.nick) Live.nick = d.nick;          // 서버가 다듬은 형태로 맞춘다
          // 1차시에 낸 순서 답이 서버에 남아 있으면 되살린다
          if (d.myRank && d.myRank.length) {
            Live.myRank = d.myRank;
            if (global.State && !(State.data.rank || []).length) {
              State.data.rank = d.myRank.slice();
              State.save();
            }
          }
          if (d.stage) { Live.stage = d.stage; if (Live.onStage) Live.onStage(d.stage); }
        }
        Live.ready = true;
        notify();
        Live.fetchWork();
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
      if (msg.t === 'work' && msg.d) {
        Live.work = takeWork(msg.d);
        if (Live.onWork) Live.onWork(Live.work);
        notify();
        return;
      }
      if (msg.t === 'stage' && msg.d) {
        Live.stage = msg.d;
        if (Live.onStage) Live.onStage(msg.d);
        notify();
        return;
      }
      if (msg.t === 'tally' && msg.d) {
        take(msg.d);
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
    Live.members = []; Live.joined = 0; Live.online = 0; Live.work = null; Live.myRank = null;
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
        asHost(d.code);
        done(null, d);
      })
      .catch(function () {
        done('학급 기능을 쓸 수 없습니다. Cloudflare Worker 로 배포한 주소에서만 됩니다.');
      });
  };

  var HOST_KEEP_MS = 8 * 24 * 60 * 60 * 1000;   // 서버 보관 기간과 같게
  var HOST_MAX = 5;

  /** 선생님으로 붙는다. 연 코드는 기기에 남겨 2차시에 다시 꺼내 쓴다.
      한 개만 남기면 2차시에 실수로 [수업 열기]를 누르는 순간 1차시 코드가 사라지므로
      최근 몇 개를 함께 들고 있는다. */
  function asHost(code) {
    Live.nick = null;                      // 선생님 기기는 명단에 올리지 않는다
    Store.remove('liveNick');
    var list = hostList().filter(function (h) { return h.code !== code; });
    list.unshift({ code: code, at: Date.now() });
    Store.set('hostCodes', list.slice(0, HOST_MAX));
    Live.connect(code, 'host');
  }

  /** 이 기기가 연 적 있는 수업 코드들 — 최근 것부터. 8일이 지난 것은 뺀다. */
  function hostList() {
    var raw = Store.get('hostCodes', null);
    if (!raw) {                                   // 옛 형식(한 개)에서 넘어온다
      var one = Store.get('hostCode', null);
      raw = one && one.code ? [one] : [];
    }
    if (!Array.isArray(raw)) return [];
    var now = Date.now();
    return raw.filter(function (h) {
      return h && h.code && (now - (h.at || 0)) < HOST_KEEP_MS;
    });
  }

  /** 다시 열기 칸에 보여 줄 목록. 지금 붙어 있는 코드는 뺀다. */
  Live.pastHostCodes = function () {
    return hostList().filter(function (h) { return h.code !== Live.code; });
  };

  /** 그중 가장 최근 것 */
  Live.lastHostCode = function () {
    var l = Live.pastHostCodes();
    return l.length ? l[0].code : null;
  };

  /** 교사: 지난 수업 코드로 다시 연다 (1차시 자료를 그대로 이어받는다) */
  Live.reopenClass = function (raw, done) {
    var code = String(raw || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
    if (code.length !== 6) { done('코드 6자리를 넣어 주세요.'); return; }
    asHost(code);
    done(null, { code: code });
  };

  /** 학생: 코드로 들어간다 */
  Live.joinClass = function (raw, rawNick, done) {
    var code = String(raw || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
    if (code.length !== 6) { done('코드 6자리를 넣어 주세요.'); return; }
    var nick = String(rawNick || '').trim().slice(0, 12);
    if (!nick) { done('닉네임을 넣어 주세요.'); return; }
    Live.nick = nick;
    Store.set('liveNick', nick);
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
      if (!err && d) { take(d); notify(); }
    });
  };

  /** 내가 잰 값을 반 전체 산점도에 보탠다. [[등급, 지름], …] */
  Live.sendResult = function (pts) {
    if (!Live.ready || Live.role !== 'guest') return;
    Live.send('result', { token: token(), pts: pts });
  };

  /** 오늘의 결론 한 문장을 올린다 */
  Live.sendNote = function (text, done) {
    if (!Live.ready || Live.role !== 'guest') { if (done) done('연결되지 않았습니다.'); return; }
    Live.send('note', { token: token(), text: text }, function (err, d) {
      if (!err && d) { Live.work = takeWork(d); notify(); }
      if (done) done(err || null);
    });
  };

  /** 가설 — 왜 그렇게 생각했는지와 확인할 방법 */
  /** 월하정인에서 고른 '이상한 점'을 올린다 */
  Live.sendSpot = function (key, done) {
    if (!Live.ready) { if (done) done('연결되지 않았습니다.'); return; }
    Live.send('spot', { token: token(), key: key || '' }, function (err, d) {
      if (!err && d) { Live.work = takeWork(d); notify(); }
      if (done) done(err || null);
    });
  };

  Live.sendPlan = function (why, how, done) {
    if (!Live.ready || Live.role !== 'guest') { if (done) done('연결되지 않았습니다.'); return; }
    Live.send('plan', { token: token(), why: why, how: how }, function (err, d) {
      if (!err && d) { Live.work = takeWork(d); notify(); }
      if (done) done(err || null);
    });
  };

  /** 밝기 순서 맞히기 답을 올린다 */
  Live.sendRank = function (order, done) {
    if (!Live.ready || Live.role !== 'guest') { if (done) done('연결되지 않았습니다.'); return; }
    Live.send('rank', { token: token(), order: order }, function (err, d) {
      if (!err && d) { Live.work = takeWork(d); notify(); }
      if (done) done(err || null);
    });
  };

  /** 지금까지 모인 반 전체 자료를 받아 온다 */
  Live.fetchWork = function () {
    if (!Live.ready) return;
    Live.send('work', {}, function (err, d) {
      if (err || !d) return;
      Live.work = takeWork(d);
      if (Live.onWork) Live.onWork(Live.work);
      notify();
    });
  };

  /** 교사: 지금 보고 있는 단계를 학생들에게 알린다 */
  Live.setStage = function (step, sub) {
    if (Live.role !== 'host' || !Live.ready) return;
    var s = Live.stage;
    if (s && s.step === step && s.sub === sub) return;   // 같은 곳이면 보내지 않는다
    Live.stage = { step: step, sub: sub };
    Live.send('stage', { step: step, sub: sub });
  };

  /** 학생: 따라가기를 켜고 끈다 */
  Live.setFollowing = function (on) {
    Live.following = !!on;
    Store.set('liveFollow', Live.following);
    notify();
  };

  /** 교사: 다음 반을 위해 표를 비운다 */
  Live.reset = function (what) {
    Live.send('reset', { what: what || 'votes' }, function () { /* 브로드캐스트로 갱신된다 */ });
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
    Live.following = Store.get('liveFollow', true);
    Live.nick = Store.get('liveNick', null);
    var role = fromUrl ? 'guest' : Store.get('liveRole', 'guest');
    // 닉네임 없이 들어오면 선생님 명단에 이름이 안 뜬다.
    // 그럴 땐 붙이지 말고 참여 칸에 코드만 채워 준다.
    if (role === 'guest' && !Live.nick) { Live.pendingCode = code; return; }
    Live.connect(code, role);
  };

  global.Live = Live;

})(window);
