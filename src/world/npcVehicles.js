// XE NPC ĐẶC BIỆT (chỉ để nhìn — mỗi máy tự vẽ): nhóm Jetjet (trẻ trâu), shipper hãng đối thủ, xe ba gác chở quá tải, trộm chó đi Exciter.
// Mỗi hàm trả về 1 Group (đầu xe hướng +z, gốc ở mặt đất) + userData { wheels, riders, kind } để traffic.js cho chạy / quay bánh sau này.
import * as THREE from 'three';
import { makeBike, makeCar, makePerson, randomPersonOpts, gripBar, setSitting, sitY, holdPhone, csgtLook } from './models.js';
import { PROPS } from './npcStyles.js';

const MATS = new Map();
const mat = (c) => {
  if (!MATS.has(c)) MATS.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true }));
  return MATS.get(c);
};
function box(parent, w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function wheel(parent, r, w, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2), mat(0x1b1b1b));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  box(m, w + 0.01, r * 0.9, r * 0.25, 0x9aa0a6, 0, 0, 0); // nan / mâm (thấy được bánh quay)
  return m;
}
const pick = (rng, arr) => arr[Math.floor(rng.next() * arr.length)];

// người lái ngồi trên xe máy (kiểu BIKE_SPECS) — tay nắm tay lái
function seatRider(bike, look, model, z = -0.05) {
  const m = makePerson(look);
  m.position.set(0, sitY(m.scale.x), z);
  bike.add(m);
  gripBar(m, model);
  return m;
}
// người ngồi sau: tay đặt lên đùi / ôm hờ; spread: banh 2 đùi (yên sau + hông xe rộng hơn chỗ người lái)
function seatBack(bike, look, z = -0.62, spread = 0.32) {
  const m = makePerson(look);
  bike.add(m);
  m.userData.parts.spread = spread;
  setSitting(m, true);
  m.position.set(0, sitY(m.scale.x, 1.02), z);
  return m;
}

// ======================== JETJET (trẻ trâu) ========================
// Áo caro / sọc mở cúc, nón lưỡi trai đội ngược / lệch, không đội mũ bảo hiểm, xe sơn màu chói (Exciter / xe số độ).
// opts: { pillion: có thằng ngồi sau, wheelie: bốc đầu }
// Sơ mi caro / sọc của jetjet: [màu áo, màu sọc]
const JETJET_PLAID = [[0xc0262d, 0x1b1b1b], [0x2f5fa8, 0xf2f2f2], [0x2e6b3a, 0x141414], [0xf2f2f2, 0x1b1b1b], [0xe2b52a, 0x1b1b1b]];
export function jetjetLook(rng) {
  const [sh, sh2] = pick(rng, JETJET_PLAID);
  const look = {
    ...randomPersonOpts(rng, 'm', { sitting: true }),
    shirt: pick(rng, [0xf4f4f4, 0x111111, 0xf4f4f4]),
    pants: pick(rng, [0x1f2a44, 0x111111, 0x3a4a6b]),
    sleeves: 'short', hat: null, face: rng.chance(0.4) ? 'glasses' : null, faceColor: 0x0d0d0d,
    hair: pick(rng, [0x1b1b1b, 0xd9b54a, 0xb5651d, 0x1b1b1b]), // nhuộm vàng / nâu
    shoe: 0xf2f2f2,
    shirtStyle: 'plaid', shirt: sh, shirt2: sh2, pantsStyle: 'jeans',
  };
  return {
    look,
    dress(m) {
      const p = m.userData.parts;
      PROPS.cap(p, pick(rng, ['back', 'back', 'side']), pick(rng, [0x111111, 0xd62d20, 0xf4f4f4, 0x1d5fa8]));
    },
  };
}
export function makeJetjet(rng, opts = {}) {
  const model = pick(rng, ['sport', 'sport', 'underbone']);
  const root = new THREE.Group();
  const bike = makeBike(pick(rng, [0x7d3cff, 0xff2a6d, 0x00b8e6, 0x9be000, 0x111111]), model);
  bike.userData.bagMesh.visible = false;
  root.add(bike);
  const riders = [];
  const a = jetjetLook(rng);
  const d = seatRider(bike, a.look, model);
  a.dress(d);
  riders.push(d);
  if (opts.pillion) {
    const b = jetjetLook(rng);
    const q = seatBack(bike, b.look);
    b.dress(q);
    const p = q.userData.parts;
    // ngồi sau giơ 1 tay hú hét
    p.armR.rotation.x = -2.7;
    p.elbowR.rotation.x = -0.3;
    riders.push(q);
  }
  // bốc đầu: xoay cả xe quanh điểm bánh sau chạm đất
  if (opts.wheelie) {
    const z = -0.62, ang = -0.42; // điểm bánh sau chạm đất · góc ngóc đầu
    bike.rotation.x = ang;
    bike.position.set(0, z * Math.sin(ang), z - z * Math.cos(ang)); // dời lại cho điểm đó đứng yên
  }
  root.userData = { kind: 'jetjet', model, riders, bike };
  return root;
}

// ======================== SHIPPER HÃNG ĐỐI THỦ ========================
// brand: { color (số), vehicle model } — đồng phục + mũ bảo hiểm + thùng hàng màu hãng
export function makeRivalShipper(rng, brandColor, model = 'cub') {
  const root = new THREE.Group();
  const bike = makeBike(pick(rng, [0x3a6fb0, 0xc22e2e, 0x111111, 0xe8e8e8]), model);
  // thùng hàng màu hãng (thùng gốc của xe có sẵn màu xanh nên không nhuộm được) — đặt đúng chỗ thùng gốc trên baga
  const ud = bike.userData;
  ud.bagMesh.visible = false;
  const bag = new THREE.Group();
  bag.position.copy(ud.bagMesh.position);
  box(bag, 0.5, 0.42, 0.42, brandColor, 0, 0, 0);
  box(bag, 0.52, 0.06, 0.44, new THREE.Color(brandColor).multiplyScalar(0.75).getHex(), 0, 0.2, 0);
  box(bag, 0.505, 0.035, 0.425, 0xe6ecef, 0, -0.11, 0); // viền phản quang
  box(bag, 0.26, 0.12, 0.01, 0xffffff, 0, 0.04, -0.215); // ô logo phía sau
  bike.add(bag);
  root.add(bike);
  const look = { ...randomPersonOpts(rng, null, { sitting: true }), uniform: brandColor, hat: 'helmet', hatColor: brandColor, helmetStyle: 'half' };
  const r = seatRider(bike, look, model);
  root.userData = { kind: 'rival', model, riders: [r], bike };
  return root;
}

// Shipper đối thủ đứng chờ lấy hàng trước quán: xe dựng sát lề (đầu xe +z), người đứng cạnh (bên phải xe) cầm điện thoại xem đơn
export function makeRivalWaiting(rng, brandColor, model = 'cub') {
  const g = makeRivalShipper(rng, brandColor, model);
  const { bike, riders } = g.userData;
  const look = { ...randomPersonOpts(rng, null), uniform: brandColor, hat: 'helmet', hatColor: brandColor, helmetStyle: 'half' };
  bike.remove(riders[0]); // bỏ người ngồi trên xe, dựng người đứng cạnh
  const m = makePerson(look);
  m.position.set(0.75, 0, -0.1);
  m.rotation.y = -0.4;
  holdPhone(m, 'vlog');
  g.add(m);
  g.userData = { kind: 'rivalWait', bike, person: m };
  return g;
}

// ======================== XE BA GÁC CHỞ QUÁ TẢI ========================
// Đầu xe máy (bánh trước, tay lái, yên) + thùng sắt phẳng 2 bánh sau; hàng chất cao, lòi ra 2 bên, dây chằng.
const BAGAC_BAR = [0.34, 1.02, 0.86];
export function makeBaGac(rng) {
  const g = new THREE.Group();
  const paint = pick(rng, [0x2f5fa8, 0x2e7d32, 0x8e2b2b]);
  const steel = 0x3d4247;
  const wheels = [];
  // đầu xe
  wheels.push(wheel(g, 0.26, 0.1, 0, 0.26, 1.1));
  for (const s of [-1, 1]) box(g, 0.03, 0.85, 0.03, 0xb0b5ba, s * 0.07, 0.62, 1.0, -0.22); // phuộc
  box(g, 0.68, 0.03, 0.03, 0x222222, 0, BAGAC_BAR[1], BAGAC_BAR[2]); // tay lái
  for (const s of [-1, 1]) box(g, 0.06, 0.06, 0.12, 0x111111, s * BAGAC_BAR[0], BAGAC_BAR[1], BAGAC_BAR[2]);
  box(g, 0.24, 0.16, 0.18, paint, 0, 1.08, 0.98); // đầu đèn
  box(g, 0.14, 0.1, 0.03, 0xfff3c4, 0, 1.08, 1.08);
  box(g, 0.32, 0.55, 0.12, paint, 0, 0.7, 0.86, -0.25); // yếm
  box(g, 0.12, 0.12, 0.9, steel, 0, 0.5, 0.4); // sườn
  box(g, 0.28, 0.26, 0.34, 0x55595e, 0, 0.42, 0.32); // máy
  box(g, 0.3, 0.09, 0.5, 0x2a211b, 0, 0.9, 0.32); // yên
  box(g, 0.28, 0.2, 0.4, paint, 0, 0.78, 0.32); // thân dưới yên
  // thùng sau
  const bedY = 0.62, bedZ = -0.78, W = 1.3, Lb = 1.5;
  box(g, W, 0.06, Lb, steel, 0, bedY, bedZ);
  box(g, 0.12, 0.12, Lb + 0.3, steel, 0, bedY - 0.12, bedZ + 0.1);
  for (const s of [-1, 1]) box(g, 0.04, 0.28, Lb, steel, s * W / 2, bedY + 0.14, bedZ); // thành bên
  box(g, W, 0.28, 0.04, steel, 0, bedY + 0.14, bedZ - Lb / 2); // thành sau
  for (const s of [-1, 1]) {
    wheels.push(wheel(g, 0.25, 0.12, s * 0.62, 0.25, -1.0));
    box(g, 0.18, 0.03, 0.55, steel, s * 0.62, 0.53, -1.0); // dè
  }
  box(g, 0.16, 0.06, 0.03, 0xff2a2a, -0.5, 0.55, bedZ - Lb / 2 - 0.02); // đèn hậu
  // hàng chất quá tải: thùng giấy, bao gạo, tủ gỗ, ghế nhựa đỏ chồng cao — lòi ra 2 bên thùng
  const top = bedY + 0.03;
  const cardboard = [0xc8a165, 0xb8905a, 0xd4b07a];
  const cargo = new THREE.Group();
  g.add(cargo);
  box(cargo, 0.6, 1.2, 0.5, 0x8b5a2b, -0.38, top + 0.6, bedZ + 0.35); // tủ gỗ đứng
  box(cargo, 0.02, 1.0, 0.02, 0x5c3a1c, -0.38, top + 0.6, bedZ + 0.6);
  for (let i = 0; i < 4; i++) box(cargo, 0.55, 0.32, 0.45, cardboard[i % 3], 0.33 + (i % 2) * 0.08, top + 0.16 + i * 0.32, bedZ + 0.3, 0, (i % 2) * 0.12, 0);
  for (let i = 0; i < 3; i++) box(cargo, 0.75, 0.3, 0.4, 0xe8e2c8, 0.05, top + 0.15 + i * 0.28, bedZ - 0.35, 0, 0, (i % 2 ? 1 : -1) * 0.04); // bao gạo
  // ghế nhựa đỏ chồng cao (12 cái) đặt trên cùng, nghiêng nhẹ
  for (let i = 0; i < 12; i++) {
    box(cargo, 0.42, 0.04, 0.42, 0xd62d20, 0.02, top + 1.32 + i * 0.07, bedZ - 0.25, 0, 0.05, 0.01 * i);
  }
  for (const s of [-1, 1]) box(cargo, 0.04, 0.85, 0.04, 0xb01e18, s * 0.19, top + 1.7, bedZ - 0.05, 0, 0, s * 0.02); // chân ghế
  box(cargo, 1.7, 0.06, 0.6, 0xd4b07a, 0, top + 1.25, bedZ - 0.3); // tấm giấy lòi ra 2 bên
  // dây chằng
  // dây chằng: từ mép thành thùng 2 bên vắt chéo lên đỉnh chồng hàng (ôm sát hàng, không lơ lửng)
  const rope = (ax, ay, az, bx, by, bz) => {
    const A = new THREE.Vector3(ax, ay, az), B = new THREE.Vector3(bx, by, bz), d = B.clone().sub(A);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, d.length(), 4), mat(0x2b2b2b));
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    cargo.add(m);
  };
  for (const z of [bedZ + 0.3, bedZ - 0.3]) {
    const hy = top + 1.3; // mặt tấm giấy trên cùng
    rope(-0.66, top + 0.25, z, -0.7, hy, z);
    rope(0.66, top + 0.25, z, 0.7, hy, z);
    rope(-0.7, hy + 0.04, z, 0.7, hy + 0.04, z);
  }
  rope(-0.22, top + 1.3, bedZ - 0.25, 0, top + 2.18, bedZ - 0.25); // buộc chồng ghế
  rope(0.22, top + 1.3, bedZ - 0.25, 0, top + 2.18, bedZ - 0.25);
  // người lái: áo cũ, nón lá hoặc nón vải, dép
  const look = { ...randomPersonOpts(rng, 'm', { sitting: true }), shirt: pick(rng, [0x8a8170, 0x5f6b76, 0xb0a48a]), sleeves: 'long', hat: rng.chance(0.5) ? 'nonla' : null, shoeStyle: 'sandal' };
  const d = makePerson(look);
  d.position.set(0, sitY(1, 0.96), 0.28);
  g.add(d);
  gripBar(d, BAGAC_BAR);
  g.userData = { kind: 'bagac', wheels, riders: [d], wheelRadius: 0.25 };
  return g;
}

// ======================== TRỘM CHÓ ========================
// Exciter đen, 2 người áo khoác đen, bịt khẩu trang; người lái mũ fullface đen, người ngồi sau nón lưỡi trai ngược,
// tay phải cầm cây chích điện (dài, đầu vàng) chĩa ra sau, tay trái xách bao tải.
export function makeDogThief(rng) {
  const root = new THREE.Group();
  const bike = makeBike(0x111111, 'sport');
  bike.userData.bagMesh.visible = false;
  root.add(bike);
  const dark = { shirt: 0x1b1b1b, pants: 0x1b1b1b, sleeves: 'long', face: 'mask', faceColor: 0x111111, shoe: 0x2b2b2b };
  const d = seatRider(bike, { ...randomPersonOpts(rng, 'm', { sitting: true }), ...dark, hat: 'helmet', hatColor: 0x111111, helmetStyle: 'full' }, 'sport');
  const q = seatBack(bike, { ...randomPersonOpts(rng, 'm', { sitting: true }), ...dark, shirt: 0x2b2f36, hat: null });
  const p = q.userData.parts;
  PROPS.cap(p, 'back', 0x111111, 0x333333);
  // tay phải buông dang ra ngoài, cầm cây chích điện chĩa chéo xuống phía sau xe
  p.armR.rotation.set(0.15, 0, 0.45);
  p.elbowR.rotation.x = -0.15;
  const pole = new THREE.Group();
  pole.position.y = -0.3;
  pole.rotation.set(1.05, 0, 0.2); // so với cẳng tay: ngả ra sau + hơi ra ngoài
  p.elbowR.add(pole);
  box(pole, 0.025, 1.3, 0.025, 0x333333, 0, -0.55, 0);
  box(pole, 0.05, 0.1, 0.05, 0xf1c40f, 0, -1.22, 0); // đầu chích điện
  // tay trái xách bao tải (cạnh đùi)
  p.armL.rotation.set(0.05, 0, -0.35);
  p.elbowL.rotation.x = -0.1;
  const sack = new THREE.Group();
  sack.position.y = -0.33;
  p.elbowL.add(sack);
  const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.19, 0.42, 7), mat(0xb9a77a));
  bag.position.y = -0.27;
  bag.castShadow = true;
  sack.add(bag);
  box(sack, 0.12, 0.05, 0.12, 0x8a7a50, 0, -0.04, 0); // miệng bao buộc túm
  root.userData = { kind: 'dogThief', model: 'sport', riders: [d, q], bike };
  return root;
}

// ======================== CSGT ========================
// Đồng phục CSGT: models.csgtLook (dùng chung với chiến sĩ ở chốt — traffic.js)
// đèn ưu tiên xanh – đỏ: 2 khối phát sáng (game nhấp nháy bằng userData.lights)
function lightBar(parent, w, x, y, z) {
  const bar = new THREE.Group();
  bar.position.set(x, y, z);
  box(bar, w, 0.08, 0.22, 0x222222, 0, 0, 0);
  const red = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.02, 0.1, 0.2), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  const blue = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.02, 0.1, 0.2), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
  red.position.set(-w / 4, 0.09, 0);
  blue.position.set(w / 4, 0.09, 0);
  bar.add(red, blue);
  parent.add(bar);
  return [red, blue];
}
// Xe tuần tra: mô tô trắng sọc xanh, 2 thùng đồ hai bên, đèn xanh – đỏ trên cột, 2 chiến sĩ đồng phục vàng, mũ 3/4 vàng; người sau cầm gậy chỉ huy
export function makeCsgtPatrol(rng) {
  const root = new THREE.Group();
  const bike = makeBike(0xf4f4f4, 'sport');
  bike.userData.bagMesh.visible = false;
  root.add(bike);
  for (const sd of [-1, 1]) box(bike, 0.012, 0.06, 0.62, 0x1d5fa8, sd * 0.125, 0.8, -0.2); // sọc xanh 2 bên hông xe (mỏng, áp sát thân — không chắn chân người ngồi)
  // 2 thùng đồ hai bên bánh sau (trắng, sọc xanh, nắp xám) + đèn ưu tiên trên cột sau lưng người ngồi sau
  for (const sd of [-1, 1]) {
    box(bike, 0.22, 0.42, 0.62, 0xf4f4f4, sd * 0.33, 0.78, -0.62);
    box(bike, 0.225, 0.08, 0.63, 0x1d5fa8, sd * 0.33, 0.74, -0.62);
    box(bike, 0.23, 0.05, 0.64, 0x9aa0a6, sd * 0.33, 1.0, -0.62);
    box(bike, 0.06, 0.06, 0.4, 0x333333, sd * 0.2, 0.92, -0.62); // giá bắt thùng
  }
  box(bike, 0.04, 0.55, 0.04, 0x333333, 0, 1.25, -1.0); // cột đèn
  const lights = lightBar(bike, 0.42, 0, 1.55, -1.0);
  const look = () => csgtLook(rng, true);
  const d = seatRider(bike, look(), 'sport');
  const q = seatBack(bike, look());
  const p = q.userData.parts;
  // người ngồi sau: tay phải cầm gậy chỉ huy trắng – đen chĩa xuống bên hông
  p.armR.rotation.set(0.1, 0, 0.3);
  p.elbowR.rotation.x = -0.6;
  const baton = new THREE.Group();
  baton.position.y = -0.3;
  baton.rotation.x = 0.6;
  p.elbowR.add(baton);
  for (let i = 0; i < 4; i++) box(baton, 0.04, 0.12, 0.04, i % 2 ? 0x111111 : 0xffffff, 0, -0.06 - i * 0.12, 0);
  root.userData = { kind: 'csgt', model: 'sport', riders: [d, q], bike, lights };
  return root;
}
// Xe bán tải CSGT đậu ở chốt: trắng, sọc xanh – vàng 2 bên, chữ "CẢNH SÁT GIAO THÔNG", đèn ưu tiên trên nóc
export function makeCsgtCar(text = 'CSGT') {
  const g = makeCar(0xf4f4f4, 'suv');
  const bb = new THREE.Box3().setFromObject(g), sz = bb.getSize(new THREE.Vector3());
  const top = bb.max.y, half = sz.x / 2 + 0.005, len = sz.z * 0.86, midY = bb.min.y + sz.y * 0.42;
  for (const s of [-1, 1]) {
    box(g, 0.02, 0.16, len, 0x1d5fa8, s * half, midY, 0);
    box(g, 0.02, 0.06, len, 0xf1c40f, s * half, midY - 0.12, 0);
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#1d5fa8';
    x.fillRect(0, 0, 512, 64);
    x.fillStyle = '#ffffff';
    x.font = 'bold 40px Arial';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, 256, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.6, len * 0.075), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    pl.position.set(s * (half + 0.012), midY + 0.17, 0);
    pl.rotation.y = s * Math.PI / 2;
    g.add(pl);
  }
  const lights = lightBar(g, 1.2, 0, top + 0.06, 0);
  g.userData = { ...g.userData, kind: 'csgtCar', lights };
  return g;
}

// ======================== CHÚ XE ÔM NẰM TRÊN XE ========================
// Xe số dựng chân chống; chú nằm ngửa dọc yên: đầu gối lên baga sau, 2 chân gác lên tay lái, tay buông dọc thân, nón lá úp lên mặt
export function makeXeOmLying(rng) {
  const root = new THREE.Group();
  const bike = makeBike(pick(rng, [0x8e2b2b, 0x2f5fa8, 0x2c3e50, 0x7f8c8d]), pick(rng, ['underbone', 'cub']));
  bike.userData.bagMesh.visible = false;
  bike.rotation.z = 0.06; // nghiêng nhẹ trên chân chống
  root.add(bike);
  const look = { ...randomPersonOpts(rng, 'm'), shirt: pick(rng, [0x8a8170, 0x5f6b76, 0xb0a48a, 0x6b4a2b]), pants: pick(rng, [0x3d3a33, 0x2c3e50]), sleeves: 'short', hat: null, hair: 0x5a5a5a, shoeStyle: 'sandal' };
  const m = makePerson(look);
  const p = m.userData.parts;
  // nằm ngửa (xoay −90° quanh trục ngang): đầu người → đuôi xe (−z), mặt ngửa lên trời; gốc người (bàn chân) ở phía tay lái.
  // Lưng nằm trên yên (cao ~0,95), đầu tới baga sau; chân duỗi gần thẳng gác lên tay lái, chân phải vắt chéo
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 1.08, 0.72);
  p.legL.rotation.x = p.legR.rotation.x = -0.2;
  p.kneeL.rotation.x = 0.25;
  p.kneeR.rotation.x = 0.1;
  p.legR.rotation.z = -0.18;
  p.legR.rotation.y = 0.15;
  for (const [arm, el, s] of [[p.armL, p.elbowL, -1], [p.armR, p.elbowR, 1]]) {
    arm.rotation.set(-0.12, 0, s * 0.16); // tay buông xuôi dọc thân, hơi dang (nằm ngửa: "đưa ra trước" là hướng lên trời)
    el.rotation.set(-0.15, 0, 0);
  }
  bike.add(m);
  // nón lá úp lên mặt
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0xe8d6a0, roughness: 0.8, flatShading: true }));
  hat.castShadow = true;
  p.body.add(hat);
  hat.position.set(0, 1.62, 0.2);
  hat.rotation.x = Math.PI / 2;
  root.userData = { kind: 'xeOm', bike, rider: m };
  return root;
}
