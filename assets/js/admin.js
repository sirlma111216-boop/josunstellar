/* ==========================================================================
   별지기 1395 — 교사 캘리브레이션 (주소 뒤에 ?admin=1)
     · 측정 핀 12개를 별 자국 한가운데로 옮긴다 (확대 미리보기 창 제공)
     · 단계 3에서 확대해 들어갈 영역을 지정한다
     · 단계 4에서 나란히 확대할 별 3개를 고른다
     · 결과를 config.json 으로 내보내 배포한다
   ========================================================================== */
(function (global) {
  'use strict';

  var Admin = { enabled: false, panel: null, rows: {}, preview: null };

  function el(tag, cls, parent, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function section(parent, title) {
    var s = el('div', 'admin-sec', parent);
    el('h3', null, s, title);
    return s;
  }
  function button(parent, label, cls, fn) {
    var b = el('button', 'btn btn-sm ' + (cls || ''), parent, label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  function slider(parent, label, path, min, max, step, fmt) {
    var wrap = el('div', 'arow', parent);
    var id = 'adm-' + path.replace(/\./g, '-');
    var lab = el('label', null, wrap, label);
    lab.htmlFor = id;
    var input = document.createElement('input');
    input.type = 'range'; input.id = id;
    input.min = min; input.max = max; input.step = step;
    input.value = Config.get(path, min);
    wrap.appendChild(input);
    var out = el('output', null, wrap, fmt(Number(input.value)));
    input.addEventListener('input', function () {
      var v = Number(input.value);
      out.textContent = fmt(v);
      Config.set(path, v);
    });
    Admin.rows[path] = { input: input, out: out, fmt: fmt };
    return input;
  }
  function checkbox(parent, label, path) {
    var w = el('label', 'achk', parent);
    var c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = !!Config.get(path, false);
    w.appendChild(c);
    w.appendChild(document.createTextNode(label));
    c.addEventListener('change', function () { Config.set(path, c.checked); });
    Admin.rows[path] = { input: c, check: true };
    return c;
  }

  /* ---------- 패널 ---------- */
  Admin.init = function (ui) {
    var params = new URLSearchParams(location.search);
    if (params.get('admin') !== '1') return;
    Admin.enabled = true;
    Admin.ui = ui;

    var root = document.getElementById('adminRoot');
    var fab = el('button', 'admin-fab', root, '⚙ 캘리브레이션');
    fab.type = 'button';

    var panel = el('div', 'admin-panel', root);
    panel.hidden = true;
    Admin.panel = panel;

    var head = el('div', 'admin-head', panel);
    el('h2', null, head, '교사 캘리브레이션');
    var closeBtn = el('button', 'btn btn-sm', head, '닫기');
    closeBtn.type = 'button';
    fab.addEventListener('click', function () { Admin.toggle(true); });
    closeBtn.addEventListener('click', function () { Admin.toggle(false); });

    /* --- 기준 이미지 --- */
    var s0 = section(panel, '기준 이미지');
    el('p', 'ahint', s0,
      IMAGES.orion.src + ' · ' + IMAGES.orion.w + ' × ' + IMAGES.orion.h + ' px (각석본, 측정용)');
    el('p', 'ahint', s0,
      IMAGES.color.src + ' · 같은 영역·같은 축척의 채색본 — 좌표가 그대로 통합니다');
    el('p', 'ahint', s0, '별 자국 지름 약 ' + MARK_PX.min + '~' + MARK_PX.max + ' px');
    if (Config.migrated) {
      el('p', 'ahint warn', s0, '⚠ 예전 버전 설정이 있어 측정 핀을 기본값으로 되돌렸습니다.');
    }

    /* --- ① 측정 핀 --- */
    var s1 = section(panel, '① 측정 핀 12개 배치');
    var editWrap = el('div', null, s1);
    var editChk = document.createElement('input');
    var editLab = el('label', 'achk', editWrap);
    editChk.type = 'checkbox';
    editLab.appendChild(editChk);
    editLab.appendChild(document.createTextNode('핀 편집 모드 (지도에서 핀을 끌어 옮기기)'));
    editChk.addEventListener('change', function () {
      if (editChk.checked) Admin.ui.gotoMeasure();
      Admin.ui.setPinEdit(editChk.checked);
      Admin.showPreview(editChk.checked);
    });
    Admin.editChk = editChk;

    el('p', 'ahint', s1,
      '핀을 고르면 확대 창이 열립니다. 창 안을 끌면 원본 픽셀 단위로 미세 조정되니 ' +
      '별 자국 한가운데에 십자를 맞추세요. 허리띠 세 별(8·9·11)처럼 겹친 핀은 ' +
      '같은 자리를 반복해 누르면 차례로 선택됩니다.');

    var picker = el('div', 'pin-picker', s1);
    for (var i = 0; i < STARS.length; i++) {
      (function (st) {
        var chip = el('button', 'pin-chip', picker, st.id + '.' + st.kor);
        chip.type = 'button';
        chip.dataset.star = st.id;
        chip.addEventListener('click', function () { Admin.selectPin(st.id); });
      })(STARS[i]);
    }

    var nud = el('div', 'nudge', s1);
    mkNudge(nud, '', null);      mkNudge(nud, '↑', [0, -1]); mkNudge(nud, '', null);
    mkNudge(nud, '←', [-1, 0]);  mkNudge(nud, '·', null);    mkNudge(nud, '→', [1, 0]);
    mkNudge(nud, '', null);      mkNudge(nud, '↓', [0, 1]);  mkNudge(nud, '', null);
    el('p', 'ahint', s1, '화살표 한 번 = 원본 이미지 4px 이동');

    var b1 = el('div', 'abtns', s1);
    button(b1, '예상 위치로 초기화', 'btn-primary', function () {
      if (!confirm('측정 핀 12개를 처음 예상 좌표로 되돌릴까요?\n지금까지 옮긴 위치는 사라집니다.')) return;
      Config.resetPins();
      Admin.ui.toast('핀 12개를 예상 위치로 되돌렸습니다');
      Admin.refreshPreview();
    });

    /* --- ② 단계 3 확대 영역 --- */
    var s2 = section(panel, '② 단계 3에서 확대해 들어갈 영역');
    el('p', 'ahint warn', s2,
      '⚠ 기본값은 눈으로 확인하지 않은 어림값입니다. 전체 지도에서 삼수(오리온) 자리에 ' +
      '사각형을 맞춘 뒤 아래 "확인함"을 켜 주세요.');
    slider(s2, '왼쪽',   'zoomRegion.x', 0, 0.9,  0.002, pct);
    slider(s2, '위쪽',   'zoomRegion.y', 0, 0.9,  0.002, pct);
    slider(s2, '너비',   'zoomRegion.w', 0.05, 0.6, 0.002, pct);
    slider(s2, '높이',   'zoomRegion.h', 0.05, 0.6, 0.002, pct);
    checkbox(s2, '이 영역을 눈으로 확인함', 'zoomRegion.confirmed');
    var b2 = el('div', 'abtns', s2);
    button(b2, '단계 3 화면 보기', '', function () { Admin.ui.goStep(3); });

    /* --- ③ 단계 4 별 3개 --- */
    var s3 = section(panel, '③ 단계 4에서 나란히 확대할 별 3개');
    el('p', 'ahint', s3, '크기 차이가 잘 드러나도록 밝은 별·중간 별·어두운 별을 고르면 좋습니다.');
    Admin.trioPicker = el('div', 'pin-picker', s3);
    for (var t = 0; t < STARS.length; t++) {
      (function (st) {
        var chip = el('button', 'pin-chip', Admin.trioPicker, st.id + '.' + st.kor);
        chip.type = 'button';
        chip.dataset.star = st.id;
        chip.addEventListener('click', function () { Admin.toggleTrio(st.id); });
      })(STARS[t]);
    }
    var b3 = el('div', 'abtns', s3);
    button(b3, '단계 4 화면 보기', '', function () { Admin.ui.goStep(4); });
    Admin.markTrio();

    /* --- ④ 저장 --- */
    var s4 = section(panel, '④ 설정 저장 · 내보내기');
    checkbox(s4, 'config.json 보다 이 기기 설정을 우선 사용', 'preferLocal');
    var b4 = el('div', 'abtns', s4);
    button(b4, '이 기기에 저장', 'btn-primary', function () {
      var ok = Config.save();
      Admin.ui.toast(ok ? '이 기기에 저장했습니다' : '저장 실패(브라우저 저장소 사용 불가)');
    });
    button(b4, 'config.json 내보내기', '', Admin.exportJSON);
    button(b4, 'JSON 불러오기', '', function () { fileInput.click(); });
    button(b4, 'JSON 보기', '', function () {
      ta.hidden = !ta.hidden;
      if (!ta.hidden) { ta.value = Config.toJSON(); ta.focus(); ta.select(); }
    });
    button(b4, '기본값 복원', 'btn-danger', function () {
      if (!confirm('캘리브레이션 설정을 기본값으로 되돌릴까요?\n(학생 측정 기록은 지워지지 않습니다)')) return;
      Config.resetToDefaults();
      Admin.syncUI(); Admin.markTrio(); Admin.refreshPreview();
      Admin.ui.toast('기본값으로 되돌렸습니다');
    });

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.style.display = 'none';
    s4.appendChild(fileInput);
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          Config.fromJSON(String(fr.result));
          Admin.syncUI(); Admin.markTrio(); Admin.refreshPreview();
          Admin.ui.toast('설정을 불러왔습니다');
        } catch (e) { Admin.ui.toast('JSON 형식이 올바르지 않습니다'); }
      };
      fr.readAsText(f);
      fileInput.value = '';
    });

    var ta = document.createElement('textarea');
    ta.hidden = true; ta.rows = 8; ta.className = 'admin-json';
    s4.appendChild(ta);

    el('p', 'ahint', s4,
      (Config.fromFile
        ? 'ⓘ 지금 config.json 파일이 적용 중입니다. 편집한 값을 배포하려면 내보낸 파일로 교체하세요.'
        : 'ⓘ config.json 파일이 없어 이 기기 설정/기본값을 쓰는 중입니다.') +
      ' 내보내는 파일에는 기준 이미지 파일명과 규격도 함께 기록됩니다.');

    Admin.syncUI();
  };

  /* ---------- 단계 4 별 3개 고르기 ---------- */
  Admin.toggleTrio = function (id) {
    var list = (Config.get('trioIds', []) || []).slice();
    var at = list.indexOf(id);
    if (at >= 0) list.splice(at, 1);
    else {
      if (list.length >= 3) list.shift();     // 3개를 넘으면 가장 먼저 고른 것을 뺀다
      list.push(id);
    }
    Config.set('trioIds', list);
    Admin.markTrio();
  };

  Admin.markTrio = function () {
    if (!Admin.trioPicker) return;
    var list = Config.get('trioIds', []) || [];
    var chips = Admin.trioPicker.querySelectorAll('.pin-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-on', list.indexOf(Number(chips[i].dataset.star)) >= 0);
    }
  };

  /* ==========================================================================
     핀 확대 미리보기
     ========================================================================== */
  Admin.buildPreview = function () {
    if (Admin.preview) return Admin.preview;
    var view = Admin.ui.map();
    if (!view) return null;

    var box = el('div', 'pin-preview');
    box.hidden = true;

    var head = el('div', 'pp-head', box);
    var title = el('span', 'pp-title', head, '핀 확대');
    var zoomOut = el('button', 'pp-btn', head, '−');
    var zoomIn = el('button', 'pp-btn', head, '+');
    zoomOut.type = zoomIn.type = 'button';

    var stage = el('div', 'pp-stage', box);
    el('div', 'pp-cross', stage);
    var foot = el('div', 'pp-foot', box);

    view.frame.appendChild(box);

    var P = { box: box, stage: stage, foot: foot, title: title, zoom: 4, size: 170, view: view };
    Admin.preview = P;

    zoomOut.addEventListener('click', function () { P.zoom = Math.max(2, P.zoom - 1); Admin.refreshPreview(); });
    zoomIn.addEventListener('click', function () { P.zoom = Math.min(12, P.zoom + 1); Admin.refreshPreview(); });

    // 창 안에서 끌어 미세 조정 (창 1px = 원본 1/zoom px)
    var dragging = false, lastX = 0, lastY = 0;
    stage.addEventListener('pointerdown', function (ev) {
      if (!Admin.ui.selectedPin()) return;
      dragging = true; lastX = ev.clientX; lastY = ev.clientY;
      try { stage.setPointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
      ev.preventDefault();
    });
    stage.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      var id = Admin.ui.selectedPin();
      if (!id) return;
      var du = -(ev.clientX - lastX) / P.zoom / IMAGES.orion.w;
      var dv = -(ev.clientY - lastY) / P.zoom / IMAGES.orion.h;
      lastX = ev.clientX; lastY = ev.clientY;
      var cur = P.view.pinNorm(id);
      P.view.setPin(id, cur.x + du, cur.y + dv);
      Admin.refreshPreview();
      ev.preventDefault();
    });
    var stop = function (ev) {
      if (!dragging) return;
      dragging = false;
      try { stage.releasePointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
    };
    stage.addEventListener('pointerup', stop);
    stage.addEventListener('pointercancel', stop);

    return P;
  };

  Admin.showPreview = function (on) {
    var P = Admin.buildPreview();
    if (!P) return;
    P.box.hidden = !on;
    if (on) Admin.refreshPreview();
  };

  Admin.setPreviewGhost = function (on) {
    if (Admin.preview) Admin.preview.box.classList.toggle('pp-ghost', !!on);
  };

  Admin.refreshPreview = function () {
    var P = Admin.preview;
    if (!P || P.box.hidden) return;
    var id = Admin.ui.selectedPin();
    var st = id ? starById(id) : null;
    if (!st) {
      P.title.textContent = '핀 확대';
      P.stage.style.backgroundImage = 'none';
      P.foot.textContent = '핀을 하나 고르세요';
      return;
    }
    var im = IMAGES.orion;
    var n = P.view.pinNorm(id);
    var pxX = n.x * im.w, pxY = n.y * im.h, z = P.zoom;

    P.stage.style.backgroundImage = 'url("' + im.src + '")';
    P.stage.style.backgroundSize = (im.w * z) + 'px ' + (im.h * z) + 'px';
    P.stage.style.backgroundPosition =
      (-(pxX * z - P.size / 2)) + 'px ' + (-(pxY * z - P.size / 2)) + 'px';

    P.title.textContent = st.id + '. ' + st.kor + ' ×' + z;
    P.foot.textContent = Math.round(pxX) + ', ' + Math.round(pxY) + ' px' +
      ' · 자국 어림 ' + Math.round(expectedMarkPx(st.mag)) + 'px';

    // 고른 핀을 가리지 않도록 반대쪽 모서리로 비켜 준다
    var size = P.view.frameSize();
    P.box.classList.toggle('pp-left', size.w > 0 && n.x > 0.5);
    P.box.classList.toggle('pp-bottom', size.h > 0 && n.y < 0.5);
  };

  /* ---------- 동작 ---------- */
  function mkNudge(parent, label, dir) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (!dir) { b.className = 'sp'; b.disabled = true; }
    parent.appendChild(b);
    if (!dir) return;
    b.addEventListener('click', function () {
      var id = Admin.ui.selectedPin();
      if (!id) { Admin.ui.toast('먼저 핀을 하나 고르세요'); return; }
      var view = Admin.ui.map();
      var cur = view.pinNorm(id);
      view.setPin(id, cur.x + dir[0] * 4 / IMAGES.orion.w, cur.y + dir[1] * 4 / IMAGES.orion.h);
      Admin.refreshPreview();
    });
  }

  Admin.selectPin = function (id) {
    Admin.ui.gotoMeasure();
    if (Admin.editChk && !Admin.editChk.checked) {
      Admin.editChk.checked = true;
      Admin.ui.setPinEdit(true);
      Admin.showPreview(true);
    }
    Admin.ui.selectPin(id);
  };

  Admin.onPinSelected = function (id) {
    if (!Admin.panel) return;
    var chips = Admin.panel.querySelectorAll('.admin-sec .pin-picker')[0];
    if (chips) {
      var list = chips.querySelectorAll('.pin-chip');
      for (var i = 0; i < list.length; i++) {
        list[i].classList.toggle('is-on', Number(list[i].dataset.star) === Number(id));
      }
    }
    Admin.refreshPreview();
  };

  Admin.toggle = function (open) {
    Admin.panel.hidden = !open;
    document.body.classList.toggle('admin-open', open);
    if (open) {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch (e) { window.scrollTo(0, 0); }
    }
  };

  Admin.syncUI = function () {
    for (var path in Admin.rows) {
      if (!Object.prototype.hasOwnProperty.call(Admin.rows, path)) continue;
      var r = Admin.rows[path];
      if (r.check) { r.input.checked = !!Config.get(path, false); continue; }
      var v = Number(Config.get(path, r.input.min));
      r.input.value = v;
      r.out.textContent = r.fmt(v);
    }
  };

  Admin.exportJSON = function () {
    var text = Config.toJSON();
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'config.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      Admin.ui.toast('config.json 을 내려받았습니다');
    } catch (e) {
      Admin.ui.toast('내려받기가 막혀 있습니다 — [JSON 보기]로 복사하세요');
    }
  };

  function pct(v) { return (v * 100).toFixed(1) + '%'; }

  global.Admin = Admin;

})(window);
