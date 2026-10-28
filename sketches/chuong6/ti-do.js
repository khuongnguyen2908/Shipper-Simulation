// PHÁC HỌA: hành động của Tí Đô (boss chương 6) — đúng mô hình + dáng trong game (models.js makePerson, fightModels.js fighterPose,
// game/fight.js fightPlace: lấy đà / lao húc / choáng / ném gạch). Mỗi ô 1 hành động, chạy lặp. Mở: /sketches/chuong6/ti-do.html
import * as THREE from 'three';
import { makePerson, animatePerson, hipBend } from '../../src/world/models.js';
import { fighterPose } from '../../src/world/fightModels.js';
import { lookOfChar } from '../../src/data/relations.js';
import REL from '../../src/data/relations.json' with { type: 'json' };
import STORY from '../../src/data/story.json' with { type: 'json' };

const LOOK = lookOfChar(REL.characters.tiDo, 'danhNhau');
const F = STORY.foes.tiDo;
const WIND = F.windup ?? 0.8;
// hành động: tên, mô tả, hàm đặt dáng (t = giây trong vòng lặp) → { bend, twist, x (đi tới), y, rz }
const ACTS = [
  ['🛡️ Thủ thế', 'Đứng thủ 2 nắm tay trước mặt, chờ ra đòn', (p, t) => fighterPose(p, { stance: 'fists' })],
  ['🧱 Đỡ đòn', 'Bị đánh trước mặt: 2 cẳng tay che mặt (boss đỡ được, đánh sau lưng / chảo mới phá)', (p) => fighterPose(p, { stance: 'fists', block: true })],
  ...F.moves.map((mv, i) => [`👊 Đòn ${i + 1}: ${({ jab: 'đấm thẳng tay trước', cross: 'đấm thẳng tay sau', hook: 'đấm móc ngang', upper: 'móc lên cằm' })[mv] || mv}`,
    `Lấy đà ${WIND} giây rồi ra đòn (combo lần lượt: ${F.moves.join(' → ')})`,
    (p, t) => { const c = t % 2.2; return c < WIND ? fighterPose(p, { stance: 'fists', wind: { move: mv, k: c / WIND } }) : fighterPose(p, { stance: 'fists', hit: { move: mv, t: c - WIND } }); }]),
  ['🐂 Lấy đà húc', `Cúi đầu, dậm chân ${F.charge.wind} giây (thấy là né / núp sau container)`, (p, t) => { p.armL.rotation.x = p.armR.rotation.x = -0.6; return { bend: 0.38, twist: 0, y: Math.abs(Math.sin(t * 12)) * 0.05 }; }],
  ['💨 Lao húc', `Cắm đầu lao ${F.charge.speed} m/giây, xa tới ${F.charge.dist} m — trúng mất ${F.charge.dmg} máu`, (p, t) => { p.armL.rotation.x = p.armR.rotation.x = -1.25; p.elbowL.rotation.x = p.elbowR.rotation.x = -0.5; return { bend: 0.55, twist: 0, run: true, x: ((t * 1.6) % 2.4) - 1.2 }; }],
  ['😵 Choáng', `Húc trượt đâm container: đứng lảo đảo ${F.charge.stun} giây — đánh lúc này mạnh gấp rưỡi`, (p, t) => ({ bend: 0.1, twist: 0, rz: Math.sin(t * 6) * 0.08 })],
  ['😡 Nổi điên — ném gạch', `Còn ${F.rage * 100}% máu: gọi đàn em + cứ ${F.throw.every} giây vác gạch ném (${F.throw.dmg} máu)`, (p, t) => { const c = t % 1.6, k = Math.min(1, c / 0.55); p.armR.rotation.x = c < 0.55 ? -2.7 * k : -2.7 + Math.min(1, (c - 0.55) / 0.2) * 3.2; p.elbowR.rotation.x = c < 0.55 ? -1.1 * k : -0.2; return { bend: c < 0.55 ? -0.15 * k : 0.25, twist: c < 0.55 ? 0.5 * k : -0.3 }; }],
  ['🏃 Đuổi theo', `Chạy ${F.speed} m/giây tới gần rồi mới ra đòn`, () => ({ run: true })],
];

const wrap = document.querySelector('.wrap');
const views = ACTS.map(([name, note, fn]) => {
  const fig = document.createElement('figure');
  const canvas = document.createElement('canvas');
  fig.append(canvas, Object.assign(document.createElement('figcaption'), { innerHTML: `${name}<small>${note}</small>` }));
  wrap.append(fig);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(260, 300, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1e2128);
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x40383a, 1.6));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.2); sun.position.set(-2, 4, 3); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5f6268, roughness: 1 }));
  scene.add(floor);
  const m = makePerson(LOOK);
  m.rotation.y = 0.55; // nghiêng 3/4 cho thấy dáng
  scene.add(m);
  const cam = new THREE.PerspectiveCamera(36, 260 / 300, 0.05, 50);
  cam.position.set(1.6, 2.0, 4.6);
  cam.lookAt(0, 1.15, 0);
  return { renderer, scene, cam, m, fn, phase: 0 };
});

let last = performance.now(), T = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  for (const v of views) {
    const p = v.m.userData.parts;
    p.armR.rotation.set(0, 0, p.armZ ?? 0); p.armL.rotation.set(0, 0, -(p.armZ ?? 0));
    p.elbowL.rotation.x = p.elbowR.rotation.x = 0;
    const probe = v.fn(p, T) || {}; // dáng thử để biết có chạy không
    v.phase += probe.run ? dt * 9 : 0;
    animatePerson(v.m, v.phase, probe.run ? 1 : 0); // chân (chạy / đứng) — làm trước, rồi đặt lại dáng tay + thân
    p.armR.rotation.set(0, 0, p.armZ ?? 0); p.armL.rotation.set(0, 0, -(p.armZ ?? 0));
    const r = v.fn(p, T) || {};
    hipBend(p, r.bend || 0, 0, r.twist || 0);
    v.m.position.set(r.x || 0, r.y || 0, 0);
    v.m.rotation.z = r.rz || 0;
    if (r.lunge) v.m.position.z += r.lunge;
    v.renderer.render(v.scene, v.cam);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
