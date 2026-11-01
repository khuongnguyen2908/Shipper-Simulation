// =============================================================
// CHƠI ONLINE — phần dùng chung cho máy chủ (server/) và trình duyệt (src/net/client.js).
// Thuần dữ liệu, chạy được trong Node. Không có Three.js / DOM.
// =============================================================
import { TIME, ONLINE } from '../data/balance.js';

export const PROTO = 1; // đổi cách nói chuyện máy chủ ↔ trình duyệt thì tăng số này (máy cũ bị báo cập nhật)
export const NET = {
  port: 8787, // cổng máy chủ mặc định (npm run server)
  sendHz: 10, // trình duyệt gửi vị trí của mình mấy lần / giây
  posHz: 10, // máy chủ gửi vị trí người khác mấy lần / giây
  farEvery: 10, // người ở xa (ngoài nearM): cứ 10 lượt mới gửi 1 lần (≈ 1 lần / giây, đủ để vẽ chấm trên bản đồ)
  nearM: 250,
  pingSec: 2, // đo độ trễ mỗi 2 giây
  dropSec: 8, // im lặng quá 8 giây → coi như rớt mạng
  bufferMax: 64 * 1024, // đường truyền nghẽn quá mức này thì bỏ gói vị trí (chỉ cần gói mới nhất)
  chatGapMs: 700, // gửi chat nhanh hơn mức này thì bỏ (chống spam)
  rosterSec: 2, // danh sách người online gửi lại mỗi 2 giây nếu có thay đổi
};
export const DEFAULT_SERVER = `ws://localhost:${NET.port}`;

// ---- GIỜ THÀNH PHỐ: tính từ giờ thật của máy chủ → mọi máy ra cùng một giờ ----
// epoch: lúc (ms) thành phố ở phút startMin. 1 giây thật = TIME.gameMinPerRealSec phút trong game.
export function worldMinAt(ms, world) {
  return world.startMin + ((ms - world.epoch) / 1000) * TIME.gameMinPerRealSec;
}

// ---- TÊN & BIỂN SỐ ----
export const NAME_MAX = 16;
// Tên shipper: bỏ ký tự điều khiển và < >, gộp khoảng trắng, cắt độ dài. Rỗng → ''
export function cleanName(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}
// Biển số dạng 59-X1 234.56 (59 = Sài Gòn). Bỏ chữ / số dễ nhầm: không có I, O, Q, W, J; số không có 0 ở ô seri.
const PLATE_L = 'ABCDEFGHKLMNPSTUVXYZ';
export function makePlate(rnd = Math.random) {
  const d = () => Math.floor(rnd() * 10);
  return `59-${PLATE_L[Math.floor(rnd() * PLATE_L.length)]}${1 + Math.floor(rnd() * 9)} ${d()}${d()}${d()}.${d()}${d()}`;
}
export const PLATE_RE = /^\d{2}-[A-Z]\d \d{3}\.\d{2}$/;

// ---- GÓI VỊ TRÍ ----
// Trình duyệt gửi 'st': { x, z, y, h (hướng), m (1 = trên xe), s (tốc độ m/s), bx, bz, bh (chỗ xe), a (đang làm gì) }
// Máy chủ kẹp lại cho hợp lệ (số hữu hạn, trong bản đồ) trước khi chuyển cho người khác.
export const ACTS = ['idle', 'deliver', 'busy', 'sleep']; // rảnh · đang giao · đang chờ việc gì đó · đang ngủ
const num = (v, lo, hi, def = 0) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);
export function cleanState(st, bound = 2000) {
  const o = st || {};
  return {
    x: num(o.x, -bound, bound), z: num(o.z, -bound, bound), y: num(o.y, -50, 200), h: num(o.h, -100, 100),
    m: o.m ? 1 : 0, s: num(o.s, -30, 60),
    bx: num(o.bx, -bound, bound), bz: num(o.bz, -bound, bound), bh: num(o.bh, -100, 100),
    a: ACTS.includes(o.a) ? o.a : 'idle',
  };
}
// Thông tin ít đổi của một người (ngoại hình, xe, hãng, sao) — gửi khi đổi, không gửi 10 lần / giây
export function cleanInfo(inf) {
  const o = inf || {};
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const look = o.look && typeof o.look === 'object' && !Array.isArray(o.look) && JSON.stringify(o.look).length < 2000 ? o.look : null;
  return {
    look,
    veh: { model: str(o.veh?.model, 24), color: Number.isFinite(o.veh?.color) ? o.veh.color : 0x3a6fb0, pedal: !!o.veh?.pedal, name: str(o.veh?.name, 40) },
    bag: Number.isFinite(o.bag) ? o.bag : null,
    brand: str(o.brand, 20) || null,
    rating: num(o.rating, 0, 5, 5),
  };
}
// Ngoại hình chọn ở màn tạo nhân vật: chỉ giữ các ô hợp lệ (máy chủ lưu theo tài khoản)
export function cleanProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const o = { gender: p.gender === 'f' ? 'f' : 'm' };
  if (typeof p.hairStyle === 'string') o.hairStyle = p.hairStyle.slice(0, 24);
  for (const k of ['hair', 'skin']) if (Number.isInteger(p[k]) && p[k] >= 0 && p[k] <= 0xffffff) o[k] = p[k];
  o.sleeves = p.sleeves === 'long' ? 'long' : 'short';
  o.legs = p.legs === 'long' ? 'long' : 'shorts';
  o.shoes = p.shoes === 'white' ? 'white' : 'black';
  return o;
}
// Khoảng cách 2 điểm trên mặt đất
export const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const ONLINE_CFG = ONLINE;
