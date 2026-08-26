/* ==========================================================================
   별지기 1395 — 지도 뷰 공용 컴포넌트
   천문도 이미지(자르기·회전·반전) 위에
   ① 현대 성도 SVG 레이어  ② 측정 핀 레이어 를 같은 좌표계로 얹는다.
   두 탭이 이 컴포넌트를 함께 쓴다.
   ========================================================================== */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  function svgEl(tag, parent) {
    var n = document.createElementNS(SVG_NS, tag);
    if (parent) parent.appendChild(n);
    return n;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /**
   * @param {HTMLElement} host  컴포넌트를 붙일 자리
   * @param {Object} opts
   *   src        : 이미지 경로
   *   showSky    : 현대 성도 레이어 표시
   *   showPins   : 측정 핀 표시
   *   starTappable : 성도의 별을 터치할 수 있게(미션용)
   *   onStarTap  : function(starId, ev)
   *   onPinTap   : function(starId, ev)
   *   onPinMove  : function(starId, x, y)  핀 편집 중 이동
   */
  function MapView(host, opts) {
    this.opts = Object.assign({
      src: IMAGES.orion,
      showSky: true,
      showPins: false,
      starTappable: false,
      onStarTap: null,
      onPinTap: null,
      onPinMove: null
    }, opts || {});

    this.host = host;
    this.imageReady = false;
    this.naturalW = 0;
    this.naturalH = 0;
    this.pinEls = {};
    this.selectedPin = null;
    this.pinEdit = false;
    this.opacityOverride = null;   // 학생이 슬라이더로 정한 값(설정값보다 우선)

    this.build();
    this.bindImage();
    this.observeSize();

    // 설정이 바뀌면 즉시 다시 그린다
    var self = this;
    this._onConfig = function () { self.applyAll(); };
    Config.onChange(this._onConfig);
    this.applyAll();
  }

  /* ---------- DOM 만들기 ---------- */
  MapView.prototype.build = function () {
    this.root = el('div', 'map-view', this.host);
    this.frame = el('div', 'map-frame', this.root);

    this.rot = el('div', 'map-rot', this.frame);

    this.img = document.createElement('img');
    this.img.className = 'map-img';
    this.img.alt = '천상열차분야지도 삼수 영역';
    this.img.decoding = 'async';
    this.img.loading = 'lazy';       // 저사양 태블릿 첫 로드 부담을 줄인다
    this.img.draggable = false;
    this.rot.appendChild(this.img);

    // 이미지가 없을 때 보여줄 안내
    this.missing = el('div', 'map-missing', this.frame);
    this.missing.innerHTML =
      '<span class="mm-icon" aria-hidden="true">🗺</span>' +
      '<b>교사용: assets 폴더에 이미지를 넣어 주세요</b>' +
      '<span>필요한 파일 <code>' + this.opts.src + '</code></span>' +
      '<span>이미지가 없어도 현대 성도 레이어와 핀은 그대로 동작합니다.</span>';

    // 현대 성도 SVG
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'sky-layer');
    this.svg.setAttribute('preserveAspectRatio', 'none');
    this.svg.setAttribute('aria-hidden', 'true');
    this.frame.appendChild(this.svg);
    this.skyG = svgEl('g', this.svg);

    // 측정 핀
    this.pinLayer = el('div', 'pin-layer', this.frame);

    if (!this.opts.showSky) this.svg.style.display = 'none';
    if (!this.opts.showPins) this.pinLayer.style.display = 'none';
  };

  /* ---------- 이미지 로드 (실패해도 앱은 계속 동작) ---------- */
  MapView.prototype.bindImage = function () {
    var self = this;
    this.img.addEventListener('load', function () {
      self.imageReady = true;
      self.naturalW = self.img.naturalWidth || 1;
      self.naturalH = self.img.naturalHeight || 1;
      self.missing.hidden = true;
      self.img.style.visibility = 'visible';
      self.applyImage();
      self.renderSky();
      self.renderPins();
    });
    this.img.addEventListener('error', function () {
      self.imageReady = false;
      self.missing.hidden = false;
      self.img.style.visibility = 'hidden';
    });
    this.img.style.visibility = 'hidden';
    this.img.src = this.opts.src;
  };

  /* ---------- 크기 변화 감지 ---------- */
  MapView.prototype.observeSize = function () {
    var self = this;
    var redraw = function () { self.renderSky(); self.renderPins(); };
    if (global.ResizeObserver) {
      this._ro = new ResizeObserver(redraw);
      this._ro.observe(this.frame);
    } else {
      this._onResize = redraw;
      global.addEventListener('resize', redraw);
      global.addEventListener('orientationchange', redraw);
    }
  };

  /* ---------- 설정 반영 ---------- */
  MapView.prototype.applyAll = function () {
    this.applyImage();
    this.renderSky();
    this.renderPins();
  };

  /** 자르기 · 회전 · 반전 · 확대 */
  MapView.prototype.applyImage = function () {
    var c = Config.get('image', {});
    var crop = c.crop || { x: 0, y: 0, w: 1, h: 1 };
    var cw = Math.max(0.02, crop.w), ch = Math.max(0.02, crop.h);

    // 프레임 비율을 잘라낸 영역의 비율에 맞춰야 사진이 찌그러지지 않는다
    if (this.imageReady) {
      var ar = (this.naturalW * cw) / (this.naturalH * ch);
      this.frame.style.aspectRatio = (this.naturalW * cw) + ' / ' + (this.naturalH * ch);
      this.root.style.setProperty('--frame-ar', ar.toFixed(4));
    }

    this.img.style.width = (100 / cw) + '%';
    this.img.style.height = (100 / ch) + '%';
    this.img.style.left = (-crop.x / cw * 100) + '%';
    this.img.style.top = (-crop.y / ch * 100) + '%';

    this.rot.style.transform =
      'rotate(' + (c.rotate || 0) + 'deg)' +
      ' scaleX(' + (c.flipX ? -1 : 1) + ')' +
      ' scale(' + (c.zoom || 1) + ')';
  };

  /* ---------- 성도 좌표 → 화면 픽셀 ---------- */
  MapView.prototype.frameSize = function () {
    return { w: this.frame.clientWidth, h: this.frame.clientHeight };
  };

  /** 성도 좌표계(sky) 한 점을 프레임 픽셀 좌표로 옮긴다 */
  MapView.prototype.projector = function () {
    var size = this.frameSize();
    var s = Config.get('sky', {});
    var unit = Math.min(size.w, size.h) / SKY_SPACE.h * (s.scale || 1);
    var cx = (0.5 + (s.ox || 0)) * size.w;
    var cy = (0.5 + (s.oy || 0)) * size.h;
    var rad = (s.rot || 0) * Math.PI / 180;
    var co = Math.cos(rad), si = Math.sin(rad);

    return {
      unit: unit,
      size: size,
      at: function (p) {
        var dx = (p.x - SKY_SPACE.cx) * unit;
        var dy = (p.y - SKY_SPACE.cy) * unit;
        return { x: cx + dx * co - dy * si, y: cy + dx * si + dy * co };
      }
    };
  };

  /** 별 id → 프레임 기준 0~1 좌표 (핀 기본 위치, 미션 판정에 사용) */
  MapView.prototype.starNorm = function (id) {
    var st = starById(id);
    if (!st) return { x: 0.5, y: 0.5 };
    var pr = this.projector();
    if (!pr.size.w || !pr.size.h) return { x: 0.5, y: 0.5 };
    var p = pr.at(st.sky);
    return { x: p.x / pr.size.w, y: p.y / pr.size.h };
  };

  /* ---------- 현대 성도 그리기 ---------- */
  MapView.prototype.renderSky = function () {
    if (!this.opts.showSky) return;
    var size = this.frameSize();
    if (!size.w || !size.h) return;

    this.svg.setAttribute('viewBox', '0 0 ' + size.w + ' ' + size.h);
    var sky = Config.get('sky', {});
    this.svg.style.opacity = (this.opacityOverride !== null)
      ? this.opacityOverride
      : (sky.opacity === undefined ? 0.6 : sky.opacity);

    var pr = this.projector();
    var pos = {};
    for (var i = 0; i < STARS.length; i++) pos[STARS[i].id] = pr.at(STARS[i].sky);

    // 다시 그리기 (별 12개 + 선 10개라 통째로 그려도 충분히 가볍다)
    while (this.skyG.firstChild) this.skyG.removeChild(this.skyG.firstChild);

    // 별자리 선
    for (var L = 0; L < ORION_LINES.length; L++) {
      var a = pos[ORION_LINES[L][0]], b = pos[ORION_LINES[L][1]];
      if (!a || !b) continue;
      var ln = svgEl('line', this.skyG);
      ln.setAttribute('class', 'sky-line');
      ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y);
      ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
    }

    // 별 (밝을수록 큰 원)
    var self = this;
    for (var k = 0; k < STARS.length; k++) {
      var st = STARS[k];
      var p = pos[st.id];
      var r = Math.max(1.5, magToRadius(st.mag) * pr.unit);

      var c = svgEl('circle', this.skyG);
      c.setAttribute('class', 'sky-star');
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', r);
      c.setAttribute('data-star', st.id);

      if (this.opts.starTappable) {
        // 손가락으로 누르기 쉽도록 투명한 넓은 원을 덧댄다(최소 44px 지름)
        var hit = svgEl('circle', this.skyG);
        hit.setAttribute('cx', p.x); hit.setAttribute('cy', p.y);
        hit.setAttribute('r', Math.max(22, r * 1.8));
        hit.setAttribute('fill', 'transparent');
        hit.setAttribute('data-star', st.id);
        hit.style.pointerEvents = 'auto';
        hit.style.cursor = 'pointer';
        (function (id) {
          hit.addEventListener('click', function (ev) {
            if (self.opts.onStarTap) self.opts.onStarTap(id, ev);
          });
        })(st.id);
      }

      if (sky.showLabel) {
        var t = svgEl('text', this.skyG);
        t.setAttribute('class', 'sky-label');
        t.setAttribute('x', p.x + r + 3);
        t.setAttribute('y', p.y + 3);
        t.textContent = st.kor;
      }
    }
  };

  /** 성도 레이어 불투명도만 빠르게 바꾸기 (슬라이더용) */
  MapView.prototype.setSkyOpacity = function (v) {
    this.opacityOverride = v;
    this.svg.style.opacity = v;
  };

  /* ---------- 측정 핀 ---------- */
  MapView.prototype.pinNorm = function (id) {
    var saved = Config.get('pins.' + id, null);
    if (saved && typeof saved.x === 'number') return saved;
    return this.starNorm(id);   // 아직 배치 전이면 성도 위치를 기본값으로
  };

  MapView.prototype.renderPins = function () {
    if (!this.opts.showPins) return;
    var size = this.frameSize();
    if (!size.w || !size.h) return;

    for (var i = 0; i < STARS.length; i++) {
      var st = STARS[i];
      var pin = this.pinEls[st.id];
      if (!pin) {
        pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'pin';
        pin.setAttribute('data-num', st.id);
        pin.setAttribute('data-star', st.id);
        pin.setAttribute('aria-label', st.id + '번 ' + st.kor + ' 측정하기');
        this.pinLayer.appendChild(pin);
        this.pinEls[st.id] = pin;
        this.bindPin(pin, st.id);
      }
      var p = this.pinNorm(st.id);
      pin.style.left = (p.x * 100) + '%';
      pin.style.top = (p.y * 100) + '%';
    }
  };

  MapView.prototype.bindPin = function (pin, id) {
    var self = this;
    var dragging = false, moved = false;

    pin.addEventListener('pointerdown', function (ev) {
      if (!self.pinEdit) return;
      dragging = true; moved = false;
      // 포인터 캡처 실패(구형 사파리 등)해도 드래그는 계속되도록
      try { pin.setPointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
      ev.preventDefault();
      self.selectPin(id);
    });

    pin.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      moved = true;
      var r = self.frame.getBoundingClientRect();
      var x = clamp((ev.clientX - r.left) / r.width, 0, 1);
      var y = clamp((ev.clientY - r.top) / r.height, 0, 1);
      pin.style.left = (x * 100) + '%';
      pin.style.top = (y * 100) + '%';
      Config.data.pins[id] = { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) };
      if (self.opts.onPinMove) self.opts.onPinMove(id, x, y);
      ev.preventDefault();
    });

    var end = function (ev) {
      if (!dragging) return;
      dragging = false;
      try { pin.releasePointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
    };
    pin.addEventListener('pointerup', end);
    pin.addEventListener('pointercancel', end);

    pin.addEventListener('click', function (ev) {
      if (self.pinEdit) { self.selectPin(id); return; }   // 편집 중엔 선택만
      if (moved) return;
      if (self.opts.onPinTap) self.opts.onPinTap(id, ev);
    });
  };

  MapView.prototype.selectPin = function (id) {
    this.selectedPin = id;
    for (var k in this.pinEls) {
      if (!Object.prototype.hasOwnProperty.call(this.pinEls, k)) continue;
      this.pinEls[k].classList.toggle('is-selected', Number(k) === Number(id));
    }
  };

  MapView.prototype.setPinEdit = function (on) {
    this.pinEdit = !!on;
    this.root.classList.toggle('pin-edit', this.pinEdit);
    if (!on) this.selectPin(null);
  };

  /** 핀 12개를 현재 성도 위치로 한 번에 배치 */
  MapView.prototype.autoPlacePins = function () {
    for (var i = 0; i < STARS.length; i++) {
      var p = this.starNorm(STARS[i].id);
      Config.data.pins[STARS[i].id] = { x: Number(p.x.toFixed(4)), y: Number(p.y.toFixed(4)) };
    }
    this.renderPins();
  };

  MapView.prototype.setSrc = function (src) {
    this.opts.src = src;
    this.img.src = src;
  };

  global.MapView = MapView;

})(window);
