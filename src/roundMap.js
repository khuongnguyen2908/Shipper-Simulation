// BẢN ĐỒ TRÒN góc màn hình: gom dữ liệu từ game (đơn, chỉ đường, CSGT, kẹt xe, phà, xe đang dựng…)
// → hình vẽ cho MiniMap.drawRound + dòng chữ trên vòng (rẽ kế tiếp / cảnh báo) + tên đường dưới vòng.
// Bản đồ cả thành phố chỉ có trong điện thoại.
import { navRoute, streetAt } from './sim/cityLayout.js';
import { nextTurn, routeLen, alongRoute, jamOnRoute, fmtDist } from './sim/nav.js';
import { nextBoat, ferryOpen, ferryRule } from './sim/ferry.js';
import { S } from './sim/OrderManager.js';
import { ICON } from './ui/minimap.js';
import { fmt } from './content/index.js';
import { fmtK } from './sim/economy.js';

const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const NAV = '#1e90ff'; // màu đường chỉ đường
const PICKUP_STATES = [S.TO_PICKUP, S.WAITING_FOOD, S.OUT_OF_STOCK, S.PACKING, S.RETURNING];
const WARN_AHEAD = 120; // CSGT / kẹt xe trên đường đi trong khoảng này (m game, ~1,2 km hiển thị) thì báo trước

// Tính lại đường khi đổi đích hoặc đã đi xa chỗ tính lần trước (đỡ tốn công mỗi khung hình)
function route(game, slot, from, to) {
  const box = (game.mmRoutes ||= {});
  const key = `${to.x.toFixed(1)},${to.z.toFixed(1)}`;
  const c = box[slot];
  if (!c || c.key !== key || d2(c.from, from) > 3) box[slot] = { key, from: { x: from.x, z: from.z }, pts: navRoute(from, to) };
  return [{ x: from.x, z: from.z }, ...box[slot].pts.slice(1)];
}

const placeIcon = (p, ride) => (ride ? '🙋' : p?.icon || ICON[p?.kind] || '📦');

// Biểu tượng + tên ngắn + nhãn "ở đây" của điểm đến hiện tại
function targetInfo(game, tgt) {
  const { om } = game, o = om.order;
  if (o && PICKUP_STATES.includes(om.state)) return { icon: placeIcon(o.pickup, o.kind === 'ride'), name: o.pickup.name || '', here: om.state === S.RETURNING ? '' : fmt('mm.herePickup') };
  if (o) return { icon: '🏁', name: o.dropoff.address || '', here: fmt('mm.hereDrop') };
  if (d2(tgt, game.bike.pos) < 0.5) return { icon: '🛵', name: '' };
  const p = game.layout.places.find((q) => q.door && d2(q.door, tgt) < 0.5);
  return p ? { icon: p.icon || ICON[p.kind] || '📍', name: p.name } : { icon: '📍', name: '' };
}

export function roundMapData(game, tgt, dt) {
  const { om } = game, now = game.clockMin;
  const pp = game.playerPos, at = { x: pp.x, z: pp.z };
  const walk = game.mode === 'foot';
  const base = game.mapData(tgt); // địa điểm, CSGT đã biết, kẹt xe, xe đang dựng, hẻm
  const markers = [];
  let path = null, dashed = false, color = NAV, edge = null, zone = null, chip = '';
  game.navPath = null; // đường chỉ tới điểm đến hiện tại (bản đồ lớn trong điện thoại vẽ lại)
  // phóng xa khi chạy nhanh, gần khi đi bộ / sắp tới nơi
  let want = walk ? 60 : 140 + Math.min(45, Math.abs(game.bike.speed) * 2.5);

  // tiện ích gần nhất luôn có biểu tượng: cây xăng, tiệm sửa xe, nhà trọ, CSGT đã biết, xe đang dựng
  const nearest = (kind) => base.places.filter((p) => p.kind === kind && !p.soon && p.door).sort((a, b) => d2(at, a.door) - d2(at, b.door))[0];
  const gas = nearest('gas'), fix = nearest('garage'), home = game.layout.placeById.home;
  if (gas) markers.push({ ...gas.door, icon: '⛽', ring: '#e74c3c', r: 10 });
  if (fix) markers.push({ ...fix.door, icon: '🔧', ring: '#e74c3c', r: 10 });
  if (home) markers.push({ ...home.door, icon: '🏠', ring: '#7f8c8d', r: 10 });
  for (const p of base.police) markers.push({ ...p, icon: '👮', ring: '#2c3e50', r: 11 });
  if (base.bike) markers.push({ ...base.bike, icon: '🛵', ring: '#5dade2', r: 11 });

  // bến phà ở gần: 2 bến + tuyến nét đứt qua sông; đứng gần bến thì báo chuyến sau
  const ferryLines = [];
  let ferryChip = '', ferryClose = false;
  for (const pr of game.ferries?.pairs || []) {
    const da = d2(at, pr.a.door), db = d2(at, pr.b.door);
    if (Math.min(da, db) > want * 1.6) continue;
    ferryLines.push([pr.a.edge, pr.b.edge]);
    markers.push({ ...pr.a.door, icon: '⛴', ring: '#16a085', r: 11 }, { ...pr.b.door, icon: '⛴', ring: '#16a085', r: 11 });
    const [side, d, pier] = da < db ? ['a', da, pr.a] : ['b', db, pr.b];
    if (d > 90 || ferryChip) continue;
    ferryClose = d < 30; // đứng sát bến: giờ phà quan trọng hơn chỉ đường thường
    const p = { name: pier.name, dist: fmtDist(d) };
    if (!ferryOpen(now)) ferryChip = fmt('mm.ferryClosed', { ...p, h: ferryRule('from', 5) });
    else {
      const nb = nextBoat(side, now);
      ferryChip = nb.wait <= 0 ? fmt('mm.ferryNow', p) : fmt('mm.ferryWait', { ...p, min: Math.ceil(nb.wait) });
    }
  }

  const offer = om.state === S.OFFERED && om.offer;
  if (offer && offer.pickup?.door) {
    // đơn đang mời: quán nhấp nháy + đường đi thử nét đứt cam
    const door = offer.pickup.door, icon = placeIcon(offer.pickup, offer.kind === 'ride');
    path = route(game, 'offer', at, door);
    dashed = true;
    color = '#f39c12';
    const len = routeLen(path);
    markers.push({ ...door, icon, ring: '#f39c12', r: 12, pulse: true });
    edge = { ...door, icon, ring: '#f39c12', label: fmtDist(len) };
    chip = fmt('mm.offer', { pay: fmtK(offer.estPay), place: offer.pickup.name, dist: fmtDist(len) });
  } else if (tgt && tgt.zone) {
    // khách chỉ biết khu vực: vùng tím, ghim ❓ ở giữa vùng
    zone = tgt.zone;
    const d = Math.max(0, d2(at, zone) - zone.r);
    markers.push({ x: zone.x, z: zone.z, icon: '❓', ring: '#9b59b6', r: 12 });
    edge = { x: zone.x, z: zone.z, icon: '❓', ring: '#9b59b6', label: fmtDist(d) };
    chip = fmt('mm.zone', { dist: fmtDist(d) });
  } else if (tgt && tgt.x != null) {
    const info = targetInfo(game, tgt), ring = tgt.color || '#2ecc71';
    path = route(game, 'nav', at, tgt);
    game.navPath = path;
    const len = routeLen(path), straight = d2(at, tgt);
    if (straight < 60) want = Math.min(want, 60);
    const arriving = straight < 25;
    markers.push({ x: tgt.x, z: tgt.z, icon: info.icon, ring, r: 13, label: arriving ? info.here : '' });
    edge = { x: tgt.x, z: tgt.z, icon: info.icon, ring, label: fmtDist(len) };
    // cảnh báo trên đường đi: chốt CSGT đã biết, đoạn kẹt xe
    const warn = [];
    const cop = base.police.map((p) => alongRoute(path, p, 8)).filter((a) => a != null).sort((a, b) => a - b)[0];
    if (cop != null && cop < WARN_AHEAD) warn.push(fmt('mm.police', { dist: fmtDist(cop) }));
    const jam = jamOnRoute(path, base.jams);
    if (jam && jam.dist < WARN_AHEAD) warn.push(fmt('mm.jam', { dist: fmtDist(jam.dist) }));
    if (arriving) chip = info.name ? fmt('mm.arrive', { name: info.name }) : '';
    else if (warn.length) chip = fmt('mm.warn', { list: warn.join(' · ') });
    else {
      const t = nextTurn(path, 4, undefined, walk ? null : game.bike.heading);
      const turn = !t ? fmt('mm.straight') : t.dir === 'back' ? fmt('mm.uturn') : fmt(t.dir === 'left' ? 'mm.turnLeft' : 'mm.turnRight', { dist: fmtDist(t.dist) });
      chip = ferryClose ? ferryChip : fmt('mm.nav', { turn, name: info.name, dist: fmtDist(len) });
    }
  } else if (walk && base.bike && d2(at, base.bike) > 8) {
    // đi bộ, không có việc gì: nét đứt về chỗ dựng xe
    path = [at, { x: base.bike.x, z: base.bike.z }];
    dashed = true;
    color = '#5dade2';
    chip = fmt('mm.bike', { dist: fmtDist(d2(at, base.bike)) });
  }
  if (!chip) chip = ferryChip || (base.raining ? fmt('mm.rain') : '');

  game.mmR = game.mmR == null ? want : game.mmR + (want - game.mmR) * Math.min(1, dt * 2.5);
  return {
    draw: {
      at, heading: walk ? game.walker.heading : game.bike.heading, radius: game.mmR, walk,
      night: (game.nightLevel || 0) > 0.5, rain: base.raining,
      places: base.places, alleyBlocks: base.alleyBlocks, jams: base.jams, zone,
      route: path, routeDashed: dashed, routeColor: color, ferryLines, markers, edge, north: fmt('mm.north'),
    },
    chip: chip.replace(/\s{2,}/g, ' ').trim(),
    street: streetAt(at.x, at.z),
  };
}
