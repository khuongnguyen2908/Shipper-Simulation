// Bản đồ tròn góc màn hình (chỉ vùng quanh mình, xoay theo hướng xe) — vẽ bằng canvas 2D.
// Dữ liệu gom ở src/roundMap.js; bản đồ cả thành phố nằm trong app Bản đồ của điện thoại (cityMap.js).
import { CITY, roadPos, blockBounds, segmentRect, roadGraph, joinList, joinGap } from '../sim/cityLayout.js';
const segOf = (id) => { const m = /^([xz])(\d+):(\d+)$/.exec(id); return { axis: m[1], line: +m[2], from: +m[3] }; };
import { allSegments, tierOf, TIER_GEO } from '../sim/roads.js';
import { lookOf } from '../data/looks.js';

export const ICON = { home: '🏠', restaurant: '🍴', gas: '⛽', shop: '🎒', garage: '🔧', cafe: '☕', taphoa: '🛒', gate: '🟩', apartment: '🏢', market: '🧺', scenery: '🌳', police: '🚓' };
// màu mảng cảnh quan
const SCENERY_COLOR = { park: '#4f8a3a', emptyLot: '#8b6f4e', soccer: '#3d9a48', parkingLot: '#8a8a85', construction: '#b08a4a' };
// bản đồ tròn: chấm màu theo nhóm địa điểm (cam quán ăn · đỏ xăng/sửa xe · tím mua sắm · xanh dương dịch vụ · xanh ngọc xe buýt/phà/sân bay)
const GROUP_COLOR = { food: '#f39c12', fix: '#e74c3c', shop: '#9b59b6', svc: '#3498db', transit: '#16a085', home: '#ecf0f1', police: '#5d6d7e' };
export function placeGroup(p) {
  const look = lookOf(p);
  if (p.kind === 'home') return 'home';
  if (p.kind === 'gas' || p.kind === 'garage' || p.kind === 'shop') return 'fix';
  if (p.kind === 'police') return 'police';
  if (p.kind === 'scenery') return 'park';
  if (['busStation', 'ferry', 'airport'].includes(look)) return 'transit';
  if (p.kind === 'restaurant' || p.kind === 'cafe') return 'food';
  if (p.kind === 'market' || p.kind === 'taphoa' || p.sells?.goods) return 'shop';
  return 'svc';
}
// bảng màu bản đồ tròn: ngày / đêm (đêm tối lại cho đỡ chói)
const DAY = { road: '#3a3f47', block: '#6b7563', inner: '#7d8a74', water: '#3d7ea6', bridge: '#9fa2a4', big: '#4a515c', median: '#6b7d5e', alley: '#9c9282', walk: '#b9ae9c' };
const NIGHT = { road: '#22262d', block: '#3b4250', inner: '#434b59', water: '#1f4f6e', bridge: '#6c7076', big: '#2b3038', median: '#3f4a3a', alley: '#5b5650', walk: '#6b655c' };

export class MiniMap {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
  }

  // BẢN ĐỒ TRÒN góc màn hình: chỉ vùng quanh mình, xoay theo hướng xe (mũi tên luôn chỉ lên).
  // o: { at, heading, radius (m), walk, night, rain, places, alleyBlocks, jams, zone, route, routeDashed, routeColor,
  //      ferryLines: [[a, b]], markers: [{ x, z, icon, ring, r, pulse, label }], edge: { x, z, icon, ring, label }, north }
  drawRound(o) {
    const { c, g } = this;
    const css = c.clientWidth || 210, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(css * dpr)) c.width = c.height = Math.round(css * dpr); // nét sắc trên màn hình độ phân giải cao
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = css, C = S / 2, Rpx = C - 3;
    const k = Rpx / o.radius, th = o.heading + Math.PI;
    const cs = Math.cos(th), sn = Math.sin(th);
    const toScr = (p) => { const dx = p.x - o.at.x, dz = p.z - o.at.z; return [C + k * (dx * cs - dz * sn), C + k * (dx * sn + dz * cs)]; };
    const pal = o.night ? NIGHT : DAY;
    const reach = o.radius * 1.5 + CITY.BLOCK; // bỏ qua thứ ở quá xa
    const far = (x, z) => Math.abs(x - o.at.x) > reach || Math.abs(z - o.at.z) > reach;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(C, C, Rpx, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = pal.road;
    g.fillRect(0, 0, S, S);
    // ---- nền thế giới (xoay theo hướng xe) ----
    g.save();
    g.translate(C, C);
    g.rotate(th);
    g.scale(k, k);
    g.translate(-o.at.x, -o.at.z);
    const R = (r, col) => { g.fillStyle = col; g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); };
    for (let bz = 0; bz < CITY.N; bz++) for (let bx = 0; bx < CITY.N; bx++) {
      const b = blockBounds(bx, bz);
      if (far((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) continue;
      R(b, pal.block);
      R({ x0: b.x0 + 3, z0: b.z0 + 3, x1: b.x1 - 3, z1: b.z1 - 3 }, pal.inner);
    }
    for (const j of joinList()) R(joinGap(j), pal.block);
    // đại lộ sáng hơn + dải phân cách · đường nhỏ hẹp lại
    for (const s of allSegments()) {
      const t = tierOf(s.id);
      if (t === 'normal') continue;
      const r = segmentRect(s);
      if (far((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2)) continue;
      const along = s.axis === 'x', cl = roadPos(s.line), tg = TIER_GEO[t];
      const strip = (l0, l1, col) => R(along ? { x0: cl + l0, x1: cl + l1, z0: r.z0, z1: r.z1 } : { x0: r.x0, x1: r.x1, z0: cl + l0, z1: cl + l1 }, col);
      if (t === 'big') { strip(-CITY.ROAD / 2, CITY.ROAD / 2, pal.big); strip(-tg.median, tg.median, pal.median); }
      else { strip(-CITY.ROAD / 2, -tg.half, pal.block); strip(tg.half, CITY.ROAD / 2, pal.block); }
    }
    // sông, cầu
    const G = roadGraph(), H = CITY.ROAD / 2;
    const node = (key) => { const [i, j] = key.split(',').map(Number); return { x0: roadPos(i) - H, x1: roadPos(i) + H, z0: roadPos(j) - H, z1: roadPos(j) + H }; };
    for (const id of G.waterSegs) R(segmentRect(segOf(id)), pal.water);
    for (const key of G.waterNodes) R(node(key), pal.water);
    for (const key of G.waterBlocks) { const [bx, bz] = key.split(',').map(Number); R(blockBounds(bx, bz), pal.water); }
    for (const id of G.highSegs) R(segmentRect(segOf(id)), pal.water);
    for (const id of G.bridgeSegs) R(segmentRect(segOf(id)), pal.bridge);
    for (const key of G.bridgeNodes) R(node(key), pal.bridge);
    // hẻm, cảnh quan (mảng màu)
    for (const ab of o.alleyBlocks || []) for (const r of ab.alleys) R(r, ab.walk ? pal.walk : pal.alley);
    for (const p of o.places) if (p.kind === 'scenery' && !far(p.door.x, p.door.z)) { g.globalAlpha = o.night ? 0.55 : 1; R(p, SCENERY_COLOR[lookOf(p)] || '#4f8a3a'); g.globalAlpha = 1; }
    // vùng khách chỉ biết khu vực
    if (o.zone) {
      g.fillStyle = 'rgba(155,89,182,.35)';
      g.strokeStyle = '#c39bd3';
      g.lineWidth = 2 / k;
      g.beginPath();
      g.arc(o.zone.x, o.zone.z, o.zone.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // tuyến phà (nét đứt qua sông)
    for (const [a, b] of o.ferryLines || []) {
      g.setLineDash([6 / k, 5 / k]);
      g.strokeStyle = '#1abc9c';
      g.lineWidth = 3 / k;
      g.beginPath();
      g.moveTo(a.x, a.z);
      g.lineTo(b.x, b.z);
      g.stroke();
      g.setLineDash([]);
    }
    // đường chỉ đường (nét đứt = đường đi thử của đơn đang mời / tới chỗ dựng xe)
    if (o.route && o.route.length > 1) {
      g.strokeStyle = o.routeColor || '#1e90ff';
      g.lineWidth = (o.routeDashed ? 4 : 6) / k;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      if (o.routeDashed) g.setLineDash([7 / k, 6 / k]);
      g.beginPath();
      o.route.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)));
      g.stroke();
      g.setLineDash([]);
    }
    // kẹt xe (vẽ sau cùng để đè lên đường chỉ đường)
    for (const s of o.jams || []) R(segmentRect(s), 'rgba(231,76,60,.9)');
    g.restore();
    // ---- chấm địa điểm (không xoay) ----
    const inside = (x, y, m) => Math.hypot(x - C, y - C) <= Rpx - m;
    for (const p of o.places) {
      if (p.kind === 'scenery' && !(p.activities || []).length) continue;
      if (far(p.door.x, p.door.z)) continue;
      const [x, y] = toScr(p.door);
      if (!inside(x, y, 4)) continue;
      g.globalAlpha = p.soon ? 0.35 : 1; // chưa khai trương
      g.fillStyle = GROUP_COLOR[placeGroup(p)] || '#2ecc71';
      g.beginPath();
      g.arc(x, y, 3.2, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    const badge = (x, y, icon, ring, r = 11, pulse = false) => {
      if (pulse) {
        g.fillStyle = 'rgba(243,156,18,.32)';
        g.beginPath();
        g.arc(x, y, r + 5 + 3 * Math.sin(performance.now() / 180), 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = ring;
      g.stroke();
      g.font = `${Math.round(r * 1.15)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText(icon, x, y + 1);
    };
    const tag = (text, x, y) => {
      g.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const w = g.measureText(text).width + 8;
      const lx = Math.max(w / 2 + 2, Math.min(S - w / 2 - 2, x));
      g.fillStyle = 'rgba(0,0,0,.75)';
      g.fillRect(lx - w / 2, y - 8, w, 15);
      g.fillStyle = '#fff';
      g.fillText(text, lx, y);
    };
    for (const m of o.markers || []) {
      const [x, y] = toScr(m);
      if (!inside(x, y, 8)) continue;
      badge(x, y, m.icon, m.ring, m.r || 11, m.pulse);
      if (m.label) tag(m.label, x, y + (m.r || 11) + 12);
    }
    // mưa: vệt chéo trôi xuống
    if (o.rain) {
      const t = (performance.now() / 40) % S;
      g.strokeStyle = 'rgba(200,220,255,.35)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < 70; i++) {
        const x = (i * 37) % S, y = ((i * 61) % S + t) % S;
        g.moveTo(x, y);
        g.lineTo(x - 3, y + 9);
      }
      g.stroke();
    }
    if (o.night) {
      g.fillStyle = 'rgba(10,15,40,.22)';
      g.fillRect(0, 0, S, S);
    }
    g.restore();
    // ---- viền, chữ chỉ hướng bắc, điểm đến ngoài vòng ghim trên viền ----
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.beginPath();
    g.arc(C, C, Rpx, 0, Math.PI * 2);
    g.stroke();
    const nx = C + Math.sin(th) * Rpx, ny = C - Math.cos(th) * Rpx;
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.arc(nx, ny, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(o.north || 'N', nx, ny + 1);
    if (o.edge) {
      const [x, y] = toScr(o.edge);
      if (!inside(x, y, 10)) {
        const a = Math.atan2(y - C, x - C), ex = C + Math.cos(a) * (Rpx - 2), ey = C + Math.sin(a) * (Rpx - 2);
        badge(ex, ey, o.edge.icon, o.edge.ring, 12);
        if (o.edge.label) tag(o.edge.label, ex + (ex < C - 4 ? 18 : ex > C + 4 ? -18 : 0), ey + (ey > C ? -26 : 22));
      }
    }
    // ---- mình: mũi tên (đi bộ: chấm tròn có mũi hướng) ----
    g.save();
    g.translate(C, C);
    g.fillStyle = o.walk ? '#27ae60' : '#2ecc71';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    if (o.walk) {
      g.arc(0, 0, 7, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(0, -14);
      g.lineTo(5, -6);
      g.lineTo(-5, -6);
      g.closePath();
    } else {
      g.moveTo(0, -12);
      g.lineTo(9, 9);
      g.lineTo(0, 4);
      g.lineTo(-9, 9);
      g.closePath();
    }
    g.fill();
    g.stroke();
    g.restore();
  }
}
