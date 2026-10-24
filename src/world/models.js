// Mô hình low-poly dựng từ hình khối cơ bản: người, xe máy, ô tô, chó, cọc giao thông.
// Hướng "phía trước" của mọi mô hình là trục +z cục bộ.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../sim/rng.js';
import { personOf, hashStr, HAIR_BY_GENDER } from '../sim/people.js';
import { buildPerson, followTa, JACKET_COLOR } from './person.js';
export { updatePeopleLod, setPeopleMode, setPersonDetail } from './person.js';
export { JACKET_COLOR };

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
// sandal: dép (đế mỏng màu dép + bàn chân trần + quai) thay cho giày
function shinGeo(pants, skin, bare, shoe, sandal = false) {
  return cachedGeo(`sh|${pants}|${skin}|${bare}|${shoe}|${sandal}`, () => {
    const L = new PartList(), foot = -(HIP_Y - THIGH);
    L.add(pCyl(0.068, 0.056, 0.39), bare ? skin : pants, 0, -0.195);
    if (sandal) {
      L.add(pBox(0.12, 0.03, 0.27), shoe, 0, foot + 0.015, 0.03, 0, 0, 0, 1);
      L.add(pBox(0.1, 0.05, 0.22), skin, 0, foot + 0.055, 0.03);
      L.add(pBox(0.11, 0.02, 0.04), shoe, 0, foot + 0.07, 0.08, 0, 0, 0, 1); // quai
      return L.build();
    }
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
// glove: màu găng tay (null = tay trần) · gloveLong: găng ống dài che cả cẳng tay
function foreArmGeo(shirt, skin, short, s, glove = null, gloveLong = false) {
  return cachedGeo(`fa|${shirt}|${skin}|${short}|${s}|${glove}|${gloveLong}`, () => {
    const L = new PartList();
    const hand = glove ?? skin;
    L.add(pCyl(0.05, 0.043, 0.25), gloveLong && glove != null ? glove : short ? skin : shirt, 0, -0.125);
    if (!short && !(gloveLong && glove != null)) L.add(pCyl(0.047, 0.047, 0.03), shade(shirt, 0.7), 0, -0.24);
    L.add(pBox(0.06, 0.09, 0.04), hand, 0, -0.3, 0, 0, 0, 0, 0.85);
    L.add(pBox(0.022, 0.05, 0.026), hand, -s * 0.035, -0.285, 0.02);
    return L.build();
  });
}

// Thân + đầu + mọi thứ gắn cố định (tóc, mũ, túi, váy, mũ trùm áo khoác)
function torsoGeo(o) {
  return cachedGeo(`to|${JSON.stringify(o)}`, () => {
    const { shirt, pants, skin, hat, hatColor, hair, bag, female, style, skirt, helmetStyle, overlay, face, faceColor, uniform } = o;
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
    // phụ kiện đầu: kính (2 tròng + gọng) · khẩu trang (che mũi miệng + quai)
    if (face === 'glasses') {
      for (const s of [-1, 1]) {
        L.add(pBox(0.046, 0.034, 0.012), faceColor, s * 0.042, hy + 0.025, 0.117, 0, 0, 0, 1);
        L.add(pBox(0.008, 0.008, 0.11), faceColor, s * 0.1, hy + 0.032, 0.06, 0, 0, 0, 1);
      }
      L.add(pBox(0.03, 0.008, 0.01), faceColor, 0, hy + 0.032, 0.117, 0, 0, 0, 1);
    } else if (face === 'mask') {
      L.add(pBox(0.17, 0.085, 0.035), faceColor, 0, hy - 0.04, 0.097, 0, 0, 0, 0.95);
      for (const s of [-1, 1]) L.add(pBox(0.006, 0.006, 0.1), faceColor, s * 0.098, hy - 0.01, 0.045, 0, 0, 0, 1);
    }
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
    // áo khoác đồng phục hãng: dải phản quang ngang ngực (trước + sau) + logo trắng trên ngực trái + cổ áo
    if (uniform != null) {
      for (const z of [-0.128, 0.128]) L.add(pBox(0.33, 0.035, 0.02), 0xdfe3e6, 0, 1.18, z, 0, 0, 0, 1);
      L.add(pBox(0.08, 0.06, 0.012), 0xffffff, 0.08, 1.33, 0.13, 0, 0, 0, 1);
      L.add(pCyl(0.07, 0.085, 0.05, 8), shade(uniform, 0.8), 0, 1.44, 0, 0, 0, 0, 1);
    }
    return L.build();
  });
}

// gender: 'm' nam | 'f' nữ (vai, eo hẹp hơn) · hairStyle: short | long | ponytail | bun | bald · skirt: mặc váy (chân màu da)
// sleeves: 'long' | 'short' · shorts: quần short · helmetStyle: 'half' | 'full' (fullface có kính)
// overlay: mặc ngoài — 'raincoat' (áo mưa dài tới mắt cá; kiểu cũ ?nguoicu: cánh dơi) | 'jacket' (áo khoác chống nắng) | null + overlayColor
// shoe: màu giày (bỏ trống = tự chọn theo bộ đồ) · shoeStyle: 'sneaker' | 'sandal' (dép)
// face: phụ kiện đầu 'glasses' | 'mask' + faceColor · gloves: 'gloves' | 'armSleeves' (ống dài) + gloveColor
// Khớp: legL/R (háng) → kneeL/R (gối), armL/R (vai) → elbowL/R (khuỷu); body = phần thân nhún khi đi
// Kiểu người cũ (khối vuông) — giữ lại tạm để so / làm bản "người đơn giản" (đợt P4); bật bằng ?nguoicu
const CLASSIC = typeof location !== 'undefined' && /[?&]nguoicu\b/.test(location.search);
// Dáng theo tuổi: bend = độ cong lưng trên + đầu đưa ra trước (person.js) · hunch = gập nhẹ quanh hông (rad)
// (người già đi đường — npcStyles 'elder' — gập hông 0,26 + chống gậy)
const AGE_BEND = { old: 0.3, elder: 0.55 };
const AGE_HUNCH = { old: 0.04, elder: 0.12 };
export function makePerson(opts = {}) {
  if (CLASSIC) return makePersonClassic(opts);
  let { shirt = 0x3498db, pants = 0x2c3e50, skin = SKINS[0], hat = null, hatColor = 0x2ecc71, hair = 0x1b1b1b, scale = 1, bag = false, gender = 'm', hairStyle, skirt = false, sleeves = 'long', shorts = false, helmetStyle = 'half', overlay = null, shoe = null, shoeStyle = 'sneaker', face = null, faceColor = 0x222222, gloves = null, gloveColor = 0x333333, uniform = null } = opts;
  const female = gender === 'f';
  const overlayColor = opts.overlayColor ?? null; // màu áo khoác chống nắng / áo mưa (theo món đang mặc)
  if (overlay === 'jacket' || overlay === 'raincoat') {
    shirt = overlayColor ?? (overlay === 'jacket' ? JACKET_COLOR : RAINCOAT_COLOR); // áo khoác / áo mưa dài che kín áo trong, luôn tay dài
    sleeves = 'long';
  } else if (uniform != null) {
    shirt = uniform; // áo khoác đồng phục che áo trong, tay dài
    sleeves = 'long';
  }
  shoe ??= [0x2b2b2b, 0xe8e8e8, 0x6b4a2b, 0x34495e][((shirt >>> 3) + (pants >>> 5)) % 4]; // giày đổi theo bộ đồ, cố định cho cùng một người
  // kiểu áo / quần / giày mới + màu phụ, mũ lưỡi trai (hat 'cap'), đồng hồ / vòng tay, balo / túi chéo (data/goods.js OUTFIT_SLOTS)
  const { shirtStyle = null, shirt2 = null, pantsStyle = null, pants2 = null, shoe2 = null, wrist = null, wristColor = 0x222222, carry = null, carryColor = 0x34495e } = opts;
  // build: vóc dáng gầy / đầy đặn / mập · age: tuổi → dáng đứng (sim/people.js AGES, BUILDS)
  const g = buildPerson({ shirt, pants, skin, hat, hatColor, hair, bag, gender, style: hairStyle || (female ? 'long' : 'short'), skirt, sleeves, shorts, helmetStyle, overlay, shoe, shoeStyle, face, faceColor, gloves, gloveColor, uniform,
    shirtStyle, shirt2, pantsStyle, pants2, shoe2, wrist, wristColor, carry, carryColor, build: opts.build || null, bend: AGE_BEND[opts.age] || 0 });
  g.scale.setScalar(scale);
  if (AGE_HUNCH[opts.age]) {
    const p = g.userData.parts;
    p.pose = { hunch: AGE_HUNCH[opts.age] };
    applyPose(p); // người đứng yên (NPC cửa tiệm, xem trước) không chạy animatePerson → đặt dáng ngay
  }
  return g;
}

export function makePersonClassic({ shirt = 0x3498db, pants = 0x2c3e50, skin = SKINS[0], hat = null, hatColor = 0x2ecc71, hair = 0x1b1b1b, scale = 1, bag = false, gender = 'm', hairStyle, skirt = false, sleeves = 'long', shorts = false, helmetStyle = 'half', overlay = null, shoe = null, shoeStyle = 'sneaker', face = null, faceColor = 0x222222, gloves = null, gloveColor = 0x333333, uniform = null } = {}) {
  const female = gender === 'f';
  const style = hairStyle || (female ? 'long' : 'short');
  if (overlay === 'jacket') {
    shirt = JACKET_COLOR; // áo khoác che kín áo trong, luôn tay dài
    sleeves = 'long';
  } else if (uniform != null) {
    shirt = uniform; // áo khoác đồng phục che áo trong, tay dài
    sleeves = 'long';
  }
  const short = sleeves === 'short';
  shoe ??= [0x2b2b2b, 0xe8e8e8, 0x6b4a2b, 0x34495e][((shirt >>> 3) + (pants >>> 5)) % 4]; // giày đổi theo bộ đồ, cố định cho cùng một người
  const sandal = shoeStyle === 'sandal';
  const glove = gloves ? gloveColor : null, gloveLong = gloves === 'armSleeves';
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
  const torso = mesh(torsoGeo({ shirt, pants, skin, hat, hatColor, hair, bag, female, style, skirt, helmetStyle: hat === 'helmet' ? helmetStyle : null, overlay, face: face || null, faceColor: face ? faceColor : null, uniform: overlay !== 'jacket' && uniform != null ? uniform : null }), body, true);
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
    mesh(shinGeo(pants, skin, skirt || shorts, shoe, sandal), knee);
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
    mesh(foreArmGeo(shirt, skin, short, s, glove, gloveLong), el);
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
// sitting: ngồi sau xe → không mặc váy · casual: người thường (không có bộ đồ riêng theo vai) → thêm kiểu áo / quần / giày
// đa dạng (polo, sơ mi, ba lỗ, jean, dép…). NPC có đồ riêng (CSGT, ba gác…) không bật để kiểu áo không đè đồ riêng.
export function randomPersonOpts(rng, gender = null, { sitting = false, casual = false } = {}) {
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
    o.hairStyle = r2.pick(['long', ...HAIR_BY_GENDER.f]); // dài thẳng hay gặp hơn
    o.skirt = !sitting && r2.chance(0.3);
    if (o.skirt) o.pants = r2.pick([0x2c3e50, 0x8e44ad, 0xc0392b, 0x16a085, 0x5d4037]);
  } else o.hairStyle = r2.chance(0.03) ? 'bald' : r2.pick(['short', ...HAIR_BY_GENDER.m.filter((s) => s !== 'bald')]);
  if (o.hair === 0x1b1b1b && r2.chance(0.1)) o.hair = 0x5a3825; // tóc nâu
  // Sài Gòn nóng: nhiều người mặc áo cộc tay; đàn ông hay mặc quần short (nhánh ngẫu nhiên riêng → các lựa chọn trên không đổi)
  const r3 = makeRng(Math.floor(r2.next() * 4294967296));
  o.sleeves = r3.chance(0.55) ? 'short' : 'long';
  if (!o.skirt && o.gender === 'm' && r3.chance(0.25)) o.shorts = true;
  if (casual) {
    const r4 = makeRng(Math.floor(r3.next() * 4294967296)), f = o.gender === 'f';
    if (r4.chance(0.55)) {
      o.shirtStyle = r4.pick(['polo', 'shirt', 'plaid', 'hoodie', 'printed', 'soccer', 'vnteam', ...(f ? ['croptop', 'halter', 'baba', 'turtleneck'] : ['tank', 'tank', 'baba', 'gile', 'zip', 'denim'])]);
      o.shirt2 = r4.pick([0xffffff, 0x222222, 0xf1c40f, 0xc0392b]);
    }
    if (!o.skirt && !o.shorts && r4.chance(0.5)) o.pantsStyle = r4.pick(['jeans', 'jeans', 'slacks', 'jogger', 'cargo', 'track', 'capri', ...(f ? ['wide', 'legging'] : ['boxer'])]);
    if (o.pantsStyle === 'jeans') o.pants = r4.pick([0x2f4f7f, 0x23262b, 0x4a6fa5]);
    o.shoeStyle = r4.pick(['sneaker', 'sneaker', 'sneaker', 'sandal', 'slide', 'flipflop', 'canvas', ...(f ? ['flats', 'strap'] : ['oxford', 'loafer'])]);
    if (r4.chance(0.12)) [o.wrist, o.wristColor] = [r4.pick(['watch', 'bracelet']), r4.pick([0x222222, 0xc0c4c8, 0xd4af37])];
    if (!sitting && r4.chance(0.12)) [o.carry, o.carryColor] = [r4.pick(['backpack', 'crossbody']), r4.pick([0x222222, 0x2e6da4, 0x6b4a2b])];
  }
  return o;
}

// CSGT (chốt + xe tuần tra): nguyên bộ vàng (áo cổ bẻ, cầu vai đỏ, thắt lưng đen + bao súng), mũ bảo hiểm 3/4 vàng chữ CSGT,
// dây đeo chéo ngực + bao bộ đàm, giày da đen; nửa số người đeo khẩu trang xanh
export const CSGT_YELLOW = 0xd5bd6c, CSGT_HELMET = 0xe8c447;
export function csgtLook(rng, sitting = false) {
  return {
    ...randomPersonOpts(rng, 'm', { sitting }),
    shirt: CSGT_YELLOW, pants: CSGT_YELLOW, sleeves: 'long', shirtStyle: 'police', pantsStyle: 'slacks',
    hat: 'helmet', helmetStyle: 'open', hatColor: CSGT_HELMET, shoe: 0x141414, shoeStyle: 'oxford',
    carry: 'crossbody', carryColor: 0x1b1b1b, face: rng.chance(0.5) ? 'mask' : null, faceColor: 0x5dade2,
  };
}

// Ngoại hình NPC từ dữ liệu (places.json → npc, màu đã đổi sang số). Phần không đặt thì
// ngẫu nhiên cố định theo mã địa điểm; giới tính không đặt thì đoán theo tên.
export function npcLook(id, npc) {
  const gender = personOf(npc.name, { gender: npc.gender }).gender; // không đoán được theo tên → cố định theo tên (khớp với xưng hô trong lời thoại)
  const o = { ...randomPersonOpts(makeRng(hashStr(id)), gender), hairStyle: gender === 'f' ? 'long' : 'short', skirt: false, hair: 0x1b1b1b };
  for (const k of ['shirt', 'pants', 'hat', 'hatColor', 'scale', 'hairStyle', 'hair', 'skin', 'skirt', 'age', 'build']) if (npc[k] !== undefined) o[k] = npc[k];
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
  if (p.hold) holdPose(p, s * amount); // TikToker: tay phải luôn giơ điện thoại (rung nhẹ theo bước chân)
  if (p.pose) applyPose(p, phase, amount);
  followTa(p); // tà áo dài theo chân
}

// ---------- TƯ THẾ RIÊNG của NPC (world/npcStyles.js gán p.pose) ----------
// pose: { armR / armL: [vai, khuỷu] (góc giữ cố định — tay cầm gậy, xấp vé số, cặp…) · hunch: lưng còng (rad, gập quanh hông)
//         sway: lắc lư ngang (khách say) · swagger: đi khệnh khạng (vai lắc, chân bước rộng) · ground: ngồi bệt dưới đất
//         lift: { arm: 'R' | 'L', to: [vai, khuỷu], every, hold, rest? } giơ tay định kỳ (chụp ảnh, xem đồng hồ, tạo dáng; rest: góc hạ tay về cho người đứng yên)
//         pet: con chó dắt theo (chân vẫy theo bước người) }
const HIP_H = HIP_Y; // chiều cao hông (gốc gập lưng)
const GROUND_DROP = HIP_Y - 0.12; // ngồi bệt: hông hạ xuống sát đất (đùi nằm ngang)
export function applyPose(p, phase = 0, amount = 0) {
  const P = p.pose, t = performance.now() / 1000;
  if (P.ground) {
    // ngồi bệt: đùi duỗi ra trước sát đất, cẳng chân thẳng, thân hạ xuống ngang hông
    p.legL.rotation.x = p.legR.rotation.x = -1.45;
    p.kneeL.rotation.x = p.kneeR.rotation.x = 0.15;
    p.legL.rotation.z = 0.12;
    p.legR.rotation.z = -0.12;
  }
  // lưng còng: tay không cầm gì vẫn buông thẳng xuống đất (bù góc gập lưng)
  if (P.hunch) for (const k of ['L', 'R']) if (!P['arm' + k]) p['arm' + k].rotation.x -= P.hunch;
  if (P.armR) [p.armR.rotation.x, p.elbowR.rotation.x] = P.armR;
  if (P.armL) [p.armL.rotation.x, p.elbowL.rotation.x] = P.armL;
  if (P.lift) {
    const on = (t % P.lift.every) < P.lift.hold;
    if (on) [p['arm' + P.lift.arm].rotation.x, p['elbow' + P.lift.arm].rotation.x] = P.lift.to;
    // hạ tay về chỗ cũ (người đứng yên không có animatePerson đặt lại tay mỗi khung hình)
    else if (P.lift.rest) [p['arm' + P.lift.arm].rotation.x, p['elbow' + P.lift.arm].rotation.x] = P.lift.rest;
  }
  // gập lưng quanh hông (không quanh gót chân): xoay thân rồi dời lại cho hông đứng yên
  const a = (P.hunch || 0) + (P.slump ? 0.22 + Math.sin(t * 0.7) * 0.06 : 0);
  p.body.rotation.x = a;
  p.body.rotation.z = (P.sway ? Math.sin(t * 1.6) * P.sway : 0) + (P.swagger ? Math.sin(phase) * 0.07 * Math.max(0.4, amount) : 0);
  // giữ hông đứng yên khi thân xoay (gập trước a, nghiêng ngang rz): dời thân bù lại, không thì thân trên trượt khỏi chân
  const rz = p.body.rotation.z;
  p.body.position.x = HIP_H * Math.sin(rz);
  p.body.position.z = -Math.cos(rz) * Math.sin(a) * HIP_H;
  p.body.position.y += HIP_H * (1 - Math.cos(rz) * Math.cos(a)) + (P.ground ? -GROUND_DROP : 0);
  if (P.ground) {
    // ngồi bệt: hông (gốc 2 chân) hạ xuống theo thân
    p.legY0 ??= p.legL.position.y;
    p.legL.position.y = p.legR.position.y = p.legY0 - GROUND_DROP;
  }
  if (P.swagger) {
    p.legL.rotation.z = 0.1;
    p.legR.rotation.z = -0.1;
  }
  if (P.pet) {
    const s = Math.sin(phase * 1.6) * 0.6 * Math.min(1, amount * 1.6);
    P.pet.userData.legs.forEach((l, k) => (l.rotation.x = k % 2 ? s : -s));
  }
}

// ---------- TikToker: người đi đường lúc nào cũng giơ điện thoại quay ----------
// style 'vlog' (kiểu A): giơ điện thoại trước mặt quay phía trước · 'stick' (kiểu B): gậy tự sướng giơ cao, quay chính mình.
// Điện thoại gắn vào cẳng tay phải; màn hình sáng quay về phía người cầm, mặt sau có chấm đỏ đang quay.
const HOLD = { vlog: { arm: -1.5, elbow: -0.85 }, stick: { arm: -2.6, elbow: -0.2 } }; // góc quay quanh trục ngang (âm = đưa ra trước)
const PHONE_MATS = {};
function phoneMats() {
  if (!PHONE_MATS.body) {
    PHONE_MATS.body = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.4, metalness: 0.3 });
    PHONE_MATS.screen = new THREE.MeshBasicMaterial({ color: 0x9fd4ff });
    PHONE_MATS.rec = new THREE.MeshBasicMaterial({ color: 0xff2d2d });
    PHONE_MATS.stick = new THREE.MeshStandardMaterial({ color: 0x2c2c2a, roughness: 0.5, metalness: 0.5 });
  }
  return PHONE_MATS;
}
function holdPose(p, bob = 0) {
  const h = HOLD[p.hold];
  p.armR.rotation.x = h.arm + bob * 0.04;
  p.elbowR.rotation.x = h.elbow;
}
export function holdPhone(g, style = 'vlog') {
  const p = g.userData.parts, M = phoneMats();
  p.hold = HOLD[style] ? style : 'vlog';
  const total = HOLD[p.hold].arm + HOLD[p.hold].elbow; // góc cẳng tay so với thẳng đứng → xoay ngược lại cho điện thoại đứng thẳng
  const at = new THREE.Group();
  at.position.y = p.hold === 'stick' ? -0.92 : -0.33; // bàn tay (−0,3) · đầu gậy tự sướng (cách tay ~0,6 m)
  at.rotation.x = -total;
  p.elbowR.add(at);
  const body = new THREE.Mesh(boxGeo(0.075, 0.15, 0.012), M.body);
  body.castShadow = true;
  at.add(body);
  const screen = new THREE.Mesh(boxGeo(0.064, 0.134, 0.002), M.screen);
  screen.position.z = -0.0075; // mặt trước (về phía người cầm)
  at.add(screen);
  const rec = new THREE.Mesh(boxGeo(0.014, 0.014, 0.004), M.rec);
  rec.position.set(-0.02, 0.055, 0.008); // mặt sau: đèn đỏ đang quay
  at.add(rec);
  if (p.hold === 'stick') {
    const stick = new THREE.Mesh(boxGeo(0.018, 0.62, 0.018), M.stick);
    stick.position.y = -0.61; // từ bàn tay tới đầu gậy
    p.elbowR.add(stick);
  }
  holdPose(p);
  return g;
}

// Ngồi thụp (núp sau thùng rác): ngồi xổm, gối gập hết, lưng khom tới trước, 2 tay đưa ra trước bám thùng.
// on = false: về dáng đứng. Chiều cao thân (hạ xuống bao nhiêu cho chân chạm đất) do Walker tự đo.
export function setCrouch(g, on) {
  setSitting(g, false);
  if (!on) return;
  const p = g.userData.parts;
  p.legL.rotation.x = p.legR.rotation.x = -1.75;
  p.kneeL.rotation.x = p.kneeR.rotation.x = 2.45;
  p.legL.rotation.z = -0.18;
  p.legR.rotation.z = 0.18;
  const bend = 0.55; // khom lưng quanh hông
  p.body.rotation.x = bend;
  p.body.position.set(0, HIP_Y * (1 - Math.cos(bend)), -HIP_Y * Math.sin(bend));
  p.armL.rotation.x = p.armR.rotation.x = -1.25;
  p.elbowL.rotation.x = p.elbowR.rotation.x = -0.7;
  followTa(p);
}

// Bị trói ngồi bệt dưới sàn (cốt truyện): 2 chân duỗi thẳng ra trước, 2 tay quặt ra sau lưng, lưng dựa ra sau chút.
// Đặt người ở độ cao sitY(scale, sàn) để hông chạm sàn.
export function setTied(g, on) {
  setSitting(g, false);
  if (!on) return;
  const p = g.userData.parts;
  p.legL.rotation.x = p.legR.rotation.x = -1.45;
  p.kneeL.rotation.x = p.kneeR.rotation.x = 0.12;
  p.legL.rotation.z = -0.1;
  p.legR.rotation.z = 0.1;
  p.armL.rotation.x = p.armR.rotation.x = 0.55;
  p.elbowL.rotation.x = p.elbowR.rotation.x = -0.9;
  p.armL.rotation.z = 0.12;
  p.armR.rotation.z = -0.12;
  const lean = -0.18;
  p.body.rotation.x = lean;
  p.body.position.set(0, HIP_Y * (1 - Math.cos(lean)), -HIP_Y * Math.sin(lean));
  followTa(p);
}

// Ngồi (trên xe / ghế): đùi đưa ra trước, cẳng chân thả xuống chỗ gác chân, hai tay đưa ra trước (cầm lái).
// chair = true: ngồi ghế — cẳng chân thả thẳng xuống đất, tay để hờ trên đùi
export function setSitting(g, sitting, chair = false) {
  const p = g.userData.parts;
  p.legL.rotation.x = p.legR.rotation.x = sitting ? (chair ? -1.45 : -1.2) : 0;
  p.kneeL.rotation.x = p.kneeR.rotation.x = sitting ? (chair ? 1.45 : 1.25) : 0;
  p.armL.rotation.x = p.armR.rotation.x = sitting ? (chair ? -0.45 : -0.95) : 0;
  p.elbowL.rotation.x = p.elbowR.rotation.x = sitting ? (chair ? -0.55 : -0.35) : -0.15;
  p.armL.rotation.z = -(p.armZ ?? 0.08); // tay buông (người mập dang ra hơn — person.js armZ)
  p.armR.rotation.z = p.armZ ?? 0.08;
  // ngồi xe: banh 2 đùi ra 2 bên (người lái theo kiểu xe — gripBar; người ngồi sau mặc định 0,3 — yên sau rộng) · ngồi ghế / đứng: khép lại
  const spread = sitting && !chair ? p.spread ?? 0.3 : 0;
  p.legL.rotation.z = -spread;
  p.legR.rotation.z = spread;
  p.body.position.set(0, 0, 0);
  p.body.rotation.x = 0;
  // ngồi xe đã tính sẵn góc tay nắm tay lái (gripBar) → dùng góc đó
  if (sitting && !chair && p.grip) {
    [p.armL, p.armR].forEach((arm, k) => [arm.rotation.x, arm.rotation.z] = p.grip[k]);
    [p.elbowL, p.elbowR].forEach((el, k) => (el.rotation.x = p.grip[k][2]));
    // chồm lưng tới trước quanh hông (hông vẫn dính yên)
    const a = p.lean || 0;
    p.body.rotation.x = a;
    p.body.position.set(0, HIP_Y * (1 - Math.cos(a)), -HIP_Y * Math.sin(a));
  }
  // áo mưa dài (kiểu người mới): ngồi xe thì vạt dưới thu ngắn lại, không xuyên xuống thân xe
  if (p.overlay?.userData.coat) p.overlay.scale.y = sitting ? 0.42 : 1;
  if (p.ta?.userData.coatFlap) p.ta.scale.y = sitting ? 0.62 : 1; // vạt trước áo mưa nằm trên đùi, không thò quá gối
  // áo mưa cánh dơi (kiểu người cũ): vạt trước phủ lên đùi (kéo dài + đẩy ra trước), không để gối thò ra
  else if (p.overlay) {
    p.overlay.scale.set(1, sitting ? 0.92 : 1, sitting ? 1.45 : 1);
    p.overlay.position.set(0, sitting ? 0.1 : 0, sitting ? 0.16 : 0);
  }
  followTa(p); // ngồi: tà trước áo dài nằm trên đùi
}

// Tay nắm tay lái: tính góc vai (đưa ra trước + dang ngang) và khuỷu để 2 bàn tay chạm đúng 2 tay nắm của kiểu xe đó
// (tay lái mỗi kiểu xe cao / thấp / rộng khác nhau — BIKE_SPECS.bar). Gọi SAU khi đã đặt người lên xe (đọc g.position = chỗ ngồi
// trong khung xe, g.scale = vóc người). Lưu vào parts.grip để setSitting / pedalPerson dùng lại mỗi lần.
const HAND_LEN = 0.3; // khuỷu → giữa bàn tay (foreArmGeo)
// model: kiểu xe trong BIKE_SPECS, hoặc tự đưa tay lái [nửa bề ngang, cao, xa phía trước] (xe ba gác…)
export function gripBar(g, model) {
  const S = Array.isArray(model) ? { bar: model } : BIKE_SPECS[model] || BIKE_SPECS.underbone;
  const p = g.userData.parts, k = g.scale.x, [bw, by, bz] = S.bar;
  const L1 = UPPER_ARM, L2 = HAND_LEN, cl = (v) => Math.max(-1, Math.min(1, v));
  const sh = p.armR.position; // vai (trong thân), 2 bên đối xứng
  // tay nắm theo hệ tọa độ của người (chưa nhân vóc), nắm phía trong tay nắm một chút
  const T = { x: (bw - 0.03) / k, y: (by - g.position.y) / k, z: (bz - g.position.z) / k };
  // vai khi chồm lưng tới trước góc a (gập quanh hông) → khoảng cách tới tay nắm
  const toGrip = (a) => {
    const h = sh.y - HIP_Y, y = HIP_Y + h * Math.cos(a), z = h * Math.sin(a);
    return [T.x - sh.x, T.y - y, T.z - z];
  };
  // tay không với tới thì chồm người tới trước (tối đa ~30°) cho tay còn hơi gập khuỷu
  let lean = 0;
  while (lean < (S.leanMax ?? 0.52) && Math.hypot(...toGrip(lean)) > L1 + L2 - 0.03) lean += 0.02; // sport bike: tay lái thấp → chồm sâu hơn
  const [px, py, pz] = toGrip(lean);
  // đổi sang hệ tọa độ của thân đang chồm (xoay ngược góc chồm)
  const by2 = py * Math.cos(lean) + pz * Math.sin(lean), bz2 = -py * Math.sin(lean) + pz * Math.cos(lean);
  p.grip = [-1, 1].map((sx) => {
    let dx = sx * px, dy = by2, dz = bz2;
    const d = Math.hypot(dx, dy, dz), D = Math.min(d, L1 + L2 - 0.01); // vẫn xa quá thì duỗi thẳng tay về phía tay nắm
    [dx, dy, dz] = [dx, dy, dz].map((v) => (v * D) / d);
    const ex = -Math.acos(cl((D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2))); // gập khuỷu cho đủ khoảng cách
    const vy = -(L1 + L2 * Math.cos(ex)), vz = -L2 * Math.sin(ex); // cánh tay khi vai chưa xoay
    const az = Math.asin(cl(dx / -vy)); // dang ngang ra / khép vào
    const ax = Math.atan2(dz, dy) - Math.atan2(vz, vy * Math.cos(az)); // đưa ra trước
    return [ax, az, ex];
  });
  p.lean = lean;
  p.spread = S.spread ?? 0.2;
  setSitting(g, true);
}

// Đạp xe đạp: ngồi như trên xe máy, 2 chân đạp vòng ngược pha nhau (phase: góc giò đạp, amount 0..1 theo tốc độ)
// Chân ở trên: đùi đưa cao, gối gập nhiều; chân ở dưới: đùi hạ, gối duỗi. amount = 0 → đúng dáng ngồi yên.
export function pedalPerson(g, phase, amount) {
  setSitting(g, true);
  const p = g.userData.parts;
  for (const [hip, knee, ph] of [[p.legL, p.kneeL, phase], [p.legR, p.kneeR, phase + PI]]) {
    const s = Math.sin(ph) * amount;
    hip.rotation.x = -1.2 - 0.35 * s;
    knee.rotation.x = 1.25 + 0.4 * s;
  }
  p.body.position.y += Math.abs(Math.sin(phase)) * 0.012 * amount; // nhún nhẹ theo nhịp đạp
  followTa(p);
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
// Vỏ "nặn" từ nhiều lát cắt ngang (z = dọc xe): mỗi lát là hình 8 cạnh (đáy hẹp, hông phình, nóc thu lại) — vỏ sport bike thon, không phẳng như sideGeo.
// secs: [{ z, yb (đáy), yt (nóc), w (nửa bề ngang hông), wt? (nửa ngang nóc), wb? (nửa ngang đáy), ku?/kl? (độ cao 2 góc hông, 0..1), acc?: [cạnh] }]
// acc: các cạnh tô màu nhấn từ lát này tới lát sau (0 vai phải, 1 hông phải, 2 hông dưới phải, 3 đáy, 4–6 bên trái, 7 nóc)
// accent = false → phần thường (có bịt 2 đầu) · true → chỉ các mảng màu nhấn
export function loftGeo(secs, accent = false) {
  const ring = (q) => {
    const wt = q.wt ?? q.w * 0.55, wb = q.wb ?? q.w * 0.6, h = q.yt - q.yb, yu = q.yb + h * (q.ku ?? 0.7), yl = q.yb + h * (q.kl ?? 0.28);
    return [[wt, q.yt], [q.w, yu], [q.w, yl], [wb, q.yb], [-wb, q.yb], [-q.w, yl], [-q.w, yu], [-wt, q.yt]].map(([x, y]) => new THREE.Vector3(x, y, q.z));
  };
  const R = secs.map(ring), pos = [], ac = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  // tam giác quay mặt ra ngoài (ra xa điểm "bên trong" ctr)
  const tri = (a, b, c, ctr) => {
    n.subVectors(b, a).cross(ac.subVectors(c, a));
    if (n.lengthSq() < 1e-12) return;
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(ctr);
    if (n.dot(m) < 0) pos.push(a, c, b);
    else pos.push(a, b, c);
  };
  for (let k = 0; k < R.length - 1; k++) {
    const A = R[k], B = R[k + 1], acc = secs[k].acc || [];
    const ctr = new THREE.Vector3(0, (secs[k].yb + secs[k].yt + secs[k + 1].yb + secs[k + 1].yt) / 4, (secs[k].z + secs[k + 1].z) / 2);
    for (let i = 0; i < 8; i++) {
      if (acc.includes(i) !== accent) continue;
      const j = (i + 1) % 8;
      tri(A[i], A[j], B[j], ctr);
      tri(A[i], B[j], B[i], ctr);
    }
  }
  if (!accent) for (const [ri, other] of [[0, 1], [R.length - 1, R.length - 2]]) { // bịt 2 đầu
    const r = R[ri], c = r.reduce((v, p) => v.add(p), new THREE.Vector3()).multiplyScalar(1 / 8);
    const inside = c.clone().setZ(c.z + Math.sign(secs[other].z - secs[ri].z) * 0.05);
    for (let i = 0; i < 8; i++) tri(c, r[i], r[(i + 1) % 8], inside);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.computeVertexNormals();
  return g;
}
// cung dè bánh xe (nửa trên vòng bánh)
const fenderGeo = (R, t = 0.035, arc = 0.55) => new THREE.TorusGeometry(R, t, 3, 8, PI * arc).rotateZ(PI * (0.5 - arc / 2)).rotateY(PI / 2);

const BLACK = 0x161616, DARK = 0x2a2a2a, GREY = 0x6b6f74, CHROME = 0xd5dade, ALU = 0x9aa0a6, SEAT = 0x2b2420, CREAM = 0xf3ead3, GOLD = 0xd4a017, LIME = 0x5ad12b;

// Bánh xe: lốp + vành + nan (đúc 5 chấu hoặc nan căm) + đùm + đĩa phanh (bánh trước) · 'sport': mâm 3 chấu kép đen, chỉ viền xanh lá
function wheelGeo(R, t, spokes, disc) {
  if (spokes === 'sport') return vehCached(`wh|${R}|${t}|sport|${disc}`, () => sportWheelGeo(R, t, disc));
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

// Bánh sport bike: lốp dẹt bản to, mâm 3 chấu kép, chỉ viền mâm xanh lá 2 bên, đĩa phanh đôi + heo dầu vàng (bánh trước)
function sportWheelGeo(R, t, front) {
  const L = new PartList();
  L.add(new THREE.TorusGeometry(R - t, t, 6, 18).scale(1, 1, 1.25).rotateY(PI / 2), BLACK, 0, 0, 0, 0, 0, 0, 0.8);
  L.add(new THREE.CylinderGeometry(R - t * 1.05, R - t * 1.05, 0.05, 18, 1, true).rotateZ(PI / 2), 0x1d1d1d, 0, 0, 0, 0, 0, 0, 0.9);
  for (const s of [-1, 1]) L.add(new THREE.TorusGeometry(R - t * 1.02, 0.007, 3, 18).rotateY(PI / 2), LIME, s * 0.027, 0, 0, 0, 0, 0, 1); // chỉ viền mâm
  L.add(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 8).rotateZ(PI / 2), GREY);
  const len = R - t - 0.03;
  for (let k = 0; k < 3; k++) for (const o of [-0.13, 0.13]) {
    const sp = new THREE.BoxGeometry(0.02, len, 0.022);
    sp.translate(0, len / 2, 0);
    L.add(sp, 0x1d1d1d, 0, 0, 0, (k * 2 * PI) / 3 + o, 0, 0, 1);
  }
  if (front) for (const s of [-1, 1]) {
    L.add(new THREE.CylinderGeometry(R * 0.5, R * 0.5, 0.008, 16).rotateZ(PI / 2), CHROME, s * 0.06, 0, 0, 0, 0, 0, 1); // đĩa phanh
    L.add(new THREE.BoxGeometry(0.03, 0.1, 0.06), GOLD, s * 0.075, 0.1, -0.1, 0.6, 0, 0, 1); // heo dầu
  } else L.add(new THREE.CylinderGeometry(R * 0.36, R * 0.36, 0.008, 14).rotateZ(PI / 2), CHROME, -0.06, 0, 0, 0, 0, 0, 1);
  return L.build();
}

// Mỗi kiểu xe: P = phần sơn, D = phần thường (màu riêng), K = kim loại, rồi các số đo dùng chung
// wheel [bán kính, z trước, z sau, kiểu nan], lamp [y, z], tail [y, z], rackY, bar [nửa rộng, y, z],
// spread: góc banh 2 đùi ra 2 bên khi ngồi (rad) — thân xe / yếm xe càng to càng banh rộng, chân khỏi lún vào xe
const BIKE_SPECS = {
  // Cub cũ: yếm kem, khung xương sống, yên da nâu dài, nan căm, nhiều đồ crôm
  cub: {
    wheel: [0.32, 0.6, -0.6, 'wire', 0.06], lamp: [0.99, 0.66], tail: [0.78, -0.86], rackY: 0.98, bar: [0.33, 1.07, 0.5], spread: 0.2,
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
    wheel: [0.3, 0.62, -0.62, 'mag', 0.068], lamp: [1.0, 0.77], tail: [0.73, -0.92], rackY: 0.98, bar: [0.33, 1.1, 0.56], spread: 0.24,
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
    wheel: [0.26, 0.58, -0.6, 'mag', 0.07], lamp: [1.06, 0.66], tail: [0.74, -0.9], rackY: 0.98, bar: [0.33, 1.1, 0.48], spread: 0.26,
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
    wheel: [0.33, 0.66, -0.66, 'mag', 0.075], lamp: [1.0, 0.74], tail: [1.0, -0.94], rackY: 1.1, bar: [0.31, 1.04, 0.44], spread: 0.28,
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
  // Sport bike phân khối lớn (kiểu Ninja): vỏ "nặn" thon (loftGeo) — mũi nhọn đèn đôi xếch, kính chắn gió khói ôm đầu, gương trên đầu xe,
  // bình xăng gù, yên + đuôi vểnh liền khối, ốp hông dưới yên; mảng xanh lá chanh ở ốp sườn / hông đầu / hông đuôi; tay lái thấp (người lái chồm),
  // gắp nhôm bản to, phuộc sau lò xo đỏ, pô lon ngắn bên phải, phuộc trước lộn ngược vàng, mâm 3 chấu kép. Sơn chính = màu xe (vd anh Đạt: đen).
  // own: tự dựng tay lái / gương / đèn / biển số (không dùng phần chung) · lampGeo: đèn pha đôi (sáng lên ban đêm)
  supersport: {
    wheel: [0.33, 0.74, -0.7, 'sport', 0.085], lamp: [0, 0], tail: [1.08, -1.06], rackY: 1.1, bar: [0.29, 0.96, 0.44], spread: 0.3, leanMax: 0.95, seatZ: -0.26, own: true,
    lampGeo: () => {
      const L = new PartList();
      for (const s of [-1, 1]) L.add(new THREE.BoxGeometry(0.13, 0.04, 0.02), 0xffffff, s * 0.098, 0.915, 1.06, 0, s * 1.0, s * 0.22, 1);
      return L.build();
    },
    build(P, D, K, Lt) {
      const R = 0.33, zf = 0.74, zr = -0.7;
      const paint = (secs) => { P.add(loftGeo(secs), PAINT_WHITE); D.add(loftGeo(secs, true), LIME, 0, 0, 0, 0, 0, 0, 1); }; // vỏ sơn + mảng xanh
      // --- vỏ trên (đầu xe): mũi nhọn, ôm phía trên bánh trước
      paint([
        { z: 1.15, yb: 0.89, yt: 0.95, w: 0.05, wt: 0.03 },
        { z: 1.05, yb: 0.81, yt: 1.02, w: 0.12, wt: 0.05, wb: 0.05 },
        { z: 0.88, yb: 0.74, yt: 1.12, w: 0.2, wt: 0.1, wb: 0.1, acc: [2, 4] },
        { z: 0.68, yb: 0.72, yt: 1.19, w: 0.24, wt: 0.13 },
        { z: 0.52, yb: 0.74, yt: 1.12, w: 0.24, wt: 0.12 },
      ]);
      // --- ốp sườn (che máy) — mảng xanh lá chéo ở hông
      paint([
        { z: 0.62, yb: 0.72, yt: 0.92, w: 0.26, acc: [1] },
        { z: 0.48, yb: 0.58, yt: 0.93, w: 0.27, acc: [1, 5, 2, 4] },
        { z: 0.36, yb: 0.3, yt: 0.92, w: 0.27, acc: [2, 4] },
        { z: 0.18, yb: 0.27, yt: 0.88, w: 0.25, acc: [2, 4] },
        { z: 0.02, yb: 0.3, yt: 0.78, w: 0.21 },
        { z: -0.1, yb: 0.36, yt: 0.66, w: 0.16 },
      ]);
      // --- bình xăng
      paint([
        { z: 0.56, yb: 0.92, yt: 1.05, w: 0.13, wt: 0.06 },
        { z: 0.47, yb: 0.88, yt: 1.1, w: 0.17, wt: 0.08 },
        { z: 0.32, yb: 0.86, yt: 1.15, w: 0.2, wt: 0.1 },
        { z: 0.1, yb: 0.86, yt: 1.13, w: 0.2, wt: 0.11, acc: [] },
        { z: -0.06, yb: 0.9, yt: 1.03, w: 0.16, wt: 0.1 },
      ]);
      // --- ốp hông dưới yên (che khung phụ), sọc xanh chạy dọc
      paint([
        { z: 0.04, yb: 0.6, yt: 0.92, w: 0.17, wb: 0.12 },
        { z: -0.2, yb: 0.66, yt: 0.94, w: 0.16, wb: 0.11, acc: [1, 5] },
        { z: -0.45, yb: 0.76, yt: 0.96, w: 0.15, wb: 0.1 },
        { z: -0.6, yb: 0.86, yt: 0.98, w: 0.12, wb: 0.08 },
      ]);
      // --- đuôi vểnh nhọn (có sọc xanh hông đuôi)
      paint([
        { z: -0.44, yb: 0.88, yt: 1.05, w: 0.16, wt: 0.1 },
        { z: -0.68, yb: 0.94, yt: 1.1, w: 0.13, wt: 0.08, acc: [1, 5] },
        { z: -0.92, yb: 1.0, yt: 1.14, w: 0.08, wt: 0.05 },
        { z: -1.08, yb: 1.06, yt: 1.12, w: 0.03, wt: 0.02 },
      ]);
      // yên đơn (bọc da đen, vân nhám)
      D.add(loftGeo([
        { z: -0.04, yb: 0.9, yt: 0.99, w: 0.15, wt: 0.11 },
        { z: -0.3, yb: 0.9, yt: 1.0, w: 0.14, wt: 0.11 },
        { z: -0.5, yb: 0.92, yt: 1.05, w: 0.13, wt: 0.1 },
      ]), 0x141414);
      // gầm đuôi + bụng
      D.add(loftGeo([
        { z: -0.4, yb: 0.78, yt: 0.9, w: 0.12 },
        { z: -0.8, yb: 0.92, yt: 0.99, w: 0.08 },
        { z: -0.95, yb: 0.99, yt: 1.02, w: 0.05 },
      ]), DARK);
      D.add(loftGeo([
        { z: 0.32, yb: 0.24, yt: 0.36, w: 0.17 },
        { z: 0.0, yb: 0.27, yt: 0.4, w: 0.15 },
        { z: -0.12, yb: 0.32, yt: 0.42, w: 0.1 },
      ]), 0x202020);
      // kính chắn gió khói (mỏng, cong theo đầu xe)
      D.add(loftGeo([
        { z: 0.86, yb: 1.12, yt: 1.15, w: 0.17, wt: 0.15, wb: 0.17 },
        { z: 0.68, yb: 1.22, yt: 1.25, w: 0.15, wt: 0.12, wb: 0.15 },
        { z: 0.58, yb: 1.26, yt: 1.28, w: 0.1, wt: 0.08, wb: 0.1 },
      ]), 0x3a4a56);
      // khung nhôm 2 thanh (lộ dưới bình xăng) + máy
      for (const s of [-1, 1]) K.add(rodGeo([s * 0.17, 0.92, 0.5], [s * 0.19, 0.58, -0.06], 0.035, 5), ALU);
      D.add(new THREE.BoxGeometry(0.3, 0.38, 0.4), 0x262626, 0, 0.5, 0.12);
      // gắp sau nhôm bản to + giảm xóc lò xo đỏ
      for (const s of [-1, 1]) {
        const a = new THREE.Vector3(s * 0.12, 0.5, -0.06), b = new THREE.Vector3(s * 0.12, R, zr), d = b.clone().sub(a);
        const arm = new THREE.BoxGeometry(0.04, 0.09, d.length()); arm.lookAt(d); arm.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
        K.add(arm, ALU);
      }
      K.add(rodGeo([0, 0.46, -0.22], [0, 0.84, -0.34], 0.022), CHROME);
      for (let k = 0; k < 6; k++) D.add(new THREE.TorusGeometry(0.035, 0.009, 3, 8).rotateX(PI / 2 - 0.3), 0xc0392b, 0, 0.52 + k * 0.05, -0.24 - k * 0.016, 0, 0, 0, 1);
      // xích + nhông
      D.add(new THREE.TorusGeometry(0.07, 0.012, 3, 10).rotateY(PI / 2), GREY, -0.13, R, zr, 0, 0, 0, 1);
      D.add(rodGeo([-0.13, 0.4, 0.0], [-0.13, R + 0.06, zr], 0.012, 4), GREY);
      // pô: cổ pô dưới bụng → lon pô ngắn lục giác bên phải, đầu crôm
      K.add(rodGeo([0.06, 0.3, 0.25], [0.14, 0.32, -0.15], 0.04, 7), GREY);
      K.add(rodGeo([0.14, 0.32, -0.15], [0.2, 0.48, -0.5], 0.075, 6), 0x3b3f44);
      K.add(rodGeo([0.2, 0.48, -0.5], [0.21, 0.51, -0.56], 0.05, 6), CHROME);
      // phuộc trước vàng (lộn ngược): ống to vàng trên, ống nhỏ đen dưới + cặp chảng
      for (const s of [-1, 1]) {
        D.add(rodGeo([s * 0.085, 0.64, 0.66], [s * 0.085, 1.0, 0.56], 0.035, 8), GOLD);
        K.add(rodGeo([s * 0.085, R, zf], [s * 0.085, 0.66, 0.655], 0.026, 8), 0x2b2b2b);
      }
      K.add(new THREE.BoxGeometry(0.24, 0.035, 0.08), ALU, 0, 1.0, 0.55);
      // dè trước ôm bánh
      P.add(new THREE.TorusGeometry(R + 0.02, 0.035, 3, 10, PI * 0.42).rotateZ(PI * 0.29).rotateY(PI / 2).scale(2.6, 1, 1), 0xffffff, 0, R, zf);
      // dè sau ôm bánh (dưới gắp) + pát biển số gọn sau đuôi
      D.add(new THREE.TorusGeometry(R + 0.03, 0.03, 3, 8, PI * 0.35).rotateZ(PI * 0.3).rotateY(PI / 2).scale(2.4, 1, 1), DARK, 0, R, zr);
      D.add(rodGeo([0, 0.98, -0.86], [0, 0.82, -1.0], 0.015, 4), DARK);
      D.add(new THREE.BoxGeometry(0.19, 0.13, 0.012), 0xf2f2f2, 0, 0.78, -1.02, 0.3, 0, 0, 1);
      for (const k of [-1, 1]) D.add(new THREE.BoxGeometry(0.14, 0.02, 0.014), 0x222222, 0, 0.78 + k * 0.03, -1.013, 0.3, 0, 0, 1);
      // tay lái thấp (clip-on) 2 bên cổ phuộc + đồng hồ + gác chân lùi sau
      for (const s of [-1, 1]) {
        D.add(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6).rotateZ(PI / 2 - s * 0.2), DARK, s * 0.19, 0.96, 0.44);
        D.add(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 7).rotateZ(PI / 2), BLACK, s * 0.29, 0.94, 0.44);
        // gương gắn trên đầu xe
        D.add(rodGeo([s * 0.22, 1.1, 0.66], [s * 0.3, 1.16, 0.64], 0.01, 4), DARK);
        D.add(new THREE.BoxGeometry(0.11, 0.06, 0.035), BLACK, s * 0.33, 1.17, 0.64, 0, s * 0.2, 0);
        D.add(new THREE.BoxGeometry(0.04, 0.03, 0.12), DARK, s * 0.2, 0.47, -0.2); // gác chân
        // đèn pha đôi xếch + xi nhan
        D.add(new THREE.BoxGeometry(0.15, 0.06, 0.02), 0x0b0b0b, s * 0.094, 0.915, 1.055, 0, s * 1.0, s * 0.22); // viền đèn
        Lt.add(new THREE.BoxGeometry(0.05, 0.025, 0.03), 0xffa21a, s * 0.24, 0.98, 0.78, 0, s * 0.6, 0);
        Lt.add(new THREE.BoxGeometry(0.04, 0.025, 0.04), 0xffa21a, s * 0.1, 0.94, -0.98);
      }
      D.add(new THREE.BoxGeometry(0.07, 0.06, 0.08), 0x0d0d0d, 0, 0.84, 1.08); // hốc gió giữa mũi
      D.add(new THREE.BoxGeometry(0.02, 0.012, 0.18), LIME, 0, 1.0, 0.98, 0.5, 0, 0, 1); // sọc giữa mũi
      D.add(new THREE.BoxGeometry(0.16, 0.08, 0.04), 0x111111, 0, 1.12, 0.54, -0.6, 0, 0); // đồng hồ
      Lt.add(new THREE.BoxGeometry(0.1, 0.03, 0.04), 0xff2a2a, 0, 1.08, -1.06); // đèn hậu

    },
  },
  // Xe đạp: khung ống sơn, yên nhỏ, giò đạp + bàn đạp, baga sau chở túi; không máy, không gương / biển số (plain)
  bicycle: {
    wheel: [0.34, 0.52, -0.52, 'wire', 0.022], lamp: [0.86, 0.47], tail: [0.8, -0.8], rackY: 0.9, bar: [0.27, 1.04, 0.36], spread: 0.06, plain: true, noDisc: true,
    build(P, D, K) {
      const bb = [0, 0.34, 0], seat = [0, 0.86, -0.13], headT = [0, 0.92, 0.38], headB = [0, 0.7, 0.42];
      P.add(rodGeo(seat, headT, 0.022), PAINT_WHITE); // ống ngang
      P.add(rodGeo(bb, headB, 0.026), PAINT_WHITE); // ống chéo
      P.add(rodGeo(bb, seat, 0.024), PAINT_WHITE); // ống đứng
      P.add(rodGeo(headB, headT, 0.026), PAINT_WHITE); // cổ lái
      for (const s of [-1, 1]) {
        P.add(rodGeo([s * 0.05, 0.34, -0.52], seat, 0.014), PAINT_WHITE); // giằng yên
        P.add(rodGeo([s * 0.05, 0.34, -0.52], bb, 0.016), PAINT_WHITE); // giằng xích
        K.add(rodGeo([s * 0.045, 0.34, 0.52], headB, 0.016), CHROME); // phuộc
        K.add(new THREE.BoxGeometry(0.09, 0.02, 0.05), DARK, s * 0.13, 0.34 + s * 0.13, s * 0.06); // bàn đạp
        D.add(rodGeo([s * 0.05, 0.34, -0.5], [s * 0.16, 0.8, -0.62], 0.008), DARK); // chân baga
      }
      K.add(rodGeo([0, 0.92, 0.38], [0, 1.0, 0.34], 0.018), CHROME); // cổ tay lái
      K.add(rodGeo([0, 0.86, -0.13], [0, 0.9, -0.14], 0.014), CHROME); // cọc yên
      D.add(new THREE.BoxGeometry(0.13, 0.05, 0.26), SEAT, 0, 0.92, -0.14); // yên
      K.add(rodGeo([-0.1, 0.34, 0], [0.1, 0.34, 0], 0.012), GREY); // trục giò đạp
      K.add(rodGeo([0.09, 0.47, 0.06], [0.09, 0.21, -0.06], 0.012), GREY); // giò đạp
      D.add(new THREE.TorusGeometry(0.1, 0.01, 4, 14).rotateY(PI / 2), GREY, 0.07, 0.34, 0); // đĩa xích
      D.add(sideGeo([[-0.52, 0.33], [0.0, 0.25], [0.0, 0.43], [-0.52, 0.35]], 0.01), DARK, 0.07); // xích
      P.add(fenderGeo(0.38, 0.02, 0.4), PAINT_WHITE, 0, 0.34, -0.52, 0.5); // dè sau
    },
  },
};
export const BIKE_MODELS = Object.keys(BIKE_SPECS);
// chỗ ngồi người lái theo kiểu xe (sport bike: yên lùi về sau)
export const bikeSeatZ = (model) => BIKE_SPECS[model]?.seatZ ?? -0.05;

// Phần dùng chung mọi kiểu: tay lái, gương, đồng hồ, gác chân, chân chống, biển số, baga
// S.plain (xe đạp): chỉ tay lái + tay nắm + đèn hậu phản quang + baga
function commonBikeParts(S, D, K, Lt) {
  const [bw, by, bz] = S.bar, [ty, tz] = S.tail, [ly, lz] = S.lamp;
  D.add(new THREE.CylinderGeometry(0.018, 0.018, bw * 2, 6).rotateZ(PI / 2), DARK, 0, by, bz);
  if (S.plain) {
    for (const s of [-1, 1]) D.add(new THREE.CylinderGeometry(0.028, 0.028, 0.11, 7).rotateZ(PI / 2), BLACK, s * bw, by, bz);
    Lt.add(new THREE.BoxGeometry(0.08, 0.04, 0.03), 0xff2a2a, 0, ty, tz);
    D.add(new THREE.BoxGeometry(0.36, 0.03, 0.36), DARK, 0, S.rackY - 0.06, -0.62); // baga
    return;
  }
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
    S.build(P, D, K, Lt);
    if (!S.own) commonBikeParts(S, D, K, Lt); // own: kiểu xe tự dựng tay lái, gương, đèn, biển số
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
  const wheelF = mk(wheelGeo(R, t, spokes, !S.noDisc), VEH_MAT, 0, R, zf);
  const wheelR = mk(wheelGeo(R, t, spokes, false), VEH_MAT, 0, R, zr);
  // đèn pha: vật liệu riêng từng xe (ban đêm sáng lên)
  const lampGeo = S.lampGeo ? vehCached(`lamp|${model}`, S.lampGeo) : new THREE.IcosahedronGeometry(0.075, 1).scale(1, 0.8, 0.5); // đèn pha riêng của kiểu xe (vd đèn đôi xếch)
  const lamp = mk(lampGeo, new THREE.MeshStandardMaterial({ color: 0xfff4c8, emissive: 0xffeeaa, emissiveIntensity: 0.4 }), 0, S.lamp[0], S.lamp[1]);
  lamp.castShadow = false;
  const bagY = S.rackY + 0.24;
  const bagMesh = mk(bagGeo(), VEH_MAT, 0, bagY, -0.62);
  bagMesh.visible = !S.plain; // xe đạp: chưa chạy đơn → không chở thùng giao hàng
  g.userData = { wheelF, wheelR, wheelRadius: R, bagMesh, bagY, body, painted: [body], lamp, model, noBag: !!S.plain };
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
  rider.position.set(0, sitY(), -0.05);
  g.add(rider);
  gripBar(rider, bike.userData.model);
  g.userData.bike = bike;
  return g;
}

// Chó ta vàng (chó cỏ Việt Nam): mình thon, chân cao, tai dựng nhọn, đuôi cong vểnh lên, mõm + ức màu nhạt, mũi đen.
// color: màu lông chính (vàng đậm / vàng / vàng nhạt); userData.legs: 4 chân để vẫy khi chạy
export function makeDog(color = 0xd9a15b) {
  const g = new THREE.Group();
  const c = new THREE.Color(color), light = c.clone().lerp(new THREE.Color(0xf6ead2), 0.6).getHex(), dark = c.clone().multiplyScalar(0.72).getHex();
  g.add(box(0.26, 0.26, 0.72, color, 0, 0.5, 0)); // mình
  g.add(box(0.2, 0.16, 0.2, light, 0, 0.47, 0.28)); // ức trắng
  g.add(box(0.15, 0.2, 0.16, color, 0, 0.66, 0.36)); // cổ
  g.add(box(0.24, 0.22, 0.24, color, 0, 0.8, 0.44)); // đầu
  g.add(box(0.15, 0.12, 0.16, light, 0, 0.75, 0.62)); // mõm
  g.add(box(0.07, 0.06, 0.05, 0x1b1b1b, 0, 0.79, 0.71)); // mũi
  for (const x of [-0.07, 0.07]) {
    const ear = box(0.07, 0.13, 0.05, dark, x, 0.96, 0.4); // tai dựng
    ear.rotation.z = x > 0 ? -0.2 : 0.2;
    g.add(ear);
    g.add(box(0.035, 0.035, 0.02, 0x1b1b1b, x, 0.83, 0.565)); // mắt
  }
  // đuôi cong: 2 khúc vểnh lên rồi quặp về phía lưng
  const t1 = box(0.06, 0.06, 0.22, color, 0, 0.62, -0.42);
  t1.rotation.x = -0.9;
  const t2 = box(0.06, 0.06, 0.16, light, 0, 0.75, -0.38);
  t2.rotation.x = 0.7;
  g.add(t1, t2);
  const legs = [];
  for (const [x, z] of [[-0.09, 0.24], [0.09, 0.24], [-0.09, -0.26], [0.09, -0.26]]) {
    // chân cao, gốc chân ở thân (xoay quanh khớp vai / hông): khối con lệch xuống dưới trong 1 nhóm
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, z);
    pivot.add(box(0.07, 0.42, 0.07, z > 0 ? color : dark, 0, -0.21, 0));
    legs.push(pivot);
    g.add(pivot);
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
