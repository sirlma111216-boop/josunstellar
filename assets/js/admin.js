/* ==========================================================================
   별지기 1395 — 교사 캘리브레이션 모드 (주소 뒤에 ?admin=1 을 붙이면 열린다)
   · 옛 지도의 방향·배율이 현대 성도와 다르므로 교사가 눈으로 맞춘다.
   · 핀과 성도는 원본 이미지 픽셀 기준으로 저장되므로,
     나중에 자르기·회전을 고쳐도 확정한 위치가 그대로 따라간다.
   · 결과는 config.json 으로 내보내 배포하거나, 이 기기(localStorage)에 저장한다.
   ========================================================================== */
(function (global) {
  'use strict';

  var Admin = { enabled: false, panel: null, rows: {}, preview: null };

  /* ---------- 작은 도우미 ---------- */
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

  /**
   * 슬라이더 한 줄
   * @param path  설정 경로 (예: 'sky.k')
   * @param fmt   출력 형식 함수
   */
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

  function button(parent, label, cls, fn) {
    var b = el('button', 'btn btn-sm ' + (cls || ''), parent, label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  /* ---------- 패널 만들기 ---------- */
  Admin.init = function (ui) {
    var params = new URLSearchParams(location.search);
    if (params.get('admin') !== '1') return;
    Admin.enabled = true;
    Admin.ui = ui;

    var root = document.getElementById('adminRoot');
    var IMG = { w: Config.get('image.width', IMAGES.orion.w),
                h: Config.get('image.height', IMAGES.orion.h) };

    // 열기/닫기 버튼
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

    /* --- 0. 이미지 정보 --- */
    var s0 = section(panel, '기준 이미지');
    el('p', 'ahint', s0,
      Config.get('image.file', IMAGES.orion.src) + ' · ' + IMG.w + ' × ' + IMG.h + ' px' +
      ' · 별 자국 지름 약 ' + MARK_PX.min + '~' + MARK_PX.max + ' px');
    if (Config.migrated) {
      el('p', 'ahint warn', s0,
        '⚠ 예전 버전(좌표 기준이 다름) 설정이 있어 핀과 성도를 기본값으로 되돌렸습니다.');
    }

    /* --- 1. 이미지 맞추기 --- */
    var s1 = section(panel, '① 천문도 이미지 맞추기');
    slider(s1, '자르기 X', 'image.crop.x', 0, 0.9, 0.002, pct);
    slider(s1, '자르기 Y', 'image.crop.y', 0, 0.9, 0.002, pct);
    slider(s1, '자르기 폭', 'image.crop.w', 0.05, 1, 0.002, pct);
    slider(s1, '자르기 높이', 'image.crop.h', 0.05, 1, 0.002, pct);
    slider(s1, '회전', 'image.rotate', -180, 180, 0.5, deg);
    slider(s1, '확대', 'image.zoom', 1, 3, 0.01, mul);
    checkbox(s1, '좌우 반전 (옛 지도는 방향이 다를 수 있음)', 'image.flipX');

    var b1 = el('div', 'abtns', s1);
    button(b1, '회전 0°', '', function () { setVal('image.rotate', 0); });
    button(b1, '+90°', '', function () { setVal('image.rotate', norm180(Config.get('image.rotate', 0) + 90)); });
    button(b1, '180°', '', function () { setVal('image.rotate', 180); });
    button(b1, '자르기 전체', '', function () {
      setVal('image.crop.x', 0); setVal('image.crop.y', 0);
      setVal('image.crop.w', 1); setVal('image.crop.h', 1);
    });
    el('p', 'ahint', s1,
      '핀과 성도는 원본 이미지 기준으로 저장되므로, 여기서 자르기·회전을 바꿔도 ' +
      '확정해 둔 위치는 그대로 따라갑니다. 회전 뒤 생기는 빈 모서리는 "확대"로 메웁니다.');

    /* --- 2. 현대 성도 레이어 --- */
    var s2 = section(panel, '② 현대 성도 레이어 맞추기');
    slider(s2, '중심 X', 'sky.cx', 0, IMG.w, 1, px);
    slider(s2, '중심 Y', 'sky.cy', 0, IMG.h, 1, px);
    slider(s2, '배율', 'sky.k', 3, 40, 0.05, kfmt);
    slider(s2, '회전', 'sky.rot', -180, 180, 0.25, deg);
    slider(s2, '불투명도', 'sky.opacity', 0, 1, 0.01, pct);
    checkbox(s2, '별 이름표 보이기(맞출 때 편함)', 'sky.showLabel');

    var b2 = el('div', 'abtns', s2);
    button(b2, '삼수 8개로 맞춤 (기본)', 'btn-primary', function () {
      Config.refitSky('orion'); Admin.syncUI();
      Admin.ui.toast('삼수(오리온) 8개 기준으로 다시 정렬했습니다');
    });
    button(b2, '전체 12개로 맞춤', '', function () {
      Config.refitSky('all'); Admin.syncUI();
      Admin.ui.toast('별 12개 전체 기준으로 다시 정렬했습니다');
    });
    el('p', 'ahint', s2,
      '삼수 8개 기준이면 허리띠 세 별이 거의 정확히 겹칩니다. 대신 옛 지도는 ' +
      '북극 중심 투영이라 극에서 먼 시리우스·프로키온은 바깥으로 벌어집니다. ' +
      '전체 12개 기준은 오차를 고루 나눕니다.');

    /* --- 3. 측정 핀 배치 --- */
    var s3 = section(panel, '③ 측정 핀 12개 배치');
    var editWrap = el('div', null, s3);
    var editChk = document.createElement('input');
    var editLab = el('label', 'achk', editWrap);
    editChk.type = 'checkbox';
    editLab.appendChild(editChk);
    editLab.appendChild(document.createTextNode('핀 편집 모드 (지도에서 핀을 끌어 옮기기)'));
    editChk.addEventListener('change', function () {
      if (editChk.checked) Admin.ui.switchTab('measure');
      Admin.ui.setPinEdit(editChk.checked);
      Admin.showPreview(editChk.checked);
    });
    Admin.editChk = editChk;

    el('p', 'ahint', s3,
      '핀을 고르면 오른쪽 위에 확대 창이 열립니다. 창 안을 끌면 원본 픽셀 단위로 ' +
      '미세 조정되니, 별 자국 한가운데에 십자를 맞추세요. ' +
      '허리띠 세 별(8·9·11)처럼 겹친 핀은 같은 자리를 반복해 누르면 차례로 선택됩니다.');

    var picker = el('div', 'pin-picker', s3);
    for (var i = 0; i < STARS.length; i++) {
      (function (st) {
        var chip = el('button', 'pin-chip', picker, st.id + '.' + st.kor);
        chip.type = 'button';
        chip.addEventListener('click', function () { Admin.selectPin(st.id); });
        chip.dataset.star = st.id;
      })(STARS[i]);
    }

    var nud = el('div', 'nudge', s3);
    mkNudge(nud, '', null);      mkNudge(nud, '↑', [0, -1]); mkNudge(nud, '', null);
    mkNudge(nud, '←', [-1, 0]);  mkNudge(nud, '·', null);    mkNudge(nud, '→', [1, 0]);
    mkNudge(nud, '', null);      mkNudge(nud, '↓', [0, 1]);  mkNudge(nud, '', null);
    el('p', 'ahint', s3, '화살표 한 번 = 원본 이미지 4px 이동');

    var b3 = el('div', 'abtns', s3);
    button(b3, '예상 위치로 초기화', 'btn-primary', function () {
      if (!confirm('측정 핀 12개를 처음 예상 좌표로 되돌릴까요?\n지금까지 옮긴 위치는 사라집니다.')) return;
      Config.resetPins();
      Admin.ui.toast('핀 12개를 예상 위치로 되돌렸습니다');
      Admin.refreshPreview();
    });
    button(b3, '성도 위치로 배치', '', function () {
      Admin.ui.autoPlacePins();
      Admin.ui.toast('핀을 현대 성도 위치에 맞춰 놓았습니다');
      Admin.refreshPreview();
    });

    /* --- 4. 설정 저장/불러오기 --- */
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
      if (!confirm('캘리브레이션 설정을 기본값으로 되돌릴까요?\n(측정 기록은 지워지지 않습니다)')) return;
      Config.resetToDefaults();
      Admin.syncUI();
      Admin.refreshPreview();
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
          Admin.syncUI();
          Admin.refreshPreview();
          Admin.ui.toast('설정을 불러왔습니다');
        } catch (e) {
          Admin.ui.toast('JSON 형식이 올바르지 않습니다');
        }
      };
      fr.readAsText(f);
      fileInput.value = '';
    });

    // 다운로드가 막힌 환경(사파리 등)을 위한 복사용 텍스트 상자
    var ta = document.createElement('textarea');
    ta.hidden = true;
    ta.rows = 8;
    ta.className = 'admin-json';
    s4.appendChild(ta);

    el('p', 'ahint', s4,
      (Config.fromFile
        ? 'ⓘ 현재 config.json 파일이 적용 중입니다. 편집한 값을 배포하려면 내보낸 파일로 교체하세요.'
        : 'ⓘ config.json 파일이 없어 이 기기 설정/기본값을 쓰는 중입니다.') +
      ' 내보내는 파일에는 기준 이미지 파일명과 규격도 함께 기록됩니다.');

    Admin.syncUI();
  };

  /* ==========================================================================
     핀 확대 미리보기 — 별 자국 한가운데에 정확히 놓였는지 눈으로 확인한다
     ========================================================================== */
  Admin.buildPreview = function () {
    if (Admin.preview) return Admin.preview;

    var view = Admin.ui.view('measure');
    var box = document.createElement('div');
    box.className = 'pin-preview';
    box.hidden = true;

    var head = document.createElement('div');
    head.className = 'pp-head';
    var title = document.createElement('span');
    title.className = 'pp-title';
    title.textContent = '핀 확대';
    head.appendChild(title);

    var zoomOut = document.createElement('button');
    zoomOut.type = 'button'; zoomOut.className = 'pp-btn'; zoomOut.textContent = '−';
    var zoomIn = document.createElement('button');
    zoomIn.type = 'button'; zoomIn.className = 'pp-btn'; zoomIn.textContent = '+';
    head.appendChild(zoomOut); head.appendChild(zoomIn);
    box.appendChild(head);

    var stage = document.createElement('div');
    stage.className = 'pp-stage';
    box.appendChild(stage);

    // 십자선 — 핀이 가리키는 바로 그 지점
    var ch = document.createElement('div');
    ch.className = 'pp-cross';
    stage.appendChild(ch);

    var foot = document.createElement('div');
    foot.className = 'pp-foot';
    box.appendChild(foot);

    view.frame.appendChild(box);

    var P = {
      box: box, stage: stage, foot: foot, title: title,
      zoom: 4, size: 170, view: view
    };
    Admin.preview = P;

    zoomOut.addEventListener('click', function () {
      P.zoom = Math.max(2, P.zoom - 1); Admin.refreshPreview();
    });
    zoomIn.addEventListener('click', function () {
      P.zoom = Math.min(12, P.zoom + 1); Admin.refreshPreview();
    });

    // 확대 창 안에서 끌어 미세 조정 (창 1px = 원본 1/zoom px)
    var dragging = false, lastX = 0, lastY = 0;
    stage.addEventListener('pointerdown', function (ev) {
      var id = Admin.ui.selectedPin();
      if (!id) return;
      dragging = true; lastX = ev.clientX; lastY = ev.clientY;
      try { stage.setPointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
      ev.preventDefault();
    });
    stage.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      var id = Admin.ui.selectedPin();
      if (!id) return;
      var img = { w: Config.get('image.width', IMAGES.orion.w),
                  h: Config.get('image.height', IMAGES.orion.h) };
      // 창을 끄는 방향과 반대로 그림이 움직이므로, 핀은 끈 방향의 반대로 간다
      var du = -(ev.clientX - lastX) / P.zoom / img.w;
      var dv = -(ev.clientY - lastY) / P.zoom / img.h;
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

  /** 지도에서 핀을 끄는 동안 확대 창을 비쳐 보이게(가리지 않게) */
  Admin.setPreviewGhost = function (on) {
    if (!Admin.preview) return;
    Admin.preview.box.classList.toggle('pp-ghost', !!on);
  };

  Admin.showPreview = function (on) {
    var P = Admin.buildPreview();
    P.box.hidden = !on;
    if (on) Admin.refreshPreview();
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

    var img = { w: Config.get('image.width', IMAGES.orion.w),
                h: Config.get('image.height', IMAGES.orion.h) };
    var n = P.view.pinNorm(id);
    var pxX = n.x * img.w, pxY = n.y * img.h;
    var z = P.zoom;

    P.stage.style.backgroundImage = 'url("' + Config.get('image.file', IMAGES.orion.src) + '")';
    P.stage.style.backgroundSize = (img.w * z) + 'px ' + (img.h * z) + 'px';
    P.stage.style.backgroundPosition =
      (-(pxX * z - P.size / 2)) + 'px ' + (-(pxY * z - P.size / 2)) + 'px';

    P.title.textContent = st.id + '. ' + st.kor + ' ×' + z;
    P.foot.textContent =
      Math.round(pxX) + ', ' + Math.round(pxY) + ' px' +
      ' · 자국 어림 ' + Math.round(expectedMarkPx(st.mag)) + 'px';

    // 지금 고른 핀을 가리지 않도록 반대쪽 모서리로 비켜 준다
    var t = P.view.xform();
    var f = P.view.imageToFrame(n.x, n.y, t);
    P.box.classList.toggle('pp-left', t.W > 0 && f.x > t.W / 2);
    P.box.classList.toggle('pp-bottom', t.H > 0 && f.y < t.H / 2);
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
      var img = { w: Config.get('image.width', IMAGES.orion.w),
                  h: Config.get('image.height', IMAGES.orion.h) };
      var step = 4;                    // 원본 이미지 4px
      var view = Admin.ui.view('measure');
      var cur = view.pinNorm(id);
      view.setPin(id, cur.x + dir[0] * step / img.w, cur.y + dir[1] * step / img.h);
      Admin.refreshPreview();
    });
  }

  Admin.selectPin = function (id) {
    Admin.ui.switchTab('measure');
    if (Admin.editChk && !Admin.editChk.checked) {
      // 핀을 고르면 자연스럽게 편집 모드로 들어간다
      Admin.editChk.checked = true;
      Admin.ui.setPinEdit(true);
      Admin.showPreview(true);
    }
    Admin.ui.selectPin(id);
  };

  /** MapView 가 선택 변경을 알려 오면 칩과 확대 창을 함께 갱신 */
  Admin.onPinSelected = function (id) {
    if (!Admin.panel) return;
    var chips = Admin.panel.querySelectorAll('.pin-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-on', Number(chips[i].dataset.star) === Number(id));
    }
    Admin.refreshPreview();
  };

  Admin.toggle = function (open) {
    Admin.panel.hidden = !open;
    document.body.classList.toggle('admin-open', open);
    // 패널을 열면 맞출 지도가 화면 위쪽에 모두 보이도록 맨 위로 스크롤
    if (open) {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch (e) { window.scrollTo(0, 0); }
    }
  };

  /** 설정이 통째로 바뀐 뒤 컨트롤 값을 다시 맞춘다 */
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
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      Admin.ui.toast('config.json 을 내려받았습니다');
    } catch (e) {
      Admin.ui.toast('내려받기가 막혀 있습니다 — [JSON 보기]로 복사하세요');
    }
  };

  /* 설정값을 코드에서 바꿀 때: 화면 컨트롤까지 함께 갱신 */
  function setVal(path, v) {
    Config.set(path, v);
    var r = Admin.rows[path];
    if (r && !r.check) { r.input.value = v; r.out.textContent = r.fmt(Number(v)); }
  }

  /* 출력 형식 */
  function pct(v) { return Math.round(v * 100) + '%'; }
  function deg(v) { return v.toFixed(1) + '°'; }
  function mul(v) { return '×' + v.toFixed(2); }
  function px(v) { return Math.round(v) + 'px'; }
  function kfmt(v) { return v.toFixed(2); }
  function norm180(v) { while (v > 180) v -= 360; while (v < -180) v += 360; return v; }

  global.Admin = Admin;

})(window);
