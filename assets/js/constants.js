/* ==========================================================================
   별지기 1395 — 전역 상수 / 별 데이터
   * 앱 이름, 출처 문구는 여기서만 고치면 화면 전체에 반영된다.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------- 앱 문구 (교사가 자유롭게 수정) ---------- */
  var APP = {
    NAME: '별지기 1395',                       // 앱 이름(가칭)
    // TODO(교사): 실제 사용한 이미지의 출처·공공누리 유형으로 바꿔 주세요.
    IMAGE_CREDIT: '천상열차분야지도 이미지: 국립고궁박물관(공공누리 제1유형)',
    FOOTER_NOTE: '교사 제작 학습 도구 · 등급 자료는 근사값',
    STORAGE_PREFIX: 'byeoljigi1395.'           // localStorage 키 접두사
  };

  /* ---------- 사용하는 이미지 파일 ---------- */
  var IMAGES = {
    orion: 'assets/chart_orion.jpg',   // 삼수 영역 크롭 (필수)
    full:  'assets/chart_full.jpg',    // 전체 지도 (선택)
    suzhou:'assets/suzhou.jpg'         // 순우천문도 비교 (선택)
  };

  /* ==========================================================================
     별 데이터
     - mag : 겉보기 등급(V, 근사값). 화면에는 항상 "≈"를 함께 표기한다.
     - sky : 현대 성도 SVG 레이어에서 쓰는 상대 좌표.
             적경·적위를 등간격 원통 근사로 옮긴 값이며,
             좌표계는 x 0~100 / y 0~130, 중심 (50, 65).
             x는 오른쪽으로 갈수록 적경이 작아진다(하늘을 남쪽으로 바라본 모습,
             동쪽이 왼쪽). 캘리브레이션 모드에서 전체 이동·배율·회전 조정 가능.
     ========================================================================== */
  var STARS = [
    { id: 1,  kor: '시리우스',   trad: '천랑(天狼)',           mag: -1.5, sky: { x: 29.9, y: 123.2 } },
    { id: 2,  kor: '리겔',       trad: '삼수 일곱째 별(參宿七)', mag:  0.1, sky: { x: 73.1, y: 107.0 } },
    { id: 3,  kor: '카펠라',     trad: '오거 둘째 별(五車二)',   mag:  0.1, sky: { x: 72.1, y:   3.8 } },
    { id: 4,  kor: '프로키온',   trad: '남하 셋째 별(南河三)',   mag:  0.4, sky: { x:  4.1, y:  81.5 } },
    { id: 5,  kor: '베텔게우스', trad: '삼수 넷째 별(參宿四)',   mag:  0.4, sky: { x: 53.7, y:  77.3 }, note: '변광성' },
    { id: 6,  kor: '알데바란',   trad: '필수 다섯째 별(畢宿五)', mag:  0.9, sky: { x: 91.5, y:  60.0 } },
    { id: 7,  kor: '벨라트릭스', trad: '삼수 다섯째 별(參宿五)', mag:  1.6, sky: { x: 68.1, y:  79.3 } },
    { id: 8,  kor: '알닐람',     trad: '삼수 둘째 별(參宿二)',   mag:  1.7, sky: { x: 62.7, y:  93.7 } },
    { id: 9,  kor: '알니탁',     trad: '삼수 첫째 별(參宿一)',   mag:  1.7, sky: { x: 60.6, y:  95.1 } },
    { id: 10, kor: '사이프',     trad: '삼수 여섯째 별(參宿六)', mag:  2.1, sky: { x: 57.3, y: 109.8 } },
    { id: 11, kor: '민타카',     trad: '삼수 셋째 별(參宿三)',   mag:  2.2, sky: { x: 64.8, y:  92.0 } },
    { id: 12, kor: '메이사',     trad: '자수 첫째 별(觜宿一)',   mag:  3.4, sky: { x: 63.3, y:  72.5 } }
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

  /* 오리온 허리띠 세 별 = 삼수 첫째·둘째·셋째 별 */
  var BELT_IDS = [9, 8, 11];

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

  global.APP = APP;
  global.IMAGES = IMAGES;
  global.STARS = STARS;
  global.ORION_LINES = ORION_LINES;
  global.BELT_IDS = BELT_IDS;
  global.SKY_SPACE = SKY_SPACE;
  global.starById = starById;
  global.magToRadius = magToRadius;
  global.magText = magText;

})(window);
