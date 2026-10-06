// Mô hình low-poly dựng từ hình khối cơ bản: người, xe máy, ô tô, chó, cọc giao thông.
// Hướng "phía trước" của mọi mô hình là trục +z cục bộ.
import * as THREE from 'three';
import { makeRng } from '../sim/rng.js';
import { guessGender, hashStr } from '../sim/people.js';

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

// gender: 'm' nam | 'f' nữ (vai hẹp hơn) · hairStyle: short | long | ponytail | bun | bald · skirt: mặc váy (chân màu da)
// sleeves: 'long' | 'short' (tay ngắn: cẳng tay màu da) · shorts: quần short · helmetStyle: 'half' | 'full' (fullface có kính)
// overlay: mặc ngoài — 'raincoat' (áo mưa cánh dơi) | 'jacket' (áo khoác chống nắng) | null
export function makePerson({ shirt = 0x3498db, pants = 0x2c3e50, skin = SKINS[0], hat = null, hatColor = 0x2ecc71, hair = 0x1b1b1b, scale = 1, bag = false, gender = 'm', hairStyle, skirt = false, sleeves = 'long', shorts = false, helmetStyle = 'half', overlay = null } = {}) {
  const g = new THREE.Group();
  const female = gender === 'f';
  const style = hairStyle || (female ? 'long' : 'short');
  if (overlay === 'jacket') {
    shirt = JACKET_COLOR; // áo khoác che kín áo trong, luôn tay dài
    sleeves = 'long';
  }
  const body = box(female ? 0.44 : 0.5, 0.62, female ? 0.27 : 0.3, shirt, 0, 1.06, 0);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(skin));
  head.position.set(0, 1.58, 0);
  head.castShadow = true;
  g.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(hair));
  hairM.position.set(0, 1.6, -0.01);
  if (style !== 'bald') g.add(hairM);
  // phần tóc thêm theo kiểu
  let hairExtra = null;
  if (style === 'long') {
    hairExtra = box(0.4, 0.46, 0.1, hair, 0, 1.42, -0.15);
    hairExtra.add(box(0.06, 0.3, 0.2, hair, -0.19, 0.06, 0.09), box(0.06, 0.3, 0.2, hair, 0.19, 0.06, 0.09)); // hai bên má
  } else if (style === 'ponytail') {
    hairExtra = box(0.1, 0.32, 0.1, hair, 0, 1.46, -0.25);
    hairExtra.rotation.x = 0.35;
  } else if (style === 'bun') {
    hairExtra = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(hair));
    hairExtra.position.set(0, 1.74, -0.14);
  }
  if (hairExtra) g.add(hairExtra);
  // mắt nhỏ để biết hướng nhìn
  g.add(box(0.05, 0.05, 0.02, 0x111111, -0.07, 1.6, 0.19));
  g.add(box(0.05, 0.05, 0.02, 0x111111, 0.07, 1.6, 0.19));
  // tay/chân xoay quanh khớp trên; top > 0 → đoạn trên dài top mét màu `color`, phần dưới màu `lower`
  const mkLimb = (w, h, color, x, y, top = 0, lower = color) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    if (top > 0) pivot.add(box(w, top, w + 0.02, color, 0, -top / 2, 0), box(w - 0.01, h - top, w + 0.01, lower, 0, -top - (h - top) / 2, 0));
    else pivot.add(box(w, h, w + 0.02, color, 0, -h / 2, 0));
    g.add(pivot);
    return pivot;
  };
  const legW = female ? 0.16 : 0.18, legC = skirt ? skin : pants;
  const legTop = shorts && !skirt ? 0.3 : 0;
  const legL = mkLimb(legW, 0.75, legC, -0.11, 0.76, legTop, skin);
  const legR = mkLimb(legW, 0.75, legC, 0.11, 0.76, legTop, skin);
  const sx = female ? 0.3 : 0.33;
  const armTop = sleeves === 'short' ? 0.22 : 0;
  const armL = mkLimb(0.13, 0.6, shirt, -sx, 1.34, armTop, skin);
  const armR = mkLimb(0.13, 0.6, shirt, sx, 1.34, armTop, skin);
  let skirtMesh = null;
  if (skirt) {
    skirtMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.33, 0.44, 12), mat(pants));
    skirtMesh.position.set(0, 0.56, 0);
    g.add(skirtMesh);
  }
  let hatMesh = null;
  if (hat === 'helmet' && helmetStyle === 'full') {
    // mũ fullface: ôm gần hết đầu, kính tối phía trước
    hatMesh = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.72), mat(hatColor, { roughness: 0.35 }));
    hatMesh.position.set(0, 1.58, 0);
    hatMesh.add(box(0.3, 0.12, 0.06, 0x7f9bb3, 0, 0.02, 0.245, { roughness: 0.1, metalness: 0.6 })); // nhô ra trước mặt mũ
    g.add(hatMesh);
  } else if (hat === 'helmet') {
    hatMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(hatColor, { roughness: 0.4 }));
    hatMesh.position.set(0, 1.6, 0);
    g.add(hatMesh);
  } else if (hat === 'nonla') {
    hatMesh = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.26, 16), mat(0xe8d8a0));
    hatMesh.position.set(0, 1.82, 0);
    g.add(hatMesh);
  } else if (hat === 'police') {
    hatMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.14, 12), mat(0x2e5d3a));
    hatMesh.position.set(0, 1.8, 0);
    g.add(hatMesh);
  }
  let bagMesh = null;
  if (bag) {
    bagMesh = box(0.42, 0.42, 0.22, 0x27ae60, 0, 1.1, -0.27);
    g.add(bagMesh);
  }
  // áo mưa cánh dơi: tấm nhựa hình nón trùm từ cổ xuống gối, rộng ngang che cả hai tay
  let overlayMesh = null;
  if (overlay === 'raincoat') {
    overlayMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 0.95, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: RAINCOAT_COLOR, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.88, side: THREE.DoubleSide }),
    );
    overlayMesh.position.set(0, 1.0, 0);
    overlayMesh.scale.set(1.45, 1, 0.95);
    g.add(overlayMesh);
  } else if (overlay === 'jacket') {
    overlayMesh = box(0.34, 0.16, 0.14, JACKET_COLOR, 0, 1.42, -0.17); // mũ trùm của áo khoác, buông sau gáy
    g.add(overlayMesh);
  }
  // chỉ thân + đầu đổ bóng (giảm số lệnh vẽ của bóng đổ)
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o === body || o === head || o === overlayMesh;
  });
  g.scale.setScalar(scale);
  g.userData.parts = { legL, legR, armL, armR, body, head, hat: hatMesh, bag: bagMesh, hair: hairExtra, skirt: skirtMesh, overlay: overlayMesh };
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

// amount 0..1 (đứng yên → chạy)
export function animatePerson(g, phase, amount) {
  const p = g.userData.parts;
  const a = Math.sin(phase) * 0.7 * amount;
  p.legL.rotation.x = a;
  p.legR.rotation.x = -a;
  p.armL.rotation.x = -a * 0.8;
  p.armR.rotation.x = a * 0.8;
  p.body.position.y = 1.06 + Math.abs(Math.sin(phase)) * 0.04 * amount;
}

export function setSitting(g, sitting) {
  const p = g.userData.parts;
  p.legL.rotation.x = p.legR.rotation.x = sitting ? -1.35 : 0;
  p.armL.rotation.x = p.armR.rotation.x = sitting ? -1.0 : 0;
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
  rider.position.set(0, 0.25, -0.15);
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
