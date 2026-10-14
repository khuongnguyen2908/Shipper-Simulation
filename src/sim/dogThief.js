// LỊCH TRỘM CHÓ (mô phỏng thuần, không Three.js): mỗi đêm vài vụ, giờ + chỗ tính từ (ngày, seed thế giới) →
// máy nào cũng ra giống nhau (chơi nhiều người: mọi người thấy cùng một vụ, cùng lúc, cùng chỗ).
// Mỗi vụ: xe trộm chạy tới chỗ con chó trên vỉa hè, chậm lại chĩa cây chích điện → chó luôn thoát → trộm rồ ga bỏ đi.
// Diễn biến tính theo số phút từ lúc bắt đầu (1 phút game = 1 giây thật): xem PHASE.
import { CITY, roadPos, neighbors, isWaterBlock, isJoinedBlock, streetAt } from './cityLayout.js';
import { NPC_FLAVOR } from '../data/balance.js';
import { dayStartAt, atHour } from './clock.js';
import { makeRng } from './rng.js';

// mốc diễn biến (phút game kể từ lúc bắt đầu): chó ngồi chờ sẵn từ −30 · xe chạy tới · dừng chĩa cây · chó chạy · xe bỏ đi · hết
export const PHASE = { dogFrom: -30, arrive: 10, poke: 13, leave: 14, end: 26, dogGone: 20 };

// 4 cạnh của khối: đoạn đường (2 ngã tư đầu mút) · hướng vào trong khối · hướng xe chạy (khối nằm bên phải, xe chạy bên phải đường)
const SIDES = [
  { a: [0, 0], b: [1, 0], inward: [0, 1], dir: [1, 0] }, // cạnh trên (đường ngang z = roadPos(bz))
  { a: [1, 0], b: [1, 1], inward: [-1, 0], dir: [0, 1] }, // cạnh phải (đường dọc x = roadPos(bx + 1))
  { a: [0, 1], b: [1, 1], inward: [0, -1], dir: [-1, 0] }, // cạnh dưới
  { a: [0, 0], b: [0, 1], inward: [1, 0], dir: [0, -1] }, // cạnh trái
];
const hasRoad = (a, b) => neighbors(...a).some(([i, j]) => i === b[0] && j === b[1]);

// Chỗ xảy ra vụ trộm trên cạnh `side` của khối (bx, bz), u = vị trí dọc cạnh (0..1, tránh 2 đầu ngã tư).
// Trả về { x, z } điểm trên TIM đường đối diện chỗ con chó, inward, dir — null nếu cạnh đó không có đường.
export function thiefSpot(bx, bz, side, u) {
  const S = SIDES[side];
  const A = [bx + S.a[0], bz + S.a[1]], B = [bx + S.b[0], bz + S.b[1]];
  if (!hasRoad(A, B)) return null;
  const p0 = [roadPos(A[0]), roadPos(A[1])], p1 = [roadPos(B[0]), roadPos(B[1])];
  const k = 0.3 + u * 0.4; // giữa cạnh, cách 2 ngã tư
  return { x: p0[0] + (p1[0] - p0[0]) * k, z: p0[1] + (p1[1] - p0[1]) * k, inward: S.inward, dir: S.dir };
}

// Các vụ trộm của đêm thuộc ngày `day` (đêm bắt đầu tối ngày đó, kéo qua sáng hôm sau).
// at: phút game (đồng hồ chung) lúc xe bắt đầu chạy tới · street: tên đường (tin Tích Tắc)
export function thiefEvents(day, seed = 1, cfg = NPC_FLAVOR) {
  const n = cfg.thiefPerNight ?? 2;
  if (n <= 0) return [];
  const rng = makeRng(seed * 7919 + day * 104729 + 17);
  const from = cfg.thiefFrom ?? 22, to = cfg.thiefTo ?? 4;
  const start = atHour(day, from); // giờ bắt đầu đêm của ngày đó
  const span = Math.max(30, ((to - from + 24) % 24) * 60 - PHASE.end);
  const out = [];
  for (let k = 0; k < n * 20 && out.length < n; k++) {
    const bx = rng.int(0, CITY.N - 1), bz = rng.int(0, CITY.N - 1); // int: lấy cả 2 đầu
    if (isWaterBlock(bx, bz) || isJoinedBlock(bx, bz)) continue;
    const side = rng.int(0, 3), u = rng.next();
    const spot = thiefSpot(bx, bz, side, u);
    if (!spot) continue;
    // chia đêm thành n khúc, mỗi vụ rơi ngẫu nhiên trong khúc của nó (không 2 vụ chồng lúc)
    const i = out.length;
    const at = Math.round(start + (span / n) * (i + 0.15 + rng.next() * 0.7));
    out.push({ id: `${day}:${i}`, day, at, bx, bz, side, u, x: spot.x, z: spot.z, street: streetAt(spot.x, spot.z) });
  }
  return out;
}

// Vụ đang diễn ra (hoặc sắp có chó ngồi chờ) lúc `now`: xét đêm hôm nay và đêm hôm trước (vụ sau nửa đêm)
export function activeThief(now, seed = 1, cfg = NPC_FLAVOR) {
  const d = Math.floor((now - dayStartAt(1)) / 1440) + 1;
  for (const day of [d - 1, d]) {
    if (day < 1) continue;
    for (const e of thiefEvents(day, seed, cfg)) if (now >= e.at + PHASE.dogFrom && now < e.at + PHASE.end) return e;
  }
  return null;
}

// Các vụ đã xong trong khoảng 18 tiếng trước `now` (tin Tích Tắc sáng hôm sau)
export function recentThieves(now, seed = 1, cfg = NPC_FLAVOR) {
  const d = Math.floor((now - dayStartAt(1)) / 1440) + 1;
  const out = [];
  for (const day of [d - 1, d]) {
    if (day < 1) continue;
    for (const e of thiefEvents(day, seed, cfg)) if (e.at + PHASE.end <= now && now - e.at < 18 * 60) out.push(e);
  }
  return out;
}
