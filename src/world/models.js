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
const RAINCOAT_MAT = new THREE.MeshStandardMaterial({ color: RAINCOAT_COLOR, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
const _col = new THREE.Color(), _mtx = new THREE.Matrix4(), _q = new THREE.Quaternion(), _eul = new THREE.Euler(), _pos = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);

// Gom các mảnh (hình + màu + chỗ đặt) rồi gộp thành một hình duy nhất
class PartList {
  constructor() {
    this.list = [];
  }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, ao = 0.74) {
    this.list.push({ geo, color, x, y, z, rx, ry, rz, ao });
  }
  build() {
    const geos = this.list.map(({ geo, color, x, y, z, rx, ry, rz, ao }) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      g.deleteAttribute('uv');
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
  // áo mưa cánh dơi: tấm nhựa hình nón trùm từ cổ xuống gối, rộng ngang che cả hai tay
  let overlayMesh = null;
  if (overlay === 'raincoat') {
    overlayMesh = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.95, 14, 1, true), RAINCOAT_MAT);
    overlayMesh.position.set(0, 1.0, 0);
    overlayMesh.scale.set(1.45, 1, 0.95);
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
}

// ======================== XE MÁY ========================
// 4 kiểu dáng (gear.json → model). Mọi kiểu giữ yên cao ~0,9 m để người lái / khách ngồi vừa.
// Mỗi phần: [rộng, cao, dài, màu ('paint' = màu xe), x, y, z, nghiêng quanh trục x]
const PAINT = { roughness: 0.35, metalness: 0.2 };
const DARK = 0x2b2b2b, SEAT = 0x222222, METAL = 0x666666, CHROME = 0xbdc3c7, CREAM = 0xf3ead3;
const BIKE_SHAPES = {
  // Cub cũ: yếm màu kem, khung xương sống chéo, yên dài, đồ mạ crôm
  cub: {
    wheel: [0.32, 0.6, 0.09], lamp: [0.98, 0.64], tail: [0.78, -0.56], rackY: 0.98, bar: [0.66, 1.07, 0.5, CHROME],
    parts: [
      [0.4, 0.5, 0.07, CREAM, 0, 0.64, 0.36, -0.25], // yếm
      [0.14, 0.14, 0.5, 'paint', 0, 0.7, 0.08, 0.35], // khung chéo
      [0.28, 0.28, 0.5, 'paint', 0, 0.7, -0.28], // thân sau
      [0.22, 0.2, 0.26, METAL, 0, 0.38, 0], // máy
      [0.28, 0.1, 0.62, 0x3b2a1e, 0, 0.88, -0.22], // yên da nâu
      [0.08, 0.5, 0.08, 0x888888, 0, 0.66, 0.56], // phuộc
      [0.26, 0.14, 0.16, 'paint', 0, 1.0, 0.54], // đầu đèn
      [0.14, 0.08, 0.4, CREAM, 0, 0.66, 0.6], // dè trước
    ],
  },
  // Xe số (Wave): dàn áo nhựa, khoảng trống bước chân giữa yếm và thân
  underbone: {
    wheel: [0.3, 0.62, 0.1], lamp: [1.0, 0.67], tail: [0.8, -0.56], rackY: 0.98, bar: [0.72, 1.08, 0.5, 0x333333],
    parts: [
      [0.3, 0.32, 0.62, 'paint', 0, 0.68, -0.22], // thân sau
      [0.34, 0.42, 0.16, 'paint', 0, 0.66, 0.38], // yếm
      [0.12, 0.1, 0.5, DARK, 0, 0.42, 0.1], // khung dưới (chỗ để chân)
      [0.24, 0.22, 0.3, 0x555555, 0, 0.36, -0.02], // máy
      [0.3, 0.1, 0.6, SEAT, 0, 0.88, -0.22], // yên
      [0.1, 0.5, 0.1, 0x555555, 0, 0.7, 0.56], // phuộc
      [0.34, 0.18, 0.2, 'paint', 0, 0.98, 0.56], // đầu xe
      [0.16, 0.06, 0.36, 'paint', 0, 0.62, 0.62], // dè trước
    ],
  },
  // Tay ga (Vision, SH): bánh nhỏ, sàn để chân phẳng, yếm cao, thân sau bầu, đèn trên tay lái
  scooter: {
    wheel: [0.26, 0.58, 0.12], lamp: [1.04, 0.58], tail: [0.72, -0.65], rackY: 0.98, bar: [0.66, 1.1, 0.46, 0x333333],
    parts: [
      [0.36, 0.06, 0.48, DARK, 0, 0.36, 0.08], // sàn để chân
      [0.42, 0.62, 0.14, 'paint', 0, 0.7, 0.4, -0.18], // yếm cao
      [0.3, 0.2, 0.3, 'paint', 0, 0.42, 0.55], // mũi xe
      [0.42, 0.4, 0.72, 'paint', 0, 0.62, -0.28], // thân sau
      [0.36, 0.1, 0.66, SEAT, 0, 0.88, -0.22], // yên
      [0.6, 0.12, 0.18, 'paint', 0, 1.06, 0.48], // ốp tay lái
    ],
  },
  // Tay côn / mô tô: bình xăng trước yên, đuôi vuốt cao, phuộc vàng, bánh to
  sport: {
    wheel: [0.33, 0.66, 0.15], lamp: [0.98, 0.68], tail: [1.02, -0.78], rackY: 1.1, bar: [0.62, 1.02, 0.46, 0x333333],
    parts: [
      [0.28, 0.3, 0.42, 0x3d3d3d, 0, 0.48, 0.05], // máy
      [0.12, 0.12, 0.7, 'paint', 0, 0.68, 0, 0.15], // khung
      [0.38, 0.24, 0.44, 'paint', 0, 0.9, 0.22], // bình xăng
      [0.26, 0.08, 0.46, SEAT, 0, 0.9, -0.24], // yên
      [0.24, 0.14, 0.42, 'paint', 0, 0.98, -0.56, -0.25], // đuôi
      [0.34, 0.3, 0.16, 'paint', 0, 1.0, 0.56, 0.35], // mặt nạ trước
      [0.1, 0.55, 0.1, 0xd4ac0d, 0, 0.62, 0.6, -0.3], // phuộc vàng
      [0.14, 0.05, 0.34, 'paint', 0, 0.72, 0.66], // dè trước
      [0.09, 0.09, 0.5, 0xaaaaaa, 0.18, 0.44, -0.32, -0.2], // ống xả
    ],
  },
};
export const BIKE_MODELS = Object.keys(BIKE_SHAPES);

// Xe máy: 2 bánh, thân theo kiểu dáng, ghi đông, đèn pha, đèn hậu, baga + túi giao hàng
export function makeBike(color = 0x3a6fb0, model = 'underbone') {
  if (!BIKE_SHAPES[model]) model = 'underbone'; // kiểu lạ (dữ liệu cũ / gõ sai) → xe số
  const B = BIKE_SHAPES[model];
  const g = new THREE.Group();
  const [wr, wz, tire] = B.wheel;
  const wheelGeo = new THREE.CylinderGeometry(wr, wr, tire, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wm = mat(0x1a1a1a, { roughness: 0.9 });
  const wheelF = new THREE.Mesh(wheelGeo, wm);
  wheelF.position.set(0, wr, wz);
  const wheelR = new THREE.Mesh(wheelGeo, wm);
  wheelR.position.set(0, wr, -wz);
  wheelF.castShadow = wheelR.castShadow = true;
  g.add(wheelF, wheelR);
  const painted = [];
  for (const [w, h, d, c, x, y, z, tilt = 0] of B.parts) {
    const m = c === 'paint' ? box(w, h, d, color, x, y, z, PAINT) : box(w, h, d, c, x, y, z);
    m.rotation.x = tilt;
    if (c === 'paint') painted.push(m);
    g.add(m);
  }
  const [bw, by, bz, bc] = B.bar;
  g.add(box(bw, 0.05, 0.05, bc, 0, by, bz)); // ghi đông
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffeeaa, emissiveIntensity: 0.4 }));
  lamp.position.set(0, B.lamp[0], B.lamp[1]);
  g.add(lamp);
  g.add(box(0.14, 0.06, 0.04, 0xff2222, 0, B.tail[0], B.tail[1], { emissive: 0x880000, emissiveIntensity: 0.6 })); // đèn hậu
  g.add(box(0.36, 0.04, 0.42, model === 'cub' ? CHROME : 0x444444, 0, B.rackY, -0.55)); // baga
  const bagY = B.rackY + 0.24;
  const bagMesh = box(0.5, 0.42, 0.42, 0x27ae60, 0, bagY, -0.58);
  g.add(bagMesh);
  g.userData = { wheelF, wheelR, wheelRadius: wr, bagMesh, bagY, body: painted[0], painted, lamp, model };
  return g;
}

export function setBikeColor(bike, color) {
  for (const m of bike.userData.painted) m.material = mat(color, PAINT);
}

export function makeCar(color = 0xd35400) {
  const g = new THREE.Group();
  g.add(box(1.8, 0.7, 4.0, color, 0, 0.65, 0, { roughness: 0.3, metalness: 0.3 }));
  g.add(box(1.6, 0.6, 2.0, color, 0, 1.25, -0.2, { roughness: 0.3, metalness: 0.3 }));
  g.add(box(1.62, 0.45, 1.6, 0x24323f, 0, 1.27, -0.2, { roughness: 0.1, metalness: 0.5 }));
  const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12);
  wg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) {
    const w = new THREE.Mesh(wg, mat(0x111111));
    w.position.set(x, 0.34, z);
    g.add(w);
  }
  const hl = mat(0xffffee, { emissive: 0xffffaa, emissiveIntensity: 0.3 });
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(boxGeo(0.3, 0.15, 0.05), hl);
    h.position.set(x, 0.75, 2.01);
    g.add(h);
  }
  return g;
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
