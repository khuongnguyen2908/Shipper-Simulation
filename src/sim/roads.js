// CẤP ĐƯỜNG (thuần dữ liệu, chạy được trong Node): mỗi đoạn đường giữa 2 ngã tư là Đại lộ / Đường thường / Đường nhỏ.
// Dữ liệu: map.json → roadTiers { "x3:5": "big" | "small" } (không ghi = đường thường), sửa ở thẻ 🗺️ Bản đồ → Đường to / nhỏ.
// Số luật chơi theo cấp: balance.json → roads (thẻ ⚖️ Cân bằng → 🛣️ Cấp đường).
// Mã đoạn: `${trục}${tuyến}:${từ}` — trục x = đường dọc (x = roadPos(tuyến)) chạy từ ngã tư (tuyến, từ) tới (tuyến, từ + 1); trục z = đường ngang.
import { CITY, roadPos, roadGraph, districtAt } from './cityLayout.js';
import { MAP } from '../data/map.js';
import { ROADS } from '../data/balance.js';

export const ROAD_TIERS = [
  ['big', '🛣️ Đại lộ'],
  ['normal', '🚗 Đường thường'],
  ['small', '🛵 Đường nhỏ'],
];
export const TIER_IDS = ROAD_TIERS.map(([k]) => k);
export const tierLabel = (t) => (ROAD_TIERS.find(([k]) => k === t) || ROAD_TIERS[1])[1];

// Hình dáng mặt đường theo cấp (m, tính từ tim đường): nửa bề rộng mặt nhựa, nửa dải phân cách, làn ô tô / xe máy
export const TIER_GEO = {
  big: { half: 6, median: 0.7, carLane: 2.2, motoLane: 4.9 },
  normal: { half: 6, median: 0, carLane: 2.8, motoLane: 4.4 },
  small: { half: 3.5, median: 0, carLane: 1.7, motoLane: 2.4 },
};

export const segKeyOf = (axis, line, from) => `${axis}${line}:${from}`;
// Cấp của đoạn đường (thiếu / sai → đường thường)
export function tierOf(id, map = MAP) {
  const t = map?.roadTiers?.[id];
  return TIER_GEO[t] ? t : 'normal';
}
// Số luật chơi của một cấp (thiếu → 1, như đường thường)
export function tierRule(t, k, R = ROADS) {
  const v = R?.[t]?.[k];
  return Number.isFinite(v) && v >= 0 ? v : 1;
}
// Cấp của đoạn nối 2 ngã tư kề nhau a → b ([i, j])
export function tierBetween(a, b, map = MAP) {
  const id = a[0] === b[0] ? segKeyOf('x', a[0], Math.min(a[1], b[1])) : segKeyOf('z', a[1], Math.min(a[0], b[0]));
  return tierOf(id, map);
}

// Đoạn đường dưới điểm (x, z): { axis, line, from, id } — đứng trong ngã tư hoặc trên khối nhà → null
export function roadSegAt(x, z) {
  const H = CITY.ROAD / 2;
  const i = Math.round((x - CITY.ORIGIN) / CITY.PITCH), j = Math.round((z - CITY.ORIGIN) / CITY.PITCH);
  const onX = i >= 0 && i <= CITY.N && Math.abs(x - roadPos(i)) <= H; // trên đường dọc tuyến i
  const onZ = j >= 0 && j <= CITY.N && Math.abs(z - roadPos(j)) <= H; // trên đường ngang tuyến j
  if (onX === onZ) return null; // ngã tư (cả 2) hoặc khối nhà (không cái nào)
  if (onX) {
    const from = Math.floor((z - CITY.ORIGIN) / CITY.PITCH);
    return from < 0 || from >= CITY.N ? null : { axis: 'x', line: i, from, id: segKeyOf('x', i, from) };
  }
  const from = Math.floor((x - CITY.ORIGIN) / CITY.PITCH);
  return from < 0 || from >= CITY.N ? null : { axis: 'z', line: j, from, id: segKeyOf('z', j, from) };
}

// Mọi đoạn đường có thật (bỏ mặt sông, đoạn đã gộp khối)
export function allSegments(map = MAP) {
  const G = roadGraph(map), out = [];
  for (const axis of ['x', 'z']) for (let line = 0; line <= CITY.N; line++) for (let from = 0; from < CITY.N; from++) {
    const id = segKeyOf(axis, line, from);
    if (G.waterSegs.has(id) || G.closedSegs.has(id)) continue;
    out.push({ axis, line, from, id });
  }
  return out;
}
// 2 khối hai bên một đoạn đường (khối ngoài bản đồ → null)
export function sideBlocks(s) {
  const ok = (bx, bz) => (bx >= 0 && bz >= 0 && bx < CITY.N && bz < CITY.N ? [bx, bz] : null);
  return s.axis === 'x' ? [ok(s.line - 1, s.from), ok(s.line, s.from)] : [ok(s.from, s.line - 1), ok(s.from, s.line)];
}

// số ngẫu nhiên cố định 0..1 theo chuỗi (cùng tuyến đường trong cùng khu phố → cùng cấp, đường không bị loang lổ)
function hash01(s) {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
const RANK = { small: 0, normal: 1, big: 2 };
// Cấp đường khu phố muốn cho một tuyến (districts[mã].roads = { big, normal, small } tỉ lệ; không đặt → đường thường)
function districtPick(d, axis, line) {
  const mix = d && d.roads && typeof d.roads === 'object' ? d.roads : null;
  if (!mix) return 'normal';
  const ws = TIER_IDS.map((t) => (Number.isFinite(mix[t]) && mix[t] > 0 ? mix[t] : 0));
  const sum = ws.reduce((a, b) => a + b, 0);
  if (!sum) return 'normal';
  let r = hash01(`${d.id}|${axis}${line}`) * sum;
  for (let k = 0; k < TIER_IDS.length; k++) if ((r -= ws[k]) < 0) return TIER_IDS[k];
  return 'normal';
}
// Chia cấp đường tự động theo khu phố: đường chính (places.json → mainRoads) là đại lộ;
// đoạn khác lấy theo khu phố hai bên (mỗi tuyến trong một khu phố cùng một cấp), hai bên khác nhau thì lấy mức giữa.
// Trả về { mã đoạn: 'big' | 'small' } (đường thường không ghi).
export function suggestRoadTiers(map = MAP, mainRoads = []) {
  const out = {};
  for (const s of allSegments(map)) {
    let t;
    if (mainRoads.some((r) => r.axis === s.axis && r.line === s.line)) t = 'big';
    else {
      const picks = sideBlocks(s).filter(Boolean).map(([bx, bz]) => districtPick(districtAt(bx, bz, map), s.axis, s.line));
      const avg = picks.length ? picks.reduce((a, p) => a + RANK[p], 0) / picks.length : 1;
      t = avg >= 1.5 ? 'big' : avg <= 0.5 ? 'small' : 'normal';
    }
    if (t !== 'normal') out[s.id] = t;
  }
  return out;
}

// Giới hạn tốc độ (m/s) trên cấp đường t — base: giới hạn đường thường (balance.json → economy.speedLimit)
export const speedLimitOf = (t, base) => base * tierRule(t, 'speedMul');
