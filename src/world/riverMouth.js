// =============================================================
// CỬA SÔNG RA NGOÀI BẢN ĐỒ (chỉ để nhìn): sông có "mouth" trong map.json chạy tiếp ra ngoài biên —
// mặt nước loe dần, bãi bùn, dừa nước 2 bờ, phao luồng, cẩu cảng + đồi xa. Người chơi vẫn không ra khỏi biên.
// Đứng gần cửa sông thì sương mù lùi xa (sky.js gọi mouthOpen) để nhìn được ra xa.
// =============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CITY, HALF, roadPos } from '../sim/cityLayout.js';
import { makeRng } from '../sim/rng.js';

export const MOUTH_LEN = 470; // nước chạy ra xa bao nhiêu mét tính từ biên

// Các cửa sông đang mở: { lo, hi (bề ngang nước theo trục cắt ngang), axis, dir (+1 ra phía cuối / -1 ra phía đầu), edge, cx, cz }
export function riverMouths(map) {
  const out = [];
  for (const r of map?.rivers || []) {
    if (!r.mouth) continue;
    const lo = roadPos(r.line) - CITY.ROAD / 2, hi = roadPos(r.wide ? r.line + 1 : r.line) + CITY.ROAD / 2;
    const ends = [];
    if ((r.mouth === 'start' || r.mouth === 'both') && r.from === 0) ends.push(-1);
    if ((r.mouth === 'end' || r.mouth === 'both') && r.to === CITY.N) ends.push(1);
    for (const dir of ends) {
      const edge = dir * HALF, mid = (lo + hi) / 2;
      // sông axis 'x' = chạy dọc đường dọc (nước trải theo x, sông chảy theo z)
      out.push({ lo, hi, axis: r.axis, dir, edge, cx: r.axis === 'x' ? mid : edge, cz: r.axis === 'x' ? edge : mid });
    }
  }
  return out;
}

// Mức "mở tầm nhìn" ở chỗ (x, z): 1 khi đứng sát cửa sông, giảm dần về 0 khi đi xa ~230 m
export function mouthOpen(mouths, x, z) {
  let best = 0;
  for (const m of mouths) {
    const d = Math.hypot(x - m.cx, z - m.cz);
    const t = Math.min(1, Math.max(0, (230 - d) / 120));
    best = Math.max(best, t * t * (3 - 2 * t));
  }
  return best;
}

// Ô nhà vùng ven (ngoài biên) có đè lên cửa sông không → city.js bỏ ô đó đi
export function mouthBlocks(mouths, x, z, pad = 7) {
  return mouths.some((m) => (m.axis === 'x'
    ? Math.sign(z) === m.dir && Math.abs(z) > HALF && x > m.lo - pad && x < m.hi + pad
    : Math.sign(x) === m.dir && Math.abs(x) > HALF && z > m.lo - pad && z < m.hi + pad));
}

const mats = new Map();
const mat = (color, opts = {}) => {
  const k = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, flatShading: true, ...opts }));
  return mats.get(k);
};
// mảng phẳng nằm trên mặt đất theo đa giác [[v, u], …] (v: ngang sông, u: ra xa)
function flatPoly(pts, y, m) {
  const sh = new THREE.Shape(pts.map(([v, u]) => new THREE.Vector2(v, -u)));
  const me = new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(0, y, 0), m);
  me.receiveShadow = true;
  return me;
}
// bụi dừa nước: 7 tàu lá dài xòe ra từ gốc
function nipaGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const len = 2.6 + (i % 3) * 0.5;
    const g = new THREE.BoxGeometry(0.32, 0.05, len).translate(0, 0, len / 2);
    g.rotateX(-(0.55 + (i % 2) * 0.35));
    g.rotateY((i / 7) * Math.PI * 2);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

export function buildRiverMouths(scene, mouths, waterMat, seed = 7) {
  const groups = [];
  mouths.forEach((m, mi) => {
    const R = makeRng(seed * 31 + mi * 7 + 3), g = new THREE.Group();
    const w = (m.hi - m.lo) / 2, L = MOUTH_LEN;
    const half = (u) => w + Math.min(1, Math.max(0, u) / L) ** 1.4 * w * 1.6; // sông loe dần ra xa
    // khung riêng: x = ngang sông (v), z = ra xa (u). Đặt gốc ở giữa sông ngay biên, quay cho +z hướng ra ngoài
    g.position.set(m.cx, 0, m.cz);
    g.rotation.y = m.axis === 'x' ? (m.dir > 0 ? 0 : Math.PI) : (m.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    // mặt nước + bãi bùn 2 bên
    const U = [];
    for (let u = -2; u <= L; u += L / 12) U.push(u);
    const water = [...U.map((u) => [-half(u), u]), ...U.slice().reverse().map((u) => [half(u), u])];
    g.add(flatPoly(water, 0.03, waterMat));
    for (const s of [-1, 1]) {
      const mud = [...U.map((u) => [s * half(u), u]), ...U.slice().reverse().map((u) => [s * (half(u) + 5 + u * 0.01), u])];
      g.add(flatPoly(mud, 0.005, mat(0x6e5d47)));
    }
    // dừa nước: 2–3 hàng sát mép nước mỗi bên (gộp vẽ hàng loạt)
    const nipa = new THREE.InstancedMesh(nipaGeo(), mat(0x4e7d36), 900);
    const dummy = new THREE.Object3D();
    let n = 0;
    for (const s of [-1, 1]) for (let u = 6; u < L - 10 && n < 880; u += 3.2 + R.next() * 3) {
      for (let row = 0; row < 3; row++) {
        if (R.next() < 0.25) continue;
        const v = s * (half(u) + 1.5 + row * 3.2 + R.next() * 2);
        dummy.position.set(v, 0, u + R.next() * 2);
        dummy.rotation.set(0, R.next() * Math.PI * 2, 0);
        const sc = 0.8 + R.next() * 0.7;
        dummy.scale.set(sc, sc * (0.8 + R.next() * 0.5), sc);
        dummy.updateMatrix();
        nipa.setMatrixAt(n++, dummy.matrix);
      }
    }
    nipa.count = n;
    nipa.castShadow = true;
    g.add(nipa);
    // cây bần / cây tạp phía sau bãi dừa nước
    const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat(0x3f6b33), 260);
    let t = 0;
    for (const s of [-1, 1]) for (let u = 20; u < L - 40 && t < 250; u += 7 + R.next() * 9) {
      const v = s * (half(u) + 12 + R.next() * 26), r = 2.5 + R.next() * 3;
      dummy.position.set(v, r * 0.9, u);
      dummy.rotation.set(R.next(), R.next() * 3, 0);
      dummy.scale.set(r, r * 0.85, r);
      dummy.updateMatrix();
      trees.setMatrixAt(t++, dummy.matrix);
    }
    trees.count = t;
    g.add(trees);
    // phao luồng xanh / đỏ dọc 2 bên luồng
    for (let u = 40; u < L - 60; u += 65) for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.6, 8), mat(s < 0 ? 0xc0392b : 0x27ae60));
      b.position.set(s * (half(u) * 0.6), 0.6, u);
      g.add(b);
    }
    // cảng xa bên bờ phải (theo hướng nhìn ra): 3 cẩu bờ + bãi container thấp
    const bank = (u) => half(u) + 10;
    for (let i = 0; i < 3; i++) {
      const u = 230 + i * 24, v = bank(u) + 4, cr = new THREE.Group();
      for (const dz of [-4, 4]) for (const dv of [0, 8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 26, 1.1), mat(0xd35400));
        leg.position.set(dv, 13, dz);
        cr.add(leg);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 10), mat(0xd35400));
      top.position.set(4, 27, 0);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(46, 1.6, 1.8), mat(0xe67e22));
      boom.position.set(-10, 30, 0);
      cr.add(top, boom);
      cr.position.set(v, 0, u);
      g.add(cr);
    }
    const CC = [0xc0392b, 0x1d5fa8, 0x27ae60, 0xe67e22, 0xecf0f1, 0x7f8c8d];
    for (let i = 0; i < 26; i++) {
      const u = 215 + (i % 13) * 7, v = bank(u) + 16 + Math.floor(i / 13) * 7, h = 1 + Math.floor(R.next() * 3);
      const c = new THREE.Mesh(new THREE.BoxGeometry(2.5 * 2, 2.6 * h, 6), mat(CC[Math.floor(R.next() * CC.length)]));
      c.position.set(v, 1.3 * h, u);
      g.add(c);
    }
    // đồi thấp phía chân trời (sương mù làm mờ xanh dần)
    for (let i = 0; i < 9; i++) {
      const u = L - 40 + R.next() * 60, v = (i - 4) * 70 + R.next() * 30, s = 40 + R.next() * 45;
      const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat(0x4a6b45));
      hill.scale.set(s, 12 + R.next() * 16, s * 0.6);
      hill.position.set(v, 0, u);
      g.add(hill);
    }
    scene.add(g);
    groups.push(g);
  });
  return groups;
}
