/* ==========================================================================
   Night Code 1395 — 발표자 뽑기 사다리 타기 (단계 10)
   참가는 코드로 참여 중인 학급 전체가 닉네임만으로 한다(로그인 없음).
   교사가 뽑을 인원을 고르고 [시작]을 누르면 그 순간의 인원으로 사다리가
   정해지고, 교사 화면에서만 천천히 타는 과정을 보여 준 뒤, 끝나면 학생
   화면에도 결과가 뜬다 — 결과 자체는 시작하는 순간 서버에서 이미 정해져
   있고, 교사 화면의 연출이 끝나야 "공개"로 넘어간다.
   ========================================================================== */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /** 발표자 색 — 인원 순서대로 돌려 쓴다(서버 LADDER_WINNERS_MAX 와 맞춘다) */
  var WINNER_COLORS = ['var(--accent)', 'var(--ok)', 'var(--warn)', 'var(--danger)'];
  var WINNERS_MAX = WINNER_COLORS.length;

  function el(tag, cls, parent, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function sv(tag, parent, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function $(id) { return document.getElementById(id); }

  var Ladder = {
    built: false,
    mine: false,        // 이 기기가 참가했다고 알고 있는가(새로고침하면 잊는다)
    animatedFor: null,   // 이미 애니메이션을 재생한 판을 가려내는 표시
    count: 1             // 교사가 고른, 뽑을 발표자 수
  };

  /* ---------- 정적 요소 연결(한 번만) ---------- */
  Ladder.build = function () {
    if (Ladder.built) return;
    Ladder.built = true;

    $('btnLadderJoin').addEventListener('click', function () {
      var nick = (global.Live && Live.nick) || '';
      if (!nick) { App.toast('먼저 닉네임으로 수업에 참여해 주세요.'); return; }
      Live.sendLadderJoin(nick, function (err) {
        if (err) { App.toast(err); return; }
        Ladder.mine = true;
        Ladder.render();
      });
    });
    $('btnLadderLeave').addEventListener('click', function () {
      Live.sendLadderLeave(function (err) {
        if (!err) { Ladder.mine = false; Ladder.render(); }
      });
    });
    $('btnLadderCountDown').addEventListener('click', function () {
      Ladder.count = Math.max(1, Ladder.count - 1);
      Ladder.render();
    });
    $('btnLadderCountUp').addEventListener('click', function () {
      Ladder.count = Math.min(WINNERS_MAX, Ladder.count + 1);
      Ladder.render();
    });
    $('btnLadderStart').addEventListener('click', function () {
      $('btnLadderStart').disabled = true;
      Live.sendLadderStart(Ladder.count, function (err) {
        if (err) { App.toast(err); $('btnLadderStart').disabled = false; }
        else Ladder.render();
      });
    });
    $('btnLadderReset').addEventListener('click', function () {
      if (!confirm('참가자를 모두 내리고 다시 뽑을까요?')) return;
      Ladder.animatedFor = null;
      Ladder.mine = false;
      Live.send('reset', { what: 'ladder' }, function () { Ladder.render(); });
    });
  };

  /* ---------- 참가 칸 ---------- */
  function renderJoin(L, isHost) {
    var names = $('ladderNames');
    names.innerHTML = '';
    var slots = (L && L.slots) || [];
    // 참가자가 아무도 없으면(막 리셋됐다면) 내 기억도 함께 지운다.
    // 안 그러면 리셋 뒤에도 "이미 참가했다"고 잘못 알아 다시 낄 수 없다.
    if (!slots.length && !(L && L.started)) Ladder.mine = false;
    slots.forEach(function (nick) { el('span', 'ladder-chip', names, nick); });
    $('ladderCount').textContent = slots.length
      ? slots.length + '명 참가'
      : '아직 참가자가 없습니다.';

    var started = !!(L && L.started);
    $('ladderJoinForm').hidden = isHost || started || Ladder.mine;
    $('ladderMyNick').textContent = (global.Live && Live.nick) || '—';
    $('btnLadderLeave').hidden = isHost || started || !Ladder.mine;

    $('ladderHostStart').hidden = !isHost || started;
    // 뽑을 인원은 참가자보다 적어야 뜻이 있고, 색을 구분할 수 있는 만큼만 허용한다
    var maxWin = Math.max(1, Math.min(WINNERS_MAX, slots.length - 1));
    if (Ladder.count > maxWin) Ladder.count = maxWin;
    $('ladderWinCount').textContent = Ladder.count;
    $('btnLadderCountDown').disabled = Ladder.count <= 1;
    $('btnLadderCountUp').disabled = Ladder.count >= maxWin;
    $('btnLadderStart').disabled = slots.length < 2;
  }

  /* ---------- 사다리 그리기 ---------- */
  // 세로줄 사이 간격(뷰박스 단위). 인원이 늘어도 이 간격은 그대로 두고
  // 가로 폭을 늘려서, 이름표가 서로 겹치지 않고 사다리가 옆으로 넓어지게 한다.
  var COL_UNIT = 18;
  var GEOM = { top: 14, bottom: 86 };

  function vbWidth(n) { return Math.max(100, n * COL_UNIT); }

  /** 줄 순서대로 지나며, 각 시작 칸이 어디를 거쳐 가는지 (row, col) 좌표를 모은다 */
  function tracePath(rungs, start) {
    var pts = [];
    var pos = start;
    var rows = rungs.length;
    pts.push({ row: 0, col: pos });
    for (var r = 0; r < rows; r++) {
      var row = rungs[r];
      for (var i = 0; i < row.length; i++) {
        var g = row[i];
        if (pos === g) { pos = g + 1; break; }
        if (pos === g + 1) { pos = g; break; }
      }
      pts.push({ row: r + 1, col: pos });
    }
    return pts;
  }

  function colX(w, n, c) { return (c + 0.5) * (w / n); }
  function rowY(rows, r) { return GEOM.top + (r / rows) * (GEOM.bottom - GEOM.top); }

  /** 뼈대(세로줄 + 이름표)만 그린다. 가로줄은 나중에 하나씩 더한다. */
  function drawSkeleton(host, L) {
    host.innerHTML = '';
    var n = L.slots.length, w = vbWidth(n);
    var svg = sv('svg', host, {
      viewBox: '0 0 ' + w + ' 100', class: 'ladder-svg',
      role: 'img', 'aria-label': '발표자 뽑기 사다리'
    });
    for (var c = 0; c < n; c++) {
      var x = colX(w, n, c);
      sv('line', svg, {
        x1: x, y1: GEOM.top, x2: x, y2: GEOM.bottom,
        class: 'ladder-rail'
      });
      var top = sv('text', svg, {
        x: x, y: GEOM.top - 3, class: 'ladder-label ladder-label-top', id: 'ladderTop' + c
      });
      top.textContent = L.slots[c];
      var bot = sv('text', svg, {
        x: x, y: GEOM.bottom + 7, class: 'ladder-label ladder-label-bottom',
        id: 'ladderBottom' + c
      });
      bot.textContent = '';
    }
    return svg;
  }

  /** 가로줄을 위에서부터 순서대로, 살짝 시간을 두고 하나씩 보여 준다 */
  function revealRungs(svg, L, done) {
    var n = L.slots.length, w = vbWidth(n), rows = L.rungs.length;
    var jobs = [];
    L.rungs.forEach(function (row, r) {
      row.forEach(function (g) {
        jobs.push({ y: rowY(rows, r), x1: colX(w, n, g), x2: colX(w, n, g + 1) });
      });
    });
    var i = 0;
    var perStep = Math.max(35, Math.min(110, 1100 / Math.max(1, jobs.length)));
    (function next() {
      if (i >= jobs.length) { if (done) done(); return; }
      var j = jobs[i++];
      var line = sv('line', svg, {
        x1: j.x1, y1: j.y, x2: j.x2, y2: j.y, class: 'ladder-rail ladder-rung'
      });
      requestAnimationFrame(function () { line.classList.add('is-in'); });
      setTimeout(next, perStep);
    })();
  }

  /** 당첨된 출발점들의 경로를 색을 나눠 그리며 위에서 아래로 훑어 내려간다(동시에) */
  function traceWinners(svg, L, done) {
    var n = L.slots.length, w = vbWidth(n), rows = L.rungs.length;
    L.winners.forEach(function (start, i) {
      var color = WINNER_COLORS[i % WINNER_COLORS.length];
      var pts = tracePath(L.rungs, start);
      var d = pts.map(function (p, j) {
        return (j === 0 ? 'M' : 'L') + colX(w, n, p.col) + ',' + rowY(rows, p.row);
      }).join(' ');
      var path = sv('path', svg, { d: d, class: 'ladder-trace' });
      path.style.stroke = color;
      path.style.filter = 'drop-shadow(0 0 3px ' + color + ')';
      var len = path.getTotalLength ? path.getTotalLength() : 200;
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      var top = document.getElementById('ladderTop' + start);
      if (top) { top.classList.add('is-winner'); top.style.fill = color; }
      requestAnimationFrame(function () {
        path.style.transition = 'stroke-dashoffset 1.5s ease-in-out';
        path.style.strokeDashoffset = '0';
      });
      var bottomCol = pts[pts.length - 1].col;
      setTimeout(function () {
        var bot = document.getElementById('ladderBottom' + bottomCol);
        if (bot) { bot.textContent = '발표자'; bot.classList.add('is-winner'); bot.style.fill = color; }
      }, 1600);
    });
    setTimeout(function () { if (done) done(); }, 1600);
  }

  /** 애니메이션 없이 완성된 사다리를 한 번에 그린다(학생 화면·새로고침 후 교사 화면용) */
  function drawFinal(host, L) {
    var svg = drawSkeleton(host, L);
    var n = L.slots.length, w = vbWidth(n), rows = L.rungs.length;
    L.rungs.forEach(function (row, r) {
      row.forEach(function (g) {
        sv('line', svg, {
          x1: colX(w, n, g), y1: rowY(rows, r), x2: colX(w, n, g + 1), y2: rowY(rows, r),
          class: 'ladder-rail is-in'
        });
      });
    });
    L.winners.forEach(function (start, i) {
      var color = WINNER_COLORS[i % WINNER_COLORS.length];
      var pts = tracePath(L.rungs, start);
      var d = pts.map(function (p, j) {
        return (j === 0 ? 'M' : 'L') + colX(w, n, p.col) + ',' + rowY(rows, p.row);
      }).join(' ');
      var path = sv('path', svg, { d: d, class: 'ladder-trace is-done' });
      path.style.stroke = color;
      path.style.filter = 'drop-shadow(0 0 3px ' + color + ')';
      var top = document.getElementById('ladderTop' + start);
      if (top) { top.classList.add('is-winner'); top.style.fill = color; }
      var bottomCol = pts[pts.length - 1].col;
      var bot = document.getElementById('ladderBottom' + bottomCol);
      if (bot) { bot.textContent = '발표자'; bot.classList.add('is-winner'); bot.style.fill = color; }
    });
  }

  function showResult(L, isHost) {
    $('ladderResultBox').hidden = false;
    var names = L.winners.map(function (i) { return L.slots[i]; }).filter(Boolean);
    $('ladderWinnerName').textContent = names.join(' · ') || '—';
    $('btnLadderReset').hidden = !isHost;   // 다시 뽑기는 교사만
  }

  /* ---------- 전체 갱신 ---------- */
  Ladder.render = function () {
    var host = $('ladderCard');
    if (!host) return;
    var live = global.Live && Live.code;
    $('ladderNoLive').hidden = !!live;
    $('ladderBody').hidden = !live;
    if (!live) return;

    var L = Live.work && Live.work.ladder;
    var isHost = Live.role === 'host';

    renderJoin(L, isHost);

    var stage = $('ladderStage');
    var wait = $('ladderWait');
    var svgHost = $('ladderSvgHost');

    if (!L || !L.started) {
      stage.hidden = true;
      $('ladderResultBox').hidden = true;
      return;
    }
    stage.hidden = false;

    var sig = L.slots.length + ':' + L.winners.join(',') + ':' + JSON.stringify(L.rungs);

    if (!L.revealed) {
      $('ladderResultBox').hidden = true;
      if (isHost) {
        wait.hidden = true;
        if (Ladder.animatedFor !== sig) {
          Ladder.animatedFor = sig;
          var svg = drawSkeleton(svgHost, L);
          revealRungs(svg, L, function () {
            setTimeout(function () {
              traceWinners(svg, L, function () {
                showResult(L, isHost);
                Live.sendLadderReveal();
              });
            }, 300);
          });
        }
      } else {
        svgHost.innerHTML = '';
        wait.hidden = false;
      }
      return;
    }

    // 공개됨
    wait.hidden = true;
    if (Ladder.animatedFor !== sig || !svgHost.firstChild) {
      Ladder.animatedFor = sig;
      drawFinal(svgHost, L);
    }
    showResult(L, isHost);
  };

  global.Ladder = Ladder;

})(window);
