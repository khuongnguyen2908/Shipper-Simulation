// Hình học thành phố dạng dữ liệu thuần (không phụ thuộc Three.js) —
// dùng chung cho phần dựng hình 3D và phần mô phỏng/bộ thử.
import { STREETS_X, STREETS_Z, PLACES, ALLEY, isPlaced } from '../data/places.js';
import { MAP } from '../data/map.js';
import { fmt } from '../content/index.js';
import { planBlock, ALLEY_TEMPLATES } from './blockPlan.js';

// Lưới N × N khối (N lấy từ map.json), mỗi khối 40 m, đường 12 m; tâm bản đồ ở (0, 0)
const N = Number.isInteger(MAP.size) && MAP.size >= 3 ? MAP.size : 8;
export const CITY = { N, PITCH: 52, ROAD: 12, SW: 3, ORIGIN: -(N * 52) / 2, BLOCK: 40 };
export const LOT_W = (CITY.BLOCK - 2 * CITY.SW) / 3;
export const HALF = -CITY.ORIGIN + CITY.ROAD / 2; // biên bản đồ: |x|,|z| ≤ HALF (8 khối: 214 m)
export const LOT_IDS = ['N0', 'N1', 'N2', 'S0', 'S1', 'S2', 'E1', 'W1'];

// Mỗi khối chia 3×3 ô:   N0 | N1 | N2   ← dãy bắc
//                         W1 | C  | E1   ← giữa (C = sân trong hẻm)
//                         S0 | S1 | S2   ← dãy nam
// Lô nhiều ô (tòa nhà lớn) = danh sách các lô đơn bên trong. Mặt tiền = chữ cái đầu (N/S/W/E).
export const MULTI_LOTS = {
  N01: ['N0', 'N1'], N12: ['N1', 'N2'], S01: ['S0', 'S1'], S12: ['S1', 'S2'], // 2 lô ngang
  W01: ['N0', 'W1'], W12: ['W1', 'S0'], E01: ['N2', 'E1'], E12: ['E1', 'S2'], // 2 lô dọc (mặt tiền tây/đông)
  N: ['N0', 'N1', 'N2'], S: ['S0', 'S1', 'S2'], // cả dãy
  W: ['N0', 'W1', 'S0'], E: ['N2', 'E1', 'S2'], // cả cột
  B: ['N0', 'N1', 'N2', 'W1', 'C', 'E1', 'S0', 'S1', 'S2'], // cả khối (chỉ cảnh quan: công viên lớn…)
};
// Kích thước → các lô cùng cỡ
export const LOT_SIZES = { one: LOT_IDS, two: ['N01', 'N12', 'S01', 'S12'], vtwo: ['W01', 'W12', 'E01', 'E12'], row: ['N', 'S'], col: ['W', 'E'], block: ['B'] };
export const lotParts = (lot) => MULTI_LOTS[lot] || [lot];
export const lotSize = (lot) => Object.keys(LOT_SIZES).find((k) => LOT_SIZES[k].includes(lot)) || null;
const CELL = { N0: [0, 0], N1: [1, 0], N2: [2, 0], W1: [0, 1], C: [1, 1], E1: [2, 1], S0: [0, 2], S1: [1, 2], S2: [2, 2] };
// hướng mặt tiền mặc định theo lô (cả khối 'B' → quay ra đường phía bắc)
const defaultFace = (lot) => (lot === 'B' ? 'N' : lot[0]);

// Các hướng mặt tiền chọn được: những cạnh của lô chạm ra đường. Hướng mặc định (theo lô) đứng đầu.
export function lotFaces(lot) {
  const cells = lotParts(lot).map((id) => CELL[id]);
  if (lot === 'C' || !cells.length || !cells.every(Boolean)) return ['E'];
  const out = [defaultFace(lot)];
  const touch = { N: cells.some((c) => c[1] === 0), E: cells.some((c) => c[0] === 2), S: cells.some((c) => c[1] === 2), W: cells.some((c) => c[0] === 0) };
  for (const f of ['N', 'E', 'S', 'W']) if (touch[f] && !out.includes(f)) out.push(f);
  return out;
}

export const roadPos = (i) => CITY.ORIGIN + i * CITY.PITCH;

export function blockBounds(bx, bz) {
  const x0 = roadPos(bx) + CITY.ROAD / 2;
  const z0 = roadPos(bz) + CITY.ROAD / 2;
  return { x0, z0, x1: x0 + CITY.BLOCK, z1: z0 + CITY.BLOCK };
}

// Trả về khối (bx,bz) nếu điểm nằm trên vỉa hè/khối nhà, ngược lại null (đang ở lòng đường)
export function blockAt(x, z) {
  const off = CITY.ORIGIN + CITY.ROAD / 2;
  const bx = Math.floor((x - off) / CITY.PITCH);
  const bz = Math.floor((z - off) / CITY.PITCH);
  if (bx < 0 || bz < 0 || bx >= CITY.N || bz >= CITY.N) return null;
  const lx = x - off - bx * CITY.PITCH;
  const lz = z - off - bz * CITY.PITCH;
  if (lx < 0 || lz < 0 || lx > CITY.BLOCK || lz > CITY.BLOCK) return null;
  return [bx, bz];
}

// ---------- khối có hẻm (map.json → blocks) ----------
// Kiểu hẻm của khối, hoặc null (khối thường: 8 lô quanh mép + sân giữa như cũ)
export function blockSpec(bx, bz, map = MAP) {
  const s = map && map.blocks && map.blocks[`${bx},${bz}`];
  return s && ALLEY_TEMPLATES[s.alley] ? s : null;
}
const planCache = new Map();
// Mặt bằng khối có hẻm (toạ độ cục bộ, xem blockPlan.js) — cố định theo toạ độ khối + kiểu hẻm
export function blockPlan(bx, bz, map = MAP) {
  const s = blockSpec(bx, bz, map);
  if (!s) return null;
  const k = `${bx},${bz},${s.alley},${s.rot | 0},${!!s.walk}`;
  if (!planCache.has(k)) planCache.set(k, planBlock(s, ((bx + 1) * 73856093) ^ ((bz + 1) * 19349663)));
  return planCache.get(k);
}
// Đổi hình chữ nhật cục bộ (u, v) của khối sang toạ độ thế giới
export function blockRect(bx, bz, r) {
  const b = blockBounds(bx, bz);
  const ax = b.x0 + CITY.SW, az = b.z0 + CITY.SW;
  return { x0: ax + r.u0, x1: ax + r.u1, z0: az + r.v0, z1: az + r.v1 };
}
// Mã lô có cửa (khách / địa điểm đặt được) của một khối
export function blockLotIds(bx, bz, map = MAP) {
  const p = blockPlan(bx, bz, map);
  return p ? p.lots.map((l) => l.id) : LOT_IDS;
}
const ORDER_FACES = ['N', 'W', 'E', 'S'];
// Số nhà theo vị trí dọc con đường (lẻ: phía bắc/tây của đường; chẵn: phía nam/đông)
const houseNumber = (along, face) => Math.round((along - CITY.ORIGIN) / 5) * 2 + (face === 'N' || face === 'W' ? 1 : 2);
const streetOf = (bx, bz, face) => (face === 'N' ? STREETS_Z[bz] : face === 'S' ? STREETS_Z[bz + 1] : face === 'W' ? STREETS_X[bx] : STREETS_X[bx + 1]);
// Điểm trên vỉa hè trước cạnh `face` của khối, tại vị trí dọc cạnh `at` (toạ độ thế giới)
function sidewalkDoor(b, face, at) {
  if (face === 'N') return { x: at, z: b.z0 + 1.4 };
  if (face === 'S') return { x: at, z: b.z1 - 1.4 };
  if (face === 'E') return { x: b.x1 - 1.4, z: at };
  return { x: b.x0 + 1.4, z: at };
}

// Lô trong khối có hẻm → toạ độ, cửa, địa chỉ. Nhà trong hẻm: địa chỉ "số hẻm/số nhà đường", có miệng hẻm (mouthDoor)
function alleyLotInfo(bx, bz, plan, l) {
  const b = blockBounds(bx, bz);
  const r = blockRect(bx, bz, l);
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  // miệng hẻm chính (ưu tiên phía bắc, tây, đông, nam) → số hẻm theo đường ở đó
  const m = [...plan.mouths].sort((a, c) => ORDER_FACES.indexOf(a.face) - ORDER_FACES.indexOf(c.face))[0];
  const mw = blockRect(bx, bz, { u0: m.u, u1: m.u, v0: m.v, v1: m.v });
  const mouthAlong = m.face === 'N' || m.face === 'S' ? mw.x0 : mw.z0;
  const mouthDoor = sidewalkDoor(b, m.face, mouthAlong);
  const mouthStreet = streetOf(bx, bz, m.face);
  const mouthNo = houseNumber(mouthAlong, m.face);
  if (l.front) {
    const along = l.face === 'N' || l.face === 'S' ? cx : cz;
    const street = streetOf(bx, bz, l.face);
    const number = houseNumber(along, l.face);
    return { ...r, cx, cz, face: l.face, door: sidewalkDoor(b, l.face, along), street, number, address: fmt('addr.house', { number, street }), inAlley: false, walkOnly: false };
  }
  // nhà trong hẻm: cửa ra hẻm (cách mặt nhà 0,7 m). Cửa mang theo miệng hẻm + quãng đi trong hẻm để tính đường (routeDist)
  const door = l.face === 'E' ? { x: r.x1 + 0.7, z: cz } : l.face === 'W' ? { x: r.x0 - 0.7, z: cz } : l.face === 'S' ? { x: cx, z: r.z1 + 0.7 } : { x: cx, z: r.z0 - 0.7 };
  const inner = Math.abs(door.x - mouthDoor.x) + Math.abs(door.z - mouthDoor.z);
  door.mouth = mouthDoor;
  door.inner = inner;
  const n = plan.lots.filter((x) => !x.front).indexOf(l) + 1;
  return {
    ...r, cx, cz, face: l.face, door, street: mouthStreet, number: mouthNo, houseNo: n,
    address: fmt('addr.alleyHouse', { mouth: mouthNo, n, street: mouthStreet }),
    inAlley: true, walkOnly: plan.walk, mouthDoor, inner,
  };
}

// face: hướng mặt tiền người dùng chọn (không hợp lệ hoặc bỏ trống → theo lô) · map: dữ liệu bản đồ (công cụ truyền bản đang sửa)
export function lotInfo(bx, bz, lot, wantFace = null, map = MAP) {
  const plan = blockPlan(bx, bz, map);
  if (plan) {
    const l = plan.lots.find((x) => x.id === lot);
    if (l) return alleyLotInfo(bx, bz, plan, l);
  }
  const b = blockBounds(bx, bz);
  const ax = b.x0 + CITY.SW, az = b.z0 + CITY.SW, W = LOT_W;
  let r, face = defaultFace(lot);
  const cells = lotParts(lot).map((id) => CELL[id]);
  if (lot !== 'C' && cells.length && cells.every(Boolean)) {
    // khung bao các ô của lô (1 ô, 2 ô ngang, cả dãy, cả cột)
    const cs = cells.map((c) => c[0]), rs = cells.map((c) => c[1]);
    r = { x0: ax + Math.min(...cs) * W, x1: ax + (Math.max(...cs) + 1) * W, z0: az + Math.min(...rs) * W, z1: az + (Math.max(...rs) + 1) * W };
    if (wantFace && lotFaces(lot).includes(wantFace)) face = wantFace;
  } else { r = { x0: ax + W, x1: ax + 1.5 * W, z0: az + W + 1, z1: az + 2 * W - 1 }; face = 'E'; } // 'C' sân giữa
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  let door;
  if (lot === 'C') door = { x: r.x1 + 1.6, z: cz };
  else if (face === 'N') door = { x: cx, z: b.z0 + 1.4 };
  else if (face === 'S') door = { x: cx, z: b.z1 - 1.4 };
  else if (face === 'E') door = { x: b.x1 - 1.4, z: cz };
  else door = { x: b.x0 + 1.4, z: cz };
  let street;
  if (lot === 'C') street = fmt('addr.alleyStreet', { street: STREETS_X[bx + 1] });
  else if (face === 'N') street = STREETS_Z[bz];
  else if (face === 'S') street = STREETS_Z[bz + 1];
  else if (face === 'W') street = STREETS_X[bx];
  else street = STREETS_X[bx + 1];
  const along = face === 'N' || face === 'S' ? cx : cz;
  const number = Math.round((along - CITY.ORIGIN) / 5) * 2 + (face === 'N' || face === 'W' ? 1 : 2);
  const address = lot === 'C' ? fmt('addr.gate', { street }) : fmt('addr.house', { number, street });
  return { ...r, cx, cz, face, door, street, number, address };
}

const key = (bx, bz, lot) => `${bx},${bz},${lot}`;

// Dựng danh sách địa điểm đặc biệt + các lô nhà dân (khách hàng) + mặt bằng các khối có hẻm
export function buildLayout(placesData = PLACES, map = MAP) {
  const places = placesData.filter(isPlaced).map((p) => ({ ...p, ...lotInfo(p.block[0], p.block[1], p.lot, p.face, map) }));
  const taken = new Set();
  for (const p of places) {
    const [bx, bz] = p.block;
    for (const id of lotParts(p.lot)) taken.add(key(bx, bz, id));
  }
  taken.add(key(ALLEY.block[0], ALLEY.block[1], ALLEY.lot));
  const lots = [];
  const alleyBlocks = []; // khối có hẻm: hẻm, nhà phía sau (không cửa), cột chắn — toạ độ thế giới
  for (let bz = 0; bz < CITY.N; bz++) {
    for (let bx = 0; bx < CITY.N; bx++) {
      const plan = blockPlan(bx, bz, map);
      if (plan) {
        const w = (r) => blockRect(bx, bz, r);
        alleyBlocks.push({ block: [bx, bz], walk: plan.walk, alleys: plan.alleys.map(w), fillers: plan.fillers.map(w), posts: plan.posts.map((p) => w({ u0: p.u, u1: p.u, v0: p.v, v1: p.v })).map((r) => ({ x: r.x0, z: r.z0 })) });
      }
      for (const id of blockLotIds(bx, bz, map)) {
        const k = key(bx, bz, id);
        if (taken.has(k)) continue;
        lots.push({ key: k, block: [bx, bz], lot: id, ...lotInfo(bx, bz, id, null, map) });
      }
    }
  }
  const placeById = Object.fromEntries(places.map((p) => [p.id, p]));
  return { places, placeById, lots, alleyBlocks };
}

// Cửa dùng cho xe ôm: nhà trong hẻm đi bộ → đón/trả ở miệng hẻm (xe không vào được)
export const rideDoor = (l) => (l.walkOnly && l.mouthDoor ? l.mouthDoor : l.door);

// Quãng đường theo lưới phố (đi dọc đường, không xuyên nhà) — ước lượng nhanh, không tính sông
export function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

// ---------- sông, cầu, mạng đường (map.json → rivers) ----------
// Sông chạy dọc một con đường: { axis: 'x' (đường dọc x = const) | 'z' (đường ngang z = const), line, from, to, bridges }
// Các đoạn đường giữa ngã tư from…to trên đường đó thành sông; ngã tư trên sông có cầu (bridges) thì đường cắt ngang đi qua được,
// không có cầu thì là mặt nước (đường cắt ngang tới đó là cụt).
const segId = (axis, line, from) => `${axis}${line}:${from}`;
const nodeId = (i, j) => j * (CITY.N + 1) + i;
const graphCache = new Map();
export function riverInfo(map = MAP) {
  const waterSegs = new Set(), waterNodes = new Set(), bridgeNodes = new Set();
  for (const r of (map && map.rivers) || []) {
    for (let k = r.from; k < r.to; k++) waterSegs.add(segId(r.axis, r.line, k));
    for (let k = r.from; k <= r.to; k++) {
      const [i, j] = r.axis === 'z' ? [k, r.line] : [r.line, k];
      ((r.bridges || []).includes(k) ? bridgeNodes : waterNodes).add(`${i},${j}`);
    }
  }
  return { waterSegs, waterNodes, bridgeNodes };
}
// Mạng đường: ngã tư đi được, đoạn đi được, khoảng cách ngắn nhất giữa mọi cặp ngã tư (Floyd), ngã tư kế tiếp để dựng đường đi
export function roadGraph(map = MAP) {
  const key = JSON.stringify((map && map.rivers) || []);
  if (graphCache.has(key)) return graphCache.get(key);
  const { waterSegs, waterNodes, bridgeNodes } = riverInfo(map);
  const M = CITY.N + 1, n = M * M;
  const nodeOk = (i, j) => i >= 0 && j >= 0 && i <= CITY.N && j <= CITY.N && !waterNodes.has(`${i},${j}`);
  // đoạn đường hợp lệ: không phải sông, và 2 đầu là ngã tư đi được (đường cụt sát sông vẫn chạy được nhưng không nối mạng)
  const segOk = (s) => !waterSegs.has(segId(s.axis, s.line, s.from));
  const segs = [];
  for (let line = 0; line <= CITY.N; line++) for (let from = 0; from < CITY.N; from++) for (const axis of ['x', 'z']) {
    const s = { axis, line, from };
    if (segOk(s)) segs.push(s);
  }
  const D = new Float64Array(n * n).fill(Infinity);
  const next = new Int32Array(n * n).fill(-1);
  for (let v = 0; v < n; v++) { D[v * n + v] = 0; next[v * n + v] = v; }
  for (const s of segs) {
    const [a, b] = segEnds(s);
    if (!nodeOk(...a) || !nodeOk(...b)) continue;
    const u = nodeId(...a), v = nodeId(...b);
    D[u * n + v] = D[v * n + u] = CITY.PITCH;
    next[u * n + v] = v;
    next[v * n + u] = u;
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    const dik = D[i * n + k];
    if (dik === Infinity) continue;
    for (let j = 0; j < n; j++) {
      const d = dik + D[k * n + j];
      if (d < D[i * n + j]) { D[i * n + j] = d; next[i * n + j] = next[i * n + k]; }
    }
  }
  const g = { segs, D, next, n, nodeOk, segOk, waterSegs, waterNodes, bridgeNodes };
  graphCache.set(key, g);
  return g;
}
// Các ngã tư nối thẳng với ngã tư (i, j) bằng một đoạn đường đi được (không qua sông)
export function neighbors(i, j, map = MAP) {
  const g = roadGraph(map);
  if (!g.nodeOk(i, j)) return [];
  return [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([a, b]) => g.nodeOk(a, b) && g.D[nodeId(i, j) * g.n + nodeId(a, b)] === CITY.PITCH);
}
// Đoạn đường (axis, line, from) có phải sông không
export const isWaterSeg = (axis, line, from, map = MAP) => roadGraph(map).waterSegs.has(segId(axis, line, from));

// 2 ngã tư ở 2 đầu một đoạn đường
export const segEnds = (s) => (s.axis === 'x' ? [[s.line, s.from], [s.line, s.from + 1]] : [[s.from, s.line], [s.from + 1, s.line]]);
// Điểm → đoạn đường đi được gần nhất + vị trí dọc đoạn (t: mét từ đầu "from")
const projCache = new WeakMap();
function project(p, g) {
  // nhớ kết quả theo đối tượng nhưng kiểm lại toạ độ (vị trí người chơi là đối tượng thay đổi liên tục)
  const c = projCache.get(p);
  if (c && c.g === g && c.x === p.x && c.z === p.z) return c.r;
  let best = null;
  for (const s of g.segs) {
    const fixed = roadPos(s.line), a0 = roadPos(s.from);
    const along = s.axis === 'x' ? p.z : p.x, lat = s.axis === 'x' ? p.x : p.z;
    const t = Math.max(0, Math.min(CITY.PITCH, along - a0));
    const d = Math.abs(lat - fixed) + Math.abs(along - a0 - t);
    if (!best || d < best.d) best = { s, t, d };
  }
  if (typeof p === 'object' && p) projCache.set(p, { g, x: p.x, z: p.z, r: best });
  return best;
}
// Quãng đường thật giữa 2 điểm (m game): đi trong hẻm ra miệng hẻm, ra đường gần nhất, theo mạng đường (vòng qua cầu).
// Cửa nhà trong hẻm mang sẵn { mouth, inner } (xem lotInfo). Không có đường nối → ước lượng manhattan × 1,5.
export function routeDist(a, b, map = MAP) {
  const g = roadGraph(map);
  const pa = a.mouth || a, pb = b.mouth || b;
  const extra = (a.inner || 0) + (b.inner || 0);
  const A = project(pa, g), B = project(pb, g);
  if (!A || !B) return manhattan(a, b) * 1.5;
  let best = Infinity;
  if (A.s === B.s) best = Math.abs(A.t - B.t);
  const [a0, a1] = segEnds(A.s), [b0, b1] = segEnds(B.s);
  for (const [ea, ta] of [[a0, A.t], [a1, CITY.PITCH - A.t]]) {
    if (!g.nodeOk(...ea)) continue;
    for (const [eb, tb] of [[b0, B.t], [b1, CITY.PITCH - B.t]]) {
      if (!g.nodeOk(...eb)) continue;
      const d = ta + g.D[nodeId(...ea) * g.n + nodeId(...eb)] + tb;
      if (d < best) best = d;
    }
  }
  if (best === Infinity) return manhattan(a, b) * 1.5;
  // đoạn ngang ra tới mép đường (đứng trong lòng đường thì không tính; cửa trên vỉa hè ~1,4 m)
  const side = (d) => Math.max(0, d - CITY.ROAD / 2);
  return best + side(A.d) + side(B.d) + extra;
}
// Danh sách ngã tư [i, j] trên đường đi ngắn nhất (dùng cho lái tự động); rỗng nếu không có đường
export function routeNodes(a, b, map = MAP) {
  const g = roadGraph(map);
  const near = (p) => {
    const pr = project(p.mouth || p, g);
    if (!pr) return null;
    const [e0, e1] = segEnds(pr.s);
    return [e0, e1].filter((e) => g.nodeOk(...e)).sort((x, y) => Math.hypot(roadPos(x[0]) - p.x, roadPos(x[1]) - p.z) - Math.hypot(roadPos(y[0]) - p.x, roadPos(y[1]) - p.z))[0] || null;
  };
  const s = near(a), t = near(b);
  if (!s || !t) return [];
  let u = nodeId(...s);
  const v = nodeId(...t);
  if (g.next[u * g.n + v] < 0) return [];
  const out = [s];
  while (u !== v) {
    u = g.next[u * g.n + v];
    out.push([u % (CITY.N + 1), Math.floor(u / (CITY.N + 1))]);
  }
  return out;
}

export function nodePos(i, j) {
  return { x: roadPos(i), z: roadPos(j) };
}

export function nearestNode(x, z) {
  const i = Math.max(0, Math.min(CITY.N, Math.round((x - CITY.ORIGIN) / CITY.PITCH)));
  const j = Math.max(0, Math.min(CITY.N, Math.round((z - CITY.ORIGIN) / CITY.PITCH)));
  return [i, j];
}

// Tên ngã tư để hiện trong tin nhắn nhóm
export function intersectionName(i, j) {
  return `${STREETS_X[i]} – ${STREETS_Z[j]}`;
}

// Đoạn đường (giữa 2 ngã tư liền nhau) → hình chữ nhật trên mặt đất
export function segmentRect(seg) {
  const h = CITY.ROAD / 2;
  if (seg.axis === 'x') {
    const x = roadPos(seg.line);
    return { x0: x - h, x1: x + h, z0: roadPos(seg.from) + h, z1: roadPos(seg.from + 1) - h };
  }
  const z = roadPos(seg.line);
  return { x0: roadPos(seg.from) + h, x1: roadPos(seg.from + 1) - h, z0: z - h, z1: z + h };
}

export function segmentName(seg) {
  return seg.axis === 'x' ? STREETS_X[seg.line] : STREETS_Z[seg.line];
}
