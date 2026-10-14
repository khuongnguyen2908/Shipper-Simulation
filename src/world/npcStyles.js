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

// Mặt trước / sau ngực của thân người (world/person.js: thân tiện ép dẹt, nam ngực dày hơn nữ) — để đồ gắn thêm áp sát người
const chestZ = (p) => (p.female ? 0.107 : 0.118);
// 2 quai đeo vắt qua vai (balo, cặp)
function straps(p, color) {
  const z = chestZ(p) + 0.006;
  for (const s of [-1, 1]) {
    box(p.body, 0.035, 0.24, 0.012, color, s * 0.085, 1.3, z, 0.12);
    box(p.body, 0.035, 0.012, 0.14, color, s * 0.09, 1.418, -0.02);
  }
}

// ---------- đồ đi kèm ----------
export const PROPS = {
  backpack(p, big, color) {
    const b = p.body, back = -chestZ(p);
    if (big) {
      box(b, 0.38, 0.58, 0.26, color, 0, 1.12, back - 0.135);
      box(b, 0.4, 0.1, 0.12, 0x8a8f96, 0, 1.46, back - 0.135); // túi ngủ cuộn trên đỉnh
    } else box(b, 0.28, 0.36, 0.14, color, 0, 1.17, back - 0.075);
    straps(p, 0x2b2b2b);
  },
  schoolBag(p, color) {
    box(p.body, 0.28, 0.3, 0.13, color, 0, 1.14, -chestZ(p) - 0.07);
    straps(p, 0x2b2b2b);
  },
  redScarf(p) {
    const z = chestZ(p);
    box(p.body, 0.15, 0.04, 0.03, 0xd62d20, 0, 1.415, z - 0.025, -0.25); // vòng cổ trước
    box(p.body, 0.04, 0.03, 0.02, 0xb52418, 0, 1.39, z + 0.005); // nút thắt
    box(p.body, 0.035, 0.13, 0.012, 0xd62d20, 0.015, 1.31, z + 0.008, 0, 0, 0.18); // 2 đuôi khăn
    box(p.body, 0.035, 0.12, 0.012, 0xd62d20, -0.02, 1.315, z + 0.008, 0, 0, -0.22);
  },
  // hình xăm kín tay: lớp vỏ mỏng ôm cánh tay (bắp tay dưới tay áo ngắn + cẳng tay), hoa văn vẽ bằng canvas (nền trong suốt)
  tattoo(p, neck = true) {
    const m = tattooMat();
    for (const [arm, el] of [[p.armL, p.elbowL], [p.armR, p.elbowR]]) {
      // bắp tay: phần da dưới tay áo cộc y −0,15 → −0,29 (bán kính 0,044 → 0,038) · cẳng tay: 0 → −0,23 (0,038 → 0,031)
      const up = new THREE.Mesh(sleeveGeo(0.047, 0.041, 0.135), m);
      up.position.y = -0.222;
      arm.add(up);
      const lo = new THREE.Mesh(sleeveGeo(0.041, 0.034, 0.21), m);
      lo.position.y = -0.11;
      el.add(lo);
    }
    if (neck) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.08), m);
      n.position.set(0.05, 1.475, 0.0);
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
  // to con: vai + ngực rộng hơn, bắp tay / cẳng tay to hơn (chân giữ nguyên)
  buff(p, k = 1) {
    p.body.scale.set(1 + 0.13 * k, 1, 1 + 0.1 * k);
    for (const a of [p.armL, p.armR]) a.scale.set(1 + 0.3 * k, 1, 1 + 0.3 * k);
  },
  chain(p) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.011, 5, 14), mat(0xd4af37)); // dây chuyền vàng ôm cổ, rủ xuống ngực
    m.position.set(0, 1.425, 0.035);
    m.rotation.x = 1.15;
    p.body.add(m);
  },
  cape(p) {
    const m = new THREE.Mesh(capeGeo(), CAPE_MAT);
    m.position.set(0, 1.44, 0);
    m.castShadow = true;
    p.body.add(m);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 4, 14).rotateX(Math.PI / 2).scale(1, 1, 0.8), mat(0xb52418));
    collar.position.set(0, 1.44, -0.005);
    p.body.add(collar); // cổ áo choàng buộc quanh cổ
    box(p.body, 0.03, 0.03, 0.012, 0xf1c40f, 0, 1.425, 0.07); // khuy vàng trước cổ
    box(p.body, 0.21, 0.04, 0.02, 0xd62d20, 0, 1.607, 0.112); // dải bịt mắt siêu nhân
  },
  tie(p) {
    const z = chestZ(p) + 0.004;
    box(p.body, 0.03, 0.025, 0.012, 0x163f73, 0, 1.425, z - 0.012); // nút cà vạt dưới cổ áo
    box(p.body, 0.045, 0.27, 0.01, 0x1d5fa8, 0, 1.27, z, -0.06);
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
    const h = inHand(p, 'R', total);
    cyl(h, 0.012, 0.84, 0x6b4a2b, 0, -0.42, 0.02); // thân gậy chống xuống đất
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 4, 8, Math.PI), mat(0x5a3a22));
    grip.position.set(0, 0.0, 0.055);
    grip.rotation.y = Math.PI / 2;
    h.add(grip); // tay cầm cong trong lòng bàn tay
  },
  briefcase(p, total) {
    box(inHand(p, 'R', total), 0.08, 0.26, 0.36, 0x5a3a22, 0, -0.14, 0);
  },
  bottle(p, total) {
    const h = inHand(p, 'R', total), z = 0.044; // trước lòng bàn tay
    cyl(h, 0.027, 0.12, 0x6b3d12, 0, -0.01, z); // thân chai (tay nắm giữa thân)
    box(h, 0.056, 0.04, 0.056, 0xf1e4b0, 0, -0.01, z); // nhãn
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.027, 0.04, 8), mat(0x6b3d12));
    sh.position.set(0, 0.07, z);
    h.add(sh); // vai chai
    cyl(h, 0.011, 0.06, 0x6b3d12, 0, 0.12, z); // cổ chai
    cyl(h, 0.013, 0.012, 0xd4af37, 0, 0.155, z); // nắp
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
    // bàn tay phải theo tư thế đang đặt (p.pose.armR) → điểm đầu dây; cổ chó → điểm cuối
    applyPose(p);
    g.updateMatrixWorld(true);
    const a = g.worldToLocal(p.elbowR.localToWorld(new THREE.Vector3(0, -0.3, 0.02))), b = new THREE.Vector3(0.5, 0.5, 0.86);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 4, 8), mat(0xd62d20));
    loop.position.set(0, -0.3, 0.02);
    p.elbowR.add(loop); // vòng dây quấn trong tay
    const dir = b.clone().sub(a), len = dir.length();
    const leash = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 4), mat(0xd62d20));
    leash.position.copy(a).add(b).multiplyScalar(0.5);
    leash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.add(leash);
    return d;
  },
};

// Hoa văn xăm (vẽ 1 lần, dùng chung): 1 dải tribal nhọn mực đen quanh bắp tay + 1 bông hồng nhỏ có lá; nền trong suốt, chừa nhiều da
let TATTOO = null;
function tattooMat() {
  if (TATTOO) return TATTOO;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.lineCap = x.lineJoin = 'round';
  // dải tribal: hàng gai cong nhọn nối nhau (nửa trên ảnh — quấn quanh bắp tay)
  x.fillStyle = '#16212b';
  for (let i = 0; i < 4; i++) {
    const x0 = i * 32;
    x.beginPath();
    x.moveTo(x0, 30);
    x.quadraticCurveTo(x0 + 10, 4, x0 + 30, 2); // gai cong lên
    x.quadraticCurveTo(x0 + 16, 14, x0 + 14, 30);
    x.quadraticCurveTo(x0 + 22, 44, x0 + 32, 58); // gai cong xuống
    x.quadraticCurveTo(x0 + 10, 50, x0, 30);
    x.fill();
  }
  // bông hồng nhỏ + 2 lá (nửa dưới — cẳng tay)
  const cx = 64, cy = 92;
  x.fillStyle = '#2f5a2a';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(cx + s * 15, cy + 10, 10, 4, s * 0.6, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#a5262b';
  x.beginPath();
  x.arc(cx, cy, 11, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#16212b';
  x.lineWidth = 2;
  x.beginPath();
  for (let t = 0; t < 11; t += 0.3) x.lineTo(cx + Math.cos(t * 1.4) * t * 0.9, cy + Math.sin(t * 1.4) * t * 0.9);
  x.stroke();
  x.beginPath();
  x.arc(cx, cy, 11, 0, Math.PI * 2);
  x.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  TATTOO = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.8 });
  return TATTOO;
}
const CAP_CROWN = new THREE.SphereGeometry(0.128, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.98, 0.85, 1.05);
// Áo choàng: cung tiện ôm sau vai (trên khít vai, dưới xòe rộng tới bắp chân), gợn nếp; vải đỏ 2 mặt
let CAPE = null;
const CAPE_MAT = new THREE.MeshStandardMaterial({ color: 0xd62d20, roughness: 0.7, flatShading: true, side: THREE.DoubleSide });
function capeGeo() {
  if (CAPE) return CAPE;
  const pts = [[0.3, -0.86], [0.24, -0.45], [0.19, -0.12], [0.16, 0]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 14, Math.PI * 0.58, Math.PI * 0.84), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = -y / 0.86;
    const fold = 1 + 0.06 * t * Math.sin(Math.atan2(x, z) * 7); // nếp gấp ở phần rủ
    p.setXYZ(i, x * fold, y, z * fold * (0.72 + 0.2 * t));
  }
  g.computeVertexNormals();
  return (CAPE = g);
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
      look: { shirt: pick(rng, [0x6f8fc9, 0x9c5f9a, 0x4f8f6b, 0xd88a4a]), pants: 0x3d3a33, hat: 'nonla', carry: 'crossbody', carryColor: 0x6b4a2b }, // áo màu, túi đeo chéo đựng vé
      speedMul: 0.7,
      dress(m) {
        const p = m.userData.parts;
        p.pose = { armL: [-0.7, -0.9] }; // tay trái cầm xấp vé số đưa ra trước
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
      look: { shirt: 0xf6f6f6, pants: 0x1c2e5a, skirt: f && rng.chance(0.5), hat: null, shirtStyle: 'shirt' },
      speedMul: 1.1,
      dress(m) {
        const p = m.userData.parts;
        PROPS.schoolBag(p, pick(rng, [0xd62d20, 0x185fa5, 0xe67e22]));
        PROPS.redScarf(p);
      },
    };
  }
  if (age === 'elder') {
    const cane = true; // cụ ông, cụ bà đều chống gậy
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
        if (!ride) {
          PROPS.bottle(p, -1.7);
          applyPose(p); // đặt tư thế ngay (tay giơ chai lên) — không phải đợi khung hình đầu
        }
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
      look: { shirt: 0xf6f6f6, pants: 0x1c2e5a, skirt: false, shirtStyle: 'shirt' },
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
      look: { shirt: 0xf4f4f4, pants: 0x1c2833, sleeves: 'long', shirtStyle: 'shirt', pantsStyle: 'slacks', shoeStyle: 'oxford', shoe: 0x1a1a1a },
      dress(m, ride) {
        const p = m.userData.parts;
        if (!f) PROPS.tie(p);
        if (!ride) {
          p.pose = { armR: [-0.1, -0.15], lift: { arm: 'L', to: [-1.2, -1.9], every: 4, hold: 1.2, rest: [0, -0.15] } }; // cầm cặp, nhìn đồng hồ liên tục
          PROPS.briefcase(p, -0.25);
          applyPose(p);
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
