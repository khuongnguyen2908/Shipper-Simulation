// =============================================================
// Nối trình duyệt với máy chủ thành phố chung (WebSocket).
// Đo độ trễ + lệch giờ với máy chủ (để giờ thành phố khớp mọi máy), tự nối lại khi rớt mạng.
// =============================================================
import { PROTO, NET, DEFAULT_SERVER } from './protocol.js';

// ---- máy này nhớ: địa chỉ máy chủ lần trước + tài khoản (mã bí mật) trên từng máy chủ ----
const TOKEN_KEY = 'shipper-sim-online-v1'; // { [địa chỉ máy chủ]: { token, name } }
const SERVER_KEY = 'shipper-sim-server';
const readJSON = (k, def) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? def; } catch { return def; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* chế độ riêng tư */ } };
// Địa chỉ máy chủ: ?server=… trên link (bạn bè bấm link mời) > lần trước > mặc định (máy chủ chạy trên máy này)
export function savedServer() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) {
    writeJSON(SERVER_KEY, q);
    return q;
  }
  return readJSON(SERVER_KEY, DEFAULT_SERVER);
}
export const rememberServer = (url) => writeJSON(SERVER_KEY, url);
export const tokenFor = (url) => readJSON(TOKEN_KEY, {})[url]?.token || null;
export const accountName = (url) => readJSON(TOKEN_KEY, {})[url]?.name || '';
export function rememberToken(url, token, name) {
  const all = readJSON(TOKEN_KEY, {});
  all[url] = { token, name };
  writeJSON(TOKEN_KEY, all);
}

// ws://máy:8787 → http://máy:8787/status (wss → https)
export function statusUrl(url) {
  return `${String(url).trim().replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/+$/, '')}/status`;
}
// Hỏi tình trạng máy chủ (màn vào Online): { ok, players, max, worldMin } hoặc null nếu không tới được
export async function serverStatus(url, timeoutMs = 3000) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(statusUrl(url), { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export class NetClient {
  constructor(url) {
    this.url = url;
    this.handlers = new Map();
    this.ws = null;
    this.open = false;
    this.rtt = 0; // độ trễ đi về (ms)
    this.offset = 0; // giờ máy chủ − giờ máy mình (ms)
    this.closedByMe = false;
  }
  on(t, f) {
    if (!this.handlers.has(t)) this.handlers.set(t, []);
    this.handlers.get(t).push(f);
  }
  emit(t, m) {
    for (const f of this.handlers.get(t) || []) f(m);
  }
  serverNow() {
    return Date.now() + this.offset;
  }
  // Nối + chào. Trả về gói welcome; lỗi → ném { code } ('proto' | 'name' | 'full' | 'other' | 'down')
  connect(hello) {
    this.hello = hello;
    this.closedByMe = false;
    return new Promise((resolve, reject) => {
      let done = false;
      let ws;
      try {
        ws = new WebSocket(this.url);
      } catch {
        return reject({ code: 'down' });
      }
      this.ws = ws;
      const fail = (code) => { if (!done) { done = true; reject({ code }); } };
      const timer = setTimeout(() => { fail('down'); ws.close(); }, 6000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', proto: PROTO, ...this.hello }));
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'welcome') {
          clearTimeout(timer);
          this.open = true;
          this.offset = m.now - Date.now();
          this.hello = { ...this.hello, token: m.token }; // nối lại về sau dùng mã bí mật này
          this.startPing();
          if (!done) { done = true; resolve(m); } else this.emit('welcome', m);
          return;
        }
        if (m.t === 'err') { clearTimeout(timer); fail(m.code); this.emit('err', m); return; }
        if (m.t === 'pong') return this.onPong(m);
        this.emit(m.t, m);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        const was = this.open;
        this.open = false;
        this.stopPing();
        fail('down');
        if (was && !this.closedByMe) this.emit('down', {});
      };
      ws.onerror = () => {};
    });
  }
  // droppable: gói chỉ cần bản mới nhất (vị trí) → mạng đang nghẽn thì bỏ, không dồn hàng đợi
  send(t, data = {}, droppable = false) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    if (droppable && ws.bufferedAmount > NET.bufferMax) return false;
    ws.send(JSON.stringify({ t, ...data }));
    return true;
  }
  // Nhịp đo độ trễ / báo còn sống: chạy bằng Web Worker vì tab bị ẩn thì trình duyệt hãm hẹn giờ thường (máy chủ tưởng rớt mạng)
  startPing() {
    this.stopPing();
    const tick = () => this.send('ping', { c: Date.now() });
    try {
      const src = `setInterval(() => postMessage(0), ${NET.pingSec * 1000});`;
      this.pingW = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.pingW.onmessage = tick;
    } catch {
      this.pingT = setInterval(tick, NET.pingSec * 1000); // trình duyệt không cho Worker: dùng hẹn giờ thường
    }
    tick();
  }
  stopPing() {
    clearInterval(this.pingT);
    this.pingW?.terminate();
    this.pingW = null;
  }
  onPong(m) {
    const t = Date.now(), rtt = t - m.c;
    if (!(rtt >= 0 && rtt < 10000)) return;
    this.rtt = this.rtt ? this.rtt * 0.7 + rtt * 0.3 : rtt;
    const off = m.now + rtt / 2 - t;
    this.offset = this.offset * 0.8 + off * 0.2; // lệch giờ: trượt dần, không giật đồng hồ
  }
  close() {
    this.closedByMe = true;
    this.stopPing();
    this.open = false;
    try { this.ws?.close(); } catch { /* đã đóng */ }
  }
}
