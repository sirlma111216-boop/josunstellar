/* ==========================================================================
   Night Code 1395 — 점 그래프(산점도) 를 SVG 로 직접 그린다
   가로 = 겉보기 등급(왼쪽이 밝은 별), 세로 = 내가 잰 자국의 크기.
   외부 라이브러리 없이 그린다.
   ========================================================================== */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function n(tag, parent, attrs, text) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    }
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  var W = 620, H = 430;
  var PAD = { l: 74, r: 26, t: 26, b: 92 };

  /**
   * @param host  붙일 자리
   * @param opts  animate(점을 하나씩), showLabels(이름 항상 표시), trend(경향선),
   *              classPts([[등급, 지름], …] 반 전체 점), classOn(반 전체를 함께 그릴지)
   */
  function Scatter(host, opts) {
    this.opts = Object.assign({
      animate: false, showLabels: false, trend: false,
      classPts: null, classOn: false
    }, opts || {});
    this.host = host;
    this.rows = State.measuredRows();
    this.build();
  }

  /** 반 전체 점을 함께 그릴지 바꾼다 (축 범위가 달라지므로 다시 그린다) */
  Scatter.prototype.setClassOn = function (on) {
    this.opts.classOn = !!on;
    var wasTrend = this.trendShown;
    this.build();
    if (wasTrend) this.showTrend();
  };

  Scatter.prototype.build = function () {
    var rows = this.rows;
    var classPts = (this.opts.classOn && this.opts.classPts) ? this.opts.classPts : [];
    this.host.innerHTML = '';

    if (!rows.length && !classPts.length) {
      var empty = document.createElement('p');
      empty.className = 'chart-empty';
      empty.textContent = '아직 잰 별이 없습니다. 단계 6에서 먼저 재 봅시다.';
      this.host.appendChild(empty);
      return;
    }

    var svg = n('svg', this.host, {
      viewBox: '0 0 ' + W + ' ' + H, class: 'scatter', role: 'img',
      'aria-label': '가로는 별의 밝기 등급, 세로는 잰 자국의 크기를 나타낸 점 그래프'
    });
    this.svg = svg;

    /* ---- 축 범위: 내 점과 반 전체 점을 모두 담는다 ---- */
    var mags = rows.map(function (r) { return r.star.mag; });
    var ds = rows.map(function (r) { return r.avg; });
    classPts.forEach(function (p) { mags.push(p[0]); ds.push(p[1]); });
    var magMin = Math.min.apply(null, mags), magMax = Math.max.apply(null, mags);
    var dMax = Math.max.apply(null, ds);
    magMin = Math.floor(magMin) - 0.5;
    magMax = Math.ceil(magMax) + 0.5;
    var yMax = niceCeil(dMax * 1.15);

    var self = this;
    this.x = function (mag) {
      return PAD.l + (mag - magMin) / (magMax - magMin) * (W - PAD.l - PAD.r);
    };
    this.y = function (d) {
      return H - PAD.b - (d / yMax) * (H - PAD.t - PAD.b);
    };

    /* ---- 눈금선 ---- */
    var gy = Math.ceil(yMax / 5);
    for (var v = 0; v <= yMax + 0.001; v += gy) {
      var yy = this.y(v);
      n('line', svg, { x1: PAD.l, y1: yy, x2: W - PAD.r, y2: yy, class: 'sc-grid' });
      n('text', svg, { x: PAD.l - 10, y: yy + 4, class: 'sc-tick', 'text-anchor': 'end' }, String(v));
    }
    for (var m = Math.ceil(magMin); m <= magMax; m++) {
      var xx = this.x(m);
      n('line', svg, { x1: xx, y1: PAD.t, x2: xx, y2: H - PAD.b, class: 'sc-grid' });
      n('text', svg, { x: xx, y: H - PAD.b + 22, class: 'sc-tick', 'text-anchor': 'middle' }, String(m));
    }

    /* ---- 축 ---- */
    n('line', svg, { x1: PAD.l, y1: H - PAD.b, x2: W - PAD.r, y2: H - PAD.b, class: 'sc-axis' });
    n('line', svg, { x1: PAD.l, y1: PAD.t, x2: PAD.l, y2: H - PAD.b, class: 'sc-axis' });

    /* ---- 축 이름: 숫자만 두지 않고 한글로 크게 ---- */
    n('text', svg, { x: PAD.l, y: H - 44, class: 'sc-end sc-end-l', 'text-anchor': 'start' }, '◂ 밝은 별');
    n('text', svg, { x: W - PAD.r, y: H - 44, class: 'sc-end sc-end-r', 'text-anchor': 'end' }, '어두운 별 ▸');
    n('text', svg, { x: (PAD.l + W - PAD.r) / 2, y: H - 16, class: 'sc-axis-name', 'text-anchor': 'middle' },
      '별의 밝기 (겉보기 등급, 근사값)');

    var yname = n('text', svg, { class: 'sc-axis-name', 'text-anchor': 'middle',
      transform: 'translate(20,' + (PAD.t + (H - PAD.t - PAD.b) / 2) + ') rotate(-90)' });
    yname.textContent = '잰 자국의 크기 (px)';
    n('text', svg, { x: PAD.l - 10, y: PAD.t + 2, class: 'sc-end', 'text-anchor': 'end' }, '크게');

    /* ---- 반 전체 점을 먼저 옅게 깔아 둔다 ---- */
    if (classPts.length) {
      var gc = n('g', svg, { class: 'sc-class' });
      classPts.forEach(function (p) {
        n('circle', gc, { cx: self.x(p[0]), cy: self.y(p[1]), r: 5, class: 'sc-dot-class' });
      });
    }

    /* ---- 경향선 자리(점보다 아래에 깔리도록 먼저) ---- */
    this.trendG = n('g', svg, { class: 'sc-trend', opacity: 0 });

    /* ---- 내 점 ---- */
    this.dots = [];
    var g = n('g', svg, {});
    rows.forEach(function (r, i) {
      var cx = self.x(r.star.mag), cy = self.y(r.avg);

      var dot = n('circle', g, {
        cx: cx, cy: cy, r: 8, class: 'sc-dot', 'data-star': r.star.id
      });
      // 손가락으로 누르기 쉬운 투명한 원
      var hit = n('circle', g, { cx: cx, cy: cy, r: 22, fill: 'transparent', class: 'sc-hit' });

      var lab = n('text', g, {
        x: cx + 12, y: cy - 12, class: 'sc-label', 'text-anchor': 'start'
      }, r.star.kor);
      if (!self.opts.showLabels) lab.style.opacity = 0;

      hit.addEventListener('click', function () {
        var on = lab.style.opacity !== '0';
        lab.style.opacity = on ? 0 : 1;
        App.toast(r.star.kor + ' (' + r.star.trad + ') · ' + magText(r.star.mag) +
                  ' · 내가 잰 크기 ' + r.avg.toFixed(1) + 'px', 2800);
      });

      if (self.opts.animate) {
        dot.style.opacity = 0;
        dot.style.transform = 'scale(0.2)';
        dot.style.transformOrigin = cx + 'px ' + cy + 'px';
        dot.style.transition = 'opacity .28s ease, transform .28s ease';
        setTimeout(function () {
          dot.style.opacity = 1;
          dot.style.transform = 'scale(1)';
        }, 160 + i * 170);
      }
      self.dots.push(dot);
    });

    /* ---- 경향선 ----
       반 전체를 켰으면 모두의 점으로, 아니면 내 점만으로 구한다.
       점이 많을수록 흩어짐이 줄어 경향이 또렷해진다. */
    var fitPts = classPts.length
      ? classPts
      : rows.map(function (r) { return [r.star.mag, r.avg]; });
    this.fit = leastSquares(fitPts);
    if (this.fit) {
      var x1 = magMin + 0.15, x2 = magMax - 0.15;
      n('line', this.trendG, {
        x1: this.x(x1), y1: this.y(this.fit.a + this.fit.b * x1),
        x2: this.x(x2), y2: this.y(this.fit.a + this.fit.b * x2),
        class: 'sc-trend-line' + (classPts.length ? ' is-class' : '')
      });
    }

    /* ---- 범례 ---- */
    if (classPts.length) {
      var lg = n('g', svg, { class: 'sc-legend' });
      n('circle', lg, { cx: PAD.l + 12, cy: PAD.t + 6, r: 5, class: 'sc-dot-class' });
      n('text', lg, { x: PAD.l + 24, y: PAD.t + 10, class: 'sc-leg-txt' }, '우리 반');
      n('circle', lg, { cx: PAD.l + 96, cy: PAD.t + 6, r: 6, class: 'sc-dot' });
      n('text', lg, { x: PAD.l + 108, y: PAD.t + 10, class: 'sc-leg-txt' }, '나');
    }

    this.trendShown = false;
    if (this.opts.trend) this.showTrend();
  };

  Scatter.prototype.showTrend = function () {
    if (!this.trendG) return;
    this.trendShown = true;
    this.trendG.style.transition = 'opacity .5s ease';
    this.trendG.setAttribute('opacity', 1);
  };

  /** 최소제곱 직선 y = a + b·x  (x=등급, y=지름). 점은 [x, y] 짝의 배열. */
  function leastSquares(pts) {
    var n0 = pts.length;
    if (n0 < 2) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var i = 0; i < n0; i++) {
      var x = pts[i][0], y = pts[i][1];
      sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    var den = n0 * sxx - sx * sx;
    if (Math.abs(den) < 1e-9) return null;
    var b = (n0 * sxy - sx * sy) / den;
    var a = (sy - b * sx) / n0;
    return { a: a, b: b };
  }

  function niceCeil(v) {
    if (v <= 10) return Math.ceil(v);
    var pow = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    return Math.ceil(v / (pow / 2)) * (pow / 2);
  }

  global.Scatter = Scatter;

})(window);
