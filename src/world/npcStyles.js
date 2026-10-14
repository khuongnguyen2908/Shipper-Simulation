// HÌNH RIÊNG CỦA NPC theo vai / tuổi (người đi đường) và theo loại khách (khách xe ôm, khách nhận hàng):
// quần áo (ghi đè lên randomPersonOpts), đồ đi kèm (gậy, chó, ba lô, vali…) và tư thế (lưng còng, ngồi bệt, lắc lư…).
// Vai lấy từ thẻ trên tên người đi đường (vi.json → ped.names, vd "[anxin] Ông lão ăn xin") và tuổi đoán theo tên
// (sim/people.js personOf); loại khách lấy từ apps.json → riderTypes. Chỉ để nhìn — mỗi máy tự vẽ (chơi nhiều người không cần gửi).
import * as THREE from 'three';
import { makeDog, applyPose } from './models.js';

const MATS = new Map();
const mat = (c) => {
  if (!MATS.has(c)) MATS.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true }));
  return MATS.get(c);
};
const GEO = new Map();
const boxG = (w, h, d) => {
  const k = `b${w},${h},${d}`;
  if (!GEO.has(k)) GEO.set(k, new THREE.BoxGeometry(w, h, d));
  return GEO.get(k);
};
function box(parent, w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(boxG(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function cyl(parent, r, h, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
// đồ cầm ở bàn tay (con của khuỷu tay): xoay ngược góc tay để đồ vẫn thẳng đứng
function inHand(p, side, total) {
  const g = new THREE.Group();
  g.position.y = -0.31;
  g.rotation.x = -total;
  p['elbow' + side].add(g);
  return g;
}

// ---------- đồ đi kèm ----------
export const PROPS = {
  backpack(p, big, color) {
    const b = p.body;
    if (big) {
      box(b, 0.4, 0.6, 0.26, color, 0, 1.12, -0.27);
      box(b, 0.42, 0.1, 0.12, 0x8a8f96, 0, 1.47, -0.27); // túi ngủ cuộn trên đỉnh
    } else box(b, 0.32, 0.4, 0.16, color, 0, 1.15, -0.21);
  },
  schoolBag(p, color) {
    box(p.body, 0.3, 0.32, 0.14, color, 0, 1.12, -0.2);
  },
  redScarf(p) {
    box(p.body, 0.16, 0.05, 0.03, 0xd62d20, 0, 1.38, 0.12);
    box(p.body, 0.05, 0.14, 0.02, 0xd62d20, 0.02, 1.3, 0.135, 0, 0, 0.25);
  },
  // hình xăm kín tay: lớp vỏ mỏng ôm cánh tay (bắp tay dưới tay áo ngắn + cẳng tay), hoa văn vẽ bằng canvas (nền trong suốt)
  tattoo(p, neck = true) {
    const m = tattooMat();
    for (const [arm, el] of [[p.armL, p.elbowL], [p.armR, p.elbowR]]) {
      // bắp tay: phần da y −0,1 → −0,29 (bán kính 0,052 → 0,047) · cẳng tay: 0 → −0,25 (0,05 → 0,043)
      const up = new THREE.Mesh(sleeveGeo(0.052 * 1.1, 0.047 * 1.1, 0.18), m);
      up.position.y = -0.195;
      arm.add(up);
      const lo = new THREE.Mesh(sleeveGeo(0.05 * 1.1, 0.043 * 1.1, 0.22), m);
      lo.position.y = -0.12;
      el.add(lo);
    }
    if (neck) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.08), m);
      n.position.set(0.066, 1.48, 0.0);
      n.rotation.y = Math.PI / 2;
      p.body.add(n);
    }
  },
  // nón lưỡi trai: dir 'front' | 'back' (đội ngược) | 'side' (đội lệch) — đội trên đầu (thân y 1,6)
  cap(p, dir = 'back', color = 0x111111, logo = 0xffffff) {
    const g = new THREE.Group();
    g.position.set(0, 1.6, 0);
    g.rotation.y = dir === 'back' ? Math.PI : dir === 'side' ? 1.25 : 0;
    const crown = new THREE.Mesh(CAP_CROWN, mat(color));
    crown.position.y = 0.065; // vành nón ngang trán, không che mắt (mắt ở +0,025)
    crown.castShadow = true;
    g.add(crown);
    box(g, 0.15, 0.014, 0.12, color, 0, 0.072, 0.17, -0.12); // lưỡi trai
    box(g, 0.07, 0.04, 0.01, logo, 0, 0.12, 0.112, -0.45); // logo trước nón
    p.body.add(g);
    return g;
  },
  // áo sơ mi caro / sọc mặc ngoài, mở cúc (lộ áo thun bên trong), tay ngắn: vỏ ôm thân + 2 tay áo, hoa văn vẽ canvas
  plaid(p, pattern = 0, female = false) {
    const m = plaidMat(pattern);
    const prof = female
      ? [[0.15, 0], [0.142, 0.1], [0.163, 0.24], [0.178, 0.32], [0.172, 0.4], [0.138, 0.46], [0.08, 0.5]]
      : [[0.15, 0], [0.16, 0.08], [0.178, 0.22], [0.192, 0.34], [0.19, 0.4], [0.15, 0.46], [0.08, 0.5]];
    const k = `${female}`;
    if (!PLAID_GEO.has(k)) {
      // giống thân người (models torsoGeo) nhưng to hơn 7%, 16 cạnh, chừa khe trước ngực (áo mở)
      const pts = prof.map(([r, y], i) => new THREE.Vector2(i === prof.length - 1 ? r : r * 1.07, y - 0.02));
      PLAID_GEO.set(k, new THREE.LatheGeometry(pts, 16, 0.42, Math.PI * 2 - 0.84).scale(1, 1, 0.7));
    }
    const shell = new THREE.Mesh(PLAID_GEO.get(k), m);
    shell.position.y = 0.96;
    shell.castShadow = true;
    p.body.add(shell);
    for (const arm of [p.armL, p.armR]) {
      const sl = new THREE.Mesh(sleeveGeo(0.074, 0.07, 0.17), m);
      sl.position.y = -0.055;
      arm.add(sl);
    }
    return shell;
  },
  // to con: vai + ngực rộng hơn, bắp tay / cẳng tay to hơn (chân giữ nguyên)
  buff(p, k = 1) {
    p.body.scale.set(1 + 0.13 * k, 1, 1 + 0.1 * k);
    for (const a of [p.armL, p.armR]) a.scale.set(1 + 0.3 * k, 1, 1 + 0.3 * k);
  },
  chain(p) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.013, 5, 14), mat(0xd4af37));
    m.position.set(0, 1.42, 0.03);
    m.rotation.x = 1.15;
    p.body.add(m);
  },
  cape(p) {
    box(p.body, 0.44, 0.95, 0.03, 0xd62d20, 0, 0.98, -0.17, 0.12);
    box(p.body, 0.2, 0.045, 0.02, 0xd62d20, 0, 1.6, 0.115); // dải bịt mắt siêu nhân
  },
  tie(p) {
    box(p.body, 0.05, 0.3, 0.012, 0x1d5fa8, 0, 1.24, 0.135);
  },
  shoulderBag(p) {
    box(p.body, 0.22, 0.18, 0.08, 0x6b4a2b, -0.22, 0.95, 0.05);
    box(p.body, 0.025, 0.72, 0.02, 0x4a3320, 0, 1.2, 0.13, 0, 0, 0.62);
  },
  tickets(p, total) {
    box(inHand(p, 'L', total), 0.1, 0.02, 0.15, 0xf6d2e0, 0, 0, 0.04);
  },
  camera(p, total) {
    const h = inHand(p, 'R', total);
    box(h, 0.12, 0.08, 0.06, 0x1b1b1b, 0, 0, 0.05);
    box(h, 0.05, 0.05, 0.05, 0x333333, 0, 0, 0.1);
  },
  cane(p, total) {
    box(inHand(p, 'R', total), 0.026, 0.86, 0.026, 0x6b4a2b, 0, -0.42, 0.02);
  },
  briefcase(p, total) {
    box(inHand(p, 'R', total), 0.08, 0.26, 0.36, 0x5a3a22, 0, -0.14, 0);
  },
  bottle(p, total) {
    cyl(inHand(p, 'R', total), 0.032, 0.2, 0x2e7d32, 0, -0.05, 0.03);
  },
  // vali đứng cạnh chân, tay trái nắm cần kéo
  suitcase(g, color) {
    const s = new THREE.Group();
    box(s, 0.36, 0.5, 0.22, color, 0, 0.29, 0);
    box(s, 0.02, 0.26, 0.02, 0x555555, -0.08, 0.66, 0); // cần kéo: đỉnh ngang tầm bàn tay buông (~0,78 m)
    box(s, 0.02, 0.26, 0.02, 0x555555, 0.08, 0.66, 0);
    box(s, 0.18, 0.025, 0.025, 0x333333, 0, 0.78, 0);
    s.position.set(-0.32, 0, 0.04);
    s.rotation.y = Math.PI / 2; // mặt hẹp quay vào chân, khỏi lẹm vào chân
    g.add(s);
    return s;
  },
  can(g) {
    cyl(g, 0.055, 0.11, 0x9aa0a6, 0.32, 0.06, 0.62); // lon xin tiền đặt trước mặt, cạnh chân
  },
  // con chó dắt theo: đi bên phải hơi lên trước, dây xích từ tay phải tới cổ chó
  dog(g, p, color) {
    const d = makeDog(color);
    d.scale.setScalar(0.72);
    d.position.set(0.5, 0, 0.55);
    g.add(d);
    const a = new THREE.Vector3(0.27, 0.86, 0.32), b = new THREE.Vector3(0.5, 0.5, 0.86); // tay → cổ chó
    const dir = b.clone().sub(a), len = dir.length();
    const leash = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 4), mat(0xd62d20));
    leash.position.copy(a).add(b).multiplyScalar(0.5);
    leash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.add(leash);
    return d;
  },
};

// Hoa văn xăm (vẽ 1 lần, dùng chung): rồng / lửa uốn lượn mực xanh đen, vài bông hồng đỏ; nền trong suốt
let TATTOO = null;
function tattooMat() {
  if (TATTOO) return TATTOO;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // ngẫu nhiên cố định → mọi máy giống nhau
  x.lineCap = x.lineJoin = 'round';
  // các nét lửa / vảy rồng chạy dọc tay
  // mảng mực lớn (thân rồng / mây) rồi chồng nét lửa lên — xăm kín, chừa ít da
  for (let k = 0; k < 10; k++) {
    x.fillStyle = r() < 0.6 ? '#13232e' : '#1f3b4d';
    x.beginPath();
    x.ellipse(r() * 128, r() * 128, 10 + r() * 16, 6 + r() * 10, r() * 3, 0, Math.PI * 2);
    x.fill();
  }
  for (let k = 0; k < 30; k++) {
    const x0 = r() * 128, y0 = r() * 140;
    x.strokeStyle = r() < 0.7 ? '#13232e' : '#1f3b4d';
    x.lineWidth = 6 + r() * 9;
    x.beginPath();
    x.moveTo(x0, y0);
    x.bezierCurveTo(x0 + (r() - 0.5) * 70, y0 - 20 - r() * 30, x0 + (r() - 0.5) * 70, y0 - 40 - r() * 30, x0 + (r() - 0.5) * 40, y0 - 70);
    x.stroke();
  }
  // hoa hồng đỏ: vòng xoắn
  for (let k = 0; k < 3; k++) {
    const cx = 15 + r() * 98, cy = 15 + r() * 98;
    x.fillStyle = '#8b1e1e';
    x.beginPath();
    x.arc(cx, cy, 9, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#13232e';
    x.lineWidth = 2;
    x.beginPath();
    for (let t = 0; t < 12; t += 0.3) x.lineTo(cx + Math.cos(t) * t * 0.75, cy + Math.sin(t) * t * 0.75);
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  TATTOO = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.8 });
  return TATTOO;
}
// Vải caro / sọc (vẽ 1 lần mỗi kiểu): pattern 0 đỏ-đen · 1 xanh-trắng · 2 xanh lá-đen · 3 sọc dọc trắng-đen · 4 vàng-đen
const PLAID = [
  ['#c0262d', '#1b1b1b', '#e8e8e8'],
  ['#2f5fa8', '#f2f2f2', '#173a6e'],
  ['#2e6b3a', '#141414', '#c9d36a'],
  null,
  ['#e2b52a', '#1b1b1b', '#ffffff'],
];
const PLAID_MATS = new Map(), PLAID_GEO = new Map();
const CAP_CROWN = new THREE.SphereGeometry(0.128, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.98, 0.85, 1.05);
function plaidMat(pattern) {
  if (PLAID_MATS.has(pattern)) return PLAID_MATS.get(pattern);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const P = PLAID[pattern];
  if (!P) {
    // sọc dọc
    x.fillStyle = '#f2f2f2';
    x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#1b1b1b';
    for (let i = 0; i < 64; i += 16) x.fillRect(i, 0, 6, 64);
  } else {
    const [base, dark, line] = P;
    x.fillStyle = base;
    x.fillRect(0, 0, 64, 64);
    x.globalAlpha = 0.55;
    x.fillStyle = dark;
    for (let i = 0; i < 64; i += 32) {
      x.fillRect(i, 0, 14, 64); // sọc dọc đậm
      x.fillRect(0, i, 64, 14); // sọc ngang đậm (chỗ giao nhau đậm hơn → ra ô caro)
    }
    x.globalAlpha = 1;
    x.fillStyle = line;
    for (let i = 22; i < 64; i += 32) {
      x.fillRect(i, 0, 2, 64);
      x.fillRect(0, i, 64, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.magFilter = THREE.NearestFilter;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
  PLAID_MATS.set(pattern, m);
  return m;
}
const SLEEVE = new Map();
const sleeveGeo = (r0, r1, h) => {
  const k = `${r0},${r1},${h}`;
  if (!SLEEVE.has(k)) SLEEVE.set(k, new THREE.CylinderGeometry(r0, r1, h, 10, 1, true));
  return SLEEVE.get(k);
};

const pick = (rng, arr) => arr[Math.floor(rng.next() * arr.length)];

// ======================== NGƯỜI ĐI ĐƯỜNG ========================
// who: personOf (vai, tuổi, giới tính). Trả về { look (ghi đè quần áo), dress(mesh) gắn đồ + tư thế, speedMul, still (ngồi yên 1 chỗ) }
export function pedStyle(who, rng) {
  const f = who.gender === 'f';
  const role = who.role, age = who.age;
  if (role === 'anxin') {
    return {
      look: { shirt: pick(rng, [0x7f7f73, 0x6b5e4a, 0x8a8170]), pants: 0x3d3a33, hat: 'nonla', hair: 0x9a9a9a },
      still: true,
      dress(m) {
        const p = m.userData.parts;
        p.pose = { ground: true, armR: [-0.9, -0.6], armL: [-0.3, -0.6] }; // ngồi bệt, chìa tay xin
        PROPS.can(m);
        applyPose(p);
      },
    };
  }
  if (role === 'anhdai' || role === 'chidai') {
    return {
      look: {
        shirt: f ? pick(rng, [0xff4f9a, 0xffffff, 0x111111]) : pick(rng, [0xf4f4f4, 0x111111, 0xd62d20]),
        pants: 0x1b1b1b, sleeves: 'short', face: 'glasses', faceColor: 0x0d0d0d,
        hair: f ? 0xba7517 : 0x1b1b1b, hat: null,
      },
      speedMul: 0.8,
      dress(m) {
        const p = m.userData.parts;
        p.pose = { swagger: true };
        if (!f) PROPS.buff(p); // anh đại to con, chị đại giữ dáng thon
        PROPS.tattoo(p, !f);
        PROPS.chain(p);
      },
    };
  }
  if (role === 'veso') {
    return {
      look: { shirt: pick(rng, [0x6f8fc9, 0x9c5f9a, 0x4f8f6b, 0xd88a4a]), pants: 0x3d3a33, hat: 'nonla' }, // áo màu, không trùng màu da
      speedMul: 0.7,
      dress(m) {
        const p = m.userData.parts;
        p.pose = { armL: [-0.7, -0.9] }; // tay trái cầm xấp vé số đưa ra trước
        PROPS.shoulderBag(p);
        PROPS.tickets(p, -1.6);
      },
    };
  }
  if (role === 'khung') {
    return {
      look: { shirt: 0x1d5fa8, pants: 0x1d5fa8, hat: null },
      dress(m) {
        const p = m.userData.parts;
        p.pose = { lift: { arm: 'R', to: [-2.9, 0], every: 7, hold: 2.5 } }; // thỉnh thoảng giơ tay "bay" kiểu siêu nhân
        PROPS.cape(p);
      },
    };
  }
  if (role === 'ngoaiquoc') {
    return {
      look: { skin: pick(rng, [0xffe3cf, 0xf6d3bd, 0x8d5a3b]), hair: pick(rng, [0xe8d38a, 0xc9a050, 0x7b4a2b, 0xb5651d]), shirt: pick(rng, [0x5dcaa5, 0xffffff, 0xf4c095, 0x85b7eb]), pants: pick(rng, [0xba7517, 0x5f5e5a, 0x2c3e50]), sleeves: 'short', shorts: !f && rng.chance(0.5), hat: null },
      dress(m) {
        const p = m.userData.parts;
        p.pose = { lift: { arm: 'R', to: [-1.4, -1.5], every: 9, hold: 2.5 } }; // thỉnh thoảng giơ máy ảnh chụp phố
        PROPS.backpack(p, true, pick(rng, [0x3b6d11, 0xd85a30, 0x185fa5]));
        PROPS.camera(p, -0.15 - 0.4);
      },
    };
  }
  if (role === 'sinhvien') {
    return {
      look: { shirt: pick(rng, [0xffffff, 0x85b7eb, 0xafa9ec]), pants: pick(rng, [0x2c3e50, 0x1c2833]), face: rng.chance(0.4) ? 'glasses' : null, faceColor: 0x222222, hat: null },
      dress(m) {
        PROPS.backpack(m.userData.parts, false, pick(rng, [0x534ab7, 0x2c2c2a, 0x185fa5]));
      },
    };
  }
  if (role === 'dacho') {
    return {
      speedMul: 0.75,
      dress(m) {
        const p = m.userData.parts;
        p.pose = { armR: [-0.45, -0.5] };
        p.pose.pet = PROPS.dog(m, p, pick(rng, [0xd9a15b, 0xc2873f, 0xe2b878]));
      },
    };
  }
  if (age === 'kid') {
    return {
      look: { shirt: 0xf6f6f6, pants: 0x1c2e5a, skirt: f && rng.chance(0.5), hat: null },
      speedMul: 1.1,
      dress(m) {
        const p = m.userData.parts;
        PROPS.schoolBag(p, pick(rng, [0xd62d20, 0x185fa5, 0xe67e22]));
        PROPS.redScarf(p);
      },
    };
  }
  if (age === 'elder') {
    const cane = rng.chance(0.6);
    return {
      look: f
        ? { shirt: pick(rng, [0xafa9ec, 0x8e6b4f, 0xc9b8a0, 0x5f6b76]), pants: 0x1b1b1b, hair: 0xc8c8c8, hairStyle: 'bun', skirt: false, hat: rng.chance(0.4) ? 'nonla' : null }
        : { shirt: pick(rng, [0xf4f1ea, 0xe9dcc0, 0x9aa7b0]), pants: pick(rng, [0x3d3a33, 0x5f5e5a]), hair: 0xc8c8c8, hat: rng.chance(0.5) ? 'nonla' : null },
      speedMul: 0.55,
      dress(m) {
        const p = m.userData.parts;
        p.pose = { hunch: 0.26, ...(cane ? { armR: [-0.35, -0.25] } : {}) };
        if (cane) PROPS.cane(p, -0.6);
      },
    };
  }
  return null;
}

// ======================== KHÁCH (xe ôm / nhận hàng) ========================
// rider: mã loại khách (apps.json riderTypes) · ride: đang ngồi sau xe hay đứng chờ.
// Khách lừa đảo cố ý KHÔNG có hình riêng (mặc đồ thường để khó nhận ra).
export function riderStyle(rider, who, rng) {
  const f = who?.gender === 'f';
  if (rider === 'drunk') {
    return {
      look: { skin: pick(rng, [0xf0a58a, 0xe8957a]), shirt: pick(rng, [0xd62d20, 0x1d5fa8, 0xf4f4f4]) },
      dress(m, ride) {
        const p = m.userData.parts;
        p.pose = ride ? { slump: true, sway: 0.16 } : { sway: 0.12, armR: [-0.5, -1.2] }; // chờ: lắc lư, cầm chai bia · ngồi: gục, nghiêng ngả
        if (!ride) PROPS.bottle(p, -1.7);
      },
      wave: false,
    };
  }
  if (rider === 'vali') {
    const color = pick(rng, [0x7f77dd, 0xd85a30, 0x1d9e75, 0xe8b931]); // màu tươi, dễ thấy trên xe
    return {
      suitcase: color,
      dress(m, ride) {
        const p = m.userData.parts;
        if (!ride) {
          p.pose = { armL: [-0.1, -0.1] };
          PROPS.suitcase(m, color);
        }
      },
      wave: true,
    };
  }
  if (rider === 'nuocNgoai') {
    return {
      look: { skin: pick(rng, [0xffe3cf, 0xf6d3bd]), hair: pick(rng, [0xe8d38a, 0xc9a050, 0x7b4a2b]) },
      dress(m, ride) {
        const p = m.userData.parts;
        PROPS.backpack(p, !ride, 0x3b6d11);
        if (!ride) {
          p.pose = { lift: { arm: 'L', to: [-1.4, -1.5], every: 8, hold: 2.5, rest: [0, -0.15] } };
          PROPS.camera(p, -0.55);
        }
      },
      wave: true,
    };
  }
  if (rider === 'hocSinh') {
    return {
      look: { shirt: 0xf6f6f6, pants: 0x1c2e5a, skirt: false },
      dress(m) {
        const p = m.userData.parts;
        PROPS.schoolBag(p, pick(rng, [0xd62d20, 0x185fa5]));
        PROPS.redScarf(p);
      },
      wave: true,
    };
  }
  if (rider === 'hurry') {
    return {
      look: { shirt: 0xf4f4f4, pants: 0x1c2833, sleeves: 'long' },
      dress(m, ride) {
        const p = m.userData.parts;
        if (!f) PROPS.tie(p);
        if (!ride) {
          p.pose = { armR: [-0.1, -0.15], lift: { arm: 'L', to: [-1.2, -1.9], every: 4, hold: 1.2, rest: [0, -0.15] } }; // cầm cặp, nhìn đồng hồ liên tục
          PROPS.briefcase(p, -0.25);
        }
      },
      wave: false,
    };
  }
  if (rider === 'sinhVien') {
    return { dress(m) { PROPS.backpack(m.userData.parts, false, 0x534ab7); }, wave: true };
  }
  return null;
}

// Vali đặt trên xe khi chở khách vali: luôn kẹp giữa người lái và khách, đáy vali đặt trên mặt yên từng kiểu xe
const SEAT_Y = { underbone: 0.94, scooter: 0.95, cub: 0.9, sport: 0.95, bicycle: 0.86 };
export function suitcaseOnBike(bikeMesh, model, color) {
  const s = new THREE.Group();
  box(s, 0.34, 0.42, 0.2, color, 0, 0.21, 0);
  box(s, 0.16, 0.025, 0.025, 0x333333, 0, 0.44, 0); // quai xách
  s.position.set(0, SEAT_Y[model] ?? 0.94, -0.35);
  bikeMesh.add(s);
  return s;
}
