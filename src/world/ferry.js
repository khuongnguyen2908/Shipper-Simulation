// Phà trên sông (hình ảnh): cầu dẫn + phao nổi ở mỗi bến, các chiếc phà chạy theo lịch (src/sim/ferry.js).
// Người chơi đi phà: game.js gắn người + xe lên boong chiếc đang chở (pose / BOAT_DECK).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ferryPairs, boatPose, ferryRule, PONTOON, BOAT_L, BOAT_W, BOAT_DECK } from '../sim/ferry.js';
import { makeBike, makePerson, setSitting, sitY } from './models.js';

const SW_H = 0.15;
const MATS = new Map();
const mat = (c, o = {}) => {
  const k = c + JSON.stringify(o);
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true, ...o }));
  return MATS.get(k);
};
// gộp các hình cùng vật liệu thành 1 khối
function merged(list) {
  const g = new THREE.Group();
  const by = new Map();
  for (const [geo, m] of list) {
    const gg = geo.index ? geo.toNonIndexed() : geo;
    if (gg.attributes.uv) gg.deleteAttribute('uv');
    gg.computeVertexNormals();
    if (!by.has(m)) by.set(m, []);
    by.get(m).push(gg);
  }
  for (const [m, geos] of by) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// Một chiếc phà (dài theo trục z riêng, 2 đầu như nhau): thân, boong, lan can vàng, cabin lái bên mạn phải, cửa dốc 2 đầu
function boatMesh(i) {
  const L = BOAT_L, W = BOAT_W, D = BOAT_DECK;
  const parts = [
    [box(W, 0.9, L, 0, D - 0.45, 0), mat(i % 2 ? 0x1f4e79 : 0x7b241c)],
    [box(W - 0.2, 0.06, L - 0.4, 0, D + 0.03, 0), mat(0x95a5a6)],
    [box(0.06, 0.8, L - 3, -W / 2 + 0.1, D + 0.4, 0), mat(0xf1c40f, { metalness: 0.3 })],
    [box(0.06, 0.8, L - 3, W / 2 - 0.1, D + 0.4, 0), mat(0xf1c40f, { metalness: 0.3 })],
    [box(2.2, 2.4, 2.4, W / 2 - 1.3, D + 1.2, 0), mat(0xf4f6f7)],
    [box(2.4, 0.2, 2.6, W / 2 - 1.3, D + 2.5, 0), mat(0xc0392b)],
    [box(2.24, 0.7, 2.2, W / 2 - 1.3, D + 1.7, 0), mat(0x34495e, { roughness: 0.2 })],
  ];
  for (const s of [-1, 1]) parts.push([box(W - 1.6, 0.12, 1.4, -0.4, D + 0.1, s * (L / 2 + 0.6)), mat(0x7f8c8d, { metalness: 0.3 })]);
  const g = merged(parts);
  // xe máy bot chở theo (nửa trước boong) — nửa sau chừa cho người chơi
  const cols = [0xc0392b, 0x2e86de, 0x27ae60, 0x111111];
  [[-2.4, 2.4], [-0.8, 2.4], [-2.4, 4.6], [-0.8, 4.6]].forEach(([x, z], k) => {
    const b = makeBike(cols[(k + i) % cols.length], 'underbone');
    b.userData.bagMesh.visible = false;
    b.position.set(x, D + 0.06, z);
    const p = makePerson({ shirt: [0x1f9e55, 0x2e86de, 0xf39c12, 0x9b59b6][(k + i) % 4], pants: 0x1f2d3d, hat: 'helmet', hatColor: 0xffffff });
    setSitting(p, true);
    p.position.set(0, sitY(), -0.05);
    b.add(p);
    g.add(b);
  });
  return g;
}

export function buildFerries(scene, places) {
  const pairs = ferryPairs(places);
  // cầu dẫn (dốc từ mép bờ xuống phao) + phao nổi + cọc buộc ở mỗi bến
  const piers = [];
  for (const pair of pairs) {
    for (const pier of [pair.a, pair.b]) {
      const [nx, nz] = pier.n, { x: ex, z: ez } = pier.edge;
      const at = (d, lat = 0) => [ex + nx * d - nz * lat, ez + nz * d + nx * lat];
      const along = (len, h, wid, d, y, lat = 0) => {
        const [x, z] = at(d, lat);
        return nx ? box(len, h, wid, x, y, z) : box(wid, h, len, x, y, z);
      };
      const ramp = along(2.8, 0.18, 4, 1.4, SW_H + 0.05);
      ramp.rotateY(0); // dốc nhẹ: đầu bờ cao bằng vỉa hè, đầu phao thấp hơn chút (đủ nhìn, không cần nghiêng)
      piers.push([ramp, mat(0x7f8c8d, { metalness: 0.3 })]);
      piers.push([along(PONTOON - 2.8, 0.5, 9, 2.8 + (PONTOON - 2.8) / 2, 0.1), mat(0x5d6d7e)]);
      for (const lat of [-4, 4]) piers.push([along(0.3, 0.9, 0.3, PONTOON - 0.3, 0.6, lat), mat(0x2c3e50)]);
      for (const lat of [-2, 2]) piers.push([along(2.8, 0.7, 0.06, 1.4, SW_H + 0.45, lat), mat(0xd0d3d4, { metalness: 0.4 })]);
    }
  }
  if (piers.length) scene.add(merged(piers));
  const boats = [];
  const n = Math.max(1, Math.min(4, Math.round(ferryRule('boats', 2))));
  for (const pair of pairs) {
    for (let i = 0; i < n; i++) {
      const mesh = boatMesh(i);
      scene.add(mesh);
      boats.push({ pair, i, mesh });
    }
  }
  return {
    pairs,
    boats,
    pose: (pair, i, now) => boatPose(pair, i, now),
    // dịch phà theo giờ game; nhấp nhô nhẹ trên sóng
    update(now, t = 0) {
      for (const b of boats) {
        const p = boatPose(b.pair, b.i, now);
        b.mesh.position.set(p.x, 0.02 + Math.sin(t * 1.3 + b.i) * 0.03, p.z);
        b.mesh.rotation.set(Math.sin(t * 0.9 + b.i) * 0.01, p.heading, Math.sin(t * 1.1 + b.i * 2) * 0.012);
      }
    },
  };
}
