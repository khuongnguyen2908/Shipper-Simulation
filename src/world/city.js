// Dựng thành phố 3D từ dữ liệu bố cục (src/sim/cityLayout.js):
// đường nhựa, vạch kẻ, vỉa hè, nhà ống (instancing), địa điểm đặc biệt có biển hiệu,
// đèn đường, cây xanh, ổ gà. Trả về lưới va chạm + hàm đổi ngày/đêm, mưa.
import * as THREE from 'three';
import { CITY, LOT_W, HALF, roadPos, blockBounds, roadGraph, segmentRect, cutSide, districtAt } from '../sim/cityLayout.js';
import { MAP } from '../data/map.js';
import { pickHouseStyle, blockHouseStyle, treesOf } from '../data/districtTraits.js';
import { buildStreetDecor } from './streetDecor.js';
import { ALLEY } from '../data/places.js';
import { makeRng } from '../sim/rng.js';
import { SpatialGrid } from './physics.js';
import { makeTileTexture, makeAsphaltTexture, makeSignTexture, makeGlowTexture } from './textures.js';
import { HouseGeo, buildHouse, housesForLot, houseMaterial, houseTop } from './houses.js';
import { buildPlace, buildResidential, mergeKits } from './placeBuildings.js';
import { lookOf, lookFloors } from '../data/looks.js';
import { ITEMS } from '../data/items.js';
import { hashStr } from '../sim/people.js';
import { mat } from './models.js';

const WALL_COLORS = [0xe8d5b7, 0xf4c095, 0x9fd8cb, 0xf6e27f, 0xe7a9a9, 0xb8d8e8, 0xd9c3e8, 0xf2f2f2, 0xc9e4a6, 0xf7b267, 0xffe0b5, 0xa9cce3];
const AWNING_COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085];
const SW_H = 0.15; // độ cao vỉa hè

// Thông tin mặt tiền theo hướng: tâm mặt trước, góc xoay, bề rộng, pháp tuyến hướng ra đường
export function frontOf(r, face) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  if (face === 'N') return { x: cx, z: r.z0, rotY: Math.PI, width: r.x1 - r.x0, nx: 0, nz: -1 };
  if (face === 'S') return { x: cx, z: r.z1, rotY: 0, width: r.x1 - r.x0, nx: 0, nz: 1 };
  if (face === 'E') return { x: r.x1, z: cz, rotY: Math.PI / 2, width: r.z1 - r.z0, nx: 1, nz: 0 };
  return { x: r.x0, z: cz, rotY: -Math.PI / 2, width: r.z1 - r.z0, nx: -1, nz: 0 };
}

// opts (công cụ 🏗️ Xây dựng dùng dữ liệu đang sửa, chưa lưu): map, alley (hẻm 42), items (tên món cho biển quán)
export function buildCity(scene, layout, potholes, seed = 7, opts = {}) {
  const alleySpec = opts.alley || ALLEY;
  const itemTable = opts.items || ITEMS;
  const rng = makeRng(seed);
  const grid = new SpatialGrid(16);
  const addBox = (x0, z0, x1, z1, h, tag) => grid.add({ x0, z0, x1, z1, h, tag });
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const W = LOT_W;

  // ---------- mặt đất, đường ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat(0x5d6e4e));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  scene.add(ground);

  const asphalt = makeAsphaltTexture();
  asphalt.repeat.set((34 * HALF) / 136, (34 * HALF) / 136); // giữ cỡ hạt nhựa đường khi bản đồ to ra
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, color: 0xffffff, roughness: 0.92, metalness: 0 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  scene.add(road);

  // vạch giữa đường + vạch qua đường (không vẽ trên mặt sông, trên cầu)
  const G = roadGraph(opts.map);
  const segIdx = (a) => Math.floor((a - CITY.ORIGIN) / CITY.PITCH);
  const dashGeo = new THREE.PlaneGeometry(1, 1);
  dashGeo.rotateX(-Math.PI / 2);
  const dashes = [];
  const nearCross = (v, m) => {
    for (let k = 0; k <= CITY.N; k++) if (Math.abs(v - roadPos(k)) < m) return true;
    return false;
  };
  for (let i = 0; i <= CITY.N; i++) {
    for (let a = -HALF; a <= HALF; a += 6) {
      if (nearCross(a, 9)) continue;
      if (!G.waterSegs.has(`x${i}:${segIdx(a)}`)) dashes.push([roadPos(i), a, 0.18, 3]); // đường dọc
      if (!G.waterSegs.has(`z${i}:${segIdx(a)}`)) dashes.push([a, roadPos(i), 3, 0.18]); // đường ngang
    }
    for (let j = 0; j <= CITY.N; j++) {
      if (G.waterNodes.has(`${i},${j}`) || G.bridgeNodes.has(`${i},${j}`)) continue;
      for (const s of [-1, 1]) {
        for (let t = -5.2; t <= 5.2; t += 1.3) {
          dashes.push([roadPos(i) + t, roadPos(j) + s * 7.6, 0.55, 2.4]);
          dashes.push([roadPos(i) + s * 7.6, roadPos(j) + t, 2.4, 0.55]);
        }
      }
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 }), dashes.length);
  dashes.forEach(([x, z, w, d], k) => {
    dummy.position.set(x, 0.012, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(w, 1, d);
    dummy.updateMatrix();
    dashMesh.setMatrixAt(k, dummy.matrix);
  });
  dashMesh.receiveShadow = true;
  scene.add(dashMesh);

  // ---------- sông, kè, cầu ----------
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.15, metalness: 0.35 });
  const kerbMat = mat(0x8a8f94);
  const railMat = mat(0xd0d3d4, { roughness: 0.5, metalness: 0.4 });
  const deckMat = mat(0x9fa2a4, { roughness: 0.9 });
  const flat = (r, y, m) => {
    const pl = new THREE.Mesh(dashGeo, m);
    pl.scale.set(r.x1 - r.x0, 1, r.z1 - r.z0);
    pl.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    pl.receiveShadow = true;
    scene.add(pl);
  };
  const wall = (x0, z0, x1, z1, h, m, tag) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, x1 - x0), h, Math.max(0.05, z1 - z0)), m);
    w.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    w.castShadow = w.receiveShadow = true;
    scene.add(w);
    addBox(x0, z0, x1, z1, h, tag);
  };
  const H = CITY.ROAD / 2;
  for (const id of G.waterSegs) {
    const m = /^([xz])(\d+):(\d+)$/.exec(id);
    const seg = { axis: m[1], line: +m[2], from: +m[3] };
    const r = segmentRect(seg);
    flat(r, 0.03, waterMat);
    addBox(r.x0, r.z0, r.x1, r.z1, 0.3, 'water');
    // kè thấp dọc hai bờ (mép đường giáp vỉa hè)
    if (seg.axis === 'x') { wall(r.x0 - 0.3, r.z0, r.x0, r.z1, 0.5, kerbMat, 'kerb'); wall(r.x1, r.z0, r.x1 + 0.3, r.z1, 0.5, kerbMat, 'kerb'); }
    else { wall(r.x0, r.z0 - 0.3, r.x1, r.z0, 0.5, kerbMat, 'kerb'); wall(r.x0, r.z1, r.x1, r.z1 + 0.3, 0.5, kerbMat, 'kerb'); }
  }
  // ngã tư trên sông: có cầu → mặt cầu + lan can hai bên giáp nước; không cầu → mặt nước + lan can chắn đầu đường cụt
  const sides = (i, j) => [
    { seg: `x${i}:${j - 1}`, edge: 'N' }, { seg: `x${i}:${j}`, edge: 'S' }, { seg: `z${j}:${i - 1}`, edge: 'W' }, { seg: `z${j}:${i}`, edge: 'E' },
  ];
  const edgeWall = (x, z, edge, h, m, tag) => {
    if (edge === 'N') wall(x - H, z - H - 0.15, x + H, z - H + 0.15, h, m, tag);
    else if (edge === 'S') wall(x - H, z + H - 0.15, x + H, z + H + 0.15, h, m, tag);
    else if (edge === 'W') wall(x - H - 0.15, z - H, x - H + 0.15, z + H, h, m, tag);
    else wall(x + H - 0.15, z - H, x + H + 0.15, z + H, h, m, tag);
  };
  for (const key of [...G.waterNodes, ...G.bridgeNodes]) {
    const [i, j] = key.split(',').map(Number);
    const x = roadPos(i), z = roadPos(j);
    const r = { x0: x - H, x1: x + H, z0: z - H, z1: z + H };
    const bridge = G.bridgeNodes.has(key);
    if (bridge) {
      flat(r, 0.02, deckMat);
      for (const s of sides(i, j)) if (G.waterSegs.has(s.seg)) edgeWall(x, z, s.edge, 1.0, railMat, 'rail');
    } else {
      flat(r, 0.03, waterMat);
      addBox(r.x0, r.z0, r.x1, r.z1, 0.3, 'water');
      for (const s of sides(i, j)) if (!G.waterSegs.has(s.seg) && s.seg.split(':')[1] >= 0 && +s.seg.split(':')[1] < CITY.N) edgeWall(x, z, s.edge, 1.0, railMat, 'rail');
    }
  }

  // ---------- vỉa hè ----------
  const tile = makeTileTexture();
  tile.repeat.set(10, 10);
  const swMat = new THREE.MeshStandardMaterial({ map: tile, roughness: 0.85 });
  const swGeo = new THREE.BoxGeometry(CITY.BLOCK, SW_H, CITY.BLOCK);
  for (let bz = 0; bz < CITY.N; bz++) {
    for (let bx = 0; bx < CITY.N; bx++) {
      const b = blockBounds(bx, bz);
      const m = new THREE.Mesh(swGeo, swMat);
      m.position.set((b.x0 + b.x1) / 2, SW_H / 2, (b.z0 + b.z1) / 2);
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  // ---------- nhà ống A+ (gộp theo từng khối phố, 1 vật liệu chung) ----------
  const houseMat = houseMaterial();
  const houseGroups = new Map();
  const geoAt = (x, z) => {
    const off = CITY.ORIGIN + CITY.ROAD / 2;
    const k = Math.floor((x - off) / CITY.PITCH) + ',' + Math.floor((z - off) / CITY.PITCH);
    if (!houseGroups.has(k)) houseGroups.set(k, new HouseGeo());
    return houseGroups.get(k);
  };
  // Dựng 1–2 căn trên một lô (mặt tiền rộng thì chia 2); trả về độ cao căn cao nhất (cho va chạm)
  const addLotHouses = (r, face, floors, opts = {}) => {
    const f = frontOf(r, face);
    const depth = f.nx ? r.x1 - r.x0 : r.z1 - r.z0;
    let top = 0;
    for (const h of housesForLot({ x: f.x, y: SW_H, z: f.z, nx: f.nx, nz: f.nz, width: f.width, depth }, { floors, colors: WALL_COLORS, seed: rng.int(1, 1e9), ...opts })) {
      buildHouse(geoAt(h.x - f.nx * depth * 0.5, h.z - f.nz * depth * 0.5), h);
      top = Math.max(top, houseTop(h.floors));
    }
    return top;
  };
  // nhà dân theo khu phố (map.json → districts[mã].houses): kiểu khác nhà ống dựng riêng rồi gộp cả thành phố
  const mapData = opts.map || MAP;
  const styleRng = makeRng(seed * 7 + 11);
  const resKits = [];
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  const primary = new Map(); // kiểu nhà chủ đạo của từng khối (nhà cùng kiểu tụ thành dãy)
  const blockStyle = (bx, bz) => {
    const key = bx + ',' + bz;
    if (!primary.has(key)) primary.set(key, blockHouseStyle(districtAt(bx, bz, mapData), makeRng(seed * 131 + bz * 977 + bx * 31 + 5)));
    return primary.get(key);
  };
  for (const l of layout.lots) {
    const floors = l.inAlley ? rng.int(1, 4) : rng.int(2, 6); // nhà trong hẻm thấp hơn nhà mặt phố
    const r = { x0: l.x0 + 0.25, x1: l.x1 - 0.25, z0: l.z0 + 0.25, z1: l.z1 - 0.25 };
    const style = pickHouseStyle(districtAt(l.block[0], l.block[1], mapData), styleRng, l.inAlley, blockStyle(l.block[0], l.block[1]));
    if (style !== 'tube') {
      const f = frontOf(r, l.face);
      const depth = f.nx ? r.x1 - r.x0 : r.z1 - r.z0;
      const { kit, height } = buildResidential(style, { W: f.width, D: depth }, styleRng.int(1, 1e9));
      resKits.push({ kit, matrix: new THREE.Matrix4().compose(_v.set(f.x, SW_H, f.z), _q.setFromEuler(_e.set(0, f.rotY, 0)), _one) });
      addBox(r.x0, r.z0, r.x1, r.z1, height + SW_H, 'house');
      continue;
    }
    const top = addLotHouses(r, l.face, floors, { alley: l.inAlley });
    addBox(r.x0, r.z0, r.x1, r.z1, top + SW_H, 'house');
  }
  if (resKits.length) mergeKits(resKits, scene);
  // trang trí đường phố theo khu (dây đèn lồng, đèn lồng giấy, xe hàng rong)
  const doors = layout.places.map((p) => p.door).filter(Boolean);
  buildStreetDecor(scene, {
    map: mapData, rng: styleRng, addBox, blockStyle, swH: SW_H,
    isPlaceDoor: (x, z) => doors.some((d) => Math.hypot(d.x - x, d.z - z) < 2.4),
  });
  // ---------- khối có hẻm: nhà phía sau (không cửa), mặt hẻm, cột chắn hẻm đi bộ ----------
  const alleyGeo = new THREE.PlaneGeometry(1, 1);
  alleyGeo.rotateX(-Math.PI / 2);
  const alleyMats = { bike: new THREE.MeshStandardMaterial({ color: 0x8d8478, roughness: 0.95 }), walk: new THREE.MeshStandardMaterial({ color: 0xa3998b, roughness: 0.95 }) };
  const postList = [];
  for (const ab of layout.alleyBlocks || []) {
    for (const r of ab.fillers) {
      const top = addLotHouses({ x0: r.x0 + 0.1, x1: r.x1 - 0.1, z0: r.z0 + 0.1, z1: r.z1 - 0.1 }, 'S', rng.int(1, 3), { alley: true, back: true });
      addBox(r.x0, r.z0, r.x1, r.z1, top + SW_H, 'house');
    }
    for (const r of ab.alleys) {
      const m = new THREE.Mesh(alleyGeo, alleyMats[ab.walk ? 'walk' : 'bike']);
      m.scale.set(r.x1 - r.x0, 1, r.z1 - r.z0);
      m.position.set((r.x0 + r.x1) / 2, SW_H + 0.006, (r.z0 + r.z1) / 2);
      m.receiveShadow = true;
      scene.add(m);
    }
    for (const p of ab.posts) {
      postList.push(p);
      addBox(p.x - 0.1, p.z - 0.1, p.x + 0.1, p.z + 0.1, 1, 'post');
    }
  }
  if (postList.length) {
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8), mat(0xe8e8e8, { emissive: 0x333333 }), postList.length);
    postList.forEach((p, k) => {
      dummy.position.set(p.x, SW_H + 0.45, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pm.setMatrixAt(k, dummy.matrix);
    });
    scene.add(pm);
  }

  // nhà vùng ven (ngoài biên bản đồ, chỉ để nhìn): ít chi tiết, quay mặt vào thành phố
  for (let a = -HALF - 6; a <= HALF + 6; a += 12) {
    for (const [x, z, face] of [[a, -HALF - 9, 'S'], [a, HALF + 9, 'N'], [-HALF - 9, a, 'E'], [HALF + 9, a, 'W']]) {
      addLotHouses({ x0: x - 5.5, x1: x + 5.5, z0: z - 5.5, z1: z + 5.5 }, face, rng.int(3, 8), { low: true });
    }
  }

  // ---------- địa điểm: nhà theo "Kiểu nhà" (src/data/looks.js, chọn trong ?editor) ----------
  const signMats = [];
  const addSign = (text, bg, f, y, maxW = 8) => {
    const tex = makeSignTexture(text, bg);
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.6 });
    signMats.push(m);
    const w = Math.min(maxW, f.width - 0.8);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.1875), m);
    s.position.set(f.x + f.nx * 0.08, y, f.z + f.nz * 0.08);
    s.rotation.y = f.rotY;
    scene.add(s);
    return s;
  };
  for (const p of layout.places) {
    const r = { x0: p.x0 + 0.25, x1: p.x1 - 0.25, z0: p.z0 + 0.25, z1: p.z1 - 0.25 };
    const f = frontOf(r, p.face);
    const depth = f.nx ? r.x1 - r.x0 : r.z1 - r.z0;
    const b = buildPlace({
      look: lookOf(p), W: f.width, D: depth, floors: lookFloors(p), color: p.color, signBg: p.signBg, sign: p.sign, short: p.short, kind: p.kind,
      menu: (p.menu || []).map((id) => itemTable[id]?.name).filter(Boolean), seed: hashStr(p.id), inAlley: p.inAlley,
      cut: cutSide(p.lot, p.face), // cả khối chừa góc: góc chừa bên trái / phải nhìn từ đường
    });
    b.group.userData.placeId = p.id; // để công cụ Xây dựng bấm chọn nhà
    b.group.position.set(f.x, SW_H, f.z);
    b.group.rotation.y = f.rotY;
    scene.add(b.group);
    signMats.push(...b.glow);
    if (b.colliders === 'full') addBox(r.x0, r.z0, r.x1, r.z1, b.height + SW_H, 'place');
    else {
      // nhà mở (cây xăng): chỉ chắn cột, trụ bơm, cửa hàng — đổi khung riêng → thế giới
      const c = Math.cos(f.rotY), s = Math.sin(f.rotY);
      const W2 = (x, z) => [f.x + x * c + z * s, f.z - x * s + z * c];
      for (const q of b.colliders) {
        const [ax, az] = W2(q.x0, q.z0), [bx, bz] = W2(q.x1, q.z1);
        addBox(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), q.h, 'place');
      }
    }
    if (p.kind === 'gate') {
      const gate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.3, (r.z1 - r.z0) * 0.6), mat(0x1e9e57, { emissive: 0x0b3d20, emissiveIntensity: 0.4 }));
      gate.position.set(r.x1 + 0.1, SW_H + 1.15, (r.z0 + r.z1) / 2);
      gate.castShadow = true;
      scene.add(gate);
    }
  }

  for (const geo of houseGroups.values()) {
    if (!geo.tris) continue;
    const m = new THREE.Mesh(geo.toGeometry(), houseMat);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  // biển hẻm 42
  {
    const l = { ...lotRect(alleySpec) };
    const alleyMat = new THREE.MeshStandardMaterial({ color: 0x8d8478, roughness: 0.95 });
    // lối hẻm: từ mép đường vào tới trước cổng xanh ở sân giữa
    const sx0 = l.x0 - 0.5 * W, sx1 = l.x1 + CITY.SW;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(sx1 - sx0, l.z1 - l.z0 - 0.6), alleyMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set((sx0 + sx1) / 2, SW_H + 0.005, (l.z0 + l.z1) / 2);
    strip.receiveShadow = true;
    scene.add(strip);
    const f = { x: l.x1 + 2.6, z: l.z0 + 0.6, rotY: Math.PI / 2, width: 4.2, nx: 1, nz: 0 };
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2), mat(0x555555));
    pole.position.set(f.x - 0.1, 1.6, f.z);
    scene.add(pole);
    addSign('HẺM 42', '#1f618d', f, 3.0, 3.2);
  }

  // ---------- đèn đường, cây xanh ----------
  const lamps = [];
  const trees = [];
  for (let bz = 0; bz < CITY.N; bz++) {
    for (let bx = 0; bx < CITY.N; bx++) {
      const b = blockBounds(bx, bz);
      for (const [x, z, dx, dz] of [[b.x0 + 0.8, b.z0 + 0.8, -1, -1], [b.x1 - 0.8, b.z0 + 0.8, 1, -1], [b.x0 + 0.8, b.z1 - 0.8, -1, 1], [b.x1 - 0.8, b.z1 - 0.8, 1, 1]]) lamps.push({ x, z, dx, dz });
      const ax = b.x0 + CITY.SW, az = b.z0 + CITY.SW;
      // cây xanh theo khu ("trees": 0 = không cây, 1 = như cũ 8 cây, 2 = gấp đôi): giữ / thêm theo tỉ lệ
      const t = treesOf(districtAt(bx, bz, mapData));
      // [vị trí theo bề rộng lô, bậc]: bậc 1 = 2 cây cũ mỗi cạnh (giữ khi t < 1), bậc 2 = thêm 2 cây (khi t > 1), lệch khỏi cửa nhà
      for (const [k, tier] of [[1, 1], [2, 1], [1 / 4, 2], [11 / 4, 2]]) {
        const need = tier === 1 ? Math.min(1, t) : Math.min(1, Math.max(0, t - 1));
        for (const p of [[ax + k * W, b.z0 + 0.9], [ax + k * W, b.z1 - 0.9], [b.x0 + 0.9, az + k * W], [b.x1 - 0.9, az + k * W]]) {
          if (need >= 1 || (need > 0 && styleRng.next() < need)) trees.push(p);
        }
      }
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 6, 6);
  const poles = new THREE.InstancedMesh(poleGeo, mat(0x4d5656), lamps.length);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffd27a, emissiveIntensity: 0.2 });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), headMat, lamps.length);
  const glowTex = makeGlowTexture();
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffc46b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const poolGeo = new THREE.PlaneGeometry(13, 13);
  poolGeo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, lamps.length);
  lamps.forEach((l, k) => {
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(l.x, 3, l.z);
    dummy.updateMatrix();
    poles.setMatrixAt(k, dummy.matrix);
    dummy.position.set(l.x + l.dx * 1.1, 6, l.z + l.dz * 1.1);
    dummy.updateMatrix();
    heads.setMatrixAt(k, dummy.matrix);
    dummy.position.set(l.x + l.dx * 2.2, 0.2, l.z + l.dz * 2.2);
    dummy.updateMatrix();
    pools.setMatrixAt(k, dummy.matrix);
    addBox(l.x - 0.15, l.z - 0.15, l.x + 0.15, l.z + 0.15, 6, 'lamp');
  });
  poles.castShadow = true;
  scene.add(poles, heads, pools);

  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.18, 3, 6), mat(0x6e4b2a), trees.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), trees.length);
  trees.forEach(([x, z], k) => {
    dummy.rotation.set(0, rng.next() * 6, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(x, 1.5 + SW_H, z);
    dummy.updateMatrix();
    trunks.setMatrixAt(k, dummy.matrix);
    const s = 0.85 + rng.next() * 0.5;
    dummy.scale.set(s, s * 1.1, s);
    dummy.position.set(x, 3.6 + SW_H + s * 0.3, z);
    dummy.updateMatrix();
    crowns.setMatrixAt(k, dummy.matrix);
    crowns.setColorAt(k, col.setHSL(0.28 + rng.next() * 0.06, 0.45, 0.28 + rng.next() * 0.1));
    addBox(x - 0.22, z - 0.22, x + 0.22, z + 0.22, 3, 'tree');
  });
  trunks.castShadow = crowns.castShadow = true;
  scene.add(trunks, crowns);

  // ---------- cột điện + dây điện chằng chịt ----------
  // Mỗi cạnh khối 2 cột sát mép vỉa hè (né đèn đường ở góc, cây ở 1/3 cạnh, miệng hẻm ở giữa).
  // Dây nối 2 cột cùng cạnh và nối sang cột của khối kế bên (vắt qua ngã tư); vẽ bằng nét mảnh → 1 lệnh vẽ cho cả thành phố.
  const polePos = new Map(); // `${bx},${bz},${side}` → [[x,z], [x,z]] theo chiều tăng toạ độ
  for (let bz = 0; bz < CITY.N; bz++) {
    for (let bx = 0; bx < CITY.N; bx++) {
      const b = blockBounds(bx, bz), e = 0.45;
      polePos.set(`${bx},${bz},N`, [[b.x0 + 8, b.z0 + e], [b.x1 - 8, b.z0 + e]]);
      polePos.set(`${bx},${bz},S`, [[b.x0 + 8, b.z1 - e], [b.x1 - 8, b.z1 - e]]);
      polePos.set(`${bx},${bz},W`, [[b.x0 + e, b.z0 + 8], [b.x0 + e, b.z1 - 8]]);
      polePos.set(`${bx},${bz},E`, [[b.x1 - e, b.z0 + 8], [b.x1 - e, b.z1 - 8]]);
    }
  }
  const poleList = [...polePos.values()].flat();
  const POLE_H = 8.2;
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.14, POLE_H, 6), mat(0x9a968f), poleList.length);
  const armMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.08, 0.08), mat(0x777777), poleList.length);
  const boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.3, 0.14), mat(0x8a8f94), poleList.length);
  const coils = [];
  poleList.forEach(([x, z], k) => {
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(x, SW_H + POLE_H / 2, z);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(k, dummy.matrix);
    dummy.position.set(x, SW_H + POLE_H - 0.6, z);
    dummy.rotation.set(0, rng.next() < 0.5 ? 0 : Math.PI / 2, 0);
    dummy.updateMatrix();
    armMesh.setMatrixAt(k, dummy.matrix);
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(x + 0.15, SW_H + 2.2 + rng.next() * 0.8, z + 0.15);
    dummy.updateMatrix();
    boxMesh.setMatrixAt(k, dummy.matrix); // hộp công tơ
    if (rng.chance(0.45)) coils.push([x, z]);
    addBox(x - 0.14, z - 0.14, x + 0.14, z + 0.14, POLE_H, 'pole');
  });
  poleMesh.castShadow = armMesh.castShadow = true;
  scene.add(poleMesh, armMesh, boxMesh);
  if (coils.length) {
    // cuộn dây rối treo trên cột
    const cm = new THREE.InstancedMesh(new THREE.TorusGeometry(0.28, 0.06, 4, 10), mat(0x1c1c1c), coils.length);
    coils.forEach(([x, z], k) => {
      dummy.position.set(x, SW_H + POLE_H - 1.6 - rng.next() * 0.8, z);
      dummy.rotation.set(Math.PI / 2 + (rng.next() - 0.5) * 0.8, rng.next() * 3, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      cm.setMatrixAt(k, dummy.matrix);
    });
    cm.castShadow = true;
    scene.add(cm);
  }
  const wirePts = [];
  const wire = ([x0, z0], [x1, z1]) => {
    const n = 3 + rng.int(0, 2);
    for (let w = 0; w < n; w++) {
      const h0 = SW_H + POLE_H - 0.55 - w * 0.22 - rng.next() * 0.1, sag = 0.6 + rng.next() * 0.9 + Math.hypot(x1 - x0, z1 - z0) * 0.02;
      const off = (w - (n - 1) / 2) * 0.12;
      const ox = z1 !== z0 ? off : 0, oz = x1 !== x0 ? off : 0;
      for (let s = 0; s < 10; s++) {
        const t0 = s / 10, t1 = (s + 1) / 10;
        const y = (t) => h0 - sag * 4 * t * (1 - t);
        wirePts.push(x0 + (x1 - x0) * t0 + ox, y(t0), z0 + (z1 - z0) * t0 + oz, x0 + (x1 - x0) * t1 + ox, y(t1), z0 + (z1 - z0) * t1 + oz);
      }
    }
  };
  for (let bz = 0; bz < CITY.N; bz++) {
    for (let bx = 0; bx < CITY.N; bx++) {
      for (const side of ['N', 'S', 'W', 'E']) {
        const [a, b] = polePos.get(`${bx},${bz},${side}`);
        wire(a, b);
        // vắt qua ngã tư sang cột đầu tiên của khối kế bên trên cùng dãy phố
        const next = side === 'N' || side === 'S' ? polePos.get(`${bx + 1},${bz},${side}`) : polePos.get(`${bx},${bz + 1},${side}`);
        if (next) wire(b, next[0]);
      }
    }
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  scene.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x1a1a1a })));

  // ---------- ổ gà ----------
  const ph = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10), new THREE.MeshStandardMaterial({ color: 0x232325, roughness: 1 }), potholes.length);
  potholes.forEach((p, k) => {
    dummy.position.set(p.x, 0.014, p.z);
    dummy.rotation.set(-Math.PI / 2, 0, rng.next() * 6);
    dummy.scale.set(p.r, p.r * (0.7 + rng.next() * 0.3), 1);
    dummy.updateMatrix();
    ph.setMatrixAt(k, dummy.matrix);
  });
  ph.receiveShadow = true;
  scene.add(ph);

  // ---------- đổi theo giờ / thời tiết ----------
  const dryColor = new THREE.Color(0xffffff), wetColor = new THREE.Color(0x9fa4ad);
  return {
    grid,
    setNight(n) {
      headMat.emissiveIntensity = 0.2 + 3 * n;
      poolMat.opacity = 0.85 * n;
      houseMat.emissiveIntensity = 1.6 * n;
      for (const m of signMats) m.emissiveIntensity = (m.userData.glowBase ?? 0.15) + 0.7 * n;
    },
    setWet(w) {
      roadMat.color.copy(dryColor).lerp(wetColor, w);
      roadMat.roughness = 0.92 - 0.55 * w;
      roadMat.metalness = 0.25 * w;
    },
  };
}

function lotRect(spec) {
  const b = blockBounds(spec.block[0], spec.block[1]);
  const ax = b.x0 + CITY.SW, az = b.z0 + CITY.SW, W = LOT_W;
  return { x0: ax + 2 * W, x1: ax + 3 * W, z0: az + W, z1: az + 2 * W };
}
