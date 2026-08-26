/* ==========================================================================
   별지기 1395 — 교사 캘리브레이션 모드 (주소 뒤에 ?admin=1 을 붙이면 열린다)
   · 옛 지도의 방향·배율이 현대 성도와 다르므로 교사가 눈으로 맞춘다.
   · 결과는 config.json 으로 내보내 배포하거나, 이 기기(localStorage)에 저장한다.
   ========================================================================== */
(function (global) {
  'use strict';

  var Admin = { enabled: false, panel: null, rows: {} };

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
   * @param path  설정 경로 (예: 'sky.scale')
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
    el('p', 'ahint', s1, '회전을 준 뒤 생기는 빈 모서리는 "확대"로 메웁니다.');

    /* --- 2. 현대 성도 레이어 --- */
    var s2 = section(panel, '② 현대 성도 레이어 맞추기');
    slider(s2, '좌우 이동', 'sky.ox', -0.5, 0.5, 0.002, sgn);
    slider(s2, '상하 이동', 'sky.oy', -0.5, 0.5, 0.002, sgn);
    slider(s2, '배율', 'sky.scale', 0.2, 3, 0.01, mul);
    slider(s2, '회전', 'sky.rot', -180, 180, 0.5, deg);
    slider(s2, '불투명도', 'sky.opacity', 0, 1, 0.01, pct);
    checkbox(s2, '별 이름표 보이기(맞출 때 편함)', 'sky.showLabel');
    var b2 = el('div', 'abtns', s2);
    button(b2, '성도 기본값', '', function () {
      setVal('sky.ox', 0); setVal('sky.oy', 0);
      setVal('sky.scale', 1); setVal('sky.rot', 0);
    });
    el('p', 'ahint', s2, '허리띠 세 별이 지도의 삼수 세 별과 겹치도록 맞추면 나머지도 대체로 맞습니다.');

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
    });

    el('p', 'ahint', s3, '핀을 고른 뒤 아래 화살표로 미세 조정할 수 있습니다.');
    var picker = el('div', 'pin-picker', s3);
    for (var i = 0; i < STARS.length; i++) {
      (function (st) {
        var chip = el('button', 'pin-chip', picker, st.id + '.' + st.kor);
        chip.type = 'button';
        chip.addEventListener('click', function () {
          Admin.selectPin(st.id);
        });
        chip.dataset.star = st.id;
      })(STARS[i]);
    }

    var nud = el('div', 'nudge', s3);
    mkNudge(nud, '', null);           mkNudge(nud, '↑', [0, -1]); mkNudge(nud, '', null);
    mkNudge(nud, '←', [-1, 0]);       mkNudge(nud, '·', [0, 0]);  mkNudge(nud, '→', [1, 0]);
    mkNudge(nud, '', null);           mkNudge(nud, '↓', [0, 1]);  mkNudge(nud, '', null);

    var b3 = el('div', 'abtns', s3);
    button(b3, '성도 위치로 자동 배치', 'btn-primary', function () {
      Admin.ui.autoPlacePins();
      Admin.ui.toast('핀 12개를 현대 성도 위치에 배치했습니다');
    });
    button(b3, '핀 위치 지우기', '', function () {
      Config.data.pins = {};
      Config.notify();
      Admin.ui.toast('핀 위치를 지웠습니다(기본 위치로 표시)');
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
    ta.style.cssText = 'width:100%;margin-top:.5rem;background:#050a1e;color:#dbe6ff;' +
                       'border:1px solid #2c3a72;border-radius:8px;padding:.5rem;font-size:.75rem;';
    s4.appendChild(ta);

    el('p', 'ahint', s4,
      Config.fromFile
        ? 'ⓘ 현재 config.json 파일이 적용 중입니다. 편집한 값을 배포하려면 내보낸 파일로 교체하세요.'
        : 'ⓘ config.json 파일이 없어 이 기기 설정/기본값을 쓰는 중입니다.');

    Admin.syncUI();
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
      var cur = Config.get('pins.' + id, null) || Admin.ui.starNorm(id);
      var step = 0.003;
      Config.data.pins[id] = {
        x: Math.max(0, Math.min(1, cur.x + dir[0] * step)),
        y: Math.max(0, Math.min(1, cur.y + dir[1] * step))
      };
      Config.notify();
    });
  }

  Admin.selectPin = function (id) {
    Admin.ui.switchTab('measure');
    Admin.ui.selectPin(id);
    var chips = Admin.panel.querySelectorAll('.pin-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-on', Number(chips[i].dataset.star) === Number(id));
    }
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
  function deg(v) { return v.toFixed(0) + '°'; }
  function mul(v) { return '×' + v.toFixed(2); }
  function sgn(v) { return (v >= 0 ? '+' : '') + (v * 100).toFixed(1); }
  function norm180(v) { while (v > 180) v -= 360; while (v < -180) v += 360; return v; }

  global.Admin = Admin;

})(window);
