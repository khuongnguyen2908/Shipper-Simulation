// PHÀ (thuần, chạy được trong Node): 2 bến nối nhau qua sông, vài chiếc phà chạy qua lại theo lịch.
// Dữ liệu: places.json — địa điểm kiểu nhà "ferry" có ferryTo = mã bến bên kia (sửa ở ?editor).
// Số liệu: balance.json → ferry (thẻ ⚖️ Cân bằng): giá vé, giờ chạy, phút đậu bến, phút qua sông, số phà.
// Mỗi chiếc: đậu bến A (dwell) → chạy A→B (cross) → đậu bến B → chạy B→A; các chiếc chạy so le đều nhau.
import { FERRY } from '../data/balance.js';
import { lookOf } from '../data/looks.js';
import { blockBounds } from './cityLayout.js';

export const ferryRule = (k, d) => (Number.isFinite(FERRY[k]) ? FERRY[k] : d);
export const PONTOON = 6; // phao nổi + cầu dẫn chìa ra sông (m)
export const BOAT_L = 14, BOAT_W = 7, BOAT_DECK = 0.65; // dài · rộng · cao mặt boong so với mặt đường
const SIDE = 5; // giữa sông 2 chiều đi lệch nhau (m)
const NORMAL = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

export const isFerry = (p) => !!p && lookOf(p) === 'ferry';

// Bến: mép bờ trước cửa (giữa mặt tiền), hướng ra sông, chỗ phà đậu (tâm phà), chỗ người lên bờ (cửa trên vỉa hè)
export function pierInfo(p) {
  const n = NORMAL[p.face] || [0, 1];
  const b = blockBounds(p.block[0], p.block[1]);
  const edge = p.face === 'E' ? { x: b.x1, z: p.door.z } : p.face === 'W' ? { x: b.x0, z: p.door.z } : p.face === 'N' ? { x: p.door.x, z: b.z0 } : { x: p.door.x, z: b.z1 };
  const k = PONTOON + BOAT_L / 2;
  return { id: p.id, name: p.name, n, edge, dock: { x: edge.x + n[0] * k, z: edge.z + n[1] * k }, door: { ...p.door } };
}

// Các cặp bến (mỗi cặp 1 lần): bến có ferryTo trỏ tới một bến phà khác đã đặt trên bản đồ
export function ferryPairs(places) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const out = [], seen = new Set();
  for (const p of places) {
    if (!isFerry(p) || !p.ferryTo || !p.door) continue;
    const q = byId.get(p.ferryTo);
    if (!isFerry(q) || !q.door || q.id === p.id) continue;
    const key = [p.id, q.id].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const [a, b] = p.id < q.id ? [p, q] : [q, p];
    out.push({ id: key, a: pierInfo(a), b: pierInfo(b) });
  }
  return out;
}

// Phà có chạy lúc now (phút game tuyệt đối) không
export function ferryOpen(now) {
  const h = (((now / 60) % 24) + 24) % 24;
  return h >= ferryRule('from', 5) && h < ferryRule('to', 22);
}
const nBoats = () => Math.max(1, Math.min(4, Math.round(ferryRule('boats', 2))));
const times = () => ({ dwell: Math.max(0.5, ferryRule('dwellMin', 2)), cross: Math.max(1, ferryRule('crossMin', 8)) });
// Phút giữa 2 chuyến rời cùng một bến
export function ferryEvery() {
  const { dwell, cross } = times();
  return (2 * (dwell + cross)) / nBoats();
}
const phaseOf = (i, now) => {
  const { dwell, cross } = times(), C = 2 * (dwell + cross);
  return ((((now + (i * C) / nBoats()) % C) + C) % C);
};

// Vị trí chiếc phà i lúc now: { x, z, heading, at: 'a' | 'b' | null (đang chạy) }
export function boatPose(pair, i, now) {
  const { dwell, cross } = times();
  const A = pair.a.dock, B = pair.b.dock;
  const head = Math.atan2(B.x - A.x, B.z - A.z);
  if (!ferryOpen(now)) {
    const s = i % 2 ? pair.b : pair.a; // ngoài giờ: đậu ở 2 bến
    return { x: s.dock.x, z: s.dock.z, heading: head, at: i % 2 ? 'b' : 'a' };
  }
  const t = phaseOf(i, now);
  if (t < dwell) return { x: A.x, z: A.z, heading: head, at: 'a' };
  // giữa sông 2 chiều đi lệch 2 bên (không đâm nhau): lệch tối đa SIDE m, về đúng bến ở 2 đầu
  const L = Math.hypot(B.x - A.x, B.z - A.z) || 1, px = (B.z - A.z) / L, pz = -(B.x - A.x) / L;
  if (t < dwell + cross) {
    const u = (t - dwell) / cross, e = u * u * (3 - 2 * u), o = SIDE * Math.sin(Math.PI * u); // tăng tốc / giảm tốc êm
    return { x: A.x + (B.x - A.x) * e + px * o, z: A.z + (B.z - A.z) * e + pz * o, heading: head, at: null };
  }
  if (t < 2 * dwell + cross) return { x: B.x, z: B.z, heading: head, at: 'b' };
  const u = (t - 2 * dwell - cross) / cross, e = u * u * (3 - 2 * u), o = SIDE * Math.sin(Math.PI * u);
  return { x: B.x + (A.x - B.x) * e - px * o, z: B.z + (A.z - B.z) * e - pz * o, heading: head, at: null }; // phà 2 đầu: không quay đầu
}

// Chuyến kế tiếp lên được ở bến side ('a' | 'b'): { boat, wait (phút tới lúc phà đậu ở bến, 0 = đang đậu) }
// Phà sắp rời bến (còn dưới 0,3 phút) thì coi như lỡ chuyến. Ngoài giờ chạy: chờ tới giờ mở rồi tính tiếp.
export function nextBoat(side, now) {
  if (!ferryOpen(now)) {
    const h = (((now / 60) % 24) + 24) % 24, from = ferryRule('from', 5);
    const until = ((from - h + 24) % 24) * 60;
    const r = nextBoat(side, now + until + 0.001);
    return { boat: r.boat, wait: until + r.wait };
  }
  const { dwell, cross } = times(), C = 2 * (dwell + cross);
  const start = side === 'a' ? 0 : dwell + cross;
  let best = null;
  for (let i = 0; i < nBoats(); i++) {
    const t = phaseOf(i, now), into = (((t - start) % C) + C) % C;
    const wait = into < dwell - 0.3 ? 0 : C - into;
    if (!best || wait < best.wait) best = { boat: i, wait };
  }
  return best;
}

// Giá vé: chở xe máy theo / đi bộ (k)
export const ferryFare = (withBike) => (withBike ? ferryRule('fareBike', 3) : ferryRule('fareFoot', 1));
