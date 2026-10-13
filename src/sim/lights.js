// ĐÈN GIAO THÔNG + CAMERA PHẠT NGUỘI (thuần dữ liệu, chạy được trong Node)
// - Ngã tư có đèn: map.json → lights ["i,j", …]; ngã tư có camera phạt nguội: map.json → cameras ["i,j", …] (thẻ 🗺️ Bản đồ → 🚦).
//   Chưa đặt lần nào (không có lights) → GỢI Ý TỰ ĐỘNG: ngã tư (≥ 3 hướng) nơi đại lộ cắt đường thường / đại lộ, không phải cầu;
//   camera: ~1/3 số ngã tư có đèn, cố định theo vị trí.
// - Hai pha: xe chạy dọc trục z (din = [0, ±1]) xanh → vàng → đỏ, xe dọc trục x ngược lại. Mỗi ngã tư lệch nhịp riêng (theo vị trí).
//   Thời gian tính bằng GIÂY THẬT (đèn đổi nhanh để không phải chờ lâu). Rẽ phải khi đèn đỏ luôn được phép.
// - Vượt đèn đỏ (đi qua vạch khi đèn hướng mình đỏ, không phải rẽ phải): có X% bị ghi hình → phạt nguội (game.js, thẻ ⚖️ Cân bằng → 🚦).
import { MAP } from '../data/map.js';
import { LIGHTS } from '../data/balance.js';
import { CITY, neighbors, roadGraph } from './cityLayout.js';
import { tierBetween } from './roads.js';

const num = (v, d) => (Number.isFinite(v) ? v : d);
const keyOf = (i, j) => `${i},${j}`;
const hashKey = (k) => [...k].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

// Ngã tư đặt đèn được: đi được, có ≥ 3 hướng, không phải đầu cầu / dốc cầu cao
export function lightable(i, j, map = MAP) {
  const g = roadGraph(map);
  if (!g.nodeOk(i, j) || g.bridgeNodes?.has?.(keyOf(i, j)) || g.highNodes?.has?.(keyOf(i, j))) return false;
  return neighbors(i, j, map).length >= 3;
}

// Gợi ý tự động: đại lộ cắt ngang một đường thường / đại lộ khác → đèn (đại lộ gặp đường nhỏ, hẻm thì không);
// camera ~ autoCameraPct số đèn (chọn cố định theo vị trí)
export function suggestLights(map = MAP, cfg = LIGHTS) {
  const lights = [];
  for (let i = 0; i <= CITY.N; i++) for (let j = 0; j <= CITY.N; j++) {
    if (!lightable(i, j, map)) continue;
    const t = neighbors(i, j, map).map((n) => [n[0] !== i ? 'x' : 'z', tierBetween([i, j], n, map)]);
    const bigAxes = new Set(t.filter(([, tier]) => tier === 'big').map(([ax]) => ax));
    if (bigAxes.size && t.some(([ax, tier]) => !bigAxes.has(ax) && tier !== 'small')) lights.push(keyOf(i, j));
  }
  const pct = num(cfg?.autoCameraPct, 0.34);
  const cameras = lights.filter((k) => (hashKey(k) % 1000) / 1000 < pct);
  return { lights, cameras };
}

// Bảng đèn đang dùng: key "i,j" → { i, j, cam } (bản đồ đã đặt → theo bản đồ, chưa đặt → gợi ý tự động)
export function lightMap(map = MAP, cfg = LIGHTS) {
  const auto = Array.isArray(map?.lights) ? null : suggestLights(map, cfg);
  const lights = auto ? auto.lights : map.lights;
  const cams = new Set(auto ? auto.cameras : Array.isArray(map?.cameras) ? map.cameras : []);
  const out = new Map();
  for (const k of lights) {
    const m = /^(\d+),(\d+)$/.exec(k);
    if (!m || !lightable(+m[1], +m[2], map)) continue;
    out.set(k, { i: +m[1], j: +m[2], cam: cams.has(k) });
  }
  return out;
}

// Màu đèn cho xe đang đi hướng din ([dx, dz] theo lưới) tại ngã tư key, lúc t giây: 'g' xanh · 'y' vàng · 'r' đỏ
export function lightColor(key, din, t, cfg = LIGHTS) {
  const G = Math.max(1, num(cfg?.greenSec, 8)), Y = Math.max(0, num(cfg?.yellowSec, 2)), cycle = 2 * (G + Y);
  let u = (((t + (hashKey(key) % 1000) / 1000 * cycle) % cycle) + cycle) % cycle;
  if (din[0] !== 0) u = (u + G + Y) % cycle; // trục x lệch nửa chu kỳ so với trục z
  return u < G ? 'g' : u < G + Y ? 'y' : 'r';
}

// Kiểu rẽ (giống traffic.js): bên phải của hướng (x, z) là (−z, x)
export function turnOf(din, dout) {
  if (dout[0] === din[0] && dout[1] === din[1]) return 'straight';
  if (dout[0] === -din[0] && dout[1] === -din[1]) return 'uturn';
  return dout[0] === -din[1] && dout[1] === din[0] ? 'right' : 'left';
}

// Có phải dừng trước vạch không (xe NPC / xe nền): đèn đỏ hoặc vàng, trừ rẽ phải
export function mustStop(lmap, key, din, turn, t, cfg = LIGHTS) {
  if (!lmap.has(key) || turn === 'right') return false;
  return lightColor(key, din, t, cfg) !== 'g';
}

// Khả năng bị ghi hình khi vượt đèn đỏ: có chốt CSGT ở ngã tư > có camera > ngã tư thường
export function ticketChance({ cam = false, police = false } = {}, cfg = LIGHTS) {
  return police ? num(cfg?.policePct, 1) : cam ? num(cfg?.cameraPct, 0.7) : num(cfg?.basePct, 0.15);
}
