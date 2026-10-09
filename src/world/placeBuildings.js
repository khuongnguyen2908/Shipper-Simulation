// =============================================================
// NHÀ CỦA ĐỊA ĐIỂM theo "Kiểu nhà" (src/data/looks.js) — phong cách A+.
// Dựng trong hệ toạ độ riêng: mặt tiền ở z = 0 quay ra +z (ra đường), nhà lùi vào tới z = −D,
// bề ngang x ∈ [−W/2, W/2], y = 0 là mặt vỉa hè. Đồ bày ra vỉa hè (xe đẩy, ghế, lốp…) nằm ở z 0…2,6.
// Dùng chung cho thành phố (city.js) và khung xem trước trong ?editor.
// Nhà có thân giống nhà ống thì lấy thân nhà ống A+ (houses.js) rồi gắn thêm đồ riêng của từng kiểu.
// =============================================================
import * as THREE from 'three';
import { PartList, sideGeo, rodGeo, makeBike, makePerson, makeCar } from './models.js';
import { LANDMARKS, LANDMARK_LOOKS } from './landmarks.js';
import { HouseGeo, buildHouse, houseMaterial, houseTop } from './houses.js';
import { makeSignTexture } from './textures.js';
import { fmt, list } from '../content/index.js';
import { makeRng } from '../sim/rng.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AIRPORT_MIN_W, airportZones } from '../sim/airport.js';

const PI = Math.PI;
const hasDOM = typeof document !== 'undefined';

// ---------- texture vẽ bằng canvas (chỉ trên trình duyệt; trong Node trả về null) ----------
const TEX = new Map();
function texKey(key, w, h, draw, repeat = false) {
  if (TEX.has(key)) return key;
  if (!hasDOM) {
    TEX.set(key, null);
    return key;
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  TEX.set(key, t);
  return key;
}
const fitFont = (g, t, maxW, size) => {
  let s = Math.round(size);
  do g.font = `bold ${(s -= 2) + 2}px Arial`;
  while (g.measureText(t).width > maxW && s > 8);
};
// chữ ngang / dọc trên nền màu
function textTex(text, { bg = '#c0392b', fg = '#ffffff', w = 512, h = 128, vertical = false, border = null } = {}) {
  return texKey(`txt|${text}|${bg}|${fg}|${w}|${h}|${vertical}|${border}`, w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (border) {
      g.strokeStyle = border;
      g.lineWidth = 5;
      g.strokeRect(6, 6, w - 12, h - 12);
    }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (vertical) {
      const ch = [...String(text).replace(/\s+/g, '')];
      const size = Math.min(w * 0.7, (h / Math.max(1, ch.length)) * 0.8);
      g.font = `bold ${size}px Arial`;
      ch.forEach((c, i) => g.fillText(c, w / 2, ((i + 0.5) * h) / ch.length));
    } else {
      fitFont(g, String(text), w - 30, h * 0.6);
      g.fillText(String(text), w / 2, h / 2 + 2);
    }
  });
}
const T = {
  wood: () => texKey('wood', 128, 128, (g, w, h) => {
    const r = makeRng(8);
    for (let x = 0; x < w; x += 16) {
      const v = 70 + r.next() * 30;
      g.fillStyle = `rgb(${v + 40},${v + 12},${v - 20})`;
      g.fillRect(x, 0, 14, h);
      g.fillStyle = '#2a1a10';
      g.fillRect(x + 14, 0, 2, h);
    }
  }, true),
  roofTile: () => texKey('rooftile', 128, 128, (g, w, h) => {
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = '#a84a2c';
      g.fillRect(x, 0, 8, h);
      g.fillStyle = '#7d321d';
      g.fillRect(x + 8, 0, 8, h);
    }
    g.fillStyle = 'rgba(50,20,10,.55)';
    for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 3);
  }, true),
  glassGrid: () => texKey('glassgrid', 128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#9cc7e0');
    gr.addColorStop(0.45, '#5f8fb0');
    gr.addColorStop(0.55, '#c9e2f0');
    gr.addColorStop(1, '#4e7895');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f3b44';
    g.fillRect(0, 0, 5, h);
    g.fillRect(0, 0, w, 5);
  }, true),
  corr: () => texKey('corr', 64, 64, (g, w, h) => {
    for (let x = 0; x < w; x += 8) {
      g.fillStyle = '#ffffff';
      g.fillRect(x, 0, 4, h);
      g.fillStyle = '#bdbdbd';
      g.fillRect(x + 4, 0, 4, h);
    }
  }, true),
  vent: () => texKey('vent', 64, 64, (g, w, h) => {
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d3630';
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(32 + Math.cos((k * PI) / 2 + 0.78) * 14, 32 + Math.sin((k * PI) / 2 + 0.78) * 14, 9, 0, 7);
      g.fill();
    }
  }, true),
  pump: () => texKey('pump', 64, 64, (g, w, h) => {
    g.fillStyle = '#0d2a1a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#5dff9a';
    g.font = 'bold 14px monospace';
    g.fillText('088.00', 6, 24);
    g.fillText('23450', 10, 48);
  }),
  price: (bg) => texKey(`price|${bg}`, 128, 256, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    list('city.gasPrices').slice(0, 3).forEach((row, i) => {
      const [a, b] = String(row).split('|');
      g.fillStyle = '#111';
      g.fillRect(10, 40 + i * 70, w - 20, 60);
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.font = 'bold 15px Arial';
      g.fillText(a || '', w / 2, 60 + i * 70);
      g.fillStyle = '#ff5a3c';
      g.font = 'bold 24px monospace';
      g.fillText(b || '', w / 2, 88 + i * 70);
    });
  }),
  menu: (title, lines, dark = false) => texKey(`menu|${title}|${lines.join(',')}|${dark}`, 256, 192, (g, w, h) => {
    g.fillStyle = dark ? '#2b2240' : '#fbf6e9';
    g.fillRect(0, 0, w, h);
    g.fillStyle = dark ? '#ffd27a' : '#c0392b';
    g.textAlign = 'center';
    fitFont(g, title, w - 20, 30);
    g.fillText(title, w / 2, 34);
    g.textAlign = 'left';
    g.fillStyle = dark ? '#ffffff' : '#333333';
    lines.slice(0, 5).forEach((t, i) => {
      fitFont(g, `• ${t}`, w - 30, 20);
      g.fillText(`• ${t}`, 16, 68 + i * 26);
    });
  }),
};

// ---------- vật liệu dùng chung ----------
const MATS = new Map();
function matFor(kind) {
  if (MATS.has(kind)) return MATS.get(kind);
  let m;
  if (kind === '') m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0.03 });
  else if (kind === 'metal') m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.32, metalness: 0.45 });
  else if (kind === 'glass') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.45 });
  else if (kind === 'light') m = new THREE.MeshBasicMaterial({ vertexColors: true });
  else if (kind === 'double') m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, side: THREE.DoubleSide });
  else if (kind.startsWith('glow:')) m = new THREE.MeshBasicMaterial({ vertexColors: true, map: TEX.get(kind.slice(5)) || null });
  else m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, map: TEX.get(kind.slice(4)) || null }); // 'tex:<khóa>'
  MATS.set(kind, m);
  return m;
}

// Bộ gom mảnh theo vật liệu → mỗi vật liệu 1 khối
class Kit {
  constructor() {
    this.parts = new Map();
  }
  add(geo, color, kind = '', x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, ao = 0.8) {
    if (!this.parts.has(kind)) this.parts.set(kind, new PartList(kind.startsWith('tex:') || kind.startsWith('glow:')));
    this.parts.get(kind).add(geo, color, x, y, z, rx, ry, rz, ao);
  }
  box(w, h, d, x, y, z, color, kind = '', r = [0, 0, 0]) {
    this.add(new THREE.BoxGeometry(w, h, d), color, kind, x, y, z, ...r);
  }
  cyl(rt, rb, h, x, y, z, color, kind = '', seg = 10, r = [0, 0, 0]) {
    this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, kind, x, y, z, ...r);
  }
  ball(rad, x, y, z, color, kind = '', sc = [1, 1, 1]) {
    this.add(new THREE.IcosahedronGeometry(rad, 0).scale(...sc), color, kind, x, y, z);
  }
  rod(a, b, rad, color, kind = '') {
    this.add(rodGeo(a, b, rad), color, kind);
  }
  // mặt phẳng (texture lặp theo kích thước nếu rep = cỡ 1 ô texture, mét)
  plane(w, h, x, y, z, color, kind = '', r = [0, 0, 0], rep = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    if (rep) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / rep, (uv.getY(i) * h) / rep);
    }
    this.add(g, color, kind, x, y, z, ...r, 1);
  }
  meshes(group) {
    for (const [kind, L] of this.parts) {
      const m = new THREE.Mesh(L.build(), matFor(kind));
      m.castShadow = kind !== 'light' && kind !== 'glass' && !kind.startsWith('glow:');
      m.receiveShadow = true;
      group.add(m);
    }
  }
}

// ---------- sân bay: đường trên cao ----------
export const AIRPORT_UP = 4.6; // cao độ sàn ga đi (mặt đường trên cao)
const RW_AIR = 7; // bề rộng đường trên cao (cả lan can)
export { AIRPORT_MIN_W }; // lô hẹp hơn thì sân bay chỉ có nhà ga, không có đường trên cao (src/sim/airport.js)
// Đường tâm của đường trên cao (toạ độ riêng của lô: mặt tiền z = 0 quay ra đường, lùi vào tới z ≈ −34; [x, z, độ cao]).
// Vào ở mép phải (x = +W/2) phía sau → dốc cong lên → sàn ga đi dọc mặt tiền (z ≈ −9,2) → dốc cong xuống → ra mép trái.
export function airportPath(W) {
  const X = W / 2, U = AIRPORT_UP;
  const pts = [[X - 0.5, -30, 0], [X - 6, -30.5, 0.1], [X - 11, -27, 1.0], [X - 13.5, -20, 2.6], [X - 15, -13.5, 3.9], [X - 19, -9.4, U], [X - 28, -9.2, U], [0, -9.2, U]];
  const all = [...pts, ...pts.slice(0, -1).reverse().map(([x, z, y]) => [-x, z, y])];
  return new THREE.CatmullRomCurve3(all.map(([x, z, y]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.3);
}

const hexNum = (c, fb) => (typeof c === 'number' ? c : /^#[0-9a-f]{6}$/i.test(c || '') ? parseInt(c.slice(1), 16) : fb);
const css = (n) => '#' + n.toString(16).padStart(6, '0');
const firstWords = (s, n) => String(s || '').trim().split(/\s+/).slice(0, n).join(' ');

// ---------- mảnh ghép dùng chung ----------
function shell(o, extra = {}) {
  const g = new HouseGeo();
  buildHouse(g, { x: 0, y: 0, z: 0, nx: 0, nz: 1, W: o.W, D: o.D, floors: o.floors, color: o.color, seed: o.seed, ground: 'shop', place: true, ...extra });
  return g;
}
function stool(k, x, z, c, h = 0.4) {
  k.cyl(0.15, 0.19, h, x, h / 2, z, c, '', 8);
}
function table(k, x, z, c, w = 0.6, d = 0.45, h = 0.52) {
  k.box(w, 0.04, d, x, h, z, c);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.04, h, 0.04, x + (a * (w - 0.1)) / 2, h / 2, z + (b * (d - 0.1)) / 2, c);
}
function plant(k, x, y, z, s = 1, pot = 0xb5653a) {
  k.cyl(0.15 * s, 0.11 * s, 0.26 * s, x, y + 0.13 * s, z, pot, '', 8);
  for (let i = 0; i < 4; i++) k.ball(0.14 * s, x + Math.cos(i * 1.7) * 0.08 * s, y + (0.38 + i * 0.05) * s, z + Math.sin(i * 1.7) * 0.08 * s, [0x4f9a3a, 0x3f8f3a][i % 2]);
}
function tree(k, x, z, h, r, s = 1) {
  k.cyl(0.12, 0.2, h, x, h / 2, z, 0x6e4b2a, '', 7);
  for (let i = 0; i < 10; i++) k.ball((0.6 + r.next() * 0.5) * s, x + (r.next() - 0.5) * 1.8 * s, h + (r.next() - 0.3) * 1.1 * s, z + (r.next() - 0.5) * 1.8 * s, [0x3f8f3a, 0x4f9a3a, 0x367a33][i % 3]);
}
function awning(k, W, color, y = 2.95, depth = 1.6) {
  k.box(W - 0.8, 0.12, depth, 0, y, depth / 2, color);
}
// mái ngói: hình thang đùn theo bề ngang + bờ nóc + đầu đao cong lên
function tileRoof(k, w, d, h, x, y, z) {
  k.add(sideGeo([[-d / 2, 0], [d / 2, 0], [d * 0.07, h], [-d * 0.07, h]], w, 0.02), 0xffffff, 'tex:' + T.roofTile(), x, y, z);
  k.box(w * 0.95, 0.2, 0.3, x, y + h + 0.06, z, 0x7d321d);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const dir = new THREE.Vector3(sx * 0.5, 0.8, sz * 0.45).normalize(), L = 0.7;
      const g = new THREE.ConeGeometry(0.09, L, 5);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      k.add(g, 0x7d321d, '', x + (sx * w) / 2 + dir.x * L * 0.4, y + dir.y * L * 0.4, z + (sz * d) / 2 + dir.z * L * 0.4);
    }
  }
}

// cây đa cổ thụ: gốc to nhiều nhánh, tán rộng bè ra, rễ phụ thõng xuống, bệ đá tròn quanh gốc
function banyan(k, x, z, r, s = 1) {
  k.cyl(2.0 * s, 2.2 * s, 0.45, x, 0.3, z, 0xb9b2a5, '', 16); // bệ đá
  k.cyl(0.85 * s, 1.15 * s, 4.2 * s, x, 2.1 * s, z, 0x5a3f28, '', 9);
  for (let i = 0; i < 5; i++) { // nhánh lớn tỏa ra
    const a = (i / 5) * PI * 2 + r.next() * 0.5, L = (3 + r.next() * 1.5) * s;
    k.rod([x, 3.6 * s, z], [x + Math.cos(a) * L, (5.4 + r.next()) * s, z + Math.sin(a) * L], 0.32 * s, 0x5a3f28);
  }
  // tán: nhiều khối dẹt, xếp thành vòm rộng ~6 m
  for (let i = 0; i < 26; i++) {
    const a = r.next() * PI * 2, d = Math.sqrt(r.next()) * 5.2 * s;
    k.ball((1.4 + r.next() * 0.9) * s, x + Math.cos(a) * d, (6.2 + r.next() * 1.6 - d * 0.12) * s, z + Math.sin(a) * d, [0x2f6f2b, 0x3a7d33, 0x285f26][i % 3], '', [1.25, 0.7, 1.25]);
  }
  // rễ phụ thõng xuống từ tán
  for (let i = 0; i < 18; i++) {
    const a = r.next() * PI * 2, d = (1.6 + r.next() * 3.4) * s;
    const rx = x + Math.cos(a) * d, rz = z + Math.sin(a) * d;
    k.rod([rx, (5.6 - d * 0.1) * s, rz], [rx + (r.next() - 0.5) * 0.3, (0.9 + r.next() * 2.2) * s, rz + (r.next() - 0.5) * 0.3], 0.035, 0x6b4f35);
  }
}

// hồ sen: bờ đá, mặt nước, lá sen + hoa hồng, cầu đá nhỏ bắc ngang giữa hồ
function lotusPond(k, x, z, w, d, r, cols) {
  k.box(w + 0.8, 0.45, d + 0.8, x, 0.22, z, 0xb9b2a5); // bờ đá
  k.box(w, 0.06, d, x, 0.42, z, 0x2f5f5a); // mặt nước
  k.box(w, 0.02, d, x, 0.46, z, 0x5aa0a8, 'glass');
  const n = Math.round(w * d * 1.1);
  for (let i = 0; i < n; i++) {
    const lx = x + (r.next() - 0.5) * (w - 0.6), lz = z + (r.next() - 0.5) * (d - 0.6);
    if (Math.abs(lx - x) < 0.8) continue; // chừa chỗ cầu
    k.cyl(0.3 + r.next() * 0.25, 0.3 + r.next() * 0.25, 0.02, lx, 0.49, lz, [0x4c8c3a, 0x5c9c42][i % 2], '', 9);
    if (r.next() < 0.22) {
      k.rod([lx, 0.49, lz], [lx, 0.85, lz], 0.015, 0x4c8c3a);
      k.add(new THREE.ConeGeometry(0.13, 0.26, 6), 0xf4a6c0, '', lx, 0.95, lz, PI, 0, 0);
    }
  }
  // cầu đá cong nhẹ bắc qua hồ (ngang theo chiều sâu)
  for (let i = 0; i < 5; i++) {
    const t = i / 4 - 0.5;
    k.box(1.3, 0.16, (d + 1.2) / 5 + 0.05, x, 0.62 + 0.25 * (1 - 4 * t * t), z + t * (d + 1.2) * 0.8, 0xc9c1ae);
  }
  for (const s of [-1, 1]) k.box(0.08, 0.35, d + 1, x + s * 0.65, 0.95, z, 0xa8a090);
  // bờ hồ chắn đi (trừ lối cầu ở giữa)
  cols.push({ x0: x - w / 2 - 0.4, z0: z - d / 2 - 0.4, x1: x - 0.7, z1: z + d / 2 + 0.4, h: 0.6 });
  cols.push({ x0: x + 0.7, z0: z - d / 2 - 0.4, x1: x + w / 2 + 0.4, z1: z + d / 2 + 0.4, h: 0.6 });
}

// mái ngói có nóc chạy dọc theo chiều sâu (trục z) — cho dãy nhà hai bên sân
function tileRoofZ(k, len, d, h, x, y, z) {
  k.add(sideGeo([[-d / 2, 0], [d / 2, 0], [d * 0.07, h], [-d * 0.07, h]], len, 0.02), 0xffffff, 'tex:' + T.roofTile(), x, y, z, 0, PI / 2, 0);
  k.box(0.3, 0.2, len * 0.95, x, y + h + 0.06, z, 0x7d321d);
}

// xe máy đậu dáng đơn giản (gộp chung vào bộ khối, bãi giữ xe bày nhiều xe mà không nặng)
function parkedBike(k, x, z, c) {
  for (const dz of [-0.62, 0.62]) k.cyl(0.3, 0.3, 0.1, x, 0.3, z + dz, 0x1b1b1b, '', 10, [0, 0, PI / 2]);
  k.box(0.28, 0.35, 1.0, x, 0.55, z, c);
  k.box(0.26, 0.1, 0.55, x, 0.78, z + 0.2, 0x222222);
  k.box(0.08, 0.5, 0.08, x, 0.85, z - 0.55, 0x555555);
  k.box(0.6, 0.05, 0.05, x, 1.1, z - 0.58, 0x333333);
}

// ======================= TỪNG KIỂU NHÀ =======================
// o: { W, D, floors, color (số), signBg (css), sign, kind, menu: [tên món], seed, inAlley }
// trả về { shell?: HouseGeo, sign?: { y, z, w, x } | null, height, colliders: 'full' | [{x0,z0,x1,z1,h}] }
const BUILD = {
  tube(k, o) {
    const sh = shell(o, { ground: o.kind === 'home' || o.kind === 'gate' ? 'home' : 'shop' });
    if (o.kind !== 'home' && o.kind !== 'gate') awning(k, o.W, hexNum(o.signBg, 0x1e8449));
    if (!o.inAlley && (o.kind === 'restaurant' || o.kind === 'cafe')) for (let i = 0; i < 4; i++) stool(k, (i / 3 - 0.5) * (o.W - 3), 2.2 + (i % 2) * 0.6, o.kind === 'cafe' ? 0x2e86c1 : 0xe74c3c);
    return { shell: sh, sign: o.kind === 'gate' ? null : { y: 3.7 }, height: houseTop(o.floors) };
  },

  eatery(k, o) {
    const sh = shell(o, { ground: 'shop' });
    const W = o.W, acc = hexNum(o.signBg, 0xc0392b);
    awning(k, W, acc, 2.95, 1.4);
    // xe đẩy inox có tủ kính + nồi nước dùng
    const cx = -W / 2 + 1.1, cz = 1.0;
    k.box(1.3, 0.85, 0.65, cx, 0.43, cz, 0xc9ced2, 'metal');
    k.box(1.3, 0.45, 0.65, cx, 1.08, cz, 0xcfe8f2, 'glass');
    k.box(1.32, 0.22, 0.67, cx, 1.42, cz, acc);
    k.plane(1.2, 0.18, cx, 1.42, cz + 0.34, 0xffffff, 'tex:' + textTex(firstWords(o.sign, 1) || o.short || '', { bg: css(acc), w: 256, h: 48 }));
    for (let i = 0; i < 5; i++) k.box(0.16, 0.05, 0.1, cx - 0.4 + i * 0.2, 0.9, cz, 0xd9a0a0);
    k.cyl(0.26, 0.26, 0.48, cx + 0.95, 0.24, cz, 0xbfc5ca, 'metal', 12);
    k.cyl(0.27, 0.27, 0.04, cx + 0.95, 0.5, cz, 0x9aa0a6, 'metal', 12);
    // bàn ghế nhựa trên vỉa hè
    for (const [x, z, c] of [[0.6, 1.4, 0xe74c3c], [W / 2 - 1.0, 1.7, 0x3498db]]) {
      if (x > W / 2 - 0.6) continue;
      table(k, x, z, c);
      stool(k, x - 0.45, z + 0.1, c);
      stool(k, x + 0.45, z - 0.1, c);
    }
    // bảng thực đơn trên mặt tiền
    k.plane(0.9, 0.68, W / 2 - 0.9, 1.75, 0.03, 0xffffff, 'tex:' + T.menu(fmt('city.menuTitle'), o.menu || []));
    return { shell: sh, sign: { y: 3.7 }, height: houseTop(o.floors) };
  },

  banhmi(k, o) {
    const sh = shell(o, { ground: 'shop' });
    const W = o.W, acc = hexNum(o.signBg, 0xf7d046);
    const cx = Math.min(0.6, W / 2 - 1.0), cz = 1.15;
    k.box(1.4, 0.75, 0.7, cx, 0.5, cz, 0xc9ced2, 'metal');
    for (const [dx, dz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) k.cyl(0.1, 0.1, 0.06, cx + dx, 0.1, cz + dz, 0x222222, '', 10, [0, 0, PI / 2]);
    k.box(1.4, 0.55, 0.7, cx, 1.15, cz, 0xdff0f7, 'glass');
    for (let i = 0; i < 7; i++) k.ball(0.06, cx - 0.5 + i * 0.17, 0.96, cz, 0xd9a05b, '', [1, 0.7, 3.2]);
    for (let i = 0; i < 4; i++) k.box(0.18, 0.08, 0.14, cx - 0.45 + i * 0.3, 0.92, cz + 0.2, [0xe8a3a3, 0xc0392b, 0xf3e0b5, 0x8bc34a][i]);
    for (const s of [-1, 1]) k.box(0.04, 0.5, 0.04, cx + s * 0.68, 1.67, cz, 0x9aa0a6, 'metal');
    k.box(1.6, 0.3, 0.75, cx, 2.02, cz, acc);
    k.plane(1.5, 0.26, cx, 2.02, cz + 0.38, 0xffffff, 'tex:' + textTex(fmt('city.cartBanhMi'), { bg: css(acc), fg: '#c0392b', w: 256, h: 48 }));
    k.cyl(0.13, 0.13, 0.4, cx - 1.0, 0.2, cz, 0xd35400, '', 10);
    return { shell: sh, sign: { y: 3.7 }, height: houseTop(o.floors) };
  },

  cafe(k, o, r) {
    const fl = 2, W = o.W;
    const sh = shell({ ...o, floors: fl }, { ground: 'home', balcony: false });
    // mặt tiền gỗ tầng trệt: cột, dầm, vách kính, bên trong đèn vàng
    k.plane(W - 0.9, 2.55, 0, 1.3, 0.03, 0xffc98a, 'light');
    k.box(W - 0.9, 2.55, 0.03, 0, 1.3, 0.07, 0xcfe0e8, 'glass');
    const nm = Math.max(2, Math.round(W / 1.2));
    for (let i = 0; i <= nm; i++) k.box(0.05, 2.55, 0.06, -(W - 0.9) / 2 + (i * (W - 0.9)) / nm, 1.3, 0.09, 0x2a1a10);
    for (const s of [-1, 1]) k.box(0.45, 2.7, 0.2, s * (W / 2 - 0.22), 1.35, 0.1, 0xffffff, 'tex:' + T.wood());
    k.box(W, 0.75, 0.2, 0, 3.05, 0.1, 0xffffff, 'tex:' + T.wood());
    for (let i = 0; i < 3; i++) k.ball(0.11, -W / 3 + (i * W) / 3, 2.3, -0.2, 0xffe0a0, 'light');
    // chậu cây treo, đèn dây, cây xanh, ghế thấp quay ra đường
    for (let i = 0; i < Math.round(W / 1.6); i++) {
      const x = -W / 2 + 0.8 + i * 1.6;
      k.rod([x, 3.4, 0.35], [x, 2.85, 0.35], 0.006, 0x8a6a3a);
      k.cyl(0.13, 0.09, 0.18, x, 2.78, 0.35, 0xe8e0d0, '', 8);
      for (let j = 0; j < 4; j++) k.ball(0.09, x + Math.cos(j) * 0.1, 2.7 - j * 0.07, 0.35 + Math.sin(j) * 0.1, 0x3f8f3a);
    }
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-W / 2, 3.35, 0.15), new THREE.Vector3(0, 2.95, 1.4), new THREE.Vector3(W / 2, 3.45, 2.0)]);
    for (let i = 0; i <= 14; i++) {
      const p = curve.getPoint(i / 14);
      k.ball(0.045, p.x, p.y - 0.05, p.z, 0xfff0c0, 'light');
      if (i < 14) {
        const q = curve.getPoint((i + 1) / 14);
        k.rod([p.x, p.y, p.z], [q.x, q.y, q.z], 0.006, 0x222222);
      }
    }
    if (W > 6) tree(k, W / 2 - 0.5, 1.5, 3.4, r, 0.7);
    for (let i = 0; i < Math.max(2, Math.floor((W - 1.5) / 1.0)); i++) {
      const x = -W / 2 + 0.9 + i * 1.0, c = [0x2e86c1, 0xe74c3c][i % 2];
      k.box(0.4, 0.04, 0.38, x, 0.32, 1.45, c);
      k.box(0.4, 0.38, 0.04, x, 0.5, 1.25, c);
      for (const [dx, dz] of [[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]]) k.box(0.03, 0.3, 0.03, x + dx, 0.15, 1.45 + dz, c);
    }
    // tầng lầu: lam gỗ trước cửa sổ + cây rủ
    for (let i = 0; i < 10; i++) k.box(W - 0.4, 0.05, 0.1, 0, 4.1 + i * 0.19, 0.12, 0x7a5232);
    for (let i = 0; i < Math.round(W * 2.5); i++) k.ball(0.12 + (i % 3) * 0.04, -W / 2 + 0.2 + i * 0.4, 3.85 - (i % 4) * 0.18, 0.25, 0x3f8f3a);
    return { shell: sh, sign: { y: 3.08, w: Math.min(6, W - 1.2), z: 0.21 }, height: houseTop(fl) };
  },

  hammock(k, o, r) {
    const W = o.W, D = o.D;
    k.box(W, 0.1, D, 0, 0.05, -D / 2, 0x9a958c);
    const backD = Math.min(1.8, D * 0.2);
    k.box(W, 3.2, backD, 0, 1.6, -D + backD / 2, o.color);
    k.box(Math.min(2.6, W * 0.3), 1.0, 0.6, -W / 4, 0.5, -D + backD + 0.4, 0x7a5a3e);
    // mái tôn trên cột thép
    const roofD = D - backD - 0.6;
    for (const x of [-W / 2 + 0.3, 0, W / 2 - 0.3]) for (const z of [-0.5, -D + backD + 0.2]) k.cyl(0.06, 0.06, 3.3, x, 1.65, z, 0x666a6e, 'metal', 6);
    k.plane(W + 0.4, roofD + 0.6, 0, 3.4, -D + backD + roofD / 2, 0x9aa0a6, 'tex:' + T.corr(), [-PI / 2 + 0.06, 0, 0], 1.2);
    k.plane(W + 0.4, roofD + 0.6, 0, 3.39, -D + backD + roofD / 2, 0x6a6e72, '', [PI / 2 + 0.06, 0, 0]);
    // khung + võng võng xuống
    const cols = [0xe74c3c, 0x2e86de, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085];
    const rows = roofD > 5.5 ? 2 : 1, rowD = Math.min(2.2, (roofD - 0.6) / rows);
    let n = 0;
    for (let row = 0; row < rows; row++) {
      const z0 = -0.9 - row * (rowD + 0.5);
      for (const z of [z0, z0 - rowD]) {
        k.rod([-W / 2 + 0.6, 1.5, z], [W / 2 - 0.6, 1.5, z], 0.035, 0x555555, 'metal');
        for (const s of [-1, 1]) k.box(0.06, 1.5, 0.06, s * (W / 2 - 0.6), 0.75, z, 0x555555, 'metal');
      }
      for (let i = 0; i < Math.floor((W - 1.6) / 1.9); i++) {
        const x = -W / 2 + 1.5 + i * 1.9;
        const pg = new THREE.PlaneGeometry(0.85, rowD - 0.3, 4, 8), p = pg.attributes.position;
        for (let j = 0; j < p.count; j++) {
          const u = p.getX(j) / 0.425, v = p.getY(j) / ((rowD - 0.3) / 2);
          p.setZ(j, -0.5 * (1 - v * v) + 0.16 * u * u);
        }
        pg.rotateX(-PI / 2);
        pg.computeVertexNormals();
        k.add(pg, cols[n++ % cols.length], 'double', x, 1.3, z0 - rowD / 2, 0, 0, 0, 1);
      }
    }
    // hàng rào thấp + cổng
    for (const s of [-1, 1]) {
      k.box(W / 2 - 1.3, 0.9, 0.15, s * (W / 4 + 0.65), 0.45, -0.1, o.color);
      k.box(0.4, 2.4, 0.4, s * 1.2, 1.2, -0.1, o.color);
    }
    if (W > 7) {
      tree(k, -W / 2 + 0.5, 1.5, 4.0, r);
      tree(k, W / 2 - 0.5, 1.5, 3.8, r);
    }
    return { sign: { y: 2.55, w: 2.6, z: 0.12 }, height: 3.5, colliders: 'full' };
  },

  modern(k, o) {
    const sh = shell(o, { ground: 'shop', balcony: false });
    const W = o.W;
    // mặt kính tầng trệt, bên trong quầy + bảng thực đơn phát sáng
    k.plane(W - 0.5, 2.7, 0, 1.35, 0.02, 0x2b2240);
    k.box(Math.min(2.6, W - 1.4), 1.0, 0.4, -0.3, 0.5, 0.3, 0xffffff);
    k.plane(Math.min(2.2, W - 1.6), 0.9, -0.3, 2.0, 0.03, 0xffffff, 'glow:' + T.menu(o.short || '', o.menu || [], true));
    k.box(W - 0.5, 2.6, 0.03, 0, 1.4, 0.6, 0xdbe9f0, 'glass');
    k.box(W - 0.5, 0.06, 0.06, 0, 2.72, 0.62, 0x111111);
    for (const s of [-1, 1]) k.box(0.06, 2.6, 0.06, s * (W / 2 - 0.25), 1.4, 0.62, 0x111111);
    k.box(W - 0.5, 0.04, 0.6, 0, 2.75, 0.3, 0xffffff, 'light');
    // biển dọc nhô ra (chữ 2 mặt)
    const blade = 'glow:' + textTex(firstWords(o.sign, 2), { bg: o.signBg || '#7b4fc9', fg: '#ffffff', w: 128, h: 512, vertical: true });
    k.box(0.12, 1.6, 0.7, W / 2 - 0.15, 4.4, 0.4, hexNum(o.signBg, 0x7b4fc9));
    for (const s of [-1, 1]) k.plane(0.6, 1.5, W / 2 - 0.15 + s * 0.065, 4.4, 0.4, 0xffffff, blade, [0, (s * PI) / 2, 0]);
    // lam gỗ + bồn cây các tầng lầu
    for (let f = 1; f < o.floors; f++) {
      const y0 = 3.4 + (f - 1) * 3.2;
      for (let i = 0; i < 11; i++) k.box(W - 0.6, 0.05, 0.1, 0, y0 + 0.9 + i * 0.18, 0.14, 0x9a6b3c);
      k.box(W, 0.3, 0.45, 0, y0 + 0.2, 0.2, 0xeeeeee);
      for (let i = 0; i < Math.round(W * 2); i++) k.ball(0.13, -W / 2 + 0.3 + i * 0.5, y0 + 0.45, 0.2, 0x4f9a3a);
    }
    // bảng chữ A + chậu cây trên vỉa hè
    k.box(0.6, 0.9, 0.04, W / 2 - 0.9, 0.45, 1.2, 0x2b2b2b, '', [-0.2, 0, 0]);
    plant(k, -W / 2 + 0.5, 0, 0.5, 1.6, 0xeeeeee);
    return { shell: sh, sign: { y: 3.15, z: 0.1, glow: 0.6 }, height: houseTop(o.floors) };
  },

  pagoda(k, o, r) {
    const W = o.W, D = o.D, wall = o.color;
    k.box(W, 0.1, D, 0, 0.05, -D / 2, 0xd8cbb0);
    // tường rào
    const gw = Math.min(6, W * 0.5);
    for (const s of [-1, 1]) {
      k.box(0.3, 1.9, D, s * (W / 2 - 0.15), 0.95, -D / 2, wall);
      k.box(W / 2 - gw / 2, 1.9, 0.3, s * (gw / 4 + W / 4), 0.95, -0.15, wall);
    }
    // cổng tam quan: 4 trụ, dầm, 2 tầng mái ngói đầu đao, câu đối
    const px = [-gw / 2 + 0.25, -gw / 6, gw / 6, gw / 2 - 0.25];
    for (const x of px) k.box(0.5, 3.4, 0.6, x, 1.7, -0.3, wall);
    k.box(gw, 0.6, 0.7, 0, 3.6, -0.3, wall);
    k.box(gw * 0.3, 1.0, 0.7, 0, 4.4, -0.3, wall);
    const cp = 'tex:' + textTex(fmt('city.pagodaCouplet'), { bg: '#a8261c', fg: '#f2c94c', w: 96, h: 512, vertical: true });
    for (const x of [px[1], px[2]]) k.plane(0.28, 2.2, x, 1.9, 0.01, 0xffffff, cp);
    tileRoof(k, gw + 1, 1.8, 0.6, 0, 3.9, -0.3);
    tileRoof(k, gw * 0.42, 1.5, 0.6, 0, 4.9, -0.3);
    // chánh điện phía sau
    const hw = Math.min(W - 2.4, 10), hd = Math.min(5, D * 0.42), hz = -D + 0.4 + hd / 2;
    k.box(hw + 1.4, 0.6, hd + 1.8, 0, 0.3, hz + 0.4, 0xd9cbb0);
    k.box(hw, 3.6, hd, 0, 2.4, hz, wall);
    const nd = Math.max(1, Math.min(3, Math.round(hw / 3)));
    for (let i = 0; i < nd; i++) {
      const x = (i - (nd - 1) / 2) * (hw / nd);
      k.box(1.1, 2.4, 0.08, x, 1.8, hz + hd / 2 + 0.02, 0x6e1a12);
      k.box(1.3, 0.12, 0.1, x, 3.05, hz + hd / 2 + 0.04, 0xd4a017, 'metal');
    }
    const nc = Math.max(2, Math.round(hw / 1.6));
    for (let i = 0; i < nc; i++) k.cyl(0.17, 0.17, 3.6, -hw / 2 + (i * hw) / (nc - 1), 2.4, hz + hd / 2 + 1.0, 0xa8261c, '', 10);
    k.box(hw + 0.4, 0.35, 0.4, 0, 4.25, hz + hd / 2 + 1.0, 0xa8261c);
    k.plane(Math.min(2.6, hw * 0.4), 0.6, 0, 4.7, hz + hd / 2 + 0.2, 0xffffff, 'tex:' + textTex(fmt('city.pagodaHall'), { bg: '#7a1d14', fg: '#f2c94c', border: '#f2c94c', w: 512, h: 128 }));
    tileRoof(k, hw + 2, hd + 2.6, 1.6, 0, 4.4, hz + 1.0);
    k.box(hw * 0.6, 0.9, hd * 0.6, 0, 6.4, hz + 1.0, wall);
    tileRoof(k, hw * 0.72, hd * 0.95, 1.3, 0, 6.85, hz + 1.0);
    k.ball(0.32, 0, 8.55, hz + 1.0, 0xd4a017, 'metal');
    // lư hương đồng giữa sân
    const lz = (hz + hd / 2 + 1.4) / 2 - 0.3;
    k.box(1.1, 0.5, 1.1, 0, 0.35, lz, 0x8a8478);
    k.cyl(0.42, 0.33, 0.55, 0, 0.88, lz, 0x8a6a2a, 'metal', 10);
    k.cyl(0.28, 0.42, 0.24, 0, 1.28, lz, 0x8a6a2a, 'metal', 10);
    k.add(new THREE.ConeGeometry(0.26, 0.45, 10), 0x8a6a2a, 'metal', 0, 1.63, lz);
    // cây bồ đề + tượng Quan Âm (nếu đủ chỗ)
    if (W >= 10) {
      tree(k, -W / 2 + 1.6, lz, 4.8, r);
      const sx = W / 2 - 1.6;
      k.box(1.0, 0.8, 1.0, sx, 0.4, lz, 0xcfc2a8);
      k.cyl(0.4, 0.4, 0.3, sx, 0.95, lz, 0xe8e8e8, '', 10);
      k.add(new THREE.ConeGeometry(0.38, 1.5, 10), 0xf4f4f4, '', sx, 1.85, lz);
      k.ball(0.16, sx, 2.7, lz, 0xf4f4f4, '', [1, 1, 1]);
    }
    return { sign: { y: 3.6, z: 0.06, w: Math.min(2.4, gw * 0.42) }, height: 8.6, colliders: 'full' };
  },

  gas(k, o) {
    const W = o.W, D = o.D, acc = hexNum(o.signBg, 0xd62d20);
    k.box(W, 0.06, D, 0, 0.03, -D / 2, 0xa9a49b);
    const cw = W - 1, cd = Math.min(7, D * 0.62), cz = -D * 0.42;
    k.box(cw, 0.7, cd, 0, 5.3, cz, 0xf4f4f4, 'metal');
    k.box(cw + 0.06, 0.3, cd + 0.06, 0, 5.05, cz, acc);
    for (let i = 0; i < 4; i++) k.box(1.4, 0.03, 0.4, -cw / 4 + (i % 2) * (cw / 2), 4.93, cz - cd / 4 + Math.floor(i / 2) * (cd / 2), 0xffffff, 'light');
    const cols = [];
    const islands = W > 9 ? [-cw / 4, cw / 4] : [0];
    for (const x of islands) {
      k.box(0.45, 4.9, 0.45, x, 2.45, cz, 0xf4f4f4);
      k.box(0.47, 0.6, 0.47, x, 0.3, cz, acc);
      k.box(1.0, 0.18, cd * 0.55, x, 0.09, cz, 0xd9d9d9);
      cols.push({ x0: x - 0.55, z0: cz - cd * 0.28, x1: x + 0.55, z1: cz + cd * 0.28, h: 2 });
      for (const dz of [-cd * 0.18, cd * 0.18]) {
        k.box(0.75, 1.75, 0.45, x, 1.05, cz + dz, 0xf4f4f4);
        k.box(0.77, 0.25, 0.47, x, 1.85, cz + dz, acc);
        k.plane(0.5, 0.4, x, 1.3, cz + dz + 0.23, 0xffffff, 'tex:' + T.pump());
        k.rod([x + 0.38, 1.3, cz + dz], [x + 0.5, 0.55, cz + dz + 0.2], 0.02, 0x111111);
      }
      cols.push({ x0: x - 0.3, z0: cz - 0.3, x1: x + 0.3, z1: cz + 0.3, h: 5 });
    }
    if (D >= 8) {
      const sw = Math.min(6, W - 2);
      k.box(sw, 3, 2.2, 0, 1.5, -D + 1.2, 0xf4f4f4);
      k.box(sw - 0.6, 2.2, 0.03, 0, 1.3, -D + 2.32, 0xcfe0e8, 'glass');
      k.box(sw + 0.05, 0.45, 2.25, 0, 2.95, -D + 1.2, acc);
      cols.push({ x0: -sw / 2, z0: -D + 0.1, x1: sw / 2, z1: -D + 2.3, h: 3 });
    }
    // trụ bảng giá ở góc trước
    const px = W / 2 - 0.9;
    k.box(1.2, 0.5, 0.5, px, 0.25, -0.5, 0x8a8478);
    k.box(1.1, 4.4, 0.32, px, 2.7, -0.5, acc);
    k.plane(1.0, 4.2, px, 2.75, -0.33, 0xffffff, 'tex:' + T.price(css(acc)));
    cols.push({ x0: px - 0.6, z0: -0.75, x1: px + 0.6, z1: -0.25, h: 5 });
    return { sign: { y: 5.3, z: cz + cd / 2 + 0.04, w: Math.min(7, cw - 1) }, height: 5.7, colliders: cols };
  },

  repair(k, o, r) {
    const sh = shell(o, { ground: 'shutter' });
    const W = o.W, inner = W - 0.6;
    // một gian kéo cửa lên: tối bên trong, bảng treo đồ nghề, tủ đồ
    k.plane(Math.min(3.2, inner * 0.7), 2.5, -inner / 2 + Math.min(3.2, inner * 0.7) / 2, 1.25, 0.02, 0x2f2f2f);
    k.plane(1.6, 0.9, -inner / 2 + 1.3, 1.8, 0.03, 0xa0784a);
    for (let i = 0; i < 12; i++) k.box(0.05 + r.next() * 0.05, 0.15 + r.next() * 0.15, 0.03, -inner / 2 + 0.65 + (i % 6) * 0.25, 1.6 + Math.floor(i / 6) * 0.4, 0.05, [0xd62d20, 0x333333, 0x9aa0a6, 0xf1c40f][i % 4], 'metal');
    k.box(0.8, 1.0, 0.5, -inner / 2 + 0.6, 0.5, 0.3, 0xd62d20);
    // lốp chồng, máy nén khí, vết dầu, biển "Vá xe"
    for (const [x, z, n] of [[W / 2 - 0.6, 0.7, 5], [-W / 2 + 0.6, 1.8, 3]]) for (let i = 0; i < n; i++) k.add(new THREE.TorusGeometry(0.26, 0.08, 5, 12).rotateX(PI / 2), 0x1c1c1c, '', x, 0.08 + i * 0.15, z);
    k.cyl(0.22, 0.22, 0.9, 0.2, 0.3, 1.3, 0xd62d20, '', 10, [0, 0, PI / 2]);
    k.box(0.4, 0.3, 0.3, 0.2, 0.65, 1.3, 0x333333, 'metal');
    for (const [x, z, s] of [[0.6, 0.9, 0.5], [-0.6, 2.0, 0.35]]) k.add(new THREE.CircleGeometry(s, 10).rotateX(-PI / 2), 0x232323, '', x, 0.005, z, 0, 0, 0, 1);
    k.add(new THREE.TorusGeometry(0.28, 0.08, 5, 12), 0x1c1c1c, '', -W / 2 + 0.5, 0.3, 2.3, 0, 0.3, 0);
    k.plane(0.6, 0.32, -W / 2 + 0.5, 0.75, 2.36, 0xffffff, 'tex:' + textTex(fmt('city.repairSign'), { bg: '#f4f4f4', fg: '#d62d20', w: 256, h: 128 }), [0, 0.3, 0]);
    return { shell: sh, sign: { y: 3.7 }, height: houseTop(o.floors), bike: { x: 0.4, z: 1.4, ry: PI / 2 - 0.3 } };
  },

  tro(k, o, r) {
    const W = o.W, D = o.D, n = o.floors, F = 3.0, cd = 1.3; // hành lang sâu 1,3 m
    const nd = Math.max(1, Math.floor((W - 1.4) / 2.4));
    for (let f = 0; f < n; f++) {
      const y = f * F;
      k.box(W, F, D - cd, 0, y + F / 2, -cd - (D - cd) / 2, o.color);
      for (let i = 0; i < nd; i++) {
        const x = -W / 2 + 0.9 + i * ((W - 1.8) / nd);
        k.box(0.95, 2.15, 0.06, x, y + 1.08, -cd + 0.03, 0x2f6fb0);
        k.box(0.06, 0.06, 0.06, x + 0.35, y + 1.1, -cd + 0.08, 0xd4a017, 'metal');
        k.box(0.22, 0.16, 0.02, x, y + 2.4, -cd + 0.01, 0x1d5fa8); // bảng số phòng
        if (x + 1.3 < W / 2) {
          k.box(0.75, 0.7, 0.02, x + 1.05, y + 1.65, -cd + 0.01, 0x9ec3d6, 'glass');
          for (let b = 0; b < 6; b++) k.box(0.015, 0.7, 0.015, x + 0.73 + b * 0.13, y + 1.65, -cd + 0.04, 0x2e3338);
        }
      }
      if (f > 0) {
        // sàn hành lang + cột + lan can + đồ phơi
        k.box(W, 0.18, cd, 0, y + 0.09, -cd / 2, 0xd9d2c5);
        k.box(W, 0.05, 0.05, 0, y + 1.05, -0.06, 0x2e3338);
        for (let b = 0; b <= Math.round(W * 2.5); b++) k.box(0.02, 0.95, 0.02, -W / 2 + b / 2.5, y + 0.6, -0.06, 0x2e3338);
        for (let i = 0; i < Math.floor(W / 1.2); i++) k.box(0.4, 0.5 + r.next() * 0.2, 0.02, -W / 2 + 0.6 + i * 1.15, y + 0.75, -0.03, [0xe74c3c, 0x3498db, 0xf1c40f, 0xffffff, 0x2ecc71][i % 5]);
      }
      for (const s of [-1, 1]) k.box(0.22, F, 0.22, s * (W / 2 - 0.12), y + F / 2, -0.12, o.color);
    }
    // cầu thang lên lầu ở đầu dãy (trong hành lang)
    if (n > 1) for (let i = 0; i < 10; i++) k.box(0.24, 0.3, 1.0, W / 2 - 0.4 - i * 0.24, 0.15 + i * 0.3, -cd / 2, 0xb9b4ab);
    // mái tôn
    k.plane(W + 0.6, D + 0.6, 0, n * F + 0.35, -D / 2, 0x9aa0a6, 'tex:' + T.corr(), [-PI / 2 + 0.08, 0, 0], 1.2);
    k.plane(W + 0.6, D + 0.6, 0, n * F + 0.34, -D / 2, 0x6a6e72, '', [PI / 2 + 0.08, 0, 0]);
    return { sign: { y: 2.62, x: -W / 2 + 1.5, w: Math.min(2.4, W - 1), z: 0.03 }, height: n * F + 0.6, colliders: 'full', bikes: W > 5 };
  },

  apartment(k, o) {
    const sh = shell(o, { ground: 'shutter', balcony: true });
    // cột cầu thang gạch bông gió giữa mặt tiền
    const H = houseTop(o.floors) - 3.4;
    k.plane(2, H, 0, 3.4 + H / 2, 0.66, 0xffffff, 'tex:' + T.vent(), [0, 0, 0], 0.5);
    return { shell: sh, sign: { y: 3.6, w: Math.min(12, o.W - 0.8) }, height: houseTop(o.floors) };
  },

  tower(k, o) {
    const W = o.W, D = o.D, n = o.floors, F = 4, H = 5 + (n - 1) * F;
    const gg = 'tex:' + T.glassGrid();
    // vách kính 3 mặt (texture lặp theo ô 4 m)
    k.plane(W - 0.6, H - 5, 0, 5 + (H - 5) / 2, -0.4, 0xffffff, gg, [0, 0, 0], 4);
    for (const s of [-1, 1]) k.plane(D - 0.8, H - 5, s * (W / 2 - 0.3), 5 + (H - 5) / 2, -D / 2, 0xffffff, gg, [0, (s * PI) / 2, 0], 4);
    k.box(W - 0.7, H - 5, D - 0.9, 0, 5 + (H - 5) / 2, -D / 2, 0x55606a);
    // khối đế: kính sảnh + cột + mái đua
    k.plane(W - 0.4, 4.6, 0, 2.4, -0.2, 0xffffff, gg, [0, 0, 0], 3);
    k.box(W - 0.5, 4.8, D - 0.5, 0, 2.4, -D / 2, 0x4a545c);
    k.box(W, 0.4, D, 0, 5, -D / 2, 0xe0dcd5);
    for (const s of [-1, 1]) k.box(0.6, H + 0.6, 0.6, s * (W / 2 - 0.3), (H + 0.6) / 2, -0.3, 0xe0dcd5);
    k.box(W + 0.4, 0.5, D + 0.4, 0, H + 0.25, -D / 2, 0xe0dcd5);
    // sảnh vào: mái kính + cột thép
    const ew = Math.min(6, W - 2);
    k.box(ew, 0.25, 2.6, 0, 4.0, 1.1, 0xbfe0f0, 'glass');
    k.box(ew + 0.1, 0.15, 2.7, 0, 4.15, 1.1, 0x9aa0a6, 'metal');
    for (const s of [-1, 1]) k.cyl(0.12, 0.12, 4, s * (ew / 2 - 0.2), 2, 2.2, 0x9aa0a6, 'metal', 8);
    // phướn khuyến mãi (trung tâm thương mại)
    if (o.kind === 'market') {
      const ban = list('city.mallBanners'), cols = ['#e84393', '#f39c12', '#2ecc71', '#3498db'];
      const nb = Math.min(4, Math.floor((W - ew) / 2.5));
      for (let i = 0; i < nb; i++) {
        const x = (i < nb / 2 ? -1 : 1) * (ew / 2 + 1.2 + (i % Math.ceil(nb / 2)) * 2.2);
        k.plane(1.0, Math.min(4.5, H - 7), x, 5.5 + Math.min(4.5, H - 7) / 2 + 1, -0.25, 0xffffff, 'tex:' + textTex(String(ban[i % ban.length] || ''), { bg: cols[i % 4], w: 96, h: 512, vertical: true }));
      }
    }
    for (const s of [-1, 1]) if (W > 12) {
      k.box(2.4, 0.5, 1.2, s * (W / 2 - 2.2), 0.25, 1.4, 0xcfc2a8);
      for (let i = 0; i < 6; i++) k.ball(0.3, s * (W / 2 - 2.2) - 0.9 + i * 0.36, 0.7, 1.4, 0x4f9a3a);
    }
    return { sign: { y: H - 1.2, z: 0.15, w: Math.min(12, W - 2), glow: 0.5 }, height: H + 0.5, colliders: 'full' };
  },

  // Sân bay (lô gộp 2 khối, ~86 × 34 m): nhà ga 2 tầng — lầu = ga đi quốc tế, trệt = ga quốc nội + ga đến quốc tế.
  // Đường trên cao cong hình móng ngựa: vào từ mép phải lên dốc → sàn ga đi dọc mặt tiền → xuống dốc ra mép trái.
  // Dưới gầm sàn là làn đón khách tầng trệt. Lô nhỏ (< 60 m) thì chỉ dựng nhà ga, không có đường trên cao.
  airport(k, o, r) {
    const W = o.W, D = o.D, X = W / 2, UP = AIRPORT_UP;
    const big = W >= AIRPORT_MIN_W;
    const tx = big ? X - 17 : X - 1, zt = big ? -13.2 : -3, zb = -D + 1.5, H = 13;
    const gg = 'tex:' + T.glassGrid();
    // mặt sân (nhựa) + lề đi bộ sát nhà ga
    k.box(W, 0.04, D, 0, 0.02, -D / 2, 0x4a4c52);
    k.box(2 * tx, 0.18, 2, 0, 0.09, zt + 1, 0xc9c2b6);
    // nhà ga: thân + vách kính 2 tầng (texture lặp ô 2,5–3 m)
    k.box(2 * tx, H, zt - zb, 0, H / 2, (zt + zb) / 2, 0x55616b);
    k.plane(2 * tx, UP - 0.3, 0, (UP - 0.3) / 2, zt + 0.02, 0xffffff, gg, [0, 0, 0], 2.5);
    k.plane(2 * tx, H - UP, 0, UP + (H - UP) / 2, zt + 0.02, 0xffffff, gg, [0, 0, 0], 3);
    for (const s of [-1, 1]) k.plane(zt - zb, H, s * (tx + 0.01), H / 2, (zt + zb) / 2, 0xffffff, gg, [0, (s * PI) / 2, 0], 3);
    // mái gấp nếp đua ra trước (che sàn ga đi) + viền xanh; vòm giữa nhô cao
    const r0 = big ? -5.2 : zt + 2, n = Math.max(4, Math.round((2 * tx + 4) / 4.2)), pw = (2 * tx + 4) / n;
    for (let i = 0; i < n; i++) {
      const x = -tx - 2 + pw * (i + 0.5);
      k.box(pw + 0.05, 0.3, r0 - zb, x, H + 1.4, (r0 + zb) / 2, 0xe8e8e8, 'metal', [0, 0, (i % 2 ? 1 : -1) * 0.17]);
      k.box(pw, 0.45, 0.3, x, H + 1.4, r0, 0x2e6fb0);
    }
    const vw = Math.min(22, tx), span = zt - 1 - (zb + 2), rise = 2.6, rad = (span * span / 4 + rise * rise) / (2 * rise), arc = 2 * Math.asin(Math.min(1, span / 2 / rad));
    k.add(new THREE.CylinderGeometry(rad, rad, vw, 24, 1, true, PI / 2 - arc / 2, arc).rotateZ(PI / 2), 0xc9ced3, 'metal', 0, H + 5.2 - rad, (zt - 1 + zb + 2) / 2);
    // cột đỡ mái phía trước (đứng trên sàn ga đi)
    if (big) for (let x = -tx + 2; x <= tx - 2; x += 6) k.cyl(0.42, 0.5, H + 1.3 - UP, x, UP + (H + 1.3 - UP) / 2, -5.8, 0xf2f2f2, '', 12);
    // biển các ga (chữ trong vi.json → city.airportSigns, "CHỮ|dòng phụ")
    const signs = list('city.airportSigns').map((s) => String(s).split('|'));
    const board = (i, w, h, x, y, bg) => {
      const [a, b] = signs[i] || ['', ''];
      k.plane(w, h, x, y, zt + 0.05, 0xffffff, 'tex:' + textTex(b ? `${a} · ${b}` : a, { bg, w: 1024, h: 128 }));
    };
    board(0, Math.min(18, tx * 1.2), 1.6, -tx * 0.4, H - 1.6, '#1d5fa8');
    board(1, Math.min(13, tx), 1.1, -tx * 0.45, UP - 1.15, '#c0392b');
    board(2, Math.min(11, tx * 0.8), 1.1, tx * 0.45, UP - 1.15, '#16a085');
    k.plane(Math.min(16, tx * 1.1), 0.9, 0, H + 2.3, zt - 3.02, 0xffffff, 'tex:' + textTex(fmt('city.airportSub'), { bg: '#2b2b2b', w: 1024, h: 96 }));
    // tháp điều khiển phía sau
    const twx = 0, twz = zb + 1.5, th = 21;
    k.cyl(1.3, 1.6, th, twx, th / 2, twz, 0xe8e8e8, '', 14);
    k.cyl(2.4, 1.6, 0.8, twx, th + 0.4, twz, 0xe8e8e8, '', 14);
    k.cyl(2.4, 2.4, 2.2, twx, th + 1.9, twz, 0x2a4a63, '', 14);
    k.cyl(2.7, 2.5, 0.35, twx, th + 3.15, twz, 0x555555, 'metal', 14);
    for (let i = 0; i < 4; i++) k.cyl(0.06, 0.06, 0.9, twx, th + 3.8 + i * 0.9, twz, i % 2 ? 0xffffff : 0xd62d20, '', 6);
    // quảng trường cờ 2 góc trước
    if (big) for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const x = s * (tx - 12 + i * 2.2);
      k.cyl(0.06, 0.08, 8, x, 4, -2.2, 0xdddddd, 'metal', 6);
      k.box(1.6, 1.0, 0.04, x + 0.82, 7.3, -2.2, [0xd62d20, 0x1d5fa8, 0x27ae60, 0xf1c40f][i]);
    }
    const cols = [{ x0: -tx, z0: zb, x1: tx, z1: zt, h: H }, { x0: twx - 1.7, z0: twz - 1.7, x1: twx + 1.7, z1: twz + 1.7, h: th }];
    // đường trên cao cong (vào phải → sàn ga đi → ra trái)
    let walk = null;
    if (big) {
      const path = airportPath(W);
      const pts = path.getSpacedPoints(160), up = new THREE.Vector3(0, 1, 0), RW = RW_AIR;
      const side = pts.map((p, i) => new THREE.Vector3().crossVectors(up, pts[Math.min(160, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).setY(0).normalize()).normalize());
      // dải chạy dọc tim cầu, mép trong / ngoài lệch oa…ob (số, hoặc hàm theo điểm i để bề rộng thay đổi)
      const strip = (oa, ob, dy, th2, color, keep = () => true) => {
        const pos = [], idx = [];
        const at = (o, i) => (typeof o === 'function' ? o(i) : o);
        pts.forEach((p, i) => {
          const s = side[i], a = at(oa, i), b = at(ob, i);
          for (const [o2, h] of [[a, dy], [b, dy], [b, dy - th2], [a, dy - th2]]) pos.push(p.x + s.x * o2, p.y + h, p.z + s.z * o2);
        });
        for (let i = 0; i < 160; i++) {
          if (!keep(i)) continue;
          const a = i * 4, b = a + 4;
          for (const [u, v] of [[0, 1], [1, 2], [2, 3], [3, 0]]) idx.push(a + u, b + u, b + v, a + u, b + v, a + v);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        k.add(geo, color, 'double', 0, 0, 0, 0, 0, 0, 1);
      };
      strip(-RW / 2, RW / 2, 0, 0.55, 0xd2cfc8); // thân cầu
      strip(-RW / 2 + 0.35, RW / 2 - 0.35, 0.02, 0.02, 0x4a4c52); // mặt nhựa
      // lề đi bộ sát nhà ga chạy theo đường cong của cầu: giữa sàn ga đi rộng (xe dừng sát lề thả khách),
      // 2 đầu thu hẹp dần thành mũi tròn rồi nhập vào lan can phía trong
      const onDeck = (i) => pts[i].y > UP - 0.05 && Math.abs(pts[i].x) <= tx + 1;
      const i0 = pts.findIndex((_, i) => onDeck(i)), i1 = pts.length - 1 - [...pts].reverse().findIndex((_, j) => onDeck(pts.length - 1 - j));
      const TAPER = 7, CURB_IN = -RW / 2 - 0.5, CURB_W = 1.9;
      const wide = (i) => {
        if (i < i0 || i > i1) return 0;
        const t = Math.min(1, Math.min(i - i0, i1 - i) / TAPER);
        return Math.sqrt(1 - (1 - t) * (1 - t)); // cung tròn 1/4: mũi bo tròn
      };
      const curbOut = (i) => -RW / 2 + CURB_W * wide(i);
      const inWalk = (i) => i >= i0 && i < i1;
      strip(CURB_IN, curbOut, 0.18, 0.78, 0xc9c2b6, inWalk);
      // lan can; đoạn lề đi bộ đã rộng thì bỏ lan can phía trong
      strip(-RW / 2, -RW / 2 + 0.3, 0.95, 0.95, 0xd2cfc8, (i) => !(wide(i) > 0.5 && wide(i + 1) > 0.5));
      strip(RW / 2 - 0.3, RW / 2, 0.95, 0.95, 0xd2cfc8);
      for (let i = 2; i < 158; i += 3) {
        const p = pts[i], q = pts[i + 1];
        k.add(new THREE.BoxGeometry(0.15, 0.03, p.distanceTo(q) * 0.6).lookAt(new THREE.Vector3(q.x - p.x, 0, q.z - p.z)), 0xf1c40f, '', (p.x + q.x) / 2, (p.y + q.y) / 2 + 0.04, (p.z + q.z) / 2, 0, 0, 0, 1);
      }
      for (let i = 4; i < 160; i += 8) {
        const p = pts[i];
        if (p.y > 1.6) {
          k.cyl(0.45, 0.45, p.y - 0.5, p.x, (p.y - 0.5) / 2, p.z, 0xd2cfc8, '', 12);
          cols.push({ x0: p.x - 0.5, z0: p.z - 0.5, x1: p.x + 0.5, z1: p.z + 0.5, h: p.y });
        }
      }
      // mặt lề đi bộ cho bộ va chạm (src/world/elevated.js): dải theo tim cầu, lệch từ CURB_IN tới mép ngoài
      walk = { pts: pts.slice(i0, i1 + 1).map((p) => [p.x, p.y + 0.18, p.z]), lo: CURB_IN, hi: pts.slice(i0, i1 + 1).map((_, j) => curbOut(i0 + j)) };
    }
    // khách đứng chờ với vali (trên lầu ga đi và dưới trệt)
    const extra = [];
    const people = (x0, x1, y, z, n) => {
      for (let i = 0; i < n; i++) {
        const x = x0 + ((x1 - x0) * (i + 0.5)) / n + (r.next() - 0.5);
        const p = makePerson({ shirt: [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0xecf0f1, 0x34495e][i % 6], pants: 0x2c3e50, gender: i % 2 ? 'f' : 'm' });
        p.position.set(x, y, z + (r.next() - 0.5) * 0.6);
        p.rotation.y = r.next() * 2 - 1;
        extra.push(p);
        k.box(0.4, 0.6, 0.25, x + 0.45, y + 0.3, z, [0x2c3e50, 0xc0392b, 0x16a085][i % 3], 'metal');
      }
    };
    if (big) {
      people(-tx + 3, tx - 3, UP + 0.18, -12.2, 4);
      people(-tx + 2, tx - 2, 0.18, zt + 1, 4);
    }
    // ---- luật xe máy (src/sim/airport.js): điểm đón xe công nghệ, bãi xe máy, barie chân dốc "chỉ ô tô" ----
    const zn = airportZones(W);
    const signPost = (text, bg, w, x, y, z, ry = 0) => {
      k.cyl(0.06, 0.06, y, x, y / 2, z, 0x7f8c8d, 'metal', 6);
      k.plane(w, w * 0.22, x, y + w * 0.11, z, 0xffffff, 'tex:' + textTex(text, { bg, w: 768, h: 168 }), [0, ry, 0]);
    };
    const paint = (r, color) => {
      const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      k.box(w, 0.02, d, cx, 0.05, cz, color);
      for (const s of [-1, 1]) {
        k.box(w, 0.025, 0.15, cx, 0.055, cz + (s * (d - 0.15)) / 2, 0xffffff);
        k.box(0.15, 0.025, d, cx + (s * (w - 0.15)) / 2, 0.055, cz, 0xffffff);
      }
    };
    const barriers = [];
    if (zn) {
      // điểm đón xe công nghệ: nền xanh viền trắng + biển + ghế chờ
      const pk = zn.pickup;
      paint(pk, 0x2e8b57);
      signPost(fmt('city.airportPickupSign'), '#1e8449', 3.4, pk.x1 - 0.4, 2.4, pk.z1 - 0.2);
      k.box(2.2, 0.08, 0.5, (pk.x0 + pk.x1) / 2, 0.45, pk.z0 + 0.5, 0x95a5a6, 'metal');
      for (const s of [-1, 1]) k.box(0.08, 0.45, 0.4, (pk.x0 + pk.x1) / 2 + s * 1, 0.22, pk.z0 + 0.5, 0x555555);
      // bãi xe máy: nền xám, vạch ô, mái tôn che nửa sau, xe đậu thành hàng, biển
      const pr = zn.park, roofZ = (pr.z0 + (pr.z0 + pr.z1) / 2) / 2;
      paint(pr, 0x6b7280);
      for (let x = pr.x0 + 1; x < pr.x1 - 0.5; x += 1) k.box(0.06, 0.025, 1.8, x, 0.06, pr.z0 + 1.2, 0xffffff);
      for (const x of [pr.x0 + 0.3, pr.x1 - 0.3]) for (const z of [pr.z0 + 0.3, (pr.z0 + pr.z1) / 2]) {
        k.cyl(0.08, 0.08, 2.6, x, 1.3, z, 0x7f8c8d, 'metal', 6);
        cols.push({ x0: x - 0.15, z0: z - 0.15, x1: x + 0.15, z1: z + 0.15, h: 2.6 });
      }
      k.plane(pr.x1 - pr.x0 + 0.4, (pr.z1 - pr.z0) / 2 + 0.6, (pr.x0 + pr.x1) / 2, 2.65, roofZ, 0x9aa0a6, 'tex:' + T.corr(), [-PI / 2 + 0.06, 0, 0], 1.2);
      const bikeCols = [0xc0392b, 0x2c3e50, 0x7f8c8d, 0x2980b9, 0xecf0f1, 0x8e44ad];
      for (let x = pr.x0 + 1.5, i = 0; x < pr.x1 - 0.5; x += 1, i++) if (r.next() < 0.7) parkedBike(k, x, pr.z0 + 1.2, bikeCols[i % bikeCols.length]);
      signPost(fmt('city.airportParkSign'), '#2c3e50', 3.2, (pr.x0 + pr.x1) / 2, 2.4, pr.z1 - 0.2);
      // biển thu phí ở 2 góc trước khuôn viên
      for (const s of [-1, 1]) signPost(fmt('city.airportGateSign'), '#b9770e', 2.8, s * (X - 0.8), 2.2, -0.6);
      // barie chân dốc (2 đầu đường trên cao): trụ vàng + cần chắn (city.js dựng cần để nâng lên khi ô tô tới), biển "Chỉ ô tô"
      const path = airportPath(W), L = path.getLength(), hw = RW_AIR / 2 - 0.25;
      for (const [t, out] of [[2.5 / L, -1], [1 - 2.5 / L, 1]]) {
        const p = path.getPointAt(t), d = path.getTangentAt(t).setY(0).normalize();
        const nx = -d.z, nz = d.x; // ngang qua mặt đường
        const px = p.x + nx * hw, pz = p.z + nz * hw;
        k.box(0.45, 1.1, 0.45, px, 0.55, pz, 0xf1c40f);
        k.box(0.16, 0.85, 0.16, p.x - nx * hw, 0.42, p.z - nz * hw, 0xf1c40f);
        barriers.push({ x: px, z: pz, ax: -nx, az: -nz, len: 2 * hw, y: 1.05 });
        // biển quay về phía xe máy đi tới (từ ngoài vào)
        const sx = p.x + nx * (hw + 0.9) + d.x * out * 0.5, sz = p.z + nz * (hw + 0.9) + d.z * out * 0.5;
        signPost(fmt('city.airportNoBike'), '#c0392b', 2.6, sx, 2.0, sz, Math.atan2(d.x * out, d.z * out));
        cols.push({ x0: Math.min(px, p.x - nx * hw) - 0.25, z0: Math.min(pz, p.z - nz * hw) - 0.25, x1: Math.max(px, p.x - nx * hw) + 0.25, z1: Math.max(pz, p.z - nz * hw) + 0.25, h: 1.2 });
        // lan can 2 bên đoạn dốc còn sát đất: chắn không cho xe máy lách vào từ hông
        const railAt = (s, side) => {
          const tt = out < 0 ? s / L : 1 - s / L, q = path.getPointAt(tt), qd = path.getTangentAt(tt).setY(0).normalize();
          return { x: q.x - qd.z * side * (hw + 0.2), z: q.z + qd.x * side * (hw + 0.2), y: q.y };
        };
        for (let s = 2.5; s < L / 2 && railAt(s, 1).y < 0.6; s += 0.8) {
          for (const side of [-1, 1]) {
            const a = railAt(s, side), e = railAt(s + 0.9, side); // từng đoạn nối liền nhau (không chừa khe)
            cols.push({ x0: Math.min(a.x, e.x) - 0.2, z0: Math.min(a.z, e.z) - 0.2, x1: Math.max(a.x, e.x) + 0.2, z1: Math.max(a.z, e.z) + 0.2, h: 1.2 });
          }
        }
      }
    }
    return { sign: { y: H + 3.6, z: zt - 3, w: Math.min(22, tx * 1.5), glow: 0.4 }, height: H + 6, colliders: cols, extra, barriers,
      // mặt đi trên cao (src/world/elevated.js): dải cầu + lề đi bộ sát nhà ga; điểm dừng thả khách (theo x) và hướng khách đi vào ga
      ramp: big ? { path: airportPath(W), halfW: RW_AIR / 2 - 0.3, dy: 0.02, walk, stops: [tx * 0.55, 0, -tx * 0.55], toTerminal: [0, -1] } : null };
  },

  karaoke(k, o) {
    const sh = shell(o, { ground: 'shop', balcony: false });
    const W = o.W, n = o.floors;
    // cửa kính viền vàng, thảm đỏ, bậc thềm
    k.plane(W - 0.6, 2.7, 0, 1.35, 0.02, 0x1a1324);
    const dw = Math.min(3, W - 1.6);
    k.box(dw, 2.6, 0.05, 0, 1.3, 0.05, 0x6a5a3a, 'glass');
    for (const [w, h, x, y] of [[dw + 0.1, 0.08, 0, 2.62], [0.08, 2.6, -dw / 2, 1.3], [0.08, 2.6, dw / 2, 1.3], [0.06, 2.6, 0, 1.3]]) k.box(w, h, 0.08, x, y, 0.08, 0xd4a017, 'metal');
    for (let i = 0; i < 3; i++) k.box(dw + 0.4, 0.12, 0.35, 0, 0.06, 0.25 + i * 0.35, 0x8a8478);
    k.box(1.6, 0.02, 2.0, 0, 0.13, 1.1, 0xa8102a);
    // đèn neon viền từng tầng
    for (let f = 1; f < n; f++) {
      const y = 3.4 + (f - 1) * 3.2, c = f % 2 ? 0xff3fa4 : 0x2ee6ff, w = W - 1.2;
      for (const [bw, bh, x, yy] of [[w, 0.06, 0, y + 0.6], [w, 0.06, 0, y + 2.8], [0.06, 2.2, -w / 2, y + 1.7], [0.06, 2.2, w / 2, y + 1.7]]) k.box(bw, bh, 0.06, x, yy, 0.05, c, 'light');
    }
    k.box(W, 0.08, 0.08, 0, 3.4, 0.08, 0xffd23f, 'light');
    // biển dọc lớn (chữ 2 mặt) + chậu cây cọ
    const top = houseTop(n), bh = Math.min(7.5, top - 4.2);
    const blade = 'glow:' + textTex(firstWords(o.sign, 1), { bg: '#120a1f', fg: '#ffd23f', w: 160, h: 600, vertical: true });
    k.box(0.14, bh, 1.3, W / 2 - 0.2, 3.9 + bh / 2, 0.75, 0xd4a017, 'metal');
    for (const s of [-1, 1]) k.plane(1.2, bh - 0.1, W / 2 - 0.2 + s * 0.075, 3.9 + bh / 2, 0.75, 0xffffff, blade, [0, (s * PI) / 2, 0]);
    for (const s of [-1, 1]) {
      const x = s * (dw / 2 + 0.7);
      k.cyl(0.25, 0.2, 0.5, x, 0.25, 0.7, 0xd4a017, 'metal', 8);
      k.cyl(0.04, 0.05, 0.8, x, 0.8, 0.7, 0x6e4b2a, '', 5);
      for (let i = 0; i < 6; i++) {
        const lg = new THREE.BoxGeometry(0.08, 0.02, 0.8).translate(0, 0, 0.4);
        k.add(lg, 0x3f8f3a, '', x, 1.2, 0.7, -0.5, (i * PI) / 3, 0);
      }
    }
    return { shell: sh, sign: { y: 3.0, z: 0.12, w: Math.min(6, W - 1.2), glow: 0.9 }, height: top };
  },

  // ======================= CHÙA TỨ HỢP VIỆN (cả khối, chừa 1 ô góc trước) =======================
  // Cổng tam quan ở mặt trước · chính điện phía sau · 2 dãy nhà tả / hữu · sân trong đi bộ được · tường bao
  // o.cut: góc chừa trống nhìn từ đường — 'FR' (trước-phải, mặc định) | 'FL' (trước-trái)
  pagodaCourtyard(k, o, r) {
    const { W, D } = o, wall = 0xe2b85c, cap = 0x8a3324, red = 0xa8261c;
    if (W < 20 || D < 20) return BUILD.pagoda(k, o, r); // lô nhỏ (chưa đổi sang cả khối) → mẫu chùa nhỏ
    const cols = [];
    const cw = W / 3, cd = D / 3, sx = o.cut === 'FL' ? -1 : 1; // sx: phía có góc chừa (+1 = phải)
    const hasCut = o.cut === 'FL' || o.cut === 'FR'; // không chừa góc → tường bao trọn khối
    const cutX0 = sx > 0 ? W / 2 - cw : -W / 2, cutX1 = sx > 0 ? W / 2 : -W / 2 + cw;
    // nền sân gạch (trừ góc chừa)
    if (hasCut) {
      k.box(W, 0.08, D - cd, 0, 0.04, -cd - (D - cd) / 2, 0xc9b28c);
      k.box(W - cw, 0.08, cd, -sx * cw / 2, 0.04, -cd / 2, 0xc9b28c);
    } else k.box(W, 0.08, D, 0, 0.04, -D / 2, 0xc9b28c);
    // tường bao (mái ngói nhỏ trên đỉnh)
    const wallSeg = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.2) return;
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      k.box(along ? len : 0.4, 2.6, along ? 0.4 : len, cx, 1.3, cz, wall);
      k.box(along ? len + 0.2 : 0.7, 0.18, along ? 0.7 : len + 0.2, cx, 2.68, cz, cap);
      cols.push({ x0: Math.min(x0, x1) - 0.2, z0: Math.min(z0, z1) - 0.2, x1: Math.max(x0, x1) + 0.2, z1: Math.max(z0, z1) + 0.2, h: 2.8 });
    };
    const e = 0.2;
    wallSeg(-W / 2 + e, -D + e, W / 2 - e, -D + e); // sau
    wallSeg(-sx * (W / 2 - e), -D + e, -sx * (W / 2 - e), -e); // cạnh không chừa
    if (hasCut) {
      wallSeg(sx * (W / 2 - e), -D + e, sx * (W / 2 - e), -cd - e); // cạnh có góc chừa
      wallSeg(sx * (W / 2 - e), -cd - e, sx > 0 ? cutX0 - e : cutX1 + e, -cd - e); // quây góc chừa
      wallSeg(sx > 0 ? cutX0 - e : cutX1 + e, -cd - e, sx > 0 ? cutX0 - e : cutX1 + e, -e);
    } else wallSeg(sx * (W / 2 - e), -D + e, sx * (W / 2 - e), -e);
    // mặt trước: cổng tam quan ở giữa phần mặt tiền còn lại
    const fx0 = !hasCut ? -W / 2 + e : sx > 0 ? -W / 2 + e : cutX1 + e, fx1 = !hasCut ? W / 2 - e : sx > 0 ? cutX0 - e : W / 2 - e;
    const gx = (fx0 + fx1) / 2, gw = Math.min(11, (fx1 - fx0) * 0.55);
    wallSeg(fx0, -e, gx - gw / 2, -e);
    wallSeg(gx + gw / 2, -e, fx1, -e);
    // tam quan: cổng giữa cao 2 tầng mái, 2 cổng phụ thấp
    const pil = [-gw / 2, -gw / 6, gw / 6, gw / 2];
    for (const p of pil) {
      k.box(0.7, 4.6, 0.8, gx + p, 2.3, -0.4, red);
      cols.push({ x0: gx + p - 0.4, z0: -0.85, x1: gx + p + 0.4, z1: 0.05, h: 4.6 });
    }
    k.box(gw / 3 + 0.6, 0.8, 1.0, gx, 4.9, -0.4, wall);
    tileRoof(k, gw / 3 + 2.4, 2.6, 0.9, gx, 5.3, -0.4);
    k.box(gw / 3 * 0.7, 1.0, 0.9, gx, 6.5, -0.4, wall);
    tileRoof(k, gw / 3 + 0.8, 2.0, 0.8, gx, 7.0, -0.4);
    for (const s of [-1, 1]) {
      k.box(gw / 3, 0.6, 0.9, gx + s * gw / 3, 3.6, -0.4, wall);
      tileRoof(k, gw / 3 + 1.0, 2.0, 0.7, gx + s * gw / 3, 3.9, -0.4);
    }
    const cp = 'tex:' + textTex(fmt('city.pagodaCouplet'), { bg: '#a8261c', fg: '#f2c94c', w: 96, h: 512, vertical: true });
    for (const p of [pil[1], pil[2]]) k.plane(0.4, 3.0, gx + p, 2.2, 0.02, 0xffffff, cp);
    // trục chính: cổng → lư hương → chính điện
    const back = -D + 1.2;
    const hw = Math.min(W * 0.5, 18), hd = Math.min(D * 0.28, 9), hz = back + hd / 2 + 0.4;
    k.box(hw + 2.4, 0.7, hd + 3.2, gx, 0.35, hz + 0.8, 0xd9cbb0); // nền đá + bậc
    for (let i = 0; i < 3; i++) k.box(4.2, 0.24, 0.5, gx, 0.12 + i * 0.24, hz + hd / 2 + 2.4 - i * 0.5, 0xcfc3a8);
    k.box(hw, 4.4, hd, gx, 2.9, hz, wall);
    const nc = Math.max(3, Math.round(hw / 2.2));
    for (let i = 0; i < nc; i++) k.cyl(0.22, 0.22, 4.4, gx - hw / 2 + (i * hw) / (nc - 1), 2.9, hz + hd / 2 + 1.3, red, '', 10);
    for (let i = 0; i < 3; i++) k.box(1.6, 3.0, 0.1, gx + (i - 1) * 3, 2.2, hz + hd / 2 + 0.03, 0x6e1a12);
    k.plane(Math.min(4, hw * 0.3), 0.9, gx, 5.6, hz + hd / 2 + 0.7, 0xffffff, 'tex:' + textTex(fmt('city.pagodaHall'), { bg: '#7a1d14', fg: '#f2c94c', border: '#f2c94c', w: 512, h: 128 }));
    tileRoof(k, hw + 3, hd + 3.4, 2.0, gx, 5.1, hz + 0.9);
    k.box(hw * 0.62, 1.4, hd * 0.6, gx, 7.6, hz + 0.9, wall);
    tileRoof(k, hw * 0.75, hd * 0.95, 1.7, gx, 8.3, hz + 0.9);
    k.ball(0.45, gx, 10.3, hz + 0.9, 0xd4a017, 'metal');
    cols.push({ x0: gx - hw / 2 - 1.2, z0: hz - hd / 2, x1: gx + hw / 2 + 1.2, z1: hz + hd / 2 + 1.6, h: 10 });
    // 2 dãy nhà tả / hữu (mái chạy dọc theo chiều sâu)
    const sideLen = Math.min(D * 0.36, D - cd - hd - 6), sideZ = -cd - 1.5 - sideLen / 2;
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 3.4), sd = 4.6;
      k.box(sd, 3.4, sideLen, x, 1.7 + 0.08, sideZ, wall);
      const nn = Math.max(2, Math.round(sideLen / 3));
      for (let i = 0; i < nn; i++) k.box(0.1, 2.4, 1.3, x - s * (sd / 2 + 0.02), 1.3, sideZ - sideLen / 2 + ((i + 0.5) * sideLen) / nn, 0x6e1a12);
      tileRoofZ(k, sideLen + 1.2, sd + 1.8, 1.4, x, 3.5, sideZ);
      cols.push({ x0: x - sd / 2, z0: sideZ - sideLen / 2, x1: x + sd / 2, z1: sideZ + sideLen / 2, h: 5 });
    }
    // gác chuông + gác trống ở 2 góc sau
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 3.2), z = -D + 3.2;
      if (Math.abs(x - gx) < hw / 2 + 2.5) continue;
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(0.18, 0.18, 4.2, x + a * 1.4, 2.1, z + b * 1.4, red, '', 8);
      k.box(3.2, 0.3, 3.2, x, 2.6, z, 0x7d5a3a);
      tileRoof(k, 4.2, 4.2, 1.4, x, 4.2, z);
      k.cyl(0.55, 0.75, 1.1, x, 3.4, z, 0x8a6a2a, 'metal', 12); // chuông
      cols.push({ x0: x - 1.6, z0: z - 1.6, x1: x + 1.6, z1: z + 1.6, h: 5.6 });
    }
    // sân: lối đá giữa, lư hương lớn, cây bồ đề, đèn đá, chậu cảnh
    const pathL = Math.abs(hz + hd / 2 + 2.6);
    k.box(3.2, 0.03, pathL, gx, 0.095, -pathL / 2, 0xe0d6c2);
    const lz = (hz + hd / 2 + 2.6) / 2;
    k.box(2.0, 0.7, 2.0, gx, 0.45, lz, 0x8a8478);
    k.cyl(0.85, 0.6, 1.0, gx, 1.3, lz, 0x8a6a2a, 'metal', 12);
    k.cyl(0.5, 0.85, 0.4, gx, 2.0, lz, 0x8a6a2a, 'metal', 12);
    for (const [a, b] of [[-0.5, 0], [0.5, 0], [0, 0.5]]) k.rod([gx + a, 2.1, lz + b], [gx + a, 2.7, lz + b], 0.015, 0xc0392b);
    cols.push({ x0: gx - 1.1, z0: lz - 1.1, x1: gx + 1.1, z1: lz + 1.1, h: 2.3 });
    // phía sân rộng (bên góc chừa): cây đa cổ thụ gần cổng, hồ sen trước chính điện
    const open = sx; // cổng lệch về phía ngược góc chừa → phía góc chừa sân rộng hơn
    const tx = gx + open * Math.min(6.5, W * 0.19), tz = Math.max(lz + 3.5, -D * 0.2);
    banyan(k, tx, tz, r, Math.min(1, W / 34));
    cols.push({ x0: tx - 1.4, z0: tz - 1.4, x1: tx + 1.4, z1: tz + 1.4, h: 7 });
    const pw = Math.min(9, W * 0.27), pd = Math.min(5.5, D * 0.17);
    const px = gx + open * (3.2 + pw / 2), pz = hz + hd / 2 + 2.4 + pd / 2 + 0.6;
    lotusPond(k, px, pz, pw, pd, r, cols);
    for (const s of [-1, 1]) for (const zz of [lz + 3, lz - 3]) {
      const x = gx + s * 2.4;
      k.box(0.5, 0.9, 0.5, x, 0.55, zz, 0x9e9a92);
      k.box(0.7, 0.45, 0.7, x, 1.2, zz, 0xbab5aa);
      k.box(0.8, 0.12, 0.8, x, 1.5, zz, 0x9e9a92);
    }
    for (let i = 0; i < 6; i++) plant(k, gx + (i % 2 ? 1 : -1) * (4 + (i >> 1) * 1.3), 0.08, hz + hd / 2 + 3.2, 1.6, 0x6b4a2b);
    return { sign: { y: 6.2, z: 0.12, x: gx, w: Math.min(6, gw / 3 + 1.4) }, height: 10.8, colliders: cols };
  },

  // ======================= NHÀ HÀNG NHẬT (izakaya kiểu phố Nhật) =======================
  // mặt tiền gỗ tối, cửa lùa song gỗ, rèm noren, đèn lồng đỏ, mái hiên ngói, lầu có cửa sổ giấy sáng đèn, biển dọc, chậu tre
  izakaya(k, o, r) {
    const { W, D } = o;
    const cols = [];
    const bw = W - 0.4, bd = Math.max(3, Math.min(D - 1.0, 9)), h1 = 3.2, h2 = 3.0;
    const wood = 'tex:' + T.wood();
    const zf = -0.3; // mặt tiền lùi vào chút cho đèn lồng, chậu tre
    k.box(bw, h1 + h2, bd, 0, (h1 + h2) / 2, zf - bd / 2, hexNum(o.color, 0x3b2a1e));
    // tầng trệt: cửa lùa song gỗ
    const nd = Math.max(3, Math.round(bw / 1.4));
    for (let i = 0; i < nd; i++) {
      const x = -bw / 2 + ((i + 0.5) * bw) / nd, w = bw / nd - 0.1;
      k.box(w, 2.5, 0.06, x, 1.3, zf + 0.04, 0xffffff, wood);
      k.box(w - 0.3, 1.0, 0.03, x, 1.9, zf + 0.08, 0xf3e3c3, 'light'); // ô giấy phía trên sáng đèn
      for (let j = 1; j < 3; j++) k.box(0.03, 1.0, 0.04, x - (w - 0.3) / 2 + (j * (w - 0.3)) / 3, 1.9, zf + 0.1, 0x2b1d14);
    }
    // rèm noren chữ 居酒屋 ở cửa giữa
    k.plane(Math.min(2.4, bw * 0.4), 0.85, 0, 2.02, zf + 0.12, 0xffffff, 'tex:' + textTex('居酒屋', { bg: '#1b2a4a', fg: '#ffffff', w: 512, h: 180 }));
    // mái hiên ngói giữa 2 tầng
    tileRoof(k, bw + 0.6, 1.5, 0.35, 0, h1 + 0.05, zf + 0.3);
    // lầu: cửa sổ giấy (shoji) sáng đèn + song gỗ
    const nw = Math.max(2, Math.round(bw / 2.2));
    for (let i = 0; i < nw; i++) {
      const x = -bw / 2 + ((i + 0.5) * bw) / nw;
      k.box(1.5, 1.2, 0.04, x, h1 + 1.45, zf + 0.03, 0xf6eedb, 'light');
      for (let j = 0; j <= 3; j++) k.box(0.04, 1.2, 0.05, x - 0.75 + j * 0.5, h1 + 1.45, zf + 0.06, 0x2b1d14);
      k.box(1.5, 0.04, 0.05, x, h1 + 1.45, zf + 0.06, 0x2b1d14);
    }
    tileRoof(k, bw + 0.4, bd + 0.6, 1.2, 0, h1 + h2, zf - bd / 2);
    // đèn lồng đỏ (chōchin) hai bên cửa
    for (const s of [-1, 1]) {
      const x = s * (bw / 2 - 0.55);
      k.rod([x, 3.05, zf + 0.45], [x, 2.85, zf + 0.45], 0.012, 0x111111);
      k.cyl(0.3, 0.3, 0.7, x, 2.45, zf + 0.45, 0xd62d20, 'light', 12);
      for (const y of [2.1, 2.8]) k.cyl(0.31, 0.31, 0.06, x, y, zf + 0.45, 0x111111, '', 12);
    }
    // biển dọc ở mép phải
    k.box(0.55, 2.2, 0.08, bw / 2 - 0.05, h1 + 1.3, zf + 0.25, 0x111111);
    k.plane(0.45, 2.0, bw / 2 - 0.05, h1 + 1.3, zf + 0.3, 0xffffff, 'tex:' + textTex('居酒屋', { bg: '#f6eedb', fg: '#1b1b1b', w: 96, h: 512, vertical: true }));
    // chậu tre + đèn đá trước cửa
    for (const s of [-1, 1]) {
      const x = s * (bw / 2 - 0.3);
      k.box(0.5, 0.35, 0.5, x, 0.18, zf + 0.9, 0x6b5a48);
      for (let i = 0; i < 5; i++) k.cyl(0.03, 0.035, 2.2 + r.next() * 0.6, x + (r.next() - 0.5) * 0.3, 1.3, zf + 0.9 + (r.next() - 0.5) * 0.3, 0x5c8f3a, '', 5);
      cols.push({ x0: x - 0.3, z0: zf + 0.6, x1: x + 0.3, z1: zf + 1.2, h: 2.5 });
    }
    cols.push({ x0: -bw / 2, z0: zf - bd, x1: bw / 2, z1: zf + 0.1, h: h1 + h2 });
    return { sign: { y: 2.95, z: zf + 0.16, w: Math.min(4, bw - 2.4) }, height: h1 + h2 + 1.2, colliders: cols };
  },

  // ======================= QUÁN TRÀ (nhà gỗ mái ngói, hiên, đèn lồng) =======================
  teahouse(k, o, r) {
    const { W, D } = o;
    const cols = [];
    // hiên trước sâu v, nhà phía sau; co theo lô (lô nhỏ thì hiên + nhà nhỏ lại)
    const v = Math.min(2.2, D * 0.28), bd = Math.max(2.5, Math.min(7, D - v - 0.6)), bz = -v - bd / 2, bw = W - 1.2;
    const wood = 'tex:' + T.wood();
    k.box(W, 0.35, D, 0, 0.17, -D / 2, 0x8a8478); // nền đá cao
    k.box(bw, 3.0, bd, 0, 1.85, bz, 0xf3e3c3); // tường vôi
    // vách gỗ + cửa lùa mặt trước
    const nd = Math.max(2, Math.round(bw / 1.6));
    for (let i = 0; i < nd; i++) {
      const x = -bw / 2 + ((i + 0.5) * bw) / nd;
      k.box(bw / nd - 0.12, 2.4, 0.08, x, 1.6, bz + bd / 2 + 0.04, 0xffffff, wood);
      k.box(bw / nd - 0.5, 0.8, 0.05, x, 2.2, bz + bd / 2 + 0.1, 0xf6eedb); // ô giấy dán
    }
    // hiên gỗ phía trước + cột
    k.box(bw + 0.4, 0.12, v, 0, 0.41, -v / 2, 0xffffff, wood);
    for (const x of [-bw / 2, -bw / 6, bw / 6, bw / 2]) k.cyl(0.13, 0.13, 3.0, x, 1.85, -0.25, 0x6e3b1f, '', 8);
    tileRoof(k, bw + 1.6, bd + v + 0.6, 1.5, 0, 3.35, -(bd + v + 0.6) / 2 + 0.3);
    cols.push({ x0: -bw / 2, z0: bz - bd / 2, x1: bw / 2, z1: bz + bd / 2, h: 4.8 });
    // đèn lồng đỏ dưới mái hiên
    for (const x of [-bw / 3, 0, bw / 3]) {
      k.rod([x, 3.3, -0.4], [x, 2.95, -0.4], 0.01, 0x222222);
      k.ball(0.26, x, 2.7, -0.4, 0xd62d20, 'light', [1, 1.25, 1]);
    }
    // bàn trà thấp + ghế đẩu + ấm trà trên hiên
    for (const x of [-bw / 4, bw / 4]) {
      table(k, x, -v / 2, 0x6e3b1f, 0.9, 0.6, 0.62);
      k.cyl(0.11, 0.13, 0.16, x, 0.92, -v / 2, 0x5d6d3a, '', 8);
      k.cyl(0.04, 0.04, 0.06, x + 0.2, 0.88, -v / 2 + 0.1, 0xf3e3c3, '', 6);
      for (const dx of [-0.65, 0.65]) stool(k, x + dx, -v / 2, 0x8b5a2b, 0.42);
    }
    for (const s of [-1, 1]) plant(k, s * (W / 2 - 0.5), 0.35, -0.5, 1.3, 0x6b4a2b);
    return { sign: { y: 3.6, z: 0.25, w: Math.min(5, bw - 0.6) }, height: 5, colliders: cols };
  },

  // ======================= ĐỒN CÔNG AN: nhà công an + bãi giữ xe vi phạm =======================
  // Lô rộng (≥ 14 m mặt tiền): nhà bên trái, bãi bên phải. Lô hẹp sâu: nhà phía trước, bãi phía sau.
  police(k, o, r) {
    const { W, D } = o;
    const cols = [];
    const wide = W >= 14;
    const bw = wide ? Math.min(12, W * 0.48) : W, bd = wide ? Math.min(D, 10) : Math.min(D * 0.55, 10);
    const bx = wide ? -W / 2 + bw / 2 : 0;
    const floors = Math.max(2, Math.min(3, o.floors || 2));
    const g = new HouseGeo();
    buildHouse(g, { x: bx, y: 0, z: 0, nx: 0, nz: 1, W: bw, D: bd, floors, color: hexNum(o.color, 0xf2d16b), seed: o.seed, ground: 'home', place: true }); // tầng trệt: cửa ra vào (không phải kệ hàng)
    const top = houseTop(floors);
    cols.push({ x0: bx - bw / 2, z0: -bd, x1: bx + bw / 2, z1: 0, h: top });
    // mái ngói đỏ + quốc huy (tròn đỏ, sao vàng) trên cửa + cột cờ
    tileRoof(k, bw * 0.9, Math.min(bd, 6), 1.6, bx, top, -Math.min(bd, 6) / 2 - 0.2);
    k.cyl(0.55, 0.55, 0.08, bx, top - 1.0, 0.06, 0xc0392b, '', 20, [PI / 2, 0, 0]);
    k.plane(0.7, 0.7, bx, top - 1.0, 0.11, 0xffffff, 'tex:' + textTex('★', { bg: '#c0392b', fg: '#f1c40f', w: 128, h: 128 }));
    const fx = bx + bw / 2 - 0.8;
    k.cyl(0.05, 0.06, 7, fx, 3.5, 1.2, 0xd9d9d9, 'metal', 8);
    k.plane(1.5, 1.0, fx + 0.8, 6.4, 1.2, 0xffffff, 'tex:' + textTex('★', { bg: '#da251d', fg: '#ffde00', w: 192, h: 128 }), [0, 0, 0]);
    k.box(0.5, 0.3, 0.5, fx, 0.15, 1.2, 0x9e9a92);
    cols.push({ x0: fx - 0.25, z0: 0.95, x1: fx + 0.25, z1: 1.45, h: 7 });
    // ---- bãi giữ xe vi phạm ----
    const yard = wide ? { x0: bx + bw / 2 + 0.3, x1: W / 2 - 0.15, z0: -D + 0.15, z1: -0.15 } : { x0: -W / 2 + 0.15, x1: W / 2 - 0.15, z0: -D + 0.15, z1: -bd - 0.3 };
    const yw = yard.x1 - yard.x0, yd = yard.z1 - yard.z0, ycx = (yard.x0 + yard.x1) / 2, ycz = (yard.z0 + yard.z1) / 2;
    if (yw > 2 && yd > 2) {
      k.box(yw, 0.05, yd, ycx, 0.025, ycz, 0x8f8f8a);
      // rào lưới quanh bãi (cổng ở mặt trước khi bãi nằm cạnh nhà)
      const fence = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0) - PI / 2;
        if (len < 0.3) return;
        k.add(new THREE.PlaneGeometry(len, 2.2), 0x9aa3a8, 'glass', (x0 + x1) / 2, 1.1, (z0 + z1) / 2, 0, ry, 0);
        for (let t = 0; t <= len + 0.01; t += 2.5) k.cyl(0.05, 0.05, 2.3, x0 + ((x1 - x0) * Math.min(t, len)) / len, 1.15, z0 + ((z1 - z0) * Math.min(t, len)) / len, 0x55606a, 'metal', 6);
        cols.push({ x0: Math.min(x0, x1) - 0.1, z0: Math.min(z0, z1) - 0.1, x1: Math.max(x0, x1) + 0.1, z1: Math.max(z0, z1) + 0.1, h: 2.2 });
      };
      fence(yard.x0, yard.z0, yard.x1, yard.z0);
      fence(yard.x1, yard.z0, yard.x1, yard.z1);
      if (wide) {
        fence(yard.x0, yard.z0, yard.x0, yard.z1);
        fence(yard.x0, yard.z1, ycx - 1.4, yard.z1);
        fence(ycx + 1.4, yard.z1, yard.x1, yard.z1);
        k.plane(Math.min(4, yw - 1), 0.7, yard.x1 - Math.min(4, yw - 1) / 2 - 0.3, 2.5, yard.z1 + 0.05, 0xffffff, 'tex:' + textTex('BÃI GIỮ XE VI PHẠM', { bg: '#1f3a93', w: 1024, h: 192 }));
      } else {
        fence(yard.x0, yard.z0, yard.x0, yard.z1);
        k.plane(Math.min(4, yw - 1), 0.7, ycx, 2.5, yard.z0 + 0.06, 0xffffff, 'tex:' + textTex('BÃI GIỮ XE VI PHẠM', { bg: '#1f3a93', w: 1024, h: 192 }));
      }
      // xe bị tạm giữ: xếp hàng sát nhau, màu cũ bụi
      const cs = [0x7f8c8d, 0x8e2b2b, 0x2c3e50, 0x6e5a3a, 0x34495e, 0x556b2f];
      for (let z = yard.z0 + 1.3; z < yard.z1 - 1.6; z += 2.6) {
        for (let x = yard.x0 + 0.6; x < yard.x1 - 0.5; x += 0.8) if (r.next() < 0.8) parkedBike(k, x, z, cs[Math.floor(r.next() * cs.length)]);
        cols.push({ x0: yard.x0 + 0.2, z0: z - 1.0, x1: yard.x1 - 0.2, z1: z + 1.0, h: 1.1 });
      }
    }
    return { shell: g, sign: { y: 3.1, z: 0.12, x: bx, w: Math.min(7, bw - 1) }, height: top + 1.6, colliders: cols };
  },

  // ======================= CẢNH QUAN (không nhà, đi xuyên qua được) =======================
  // Chỉ cây, ghế, hàng rào, xe đậu… là vật cản (colliders); mặt đất phủ cả lô.
  park(k, o, r) {
    const { W, D } = o, cz = -D / 2;
    const cols = [];
    k.box(W, 0.06, D, 0, 0.03, cz, 0x5f9e45);
    // viền bồn cỏ thấp (chừa lối vào giữa mặt trước)
    k.box(W, 0.18, 0.25, 0, 0.09, -D + 0.12, 0xb9b2a5);
    for (const sx of [-1, 1]) k.box(0.25, 0.18, D, (sx * (W - 0.25)) / 2, 0.09, cz, 0xb9b2a5);
    for (const sx of [-1, 1]) k.box(W / 2 - 1.3, 0.18, 0.25, (sx * (W / 2 + 1.3)) / 2, 0.09, -0.12, 0xb9b2a5);
    // lối đi lát gạch chữ thập
    const pw = Math.min(2.2, W * 0.18);
    k.box(pw, 0.08, D - 0.3, 0, 0.045, cz, 0xd8cfc0);
    if (D > 8) k.box(W - 0.5, 0.08, pw, 0, 0.046, cz, 0xd8cfc0);
    // giữa: đài phun nước (công viên rộng) hoặc bồn hoa
    if (W > 13 && D > 13) {
      k.cyl(2.2, 2.4, 0.5, 0, 0.25, cz, 0xcfc8bb, '', 20);
      k.cyl(1.95, 1.95, 0.05, 0, 0.48, cz, 0x5dade2, 'glass', 20);
      k.cyl(0.25, 0.35, 1.4, 0, 0.7, cz, 0xcfc8bb, '', 10);
      k.cyl(0.8, 0.5, 0.2, 0, 1.45, cz, 0xcfc8bb, '', 14);
      cols.push({ x0: -2.4, z0: cz - 2.4, x1: 2.4, z1: cz + 2.4, h: 1 });
    } else {
      k.cyl(1.1, 1.2, 0.35, 0, 0.18, cz, 0xb9b2a5, '', 14);
      for (let i = 0; i < 7; i++) k.ball(0.28, Math.cos(i) * 0.6, 0.45, cz + Math.sin(i) * 0.6, [0xe74c3c, 0xf1c40f, 0xec7fb0][i % 3]);
      cols.push({ x0: -1.2, z0: cz - 1.2, x1: 1.2, z1: cz + 1.2, h: 0.6 });
    }
    // cây to: rải đều, né lối đi
    const n = Math.max(3, Math.min(28, Math.round((W * D) / 38)));
    for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
      const x = (r.next() - 0.5) * (W - 4), z = -2 - r.next() * (D - 4); // tán cây rộng → lùi xa mép lô
      if (Math.abs(x) < pw / 2 + 1.2 || (D > 8 && Math.abs(z - cz) < pw / 2 + 1.2) || Math.hypot(x, z - cz) < 3.4) continue;
      tree(k, x, z, 2.6 + r.next() * 1.6, r, 1 + r.next() * 0.4);
      cols.push({ x0: x - 0.3, z0: z - 0.3, x1: x + 0.3, z1: z + 0.3, h: 4 });
      i++;
    }
    // ghế đá dọc lối đi + đèn công viên
    for (const side of [-1, 1]) {
      const x = side * (pw / 2 + 0.6), z = cz + (D > 8 ? side * Math.min(4, D / 4) : 0);
      k.box(0.5, 0.42, 1.6, x, 0.21, z, 0x9e9a92);
      k.box(0.12, 0.45, 1.6, x + side * 0.25, 0.65, z, 0x9e9a92);
      cols.push({ x0: x - 0.3, z0: z - 0.8, x1: x + 0.3, z1: z + 0.8, h: 0.8 });
      const lx = side * (pw / 2 + 0.4), lz = -1.6;
      k.cyl(0.06, 0.08, 3.2, lx, 1.6, lz, 0x2c3e50, 'metal', 8);
      k.ball(0.22, lx, 3.3, lz, 0xfff3c4, 'light');
      cols.push({ x0: lx - 0.12, z0: lz - 0.12, x1: lx + 0.12, z1: lz + 0.12, h: 3 });
    }
    return { sign: null, height: 4.5, colliders: cols };
  },

  emptyLot(k, o, r) {
    const { W, D } = o, cz = -D / 2;
    const cols = [];
    k.box(W, 0.05, D, 0, 0.025, cz, 0x8b6f4e);
    // mảng đất loang + cỏ dại
    for (let i = 0; i < Math.round((W * D) / 10); i++) {
      const x = (r.next() - 0.5) * (W - 0.6), z = -0.3 - r.next() * (D - 0.6);
      if (r.next() < 0.35) k.box(0.8 + r.next() * 1.4, 0.02, 0.6 + r.next() * 1.2, x, 0.055, z, [0x7a5f40, 0x9b7f5a][i % 2]);
      else for (let j = 0; j < 3; j++) k.add(new THREE.ConeGeometry(0.08, 0.35 + r.next() * 0.3, 4), [0x6d8b3a, 0x8aa04b][j % 2], '', x + (r.next() - 0.5) * 0.4, 0.2, z + (r.next() - 0.5) * 0.4);
    }
    // đống gạch, cục bê tông, lốp xe cũ
    for (let i = 0; i < Math.max(1, Math.round((W * D) / 60)); i++) {
      const x = (r.next() - 0.5) * (W - 3), z = -1.5 - r.next() * (D - 3);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3 - a; b++) k.box(0.42, 0.18, 0.2, x + (b - (2 - a) / 2) * 0.44, 0.09 + a * 0.18, z, 0xa8492f);
      k.box(0.7, 0.4, 0.7, x + 1.2, 0.2, z + 0.4, 0x9a9a95);
      cols.push({ x0: x - 0.8, z0: z - 0.3, x1: x + 1.6, z1: z + 0.8, h: 0.6 });
    }
    k.add(new THREE.TorusGeometry(0.32, 0.12, 6, 12).rotateX(PI / 2), 0x222222, '', W / 2 - 1.2, 0.12, -D + 1.4);
    // hàng rào tôn phía sau
    k.add(new THREE.PlaneGeometry(W, 2.2), 0xffffff, 'tex:' + T.corr(), 0, 1.1, -D + 0.05);
    k.box(W, 2.2, 0.04, 0, 1.1, -D + 0.02, 0x6d7b84, 'metal');
    cols.push({ x0: -W / 2, z0: -D, x1: W / 2, z1: -D + 0.2, h: 2.2 });
    return { sign: null, height: 2.4, colliders: cols };
  },

  soccer(k, o, r) {
    const { W, D } = o, cz = -D / 2;
    const cols = [];
    k.box(W, 0.06, D, 0, 0.03, cz, 0x3d9a48);
    // sọc cỏ
    const along = W >= D; // khung thành ở 2 đầu cạnh dài
    const L = (along ? W : D) - 1.6, S = (along ? D : W) - 1.6;
    for (let i = 0; i < 6; i += 2) {
      if (along) k.box(L / 6, 0.005, S, -L / 2 + L / 12 + (i * L) / 6, 0.064, cz, 0x46a852);
      else k.box(S, 0.005, L / 6, 0, 0.064, cz - L / 2 + L / 12 + (i * L) / 6, 0x46a852);
    }
    // vạch vôi
    const line = (w, d, x, z) => k.box(w, 0.012, d, x, 0.07, z, 0xffffff);
    const hw = (along ? L : S) / 2, hd = (along ? S : L) / 2;
    line(hw * 2, 0.1, 0, cz - hd); line(hw * 2, 0.1, 0, cz + hd);
    line(0.1, hd * 2, -hw, cz); line(0.1, hd * 2, hw, cz);
    if (along) line(0.1, hd * 2, 0, cz); else line(hw * 2, 0.1, 0, cz);
    k.add(new THREE.RingGeometry(Math.min(hw, hd) * 0.32, Math.min(hw, hd) * 0.32 + 0.1, 28).rotateX(-PI / 2), 0xffffff, 'double', 0, 0.072, cz);
    // khung thành
    for (const s of [-1, 1]) {
      const gw = Math.min(3, (along ? S : L) * 0.4);
      const gx = along ? s * (hw - 0.1) : 0, gz = along ? cz : cz + s * (hd - 0.1);
      const a = along ? [gx, 0, gz - gw / 2] : [gx - gw / 2, 0, gz], b = along ? [gx, 0, gz + gw / 2] : [gx + gw / 2, 0, gz];
      for (const p of [a, b]) k.cyl(0.06, 0.06, 1.8, p[0], 0.9, p[2], 0xffffff, 'metal', 8);
      k.rod([a[0], 1.8, a[2]], [b[0], 1.8, b[2]], 0.06, 0xffffff, 'metal');
      const back = along ? [s * 0.9, 0] : [0, s * 0.9];
      k.add(new THREE.PlaneGeometry(gw, 1.8), 0xdddddd, 'glass', gx + back[0], 0.9, gz + back[1], 0, along ? PI / 2 : 0, 0);
      cols.push(along ? { x0: gx - 0.1 + Math.min(0, back[0]), z0: gz - gw / 2, x1: gx + 0.1 + Math.max(0, back[0]), z1: gz + gw / 2, h: 1.8 } : { x0: gx - gw / 2, z0: gz - 0.1 + Math.min(0, back[1]), x1: gx + gw / 2, z1: gz + 0.1 + Math.max(0, back[1]), h: 1.8 });
    }
    // lưới rào quanh sân (chừa cửa ở giữa mặt trước)
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0) - PI / 2;
      k.add(new THREE.PlaneGeometry(len, 3.2), 0x9aa3a8, 'glass', (x0 + x1) / 2, 1.6, (z0 + z1) / 2, 0, ry, 0);
      for (let t = 0; t <= len; t += 3.5) k.cyl(0.05, 0.05, 3.3, x0 + ((x1 - x0) * t) / len, 1.65, z0 + ((z1 - z0) * t) / len, 0x55606a, 'metal', 6);
      cols.push({ x0: Math.min(x0, x1) - 0.1, z0: Math.min(z0, z1) - 0.1, x1: Math.max(x0, x1) + 0.1, z1: Math.max(z0, z1) + 0.1, h: 3.2 });
    };
    const e = 0.15;
    fence(-W / 2 + e, -D + e, W / 2 - e, -D + e);
    fence(-W / 2 + e, -D + e, -W / 2 + e, -e);
    fence(W / 2 - e, -D + e, W / 2 - e, -e);
    fence(-W / 2 + e, -e, -1.2, -e);
    fence(1.2, -e, W / 2 - e, -e);
    return { sign: null, height: 3.4, colliders: cols };
  },

  parkingLot(k, o, r) {
    const { W, D } = o, cz = -D / 2;
    const cols = [];
    k.box(W, 0.05, D, 0, 0.025, cz, 0x9a9a95);
    // chòi bảo vệ ở góc trước + bảng "GIỮ XE"
    const bx = W / 2 - 1.3, bz = -1.3;
    k.box(1.8, 2.3, 1.6, bx, 1.15, bz, 0xf2f2f2);
    k.box(1.4, 0.8, 0.03, bx, 1.5, bz + 0.81, 0xbfd6e2, 'glass');
    k.box(2.1, 0.12, 1.9, bx, 2.36, bz, 0x2e86c1);
    k.plane(1.6, 0.4, bx, 2.65, bz + 0.5, 0xffffff, 'tex:' + textTex('GIỮ XE 24/24', { bg: '#1f618d', w: 512, h: 128 }));
    k.box(0.06, 0.3, 0.6, bx, 2.65, bz + 0.45, 0x1f618d);
    cols.push({ x0: bx - 0.9, z0: bz - 0.8, x1: bx + 0.9, z1: bz + 0.8, h: 2.4 });
    // thanh chắn ở lối vào
    k.box(0.25, 1.0, 0.25, bx - 1.3, 0.5, -0.4, 0xd9d9d9);
    k.box(2.6, 0.08, 0.08, bx - 2.6, 1.0, -0.4, 0xe74c3c);
    // vạch ô đậu + xe máy đậu thành hàng (quay đầu ra lối giữa)
    // hàng xe cách nhau ~5 m (chừa lối đi giữa các hàng); bãi nông thì 1 hàng giữa
    const rows = [];
    if (D >= 9) for (let z = -2.6; z > -D + 1.4; z -= 5) rows.push(z);
    else rows.push(cz);
    const cs = [0xc0392b, 0x2e86de, 0x34495e, 0xf1c40f, 0x16a085, 0x8e44ad, 0xecf0f1];
    for (const z of rows) {
      for (let x = -W / 2 + 0.9; x < W / 2 - (z > -4 ? 3.2 : 0.8); x += 1.0) {
        k.box(0.05, 0.01, 1.9, x - 0.5, 0.056, z, 0xffffff);
        if (r.next() < 0.75) parkedBike(k, x, z, cs[Math.floor(r.next() * cs.length)]);
      }
      cols.push({ x0: -W / 2 + 0.4, z0: z - 1.0, x1: W / 2 - (z > -4 ? 3.2 : 0.8), z1: z + 1.0, h: 1.1 });
    }
    return { sign: null, height: 2.8, colliders: cols };
  },

  construction(k, o, r) {
    const { W, D } = o, cz = -D / 2;
    const cols = [];
    k.box(W, 0.05, D, 0, 0.025, cz, 0x8b6f4e);
    // móng bê tông + khung cột dầm (bộ xương nhà đang xây)
    const fw = Math.max(3, Math.min(W - 3, W * 0.62)), fd = Math.max(3, Math.min(D - 4, D * 0.62)), fz = cz - 0.5;
    const floors = Math.max(2, Math.min(5, Math.round(Math.min(W, D) / 4)));
    k.box(fw, 0.3, fd, 0, 0.15, fz, 0xb3b3ad);
    const nx = Math.max(2, Math.round(fw / 3.5) + 1), nz = Math.max(2, Math.round(fd / 3.5) + 1);
    for (let f = 0; f < floors; f++) {
      const y = 0.3 + f * 3.1;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = -fw / 2 + (i * fw) / (nx - 1), z = fz - fd / 2 + (j * fd) / (nz - 1);
        k.box(0.3, 3.1, 0.3, x, y + 1.55, z, 0xc9c5bb);
      }
      if (f < floors - 1) k.box(fw + 0.3, 0.25, fd + 0.3, 0, y + 3.1, fz, 0xbdb8ad);
    }
    // giàn giáo phía trước (ống thép)
    const top = 0.3 + floors * 3.1;
    for (let x = -fw / 2; x <= fw / 2 + 0.01; x += 1.8) k.cyl(0.04, 0.04, top, x, top / 2, fz + fd / 2 + 0.7, 0xd35400, 'metal', 6);
    for (let y = 1.5; y < top; y += 1.6) k.box(fw, 0.06, 0.06, 0, y, fz + fd / 2 + 0.7, 0xd35400, 'metal');
    cols.push({ x0: -fw / 2 - 0.2, z0: fz - fd / 2 - 0.2, x1: fw / 2 + 0.2, z1: fz + fd / 2 + 0.9, h: top });
    // cần cẩu tháp nhỏ (lô rộng)
    if (W >= 12 && D >= 12) {
      const cx = -fw / 2 - 0.6, czr = fz - fd / 2 + 0.6, h = top + 8;
      k.box(0.7, h, 0.7, cx, h / 2, czr, 0xf1c40f, 'metal');
      k.box(Math.min(16, W), 0.5, 0.5, cx + Math.min(16, W) / 2 - 2.5, h, czr, 0xf1c40f, 'metal');
      k.box(1.4, 1.0, 1.0, cx - 1.5, h - 0.3, czr, 0x7f8c8d);
      k.rod([cx + 6, h, czr], [cx + 6, top + 1.5, czr], 0.02, 0x222222);
    }
    // hàng rào tôn quanh công trình (chừa cổng giữa mặt trước)
    const tole = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0) - PI / 2;
      k.add(new THREE.PlaneGeometry(len, 2.4), 0xffffff, 'tex:' + T.corr(), (x0 + x1) / 2, 1.2, (z0 + z1) / 2, 0, ry, 0);
      k.add(new THREE.PlaneGeometry(len, 2.4), 0x2e86c1, 'double', (x0 + x1) / 2, 1.2, (z0 + z1) / 2 - 0.02 * Math.cos(ry), 0, ry, 0);
      cols.push({ x0: Math.min(x0, x1) - 0.1, z0: Math.min(z0, z1) - 0.1, x1: Math.max(x0, x1) + 0.1, z1: Math.max(z0, z1) + 0.1, h: 2.4 });
    };
    const e = 0.1;
    tole(-W / 2 + e, -D + e, W / 2 - e, -D + e);
    tole(-W / 2 + e, -D + e, -W / 2 + e, -e);
    tole(W / 2 - e, -D + e, W / 2 - e, -e);
    tole(-W / 2 + e, -e, -1.8, -e);
    tole(1.8, -e, W / 2 - e, -e);
    k.plane(2.4, 0.6, -W / 4, 1.6, 0.0, 0xffffff, 'tex:' + textTex('CÔNG TRÌNH ĐANG THI CÔNG', { bg: '#f1c40f', fg: '#1b1b1b', w: 1024, h: 256 }));
    return { sign: null, height: top + (W >= 12 && D >= 12 ? 9 : 1), colliders: cols };
  },

  // ======================= ĐỊA ĐIỂM MỚI (sân thể thao, trường, chợ, tiệm, bến xe buýt) =======================
  // sân tennis: mặt sân cứng xanh, vạch trắng, lưới giữa, rào lưới quanh (cửa giữa mặt trước), đèn sân, ghế trọng tài
  tennis(k, o, r) {
    const { W, D } = o, cz = -D / 2, cols = [];
    k.box(W, 0.05, D, 0, 0.025, cz, 0x5a8f4e);
    const along = W >= D; // sân dài theo cạnh dài của lô
    const L = Math.min((along ? W : D) - 2.4, 22), S = Math.min((along ? D : W) - 2.4, 10.4);
    const rect = (l, s, color, y) => k.box(along ? l : s, 0.02, along ? s : l, 0, y, cz, color);
    rect(L + 1.6, S + 1.4, 0x3f7f6a, 0.06); // nền ngoài sân
    rect(L, S, 0x2e6fa8, 0.075); // mặt sân xanh dương
    const line = (l0, l1, s0, s1) => k.box(along ? Math.max(0.08, l1 - l0) : Math.max(0.08, s1 - s0), 0.012, along ? Math.max(0.08, s1 - s0) : Math.max(0.08, l1 - l0), along ? (l0 + l1) / 2 : (s0 + s1) / 2, 0.09, cz + (along ? (s0 + s1) / 2 : (l0 + l1) / 2), 0xffffff);
    const hl = L / 2, hs = S / 2, si = hs * 0.75, sv = hl * 0.54;
    line(-hl, hl, -hs, -hs); line(-hl, hl, hs, hs); line(-hl, -hl, -hs, hs); line(hl, hl, -hs, hs);
    line(-hl, hl, -si, -si); line(-hl, hl, si, si); line(-sv, -sv, -si, si); line(sv, sv, -si, si); line(-sv, sv, 0, 0);
    // lưới giữa sân
    const nx = 0, nz = cz, nl = S + 0.9;
    for (const s of [-1, 1]) k.cyl(0.05, 0.05, 1.1, along ? nx : nx + (s * nl) / 2, 0.55, along ? nz + (s * nl) / 2 : nz, 0x333333, 'metal', 8);
    k.add(new THREE.PlaneGeometry(nl, 0.9), 0x222222, 'glass', nx, 0.55, nz, 0, along ? PI / 2 : 0, 0);
    k.box(along ? 0.04 : nl, 0.07, along ? nl : 0.04, nx, 1.02, nz, 0xffffff);
    cols.push(along ? { x0: -0.1, z0: nz - nl / 2, x1: 0.1, z1: nz + nl / 2, h: 1.1 } : { x0: -nl / 2, z0: nz - 0.1, x1: nl / 2, z1: nz + 0.1, h: 1.1 });
    // ghế trọng tài + ghế chờ
    const ux = along ? 0 : hs + 0.9, uz = along ? cz + hs + 0.9 : cz;
    k.box(0.6, 1.6, 0.6, ux, 0.8, uz, 0x2c3e50, 'metal');
    k.box(0.7, 0.1, 0.7, ux, 1.65, uz, 0xecf0f1);
    // rào lưới cao quanh sân, chừa cửa giữa mặt trước
    const fence = (x0, z0, x1, z1, h = 3.4) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0) - PI / 2;
      if (len < 0.3) return;
      k.add(new THREE.PlaneGeometry(len, h), 0x2d4a3e, 'glass', (x0 + x1) / 2, h / 2, (z0 + z1) / 2, 0, ry, 0);
      for (let t = 0; t <= len + 0.01; t += 3) k.cyl(0.05, 0.05, h + 0.1, x0 + ((x1 - x0) * Math.min(t, len)) / len, (h + 0.1) / 2, z0 + ((z1 - z0) * Math.min(t, len)) / len, 0x2c3e50, 'metal', 6);
      cols.push({ x0: Math.min(x0, x1) - 0.1, z0: Math.min(z0, z1) - 0.1, x1: Math.max(x0, x1) + 0.1, z1: Math.max(z0, z1) + 0.1, h });
    };
    const e = 0.2;
    fence(-W / 2 + e, -D + e, W / 2 - e, -D + e);
    fence(-W / 2 + e, -D + e, -W / 2 + e, -e);
    fence(W / 2 - e, -D + e, W / 2 - e, -e);
    fence(-W / 2 + e, -e, -1.1, -e);
    fence(1.1, -e, W / 2 - e, -e);
    // đèn chiếu sân 4 góc
    for (const [x, z] of [[-W / 2 + 0.6, -D + 0.6], [W / 2 - 0.6, -D + 0.6], [-W / 2 + 0.6, -0.6], [W / 2 - 0.6, -0.6]]) {
      k.cyl(0.07, 0.09, 7, x, 3.5, z, 0x7f8c8d, 'metal', 8);
      k.box(0.9, 0.35, 0.3, x, 7, z, 0xfff3c4, 'light');
    }
    // vợt + bóng trên ghế chờ
    k.box(1.6, 0.08, 0.4, -W / 2 + 1.6, 0.45, -0.8, 0x8d6e63);
    k.ball(0.07, -W / 2 + 1.2, 0.55, -0.8, 0xd4e157);
    return { sign: null, height: 7.2, colliders: cols };
  },
  // sân pickleball: 2–4 sân nhỏ xếp cạnh nhau (dài theo chiều sâu lô), lưới thấp, vùng "bếp" sát lưới, rào thấp, mái bạt che ghế chờ
  pickleball(k, o, r) {
    const { W, D } = o, cz = -D / 2, cols = [];
    k.box(W, 0.05, D, 0, 0.025, cz, 0x6b7280);
    const n = Math.max(1, Math.min(4, Math.floor((W - 1) / 5.4))), cw = Math.min(4.8, (W - 1 - (n - 1) * 0.6) / n), cl = Math.min(D - 2.6, 10);
    const czc = cz - 0.4; // lùi vào để chừa lối đi + ghế chờ phía trước
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) * (cw + 0.6)) / 2 + i * (cw + 0.6);
      k.box(cw + 0.8, 0.02, cl + 1.2, x, 0.06, czc, 0x3d6f5d);
      k.box(cw, 0.02, cl, x, 0.075, czc, 0x2a9d8f);
      const kz = cl * 0.16; // vùng "bếp" 2 bên lưới
      k.box(cw, 0.021, kz * 2, x, 0.078, czc, 0x6ab04c);
      const ln = (w, d, lx, lz) => k.box(w, 0.012, d, lx, 0.09, lz, 0xffffff);
      ln(cw, 0.06, x, czc - cl / 2); ln(cw, 0.06, x, czc + cl / 2); ln(0.06, cl, x - cw / 2, czc); ln(0.06, cl, x + cw / 2, czc);
      ln(cw, 0.06, x, czc - kz); ln(cw, 0.06, x, czc + kz); ln(0.06, cl / 2 - kz, x, czc - kz - (cl / 2 - kz) / 2); ln(0.06, cl / 2 - kz, x, czc + kz + (cl / 2 - kz) / 2);
      for (const s of [-1, 1]) k.cyl(0.04, 0.04, 0.95, x + s * (cw / 2 + 0.25), 0.47, czc, 0x333333, 'metal', 8);
      k.add(new THREE.PlaneGeometry(cw + 0.5, 0.75), 0x1b1b1b, 'glass', x, 0.5, czc, 0, 0, 0);
      k.box(cw + 0.5, 0.05, 0.03, x, 0.9, czc, 0xffffff);
      cols.push({ x0: x - cw / 2 - 0.3, z0: czc - 0.08, x1: x + cw / 2 + 0.3, z1: czc + 0.08, h: 0.95 });
      if (r.next() < 0.6) k.ball(0.05, x + (r.next() - 0.5) * cw, 0.13, czc + (r.next() - 0.5) * cl, 0xfdd835);
    }
    // rào lưới thấp quanh (cửa giữa mặt trước) + mái bạt che dãy ghế chờ phía trước
    const fence = (x0, z0, x1, z1, h = 1.8) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0) - PI / 2;
      k.add(new THREE.PlaneGeometry(len, h), 0x2d4a3e, 'glass', (x0 + x1) / 2, h / 2, (z0 + z1) / 2, 0, ry, 0);
      for (let t = 0; t <= len + 0.01; t += 2.5) k.cyl(0.04, 0.04, h + 0.05, x0 + ((x1 - x0) * Math.min(t, len)) / len, h / 2, z0 + ((z1 - z0) * Math.min(t, len)) / len, 0x2c3e50, 'metal', 6);
      cols.push({ x0: Math.min(x0, x1) - 0.1, z0: Math.min(z0, z1) - 0.1, x1: Math.max(x0, x1) + 0.1, z1: Math.max(z0, z1) + 0.1, h });
    };
    const e = 0.2;
    fence(-W / 2 + e, -D + e, W / 2 - e, -D + e);
    fence(-W / 2 + e, -D + e, -W / 2 + e, -e);
    fence(W / 2 - e, -D + e, W / 2 - e, -e);
    fence(-W / 2 + e, -e, -1, -e);
    fence(1, -e, W / 2 - e, -e);
    const sw = Math.min(W - 3, 7);
    for (const s of [-1, 1]) k.cyl(0.05, 0.05, 2.6, s * (sw / 2), 1.3, -1.2, 0x7f8c8d, 'metal', 6);
    k.box(sw + 0.4, 0.04, 1.6, 0, 2.6, -1.2, 0xf39c12, 'double', [0.1, 0, 0]);
    k.box(sw - 1, 0.08, 0.4, 0, 0.45, -1.3, 0x8d6e63);
    k.plane(Math.min(4, W - 2), 0.7, 0, 2.3, -D + 0.25, 0xffffff, 'tex:' + textTex(fmt('city.pickleSign'), { bg: '#2a9d8f', w: 768, h: 128 }));
    return { sign: null, height: 3, colliders: cols };
  },
  // trường đại học mỹ thuật: nhà kiểu Pháp sơn vàng lùi phía sau (cửa chớp xanh, sảnh cột giữa, mái ngói), sân trước có tượng + giá vẽ, cổng rào
  artSchool(k, o, r) {
    const { W, D } = o, cols = [];
    const bd = Math.min(9, D * 0.55), bz = -D + 0.4 + bd / 2, bw = W - 1.2, floors = 2, fh = 3.8, H = floors * fh;
    k.box(W, 0.05, D, 0, 0.025, -D / 2, 0xb9b09a); // sân lát gạch
    k.box(bw, H, bd, 0, H / 2, bz, 0xf2c94c); // thân nhà vàng
    k.box(bw + 0.2, 0.3, bd + 0.2, 0, fh, bz, 0xfdf3d0); // gờ tầng
    k.box(bw + 0.3, 0.35, bd + 0.3, 0, H, bz, 0xfdf3d0);
    tileRoof(k, bw + 0.6, bd + 0.8, 2.2, 0, H + 0.2, bz);
    // cửa sổ cửa chớp xanh mỗi tầng
    const fz = bz + bd / 2 + 0.03;
    for (let f = 0; f < floors; f++) for (let x = -bw / 2 + 1.4; x <= bw / 2 - 1.4; x += 2.2) {
      if (Math.abs(x) < 2.2) continue; // chừa sảnh giữa
      k.box(1.1, 1.9, 0.05, x, f * fh + 2, fz, 0x2e5e3e);
      k.box(0.08, 1.9, 0.07, x, f * fh + 2, fz + 0.02, 0x1e3a28);
      k.box(1.3, 0.12, 0.25, x, f * fh + 0.95, fz + 0.1, 0xfdf3d0);
    }
    // sảnh giữa: 4 cột tròn + trán tường tam giác
    for (const x of [-1.9, -0.65, 0.65, 1.9]) k.cyl(0.25, 0.28, H - 0.3, x, (H - 0.3) / 2, fz + 1.2, 0xfdf3d0, '', 12);
    k.box(4.6, 0.4, 1.6, 0, H - 0.1, fz + 0.8, 0xfdf3d0);
    k.add(sideGeo([[-2.4, 0], [2.4, 0], [0, 1.3]], 0.4, 0), 0xf2c94c, '', 0, H + 0.1, fz + 1.4, 0, PI / 2, 0); // mặt cắt quay ra mặt tiền
    k.box(1.8, 2.6, 0.06, 0, 1.3, fz + 0.02, 0x5d4037);
    cols.push({ x0: -bw / 2, z0: bz - bd / 2, x1: bw / 2, z1: bz + bd / 2, h: H + 2 });
    cols.push({ x0: -2.2, z0: fz + 0.9, x1: 2.2, z1: fz + 1.5, h: H });
    // sân trước: tượng trên bệ, giá vẽ có tranh, cây
    const sz = bz + bd / 2 + (0 - (bz + bd / 2)) * 0.45;
    k.box(1.2, 1.2, 1.2, W * 0.22, 0.6, sz, 0xd6d0c4);
    k.cyl(0.25, 0.32, 1.2, W * 0.22, 1.8, sz, 0xbfb8aa, '', 10);
    k.ball(0.32, W * 0.22, 2.65, sz, 0xbfb8aa);
    k.ball(0.45, W * 0.22 + 0.1, 3.25, sz, 0xbfb8aa, '', [1, 0.6, 1]);
    cols.push({ x0: W * 0.22 - 0.7, z0: sz - 0.7, x1: W * 0.22 + 0.7, z1: sz + 0.7, h: 3.5 });
    const canv = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c];
    for (let i = 0; i < 3; i++) {
      const x = -W * 0.3 + i * 1.6, z = sz + (r.next() - 0.5);
      k.rod([x - 0.35, 0, z + 0.3], [x, 1.7, z], 0.03, 0x8d6e63);
      k.rod([x + 0.35, 0, z + 0.3], [x, 1.7, z], 0.03, 0x8d6e63);
      k.rod([x, 0, z - 0.4], [x, 1.6, z], 0.03, 0x8d6e63);
      k.box(0.8, 0.6, 0.03, x, 1.25, z + 0.12, canv[i % canv.length], '', [-0.2, 0, 0]);
    }
    if (W > 14) tree(k, -W / 2 + 1.8, sz - 1.5, 3, r, 1);
    tree(k, W / 2 - 1.8, sz - 1.5, 3, r, 1);
    // hàng rào sắt trước + cổng giữa
    for (const s of [-1, 1]) {
      const x0 = s * 2, x1 = s * (W / 2 - 0.2);
      k.box(Math.abs(x1 - x0), 0.5, 0.25, (x0 + x1) / 2, 0.25, -0.2, 0xfdf3d0);
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 0.25) k.box(0.03, 1.2, 0.03, x, 1.1, -0.2, 0x1b1b1b, 'metal');
      cols.push({ x0: Math.min(x0, x1), z0: -0.35, x1: Math.max(x0, x1), z1: -0.05, h: 1.7 });
      k.box(0.5, 2.6, 0.5, x0, 1.3, -0.2, 0xfdf3d0);
    }
    return { sign: { y: 2.9, z: -0.05, w: Math.min(5, W * 0.3) }, height: H + 2.4, colliders: cols };
  },
  // trường đại học hiện đại: khối kính nhiều tầng + lam đỏ dọc, sảnh kính, bãi cỏ phía trước có ghế, bảng tên trên bãi cỏ
  university(k, o, r) {
    const { W, D } = o, cols = [];
    const bd = Math.min(10, D * 0.6), bz = -D + 0.4 + bd / 2, bw = W - 1, floors = Math.max(4, Math.min(7, o.floors || 5)), fh = 3.4, H = floors * fh;
    k.box(W, 0.05, D, 0, 0.025, -D / 2, 0xc9c2b6);
    k.box(bw, H, bd, 0, H / 2, bz, 0x6f8fa8);
    const fz = bz + bd / 2 + 0.02;
    k.plane(bw, H, 0, H / 2, fz, 0xffffff, 'tex:' + T.glassGrid(), [0, 0, 0], 3);
    for (let i = 1; i < floors; i++) k.box(bw + 0.05, 0.18, bd + 0.05, 0, i * fh, bz, 0xe8e8e8);
    // lam đỏ dọc mặt tiền (nhịp không đều cho có nét)
    for (let x = -bw / 2 + 0.6, i = 0; x < bw / 2 - 0.3; x += 1.1 + (i % 3) * 0.5, i++) k.box(0.25, H - 0.4, 0.5, x, H / 2 + 0.2, fz + 0.3, 0xd71920);
    k.box(bw + 0.4, 0.6, bd + 0.4, 0, H + 0.3, bz, 0x2b2b2b);
    // sảnh kính lồi giữa
    k.box(Math.min(8, bw * 0.4), 3.2, 2, 0, 1.6, fz + 1, 0x9fc3d6, 'glass');
    k.box(Math.min(8, bw * 0.4) + 0.4, 0.3, 2.4, 0, 3.3, fz + 1, 0xe8e8e8);
    cols.push({ x0: -bw / 2, z0: bz - bd / 2, x1: bw / 2, z1: fz + 2, h: H + 0.6 });
    // bãi cỏ + ghế + bảng tên thấp
    const lz0 = fz + 2.6, lz1 = -0.6;
    if (lz1 - lz0 > 1) {
      for (const s of [-1, 1]) k.box(W / 2 - 2.5, 0.08, lz1 - lz0, s * (W / 4 + 1.25), 0.06, (lz0 + lz1) / 2, 0x5f9e45);
      for (const s of [-1, 1]) k.box(1.8, 0.1, 0.5, s * (W / 4 + 1), 0.45, (lz0 + lz1) / 2, 0x8d6e63);
    }
    k.box(Math.min(6, W * 0.35), 1.1, 0.5, -W / 4 - 1, 0.55, -0.9, 0x2b2b2b);
    k.plane(Math.min(6, W * 0.35) - 0.3, 0.8, -W / 4 - 1, 0.6, -0.64, 0xffffff, 'tex:' + textTex(firstWords(o.sign, 4), { bg: '#2b2b2b', fg: '#ffffff', w: 768, h: 128 }));
    cols.push({ x0: -W / 4 - 1 - Math.min(3, W * 0.175), z0: -1.15, x1: -W / 4 - 1 + Math.min(3, W * 0.175), z1: -0.65, h: 1.1 });
    tree(k, W / 2 - 1.5, (lz0 + lz1) / 2, 3.2, r, 1);
    return { sign: { y: H - 1.2, z: fz + 0.6, w: Math.min(10, bw * 0.5), glow: 0.5 }, height: H + 0.8, colliders: cols };
  },
  // cửa hàng trái cây: mái bạt xanh; trái: võng mắc từ cột mái bạt vào tường · giữa: kệ bậc thang chất trái cây ·
  // phải: quầy thu ngân (máy tính tiền, cân) + tủ lạnh lớn cửa kính đựng trái cây; dưa hấu chất trước sạp
  fruit(k, o, r) {
    const sh = shell(o, { ground: 'shop', balcony: true });
    const W = o.W, X = W / 2;
    const cols = [{ x0: -X, z0: -o.D, x1: X, z1: 0, h: houseTop(o.floors) }];
    k.plane(W - 0.5, 2.7, 0, 1.35, 0.02, 0x3b3b3b);
    awning(k, W, 0x27ae60, 2.95, 2.0);
    for (const x of [-X + 0.4, X - 0.4]) k.cyl(0.04, 0.04, 2.9, x, 1.45, 1.95, 0x7f8c8d, 'metal', 6);
    // kệ 3 bậc giữa tiệm (chừa 2 bên cho võng và quầy, tủ lạnh)
    const fruitCols = [[0xf39c12, 0.13], [0xe74c3c, 0.12], [0x27ae60, 0.2], [0xf1c40f, 0.11], [0xd81b60, 0.14], [0x8e44ad, 0.08], [0xffb74d, 0.13]];
    const sx0 = -X + 2.8, sx1 = Math.min(X - 3.6, sx0 + 4.4);
    for (let step = 0; step < 3; step++) {
      const y = 0.4 + step * 0.35, z = 1.3 - step * 0.42;
      k.box(sx1 - sx0, 0.08, 0.42, (sx0 + sx1) / 2, y, z, 0x8d6e63);
      for (let x = sx0 + 0.3; x < sx1 - 0.2; x += 0.55) {
        const [c, rad] = fruitCols[Math.floor(r.next() * fruitCols.length)];
        for (let i = 0; i < 3; i++) k.ball(rad, x + (i - 1) * rad * 1.5, y + 0.05 + rad + (i === 1 ? rad * 0.8 : 0), z, c);
      }
    }
    cols.push({ x0: sx0, z0: 0.3, x1: sx1, z1: 1.55, h: 1.3 });
    // dưa hấu chất trước kệ
    for (let i = 0; i < 5; i++) k.ball(0.28, sx0 + 0.6 + (i % 3) * 0.55, 0.28 + Math.floor(i / 3) * 0.42, 1.95, 0x2e7d32, '', [1.25, 1, 1]);
    // võng: dây từ cột mái bạt bên trái mắc vào tường, lòng võng võng xuống (sọc 2 màu)
    const a = [-X + 0.4, 1.7, 1.9], b = [-X + 2.3, 1.75, 0.12];
    k.rod([a[0], 2.6, a[2]], a, 0.015, 0x6d4c41);
    k.rod([b[0], 2.4, b[2]], b, 0.015, 0x6d4c41);
    let prev = null;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, sag = 0.75 * 4 * t * (1 - t);
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag, a[2] + (b[2] - a[2]) * t];
      if (prev) k.rod(prev, p, 0.22 - 0.12 * Math.abs(0.5 - t), i % 2 ? 0x1e88e5 : 0xfdd835);
      prev = p;
    }
    // quầy thu ngân: mặt quầy gỗ, máy tính tiền, cân đĩa, ghế đẩu
    const qx = X - 2.5;
    k.box(1.6, 1.0, 0.6, qx, 0.5, 0.75, 0x6d4c41);
    k.box(1.7, 0.06, 0.7, qx, 1.03, 0.75, 0xd7ccc8);
    k.box(0.4, 0.22, 0.32, qx - 0.4, 1.17, 0.72, 0x37474f);
    k.box(0.36, 0.12, 0.05, qx - 0.4, 1.32, 0.6, 0x80deea, 'light');
    k.box(0.34, 0.08, 0.3, qx + 0.35, 1.1, 0.75, 0xeceff1, 'metal');
    k.cyl(0.18, 0.18, 0.03, qx + 0.35, 1.2, 0.75, 0xb0bec5, 'metal', 14);
    stool(k, qx, 0.25, 0x8d6e63, 0.5);
    cols.push({ x0: qx - 0.85, z0: 0.4, x1: qx + 0.85, z1: 1.1, h: 1.1 });
    // tủ lạnh lớn 2 cánh kính, trong có các ngăn trái cây (sáng đèn)
    const fx = X - 0.85, fw = 1.2, fh = 2.2;
    k.box(fw, fh, 0.8, fx, fh / 2, 0.5, 0xeceff1);
    k.box(fw - 0.16, fh - 0.4, 0.04, fx, fh / 2 + 0.05, 0.92, 0xb3e5fc, 'glass');
    k.box(fw - 0.2, fh - 0.5, 0.02, fx, fh / 2 + 0.05, 0.86, 0xe1f5fe, 'light');
    for (let sh2 = 0; sh2 < 4; sh2++) {
      const y = 0.45 + sh2 * 0.42;
      k.box(fw - 0.2, 0.03, 0.6, fx, y, 0.55, 0xcfd8dc);
      for (let i = 0; i < 4; i++) k.ball(0.07, fx - 0.42 + i * 0.28, y + 0.09, 0.75, fruitCols[(sh2 + i) % fruitCols.length][0]);
    }
    k.box(0.03, fh - 0.4, 0.06, fx, fh / 2 + 0.05, 0.95, 0x90a4ae, 'metal');
    k.box(fw, 0.18, 0.82, fx, fh + 0.09, 0.5, 0x2e7d32);
    cols.push({ x0: fx - fw / 2, z0: 0.08, x1: fx + fw / 2, z1: 0.95, h: fh });
    return { shell: sh, sign: { y: 3.6 }, height: houseTop(o.floors), colliders: cols };
  },
  // trường tiểu học: dãy lớp chữ L sơn vàng viền xanh, hành lang lan can, sân trường có cột cờ, cầu tuột, cổng có bảng tên
  school(k, o, r) {
    const { W, D } = o, cols = [];
    const floors = Math.max(2, Math.min(3, o.floors || 3)), fh = 3.3, H = floors * fh, bd = Math.min(7, D * 0.45);
    k.box(W, 0.05, D, 0, 0.025, -D / 2, 0xbdb5a4);
    const wing = (x0, x1, z0, z1, facing) => {
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, czz = (z0 + z1) / 2;
      k.box(w, H, d, cx, H / 2, czz, 0xf6d55c);
      for (let f = 0; f <= floors; f++) k.box(w + 0.2, 0.22, d + 0.2, cx, f * fh, czz, 0x2e86c1);
      // hành lang + lan can phía sân
      const hz = facing > 0 ? z1 + 0.9 : z0 - 0.9;
      for (let f = 1; f < floors; f++) {
        k.box(w, 0.15, 1.8, cx, f * fh, hz, 0xd6d0c4);
        k.box(w, 0.9, 0.06, cx, f * fh + 0.5, hz + facing * 0.9, 0xffffff);
      }
      k.box(w, 0.15, 1.8, cx, H, hz, 0xd6d0c4);
      for (let x = x0 + 0.4; x <= x1 - 0.4; x += 3) k.box(0.25, H, 0.25, x, H / 2, hz + facing * 0.85, 0xf0f0f0);
      for (let f = 0; f < floors; f++) for (let x = x0 + 1.2; x < x1 - 0.8; x += 2.4) k.box(1.4, 1.2, 0.05, x, f * fh + 1.8, facing > 0 ? z1 + 0.03 : z0 - 0.03, 0x5dade2);
      tileRoof(k, w + 0.4, d + 2.4, 1.5, cx, H + 0.1, czz + facing * 0.9);
      cols.push({ x0, z0: Math.min(z0, hz - 0.9), x1, z1: Math.max(z1, hz + 0.9), h: H + 1.5 });
    };
    // dãy chính phía sau (hành lang quay ra sân); lô rộng thêm dãy bên trái
    wing(-W / 2 + 0.3, W / 2 - 0.3, -D + 0.3, -D + 0.3 + bd, 1);
    const wide = W > 18 && D > 16;
    if (wide) wing(-W / 2 + 0.3, -W / 2 + 0.3 + 6, -D + 0.3 + bd + 2, -3, 1);
    // sân trường: cột cờ, cầu tuột, cây
    const yz = (-D + 0.3 + bd + 1.8 - 0.4) / 2 - 0.2;
    const fx = wide ? 2 : 0;
    k.box(1.4, 0.3, 1.4, fx, 0.15, yz, 0xd6d0c4);
    k.cyl(0.05, 0.06, 7, fx, 3.5, yz, 0xd9d9d9, 'metal', 8);
    k.plane(1.5, 1.0, fx + 0.8, 6.4, yz, 0xffffff, 'tex:' + textTex('★', { bg: '#da251d', fg: '#ffde00', w: 192, h: 128 }));
    cols.push({ x0: fx - 0.7, z0: yz - 0.7, x1: fx + 0.7, z1: yz + 0.7, h: 7 });
    const sx = W / 2 - 3;
    k.box(0.5, 1.6, 0.5, sx, 0.8, yz - 1, 0xe74c3c);
    k.box(0.7, 0.08, 2.4, sx, 1.0, yz + 0.1, 0xf1c40f, '', [-0.6, 0, 0]);
    for (const s of [-1, 1]) k.box(0.05, 1.6, 0.05, sx + s * 0.3, 0.8, yz - 1.2, 0x2e86c1);
    cols.push({ x0: sx - 0.5, z0: yz - 1.4, x1: sx + 0.5, z1: yz + 1.2, h: 1.6 });
    tree(k, -W / 2 + 2, -1.8, 3.2, r, 1.1);
    // tường rào thấp + cổng giữa có khung bảng tên
    for (const s of [-1, 1]) {
      const x0 = s * 2.2, x1 = s * (W / 2 - 0.2);
      k.box(Math.abs(x1 - x0), 1.6, 0.25, (x0 + x1) / 2, 0.8, -0.2, 0xf6d55c);
      k.box(Math.abs(x1 - x0), 0.1, 0.35, (x0 + x1) / 2, 1.65, -0.2, 0x2e86c1);
      cols.push({ x0: Math.min(x0, x1), z0: -0.35, x1: Math.max(x0, x1), z1: -0.05, h: 1.7 });
      k.box(0.5, 3.6, 0.5, x0, 1.8, -0.2, 0x2e86c1);
    }
    k.box(4.9, 0.9, 0.2, 0, 3.4, -0.2, 0x2e86c1);
    return { sign: { y: 3.4, z: -0.05, w: 4.4 }, height: H + 1.6, colliders: cols };
  },
  // tiệm vàng / đá quý: mặt tiền đỏ viền vàng, tủ kính sáng đèn bày trang sức, đèn lồng đỏ, bảng "Vàng bạc đá quý"
  goldShop(k, o, r) {
    const sh = shell(o, { ground: 'shop', balcony: true, color: 0xb03a2e });
    const W = o.W;
    k.plane(W - 0.4, 2.8, 0, 1.4, 0.02, 0x7b1f1f);
    for (const [w, h, x, y] of [[W - 0.3, 0.14, 0, 2.85], [0.14, 2.8, -W / 2 + 0.2, 1.4], [0.14, 2.8, W / 2 - 0.2, 1.4]]) k.box(w, h, 0.1, x, y, 0.06, 0xd4af37, 'metal');
    // tủ kính thấp sáng đèn + trang sức (hạt vàng, đá màu)
    const cw = Math.min(W - 1.4, 7);
    k.box(cw, 0.9, 0.6, 0, 0.45, 0.5, 0x5d1a1a);
    k.box(cw, 0.35, 0.6, 0, 1.08, 0.5, 0xfff6dc, 'glass');
    k.box(cw, 0.03, 0.55, 0, 0.92, 0.5, 0xfff1b8, 'light');
    for (let i = 0; i < Math.round(cw * 3); i++) k.ball(0.045, -cw / 2 + 0.2 + (i * (cw - 0.4)) / Math.round(cw * 3), 0.97, 0.45 + (i % 2) * 0.12, [0xd4af37, 0xd4af37, 0xe53935, 0x1e88e5, 0x43a047, 0xffffff][i % 6], 'metal');
    // bảng "Vàng bạc đá quý" + 2 đèn lồng đỏ
    k.plane(Math.min(W - 1, 6), 0.6, 0, 2.45, 0.08, 0xffffff, 'glow:' + textTex(fmt('city.goldSign'), { bg: '#b03a2e', fg: '#ffd54f', w: 768, h: 96 }));
    for (const s of [-1, 1]) {
      k.cyl(0.01, 0.01, 0.4, s * (W / 2 - 0.7), 2.75, 0.5, 0x333333, '', 4);
      k.ball(0.25, s * (W / 2 - 0.7), 2.35, 0.5, 0xd62d20, 'light', [1, 1.2, 1]);
    }
    return { shell: sh, sign: { y: 3.6, glow: 0.7 }, height: houseTop(o.floors) };
  },
  // chợ truyền thống: nhà lồng mái tôn 2 mái dốc thật lớn, cột thép, sạp bên trong, sạp + dù quanh mép, bảng tên ở đầu hồi
  wetMarket(k, o, r) {
    const { W, D } = o, cols = [];
    const hw = W - 1.6, hd = D - 3.2, hz = -D + 0.6 + hd / 2, H = 6.4;
    k.box(W, 0.05, D, 0, 0.025, -D / 2, 0x9e9a92);
    k.box(hw, 0.2, hd, 0, 0.1, hz, 0x8a8f94); // nền nhà lồng
    // cột thép + mái tôn 2 mái (đỉnh dọc theo bề ngang)
    for (let x = -hw / 2 + 0.3; x <= hw / 2 - 0.3; x += 4) for (const s of [-1, 1]) {
      k.box(0.25, H, 0.25, x, H / 2, hz + s * (hd / 2 - 0.3), 0x5d6d7e, 'metal');
      cols.push({ x0: x - 0.2, z0: hz + s * (hd / 2 - 0.3) - 0.2, x1: x + 0.2, z1: hz + s * (hd / 2 - 0.3) + 0.2, h: H });
    }
    const slope = 0.32, half = hd / 2 + 0.8;
    for (const s of [-1, 1]) k.plane(hw + 1, half / Math.cos(slope), 0, H + Math.tan(slope) * half / 2, hz + (s * half) / 2, 0xb0b8bd, 'tex:' + T.corr(), [-PI / 2 + s * slope, 0, 0], 1.2);
    k.box(hw + 1, 0.3, 0.4, 0, H + Math.tan(slope) * half, hz, 0x7f8c8d, 'metal');
    // 2 đầu hồi: tấm tôn tam giác + bảng tên
    // (sideGeo: mặt cắt nằm trong mặt z–y, đùn dọc trục x)
    for (const s of [-1, 1]) k.add(sideGeo([[-half, 0], [half, 0], [0, Math.tan(slope) * half]], 0.1, 0), 0x9aa0a6, '', s * (hw / 2 + 0.45), H, hz);
    k.plane(Math.min(8, hw * 0.5), 1.1, 0, H - 0.8, hz + hd / 2 + 0.05, 0xffffff, 'tex:' + textTex(firstWords(o.sign, 4), { bg: '#c0392b', fg: '#ffffff', w: 768, h: 128 }));
    // sạp trong nhà lồng: bàn + hàng hóa nhiều màu, ô dù ngoài mép
    const goods = [0xe74c3c, 0x27ae60, 0xf1c40f, 0xecf0f1, 0xe67e22, 0x8e44ad, 0x795548];
    for (let x = -hw / 2 + 1.6; x < hw / 2 - 1.2; x += 2.6) for (const zz of [hz - hd / 4, hz + hd / 4]) {
      k.box(2, 0.8, 1.2, x, 0.5, zz, 0x8d6e63);
      for (let i = 0; i < 5; i++) k.ball(0.18, x - 0.75 + i * 0.38, 1.05, zz + (r.next() - 0.5) * 0.6, goods[Math.floor(r.next() * goods.length)]);
      cols.push({ x0: x - 1, z0: zz - 0.6, x1: x + 1, z1: zz + 0.6, h: 1 });
    }
    for (let x = -W / 2 + 1.5; x < W / 2 - 1; x += 3.2) {
      if (Math.abs(x) < 2) continue; // lối vào giữa
      k.box(1.4, 0.7, 0.9, x, 0.35, -1.1, 0x6d4c41);
      for (let i = 0; i < 4; i++) k.ball(0.15, x - 0.45 + i * 0.3, 0.82, -1.1, goods[Math.floor(r.next() * goods.length)]);
      k.cyl(0.03, 0.03, 2.2, x, 1.1, -1.1, 0x555555, '', 6);
      k.cyl(0.05, 1.1, 0.35, x, 2.3, -1.1, [0xe74c3c, 0x3498db, 0xf1c40f, 0x27ae60][Math.floor(r.next() * 4)], 'double', 8);
      cols.push({ x0: x - 0.7, z0: -1.55, x1: x + 0.7, z1: -0.65, h: 0.9 });
    }
    return { sign: null, height: H + 2, colliders: cols };
  },
  // showroom xe máy: tầng trệt kính trọn mặt tiền, bục bày xe nhiều màu, dải biển xanh dương, đèn trần sáng
  showroom(k, o, r) {
    const sh = shell(o, { ground: 'shop', balcony: false, color: 0xf2f2f2 });
    const W = o.W;
    k.plane(W - 0.4, 3, 0, 1.5, 0.02, 0xdfe6ec);
    k.box(W - 0.6, 0.12, 2.0, 0, 0.06, 1.0, 0xbfc5c9); // bục bày xe
    const cs = [0x1f4e9c, 0xc0392b, 0x111111, 0xecf0f1, 0x7f8c8d, 0x16a085];
    for (let x = -W / 2 + 1, i = 0; x < W / 2 - 0.6; x += 1.2, i++) parkedBike(k, x, 1.0, cs[i % cs.length]);
    k.box(W - 0.3, 2.9, 0.04, 0, 1.55, 2.05, 0xdbe9f0, 'glass');
    for (let x = -W / 2 + 0.15; x <= W / 2 - 0.1; x += (W - 0.3) / 4) k.box(0.06, 2.9, 0.06, x, 1.55, 2.07, 0x333333, 'metal');
    k.box(W - 0.3, 0.06, 2.1, 0, 3.0, 1.0, 0xffffff, 'light'); // trần sáng
    k.box(W, 0.6, 0.15, 0, 3.35, 2.08, 0x1f4e9c); // dải biển xanh
    return { shell: sh, sign: { y: 4.2, glow: 0.6 }, height: houseTop(o.floors), colliders: [{ x0: -W / 2, z0: -o.D, x1: W / 2, z1: 2.1, h: houseTop(o.floors) }] };
  },
  // tiệm đồ chơi: mặt tiền nhiều màu, mái bạt sọc cầu vồng, chùm bong bóng, gấu bông + xe đồ chơi bày cửa
  toyShop(k, o, r) {
    const sh = shell(o, { ground: 'shop', balcony: true });
    const W = o.W;
    k.plane(W - 0.5, 2.7, 0, 1.35, 0.02, 0x4a3b6b);
    const rainbow = [0xe74c3c, 0xf39c12, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6];
    const sw = (W - 0.6) / rainbow.length;
    rainbow.forEach((c, i) => k.box(sw, 0.1, 1.5, -W / 2 + 0.3 + sw * (i + 0.5), 2.95, 0.75, c, '', [0.15, 0, 0]));
    // kệ bày: hộp đồ chơi nhiều màu, gấu bông, xe đồ chơi
    k.box(W - 1, 0.9, 0.6, 0, 0.45, 0.5, 0xffffff);
    for (let x = -W / 2 + 0.8; x < W / 2 - 0.6; x += 0.55) k.box(0.4, 0.3 + r.next() * 0.3, 0.3, x, 1.05, 0.5, rainbow[Math.floor(r.next() * rainbow.length)]);
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 1);
      k.ball(0.3, x, 0.35, 1.3, 0xa1887f);
      k.ball(0.22, x, 0.82, 1.3, 0xa1887f);
      for (const e of [-1, 1]) k.ball(0.08, x + e * 0.15, 1.02, 1.3, 0x8d6e63);
    }
    k.box(0.5, 0.2, 0.3, 0, 0.12, 1.6, 0xe53935);
    k.box(0.3, 0.15, 0.25, 0, 0.28, 1.6, 0x90caf9, 'glass');
    // chùm bong bóng buộc ở cột trước tiệm
    const bx = W / 2 - 0.4;
    k.cyl(0.03, 0.03, 1.2, bx, 0.6, 1.8, 0x555555, '', 6);
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * PI * 2, x = bx + Math.cos(ang) * 0.35, y = 2.3 + (i % 3) * 0.3, z = 1.8 + Math.sin(ang) * 0.35;
      k.rod([bx, 1.2, 1.8], [x, y - 0.25, z], 0.006, 0xeeeeee);
      k.ball(0.22, x, y, z, rainbow[i % rainbow.length], '', [1, 1.2, 1]);
    }
    return { shell: sh, sign: { y: 3.7 }, height: houseTop(o.floors), colliders: [{ x0: -W / 2, z0: -o.D, x1: W / 2, z1: 0, h: houseTop(o.floors) }, { x0: bx - 0.15, z0: 1.65, x1: bx + 0.15, z1: 1.95, h: 1.2 }] };
  },
  // bến xe buýt: nhà điều hành nhỏ + mái che dài trên cột, các làn đậu xe buýt có vạch, ghế chờ, bảng tuyến
  busStation(k, o, r) {
    const { W, D } = o, cols = [];
    k.box(W, 0.05, D, 0, 0.025, -D / 2, 0x55595e);
    // nhà điều hành bên trái phía sau
    const ow = Math.min(7, W * 0.28), od = Math.min(6, D * 0.45), ox = -W / 2 + 0.4 + ow / 2, oz = -D + 0.4 + od / 2;
    k.box(ow, 3.4, od, ox, 1.7, oz, 0xecf0f1);
    k.box(ow + 0.4, 0.3, od + 0.4, ox, 3.5, oz, 0x1e8449);
    for (let x = ox - ow / 2 + 0.8; x < ox + ow / 2 - 0.5; x += 1.6) k.box(1.1, 1.1, 0.05, x, 2, oz + od / 2 + 0.03, 0x5dade2);
    cols.push({ x0: ox - ow / 2, z0: oz - od / 2, x1: ox + ow / 2, z1: oz + od / 2, h: 3.6 });
    // các làn đậu xe buýt (vạch vàng) trong phần sân bên phải nhà điều hành, trước mái che:
    // sân sâu ≥ 11 m → xe đậu dọc chiều sâu; nông hơn → xe đậu ngang thành hàng
    const ar = { x0: ox + ow / 2 + 0.8, x1: W / 2 - 0.4, z0: -D + 0.4, z1: -3.2 };
    const BUS_COLS = [0x1e8449, 0x2e86c1, 0xd35400];
    const spots = [];
    if (ar.z1 - ar.z0 >= 11) {
      const n = Math.min(4, Math.floor((ar.x1 - ar.x0) / 4));
      for (let i = 0; i < n; i++) spots.push([ar.x0 + 2 + i * 4, (ar.z0 + ar.z1) / 2, 'z']);
      for (let i = 0; i <= n; i++) k.box(0.15, 0.012, ar.z1 - ar.z0, ar.x0 + i * 4, 0.04, (ar.z0 + ar.z1) / 2, 0xf1c40f);
    } else {
      const rows = Math.min(3, Math.floor((ar.z1 - ar.z0) / 3.6)), per = Math.floor((ar.x1 - ar.x0) / 11);
      for (let j = 0; j < rows; j++) for (let i = 0; i < per; i++) spots.push([ar.x0 + 5.5 + i * 11, ar.z0 + 1.8 + j * 3.6, 'x']);
      for (let j = 0; j <= rows && per; j++) k.box(per * 11, 0.012, 0.15, ar.x0 + (per * 11) / 2, 0.04, ar.z0 + j * 3.6, 0xf1c40f);
    }
    spots.forEach(([x, z, axis], i) => {
      if (i === 1 && r.next() < 0.5) return; // có làn trống (xe đang chạy tuyến)
      busModel(k, x, z, axis, BUS_COLS[i % 3], (i % 3) + 1);
      cols.push(axis === 'z' ? { x0: x - 1.3, z0: z - 5.1, x1: x + 1.3, z1: z + 5.1, h: 3.2 } : { x0: x - 5.1, z0: z - 1.3, x1: x + 5.1, z1: z + 1.3, h: 3.2 });
    });
    // mái che dài phía trước (khách đứng chờ) + ghế
    const cz = -1.6, cw = W - 1.2;
    for (let x = -cw / 2; x <= cw / 2 + 0.01; x += cw / Math.max(2, Math.round(cw / 5))) {
      k.cyl(0.1, 0.1, 3.2, x, 1.6, cz, 0x7f8c8d, 'metal', 8);
      cols.push({ x0: x - 0.15, z0: cz - 0.15, x1: x + 0.15, z1: cz + 0.15, h: 3.2 });
    }
    k.box(cw + 0.6, 0.15, 2.8, 0, 3.25, cz, 0x1e8449, '', [0.06, 0, 0]);
    for (let x = -cw / 2 + 1.5; x < cw / 2 - 1; x += 3.4) k.box(1.8, 0.08, 0.45, x, 0.45, cz - 0.6, 0x95a5a6, 'metal');
    k.plane(Math.min(6, cw * 0.4), 0.8, 0, 2.7, cz + 1.42, 0xffffff, 'tex:' + textTex(fmt('city.busStationBoard'), { bg: '#1e8449', w: 768, h: 128 }));
    return { sign: { y: 3.9, z: cz + 1.45, w: Math.min(8, cw * 0.5) }, height: 4, colliders: cols };
  },
};
// xe buýt đơn giản (bộ gom, toạ độ riêng): dài 10 m, rộng 2,5 m, chạy theo trục 'x' hoặc 'z'; số tuyến trên kính trước
export function busModel(k, x, z, axis, color, n) {
  const L = 10, Wd = 2.5, Hb = 2.9, ax = axis === 'x';
  const B = (l, h, w, ol, y, color2, kind = '') => k.box(ax ? l : w, h, ax ? w : l, x + (ax ? ol : 0), y, z + (ax ? 0 : ol), color2, kind);
  B(L, Hb - 0.4, Wd, 0, 0.35 + (Hb - 0.4) / 2, color);
  B(L - 0.6, 0.9, Wd + 0.04, -0.1, 1.9, 0x1d2a33, 'glass'); // dải kính 2 bên
  B(0.06, 1.1, Wd - 0.3, L / 2 + 0.01, 1.8, 0x1d2a33, 'glass'); // kính trước
  B(L, 0.25, Wd + 0.02, 0, 0.9, 0xffffff); // sọc trắng
  B(3, 0.35, 1.6, -1, Hb + 0.05, 0xd5d8dc); // máy lạnh trên nóc
  for (const ol of [-L / 2 + 1.8, L / 2 - 1.8]) for (const s of [-1, 1]) {
    k.cyl(0.45, 0.45, 0.3, x + (ax ? ol : s * (Wd / 2)), 0.45, z + (ax ? s * (Wd / 2) : ol), 0x1b1b1b, '', 12, ax ? [PI / 2, 0, 0] : [0, 0, PI / 2]);
  }
  const tex = 'tex:' + textTex(fmt('city.busRoute', { n }), { bg: '#111111', fg: '#ffb300', w: 256, h: 64 });
  if (ax) k.plane(1.6, 0.35, x + L / 2 + 0.04, 2.55, z, 0xffffff, tex, [0, PI / 2, 0]);
  else k.plane(1.6, 0.35, x, 2.55, z + L / 2 + 0.04, 0xffffff, tex);
}
// nhà chờ xe buýt bên vỉa hè (toạ độ riêng, mặt quay +z ra đường): mái, vách kính sau, ghế, biển trạm
export function busStopModel(k, x, z, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const box = (w, h, d, lx, y, lz, color, kind = '') => {
    const [wx, wz] = P(lx, lz);
    k.box(w, h, d, wx, y, wz, color, kind, [0, ry, 0]);
  };
  box(3.2, 0.1, 1.4, 0, 2.5, 0, 0x2e86c1);
  box(3.0, 2.0, 0.04, 0, 1.3, -0.6, 0xbcdff1, 'glass');
  for (const lx of [-1.5, 1.5]) box(0.08, 2.5, 0.08, lx, 1.25, -0.6, 0x555555, 'metal');
  box(2.2, 0.08, 0.4, 0, 0.45, -0.35, 0x95a5a6, 'metal');
  const [px, pz] = P(1.9, 0.3);
  k.cyl(0.05, 0.05, 2.8, px, 1.4, pz, 0x555555, 'metal', 6);
  k.plane(0.7, 0.7, px, 2.7, pz, 0xffffff, 'tex:' + textTex(fmt('city.busStopSign'), { bg: '#2e86c1', w: 256, h: 256 }), [0, ry, 0]);
}
// công trình lớn đợt B (src/world/landmarks.js): dùng chung texture, cây, chữ của file này
const LM_HELP = { THREE, T, texKey, textTex, tree, sideGeo, makeCar: hasDOM ? makeCar : null, fmt };
for (const look of LANDMARK_LOOKS) BUILD[look] = (k, o, r) => LANDMARKS[look](k, o, r, LM_HELP);
export const BUILT_LOOKS = Object.keys(BUILD);

// ======================= NHÀ DÂN THEO KHU PHỐ (map.json → districts[mã].houses) =======================
// Cùng hệ toạ độ với nhà địa điểm: mặt tiền z = 0 quay ra +z, lô x ∈ [−W/2, W/2], z ∈ [−D, 0].
// Trả về { kit, height } — city.js gộp kit của mọi lô theo vật liệu (cả thành phố chỉ vài khối vẽ).
const CN_WORDS = ['金', '福', '酒家', '藥房', '茶樓', '金行'];
const JP_WORDS = ['居酒屋', 'ラーメン', '寿司', '焼鳥'];
const RES = {
  // cao ốc kính: đế 1 tầng tiệm + thân kính nhiều tầng, vạch ngang mỗi tầng, đồ trên mái
  tower(k, o, r) {
    const { W, D } = o;
    const ph = 4.2, n = r.int(6, 14), fh = 3.2;
    k.box(W - 0.4, ph, D - 0.4, 0, ph / 2, -D / 2, 0x9a9a95);
    k.box(W - 0.8, 2.8, 0.05, 0, 1.6, -0.18, 0x9fc3d6, 'glass');
    const tw = Math.max(3, W - 1.6), td = Math.max(3, D - 2), tz = -D / 2 - 0.3, th = n * fh;
    const glass = r.pick([0x8fb4cc, 0x7fa6bf, 0x9cc0d4, 0x86a9b5]);
    k.box(tw, th, td, 0, ph + th / 2, tz, glass);
    for (let i = 1; i < n; i++) k.box(tw + 0.05, 0.14, td + 0.05, 0, ph + i * fh, tz, 0x4d6070);
    // khung kính dọc ở mặt trước và 2 bên
    const cols = Math.max(2, Math.round(tw / 1.6));
    for (let c = 0; c <= cols; c++) k.box(0.1, th, 0.06, -tw / 2 + (c * tw) / cols, ph + th / 2, tz + td / 2 + 0.02, 0x4d6070);
    for (const s of [-1, 1]) for (let c = 1; c < 4; c++) k.box(0.06, th, 0.1, s * (tw / 2 + 0.02), ph + th / 2, tz - td / 2 + (c * td) / 4, 0x4d6070);
    // vài ô sáng đèn (ban đêm nhìn thấy)
    for (let i = 0; i < Math.round(n * 0.5); i++) {
      const c = r.int(0, cols - 1);
      k.box(tw / cols - 0.2, fh - 0.5, 0.03, -tw / 2 + ((c + 0.5) * tw) / cols, ph + r.int(0, n - 1) * fh + fh / 2, tz + td / 2 + 0.03, 0xf3e3b5, 'light');
    }
    k.box(tw * 0.4, 1.4, td * 0.4, (r.next() - 0.5) * tw * 0.3, ph + n * fh + 0.7, tz, 0x7f8c8d);
    return ph + n * fh + 1.4;
  },
  // nhà thấp mái tôn: 1–2 tầng, tường bạc màu, cửa gỗ, song cửa sổ, mái tôn dốc, mảng rỉ
  tin(k, o, r) {
    const { W, D } = o;
    const fl = r.int(1, 2), h = fl * 3 - 0.2;
    const wall = r.pick([0xc9b79c, 0xb8c4b0, 0xd6c8a8, 0xa9b4b8, 0xc7a98f]);
    k.box(W - 0.3, h, D - 0.6, 0, h / 2, -D / 2 - 0.1, wall);
    k.box(1.0, 2.1, 0.06, -W / 4, 1.05, -0.38, 0x5d4037);
    k.box(1.3, 0.9, 0.05, W / 5, 1.6, -0.38, 0x2c3e50);
    for (let i = 0; i < 4; i++) k.box(0.03, 0.9, 0.06, W / 5 - 0.5 + i * 0.33, 1.6, -0.34, 0x555555);
    if (fl > 1) k.box(1.4, 0.9, 0.05, 0, h - 1.4, -0.38, 0x2c3e50);
    k.box(W, 0.06, D - 0.3, 0, h + 0.35, -D / 2 - 0.05, 0xffffff, 'tex:' + T.corr(), [0.12, 0, 0]);
    // mảng rỉ bám theo dốc mái (mái nghiêng 0,12 rad quanh tâm z = −D/2 − 0,05)
    for (let i = 0; i < 3; i++) {
      const x = (r.next() - 0.5) * (W - 2), z = -1 - r.next() * (D - 2.2);
      k.box(0.6 + r.next(), 0.02, 0.5 + r.next(), x, h + 0.39 - (z + D / 2 + 0.05) * Math.sin(0.12), z, 0x8e5a3a, '', [0.12, 0, 0]);
    }
    return h + 0.9;
  },
  // phố Hoa: nhà ống 2–4 tầng sơn đỏ / vàng / xanh, mái ngói đầu hồi trước, biển dọc chữ Hoa, đèn lồng đỏ
  chinese(k, o, r) {
    const { W, D } = o;
    const fl = r.int(2, 4), h = fl * 3.2;
    const wall = r.pick([0xb03a2e, 0xd4ac0d, 0x7d9a5b, 0xe8d5b7, 0xc0763a]);
    k.box(W - 0.2, h, D - 0.4, 0, h / 2, -D / 2 - 0.1, wall);
    k.box(W - 0.8, 2.6, 0.06, 0, 1.4, -0.28, 0x3b2a1e);
    for (let f = 1; f < fl; f++) {
      const y = f * 3.2;
      k.box(W - 0.4, 0.12, 0.8, 0, y, 0.15, 0x7f2a1f); // ban công
      k.box(W - 0.4, 0.8, 0.04, 0, y + 0.45, 0.52, 0x5d2a1a);
      k.box(W * 0.5, 1.4, 0.05, 0, y + 1.5, -0.28, 0x2c3e50);
      if (r.next() < 0.7) k.ball(0.22, (r.next() - 0.5) * (W - 1), y + 1.0, 0.45, 0xd62d20, 'light', [1, 1.25, 1]);
    }
    tileRoof(k, W - 0.4, 0.9, 0.55, 0, h, -0.45);
    tileRoofZ(k, D - 1.6, W - 0.4, 1.1, 0, h, -D / 2 - 0.5); // mái ngói dốc 2 bên (nhìn từ trên)
    const word = r.pick(CN_WORDS);
    k.plane(0.5, 2.2, W / 2 - 0.4, Math.min(h - 1.4, 4.6), 0.12, 0xffffff, 'tex:' + textTex(word, { bg: '#a8261c', fg: '#f2c94c', w: 96, h: 512, vertical: true }));
    return h + 0.8;
  },
  // phố Nhật: nhà gỗ tối 2–3 tầng, cửa sổ giấy sáng đèn, rèm noren, đèn lồng giấy, mái hiên ngói, biển dọc chữ Nhật
  japanese(k, o, r) {
    const { W, D } = o;
    const fl = r.int(2, 3), h = fl * 3.1;
    const wood = 'tex:' + T.wood();
    k.box(W - 0.3, h, D - 0.6, 0, h / 2, -D / 2 - 0.2, r.pick([0x3b2a1e, 0x4a3426, 0x2e2420]));
    k.box(W - 0.9, 2.4, 0.05, 0, 1.25, -0.48, 0xffffff, wood);
    k.plane(Math.min(2, W * 0.4), 0.7, 0, 2.05, -0.42, 0xffffff, 'tex:' + textTex(r.pick(JP_WORDS), { bg: '#1b2a4a', fg: '#ffffff', w: 384, h: 140 }));
    tileRoof(k, W - 0.4, 1.3, 0.3, 0, 3.05, -0.2);
    for (let f = 1; f < fl; f++) k.box(Math.min(2.4, W - 1.6), 1.1, 0.04, 0, f * 3.1 + 1.45, -0.48, 0xf6eedb, 'light');
    k.cyl(0.24, 0.24, 0.55, W / 2 - 0.6, 2.4, 0.1, r.chance(0.5) ? 0xd62d20 : 0xf6eedb, 'light', 10);
    k.plane(0.4, 1.8, -W / 2 + 0.45, h - 1.6, -0.4, 0xffffff, 'tex:' + textTex(r.pick(JP_WORDS), { bg: '#f6eedb', fg: '#1b1b1b', w: 96, h: 512, vertical: true }));
    tileRoof(k, W - 0.4, D - 0.8, 1.0, 0, h, -D / 2 - 0.1);
    return h + 1.2;
  },
  // biệt thự sân vườn: hàng rào + cổng, sân cỏ, nhà lùi vào, 2–3 tầng sơn sáng, mái ngói, ban công, cây
  villa(k, o, r) {
    const { W, D } = o;
    k.box(W, 0.06, D, 0, 0.03, -D / 2, 0x5f9e45);
    // rào trước (chừa cổng giữa) + rào hai bên
    for (const s of [-1, 1]) {
      k.box(W / 2 - 1.2, 0.6, 0.25, s * (W / 4 + 0.6), 0.3, -0.15, 0xf2f2f2);
      k.box(W / 2 - 1.2, 0.9, 0.05, s * (W / 4 + 0.6), 1.05, -0.15, 0x2c3e50);
      k.box(0.2, 1.5, D - 0.2, s * (W / 2 - 0.1), 0.75, -D / 2, 0xf2f2f2);
    }
    const fl = r.int(2, 3), h = fl * 3.2, hw = Math.max(3, W * 0.72), hd = Math.max(3, D * 0.55), hz = -D + 0.6 + hd / 2;
    k.box(hw, h, hd, 0, h / 2, hz, r.pick([0xf4f1ea, 0xfbe9c6, 0xe8eef2, 0xf2dcd0]));
    k.box(hw * 0.6, 0.12, 1.2, 0, 3.2, hz + hd / 2 + 0.6, 0xdcdcdc);
    k.box(hw * 0.6, 0.9, 0.05, 0, 3.7, hz + hd / 2 + 1.18, 0x2c3e50);
    for (let f = 0; f < fl; f++) for (const s of [-1, 1]) k.box(1.2, 1.4, 0.05, s * hw * 0.3, f * 3.2 + 1.6, hz + hd / 2 + 0.03, 0x34495e);
    tileRoof(k, hw + 1, hd + 1.2, 1.6, 0, h, hz);
    tree(k, -W / 2 + 1.6, -1.6, 2.6, r, 0.9);
    if (W > 9) tree(k, W / 2 - 1.6, -1.8, 2.2, r, 0.8);
    return h + 1.8;
  },
  // chung cư mới: 6–12 tầng, ban công đều tăm tắp, bồn nước trên mái
  condo(k, o, r) {
    const { W, D } = o;
    const n = r.int(6, 12), fh = 3, h = n * fh;
    const bw = W - 0.6, bd = D - 1.2, bz = -D / 2 - 0.3;
    k.box(bw, h, bd, 0, h / 2, bz, r.pick([0xeceff1, 0xdfe6e9, 0xf5f0e6]));
    for (let i = 1; i < n; i++) {
      k.box(bw - 0.4, 0.14, 0.9, 0, i * fh, bz + bd / 2 + 0.45, 0xbfc5c9);
      k.box(bw - 0.4, 0.8, 0.04, 0, i * fh + 0.5, bz + bd / 2 + 0.88, 0x9fb3c8, 'glass');
    }
    for (let i = 0; i < Math.round(n * 0.5); i++) k.box(1.4, 1.5, 0.03, (r.next() - 0.5) * (bw - 2), r.int(1, n - 1) * fh + 1.5, bz + bd / 2 + 0.02, 0xfff1c2, 'light');
    k.cyl(0.8, 0.8, 1.6, bw / 4, h + 0.8, bz, 0xb0b8bd, 'metal', 10);
    return h + 1.8;
  },
};
export const RES_STYLES = Object.keys(RES);

// Bộ gom mảnh trống (vẽ trang trí đường phố bằng toạ độ thế giới rồi gộp bằng mergeKits)
export const makeKit = () => new Kit();
export { parkedBike };
export const kitLantern = (k, x, y, z, color = 0xd62d20, s = 1) => k.ball(0.22 * s, x, y, z, color, 'light', [1, 1.25, 1]);

// Dựng 1 căn nhà dân kiểu `style` → { kit (gộp theo vật liệu), height }
export function buildResidential(style, o, seed = 1) {
  const k = new Kit();
  const r = makeRng((seed >>> 0) || 1);
  const height = (RES[style] || RES.tin)(k, o, r);
  return { kit: k, height };
}
// Gộp các kit đã đặt vào thế giới (mỗi kit kèm ma trận) thành vài khối vẽ (mỗi vật liệu 1 khối)
export function mergeKits(entries, group) {
  const byKind = new Map();
  for (const { kit, matrix } of entries) {
    for (const [kind, L] of kit.parts) {
      const g = L.build();
      g.applyMatrix4(matrix);
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push(g);
    }
  }
  for (const [kind, geos] of byKind) {
    const m = new THREE.Mesh(mergeGeometries(geos), matFor(kind));
    m.castShadow = kind !== 'light' && kind !== 'glass';
    m.receiveShadow = true;
    group.add(m);
  }
}

// Dựng nhà địa điểm → { group (toạ độ riêng), glow: [vật liệu biển phát sáng ban đêm], colliders, height }
// o: { look, W, D, floors, color (#hex hoặc số), signBg, sign, short, kind, menu, seed, inAlley }
export function buildPlace(o) {
  const look = BUILD[o.look] ? o.look : 'tube';
  const r = makeRng((o.seed >>> 0) || 1);
  const oo = { ...o, color: hexNum(o.color, 0xf4c095), floors: o.floors || 2, seed: (o.seed >>> 0) || 1 };
  const k = new Kit();
  const res = BUILD[look](k, oo, r);
  const group = new THREE.Group();
  if (res.shell) {
    const m = new THREE.Mesh(res.shell.toGeometry(), houseMaterial());
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  k.meshes(group);
  // xe máy đậu (tiệm sửa xe / phòng trọ)
  const bikes = res.bikeList || (res.bike ? [res.bike] : res.bikes ? [{ x: -oo.W / 2 + 1.5, z: 1.9, ry: -PI / 2 + 0.25, c: 0xc0392b }, { x: -oo.W / 2 + 2.6, z: 1.9, ry: -PI / 2 + 0.25, c: 0x2e86de }] : []);
  for (const b of bikes) {
    const m = makeBike(b.c ?? 0x34495e, 'underbone');
    m.userData.bagMesh.visible = false;
    m.position.set(b.x, 0, b.z);
    m.rotation.y = b.ry;
    group.add(m);
  }
  // biển hiệu chính (chữ của địa điểm), sáng nhẹ ban đêm
  const glow = [];
  if (res.sign && o.sign && hasDOM) {
    const tex = makeSignTexture(o.sign, o.signBg || '#1e8449');
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: res.sign.glow ?? 0.15, roughness: 0.6 });
    mat.userData.glowBase = res.sign.glow ?? 0.15;
    glow.push(mat);
    const w = res.sign.w ?? Math.min(8, oo.W - 0.8);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.1875), mat);
    s.position.set(res.sign.x ?? 0, res.sign.y, res.sign.z ?? 0.08);
    group.add(s);
  }
  for (const e of res.extra || []) group.add(e); // người đứng chờ…
  return { group, glow, colliders: res.colliders ?? 'full', height: res.height, look, ramp: res.ramp || null, barriers: res.barriers || null };
}
