/* ==========================================================================
   Night Code 1395 — 교사 설정(캘리브레이션)
   우선순위 : config.json  →  localStorage  →  기본값

   ★ 좌표 기준
     측정 핀은 원본 이미지 정규화 좌표(0~1)로 저장한다.
     각석본과 채색본은 크롭이 달라, colorTransform 으로 좌표를 옮긴다.
   ========================================================================== */
(function (global) {
  'use strict';

  var CONFIG_VERSION = 4;

  /* ---------- localStorage 얇은 래퍼 (사파리 프라이빗 모드 대비) ---------- */
  var Store = {
    key: function (k) { return APP.STORAGE_PREFIX + k; },
    get: function (k, fallback) {
      try {
        var raw = localStorage.getItem(Store.key(k));
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (k, v) {
      try { localStorage.setItem(Store.key(k), JSON.stringify(v)); return true; }
      catch (e) { return false; }
    },
    remove: function (k) {
      try { localStorage.removeItem(Store.key(k)); } catch (e) { /* 무시 */ }
    },
    /** 이 앱이 저장한 키만 지운다. keep 에 든 키는 남긴다. */
    clearApp: function (keep) {
      keep = keep || [];
      try {
        var doomed = [], i;
        for (i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (!k || k.indexOf(APP.STORAGE_PREFIX) !== 0) continue;
          var bare = k.slice(APP.STORAGE_PREFIX.length);
          if (keep.indexOf(bare) < 0) doomed.push(k);
        }
        for (i = 0; i < doomed.length; i++) localStorage.removeItem(doomed[i]);
      } catch (e) { /* 무시 */ }
    }
  };

  /** 측정 핀 기본 위치 = STARS 의 예상 픽셀 좌표 */
  function defaultPins() {
    var pins = {};
    for (var i = 0; i < STARS.length; i++) {
      var s = STARS[i];
      pins[s.id] = {
        x: Number((s.px.x / IMAGES.orion.w).toFixed(5)),
        y: Number((s.px.y / IMAGES.orion.h).toFixed(5))
      };
    }
    return pins;
  }

  function defaults() {
    return {
      version: CONFIG_VERSION,
      savedAt: null,
      preferLocal: false,

      /* 기준 이미지 규격 — 내보낸 config.json 만 봐도 무엇에 맞춘 설정인지 알 수 있게 */
      images: {
        orion: { file: IMAGES.orion.src, width: IMAGES.orion.w, height: IMAGES.orion.h },
        color: { file: IMAGES.color.src, width: IMAGES.color.w, height: IMAGES.color.h },
        full:  { file: IMAGES.full.src,  width: IMAGES.full.w,  height: IMAGES.full.h }
      },

      /* 단계 4에서 전체 지도 중 확대해 들어갈 영역 (chart_full.webp 정규화 좌표)
         ※ 눈으로 확인하지 않은 어림값이다. 교사가 캘리브레이션에서 맞춘 뒤
            confirmed 를 true 로 바꾼다. */
      zoomRegion: { x: 0.468, y: 0.558, w: 0.213, h: 0.201, confirmed: false },

      /* 단계 5에서 나란히 확대해 보여줄 별 3개 (핀 번호) */
      trioIds: [1, 5, 10],

      /* 교사가 넣는 수업 자료. 영상은 유튜브 주소나 id 를 그대로 넣으면 된다.
         비어 있으면 그 화면에 안내만 뜨고 재생 버튼은 감춘다. */
      media: {
        videoAstro: '1ZrqLv4o_SQ',      // 단계 2 · 고천문학자 소개
        videoMap: '52jrmGFCUNQ',        // 단계 5 · 천상열차분야지도 소개
        videoMoon: 'iSkHAU5uHpU',       // 단계 6 · 월하정인
        moonImage: 'assets/moon.webp'   // 단계 6 · 신윤복 월하정인 그림
      },

      /* 각석본 → 채색본 좌표 변환 (닮음변환).
         두 지도는 같은 영역을 담았지만 크롭이 달라 채색본이 약 9% 작고 322px 위에 있다.
         교사가 두 지도에 같은 별 6개를 표시해 준 대응으로 구했다(잔차 2~16px). */
      colorTransform: { a: 0.907265, b: -0.004094, tx: 75.1, ty: -321.7 },

      /* 측정 핀 12개 (이미지 정규화 좌표) */
      pins: defaultPins()
    };
  }

  /* ---------- 깊은 병합 ---------- */
  function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function deepMerge(base, patch) {
    if (!isPlainObject(patch)) return base;
    var out = {}, k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    for (k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      if (isPlainObject(out[k]) && isPlainObject(patch[k])) out[k] = deepMerge(out[k], patch[k]);
      else if (patch[k] !== undefined) out[k] = patch[k];
    }
    return out;
  }

  /** 예전 버전 설정은 좌표 기준이 달라 핀만 기본값으로 되돌린다 */
  function migrate(raw) {
    if (!isPlainObject(raw)) return null;
    if ((raw.version || 1) >= CONFIG_VERSION) return raw;
    var copy = JSON.parse(JSON.stringify(raw));
    delete copy.pins;
    delete copy.sky;
    delete copy.image;
    delete copy.trioIds;   /* 별 번호를 1~10 으로 다시 매겨서, 옛 번호는 못 쓴다 */
    copy.version = CONFIG_VERSION;
    copy._migrated = true;
    return copy;
  }

  var Config = {
    data: defaults(),
    fromFile: false,
    migrated: false,
    listeners: [],

    onChange: function (fn) { Config.listeners.push(fn); },
    notify: function () {
      for (var i = 0; i < Config.listeners.length; i++) {
        try { Config.listeners[i](Config.data); } catch (e) { console.warn(e); }
      }
    },

    load: function (done) {
      var base = defaults();
      var local = migrate(Store.get('config', null));
      if (local && local._migrated) Config.migrated = true;

      fetch('config.json', { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('no config.json');
          return res.json();
        })
        .then(function (fileCfg) {
          Config.fromFile = true;
          var f = migrate(fileCfg);
          if (f && f._migrated) Config.migrated = true;
          var merged = deepMerge(base, f);
          if (local && local.preferLocal) merged = deepMerge(merged, local);
          Config.data = merged;
        })
        .catch(function () {
          // config.json 이 없거나 file:// 로 열어 fetch가 막힌 경우 — 정상 흐름
          Config.fromFile = false;
          Config.data = local ? deepMerge(base, local) : base;
        })
        .then(function () {
          delete Config.data._migrated;
          Config.notify();
          if (done) done(Config.data);
        });
    },

    save: function () {
      Config.data.savedAt = new Date().toISOString();
      var ok = Store.set('config', Config.data);
      Config.notify();
      return ok;
    },

    set: function (path, value) {
      var parts = path.split('.'), node = Config.data;
      for (var i = 0; i < parts.length - 1; i++) {
        if (!isPlainObject(node[parts[i]])) node[parts[i]] = {};
        node = node[parts[i]];
      }
      node[parts[parts.length - 1]] = value;
      Config.notify();
    },

    get: function (path, fallback) {
      var parts = path.split('.'), node = Config.data;
      for (var i = 0; i < parts.length; i++) {
        if (node === null || node === undefined) return fallback;
        node = node[parts[i]];
      }
      return node === undefined ? fallback : node;
    },

    resetToDefaults: function () { Config.data = defaults(); Config.notify(); },
    resetPins: function () { Config.data.pins = defaultPins(); Config.notify(); },

    toJSON: function () { return JSON.stringify(Config.data, null, 2); },

    fromJSON: function (text) {
      var obj = migrate(JSON.parse(text));
      Config.data = deepMerge(defaults(), obj);
      delete Config.data._migrated;
      Config.notify();
      return Config.data;
    }
  };

  global.CONFIG_VERSION = CONFIG_VERSION;
  global.Store = Store;
  global.Config = Config;
  global.defaultPins = defaultPins;

})(window);
