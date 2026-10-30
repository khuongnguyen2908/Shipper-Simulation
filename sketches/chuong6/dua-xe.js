// PHÁC HỌA: màn đua thoát thân thêm thử thách — xe giang hồ áp sát (anh Đạt cầm gậy Q / E) · tàu hỏa · cửa xe · thùng rớt · dây phơi ·
// hàng xe chờ cầu + barie · bốc đầu ở mép cầu · phanh gấp sau khi đáp. Đúng mô hình xe / người của game. Mở: /sketches/chuong6/dua-xe.html
import * as THREE from 'three';
import { makeBike, makeCar, makeNpcMoto, makePerson, randomPersonOpts, setSitting, sitY, hipBend } from '../../src/world/models.js';
import { makeWeaponMesh } from '../../src/world/fightModels.js';
import { makeLongTruck } from '../../src/world/storyProps.js';
import { lookOfChar } from '../../src/data/relations.js';
import { makeRng } from '../../src/sim/rng.js';
import REL from '../../src/data/relations.json' with { type: 'json' };

const ease = (x) => x * x * (3 - 2 * x);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const W = 340, H = 240;

// ---------- 1 ô ----------
function panel(fig, setup) {
  const canvas = document.createElement('canvas');
  fig.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(W, H, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2030);
  scene.fog = new THREE.Fog(0x1b2030, 40, 110);
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x3a3540, 1.6));
  const sun = new THREE.DirectionalLight(0xffe2b8, 1.8); sun.position.set(-4, 8, 3); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
  const tag = Object.assign(document.createElement('div'), { className: 'tag' });
  const qte = Object.assign(document.createElement('div'), { className: 'qte', innerHTML: '<b><i></i></b><span></span>' });
  fig.prepend(tag, qte);
  const S = { renderer, scene, cam, tag, qte, x: {} };
  setup(S);
  return S;
}
const label = (S, text, color = '#ffd54a') => { S.tag.textContent = text; S.tag.style.color = color; S.tag.style.display = text ? '' : 'none'; };
// nút bấm nhanh: key = 'E' | 'Q' | 'A' | 'Space' · k: phần thời gian còn lại (1 → 0) · ok: đã bấm đúng
const qte = (S, key, text, k = 1, ok = false) => {
  S.qte.classList.toggle('on', !!key);
  if (!key) return;
  S.qte.classList.toggle('ok', ok);
  S.qte.querySelector('i').textContent = key;
  S.qte.classList.toggle('wide', key.length > 1);
  S.qte.querySelector('span').textContent = text;
  S.qte.style.setProperty('--k', `${clamp(k) * 100}%`);
};
// camera đuổi sau lưng xe (hơi lệch phải cho thấy 2 bên)
const chase = (S, x, z, side = -1.0, back = 5.6, up = 2.7) => { S.cam.position.set(x + side, up, z - back); S.cam.lookAt(x, 1.1, z + 6); };
const side = (S, x, z, dist = 13, up = 3) => { S.cam.position.set(x + dist, up, z - 1); S.cam.lookAt(x, 1.2, z + 1); };

// ---------- vật dựng ----------
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
const box = (w, h, d, c, o) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o));
function road(S, w = 10, len = 700, z0 = -60) {
  const g = new THREE.Group();
  const r = box(w, 0.1, len, 0x3b3e45); r.position.set(0, -0.05, z0 + len / 2); g.add(r);
  const side0 = box(60, 0.08, len, 0x2b3a2d); side0.position.set(0, -0.12, z0 + len / 2); g.add(side0);
  for (let z = z0; z < z0 + len; z += 9) { const d = box(0.15, 0.02, 3.5, 0xe8e4da); d.position.set(0, 0.01, z); g.add(d); }
  for (const s of [-1, 1]) { const e = box(0.18, 0.02, len, 0xe8e4da); e.position.set((s * w) / 2 - s * 0.3, 0.01, z0 + len / 2); g.add(e); }
  S.scene.add(g);
  return g;
}
const red = () => new THREE.MeshBasicMaterial({ color: 0xff2a1f, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
function aura(r = 0.45, h = 1.3, y = 0.65) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16, 1, true).translate(0, y, 0), red()); return m; }
const pulse = (t) => 0.2 + 0.25 * Math.abs(Math.sin(t * 14));
// gậy gỗ của anh Đạt
function bat() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.028, 0.85, 8), mat(0xb5803f));
  m.position.y = -0.38; g.add(m);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), mat(0x222222)); grip.position.y = 0.0; g.add(grip);
  return g;
}
const holdIn = (person, mesh, arm = 'R') => { const el = person.userData.parts?.['elbow' + arm]; mesh.position.set(0, -0.27, 0.02); mesh.rotation.x = Math.PI / 2; el.add(mesh); };

// xe mình: xe sport đen + người lái (nón xanh) + anh Đạt ngồi sau (nón hồng) cầm gậy
const DAT = { ...lookOfChar(REL.characters.man), hat: 'helmet', hatColor: 0xff8fb1, face: null };
function myBike(S) {
  const g = new THREE.Group();
  const bike = makeBike(0x15171c, 'supersport');
  if (bike.userData.bagMesh) bike.userData.bagMesh.visible = false;
  g.add(bike);
  const me = makePerson({ gender: 'm', shirt: 0x2e86de, pants: 0x2c3e50, hair: 0x1b1b1b, skin: 0xd8a47f, hairStyle: 'short', hat: 'helmet', hatColor: 0x2980b9, faceStyle: 'chinhNam' });
  setSitting(me, true); me.position.set(0, sitY(me.scale.x), -0.05); g.add(me);
  for (const s of ['L', 'R']) { me.userData.parts['arm' + s].rotation.x = -1.15; me.userData.parts['elbow' + s].rotation.x = -0.35; }
  const dat = makePerson(DAT);
  setSitting(dat, true); dat.position.set(0, sitY(dat.scale.x, 1.02), -0.62); g.add(dat);
  const b = bat(); holdIn(dat, b);
  S.scene.add(g);
  return { g, me, dat, bat: b };
}
// anh Đạt: thủ gậy · vung sang bên (side = 1 phải, -1 trái), k 0 → 1 (lấy đà 0–0,4 · quật 0,4–0,7 · thu về)
function datSwing(B, side = 0, k = -1) {
  const P = B.dat.userData.parts;
  P.armL.rotation.set(-0.55, 0, 0); P.elbowL.rotation.x = -0.9;
  P.armR.rotation.set(-0.9, 0, 0); P.elbowR.rotation.x = -1.2;
  let twist = 0;
  if (side && k >= 0 && k <= 1) {
    const w = ease(clamp(k / 0.4)), s = ease(clamp((k - 0.4) / 0.3)), back = clamp((k - 0.75) / 0.25);
    P.armR.rotation.x = lerp(-0.9, -2.7, w) + s * 1.3;
    P.armR.rotation.z = -side * (w * 0.4 + s * 1.1) * (1 - back);
    P.elbowR.rotation.x = lerp(-1.2, -0.3, w);
    twist = -side * (w * 0.35 - s * 0.9) * (1 - back);
  }
  hipBend(P, 0.05, 0, twist);
}
// xe giang hồ: người lái + đứa ngồi sau cầm ống tuýp, lóe đỏ quanh đứa ngồi sau lúc giơ tay
const rng = makeRng(77);
function gang(S, color) {
  const g = makeNpcMoto(color, rng);
  const back = makePerson({ ...randomPersonOpts(rng, 'm', { sitting: true }), hat: null });
  setSitting(back, true); back.position.set(0, sitY(back.scale.x, 1.02), -0.6); g.add(back);
  holdIn(back, makeWeaponMesh('pipe'));
  const a = aura(); back.add(a);
  S.scene.add(g);
  return { g, back, a };
}
// đứa ngồi sau: thường · giơ ống tuýp (k 0 → 1) · phang (k > 1) về phía side
function gangArm(G, side, k = -1, t = 0) {
  const P = G.back.userData.parts;
  P.armL.rotation.set(-0.5, 0, 0); P.armR.rotation.set(-0.7, 0, 0); P.elbowR.rotation.x = -0.6;
  G.a.material.opacity = k >= 0 && k <= 1 ? pulse(t) : 0;
  if (k >= 0 && k <= 1) { P.armR.rotation.x = -0.7 - 2.0 * ease(k); P.armR.rotation.z = side * 0.4 * k; }
  else if (k > 1 && k < 1.4) { P.armR.rotation.x = -2.7 + (k - 1) * 4; P.armR.rotation.z = side * 1.0; }
  hipBend(P, 0, 0, k >= 0 && k < 1.4 ? side * 0.4 : 0);
}
// xe té lăn ra đường
function fall(G, k, side) { G.g.rotation.z = -side * Math.min(1.45, k * 2.6); G.g.position.y = 0; }
// bán tải Tí Đô (bám sau)
const pickup = (S) => { const c = makeCar(0x7f8c8d, 'truck'); S.scene.add(c); return c; };

// ---------- các ô ----------
const CARDS = [
  { s: 1, name: '🥢 Áp sát → 2 cú là văng', how: 'Xe giang hồ chạy lên ngang hông. Bấm E (bên phải) / Q (bên trái): anh Đạt quật gậy. Cú 1: xe nó chao ra xa. Cú 2: văng té lăn ra đường. Đánh hụt (sai bên / xa quá): chờ 0,8 giây mới vung lại. Không hiện nút giữa màn hình — người chơi tự canh.',
    setup(S) { road(S); S.x.B = myBike(S); S.x.G = gang(S, 0x1f6fd1); },
    run(S, t) {
      const c = t % 7, B = S.x.B, G = S.x.G, z = t * 18 % 400;
      B.g.position.set(-1.2, 0, z);
      const come = ease(clamp(c / 1.5)), h1 = clamp((c - 2.0) / 0.7), h2 = clamp((c - 4.4) / 0.7), out = c > 4.6 ? clamp((c - 4.6) / 1.2) : 0;
      let lat = lerp(3.2, 1.15, come) + Math.sin(h1 * Math.PI) * 1.6 * (c < 3.6 ? 1 : 0);
      if (c > 3.6 && c < 4.6) lat = 1.15;
      G.g.position.set(-1.2 - lat - out * 1.2, 0, z - 9 * (1 - come) - out * 14);
      G.g.rotation.set(0, 0, c > 2.4 && c < 3.4 ? Math.sin(t * 14) * 0.12 : 0);
      if (out > 0) fall(G, out, -1);
      gangArm(G, -1);
      datSwing(B, c > 1.8 && c < 2.7 ? 1 : c > 4.2 && c < 5.1 ? 1 : 0, c < 3 ? (c - 1.8) / 0.9 : (c - 4.2) / 0.9);
      chase(S, -1.6, z);
      const k1 = c > 1.5 && c < 2.0, k2 = c > 3.9 && c < 4.4;
      qte(S, null); // xe giang hồ: không hiện nút — người chơi tự canh lúc nó lóe đỏ
      label(S, c < 1.5 ? 'xe giang hồ áp sát bên phải…' : c < 3.6 ? (c < 2.4 ? 'E — anh Đạt quật gậy!' : 'cú 1: chao ra xa') : out > 0 ? '💥 cú 2: VĂNG!' : 'nó lại áp vào…', out > 0 || (c > 2 && c < 3.6) ? '#7dff8a' : '#ffd54a');
    } },
  { s: 1, name: '⚡ Đánh ĐÚNG LÚC nó giơ tay → văng luôn', how: 'Đứa ngồi sau lóe đỏ, giơ ống tuýp 0,8 giây rồi mới phang. Quật trúng trong lúc nó đang giơ tay: văng luôn (×2), đòn của nó bị hủy.',
    setup(S) { road(S); S.x.B = myBike(S); S.x.G = gang(S, 0xc0392b); },
    run(S, t) {
      const c = t % 5.6, B = S.x.B, G = S.x.G, z = t * 18 % 400;
      B.g.position.set(-1.2, 0, z);
      const come = ease(clamp(c / 1.4)), wind = c > 1.6 && c < 2.6, out = c > 2.4 ? clamp((c - 2.4) / 1.2) : 0;
      G.g.position.set(-1.2 - lerp(3.2, 1.15, come) - out * 1.4, 0, z - 9 * (1 - come) - out * 14);
      G.g.rotation.set(0, 0, 0);
      if (out > 0) fall(G, out, -1);
      gangArm(G, -1, wind && out === 0 ? (c - 1.6) / 0.8 : -1, t);
      datSwing(B, c > 1.9 && c < 2.8 ? 1 : 0, (c - 1.9) / 0.9);
      chase(S, -1.6, z);
      qte(S, null); // xe giang hồ: không hiện nút — người chơi tự canh lúc nó lóe đỏ
      label(S, c < 1.6 ? 'áp sát…' : out === 0 ? '🔴 nó giơ ống tuýp — quật ngay!' : '⚡ ĐÚNG LÚC — văng luôn!', c < 1.6 ? '#ffd54a' : out === 0 ? '#ff6b5a' : '#7dff8a');
    } },
  { s: 1, name: '↔️ Kẹp 2 bên (quốc lộ)', how: 'Đường rộng: 2 xe kẹp 2 bên. Q quật bên trái, E quật bên phải — anh Đạt quay người theo. Xe còn lại vẫn áp sát: phải đánh xen kẽ.',
    setup(S) { road(S, 14); S.x.B = myBike(S); S.x.L = gang(S, 0x8e44ad); S.x.R = gang(S, 0x27ae60); },
    run(S, t) {
      const c = t % 6, B = S.x.B, z = t * 18 % 400;
      B.g.position.set(0, 0, z);
      const come = ease(clamp(c / 1.5)), hl = clamp((c - 2.2) / 0.7), hr = clamp((c - 3.6) / 0.7);
      S.x.L.g.position.set(lerp(3.4, 1.15, come) + Math.sin(hl * Math.PI) * 1.5, 0, z - 8 * (1 - come));
      S.x.R.g.position.set(-lerp(3.4, 1.15, come) - Math.sin(hr * Math.PI) * 1.5, 0, z - 10 * (1 - come));
      S.x.L.g.rotation.z = c > 2.6 && c < 3.4 ? Math.sin(t * 14) * 0.12 : 0;
      S.x.R.g.rotation.z = c > 4.0 && c < 4.8 ? Math.sin(t * 14) * 0.12 : 0;
      gangArm(S.x.L, 1); gangArm(S.x.R, -1);
      datSwing(B, c > 2.0 && c < 2.9 ? -1 : c > 3.4 && c < 4.3 ? 1 : 0, c < 3 ? (c - 2.0) / 0.9 : (c - 3.4) / 0.9);
      chase(S, 0, z, 0, 6.5, 3.2);
      qte(S, null); // xe giang hồ: không hiện nút — người chơi tự canh lúc nó lóe đỏ
      label(S, c < 1.7 ? 'kẹp 2 bên!' : c < 3 ? 'Q — quật bên trái' : c < 4.6 ? 'E — quật bên phải' : 'cú 1 cả 2 xe: chao ra', '#ffd54a');
    } },
  { s: 1, name: '😵 Không đánh / không né → bị phang', how: 'Nó phang trúng: xe mình chao, mất tốc → bán tải Tí Đô áp sát hơn (không tính té xe). Né được bằng cách phanh / lách ra xa lúc nó đang giơ tay.',
    setup(S) { road(S); S.x.B = myBike(S); S.x.G = gang(S, 0x2c3e50); S.x.T = pickup(S); },
    run(S, t) {
      const c = t % 5.6, B = S.x.B, G = S.x.G, z = t * 18 % 400;
      const hit = c > 2.4 && c < 3.6, slow = c > 2.4 ? clamp((c - 2.4) / 1.5) : 0;
      B.g.position.set(-1.2 + (hit ? Math.sin((c - 2.4) * 9) * 0.25 : 0), 0, z);
      B.g.rotation.z = hit ? Math.sin((c - 2.4) * 12) * 0.18 : 0;
      const come = ease(clamp(c / 1.4));
      G.g.position.set(-1.2 - lerp(3.2, 1.15, come), 0, z - 9 * (1 - come) + slow * 4);
      gangArm(G, -1, c > 1.6 && c < 2.4 ? (c - 1.6) / 0.8 : c >= 2.4 && c < 2.8 ? 1 + (c - 2.4) : -1, t);
      datSwing(B);
      S.x.T.position.set(0.4, 0, z - lerp(22, 9, slow)); S.x.T.rotation.y = 0;
      chase(S, -1.2, z, 1.2, 8, 3.6);
      qte(S, null);
      label(S, c < 1.6 ? 'áp sát…' : c < 2.4 ? '🔴 nó giơ tay (không làm gì)…' : '😵 bị phang: chao xe, mất tốc — bán tải áp sát', c < 1.6 ? '#ffd54a' : '#ff6b5a');
    } },
  // ---- ② chướng ngại mới ----
  { s: 2, name: '🚂 Tàu hỏa băng ngang (khu công nghiệp)', how: 'Chuông kêu, đèn đỏ nháy, tàu tới. Lượt 1: liều vượt kịp trước mũi tàu. Lượt 2: phanh đứng chờ — an toàn nhưng bán tải Tí Đô áp sát. Người chơi tự chọn.',
    setup(S) {
      road(S); S.x.B = myBike(S); S.x.T = pickup(S);
      for (const dz of [-0.8, 0.8]) { const r = box(80, 0.12, 0.12, 0x9a9a9a); r.position.set(0, 0.06, 60 + dz); S.scene.add(r); }
      const tr = new THREE.Group();
      const loco = box(14, 3.4, 3.0, 0x1e5aa8); loco.position.set(0, 1.9, 0); tr.add(loco);
      const nose = box(1.2, 2.4, 3.0, 0xf1c40f); nose.position.set(7.6, 1.5, 0); tr.add(nose);
      for (let i = 1; i < 4; i++) { const w = box(15, 3.2, 3.0, [0x8e3b2e, 0x5d6d7e, 0x8e3b2e][i - 1]); w.position.set(-15.6 * i, 1.8, 0); tr.add(w); }
      tr.position.set(-80, 0, 60); S.scene.add(tr); S.x.train = tr;
      const post = box(0.15, 2.6, 0.15, 0x222222); post.position.set(4.6, 1.3, 57); S.scene.add(post);
      S.x.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1f })); S.x.lamp.position.set(4.6, 2.6, 56.9); S.scene.add(S.x.lamp);
    },
    run(S, t) {
      const c = t % 6, lap = Math.floor(t / 6) % 2, B = S.x.B;
      let z = lap === 0 ? 20 + c * 15 : Math.min(54, 20 + c * 15 - Math.max(0, c - 1.4) ** 2 * 6);
      if (lap === 1 && c > 1.4) z = Math.min(20 + 1.4 * 15 + (c - 1.4) * 15 * Math.max(0, 1 - (c - 1.4) / 1.5), 54);
      B.g.position.set(-1.2, 0, z);
      const tx = lap === 0 ? -60 + c * 22 : -70 + c * 22;
      S.x.train.position.x = tx;
      S.x.lamp.visible = Math.floor(t * 4) % 2 === 0;
      datSwing(B);
      S.x.T.position.set(-0.6, 0, z - (lap === 1 ? lerp(24, 8, clamp((c - 2) / 2.5)) : 24));
      chase(S, -1.2, Math.min(z, 54), 3, 9, 4.5);
      qte(S, null);
      label(S, lap === 0 ? (c < 2.2 ? '🔔 tàu tới — liều vượt…' : '✅ VƯỢT KỊP trước mũi tàu!') : c < 1.4 ? '🔔 tàu tới…' : '✋ phanh chờ: an toàn, bán tải áp sát', lap === 0 && c >= 2.2 ? '#7dff8a' : lap === 1 && c > 1.4 ? '#ff9f43' : '#ffd54a');
    } },
  { s: 2, name: '🚪 Cửa xe đậu bật mở (quốc lộ)', how: 'Xe đậu sát lề phải, cửa bật mở bất ngờ ngay trước mặt: hiện nút A (lách trái) — lách đúng lúc. Trễ: tông cửa = té xe.',
    setup(S) {
      road(S); S.x.B = myBike(S);
      const car = makeCar(0xecf0f1, 'sedan'); car.position.set(-3.6, 0, 70); S.scene.add(car);
      const door = new THREE.Group(); const d = box(0.08, 0.9, 1.1, 0xecf0f1); d.position.set(0, 0.85, 0.55); door.add(d); door.position.set(-2.75, 0, 68.5); S.scene.add(door); S.x.door = door;
    },
    run(S, t) {
      const c = t % 5, B = S.x.B, z = 30 + c * 16;
      const open = clamp((c - 1.4) / 0.25), dodge = ease(clamp((c - 1.75) / 0.45)) * (c < 3.4 ? 1 : ease(clamp(1 - (c - 3.4) / 0.8)));
      S.x.door.rotation.y = -open * 1.2;
      B.g.position.set(-2.6 + dodge * 2.2, 0, z);
      B.g.rotation.z = c > 1.75 && c < 2.4 ? 0.18 : 0;
      datSwing(B);
      chase(S, -1.6, z);
      qte(S, c > 1.4 && c < 2.2 ? 'A' : null, 'LÁCH TRÁI!', 1 - (c - 1.4) / 0.8, c > 1.75);
      label(S, c < 1.4 ? 'chạy sát lề phải…' : c < 2.6 ? '🚪 cửa bật mở — LÁCH!' : '✅ lách qua', c >= 2.6 ? '#7dff8a' : c >= 1.4 ? '#ff6b5a' : '#ffd54a');
    } },
  { s: 2, name: '📦 Xe tải rớt thùng hàng (quốc lộ)', how: 'Xe tải phía trước đứt dây chằng, thùng hàng rơi lăn ra đường. Lái lách theo khe trống giữa các thùng (không có nút bấm — chỉ lái).',
    setup(S) {
      road(S, 12); S.x.B = myBike(S);
      const tk = makeLongTruck({ cab: 0x1e8449 }); S.scene.add(tk); S.x.tk = tk;
      S.x.boxes = [0, 1, 2, 3, 4].map((i) => { const b = box(1.1, 1.0, 1.1, [0xb07d3e, 0xc8954f, 0x9c6b33][i % 3]); S.scene.add(b); return b; });
    },
    run(S, t) {
      const c = t % 6, B = S.x.B, z = 4 + c * 15;
      S.x.tk.position.set(1.8, 0, 46 + c * 13);
      const lanes = [-3.6, 2.6, 0.2, -1.8, 4.2];
      S.x.boxes.forEach((b, i) => {
        const k = clamp((c - 0.6 - i * 0.18) / 0.9), z0 = 46 + (0.6 + i * 0.18) * 13 - 7;
        b.position.set(lerp(1.8, lanes[i], ease(k)), k < 1 ? 2.4 * (1 - k) * (1 - k) + 0.5 + Math.abs(Math.sin(k * 6)) * 0.5 * (1 - k) : 0.5, z0 - k * 3);
        b.rotation.set(k * 4 + i, i, k * 3);
      });
      const weave = c < 2.4 ? 0 : c < 3.2 ? ease((c - 2.4) / 0.8) * -1.1 : c < 4 ? lerp(-1.1, 1.3, ease((c - 3.2) / 0.8)) : 1.3;
      B.g.position.set(weave, 0, z);
      B.g.rotation.z = c > 2.4 && c < 4 ? (c < 3.2 ? 0.15 : -0.15) : 0;
      datSwing(B);
      chase(S, weave * 0.5, z, 1.6, 8, 4);
      qte(S, null);
      label(S, c < 0.8 ? 'xe tải phía trước…' : c < 2.4 ? '📦 thùng rơi!' : c < 4.2 ? '↔️ lách theo khe' : '✅ qua', c >= 4.2 ? '#7dff8a' : c >= 0.8 ? '#ff6b5a' : '#ffd54a');
    } },
  { s: 2, name: '👕 Dây phơi / sào tre ngang đường (bờ kênh)', how: 'Dây phơi giăng ngang tầm cổ: hiện nút Space — cả 2 người cúi rạp đúng lúc. Trễ: vướng dây = té xe.',
    setup(S) {
      road(S, 6); S.x.B = myBike(S);
      for (const x of [-3.4, 3.4]) { const p = box(0.12, 2.6, 0.12, 0x6d5a3a); p.position.set(x, 1.3, 50); S.scene.add(p); }
      const line = box(6.8, 0.03, 0.03, 0xdddddd); line.position.set(0, 1.62, 50); S.scene.add(line);
      [[-2, 0xe74c3c], [-0.6, 0x3498db], [0.9, 0xf1c40f], [2.2, 0xffffff]].forEach(([x, col]) => { const cl = box(0.6, 0.55, 0.04, col); cl.position.set(x, 1.33, 50); S.scene.add(cl); });
    },
    run(S, t) {
      const c = t % 4.4, B = S.x.B, z = 20 + c * 14;
      const duck = c > 1.55 && c < 2.6 ? ease(clamp((c - 1.55) / 0.2)) : 0;
      B.g.position.set(0, 0, z);
      for (const p of [B.me, B.dat]) hipBend(p.userData.parts, duck * 0.95, 0, 0);
      if (!duck) datSwing(B);
      S.cam.position.set(4.5, 2.2, z - 3); S.cam.lookAt(0, 1.2, z + 3);
      qte(S, c > 1.2 && c < 2.0 ? 'Space' : null, 'CÚI!', 1 - (c - 1.2) / 0.8, c > 1.55);
      label(S, c < 1.2 ? 'dây phơi phía trước…' : c < 2.6 ? 'Space CÚI RẠP!' : '✅ chui qua', c >= 2.6 ? '#7dff8a' : c >= 1.2 ? '#ff6b5a' : '#ffd54a');
    } },
  // ---- ③ cao trào cuối ----
  { s: 3, name: '🚧 Hàng xe dừng chờ cầu + barie đang hạ', how: '200 m trước cầu cất: xe cộ dừng thành hàng chờ cầu, barie hạ dần chỉ chừa 1 khe. Lách qua khe ở tốc độ cao — giảm tốc là không đủ đà bay qua cầu.',
    setup(S) {
      road(S, 10); S.x.B = myBike(S);
      const R = makeRng(5);
      [[-3.3, 30], [-3.3, 36.5], [-3.3, 43], [0.9, 32], [0.9, 38.5], [3.4, 29], [3.4, 35.5], [3.4, 42]].forEach(([x, z]) => { const car = makeCar(R.pick([0xc0392b, 0x2c3e50, 0xecf0f1, 0x7f8c8d, 0x2980b9]), R.pick(['sedan', 'suv', 'taxi'])); car.position.set(x, 0, z); S.scene.add(car); });
      const arm = new THREE.Group(); for (let i = 0; i < 6; i++) { const s = box(0.62, 0.14, 0.14, i % 2 ? 0xffffff : 0xe03a2a); s.position.set(-0.31 - i * 0.62, 0, 0); arm.add(s); }
      arm.position.set(4.6, 1.05, 52); S.scene.add(arm); S.x.arm = arm;
      const post = box(0.3, 1.1, 0.3, 0xe8e4da); post.position.set(4.7, 0.55, 52); S.scene.add(post);
    },
    run(S, t) {
      const c = t % 5, B = S.x.B, z = 12 + c * 14;
      const lat = c < 1.0 ? -1.2 : c < 1.8 ? lerp(-1.2, -1.2, 0) : c < 2.6 ? lerp(-1.2, 2.2, ease((c - 1.8) / 0.8)) : c < 3.2 ? lerp(2.2, -1.4, ease((c - 2.6) / 0.6)) : -1.4;
      B.g.position.set(lat, 0, z); B.g.rotation.z = c > 1.8 && c < 3.2 ? (c < 2.6 ? -0.16 : 0.16) : 0;
      S.x.arm.rotation.z = -Math.min(1.35, c * 0.38) + 1.35 - 1.35 * clamp(c / 3.5);
      datSwing(B);
      chase(S, lat * 0.5, z, 1.8, 8, 4.2);
      qte(S, null);
      label(S, c < 1.8 ? 'xe dừng chờ cầu — tìm khe…' : c < 3.6 ? '↔️ lách khe, KHÔNG nhả ga' : '✅ qua barie — lên cầu!', c >= 3.6 ? '#7dff8a' : '#ffd54a');
    } },
  { s: 3, name: '🛫 Bốc đầu đúng lúc ở mép cầu', how: 'Chạy lên nửa cầu đang dựng: tới gần mép hiện Space — bấm đúng lúc thì xe bốc đầu, bay cao, qua tới nửa bên kia. Lượt 2: không bấm → bay thấp, hụt mép, rớt sông.',
    setup(S) {
      S.scene.background = new THREE.Color(0x1b2030);
      const river = box(80, 0.1, 40, 0x1d4e75); river.position.set(0, -3, 0); S.scene.add(river);
      const near = new THREE.Group(), far = new THREE.Group();
      const leaf = (g, dir) => { const m = box(6, 0.4, 14, 0x6b6f75); m.position.set(0, 0, dir * 7); g.add(m); for (const x of [-3.1, 3.1]) { const r = box(0.12, 0.8, 14, 0xe3b33a); r.position.set(x, 0.5, dir * 7); g.add(r); } };
      leaf(near, -1); leaf(far, 1);
      near.position.set(0, 0, -1.2); far.position.set(0, 0, 1.2);
      S.scene.add(near, far); S.x.near = near; S.x.far = far;
      for (const z of [-30, 30]) { const r = box(6, 0.2, 18, 0x3b3e45); r.position.set(0, -0.1, z + Math.sign(z) * -1); S.scene.add(r); }
      S.x.B = myBike(S);
    },
    run(S, t) {
      const c = t % 5, lap = Math.floor(t / 5) % 2, B = S.x.B, a = 0.42;
      S.x.near.rotation.x = a; S.x.far.rotation.x = -a;
      const L = 14, tipZ = -1.2 - L * Math.cos(a) + L * Math.cos(a), tipY = L * Math.sin(a);
      let z, y, pitch = 0;
      const climb = clamp((c - 0.4) / 1.1);
      if (c < 0.4) { z = -1.2 - L * Math.cos(a) - 8 + c * 20; y = 0; }
      else if (c < 1.5) { z = -1.2 - L * Math.cos(a) + climb * L * Math.cos(a); y = climb * tipY; pitch = a; }
      else {
        const f = c - 1.5, good = lap === 0, vy = good ? 9.5 : 4, vz = good ? 9 : 6;
        z = -1.2 + f * vz; y = tipY + vy * f - 9 * f * f; pitch = Math.atan2(vy - 18 * f, vz) * 0.7;
        const farSurf = z > 1.2 && z < 1.2 + L ? (1.2 + L * Math.cos(a) - z) * Math.tan(a) : null;
        if (good && farSurf != null && y < farSurf) { y = farSurf; pitch = -a; }
        if (!good) y = Math.max(-3, y);
      }
      B.g.position.set(0, y, z);
      B.g.rotation.set(-pitch - (c > 1.35 && c < 1.9 && lap === 0 ? 0.35 : 0), 0, 0);
      datSwing(B);
      side(S, 0, 2, 22, 4);
      S.cam.lookAt(0, 3, 0);
      qte(S, c > 1.0 && c < 1.7 ? 'Space' : null, 'BỐC ĐẦU!', 1 - (c - 1.0) / 0.5, lap === 0 && c > 1.35);
      label(S, c < 1 ? 'lên dốc cầu…' : lap === 0 ? (c < 1.7 ? 'Space BỐC ĐẦU ở mép!' : '✅ bay cao — tới nửa bên kia') : c < 1.7 ? '(không bấm)…' : '💦 bay thấp — rớt sông', lap === 1 && c > 1.7 ? '#ff6b5a' : lap === 0 && c > 1.7 ? '#7dff8a' : '#ffd54a');
    } },
  { s: 3, name: '🛑 Đáp xuống → PHANH GẤP', how: 'Bánh chạm đất ở tốc độ cao, 70 m trước mặt là đường cụt: rào + container. Hiện Space PHANH! (cửa ~0,8 giây): khóa bánh, trượt dài, dừng sát rào = THẮNG. Lượt 2: trễ → tông rào = thua, chơi lại đoạn cầu.',
    setup(S) {
      road(S, 8, 200, -40);
      const ct = box(12, 2.6, 2.6, 0x1d5fa8); ct.position.set(0, 1.3, 78); S.scene.add(ct);
      for (let i = 0; i < 6; i++) { const r = box(1.2, 1.0, 0.25, i % 2 ? 0xffffff : 0xe03a2a); r.position.set(-3 + i * 1.2, 0.5, 74); S.scene.add(r); }
      S.x.B = myBike(S);
      S.x.puffs = [0, 1, 2, 3, 4, 5].map(() => { const p = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshStandardMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0 })); S.scene.add(p); return p; });
    },
    run(S, t) {
      const c = t % 6, lap = Math.floor(t / 6) % 2, B = S.x.B, v0 = 30;
      const tb = lap === 0 ? 0.55 : 1.55; // lúc bấm phanh (sau khi chạm đất)
      let z, slide = false;
      if (c < tb) z = c * v0;
      else { const f = c - tb, stopT = v0 / 18; z = tb * v0 + v0 * Math.min(f, stopT) - 9 * Math.min(f, stopT) ** 2; slide = f < stopT; }
      const crash = z > 72.6;
      if (crash) z = 72.6;
      B.g.position.set(0, 0, z);
      B.g.rotation.set(crash ? -0.5 : 0, slide ? 0.25 : 0, crash ? 0.9 : slide ? 0.12 : 0);
      S.x.puffs.forEach((p, i) => { const age = (c * 6 + i) % 6 / 6; p.position.set((i % 2 ? 0.3 : -0.3), 0.3 + age * 0.6, z - 0.8 - age * 3); p.material.opacity = slide ? 0.5 * (1 - age) : 0; p.scale.setScalar(0.6 + age); });
      datSwing(B);
      chase(S, 0, z, 2.2, 9, 4.2);
      qte(S, c < 0.8 || (lap === 1 && c < 1.6) ? 'Space' : null, 'PHANH!', 1 - c / 0.8, lap === 0 && c > tb);
      label(S, c < tb ? (lap === 0 ? '🛬 chạm đất — PHANH!' : '🛬 chạm đất… (chưa bấm)') : crash ? '💥 trễ — tông rào, chơi lại đoạn cầu' : z > 70 || !slide ? '✅ dừng sát rào — THẮNG!' : 'Space khóa bánh, trượt dài…', crash ? '#ff6b5a' : !slide && c > tb ? '#7dff8a' : '#ffd54a');
    } },
];

// ---------- dựng trang ----------
const cols = { 1: document.getElementById('s1'), 2: document.getElementById('s2'), 3: document.getElementById('s3') };
const views = CARDS.map((cd) => {
  const fig = document.createElement('figure');
  fig.innerHTML = `<figcaption><b>${cd.name}</b><small>${cd.how}</small></figcaption>`;
  cols[cd.s].append(fig);
  return { cd, S: panel(fig, cd.setup) };
});
let last = performance.now(), T = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  for (const v of views) { v.cd.run(v.S, T); v.S.renderer.render(v.S.scene, v.S.cam); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
