// Khung xem trước NPC 3D trong công cụ (dùng đúng hàm dựng người của game).
// Chỉ một bộ vẽ WebGL dùng chung cho mọi lần mở, để không hết "ngữ cảnh" WebGL của trình duyệt.
import * as THREE from 'three';
import { makePerson, npcLook } from '../../world/models.js';
import { colorsToNumbers } from '../../data/balance.js';

const W = 170, H = 230;
let renderer = null, scene, camera, person = null, raf = 0, angle = 0.5;

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W, H);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshStandardMaterial({ color: 0x3a4558 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 50);
  camera.position.set(0, 1.35, 4.8);
  camera.lookAt(0, 1.15, 0);
}

// Trả về { el, update(npc) }. npc là dữ liệu thô từ places.json (màu dạng "#rrggbb").
export function personPreview(id) {
  if (!renderer) setup();
  const host = document.createElement('div');
  host.className = 'person-prev';
  host.title = 'Xem trước (tự xoay)';
  host.append(renderer.domElement);
  const update = (npc) => {
    if (person) scene.remove(person);
    person = makePerson(npcLook(id, colorsToNumbers(npc)));
    scene.add(person);
    // camera lùi/tiến theo vóc người để luôn thấy trọn người
    const k = npc.scale || 1;
    camera.position.set(0, 1.15 * k, 3.3 * k + 0.4);
    camera.lookAt(0, 0.98 * k, 0);
  };
  cancelAnimationFrame(raf);
  const loop = () => {
    if (!host.isConnected) return; // đã rời trang NPC này → dừng vẽ
    angle += 0.012;
    if (person) person.rotation.y = angle;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return { el: host, update };
}
