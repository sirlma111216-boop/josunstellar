/* ==========================================================================
   Night Code 1395 — 발표자 뽑기 · 구슬 레이스 (단계 10)
   참가는 코드로 참여 중인 학급 전체가 닉네임만으로 한다(로그인 없음).
   레이스 자체는 따로 배포된 「교실 구슬 레이스」를 iframe 으로 가져다
   교사 화면(프로젝터)에서만 돌린다(local 모드 — 활동 앱 쪽 서버를 쓰지 않는다).
   회전 관문 맵을 가장 먼저 통과한 두 명이 발표자다.
   결과는 교사 브라우저가 계산한 것이므로 우리 서버에는 「명단 몇 번째가 도착했다」만
   올리고, 그것을 받아 학생 화면에도 발표자를 띄운다. 성적·평가에는 쓰지 않는다.
   서버 쪽 메시지·저장 칸 이름(ladder*)은 예전 사다리 타기 시절 것을 그대로 쓴다.
   ========================================================================== */
(function (global) {
  'use strict';

  var ACTIVITY = 'https://classroom-marble-race.sirlma.workers.dev';
  var SDK_URL = ACTIVITY + '/sdk/marble-race-sdk.js';
  var MAP_ID = 'classic-wheel';   // 회전 관문
  var WINNERS = 2;                // 가장 먼저 통과한 두 명
  var COUNTDOWN_SEC = 3;

  function el(tag, cls, parent, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function $(id) { return document.getElementById(id); }

  var Race = {
    built: false,
    mine: false,        // 이 기기가 참가했다고 알고 있는가(새로고침하면 잊는다)
    handle: null,       // 활동 앱 SDK 핸들(교사 화면에만 있다)
    ready: false,       // 활동 앱이 ready 를 보냈는가
    racingFor: null,    // 지금 돌리고 있는(또는 돌린) 명단의 표시 — 같은 판을 두 번 돌리지 않으려고
    sentFor: null,      // 이 명단의 결과를 서버에 이미 올렸는가
    lobbyFor: null,     // 활동 앱 로비에 마지막으로 넘긴 명단의 표시
    sdk: null           // import 약속(한 번만 받는다)
  };

  function sigOf(L) { return (L && L.slots || []).join('|'); }

  function participantsOf(L) {
    // id 는 명단 번호다. 활동 앱이 돌려주는 participantId 를 그대로 번호로 되돌린다.
    return (L && L.slots || []).map(function (nick, i) { return { id: 'i-' + i, nickname: nick }; });
  }

  function showError(msg) {
    var box = $('raceError');
    box.textContent = msg || '';
    box.hidden = !msg;
  }

  function loadSdk() {
    if (!Race.sdk) Race.sdk = import(SDK_URL);
    return Race.sdk;
  }

  /* ---------- 활동 앱 붙이기(교사 화면, 한 번만) ---------- */
  function ensureMounted(L) {
    if (Race.handle) return;
    var stage = $('raceStage');
    stage.hidden = false;
    loadSdk().then(function (mod) {
      if (Race.handle) return;
      var race = mod.createMarbleRace({
        activityOrigin: ACTIVITY,
        mode: 'local',
        participants: participantsOf(L),
        title: '발표자 뽑기'
      });
      Race.handle = race;
      race.on('ready', function () {
        // 배포된 활동 앱은 「첫 n명」을 topK 로 부른다(안내문의 firstN 은 거절된다 — 실측).
        race.setConfig({ mapId: MAP_ID, rule: { kind: 'topK', k: WINNERS } })
          .then(function () { Race.ready = true; showError(''); Race.render(); })
          .catch(function (e) { showError('규칙을 정하지 못했습니다: ' + e.message); });
      });
      race.on('roundFinished', onFinished);
      race.on('error', function (e) { showError(e && e.message ? e.message : '활동 앱에서 문제가 생겼습니다.'); });
      race.mount(stage);
      // 활동 앱은 허용된 주소(nc1395.labbitory.com)에서만 iframe 으로 열린다.
      // 다른 주소에서 열면 조용히 검은 칸만 남으므로, 기다려 보고 알려 준다.
      setTimeout(function () {
        if (Race.handle === race && !Race.ready) {
          showError('구슬 레이스가 응답하지 않습니다. 이 주소에서는 활동 앱이 열리지 않을 수 있습니다 — ' +
                    'https://nc1395.labbitory.com 에서 수업을 열어 주세요.');
        }
      }, 15000);
    }).catch(function (e) {
      showError('구슬 레이스를 불러오지 못했습니다: ' + (e && e.message ? e.message : e));
    });
  }

  function unmount() {
    if (!Race.handle) return;
    try { Race.handle.destroy(); } catch (e) { /* 무시 */ }
    Race.handle = null;
    Race.ready = false;
    Race.racingFor = null;
    $('raceStage').innerHTML = '';
    $('raceStage').hidden = true;
  }

  /* ---------- 한 판 ---------- */
  function startRace(L) {
    var sig = sigOf(L);
    if (Race.racingFor === sig) return;
    if (!Race.handle || !Race.ready) { showError('활동 앱이 아직 준비되지 않았습니다. 잠시 뒤 다시 눌러 주세요.'); return; }
    Race.racingFor = sig;
    showError('');
    Race.handle.setParticipants(participantsOf(L))
      .then(function () { return Race.handle.startRound(COUNTDOWN_SEC); })
      .catch(function (e) {
        Race.racingFor = null;
        showError('레이스를 시작하지 못했습니다: ' + e.message);
      });
  }

  function onFinished(p) {
    var list = (p && p.result && p.result.winners) || (p && p.winners) || [];
    var idx = list.slice().sort(function (a, b) { return (a.rank || 0) - (b.rank || 0); })
      .map(function (w) { return Number(String(w.participantId || '').replace(/^i-/, '')); })
      .filter(function (n) { return Number.isInteger(n) && n >= 0; })
      .slice(0, WINNERS);
    if (!idx.length) { showError('도착한 사람을 읽지 못했습니다.'); return; }
    var sig = Race.racingFor;
    if (Race.sentFor === sig) return;
    Race.sentFor = sig;
    Live.sendLadderReveal(idx, function (err) {
      if (err) { Race.sentFor = null; showError('결과를 올리지 못했습니다: ' + err); return; }
      Race.render();
    });
  }

  /* ---------- 정적 요소 연결(한 번만) ---------- */
  Race.build = function () {
    if (Race.built) return;
    Race.built = true;

    $('btnRaceJoin').addEventListener('click', function () {
      var nick = (global.Live && Live.nick) || '';
      if (!nick) { App.toast('먼저 닉네임으로 수업에 참여해 주세요.'); return; }
      Live.sendLadderJoin(nick, function (err) {
        if (err) { App.toast(err); return; }
        Race.mine = true;
        Race.render();
      });
    });
    $('btnRaceLeave').addEventListener('click', function () {
      Live.sendLadderLeave(function (err) {
        if (!err) { Race.mine = false; Race.render(); }
      });
    });
    $('btnRaceStart').addEventListener('click', function () {
      if (!Race.ready) { showError('활동 앱이 아직 준비되지 않았습니다. 잠시 뒤 다시 눌러 주세요.'); return; }
      $('btnRaceStart').disabled = true;
      Live.sendLadderStart(function (err) {
        if (err) { App.toast(err); $('btnRaceStart').disabled = false; return; }
        Race.render();   // 서버가 확정한 명단으로 레이스를 시작한다
      });
    });
    $('btnRaceReset').addEventListener('click', function () {
      if (!confirm('참가자를 모두 내리고 다시 뽑을까요?')) return;
      Race.racingFor = null;
      Race.sentFor = null;
      Race.mine = false;
      if (Race.handle) Race.handle.resetRound().catch(function (e) { showError(e.message); });
      Live.send('reset', { what: 'ladder' }, function () { Race.render(); });
    });
  };

  /* ---------- 참가 칸 ---------- */
  function renderJoin(L, isHost) {
    var names = $('raceNames');
    names.innerHTML = '';
    var slots = (L && L.slots) || [];
    // 참가자가 아무도 없으면(막 리셋됐다면) 내 기억도 함께 지운다.
    if (!slots.length && !(L && L.started)) Race.mine = false;
    slots.forEach(function (nick) { el('span', 'race-chip', names, nick); });
    $('raceCount').textContent = slots.length ? slots.length + '명 참가' : '아직 참가자가 없습니다.';

    var started = !!(L && L.started);
    $('raceJoinForm').hidden = isHost || started || Race.mine;
    $('raceMyNick').textContent = (global.Live && Live.nick) || '—';
    $('btnRaceLeave').hidden = isHost || started || !Race.mine;

    $('raceHostStart').hidden = !isHost || started;
    $('btnRaceStart').disabled = slots.length < 2 || !Race.ready;
  }

  function showResult(L, isHost) {
    var names = (L.winners || []).map(function (i) { return L.slots[i]; }).filter(Boolean);
    $('raceResultBox').hidden = false;
    $('raceWinnerName').textContent = names.join(' · ') || '—';
    $('btnRaceReset').hidden = !isHost;   // 다시 뽑기는 교사만
  }

  /* ---------- 전체 갱신 ---------- */
  Race.render = function () {
    if (!$('raceCard')) return;
    var live = global.Live && Live.code;
    $('raceNoLive').hidden = !!live;
    $('raceBody').hidden = !live;
    if (!live) { unmount(); return; }

    var L = Live.work && Live.work.ladder;
    var isHost = Live.role === 'host';

    renderJoin(L, isHost);

    if (isHost) {
      // 교사 화면엔 활동 앱 로비가 늘 보인다. 명단이 바뀌면 그쪽에도 맞춘다.
      ensureMounted(L);
      if (Race.handle && Race.ready && !(L && L.started)) {
        var sig = sigOf(L);
        if (Race.lobbyFor !== sig) {
          Race.lobbyFor = sig;
          Race.handle.setParticipants(participantsOf(L)).catch(function (e) { showError(e.message); });
        }
      }
    } else {
      $('raceStage').hidden = true;
    }

    if (!L || !L.started) {
      Race.racingFor = null;   // 판이 비었으니 다음 판은 새로 돈다
      Race.sentFor = null;
      $('raceWait').hidden = true;
      $('raceResultBox').hidden = true;
      return;
    }

    if (!L.revealed) {
      $('raceResultBox').hidden = true;
      $('raceWait').hidden = isHost;
      // 교사: 확정된 명단으로 레이스를 돌린다(새로고침해서 들어와도 이어서 돌린다)
      if (isHost && Race.ready) startRace(L);
      return;
    }

    $('raceWait').hidden = true;
    showResult(L, isHost);
  };

  global.Race = Race;

})(window);
