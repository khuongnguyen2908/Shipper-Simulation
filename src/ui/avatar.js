// Avatar 3D trong bảng "Đang mặc" (mở app Túi đồ): dựng người bằng đúng hàm của game, tự xoay, kéo chuột để xoay.
// Một bộ vẽ WebGL riêng, nhỏ; chỉ vẽ khi bảng đang hiện (ẩn bảng → dừng vòng vẽ).
import * as THREE from 'three';
import { makePerson } from '../world/models.js';

const W = 150, H = 210;

export function createAvatar() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W, H);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshStandardMaterial({ color: 0x3a4558 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
  camera.position.set(0, 1.12, 3.9);
  camera.lookAt(0, 0.98, 0);

  const el = renderer.domElement;
  el.className = 'op-canvas';
  let person = null, lookKey = '', angle = 0.4, raf = 0, drag = null;

  // kéo chuột / ngón tay để xoay; thả ra thì tự xoay tiếp
  el.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, a: angle };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => { if (drag) angle = drag.a + (e.clientX - drag.x) * 0.02; });
  const up = () => (drag = null);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);

  const loop = () => {
    if (!drag) angle += 0.01;
    if (person) person.rotation.y = angle;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };

  return {
    el,
    // look: tham số makePerson (outfitLook(...)); cùng ngoại hình thì không dựng lại
    show(look) {
      const key = JSON.stringify(look);
      if (key === lookKey) return;
      lookKey = key;
      if (person) scene.remove(person);
      person = makePerson({ ...look, bag: false });
      scene.add(person);
    },
    start() { if (!raf) raf = requestAnimationFrame(loop); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}
