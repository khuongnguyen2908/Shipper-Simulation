// =============================================================
// Chụp DẢI PHỐ DÀI từ game thật cho màn loading lớn (public/loading/pano.webp).
// Chỉ dùng lúc làm nội dung: mở game với ?debug, bấm F12 gõ  await panorama()  → tải file về, chép vào public/loading/
// rồi chép mảng "people" in ra vào src/data/loading.json → pano.people (chỗ khách đứng để bật bong bóng "Anh shipper ơi").
// Camera thẳng góc (không xa gần) nhìn ngang qua 1 con đường, chụp từng khung rồi ghép → các khung khớp mép tuyệt đối.
// Nền trời trong suốt (màn loading tự vẽ trời chiều), xe cộ chạy được giấu (ảnh đứng yên mà xe đứng giữa đường thì kỳ).
// =============================================================
import * as THREE from 'three';
import { CITY, roadPos } from '../sim/cityLayout.js';
import { makePerson } from '../world/models.js';

// line: đường chạy dọc trục x (nằm ở z = roadPos(line)) · from / to: từ ngã tư số mấy tới số mấy (nối liền 2 đầu ở ngã tư cho chỗ lặp lại tự nhiên)
// minutes: giờ trong ngày (ánh nắng) · pxPerM: số điểm ảnh / mét · pitch: góc cúi nhìn xuống (radian)
// Chụp liền một mạch (không nhường khung hình): vòng lặp game không kịp chạy xen vào làm xe hiện lại / đổi chỗ giữa các khung.
export function capturePanorama(g, { line = 3, from = 0, to = CITY.N, minutes = 17 * 60, customers = 14, pxPerM = 24, frameM = 26, pitch = 0.32, topY = 20, backM = 16 } = {}) {
  const roadZ = roadPos(line), half = CITY.ROAD / 2;
  const x0 = roadPos(from), x1 = roadPos(to), len = x1 - x0;
  const nFrames = Math.ceil(len / frameM);
  const fw = Math.round(frameM * pxPerM);
  // khung dọc: từ mép đường phía gần (đáy ảnh) tới nóc nhà phía xa (đỉnh ảnh)
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const D = 60; // camera lùi xa sau đường (mặt phẳng cắt gần bỏ hết nhà phía mình)
  const camZ = roadZ + D;
  const camY = 10; // chọn đại, khung dọc tự dời cho vừa
  const vOf = (y, z, cy) => (y - cy) * cp - (z - camZ) * sp; // tọa độ dọc trên ảnh (mét) của điểm (y, z)
  const vBottom = (cy) => vOf(0, roadZ + half, cy), vTop = (cy) => vOf(topY, roadZ - half - backM, cy);
  const vb = vBottom(camY), vt = vTop(camY);
  const heightM = vt - vb, fh = Math.round(heightM * pxPerM);
  const mid = (vb + vt) / 2;

  const cam = new THREE.OrthographicCamera(-frameM / 2, frameM / 2, heightM / 2 + mid, -heightM / 2 + mid, camY * sp + (D - half - 0.4) * cp, camY * sp + (D + half + backM) * cp);
  // mặt cắt gần: ngay mép đường phía mình · mặt cắt xa: hết dãy nhà mặt tiền phía bên kia (đất / đường phía sau không lộ lên trên mái nhà thấp)
  cam.rotation.set(-pitch, 0, 0, 'YXZ');

  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(fw, fh, false);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = g.renderer.toneMapping;
  r.toneMappingExposure = g.renderer.toneMappingExposure;
  r.outputColorSpace = g.renderer.outputColorSpace;
  r.setClearColor(0x000000, 0);

  // giấu xe cộ đang chạy, người chơi, xe của mình, vòng chỉ đường…
  const hide = [g.sky.dome, g.sky.rain?.mesh, g.bike.mesh, g.walker.mesh, g.beacon, g.zoneRing, g.questMark, g.traffic.jamCarMesh, g.traffic.jamMotoMesh,
    ...g.traffic.agents.map((a) => a.mesh), ...(g.traffic.loopCars || []).map((a) => a.mesh), ...(g.traffic.buses || []).map((b) => b.mesh), ...(g.bgTraffic?.view?.parts || [])]
    .filter(Boolean).map((m) => [m, m.visible]);
  for (const [m] of hide) m.visible = false;
  const bg = g.scene.background, fog = g.scene.fog;

  // khách đứng vỉa hè phía bên kia giơ tay vẫy shipper (chỉ có trong ảnh, chụp xong bỏ) — tránh ngã tư
  const SHIRTS = [0xef4444, 0x3b82f6, 0xf59e0b, 0xec4899, 0x14b8a6, 0xa855f7, 0xf8fafc, 0x22c55e];
  const added = [];
  const inCross = (x) => Array.from({ length: CITY.N + 1 }, (_, i) => roadPos(i)).some((rx) => Math.abs(x - rx) < half + 3);
  for (let k = 0; k < customers; k++) {
    const x = x0 + ((k + 0.5) / customers) * len + Math.sin(k * 7.3) * 4;
    if (inCross(x)) continue;
    const p = makePerson({ shirt: SHIRTS[k % SHIRTS.length], pants: [0x2c3e50, 0x1f2937, 0x6b4a2b][k % 3], gender: k % 2 ? 'f' : 'm', sleeves: 'short', shorts: k % 3 === 0 });
    p.position.set(x, 0, roadZ - half - 1.1);
    const parts = p.userData.parts;
    if (parts) { parts.armR.rotation.x = -2.6; parts.armR.rotation.z = 0.35; parts.elbowR.rotation.x = -0.4; } // giơ tay vẫy
    p.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.scene.add(p);
    added.push(p);
  }

  const out = document.createElement('canvas');
  out.width = Math.round(len * pxPerM);
  out.height = fh;
  const ctx = out.getContext('2d');
  for (let i = 0; i < nFrames; i++) {
    const cx = x0 + frameM * (i + 0.5);
    cam.position.set(cx, camY, camZ);
    cam.updateMatrixWorld();
    g.scene.background = bg;
    g.scene.fog = fog;
    g.sky.update(0, minutes, null, { x: cx, z: roadZ }, cam); // nắng + bóng đổ theo khung đang chụp
    g.scene.background = null;
    g.scene.fog = null;
    r.render(g.scene, cam);
    ctx.drawImage(r.domElement, Math.round((cx - frameM / 2 - x0) * pxPerM), 0);
  }
  g.scene.background = bg;
  g.scene.fog = fog;
  for (const [m, v] of hide) m.visible = v;
  for (const p of added) g.scene.remove(p);
  r.dispose();

  // khách vẫy tay → chỗ bật bong bóng thoại (x, y = điểm ảnh trên đầu người)
  const people = added.map((p) => p.position)
    .map((p) => ({ x: Math.round((p.x - x0) * pxPerM), y: Math.round((heightM / 2 + mid - vOf(2.1, p.z, camY)) * pxPerM) }))
    .sort((a, b) => a.x - b.x);
  const url = out.toDataURL('image/webp', 0.82);
  return { url, width: out.width, height: out.height, people, roadTop: Math.round((heightM / 2 + mid - vOf(0, roadZ - half, camY)) * pxPerM) };
}

// Chụp rồi tải file pano.webp về máy + in thông số để chép vào src/data/loading.json → pano
export function savePanorama(g, opts = {}) {
  const r = capturePanorama(g, opts);
  const a = Object.assign(document.createElement('a'), { href: r.url, download: 'pano.webp' });
  a.click();
  const pano = { img: 'pano.webp', width: r.width, height: r.height, roadTop: r.roadTop, pxPerM: opts.pxPerM ?? 24, speed: 12, people: r.people };
  console.log(`Chép pano.webp vào public/loading/, rồi thay "pano" trong src/data/loading.json bằng:\n${JSON.stringify(pano, null, 2)}`);
  return pano;
}

// Ảnh xe + người lái nhìn ngang (đầu xe bên phải) từ game thật cho màn loading: nhiều khung, mỗi khung bánh xe quay thêm 1 chút
// → màn loading lật khung liên tục là thấy bánh quay. Cần đang ngồi trên xe, đầu xe chỉ hướng +x (đông) để camera nhìn ngang từ phía nam.
// period: góc lặp lại của mâm (mâm 5 chấu = 2π/5) để khung cuối nối khung đầu không bị giật.
export function captureRider(g, { frames = 6, pxPerM = 110, widthM = 2.8, heightM = 2.1, period = (Math.PI * 2) / 5 } = {}) {
  if (g.mode !== 'bike') throw new Error('Lên xe trước (phím F) rồi chụp');
  const b = g.bike, ud = b.mesh.userData;
  const fw = Math.round(widthM * pxPerM), fh = Math.round(heightM * pxPerM);
  const keep = new Set([b.mesh, g.walker.mesh]);
  const hide = g.scene.children.filter((o) => !keep.has(o) && !o.isLight && o.visible).map((o) => [o, o.visible]);
  for (const [o] of hide) o.visible = false;
  const bg = g.scene.background, fog = g.scene.fog, rf = ud.wheelF.rotation.x, rr = ud.wheelR.rotation.x;
  g.scene.background = null;
  g.scene.fog = null;
  const p = b.mesh.position;
  const cam = new THREE.OrthographicCamera(-widthM / 2, widthM / 2, heightM, 0, 0.1, 40);
  cam.position.set(p.x - 0.05, p.y - 0.06, p.z + 12);
  cam.updateMatrixWorld();
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(fw, fh, false);
  r.toneMapping = g.renderer.toneMapping;
  r.toneMappingExposure = g.renderer.toneMappingExposure;
  r.outputColorSpace = g.renderer.outputColorSpace;
  r.setClearColor(0x000000, 0);
  const out = document.createElement('canvas');
  out.width = fw * frames;
  out.height = fh;
  const ctx = out.getContext('2d');
  for (let f = 0; f < frames; f++) {
    ud.wheelF.rotation.x = rf - (f / frames) * period; // xe chạy tới → bánh quay theo chiều kim đồng hồ khi nhìn từ bên phải
    ud.wheelR.rotation.x = rr - (f / frames) * period;
    r.render(g.scene, cam);
    ctx.drawImage(r.domElement, f * fw, 0);
  }
  ud.wheelF.rotation.x = rf;
  ud.wheelR.rotation.x = rr;
  g.scene.background = bg;
  g.scene.fog = fog;
  for (const [o, v] of hide) o.visible = v;
  r.dispose();
  return { url: out.toDataURL('image/webp', 0.9), frames, width: fw, height: fh };
}
