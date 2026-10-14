// Giao thông & người đi đường:
//  - Ô tô, xe máy NPC chạy làn bên phải, rẽ ngẫu nhiên ở ngã tư, dừng + bóp còi khi bị chắn
//  - Người đi bộ đi vòng quanh vỉa hè, dừng lại khi được hỏi chuyện
//  - Chó lang thang, thỉnh thoảng lao qua đường trước mũi xe
//  - Chốt CSGT, đoàn xe kẹt giờ cao điểm
//  - Xe đặc biệt chỉ để nhìn (world/npcVehicles.js): nhóm Jetjet buổi tối, shipper hãng đối thủ, ba gác chở quá tải;
//    vụ trộm chó theo lịch chung (sim/dogThief.js)
import * as THREE from 'three';
import { CITY, roadPos, blockBounds, segmentRect, neighbors, traitAtBlock, isJoinedBlock, isWaterBlock } from '../sim/cityLayout.js';
import { HAZARD, NPC_FLAVOR } from '../data/balance.js';
import { BRANDS } from '../data/apps.js';
import { makeJetjet, makeRivalShipper, makeRivalWaiting, makeBaGac, makeDogThief } from './npcVehicles.js';
import { activeThief, thiefSpot, PHASE as THIEF } from '../sim/dogThief.js';
import { pedStyle } from './npcStyles.js';
import { holdPhone, makeCar, makeNpcMoto, makePerson, makeDog, makeCone, animatePerson, randomPersonOpts, jamCarGeo, jamMotoGeo } from './models.js';
import { personOf } from '../sim/people.js';
import { pushCircle, circleFree } from './physics.js';
import { list } from '../content/index.js';
import { tierBetween, tierRule, tierOf, TIER_GEO } from '../sim/roads.js';
import { busPoses, inService } from '../sim/bus.js';
import { mustStop } from '../sim/lights.js';
import { makeKit, busModel } from './placeBuildings.js';

const SW_H = 0.15;
const FAR = 150; // m — xa hơn thì NPC ẩn (sương mù che từ ~260 m, tầm nhìn thường ~100 m)
const CAR_COLORS = [0xecf0f1, 0x2c3e50, 0xc0392b, 0x2980b9, 0x95a5a6, 0xf1c40f, 0x16a085, 0x7f8c8d];
const MOTO_COLORS = [0xc0392b, 0x2c3e50, 0xecf0f1, 0x8e44ad, 0x2980b9, 0xd35400, 0x1abc9c];

// Rẽ ở ngã tư: xe bắt đầu vào cua khi còn TURN_R m tới tim ngã tư, ra cua cách tim TURN_R m trên đường mới
export const TURN_R = 8;
const TURN_V = { right: 4.5, left: 5.5, uturn: 3 }; // tốc độ tối đa khi cua (m/s)
const RADIUS = { car: 1.3, moto: 0.6 }; // bán kính thân xe khi xét 2 đường cua có chạm nhau không
// Kích thước để nhường nhau: nửa bề ngang, nửa chiều dài
const SIZE = { car: [0.95, 2.2], moto: [0.4, 1], bus: [1.3, 5.5], bagac: [0.72, 1.6] };
const sizeOf = (a) => a.size || SIZE[a.kind]; // xe ba gác: chạy như xe máy nhưng thân to
let UID = 1;

// Kiểu rẽ ở ngã tư: hướng vào din, hướng ra dout (vector đơn vị theo lưới) — xe chạy bên phải, bên phải của (x, z) là (-z, x)
export function turnKind(din, dout) {
  if (dout[0] === din[0] && dout[1] === din[1]) return 'straight';
  if (dout[0] === -din[0] && dout[1] === -din[1]) return 'uturn';
  return dout[0] === -din[1] && dout[1] === din[0] ? 'right' : 'left';
}
// Cung rẽ (đường cong bậc hai E → C → X) qua ngã tư tâm (nx, nz), từ làn lin của hướng din sang làn lout của hướng dout
export function makeTurn(nx, nz, din, dout, lin, lout) {
  const kind = turnKind(din, dout);
  const pin = [-din[1], din[0]], pout = [-dout[1], dout[0]]; // bên phải
  const E = [nx - din[0] * TURN_R + pin[0] * lin, nz - din[1] * TURN_R + pin[1] * lin];
  const X = [nx + dout[0] * TURN_R + pout[0] * lout, nz + dout[1] * TURN_R + pout[1] * lout];
  let C;
  if (kind === 'straight') C = [(E[0] + X[0]) / 2, (E[1] + X[1]) / 2];
  else if (kind === 'uturn') C = [nx + din[0] * TURN_R * 0.5 + pin[0] * (lin - lout) / 2, nz + din[1] * TURN_R * 0.5 + pin[1] * (lin - lout) / 2];
  else C = [nx + pin[0] * lin + pout[0] * lout, nz + pin[1] * lin + pout[1] * lout]; // giao điểm 2 làn
  // chiều dài cung (đo gần đúng bằng 12 đoạn thẳng)
  let len = 0, p = E;
  for (let i = 1; i <= 12; i++) {
    const q = bez(E, C, X, i / 12);
    len += Math.hypot(q[0] - p[0], q[1] - p[1]);
    p = q;
  }
  return { E, C, X, len, kind };
}
export const bez = (E, C, X, u) => [(1 - u) * (1 - u) * E[0] + 2 * (1 - u) * u * C[0] + u * u * X[0], (1 - u) * (1 - u) * E[1] + 2 * (1 - u) * u * C[1] + u * u * X[1]];
export const bezDir = (E, C, X, u) => [2 * (1 - u) * (C[0] - E[0]) + 2 * u * (X[0] - C[0]), 2 * (1 - u) * (C[1] - E[1]) + 2 * u * (X[1] - C[1])];

// Hai đường cua có chạm nhau không: cung T1 từ u1 tới hết, cung T2 từ u2 tới hết (đo theo điểm lấy mẫu ~1,5 m)
function curveSamples(T, u0) {
  const n = Math.max(2, Math.ceil((T.len * (1 - u0)) / 1.5)), out = [];
  for (let i = 0; i <= n; i++) out.push(bez(T.E, T.C, T.X, u0 + ((1 - u0) * i) / n));
  return out;
}
function curvesClash(T1, u1, T2, u2, gap) {
  const A = curveSamples(T1, u1), B = curveSamples(T2, u2), g2 = gap * gap;
  for (const p of A) for (const q of B) if ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 < g2) return true;
  return false;
}

// Hai xe trong cùng ngã tư có cắt đường nhau không (din: hướng vào, kind: kiểu rẽ)
function crosses(a, b) {
  // cùng hướng vào: cùng làn thì nối đuôi nhau (xét bằng nhìn phía trước); ô tô và xe máy khác làn mà rẽ khác nhau thì cắt làn nhau
  if (a.din[0] === b.din[0] && a.din[1] === b.din[1]) return a.vk !== b.vk && a.kind !== b.kind;
  if (a.din[0] === -b.din[0] && a.din[1] === -b.din[1]) return [a.kind, b.kind].some((k) => k === 'left' || k === 'uturn'); // ngược chiều: chỉ rẽ trái / quay đầu mới cắt
  return !(a.kind === 'right' && b.kind === 'right'); // vuông góc: chỉ 2 xe cùng rẽ phải là không vướng
}

// Hai thân xe đang chồng lên nhau (đo theo hướng xe a)
function overlaps(a, b) {
  const ox = b.x - a.x, oz = b.z - a.z;
  if (Math.abs((a.y || 0) - (b.y || 0)) > 1.5) return false;
  return Math.abs(ox * a.hx + oz * a.hz) < a.l + b.l && Math.abs(-ox * a.hz + oz * a.hx) < a.w + b.w;
}

// Xe a thấy xe b chắn phía trước? Trả về khoảng cách dọc (m) hoặc -1. Mỗi xe: { x, z, hx, hz (hướng), w, l (nửa ngang / nửa dài), speed, y }
function seesAhead(a, b) {
  const ox = b.x - a.x, oz = b.z - a.z;
  if (ox * ox + oz * oz > 400 || Math.abs((a.y || 0) - (b.y || 0)) > 1.5) return -1;
  const along = ox * a.hx + oz * a.hz, lat = -ox * a.hz + oz * a.hx;
  const look = a.l + b.l + (a.kind === 'moto' ? 3.5 : 5) + a.speed * 0.5;
  return along > 0 && along < look && Math.abs(lat) < a.w + b.w + 0.1 ? along : -1;
}

export const segKeyOf = (a, b) => (a[0] === b[0] ? `x${a[0]}:${Math.min(a[1], b[1])}` : `z${a[1]}:${Math.min(a[0], b[0])}`);
// Chọn ngã tư kế tiếp khi tới ngã tư node (đi từ prev): dùng chung cho xe NPC và xe nền (bgTraffic.js)
export function pickNextNode(rng, node, prev, kind = 'car', floodIds = null) {
  const [i, j] = node;
  const opts = neighbors(i, j); // chỉ đi theo đoạn đường có thật (tránh sông; đường cụt thì quay đầu)
  if (!opts.length) return prev || node;
  let c = opts.filter((n) => !prev || n[0] !== prev[0] || n[1] !== prev[1]);
  if (!c.length) c = opts;
  // ưu tiên đi thẳng; ô tô chuộng đại lộ, xe máy chuộng đường nhỏ (balance.json → roads.*.cars / motos)
  const straight = prev && [i + (i - prev[0]), j + (j - prev[1])];
  const key = kind === 'car' ? 'cars' : 'motos';
  // đoạn đang ngập sâu: gần như không ai chạy vào (còn lối khác thì né)
  const flooded = (n) => floodIds?.has(segKeyOf(node, n));
  const w = c.map((n) => (straight && n[0] === straight[0] && n[1] === straight[1] ? 2.5 : 1) * (tierRule(tierBetween(node, n), key) + 0.02) * (flooded(n) ? 0.02 : 1));
  return rng.weighted(c, w);
}
export const segKey = (s) => `${s.axis}${s.line}:${s.from}`;

// Vị trí trên vòng vỉa hè quanh khối (bx,bz); t = mét dọc theo vòng
export function ringPos(bx, bz, t, inset) {
  const b = blockBounds(bx, bz);
  const L = CITY.BLOCK - 2 * inset;
  const per = 4 * L;
  t = ((t % per) + per) % per;
  const side = Math.floor(t / L), u = t - side * L;
  if (side === 0) return { x: b.x0 + inset + u, z: b.z0 + inset };
  if (side === 1) return { x: b.x1 - inset, z: b.z0 + inset + u };
  if (side === 2) return { x: b.x1 - inset - u, z: b.z1 - inset };
  return { x: b.x0 + inset, z: b.z1 - inset - u };
}

// Các khối đất (không phải sông, không phải khối đã gộp) — chỗ chó / người đi bộ được ở
let LAND = null;
function landBlocks() {
  if (!LAND) {
    LAND = [];
    for (let bz = 0; bz < CITY.N; bz++) for (let bx = 0; bx < CITY.N; bx++) if (!isJoinedBlock(bx, bz) && !isWaterBlock(bx, bz)) LAND.push([bx, bz]);
  }
  return LAND;
}
const WATER_TAGS = new Set(['water', 'kerb']);

// Người đi bộ: vị trí trên vòng vỉa hè theo t (tính ở làn giữa PED_LANE để t không nhảy khi đổi làn),
// rồi lệch vào phía nhà / ra phía lề theo `lane` (m tính từ mép lề, vỉa hè rộng 3 m)
const MAX_STILL = 5; // số người ăn xin ngồi yên tối đa trên cả bản đồ
const PED_LANE = 2.05; // lối đi giữa vỉa hè: xe máy đậu xiên sát lề tới ~1,75 m, quán cóc sát nhà từ ~2,45 m (city.js)
const PED_LANES = [2.05, 1.9, 2.2, 1.8, 2.3]; // né nhẹ: lệch tối đa 0,25 m, gần làn giữa trước
const IN = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // hướng vào trong khối của 4 cạnh vòng (theo thứ tự ringPos)
function pedPos(bx, bz, t, lane) {
  const L = CITY.BLOCK - 2 * PED_LANE, per = 4 * L;
  const side = Math.floor((((t % per) + per) % per) / L);
  const q = ringPos(bx, bz, t, PED_LANE), [nx, nz] = IN[side];
  return { x: q.x + nx * (lane - PED_LANE), z: q.z + nz * (lane - PED_LANE) };
}

// Điểm bất kỳ → khối gần nhất (hoặc khối cho trước hx, hz) và tham số t trên vòng vỉa hè
function projectToRing(x, z, inset, hx = null, hz = null) {
  const off = CITY.ORIGIN + CITY.ROAD / 2;
  const bx = hx ?? Math.max(0, Math.min(CITY.N - 1, Math.round((x - off - CITY.BLOCK / 2) / CITY.PITCH)));
  const bz = hz ?? Math.max(0, Math.min(CITY.N - 1, Math.round((z - off - CITY.BLOCK / 2) / CITY.PITCH)));
  const b = blockBounds(bx, bz);
  const L = CITY.BLOCK - 2 * inset;
  const cx = Math.max(b.x0 + inset, Math.min(b.x1 - inset, x));
  const cz = Math.max(b.z0 + inset, Math.min(b.z1 - inset, z));
  const d = [Math.abs(cz - (b.z0 + inset)), Math.abs(cx - (b.x1 - inset)), Math.abs(cz - (b.z1 - inset)), Math.abs(cx - (b.x0 + inset))];
  const side = d.indexOf(Math.min(...d));
  let u;
  if (side === 0) u = cx - (b.x0 + inset);
  else if (side === 1) u = cz - (b.z0 + inset);
  else if (side === 2) u = b.x1 - inset - cx;
  else u = b.z1 - inset - cz;
  return { bx, bz, t: side * L + u };
}

// Tài xế bị người chơi chắn đầu xe → chửi (bong bóng thoại, game.js → driverYell):
// chắn 1,5 giây: câu nhẹ · 8 giây: câu gắt · sau đó cứ ~8 giây một câu. Hết chắn hơn 1 giây thì tính lại từ đầu.
function yellTick(v, blocked, dt, events, who) {
  if (blocked) {
    v.yellFree = 0;
    v.yellT = (v.yellT || 0) + dt;
    const at = v.yellAt ?? 1.5;
    if (v.yellT > at) {
      events.push({ type: 'driverYell', obj: v, angry: at > 1.5, ...who });
      v.yellAt = at < 8 ? 8 : v.yellT + 8;
    }
  } else if (v.yellT) {
    v.yellFree = (v.yellFree || 0) + dt;
    if (v.yellFree > 1) v.yellT = 0, v.yellAt = 1.5;
  }
}

export class Traffic {
  constructor(scene, rng, opts = {}) {
    this.scene = scene;
    this.rng = rng;
    this.agents = [];
    this.loopCars = []; // xe chạy vòng cố định (lên đường trên cao sân bay thả khách)
    this.buses = []; // xe buýt chạy theo lịch (src/sim/bus.js)
    this.riders = []; // khách vừa xuống xe đi vào ga (dùng lại người cũ)
    this.peds = [];
    this.dogs = [];
    this.police = new Map();
    this.jamCircles = [];
    this.jamKeys = new Set();
    this.honkCd = 0;
    // số NPC theo diện tích bản đồ (mẫu cũ 5×5 khối: 22 ô tô, 30 xe máy, 36 người, 6 chó)
    const k = (CITY.N * CITY.N) / 25;
    const nCars = opts.cars ?? Math.round(22 * k), nMotos = opts.motos ?? Math.round(30 * k), nPeds = opts.peds ?? Math.round(36 * k), nDogs = opts.dogs ?? Math.round(6 * k);
    for (let i = 0; i < nCars + nMotos; i++) this.spawnAgent(i < nCars ? 'car' : 'moto');
    if (opts.specials !== false) this.spawnSpecials();
    for (let i = 0; i < nPeds; i++) this.spawnPed(i);
    for (let i = 0; i < nDogs; i++) this.spawnDog();
    this.buildJamMeshes();
  }

  // ---------------- xe NPC ----------------
  // o (xe đặc biệt): { special: 'jetjet' | 'rival' | 'bagac', mesh, maxSpeed, size, hours: [từ giờ, tới giờ], leader (xe dẫn nhóm),
  //   from, to, t (xuất phát ngay sau xe dẫn) }
  spawnAgent(kind, o = {}) {
    const rng = this.rng;
    // xuất phát ở ngã tư có đường đi (không phải mặt sông)
    let from = o.from || [rng.int(0, CITY.N), rng.int(0, CITY.N)];
    for (let k = 0; k < 50 && !neighbors(...from).length; k++) from = [rng.int(0, CITY.N), rng.int(0, CITY.N)];
    const to = o.to || pickNextNode(rng, from, null, o.special === 'bagac' ? 'car' : kind, this.floodIds);
    // ô tô: sedan nhiều nhất, rồi SUV, taxi, xe tải nhỏ · xe máy: thỉnh thoảng là shipper hãng đối thủ (thùng + áo màu hãng)
    let mesh = o.mesh;
    if (!mesh && kind === 'car') mesh = makeCar(rng.pick(CAR_COLORS), rng.pick(['sedan', 'sedan', 'sedan', 'suv', 'suv', 'taxi', 'taxi', 'truck']));
    if (!mesh && rng.chance(NPC_FLAVOR.rivalPct ?? 0.15)) {
      const brands = Object.values(BRANDS);
      if (brands.length) {
        const b = rng.pick(brands);
        mesh = makeRivalShipper(rng, parseInt(String(b.color || '#00b14f').slice(1), 16), rng.pick(['cub', 'underbone', 'scooter']));
        o = { ...o, special: 'rival' };
      }
    }
    if (!mesh) mesh = makeNpcMoto(rng.pick(MOTO_COLORS), rng);
    this.scene.add(mesh);
    const maxSpeed = o.maxSpeed ?? (kind === 'car' ? rng.range(7, 10) : rng.range(8, 11.5));
    const a = { uid: UID++, kind, mesh, from, to, next: null, turn: null, cu: 0, t: o.t ?? rng.range(5, CITY.PITCH - TURN_R - 12), speed: maxSpeed * 0.5, maxSpeed, lane: 0, stop: 0, x: 0, z: 0, dx: 0, dz: 0, heading: 0, honk: 0, blockT: 0 };
    if (o.special) Object.assign(a, { special: o.special, size: o.size, hours: o.hours, leader: o.leader, phase: rng.range(0, 6), talkCd: rng.range(3, 10) });
    a.lane = this.laneOf(a);
    a.heading = Math.atan2(to[0] - from[0], to[1] - from[1]);
    this.agents.push(a);
    return a;
  }
  // Làn chạy theo cấp đường của đoạn đang đi (src/sim/roads.js → TIER_GEO): đường nhỏ chạy sát tim, đại lộ có dải phân cách
  laneOf(a) {
    const g = TIER_GEO[tierBetween(a.from, a.to)];
    return a.kind === 'car' || a.special === 'bagac' ? g.carLane : g.motoLane; // ba gác to → chạy làn ô tô
  }

  // ---------------- xe đặc biệt (chỉ để nhìn) ----------------
  // Nhóm Jetjet (2–3 xe nối đuôi, buổi tối), xe ba gác (ban ngày). Số lượng / giờ / tốc độ: thẻ ⚖️ Cân bằng → npcFlavor
  spawnSpecials() {
    const F = NPC_FLAVOR, rng = this.rng;
    for (let g = 0; g < (F.jetjetGroups ?? 3); g++) {
      const v = F.jetjetSpeed ?? 13, hours = [F.jetjetFrom ?? 19, F.jetjetTo ?? 24];
      const lead = this.spawnAgent('moto', { special: 'jetjet', mesh: makeJetjet(rng, { pillion: rng.chance(0.5) }), maxSpeed: v, hours });
      lead.route = new Map(); // ngã tư → hướng đã chọn (xe sau đi theo)
      const n = rng.int(1, 2);
      for (let k = 1; k <= n; k++) {
        const t = lead.t - k * 4.5;
        if (t < 2) break; // đầu đoạn đường: không đủ chỗ xếp sau
        this.spawnAgent('moto', { special: 'jetjet', mesh: makeJetjet(rng, { pillion: rng.chance(0.4) }), maxSpeed: v + 0.6, hours, leader: lead, from: lead.from, to: lead.to, t });
      }
    }
    for (let i = 0; i < (F.bagac ?? 3); i++) {
      this.spawnAgent('moto', { special: 'bagac', mesh: makeBaGac(rng), maxSpeed: (F.bagacSpeed ?? 5.5) * rng.range(0.9, 1.1), size: SIZE.bagac, hours: [F.bagacFrom ?? 5, F.bagacTo ?? 20] });
    }
  }
  // Ngã tư kế tiếp: xe trong nhóm Jetjet đi theo đường xe dẫn đã chọn; ba gác né đường nhỏ (chọn như ô tô)
  nextOf(a) {
    const key = a.to.join(',');
    const led = a.leader?.route?.get(key);
    if (led && a.leader.route.get(key + '<') === a.from.join(',')) return led;
    const n = this.pickNext(a.to, a.from, a.special === 'bagac' ? 'car' : a.kind);
    if (a.route) {
      a.route.set(key, n);
      a.route.set(key + '<', a.from.join(','));
      if (a.route.size > 40) a.route.delete(a.route.keys().next().value);
    }
    return n;
  }

  // ---------------- xe buýt ----------------
  // Mỗi tuyến vài xe; vị trí lấy thẳng từ lịch chạy (cùng lịch dùng để tính chờ / đi khi người chơi đi xe)
  setBuses(sys) {
    for (const b of this.buses) this.scene.remove(b.mesh);
    this.buses = [];
    sys.routes.forEach((r, ri) => {
      if (r.error) return;
      for (let i = 0; i < r.buses; i++) {
        const k = makeKit();
        busModel(k, 0, 0, 'z', parseInt((r.color || '#1e8449').slice(1), 16), ri + 1);
        const mesh = new THREE.Group();
        k.meshes(mesh);
        mesh.visible = false;
        this.scene.add(mesh);
        this.buses.push({ route: r, idx: i, mesh, x: 0, z: 0, dx: 0, dz: 1, heading: 0, speed: 0, ready: false });
      }
    });
  }
  // now: phút game · px, pz: người chơi (xa thì ẩn cho nhẹ). Trả về sự cố để game phát tiếng: [{ type: 'busHonk' }]
  // Xe buýt chạy theo lịch, nhưng gặp xe / người chắn ngay trước đầu (trong làn) thì PHANH ĐỨNG CHỜ: lịch của xe đó
  // lùi lại (lag, phút); hết chắn thì chạy nhanh hơn chút để đuổi kịp lịch. Đi xe buýt của người chơi tính theo lịch gốc
  // (tua thời gian) nên trễ vài phút chỉ là chuyện hiển thị.
  updateBuses(now, px, pz, dt = 0.016) {
    const events = [];
    this.busBlockedByPlayer = false; // có xe buýt đang đứng chờ vì người chơi chắn trước đầu
    if (!this.buses.length) return events;
    const on = inService(now);
    for (const b of this.buses) {
      const dNow = b.lastNow == null ? 0 : now - b.lastNow;
      b.lastNow = now;
      if (dNow < 0 || dNow > 5) b.lag = 0; // tua giờ / sang ngày: về đúng lịch
      b.lag = b.lag || 0;
      // chắn trước đầu xe? (chỉ xét khi xe đang hiện và đang chạy, không xét lúc đậu ở trạm)
      const block = b.ready && b.mesh.visible ? this.busBlocker(b, px, pz) : null;
      if (block === 'npc') b.npcWait = (b.npcWait || 0) + dt;
      else b.npcWait = 0;
      const pushThrough = block === 'npc' && b.npcWait > 30; // xe NPC kẹt cứng quá 30 giây: xe buýt đi tiếp (không đứng mãi)
      if (block && !pushThrough) {
        b.lag += dNow; // đứng yên: lịch của xe này lùi lại đúng bằng thời gian vừa trôi
        yellTick(b, block === 'player', dt, events, { id: `bus:${b.route.id}:${b.idx}`, bus: true });
        if (block === 'player') {
          this.busBlockedByPlayer = true;
          b.honkT = (b.honkT || 0) + dt;
          if (b.honkT > 1.5) { b.honkT = -2; events.push({ type: 'busHonk' }); } // chắn lâu: bóp còi, ~3,5 giây 1 lần
        }
      } else {
        yellTick(b, false, dt, events, null);
        b.honkT = 0;
        b.lag = Math.max(0, b.lag - dNow * 0.35); // đuổi kịp lịch: chạy nhanh hơn 35%
      }
      const p = busPoses(b.route, now - b.lag)[b.idx];
      if (!p) continue;
      const mv = Math.hypot(p.x - b.x, p.z - b.z);
      b.speed = b.ready && dt > 0 ? Math.min(20, mv / dt) : 0;
      b.x = p.x;
      b.z = p.z;
      b.dx = Math.sin(p.heading);
      b.dz = Math.cos(p.heading);
      let d = p.heading - b.heading;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      b.heading = b.ready ? b.heading + d * Math.min(1, dt * 6) : p.heading;
      b.ready = true;
      b.mesh.visible = on && Math.abs(p.x - px) < FAR && Math.abs(p.z - pz) < FAR;
      b.mesh.position.set(p.x, this.elev ? this.elev.topAt(p.x, p.z) : 0, p.z);
      b.mesh.rotation.y = b.heading;
    }
    return events;
  }
  // Có gì chắn ngay trước đầu xe buýt (trong làn, khoảng trống từ đầu xe buýt tới đuôi vật chắn ≤ 3 m)? 'player' | 'npc' | null
  busBlocker(b, px, pz) {
    const [hw, half] = SIZE.bus;
    // w, l: nửa bề ngang / nửa chiều dài vật chắn
    const ahead = (x, z, w, l) => {
      const rx = x - b.x, rz = z - b.z;
      const along = rx * b.dx + rz * b.dz, lat = Math.abs(rx * b.dz - rz * b.dx);
      return along > 0 && along - l - half < 3 && lat < hw + w * 0.6;
    };
    // xe khác chắn trước xét TRƯỚC người chơi (xe buýt đứng vì xe NPC thì không đổ lỗi cho người chơi)
    for (const a of this.agents) if (!a.isFar && ahead(a.x, a.z, sizeOf(a)[0], sizeOf(a)[1])) return 'npc';
    for (const a of this.loopCars) if (a.mesh.visible && ahead(a.x, a.z, SIZE.car[0], SIZE.car[1])) return 'npc';
    for (const o of this.buses) if (o !== b && o.mesh.visible && ahead(o.x, o.z, hw, half)) return 'npc';
    if (ahead(px, pz, 0.6, 0.9)) return this.inJam(b.x, b.z) || this.inJam(px, pz) ? 'npc' : 'player'; // kẹt xe: coi như xe chắn
    return null;
  }

  // ---------------- xe chạy vòng cố định ----------------
  // loop: { pts: [{x,y,z}] khép kín, cách đều ~1 m (điểm 0 = đầu dốc lên); stops: [chỉ số điểm dừng thả khách];
  //         toTerminal: [x, z] hướng khách xuống xe đi vào ga }
  addLoop(loop, n = 4) {
    const rng = this.rng, N = loop.pts.length;
    if (N < 10) return;
    for (let i = 0; i < n; i++) {
      const mesh = makeCar(rng.pick(CAR_COLORS), rng.pick(['taxi', 'taxi', 'sedan', 'suv']));
      mesh.rotation.order = 'YXZ'; // quay theo hướng chạy rồi mới ngóc / chúi theo dốc
      this.scene.add(mesh);
      const a = { uid: UID++, kind: 'car', loop, mesh, s: (i * N) / n, speed: 0, maxSpeed: rng.range(6.5, 8.5), wait: 0, stop: 0, honk: 0, yieldT: 0, cool: 0, done: false, stopAt: loop.stops.length ? rng.pick(loop.stops) : -1, x: 0, y: 0, z: 0, dx: 0, dz: 1, heading: 0 };
      this.placeLoopCar(a);
      a.heading = Math.atan2(a.dx, a.dz);
      this.loopCars.push(a);
    }
  }

  // Vị trí, hướng, độ dốc của xe chạy vòng theo quãng đường đã chạy s
  placeLoopCar(a) {
    const P = a.loop.pts, N = P.length;
    const i = Math.floor(a.s) % N, k = a.s - Math.floor(a.s);
    const p = P[i], q = P[(i + 1) % N], ahead = P[(i + 2) % N], back = P[(i + N - 1) % N];
    a.x = p.x + (q.x - p.x) * k;
    a.y = p.y + (q.y - p.y) * k;
    a.z = p.z + (q.z - p.z) * k;
    const dx = ahead.x - back.x, dz = ahead.z - back.z, L = Math.hypot(dx, dz) || 1;
    a.dx = dx / L;
    a.dz = dz / L;
    a.pitch = Math.atan2(ahead.y - back.y, L);
  }

  updateLoops(dt, ctx, far, events) {
    for (const a of this.loopCars) {
      const P = a.loop.pts, N = P.length;
      let v = a.maxSpeed;
      const i = Math.floor(a.s) % N;
      if (Math.abs(P[(i + 2) % N].y - P[i].y) > 0.05) v = Math.min(v, 5.5); // lên / xuống dốc chạy chậm
      const hidden = far(a.x, a.z);
      a.mesh.visible = !hidden;
      if (!hidden) {
        // xe cùng vòng phía trước: giữ khoảng cách
        for (const b of this.loopCars) {
          if (b === a || b.loop !== a.loop) continue;
          const gap = (b.s - a.s + N) % N;
          if (gap > 0 && gap < 11) v = Math.min(v, Math.max(0, (gap - 6) * 1.5));
        }
        // người chơi (cùng tầng) chắn trước → dừng, bóp còi; xe NPC ngoài đường chắn → nhường (nhường lâu quá thì đi tiếp, tránh kẹt cứng)
        const ahead = (x, z, len) => {
          const ox = x - a.x, oz = z - a.z, along = ox * a.dx + oz * a.dz, lat = -ox * a.dz + oz * a.dx;
          return along > 0 && along < len && Math.abs(lat) < 1.8;
        };
        if (Math.abs((ctx.py ?? 0) - a.y) < 1.5 && ahead(ctx.px, ctx.pz, 7)) {
          const vFree = v;
          v = 0;
          if (vFree >= 1 && this.blameable(ctx)) this.blockedByPlayer = true;
          if (vFree >= 1 && this.blameable(ctx) && a.honk <= 0 && a.speed < 1) {
            a.honk = 4 + this.rng.next() * 4;
            if (this.honkCd <= 0 && Math.hypot(ctx.px - a.x, ctx.pz - a.z) < 14) {
              events.push({ type: 'honk', kind: 'car' });
              this.honkCd = 1.5;
            }
          }
        }
        // xe ngoài đường / xe buýt chắn trước (luật nhường chung, xem yieldTo)
        v = Math.min(v, this.yieldTo(this.bodyOf(a), dt, a));
        // chạy chậm lại rồi dừng ở điểm thả khách (mỗi vòng một lần)
        if (!a.done && a.stopAt >= 0) {
          const d = (a.stopAt - a.s + N) % N;
          if (d < 14) v = Math.min(v, Math.max(0.6, d * 0.6));
          if (d < 0.4) {
            a.done = true;
            a.wait = this.rng.range(3.5, 5.5);
            this.dropRider(a);
          }
        }
      }
      a.honk -= dt;
      if (a.wait > 0) {
        a.wait -= dt;
        v = 0;
      }
      if (a.stop > 0) {
        a.stop -= dt;
        v = 0;
      }
      a.speed = hidden ? v : a.speed + Math.max(-8 * dt, Math.min(3 * dt, v - a.speed));
      a.s += a.speed * dt;
      if (a.s >= N) {
        // hết một vòng (về đầu dốc): chọn chỗ thả khách cho vòng sau
        a.s -= N;
        a.done = false;
        if (a.loop.stops.length) a.stopAt = this.rng.pick(a.loop.stops);
      }
      this.placeLoopCar(a);
      if (hidden) continue;
      const hd = Math.atan2(a.dx, a.dz);
      let d = hd - a.heading;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      a.heading += d * Math.min(1, dt * 8);
      a.mesh.position.set(a.x, a.y, a.z);
      a.mesh.rotation.set(-a.pitch, a.heading, 0);
    }
    // khách xuống xe: kéo vali đi vào ga rồi khuất
    for (const r of this.riders) {
      if (r.t <= 0) continue;
      r.t -= dt;
      r.phase += dt * 6;
      r.mesh.position.x += r.vx * dt;
      r.mesh.position.z += r.vz * dt;
      animatePerson(r.mesh, r.phase, 0.6);
      if (r.t <= 0) r.mesh.visible = false;
    }
  }

  dropRider(a) {
    let r = this.riders.find((x) => x.t <= 0);
    if (!r && this.riders.length < 6) {
      const mesh = makePerson(randomPersonOpts(this.rng));
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.55, 0.22), new THREE.MeshStandardMaterial({ color: this.rng.pick([0x2c3e50, 0xc0392b, 0x16a085, 0x8e44ad]), roughness: 0.5 }));
      bag.position.set(0.42, 0.3, -0.25);
      mesh.add(bag);
      this.scene.add(mesh);
      r = { mesh, t: 0, phase: 0, vx: 0, vz: 0 };
      this.riders.push(r);
    }
    if (!r) return;
    const [tx, tz] = a.loop.toTerminal;
    r.mesh.visible = true;
    r.mesh.position.set(a.x + tx * 1.3, a.y + 0.16, a.z + tz * 1.3);
    r.mesh.rotation.y = Math.atan2(tx, tz);
    r.vx = tx * 1.1;
    r.vz = tz * 1.1;
    r.t = 2.4;
  }

  // Hướng (vector lưới) từ ngã tư node tới ngã tư kề nxt; nxt trùng node (cụt hẳn) → quay đầu
  dirTo(node, nxt, din) {
    const d = [Math.sign(nxt[0] - node[0]), Math.sign(nxt[1] - node[1])];
    return d[0] || d[1] ? d : [-din[0], -din[1]];
  }

  // ---- giữ chỗ ngã tư: xe trong ngã tư (occ) và xe đang chờ ở vạch (wait, theo thứ tự tới) ----
  nodeOf(key) {
    if (!this.nodes) this.nodes = new Map();
    let n = this.nodes.get(key);
    if (!n) this.nodes.set(key, (n = { occ: new Map(), wait: new Map() }));
    return n;
  }
  // Được vào ngã tư a.to chưa: không cắt đường xe đang trong ngã tư, không cắt đường xe tới trước đang chờ, không có xe buýt sát ngã tư
  canEnter(a, din, kind) {
    const key = a.to.join(','), n = this.nodeOf(key), me = { din, kind, vk: a.kind };
    if (n.occ.has(a.uid)) return true;
    // đèn giao thông (sim/lights.js; game.js gán this.lights = { map, t }): đỏ / vàng thì đứng ở vạch, rẽ phải vẫn đi
    if (this.lights && mustStop(this.lights.map, key, din, kind, this.lights.t)) {
      n.wait.delete(a.uid);
      return ((a.waitWhy = 'light'), false);
    }
    // còn xe cùng chiều đứng chắn trước mặt → chưa phải đầu hàng: chưa tính lượt (giờ "tới trước" tính từ lúc lên đầu hàng)
    const ahead = a.blockedBy != null && this.agents.find((b) => b.uid === a.blockedBy);
    if (ahead && Math.sin(ahead.heading) * Math.sin(a.heading) + Math.cos(ahead.heading) * Math.cos(a.heading) > 0.7) {
      n.wait.delete(a.uid);
      return ((a.waitWhy = 'queue'), false);
    }
    if (!n.wait.has(a.uid)) n.wait.set(a.uid, { din, kind, vk: a.kind, since: this.clock, ref: a });
    a.waitKey = key;
    const w = n.wait.get(a.uid);
    w.din = din;
    w.kind = kind;
    // xe đang trong ngã tư: chỉ chờ khi phần đường còn lại của nó còn chạm đường cua của mình
    if (n.occ.size) {
      const mine = a.next && makeTurn(roadPos(a.to[0]), roadPos(a.to[1]), din, this.dirTo(a.to, a.next, din), a.lane, this.laneOf({ kind: a.kind, from: a.to, to: a.next }));
      for (const [uid, o] of n.occ) {
        if (o.din[0] === din[0] && o.din[1] === din[1] && !crosses(me, o)) continue; // cùng hướng, cùng làn: nối đuôi (nhìn phía trước lo)
        const T = o.ref.turn;
        const clash = mine && T ? curvesClash(mine, 0, T, Math.min(1, o.ref.cu / T.len), RADIUS[a.kind] + RADIUS[o.vk]) : crosses(me, o);
        if (clash) return ((a.waitWhy = 'occ:' + uid), false);
      }
    }
    for (const [uid, o] of n.wait) {
      if (uid === a.uid || o.since >= w.since) continue;
      if (o.din[0] === din[0] && o.din[1] === din[1]) continue; // cùng hướng: thứ tự đứng trên đường tự lo (tránh chờ xe đang kẹt sau lưng mình)
      if (o.ref.waitWhy && o.ref.waitWhy.startsWith('exit')) continue; // xe đó đang chờ lối ra trống, chưa đi được → không giữ lượt
      if (o.ref.to.join(',') !== key || o.ref.turn || !o.ref.mesh.visible) {
        n.wait.delete(uid); // xe đó đã đi chỗ khác / đã ẩn
        continue;
      }
      if (crosses(me, o)) return ((a.waitWhy = 'wait:' + uid), false);
    }
    // lối ra còn chỗ: xe cùng loại làn vừa ra khỏi ngã tư đang đứng / bò sát vạch thì chưa vào (không đứng chắn giữa ngã tư)
    if (a.next && !(a.next[0] === a.to[0] && a.next[1] === a.to[1])) {
      const small = tierBetween(a.to, a.next) === 'small';
      for (const b of this.onSeg.get(a.to + '>' + a.next) || []) {
        if ((small || b.kind === a.kind) && b.t < TURN_R + sizeOf(b)[1] * 2 + 2 && b.speed < 1.5) return ((a.waitWhy = 'exit:' + b.uid), false);
      }
    }
    const cx = roadPos(a.to[0]), cz = roadPos(a.to[1]);
    for (const b of this.buses) {
      if (!b.mesh.visible || Math.abs(b.x - cx) >= 14 || Math.abs(b.z - cz) >= 14) continue;
      // xe này đang đứng ngay trước đầu xe buýt (cùng làn) → cứ đi, xe buýt đang chờ nó (chờ nhau thì kẹt cứng)
      const rx = a.x - b.x, rz = a.z - b.z;
      if (rx * b.dx + rz * b.dz > 0 && Math.abs(rx * b.dz - rz * b.dx) < 2.5) continue;
      return ((a.waitWhy = 'bus'), false);
    }
    a.waitWhy = null;
    return true;
  }
  enterNode(a, din, kind) {
    const key = a.to.join(','), n = this.nodeOf(key);
    n.wait.delete(a.uid);
    a.waitKey = null;
    n.occ.set(a.uid, { din, kind, vk: a.kind, ref: a });
    a.inNode = key;
  }
  leaveNode(a) {
    if (a.inNode) this.nodeOf(a.inNode).occ.delete(a.uid);
    a.inNode = null;
    if (a.waitKey) this.nodeOf(a.waitKey).wait.delete(a.uid);
    a.waitKey = null;
  }

  // Thân xe để xét nhường: vị trí, hướng đang chạy, cỡ
  bodyOf(a, kind = a.kind) {
    const [w, l] = kind === a.kind ? sizeOf(a) : SIZE[kind];
    return { ref: a, uid: a.uid, kind, x: a.x, z: a.z, y: a.y || 0, hx: Math.sin(a.heading), hz: Math.cos(a.heading), w, l, speed: a.speed || 0 };
  }
  // Các xe đang hiện: xe NPC, xe vòng sân bay, xe buýt (xe buýt chạy theo lịch, không nhường ai)
  collectVehicles(far) {
    const out = [];
    for (const a of this.agents) if (!a.isFar && !a.off) out.push(this.bodyOf(a));
    for (const a of this.loopCars) if (a.mesh.visible) out.push(this.bodyOf(a));
    for (const b of this.buses) if (b.mesh.visible) out.push({ ...this.bodyOf({ ...b, uid: 0 }, 'bus'), bus: true });
    return out;
  }
  // Tốc độ tối đa của xe me khi có xe khác chắn trước. Hai xe cùng chắn nhau (gặp ở ngã tư) → xe uid nhỏ đi trước;
  // xe buýt luôn được nhường; xe vòng sân bay thì không xét nhau (đã giữ khoảng cách theo vòng).
  yieldTo(me, dt, a) {
    let v = Infinity;
    a.blockedBy = null;
    for (const b of this.vehicles || []) {
      if (b.ref === a || (a.loop && b.ref.loop)) continue;
      // đang đi trong ngã tư: chỉ nhường xe cùng trong ngã tư và xe đi trước cùng chiều (xe đứng chờ ở vạch không nằm trên đường cua)
      if (a.inNode && !b.bus && b.ref.inNode !== a.inNode && me.hx * b.hx + me.hz * b.hz < 0.7) continue;
      // đang chồng lên nhau (vừa từ xa hiện ra…): xe phía sau đứng lại cho xe phía trước đi để tách ra;
      // không rõ trước sau (cắt ngang, song song) thì xe đang trong ngã tư đi trước, rồi tới xe uid nhỏ
      if (overlaps(me, b)) {
        const ox = b.x - me.x, oz = b.z - me.z;
        const aheadOfMe = ox * me.hx + oz * me.hz > 0.3, meAheadOfB = -(ox * b.hx + oz * b.hz) > 0.3;
        const prio = (q, r) => (q.ref.inNode ? 1 : 0) - (r.ref.inNode ? 1 : 0) || r.uid - q.uid; // > 0: q được đi trước
        if (aheadOfMe !== meAheadOfB ? aheadOfMe : prio(me, b) < 0) {
          v = 0;
          a.blockedBy = b.uid;
        }
        continue;
      }
      const g = seesAhead(me, b);
      if (g < 0) continue;
      if (!b.bus && me.uid < b.uid && seesAhead(b, me) >= 0) continue; // cùng chắn nhau: mình được đi trước
      const vb = Math.max(0, (g - me.l - b.l - 1.2) * 1.6);
      if (vb < v) {
        v = vb;
        a.blockedBy = b.uid; // để soi khi kẹt (?debug)
      }
    }
    a.blockT = v < 0.3 ? (a.blockT || 0) + dt : 0; // thời gian bị chặn liên tục (để soi khi kẹt)
    return v;
  }

  pickNext(node, prev, kind = 'car') {
    return pickNextNode(this.rng, node, prev, kind, this.floodIds);
  }

  // Mỗi khung hình cho xe đặc biệt đang ở gần: Jetjet bốc đầu + nẹt pô + câu trêu, shipper đối thủ / ba gác thỉnh thoảng nói
  // (sự kiện trả về cho game.js: 'npcRev' tiếng pô, 'npcLine' bong bóng thoại)
  specialTick(a, dt, ctx, events) {
    const d = Math.hypot(a.x - ctx.px, a.z - ctx.pz);
    a.talkCd -= dt;
    if (a.special === 'jetjet') {
      // bốc đầu ~2,4 s trên đoạn thẳng (xoay xe quanh bánh sau chạm đất)
      const bike = a.mesh.userData.bike;
      if (a.wh > 0) a.wh -= dt;
      else if (!a.turn && a.speed > 7 && d < 70 && this.rng.next() < (dt * (NPC_FLAVOR.wheeliePerMin ?? 2)) / 60) a.wh = 2.4;
      const k = a.wh > 0 ? Math.min(1, (2.4 - a.wh) * 3, a.wh * 3) : 0;
      if (k > 0 || bike.rotation.x !== 0) {
        const ang = -0.4 * k, z = -0.62;
        bike.rotation.x = ang;
        bike.position.set(0, z * Math.sin(ang), z - z * Math.cos(ang));
      }
      // xe dẫn nhóm chạy ngang người chơi: nẹt pô + hú hét
      if (!a.leader && d < 18 && a.talkCd <= 0) {
        a.talkCd = this.rng.range(9, 15);
        events.push({ type: 'npcRev', x: a.x, z: a.z });
        if (this.rng.chance(0.6)) events.push({ type: 'npcLine', obj: a, id: 'car:' + a.uid, key: 'bubble.jetjet' });
      }
    } else if (d < (a.special === 'rival' ? 10 : 8) && a.talkCd <= 0) {
      a.talkCd = this.rng.range(15, 30);
      if (this.rng.chance(0.4)) events.push({ type: 'npcLine', obj: a, id: 'car:' + a.uid, key: a.special === 'rival' ? 'bubble.rival' : 'bubble.bagac' });
    }
  }

  // Shipper hãng đối thủ đứng chờ lấy hàng trước quán ăn (spots: cửa các quán, game.js chọn theo dữ liệu → máy nào cũng giống):
  // xe dựng sát lề, người đứng cạnh xem điện thoại; người chơi tới gần thì thỉnh thoảng nói
  placeRivals(spots) {
    const brands = Object.values(BRANDS);
    if (!brands.length) return;
    this.rivalsWaiting = [];
    spots.forEach((s, k) => {
      const r = projectToRing(s.x, s.z, PED_LANE);
      if (isJoinedBlock(r.bx, r.bz) || isWaterBlock(r.bx, r.bz)) return;
      const b = brands[k % brands.length];
      const g = makeRivalWaiting(this.rng, parseInt(String(b.color).slice(1), 16), this.rng.pick(['cub', 'underbone', 'scooter']));
      const t = r.t + 2.2; // lệch khỏi cửa quán cho khỏi chắn lối vào
      const a = pedPos(r.bx, r.bz, t, 0.75), dir = pedPos(r.bx, r.bz, t + 1, 0.75);
      g.position.set(a.x, SW_H, a.z);
      g.rotation.y = Math.atan2(dir.x - a.x, dir.z - a.z) + 0.35; // dựng hơi xiên như xe đậu lề
      this.scene.add(g);
      this.grid?.add({ x0: a.x - 0.5, z0: a.z - 0.5, x1: a.x + 0.5, z1: a.z + 0.5, h: 1.2, tag: 'bike' });
      this.rivalsWaiting.push({ g, cd: this.rng.range(2, 8), id: k });
    });
  }

  // Vụ trộm chó theo lịch chung (sim/dogThief.js): xe trộm chạy tới chỗ con chó → dừng chĩa cây → chó chạy thoát → trộm rồ ga bỏ đi.
  // Vị trí tính thẳng từ (phút game − giờ bắt đầu) nên máy nào cũng giống. Người chơi bấm còi gần đó thì trộm bỏ chạy sớm
  // (riêng máy đó; game.js thưởng 1 lần mỗi vụ — chơi nhiều người thì máy chủ kiểm tra khoảng cách + giờ).
  thiefTick(dt, ctx, events) {
    for (const r of this.rivalsWaiting || []) {
      r.cd -= dt;
      if (r.cd <= 0 && Math.hypot(r.g.position.x - ctx.px, r.g.position.z - ctx.pz) < 7) {
        r.cd = this.rng.range(20, 40);
        events.push({ type: 'npcLine', obj: { mesh: r.g.userData.person }, id: 'rivalw:' + r.id, key: 'bubble.rivalWait' });
      }
    }
    const now = ctx.now;
    if (now == null) return;
    const mk = Math.floor(now);
    if (this.thiefMin !== mk) {
      this.thiefMin = mk;
      this.thiefEvt = activeThief(now, this.thiefSeed ?? 1);
    }
    const e = this.thiefEvt;
    let T = this.thiefObj;
    if (!e || Math.abs(e.x - ctx.px) > FAR || Math.abs(e.z - ctx.pz) > FAR) {
      if (T) T.bike.visible = T.dog.visible = false;
      return;
    }
    if (!T) {
      T = this.thiefObj = { bike: makeDogThief(this.rng), dog: makeDog(0xd9a15b), said: {} };
      this.scene.add(T.bike, T.dog);
    }
    if (T.id !== e.id) Object.assign(T, { id: e.id, scaredAt: null, said: {} });
    const el = now - e.at, S = thiefSpot(e.bx, e.bz, e.side, e.u), H = CITY.ROAD / 2;
    const [ix, iz] = S.inward, [dx, dz] = S.dir;
    const leaveAt = T.scaredAt ?? THIEF.leave;
    const fleeAt = Math.min(T.scaredAt ?? Infinity, THIEF.poke - 1.5);
    // xe trộm: làn bên phải sát lề, chạy chậm dần tới đối diện con chó, đứng chĩa cây, rồi rồ ga bỏ đi
    const sApproach = (x) => -40 * (1 - Math.min(1, x / THIEF.arrive)) ** 2;
    let sPos, v;
    if (el < leaveAt) {
      sPos = sApproach(Math.max(0, el));
      v = el < THIEF.arrive ? (80 / THIEF.arrive) * (1 - el / THIEF.arrive) : 0;
    } else {
      const s0 = sApproach(Math.min(leaveAt, THIEF.arrive)), u = el - leaveAt;
      sPos = s0 + 2.5 * u * u;
      v = 5 * u;
    }
    const bx = S.x + ix * (H - 1.3) + dx * sPos, bz = S.z + iz * (H - 1.3) + dz * sPos;
    T.bike.visible = el >= 0 && sPos < 70;
    T.bike.position.set(bx, 0, bz);
    T.bike.rotation.y = Math.atan2(dx, dz);
    const w = T.bike.userData.bike.userData;
    w.wheelF.rotation.x += (v * dt) / 0.32;
    w.wheelR.rotation.x += (v * dt) / 0.32;
    // chó: nằm chơi trên vỉa hè sát lề → sủa khi xe tới gần → chạy ngược chiều xe (trộm phải quay đầu mới đuổi được) rồi khuất
    const ox = S.x + ix * (H + 1.0), oz = S.z + iz * (H + 1.0);
    const run = el - fleeAt;
    T.dog.visible = el < THIEF.dogGone && run < 6;
    if (run > 0) {
      const back = 6.5 * run, side = Math.min(1.4, run * 1.5);
      T.dog.position.set(ox - dx * back + ix * side, SW_H, oz - dz * back + iz * side);
      T.dog.rotation.y = Math.atan2(-dx + ix * 0.3, -dz + iz * 0.3);
      const sw = Math.sin(run * 22) * 0.7;
      T.dog.userData.legs?.forEach((l, k) => (l.rotation.x = k % 2 ? sw : -sw));
    } else {
      T.dog.position.set(ox, SW_H, oz);
      T.dog.rotation.y = Math.atan2(-ix, -iz) + Math.sin(now * 0.2) * 0.6; // nhìn ra đường, quay qua quay lại
      T.dog.userData.legs?.forEach((l) => (l.rotation.x = 0));
    }
    const near = Math.hypot(bx - ctx.px, bz - ctx.pz) < 45 || Math.hypot(ox - ctx.px, oz - ctx.pz) < 45;
    const once = (k, ev) => {
      if (T.said[k]) return;
      T.said[k] = true;
      if (near) events.push(ev);
    };
    if (el > fleeAt - 1.2) once('bark', { type: 'dogBark', x: ox, z: oz });
    if (el > THIEF.arrive + 0.3 && T.scaredAt == null) once('line', { type: 'npcLine', obj: { mesh: T.bike }, id: 'thief', key: 'bubble.thief' });
    if (el > leaveAt) once('rev', { type: 'npcRev', x: bx, z: bz });
    // người chơi bấm còi gần xe trộm / con chó khi trộm chưa đi → trộm hoảng, bỏ chạy luôn
    const close = Math.hypot(bx - ctx.px, bz - ctx.pz) < 22 || Math.hypot(ox - ctx.px, oz - ctx.pz) < 22;
    if (ctx.honk && T.scaredAt == null && el >= 0 && el < THIEF.leave && close) {
      T.scaredAt = el;
      events.push({ type: 'npcLine', obj: { mesh: T.bike }, id: 'thief', key: 'bubble.thiefRun' });
      events.push({ type: 'thiefScared', id: e.id, x: bx, z: bz });
    }
  }

  // ---------------- người đi bộ ----------------
  // Người ngồi yên 1 chỗ (ăn xin): đặt cạnh cổng chùa, chợ, nhà thờ, bến xe… (spots: [{ x, z }] cửa các nơi đó, game.js truyền vào),
  // sát phía nhà (không chắn lối đi), lệch khỏi cửa 1,5 m, mặt quay ra đường
  placeStill(spots) {
    const ok = spots.filter((s) => { const r = projectToRing(s.x, s.z, PED_LANE); return !isJoinedBlock(r.bx, r.bz) && !isWaterBlock(r.bx, r.bz); });
    if (!ok.length) return;
    this.peds.filter((p) => p.still).forEach((p, k) => {
      const s = ok[k % ok.length], r = projectToRing(s.x, s.z, PED_LANE), lane = 2.65;
      Object.assign(p, { bx: r.bx, bz: r.bz, t: r.t + 1.5 + Math.floor(k / ok.length) * 2.5, lane, want: lane });
      const a = pedPos(p.bx, p.bz, p.t, lane), b = pedPos(p.bx, p.bz, p.t, 1);
      p.mesh.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    });
  }
  spawnPed(i) {
    const rng = this.rng;
    // tên có thể kèm thẻ vai "[veso] Cô bán vé số" (vi.json → ped.names): who = giới tính + tuổi + vai, để hình và lời nói khớp
    let raw = rng.pick(list('ped.names'));
    let who = personOf(raw);
    // người ngồi yên (ăn xin) chỉ đủ cho các cổng chùa / chợ / nhà thờ… (tối đa MAX_STILL người), dư thì chọn lại tên khác
    if (pedStyle(who, rng)?.still && this.peds.filter((p) => p.still).length >= MAX_STILL) {
      raw = rng.pick(list('ped.names').filter((n) => !pedStyle(personOf(n), rng)?.still));
      who = personOf(raw);
    }
    // tên không rõ nam / nữ ("Sinh viên", "Khách ngoại quốc"): mỗi người ngẫu nhiên, lưu lại để hình và lời nói luôn khớp
    if (who.guessed) who = personOf(raw, { gender: rng.chance(0.5) ? 'f' : 'm' });
    const name = who.name;
    // hình riêng theo vai / tuổi (world/npcStyles.js): quần áo, đồ đi kèm, tư thế, dáng đi
    const st = pedStyle(who, rng);
    const look = { ...randomPersonOpts(rng, who.gender), ...(st?.look || {}) };
    if (who.age === 'elder' && !st?.look?.hair) look.hair = 0x9a9a9a; // người già tóc bạc
    else if (who.age === 'kid' || who.age === 'young') look.hair = look.hair === 0x8d8d8d ? 0x1b1b1b : look.hair; // người trẻ không tóc bạc
    if (who.age === 'kid') look.scale = 0.85; // học sinh, trẻ con nhỏ hơn
    const mesh = makePerson(look);
    st?.dress?.(mesh);
    if (who.role === 'tiktok') holdPhone(mesh, rng.chance(0.5) ? 'vlog' : 'stick'); // TikToker: giơ điện thoại quay (kiểu A / B)
    this.scene.add(mesh);
    // khối có người đi bộ đông / vắng theo khu phố ("traffic")
    if (!this.pedBlocks) {
      this.pedBlocks = [];
      // khối đã gộp (sân bay…) không có vòng vỉa hè riêng → người đi bộ, chó không đi vòng khối đó
      for (let bz = 0; bz < CITY.N; bz++) for (let bx = 0; bx < CITY.N; bx++) if (!isJoinedBlock(bx, bz) && !isWaterBlock(bx, bz)) this.pedBlocks.push([bx, bz]);
      this.pedW = this.pedBlocks.map(([bx, bz]) => traitAtBlock(bx, bz, 'traffic') + 1e-3);
    }
    const [pbx, pbz] = rng.weighted(this.pedBlocks, this.pedW);
    this.peds.push({ id: i, mesh, bx: pbx, bz: pbz, t: rng.range(0, 140), speed: (who.role === 'tiktok' ? rng.range(0.55, 0.85) : rng.range(0.9, 1.4)) * (st?.speedMul ?? 1), still: !!st?.still, pause: st?.still ? Infinity : 0, dir: rng.chance(0.5) ? 1 : -1, talk: 0, knock: 0, phase: rng.range(0, 6), name, who, x: 0, z: 0, asked: false, lane: PED_LANE, want: PED_LANE, probe: 0 });
  }

  // Người đi bộ nhìn trước ~1,5 m: bị chắn thì lệch nhẹ sang làn trống (tối đa 0,5 m); không qua được thì đứng đợi, đợi lâu mới quay đầu.
  // Hết vật cản thì từ từ về làn giữa. Kiểm tra ~6 lần mỗi giây cho nhẹ. Cần this.grid (lưới va chạm của thành phố).
  pedAvoid(p, dt, ctx) {
    p.probe -= dt;
    if (p.probe > 0 || !this.grid) return;
    p.probe = 0.1;
    const free = (lane) => {
      for (const ahead of [0.3, 0.8, 1.5]) {
        const q = pedPos(p.bx, p.bz, p.t + p.dir * ahead, lane);
        if (!circleFree(this.grid, q.x, q.z, 0.3, SW_H)) return false;
        if (Math.hypot(q.x - ctx.px, q.z - ctx.pz) < 0.8) return false; // người chơi đứng chắn
      }
      return true;
    };
    if (free(p.want)) {
      if (p.want !== PED_LANE && free(PED_LANE)) p.want = PED_LANE; // hết vật cản: về làn giữa
      return;
    }
    const lane = PED_LANES.find((l) => free(l));
    if (lane != null) {
      p.want = lane;
      p.stuck = 0;
      return;
    }
    // lệch nhẹ không qua được: đứng đợi (người / xe chắn thường tự đi); đợi lâu vẫn kẹt (vật cố định) thì quay đầu
    p.stuck = (p.stuck || 0) + 0.4;
    p.pause = 0.4;
    if (p.stuck > 6) {
      p.dir *= -1;
      p.stuck = 0;
    }
  }

  spawnDog() {
    const rng = this.rng;
    const mesh = makeDog(rng.pick([0xd9a15b, 0xc2873f, 0xe2b878, 0xcf9a52])); // chó ta vàng: vàng đậm / vàng / vàng nhạt
    this.scene.add(mesh);
    let bx = rng.int(0, CITY.N - 1), bz = rng.int(0, CITY.N - 1);
    for (let k = 0; k < 20 && (isJoinedBlock(bx, bz) || isWaterBlock(bx, bz)); k++) [bx, bz] = [rng.int(0, CITY.N - 1), rng.int(0, CITY.N - 1)];
    if (isJoinedBlock(bx, bz) || isWaterBlock(bx, bz)) [bx, bz] = rng.pick(landBlocks()); // thử mãi không trúng: lấy khối đất chắc chắn
    this.dogs.push({ mesh, bx, bz, t: rng.range(0, 140), speed: 0.8, dir: 1, state: 'wander', vx: 0, vz: 0, timer: 0, armed: true, x: 0, z: 0, phase: 0, pause: 0 });
  }

  // (x, z) là mặt nước (sông, kênh, bờ kè)? Cần lưới va chạm của thành phố (game.js gán traffic.grid)
  isWater(x, z) {
    return !!this.grid?.inside(x, 0.1, z, WATER_TAGS);
  }

  // ---------------- kẹt xe ----------------
  buildJamMeshes() {
    // hình ô tô / xe máy giản lược (thân trắng → nhận màu từng chiếc; kính, lốp giữ màu tối)
    this.jamCarMesh = new THREE.InstancedMesh(jamCarGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.4, metalness: 0.2 }), 220);
    this.jamCarMesh.count = 0;
    this.jamCarMesh.castShadow = true;
    this.jamMotoMesh = new THREE.InstancedMesh(jamMotoGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 }), 260);
    this.jamMotoMesh.count = 0;
    this.jamMotoMesh.castShadow = true;
    this.scene.add(this.jamCarMesh, this.jamMotoMesh);
  }

  // Đoạn đường đang ngập sâu (mã đoạn): xe NPC chọn đường khác khi tới ngã tư
  setFlood(ids) {
    this.floodIds = new Set(ids);
  }

  setJams(segments) {
    const keys = new Set(segments.map(segKey));
    if (keys.size === this.jamKeys.size && [...keys].every((k) => this.jamKeys.has(k))) return;
    this.jamKeys = keys;
    this.jamRects = segments.map(segmentRect); // để biết người chơi có đang đứng trong đoạn kẹt xe không (không tính cản trở)
    this.jamCircles = [];
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let nc = 0, nm = 0;
    for (const s of segments) {
      const r = segmentRect(s);
      const alongX = s.axis === 'z';
      const a0 = alongX ? r.x0 : r.z0, a1 = alongX ? r.x1 : r.z1;
      const mid = alongX ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
      // làn theo cấp đường: đường nhỏ chỉ kẹt xe máy (2 hàng sát nhau), đại lộ ô tô làn trong, xe máy làn ngoài
      const g = TIER_GEO[tierOf(segKey(s))];
      const carLanes = g.half >= 5 ? [g.carLane] : [];
      const motoLanes = g.half >= 5 ? [g.motoLane] : [g.carLane - 0.3, g.motoLane + 0.3];
      for (const side of [-1, 1]) {
        for (const lane of carLanes) for (let a = a0 + 3; a < a1 - 3 && nc < 220; a += 5.6 + this.rng.next() * 1.5) {
          const lat = mid + side * (lane + this.rng.range(-0.25, 0.25));
          const x = alongX ? a : lat, z = alongX ? lat : a;
          dummy.position.set(x, 0, z);
          dummy.rotation.set(0, (alongX ? Math.PI / 2 : 0) + (side > 0 ? Math.PI : 0), 0);
          dummy.updateMatrix();
          this.jamCarMesh.setMatrixAt(nc, dummy.matrix);
          this.jamCarMesh.setColorAt(nc, col.setHex(this.rng.pick(CAR_COLORS)));
          nc++;
          this.jamCircles.push({ x: x + (alongX ? 1.1 : 0), z: z + (alongX ? 0 : 1.1), r: 1.05 }, { x: x - (alongX ? 1.1 : 0), z: z - (alongX ? 0 : 1.1), r: 1.05 });
        }
        for (const lane of motoLanes) for (let a = a0 + 2; a < a1 - 2 && nm < 260; a += 2.2 + this.rng.next()) {
          const lat = mid + side * (lane + this.rng.range(-0.3, 0.3));
          const x = alongX ? a : lat, z = alongX ? lat : a;
          dummy.position.set(x, 0, z);
          dummy.rotation.set(0, (alongX ? Math.PI / 2 : 0) + (side > 0 ? Math.PI : 0), 0);
          dummy.updateMatrix();
          this.jamMotoMesh.setMatrixAt(nm, dummy.matrix);
          this.jamMotoMesh.setColorAt(nm, col.setHex(this.rng.pick(MOTO_COLORS)));
          nm++;
        }
      }
    }
    this.jamCarMesh.count = nc;
    this.jamMotoMesh.count = nm;
    this.jamCarMesh.instanceMatrix.needsUpdate = this.jamMotoMesh.instanceMatrix.needsUpdate = true;
    if (this.jamCarMesh.instanceColor) this.jamCarMesh.instanceColor.needsUpdate = true;
    if (this.jamMotoMesh.instanceColor) this.jamMotoMesh.instanceColor.needsUpdate = true;
    // Tính lại vùng bao theo vị trí xe mới. Không có bước này, Three.js giữ vùng bao tính lúc chưa có xe
    // (rỗng) → tưởng cả đám xe nằm ngoài tầm nhìn nên không vẽ (lỗi: giờ cao điểm không thấy xe kẹt).
    for (const m of [this.jamCarMesh, this.jamMotoMesh]) {
      m.computeBoundingSphere();
      if (m.boundingBox) m.computeBoundingBox();
    }
  }

  // ---------------- CSGT ----------------
  setPolice(list) {
    const ids = new Set(list.map((p) => p.id));
    for (const [id, g] of this.police) {
      if (!ids.has(id)) {
        this.scene.remove(g);
        this.police.delete(id);
      }
    }
    for (const p of list) {
      if (this.police.has(p.id)) continue;
      const g = new THREE.Group();
      const x = roadPos(p.node[0]), z = roadPos(p.node[1]);
      g.position.set(x, 0, z);
      for (const [ox, oz, ry] of [[2.5, 2.5, -2.3], [-2.5, -2.2, 0.8]]) {
        const o = makePerson({ shirt: 0xd8c25a, pants: 0x2e5d3a, hat: 'police' });
        o.position.set(ox, 0, oz);
        o.rotation.y = ry;
        o.userData.parts.armR.rotation.x = -1.2;
        g.add(o);
      }
      for (let k = 0; k < 6; k++) {
        const c = makeCone();
        const a = (k / 6) * Math.PI * 2;
        c.position.set(Math.cos(a) * 5.2, 0, Math.sin(a) * 5.2);
        g.add(c);
      }
      this.scene.add(g);
      this.police.set(p.id, g);
    }
  }

  // Điểm (x, z) nằm trong đoạn đường đang kẹt xe (nới 2 m)? Kẹt xe thì xe nào cũng đứng → không đổ lỗi cản trở cho người chơi
  inJam(x, z) {
    return (this.jamRects || []).some((r) => x > r.x0 - 2 && x < r.x1 + 2 && z > r.z0 - 2 && z < r.z1 + 2);
  }
  // Có tính người chơi là "cản trở giao thông" không: không tính khi đang kẹt xe hoặc người chơi đang chạy theo dòng xe
  blameable(ctx) {
    return !this.inJam(ctx.px, ctx.pz) && !(ctx.onBike && (ctx.speed ?? 0) > 1.5);
  }

  // ---------------- cập nhật mỗi khung hình ----------------
  // ctx: { px, pz, onBike, speed, fx, fz, night, hour (giờ trong ngày, có lẻ — xe đặc biệt chạy theo giờ), now (phút game), honk (vừa bấm còi) }
  update(dt, ctx) {
    const events = [];
    this.honkCd -= dt;
    this.blockedByPlayer = false; // khung hình này có xe NPC phải dừng vì người chơi đứng chắn (game đếm để công an nhắc)
    // NPC ở xa người chơi (ngoài tầm nhìn sương mù) thì ẩn và cập nhật đơn giản để đỡ nặng máy
    const far = (x, z) => Math.abs(x - ctx.px) > FAR || Math.abs(z - ctx.pz) > FAR;
    // xe NPC — ẩn / hiện có vùng đệm 2 phía mép tầm nhìn (xe không bật tắt liên tục ở mép)
    this.clock = (this.clock || 0) + dt;
    // xe đặc biệt ngoài giờ chạy (Jetjet ban ngày, ba gác ban đêm): ẩn, đứng yên, không tính nhường / va chạm
    for (const a of this.agents) {
      if (!a.hours || ctx.hour == null) continue;
      const [h0, h1] = a.hours, h = ctx.hour < h0 && h1 > 24 ? ctx.hour + 24 : ctx.hour;
      a.off = !(h >= h0 && h < h1);
      if (a.off) a.mesh.visible = false;
    }
    for (const a of this.agents) {
      const d = Math.max(Math.abs(a.x - ctx.px), Math.abs(a.z - ctx.pz));
      a.isFar = a.isFar ? d > FAR - 8 : d > FAR + 8;
    }
    this.vehicles = this.collectVehicles(far); // xe đang hiện (để nhường nhau)
    this.onSeg = new Map(); // "from>to" → xe đang chạy trên đoạn đó (ngoài ngã tư)
    for (const a of this.agents) {
      if (a.turn || a.isFar || a.off) continue;
      const k = a.from + '>' + a.to;
      if (!this.onSeg.has(k)) this.onSeg.set(k, []);
      this.onSeg.get(k).push(a);
    }
    // xe ở xa: gom theo đoạn đường + loại xe để giữ khoảng cách (lúc hiện ra không bị chồng lên nhau)
    const farSeg = new Map();
    for (const a of this.agents) {
      if (!a.isFar || a.off) continue;
      const k = a.kind + a.from + '>' + a.to;
      if (!farSeg.has(k)) farSeg.set(k, []);
      farSeg.get(k).push(a);
    }
    for (const a of this.agents) {
      if (a.off) continue;
      let v = a.maxSpeed;
      if (a.isFar) {
        // ở xa: vẫn chạy theo đường (để lúc lại gần có xe), không xét chắn đường, không vẽ
        a.mesh.visible = false;
        for (const b of farSeg.get(a.kind + a.from + '>' + a.to) || []) {
          const gap = b.t - a.t;
          if (b !== a && gap > 0 && gap < 9) v = Math.min(v, Math.max(0, (gap - 5) * 1.5));
        }
        a.speed = v;
        this.leaveNode(a);
        if (a.turn) {
          a.t = CITY.PITCH - TURN_R + a.cu; // đang cua thì giữ quãng đã đi (không quay lại vạch)
          a.turn = null;
        }
        a.t += v * dt;
        if (a.t >= CITY.PITCH) {
          if (!a.next) a.next = this.nextOf(a);
          const din = [a.to[0] - a.from[0], a.to[1] - a.from[1]], me = { din, kind: turnKind(din, this.dirTo(a.to, a.next, din)), vk: a.kind };
          const key = a.to.join(','), last = (this.farPass ||= new Map()).get(key) || [];
          if (last.some((o) => this.clock - o.at < 1.2 && crosses(me, o))) {
            a.t = CITY.PITCH - 0.01; // chờ xe cắt ngang qua hết (như xe ở gần, để mật độ xe hai vùng như nhau)
            a.speed = 0;
          } else {
            last.push({ ...me, at: this.clock });
            this.farPass.set(key, last.filter((o) => this.clock - o.at < 1.2));
            a.t -= CITY.PITCH;
            a.from = a.to;
            a.to = a.next;
            a.next = null;
            a.lane = this.laneOf(a);
          }
        }
        a.dx = a.to[0] - a.from[0];
        a.dz = a.to[1] - a.from[1];
        a.x = roadPos(a.from[0]) + a.dx * a.t + -a.dz * a.lane;
        a.z = roadPos(a.from[1]) + a.dz * a.t + a.dx * a.lane;
        a.heading = Math.atan2(a.dx, a.dz);
        continue;
      }
      a.mesh.visible = true;
      const din = [a.to[0] - a.from[0], a.to[1] - a.from[1]];
      if (this.jamKeys.has(segKeyOf(a.from, a.to))) v = 0.9;
      // chọn trước hướng đi ở ngã tư sắp tới; sắp rẽ thì giảm tốc dần
      if (!a.next && a.t > CITY.PITCH - TURN_R - 14) a.next = this.nextOf(a);
      if (a.next) {
        const nk = a.turn ? a.turn.kind : turnKind(din, this.dirTo(a.to, a.next, din));
        if (nk !== 'straight') v = Math.min(v, TURN_V[nk] + Math.max(0, CITY.PITCH - TURN_R - a.t) * 0.5);
        // ngã tư phía trước đang có xe cắt ngang / xe tới trước đang chờ → chậm lại, dừng ở vạch vào cua
        if (!a.turn && a.t > CITY.PITCH - TURN_R - 8) {
          a.canGo = this.canEnter(a, din, nk);
          if (!a.canGo) v = Math.min(v, Math.max(0, (CITY.PITCH - TURN_R - 0.3 - a.t) * 1.5));
        }
      }
      // xe khác / xe buýt / xe vòng sân bay chắn trước (nhường theo ưu tiên)
      const me = this.bodyOf(a);
      v = Math.min(v, this.yieldTo(me, dt, a));
      // xe này lẽ ra còn chạy được không (không vướng xe trước, không chờ ở ngã tư, không đoạn kẹt) — đứng sẵn rồi thì
      // người chơi phía trước không phải lý do xe phải dừng → không tính cản trở, không bóp còi / chửi
      const vFree = a.stop > 0 ? 0 : v;
      // người chơi hoặc chó chắn trước mặt → dừng, bóp còi
      const blockers = [{ x: ctx.px, z: ctx.pz, player: true }, ...this.dogs.filter((d) => d.state !== 'wander')];
      let byPlayer = false;
      for (const p of blockers) {
        const ox = p.x - a.x, oz = p.z - a.z;
        const along = ox * me.hx + oz * me.hz, lat = -ox * me.hz + oz * me.hx;
        if (p.player && Math.abs((ctx.py ?? 0) - 0) > 1.5) continue; // người chơi đang trên cầu
        if (along > 0 && along < (a.kind === 'car' ? 7 : 5) && Math.abs(lat) < 1.8) {
          v = 0;
          if (p.player && (vFree < 1 || !this.blameable(ctx))) continue;
          if (p.player) this.blockedByPlayer = byPlayer = true;
          if (p.player && a.honk <= 0 && a.speed < 1) {
            a.honk = 4 + this.rng.next() * 4;
            if (this.honkCd <= 0 && Math.hypot(ox, oz) < 14) {
              events.push({ type: 'honk', kind: a.kind });
              this.honkCd = 1.5;
            }
          }
        }
      }
      yellTick(a, byPlayer, dt, events, { id: `car:${a.uid}`, car: a.kind === 'car' });
      a.honk -= dt;
      if (a.stop > 0) {
        a.stop -= dt;
        v = 0;
      }
      a.speed += Math.max(-8 * dt, Math.min(3 * dt, v - a.speed));
      const step = a.speed * dt;
      if (!a.turn) {
        a.t += step;
        // tới đầu cua: dựng cung rẽ sang đường mới (đi thẳng cũng qua cung để đổi làn mượt khi khác cấp đường)
        if (a.t >= CITY.PITCH - TURN_R && a.next && !this.canEnter(a, din, turnKind(din, this.dirTo(a.to, a.next, din)))) {
          a.t = CITY.PITCH - TURN_R - 0.01; // chưa được vào ngã tư: đứng ở vạch
          a.speed = 0;
        }
        if (a.t >= CITY.PITCH - TURN_R) {
          if (!a.next) a.next = this.nextOf(a);
          const dout = this.dirTo(a.to, a.next, din);
          const lout = this.laneOf({ kind: a.kind, from: a.to, to: a.next });
          a.turn = makeTurn(roadPos(a.to[0]), roadPos(a.to[1]), din, dout, a.lane, lout);
          a.turn.lout = lout;
          a.cu = a.t - (CITY.PITCH - TURN_R);
          this.enterNode(a, din, a.turn.kind);
        }
      } else a.cu += step;
      if (a.inNode && a.turn && a.cu >= a.turn.len - 2.5) this.leaveNode(a); // đã ra khỏi lòng ngã tư: nhả chỗ
      if (a.turn && a.cu >= a.turn.len) {
        // ra khỏi cua: sang đoạn đường mới
        const extra = a.cu - a.turn.len;
        this.leaveNode(a);
        const back = a.next[0] === a.to[0] && a.next[1] === a.to[1]; // ngã tư không lối ra (hiếm): quay về đường cũ
        const nf = a.to, nt = back ? a.from : a.next;
        a.from = nf;
        a.to = nt;
        a.next = null;
        a.lane = a.turn.lout;
        a.turn = null;
        a.t = TURN_R + extra;
      }
      if (a.turn) {
        const u = Math.min(1, a.cu / a.turn.len), T = a.turn;
        const p = bez(T.E, T.C, T.X, u), d = bezDir(T.E, T.C, T.X, u);
        a.x = p[0];
        a.z = p[1];
        const L = Math.hypot(d[0], d[1]) || 1;
        a.dx = d[0] / L;
        a.dz = d[1] / L;
      } else {
        // Jetjet lạng lách: làn lắc qua lại quanh làn xe máy
        const weave = a.special === 'jetjet' ? Math.sin(this.clock * 0.9 + a.phase) * 0.6 : 0;
        a.lane += (this.laneOf(a) + weave - a.lane) * Math.min(1, dt * 2.5);
        const ndx = a.to[0] - a.from[0], ndz = a.to[1] - a.from[1];
        a.dx = ndx;
        a.dz = ndz;
        a.x = roadPos(a.from[0]) + ndx * a.t + -ndz * a.lane;
        a.z = roadPos(a.from[1]) + ndz * a.t + ndx * a.lane;
      }
      const hd = Math.atan2(a.dx, a.dz);
      let d = hd - a.heading;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      a.heading += d * Math.min(1, dt * 14);
      // lên cầu (cầu vòm cao, cầu kênh vồng): độ cao theo mặt cầu, ngóc / chúi theo dốc
      const el = this.elev;
      a.y = el ? el.topAt(a.x, a.z) : 0;
      let pitch = 0;
      if (el && (a.y > 0.01 || el.topAt(a.x + a.dx * 3, a.z + a.dz * 3) > 0.01)) pitch = Math.atan2(el.topAt(a.x + a.dx * 1.5, a.z + a.dz * 1.5) - el.topAt(a.x - a.dx * 1.5, a.z - a.dz * 1.5), 3);
      a.mesh.position.set(a.x, a.y, a.z);
      a.mesh.rotation.set(-pitch, a.heading, 0, 'YXZ');
      if (a.kind === 'moto') {
        const ud = a.mesh.userData, w = ud.bike?.userData;
        const wheels = ud.wheels || [w.wheelF, w.wheelR], r = ud.wheelRadius || 0.32;
        for (const wh of wheels) wh.rotation.x += (a.speed * dt) / r;
      }
      if (a.special) this.specialTick(a, dt, ctx, events);
    }
    this.thiefTick(dt, ctx, events);
    this.updateLoops(dt, ctx, far, events);

    // người đi bộ
    for (const p of this.peds) {
      if (far(p.x, p.z)) {
        p.mesh.visible = false;
        if (p.x !== 0 || p.z !== 0) continue; // chưa đặt chỗ lần nào thì tính 1 lần bên dưới
      } else p.mesh.visible = true;
      p.phase += dt * 4;
      let moving = false;
      if (p.knock > 0) {
        p.knock -= dt;
        p.mesh.rotation.x = p.knock > 0.4 ? -1.3 : 0;
      } else if (p.talk > 0) {
        p.talk -= dt;
        p.mesh.rotation.y = Math.atan2(ctx.px - p.x, ctx.pz - p.z);
      } else if (p.pause > 0) p.pause -= dt;
      else {
        p.t += p.speed * p.dir * dt;
        moving = true;
        if (this.rng.next() < dt * 0.05) p.pause = this.rng.range(2, 5);
        if (this.rng.next() < dt * 0.015) p.dir *= -1;
      }
      // né vật cản trên vỉa hè (cây, cột, trạm xe buýt, xe dựng…) và người chơi: bước lệch làn, hết lối thì quay đầu
      if (moving && !far(p.x, p.z)) this.pedAvoid(p, dt, ctx);
      p.lane += ((p.want ?? PED_LANE) - p.lane) * Math.min(1, dt * 2.5); // bước lệch từ từ, không giật
      const pos = pedPos(p.bx, p.bz, p.t, p.lane);
      if (moving) {
        const nxt = pedPos(p.bx, p.bz, p.t + p.dir * 0.2, p.lane);
        p.mesh.rotation.y = Math.atan2(nxt.x - pos.x, nxt.z - pos.z);
      }
      p.x = pos.x;
      p.z = pos.z;
      p.mesh.position.set(pos.x, SW_H, pos.z);
      animatePerson(p.mesh, p.phase, moving ? 0.6 : 0);
    }

    // chó
    for (const d of this.dogs) {
      if (d.state === 'wander' && far(d.x, d.z)) {
        d.mesh.visible = false;
        if (d.x !== 0 || d.z !== 0) continue;
      } else d.mesh.visible = true;
      d.phase += dt * 10;
      if (d.state === 'wander') {
        if (d.pause > 0) d.pause -= dt;
        else {
          d.t += d.speed * d.dir * dt;
          if (this.rng.next() < dt * 0.1) d.pause = this.rng.range(1, 4);
          if (this.rng.next() < dt * 0.05) d.dir *= -1;
        }
        const pos = ringPos(d.bx, d.bz, d.t, 0.7);
        const nxt = ringPos(d.bx, d.bz, d.t + d.dir * 0.2, 0.7);
        d.mesh.rotation.y = Math.atan2(nxt.x - pos.x, nxt.z - pos.z);
        d.x = pos.x;
        d.z = pos.z;
        // lao qua đường trước mũi xe
        const ox = d.x - ctx.px, oz = d.z - ctx.pz;
        const dist = Math.hypot(ox, oz);
        if (dist > 40) d.armed = true;
        if (d.armed && ctx.onBike && ctx.speed > 6 && dist > 10 && dist < 26) {
          const ahead = (ox * ctx.fx + oz * ctx.fz) / dist;
          if (ahead > 0.8) {
            d.armed = false;
            const along = ox * ctx.fx + oz * ctx.fz;
            const tx = ctx.px + ctx.fx * along, tz = ctx.pz + ctx.fz * along;
            const L = Math.hypot(tx - d.x, tz - d.z) || 1;
            // đường lao (cả 7 m chạy quá) cắt qua sông / kênh → không lao
            const wet = Array.from({ length: 8 }, (_, k) => (k + 1) / 8).some((u) => this.isWater(d.x + ((tx - d.x) / L) * (L + 7) * u, d.z + ((tz - d.z) / L) * (L + 7) * u));
            if (!wet && this.rng.chance(HAZARD.dogDartChance)) {
              d.vx = ((tx - d.x) / L) * 6.5;
              d.vz = ((tz - d.z) / L) * 6.5;
              d.timer = (L + 7) / 6.5;
              d.state = 'dart';
              events.push({ type: 'dogDart' });
            }
          }
        }
      } else {
        if (d.state === 'return') {
          // chạy lon ton về lại vòng vỉa hè khối nhà của mình (không nhảy sang khối khác / khối sông)
          const q = ringPos(d.bx, d.bz, d.t, 0.7), dx = q.x - d.x, dz = q.z - d.z, L = Math.hypot(dx, dz);
          if (L < 0.3) { d.state = 'wander'; d.x = q.x; d.z = q.z; }
          else { d.vx = (dx / L) * 3.5; d.vz = (dz / L) * 3.5; }
        }
        if (d.state !== 'wander') {
          const nx = d.x + d.vx * dt, nz = d.z + d.vz * dt;
          // phía trước là nước: dừng lao, quay về (chó không bơi qua sông)
          const wet = this.isWater(nx, nz);
          if (wet && d.state !== 'return') d.timer = 0;
          else if (wet) Object.assign(d, { ...ringPos(d.bx, d.bz, d.t, 0.7), state: 'wander' }); // đường về vướng nước (hiếm): về thẳng chỗ cũ
          else { d.x = nx; d.z = nz; }
          d.timer -= dt;
          d.mesh.rotation.y = Math.atan2(d.vx, d.vz);
          if (d.state !== 'return' && d.timer <= 0) {
            d.t = projectToRing(d.x, d.z, 0.7, d.bx, d.bz).t;
            d.state = 'return';
          }
        }
      }
      d.mesh.position.set(d.x, d.state === 'wander' ? SW_H : this.elev ? this.elev.topAt(d.x, d.z) : 0, d.z);
      const legs = d.mesh.userData.legs;
      const amp = d.state === 'wander' ? (d.pause > 0 ? 0 : 0.4) : 0.9;
      legs.forEach((l, k) => (l.rotation.x = Math.sin(d.phase + (k % 2) * Math.PI) * amp));
    }
    return events;
  }

  // Va chạm giữa người chơi (xe hoặc đi bộ) với xe NPC, người, chó, xe kẹt
  // py: cao độ người chơi (đang trên cầu) — xe chạy vòng khác tầng thì không chạm
  collidePlayer(pos, r, vel, onBike, py = 0) {
    const hits = [];
    const speed = Math.hypot(vel.x, vel.y);
    const test = (cx, cz, cr, avx, avz, what, obj) => {
      const n = pushCircle(pos, r, cx, cz, cr);
      if (!n) return;
      const into = -((vel.x - avx) * n.x + (vel.y - avz) * n.z);
      hits.push({ what, n, into, obj });
    };
    for (const a of this.agents) {
      if (a.off || Math.abs((a.y || 0) - py) > 1.5) continue; // ngoài giờ chạy · khác tầng (trên cầu / dưới đất)
      const avx = a.dx * a.speed, avz = a.dz * a.speed;
      if (a.kind === 'car' || a.special === 'bagac') {
        const k = a.kind === 'car' ? 1.1 : 0.8, r = a.kind === 'car' ? 1.05 : 0.8;
        test(a.x + a.dx * k, a.z + a.dz * k, r, avx, avz, a.kind, a);
        test(a.x - a.dx * k, a.z - a.dz * k, r, avx, avz, a.kind, a);
      } else test(a.x, a.z, 0.55, avx, avz, 'moto', a);
    }
    for (const a of this.loopCars) {
      if (!a.mesh.visible || Math.abs(a.y - py) > 1.5) continue;
      const avx = a.dx * a.speed, avz = a.dz * a.speed;
      test(a.x + a.dx * 1.1, a.z + a.dz * 1.1, 1.05, avx, avz, 'car', a);
      test(a.x - a.dx * 1.1, a.z - a.dz * 1.1, 1.05, avx, avz, 'car', a);
    }
    for (const b of this.buses) {
      if (!b.mesh.visible) continue;
      for (const o of [-3.75, -1.25, 1.25, 3.75]) test(b.x + b.dx * o, b.z + b.dz * o, 1.3, b.dx * b.speed, b.dz * b.speed, 'car', null);
    }
    for (const c of this.jamCircles) test(c.x, c.z, c.r, 0, 0, 'car', null);
    for (const p of this.peds) {
      if (p.knock > 0) continue;
      test(p.x, p.z, 0.32, 0, 0, 'ped', p);
    }
    for (const d of this.dogs) test(d.x, d.z, 0.42, d.state === 'wander' ? 0 : d.vx, d.state === 'wander' ? 0 : d.vz, 'dog', d);
    // phản ứng của NPC bị đâm
    for (const h of hits) {
      if (h.obj && (h.what === 'car' || h.what === 'moto') && h.into > 1) h.obj.stop = 2.5;
      if (h.what === 'ped' && onBike && speed > 2) h.obj.knock = 1.4;
      if (h.what === 'dog' && speed > 1.5) {
        const d = h.obj;
        d.state = 'flee';
        d.vx = -h.n.x * 7;
        d.vz = -h.n.z * 7;
        d.timer = 2;
      }
    }
    return hits;
  }

  nearestPed(x, z, maxD) {
    let best = null, bd = maxD;
    for (const p of this.peds) {
      if (p.knock > 0) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }
}
