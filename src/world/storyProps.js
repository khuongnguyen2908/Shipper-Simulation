// =============================================================
// ĐẠO CỤ CẢNH PHIM (cốt truyện): xe tải container dài, tấm ván dựng làm dốc phóng xe.
// Chỉ để nhìn — dựng bằng khối cơ bản, đầu xe / đầu dốc quay về +z.
// =============================================================
import * as THREE from 'three';
import { makeBike } from './models.js';

const mats = new Map();
const mat = (color, opts = {}) => {
  const k = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...opts }));
  return mats.get(k);
};
function box(g, w, h, d, color, x, y, z, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
function wheel(g, x, z, r = 0.5) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.36, 12).rotateZ(Math.PI / 2), mat(0x151515));
  m.position.set(x, r, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

// Xe tải container dài (~14 m): đầu kéo đỏ + thùng container. Gốc ở giữa xe, đầu xe về +z. userData.len = chiều dài, wheels để quay bánh
export function makeLongTruck({ cab = 0xc0392b, box: boxColor = 0xe8e4da, stripe = 0x2e6fd6 } = {}) {
  const g = new THREE.Group(), W = 2.4, L = 14, front = L / 2;
  // đầu kéo
  box(g, W, 1.0, 2.6, 0x222222, 0, 0.75, front - 1.3);
  box(g, W, 2.0, 2.2, cab, 0, 2.15, front - 1.2);
  box(g, W - 0.2, 0.9, 0.06, 0x9cc4d8, 0, 2.5, front - 0.08, { metalness: 0.3, roughness: 0.2 }); // kính trước
  box(g, W + 0.02, 0.35, 0.1, 0x333333, 0, 1.0, front - 0.02); // ba đờ sốc
  for (const s of [-1, 1]) {
    box(g, 0.32, 0.18, 0.06, 0xfff4c8, s * 0.85, 1.25, front, { emissive: 0xffeeaa, emissiveIntensity: 0.6 }); // đèn pha
    box(g, 0.08, 0.5, 0.3, 0x222222, s * (W / 2 + 0.08), 2.6, front - 0.4); // gương
  }
  box(g, 0.12, 1.2, 0.12, 0x9a9a9a, W / 2 - 0.2, 3.5, front - 2.3); // ống khói
  // thùng container
  const cl = L - 2.9, cz = front - 2.9 - cl / 2;
  box(g, W, 0.35, cl + 0.2, 0x2a2a2a, 0, 0.95, cz); // sàn
  box(g, W, 2.6, cl, boxColor, 0, 2.45, cz);
  for (let i = 0; i <= 10; i++) box(g, W + 0.04, 2.6, 0.06, 0xcfcac0, 0, 2.45, cz - cl / 2 + (i * cl) / 10); // gân thùng
  for (const s of [-1, 1]) box(g, 0.02, 0.3, cl - 0.4, stripe, s * (W / 2 + 0.03), 2.0, cz);
  box(g, W + 0.02, 0.2, 0.1, 0xd62222, 0, 1.0, cz - cl / 2 - 0.05, { emissive: 0x880000, emissiveIntensity: 0.4 }); // đèn hậu
  // bánh: 1 cặp trước + 2 cặp đầu kéo + 3 cặp sau thùng
  const wheels = [];
  for (const z of [front - 0.9, front - 3.4, front - 4.5, cz - cl / 2 + 1.0, cz - cl / 2 + 2.1, cz - cl / 2 + 3.2]) for (const s of [-1, 1]) wheels.push(wheel(g, s * (W / 2 - 0.15), z));
  g.userData = { len: L, wide: W, height: 3.75, wheels, wheelR: 0.5 };
  return g;
}

// Tấm ván dài dựng nghiêng làm dốc (công trình): đầu thấp ở gốc, chạy lên theo +z dài len, cao h ở đầu cao, kê bằng chồng gạch + giá gỗ
export function makeRamp({ len = 7, h = 1.5, w = 1.2 } = {}) {
  const g = new THREE.Group(), a = Math.asin(Math.min(0.9, h / len)), run = Math.cos(a) * len;
  const plank = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, len), mat(0xb8865a));
  plank.position.set(0, h / 2 + 0.04, run / 2);
  plank.rotation.x = -a;
  plank.castShadow = plank.receiveShadow = true;
  g.add(plank);
  for (const s of [-0.3, 0, 0.3]) { // vân ván ghép
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.085, len), mat(0x8a5f3a));
    line.position.copy(plank.position).add(new THREE.Vector3(s * w, 0.002, 0));
    line.rotation.x = -a;
    g.add(line);
  }
  // kê đầu cao: chồng gạch + 2 chân giá gỗ
  box(g, w + 0.3, h - 0.05, 0.6, 0xa84b2a, 0, (h - 0.05) / 2, run - 0.2);
  for (const s of [-1, 1]) box(g, 0.1, h + 0.2, 0.1, 0x6b4a2b, s * (w / 2 + 0.1), (h + 0.2) / 2, run + 0.15);
  // đống gạch, bao xi măng bên cạnh (trang trí)
  box(g, 0.9, 0.5, 0.7, 0xa84b2a, w + 0.4, 0.25, run * 0.5);
  box(g, 0.7, 0.35, 0.5, 0xd9d4c7, -(w + 0.3), 0.18, run * 0.35);
  g.userData = { len, run, h, w, slope: a };
  return g;
}

// Giá vẽ chân chữ A + bức tranh (triển lãm): tranh quay về +z, màu tranh vẽ bằng vài mảng màu ngẫu nhiên cố định theo seed
export function makeEasel(seed = 1) {
  const g = new THREE.Group(), wood = 0x8a5a33;
  for (const s of [-1, 1]) {
    const leg = box(g, 0.05, 1.7, 0.05, wood, s * 0.32, 0.83, 0.05);
    leg.rotation.z = -s * 0.12;
  }
  const back = box(g, 0.05, 1.6, 0.05, wood, 0, 0.78, -0.35);
  back.rotation.x = -0.3;
  box(g, 0.8, 0.05, 0.08, wood, 0, 0.75, 0.08); // gờ đỡ tranh
  const P = [[0xe74c3c, 0xf1c40f, 0x2980b9], [0x16a085, 0xecf0f1, 0x8e44ad], [0xd35400, 0x2c3e50, 0xf39c12], [0x27ae60, 0xe8daef, 0xc0392b]][Math.abs(seed) % 4];
  box(g, 0.86, 0.7, 0.04, 0xf5f0e6, 0, 1.15, 0.12); // khung + vải
  box(g, 0.7, 0.28, 0.01, P[0], 0, 1.27, 0.145);
  box(g, 0.34, 0.24, 0.01, P[1], -0.17, 1.0, 0.145);
  box(g, 0.32, 0.24, 0.01, P[2], 0.18, 1.0, 0.145);
  return g;
}
// Thùng rác nhựa xanh có nắp (chỗ núp khi bám theo lén)
export function makeBin() {
  const g = new THREE.Group();
  box(g, 0.62, 0.95, 0.62, 0x1e8449, 0, 0.48, 0);
  box(g, 0.68, 0.08, 0.68, 0x145a32, 0, 0.99, 0);
  for (const s of [-1, 1]) box(g, 0.08, 0.2, 0.2, 0x111111, s * 0.33, 0.12, -0.25); // bánh xe
  return g;
}
// Lon nước ngọt nằm lăn lóc giữa hẻm (vấp → kêu "keng")
export function makeCan() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10).rotateZ(Math.PI / 2), mat(0xc0392b, { metalness: 0.6, roughness: 0.3 }));
  m.position.y = 0.05;
  m.castShadow = true;
  g.add(m);
  return g;
}

// Bó hoa gói giấy kraft (anh Đạt buộc trên đuôi xe, chương 4): nằm dọc trục z, đầu hoa về +z, dài ~0,55 m
export function makeBouquet() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 8, 1, true).rotateX(-Math.PI / 2), mat(0xc8a27a, { side: THREE.DoubleSide }));
  paper.position.z = 0.02; // đầu nhọn về phía cuống (−z), miệng loe ôm bông hoa (+z)
  paper.castShadow = true;
  g.add(paper);
  box(g, 0.05, 0.05, 0.16, 0x3d7a2e, 0, 0, -0.25); // cuống
  box(g, 0.06, 0.02, 0.04, 0xc0392b, 0, 0, -0.14); // nơ
  const cols = [0xe74c3c, 0xff8fb1, 0xffffff, 0xe74c3c, 0xff8fb1, 0xf5b7b1, 0xe74c3c];
  cols.forEach((c, i) => {
    const a = (i / cols.length) * Math.PI * 2, r = i === 0 ? 0 : 0.08;
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.068, 0), mat(c));
    f.position.set(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1, 0.22 + (i % 2) * 0.04);
    f.castShadow = true;
    g.add(f);
  });
  for (let i = 0; i < 4; i++) {
    const l = box(g, 0.02, 0.09, 0.12, 0x2e8b3a, Math.cos(i * 1.6) * 0.1, Math.sin(i * 1.6) * 0.1, 0.2);
    l.rotation.z = i * 1.6;
  }
  return g;
}

// Nước ngập (cảnh phim, chỉ máy người chơi này thấy): mặt nước đục, hơi trong, gợn nhẹ — đặt dọc đoạn đường (w ngang, l dọc)
export function makeWater({ w = 9, l = 30, depth = 0.45 } = {}) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, depth, l), new THREE.MeshStandardMaterial({ color: 0x6f969e, emissive: 0x16323a, transparent: true, opacity: 0.8, roughness: 0.08, metalness: 0.2, depthWrite: false }));
  m.position.y = depth / 2 - 0.02;
  m.renderOrder = 2;
  g.add(m);
  // vệt sáng gợn nước
  const hi = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, l * 0.95, 1, 1), new THREE.MeshBasicMaterial({ color: 0xcfe4ea, transparent: true, opacity: 0.18, depthWrite: false }));
  hi.rotation.x = -Math.PI / 2;
  hi.position.y = depth + 0.01;
  g.add(hi);
  g.userData.water = { hi };
  return g;
}
// Mô tô anh Đạt dựng chân chống (không người ngồi) — dùng lại đúng mẫu xe sport bike đen sọc xanh lá
export function makeParkedBigBike() {
  const b = makeBike(0x15171c, 'supersport');
  b.userData.bagMesh && (b.userData.bagMesh.visible = false);
  b.rotation.z = 0.12; // nghiêng chân chống
  return b;
}
