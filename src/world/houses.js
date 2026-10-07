// =============================================================
// NHÀ ỐNG PHONG CÁCH A+ cho cả thành phố.
// - Hình học thuần (chỉ cần Three.js, chạy được trong Node để thử): mỗi căn = khối các tầng + ban công,
//   lan can, cửa sổ, máy lạnh, chậu cây, đồ phơi, tum, mái tôn, bồn nước, mái bạt, biển tiệm.
// - Chi tiết nhỏ (song sắt, khung cửa, rèm, vệt ố, mái tôn, chữ biển…) vẽ trên MỘT tấm texture chung (atlas)
//   → cả thành phố dùng 1 vật liệu nhà; màu tường nằm trong đỉnh (vertex color).
// - Nhà gộp theo từng khối phố → ít lệnh vẽ, khối ngoài màn hình thì máy bỏ qua.
// Ngẫu nhiên cố định theo seed → lần nào mở game cũng ra cùng một dãy phố.
// =============================================================
import * as THREE from 'three';
import { makeRng } from '../sim/rng.js';
import { list } from '../content/index.js';

export const HOUSE_G0 = 3.4; // tầng trệt cao hơn
export const HOUSE_F = 3.2; // mỗi tầng lầu
export const houseTop = (floors) => HOUSE_G0 + (Math.max(1, floors) - 1) * HOUSE_F;
export const SPLIT_MIN = 7; // mặt tiền rộng hơn → chia 2 căn

// ---------- vùng trên tấm texture chung (pixel trên canvas 1024 × 1024) ----------
const S = 1024;
export const PX = {
  wall: [0, 0, 256, 256], conc: [256, 0, 256, 256], roof: [512, 0, 256, 256], shop: [768, 0, 256, 256],
  win0: [0, 256, 128, 128], win1: [128, 256, 128, 128], win2: [256, 256, 128, 128], win3: [384, 256, 128, 128],
  lit0: [512, 256, 128, 128], lit1: [640, 256, 128, 128], lit2: [768, 256, 128, 128], lit3: [896, 256, 128, 128],
  shutter: [0, 384, 128, 128], door: [128, 384, 128, 128], ac: [256, 384, 128, 128], vent: [384, 384, 128, 128],
  corr: [512, 384, 128, 128], stripe: [640, 384, 128, 128], white: [768, 384, 128, 128], tumDoor: [896, 384, 128, 128],
  rail0: [0, 512, 256, 128], rail1: [256, 512, 256, 128],
};
// 12 ô chữ biển tiệm (256 × 64)
for (let i = 0; i < 12; i++) PX[`word${i}`] = i < 8 ? [512 + (i % 2) * 256, 512 + Math.floor(i / 2) * 64, 256, 64] : [((i - 8) % 2) * 256, 640 + Math.floor((i - 8) / 2) * 64, 256, 64];
const WORDS = 12;
// pixel → toạ độ UV (canvas lật dọc khi thành texture); chừa lề 3 px để không lem sang ô bên cạnh
const uvOf = ([x, y, w, h], pad = 3) => [(x + pad) / S, 1 - (y + h - pad) / S, (x + w - pad) / S, 1 - (y + pad) / S];
const R = Object.fromEntries(Object.entries(PX).map(([k, v]) => [k, uvOf(v)]));

// ---------- bộ gom hình ----------
const _c = new THREE.Color();
export class HouseGeo {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = [];
    this.idx = [];
  }
  get tris() {
    return this.idx.length / 3;
  }
  // 4 góc (thế giới) theo thứ tự ngược chiều kim đồng hồ khi nhìn từ phía mặt; uvq: 4 cặp UV; cols: 4 màu [r,g,b]
  quad(a, b, c, d, uvq, cols) {
    const base = this.p.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (let k = 0; k < 4; k++) {
      const q = [a, b, c, d][k];
      this.p.push(q[0], q[1], q[2]);
      this.n.push(nx, ny, nz);
      this.uv.push(uvq[k * 2], uvq[k * 2 + 1]);
      this.c.push(...cols[k]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  tri(a, b, c, uv3, col) {
    const base = this.p.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const q of [a, b, c]) {
      this.p.push(q[0], q[1], q[2]);
      this.n.push(nx / l, ny / l, nz / l);
      this.c.push(...col);
    }
    this.uv.push(...uv3);
    this.idx.push(base, base + 1, base + 2);
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const lin = (hex) => {
  _c.setHex(hex);
  return [_c.r, _c.g, _c.b];
};
const WHITE = [1, 1, 1];
const RAIL_COLORS = [0x2e3338, 0x2e3338, 0x2f6f5b, 0x6b3a2a, 0xe8e8e8];
const SIGN_COLORS = [0xc0392b, 0x1d5fa8, 0x16a085, 0xd35400, 0x8e44ad, 0xb7950b, 0x27ae60];
const AWNING_COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085];
const CLOTHES = [0xe74c3c, 0x3498db, 0xf1c40f, 0xffffff, 0x9b59b6, 0x2ecc71];

// h: { x, y, z: tâm mép trước (thế giới), nx, nz: hướng mặt tiền ra đường, W: mặt tiền, D: chiều sâu, floors,
//      color: màu tường, seed, ground: 'shop' | 'shutter' | 'home' | 'place' | 'back', low: ít chi tiết (nhà vùng ven),
//      place: là địa điểm (tầng 1 không ban công để gắn biển), alley: nhà trong hẻm }
export function buildHouse(g, h) {
  const r = makeRng(h.seed >>> 0);
  const { W, D } = h;
  const n = Math.max(1, h.floors | 0);
  const Ux = h.nz, Uz = -h.nx, Vx = -h.nx, Vz = -h.nz; // U: sang phải (nhìn từ đường), V: vào trong nhà
  const P = (u, y, v) => [h.x + u * Ux + v * Vx, h.y + y, h.z + u * Uz + v * Vz];
  const ao = (y, k) => (k ? Math.min(1, 0.7 + 0.3 * Math.max(0, y) / 1.6) : 1);
  // mặt phẳng: gốc (u,y,v) + 2 cạnh A, B (đơn vị cục bộ); vùng texture reg; sub [s0,t0,s1,t1] phần nhỏ của vùng
  const face = (o, A, B, reg, col, { sub = [0, 0, 1, 1], rot = false, aoK = false, both = false } = {}) => {
    const pts = [o, [o[0] + A[0], o[1] + A[1], o[2] + A[2]], [o[0] + A[0] + B[0], o[1] + A[1] + B[1], o[2] + A[2] + B[2]], [o[0] + B[0], o[1] + B[1], o[2] + B[2]]];
    const [u0, v0, u1, v1] = reg, [s0, t0, s1, t1] = sub;
    const U = (s) => u0 + (u1 - u0) * s, T = (t) => v0 + (v1 - v0) * t;
    const st = rot ? [[s0, t0], [s0, t1], [s1, t1], [s1, t0]] : [[s0, t0], [s1, t0], [s1, t1], [s0, t1]];
    const uvq = st.flatMap(([s, t]) => [U(s), T(t)]);
    const cols = pts.map((p) => {
      const k = ao(p[1], aoK);
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    const w = pts.map((p) => P(...p));
    g.quad(w[0], w[1], w[2], w[3], uvq, cols);
    if (both) g.quad(w[1], w[0], w[3], w[2], [uvq[2], uvq[3], uvq[0], uvq[1], uvq[6], uvq[7], uvq[4], uvq[5]], [cols[1], cols[0], cols[3], cols[2]]);
  };
  // hộp theo trục cục bộ; f: { f (trước), b (sau), l, r, t (nóc), d (đáy) } → vùng texture hoặc null (bỏ mặt)
  const box = (u0, u1, y0, y1, v0, v1, col, f = {}, opt = {}) => {
    const w = u1 - u0, hh = y1 - y0, d = v1 - v0;
    const reg = (k) => (f[k] === undefined ? f.all ?? R.white : f[k]);
    if (reg('f')) face([u0, y0, v0], [w, 0, 0], [0, hh, 0], reg('f'), col, opt);
    if (reg('b')) face([u0, y0, v1], [0, hh, 0], [w, 0, 0], reg('b'), col, { ...opt, rot: true });
    if (reg('r')) face([u1, y0, v0], [0, 0, d], [0, hh, 0], reg('r'), col, opt);
    if (reg('l')) face([u0, y0, v0], [0, hh, 0], [0, 0, d], reg('l'), col, { ...opt, rot: true });
    if (reg('t')) face([u0, y1, v0], [w, 0, 0], [0, 0, d], reg('t'), col, { ...opt, aoK: false });
    if (f.d) face([u0, y0, v0], [0, 0, d], [w, 0, 0], f.d, col, { ...opt, aoK: false, rot: true });
  };
  const wallC = lin(h.color);
  const top = houseTop(n);
  const balcony = !h.low && n > 1 && r.chance(h.alley ? 0.45 : 0.7); // kiểu nhà có ban công (cả các tầng lầu)
  const sb = balcony ? 0.6 : 0; // tầng lầu lùi vào để chừa ban công
  const railReg = r.chance(0.5) ? R.rail0 : R.rail1, railC = lin(r.pick(RAIL_COLORS));
  const wallSub = (u0, u1, y0, y1, H) => [(u0 + W / 2) / W, y0 / H, (u1 + W / 2) / W, y1 / H];

  // ---------- tầng trệt ----------
  const G0 = HOUSE_G0;
  box(-W / 2, W / 2, 0, G0, 0, D, WHITE, { f: null, b: R.conc, l: R.conc, r: R.conc, t: n === 1 ? R.roof : null }, { aoK: true });
  const pil = 0.3, band = 2.75, ground = h.ground;
  const wallQ = (u0, u1, y0, y1) => face([u0, y0, 0], [u1 - u0, 0, 0], [0, y1 - y0, 0], R.wall, wallC, { sub: wallSub(u0, u1, y0, y1, G0), aoK: true });
  if (ground === 'back' || ground === 'home') {
    wallQ(-W / 2, W / 2, 0, G0);
    if (ground === 'home') {
      const du = -W / 2 + 0.5 + r.next() * Math.max(0, W - 2.8);
      face([du, 0, -0.02], [1.1, 0, 0], [0, 2.3, 0], R.door, WHITE);
      if (W > 3.2) face([du + 1.5, 0.9, -0.02], [Math.min(1.6, W / 2 + 1.5 - du - 1.9), 0, 0], [0, 1.4, 0], R[`win${r.int(0, 3)}`], WHITE);
    } else face([-0.8, 1.0, -0.02], [1.6, 0, 0], [0, 1.4, 0], R[`win${r.int(0, 3)}`], WHITE);
  } else {
    wallQ(-W / 2, -W / 2 + pil, 0, G0);
    wallQ(W / 2 - pil, W / 2, 0, G0);
    wallQ(-W / 2 + pil, W / 2 - pil, band, G0);
    // mặt tiền rộng chia nhiều gian ~4 m, giữa các gian có cột (không kéo dãn hình kệ hàng / cửa cuốn)
    const reg = ground === 'shutter' ? R.shutter : R.shop;
    const inner = W - 2 * pil, bays = Math.max(1, Math.round(inner / 4)), col = 0.25, bw = (inner - (bays - 1) * col) / bays;
    for (let k = 0; k < bays; k++) {
      const u0 = -W / 2 + pil + k * (bw + col);
      face([u0, 0, 0], [bw, 0, 0], [0, band, 0], bays > 1 && ground !== 'shutter' && k % 3 === 1 ? R.shutter : reg, WHITE);
      if (k < bays - 1) wallQ(u0 + bw, u0 + bw + col, 0, band);
    }
  }
  // mái bạt + biển tiệm (nhà mặt phố có buôn bán)
  if (!h.low && !h.place && (ground === 'shop' || ground === 'shutter')) {
    if (r.chance(0.6)) {
      const ac = lin(r.pick(AWNING_COLORS)), aw = W - 0.5;
      face([-aw / 2, 2.62, 0], [aw, 0, 0], [0, -0.38, -1.25], R.stripe, ac, { both: true });
      face([-aw / 2, 2.04, -1.25], [aw, 0, 0], [0, 0.2, 0], R.stripe, ac, { both: true });
    }
    if (r.chance(0.75)) {
      const sc = lin(r.pick(SIGN_COLORS)), sw = W - 0.7;
      box(-sw / 2, sw / 2, 2.78, 3.32, -0.12, 0, sc, { b: null, d: R.white });
      const ww = Math.min(sw - 0.2, 2.6);
      face([-ww / 2, 2.84, -0.125], [ww, 0, 0], [0, 0.42, 0], R[`word${r.int(0, WORDS - 1)}`], WHITE);
    }
  }

  // ---------- các tầng lầu ----------
  for (let i = 1; i < n; i++) {
    const y0 = G0 + (i - 1) * HOUSE_F, y1 = y0 + HOUSE_F, last = i === n - 1;
    const flat = !balcony || (h.place && i === 1); // tầng 1 của địa điểm: mặt phẳng để gắn biển
    const set = flat ? 0 : sb;
    box(-W / 2, W / 2, y0, y1, set, D, WHITE, { f: null, b: R.conc, l: R.conc, r: R.conc, t: last ? R.roof : null, d: set > 0 ? R.white : null });
    face([-W / 2, y0, set], [W, 0, 0], [0, HOUSE_F, 0], R.wall, wallC, { sub: [0, (i % 2) * 0.5, 1, (i % 2) * 0.5 + 0.5] });
    // cửa sổ / cửa ban công
    const nw = Math.max(1, Math.round(W / 2.9)), cell = W / nw;
    const gw = Math.min(2.2, cell - 0.7), gh = flat ? 1.7 : 2.25, gy = y0 + (flat ? 0.9 : 0.35);
    for (let k = 0; k < nw; k++) {
      if (h.place && i === 1) break; // chỗ gắn biển
      const cu = -W / 2 + cell * (k + 0.5);
      const lit = h.low ? r.chance(0.5) : r.chance(0.55);
      face([cu - gw / 2, gy, set - 0.02], [gw, 0, 0], [0, gh, 0], R[`${lit ? 'lit' : 'win'}${r.int(0, 3)}`], WHITE);
      if (flat && !h.low) box(cu - gw / 2 - 0.08, cu + gw / 2 + 0.08, gy - 0.1, gy, set - 0.16, set, lin(0xd9d2c5)); // bậu cửa
    }
    if (!flat) {
      // sàn ban công đua ra + lan can (song sắt trên texture) + tay vịn
      box(-W / 2 - 0.04, W / 2 + 0.04, y0 - 0.02, y0 + 0.16, -0.6, set, lin(0xd9d2c5), { b: null, t: R.roof, d: R.white });
      if (!h.low) {
        const np = Math.max(1, Math.round(W));
        for (let k = 0; k < np; k++) face([-W / 2 + (k * W) / np, y0 + 0.16, -0.55], [W / np, 0, 0], [0, 0.92, 0], railReg, railC, { both: true });
        box(-W / 2, W / 2, y0 + 1.08, y0 + 1.14, -0.58, -0.52, railC, { b: null, d: null });
      }
    }
    if (h.low) continue;
    // máy lạnh, chậu cây, đồ phơi
    if (r.chance(0.5)) {
      const au = (r.next() - 0.5) * (W - 1.2);
      box(au - 0.39, au + 0.39, y0 + 2.4, y0 + 2.92, set - 0.3, set, lin(0xeeeeee), { f: R.ac, b: null });
    }
    if (!flat) {
      for (const s of [-1, 1]) {
        if (!r.chance(0.5)) continue;
        const pu = s * (W / 2 - 0.35);
        box(pu - 0.15, pu + 0.15, y0 + 0.16, y0 + 0.42, -0.45, -0.15, lin(0xb5653a), { b: null });
        box(pu - 0.24, pu + 0.24, y0 + 0.42, y0 + 0.86, -0.54, -0.06, lin(r.pick([0x4f9a3a, 0x3f8f3a, 0x5aa04a])), { b: null });
      }
      if (last && r.chance(0.4)) {
        box(-W / 2 + 0.1, W / 2 - 0.1, y0 + 2.45, y0 + 2.48, -0.42, -0.39, lin(0x777777), { b: null, d: null });
        let u = -W / 2 + 0.4;
        while (u < W / 2 - 0.6) {
          const cw = 0.3 + r.next() * 0.25, ch = 0.35 + r.next() * 0.3;
          face([u, y0 + 2.45 - ch, -0.4], [cw, 0, 0], [0, ch, 0], R.white, lin(r.pick(CLOTHES)), { both: true });
          u += cw + 0.25 + r.next() * 0.4;
        }
      }
    }
  }

  // ---------- sân thượng: tường chắn, tum + mái tôn, bồn nước ----------
  const pset = n > 1 ? sb : 0;
  box(-W / 2, W / 2, top, top + 0.8, pset, pset + 0.14, wallC, { f: R.wall, b: R.conc });
  if (h.low) return;
  if (D > 5 && r.chance(0.6)) {
    const tw = Math.min(W - 0.4, 3.6), tu = (r.next() - 0.5) * (W - tw - 0.4), tv0 = D - 2.7, tv1 = D - 0.2;
    box(tu - tw / 2, tu + tw / 2, top, top + 2.4, tv0, tv1, WHITE, { f: null, b: R.conc, l: R.conc, r: R.conc, t: null });
    face([tu - tw / 2, top, tv0], [tw, 0, 0], [0, 2.4, 0], R.wall, wallC, { sub: [0, 0, 1, 0.8] });
    face([tu - 0.45, top, tv0 - 0.02], [0.9, 0, 0], [0, 2.0, 0], R.tumDoor, WHITE);
    // mái tôn dốc ra sau
    const rc = lin(r.pick([0xb5452e, 0x8f3422, 0x5d7a8c, 0x9aa0a6]));
    const A = [tw + 0.4, 0, 0], B = [0, -0.35, tv1 - tv0 + 0.5];
    face([tu - tw / 2 - 0.2, top + 2.65, tv0 - 0.25], A, B, R.corr, rc, { both: true });
  }
  if (r.chance(0.5)) {
    const tu = (r.next() - 0.5) * (W - 1.4), tv = Math.max(1.2, D * 0.35), tr = 0.45;
    for (const [du, dv] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) box(tu + du - 0.03, tu + du + 0.03, top, top + 0.5, tv + dv - 0.03, tv + dv + 0.03, lin(0x555555), { t: null });
    const tc = lin(0xd0d5da), sides = 8;
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
      const p0 = [tu + Math.cos(a0) * tr, top + 0.5, tv + Math.sin(a0) * tr], p1 = [tu + Math.cos(a1) * tr, top + 0.5, tv + Math.sin(a1) * tr];
      face(p1, [p0[0] - p1[0], 0, p0[2] - p1[2]], [0, 1.1, 0], R.white, tc, { both: false });
      g.tri(P(tu, top + 1.6, tv), P(p0[0], top + 1.6, p0[2]), P(p1[0], top + 1.6, p1[2]), [R.white[0], R.white[1], R.white[2], R.white[1], R.white[2], R.white[3]], tc);
    }
  }
}

// Chia một lô thành 1–2 căn. lot: { x, z (tâm mép trước), nx, nz, width, depth }. Trả về danh sách tham số buildHouse.
export function housesForLot(lot, { floors, colors, seed, alley = false, low = false, back = false }) {
  const r = makeRng(seed >>> 0);
  const Ux = lot.nz, Uz = -lot.nx;
  const parts = lot.width > SPLIT_MIN ? (() => {
    const s = 0.42 + r.next() * 0.16;
    return [[-lot.width / 2, -lot.width / 2 + lot.width * s], [-lot.width / 2 + lot.width * s, lot.width / 2]];
  })() : [[-lot.width / 2, lot.width / 2]];
  return parts.map(([a, b], k) => {
    const mid = (a + b) / 2, gap = parts.length > 1 ? 0.05 : 0;
    const ground = back ? 'back' : low ? 'home' : r.chance(alley ? 0.65 : 0.3) ? 'home' : r.chance(0.65) ? 'shop' : 'shutter';
    return {
      x: lot.x + Ux * mid, y: lot.y ?? 0, z: lot.z + Uz * mid, nx: lot.nx, nz: lot.nz,
      W: b - a - gap, D: lot.depth, floors: k === 0 ? floors : Math.max(1, Math.min(floors + r.int(-2, 2), alley ? 4 : 6)),
      color: r.pick(colors), seed: (seed * 31 + k * 7919) >>> 0, ground, alley, low,
    };
  });
}

// ---------- tấm texture chung (chỉ chạy trên trình duyệt) ----------
export function makeHouseAtlas() {
  const c = document.createElement('canvas'), e = document.createElement('canvas');
  c.width = c.height = e.width = e.height = S;
  const g = c.getContext('2d'), ge = e.getContext('2d');
  const rnd = makeRng(91);
  g.clearRect(0, 0, S, S);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, S, S);
  const fill = (k, col) => {
    const [x, y, w, h] = PX[k];
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  // tường sơn trắng (nhân màu tường) + vệt ố chảy dọc, chân tường bẩn, mảng sơn dặm, vết nứt
  {
    const [x, y, w, h] = PX.wall;
    fill('wall', '#ffffff');
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(255,255,255,${0.05 + rnd.next() * 0.05})`;
      g.fillRect(x + rnd.next() * w, y + rnd.next() * h, 20 + rnd.next() * 60, 10 + rnd.next() * 40);
    }
    for (let i = 0; i < 18; i++) {
      const sx = x + rnd.next() * w, sy = y + rnd.next() * h * 0.6, len = 30 + rnd.next() * 120, wd = 2 + rnd.next() * 7;
      const gr = g.createLinearGradient(0, sy, 0, sy + len);
      gr.addColorStop(0, 'rgba(70,55,40,.2)');
      gr.addColorStop(1, 'rgba(70,55,40,0)');
      g.fillStyle = gr;
      g.fillRect(sx, sy, wd, len);
    }
    const gb = g.createLinearGradient(0, y + h, 0, y + h - 50);
    gb.addColorStop(0, 'rgba(60,50,40,.3)');
    gb.addColorStop(1, 'rgba(60,50,40,0)');
    g.fillStyle = gb;
    g.fillRect(x, y + h - 50, w, 50);
    g.fillStyle = 'rgba(0,0,0,.08)';
    g.fillRect(x, y + h / 2 - 3, w, 3); // gờ tầng (nửa vùng = 1 tầng)
  }
  // tường hông xi măng thô: vệt cốp pha, rêu
  {
    const [x, y, w, h] = PX.conc;
    fill('conc', '#b4b0a8');
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = rnd.chance(0.5) ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.07)';
      g.fillRect(x + rnd.next() * w, y + rnd.next() * h, 2, 2);
    }
    g.fillStyle = 'rgba(0,0,0,.08)';
    for (let k = 30; k < h; k += 42) g.fillRect(x, y + k, w, 2);
    for (let i = 0; i < 9; i++) {
      const sx = x + rnd.next() * w, len = 40 + rnd.next() * 140;
      const gr = g.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, 'rgba(50,70,40,.28)');
      gr.addColorStop(1, 'rgba(50,70,40,0)');
      g.fillStyle = gr;
      g.fillRect(sx, y, 4 + rnd.next() * 10, len);
    }
  }
  // sàn sân thượng / mặt ban công
  {
    const [x, y, w, h] = PX.roof;
    fill('roof', '#a9a49b');
    g.fillStyle = 'rgba(0,0,0,.12)';
    for (let k = 0; k <= w; k += 32) {
      g.fillRect(x + k, y, 2, h);
      g.fillRect(x, y + k, w, 2);
    }
  }
  // bên trong tiệm: tường tối, kệ, hàng hóa nhiều màu; ban đêm sáng vàng
  {
    const [x, y, w, h] = PX.shop;
    fill('shop', '#3a302a');
    for (const sy of [0.3, 0.55, 0.8]) {
      g.fillStyle = '#7a5a3e';
      g.fillRect(x + 10, y + h * sy, w - 20, 5);
      for (let px = x + 14; px < x + w - 20; px += 12) {
        const hh = 10 + rnd.next() * 18;
        g.fillStyle = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#ecf0f1'][rnd.int(0, 6)];
        g.fillRect(px, y + h * sy - hh, 9, hh);
      }
    }
    g.fillStyle = '#9ea4a8';
    g.fillRect(x, y, w, 26); // cửa cuốn cuộn ở trên
    ge.fillStyle = 'rgba(255,200,120,.75)';
    ge.fillRect(x, y + 26, w, h - 26);
  }
  // cửa sổ: khung nhôm, kính, rèm (4 kiểu) — bản "lit" giống hệt nhưng sáng đèn ban đêm
  const curtains = ['#c7dde8', '#f3d9a4', '#e8c3c3', '#5b6670'];
  for (let k = 0; k < 4; k++) {
    for (const lit of [false, true]) {
      const [x, y, w, h] = PX[`${lit ? 'lit' : 'win'}${k}`];
      g.fillStyle = '#dfe3e6';
      g.fillRect(x, y, w, h);
      g.fillStyle = curtains[k];
      g.fillRect(x + 8, y + 8, w - 16, h - 16);
      g.fillStyle = 'rgba(160,200,225,.45)';
      g.fillRect(x + 8, y + 8, w - 16, h - 16);
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath();
      g.moveTo(x + 12, y + h - 12);
      g.lineTo(x + 40, y + 12);
      g.lineTo(x + 56, y + 12);
      g.lineTo(x + 28, y + h - 12);
      g.fill();
      g.fillStyle = '#dfe3e6';
      g.fillRect(x + w / 2 - 3, y, 6, h);
      if (k === 2) {
        g.fillStyle = '#2e3338';
        for (let b = 1; b < 8; b++) g.fillRect(x + (b * w) / 8, y, 3, h); // song sắt
      }
      if (lit) {
        ge.fillStyle = k % 2 ? '#ffcf7a' : '#cfe8ff';
        ge.fillRect(x + 8, y + 8, w - 16, h - 16);
      }
    }
  }
  // cửa cuốn sắt (gân ngang, vài vết gỉ)
  {
    const [x, y, w, h] = PX.shutter;
    fill('shutter', '#9ea4a8');
    for (let k = 0; k < h; k += 8) {
      g.fillStyle = '#c4c9cc';
      g.fillRect(x, y + k, w, 2);
      g.fillStyle = '#6f7579';
      g.fillRect(x, y + k + 6, w, 2);
    }
    for (let i = 0; i < 50; i++) {
      g.fillStyle = 'rgba(140,70,30,.25)';
      g.fillRect(x + rnd.next() * w, y + rnd.next() * h, 2 + rnd.next() * 3, 1 + rnd.next() * 3);
    }
  }
  // cửa sắt nhà ở (2 cánh, ô kính trên), cửa tum gỗ
  for (const [k, col] of [['door', '#2f6f8a'], ['tumDoor', '#7a4b2a']]) {
    const [x, y, w, h] = PX[k];
    fill(k, col);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(x + w / 2 - 2, y, 4, h);
    g.strokeStyle = 'rgba(255,255,255,.18)';
    g.lineWidth = 3;
    g.strokeRect(x + 8, y + 8, w / 2 - 14, h - 16);
    g.strokeRect(x + w / 2 + 6, y + 8, w / 2 - 14, h - 16);
    if (k === 'door') {
      g.fillStyle = 'rgba(160,200,225,.6)';
      g.fillRect(x + 14, y + 14, w - 28, 26);
    }
  }
  // mặt trước cục nóng máy lạnh
  {
    const [x, y, w, h] = PX.ac;
    fill('ac', '#f2f2f2');
    g.strokeStyle = '#555';
    g.lineWidth = 3;
    for (let rr = 8; rr < 44; rr += 8) {
      g.beginPath();
      g.arc(x + 78, y + 64, rr, 0, 7);
      g.stroke();
    }
    g.fillStyle = '#ccc';
    for (let k = 20; k < 110; k += 10) g.fillRect(x + 8, y + k, 20, 3);
  }
  // gạch bông gió
  {
    const [x, y, w, h] = PX.vent;
    fill('vent', '#efe6d2');
    g.fillStyle = '#3d3630';
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++)
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(x + 32 + i * 64 + Math.cos((k * Math.PI) / 2 + 0.78) * 14, y + 32 + j * 64 + Math.sin((k * Math.PI) / 2 + 0.78) * 14, 9, 0, 7);
          g.fill();
        }
  }
  // tôn sóng (trắng xám, nhân màu mái)
  {
    const [x, y, w, h] = PX.corr;
    for (let k = 0; k < w; k += 8) {
      g.fillStyle = '#ffffff';
      g.fillRect(x + k, y, 4, h);
      g.fillStyle = '#bdbdbd';
      g.fillRect(x + k + 4, y, 4, h);
    }
    for (let i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(90,50,30,.25)';
      g.fillRect(x + rnd.next() * w, y + rnd.next() * h, 3, 6 + rnd.next() * 10);
    }
  }
  // sọc mái bạt (trắng / xám nhạt, nhân màu bạt)
  {
    const [x, y, w, h] = PX.stripe;
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k % 2 ? '#f4f4f4' : '#ffffff';
      g.fillRect(x + (k * w) / 4, y, w / 4, h);
    }
    g.fillStyle = 'rgba(255,255,255,1)';
    for (let k = 0; k < 2; k++) g.fillRect(x + k * (w / 2), y, w / 4, h);
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let k = 0; k < 2; k++) g.fillRect(x + k * (w / 2) + w / 4, y, w / 4, h);
  }
  fill('white', '#ffffff');
  // lan can: song sắt trên nền trong suốt (2 kiểu: song thẳng / có hoa sắt)
  for (const k of [0, 1]) {
    const [x, y, w, h] = PX[`rail${k}`];
    g.fillStyle = '#ffffff';
    g.fillRect(x, y + 2, w, 7);
    g.fillRect(x, y + h - 14, w, 6);
    for (let b = 0; b < w; b += 16) g.fillRect(x + b + 6, y, 4, h);
    if (k === 1) {
      g.strokeStyle = '#ffffff';
      g.lineWidth = 4;
      for (let b = 0; b < w; b += 64) {
        g.beginPath();
        g.arc(x + b + 32, y + h / 2, 18, 0, 7);
        g.stroke();
      }
    }
  }
  // chữ biển tiệm (trắng trên nền trong suốt; nền màu là hộp biển phía sau)
  const words = list('city.shopSigns');
  for (let i = 0; i < WORDS; i++) {
    const [x, y, w, h] = PX[`word${i}`];
    const t = String(words[i % words.length] || '');
    let fs = 44;
    g.font = `bold ${fs}px Arial`;
    while (g.measureText(t).width > w - 24 && fs > 12) g.font = `bold ${(fs -= 2)}px Arial`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText(t, x + w / 2, y + h / 2 + 2);
    ge.font = g.font;
    ge.textAlign = 'center';
    ge.textBaseline = 'middle';
    ge.fillStyle = 'rgba(255,255,255,.55)';
    ge.fillText(t, x + w / 2, y + h / 2 + 2);
  }
  const map = new THREE.CanvasTexture(c), emissive = new THREE.CanvasTexture(e);
  map.colorSpace = emissive.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = emissive.anisotropy = 8;
  return { map, emissive };
}
