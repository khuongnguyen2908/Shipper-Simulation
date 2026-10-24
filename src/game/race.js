// =============================================================
// GAME — MÀN ĐUA THOÁT THÂN (cốt truyện chương 6): chạy xe anh Đạt (anh Đạt ngồi sau), bán tải Tí Đô rượt; sự cố: chướng ngại, xe giang hồ ném gạch, bán tải húc.
// Phần của lớp Game (src/game.js): gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// Luật / đường ở sim/race.js, hình ở world/raceTrack.js, giao diện ở ui/raceHud.js. Camera cố định sau lưng xe (không xoay / phóng).
// Việc cốt truyện "race" (story.json → races) · điều kiện "raceWon" (bay qua cầu cất / tới đường cụt, xe dừng).
// Thua: té xe 3 lần / bán tải bám sát quá lâu / rớt cầu / cầu dựng đứng / barie đóng → Chơi lại từ đầu đoạn đang chạy.
// =============================================================
import * as THREE from 'three';
import { raceOf, buildTrack, trackAt, nearestOnTrack, sectionAt, chaseSpeed, raceEvents, OBSTACLE_EVENTS, RACE, drawbridgeJump, drawbridgeAngle } from '../sim/race.js';
import { buildRaceTrack } from '../world/raceTrack.js';
import { makeCar, makeNpcMoto, makePerson, randomPersonOpts, sitY, setSitting } from '../world/models.js';
import { makeLongTruck } from '../world/storyProps.js';
import { makeBaGac } from '../world/npcVehicles.js';
import { RaceHud } from '../ui/raceHud.js';
import { ZONES } from '../sim/zones.js';
import { storyEvent } from '../sim/story.js';
import { makeRng } from '../sim/rng.js';
import * as act from '../interactions.js';
import { sound } from '../audio.js';
import { fmt } from '../content/index.js';

const tmp = new THREE.Vector3();
// Chướng ngại (sự cố trong story.json → races): dựng hình + khung chiếm chỗ. c: làn bị chắn, laneW: bề rộng làn, w: bề rộng đường
const STATIC_OBS = {
  drums: ({ c, mat }) => { // 3 thùng phuy lăn ra đường
    const m = new THREE.Group();
    [[-0.6, 0.3], [0.5, -0.2], [0.1, 0.6]].forEach(([x, z], i) => { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), mat([0x2471a3, 0xc0392b, 0x2471a3][i])); d.position.set(x, 0.45, z); if (i === 2) { d.rotation.z = Math.PI / 2; d.position.y = 0.3; } const band = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.1, 10), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 })); d.add(band); m.add(d); });
    return { mesh: m, lat0: c - 1.0, lat1: c + 1.0, ds: 0.9 };
  },
  cones: ({ c, laneW, mat }) => { // rào công trình chắn 1 làn
    const m = new THREE.Group(), half = Math.min(1.8, laneW / 2);
    const board = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.35, 0.08), mat(0xff6b1a)); board.position.y = 0.9; m.add(board);
    for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.36, 0.09), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.5 })); st.position.set(-half + 0.3 + i * (half * 2 - 0.6) / 3, 0.9, 0); m.add(st); }
    for (const x of [-half, half]) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0xffa000, { emissive: 0xffa000, emissiveIntensity: 2 })); lamp.position.set(x, 1.2, 0); lamp.userData.blink = true; m.add(lamp); }
    for (const x of [-half + 0.1, half - 0.1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.5), mat(0x555555)); leg.position.set(x, 0.45, 0); m.add(leg); }
    for (let i = 0; i < 3; i++) { const cn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.65, 8), mat(0xff6b1a)); cn.position.set(-half + 0.4 + i * (half - 0.4), 0.33, -1.6); m.add(cn); }
    return { mesh: m, lat0: c - half, lat1: c + half, ds: 0.6, rot: Math.PI / 2 };
  },
  brokencar: ({ c, rng, mat }) => { // xe hư đậu giữa làn + tam giác cảnh báo phía sau
    const m = makeCar(rng.pick([0x7f8c8d, 0xecf0f1, 0x2c3e50]), rng.pick(['sedan', 'suv']));
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 3), mat(0xff3b30, { emissive: 0xff2200, emissiveIntensity: 1.2 })); tri.position.y = 0.25;
    for (const [x, z] of [[-0.75, -2.15], [0.75, -2.15], [-0.75, 2.15], [0.75, 2.15]]) { const hz = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.06), mat(0xffa000, { emissive: 0xffa000, emissiveIntensity: 2.2 })); hz.position.set(x, 0.75, z); hz.userData.blink = true; m.add(hz); } // đèn khẩn cấp nháy
    return { mesh: m, lat0: c - 1.05, lat1: c + 1.05, ds: 2.3, extra: tri };
  },
  trunk: ({ w, rng, mat }) => { // cây dừa ngã chắn hơn nửa đường, từ 1 bên lề
    const side = rng.next() < 0.5 ? -1 : 1, len = w * 0.58;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, len, 8).rotateZ(Math.PI / 2), mat(0x9a7a52, { emissive: 0x3a2a18, emissiveIntensity: 0.5 })); m.position.y = 0.25;
    const at = side * (w / 2 - len / 2);
    return { mesh: m, at, lat0: at - len / 2, lat1: at + len / 2, ds: 0.45, rot: Math.PI / 2 };
  },
  buffalo: ({ w, mat }) => cross(w, 1.15, () => { // trâu đi băng ngang đường
    const m = new THREE.Group(), C = 0x3b3633;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 1.7), mat(C)); body.position.y = 1.0; m.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.5), mat(C)); head.position.set(0, 1.15, 1.05); m.add(head);
    for (const sx of [-1, 1]) { const horn = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), mat(0xd8d2c4)); horn.position.set(sx * 0.32, 1.38, 1.0); horn.rotation.z = sx * 0.4; m.add(horn); }
    const legs = [];
    for (const [x, z] of [[-0.25, 0.6], [0.25, 0.6], [-0.25, -0.6], [0.25, -0.6]]) { const g = new THREE.Group(); g.position.set(x, 0.65, z); const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.65, 0.16), mat(C)); l.position.y = -0.32; g.add(l); m.add(g); legs.push(g); }
    m.userData.legs = legs;
    return m;
  }, 0.9),
  forklift: ({ w, mat }) => cross(w, 2.3, () => { // xe nâng chạy ngang (bến cảng)
    const m = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 2), mat(0xf1c40f)); body.position.y = 0.8; m.add(body);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, 0.12), mat(0x333333)); mast.position.set(0, 1.4, 1.1); m.add(mast);
    const pal = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1), mat(0xb08a5a)); pal.position.set(0, 0.5, 1.7); m.add(pal);
    return m;
  }, 1.1),
  cart: ({ w, rng }) => { // xe ba gác đậu lấn ra đường
    const side = rng.next() < 0.5 ? -1 : 1, m = makeBaGac(rng);
    const at = side * (w / 2 - 1.2);
    return { mesh: m, at, lat0: at - 1.2, lat1: at + 1.2, ds: 1.4 };
  },
};
// chướng ngại băng ngang: đi từ lề này sang lề kia với tốc độ speed (m/s), nửa bề ngang half
function cross(w, speed, make, half) {
  const side = Math.random() < 0.5 ? -1 : 1, m = make();
  const lat = side * (w / 2 + 2);
  return { mesh: m, at: lat, lat, lat0: lat - half, lat1: lat + half, half, cross: -side * speed, w, ds: 1.0, legs: m.userData.legs, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2 };
}

export class RacePart {
  // ---------- BẮT ĐẦU ----------
  raceStart(id) {
    const def = typeof id === 'object' ? id : raceOf(id);
    if (!def) return storyEvent(this.gs.story, 'raceWon');
    this.raceStop();
    this.storyLose = false; // bắt đầu lại màn: xóa trạng thái thua cũ (nếu có)
    this.loseEl?.classList.remove('on');
    const zone = ZONES[def.zone || 'race'], [ox, oz] = zone.origin;
    const T = buildTrack(def);
    // hình đường đua (dựng 1 lần cho mỗi màn) — đăng ký làm bản đồ riêng "race"
    this.raceBuilt ||= {};
    const key = typeof id === 'object' ? '__test' : id;
    if (!this.raceBuilt[key]) {
      const vis = buildRaceTrack(this.scene, T, def, [ox, oz]);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of T.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      this.raceBuilt[key] = { id: 'race', group: vis.group, props: vis.props, bounds: { x0: x0 + ox - 120, x1: x1 + ox + 120, z0: z0 + oz - 120, z1: z1 + oz + 120 }, tick() {} };
    }
    for (const [k, z] of Object.entries(this.raceBuilt)) z.group.visible = k === key;
    this.zones ||= {};
    this.zones.race = this.raceBuilt[key];
    this.gs.story.zone = { id: 'race' };
    this.zoneEnter('race');
    delete this.gs.story.fpv;
    this.fpvSet(false);
    // xe anh Đạt: nhớ xe của người chơi để trả lại sau màn đua
    const b = this.bike;
    this.raceSaved ||= { spec: b.spec, pos: b.pos.clone(), heading: b.heading, fuel: this.gs.fuel };
    b.setSpec({ ...b.spec, ...(def.bike || {}), name: b.spec.name });
    b.mesh.userData.bagMesh && (b.mesh.userData.bagMesh.visible = false);
    this.gs.fuel = Math.max(this.gs.fuel, 50);
    const R = this.race = { id: key, def, T, ox, oz, s: 10, lat: 0, crashes: 0, crashT: 0, caughtT: 0, lock: false, done: false, lost: false,
      events: raceEvents(def, T), obs: [], bricks: [], lastThrow: 0, ram: null, motos: [], truck: null, traffic: [], props: this.raceBuilt[key].props, fx: [], si: 0, cp: null, t: 0, lineT: 0 };
    this.racePlaceBike(10, 0, 8);
    this.mode === 'bike' || act.mountBike(this);
    // anh Đạt ngồi sau
    if (def.ally) {
      if (!this.storyActors?.[def.ally]) this.storyActorSpawn({ do: 'actor', who: def.ally, look: 'char', spot: 'at', at: [b.pos.x + 1, b.pos.z], heading: 0 });
      const ac = this.storyActors?.[def.ally];
      if (ac && !ac.seated) this.storyActorSeat(ac);
    }
    // xe giang hồ ném gạch (mỗi xe 2 đứa): nấp sẵn, chỉ chạy ra khi gặp sự cố "throwers"
    const rng = makeRng(77);
    for (let i = 0; i < (def.motos ?? 2); i++) {
      const mesh = makeNpcMoto([0x1f6fd1, 0xc0392b, 0x2c3e50, 0x8e44ad, 0x27ae60][i % 5], rng);
      const back = makePerson({ ...randomPersonOpts(rng, 'm', { sitting: true }), hat: null });
      setSitting(back, true);
      back.position.set(0, sitY(back.scale.x, 1.02), -0.6);
      mesh.add(back);
      mesh.visible = false;
      this.scene.add(mesh);
      R.motos.push({ mesh, back, s: 0, lat: 0, alive: true, fallT: 0, mode: null, k: i });
    }
    // bán tải Tí Đô: kẻ rượt duy nhất, bám sau lưng từ đầu tới cuối
    this.raceTruckOn(-18);
    this.raceTraffic();
    this.raceCheckpoint(0);
    this.raceHud ||= new RaceHud(document.body);
    this.raceHud.show(true);
    this.hud.el.classList.add('in-race');
    const first = def.sections?.[0];
    if (first?.line) this.raceSay(first.line);
    sound('race.start');
  }
  // Đặt xe ở quãng s, lệch lat, chạy sẵn v m/s, hướng theo đường
  racePlaceBike(s, lat, v = 0) {
    const R = this.race, p = trackAt(R.T, s, lat), b = this.bike;
    b.pos.set(p.x + R.ox, 0, p.z + R.oz);
    b.heading = p.h;
    b.speed = v;
    b.vel?.set(Math.sin(p.h) * v, Math.cos(p.h) * v);
    b.mesh.position.set(b.pos.x, 0, b.pos.z);
    b.mesh.rotation.set(0, p.h, 0);
    this.walker.pos.copy(b.pos);
    R.s = s;
    R.lat = lat;
    this.rig.init = false;
  }
  // xe cộ trên đường (theo mật độ từng đoạn): cùng chiều chạy chậm hơn, đường hẹp thì có xe ngược chiều
  raceTraffic() {
    const R = this.race, rng = makeRng(31337), secs = R.def.sections || [];
    for (let s = 120; s < R.T.total - 200; s += 18) {
      const si = sectionAt(R.T, s), sec = secs[si], dens = sec?.traffic ?? { highway: 0.8, industrial: 0.35, village: 0.15, dirt: 0.05, canal: 0.05 }[sec?.kind] ?? 0;
      if (rng.next() > dens * 0.48) continue;
      const w = trackAt(R.T, s).w, wide = w >= 12, kind = rng.pick(sec.kind === 'highway' ? ['truck', 'truck', 'car', 'car', 'car', 'bus'] : wide ? ['car', 'truck', 'moto'] : ['moto', 'moto', 'car']);
      // chạy bên phải (lat âm) cùng chiều · bên trái (lat dương) ngược chiều; đường rộng có 2 làn mỗi bên
      const oncoming = rng.next() < 0.45;
      const lane = wide ? (rng.next() < 0.5 ? w / 8 : (w * 3) / 8) : w / 4;
      const lat = oncoming ? lane : -lane;
      const mesh = kind === 'truck' ? makeLongTruck({ cab: rng.pick([0xc0392b, 0x2471a3, 0x1e8449, 0xd4ac0d]) }) : kind === 'bus' ? makeCar(0xf1c40f, 'truck') : kind === 'moto' ? makeNpcMoto(rng.pick([0x1f6fd1, 0xecf0f1, 0xc0392b]), rng) : makeCar(rng.pick([0xc0392b, 0x2c3e50, 0xecf0f1, 0x7f8c8d, 0x2980b9]), rng.pick(['sedan', 'suv', 'taxi']));
      mesh.visible = false;
      this.scene.add(mesh);
      const len = kind === 'truck' ? 14 : kind === 'bus' ? 10 : kind === 'moto' ? 2 : 4.4, wid = kind === 'moto' ? 0.8 : kind === 'truck' ? 2.5 : 2;
      R.traffic.push({ mesh, s, s0: s, lat, v: oncoming ? -((kind === 'truck' ? 11 : 14) + rng.next() * 5) : (kind === 'truck' ? 11 : 13) + rng.next() * 5, len, wid, kind });
    }
  }
  // Mốc chơi lại: đầu đoạn đang chạy (nhớ số xe rượt còn sống, sự cố đã qua)
  raceCheckpoint(si) {
    const R = this.race;
    R.si = si;
    R.cp = { si, s: R.T.secStart[si] + 4, truck: R.truck ? { active: R.truck.active } : null };
  }

  // ---------- MỖI KHUNG HÌNH ----------
  raceTick(dt) {
    const R = this.race;
    if (!R) return;
    R.t += dt;
    if (R.safeT > 0) { R.safeT -= dt; this.bike.mesh.visible = R.safeT <= 0 || R.crashT > 0 || Math.floor(R.t * 10) % 2 === 0; } else if (!this.bike.mesh.visible) this.bike.mesh.visible = true;
    const b = this.bike, here = nearestOnTrack(R.T, b.pos.x - R.ox, b.pos.z - R.oz, R.s);
    R.s = here.s;
    R.lat = here.lat;
    // ---- giữ xe trong lòng đường (đụng lề: cạ, chậm lại) ----
    const half = here.w / 2 - 0.45;
    if (Math.abs(here.lat) > half && !R.jump) {
      const p = trackAt(R.T, R.s, Math.sign(here.lat) * half);
      b.pos.x = p.x + R.ox; b.pos.z = p.z + R.oz;
      b.speed *= 1 - dt * 1.2;
      if ((R.scrapeT = (R.scrapeT || 0) - dt) <= 0) { sound('race.scrape'); R.scrapeT = 0.6; }
    }
    // ---- đang té xe: đứng lại, xe nghiêng, rồi chạy tiếp ----
    if (R.crashT > 0) {
      R.crashT -= dt;
      b.speed = 0;
      b.mesh.rotation.z = Math.min(1.2, (RACE.crashStop - R.crashT) * 3) * (R.crashSide || 1);
      if (R.crashT <= 0) { b.mesh.rotation.z = 0; R.lock = false; this.racePlaceBike(R.s + 1, Math.max(-half, Math.min(half, R.lat)), 2); }
    }
    // ---- bay qua cầu gãy ----
    if (R.jump) this.raceJumpTick(dt);
    // ---- qua đoạn mới: lưu mốc, anh Đạt hét ----
    const si = sectionAt(R.T, R.s);
    if (si > R.si && !R.done) {
      R.crashes = 0; // mỗi đoạn được té tối đa 3 lần
      this.raceCheckpoint(si);
      const line = R.def.sections[si]?.line;
      if (line) this.raceSay(line);
    }
    this.raceEventsTick(dt);
    this.raceObsTick(dt);
    this.raceChaseTick(dt);
    this.raceTrafficTick(dt);
    this.raceFxTick(dt);
    // ---- tới đường cụt: tự phanh, dừng hẳn → xong ----
    if (!R.done && R.s > R.T.total - RACE.endBrake) {
      R.lock = true;
      b.speed = Math.max(0, b.speed - dt * 14);
      if (b.speed <= 0.2) {
        R.done = true;
        b.speed = 0;
        storyEvent(this.gs.story, 'raceWon');
        sound('race.brake');
        this.raceHud.show(false);
        this.hud.el.classList.remove('in-race');
      }
    }
    this.raceHudUpdate();
  }
  raceSay(key) {
    const R = this.race;
    if (R.def.ally && this.storyActors?.[R.def.ally]) this.storyBubble(R.def.ally, key);
  }
  // Sự cố tới gần
  raceEventsTick(dt) {
    const R = this.race, b = this.bike;
    for (const e of R.events) {
      if (e.done) continue;
      const ahead = e.s - R.s;
      if (e.type === 'say' && ahead < 0) { e.done = true; if (e.line) this.raceSay(e.line); continue; }
      if (e.type === 'truck' && ahead < 0) { e.done = true; this.raceTruckOn(); if (e.line) this.raceSay(e.line); continue; }
      // 2 xe giang hồ vượt lên ném gạch · bán tải lên ngang hông rồi tạt vào: tới chỗ thì đợi đường vắng mới ra (quá xa chỗ đặt thì bỏ)
      if ((e.type === 'throwers' || e.type === 'ram') && ahead < 0) {
        if (-ahead > (e.type === 'ram' ? 400 : 700)) { e.done = true; continue; }
        if (e.type === 'throwers' ? this.raceThrowersGo() : this.raceRamGo()) e.done = true;
        continue;
      }
      if (e.type === 'drawbridge') { this.raceDrawbridgeTick(e, ahead, dt); continue; }
      // chướng ngại hiện ra phía trước (container rơi, sạp hàng, thùng phuy…) — người chơi tự lái né
      if (OBSTACLE_EVENTS[e.type] && ahead < OBSTACLE_EVENTS[e.type].near && ahead > -5) {
        e.done = true;
        if (e.line) this.raceSay(e.line);
        this.raceObsStart(e);
        continue;
      }
      if (e.type === 'barrier') {
        const pr = R.props[e.id];
        if (!e.started && ahead < 230) { e.started = true; e.t = 0; if (e.line) this.raceSay(e.line); sound('race.barrier'); }
        if (e.started && pr) { e.t += dt; pr.pivot.rotation.z = Math.max(0, 1.35 - (e.t / 13) * 1.35); } // hạ dần trong 13 giây: từ lúc còn 230 m, chạy trung bình ≥ ~82 km/h mới lọt
        if (ahead < 0) { e.done = true; if (pr && pr.pivot.rotation.z < 0.3) this.raceLose('blocked'); }
      } else if (e.type === 'jump') {
        const gap = R.props[e.id]?.gap ?? 14;
        if (ahead < 160 && !e.said && e.line) { e.said = true; }
        if (ahead < gap / 2 && !R.jump) {
          e.done = true;
          if (b.speed >= RACE.jumpSpeed) { R.jump = { t: 0, s0: R.s, len: gap + 6, v: b.speed }; R.lock = true; if (e.line) this.raceSay(e.line); sound('race.jump'); }
          else { this.raceLose('fall'); sound('race.splash'); }
          if (R.truck) R.truck.active = false; // bán tải không qua được cầu
        }
      } else if (e.type === 'potholes' && !e.made) {
        if (ahead < 300) { e.made = true; this.raceObstacles(e, 'hole'); }
      } else if (e.type === 'ducks' && !e.made) {
        if (ahead < 160) { e.made = true; this.raceObstacles(e, 'duck'); if (e.line) this.raceSay(e.line); }
      } else if (e.type === 'puddle' && !e.made) {
        if (ahead < 200) { e.made = true; this.raceObstacles(e, 'puddle'); }
      }
      if ((e.type === 'potholes' || e.type === 'ducks' || e.type === 'puddle') && e.made && ahead < -(e.span || 20)) e.done = true;
    }
  }
  // Ổ gà / vịt / vũng nước: vật nằm trên đường, chạy qua thì xóc / chậm / trượt
  raceObstacles(e, kind) {
    const R = this.race, n = kind === 'hole' ? e.n || 12 : kind === 'duck' ? 9 : 1, span = e.span || (kind === 'duck' ? 4 : 18), rng = makeRng(Math.floor(e.s));
    for (let i = 0; i < n; i++) {
      const s = e.s + (kind === 'duck' ? rng.next() * span : (i / n) * span), w = trackAt(R.T, s).w, lat = (rng.next() - 0.5) * (w - 1.5);
      const p = trackAt(R.T, s, kind === 'duck' ? -w / 2 - 1 - rng.next() * 3 : lat);
      let mesh;
      if (kind === 'hole') { mesh = new THREE.Mesh(new THREE.CircleGeometry(0.45 + rng.next() * 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x2a2018 })); mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.03; }
      else if (kind === 'puddle') { mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshStandardMaterial({ color: 0x5d7a8a, roughness: 0.1, metalness: 0.3 })); mesh.scale.set(w / 2, 4, 1); mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.035; }
      else { // vịt: thân trắng, mỏ cam, lạch bạch băng qua đường
        mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 5).scale(1, 0.8, 1.4), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, flatShading: true }));
        body.position.y = 0.2;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), body.material); head.position.set(0, 0.36, 0.17);
        const bill = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.08), new THREE.MeshStandardMaterial({ color: 0xf39c12 })); bill.position.set(0, 0.35, 0.28);
        mesh.add(body, head, bill);
      }
      mesh.position.x = p.x + R.ox; mesh.position.z = p.z + R.oz;
      mesh.rotation.y = kind === 'duck' ? p.h - Math.PI / 2 : mesh.rotation.y;
      this.scene.add(mesh);
      R.fx.push({ kind, mesh, s, lat: kind === 'duck' ? -w / 2 - 1 : lat, r: kind === 'puddle' ? w / 2 : 0.6, hit: false, v: kind === 'duck' ? 0.9 + rng.next() * 0.4 : 0, w, t: 0 });
    }
  }
  raceFxTick(dt) {
    const R = this.race, b = this.bike;
    for (const f of R.fx) {
      f.t += dt;
      if (f.kind === 'duck' && f.lat < f.w / 2 + 2) { f.lat += f.v * dt; const p = trackAt(R.T, f.s, f.lat); f.mesh.position.set(p.x + R.ox, Math.abs(Math.sin(f.t * 9)) * 0.05, p.z + R.oz); }
      if (f.hit || R.crashT > 0 || R.jump) continue;
      const ds = Math.abs(f.s - R.s), dl = Math.abs(f.lat - R.lat);
      if (ds < (f.kind === 'puddle' ? 4 : 0.9) && dl < f.r + 0.3) {
        f.hit = true;
        if (f.kind === 'hole') { b.speed *= 0.82; this.shake = 0.4; sound('race.bump'); }
        else if (f.kind === 'duck') { b.speed *= 0.65; this.shake = 0.3; sound('race.quack'); f.mesh.visible = false; }
        else { b.heading += (Math.random() - 0.5) * 0.35; b.speed *= 0.85; sound('race.splash'); }
      }
    }
    // dọn vật đã bỏ xa phía sau
    for (const f of [...R.fx]) if (f.s < R.s - 120) { this.scene.remove(f.mesh); R.fx.splice(R.fx.indexOf(f), 1); }
  }
  // ---------- CHƯỚNG NGẠI (người chơi tự lái né, không có nút bấm) ----------
  // Mỗi chướng ngại: khung chiếm chỗ trên đường theo (quãng s ± ds, lệch lat0 … lat1); tông vào khi đang chạy nhanh = té
  raceObsStart(e) {
    const R = this.race, w = trackAt(R.T, e.s).w, mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...o });
    const add = (o) => { this.scene.add(o.mesh); R.obs.push({ t: 0, ...o }); };
    const place = (m, s, lat, rot = 0) => { const p = trackAt(R.T, s, lat); m.position.set(p.x + R.ox, m.position.y, p.z + R.oz); m.rotation.y = p.h + rot; };
    if (e.type === 'container') {
      // 2 container rơi từ cẩu: cái đầu đúng làn đang chạy, cái sau làn kia (lạng qua lạng lại)
      const lane = Math.max(-w / 2 + 1.5, Math.min(w / 2 - 1.5, R.lat));
      [[e.s, lane], [e.s + 28, lane > 0 ? lane - 4 : lane + 4]].forEach(([cs, cl], i) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(2.44, 2.6, 6.06), mat([0xc0392b, 0x1d5fa8][i]));
        m.position.y = 16 + i * 4;
        place(m, cs, cl);
        add({ kind: 'container', mesh: m, s: cs, lat0: cl - 1.25, lat1: cl + 1.25, ds: 3.1, y: m.position.y, solid: false });
      });
      sound('race.whoosh');
    } else if (e.type === 'bus') {
      // xe khách phía trước xoay ngang chắn gần hết đường, chừa khe bên trái (lat dương)
      const m = makeCar(0xf1c40f, 'truck');
      m.scale.set(1.15, 1.15, 1.6);
      place(m, e.s, -w / 4);
      add({ kind: 'bus', mesh: m, s: e.s, lat0: -w / 2, lat1: w / 2 - 3.4, ds: 1.6, solid: false, rot: 0 });
      sound('city.truckHorn');
    } else if (e.type === 'stall') {
      // sạp hàng đẩy từ lề phải ra giữa đường
      const m = new THREE.Group(), cart = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.1), mat(0x8d6e4f)), top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 1.4), mat(0x27ae60));
      cart.position.y = 0.8; top.position.y = 1.9;
      for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), mat([0xe67e22, 0xf1c40f, 0x27ae60][i % 3])); f.position.set(-0.6 + i * 0.24, 1.38, 0); m.add(f); }
      m.add(cart, top);
      place(m, e.s, -w / 2 - 1.2, Math.PI / 2);
      add({ kind: 'stall', mesh: m, s: e.s, lat0: -w / 2, lat1: -w / 2 + 0.1, ds: 1, solid: true, w });
    } else if (STATIC_OBS[e.type]) {
      // chướng ngại đứng yên / băng ngang: chắn đúng làn mình đang chạy, luôn chừa khe ≥ 3 m để lách
      const lanes = w >= 12 ? [-3 * w / 8, -w / 8, w / 8, 3 * w / 8] : [-w / 4, w / 4], laneW = w >= 12 ? w / 4 : w / 2;
      const c = lanes.reduce((a, l) => (Math.abs(l - R.lat) < Math.abs(a - R.lat) ? l : a), lanes[0]);
      const rng = makeRng(Math.floor(e.s * 7));
      const o = STATIC_OBS[e.type]({ w, c, laneW, rng, mat });
      o.mesh.position.y ||= 0;
      place(o.mesh, e.s, o.at ?? c, o.rot ?? 0);
      add({ kind: e.type, s: e.s, solid: true, ...o });
      if (o.extra) { const q = trackAt(R.T, e.s - 14, c); o.extra.position.set(q.x + R.ox, 0, q.z + R.oz); o.extra.rotation.y = q.h; this.scene.add(o.extra); R.obs.push({ kind: 'deco', mesh: o.extra, s: e.s - 14, lat0: 0, lat1: 0, ds: 0, solid: false, t: 0 }); }
    }
  }
  raceObsTick(dt) {
    const R = this.race, b = this.bike, on = Math.floor(R.t * 3) % 2 === 0;
    for (const o of R.obs) {
      o.t += dt;
      if (o.blinks ??= (() => { const l = []; o.mesh.traverse((c) => c.userData.blink && l.push(c)); return l; })()) for (const c of o.blinks) c.visible = on; // đèn nháy
      const p = trackAt(R.T, o.s, (o.lat0 + o.lat1) / 2);
      if (o.kind === 'container' && o.mesh.position.y > 1.3) { o.mesh.position.y = Math.max(1.3, o.y - o.t * o.t * 14); if (o.mesh.position.y <= 1.3 && !o.solid) { o.solid = true; this.shake = 0.5; sound('race.land'); } }
      if (o.kind === 'bus' && !o.solid) { o.rot = Math.min(1.45, o.t * 1.3); o.mesh.rotation.y = p.h + o.rot; if (o.rot > 0.6) o.solid = true; }
      if (o.cross) { // trâu / xe nâng băng ngang đường
        o.lat += o.cross * dt;
        o.lat0 = o.lat - o.half; o.lat1 = o.lat + o.half;
        const q = trackAt(R.T, o.s, o.lat);
        o.mesh.position.set(q.x + R.ox, 0, q.z + R.oz);
        if (o.legs) for (const [k, leg] of o.legs.entries()) leg.rotation.x = Math.sin(o.t * 6 + k * 1.6) * 0.35;
        if (Math.abs(o.lat) > o.w / 2 + 3) o.solid = false;
      }
      if (o.kind === 'stall' && o.lat1 < -o.w / 2 + 3.2) { o.lat1 = Math.min(-o.w / 2 + 3.2, -o.w / 2 + o.t * 3.5); const q = trackAt(R.T, o.s, o.lat1 - 0.8); o.mesh.position.set(q.x + R.ox, 0, q.z + R.oz); }
      if (!o.solid || R.crashT > 0 || R.safeT > 0 || R.jump || o.hit) continue;
      if (Math.abs(R.s - o.s) < o.ds + 0.9 && R.lat > o.lat0 - 0.4 && R.lat < o.lat1 + 0.4) {
        o.hit = true;
        if (o.kind === 'brick') { b.speed *= 0.85; this.shake = 0.3; sound('race.bump'); } // cục gạch nằm trên đường: xóc nhẹ
        else if (b.speed > 5) this.raceCrash(R.lat > (o.lat0 + o.lat1) / 2 ? 1 : -1);
        else { b.speed = 0; sound('race.bump'); }
      }
    }
    for (const o of [...R.obs]) if (o.s < R.s - 150) { this.scene.remove(o.mesh); R.obs.splice(R.obs.indexOf(o), 1); }
  }
  // ---------- TÉ XE / THUA / CHƠI LẠI ----------
  raceCrash(side = 1) {
    const R = this.race;
    if (R.crashT > 0 || R.done || R.lost) return;
    R.crashes += 1;
    R.crashT = RACE.crashStop;
    R.crashSide = side;
    R.lock = true;
    R.safeT = RACE.crashStop + 2; // đứng dậy rồi được 2 giây không bị đụng (xe nhấp nháy)
    for (const m of R.motos) if (m.mode === 'pass' || m.mode === 'throw') m.mode = 'away'; // bọn ném gạch phóng đi mất
    this.bike.speed = 0;
    this.shake = 0.8;
    sound('race.crash');
    this.raceHud.flash();
    if (R.crashes >= RACE.crashMax) this.raceLose('crashed');
  }
  raceLose(why) {
    const R = this.race;
    if (R.lost || R.done) return;
    R.lost = true;
    R.lock = true;
    this.storyLose = true;
    const txt = { caught: ['story.race.caught', 'story.race.caughtHint'], crashed: ['story.race.crashed', 'story.race.crashHint'], fall: ['story.race.fall', 'story.race.crashHint'], blocked: ['story.race.blocked', 'story.race.crashHint'],
      steep: ['story.race.steep', 'story.race.bridgeHint'], short: ['story.race.short', 'story.race.bridgeHint'] }[why] || ['story.race.caught', 'story.race.caughtHint'];
    setTimeout(() => { if (this.race === R) this.storyLoseShow({ failText: txt[0], failHint: txt[1] }); }, 800);
  }
  raceRetry() {
    const R = this.race;
    this.loseEl?.classList.remove('on');
    this.storyFade({ t: 0.6 });
    setTimeout(() => {
      this.storyLose = false;
      if (this.race !== R) return;
      const cp = R.cp;
      Object.assign(R, { lost: false, lock: false, crashes: 0, crashT: 0, caughtT: 0, ram: null, jump: null, si: cp.si, safeT: 2 });
      for (const o of [...R.obs, ...R.bricks]) this.scene.remove(o.mesh);
      R.obs = [];
      R.bricks = [];
      this.bike.mesh.rotation.set(0, this.bike.mesh.rotation.y, 0);
      this.bike.mesh.position.y = 0;
      this.racePlaceBike(cp.s, 0, 10);
      R.motos.forEach((m) => { Object.assign(m, { alive: true, fallT: 0, mode: null, river: false }); m.mesh.visible = false; m.mesh.rotation.z = 0; m.mesh.position.y = 0; });
      if (R.truck) { Object.assign(R.truck, { active: !!cp.truck?.active, s: cp.s - 45, stop: null }); R.truck.mesh.visible = R.truck.active; }
      for (const e of R.events) if (e.s >= cp.s - 1 || (e.type === 'drawbridge' && !e.done)) Object.assign(e, { done: false, started: false, made: false, said: false, t: 0, hold: false, passed: false });
      for (const e of R.events) if (e.type === 'drawbridge' && !e.done) this.raceDrawbridgeSet(e, 0);
      for (const f of R.fx) this.scene.remove(f.mesh);
      R.fx = [];
      for (const [id, pr] of Object.entries(R.props)) if (pr.kind === 'barrier' && R.events.find((x) => x.id === id && !x.done)) pr.pivot.rotation.z = 1.35;
    }, 750);
  }
  // ---------- KẺ RƯỢT: BÁN TẢI TÍ ĐÔ (+ 2 xe giang hồ ném gạch theo sự cố) ----------
  // Bán tải ra / áp sát lại sau lưng (at: quãng đặt xe, bỏ trống = sau lưng mình 60 m nếu đang bị bỏ xa hơn)
  raceTruckOn(at = null) {
    const R = this.race;
    if (!R.truck) {
      const mesh = makeCar(0x5b1f1f, 'truck'), mat = new THREE.MeshStandardMaterial({ color: 0xffa000, emissive: 0xffa000, emissiveIntensity: 2.4 });
      mesh.scale.setScalar(1.15);
      const lamps = [];
      for (const [x, z] of [[-0.95, 2.15], [0.95, 2.15], [-0.95, -2.13], [0.95, -2.13]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.08), mat); l.position.set(x, 0.92, z); l.visible = false; mesh.add(l); lamps.push(l); } // đèn khẩn cấp: nháy khi sắp húc
      this.scene.add(mesh);
      R.truck = { mesh, lamps, s: R.s - 45, lat: 0, active: true };
    }
    const T = R.truck;
    T.active = true;
    T.stop = null;
    if (at != null) T.s = at;
    else T.s = Math.max(T.s, R.s - 60);
    T.mesh.visible = true;
    sound('city.truckHorn');
  }
  raceMotoFall(m, river = false) {
    if (!m.alive) return;
    m.alive = false;
    m.fallT = 0.001;
    m.river = river;
    sound(river ? 'race.splash' : 'race.crash');
  }
  // Có gì chắn ở làn lat quanh quãng s (xe cộ đang hiện, chướng ngại) — trả vật chắn / null
  raceLaneBusy(s, lat, back, front, gapLat = 1.3, carsOnly = false) {
    const R = this.race;
    for (const v of R.traffic) if (v.mesh.visible && v.s > s - back - v.len / 2 && v.s < s + front + v.len / 2 && Math.abs(v.lat - lat) < v.wid / 2 + gapLat) return v;
    if (!carsOnly) for (const o of R.obs) if (o.solid && o.kind !== 'brick' && o.s > s - back && o.s < s + front && lat > o.lat0 - gapLat && lat < o.lat1 + gapLat) return o;
    return null;
  }
  // Làn trống gần chỗ muốn chạy nhất (bọn rượt không chạy xuyên xe) · avoid: tránh xa các lat này (người chơi, xe kia)
  raceFreeLat(s, want, w, back, front, avoid = null, carsOnly = false, gapA = 2.2) {
    const cands = [want, ...[-0.38, -0.2, 0, 0.2, 0.38].map((k) => k * w)].sort((p, q) => Math.abs(p - want) - Math.abs(q - want));
    for (const l of cands) {
      if (Math.abs(l) > w / 2 - 0.8 || [].concat(avoid ?? []).some((a) => Math.abs(l - a) < gapA)) continue;
      if (!this.raceLaneBusy(s, l, back, front, 1.3, carsOnly)) return l;
    }
    return null;
  }
  // Đường đang vắng quanh mình (không xe cộ, không chướng ngại sắp tới) — điều kiện để bọn ném gạch / bán tải húc ra tay
  // front / back: không có xe cộ trong khoảng này quanh mình · obs: không có chướng ngại sắp tới trong obs m
  raceQuiet(front = 80, back = 20, obs = 120) {
    const R = this.race, kind = R.def.sections[R.si]?.kind;
    if (R.ram || R.jump || R.crashT > 0 || R.safeT > 0 || ['gate', 'work', 'bridge', 'drawbridge', 'deadend'].includes(kind)) return false;
    if (R.traffic.some((v) => v.mesh.visible && v.s > R.s - back && v.s < R.s + front)) return false;
    if (R.obs.some((o) => o.solid && o.kind !== 'brick' && o.s > R.s - 5 && o.s < R.s + obs)) return false;
    return !R.events.some((x) => !x.done && (OBSTACLE_EVENTS[x.type] || x.type === 'barrier' || x.type === 'drawbridge') && x.s > R.s && x.s < R.s + obs);
  }
  // Sự cố "throwers": 2 xe giang hồ (mỗi xe 2 đứa) từ sau lưng vượt lên, đứa ngồi sau quay ra ném gạch, xong thì phóng đi mất
  raceThrowersGo() {
    const R = this.race;
    if (!this.raceQuiet() || R.motos.some((m) => m.mode)) return false;
    const w = trackAt(R.T, R.s).w, side = R.lat > 0 ? -1 : 1;
    R.motos.forEach((m, k) => {
      Object.assign(m, { alive: true, fallT: 0, river: false, mode: 'pass', throws: 0, tt: 0, wait: 0, k, s: R.s - 26 - k * 7, lat: side * Math.min(w / 2 - 1, 1.5 + k * 1.6) });
      m.mesh.visible = true;
      m.mesh.rotation.z = 0;
      m.mesh.position.y = 0;
    });
    if (R.motos.length) sound('race.gang');
    return true;
  }
  // Sự cố "ram" (bán tải húc): lên ngang hông ở bên còn chỗ (thấy rõ), nháy đèn + còi, rồi tạt ngang vào làn mình
  // Né: phanh gấp / lách ra xa phía bên kia. Đường hẹp (< 9 m) không đủ chỗ chạy song song → đợi đường rộng
  raceRamGo() {
    const R = this.race, T = R.truck, w = trackAt(R.T, R.s).w;
    if (!T?.active || T.stop != null || w < 9 || !this.raceQuiet(0, 0, 70) || this.raceLaneBusy(R.s, R.lat, 0, 45)) return false; // đường đông vẫn húc được, miễn làn mình + làn bên cạnh trống
    // bên nào còn chỗ + trống xe thì lên bên đó (ưu tiên phía làn cùng chiều — bên phải, lat âm)
    const side = [-1, 1].sort((p, q) => (R.lat + p * 3.2 > 0.5) - (R.lat + q * 3.2 > 0.5)).find((sd) => Math.abs(R.lat + sd * 3.2) < w / 2 - 1.1 && !this.raceLaneBusy(R.s, R.lat + sd * 3.2, 30, 10));
    if (side == null) return false;
    R.ram = { ph: 'come', t: 0, side };
    return true;
  }
  raceRamTick(dt, vP) {
    const R = this.race, T = R.truck, M = R.ram, w = trackAt(R.T, T.s).w;
    M.t += dt;
    if (M.ph === 'come' && Math.abs(R.lat + M.side * 3.2) > w / 2 - 1.1 && Math.abs(R.lat - M.side * 3.2) <= w / 2 - 1.1) M.side = -M.side; // mình lách sát lề: đổi qua hông bên kia
    const beside = Math.max(-w / 2 + 1.1, Math.min(w / 2 - 1.1, R.lat + M.side * 3.2));
    const blink = (on) => T.lamps.forEach((l) => (l.visible = on));
    if (M.ph === 'come') { // ra làn bên cạnh trước, rồi rồ ga lên ngang hông mình
      const behind = T.s < R.s - 7, blk = this.raceLaneBusy(T.s, beside, 1, 12, 0.6, true);
      const tl = blk && behind ? R.lat : beside; // làn bên cạnh có xe chắn: núp sau đuôi mình chờ làn trống
      T.lat += (tl - T.lat) * Math.min(1, dt * 3);
      let v;
      if (blk) v = behind ? Math.min(vP + 2, vP + (R.s - 8 - T.s)) : Math.min(vP - 2, Math.max(0, blk.v ?? 0));
      else v = Math.abs(T.lat - R.lat) > 2.4 ? vP + Math.max(-4, Math.min(14, (R.s + 0.5 - T.s) * 0.9)) : Math.min(vP + 2, vP + (R.s - 8 - T.s)); // khác làn mình rồi mới rồ lên
      T.s += v * dt;
      if (Math.abs(T.s - (R.s + 0.5)) < 1.2 && Math.abs(T.lat - beside) < 0.6) { M.ph = 'warn'; M.t = 0; M.v = vP; sound('city.truckHorn'); }
      else if (M.t > 7) { M.ph = 'back'; M.t = 0; blink(false); } // kẹt xe quá lâu: thôi, tụt về sau
    } else if (M.ph === 'warn') { // chạy song song 1,2 giây (giữ tốc độ của nó — mình phanh gấp là nó vọt lên trước), nháy đèn, bóp còi
      T.s += M.v * dt;
      T.lat = beside;
      blink(Math.floor(M.t * 8) % 2 === 0);
      if (this.raceLaneBusy(T.s, T.lat, 0, 7, 0.4, true)) { M.ph = 'back'; M.t = 0; blink(false); } // xe phía trước chắn: thôi húc (luôn cảnh báo đủ 1,2 giây mới tạt)
      else if (M.t > 1.2) { M.ph = 'swerve'; M.t = 0; M.to = R.lat - M.side * 0.5; sound('race.whoosh'); }
    } else if (M.ph === 'swerve') { // tạt ngang vào chỗ mình đang chạy lúc đó, giữ nguyên tốc độ
      T.s += M.v * dt;
      T.lat += Math.sign(M.to - T.lat) * Math.min(Math.abs(M.to - T.lat), 3.4 * dt);
      blink(Math.floor(M.t * 8) % 2 === 0);
      if (!M.hit && Math.abs(T.s - R.s) < 2.7 && Math.abs(T.lat - R.lat) < 1.55 && R.crashT <= 0 && !(R.safeT > 0) && !R.jump) { M.hit = true; this.raceCrash(R.lat > T.lat ? 1 : -1); }
      if (M.hit || M.t > 1.6) { M.ph = 'back'; M.t = 0; blink(false); }
    } else { // húc xong / hụt: né ra làn bên cạnh rồi phanh, tụt về sau lưng
      T.lat += (beside - T.lat) * Math.min(1, dt * 2.5);
      let v = Math.max(0, vP - (Math.abs(T.lat - beside) < 0.8 ? 9 : -2));
      const blk = this.raceLaneBusy(T.s, T.lat, 0, 9, 0.6, true);
      if (blk) v = Math.min(v, Math.max(0, blk.v ?? 0));
      T.s += v * dt;
      if (T.s < R.s - RACE.chaseGap) R.ram = null;
    }
    T.lat = Math.max(-w / 2 + 1.1, Math.min(w / 2 - 1.1, T.lat));
  }
  raceChaseTick(dt) {
    const R = this.race, b = this.bike, vP = R.crashT > 0 ? 0 : Math.max(0, b.speed);
    let gap = Infinity;
    const place = (o, s, lat, y = 0) => { const p = trackAt(R.T, s, lat); o.mesh.position.set(p.x + R.ox, y, p.z + R.oz); o.mesh.rotation.y = p.h; };
    // ---- 2 xe giang hồ ném gạch (chỉ chạy khi có sự cố "throwers") ----
    for (const m of R.motos) {
      if (!m.mode) continue;
      if (!m.alive) { // bị mình tông té
        m.fallT += dt;
        m.mesh.rotation.z = Math.min(1.4, m.fallT * 3);
        if (m.fallT >= 3 || m.s < R.s - 60) { m.mode = null; m.mesh.visible = false; }
        continue;
      }
      const w = trackAt(R.T, m.s).w, mate = R.motos.find((x) => x !== m && x.mode && x.alive)?.lat; // xe kia: khỏi chạy chung làn
      let want = m.lat, v;
      if (m.mode === 'pass') { // vượt lên ở làn xa người chơi, khác làn xe kia (đường hẹp: chạy nối đuôi nhau, cách mình 1,7 m)
        v = vP + 8;
        const narrow = w < 8, l = this.raceFreeLat(m.s, m.lat, w, 6, 40, narrow || mate == null ? [R.lat] : [R.lat, mate], false, narrow ? 1.7 : 2.2);
        if (l != null) want = l;
        else { v = Math.min(v, vP - 1); m.wait = (m.wait || 0) + dt; if (m.wait > 8) m.mode = 'away'; } // chưa có chỗ vượt: bám sau chờ
        if (m.s > R.s + (m.k ? 19 : 26)) { m.mode = 'throw'; m.tt = 0.5 + m.k * 0.8; } // 2 xe ném so le
      } else if (m.mode === 'throw') { // chạy trước người chơi 28 m (xe đầu) / 21 m (xe sau), đứa ngồi sau quay ra ném 3 cục gạch
        v = vP + (R.s + (m.k ? 21 : 28) - m.s) * 0.8;
        m.tt -= dt;
        if (m.tt <= 0) { m.tt = 1.6; m.throws += 1; m.armT = 0.5; this.raceBrickThrow(m, vP); }
        if (m.throws >= 3 || this.raceLaneBusy(m.s, m.lat, 2, 25)) m.mode = 'away';
      } else { // ném xong: rồ ga phóng đi mất (chạy theo làn trống)
        v = vP + 12;
        const l = this.raceFreeLat(m.s, m.lat, w, 2, 30, mate != null ? [mate] : null);
        if (l != null) want = l;
        else { const blk = this.raceLaneBusy(m.s, m.lat, 0, 12); if (blk) v = Math.min(v, Math.max(0, blk.v ?? 0)); }
        if (m.s > R.s + 140 || m.s < R.s - 60) { m.mode = null; m.mesh.visible = false; continue; }
      }
      const front = R.motos.find((x) => x !== m && x.mode && x.alive && x.s > m.s - 0.5 && Math.abs(x.lat - m.lat) < 1.2);
      m.s += v * dt;
      if (front && front.s - m.s < 6 && !(m.s > front.s)) m.s = Math.min(m.s, front.s - 6); // chung làn: chạy nối đuôi, cách xe kia ≥ 6 m
      m.lat += (Math.max(-w / 2 + 0.8, Math.min(w / 2 - 0.8, want)) - m.lat) * Math.min(1, dt * 3);
      place(m, m.s, m.lat);
      // đứa ngồi sau: lúc ném quay người ra sau, vung tay
      if (m.back) {
        const turn = m.mode === 'throw' ? Math.PI : 0;
        m.back.rotation.y += (turn - m.back.rotation.y) * Math.min(1, dt * 6);
        const P = m.back.userData.parts;
        if (P) { m.armT = Math.max(0, (m.armT || 0) - dt); P.armR.rotation.x = m.mode === 'throw' ? (m.armT > 0 ? -2.8 + (0.5 - m.armT) * 5 : -2.6) : -0.55; }
      }
      // người chơi tông vào xe giang hồ → nó té, mình chao xe
      if (Math.abs(m.s - R.s) < 1.6 && Math.abs(m.lat - R.lat) < 0.9 && R.crashT <= 0 && !R.jump) { this.raceMotoFall(m); b.speed *= 0.8; this.shake = 0.5; }
    }
    // ---- bán tải Tí Đô: kẻ rượt duy nhất — thanh khoảng cách & "bị tóm" chỉ tính xe này ----
    const t = R.truck;
    if (t?.active) {
      if (t.stop != null) { // tới cầu cất: phanh rít, dừng trước chân cầu
        t.v = Math.max(0, (t.v ?? vP) - 13 * dt);
        t.s = Math.min(t.s + t.v * dt, t.stop);
      } else if (R.ram) this.raceRamTick(dt, vP);
      else {
        // bị bỏ xa thì rồ hết cỡ đuổi theo (kẻ rượt duy nhất — không để mất hút) · chướng ngại thì húc văng luôn, chỉ né xe cộ
        t.s += chaseSpeed(R.s - t.s, vP, R.s - t.s > 60 ? RACE.truck + 8 : RACE.truck, RACE.chaseGap + 6) * dt;
        t.s = Math.min(t.s, R.s - 4);
        const w = trackAt(R.T, t.s).w, l = this.raceFreeLat(t.s, Math.sin(R.t * 0.4) * 1.5, w, 7, 12, null, true);
        if (l == null) { const blk = this.raceLaneBusy(t.s, t.lat ?? 0, 0, 14, 1.3, true); if (blk) t.s = Math.min(t.s, blk.s - (blk.len || 2) / 2 - 8); }
        t.lat = (t.lat ?? 0) + ((l ?? t.lat ?? 0) - (t.lat ?? 0)) * Math.min(1, dt * 2);
        t.v = vP;
      }
      place(t, t.s, t.lat ?? 0);
      if (!R.ram && t.stop == null && t.s <= R.s) gap = R.s - t.s; // đang húc / đã dừng ở cầu: không tính bám lưng
    }
    this.raceBricksTick(dt);
    R.gap = gap;
    R.hudGap = R.ram && R.ram.ph !== 'back' ? 0 : gap; // đang ép húc: thanh báo đỏ
    if (R.done || R.lost) return;
    if (gap < RACE.caughtGap) R.caughtT += dt; else R.caughtT = Math.max(0, R.caughtT - dt * 0.5);
    if (R.caughtT > RACE.caughtTime) this.raceLose('caught');
  }
  // Ném gạch: bay vòng cung về chỗ người chơi sắp tới (~0,9 giây nữa), trúng người = té · rơi xuống thì nằm trên đường (cán qua: xóc)
  raceBrickThrow(m, vP) {
    const R = this.race, T = 1.5, G = 6, mesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.22), new THREE.MeshStandardMaterial({ color: 0xc8603a, flatShading: true, emissive: 0x5a2010, emissiveIntensity: 0.5 }));
    this.scene.add(mesh);
    const ts = R.s + vP * T, tl = R.lat + (Math.random() - 0.5) * 0.6;
    R.bricks.push({ mesh, s: m.s, lat: m.lat, y: 1.8, vs: (ts - m.s) / T, vl: (tl - m.lat) / T, vy: (0.3 - 1.8) / T + 0.5 * G * T, g: G, t: 0 }); // bay vòng cung cao ~3 m, mất 1,5 giây
    sound('race.whoosh');
  }
  raceBricksTick(dt) {
    const R = this.race;
    for (const k of [...R.bricks]) {
      k.t += dt;
      k.s += k.vs * dt; k.lat += k.vl * dt; k.vy -= (k.g || 9.8) * dt; k.y += k.vy * dt;
      const p = trackAt(R.T, k.s, k.lat);
      k.mesh.position.set(p.x + R.ox, Math.max(0.03, k.y), p.z + R.oz);
      k.mesh.rotation.x += dt * 6; k.mesh.rotation.z += dt * 4;
      if (R.crashT <= 0 && !(R.safeT > 0) && !R.jump && Math.abs(k.s - R.s) < 1.0 && Math.abs(k.lat - R.lat) < 0.75 && k.y < 1.9 && k.y > 0.15) { // trúng người
        this.raceCrash(k.lat > R.lat ? -1 : 1);
        this.scene.remove(k.mesh); R.bricks.splice(R.bricks.indexOf(k), 1);
        continue;
      }
      if (k.y <= 0.05) { // rơi xuống đường: thành cục gạch nằm đó
        k.mesh.rotation.set(0, Math.random() * 3, 0);
        R.obs.push({ kind: 'brick', mesh: k.mesh, s: k.s, lat0: k.lat - 0.3, lat1: k.lat + 0.3, ds: 0.3, solid: true, t: 0 });
        R.bricks.splice(R.bricks.indexOf(k), 1);
        sound('race.bump');
      }
    }
  }
  // ---------- XE CỘ ----------
  raceTrafficTick(dt) {
    const R = this.race, b = this.bike;
    for (const v of R.traffic) {
      const near = v.s > R.s - 140 && v.s < R.s + 420;
      v.mesh.visible = near;
      if (!near) continue;
      // xe cùng chiều đang ở sau lưng mình, cùng làn: không tông từ phía sau — chạy chậm lại theo mình (giữ cách ~10 m)
      let vv = v.v;
      if (vv > 0 && v.s < R.s && R.s - v.s < 30 && Math.abs(v.lat - R.lat) < v.wid / 2 + 1.2) vv = Math.min(vv, Math.max(0, b.speed - 1) + Math.max(0, R.s - v.s - v.len / 2 - 10) * 0.5);
      v.s += vv * dt;
      const p = trackAt(R.T, v.s, v.lat);
      v.mesh.position.set(p.x + R.ox, 0, p.z + R.oz);
      v.mesh.rotation.y = p.h + (v.v < 0 ? Math.PI : 0);
      if (R.crashT > 0 || R.safeT > 0 || R.jump) continue;
      const ds = Math.abs(v.s - R.s), dl = Math.abs(v.lat - R.lat);
      if (ds < v.len / 2 + 1 && dl < v.wid / 2 + 0.45) {
        const rel = Math.abs(b.speed - v.v), side = R.lat > v.lat ? 1 : -1;
        // quẹt hông (chỉ chạm mép): bị xô ra, chậm lại · tông đuôi / đâm đầu xe ngược chiều: té
        if (dl > v.wid / 2 - 0.15 && v.v > 0) { const w = trackAt(R.T, R.s).w; this.racePlaceBike(R.s, Math.max(-w / 2 + 0.6, Math.min(w / 2 - 0.6, v.lat + side * (v.wid / 2 + 0.6))), b.speed * 0.88); this.shake = 0.3; sound('race.bump'); }
        else if (rel > 5) this.raceCrash(-side);
        else { b.speed = Math.max(0, v.v - 1); sound('race.bump'); }
      }
    }
  }
  // ---------- NHẢY QUA CẦU GÃY ----------
  raceJumpTick(dt) {
    const R = this.race, J = R.jump, b = this.bike;
    if (J.kind === 'draw') return this.raceDrawJumpTick(dt);
    J.t += dt;
    const d = Math.min(J.len, J.t * J.v), k = d / J.len;
    const p = trackAt(R.T, J.s0 + d, R.lat);
    b.pos.set(p.x + R.ox, 0, p.z + R.oz);
    b.mesh.position.set(b.pos.x, Math.sin(k * Math.PI) * 2.6, b.pos.z);
    b.mesh.rotation.x = -0.25 + k * 0.5;
    b.speed = J.v;
    if (d >= J.len) { R.jump = null; R.lock = false; b.mesh.rotation.x = 0; b.mesh.position.y = 0; this.shake = 0.6; sound('race.land'); }
  }
  // ---------- CẦU CẤT (cầu bẻ đôi đang mở): chạy lên dốc nửa cầu bên này, bay qua khe, đáp xuống nửa bên kia ----------
  // Cầu mở dần từ lúc mình còn cách giữa cầu RACE.bridgeOpen m — tới càng sớm cầu càng thấp. Dốc quá / chạy chậm quá = rớt sông.
  raceDrawbridgeSet(e, deg) {
    const pr = this.race.props[e.id];
    if (!pr) return;
    const a = (deg * Math.PI) / 180;
    pr.near.rotation.x = -a;
    pr.far.rotation.x = a;
  }
  raceDrawbridgeTick(e, ahead, dt) {
    const R = this.race, b = this.bike, L = RACE.leaf, pr = R.props[e.id];
    if (!e.started && ahead < RACE.bridgeOpen) { e.started = true; e.t = 0; sound('race.bridge'); }
    if (!e.started) return;
    if (!e.hold) e.t += dt; // đang chạy trên cầu: giữ nguyên độ nghiêng
    const deg = drawbridgeAngle(e.t);
    this.raceDrawbridgeSet(e, deg);
    if (pr?.lights) { const on = Math.floor(R.t * 3) % 2 === 0; pr.lights.forEach((l, i) => (l.visible = i % 2 ? on : !on)); } // đèn đỏ nháy xen kẽ
    if (ahead < -300) { e.done = true; return; }
    if (e.passed) return;
    // bán tải: thấy cầu mở thì phanh rít, dừng trước chân cầu
    if (R.truck?.active && R.truck.stop == null && ahead < L + 80) { R.truck.stop = e.s - L - 22; sound('race.brake'); }
    // tới chân cầu (bản lề nửa bên này)
    if (!R.jump && !R.lost && R.crashT <= 0 && R.s >= e.s - L - 0.6) {
      const v = Math.max(0, b.speed), r = drawbridgeJump(v, deg), w = trackAt(R.T, e.s).w;
      e.hold = true;
      if (r.why === 'steep' && !r.ok) { // dựng đứng quá: tông vào mặt cầu
        this.racePlaceBike(e.s - L - 0.8, R.lat, 0);
        this.shake = 0.8;
        sound('race.crash');
        this.raceLose('steep');
        return;
      }
      R.lock = true;
      R.jump = { kind: 'draw', e, a: (deg * Math.PI) / 180, ph: 'ramp', d: 0, v, x: e.s - L, y: 0, lat: Math.max(-w / 2 + 0.7, Math.min(w / 2 - 0.7, R.lat)) };
      sound('race.jump');
    }
  }
  raceDrawJumpTick(dt) {
    const R = this.race, J = R.jump, b = this.bike, e = J.e, L = RACE.leaf, g = RACE.g, c = e.s, a = J.a;
    const tip = L * Math.sin(a), farTip = c + L - L * Math.cos(a);
    let pitch = 0;
    if (J.ph === 'ramp') { // leo dốc nửa cầu: chậm dần theo độ dốc
      J.v -= g * Math.sin(a) * dt;
      J.d += Math.max(0, J.v) * dt;
      J.x = c - L + J.d * Math.cos(a);
      J.y = J.d * Math.sin(a);
      pitch = a;
      if (J.v <= 0.5) { J.ph = 'fall'; J.vx = -1; J.vy = 0; } // không đủ đà: tuột ngược, rớt xuống
      else if (J.d >= L) { J.ph = 'air'; J.vx = J.v * Math.cos(a); J.vy = J.v * Math.sin(a); J.y = tip; }
      b.speed = Math.max(0, J.v);
    } else if (J.ph === 'air') { // bay
      J.x += J.vx * dt;
      J.vy -= g * dt;
      J.y += J.vy * dt;
      pitch = Math.atan2(J.vy, J.vx) * 0.8;
      const surf = J.x < farTip ? null : J.x < c + L ? (c + L - J.x) * Math.tan(a) : 0;
      if (surf == null && J.vy < 0 && J.y < tip - 0.3) { J.ph = 'fall'; J.vx *= 0.3; } // hụt mép nửa bên kia: rớt xuống khe
      else if (surf != null && J.y <= surf) { J.y = surf; J.ph = J.x < c + L ? 'down' : 'land'; this.shake = 0.7; sound('race.land'); }
      b.speed = J.vx;
    } else if (J.ph === 'down') { // đáp xuống nửa bên kia, chạy xuống dốc
      J.x += J.vx * dt;
      J.y = Math.max(0, (c + L - J.x) * Math.tan(a));
      pitch = -a;
      if (J.x >= c + L) J.ph = 'land';
      b.speed = J.vx;
    } else if (J.ph === 'fall') { // rớt sông
      J.x += J.vx * dt;
      J.vy -= g * dt;
      J.y += J.vy * dt;
      pitch = Math.max(-1.2, J.vy * 0.06);
      b.speed = 0;
      if (J.y < -1 && !J.splash) { J.splash = true; sound('race.splash'); }
      if (J.y < -4 && !R.lost) this.raceLose('short');
      J.y = Math.max(-6, J.y);
    }
    const p = trackAt(R.T, J.x, J.lat);
    b.pos.set(p.x + R.ox, 0, p.z + R.oz);
    b.heading = p.h;
    b.vel?.set(Math.sin(p.h) * b.speed, Math.cos(p.h) * b.speed);
    b.mesh.position.set(b.pos.x, J.y, b.pos.z);
    b.mesh.rotation.x = -pitch;
    if (J.ph === 'land') { // xuống tới đường bên kia: chạy tiếp, cầu mở tiếp phía sau lưng
      R.jump = null;
      R.lock = false;
      e.passed = true;
      e.hold = false;
      b.mesh.rotation.x = 0;
      b.mesh.position.y = 0;
      b.speed = J.vx * 0.85;
      this.racePlaceBike(J.x, J.lat, b.speed);
    }
  }
  // ---------- CAMERA CỐ ĐỊNH SAU LƯNG XE (không xoay / phóng) ----------
  raceCamera(dt) {
    const b = this.bike, cam = this.camera;
    // bám sát sau lưng: không trễ theo chiều chạy, chỉ quay theo hướng xe mượt mà (đỡ chóng mặt khi lách)
    if (!this.raceCamInit || this.raceCamH == null) { this.raceCamH = b.heading; this.raceCamInit = true; }
    this.raceCamH += Math.atan2(Math.sin(b.heading - this.raceCamH), Math.cos(b.heading - this.raceCamH)) * Math.min(1, dt * 7);
    const h = this.raceCamH, fx = Math.sin(h), fz = Math.cos(h), y = Math.max(-1.2, b.mesh.position.y); // rớt sông: camera dừng trên mặt nước
    const sh = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.25 : 0;
    this.shake = Math.max(0, (this.shake || 0) - dt * 2);
    cam.position.set(b.pos.x - fx * 4.8 + sh, y + 2.55 + sh, b.pos.z - fz * 4.8);
    cam.lookAt(b.pos.x + fx * 7, y + 1.0, b.pos.z + fz * 7);
    const fov = 64 + Math.min(9, Math.max(0, b.speed) * 0.3); // càng nhanh càng rộng chút
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
  }
  raceHudUpdate() {
    const R = this.race;
    this.raceHud.update({ crashes: R.crashes, max: RACE.crashMax, gap: R.hudGap ?? R.gap, caught: R.caughtT / RACE.caughtTime, kmh: Math.max(0, this.bike.speed) * 3.6 });
  }
  // ---------- XONG / BỎ ----------
  raceStop() {
    const R = this.race;
    if (!R && !this.raceSaved) return;
    if (R) {
      for (const m of R.motos) this.scene.remove(m.mesh);
      if (R.truck) this.scene.remove(R.truck.mesh);
      for (const v of R.traffic) this.scene.remove(v.mesh);
      for (const f of R.fx) this.scene.remove(f.mesh);
      for (const o of [...R.obs, ...R.bricks]) this.scene.remove(o.mesh);
    }
    this.race = null;
    this.raceCamInit = false;
    this.raceHud?.show(false);
    this.hud.el.classList.remove('in-race');
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    // trả xe của người chơi về như cũ (đúng chỗ, đúng kiểu xe, xăng)
    const S = this.raceSaved;
    if (S) {
      const b = this.bike;
      if (this.mode === 'bike') act.dismount(this);
      for (const ac of Object.values(this.storyActors || {})) if (ac.seated) this.storyActorAlight?.(Object.keys(this.storyActors).find((k) => this.storyActors[k] === ac));
      b.setSpec(S.spec);
      b.pos.copy(S.pos);
      b.heading = S.heading;
      b.speed = 0;
      b.mesh.position.set(S.pos.x, 0, S.pos.z);
      b.mesh.rotation.set(0, S.heading, 0);
      this.gs.fuel = S.fuel;
      this.raceSaved = null;
    }
  }
}
