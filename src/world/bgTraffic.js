// XE NỀN (chỉ để nhìn): xe máy chạy ở xa người chơi cho đường phố đông vui mà không nặng máy.
// - Không va chạm, không tính luật, không bóp còi. Chạy theo làn xe máy, tới ngã tư rẽ như xe NPC (pickNextNode, makeTurn).
// - Chỉ có trong vùng từ "near" tới "far" quanh người chơi (thẻ ⚖️ Cân bằng → Xe nền). Chạy vào gần (< near) hoặc ra quá xa
//   thì MỜ DẦN rồi biến mất (lấm tấm điểm ảnh, không cần xếp thứ tự trong suốt), sau đó hiện lại ở chỗ khác phía xa.
// - Khu đông / vắng: districts[mã].street.flow (thẻ 🗺️ Bản đồ → Khu phố → 🏍️ Xe chạy nền), 2 = đông nhất.
// - Vẽ gộp InstancedMesh bằng mẫu khối hộp nhẹ: cả đàn xe chỉ 5 lần vẽ, màu sơn / áo / mũ khác nhau theo từng xe.
// - Phần chạy (BgTraffic) không cần Three.js để bộ thử chạy được trong Node; chỉ dựng hình khi có scene.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, roadPos, neighbors, districtAtPoint } from '../sim/cityLayout.js';
import { TIER_GEO, tierBetween } from '../sim/roads.js';
import { streetOf } from '../data/districtTraits.js';
import { BG_TRAFFIC } from '../data/balance.js';
import { makeRng } from '../sim/rng.js';
import { TURN_R, makeTurn, bez, bezDir, pickNextNode } from './traffic.js';

const POOL_MAX = 300;
const ON_LINE = 15; // đường người chơi đang ở (nhìn thấy xa nhất): rải xe gấp mấy lần đường khác
const LIFE = [15, 30]; // giây: xe ở đường khác (khuất sau nhà) chạy chừng này rồi mờ đi, nhường chỗ rải lại
const FADE = 0.7; // giây mờ dần / hiện dần
const TURN_V = { straight: 99, right: 4.5, left: 5.5, uturn: 3 };
const COLORS = [0xc0392b, 0x2c3e50, 0xecf0f1, 0x8e44ad, 0x2980b9, 0xd35400, 0x1abc9c, 0x111111, 0x7f8c8d];

const num = (v, d) => (Number.isFinite(v) ? v : d);
const keyOf = (a, b) => a + '>' + b;

export class BgTraffic {
  // opts: { scene, seed, density(x, z) → 0..2 (mặc định theo khu), cfg (mặc định BG_TRAFFIC) }
  constructor(opts = {}) {
    this.cfg = opts.cfg || BG_TRAFFIC;
    this.rng = makeRng(opts.seed ?? 4242);
    this.density = opts.density || ((x, z) => streetOf(districtAtPoint(x, z), 'flow'));
    const n = Math.max(0, Math.min(POOL_MAX, Math.round(num(this.cfg.max, 70))));
    this.bikes = Array.from({ length: n }, (_, i) => ({ i, on: false, wait: 0, fade: 0, dying: false, x: 0, y: 0, z: 0, heading: 0, color: COLORS[i % COLORS.length] }));
    // mọi đoạn đường 2 chiều (from → to)
    this.segs = [];
    for (let i = 0; i <= CITY.N; i++) for (let j = 0; j <= CITY.N; j++) for (const nb of neighbors(i, j)) this.segs.push({ from: [i, j], to: nb, mx: (roadPos(i) + roadPos(nb[0])) / 2, mz: (roadPos(j) + roadPos(nb[1])) / 2 });
    this.near = [];
    this.nearT = 0;
    this.first = true;
    this.limit = 0;
    this.view = opts.scene ? new BgView(opts.scene, this.bikes) : null;
  }
  // đoạn from → to nằm trên đường dọc / ngang người chơi đang ở
  onLine(from, to) {
    return (from[0] === to[0] && from[0] === this.lx) || (from[1] === to[1] && from[1] === this.lz);
  }
  get active() {
    return this.bikes.filter((b) => b.on).length;
  }
  laneFor(b, from, to) {
    const g = TIER_GEO[tierBetween(from, to)];
    return Math.max(1, Math.min(g.half - 0.8, g.motoLane + b.off));
  }
  // đặt xe vào một chỗ ngẫu nhiên trên đường trong vòng [d0, d1] quanh người chơi (không được thì chờ thử lại)
  spawn(b, px, pz, d0, d1) {
    const r = this.rng;
    for (let k = 0; k < 8 && this.near.length; k++) {
      const s = r.weighted(this.near, this.nearW);
      const t = r.range(TURN_R + 1, CITY.PITCH - TURN_R - 1);
      const dx = s.to[0] - s.from[0], dz = s.to[1] - s.from[1];
      const x = roadPos(s.from[0]) + dx * t, z = roadPos(s.from[1]) + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < d0 || d > d1) continue;
      if (!r.chance(Math.min(1, this.density(x, z) / 2))) continue; // khu vắng: ít xe
      b.off = r.range(-1.6, 0.4); // lệch làn: xe máy chạy tràn, không thành 1 hàng
      Object.assign(b, { on: true, dying: false, fade: 0, from: s.from, to: s.to, next: null, turn: null, cu: 0, t, life: r.range(LIFE[0], LIFE[1]) });
      b.lane = this.laneFor(b, s.from, s.to);
      b.speed = b.vmax = r.range(num(this.cfg.speedMin, 7), Math.max(num(this.cfg.speedMin, 7), num(this.cfg.speedMax, 10.5)));
      this.place(b, 0);
      return true;
    }
    b.wait = r.range(0.3, 0.8);
    return false;
  }
  // ctx: { onSeg (xe NPC thật theo đoạn, traffic.onSeg), floodIds, elev, dt }
  update(dt, px, pz, ctx = {}) {
    if (!this.bikes.length) return;
    const near = num(this.cfg.near, 35), far = Math.max(near + 20, num(this.cfg.far, 140));
    // đoạn đường trong tầm (tính lại mỗi 0,5 giây)
    if ((this.nearT -= dt) <= 0) {
      this.nearT = 0.5;
      const R = far + CITY.PITCH / 2;
      this.near = this.segs.filter((s) => Math.abs(s.mx - px) < R && Math.abs(s.mz - pz) < R);
      // đường người chơi đang ở (đường dọc + đường ngang gần nhất) nhìn thấy xa nhất → rải xe nhiều hơn ở đó
      this.lx = Math.round((px - CITY.ORIGIN) / CITY.PITCH);
      this.lz = Math.round((pz - CITY.ORIGIN) / CITY.PITCH);
      // số xe theo độ đông trung bình các đường trong tầm (khu vắng ít xe)
      const dens = this.near.length ? this.near.reduce((a, s) => a + Math.min(2, this.density(s.mx, s.mz)), 0) / this.near.length : 0;
      this.limit = Math.round(this.bikes.length * Math.min(1, dens / 2));
      this.nearW = this.near.map((s) => (this.onLine(s.from, s.to) ? ON_LINE : 1));
    }
    // lần đầu: rải đều cả vùng; về sau hiện lại ở phía xa (đỡ thấy xe hiện ra trước mặt)
    const d0 = this.first ? near + 10 : Math.max(near + 15, far * 0.55);
    // xe đang chạy theo đoạn (để giữ khoảng cách)
    const bySeg = new Map();
    for (const b of this.bikes) {
      if (!b.on || b.turn) continue;
      const k = keyOf(b.from, b.to);
      if (!bySeg.has(k)) bySeg.set(k, []);
      bySeg.get(k).push(b);
    }
    let count = this.active;
    for (const b of this.bikes) {
      if (!b.on) {
        if ((b.wait -= dt) <= 0 && count < this.limit && this.spawn(b, px, pz, d0, far)) count++;
        continue;
      }
      this.move(b, dt, bySeg, ctx);
      const d = Math.hypot(b.x - px, b.z - pz);
      if (d < near || d > far + 15) b.dying = true;
      if ((b.life -= dt) <= 0 && !b.turn && !this.onLine(b.from, b.to)) b.dying = true;
      b.fade = Math.max(0, Math.min(1, b.fade + (b.dying ? -dt : dt) / FADE));
      if (b.dying && b.fade <= 0) {
        b.on = false;
        b.wait = this.rng.range(0.2, 1.2);
      }
    }
    this.first = false;
    this.view?.sync(ctx.elev);
  }
  move(b, dt, bySeg, ctx) {
    let v = b.vmax;
    if (!b.turn) {
      // xe phía trước cùng đoạn, gần cùng làn (xe nền khác + xe NPC thật đang hiện) → chậm lại giữ khoảng cách
      const ahead = (list, w) => {
        for (const o of list || []) {
          if (o === b || o.turn) continue;
          const gap = o.t - b.t;
          if (gap > 0 && gap < 14 && Math.abs(o.lane - b.lane) < w) v = Math.min(v, Math.max(0, (gap - 3.5) * 1.2));
        }
      };
      const k = keyOf(b.from, b.to);
      ahead(bySeg.get(k), 0.8);
      ahead(ctx.onSeg?.get(k), 1.5);
    } else v = Math.min(v, TURN_V[b.turn.kind]);
    b.speed += Math.max(-8 * dt, Math.min(3 * dt, v - b.speed));
    const step = b.speed * dt;
    if (!b.turn) {
      b.t += step;
      b.lane += (this.laneFor(b, b.from, b.to) - b.lane) * Math.min(1, dt * 2.5);
      if (b.t >= CITY.PITCH - TURN_R) {
        const din = [b.to[0] - b.from[0], b.to[1] - b.from[1]];
        b.next = pickNextNode(this.rng, b.to, b.from, 'moto', ctx.floodIds);
        const d = [Math.sign(b.next[0] - b.to[0]), Math.sign(b.next[1] - b.to[1])];
        const dout = d[0] || d[1] ? d : [-din[0], -din[1]];
        if (!(d[0] || d[1])) b.next = b.from; // ngã tư cụt: quay đầu
        const lout = this.laneFor(b, b.to, b.next);
        b.turn = makeTurn(roadPos(b.to[0]), roadPos(b.to[1]), din, dout, b.lane, lout);
        b.turn.lout = lout;
        b.cu = b.t - (CITY.PITCH - TURN_R);
      }
    } else b.cu += step;
    if (b.turn && b.cu >= b.turn.len) {
      const extra = b.cu - b.turn.len;
      b.from = b.to;
      b.to = b.next;
      b.next = null;
      b.lane = b.turn.lout;
      b.turn = null;
      b.t = TURN_R + extra;
    }
    this.place(b, dt);
  }
  place(b, dt) {
    let dx, dz;
    if (b.turn) {
      const T = b.turn, u = Math.min(1, b.cu / T.len);
      const p = bez(T.E, T.C, T.X, u), d = bezDir(T.E, T.C, T.X, u);
      b.x = p[0];
      b.z = p[1];
      dx = d[0];
      dz = d[1];
    } else {
      dx = b.to[0] - b.from[0];
      dz = b.to[1] - b.from[1];
      b.x = roadPos(b.from[0]) + dx * b.t - dz * b.lane;
      b.z = roadPos(b.from[1]) + dz * b.t + dx * b.lane;
    }
    const hd = Math.atan2(dx, dz);
    if (!dt) b.heading = hd;
    else {
      const d = ((hd - b.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      b.heading += d * Math.min(1, dt * 14);
    }
  }
}

// ---------------- phần vẽ (Three.js) ----------------
// Vật liệu "mờ dần" kiểu lấm tấm: mỗi xe có số aFade 0..1, điểm ảnh nào có nhiễu > aFade thì bỏ (không cần trong suốt)
function fader(mat) {
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vFade < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) > vFade) discard;');
  };
  m.customProgramCacheKey = () => 'bgFade';
  return m;
}
// Mẫu xe + người lái bằng khối hộp (~200 tam giác; xe nền luôn ở xa ≥ 35 m nên không cần chi tiết như xe thật ~3.000).
// Chia phần để tô màu riêng từng xe: paint (sơn xe), shirt (áo), helmet (mũ), fixed (bánh, yên, quần, mặt — màu cố định),
// lamp (đèn pha + đèn hậu: luôn sáng, ban đêm thấy dòng đèn xe ở xa).
// Đầu xe hướng +z, bánh chạm đất y = 0.
const BOXES = [
  // [phần, rộng, cao, dài, x, y, z, màu (fixed), xoay quanh trục x]
  ['fixed', 0.1, 0.6, 0.6, 0, 0.3, 0.66, 0x1b1b1b], ['fixed', 0.1, 0.6, 0.6, 0, 0.3, 0.66, 0x1b1b1b, Math.PI / 4],
  ['fixed', 0.12, 0.6, 0.6, 0, 0.3, -0.62, 0x1b1b1b], ['fixed', 0.12, 0.6, 0.6, 0, 0.3, -0.62, 0x1b1b1b, Math.PI / 4],
  ['paint', 0.28, 0.3, 0.95, 0, 0.5, 0, 0], ['paint', 0.3, 0.55, 0.26, 0, 0.78, 0.55, 0], ['paint', 0.34, 0.26, 0.7, 0, 0.72, -0.38, 0],
  ['fixed', 0.3, 0.09, 0.62, 0, 0.88, -0.24, 0x222222], ['fixed', 0.62, 0.05, 0.06, 0, 1.06, 0.52, 0x333333], ['lamp', 0.14, 0.1, 0.04, 0, 0.9, 0.69, 0xfff3c4], ['lamp', 0.12, 0.06, 0.03, 0, 0.8, -0.74, 0xd0201a],
  ['fixed', 0.38, 0.18, 0.5, 0, 0.99, -0.05, 0x2c3e50], ['fixed', 0.12, 0.46, 0.14, -0.21, 0.66, 0.22, 0x2c3e50], ['fixed', 0.12, 0.46, 0.14, 0.21, 0.66, 0.22, 0x2c3e50],
  ['shirt', 0.42, 0.56, 0.25, 0, 1.36, -0.2, 0], ['shirt', 0.1, 0.1, 0.62, -0.26, 1.36, 0.16, 0], ['shirt', 0.1, 0.1, 0.62, 0.26, 1.36, 0.16, 0],
  ['fixed', 0.22, 0.24, 0.22, 0, 1.76, -0.18, 0xd9a47c], ['helmet', 0.3, 0.17, 0.3, 0, 1.88, -0.19, 0],
];
const SHIRTS = [0x3498db, 0xe74c3c, 0xf1c40f, 0xffffff, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x34495e, 0x16a085, 0xf5b7b1];
const HELMETS = [0xe74c3c, 0xf1c40f, 0xffffff, 0x2980b9, 0x2c3e50, 0x27ae60];
function boxParts() {
  const groups = { paint: [], shirt: [], helmet: [], fixed: [], lamp: [] };
  const c = new THREE.Color();
  for (const [part, w, h, l, x, y, z, col, rx] of BOXES) {
    const g = new THREE.BoxGeometry(w, h, l).toNonIndexed();
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    c.set(part === 'fixed' || part === 'lamp' ? col : 0xffffff).convertSRGBToLinear();
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
    g.deleteAttribute('uv');
    groups[part].push(g);
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.05 });
  const lit = new THREE.MeshBasicMaterial({ vertexColors: true });
  return Object.entries(groups).map(([part, geos]) => ({ part, geo: mergeGeometries(geos), mat: part === 'lamp' ? lit : mat }));
}

class BgView {
  constructor(scene, bikes) {
    this.bikes = bikes;
    const n = bikes.length;
    const rng = makeRng(913);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.parts = boxParts().map((p) => this.mesh(scene, p, n));
    // màu từng xe (sơn, áo, mũ bảo hiểm): lưu theo xe, chép vào ô vẽ mỗi khung hình (ô vẽ đổi khi xe ẩn / hiện)
    const col = new THREE.Color();
    const tint = { paint: (b) => b.color, shirt: () => rng.pick(SHIRTS), helmet: () => rng.pick(HELMETS) };
    this.colors = {};
    for (const [part, f] of Object.entries(tint)) {
      const arr = (this.colors[part] = new Float32Array(n * 3));
      bikes.forEach((b) => col.set(f(b)).toArray(arr, b.i * 3));
    }
    for (const p of this.parts) if (this.colors[p.userData.part]) p.setColorAt(0, col.set(0xffffff)); // tạo bảng màu từng xe
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.pos = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.col = new THREE.Color();
  }
  mesh(scene, { part, geo, mat }, count) {
    geo.setAttribute('aFade', this.fade);
    const im = new THREE.InstancedMesh(geo, fader(mat), count);
    im.userData.part = part;
    im.frustumCulled = false; // xe chạy khắp nơi: không tính khung bao
    im.castShadow = false;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    scene.add(im);
    return im;
  }
  // chỉ vẽ xe đang hiện: dồn lên đầu danh sách, im.count = số xe hiện (xe ẩn không tốn công vẽ)
  sync(elev) {
    const { m4, q, pos, one, up, col } = this;
    let k = 0;
    for (const b of this.bikes) {
      if (!b.on || b.fade <= 0) continue;
      pos.set(b.x, elev ? elev.topAt(b.x, b.z) : 0, b.z);
      q.setFromAxisAngle(up, b.heading);
      m4.compose(pos, q, one);
      for (const p of this.parts) {
        p.setMatrixAt(k, m4);
        if (p.instanceColor) p.setColorAt(k, col.fromArray(this.colors[p.userData.part], b.i * 3));
      }
      this.fade.array[k] = b.fade;
      k++;
    }
    for (const p of this.parts) {
      p.count = k;
      p.instanceMatrix.needsUpdate = true;
      if (p.instanceColor) p.instanceColor.needsUpdate = true;
    }
    this.fade.needsUpdate = true;
  }
}
