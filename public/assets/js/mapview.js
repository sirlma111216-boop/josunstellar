/* ==========================================================================
   Night Code 1395 — 지도 화면 부품들
     · MapView    : 각석본 지도 + 측정 핀 12개
     · StarZoom   : 한 별 주변만 확대해 보여주는 작은 창 (두 지도 공용)
     · CompareView: 두 지도를 손잡이로 밀어 바꿔 보는 창

   ★ 좌표 기준
     핀은 원본 이미지 정규화 좌표(0~1)로 저장한다.
     각석본과 채색본은 크롭이 달라 좌표가 그대로 통하지 않는다.
     설정의 colorTransform(교사가 두 지도에 같은 별을 표시해 준 대응으로 구함)으로 옮긴다.
   ========================================================================== */
(function (global) {
  'use strict';

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* 이미지가 없을 때 공통으로 쓰는 안내 */
  function missingBox(parent, src) {
    var m = el('div', 'map-missing', parent);
    m.innerHTML =
      '<span class="mm-icon" aria-hidden="true">🗺</span>' +
      '<b>교사용: assets 폴더에 이미지를 넣어 주세요</b>' +
      '<span>필요한 파일 <code>' + src + '</code></span>';
    return m;
  }

  /* ==========================================================================
     MapView — 각석본 전체 + 측정 핀
     ========================================================================== */
  function MapView(host, opts) {
    this.opts = Object.assign({
      img: IMAGES.orion,
      showPins: true,
      onPinTap: null,
      onPinSelect: null,
      onPinMove: null,
      onPinDragState: null
    }, opts || {});

    this.host = host;
    this.pinEls = {};
    this.selectedPin = null;
    this.pinEdit = false;

    this.build();
    this.observeSize();

    var self = this;
    this._onConfig = function () { self.renderPins(); };
    Config.onChange(this._onConfig);
    State.onChange(function () { self.renderPins(); });
  }

  MapView.prototype.build = function () {
    var im = this.opts.img;
    this.root = el('div', 'map-view', this.host);
    this.frame = el('div', 'map-frame', this.root);
    this.frame.style.aspectRatio = im.w + ' / ' + im.h;

    this.img = document.createElement('img');
    this.img.className = 'map-img';
    this.img.alt = '천상열차분야지도 각석의 삼수(오리온) 영역';
    this.img.decoding = 'async';
    this.img.draggable = false;
    this.frame.appendChild(this.img);

    this.missing = missingBox(this.frame, im.src);
    this.missing.hidden = true;

    var self = this;
    this.img.addEventListener('error', function () {
      self.missing.hidden = false;
      self.img.style.visibility = 'hidden';
    });
    this.img.src = im.src;

    this.pinLayer = el('div', 'pin-layer', this.frame);
    if (!this.opts.showPins) this.pinLayer.hidden = true;

    // 핀 편집 중에는 지도를 눌러 고른 핀을 그 자리로 옮긴다(끌기보다 훨씬 빠르다)
    var self2 = this;
    this.frame.addEventListener('click', function (ev) {
      if (!self2.pinEdit || !self2.selectedPin) return;
      if (ev.target.closest && ev.target.closest('.pin')) return;
      if (ev.target.closest && ev.target.closest('.pin-preview')) return;
      var r = self2.frame.getBoundingClientRect();
      self2.setPin(self2.selectedPin, (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
      if (self2.opts.onPinPlaced) self2.opts.onPinPlaced(self2.selectedPin);
    });

    this.renderPins();
  };

  /** 배경 이미지를 바꾼다(각석본 ↔ 채색본) — 좌표계가 같아 핀은 그대로 쓴다 */
  MapView.prototype.setImage = function (im) {
    this.opts.img = im;
    this.img.src = im.src;
    this.missing.hidden = true;
    this.alignImage();
  };

  /** 채색본을 띄울 때는 각석본 좌표계에 겹치도록 변환해 그린다 */
  MapView.prototype.alignImage = function () {
    var isColor = this.opts.img && this.opts.img.src === IMAGES.color.src;
    if (!isColor) { this.img.style.transform = ''; this.img.style.transformOrigin = ''; return; }
    this.img.style.transformOrigin = '0 0';
    this.img.style.transform = colorAlignMatrix(this.frame.clientWidth || 1);
  };

  MapView.prototype.observeSize = function () {
    var self = this;
    var redraw = function () { self.renderPins(); self.alignImage(); };
    if (global.ResizeObserver) {
      this._ro = new ResizeObserver(redraw);
      this._ro.observe(this.frame);
    } else {
      global.addEventListener('resize', redraw);
      global.addEventListener('orientationchange', redraw);
    }
  };

  MapView.prototype.frameSize = function () {
    return { w: this.frame.clientWidth, h: this.frame.clientHeight };
  };

  /** 핀의 이미지 정규화 좌표 */
  MapView.prototype.pinNorm = function (id) {
    var saved = Config.get('pins.' + id, null);
    if (saved && typeof saved.x === 'number') return saved;
    var st = starById(id);
    return st ? { x: st.px.x / IMAGES.orion.w, y: st.px.y / IMAGES.orion.h }
              : { x: 0.5, y: 0.5 };
  };

  MapView.prototype.setPin = function (id, u, v) {
    Config.data.pins[id] = {
      x: Number(clamp(u, 0, 1).toFixed(5)),
      y: Number(clamp(v, 0, 1).toFixed(5))
    };
    this.renderPins();
    // 핀을 옮길 때마다 바로 저장한다 — 새로고침해도 작업이 날아가지 않게
    try { Config.data.savedAt = new Date().toISOString(); Store.set('config', Config.data); } catch (e) { /* 무시 */ }
    if (this.opts.onPinMove) this.opts.onPinMove(id, u, v);
  };

  MapView.prototype.renderPins = function () {
    if (!this.opts.showPins || !this.pinLayer) return;
    for (var i = 0; i < STARS.length; i++) {
      var st = STARS[i];
      var pin = this.pinEls[st.id];
      if (!pin) {
        pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'pin';
        pin.dataset.star = st.id;
        this.pinLayer.appendChild(pin);
        this.pinEls[st.id] = pin;
        this.bindPin(pin, st.id);
      }
      var done = State.measuresOf(st.id).length;
      // 색만이 아니라 ✓ 표시와 글자로도 완료를 알린다
      pin.innerHTML = '<span class="pin-dot">' + (done ? '✓' : st.id) + '</span>';
      pin.classList.toggle('is-done', !!done);
      pin.setAttribute('aria-label',
        st.id + '번 ' + st.kor + (done ? ' — ' + done + '회 측정함' : ' — 아직 측정 안 함'));

      var n = this.pinNorm(st.id);
      pin.style.left = (n.x * 100) + '%';
      pin.style.top = (n.y * 100) + '%';
    }
  };

  /** 화면에서 겹쳐 보이는 핀 모으기 (허리띠 세 별 등)
      ① 화면 44px 안 ② 원본 120px 안 — 둘 다 만족해야 한 군집 */
  MapView.prototype.clusterOf = function (id) {
    var size = this.frameSize();
    var here = this.pinNorm(id);
    var out = [];
    for (var i = 0; i < STARS.length; i++) {
      var n = this.pinNorm(STARS[i].id);
      var dScreen = Math.hypot((n.x - here.x) * size.w, (n.y - here.y) * size.h);
      var dImg = Math.hypot((n.x - here.x) * IMAGES.orion.w, (n.y - here.y) * IMAGES.orion.h);
      if (dScreen <= 44 && dImg <= MARK_PX.max * 2) out.push(STARS[i].id);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  };

  MapView.prototype.bindPin = function (pin, id) {
    var self = this;
    var dragging = false, moved = false;

    pin.addEventListener('pointerdown', function (ev) {
      if (!self.pinEdit) return;
      dragging = true; moved = false;
      try { pin.setPointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
      ev.preventDefault();
      self.selectPin(id);
      if (self.opts.onPinDragState) self.opts.onPinDragState(id, true);
    });

    pin.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      moved = true;
      var r = self.frame.getBoundingClientRect();
      self.setPin(id, (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
      ev.preventDefault();
    });

    var end = function (ev) {
      if (!dragging) return;
      dragging = false;
      try { pin.releasePointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
      if (self.opts.onPinDragState) self.opts.onPinDragState(id, false);
    };
    pin.addEventListener('pointerup', end);
    pin.addEventListener('pointercancel', end);

    pin.addEventListener('click', function (ev) {
      if (moved) return;
      if (self.pinEdit) {
        // 겹쳐 있는 핀은 반복해 누르면 차례로 선택된다
        var cl = self.clusterOf(id), next = id;
        if (cl.length > 1) {
          var at = cl.indexOf(self.selectedPin);
          next = (at >= 0) ? cl[(at + 1) % cl.length] : cl[0];
        }
        self.selectPin(next);
        return;
      }
      if (self.opts.onPinTap) self.opts.onPinTap(id, ev);
    });
  };

  MapView.prototype.selectPin = function (id) {
    this.selectedPin = id === null ? null : Number(id);
    for (var k in this.pinEls) {
      if (!Object.prototype.hasOwnProperty.call(this.pinEls, k)) continue;
      this.pinEls[k].classList.toggle('is-selected', Number(k) === this.selectedPin);
    }
    if (this.opts.onPinSelect) this.opts.onPinSelect(this.selectedPin);
  };

  MapView.prototype.setPinEdit = function (on) {
    this.pinEdit = !!on;
    this.root.classList.toggle('pin-edit', this.pinEdit);
    if (!on) this.selectPin(null);
  };

  /* ==========================================================================
     StarZoom — 한 별 주변만 확대한 작은 창
     두 지도가 좌표계를 공유하므로 img 만 바꾸면 같은 자리가 나온다.
     ========================================================================== */
  function StarZoom(host, opts) {
    this.opts = Object.assign({
      img: IMAGES.orion, u: 0.5, v: 0.5, zoom: 4, size: 120, label: '', crosshair: false
    }, opts || {});
    this.box = el('div', 'star-zoom', host);
    this.stage = el('div', 'sz-stage', this.box);
    if (this.opts.crosshair) el('div', 'sz-cross', this.stage);
    if (this.opts.label) {
      this.cap = el('span', 'sz-cap', this.box);
      this.cap.textContent = this.opts.label;
    }
    this.apply();
  }

  StarZoom.prototype.apply = function () {
    var o = this.opts;
    this.stage.style.width = o.size + 'px';
    this.stage.style.height = o.size + 'px';
    this.stage.style.backgroundImage = 'url("' + o.img.src + '")';
    this.stage.style.backgroundSize = (o.img.w * o.zoom) + 'px ' + (o.img.h * o.zoom) + 'px';
    this.stage.style.backgroundPosition =
      (-(o.u * o.img.w * o.zoom - o.size / 2)) + 'px ' +
      (-(o.v * o.img.h * o.zoom - o.size / 2)) + 'px';
  };

  StarZoom.prototype.set = function (patch) {
    Object.assign(this.opts, patch);
    if (patch.label !== undefined && this.cap) this.cap.textContent = patch.label;
    this.apply();
  };

  /* ==========================================================================
     CompareView — 두 지도를 손잡이로 밀어 바꿔 보기
     ========================================================================== */
  /** 채색본이 각석본을 덮지 못하는 위쪽 여백(각석본 픽셀) */
  function coverTop() {
    var T = Config.get('colorTransform', { a: 1, b: 0, tx: 0, ty: 0 });
    var s2 = T.a * T.a + T.b * T.b;
    // 채색본 y=0 이 각석본에서 몇 픽셀인지
    var y0 = (T.b * (0 - T.tx) + T.a * (0 - T.ty)) / s2;
    return Math.max(0, Math.ceil(y0) + 4);
  }

  function CompareView(host, opts) {
    var o = Object.assign({
      a: IMAGES.color, b: IMAGES.orion,
      aName: '종이(채색본)', bName: '돌(각석본)', cName: '실제 밤하늘'
    }, opts || {});
    this.opts = o;

    var box = el('div', 'compare', host);
    this.box = box;
    // 두 지도가 함께 덮는 영역만 보여 준다
    var top = coverTop();
    this.cropTop = top;
    this.cropH = o.b.h - top;
    box.style.aspectRatio = o.b.w + ' / ' + this.cropH;

    // 하늘에 있던 별이 → 종이에 옮겨지고 → 돌에 새겨지기까지의 순서로 쌓는다.

    // ① 실제 밤하늘 — 맨 아래. 각석본의 자국을 밝기로 읽어 코드로 그린다
    var cvs = document.createElement('canvas');
    cvs.className = 'cmp-sky';        // 자리 잡기는 style.css 의 .cmp-sky 가 한다
    box.appendChild(cvs);
    this.canvas = cvs;

    // ② 종이(채색본) — 크롭이 달라 각석본 좌표계에 맞춰 그린다
    var wrapA = el('div', 'cmp-layer', box);
    var imgA = document.createElement('img');
    imgA.className = 'cmp-img'; imgA.src = o.a.src; imgA.alt = o.aName; imgA.draggable = false;
    this.liftLayer(imgA);
    wrapA.appendChild(imgA);
    this.wrapA = wrapA; this.imgA = imgA;

    // ③ 돌(각석본) — 맨 위
    var wrapB = el('div', 'cmp-layer', box);
    var imgB = document.createElement('img');
    imgB.className = 'cmp-img'; imgB.src = o.b.src; imgB.alt = o.bName; imgB.draggable = false;
    this.liftLayer(imgB);
    wrapB.appendChild(imgB);
    this.wrapB = wrapB;

    var bar = el('div', 'cmp-bar', box);
    var grip = el('span', 'cmp-grip', bar); grip.textContent = '↔';
    this.bar = bar;

    this.tagL = el('span', 'cmp-tag cmp-tag-l', box);
    this.tagR = el('span', 'cmp-tag cmp-tag-r', box);

    var self = this, dragging = false;
    function at(ev) {
      var r = box.getBoundingClientRect();
      self.setPos(clamp((ev.clientX - r.left) / r.width, 0, 1));
    }
    box.addEventListener('pointerdown', function (ev) {
      dragging = true;
      try { box.setPointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
      at(ev); ev.preventDefault();
    });
    box.addEventListener('pointermove', function (ev) { if (dragging) { at(ev); ev.preventDefault(); } });
    var stop = function (ev) {
      if (!dragging) return;
      dragging = false;
      try { box.releasePointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
    };
    box.addEventListener('pointerup', stop);
    box.addEventListener('pointercancel', stop);

    // 슬라이더 + 세 단계 눈금
    var ctl = el('div', 'cmp-ctl', host);
    var range = document.createElement('input');
    range.type = 'range'; range.min = 0; range.max = 100; range.value = 0;
    range.setAttribute('aria-label', '밤하늘에서 종이로, 종이에서 돌로 밀어 보기');
    ctl.appendChild(range);
    range.addEventListener('input', function () { self.setPos(Number(range.value) / 100, true); });
    this.range = range;

    var marks = el('div', 'cmp-marks', host);
    [[0, o.cName], [0.5, o.aName], [1, o.bName]].forEach(function (mk) {
      var b = el('button', 'cmp-mark', marks);
      b.textContent = mk[1];
      b.type = 'button';
      b.addEventListener('click', function () { self.setPos(mk[0]); });
    });

    this.resize();
    if (global.ResizeObserver) new ResizeObserver(function () { self.resize(); }).observe(box);
    this.setPos(0);
  }

  /** 잘라낸 위쪽 여백만큼 층을 끌어올린다 */
  CompareView.prototype.liftLayer = function (node) {
    node.style.position = 'absolute';
    node.style.left = '0';
    node.style.width = '100%';
    node.style.height = (this.opts.b.h / this.cropH * 100) + '%';
    node.style.top = (-this.cropTop / this.cropH * 100) + '%';
  };

  /** 크기가 바뀌면 채색본 정렬과 밤하늘을 다시 그린다 */
  CompareView.prototype.resize = function () {
    var w = this.box.clientWidth, h = this.box.clientHeight;
    if (!w || !h) return;
    if (this.opts.a.src === IMAGES.color.src) {
      this.imgA.style.transformOrigin = '0 0';
      this.imgA.style.transform = colorAlignMatrix(w);
    }
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      drawNightSky(this.canvas, this.cropTop);
    }
  };

  /**
   * 손잡이를 오른쪽으로 밀면 새 층이 왼쪽에서부터 덮어 온다.
   *   0 → 0.5 : 밤하늘 위로 종이가
   *   0.5 → 1 : 종이 위로 돌이
   * 새 층은 오른쪽을 잘라 두었다가(inset 의 right) 그 값을 줄여 가며 펼친다.
   */
  CompareView.prototype.setPos = function (p, fromRange) {
    this.pos = p;
    var o = this.opts, grow;
    if (p <= 0.5) {
      grow = (p / 0.5) * 100;                       // 종이가 덮은 폭(%)
      this.wrapA.style.clipPath = 'inset(0 ' + (100 - grow) + '% 0 0)';
      this.wrapB.style.clipPath = 'inset(0 100% 0 0)';
      this.tagL.textContent = o.aName;              // 왼쪽 = 새로 덮은 층
      this.tagR.textContent = o.cName;              // 오른쪽 = 아직 남은 층
    } else {
      grow = ((p - 0.5) / 0.5) * 100;               // 돌이 덮은 폭(%)
      this.wrapA.style.clipPath = 'inset(0 0 0 0)';
      this.wrapB.style.clipPath = 'inset(0 ' + (100 - grow) + '% 0 0)';
      this.tagL.textContent = o.bName;
      this.tagR.textContent = o.aName;
    }
    this.bar.style.left = grow + '%';   // 손잡이는 잘린 경계와 같은 자리에
    var noneNew = grow <= 0.5;          // 새 층이 아직 안 보임
    var allNew = grow >= 99.5;          // 새 층이 다 덮음
    this.bar.hidden = noneNew || allNew;
    this.tagL.hidden = noneNew;
    this.tagR.hidden = allNew;
    if (!fromRange && this.range) this.range.value = Math.round(p * 100);
  };

  global.MapView = MapView;
  global.StarZoom = StarZoom;
  global.CompareView = CompareView;
  global.missingBox = missingBox;

})(window);
