// Va chạm đơn giản: vật cản là hộp chữ nhật nằm ngang (AABB), nhân vật/xe là hình tròn.
// Lưới không gian giúp chỉ kiểm tra các vật cản ở gần.
import { HALF } from '../sim/cityLayout.js';

export class SpatialGrid {
  constructor(cell = 16) {
    this.cell = cell;
    this.map = new Map();
    this.all = [];
  }
  key(i, j) {
    return `${i},${j}`;
  }
  add(c) {
    this.all.push(c);
    const s = this.cell;
    for (let i = Math.floor(c.x0 / s); i <= Math.floor(c.x1 / s); i++) {
      for (let j = Math.floor(c.z0 / s); j <= Math.floor(c.z1 / s); j++) {
        const k = this.key(i, j);
        if (!this.map.has(k)) this.map.set(k, []);
        this.map.get(k).push(c);
      }
    }
  }
  query(x, z, r) {
    const s = this.cell;
    const out = new Set();
    for (let i = Math.floor((x - r) / s); i <= Math.floor((x + r) / s); i++) {
      for (let j = Math.floor((z - r) / s); j <= Math.floor((z + r) / s); j++) {
        const list = this.map.get(this.key(i, j));
        if (list) for (const c of list) out.add(c);
      }
    }
    return out;
  }
  // Điểm (x,y,z) có nằm trong khối nhà nào không (dùng cho camera)
  inside(x, y, z) {
    for (const c of this.query(x, z, 0.1)) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && y < c.h) return true;
    return false;
  }
}

// Đẩy hình tròn (pos: {x,z}) ra khỏi các hộp. Trả về danh sách pháp tuyến va chạm.
export function resolveCircle(pos, r, grid) {
  const normals = [];
  for (const c of grid.query(pos.x, pos.z, r + 1)) {
    const px = Math.max(c.x0, Math.min(pos.x, c.x1));
    const pz = Math.max(c.z0, Math.min(pos.z, c.z1));
    let dx = pos.x - px, dz = pos.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      dx /= d;
      dz /= d;
      pos.x += dx * (r - d);
      pos.z += dz * (r - d);
      normals.push({ x: dx, z: dz });
    } else {
      // tâm nằm trong hộp → đẩy ra cạnh gần nhất
      const opts = [
        [pos.x - c.x0, -1, 0],
        [c.x1 - pos.x, 1, 0],
        [pos.z - c.z0, 0, -1],
        [c.z1 - pos.z, 0, 1],
      ].sort((a, b) => a[0] - b[0]);
      const [pen, nx, nz] = opts[0];
      pos.x += nx * (pen + r);
      pos.z += nz * (pen + r);
      normals.push({ x: nx, z: nz });
    }
  }
  // biên bản đồ
  const lim = HALF + 3;
  if (pos.x > lim) { pos.x = lim; normals.push({ x: -1, z: 0 }); }
  if (pos.x < -lim) { pos.x = -lim; normals.push({ x: 1, z: 0 }); }
  if (pos.z > lim) { pos.z = lim; normals.push({ x: 0, z: -1 }); }
  if (pos.z < -lim) { pos.z = -lim; normals.push({ x: 0, z: 1 }); }
  return normals;
}

// Va chạm tròn – tròn (xe NPC, người đi đường). Trả về pháp tuyến nếu chạm.
export function pushCircle(pos, r, cx, cz, cr) {
  const dx = pos.x - cx, dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  const R = r + cr;
  if (d2 >= R * R) return null;
  const d = Math.sqrt(d2) || 1e-4;
  const nx = dx / d, nz = dz / d;
  pos.x += nx * (R - d);
  pos.z += nz * (R - d);
  return { x: nx, z: nz };
}
