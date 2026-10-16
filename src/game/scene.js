// =============================================================
// GAME — CẢNH PHIM NÂNG CAO (cốt truyện): đạo cụ (xe tải, tấm ván, chó), mốc lộ trình, khói lốp, né xe, drift / té xe / chặn đầu,
// xe người chơi tự chạy theo trong lúc chiếu, xuống xe + tháo nón (giơ tay gỡ nón xuống, cầm trên tay).
// Phần của lớp Game (src/game.js): gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// Chỉ để nhìn, chỉ máy người chơi này vẽ (cốt truyện riêng); đồng hồ chung vẫn chạy (quay chậm chỉ làm chậm diễn viên + camera).
// =============================================================
import * as THREE from 'three';
import { makeDog, makePerson, makeCar, makeNpcMoto } from '../world/models.js';
import { makeRng } from '../sim/rng.js';
import { makeHelmetMesh, HEAD_CENTER_Y } from '../world/person.js';
import { makeLongTruck, makeRamp } from '../world/storyProps.js';
import { lerpAngle } from '../world/controllers.js';
import { sound } from '../audio.js';

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
  // a: { id, kind: truck | ramp | dog, at: [x, z], heading (độ, hướng đầu xe / đầu dốc lên), route: [{ at: [x, z], wait, speed }], speed, when: 'who:mark', len, h }
  storyPropSpawn(a) {
    this.storyProps ||= {};
    this.storyPropRemove(a.id);
    const color = a.color ? parseInt(String(a.color).slice(1), 16) : null, rng = makeRng([...String(a.id)].reduce((h, c) => h * 31 + c.charCodeAt(0), 11));
    const mesh = a.kind === 'truck' ? makeLongTruck() : a.kind === 'ramp' ? makeRamp({ len: a.len ?? 7, h: a.h ?? 1.5 }) : a.kind === 'dog' ? makeDog(0xd9a15b)
      : a.kind === 'car' ? makeCar(color ?? rng.pick([0xc0392b, 0x2c3e50, 0xecf0f1, 0x7f8c8d, 0x2980b9]), a.model || null) // xe diễn viên trong cảnh phim (thay xe thường)
      : a.kind === 'moto' ? makeNpcMoto(color ?? rng.pick([0x1f6fd1, 0xc0392b, 0x27ae60, 0x8e44ad, 0x2c3e50]), rng) : null;
    if (!mesh) return;
    const route = (a.route || []).filter((r) => Array.isArray(r?.at)).map((r) => ({ x: r.at[0], z: r.at[1], wait: r.wait || 0, speed: r.speed }));
    const start = route[0] || (Array.isArray(a.at) ? { x: a.at[0], z: a.at[1] } : null);
    if (!start) return;
    mesh.position.set(start.x, this.city.elev?.topAt(start.x, start.z) ?? 0, start.z);
    mesh.rotation.y = route.length > 1 ? Math.atan2(route[1].x - start.x, route[1].z - start.z) : ((a.heading ?? 0) * Math.PI) / 180;
    mesh.visible = !a.when;
    this.scene.add(mesh);
    this.storyProps[a.id] = { mesh, def: a, route, i: 0, v: 0, wait: 0, on: !a.when, done: route.length < 2, t: 0 };
  }
  storyPropRemove(id) {
    const p = this.storyProps?.[id];
    if (!p) return;
    this.scene.remove(p.mesh);
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
        }
      }
    }
    this.smokeTick(dt);
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
    ac.helmet = { t: instant ? 99 : 0, swapped: false, color: ac.look.hatColor ?? 0x1c1c1c, style: ac.look.helmetStyle || 'full' };
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
}
