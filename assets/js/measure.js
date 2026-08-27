/* ==========================================================================
   별지기 1395 — 측정 뷰
   별 자국을 크게 확대하고, 두 손잡이를 바깥 테두리 양 끝에 맞춰 지름을 잰다.
   손잡이 위치는 '원본 이미지 픽셀'로 들고 있어 확대 배율을 바꿔도 흔들리지 않는다.
   ========================================================================== */
(function (global) {
  'use strict';

  function el(tag, cls, parent, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  var Measure = {
    built: false,
    starId: null,
    zoom: 5,
    size: 320,
    center: { x: 0, y: 0 },   // 지금 화면 한가운데가 가리키는 원본 픽셀
    h1: { x: 0, y: 0 },       // 손잡이 1 (원본 픽셀)
    h2: { x: 0, y: 0 },
    onClose: null
  };

  /* ---------- 화면 만들기 (처음 한 번) ---------- */
  Measure.build = function () {
    if (Measure.built) return;
    Measure.built = true;

    var root = document.getElementById('measureRoot');
    var back = el('div', 'measure-back', root);
    back.hidden = true;
    Measure.back = back;

    var panel = el('div', 'measure-panel', back);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');

    /* 머리말 */
    var head = el('div', 'measure-head', panel);
    var titles = el('div', 'mh-titles', head);
    Measure.title = el('h2', 'mh-kor', titles);
    Measure.sub = el('p', 'mh-trad', titles);
    var closeBtn = el('button', 'btn-round', head, '✕');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', '측정 닫기');
    closeBtn.addEventListener('click', Measure.close);

    /* 무대 */
    var stageWrap = el('div', 'measure-stagewrap', panel);
    var stage = el('div', 'measure-stage', stageWrap);
    Measure.stage = stage;

    Measure.missing = missingBox(stage, IMAGES.orion.src);
    Measure.missing.hidden = true;

    // 두 손잡이를 잇는 선 + 지름 표시
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ms-line');
    stage.appendChild(svg);
    Measure.svg = svg;
    Measure.line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    Measure.line.setAttribute('class', 'ms-line-el');
    svg.appendChild(Measure.line);

    Measure.hEl1 = el('button', 'ms-handle ms-h1', stage);
    Measure.hEl2 = el('button', 'ms-handle ms-h2', stage);
    Measure.hEl1.type = Measure.hEl2.type = 'button';
    Measure.hEl1.setAttribute('aria-label', '손잡이 1');
    Measure.hEl2.setAttribute('aria-label', '손잡이 2');
    el('span', 'ms-dot', Measure.hEl1);
    el('span', 'ms-dot', Measure.hEl2);

    Measure.bindHandle(Measure.hEl1, 'h1');
    Measure.bindHandle(Measure.hEl2, 'h2');
    Measure.bindPan(stage);

    // 확대 기준 도식(작게)
    var guide = el('div', 'ms-guide', stageWrap);
    guide.appendChild(Guide.buildMarkDiagram({ compact: true }));

    /* 읽는 값 */
    var readout = el('div', 'measure-readout', panel);
    el('span', 'mr-label', readout, '지금 잰 지름');
    Measure.value = el('span', 'mr-value', readout, '0.0');
    el('span', 'mr-unit', readout, 'px');

    /* 안내 문구 */
    el('p', 'measure-rule', panel, Guide.TEXT.RULE);

    /* 조작 */
    var ctl = el('div', 'measure-ctl', panel);
    var zoomOut = el('button', 'btn btn-sm', ctl, '− 축소');
    var zoomIn = el('button', 'btn btn-sm', ctl, '+ 확대');
    var reset = el('button', 'btn btn-sm', ctl, '손잡이 제자리');
    zoomOut.type = zoomIn.type = reset.type = 'button';
    zoomOut.addEventListener('click', function () { Measure.setZoom(Measure.zoom / 1.3); });
    zoomIn.addEventListener('click', function () { Measure.setZoom(Measure.zoom * 1.3); });
    reset.addEventListener('click', function () { Measure.resetHandles(); });

    /* 기록 */
    var rec = el('div', 'measure-rec', panel);
    Measure.recList = el('div', 'mr-list', rec);
    var btns = el('div', 'mr-btns', rec);
    Measure.btnSave = el('button', 'btn btn-big btn-primary', btns, '기록하기');
    Measure.btnSave.type = 'button';
    Measure.btnSave.addEventListener('click', Measure.record);
    Measure.btnUndo = el('button', 'btn btn-sm', btns, '마지막 기록 취소');
    Measure.btnUndo.type = 'button';
    Measure.btnUndo.addEventListener('click', function () {
      State.undoMeasure(Measure.starId);
      Measure.renderRecords();
    });

    /* 별 사이 이동 */
    var move = el('div', 'measure-move', panel);
    Measure.btnPrev = el('button', 'btn btn-sm', move, '◂ 이전 별');
    Measure.btnNext = el('button', 'btn btn-sm', move, '다음 별 ▸');
    Measure.btnPrev.type = Measure.btnNext.type = 'button';
    Measure.btnPrev.addEventListener('click', function () { Measure.step(-1); });
    Measure.btnNext.addEventListener('click', function () { Measure.step(1); });

    // 배경을 눌러 닫기 + Esc
    back.addEventListener('click', function (ev) { if (ev.target === back) Measure.close(); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !back.hidden) Measure.close();
    });

    if (global.ResizeObserver) {
      new ResizeObserver(function () { Measure.layout(); }).observe(stage);
    }
  };

  /* ---------- 열기 / 닫기 ---------- */
  Measure.open = function (id) {
    Measure.build();
    var st = starById(id);
    if (!st) return;
    Measure.starId = id;

    Measure.title.textContent = st.id + '. ' + st.kor;
    Measure.sub.textContent = st.trad + (st.note ? ' · ' + st.note : '');

    var pin = Config.get('pins.' + id, null) ||
              { x: st.px.x / IMAGES.orion.w, y: st.px.y / IMAGES.orion.h };
    Measure.center = { x: pin.x * IMAGES.orion.w, y: pin.y * IMAGES.orion.h };

    Measure.back.hidden = false;
    document.body.classList.add('modal-open');

    // 무대 크기는 화면이 나타난 직후 바로 잴 수 있다.
    // (requestAnimationFrame 은 화면이 가려져 있으면 미뤄질 수 있어 쓰지 않는다)
    var setup = function () {
      Measure.measureStage();
      Measure.zoom = measureZoom(st.mag, Math.min(Measure.sw, Measure.sh) * 2);
      Measure.resetHandles();
      Measure.layout();
      Measure.renderRecords();
    };
    setup();
    setTimeout(setup, 60);   // 글꼴·이미지가 늦게 잡히는 기기 대비 한 번 더
  };

  /** 무대의 실제 크기를 재둔다 (정사각형이 아닐 수도 있다) */
  Measure.measureStage = function () {
    Measure.sw = (Measure.stage.clientWidth || 320) / 2;
    Measure.sh = (Measure.stage.clientHeight || 320) / 2;
    Measure.size = Math.min(Measure.sw, Measure.sh) * 2;
  };

  Measure.close = function () {
    if (!Measure.back) return;
    Measure.back.hidden = true;
    document.body.classList.remove('modal-open');
    if (Measure.onClose) Measure.onClose();
  };

  /** 다음/이전 별로 이동 */
  Measure.step = function (dir) {
    var idx = -1;
    for (var i = 0; i < STARS.length; i++) if (STARS[i].id === Measure.starId) idx = i;
    var next = STARS[(idx + dir + STARS.length) % STARS.length];
    Measure.open(next.id);
  };

  /* ---------- 손잡이 ---------- */
  Measure.resetHandles = function () {
    var st = starById(Measure.starId);
    var half = expectedMarkPx(st ? st.mag : 1) / 2;
    Measure.h1 = { x: Measure.center.x - half, y: Measure.center.y };
    Measure.h2 = { x: Measure.center.x + half, y: Measure.center.y };
    Measure.layout();
  };

  Measure.setZoom = function (z) {
    var st = starById(Measure.starId);
    var lo = Math.max(2, measureZoom(st ? st.mag : 1, Measure.size) * 0.5);
    Measure.zoom = clamp(z, lo, 24);
    Measure.layout();
  };

  /** 원본 픽셀 → 무대 픽셀 */
  Measure.toStage = function (p) {
    return {
      x: Measure.sw + (p.x - Measure.center.x) * Measure.zoom,
      y: Measure.sh + (p.y - Measure.center.y) * Measure.zoom
    };
  };
  /** 무대 픽셀 → 원본 픽셀 */
  Measure.toImage = function (x, y) {
    return {
      x: Measure.center.x + (x - Measure.sw) / Measure.zoom,
      y: Measure.center.y + (y - Measure.sh) / Measure.zoom
    };
  };

  Measure.bindHandle = function (node, which) {
    var dragging = false;
    node.addEventListener('pointerdown', function (ev) {
      dragging = true;
      try { node.setPointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
      ev.preventDefault();
      ev.stopPropagation();
    });
    node.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      var r = Measure.stage.getBoundingClientRect();
      Measure[which] = Measure.toImage(ev.clientX - r.left, ev.clientY - r.top);
      Measure.layout();
      ev.preventDefault();
      ev.stopPropagation();
    });
    var stop = function (ev) {
      if (!dragging) return;
      dragging = false;
      try { node.releasePointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
    };
    node.addEventListener('pointerup', stop);
    node.addEventListener('pointercancel', stop);
  };

  /** 손잡이가 아닌 곳을 끌면 그림이 따라 움직인다(핀이 살짝 빗나갔을 때) */
  Measure.bindPan = function (stage) {
    var dragging = false, lastX = 0, lastY = 0;
    stage.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest && ev.target.closest('.ms-handle')) return;
      dragging = true; lastX = ev.clientX; lastY = ev.clientY;
      try { stage.setPointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
      ev.preventDefault();
    });
    stage.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      Measure.center.x -= (ev.clientX - lastX) / Measure.zoom;
      Measure.center.y -= (ev.clientY - lastY) / Measure.zoom;
      lastX = ev.clientX; lastY = ev.clientY;
      Measure.layout();
      ev.preventDefault();
    });
    var stop = function (ev) {
      if (!dragging) return;
      dragging = false;
      try { stage.releasePointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
    };
    stage.addEventListener('pointerup', stop);
    stage.addEventListener('pointercancel', stop);
  };

  /* ---------- 그리기 ---------- */
  Measure.layout = function () {
    if (!Measure.built || Measure.back.hidden) return;
    Measure.measureStage();
    var im = IMAGES.orion, z = Measure.zoom;

    Measure.stage.style.backgroundImage = 'url("' + im.src + '")';
    Measure.stage.style.backgroundSize = (im.w * z) + 'px ' + (im.h * z) + 'px';
    Measure.stage.style.backgroundPosition =
      (-(Measure.center.x * z - Measure.sw)) + 'px ' + (-(Measure.center.y * z - Measure.sh)) + 'px';

    Measure.svg.setAttribute('viewBox', '0 0 ' + (Measure.sw * 2) + ' ' + (Measure.sh * 2));
    var p1 = Measure.toStage(Measure.h1), p2 = Measure.toStage(Measure.h2);
    Measure.line.setAttribute('x1', p1.x); Measure.line.setAttribute('y1', p1.y);
    Measure.line.setAttribute('x2', p2.x); Measure.line.setAttribute('y2', p2.y);
    Measure.hEl1.style.left = p1.x + 'px'; Measure.hEl1.style.top = p1.y + 'px';
    Measure.hEl2.style.left = p2.x + 'px'; Measure.hEl2.style.top = p2.y + 'px';

    Measure.value.textContent = Measure.diameter().toFixed(1);
  };

  /** 지금 잰 지름 (원본 이미지 픽셀) */
  Measure.diameter = function () {
    return Math.hypot(Measure.h1.x - Measure.h2.x, Measure.h1.y - Measure.h2.y);
  };

  /* ---------- 기록 ---------- */
  Measure.record = function () {
    var d = Measure.diameter();
    if (d < 0.5) { App.toast('두 손잡이를 별 자국 양 끝에 맞춰 주세요'); return; }
    var list = State.addMeasure(Measure.starId, d);
    Measure.renderRecords();
    App.toast(starById(Measure.starId).kor + ' ' + d.toFixed(1) + 'px 기록  ·  ' +
              State.measuredCount() + '/12개 완료');
    if (list.length >= 2) App.toast('두 번 잰 평균이 표에 들어갑니다', 2600);
  };

  Measure.renderRecords = function () {
    var id = Measure.starId;
    var list = State.measuresOf(id);
    var box = Measure.recList;
    box.innerHTML = '';

    if (!list.length) {
      el('span', 'mr-empty', box, '아직 기록이 없습니다. 손잡이를 맞추고 [기록하기]를 누르세요.');
      Measure.btnUndo.hidden = true;
      return;
    }
    Measure.btnUndo.hidden = false;

    for (var i = 0; i < list.length; i++) {
      var chip = el('span', 'mr-chip', box);
      chip.textContent = (i + 1) + '차 ' + list[i].toFixed(1) + 'px';
    }
    if (list.length >= 2) {
      var avg = State.averageOf(id);
      var a = el('span', 'mr-chip mr-avg', box);
      a.textContent = '평균 ' + avg.toFixed(1) + 'px';
    }
  };

  global.Measure = Measure;

})(window);
