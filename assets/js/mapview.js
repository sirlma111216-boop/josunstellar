/* ==========================================================================
   별지기 1395 — 지도 화면 부품들
     · MapView    : 각석본 지도 + 측정 핀 12개
     · StarZoom   : 한 별 주변만 확대해 보여주는 작은 창 (두 지도 공용)
     · CompareView: 두 지도를 손잡이로 밀어 바꿔 보는 창

   ★ 좌표 기준
     핀은 원본 이미지 정규화 좌표(0~1)로 저장한다.
     각석본과 채색본이 같은 영역·같은 축척이라 좌표계를 그대로 공유하므로,
     같은 (x,y)를 두 지도에 그대로 쓸 수 있다.
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
    this.renderPins();
  };

  MapView.prototype.observeSize = function () {
    var self = this;
    var redraw = function () { self.renderPins(); };
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
  function CompareView(host, opts) {
    var o = Object.assign({ left: IMAGES.color, right: IMAGES.orion,
                            leftName: '종이(채색본)', rightName: '돌(각석본)' }, opts || {});
    this.opts = o;

    var box = el('div', 'compare', host);
    this.box = box;
    box.style.aspectRatio = o.left.w + ' / ' + o.left.h;

    var a = document.createElement('img');
    a.className = 'cmp-img cmp-a'; a.src = o.left.src; a.alt = o.leftName; a.draggable = false;
    box.appendChild(a);

    var wrap = el('div', 'cmp-bwrap', box);
    var b = document.createElement('img');
    b.className = 'cmp-img cmp-b'; b.src = o.right.src; b.alt = o.rightName; b.draggable = false;
    wrap.appendChild(b);
    this.wrap = wrap;

    var bar = el('div', 'cmp-bar', box);
    el('span', 'cmp-grip', bar).textContent = '↔';
    this.bar = bar;

    var tagL = el('span', 'cmp-tag cmp-tag-l', box); tagL.textContent = o.leftName;
    var tagR = el('span', 'cmp-tag cmp-tag-r', box); tagR.textContent = o.rightName;

    // 손가락·마우스로 밀기
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

    // 슬라이더로도 조작 (터치가 어려운 경우 대비)
    var ctl = el('div', 'cmp-ctl', host);
    var lab = el('label', 'ctl-label', ctl);
    lab.textContent = '두 지도 밀어 보기';
    lab.htmlFor = 'cmpRange';
    var range = document.createElement('input');
    range.type = 'range'; range.id = 'cmpRange';
    range.min = 0; range.max = 100; range.value = 50;
    ctl.appendChild(range);
    range.addEventListener('input', function () { self.setPos(Number(range.value) / 100, true); });
    this.range = range;

    this.setPos(0.5);
  }

  CompareView.prototype.setPos = function (p, fromRange) {
    this.pos = p;
    this.wrap.style.clipPath = 'inset(0 0 0 ' + (p * 100) + '%)';
    this.bar.style.left = (p * 100) + '%';
    if (!fromRange && this.range) this.range.value = Math.round(p * 100);
  };

  global.MapView = MapView;
  global.StarZoom = StarZoom;
  global.CompareView = CompareView;
  global.missingBox = missingBox;

})(window);
