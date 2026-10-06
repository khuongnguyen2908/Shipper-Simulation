// Dựng thành phố 3D từ dữ liệu bố cục (src/sim/cityLayout.js):
// đường nhựa, vạch kẻ, vỉa hè, nhà ống (instancing), địa điểm đặc biệt có biển hiệu,
// đèn đường, cây xanh, ổ gà. Trả về lưới va chạm + hàm đổi ngày/đêm, mưa.
import * as THREE from 'three';
import { CITY, LOT_W, HALF, roadPos, blockBounds, roadGraph, segmentRect } from '../sim/cityLayout.js';
import { ALLEY } from '../data/places.js';
import { makeRng } from '../sim/rng.js';
import { SpatialGrid } from './physics.js';
import { makeFacadeTextures, makeTileTexture, makeAsphaltTexture, makeSignTexture, makeGlowTexture } from './textures.js';
import { mat, makeStool } from './models.js';

const WALL_COLORS = [0xe8d5b7, 0xf4c095, 0x9fd8cb, 0xf6e27f, 0xe7a9a9, 0xb8d8e8, 0xd9c3e8, 0xf2f2f2, 0xc9e4a6, 0xf7b267, 0xffe0b5, 0xa9cce3];
const AWNING_COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085];
const FLOOR_H = 3.2;
const SW_H = 0.15; // độ cao vỉa hè

// Thông tin mặt tiền theo hướng: tâm mặt trước, góc xoay, bề rộng, pháp tuyến hướng ra đường
export function frontOf(r, face) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  if (face === 'N') return { x: cx, z: r.z0, rotY: Math.PI, width: r.x1 - r.x0, nx: 0, nz: -1 };
  if (face === 'S') return { x: cx, z: r.z1, rotY: 0, width: r.x1 - r.x0, nx: 0, nz: 1 };
  if (face === 'E') return { x: r.x1, z: cz, rotY: Math.PI / 2, width: r.z1 - r.z0, nx: 1, nz: 0 };
  return { x: r.x0, z: cz, rotY: -Math.PI / 2, width: r.z1 - r.z0, nx: -1, nz: 0 };
}

export function buildCity(scene, layout, potholes, seed = 7) {
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
  const G = roadGraph();
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

  // ---------- nhà ống (instanced theo số tầng) ----------
  const facade = makeFacadeTextures(seed);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x9a9690, roughness: 0.95 });
  const facadeMats = {};
  const getFacadeMat = (floors, wide = 3) => {
    const k = `${floors}|${wide}`;
    if (!facadeMats[k]) {
      const map = facade.map.clone();
      const em = facade.emissive.clone();
      map.repeat.set(wide / 4, floors / 4);
      em.repeat.set(wide / 4, floors / 4);
      map.needsUpdate = em.needsUpdate = true;
      facadeMats[k] = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 });
    }
    return facadeMats[k];
  };
  const byFloors = new Map();
  const addHouse = (r, floors, colorHex) => {
    if (!byFloors.has(floors)) byFloors.set(floors, []);
    byFloors.get(floors).push({ r, color: colorHex });
  };
  const awnings = [];
  const tanks = [];
  for (const l of layout.lots) {
    const floors = l.inAlley ? rng.int(1, 4) : rng.int(2, 6); // nhà trong hẻm thấp hơn nhà mặt phố
    const r = { x0: l.x0 + 0.25, x1: l.x1 - 0.25, z0: l.z0 + 0.25, z1: l.z1 - 0.25 };
    addHouse(r, floors, rng.pick(WALL_COLORS));
    addBox(r.x0, r.z0, r.x1, r.z1, floors * FLOOR_H + SW_H, 'house');
    if (rng.chance(0.55)) awnings.push({ r, face: l.face, color: rng.pick(AWNING_COLORS) });
    if (rng.chance(0.45)) tanks.push({ x: r.x0 + 1.5 + rng.next() * (r.x1 - r.x0 - 3), z: r.z0 + 1.5 + rng.next() * (r.z1 - r.z0 - 3), y: floors * FLOOR_H + SW_H });
  }
  // ---------- khối có hẻm: nhà phía sau (không cửa), mặt hẻm, cột chắn hẻm đi bộ ----------
  const alleyGeo = new THREE.PlaneGeometry(1, 1);
  alleyGeo.rotateX(-Math.PI / 2);
  const alleyMats = { bike: new THREE.MeshStandardMaterial({ color: 0x8d8478, roughness: 0.95 }), walk: new THREE.MeshStandardMaterial({ color: 0xa3998b, roughness: 0.95 }) };
  const postList = [];
  for (const ab of layout.alleyBlocks || []) {
    for (const r of ab.fillers) {
      const fl = rng.int(1, 3);
      addHouse({ x0: r.x0 + 0.1, x1: r.x1 - 0.1, z0: r.z0 + 0.1, z1: r.z1 - 0.1 }, fl, rng.pick(WALL_COLORS));
      addBox(r.x0, r.z0, r.x1, r.z1, fl * FLOOR_H + SW_H, 'house');
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

  // nhà vùng ven (ngoài biên bản đồ, chỉ để nhìn)
  for (let a = -HALF - 6; a <= HALF + 6; a += 12) {
    for (const [x, z] of [[a, -HALF - 9], [a, HALF + 9], [-HALF - 9, a], [HALF + 9, a]]) {
      addHouse({ x0: x - 5.5, x1: x + 5.5, z0: z - 5.5, z1: z + 5.5 }, rng.int(3, 8), rng.pick(WALL_COLORS));
    }
  }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  for (const [floors, list] of byFloors) {
    const fm = getFacadeMat(floors);
    const mesh = new THREE.InstancedMesh(unit, [fm, fm, roofMat, roofMat, fm, fm], list.length);
    list.forEach(({ r, color }, k) => {
      const h = floors * FLOOR_H;
      dummy.position.set((r.x0 + r.x1) / 2, SW_H + h / 2, (r.z0 + r.z1) / 2);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(r.x1 - r.x0, h, r.z1 - r.z0);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
      mesh.setColorAt(k, col.setHex(color));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // mái hiên
  if (awnings.length) {
    const aw = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.7 }), awnings.length);
    awnings.forEach(({ r, face, color }, k) => {
      const f = frontOf(r, face);
      const along = f.width - 1.2;
      dummy.position.set(f.x + f.nx * 0.7, SW_H + 2.9, f.z + f.nz * 0.7);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(f.nx ? 1.4 : along, 0.12, f.nx ? along : 1.4);
      dummy.updateMatrix();
      aw.setMatrixAt(k, dummy.matrix);
      aw.setColorAt(k, col.setHex(color));
    });
    aw.castShadow = true;
    scene.add(aw);
  }
  // bồn nước inox trên mái
  if (tanks.length) {
    const tg = new THREE.CylinderGeometry(0.6, 0.6, 1.6, 12);
    tg.rotateZ(Math.PI / 2);
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0xdfe6e9, metalness: 0.7, roughness: 0.3 }), tanks.length);
    tanks.forEach((t, k) => {
      dummy.position.set(t.x, t.y + 0.7, t.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tm.setMatrixAt(k, dummy.matrix);
    });
    tm.castShadow = true;
    scene.add(tm);
  }

  // ---------- địa điểm đặc biệt ----------
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
  const addBuilding = (r, floors, colorHex, wide = 3) => {
    const h = floors * FLOOR_H;
    const fm = getFacadeMat(floors, wide);
    const geo = new THREE.BoxGeometry(r.x1 - r.x0, h, r.z1 - r.z0);
    const tinted = fm.clone();
    tinted.color = new THREE.Color(colorHex);
    facadeMats[`t${signMats.length}|${Math.random()}`] = tinted;
    const m = new THREE.Mesh(geo, [tinted, tinted, roofMat, roofMat, tinted, tinted]);
    m.position.set((r.x0 + r.x1) / 2, SW_H + h / 2, (r.z0 + r.z1) / 2);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    addBox(r.x0, r.z0, r.x1, r.z1, h + SW_H, 'place');
    return m;
  };
  const addAwning = (f, colorHex, depth = 1.6) => {
    const along = f.width - 0.8;
    const a = new THREE.Mesh(new THREE.BoxGeometry(f.nx ? depth : along, 0.14, f.nx ? along : depth), mat(colorHex));
    a.position.set(f.x + (f.nx * depth) / 2, SW_H + 2.95, f.z + (f.nz * depth) / 2);
    a.castShadow = true;
    scene.add(a);
  };
  const addStools = (f, n, colorHex) => {
    for (let i = 0; i < n; i++) {
      const s = makeStool(colorHex);
      const t = (i / Math.max(1, n - 1) - 0.5) * (f.width - 3);
      const out = 2.2 + (i % 2) * 0.6;
      s.position.set(f.x + f.nx * out + (f.nx ? 0 : t), SW_H, f.z + f.nz * out + (f.nz ? 0 : t));
      scene.add(s);
    }
  };

  for (const p of layout.places) {
    const r = { x0: p.x0 + 0.25, x1: p.x1 - 0.25, z0: p.z0 + 0.25, z1: p.z1 - 0.25 };
    const f = frontOf(r, p.face);
    const accent = p.signBg ? new THREE.Color(p.signBg).getHex() : 0x1e8449;
    if (p.kind === 'gas') {
      // mái che + trụ bơm, không có tường
      const roof = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0 + 2, 0.5, r.z1 - r.z0 + 2), mat(0xffffff));
      roof.position.set((r.x0 + r.x1) / 2, 5, (r.z0 + r.z1) / 2 - 1);
      roof.castShadow = true;
      scene.add(roof);
      const band = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0 + 2.1, 0.3, r.z1 - r.z0 + 2.1), mat(accent));
      band.position.copy(roof.position);
      band.position.y = 4.7;
      scene.add(band);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = (r.x0 + r.x1) / 2 + dx * ((r.x1 - r.x0) / 2 - 0.5), z = (r.z0 + r.z1) / 2 - 1 + dz * ((r.z1 - r.z0) / 2 - 0.5);
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5, 0.35), mat(0xdddddd));
        pil.position.set(x, 2.5, z);
        scene.add(pil);
        addBox(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 5, 'pillar');
      }
      for (const dx of [-2, 2]) {
        const x = (r.x0 + r.x1) / 2 + dx, z = (r.z0 + r.z1) / 2;
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.6), mat(accent));
        pump.position.set(x, SW_H + 0.8, z);
        pump.castShadow = true;
        scene.add(pump);
        addBox(x - 0.45, z - 0.35, x + 0.45, z + 0.35, 2, 'pump');
      }
      const sf = { ...f, z: f.z + f.nz * 1.0 };
      addSign(p.sign, p.signBg, sf, 4.7, 7);
      continue;
    }
    if (p.kind === 'apartment') {
      addBuilding(r, p.floors, p.color, 9);
      addSign(p.sign, p.signBg, f, SW_H + 3.6, 12);
      addAwning(f, accent, 2.2);
      continue;
    }
    if (p.kind === 'market') {
      addBuilding(r, 2, p.color, 9);
      addSign(p.sign, p.signBg, f, SW_H + 4.6, 12);
      for (let k = 0; k < 6; k++) {
        // chia mặt tiền thành 6 sạp (mặt tiền quay bắc/nam thì chia theo x, quay đông/tây thì theo z)
        const ff = f.nx ? { ...f, width: f.width / 6, z: r.z0 + ((k + 0.5) * f.width) / 6 } : { ...f, width: f.width / 6, x: r.x0 + ((k + 0.5) * f.width) / 6 };
        addAwning(ff, AWNING_COLORS[k % AWNING_COLORS.length], 2.4);
      }
      continue;
    }
    if (p.kind === 'gate') {
      addBuilding(r, p.floors, p.color, 2);
      const gate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.3, (r.z1 - r.z0) * 0.6), mat(0x1e9e57, { emissive: 0x0b3d20, emissiveIntensity: 0.4 }));
      gate.position.set(r.x1 + 0.1, SW_H + 1.15, (r.z0 + r.z1) / 2);
      gate.castShadow = true;
      scene.add(gate);
      continue;
    }
    // nhà hàng, quán, tiệm, nhà trọ
    addBuilding(r, p.floors, p.color);
    addSign(p.sign, p.signBg, f, SW_H + 3.7);
    addAwning(f, accent);
    // ghế đẩu bày ra vỉa hè (quán trong hẻm thì không — chắn lối đi)
    if (!p.inAlley && (p.kind === 'restaurant' || p.kind === 'cafe')) addStools(f, 4, p.kind === 'cafe' ? 0x2e86c1 : 0xe74c3c);
  }

  // biển hẻm 42
  {
    const l = { ...lotRect(ALLEY) };
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
      for (const k of [1, 2]) {
        trees.push([ax + k * W, b.z0 + 0.9], [ax + k * W, b.z1 - 0.9], [b.x0 + 0.9, az + k * W], [b.x1 - 0.9, az + k * W]);
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
      for (const m of Object.values(facadeMats)) m.emissiveIntensity = 1.6 * n;
      for (const m of signMats) m.emissiveIntensity = 0.15 + 0.7 * n;
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
