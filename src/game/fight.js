// =============================================================
// GAME — ĐÁNH NHAU GÓC NHÌN THỨ 1 (cốt truyện chương 6, trên tàu HẢI LONG).
// Phần của lớp Game (src/game.js): gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// Luật thuần ở sim/fight.js (máu, đỡ, né, AI địch + anh Đạt); đây lo: góc nhìn thứ 1 (camera ở mắt, 2 tay cầm đồ),
// phím chuột, đồ nhặt dưới đất, đồ ném bay, hình địch (giơ tay, ngã), giao diện (ui/fightHud.js), âm thanh, thắng / thua / chơi lại.
// Việc cốt truyện: "fpv" (bật / tắt góc nhìn thứ 1) · "fight" (bắt đầu trận — story.json → fights) · điều kiện "fightWon".
// Màn LẺN (trận có stealth: { goal: [x, z], r, checkpoints: [[x, z], …] }): người gác đi tuần / đứng gác quét đèn, container / vách che tầm nhìn,
// VÙNG SÁNG (tầm nhìn từng tên) vẽ trên mặt đất / boong; bị thấy → màn đen, làm lại từ chốt gần nhất đã qua (chưa qua chốt nào: đầu màn)
// · tới chỗ goal (không bị thấy) = thắng. Đập lén sau lưng (E) vẫn được.
// Chỉ máy người chơi này (cốt truyện riêng); đồng hồ chung vẫn chạy.
// =============================================================
import * as THREE from 'three';
import { makeViewArms, makeLootMesh, makeWeaponMesh, fighterPose } from '../world/fightModels.js';
import { animatePerson, hipBend } from '../world/models.js';
import { resolveCircle } from '../world/physics.js';
import { FightHud } from '../ui/fightHud.js';
import { weaponOf, fightOf, makeFoe, meleeTargets, hitFoe, hitPlayer, foeTick, allyTick, playerTick, canTakedown, navNext, dist, sightOf, prewarm, PLAYER, ALLY, phaseOf, skillOf, bossMash, bossPhaseSet } from '../sim/fight.js';
import { ZONES } from '../sim/zones.js';
import { storyEvent } from '../sim/story.js';
import { sound } from '../audio.js';
import { fmt } from '../content/index.js';

const EYE = 1.62; // mắt cao bao nhiêu so với chân (người cao 1,7 m)
const SWING_T = 0.45; // thời gian 1 cú vung (giây) — trúng ở giữa cú
const THROW_T = 0.4;
const tmp = new THREE.Vector3();
const W2 = (F, p) => F.W(p || [0, 0]); // toạ độ trong bản đồ riêng → thế giới
const SEE_BLOCK = new Set(['house', 'post']); // vật che tầm nhìn: khối nào cao hơn tầm mắt đều che (không chỉ khối > 2,3 m)

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
      if (fp.swing > 0) A.pose('swing', fp.swing / SWING_T, this.fpBob, fp.move);
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
    // keepPos: đánh ngay chỗ đang đứng (đi bộ tới là đánh, không màn đen dịch chuyển) — thua thì làm lại từ chỗ này
    const here = def.keepPos ? { x: this.walker.pos.x, z: this.walker.pos.z } : null;
    const st = here || W(def.start || [0, 0]), heldAt = this.gs.story.held ? { ...this.gs.story.held } : null;
    const am = def.keepPos && def.ally && this.storyActors?.[def.ally]?.mesh.position;
    this.fight = { id, def, W, t: 0, start: { ...st, held: heldAt }, allyAt: am ? { x: am.x, z: am.z } : null, foes: [], ally: null, loot: [], proj: [], won: false, lost: false, cp: 0 };
    this.fightSetup(!!here);
    if (def.stealth) { // màn lẻn: không hiện thanh máu, nhắc cách chơi
      this.fightGoalMark(W(def.stealth.goal), def.stealth.r ?? 2);
      this.fightHud.show('fpv');
      sound('fight.sneak');
      this.hud.toast(fmt('story.fight.sneakHint'), 'info', 7000);
      return;
    }
    this.fightHud.show('fight');
    this.hud.el.classList.add('in-fight');
    sound('fight.start');
  }
  // dựng (lại) mọi thứ của trận — lúc bắt đầu và lúc chơi lại · stay: lúc bắt đầu trận "đánh tại chỗ" (không dịch chuyển, không xoay camera)
  fightSetup(stay = false) {
    const F = this.fight, def = F.def, W = F.W;
    // lưới đường đi của bản đồ (toạ độ thế giới)
    const nav = ZONES[def.zone]?.nav;
    F.nav = nav ? { nodes: nav.nodes.map((q) => { const p = W(q); return [p.x, p.z]; }), edges: nav.edges } : null;
    for (const f of F.foes) this.storyActorRemove(f.who);
    for (const l of F.loot) this.scene.remove(l.mesh);
    for (const p of F.proj) this.scene.remove(p.mesh);
    this.fightTele(F, true);
    F.loot = []; F.proj = []; F.t = 0; F.won = false; F.lost = false; F.slow = 0;
    const cpAt = F.cp > 0 && def.stealth?.checkpoints?.[F.cp - 1]; // màn lẻn: đã qua chốt → làm lại từ chốt đó
    if (!stay) this.zoneTeleport(cpAt ? (() => { const p = W(cpAt); return [p.x, p.z]; })() : [F.start.x, F.start.z]);
    if (F.start.held) this.heldSet(F.start.held.id, F.start.held.dur); else this.heldSet('fists');
    this.fp = this.fpNew();
    // nhìn về phía tên địch gần nhất lúc bắt đầu
    const near = (def.foes || []).filter((d) => d.join == null).map((d) => W(d.at || [0, 0])).sort((p, q) => Math.hypot(p.x - F.start.x, p.z - F.start.z) - Math.hypot(q.x - F.start.x, q.z - F.start.z))[0];
    if (near && !stay) { this.fpvYaw = Math.atan2(-(near.x - F.start.x), -(near.z - F.start.z)); this.fpvPitch = 0; }
    // địch: người lạ cốt truyện (hình theo "look"), đứng đúng chỗ; người vào sau (join) ẩn tới lúc chạy tới
    F.foes = (def.foes || []).map((d, i) => {
      const p = W(d.at || [0, 0]);
      this.storyActorSpawn({ do: 'actor', who: d.who, look: d.look || 'jetjet', spot: 'at', at: [p.x, p.z], heading: d.heading ?? 180, ...(d.outfit ? { outfit: d.outfit } : {}) });
      const foe = makeFoe(d, { x: p.x, z: p.z, heading: ((d.heading ?? 180) * Math.PI) / 180 }, undefined, i);
      if (d.patrol) foe.patrol = d.patrol.map((q) => [q[0] + W([0, 0]).x, q[1] + W([0, 0]).z, ...q.slice(2)]); // [x, z, dừng, hướng]
      if (def.stealth) foe.alert = false; // màn lẻn: cả người đứng gác cũng chưa biết mình tới
      if (d.phase > 0 && !foe.alert) prewarm(foe, d.phase); // lệch nhịp đi tuần
      const ac = this.storyActors?.[d.who];
      if (ac) {
        if (d.phase > 0) { ac.mesh.position.x = foe.x; ac.mesh.position.z = foe.z; ac.mesh.rotation.y = foe.heading; }
        ac.fightFoe = foe;
        if (foe.state === 'wait' && !foe.watch) ac.mesh.visible = false; // đứng xem (watch): vẫn hiện, hò hét tới lúc vào trận
        if (foe.f.weapon) this.fightArm(ac, foe.f.weapon);
        if (foe.f.boss) ac.mesh.scale.multiplyScalar(foe.kind === 'tiDo' ? 1 : 1.04);
      }
      return foe;
    });
    // boss nhiều giai đoạn: thua giữa chừng → chơi lại từ đầu giai đoạn đang dở (đàn em vào sẵn / đã bỏ chạy đúng như lúc đó)
    if (F.bossCp > 0) for (const boss of F.foes.filter((f) => f.f.phases?.length)) {
      bossPhaseSet(boss, F.bossCp);
      const fled = boss.f.phases.slice(1, F.bossCp + 1).some((p) => p.flee);
      for (const f of F.foes) if (f.state === 'wait' && f.join === 'rage') {
        if (fled) this.fightGone(f);
        else this.fightJoin(f);
      }
    }
    // anh Đạt
    if (def.ally) {
      const p = F.allyAt || W(def.allyAt || def.start || [0, 0]); // đánh tại chỗ: anh Đạt đứng đâu đánh đó
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
  // Màn lẻn: đánh dấu chỗ cần tới (vòng sáng xanh trên sàn + cột sáng mờ, thấy từ xa) — dọn khi xong / bỏ trận
  fightGoalMark(p, r) {
    if (this.goalMark) { this.scene.remove(this.goalMark); this.goalMark = null; }
    if (!p) return;
    const g = new THREE.Group(), y = this.city.elev?.topAt(p.x, p.z) ?? 0;
    const mat = (o) => new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.5, r - 0.25), r, 32).rotateX(-Math.PI / 2), mat(0.75));
    ring.position.y = 0.05;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 6, 24, 1, true).translate(0, 3, 0), mat(0.12));
    g.add(ring, beam);
    g.position.set(p.x, y, p.z);
    this.scene.add(g);
    this.goalMark = g;
  }
  fightStop() {
    const F = this.fight;
    if (!F) return;
    this.fightCones(F, null);
    this.fightTele(F, true);
    this.fightGoalMark(null);
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
    fp.y = w.mesh.position.y; // đứng tầng nào (dưới bến / trên boong / cầu thang)
    fp.hurtT = Math.max(0, fp.hurtT - dt);
    if (fp.swing > 0) { fp.swing += dt; if (fp.swing >= SWING_T) fp.swing = 0; }
    if (fp.throwT > 0) { fp.throwT += dt; if (fp.throwT >= THROW_T) fp.throwT = 0; }
    const F = this.fight;
    if (!F) { this.fightHud?.update(this.fightHudData()); return; }
    F.t += dt;
    playerTick(fp, dt);
    const free0 = !this.storyLose && !this.cine && !this.modal.open && !this.phone.open && !F.won;
    // bị đạp đập lưng vào vật cản (choáng) / bị ôm cổ: đứng yên, không đánh / đỡ / né được · đang bị ôm: bấm chuột trái liên tục để giãy
    fp.stunT = Math.max(0, (fp.stunT || 0) - dt);
    const locked = fp.stunT > 0 || !!fp.held;
    if (locked && fp.lock) { w.pos.x = fp.lock.x; w.pos.z = fp.lock.z; fp.x = w.pos.x; fp.z = w.pos.z; }
    if (fp.held && free0 && this.input.was('Mouse0')) {
      const n = bossMash(fp.held);
      if (n != null) { this.fightFloat(`${Math.min(n, skillOf(fp.held.f, 'clinch').mash)}/${skillOf(fp.held.f, 'clinch').mash}`, null, 'block'); sound('fight.swing'); }
    }
    const free = free0 && !locked;
    const wpn = weaponOf(this.heldId());
    // ---- người chơi: đỡ (giữ chuột phải) · vung / ném (chuột trái) · né (Space) ----
    const wasBlocking = fp.blocking;
    fp.blocking = free && !!this.input.mouse[2] && fp.pips > 0 && fp.swing === 0 && fp.throwT === 0;
    fp.blockT = fp.blocking ? (wasBlocking ? (fp.blockT || 0) + dt : 0) : 0; // mới bấm đỡ được bao lâu (đỡ đúng lúc: gạt superman)
    if (free && this.input.was('Mouse0') && fp.cd <= 0 && !fp.blocking) {
      if (wpn.throw) { fp.throwT = 0.001; fp.cd = 0.6; this.fightThrowSoon = THROW_T * 0.45; }
      else { fp.swing = 0.001; fp.cd = wpn.cd; fp.hitDone = false; sound('fight.swing'); const L = wpn.id === 'fists' ? ['jab', 'cross', 'hook'] : ['over', 'side']; fp.move = L[(fp.n = (fp.n ?? -1) + 1) % L.length]; } // đòn lần lượt (chỉ khác dáng)
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
    // tầm nhìn: dò từng 0,4 m từ mắt địch tới người chơi, đụng khối cao hơn tầm mắt (container, vách lầu, thùng gỗ, chồng phuy) là bị che
    const HOUSE = SEE_BLOCK;
    const los = (a, b) => {
      const eyeY = (a.y ?? w.mesh.position.y) + 1.45; // ngang mắt người đứng ở tầng của tên lính (dưới bến / trên boong)
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.4);
      for (let i = 1; i < n; i++) { const t = i / n; if (this.city.grid.inside(a.x + (b.x - a.x) * t, eyeY, a.z + (b.z - a.z) * t, HOUSE)) return false; }
      return true;
    };
    // boss đổi giai đoạn: chậm cảnh một chút (chỉ phần đánh nhau của mình — đồng hồ chung vẫn chạy bình thường)
    const fdt = F.slow > 0 ? dt * 0.35 : dt;
    F.slow = Math.max(0, F.slow - dt);
    for (const foe of F.foes) {
      const ac = this.storyActors?.[foe.who];
      if (!ac) continue;
      if (foe.state === 'wait' && typeof foe.join === 'number' && F.t >= foe.join) this.fightJoin(foe);
      foe.y = ac.mesh.position.y;
      const evs = foeTick(foe, { player: fp, ally: A && A.hp > 0 ? A : null, dt: fdt, blocked, route, los });
      for (const e of evs) this.fightFoeEvent(e);
      this.fightPlace(ac, foe, fdt);
    }
    this.fightSeparate();
    this.fightTele(F);
    // ---- anh Đạt ----
    if (A) {
      const ac = this.storyActors?.[A.who];
      for (const e of allyTick(A, F.foes, fp, fdt, route)) if (e.type === 'allyHit') {
        const r = hitFoe(e.foe, { dmg: ALLY.dmg, stun: 0 }, A, 'ally');
        this.fightHitFx(e.foe, r, 'ally');
      }
      if (ac) this.fightPlace(ac, A, fdt, true);
    }
    // ---- đồ bay ----
    this.fightProjTick(fdt);
    // ---- thắng / thua ----
    // màn lẻn: bị thấy (có tên đã biết mình mà chưa gục) → làm lại · tới chỗ cần tới → thắng
    const S = F.def.stealth;
    if (S) {
      this.fightCones(F, F.won || F.lost ? null : los);
      if (F.won || F.lost) return; // vừa bị phát hiện (chờ màn đen làm lại) / vừa tới đích
      if (F.foes.some((f) => f.alert && f.state !== 'ko')) return this.fightSeen();
      // qua chốt (theo thứ tự): bị phát hiện thì làm lại từ đây
      const cp = S.checkpoints?.[F.cp];
      if (cp) { const c = W2(F, cp); if (Math.hypot(fp.x - c.x, fp.z - c.z) < 2.2) { F.cp += 1; this.hud.toast(fmt('story.fight.checkpoint'), 'good', 2500); sound('progress.objective'); } }
      const g = W2(F, S.goal);
      if (Math.hypot(fp.x - g.x, fp.z - g.z) < (S.r ?? 2)) {
        F.won = true;
        storyEvent(this.gs.story, 'fightWon');
        sound('progress.objective');
        this.fightStop(); // xong màn lẻn: dọn người gác (vẫn giữ góc nhìn thứ 1)
      }
      return;
    }
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
  // ---------- VÙNG SÁNG (màn lẻn): hình quạt tầm nhìn từng tên trên mặt đất / boong, bị vật cản che thì cắt ----------
  // los = null → dọn hết. Mỗi tia dò từ mắt tên đó ra xa (từng 0,25 m) tới khi đụng vật cao — cùng cách tính "thấy" của luật (los) —
  // hoặc tới chỗ sàn khác tầng (đứng trên boong nhìn xuống bến: luật không tính là thấy). Mép vật che: chia nhỏ thêm tia cho
  // vùng sáng không lấn ra sau góc container. Đèn pin nhỏ trên tay cho thấy hướng từ xa
  fightCones(F, los) {
    F.cones ||= new Map();
    const keep = new Set();
    if (los) for (const foe of F.foes) {
      if (foe.state === 'ko' || foe.state === 'wait' || foe.alert) continue;
      const ac = this.storyActors?.[foe.who];
      if (!ac) continue;
      keep.add(foe.who);
      let C = F.cones.get(foe.who);
      if (!C) {
        const N = 36, MAX = N * 8 + 2, geo = new THREE.BufferGeometry(); // N tia gốc, mỗi khe chia thêm tối đa 7 tia
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
        const idx = [];
        for (let i = 0; i < MAX - 2; i++) idx.push(0, i + 1, i + 2);
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); // cộng sáng như đèn rọi: ban đêm thấy rõ
        mesh.frustumCulled = false;
        mesh.renderOrder = 5;
        this.scene.add(mesh);
        const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 12, 1, true).translate(0, -2.5, 0).rotateX(-Math.PI / 2 + 0.25), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        beam.position.set(0.2, 1.25, 0.25);
        ac.mesh.add(beam);
        const ear = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a45, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
        ear.renderOrder = 6;
        this.scene.add(ear);
        C = { mesh, N, beam, ear, t: 0, k: F.cones.size % 5 }; // k: lượt tính lại (chia đều các lính ra 5 khung hình)
        F.cones.set(foe.who, C);
      }
      // vòng tai nghe: bán kính bị nghe tiếng chân (đang chạy thì to ra)
      const hr = this.fp?.loud ? PLAYER.hearRun : PLAYER.hear;
      C.ear.position.set(foe.x, ac.mesh.position.y + 0.07, foe.z);
      C.ear.scale.set(hr, 1, hr);
      if (C.k > 0) { C.k -= 1; continue; } // lần đầu: lệch lượt theo thứ tự lính
      if ((C.t = (C.t || 0) - 1) > 0) continue; // tính lại mỗi 5 khung hình (chỉ để nhìn — luật "bị thấy" tính riêng ở sim/fight.js)
      C.t = 5;
      const S = sightOf(foe), fy = ac.mesh.position.y, y = fy + 0.06, eyeY = fy + 1.45, a = C.mesh.geometry.attributes.position;
      const grid = this.city.grid, elev = this.city.elev, HOUSE = SEE_BLOCK;
      // 1 tia: đi tới khi đụng vật cao ngang mắt / ra khỏi tầng đang đứng (trên cao mà dưới chân không còn sàn cùng tầng)
      const ray = (ang) => {
        const sx = Math.sin(ang), sz = Math.cos(ang);
        for (let d = 0.25; d < S.r; d += 0.25) {
          const x = foe.x + sx * d, z = foe.z + sz * d;
          if (grid.inside(x, eyeY, z, HOUSE)) return Math.max(0.3, d - 0.15);
          if (fy > 0.5 && elev && elev.heightAt(x, z, fy, 0) == null) return d;
        }
        return S.r;
      };
      const A0 = foe.heading - S.half, step = (2 * S.half) / C.N, pts = [];
      let prev = [A0, ray(A0)];
      pts.push(prev);
      for (let i = 1; i <= C.N; i++) {
        const cur = [A0 + step * i, 0];
        cur[1] = ray(cur[0]);
        // 2 tia cạnh nhau dài ngắn khác xa = có mép vật che ở giữa → chia nhỏ khe đó (7 tia thêm)
        if (Math.abs(cur[1] - prev[1]) > 0.6) for (let k = 1; k < 8; k++) { const g = prev[0] + (step * k) / 8; pts.push([g, ray(g)]); }
        pts.push(cur);
        prev = cur;
      }
      a.setXYZ(0, foe.x, y, foe.z);
      pts.forEach(([g, r], i) => a.setXYZ(i + 1, foe.x + Math.sin(g) * r, y, foe.z + Math.cos(g) * r));
      C.mesh.geometry.setDrawRange(0, (pts.length - 1) * 3);
      a.needsUpdate = true;
      C.mesh.geometry.computeBoundingSphere();
    }
    for (const [who, C] of F.cones) if (!keep.has(who)) { this.scene.remove(C.mesh); this.scene.remove(C.ear); C.mesh.geometry.dispose(); C.beam.parent?.remove(C.beam); F.cones.delete(who); }
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
    if (o.state === 'wait') { if (o.watch) this.fightWatch(ac); return; }
    if (o.gone) { m.visible = false; return; } // đàn em đã bỏ chạy
    const p = m.position;
    p.x = o.x; p.z = o.z;
    resolveCircle(p, 0.35, this.city.grid, p.y);
    o.x = p.x; o.z = p.z;
    // độ cao nền: mặt đứng gần nhất (boong, cầu thang) · không có (bến = mặt đất bằng) → nền cũ. KHÔNG lấy p.y của khung trước
    // (đã cộng cú nhún lấy đà / nằm ngã) → trước đây cộng dồn mỗi khung, Tí Đô lấy đà vài lần là bay lên trời
    const found = this.city.elev?.heightAt(p.x, p.z, o.baseY ?? p.y, 0.3);
    if (found != null) o.baseY = found;
    const top = o.baseY ?? 0;
    p.y = top;
    m.rotation.y = o.heading;
    const parts = m.userData.parts;
    ac.phase = (ac.phase || 0) + dt * (o.moving ? 9 : 0);
    // tay về chỗ buông thường (dáng đánh có vặn / dang tay — world/fightModels.js), thân thẳng
    if (parts) { parts.armR.rotation.set(0, 0, parts.armZ ?? 0); parts.armL.rotation.set(0, 0, -(parts.armZ ?? 0)); }
    if (o.state === 'ko') {
      // ngã ngửa nằm im
      o.koT = Math.min(1, (o.koT || 0) + dt * 3);
      m.rotation.x = -o.koT * 1.45;
      p.y = (top ?? p.y) + o.koT * 0.15;
      animatePerson(m, 0, 0);
      if (parts) hipBend(parts, 0);
      return;
    }
    m.rotation.x = 0;
    animatePerson(m, ac.phase, o.moving ? 1 : 0);
    if (!parts) return;
    // dáng đánh: thủ 2 nắm tay trước mặt · lấy đà · ra đòn (đấm thẳng / đấm móc / móc lên / bổ / quét — đòn nào do luật chọn, o.move)
    // địch: lúc trúng (sự kiện strike) bắt đầu đếm ac.hit · anh Đạt: vung 0,35 giây rồi ra đòn (o.t tính tiếp sau đó)
    if (ac.hit) ac.hit.t += dt;
    const busy = ['stagger', 'dazed', 'chargeWind', 'charge', 'throwWind', 'teep', 'slam', 'stomp', 'wave', 'superWind', 'fly', 'parried', 'clinchWind', 'clinch', 'roar'].includes(o.state) || o.trap > 0;
    const fighting = !busy && (ally ? o.state !== 'follow' : o.alert && o.state !== 'patrol' && o.state !== 'look');
    const wind = ally ? (o.state === 'swing' ? { move: o.move, k: o.t / 0.3 } : null) : o.state === 'windup' ? { move: o.move, k: o.t / (o.f?.windup || 0.6) } : null;
    const hit = ally ? (o.move && o.state !== 'swing' ? { move: o.move, t: o.t - 0.35 } : null) : ac.hit;
    const guard = !ally && (o.f?.phases?.length ? phaseOf(o)?.guard : o.f?.guard); // boss nhiều giai đoạn: đỡ hay không theo giai đoạn
    const pose = fighterPose(parts, { stance: fighting && (ally || dist(o, this.fp) < 7) ? (o.f?.weapon ? 'weapon' : 'fists') : false, block: !ally && o.state === 'guard' && guard, wind, hit });
    let bend = 0, twist = 0;
    if (pose) {
      bend = pose.bend; twist = pose.twist;
      if (pose.lunge) { p.x += Math.sin(o.heading) * pose.lunge; p.z += Math.cos(o.heading) * pose.lunge; } // nhoài người theo cú đấm
    }
    if (o.state === 'stagger') { bend = -0.3; parts.armL.rotation.x = parts.armR.rotation.x = 0.45; } // trúng đòn: ngửa ra sau, tay văng
    if (o.state === 'chargeWind') { bend = 0.38; parts.armL.rotation.x = parts.armR.rotation.x = -0.6; p.y += Math.abs(Math.sin(o.t * 12)) * 0.05; } // cúi đầu, dậm chân lấy đà
    if (o.state === 'charge') { bend = 0.55; parts.armL.rotation.x = parts.armR.rotation.x = -1.25; parts.elbowL.rotation.x = parts.elbowR.rotation.x = -0.5; } // cắm đầu lao tới
    if (o.state === 'throwWind') { const k = Math.min(1, o.t / 0.55); bend = -0.15 * k; twist = 0.5 * k; parts.armR.rotation.x = -2.7 * k; parts.elbowR.rotation.x = -1.1 * k; } // vác gạch ra sau đầu
    const bp = !ally && o.f?.phases?.length ? this.fightBossPose(ac, o, parts, p, dt) : null; // Tí Đô: dáng từng đòn
    if (bp) { bend = bp.bend; twist = bp.twist ?? 0; }
    m.rotation.z = o.state === 'dazed' || o.state === 'parried' ? Math.sin(o.t * 6) * 0.08 : 0;
    if (o.trap > 0) { parts.armL.rotation.x = parts.armR.rotation.x = 0; animatePerson(m, ac.phase * 3, 0.3); }
    hipBend(parts, bend, 0, twist); // gập / vặn thân quanh hông — chân đứng yên, thân trên không bị tách khỏi chân
    if (ac.buoy) ac.buoy.visible = o.trap > 0;
  }
  // Tí Đô (boss nhiều giai đoạn): dáng từng đòn — mọi đòn cùng lóe đỏ, người chơi nhìn DÁNG để biết né hay đỡ
  // (giơ 2 tay qua đầu = bổ, phải né · nhún lùi kéo tay = superman, đỡ đúng lúc · nhấc gối = đạp · nhấc chân cao = dậm đất)
  fightBossPose(ac, o, P, p, dt) {
    const ease = (x) => x * x * (3 - 2 * x), k = (len) => ease(Math.min(1, o.t / len)), f = o.f;
    const arms = (l, r, el = 0, er = 0) => { P.armL.rotation.x = l; P.armR.rotation.x = r; P.elbowL.rotation.x = el; P.elbowR.rotation.x = er; };
    switch (o.state) {
      case 'teep': {
        const S = skillOf(f, 'teep');
        arms(-0.9, -0.7, -1.7, -1.7); // 2 tay thủ trước mặt
        if (o.t < S.wind) { const q = k(S.wind); P.legR.rotation.x = -1.3 * q; P.kneeR.rotation.x = 1.6 * q; return { bend: 0 }; }
        P.legR.rotation.x = -1.45; P.kneeR.rotation.x = 0.1; // duỗi thẳng chân đạp
        return { bend: -0.25 };
      }
      case 'slam': { const q = k(skillOf(f, 'slam').wind); arms(-2.9 * q, -2.9 * q, -0.3 * q, -0.3 * q); return { bend: -0.1 * q }; }
      case 'stomp': { const q = k(skillOf(f, 'stomp').wind); P.legR.rotation.x = -1.2 * q; P.kneeR.rotation.x = 1.5 * q; arms(-0.9 * q, -0.9 * q); return { bend: -0.15 * q }; }
      case 'wave': arms(0.2, 0.2); return { bend: 0.4 };
      case 'superWind': // nhún lùi, kéo tay phải ra sau, tay trái che cằm
        arms(-0.9, 0.9, -1.4, -1.3);
        P.legL.rotation.x = P.legR.rotation.x = -0.3; P.kneeL.rotation.x = P.kneeR.rotation.x = 0.6;
        p.y -= 0.1;
        return { bend: -0.12 };
      case 'fly': { // bay ngang người, tay phải đấm thẳng
        const q = 1 - Math.max(0, o.flyLeft ?? 0) / skillOf(f, 'superman').dist;
        arms(-0.7, -1.6, -1.9, 0);
        P.legL.rotation.x = 0.6; P.kneeL.rotation.x = 0.8; P.legR.rotation.x = 0.2;
        p.y += Math.sin(Math.min(1, q) * Math.PI) * 0.55;
        return { bend: 0.5 };
      }
      case 'parried': arms(0.35, 0.35); return { bend: 0.3 };
      case 'clinchWind': case 'clinch':
        arms(-1.9, -1.9, -1.1, -1.1);
        if (o.state === 'clinch' && o.cl?.knee > 0 && Math.floor(o.t * 5) % 2) { P.legR.rotation.x = -0.9; P.kneeR.rotation.x = 1.3; } // lên gối
        return { bend: 0.25 };
      case 'roar': arms(-2.4, -2.4, -0.6, -0.6); return { bend: -0.35 };
      case 'recover':
        if (ac.slamT > 0) { ac.slamT -= dt; arms(-0.9, -0.9); return { bend: 0.45 }; } // vừa bổ xuống: cúi người, tay chạm đất
        return null;
      default: return null;
    }
  }
  // Cảnh báo đòn của boss — 1 màu ĐỎ cho mọi đòn: lóe đỏ quanh người lúc lấy đà · vệt đỏ đường húc · vòng sóng dậm đất. clear: dọn hết
  fightTele(F, clear = false) {
    F.tele ||= new Map();
    if (clear) {
      for (const T of F.tele.values()) { T.aura.parent?.remove(T.aura); this.scene.remove(T.strip, T.ring); for (const m of [T.aura, T.strip, T.ring]) m.geometry.dispose(); }
      F.tele.clear();
      return;
    }
    for (const foe of F.foes) {
      if (!foe.f.phases?.length) continue;
      const ac = this.storyActors?.[foe.who];
      if (!ac) continue;
      let T = F.tele.get(foe.who);
      if (!T) {
        const mat = () => new THREE.MeshBasicMaterial({ color: 0xff2a1f, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        const aura = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.3, 20, 1, true).translate(0, 1.15, 0), mat());
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), mat()); // dài 1 m về phía trước, kéo dài theo đường húc
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), mat());
        strip.renderOrder = ring.renderOrder = 6;
        ac.mesh.add(aura);
        this.scene.add(strip, ring);
        T = { aura, strip, ring };
        F.tele.set(foe.who, T);
      }
      const live = foe.state !== 'ko', pulse = Math.abs(Math.sin(F.t * 14)), y = (foe.baseY ?? ac.mesh.position.y) + 0.06;
      T.aura.material.opacity = live && foe.tele ? 0.16 + 0.22 * pulse : 0;
      T.strip.visible = live && foe.state === 'chargeWind';
      if (T.strip.visible) {
        T.strip.position.set(foe.x, y, foe.z);
        T.strip.rotation.y = foe.heading;
        T.strip.scale.set(1.1, 1, foe.f.charge?.dist ?? 14);
        T.strip.material.opacity = 0.22 + 0.3 * pulse;
      }
      const S = skillOf(foe.f, 'stomp');
      T.ring.visible = live && (foe.state === 'stomp' || foe.state === 'wave');
      if (T.ring.visible) {
        const q = foe.state === 'wave' ? Math.min(1, foe.t / S.wave) : 0, R = 0.7 + (S.r - 0.7) * q;
        T.ring.position.set(foe.x, y, foe.z);
        T.ring.scale.set(R, 1, R);
        T.ring.material.opacity = foe.state === 'stomp' ? 0.35 + 0.35 * pulse : 0.9 - 0.5 * q;
      }
    }
  }
  // Đàn em đứng xem (chờ vào trận): quay mặt về phía người chơi, giơ tay hò hét
  fightWatch(ac) {
    const m = ac.mesh, P = m.userData.parts, fp = this.fp;
    m.rotation.y = Math.atan2(fp.x - m.position.x, fp.z - m.position.z);
    if (!P) return;
    animatePerson(m, 0, 0);
    const t = this.fight.t * 5 + m.position.x;
    P.armR.rotation.set(Math.sin(t) > 0.2 ? -2.6 : -0.4, 0, P.armZ ?? 0);
    P.elbowR.rotation.x = -0.5;
  }
  // đàn em bỏ chạy hẳn (khỏi đếm trong trận)
  fightGone(f) {
    f.state = 'ko';
    f.gone = true;
    const ac = this.storyActors?.[f.who];
    if (ac) ac.mesh.visible = false;
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
      const ac = this.storyActors?.[e.foe?.who];
      if (ac && e.move) ac.hit = { move: e.move, t: 0 }; // dáng ra đòn (fightPlace)
      if (ac && e.move === 'slam') ac.slamT = 0.45;
      if (!e.hit) return sound('fight.swing');
      if (e.who === 'ally' && F.ally) {
        F.ally.hp = Math.max(0, F.ally.hp - e.dmg * ALLY.takeMul);
        sound('fight.hit');
        return;
      }
      const r = hitPlayer(fp, e.dmg, { breakGuard: e.breakGuard, unblockable: e.unblockable });
      const fo = e.foe, s = this.fightSide(fo);
      if (r.dodged) { this.fightFloat(fmt('story.fight.dodge'), null, 'block'); return; }
      if (r.blocked) { this.fightFloat(fmt('story.fight.blocked'), null, 'block'); sound('fight.block'); }
      else { fp.hurtT = 0.35; sound('fight.hurt'); }
      if (r.dmg > 0) this.fightHud.flash(s);
      if (e.knock) { // Tí Đô húc / đạp / dậm đất trúng: văng ra (dậm đất: văng ra xa khỏi nó) — đi từng đoạn ngắn để không xuyên tường
        const k = e.knock, W = this.walker.pos;
        let hx = e.from ? W.x - e.from.x : Math.sin(fo.heading), hz = e.from ? W.z - e.from.z : Math.cos(fo.heading), moved = 0;
        const l = Math.hypot(hx, hz) || 1;
        hx /= l; hz /= l;
        for (let i = 0; i < 4; i++) {
          const bx = W.x, bz = W.z;
          W.x += (hx * k) / 4; W.z += (hz * k) / 4;
          resolveCircle(W, 0.35, this.city.grid, this.walker.mesh.position.y);
          moved += Math.hypot(W.x - bx, W.z - bz);
        }
        // bị đạp mà sau lưng là container / thành tàu: đập lưng, choáng (đứng yên) — vòng đòn kế là húc tới
        if (e.wallStun && moved < k * 0.7) { fp.stunT = e.wallStun; fp.lock = { x: W.x, z: W.z }; this.fightFloat(fmt('story.fight.wall'), null, 'big'); sound('fight.ko'); }
      }
    } else if (e.type === 'charge') sound('fight.charge');
    else if (e.type === 'phase') { // boss sang giai đoạn mới: gầm lên, chậm cảnh, nói 1 câu
      const PH = phaseOf(e.foe);
      F.bossCp = e.n; // thua từ đây: chơi lại từ đầu giai đoạn này
      F.slow = 0.7;
      this.hud.toast(`${fmt(e.foe.f.name)} — ${fmt(PH.name)}`, 'warn', 3500);
      if (PH.say) this.storyBubble(e.foe.who, PH.say);
      this.fightFloat('‼', e.foe, 'big');
      sound('fight.roar');
      if (e.n === 1) for (const f of F.foes) if (f.state === 'wait' && f.join === 'rage') this.fightJoin(f); // giai đoạn 2: đàn em xông vào
      if (PH.flee) for (const f of F.foes) if (f !== e.foe && !f.f.boss && f.state !== 'ko') { // giai đoạn có "đàn em bỏ chạy": đánh tay đôi
        if (f.state === 'wait') this.fightGone(f);
        else { f.state = 'flee'; f.t = 0; f.engagedBy = null; }
      }
    } else if (e.type === 'stomp') sound('fight.stomp');
    else if (e.type === 'leap') sound('fight.swing');
    else if (e.type === 'parried') { this.fightFloat(fmt('story.fight.parry'), e.foe, 'big'); sound('fight.parry'); }
    else if (e.type === 'clinch') {
      if (e.on) { fp.held = e.foe; fp.lock = { x: fp.x, z: fp.z }; this.hud.toast(fmt('story.fight.clinch'), 'warn', 2500); sound('fight.hurt'); }
      else { fp.held = null; if (e.free) { this.fightFloat(fmt('story.fight.free'), null, 'big'); sound('fight.block'); } }
    }
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
    if (F.def.stealth) return d; // màn lẻn: không tên / thanh máu trên đầu lính (chưa đánh nhau — và không lộ chỗ lính sau container)
    d.left = F.foes.filter((f) => f.state !== 'ko').length;
    // tên đang nhắm: gần tâm ngắm nhất trong 8 m
    const near = meleeTargets(fp, F.foes, 8, 0.45)[0];
    // boss nhiều giai đoạn: thanh máu riêng ở trên cùng, chia vạch theo mốc giai đoạn
    const boss = F.foes.find((f) => f.f.phases?.length && f.state !== 'wait');
    if (boss) d.boss = { name: fmt(boss.f.name || 'story.foe.thug'), phase: fmt(phaseOf(boss)?.name || ''), n: boss.ph, hp: boss.hp, max: boss.max, marks: boss.f.phases.slice(1).map((p) => p.at) };
    if (near && near !== boss) d.target = { name: fmt(near.f.name || 'story.foe.thug'), hp: near.hp, max: near.max };
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
      const boss = F.foes.some((f) => f.f.phases?.length); // trận boss nhiều giai đoạn: nhắc cách đọc dáng đòn + chơi lại từ giai đoạn đang dở
      this.storyLoseShow({ failText: why === 'me' ? 'story.fight.lose' : 'story.fight.allyDown', failHint: why === 'me' ? (boss ? 'story.fight.loseBoss' : 'story.fight.loseHint') : 'story.fight.allyHint' });
    }, 900);
  }
  // Màn lẻn: bị phát hiện → tên đó la lên, màn đen ngắn rồi làm lại từ đầu màn (không có màn thua)
  fightSeen() {
    const F = this.fight;
    F.lost = true;
    const who = F.foes.find((f) => f.alert && f.state !== 'ko');
    if (who) this.storyBubble(who.who, 'story.fight.seenShout');
    sound('fight.alert');
    setTimeout(() => {
      if (this.fight !== F) return;
      this.storyFade({ text: 'story.fight.seen', t: 1.2 });
      setTimeout(() => { if (this.fight === F) { this.bubbles.remove(`story:${who?.who}`); this.fightSetup(); } }, 900);
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

