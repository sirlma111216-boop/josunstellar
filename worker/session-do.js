// 수업 하나 = Durable Object 하나.
//
// 한 반의 참여자·투표·현재 단계를 들고 있고, 그 반에 붙은 WebSocket 들에게 밀어 준다.
// 외부 데이터베이스가 필요 없다 — 상태와 실시간 처리가 여기 한곳에서 끝난다.
//
// 담는 것은 학생이 스스로 정한 닉네임과 익명 집계뿐이다.
// 실명·학번·반·측정 기록은 서버로 오지 않는다.

import { DurableObject } from 'cloudflare:workers';
import { decode, ack, nack, push } from './protocol.js';

/** 수업이 끝나고 이만큼 지나면 저장소를 비운다 */
const TTL_MS = 12 * 60 * 60 * 1000;

/** 30명이 한꺼번에 눌러도 브로드캐스트가 폭주하지 않도록 묶어 보낸다 */
const THROTTLE_MS = 250;

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

export class ClassSession extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /** @type {{createdAt:number, updatedAt:number, votes:Object<string,string>, members:Object<string,{nick:string,at:number}>, stage:{step:number,sub:number}|null}|null} */
    this.state = null;
    this.loading = null;
    this.flushTimer = null;
  }

  /* ------------------------------------------------------------ 상태 보관 */

  async load() {
    if (this.state) return this.state;
    this.loading ||= (async () => {
      const saved = await this.ctx.storage.get('state');
      const fresh = saved && (Date.now() - (saved.updatedAt || 0)) < TTL_MS;
      this.state = fresh
        ? { members: {}, stage: null, ...saved }   // 예전 판에는 없던 칸을 채운다
        : { createdAt: Date.now(), updatedAt: Date.now(), votes: {}, members: {}, stage: null };
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
            nick: nick || null,
            stage: this.state.stage,
          }));
          this.scheduleBroadcast();
          break;
        }

        case 'vote': {
          const token = String(msg.d?.token || '').slice(0, 40);
          const key = String(msg.d?.key || '').slice(0, 20);
          if (!token || !key) { ws.send(nack(msg.i, '잘못된 요청입니다.')); break; }
          // 한 기기 한 표. 다시 고르면 바뀐다(쌓이지 않는다).
          this.state.votes[token] = key;
          await this.save();
          ws.send(ack(msg.i, { ...this.snap(), mine: key }));
          this.scheduleBroadcast();
          break;
        }

        case 'stage': {
          // 교사가 화면을 넘기면 그 단계를 모두에게 알린다
          const st = msg.d || {};
          const step = Math.max(1, Math.min(8, st.step | 0)) || 1;
          const sub = Math.max(1, Math.min(9, st.sub | 0)) || 1;
          this.state.stage = { step, sub, at: Date.now() };
          await this.save();
          ws.send(ack(msg.i, this.state.stage));
          this.broadcastStage();
          break;
        }

        case 'reset': {
          // 교사가 다음 활동을 위해 표만 비운다(참여자 명단은 남는다)
          this.state.votes = {};
          await this.save();
          ws.send(ack(msg.i, this.snap()));
          this.scheduleBroadcast();
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
    return { ...this.snap(), createdAt: this.state.createdAt, updatedAt: this.state.updatedAt };
  }
}
