// =============================================================
// ĐẠO CỤ CẢNH PHIM (cốt truyện): xe tải container dài, tấm ván dựng làm dốc phóng xe.
// Chỉ để nhìn — dựng bằng khối cơ bản, đầu xe / đầu dốc quay về +z.
// =============================================================
import * as THREE from 'three';

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
