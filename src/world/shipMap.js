// =============================================================
// BẢN ĐỒ RIÊNG: TRÊN TÀU HẢI LONG (chương 6) — đặt thật xa thành phố (ngoài tầm nhìn + sương mù) nên không cần ẩn thành phố.
// Gồm: tàu bản đi lại được (world/cargoShip.js walk) · bến cảng Kho 7 dưới chân cầu thang mạn (nền đất y = 0) ·
// sông + bờ bên kia có phố lên đèn (chỉ để nhìn). Vật cản / mặt đi gắn vào lưới + mặt cao của thành phố (toạ độ thế giới).
// Biên đi lại: grid.zones (world/physics.js). Toạ độ tàu: gốc ở ORIGIN, mũi về +z, mạn trái (-x) sát bến.
// =============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCargoShip, SHIP } from './cargoShip.js';
import { makeSignTexture } from './textures.js';
import { ZONES, zonePoint } from '../sim/zones.js';

export const SHIP_ZONE = { id: 'ship', origin: ZONES.ship.origin };
// Biên bản đồ (toạ độ tàu): bến cảng phía tây tới x = -70, dọc bến z ±64; phía đông tới mép tàu
const BOUNDS = { x0: -70, x1: 12, z0: -64, z1: 64 };
const QUAY_X = -13; // mép bến (từ đây ra phía tàu là nước)
// chỗ núp trên bến (màn lẻn chương 6): [x, z, rộng (x), sâu (z), loại] — cont: container nằm ngang · crate: chồng thùng gỗ · drums: pallet phuy (cao ≥ 2,2 m)
export const COVER = [[-28, -6, 6.06, 2.44, 'cont'], [-21, -19, 2.2, 1.6, 'crate'], [-30, -24, 1.8, 1.8, 'drums']];
export const shipPoint = (k) => zonePoint('ship', k);

const mats = new Map();
const mat = (color, opts = {}) => {
  const k = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true, ...opts }));
  return mats.get(k);
};
function box(g, w, h, d, color, x, y, z, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}

// Dựng bản đồ (gọi 1 lần, lúc vào tàu lần đầu). grid / elev: lưới vật cản + mặt cao của thành phố (dùng chung, toạ độ thế giới)
export function buildShipZone(scene, grid, elev, waterMat) {
  const [ox, oz] = SHIP_ZONE.origin;
  const g = new THREE.Group();
  g.position.set(ox, 0, oz);
  const ship = makeCargoShip({ walk: true });
  g.add(ship);
  const ud = ship.userData;
  // loại vật cản: cao (vách, container, kho — tall) chặn camera như nhà · thấp (lan can, cọc) như cột
  const W = (c) => ({ ...c, x0: c.x0 + ox, x1: c.x1 + ox, z0: c.z0 + oz, z1: c.z1 + oz, tag: c.tag || (c.cam || c.tall ? 'house' : 'post') });
  const cols = [];
  const col = (x0, z0, x1, z1, h, extra) => { const c = W({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, tall: h > 2.3, ...extra }); grid.add(c); cols.push(c); return c; };
  for (const c of ud.cols) { const w = W(c); grid.add(w); cols.push(w); }
  for (const p of ud.pads) elev.addPad(p.c.map(([x, z]) => [x + ox, z + oz]), p.y);
  for (const r of ud.ramps) elev.addRamp(r.pts.map((p) => ({ x: p.x + ox, y: p.y, z: p.z + oz })), r.w);

  // ---- nước: sông rộng chạy dọc bến (chừa phần bến) ----
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 2400), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(QUAY_X + 800, 0.03, 0);
  water.receiveShadow = true;
  g.add(water);
  // khe nước giữa bến và thân tàu: không bước xuống được (chừa chỗ chân cầu thang mạn + tấm ván)
  const { GANG } = SHIP, fz0 = GANG.z1 - 1.4, fz1 = GANG.z1 + 2.4;
  col(QUAY_X, BOUNDS.z0, -10.9, fz0, 1.0, { tag: 'water' });
  col(QUAY_X, fz1, -10.9, BOUNDS.z1, 1.0, { tag: 'water' });
  // rào quanh bục chân thang + 2 mép tấm ván (đứng trên đó không rớt xuống nước)
  const bx0 = GANG.x - 0.8, bx1 = GANG.x + 0.8, bz0 = GANG.z1 - 0.2, bz1 = GANG.z1 + 2.2, pz0 = GANG.z1 + 1.1 - 1.0, pz1 = GANG.z1 + 1.1 + 1.0; // tấm ván rộng 2 m (trước 1,24 m: đi xiên ra / vào hay vướng góc)
  col(bx1, fz0, bx1 + 0.2, fz1, 1.2); // phía thân tàu
  col(bx0, bz1, bx1, fz1, 1.2); // phía mũi
  col(QUAY_X, fz0, GANG.x - 0.62, bz0, 1.0); // nước bên trái chân cầu thang
  col(GANG.x + 0.62, fz0, bx1, bz0, 1.0); // nước bên phải chân cầu thang
  col(QUAY_X, bz0, bx0, pz0, 1.2); // nước 2 bên tấm ván
  col(QUAY_X, pz1, bx0, fz1, 1.2);

  // ---- bến cảng Kho 7: nền bê tông, mép kè, cọc buộc dây, kho, container, cẩu khung, đèn, hàng rào ----
  const Q = new THREE.Group();
  g.add(Q);
  box(Q, 160, 0.06, 150, 0x6f7177, QUAY_X - 80, -0.01, 0);
  box(Q, 0.6, 0.35, 140, 0x9a9890, QUAY_X - 0.3, 0.17, 0); // mép kè
  for (let z = -56; z <= 56; z += 14) { box(Q, 0.6, 0.7, 0.6, 0x2d2d2d, QUAY_X - 1.2, 0.35, z); col(QUAY_X - 1.5, z - 0.3, QUAY_X - 0.9, z + 0.3, 0.7); }
  // dây buộc tàu: từ cọc tới mạn tàu
  for (const [zq, zs] of [[-56, -50], [-42, -44], [42, 38], [56, 50]]) {
    const a = new THREE.Vector3(QUAY_X - 1.2, 0.6, zq), b = new THREE.Vector3(-10.9, SHIP.DECK - 0.4, zs);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, a.distanceTo(b), 5), mat(0xd9c9a3));
    rope.position.copy(a).add(b).multiplyScalar(0.5);
    rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    Q.add(rope);
  }
  // nhà kho tôn Kho 7 + biển
  const corr = 0x7f97a8;
  box(Q, 26, 9, 46, corr, -55, 4.5, -18);
  box(Q, 27, 0.5, 47, 0x5d6d7e, -55, 9.2, -18);
  for (const z of [-34, -18, -2]) { box(Q, 0.1, 5.5, 6, 0x4f5b66, -41.95, 2.75, z); for (let y = 0.4; y < 5.5; y += 0.45) box(Q, 0.12, 0.05, 6, 0x3d4a55, -41.9, y, z); }
  col(-68, -41, -42, 5, 9.5);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.8), new THREE.MeshBasicMaterial({ map: makeSignTexture('KHO 7', '#7b2d26') }));
  sign.position.set(-41.9, 7.2, -18);
  sign.rotation.y = Math.PI / 2;
  Q.add(sign);
  // bãi container trên bến (chỗ núp) — chừa lối đi giữa
  const CC = [0xc0392b, 0x1d5fa8, 0x27ae60, 0xe67e22, 0xecf0f1, 0x7f8c8d, 0x8e3b2f];
  let k = 0;
  for (const [x, z, n, rot] of [[-30, 14, 2, 0], [-30, 22, 1, 0], [-36, 14, 3, 0], [-36, 22, 2, 0], [-24, 34, 1, 1], [-31, 34, 2, 1], [-48, 30, 3, 0], [-48, 38, 2, 0], [-56, 30, 1, 0], [-26, -48, 2, 1], [-34, -48, 1, 1], [-22, -30, 1, 0]]) {
    const w = rot ? 6.06 : 2.44, d = rot ? 2.44 : 6.06;
    for (let t = 0; t < n; t++) box(Q, w, 2.6, d, CC[k++ % CC.length], x, 1.3 + t * 2.62, z);
    col(x - w / 2, z - d / 2, x + w / 2, z + d / 2, n * 2.62);
  }
  // chỗ núp màn lẻn (chương 6): chồng thùng gỗ / pallet phuy giữa bãi container và chân cầu thang — cao hơn đầu người, che được tầm nhìn
  for (const [x, z, w, d, kind] of COVER) {
    if (kind === 'cont') box(Q, w, 2.6, d, 0x2e7d4f, x, 1.3, z);
    else if (kind === 'crate') {
      box(Q, w, 1.1, d, 0x9a7446, x, 0.55, z);
      box(Q, w * 0.9, 1.1, d * 0.9, 0x8a6a3a, x - 0.05, 1.65, z + 0.04);
      for (const y of [0.55, 1.65]) box(Q, w + 0.02, 0.1, d + 0.02, 0x5c4424, x, y, z);
    } else { // pallet + phuy xếp 2 tầng
      box(Q, w, 0.15, d, 0x7a5a32, x, 0.08, z);
      for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (const y of [0.6, 1.5]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.88, 10), mat([0x2471a3, 0xc0392b][(i + j + 2) % 2]));
        m.position.set(x + i * w * 0.24, y, z + j * d * 0.24);
        Q.add(m);
      }
    }
    col(x - w / 2, z - d / 2, x + w / 2, z + d / 2, kind === 'cont' ? 2.6 : 2.2, { tall: true });
  }
  // cẩu khung vàng bắc ngang bãi container
  for (const x of [-22, -42]) for (const z of [8, 44]) { box(Q, 0.7, 14, 0.7, 0xf1c40f, x, 7, z, { metalness: 0.3 }); col(x - 0.4, z - 0.4, x + 0.4, z + 0.4, 14); }
  for (const z of [8, 44]) box(Q, 20.7, 1, 1, 0xf1c40f, -32, 14.2, z, { metalness: 0.3 });
  box(Q, 1.4, 1, 36, 0xf1c40f, -32, 14.2, 26, { metalness: 0.3 });
  // đèn cao áp trên bến (tự sáng, không phải đèn thật — nhẹ máy)
  for (const [x, z] of [[-18, -40], [-18, -8], [-18, 24], [-18, 52], [-40, 12]]) {
    box(Q, 0.25, 10, 0.25, 0x6b6b6b, x, 5, z);
    box(Q, 1.4, 0.3, 0.7, 0xfff4cf, x + 0.5, 10, z, { emissive: 0xffe6a0, emissiveIntensity: 1.6 });
    col(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 10);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(5, 16), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.12, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x + 0.5, 0.04, z);
    Q.add(glow);
  }
  // hàng rào lưới quanh bến (biên bản đồ phía đất liền) + cổng đóng
  const fence = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), f = box(Q, L, 2.4, 0.08, 0x8a9399, (x0 + x1) / 2, 1.2, (z0 + z1) / 2, { transparent: true, opacity: 0.55 });
    f.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i <= L; i += 4) box(Q, 0.12, 2.6, 0.12, 0x5f6a72, x0 + ((x1 - x0) * i) / L, 1.3, z0 + ((z1 - z0) * i) / L);
  };
  fence(BOUNDS.x0, BOUNDS.z0, BOUNDS.x0, BOUNDS.z1);
  fence(BOUNDS.x0, BOUNDS.z0, QUAY_X, BOUNDS.z0);
  fence(BOUNDS.x0, BOUNDS.z1, QUAY_X, BOUNDS.z1);
  // ---- bờ bên kia sông (phía đông, xa ~250 m): dải đất tối + phố lên đèn (chỉ để nhìn) ----
  const far = new THREE.Group();
  g.add(far);
  box(far, 300, 1, 1400, 0x2f3b2c, 420, 0.3, 0);
  const winTex = windowsTexture();
  for (let i = 0; i < 46; i++) {
    const h = 8 + ((i * 37) % 30), w = 10 + ((i * 13) % 14), z = -620 + i * 27, x = 300 + ((i * 53) % 70);
    const t = winTex.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 3.2)));
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.55, roughness: 0.9 }));
    b.position.set(x, h / 2, z);
    far.add(b);
  }
  // đất liền phía tây (sau hàng rào)
  box(far, 600, 0.05, 1400, 0x3d4a36, BOUNDS.x0 - 300, -0.03, 0);

  // đèn thật (chỉ 2 bóng, chỉ bật khi đang ở bản đồ này): bóng vàng lờ mờ trong container + đèn trần trong lầu
  const C = SHIP.CAPTIVE;
  const bulb = new THREE.PointLight(0xffd9a0, 6, 9, 1.6);
  bulb.position.set((C.x0 + C.x1) / 2 - 2, SHIP.DECK + C.h - 0.3, (C.z0 + C.z1) / 2);
  const hall = new THREE.PointLight(0xfff0d0, 10, 14, 1.4);
  hall.position.set(0, SHIP.DECK + 2.4, -51.5);
  g.add(bulb, hall);

  // GỘP KHỐI: tàu + bến dựng từ ~330 khối rời (mỗi container, lan can, cột… 1 lần vẽ, lại đổ bóng → vẽ 2 lần) → gộp các khối
  // đứng yên cùng vật liệu thành 1 khối. Chừa phần còn động: cổng cầu thang, cửa container nhốt người, cánh tủ (userData.dynamic)
  for (const h of ud.captive.doors) h.userData.dynamic = true;
  ud.gate.mesh.userData.dynamic = true;
  mergeStatic(g);
  scene.add(g);
  const gateCol = W(ud.gate.box), doorCol = W(ud.captive.door);
  const zone = {
    id: SHIP_ZONE.id, group: g, ship,
    bounds: { x0: BOUNDS.x0 + ox, x1: BOUNDS.x1 + ox, z0: BOUNDS.z0 + oz, z1: BOUNDS.z1 + oz },
    gateOpen: true, doorOpen: true, doorT: 1,
    // cổng đầu cầu thang mạn: đóng = chặn lối xuống tàu
    setGate(open) {
      if (open === this.gateOpen) return;
      this.gateOpen = open;
      ud.gate.mesh.visible = !open;
      if (open) grid.remove(gateCol); else grid.add(gateCol);
    },
    // cửa container nhốt người: đóng = chắn; mở có hoạt cảnh (zoneTick đẩy doorT)
    setDoor(open, instant = false) {
      if (open !== this.doorOpen) { if (open) grid.remove(doorCol); else grid.add(doorCol); }
      this.doorOpen = open;
      if (instant) this.doorT = open ? 1 : 0;
      this.poseDoors();
    },
    poseDoors() {
      const e = this.doorT * this.doorT * (3 - 2 * this.doorT);
      for (const h of ud.captive.doors) h.rotation.y = -h.userData.s * e * 1.75;
    },
    // tủ sắt trong lầu chỉ huy (0 = tủ anh Đạt, 1 = tủ thuyền trưởng…): mở 2 cánh ra (instant: mở lại game → mở sẵn)
    lockerT: [0, 0, 0, 0], lockerOpen: [false, false, false, false],
    setLocker(i, open, instant = false) {
      if (!ud.lockers?.[i]) return;
      this.lockerOpen[i] = !!open;
      if (instant) { this.lockerT[i] = open ? 1 : 0; this.poseLocker(i); }
    },
    poseLocker(i) {
      const e = this.lockerT[i] * this.lockerT[i] * (3 - 2 * this.lockerT[i]);
      for (const h of ud.lockers[i].doors) h.rotation.y = h.userData.s * e * 1.9;
    },
    // camera trong chỗ hẹp: trong container nhốt người / trong lầu chỉ huy → kéo sát, nhìn ngang
    camLimit(p) {
      const x = p.x - ox, z = p.z - oz, C = SHIP.CAPTIVE;
      const onDeck = p.y > SHIP.DECK - 1.5 && p.y < SHIP.DECK + 1.5; // ngồi bệt (bị trói) thì thấp hơn mặt boong chút
      if (onDeck && x > C.x0 && x < C.x1 + 0.3 && z > C.z0 && z < C.z1) return { dist: 2.2, pitch: 0.12, min: 0.7 };
      if (onDeck && x > -9 && x < 9 && z > SHIP.SZ0 && z < SHIP.SZ1) return { dist: 3.2, pitch: 0.2, min: 0.7 };
      return null;
    },
    tick(dt) {
      const want = this.doorOpen ? 1 : 0;
      if (this.doorT !== want) { this.doorT = want > this.doorT ? Math.min(1, this.doorT + dt * 0.8) : Math.max(0, this.doorT - dt * 1.5); this.poseDoors(); }
      for (let i = 0; i < this.lockerT.length; i++) {
        const w = this.lockerOpen[i] ? 1 : 0;
        if (this.lockerT[i] !== w) { this.lockerT[i] = w > this.lockerT[i] ? Math.min(1, this.lockerT[i] + dt * 1.6) : Math.max(0, this.lockerT[i] - dt * 2); this.poseLocker(i); }
      }
    },
  };
  zone.setGate(false);
  zone.setDoor(false, true);
  return zone;
}

// Gộp mọi khối đứng yên trong nhóm g theo vật liệu (giữ nguyên hình, vị trí) → ít lần vẽ hơn hẳn. Bỏ qua: nhánh có userData.dynamic,
// nhiều vật liệu / không phải khối thường. Khối gộp to (> 6 m) mới đổ bóng (đỡ vẽ bóng cho vụn vặt: cột, tay nắm, đèn…)
const VC_MATS = new Map(); // vật liệu màu theo đỉnh (dùng chung)
function mergeStatic(g, isRoot = false) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const groups = new Map(), drop = [];
  const dyn = [];
  const walk = (o) => {
    if (o.userData?.dynamic && !(isRoot && o === g)) { dyn.push(o); return; }
    if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material) && o.geometry?.attributes?.position) {
      const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      for (const k of Object.keys(geo.morphAttributes || {})) delete geo.morphAttributes[k];
      const M = o.material;
      // khối màu trơn (không ảnh dán, không tự sáng, không trong suốt): ghi màu vào từng đỉnh → mọi màu gộp chung 1 khối
      // (container trên tàu + bến mỗi cái 1 màu → trước đây vẫn còn ~110 khối sau khi gộp)
      const plain = M.isMeshStandardMaterial && !M.map && !M.transparent && !M.vertexColors && (!M.emissive || M.emissive.getHex() === 0 || !M.emissiveIntensity);
      let sig, mat = M;
      if (plain) {
        const n = geo.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = M.color.r; col[i * 3 + 1] = M.color.g; col[i * 3 + 2] = M.color.b; }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        sig = `vc:${M.roughness.toFixed(2)}:${M.metalness.toFixed(2)}:${M.flatShading ? 1 : 0}:${M.side}`;
        mat = VC_MATS.get(sig) || VC_MATS.set(sig, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: M.roughness, metalness: M.metalness, flatShading: M.flatShading, side: M.side })).get(sig);
      } else sig = [M.type, M.color?.getHexString(), M.emissive?.getHexString(), M.emissiveIntensity, M.roughness, M.metalness, M.map?.uuid, M.transparent, M.opacity, M.side, M.flatShading].join(':');
      const keys = Object.keys(geo.attributes).sort().join(',');
      const key = `${sig}|${keys}|${o.castShadow ? 1 : 0}`;
      if (!groups.has(key)) groups.set(key, { mat, geos: [], shadow: o.castShadow, recv: o.receiveShadow });
      groups.get(key).geos.push(geo);
      drop.push(o);
    }
    for (const c of o.children) walk(c);
  };
  walk(g);
  for (const o of drop) o.parent?.remove(o);
  for (const { mat, geos, shadow, recv } of groups.values()) {
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat);
    geo.computeBoundingSphere();
    m.castShadow = shadow && geo.boundingSphere.radius > 3;
    m.receiveShadow = recv;
    g.add(m);
  }
  // phần còn động (cánh tủ, cửa container, cổng): gộp các mảnh bên trong mỗi phần (cả phần vẫn quay / ẩn được)
  if (!isRoot) for (const d of dyn) mergeStatic(d, true);
}

// Cửa sổ phố đêm: ô sáng vàng / tối xen kẽ (vẽ canvas)
function windowsTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const c = cv.getContext('2d');
  c.fillStyle = '#0d0f14';
  c.fillRect(0, 0, 32, 32);
  for (const [x, y, on] of [[4, 6, 1], [18, 6, 0], [4, 20, 0], [18, 20, 1]]) { c.fillStyle = on ? '#ffd27a' : '#1b2230'; c.fillRect(x, y, 10, 8); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}
