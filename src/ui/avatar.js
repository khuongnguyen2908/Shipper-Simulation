// Avatar 3D: bảng "Đang mặc" (app Túi đồ, cỡ nhỏ mặc định) và màn tạo nhân vật (cỡ to): dựng người bằng đúng hàm của game,
// tự xoay, kéo chuột để xoay. Một bộ vẽ WebGL riêng; chỉ vẽ khi đang hiện (ẩn → dừng vòng vẽ).
// view: 'full' toàn thân · 'face' cận mặt (soi kiểu tóc) — máy quay trượt êm giữa 2 góc.
import * as THREE from 'three';
import { makePerson, setPersonDetail } from '../world/models.js';

// Góc máy: vị trí + điểm nhìn
const VIEWS = { full: { pos: [0, 1.05, 3.6], at: [0, 0.9, 0] }, face: { pos: [0, 1.62, 1.05], at: [0, 1.58, 0] } };

const _v = new THREE.Vector3();
export function createAvatar({ width: W = 150, height: H = 210 } = {}) {
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
  const cam = { pos: new THREE.Vector3(...VIEWS.full.pos), at: new THREE.Vector3(...VIEWS.full.at) };
  let view = 'full';
  camera.position.copy(cam.pos);
  camera.lookAt(cam.at);

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
    const v = VIEWS[view];
    cam.pos.lerp(_v.set(...v.pos), 0.15);
    cam.at.lerp(_v.set(...v.at), 0.15);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.at);
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
      person.userData.keepDetail = true; // ô xem nhân vật: luôn chi tiết
      setPersonDetail(person, false); // (chọn "người đơn giản" thì người mới dựng ở dạng đơn giản → đổi lại ngay)
      scene.add(person);
    },
    setView(v) { view = VIEWS[v] ? v : 'full'; },
    get view() { return view; },
    start() { if (!raf) raf = requestAnimationFrame(loop); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}
