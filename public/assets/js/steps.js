/* ==========================================================================
   별지기 1395 — 8단계 수업 진행 controller
   교사가 화면을 순서대로 넘기면 그것이 곧 수업이 되도록 만든다.
   ========================================================================== */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* 단계별 소단계 수 */
  var SUBS = { 1: 1, 2: 3, 3: 1, 4: 3, 5: 4, 6: 2, 7: 3, 8: 1 };
  var LAST = 8;

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
      var b = el('button', 'sb-item', bar);
      b.type = 'button';
      b.dataset.step = s.n;
      b.title = s.n + '. ' + s.long;
      el('span', 'sb-num', b, String(s.n));
      el('span', 'sb-label', b, s.short);
      b.addEventListener('click', function () { Steps.go(s.n); });
    });

    // 학급 참여는 첫 화면에 있지만, 어느 단계로 이어서 들어와도 연결은 살아 있어야 한다
    buildLive();

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
    if (Steps.sub < (SUBS[Steps.step] || 1)) Steps.go(Steps.step, Steps.sub + 1);
    else if (Steps.step < LAST) Steps.go(Steps.step + 1, 1);
  };

  Steps.prev = function () {
    if (Steps.sub > 1) Steps.go(Steps.step, Steps.sub - 1);
    else if (Steps.step > 1) Steps.go(Steps.step - 1, SUBS[Steps.step - 1] || 1);
  };

  /* ==========================================================================
     단계별 준비 — 처음 들어올 때 한 번만 만들고, 이후에는 값만 갱신
     ========================================================================== */
  Steps.enter = function (n, sub) {
    App.lazyLoadVisible();
    switch (n) {
      case 1: build1(); break;
      case 2: build2(sub); break;
      case 3: build3(); break;
      case 4: build4(sub); break;
      case 5: build5(sub); break;
      case 6: build6(sub); break;
      case 7: build7(sub); break;
      case 8: build8(); break;
    }
  };

  /* ---------- 단계 1. 인트로 ---------- */
  function build1() {
    var stage = $('introStage');
    if (!Steps.built[1]) {
      Steps.built[1] = true;
      stage.addEventListener('click', function () {
        stage.classList.add('show-all');   // 누르면 전부 바로 표시
      });
      $('btnStart').addEventListener('click', function () { Steps.go(2); });
      var bg = $('introBg');
      bg.style.backgroundImage = 'url("' + IMAGES.full.src + '")';
    }
    // 다시 들어와도 처음부터 재생
    stage.classList.remove('play', 'show-all');
    void stage.offsetWidth;             // 애니메이션 재시작
    stage.classList.add('play');
  }

  /* ---------- 단계 2. 지도 소개 ---------- */
  function build2(sub) {
    if (!Steps.built[2]) {
      Steps.built[2] = true;
      // 카드 진행 점
      var dots = $('s2Dots');
      for (var i = 1; i <= SUBS[2]; i++) {
        var d = el('span', 'dot', dots);
        d.dataset.sub = i;
      }
      buildBill($('billArt'));
    }
    var ds = $('s2Dots').querySelectorAll('.dot');
    for (var j = 0; j < ds.length; j++) {
      ds[j].classList.toggle('is-on', Number(ds[j].dataset.sub) === sub);
    }

    // 카드에 맞춰 왼쪽 그림을 바꾼다
    // ① 돌에 새긴 지도라는 말이 나오므로 각석 실물 사진
    // ②③ 별 1,467개 이야기이므로 별이 다 보이는 전체 지도
    var img = $('s2Img'), cap = $('s2Cap');
    var want = (sub === 1)
      ? { src: IMAGES.stone.src, cap: '돌에 새겨진 실물 — 천상열차분야지도 각석',
          alt: '천상열차분야지도 각석 — 돌에 새겨진 실물' }
      : { src: IMAGES.full.src, cap: '천상열차분야지도 전체 모습',
          alt: '천상열차분야지도 전체' };
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

  function build3() {
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

    if (!Steps.built[3]) {
      Steps.built[3] = true;
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

  function build4(sub) {
    if (!Steps.built[4]) {
      Steps.built[4] = true;

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
    var ids = (Config.get('trioIds', [1, 7, 12]) || []).filter(function (id) { return !!starById(id); });
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

  /**
   * 참여자 명단. 서버에서 오는 것은 닉네임뿐이다.
   * 이름표는 textContent 로만 넣어 입력한 글자가 태그로 읽히지 않게 한다.
   */
  function renderRoster(isHost) {
    var box = $('roster');
    var list = $('rosterList');
    var n = Live.members.length;
    box.hidden = false;
    $('rosterCount').textContent = n
      ? '참여한 학생 ' + n + '명 (접속 ' + Live.online + '명)'
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
  function build5(sub) {
    if (!Steps.built[5]) {
      Steps.built[5] = true;
      $('brightDemo').appendChild(buildBrightDemo());
      $('magScale').appendChild(buildMagScale([1, 2, 3, 4, 5, 6], '밝음', '어두움'));
      $('magNegative').appendChild(buildMagScale([-1.5, 0, 1, 2, 3], '더 밝음', '어두움', true));
      buildQuiz();
    }
  }

  /** 밝기가 다른 별 5개 */
  function buildBrightDemo() {
    var s = svg('svg', null, { viewBox: '0 0 560 150', class: 'sky-demo', role: 'img',
      'aria-label': '밝기가 서로 다른 별 다섯 개' });
    svg('rect', s, { x: 0, y: 0, width: 560, height: 150, fill: '#050a20', rx: 12 });
    var data = [
      { x: 70,  r: 15, o: 1.00, t: '아주 밝은 별' },
      { x: 180, r: 10, o: 0.92, t: '밝은 별' },
      { x: 290, r: 7,  o: 0.80, t: '보통' },
      { x: 400, r: 4.5, o: 0.66, t: '어두운 별' },
      { x: 500, r: 2.6, o: 0.5,  t: '겨우 보임' }
    ];
    data.forEach(function (d) {
      svg('circle', s, { cx: d.x, cy: 62, r: d.r * 2.4, fill: '#fff', opacity: d.o * 0.13 });
      svg('circle', s, { cx: d.x, cy: 62, r: d.r, fill: '#fff', opacity: d.o });
      svg('text', s, { x: d.x, y: 118, class: 'sd-cap', 'text-anchor': 'middle' }, d.t);
    });
    return s;
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

  var QUIZ = [
    { q: '0등급과 3등급 중 더 밝은 별은?', a: '0등급', opts: ['0등급', '3등급'],
      why: '숫자가 작을수록 밝습니다. 0이 3보다 작으니 0등급이 더 밝습니다.' },
    { q: '−1.5등급인 시리우스와 1등급인 별 중 더 밝은 별은?', a: '시리우스(−1.5등급)',
      opts: ['시리우스(−1.5등급)', '1등급인 별'],
      why: '마이너스까지 내려가면 더 밝습니다. −1.5는 1보다 작으니 시리우스가 더 밝습니다.' }
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
  function build6(sub) {
    if (!Steps.built[6]) {
      Steps.built[6] = true;
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

  /** 측정 기록 표. withMag=true 면 겉보기 등급 열을 함께 보여준다. */
  function buildMeasureTable(withMag) {
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    var t = el('table', 'data-table', wrap);
    var thead = el('thead', null, t);
    var hr = el('tr', null, thead);
    ['번호', '별 이름 (전통 이름)', '1차', '2차', '평균'].forEach(function (h) {
      el('th', null, hr, h);
    });
    if (withMag) el('th', 'th-mag', hr, '실제 밝기(등급)');

    var tb = el('tbody', null, t);
    STARS.forEach(function (st) {
      var list = State.measuresOf(st.id);
      var tr = el('tr', list.length ? 'is-done' : '', tb);
      el('td', 'td-num', tr, String(st.id));
      var name = el('td', 'td-name', tr);
      el('b', null, name, st.kor);
      el('span', 'td-trad', name, ' ' + st.trad);
      el('td', 'td-v', tr, list[0] !== undefined ? list[0].toFixed(1) : '–');
      el('td', 'td-v', tr, list[1] !== undefined ? list[1].toFixed(1) : '–');
      var avg = State.averageOf(st.id);
      el('td', 'td-v td-avg', tr, avg === null ? '–' : avg.toFixed(1));
      if (withMag) el('td', 'td-v td-mag', tr, magText(st.mag));
    });
    return wrap;
  }

  /* ---------- 단계 7. 결과 ---------- */
  function build7(sub) {
    if (!Steps.built[7]) {
      Steps.built[7] = true;
      $('btnTrend').addEventListener('click', function () {
        if (Steps.chart2) Steps.chart2.showTrend();
        $('trendNote').hidden = false;
        $('btnTrend').disabled = true;
      });
    }

    if (sub === 1) {
      var host = $('resultTableHost');
      host.innerHTML = '';
      host.appendChild(buildMeasureTable(true));
      if (!State.measuredCount()) {
        var p = el('p', 'chart-empty', host, '아직 잰 별이 없습니다. 단계 6에서 먼저 재 봅시다.');
        host.insertBefore(p, host.firstChild);
      }
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
      Steps.chart2 = new Scatter($('chartHost2'), { animate: false, showLabels: true });
      $('trendNote').hidden = true;
      $('btnTrend').disabled = false;
    }
  }

  /* ---------- 단계 8. 결론 ---------- */
  function build8() {
    if (!Steps.built[8]) {
      Steps.built[8] = true;
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
      });
      $('btnReport').addEventListener('click', function () { Report.printReport(); });
      $('btnCsv').addEventListener('click', function () { Report.downloadCsv(); });
    }
    if (!$('conclusionReveal').hidden) renderLookback();
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

  function renderLookback() {
    var host = $('lookback');
    host.innerHTML = '';
    var mine = State.predictionLabel();

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
