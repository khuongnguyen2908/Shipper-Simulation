// =============================================================
// NHÀ CỦA ĐỊA ĐIỂM theo "Kiểu nhà" (src/data/looks.js) — phong cách A+.
// Dựng trong hệ toạ độ riêng: mặt tiền ở z = 0 quay ra +z (ra đường), nhà lùi vào tới z = −D,
// bề ngang x ∈ [−W/2, W/2], y = 0 là mặt vỉa hè. Đồ bày ra vỉa hè (xe đẩy, ghế, lốp…) nằm ở z 0…2,6.
// Dùng chung cho thành phố (city.js) và khung xem trước trong ?editor.
// Nhà có thân giống nhà ống thì lấy thân nhà ống A+ (houses.js) rồi gắn thêm đồ riêng của từng kiểu.
// =============================================================
import * as THREE from 'three';
import { PartList, sideGeo, rodGeo, makeBike } from './models.js';
import { HouseGeo, buildHouse, houseMaterial, houseTop } from './houses.js';
import { makeSignTexture } from './textures.js';
import { fmt, list } from '../content/index.js';
import { makeRng } from '../sim/rng.js';

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
};
export const BUILT_LOOKS = Object.keys(BUILD);

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
  const bikes = res.bike ? [res.bike] : res.bikes ? [{ x: -oo.W / 2 + 1.5, z: 1.9, ry: -PI / 2 + 0.25, c: 0xc0392b }, { x: -oo.W / 2 + 2.6, z: 1.9, ry: -PI / 2 + 0.25, c: 0x2e86de }] : [];
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
  return { group, glow, colliders: res.colliders ?? 'full', height: res.height, look };
}
