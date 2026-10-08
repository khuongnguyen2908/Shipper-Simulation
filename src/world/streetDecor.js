// TRANG TRÍ ĐƯỜNG PHỐ THEO KHU (map.json → districts[mã].decor): chỉ để nhìn, không đổi luật chơi.
// lanterns = dây đèn lồng đỏ giăng ngang đường · chochin = cột đèn lồng giấy trên vỉa hè (khối phố Nhật) · vendors = xe hàng rong
// Mọi thứ dựng bằng toạ độ thế giới vào 1 bộ gom rồi gộp theo vật liệu (vài khối vẽ cho cả thành phố).
import * as THREE from 'three';
import { CITY, LOT_W, blockBounds, districtAt, riverInfo } from '../sim/cityLayout.js';
import { makeKit, mergeKits, kitLantern } from './placeBuildings.js';

const W = LOT_W;
const has = (d, k) => !!(d && d.decor && d.decor[k]);
const UMBRELLA = [0xe74c3c, 0x3498db, 0xf1c40f, 0x27ae60, 0xe67e22];

// x/z dọc một cạnh khối: điểm k (theo bề rộng lô) trên cạnh `side`, cách mép vỉa hè `inset` mét
function sidePoint(b, side, k, inset) {
  const ax = b.x0 + CITY.SW, az = b.z0 + CITY.SW;
  if (side === 'N') return [ax + k * W, b.z0 + inset];
  if (side === 'S') return [ax + k * W, b.z1 - inset];
  if (side === 'W') return [b.x0 + inset, az + k * W];
  return [b.x1 - inset, az + k * W];
}

// xe hàng rong: thùng xe, 2 bánh, dù màu (quay dọc theo cạnh vỉa hè)
function vendorCart(k, x, z, along, color) {
  const [sx, sz] = along === 'x' ? [1.5, 0.8] : [0.8, 1.5];
  k.box(sx, 0.75, sz, x, 0.75, z, 0xd9d2c5);
  k.box(sx + 0.05, 0.08, sz + 0.05, x, 1.16, z, 0x95a5a6, 'metal');
  for (const s of [-1, 1]) {
    const [wx, wz] = along === 'x' ? [x + s * 0.55, z] : [x, z + s * 0.55];
    k.cyl(0.24, 0.24, 0.08, wx, 0.24, wz, 0x222222, '', 10, along === 'x' ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2]);
  }
  k.cyl(0.03, 0.03, 1.5, x, 1.9, z, 0x555555, 'metal', 6);
  k.cyl(0.05, 1.2, 0.4, x, 2.7, z, color, 'double', 8);
}

// dây đèn lồng đỏ giăng ngang 1 đoạn đường: 2 cột hai bên vỉa hè + dây võng + đèn lồng
function lanternRope(k, a, b, addBox) {
  const H = 6.2, sag = 0.7, n = 6;
  for (const [x, z] of [a, b]) {
    k.cyl(0.07, 0.09, H, x, H / 2, z, 0x6e2c00, '', 6);
    addBox(x - 0.12, z - 0.12, x + 0.12, z + 0.12, H, 'decor');
  }
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = H - 0.15 - sag * 4 * t * (1 - t);
    const p = new THREE.Vector3(a[0] + (b[0] - a[0]) * t, y, a[1] + (b[1] - a[1]) * t);
    if (prev) k.rod(prev, p, 0.02, 0x2b2b2b);
    if (i > 0 && i < n) kitLantern(k, p.x, y - 0.4, p.z, i % 2 ? 0xd62d20 : 0xe8b923);
    prev = p;
  }
}

// cột đèn lồng giấy kiểu Nhật (cột gỗ thấp, đèn trắng / đỏ)
function chochinPost(k, x, z, red, addBox) {
  k.cyl(0.06, 0.07, 2.6, x, 1.3, z, 0x3b2a1e, '', 6);
  k.box(0.5, 0.05, 0.05, x, 2.55, z, 0x3b2a1e);
  k.cyl(0.2, 0.2, 0.5, x, 2.15, z, red ? 0xd62d20 : 0xf6eedb, 'light', 10);
  k.cyl(0.21, 0.21, 0.05, x, 2.42, z, 0x1b1b1b, '', 10);
  k.cyl(0.21, 0.21, 0.05, x, 1.88, z, 0x1b1b1b, '', 10);
  addBox(x - 0.1, z - 0.1, x + 0.1, z + 0.1, 2.6, 'decor');
}

// blockStyle(bx, bz) → kiểu nhà chủ đạo của khối (chochin chỉ dựng ở khối phố Nhật)
export function buildStreetDecor(scene, { map, rng, addBox, blockStyle, isPlaceDoor, swH = 0 }) {
  const k = makeKit();
  const { waterSegs } = riverInfo(map);
  const inMap = (bx, bz) => bx >= 0 && bz >= 0 && bx < CITY.N && bz < CITY.N;
  let count = 0;
  for (let bz = 0; bz < CITY.N; bz++) {
    for (let bx = 0; bx < CITY.N; bx++) {
      const d = districtAt(bx, bz, map);
      if (!d || !d.decor) continue;
      const b = blockBounds(bx, bz);
      // dây đèn lồng: giăng qua đường phía Bắc / Tây của khối (và Nam / Đông nếu khối bên kia không giăng), bỏ đoạn là sông
      if (has(d, 'lanterns')) {
        const sides = [
          ['N', bx, bz - 1, `z${bz}:${bx}`, 0, -1],
          ['W', bx - 1, bz, `x${bx}:${bz}`, -1, 0],
          ['S', bx, bz + 1, `z${bz + 1}:${bx}`, 0, 1],
          ['E', bx + 1, bz, `x${bx + 1}:${bz}`, 1, 0],
        ];
        for (const [side, nx, nz, seg, dx, dz] of sides) {
          if (!inMap(nx, nz) || waterSegs.has(seg)) continue;
          const other = has(districtAt(nx, nz, map), 'lanterns');
          if ((side === 'S' || side === 'E') && other) continue; // khối bên kia đã giăng
          for (const kk of [0.75, 2.25]) {
            const a = sidePoint(b, side, kk, 0.5);
            const far = [a[0] + dx * (CITY.ROAD + 1), a[1] + dz * (CITY.ROAD + 1)];
            lanternRope(k, a, far, addBox);
            count++;
          }
        }
      }
      // đèn lồng giấy: chỉ khối có kiểu nhà chủ đạo là phố Nhật
      const chochin = has(d, 'chochin') && blockStyle(bx, bz) === 'japanese';
      if (chochin) {
        for (const side of ['N', 'S', 'W', 'E']) {
          for (const kk of [0.75, 1.25, 1.75, 2.25]) {
            const [x, z] = sidePoint(b, side, kk, 1.0);
            chochinPost(k, x, z, rng.next() < 0.4, addBox);
            count++;
          }
        }
      }
      // xe hàng rong: 0–2 xe mỗi cạnh, lệch khỏi cửa nhà và cây (khối đã có đèn lồng giấy thì thôi)
      if (has(d, 'vendors') && !chochin) {
        for (const side of ['N', 'S', 'W', 'E']) {
          for (const kk of [0.75, 2.25]) {
            if (rng.next() > 0.3) continue;
            const [x, z] = sidePoint(b, side, kk, 1.1);
            if (isPlaceDoor(x, z)) continue;
            const along = side === 'N' || side === 'S' ? 'x' : 'z';
            vendorCart(k, x, z, along, UMBRELLA[Math.floor(rng.next() * UMBRELLA.length)]);
            const [hx, hz] = along === 'x' ? [0.8, 0.45] : [0.45, 0.8];
            addBox(x - hx, z - hz, x + hx, z + hz, 1.2, 'decor');
            count++;
          }
        }
      }
    }
  }
  if (count) mergeKits([{ kit: k, matrix: new THREE.Matrix4().makeTranslation(0, swH, 0) }], scene);
  return count;
}
