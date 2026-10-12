// =============================================================
// NGẬP ĐƯỜNG & TRIỀU CƯỜNG (thuần dữ liệu, chạy được trong Node)
// - Đoạn nào hay ngập: map.json → floodSegs { "x3:5": "low" | "tide" } (thẻ 🗺️ Bản đồ → 🌊 Đường ngập).
//   "low" = Trũng: chỉ ngập khi mưa to · "tide" = Rất trũng (thường sát sông): ngập khi mưa to và khi triều cường.
//   Chưa tô lần nào (không có floodSegs) → dùng gợi ý tự động: đoạn sát sông = Rất trũng + vài đoạn Trũng ngẫu nhiên cố định.
// - Mực nước 0..1 theo giờ: mưa to (sau một lúc mới ngập, tạnh thì rút dần) + triều cường (vài ngày 1 lần, lên – giữ – rút).
// - Số cân bằng: balance.json → flood (thẻ ⚖️ Cân bằng → 🌊 Ngập đường & triều cường).
// =============================================================
import { CITY, roadPos, roadGraph } from './cityLayout.js';
import { MAP } from '../data/map.js';
import { FLOOD } from '../data/balance.js';
import { segKeyOf, allSegments, roadSegAt } from './roads.js';

export const FLOOD_LEVELS = [
  ['none', 'Không ngập'],
  ['low', '💧 Trũng (ngập khi mưa to)'],
  ['tide', '🌊 Rất trũng (ngập cả khi triều cường)'],
];
export const FLOOD_IDS = ['low', 'tide'];

// số trong balance.json (thiếu / sai → mặc định)
const num = (v, d) => (Number.isFinite(v) ? v : d);
export const floodNum = (k, F = FLOOD) => num(F?.[k], DEFAULTS[k]);
const DEFAULTS = {
  tideChance: 0.2, tideFromDay: 2, tidePeakFrom: 17, tidePeakTo: 19.5, tideRiseMin: 90, tideHoldMin: 45, tideFallMin: 90, tideDepth: 0.9,
  rainDelayMin: 20, rainRiseMin: 40, rainDrainMin: 60, lowDepth: 0.6, shallow: 0.15, deep: 0.5, shallowKmh: 25, deepKmh: 10, walkMul: 0.6,
  stallKmh: 15, stallChance: 0.35, stallHp: 8, stallHpElec: 15, restartSec: 3, itemWet: 1.5, autoLowPct: 0.12, autoTidePct: 0.4,
};

// "x3:5" → { axis, line, from, id }
export function segOfId(id) {
  const m = /^([xz])(\d+):(\d+)$/.exec(id || '');
  return m ? { axis: m[1], line: +m[2], from: +m[3], id } : null;
}

// số ngẫu nhiên cố định 0..1 theo chuỗi (gợi ý tự động lần nào cũng ra như nhau)
function hash01(s) {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

// Gợi ý tự động: đường chạy song song sát bờ sông (cụm 2 đoạn liền nhau, giữ theo tỉ lệ autoTidePct) = Rất trũng;
// đoạn khác Trũng theo tỉ lệ autoLowPct. Bỏ qua mặt cầu cao / dốc cầu.
export function suggestFlood(map = MAP, F = FLOOD) {
  const G = roadGraph(map);
  const riverside = new Set();
  for (const r of (map && map.rivers) || []) {
    for (const line of [r.line - 1, r.line + (r.wide ? 2 : 1)]) {
      if (line < 0 || line > CITY.N) continue;
      for (let k = r.from; k < r.to; k++) if (hash01(`tide:${r.axis}${line}:${Math.floor(k / 2)}`) < floodNum('autoTidePct', F)) riverside.add(segKeyOf(r.axis, line, k));
    }
  }
  const pct = floodNum('autoLowPct', F);
  const out = {};
  for (const s of allSegments(map)) {
    if (G.rampSegs.has(s.id) || G.highSegs.has(s.id) || G.bridgeSegs.has(s.id)) continue;
    if (riverside.has(s.id)) out[s.id] = 'tide';
    else if (hash01(`flood:${s.id}`) < pct) out[s.id] = 'low';
  }
  return out;
}

// Bảng cấp ngập đang dùng { id: 'low' | 'tide' } (đã tô → theo dữ liệu; chưa tô → gợi ý tự động)
const mapCache = new Map();
export function floodMap(map = MAP) {
  if (map && map.floodSegs && typeof map.floodSegs === 'object') {
    const out = {};
    for (const [id, lv] of Object.entries(map.floodSegs)) if (FLOOD_IDS.includes(lv) && segOfId(id)) out[id] = lv;
    return out;
  }
  const key = JSON.stringify([map?.size, map?.rivers || [], map?.joins || [], floodNum('autoLowPct'), floodNum('autoTidePct')]);
  if (!mapCache.has(key)) mapCache.set(key, suggestFlood(map));
  return mapCache.get(key);
}
export const floodLevelOf = (id, map = MAP) => floodMap(map)[id] || null;

// ---------- mực nước theo thời gian (m: phút kể từ 00:00 của ngày, như lịch HazardManager) ----------
// Mưa to: mưa được rainDelayMin phút thì bắt đầu ngập, dâng tới đỉnh trong rainRiseMin; tạnh thì rút trong rainDrainMin. Mưa phùn không ngập.
export function rainWaterAt(m, rains = [], F = FLOOD) {
  const delay = floodNum('rainDelayMin', F), rise = Math.max(1, floodNum('rainRiseMin', F)), drain = Math.max(1, floodNum('rainDrainMin', F));
  let w = 0;
  for (const r of rains) {
    if (!r.heavy || m < r.start + delay) continue;
    const peak = Math.min(1, Math.max(0, (Math.min(m, r.end) - r.start - delay) / rise)); // mực nước lúc tạnh (hoặc bây giờ)
    const v = m < r.end ? peak : peak * Math.max(0, 1 - (m - r.end) / drain);
    w = Math.max(w, v);
  }
  return w;
}
// Lịch triều cường của 1 ngày (dùng rng của ngày đó): null = hôm nay không có triều
export function makeTide(rng, day, F = FLOOD) {
  if (day < floodNum('tideFromDay', F) || !rng.chance(floodNum('tideChance', F))) return null;
  const a = floodNum('tidePeakFrom', F) * 60, b = Math.max(a, floodNum('tidePeakTo', F) * 60);
  const peak = rng.range(a, b);
  const rise = Math.max(1, floodNum('tideRiseMin', F)), hold = Math.max(0, floodNum('tideHoldMin', F)), fall = Math.max(1, floodNum('tideFallMin', F));
  const top = peak - hold / 2;
  return { start: top - rise, top, topEnd: top + hold, end: top + hold + fall, peak };
}
export function tideWaterAt(m, tide, F = FLOOD) {
  if (!tide || m <= tide.start || m >= tide.end) return 0;
  const depth = floodNum('tideDepth', F);
  if (m < tide.top) return depth * ((m - tide.start) / (tide.top - tide.start));
  if (m <= tide.topEnd) return depth;
  return depth * (1 - (m - tide.topEnd) / (tide.end - tide.topEnd));
}
// Mực nước của một đoạn theo cấp: Trũng chỉ ngập mưa (thấp hơn); Rất trũng ngập mưa + triều (cộng dồn khi trùng nhau)
export function segDepth(level, rain, tide, F = FLOOD) {
  if (level === 'low') return rain * floodNum('lowDepth', F);
  if (level === 'tide') return Math.min(1, Math.max(rain, tide) + Math.min(rain, tide) * 0.5);
  return 0;
}
// 0 = khô · 1 = xăm xắp · 2 = ngập sâu
export const floodBand = (d, F = FLOOD) => (d >= floodNum('deep', F) ? 2 : d >= floodNum('shallow', F) ? 1 : 0);
// Tốc độ tối đa khi lội nước (m/s); 0 = không giới hạn (khô)
export function floodSpeedCap(d, F = FLOOD) {
  const lo = floodNum('shallow', F), hi = Math.max(lo + 1e-3, floodNum('deep', F));
  if (d < lo) return 0;
  const t = Math.min(1, (d - lo) / (hi - lo));
  return (floodNum('shallowKmh', F) + (floodNum('deepKmh', F) - floodNum('shallowKmh', F)) * t) / 3.6;
}

// ---------- vị trí → đoạn đường ----------
// Mực nước ở điểm (x, z) trên lòng đường: đoạn dưới chân; giữa ngã tư lấy đoạn ngập nhất nối vào ngã tư; vỉa hè / trong khối = khô
export function depthAtPoint(x, z, depthOf) {
  const s = roadSegAt(x, z);
  if (s) return depthOf(s.id);
  const H = CITY.ROAD / 2;
  const i = Math.round((x - CITY.ORIGIN) / CITY.PITCH), j = Math.round((z - CITY.ORIGIN) / CITY.PITCH);
  if (i < 0 || j < 0 || i > CITY.N || j > CITY.N || Math.abs(x - roadPos(i)) > H || Math.abs(z - roadPos(j)) > H) return 0;
  return Math.max(depthOf(segKeyOf('x', i, j - 1)), depthOf(segKeyOf('x', i, j)), depthOf(segKeyOf('z', j, i - 1)), depthOf(segKeyOf('z', j, i)));
}
// Đoạn đường gần một điểm nhất (cửa nhà trên vỉa hè; cửa trong hẻm thì dùng miệng hẻm)
export function nearestSegId(p) {
  const q = p?.mouth || p;
  if (!q) return null;
  const clampFrom = (v) => Math.max(0, Math.min(CITY.N - 1, Math.floor((v - CITY.ORIGIN) / CITY.PITCH)));
  const i = Math.max(0, Math.min(CITY.N, Math.round((q.x - CITY.ORIGIN) / CITY.PITCH)));
  const j = Math.max(0, Math.min(CITY.N, Math.round((q.z - CITY.ORIGIN) / CITY.PITCH)));
  const dx = Math.abs(q.x - roadPos(i)), dz = Math.abs(q.z - roadPos(j));
  return dx <= dz ? segKeyOf('x', i, clampFrom(q.z)) : segKeyOf('z', j, clampFrom(q.x));
}

// ---------- hủy đơn vì ngập ----------
// Chỉ khi CHƯA lấy hàng ở quán / shop (hoặc chưa đón khách): đang tới nơi lấy, đang chờ quán làm, quán hết món
export const FLOOD_CANCEL_STATES = ['TO_PICKUP', 'WAITING_FOOD', 'OUT_OF_STOCK'];
// Được hủy vì ngập: đúng giai đoạn + chỗ lấy hoặc chỗ giao đang ngập (từ mức xăm xắp)
export function floodCancelOk(state, order, depthOfSeg, F = FLOOD) {
  if (!order || !FLOOD_CANCEL_STATES.includes(state)) return false;
  const wet = (door) => floodBand(depthOfSeg(nearestSegId(door)), F) >= 1;
  return wet(order.pickup?.door) || wet(order.dropoff?.door);
}

// Phút thêm khi đi một đường (danh sách ngã tư) qua đoạn ngập — dùng cho bot chơi thử (tests/economy-sim.js)
export function routeFloodDelay(nodes, depthOfSeg, speed, F = FLOOD) {
  let extra = 0;
  for (let k = 1; k < nodes.length; k++) {
    const [a, b] = [nodes[k - 1], nodes[k]];
    const id = a[0] === b[0] ? segKeyOf('x', a[0], Math.min(a[1], b[1])) : segKeyOf('z', a[1], Math.min(a[0], b[0]));
    const cap = floodSpeedCap(depthOfSeg(id), F);
    if (cap > 0 && cap < speed) extra += CITY.PITCH / cap - CITY.PITCH / speed; // m / (m/s) = phút game
  }
  return extra;
}
