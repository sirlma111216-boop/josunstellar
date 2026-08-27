/* ==========================================================================
   별지기 1395 — 전역 상수 / 별 데이터
   * 앱 이름, 출처 문구는 여기서만 고치면 화면 전체에 반영된다.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------- 앱 문구 (교사가 자유롭게 수정) ---------- */
  var APP = {
    NAME: '별지기 1395',                       // 앱 이름(가칭)
    IMAGE_CREDIT: '천상열차분야지도 각석 이미지: 국가유산 디지털 서비스 / ' +
                  '별자리 이름 대조: 국립중앙박물관 소장 채색본(공공누리 제1유형)',
    FOOTER_NOTE: '교사 제작 학습 도구 · 등급 자료는 근사값',
    STORAGE_PREFIX: 'byeoljigi1395.'           // localStorage 키 접두사
  };

  /* ---------- 사용하는 이미지 파일 ----------
     chart_orion.jpg 규격 (실측):
       2280 × 2480 px, 흑백, 흰 바탕에 어두운 별 자국.
       보물 「복각천상열차분야지도 각석」(1687) 원형기록 사진에서
       삼수(오리온) 일대를 잘라 배경 얼룩을 지우고 2배 확대한 것.
  -------------------------------------------------------------- */
  var IMAGES = {
    orion:  { src: 'assets/chart_orion.jpg', w: 2280, h: 2480 },  // 필수
    full:   { src: 'assets/chart_full.jpg' },                     // 선택
    suzhou: { src: 'assets/suzhou.jpg' }                          // 선택
  };

  /* ---------- 별 자국(파낸 자리)의 크기 범위 ----------
     원본 유물을 확대해 보면 밝은 별일수록 크고 깊게 파여
     가운데가 비고 테두리만 진한 '고리' 모양이 된다.
     어두운 별은 작고 속이 찬 점에 가깝다.
     아래 값은 chart_orion.jpg(2배 확대본) 안의 픽셀 지름 범위다. */
  var MARK_PX = { min: 8, max: 60 };

  /* 측정 뷰에서 별 자국이 화면상 최소 이 크기로 보이도록 확대한다 */
  var MARK_MIN_SCREEN_PX = 60;

  /* ==========================================================================
     별 데이터
     - mag : 겉보기 등급(V, 근사값). 화면에는 항상 "≈"를 함께 표기한다.
     - px  : chart_orion.jpg 안의 예상 픽셀 좌표(좌상단 0,0).
             ★ 정답이 아니라 근사값이며 실제 자국과 100~300px 어긋날 수 있다.
             캘리브레이션 모드의 초기 기본값으로만 쓰고,
             교사가 드래그로 확정한 값을 config.json 에 저장해 학생에게 배포한다.
     - sky : 현대 성도 SVG 레이어에서 쓰는 상대 좌표.
             적경·적위를 등간격 원통 근사로 옮긴 값이며,
             좌표계는 x 0~100 / y 0~130, 중심 (50, 65).
             x는 오른쪽으로 갈수록 적경이 작아진다(남쪽 하늘을 바라본 모습).
     ========================================================================== */
  var STARS = [
    { id: 1,  kor: '시리우스',   trad: '천랑(天狼)',           mag: -1.5, sky: { x: 29.9, y: 123.2 }, px: { x: 1276, y: 1966 } },
    { id: 2,  kor: '리겔',       trad: '삼수 일곱째 별(參宿七)', mag:  0.1, sky: { x: 73.1, y: 107.0 }, px: { x: 1634, y:  950 } },
    { id: 3,  kor: '카펠라',     trad: '오거 둘째 별(五車二)',   mag:  0.1, sky: { x: 72.1, y:   3.8 }, px: { x:  294, y:  480 } },
    { id: 4,  kor: '프로키온',   trad: '남하 셋째 별(南河三)',   mag:  0.4, sky: { x:  4.1, y:  81.5 }, px: { x:  454, y: 1920 } },
    { id: 5,  kor: '베텔게우스', trad: '삼수 넷째 별(參宿四)',   mag:  0.4, sky: { x: 53.7, y:  77.3 }, px: { x: 1088, y: 1160 }, note: '변광성' },
    { id: 6,  kor: '알데바란',   trad: '필수 다섯째 별(畢宿五)', mag:  0.9, sky: { x: 91.5, y:  60.0 }, px: { x: 1108, y:  418 } },
    { id: 7,  kor: '벨라트릭스', trad: '삼수 다섯째 별(參宿五)', mag:  1.6, sky: { x: 68.1, y:  79.3 }, px: { x: 1238, y:  916 } },
    { id: 8,  kor: '알닐람',     trad: '삼수 둘째 별(參宿二)',   mag:  1.7, sky: { x: 62.7, y:  93.7 }, px: { x: 1374, y: 1098 } },
    { id: 9,  kor: '알니탁',     trad: '삼수 첫째 별(參宿一)',   mag:  1.7, sky: { x: 60.6, y:  95.1 }, px: { x: 1372, y: 1148 } },
    { id: 10, kor: '사이프',     trad: '삼수 여섯째 별(參宿六)', mag:  2.1, sky: { x: 57.3, y: 109.8 }, px: { x: 1516, y: 1310 } },
    { id: 11, kor: '민타카',     trad: '삼수 셋째 별(參宿三)',   mag:  2.2, sky: { x: 64.8, y:  92.0 }, px: { x: 1372, y: 1048 } },
    { id: 12, kor: '메이사',     trad: '자수 첫째 별(觜宿一)',   mag:  3.4, sky: { x: 63.3, y:  72.5 }, px: { x: 1114, y:  964 } }
  ];

  /* 오리온 별자리 선 — [별 id, 별 id] 쌍 */
  var ORION_LINES = [
    [5, 7],   // 두 어깨 (베텔게우스 - 벨라트릭스)
    [7, 11],  // 오른쪽 어깨 - 민타카
    [11, 8],  // 허리띠
    [8, 9],   // 허리띠
    [9, 5],   // 알니탁 - 베텔게우스
    [9, 10],  // 알니탁 - 사이프
    [10, 2],  // 두 발 (사이프 - 리겔)
    [2, 11],  // 리겔 - 민타카
    [5, 12],  // 베텔게우스 - 메이사(머리)
    [12, 7]   // 메이사 - 벨라트릭스
  ];

  /* 오리온 허리띠 세 별 = 삼수 첫째·둘째·셋째 별. 서로 매우 가까워 핀이 겹친다. */
  var BELT_IDS = [9, 8, 11];

  /* 삼수(오리온) 영역 별 — 현대 성도 레이어 정렬의 기본 기준 */
  var ORION_IDS = [2, 5, 7, 8, 9, 10, 11, 12];

  /* 성도 좌표계 크기 (별 좌표 sky 가 놓인 가상 평면) */
  var SKY_SPACE = { w: 100, h: 130, cx: 50, cy: 65 };

  /* ---------- 편의 함수 ---------- */

  /** id로 별 찾기 */
  function starById(id) {
    for (var i = 0; i < STARS.length; i++) {
      if (STARS[i].id === Number(id)) return STARS[i];
    }
    return null;
  }

  /** 등급 → 성도에서 그릴 원 반지름(성도 좌표계 단위). 밝을수록(등급이 작을수록) 크다. */
  function magToRadius(mag) {
    var r = 1.1 + (3.6 - mag) * 0.75;
    return Math.max(0.9, Math.min(6.2, r));
  }

  /** 등급 표기 — 항상 근사값임을 드러낸다 */
  function magText(mag) {
    return '≈ ' + mag.toFixed(1) + '등급';
  }

  /** 등급으로 어림한 별 자국 지름(원본 이미지 픽셀).
      밝은 별(-1.5등급)이 약 60px, 어두운 별(3.4등급)이 약 8px. */
  function expectedMarkPx(mag) {
    var t = (mag - (-1.5)) / (3.4 - (-1.5));          // 0(밝음) ~ 1(어두움)
    t = Math.max(0, Math.min(1, t));
    return MARK_PX.max + (MARK_PX.min - MARK_PX.max) * t;
  }

  /** 측정 뷰 확대 배율.
      ① 자국이 측정 뷰의 약 45%를 차지하도록 잡고,
      ② 어떤 경우에도 화면에서 MARK_MIN_SCREEN_PX(60px) 아래로 내려가지 않게 올린다.
      3~14배로 제한한다(너무 낮으면 못 재고, 너무 높으면 흐릿해진다). */
  function measureZoom(mag, viewportPx) {
    var mark = expectedMarkPx(mag);
    var z = (viewportPx * 0.45) / mark;                // ① 뷰의 45%를 채우는 배율
    z = Math.max(z, MARK_MIN_SCREEN_PX / mark);        // ② 최소 60px 보장
    return Math.max(3, Math.min(14, z));
  }

  /* ==========================================================================
     현대 성도 ↔ 원본 이미지 정합
     별 12개의 (sky 좌표 → px 좌표) 대응에서 최소제곱 닮음변환
     (배율 k · 회전 θ · 평행이동 C)을 구한다. 반사는 허용하지 않는다.
     ---------------------------------------------------------------------
     · 삼수 8개로 맞추면 허리띠 세 별이 4~20px 오차로 맞는다(기본값).
     · 전체 12개로 맞추면 오차가 고루 퍼지는 대신 삼수가 60px대로 벌어진다.
       옛 지도는 북극 중심 투영이라 극에서 먼 시리우스·프로키온이 바깥으로
       늘어나므로, 등간격 근사인 현대 성도와는 원리상 동시에 맞출 수 없다.
     ========================================================================== */
  function fitSkyToPixels(ids) {
    var list = [];
    for (var i = 0; i < STARS.length; i++) {
      if (!ids || ids.indexOf(STARS[i].id) >= 0) list.push(STARS[i]);
    }
    var n = list.length;
    if (n < 2) return { k: 15, rot: 0, cx: 1140, cy: 1240 };

    var msx = 0, msy = 0, mtx = 0, mty = 0, j;
    for (j = 0; j < n; j++) {
      msx += list[j].sky.x - SKY_SPACE.cx;
      msy += list[j].sky.y - SKY_SPACE.cy;
      mtx += list[j].px.x;
      mty += list[j].px.y;
    }
    msx /= n; msy /= n; mtx /= n; mty /= n;

    var nc = 0, ns = 0, den = 0;
    for (j = 0; j < n; j++) {
      var ax = list[j].sky.x - SKY_SPACE.cx - msx;
      var ay = list[j].sky.y - SKY_SPACE.cy - msy;
      var bx = list[j].px.x - mtx;
      var by = list[j].px.y - mty;
      nc += ax * bx + ay * by;
      ns += ax * by - ay * bx;
      den += ax * ax + ay * ay;
    }
    var th = Math.atan2(ns, nc);
    var k = Math.sqrt(nc * nc + ns * ns) / (den || 1);
    var co = Math.cos(th), si = Math.sin(th);

    return {
      k: k,                                            // 성도 1단위당 이미지 px
      rot: th * 180 / Math.PI,                         // 회전(도)
      cx: mtx - k * (co * msx - si * msy),             // 성도 중심(50,65)이 놓일 이미지 px
      cy: mty - k * (si * msx + co * msy)
    };
  }

  global.APP = APP;
  global.IMAGES = IMAGES;
  global.MARK_PX = MARK_PX;
  global.MARK_MIN_SCREEN_PX = MARK_MIN_SCREEN_PX;
  global.STARS = STARS;
  global.ORION_LINES = ORION_LINES;
  global.BELT_IDS = BELT_IDS;
  global.ORION_IDS = ORION_IDS;
  global.SKY_SPACE = SKY_SPACE;
  global.starById = starById;
  global.magToRadius = magToRadius;
  global.magText = magText;
  global.expectedMarkPx = expectedMarkPx;
  global.measureZoom = measureZoom;
  global.fitSkyToPixels = fitSkyToPixels;

})(window);
