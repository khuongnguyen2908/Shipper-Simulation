// =============================================================
// CHAT: tin người chơi gõ + lời NPC / tin điện thoại → khung log bên trái màn hình + bong bóng trên đầu.
// Thuần dữ liệu (chạy được trong Node).
// Chuẩn bị chơi nhiều người: tin người chơi gõ đi qua "đường truyền" (transport). Bây giờ là đường truyền nội bộ
// (gửi là nhận lại ngay); sau này thay bằng mạng (WebSocket…) có cùng 2 hàm send / onReceive, không phải sửa giao diện.
// Lời NPC, tin điện thoại chỉ hiện ở máy mình (local), không gửi đi.
// =============================================================
export const CHAT_MAX = 120; // số ký tự tối đa một tin
export const CHAT_GAP_MS = 700; // gửi liền tay nhanh hơn mức này thì bỏ (chống spam)
export const LOG_KEEP = 80; // log giữ bao nhiêu dòng gần nhất

// Làm sạch tin: bỏ ký tự điều khiển, gộp khoảng trắng, cắt độ dài. Rỗng → ''
export function cleanChat(text) {
  return String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
}

// Đường truyền nội bộ (một người chơi): gửi gì nhận lại nấy
export function localTransport() {
  let recv = null;
  return { send: (msg) => recv?.(msg), onReceive: (cb) => { recv = cb; } };
}

export class ChatChannel {
  // me: { id, name } người chơi máy này · now: đồng hồ thật (ms) để chống spam
  constructor({ me, transport = localTransport(), now = () => Date.now() } = {}) {
    this.me = me || { id: 'me', name: '' };
    this.transport = transport;
    this.now = now;
    this.lines = [];
    this.seq = 0;
    this.lastSent = -Infinity;
    this.listeners = new Set();
    transport.onReceive((m) => this.receive(m));
  }
  // Người chơi gõ tin → gửi qua đường truyền. extra: thông tin thêm (giờ trong game…)
  send(text, extra = {}) {
    const t = cleanChat(text);
    if (!t) return { ok: false, reason: 'empty' };
    const n = this.now();
    if (n - this.lastSent < CHAT_GAP_MS) return { ok: false, reason: 'spam' };
    this.lastSent = n;
    this.transport.send({ kind: 'chat', from: this.me.id, name: this.me.name, text: t, ...extra });
    return { ok: true, text: t };
  }
  // Lời NPC / tin điện thoại / hệ thống: chỉ ở máy mình
  local(kind, name, text, extra = {}) {
    this.receive({ kind, name, text: String(text ?? ''), ...extra });
  }
  receive(m) {
    const text = m.kind === 'chat' ? cleanChat(m.text) : String(m.text ?? '').trim();
    if (!text) return null;
    const line = { ...m, text, id: ++this.seq, mine: m.kind === 'chat' && m.from === this.me.id };
    this.lines.push(line);
    if (this.lines.length > LOG_KEEP) this.lines.shift();
    for (const f of this.listeners) f(line);
    return line;
  }
  // nghe dòng mới (log, bong bóng); trả về hàm hủy nghe
  on(f) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
}
