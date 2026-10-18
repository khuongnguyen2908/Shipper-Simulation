// =============================================================
// GAME — CẢNH PHIM NÂNG CAO (cốt truyện): đạo cụ (xe tải, tấm ván, chó), mốc lộ trình, khói lốp, né xe, drift / té xe / chặn đầu,
// xe người chơi tự chạy theo trong lúc chiếu, xuống xe + tháo nón (giơ tay gỡ nón xuống, cầm trên tay).
// Phần của lớp Game (src/game.js): gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// Chỉ để nhìn, chỉ máy người chơi này vẽ (cốt truyện riêng); đồng hồ chung vẫn chạy (quay chậm chỉ làm chậm diễn viên + camera).
// =============================================================
import * as THREE from 'three';
import { makeDog, makePerson, makeCar, makeNpcMoto, bikeSeatZ, animatePerson } from '../world/models.js';
import { makeRng } from '../sim/rng.js';
import { storyEvent } from '../sim/story.js';
import { makeHelmetMesh, HEAD_CENTER_Y } from '../world/person.js';
import { makeLongTruck, makeRamp, makeEasel, makeBin, makeCan } from '../world/storyProps.js';
import { makeCsgtCar, seatRider } from '../world/npcVehicles.js';
import { lerpAngle } from '../world/controllers.js';
import { CITY, roadPos } from '../sim/cityLayout.js';
import * as act from '../interactions.js';
import { sound, loopSound } from '../audio.js';
import { fmt } from '../content/index.js';

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class ScenePart {
  // ---------- quay chậm: hệ số thời gian của cảnh (diễn viên, đạo cụ, khói) — chỉ khi cảnh quay đang chiếu có "slow" ----------
  sceneScale() {
    return this.cine ? this.cine.slow ?? 1 : 1;
  }

  // ---------- MỐC LỘ TRÌNH: diễn viên chạy qua điểm có "mark" → ghi "who:mark" (đạo cụ / cảnh quay chờ mốc này) ----------
  sceneMark(who, mark) {
    (this.sceneMarks ||= new Set()).add(`${who}:${mark}`);
  }
  sceneHas(key) {
    return !!key && !!this.sceneMarks?.has(key);
  }

  // ---------- ĐẠO CỤ (việc "prop"): xe tải chạy ra chặn đường · tấm ván làm dốc · chó chạy ngang ----------
  // a: { id, kind: truck | ramp | dog | car | moto | police, at: [x, z], heading (độ, hướng đầu xe / đầu dốc lên), route: [{ at: [x, z], wait, speed }], speed, when: 'who:mark', len, h }
  // police: xe CẢNH SÁT đèn chớp; chạy tới cuối đường (keep) thì cops anh công an bước xuống, đi tới chỗ copsTo ('actor:<mã>') đứng quanh đó
  storyPropSpawn(a) {
    this.storyProps ||= {};
    this.storyPropRemove(a.id);
    const color = a.color ? parseInt(String(a.color).slice(1), 16) : null, rng = makeRng([...String(a.id)].reduce((h, c) => h * 31 + c.charCodeAt(0), 11));
    const mesh = a.kind === 'truck' ? makeLongTruck() : a.kind === 'ramp' ? makeRamp({ len: a.len ?? 7, h: a.h ?? 1.5 }) : a.kind === 'dog' ? makeDog(0xd9a15b)
      : a.kind === 'car' ? makeCar(color ?? rng.pick([0xc0392b, 0x2c3e50, 0xecf0f1, 0x7f8c8d, 0x2980b9]), a.model || null) // xe diễn viên trong cảnh phim (thay xe thường)
      : a.kind === 'moto' ? makeNpcMoto(color ?? rng.pick([0x1f6fd1, 0xc0392b, 0x27ae60, 0x8e44ad, 0x2c3e50]), rng)
      : a.kind === 'police' ? makeCsgtCar(fmt('story.policeCar'))
      : a.kind === 'easel' ? makeEasel([...String(a.id)].reduce((h, c) => h + c.charCodeAt(0), 0)) // giá vẽ + tranh (triển lãm)
      : a.kind === 'bin' ? makeBin() // thùng rác (chỗ núp)
      : a.kind === 'can' ? makeCan() : null;
    if (!mesh) return;
    const route = (a.route || []).filter((r) => Array.isArray(r?.at)).map((r) => ({ x: r.at[0], z: r.at[1], wait: r.wait || 0, speed: r.speed }));
    const start = route[0] || (Array.isArray(a.at) ? { x: a.at[0], z: a.at[1] } : null);
    if (!start) return;
    mesh.position.set(start.x, this.city.elev?.topAt(start.x, start.z) ?? 0, start.z);
    mesh.rotation.y = route.length > 1 ? Math.atan2(route[1].x - start.x, route[1].z - start.z) : ((a.heading ?? 0) * Math.PI) / 180;
    mesh.visible = !a.when;
    this.scene.add(mesh);
    this.storyProps[a.id] = { mesh, def: a, route, i: 0, v: 0, wait: 0, on: !a.when, done: route.length < 2, t: 0 };
    // thùng rác: vật cản thật (người, xe không đi xuyên qua) — dọn đạo cụ thì gỡ ra
    if (a.kind === 'bin') {
      const r = 0.34;
      this.storyProps[a.id].solid = { x0: start.x - r, z0: start.z - r, x1: start.x + r, z1: start.z + r, h: 1.05, tag: 'prop' };
      this.city.grid.add(this.storyProps[a.id].solid);
    }
  }
  storyPropRemove(id) {
    const p = this.storyProps?.[id];
    if (!p) return;
    if (p.solid) this.city.grid.remove(p.solid);
    if (this.walker.crouch && p.def.kind === 'bin') this.walker.leaveCrouch(); // thùng đang núp bị dọn → đứng dậy
    this.scene.remove(p.mesh);
    for (const m of p.cops || []) this.scene.remove(m.mesh);
    this.bubbles?.remove(`story:prop:${id}`);
    delete this.storyProps[id];
  }
  storyPropsClear() {
    for (const id of Object.keys(this.storyProps || {})) this.storyPropRemove(id);
    for (const s of this.sceneSmokes || []) this.scene.remove(s.mesh);
    this.sceneSmokes = [];
    this.sceneMarks = new Set();
  }
  storyPropsTick(dt) {
    for (const [id, p] of Object.entries(this.storyProps || {})) {
      const a = p.def;
      if (!p.on) {
        if (!this.sceneHas(a.when)) continue;
        p.on = true;
        p.mesh.visible = true;
        p.v = p.route[1]?.speed ?? a.speed ?? 8; // xuất hiện là đang chạy sẵn (lao ra), không đề-pa từ 0
        if (a.sound) sound(a.sound);
      }
      p.t += dt;
      const lt = p.mesh.userData.lights; // đèn xanh đỏ trên nóc xe công an chớp liên tục
      if (lt) { const on = Math.floor(p.t * 4) % 2 === 0; lt[0].visible = on; lt[1].visible = !on; }
      if (p.cops) this.copsTick(p, dt);
      if (p.done) continue;
      if (p.wait > 0) { p.wait -= dt; continue; }
      const A = p.route[p.i], B = p.route[p.i + 1];
      const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1;
      const pos = p.mesh.position, left = Math.hypot(B.x - pos.x, B.z - pos.z);
      const top = B.speed ?? a.speed ?? 8;
      // tăng tốc dần, sắp tới điểm có "wait" (hoặc điểm cuối mà giữ lại) thì phanh dần dừng đúng chỗ
      const stopAt = B.wait > 0 || (p.i + 2 >= p.route.length && a.keep);
      const want = stopAt ? Math.min(top, Math.sqrt(2 * 12 * left)) : top; // phanh gấp ~12 đơn vị/giây²
      p.v += Math.max(-14 * dt, Math.min(6 * dt, want - p.v));
      const step = Math.min(left, p.v * dt);
      pos.x += (dx / L) * step;
      pos.z += (dz / L) * step;
      pos.y = this.city.elev?.topAt(pos.x, pos.z) ?? 0;
      p.mesh.rotation.y = lerpAngle(p.mesh.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-6 * dt));
      for (const w of p.mesh.userData.wheels || []) w.rotation.x += (step / (p.mesh.userData.wheelR || 0.5));
      if (a.kind === 'dog') p.mesh.position.y += Math.abs(Math.sin(p.t * 16)) * 0.08; // chạy nhún
      if (left - step < 0.05) {
        p.i += 1;
        p.wait = B.wait || 0;
        if (B.wait) p.v = 0;
        if (p.i + 1 >= p.route.length) {
          p.done = true;
          if (!a.keep) this.storyPropRemove(id); // chạy hết đường: đi khỏi cảnh
          else if (a.kind === 'police') this.copsSpawn(p);
        }
      }
    }
    this.smokeTick(dt);
  }

  // Xe công an dừng: các anh công an (đồng phục cảnh sát khu vực: áo vàng, quần xanh, mũ kêpi) bước xuống 2 bên xe
  copsSpawn(p) {
    const n = Math.max(1, Math.min(4, p.def.cops ?? 2)), h = p.mesh.rotation.y, c = p.mesh.position;
    p.cops = [];
    for (let k = 0; k < n; k++) {
      const s = k % 2 ? -1 : 1, mesh = makePerson({ shirt: 0xd8c25a, pants: 0x2e5d3a, hat: 'police', shirtStyle: 'police' });
      mesh.position.set(c.x + Math.cos(h) * 1.4 * s - Math.sin(h) * 0.4 * k, c.y, c.z - Math.sin(h) * 1.4 * s - Math.cos(h) * 0.4 * k);
      mesh.rotation.y = h;
      this.scene.add(mesh);
      p.cops.push({ mesh, phase: 0, slot: k });
    }
  }
  // Các anh công an đi tới người cần áp giải (copsTo), đứng vòng quanh cách ~1,3 m
  copsTick(p, dt) {
    const tg = p.def.copsTo ? this.cineTarget(p.def.copsTo)?.T : null;
    for (const cp of p.cops) {
      const m = cp.mesh.position;
      if (!tg) continue;
      const ang = cp.slot * 1.9 + 0.6, tx = tg.x + Math.sin(ang) * 1.3, tz = tg.z + Math.cos(ang) * 1.3;
      const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
      const v = d > 0.15 ? Math.min(1.7, d * 2) : 0;
      if (v) { m.x += (dx / d) * v * dt; m.z += (dz / d) * v * dt; cp.mesh.rotation.y = lerpAngle(cp.mesh.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt)); }
      else cp.mesh.rotation.y = lerpAngle(cp.mesh.rotation.y, Math.atan2(tg.x - m.x, tg.z - m.z), 1 - Math.exp(-6 * dt));
      cp.phase += dt * (5 + v);
      this.animateRunner(cp.mesh, cp.phase, Math.min(1, v / 1.7) * 0.55);
    }
  }

  // ---------- KHÓI LỐP (drift, thắng gấp, té xe) ----------
  sceneSmoke(x, y, z, n = 3) {
    this.sceneSmokes ||= [];
    this.smokeMat ||= new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.55, depthWrite: false });
    this.smokeGeo ||= new THREE.IcosahedronGeometry(0.35, 0);
    for (let k = 0; k < n && this.sceneSmokes.length < 60; k++) {
      const m = new THREE.Mesh(this.smokeGeo, this.smokeMat.clone());
      m.position.set(x + (Math.random() - 0.5) * 0.6, y + 0.2, z + (Math.random() - 0.5) * 0.6); // chỉ để nhìn, mỗi máy tự vẽ
      this.scene.add(m);
      this.sceneSmokes.push({ mesh: m, t: 0, life: 1.1 + Math.random() * 0.5 });
    }
  }
  smokeTick(dt) {
    if (!this.sceneSmokes?.length) return;
    this.sceneSmokes = this.sceneSmokes.filter((s) => {
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) { this.scene.remove(s.mesh); return false; }
      s.mesh.scale.setScalar(1 + k * 3);
      s.mesh.position.y += dt * 0.6;
      s.mesh.material.opacity = 0.55 * (1 - k);
      return true;
    });
  }

  // ---------- NÉ XE: lệch ngang khỏi xe máy / ô tô / người / chó phía trước (việc "chase" có dodge) ----------
  chaseDodge(c, pos, h, dt) {
    const fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx; // phía trước · bên phải
    const props = Object.values(this.storyProps || {}).filter((p) => p.on && (p.def.kind === 'car' || p.def.kind === 'moto')).map((p) => p.mesh.position); // xe diễn viên
    const obs = [...(this.traffic?.agents || []).filter((a) => !a.held && !a.off), ...(this.traffic?.peds || []), ...(this.traffic?.dogs || []), ...(this.bgTraffic?.bikes || []).filter((b) => b.on), ...props];
    let want = 0, near = Infinity;
    for (const o of obs) {
      const ox = o.x - pos.x, oz = o.z - pos.z, along = ox * fx + oz * fz;
      if (along < -3 || along > 14) continue; // cả lúc đang chạy ngang hàng / vừa vượt qua: giữ khoảng né tới khi qua hẳn
      const side = ox * rx + oz * rz; // so với chỗ xe đang chạy: >0 vật ở bên phải
      if (Math.abs(side) < 2.1 && Math.abs(along) < near) {
        near = Math.abs(along);
        const lane = side + (c.lat || 0); // vị trí vật so với giữa làn
        want = side > 0 ? lane - 2.5 : lane + 2.5; // vật ở bên phải → lạng trái, ngược lại
      }
    }
    want = Math.max(-3.4, Math.min(2.6, want)) + Math.sin((c.weave = (c.weave || 0) + dt * 2.3)) * 0.35; // lắc nhẹ cho có vẻ lạng lách
    c.lat = (c.lat || 0) + (want - (c.lat || 0)) * (1 - Math.exp(-(near < 14 ? 7 : 2.5) * dt));
  }

  // ---------- HÀNH ĐỘNG Ở ĐIỂM LỘ TRÌNH (act): drift · crash (té xe → bỏ xe chạy bộ) ----------
  chaseAct(who, ac, p, k) {
    const c = ac.chase;
    if (p.act === 'drift') {
      // quẹo gắt: đuôi xe văng ra ngoài, khói lốp, rít lốp
      const a0 = k > 0 ? Math.atan2(c.path[k].x - c.path[k - 1].x, c.path[k].z - c.path[k - 1].z) : c.heading ?? 0;
      const nx = c.path[Math.min(c.path.length - 1, k + 2)], a1 = Math.atan2(nx.x - p.x, nx.z - p.z);
      c.drift = { t: 0, dir: Math.sign(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))) || 1 };
      sound('drive.skid');
    } else if (p.act === 'crash' && !c.crash) {
      c.crash = { t: 0, v: Math.max(4, c.v), h: c.heading ?? 0 };
      if (!p.sound) sound('city.bikeFall'); // điểm có tiếng riêng (vd city.thiefCrash) thì đã phát sớm cho khớp ở chaseSounds
      this.chaseEngine(ac, false);
    }
  }
  // Té xe: xe đổ nghiêng, trượt dài rồi nằm im; 0,8 giây sau người lồm cồm đứng dậy, bỏ xe chạy bộ tiếp theo lộ trình
  chaseCrashTick(who, ac, dt) {
    const c = ac.chase, cr = c.crash, bike = ac.vehicle;
    cr.t += dt;
    cr.v = Math.max(0, cr.v - 9 * dt);
    bike.position.x += Math.sin(cr.h) * cr.v * dt;
    bike.position.z += Math.cos(cr.h) * cr.v * dt;
    bike.rotation.z += (1.45 - bike.rotation.z) * (1 - Math.exp(-10 * dt));
    bike.rotation.x = 0;
    bike.position.y = (this.city.elev?.topAt(bike.position.x, bike.position.z) ?? 0) + 0.12;
    if (cr.v > 1) this.sceneSmoke(bike.position.x, bike.position.y, bike.position.z, 1);
    if (cr.t > 0.8 && !c.runner) {
      ac.rider?.parent?.remove(ac.rider);
      const mesh = makePerson({ ...ac.look, face: null });
      mesh.position.copy(bike.position).setY(bike.position.y - 0.12);
      mesh.rotation.y = cr.h;
      this.scene.add(mesh);
      c.runner = { mesh, s: this.chaseNearS(c, bike.position) + 1.5, v: 0, phase: 0 };
      ac.mesh = mesh; // nói chuyện / bong bóng / camera theo người chạy bộ
    }
    const r = c.runner;
    if (!r) return;
    const top = ac.def.runSpeed ?? 4.5;
    if (r.blocked || r.s >= c.total - 0.5) r.v = Math.max(0, r.v - 12 * dt);
    else r.v = Math.min(top, r.v + 8 * dt);
    r.s = Math.min(c.total, r.s + r.v * dt);
    const p = this.chaseAt(c, r.s);
    r.mesh.position.set(p.x, this.city.elev?.topAt(p.x, p.z) ?? 0, p.z);
    // bị chặn: quay mặt về người chặn đường
    const by = r.blocked && this.storyActors?.[r.blocked]?.vehicle?.position;
    r.mesh.rotation.y = by ? lerpAngle(r.mesh.rotation.y, Math.atan2(by.x - p.x, by.z - p.z), 1 - Math.exp(-6 * dt)) : p.h;
    r.phase += dt * (5 + r.v);
    this.animateRunner(r.mesh, r.phase, Math.min(1, r.v / top));
  }
  animateRunner(mesh, phase, amount) {
    const p = mesh.userData.parts;
    if (!p) return;
    const s = Math.sin(phase), a = s * 0.6 * amount;
    p.legL.rotation.x = a; p.legR.rotation.x = -a;
    p.kneeL.rotation.x = (0.08 + Math.max(0, s) * 0.9) * amount; p.kneeR.rotation.x = (0.08 + Math.max(0, -s) * 0.9) * amount;
    p.armL.rotation.x = -a * 0.8; p.armR.rotation.x = a * 0.8;
    p.elbowL.rotation.x = p.elbowR.rotation.x = -0.15 - 0.35 * amount;
  }

  // ---------- CHẶN ĐẦU: người đuổi theo (follow) vượt lên trước người đang chạy bộ, thắng gấp xoay ngang xe chặn đường ----------
  chaseBlockTick(who, ac, dt) {
    const c = ac.chase, bike = ac.vehicle, tgt = this.storyActors?.[ac.def.follow]?.chase?.runner;
    if (!tgt) return;
    const tp = tgt.mesh.position, th = tgt.mesh.rotation.y;
    const T = { x: tp.x + Math.sin(th) * 4.2 + Math.cos(th) * 0.6, z: tp.z + Math.cos(th) * 4.2 - Math.sin(th) * 0.6 }; // trước mặt người chạy ~4 m
    const pos = bike.position, dx = T.x - pos.x, dz = T.z - pos.z, d = Math.hypot(dx, dz);
    const b = c.block;
    b.t += dt;
    if (!b.skid && d < 6) { b.skid = true; sound('drive.skid'); }
    const want = b.skid ? Math.max(0, Math.min(c.v, d * 2.2)) : Math.min(ac.def.speed ?? 20, Math.max(8, d * 1.5));
    c.v += Math.max(-16 * dt, Math.min(10 * dt, want - c.v));
    if (d > 0.05) {
      const step = Math.min(d, c.v * dt);
      pos.x += (dx / d) * step;
      pos.z += (dz / d) * step;
    }
    // hướng xe: đi tới thì nhìn theo đường đi · thắng gấp thì xoay ngang chắn trước mặt người chạy
    const goal = b.skid ? th + Math.PI / 2 : Math.atan2(dx, dz);
    c.heading = lerpAngle(c.heading ?? goal, goal, 1 - Math.exp(-(b.skid ? 5 : 8) * dt));
    bike.rotation.set(0, c.heading, b.skid ? -0.12 * Math.min(1, c.v / 6) : 0, 'YXZ');
    pos.y = this.city.elev?.topAt(pos.x, pos.z) ?? 0;
    if (b.skid && c.v > 1) this.sceneSmoke(pos.x, pos.y, pos.z, 1);
    this.chaseEngine(ac);
    if (b.skid && c.v < 0.3) {
      c.v = 0;
      c.done = true;
      tgt.blocked = who;
    }
  }

  // ---------- XE NGƯỜI CHƠI TỰ CHẠY THEO trong lúc chiếu cảnh phim (cine.ride): theo lộ trình người bị đuổi, dừng cách người đó rideStop ----------
  cineRide(dt) {
    const r = this.cine.ride, ac = this.storyActors?.[r.who], c = ac?.chase, b = this.bike;
    if (!c || this.mode !== 'bike') return 0;
    dt *= this.sceneScale();
    if (r.s == null) r.s = this.chaseNearS(c, b.pos);
    const lead = c.runner ? c.runner.s : c.s;
    const left = Math.max(0, lead - r.stop - r.s);
    const want = Math.min(r.speed, Math.sqrt(2 * 5 * left));
    r.v = (r.v ?? Math.abs(b.speed)) + Math.max(-8 * dt, Math.min(5 * dt, want - (r.v ?? 0)));
    const step = Math.max(0, Math.min(left, r.v * dt));
    r.s += step;
    const p = this.chaseAt(c, r.s);
    if (r.v > 2) this.chaseDodge(r, b.pos, p.h, dt); else if (r.lat) r.lat *= Math.exp(-3 * dt); // né xe diễn viên như 2 xe dí
    p.x -= Math.cos(p.h) * (r.lat || 0); p.z += Math.sin(p.h) * (r.lat || 0);
    const y = this.city.elev?.topAt(p.x, p.z) ?? 0;
    b.pos.set(p.x, b.pos.y, p.z);
    b.heading = lerpAngle(b.heading, p.h, 1 - Math.exp(-8 * dt));
    b.speed = r.v;
    b.vel?.set(Math.sin(b.heading) * r.v, Math.cos(b.heading) * r.v);
    b.deckY = y > 0.3 ? y : null;
    b.mesh.position.set(p.x, y, p.z);
    b.mesh.rotation.set(0, b.heading, 0, 'YXZ');
    const ud = b.mesh.userData;
    ud.wheelF.rotation.x += step / ud.wheelRadius;
    ud.wheelR.rotation.x += step / ud.wheelRadius;
    return step;
  }

  // ---------- XUỐNG XE (việc "dismount"): người lạ đang ngồi xe (mô tô / người đuổi) đứng xuống cạnh xe, xe dựng lại ----------
  storyActorDismount(who) {
    const ac = this.storyActors?.[who];
    if (!ac?.vehicle || !ac.rider) return;
    this.chaseEngine(ac, false); // tắt máy
    const bike = ac.vehicle, h = bike.rotation.y;
    ac.rider.parent?.remove(ac.rider);
    ac.rider = null;
    bike.rotation.set(0, h, 0, 'YXZ');
    bike.position.y = this.city.elev?.topAt(bike.position.x, bike.position.z) ?? 0;
    const mesh = makePerson({ ...ac.look, face: null });
    mesh.position.set(bike.position.x + Math.cos(h) * 0.9, bike.position.y, bike.position.z - Math.sin(h) * 0.9); // đứng bên trái xe
    mesh.rotation.y = h;
    this.scene.add(mesh);
    if (ac.mesh !== bike) this.scene.remove(ac.mesh);
    ac.mesh = mesh;
    ac.mode = 'idle';
    ac.chase = null;
  }

  // ---------- THÁO NÓN (việc "helmetOff"): 2 tay giơ lên nắm nón, nhấc khỏi đầu (lộ tóc), hạ xuống cầm nón tay phải ----------
  // instant: mở lại game đã qua bước này → đặt ngay dáng cuối
  storyHelmetOff(who, instant = false) {
    const ac = this.storyActors?.[who];
    if (!ac || ac.look?.hat !== 'helmet' || ac.helmet) return;
    if (ac.vehicle && ac.rider) this.storyActorDismount(who);
    ac.helmet = { t: instant ? 99 : 0, swapped: false, color: ac.look.hatColor ?? 0x1c1c1c, style: ac.look.helmetStyle || 'full', look0: ac.look };
    if (!instant) sound('place.wear');
    this.helmetTick(ac, 0);
  }
  // Mỗi khung hình (sau animatePerson của người lạ): dáng tay theo thời gian
  helmetTick(ac, dt) {
    const H = ac.helmet;
    if (!H) return;
    H.t += dt;
    const t = H.t;
    const UP = [-2.75, -1.75], HIGH = [-3.0, -1.1], HOLD = [-0.35, -0.75], REST = [0, -0.15];
    const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    let L, R;
    if (t < 0.6) L = R = mix(REST, UP, ease(t / 0.6)); // giơ 2 tay lên nắm 2 bên nón
    else if (t < 1.1) L = R = mix(UP, HIGH, ease((t - 0.6) / 0.5)); // nhấc nón khỏi đầu
    else if (t < 1.8) { const k = ease((t - 1.1) / 0.7); L = mix(HIGH, REST, k); R = mix(HIGH, HOLD, k); } // hạ tay, tay phải cầm nón
    else { L = REST; R = HOLD; }
    if (H.on) return this.helmetOnTick(ac, H, dt);
    // tới lúc nhấc: thay hình người không nón (lộ tóc), nón thành vật rời trong tay
    if (t >= 0.6 && !H.swapped) {
      H.swapped = true;
      const old = ac.mesh, look = { ...ac.look, hat: null, face: null };
      const mesh = makePerson(look);
      mesh.position.copy(old.position);
      mesh.rotation.copy(old.rotation);
      old.parent?.add(mesh);
      old.parent?.remove(old);
      ac.mesh = mesh;
      ac.look = { ...ac.look, hat: null };
      H.mesh = makeHelmetMesh({ hatColor: H.color, helmetStyle: H.style });
      mesh.add(H.mesh);
    }
    const parts = ac.mesh.userData.parts;
    parts.pose = { ...(parts.pose || {}), armL: L, armR: R };
    [parts.armL.rotation.x, parts.elbowL.rotation.x] = L;
    [parts.armR.rotation.x, parts.elbowR.rotation.x] = R;
    if (H.mesh) {
      if (t < 1.1) {
        // giữa 2 tay trên đầu: từ đầu nhấc lên cao + ra trước
        const k = ease((t - 0.6) / 0.5);
        if (H.mesh.parent !== ac.mesh) ac.mesh.add(H.mesh);
        H.mesh.position.set(0, HEAD_CENTER_Y + k * 0.28, k * 0.12);
        H.mesh.rotation.set(-k * 0.3, 0, 0);
      } else if (H.mesh.parent !== parts.elbowR) {
        // cầm ở tay phải (bàn tay ở đầu cẳng tay)
        parts.elbowR.add(H.mesh);
        H.mesh.position.set(0, -0.36, 0.06);
        H.mesh.rotation.set(Math.PI * 0.45, 0, 0);
      }
    }
  }

  // ---------- ĐỘI NÓN LẠI (việc "helmetOn", ngược với tháo nón): 2 tay đưa nón đang cầm lên cao, chụp xuống đầu, hạ tay ----------
  // instant: mở lại game đã qua bước này → đội sẵn
  storyHelmetOn(who, instant = false) {
    const ac = this.storyActors?.[who], H = ac?.helmet;
    if (!H || H.on) return;
    if (!H.swapped || instant) return this.helmetOnDone(ac);
    H.on = { t: 0 };
    sound('place.wear');
  }
  helmetOnTick(ac, H, dt) {
    const O = H.on;
    O.t += dt;
    const t = O.t, UP = [-2.75, -1.75], HIGH = [-3.0, -1.1], HOLD = [-0.35, -0.75], REST = [0, -0.15];
    const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    let L, R;
    if (t < 0.6) { const k = ease(t / 0.6); L = mix(REST, HIGH, k); R = mix(HOLD, HIGH, k); } // đưa nón lên cao, 2 tay nắm 2 bên
    else if (t < 1.1) L = R = mix(HIGH, UP, ease((t - 0.6) / 0.5)); // chụp xuống đầu
    else if (t < 1.7) L = R = mix(UP, REST, ease((t - 1.1) / 0.6)); // hạ tay
    else return this.helmetOnDone(ac);
    const parts = ac.mesh.userData.parts;
    parts.pose = { ...(parts.pose || {}), armL: L, armR: R };
    [parts.armL.rotation.x, parts.elbowL.rotation.x] = L;
    [parts.armR.rotation.x, parts.elbowR.rotation.x] = R;
    if (t >= 0.25 && H.mesh) {
      // nón rời tay phải, nằm giữa 2 tay trên cao rồi hạ xuống đầu
      if (H.mesh.parent !== ac.mesh) ac.mesh.add(H.mesh);
      const k = t < 0.6 ? 1 : 1 - ease((t - 0.6) / 0.5);
      H.mesh.position.set(0, HEAD_CENTER_Y + k * 0.28, k * 0.12);
      H.mesh.rotation.set(-k * 0.3, 0, 0);
    }
    // nón chạm đầu: thay lại hình người đội nón (như lúc mới xuống xe)
    if (t >= 1.1 && !O.swapped) {
      O.swapped = true;
      this.helmetOnSwap(ac);
    }
  }
  helmetOnSwap(ac) {
    const H = ac.helmet, old = ac.mesh;
    H.mesh?.parent?.remove(H.mesh);
    ac.look = H.look0 || { ...ac.look, hat: 'helmet' };
    const mesh = makePerson({ ...ac.look, face: null });
    mesh.position.copy(old.position);
    mesh.rotation.copy(old.rotation);
    old.parent?.add(mesh);
    old.parent?.remove(old);
    ac.mesh = mesh;
  }
  helmetOnDone(ac) {
    const H = ac.helmet;
    if (!H) return;
    if (!H.on?.swapped) this.helmetOnSwap(ac);
    const parts = ac.mesh.userData.parts;
    if (parts.pose) { delete parts.pose.armL; delete parts.pose.armR; }
    ac.helmet = null;
  }

  // ---------- VẪY TAY (việc "wave"): tay trái giơ cao vẫy qua lại t giây (tay phải có thể đang cầm nón) ----------
  storyWave(who, t = 2) {
    const ac = this.storyActors?.[who];
    if (ac) ac.wave = { t: 0, dur: t };
  }
  waveTick(ac, dt) {
    const W = ac.wave, p = ac.mesh.userData.parts;
    W.t += dt;
    const up = Math.min(1, W.t / 0.3, Math.max(0, (W.dur - W.t) / 0.3));
    p.armL.rotation.z = (-2.5 + Math.sin(W.t * 11) * 0.28) * up;
    p.elbowL.rotation.x = -0.3 * up;
    if (W.t >= W.dur) { p.armL.rotation.z = 0; ac.wave = null; }
  }

  // ---------- LÊN XE CHẠY ĐI (việc "rideOff"): (đang cầm nón → đội lại) → đi tới xe của mình → leo lên, nẹt pô, chạy dọc đường rồi mất ----------
  storyActorRideOff(who, a = {}) {
    const ac = this.storyActors?.[who];
    if (!ac?.vehicle) return this.storyActorLeave(who);
    this.bubbles.remove(`story:${who}`);
    if (ac.helmet) this.storyHelmetOn(who);
    Object.assign(ac, { mode: 'rideoff', leaving: true, ro: { phase: 'helmet', t: 0, sound: a.sound ?? 'city.rev', v: 0 } });
  }
  rideOffTick(who, ac, dt) {
    const R = ac.ro, bike = ac.vehicle, h = bike.rotation.y;
    R.t += dt;
    if (R.phase === 'helmet') {
      if (!ac.helmet) { R.phase = 'walk'; R.t = 0; }
      return;
    }
    if (R.phase === 'walk') {
      // chỗ leo lên: bên trái xe
      const m = ac.mesh.position, tx = bike.position.x + Math.cos(h) * 0.85, tz = bike.position.z - Math.sin(h) * 0.85;
      const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
      if (d > 0.25 && R.t < 8) {
        const v = Math.min(1.8, d * 2);
        m.x += (dx / d) * v * dt;
        m.z += (dz / d) * v * dt;
        ac.mesh.rotation.y = lerpAngle(ac.mesh.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
        ac.phase = (ac.phase || 0) + dt * (5 + v);
        this.animateRunner(ac.mesh, ac.phase, 0.5);
        return;
      }
      // leo lên xe (đội nón), nẹt pô
      this.scene.remove(ac.mesh);
      const model = bike.userData.model || 'supersport';
      ac.rider = seatRider(bike, { ...ac.look, face: null }, model, bikeSeatZ(model));
      if (R.sound) sound(R.sound);
      // đi bên phải đường: xe đang đậu ở nửa trái (so với hướng đầu xe) → quay đầu chữ U rồi mới chạy
      const along = Math.abs(Math.sin(h)) > Math.abs(Math.cos(h)), b = bike.position;
      const c = roadPos(Math.round(((along ? b.z : b.x) - CITY.ORIGIN) / CITY.PITCH));
      // hướng chạy: thẳng theo trục đường (xe thắng gấp đứng xiên) · đang ở nửa trái so với hướng đó thì quay đầu chữ U
      const ax = along ? Math.sign(Math.sin(h) || 1) * Math.PI / 2 : Math.cos(h) >= 0 ? 0 : Math.PI;
      const side = along ? (b.z - c) * Math.sin(ax) : -(b.x - c) * Math.cos(ax); // > 0: đang ở nửa phải
      const H = side < 0 ? ax + Math.PI : ax;
      // làn bên phải cách tim đường 3 m
      Object.assign(R, { phase: 'go', t: 0, h: H, along, lane: c + 3 * (along ? Math.sign(Math.sin(H)) : -Math.sign(Math.cos(H))) });
      return;
    }
    // chạy dọc hướng đầu xe (quay đầu dần nếu cần), tăng tốc dần; 7 giây sau mất khỏi cảnh
    if (R.t > 0.6) R.v = Math.min(16, R.v + dt * (Math.abs(Math.atan2(Math.sin(R.h - h), Math.cos(R.h - h))) > 0.3 ? 3 : 7));
    if (R.t > 0.6) bike.rotation.y = lerpAngle(h, R.h, 1 - Math.exp(-2.6 * dt));
    bike.position.x += Math.sin(bike.rotation.y) * R.v * dt;
    bike.position.z += Math.cos(bike.rotation.y) * R.v * dt;
    if (R.lane != null && R.v > 2) { // nhập dần vào làn phải
      const k = R.along ? 'z' : 'x', d = R.lane - bike.position[k];
      bike.position[k] += Math.sign(d) * Math.min(Math.abs(d), 1.6 * dt);
    }
    bike.position.y = this.city.elev?.topAt(bike.position.x, bike.position.z) ?? 0;
    const ud = bike.userData;
    if (ud.wheelF) { ud.wheelF.rotation.x += (R.v * dt) / ud.wheelRadius; ud.wheelR.rotation.x += (R.v * dt) / ud.wheelRadius; }
    if (ac.def?.loop) {
      const cam = this.camera.position, d = Math.hypot(bike.position.x - cam.x, bike.position.z - cam.z);
      loopSound(ac.def.loop, Math.max(0, Math.min(1, 1 - (d - 6) / 70)), 0.8 + Math.min(1, R.v / 16) * 0.7);
    }
    if (R.t > 7) {
      this.storyActorRemove(who);
      this.sceneRelease();
    }
  }
  // Việc "traffic": clear > 0 → giữ vùng bán kính clear quanh người chơi (hoặc at [x, z]) không có xe NPC; clear 0 → trả lại
  storyTraffic(a) {
    if (!(a.clear > 0)) return this.sceneRelease();
    const p = Array.isArray(a.at) ? { x: a.at[0], z: a.at[1] } : this.playerPos;
    this.traffic.holdNear(p.x, p.z, a.clear, true);
    this.sceneHold = true;
  }
  // Trả lại xe NPC đã dọn cho cảnh (vật ngã → chạy đi)
  sceneRelease() {
    if (!this.sceneHold) return;
    this.sceneHold = false;
    if (!this.cine) this.traffic.release();
  }

  // ---------- NGƯỜI CHƠI GỌI ĐIỆN (việc "phoneCall"): tay phải đưa điện thoại lên tai · on = false: cất điện thoại ----------
  storyPhoneCall(on = true) {
    const w = this.walker.mesh, p = w.userData.parts;
    if (this.callPhone) { this.callPhone.parent?.remove(this.callPhone); this.callPhone = null; }
    if (p.pose) delete p.pose.armR;
    if (!on) return;
    const ph = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.014), new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.4, metalness: 0.3 }));
    ph.position.set(-0.03, -0.31, 0.02);
    ph.rotation.set(0.3, 0, 0.2);
    p.elbowR.add(ph);
    this.callPhone = ph;
    p.pose = { ...(p.pose || {}), armR: [-0.3, -2.45] }; // khuỷu gập, bàn tay áp điện thoại bên tai
  }

  // ---------- MÀN ĐEN (việc "fade"): tối dần, hiện chữ (vd "Ít phút sau…"), sáng lại. Lúc tối hẳn: dọn người lạ / đạo cụ, người lạ "stand" đứng lại
  // trước mặt người chơi. Đồng hồ chung vẫn chạy. a: { text, t (giây giữ tối), remove: [người lạ], props (dọn hết đạo cụ), stand, dist }
  storyFade(a) {
    if (!this.fadeEl) {
      this.fadeEl = document.createElement('div');
      this.fadeEl.id = 'storyFade';
      document.body.append(this.fadeEl);
    }
    const el = this.fadeEl, hold = Math.max(0.5, a.t ?? 2);
    el.textContent = a.text ? fmt(a.text) : '';
    el.classList.add('on');
    clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => {
      this.storyFadeClean(a);
      this.fadeTimer = setTimeout(() => el.classList.remove('on'), hold * 1000);
    }, 700);
  }
  storyFadeClean(a, restore = false) {
    for (const who of [].concat(a.remove || [])) this.storyActorRemove(who);
    if (a.props === true) this.storyPropsClear();
    else if (Array.isArray(a.props)) for (const id of a.props) this.storyPropRemove(id); // chỉ dọn mấy đạo cụ này
    // tua giờ như lúc ngủ dậy (vd "2 tiếng sau…"): skip phút, hoặc skipTo giờ trong ngày (đang trước giờ đó)
    if (!restore) {
      const day = Math.floor(this.clockMin / 1440) * 1440, to = a.skipTo != null ? day + a.skipTo * 60 : null;
      const n = to != null ? to - this.clockMin : a.skip || 0;
      if (n > 0) this.advance(n, 'idle', { quiet: true });
    }
    if (this.tackle) this.tackle = null;
    this.storyPhoneCall(false);
    const ac = a.stand && this.storyActors?.[a.stand];
    if (ac) {
      // đứng dậy (bỏ dáng quỳ / ghì), đứng cách người chơi dist m, quay mặt về người chơi
      const P = this.walker.mesh.position, m = ac.mesh.position, d = a.dist ?? 2.2;
      const dx = m.x - P.x, dz = m.z - P.z, l = Math.hypot(dx, dz) || 1;
      const mesh = makePerson({ ...ac.look, face: null });
      mesh.position.set(P.x + (dx / l) * d, P.y, P.z + (dz / l) * d);
      mesh.rotation.y = Math.atan2(-dx, -dz);
      this.scene.remove(ac.mesh);
      this.scene.add(mesh);
      ac.mesh = mesh;
      ac.mode = 'idle';
      this.walker.heading = Math.atan2(dx, dz);
      this.walker.mesh.rotation.y = this.walker.heading;
    }
  }

  // ---------- VẬT NGÃ (việc "tackle"): người bị đuổi (target) vùng chạy về phía người chơi → nút bấm nhanh "E — Chặn lại!" (qte giây) →
  // người vật (who) lao tới túm, quật xuống (quay chậm), ghì nằm sấp, 2 tay bẻ ra sau lưng → điều kiện "tackled" xong.
  // Bấm kịp: người chơi dang tay chặn, nó khựng lại · không kịp: nó lách qua người chơi, người vật vẫn tóm được từ phía sau. Không có thua.
  storyTackleStart(a) {
    const A = this.storyActors?.[a.who], B = this.storyActors?.[a.target];
    if (!A || !B) return storyEvent(this.gs.story, 'tackled');
    if (this.mode === 'bike') act.dismount(this); // đang ngồi xe: xuống đứng chặn
    // dọn xe NPC quanh đây (khỏi chạy xuyên qua người đang vật nhau giữa đường) — tới lúc người vật lên xe chạy đi mới trả lại
    this.traffic.holdNear(this.walker.pos.x, this.walker.pos.z, 55, true);
    this.sceneHold = true;
    if (A.vehicle && A.rider) this.storyActorDismount(a.who);
    const r = B.chase?.runner;
    if (r) B.mesh = r.mesh;
    Object.assign(B, { chase: null, rider: null, mode: 'tackled', phase: 0 });
    Object.assign(A, { mode: 'tackler', phase: 0 });
    const P = this.walker.mesh.position, bm = B.mesh.position;
    const d0 = Math.max(1, Math.hypot(P.x - bm.x, P.z - bm.z) - 1.3), qt = a.qte ?? 2;
    this.tackle = { a, A: a.who, B: a.target, phase: 'run', t: 0, qt, qleft: qt, hit: qt > 0 ? null : true, vB: Math.max(2.6, Math.min(4.6, d0 / Math.max(0.8, qt))), vA: 0, block: 0 };
    this.walker.heading = Math.atan2(bm.x - P.x, bm.z - P.z); // người chơi quay mặt về phía nó
    if (qt > 0) this.qteShow(1, a.text || 'story.qte.block');
  }
  // Nút bấm nhanh: vòng đếm ngược k (1 → 0) · done: true (bấm kịp) / false (trễ) → nháy rồi tắt
  qteShow(k, text) {
    if (!this.qteEl) {
      this.qteEl = document.createElement('div');
      this.qteEl.id = 'qte';
      this.qteEl.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="bg"/><circle cx="50" cy="50" r="42" class="ring"/></svg><b>E</b><span></span>';
      document.body.append(this.qteEl);
    }
    const el = this.qteEl;
    if (text) { el.querySelector('span').textContent = fmt(text); el.className = 'on'; sound('city.qte'); }
    el.querySelector('.ring').style.strokeDashoffset = String(264 * (1 - Math.max(0, Math.min(1, k))));
  }
  qteDone(hit) {
    const el = this.qteEl;
    if (!el) return;
    el.className = `on ${hit ? 'ok' : 'miss'}`;
    setTimeout(() => (el.className = ''), 450);
  }
  // Mỗi khung hình (gọi từ storyActorsTick, sau khi người chơi đã cập nhật): chạy → vật (quay chậm) → ghì
  tackleTick(dt) {
    const T = this.tackle;
    if (!T) return;
    const A = this.storyActors?.[T.A], B = this.storyActors?.[T.B];
    if (!A || !B) { this.tackle = null; return; }
    const sdt = dt * this.sceneScale();
    T.t += sdt;
    const W = this.walker.mesh, P = W.position, bm = B.mesh.position, am = A.mesh.position, wp = W.userData.parts;
    if (T.phase === 'run') {
      // nút bấm nhanh
      if (T.hit == null) {
        T.qleft -= dt;
        this.qteShow(T.qleft / T.qt);
        if (this.input.was('KeyE')) T.hit = true;
        else if (T.qleft <= 0 || Math.hypot(P.x - bm.x, P.z - bm.z) < 1.2) T.hit = false;
        if (T.hit != null) { this.qteDone(T.hit); if (T.hit) { T.block = 2.6; sound('ui.interact'); } }
      }
      // người bị đuổi: chạy thẳng về phía người chơi · bị chặn thì khựng lại trước mặt · trễ thì lách qua bên cạnh
      if (!T.pass && T.hit === false) {
        const fx = P.x - bm.x, fz = P.z - bm.z, l = Math.hypot(fx, fz) || 1;
        T.pass = { x: P.x + (fx / l) * 6 - (fz / l) * 1.4, z: P.z + (fz / l) * 6 + (fx / l) * 1.4 };
      }
      const goal = T.pass || P, gx = goal.x - bm.x, gz = goal.z - bm.z, gd = Math.hypot(gx, gz) || 1;
      const stop = !T.pass && gd < 1.3;
      const vB = stop ? 0 : T.vB;
      bm.x += (gx / gd) * vB * sdt;
      bm.z += (gz / gd) * vB * sdt;
      if (!stop) B.mesh.rotation.y = lerpAngle(B.mesh.rotation.y, Math.atan2(gx, gz), 1 - Math.exp(-10 * sdt));
      B.phase += sdt * (5 + vB);
      this.animateRunner(B.mesh, B.phase, stop ? 0 : 1);
      if (stop) B.mesh.userData.parts.body.rotation.x = -0.25; // khựng lại, ngửa người ra sau
      // người vật: lao theo, nhanh hơn
      T.vA = Math.min(6.5, T.vA + sdt * 9);
      const ax = bm.x - am.x, az = bm.z - am.z, ad = Math.hypot(ax, az) || 1;
      am.x += (ax / ad) * T.vA * sdt;
      am.z += (az / ad) * T.vA * sdt;
      A.mesh.rotation.y = lerpAngle(A.mesh.rotation.y, Math.atan2(ax, az), 1 - Math.exp(-10 * sdt));
      A.phase += sdt * (5 + T.vA);
      this.animateRunner(A.mesh, A.phase, 1);
      // túm được: bắt đầu quật xuống (quay chậm, máy quay ngang hông)
      if (ad < 1.0 && T.hit != null) {
        B.mesh.userData.parts.body.rotation.x = 0;
        Object.assign(T, { phase: 'fall', t: 0, h: B.mesh.rotation.y, x0: bm.x, z0: bm.z, ax0: am.x, az0: am.z });
        sound('city.tackle');
        if (T.a.cine !== false) this.storyCineStart({ shots: [{ at: `actor:${T.B}`, t: 2.4, dist: 4.4, height: 1.1, angle: 90, lookY: 0.6, slow: 0.35 }] });
      }
    } else if (T.phase === 'fall' || T.phase === 'pin') {
      const k = T.phase === 'pin' ? 1 : ease(Math.min(1, T.t / 0.85)), h = T.h, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
      // người bị vật: chúi tới, nằm sấp (trượt thêm 0,6 m), 2 tay bẻ ra sau lưng
      bm.x = T.x0 + fx * 0.6 * k;
      bm.z = T.z0 + fz * 0.6 * k;
      bm.y = (this.city.elev?.topAt(bm.x, bm.z) ?? 0) + 0.06 * k;
      B.mesh.rotation.set(1.48 * k, h, 0, 'YXZ'); // ngã chúi tới trước, úp mặt xuống
      const bp = B.mesh.userData.parts;
      bp.legL.rotation.x = bp.legR.rotation.x = 0;
      bp.kneeL.rotation.x = bp.kneeR.rotation.x = 0.1 * k;
      // 2 tay bẻ ngược ra sau lưng: cánh tay vặn vào trong rồi gập khuỷu → cẳng tay nằm ngang trên lưng
      bp.armL.rotation.set(0.5 * k, 1.4 * k, 0);
      bp.armR.rotation.set(0.5 * k, -1.4 * k, 0);
      bp.elbowL.rotation.x = bp.elbowR.rotation.x = -1.7 * k;
      // người vật: quỳ cạnh hông người bị vật (bên phải), quay mặt vào, cúi người, 2 tay đè lên lưng
      const tx = bm.x + fx * 0.75 + rx * 0.5, tz = bm.z + fz * 0.75 + rz * 0.5, side = Math.atan2(-rx, -rz);
      am.x = T.ax0 + (tx - T.ax0) * k;
      am.z = T.az0 + (tz - T.az0) * k;
      am.y = (this.city.elev?.topAt(am.x, am.z) ?? 0) - 0.42 * k;
      A.mesh.rotation.set(0, h + Math.atan2(Math.sin(side - h), Math.cos(side - h)) * k, 0);
      const ap = A.mesh.userData.parts, bend = 0.85 * k, HIP = 0.88;
      ap.legL.rotation.x = -1.45 * k; ap.kneeL.rotation.x = 1.45 * k; // chân trước: đùi ngang, cẳng chân chống đất
      ap.legR.rotation.x = 0; ap.kneeR.rotation.x = 1.5 * k; // chân sau: gối chạm đất, cẳng chân nằm ra sau
      ap.body.rotation.x = bend; // cúi người quanh hông (dời thân bù lại cho hông đứng yên)
      ap.body.position.set(0, HIP * (1 - Math.cos(bend)), -Math.sin(bend) * HIP);
      ap.armL.rotation.set(-0.7 * k, 0, 0.15 * k); // 2 tay đè xuống lưng
      ap.armR.rotation.set(-0.7 * k, 0, -0.15 * k);
      ap.elbowL.rotation.x = ap.elbowR.rotation.x = -0.2 * k;
      if (T.phase === 'fall' && T.t >= 0.85) {
        T.phase = 'pin';
        storyEvent(this.gs.story, 'tackled');
      }
    }
    // người chơi dang tay chặn (bấm kịp)
    if (T.block > 0) {
      T.block -= dt;
      const s = Math.min(1, T.block / 0.3);
      wp.armL.rotation.z = -1.2 * s;
      wp.armR.rotation.z = 1.2 * s;
    }
  }

  // ---------- BÁM THEO LÉN (việc "sneak"): người lạ who (dắt theo with) đi theo lộ trình route; điểm có look: dừng lại ngoái nhìn bấy nhiêu giây.
  // Người chơi phải theo sau, không để bị thấy: lúc người đó ngoái lại mà người chơi trong tầm nhìn (see m, nón 120°, không bị tường / thùng rác che)
  // thì "bị nghi" tăng; đi sát quá (< 2,5 m) hay chạy / đi xe máy gần cũng bị nghe. Bị nghi đầy hoặc bỏ xa quá (lose m) → màn đen, làm lại từ đầu
  // (người chơi về chỗ retry). Tới điểm cuối → điều kiện "sneaked" xong. Không thua hẳn. Chỉ máy người chơi này (cốt truyện riêng).
  storySneakStart(a) {
    const A = this.storyActors?.[a.who];
    const pts = (a.route || []).filter((r) => Array.isArray(r?.at)).map((r) => ({ x: r.at[0], z: r.at[1], look: r.look || 0 }));
    if (!A || pts.length < 2) return storyEvent(this.gs.story, 'sneaked');
    this.sneak = { a, pts, i: 0, wait: 0, sus: 0, phase: 'wait', trail: [], hmmT: 0 };
    this.sneakPlace(true);
  }
  // Đặt người đi trước + người đi theo về đầu lộ trình (bắt đầu / làm lại)
  sneakPlace(first = false) {
    const S = this.sneak, A = this.storyActors?.[S.a.who], B = S.a.with && this.storyActors?.[S.a.with], p0 = S.pts[0], p1 = S.pts[1];
    const h = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    Object.assign(S, { i: 0, wait: 0, sus: 0, phase: 'wait', trail: [], hmmT: 0 });
    for (const [ac, back] of [[A, 0], [B, 1.1]]) {
      if (!ac) continue;
      ac.mode = 'sneak';
      ac.mesh.position.set(p0.x - Math.sin(h) * back, this.city.elev?.topAt(p0.x, p0.z) ?? 0, p0.z - Math.cos(h) * back);
      ac.mesh.rotation.set(0, h, 0);
    }
    if (!first && Array.isArray(S.a.retry)) {
      const w = this.walker;
      if (this.mode === 'bike') act.dismount(this);
      w.leaveCrouch();
      w.pos.set(S.a.retry[0], 0, S.a.retry[1]);
      w.mesh.position.set(S.a.retry[0], 0, S.a.retry[1]);
    }
  }
  // Có thấy được điểm (x, z) từ chỗ người lạ không: tường (lưới va chạm) / thùng rác chắn giữa thì không thấy
  sneakSees(from, to) {
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz), n = Math.ceil(d / 0.4);
    const bins = Object.values(this.storyProps || {}).filter((p) => p.def.kind === 'bin').map((p) => p.mesh.position);
    for (let k = 1; k < n; k++) {
      const x = from.x + (dx * k) / n, z = from.z + (dz * k) / n;
      if (this.city.grid.inside(x, 1.0, z)) return false;
      if (bins.some((b) => Math.hypot(b.x - x, b.z - z) < 0.5)) return false;
    }
    return true;
  }
  sneakTick(dt) {
    const S = this.sneak;
    if (!S || S.phase === 'done' || S.phase === 'reset') return;
    const a = S.a, A = this.storyActors?.[a.who], B = a.with && this.storyActors?.[a.with];
    if (!A) { this.sneak = null; return; }
    const P = this.mode === 'bike' ? this.bike.pos : this.walker.pos, m = A.mesh.position;
    const d = Math.hypot(P.x - m.x, P.z - m.z), speed = a.speed ?? 1.3;
    // bắt đầu đi khi người chơi tới gần đầu lộ trình
    if (S.phase === 'wait') {
      if (d < (a.start ?? 16)) S.phase = 'walk';
      else { this.sneakAnim(A, B, 0, dt); return; }
    }
    let moving = 0;
    if (S.phase === 'walk') {
      const T = S.pts[S.i + 1];
      if (!T) {
        S.phase = 'done';
        storyEvent(this.gs.story, 'sneaked');
        this.sneakAnim(A, B, 0, dt);
        return;
      }
      const gx = T.x - m.x, gz = T.z - m.z, gd = Math.hypot(gx, gz);
      const step = Math.min(gd, speed * dt);
      m.x += (gx / (gd || 1)) * step;
      m.z += (gz / (gd || 1)) * step;
      A.mesh.rotation.y = lerpAngle(A.mesh.rotation.y, Math.atan2(gx, gz), 1 - Math.exp(-8 * dt));
      moving = speed;
      if (gd - step < 0.05) {
        S.i += 1;
        if (T.look > 0) { S.phase = 'look'; S.wait = T.look; S.lookFrom = A.mesh.rotation.y; this.storyReact([a.who], '?'); }
      }
    } else if (S.phase === 'look') {
      // ngoái lại nhìn phía sau (hướng ngược đường vừa đi)
      A.mesh.rotation.y = lerpAngle(A.mesh.rotation.y, S.lookFrom + Math.PI, 1 - Math.exp(-5 * dt));
      if ((S.wait -= dt) <= 0) S.phase = 'walk';
    }
    // người đi theo: theo vết chân người đi trước, cách ~1,1 m
    S.trail.push({ x: m.x, z: m.z });
    if (S.trail.length > 400) S.trail.shift();
    if (B) {
      let k = S.trail.length - 1, acc = 0;
      while (k > 0 && acc < 1.1) { acc += Math.hypot(S.trail[k].x - S.trail[k - 1].x, S.trail[k].z - S.trail[k - 1].z); k--; }
      const t = S.trail[k], b = B.mesh.position, mx = t.x - b.x, mz = t.z - b.z;
      if (Math.hypot(mx, mz) > 0.02) B.mesh.rotation.y = lerpAngle(B.mesh.rotation.y, Math.atan2(mx, mz), 1 - Math.exp(-8 * dt));
      b.x = t.x;
      b.z = t.z;
    }
    this.sneakAnim(A, B, moving, dt);
    // bị nghi: đang ngoái lại + thấy người chơi trong tầm · đi sát / chạy / xe máy gần → nghe tiếng
    const see = a.see ?? 11, face = A.mesh.rotation.y, ang = Math.atan2(P.x - m.x, P.z - m.z);
    const inCone = Math.abs(Math.atan2(Math.sin(ang - face), Math.cos(ang - face))) < Math.PI / 3;
    const loud = this.mode === 'bike' ? 14 : this.walker.speed > 4 ? 6 : 2.5;
    let gain = 0;
    const hidden = this.mode === 'foot' && this.walker.crouch && this.storyHideSpot(P, 1.4); // đang ngồi núp sau thùng rác → không thấy, không nghe
    if (!hidden) {
      if (S.phase === 'look' && d < see && inCone && this.sneakSees(m, P)) gain = 1.6 * (1.2 - d / see);
      if (d < loud) gain = Math.max(gain, 0.9);
    }
    S.sus = Math.max(0, Math.min(1, S.sus + (gain > 0 ? gain * dt : -0.25 * dt)));
    if (S.sus > 0.35 && (S.hmmT -= dt) <= 0) { S.hmmT = 2.5; this.storyBubble(a.who, a.hmm || 'story.sneak.hmm'); }
    if (S.sus >= 1) return this.sneakFail(a.caught || 'story.sneak.caught', a.who);
    if (S.i >= 1 && d > (a.lose ?? 24)) return this.sneakFail('story.sneak.lost');
  }
  sneakAnim(A, B, v, dt) {
    for (const ac of [A, B]) {
      if (!ac) continue;
      ac.phase = (ac.phase || 0) + dt * (v ? 5 + v : 0);
      animatePerson(ac.mesh, ac.phase, v ? 0.55 : 0);
    }
  }
  // Thùng rác cốt truyện (đạo cụ "bin", không tắt "Núp được") gần điểm p nhất trong bán kính r → { x, z, d }
  storyHideSpot(p, r = 1.3) {
    let best = null;
    for (const pr of Object.values(this.storyProps || {})) {
      if (pr.def.kind !== 'bin' || pr.def.hide === false) continue;
      const m = pr.mesh.position, d = Math.hypot(p.x - m.x, p.z - m.z);
      if (d <= r && (!best || d < best.d)) best = { x: m.x, z: m.z, d, id: pr.def.id };
    }
    return best;
  }
  // Bấm E cạnh thùng rác: ngồi thụp xuống sát thùng (phía người chơi đang đứng), quay mặt vào thùng
  storyHide(b) {
    const p = this.walker.pos, dx = p.x - b.x, dz = p.z - b.z, l = Math.hypot(dx, dz) || 1;
    const x = b.x + (dx / l) * 0.85, z = b.z + (dz / l) * 0.85;
    this.walker.crouchAt({ x, z, ry: Math.atan2(b.x - x, b.z - z) });
  }
  // Bị phát hiện / mất dấu: (câu "Ai đó?!") → màn đen ngắn → làm lại từ đầu lộ trình
  sneakFail(text, who = null) {
    const S = this.sneak;
    S.phase = 'reset';
    if (who) { this.storyBubble(who, text); sound('city.sneakCaught'); } else this.hud.toast(fmt(text), 'warn', 3500);
    setTimeout(() => {
      this.storyFade({ text: 'story.sneak.retry', t: 1 });
      setTimeout(() => { if (this.sneak === S) this.sneakPlace(false); }, 750);
    }, who ? 900 : 0);
  }

  // ---------- CẢNH PHIM: người chơi tự chạy bộ (cine.playerRun: các điểm [x, z]); hết cảnh: leo lên xe đặt sẵn ở cine.bikeAt [x, z, hướng°] ----------
  cinePlayerRun(dt) {
    const R = this.cine?.run;
    if (!R || this.mode !== 'foot') return;
    const w = this.walker, T = R.pts[R.i];
    if (R.delay > 0) { R.delay -= dt; return; } // chờ … giây rồi mới chạy (vd vấp lon, bọn kia quay lại)
    if (!T) { w.speed = 0; animatePerson(w.mesh, w.phase, 0); return; }
    const dx = T[0] - w.pos.x, dz = T[1] - w.pos.z, d = Math.hypot(dx, dz), v = R.speed;
    const step = Math.min(d, v * dt);
    w.pos.x += (dx / (d || 1)) * step;
    w.pos.z += (dz / (d || 1)) * step;
    w.heading = lerpAngle(w.heading, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
    w.speed = v;
    if (d - step < 0.05) R.i += 1;
    w.phase += dt * v * 2.6;
    animatePerson(w.mesh, w.phase, 1);
    w.mesh.position.set(w.pos.x, this.city.elev?.topAt(w.pos.x, w.pos.z) ?? 0, w.pos.z);
    w.mesh.rotation.set(0, w.heading, 0);
  }
  cineRunEnd(def) {
    const at = def?.bikeAt;
    if (!Array.isArray(at) || this.mode === 'bike') return;
    const b = this.bike, h = ((at[2] ?? 0) * Math.PI) / 180;
    b.pos.set(at[0], 0, at[1]);
    b.heading = h;
    b.speed = 0;
    b.vel?.set(0, 0);
    b.mesh.position.set(at[0], this.city.elev?.topAt(at[0], at[1]) ?? 0, at[1]);
    b.mesh.rotation.set(0, h, 0);
    this.walker.pos.set(at[0], 0, at[1]);
    act.mountBike(this);
    this.rig.yaw = h + Math.PI;
  }

  // ---------- BỊ RƯỢT (việc "pursue"): những người lạ who[] rượt theo người chơi — chạy theo đúng dấu chân người chơi (quẹo theo hẻm, không xuyên tường).
  // Thường: leo lên xe chạy đi, hoặc bỏ xa hơn lose m → điều kiện "escaped" xong (bọn kia đứng lại la).
  // bikeOnly: chỉ thoát bằng xe — leo lên xe (bọn kia la stopText, chạy chậm lại vì đuối), chạy xe được vanish (quãng đường) thì bọn kia biến mất → "escaped".
  //   (tính quãng xe đã chạy chứ không tính bỏ xa: xe đạp chỉ nhanh ngang người chạy bộ, vẫn thoát được)
  // Bị tóm (gần hơn 1 m, đang đi bộ / xe gần như đứng yên): fail → màn thua + nút "Chơi lại" · không fail → màn đen, làm lại.
  // Làm lại: người chơi về chỗ đứng lúc bắt đầu (xe vẫn ở chỗ đậu), bọn kia về chỗ cũ. Chỉ máy người chơi này.
  storyPursueStart(a) {
    const who = [].concat(a.who || []).filter((w) => this.storyActors?.[w]);
    if (!who.length) return storyEvent(this.gs.story, 'escaped');
    this.walker.leaveCrouch(); // đang ngồi núp → đứng bật dậy
    const P = this.playerPos;
    this.pursue = {
      a, who, phase: 'run', wait: a.delay ?? 0.8, trail: [{ x: P.x, z: P.z }], start: { x: P.x, z: P.z },
      home: Object.fromEntries(who.map((w) => [w, this.storyActors[w].mesh.position.clone()])),
      idx: Object.fromEntries(who.map((w) => [w, 0])), boost: 0, rode: false,
    };
    for (const w of who) this.storyActors[w].mode = 'pursue';
  }
  pursueTick(dt) {
    const R = this.pursue;
    if (R?.phase === 'lost' && (this.input.was('KeyE') || this.input.was('Enter'))) return this.pursueRetry(); // màn thua: E / Enter = Chơi lại
    if (!R || R.phase !== 'run') return;
    const a = R.a, P = this.mode === 'bike' ? this.bike.pos : this.walker.pos;
    // ghi dấu chân người chơi (mỗi 0,3 m)
    const last = R.trail[R.trail.length - 1];
    if (Math.hypot(P.x - last.x, P.z - last.z) > 0.3) R.trail.push({ x: P.x, z: P.z });
    if ((R.wait -= dt) > 0) { for (const w of R.who) this.pursueFace(w, P, dt); return; }
    const speed = (a.speed ?? 4.6) * (a.bikeOnly && R.rode ? 0.8 : 1); // người chơi đã lên xe: bọn kia đuối dần
    let nearest = Infinity;
    R.who.forEach((w, k) => {
      const ac = this.storyActors?.[w];
      if (!ac) return;
      const m = ac.mesh.position;
      let left = speed * (1 - k * 0.06) * dt; // tên sau chậm hơn chút, không chồng lên nhau
      // đi theo dấu chân: tới điểm kế thì sang điểm sau; gần người chơi (thấy rõ) thì lao thẳng tới
      while (left > 0) {
        const i = R.idx[w], T = i < R.trail.length ? R.trail[i] : P;
        const dx = T.x - m.x, dz = T.z - m.z, d = Math.hypot(dx, dz);
        if (d < 1e-3) { if (i < R.trail.length) R.idx[w] += 1; else break; continue; }
        const step = Math.min(d, left);
        m.x += (dx / d) * step;
        m.z += (dz / d) * step;
        ac.mesh.rotation.y = lerpAngle(ac.mesh.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
        left -= step;
        if (step >= d - 1e-6 && i < R.trail.length) R.idx[w] += 1;
      }
      m.y = this.city.elev?.topAt(m.x, m.z) ?? 0;
      ac.phase = (ac.phase || 0) + dt * (5 + speed);
      this.animateRunner(ac.mesh, ac.phase, 1);
      nearest = Math.min(nearest, Math.hypot(P.x - m.x, P.z - m.z));
    });
    const onBike = this.mode === 'bike';
    if (a.bikeOnly) {
      // chỉ thoát bằng xe: vừa leo lên xe → bọn kia la · chạy bỏ xa → biến mất luôn
      if (onBike && !R.rode) { R.rode = true; R.ridden = 0; R.last = { x: P.x, z: P.z }; if (a.stopText) this.storyBubble(R.who[0], a.stopText); }
      if (R.rode && onBike) { R.ridden += Math.hypot(P.x - R.last.x, P.z - R.last.z); R.last = { x: P.x, z: P.z }; }
      if (R.rode && onBike && R.ridden > (a.vanish ?? 40)) {
        R.phase = 'done';
        for (const w of R.who) this.storyActorRemove(w);
        storyEvent(this.gs.story, 'escaped');
        return;
      }
    } else if ((onBike && Math.abs(this.bike.speed) > 3) || nearest > (a.lose ?? 30)) {
      // thoát: đã lên xe chạy · hoặc bỏ xa
      R.phase = 'done';
      for (const w of R.who) { const ac = this.storyActors?.[w]; if (ac) { ac.mode = 'idle'; this.animateRunner(ac.mesh, 0, 0); } }
      if (a.stopText) this.storyBubble(R.who[0], a.stopText);
      storyEvent(this.gs.story, 'escaped');
      return;
    }
    // bị tóm: đang đi bộ, hoặc ngồi xe mà xe gần như đứng yên
    if (nearest < (a.catch ?? 1.0) && (!onBike || Math.abs(this.bike.speed) < 2.5)) {
      R.phase = 'reset';
      for (const w of R.who) { const ac = this.storyActors?.[w]; if (ac) this.animateRunner(ac.mesh, 0, 0); }
      if (a.caughtText) this.storyBubble(R.who[0], a.caughtText);
      if (a.fail) {
        // thua: màn "Bị tụi nó tóm rồi…" + nút Chơi lại (khóa điều khiển tới khi bấm)
        this.storyLose = true;
        setTimeout(() => { if (this.pursue === R) { R.phase = 'lost'; this.storyLoseShow(a); } }, 900);
        return;
      }
      setTimeout(() => {
        this.storyFade({ text: a.retryText || 'story.pursue.retry', t: 1 });
        setTimeout(() => { if (this.pursue === R) this.pursueReset(R); }, 750);
      }, 700);
    }
  }
  // Đưa người chơi + bọn rượt về chỗ lúc bắt đầu rượt (xe để nguyên chỗ đang đậu)
  pursueReset(R) {
    if (this.mode === 'bike') { this.bike.speed = 0; this.bike.vel?.set(0, 0); act.dismount(this); }
    const w = this.walker;
    w.leaveCrouch();
    w.pos.set(R.start.x, 0, R.start.z);
    w.mesh.position.set(R.start.x, 0, R.start.z);
    for (const who of R.who) { const ac = this.storyActors?.[who]; if (ac) ac.mesh.position.copy(R.home[who]); R.idx[who] = 0; }
    Object.assign(R, { phase: 'run', wait: R.a.delay ?? 0.8, trail: [{ x: R.start.x, z: R.start.z }], rode: false });
  }
  // Màn thua (bị rượt có "Bị tóm = thua"): chữ + gợi ý + nút Chơi lại
  storyLoseShow(a) {
    if (!this.loseEl) {
      this.loseEl = document.createElement('div');
      this.loseEl.id = 'storyLose';
      this.loseEl.innerHTML = '<div><h2></h2><p></p><button type="button"></button></div>';
      this.loseEl.querySelector('button').addEventListener('click', () => this.pursueRetry());
      document.body.append(this.loseEl);
    }
    const el = this.loseEl;
    el.querySelector('h2').textContent = fmt(a.failText || 'story.pursue.fail');
    el.querySelector('p').textContent = a.failHint ? fmt(a.failHint) : '';
    el.querySelector('button').textContent = fmt('story.pursue.again');
    el.classList.add('on');
    sound('city.caught');
  }
  // Bấm "Chơi lại": tắt màn thua → màn đen ngắn → chơi lại từ lúc bắt đầu bị rượt
  pursueRetry() {
    const R = this.pursue;
    this.loseEl?.classList.remove('on');
    if (!R || R.phase !== 'lost') { this.storyLose = false; return; }
    R.phase = 'reset';
    this.storyFade({ t: 0.6 });
    setTimeout(() => {
      this.storyLose = false;
      if (this.pursue === R) this.pursueReset(R);
    }, 750);
  }
  pursueFace(w, P, dt) {
    const ac = this.storyActors?.[w];
    if (!ac) return;
    const m = ac.mesh.position;
    ac.mesh.rotation.y = lerpAngle(ac.mesh.rotation.y, Math.atan2(P.x - m.x, P.z - m.z), 1 - Math.exp(-8 * dt));
  }
}
