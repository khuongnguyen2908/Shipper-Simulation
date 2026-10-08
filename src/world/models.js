// Mô hình low-poly dựng từ hình khối cơ bản: người, xe máy, ô tô, chó, cọc giao thông.
// Hướng "phía trước" của mọi mô hình là trục +z cục bộ.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../sim/rng.js';
import { guessGender, hashStr } from '../sim/people.js';

const PI = Math.PI;
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts }));
  return matCache.get(key);
}

const geoCache = new Map();
function boxGeo(w, h, d) {
  const k = `b${w},${h},${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}

function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0xffdbac];

// Màu áo mưa cánh dơi và áo khoác chống nắng mặc ngoài
export const RAINCOAT_COLOR = 0x3c8dde;
export const JACKET_COLOR = 0xbfe3f5;

// ======================== NGƯỜI (phong cách A+) ========================
// Mỗi người gộp thành 9 khối: thân (đầu, mặt, tóc, mũ, túi, váy… dính liền), 2 bắp tay, 2 cẳng tay + bàn tay,
// 2 đùi, 2 cẳng chân + giày. Màu nằm ngay trong từng đỉnh (vertex color) và tối dần về chân mỗi mảnh
// (giả đổ bóng góc) → mọi người dùng chung MỘT vật liệu, ít lệnh vẽ dù nhiều chi tiết.
export const HIP_Y = 0.88; // độ cao khớp háng khi đứng (mét, chưa nhân scale)
const SHOULDER_Y = 1.405, HEAD_Y = 1.6, THIGH = 0.44, UPPER_ARM = 0.29;
// Độ cao (so với gốc xe) đặt người ngồi trên yên: háng nằm ở độ cao `seat`
export const sitY = (scale = 1, seat = 0.98) => seat - HIP_Y * scale;

const PERSON_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0.03 });
const RAINCOAT_MAT = new THREE.MeshStandardMaterial({ color: RAINCOAT_COLOR, roughness: 0.45, metalness: 0.02, transparent: true, opacity: 0.84, side: THREE.DoubleSide, flatShading: true });
// Hình áo mưa cánh dơi (dựng 1 lần, dùng chung): tiện tròn theo mặt cắt cổ → vai → gối, gợn nếp gấp ở phần rủ,
// rồi kéo ngang ×1,3 (cánh dơi che tay) và ép trước/sau ×0,92 (vẫn che tay khi chạy). Mép dưới ở ~0,58 m (ngang gối).
let PONCHO = null;
export const PONCHO_SCALE = [1.3, 0.92];
function ponchoGeo() {
  if (PONCHO) return PONCHO;
  const prof = [[0.075, 1.53], [0.12, 1.5], [0.24, 1.45], [0.33, 1.38], [0.4, 1.25], [0.46, 1.0], [0.5, 0.76], [0.52, 0.58]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)).reverse(), 18);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const fold = 1 + 0.035 * Math.sin(Math.atan2(z, x) * 9) * Math.max(0, Math.min(1, (1.3 - y) / 0.5)); // nếp gấp ở phần rủ
    p.setXYZ(i, x * fold * PONCHO_SCALE[0], y, z * fold * PONCHO_SCALE[1]);
  }
  g.computeVertexNormals();
  PONCHO = g;
  return g;
}
const _col = new THREE.Color(), _mtx = new THREE.Matrix4(), _q = new THREE.Quaternion(), _eul = new THREE.Euler(), _pos = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);

// Gom các mảnh (hình + màu + chỗ đặt) rồi gộp thành một hình duy nhất
export class PartList {
  // keepUv: giữ toạ độ texture (mảnh có dán hình); mặc định bỏ để gộp nhẹ hơn
  constructor(keepUv = false) {
    this.list = [];
    this.keepUv = keepUv;
  }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, ao = 0.74) {
    this.list.push({ geo, color, x, y, z, rx, ry, rz, ao });
  }
  build() {
    const geos = this.list.map(({ geo, color, x, y, z, rx, ry, rz, ao }) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      if (!this.keepUv) g.deleteAttribute('uv');
      g.computeBoundingBox();
      const { min, max } = g.boundingBox, h = Math.max(1e-4, max.y - min.y);
      const p = g.attributes.position, col = new Float32Array(p.count * 3);
      _col.setHex(color);
      for (let i = 0; i < p.count; i++) {
        const k = ao + (1 - ao) * Math.pow((p.getY(i) - min.y) / h, 0.55);
        col[i * 3] = _col.r * k;
        col[i * 3 + 1] = _col.g * k;
        col[i * 3 + 2] = _col.b * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.applyMatrix4(_mtx.compose(_pos.set(x, y, z), _q.setFromEuler(_eul.set(rx, ry, rz)), _one));
      return g;
    });
    return mergeGeometries(geos);
  }
}
const pBox = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const pCyl = (rt, rb, h, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s);
const pIco = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const shade = (c, k) => _col.setHex(c).multiplyScalar(k).getHex();

// Hình đã dựng được dùng lại cho người cùng kiểu (chân/tay hay trùng nhau) — giới hạn để không phình bộ nhớ
const personGeo = new Map();
function cachedGeo(key, fn) {
  let g = personGeo.get(key);
  if (!g) {
    g = fn();
    if (personGeo.size < 800) personGeo.set(key, g);
  }
  return g;
}

// Đùi (tính từ khớp háng xuống) và cẳng chân + giày (tính từ đầu gối xuống)
function thighGeo(pants, skin, bare, shorts) {
  return cachedGeo(`th|${pants}|${skin}|${bare}|${shorts}`, () => {
    const L = new PartList();
    if (bare) L.add(pCyl(0.08, 0.066, THIGH), skin, 0, -THIGH / 2);
    else if (shorts) {
      L.add(pCyl(0.091, 0.085, 0.25), pants, 0, -0.125);
      L.add(pCyl(0.074, 0.066, THIGH - 0.2), skin, 0, -0.2 - (THIGH - 0.2) / 2);
    } else L.add(pCyl(0.088, 0.072, THIGH), pants, 0, -THIGH / 2);
    return L.build();
  });
}
function shinGeo(pants, skin, bare, shoe) {
  return cachedGeo(`sh|${pants}|${skin}|${bare}|${shoe}`, () => {
    const L = new PartList(), foot = -(HIP_Y - THIGH);
    L.add(pCyl(0.068, 0.056, 0.39), bare ? skin : pants, 0, -0.195);
    L.add(pBox(0.12, 0.035, 0.27), shoe === 0xe8e8e8 ? 0xd0d0d0 : 0xeeeeee, 0, foot + 0.0175, 0.03, 0, 0, 0, 1); // đế
    L.add(pBox(0.11, 0.075, 0.21), shoe, 0, foot + 0.072, 0.01);
    L.add(pBox(0.105, 0.05, 0.08), shoe, 0, foot + 0.06, 0.13);
    return L.build();
  });
}
// Bắp tay (từ vai) và cẳng tay + bàn tay (từ khuỷu); s = -1 trái / 1 phải (ngón cái hướng vào trong)
function upperArmGeo(shirt, skin, short) {
  return cachedGeo(`ua|${shirt}|${skin}|${short}`, () => {
    const L = new PartList();
    L.add(pIco(0.062, 0), shirt, 0, -0.01, 0, 0, 0, 0, 0.9);
    if (short) {
      L.add(pCyl(0.065, 0.06, 0.13), shirt, 0, -0.065);
      L.add(pCyl(0.052, 0.047, UPPER_ARM - 0.1), skin, 0, -0.1 - (UPPER_ARM - 0.1) / 2);
    } else L.add(pCyl(0.058, 0.05, UPPER_ARM), shirt, 0, -UPPER_ARM / 2);
    return L.build();
  });
}
function foreArmGeo(shirt, skin, short, s) {
  return cachedGeo(`fa|${shirt}|${skin}|${short}|${s}`, () => {
    const L = new PartList();
    L.add(pCyl(0.05, 0.043, 0.25), short ? skin : shirt, 0, -0.125);
    if (!short) L.add(pCyl(0.047, 0.047, 0.03), shade(shirt, 0.7), 0, -0.24);
    L.add(pBox(0.06, 0.09, 0.04), skin, 0, -0.3, 0, 0, 0, 0, 0.85);
    L.add(pBox(0.022, 0.05, 0.026), skin, -s * 0.035, -0.285, 0.02);
    return L.build();
  });
}

// Thân + đầu + mọi thứ gắn cố định (tóc, mũ, túi, váy, mũ trùm áo khoác)
function torsoGeo(o) {
  return cachedGeo(`to|${JSON.stringify(o)}`, () => {
    const { shirt, pants, skin, hat, hatColor, hair, bag, female, style, skirt, helmetStyle, overlay } = o;
    const L = new PartList(), hy = HEAD_Y, w = female ? 0.92 : 1;
    // hông, thắt lưng, thân tiện tròn 8 cạnh (eo nhỏ, ngực nở, vai xuôi)
    L.add(pCyl(0.17 * w, 0.165 * w, 0.16, 8).scale(1, 1, 0.7), pants, 0, 0.9, 0, 0, 0, 0, 0.85);
    if (!skirt) L.add(pCyl(0.173 * w, 0.173 * w, 0.04, 8).scale(1, 1, 0.71), 0x2a211b, 0, 0.975, 0, 0, 0, 0, 1);
    const prof = female
      ? [[0.15, 0], [0.142, 0.1], [0.163, 0.24], [0.178, 0.32], [0.172, 0.4], [0.138, 0.46], [0.065, 0.5]]
      : [[0.15, 0], [0.16, 0.08], [0.178, 0.22], [0.192, 0.34], [0.19, 0.4], [0.15, 0.46], [0.07, 0.5]];
    L.add(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 8).rotateY(PI / 8).scale(1, 1, 0.68), shirt, 0, 0.96);
    if (skirt) L.add(pCyl(0.19, 0.28, 0.47, 8).scale(1, 1, 0.8), pants, 0, 0.685);
    L.add(pCyl(0.048, 0.055, 0.1), skin, 0, 1.47);
    // đầu + mặt
    L.add(pIco(0.115).scale(0.92, 1.12, 1), skin, 0, hy, 0, 0, 0, 0, 0.85);
    L.add(new THREE.ConeGeometry(0.022, 0.05, 4).rotateX(PI / 2), skin, 0, hy - 0.012, 0.118, 0, 0, PI / 4, 1);
    for (const s of [-1, 1]) {
      L.add(pBox(0.022, 0.05, 0.035), skin, s * 0.107, hy, -0.005);
      L.add(pBox(0.036, 0.02, 0.01), 0xffffff, s * 0.042, hy + 0.025, 0.104, 0, 0, 0, 1);
      L.add(pBox(0.017, 0.021, 0.012), 0x2a1c14, s * 0.042, hy + 0.025, 0.108, 0, 0, 0, 1);
      L.add(pBox(0.048, 0.012, 0.012), hair, s * 0.044, hy + 0.056, 0.103, 0, 0, -s * 0.12, 1);
    }
    L.add(pBox(0.05, 0.011, 0.01), female ? 0xb5545a : 0xa85a4a, 0, hy - 0.055, 0.103, 0, 0, 0, 1);
    // tóc (mũ bảo hiểm che phần chỏm)
    if (style !== 'bald') {
      if (hat !== 'helmet') L.add(new THREE.SphereGeometry(0.122, 10, 5, 0, PI * 2, 0, PI / 2).scale(0.95, 1, 1.02), hair, 0, hy + 0.02, -0.01, -0.3, 0, 0, 0.85);
      if (style === 'long') {
        L.add(pBox(0.21, 0.32, 0.08), hair, 0, hy - 0.12, -0.09);
        for (const s of [-1, 1]) L.add(pBox(0.03, 0.2, 0.06), hair, s * 0.1, hy - 0.05, 0.03);
      } else {
        L.add(pBox(0.2, 0.1, 0.09), hair, 0, hy - 0.005, -0.075);
        for (const s of [-1, 1]) L.add(pBox(0.02, 0.06, 0.05), hair, s * 0.103, hy + 0.03, 0.035);
      }
      if (style === 'ponytail') L.add(pBox(0.06, 0.22, 0.06), hair, 0, hy - 0.06, -0.16, 0.35);
      if (style === 'bun') L.add(pIco(0.065, 0), hair, 0, hy + 0.04, -0.13);
    }
    // mũ
    if (hat === 'helmet' && helmetStyle === 'full') {
      L.add(new THREE.SphereGeometry(0.15, 10, 6, 0, PI * 2, 0, PI * 0.74).scale(1, 1.08, 1.1), hatColor, 0, hy + 0.01, -0.005, 0, 0, 0, 0.7);
      L.add(pBox(0.2, 0.075, 0.05), 0x2b3a48, 0, hy + 0.015, 0.14, 0, 0, 0, 1); // kính tối
    } else if (hat === 'helmet') {
      L.add(new THREE.SphereGeometry(0.142, 10, 5, 0, PI * 2, 0, PI / 2).scale(1, 0.95, 1.08), hatColor, 0, hy + 0.035, -0.005, 0, 0, 0, 0.85);
      L.add(new THREE.TorusGeometry(0.142, 0.012, 4, 12).rotateX(PI / 2).scale(1, 1, 1.08), shade(hatColor, 0.75), 0, hy + 0.035, -0.005, 0, 0, 0, 1);
      L.add(pBox(0.17, 0.016, 0.07), shade(hatColor, 0.75), 0, hy + 0.045, 0.15, 0.15, 0, 0, 1);
      for (const s of [-1, 1]) L.add(pBox(0.01, 0.1, 0.01), 0x222222, s * 0.1, hy - 0.06, 0.02, 0, 0, 0, 1); // quai
      L.add(pBox(0.1, 0.01, 0.012), 0x222222, 0, hy - 0.11, 0.07, 0, 0, 0, 1);
    } else if (hat === 'nonla') {
      L.add(new THREE.ConeGeometry(0.33, 0.21, 14), 0xe8d6a0, 0, hy + 0.17, 0, 0, 0, 0, 0.8);
      for (const s of [-1, 1]) L.add(pBox(0.008, 0.16, 0.008), 0xc0392b, s * 0.095, hy - 0.03, 0.04, 0, 0, s * 0.15, 1);
    } else if (hat === 'police') {
      L.add(pCyl(0.125, 0.118, 0.07, 10), 0x2e5d3a, 0, hy + 0.1, 0, 0, 0, 0, 0.8);
      L.add(pCyl(0.15, 0.135, 0.04, 10).scale(1, 1, 1.1), 0x2e5d3a, 0, hy + 0.15, -0.01, -0.1, 0, 0, 1);
      L.add(pCyl(0.127, 0.127, 0.025, 10), 0xc0392b, 0, hy + 0.08, 0, 0, 0, 0, 1);
      L.add(pBox(0.17, 0.015, 0.08), 0x111111, 0, hy + 0.07, 0.14, 0.2, 0, 0, 1);
      L.add(pBox(0.04, 0.04, 0.01), 0xf1c40f, 0, hy + 0.13, 0.133, 0, 0, 0, 1);
    }
    // thùng giao hàng đeo lưng (thân trước ~ z 0,13; lưng ~ −0,13)
    if (bag) {
      const bz = -0.33, g2 = shade(0x27ae60, 0.8);
      L.add(pBox(0.46, 0.48, 0.34), 0x27ae60, 0, 1.2, bz);
      L.add(pBox(0.48, 0.07, 0.36), g2, 0, 1.465, bz, 0, 0, 0, 1);
      L.add(pBox(0.47, 0.035, 0.35), 0xe6ecef, 0, 1.08, bz, 0, 0, 0, 1);
      for (const s of [-1, 1]) {
        L.add(pBox(0.05, 0.36, 0.02), 0x222222, s * 0.1, 1.22, 0.128, 0, 0, 0, 1);
        L.add(pBox(0.05, 0.02, 0.2), 0x222222, s * 0.1, 1.44, -0.02, 0, 0, 0, 1);
      }
    }
    if (overlay === 'jacket') L.add(pBox(0.3, 0.14, 0.12), JACKET_COLOR, 0, 1.43, -0.15); // mũ trùm buông sau gáy
    return L.build();
  });
}

// gender: 'm' nam | 'f' nữ (vai, eo hẹp hơn) · hairStyle: short | long | ponytail | bun | bald · skirt: mặc váy (chân màu da)
// sleeves: 'long' | 'short' · shorts: quần short · helmetStyle: 'half' | 'full' (fullface có kính)
// overlay: mặc ngoài — 'raincoat' (áo mưa cánh dơi) | 'jacket' (áo khoác chống nắng) | null
// Khớp: legL/R (háng) → kneeL/R (gối), armL/R (vai) → elbowL/R (khuỷu); body = phần thân nhún khi đi
export function makePerson({ shirt = 0x3498db, pants = 0x2c3e50, skin = SKINS[0], hat = null, hatColor = 0x2ecc71, hair = 0x1b1b1b, scale = 1, bag = false, gender = 'm', hairStyle, skirt = false, sleeves = 'long', shorts = false, helmetStyle = 'half', overlay = null } = {}) {
  const female = gender === 'f';
  const style = hairStyle || (female ? 'long' : 'short');
  if (overlay === 'jacket') {
    shirt = JACKET_COLOR; // áo khoác che kín áo trong, luôn tay dài
    sleeves = 'long';
  }
  const short = sleeves === 'short';
  const shoe = [0x2b2b2b, 0xe8e8e8, 0x6b4a2b, 0x34495e][((shirt >>> 3) + (pants >>> 5)) % 4]; // giày đổi theo bộ đồ, cố định cho cùng một người
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const mesh = (geo, parent, shadow = false) => {
    const m = new THREE.Mesh(geo, PERSON_MAT);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const torso = mesh(torsoGeo({ shirt, pants, skin, hat, hatColor, hair, bag, female, style, skirt, helmetStyle: hat === 'helmet' ? helmetStyle : null, overlay }), body, true);
  // chân: khớp háng → đùi → khớp gối → cẳng chân + giày
  const hipX = female ? 0.09 : 0.1;
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * hipX, HIP_Y, 0);
    g.add(hip);
    mesh(thighGeo(pants, skin, skirt, shorts && !skirt), hip);
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    hip.add(knee);
    mesh(shinGeo(pants, skin, skirt || shorts, shoe), knee);
    return [hip, knee];
  });
  // tay: khớp vai → bắp tay → khuỷu → cẳng tay + bàn tay (theo thân nhún lên xuống)
  const shX = female ? 0.198 : 0.215;
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * shX, SHOULDER_Y, 0);
    sh.rotation.z = s * 0.08;
    body.add(sh);
    mesh(upperArmGeo(shirt, skin, short), sh);
    const el = new THREE.Group();
    el.position.y = -UPPER_ARM;
    el.rotation.x = -0.15;
    sh.add(el);
    mesh(foreArmGeo(shirt, skin, short, s), el);
    return [sh, el];
  });
  // áo mưa cánh dơi: tấm nhựa ôm cổ, phủ qua vai rồi rủ tới gối; xòe ngang che kín 2 tay, trước/sau dẹt hơn
  let overlayMesh = null;
  if (overlay === 'raincoat') {
    overlayMesh = new THREE.Mesh(ponchoGeo(), RAINCOAT_MAT);
    overlayMesh.castShadow = true;
    body.add(overlayMesh);
  }
  g.scale.setScalar(scale);
  g.userData.parts = { legL: legs[0][0], legR: legs[1][0], kneeL: legs[0][1], kneeR: legs[1][1], armL: arms[0][0], armR: arms[1][0], elbowL: arms[0][1], elbowR: arms[1][1], body, torso, overlay: overlayMesh };
  return g;
}

// Ngoại hình ngẫu nhiên (khách, người đi đường). gender: 'm' | 'f' | bỏ trống = ngẫu nhiên.
// sitting: ngồi sau xe → không mặc váy
export function randomPersonOpts(rng, gender = null, { sitting = false } = {}) {
  const shirts = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xe67e22, 0x34495e, 0xff8fab, 0x2ecc71];
  const pants = [0x2c3e50, 0x34495e, 0x7f8c8d, 0x1c2833, 0x5d4037, 0x283593];
  const o = {
    shirt: rng.pick(shirts),
    pants: rng.pick(pants),
    skin: rng.pick(SKINS),
    hat: rng.chance(0.25) ? 'nonla' : null,
    hair: rng.chance(0.15) ? 0x8d8d8d : 0x1b1b1b,
  };
  // phần nam/nữ dùng nhánh ngẫu nhiên riêng để các lựa chọn phía trên không đổi
  const r2 = makeRng(Math.floor(rng.next() * 4294967296));
  o.gender = gender || (r2.chance(0.5) ? 'f' : 'm');
  if (o.gender === 'f') {
    o.hairStyle = r2.pick(['long', 'long', 'ponytail', 'bun']);
    o.skirt = !sitting && r2.chance(0.3);
    if (o.skirt) o.pants = r2.pick([0x2c3e50, 0x8e44ad, 0xc0392b, 0x16a085, 0x5d4037]);
  } else o.hairStyle = 'short';
  if (o.hair === 0x1b1b1b && r2.chance(0.1)) o.hair = 0x5a3825; // tóc nâu
  return o;
}

// Ngoại hình NPC từ dữ liệu (places.json → npc, màu đã đổi sang số). Phần không đặt thì
// ngẫu nhiên cố định theo mã địa điểm; giới tính không đặt thì đoán theo tên.
export function npcLook(id, npc) {
  const gender = npc.gender || guessGender(npc.name) || 'm';
  const o = { ...randomPersonOpts(makeRng(hashStr(id)), gender), hairStyle: gender === 'f' ? 'long' : 'short', skirt: false, hair: 0x1b1b1b };
  for (const k of ['shirt', 'pants', 'hat', 'hatColor', 'scale', 'hairStyle', 'hair', 'skin', 'skirt']) if (npc[k] !== undefined) o[k] = npc[k];
  o.gender = gender;
  return o;
}

// amount 0..1 (đứng yên → chạy): đánh tay chân, gập gối khi chân ra sau, thân nhún nhẹ
export function animatePerson(g, phase, amount) {
  const p = g.userData.parts;
  const s = Math.sin(phase), a = s * 0.6 * amount;
  p.legL.rotation.x = a;
  p.legR.rotation.x = -a;
  p.kneeL.rotation.x = (0.08 + Math.max(0, s) * 0.9) * amount;
  p.kneeR.rotation.x = (0.08 + Math.max(0, -s) * 0.9) * amount;
  p.armL.rotation.x = -a * 0.8;
  p.armR.rotation.x = a * 0.8;
  p.elbowL.rotation.x = p.elbowR.rotation.x = -0.15 - 0.35 * amount;
  p.body.position.y = Math.abs(s) * 0.04 * amount;
}

// Ngồi (trên xe / ghế): đùi đưa ra trước, cẳng chân thả xuống chỗ gác chân, hai tay đưa ra trước
export function setSitting(g, sitting) {
  const p = g.userData.parts;
  p.legL.rotation.x = p.legR.rotation.x = sitting ? -1.2 : 0;
  p.kneeL.rotation.x = p.kneeR.rotation.x = sitting ? 1.25 : 0;
  p.armL.rotation.x = p.armR.rotation.x = sitting ? -0.95 : 0;
  p.elbowL.rotation.x = p.elbowR.rotation.x = sitting ? -0.35 : -0.15;
  p.body.position.y = 0;
  // áo mưa khi ngồi xe: vạt trước phủ lên đùi (kéo dài + đẩy ra trước), không để gối thò ra
  if (p.overlay) {
    p.overlay.scale.set(1, sitting ? 0.92 : 1, sitting ? 1.45 : 1);
    p.overlay.position.set(0, sitting ? 0.1 : 0, sitting ? 0.16 : 0);
  }
}

// ======================== XE (phong cách A+) ========================
// Xe cũng gộp khối như người: phần không sơn (màu nằm trong đỉnh), phần kim loại, phần sơn (đổi màu = đổi vật liệu),
// 2 bánh (quay), đèn pha (sáng theo đêm), đèn hậu + xi nhan, thùng hàng (ẩn khi chở khách).
// Hình theo kiểu xe được dựng 1 lần rồi dùng chung cho mọi xe cùng kiểu.
const VEH_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, metalness: 0.05 });
const VEH_METAL = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.32, metalness: 0.45 });
const VEH_LIGHT = new THREE.MeshBasicMaterial({ vertexColors: true });
const paintMats = new Map();
function paintMat(color) {
  if (!paintMats.has(color)) paintMats.set(color, new THREE.MeshStandardMaterial({ color, vertexColors: true, flatShading: true, roughness: 0.35, metalness: 0.2 }));
  return paintMats.get(color);
}
const PAINT_WHITE = 0xffffff; // phần sơn dựng màu trắng, màu thật lấy từ vật liệu
const vehGeo = new Map();
const vehCached = (key, fn) => vehGeo.get(key) || (vehGeo.set(key, fn()), vehGeo.get(key));

// Hình chiếu cạnh (u = phía trước, v = lên) → khối đùn dày `depth` theo bề ngang (trục x)
export function sideGeo(pts, depth, bevel = 0) {
  const s = new THREE.Shape();
  pts.forEach(([u, v], i) => (i ? s.lineTo(u, v) : s.moveTo(u, v)));
  const d = Math.max(0.005, depth - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
  g.translate(0, 0, -d / 2);
  g.rotateY(-PI / 2);
  return g;
}
// thanh tròn nối 2 điểm [x,y,z] → hình đã đặt đúng chỗ (dùng với PartList.add(..., 0,0,0))
export function rodGeo(a, b, r, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate(...A.add(B).multiplyScalar(0.5).toArray());
  return g;
}
// cung dè bánh xe (nửa trên vòng bánh)
const fenderGeo = (R, t = 0.035, arc = 0.55) => new THREE.TorusGeometry(R, t, 3, 8, PI * arc).rotateZ(PI * (0.5 - arc / 2)).rotateY(PI / 2);

const BLACK = 0x161616, DARK = 0x2a2a2a, GREY = 0x6b6f74, CHROME = 0xd5dade, ALU = 0x9aa0a6, SEAT = 0x2b2420, CREAM = 0xf3ead3;

// Bánh xe: lốp + vành + nan (đúc 5 chấu hoặc nan căm) + đùm + đĩa phanh (bánh trước)
function wheelGeo(R, t, spokes, disc) {
  return vehCached(`wh|${R}|${t}|${spokes}|${disc}`, () => {
    const L = new PartList();
    L.add(new THREE.TorusGeometry(R - t, t, 5, 14).rotateY(PI / 2), BLACK, 0, 0, 0, 0, 0, 0, 0.8);
    L.add(new THREE.CylinderGeometry(R - t * 1.05, R - t * 1.05, 0.035, 12, 1, true).rotateZ(PI / 2), ALU, 0, 0, 0, 0, 0, 0, 0.85);
    L.add(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8).rotateZ(PI / 2), GREY);
    const n = spokes === 'wire' ? 12 : 5, len = R - t - 0.03;
    for (let k = 0; k < n; k++) {
      const sp = spokes === 'wire' ? new THREE.BoxGeometry(0.008, len, 0.008) : new THREE.BoxGeometry(0.022, len, 0.03);
      sp.translate(spokes === 'wire' ? (k % 2 ? 0.03 : -0.03) : 0, len / 2, 0);
      L.add(sp, ALU, 0, 0, 0, (k * 2 * PI) / n, 0, 0, 1);
    }
    if (disc) L.add(new THREE.CylinderGeometry(R * 0.38, R * 0.38, 0.008, 14).rotateZ(PI / 2), CHROME, 0.055, 0, 0, 0, 0, 0, 1);
    return L.build();
  });
}

// Mỗi kiểu xe: P = phần sơn, D = phần thường (màu riêng), K = kim loại, rồi các số đo dùng chung
// wheel [bán kính, z trước, z sau, kiểu nan], lamp [y, z], tail [y, z], rackY, bar [nửa rộng, y, z]
const BIKE_SPECS = {
  // Cub cũ: yếm kem, khung xương sống, yên da nâu dài, nan căm, nhiều đồ crôm
  cub: {
    wheel: [0.32, 0.6, -0.6, 'wire', 0.06], lamp: [0.99, 0.66], tail: [0.78, -0.86], rackY: 0.98, bar: [0.33, 1.07, 0.5],
    build(P, D, K) {
      P.add(sideGeo([[-0.8, 0.6], [-0.86, 0.74], [-0.55, 0.8], [-0.1, 0.78], [0.02, 0.62], [-0.1, 0.5], [-0.6, 0.48]], 0.3, 0.012), PAINT_WHITE);
      P.add(sideGeo([[-0.05, 0.6], [0.1, 0.7], [0.42, 0.95], [0.5, 0.9], [0.15, 0.56], [0.0, 0.53]], 0.14, 0.012), PAINT_WHITE);
      P.add(new THREE.BoxGeometry(0.26, 0.16, 0.2), PAINT_WHITE, 0, 1.0, 0.54); // hộp đèn
      P.add(fenderGeo(0.36, 0.035, 0.5), PAINT_WHITE, 0, 0.32, 0.6);
      P.add(fenderGeo(0.36, 0.04, 0.45), PAINT_WHITE, 0, 0.32, -0.6, 0.35);
      D.add(sideGeo([[0.28, 0.36], [0.4, 0.34], [0.47, 0.6], [0.43, 0.9], [0.34, 0.92], [0.33, 0.62]], 0.42), CREAM); // yếm kem
      D.add(sideGeo([[-0.74, 0.78], [-0.62, 0.9], [0.05, 0.88], [0.12, 0.8], [-0.6, 0.77]], 0.3), 0x3b2a1e); // yên da
      K.add(new THREE.BoxGeometry(0.2, 0.2, 0.26), GREY, 0, 0.38, -0.02);
      for (let k = 0; k < 4; k++) K.add(new THREE.BoxGeometry(0.24, 0.014, 0.1), GREY, 0, 0.32 + k * 0.035, 0.14);
      K.add(rodGeo([0.16, 0.3, 0.1], [0.18, 0.32, -0.7], 0.04, 8), CHROME); // ống xả dài
      for (const s of [-1, 1]) K.add(rodGeo([s * 0.07, 0.32, 0.6], [s * 0.07, 0.98, 0.52], 0.026), CHROME); // phuộc
      for (const s of [-1, 1]) K.add(rodGeo([s * 0.13, 0.36, -0.55], [s * 0.13, 0.72, -0.42], 0.022), CHROME); // giảm xóc sau
    },
  },
  // Xe số (Wave): dàn áo nhựa, khung dưới để chân, tem sọc, mâm đúc
  underbone: {
    wheel: [0.3, 0.62, -0.62, 'mag', 0.068], lamp: [1.0, 0.77], tail: [0.73, -0.92], rackY: 0.98, bar: [0.33, 1.1, 0.56],
    build(P, D, K) {
      P.add(sideGeo([[-0.86, 0.6], [-0.92, 0.78], [-0.6, 0.84], [-0.05, 0.82], [0.1, 0.64], [0.02, 0.48], [-0.35, 0.42], [-0.7, 0.46]], 0.3, 0.012), PAINT_WHITE);
      P.add(sideGeo([[0.3, 0.38], [0.42, 0.36], [0.6, 0.92], [0.5, 0.98], [0.36, 0.62]], 0.36, 0.012), PAINT_WHITE); // yếm
      P.add(sideGeo([[0.44, 0.92], [0.66, 0.9], [0.78, 0.98], [0.74, 1.1], [0.5, 1.12]], 0.3, 0.012), PAINT_WHITE); // đầu xe
      P.add(fenderGeo(0.33), PAINT_WHITE, 0, 0.3, 0.62);
      D.add(sideGeo([[-0.84, 0.68], [-0.3, 0.71], [0.04, 0.6], [0.0, 0.58], [-0.3, 0.665], [-0.84, 0.645]], 0.32, 0.004), 0xf4f4f4); // tem sọc
      D.add(sideGeo([[-0.74, 0.82], [-0.62, 0.95], [0.0, 0.94], [0.09, 0.86], [-0.02, 0.8], [-0.6, 0.8]], 0.29), SEAT);
      D.add(sideGeo([[-0.62, 0.92], [0.0, 0.915], [0.0, 0.905], [-0.62, 0.91]], 0.295, 0.002), 0x5a4a40); // chỉ may yên
      D.add(sideGeo([[0.0, 0.44], [0.32, 0.4], [0.44, 0.7], [0.38, 0.73], [0.28, 0.49], [0.02, 0.52]], 0.12), DARK);
      D.add(sideGeo([[-0.66, 0.24], [-0.05, 0.3], [0.0, 0.38], [-0.66, 0.36]], 0.04), DARK, 0.12); // hộp xích
      D.add(sideGeo([[-0.85, 0.36], [-0.75, 0.58], [-0.55, 0.62], [-0.62, 0.5]], 0.14), DARK); // dè sau
      K.add(new THREE.BoxGeometry(0.2, 0.2, 0.28), GREY, 0, 0.36, -0.05);
      for (let k = 0; k < 4; k++) K.add(new THREE.BoxGeometry(0.24, 0.015, 0.12), 0x80858a, 0, 0.3 + k * 0.035, 0.12);
      for (const s of [-1, 1]) K.add(rodGeo([s * 0.08, 0.3, 0.62], [s * 0.08, 0.98, 0.55], 0.024), CHROME);
      for (const s of [-1, 1]) K.add(rodGeo([s * 0.14, 0.42, -0.55], [s * 0.14, 0.8, -0.42], 0.018), CHROME);
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) D.add(new THREE.TorusGeometry(0.03, 0.008, 3, 6).rotateX(PI / 2), 0xc0392b, s * 0.14, 0.52 + k * 0.07, -0.52 + k * 0.025, 0.33, 0, 0, 1); // lò xo
      K.add(rodGeo([0.17, 0.3, -0.17], [0.17, 0.3, -0.67], 0.045, 8), CHROME); // ống xả
      D.add(new THREE.BoxGeometry(0.02, 0.09, 0.26), DARK, 0.22, 0.32, -0.38); // ốp chống nóng
      K.add(rodGeo([-0.15, 0.92, -0.62], [0.15, 0.92, -0.62], 0.015), CHROME); // tay dắt
    },
  },
  // Tay ga (Vision, SH): bánh nhỏ, sàn để chân phẳng, yếm cao, thân sau bầu, đèn trên tay lái
  scooter: {
    wheel: [0.26, 0.58, -0.6, 'mag', 0.07], lamp: [1.06, 0.66], tail: [0.74, -0.9], rackY: 0.98, bar: [0.33, 1.1, 0.48],
    build(P, D, K) {
      P.add(sideGeo([[0.3, 0.36], [0.5, 0.38], [0.66, 0.74], [0.62, 1.0], [0.5, 1.04], [0.42, 0.7], [0.33, 0.5]], 0.44, 0.012), PAINT_WHITE); // yếm cao
      P.add(sideGeo([[-0.84, 0.55], [-0.92, 0.72], [-0.62, 0.86], [-0.05, 0.84], [0.12, 0.62], [0.08, 0.4], [-0.3, 0.33], [-0.72, 0.4]], 0.44, 0.012), PAINT_WHITE); // thân sau
      P.add(sideGeo([[0.38, 1.0], [0.62, 1.02], [0.7, 1.1], [0.46, 1.17]], 0.6, 0.012), PAINT_WHITE); // ốp tay lái
      P.add(fenderGeo(0.3, 0.035, 0.5), PAINT_WHITE, 0, 0.26, 0.58);
      D.add(new THREE.BoxGeometry(0.38, 0.06, 0.5), DARK, 0, 0.36, 0.08); // sàn để chân
      D.add(sideGeo([[-0.74, 0.84], [-0.6, 0.96], [0.02, 0.95], [0.1, 0.87], [-0.62, 0.83]], 0.38), SEAT);
      D.add(sideGeo([[-0.6, 0.94], [0.02, 0.935], [0.02, 0.925], [-0.6, 0.93]], 0.385, 0.002), 0x5a4a40);
      D.add(sideGeo([[-0.8, 0.56], [-0.3, 0.6], [0.05, 0.5], [0.0, 0.48], [-0.3, 0.58], [-0.8, 0.54]], 0.45, 0.004), 0xc9ced2); // viền crôm thân
      D.add(new THREE.BoxGeometry(0.16, 0.18, 0.5), DARK, 0.1, 0.3, -0.38); // càng sau + máy
      for (const s of [-1, 1]) K.add(rodGeo([s * 0.07, 0.26, 0.58], [s * 0.07, 0.8, 0.5], 0.026), CHROME);
      K.add(rodGeo([-0.14, 0.32, -0.58], [-0.14, 0.7, -0.4], 0.02), CHROME);
      K.add(rodGeo([0.18, 0.3, -0.2], [0.2, 0.36, -0.75], 0.045, 8), CHROME);
      K.add(rodGeo([-0.14, 0.93, -0.66], [0.14, 0.93, -0.66], 0.015), CHROME);
    },
  },
  // Tay côn / mô tô (Exciter): bình xăng trước yên, đuôi vuốt cao, phuộc vàng, máy lộ, bánh to
  sport: {
    wheel: [0.33, 0.66, -0.66, 'mag', 0.075], lamp: [1.0, 0.74], tail: [1.0, -0.94], rackY: 1.1, bar: [0.31, 1.04, 0.44],
    build(P, D, K) {
      P.add(sideGeo([[-0.05, 0.85], [0.0, 0.98], [0.3, 1.03], [0.42, 0.92], [0.3, 0.8], [0.0, 0.78]], 0.4, 0.012), PAINT_WHITE); // bình xăng
      P.add(sideGeo([[-0.92, 0.98], [-0.96, 1.04], [-0.55, 1.0], [-0.2, 0.9], [-0.1, 0.8], [-0.5, 0.82]], 0.26, 0.012), PAINT_WHITE); // đuôi
      P.add(sideGeo([[0.45, 0.82], [0.6, 0.86], [0.76, 1.04], [0.64, 1.16], [0.5, 1.05]], 0.34, 0.012), PAINT_WHITE); // mặt nạ
      P.add(fenderGeo(0.37, 0.03, 0.4), PAINT_WHITE, 0, 0.33, 0.66);
      D.add(sideGeo([[-0.6, 0.98], [-0.15, 0.93], [-0.02, 0.9], [-0.1, 0.86], [-0.6, 0.92]], 0.27), SEAT);
      D.add(sideGeo([[-0.4, 0.7], [0.3, 0.85], [0.42, 0.82], [-0.38, 0.62]], 0.32), DARK); // khung
      D.add(sideGeo([[0.0, 0.95], [0.3, 1.0], [0.3, 0.99], [0.0, 0.94]], 0.41, 0.003), 0xf4f4f4); // tem sọc bình xăng
      D.add(new THREE.BoxGeometry(0.28, 0.3, 0.42), 0x3d3d3d, 0, 0.48, 0.05); // máy
      for (let k = 0; k < 5; k++) D.add(new THREE.BoxGeometry(0.32, 0.015, 0.16), 0x55595e, 0, 0.55 + k * 0.035, 0.22);
      D.add(sideGeo([[-0.66, 0.3], [-0.05, 0.4], [-0.05, 0.37], [-0.66, 0.27]], 0.03), DARK, 0.13); // xích
      D.add(new THREE.BoxGeometry(0.44, 0.03, 0.4), DARK, 0, 1.08, -0.62); // baga cao
      for (const s of [-1, 1]) D.add(rodGeo([s * 0.08, 0.33, 0.66], [s * 0.08, 1.0, 0.56], 0.03), 0xd4ac0d); // phuộc vàng
      K.add(rodGeo([-0.12, 0.33, -0.66], [-0.12, 0.42, -0.05], 0.025), ALU); // gắp sau
      K.add(rodGeo([0.12, 0.33, -0.66], [0.12, 0.42, -0.05], 0.025), ALU);
      K.add(rodGeo([0.17, 0.36, 0.0], [0.2, 0.62, -0.7], 0.05, 8), CHROME); // pô vuốt lên
      K.add(rodGeo([0.0, 0.55, -0.2], [0.0, 0.85, -0.35], 0.03), CHROME); // phuộc sau giữa
    },
  },
};
export const BIKE_MODELS = Object.keys(BIKE_SPECS);

// Phần dùng chung mọi kiểu: tay lái, gương, đồng hồ, gác chân, chân chống, biển số, baga
function commonBikeParts(S, D, K, Lt) {
  const [bw, by, bz] = S.bar, [ty, tz] = S.tail, [ly, lz] = S.lamp;
  D.add(new THREE.CylinderGeometry(0.018, 0.018, bw * 2, 6).rotateZ(PI / 2), DARK, 0, by, bz);
  for (const s of [-1, 1]) {
    D.add(new THREE.CylinderGeometry(0.032, 0.032, 0.12, 7).rotateZ(PI / 2), BLACK, s * bw, by, bz);
    K.add(new THREE.BoxGeometry(0.15, 0.012, 0.02), CHROME, s * (bw - 0.08), by, bz + 0.06, 0, s * 0.2, 0);
    D.add(rodGeo([s * (bw - 0.13), by + 0.02, bz], [s * (bw - 0.08), by + 0.22, bz - 0.04], 0.01), DARK);
    K.add(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 10).rotateX(PI / 2).scale(1.3, 0.8, 1), CHROME, s * (bw - 0.08), by + 0.26, bz - 0.04);
    D.add(new THREE.BoxGeometry(0.04, 0.03, 0.12), DARK, s * 0.17, 0.33, 0.1); // gác chân
    D.add(new THREE.BoxGeometry(0.04, 0.03, 0.1), DARK, s * 0.2, 0.42, -0.42);
    Lt.add(new THREE.BoxGeometry(0.06, 0.04, 0.05), 0xffa21a, s * 0.17, ly - 0.02, lz - 0.04); // xi nhan
    Lt.add(new THREE.BoxGeometry(0.06, 0.04, 0.05), 0xffa21a, s * 0.15, ty + 0.02, tz + 0.03);
  }
  D.add(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 10), DARK, 0, by + 0.05, bz + 0.04); // đồng hồ
  D.add(new THREE.CylinderGeometry(0.05, 0.05, 0.005, 10), 0xf4f4f4, 0, by + 0.077, bz + 0.04, 0, 0, 0, 1);
  K.add(new THREE.TorusGeometry(0.075, 0.012, 4, 12), CHROME, 0, ly, lz + 0.005);
  Lt.add(new THREE.BoxGeometry(0.15, 0.06, 0.04), 0xff2a2a, 0, ty, tz); // đèn hậu
  D.add(new THREE.BoxGeometry(0.19, 0.14, 0.012), 0xf2f2f2, 0, ty - 0.18, tz + 0.02, 0.15, 0, 0, 1); // biển số
  for (const k of [-1, 1]) D.add(new THREE.BoxGeometry(0.14, 0.022, 0.014), 0x222222, 0, ty - 0.18 + k * 0.03, tz + 0.012, 0.15, 0, 0, 1);
  if (S.rackY < 1.05) D.add(new THREE.BoxGeometry(0.36, 0.03, 0.36), DARK, 0, S.rackY - 0.06, -0.62); // baga
}

// Thùng giao hàng giữ nhiệt trên baga (đặt ở gốc thùng)
const bagGeo = () => vehCached('bag', () => {
  const L = new PartList();
  L.add(new THREE.BoxGeometry(0.5, 0.42, 0.42), 0x27ae60, 0, 0, 0);
  L.add(new THREE.BoxGeometry(0.52, 0.06, 0.44), 0x1e8a4c, 0, 0.2, 0, 0, 0, 0, 1);
  L.add(new THREE.BoxGeometry(0.505, 0.035, 0.425), 0xe6ecef, 0, -0.11, 0, 0, 0, 0, 1);
  for (const [x, z] of [[-0.25, -0.21], [0.25, -0.21], [-0.25, 0.21], [0.25, 0.21]]) L.add(new THREE.BoxGeometry(0.025, 0.42, 0.025), 0x1e8a4c, x, 0, z, 0, 0, 0, 1);
  L.add(new THREE.BoxGeometry(0.26, 0.12, 0.01), 0xffffff, 0, 0.04, -0.215, 0, 0, 0, 1); // ô logo
  return L.build();
});

// Xe máy: dựng theo kiểu dáng (gear.json → model). Yên cao ~0,93 m để người lái / khách ngồi vừa.
export function makeBike(color = 0x3a6fb0, model = 'underbone') {
  if (!BIKE_SPECS[model]) model = 'underbone'; // kiểu lạ (dữ liệu cũ / gõ sai) → xe số
  const S = BIKE_SPECS[model];
  const [R, zf, zr, spokes, t] = S.wheel;
  const parts = vehCached(`bike|${model}`, () => {
    const P = new PartList(), D = new PartList(), K = new PartList(), Lt = new PartList();
    S.build(P, D, K);
    commonBikeParts(S, D, K, Lt);
    return { paint: P.build(), dark: D.build(), metal: K.build(), lights: Lt.build() };
  });
  const g = new THREE.Group();
  const mk = (geo, m, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const body = mk(parts.paint, paintMat(color));
  mk(parts.dark, VEH_MAT);
  mk(parts.metal, VEH_METAL);
  mk(parts.lights, VEH_LIGHT).castShadow = false;
  const wheelF = mk(wheelGeo(R, t, spokes, true), VEH_MAT, 0, R, zf);
  const wheelR = mk(wheelGeo(R, t, spokes, false), VEH_MAT, 0, R, zr);
  // đèn pha: vật liệu riêng từng xe (ban đêm sáng lên)
  const lamp = mk(new THREE.IcosahedronGeometry(0.075, 1).scale(1, 0.8, 0.5), new THREE.MeshStandardMaterial({ color: 0xfff4c8, emissive: 0xffeeaa, emissiveIntensity: 0.4 }), 0, S.lamp[0], S.lamp[1]);
  lamp.castShadow = false;
  const bagY = S.rackY + 0.24;
  const bagMesh = mk(bagGeo(), VEH_MAT, 0, bagY, -0.62);
  g.userData = { wheelF, wheelR, wheelRadius: R, bagMesh, bagY, body, painted: [body], lamp, model };
  return g;
}

export function setBikeColor(bike, color) {
  for (const m of bike.userData.painted) m.material = paintMat(color);
}

// ======================== Ô TÔ ========================
// 4 kiểu: sedan 4 chỗ, SUV 7 chỗ, taxi, xe tải nhỏ. Dài ≤ 4,4 m (khớp vòng va chạm 2 × r1,05 trong traffic.js).
export const CAR_KINDS = ['sedan', 'suv', 'taxi', 'truck'];
const GLASS = 0x22303d;
function carWheels(D, R, xs, zs) {
  for (const x of xs) for (const z of zs) {
    D.add(new THREE.CylinderGeometry(R, R, 0.24, 12).rotateZ(PI / 2), BLACK, x, R, z, 0, 0, 0, 0.8);
    D.add(new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.02, 10).rotateZ(PI / 2), ALU, x + Math.sign(x) * 0.12, R, z, 0, 0, 0, 1);
  }
}
// Ô tô con (sedan / taxi / SUV): thân dưới + khoang kính + mui + cột + cản + đèn
function carParts(kind) {
  const P = new PartList(), D = new PartList(), Lt = new PartList();
  const suv = kind === 'suv', W = suv ? 1.82 : 1.76, L2 = suv ? 2.08 : 2.02, R = suv ? 0.37 : 0.33, base = suv ? 0.4 : 0.32;
  const top = suv ? 1.05 : 0.92, roof = suv ? 1.7 : 1.42;
  P.add(sideGeo(suv
    ? [[-L2, base], [L2, base], [L2 + 0.03, 0.78], [L2 - 0.12, 1.0], [1.35, 1.05], [-L2, 1.07], [-L2 - 0.04, 0.72]]
    : [[-L2, base], [L2, base], [L2 + 0.03, 0.62], [L2 - 0.1, 0.82], [1.0, 0.9], [-1.25, 0.93], [-L2 + 0.05, 0.86], [-L2 - 0.05, 0.6]], W, 0.03), PAINT_WHITE);
  // khoang kính (màu kính tối) + mui sơn + cột giữa
  const cab = suv ? [[-L2 + 0.05, top], [1.3, top], [0.85, roof - 0.03], [-L2 + 0.12, roof - 0.03]] : [[-1.45, top], [1.0, top], [0.4, roof - 0.03], [-0.9, roof - 0.03]];
  D.add(sideGeo(cab, W - 0.14, 0.02), GLASS, 0, 0, 0, 0, 0, 0, 0.9);
  const rz0 = cab[3][0], rz1 = cab[2][0];
  P.add(new THREE.BoxGeometry(W - 0.12, 0.07, rz1 - rz0 + 0.06), PAINT_WHITE, 0, roof, (rz0 + rz1) / 2);
  P.add(new THREE.BoxGeometry(W - 0.12, roof - top, 0.1), PAINT_WHITE, 0, (top + roof) / 2, suv ? -0.35 : -0.2);
  if (suv) {
    P.add(new THREE.BoxGeometry(W - 0.12, roof - top, 0.1), PAINT_WHITE, 0, (top + roof) / 2, -1.25);
    for (const s of [-1, 1]) D.add(new THREE.BoxGeometry(0.05, 0.05, 2.6), 0x333333, s * (W / 2 - 0.15), roof + 0.06, -0.4); // giá nóc
  }
  // đường cửa, tay nắm, gương
  for (const z of suv ? [0.5, -0.45, -1.3] : [0.35, -0.75]) D.add(new THREE.BoxGeometry(W + 0.01, 0.45, 0.015), 0x1a1a1a, 0, top - 0.25, z, 0, 0, 0, 1);
  for (const z of suv ? [0.25, -0.7] : [0.1, -1.0]) D.add(new THREE.BoxGeometry(W + 0.03, 0.03, 0.12), 0x888888, 0, top - 0.1, z, 0, 0, 0, 1);
  for (const s of [-1, 1]) P.add(new THREE.BoxGeometry(0.16, 0.1, 0.12), PAINT_WHITE, s * (W / 2 + 0.06), top + 0.08, suv ? 1.15 : 0.82);
  // cản, lưới tản nhiệt, biển số
  for (const s of [-1, 1]) D.add(new THREE.BoxGeometry(W + 0.04, 0.2, 0.14), 0x2f2f2f, 0, base + 0.12, s * (L2 + 0.03), 0, 0, 0, 0.9);
  D.add(new THREE.BoxGeometry(W * 0.5, 0.14, 0.03), 0x1a1a1a, 0, base + 0.36, L2 + 0.02, 0, 0, 0, 1);
  for (const s of [-1, 1]) D.add(new THREE.BoxGeometry(0.42, 0.12, 0.02), 0xf2f2f2, 0, base + 0.14, s * (L2 + 0.11), 0, 0, 0, 1);
  // đèn
  for (const x of [-1, 1]) {
    Lt.add(new THREE.BoxGeometry(0.34, 0.12, 0.04), 0xfff6d8, x * (W / 2 - 0.25), base + 0.38, L2 + 0.02);
    Lt.add(new THREE.BoxGeometry(0.3, 0.12, 0.04), 0xd62222, x * (W / 2 - 0.22), base + (suv ? 0.5 : 0.42), -L2 - 0.02);
  }
  carWheels(D, R, [-W / 2 + 0.1, W / 2 - 0.1], [L2 - 0.75, -L2 + 0.75]);
  if (kind === 'taxi') {
    for (const s of [-1, 1]) D.add(new THREE.BoxGeometry(0.01, 0.1, 3.2), 0x1e9e55, s * (W / 2 + 0.035), top - 0.32, -0.05, 0, 0, 0, 1); // sọc hông
    D.add(new THREE.BoxGeometry(0.5, 0.16, 0.22), 0x1e9e55, 0, roof + 0.12, -0.25);
    Lt.add(new THREE.BoxGeometry(0.46, 0.1, 0.23), 0xfff3a0, 0, roof + 0.13, -0.25); // hộp đèn TAXI
  }
  return { paint: P.build(), dark: D.build(), lights: Lt.build() };
}
// Xe tải nhỏ: cabin sơn màu + thùng hàng trắng sọc xanh
function truckParts() {
  const P = new PartList(), D = new PartList(), Lt = new PartList(), W = 1.76;
  P.add(sideGeo([[1.0, 0.5], [2.15, 0.5], [2.2, 0.95], [1.98, 1.85], [1.0, 1.92]], W, 0.03), PAINT_WHITE);
  D.add(new THREE.BoxGeometry(W - 0.2, 0.6, 0.04), GLASS, 0, 1.45, 2.06, -0.3, 0, 0, 1);
  for (const s of [-1, 1]) D.add(new THREE.BoxGeometry(0.02, 0.5, 0.6), GLASS, s * (W / 2 + 0.005), 1.45, 1.55, 0, 0, 0, 1);
  D.add(new THREE.BoxGeometry(1.4, 0.25, 4.2), 0x222222, 0, 0.5, 0);
  D.add(new THREE.BoxGeometry(W + 0.04, 1.65, 2.95), 0xeeeeee, 0, 1.38, -0.62, 0, 0, 0, 0.82); // thùng
  for (const s of [-1, 1]) D.add(new THREE.BoxGeometry(0.01, 0.22, 2.9), 0x2e6fd6, s * (W / 2 + 0.03), 1.3, -0.62, 0, 0, 0, 1);
  D.add(new THREE.BoxGeometry(W + 0.04, 0.2, 0.14), 0x2f2f2f, 0, 0.6, 2.18);
  D.add(new THREE.BoxGeometry(W * 0.5, 0.2, 0.03), 0x1a1a1a, 0, 0.82, 2.2, 0, 0, 0, 1);
  for (const s of [-1, 1]) {
    Lt.add(new THREE.BoxGeometry(0.3, 0.14, 0.04), 0xfff6d8, s * 0.62, 0.82, 2.2);
    Lt.add(new THREE.BoxGeometry(0.2, 0.14, 0.03), 0xd62222, s * 0.75, 0.75, -2.12);
    P.add(new THREE.BoxGeometry(0.12, 0.18, 0.08), PAINT_WHITE, s * (W / 2 + 0.06), 1.5, 1.95);
  }
  carWheels(D, 0.36, [-W / 2 + 0.12, W / 2 - 0.12], [1.5, -1.4]);
  return { paint: P.build(), dark: D.build(), lights: Lt.build() };
}
// kind bỏ trống → chọn theo màu (cố định cho cùng một màu)
export function makeCar(color = 0xd35400, kind = null) {
  if (!CAR_KINDS.includes(kind)) kind = 'sedan';
  if (kind === 'taxi') color = 0xf4f4f4;
  const parts = vehCached(`car|${kind}`, () => (kind === 'truck' ? truckParts() : carParts(kind)));
  const g = new THREE.Group();
  for (const [geo, m] of [[parts.paint, paintMat(color)], [parts.dark, VEH_MAT], [parts.lights, VEH_LIGHT]]) {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = m !== VEH_LIGHT;
    o.receiveShadow = true;
    g.add(o);
  }
  g.userData = { kind };
  return g;
}

// Hình giản lược cho xe kẹt giờ cao điểm (vẽ hàng loạt một lần): thân trắng nhận màu từng chiếc, kính / lốp tối
export function jamCarGeo() {
  return vehCached('jamCar', () => {
    const L = new PartList();
    L.add(sideGeo([[-2.0, 0.32], [2.0, 0.32], [2.03, 0.65], [1.9, 0.85], [-2.0, 0.9], [-2.05, 0.6]], 1.76, 0), 0xffffff);
    L.add(sideGeo([[-1.4, 0.9], [0.95, 0.9], [0.4, 1.4], [-0.9, 1.4]], 1.6, 0), GLASS, 0, 0, 0, 0, 0, 0, 1);
    for (const x of [-0.8, 0.8]) for (const z of [1.3, -1.3]) L.add(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 8).rotateZ(PI / 2), BLACK, x, 0.33, z, 0, 0, 0, 1);
    return L.build();
  });
}
export function jamMotoGeo() {
  return vehCached('jamMoto', () => {
    const L = new PartList();
    L.add(sideGeo([[-0.85, 0.5], [-0.9, 0.8], [0.0, 0.85], [0.6, 1.05], [0.75, 0.95], [0.4, 0.4], [-0.5, 0.4]], 0.32, 0), 0xffffff);
    for (const z of [0.62, -0.62]) L.add(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8).rotateZ(PI / 2), BLACK, 0, 0.3, z, 0, 0, 0, 1);
    L.add(new THREE.BoxGeometry(0.36, 0.55, 0.26), 0x4a4f57, 0, 1.25, -0.1, 0, 0, 0, 0.8); // người lái
    L.add(new THREE.IcosahedronGeometry(0.15, 0), 0x3a3f47, 0, 1.68, -0.08, 0, 0, 0, 1);
    return L.build();
  });
}

// Xe máy NPC (có người lái)
export function makeNpcMoto(color, rng) {
  const g = new THREE.Group();
  const bike = makeBike(color, rng.pick(['underbone', 'underbone', 'scooter', 'scooter', 'cub', 'sport']));
  bike.userData.bagMesh.visible = false;
  g.add(bike);
  const rider = makePerson({ ...randomPersonOpts(rng, null, { sitting: true }), hat: 'helmet', hatColor: rng.pick([0xe74c3c, 0xf1c40f, 0xffffff, 0x2980b9]) });
  rider.position.set(0, sitY(), -0.15);
  setSitting(rider, true);
  g.add(rider);
  g.userData.bike = bike;
  return g;
}

export function makeDog(color = 0xb5651d) {
  const g = new THREE.Group();
  g.add(box(0.32, 0.3, 0.75, color, 0, 0.45, 0));
  g.add(box(0.26, 0.26, 0.3, color, 0, 0.66, 0.42));
  g.add(box(0.12, 0.1, 0.14, 0x222222, 0, 0.63, 0.6));
  g.add(box(0.06, 0.06, 0.3, color, 0, 0.62, -0.45));
  const legs = [];
  for (const [x, z] of [[-0.1, 0.25], [0.1, 0.25], [-0.1, -0.25], [0.1, -0.25]]) {
    const l = box(0.08, 0.32, 0.08, color, x, 0.16, z);
    legs.push(l);
    g.add(l);
  }
  g.userData.legs = legs;
  return g;
}

export function makeCone() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10), mat(0xff6a00));
  c.position.y = 0.3;
  c.castShadow = true;
  g.add(c);
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.08, 10), mat(0xffffff));
  s.position.y = 0.35;
  g.add(s);
  return g;
}

export function makeStool(color) {
  const g = new THREE.Group();
  g.add(box(0.32, 0.05, 0.32, color, 0, 0.32, 0));
  for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) g.add(box(0.04, 0.3, 0.04, color, x, 0.15, z));
  return g;
}

// Cột sáng đánh dấu điểm đến
export function makeBeacon(color = 0xffa000) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 40, 16, 1, true), m);
  col.position.y = 20;
  g.add(col);
  const ringM = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.6, 32), ringM);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  g.add(ring);
  g.userData = { col, ring, m, ringM };
  return g;
}

// Vòng tròn lớn trên mặt đất cho địa chỉ mơ hồ
export function makeZoneRing(color = 0x9b59b6) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), m);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  return ring;
}
