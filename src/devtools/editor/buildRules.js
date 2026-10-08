// Luật đặt địa điểm vào lô của thẻ 🏗️ Xây dựng (thuần dữ liệu, chạy được trong bộ thử).
import { CITY, LOT_SIZES, lotSize, lotInfo, blockPlan, blockBounds } from '../../sim/cityLayout.js';
import { isPlaced } from '../../data/places.js';
import { lookOf } from '../../data/looks.js';
import { lotCells } from '../../data/validate.js';

const OFF = CITY.ORIGIN + CITY.ROAD / 2; // mép tây-bắc của khối đầu tiên
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Khối gần điểm (x, z) nhất (kể cả khi đang chỉ vào lòng đường)
export const blockNear = (x, z) => [clamp(Math.floor((x - OFF) / CITY.PITCH), 0, CITY.N - 1), clamp(Math.floor((z - OFF) / CITY.PITCH), 0, CITY.N - 1)];
// Khối chứa điểm (null nếu đang ở lòng đường)
export function blockUnder(x, z) {
  const [bx, bz] = blockNear(x, z);
  const b = blockBounds(bx, bz);
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 ? [bx, bz] : null;
}

// Lô sẽ thả địa điểm p vào khi con trỏ ở (x, z): { bx, bz, lot, rect, ok, why }
// sizeHint: cỡ muốn đặt khi p đang nằm trong danh sách (chưa có lô)
export function dropTarget(data, p, x, z, sizeHint = 'one') {
  const [bx, bz] = blockNear(x, z);
  const map = data.map;
  const plan = blockPlan(bx, bz, map);
  let size = isPlaced(p) ? lotSize(p.lot) || 'one' : LOT_SIZES[sizeHint] ? sizeHint : 'one';
  if (p.kind === 'police' && size === 'one') size = 'two'; // đồn công an: ít nhất 2 lô
  if (lookOf(p) === 'pagodaCourtyard' && size === 'one') size = 'blockCut'; // chùa tứ hợp viện: cả khối chừa góc
  const cands = plan ? plan.lots.map((l) => l.id) : LOT_SIZES[size];
  let best = null, bestD = Infinity;
  for (const lot of cands) {
    const r = lotInfo(bx, bz, lot, null, map);
    if (!r) continue;
    const inside = x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
    const d = inside ? -1 : Math.hypot((r.x0 + r.x1) / 2 - x, (r.z0 + r.z1) / 2 - z);
    if (d < bestD) { bestD = d; best = { bx, bz, lot, rect: r }; }
  }
  if (!best) return null;
  const why = lotProblem(data, p, bx, bz, best.lot, plan && size !== 'one');
  return { ...best, ok: !why, why };
}

// Lý do không đặt được p vào (bx, bz, lot) — '' = đặt được
export function lotProblem(data, p, bx, bz, lot, multiInAlley = false) {
  const pd = data.places;
  const alleyKey = `${pd.alley.block[0]},${pd.alley.block[1]},${pd.alley.lot}`;
  const cells = lotCells({ block: [bx, bz], lot });
  const owner = new Map();
  for (const q of pd.places) if (q.id !== p.id) for (const c of lotCells(q)) owner.set(c, q);
  const hit = cells.map((c) => owner.get(c)).find(Boolean);
  if (p.kind === 'gate') return 'Nhà cổng xanh gắn với hẻm 42 — không dời được.';
  if (multiInAlley) return p.kind === 'police' ? 'Đồn công an cần ít nhất 2 lô — khối có hẻm chỉ có nhà 1 lô.' : 'Khối có hẻm chỉ đặt được nhà 1 lô. Đổi kích thước về "1 lô" trước.';
  if (p.kind === 'police' && cells.length < 2) return 'Đồn công an cần ít nhất 2 lô.';
  if (hit) return `Lô này đã có "${hit.name}".`;
  if (cells.includes(alleyKey)) return 'Lô này là lối vào hẻm 42.';
  return '';
}
