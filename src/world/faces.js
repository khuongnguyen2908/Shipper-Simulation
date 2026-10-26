// =============================================================
// MẶT ANIME PIXEL: vẽ mặt 64×64 (canvas, nét cứng) theo kiểu mặt (data/faces.js) + miếng mặt áp lên đầu người (world/person.js).
// Miếng mặt = chép đúng nửa trước cái đầu (person.js headGeo), phóng 2–3 % nằm ngoài da → dáng đầu, mũi giữ nguyên;
// mắt / mày / miệng nhỏ kiểu cũ nằm khuất bên dưới. Vùng trán + 2 bên trong suốt (thấy mái tóc, tóc mai thật).
// Cùng kiểu + màu da + màu tóc + màu mắt → dùng chung 1 hình (cache). Không có DOM (bộ thử Node) → không gắn mặt.
// Chỉ để nhìn: mỗi máy tự vẽ.
// =============================================================
import * as THREE from 'three';
import { FACES, EYE_COLORS } from '../data/faces.js';

const N = 64;
const hexStr = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shadeHex = (h, k) => '#' + rgb(h).map((v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join('');
// phần mặt vẽ đè (ngoài vùng này trong suốt): từ hàng 15 (ngay trên mày) xuống, trong hình bầu dục quanh mắt – miệng – cằm
const inFace = (x, y) => y >= 15 && ((x + 0.5 - 32) / 30) ** 2 + ((y + 0.5 - 40) / 26) ** 2 <= 1;

// Vẽ ảnh mặt. o: { style, skin, hair, eyeColor (mã EYE_COLORS, bỏ trống = màu của kiểu mặt), mask (khẩu trang: màu, hoặc null) } — màu dạng số
function drawFace(o) {
  const F = FACES[o.style] || FACES.chinhNam, E = { irisK: 0.62, lash: 2, glint: 1, ...F.eye }, B = { w: 1, y: 19, tilt: 0, ...F.brow };
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), D = img.data;
  const set = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= N || y >= N) return; const [r, g, b] = rgb(col), i = (y * N + x) * 4; D[i] = r; D[i + 1] = g; D[i + 2] = b; D[i + 3] = 255; };
  const ell = (cx, cy, rx, ry, col, keep = () => true) => {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && keep(x, y)) set(x, y, typeof col === 'function' ? col(x, y) : col);
    }
  };
  const line = (x0, y0, x1, y1, col) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col); };
  const skin = hexStr(o.skin ?? 0xf1c27d), shade = shadeHex(skin, 0.9), dark = shadeHex(skin, 0.78);
  const hair = hexStr(o.hair ?? 0x1b1b1b), brow = shadeHex(hair, hair === '#1b1b1b' ? 0.8 : 0.85);
  const iris = (EYE_COLORS[o.eyeColor] || EYE_COLORS[F.iris] || EYE_COLORS.nau).c;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(x, y, skin);
  for (let y = 54; y < N; y++) for (let x = 0; x < N; x++) set(x, y, shadeHex(skin, 0.94)); // bóng nhẹ dưới cằm (trơn — không kẻ ô kẻo giống râu)
  const cy = 27;
  const eye = (cx, s) => {
    // s = −1 mắt bên trái hình, +1 bên phải; đuôi mắt (phía ngoài) ở phía s
    const yOff = (x) => -E.tilt * ((x - cx) * s) / E.rx;
    const inS = (x, y) => ((x + 0.5 - cx) / E.rx) ** 2 + ((y + 0.5 - cy - 1 - yOff(x)) / E.ry) ** 2 <= 1;
    for (let y = cy - 10; y <= cy + 10; y++) for (let x = cx - E.rx - 1; x <= cx + E.rx + 1; x++) if (inS(x, y)) set(x, y, '#f6f1ea');
    const ik = E.irisK;
    ell(cx - s * 0.5, cy + 1.4, E.rx * ik, E.ry * (ik < 0.5 ? 0.9 : 1.05), (x, y) => (y < cy - 1 ? iris[0] : y < cy + 2 ? iris[1] : y < cy + 4 ? iris[2] : iris[3]), inS);
    ell(cx - s * 0.5, cy + 1.1, Math.max(ik < 0.5 ? 0.9 : 1.2, E.rx * ik * 0.35), Math.max(1.2, E.ry * 0.45), '#0b0910', inS); // con ngươi
    const top = (x) => cy + 1 - E.ry + yOff(x); // mí trên che lid hàng trên cùng
    for (let x = cx - E.rx - 1; x <= cx + E.rx + 1; x++) for (let y = Math.floor(top(x)) - 3; y < top(x) + E.lid; y++) if (inS(x, y) || y < top(x)) set(x, y, skin);
    if (E.glint >= 2) { for (const [dx, dy] of [[-2, 0], [-1, 0], [-2, 1]]) set(cx - s * 0.5 + dx * s, cy + dy, '#ffffff'); set(cx - s * 0.5 + 2 * s, cy + 4, '#ffffff'); }
    else if (E.glint === 1) set(cx - s * 0.5 - s, cy + 0.5, '#ffffff');
    for (let x = cx - E.rx; x <= cx + E.rx; x++) { // viền mi trên
      const y = Math.round(top(x) + E.lid) - 1;
      for (let k = 0; k < E.lash; k++) if (Math.abs(x - cx) < E.rx - k * 0.5) set(x, y - k, '#17100f');
    }
    if (E.flick) { const ox = cx + s * E.rx, oy = Math.round(top(ox) + E.lid) - 1; set(ox, oy - 1, '#17100f'); set(ox + s, oy - 2, '#17100f'); set(ox + s, oy - 1, '#17100f'); }
    if (F.bags) { const yb = cy + 2 + E.ry + yOff(cx); line(cx - E.rx * 0.7, yb, cx + E.rx * 0.6, yb + 0.5, shadeHex(skin, 0.7)); line(cx - E.rx * 0.3, yb + 1, cx + E.rx * 0.4, yb + 1.5, shadeHex(skin, 0.82)); }
    if (E.lower) line(cx - E.rx * 0.55, cy + 1 + E.ry + yOff(cx) + 0.5, cx + E.rx * 0.55, cy + 1 + E.ry + yOff(cx) + 0.5, shadeHex(skin, 0.62));
    for (let k = 0; k < B.w; k++) line(cx - s * 2, B.y + B.tilt + k, cx + s * (E.rx + 1), B.y - B.tilt * 0.3 + k, brow); // lông mày
  };
  eye(19, -1); eye(45, 1);
  if (F.scowl) { const w = shadeHex(skin, 0.66); line(30, B.y + 1, 30, B.y + 4, w); line(34, B.y + 1, 34, B.y + 4, w); }
  if (F.old) { // nếp nhăn: chân chim, rãnh mũi – miệng, trán
    const w = shadeHex(skin, 0.74);
    for (const s of [-1, 1]) { const ox = 32 + s * 13 + s * (E.rx + 1); set(ox, 26, w); set(ox + s, 25, w); set(ox, 29, w); set(ox + s, 30, w); line(32 + s * 5, 42, 32 + s * 7, 47, w); }
    line(25, 16, 39, 16, w);
  }
  if (F.cheekLines) { const w = shadeHex(skin, 0.74); for (const s of [-1, 1]) line(32 + s * 9, 38, 32 + s * 11, 46, w); }
  if (F.blush) for (const cx of [14, 50]) ell(cx, 38, 5, 2, F.blush === 2 ? '#f28f8a' : '#f2a49a');
  if (o.mask != null) { // khẩu trang che mũi → cằm: vẽ luôn trên mặt (miếng mặt nằm ngoài khẩu trang 3D)
    const m = hexStr(o.mask), m2 = shadeHex(m, 0.84);
    for (let y = 36; y < N; y++) for (let x = 0; x < N; x++) set(x, y, y === 42 || y === 47 ? m2 : m);
  } else {
    if (F.noseLine) { line(33, 31, 33, 39, shade); set(33, 40, dark); set(31, 41, dark); set(34, 41, dark); }
    else { set(32, 40, dark); set(32, 41, dark); }
    if (F.stubble) for (let y = 44; y < 58; y++) for (let x = 20; x < 45; x++) if ((x * 7 + y * 13) % 7 === 0 && !(y > 46 && y < 51 && x > 27 && x < 37)) set(x, y, shadeHex(skin, 0.68));
    if (F.scar) { line(47, 32, 53, 41, shadeHex(skin, 0.62)); line(48, 32, 54, 41, '#d39a86'); for (const k of [34, 37, 40]) set(48 + (k - 32) * 0.66, k, shadeHex(skin, 0.55)); }
    const lip = '#8a3a36';
    if (F.mouth === 'open') { ell(32, 48, 3.2, 2.6, '#6e1a22'); ell(32, 49.4, 2, 1.1, '#e07a84'); }
    else if (F.mouth === 'grin') { ell(32, 48, 4.2, 2.4, '#6e1a22', (x, y) => y >= 47); for (let x = 29; x <= 35; x++) set(x, 47, '#fbf7f2'); set(27, 47, lip); set(37, 47, lip); }
    else if (F.mouth === 'smile') { line(30, 48, 34, 48, lip); set(35, 47, lip); }
    else if (F.mouth === 'flat') { line(30, 48, 34, 48, lip); set(31, 50, shade); set(33, 50, shade); }
    else if (F.mouth === 'frown') { line(30, 48, 34, 48, lip); set(29, 49, lip); set(35, 49, lip); }
    else if (F.mouth === 'smirk') { line(29, 49, 34, 49, lip); set(35, 48, lip); set(36, 47, lip); set(30, 50, shade); set(33, 50, shade); }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!inFace(x, y)) D[(y * N + x) * 4 + 3] = 0; // trán + 2 bên: trong suốt
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; // nét pixel cứng
  t.minFilter = THREE.NearestMipmapLinearFilter; // ở xa không nhấp nháy
  return t;
}

const MATS = new Map(), GEOS = new Map();
const faceMat = (o) => {
  const key = [o.style, o.skin, o.hair, o.eyeColor, o.mask].join('|');
  let m = MATS.get(key);
  // polygonOffset: miếng mặt nằm sát da (2–3 mm) — ưu tiên vẽ đè lên da, không thì ở xa 2 mặt tranh nhau (lấm tấm)
  if (!m) MATS.set(key, (m = new THREE.MeshStandardMaterial({ map: drawFace(o), flatShading: true, roughness: 0.78, metalness: 0.02, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
  return m;
};
// Nửa trước cái đầu (giống hệt person.js headGeo, đủ 6 × 10 ô) · bend: lưng còng — đầu bị uốn ra trước bao nhiêu thì miếng mặt dời theo
const HY = 1.595; // tâm đầu khi đứng (person.js HEAD_Y − 0,005)
function faceGeo(female, bend) {
  const key = `${female}|${bend}`;
  if (GEOS.has(key)) return GEOS.get(key);
  const R = 0.115, g = new THREE.SphereGeometry(R, 6, 10, 0, Math.PI), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = y / R;
    x *= female ? 0.8 : 0.84; y *= 1.13;
    if (ny < 0) { x *= 1 + ny * 0.36; if (z > 0) z *= 1 + ny * 0.1; }
    if (ny > -0.2 && ny < 0.25 && z > 0) x *= 1.03;
    if (z > 0 && Math.abs(x) < 0.07) { if (ny > 0.22 && ny < 0.42) z *= 1.05; else if (ny > -0.02 && ny <= 0.22) z *= 0.975; }
    p.setXYZ(i, x * 1.02, HY + y * 1.02, 0.005 + z * 1.03 + bend * Math.max(0, HY + y * 1.02 - 1.1) ** 2);
    uv.setXY(i, 0.5 + x / 0.2, 0.5 + (y + 0.01) / 0.2); // chiếu thẳng từ trước mặt: x ∈ [−0,1; 0,1], y ∈ [−0,11; 0,09]
  }
  GEOS.set(key, g);
  return g;
}
const EMPTY = new THREE.BufferGeometry(); // người ở xa (bản đơn giản): bỏ miếng mặt
EMPTY.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
export const FACE_LOD_EMPTY = EMPTY;

// Miếng mặt cho 1 người (gắn vào parts.body) — o: { style, female, bend, skin, hair, eyeColor, mask } · không có DOM → null
export function makeFaceMesh(o) {
  if (typeof document === 'undefined') return null;
  const m = new THREE.Mesh(faceGeo(!!o.female, o.bend || 0), faceMat(o));
  m.receiveShadow = true;
  m.userData.face = true;
  return m;
}
