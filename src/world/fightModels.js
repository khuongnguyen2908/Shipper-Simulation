// =============================================================
// HÌNH CHO ĐÁNH NHAU (chương 6): vũ khí / đồ ném (nằm dưới đất, trên tay địch, bay khi ném) + 2 tay góc nhìn thứ 1.
// Khối cơ bản, low-poly như phần còn lại của game.
// =============================================================
import * as THREE from 'three';

const mats = new Map();
const mat = (color, opts = {}) => {
  const k = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, flatShading: true, ...opts }));
  return mats.get(k);
};
function part(g, geo, color, x, y, z, opts) {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

// Hình 1 món (trục dài theo +y, gốc ở chỗ cầm tay). Dùng cho đồ dưới đất (nằm ngang), trên tay, bay khi ném
export function makeWeaponMesh(id) {
  const g = new THREE.Group();
  if (id === 'wood') {
    part(g, new THREE.BoxGeometry(0.09, 0.95, 0.045), 0xa87443, 0, 0.38, 0);
    part(g, new THREE.BoxGeometry(0.092, 0.04, 0.047), 0x7d5330, 0, 0.62, 0); // vết nứt sẫm
  } else if (id === 'bat') {
    part(g, new THREE.CylinderGeometry(0.042, 0.018, 0.82, 8), 0xd9b77e, 0, 0.36, 0);
    part(g, new THREE.CylinderGeometry(0.021, 0.021, 0.22, 8), 0x222222, 0, -0.02, 0); // quấn băng cán
    part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), 0x222222, 0, -0.14, 0);
  } else if (id === 'pan') {
    part(g, new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), 0x2b2b2b, 0, 0.1, 0, { metalness: 0.5 }); // cán
    const pan = part(g, new THREE.CylinderGeometry(0.16, 0.13, 0.05, 14), 0x34373b, 0, 0.4, 0, { metalness: 0.6, roughness: 0.4 });
    pan.rotation.x = Math.PI / 2;
  } else if (id === 'brick') {
    part(g, new THREE.BoxGeometry(0.1, 0.2, 0.065), 0xb5532f, 0, 0.05, 0);
    for (const y of [0, 0.1]) part(g, new THREE.CylinderGeometry(0.015, 0.015, 0.067, 6), 0x7a3218, 0, y, 0).rotation.x = Math.PI / 2; // lỗ gạch
  } else if (id === 'buoy') {
    const ring = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const seg = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 6, 4, Math.PI / 4), mat(i % 2 ? 0xffffff : 0xe8541a));
      seg.rotation.z = (i * Math.PI) / 4;
      ring.add(seg);
    }
    ring.position.y = 0.24;
    g.add(ring);
  } else if (id === 'pipe') {
    part(g, new THREE.CylinderGeometry(0.026, 0.026, 0.95, 8), 0x8a8f94, 0, 0.36, 0, { metalness: 0.6, roughness: 0.4 });
  } else { // tay không / lạ: không có gì
    return g;
  }
  return g;
}

// Đồ nằm dưới đất chờ nhặt: nằm nghiêng + vòng sáng mờ dưới chân cho dễ thấy
export function makeLootMesh(id) {
  const g = new THREE.Group(), m = makeWeaponMesh(id);
  m.rotation.z = Math.PI / 2;
  m.position.set(id === 'buoy' ? 0 : -0.3, id === 'buoy' ? 0.02 : 0.05, 0);
  if (id === 'buoy') m.rotation.set(Math.PI / 2, 0, 0);
  g.add(m);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 18), new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.22, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  g.add(glow);
  g.userData.glow = glow;
  return g;
}

// 2 tay góc nhìn thứ 1 (gắn vào camera): tay phải cầm đồ, tay trái thò ra khi đỡ / ném.
// pose(state, t): idle · swing (0→1) · block · throw (0→1) · hurt. Trả group; group.userData.setItem(id) đổi món trên tay
export function makeViewArms(skin = 0xd9a066, sleeve = 0x2d3436) {
  const g = new THREE.Group();
  const arm = (side) => {
    const a = new THREE.Group();
    const along = (geo) => geo.rotateX(Math.PI / 2); // trục dài dọc theo cánh tay (ra trước)
    part(a, along(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 8)), sleeve, 0, 0, 0.14); // ống tay áo
    part(a, along(new THREE.CylinderGeometry(0.032, 0.038, 0.14, 8)), skin, 0, 0, -0.12); // cổ tay
    part(a, new THREE.SphereGeometry(0.048, 8, 6).scale(1, 0.85, 1.1), skin, 0, -0.004, -0.2); // nắm tay
    a.userData.side = side;
    return a;
  };
  const R = arm(1), L = arm(-1), hold = new THREE.Group();
  hold.position.set(0, 0, -0.2);
  R.add(hold);
  g.add(R, L);
  for (const m of [...R.children, ...L.children]) { m.castShadow = false; m.renderOrder = 10; }
  let item = null;
  g.userData = {
    R, L, hold,
    setItem(id) {
      if (item) hold.remove(item);
      item = makeWeaponMesh(id);
      item.traverse((o) => { o.castShadow = false; o.renderOrder = 10; });
      // cầm dựng lên chếch ra trước (chảo: mặt chảo hướng ra trước)
      item.rotation.set(-0.55, 0, 0.15);
      hold.add(item);
    },
    // t: 0..1 trong cú vung / ném; bob: lắc nhẹ theo bước đi
    pose(state, t = 0, bob = 0) {
      const ease = (x) => x * x * (3 - 2 * x);
      // chỗ đứng gốc của 2 tay (toạ độ camera: x phải, y lên, -z ra trước)
      R.position.set(0.24, -0.24 + Math.sin(bob * 2) * 0.012, -0.42);
      R.rotation.set(0.15, 0.1, 0);
      L.position.set(-0.3, -0.4, -0.35);
      L.rotation.set(0, 0, 0);
      L.visible = false;
      if (state === 'swing') {
        // giơ lên sau vai → bổ chéo xuống trước mặt
        const up = t < 0.35 ? ease(t / 0.35) : 1 - ease((t - 0.35) / 0.65);
        const down = t < 0.35 ? 0 : ease(Math.min(1, (t - 0.35) / 0.3));
        R.rotation.set(0.15 + up * 1.3 - down * 0.9, 0.1 + down * 0.6, -down * 0.5);
        R.position.set(0.24 - down * 0.18, -0.24 + up * 0.12 - down * 0.06, -0.42 - down * 0.08);
      } else if (state === 'block') {
        // đưa đồ ngang trước mặt, tay trái đỡ
        R.position.set(0.12, -0.16, -0.4);
        R.rotation.set(0.25, 0.9, 1.35);
        L.visible = true;
        L.position.set(-0.16, -0.2, -0.4);
        L.rotation.set(0.3, -0.4, 0);
      } else if (state === 'throw') {
        const back = t < 0.4 ? ease(t / 0.4) : 1 - ease((t - 0.4) / 0.6);
        R.rotation.set(0.15 + back * 1.6, 0.1, 0);
        R.position.set(0.26, -0.24 + back * 0.18, -0.42 + back * 0.12);
        L.visible = true;
        L.position.set(-0.22, -0.26, -0.45);
      } else if (state === 'hurt') {
        R.position.y -= 0.06;
        R.rotation.x -= 0.2;
      }
    },
  };
  g.userData.pose('idle');
  return g;
}
