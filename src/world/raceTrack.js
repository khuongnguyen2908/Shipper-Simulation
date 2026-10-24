// =============================================================
// HÌNH ĐƯỜNG ĐUA THOÁT THÂN (chương 6) — dựng từ đường đã tính (sim/race.js buildTrack), đặt ở gốc bản đồ riêng.
// Mặt đường + lề (theo kiểu đoạn), vạch kẻ, lan can, đất hai bên, cảnh hai bên vẽ hàng loạt (container, cẩu, đèn đường,
// nhà xưởng, cây, dừa nước, nhà xóm, nước kênh / sông), đồ của sự cố (barie, cầu gãy, đường cụt). Chỉ để nhìn — va chạm do game/race.js lo.
// =============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { trackAt, RACE } from '../sim/race.js';
import { makeRng } from '../sim/rng.js';
import { makeSignTexture } from './textures.js';

const mats = new Map();
const mat = (color, opts = {}) => {
  const k = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02, flatShading: true, ...opts }));
  return mats.get(k);
};
// màu mặt đường / đất hai bên theo kiểu đoạn
const ROAD = { port: 0x4a4f57, gate: 0x4a4f57, industrial: 0x3e434a, highway: 0x34383e, work: 0x4a4436, dirt: 0x7a5a3a, village: 0x6b5a45, canal: 0x7a5f40, bridge: 0x6b4f33, levee: 0x6f5a3e, drawbridge: 0x4a4f57, deadend: 0x4a4f57 };
const GROUND = { port: 0x55595f, gate: 0x55595f, industrial: 0x3f4a3a, highway: 0x2f4a2c, work: 0x5a4d38, dirt: 0x2f5a2a, village: 0x3b5530, canal: 0x2d5028, bridge: 0x1f4e6b, levee: 0x355a2f, drawbridge: 0x1f4e6b, deadend: 0x3f4a3a };

// dải mặt phẳng dọc đường: từ lệch a tới lệch b (m), cao y, chỉ các điểm thuộc đoạn si (null = mọi đoạn)
function ribbon(T, ox, oz, a, b, y, color, si = null, step = 1) {
  const pos = [], idx = [];
  let n = 0;
  for (let i = 0; i < T.pts.length; i += step) {
    const p = T.pts[i];
    if (si != null && p.si !== si && !(T.pts[i - 1]?.si === si)) continue;
    const ca = typeof a === 'function' ? a(p) : a, cb = typeof b === 'function' ? b(p) : b;
    const cx = Math.cos(p.h), cz = -Math.sin(p.h);
    pos.push(p.x + cx * ca + ox, y, p.z + cz * ca + oz, p.x + cx * cb + ox, y, p.z + cz * cb + oz);
    if (n > 0) { const k = (n - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    n += 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat(color, { side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}

// Vẽ hàng loạt 1 kiểu khối (geo) ở nhiều chỗ: list [{ x, y, z, ry, sx, sy, sz, color }]
function instanced(geo, list, color = 0xffffff, opts = {}) {
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(geo, mat(color, opts), list.length), d = new THREE.Object3D(), c = new THREE.Color();
  list.forEach((o, i) => {
    d.position.set(o.x, o.y ?? 0, o.z);
    d.rotation.set(0, o.ry ?? 0, 0);
    d.scale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
    if (o.color != null) m.setColorAt(i, c.setHex(o.color));
  });
  m.castShadow = !!opts.shadow;
  m.receiveShadow = true;
  return m;
}
// bụi dừa nước (như ở cửa sông)
function nipaGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const len = 2.6 + (i % 3) * 0.5;
    const g = new THREE.BoxGeometry(0.32, 0.05, len).translate(0, 0, len / 2);
    g.rotateX(-(0.55 + (i % 2) * 0.35));
    g.rotateY((i / 7) * Math.PI * 2);
    parts.push(g);
  }
  return mergeGeometries(parts);
}
// cây dừa: thân cong + tàu lá
function coconutGeo() {
  const parts = [new THREE.CylinderGeometry(0.16, 0.22, 7, 6).translate(0, 3.5, 0)];
  for (let i = 0; i < 6; i++) parts.push(new THREE.BoxGeometry(0.35, 0.05, 2.8).translate(0, 0, 1.4).rotateX(0.5).rotateY((i / 6) * Math.PI * 2).translate(0, 7, 0));
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

export function buildRaceTrack(scene, T, def, origin) {
  const [ox, oz] = origin, g = new THREE.Group(), R = makeRng(4242);
  const addI = (m) => m && g.add(m); // không có chỗ nào thì bỏ qua
  const secs = def.sections || [];
  const at = (s, lat = 0) => { const p = trackAt(T, s, lat); return { x: p.x + ox, z: p.z + oz, h: p.h, w: p.w, si: p.si }; };
  // ---- đất hai bên + mặt đường + lề, theo từng đoạn ----
  secs.forEach((sec, si) => {
    const K = sec.kind || 'highway';
    g.add(ribbon(T, ox, oz, -80, 80, -0.05, GROUND[K] ?? 0x2f4a2c, si, 2));
    g.add(ribbon(T, ox, oz, (p) => -p.w / 2, (p) => p.w / 2, 0.01, ROAD[K] ?? 0x3a3f46, si));
    // lề đường sáng màu (đường nhựa) / bờ cỏ (đường đất)
    const edge = ['dirt', 'village', 'canal', 'levee'].includes(K) ? 0x4f6b3a : 0x8a8f94;
    g.add(ribbon(T, ox, oz, (p) => p.w / 2, (p) => p.w / 2 + 0.6, 0.02, edge, si));
    g.add(ribbon(T, ox, oz, (p) => -p.w / 2 - 0.6, (p) => -p.w / 2, 0.02, edge, si));
    // nước: bờ kênh (bên phải), cầu (2 bên), đê (bên trái)
    if (K === 'canal') g.add(ribbon(T, ox, oz, (p) => -p.w / 2 - 3, (p) => -p.w / 2 - 40, 0.0, 0x245a73, si));
    if (K === 'levee') g.add(ribbon(T, ox, oz, (p) => p.w / 2 + 6, (p) => p.w / 2 + 80, 0.0, 0x245a73, si));
    if (K === 'bridge' || K === 'drawbridge') { g.add(ribbon(T, ox, oz, -80, (p) => -p.w / 2 - 0.6, 0.0, 0x245a73, si)); g.add(ribbon(T, ox, oz, (p) => p.w / 2 + 0.6, 80, 0.0, 0x245a73, si)); }
  });
  // ---- vạch giữa đường (đường nhựa) ----
  const dash = [], posts = [], lamps = [], conts = [], trees = [], nipa = [], cocos = [], houses = [], roofs = [], sheds = [], cones = [], fields = [];
  for (let s = 6; s < T.total; s += 8) {
    const p = at(s), K = secs[p.si]?.kind;
    if (['port', 'industrial', 'highway', 'gate', 'drawbridge'].includes(K)) dash.push({ x: p.x, y: 0.03, z: p.z, ry: p.h });
    if (K === 'highway') { for (const l of [-p.w / 4, p.w / 4]) { const q = at(s, l); dash.push({ x: q.x, y: 0.03, z: q.z, ry: q.h, sx: 0.7 }); } }
  }
  addI(instanced(new THREE.BoxGeometry(0.16, 0.02, 3), dash, 0xe9e3c8));
  // ---- cảnh hai bên theo kiểu đoạn ----
  const CC = [0xc0392b, 0x1d5fa8, 0x27ae60, 0xe67e22, 0xecf0f1, 0x7f8c8d, 0x8e3b2f, 0x16a085];
  for (let s = 0; s < T.total; s += 4) {
    const p = at(s), K = secs[p.si]?.kind, w = p.w;
    const side = (k) => (k % 2 ? 1 : -1);
    if (K === 'port' || K === 'gate') {
      if (Math.floor(s) % 8 === 0) for (const sd of [-1, 1]) {
        const n = 1 + Math.floor(R.next() * 3);
        for (let t = 0; t < n; t++) { const q = at(s, sd * (w / 2 + 4 + R.next() * 14)); conts.push({ x: q.x, y: 1.3 + t * 2.62, z: q.z, ry: q.h + Math.PI / 2, color: CC[Math.floor(R.next() * CC.length)] }); }
      }
      if (Math.floor(s) % 40 === 0) for (const sd of [-1, 1]) { const q = at(s, sd * (w / 2 + 1.5)); lamps.push({ x: q.x, z: q.z }); }
    } else if (K === 'industrial') {
      if (Math.floor(s) % 60 === 0) for (const sd of [-1, 1]) { const q = at(s, sd * (w / 2 + 18 + R.next() * 10)); sheds.push({ x: q.x, y: 4, z: q.z, ry: q.h, sx: 1 + R.next(), sz: 1 + R.next() * 0.6 }); }
      if (Math.floor(s) % 32 === 0) for (const sd of [-1, 1]) { const q = at(s, sd * (w / 2 + 1.5)); lamps.push({ x: q.x, z: q.z }); }
    } else if (K === 'highway') {
      if (Math.floor(s) % 36 === 0) for (const sd of [-1, 1]) { const q = at(s, sd * (w / 2 + 1.5)); lamps.push({ x: q.x, z: q.z }); }
      if (Math.floor(s) % 4 === 0) for (const sd of [-1, 1]) { const q = at(s, sd * (w / 2 + 0.8)); posts.push({ x: q.x, y: 0.45, z: q.z, ry: q.h }); }
      if (R.next() < 0.3) { const q = at(s, side(Math.floor(R.next() * 2)) * (w / 2 + 8 + R.next() * 30)); trees.push({ x: q.x, y: 2.5, z: q.z, sx: 2 + R.next() * 2, sy: 2 + R.next() * 2.5, sz: 2 + R.next() * 2 }); }
    } else if (K === 'work') {
      if (Math.floor(s) % 6 === 0) for (const sd of [-1, 1]) { const q = at(s, sd * (w / 2 - 0.3)); cones.push({ x: q.x, y: 0.35, z: q.z }); }
    } else if (K === 'dirt' || K === 'canal') {
      if (R.next() < 0.5) { const sd = K === 'canal' ? -1 : side(Math.floor(R.next() * 2)); const q = at(s, sd * (w / 2 + 1.5 + R.next() * 3)); nipa.push({ x: q.x, z: q.z, ry: R.next() * 6, sx: 0.8 + R.next() * 0.6, sy: 0.8 + R.next() * 0.6, sz: 0.8 + R.next() * 0.6 }); }
      if (R.next() < 0.08) { const q = at(s, (K === 'canal' ? 1 : side(Math.floor(R.next() * 2))) * (w / 2 + 5 + R.next() * 20)); cocos.push({ x: q.x, z: q.z, ry: R.next() * 6, sy: 0.8 + R.next() * 0.4 }); }
      if (K === 'dirt' && Math.floor(s) % 24 === 0) for (const sd of [-1, 1]) { const q = at(s, sd * (w / 2 + 20)); fields.push({ x: q.x, y: 0.02, z: q.z, ry: q.h }); }
    } else if (K === 'village') {
      if (Math.floor(s) % 12 === 0) for (const sd of [-1, 1]) {
        if (R.next() < 0.25) continue;
        const q = at(s, sd * (w / 2 + 4 + R.next() * 3)), c = [0xe8d8b0, 0xcfe0e8, 0xf0c9a0, 0xd8e8c8, 0xe8c8c8][Math.floor(R.next() * 5)];
        houses.push({ x: q.x, y: 1.6, z: q.z, ry: q.h, color: c, sx: 1 + R.next() * 0.4 });
        roofs.push({ x: q.x, y: 3.5, z: q.z, ry: q.h, color: R.next() < 0.5 ? 0x9c4a2f : 0x5d6d7e, sx: 1 + R.next() * 0.4 });
      }
      if (Math.floor(s) % 30 === 0) { const q = at(s, (w / 2 + 1.2)); lamps.push({ x: q.x, z: q.z }); }
      if (R.next() < 0.12) { const q = at(s, side(Math.floor(R.next() * 2)) * (w / 2 + 12 + R.next() * 15)); trees.push({ x: q.x, y: 2.5, z: q.z, sx: 2.5, sy: 3, sz: 2.5 }); }
    } else if (K === 'levee') {
      if (R.next() < 0.25) { const q = at(s, -(w / 2 + 3 + R.next() * 20)); trees.push({ x: q.x, y: 2.5, z: q.z, sx: 2 + R.next(), sy: 2.5 + R.next() * 2, sz: 2 + R.next() }); }
      if (R.next() < 0.3) { const q = at(s, w / 2 + 2 + R.next() * 3); nipa.push({ x: q.x, z: q.z, ry: R.next() * 6 }); }
    }
  }
  addI(instanced(new THREE.BoxGeometry(6.06, 2.6, 2.44), conts, 0xffffff, { shadow: true }));
  addI(instanced(new THREE.BoxGeometry(0.15, 0.6, 4.1), posts, 0xb0b5ba));
  addI(instanced(new THREE.BoxGeometry(14, 8, 24), sheds, 0x7f97a8));
  addI(instanced(new THREE.IcosahedronGeometry(1, 0), trees, 0x2f5a2c));
  addI(instanced(nipaGeo(), nipa, 0x4e7d36));
  addI(instanced(coconutGeo(), cocos, 0x6b7f3a));
  addI(instanced(new THREE.BoxGeometry(6, 3.2, 7), houses, 0xffffff));
  addI(instanced(new THREE.ConeGeometry(5.2, 1.6, 4).rotateY(Math.PI / 4), roofs, 0xffffff));
  addI(instanced(new THREE.ConeGeometry(0.25, 0.7, 8), cones, 0xff6b1a));
  addI(instanced(new THREE.BoxGeometry(30, 0.02, 22), fields, 0x4f8a3a));
  // đèn đường: cột + bóng tự sáng
  addI(instanced(new THREE.CylinderGeometry(0.08, 0.1, 7, 6).translate(0, 3.5, 0), lamps, 0x6b6b6b));
  addI(instanced(new THREE.BoxGeometry(0.9, 0.18, 0.4).translate(0, 7, 0), lamps, 0xfff1c2, { emissive: 0xffe0a0, emissiveIntensity: 1.6 }));
  // cẩu bờ ở bến (vài cái)
  for (let s = 80; s < (T.secStart[1] ?? 0); s += 160) {
    const q = at(s, -(secs[0].width || 12) / 2 - 10), cr = new THREE.Group();
    for (const dx of [-4, 4]) for (const dz of [-4, 4]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 22, 0.9), mat(0xd35400)); leg.position.set(dx, 11, dz); cr.add(leg); }
    const boom = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 40), mat(0xe67e22)); boom.position.set(0, 23, 10); cr.add(boom);
    cr.position.set(q.x, 0, q.z); cr.rotation.y = q.h + Math.PI / 2;
    g.add(cr);
  }
  // ---- đồ của sự cố ----
  const props = {};
  secs.forEach((sec, si) => (sec.events || []).forEach((e, k) => {
    const id = `${si}:${k}`, s = T.secStart[si] + (e.at || 0), p = at(s);
    if (e.type === 'barrier') { // cổng cảng: chòi bảo vệ + cần barie (xoay quanh trụ bên phải)
      const grp = new THREE.Group(), pivot = new THREE.Group();
      grp.position.set(p.x, 0, p.z); grp.rotation.y = p.h;
      const booth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.4), mat(0xecf0f1)); booth.position.set(-p.w / 2 - 1.8, 1.3, 0); grp.add(booth);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), mat(0x555555)); post.position.set(-p.w / 2 - 0.3, 0.6, 0); grp.add(post);
      pivot.position.set(-p.w / 2 - 0.3, 1.1, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.4, 0.16, 0.16), mat(0xd62d20)); arm.position.set((p.w + 0.4) / 2, 0, 0); pivot.add(arm);
      for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.17, 0.17), mat(0xffffff)); st.position.set(1 + i * 2.2, 0, 0); pivot.add(st); }
      pivot.rotation.z = 1.35; // đang mở (dựng đứng)
      grp.add(pivot);
      g.add(grp);
      props[id] = { kind: 'barrier', pivot };
    } else if (e.type === 'jump') { // cầu tạm gãy: khúc giữa sụp mất, 2 đầu chìa ra
      const gap = 14, grp = new THREE.Group();
      grp.position.set(p.x, 0, p.z); grp.rotation.y = p.h;
      const deck = (z0, z1) => { const d = new THREE.Mesh(new THREE.BoxGeometry(p.w + 1.2, 0.3, z1 - z0), mat(0x6b4f33)); d.position.set(0, -0.12, (z0 + z1) / 2); grp.add(d); };
      deck(-110, -gap / 2); deck(gap / 2, 110);
      for (const z of [-gap / 2 - 0.2, gap / 2 + 0.2]) { const brk = new THREE.Mesh(new THREE.BoxGeometry(p.w + 1.2, 0.5, 0.6), mat(0x4a3622)); brk.position.set(0, -0.6, z); brk.rotation.x = z < 0 ? 0.5 : -0.5; grp.add(brk); }
      for (const z of [-60, -30, 30, 60]) for (const sd of [-1, 1]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 6), mat(0x4a3622)); pl.position.set(sd * (p.w / 2 + 0.4), -3, z); grp.add(pl); }
      // khúc gãy: mặt đường đè lên đoạn này bị khoét (vẽ nước đè lên)
      const hole = new THREE.Mesh(new THREE.BoxGeometry(p.w + 2, 0.2, gap), mat(0x245a73)); hole.position.set(0, 0.03, 0); grp.add(hole);
      g.add(grp);
      props[id] = { kind: 'jump', gap };
    } else if (e.type === 'drawbridge') { // cầu cất: 2 nửa cầu xoay quanh bản lề 2 đầu, nâng lên giữa sông
      const L = RACE.leaf, w = p.w, grp = new THREE.Group();
      grp.position.set(p.x, 0, p.z); grp.rotation.y = p.h;
      // khe sông giữa 2 bản lề (lộ ra khi cầu nâng)
      const water = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.02, L * 2), mat(0x245a73)); water.position.y = 0.035; grp.add(water);
      for (const sd of [-1, 1]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, L * 2), mat(0x5d6166)); wall.position.set(sd * (w / 2 + 0.95), -2, 0); grp.add(wall); } // thành kè 2 bên khe
      const tipLights = [];
      const leaf = (dir) => { // dir = +1: nửa bên này (bản lề ở −L, chìa tới giữa) · −1: nửa bên kia
        const pivot = new THREE.Group(); pivot.position.set(0, 0.06, -dir * L);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.45, L), mat(0x5a6068)); deck.position.set(0, -0.225, dir * L / 2); pivot.add(deck);
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, L - 1), mat(0xe9e3c8)); line.position.set(0, 0.01, dir * L / 2); pivot.add(line);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.5, 0.35), mat(0xf1c40f, { emissive: 0x5a4400, emissiveIntensity: 0.6 })); edge.position.set(0, -0.2, dir * (L - 0.18)); pivot.add(edge); // mép vàng ở đầu nửa cầu
        for (const sd of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, L), mat(0x9aa3ab)); rail.position.set(sd * (w / 2 + 0.3), 0.45, dir * L / 2); pivot.add(rail); }
        for (const sd of [-1, 1]) { const strip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.03, L - 0.4), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.7 })); strip.position.set(sd * (w / 2 - 0.2), 0.02, dir * L / 2); pivot.add(strip); } // vạch phản quang 2 mép: thấy rõ dốc ban đêm
        for (const sd of [-1, 1]) { const tl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0xff2a1a, { emissive: 0xff2a1a, emissiveIntensity: 2.6 })); tl.position.set(sd * (w / 2 + 0.3), 1.05, dir * (L - 0.3)); pivot.add(tl); tipLights.push(tl); } // đèn đỏ ở đầu nửa cầu
        grp.add(pivot);
        return pivot;
      };
      const near = leaf(1), far = leaf(-1);
      // nhà điều khiển + trụ đèn đỏ ở 2 đầu cầu
      const lights = [];
      for (const z of [-L - 4, L + 4]) for (const sd of [-1, 1]) {
        const house = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 3), mat(0xd5d8dc)); house.position.set(sd * (w / 2 + 2.6), 2.5, z); grp.add(house);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 3.4), mat(0x8e3b2f)); roof.position.set(sd * (w / 2 + 2.6), 5.2, z); grp.add(roof);
        const win = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.9, 2.2), mat(0xfff1c2, { emissive: 0xffe0a0, emissiveIntensity: 1.2 })); win.position.set(sd * (w / 2 + 2.6), 3.6, z); grp.add(win);
      }
      for (const z of [-L - 26, -L - 1.5, L + 1.5]) for (const sd of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), mat(0x333333)); pole.position.set(sd * (w / 2 + 0.7), 1.5, z); grp.add(pole);
        for (const k of [0, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0xff2a1a, { emissive: 0xff2a1a, emissiveIntensity: 2.4 })); l.position.set(sd * (w / 2 + 0.7) + (k ? 0.22 : -0.22), 3.1, z); grp.add(l); lights.push(l); }
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1), new THREE.MeshBasicMaterial({ map: makeSignTexture('CẦU ĐANG NÂNG', '#b03a2e') }));
      sign.position.set(0, 4.2, -L - 26); sign.rotation.y = Math.PI; grp.add(sign);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 0.3, 0.3), mat(0x333333)); bar.position.set(0, 3.7, -L - 26); grp.add(bar);
      g.add(grp);
      lights.push(...tipLights);
      props[id] = { kind: 'drawbridge', near, far, lights };
    }
  }));
  // đường cụt (chỉ khi đoạn cuối là "Đường cụt"): tường container + biển "ĐƯỜNG CỤT", phía sau là sông
  if (secs[secs.length - 1]?.kind === 'deadend') {
    const p = at(T.total - 2), grp = new THREE.Group();
    grp.position.set(p.x, 0, p.z); grp.rotation.y = p.h;
    for (let i = -2; i <= 2; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(2.44, 2.6, 6.06), mat(CC[(i + 5) % CC.length])); c.position.set(i * 2.5, 1.3, 4); c.rotation.y = Math.PI / 2; grp.add(c); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: makeSignTexture('ĐƯỜNG CỤT', '#b03a2e') }));
    sign.position.set(0, 3.4, 2.6); sign.rotation.y = Math.PI;
    grp.add(sign);
    g.add(grp);
  }
  scene.add(g);
  return { group: g, props };
}
