/* ==========================================================================
   Night Code 1395 — 부팅 / 공통 기능
   글자 크기, 도움말, 토스트, 이미지 지연 로드, 전체 초기화
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

  /* ---------- 배경음악 ----------
     교실에서 태블릿 서른 대가 한꺼번에 울리면 수업이 안 되므로
     기본은 꺼져 있고, 기기마다 따로 켠다(그 기기에 기억된다).
     파일(assets/bgm.mp3)이 없으면 버튼 자체를 띄우지 않는다. */
  var BGM_SRC = 'assets/bgm.mp3';
  var BGM_VOL = 0.25;          // 말소리를 덮지 않을 만큼만

  function initBgm() {
    var btn = $('btnBgm');
    if (!btn) return;
    var audio = null, on = false;

    function paint() {
      btn.classList.toggle('is-on', on);
      btn.textContent = on ? '♫' : '♪';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      var label = on ? '배경음악 끄기' : '배경음악 켜기';
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }

    function make() {
      if (audio) return audio;
      audio = new Audio(BGM_SRC);
      audio.loop = true;
      audio.volume = 0;
      return audio;
    }

    /** 갑자기 커지지 않도록 천천히 올리고 내린다 */
    function fade(to, done) {
      clearInterval(audio._t);
      audio._t = setInterval(function () {
        var v = audio.volume + (to > audio.volume ? 0.02 : -0.02);
        if ((to > audio.volume && v >= to) || (to < audio.volume && v <= to)) {
          clearInterval(audio._t);
          audio.volume = to;
          if (done) done();
          return;
        }
        audio.volume = Math.max(0, Math.min(1, v));
      }, 40);
    }

    /* 브라우저는 사용자가 한 번 누르기 전에는 소리를 내주지 않는다.
       그럴 때 다음 조작을 기다렸다가 이어서 튼다. */
    function armOnGesture() {
      var once = function () {
        document.removeEventListener('pointerdown', once);
        document.removeEventListener('keydown', once);
        if (on) start();
      };
      document.addEventListener('pointerdown', once, { once: true });
      document.addEventListener('keydown', once, { once: true });
    }

    function start() {
      make();
      var p = audio.play();
      if (p && p.catch) {
        p.catch(function () {
          // 막혔다면 안내만 하지 말고, 다음에 누를 때 실제로 시작되게 걸어 둔다
          App.toast('화면을 한 번 누르면 음악이 시작됩니다', 3000);
          armOnGesture();
        });
      }
      fade(BGM_VOL);
    }

    function stop() {
      if (!audio) return;
      fade(0, function () { audio.pause(); });
    }

    btn.addEventListener('click', function () {
      on = !on;
      Store.set('bgm', on);
      paint();
      if (on) start(); else stop();
    });

    // 파일이 있을 때만 버튼을 띄운다.
    // 두 가지를 조심해야 한다.
    //   · 없는 주소는 Worker 가 첫 화면(index.html)을 200 으로 돌려준다.
    //     상태 코드로는 알 수 없으므로 실제로 소리 파일인지 본다.
    //   · 이 파일은 오래 캐시되므로, 넣거나 뺀 것이 바로 반영되도록 캐시를 건너뛴다.
    fetch(BGM_SRC, { method: 'HEAD', cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) return;
        if ((r.headers.get('content-type') || '').indexOf('audio') < 0) return;
        btn.hidden = false;
        on = Store.get('bgm', false);      // 기본 꺼짐
        paint();
        if (on) armOnGesture();   // 지난번에 켜 두었다면 첫 조작 때 이어서 튼다
      })
      .catch(function () { /* 파일이 없으면 버튼은 숨은 채로 둔다 */ });
  }

  /* ---------- 이미지 지연 로드 (저사양 태블릿 첫 로드 시간) ---------- */
  App.lazyLoadVisible = function () {
    var imgs = document.querySelectorAll('img.lazy-img[data-src]');
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      // 지금 보이는 화면 안에 있는 것만 불러온다
      if (im.offsetParent === null) continue;
      im.src = im.dataset.src;
      im.removeAttribute('data-src');
      (function (node) {
        node.addEventListener('error', function () {
          var box = node.closest('.fig, .zoomstage');
          if (box && !box.querySelector('.map-missing')) {
            var m = missingBox(box, node.src.split('/').slice(-2).join('/'));
            m.classList.add('mm-overlay');
          }
          node.style.visibility = 'hidden';
        });
      })(im);
    }
  };

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

  /* 교사 캘리브레이션은 ?admin=1 로 들어올 때만 읽는다.
     학생 기기에서는 20KB 를 내려받지도 해석하지도 않는다. */
  function loadAdmin() {
    if (new URLSearchParams(location.search).get('admin') !== '1') return;
    var s = document.createElement('script');
    s.src = 'assets/js/admin.js';
    s.onload = function () { if (global.Admin) Admin.init(UI); };
    document.head.appendChild(s);
  }

  /* ---------- 시작 ---------- */
  function boot() {
    document.title = APP.NAME;
    $('appName').textContent = APP.NAME;
    $('appFooter').textContent = APP.CREDIT;

    initFontSize();
    initBgm();
    initHelp();
    State.load();
    if (global.Live) Live.restore();   // 새로고침·QR 로 들어와도 수업에 다시 붙는다

    Config.load(function () {
      Steps.init();
      App.lazyLoadVisible();
      loadAdmin();
    });

    // 설정이 바뀌면 단계 3 사각형을 갱신
    Config.onChange(function () {
      if (Steps.refreshZoomRect) Steps.refreshZoomRect();
    });

    window.addEventListener('resize', function () { App.lazyLoadVisible(); });
  }

  global.App = App;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window);
