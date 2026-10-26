// Dựng thành phố 3D từ dữ liệu bố cục (src/sim/cityLayout.js):
// đường nhựa, vạch kẻ, vỉa hè, nhà ống (instancing), địa điểm đặc biệt có biển hiệu,
// đèn đường, cây xanh, ổ gà. Trả về lưới va chạm + hàm đổi ngày/đêm, mưa.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, LOT_W, HALF, roadPos, blockBounds, roadGraph, segmentRect, cutSide, districtAt, districtAtPoint, joinList, joinGap, joinedSide, isWaterBlock } from '../sim/cityLayout.js';
import { MAP } from '../data/map.js';
import { pickHouseStyle, blockHouseStyle, treesOf, streetOf } from '../data/districtTraits.js';
import { buildStreetDecor } from './streetDecor.js';
import { ALLEY } from '../data/places.js';
import { makeRng } from '../sim/rng.js';
import { SpatialGrid, circleFree } from './physics.js';
import { makeTileTexture, makeAsphaltTexture, makeSignTexture, makeGlowTexture, makeWaterTexture } from './textures.js';
import { HouseGeo, buildHouse, housesForLot, houseMaterial, houseTop } from './houses.js';
import { buildPlace, buildResidential, mergeKits, makeKit, busStopModel, airportPath, AIRPORT_MIN_W } from './placeBuildings.js';
import { Elevated } from './elevated.js';
import { buildParkedBikes } from './parkedBikes.js';
import { buildBridges, bridgeDecks, HUMP } from './bridges.js';
import { lotFrame, airportZones } from '../sim/airport.js';
import { lookOf, lookFloors } from '../data/looks.js';
import { ITEMS } from '../data/items.js';
import { hashStr } from '../sim/people.js';
import { mat } from './models.js';
import { tierOf, TIER_GEO, allSegments } from '../sim/roads.js';
import { buildBusSystem } from '../sim/bus.js';
import { floodMap, segOfId } from '../sim/flood.js';
import { riverMouths, buildRiverMouths, mouthBlocks } from './riverMouth.js';

// màu sơn tường nhà phố: vàng, xanh ngọc, hồng phai, trắng ngà, xanh dương nhạt, cam đất… (phố Việt Nam mỗi căn một màu)
const WALL_COLORS = [0xe8d5b7, 0xf4c095, 0x9fd8cb, 0xf6e27f, 0xe7a9a9, 0xb8d8e8, 0xd9c3e8, 0xf2f2f2, 0xc9e4a6, 0xf7b267, 0xffe0b5, 0xa9cce3, 0xe3b23c, 0x7fb8a4, 0xd98a6c, 0xf0d58c, 0x8fb3d9, 0xe9c2d0];
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
  // extra: { y0 (đáy khối, mặc định 0), cam (chỉ chặn camera) }
  const addBox = (x0, z0, x1, z1, h, tag, extra) => grid.add({ x0, z0, x1, z1, h, tag, ...extra });
  const parkedBikes = []; // xe máy đậu (lề đường nhỏ, bãi giữ xe…) → world/parkedBikes.js vẽ bằng mẫu xe thật
  const seats = []; // chỗ ngồi được (toạ độ thế giới): { x, y (mặt ghế), z, ry, placeId } — interactions.js → E "Ngồi"
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const W = LOT_W;

  // ---------- mặt đất, đường ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), mat(0x5d6e4e)); // rộng hơn tầm nhìn xa nhất (đứng cạnh cửa sông)
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  scene.add(ground);

  const asphalt = makeAsphaltTexture();
  asphalt.repeat.set(HALF / 8, HALF / 8); // mỗi lần lặp 16 m, giữ cỡ hạt nhựa đường khi bản đồ to ra
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, color: 0xffffff, roughness: 0.92, metalness: 0 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  scene.add(road);

  // vạch giữa đường + vạch qua đường (không vẽ trên mặt sông, trên cầu)
  const mapData = opts.map || MAP;
  const G = roadGraph(opts.map);
  // xe buýt (src/sim/bus.js): tuyến + trạm; cây, trang trí vỉa hè chừa chỗ cho nhà chờ
  const bus = opts.bus || buildBusSystem(layout, mapData);
  const nearStop = (x, z, d = 2.6) => bus.stops.some((s) => Math.hypot(s.x - x, s.z - z) < d);
  // CHỖ CẤM ĐẬU XE (xe máy đậu lề đường / vỉa hè): trước cổng bệnh viện, đồn công an, trường học, bến xe, cây xăng, trạm sạc /
  // đổi pin, nhà thờ, bưu điện, sân bay, bến phà (cả mặt tiền + 3 m mỗi bên, ra tới lòng đường) và góc ngã tư (vạch qua đường)
  const NO_PARK_LOOKS = new Set(['hospital', 'police', 'school', 'university', 'artSchool', 'busStation', 'gas', 'airport', 'cathedral', 'postOffice', 'ferry']);
  const NO_PARK_KINDS = new Set(['gas', 'charger', 'swap', 'police']);
  const noParkPlace = (p) => NO_PARK_LOOKS.has(lookOf(p)) || NO_PARK_KINDS.has(p.kind);
  const noParkFronts = layout.places.filter((p) => p.door && p.x0 != null && noParkPlace(p)).map((p) => ({ fr: placeFrame(p), W: placeFrame(p).W }));
  const nearLine = (v) => Math.abs(v - roadPos(Math.round((v - CITY.ORIGIN) / CITY.PITCH)));
  const noPark = (x, z) =>
    (nearLine(x) < 10.5 && nearLine(z) < 10.5) || // góc ngã tư
    noParkFronts.some(({ fr, W }) => {
      const [u, v] = fr.toLocal(x, z); // v > 0: phía ngoài lô (vỉa hè, đường)
      return Math.abs(u) < W / 2 + 3 && v > -1 && v < 9;
    });
  const noRoad = (id) => G.waterSegs.has(id) || G.closedSegs.has(id) || G.rampSegs.has(id); // sông · đoạn đã gộp khối · dốc / nhịp cầu cao
  // cầu kênh vồng (src/world/bridges.js): mặt cầu tự có vạch, đường quanh chân cầu không vẽ vạch / vá / lề
  const humps = bridgeDecks(G).filter((d) => !d.wide);
  const humpNodes = new Set(humps.map((d) => (d.axis === 'z' ? `${d.k},${d.line}` : `${d.line},${d.k}`)));
  const nearHump = (x, z) => humps.some((d) => (d.along === 'x' ? Math.abs(z - d.w) < 7 && Math.abs(x - d.mid) < HUMP.reach + 1 : Math.abs(x - d.w) < 7 && Math.abs(z - d.mid) < HUMP.reach + 1));
  const segIdx = (a) => Math.floor((a - CITY.ORIGIN) / CITY.PITCH);
  const dashGeo = new THREE.PlaneGeometry(1, 1);
  dashGeo.rotateX(-Math.PI / 2);
  const dashes = [];
  const nearCross = (v, m) => {
    for (let k = 0; k <= CITY.N; k++) if (Math.abs(v - roadPos(k)) < m) return true;
    return false;
  };
  // cấp đường (map.json → roadTiers, src/sim/roads.js): đường thường vạch giữa · đại lộ vạch chia 2 làn mỗi chiều (giữa là dải phân cách) · đường nhỏ không vạch
  const tierAt = (id) => tierOf(id, mapData);
  const laneDashes = (id) => (tierAt(id) === 'big' ? [-3.4, 3.4] : tierAt(id) === 'small' ? [] : [0]);
  for (let i = 0; i <= CITY.N; i++) {
    for (let a = -HALF; a <= HALF; a += 6) {
      if (nearCross(a, 9)) continue;
      const vx = `x${i}:${segIdx(a)}`, hz = `z${i}:${segIdx(a)}`;
      if (!noRoad(vx) && !nearHump(roadPos(i), a)) for (const o of laneDashes(vx)) dashes.push([roadPos(i) + o, a, 0.18, 3]); // đường dọc
      if (!noRoad(hz) && !nearHump(a, roadPos(i))) for (const o of laneDashes(hz)) dashes.push([a, roadPos(i) + o, 3, 0.18]); // đường ngang
    }
    for (let j = 0; j <= CITY.N; j++) {
      if (G.waterNodes.has(`${i},${j}`) || G.bridgeNodes.has(`${i},${j}`)) continue;
      for (const s of [-1, 1]) {
        // vạch qua đường ở mỗi nhánh của ngã tư (nhánh nào là đoạn đã gộp khối thì bỏ)
        const crossV = !G.closedSegs.has(`x${i}:${s < 0 ? j - 1 : j}`), crossH = !G.closedSegs.has(`z${j}:${s < 0 ? i - 1 : i}`);
        for (let t = -5.2; t <= 5.2; t += 1.3) {
          if (crossV) dashes.push([roadPos(i) + t, roadPos(j) + s * 7.6, 0.55, 2.4]);
          if (crossH) dashes.push([roadPos(i) + s * 7.6, roadPos(j) + t, 2.4, 0.55]);
        }
      }
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, new THREE.MeshStandardMaterial({ color: 0xdedcd2, roughness: 0.85 }), dashes.length); // vạch sơn hơi phai
  dashes.forEach(([x, z, w, d], k) => {
    dummy.position.set(x, 0.012, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(w, 1, d);
    dummy.updateMatrix();
    dashMesh.setMatrixAt(k, dummy.matrix);
  });
  dashMesh.receiveShadow = true;
  scene.add(dashMesh);

  // mặt đường: vết vá nhựa sẫm màu + nắp cống tròn dọc lề (vẽ hàng loạt, không đặt trên mặt sông / gần ngã tư)
  {
    const prng = makeRng(seed * 7 + 3);
    const patches = [], holes = [];
    for (let i = 0; i <= CITY.N; i++) {
      for (let j = 0; j < CITY.N; j++) {
        const a0 = roadPos(j) + 10, a1 = roadPos(j + 1) - 10;
        for (const axis of ['x', 'z']) {
          if (noRoad(`${axis}${i}:${j}`)) continue;
          const at = (along, lat) => (axis === 'x' ? [roadPos(i) + lat, along] : [along, roadPos(i) + lat]);
          // đường nhỏ mặt cũ nhiều vá; đại lộ mới trải, ít vá (không vá trên dải phân cách)
          const tier = tierAt(`${axis}${i}:${j}`), tg = TIER_GEO[tier];
          const nPatch = tier === 'small' ? prng.int(3, 6) : tier === 'big' ? prng.int(0, 1) : prng.int(1, 3);
          for (let k = nPatch; k > 0; k--) {
            let lat = (prng.next() - 0.5) * (2 * tg.half - 3);
            if (tg.median && Math.abs(lat) < tg.median + 1) lat = Math.sign(lat || 1) * (tg.median + 1.5);
            const [x, z] = at(a0 + prng.next() * (a1 - a0), lat);
            if (nearHump(x, z)) continue;
            patches.push([x, z, 1 + prng.next() * 2.5, 0.8 + prng.next() * 1.6, prng.next() * 0.5 - 0.25]);
          }
          for (const side of [-1, 1]) {
            for (let a = a0 + prng.next() * 8; a < a1; a += 14 + prng.next() * 8) holes.push(at(a, side * (tg.half - 1.1)));
          }
        }
      }
    }
    const pm = new THREE.InstancedMesh(dashGeo, new THREE.MeshStandardMaterial({ color: 0x35363b, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }), patches.length);
    patches.forEach(([x, z, w, d, r], k) => {
      dummy.position.set(x, 0.008, z);
      dummy.rotation.set(0, r, 0);
      dummy.scale.set(w, 1, d);
      dummy.updateMatrix();
      pm.setMatrixAt(k, dummy.matrix);
    });
    pm.receiveShadow = true;
    const hm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 14), mat(0x56585d, { roughness: 0.6, metalness: 0.4 }), holes.length);
    holes.forEach(([x, z], k) => {
      dummy.position.set(x, 0.012, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      hm.setMatrixAt(k, dummy.matrix);
    });
    hm.receiveShadow = true;
    scene.add(pm, hm);
  }

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
    // kè thấp dọc hai bờ (mép đường giáp vỉa hè); phía giáp khối dưới sông lớn thì không có kè
    const landA = seg.axis === 'x' ? !isWaterBlock(seg.line - 1, seg.from, mapData) : !isWaterBlock(seg.from, seg.line - 1, mapData);
    const landB = seg.axis === 'x' ? !isWaterBlock(seg.line, seg.from, mapData) : !isWaterBlock(seg.from, seg.line, mapData);
    if (seg.axis === 'x') { if (landA) wall(r.x0 - 0.3, r.z0, r.x0, r.z1, 0.5, kerbMat, 'kerb'); if (landB) wall(r.x1, r.z0, r.x1 + 0.3, r.z1, 0.5, kerbMat, 'kerb'); }
    else { if (landA) wall(r.x0, r.z0 - 0.3, r.x1, r.z0, 0.5, kerbMat, 'kerb'); if (landB) wall(r.x0, r.z1, r.x1, r.z1 + 0.3, 0.5, kerbMat, 'kerb'); }
  }
  // sông lớn: cả khối thành mặt nước; dưới nhịp cầu cao cũng là mặt nước (xe chạy trên cầu, không chạy dưới)
  for (const key of G.waterBlocks) {
    const [bx, bz] = key.split(',').map(Number);
    const b = blockBounds(bx, bz);
    flat(b, 0.03, waterMat);
    addBox(b.x0, b.z0, b.x1, b.z1, 0.3, 'water');
  }
  // cửa sông mở ra ngoài biên (map.json → sông có "mouth"): nước, bờ dừa nước, cảng xa — chỉ để nhìn
  const mouths = riverMouths(mapData);
  buildRiverMouths(scene, mouths, waterMat, seed);
  for (const id of G.highSegs) {
    const m = /^([xz])(\d+):(\d+)$/.exec(id);
    const r = segmentRect({ axis: m[1], line: +m[2], from: +m[3] });
    flat(r, 0.03, waterMat);
    addBox(r.x0, r.z0, r.x1, r.z1, 0.3, 'water');
  }
  // cầu thấp qua sông lớn: mặt đường nối 2 bờ, lan can 2 bên
  for (const id of G.bridgeSegs) {
    if (G.highSegs.has(id)) continue;
    const m = /^([xz])(\d+):(\d+)$/.exec(id);
    const r = segmentRect({ axis: m[1], line: +m[2], from: +m[3] });
    flat(r, 0.02, deckMat); // mặt cầu cùng màu với 2 đầu cầu
    if (m[1] === 'z') { wall(r.x0, r.z0 - 0.15, r.x1, r.z0 + 0.15, 1.0, railMat, 'rail'); wall(r.x0, r.z1 - 0.15, r.x1, r.z1 + 0.15, 1.0, railMat, 'rail'); }
    else { wall(r.x0 - 0.15, r.z0, r.x0 + 0.15, r.z1, 1.0, railMat, 'rail'); wall(r.x1 - 0.15, r.z0, r.x1 + 0.15, r.z1, 1.0, railMat, 'rail'); }
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
    if (G.highNodes.has(key) || humpNodes.has(key)) {
      flat(r, 0.03, waterMat);
      addBox(r.x0, r.z0, r.x1, r.z1, 0.3, 'water');
    } else if (bridge) {
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
  tile.repeat.set(5, 5); // mỗi lần lặp 8 m (viên 0,5 m)
  const swMat = new THREE.MeshStandardMaterial({ map: tile, roughness: 0.85 });
  const swGeo = new THREE.BoxGeometry(CITY.BLOCK, SW_H, CITY.BLOCK);
  for (let bz = 0; bz < CITY.N; bz++) {
    for (let bx = 0; bx < CITY.N; bx++) {
      if (isWaterBlock(bx, bz, mapData)) continue; // khối dưới sông lớn
      const b = blockBounds(bx, bz);
      const m = new THREE.Mesh(swGeo, swMat);
      m.position.set((b.x0 + b.x1) / 2, SW_H / 2, (b.z0 + b.z1) / 2);
      m.receiveShadow = true;
      scene.add(m);
    }
  }
  // ---------- cấp đường: dải phân cách đại lộ · lề rộng đường nhỏ (gạch như vỉa hè, xe máy đậu, cây) ----------
  // dựng dọc mỗi đoạn, chừa 9 m ở 2 đầu (vạch qua đường, ngã tư để nguyên)
  const roadExtras = { medians: [], verges: [], vergeTrees: [] };
  {
    const vrng = makeRng(seed * 13 + 5);
    const BIKE_COLS = [0xc0392b, 0x2c3e50, 0xecf0f1, 0x8e44ad, 0x2980b9, 0x7f8c8d, 0xd35400];
    for (const s of allSegments(mapData)) {
      const tier = tierAt(s.id);
      if (tier === 'normal' || G.rampSegs.has(s.id) || G.bridgeSegs.has(s.id)) continue;
      const endKey = (k) => (s.axis === 'x' ? `${s.line},${k}` : `${k},${s.line}`);
      const tg = TIER_GEO[tier], c = roadPos(s.line), a0 = roadPos(s.from) + (humpNodes.has(endKey(s.from)) ? HUMP.reach + 1 : 9), a1 = roadPos(s.from + 1) - (humpNodes.has(endKey(s.from + 1)) ? HUMP.reach + 1 : 9);
      // hình chữ nhật theo (dọc đường a, ngang l) → toạ độ thế giới
      const rect = (la, lb, aa, ab) => (s.axis === 'x' ? { x0: c + la, x1: c + lb, z0: aa, z1: ab } : { x0: aa, x1: ab, z0: c + la, z1: c + lb });
      const pt = (a, l) => (s.axis === 'x' ? [c + l, a] : [a, c + l]);
      if (tier === 'big') {
        const r = rect(-tg.median, tg.median, a0, a1);
        roadExtras.medians.push(r);
        addBox(r.x0, r.z0, r.x1, r.z1, 0.6, 'median');
        for (let a = a0 + 4; a < a1 - 2; a += 8) roadExtras.vergeTrees.push(pt(a, 0)); // hàng cây giữa dải phân cách
      } else {
        for (const side of [-1, 1]) {
          const r = side < 0 ? rect(-CITY.ROAD / 2, -tg.half, a0, a1) : rect(tg.half, CITY.ROAD / 2, a0, a1);
          roadExtras.verges.push(r);
          const mid = side * (tg.half + CITY.ROAD / 2) / 2;
          // xe máy đậu rải rác trên lề (xe thật, ~15% chỗ có xe), thân xe vuông góc với đường, đầu xe quay ra lòng đường
          for (let a = a0 + 1.5; a < a1 - 1; a += 1.1) {
            if (vrng.next() < 0.925) continue; // ~7,5% chỗ có xe (giảm một nửa)
            const [x, z] = pt(a, mid);
            if (nearStop(x, z, 4) || noPark(x, z)) continue; // không đậu ở trạm xe buýt / trước cổng chỗ cấm đậu
            const along = s.axis === 'x'; // đường dọc → thân xe nằm theo trục x
            const ry = (along ? -side * Math.PI / 2 : side < 0 ? 0 : Math.PI) + (vrng.next() - 0.5) * 0.25; // lệch chút cho tự nhiên
            parkedBikes.push({ x, y: SW_H, z, ry, c: BIKE_COLS[vrng.int(0, BIKE_COLS.length - 1)] });
            if (along) addBox(x - 0.9, z - 0.35, x + 0.9, z + 0.35, 1.0, 'bike');
            else addBox(x - 0.35, z - 0.9, x + 0.35, z + 0.9, 1.0, 'bike');
          }
          for (let a = a0 + 4 + vrng.next() * 4; a < a1 - 2; a += 9 + vrng.next() * 5) roadExtras.vergeTrees.push(pt(a, side * (CITY.ROAD / 2 - 0.6)));
        }
      }
    }
    // gộp: dải phân cách (bó vỉa xám + mặt cỏ), lề đường nhỏ (gạch vỉa hè)
    const mGeo = [], gGeo = [], vGeo = [];
    for (const r of roadExtras.medians) {
      const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      mGeo.push(new THREE.BoxGeometry(w, 0.22, d).translate(cx, 0.11, cz));
      gGeo.push(new THREE.BoxGeometry(Math.max(0.1, w - (w < d ? 0.3 : 0)), 0.02, Math.max(0.1, d - (d < w ? 0.3 : 0))).translate(cx, 0.23, cz));
    }
    for (const r of roadExtras.verges) vGeo.push(new THREE.BoxGeometry(r.x1 - r.x0, SW_H, r.z1 - r.z0).translate((r.x0 + r.x1) / 2, SW_H / 2, (r.z0 + r.z1) / 2));
    for (const [geos, m] of [[mGeo, mat(0xb8b5ad)], [gGeo, mat(0x5f8f3f)], [vGeo, swMat]]) {
      if (!geos.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(geos), m);
      mesh.receiveShadow = true;
      mesh.castShadow = m !== swMat;
      scene.add(mesh);
    }
  }

  // lòng đường cũ giữa 2 khối đã gộp → mặt bằng cao như vỉa hè
  const joins = joinList(mapData);
  for (const j of joins) {
    const r = joinGap(j);
    const m = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, SW_H, r.z1 - r.z0), swMat);
    m.position.set((r.x0 + r.x1) / 2, SW_H / 2, (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    scene.add(m);
  }
  // bó vỉa: dải đá xám cao hơn mặt gạch một chút chạy quanh mép mỗi khối (gộp 1 khối vẽ cho cả thành phố)
  {
    const CW = 0.28, CH = SW_H + 0.04, parts = [];
    for (let bz = 0; bz < CITY.N; bz++) {
      for (let bx = 0; bx < CITY.N; bx++) {
        if (isWaterBlock(bx, bz, mapData)) continue;
        const b = blockBounds(bx, bz), L = CITY.BLOCK + 0.02;
        for (const [side, w, d, x, z] of [['N', L, CW, (b.x0 + b.x1) / 2, b.z0 + CW / 2 - 0.01], ['S', L, CW, (b.x0 + b.x1) / 2, b.z1 - CW / 2 + 0.01], ['W', CW, L, b.x0 + CW / 2 - 0.01, (b.z0 + b.z1) / 2], ['E', CW, L, b.x1 - CW / 2 + 0.01, (b.z0 + b.z1) / 2]]) {
          if (joinedSide(bx, bz, side, mapData)) continue; // cạnh quay vào khối đã gộp: không còn mép đường
          parts.push(new THREE.BoxGeometry(w, CH, d).translate(x, CH / 2, z));
        }
      }
    }
    for (const j of joins) {
      const r = joinGap(j);
      if (j[2] === 'E') for (const z of [r.z0 + CW / 2 - 0.01, r.z1 - CW / 2 + 0.01]) parts.push(new THREE.BoxGeometry(r.x1 - r.x0 + 0.02, CH, CW).translate((r.x0 + r.x1) / 2, CH / 2, z));
      else for (const x of [r.x0 + CW / 2 - 0.01, r.x1 - CW / 2 + 0.01]) parts.push(new THREE.BoxGeometry(CW, CH, r.z1 - r.z0 + 0.02).translate(x, CH / 2, (r.z0 + r.z1) / 2));
    }
    const curb = new THREE.Mesh(mergeGeometries(parts), mat(0xb7b2a8, { roughness: 0.9 }));
    curb.receiveShadow = true;
    scene.add(curb);
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
  // mặt tiền từng căn nhà phố (không tính nhà trong hẻm / nhà vùng ven / nhà phía sau) → xếp xe đậu, quán cóc trên vỉa hè
  const frontages = [];
  const stallRng = makeRng(seed * 59 + 3); // căn nào có quán cóc (quyết lúc dựng nhà để căn đó luôn có bạt che)
  // Dựng 1–3 căn trên một lô (mặt tiền rộng thì chia 2–3 căn hẹp); trả về độ cao căn cao nhất (cho va chạm)
  const addLotHouses = (r, face, floors, opts = {}) => {
    const f = frontOf(r, face);
    const depth = f.nx ? r.x1 - r.x0 : r.z1 - r.z0;
    let top = 0;
    for (const h of housesForLot({ x: f.x, y: SW_H, z: f.z, nx: f.nx, nz: f.nz, width: f.width, depth }, { floors, colors: WALL_COLORS, ...opts, seed: opts.seed ?? rng.int(1, 1e9) })) {
      const street = !opts.alley && !opts.low && !opts.back;
      // quán cóc: căn có cửa hàng, theo độ đông của khu (độ đông 1 ≈ 50% căn có cửa hàng) → ép có bạt che phía trước
      h.stall = street && h.ground === 'shop' && stallRng.next() < 0.5 * streetOf(districtAtPoint(h.x, h.z, mapData), 'stalls');
      if (h.stall) h.awning = true;
      buildHouse(geoAt(h.x - f.nx * depth * 0.5, h.z - f.nz * depth * 0.5), h);
      top = Math.max(top, houseTop(h.floors));
      if (street) frontages.push({ x: h.x, z: h.z, nx: h.nx, nz: h.nz, W: h.W, ground: h.ground, stall: h.stall });
    }
    return top;
  };
  // nhà dân theo khu phố (map.json → districts[mã].houses): kiểu khác nhà ống dựng riêng rồi gộp cả thành phố
  const styleRng = makeRng(seed * 7 + 11);
  const resKits = [];
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  const primary = new Map(); // kiểu nhà chủ đạo của từng khối (nhà cùng kiểu tụ thành dãy)
  const blockStyle = (bx, bz) => {
    const key = bx + ',' + bz;
    if (!primary.has(key)) primary.set(key, blockHouseStyle(districtAt(bx, bz, mapData), makeRng(seed * 131 + bz * 977 + bx * 31 + 5)));
    return primary.get(key);
  };
  // Lô ở góc khối (chạm 2 cạnh ngoài của khối) → hướng ra đường cắt ngang, nếu phía đó là đường thật (không phải khối gộp / sông)
  // → căn ngoài cùng phía đó thành nhà góc 2 mặt tiền (houses.js h.corner)
  const SIDE_DIR = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
  const waterSegsAll = roadGraph(mapData).waterSegs;
  const cornerDirOf = (l) => {
    if (l.inAlley || !SIDE_DIR[l.face]) return null;
    const [bx, bz] = l.block, b = blockBounds(bx, bz), e = 0.4;
    const touch = { W: Math.abs(l.x0 - (b.x0 + CITY.SW)) < e, E: Math.abs(l.x1 - (b.x1 - CITY.SW)) < e, N: Math.abs(l.z0 - (b.z0 + CITY.SW)) < e, S: Math.abs(l.z1 - (b.z1 - CITY.SW)) < e };
    const side = (l.face === 'N' || l.face === 'S' ? ['W', 'E'] : ['N', 'S']).find((k) => touch[k]);
    if (!side || joinedSide(bx, bz, side, mapData)) return null;
    const seg = side === 'N' ? `z${bz}:${bx}` : side === 'S' ? `z${bz + 1}:${bx}` : side === 'W' ? `x${bx}:${bz}` : `x${bx + 1}:${bz}`;
    return waterSegsAll.has(seg) ? null : SIDE_DIR[side];
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
    const top = addLotHouses(r, l.face, floors, { alley: l.inAlley, cornerDir: cornerDirOf(l) });
    addBox(r.x0, r.z0, r.x1, r.z1, top + SW_H, 'house');
  }
  if (resKits.length) mergeKits(resKits, scene);
  // lối xe lên dốc sân bay cắt qua vỉa hè (giữa vỉa hè, 2 đầu dốc): không đặt cây, cột điện, xe hàng rong chắn lối
  const driveways = [];
  for (const p of layout.places) {
    if (lookOf(p) !== 'airport') continue;
    const fr = placeFrame(p);
    if (fr.W < AIRPORT_MIN_W) continue;
    const path = airportPath(fr.W);
    for (const t of [0, 1]) {
      const q = path.getPointAt(t);
      driveways.push(fr.toWorld(q.x + Math.sign(q.x) * (0.75 + CITY.SW / 2), q.z));
    }
  }
  const nearDrive = (x, z, d = 4) => driveways.some(([a, b]) => Math.hypot(a - x, b - z) < d) || nearStop(x, z, 2.8);
  // trang trí đường phố theo khu (dây đèn lồng, đèn lồng giấy, xe hàng rong)
  const doors = layout.places.map((p) => p.door).filter(Boolean);
  const vendorCarts = buildStreetDecor(scene, {
    map: mapData, rng: styleRng, addBox, blockStyle, swH: SW_H,
    isPlaceDoor: (x, z) => doors.some((d) => Math.hypot(d.x - x, d.z - z) < 2.4) || nearDrive(x, z),
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
  // ---------- ô giữa khối thường: nhà phía sau lưng tựa lưng (1–3 tầng, không cửa) cho kín khối ----------
  // ngẫu nhiên theo toạ độ khối (không lấy từ rng chung → không làm đổi nhà ở chỗ khác)
  for (const c of layout.centerFills || []) {
    const cr = makeRng(seed * 977 + c.block[0] * 131 + c.block[1] * 7919 + 3);
    const top = addLotHouses(c, cr.pick(['N', 'S', 'E', 'W']), cr.int(1, 3), { back: true, seed: cr.int(1, 1e9) });
    addBox(c.x0, c.z0, c.x1, c.z1, top + SW_H, 'house');
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
      if (mouthBlocks(mouths, x, z)) continue; // chừa chỗ sông chảy ra
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
  // barie chân dốc sân bay: cần chắn sọc đỏ trắng, tự nâng khi xe bot (ô tô) tới gần; xe máy luôn bị chắn (khối va chạm cố định)
  const barriers = [];
  const armMats = [mat(0xd62d20), mat(0xf4f4f4)];
  const addBarrier = (f, q) => {
    const c = Math.cos(f.rotY), s = Math.sin(f.rotY);
    const wx = f.x + q.x * c + q.z * s, wz = f.z - q.x * s + q.z * c;
    const dx = q.ax * c + q.az * s, dz = -q.ax * s + q.az * c;
    const outer = new THREE.Group(), arm = new THREE.Group();
    outer.position.set(wx, SW_H + q.y, wz);
    outer.rotation.y = Math.atan2(-dz, dx);
    const n = Math.max(2, Math.round(q.len / 0.8)), seg = q.len / n;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(seg, 0.1, 0.1), armMats[i % 2]);
      m.position.x = seg * (i + 0.5);
      m.castShadow = true;
      arm.add(m);
    }
    outer.add(arm);
    scene.add(outer);
    barriers.push({ arm, x: wx + (dx * q.len) / 2, z: wz + (dz * q.len) / 2, open: 0 });
  };
  // mặt đi trên cao (dốc + sàn ga đi sân bay) và đường vòng cho xe bot chạy lên thả khách
  const elev = new Elevated();
  buildBridges(scene, G, elev); // cầu vòm cao, cầu kênh vồng (mặt đi trên cao cho xe)
  const loops = [];
  const addRamp = (p, rp) => {
    const fr = placeFrame(p);
    const lift = SW_H + (rp.dy || 0);
    const local = rp.path.getSpacedPoints(Math.max(2, Math.ceil(rp.path.getLength()))).map((q) => [q.x, q.y + lift, q.z]);
    const toW = ([x, y, z]) => {
      const [wx, wz] = fr.toWorld(x, z);
      return { x: wx, y, z: wz };
    };
    elev.addRamp(local.map(toW), rp.halfW);
    if (rp.walk) elev.addRamp(rp.walk.pts.map(([x, y, z]) => toW([x, y + SW_H, z])), rp.walk.lo, rp.walk.hi); // lề đi bộ sát nhà ga (bề rộng đổi dần)
    // đường vòng (toạ độ riêng của lô): đầu dốc bên trái → ra đường hông trái → đường phía sau → đường hông phải → vào đầu dốc bên phải.
    // Làn xe bám lề phía lô (xe chạy bên phải), tim đường dò theo lưới đường thật.
    const lane = 2.8, a = local[0], e = local[local.length - 1];
    const alongX = Math.abs(fr.c) > 0.5; // trục x riêng trùng trục x thế giới
    const snapRoad = (wx, wz, onX) => (onX ? [nearestRoad(wx), wz] : [wx, nearestRoad(wz)]);
    const xs = Math.abs(fr.toLocal(...snapRoad(...fr.toWorld(Math.abs(a[0]) + CITY.SW + CITY.ROAD / 2, a[2]), alongX))[0]) - lane;
    const zs = -fr.toLocal(...snapRoad(...fr.toWorld(0, -(fr.D + CITY.SW + CITY.ROAD / 2)), !alongX))[1] - lane;
    const corners = [[-xs, 0, e[2]], [-xs, 0, -zs], [xs, 0, -zs], [xs, 0, a[2]]];
    // bỏ vài điểm sát chân dốc để chỗ rẽ vào / ra dốc có cung rộng hơn (không bẻ lái gắt)
    const SKIP = 4, ramp = local.slice(SKIP, local.length - SKIP);
    const all = [...ramp, ...corners];
    const poly = [...ramp];
    for (let k = 0; k < corners.length; k++) {
      const i = ramp.length + k;
      poly.push(...roundCorner(all[i - 1], all[i], all[(i + 1) % all.length], 7));
    }
    const pts = resample(poly, 1);
    // điểm dừng thả khách: trên sàn ga đi, gần các vị trí x cho trước
    const top = Math.max(...local.map((q) => q[1]));
    const stops = (rp.stops || []).map((sx) => {
      let best = -1;
      pts.forEach((q, i) => {
        if (q[1] >= top - 0.05 && (best < 0 || Math.abs(q[0] - sx) < Math.abs(pts[best][0] - sx))) best = i;
      });
      return best;
    }).filter((i) => i >= 0);
    const [tx, tz] = rp.toTerminal || [0, -1];
    loops.push({ pts: pts.map(toW), stops, toTerminal: [tx * fr.c + tz * fr.s, -tx * fr.s + tz * fr.c] });
  };
  for (const p of layout.places) {
    const r = { x0: p.x0 + 0.25, x1: p.x1 - 0.25, z0: p.z0 + 0.25, z1: p.z1 - 0.25 };
    const f = frontOf(r, p.face);
    const depth = f.nx ? r.x1 - r.x0 : r.z1 - r.z0;
    const b = buildPlace({
      look: lookOf(p), W: f.width, D: depth, floors: lookFloors(p), color: p.color, signBg: p.signBg, sign: p.sign, short: p.short, kind: p.kind, signV: p.signV, signVText: p.signVText,
      menu: (p.menu || []).map((id) => itemTable[id]?.name).filter(Boolean), seed: hashStr(p.id), inAlley: p.inAlley,
      cut: cutSide(p.lot, p.face), // cả khối chừa góc: góc chừa bên trái / phải nhìn từ đường
      garage: p.kind === 'home', // phòng trọ Cô Hai: tầng trệt là hầm xe (src/sim/garage.js)
    });
    b.group.userData.placeId = p.id; // để công cụ Xây dựng bấm chọn nhà
    b.group.position.set(f.x, SW_H, f.z);
    b.group.rotation.y = f.rotY;
    scene.add(b.group);
    if (b.ramp) addRamp(p, b.ramp);
    if (b.barriers) for (const q of b.barriers) addBarrier(f, q);
    signMats.push(...b.glow);
    {
      // ghế của nhà này: toạ độ riêng → thế giới
      const c = Math.cos(f.rotY), s = Math.sin(f.rotY);
      for (const q of b.seats || []) seats.push({ x: f.x + q.x * c + q.z * s, y: q.y + SW_H, z: f.z - q.x * s + q.z * c, ry: q.ry + f.rotY, placeId: p.id });
      for (const q of b.parked || []) parkedBikes.push({ x: f.x + q.x * c + q.z * s, y: SW_H, z: f.z - q.x * s + q.z * c, ry: q.ry + f.rotY, c: q.c });
    }
    if (b.colliders === 'full') addBox(r.x0, r.z0, r.x1, r.z1, b.height + SW_H, 'place');
    else {
      // nhà mở (cây xăng): chỉ chắn cột, trụ bơm, cửa hàng — đổi khung riêng → thế giới
      const c = Math.cos(f.rotY), s = Math.sin(f.rotY);
      const W2 = (x, z) => [f.x + x * c + z * s, f.z - x * s + z * c];
      for (const q of b.colliders) {
        const [ax, az] = W2(q.x0, q.z0), [bx, bz] = W2(q.x1, q.z1);
        addBox(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), q.h, 'place', q.cam ? { y0: (q.y0 || 0) + SW_H, cam: true } : undefined);
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
  const trees = [...roadExtras.vergeTrees]; // + cây trên dải phân cách đại lộ, lề đường nhỏ
  for (let bz = 0; bz < CITY.N; bz++) {
    for (let bx = 0; bx < CITY.N; bx++) {
      if (isWaterBlock(bx, bz, mapData)) continue;
      const b = blockBounds(bx, bz);
      for (const [x, z, dx, dz] of [[b.x0 + 0.8, b.z0 + 0.8, -1, -1], [b.x1 - 0.8, b.z0 + 0.8, 1, -1], [b.x0 + 0.8, b.z1 - 0.8, -1, 1], [b.x1 - 0.8, b.z1 - 0.8, 1, 1]]) {
        if (joinedSide(bx, bz, dx > 0 ? 'E' : 'W', mapData) || joinedSide(bx, bz, dz > 0 ? 'S' : 'N', mapData)) continue; // góc giáp khối đã gộp
        if (nearDrive(x, z)) continue; // lối xe lên dốc
        lamps.push({ x, z, dx, dz });
      }
      const ax = b.x0 + CITY.SW, az = b.z0 + CITY.SW;
      // cây xanh theo khu ("trees": 0 = không cây, 1 = như cũ 8 cây, 2 = gấp đôi): giữ / thêm theo tỉ lệ
      const t = treesOf(districtAt(bx, bz, mapData));
      // [vị trí theo bề rộng lô, bậc]: bậc 1 = 2 cây cũ mỗi cạnh (giữ khi t < 1), bậc 2 = thêm 2 cây (khi t > 1), lệch khỏi cửa nhà
      for (const [k, tier] of [[1, 1], [2, 1], [1 / 4, 2], [11 / 4, 2]]) {
        const need = tier === 1 ? Math.min(1, t) : Math.min(1, Math.max(0, t - 1));
        for (const [side, ...p] of [['N', ax + k * W, b.z0 + 0.9], ['S', ax + k * W, b.z1 - 0.9], ['W', b.x0 + 0.9, az + k * W], ['E', b.x1 - 0.9, az + k * W]]) {
          if (joinedSide(bx, bz, side, mapData)) continue;
          if (nearDrive(...p)) continue; // lối xe lên dốc
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

  // Cây: thân + tán nhiều cụm, 2 dáng (tán tròn xòe / tán cao), màu lá lệch từng cây; ô đất có viền quanh gốc
  const crownOf = (parts) => mergeGeometries(parts.map(([r, x, y, z]) => new THREE.IcosahedronGeometry(r, 0).translate(x, y, z)));
  const CROWNS = [
    crownOf([[1.25, 0, 0, 0], [0.95, 0.9, 0.15, 0.3], [0.9, -0.85, 0.1, -0.35], [0.85, 0.1, 0.55, -0.85], [0.8, -0.25, 0.7, 0.85]]),
    crownOf([[0.95, 0, -0.35, 0], [0.85, 0.2, 0.55, 0.15], [0.7, -0.1, 1.3, -0.1], [0.75, 0.45, 0.15, -0.45], [0.6, -0.35, 0.9, 0.35]]),
    crownOf([[0.85, 0, 0, 0], [0.75, 0.35, 0.8, 0.2], [0.7, -0.35, 0.55, -0.25], [0.6, 0.1, 1.5, -0.1], [0.55, -0.2, 2.1, 0.15]]), // tán thưa đặt cao (cây dầu, cây sao)
  ];
  const TALL = 2.3; // cây thân cao: thân dài gấp 2,3 lần
  const kindOf = trees.map(() => 0);
  for (let i = trees.length - 1; i >= 0; i--) if (nearStop(trees[i][0], trees[i][1])) trees.splice(i, 1); // chừa chỗ nhà chờ xe buýt
  // nhà chờ xe buýt ở các trạm (gộp 1 lần) + khối chắn vách kính, ghế phía sau
  if (bus.stops.length) {
    const k = makeKit();
    for (const s of bus.stops) {
      busStopModel(k, s.x, s.z, s.ry);
      const c = Math.cos(s.ry), sn = Math.sin(s.ry);
      const pts = [[-1.6, -0.75], [1.6, -0.75], [-1.6, -0.2], [1.6, -0.2]].map(([lx, lz]) => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c]);
      addBox(Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])), 2.5, 'busStop');
    }
    mergeKits([{ kit: k, matrix: new THREE.Matrix4().makeTranslation(0, SW_H, 0) }], scene);
    for (const q of k.seats) seats.push({ ...q, y: q.y + SW_H, busStop: true });
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.18, 3, 6), mat(0x6e4b2a), trees.length);
  const pitFrame = new THREE.InstancedMesh(new THREE.BoxGeometry(1.25, 0.05, 1.25), mat(0xb9b4ab), trees.length);
  const pitSoil = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.05, 1.0), mat(0x4a3a2c, { roughness: 1 }), trees.length);
  const crownMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  const crownMats = [];
  trees.forEach(([x, z], k) => {
    const rot = rng.next() * 6;
    kindOf[k] = rng.next() < 0.45 ? 2 : rot > 4.2 ? 1 : 0; // ~45% cây thân cao, còn lại 2 dáng cũ
    const tk = kindOf[k] === 2 ? TALL : 1;
    dummy.rotation.set(0, rot, 0);
    dummy.scale.set(1, tk, 1);
    dummy.position.set(x, 1.5 * tk + SW_H, z);
    dummy.updateMatrix();
    trunks.setMatrixAt(k, dummy.matrix);
    dummy.position.set(x, SW_H + 0.01, z);
    dummy.updateMatrix();
    pitFrame.setMatrixAt(k, dummy.matrix);
    dummy.position.set(x, SW_H + 0.025, z);
    dummy.updateMatrix();
    pitSoil.setMatrixAt(k, dummy.matrix);
    const s = 0.85 + rng.next() * 0.5;
    dummy.scale.set(s, s * 1.1, s);
    dummy.position.set(x, (kindOf[k] === 2 ? 3 * TALL + 0.4 : 3.6) + SW_H + s * 0.3, z);
    dummy.updateMatrix();
    crownMats.push(dummy.matrix.clone());
    crownMats[k].color = col.setHSL(0.27 + rng.next() * 0.07, 0.45, 0.27 + rng.next() * 0.1).clone();
    addBox(x - 0.22, z - 0.22, x + 0.22, z + 0.22, 3, 'tree');
  });
  for (const v of [0, 1, 2]) {
    const idx = trees.map((_, k) => k).filter((k) => kindOf[k] === v);
    if (!idx.length) continue;
    const cm = new THREE.InstancedMesh(CROWNS[v], crownMat, idx.length);
    idx.forEach((k, i) => {
      cm.setMatrixAt(i, crownMats[k]);
      cm.setColorAt(i, crownMats[k].color);
    });
    cm.castShadow = true;
    scene.add(cm);
  }
  trunks.castShadow = true;
  pitFrame.receiveShadow = pitSoil.receiveShadow = true;
  scene.add(trunks, pitFrame, pitSoil);

  // ---------- cột điện + dây điện chằng chịt ----------
  // Mỗi cạnh khối 2 cột sát mép vỉa hè (né đèn đường ở góc, cây ở 1/3 cạnh, miệng hẻm ở giữa).
  // Dây nối 2 cột cùng cạnh và nối sang cột của khối kế bên (vắt qua ngã tư); vẽ bằng nét mảnh → 1 lệnh vẽ cho cả thành phố.
  const polePos = new Map(); // `${bx},${bz},${side}` → [[x,z], [x,z]] theo chiều tăng toạ độ
  for (let bz = 0; bz < CITY.N; bz++) {
    for (let bx = 0; bx < CITY.N; bx++) {
      if (isWaterBlock(bx, bz, mapData)) continue;
      const b = blockBounds(bx, bz), e = 0.45;
      const sides = { N: [[b.x0 + 8, b.z0 + e], [b.x1 - 8, b.z0 + e]], S: [[b.x0 + 8, b.z1 - e], [b.x1 - 8, b.z1 - e]], W: [[b.x0 + e, b.z0 + 8], [b.x0 + e, b.z1 - 8]], E: [[b.x1 - e, b.z0 + 8], [b.x1 - e, b.z1 - 8]] };
      for (const [side, pts] of Object.entries(sides)) {
        if (joinedSide(bx, bz, side, mapData)) continue; // cạnh giáp khối gộp: không còn đường
        // cột vướng lối xe lên dốc: dời dọc cạnh vào phía giữa khối
        for (const pt of pts) {
          const i = side === 'W' || side === 'E' ? 1 : 0, mid = i ? (b.z0 + b.z1) / 2 : (b.x0 + b.x1) / 2;
          for (let k = 0; k < 12 && nearDrive(pt[0], pt[1]); k++) pt[i] += pt[i] < mid ? 1 : -1;
        }
        polePos.set(`${bx},${bz},${side}`, pts);
      }
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
        if (!polePos.has(`${bx},${bz},${side}`)) continue;
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

  // ---------- nước ngập trên các đoạn đường trũng (map.json → floodSegs; ẩn khi khô) ----------
  // Mỗi đoạn một tấm nước phủ lòng đường + một phần vỉa hè; nước càng sâu càng đục và càng cao
  const floodGeo = new THREE.PlaneGeometry(1, 1);
  const floods = new Map(); // id → mesh
  const waterTex = makeWaterTexture();
  for (const id of Object.keys(floodMap())) {
    const sg = segOfId(id);
    const r = segmentRect(sg);
    const wide = 1.6; // lấn ra vỉa hè mỗi bên (m)
    const tex = waterTex.clone(); // mỗi tấm lặp vân theo kích thước riêng (1 lần lặp ≈ 8 m)
    const m = new THREE.Mesh(floodGeo, new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.2, metalness: 0, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((r.x0 + r.x1) / 2, 0.02, (r.z0 + r.z1) / 2);
    // nối liền qua ngã tư: kéo dài thêm nửa lòng đường mỗi đầu
    const ext = CITY.ROAD / 2;
    m.scale.set(sg.axis === 'x' ? r.x1 - r.x0 + wide * 2 : r.x1 - r.x0 + ext * 2, sg.axis === 'x' ? r.z1 - r.z0 + ext * 2 : r.z1 - r.z0 + wide * 2, 1);
    tex.repeat.set(m.scale.x / 8, m.scale.y / 8);
    m.visible = false;
    m.renderOrder = 2;
    scene.add(m);
    floods.set(id, m);
  }

  // ---------- đời sống vỉa hè: xe máy đậu xiên + quán cóc ghế nhựa (độ đông theo khu: data/districtTraits.js streetOf) ----------
  // Vỉa hè 3 dải (tính từ mép lề): 0–1,8 m xe đậu xiên · ~1,8–2,4 m lối đi bộ (traffic.js PED_LANE) · 2,4–3,2 m quán cóc sát nhà.
  // Mỗi căn hoặc có quán cóc (căn có cửa hàng) hoặc có xe đậu — không cả hai, để lối đi bộ luôn trống.
  // Né cây, cột điện, đèn, trạm xe buýt, xe hàng rong (lưới va chạm), cửa địa điểm và lối xe lên dốc.
  {
    const lr = makeRng(seed * 53 + 7), sk = makeKit();
    const STOOLS = [0xd63a2f, 0x2f6fb2, 0xd63a2f, 0x2e8b57, 0xe6a817];
    const BIKE_COLS = [0xc0392b, 0x2c3e50, 0xecf0f1, 0x8e44ad, 0x2980b9, 0x7f8c8d, 0xd35400, 0x111111];
    const toCurb = CITY.SW + 0.25; // mặt nhà → mép lề
    const free = (x, z, r) => circleFree(grid, x, z, r, SW_H) && !doors.some((d) => Math.hypot(d.x - x, d.z - z) < 2.2) && !nearDrive(x, z) && !nearStop(x, z, 3) && !noPark(x, z);
    let nStall = 0;
    // trước địa điểm (tiệm, quán…) cũng có xe khách đậu — chỉ xe, không quán cóc; né cửa (free) · bỏ địa điểm trong hẻm / sân bay
    const NORMAL_OF = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
    for (const p of layout.places) {
      if (!p.door || p.inAlley || !NORMAL_OF[p.face] || lookOf(p) === 'airport' || noParkPlace(p)) continue;
      const fr = placeFrame(p), [fx, fz] = fr.toWorld(0, 0), [nx, nz] = NORMAL_OF[p.face];
      frontages.push({ x: fx, z: fz, nx, nz, W: fr.W, ground: 'place' });
    }
    for (const f of frontages) {
      const d = districtAtPoint(f.x, f.z, mapData);
      const Ux = f.nz, Uz = -f.nx; // dọc mặt tiền (sang phải khi nhìn từ đường)
      const at = (u, out) => [f.x + Ux * u + f.nx * out, f.z + Uz * u + f.nz * out]; // out: mét từ mặt nhà ra đường
      const face = Math.atan2(f.nx, f.nz); // hướng nhìn ra đường
      if (f.stall) {
        // quán cóc: bàn thấp + 3–4 ghế nhựa sát mặt tiền (ngồi được)
        const [tx, tz] = at(0, 0.5);
        if (!free(tx, tz, 0.3)) continue; // vòng nhỏ: không chạm tường nhà ngay sau lưng
        sk.box(0.6, 0.06, 0.45, tx, 0.45, tz, 0xe8e2d0);
        sk.cyl(0.04, 0.04, 0.42, tx, 0.21, tz, 0x8a8f96, 'metal', 6);
        const col = STOOLS[lr.int(0, STOOLS.length - 1)];
        for (const [du, dv, ry] of [[-0.55, 0.45, -Math.PI / 2], [0.55, 0.45, Math.PI / 2], [0, 0.85, Math.PI], [-0.25, 0.08, 0]].slice(0, 3 + lr.int(0, 1))) {
          const [x, z] = at(du, dv);
          sk.cyl(0.17, 0.14, 0.32, x, 0.16, z, col, '', 8);
          sk.seat(x, 0.32, z, face + ry);
        }
        const [a0x, a0z] = at(-0.75, 0.05), [a1x, a1z] = at(0.75, 0.95);
        addBox(Math.min(a0x, a1x), Math.min(a0z, a1z), Math.max(a0x, a1x), Math.max(a0z, a1z), 0.5, 'decor');
        nStall++;
        continue;
      }
      // xe máy đậu xiên thành hàng ở dải sát lề (tâm xe cách lề 0,9 m), cùng 1 hàng cùng 1 hướng xiên
      const pb = Math.min(0.45, 0.2 * streetOf(d, 'bikes')), tilt = lr.next() < 0.5 ? 0.38 : -0.38; // độ đông 1 (vừa) ≈ 20% chỗ có xe
      for (let u = -f.W / 2 + 0.45; u < f.W / 2 - 0.3; u += 0.85) {
        if (lr.next() > pb) continue;
        const [x, z] = at(u, toCurb - 0.9);
        if (!free(x, z, 0.5)) continue;
        parkedBikes.push({ x, y: SW_H, z, ry: face + tilt + (lr.next() - 0.5) * 0.1, c: BIKE_COLS[lr.int(0, BIKE_COLS.length - 1)] });
        const hx = Math.abs(f.nx) * 0.8 + Math.abs(Ux) * 0.4, hz = Math.abs(f.nz) * 0.8 + Math.abs(Uz) * 0.4; // thân xe dọc theo hướng ra đường
        addBox(x - hx, z - hz, x + hx, z + hz, 1.0, 'bike');
      }
    }
    if (nStall) {
      mergeKits([{ kit: sk, matrix: new THREE.Matrix4().makeTranslation(0, SW_H, 0) }], scene);
      for (const q of sk.seats) seats.push({ ...q, y: q.y + SW_H, stall: true });
    }
  }

  // xe máy đậu: vẽ bằng mẫu xe thật, chỉ hiện quanh người chơi (game.js gọi parked.update mỗi khung hình)
  const parked = buildParkedBikes(scene, parkedBikes);

  // ---------- đổi theo giờ / thời tiết ----------
  const dryColor = new THREE.Color(0xffffff), wetColor = new THREE.Color(0x9fa4ad);
  return {
    grid,
    mouths, // cửa sông mở ra ngoài biên (sky.js: đứng gần thì sương mù lùi xa)
    elev, // mặt đi trên cao (xe / người chạy lên dốc sân bay)
    loops, // đường vòng cho xe bot (traffic.addLoop)
    barriers, // barie chân dốc sân bay (giữa cần chắn: x, z)
    bus, // xe buýt: tuyến + trạm (src/sim/bus.js)
    seats, // chỗ ngồi được (ghế quán, ghế đá công viên, ghế trạm xe buýt…)
    vendorCarts, // xe hàng rong trên vỉa hè [{ x, z, along }] — núp sau được (cốt truyện)
    trees, // gốc cây trên vỉa hè / dải phân cách: [[x, z], …] (cốt truyện: người lạ đứng cạnh gốc cây)
    parked, // xe máy đậu (lề đường, bãi giữ xe…): parked.update(x, z) hiện các ô gần
    // mỗi khung hình: nâng / hạ cần barie theo xe bot gần đó
    update(dt, cars = []) {
      for (const b of barriers) {
        const near = cars.some((a) => Math.hypot(a.x - b.x, a.z - b.z) < 7);
        b.open += ((near ? 1 : 0) - b.open) * Math.min(1, dt * 3);
        b.arm.rotation.z = b.open * 1.4;
      }
    },
    setNight(n) {
      headMat.emissiveIntensity = 0.2 + 3 * n;
      poolMat.opacity = 0.85 * n;
      houseMat.emissiveIntensity = 1.6 * n;
      for (const m of signMats) m.emissiveIntensity = (m.userData.glowBase ?? 0.15) + 0.7 * n;
    },
    // depth: { id → mực nước 0..1 } (HazardManager.floodState)
    setFlood(depth) {
      const t = performance.now() / 1000;
      for (const [id, m] of floods) {
        const d = depth[id] || 0;
        m.visible = d > 0.01;
        if (!m.visible) continue;
        m.material.opacity = Math.min(0.9, 0.3 + 0.6 * d);
        m.position.y = 0.02 + d * 0.2; // ngập sâu thì nước dâng quá mép vỉa hè (0,15 m)
        m.material.map.offset.set(t * 0.015, t * 0.025); // nước trôi chậm
      }
    },
    setWet(w) {
      roadMat.color.copy(dryColor).lerp(wetColor, w);
      roadMat.roughness = 0.92 - 0.55 * w;
      roadMat.metalness = 0.25 * w;
    },
  };
}

// Khung toạ độ riêng của địa điểm (như lúc dựng nhà): gốc giữa mặt tiền, x dọc mặt tiền, z âm đi vào trong lô
const placeFrame = lotFrame; // (src/sim/airport.js)
// Tim đường gần nhất (toạ độ một trục)
function nearestRoad(v) {
  const i = Math.max(0, Math.min(CITY.N, Math.round((v - CITY.ORIGIN) / CITY.PITCH)));
  return roadPos(i);
}
// Bo tròn góc C (giữa P và N) bằng cung bậc hai bán kính ~R; điểm dạng [x, y, z]
function roundCorner(P, C, N, R) {
  const l1 = Math.hypot(C[0] - P[0], C[2] - P[2]) || 1e-6, l2 = Math.hypot(N[0] - C[0], N[2] - C[2]) || 1e-6;
  const r = Math.min(R, l1 / 2, l2 / 2);
  const A = C.map((v, k) => v + ((P[k] - v) * r) / l1), B = C.map((v, k) => v + ((N[k] - v) * r) / l2);
  const out = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    out.push(A.map((v, k) => (1 - t) * (1 - t) * v + 2 * (1 - t) * t * C[k] + t * t * B[k]));
  }
  return out;
}
// Chia lại đường khép kín thành các điểm cách đều ~step m
function resample(poly, step) {
  const pts = [...poly, poly[0]];
  const out = [];
  let d = 0; // vị trí điểm kế tiếp tính từ đầu đoạn hiện tại
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[2] - a[2]);
    for (; d < L; d += step) out.push(a.map((v, k) => v + ((b[k] - v) * d) / L));
    d -= L;
  }
  return out;
}

function lotRect(spec) {
  const b = blockBounds(spec.block[0], spec.block[1]);
  const ax = b.x0 + CITY.SW, az = b.z0 + CITY.SW, W = LOT_W;
  return { x0: ax + 2 * W, x1: ax + 3 * W, z0: az + W, z1: az + 2 * W };
}
