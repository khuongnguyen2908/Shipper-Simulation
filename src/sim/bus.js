// XE BUÝT (thuần dữ liệu, chạy được trong Node): tuyến, trạm dừng, lịch chạy, tính chuyến đi.
// Dữ liệu: map.json → busRoutes [{ id, name, color, buses, via: [mã địa điểm ghé theo thứ tự] }] + busStopNames { mã trạm: tên }
// (sửa ở thẻ 🗺️ Bản đồ → 🚌 Xe buýt) · số chung: balance.json → bus (thẻ ⚖️ Cân bằng → 🚌 Xe buýt).
// Lộ trình: đi qua đoạn đường trước cửa từng địa điểm ghé (cửa nằm bên phải chiều xe chạy), giữa 2 điểm ghé tìm đường ngắn
// (ưu tiên đại lộ, né đường nhỏ), khép thành vòng. Trạm: trước mỗi điểm ghé + cách vài đoạn đường một trạm.
// Lịch: các xe trên tuyến chạy cách đều nhau, tốc độ đều, dừng mỗi trạm `dwellMin` phút — dùng chung cho xe chạy trên đường
// và cho việc tính "chờ bao lâu, đi bao lâu" khi người chơi đi xe.
import { CITY, LOT_W, roadPos, neighbors, roadGraph } from './cityLayout.js';
import { tierBetween, TIER_GEO, roadSegAt } from './roads.js';
import { BUS } from '../data/balance.js';
import { MAP } from '../data/map.js';
import { STREETS_X, STREETS_Z } from '../data/places.js';
import { fmt } from '../content/index.js';
import { tod } from './clock.js';

const TIER_COST = { big: 0.85, normal: 1, small: 1.7 }; // đi đại lộ "rẻ" hơn → tuyến ưu tiên đường lớn
const FACE_N = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const key = (n) => `${n[0]},${n[1]}`;
const nodePos = (n) => ({ x: roadPos(n[0]), z: roadPos(n[1]) });
export const busRule = (k, def) => (Number.isFinite(BUS?.[k]) ? BUS[k] : def);

// đường ngắn nhất giữa 2 ngã tư (Dijkstra, chi phí theo cấp đường) → danh sách ngã tư (gồm 2 đầu), không có → null
function shortest(a, b, map) {
  if (key(a) === key(b)) return [a];
  const dist = new Map([[key(a), 0]]), prev = new Map(), done = new Set();
  const open = [a];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist.get(key(open[i])) < dist.get(key(open[bi]))) bi = i;
    const u = open.splice(bi, 1)[0], ku = key(u);
    if (done.has(ku)) continue;
    done.add(ku);
    if (ku === key(b)) break;
    for (const v of neighbors(u[0], u[1], map)) {
      const kv = key(v), d = dist.get(ku) + CITY.PITCH * TIER_COST[tierBetween(u, v, map)];
      if (!dist.has(kv) || d < dist.get(kv)) {
        dist.set(kv, d);
        prev.set(kv, u);
        open.push(v);
      }
    }
  }
  if (!prev.has(key(b))) return null;
  const path = [b];
  while (key(path[0]) !== key(a)) path.unshift(prev.get(key(path[0])));
  return path;
}

// Đoạn đường trước cửa địa điểm, đi theo chiều để cửa nằm bên phải: { A, B } (2 ngã tư), không tìm được → null.
// Cửa trúng ngã tư (lô gộp 2 khối như sân bay) thì dò lệch sang 2 bên dọc mặt tiền; bỏ đoạn là sông / đã gộp khối.
export function frontSegment(p, map = MAP) {
  const n = FACE_N[p.face] || [0, 1];
  const off = 1.4 + CITY.ROAD / 2;
  const G = roadGraph(map);
  let s = null;
  // đoạn đi được: không phải sông / khối gộp, và 2 ngã tư đầu đoạn nối được nhau (ngã tư sát sông không cầu thì không)
  const usable = (c) => {
    if (!c || G.waterSegs.has(c.id) || G.closedSegs.has(c.id)) return false;
    const a = c.axis === 'x' ? [c.line, c.from] : [c.from, c.line], b = c.axis === 'x' ? [c.line, c.from + 1] : [c.from + 1, c.line];
    return neighbors(a[0], a[1], map).some((q) => q[0] === b[0] && q[1] === b[1]);
  };
  for (const t of [0, 10, -10, 20, -20]) {
    const c = roadSegAt(p.door.x + n[0] * off - n[1] * t, p.door.z + n[1] * off + n[0] * t);
    if (usable(c)) { s = c; break; }
  }
  if (!s) return null;
  let A = s.axis === 'x' ? [s.line, s.from] : [s.from, s.line];
  let B = s.axis === 'x' ? [s.line, s.from + 1] : [s.from + 1, s.line];
  const dx = Math.sign(B[0] - A[0]), dz = Math.sign(B[1] - A[1]);
  const rx = -dz, rz = dx; // bên phải chiều chạy
  if ((-n[0]) * rx + (-n[1]) * rz < 0) [A, B] = [B, A]; // cửa phải ở bên phải
  return { A, B };
}

// Dựng mọi tuyến từ dữ liệu. doors: [{x, z}] cửa nhà để đặt trạm không chắn cửa.
// Trả về { routes: [...], stops: [...], byId } — tuyến lỗi có `error` (không chạy, không có trạm).
export function buildBusSystem(layout, map = MAP) {
  const doors = [...layout.places.map((p) => p.door), ...(layout.lots || []).map((l) => l.door)].filter(Boolean);
  const stopsByPos = new Map();
  const routes = [];
  const every = Math.max(1, Math.round(busRule('stopEvery', 2)));
  for (const R of map?.busRoutes || []) {
    const route = { id: R.id, name: R.name || R.id, color: R.color || '#1e8449', buses: Math.max(1, Math.min(6, Math.round(R.buses || 2))), via: R.via || [], nodes: [], pts: [], cum: [], length: 0, stops: [], error: null };
    routes.push(route);
    const vias = route.via.map((id) => layout.placeById[id]).filter(Boolean);
    if (vias.length < 2) { route.error = 'via'; continue; }
    const segs = vias.map((p) => frontSegment(p, map));
    if (segs.some((s) => !s)) { route.error = 'front'; continue; }
    // nối: B(k−1) → A(k) bằng đường ngắn, rồi đi đoạn trước cửa A(k) → B(k); khép vòng về A(0)
    const nodes = [segs[0].A];
    const viaSeg = new Set();
    let bad = false;
    for (let k = 0; k < segs.length && !bad; k++) {
      const cur = nodes[nodes.length - 1];
      const link = shortest(cur, segs[k].A, map);
      if (!link) { bad = true; break; }
      nodes.push(...link.slice(1));
      viaSeg.add(nodes.length - 1); // đoạn bắt đầu từ ngã tư này là đoạn trước cửa điểm ghé k
      nodes.push(segs[k].B);
    }
    const back = !bad && shortest(nodes[nodes.length - 1], segs[0].A, map);
    if (bad || !back) { route.error = 'path'; continue; }
    nodes.push(...back.slice(1));
    route.nodes = nodes; // vòng kín: phần tử cuối trùng phần tử đầu
    // đường đi của xe (lệch sang làn bên phải theo cấp đường từng đoạn) + quãng đường cộng dồn
    const pts = [], segStart = [];
    for (let k = 0; k < nodes.length - 1; k++) {
      const a = nodePos(nodes[k]), b = nodePos(nodes[k + 1]);
      const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z), lane = TIER_GEO[tierBetween(nodes[k], nodes[k + 1], map)].carLane;
      const rx = -dz * lane, rz = dx * lane;
      segStart.push(pts.length);
      pts.push({ x: a.x + rx + dx * 3, z: a.z + rz + dz * 3 }, { x: b.x + rx - dx * 3, z: b.z + rz - dz * 3 });
    }
    pts.push({ ...pts[0] });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    route.pts = pts;
    route.cum = cum;
    route.length = cum[cum.length - 1];
    // trạm: đoạn trước cửa điểm ghé + cách `every` đoạn một trạm (bên phải, trên vỉa hè khối bên phải)
    let last = -every;
    for (let k = 0; k < nodes.length - 1; k++) {
      const isVia = viaSeg.has(k);
      if (!isVia && k - last < every) continue;
      const st = placeStop(nodes[k], nodes[k + 1], doors);
      if (!st) continue;
      last = k;
      const along = Math.abs(st.along); // m tính từ ngã tư đầu đoạn
      const s = cum[segStart[k]] + Math.max(0, along - 3);
      let stop = stopsByPos.get(st.id);
      if (!stop) {
        stop = { id: st.id, x: st.x, z: st.z, ry: st.ry, wait: st.wait, axis: st.axis, line: st.line, routes: [] };
        stopsByPos.set(st.id, stop);
      }
      if (!stop.routes.some((r) => r.id === route.id)) {
        stop.routes.push({ id: route.id, s });
        route.stops.push({ id: stop.id, s });
      }
    }
    route.stops.sort((a, b) => a.s - b.s);
    if (!route.stops.length) route.error = 'stops';
  }
  // tên trạm: tên người dùng đặt, không thì theo địa điểm gần (≤ 45 m), không có thì theo tên đường
  const stops = [...stopsByPos.values()];
  for (const st of stops) {
    const own = map?.busStopNames?.[st.id];
    let best = null, bd = 45;
    for (const p of layout.places) {
      if (!p.door) continue;
      const d = Math.hypot(p.door.x - st.x, p.door.z - st.z);
      if (d < bd) { bd = d; best = p; }
    }
    const street = (st.axis === 'x' ? STREETS_X : STREETS_Z)[st.line] || '';
    st.autoName = best ? fmt('bus.stopNear', { place: best.name }) : fmt('bus.stopStreet', { street });
    st.name = own && String(own).trim() ? String(own).trim() : st.autoName;
  }
  const byId = Object.fromEntries(stops.map((s) => [s.id, s]));
  for (const r of routes) r.timetable = timetable(r);
  return { routes, stops, byId, routeById: Object.fromEntries(routes.map((r) => [r.id, r])) };
}

// Đặt trạm trên đoạn a → b: vỉa hè khối bên phải, ở ranh giữa 2 lô (cách xa cửa nhà nhất), quay mặt ra đường
function placeStop(a, b, doors) {
  const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]);
  const rx = -dz, rz = dx;
  const axis = dx === 0 ? 'x' : 'z', line = axis === 'x' ? a[0] : a[1];
  const from = axis === 'x' ? Math.min(a[1], b[1]) : Math.min(a[0], b[0]);
  // khối bên phải phải có thật (không phải mép bản đồ / sông)
  const bx = axis === 'x' ? line - (rx < 0 ? 1 : 0) : from, bz = axis === 'z' ? line - (rz < 0 ? 1 : 0) : from;
  if (bx < 0 || bz < 0 || bx >= CITY.N || bz >= CITY.N) return null;
  const c = roadPos(line), a0 = roadPos(from) + CITY.ROAD / 2; // đầu khối theo chiều dọc đường
  const cands = [1, 2].map((k) => a0 + CITY.SW + k * LOT_W);
  const lat = c + (axis === 'x' ? rx : rz) * (CITY.ROAD / 2 + 1.0);
  const at = (al) => (axis === 'x' ? { x: lat, z: al } : { x: al, z: lat });
  let pick = cands[0], best = -1;
  const tryAt = (al) => {
    const p = at(al);
    const d = Math.min(...doors.map((q) => Math.hypot(q.x - p.x, q.z - p.z)), 99);
    if (d > best) { best = d; pick = al; }
  };
  for (const al of cands) tryAt(al);
  // 2 chỗ quen đều sát cửa nhà → thử thêm vài chỗ dọc khối (mã trạm của 2 chỗ quen giữ nguyên)
  if (best < 2.5) for (const k of [1.5, 0.5, 2.5, 0.75, 2.25]) cands.push(a0 + CITY.SW + k * LOT_W), tryAt(cands[cands.length - 1]);
  const p = at(pick);
  const start = axis === 'x' ? roadPos(a[1]) : roadPos(a[0]);
  const ry = Math.atan2(-rx, -rz); // mặt trước nhà chờ quay ra đường
  // chỗ người đứng chờ: trước mái che, sát mép đường
  const wait = { x: p.x - rx * 0.6, z: p.z - rz * 0.6 };
  return { id: `${axis}${line}:${from}${rx + rz > 0 ? '+' : '-'}${cands.indexOf(pick) + 1}`, x: p.x, z: p.z, ry, wait, along: pick - start, axis, line };
}

// Lịch một vòng: mỗi trạm (theo thứ tự) có giờ tới / giờ đi tính từ đầu vòng (phút)
function timetable(r) {
  if (r.error) return null;
  const v = busRule('speed', 7.5), dwell = busRule('dwellMin', 1);
  const t = r.stops.map((st, m) => {
    const arrive = st.s / v + m * dwell;
    return { id: st.id, s: st.s, arrive, depart: arrive + dwell };
  });
  return { stops: t, lap: r.length / v + r.stops.length * dwell, v, dwell };
}
const mod = (a, n) => ((a % n) + n) % n;
// pha (phút trong vòng) của xe số b lúc `now`
const phaseOf = (r, b, now) => mod(now + (b * r.timetable.lap) / r.buses, r.timetable.lap);

// Xe chạy được giờ này không (balance.json → bus.from / to, giờ trong ngày)
export function inService(now) {
  const h = tod(now) / 60;
  return h >= busRule('from', 5) && h < busRule('to', 21);
}

// Vị trí các xe của tuyến lúc `now`: [{ x, z, heading, stopped }]
export function busPoses(r, now) {
  if (r.error || !r.timetable) return [];
  const T = r.timetable, out = [];
  for (let b = 0; b < r.buses; b++) {
    const u = phaseOf(r, b, now);
    let s = 0, stopped = false;
    let prevDepart = 0, prevS = 0;
    for (const st of T.stops) {
      if (u < st.arrive) break;
      if (u <= st.depart) { stopped = true; prevS = st.s; break; }
      prevDepart = st.depart;
      prevS = st.s;
    }
    s = stopped ? prevS : prevS + (u - prevDepart) * T.v;
    out.push({ ...pointAt(r, Math.min(s, r.length - 0.01)), stopped });
  }
  return out;
}
// điểm + hướng trên đường đi theo quãng đường s
export function pointAt(r, s) {
  const { pts, cum } = r;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], L = cum[i] - cum[i - 1] || 1, t = Math.max(0, Math.min(1, (s - cum[i - 1]) / L));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.x - a.x, b.z - a.z) };
}

// Chuyến đi từ trạm `fromId` tới trạm `toId` trên tuyến r, đứng chờ từ `now`:
// { wait, ride, total, board, arrive } (phút) — null nếu tuyến không qua 2 trạm này
export function tripOn(r, fromId, toId, now) {
  if (r.error || !r.timetable || fromId === toId) return null;
  const T = r.timetable;
  const A = T.stops.find((s) => s.id === fromId), B = T.stops.find((s) => s.id === toId);
  if (!A || !B) return null;
  let wait = Infinity;
  for (let b = 0; b < r.buses; b++) {
    const u = phaseOf(r, b, now);
    const w = u >= A.arrive && u <= A.depart ? 0 : mod(A.arrive - u, T.lap); // xe đang đỗ ở trạm → lên luôn
    wait = Math.min(wait, w);
  }
  const ride = mod(B.arrive - A.depart, T.lap) + T.dwell; // đi theo chiều tuyến (vòng), không quay đầu
  const board = now + wait;
  return { wait, ride, total: wait + ride, board, arrive: board + ride };
}

// Các trạm đi tới được từ trạm `fromId` (mọi tuyến qua trạm này), mỗi trạm lấy tuyến tới sớm nhất
export function destinations(sys, fromId, now) {
  const from = sys.byId[fromId];
  if (!from) return [];
  const best = new Map();
  for (const ref of from.routes) {
    const r = sys.routeById[ref.id];
    for (const st of r.stops) {
      const trip = tripOn(r, fromId, st.id, now);
      if (!trip) continue;
      const cur = best.get(st.id);
      if (!cur || trip.arrive < cur.trip.arrive) best.set(st.id, { stop: sys.byId[st.id], route: r, trip });
    }
  }
  return [...best.values()].sort((a, b) => a.trip.arrive - b.trip.arrive);
}

// Các trạm của MỘT tuyến theo thứ tự xe chạy tới, tính từ trạm `fromId` (hộp thoại ở trạm chia theo tuyến):
// [{ stop, route, trip }] — mỗi tên trạm 1 lần (2 trạm cùng tên ở 2 bên đường → giữ trạm tới sớm hơn),
// bỏ trạm đang đứng và trạm cùng tên với nó
export function routeDestinations(sys, routeId, fromId, now) {
  const r = sys?.routeById?.[routeId];
  if (!r || r.error) return [];
  const i = r.stops.findIndex((s) => s.id === fromId);
  if (i < 0) return [];
  const out = [], seen = new Set([sys.byId[fromId]?.name]);
  for (let k = 1; k < r.stops.length; k++) {
    const st = r.stops[(i + k) % r.stops.length];
    const name = sys.byId[st.id]?.name;
    if (st.id === fromId || seen.has(name)) continue;
    seen.add(name);
    const trip = tripOn(r, fromId, st.id, now);
    if (trip) out.push({ stop: sys.byId[st.id], route: r, trip });
  }
  return out;
}

// Trạm gần điểm (x, z) nhất (trong maxD m), hoặc null
export function nearestStop(sys, x, z, maxD = Infinity) {
  let best = null, bd = maxD;
  for (const st of sys?.stops || []) {
    const d = Math.hypot(st.wait.x - x, st.wait.z - z);
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}
// Kế hoạch đi xe buýt từ điểm a tới điểm b: đi bộ ra trạm → 1 tuyến (hoặc đổi tuyến 1 lần) → đi bộ tới nơi.
// Xét 4 trạm gần a × 4 trạm gần b; đổi tuyến ở trạm chung 2 tuyến hoặc 2 trạm cách nhau ≤ XFER_M m.
// Lấy cách tới sớm nhất (tính cả giờ chờ xe theo lịch). dist(p, q): quãng đường đi bộ thật (cityLayout.routeDist) · walk: m đi bộ mỗi phút game.
// prefer: mã trạm lên đã gợi ý lần trước → giữ trạm đó nếu chỉ chậm hơn cách tốt nhất ≤ STICK_MIN phút (mũi tên không nhảy qua lại).
// → { legs: [{ from, to, route, trip }], from, to, route (chặng đầu), walk1, walkX, walk2, minutes }
//   null nếu ngoài giờ xe chạy / không cách nào / đi bộ thẳng còn nhanh hơn
const XFER_M = 60;
const STICK_MIN = 3;
export function busPlan(sys, a, b, now, dist, walk = 3.4, prefer = null) {
  if (!sys?.stops?.length || !inService(now)) return null;
  const near = (p) => [...sys.stops].sort((s, t) => Math.hypot(s.wait.x - p.x, s.wait.z - p.z) - Math.hypot(t.wait.x - p.x, t.wait.z - p.z)).slice(0, 4);
  const onRoute = (st, id) => st.routes.some((r) => r.id === id);
  // chỗ đổi tuyến r1 → r2: [{ x1 (trạm xuống của r1), x2 (trạm lên của r2), m (đi bộ giữa 2 trạm) }], tính 1 lần rồi nhớ
  sys.xfer = sys.xfer || new Map();
  const xferOf = (r1, r2) => {
    const key = `${r1.id}>${r2.id}`;
    if (!sys.xfer.has(key)) {
      const out = [];
      for (const s1 of r1.stops) for (const s2 of r2.stops) {
        const x1 = sys.byId[s1.id], x2 = sys.byId[s2.id];
        if (Math.hypot(x1.wait.x - x2.wait.x, x1.wait.z - x2.wait.z) > XFER_M) continue;
        const m = x1 === x2 ? 0 : dist(x1.wait, x2.wait);
        if (m <= XFER_M) out.push({ x1, x2, m });
      }
      sys.xfer.set(key, out);
    }
    return sys.xfer.get(key);
  };
  let best = null, kept = null;
  const consider = (p) => {
    if (!best || p.minutes < best.minutes) best = p;
    if (p.legs[0].from.id === prefer && (!kept || p.minutes < kept.minutes)) kept = p;
  };
  const ends = near(b).map((e) => ({ e, walk2: dist(e.wait, b) }));
  for (const s of near(a)) {
    const walk1 = dist(a, s.wait), t0 = now + walk1 / walk;
    for (const ref of s.routes) {
      const r1 = sys.routeById[ref.id];
      for (const { e, walk2 } of ends) {
        if (onRoute(e, r1.id)) {
          const trip = tripOn(r1, s.id, e.id, t0);
          if (trip) consider({ legs: [{ from: s, to: e, route: r1, trip }], walk1, walkX: 0, walk2, minutes: walk1 / walk + trip.total + walk2 / walk });
          continue;
        }
        // đổi tuyến 1 lần
        for (const ref2 of e.routes) {
          const r2 = sys.routeById[ref2.id];
          if (r2 === r1) continue;
          for (const { x1, x2, m } of xferOf(r1, r2)) {
            const trip1 = tripOn(r1, s.id, x1.id, t0);
            if (!trip1) continue;
            const trip2 = tripOn(r2, x2.id, e.id, t0 + trip1.total + m / walk);
            if (!trip2) continue;
            consider({ legs: [{ from: s, to: x1, route: r1, trip: trip1 }, { from: x2, to: e, route: r2, trip: trip2 }], walk1, walkX: m, walk2,
              minutes: walk1 / walk + trip1.total + m / walk + trip2.total + walk2 / walk });
          }
        }
      }
    }
  }
  if (kept && kept.minutes <= best.minutes + STICK_MIN) best = kept;
  if (!best || best.minutes >= (dist(a, b) / walk) * 0.8) return null; // nhanh hơn đi bộ thẳng ít nhất 20% mới đáng
  return { ...best, from: best.legs[0].from, to: best.legs[0].to, route: best.legs[0].route };
}

// Gợi ý đi buýt từ chỗ người chơi tới gần điểm (tx, tz): { from, to, route } hoặc null (không có tuyến nào nối)
export function busHint(sys, px, pz, tx, tz) {
  if (!sys?.stops?.length) return null;
  const byDist = (x, z) => [...sys.stops].sort((a, b) => Math.hypot(a.wait.x - x, a.wait.z - z) - Math.hypot(b.wait.x - x, b.wait.z - z));
  const starts = byDist(px, pz).slice(0, 3), ends = byDist(tx, tz).slice(0, 3);
  for (const a of starts) for (const b of ends) {
    if (a.id === b.id) continue;
    const r = a.routes.find((ra) => b.routes.some((rb) => rb.id === ra.id));
    if (r) return { from: a, to: b, route: sys.routeById[r.id] };
  }
  return null;
}
