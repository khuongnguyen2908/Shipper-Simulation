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
// pose(state, t, bob, move): idle · swing (0→1) · block · throw (0→1) · hurt. Trả group; group.userData.setItem(id) đổi món trên tay
// Tay không: 2 nắm tay thủ trước mặt; đòn move = jab (thẳng tay trái) · cross (thẳng tay phải) · hook (móc phải). Cầm đồ: over (bổ) · side (quét ngang)
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
  let item = null, bare = true;
  g.userData = {
    R, L, hold,
    setItem(id) {
      if (item) hold.remove(item);
      item = makeWeaponMesh(id);
      bare = !id || id === 'fists';
      item.traverse((o) => { o.castShadow = false; o.renderOrder = 10; });
      // cầm dựng lên chếch ra trước (chảo: mặt chảo hướng ra trước)
      item.rotation.set(-0.55, 0, 0.15);
      hold.add(item);
    },
    // t: 0..1 trong cú vung / ném; bob: lắc nhẹ theo bước đi
    pose(state, t = 0, bob = 0, move = null) {
      const ease = (x) => x * x * (3 - 2 * x);
      const b = Math.sin(bob * 2) * 0.012;
      // chỗ đứng gốc của 2 tay (toạ độ camera: x phải, y lên, -z ra trước)
      R.position.set(0.24, -0.24 + b, -0.42);
      R.rotation.set(0.15, 0.1, 0);
      L.position.set(-0.3, -0.4, -0.35);
      L.rotation.set(0, 0, 0);
      L.visible = false;
      if (bare && state !== 'throw') {
        // tay không: thủ 2 nắm tay trước mặt (hơi chụm vào giữa)
        R.position.set(0.2, -0.2 + b, -0.36);
        R.rotation.set(0.5, 0.28, 0);
        L.visible = true;
        L.position.set(-0.2, -0.19 - b, -0.4);
        L.rotation.set(0.5, -0.28, 0);
        // ra đòn: vụt ra (0–0,3) · thu về (0,45–1)
        const out = t < 0.3 ? ease(t / 0.3) : t < 0.45 ? 1 : 1 - ease((t - 0.45) / 0.55);
        if (state === 'swing' && move === 'hook') { // móc phải: vòng từ ngoài vào giữa, khuỷu gập ngang
          const k = t < 0.15 ? -ease(t / 0.15) * 0.4 : ease(Math.min(1, (t - 0.15) / 0.25)); // kéo ra ngoài lấy đà rồi quét vào
          const back = t < 0.45 ? 0 : ease((t - 0.45) / 0.55);
          const s = Math.max(-0.4, k) * (1 - back);
          R.position.set(0.2 - 0.12 * Math.min(0, s) - 0.26 * Math.max(0, s), -0.19 + b + 0.08 * Math.abs(s), -0.4 - 0.14 * Math.abs(s));
          R.rotation.set(0.5 - 0.35 * Math.abs(s), 0.28 + 1.1 * s, 1.25 * Math.abs(s));
        } else if (state === 'swing' && move === 'jab') { // thẳng tay trái
          L.position.set(-0.2 + 0.14 * out, -0.19 - b + 0.05 * out, -0.4 - 0.3 * out);
          L.rotation.set(0.5 - 0.42 * out, -0.28 + 0.2 * out, 0);
        } else if (state === 'swing') { // thẳng tay phải (cross)
          R.position.set(0.2 - 0.17 * out, -0.2 + b + 0.06 * out, -0.36 - 0.34 * out);
          R.rotation.set(0.5 - 0.42 * out, 0.28 - 0.2 * out, 0);
          L.position.z += 0.04 * out; // tay kia thu về che mặt
        } else if (state === 'block') { // 2 cẳng tay che mặt
          R.position.set(0.1, -0.13, -0.3);
          R.rotation.set(1.15, 0.45, 0);
          L.position.set(-0.1, -0.13, -0.3);
          L.rotation.set(1.15, -0.45, 0);
        } else if (state === 'hurt') { R.position.y -= 0.06; L.position.y -= 0.06; }
        return;
      }
      if (state === 'swing' && move === 'side') {
        // quét ngang từ phải qua trái
        const k = t < 0.3 ? -ease(t / 0.3) : -1 + ease(Math.min(1, (t - 0.3) / 0.3)) * 2.4; // kéo ra phải lấy đà → quét qua trái
        const back = t < 0.65 ? 0 : ease((t - 0.65) / 0.35);
        const s = k * (1 - back);
        R.rotation.set(0.25, 0.1 + s * 0.9, 1.3 * Math.min(1, Math.abs(s) * 1.5));
        R.position.set(0.24 - s * 0.16, -0.22 + b, -0.42 - Math.max(0, s) * 0.08);
      } else if (state === 'swing') {
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

// ---------- DÁNG ĐÁNH NHAU của địch / anh Đạt (hình người makePerson) ----------
// Mỗi dáng: { R / L: [x, y, z, khuỷu] góc vai (x: đưa ra trước · y: vặn vào giữa / ra ngoài · z: dang ngang) + gập khuỷu,
//             bend: cúi tới (quanh hông) · twist: vặn mình }. Số âm ở y / twist = về phía tay đó đấm tới.
// Tay "R" là tay cầm đồ (ống tuýp). Dáng thủ (đứng thủ, chạy tới): 2 nắm tay giơ trước mặt.
const GUARD = { R: [-0.75, -0.3, 0.12, -2.25], L: [-0.8, -0.35, 0.12, -2.3], bend: 0.1, twist: 0.12 };
const GUARD_HIGH = { R: [-0.95, -0.5, 0.1, -2.35], L: [-1.0, -0.5, 0.1, -2.35], bend: 0.16, twist: 0 }; // boss đỡ đòn: 2 cẳng tay che mặt
const GUARD_W = { R: [-0.95, -0.2, 0.15, -1.2], L: [-0.6, -0.3, 0.12, -2.1], bend: 0.08, twist: 0.1 }; // cầm đồ: dựng ống lên trước ngực
// đòn: [lấy đà, ra đòn] — tay nào ra đòn thì đổi tay đó, tay kia giữ thủ
const MOVE_POSE = {
  jab: [{ L: [-0.45, -0.1, 0.1, -2.3], twist: -0.15, bend: 0.12 }, { L: [-1.55, -0.12, 0.05, -0.05], twist: 0.4, bend: 0.18 }], // đấm thẳng tay trước (nhanh)
  cross: [{ R: [-0.4, -0.05, 0.12, -2.3], twist: 0.45, bend: 0.06 }, { R: [-1.55, -0.18, 0.05, -0.05], twist: -0.55, bend: 0.2 }], // đấm thẳng tay sau (mạnh)
  hook: [{ R: [0, 0.35, 1.45, -1.6], twist: 0.5, bend: 0.1 }, { R: [0, -1.05, 1.45, -1.6], twist: -0.6, bend: 0.14 }], // đấm móc ngang
  upper: [{ R: [0.25, -0.1, 0.15, -1.9], twist: 0.35, bend: 0.32 }, { R: [-1.25, -0.25, 0.1, -1.75], twist: -0.45, bend: -0.12 }], // móc lên cằm
  over: [{ R: [-2.85, -0.1, 0.15, -0.5], twist: 0.25, bend: -0.12 }, { R: [-0.85, -0.25, 0.1, -0.1], twist: -0.35, bend: 0.3 }], // bổ từ trên xuống
  side: [{ R: [-0.3, 0.7, 1.3, -0.4], twist: 0.6, bend: 0.05 }, { R: [-0.3, -1.2, 1.3, -0.4], twist: -0.7, bend: 0.12 }], // quét ngang
};
const ease = (x) => x * x * (3 - 2 * x);
const mix = (a, b, k) => a + (b - a) * k;
function mixPose(a, b, k) {
  const o = { bend: mix(a.bend, b.bend ?? a.bend, k), twist: mix(a.twist, b.twist ?? a.twist, k) };
  for (const s of ['R', 'L']) o[s] = b[s] ? a[s].map((v, i) => mix(v, b[s][i], k)) : a[s];
  return o;
}
// Thời gian 1 cú ra đòn (giây sau lúc trúng): vụt ra · giữ · thu về thủ
const HIT_IN = 0.09, HIT_HOLD = 0.22, HIT_OUT = 0.5;
// st: { stance: false | 'fists' | 'weapon', block: đang đỡ (che mặt), wind: { move, k (0..1 lấy đà) } | null, hit: { move, t (giây sau lúc ra đòn) } | null }
// Trả { bend, twist, lunge (m bước tới theo cú đấm) } — game cộng lunge vào chỗ đứng hình
export function fighterPose(parts, st) {
  if (!st.stance) return null;
  const base = st.block ? GUARD_HIGH : st.stance === 'weapon' ? GUARD_W : GUARD;
  let pose = base, lunge = 0;
  if (st.wind && MOVE_POSE[st.wind.move]) pose = mixPose(base, MOVE_POSE[st.wind.move][0], ease(Math.min(1, st.wind.k)));
  if (st.hit && MOVE_POSE[st.hit.move] && st.hit.t < HIT_OUT) {
    const [w, s] = MOVE_POSE[st.hit.move], t = st.hit.t;
    const from = mixPose(base, w, 1), to = mixPose(base, s, 1);
    if (t < HIT_IN) { pose = mixPose(from, to, ease(t / HIT_IN)); lunge = 0.28 * ease(t / HIT_IN); }
    else if (t < HIT_HOLD) { pose = to; lunge = 0.28; }
    else { const k = ease((t - HIT_HOLD) / (HIT_OUT - HIT_HOLD)); pose = mixPose(to, pose === base ? base : pose, k); lunge = 0.28 * (1 - k); }
  }
  for (const [k, sg] of [['R', 1], ['L', -1]]) {
    const [x, y, z, e] = pose[k], a = parts['arm' + k];
    a.rotation.order = 'YXZ'; // vặn quanh trục dọc SAU khi đưa tay ra trước (đấm móc quét ngang)
    a.rotation.set(x, sg * y, sg * z);
    parts['elbow' + k].rotation.x = e;
  }
  return { bend: pose.bend, twist: pose.twist, lunge };
}
