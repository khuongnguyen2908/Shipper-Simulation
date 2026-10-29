// PHÁC HỌA: Tí Đô 3 giai đoạn — mỗi giai đoạn 1 vòng đòn cố định; mọi cảnh báo 1 màu đỏ (lóe đỏ / vệt đỏ / vòng đỏ), phân biệt đòn bằng dáng
// + người chơi giả (xám) để thấy phải đỡ / né / dụ húc. Đúng mô hình + dáng game. Mở: /sketches/chuong6/ti-do-phase.html
import * as THREE from 'three';
import { makePerson, animatePerson, hipBend } from '../../src/world/models.js';
import { fighterPose } from '../../src/world/fightModels.js';
import { lookOfChar } from '../../src/data/relations.js';
import REL from '../../src/data/relations.json' with { type: 'json' };

const LOOK = lookOfChar(REL.characters.tiDo, 'danhNhau');
const ME = { gender: 'm', shirt: 0x8a8f96, pants: 0x55595e, hair: 0x1b1b1b, skin: 0xc9c9c9, hairStyle: 'short', faceStyle: 'chinhNam' };
const ease = (x) => x * x * (3 - 2 * x);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// ---------- cảnh 1 ô ----------
function panel(fig, setup) {
  const canvas = document.createElement('canvas');
  fig.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(300, 250, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2027);
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x40383a, 1.5));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.0); sun.position.set(-3, 5, 4); scene.add(sun);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(16, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5c5f65, roughness: 1 })));
  const cam = new THREE.PerspectiveCamera(42, 300 / 250, 0.1, 60);
  cam.position.set(4.2, 4.4, 6.6); cam.lookAt(0.3, 0.9, 0);
  const boss = makePerson(LOOK);
  const me = makePerson(ME);
  scene.add(boss, me);
  const S = { renderer, scene, cam, boss, me, bp: 0, mp: 0, extra: {} };
  setup?.(S);
  return S;
}
// đặt dáng mỗi khung: r = { bx, bz, bh (hướng), bend, twist, run, by, rz, mx, mz, mh, mRun, mBlock, mDodge }
function pose(S, dt, r) {
  for (const [m, run, ph] of [[S.boss, r.run, 'bp'], [S.me, r.mRun, 'mp']]) {
    const p = m.userData.parts;
    S[ph] += run ? dt * 10 : 0;
    animatePerson(m, S[ph], run ? 1 : 0);
    p.armR.rotation.set(0, 0, p.armZ ?? 0); p.armL.rotation.set(0, 0, -(p.armZ ?? 0)); p.elbowL.rotation.x = p.elbowR.rotation.x = 0;
  }
  const bp = S.boss.userData.parts, mp = S.me.userData.parts;
  const fb = r.arms ? (r.arms(bp), { bend: r.bend ?? 0, twist: r.twist ?? 0 }) : (fighterPose(bp, r.fp || { stance: 'fists' }) || {});
  hipBend(bp, r.bend ?? fb.bend ?? 0, 0, r.twist ?? fb.twist ?? 0);
  S.boss.position.set(r.bx ?? -1.6, r.by ?? 0, r.bz ?? 0);
  S.boss.rotation.set(0, r.bh ?? Math.PI / 2, r.rz ?? 0);
  const fm = fighterPose(mp, { stance: 'fists', block: !!r.mBlock, hit: r.mHit }) || {};
  hipBend(mp, fm.bend ?? 0, 0, fm.twist ?? 0);
  S.me.position.set(r.mx ?? 1.4, 0, r.mz ?? 0);
  S.me.rotation.set(0, r.mh ?? -Math.PI / 2, r.mrz ?? 0);
  S.renderer.render(S.scene, S.cam);
}
const label = (S, text, color = '#ffd54a') => { S.extra.tag ||= Object.assign(document.createElement('div'), { className: 'tag' }); S.extra.tag.textContent = text; S.extra.tag.style.color = color; };

// vật dùng lại: vệt đỏ đường húc, vòng sóng, hào quang đỏ, container, sao choáng, viên gạch
const strip = () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.5, depthWrite: false })); m.position.y = 0.02; return m; };
const ringMesh = () => new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
const aura = () => new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.3, 20, 1, true).translate(0, 1.15, 0), new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
const container = () => { const m = new THREE.Mesh(new THREE.BoxGeometry(2.44, 2.6, 6.06), new THREE.MeshStandardMaterial({ color: 0x1d5fa8, roughness: 0.8 })); m.position.set(3.6, 1.3, 0); m.rotation.y = Math.PI / 2; return m; };
const stars = () => { const g = new THREE.Group(); for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: 0xffe066 })); s.userData.a = (i / 5) * Math.PI * 2; g.add(s); } g.visible = false; return g; };
const spinStars = (g, t, x, y, z) => { g.position.set(x, y, z); for (const s of g.children) { const a = s.userData.a + t * 4; s.position.set(Math.cos(a) * 0.35, Math.sin(t * 6 + s.userData.a) * 0.05, Math.sin(a) * 0.35); } };

// ---------- các ô ----------
const P1 = 'Giai đoạn 1 · Đấm thường', P2 = 'Giai đoạn 2 · Húc trâu', P3 = 'Giai đoạn 3 · Nổi điên';
const CARDS = [
  { ph: 1, name: '👊 Combo đấm thẳng → móc (bước 1)', how: 'Lấy đà chậm 0,8 giây. Người chơi giữ chuột phải ĐỠ, đỡ xong đánh trả ngay (Tí Đô chưa đỡ đòn).', run(S, t, dt) {
    const c = t % 3.2, mv = c < 1.6 ? 'jab' : 'hook', k = c % 1.6;
    pose(S, dt, { fp: k < 0.8 ? { stance: 'fists', wind: { move: mv, k: k / 0.8 } } : { stance: 'fists', hit: { move: mv, t: k - 0.8 } }, bx: -0.4, mx: 0.9, mBlock: k > 0.55 && k < 1.25 });
    label(S, k > 0.55 && k < 1.25 ? '🛡️ ĐỠ!' : k > 1.25 ? '⚔️ đánh trả' : '…lấy đà', k > 1.25 ? '#7dff8a' : '#ffd54a');
  } },
  { ph: 1, name: '😤 Khựng 1,5 giây (bước 2)', how: 'Combo xong luôn khựng 1,5 giây: cửa đánh an toàn, rồi quay lại bước 1. 2 đàn em đứng hò hét, chưa vào.', run(S, t, dt) {
    const c = t % 2.6;
    pose(S, dt, { fp: c < 0.6 ? { stance: 'fists', hit: { move: 'cross', t: c } } : null, arms: c >= 0.6 ? (p) => { p.armL.rotation.x = p.armR.rotation.x = 0.3; } : null, bend: c >= 0.6 ? 0.25 : undefined, bx: -0.4, mx: 0.9 });
    label(S, c >= 0.6 ? '✅ hở — đánh!' : 'đòn cuối combo', c >= 0.6 ? '#7dff8a' : '#ffd54a');
  } },
  { ph: 2, name: '🦵 Đạp đẩy (bước 1, khi đứng gần ≤ 2 m)', how: 'Lóe đỏ + dáng NHẤC GỐI 0,6 giây → đạp thẳng bụng, đẩy lùi 2 m. Sau lưng là container / thành tàu thì đập lưng, choáng 1 giây (rồi bị húc tiếp). Né ngang → nó hụt chân, khựng 1 giây.',
    setup(S) { S.extra.a = aura(); S.boss.add(S.extra.a); const w = container(); w.rotation.y = 0; w.position.x = 4.3; S.scene.add(w); S.extra.st = stars(); S.scene.add(S.extra.st); },
    run(S, t, dt) {
      const c = t % 3.4, good = Math.floor(t / 3.4) % 2 === 1, st = S.extra.st;
      const wind = c < 0.6, kick = c >= 0.6 && c < 0.9;
      S.extra.a.material.opacity = wind ? 0.18 + 0.22 * Math.abs(Math.sin(c * 14)) : 0;
      const push = good ? 0 : ease(clamp((c - 0.65) / 0.4));
      const side = good ? ease(clamp((c - 0.4) / 0.25)) : 0;
      const hurt = !good && c >= 1.05 && c < 2.1;
      st.visible = hurt; if (hurt) spinStars(st, t, 0.75 + push * 2.0, 2.0, 0);
      pose(S, dt, { arms: (p) => {
        p.armL.rotation.x = -0.9; p.elbowL.rotation.x = -1.7; p.armR.rotation.x = -0.7; p.elbowR.rotation.x = -1.7;
        const e = wind ? ease(c / 0.6) : 0;
        if (wind) { p.legR.rotation.x = -1.3 * e; p.kneeR.rotation.x = 1.6 * e; }
        else if (kick) { p.legR.rotation.x = -1.45; p.kneeR.rotation.x = 0.1; }
      }, bend: kick ? -0.25 : 0, bx: -0.3, mx: 0.75 + push * 2.0, mz: -side * 1.5, mrz: hurt ? Math.sin(t * 7) * 0.08 : 0 });
      label(S, wind ? '🔴 nhấc gối — đạp!' : good ? (c < 2.2 ? '✅ né ngang: hụt chân, khựng — đánh' : '') : hurt ? '💫 đập lưng container — choáng 1 giây' : kick ? '🦵 đạp!' : '',
        wind ? '#ff6b5a' : good ? '#7dff8a' : hurt ? '#ff6b5a' : '#ffd54a');
    } },
  { ph: 2, name: '🐂 Lao húc (bước 2) + vệt đỏ báo trước', how: 'Dậm chân 1 giây, vệt đỏ hiện đường húc. Không đỡ được — NÉ sang bên (Space).', setup(S) { S.extra.s = strip(); S.scene.add(S.extra.s); }, run(S, t, dt) {
    const c = t % 3.4, s = S.extra.s;
    const wind = c < 1, ch = c >= 1 && c < 1.55, after = c >= 1.55;
    s.visible = c < 1.55; s.scale.set(6, 1, 0.9); s.position.set(-1.9 + 3, 0.02, 0); s.material.opacity = wind ? 0.25 + 0.35 * Math.abs(Math.sin(c * 10)) : 0.15;
    const bx = ch ? -1.9 + (c - 1) / 0.55 * 5.5 : after ? 3.6 : -1.9;
    const dodge = c > 0.7 ? clamp((c - 0.7) / 0.25) : 0;
    pose(S, dt, { arms: wind || ch ? (p) => { p.armL.rotation.x = p.armR.rotation.x = ch ? -1.25 : -0.6; } : null, bend: wind ? 0.38 : ch ? 0.55 : 0.1, by: wind ? Math.abs(Math.sin(c * 12)) * 0.05 : 0, run: ch, bx, mx: 1.4, mz: -ease(dodge) * 1.8 });
    label(S, wind ? '⚠️ vệt đỏ — chuẩn bị NÉ' : ch ? '💨 húc!' : '…hụt', wind ? '#ff6b5a' : '#ffd54a');
  } },
  { ph: 2, name: '💥 Dụ húc vào container → choáng', how: 'Đứng trước container, né lúc cuối → nó đâm vào, choáng 3 giây: đánh mạnh gấp rưỡi. Đây là cách chính để hạ máu ở giai đoạn 2.', setup(S) { S.scene.add(S.extra.c = container()); S.extra.st = stars(); S.scene.add(S.extra.st); S.extra.s = strip(); S.scene.add(S.extra.s); }, run(S, t, dt) {
    const c = t % 5, s = S.extra.s, st = S.extra.st;
    const wind = c < 1, ch = c >= 1 && c < 1.5, daze = c >= 1.5 && c < 4.5;
    s.visible = c < 1.5; s.scale.set(4.8, 1, 0.9); s.position.set(-0.6, 0.02, 0); s.material.opacity = wind ? 0.25 + 0.35 * Math.abs(Math.sin(c * 10)) : 0.15;
    const bx = ch ? -3 + (c - 1) / 0.5 * 5.3 : daze || c >= 4.5 ? 2.3 : -3;
    const dodge = c > 0.85 ? clamp((c - 0.85) / 0.2) : 0;
    st.visible = daze; if (daze) spinStars(st, t, bx, 2.35, 0);
    pose(S, dt, { arms: wind || ch ? (p) => { p.armL.rotation.x = p.armR.rotation.x = ch ? -1.25 : -0.6; } : null, bend: wind ? 0.38 : ch ? 0.55 : 0.1, rz: daze ? Math.sin(t * 6) * 0.08 : 0, run: ch, bx,
      mx: daze ? 1.25 : 2.0, mz: daze ? 0.9 : -ease(dodge) * 1.6, mh: daze ? -Math.PI * 0.75 : -Math.PI / 2, mRun: daze && c < 1.9 });
    label(S, wind ? 'đứng trước container…' : ch ? 'NÉ!' : daze ? '😵 choáng 3 giây — ĐÁNH ×1,5' : '', daze ? '#7dff8a' : '#ffd54a');
  } },
  { ph: 2, name: '🧱 Đỡ đòn trước mặt', how: 'Giai đoạn 2 trở đi Tí Đô che mặt: đánh trước mặt không ăn. Vòng ra sau lưng (×2), dùng CHẢO phá thế đỡ, hoặc chờ nó choáng.', run(S, t, dt) {
    const c = t % 4, back = c > 2;
    pose(S, dt, { fp: { stance: 'fists', block: !back }, bx: -0.3, mx: back ? -1.4 : 0.9, mz: back ? 0.2 : 0, mh: back ? Math.PI / 2 : -Math.PI / 2 });
    label(S, back ? '✅ sau lưng: trúng ×2' : '❌ trước mặt: bị đỡ', back ? '#7dff8a' : '#ff6b5a');
  } },
  { ph: 2, name: '👥 Đàn em xông vào', how: '2 đàn em vào đánh cùng. Anh Đạt chặn 1 tên, người chơi lo tên còn lại + Tí Đô.', run(S, t, dt) {
    const c = t % 3;
    pose(S, dt, { fp: { stance: 'fists' }, bx: -1.8, bz: -0.8, mx: 1.3, mRun: false });
    label(S, 'Tí Đô + 2 đàn em (anh Đạt giữ chân 1 tên)', '#ffd54a');
  } },
  { ph: 3, name: '🔴 Đòn bổ nặng (bước 1) — KHÔNG đỡ được', how: 'Lóe đỏ + dáng GIƠ 2 TAY QUA ĐẦU 0,8 giây → bổ xuống. Đỡ là vẫn mất máu nặng: phải NÉ. Bổ xong hồi sức 1,2 giây: cửa đánh.', setup(S) { S.extra.a = aura(); S.boss.add(S.extra.a); }, run(S, t, dt) {
    const c = t % 3.6, wind = c < 0.8, slam = c >= 0.8 && c < 1.0, rec = c >= 1.0 && c < 2.2;
    S.extra.a.material.opacity = wind ? 0.18 + 0.22 * Math.abs(Math.sin(c * 14)) : 0;
    const up = wind ? ease(c / 0.8) : slam ? 1 - (c - 0.8) / 0.2 : 0;
    const dodge = c > 0.55 ? clamp((c - 0.55) / 0.2) : 0;
    pose(S, dt, { arms: (p) => { p.armL.rotation.x = p.armR.rotation.x = -2.9 * up + (slam || rec ? -0.9 : 0) * (1 - up); p.elbowL.rotation.x = p.elbowR.rotation.x = -0.3 * up; }, bend: slam ? 0.45 : rec ? 0.35 : -0.1 * up, bx: -0.3, mx: 0.9 + ease(dodge) * 0.2, mz: -ease(dodge) * 1.6 });
    label(S, wind ? '🔴 2 tay qua đầu = NÉ!' : rec ? '✅ hồi sức 1,2 giây — đánh' : 'BỔ!', wind ? '#ff6b5a' : rec ? '#7dff8a' : '#ffd54a');
  } },
  { ph: 3, name: '🌊 Dậm đất — vòng sóng', how: 'Dậm chân → vòng sóng đỏ loang ra 3 m quanh nó. Đứng sát là bị hất văng: chạy ra ngoài vòng.', setup(S) { S.extra.r = ringMesh(); S.scene.add(S.extra.r); }, run(S, t, dt) {
    const c = t % 3.2, r = S.extra.r, wind = c < 0.7, wave = c >= 0.7 && c < 1.5;
    r.visible = wind || wave; r.position.set(-0.6, 0.03, 0);
    const rad = wind ? 0.6 : 0.6 + ((c - 0.7) / 0.8) * 2.6; r.scale.set(rad, 1, rad); r.material.opacity = wind ? 0.35 + 0.3 * Math.abs(Math.sin(c * 12)) : 0.85 * (1 - (c - 0.7) / 0.8);
    const out = c > 0.3 ? clamp((c - 0.3) / 0.45) : 0;
    pose(S, dt, { arms: (p) => { p.armL.rotation.x = p.armR.rotation.x = wind ? -0.9 : 0.2; }, bend: wind ? -0.15 : 0.4, by: wind ? 0.12 * Math.sin((c / 0.7) * Math.PI) : 0, bx: -0.6, mx: 0.6 + ease(out) * 2.6, mRun: c > 0.3 && c < 0.75 });
    label(S, wind ? 'giơ chân… CHẠY RA!' : wave ? '🌊 vòng sóng 3 m' : '', wind ? '#ff6b5a' : '#ffd54a');
  } },
  { ph: 3, name: '🦸 Superman punch (bước 2: sau Dậm đất)', how: 'Vừa chạy ra khỏi vòng sóng → lóe đỏ + dáng NHÚN LÙI KÉO TAY RA SAU 0,6 giây rồi bay tới 4–6 m đấm thẳng. Dáng này = đỡ được: bấm ĐỠ ĐÚNG LÚC (cửa 0,35 giây ngay trước khi trúng) → gạt đòn, nó loạng choạng 1,5 giây, đánh ×2. Đỡ sớm = mất hết nấc đỡ. Né ngang cũng được.',
    setup(S) { S.extra.r = ringMesh(); S.scene.add(S.extra.r); S.extra.a = aura(); S.boss.add(S.extra.a); S.extra.st = stars(); S.scene.add(S.extra.st); },
    run(S, t, dt) {
      const c = t % 4.8, r = S.extra.r, st = S.extra.st;
      const stomp = c < 0.8, wind = c >= 0.8 && c < 1.4, fly = c >= 1.4 && c < 1.75, stag = c >= 1.75 && c < 3.25;
      // dậm đất: vòng sóng, người chơi chạy ra tầm trung
      r.visible = stomp; r.position.set(-1.8, 0.03, 0);
      const rad = 0.6 + clamp(c / 0.8) * 2.6; r.scale.set(rad, 1, rad); r.material.opacity = 0.85 * (1 - clamp(c / 0.8));
      const mx = -0.4 + ease(clamp(c / 0.7)) * 3.0;
      // lấy đà: lùi nửa bước, kéo tay phải ra sau, lóe đỏ
      S.extra.a.material.opacity = wind ? 0.2 + 0.25 * Math.abs(Math.sin(c * 14)) : 0;
      const k = fly ? (c - 1.4) / 0.35 : 0;
      const bx = wind ? -1.8 - ease((c - 0.8) / 0.6) * 0.35 : fly ? -2.15 + ease(k) * 3.95 : stag ? 1.8 - ease(clamp((c - 1.75) / 0.3)) * 0.7 : c >= 3.25 ? 1.1 : -1.8;
      const by = fly ? Math.sin(k * Math.PI) * 0.55 : 0;
      st.visible = stag; if (stag) spinStars(st, t, bx, 2.35, 0);
      const block = c > 1.5 && c < 1.85;
      pose(S, dt, { arms: (p) => {
        if (wind) { p.armR.rotation.x = 0.9; p.elbowR.rotation.x = -1.3; p.armL.rotation.x = -0.9; p.elbowL.rotation.x = -1.4; }
        else if (fly) { p.armR.rotation.x = -1.6; p.elbowR.rotation.x = 0; p.armL.rotation.x = -0.7; p.elbowL.rotation.x = -1.9; }
        else if (stag) { p.armL.rotation.x = p.armR.rotation.x = 0.35; }
        else { p.armL.rotation.x = p.armR.rotation.x = stomp && c < 0.3 ? -0.9 : 0.2; }
      }, bend: wind ? -0.12 : fly ? 0.5 : stag ? 0.3 : 0, rz: stag ? Math.sin(t * 6) * 0.1 : 0, by, bx, mx, mRun: c > 0.05 && c < 0.7, mBlock: block });
      label(S, stomp ? 'dậm đất → chạy ra…' : wind ? '🔴 nhún lùi kéo tay = chờ ĐỠ đúng lúc' : fly ? (block ? '🛡️ ĐỠ!' : '🦸 bay tới!') : stag ? '✅ gạt được — loạng choạng 1,5 giây, ĐÁNH ×2' : '',
        wind ? '#ff6b5a' : stag ? '#7dff8a' : stomp ? '#ff6b5a' : '#ffd54a');
    } },
  { ph: 3, name: '🐂🐂 Húc liền 2 lần (bước 3)', how: 'Húc lần 1 xong quay lại húc ngay lần 2 (vệt đỏ thứ 2 ngắn hơn, ít thời gian né hơn). Vẫn dụ vào container được.', setup(S) { S.extra.s1 = strip(); S.extra.s2 = strip(); S.scene.add(S.extra.s1, S.extra.s2); }, run(S, t, dt) {
    const c = t % 4.4, s1 = S.extra.s1, s2 = S.extra.s2;
    s1.visible = c < 1.4; s1.scale.set(5.5, 1, 0.9); s1.position.set(0.8, 0.02, -0.9); s1.material.opacity = c < 0.9 ? 0.25 + 0.35 * Math.abs(Math.sin(c * 10)) : 0.15;
    s2.visible = c >= 1.4 && c < 2.6; s2.scale.set(5.5, 1, 0.9); s2.position.set(0.8, 0.02, 0.9); s2.material.opacity = 0.25 + 0.35 * Math.abs(Math.sin(c * 14));
    let bx = -1.9, bz = -0.9, bh = Math.PI / 2, run = false, wind = c < 0.9 || (c >= 1.4 && c < 1.9);
    if (c >= 0.9 && c < 1.4) { bx = -1.9 + (c - 0.9) / 0.5 * 5.4; run = true; } else if (c >= 1.4 && c < 1.9) { bx = 3.5; bz = 0.9; bh = -Math.PI / 2; } else if (c >= 1.9 && c < 2.4) { bx = 3.5 - (c - 1.9) / 0.5 * 5.4; bz = 0.9; bh = -Math.PI / 2; run = true; } else if (c >= 2.4) { bx = -1.9; bz = 0.9; bh = -Math.PI / 2; }
    const mz = c < 0.75 ? -0.9 : c < 1.7 ? 0.9 - 0 : c < 2.0 ? 0.9 - clamp((c - 1.7) / 0.2) * 1.8 : -0.9;
    pose(S, dt, { arms: wind || run ? (p) => { p.armL.rotation.x = p.armR.rotation.x = run ? -1.25 : -0.6; } : null, bend: wind ? 0.38 : run ? 0.55 : 0.1, run, bx, bz, bh, mx: 0.8, mz });
    label(S, c < 1.4 ? 'húc lần 1' : c < 2.6 ? '⚠️ lần 2 — ít thời gian né hơn' : '', c >= 1.4 && c < 2.6 ? '#ff6b5a' : '#ffd54a');
  } },
  { ph: 3, name: '🎭 Đấm nhử (bước 4: lần Superman thứ 2)', how: 'Bước 4 luôn là: dậm đất → nhún lùi lóe đỏ → KHỰNG 0,5 giây (nhử) → rồi mới bay thật. Đỡ sớm lúc nhử = mất hết nấc đỡ. Chờ nó bay hẳn mới bấm ĐỠ.',
    setup(S) { S.extra.a = aura(); S.boss.add(S.extra.a); S.extra.st = stars(); S.scene.add(S.extra.st); },
    run(S, t, dt) {
      const c = t % 4.2, st = S.extra.st;
      const wind = c < 0.6, hold = c >= 0.6 && c < 1.1, fly = c >= 1.1 && c < 1.45, stag = c >= 1.45 && c < 2.95;
      S.extra.a.material.opacity = wind ? 0.18 + 0.22 * Math.abs(Math.sin(c * 14)) : 0;
      const k = fly ? (c - 1.1) / 0.35 : 0;
      const bx = wind || hold ? -1.8 - ease(clamp(c / 0.6)) * 0.35 : fly ? -2.15 + ease(k) * 3.95 : stag ? 1.8 - ease(clamp((c - 1.45) / 0.3)) * 0.7 : c >= 2.95 ? 1.1 : -1.8;
      st.visible = stag; if (stag) spinStars(st, t, bx, 2.35, 0);
      const block = c > 1.2 && c < 1.55;
      pose(S, dt, { arms: (p) => {
        if (wind || hold) { p.armR.rotation.x = 0.9; p.elbowR.rotation.x = -1.3; p.armL.rotation.x = -0.9; p.elbowL.rotation.x = -1.4; }
        else if (fly) { p.armR.rotation.x = -1.6; p.elbowR.rotation.x = 0; p.armL.rotation.x = -0.7; p.elbowL.rotation.x = -1.9; }
        else if (stag) { p.armL.rotation.x = p.armR.rotation.x = 0.35; }
      }, bend: wind || hold ? -0.12 : fly ? 0.5 : stag ? 0.3 : 0, rz: stag ? Math.sin(t * 6) * 0.1 : 0, by: fly ? Math.sin(k * Math.PI) * 0.55 : 0, bx, mx: 2.6, mBlock: block });
      label(S, wind ? '🔴 nhún lùi…' : hold ? '✋ KHỰNG = NHỬ — chưa đỡ!' : fly ? (block ? '🛡️ giờ mới ĐỠ!' : '🦸 bay thật') : stag ? '✅ gạt được — ĐÁNH ×2' : '',
        wind || hold ? '#ff6b5a' : stag ? '#7dff8a' : '#ffd54a');
    } },
  { ph: 3, name: '🧱 Đứng xa > 7 m quá 2 giây → ném gạch', how: 'Chạy xa né đòn thì nó vác gạch ném (bay vòng cung). Né ngang hoặc núp sau container.', setup(S) { S.extra.b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0xa0522d })); S.scene.add(S.extra.b); }, run(S, t, dt) {
    const c = t % 2.4, b = S.extra.b, k = clamp((c - 0.6) / 0.8);
    b.visible = c > 0.6 && c < 1.4; b.position.set(-1.9 + k * 5.2, 1.9 + Math.sin(k * Math.PI) * 1.6 - k * 1.2, 0); b.rotation.z = k * 8;
    pose(S, dt, { arms: (p) => { const w = clamp(c / 0.55); p.armR.rotation.x = c < 0.6 ? -2.7 * w : -2.7 + clamp((c - 0.6) / 0.2) * 3.2; p.elbowR.rotation.x = c < 0.6 ? -1.1 * w : -0.2; }, bend: c < 0.6 ? -0.15 : 0.25, twist: c < 0.6 ? 0.5 : -0.3, bx: -1.9, mx: 3.4, mz: c > 0.9 ? -clamp((c - 0.9) / 0.2) * 1.2 : 0 });
    label(S, c < 0.6 ? 'vác gạch…' : 'né ngang!', '#ffd54a');
  } },
  { ph: 3, name: '🤼 Ôm cổ + gối (chỉ khi đứng sát đấm liền 4 cú)', how: 'Phạt kiểu bấm đấm liên tục lúc nó chưa hở: lóe đỏ → ôm cổ. Bấm liên tục 6 lần trong 2 giây để giãy ra (nó khựng: đánh). Không thoát → ăn 3 cú gối. Đánh đúng nhịp thì không bao giờ gặp.',
    setup(S) { S.extra.a = aura(); S.boss.add(S.extra.a); },
    run(S, t, dt) {
      const c = t % 4.4;
      const spam = c < 1.2, warn = c >= 1.0 && c < 1.3, grab = c >= 1.3 && c < 2.8, free = c >= 2.8;
      S.extra.a.material.opacity = warn ? 0.2 + 0.25 * Math.abs(Math.sin(c * 16)) : 0;
      const n = grab ? Math.min(6, Math.floor((c - 1.4) / 0.22) + 1) : 0;
      const back = free ? ease(clamp((c - 2.8) / 0.3)) : 0;
      pose(S, dt, { fp: spam && !warn ? { stance: 'fists', block: true } : null, arms: !spam || warn ? (p) => {
        if (grab || warn) { p.armL.rotation.x = p.armR.rotation.x = -1.9; p.elbowL.rotation.x = p.elbowR.rotation.x = -1.1; if (grab && Math.floor(c * 3) % 2) { p.legR.rotation.x = -0.9; p.kneeR.rotation.x = 1.3; } }
        else { p.armL.rotation.x = p.armR.rotation.x = 0.35; }
      } : null, bend: grab ? 0.25 : free ? 0.3 : 0, rz: free ? Math.sin(t * 6) * 0.08 : 0, bx: -0.5,
        mx: grab ? 0.05 + Math.sin(t * 30) * 0.03 : 0.25 + back * 1.1, mz: grab ? Math.sin(t * 23) * 0.04 : 0, mHit: spam ? { move: Math.floor(c / 0.3) % 2 ? 'jab' : 'cross', t: c % 0.3 } : undefined, mrz: grab ? -0.25 : 0 });
      label(S, spam && !warn ? `👊 đấm liền ${Math.min(4, Math.floor(c / 0.3) + 1)} cú…` : warn ? '🔴 ôm cổ!' : grab ? `🔁 bấm liên tục: ${n}/6` : '✅ thoát! nó khựng — đánh',
        warn ? '#ff6b5a' : free ? '#7dff8a' : '#ffd54a');
    } },
];

// ---------- dựng trang ----------
const cols = { 1: document.getElementById('p1'), 2: document.getElementById('p2'), 3: document.getElementById('p3') };
const views = CARDS.map((cd) => {
  const fig = document.createElement('figure');
  fig.innerHTML = `<figcaption><b>${cd.name}</b><small>${cd.how}</small></figcaption>`;
  cols[cd.ph].append(fig);
  const S = panel(fig, cd.setup);
  return { cd, S, fig };
});
// thanh máu boss minh họa: chạy vòng 100% → 0, đổi tên giai đoạn ở 65% / 30%
const bar = document.getElementById('hp'), name = document.getElementById('phName');
let last = performance.now(), T = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  for (const v of views) {
    v.cd.run(v.S, T, dt);
    if (v.S.extra.tag && !v.S.extra.tag.parentElement) v.fig.prepend(v.S.extra.tag);
  }
  const hp = 1 - ((T * 0.06) % 1);
  bar.style.width = `${hp * 100}%`;
  const ph = hp > 0.65 ? 1 : hp > 0.3 ? 2 : 3;
  name.textContent = [P1, P2, P3][ph - 1];
  name.style.color = ['#ffd54a', '#ff9f43', '#ff5a4f'][ph - 1];
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
