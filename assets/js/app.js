/* ==========================================================================
   별지기 1395 — 부팅 / 공통 기능
   글자 크기, 도움말, 토스트, 이미지 지연 로드, 미니맵, 전체 초기화
   ========================================================================== */
(function (global) {
  'use strict';

  var toastTimer = null;
  var App = {};

  function $(id) { return document.getElementById(id); }

  /* ---------- 토스트 ---------- */
  App.toast = function (msg, ms) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2200);
  };

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
      if (b) applyFontSize(Number(b.dataset.fs));
    });
  }

  /* ---------- 이미지 지연 로드 (저사양 태블릿 첫 로드 시간) ---------- */
  App.lazyLoadVisible = function () {
    var imgs = document.querySelectorAll('img.lazy-img[data-src]');
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      // 지금 보이는 화면 안에 있거나 미니맵이면 바로 불러온다
      if (im.offsetParent === null && !im.closest('.minimap')) continue;
      im.src = im.dataset.src;
      im.removeAttribute('data-src');
      (function (node) {
        node.addEventListener('error', function () {
          var box = node.closest('.fig, .zoomstage, .mm-inner');
          if (box && !box.querySelector('.map-missing')) {
            var m = missingBox(box, node.src.split('/').slice(-2).join('/'));
            m.classList.add('mm-overlay');
          }
          node.style.visibility = 'hidden';
        });
      })(im);
    }
  };

  /* ---------- 미니맵 ---------- */
  function refreshMinimap() {
    var r = Config.get('zoomRegion', { x: 0.4, y: 0.5, w: 0.2, h: 0.2 });
    var box = $('mmRect');
    if (!box) return;
    box.style.left = (r.x * 100) + '%';
    box.style.top = (r.y * 100) + '%';
    box.style.width = (r.w * 100) + '%';
    box.style.height = (r.h * 100) + '%';
  }

  /* ---------- 도움말 ---------- */
  function initHelp() {
    var back = $('helpModal'), open = $('btnHelp'), close = $('btnHelpClose');
    function show() { back.hidden = false; close.focus(); }
    function hide() { back.hidden = true; open.focus(); }
    open.addEventListener('click', show);
    close.addEventListener('click', hide);
    back.addEventListener('click', function (ev) { if (ev.target === back) hide(); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !back.hidden) hide();
    });

    $('btnSheetPrint2').addEventListener('click', function () { hide(); Report.printSheet(); });
    $('btnReport2').addEventListener('click', function () { hide(); Report.printReport(); });

    $('btnResetAll').addEventListener('click', function () {
      if (!confirm('이 태블릿에 저장된 진행 상태·측정 기록·결론을 모두 지울까요?\n' +
                   '(교사 캘리브레이션 설정은 남습니다)')) return;
      State.reset();
      hide();
      App.toast('학습 기록을 모두 지웠습니다');
      Steps.go(1);
      location.reload();
    });
  }

  /* ---------- 캘리브레이션이 쓰는 창구 ---------- */
  var UI = {
    toast: App.toast,
    goStep: function (n, sub) { Steps.go(n, sub || 1); },
    gotoMeasure: function () { if (Steps.step !== 6 || Steps.sub !== 2) Steps.go(6, 2); },
    map: function () {
      if (!Steps.map) Steps.go(6, 2);
      return Steps.map;
    },
    setPinEdit: function (on) { var m = UI.map(); if (m) m.setPinEdit(on); },
    selectPin: function (id) { var m = UI.map(); if (m) m.selectPin(id); },
    selectedPin: function () { return Steps.map ? Steps.map.selectedPin : null; }
  };

  /* ---------- 시작 ---------- */
  function boot() {
    document.title = APP.NAME;
    $('appName').textContent = APP.NAME;
    $('appFooter').textContent = APP.CREDIT;

    initFontSize();
    initHelp();
    State.load();

    Config.load(function () {
      refreshMinimap();
      Steps.init();
      Admin.init(UI);
      App.lazyLoadVisible();
    });

    // 설정이 바뀌면 단계 3 사각형과 미니맵을 함께 갱신
    Config.onChange(function () {
      refreshMinimap();
      if (Steps.refreshZoomRect) Steps.refreshZoomRect();
    });

    window.addEventListener('resize', function () { App.lazyLoadVisible(); });
  }

  global.App = App;
  global.AppUI = UI;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window);
