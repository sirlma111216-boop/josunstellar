// Cloudflare Worker 진입점.
//
// 하는 일은 셋뿐이다.
//   1. 정적 파일(화면·이미지)을 내보낸다 — Workers Assets 가 맡는다
//   2. 수업 코드를 발급한다
//   3. /ws 로 온 WebSocket 을 그 수업의 Durable Object 에게 넘긴다
//
// 학급 투표 상태는 전부 Durable Object 안에 있다. 외부 데이터베이스가 없다.

import { makeCode, normalizeCode } from './protocol.js';
import { qrDataUrl } from './qr.js';

export { ClassSession } from './session-do.js';

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  ...init,
});

const doFor = (env, code) => env.SESSION.get(env.SESSION.idFromName(code));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // ---- 실시간: 그 수업의 Durable Object 에게 넘긴다
    if (pathname === '/ws') {
      const code = normalizeCode(url.searchParams.get('code'));
      if (code.length !== 6) return new Response('코드가 필요합니다.', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('WebSocket 연결이 아닙니다.', { status: 426 });
      }
      return doFor(env, code).fetch(request);
    }

    // ---- 새 수업 코드 발급 + 학생이 들어올 주소·QR
    if (pathname === '/api/new-code') {
      const code = makeCode();
      const joinUrl = `${url.origin}/?code=${code}`;
      return json({ code, joinUrl, qr: qrDataUrl(joinUrl) });
    }

    // ---- 지금 집계 (화면 없이 확인할 때)
    const m = pathname.match(/^\/api\/session\/([A-Za-z0-9]{6})$/);
    if (m) {
      const snap = await doFor(env, normalizeCode(m[1])).snapshot();
      return json(snap);
    }

    if (pathname === '/api/health') {
      return json({ ok: true, live: true, runtime: 'cloudflare-workers' });
    }

    // ---- 그 밖에는 정적 파일. 없으면 첫 화면.
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    return env.ASSETS.fetch(new Request(`${url.origin}/index.html`, request));
  },
};
