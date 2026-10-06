// Mô hình low-poly dựng từ hình khối cơ bản: người, xe máy, ô tô, chó, cọc giao thông.
// Hướng "phía trước" của mọi mô hình là trục +z cục bộ.
import * as THREE from 'three';

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

const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0xffdbac];

export function makePerson({ shirt = 0x3498db, pants = 0x2c3e50, skin = SKINS[0], hat = null, hatColor = 0x2ecc71, hair = 0x1b1b1b, scale = 1, bag = false } = {}) {
  const g = new THREE.Group();
  const body = box(0.5, 0.62, 0.3, shirt, 0, 1.06, 0);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(skin));
  head.position.set(0, 1.58, 0);
  head.castShadow = true;
  g.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(hair));
  hairM.position.set(0, 1.6, -0.01);
  g.add(hairM);
  // mắt nhỏ để biết hướng nhìn
  g.add(box(0.05, 0.05, 0.02, 0x111111, -0.07, 1.6, 0.19));
  g.add(box(0.05, 0.05, 0.02, 0x111111, 0.07, 1.6, 0.19));
  const mkLimb = (w, h, color, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = box(w, h, w + 0.02, color, 0, -h / 2, 0);
    pivot.add(m);
    g.add(pivot);
    return pivot;
  };
  const legL = mkLimb(0.18, 0.75, pants, -0.12, 0.76);
  const legR = mkLimb(0.18, 0.75, pants, 0.12, 0.76);
  const armL = mkLimb(0.13, 0.6, shirt, -0.33, 1.34);
  const armR = mkLimb(0.13, 0.6, shirt, 0.33, 1.34);
  let hatMesh = null;
  if (hat === 'helmet') {
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
  // chỉ thân + đầu đổ bóng (giảm số lệnh vẽ của bóng đổ)
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o === body || o === head;
  });
  g.scale.setScalar(scale);
  g.userData.parts = { legL, legR, armL, armR, body, head, hat: hatMesh, bag: bagMesh };
  return g;
}

export function randomPersonOpts(rng) {
  const shirts = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xe67e22, 0x34495e, 0xff8fab, 0x2ecc71];
  const pants = [0x2c3e50, 0x34495e, 0x7f8c8d, 0x1c2833, 0x5d4037, 0x283593];
  return {
    shirt: rng.pick(shirts),
    pants: rng.pick(pants),
    skin: rng.pick(SKINS),
    hat: rng.chance(0.25) ? 'nonla' : null,
    hair: rng.chance(0.15) ? 0x8d8d8d : 0x1b1b1b,
  };
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

// Xe máy: thân, 2 bánh, yên, ghi đông, đèn pha, túi giao hàng ở yên sau
export function makeBike(color = 0x3a6fb0) {
  const g = new THREE.Group();
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wm = mat(0x1a1a1a, { roughness: 0.9 });
  const wheelF = new THREE.Mesh(wheelGeo, wm);
  wheelF.position.set(0, 0.32, 0.62);
  const wheelR = new THREE.Mesh(wheelGeo, wm);
  wheelR.position.set(0, 0.32, -0.62);
  wheelF.castShadow = wheelR.castShadow = true;
  g.add(wheelF, wheelR);
  const body = box(0.32, 0.36, 1.0, color, 0, 0.62, 0.02, { roughness: 0.35, metalness: 0.2 });
  g.add(body);
  g.add(box(0.3, 0.1, 0.55, 0x222222, 0, 0.86, -0.18)); // yên
  g.add(box(0.12, 0.55, 0.12, 0x555555, 0, 0.78, 0.55)); // cổ phuộc
  g.add(box(0.72, 0.05, 0.05, 0x333333, 0, 1.06, 0.5)); // ghi đông
  g.add(box(0.36, 0.2, 0.18, color, 0, 0.9, 0.62, { roughness: 0.35 })); // đầu xe
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffeeaa, emissiveIntensity: 0.4 }));
  lamp.position.set(0, 0.92, 0.72);
  g.add(lamp);
  const tail = box(0.14, 0.06, 0.04, 0xff2222, 0, 0.78, -0.62, { emissive: 0x880000, emissiveIntensity: 0.6 });
  g.add(tail);
  g.add(box(0.36, 0.04, 0.42, 0x444444, 0, 0.98, -0.55)); // baga
  const bagMesh = box(0.5, 0.42, 0.42, 0x27ae60, 0, 1.22, -0.58);
  g.add(bagMesh);
  g.userData = { wheelF, wheelR, bagMesh, body, lamp };
  return g;
}

export function setBikeColor(bike, color) {
  bike.userData.body.material = mat(color, { roughness: 0.35, metalness: 0.2 });
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
  const bike = makeBike(color);
  bike.userData.bagMesh.visible = false;
  g.add(bike);
  const rider = makePerson({ ...randomPersonOpts(rng), hat: 'helmet', hatColor: rng.pick([0xe74c3c, 0xf1c40f, 0xffffff, 0x2980b9]) });
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
