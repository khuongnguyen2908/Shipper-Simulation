// NGƯỜI kiểu "low-poly mượt" (chủ game chọn từ mẫu devtools/personSample.js).
// Giữ ĐÚNG khung khớp cũ: hông 0,88 m → gối (−0,44) · vai 1,405 m (trên thân) → khuỷu (−0,29) → bàn tay (−0,3)
// → animatePerson, setSitting, gripBar, applyPose, đồ cầm tay… dùng lại nguyên.
// Mỗi người gộp thành 9 khối (thân+đầu+tóc+mũ, 2 đùi, 2 cẳng chân+giày, 2 bắp tay, 2 cẳng tay+bàn tay), màu nằm
// trong từng đỉnh → mọi người dùng chung MỘT vật liệu. Hình đã dựng được dùng lại cho người cùng kiểu (bộ nhớ đệm).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { makeFaceMesh, FACE_LOD_EMPTY } from './faces.js';
import { defaultFace } from '../data/faces.js';

const HIP_Y = 0.88, SHOULDER_Y = 1.405, THIGH = 0.44, UPPER_ARM = 0.29, HEAD_Y = 1.6;
const PI = Math.PI;
export const PERSON_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0.02 });
let SEG = 10, LSEG = 8; // số cạnh thân · số cạnh tay chân, khớp (ít hơn cho nhẹ) — bản đơn giản (lite) giảm còn 6 / 5
const ZS = 0.66; // ép dẹt thân trước-sau
// ---------- BẢN ĐƠN GIẢN (người ở xa / tùy chọn "người đơn giản") ----------
// Dựng lại đúng các khối của người nhưng ít cạnh hơn và bỏ chi tiết nhỏ (< 4,5 cm: mắt, lông mày, tai, môi, nút áo, chữ in…).
// Cùng khung khớp → dáng đi, ngồi xe, tư thế vẫn chạy; chỉ đổi hình (mesh.geometry) theo khoảng cách tới camera.
let LITE = false, KEEP = false; // KEEP: chi tiết nhỏ vẫn giữ ở bản đơn giản (mắt, lông mày, miệng — người gần vẫn có mặt)
function lite(fn) {
  const keep = [SEG, LSEG];
  LITE = true;
  [SEG, LSEG] = [6, 5];
  try {
    return fn();
  } finally {
    LITE = false;
    [SEG, LSEG] = keep;
  }
}
const segs = (n) => (LITE ? Math.max(4, Math.round(n * 0.55)) : n); // số cạnh của các khối cầu / ống riêng (đầu, chỏm tóc, tóc rủ…)
const Y0 = 0.78; // gốc thân tiện (đáy quần)
export const JACKET_COLOR = 0xbfe3f5;

const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
class Parts {
  constructor() { this.list = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
    if (LITE && !KEEP) {
      g.computeBoundingBox();
      const b = g.boundingBox;
      if (Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) < 0.045) return this; // chi tiết nhỏ (tai, môi, nút, chữ…): ở xa không thấy
    }
    _c.setHex(color);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'color') g.deleteAttribute(k);
    this.list.push(g);
    return this;
  }
  build() {
    const g = mergeGeometries(this.list);
    g.computeVertexNormals();
    return g;
  }
}
const shade = (c, k) => _c.setHex(c).multiplyScalar(k).getHex();
const mix = (a, b, t) => _c.setHex(a).lerp(new THREE.Color(b), t).getHex();
const limb = (r0, r1, h) => new THREE.CylinderGeometry(r0, r1, h, LSEG, 1, true).rotateY(PI / LSEG); // ống hở 2 đầu (khớp cầu bịt)
const ball = (r) => new THREE.SphereGeometry(r, LSEG, LITE ? 3 : 5);
const egg = (rx, ry, rz, seg = LSEG, rows = 5) => new THREE.SphereGeometry(1, LITE ? Math.min(seg, LSEG) : seg, LITE ? 3 : rows).scale(rx, ry, rz);
const cone = (r, h, seg = 4) => new THREE.ConeGeometry(r, h, seg);
// Vóc dáng: nở ngang [bề ngang, bề dày trước-sau] của thân / tay chân (data: npc.build, look.build)
const BUILD_W = { thin: [0.82, 0.85], chubby: [1.2, 1.3], fat: [1.38, 1.6] };
// Độ nở theo độ cao: thân nở đủ, lên tới vai nhỏ dần, cổ + đầu giữ nguyên
const buildFade = (y) => Math.min(1, Math.max(0, (1.47 - y) / 0.11));
function widen(g, [wx, wz]) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = buildFade(p.getY(i));
    p.setX(i, p.getX(i) * (1 + (wx - 1) * t));
    p.setZ(i, p.getZ(i) * (1 + (wz - 1) * t));
  }
  g.computeVertexNormals();
  return g;
}
// Lưng trên cong + đầu đưa ra trước (người lớn tuổi): từ ngang ngực trở lên dời dần ra trước, càng cao càng nhiều
const BEND_Y = 1.1;
const bendZ = (y, k) => k * Math.max(0, y - BEND_Y) ** 2;
function bend(g, k) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + bendZ(p.getY(i), k));
  g.computeVertexNormals();
  return g;
}
const latheOf = (prof, k = 1) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * k, y)), SEG).rotateY(PI / SEG).scale(1, 1, ZS);
// bán kính thân tiện ở độ cao y (nội suy theo mặt cắt)
function radiusAt(prof, y) {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
    if (y <= y1) return r0 + ((r1 - r0) * Math.max(0, y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return prof[prof.length - 1][0];
}
// Đai ôm thân (dải phản quang, thắt lưng…): vòng từ yFrom tới yTo, nhô ra `out`
const band = (prof, yFrom, yTo, out = 0.006) => latheOf([[radiusAt(prof, yFrom) + out, yFrom], [radiusAt(prof, yTo) + out, yTo]]);
// Dải dán sát bề mặt thân tiện (khóa kéo, nẹp áo, ve áo, dây yếm…): góc a0 → a1 (rad, 0 = chính giữa trước, π = giữa lưng),
// a0 / a1 có thể là hàm theo độ cao y (ve áo vest chữ V, dây chéo); từ yFrom tới yTo, nhô ra khỏi thân `lift`
function frontStrip(prof, a0, a1, yFrom, yTo, lift = 0.004) {
  const A0 = typeof a0 === 'function' ? a0 : () => a0, A1 = typeof a1 === 'function' ? a1 : () => a1;
  const pos = [], cols = 2, rows = Math.max(1, Math.ceil((yTo - yFrom) / 0.03));
  const ring = (y, t) => { const r = radiusAt(prof, y) + lift, a = A0(y) + (A1(y) - A0(y)) * t; return [Math.sin(a) * r, y, Math.cos(a) * r * ZS]; };
  for (let i = 0; i < rows; i++) {
    const y0 = yFrom + ((yTo - yFrom) * i) / rows, y1 = yFrom + ((yTo - yFrom) * (i + 1)) / rows;
    for (let c = 0; c < cols; c++) {
      const A = ring(y0, c / cols), B = ring(y0, (c + 1) / cols), C = ring(y1, (c + 1) / cols), D = ring(y1, c / cols);
      pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

// ---------- đầu: cầu nắn thành sọ + hàm thon + gò má + gờ lông mày (tâm ở gốc) ----------
const HEAD = {};
function headGeo(f) {
  const k = `${f}${LITE}`;
  if (HEAD[k]) return HEAD[k];
  const R = 0.115, g = new THREE.SphereGeometry(R, segs(12), segs(10)), p = g.attributes.position;
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
  return (HEAD[k] = g);
}
// mũi: sống mũi + đầu mũi + 2 cánh; phần sau lún vào mặt
let NOSE = null;
const noseGeo = () => (NOSE ||= new ConvexGeometry([
  [0, 0.016, -0.012], [-0.006, 0.014, -0.004], [0.006, 0.014, -0.004],
  [0, -0.004, 0.012],
  [0, -0.03, 0.026], [-0.007, -0.033, 0.02], [0.007, -0.033, 0.02],
  [-0.017, -0.038, 0.004], [0.017, -0.038, 0.004],
  [0, -0.043, 0.012],
  [-0.015, -0.035, -0.014], [0.015, -0.035, -0.014], [0, 0.0, -0.016],
].map(([x, y, z]) => new THREE.Vector3(x, y, z))));
// chỏm tóc: cầu ôm sọ, mỗi cột kinh tuyến dừng đúng ở đường chân tóc (mép trơn, không răng cưa). Đường chân tóc
// (so với tâm chỏm, đặt ở đầu + 1,2 cm): front = trán · side = 2 bên tai · back = gáy (nội suy theo hướng quanh đầu)
function capGeo(r = 0.123, k = [0.91, 1.2, 1.02], front = 0.022, side = -0.028, back = -0.075) {
  const g = new THREE.SphereGeometry(1, segs(14), segs(7), 0, PI * 2, 0, PI * 0.999), p = g.attributes.position, uv = g.attributes.uv; // < π: hàng đáy đủ tam giác
  for (let i = 0; i < p.count; i++) {
    const v = 1 - uv.getY(i), phi = uv.getX(i) * PI * 2, c = Math.sin(phi); // c = 1: giữa trán · −1: gáy
    const yh = c > 0 ? side + (front - side) * c : side + (back - side) * -c;
    const th = v * Math.acos(Math.max(-1, Math.min(1, yh / (r * k[1])))); // góc từ đỉnh xuống, hàng cuối nằm trên chân tóc
    p.setXYZ(i, -Math.cos(phi) * Math.sin(th) * r * k[0], Math.cos(th) * r * k[1], Math.sin(phi) * Math.sin(th) * r * (c > 0 ? k[2] : k[3] ?? k[2])); // k[3]: độ sâu phía gáy (bỏ trống = như phía trán)
  }
  return g;
}
// mảng tóc rủ sau lưng: ống hở cung sau (cung ngoài + cung trong lật lại để nhìn từ trong cũng thấy)
// wave > 0: gợn sóng (tóc xoăn) — thêm vài hàng đỉnh rồi đẩy ra / vào theo hình sin
function backPanel(T, hair, hy, h, cy, r0 = 0.12, r1 = 0.128, arc = 0.9, wave = 0) {
  const a0 = PI * (1 - arc / 2); // giữa cung = phía sau (θ = π)
  const mk = (d) => {
    const g = new THREE.CylinderGeometry(r0 - d, r1 - d, h, segs(wave ? 16 : 12), wave ? segs(6) : 1, true, a0, PI * arc);
    if (wave) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + wave * Math.sin(Math.atan2(x, z) * 9) * Math.cos(y * 50);
        p.setXYZ(i, x * k, y, z * k);
      }
    }
    return g;
  };
  T.add(mk(0).scale(0.92, 1, 0.98), hair, 0, cy, -0.01);
  T.add(mk(0.004).scale(-0.92, 1, 0.98), hair, 0, cy, -0.012);
}

// ---------- KIỂU TÓC (16 kiểu: 8 nam · 8 nữ — danh sách ở sim/people.js) ----------
// hy: tâm đầu · covered: đang đội mũ bảo hiểm / mũ công an → bỏ mái, lọn đỉnh, hạt xoăn, búi cao (chỏm vẫn giữ, nằm trong mũ)
function addHair(T, style, hair, skin, hy, covered) {
  if (style === 'bald') return;
  const hi = shade(hair, 1.15), cap = (...a) => T.add(capGeo(...a), hair, 0, hy + 0.012, -0.012); // chỏm luôn có: đội mũ thì nằm gọn trong mũ, phần dưới vành vẫn thấy tóc
  // mái: lọn nhỏ dẹt rủ xéo ôm trán. lean(t): nghiêng mỗi lọn (t = −0,5 … 0,5 từ trái sang phải)
  const fringe = (n, lean, len = 0.055, lift = 0) => {
    if (covered) return;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5;
      T.add(cone(0.02, len + (1 - Math.abs(t) * 1.4) * 0.02).scale(1, 1, 0.45), i % 2 ? hair : hi, t * 0.15, hy + 0.07 + lift - Math.abs(t) * 0.035, 0.088 - Math.abs(t) * 0.03, 2.55, -t * 0.9, lean(t));
    }
  };
  // mái bằng: dải tóc cắt ngang trán (mái ngố / mái bằng)
  const bangs = (bottom) => !covered && T.add(new THREE.CylinderGeometry(0.094, 0.119, hy + 0.1 - bottom, 12, 1, true, -PI * 0.45, PI * 0.9).scale(0.86, 1, 1.03), hair, 0, (hy + 0.1 + bottom) / 2, -0.002);
  // lọn gáy rủ xuống + tóc mai (tóc ngắn nam)
  const nape = (n = 7, len = 0.08) => {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5, a = PI + t * 2.3, rr = 0.086 - Math.abs(t) * 0.01;
      T.add(cone(0.026, len).scale(1, 1, 0.45), i % 2 ? hair : shade(hair, 1.18), Math.sin(a) * rr, hy - 0.06 + Math.abs(t) * 0.035, Math.cos(a) * rr * 0.95 - 0.01, 0.18, -a, PI + t * 0.5);
    }
  };
  const sideburns = (c = hair) => { for (const s of [-1, 1]) T.add(cone(0.014, 0.05).scale(1, 1, 0.6), c, s * 0.094, hy - 0.006, 0.03, 0, 0, PI + s * 0.12); };
  const tufts = () => { if (!covered) for (const [x, z, rx] of [[-0.03, -0.02, -0.5], [0.03, -0.03, -0.6], [0, 0.02, -0.35]]) T.add(cone(0.03, 0.06).scale(1, 1, 0.5), hi, x, hy + 0.125, z, rx, 0, 0); };
  // lọn xoăn: hạt tròn nhỏ rải trên mặt cầu quanh đầu (từ góc ngẩng a0 xuống a1, chừa mặt trước)
  const curls = (n, r, rad, yTop, yBot, front = 0.55) => {
    if (covered) return; // đội mũ: hạt xoăn lòi ra dưới vành trông như bong bóng → chỉ để chỏm
    for (let i = 0; i < n; i++) {
      const u = (i * 0.618034) % 1, v = (i + 0.5) / n; // rải đều kiểu hoa hướng dương
      const y = yTop + (yBot - yTop) * v, ang = u * PI * 2;
      if (Math.cos(ang) > front && y < hy + 0.065) continue; // chừa mặt
      if (Math.cos(ang) > 0.1 && y < hy - 0.01) continue; // chừa má
      const rr = rad * Math.sqrt(Math.max(0.05, 1 - ((y - hy) / 0.16) ** 2) * (y < hy ? 0.9 : 1));
      T.add(new THREE.SphereGeometry(r * (0.85 + ((i * 7) % 5) * 0.06), 6, 4),i % 3 ? hair : hi, Math.sin(ang) * rr * 0.92, y, Math.cos(ang) * rr - 0.012);
    }
  };
  // đuôi tóc buộc: dây buộc + chùm tóc thuôn rủ xuống (từ điểm (y, z))
  // tilt: độ ngả ra sau lưng (rad) — đuôi rủ theo hướng (0, −cos tilt, −sin tilt), không đâm vào cổ
  const tail = (y, z, len, w = 0.04, tilt = 0.15) => {
    const dy = -Math.cos(tilt), dz = -Math.sin(tilt), at = (k) => [0, y + dy * len * k, z + dz * len * k];
    T.add(ball(w * 0.95), hair, 0, y, z + 0.012); // chùm tóc gom ở chỗ buộc
    T.add(new THREE.TorusGeometry(w * 0.72, 0.009, 4, 8), shade(hair, 0.55), ...at(0.06), PI / 2 + tilt, 0, 0); // dây buộc
    T.add(egg(w, len * 0.46, w * 0.85), hair, ...at(0.46), tilt, 0, 0);
    T.add(cone(w * 0.6, len * 0.18, 6), hi, ...at(0.94), PI + tilt, 0, 0); // ngọn đuôi
  };
  switch (style) {
    case 'part': // rẽ ngôi 7/3: đường ngôi lệch, 2 bên chải xuôi ra 2 phía, trán thoáng
      cap();
      if (!covered) {
        for (let i = 0; i < 7; i++) {
          const t = i / 6 - 0.5, x = t * 0.15, side = x < 0.03 ? -1 : 1;
          T.add(cone(0.02, 0.05).scale(1, 1, 0.42), i % 2 ? hair : hi, x, hy + 0.09 - Math.abs(t) * 0.035, 0.09 - Math.abs(t) * 0.032, 2.3, -t * 0.9, side * 0.75);
        }
      }
      nape(7, 0.07);
      sideburns();
      break;
    case 'undercut': { // two block: 2 bên + gáy cạo sát, phần trên dày rủ mái xuống trán
      T.add(capGeo(0.119, [0.86, 1.14, 1.0], 0.03, -0.03, -0.08), mix(hair, skin, 0.3), 0, hy + 0.008, -0.008);
      if (!covered) {
        T.add(capGeo(0.126, [0.9, 1.15, 1.03], 0.035, 0.022, -0.012), hair, 0, hy + 0.014, -0.01); // phần tóc dày trên đỉnh, phủ xuống ngang thái dương
        fringe(6, (t) => -0.15 - t * 0.2, 0.07, 0.006);
      }
      break;
    }
    case 'crop': { // ngắn tỉa lởm chởm (chủ game chọn theo ảnh mẫu): mái lòa xòa rủ trán, lọn trên đỉnh nằm xuôi chải về trước, 2 bên + gáy ngắn sát còn tóc
      const rnd = (a) => { const v = Math.sin(a * 12.9898) * 43758.5453; return v - Math.floor(v); };
      T.add(capGeo(0.119, [0.86, 1.14, 1.0], 0.03, -0.03, -0.08), mix(hair, skin, 0.18), 0, hy + 0.008, -0.008); // 2 bên + gáy ngắn sát
      if (covered) break;
      T.add(capGeo(0.121, [0.88, 1.15, 1.02, 0.98], 0.045, 0.02, -0.03), hair, 0, hy + 0.012, -0.012); // nền nhỏ (các lọn nhọn lộ ra ngoài)
      const cy = hy + 0.012, cz = -0.012, A = 0.108, B = 0.14, C = 0.124;
      // lọn nhọn cắm trên mặt đầu, hướng ra ngoài + ngả về trước (theo ảnh: tóc tỉa chỉa ra trước); đặt 1 lọn: hướng d → quay trục +y theo v
      const spike = (dx, dy, dz, len, r, fw, col, dir = null) => {
        let [vx, vy, vz] = dir || [dx, dy, dz + fw];
        const l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
        const px = dx * A, py = dy * B, pz = dz * C;
        T.add(cone(r, len).scale(1, 1, 0.5), col, px + vx * len * 0.35, cy + py + vy * len * 0.35, cz + pz + vz * len * 0.35, Math.atan2(vz, vy), 0, -Math.asin(Math.max(-1, Math.min(1, vx))));
      };
      for (let i = 0; i < 52; i++) {
        const th = Math.acos(1 - rnd(i * 2.1) * 0.78), ph = rnd(i * 5.7) * Math.PI * 2; // chỏm trên (từ đỉnh xuống ~70°)
        const dx = Math.sin(th) * Math.sin(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.cos(ph);
        if (dz < -0.7 && dy < 0.55) continue; // sau gáy thấp: ngắn sát
        // hướng lọn: nằm xuôi theo đầu, chải về phía trước (tiếp tuyến hướng trước) + hơi bật ra ngoài cho lởm chởm
        const f = dz, j = rnd(i * 9.1) - 0.5;
        let tx = -dx * f, ty = -dy * f, tz = 1 - dz * f;
        const tl = Math.hypot(tx, ty, tz) || 1;
        spike(dx * 0.97, dy * 0.97, dz * 0.97, 0.05 + rnd(i * 3.3) * 0.025, 0.032, 0, i % 3 ? hair : hi, [tx / tl + dx * 0.22 + j * 0.15, ty / tl + dy * 0.22, tz / tl + dz * 0.22]); // gọn: lọn ngắn, nằm sát đầu
      }
      // mái: lọn dài rủ xuống trán, lệch so le
      for (let i = 0; i < 10; i++) {
        const t = i / 9 - 0.5, j = rnd(i * 7.7) - 0.5, ang = t * 1.6;
        spike(Math.sin(ang) * 0.95, 0.5, Math.cos(ang) * 0.92, 0.07 + Math.abs(j) * 0.03 + (1 - Math.abs(t) * 1.5) * 0.015, 0.026, 0, i % 2 ? hair : hi,
          [Math.sin(ang) * 0.3 + j * 0.15, -1, 0.45]); // mọc ở mép tóc trước, rủ xuống trán
      }
      break;
    }
    case 'bowl': // mái ngố: mái bằng tới lông mày, ôm tròn ra sau như cái bát
      cap(0.125, [0.95, 1.18, 1.04], 0.03, -0.045, -0.085);
      bangs(hy + 0.044);
      if (!covered) for (const s of [-1, 1]) T.add(egg(0.022, 0.05, 0.05), hair, s * 0.096, hy + 0.01, 0.0);
      break;
    case 'buzz': // húi cua / đầu đinh: tóc lún phún sát da, đỉnh hơi phẳng
      T.add(capGeo(0.118, [0.87, 1.12, 1.18, 1.0], 0.035, -0.02, -0.07), mix(hair, skin, 0.12), 0, hy + 0.01, -0.008); // phía trước nhô hơn để phủ gờ lông mày
      break;
    case 'curly': // xoăn ngắn: chỏm + hạt xoăn dày khắp đầu
      cap(0.124, [0.92, 1.18, 1.03]);
      curls(46, 0.024, 0.106, hy + 0.15, hy - 0.04, 0.3);
      sideburns();
      break;
    case 'tied': // nam tóc dài buộc sau: chải ngược ra sau, buộc túm ở gáy
      cap(0.124, [0.92, 1.18, 1.04], 0.03, -0.03, -0.08);
      tail(hy - 0.02, -0.14, 0.17, 0.035, 0.2);
      sideburns();
      break;
    case 'long': // nữ dài thẳng: rẽ ngôi lệch, xõa qua vai
    case 'bangs': // mái bằng + tóc dài
    case 'shoulder': // ngang vai
    case 'curlyLong': { // xoăn dài
      cap(0.123, [0.87, 1.2, 1.02], 0.02, -0.035, -0.08);
      if (style === 'bangs') bangs(hy + 0.048);
      else fringe(7, (t) => 0.35 - t * 0.5);
      const h = style === 'shoulder' ? 0.2 : 0.3, cy = hy - (style === 'shoulder' ? 0.07 : 0.12);
      backPanel(T, hair, hy, h, cy, 0.13, style === 'shoulder' ? 0.14 : style === 'curlyLong' ? 0.145 : 0.134, 1.2, style === 'curlyLong' ? 0.07 : 0); // cung rộng: phủ qua tai, ôm 2 bên mặt
      if (style === 'curlyLong') curls(30, 0.026, 0.112, hy + 0.15, hy - 0.0, 0.3);
      break;
    }
    case 'bob': // bob ngắn ngang cằm, phồng tròn
      cap(0.125, [0.9, 1.18, 1.02], 0.03, -0.05, -0.09);
      fringe(7, (t) => 0.25 - t * 0.6, 0.06);
      backPanel(T, hair, hy, 0.15, hy - 0.06, 0.13, 0.14, 1.15);
      break;
    case 'ponytail': // đuôi ngựa cột cao
      cap(0.123, [0.87, 1.2, 1.02], 0.03, -0.03, -0.08);
      fringe(5, (t) => 0.5 - t * 0.4, 0.045, 0.01);
      tail(covered ? hy - 0.03 : hy + 0.035, covered ? -0.135 : -0.138, 0.26, 0.04, covered ? 0.15 : 0.2);
      break;
    case 'bun': // búi cao (đội mũ bảo hiểm → búi thấp sau gáy)
      cap(0.123, [0.87, 1.2, 1.02], 0.03, -0.03, -0.08);
      fringe(5, (t) => 0.45 - t * 0.4, 0.045, 0.01);
      if (covered) T.add(ball(0.046), hair, 0, hy - 0.115, -0.1); // búi thấp sát gáy, dưới mép mũ (kể cả fullface)
      else {
        T.add(ball(0.055), hair, 0, hy + 0.13, -0.075);
        T.add(new THREE.TorusGeometry(0.035, 0.008, 4, 8), shade(hair, 0.6), 0, hy + 0.105, -0.065, PI / 2 + 0.6, 0, 0);
      }
      break;
    case 'braids': // hai bím tết: rẽ ngôi giữa, 2 bím thả trước vai
      cap(0.123, [0.87, 1.2, 1.02], 0.02, -0.035, -0.08);
      fringe(6, (t) => (t < 0 ? 0.7 : -0.7), 0.05);
      for (const s of [-1, 1]) {
        const N = 8, pos = (i) => [s * (0.095 + Math.min(i, 3) * 0.012), hy - 0.05 - i * 0.04, -0.03 + 0.11 * Math.sin(Math.min(1, i / 4) * PI / 2) + Math.max(0, i - 4) * 0.008];
        for (let i = 0; i < N; i++) {
          const [x, y, z] = pos(i);
          T.add(egg(0.026 - (i / N) * 0.007, 0.03, 0.024, 7, 5), i % 2 ? hair : hi, x, y, z, 0.35 * Math.min(1, i / 4), 0, s * 0.25 * (i % 2 ? 1 : -1));
        }
        const [x, y, z] = pos(N);
        T.add(new THREE.TorusGeometry(0.014, 0.006, 4, 6), 0xd94a6b, x, y + 0.012, z, PI / 2 - 0.3, 0, 0);
        T.add(cone(0.016, 0.045, 5), hi, x, y - 0.012, z + 0.004, PI - 0.3, 0, 0);
      }
      break;
    default: // 'short' — nam ngắn vuốt lệch
      cap();
      fringe(7, (t) => -0.3 - t * 0.3);
      nape();
      sideburns();
      tufts();
  }
}

// ---------- mũ / phụ kiện đầu ----------
function addHat(T, o, hy) {
  const { hat, hatColor, helmetStyle } = o;
  if (hat === 'helmet' && (helmetStyle === 'full' || helmetStyle === 'race')) {
    const race = helmetStyle === 'race'; // nón đua: kính khói đen hơn, sọc trắng giữa đỉnh, cánh gió sau gáy
    T.add(new THREE.SphereGeometry(0.148, 12, 7, 0, PI * 2, 0, PI * 0.74).scale(0.94, 1.08, 1.08), hatColor, 0, hy + 0.012, -0.005);
    T.add(new THREE.SphereGeometry(0.15, 10, 3, PI * 0.2, PI * 0.6, PI * 0.42, PI * 0.2).scale(0.95, 1.08, 1.1), race ? 0x10151b : 0x24313d, 0, hy + 0.012, -0.004); // kính tối
    if (race) {
      for (const p0 of [PI / 2, -PI / 2]) T.add(new THREE.SphereGeometry(0.1505, 3, 6, p0 - 0.07, 0.14, 0, PI * (p0 > 0 ? 0.36 : 0.6)).scale(0.94, 1.08, 1.08), 0xf2f2f2, 0, hy + 0.012, -0.005); // sọc trắng dọc đỉnh (trước trán → sau gáy)
      T.add(new THREE.BoxGeometry(0.12, 0.016, 0.05), shade(hatColor, 1.4), 0, hy + 0.12, -0.15, 0.5, 0, 0); // cánh gió
    }
    T.add(new THREE.SphereGeometry(0.153, 10, 1, PI * 0.18, PI * 0.64, PI * 0.4, PI * 0.025).scale(0.95, 1.08, 1.1), shade(hatColor, 0.7), 0, hy + 0.012, -0.004); // gờ trên kính
    // phần che cằm: cung tròn ôm trước cằm, nhô ra trước (dáng fullface)
    const arc = PI * 0.62;
    T.add(new THREE.TorusGeometry(0.118, 0.034, 5, 10, arc).rotateX(PI / 2).rotateY(arc / 2 - PI / 2).scale(0.92, 1.25, 1.12), hatColor, 0, hy - 0.088, 0.0);
    T.add(new THREE.BoxGeometry(0.05, 0.02, 0.012), 0x1b1b1b, 0, hy - 0.075, 0.165); // khe thông gió cằm
  } else if (hat === 'helmet' && helmetStyle === 'open') {
    // mũ 3/4 (mũ CSGT): chỏm + vạt che 2 bên tai và gáy, hở mặt; lưỡi trai ngắn; chữ CSGT xanh đậm trước mũ
    T.add(new THREE.SphereGeometry(0.14, 12, 5, 0, PI * 2, 0, PI / 2).scale(0.95, 1, 1.06), hatColor, 0, hy + 0.035, -0.006);
    T.add(new THREE.CylinderGeometry(0.14, 0.142, 0.11, 12, 1, true, PI * 0.3, PI * 1.4).scale(0.95, 1, 1.06), hatColor, 0, hy - 0.02, -0.006);
    T.add(new THREE.CylinderGeometry(0.144, 0.144, 0.014, 12, 1, true, PI * 0.3, PI * 1.4).scale(0.95, 1, 1.06), shade(hatColor, 0.72), 0, hy - 0.07, -0.006); // viền vạt
    T.add(new THREE.TorusGeometry(0.14, 0.009, 4, 14).rotateX(PI / 2).scale(0.95, 1, 1.06), shade(hatColor, 0.72), 0, hy + 0.035, -0.006);
    T.add(new THREE.SphereGeometry(0.152, 10, 2, PI * 0.25, PI * 0.5, PI * 0.47, PI * 0.06).scale(0.95, 1, 1.1), shade(hatColor, 0.72), 0, hy + 0.055, -0.006); // lưỡi trai ngắn
    [...'CSGT'].forEach((ch, i) => glyph(T, ch, (i - 1.5) * 0.024, hy + 0.088, 0.128, 0.022, 0x1d3f8f));
    for (const s of [-1, 1]) T.add(new THREE.BoxGeometry(0.007, 0.1, 0.007), 0x222222, s * 0.08, hy - 0.08, 0.03, -0.3, 0, -s * 0.3); // quai
    T.add(new THREE.BoxGeometry(0.05, 0.007, 0.03), 0x222222, 0, hy - 0.128, 0.048);
  } else if (hat === 'helmet') {
    T.add(new THREE.SphereGeometry(0.138, 12, 5, 0, PI * 2, 0, PI / 2).scale(0.94, 0.98, 1.06), hatColor, 0, hy + 0.035, -0.006);
    T.add(new THREE.TorusGeometry(0.138, 0.01, 4, 14).rotateX(PI / 2).scale(0.94, 1, 1.06), shade(hatColor, 0.75), 0, hy + 0.035, -0.006);
    T.add(new THREE.SphereGeometry(0.15, 10, 2, PI * 0.2, PI * 0.6, PI * 0.47, PI * 0.06).scale(0.94, 1, 1.12), shade(hatColor, 0.75), 0, hy + 0.06, -0.006); // lưỡi trai
    for (const s of [-1, 1]) T.add(new THREE.BoxGeometry(0.007, 0.14, 0.007), 0x222222, s * 0.077, hy - 0.06, 0.028, -0.3, 0, -s * 0.38); // quai: trước tai ôm quai hàm xuống cằm
    T.add(new THREE.BoxGeometry(0.05, 0.007, 0.03), 0x222222, 0, hy - 0.128, 0.048); // khóa quai dưới cằm
  } else if (hat === 'nonla') {
    T.add(new THREE.ConeGeometry(0.33, 0.21, 16), 0xe8d6a0, 0, hy + 0.17, 0);
    for (const s of [-1, 1]) T.add(new THREE.BoxGeometry(0.006, 0.15, 0.006), 0xc0392b, s * 0.076, hy - 0.062, 0.03, -0.35, 0, -s * 0.4); // quai ôm theo quai hàm, chụm dưới cằm
  } else if (hat === 'cap') {
    // mũ lưỡi trai: chỏm ôm đầu + lưỡi trai cong xuống phía trước + nút trên đỉnh
    T.add(new THREE.SphereGeometry(0.13, 12, 5, 0, PI * 2, 0, PI / 2).scale(0.92, 0.82, 1.03), hatColor, 0, hy + 0.04, -0.008);
    T.add(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 12, 1, false, -PI / 2, PI).scale(0.85, 1, 1.3), shade(hatColor, 0.85), 0, hy + 0.045, 0.06, 0.18, 0, 0); // lưỡi trai dài ra trước
    T.add(ball(0.012), shade(hatColor, 0.8), 0, hy + 0.147, -0.008);
  } else if (hat === 'police') {
    T.add(new THREE.CylinderGeometry(0.118, 0.112, 0.07, 12), 0x2e5d3a, 0, hy + 0.1, 0);
    T.add(new THREE.CylinderGeometry(0.145, 0.128, 0.04, 12).scale(1, 1, 1.1), 0x2e5d3a, 0, hy + 0.15, -0.01, -0.1, 0, 0);
    T.add(new THREE.CylinderGeometry(0.12, 0.12, 0.025, 12), 0xc0392b, 0, hy + 0.08, 0);
    T.add(new THREE.SphereGeometry(0.13, 10, 2, PI * 0.2, PI * 0.6, PI * 0.47, PI * 0.06).scale(1, 1, 1.15), 0x111111, 0, hy + 0.09, 0); // lưỡi trai
    T.add(new THREE.BoxGeometry(0.04, 0.04, 0.01), 0xf1c40f, 0, hy + 0.13, 0.127);
  }
  if (o.face === 'glasses') {
    for (const s of [-1, 1]) {
      T.add(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 10).rotateX(PI / 2).scale(1.15, 0.85, 1), o.faceColor, s * 0.04, hy + 0.014, 0.12);
      T.add(new THREE.BoxGeometry(0.005, 0.005, 0.1), o.faceColor, s * 0.088, hy + 0.02, 0.07, 0, -s * 0.12, 0);
    }
    T.add(new THREE.BoxGeometry(0.03, 0.005, 0.006), o.faceColor, 0, hy + 0.022, 0.122);
  } else if (GLASSES[o.face]) addGlasses(T, o.face, o.faceColor, hy);
  else if (o.face === 'mask') {
    const mk = (r0, r1, h, y, c) => T.add(new THREE.CylinderGeometry(r0, r1, h, 12, 1, true, -PI * 0.4, PI * 0.8).scale(0.98, 1, 1.46), c, 0, y, 0.0); // nhô ra trước che kín mũi
    mk(0.095, 0.082, 0.07, hy - 0.045, o.faceColor); // che mũi → cằm
    for (const dy of [-0.012, 0.012]) mk(0.094 - dy * 0.2 + 0.002, 0.094 - dy * 0.2 + 0.001, 0.004, hy - 0.045 + dy, shade(o.faceColor, 0.82)); // nếp gấp
    for (const s of [-1, 1]) T.add(new THREE.BoxGeometry(0.004, 0.004, 0.075), shade(o.faceColor, 0.9), s * 0.09, hy - 0.025, 0.005, 0.35, 0, 0); // quai móc tai
  }
}

// ---------- KÍNH CÓ GỌNG (mắt kính trong, chỉ dựng gọng — thấy mắt) ----------
// roundBig: gọng tròn to mảnh · roundThick: tròn gọng dày · squareBig: vuông to · aviator: phi công (2 cầu mũi) · browline: gọng mày (trên dày, dưới mảnh)
const GLASSES = { roundBig: 1, roundThick: 1, squareBig: 1, aviator: 1, browline: 1 };
function addGlasses(T, style, c, hy) {
  const y = hy + 0.012, z = 0.121, ex = 0.041; // tâm 2 mắt
  let outer = 0.072;
  for (const s of [-1, 1]) {
    const x = s * ex;
    if (style === 'roundBig' || style === 'roundThick') {
      T.add(new THREE.TorusGeometry(0.03, style === 'roundThick' ? 0.0065 : 0.0034, 4, 18), c, x, y, z);
      outer = 0.074;
    } else if (style === 'aviator') {
      T.add(new THREE.TorusGeometry(0.031, 0.003, 4, 18).scale(1.05, 0.88, 1), c, x, y - 0.004, z, 0, 0, s * 0.18);
      outer = 0.076;
    } else if (style === 'squareBig') {
      const w = 0.064, h = 0.047, t = 0.006;
      T.add(new THREE.BoxGeometry(w, t, t), c, x, y + h / 2, z);
      T.add(new THREE.BoxGeometry(w, t, t), c, x, y - h / 2, z);
      for (const k of [-1, 1]) T.add(new THREE.BoxGeometry(t, h + t, t), c, x + (k * w) / 2, y, z);
      outer = ex + w / 2;
    } else if (style === 'browline') {
      T.add(new THREE.BoxGeometry(0.062, 0.011, 0.008), c, x, y + 0.02, z + 0.001); // gọng trên dày
      T.add(new THREE.TorusGeometry(0.029, 0.0025, 4, 16, PI).rotateZ(PI), 0xc9c9c9, x, y + 0.004, z); // vành dưới mảnh
      outer = 0.072;
    }
    // càng kính: từ mép ngoài gọng chạy ra sau tai
    T.add(new THREE.BoxGeometry(0.004, 0.004, 0.11), c, s * (outer + 0.012), y + 0.006, z - 0.055, 0, -s * 0.16, 0);
  }
  // cầu mũi
  if (style === 'aviator') for (const dy of [0.004, 0.026]) T.add(new THREE.BoxGeometry(0.024, 0.003, 0.004), c, 0, y + dy, z + 0.002);
  else T.add(new THREE.TorusGeometry(0.011, style === 'roundThick' || style === 'squareBig' ? 0.004 : 0.0028, 4, 8, PI), c, 0, y + 0.004, z + 0.002);
}

// ---------- THÂN + ĐẦU + mọi thứ gắn cố định ----------
const cache = new Map();
function cached(key, fn) {
  if (LITE) key = 'L' + key; // bản đơn giản cất riêng
  let g = cache.get(key);
  if (!g) {
    g = fn();
    if (cache.size < 800) cache.set(key, g);
  }
  return g;
}
const PANTS_M = [[0.02, 0.035], [0.105, 0.065], [0.138, 0.12], [0.132, 0.17]];
const PANTS_F = [[0.02, 0.035], [0.11, 0.065], [0.142, 0.12], [0.135, 0.17]];
const SHIRT_M = [[0.13, 0.15], [0.136, 0.24], [0.15, 0.35], [0.168, 0.45], [0.178, 0.54], [0.18, 0.6], [0.15, 0.632], [0.095, 0.652], [0.052, 0.662]];
const SHIRT_F = [[0.132, 0.15], [0.12, 0.25], [0.142, 0.37], [0.156, 0.46], [0.162, 0.55], [0.162, 0.6], [0.135, 0.63], [0.085, 0.65], [0.05, 0.66]];
const at = (prof) => prof.map(([r, y]) => [r, y + Y0]); // mặt cắt theo độ cao thật
// đoạn mặt cắt từ y0 tới y1 (thêm 2 điểm nội suy ở 2 đầu) — để tô một khúc thân khác màu (croptop, hai dây…)
function sub(prof, y0, y1) {
  return [[radiusAt(prof, y0), y0], ...prof.filter(([, y]) => y > y0 + 1e-4 && y < y1 - 1e-4), [radiusAt(prof, y1), y1]];
}

// ---------- KIỂU ÁO / QUẦN / GIÀY (danh sách + tên ở data/goods.js OUTFIT_SLOTS) ----------
const SLEEVE = { short: 'short', polo: 'short', soccer: 'short', vnteam: 'short', printed: 'short', croptop: 'short', gile: 'short', dress: 'short', overalls: 'short', tank: 'none', halter: 'none' }; // còn lại: tay dài
const OPEN = { zip: 1, denim: 1, biker: 1, blazer: 1 }; // áo khoác mở: lộ áo trong (màu phụ)
const LONG_HEM = { zip: 1, denim: 1, biker: 1, blazer: 1, baba: 1, hoodie: 1, racing: 1 }; // áo dài qua hông, che thắt lưng
const SKIRTS = { skirt: [0.15, 0.25, 0.46], flare: [0.15, 0.3, 0.36], pencil: [0.145, 0.152, 0.44], dress: [0.15, 0.27, 0.44] }; // bán kính trên, dưới, dài
const LEGS = (ps) => (SKIRTS[ps] ? 'bare' : ps === 'shorts' || ps === 'boxer' || ps === 'capri' ? ps : 'long');
const BARE_FOOT = { sandal: 1, slide: 1, strap: 1, flipflop: 1 };
const LIGHT = 0xe6ecef;

// Chữ khối 7 nét (số áo đá banh, chữ in trên áo): đặt trên mặt phẳng đứng ở (x, y, z), cao h; back = mặt sau (lật trái phải)
const SEGS = { 0: 'abcdef', 1: 'i', S: 'afgcd', G: 'afedc', I: 'i', C: 'afed', T: 'ai', A: 'abcefg', E: 'adefg', R: 'abefg' }; // 1, I: 1 nét đứng giữa · T: gạch trên + nét giữa · R: như P + chân chéo
function glyph(T, ch, x, y, z, h, color, back = false) {
  const w = h * 0.55, t = h * 0.17, d = 0.005, sx = back ? -1 : 1;
  const seg = { a: [0, h / 2, w, t], d: [0, -h / 2, w, t], g: [0, 0, w, t], b: [w / 2, h / 4, t, h / 2], c: [w / 2, -h / 4, t, h / 2], e: [-w / 2, -h / 4, t, h / 2], f: [-w / 2, h / 4, t, h / 2], i: [0, 0, t, h] };
  for (const k of SEGS[ch] || '') {
    const [cx, cy, sw, sh] = seg[k];
    T.add(new THREE.BoxGeometry(sw, sh, d), color, x + cx * sx, y + cy, z);
  }
  if (ch === 'G') T.add(new THREE.BoxGeometry(w / 2, t, d), color, x + (w / 4) * sx, y, z); // nét ngang nửa phải của chữ G
  if (ch === 'R') T.add(new THREE.BoxGeometry(t, h * 0.58, d), color, x + (w / 4) * sx, y - h / 4, z, 0, 0, 0.5 * sx); // chân chéo chữ R
}
const starGeo = (r) => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = PI / 2 + (i * PI) / 5, rr = i % 2 ? r * 0.42 : r;
    s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new THREE.ShapeGeometry(s);
};
const heartGeo = (r) => {
  const s = new THREE.Shape();
  s.moveTo(0, -r);
  s.bezierCurveTo(-r * 1.6, r * 0.1, -r * 0.6, r * 1.2, 0, r * 0.45);
  s.bezierCurveTo(r * 0.6, r * 1.2, r * 1.6, r * 0.1, 0, -r);
  return new THREE.ShapeGeometry(s, 4);
};

// Dây vai (ba lỗ, hai dây, yếm): dải chạy dọc thân rồi vắt qua ĐỈNH VAI, cách giữa người X (m), bản rộng 2w.
// Góc quanh thân tính theo bán kính từng độ cao (asin(x / r)) → càng lên gần vai dải càng xoay ra 2 bên, gặp nhau trên đỉnh vai.
function strap(T, prof, X, w, yFrom, color, front = true, back = true) {
  let yTop = yFrom;
  while (yTop < prof[prof.length - 1][1] && radiusAt(prof, yTop + 0.002) > X + w + 0.002) yTop += 0.002; // chỗ thân còn đủ rộng
  const A = (x) => (y) => Math.asin(Math.min(0.999, x / radiusAt(prof, y)));
  const a0 = A(X - w), a1 = A(X + w);
  for (const s of [-1, 1]) {
    if (front) T.add(frontStrip(prof, s > 0 ? a0 : (y) => -a1(y), s > 0 ? a1 : (y) => -a0(y), yFrom, yTop, 0.004), color);
    if (back) T.add(frontStrip(prof, s > 0 ? (y) => PI - a1(y) : (y) => -PI + a0(y), s > 0 ? (y) => PI - a0(y) : (y) => -PI + a1(y), yFrom, yTop, 0.004), color);
  }
}
// Tà áo dài (trước / sau): tiện một cung quanh eo — trên ôm sát thân áo (cùng mặt cắt, không hở), dưới xòe nhẹ tới mắt cá.
// Tâm cung: trước 0 / sau π; y tính từ eo (Y0 + 0.17) xuống.
function taLathe(f, front) {
  const shirtP = at(f ? SHIRT_F : SHIRT_M), top = 0.08, r0 = radiusAt(shirtP, Y0 + 0.17 + top) + 0.003;
  const pts = [[0.19, -0.76], [0.165, -0.3], [r0 + 0.012, -0.03], [r0, top]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segs(10), front ? -PI * 0.3 : PI * 0.7, PI * 0.6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (top - p.getY(i)) / (top + 0.76))); // 0 ở trên → 1 ở dưới
    p.setZ(i, p.getZ(i) * (ZS + (0.86 - ZS) * t)); // trên dẹt như thân, dưới tròn dần
  }
  return g;
}
// Áo mưa dài: vạt dưới từ hông xuống mắt cá, chừa 1 khe phía trước để chân bước / ngồi xe
// front: vạt trước che khe (khối riêng theo chân như tà áo dài)
function coatLathe(f, front = false) {
  const pantsP = at(f ? PANTS_F : PANTS_M), r0 = radiusAt(pantsP, Y0 + 0.13) + 0.012;
  const pts = [[0.2, -0.74], [0.18, -0.35], [r0 + 0.01, -0.06], [r0, 0.02]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = front ? new THREE.LatheGeometry(pts, 3, -PI * 0.13, PI * 0.26) : new THREE.LatheGeometry(pts, segs(14), PI * 0.12, PI * 1.76), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (0.02 - p.getY(i)) / 0.76));
    p.setZ(i, p.getZ(i) * (ZS + (0.9 - ZS) * t));
  }
  return g;
}

function torsoGeo(o) {
  return cached('t' + JSON.stringify(o), () => {
    const f = o.female, T = new Parts(), hy = HEAD_Y - 0.005, st = o.shirtStyle, ps = o.pantsStyle;
    const shirtP = at(f ? SHIRT_F : SHIRT_M), pantsP = at(f ? PANTS_F : PANTS_M);
    const c2 = o.shirt2 ?? (st === 'printed' || st === 'soccer' ? 0x222222 : 0xffffff); // màu phụ của áo (mặc định: áo trong trắng, chữ đen)
    const fz = (y, out = 0.004) => radiusAt(shirtP, y) * ZS + out; // mặt trước ngực ở độ cao y
    const Y = (k) => Y0 + k; // độ cao theo mặt cắt thân
    const zip = o.overlay === 'jacket' || o.overlay === 'raincoat' || o.uniform != null; // áo khoác chống nắng / áo mưa / đồng phục: kéo khóa kín
    const skirt = SKIRTS[ps];
    // ---- quần (đáy quần) ----
    T.add(latheOf(f ? PANTS_F : PANTS_M), skirt ? o.skin : o.pants, 0, Y0, 0);
    // ---- thân áo ----
    const bodyColor = st === 'overalls' ? c2 : o.shirt; // yếm: thân là áo thun bên trong
    if (st === 'croptop') {
      T.add(latheOf(sub(shirtP, Y(0.15), Y(0.32))), o.skin); // hở eo
      T.add(latheOf(sub(shirtP, Y(0.32), Y(0.662))), o.shirt);
      T.add(band(shirtP, Y(0.32), Y(0.34), 0.003), shade(o.shirt, 0.82));
    } else if (st === 'tank') {
      // ba lỗ: thân áo tới ngang nách, trên là da + 2 dây vai bản to (trước + sau)
      T.add(latheOf(sub(shirtP, Y(0.15), Y(0.57))), o.shirt);
      T.add(latheOf(sub(shirtP, Y(0.57), Y(0.662))), o.skin);
      strap(T, shirtP, f ? 0.09 : 0.1, 0.03, Y(0.555), o.shirt);
      T.add(band(shirtP, Y(0.555), Y(0.575), 0.004), shade(o.shirt, 0.88)); // viền nách / cổ
    } else if (st === 'halter') {
      T.add(latheOf(sub(shirtP, Y(0.15), Y(0.5))), o.shirt);
      T.add(latheOf(sub(shirtP, Y(0.5), Y(0.662))), o.skin);
      strap(T, shirtP, 0.085, 0.009, Y(0.49), o.shirt); // 2 dây mảnh vắt qua vai
    } else T.add(latheOf(f ? SHIRT_F : SHIRT_M, OPEN[st] ? 1.025 : 1), bodyColor, 0, Y0, 0);
    // áo dài qua hông (áo khoác, bà ba, hoodie, áo khoác chống nắng, đồng phục)
    const hem = zip || LONG_HEM[st];
    let hemP = null;
    if (hem) {
      hemP = [[radiusAt(pantsP, Y(0.08)) + 0.014, Y(0.08)], [radiusAt(pantsP, Y(0.13)) + 0.012, Y(0.13)], [radiusAt(shirtP, Y(0.18)) + 0.004, Y(0.18)]];
      T.add(latheOf(hemP), o.shirt);
      T.add(latheOf([[hemP[0][0] + 0.002, Y(0.08)], [hemP[0][0] + 0.001, Y(0.1)]]), shade(o.shirt, 0.8));
    } else if (!skirt && st !== 'dress' && st !== 'aodai' && st !== 'pajama' && st !== 'police') T.add(band(shirtP, Y(0.15), Y(0.175), 0.004), st === 'overalls' ? o.shirt : 0x2a211b); // thắt lưng (yếm: lưng quần yếm)
    const fullP = hemP ? [...hemP, ...shirtP.filter(([, y]) => y > Y(0.18))] : shirtP;
    // ---- cổ áo + chi tiết từng kiểu ----
    const teeNeck = () => T.add(new THREE.CylinderGeometry(0.052, 0.056, 0.016, SEG, 1, true), shade(bodyColor, 0.82), 0, Y(0.658), -0.004);
    const shirtCollar = (c) => {
      T.add(new THREE.CylinderGeometry(0.056, 0.062, 0.03, SEG, 1, true), c, 0, Y(0.668), -0.004); // cổ đứng
      for (const s of [-1, 1]) T.add(new THREE.BoxGeometry(0.045, 0.006, 0.04), c, s * 0.03, Y(0.656), 0.05, -0.5, s * 0.6, s * 0.35); // 2 vạt cổ bẻ
    };
    const buttons = (c, y0, y1, n, z = 0) => { for (let i = 0; i < n; i++) { const y = y0 + ((y1 - y0) * i) / Math.max(1, n - 1); T.add(new THREE.BoxGeometry(0.01, 0.01, 0.004), c, 0, y, fz(y, 0.006) + z); } };
    const placket = (c, y0, y1) => T.add(frontStrip(fullP, -0.022, 0.022, y0, y1, 0.005), c);
    const hood = (c) => {
      T.add(egg(0.11, 0.08, 0.06), shade(c, 0.95), 0, 1.395, -0.135, 0.45, 0, 0);
      T.add(egg(0.08, 0.055, 0.022), shade(c, 0.7), 0, 1.42, -0.11, 0.9, 0, 0);
    };
    if (zip) {
      T.add(frontStrip(fullP, -0.035, 0.035, Y(0.08), Y(0.6), 0.005), 0x2a2a2a); // khóa kéo
      T.add(new THREE.CylinderGeometry(0.062, 0.074, 0.05, SEG, 1, true), shade(o.shirt, 0.85), 0, Y(0.67), -0.004); // cổ áo dựng
    } else if (OPEN[st]) {
      // áo khoác mở: áo trong lộ giữa 2 vạt
      const k = 1.025, jacketP = fullP.map(([r, y]) => [y > Y(0.18) ? r * k : r, y]);
      if (st === 'blazer') {
        // vest: chữ V lộ sơ mi trắng + cà vạt, 2 ve áo, 2 nút
        const half = (y) => 0.05 + Math.max(0, (y - Y(0.32)) / 0.32) * 0.32;
        T.add(frontStrip(jacketP, (y) => -half(y), half, Y(0.32), Y(0.64), 0.006), c2);
        T.add(frontStrip(jacketP, -0.03, 0.03, Y(0.36), Y(0.62), 0.009), 0x8b1e2d); // cà vạt
        for (const s of [-1, 1]) T.add(frontStrip(jacketP, (y) => s * half(y), (y) => s * (half(y) + 0.09), Y(0.4), Y(0.64), 0.009), shade(o.shirt, 0.82)); // ve áo
        buttons(0x1b1b1b, Y(0.24), Y(0.3), 2, 0.004);
        shirtCollar(c2);
      } else {
        const a0 = st === 'biker' ? -0.1 : -0.3, a1 = st === 'biker' ? 0.38 : 0.3;
        T.add(frontStrip(jacketP, a0, a1, Y(0.1), Y(0.6), 0.006), c2);
        if (st !== 'denim') for (const a of [a0, a1]) T.add(frontStrip(jacketP, a - 0.03, a + 0.03, Y(0.1), Y(0.6), 0.008), st === 'biker' ? 0x9aa0a6 : 0x262626); // khóa kéo 2 vạt
        else buttons(0xc7a96b, Y(0.22), Y(0.56), 4, 0.004); // áo khoác jean: nút đồng
        T.add(new THREE.CylinderGeometry(0.066, 0.08, 0.05, SEG, 1, true).scale(1, 1, 0.92), o.shirt, 0, Y(0.672), -0.006); // cổ áo
        if (st === 'denim') for (const s of [-1, 1]) T.add(new THREE.BoxGeometry(0.05, 0.035, 0.008), shade(o.shirt, 0.85), s * 0.085, Y(0.5), fz(Y(0.5), 0.02)); // 2 túi ngực có nắp
        if (st === 'biker') for (const s of [-1, 1]) T.add(new THREE.BoxGeometry(0.05, 0.11, 0.008), shade(o.shirt, 1.25), s * 0.07, Y(0.6), fz(Y(0.6), 0.02), 0.2, 0, s * 0.5); // ve áo da
        if (st !== 'biker') teeNeck();
      }
    } else if (st === 'racing') {
      // áo da đua: kín, cổ đứng viền trắng, khóa kéo lệch, ốp vai, sọc trắng 2 bên sườn + chữ RACE trắng trên ngực
      T.add(frontStrip(fullP, 0.12, 0.17, Y(0.1), Y(0.62), 0.006), 0x3a3a3a);
      T.add(new THREE.CylinderGeometry(0.058, 0.07, 0.045, SEG, 1, true), shade(o.shirt, 1.2), 0, Y(0.672), -0.004);
      T.add(new THREE.CylinderGeometry(0.0585, 0.0705, 0.008, SEG, 1, true), c2, 0, Y(0.65), -0.004);
      for (const s of [-1, 1]) T.add(frontStrip(fullP, s * 1.45 - 0.06, s * 1.45 + 0.06, Y(0.12), Y(0.58), 0.004), c2);
      const y = Y(0.52), z = fz(y, 0.006);
      [...'RACE'].forEach((ch, i) => glyph(T, ch, -0.115 + i * 0.03, y, z, 0.026, c2));
      for (const s of [-1, 1]) T.add(egg(0.07, 0.03, 0.06), shade(o.shirt, 1.3), s * 0.15, Y(0.635), 0, 0, 0, -s * 0.45);
    } else if (st === 'hoodie') {
      teeNeck();
      hood(o.shirt);
      T.add(frontStrip(fullP, -0.55, 0.55, Y(0.17), Y(0.33), 0.007), shade(o.shirt, 0.88)); // túi kangaroo
      for (const s of [-1, 1]) T.add(new THREE.BoxGeometry(0.006, 0.11, 0.006), c2, s * 0.03, Y(0.6), fz(Y(0.6), 0.012)); // dây mũ
    } else if (st === 'shirt' || st === 'plaid' || st === 'pajama') {
      shirtCollar(st === 'pajama' ? shade(o.shirt, 0.9) : o.shirt);
      placket(shade(o.shirt, 0.92), Y(0.16), Y(0.64));
      buttons(0xf2f2f2, Y(0.2), Y(0.6), 5);
      if (st !== 'pajama') T.add(new THREE.BoxGeometry(0.045, 0.05, 0.006), shade(o.shirt, 0.9), 0.075, Y(0.5), fz(Y(0.5), 0.004)); // túi ngực
      if (st === 'plaid') {
        for (const y of [0.22, 0.31, 0.4, 0.49, 0.58]) T.add(band(shirtP, Y(y), Y(y + 0.018), 0.003), c2);
        for (let i = 0; i < 8; i++) T.add(frontStrip(shirtP, (i * PI) / 4 - 0.035, (i * PI) / 4 + 0.035, Y(0.15), Y(0.63), 0.003), c2);
      }
      if (st === 'pajama') for (const y of [0.2, 0.28, 0.36, 0.44, 0.52]) T.add(band(shirtP, Y(y), Y(y + 0.02), 0.003), c2);
    } else if (st === 'police') {
      shirtCollar(o.shirt);
      placket(shade(o.shirt, 0.9), Y(0.17), Y(0.64));
      buttons(0xc7a96b, Y(0.22), Y(0.6), 5);
      for (const s of [-1, 1]) {
        T.add(new THREE.BoxGeometry(0.055, 0.06, 0.008), shade(o.shirt, 0.92), s * 0.075, Y(0.47), fz(Y(0.47), 0.006)); // túi ngực
        T.add(new THREE.BoxGeometry(0.058, 0.018, 0.012), shade(o.shirt, 0.85), s * 0.075, Y(0.505), fz(Y(0.505), 0.008)); // nắp túi
        // cầu vai đỏ có sọc vàng nằm trên đỉnh vai
        T.add(new THREE.BoxGeometry(0.075, 0.012, 0.06), 0xc0392b, s * 0.125, Y(0.632), 0, 0, 0, -s * 0.42);
        T.add(new THREE.BoxGeometry(0.075, 0.014, 0.012), 0xf1c40f, s * 0.125, Y(0.633), 0, 0, 0, -s * 0.42);
      }
      T.add(new THREE.BoxGeometry(0.045, 0.012, 0.006), 0xf4f4f4, 0.075, Y(0.535), fz(Y(0.535), 0.01)); // bảng tên (ngực phải)
      T.add(new THREE.BoxGeometry(0.03, 0.03, 0.006), 0xf1c40f, -0.075, Y(0.545), fz(Y(0.545), 0.01)); // phù hiệu (ngực trái)
      T.add(band(shirtP, Y(0.14), Y(0.185), 0.006), 0x1b1b1b); // thắt lưng da to
      T.add(new THREE.BoxGeometry(0.045, 0.035, 0.012), 0xc7a96b, 0, Y(0.162), fz(Y(0.162), 0.012)); // khóa thắt lưng
      T.add(new THREE.BoxGeometry(0.05, 0.12, 0.07), 0x1b1b1b, 0.15, Y(0.1), 0.02, 0, 0, 0.05); // bao súng bên hông phải
    } else if (st === 'polo') {
      teeNeck();
      for (const s of [-1, 1]) T.add(new THREE.BoxGeometry(0.05, 0.006, 0.045), shade(o.shirt, 0.92), s * 0.032, Y(0.654), 0.045, -0.4, s * 0.55, s * 0.25); // cổ bẻ
      placket(shade(o.shirt, 0.9), Y(0.55), Y(0.64));
      buttons(0xf2f2f2, Y(0.57), Y(0.62), 2);
    } else if (st === 'tank') {
      // ba lỗ: thân + 2 dây vai bản to đã dựng ở trên (cổ + vai để da)
    } else if (st === 'gile') {
      // gile phản quang mặc ngoài áo thun (màu phụ): ngực chữ V lộ áo thun, 2 sọc dọc + 1 sọc ngang phản quang
      T.add(latheOf(sub(shirtP, Y(0.6), Y(0.662))), c2);
      T.add(frontStrip(shirtP, (y) => -0.06 - Math.max(0, y - Y(0.4)) * 1.1, (y) => 0.06 + Math.max(0, y - Y(0.4)) * 1.1, Y(0.4), Y(0.6), 0.003), c2);
      T.add(band(shirtP, Y(0.3), Y(0.33), 0.004), LIGHT);
      for (const s of [-1, 1]) T.add(frontStrip(shirtP, s * 0.55 - 0.05, s * 0.55 + 0.05, Y(0.33), Y(0.58), 0.004), LIGHT);
      T.add(new THREE.CylinderGeometry(0.052, 0.056, 0.016, SEG, 1, true), shade(c2, 0.85), 0, Y(0.658), -0.004);
    } else if (st === 'baba') {
      teeNeck();
      buttons(shade(o.shirt, 0.7), Y(0.2), Y(0.62), 5);
      for (const s of [-1, 1]) T.add(new THREE.BoxGeometry(0.06, 0.055, 0.006), shade(o.shirt, 0.92), s * 0.07, Y(0.16), radiusAt(hemP, Y(0.16)) * ZS + 0.008); // 2 túi dưới
    } else if (st === 'soccer') {
      T.add(frontStrip(shirtP, (y) => -0.03 - Math.max(0, y - Y(0.56)) * 3, (y) => 0.03 + Math.max(0, y - Y(0.56)) * 3, Y(0.56), Y(0.662), 0.002), o.skin); // cổ tim
      T.add(new THREE.CylinderGeometry(0.054, 0.058, 0.012, SEG, 1, true), c2, 0, Y(0.66), -0.004);
      const bz = -radiusAt(shirtP, Y(0.45)) * ZS - 0.006;
      glyph(T, '1', 0.045, Y(0.45), bz, 0.11, c2, true); // nhìn từ sau: số 1 bên trái người xem
      glyph(T, '0', -0.035, Y(0.45), bz, 0.11, c2, true);
      for (const s of [-1, 1]) T.add(frontStrip(shirtP, s * 1.45 - 0.05, s * 1.45 + 0.05, Y(0.16), Y(0.6), 0.003), c2); // sọc hông
    } else if (st === 'vnteam') {
      teeNeck();
      T.add(starGeo(0.05), 0xffd200, 0, Y(0.47), fz(Y(0.47), 0.003));
      T.add(new THREE.CylinderGeometry(0.054, 0.058, 0.012, SEG, 1, true), 0xffd200, 0, Y(0.66), -0.004);
    } else if (st === 'printed') {
      teeNeck();
      const y = Y(0.45), z = fz(y, 0.004);
      glyph(T, 'I', -0.085, y, z, 0.045, c2);
      T.add(heartGeo(0.022), 0xd62839, -0.04, y + 0.002, z);
      glyph(T, 'S', 0.01, y, z, 0.045, c2);
      glyph(T, 'G', 0.055, y, z, 0.045, c2);
    } else if (st === 'turtleneck') {
      T.add(new THREE.CylinderGeometry(0.053, 0.06, 0.075, SEG, 1, true), shade(o.shirt, 0.95), 0, Y(0.69), -0.004);
      for (const dy of [0.668, 0.69, 0.712]) T.add(new THREE.CylinderGeometry(0.0565, 0.0575, 0.004, SEG, 1, true), shade(o.shirt, 0.85), 0, Y(dy), -0.004);
    } else if (st === 'aodai') {
      T.add(new THREE.CylinderGeometry(0.05, 0.055, 0.045, SEG, 1, true), shade(o.shirt, 0.92), 0, Y(0.68), -0.004); // cổ đứng
      for (let i = 0; i < 4; i++) { const t = i / 3, y = Y(0.63 - t * 0.09); T.add(new THREE.BoxGeometry(0.008, 0.008, 0.004), c2 === 0xffffff ? shade(o.shirt, 0.75) : c2, 0.025 + t * 0.1, y, fz(y, 0.004) - t * 0.03); } // hàng nút xéo
      // tà sau rủ tới mắt cá (tà trước là khối riêng, xem taGeo)
      T.add(taLathe(f, false), o.shirt, 0, Y(0.17), 0);
    } else if (st === 'overalls') {
      teeNeck();
      // yếm: mảnh yếm trước ngực + 2 dây vắt qua vai (sau lưng 2 dây xuống tới lưng quần), nút đồng
      T.add(frontStrip(shirtP, -0.42, 0.42, Y(0.17), Y(0.48), 0.005), o.shirt);
      strap(T, shirtP, 0.085, 0.022, Y(0.46), o.shirt, true, false);
      strap(T, shirtP, 0.085, 0.022, Y(0.17), o.shirt, false, true);
      for (const s of [-1, 1]) T.add(new THREE.BoxGeometry(0.014, 0.014, 0.006), 0xc7a96b, s * 0.085, Y(0.47), fz(Y(0.47), 0.01));
      T.add(new THREE.BoxGeometry(0.08, 0.06, 0.006), shade(o.shirt, 0.88), 0, Y(0.38), fz(Y(0.38), 0.01)); // túi yếm
    } else if (st === 'dress') {
      teeNeck();
      T.add(band(shirtP, Y(0.17), Y(0.195), 0.005), c2 === 0xffffff ? shade(o.shirt, 0.75) : c2); // dây lưng
    } else teeNeck(); // áo thun, croptop, hai dây
    if (o.uniform != null) {
      // đồng phục hãng: dải phản quang ngang ngực + logo trắng ngực trái
      T.add(band(shirtP, Y(0.39), Y(0.42)), 0xdfe3e6);
      T.add(new THREE.BoxGeometry(0.06, 0.045, 0.01), 0xffffff, 0.075, Y(0.53), radiusAt(shirtP, Y(0.53)) * ZS * 0.93);
    }
    if (o.overlay === 'jacket' || o.overlay === 'raincoat') hood(o.shirt); // mũ trùm áo khoác chống nắng / áo mưa buông sau gáy
    // ---- váy (chân váy / váy xòe / bút chì; đầm: váy cùng màu áo) ----
    if (skirt) {
      const [r0, r1, h] = skirt;
      T.add(new THREE.CylinderGeometry(r0, r1, h, 12, 1, true).scale(1, 1, 0.8), ps === 'dress' ? o.shirt : o.pants, 0, Y(0.17) - h / 2, 0);
      T.add(new THREE.CylinderGeometry(r1 + 0.002, r1 + 0.002, 0.012, 12, 1, true).scale(1, 1, 0.8), shade(ps === 'dress' ? o.shirt : o.pants, 0.82), 0, Y(0.17) - h + 0.006, 0); // viền gấu
    }
    // ---- cổ + đầu + mặt ----
    T.add(limb(0.044, 0.05, 0.1), o.skin, 0, 1.47, -0.004);
    T.add(headGeo(f), o.skin, 0, hy, 0.005);
    T.add(noseGeo(), shade(o.skin, 0.95), 0, hy - 0.004, 0.106);
    KEEP = true;
    for (const s of [-1, 1]) {
      T.add(egg(0.012, 0.0075, 0.006, 6, 4), 0x141414, s * 0.039, hy + 0.012, 0.104, 0, 0, s * -0.08); // mắt
      T.add(new THREE.BoxGeometry(0.036, 0.006, 0.008), o.style === 'bald' ? 0x3a2a22 : shade(o.hair, 1.1), s * 0.04, hy + 0.036, 0.11, 0.1, s * 0.15, s * -0.1); // lông mày
      T.add(egg(0.009, 0.024, 0.018, 6, 4), shade(o.skin, 0.94), s * 0.097, hy - 0.003, -0.005); // tai
    }
    T.add(egg(0.017, 0.004, 0.006, 6, 3), f ? 0xa8484e : 0x8a4a3e, 0, hy - 0.06, 0.095); // miệng
    T.add(egg(0.013, 0.004, 0.006, 6, 3), shade(o.skin, 0.82), 0, hy - 0.067, 0.093); // môi dưới
    KEEP = false;
    addHair(T, o.style, o.hair, o.skin, hy, o.hat === 'helmet' || o.hat === 'police' || o.hat === 'cap');
    addHat(T, o, hy);
    // ---- thùng giao hàng đeo lưng (NPC) / balo / túi đeo chéo ----
    if (o.bag) {
      const bc = o.uniform ?? 0x27ae60, bz = -0.31, g2 = shade(bc, 0.8); // màu thùng = màu hãng (đồng phục), không có thì xanh lá
      T.add(new THREE.BoxGeometry(0.46, 0.48, 0.34), bc, 0, 1.2, bz);
      T.add(new THREE.BoxGeometry(0.48, 0.07, 0.36), g2, 0, 1.465, bz); // nắp
      T.add(new THREE.BoxGeometry(0.47, 0.035, 0.35), 0xe6ecef, 0, 1.08, bz); // dải phản quang
      T.add(new THREE.BoxGeometry(0.2, 0.14, 0.01), 0xffffff, 0, 1.27, bz - 0.172); // ô logo sau lưng
      T.add(new THREE.BoxGeometry(0.12, 0.05, 0.012), bc, 0, 1.27, bz - 0.174);
      for (const s of [-1, 1]) {
        T.add(frontStrip(shirtP, s * 0.55 - 0.1, s * 0.55 + 0.1, Y(0.3), Y(0.632), 0.006), 0x222222); // quai đeo trước ngực
        T.add(new THREE.BoxGeometry(0.04, 0.015, 0.2), 0x222222, s * 0.1, 1.418, -0.02);
      }
    } else if (o.carry === 'backpack') {
      const cc = o.carryColor, bz = -radiusAt(shirtP, Y(0.42)) * ZS - 0.075;
      T.add(new THREE.BoxGeometry(0.26, 0.3, 0.13), cc, 0, Y(0.42), bz);
      T.add(new THREE.CylinderGeometry(0.065, 0.065, 0.26, 8, 1, false, 0, PI).rotateZ(PI / 2).scale(1, 1, 1), cc, 0, Y(0.57), bz); // nắp tròn
      T.add(new THREE.BoxGeometry(0.2, 0.11, 0.03), shade(cc, 0.85), 0, Y(0.36), bz - 0.075); // túi trước
      for (const s of [-1, 1]) {
        T.add(frontStrip(shirtP, s * 0.5 - 0.06, s * 0.5 + 0.06, Y(0.3), Y(0.64), 0.006), shade(cc, 0.6)); // quai trước ngực
        T.add(new THREE.BoxGeometry(0.035, 0.012, 0.16), shade(cc, 0.6), s * 0.09, 1.418, -0.04);
      }
    } else if (o.carry === 'crossbody') {
      const cc = o.carryColor;
      // dây chéo từ vai trái xuống hông phải (trước + sau) + túi nhỏ bên hông phải
      for (const a of [0, PI]) T.add(frontStrip(shirtP, (y) => a + (a ? -1 : 1) * (-0.75 + ((y - Y(0.2)) / 0.44) * 1.5) - 0.06, (y) => a + (a ? -1 : 1) * (-0.75 + ((y - Y(0.2)) / 0.44) * 1.5) + 0.06, Y(0.2), Y(0.64), 0.006), shade(cc, 0.7));
      T.add(new THREE.BoxGeometry(0.06, 0.13, 0.11), cc, -0.165, Y(0.17), 0.02, 0, 0, 0.05);
    }
    let g = T.build();
    if (o.w) g = widen(g, o.w);
    return o.bend ? bend(g, o.bend) : g;
  });
}
// Tà trước áo dài: khối riêng xoay quanh eo, theo chân bước lên trước (models.js followTa) — không bị chân đâm xuyên
function taGeo(o) {
  return cached('ta' + JSON.stringify(o), () => new Parts().add(taLathe(o.f, true), o.shirt).build());
}
// Vạt dưới áo mưa dài (khối riêng xoay quanh hông — ngồi xe thì thu ngắn lại, models.js setSitting)
function coatGeo(o) {
  return cached('coat' + JSON.stringify(o), () => {
    if (o.front) return new Parts().add(coatLathe(o.f, true).scale(1.02, 1, 1.02), o.color).build(); // vạt trước, nằm ngoài vạt chính một chút
    const T = new Parts().add(coatLathe(o.f), o.color);
    T.add(new THREE.LatheGeometry([new THREE.Vector2(0.201, -0.74), new THREE.Vector2(0.2, -0.71)], 14, PI * 0.12, PI * 1.76).scale(1, 1, 0.9), shade(o.color, 0.8)); // viền gấu
    return T.build();
  });
}

// ---------- chân ----------
// ps: kiểu quần (OUTFIT_SLOTS.pants) · foot: kiểu giày · s: bên chân (−1 trái / 1 phải; chỉ quần có chi tiết 1 bên mới cần)
function thighGeo(o) {
  return cached('h' + JSON.stringify(o), () => {
    const { pants, skin, ps, f, p2, s } = o, legs = LEGS(ps), L = new Parts();
    let rT = f ? 0.07 : 0.072, rK = 0.055;
    if (ps === 'legging') [rT, rK] = [rT - 0.008, rK - 0.006];
    if (ps === 'wide' || ps === 'cargo') [rT, rK] = [rT + 0.004, rK + 0.004];
    if (legs === 'bare') L.add(ball(rT - 0.006), skin, 0, -0.01, 0).add(limb(rT - 0.006, rK - 0.006, THIGH), skin, 0, -THIGH / 2, 0);
    else if (legs === 'shorts' || legs === 'boxer') {
      const len = legs === 'boxer' ? 0.14 : 0.24, w = legs === 'boxer' ? 0.012 : 0.006;
      L.add(ball(rT + 0.004), pants, 0, -0.01, 0).add(limb(rT + w, rT + w - 0.004, len), pants, 0, -len / 2, 0);
      L.add(new THREE.RingGeometry(rT - 0.012, rT + w - 0.003, LSEG).rotateX(PI / 2), shade(pants, 0.7), 0, -len, 0);
      if (legs === 'boxer') L.add(limb(rT + w + 0.001, rT + w - 0.001, 0.015), p2 ?? shade(pants, 1.3), 0, -len + 0.015, 0); // viền quần đùi
      L.add(limb(rT - 0.012, rK - 0.004, THIGH - len + 0.02), skin, 0, -len + 0.02 - (THIGH - len + 0.02) / 2, 0);
    } else {
      L.add(ball(rT), pants, 0, -0.01, 0).add(limb(rT, rK, THIGH), pants, 0, -THIGH / 2, 0);
      if (ps === 'cargo') L.add(new THREE.BoxGeometry(0.02, 0.1, 0.075), shade(pants, 0.88), s * (rT - 0.002), -0.24, 0); // túi hộp bên hông
      if (ps === 'track') for (const dz of [-0.014, 0, 0.014]) L.add(new THREE.BoxGeometry(0.006, THIGH, 0.007), p2 ?? 0xffffff, s * (rT - 0.006), -THIGH / 2, dz); // 3 sọc
      if (ps === 'slacks') L.add(new THREE.BoxGeometry(0.005, THIGH, 0.004), shade(pants, 1.12), 0, -THIGH / 2, rT - 0.006); // ly quần
    }
    return L.build();
  });
}
function shinGeo(o) {
  return cached('s' + JSON.stringify(o), () => {
    const { pants, skin, ps, shoe, s2, foot, p2, s } = o, legs = LEGS(ps), L = new Parts();
    let rK = 0.055, rA = 0.046;
    if (ps === 'legging') [rK, rA] = [rK - 0.006, rA - 0.008];
    if (ps === 'cargo') rK += 0.004;
    const bare = legs !== 'long' && legs !== 'capri';
    if (bare) L.add(ball(rK - 0.004), skin, 0, 0, 0).add(limb(rK - 0.004, rA - 0.008, 0.36), skin, 0, -0.18, 0);
    else if (legs === 'capri') {
      L.add(ball(rK), pants, 0, 0, 0).add(limb(rK, rK - 0.006, 0.17), pants, 0, -0.085, 0);
      L.add(new THREE.RingGeometry(rK - 0.016, rK - 0.006, LSEG).rotateX(PI / 2), shade(pants, 0.7), 0, -0.17, 0);
      L.add(limb(rK - 0.012, rA - 0.008, 0.2), skin, 0, -0.26, 0);
    } else {
      const bot = ps === 'wide' ? rA + 0.03 : ps === 'jogger' ? rA - 0.006 : rA;
      L.add(ball(rK), pants, 0, 0, 0).add(limb(rK, bot, 0.36), pants, 0, -0.18, 0);
      if (ps === 'jeans') L.add(limb(rA + 0.006, rA + 0.006, 0.045), shade(pants, 0.82), 0, -0.34, 0).add(new THREE.RingGeometry(rA - 0.01, rA + 0.006, LSEG).rotateX(PI / 2), shade(pants, 0.7), 0, -0.3625, 0); // gấu gập
      if (ps === 'jogger') L.add(limb(bot + 0.004, bot + 0.004, 0.04), shade(pants, 0.8), 0, -0.34, 0); // bo gấu
      if (ps === 'track') for (const dz of [-0.014, 0, 0.014]) L.add(new THREE.BoxGeometry(0.006, 0.36, 0.007), p2 ?? 0xffffff, s * (rA + 0.002), -0.18, dz);
      if (ps === 'slacks') L.add(new THREE.BoxGeometry(0.005, 0.36, 0.004), shade(pants, 1.12), 0, -0.18, rA + 0.002);
    }
    // ---- giày dép ----
    const sole = (c, h = 0.026, w = 0.052, len = 2.55) => L.add(new THREE.CylinderGeometry(w, w, h, LSEG).scale(1, 1, len), c, 0, -0.44 + h / 2, 0.045);
    const lightShoe = () => { _c.setHex(shoe); return _c.r + _c.g + _c.b > 2.3; };
    if (BARE_FOOT[foot]) {
      L.add(egg(0.04, 0.03, 0.11), skin, 0, -0.405, 0.04); // bàn chân trần
      if (foot === 'sandal') {
        L.add(new THREE.CylinderGeometry(0.048, 0.048, 0.018, LSEG).scale(1, 1, 2.5), shoe, 0, -0.431, 0.042);
        L.add(new THREE.TorusGeometry(0.038, 0.009, 4, 8, PI).scale(1, 0.7, 1), shoe, 0, -0.42, 0.07);
      } else if (foot === 'slide') {
        sole(shoe, 0.02, 0.05, 2.5);
        L.add(new THREE.BoxGeometry(0.1, 0.025, 0.06), s2 ?? shoe, 0, -0.405, 0.06); // quai ngang bản to
      } else if (foot === 'flipflop') {
        sole(shoe, 0.012, 0.048, 2.5);
        for (const sx of [-1, 1]) L.add(new THREE.BoxGeometry(0.006, 0.006, 0.07), s2 ?? shade(shoe, 0.7), sx * 0.018, -0.418, 0.075, 0.3, sx * 0.5, 0); // quai chữ V
      } else {
        sole(shoe, 0.016, 0.05, 2.5);
        for (const z of [0.02, 0.08]) L.add(new THREE.TorusGeometry(0.036, 0.007, 4, 8, PI).scale(1, 0.75, 1), shoe, 0, -0.425, z); // 2 quai ngang
        L.add(new THREE.TorusGeometry(0.03, 0.006, 4, 8, PI).rotateY(PI / 2).rotateZ(PI / 2).scale(1, 1.2, 1), shoe, 0, -0.405, -0.035); // quai hậu
      }
    } else if (foot === 'oxford' || foot === 'loafer') {
      L.add(egg(0.046, foot === 'loafer' ? 0.035 : 0.04, 0.13), shoe, 0, -0.4, 0.045);
      L.add(egg(0.03, 0.02, 0.05), shade(shoe, 1.25), 0, -0.375, 0.09); // ánh bóng mũi giày
      sole(0x2a1d14, 0.018, 0.05, 2.65);
      if (foot === 'loafer') L.add(new THREE.BoxGeometry(0.08, 0.012, 0.02), s2 ?? shade(shoe, 0.75), 0, -0.375, 0.06); // quai ngang
      else L.add(new THREE.BoxGeometry(0.02, 0.004, 0.05), shade(shoe, 0.7), 0, -0.362, 0.04); // dây buộc
    } else if (foot === 'flats') {
      L.add(egg(0.04, 0.026, 0.11), skin, 0, -0.4, 0.04);
      L.add(egg(0.045, 0.028, 0.12), shoe, 0, -0.415, 0.042);
      sole(shade(shoe, 0.7), 0.012, 0.048, 2.6);
      L.add(new THREE.BoxGeometry(0.025, 0.012, 0.008), s2 ?? shade(shoe, 1.3), 0, -0.397, 0.1); // nơ
    } else if (foot === 'heels') {
      L.add(egg(0.04, 0.028, 0.11), skin, 0, -0.395, 0.035, 0.3, 0, 0);
      L.add(egg(0.044, 0.03, 0.12), shoe, 0, -0.41, 0.045, 0.3, 0, 0); // bàn chân dốc xuống mũi
      L.add(new THREE.CylinderGeometry(0.008, 0.006, 0.05, 6), shoe, 0, -0.415, -0.04); // gót nhọn
      L.add(new THREE.BoxGeometry(0.06, 0.008, 0.06), shade(shoe, 0.7), 0, -0.436, 0.1); // đế mũi
    } else {
      // giày kín: giày thể thao, bata vải cổ cao, bốt, ủng
      L.add(egg(0.05, 0.045, 0.125), shoe, 0, -0.395, 0.04);
      if (foot === 'canvas') {
        L.add(limb(rA + 0.01, rA + 0.012, 0.075), shoe, 0, -0.37, 0); // cổ cao
        L.add(egg(0.045, 0.028, 0.05), 0xf2f2f2, 0, -0.405, 0.12); // mũi cao su trắng
        sole(0xf2f2f2, 0.03);
        L.add(limb(0.054, 0.054, 0.008), s2 ?? 0xc0392b, 0, -0.418, 0.0); // viền đỏ đế (kiểu Thượng Đình)
      } else if (foot === 'boots' || foot === 'rainboots') {
        const top = foot === 'rainboots' ? 0.06 : 0.17;
        L.add(limb(rA + 0.016, rA + 0.014, 0.4 - top), shoe, 0, -(top + 0.4) / 2, 0); // cổ bốt / ủng
        L.add(new THREE.RingGeometry(rA, rA + 0.016, LSEG).rotateX(-PI / 2), shade(shoe, 0.8), 0, -top, 0);
        sole(foot === 'rainboots' ? shade(shoe, 0.7) : 0x2a1d14, 0.03);
      } else sole(lightShoe() ? 0xc9c9c9 : s2 ?? 0xf2f2f2);
    }
    return L.build();
  });
}
// ---------- tay ----------
// cloth: màu tay áo · sl: 'short' | 'long' | 'none' (ba lỗ, hai dây) · trim: màu viền / sọc tay áo (đá banh, caro, đồ ngủ)
function upperArmGeo(o) {
  return cached('u' + JSON.stringify(o), () => {
    const { cloth, skin, sl, f, sleeve, trim, rings } = o, rS = f ? 0.048 : 0.052, rE = 0.042, A = new Parts();
    A.add(egg(rS * 1.02, rS * 0.9, rS), sl === 'none' ? skin : cloth, -o.s * 0.012, -0.03, 0);
    if (sl === 'short') {
      A.add(limb(rS + 0.004, rS + 0.002, 0.13), cloth, 0, -0.03 - 0.065, 0);
      A.add(new THREE.RingGeometry(rS - 0.01, rS + 0.002, LSEG).rotateX(PI / 2), shade(cloth, 0.7), 0, -0.16, 0);
      if (trim != null) A.add(limb(rS + 0.003, rS + 0.003, 0.018), trim, 0, -0.15, 0);
      A.add(limb(rS - 0.008, rE - 0.004, UPPER_ARM - 0.15), sleeve ?? skin, 0, -0.15 - (UPPER_ARM - 0.15) / 2, 0); // sleeve: găng ống dài kéo lên tới tay áo
      if (sleeve != null) A.add(limb(rS - 0.004, rS - 0.005, 0.02), shade(sleeve, 0.85), 0, -0.165, 0); // viền đầu găng
    } else if (sl === 'none') A.add(limb(rS - 0.006, rE - 0.004, UPPER_ARM - 0.03), sleeve ?? skin, 0, -0.03 - (UPPER_ARM - 0.03) / 2, 0);
    else {
      A.add(limb(rS, rE, UPPER_ARM - 0.03), cloth, 0, -0.03 - (UPPER_ARM - 0.03) / 2, 0);
      if (rings != null) for (const y of [-0.09, -0.18, -0.26]) A.add(limb(rS - 0.002 + y * 0.03, rS - 0.004 + y * 0.03, 0.016), rings, 0, y, 0);
    }
    return A.build();
  });
}
function foreArmGeo(o) {
  return cached('f' + JSON.stringify(o), () => {
    const { cloth, skin, sl, f, s, glove, gloveLong, rings, wrist, wristColor } = o, rE = 0.042, rW = 0.035, short = sl !== 'long';
    const arm = gloveLong && glove != null ? glove : short ? skin : cloth, d = short && !(gloveLong && glove != null) ? 0.004 : 0;
    const A = new Parts().add(ball(rE - d), arm, 0, 0, 0).add(limb(rE - d, rW - d, 0.23), arm, 0, -0.115, 0);
    if (!short && !(gloveLong && glove != null)) {
      const cw = f ? 0.05 : 0.03;
      A.add(limb(rW + 0.008, rW + 0.008, cw), shade(cloth, 0.82), 0, -0.23 - cw / 2 + 0.015, 0).add(new THREE.RingGeometry(0.02, rW + 0.008, LSEG).rotateX(PI / 2), shade(cloth, 0.7), 0, -0.23 - cw + 0.015, 0);
      if (rings != null) for (const y of [-0.06, -0.14]) A.add(limb(rE + 0.002 - y * 0.03, rE - 0.001 - y * 0.03, 0.016), rings, 0, y, 0);
    }
    const hand = glove ?? skin;
    A.add(limb(0.022, 0.024, 0.04), glove ?? skin, 0, -0.245, 0); // cổ tay (đeo găng thì màu găng)
    if (glove != null && !gloveLong) A.add(limb(0.03, 0.028, 0.03), shade(glove, 0.85), 0, -0.24, 0); // cổ găng ngắn
    if (glove != null && gloveLong && !short) A.add(limb(rW + 0.01, rW + 0.01, 0.025), shade(glove, 0.85), 0, -0.012, 0); // viền đầu găng ở khuỷu
    // đồng hồ / vòng tay ở cổ tay trái (ngoài tay áo / găng)
    if (wrist && s < 0) {
      const wy = short || glove != null ? -0.228 : -0.2;
      if (wrist === 'watch') {
        A.add(limb(0.03, 0.03, 0.014), wristColor, 0, wy, 0);
        A.add(new THREE.BoxGeometry(0.026, 0.024, 0.01), 0x1d1d1d, 0.024, wy, 0, 0, 0, PI / 2).add(new THREE.BoxGeometry(0.02, 0.018, 0.004), 0xcfe6ff, 0.03, wy, 0, 0, 0, PI / 2); // mặt đồng hồ
      } else A.add(new THREE.TorusGeometry(0.03, 0.005, 4, 10).rotateX(PI / 2), wristColor, 0, wy, 0);
    }
    A.add(egg(0.026, 0.05, 0.016), hand, 0, -0.3, 0.004); // bàn tay
    A.add(egg(0.01, 0.024, 0.01, 6, 4), hand, -s * 0.024, -0.288, 0.015, 0, 0, s * 0.35); // ngón cái
    return A.build();
  });
}

// o: tham số đã chuẩn hóa từ makePerson (models.js). Trả về nhóm người + userData.parts (chưa có áo mưa, chưa nhân vóc)
// Kiểu áo / quần: o.shirtStyle, o.pantsStyle (bỏ trống → theo sleeves / shorts / skirt như trước); màu phụ o.shirt2, o.pants2, o.shoe2
export function buildPerson(o) {
  const f = o.gender === 'f';
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  // fn + tham số: dựng hình chi tiết ngay; bản đơn giản dựng khi cần (lần đầu người này ở xa)
  const mesh = (fn, arg, parent, shadow = false) => {
    const m = new THREE.Mesh(fn(arg), PERSON_MAT);
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.userData.lodMake = () => lite(() => fn(arg));
    parent.add(m);
    return m;
  };
  const covered = o.overlay === 'jacket' || o.overlay === 'raincoat' || o.uniform != null; // áo khoác chống nắng / áo mưa / đồng phục che kín áo trong
  let st = covered ? 'long' : o.shirtStyle || (o.sleeves === 'short' ? 'short' : 'long');
  let ps = o.pantsStyle || (o.skirt ? 'skirt' : o.shorts ? 'shorts' : 'long');
  let pants = o.pants, p2 = o.pants2;
  // đồ liền bộ: đầm (chân trần, váy cùng màu áo) · yếm, đồ ngủ (quần cùng màu áo)
  if (st === 'dress') ps = 'dress';
  if (st === 'overalls' || st === 'pajama') [ps, pants, p2] = [st === 'overalls' ? 'jeans' : 'long', o.shirt, o.shirt2];
  const sl = SLEEVE[st] || 'long';
  const cloth = st === 'gile' || st === 'overalls' ? o.shirt2 ?? 0xffffff : o.shirt; // gile / yếm: tay áo là áo thun bên trong
  const trim = st === 'soccer' ? o.shirt2 ?? 0x222222 : st === 'vnteam' ? 0xffd200 : st === 'racing' ? o.shirt2 ?? 0xffffff : null;
  const rings = st === 'plaid' || st === 'pajama' ? o.shirt2 ?? 0xffffff : null;
  const torso = mesh(torsoGeo, {
    female: f, shirt: o.shirt, shirt2: o.shirt2 ?? null, shirtStyle: st, pants, pantsStyle: ps, skin: o.skin, hair: o.hair, style: o.style, bag: o.bag,
    hat: o.hat, hatColor: o.hat ? o.hatColor : null, helmetStyle: o.hat === 'helmet' ? o.helmetStyle : null,
    overlay: o.overlay === 'jacket' || o.overlay === 'raincoat' ? o.overlay : null, uniform: !o.overlay ? o.uniform ?? null : null,
    face: o.face || null, faceColor: o.face ? o.faceColor : null, carry: o.carry || null, carryColor: o.carry ? o.carryColor : null,
    ...(BUILD_W[o.build] ? { w: BUILD_W[o.build] } : {}),
    ...(o.bend ? { bend: o.bend } : {}),
  }, body, true);
  // vóc dáng: tay chân to / nhỏ theo thân (độ nở tay chân bớt hơn thân)
  const [wx, wz] = BUILD_W[o.build] || [1, 1];
  const limbK = (k) => 1 + (wx - 1) * k;
  const thick = (m, k) => { if (wx !== 1) m.scale.set(limbK(k), 1, limbK(k)); return m; };
  // tà trước áo dài: khối riêng xoay quanh eo
  let ta = null;
  if (st === 'aodai') {
    ta = new THREE.Group();
    ta.position.set(0, Y0 + 0.17, 0);
    body.add(ta);
    mesh(taGeo, { shirt: o.shirt, f }, ta, true);
    ta.scale.set(wx, 1, wz);
  }
  // áo mưa dài: vạt dưới tới mắt cá (khối riêng — parts.overlay, ngồi xe thì thu ngắn)
  let coat = null;
  if (o.overlay === 'raincoat') {
    coat = new THREE.Group();
    coat.position.set(0, Y0 + 0.13, 0);
    coat.userData.coat = true;
    body.add(coat);
    mesh(coatGeo, { color: o.shirt, f }, coat, true);
    coat.scale.set(wx, 1, wz);
    // vạt trước: đứng thì khép kín, bước chân / ngồi xe thì nhấc theo đùi (followTa)
    ta = new THREE.Group();
    ta.position.set(0, Y0 + 0.13, 0);
    ta.userData.coatFlap = true;
    body.add(ta);
    mesh(coatGeo, { color: o.shirt, f, front: true }, ta, true);
    ta.scale.set(wx, 1, wz);
  }
  const hipX = (f ? 0.07 : 0.074) * limbK(0.8), side = ps === 'cargo' || ps === 'track'; // quần có chi tiết 1 bên (túi hộp, 3 sọc) → hình riêng từng chân
  const foot = o.shoeStyle || 'sneaker';
  const legParts = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * hipX, HIP_Y, 0);
    g.add(hip);
    thick(mesh(thighGeo, { pants, skin: o.skin, ps, f, p2: p2 ?? null, s: side ? s : 0 }, hip), 0.8);
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    hip.add(knee);
    thick(mesh(shinGeo, { pants, skin: o.skin, ps, shoe: o.shoe, s2: o.shoe2 ?? null, foot, p2: p2 ?? null, s: side ? s : 0 }, knee), 0.5);
    return [hip, knee];
  });
  const shX = (f ? 0.165 : 0.178) * (1 + (wx - 1) * buildFade(SHOULDER_Y)); // vai dời ra / vào theo thân
  const armZ = 0.08 + Math.max(0, wx - 1) * 0.45; // người mập: tay dang ra hơn, không lẹm vào bụng
  const glove = o.gloves ? o.gloveColor : null, gloveLong = o.gloves === 'armSleeves';
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * shX, SHOULDER_Y, bendZ(SHOULDER_Y, o.bend || 0)); // lưng cong → vai ra trước theo
    sh.rotation.z = s * armZ;
    body.add(sh);
    thick(mesh(upperArmGeo, { cloth, skin: o.skin, sl, f, s, sleeve: gloveLong && sl !== 'long' ? glove : null, trim, rings }, sh), 0.7);
    const el = new THREE.Group();
    el.position.y = -UPPER_ARM;
    el.rotation.x = -0.15;
    sh.add(el);
    thick(mesh(foreArmGeo, { cloth, skin: o.skin, sl, f, s, glove, gloveLong, rings, wrist: s < 0 ? o.wrist || null : null, wristColor: s < 0 && o.wrist ? o.wristColor : null }, el), 0.5);
    return [sh, el];
  });
  // mặt anime pixel (world/faces.js): kiểu mặt đặt sẵn (nhân vật cốt truyện / NPC / người chơi), không thì tự lấy hợp giới tính + tuổi,
  // cố định theo ngoại hình. Người ở xa (bản đơn giản) bỏ miếng mặt
  const faceStyle = o.faceStyle || defaultFace({ gender: f ? 'f' : 'm', old: (o.bend || 0) > 0, key: (o.shirt ?? 0) * 31 + (o.pants ?? 0) * 7 + (o.hair ?? 0) * 3 + (o.skin ?? 0) });
  const fm = makeFaceMesh({ style: faceStyle, female: f, bend: o.bend || 0, skin: o.skin, hair: o.hair, eyeColor: o.eyeColor ?? null, mask: o.face === 'mask' ? o.faceColor ?? 0x5dade2 : null });
  if (fm) {
    fm.userData.lodMake = () => FACE_LOD_EMPTY;
    body.add(fm);
  }
  g.userData.parts = { legL: legParts[0][0], legR: legParts[1][0], kneeL: legParts[0][1], kneeR: legParts[1][1], armL: arms[0][0], armR: arms[1][0], elbowL: arms[0][1], elbowR: arms[1][1], body, torso, overlay: coat, ta, female: f, armZ };
  PEOPLE.add(g);
  if (PEOPLE_MODE === 'simple') setPersonDetail(g, true);
  return g;
}

// Mũ bảo hiểm rời (vd cầm trên tay lúc tháo nón trong cốt truyện) — gốc ở tâm đầu; HEAD_Y = độ cao tâm đầu khi đứng (chưa nhân vóc)
export const HEAD_CENTER_Y = HEAD_Y - 0.005;
export function makeHelmetMesh({ hatColor = 0x1c1c1c, helmetStyle = 'full' } = {}) {
  const T = new Parts();
  addHat(T, { hat: 'helmet', hatColor, helmetStyle }, 0);
  const m = new THREE.Mesh(T.build(), PERSON_MAT);
  m.castShadow = true;
  return m;
}

// ---------- ĐỔI CHI TIẾT THEO KHOẢNG CÁCH ----------
// Mọi người đã dựng (người chơi, người đi đường, khách, NPC…) → game.js gọi updatePeopleLod mỗi vài khung hình.
// mode 'auto': gần camera (< LOD_FAR m) vẽ chi tiết, xa hơn vẽ bản đơn giản · 'simple': luôn đơn giản (máy yếu, Cài đặt)
const PEOPLE = new Set();
let PEOPLE_MODE = 'auto';
export const LOD_FAR = 30;
export function setPeopleMode(mode) {
  PEOPLE_MODE = mode === 'simple' ? 'simple' : 'auto';
}
// lo = true: bản đơn giản · false: chi tiết (bản đơn giản dựng lần đầu cần tới, cất lại dùng chung)
export function setPersonDetail(g, lo) {
  if (!!g.userData.lo === lo) return;
  g.userData.lo = lo;
  g.traverse((m) => {
    const make = m.userData?.lodMake;
    if (!make) return;
    m.userData.hiGeo ??= m.geometry;
    if (lo) m.geometry = m.userData.loGeo ??= make();
    else m.geometry = m.userData.hiGeo;
  });
}
const _v = new THREE.Vector3();
export function updatePeopleLod(cam) {
  for (const g of PEOPLE) {
    if (!g.parent) {
      if (g.userData.orphan > 3) PEOPLE.delete(g); // đã bỏ khỏi cảnh (dựng lại người chơi, khách đi rồi…)
      else g.userData.orphan = (g.userData.orphan || 0) + 1;
      continue;
    }
    g.userData.orphan = 0;
    if (g.userData.keepDetail) { // người chơi, ô xem nhân vật: luôn chi tiết
      setPersonDetail(g, false);
      continue;
    }
    if (PEOPLE_MODE === 'simple') {
      setPersonDetail(g, true);
      continue;
    }
    g.getWorldPosition(_v);
    const d = _v.distanceTo(cam), lo = g.userData.lo ? d > LOD_FAR - 4 : d > LOD_FAR; // chừa 4 m để khỏi nhấp nháy ở ranh giới
    setPersonDetail(g, lo);
  }
}
export const peopleCount = () => PEOPLE.size;
// Tà áo dài theo chân: chân nào bước lên trước (góc âm) thì tà trước nhấc theo; ngồi xe → tà nằm trên đùi
export function followTa(p) {
  if (p.ta) p.ta.rotation.x = Math.min(0, p.legL.rotation.x, p.legR.rotation.x) * 0.95;
}
