/* ==========================================================================
   Night Code 1395 — 학생 진행 상태
   새로고침해도 이어서 하도록 localStorage 에 저장한다.
   기기 밖으로는 아무것도 나가지 않는다.
   ========================================================================== */
(function (global) {
  'use strict';

  function blank() {
    return {
      step: 1,
      sub: {},              // { 4: 2, 5: 3 } 단계별 소단계
      prediction: null,     // 단계 4 장면 C 에서 고른 예상 key
      measures: {},         // { 별id: [지름1, 지름2, ...] } 원본 이미지 픽셀
      quiz: {},             // 단계 5 퀴즈 정답 여부
      rank: [],             // 밝기 순서 맞히기에 낸 답
      conclusion: '',       // 학생이 쓴 결론
      name: '',           // 아래 넷과 함께 이 기기와 인쇄물에만 쓴다(서버로 안 감)
      school: '',
      grade: '',
      klass: '',
      no: '',
      seenAnswerS4: false   // 단계 4 [답 보기] 를 눌렀는가
    };
  }

  var State = {
    data: blank(),
    listeners: [],

    load: function () {
      var saved = Store.get('state', null);
      State.data = saved ? Object.assign(blank(), saved) : blank();
      return State.data;
    },

    save: function () {
      Store.set('state', State.data);
      State.notify();
    },

    onChange: function (fn) { State.listeners.push(fn); },
    notify: function () {
      for (var i = 0; i < State.listeners.length; i++) {
        try { State.listeners[i](State.data); } catch (e) { console.warn(e); }
      }
    },

    reset: function () {
      State.data = blank();
      Store.remove('state');
      State.notify();
    },

    /* ---------- 측정 ---------- */

    /** 측정값 추가 (원본 이미지 픽셀 지름) */
    addMeasure: function (id, diameter) {
      var list = State.data.measures[id] || [];
      list.push(Number(diameter.toFixed(1)));
      State.data.measures[id] = list;
      State.save();
      return list;
    },

    /** 그 별의 마지막 측정만 취소 */
    undoMeasure: function (id) {
      var list = State.data.measures[id];
      if (!list || !list.length) return null;
      list.pop();
      if (!list.length) delete State.data.measures[id];
      State.save();
      return State.data.measures[id] || [];
    },

    measuresOf: function (id) { return State.data.measures[id] || []; },

    /** 평균 (측정이 없으면 null) */
    averageOf: function (id) {
      var list = State.measuresOf(id);
      if (!list.length) return null;
      var sum = 0;
      for (var i = 0; i < list.length; i++) sum += list[i];
      return sum / list.length;
    },

    measuredCount: function () {
      var n = 0;
      for (var i = 0; i < STARS.length; i++) {
        if (State.measuresOf(STARS[i].id).length) n++;
      }
      return n;
    },

    /** 측정한 별만 { star, avg } 로 (등급 오름차순) */
    measuredRows: function () {
      var rows = [];
      for (var i = 0; i < STARS.length; i++) {
        var avg = State.averageOf(STARS[i].id);
        if (avg !== null) rows.push({ star: STARS[i], avg: avg, list: State.measuresOf(STARS[i].id) });
      }
      rows.sort(function (a, b) { return a.star.mag - b.star.mag; });
      return rows;
    },

    /* ---------- 예상 ---------- */
    /** 학생이 고른 예상. 다시 고르면 바뀐다(쌓이지 않는다). */
    setPrediction: function (key) {
      State.data.prediction = key;
      State.save();
    },


    predictionLabel: function () {
      for (var i = 0; i < PREDICTIONS.length; i++) {
        if (PREDICTIONS[i].key === State.data.prediction) return PREDICTIONS[i].label;
      }
      return null;
    }
  };

  global.State = State;

})(window);
