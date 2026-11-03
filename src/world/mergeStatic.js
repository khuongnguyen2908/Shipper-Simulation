// =============================================================
// GỘP ĐỒ ĐỨNG YÊN — mỗi mảnh nhà / bảng / xe đậu… là 1 lần ra lệnh vẽ; vài trăm lần mỗi khung làm CPU nghẽn (card đồ họa còn rảnh).
// Gộp các mảnh dùng CHUNG một chất liệu, nằm trong cùng một ô bản đồ (CHUNK mét) thành 1 mảnh → ít lần vẽ hẳn.
// Chỉ gộp mảnh chắc chắn đứng yên và không bị bật / tắt riêng: bỏ qua người, đồ cử động (moving), mảnh đang ẩn, nhóm xe đậu
// (ẩn / hiện theo khoảng cách), mảnh có con, mảnh có dữ liệu riêng (userData — code khác có thể cần tới nó).
// Chỉ gọi trong game (game.js); công cụ Xây dựng của ?editor dựng thành phố riêng, vẫn bấm chọn từng nhà được.
// Chỉ ảnh hưởng cách vẽ trên từng máy (chơi nhiều người không liên quan).
// =============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CHUNK = 104; // m — 2 khối phố: đủ nhỏ để phần ngoài tầm nhìn vẫn được bỏ qua khi vẽ, đủ lớn để gộp được nhiều

// skip: các vật cử động (cùng mọi thứ bên trong) → không gộp. Trả về { before, after } số mảnh.
export function mergeStatic(scene, skip) {
  scene.updateMatrixWorld(true);
  const groups = new Map();
  let before = 0;
  const walk = (o) => {
    if (skip.has(o) || !o.visible) return;
    if (o.userData?.parts || o.userData?.lodMake || o.userData?.center) return; // người (tay chân cử động, đổi chi tiết theo xa gần) · ô xe đậu
    if (o.isMesh && ok(o)) {
      before++;
      const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      const key = [Math.floor(p.x / CHUNK), Math.floor(p.z / CHUNK), o.material.uuid, o.renderOrder, o.castShadow, o.receiveShadow, attrSig(o.geometry)].join('|');
      let gr = groups.get(key);
      if (!gr) groups.set(key, (gr = []));
      gr.push(o);
      return;
    }
    for (const c of [...o.children]) walk(c);
  };
  for (const c of [...scene.children]) walk(c);

  let after = 0;
  const m4 = new THREE.Matrix4();
  for (const list of groups.values()) {
    if (list.length < 2) { after += list.length; continue; }
    const geos = list.map((o) => bake(o.geometry, m4.copy(o.matrixWorld)));
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) { after += list.length; continue; }
    const src = list[0];
    const m = new THREE.Mesh(merged, src.material);
    m.castShadow = src.castShadow;
    m.receiveShadow = src.receiveShadow;
    m.renderOrder = src.renderOrder;
    m.name = 'gộp';
    scene.add(m);
    for (const o of list) o.parent.remove(o);
    after++;
  }
  return { before, after };
}

// mảnh gộp được: mảnh thường (không phải mảnh nhân bản / có xương / nhiều chất liệu), không có con, không có dữ liệu riêng
function ok(o) {
  return !o.isInstancedMesh && !o.isSkinnedMesh && !o.isBatchedMesh && !Array.isArray(o.material) && o.frustumCulled && !o.children.length
    && !Object.keys(o.userData || {}).length && o.geometry?.isBufferGeometry && !Object.keys(o.geometry.morphAttributes || {}).length
    && o.geometry.attributes.position;
}

// chữ ký thuộc tính hình (gộp được khi giống hệt: tên, số thành phần, kiểu số, có / không chỉ mục)
function attrSig(g) {
  return Object.entries(g.attributes).map(([n, a]) => `${n}:${a.itemSize}:${a.array.constructor.name}:${a.normalized}`).sort().join(',') + (g.index ? '|i' : '|n');
}

// chép hình, đặt sẵn vào đúng chỗ trong thế giới; hình bị lật (cỡ âm) thì đảo chiều tam giác cho khỏi mất mặt
function bake(geo, m) {
  const g = geo.clone();
  g.applyMatrix4(m);
  if (m.determinant() < 0) {
    if (g.index) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    } else {
      for (const a of Object.values(g.attributes)) {
        const s = a.itemSize, arr = a.array;
        for (let t = 0; t < a.count; t += 3) for (let k = 0; k < s; k++) { const x = arr[(t + 1) * s + k]; arr[(t + 1) * s + k] = arr[(t + 2) * s + k]; arr[(t + 2) * s + k] = x; }
      }
    }
  }
  return g;
}
