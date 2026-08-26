/* ==========================================================================
   별지기 1395 — 저장소 / 설정(캘리브레이션) 관리
   설정 우선순위 : config.json  →  localStorage  →  기본값
   (교사가 캘리브레이션 패널에서 "이 기기 설정 우선"을 켜면 localStorage가 이긴다)
   ========================================================================== */
(function (global) {
  'use strict';

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

  /* ---------- 기본 설정값 ---------- */
  function defaults() {
    return {
      version: 1,
      savedAt: null,
      preferLocal: false,          // true면 config.json 보다 이 기기 설정을 우선
      image: {
        crop: { x: 0, y: 0, w: 1, h: 1 },   // 원본 이미지에서 잘라 쓸 영역(0~1 비율)
        rotate: 0,                          // 회전(도)
        flipX: false,                       // 좌우 반전
        zoom: 1                             // 회전 후 생기는 여백을 메우는 확대
      },
      sky: {
        ox: 0,        // 좌우 이동(프레임 폭 대비 비율, -0.5~0.5)
        oy: 0,        // 상하 이동(프레임 높이 대비 비율)
        scale: 1,     // 배율
        rot: 0,       // 회전(도)
        opacity: 0.6, // 겹쳐보기 기본 불투명도
        showLabel: false
      },
      pins: {}        // { "1": {x:0.5, y:0.5}, ... } 프레임 기준 0~1 좌표
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

  /* ---------- 설정 객체 ---------- */
  var Config = {
    data: defaults(),
    fromFile: false,      // config.json 을 읽었는가
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
      var local = Store.get('config', null);

      fetch('config.json', { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('no config.json');
          return res.json();
        })
        .then(function (fileCfg) {
          Config.fromFile = true;
          var merged = deepMerge(base, fileCfg);
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

    /** 값 수정 후 알림 (경로 예: 'sky.scale') */
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

    /** JSON 문자열로 내보내기 */
    toJSON: function () { return JSON.stringify(Config.data, null, 2); },

    /** JSON 불러오기 — 형식이 어긋나도 앱이 죽지 않게 병합 */
    fromJSON: function (text) {
      var obj = JSON.parse(text);           // 실패 시 호출부에서 catch
      Config.data = deepMerge(defaults(), obj);
      Config.notify();
      return Config.data;
    }
  };

  global.Store = Store;
  global.Config = Config;
  global.deepMerge = deepMerge;

})(window);
