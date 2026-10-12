// Xe máy đậu (lề đường nhỏ, bãi giữ xe, bãi xe sân bay, sân đồn công an, showroom): dùng ĐÚNG mẫu xe thật (makeBike),
// chỉ để nhìn — không ngồi lên được. Vẽ gộp bằng InstancedMesh: mỗi bộ phận của mỗi kiểu xe chỉ 1 lần vẽ cho cả ô.
// Thành phố chia ô CELL m; chỉ hiện các ô trong bán kính SHOW m quanh người chơi (xe ở xa nhỏ xíu, ẩn cho nhẹ máy).
import * as THREE from 'three';
import { makeBike } from './models.js';

export const PARKED_MODELS = ['underbone']; // kiểu xe đậu (nhiều kiểu = nhiều lần vẽ hơn)
const CELL = 30;
const SHOW = 70;

// list: [{ x, y, z, ry (hướng đầu xe), c (màu sơn) }] toạ độ thế giới
export function buildParkedBikes(scene, list, models = PARKED_MODELS) {
  const cells = new Map(); // 'i,j' → [xe]
  list.forEach((b, n) => {
    const key = `${Math.floor(b.x / CELL)},${Math.floor(b.z / CELL)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push({ ...b, model: models[n % models.length] });
  });
  // mẫu từng kiểu xe: các bộ phận (bỏ đèn pha và thùng giao hàng)
  const tpls = new Map();
  for (const model of models) {
    const t = makeBike(0xffffff, model);
    t.updateMatrixWorld(true);
    const skip = new Set([t.userData.lamp, t.userData.bagMesh]);
    tpls.set(model, t.children.filter((m) => m.isMesh && !skip.has(m)).map((m) => ({ geo: m.geometry, mat: t.userData.painted.includes(m) ? m.material.clone() : m.material, local: m.matrix.clone(), painted: t.userData.painted.includes(m) })));
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const groups = [];
  for (const [key, bikes] of cells) {
    const [i, j] = key.split(',').map(Number);
    const g = new THREE.Group();
    g.userData.center = { x: (i + 0.5) * CELL, z: (j + 0.5) * CELL };
    for (const model of models) {
      const items = bikes.filter((b) => b.model === model);
      if (!items.length) continue;
      for (const part of tpls.get(model)) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, items.length);
        im.castShadow = im.receiveShadow = true;
        items.forEach((b, k) => {
          q.setFromAxisAngle(up, b.ry);
          pos.set(b.x, b.y, b.z);
          m4.compose(pos, q, one).multiply(part.local);
          im.setMatrixAt(k, m4);
          if (part.painted) im.setColorAt(k, col.set(b.c));
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        g.add(im);
      }
    }
    g.visible = false;
    scene.add(g);
    groups.push(g);
  }
  return {
    count: list.length,
    // mỗi khung hình: hiện các ô gần người chơi
    update(px, pz) {
      const r = SHOW + CELL * 0.71;
      for (const g of groups) g.visible = Math.hypot(g.userData.center.x - px, g.userData.center.z - pz) < r;
    },
  };
}
