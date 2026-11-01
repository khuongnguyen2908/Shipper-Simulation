// =============================================================
// THÀNH PHỐ CHUNG (máy chủ): người vào / ra, vị trí, chat, lưu tiến độ.
// Thuần logic — không đụng mạng. server/index.js nối WebSocket vào đây; tests/run.js thử bằng "máy giả".
// conn: { send(obj), close(), buffered() → số byte đang chờ gửi }
// =============================================================
import { PROTO, NET, ONLINE_CFG, worldMinAt, cleanName, makePlate, cleanState, cleanInfo, cleanProfile, dist2d } from '../src/net/protocol.js';
import { cleanChat } from '../src/sim/chat.js';
import { TIME } from '../src/data/balance.js';

const SAVE_MAX = 400 * 1024; // bản lưu quá nặng (bất thường) thì không nhận
const hex = (n, rnd) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');

export class Room {
  // store: { data, dirty() } — data = { world, accounts: { [token]: account } }
  constructor({ store, now = () => Date.now(), rnd = Math.random, max = ONLINE_CFG.maxPlayers ?? 10, log = () => {} }) {
    this.store = store;
    this.now = now;
    this.rnd = rnd;
    this.max = max;
    this.log = log;
    const d = store.data;
    d.accounts = d.accounts || {};
    // lần đầu chạy: thành phố bắt đầu lúc 06:00 ngày 1, seed thời tiết / ổ gà / đèn chung cho mọi người
    if (!d.world) {
      d.world = { epoch: now(), startMin: TIME.dayStart, seed: Math.floor(rnd() * 1e6) };
      store.dirty();
    }
    this.world = d.world;
    this.players = new Map(); // conn → người đang online
    this.ticks = 0;
  }
  worldMin() {
    return worldMinAt(this.now(), this.world);
  }
  // Thông tin công khai của 1 người (ai cũng thấy): không có tiền, không có mã bí mật
  pub(p) {
    return { id: p.acc.id, name: p.acc.name, plate: p.acc.plate, ...p.info, st: p.st };
  }
  status() {
    return { ok: true, proto: PROTO, players: this.players.size, max: this.max, worldMin: Math.floor(this.worldMin()) };
  }
  others(p) {
    return [...this.players.values()].filter((q) => q !== p && q.ready);
  }
  broadcast(msg, except = null) {
    for (const q of this.players.values()) if (q !== except && q.ready) q.conn.send(msg);
  }
  sys(key, params, except = null) {
    this.broadcast({ t: 'sys', key, params }, except);
  }

  connect(conn) {
    this.players.set(conn, { conn, acc: null, ready: false, st: cleanState({}), info: cleanInfo({}), lastMsg: this.now(), lastChat: 0 });
  }

  message(conn, msg) {
    const p = this.players.get(conn);
    if (!p || !msg || typeof msg.t !== 'string') return;
    p.lastMsg = this.now();
    if (!p.ready) return msg.t === 'hello' ? this.hello(p, msg) : undefined; // chưa chào thì chỉ nhận lời chào
    switch (msg.t) {
      case 'st': p.st = cleanState(msg); break;
      case 'info':
        p.info = cleanInfo(msg);
        this.broadcast({ t: 'info', p: this.pub(p) }, p);
        break;
      case 'chat': this.chat(p, msg); break;
      case 'save': this.save(p, msg); break;
      case 'reset': // thua (bị đuổi / khóa tài khoản) → bắt đầu lại từ đầu, giữ tên + biển số
        p.acc.save = null;
        this.store.dirty();
        break;
      case 'ping': conn.send({ t: 'pong', c: msg.c, now: this.now() }); break;
    }
  }

  hello(p, msg) {
    const fail = (code) => { p.conn.send({ t: 'err', code }); p.conn.close(); this.players.delete(p.conn); };
    if (msg.proto !== PROTO) return fail('proto');
    const accs = this.store.data.accounts;
    let acc = typeof msg.token === 'string' ? accs[msg.token] : null;
    const name = cleanName(msg.name);
    if (!acc && !name) return fail('name');
    if ([...this.players.values()].filter((q) => q.ready).length >= this.max) return fail('full');
    if (!acc) {
      const plates = new Set(Object.values(accs).map((a) => a.plate));
      let plate = makePlate(this.rnd);
      for (let i = 0; i < 50 && plates.has(plate); i++) plate = makePlate(this.rnd);
      const token = hex(32, this.rnd);
      acc = accs[token] = { id: hex(8, this.rnd), token, name, plate, created: this.now(), save: null };
      this.log(`+ tài khoản mới: ${name} ${plate}`);
    } else if (name && name !== acc.name) acc.name = name;
    if (msg.profile) acc.profile = cleanProfile(msg.profile); // ngoại hình chọn lúc tạo nhân vật
    // cùng tài khoản đang mở ở máy / tab khác → đá phiên cũ ra
    for (const q of this.players.values()) if (q !== p && q.acc === acc) {
      q.conn.send({ t: 'err', code: 'other' });
      q.conn.close();
      this.players.delete(q.conn);
      this.broadcast({ t: 'leave', id: acc.id });
    }
    this.store.dirty();
    p.acc = acc;
    p.ready = true;
    if (msg.info) p.info = cleanInfo(msg.info);
    p.conn.send({ t: 'welcome', id: acc.id, token: acc.token, name: acc.name, plate: acc.plate, profile: acc.profile || null, save: acc.save, world: this.world, now: this.now(), players: this.others(p).map((q) => this.pub(q)) });
    this.broadcast({ t: 'join', p: this.pub(p) }, p);
    this.sys('online.sys.join', { name: acc.name }, p);
    this.log(`→ ${acc.name} vào (${this.others(p).length + 1}/${this.max})`);
  }

  chat(p, msg) {
    const text = cleanChat(msg.text);
    const t = this.now();
    if (!text || t - p.lastChat < NET.chatGapMs) return;
    p.lastChat = t;
    const scope = msg.scope === 'near' ? 'near' : 'all';
    const out = { t: 'chat', from: p.acc.id, name: p.acc.name, text, scope, wm: Math.floor(this.worldMin()) };
    const R = ONLINE_CFG.chatNearM ?? 40;
    for (const q of this.players.values()) {
      if (!q.ready) continue;
      if (scope === 'near' && q !== p && dist2d(q.st, p.st) > R) continue; // chat gần: chỉ người trong bán kính
      q.conn.send(out);
    }
  }

  // Lưu tiến độ (M1: tin theo máy người chơi — tiền giai đoạn thử nghiệm, xóa trắng trước khi mở chính thức)
  save(p, msg) {
    if (!msg.carry || typeof msg.carry !== 'object') return;
    if (JSON.stringify(msg.carry).length > SAVE_MAX) return;
    const pos = msg.pos && Number.isFinite(msg.pos.x) && Number.isFinite(msg.pos.z) ? msg.pos : null;
    p.acc.save = { carry: msg.carry, pday: Number.isInteger(msg.pday) && msg.pday > 0 ? msg.pday : 1, pos, home: !!msg.home, worldMin: Math.floor(this.worldMin()), at: this.now() };
    this.store.dirty();
  }

  disconnect(conn) {
    const p = this.players.get(conn);
    if (!p) return;
    this.players.delete(conn);
    if (!p.ready) return;
    this.broadcast({ t: 'leave', id: p.acc.id });
    this.sys('online.sys.leave', { name: p.acc.name });
    this.log(`← ${p.acc.name} ra`);
  }

  // 10 lần / giây: gửi vị trí người khác cho từng người (người xa gửi thưa hơn), cắt người im lặng quá lâu
  tick() {
    this.ticks++;
    const t = this.now();
    for (const p of [...this.players.values()]) {
      if (t - p.lastMsg > NET.dropSec * 1000) {
        p.conn.close();
        this.disconnect(p.conn);
      }
    }
    const far = this.ticks % NET.farEvery === 0;
    for (const p of this.players.values()) {
      if (!p.ready || p.conn.buffered() > NET.bufferMax) continue; // mạng nghẽn: bỏ lượt này, lượt sau gửi bản mới hơn
      const list = [];
      for (const q of this.others(p)) {
        if (!far && dist2d(p.st, q.st) > NET.nearM) continue;
        const s = q.st;
        list.push([q.acc.id, +s.x.toFixed(2), +s.z.toFixed(2), +s.y.toFixed(2), +s.h.toFixed(3), s.m, +s.s.toFixed(1), +s.bx.toFixed(1), +s.bz.toFixed(1), +s.bh.toFixed(2), s.a]);
      }
      if (list.length) p.conn.send({ t: 'pos', p: list });
    }
  }
}
