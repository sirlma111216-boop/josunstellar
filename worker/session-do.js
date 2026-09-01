// 수업 하나 = Durable Object 하나.
//
// 한 반의 참여자·투표·현재 단계를 들고 있고, 그 반에 붙은 WebSocket 들에게 밀어 준다.
// 외부 데이터베이스가 필요 없다 — 상태와 실시간 처리가 여기 한곳에서 끝난다.
//
// 담는 것은 학생이 스스로 정한 닉네임과, 수업 중에 함께 보려고 올린 것뿐이다.
//   · 예상 한 표 (익명 집계)
//   · 잰 자국의 크기 (등급·지름 짝, 반 전체 산점도를 그리려고)
//   · 오늘의 결론 한 문장 (서로 읽어 보려고)
// 실명·학번·반은 서버로 오지 않는다.

import { DurableObject } from 'cloudflare:workers';
import { decode, ack, nack, push } from './protocol.js';

/** 수업이 끝나고 이만큼 지나면 저장소를 비운다 */
const TTL_MS = 8 * 24 * 60 * 60 * 1000;   // 두 차시가 한 주 떨어져 있어도 이어지게

/** 30명이 한꺼번에 눌러도 브로드캐스트가 폭주하지 않도록 묶어 보낸다 */
const THROTTLE_MS = 250;

/** 반 전체 자료는 덩치가 커서 조금 더 느슨하게 묶는다 */
const WORK_THROTTLE_MS = 700;

/** 데모봇 토큰은 이 말로 시작한다 (한꺼번에 걷어낼 때 쓴다) */
const DEMO_PREFIX = 'demo-';

/** 닉네임 길이 상한 */
const NICK_MAX = 12;

/** 닉네임에서 빼는 글자: 화면에 그대로 나가면 태그로 읽힐 수 있는 기호 */
const NICK_BAD = ['<', '>', '&', '"', "'", '\\', '`'];

/** 닉네임을 다듬는다. 정규식 대신 한 글자씩 걸러 escape 사고를 피한다. */
function cleanNick(v) {
  const s = String(v || '');
  let out = '';
  for (let i = 0; i < s.length && out.length < NICK_MAX; i++) {
    const n = s.charCodeAt(i);
    if (n < 0x20 || n === 0x7f) continue;            // 제어문자
    if (NICK_BAD.indexOf(s[i]) >= 0) continue;       // 꺾쇠·따옴표 등
    out += s[i];
  }
  return out.trim();
}

/** 한 사람이 올릴 수 있는 측정 점 수 (별 10개 + 여유) */
const PTS_MAX = 20;

/** 결론 한 편의 길이 상한 */
const NOTE_MAX = 300;

/** 화면에 그대로 나가는 글이라 제어문자와 태그 기호를 지운다 */
function cleanText(v, max) {
  const s = String(v || '');
  let out = '';
  for (let i = 0; i < s.length && out.length < max; i++) {
    const n = s.charCodeAt(i);
    if (n < 0x20 && n !== 0x0a) continue;        // 줄바꿈만 남긴다
    if (n === 0x7f) continue;
    if (NICK_BAD.indexOf(s[i]) >= 0) continue;
    out += s[i];
  }
  return out.trim();
}

/** 순위 하나에 담을 수 있는 항목 수 */
const RANK_MAX = 12;

/** 올라온 순위를 짧은 이름표 배열로만 받는다 */
function cleanRank(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const k of v.slice(0, RANK_MAX)) {
    const s = String(k || '').slice(0, 16);
    if (s && out.indexOf(s) < 0) out.push(s);   // 같은 것을 두 번 넣을 수 없다
  }
  return out;
}

/** 올라온 측정 점을 믿을 수 있는 범위로만 받는다 */
function cleanPts(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const p of v.slice(0, PTS_MAX)) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const mag = Number(p[0]), dia = Number(p[1]);
    if (!isFinite(mag) || !isFinite(dia)) continue;
    if (mag < -30 || mag > 30 || dia <= 0 || dia > 2000) continue;
    out.push([Math.round(mag * 100) / 100, Math.round(dia * 10) / 10]);
  }
  return out;
}

export class ClassSession extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /** @type {{createdAt:number, updatedAt:number, votes:Object<string,string>, members:Object<string,{nick:string,at:number}>, stage:{step:number,sub:number}|null}|null} */
    this.state = null;
    this.loading = null;
    this.flushTimer = null;
    this.workTimer = null;
  }

  /* ------------------------------------------------------------ 상태 보관 */

  async load() {
    if (this.state) return this.state;
    this.loading ||= (async () => {
      const saved = await this.ctx.storage.get('state');
      const fresh = saved && (Date.now() - (saved.updatedAt || 0)) < TTL_MS;
      this.state = fresh
        ? { members: {}, stage: null, results: {}, notes: {}, ranks: {}, plans: {}, ...saved }   // 예전 판에 없던 칸
        : { createdAt: Date.now(), updatedAt: Date.now(), votes: {},
            members: {}, stage: null, results: {}, notes: {}, ranks: {}, plans: {} };
    })();
    await this.loading;
    return this.state;
  }

  async save() {
    this.state.updatedAt = Date.now();
    await this.ctx.storage.put('state', this.state);
  }

  /** 투표를 사람 수로 센다 */
  tally() {
    const counts = {};
    let total = 0;
    for (const key of Object.values(this.state.votes)) {
      counts[key] = (counts[key] || 0) + 1;
      total++;
    }
    return { counts, total };
  }

  /** 지금 붙어 있는 기기들의 토큰 */
  onlineTokens() {
    const on = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      let a = null;
      try { a = ws.deserializeAttachment(); } catch { /* 아직 붙기 전 */ }
      if (a && a.token) on.add(a.token);
    }
    return on;
  }

  /**
   * 참여자 명단. 실명이 아니라 학생이 스스로 정한 닉네임만 나간다.
   * 한 번 들어온 사람은 잠깐 끊겨도 목록에 남되 접속 여부를 따로 표시한다
   * (선생님이 "누가 아직 안 들어왔지?" 를 볼 수 있어야 하기 때문).
   */
  roster() {
    const on = this.onlineTokens();
    const members = Object.keys(this.state.members).map((t) => ({
      nick: this.state.members[t].nick,
      on: on.has(t),
      voted: !!this.state.votes[t],
    }));
    members.sort((a, b) => a.nick.localeCompare(b.nick, 'ko'));
    return {
      members,
      joined: members.length,
      online: members.filter((m) => m.on).length,
    };
  }

  /**
   * 반 전체가 함께 보는 자료.
   * 산점도 점은 누가 올렸는지 떼고 좌표만 모은다.
   * 결론은 닉네임과 함께 보여 준다(서로 읽는 것이 목적이라서).
   */
  classWork() {
    const pts = [];
    let people = 0;
    for (const t of Object.keys(this.state.results)) {
      const p = this.state.results[t].pts;
      if (!p || !p.length) continue;
      people++;
      for (const one of p) pts.push(one);
    }
    const notes = Object.keys(this.state.notes).map((t) => ({
      nick: this.state.notes[t].nick,
      text: this.state.notes[t].text,
    }));
    // 순위는 누가 냈는지 떼고 답만 모은다
    const ranks = Object.keys(this.state.ranks).map((t) => this.state.ranks[t].order);
    // 확인 방법은 서로 읽어 보는 것이 목적이라 닉네임과 함께 둔다
    const plans = Object.keys(this.state.plans).map((t) => ({
      nick: this.state.plans[t].nick,
      why: this.state.plans[t].why,
      how: this.state.plans[t].how,
    }));
    return { pts, people, notes, ranks, plans };
  }

  /** 학생·교사 화면으로 내려보내는 한 덩어리 */
  snap() {
    return { ...this.tally(), ...this.roster() };
  }

  /* ------------------------------------------------------------ 실시간 */

  async fetch(request) {
    await this.load();

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // 잠들었다 깨어나도 연결이 유지되도록 hibernation API 를 쓴다
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const msg = decode(raw);
    if (!msg) return;
    await this.load();

    try {
      switch (msg.t) {
        case 'join': {
          const token = String(msg.d?.token || '').slice(0, 40);
          const nick = cleanNick(msg.d?.nick);
          ws.serializeAttachment({ token });
          // 닉네임을 준 사람만 명단에 오른다. 선생님 기기는 명단에 넣지 않는다.
          if (token && nick) {
            this.state.members[token] = { nick, at: Date.now() };
            await this.save();
          }
          ws.send(ack(msg.i, {
            ...this.snap(),
            mine: this.state.votes[token] || null,
            myRank: (this.state.ranks[token] && this.state.ranks[token].order) || null,
            nick: nick || null,
            stage: this.state.stage,
          }));
          this.scheduleBroadcast();
          break;
        }

        case 'vote': {
          const token = String(msg.d?.token || '').slice(0, 40);
          const key = String(msg.d?.key || '').slice(0, 20);
          if (!token) { ws.send(nack(msg.i, '잘못된 요청입니다.')); break; }
          // 한 기기 한 표. 다시 고르면 바뀌고(쌓이지 않고), 빈 값이면 취소된다.
          if (key) this.state.votes[token] = key;
          else delete this.state.votes[token];
          await this.save();
          ws.send(ack(msg.i, { ...this.snap(), mine: key || null }));
          this.scheduleBroadcast();
          break;
        }

        case 'stage': {
          // 교사가 화면을 넘기면 그 단계를 모두에게 알린다
          const st = msg.d || {};
          const step = Math.max(1, Math.min(10, st.step | 0)) || 1;
          const sub = Math.max(1, Math.min(9, st.sub | 0)) || 1;
          this.state.stage = { step, sub, at: Date.now() };
          await this.save();
          ws.send(ack(msg.i, this.state.stage));
          this.broadcastStage();
          break;
        }

        case 'result': {
          // 잰 값을 올린다. 반 전체 산점도를 그리는 데 쓴다.
          const token = String(msg.d?.token || '').slice(0, 40);
          const nick = this.state.members[token] ? this.state.members[token].nick : null;
          const pts = cleanPts(msg.d?.pts);
          if (!token) { ws.send(nack(msg.i, '잘못된 요청입니다.')); break; }
          if (pts.length) this.state.results[token] = { nick, pts, at: Date.now() };
          else delete this.state.results[token];
          await this.save();
          ws.send(ack(msg.i, { ok: true }));
          this.scheduleClassBroadcast();
          break;
        }

        case 'note': {
          // 오늘의 결론 한 문장. 서로 읽어 보려고 닉네임과 함께 둔다.
          const token = String(msg.d?.token || '').slice(0, 40);
          const nick = this.state.members[token] ? this.state.members[token].nick : null;
          const text = cleanText(msg.d?.text, NOTE_MAX);
          if (!token) { ws.send(nack(msg.i, '잘못된 요청입니다.')); break; }
          if (text) this.state.notes[token] = { nick: nick || '익명', text, at: Date.now() };
          else delete this.state.notes[token];
          await this.save();
          ws.send(ack(msg.i, this.classWork()));
          this.scheduleClassBroadcast();
          break;
        }

        case 'leave': {
          // 이 기기가 남긴 것을 모두 지운다(데모봇을 걷어낼 때 쓴다)
          const token = String(msg.d?.token || '').slice(0, 40);
          if (token) {
            delete this.state.members[token];
            delete this.state.votes[token];
            delete this.state.results[token];
            delete this.state.notes[token];
            delete this.state.ranks[token];
            delete this.state.plans[token];
            await this.save();
          }
          ws.send(ack(msg.i, { ok: true }));
          this.scheduleBroadcast();
          this.scheduleClassBroadcast();
          break;
        }

        case 'plan': {
          // 가설 — 왜 그렇게 생각했는지와 확인할 방법
          const token = String(msg.d?.token || '').slice(0, 40);
          const nick = this.state.members[token] ? this.state.members[token].nick : null;
          const why = cleanText(msg.d?.why, 160);
          const how = cleanText(msg.d?.how, 160);
          if (!token) { ws.send(nack(msg.i, '잘못된 요청입니다.')); break; }
          if (why || how) this.state.plans[token] = { nick: nick || '익명', why, how, at: Date.now() };
          else delete this.state.plans[token];
          await this.save();
          ws.send(ack(msg.i, this.classWork()));
          this.scheduleClassBroadcast();
          break;
        }

        case 'rank': {
          // 밝기 순서 맞히기. 답만 모으고 누가 냈는지는 남기지 않는다.
          const token = String(msg.d?.token || '').slice(0, 40);
          const order = cleanRank(msg.d?.order);
          if (!token) { ws.send(nack(msg.i, '잘못된 요청입니다.')); break; }
          if (order.length) this.state.ranks[token] = { order, at: Date.now() };
          else delete this.state.ranks[token];
          await this.save();
          ws.send(ack(msg.i, this.classWork()));
          this.scheduleClassBroadcast();
          break;
        }

        case 'work': {
          // 지금까지 모인 반 전체 자료를 달라
          ws.send(ack(msg.i, this.classWork()));
          break;
        }

        case 'reset': {
          // 교사가 다음 활동을 위해 비운다.
          // what 을 주면 그것만, 안 주면 표만 비운다(참여자 명단은 늘 남는다).
          const what = String(msg.d?.what || 'votes');
          if (what === 'votes' || what === 'all') this.state.votes = {};
          if (what === 'work' || what === 'all') { this.state.results = {}; this.state.notes = {}; this.state.ranks = {}; this.state.plans = {}; }
          // 데모봇만 걷어낸다. 교사 화면이 새로고침되어 leave 를 못 보냈을 때를 위해 둔다.
          if (what === 'demo') {
            for (const t of Object.keys(this.state.members)) {
              if (t.indexOf(DEMO_PREFIX) !== 0) continue;
              delete this.state.members[t];
              delete this.state.votes[t];
              delete this.state.results[t];
              delete this.state.notes[t];
              delete this.state.ranks[t];
              delete this.state.plans[t];
            }
          }
          await this.save();
          ws.send(ack(msg.i, this.snap()));
          this.scheduleBroadcast();
          if (what !== 'votes') this.scheduleClassBroadcast();
          break;
        }

        default:
          ws.send(nack(msg.i, '알 수 없는 요청입니다.'));
      }
    } catch (e) {
      ws.send(nack(msg.i, '처리 중 문제가 생겼습니다.'));
    }
  }

  webSocketClose() { this.scheduleBroadcast(); }
  webSocketError() { this.scheduleBroadcast(); }

  /** 교사가 넘긴 단계는 곧바로 알린다(집계와 달리 묶지 않는다) */
  broadcastStage() {
    if (!this.state || !this.state.stage) return;
    const data = push('stage', this.state.stage);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch { /* 끊긴 소켓은 넘어간다 */ }
    }
  }

  /** 반 전체 자료는 덩치가 커서 표 집계와 따로 묶어 보낸다 */
  scheduleClassBroadcast() {
    if (this.workTimer) return;
    this.workTimer = setTimeout(() => {
      this.workTimer = null;
      if (!this.state) return;
      const data = push('work', this.classWork());
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(data); } catch { /* 끊긴 소켓은 넘어간다 */ }
      }
    }, WORK_THROTTLE_MS);
  }

  /** 짧은 시간 안의 여러 변경을 한 번으로 묶는다 */
  scheduleBroadcast() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.broadcastNow();
    }, THROTTLE_MS);
  }

  broadcastNow() {
    if (!this.state) return;
    const data = push('tally', this.snap());
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch { /* 끊긴 소켓은 넘어간다 */ }
    }
  }

  /** 화면 없이 집계만 필요할 때 (CSV 등) */
  async snapshot() {
    await this.load();
    return { ...this.snap(), ...this.classWork(),
             createdAt: this.state.createdAt, updatedAt: this.state.updatedAt };
  }
}
