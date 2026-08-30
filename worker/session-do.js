// 수업 하나 = Durable Object 하나.
//
// 한 반의 투표 상태를 들고 있고, 그 반에 붙은 WebSocket 들에게 밀어 준다.
// 외부 데이터베이스가 필요 없다 — 상태와 실시간 처리가 여기 한곳에서 끝난다.
//
// 담는 것은 익명 집계뿐이다. 이름·학번은 서버로 오지 않는다.

import { DurableObject } from 'cloudflare:workers';
import { decode, ack, nack, push } from './protocol.js';

/** 수업이 끝나고 이만큼 지나면 저장소를 비운다 */
const TTL_MS = 12 * 60 * 60 * 1000;

/** 30명이 한꺼번에 눌러도 브로드캐스트가 폭주하지 않도록 묶어 보낸다 */
const THROTTLE_MS = 250;

export class ClassSession extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /** @type {{createdAt:number, updatedAt:number, votes:Object<string,string>}|null} */
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
      this.state = fresh ? saved : { createdAt: Date.now(), updatedAt: Date.now(), votes: {} };
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
          // 참여만 하고 아직 투표하지 않은 사람도 현재 집계를 본다
          const token = String(msg.d?.token || '').slice(0, 40);
          ws.serializeAttachment({ token });
          ws.send(ack(msg.i, { ...this.tally(), mine: this.state.votes[token] || null }));
          break;
        }

        case 'vote': {
          const token = String(msg.d?.token || '').slice(0, 40);
          const key = String(msg.d?.key || '').slice(0, 20);
          if (!token || !key) { ws.send(nack(msg.i, '잘못된 요청입니다.')); break; }
          // 한 기기 한 표. 다시 고르면 바뀐다(쌓이지 않는다).
          this.state.votes[token] = key;
          await this.save();
          ws.send(ack(msg.i, { ...this.tally(), mine: key }));
          this.scheduleBroadcast();
          break;
        }

        case 'reset': {
          // 교사가 다음 반 수업을 위해 비운다
          this.state.votes = {};
          await this.save();
          ws.send(ack(msg.i, this.tally()));
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

  webSocketClose(ws) { this.broadcastNow(); }
  webSocketError(ws) { this.broadcastNow(); }

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
    const data = push('tally', this.tally());
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch { /* 끊긴 소켓은 넘어간다 */ }
    }
  }

  /** 화면 없이 집계만 필요할 때 (CSV 등) */
  async snapshot() {
    await this.load();
    return { ...this.tally(), createdAt: this.state.createdAt, updatedAt: this.state.updatedAt };
  }
}
