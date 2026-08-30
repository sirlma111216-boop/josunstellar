// 서버와 브라우저가 함께 쓰는 메시지 형식.
//
// 라이브러리 없이 표준 WebSocket 한 줄로 주고받는다. 필요한 건 세 가지뿐이다.
//   요청 + 응답   { t: 'vote', i: 7, d: {...} }  →  { t: 'ack', i: 7, d: {...} }
//   서버 밀어주기 { t: 'tally', d: {...} }
//   오류          { t: 'ack', i: 7, err: '...' }

export const encode = (msg) => JSON.stringify(msg);

export function decode(raw) {
  try {
    const msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    return msg && typeof msg.t === 'string' ? msg : null;
  } catch {
    return null;
  }
}

/** 요청에 대한 응답 */
export const ack = (id, data) => encode({ t: 'ack', i: id, d: data });
export const nack = (id, message) => encode({ t: 'ack', i: id, err: message });

/** 서버가 먼저 보내는 알림 */
export const push = (type, data) => encode({ t: type, d: data });

/* ---------------------------------------------------------------- 수업 코드 */

// 헷갈리는 글자(0 O 1 I L)를 뺀 31자
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function makeCode() {
  let out = '';
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 6; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

/** 사람이 친 코드를 서버·클라이언트 양쪽에서 같은 방식으로 다듬는다 */
export function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
}
