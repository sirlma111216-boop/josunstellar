/* ==========================================================================
   Night Code 1395 — 10단계(2차시) 수업 진행 controller
   교사가 화면을 순서대로 넘기면 그것이 곧 수업이 되도록 만든다.
   ========================================================================== */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* 단계별 소단계 수 */
  var SUBS = { 1: 2, 2: 3, 3: 6, 4: 1, 5: 6, 6: 1, 7: 7, 8: 2, 9: 3, 10: 1 };
  var LAST = 10;

  /* 심화 화면 — [다음]/[이전] 으로는 건너뛰고, 교사가 눌러야 들어간다.
     성취기준 해설이 수식 도입을 배제하므로 포그슨 규칙을 여기로 돌렸다. */
  var DEEP = { 7: [6] };
  function isDeep(n, sub) { return (DEEP[n] || []).indexOf(sub) >= 0; }

  var Steps = { step: 1, sub: 1, built: {} };

  function el(tag, cls, parent, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function svg(tag, parent, attrs, text) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    }
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function $(id) { return document.getElementById(id); }
  function section(n) { return document.querySelector('.step[data-step="' + n + '"]'); }

  /* ==========================================================================
     초기화
     ========================================================================== */
  Steps.init = function () {
    // 단계 표시줄
    var bar = $('stepbar');
    STEP_LABELS.forEach(function (s) {
      // 1차시와 2차시 사이에 선을 하나 넣는다
      if (s.first) {
        var gap = el('span', 'sb-split', bar);
        gap.setAttribute('aria-hidden', 'true');
        el('span', 'sb-split-txt', gap, '2차시');
      }
      var b = el('button', 'sb-item', bar);
      b.type = 'button';
      b.dataset.step = s.n;
      b.dataset.period = s.period;
      b.title = s.n + '. ' + s.long;
      el('span', 'sb-num', b, String(s.n));
      el('span', 'sb-label', b, s.short);
      b.addEventListener('click', function () { Steps.go(s.n); });
    });

    // 학급 참여는 첫 화면에 있지만, 어느 단계로 이어서 들어와도 연결은 살아 있어야 한다
    buildLive();

    // 친구가 새로 올리면 보고 있는 화면을 그 자리에서 갱신한다
    if (global.Live) {
      Live.onWork = function () {
        if (Steps.step === 5 && Steps.sub === 3) renderPlanBox();
        if ((Steps.step === 5 && Steps.sub === 4) ||
            (Steps.step === 7 && Steps.sub === 7)) renderRankTally();
        if (Steps.step === 6) renderRecap();
        if (Steps.step === 8 && Steps.sub === 2) renderMeasureProgress();
        if (Steps.step === 9 && Steps.sub === 3) {
          renderScope();
          if (Steps.scopeClass && Steps.chart2) {
            Steps.chart2.opts.classPts = classPoints();
            Steps.chart2.setClassOn(true);
          }
        }
        if (Steps.step === 10 && !$('conclusionReveal').hidden) renderNotes();
      };
    }

    $('btnPrev').addEventListener('click', Steps.prev);
    $('btnNext').addEventListener('click', Steps.next);

    // 건너뛰기 버튼 (설명 중심 화면)
    var skips = document.querySelectorAll('[data-skip]');
    for (var i = 0; i < skips.length; i++) {
      skips[i].addEventListener('click', function () {
        Steps.go(Math.min(LAST, Steps.step + 1));
      });
    }

    // 이어서 하기
    var saved = State.data;
    Steps.go(saved.step || 1, (saved.sub && saved.sub[saved.step]) || 1, true);
  };

  /* ==========================================================================
     이동
     ========================================================================== */
  /* 학생 화면이 교사를 따라 움직이는 중인가.
     이때는 다시 서버로 되돌려 보내지 않는다(메아리 방지). */
  var followingNow = false;

  Steps.go = function (n, sub, silent) {
    n = Math.max(1, Math.min(LAST, n));
    sub = Math.max(1, Math.min(SUBS[n] || 1, sub || 1));
    Steps.step = n;
    Steps.sub = sub;

    // 교사가 넘기면 참여한 학생 화면도 같이 넘어간다
    if (!followingNow && window.Live && Live.role === 'host') Live.setStage(n, sub);
    // 데모봇도 그 단계에 맞는 일을 한다
    if (window.Demo && Demo.running) Demo.onStage(n, sub);

    // 화면 전환
    var all = document.querySelectorAll('.step');
    for (var i = 0; i < all.length; i++) {
      all[i].hidden = Number(all[i].dataset.step) !== n;
    }
    Steps.showSub(n, sub);

    // 표시줄
    var items = document.querySelectorAll('.sb-item');
    for (var j = 0; j < items.length; j++) {
      var k = Number(items[j].dataset.step);
      items[j].classList.toggle('is-now', k === n);
      items[j].classList.toggle('is-done', k < n);
      items[j].setAttribute('aria-current', k === n ? 'step' : 'false');
      // 표시줄이 가로로 넘칠 때 지금 단계가 보이도록 끌어온다
      if (k === n && items[j].scrollIntoView) {
        items[j].scrollIntoView({ block: 'nearest', inline: 'center' });
      }
    }

    // 이동 버튼
    $('btnPrev').disabled = (n === 1 && sub === 1);
    var atEnd = (n === LAST && sub === (SUBS[n] || 1));
    $('btnNext').disabled = atEnd;
    var label = STEP_LABELS[n - 1];
    $('navWhere').textContent =
      n + '/' + LAST + ' · ' + label.long + (SUBS[n] > 1 ? ' (' + sub + '/' + SUBS[n] + ')' : '');


    // 단계별 준비
    Steps.enter(n, sub);

    // 저장
    State.data.step = n;
    State.data.sub[n] = sub;
    if (!silent) State.save();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  Steps.showSub = function (n, sub) {
    var host = section(n);
    if (!host) return;
    // 소단계 블록이 단계 2처럼 두 단 레이아웃 안에 들어가 있을 수도 있으므로
    // 직계 자식만 보지 말고 단계 안의 .sub 를 모두 찾는다.
    var subs = host.querySelectorAll('.sub');
    for (var i = 0; i < subs.length; i++) {
      subs[i].hidden = Number(subs[i].dataset.sub) !== sub;
    }
  };

  Steps.next = function () {
    var n = Steps.step, sub = Steps.sub;
    do {
      if (sub < (SUBS[n] || 1)) sub++;
      else if (n < LAST) { n++; sub = 1; }
      else return;
    } while (isDeep(n, sub));      // 심화는 건너뛴다
    Steps.go(n, sub);
  };

  Steps.prev = function () {
    var n = Steps.step, sub = Steps.sub;
    do {
      if (sub > 1) sub--;
      else if (n > 1) { n--; sub = SUBS[n] || 1; }
      else return;
    } while (isDeep(n, sub));
    Steps.go(n, sub);
  };

  /* ==========================================================================
     단계별 준비 — 처음 들어올 때 한 번만 만들고, 이후에는 값만 갱신
     ========================================================================== */
  Steps.enter = function (n, sub) {
    App.lazyLoadVisible();
    switch (n) {
      case 1: build1(sub); break;
      case 2: build2(sub); break;
      case 3: build3(sub); break;
      case 4: build4(); break;
      case 5: build5(sub); break;
      case 6: build6(); break;
      case 7: build7(sub); break;
      case 8: build8(sub); break;
      case 9: build9(sub); break;
      case 10: build10(); break;
    }
  };

  /* ---------- 단계 1. 인트로 ---------- */
  function build1(sub) {
    var stage = $('introStage');
    if (!Steps.built[1]) {
      Steps.built[1] = true;
      stage.addEventListener('click', function () {
        stage.classList.add('show-all');   // 누르면 전부 바로 표시
      });
      $('btnStart').addEventListener('click', function () { Steps.go(1, 2); });
      var bg = $('introBg');
      bg.style.backgroundImage = 'url("' + IMAGES.full.src + '")';
    }
    // 장면 1 에 들어올 때만 처음부터 재생한다
    if (sub !== 1) return;
    stage.classList.remove('play', 'show-all');
    void stage.offsetWidth;             // 애니메이션 재시작
    stage.classList.add('play');
  }

  /* ==========================================================================
     단계 2. 고천문학
     ========================================================================== */

  /** 고천문학이 다루는 자료들 */
  var GA_ITEMS = [
    { icon: 'map',   name: '옛 천문도',        what: '돌이나 종이에 그려 둔 별지도' },
    { icon: 'sun',   name: '일식·월식 기록',   what: '언제 해와 달이 가려졌는지 적어 둔 글' },
    { icon: 'brush', name: '옛 그림 속 하늘',  what: '그림에 그려 넣은 달과 별' },
    { icon: 'name',  name: '별자리 이름',      what: '그 시대 사람들이 별을 부르던 말' }
  ];

  /** 자료 종류마다 작은 그림을 코드로 그린다 */
  function gaIcon(kind) {
    var g = svg('svg', null, { viewBox: '0 0 48 48', class: 'ga-icon', 'aria-hidden': 'true' });
    var C = 'var(--accent)';
    if (kind === 'map') {
      svg('circle', g, { cx: 24, cy: 24, r: 15, fill: 'none', stroke: C, 'stroke-width': 2 });
      [[18, 18], [30, 20], [24, 30], [33, 29], [15, 28]].forEach(function (p) {
        svg('circle', g, { cx: p[0], cy: p[1], r: 2, fill: C });
      });
    } else if (kind === 'sun') {
      svg('circle', g, { cx: 24, cy: 24, r: 11, fill: 'none', stroke: C, 'stroke-width': 2 });
      svg('path', g, { d: 'M13 24a11 11 0 0 1 22 0z', fill: C, opacity: .55 });
    } else if (kind === 'brush') {
      svg('path', g, { d: 'M14 34c6-2 9-6 12-12s6-9 8-8-1 5-6 11-9 8-14 9z',
        fill: 'none', stroke: C, 'stroke-width': 2, 'stroke-linejoin': 'round' });
      svg('circle', g, { cx: 33, cy: 15, r: 2.5, fill: C });
    } else {
      svg('path', g, { d: 'M24 10l3.6 7.4 8 1.2-5.8 5.7 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.8-5.7 8-1.2z',
        fill: 'none', stroke: C, 'stroke-width': 2, 'stroke-linejoin': 'round' });
    }
    return g;
  }

  function build2(sub) {
    if (!Steps.built[2]) {
      Steps.built[2] = true;
      var grid = $('gaGrid');
      GA_ITEMS.forEach(function (it) {
        var card = el('div', 'ga-card', grid);
        card.appendChild(gaIcon(it.icon));
        el('b', 'ga-name', card, it.name);
        el('span', 'ga-what', card, it.what);
      });
      wireVideo('btnAstroVideo', 'astroVideoBox', 'astroVideoNone', 'videoAstro',
                '고천문학자 소개 영상');
    }
    if (sub === 3) showVideoState('btnAstroVideo', 'astroVideoNone', 'videoAstro');
  }

  /* ==========================================================================
     영상 — 누르기 전에는 부르지 않는다.
     주소는 교사가 설정에서 넣는다(비어 있으면 안내만 띄운다).
     ========================================================================== */

  /** 유튜브 주소에서 영상 id 만 뽑는다 */
  function ytId(url) {
    var s = String(url || '').trim();
    if (!s) return '';
    var m = s.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,20})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{6,20}$/.test(s)) return s;   // id 만 적어도 받아 준다
    return '';
  }

  function showVideoState(btnId, noneId, key) {
    var id = ytId(Config.get('media.' + key, ''));
    var btn = $(btnId), none = $(noneId);
    if (!btn || !none) return;
    btn.hidden = !id;
    none.hidden = !!id;
  }

  function wireVideo(btnId, boxId, noneId, key, title) {
    var btn = $(btnId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var id = ytId(Config.get('media.' + key, ''));
      if (!id) return;
      var box = $(boxId);
      box.innerHTML = '';
      var fr = document.createElement('iframe');
      fr.src = 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&modestbranding=1';
      fr.title = title;
      fr.loading = 'lazy';
      fr.allow = 'accelerometer; encrypted-media; picture-in-picture; fullscreen';
      fr.allowFullscreen = true;
      fr.referrerPolicy = 'strict-origin-when-cross-origin';
      box.appendChild(fr);
    });
    showVideoState(btnId, noneId, key);
  }

  /* ==========================================================================
     단계 5-3. 가설 세우기
     ========================================================================== */

  function buildHypo() {
    var why = $('hypoWhy'), how = $('hypoHow');
    why.value = State.data.hypoWhy || '';
    how.value = State.data.hypoHow || '';
    why.addEventListener('input', function () { State.data.hypoWhy = why.value; State.save(); });
    how.addEventListener('input', function () { State.data.hypoHow = how.value; State.save(); });
    [why, how].forEach(function (inp) {
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') $('btnHypoSend').click();
      });
    });

    $('btnHypoSend').addEventListener('click', function () {
      var m = $('hypoMsg');
      if (!State.data.prediction) {
        m.hidden = false; m.className = 'hypo-msg is-bad';
        m.textContent = '먼저 위에서 예상을 하나 골라 주세요.';
        return;
      }
      State.data.hypoSent = true;
      State.save();
      $('predictAfter').hidden = false;
      if (global.Live && Live.ready && Live.role === 'guest') {
        Live.sendPlan(State.data.hypoWhy, State.data.hypoHow, function (err) {
          m.hidden = false;
          m.className = 'hypo-msg ' + (err ? 'is-bad' : 'is-ok');
          m.textContent = err ? '보내지 못했습니다. 내 가설은 그대로 남아 있습니다.' : '가설을 냈습니다!';
        });
      } else {
        m.hidden = false; m.className = 'hypo-msg is-ok';
        m.textContent = '가설을 냈습니다!';
      }
    });
  }

  /** 교사 화면에만 — 학생들이 적은 확인 방법 */
  function renderPlanBox() {
    var box = $('planBox');
    if (!box) return;
    var isHost = global.Live && Live.role === 'host' && Live.code;
    box.hidden = !isHost;
    if (!isHost) return;
    var plans = ((global.Live && Live.work && Live.work.plans) || [])
      .filter(function (p) { return p.how; });
    var list = $('planList');
    list.innerHTML = '';
    if (!plans.length) {
      el('p', 'muted tiny', list, '아직 올라온 방법이 없습니다.');
      return;
    }
    plans.forEach(function (p) {
      var row = el('div', 'plan-row', list);
      el('span', 'plan-nick', row, p.nick || '익명');
      el('span', 'plan-how', row, p.how);
    });
  }

  /** 1차시 마무리에 내가 세운 가설을 다시 보여 준다 */
  function renderMyHypo() {
    var host = $('myHypoBody');
    if (!host) return;
    host.innerHTML = '';
    var label = State.predictionLabel();
    if (!label && !State.data.hypoWhy && !State.data.hypoHow) {
      el('p', 'muted', host, '이번 시간에 가설을 내지 않았습니다. 단계 5로 돌아가면 낼 수 있습니다.');
      return;
    }
    var rows = [
      ['예상', label || '(고르지 않음)'],
      ['그렇게 생각한 까닭', State.data.hypoWhy || '(쓰지 않음)'],
      ['확인할 방법', State.data.hypoHow || '(쓰지 않음)']
    ];
    rows.forEach(function (r) {
      var row = el('div', 'mine-row', host);
      el('span', 'mine-key', row, r[0]);
      el('span', 'mine-val', row, r[1]);
    });
  }

  /* ==========================================================================
     단계 6. 월하정인 — 2차시 도입
     ========================================================================== */

  var MOON_CHOICES = [
    { key: 'no',    label: '떠 있을 수 없다' },
    { key: 'yes',   label: '떠 있을 수 있다' },
    { key: 'dunno', label: '잘 모르겠다' }
  ];

  /** 초승달·그믐달을 코드로 그려 나란히 놓는다 */
  function moonShape(dir, caption) {
    var wrap = el('div', 'ms-item', null);
    var g = svg('svg', wrap, { viewBox: '0 0 80 80', class: 'ms-svg', 'aria-hidden': 'true' });
    svg('circle', g, { cx: 40, cy: 40, r: 30, fill: '#0b1330' });
    // 큰 원에서 살짝 어긋난 원을 빼면 초승달 모양이 남는다
    var id = 'mcut' + dir;
    var defs = svg('defs', g, {});
    var mask = svg('mask', defs, { id: id });
    svg('circle', mask, { cx: 40, cy: 40, r: 30, fill: '#fff' });
    svg('circle', mask, { cx: 40 + (dir === 'left' ? 13 : -13), cy: 40, r: 27, fill: '#000' });
    svg('circle', g, { cx: 40, cy: 40, r: 30, fill: 'var(--accent)', mask: 'url(#' + id + ')' });
    el('span', 'ms-cap', wrap, caption);
    return wrap;
  }

  function build6() {
    if (!Steps.built[6]) {
      Steps.built[6] = true;

      var shapes = $('moonShapes');
      shapes.appendChild(moonShape('left', '초승달 — 오른쪽이 밝다'));
      shapes.appendChild(moonShape('right', '그믐달 — 왼쪽이 밝다'));

      var host = $('moonBtns');
      MOON_CHOICES.forEach(function (c) {
        var b = el('button', 'predict-btn', host);
        b.type = 'button';
        b.dataset.key = c.key;
        el('span', 'pb-label', b, c.label);
        b.addEventListener('click', function () {
          State.data.moonGuess = c.key;
          State.save();
          markMoon();
        });
      });
      var why = $('moonWhy');
      why.value = State.data.moonWhy || '';
      why.addEventListener('input', function () { State.data.moonWhy = why.value; State.save(); });

      wireVideo('btnMoonVideo', 'moonVideoBox', 'moonVideoNone', 'videoMoon', '월하정인 관련 영상');

      // 그림은 교사가 넣는다. 없으면 안내만 띄운다.
      var img = $('moonImg');
      img.addEventListener('error', function () {
        img.style.display = 'none';
        $('moonImgNone').hidden = false;
      });
      var src = Config.get('media.moonImage', 'assets/moon.jpg');
      img.removeAttribute('data-src');
      img.src = src;
    }
    markMoon();
    renderRecap();
    showVideoState('btnMoonVideo', 'moonVideoNone', 'videoMoon');
  }

  function markMoon() {
    var bs = $('moonBtns').querySelectorAll('.predict-btn');
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].dataset.key === State.data.moonGuess;
      bs[i].classList.toggle('is-picked', on);
      var mark = bs[i].querySelector('.pb-mark');
      if (on && !mark) el('span', 'pb-mark', bs[i], '✓ 내가 고른 것');
      if (!on && mark) mark.remove();
    }
  }

  /** 2차시 첫 화면의 지난 시간 되짚기 */
  function renderRecap() {
    var t = $('recapTally');
    if (!t) return;
    t.innerHTML = '';
    var counts = (global.Live && Live.tally && Live.tally.counts) || {};
    var max = 1;
    PREDICTIONS.forEach(function (p) { max = Math.max(max, counts[p.key] || 0); });
    PREDICTIONS.forEach(function (p) {
      var row = el('div', 'tally-row', t);
      el('span', 'tally-name', row, p.label);
      var bar = el('div', 'tally-bar', row);
      el('div', 'tally-fill', bar).style.width = ((counts[p.key] || 0) / max * 100) + '%';
      if (State.data.prediction === p.key) row.classList.add('is-mine');
      el('span', 'tally-num', row, (counts[p.key] || 0) + '명');
    });

    var host = $('recapPlans');
    host.innerHTML = '';
    var plans = ((global.Live && Live.work && Live.work.plans) || [])
      .filter(function (p) { return p.how; }).slice(0, 4);
    if (!plans.length && State.data.hypoHow) plans = [{ nick: '나', how: State.data.hypoHow }];
    if (!plans.length) { el('p', 'muted tiny', host, '지난 시간에 적어 둔 방법이 없습니다.'); return; }
    plans.forEach(function (p) {
      var row = el('div', 'plan-row', host);
      el('span', 'plan-nick', row, p.nick || '익명');
      el('span', 'plan-how', row, p.how);
    });
  }

  /* ==========================================================================
     단계 7-5. 등급을 바꿔 보며 익히기
     ========================================================================== */

  function buildMagPlay() {
    var range = $('mpRange');
    if (!range) return;
    var sky = $('mpSky');

    // 심화 화면은 순서에서 건너뛰므로, 여기서만 들어갈 수 있다
    var deep = $('btnDeepMag');
    if (deep) deep.addEventListener('click', function () { Steps.go(7, 6); });

    // 배경 별 몇 개는 고정으로 깔아 둔다(비교 대상)
    for (var i = 0; i < 26; i++) {
      var d = el('span', 'mp-bg', sky);
      d.style.left = (4 + Math.random() * 92) + '%';
      d.style.top = (8 + Math.random() * 84) + '%';
      var r = 1 + Math.random() * 2;
      d.style.width = d.style.height = r + 'px';
      d.style.opacity = 0.25 + Math.random() * 0.4;
    }
    var star = el('span', 'mp-star', sky);

    function paint() {
      var mag = Number(range.value) / 10;
      $('mpValue').textContent = fmtMag(mag);   // 마이너스는 −(U+2212) 로
      // 등급 -1.5(밝음) ~ 6.0(겨우 보임) 을 크기와 밝기로 옮긴다
      var t = Math.max(0, Math.min(1, (6.0 - mag) / 7.5));
      var size = 4 + t * 46;
      star.style.width = star.style.height = size + 'px';
      star.style.opacity = (0.18 + t * 0.82).toFixed(2);
      star.style.boxShadow = '0 0 ' + (size * 1.5) + 'px ' + (size * 0.5) + 'px rgba(190,215,255,' + (t * 0.5).toFixed(2) + ')';

      var word = mag <= -1 ? '아주 밝은 별' : mag < 1 ? '밝은 별'
                : mag < 3 ? '보통' : mag < 5 ? '어두운 별' : '겨우 보이는 별';
      $('mpWord').textContent = word;
      $('mpHint').textContent = mag <= 0
        ? '0등급보다 밝으면 숫자가 마이너스로 내려갑니다.'
        : mag > 6
          ? '6등급을 넘으면 맨눈으로는 보이지 않습니다.'
          : '숫자가 작아질수록 별이 밝아집니다.';
    }
    range.addEventListener('input', paint);
    paint();
  }

  /* ---------- 단계 3. 지도 소개 ---------- */
  /* 이름을 한 글자씩 뜯어 보여 준다 */
  var NAME_PARTS = [
    { han: '天象', kor: '천상', mean: '하늘의 모습' },
    { han: '列次', kor: '열차', mean: '차례로 늘어놓다' },
    { han: '分野', kor: '분야', mean: '구역을 나누다' },
    { han: '之圖', kor: '지도', mean: '그린 그림' }
  ];

  /* 카드별 그림.
     사진과 상상도를 섞어 쓰므로, 상상해 그린 것은 설명에 그렇게 밝힌다.
     학생이 옛 사진으로 오해하면 안 되기 때문이다.

     ?v= 는 그림을 같은 이름으로 갈아 끼웠을 때 옛 그림이 남지 않게 하는 표시다.
     그림 파일은 7일 캐시라, 이 숫자를 올리지 않으면 이미 받아 간 기기에서
     최대 7일 동안 옛 그림이 그대로 보인다. 그림을 바꾸면 숫자를 올린다. */
  var PIC_V = '?v=2';
  var CARD_PICS = {
    1: { src: 'assets/chart_stone.jpg',
         cap: '돌에 새겨진 실물 — 천상열차분야지도 각석',
         alt: '천상열차분야지도 각석 — 돌에 새겨진 실물' },
    2: { src: 'assets/2-2.png' + PIC_V,
         cap: '바쳐진 탁본을 보고 돌에 새기게 하는 장면 — 상상하여 그린 그림',
         alt: '왕 앞에 천상열차분야지도 탁본이 펼쳐져 있고, 옆에서 석공들이 돌에 별을 새기고 있는 그림' },
    3: { src: 'assets/2-3.png' + PIC_V,
         cap: '1395년 하늘에 맞게 다시 계산하는 류방택 — 상상하여 그린 그림',
         alt: '밤에 별지도를 펴 놓고 붓으로 고쳐 그리는 조선 천문학자, 옆에 혼천의와 계산한 종이가 있는 그림' },
    4: { src: 'assets/chart_full.jpg',
         cap: '천상열차분야지도 전체 모습',
         alt: '천상열차분야지도 전체' },
    5: { src: 'assets/2-5.png' + PIC_V,
         cap: '방치되었던 태조의 원본, 1687년의 복각, 그리고 오늘날 — 상상하여 그린 그림',
         alt: '풀밭에 방치된 원본 돌, 1687년에 다시 새기는 장면, 박물관에 보존된 오늘날을 함께 보여 주는 그림' },
    6: { src: 'assets/chart_full.jpg',
         cap: '천상열차분야지도 전체 모습',
         alt: '천상열차분야지도 전체' }
  };

  /* 숫자로 보는 천상열차분야지도 */
  var STONE_FACTS = [
    { num: '1,467', unit: '개', what: '새겨진 별' },
    { num: '283', unit: '개', what: '별자리' },
    { num: '122.8 × 200.9', unit: 'cm', what: '돌 한 장의 크기' }
  ];

  function build3(sub) {
    if (!Steps.built[3]) {
      Steps.built[3] = true;
      // 카드 진행 점
      var dots = $('s2Dots');
      for (var i = 1; i <= SUBS[2]; i++) {
        var d = el('span', 'dot', dots);
        d.dataset.sub = i;
      }
      NAME_PARTS.forEach(function (p) {
        var chip = el('div', 'np-chip', $('s2Name'));
        el('span', 'np-han', chip, p.han);
        el('span', 'np-kor', chip, p.kor);
        el('span', 'np-mean', chip, p.mean);
      });
      STONE_FACTS.forEach(function (f) {
        var cell = el('div', 'num-cell', $('s2Nums'));
        var big = el('p', 'num-big', cell);
        el('b', null, big, f.num);
        el('span', 'num-unit', big, f.unit);
        el('p', 'num-what', cell, f.what);
      });
      buildBill($('billArt'));
    }
    var ds = $('s2Dots').querySelectorAll('.dot');
    for (var j = 0; j < ds.length; j++) {
      ds[j].classList.toggle('is-on', Number(ds[j].dataset.sub) === sub);
    }

    // 카드마다 그에 맞는 그림을 왼쪽에 놓는다.
    // ②③⑤ 는 그 장면을 상상해 그린 그림이고, 나머지는 실제 유물 사진이다.
    var img = $('s2Img'), cap = $('s2Cap');
    var want = CARD_PICS[sub] || CARD_PICS[1];
    if (img && img.getAttribute('data-src') !== want.src && img.src.indexOf(want.src) < 0) {
      img.removeAttribute('data-src');
      img.src = want.src;
      img.alt = want.alt;
      cap.textContent = want.cap;
    }
  }

  /** 만원권 뒷면 — 사진(assets/bill.png)이 있으면 사진, 없으면 코드로 그린 그림 */
  function buildBill(host) {
    var img = document.createElement('img');
    img.className = 'bill-photo';
    img.alt = '만원권 지폐 뒷면 — 혼천의와 천상열차분야지도';
    img.decoding = 'async';
    img.addEventListener('error', function () {
      img.remove();
      host.appendChild(buildBillArt());
    });
    img.src = IMAGES.bill.src;
    host.appendChild(img);
  }

  /** 사진이 없을 때 쓰는 대체 그림 */
  function buildBillArt() {
    var s = svg('svg', null, { viewBox: '0 0 300 130', class: 'bill-svg', role: 'img',
      'aria-label': '만원권 지폐 뒷면에 천상열차분야지도가 그려져 있습니다' });
    svg('rect', s, { x: 4, y: 4, width: 292, height: 122, rx: 8, fill: '#1f3b2e', stroke: '#7fd6a8', 'stroke-width': 1.5 });
    // 배경의 별지도 원
    svg('circle', s, { cx: 150, cy: 65, r: 46, fill: 'none', stroke: '#7fd6a8', 'stroke-width': 1, opacity: 0.55 });
    svg('circle', s, { cx: 150, cy: 65, r: 33, fill: 'none', stroke: '#7fd6a8', 'stroke-width': 0.8, opacity: 0.4 });
    for (var i = 0; i < 26; i++) {
      var a = i * 2 * Math.PI / 26;
      var r = 14 + (i % 4) * 8;
      svg('circle', s, { cx: 150 + Math.cos(a) * r, cy: 65 + Math.sin(a) * r, r: 1.6, fill: '#bff0d4', opacity: 0.85 });
    }
    // 혼천의 느낌의 고리
    svg('ellipse', s, { cx: 78, cy: 66, rx: 26, ry: 26, fill: 'none', stroke: '#cfe9d8', 'stroke-width': 2 });
    svg('ellipse', s, { cx: 78, cy: 66, rx: 10, ry: 26, fill: 'none', stroke: '#cfe9d8', 'stroke-width': 1.5 });
    svg('ellipse', s, { cx: 78, cy: 66, rx: 26, ry: 9, fill: 'none', stroke: '#cfe9d8', 'stroke-width': 1.5 });
    svg('text', s, { x: 246, y: 34, class: 'bill-num', 'text-anchor': 'middle' }, '10000');
    svg('text', s, { x: 150, y: 120, class: 'bill-cap', 'text-anchor': 'middle' }, '만원권 뒷면 — 혼천의와 별지도');
    return s;
  }

  /* ---------- 단계 3. 확대해 들어가기 ---------- */

  /** 확대할 영역 사각형을 설정값에 맞춘다 (캘리브레이션 중에도 실시간 반영) */
  Steps.refreshZoomRect = function () {
    var rect = $('zsRect');
    if (!rect) return;
    var reg = Config.get('zoomRegion', { x: 0.4, y: 0.5, w: 0.2, h: 0.2 });
    rect.style.left = (reg.x * 100) + '%';
    rect.style.top = (reg.y * 100) + '%';
    rect.style.width = (reg.w * 100) + '%';
    rect.style.height = (reg.h * 100) + '%';
  };

  function build4() {
    var inner = $('zsInner'), orion = $('zsOrion');
    var reg = Config.get('zoomRegion', { x: 0.4, y: 0.5, w: 0.2, h: 0.2 });
    Steps.refreshZoomRect();

    // 다시 들어오면 처음 상태로 되돌린다
    inner.style.transform = 'none';
    inner.classList.remove('zooming');
    orion.hidden = true;
    orion.classList.remove('shown');
    $('btnZoomIn').disabled = false;
    $('s3After').hidden = true;
    $('s3Lead').classList.remove('dim');

    if (!Steps.built[4]) {
      Steps.built[4] = true;
      $('btnZoomIn').addEventListener('click', function () {
        var r = Config.get('zoomRegion', reg);
        var cx = (r.x + r.w / 2) * 100, cy = (r.y + r.h / 2) * 100;
        var scale = Math.min(1 / r.w, 1 / r.h);
        inner.style.transformOrigin = cx + '% ' + cy + '%';
        inner.style.transform = 'scale(' + scale.toFixed(3) + ')';
        inner.classList.add('zooming');
        $('btnZoomIn').disabled = true;
        setTimeout(function () {
          orion.hidden = false;
          // rAF 는 화면이 가려져 있으면 미뤄질 수 있어 타이머로 확실히 켠다
          setTimeout(function () { orion.classList.add('shown'); }, 20);
        }, 1150);
        setTimeout(function () {
          $('s3After').hidden = false;
          $('s3Lead').classList.add('dim');
        }, 1700);
      });
    }
    App.lazyLoadVisible();
  }

  /* ---------- 단계 4. 두 지도 비교 ---------- */
  var TRIO_ZOOM = 1.7;

  function trioSize() {
    return Math.max(96, Math.min(150, Math.round(window.innerWidth * 0.26)));
  }

  function build5(sub) {
    if (sub === 3) { renderPlanBox(); renderTally(); }
    if (sub === 4) { renderRank(); renderRankTally(); }
    if (sub === 6) renderMyHypo();
    if (!Steps.built[5]) {
      Steps.built[5] = true;
      buildRankGame();
      buildHypo();

      // 장면 A / B 의 지도 (같은 크롭이라 같은 자리가 나온다)
      putImage($('s4aImg'), IMAGES.color, '종이에 그린 별지도(채색본)');
      putImage($('s4bImg'), IMAGES.orion, '돌에 새긴 별지도(각석본)');

      $('btnS4Answer').addEventListener('click', function () {
        $('s4bAnswer').hidden = false;
        $('btnS4Answer').hidden = true;
        $('s4bQuestion').classList.add('dim');
      });

      // 두 지도 겹쳐 보기
      new CompareView($('s4Compare'), {
        a: IMAGES.color, b: IMAGES.orion,
        aName: '종이(채색본)', bName: '돌(각석본)', cName: '실제 밤하늘'
      });

      // 예상 고르기
      buildPredict();

      /* 영상은 누르기 전까지 불러오지 않는다.
         30대가 한꺼번에 유튜브를 받으면 학교망이 버겁고,
         막혀 있는 학교에서는 어차피 뜨지 않기 때문이다. */
      $('btnVideoPlay').addEventListener('click', function () {
        var box = $('videoBox');
        box.innerHTML = '';
        var f = document.createElement('iframe');
        f.src = 'https://www.youtube-nocookie.com/embed/52jrmGFCUNQ?rel=0&modestbranding=1';
        f.title = '천상열차분야지도 소개 영상';
        f.loading = 'lazy';
        f.allow = 'accelerometer; encrypted-media; picture-in-picture; fullscreen';
        f.allowFullscreen = true;
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        box.appendChild(f);
      });
    }

    // 별 3개 확대 — 두 장면 모두 같은 좌표·같은 배율로
    if (sub === 1) renderTrio($('s4aTrio'), IMAGES.color);
    if (sub === 2) renderTrio($('s4bTrio'), IMAGES.orion);
    if (sub === 3) renderTally();
  }

  function putImage(host, im, alt) {
    host.innerHTML = '';
    var box = el('div', 'cs-frame', host);
    box.style.aspectRatio = im.w + ' / ' + im.h;
    var img = document.createElement('img');
    img.alt = alt; img.decoding = 'async'; img.draggable = false;
    img.className = 'cs-photo';
    var miss = missingBox(box, im.src);
    miss.hidden = true;
    img.addEventListener('error', function () { miss.hidden = false; img.style.visibility = 'hidden'; });
    img.src = im.src;
    box.insertBefore(img, miss);
  }

  function renderTrio(host, im) {
    // 별 목록이 바뀌어 없는 번호가 남아 있을 수 있으므로 유효한 별만 쓴다
    var ids = (Config.get('trioIds', [1, 5, 10]) || []).filter(function (id) { return !!starById(id); });
    if (!ids.length) ids = STARS.slice(0, 3).map(function (s) { return s.id; });
    var size = trioSize();
    host.innerHTML = '';
    ids.forEach(function (id) {
      var st = starById(id);
      if (!st) return;
      var pin = Config.get('pins.' + id, null) ||
                { x: st.px.x / IMAGES.orion.w, y: st.px.y / IMAGES.orion.h };
      // 채색본은 크롭이 달라 좌표를 옮겨야 같은 별이 나온다
      var q = (im.src === IMAGES.color.src) ? orionToColor(pin.x, pin.y) : { x: pin.x, y: pin.y };
      new StarZoom(host, {
        img: im, u: q.x, v: q.y,
        zoom: TRIO_ZOOM, size: size, label: st.kor
      });
    });
  }

  function buildPredict() {
    var host = $('predictBtns');
    PREDICTIONS.forEach(function (p) {
      var b = el('button', 'predict-btn', host);
      b.type = 'button';
      b.dataset.key = p.key;
      el('span', 'pb-label', b, p.label);
      b.addEventListener('click', function () {
        State.setPrediction(p.key);
        markPredict();
        $('predictAfter').hidden = false;
        if (Live.ready) Live.vote(p.key);   // 학급에 붙어 있으면 한 표 보낸다
        renderTally();
      });
    });
    markPredict();
    if (State.data.prediction) $('predictAfter').hidden = false;
  }

  /** 학급 투표 버튼들을 배선한다 */
  function buildLive() {
    if (!Live.available()) { $('liveBox').hidden = true; return; }

    function msg(text, bad) {
      var m = $('liveMsg');
      m.hidden = !text; m.textContent = text || '';
      m.classList.toggle('is-bad', !!bad);
    }

    $('btnOpenClass').addEventListener('click', function () {
      msg('수업을 여는 중…');
      Live.openClass(function (err) {
        if (err) { msg(err, true); return; }
        msg('');
        renderLive();
      });
    });

    $('btnJoinToggle').addEventListener('click', function () {
      var row = $('joinRow');
      row.hidden = !row.hidden;
      if (!row.hidden) {
        $('joinNick').value = Live.nick || '';   // 지난 시간에 쓰던 닉네임을 채워 준다
        $('joinCode').focus();
      }
    });

    $('btnJoin').addEventListener('click', function () {
      msg('참여하는 중…');
      Live.joinClass($('joinCode').value, $('joinNick').value, function (err) {
        if (err) { msg(err, true); return; }
        msg('');
        renderLive();
      });
    });
    ['joinCode', 'joinNick'].forEach(function (id) {
      $(id).addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') $('btnJoin').click();
      });
    });

    $('btnLeave').addEventListener('click', function () { Live.leave(); renderLive(); });

    // 데모봇 — 수업 전에 혼자 전체 흐름을 돌려 본다.
    // 교사만 쓰는 기능이라 학생 기기에서는 파일을 읽지 않고, 누를 때 가져온다.
    function withDemo(fn) {
      if (global.Demo) { fn(); return; }
      var sc = document.createElement('script');
      sc.src = 'assets/js/demo.js';
      sc.onload = function () { if (global.Demo) { Demo.onChange = renderDemo; fn(); } };
      sc.onerror = function () { msg('데모봇을 불러오지 못했습니다.', true); };
      document.head.appendChild(sc);
    }

    $('btnDemo').addEventListener('click', function () {
      if (global.Demo && Demo.running) { Demo.stop(); renderDemo(); return; }
      if (!Live.code) { msg('먼저 수업을 열어 주세요.', true); return; }
      if (Live.joined > 0) {
        var q = [
          '이미 ' + Live.joined + '명이 참여하고 있습니다.',
          '데모 학생이 섞이게 됩니다. 계속할까요?',
          '(멈추기를 누르면 데모 학생이 남긴 것은 모두 지워집니다)'
        ].join('\n');
        if (!confirm(q)) return;
      }
      withDemo(function () { Demo.start(Live.code); renderDemo(); });
    });

    // 학생: 잠시 혼자 움직이고 싶을 때 따라가기를 끈다
    $('btnFollow').addEventListener('click', function () {
      Live.setFollowing(!Live.following);
      // 다시 켜면 곧바로 선생님 화면으로 간다
      if (Live.following && Live.stage) applyStage(Live.stage);
      renderLive();
    });

    // 교사가 화면을 넘기면 학생 화면도 넘어간다
    Live.onStage = applyStage;
    $('btnResetVotes').addEventListener('click', function () {
      if (confirm('지금까지 모인 표를 모두 비울까요?')) Live.reset();
    });

    // 주소에 코드가 붙어 들어왔다면 참여 칸을 미리 열어 둔다
    if (Live.pendingCode) {
      $('joinRow').hidden = false;
      $('joinCode').value = Live.pendingCode;
      $('joinNick').value = Live.nick || '';
      msg('닉네임을 넣고 참여를 누르세요.');
    }

    // 서버에서 표·참여 상태가 오면 화면을 갱신한다
    Live.onChange(function () {
      // 수업 도중에 연 경우에도 학생들이 지금 화면으로 따라오도록 알린다
      if (Live.role === 'host' && Live.ready) Live.setStage(Steps.step, Steps.sub);
      renderLive();
    });
    renderLive();
  }

  /** 교사가 보고 있는 단계로 학생 화면을 옮긴다 */
  function applyStage(st) {
    if (!st || Live.role !== 'guest' || !Live.following) return;
    if (Steps.step === st.step && Steps.sub === st.sub) return;
    // 별을 재고 있는 중이라면 화면을 빼앗지 않는다. 창을 닫을 때 따라간다.
    if (document.body.classList.contains('modal-open')) { Steps.waitingStage = st; return; }
    followingNow = true;
    try { Steps.go(st.step, st.sub); }
    finally { followingNow = false; }
  }

  /** 측정 창을 닫았을 때, 밀린 단계가 있으면 그때 따라간다 */
  Steps.catchUp = function () {
    var st = Steps.waitingStage;
    Steps.waitingStage = null;
    if (st) applyStage(st);
  };

  function markPredict() {
    var bs = $('predictBtns').querySelectorAll('.predict-btn');
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].dataset.key === State.data.prediction;
      bs[i].classList.toggle('is-picked', on);
      // 색에만 기대지 않도록 체크 표시를 함께 쓴다
      var mark = bs[i].querySelector('.pb-mark');
      if (on && !mark) el('span', 'pb-mark', bs[i], '✓ 내가 고른 것');
      if (!on && mark) mark.remove();
    }
  }

  function renderTally() {
    var host = $('predictTally');
    if (!host) return;
    host.innerHTML = '';
    var counts = (Live.tally && Live.tally.counts) || {};
    var total = (Live.tally && Live.tally.total) || 0;
    var max = 1;
    PREDICTIONS.forEach(function (p) { max = Math.max(max, counts[p.key] || 0); });
    PREDICTIONS.forEach(function (p) {
      var row = el('div', 'tally-row', host);
      el('span', 'tally-name', row, p.label);
      var barWrap = el('div', 'tally-bar', row);
      var bar = el('div', 'tally-fill', barWrap);
      var v = counts[p.key] || 0;
      bar.style.width = (v / max * 100) + '%';
      if (State.data.prediction === p.key) row.classList.add('is-mine');
      el('span', 'tally-num', row, v + '명');
    });
    var joined = !!(Live.code && Live.ready);
    setText('tallyTotal', total);
    setText('liveTotal', Live.joined);
    var hint = $('tallyHint');
    if (hint) {
      hint.hidden = joined && total > 0;
      hint.textContent = joined
        ? '아직 아무도 고르지 않았습니다. 각자 기기에서 하나를 골라 주세요.'
        : '시작 화면에서 수업 코드로 참여하면, 반 전체의 예상이 여기에 모입니다.';
    }
  }

  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }

  /** 데모봇 버튼과 안내를 상태에 맞춰 바꾼다 */
  function renderDemo() {
    var b = $('btnDemo'), hint = $('demoHint');
    if (!b) return;
    if (global.Demo && Demo.running) {
      b.textContent = '데모 멈추기';
      b.classList.add('is-demo-on');
      hint.textContent = '데모 학생 ' + Demo.count() + '/' + Demo.total +
                         '명 · 화면을 넘기면 그 단계에 맞게 움직입니다';
    } else {
      b.textContent = '데모봇으로 시뮬레이션 하기';
      b.classList.remove('is-demo-on');
      hint.textContent = '수업 전에 혼자 전체 흐름을 돌려 볼 수 있습니다.';
    }
  }

  /**
   * 참여자 명단. 서버에서 오는 것은 닉네임뿐이다.
   * 이름표는 textContent 로만 넣어 입력한 글자가 태그로 읽히지 않게 한다.
   */
  function renderRoster(isHost) {
    var box = $('roster');
    var list = $('rosterList');
    var n = Live.members.length;
    box.hidden = false;
    var demoOn = !!(global.Demo && Demo.running);
    $('rosterCount').textContent = n
      ? '참여한 학생 ' + n + '명 (접속 ' + Live.online + '명)' +
        (demoOn ? ' · 데모 학생이 섞여 있습니다' : '')
      : '아직 들어온 학생이 없습니다. 위 코드를 불러 주세요.';
    list.innerHTML = '';
    Live.members.forEach(function (m) {
      var chip = el('span', 'chip', list);
      chip.classList.toggle('is-away', !m.on);
      // 선생님 화면에서만 누가 아직 안 골랐는지 보인다(무엇을 골랐는지는 안 보인다)
      if (isHost && m.voted) chip.classList.add('is-voted');
      chip.textContent = m.nick;
      if (!m.on) chip.title = '지금 접속이 끊겼습니다';
    });
  }

  /** 학급 연결 상태에 맞춰 화면과 상태 띠를 바꾼다 */
  function renderLive() {
    var box = $('liveBox');
    if (!box) return;
    var joined = !!Live.code;
    var on = joined && Live.ready;
    var isHost = Live.role === 'host';

    $('liveOff').hidden = joined;
    $('liveOn').hidden = !joined;
    $('liveGuest').hidden = isHost;

    if (joined) {
      $('liveCode').textContent = Live.code;
      // 참여 방법 안내와 표 비우기는 선생님 화면에만
      $('liveHost').hidden = !isHost;
      $('btnResetVotes').hidden = !isHost;
      renderRoster(isHost);
    }

    // 늘 보이는 상태 띠
    var strip = $('liveStrip');
    strip.hidden = !joined;
    if (joined) {
      strip.classList.toggle('is-off', !on);
      $('lsText').textContent = !on
        ? '수업 ' + Live.code + ' · 다시 연결하는 중…'
        : (isHost ? '수업 ' + Live.code + ' · ' + Live.online + '명 접속 중'
                  : '수업 ' + Live.code + ' · ' + (Live.nick || '참여 중'));
      var fb = $('btnFollow');
      fb.hidden = isHost;
      fb.textContent = Live.following ? '따라가는 중' : '따라가기 꺼짐';
      fb.classList.toggle('is-off', !Live.following);
      fb.setAttribute('aria-pressed', Live.following ? 'true' : 'false');
    }

    renderTally();
  }

  /* ---------- 단계 5. 겉보기 등급 ---------- */
  function build7(sub) {
    if (sub === 7) buildMagTable();      // 내가 낸 순서를 표에 표시해야 하므로 다시 그린다
    if (!Steps.built[7]) {
      Steps.built[7] = true;
      buildMagPlay();
      $('magScale').appendChild(buildMagScale([1, 2, 3, 4, 5, 6], '밝음', '어두움'));
      buildMagHistory();
      $('pogsonChart').appendChild(buildPogson());
      buildMagTable();
      $('magOurStars').appendChild(buildOurStars());
      buildQuiz();
    }
  }

  /** 등급 눈금 */
  function buildMagScale(list, leftWord, rightWord, negative) {
    var s = svg('svg', null, { viewBox: '0 0 560 132', class: 'sky-demo', role: 'img',
      'aria-label': '등급이 작을수록 밝습니다' });
    svg('rect', s, { x: 0, y: 0, width: 560, height: 132, fill: '#050a20', rx: 12 });
    var step = 520 / list.length;
    list.forEach(function (m, i) {
      var x = 20 + step * (i + 0.5);
      var r = Math.max(2.5, 15 - (m + (negative ? 1.5 : -1)) * 2.2);
      svg('circle', s, { cx: x, cy: 52, r: r * 2.3, fill: '#fff', opacity: 0.12 });
      svg('circle', s, { cx: x, cy: 52, r: r, fill: '#fff' });
      svg('text', s, { x: x, y: 96, class: 'sd-mag', 'text-anchor': 'middle' },
        (m < 0 ? '−' + Math.abs(m) : m) + '등급');
    });
    svg('text', s, { x: 20, y: 122, class: 'sd-end', 'text-anchor': 'start' }, '◂ ' + leftWord);
    svg('text', s, { x: 540, y: 122, class: 'sd-end', 'text-anchor': 'end' }, rightWord + ' ▸');
    return s;
  }


  /* ---------- 단계 5 자료 ---------- */

  /** 등급이 걸어온 길. 연도 간격이 아주 넓어 눈금 대신 사건 카드로 늘어놓는다. */
  var MAG_HISTORY = [
    { when: '기원전 150년쯤', who: '히파르코스',
      what: '별 목록을 만들며 밝기를 1~6등급으로 나누었습니다.', mark: true },
    { when: '서기 150년쯤', who: '프톨레마이오스',
      what: '그 방식을 그대로 받아 써서 널리 퍼뜨렸습니다.' },
    { when: '1395년', who: '천상열차분야지도',
      what: '조선에서 별의 밝기를 자국 크기로 돌에 새겼습니다.', ours: true },
    { when: '1856년', who: '포그슨',
      what: '한 등급 차이가 정확히 몇 배인지 정했습니다.' }
  ];

  function buildMagHistory() {
    var host = $('magHistory');
    MAG_HISTORY.forEach(function (e) {
      var card = el('div', 'mh-card', host);
      if (e.mark) card.classList.add('is-start');
      if (e.ours) card.classList.add('is-ours');
      el('p', 'mh-when', card, e.when);
      el('p', 'mh-who', card, e.who);
      el('p', 'mh-what', card, e.what);
    });
  }

  /** 포그슨의 100배 규칙. 한 등급마다 밝기가 약 2.5배씩 벌어지는 것을 보여 준다. */
  function buildPogson() {
    var rows = [
      { m: 1, x: 100 }, { m: 2, x: 40 }, { m: 3, x: 16 },
      { m: 4, x: 6.3 }, { m: 5, x: 2.5 }, { m: 6, x: 1 }
    ];
    var W = 560, H = 250;
    var g = svg('svg', null, { viewBox: '0 0 ' + W + ' ' + H, class: 'sky-demo', role: 'img',
      'aria-label': '1등급 별은 6등급 별보다 100배 밝습니다' });
    svg('rect', g, { x: 0, y: 0, width: W, height: H, fill: '#050a20', rx: 12 });

    var step = 520 / rows.length;
    rows.forEach(function (r, i) {
      var x = 20 + step * (i + 0.5);
      // 지름이 아니라 넓이가 밝기에 비례하도록 반지름을 잡는다
      var rad = 4 + 16 * Math.sqrt(r.x / 100);
      svg('circle', g, { cx: x, cy: 62, r: rad * 2.2, fill: '#ffd479', opacity: 0.12 });
      svg('circle', g, { cx: x, cy: 62, r: rad, fill: '#ffe9b8' });
      svg('text', g, { x: x, y: 120, class: 'sd-mag', 'text-anchor': 'middle' }, r.m + '등급');
      svg('text', g, { x: x, y: 142, class: 'sd-cap', 'text-anchor': 'middle' }, '밝기 ' + r.x);
      // 한 칸 건너갈 때마다 몇 배씩 어두워지는지
      if (i < rows.length - 1) {
        svg('text', g, { x: x + step / 2, y: 178, class: 'sd-mul', 'text-anchor': 'middle' }, '÷2.5');
      }
    });

    // 1등급 ↔ 6등급 = 100배
    var xa = 20 + step * 0.5, xb = 20 + step * 5.5;
    svg('path', g, { d: 'M' + xa + ' 200 L' + xa + ' 212 L' + xb + ' 212 L' + xb + ' 200',
      fill: 'none', stroke: '#7fd4ff', 'stroke-width': 2 });
    svg('text', g, { x: (xa + xb) / 2, y: 236, class: 'sd-span', 'text-anchor': 'middle' },
      '1등급은 6등급보다 100배 밝다');
    return g;
  }

  /** 우리 곁의 천체들. 별이 아닌 것도 같은 눈금 위에 놓인다. */
  var MAG_BODIES = [
    { id: 'sun',     name: '태양', mag: -26.7, note: '눈으로 직접 보면 안 됩니다' },
    { id: 'moon',    name: '보름달', mag: -12.7 },
    { id: 'venus',   name: '금성', mag: -4.8, note: '가장 밝을 때' },
    { id: 'jupiter', name: '목성', mag: -2.9, note: '가장 밝을 때' },
    { id: 'sirius',  name: '시리우스', mag: -1.5, note: '밤하늘에서 가장 밝은 별', ours: true },
    { id: 'vega',    name: '베가', mag: 0.0, note: '등급 0의 기준이 되었던 별' },
    { id: 'deneb',   name: '데네브', mag: 1.2 },
    { limit: true, name: '맨눈으로 볼 수 있는 한계', mag: 6.0 },
    { name: '7×50 쌍안경', mag: 9.5, note: '여기까지 보입니다', tool: true },
    { name: '60mm 망원경', mag: 12.0, note: '여기까지 보입니다', tool: true }
  ];

  function buildMagTable() {
    var host = $('magTable');
    host.innerHTML = '';          // 다시 들어올 때마다 그리므로 비우고 시작한다

    // 밝은 것부터 몇 번째인지 — 순서 맞히기를 채점하는 데 쓴다
    var trueRank = {};
    MAG_BODIES.filter(function (b) { return !b.limit && !b.tool; })
      .forEach(function (b, i) { trueRank[b.id] = i; });

    MAG_BODIES.forEach(function (b) {
      if (b.limit) {
        var line = el('div', 'mt-limit', host);
        el('span', 'mt-limit-txt', line, b.name + ' — ' + fmtMag(b.mag) + '등급');
        return;
      }
      var row = el('div', 'mt-row', host);
      if (b.ours) row.classList.add('is-ours');
      if (b.tool) row.classList.add('is-tool');

      // 26등급 차이를 지름에 그대로 옮길 수 없어 눈에 보이도록 눌러 담는다
      var d = Math.max(7, Math.min(30, 30 - Math.pow(b.mag + 27, 0.62) * 2.4));
      var dot = el('span', 'mt-dot', row);
      dot.style.width = d + 'px';
      dot.style.height = d + 'px';

      var txt = el('span', 'mt-name', row);
      el('b', null, txt, b.name);
      if (b.note) el('span', 'mt-note', txt, b.note);
      // 내가 놓은 순서가 맞았는지 표시한다
      var mine = (State.data.rank || []).indexOf(b.id);
      if (mine >= 0) {
        var right = (mine === trueRank[b.id]);
        var tag = el('span', 'mt-guess' + (right ? ' is-right' : ''), txt,
          right ? '내 예상 ' + (mine + 1) + '위 ✓' : '내 예상 ' + (mine + 1) + '위');
        tag.title = right ? '맞혔습니다' : '실제로는 ' + (trueRank[b.id] + 1) + '위입니다';
      }
      el('span', 'mt-mag', row, fmtMag(b.mag));
    });
  }

  /** 등급 값을 화면용으로. 마이너스는 빼기 기호가 아니라 −(U+2212) 로 쓴다. */
  function fmtMag(m) {
    var v = (Math.round(m * 10) / 10).toFixed(1);
    return v.charAt(0) === '-' ? '−' + v.slice(1) : v;
  }

  /* ---------- 단계 5-6. 밝기 순서 맞히기 ---------- */

  /** 순서를 맞힐 일곱 개 (MAG_BODIES 에서 도구·한계선을 뺀 것) */
  function rankBodies() {
    return MAG_BODIES.filter(function (b) { return !b.limit && !b.tool; });
  }

  /** 한 번 섞으면 그 화면에서는 그대로 둔다(다시 그릴 때마다 흔들리지 않게) */
  function rankPool() {
    if (!Steps.rankShuffled) {
      var a = rankBodies().map(function (b) { return b.id; });
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      Steps.rankShuffled = a;
    }
    return Steps.rankShuffled;
  }

  function bodyById(id) {
    var all = rankBodies();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function buildRankGame() {
    $('btnRankSubmit').addEventListener('click', submitRank);
    $('btnRankReset').addEventListener('click', function () {
      State.data.rank = [];
      State.save();
      rankMsg('');
      renderRank();
    });
  }

  function rankMsg(text, kind) {
    var m = $('rgMsg');
    m.hidden = !text;
    m.textContent = text || '';
    m.className = 'rg-msg' + (kind ? ' is-' + kind : '');
  }

  /** 슬롯과 남은 카드를 다시 그린다 */
  function renderRank() {
    var slots = $('rgSlots'), pool = $('rgPool');
    if (!slots) return;
    var order = State.data.rank || [];
    var total = rankBodies().length;

    slots.innerHTML = '';
    for (var i = 0; i < total; i++) {
      var row = el('div', 'rg-slot', slots);
      el('span', 'rg-no', row, String(i + 1));
      var id = order[i];
      if (id) {
        var b = bodyById(id);
        var card = el('button', 'rg-card is-placed', row);
        card.type = 'button';
        el('b', null, card, b ? b.name : id);
        card.title = '빼내기';
        (function (k) {
          card.addEventListener('click', function () {
            var o = (State.data.rank || []).slice();
            o.splice(k, 1);
            State.data.rank = o;
            State.save();
            rankMsg('');
            renderRank();
          });
        })(i);
      } else {
        el('span', 'rg-empty', row, i === order.length ? '여기에 놓입니다' : '');
        if (i === order.length) row.classList.add('is-next');
      }
    }

    pool.innerHTML = '';
    var left = rankPool().filter(function (id) { return order.indexOf(id) < 0; });
    left.forEach(function (id) {
      var b = bodyById(id);
      var card = el('button', 'rg-card', pool);
      card.type = 'button';
      el('b', null, card, b ? b.name : id);
      if (b && b.note) el('span', 'rg-note', card, b.note);
      card.addEventListener('click', function () {
        var o = (State.data.rank || []).slice();
        o.push(id);
        State.data.rank = o;
        State.save();
        rankMsg('');
        renderRank();
      });
    });
    if (!left.length) el('p', 'muted tiny', pool, '모두 놓았습니다. [제출하기] 를 눌러 주세요.');

    $('btnRankSubmit').disabled = (order.length !== total);
    $('btnRankReset').disabled = !order.length;
  }

  function submitRank() {
    var order = State.data.rank || [];
    if (order.length !== rankBodies().length) return;
    if (global.Live && Live.ready && Live.role === 'guest') {
      rankMsg('보내는 중…');
      Live.sendRank(order, function (err) {
        rankMsg(err ? '보내지 못했습니다. 그래도 내 순서는 남아 있습니다.' : '제출했습니다!',
                err ? 'bad' : 'ok');
        renderRankTally();
      });
    } else {
      rankMsg('제출했습니다!', 'ok');
    }
  }

  /**
   * 교사 화면에만 — 학생들이 낸 순위를 한눈에.
   * 가로가 순위(1~7), 세로가 천체다. 반이 잘 맞혔으면 대각선이 밝게 켜진다.
   */
  function renderRankTally() {
    // 1차시(5-4)와 2차시(7-7) 두 곳에 같은 표를 건다
    var hosts = [$('rankTally'), $('rankTally7')].filter(Boolean);
    if (!hosts.length) return;
    var isHost = global.Live && Live.role === 'host' && Live.code;
    var ranks = (global.Live && Live.work && Live.work.ranks) || [];
    hosts.forEach(function (h) { h.hidden = !isHost; });
    if (!isHost) return;
    hosts.forEach(fillRankTally);

    function fillRankTally(host) {

    var bodies = rankBodies(), n = bodies.length;
    host.innerHTML = '';
    el('h4', 'rgt-title', host, '우리 반이 낸 순서 — ' + ranks.length + '명 제출');
    if (!ranks.length) {
      el('p', 'muted tiny', host, '아직 제출한 학생이 없습니다.');
      return;
    }

    // counts[천체][순위] = 사람 수
    var counts = {};
    bodies.forEach(function (b) { counts[b.id] = new Array(n).fill(0); });
    ranks.forEach(function (o) {
      o.forEach(function (id, i) { if (counts[id] && i < n) counts[id][i]++; });
    });

    var grid = el('div', 'rgt-grid', host);
    grid.style.gridTemplateColumns = 'minmax(4.5rem, auto) repeat(' + n + ', 1fr)';
    el('span', 'rgt-corner', grid, '');
    for (var r = 1; r <= n; r++) el('span', 'rgt-head', grid, r + '위');

    bodies.forEach(function (b, bi) {
      el('span', 'rgt-name', grid, b.name);
      for (var r = 0; r < n; r++) {
        var c = counts[b.id][r];
        var cell = el('span', 'rgt-cell', grid, c ? String(c) : '');
        if (c) {
          cell.style.background = 'color-mix(in srgb, var(--accent) ' +
            Math.round(18 + 62 * (c / ranks.length)) + '%, transparent)';
        }
        if (r === bi) cell.classList.add('is-answer');   // 실제 순위 자리
      }
    });
    el('p', 'muted tiny', host,
      '테두리가 있는 칸이 실제 순위입니다. 그 줄이 진할수록 반이 잘 맞힌 것입니다.');
    }
  }

  /** 오늘 재는 별 10개가 눈금 어디쯤에 있는지 */
  function buildOurStars() {
    var list = STARS.slice().sort(function (a, b) { return a.mag - b.mag; });
    var lo = -2, hi = 4;
    var ROW_H = 19;                       // 이름표 한 줄 높이
    var CH = 12.5;                        // 한글 한 글자 폭(12px 기준)

    // 이름표를 몇 줄까지 쌓아야 하는지 먼저 계산한다
    var rowEnd = [];                      // 줄마다 이미 찬 오른쪽 끝
    var place = [];
    var W = 560, xa = 40, xb = W - 26;
    function px(m) { return xa + (m - lo) / (hi - lo) * (xb - xa); }

    list.forEach(function (st) {
      var w = st.kor.length * CH + 8;
      var x = px(st.mag);
      var left = x - w / 2;
      var r = 0;
      while (rowEnd[r] !== undefined && rowEnd[r] > left) r++;
      rowEnd[r] = x + w / 2;
      place.push({ st: st, x: x, row: r });
    });

    var rows = rowEnd.length;
    var axisY = 34 + rows * ROW_H + 16;
    var H = axisY + 62;

    var g = svg('svg', null, { viewBox: '0 0 ' + W + ' ' + H, class: 'sky-demo', role: 'img',
      'aria-label': '오늘 재는 별 ' + list.length + '개의 겉보기 등급' });
    svg('rect', g, { x: 0, y: 0, width: W, height: H, fill: '#050a20', rx: 12 });

    // 눈금
    svg('line', g, { x1: xa, y1: axisY, x2: xb, y2: axisY, stroke: '#2b3a63', 'stroke-width': 2 });
    for (var m = lo; m <= hi; m++) {
      svg('line', g, { x1: px(m), y1: axisY, x2: px(m), y2: axisY + 8,
        stroke: '#2b3a63', 'stroke-width': 2 });
      svg('text', g, { x: px(m), y: axisY + 26, class: 'sd-tick', 'text-anchor': 'middle' },
        fmtMag(m).replace('.0', ''));
    }
    svg('text', g, { x: xa, y: axisY + 50, class: 'sd-end', 'text-anchor': 'start' }, '◂ 밝음');
    svg('text', g, { x: xb, y: axisY + 50, class: 'sd-end', 'text-anchor': 'end' }, '어두움 ▸');

    // 별과 이름표. 겹치지 않는 줄에 올리고 눈금까지 선으로 이어 준다.
    place.forEach(function (p) {
      var labelY = 34 + (rows - 1 - p.row) * ROW_H;
      var rad = Math.max(2.5, 8 - p.st.mag * 1.3);
      svg('line', g, { x1: p.x, y1: labelY + 5, x2: p.x, y2: axisY - rad,
        stroke: '#33447a', 'stroke-width': 1 });
      svg('circle', g, { cx: p.x, cy: axisY, r: rad * 2.4, fill: '#fff', opacity: 0.1 });
      svg('circle', g, { cx: p.x, cy: axisY, r: rad, fill: '#fff' });
      svg('text', g, { x: p.x, y: labelY, class: 'sd-star', 'text-anchor': 'middle' }, p.st.kor);
    });
    return g;
  }

  var QUIZ = [
    { q: '0등급과 3등급 중 더 밝은 별은?', a: '0등급', opts: ['0등급', '3등급'],
      why: '숫자가 작을수록 밝습니다. 0이 3보다 작으니 0등급이 더 밝습니다.' },
    { q: '2등급과 5등급 중 더 어두운 별은?', a: '5등급', opts: ['2등급', '5등급'],
      why: '숫자가 클수록 어둡습니다. 5가 2보다 크니 5등급이 더 어둡습니다.' },
    { q: '−1.5등급인 시리우스와 1등급인 별 중 더 밝은 별은?', a: '시리우스(−1.5등급)',
      opts: ['시리우스(−1.5등급)', '1등급인 별'],
      why: '마이너스까지 내려가면 더 밝습니다. −1.5는 1보다 작으니 시리우스가 더 밝습니다.' },
    { q: '−4.8등급인 금성과 −1.5등급인 시리우스 중 더 밝은 것은?', a: '금성(−4.8등급)',
      opts: ['금성(−4.8등급)', '시리우스(−1.5등급)'],
      why: '마이너스끼리도 숫자가 더 작은 쪽이 밝습니다. −4.8이 −1.5보다 작으니 금성이 더 밝습니다.' }
  ];

  function buildQuiz() {
    var host = $('magQuiz');
    QUIZ.forEach(function (item, qi) {
      var box = el('div', 'quiz-item', host);
      el('p', 'quiz-q', box, (qi + 1) + '. ' + item.q);
      var opts = el('div', 'quiz-opts', box);
      var fb = el('p', 'quiz-fb', box);
      fb.hidden = true;
      item.opts.forEach(function (o) {
        var b = el('button', 'btn quiz-opt', opts, o);
        b.type = 'button';
        b.addEventListener('click', function () {
          var right = (o === item.a);
          fb.hidden = false;
          fb.className = 'quiz-fb ' + (right ? 'is-right' : 'is-wrong');
          fb.textContent = (right ? '✓ 맞았습니다! ' : '✗ 다시 볼까요? ') + item.why;
          b.classList.toggle('is-right', right);
          b.classList.toggle('is-wrong', !right);
          State.data.quiz[qi] = right;
          State.save();
        });
      });
    });
  }

  /* ---------- 단계 6. 측정 ---------- */
  function build8(sub) {
    if (!Steps.built[8]) {
      Steps.built[8] = true;
      $('ruleCardHost').appendChild(Guide.buildRuleCard());

      Steps.map = new MapView($('mapHost'), {
        img: IMAGES.orion,
        showPins: true,
        onPinTap: function (id) { Measure.open(id); },
        onPinSelect: function (id) { if (global.Admin && Admin.enabled) Admin.onPinSelected(id); },
        onPinMove: function () { if (global.Admin && Admin.enabled) Admin.refreshPreview(); },
        onPinDragState: function (id, on) { if (global.Admin && Admin.enabled) Admin.setPreviewGhost(on); },
        onPinPlaced: function () { if (global.Admin && Admin.enabled) Admin.onPinPlaced(); }
      });

      Measure.onClose = function () { renderMeasureProgress(); Steps.catchUp(); };
      $('btnSheetPrint').addEventListener('click', function () { Report.printSheet(); });
      State.onChange(renderMeasureProgress);
    }
    if (sub === 2) renderMeasureProgress();
  }

  function renderMeasureProgress() {
    var done = State.measuredCount();
    var fill = $('measProgFill'), txt = $('measProgText');
    if (fill) fill.style.width = (done / STARS.length * 100) + '%';
    if (txt) txt.textContent = STARS.length + '개 중 ' + done + '개 측정 완료';

    var host = $('measTableHost');
    if (!host) return;
    host.innerHTML = '';
    host.appendChild(buildMeasureTable(false));
  }

  /**
   * 별마다 몇 명이 쟀는지 센다 (교사 화면에서만 쓴다).
   * 반 전체 자료는 학생마다 "잰 별의 [등급, 지름]" 으로 오므로,
   * 그 별의 등급을 가진 점이 몇 개인지 세면 곧 사람 수가 된다.
   * 2차까지 다 재지 않고 1차만 해도 평균이 잡히므로 그대로 포함된다.
   */
  function measuredByStar() {
    var byMag = {};
    var w = global.Live && Live.work;
    if (w && w.pts) w.pts.forEach(function (p) { byMag[p[0]] = (byMag[p[0]] || 0) + 1; });
    return byMag;   // 아직 아무도 없으면 전부 0 으로 나온다
  }

  /** 측정 기록 표. withMag=true 면 겉보기 등급 열을 함께 보여준다. */
  function buildMeasureTable(withMag) {
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    var t = el('table', 'data-table', wrap);
    // 교사 화면에서만 "몇 명이 쟀는지" 칸을 더한다
    var counts = (global.Live && Live.role === 'host' && Live.code) ? measuredByStar() : null;
    var thead = el('thead', null, t);
    var hr = el('tr', null, thead);
    ['번호', '별 이름 (전통 이름)', '1차', '2차', '평균'].forEach(function (h) {
      el('th', null, hr, h);
    });
    if (withMag) el('th', 'th-mag', hr, '실제 밝기(등급)');
    if (counts) el('th', 'th-joined', hr, '측정 학생수');

    var tb = el('tbody', null, t);
    STARS.forEach(function (st) {
      var list = State.measuresOf(st.id);
      var tr = el('tr', list.length ? 'is-done' : '', tb);
      el('td', 'td-num', tr, String(st.id));
      var name = el('td', 'td-name', tr);
      el('b', null, name, st.kor);
      el('span', 'td-trad', name, ' ' + st.trad);
      // data-l 은 좁은 화면에서 표가 카드로 접힐 때 쓰는 이름표다
      el('td', 'td-v', tr, list[0] !== undefined ? list[0].toFixed(1) : '–').dataset.l = '1차';
      el('td', 'td-v', tr, list[1] !== undefined ? list[1].toFixed(1) : '–').dataset.l = '2차';
      var avg = State.averageOf(st.id);
      el('td', 'td-v td-avg', tr, avg === null ? '–' : avg.toFixed(1)).dataset.l = '평균';
      if (withMag) el('td', 'td-v td-mag', tr, magText(st.mag)).dataset.l = '실제 등급';
      if (counts) {
        var c = counts[st.mag] || 0;
        var cell = el('td', 'td-v td-joined', tr, c + '명');
        cell.dataset.l = '측정 학생수';
        if (!c) cell.classList.add('is-none');
      }
    });
    return wrap;
  }

  /* ---------- 단계 7. 결과 ---------- */

  /** 내가 잰 값을 반 전체 산점도에 보탠다 */
  function shareMyResult() {
    if (!global.Live || !Live.ready || Live.role !== 'guest') return;
    Live.sendResult(State.measuredRows().map(function (r) {
      return [r.star.mag, r.avg];
    }));
  }

  function build9(sub) {
    if (!Steps.built[9]) {
      Steps.built[9] = true;
      $('btnTrend').addEventListener('click', function () {
        if (Steps.chart2) Steps.chart2.showTrend();
        $('trendNote').hidden = false;
        $('btnTrend').disabled = true;
      });

      $('btnScopeMine').addEventListener('click', function () { setScope(false); });
      $('btnScopeClass').addEventListener('click', function () { setScope(true); });

    }

    if (sub === 1) {
      var host = $('resultTableHost');
      host.innerHTML = '';
      host.appendChild(buildMeasureTable(true));
      if (!State.measuredCount()) {
        var p = el('p', 'chart-empty', host, '아직 잰 별이 없습니다. 단계 6에서 먼저 재 봅시다.');
        host.insertBefore(p, host.firstChild);
      }
      shareMyResult();          // 결과 화면에 들어올 때 반에 보탠다
    }

    if (sub === 2) {
      Steps.chart1 = new Scatter($('chartHost'), { animate: true });
      var note = $('scatterName');
      note.hidden = true;
      var delay = 400 + State.measuredRows().length * 170;
      clearTimeout(Steps._nameTimer);
      Steps._nameTimer = setTimeout(function () { note.hidden = false; }, delay);
    }

    if (sub === 3) {
      shareMyResult();
      // 내가 잰 것이 없으면(교사 기기 등) 처음부터 반 전체를 보여 준다
      if (Steps.scopeClass === undefined) {
        Steps.scopeClass = !State.measuredRows().length && !!classPoints();
      }
      Steps.chart2 = new Scatter($('chartHost2'), {
        animate: false, showLabels: true,
        classPts: classPoints(), classOn: !!Steps.scopeClass
      });
      $('trendNote').hidden = true;
      $('classNote').hidden = !Steps.scopeClass;
      $('btnTrend').disabled = false;
      renderScope();
    }
  }

  /** 반 전체가 올린 점. 없으면 null. */
  function classPoints() {
    var w = global.Live && Live.work;
    return (w && w.pts && w.pts.length) ? w.pts : null;
  }

  /** 내 결과 / 우리 반 전체 스위치를 그린다 */
  function renderScope() {
    var sw = $('scopeSwitch');
    if (!sw) return;
    var pts = classPoints();
    var joined = !!(global.Live && Live.code);
    // 반에 붙어 있고 누군가 올렸을 때만 보여 준다
    sw.hidden = !(joined && pts);
    if (sw.hidden) { Steps.scopeClass = false; return; }

    var people = (Live.work && Live.work.people) || 0;
    $('scopeInfo').textContent = people + '명 · 점 ' + pts.length + '개';
    $('btnScopeMine').classList.toggle('is-on', !Steps.scopeClass);
    $('btnScopeClass').classList.toggle('is-on', !!Steps.scopeClass);
  }

  function setScope(on) {
    Steps.scopeClass = !!on;
    if (Steps.chart2) {
      Steps.chart2.opts.classPts = classPoints();
      Steps.chart2.setClassOn(Steps.scopeClass);
    }
    $('classNote').hidden = !Steps.scopeClass;
    renderScope();
  }

  /* ---------- 단계 8. 결론 ---------- */
  function build10() {
    if (!Steps.built[10]) {
      Steps.built[10] = true;
      var input = $('conclusionInput');
      input.value = State.data.conclusion || '';
      input.addEventListener('input', function () {
        State.data.conclusion = input.value;
        State.save();
      });
      $('btnShowAll').addEventListener('click', function () {
        $('conclusionReveal').hidden = false;
        revealLines();
        renderLookback();
        $('btnShowAll').disabled = true;
        // 내 결론을 반에 올리고, 친구들 것을 받아 온다
        var mine = (input.value || '').trim();
        if (global.Live && Live.ready && Live.role === 'guest' && mine) {
          Live.sendNote(mine, function () { renderNotes(); });
        } else {
          renderNotes();
        }
      });
      $('btnReport').addEventListener('click', function () { Report.printReport(); });
    }
    if (!$('conclusionReveal').hidden) { renderLookback(); renderNotes(); }
  }

  function revealLines() {
    var host = $('revealLines');
    host.innerHTML = '';
    CONCLUSIONS.forEach(function (line, i) {
      var p = el('p', 'reveal-line', host);
      p.innerHTML = line;
      setTimeout(function () { p.classList.add('shown'); }, 200 + i * 700);
    });
  }

  /* ---------- 친구들의 결론 ---------- */

  /** 포스트잇 색. 글자가 또렷하게 보이는 옅은 색만 고른다. */
  var NOTE_TINTS = 6;

  /** 같은 사람은 늘 같은 색이 되도록 닉네임에서 색을 뽑는다 */
  function tintOf(nick) {
    var h = 0;
    var s = String(nick || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
    return h % NOTE_TINTS;
  }

  function noteCard(host, note) {
    var card = el('div', 'note-card tint-' + tintOf(note.nick), host);
    el('p', 'nc-text', card, note.text);
    el('p', 'nc-who', card, '— ' + (note.nick || '익명'));
    return card;
  }

  /**
   * 친구들의 결론을 양옆에 흘려 보낸다.
   * 왼쪽은 위로, 오른쪽은 아래로. 끊기지 않게 같은 묶음을 두 번 넣는다.
   */
  function renderNotes() {
    var wall = $('notesWall'), flat = $('notesFlat');
    if (!wall) return;
    var notes = (global.Live && Live.work && Live.work.notes) || [];
    // 내 결론은 이미 위에 적혀 있으므로 벽에는 남의 것만 흘린다
    var mine = (State.data.conclusion || '').trim();
    notes = notes.filter(function (x) { return x.text && x.text.trim() !== mine; });

    if (notes.length < 2) { wall.hidden = true; flat.hidden = true; return; }
    wall.hidden = false;
    flat.hidden = false;

    var left = $('nwLeft'), right = $('nwRight'), list = $('nfList');
    left.innerHTML = ''; right.innerHTML = ''; list.innerHTML = '';

    // 양쪽에 번갈아 나눠 담는다
    var a = [], b = [];
    notes.forEach(function (x, i) { (i % 2 ? b : a).push(x); });
    if (!b.length) b = a.slice();

    [[left, a], [right, b]].forEach(function (pair) {
      // 두 번 이어 붙여야 한 바퀴 돌 때 끊긴 자리가 보이지 않는다
      for (var pass = 0; pass < 2; pass++) {
        pair[1].forEach(function (x) { noteCard(pair[0], x); });
      }
      // 글이 많을수록 오래 걸리게 — 흐르는 속도를 일정하게 유지한다
      pair[0].style.animationDuration = Math.max(24, pair[1].length * 9) + 's';
    });

    notes.forEach(function (x) { noteCard(list, x); });
    $('nfList').setAttribute('aria-label', '친구들이 쓴 결론 ' + notes.length + '개');
  }

  function renderLookback() {
    var host = $('lookback');
    host.innerHTML = '';
    var mine = State.predictionLabel();

    // 1차시에 세운 가설을 통째로 되짚는다
    if (State.data.hypoHow) {
      var h = el('div', 'lb-row lb-plan', host);
      el('span', 'lb-key', h, '내가 말한 확인 방법');
      el('span', 'lb-val', h, State.data.hypoHow);
    }
    if (State.data.hypoWhy) {
      var w = el('div', 'lb-row', host);
      el('span', 'lb-key', w, '그렇게 생각한 까닭');
      el('span', 'lb-val', w, State.data.hypoWhy);
    }
    var a = el('div', 'lb-row', host);
    el('span', 'lb-key', a, '내 예상');
    el('span', 'lb-val', a, mine || '(고르지 않음)');

    var b = el('div', 'lb-row lb-answer', host);
    el('span', 'lb-key', b, '오늘 확인한 것');
    el('span', 'lb-val', b, '밝은 별일수록 크게 새겼습니다');

    var judge = el('p', 'lb-judge', host);
    if (!mine) {
      judge.textContent = '단계 4로 돌아가 예상을 골라 보세요.';
    } else if (State.data.prediction === 'bright') {
      judge.innerHTML = '✓ 예상이 <b>맞았습니다.</b> 자국의 크기는 별의 밝기와 이어져 있었습니다.';
    } else {
      judge.innerHTML = '이번엔 <b>밝기</b>가 답이었습니다. 예상과 달랐어도 괜찮습니다 — ' +
                        '직접 재서 확인한 것이 오늘의 수확입니다.';
    }
  }

  global.Steps = Steps;
  global.buildMeasureTable = buildMeasureTable;

})(window);
