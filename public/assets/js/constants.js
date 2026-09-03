/* ==========================================================================
   Night Code 1395 — 전역 상수 / 별 데이터
   앱 문구·출처는 여기서만 고치면 화면 전체에 반영된다.
   ========================================================================== */
(function (global) {
  'use strict';

  var APP = {
    NAME: 'Night Code 1395',
    CREDIT:
      '각석 이미지: 국가유산청 국가유산 디지털 서비스(공공누리 제1유형) / ' +
      '채색본·월하정인: 국립중앙박물관(공공누리 제1유형) / ' +
      '히파르코스: 「Hipparchos」(1844), William Henry Smyth 판화 — 퍼블릭 도메인, Wikimedia Commons / ' +
      '아테네 학당(전체·부분): 라파엘로 산치오 「아테네 학당」(1509–1511), 바티칸 사도궁 서명의 방 — ' +
      '퍼블릭 도메인, Wikimedia Commons / ' +
      '밤하늘 사진: Unsplash (Ryan Hutton), Unsplash License / ' +
      '배경음악: 교사 직접 제작 / 교사 제작 학습 도구 · 등급 자료는 근사값',
    STORAGE_PREFIX: 'byeoljigi1395.'
  };

  /* ---------- 이미지 ----------
     chart_orion 과 chart_color 는 같은 영역을 같은 축척으로 자른 것이라
     좌표계를 그대로 공유한다. 같은 (x,y)는 두 지도에서 같은 별이다. */
  var IMAGES = {
    orion: { src: 'assets/chart_orion.webp', w: 2280, h: 2480 },  // 각석본(흑백) — 측정용
    color: { src: 'assets/chart_color.webp', w: 2280, h: 2480 },  // 채색본(컬러)
    full:  { src: 'assets/chart_full.webp',  w: 540,  h: 622 },   // 전체 지도
    stone: { src: 'assets/chart_stone.jpg', w: 1600, h: 1048 }, // 각석 실물 사진
    bill:  { src: 'assets/bill.webp' }                             // 만원권 뒷면 사진(선택)
  };

  /* ---------- 별 자국 크기 ----------
     밝은 별일수록 크고 깊게 파여 가운데가 비고 테두리만 진한 고리가 된다.
     아래는 chart_orion.webp(2배 확대본) 안의 픽셀 지름 범위. */
  var MARK_PX = { min: 8, max: 60 };
  var MARK_MIN_SCREEN_PX = 60;   // 측정 뷰에서 최소 이만큼은 보이게 확대한다

  /* ==========================================================================
     측정할 별 (교사가 각석본에서 직접 찍어 확정한 좌표)
     - mag : 겉보기 등급(근사값). 화면에는 항상 "≈"를 붙인다.
     - px  : chart_orion.webp 안의 예상 픽셀 좌표(좌상단 0,0).
             삼수(參宿) 일곱 별과 천랑·자수는 교사가 각석본에서 직접 찍어 확정했다.
             카펠라·프로키온·알데바란은 이 크롭 안에서 위치를 확정하지 못해 뺐다.
     ========================================================================== */
  var STARS = [
    { id: 1 , kor: '시리우스',   trad: '천랑(天狼)',            mag: -1.5, px: { x: 2111, y: 2127 } },
    { id: 2 , kor: '리겔',       trad: '삼수 일곱째 별(參宿七)', mag:  0.1, px: { x: 1780, y: 1104 } },
    { id: 3 , kor: '베텔게우스', trad: '삼수 넷째 별(參宿四)',   mag:  0.4, px: { x: 1072, y: 1230 }, note: '변광성' },
    { id: 4 , kor: '알데바란',   trad: '필수 다섯째 별(畢宿五)', mag:  0.9, px: { x: 1139, y:  411 } },
    { id: 5 , kor: '벨라트릭스', trad: '삼수 다섯째 별(參宿五)', mag:  1.6, px: { x: 1283, y:  921 } },
    { id: 6 , kor: '알니탁',     trad: '삼수 첫째 별(參宿一)',   mag:  1.7, px: { x: 1442, y: 1281 } },
    { id: 7 , kor: '사이프',     trad: '삼수 여섯째 별(參宿六)', mag:  2.1, px: { x: 1634, y: 1470 } },
    { id: 8 , kor: '민타카',     trad: '삼수 셋째 별(參宿三)',   mag:  2.2, px: { x: 1450, y: 1146 } },
    { id: 9 , kor: '하트샤',     trad: '벌(伐)',                mag:  2.8, px: { x: 1614, y: 1314 }, note: '삼수의 검' },
    { id: 10, kor: '메이사',     trad: '자수 첫째 별(觜宿一)',   mag:  3.4, px: { x: 1054, y:  951 } }
  ];

  /* 단계 5-3 — 학생이 고르는 예상 */
  var PREDICTIONS = [
    { key: 'bright', label: '더 밝은 별이라서' },
    { key: 'big',    label: '더 큰 별이라서' },
    { key: 'near',   label: '더 가까운 별이라서' },
    { key: 'import', label: '더 중요한 별이라서' }
  ];

  /* 단계 6-1 — 월하정인에서 고를 '이상한 점' 여섯 가지.
     right 가 붙은 것 하나만 실제로 이상하다. 나머지는 그림에 정말 있는 것이지만
     이상할 것은 없는 것들이라, 그림을 꼼꼼히 봐야 갈린다. */
  var MOON_SPOTS = [
    { key: 'lantern', label: '남자가 등불을 들고 있다' },
    { key: 'shadow',  label: '담장에 그림자가 없다' },
    { key: 'moon',    label: '달의 모양이 이상하다', right: true },
    { key: 'text',    label: '그림 안에 글씨가 적혀 있다' },
    { key: 'veil',    label: '여자가 쓰개치마로 얼굴을 가렸다' },
    { key: 'roof',    label: '달이 지붕 바로 위에 낮게 떠 있다' }
  ];

  /* 단계 10 — 순서대로 띄우는 정리 문구 */
  var CONCLUSIONS = [
    '밝은 별일수록 크게 새겨져 있었습니다.',
    '조선은 숫자 대신 <b>크기</b>로 별의 밝기를 기록한 것입니다.',
    '우리가 오늘 잰 값과 현대 천문학의 등급이 비슷하게 맞았습니다.',
    '망원경도 없던 600년 전에, 우리 조상들은 눈으로 보고 밝기까지 구분해 기록했습니다.'
  ];

  /* 단계 표시줄 라벨 */
  var STEP_LABELS = [
    { n: 1,  short: '시작',     long: '인트로',            period: 1 },
    { n: 2,  short: '고천문학', long: '고천문학이란',      period: 1 },
    { n: 3,  short: '지도',     long: '천상열차분야지도',  period: 1 },
    { n: 4,  short: '확대',     long: '한 곳만 골라 확대', period: 1 },
    { n: 5,  short: '비교',     long: '두 지도와 가설',    period: 1, last: true },
    { n: 6,  short: '월하정인', long: '옛 그림 속 달',     period: 2, first: true },
    { n: 7,  short: '등급',     long: '되짚기와 겉보기 등급', period: 2 },
    { n: 8,  short: '측정',     long: '직접 재기',         period: 2 },
    { n: 9,  short: '그래프',   long: '결과 확인',         period: 2 },
    { n: 10, short: '결론',     long: '무엇을 알아냈나',   period: 2 }
  ];

  /* ---------- 편의 함수 ---------- */

  function starById(id) {
    for (var i = 0; i < STARS.length; i++) {
      if (STARS[i].id === Number(id)) return STARS[i];
    }
    return null;
  }

  /** 등급 표기 — 항상 근사값임을 드러낸다 */
  function magText(mag) {
    return '≈ ' + mag.toFixed(1) + '등급';
  }

  /** 등급으로 어림한 별 자국 지름(원본 이미지 픽셀).
      밝은 별(-1.5등급) 약 60px, 어두운 별(3.4등급) 약 8px */
  function expectedMarkPx(mag) {
    var t = (mag - (-1.5)) / (3.4 - (-1.5));
    t = Math.max(0, Math.min(1, t));
    return MARK_PX.max + (MARK_PX.min - MARK_PX.max) * t;
  }

  /** 측정 뷰 확대 배율.
      ① 자국이 뷰의 약 45%를 차지하도록 잡고
      ② 어떤 경우에도 화면에서 60px 아래로 내려가지 않게 올린다. (3~14배) */
  function measureZoom(mag, viewportPx) {
    var mark = expectedMarkPx(mag);
    var z = (viewportPx * 0.45) / mark;
    z = Math.max(z, MARK_MIN_SCREEN_PX / mark);
    return Math.max(3, Math.min(14, z));
  }

  /* ---------- 각석본 ↔ 채색본 좌표 변환 ----------
     두 지도는 크롭이 달라 좌표가 그대로 통하지 않는다. 설정의 colorTransform 으로 옮긴다. */

  /** 각석본 정규화 좌표(0~1) → 채색본 정규화 좌표(0~1) */
  function orionToColor(u, v) {
    var T = (typeof Config !== 'undefined')
      ? Config.get('colorTransform', { a: 1, b: 0, tx: 0, ty: 0 })
      : { a: 1, b: 0, tx: 0, ty: 0 };
    var x = u * IMAGES.orion.w, y = v * IMAGES.orion.h;
    return {
      x: (T.a * x - T.b * y + T.tx) / IMAGES.color.w,
      y: (T.b * x + T.a * y + T.ty) / IMAGES.color.h
    };
  }

  /** 채색본 그림을 각석본 좌표계에 겹쳐 그릴 때 쓰는 CSS 변환(역변환) */
  function colorAlignMatrix(frameW) {
    var T = Config.get('colorTransform', { a: 1, b: 0, tx: 0, ty: 0 });
    var s2 = T.a * T.a + T.b * T.b;
    var A = T.a / s2, B = -T.b / s2;
    var tx = (-T.a * T.tx - T.b * T.ty) / s2;
    var ty = (T.b * T.tx - T.a * T.ty) / s2;
    var k = frameW / IMAGES.color.w;
    return 'matrix(' + A + ',' + B + ',' + (-B) + ',' + A + ',' + (tx * k) + ',' + (ty * k) + ')';
  }

  global.orionToColor = orionToColor;
  global.colorAlignMatrix = colorAlignMatrix;
  global.APP = APP;
  global.IMAGES = IMAGES;
  global.MARK_PX = MARK_PX;
  global.MARK_MIN_SCREEN_PX = MARK_MIN_SCREEN_PX;
  global.STARS = STARS;
  global.PREDICTIONS = PREDICTIONS;
  global.MOON_SPOTS = MOON_SPOTS;
  global.CONCLUSIONS = CONCLUSIONS;
  global.STEP_LABELS = STEP_LABELS;
  global.starById = starById;
  global.magText = magText;
  global.expectedMarkPx = expectedMarkPx;
  global.measureZoom = measureZoom;

})(window);
