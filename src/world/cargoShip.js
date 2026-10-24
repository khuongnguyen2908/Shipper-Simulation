// =============================================================
// TÀU HÀNG CONTAINER "HẢI LONG" (chương 6) — dựng bằng khối cơ bản, low-poly như phần còn lại của game.
// Gốc ở giữa tàu, ngang mặt nước (y = 0), mũi tàu về +z. Dài ~120, rộng ~22 (đơn vị bản đồ ≈ m).
// Container gộp chung 1 khối hình (màu theo đỉnh) cho nhẹ máy. Cầu thang mạn bên trái (-x) thả xuống bờ.
// Trong thành phố tàu chỉ để nhìn (việc cốt truyện "ship" — game/scene.js).
// walk: true → bản đi lại được (bản đồ riêng trên tàu — world/shipMap.js): tầng trệt lầu chỉ huy rỗng có cửa,
//   container nhốt người (2 cánh cửa mở được), cầu thang lên sàn mũi; userData trả về vật cản + mặt đi (toạ độ tàu).
// =============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Số đo chung (bản đồ trên tàu dùng lại)
export const SHIP = {
  DECK: 6.2, // mặt boong
  FL: 2.9, // cao mỗi tầng lầu
  SZ0: -58, SZ1: -45, // lầu chỉ huy: từ đuôi tới mặt trước
  FORE_Z: 44, FORE_H: 2.2, // sàn mũi: bắt đầu từ z, cao hơn boong
  RAIL_X: 10.7, // lan can 2 bên
  GANG: { z0: -34, z1: -22, x: -11.75, y1: 0.3 }, // cầu thang mạn: đỉnh (boong) → chân (bục sát bờ)
  CAPTIVE: { x0: -9.1, x1: 3.1, z0: 36.38, z1: 38.82, h: 2.6 }, // container 40 feet nhốt người (cửa ở đầu +x)
  STAIR_X: 6.6, // cầu thang lên sàn mũi (mạn phải)
};

const mats = new Map();
const mat = (color, opts = {}) => {
  const k = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, flatShading: true, ...opts }));
  return mats.get(k);
};
function box(g, w, h, d, color, x, y, z, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
// rng có seed (container cùng màu mỗi lần dựng)
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Thân tàu: viền boong nhìn từ trên (mũi nhọn về +z, đuôi phẳng) đùn lên theo chiều cao
const OUTLINE = [[-10, -60], [10, -60], [11, -52], [11, 40], [9.5, 49], [6.5, 55], [3, 59], [0, 60.5], [-3, 59], [-6.5, 55], [-9.5, 49], [-11, 40], [-11, -52]];
export const FORE = [[10.6, 44], [9.5, 49], [6.5, 55], [3, 59], [0, 60.5], [-3, 59], [-6.5, 55], [-9.5, 49], [-10.6, 44]];
function hullPart(y0, y1, inset, color) {
  const sh = new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x * (1 - inset), -z * (1 - inset * 0.3))));
  const geo = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0);
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function makeCargoShip({ name = 'HẢI LONG', seed = 7, walk = false } = {}) {
  const g = new THREE.Group(), R = rng(seed);
  const { DECK, FL, SZ0, SZ1, RAIL_X, GANG } = SHIP;
  const cols = []; // vật cản (toạ độ tàu): { x0, z0, x1, z1, h (đỉnh, tính từ mặt nước), y0?, cam? }
  const col = (x0, z0, x1, z1, h, extra) => cols.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, tall: h - DECK > 2.3, ...extra }); // tall: chặn camera
  // ---- thân: đáy đỏ chống hà (dưới nước) · thân xanh than · vạch trắng · boong xanh xám ----
  g.add(hullPart(-3.5, 0.6, 0.04, 0x8e2b22));
  g.add(hullPart(0.6, 5.6, 0, 0x263a52));
  g.add(hullPart(5.6, 6.0, 0, 0xd8d2c4));
  g.add(hullPart(6.0, DECK, 0.03, 0x4f6b5a));
  // lan can 2 bên (bên trái chừa chỗ đầu cầu thang mạn) + đuôi
  const gap0 = GANG.z0 - 1.8, gap1 = GANG.z0 + 1.8;
  for (const s of [-1, 1]) {
    const segs = s < 0 ? [[-52, gap0], [gap1, 40]] : [[-52, 40]];
    for (const [a, b] of segs) box(g, 0.25, 1.0, b - a, 0xd8d2c4, s * RAIL_X, DECK + 0.5, (a + b) / 2);
    for (let z = -50; z <= 38; z += 4) if (s > 0 || z < gap0 || z > gap1) box(g, 0.2, 1.0, 0.2, 0xb0aa9c, s * RAIL_X, DECK + 0.5, z);
  }
  box(g, 20, 1.0, 0.25, 0xd8d2c4, 0, DECK + 0.5, -59.6);
  // ---- mũi: sàn mũi nhô cao + tời neo + cột đèn ----
  const fore = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(FORE.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: SHIP.FORE_H, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, DECK, 0), mat(0x1f2d3d));
  fore.castShadow = fore.receiveShadow = true;
  g.add(fore);
  for (const s of [-1, 1]) {
    box(g, 2.2, 1.2, 2.2, 0x3a3f46, s * 3, DECK + 2.8, 50); // tời neo
    col(s * 3 - 1.1, 48.9, s * 3 + 1.1, 51.1, DECK + 3.4);
    box(g, 1.4, 1.4, 0.8, 0x2b2b2b, s * 8.6, 3.6, 52.5); // lỗ neo bên hông
  }
  box(g, 0.4, 9, 0.4, 0xe8e3d8, 0, DECK + 6.5, 53); // cột đèn mũi
  col(-0.2, 52.8, 0.2, 53.2, DECK + 11);
  box(g, 0.8, 0.5, 0.8, 0xfff4c8, 0, DECK + 11.2, 53, { emissive: 0xffeeaa, emissiveIntensity: 1.2 });
  // ---- lầu chỉ huy (đuôi): 5 tầng trắng, cửa sổ, cánh gà, ống khói ----
  for (let f = 0; f < 5; f++) {
    const w = f === 4 ? 17 : 18, y = DECK + f * FL;
    if (!(walk && f === 0)) box(g, w, FL - 0.15, SZ1 - SZ0, 0xece8de, 0, y + FL / 2, (SZ0 + SZ1) / 2);
    for (const zf of [SZ1 + 0.02, SZ0 - 0.02]) box(g, w - 2, 0.7, 0.1, 0x22313f, 0, y + FL * 0.62, zf); // dải cửa sổ trước + sau
    for (const s of [-1, 1]) box(g, 0.1, 0.7, SZ1 - SZ0 - 3, 0x22313f, s * (w / 2 + 0.02), y + FL * 0.62, (SZ0 + SZ1) / 2);
  }
  if (walk) hollowFloor(g, col);
  else col(-9, SZ0, 9, SZ1, DECK + 5 * FL);
  const top = DECK + 5 * FL;
  col(-9, SZ0, 9, SZ1, top + 7, { y0: DECK + FL, cam: true }); // các tầng trên: chỉ chặn camera
  box(g, 24, 0.35, 4, 0xece8de, 0, top - FL + 0.2, SZ1 - 1.5); // cánh gà buồng lái
  box(g, 18, 0.3, 14, 0xd8d2c4, 0, top + 0.15, (SZ0 + SZ1) / 2); // nóc
  box(g, 0.3, 5, 0.3, 0xe8e3d8, 0, top + 2.8, -50); // cột ăng-ten
  box(g, 3, 0.25, 0.25, 0xe8e3d8, 0, top + 4.2, -50);
  box(g, 0.6, 0.6, 0.6, 0xff4d3d, 0, top + 5.4, -50, { emissive: 0xff2200, emissiveIntensity: 1.5 });
  // ống khói
  box(g, 5, 7, 4.5, 0x1f2d3d, 0, top + 3.3, -55.5);
  box(g, 5.05, 1.4, 4.55, 0xc0392b, 0, top + 4.8, -55.5);
  box(g, 5.1, 0.6, 4.6, 0x111111, 0, top + 6.6, -55.5);
  // xuồng cứu sinh cam 2 bên
  for (const s of [-1, 1]) {
    box(g, 2.2, 2, 7, 0xe67e22, s * 10.2, DECK + 2 * FL + 1, -51.5);
    box(g, 0.25, 3.2, 0.25, 0xd8d2c4, s * 9.2, DECK + 2 * FL + 1.4, -54.5);
    box(g, 0.25, 3.2, 0.25, 0xd8d2c4, s * 9.2, DECK + 2 * FL + 1.4, -48.5);
  }
  // tên tàu ở đuôi
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 96;
  const c2 = cv.getContext('2d');
  c2.fillStyle = '#1f2d3d'; c2.fillRect(0, 0, 512, 96);
  c2.fillStyle = '#f2efe6'; c2.font = 'bold 64px Segoe UI, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.fillText(name, 256, 50);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshBasicMaterial({ map: tex }));
  plate.position.set(0, 3.8, -60.06);
  plate.rotation.y = Math.PI;
  g.add(plate);
  // ---- nắp hầm + container: 11 khoang dọc tàu × 7 hàng ngang, 1–4 tầng (gộp 1 khối, màu theo đỉnh) ----
  // Nắp hầm hẹp hơn lan can → lối đi ~1,7 m sát lan can 2 bên. Khoang trống (chân cần cẩu, lối đi ngang): nắp hầm phẳng sát boong
  const COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0xe67e22, 0x7f8c8d, 0xdcdcdc, 0x16a085, 0x8e3b2f, 0xd4ac0d, 0x34495e];
  const geos = [], color = new THREE.Color();
  const BAY = 6.5, ROWW = 2.5, CL = 6.06, CW = 2.44, CH = 2.6;
  for (let b = 0; b < 11; b++) {
    const zc = -39 + b * BAY + CL / 2, empty = b === 4 || b === 8;
    box(g, 17.8, empty ? 0.08 : 0.5, CL + 0.3, 0x3d4a40, 0, DECK + (empty ? 0.04 : 0.25), zc); // nắp hầm
    if (empty) continue; // khoang 5 + 9 trống: chân cần cẩu + lối đi ngang tàu
    for (let r = 0; r < 7; r++) { // 7 hàng
      const x = (r - 3) * ROWW;
      const tiers = 1 + Math.floor(R() * (b === 0 || b === 10 ? 2 : 4));
      col(x - CW / 2, zc - CL / 2, x + CW / 2, zc + CL / 2, DECK + 0.5 + tiers * CH);
      for (let t = 0; t < tiers; t++) {
        const geo = new THREE.BoxGeometry(CW, CH, CL).translate(x, DECK + 0.5 + CH / 2 + t * CH, zc);
        color.setHex(COLORS[Math.floor(R() * COLORS.length)]);
        const shade = 0.85 + R() * 0.2; // container cùng màu đậm nhạt khác nhau chút (cũ / mới)
        const n = geo.attributes.position.count, cs = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { cs[i * 3] = color.r * shade; cs[i * 3 + 1] = color.g * shade; cs[i * 3 + 2] = color.b * shade; }
        geo.setAttribute('color', new THREE.BufferAttribute(cs, 3));
        geos.push(geo);
      }
    }
    // giữa 2 khoang có khe hẹp → chắn luôn cả khe (đi lọt chỉ ở lối sát lan can)
    if (b < 10 && b !== 3 && b !== 7) col(-8.75, zc + CL / 2, 8.75, zc + BAY - CL / 2, DECK + 0.5 + CH);
  }
  const boxes = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));
  boxes.castShadow = boxes.receiveShadow = true;
  g.add(boxes);
  // ---- 2 cần cẩu vàng giữa tàu (đứng ở 2 khoang trống) ----
  for (const [zc, rot] of [[-39 + 4 * BAY + CL / 2, 0.5], [-39 + 8 * BAY + CL / 2, -0.6]]) {
    const cr = new THREE.Group();
    box(cr, 2.6, 12, 2.6, 0xd4ac0d, 0, DECK + 6, 0);
    box(cr, 3.2, 2.2, 3.6, 0xd4ac0d, 0, DECK + 12.6, 0);
    const jib = box(cr, 0.9, 0.9, 22, 0xe1b80f, 0, DECK + 15, 9);
    jib.rotation.x = -0.32;
    box(cr, 0.1, 9, 0.1, 0x222222, 0, DECK + 15.5, 19.5); // dây cẩu
    cr.position.set(0, 0, zc); // giữa tàu, không chắn lối đi 2 bên
    cr.rotation.y = rot;
    g.add(cr);
    col(-1.6, zc - 1.6, 1.6, zc + 1.6, DECK + 12);
  }
  // đèn boong ban đêm (đốm sáng nhỏ dọc lan can)
  for (let z = -40; z <= 40; z += 12) for (const s of [-1, 1]) box(g, 0.35, 0.35, 0.35, 0xfff1c2, s * RAIL_X, DECK + 1.2, z, { emissive: 0xffe4a0, emissiveIntensity: 1.4 });
  // cầu thang mạn bên trái: từ bục đầu thang (ngoài lan can) dốc xuống dọc thân tàu, chân thang có bục + tấm ván gác lên bờ
  {
    const { z0, z1, x, y1 } = GANG, y0 = DECK, len = Math.hypot(z1 - z0, y0 - y1), ang = Math.atan2(y0 - y1, z1 - z0);
    const lad = new THREE.Group();
    box(lad, 1.3, 0.12, len, 0x8a8f94, 0, 0, 0, { metalness: 0.4 });
    for (const s of [-1, 1]) box(lad, 0.08, 1.0, len, 0xd8d2c4, s * 0.62, 0.5, 0);
    for (let i = 0; i < 12; i++) box(lad, 1.2, 0.05, 0.12, 0x5d6d7e, 0, 0.08, -len / 2 + 0.6 + i * (len - 1.2) / 11);
    lad.position.set(x, (y0 + y1) / 2 - 0.06, (z0 + z1) / 2);
    lad.rotation.x = ang;
    g.add(lad);
    box(g, 2.0, 0.12, 2.2, 0x8a8f94, x - 0.3, DECK - 0.06, z0 - 0.7, { metalness: 0.4 }); // bục đầu thang
    box(g, 0.08, 1.0, 2.2, 0xd8d2c4, x - 1.3, DECK + 0.5, z0 - 0.7);
    box(g, 2.0, 1.0, 0.08, 0xd8d2c4, x - 0.3, DECK + 0.5, z0 - 1.8);
    col(x - 1.35, z0 - 1.85, x - 1.2, z0 + 0.4, DECK + 1.1);
    col(x - 1.35, z0 - 1.9, RAIL_X * -1, z0 - 1.75, DECK + 1.1);
    box(g, 1.6, 0.15, 2.2, 0x8a8f94, x, y1 - 0.07, z1 + 1.1, { metalness: 0.4 }); // bục chân thang
    box(g, 2.6, 0.1, 1.2, 0x9c7b52, x - 1.9, 0.12, z1 + 1.1); // tấm ván gác lên bờ
  }
  // lan can = vật cản (chừa chỗ đầu cầu thang mạn)
  col(RAIL_X - 0.15, -60, RAIL_X + 0.4, 44, DECK + 1.1);
  col(-RAIL_X - 0.4, -60, -RAIL_X + 0.15, gap0, DECK + 1.1);
  col(-RAIL_X - 0.4, gap1, -RAIL_X + 0.15, 44, DECK + 1.1);
  col(-10.5, -60.2, 10.5, -59.4, DECK + 1.1);
  const ud = { len: 120, beam: 22, deck: DECK, cols, pads: [], ramps: [] };
  if (walk) walkExtras(g, col, ud);
  g.userData = ud;
  return g;
}

// Tầng trệt lầu chỉ huy rỗng (bản đi lại): sàn, 4 vách có cửa (trước giữa, 2 bên), cầu thang (chắn), tủ, bàn, đèn trần
function hollowFloor(g, col) {
  const { DECK, FL, SZ0, SZ1 } = SHIP, H = FL - 0.15, yc = DECK + H / 2, W = 0xece8de, IN = 0xd9d3c4;
  box(g, 17.8, 0.05, SZ1 - SZ0 - 0.2, 0x7d7a72, 0, DECK + 0.03, (SZ0 + SZ1) / 2); // sàn trong
  box(g, 18, 0.15, SZ1 - SZ0, W, 0, DECK + H + 0.07, (SZ0 + SZ1) / 2); // trần
  const wall = (x0, z0, x1, z1) => {
    box(g, Math.max(0.15, x1 - x0), H, Math.max(0.15, z1 - z0), W, (x0 + x1) / 2, yc, (z0 + z1) / 2);
    col(x0 - 0.22, z0 - 0.22, x1 + 0.22, z1 + 0.22, DECK + FL, { y0: DECK - 0.3 });
  };
  // vách trước: cửa giữa rộng 2 m · vách sau kín · 2 vách bên: cửa ở giữa
  wall(-9, SZ1 - 0.08, -1, SZ1 + 0.08);
  wall(1, SZ1 - 0.08, 9, SZ1 + 0.08);
  box(g, 2, H - 2.2, 0.15, W, 0, DECK + 2.2 + (H - 2.2) / 2, SZ1); // khung trên cửa
  wall(-9, SZ0 - 0.08, 9, SZ0 + 0.08);
  for (const s of [-1, 1]) {
    wall(s * 9 - 0.08, SZ0, s * 9 + 0.08, -52.5);
    wall(s * 9 - 0.08, -50.5, s * 9 + 0.08, SZ1);
    box(g, 0.15, H - 2.2, 2, W, s * 9, DECK + 2.2 + (H - 2.2) / 2, -51.5);
  }
  // cầu thang lên tầng trên (góc sau trái) — chắn lại (tầng trên chưa đi được)
  for (let i = 0; i < 8; i++) box(g, 1.4, 0.3 * (i + 1), 0.35, 0x8a8f94, -7.5, DECK + 0.15 * (i + 1), -56.8 + i * 0.36);
  box(g, 0.08, 1.0, 3, 0xb0aa9c, -6.75, DECK + 1.3, -55.4);
  col(-8.9, -57.9, -6.7, -53.6, DECK + FL);
  // tủ đồ dọc vách phải, bàn giữa, ghế
  for (let i = 0; i < 4; i++) box(g, 1.0, 2.0, 0.6, 0x7f8c8d, 8.4, DECK + 1.0, -56.5 + i * 1.05);
  col(7.8, -57.0, 8.95, -52.4, DECK + 2.0);
  box(g, 3, 0.1, 1.4, 0x8d6e4f, 2, DECK + 0.8, -53);
  for (const [x, z] of [[0.8, -53.8], [3.2, -53.8], [0.8, -52.2], [3.2, -52.2]]) box(g, 0.08, 0.8, 0.08, 0x5d4a38, x, DECK + 0.4, z);
  col(0.5, -53.7, 3.5, -52.3, DECK + 0.85);
  // đèn trần (tự sáng) + cửa phòng (trang trí) dọc vách sau
  for (const z of [-55, -48.5]) box(g, 2.4, 0.06, 0.5, 0xfff6d5, 0, DECK + H - 0.05, z, { emissive: 0xfff0c0, emissiveIntensity: 1.2 });
  for (const x of [-2.5, 2.5, 5.5]) box(g, 1.0, 2.1, 0.06, 0x6e5a46, x, DECK + 1.05, SZ0 + 0.12);
}

// Bản đi lại: container nhốt người (2 cánh cửa), cầu thang lên sàn mũi, mặt đi (pads / ramps)
function walkExtras(g, col, ud) {
  const { DECK, FL, SZ0, SZ1, FORE_Z, FORE_H, GANG, CAPTIVE: C, STAIR_X } = SHIP;
  // ---- mặt đi (toạ độ tàu; ramps: [{x, y, z}…] + nửa bề rộng) ----
  // Mép mặt đi bị thu vào 1 bán kính người (0,35 m) → 2 mặt nối nhau phải chồng lên nhau > 0,8 m mới đi qua được
  const pad = (x0, z0, x1, z1, y) => ud.pads.push({ c: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y });
  // boong chính: chừa dải dưới cầu thang lên sàn mũi (không thì người cứ đi dưới gầm thang, không leo lên)
  pad(-10.55, -46.2, 10.55, FORE_Z - 4.6, DECK);
  pad(-10.55, FORE_Z - 5, STAIR_X - 0.6, FORE_Z - 0.1, DECK);
  pad(STAIR_X + 0.6, FORE_Z - 5, 10.55, FORE_Z - 0.1, DECK);
  pad(-9.6, -57.85, 9.6, -43.8, DECK); // trong lầu (gối lên boong ở cửa trước, lấn dưới vách hông)
  for (const s of [-1, 1]) pad(s * 8.4, -59.5, s * 10.55, -43.8, DECK); // lối đi 2 bên lầu (gối lên cửa hông)
  pad(-10.4, -59.5, 10.4, -58.1, DECK); // boong đuôi
  ud.pads.push({ c: FORE.map(([x, z]) => [x * 0.97, z]), y: DECK + FORE_H }); // sàn mũi
  pad(GANG.x - 1.2, GANG.z0 - 1.75, -9.6, GANG.z0 + 0.8, DECK); // bục đầu cầu thang mạn (gối lên boong qua chỗ hở lan can)
  ud.ramps.push({ pts: [{ x: GANG.x, y: DECK, z: GANG.z0 - 0.6 }, { x: GANG.x, y: GANG.y1, z: GANG.z1 }, { x: GANG.x, y: GANG.y1, z: GANG.z1 + 1.0 }], w: 0.55 }); // cầu thang mạn
  pad(GANG.x - 0.75, GANG.z1 - 0.2, GANG.x + 0.75, GANG.z1 + 2.2, GANG.y1); // bục chân thang
  ud.ramps.push({ pts: [{ x: GANG.x - 0.1, y: GANG.y1, z: GANG.z1 + 1.1 }, { x: GANG.x - 0.6, y: GANG.y1, z: GANG.z1 + 1.1 }, { x: GANG.x - 3.4, y: 0, z: GANG.z1 + 1.1 }], w: 0.55 }); // tấm ván xuống bờ
  ud.ramps.push({ pts: [{ x: STAIR_X, y: DECK, z: FORE_Z - 5.8 }, { x: STAIR_X, y: DECK, z: FORE_Z - 5.4 }, { x: STAIR_X, y: DECK + FORE_H, z: FORE_Z + 0.6 }, { x: STAIR_X, y: DECK + FORE_H, z: FORE_Z + 1.2 }], w: 0.6 }); // cầu thang lên sàn mũi
  // vách trước sàn mũi (chừa chỗ cầu thang)
  col(-10.6, FORE_Z - 0.1, STAIR_X - 0.75, FORE_Z + 0.2, DECK + FORE_H);
  col(STAIR_X + 0.75, FORE_Z - 0.1, 10.6, FORE_Z + 0.2, DECK + FORE_H);
  // cầu thang lên sàn mũi: bậc thép + tay vịn
  for (let i = 0; i < 10; i++) box(g, 1.2, 0.22 * (i + 1), 0.55, 0x8a8f94, STAIR_X, DECK + 0.11 * (i + 1), FORE_Z - 5.2 + i * 0.58, { metalness: 0.3 });
  for (const s of [-1, 1]) {
    const hr = box(g, 0.06, 0.06, 6.2, 0xd8d2c4, STAIR_X + s * 0.62, DECK + 2.0, FORE_Z - 2.3);
    hr.rotation.x = -Math.atan2(FORE_H, 6);
  }
  // ---- container nhốt người: 40 feet, nằm ngang giữa boong trống phía mũi, cửa 2 cánh ở đầu +x ----
  const L = C.x1 - C.x0, Wd = C.z1 - C.z0, cx = (C.x0 + C.x1) / 2, cz = (C.z0 + C.z1) / 2, RUST = 0x9c4a2f, T = 0.08;
  box(g, L, T, Wd, RUST, cx, DECK + C.h, cz); // nóc
  box(g, L, 0.06, Wd, 0x5b4636, cx, DECK + 0.03, cz); // sàn gỗ
  for (const z of [C.z0, C.z1]) box(g, L, C.h, T, RUST, cx, DECK + C.h / 2, z); // 2 vách dọc
  box(g, T, C.h, Wd, RUST, C.x0, DECK + C.h / 2, cz); // vách cuối
  for (let x = C.x0 + 0.4; x < C.x1; x += 0.6) for (const z of [C.z0 - 0.05, C.z1 + 0.05]) box(g, 0.08, C.h - 0.2, 0.06, 0x873d25, x, DECK + C.h / 2, z); // gân tôn
  box(g, 0.5, 0.06, 0.5, 0xfff2c8, cx - 2, DECK + C.h - 0.06, cz, { emissive: 0xffe9a8, emissiveIntensity: 0.6 }); // bóng đèn lờ mờ
  col(C.x0 - 0.45, C.z0 - 0.45, C.x1, C.z0 + 0.06, DECK + C.h + 0.1); // vật cản vách dày ra phía ngoài (camera dò không lọt)
  col(C.x0 - 0.45, C.z1 - 0.06, C.x1, C.z1 + 0.45, DECK + C.h + 0.1);
  col(C.x0 - 0.45, C.z0, C.x0 + 0.06, C.z1, DECK + C.h + 0.1);
  col(C.x0, C.z0, C.x1, C.z1, DECK + 9, { y0: DECK + C.h, cam: true }); // nóc chặn camera (nhìn từ trong không xuyên lên trời)
  // 2 cánh cửa (bản lề ở 2 mép), đóng = chắn lối ra
  const doors = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(C.x1, DECK, s < 0 ? C.z0 : C.z1);
    const leaf = box(hinge, T, C.h - 0.05, Wd / 2, 0x873d25, 0, C.h / 2, -s * Wd / 4);
    for (const dz of [-0.35, 0.35]) box(hinge, 0.06, C.h - 0.3, 0.05, 0x6e3220, 0.05, C.h / 2, -s * Wd / 4 + dz); // thanh khóa dọc
    leaf.userData.s = s;
    hinge.userData.s = s;
    g.add(hinge);
    doors.push(hinge);
  }
  ud.captive = { doors, door: { x0: C.x1 - 0.1, z0: C.z0, x1: C.x1 + 0.4, z1: C.z1, h: DECK + C.h + 0.1, tall: true } };
  // cổng chắn đầu cầu thang mạn (đóng = không xuống tàu được)
  const gate = new THREE.Group();
  box(gate, 0.1, 1.0, 3.6, 0xc0392b, -SHIP.RAIL_X, DECK + 0.55, GANG.z0);
  for (let i = 0; i < 4; i++) box(gate, 0.12, 0.12, 0.5, 0xf2f2f2, -SHIP.RAIL_X, DECK + 0.6, GANG.z0 - 1.35 + i * 0.9); // sọc trắng
  g.add(gate);
  ud.gate = { mesh: gate, box: { x0: -SHIP.RAIL_X - 0.4, z0: GANG.z0 - 1.9, x1: -SHIP.RAIL_X + 0.15, z1: GANG.z0 + 1.9, h: DECK + 1.1 } };
  // đèn mờ trong lầu thấy từ ngoài cửa
  void FL; void SZ0; void SZ1;
}
