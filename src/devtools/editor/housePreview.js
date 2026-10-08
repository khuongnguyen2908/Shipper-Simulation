// Khung xem trước 3D nhà của địa điểm trong công cụ (dùng đúng hàm dựng nhà của game: buildPlace).
// Bộ vẽ WebGL riêng (khung xem trước NPC dùng bộ khác) — tạo 1 lần, dùng lại cho mọi lần mở.
import * as THREE from 'three';
import { buildPlace } from '../../world/placeBuildings.js';
import { lookOf, lookFloors } from '../../data/looks.js';
import { lotInfo } from '../../sim/cityLayout.js';
import { hashStr } from '../../sim/people.js';

const W = 300, H = 220;
let renderer = null, scene, camera, pivot, raf = 0;

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x445566, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(30, 50, 40);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a4558 }));
  floor.position.y = -0.02;
  scene.add(floor);
  pivot = new THREE.Group();
  scene.add(pivot);
  camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 500);
}

// Gỡ hình cũ (hình nhà dựng mới mỗi lần → trả bộ nhớ)
function clear() {
  for (const o of [...pivot.children]) {
    pivot.remove(o);
    o.traverse((m) => {
      if (!m.isMesh) return;
      if (!m.geometry.userData.shared) m.geometry.dispose();
    });
  }
}

// Trả về { el, show(place, items, map) } — place: dữ liệu thô từ places.json
export function housePreview() {
  if (!renderer) setup();
  const host = document.createElement('div');
  host.className = 'house-prev';
  host.title = 'Xem trước nhà (tự xoay) — đúng hình trong game';
  host.append(renderer.domElement);
  const show = (p, items, map) => {
    clear();
    // chưa đặt trên bản đồ → xem trước như nhà 1 lô mặt phố
    const placed = Array.isArray(p.block) && typeof p.lot === 'string';
    const info = placed ? lotInfo(p.block[0], p.block[1], p.lot, p.face, map) : lotInfo(0, 0, 'N1', null, map);
    if (!info) return;
    const r = { x0: info.x0 + 0.25, x1: info.x1 - 0.25, z0: info.z0 + 0.25, z1: info.z1 - 0.25 };
    const ns = info.face === 'N' || info.face === 'S';
    const b = buildPlace({
      look: lookOf(p), W: ns ? r.x1 - r.x0 : r.z1 - r.z0, D: ns ? r.z1 - r.z0 : r.x1 - r.x0, floors: lookFloors(p), color: p.color, signBg: p.signBg, sign: p.sign, short: p.short, kind: p.kind,
      menu: (p.menu || []).map((id) => items?.[id]?.name).filter(Boolean), seed: hashStr(p.id), inAlley: info.inAlley,
    });
    for (const m of b.glow) m.emissiveIntensity = m.userData.glowBase ?? 0.15;
    // đặt tâm nhà vào giữa khung, camera lùi theo cỡ nhà
    const box = new THREE.Box3().setFromObject(b.group), c = box.getCenter(new THREE.Vector3());
    b.group.position.set(-c.x, 0, -c.z);
    pivot.add(b.group);
    const rad = box.getBoundingSphere(new THREE.Sphere()).radius;
    const d = (rad / Math.sin((15 * Math.PI) / 180)) * 0.85;
    camera.position.set(0, c.y + d * 0.35, d);
    camera.lookAt(0, c.y * 0.8, 0);
  };
  cancelAnimationFrame(raf);
  pivot.rotation.y = 0.5;
  const loop = () => {
    if (!host.isConnected) return; // đã rời trang địa điểm này → dừng vẽ
    pivot.rotation.y += 0.008;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return { el: host, show };
}
