/* ==========================================================================
   별지기 1395 — 측정 기준 안내
   원본 유물을 확대해 보면 밝은 별일수록 크고 깊게 파여
   "가운데가 비고 테두리만 진한 고리" 모양으로 보인다.
   어두운 별은 작고 속이 찬 점에 가깝다.
   => 측정 대상은 '가장 긴 지름'이 아니라 '바깥 테두리의 바깥쪽 끝에서 끝까지'다.
   이 파일은 그 기준을 설명하는 문구와, 코드로 직접 그린 도식을 제공한다.
   ========================================================================== */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var TEXT = {
    RULE: '별 자국의 바깥 테두리 양 끝에 두 점을 맞추세요. ' +
          '가운데가 비어 보여도 바깥쪽 끝을 기준으로 잽니다.',
    WHY: '밝은 별일수록 크고 깊게 파여 가운데가 비고 테두리만 진해 보입니다. ' +
         '어두운 별은 작고 속이 찬 점에 가깝습니다.',
    HELP_LINE: '잴 때는 자국의 바깥 테두리 끝에서 끝까지를 잽니다. ' +
               '가운데가 비어 보여도 안쪽 구멍이 아니라 바깥쪽 끝이 기준입니다.'
  };

  function n(tag, parent, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  /** 양 끝에 화살촉이 달린 치수선 (id 충돌이 없도록 marker 대신 삼각형을 직접 그린다) */
  function dimLine(parent, x1, x2, y, color, dashed) {
    var a = { x1: x1 + 5, y1: y, x2: x2 - 5, y2: y, stroke: color, 'stroke-width': 2 };
    if (dashed) a['stroke-dasharray'] = '4 3';
    n('line', parent, a);
    n('polygon', parent, { points: x1 + ',' + y + ' ' + (x1 + 7) + ',' + (y - 4) + ' ' + (x1 + 7) + ',' + (y + 4), fill: color });
    n('polygon', parent, { points: x2 + ',' + y + ' ' + (x2 - 7) + ',' + (y - 4) + ' ' + (x2 - 7) + ',' + (y + 4), fill: color });
    // 양 끝 기준선
    n('line', parent, { x1: x1, y1: y - 9, x2: x1, y2: y + 9, stroke: color, 'stroke-width': 1.5 });
    n('line', parent, { x1: x2, y1: y - 9, x2: x2, y2: y + 9, stroke: color, 'stroke-width': 1.5 });
  }

  /**
   * 측정 기준 도식 SVG 를 만들어 돌려준다.
   * 왼쪽 = 밝은 별(고리 모양), 오른쪽 = 어두운 별(찬 점).
   */
  function buildMarkDiagram() {
    var svg = n('svg', null, {
      viewBox: '0 0 320 196',
      class: 'mark-diagram',
      role: 'img',
      'aria-label':
        '측정 기준 도식. 밝은 별은 가운데가 빈 고리 모양이며, 바깥 테두리의 ' +
        '바깥쪽 끝에서 끝까지를 지름으로 잰다. 어두운 별은 작고 속이 찬 점이다.'
    });

    var PAPER = '#efe9dc';   // 탁본 종이색
    var INK   = '#2b2b2b';   // 새겨진 자국
    var MARK  = '#d2452f';   // 치수선(강조)

    /* ---- 왼쪽: 밝은 별 = 고리 ---- */
    n('rect', svg, { x: 6, y: 6, width: 150, height: 128, rx: 10, fill: PAPER });
    var cxA = 81, cyA = 58, outerA = 34, ringW = 11;
    // 테두리만 진한 고리 (가운데는 종이색이 비쳐 보인다)
    n('circle', svg, {
      cx: cxA, cy: cyA, r: outerA - ringW / 2,
      fill: 'none', stroke: INK, 'stroke-width': ringW, opacity: 0.92
    });
    // 안쪽 구멍만 재면 안 된다는 표시
    dimLine(svg, cxA - (outerA - ringW), cxA + (outerA - ringW), cyA, '#8a8a8a', true);
    n('text', svg, { x: cxA, y: cyA - 12, 'text-anchor': 'middle', class: 'md-no' }).textContent = '✗';
    // 바깥 끝에서 끝까지 = 측정값
    dimLine(svg, cxA - outerA, cxA + outerA, 112, MARK);
    n('text', svg, { x: cxA, y: 128, 'text-anchor': 'middle', class: 'md-ok' }).textContent = '○ 바깥 끝 → 바깥 끝';

    /* ---- 오른쪽: 어두운 별 = 작고 찬 점 ---- */
    n('rect', svg, { x: 164, y: 6, width: 150, height: 128, rx: 10, fill: PAPER });
    var cxB = 239, cyB = 58, rB = 13;
    n('circle', svg, { cx: cxB, cy: cyB, r: rB, fill: INK, opacity: 0.92 });
    dimLine(svg, cxB - rB, cxB + rB, 112, MARK);
    n('text', svg, { x: cxB, y: 128, 'text-anchor': 'middle', class: 'md-ok' }).textContent = '○ 바깥 끝 → 바깥 끝';

    /* ---- 아래 설명 ---- */
    n('text', svg, { x: 81, y: 154, 'text-anchor': 'middle', class: 'md-cap' }).textContent = '밝은 별 — 크게 파여 고리 모양';
    n('text', svg, { x: 239, y: 154, 'text-anchor': 'middle', class: 'md-cap' }).textContent = '어두운 별 — 작고 찬 점';
    n('text', svg, { x: 160, y: 182, 'text-anchor': 'middle', class: 'md-rule' }).textContent =
      '가운데가 비어 보여도 안쪽 구멍이 아니라 바깥쪽 끝을 잰다';

    return svg;
  }

  /** 측정 기준 카드(도식 + 문구) 한 덩어리 */
  function buildRuleCard() {
    var box = document.createElement('div');
    box.className = 'rule-card';

    var h = document.createElement('h3');
    h.className = 'rule-title';
    h.textContent = '무엇을 재는가 — 측정 기준';
    box.appendChild(h);

    var p = document.createElement('p');
    p.className = 'rule-text';
    p.textContent = TEXT.RULE;
    box.appendChild(p);

    box.appendChild(buildMarkDiagram());

    var why = document.createElement('p');
    why.className = 'rule-why';
    why.textContent = TEXT.WHY;
    box.appendChild(why);

    return box;
  }

  global.Guide = {
    TEXT: TEXT,
    buildMarkDiagram: buildMarkDiagram,
    buildRuleCard: buildRuleCard
  };

})(window);
