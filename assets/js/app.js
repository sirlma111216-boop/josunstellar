/* ==========================================================================
   별지기 1395 — 앱 부팅 / 탭 전환 / 도움말 / 글자 크기 / 초기화
   ========================================================================== */
(function (global) {
  'use strict';

  var views = { overlay: null, measure: null };
  var currentTab = 'overlay';
  var toastTimer = null;

  /* ---------- 토스트 ---------- */
  function toast(msg, ms) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2200);
  }

  /* ---------- 글자 크기 ---------- */
  function applyFontSize(level) {
    var html = document.documentElement;
    html.classList.remove('fs-1', 'fs-2', 'fs-3');
    html.classList.add('fs-' + level);
    var btns = document.querySelectorAll('.fs-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].dataset.fs === String(level) ? 'true' : 'false');
    }
    Store.set('fontSize', level);
  }

  function initFontSize() {
    applyFontSize(Store.get('fontSize', 2));
    document.querySelector('.fs-group').addEventListener('click', function (ev) {
      var b = ev.target.closest('.fs-btn');
      if (!b) return;
      applyFontSize(Number(b.dataset.fs));
    });
  }

  /* ---------- 탭 ---------- */
  function switchTab(name) {
    if (name !== 'overlay' && name !== 'measure') return;
    currentTab = name;

    var panels = document.querySelectorAll('.panel');
    for (var i = 0; i < panels.length; i++) {
      var on = panels[i].id === 'panel-' + name;
      panels[i].hidden = !on;
      panels[i].classList.toggle('is-active', on);
    }
    var tabs = document.querySelectorAll('.tab');
    for (var j = 0; j < tabs.length; j++) {
      var act = tabs[j].dataset.panel === name;
      tabs[j].classList.toggle('is-active', act);
      tabs[j].setAttribute('aria-selected', act ? 'true' : 'false');
    }

    ensureView(name);
    Store.set('lastTab', name);
  }

  /** 지도 뷰는 처음 볼 때 만든다(첫 로드 속도) */
  function ensureView(name) {
    if (views[name]) {
      // 숨겨져 있는 동안 크기를 못 재므로 보이는 순간 다시 그린다
      views[name].renderSky();
      views[name].renderPins();
      return views[name];
    }
    if (name === 'overlay') {
      views.overlay = new MapView(document.getElementById('mapHost-overlay'), {
        src: IMAGES.orion.src,
        showSky: true,
        showPins: false
      });
      initOpacitySlider(views.overlay);
    } else {
      initRuleCard();
      views.measure = new MapView(document.getElementById('mapHost-measure'), {
        src: IMAGES.orion.src,
        showSky: false,       // 측정할 때는 성도가 방해되지 않도록 끈다
        showPins: true,
        onPinTap: function (id) {
          var st = starById(id);
          // 3단계에서 확대 측정 뷰를 연다
          var z = measureZoom(st.mag, 320);
          toast(st.id + '번 ' + st.kor + ' — 측정 뷰(약 ' + z.toFixed(1) + '배 확대)는 3단계에서 열립니다', 2600);
        },
        onPinSelect: function (id) {
          if (global.Admin && Admin.enabled) Admin.onPinSelected(id);
        },
        onPinMove: function () {
          if (global.Admin && Admin.enabled) Admin.refreshPreview();
        },
        // 지도에서 핀을 끄는 동안에는 확대 창이 비쳐 보이게 한다
        onPinDragState: function (id, dragging) {
          if (global.Admin && Admin.enabled) Admin.setPreviewGhost(dragging);
        }
      });
    }
    return views[name];
  }

  /** 측정 기준 카드(고리 모양 도식 + 문구) — 코드로 그린 SVG */
  function initRuleCard() {
    var host = document.getElementById('ruleCardHost');
    if (!host || host.childNodes.length) return;
    host.appendChild(Guide.buildRuleCard());
  }

  function initTabs() {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        switchTab(this.dataset.panel);
      });
    }
  }

  /* ---------- 겹쳐보기 불투명도 슬라이더 ---------- */
  function initOpacitySlider(view) {
    var range = document.getElementById('opacityRange');
    var out = document.getElementById('opacityValue');
    var saved = Store.get('skyOpacity', null);
    var init = saved === null ? Config.get('sky.opacity', 0.6) : saved;

    range.value = Math.round(init * 100);
    out.textContent = range.value + '%';
    view.setSkyOpacity(init);

    range.addEventListener('input', function () {
      var v = Number(range.value) / 100;
      out.textContent = range.value + '%';
      view.setSkyOpacity(v);
      Store.set('skyOpacity', v);
    });
  }

  /* ---------- 도움말 모달 ---------- */
  function initHelp() {
    var back = document.getElementById('helpModal');
    var open = document.getElementById('btnHelp');
    var close = document.getElementById('btnHelpClose');

    function show() { back.hidden = false; close.focus(); }
    function hide() { back.hidden = true; open.focus(); }

    open.addEventListener('click', show);
    close.addEventListener('click', hide);
    back.addEventListener('click', function (ev) { if (ev.target === back) hide(); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !back.hidden) hide();
    });

    document.getElementById('btnResetAll').addEventListener('click', function () {
      if (!confirm('이 태블릿에 저장된 측정 기록·발견 문장·진행 상태를 모두 지울까요?\n' +
                   '(교사 캘리브레이션 설정은 남습니다)')) return;
      resetStudentData();
      hide();
      toast('학습 기록을 모두 지웠습니다');
    });
  }

  /** 학생 기록만 지운다 — 교사 설정(config)은 남긴다 */
  function resetStudentData() {
    try {
      var keep = APP.STORAGE_PREFIX + 'config';
      var doomed = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(APP.STORAGE_PREFIX) === 0 && k !== keep) doomed.push(k);
      }
      for (var j = 0; j < doomed.length; j++) localStorage.removeItem(doomed[j]);
    } catch (e) { /* 저장소 사용 불가 — 무시 */ }
  }

  /* ---------- 문구 채우기 ---------- */
  function initTexts() {
    document.title = APP.NAME;
    document.getElementById('appName').textContent = APP.NAME;
    document.getElementById('footCredit').textContent = APP.IMAGE_CREDIT;
    document.getElementById('footNote').textContent = APP.FOOTER_NOTE;
  }

  /* ---------- 캘리브레이션 모드가 쓰는 창구 ---------- */
  var UI = {
    toast: toast,
    switchTab: switchTab,
    view: function (name) { return ensureView(name || currentTab); },
    setPinEdit: function (on) {
      var v = ensureView('measure');
      v.setPinEdit(on);
    },
    autoPlacePins: function () { ensureView('measure').autoPlacePins(); },
    selectPin: function (id) { ensureView('measure').selectPin(id); },
    selectedPin: function () { return views.measure ? views.measure.selectedPin : null; },
    pinNorm: function (id) { return ensureView('measure').pinNorm(id); }
  };

  /* ---------- 시작 ---------- */
  function boot() {
    initTexts();
    initFontSize();
    initTabs();
    initHelp();

    Config.load(function () {
      switchTab(Store.get('lastTab', 'overlay'));
      Admin.init(UI);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.AppUI = UI;

})(window);
