// MẪU THỬ NGƯỜI LOW-POLY (kiểu "Modular Lowpoly People" chủ game gửi) — game CHƯA dùng file này.
// Giữ ĐÚNG khung khớp của makePerson (models.js): hông (0,88 m) → gối (−0,44) · vai (1,405 m, trên thân) → khuỷu (−0,29), bàn tay −0,3
// → animatePerson, setSitting, gripBar, applyPose, đồ cầm tay… dùng lại được nguyên.
// Bản 3 (chủ game: "còn khối khối, nối cho mượt; mắt chấm đen, lông mày 1 gạch, mũi bị tẹt"):
//  - thân, tay, chân 12 cạnh, thuôn liền (đầu dưới đoạn trên = đầu trên đoạn dưới); khớp cầu ở hông, gối, khuỷu, vai che chỗ nối
//  - quần liền từ thân xuống đáy quần (không còn khối hông rời); vai tròn ôm vào thân; bàn tay, giày bo tròn
//  - mặt: mắt = chấm đen tròn, lông mày = 1 gạch mảnh hơi cong, mũi nhô cao (sống mũi + đầu mũi)
//  - setSmooth(true): tô mịn thay cho mặt phẳng (để so 2 kiểu)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

const HIP_Y = 0.88, SHOULDER_Y = 1.405, THIGH = 0.44, UPPER_ARM = 0.29, HEAD_Y = 1.6;
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0.02 });
export function setSmooth(on) {
  MAT.flatShading = !on;
  MAT.needsUpdate = true;
}
const SEG = 10, ZS = 0.66; // số cạnh thân / tay chân · ép dẹt thân trước-sau

class Parts {
  constructor() { this.list = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
    const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    g.computeVertexNormals();
    this.list.push(g);
    return this;
  }
  mesh() {
    const m = new THREE.Mesh(mergeGeometries(this.list), MAT);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const limb = (r0, r1, h) => new THREE.CylinderGeometry(r0, r1, h, SEG, 1, true).rotateY(Math.PI / SEG); // ống hở 2 đầu (khớp cầu bịt)
const ball = (r) => new THREE.SphereGeometry(r, SEG, 6);
const egg = (rx, ry, rz, seg = SEG, rows = 6) => new THREE.SphereGeometry(1, seg, rows).scale(rx, ry, rz);

const latheOf = (prof, k = 1) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * k, y)), SEG).rotateY(Math.PI / SEG).scale(1, 1, ZS);
// Dải dán sát mặt trước thân tiện (áo thun lộ giữa 2 vạt áo khoác, đường khóa kéo): góc từ a0 tới a1 (rad, 0 = chính giữa trước)
function frontStrip(prof, k, a0, a1, yFrom, yTo, lift = 0.003) {
  const pos = [], steps = 3, ring = (r, y, a) => [Math.sin(a) * (r * k + lift), y, Math.cos(a) * (r * k + lift) * ZS];
  const pts = prof.filter(([, y]) => y >= yFrom - 1e-6 && y <= yTo + 1e-6);
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < steps; s++) {
      const u0 = a0 + ((a1 - a0) * s) / steps, u1 = a0 + ((a1 - a0) * (s + 1)) / steps;
      const A = ring(pts[i][0], pts[i][1], u0), B = ring(pts[i][0], pts[i][1], u1), C = ring(pts[i + 1][0], pts[i + 1][1], u1), D = ring(pts[i + 1][0], pts[i + 1][1], u0);
      pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

// Đầu: cầu nắn thành sọ + hàm thon + cằm + gò má (tâm ở gốc)
function headGeo(f) {
  const R = 0.115, g = new THREE.SphereGeometry(R, 12, 10), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = y / R;
    x *= f ? 0.8 : 0.84;
    y *= 1.13;
    if (ny < 0) {
      x *= 1 + ny * 0.36; // hàm thon về cằm
      if (z > 0) z *= 1 + ny * 0.1;
    }
    if (ny > -0.2 && ny < 0.25 && z > 0) x *= 1.03; // gò má
    if (z > 0 && Math.abs(x) < 0.07) {
      if (ny > 0.22 && ny < 0.42) z *= 1.05; // gờ lông mày nhô
      else if (ny > -0.02 && ny <= 0.22) z *= 0.975; // hốc mắt lõm nhẹ
    }
    if (z < 0) z *= 0.93;
    p.setXYZ(i, x, y, z);
  }
  return g;
}
// Mũi gãy góc: sống mũi từ giữa 2 mắt xuống đầu mũi + 2 cánh mũi; phần sau lún vào mặt (khối lồi → mặt luôn quay ra ngoài)
const noseGeo = () => new ConvexGeometry([
  [0, 0.016, -0.012], [-0.006, 0.014, -0.004], [0.006, 0.014, -0.004], // gốc sống mũi (giữa 2 mắt)
  [0, -0.004, 0.012], // giữa sống mũi
  [0, -0.03, 0.026], [-0.007, -0.033, 0.02], [0.007, -0.033, 0.02], // đầu mũi
  [-0.017, -0.038, 0.004], [0.017, -0.038, 0.004], // 2 cánh mũi
  [0, -0.043, 0.012], // chân mũi
  [-0.015, -0.035, -0.014], [0.015, -0.035, -0.014], [0, 0.0, -0.016], // phần lún vào mặt
].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
function hairCap(f) {
  const g = new THREE.SphereGeometry(0.123, 12, 6, 0, Math.PI * 2, 0, Math.PI * (f ? 0.62 : 0.56)), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (f ? 0.87 : 0.91), p.getY(i) * 1.2, p.getZ(i) * 1.02);
  return g.rotateX(-0.4);
}

// o: { female, skin, hair, hairStyle: 'short' | 'long', top (áo trong), jacket (áo khoác mở, null = không), pants, shoe, sole, cuffJeans }
export function makeLowPerson(o) {
  const f = !!o.female, skin = o.skin ?? 0xe8b48f, hair = o.hair ?? 0x1e1a18;
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const T = new Parts();
  // ---------- thân: quần (đáy quần → thắt lưng) liền với áo (thắt lưng → cổ) ----------
  const y0 = 0.78;
  // đáy quần nhỏ, nằm khuất giữa 2 đầu đùi (không lồi xuống như tã)
  const pantsProf = f ? [[0.02, 0.035], [0.11, 0.065], [0.142, 0.12], [0.135, 0.17]] : [[0.02, 0.035], [0.105, 0.065], [0.138, 0.12], [0.132, 0.17]];
  const shirt = f
    ? [[0.132, 0.15], [0.12, 0.25], [0.142, 0.37], [0.156, 0.46], [0.162, 0.55], [0.162, 0.6], [0.135, 0.63], [0.085, 0.65], [0.05, 0.66]]
    : [[0.13, 0.15], [0.136, 0.24], [0.15, 0.35], [0.168, 0.45], [0.178, 0.54], [0.18, 0.6], [0.15, 0.632], [0.095, 0.652], [0.052, 0.662]]; // vai vuốt dốc liền tới đầu tay
  T.add(latheOf(pantsProf), o.pants, 0, y0, 0);
  const coat = o.jacket ?? o.top, k = o.jacket != null ? 1.025 : 1;
  T.add(latheOf(shirt, k), coat, 0, y0, 0);
  if (o.jacket != null) {
    T.add(frontStrip(shirt, k, -0.3, 0.3, 0.15, 0.6), o.top, 0, y0, 0); // áo thun lộ giữa 2 vạt
    for (const s of [-1, 1]) T.add(frontStrip(shirt, k, s > 0 ? 0.3 : -0.36, s > 0 ? 0.36 : -0.3, 0.15, 0.6, 0.005), 0x262626, 0, y0, 0); // khóa kéo
    T.add(new THREE.CylinderGeometry(0.066, 0.08, 0.055, SEG, 1, true).scale(1, 1, 0.92), o.jacket, 0, y0 + 0.672, -0.006); // cổ áo dựng
  } else if (f) T.add(new THREE.CylinderGeometry(0.054, 0.06, 0.06, SEG, 1, true), shade(o.top, 0.93), 0, y0 + 0.685, 0); // cổ lọ
  // ---------- cổ + đầu ----------
  T.add(limb(0.044, 0.05, 0.1), skin, 0, 1.47, -0.004);
  const hy = HEAD_Y - 0.005;
  T.add(headGeo(f), skin, 0, hy, 0.005);
  T.add(noseGeo(), shade(skin, 0.95), 0, hy - 0.004, 0.106); // mũi dính vào mặt (mặt trước ở z ≈ 0,11), đầu mũi nhô ~2,5 cm
  for (const s of [-1, 1]) {
    T.add(egg(0.012, 0.0075, 0.006, 8, 6), 0x141414, s * 0.039, hy + 0.012, 0.104, 0, 0, s * -0.08); // mắt: hạt hạnh nhỏ, đen
    T.add(new THREE.BoxGeometry(0.036, 0.006, 0.008), shade(hair, 1.1), s * 0.04, hy + 0.036, 0.11, 0.1, s * 0.15, s * -0.1); // lông mày: 1 gạch trên gờ
    T.add(egg(0.009, 0.024, 0.018, 6, 4), shade(skin, 0.94), s * 0.097, hy - 0.003, -0.005); // tai
  }
  T.add(egg(0.017, 0.004, 0.006, 8, 4), 0x8a4a3e, 0, hy - 0.06, 0.095); // miệng: đường môi
  T.add(egg(0.013, 0.004, 0.006, 8, 4), shade(skin, 0.82), 0, hy - 0.067, 0.093); // môi dưới
  // ---------- tóc ----------
  T.add(hairCap(f), hair, 0, hy + 0.012, -0.012);
  // mái: nhiều lọn nhỏ, mỏng (dẹt trước-sau), rủ xéo ôm sát trán — nam vuốt lệch phải, nữ rẽ ngôi lệch trái
  const nf = 7;
  for (let i = 0; i < nf; i++) {
    const t = i / (nf - 1) - 0.5, x = t * 0.15, lean = f ? 0.35 - t * 0.5 : -0.3 - t * 0.3;
    const len = 0.055 + (1 - Math.abs(t) * 1.4) * 0.02;
    T.add(new THREE.ConeGeometry(0.02, len, 4).scale(1, 1, 0.45), shade(hair, i % 2 ? 1 : 1.15), x, hy + 0.07 - Math.abs(t) * 0.035, 0.088 - Math.abs(t) * 0.03, 2.55, -t * 0.9, lean);
  }
  if (o.hairStyle !== 'long') {
    // lọn gáy rủ xuống (nhìn sau không còn như bát úp), tóc mai trước tai, vài lọn dựng trên đỉnh
    for (let i = 0; i < 7; i++) {
      // lọn gáy: gốc nằm trong chỏm tóc, chóp thò dưới mép tóc rủ xuống gáy; xòe dần ra 2 bên tai
      const t = i / 6 - 0.5, a = Math.PI + t * 2.3, rr = 0.086 - Math.abs(t) * 0.01;
      const x = Math.sin(a) * rr, z = Math.cos(a) * rr * 0.95 - 0.01, y = hy - 0.06 + Math.abs(t) * 0.035;
      T.add(new THREE.ConeGeometry(0.026, 0.08, 4).scale(1, 1, 0.45), shade(hair, i % 2 ? 1 : 1.18), x, y, z, 0.18, -a, Math.PI + t * 0.5);
    }
    for (const s of [-1, 1]) T.add(new THREE.ConeGeometry(0.014, 0.05, 4).scale(1, 1, 0.6), hair, s * 0.094, hy - 0.006, 0.03, 0, 0, Math.PI + s * 0.12); // tóc mai
    for (const [x, z, rx] of [[-0.03, -0.02, -0.5], [0.03, -0.03, -0.6], [0, 0.02, -0.35]]) T.add(new THREE.ConeGeometry(0.03, 0.06, 4).scale(1, 1, 0.5), shade(hair, 1.12), x, hy + 0.125, z, rx, 0, 0); // lọn đỉnh
  }
  if (o.hairStyle === 'long') {
    T.add(new THREE.CylinderGeometry(0.114, 0.126, 0.3, 12, 1, true, Math.PI * 0.55, Math.PI * 0.9).scale(1, 1, 0.9), hair, 0, hy - 0.12, -0.01);
    T.add(new THREE.CylinderGeometry(0.11, 0.122, 0.3, 12, 1, true, Math.PI * 0.55, Math.PI * 0.9).scale(-1, 1, 0.9), hair, 0, hy - 0.12, -0.012);
    for (const s of [-1, 1]) T.add(egg(0.018, 0.12, 0.035), hair, s * 0.098, hy - 0.085, 0.02, 0, 0, s * 0.05);
  }
  const torso = T.mesh();
  body.add(torso);
  // ---------- chân: khớp cầu hông → đùi → khớp gối → cẳng chân → giày bo tròn ----------
  const hipX = f ? 0.07 : 0.074, rT = f ? 0.07 : 0.072, rK = 0.055, rA = 0.046;
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * hipX, HIP_Y, 0);
    g.add(hip);
    hip.add(new Parts().add(ball(rT), o.pants, 0, -0.01, 0).add(limb(rT, rK, THIGH), o.pants, 0, -THIGH / 2, 0).mesh());
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    hip.add(knee);
    const L = new Parts().add(ball(rK), o.pants, 0, 0, 0).add(limb(rK, rA, 0.36), o.pants, 0, -0.18, 0);
    if (o.cuffJeans) L.add(limb(rA + 0.006, rA + 0.006, 0.045), shade(o.pants, 0.82), 0, -0.34, 0).add(new THREE.RingGeometry(rA - 0.01, rA + 0.006, SEG).rotateX(Math.PI / 2), shade(o.pants, 0.7), 0, -0.3625, 0);
    L.add(egg(0.05, 0.045, 0.125), o.shoe ?? 0x222222, 0, -0.395, 0.04); // giày bo tròn
    L.add(new THREE.CylinderGeometry(0.052, 0.052, 0.026, SEG).scale(1, 1, 2.55), o.sole ?? 0xf2f2f2, 0, -0.427, 0.045); // đế
    knee.add(L.mesh());
    return [hip, knee];
  });
  // ---------- tay: vai tròn → bắp tay → khuỷu → cẳng tay → cổ tay áo → bàn tay ----------
  const shX = f ? 0.165 : 0.178, sleeve = o.jacket ?? o.top, rS = f ? 0.048 : 0.052, rE = 0.042, rW = 0.035;
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * shX, SHOULDER_Y, 0);
    sh.rotation.z = s * 0.08;
    body.add(sh);
    sh.add(new Parts().add(egg(rS * 1.02, rS * 0.9, rS), sleeve, -s * 0.012, -0.03, 0).add(limb(rS, rE, UPPER_ARM - 0.03), sleeve, 0, -0.03 - (UPPER_ARM - 0.03) / 2, 0).mesh()); // vai hạ 3 cm, lún vào thân
    const el = new THREE.Group();
    el.position.y = -UPPER_ARM;
    el.rotation.x = -0.15;
    sh.add(el);
    const A = new Parts().add(ball(rE), sleeve, 0, 0, 0).add(limb(rE, rW, 0.23), sleeve, 0, -0.115, 0);
    const cw = f ? 0.055 : 0.03;
    A.add(limb(rW + 0.008, rW + 0.008, cw), shade(sleeve, 0.82), 0, -0.23 - cw / 2 + 0.015, 0).add(new THREE.RingGeometry(0.02, rW + 0.008, SEG).rotateX(Math.PI / 2), shade(sleeve, 0.7), 0, -0.23 - cw + 0.015, 0);
    A.add(limb(0.022, 0.024, 0.04), skin, 0, -0.245, 0); // cổ tay
    A.add(egg(0.026, 0.05, 0.016), skin, 0, -0.3, 0.004); // bàn tay
    A.add(egg(0.01, 0.024, 0.01), skin, -s * 0.024, -0.288, 0.015, 0, 0, s * 0.35); // ngón cái
    el.add(A.mesh());
    return [sh, el];
  });
  g.userData.parts = { legL: legs[0][0], legR: legs[1][0], kneeL: legs[0][1], kneeR: legs[1][1], armL: arms[0][0], armR: arms[1][0], elbowL: arms[0][1], elbowR: arms[1][1], body, torso, overlay: null };
  return g;
}

export const SAMPLE_GUY = { top: 0x3f8f4a, jacket: 0xc23b22, pants: 0x1f3f73, shoe: 0x1b1b1b, sole: 0xf2f2f2, hair: 0x1a1614, cuffJeans: true };
export const SAMPLE_GIRL = { female: true, top: 0x4f8f3e, pants: 0x1c1c1e, shoe: 0x1b1b1b, sole: 0xf2f2f2, hair: 0x1a1614, hairStyle: 'long' };
