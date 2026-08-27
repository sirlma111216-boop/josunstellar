/* ==========================================================================
   별지기 1395 — 저장소 / 설정(캘리브레이션) 관리
   설정 우선순위 : config.json  →  localStorage  →  기본값
   (교사가 캘리브레이션 패널에서 "이 기기 설정 우선"을 켜면 localStorage가 이긴다)

   ★ 좌표 기준(설정 version 2부터)
     측정 핀과 현대 성도 레이어는 화면 프레임이 아니라 **원본 이미지 픽셀**을
     기준으로 저장한다. 그래야 교사가 자르기·회전·반전을 나중에 고쳐도
     확정해 둔 핀 위치가 따라 움직인다.
       · pins  : 원본 이미지 정규화 좌표(0~1). {x: px/이미지폭, y: py/이미지높이}
       · sky   : 성도 중심이 놓일 이미지 픽셀 좌표 cx,cy + 배율 k + 회전 rot
   ========================================================================== */
(function (global) {
  'use strict';

  var CONFIG_VERSION = 2;

  /* ---------- localStorage 얇은 래퍼 (사파리 프라이빗 모드 대비 try/catch) ---------- */
  var Store = {
    key: function (k) { return APP.STORAGE_PREFIX + k; },

    get: function (k, fallback) {
      try {
        var raw = localStorage.getItem(Store.key(k));
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },

    set: function (k, v) {
      try { localStorage.setItem(Store.key(k), JSON.stringify(v)); return true; }
      catch (e) { return false; }
    },

    remove: function (k) {
      try { localStorage.removeItem(Store.key(k)); } catch (e) { /* 무시 */ }
    },

    /** 이 앱이 저장한 키만 골라서 지운다 (다른 앱 데이터는 건드리지 않음) */
    clearApp: function () {
      try {
        var doomed = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(APP.STORAGE_PREFIX) === 0) doomed.push(k);
        }
        for (var j = 0; j < doomed.length; j++) localStorage.removeItem(doomed[j]);
      } catch (e) { /* 무시 */ }
    }
  };

  /* ---------- 성도 레이어 기본 정렬 ---------- */
  function defaultSky(basis) {
    var f = fitSkyToPixels(basis === 'all' ? null : ORION_IDS);
    return {
      cx: Math.round(f.cx * 10) / 10,   // 성도 중심(50,65)이 놓일 이미지 px
      cy: Math.round(f.cy * 10) / 10,
      k: Math.round(f.k * 1000) / 1000, // 성도 1단위 = 이미지 몇 px
      rot: Math.round(f.rot * 100) / 100,
      opacity: 0.6,
      showLabel: false,
      fitBasis: basis || 'orion'        // 'orion'(삼수 8개) | 'all'(전체 12개)
    };
  }

  /* ---------- 측정 핀 기본 위치 = STARS 의 예상 픽셀 좌표 ---------- */
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

  /* ---------- 기본 설정값 ---------- */
  function defaults() {
    return {
      version: CONFIG_VERSION,
      savedAt: null,
      preferLocal: false,          // true면 config.json 보다 이 기기 설정을 우선
      image: {
        file: IMAGES.orion.src,             // 어떤 이미지를 기준으로 맞춘 설정인지 기록
        width: IMAGES.orion.w,              // 규격도 함께 기록해 둔다
        height: IMAGES.orion.h,
        crop: { x: 0, y: 0, w: 1, h: 1 },   // 원본에서 잘라 쓸 영역(0~1 비율)
        rotate: 0,                          // 회전(도)
        flipX: false,                       // 좌우 반전
        zoom: 1                             // 회전 후 생기는 여백을 메우는 확대
      },
      sky: defaultSky('orion'),
      pins: defaultPins()
    };
  }

  /* ---------- 깊은 병합 : 나중에 항목이 추가돼도 예전 설정이 살아남도록 ---------- */
  function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }
  function deepMerge(base, patch) {
    if (!isPlainObject(patch)) return base;
    var out = {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    for (k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      if (isPlainObject(out[k]) && isPlainObject(patch[k])) out[k] = deepMerge(out[k], patch[k]);
      else if (patch[k] !== undefined) out[k] = patch[k];
    }
    return out;
  }

  /** version 1 설정은 좌표 기준이 달라 그대로 쓸 수 없다 — 핀·성도만 기본값으로 되돌린다 */
  function migrate(raw) {
    if (!isPlainObject(raw)) return null;
    if ((raw.version || 1) >= CONFIG_VERSION) return raw;
    var copy = JSON.parse(JSON.stringify(raw));
    delete copy.pins;      // 옛 핀은 프레임 기준이라 폐기
    delete copy.sky;       // 옛 성도 변환값(ox/oy/scale)도 폐기
    copy.version = CONFIG_VERSION;
    copy._migrated = true;
    return copy;
  }

  /* ---------- 설정 객체 ---------- */
  var Config = {
    data: defaults(),
    fromFile: false,      // config.json 을 읽었는가
    migrated: false,      // 옛 버전 설정을 되돌렸는가
    listeners: [],

    /** 변경 알림 구독 */
    onChange: function (fn) { Config.listeners.push(fn); },
    notify: function () {
      for (var i = 0; i < Config.listeners.length; i++) {
        try { Config.listeners[i](Config.data); } catch (e) { console.warn(e); }
      }
    },

    /** 시작 시 1회 호출 — config.json → localStorage → 기본값 */
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
          // 교사가 "이 기기 설정 우선"을 켜 두었으면 localStorage가 파일을 덮어쓴다
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

    /** 현재 설정을 이 기기에 저장 */
    save: function () {
      Config.data.savedAt = new Date().toISOString();
      var ok = Store.set('config', Config.data);
      Config.notify();
      return ok;
    },

    /** 값 수정 후 알림 (경로 예: 'sky.k') */
    set: function (path, value) {
      var parts = path.split('.');
      var node = Config.data;
      for (var i = 0; i < parts.length - 1; i++) {
        if (!isPlainObject(node[parts[i]])) node[parts[i]] = {};
        node = node[parts[i]];
      }
      node[parts[parts.length - 1]] = value;
      Config.notify();
    },

    get: function (path, fallback) {
      var parts = path.split('.');
      var node = Config.data;
      for (var i = 0; i < parts.length; i++) {
        if (node === null || node === undefined) return fallback;
        node = node[parts[i]];
      }
      return node === undefined ? fallback : node;
    },

    /** 기본값으로 되돌리기(설정만) */
    resetToDefaults: function () {
      Config.data = defaults();
      Config.notify();
    },

    /** 측정 핀만 예상 위치로 되돌리기 */
    resetPins: function () {
      Config.data.pins = defaultPins();
      Config.notify();
    },

    /** 성도 레이어만 다시 정렬 ('orion' | 'all') */
    refitSky: function (basis) {
      var keep = Config.data.sky || {};
      var next = defaultSky(basis);
      next.opacity = keep.opacity === undefined ? 0.6 : keep.opacity;
      next.showLabel = !!keep.showLabel;
      Config.data.sky = next;
      Config.notify();
      return next;
    },

    /** JSON 문자열로 내보내기 */
    toJSON: function () { return JSON.stringify(Config.data, null, 2); },

    /** JSON 불러오기 — 형식이 어긋나도 앱이 죽지 않게 병합 */
    fromJSON: function (text) {
      var obj = migrate(JSON.parse(text));       // 실패 시 호출부에서 catch
      Config.data = deepMerge(defaults(), obj);
      delete Config.data._migrated;
      Config.notify();
      return Config.data;
    }
  };

  global.CONFIG_VERSION = CONFIG_VERSION;
  global.Store = Store;
  global.Config = Config;
  global.deepMerge = deepMerge;
  global.defaultPins = defaultPins;

})(window);
