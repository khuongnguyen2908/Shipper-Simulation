// TRỤ ĐÈN GIAO THÔNG (hình 3D): mỗi ngã tư có đèn (sim/lights.js lightMap) dựng 1 trụ cho mỗi hướng xe tới —
// đặt ở góc vỉa hè bên phải trước vạch, mặt đèn quay về phía xe đang tới (đỏ trên, vàng giữa, xanh dưới).
// Ngã tư có camera phạt nguội: thêm hộp camera trên đỉnh trụ đầu tiên.
// Trụ + vỏ đèn gộp 1 lần vẽ (kit); bóng đèn là 1 InstancedMesh đổi màu từng khung hình (sáng / tối theo pha).
import * as THREE from 'three';
import { CITY, roadPos, neighbors } from '../sim/cityLayout.js';
import { lightColor } from '../sim/lights.js';
import { makeKit, mergeKits } from './placeBuildings.js';

const SW_H = 0.15;
const LAMP = { r: [1, 0.12, 0.1], y: [1, 0.75, 0.1], g: [0.15, 1, 0.35] };
const DIM = 0.12; // bóng đang tắt: tối hẳn

// lmap: Map "i,j" → { i, j, cam } · grid: lưới va chạm (trụ đèn chặn người / xe)
export function buildTrafficLights(scene, lmap, grid = null) {
  const kit = makeKit();
  const heads = []; // { key, din, lamps: [chỉ số instance r, y, g] }
  const lampPos = []; // [x, y, z]
  const C = CITY.ROAD / 2 + 0.7; // góc vỉa hè (tính từ tâm ngã tư)
  for (const [key, n] of lmap) {
    const nx = roadPos(n.i), nz = roadPos(n.j);
    const nb = neighbors(n.i, n.j);
    let first = true;
    for (const din of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // có đường dẫn tới từ phía −din (xe chạy theo din tiến vào ngã tư)
      if (!nb.some(([a, b]) => a === n.i - din[0] && b === n.j - din[1])) continue;
      const right = [-din[1], din[0]]; // bên phải của hướng chạy
      const px = nx - din[0] * C + right[0] * C, pz = nz - din[1] * C + right[1] * C;
      const ry = Math.atan2(-din[0], -din[1]); // mặt đèn quay về phía xe tới
      kit.cyl(0.07, 0.09, 3.2, px, SW_H + 1.6, pz, 0x3d4247, 'metal', 8);
      // vỏ đèn: hộp đen + tấm che nắng, đặt lệch ra phía mặt đường một chút
      const fx = -din[0], fz = -din[1]; // hướng mặt đèn (về phía xe tới)
      const hx = px + fx * 0.12, hz = pz + fz * 0.12;
      kit.box(0.34, 0.95, 0.26, hx, SW_H + 2.75, hz, 0x1b1d20, '', [0, ry, 0]);
      kit.box(0.4, 0.05, 0.3, hx + fx * 0.05, SW_H + 3.25, hz + fz * 0.05, 0x1b1d20, '', [0, ry, 0]);
      const idx = [];
      [3.05, 2.75, 2.45].forEach((y) => {
        idx.push(lampPos.length);
        lampPos.push([hx + fx * 0.14, SW_H + y, hz + fz * 0.14, ry]);
      });
      heads.push({ key, din, lamps: idx });
      if (n.cam && first) {
        // camera phạt nguội: hộp xám có ống kính, trên đỉnh trụ, nhìn vào lòng ngã tư
        const cx = px + right[0] * -0.15, cz = pz + right[1] * -0.15;
        kit.box(0.22, 0.18, 0.42, cx, SW_H + 3.42, cz, 0xd5d8dc, 'metal', [0, Math.atan2(din[0], din[1]), 0]);
        kit.box(0.12, 0.12, 0.06, cx + din[0] * 0.23, SW_H + 3.42, cz + din[1] * 0.23, 0x111111, '', [0, Math.atan2(din[0], din[1]), 0]);
      }
      first = false;
      grid?.add({ x0: px - 0.12, z0: pz - 0.12, x1: px + 0.12, z1: pz + 0.12, h: 3.3, tag: 'pole' });
    }
  }
  const group = new THREE.Group();
  if (heads.length) mergeKits([{ kit, matrix: new THREE.Matrix4() }], group);
  // bóng đèn: đĩa tròn phát sáng (không bị bóng tối làm tối), màu đổi theo pha
  const geo = new THREE.CircleGeometry(0.1, 12);
  const lamps = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, lampPos.length));
  lamps.count = lampPos.length;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  lampPos.forEach(([x, y, z, ry], k) => {
    q.setFromAxisAngle(up, ry);
    lamps.setMatrixAt(k, m4.compose(v.set(x, y, z), q, one));
    lamps.setColorAt(k, new THREE.Color(0, 0, 0));
  });
  lamps.instanceMatrix.needsUpdate = true;
  group.add(lamps);
  scene.add(group);
  const col = new THREE.Color();
  return {
    count: lmap.size,
    // t: giây (đồng hồ đèn của game) — bật đúng bóng theo màu đèn hướng đó
    update(t) {
      for (const h of heads) {
        const c = lightColor(h.key, h.din, t);
        ['r', 'y', 'g'].forEach((name, k) => {
          const [r, g, b] = LAMP[name];
          const s = name === c ? 1 : DIM;
          lamps.setColorAt(h.lamps[k], col.setRGB(r * s, g * s, b * s));
        });
      }
      if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
    },
  };
}
