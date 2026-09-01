/* ==========================================================================
   Night Code 1395 — 데모봇
   수업 전에 혼자서 전체 흐름을 돌려 보기 위한 도구.

   가짜 학생 여러 명이 진짜 학생과 똑같이 WebSocket 으로 붙어서,
   교사가 화면을 넘길 때마다 그 단계에 맞는 일을 한다.
     단계 5-3 → 예상 고르고 가설 내기
     단계 5-5 → 밝기 순서 맞히기
     단계 6-1 → 그림에서 이상한 점 고르기
     단계 8   → 잰 값 올리기 (한 별씩)
     단계 10  → 결론 쓰기
   사람마다 속도가 달라 하나씩 도착하는 모습까지 그대로 보인다.

   [멈추기] 를 누르면 봇이 남긴 것(명단·표·측정값·결론)을 모두 지우고 빠진다.
   그래서 리허설 뒤 그 코드로 바로 수업해도 데모 자료가 섞이지 않는다.
   ========================================================================== */
(function (global) {
  'use strict';

  /** 한 반쯤 되도록 */
  var COUNT = 12;

  var NICKS = ['가람', '나래', '다올', '라온', '마루', '바다',
               '사랑', '아라', '한별', '차오름', '푸른', '해든'];

  /** 예상 쏠림 — 실제 교실처럼 정답 쪽이 많되 갈리도록 */
  var VOTE_MIX = ['bright', 'bright', 'bright', 'bright', 'bright', 'bright',
                  'big', 'big', 'big', 'near', 'near', 'import'];

  /* 월하정인에서 고르는 이상한 점 — 달을 맞히는 아이가 절반쯤 되도록 섞는다 */
  var SPOT_MIX = ['moon', 'moon', 'moon', 'moon', 'moon',
                  'roof', 'roof', 'lantern', 'lantern', 'shadow', 'text', 'veil'];

  /* 밝기 순서 정답 */
  var RANK_TRUE = ['sun', 'moon', 'venus', 'jupiter', 'sirius', 'vega', 'deneb'];

  /** 두 자리를 바꾼 답을 만든다 */
  function swapped(i, j) {
    var a = RANK_TRUE.slice();
    var t = a[i]; a[i] = a[j]; a[j] = t;
    return a;
  }

  /* 12명이 낼 답. 금성·목성이 헷갈리는 것이 실제 교실 모습이다. */
  var RANK_MIX = [
    RANK_TRUE, RANK_TRUE, RANK_TRUE, RANK_TRUE,
    swapped(2, 3), swapped(2, 3), swapped(2, 3),   // 금성 ↔ 목성
    RANK_TRUE, RANK_TRUE,
    swapped(4, 5),                                  // 시리우스 ↔ 베가
    swapped(1, 2),                                  // 보름달 ↔ 금성
    RANK_TRUE
  ];

  /* 가설 — 까닭과 확인 방법. "재 보면 된다" 에 이르는 답이 섞이도록. */
  var PLANS = [
    { why: '밝은 별이 더 눈에 띄니까',        how: '별 자국의 크기를 자로 재 본다' },
    { why: '큰 별이라서 크게 그린 것 같다',   how: '크기를 재서 밝기랑 비교한다' },
    { why: '중요한 별을 크게 새겼을 것 같다', how: '옛날 기록을 찾아본다' },
    { why: '가까우면 크게 보이니까',          how: '별까지 거리를 알아본다' },
    { why: '밝을수록 크게 새겼을 것 같다',    how: '자국 지름을 재고 등급이랑 견줘 본다' },
    { why: '',                                how: '여러 개를 재서 규칙이 있는지 본다' },
    { why: '눈에 잘 보이는 별이니까',          how: '크기를 다 재서 표로 만든다' },
    { why: '',                                how: '' },
    { why: '별마다 다르게 보여서',            how: '확대해서 지름을 재 본다' },
    { why: '밝기를 표시하려던 것 같다',       how: '재 보고 실제 밝기랑 맞는지 확인한다' },
    { why: '크게 새길수록 눈에 띄니까',       how: '자국을 재서 그래프로 그려 본다' },
    { why: '',                                how: '친구들 것과 모아서 비교한다' }
  ];

  var NOTES = [
    '밝은 별일수록 자국이 더 컸습니다.',
    '등급이 작을수록 크게 새겼다는 걸 알았어요. 신기했습니다!',
    '망원경도 없이 밝기를 구분했다는 게 대단하다고 생각했습니다.',
    '점을 찍어 보니 오른쪽 아래로 내려가는 모양이 나왔습니다.',
    '조선 사람들이 별을 얼마나 자세히 봤는지 알 것 같아요.',
    '내가 잰 값은 조금 흔들렸지만 반 전체로 보니 확실했습니다.',
    '돌에 새긴 크기가 밝기를 나타낸다는 게 놀라웠습니다.',
    '시리우스가 제일 크고 메이사가 제일 작았습니다.',
    '600년 전 기록이 지금 관측과 맞는다는 게 신기합니다.',
    '자국을 재는 게 생각보다 어려웠는데 재미있었어요.',
    '별의 밝기를 크기로 적어 둔 조상들이 똑똑한 것 같습니다.',
    '경향선을 보니 규칙이 한눈에 보였습니다.'
  ];

  var Demo = {
    running: false,
    bots: [],
    done: {}          // 단계별로 이미 시킨 일 { vote:true, result:true, note:true }
  };

  function wsUrl(code) {
    var p = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return p + '//' + location.host + '/ws?code=' + encodeURIComponent(code);
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  /**
   * 사람마다 재는 버릇이 다르다 — 조금 크게 재는 사람, 들쭉날쭉한 사람.
   * n 을 주면 앞에서 n 개까지만 잰 것으로 친다.
   */
  function makePoints(bot, n) {
    return STARS.slice(0, n || STARS.length).map(function (s) {
      var base = 31.3 - 4.01 * s.mag;          // 실제 자료에서 얻은 관계
      var v = base + bot.bias + rnd(-bot.noise, bot.noise);
      return [s.mag, Math.max(3, Math.round(v * 10) / 10)];
    });
  }

  function send(bot, type, data) {
    if (!bot.ws || bot.ws.readyState !== 1) return;
    bot.ws.send(JSON.stringify({ t: type, i: bot.seq++, d: data }));
  }

  /** 봇 하나를 붙인다 */
  function spawn(i, code) {
    var bot = {
      nick: NICKS[i % NICKS.length],
      token: 'demo-' + i + '-' + Math.random().toString(36).slice(2, 7),
      vote: VOTE_MIX[i % VOTE_MIX.length],
      spot: SPOT_MIX[i % SPOT_MIX.length],
      rank: RANK_MIX[i % RANK_MIX.length],
      plan: PLANS[i % PLANS.length],
      note: NOTES[i % NOTES.length],
      bias: rnd(-2.2, 2.2),        // 이 사람의 치우침
      noise: rnd(1.2, 4.0),        // 이 사람의 흔들림
      pace: rnd(1800, 5200),       // 별 하나 재는 데 걸리는 시간
      seq: 1,
      ws: null,
      did: {}
    };
    try { bot.ws = new WebSocket(wsUrl(code)); }
    catch (e) { return null; }
    bot.ws.onopen = function () { send(bot, 'join', { token: bot.token, nick: bot.nick }); };
    bot.ws.onmessage = function () { /* 봇은 받아 볼 필요가 없다 */ };
    bot.ws.onerror = function () { /* 조용히 넘어간다 */ };
    return bot;
  }

  /** 봇에게 시킬 일을 사람마다 다른 시간에 하나씩 */
  function each(fn, from, to) {
    Demo.bots.forEach(function (bot) {
      var t = setTimeout(function () { if (Demo.running) fn(bot); }, rnd(from, to));
      Demo.timers.push(t);
    });
  }

  function doVote(bot) { if (!bot.did.vote) { bot.did.vote = true; send(bot, 'vote', { token: bot.token, key: bot.vote }); } }
  function doSpot(bot) { if (!bot.did.spot) { bot.did.spot = true; send(bot, 'spot', { token: bot.token, key: bot.spot }); } }
  /**
   * 실제 교실처럼 한 별씩 재 나간다.
   * 그래야 교사 화면의 "측정 학생수" 칸이 별마다 다르게 차오르는 것이 보인다.
   * 사람마다 속도가 달라서, 끝까지 못 가는 학생도 나온다.
   */
  function doResult(bot) {
    if (bot.did.result) return;
    bot.did.result = true;
    var upto = Math.round(rnd(6, STARS.length));   // 이 사람이 끝까지 잴 개수
    var i = 1;
    (function next() {
      if (!Demo.running || i > upto) return;
      send(bot, 'result', { token: bot.token, pts: makePoints(bot, i) });
      i++;
      var t = setTimeout(next, rnd(bot.pace * 0.6, bot.pace * 1.6));
      Demo.timers.push(t);
    })();
  }
  function doPlan(bot) {
    if (bot.did.plan) return;
    bot.did.plan = true;
    if (!bot.plan.why && !bot.plan.how) return;   // 아무것도 안 쓴 학생도 있다
    send(bot, 'plan', { token: bot.token, why: bot.plan.why, how: bot.plan.how });
  }
  function doRank(bot) { if (!bot.did.rank) { bot.did.rank = true; send(bot, 'rank', { token: bot.token, order: bot.rank }); } }
  function doNote(bot) { if (!bot.did.note) { bot.did.note = true; send(bot, 'note', { token: bot.token, text: bot.note }); } }

  /**
   * 교사가 화면을 넘길 때마다 불린다.
   * 건너뛰어 들어와도 빈 화면이 되지 않도록, 앞 단계에서 했어야 할 일은 몰아서 시킨다.
   */
  Demo.onStage = function (step, sub) {
    if (!Demo.running) return;
    var atHypo = (step === 5 && sub >= 3) || step >= 6;   // 가설은 5-3 화면부터
    var atRank = (step === 5 && sub >= 5) || step >= 6;   // 순서 맞히기는 5-5 부터
    var atSpot = step >= 6;                              // 월하정인은 6-1 부터
    if (atHypo && !Demo.done.vote) { Demo.done.vote = true; each(doVote, 900, 6000); }
    if (atHypo && !Demo.done.plan) { Demo.done.plan = true; each(doPlan, 2500, 11000); }
    if (atRank && !Demo.done.rank) { Demo.done.rank = true; each(doRank, 1200, 9000); }
    if (atSpot && !Demo.done.spot) { Demo.done.spot = true; each(doSpot, 1200, 8000); }
    if (step >= 8 && !Demo.done.result) { Demo.done.result = true; each(doResult, 1500, 12000); }
    if (step >= 10 && !Demo.done.note) { Demo.done.note = true; each(doNote, 1200, 9000); }
  };

  /** 데모 시작. 이미 열린 수업이 있으면 그 수업에 붙는다. */
  Demo.start = function (code, done) {
    if (Demo.running) { done && done(null); return; }
    // 지난번에 교사 화면이 새로고침되어 남았을 수 있는 찌꺼기를 먼저 걷어낸다
    if (global.Live && Live.ready) Live.reset('demo');
    Demo.running = true;
    Demo.bots = [];
    Demo.timers = [];
    Demo.done = {};

    // 한꺼번에 들어오지 않고 하나씩 — 교실에서 코드를 불러 준 뒤 모습 그대로
    for (var i = 0; i < COUNT; i++) {
      (function (k) {
        var t = setTimeout(function () {
          if (!Demo.running) return;
          var bot = spawn(k, code);
          if (bot) Demo.bots.push(bot);
          if (Demo.onChange) Demo.onChange();
          // 늦게 들어온 봇도 지금 단계에 맞는 일을 하도록
          if (bot && Demo.done.vote) setTimeout(function () { doVote(bot); }, rnd(300, 2500));
          if (bot && Demo.done.plan) setTimeout(function () { doPlan(bot); }, rnd(500, 3500));
          if (bot && Demo.done.rank) setTimeout(function () { doRank(bot); }, rnd(400, 3000));
          if (bot && Demo.done.result) setTimeout(function () { doResult(bot); }, rnd(500, 4000));
          if (bot && Demo.done.note) setTimeout(function () { doNote(bot); }, rnd(500, 3500));
        }, 200 + k * 420);
        Demo.timers.push(t);
      })(i);
    }
    done && done(null);
  };

  /** 데모 끝. 봇이 남긴 것을 지우고 빠진다. */
  Demo.stop = function () {
    if (!Demo.running) return;
    Demo.running = false;
    (Demo.timers || []).forEach(clearTimeout);
    Demo.timers = [];
    Demo.bots.forEach(function (bot) {
      try {
        send(bot, 'leave', { token: bot.token });
        // 지워 달라는 말이 서버에 닿은 뒤에 끊는다
        setTimeout(function () { try { bot.ws.close(); } catch (e) { /* 무시 */ } }, 400);
      } catch (e) { /* 무시 */ }
    });
    Demo.bots = [];
    Demo.done = {};
    // 소켓이 미처 못 보냈을 수 있으므로 교사 연결로 한 번 더 지운다
    if (global.Live && Live.ready) setTimeout(function () { Live.reset('demo'); }, 600);
    if (Demo.onChange) Demo.onChange();
  };

  Demo.count = function () { return Demo.bots.length; };
  Demo.total = COUNT;

  // 창을 닫거나 새로고침해도 봇이 남지 않도록.
  // 이때는 늦게 도는 타이머가 살아남지 못하므로 바로 보내고 끊는다.
  global.addEventListener('pagehide', function () {
    if (!Demo.running) return;
    Demo.running = false;
    (Demo.timers || []).forEach(clearTimeout);
    Demo.bots.forEach(function (bot) {
      try { send(bot, 'leave', { token: bot.token }); bot.ws.close(); } catch (e) { /* 무시 */ }
    });
    try { if (global.Live && Live.ready) Live.reset('demo'); } catch (e) { /* 무시 */ }
  });

  global.Demo = Demo;

})(window);
