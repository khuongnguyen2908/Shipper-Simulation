// Chỉ đường cho bản đồ tròn (thuần, chạy được trong Node): độ dài đường, chỗ rẽ kế tiếp, vật cản nằm trên đường đi.
// Đường = danh sách điểm { x, z } (cityLayout.navRoute). Đơn vị: m game.
import { segmentRect, CITY } from './cityLayout.js';
import { DIST } from '../data/balance.js';
import { fmt } from '../content/index.js';

const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Khoảng cách hiển thị: "780 m" / "1.2 km" (đổi đơn vị như bảng mục tiêu: DIST.displayPerUnit)
export function fmtDist(u) {
  const m = u * DIST.displayPerUnit;
  return m < 1000 ? fmt('mm.m', { n: Math.max(10, Math.round(m / 10) * 10) }) : fmt('mm.km', { n: (m / 1000).toFixed(1) });
}

export function routeLen(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += d2(pts[i - 1], pts[i]);
  return s;
}

// Chỗ rẽ kế tiếp: { dir: 'left' | 'right', dist } hoặc null (đi thẳng tới nơi). Bỏ qua khúc đầu ngắn hơn firstSeg m
// (từ lề / vỉa hè ra tim đường), khúc nhỏ dưới minSeg m và góc dưới 35°. Trục z hướng nam → tích chéo dương = rẽ phải.
// heading (hướng xe, tuỳ chọn): khúc đi đầu tiên ngược hướng xe → { dir: 'back', dist: 0 } (quay đầu).
export function nextTurn(pts, minSeg = 4, firstSeg = CITY.ROAD, heading = null) {
  const legs = [];
  for (let i = 1; i < pts.length; i++) {
    const L = d2(pts[i - 1], pts[i]);
    if (L < 0.01) continue;
    legs.push({ from: pts[i - 1], at: pts[i], dx: (pts[i].x - pts[i - 1].x) / L, dz: (pts[i].z - pts[i - 1].z) / L, L });
  }
  if (heading != null) {
    const first = legs.find((l, i) => !(i === 0 && l.L < firstSeg) && l.L >= minSeg);
    if (first && first.dx * Math.sin(heading) + first.dz * Math.cos(heading) < -0.5) return { dir: 'back', dist: 0 };
  }
  let along = 0;
  for (let i = 0; i < legs.length - 1; i++) {
    const a = legs[i];
    along += a.L;
    if (i === 0 && a.L < firstSeg) continue; // khúc ra tim đường ngay chỗ mình đứng
    // hướng đi tiếp: bỏ qua các khúc ngắn ngay sau
    let j = i + 1;
    while (j < legs.length - 1 && legs[j].L < minSeg) j++;
    const b = legs[j];
    if (b.L < minSeg && j === legs.length - 1) return null; // khúc cuối vào cửa nhà
    const dot = a.dx * b.dx + a.dz * b.dz, cross = a.dx * b.dz - a.dz * b.dx;
    if (dot > Math.cos((35 * Math.PI) / 180)) continue;
    return { dir: cross > 0 ? 'right' : 'left', dist: along };
  }
  return null;
}

// Điểm p nằm trên đường (cách tuyến dưới tol m) → quãng đường từ đầu tuyến tới đó; không thì null
export function alongRoute(pts, p, tol = 8) {
  let along = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = d2(a, b);
    if (L < 0.01) continue;
    const t = Math.max(0, Math.min(L, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / L));
    const q = { x: a.x + ((b.x - a.x) * t) / L, z: a.z + ((b.z - a.z) * t) / L };
    if (d2(p, q) <= tol) return along + t;
    along += L;
  }
  return null;
}

// Đoạn đường kẹt xe đầu tiên nằm trên tuyến: { dist, pts: [đầu, cuối] } hoặc null. jams: các đoạn { axis, line, from }
export function jamOnRoute(pts, jams) {
  let best = null;
  for (const s of jams || []) {
    const r = segmentRect(s), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const ends = s.axis === 'x' ? [{ x: cx, z: r.z0 }, { x: cx, z: r.z1 }] : [{ x: r.x0, z: cz }, { x: r.x1, z: cz }];
    const da = alongRoute(pts, ends[0], 6), db = alongRoute(pts, ends[1], 6), dm = alongRoute(pts, { x: cx, z: cz }, 6);
    if (dm == null || (da == null && db == null)) continue;
    const dist = Math.min(da ?? dm, db ?? dm);
    if (!best || dist < best.dist) best = { dist, pts: ends };
  }
  return best;
}
