/* ==========================================================================
   Night Code 1395 — 인쇄물 / 내보내기
     · 탐구 보고서 인쇄 (브라우저 인쇄 기능. PDF 저장은 인쇄 대화상자에서)
     · 빈 기록표 인쇄 (태블릿이 없는 학급용)
   외부 라이브러리는 쓰지 않는다.
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
  function $(id) { return document.getElementById(id); }

  function today() {
    var d = new Date();
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  var Report = {};

  /* ==========================================================================
     이름·모둠을 받고 보고서를 인쇄한다
     ========================================================================== */
  Report.printReport = function () {
    Report.askName(function (who) {
      State.data.school = who.school;
      State.data.grade = who.grade;
      State.data.klass = who.klass;
      State.data.no = who.no;
      State.data.name = who.name;
      State.save();
      Report.buildReport();
      Report.doPrint('print-report');
    });
  };

  /** 이름·모둠 입력 작은 대화상자 */
  /**
   * 보고서에 넣을 신원. 모둠이 아니라 개인 활동이므로 학교·학년·반·번호·이름을 받는다.
   * 이 값들은 이 기기의 localStorage 와 인쇄물에만 쓰이고 서버로 보내지 않는다.
   */
  var WHO_FIELDS = [
    { key: 'school', label: '학교', ph: '예) 서울중학교', wide: true },
    { key: 'grade',  label: '학년', ph: '예) 3' },
    { key: 'klass',  label: '반',   ph: '예) 2' },
    { key: 'no',     label: '번호', ph: '예) 14' },
    { key: 'name',   label: '이름', ph: '예) 김도윤', wide: true }
  ];

  Report.askName = function (done) {
    var back = el('div', 'modal-back', document.body);
    var box = el('div', 'modal modal-narrow', back);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    var head = el('div', 'modal-head', box);
    el('h2', null, head, '보고서에 넣을 이름');
    var x = el('button', 'btn-round', head, '✕');
    x.type = 'button';

    var body = el('div', 'modal-body', box);
    el('p', 'muted', body, '비워 두면 손으로 쓸 수 있게 빈칸으로 인쇄됩니다.');

    var grid = el('div', 'who-grid', body);
    var inputs = {};
    WHO_FIELDS.forEach(function (f) {
      var lab = el('label', 'field' + (f.wide ? ' is-wide' : ''), grid);
      el('span', null, lab, f.label);
      var input = document.createElement('input');
      input.type = 'text';
      input.placeholder = f.ph;
      input.value = State.data[f.key] || '';
      if (f.key === 'grade' || f.key === 'klass' || f.key === 'no') {
        input.inputMode = 'numeric';
        input.maxLength = 3;
      }
      lab.appendChild(input);
      inputs[f.key] = input;
    });

    var btns = el('div', 'abtns', body);
    var ok = el('button', 'btn btn-primary', btns, '인쇄하기');
    ok.type = 'button';
    var cancel = el('button', 'btn', btns, '취소');
    cancel.type = 'button';

    function close() { back.remove(); }
    x.addEventListener('click', close);
    cancel.addEventListener('click', close);
    back.addEventListener('click', function (ev) { if (ev.target === back) close(); });
    ok.addEventListener('click', function () {
      var who = {};
      WHO_FIELDS.forEach(function (f) { who[f.key] = inputs[f.key].value.trim(); });
      close();
      done(who);
    });
    inputs.school.focus();
  };

  /** 학년·반·번호를 "3학년 2반 14번" 한 칸으로 묶는다 */
  function whereText() {
    var g = State.data.grade, k = State.data.klass, n = State.data.no;
    if (!g && !k && !n) return '';
    return (g ? g + '학년 ' : '') + (k ? k + '반 ' : '') + (n ? n + '번' : '');
  }

  /* ==========================================================================
     탐구 보고서
     ========================================================================== */
  Report.buildReport = function () {
    var root = $('printRoot');
    root.innerHTML = '';
    var page = el('div', 'sheet', root);

    /* 머리말 */
    var head = el('header', 'sheet-head', page);
    el('h1', null, head, APP.NAME + ' · 나의 탐구 보고서');
    el('p', 'sheet-sub', head, '천상열차분야지도로 알아본 조선의 별 기록');

    var meta = el('div', 'sheet-meta', page);
    metaCell(meta, '학교', State.data.school);
    metaCell(meta, '학년·반·번호', whereText());
    metaCell(meta, '이름', State.data.name);
    metaCell(meta, '날짜', today());

    /* 1. 탐구 질문 */
    sec(page, '1. 탐구 질문');
    el('p', 'sheet-q', page, '왜 별마다 크기를 다르게 새겼을까?');

    /* 2. 나의 예상 */
    sec(page, '2. 나의 예상');
    var mine = State.predictionLabel();
    el('p', 'sheet-p', page, mine ? '☑ ' + mine : '(고르지 않음)');

    /* 3. 측정 결과 */
    sec(page, '3. 측정 결과');
    page.appendChild(buildMeasureTable(true));
    el('p', 'sheet-note', page,
      '길이는 원본 지도 이미지의 픽셀 단위이며, 등급은 근사값입니다.');

    /* 4. 그래프 */
    sec(page, '4. 그래프');
    var chartBox = el('div', 'sheet-chart', page);
    new Scatter(chartBox, { animate: false, showLabels: true, trend: true });

    /* 5. 내가 쓴 결론 */
    sec(page, '5. 내가 알아낸 것');
    var mycon = (State.data.conclusion || '').trim();
    if (mycon) el('p', 'sheet-p sheet-mine', page, mycon);
    else { el('div', 'writeline', page); el('div', 'writeline', page); }

    /* 6. 오늘의 정리 */
    sec(page, '6. 오늘의 정리');
    var ul = el('ul', 'sheet-list', page);
    CONCLUSIONS.forEach(function (line) {
      var li = el('li', null, ul);
      li.innerHTML = line;
    });
    el('p', 'sheet-p', page,
      '종이에 그린 지도는 별이 어디에 있는지를 알려주지만 별의 크기가 모두 같아 밝기는 알 수 없습니다. ' +
      '돌에 새긴 지도는 별마다 크기를 다르게 새겼고, 그 크기는 실제 밝기와 맞아떨어집니다. ' +
      '조선의 천문학자들은 위치뿐 아니라 밝기까지 관측해 기록으로 남긴 것입니다.');

    /* 7. 출처 */
    sec(page, '7. 출처');
    el('p', 'sheet-credit', page, APP.CREDIT);
  };

  function metaCell(host, key, val) {
    var c = el('div', 'meta-cell', host);
    el('span', 'meta-key', c, key);
    var v = el('span', 'meta-val', c, val || '');
    if (!val) v.classList.add('is-blank');
  }
  function sec(host, title) { el('h2', 'sheet-sec', host, title); }

  /* ==========================================================================
     빈 기록표 — 태블릿이 없는 학급이 인쇄 지도로 같은 활동을 할 수 있게
     ========================================================================== */
  Report.printSheet = function () {
    var root = $('printRoot');
    root.innerHTML = '';
    var page = el('div', 'sheet', root);

    var head = el('header', 'sheet-head', page);
    el('h1', null, head, APP.NAME + ' · 별 자국 측정 기록표');
    el('p', 'sheet-sub', head, '인쇄한 지도에서 자로 재어 적어 보세요');

    var meta = el('div', 'sheet-meta', page);
    metaCell(meta, '학교', '');
    metaCell(meta, '학년·반·번호', '');
    metaCell(meta, '이름', '');
    metaCell(meta, '날짜', '');

    sec(page, '무엇을 재는가');
    var rule = el('div', 'sheet-rule', page);
    rule.appendChild(Guide.buildMarkDiagram());
    el('p', 'sheet-p', page, Guide.TEXT.RULE);
    el('p', 'sheet-note', page, Guide.TEXT.WHY);

    sec(page, '측정 기록');
    var wrap = el('div', 'table-wrap', page);
    var t = el('table', 'data-table', wrap);
    var hr = el('tr', null, el('thead', null, t));
    ['번호', '별 이름 (전통 이름)', '1차 (mm)', '2차 (mm)', '평균', '실제 밝기(등급)'].forEach(function (h) {
      el('th', null, hr, h);
    });
    var tb = el('tbody', null, t);
    STARS.forEach(function (st) {
      var tr = el('tr', null, tb);
      el('td', 'td-num', tr, String(st.id));
      var name = el('td', 'td-name', tr);
      el('b', null, name, st.kor);
      el('span', 'td-trad', name, ' ' + st.trad);
      el('td', 'td-blank', tr, '');
      el('td', 'td-blank', tr, '');
      el('td', 'td-blank', tr, '');
      el('td', 'td-v', tr, magText(st.mag));
    });

    sec(page, '그래프 그리기');
    el('p', 'sheet-p', page,
      '가로는 별의 밝기(왼쪽이 밝은 별), 세로는 내가 잰 크기입니다. 별 하나에 점 하나를 찍어 보세요.');
    page.appendChild(blankGrid());

    sec(page, '알아낸 것');
    el('div', 'writeline', page);
    el('div', 'writeline', page);
    el('p', 'sheet-credit', page, APP.CREDIT);

    Report.doPrint('print-report');
  };

  /** 손으로 점을 찍을 빈 모눈 */
  function blankGrid() {
    var NS = 'http://www.w3.org/2000/svg';
    var box = document.createElement('div');
    box.className = 'sheet-chart';
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 620 380');
    s.setAttribute('class', 'scatter blank-grid');
    function n(tag, attrs, text) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
      if (text !== undefined) e.textContent = text;
      s.appendChild(e);
      return e;
    }
    var L = 70, R = 26, T = 20, B = 80;
    for (var i = 0; i <= 10; i++) {
      var x = L + (620 - L - R) * i / 10;
      n('line', { x1: x, y1: T, x2: x, y2: 380 - B, class: 'sc-grid' });
    }
    for (var j = 0; j <= 8; j++) {
      var y = T + (380 - T - B) * j / 8;
      n('line', { x1: L, y1: y, x2: 620 - R, y2: y, class: 'sc-grid' });
    }
    n('line', { x1: L, y1: 380 - B, x2: 620 - R, y2: 380 - B, class: 'sc-axis' });
    n('line', { x1: L, y1: T, x2: L, y2: 380 - B, class: 'sc-axis' });
    n('text', { x: L, y: 380 - B + 30, class: 'sc-end', 'text-anchor': 'start' }, '◂ 밝은 별');
    n('text', { x: 620 - R, y: 380 - B + 30, class: 'sc-end', 'text-anchor': 'end' }, '어두운 별 ▸');
    n('text', { x: (L + 620 - R) / 2, y: 380 - 14, class: 'sc-axis-name', 'text-anchor': 'middle' },
      '별의 밝기 (겉보기 등급)');
    var yl = n('text', { class: 'sc-axis-name', 'text-anchor': 'middle',
      transform: 'translate(20,' + (T + (380 - T - B) / 2) + ') rotate(-90)' });
    yl.textContent = '내가 잰 자국의 크기';
    box.appendChild(s);
    return box;
  }

  /* ==========================================================================
     인쇄 실행
     ========================================================================== */
  Report.doPrint = function (mode) {
    document.body.classList.add(mode);
    var clean = function () {
      document.body.classList.remove('print-report');
      window.removeEventListener('afterprint', clean);
    };
    window.addEventListener('afterprint', clean);
    // 사파리 등 afterprint 가 늦는 경우 대비
    setTimeout(function () {
      try { window.print(); } catch (e) { App.toast('인쇄를 열 수 없습니다'); }
      setTimeout(clean, 1500);
    }, 60);
  };

  global.Report = Report;

})(window);
