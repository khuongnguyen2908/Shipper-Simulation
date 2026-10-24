// =============================================================
// GAME — ĐÁNH NHAU GÓC NHÌN THỨ 1 (cốt truyện chương 6, trên tàu HẢI LONG).
// Phần của lớp Game (src/game.js): gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// Luật thuần ở sim/fight.js (máu, đỡ, né, AI địch + anh Đạt); đây lo: góc nhìn thứ 1 (camera ở mắt, 2 tay cầm đồ),
// phím chuột, đồ nhặt dưới đất, đồ ném bay, hình địch (giơ tay, ngã), giao diện (ui/fightHud.js), âm thanh, thắng / thua / chơi lại.
// Việc cốt truyện: "fpv" (bật / tắt góc nhìn thứ 1) · "fight" (bắt đầu trận — story.json → fights) · điều kiện "fightWon".
// Chỉ máy người chơi này (cốt truyện riêng); đồng hồ chung vẫn chạy.
// =============================================================
import * as THREE from 'three';
import { makeViewArms, makeLootMesh, makeWeaponMesh } from '../world/fightModels.js';
import { animatePerson } from '../world/models.js';
import { resolveCircle } from '../world/physics.js';
import { FightHud } from '../ui/fightHud.js';
import { weaponOf, fightOf, makeFoe, meleeTargets, hitFoe, hitPlayer, foeTick, allyTick, playerTick, canTakedown, navNext, dist, PLAYER, ALLY } from '../sim/fight.js';
import { ZONES } from '../sim/zones.js';
import { storyEvent } from '../sim/story.js';
import { sound } from '../audio.js';
import { fmt } from '../content/index.js';

const EYE = 1.62; // mắt cao bao nhiêu so với chân (người cao 1,7 m)
const SWING_T = 0.45; // thời gian 1 cú vung (giây) — trúng ở giữa cú
const THROW_T = 0.4;
const tmp = new THREE.Vector3();

export class FightPart {
  // ---------- GÓC NHÌN THỨ 1 ----------
  fpvSet(on) {
    on = !!on;
    if (on === !!this.fpvOn) return;
    this.fpvOn = on;
    this.fightHud ||= new FightHud(document.body);
    const cam = this.camera;
    if (on) {
      if (!cam.parent) this.scene.add(cam); // tay góc nhìn thứ 1 gắn vào camera → camera phải nằm trong cảnh
      this.viewArms ||= makeViewArms();
      cam.add(this.viewArms);
      this.viewArms.userData.setItem(this.heldId());
      this.fpvYaw = this.walker.heading + Math.PI;
      this.fpvPitch = 0;
      cam.fov = 70;
      this.fp ||= this.fpNew();
    } else {
      if (this.viewArms) cam.remove(this.viewArms);
      cam.fov = 60;
      this.walker.mesh.visible = true;
      this.rig.init = false;
    }
    cam.updateProjectionMatrix();
    this.hud.el.classList.toggle('in-fpv', on);
    this.fightHud.show(on ? (this.fight ? 'fight' : 'fpv') : 'off');
  }
  fpNew() {
    const w = weaponOf(this.heldId());
    return { hp: PLAYER.hp, max: PLAYER.hp, cd: 0, dodgeT: 0, dodgeCd: 0, pips: w.block, maxPips: w.block, pipT: 0, blocking: false, swing: 0, throwT: 0, hurtT: 0, x: 0, z: 0, heading: 0 };
  }
  // món đang cầm (lưu trong bản lưu: gs.story.held { id, dur })
  heldId() { return this.gs.story?.held?.id || 'fists'; }
  heldSet(id, dur) {
    const s = this.gs.story, w = weaponOf(id);
    if (w.id === 'fists') delete s.held; else s.held = { id: w.id, dur: dur ?? w.dur };
    this.viewArms?.userData.setItem(w.id);
    if (this.fp) { this.fp.maxPips = w.block; this.fp.pips = Math.min(this.fp.pips, w.block); }
  }

  // Camera ở mắt người chơi: chuột xoay nhìn (khóa con trỏ) / kéo chuột; đi lại theo hướng nhìn; lắc nhẹ khi bước
  fpvCamera(dt) {
    const k = this.settings.sens, ky = k * (this.settings.invertY ? -1 : 1), inp = this.input;
    const busy = this.storyTalkActor() || this.storyLose;
    if (!busy) {
      // khóa được con trỏ: chuột di tự do · không khóa được (khung trình duyệt nhúng): cứ di chuột trên màn hình là nhìn quanh
      const dx = inp.locked ? inp.look.dx * 0.6 : inp.free.dx * 0.9, dy = inp.locked ? inp.look.dy * 0.6 : inp.free.dy * 0.9;
      this.fpvYaw -= dx * 0.0042 * k;
      if (!inp.locked && inp.mx != null) { const edge = 40; if (inp.mx < edge) this.fpvYaw += dt * 2.2; else if (inp.mx > innerWidth - edge) this.fpvYaw -= dt * 2.2; } // con trỏ chạm mép → quay tiếp
      this.fpvPitch = Math.max(-1.3, Math.min(1.3, this.fpvPitch - dy * 0.0042 * ky));
    }
    this.rig.yaw = this.fpvYaw; // đi bộ theo hướng nhìn (walker dùng rig.yaw)
    this.rig.manualTimer = 99;
    const w = this.walker, m = w.mesh;
    m.visible = false;
    this.fpBob = (this.fpBob || 0) + dt * (w.speed > 0.5 ? w.speed * 2.1 : 0);
    const bob = w.speed > 0.5 ? Math.sin(this.fpBob) * 0.035 : 0;
    const eye = (w.tied ? 0.95 : EYE) * m.scale.y;
    this.camera.position.set(w.pos.x, m.position.y + eye + bob, w.pos.z);
    const hurt = this.fp?.hurtT > 0 ? Math.sin(this.fp.hurtT * 40) * 0.02 * this.fp.hurtT : 0;
    this.camera.rotation.set(this.fpvPitch + hurt, this.fpvYaw, 0, 'YXZ');
    // 2 tay
    const fp = this.fp, A = this.viewArms?.userData;
    if (A && fp) {
      if (fp.swing > 0) A.pose('swing', fp.swing / SWING_T, this.fpBob);
      else if (fp.throwT > 0) A.pose('throw', fp.throwT / THROW_T, this.fpBob);
      else if (fp.blocking) A.pose('block', 0, this.fpBob);
      else A.pose(fp.hurtT > 0 ? 'hurt' : 'idle', 0, this.fpBob);
    }
  }

  // ---------- TRẬN ĐÁNH ----------
  // Bắt đầu trận id (story.json → fights): dựng địch (người lạ cốt truyện), anh Đạt, đồ dưới đất; nhớ chỗ đứng để chơi lại
  fightStart(id) {
    const def = typeof id === 'object' ? id : fightOf(id); // (thử: đưa thẳng dữ liệu trận)
    if (!def) return storyEvent(this.gs.story, 'fightWon');
    this.fightStop();
    if (!this.fpvOn) this.fpvSet(true);
    const [ox, oz] = ZONES[def.zone]?.origin || [0, 0], W = (p) => ({ x: p[0] + ox, z: p[1] + oz });
    const st = W(def.start || [0, 0]), heldAt = this.gs.story.held ? { ...this.gs.story.held } : null;
    this.fight = { id, def, W, t: 0, start: { ...st, held: heldAt }, foes: [], ally: null, loot: [], proj: [], won: false, lost: false };
    this.fightSetup();
    this.fightHud.show('fight');
    this.hud.el.classList.add('in-fight');
    sound('fight.start');
  }
  // dựng (lại) mọi thứ của trận — lúc bắt đầu và lúc chơi lại
  fightSetup() {
    const F = this.fight, def = F.def, W = F.W;
    // lưới đường đi của bản đồ (toạ độ thế giới)
    const nav = ZONES[def.zone]?.nav;
    F.nav = nav ? { nodes: nav.nodes.map((q) => { const p = W(q); return [p.x, p.z]; }), edges: nav.edges } : null;
    for (const f of F.foes) this.storyActorRemove(f.who);
    for (const l of F.loot) this.scene.remove(l.mesh);
    for (const p of F.proj) this.scene.remove(p.mesh);
    F.loot = []; F.proj = []; F.t = 0; F.won = false; F.lost = false;
    this.zoneTeleport([F.start.x, F.start.z]);
    if (F.start.held) this.heldSet(F.start.held.id, F.start.held.dur); else this.heldSet('fists');
    this.fp = this.fpNew();
    // nhìn về phía tên địch gần nhất lúc bắt đầu
    const near = (def.foes || []).filter((d) => d.join == null).map((d) => W(d.at || [0, 0])).sort((p, q) => Math.hypot(p.x - F.start.x, p.z - F.start.z) - Math.hypot(q.x - F.start.x, q.z - F.start.z))[0];
    if (near) { this.fpvYaw = Math.atan2(-(near.x - F.start.x), -(near.z - F.start.z)); this.fpvPitch = 0; }
    // địch: người lạ cốt truyện (hình theo "look"), đứng đúng chỗ; người vào sau (join) ẩn tới lúc chạy tới
    F.foes = (def.foes || []).map((d, i) => {
      const p = W(d.at || [0, 0]);
      this.storyActorSpawn({ do: 'actor', who: d.who, look: d.look || 'jetjet', spot: 'at', at: [p.x, p.z], heading: d.heading ?? 180, ...(d.outfit ? { outfit: d.outfit } : {}) });
      const foe = makeFoe(d, { x: p.x, z: p.z, heading: ((d.heading ?? 180) * Math.PI) / 180 }, undefined, i);
      if (d.patrol) foe.patrol = d.patrol.map((q) => [q[0] + W([0, 0]).x, q[1] + W([0, 0]).z]);
      const ac = this.storyActors?.[d.who];
      if (ac) {
        ac.fightFoe = foe;
        if (foe.state === 'wait') ac.mesh.visible = false;
        if (foe.f.weapon) this.fightArm(ac, foe.f.weapon);
        if (foe.f.boss) ac.mesh.scale.multiplyScalar(foe.kind === 'tiDo' ? 1 : 1.04);
      }
      return foe;
    });
    // anh Đạt
    if (def.ally) {
      const p = W(def.allyAt || def.start || [0, 0]);
      if (!this.storyActors?.[def.ally]) this.storyActorSpawn({ do: 'actor', who: def.ally, look: 'char', spot: 'at', at: [p.x, p.z], heading: 0 });
      else { const m = this.storyActors[def.ally].mesh; m.position.set(p.x, this.city.elev?.topAt(p.x, p.z) ?? 0, p.z); }
      const ac = this.storyActors?.[def.ally];
      if (ac) { ac.fightAlly = true; this.storyTie?.({ who: def.ally, on: false }); }
      F.ally = { who: def.ally, x: p.x, z: p.z, heading: 0, hp: ALLY.hp, max: ALLY.hp, cd: 0.5, state: 'follow', t: 0 };
    }
    // đồ dưới đất
    for (const l of def.loot || []) {
      const p = W(l.at || [0, 0]), mesh = makeLootMesh(l.id);
      mesh.position.set(p.x, this.city.elev?.topAt(p.x, p.z) ?? 0, p.z);
      mesh.rotation.y = (p.x * 7 + p.z * 3) % 6.28;
      this.scene.add(mesh);
      F.loot.push({ id: l.id, x: p.x, z: p.z, mesh });
    }
  }
  // gắn vũ khí vào tay phải người lạ (Tí Sún cầm ống tuýp)
  fightArm(ac, id) {
    const el = ac.mesh.userData.parts?.elbowR;
    if (!el || ac.weaponMesh) return;
    const m = makeWeaponMesh(id);
    m.position.set(0, -0.27, 0.02);
    m.rotation.x = Math.PI / 2;
    el.add(m);
    ac.weaponMesh = m;
  }
  fightStop() {
    const F = this.fight;
    if (!F) return;
    for (const l of F.loot) this.scene.remove(l.mesh);
    for (const p of F.proj) this.scene.remove(p.mesh);
    for (const f of F.foes) if (f.state !== 'ko' || !F.won) this.storyActorRemove(f.who);
    this.fight = null;
    this.hud.el.classList.remove('in-fight');
    this.fightHud?.show(this.fpvOn ? 'fpv' : 'off');
  }

  // Mỗi khung hình (gọi từ zoneTick — sau khi người chơi đã đi)
  fightTick(dt) {
    if (!this.fpvOn) return;
    const w = this.walker, fp = this.fp;
    // người chơi luôn quay mặt theo hướng nhìn (địch biết mình đứng sau lưng nó hay không)
    w.heading = this.fpvYaw + Math.PI;
    Object.assign(fp, { x: w.pos.x, z: w.pos.z, heading: w.heading });
    fp.loud = w.speed > 5; // đang chạy: tiếng chân lớn, địch nghe xa
    fp.hurtT = Math.max(0, fp.hurtT - dt);
    if (fp.swing > 0) { fp.swing += dt; if (fp.swing >= SWING_T) fp.swing = 0; }
    if (fp.throwT > 0) { fp.throwT += dt; if (fp.throwT >= THROW_T) fp.throwT = 0; }
    const F = this.fight;
    if (!F) { this.fightHud?.update(this.fightHudData()); return; }
    F.t += dt;
    playerTick(fp, dt);
    const free = !this.storyLose && !this.cine && !this.modal.open && !this.phone.open && !F.won;
    const wpn = weaponOf(this.heldId());
    // ---- người chơi: đỡ (giữ chuột phải) · vung / ném (chuột trái) · né (Space) ----
    fp.blocking = free && !!this.input.mouse[2] && fp.pips > 0 && fp.swing === 0 && fp.throwT === 0;
    if (free && this.input.was('Mouse0') && fp.cd <= 0 && !fp.blocking) {
      if (wpn.throw) { fp.throwT = 0.001; fp.cd = 0.6; this.fightThrowSoon = THROW_T * 0.45; }
      else { fp.swing = 0.001; fp.cd = wpn.cd; fp.hitDone = false; sound('fight.swing'); }
    }
    if (fp.swing > SWING_T * 0.42 && !fp.hitDone) { fp.hitDone = true; this.fightSwingHit(wpn); }
    if (this.fightThrowSoon > 0 && (this.fightThrowSoon -= dt) <= 0) this.fightThrow(wpn);
    if (free && this.input.was('Space') && fp.dodgeCd <= 0) {
      const s = this.input.state, f = (s.forward ? 1 : 0) - (s.back ? 1 : 0), r = (s.right ? 1 : 0) - (s.left ? 1 : 0);
      const yaw = this.fpvYaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let dx = fx * f + -fz * r, dz = fz * f + fx * r;
      if (!f && !r) { dx = -fx; dz = -fz; } // không bấm hướng → lùi lại
      const l = Math.hypot(dx, dz) || 1;
      fp.dodge = { x: dx / l, z: dz / l, t: PLAYER.dodgeTime };
      fp.dodgeT = PLAYER.dodgeTime + 0.08;
      fp.dodgeCd = PLAYER.dodgeCd;
      sound('fight.dodge');
    }
    if (fp.dodge) {
      const v = PLAYER.dodgeDist / PLAYER.dodgeTime;
      w.pos.x += fp.dodge.x * v * dt;
      w.pos.z += fp.dodge.z * v * dt;
      resolveCircle(w.pos, 0.35, this.city.grid, w.mesh.position.y);
      if ((fp.dodge.t -= dt) <= 0) fp.dodge = null;
    }
    // ---- địch ----
    const A = F.ally;
    const blocked = (x, z) => { for (const c of this.city.grid.query(x, z, 0.8)) if (c.tag === 'house' && x > c.x0 - 0.5 && x < c.x1 + 0.5 && z > c.z0 - 0.5 && z < c.z1 + 0.5) return true; return false; };
    const route = (o, t) => this.fightRoute(o, t);
    for (const foe of F.foes) {
      const ac = this.storyActors?.[foe.who];
      if (!ac) continue;
      if (foe.state === 'wait' && typeof foe.join === 'number' && F.t >= foe.join) this.fightJoin(foe);
      const evs = foeTick(foe, { player: fp, ally: A && A.hp > 0 ? A : null, dt, blocked, route });
      for (const e of evs) this.fightFoeEvent(e);
      this.fightPlace(ac, foe, dt);
    }
    this.fightSeparate();
    // ---- anh Đạt ----
    if (A) {
      const ac = this.storyActors?.[A.who];
      for (const e of allyTick(A, F.foes, fp, dt, route)) if (e.type === 'allyHit') {
        const r = hitFoe(e.foe, { dmg: ALLY.dmg, stun: 0 }, A, 'ally');
        this.fightHitFx(e.foe, r, 'ally');
      }
      if (ac) this.fightPlace(ac, A, dt, true);
    }
    // ---- đồ bay ----
    this.fightProjTick(dt);
    // ---- thắng / thua ----
    const left = F.foes.filter((f) => f.state !== 'ko' && !(f.state === 'wait' && f.join === 'rage')).length;
    if (!F.won && !F.lost && left === 0 && !F.foes.some((f) => f.state === 'wait' && typeof f.join === 'number')) {
      F.won = true;
      storyEvent(this.gs.story, 'fightWon');
      sound('fight.win');
      this.hud.el.classList.remove('in-fight');
      this.fightHud.show('fpv');
      if (A) A.hp = Math.max(A.hp, A.max * 0.5);
    }
    if (!F.won && !F.lost && (fp.hp <= 0 || (A && A.hp <= 0))) this.fightLose(fp.hp <= 0 ? 'me' : 'ally');
    this.fightHud.update(this.fightHudData());
  }
  // Đi vòng qua vật cản: nhìn thẳng thấy thì đi thẳng, không thì theo lưới đường (tính lại mỗi ~0,4 giây)
  fightRoute(o, t) {
    const F = this.fight;
    if (!F.nav) return t;
    const y = (this.storyActors?.[o.who]?.mesh.position.y ?? this.walker.mesh.position.y) + 0.5; // ngang hông: vướng cả lan can, mép nước
    const grid = this.city.grid, HOUSE = this.fightHouse ||= new Set(['house', 'post', 'water']);
    const clear = (a, b) => {
      const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 0.4);
      for (let i = 1; i < n; i++) { const k = i / n, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k; if (grid.inside(x, y, z, HOUSE)) return false; }
      return true;
    };
    o.navT = (o.navT || 0) - 1;
    if (o.navT > 0 && o.navGoal) return dist(o, o.navGoal) < 0.5 ? (o.navT = 0, t) : o.navGoal;
    o.navT = 12;
    const g = navNext(F.nav, o, t, clear);
    o.navGoal = g === t ? null : g;
    return g;
  }
  // Đặt hình người theo vị trí luật (độ cao theo mặt đất / boong), dáng: đi, giơ tay, đánh, khựng, gục, bị phao trùm
  fightPlace(ac, o, dt, ally = false) {
    const m = ac.mesh;
    if (o.state === 'wait') return;
    const p = m.position;
    p.x = o.x; p.z = o.z;
    resolveCircle(p, 0.35, this.city.grid, p.y);
    o.x = p.x; o.z = p.z;
    const top = this.city.elev?.heightAt(p.x, p.z, p.y, 0.3);
    if (top != null) p.y = top;
    m.rotation.y = o.heading;
    const parts = m.userData.parts;
    ac.phase = (ac.phase || 0) + dt * (o.moving ? 9 : 0);
    if (o.state === 'ko') {
      // ngã ngửa nằm im
      o.koT = Math.min(1, (o.koT || 0) + dt * 3);
      m.rotation.x = -o.koT * 1.45;
      p.y = (top ?? p.y) + o.koT * 0.15;
      animatePerson(m, 0, 0);
      return;
    }
    m.rotation.x = 0;
    animatePerson(m, ac.phase, o.moving ? 1 : 0);
    if (!parts) return;
    const swingUp = (o.state === 'windup' || o.state === 'swing') && !ally ? o.t / (o.f?.windup || 0.6) : ally && o.state === 'swing' ? Math.min(1, o.t / 0.2) : 0;
    if (o.state === 'windup' || (ally && o.state === 'swing')) { parts.armR.rotation.x = -2.6 * Math.min(1, swingUp); parts.elbowR.rotation.x = -0.5; }
    else if (o.state === 'recover' && o.t < 0.25) { parts.armR.rotation.x = -1.1; parts.elbowR.rotation.x = -0.2; } // vừa bổ xuống
    if (o.state === 'stagger') m.rotation.x = 0.18; // khựng ngửa ra sau
    if (o.state === 'chargeWind') { parts.body.rotation.x = 0.35; parts.armL.rotation.x = parts.armR.rotation.x = -0.6; } // cúi đầu lấy đà
    if (o.state === 'charge') { parts.body.rotation.x = 0.45; parts.armL.rotation.x = parts.armR.rotation.x = -1.2; }
    if (o.state === 'dazed') m.rotation.z = Math.sin(o.t * 6) * 0.08; else m.rotation.z = 0;
    if (o.state === 'guard' && o.f?.guard) { parts.armL.rotation.x = -1.3; parts.elbowL.rotation.x = -1.6; } // boss thủ thế
    if (o.trap > 0) { parts.armL.rotation.x = parts.armR.rotation.x = 0; animatePerson(m, ac.phase * 3, 0.3); }
    if (ac.buoy) ac.buoy.visible = o.trap > 0;
  }
  // đẩy các người ra cho khỏi chồng lên nhau (địch – địch – anh Đạt – người chơi)
  fightSeparate() {
    const F = this.fight, bodies = [...F.foes.filter((f) => f.state !== 'ko' && f.state !== 'wait'), ...(F.ally ? [F.ally] : [])];
    const P = this.walker.pos;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d > 0 && d < 0.75) { const k = (0.75 - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
      }
      const dx = P.x - a.x, dz = P.z - a.z, d = Math.hypot(dx, dz);
      if (d > 0 && d < 0.75) { const k = (0.75 - d) / d; P.x += dx * k * 0.6; P.z += dz * k * 0.6; a.x -= dx * k * 0.4; a.z -= dz * k * 0.4; }
    }
  }
  // Người vào sau: hiện ra ở chỗ của mình rồi chạy tới
  fightJoin(foe) {
    foe.state = 'chase';
    foe.alert = true;
    foe.t = 0;
    const ac = this.storyActors?.[foe.who];
    if (ac) ac.mesh.visible = true;
  }
  fightFoeEvent(e) {
    const F = this.fight, fp = this.fp;
    if (e.type === 'alert') {
      this.storyReact([e.foe.who], '!');
      for (const f of F.foes) if (!f.alert && f.state !== 'wait' && dist(f, e.foe) < 14) f.alert = true; // la lên → cả đám biết
      sound('fight.alert');
    } else if (e.type === 'strike') {
      if (!e.hit) return sound('fight.swing');
      if (e.who === 'ally' && F.ally) {
        F.ally.hp = Math.max(0, F.ally.hp - e.dmg * ALLY.takeMul);
        sound('fight.hit');
        return;
      }
      const r = hitPlayer(fp, e.dmg, { breakGuard: e.breakGuard });
      const fo = e.foe, s = this.fightSide(fo);
      if (r.dodged) { this.fightFloat(fmt('story.fight.dodge'), null, 'block'); return; }
      if (r.blocked) { this.fightFloat(fmt('story.fight.blocked'), null, 'block'); sound('fight.block'); }
      else { fp.hurtT = 0.35; sound('fight.hurt'); }
      if (r.dmg > 0) this.fightHud.flash(s);
      if (e.knock) { // Tí Đô húc trúng: văng ra sau
        const k = e.knock, hx = Math.sin(fo.heading), hz = Math.cos(fo.heading);
        this.walker.pos.x += hx * k; this.walker.pos.z += hz * k;
        resolveCircle(this.walker.pos, 0.35, this.city.grid, this.walker.mesh.position.y);
      }
    } else if (e.type === 'charge') sound('fight.charge');
    else if (e.type === 'dazed') { this.fightFloat(fmt('story.fight.dazed'), e.foe, 'big'); sound('fight.ko'); }
    else if (e.type === 'rage') {
      this.hud.toast(fmt('story.fight.rage'), 'warn', 3500);
      for (const f of F.foes) if (f.state === 'wait' && f.join === 'rage') this.fightJoin(f);
      sound('fight.alert');
    } else if (e.type === 'throw') {
      const ac = this.storyActors?.[e.foe.who];
      const from = ac ? ac.mesh.position : e.foe;
      this.fightProjSpawn('brick', { x: from.x, y: (from.y || 0) + 1.7, z: from.z }, e.to, 'foe', e.dmg);
      sound('fight.throw');
    }
  }
  // Vung trúng: tên gần tâm nhất trong tầm + góc trước mặt
  fightSwingHit(wpn) {
    const F = this.fight, fp = this.fp, [foe] = meleeTargets(fp, F.foes, wpn.reach);
    if (!foe) return;
    const r = hitFoe(foe, wpn, fp, 'player');
    this.fightHitFx(foe, r, 'player', wpn);
    if (wpn.dur > 0 && !r.blocked) {
      const h = this.gs.story.held;
      if (h) { h.dur -= 1; if (h.dur <= 0) { this.heldSet('fists'); sound('fight.break'); this.fightFloat(`💥 ${fmt(wpn.name)}`, null, 'big'); } }
    }
  }
  fightHitFx(foe, r, by, wpn = null) {
    if (r.blocked) { this.fightFloat(fmt('story.fight.blocked'), foe, 'block'); sound('fight.block'); return; }
    if (!r.dmg) return;
    this.fightFloat(`-${r.dmg}`, foe, r.ko ? 'big' : 'dmg');
    sound(wpn?.id === 'pan' ? 'fight.pan' : r.ko ? 'fight.ko' : 'fight.hit');
  }
  // Ném (gạch / phao): bay theo hướng nhìn, vòng cung
  fightThrow(wpn) {
    const cam = this.camera, dir = cam.getWorldDirection(tmp).clone();
    const from = { x: cam.position.x + dir.x * 0.5, y: cam.position.y - 0.15, z: cam.position.z + dir.z * 0.5 };
    this.fightProjSpawn(wpn.id, from, null, 'player', wpn.dmg, dir);
    sound('fight.throw');
    const h = this.gs.story.held;
    if (h) { h.dur -= 1; if (h.dur <= 0) this.heldSet('fists'); }
  }
  fightProjSpawn(id, from, to, by, dmg, dir = null) {
    const mesh = makeWeaponMesh(id);
    mesh.position.set(from.x, from.y, from.z);
    this.scene.add(mesh);
    let v;
    if (dir) v = { x: dir.x * 15, y: dir.y * 15 + 3.2, z: dir.z * 15 };
    else { // địch ném tới chỗ người chơi đứng: tính vận tốc để rơi trúng sau ~0,9 giây
      const T = 0.9, dx = to.x - from.x, dz = to.z - from.z, ty = (this.walker.mesh.position.y + 1.2) - from.y;
      v = { x: dx / T, y: ty / T + 4.9 * T, z: dz / T };
    }
    this.fight.proj.push({ id, by, dmg, mesh, v, t: 0 });
  }
  fightProjTick(dt) {
    const F = this.fight, fp = this.fp;
    for (const p of [...F.proj]) {
      const m = p.mesh.position;
      p.t += dt;
      p.v.y -= 9.8 * dt;
      m.x += p.v.x * dt; m.y += p.v.y * dt; m.z += p.v.z * dt;
      p.mesh.rotation.x += dt * 9; p.mesh.rotation.z += dt * 5;
      let done = false;
      if (p.by === 'player') {
        for (const foe of F.foes) {
          if (foe.state === 'ko' || foe.state === 'wait') continue;
          const ac = this.storyActors?.[foe.who], fy = ac?.mesh.position.y ?? 0;
          if (Math.hypot(m.x - foe.x, m.z - foe.z) < 0.6 && m.y > fy + 0.2 && m.y < fy + 2.1) {
            const wpn = weaponOf(p.id);
            if (wpn.trap > 0) { // phao cứu sinh: trùm vào người, kẹt cứng mấy giây
              foe.trap = wpn.trap;
              foe.alert = true;
              if (ac && !ac.buoy) { ac.buoy = makeWeaponMesh('buoy'); ac.buoy.rotation.x = Math.PI / 2; ac.buoy.position.set(0, 0.9, -0.24); ac.mesh.add(ac.buoy); }
              this.fightFloat('🛟', foe, 'big');
              sound('fight.hit');
            } else this.fightHitFx(foe, hitFoe(foe, wpn, { x: m.x - p.v.x, z: m.z - p.v.z, heading: Math.atan2(p.v.x, p.v.z) }, 'player'), 'player', wpn);
            done = true;
            break;
          }
        }
      } else if (Math.hypot(m.x - fp.x, m.z - fp.z) < 0.7 && m.y < this.walker.mesh.position.y + 2) {
        const r = hitPlayer(fp, p.dmg);
        if (r.blocked) { this.fightFloat(fmt('story.fight.blocked'), null, 'block'); sound('fight.block'); }
        else if (!r.dodged) { fp.hurtT = 0.3; sound('fight.hurt'); this.fightHud.flash('t'); }
        done = true;
      }
      const ground = this.city.elev?.topAt(m.x, m.z) ?? 0;
      if (!done && (m.y <= ground + 0.05 || p.t > 4)) {
        done = true;
        // gạch / phao của mình rơi xuống đất → nằm đó, nhặt lại được
        if (p.by === 'player' && p.t <= 4) { const l = makeLootMesh(p.id); l.position.set(m.x, ground, m.z); this.scene.add(l); F.loot.push({ id: p.id, x: m.x, z: m.z, mesh: l }); }
        sound('fight.drop');
      }
      if (done) { this.scene.remove(p.mesh); F.proj.splice(F.proj.indexOf(p), 1); }
    }
    for (const l of F.loot) if (l.mesh.userData.glow) l.mesh.userData.glow.material.opacity = 0.16 + 0.1 * Math.sin(F.t * 4);
  }
  // Phía bị đánh (để loé đỏ mép màn hình): trước mặt / sau lưng / trái / phải
  fightSide(o) {
    const hf = Math.atan2(o.x - this.fp.x, o.z - this.fp.z), d = Math.atan2(Math.sin(hf - this.fp.heading), Math.cos(hf - this.fp.heading));
    return Math.abs(d) < 0.8 ? 't' : Math.abs(d) > 2.3 ? 'b' : d < 0 ? 'r' : 'l';
  }
  // chữ / số bay lên trên đầu người (o) hoặc giữa màn hình (o = null)
  fightFloat(text, o, kind = 'dmg') {
    let x = innerWidth / 2, y = innerHeight / 2 + 60;
    if (o) {
      const m = this.storyActors?.[o.who]?.mesh;
      if (m) {
        tmp.set(m.position.x, m.position.y + 2.1, m.position.z).project(this.camera);
        if (tmp.z > 1) return;
        x = ((tmp.x + 1) / 2) * innerWidth;
        y = ((1 - tmp.y) / 2) * innerHeight;
      }
    }
    this.fightHud.float(text, x, y, kind);
  }
  fightHudData() {
    const F = this.fight, fp = this.fp, wpn = weaponOf(this.heldId()), h = this.gs.story.held;
    const d = { me: { hp: fp.hp, max: fp.max }, cd: wpn.cd ? 1 - fp.cd / wpn.cd : 1, pips: { n: fp.pips, max: fp.maxPips }, blocking: fp.blocking,
      weapon: { icon: wpn.icon, name: fmt(wpn.name || 'story.wpn.fists'), dur: h?.dur ?? 0, max: wpn.dur, throw: !!wpn.throw }, tags: [] };
    if (!F) return d;
    d.ally = F.ally ? { name: this.speakerOf(F.ally.who)?.name || F.ally.who, hp: F.ally.hp, max: F.ally.max } : null;
    d.goal = F.def.goal ? fmt(F.def.goal) : fmt(F.def.name || 'story.fight.test');
    d.left = F.foes.filter((f) => f.state !== 'ko').length;
    // tên đang nhắm: gần tâm ngắm nhất trong 8 m
    const near = meleeTargets(fp, F.foes, 8, 0.45)[0];
    if (near) d.target = { name: fmt(near.f.name || 'story.foe.thug'), hp: near.hp, max: near.max };
    const W = innerWidth, H = innerHeight;
    const tag = (who, o, name, ally) => {
      const m = this.storyActors?.[who]?.mesh;
      if (!m || !m.visible || o.state === 'ko' || o.hp <= 0) return;
      tmp.set(m.position.x, m.position.y + 2.15 * m.scale.y, m.position.z).project(this.camera);
      if (tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) return;
      if (dist(o, fp) > 22) return;
      d.tags.push({ id: who, x: ((tmp.x + 1) / 2) * W, y: ((1 - tmp.y) / 2) * H, hp: o.hp, max: o.max, name, lock: o === near, ally });
    };
    for (const f of F.foes) if (f.state !== 'wait') tag(f.who, f, fmt(f.f.name || 'story.foe.thug'), false);
    if (F.ally) tag(F.ally.who, F.ally, d.ally.name, true);
    return d;
  }
  // ---------- THUA / CHƠI LẠI ----------
  fightLose(why) {
    const F = this.fight;
    F.lost = true;
    this.storyLose = true;
    sound('fight.ko');
    setTimeout(() => {
      if (this.fight !== F) return;
      this.storyLoseShow({ failText: why === 'me' ? 'story.fight.lose' : 'story.fight.allyDown', failHint: why === 'me' ? 'story.fight.loseHint' : 'story.fight.allyHint' });
    }, 900);
  }
  fightRetry() {
    const F = this.fight;
    this.loseEl?.classList.remove('on');
    this.storyFade({ t: 0.6 });
    setTimeout(() => {
      this.storyLose = false;
      if (this.fight === F) this.fightSetup();
    }, 750);
  }

  // ---------- E: nhặt đồ / đập lén (interactions/fight.js gọi) ----------
  fightNearLoot() {
    const F = this.fight, fp = this.fp;
    if (!F || !fp) return null;
    let best = null;
    for (const l of F.loot) {
      const d = Math.hypot(l.x - fp.x, l.z - fp.z);
      if (d < 2 && (!best || d < best.d)) best = { l, d };
    }
    return best;
  }
  fightPick(l) {
    const F = this.fight;
    const cur = this.gs.story.held;
    F.loot.splice(F.loot.indexOf(l), 1);
    this.scene.remove(l.mesh);
    // đang cầm món khác → bỏ xuống chỗ vừa nhặt
    if (cur) { const m = makeLootMesh(cur.id); m.position.copy(l.mesh.position); this.scene.add(m); F.loot.push({ id: cur.id, x: l.x, z: l.z, mesh: m, dur: cur.dur }); }
    this.heldSet(l.id, l.dur);
    sound('fight.pick');
  }
  fightNearTakedown() {
    const F = this.fight, fp = this.fp;
    if (!F || !fp) return null;
    return F.foes.find((f) => canTakedown(f, fp)) || null;
  }
  fightTakedown(foe) {
    foe.hp = 0;
    foe.state = 'ko';
    foe.t = 0;
    this.fp.swing = 0.001;
    this.fp.hitDone = true;
    this.fightFloat('💥', foe, 'big');
    sound('fight.ko');
  }
}

