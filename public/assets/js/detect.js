/* ==========================================================================
   Night Code 1395 — 별 자국 자동 검출
   각석본은 흰 바탕에 어두운 자국이라, 교사가 대충 누르기만 해도
   자국의 정확한 한가운데로 붙여 줄 수 있다(스냅).

   방법
     ① 어두운 픽셀만 남기고
     ② 침식으로 얇은 별자리 선·획을 지운 뒤
     ③ 남은 덩어리마다 24방향으로 광선을 쏴 '바깥 테두리의 바깥쪽 끝'을 잰다
        (밝은 별은 가운데가 비어 있으므로 구멍을 지나 끝까지 훑는다)
     ④ 둥글지 않은 것(글자·선)은 버린다
   결과는 이 기기에 저장해 두었다가 다음에는 바로 쓴다.
   ========================================================================== */
(function (global) {
  'use strict';

  var Detect = {
    marks: null,      // [{x, y, d}] 원본 이미지 픽셀
    running: false
  };

  var THRESH = 165;   // 이보다 어두우면 잉크
  var ERODE_R = 2;    // 5x5 침식 — 5px 보다 얇은 선은 사라진다
  var NA = 24;        // 광선 개수
  var MAXR = 46;      // 반지름 최대 46px (지름 92px 까지)

  /** 저장해 둔 결과 불러오기 */
  Detect.loadCache = function () {
    var c = Store.get('marks', null);
    if (c && c.src === IMAGES.orion.src && c.w === IMAGES.orion.w && Array.isArray(c.list)) {
      Detect.marks = c.list;
      return true;
    }
    return false;
  };

  /**
   * 검출 실행. 이미 결과가 있으면 그대로 돌려준다.
   * @param {Function} done  function(marks)
   * @param {Boolean} force  다시 계산
   */
  Detect.run = function (done, force) {
    if (Detect.marks && !force) { done(Detect.marks); return; }
    if (!force && Detect.loadCache()) { done(Detect.marks); return; }
    if (Detect.running) return;
    Detect.running = true;

    var img = new Image();
    img.onload = function () {
      // 무거운 계산이라 화면이 한 번 그려진 뒤에 시작한다
      setTimeout(function () {
        var list = analyze(img);
        Detect.marks = list;
        Detect.running = false;
        Store.set('marks', { src: IMAGES.orion.src, w: IMAGES.orion.w, list: list });
        done(list);
      }, 30);
    };
    img.onerror = function () {
      Detect.running = false;
      Detect.marks = [];
      done([]);
    };
    img.src = IMAGES.orion.src;
  };

  function analyze(img) {
    var W = img.naturalWidth, H = img.naturalHeight;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    var d = g.getImageData(0, 0, W, H).data;

    /* ① 이진화 */
    var bin = new Uint8Array(W * H), i;
    for (i = 0; i < W * H; i++) {
      var v = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
      bin[i] = v < THRESH ? 1 : 0;
    }

    /* ② 침식 (가로·세로로 나눠 빠르게) */
    var er = erode(bin, W, H, ERODE_R);

    /* ③ 연결요소 */
    var lab = new Int32Array(W * H);
    var stack = new Int32Array(200000);
    var seeds = [];
    for (var p = 0; p < W * H; p++) {
      if (!er[p] || lab[p]) continue;
      var sp = 0; stack[sp++] = p; lab[p] = 1;
      var sx = 0, sy = 0, n = 0;
      while (sp > 0) {
        var q = stack[--sp], qx = q % W, qy = (q / W) | 0;
        sx += qx; sy += qy; n++;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          var np = ny * W + nx;
          if (er[np] && !lab[np]) { lab[np] = 1; if (sp < 199990) stack[sp++] = np; }
        }
      }
      if (n >= 3) seeds.push({ x: sx / n, y: sy / n });
    }

    /* ④ 광선으로 바깥 테두리 재기 + 둥근 것만 남기기 */
    function ink(x, y) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return 0;
      return bin[y * W + x];
    }
    var found = [];
    seeds.forEach(function (s) {
      var rs = [];
      for (var a = 0; a < NA; a++) {
        var th = a * 2 * Math.PI / NA, ca = Math.cos(th), sa = Math.sin(th);
        var last = 0, since = 0;
        for (var r = 1; r <= MAXR; r += 0.5) {
          if (ink(s.x + ca * r, s.y + sa * r)) { last = r; since = 0; }
          else { since += 0.5; if (last > 0 && since > 10) break; }
        }
        rs.push(last);
      }
      var sorted = rs.slice().sort(function (a, b) { return a - b; });
      var med = sorted[NA >> 1];
      var q1 = sorted[Math.floor(NA * 0.25)], q3 = sorted[Math.floor(NA * 0.75)];
      if (med < 2 || med > 40) return;
      if ((q3 - q1) / med > 0.4) return;              // 둥글지 않으면 글자·선이다
      found.push({ x: Math.round(s.x), y: Math.round(s.y), d: Math.round(med * 2 * 10) / 10 });
    });

    /* 같은 자국이 여러 조각으로 잡힌 경우 큰 것만 남긴다 */
    found.sort(function (a, b) { return b.d - a.d; });
    var kept = [];
    found.forEach(function (m) {
      for (var k = 0; k < kept.length; k++) {
        if (Math.hypot(kept[k].x - m.x, kept[k].y - m.y) < Math.max(7, kept[k].d * 0.55)) return;
      }
      kept.push(m);
    });
    return kept;
  }

  function erode(src, W, H, r) {
    var tmp = new Uint8Array(W * H), out = new Uint8Array(W * H), x, y, k;
    for (y = 0; y < H; y++) {
      var o = y * W;
      for (x = 0; x < W; x++) {
        var m = 1;
        for (k = -r; k <= r; k++) { var xx = x + k; if (xx < 0 || xx >= W || !src[o + xx]) { m = 0; break; } }
        tmp[o + x] = m;
      }
    }
    for (x = 0; x < W; x++) {
      for (y = 0; y < H; y++) {
        var m2 = 1;
        for (k = -r; k <= r; k++) { var yy = y + k; if (yy < 0 || yy >= H || !tmp[yy * W + x]) { m2 = 0; break; } }
        out[y * W + x] = m2;
      }
    }
    return out;
  }

  /**
   * 누른 지점에서 가장 그럴듯한 자국을 찾는다(스냅).
   * @param px,py     원본 이미지 픽셀
   * @param expectedD 이 별의 어림 지름(있으면 크기가 비슷한 쪽을 고른다)
   * @param radius    이만큼 안에서만 찾는다
   */
  Detect.snap = function (px, py, expectedD, radius) {
    if (!Detect.marks || !Detect.marks.length) return null;
    radius = radius || 60;
    var best = null, bestScore = 1e9;
    for (var i = 0; i < Detect.marks.length; i++) {
      var m = Detect.marks[i];
      var dist = Math.hypot(m.x - px, m.y - py);
      if (dist > radius) continue;
      // 거리를 우선하되, 어림 지름과 많이 다르면 조금 불리하게
      var sizePenalty = expectedD ? Math.abs(m.d - expectedD) / Math.max(8, expectedD) * 18 : 0;
      var score = dist + sizePenalty;
      if (score < bestScore) { bestScore = score; best = m; }
    }
    return best;
  };

  global.Detect = Detect;

})(window);
