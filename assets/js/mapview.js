/* ==========================================================================
   별지기 1395 — 지도 뷰 공용 컴포넌트
   천문도 이미지(자르기·회전·반전) 위에
   ① 현대 성도 SVG 레이어  ② 측정 핀 레이어 를 같은 좌표계로 얹는다.

   ★ 좌표 기준
     핀과 성도는 모두 "원본 이미지 좌표"로 저장하고, 화면에 그릴 때만
     자르기 → 확대 → 좌우반전 → 회전 순서로 프레임 픽셀로 옮긴다.
     (CSS 의 transform: rotate() scaleX() scale() 과 같은 순서)
     덕분에 교사가 자르기·회전을 나중에 고쳐도 확정한 핀이 따라 움직인다.
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
   *   src          : 이미지 경로
   *   showSky      : 현대 성도 레이어 표시
   *   showPins     : 측정 핀 표시
   *   starTappable : 성도의 별을 터치할 수 있게(미션용)
   *   onStarTap    : function(starId, ev)
   *   onPinTap     : function(starId, ev)
   *   onPinMove    : function(starId, u, v)   핀 편집 중 이동(이미지 정규화 좌표)
   *   onPinSelect  : function(starId)
   */
  function MapView(host, opts) {
    this.opts = Object.assign({
      src: IMAGES.orion.src,
      showSky: true,
      showPins: false,
      starTappable: false,
      onStarTap: null,
      onPinTap: null,
      onPinMove: null,
      onPinSelect: null
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
    this.img.alt = '천상열차분야지도 각석의 삼수(오리온) 영역';
    this.img.decoding = 'async';
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
      self.applyAll();
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
      global.addEventListener('resize', redraw);
      global.addEventListener('orientationchange', redraw);
    }
  };

  /* ==========================================================================
     좌표 변환
     ========================================================================== */

  /** 원본 이미지 크기 — 아직 안 불러왔으면 설정에 적힌 규격을 쓴다 */
  MapView.prototype.imgSize = function () {
    if (this.imageReady) return { w: this.naturalW, h: this.naturalH };
    return {
      w: Config.get('image.width', IMAGES.orion.w),
      h: Config.get('image.height', IMAGES.orion.h)
    };
  };

  MapView.prototype.frameSize = function () {
    return { w: this.frame.clientWidth, h: this.frame.clientHeight };
  };

  /** 현재 변환에 쓰이는 값들을 한 번에 계산 */
  MapView.prototype.xform = function () {
    var c = Config.get('image', {});
    var crop = c.crop || { x: 0, y: 0, w: 1, h: 1 };
    var cw = Math.max(0.02, crop.w), ch = Math.max(0.02, crop.h);
    var z = c.zoom || 1;
    var rad = (c.rotate || 0) * Math.PI / 180;
    var img = this.imgSize();
    var fr = this.frameSize();
    return {
      cx: crop.x, cy: crop.y, cw: cw, ch: ch,
      z: z, flip: c.flipX ? -1 : 1,
      co: Math.cos(rad), si: Math.sin(rad),
      W: fr.w, H: fr.h, iw: img.w, ih: img.h,
      // 이미지 1px 이 프레임에서 차지하는 픽셀 수 (가로·세로 동일)
      s: (fr.w / (cw * img.w)) * z
    };
  };

  /** 이미지 정규화 좌표(0~1) → 프레임 픽셀 */
  MapView.prototype.imageToFrame = function (u, v, t) {
    t = t || this.xform();
    var a = (u - t.cx) / t.cw;
    var b = (v - t.cy) / t.ch;
    var dx = (a - 0.5) * t.W * t.z;
    var dy = (b - 0.5) * t.H * t.z;
    dx *= t.flip;
    return {
      x: t.W / 2 + (dx * t.co - dy * t.si),
      y: t.H / 2 + (dx * t.si + dy * t.co)
    };
  };

  /** 프레임 픽셀 → 이미지 정규화 좌표(0~1) */
  MapView.prototype.frameToImage = function (fx, fy, t) {
    t = t || this.xform();
    var X = fx - t.W / 2, Y = fy - t.H / 2;
    var rx = X * t.co + Y * t.si;      // 회전 되돌리기
    var ry = -X * t.si + Y * t.co;
    rx *= t.flip;                      // 반전 되돌리기
    var a = rx / (t.W * t.z) + 0.5;
    var b = ry / (t.H * t.z) + 0.5;
    return { x: a * t.cw + t.cx, y: b * t.ch + t.cy };
  };

  /** 이미지 픽셀 좌표 → 프레임 픽셀 */
  MapView.prototype.imagePxToFrame = function (px, py, t) {
    t = t || this.xform();
    return this.imageToFrame(px / t.iw, py / t.ih, t);
  };

  /** 성도 좌표(sky) → 원본 이미지 픽셀 */
  MapView.prototype.skyToImagePx = function (p) {
    var s = Config.get('sky', {});
    var rad = (s.rot || 0) * Math.PI / 180;
    var co = Math.cos(rad), si = Math.sin(rad);
    var k = s.k || 15;
    var dx = p.x - SKY_SPACE.cx, dy = p.y - SKY_SPACE.cy;
    return {
      x: (s.cx || 0) + k * (co * dx - si * dy),
      y: (s.cy || 0) + k * (si * dx + co * dy)
    };
  };

  /* ---------- 설정 반영 ---------- */
  MapView.prototype.applyAll = function () {
    this.applyImage();
    this.renderSky();
    this.renderPins();
  };

  /** 자르기 · 회전 · 반전 · 확대 */
  MapView.prototype.applyImage = function () {
    var t = this.xform();

    // 프레임 비율은 잘라낸 영역의 비율과 같아야 사진이 찌그러지지 않는다.
    // 이미지를 아직 못 불러왔어도 설정에 적힌 규격으로 미리 맞춰 둔다.
    var ar = (t.iw * t.cw) / (t.ih * t.ch);
    this.frame.style.aspectRatio = (t.iw * t.cw) + ' / ' + (t.ih * t.ch);
    this.root.style.setProperty('--frame-ar', ar.toFixed(4));

    this.img.style.width = (100 / t.cw) + '%';
    this.img.style.height = (100 / t.ch) + '%';
    this.img.style.left = (-t.cx / t.cw * 100) + '%';
    this.img.style.top = (-t.cy / t.ch * 100) + '%';

    var c = Config.get('image', {});
    this.rot.style.transform =
      'rotate(' + (c.rotate || 0) + 'deg)' +
      ' scaleX(' + (c.flipX ? -1 : 1) + ')' +
      ' scale(' + (c.zoom || 1) + ')';
  };

  /* ---------- 현대 성도 그리기 ---------- */
  MapView.prototype.renderSky = function () {
    if (!this.opts.showSky) return;
    var t = this.xform();
    if (!t.W || !t.H) return;

    this.svg.setAttribute('viewBox', '0 0 ' + t.W + ' ' + t.H);
    var sky = Config.get('sky', {});
    this.svg.style.opacity = (this.opacityOverride !== null)
      ? this.opacityOverride
      : (sky.opacity === undefined ? 0.6 : sky.opacity);

    // 성도 → 이미지 픽셀 → 프레임 픽셀
    var pos = {}, i;
    for (i = 0; i < STARS.length; i++) {
      var ip = this.skyToImagePx(STARS[i].sky);
      pos[STARS[i].id] = this.imagePxToFrame(ip.x, ip.y, t);
    }
    // 성도 1단위가 화면에서 차지하는 픽셀
    var unit = (sky.k || 15) * t.s;

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
      var r = Math.max(1.5, magToRadius(st.mag) * unit);

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
        var tx = svgEl('text', this.skyG);
        tx.setAttribute('class', 'sky-label');
        tx.setAttribute('x', p.x + r + 3);
        tx.setAttribute('y', p.y + 3);
        tx.textContent = st.kor;
      }
    }
  };

  /** 성도 레이어 불투명도만 빠르게 바꾸기 (슬라이더용) */
  MapView.prototype.setSkyOpacity = function (v) {
    this.opacityOverride = v;
    this.svg.style.opacity = v;
  };

  /* ---------- 측정 핀 ---------- */

  /** 핀의 이미지 정규화 좌표 */
  MapView.prototype.pinNorm = function (id) {
    var saved = Config.get('pins.' + id, null);
    if (saved && typeof saved.x === 'number') return saved;
    var st = starById(id);
    return st ? { x: st.px.x / IMAGES.orion.w, y: st.px.y / IMAGES.orion.h }
              : { x: 0.5, y: 0.5 };
  };

  /** 핀 위치를 이미지 정규화 좌표로 지정 */
  MapView.prototype.setPin = function (id, u, v) {
    Config.data.pins[id] = {
      x: Number(clamp(u, 0, 1).toFixed(5)),
      y: Number(clamp(v, 0, 1).toFixed(5))
    };
    this.renderPins();
    if (this.opts.onPinMove) this.opts.onPinMove(id, u, v);
  };

  MapView.prototype.renderPins = function () {
    if (!this.opts.showPins) return;
    var t = this.xform();
    if (!t.W || !t.H) return;

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
      var n = this.pinNorm(st.id);
      var p = this.imageToFrame(n.x, n.y, t);
      pin.style.left = (p.x / t.W * 100) + '%';
      pin.style.top = (p.y / t.H * 100) + '%';
      // 잘라낸 영역 밖으로 나간 핀은 숨긴다(교사가 자르기를 좁혔을 때)
      var out = p.x < -20 || p.y < -20 || p.x > t.W + 20 || p.y > t.H + 20;
      pin.hidden = out;
    }
  };

  /** 프레임 위에서 서로 겹쳐 보이는 핀들(허리띠 세 별 등)을 모은다.
      두 조건을 모두 만족해야 한 군집이다.
        ① 화면에서 44px(터치 타깃) 안 — 지금 손가락으로 구분이 안 되는가
        ② 원본에서 120px 안 — 실제로 붙어 있는 별인가
      ②가 없으면 지도를 작게 줄였을 때 멀쩡히 떨어진 별까지 묶여 버린다. */
  MapView.prototype.clusterOf = function (id, radiusPx) {
    var t = this.xform();
    var here = this.pinNorm(id);
    var hp = this.imageToFrame(here.x, here.y, t);
    var r = radiusPx || 44;
    var rImg = MARK_PX.max * 2;                 // 원본 120px
    var out = [];
    for (var i = 0; i < STARS.length; i++) {
      var n = this.pinNorm(STARS[i].id);
      var p = this.imageToFrame(n.x, n.y, t);
      var dImg = Math.hypot((n.x - here.x) * t.iw, (n.y - here.y) * t.ih);
      if (Math.hypot(p.x - hp.x, p.y - hp.y) <= r && dImg <= rImg) out.push(STARS[i].id);
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
      // 포인터 캡처 실패(구형 사파리 등)해도 드래그는 계속되도록
      try { pin.setPointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
      ev.preventDefault();
      self.selectPin(id);
      if (self.opts.onPinDragState) self.opts.onPinDragState(id, true);
    });

    pin.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      moved = true;
      var r = self.frame.getBoundingClientRect();
      var n = self.frameToImage(ev.clientX - r.left, ev.clientY - r.top);
      self.setPin(id, n.x, n.y);
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
      if (self.pinEdit) {
        if (moved) return;
        // 겹쳐 있는 핀은 반복해서 누르면 차례로 선택된다
        var cl = self.clusterOf(id);
        var next = id;
        if (cl.length > 1) {
          var at = cl.indexOf(self.selectedPin);
          next = (at >= 0) ? cl[(at + 1) % cl.length] : cl[0];
        }
        self.selectPin(next);
        return;
      }
      if (moved) return;
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

  /** 핀 12개를 현재 성도 위치(이미지 좌표)로 한 번에 배치 */
  MapView.prototype.autoPlacePins = function () {
    var t = this.xform();
    for (var i = 0; i < STARS.length; i++) {
      var ip = this.skyToImagePx(STARS[i].sky);
      Config.data.pins[STARS[i].id] = {
        x: Number(clamp(ip.x / t.iw, 0, 1).toFixed(5)),
        y: Number(clamp(ip.y / t.ih, 0, 1).toFixed(5))
      };
    }
    this.renderPins();
  };

  MapView.prototype.setSrc = function (src) {
    this.opts.src = src;
    this.img.src = src;
  };

  global.MapView = MapView;

})(window);
