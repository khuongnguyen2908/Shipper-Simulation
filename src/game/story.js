// =============================================================
// GAME — CỐT TRUYỆN lúc chơi: chạy bước (src/sim/story.js), người lạ, thoại bong bóng, chọn câu, cảnh phim, dí, hướng dẫn
// Phần của lớp Game (src/game.js): các hàm ở đây gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// =============================================================
import * as THREE from 'three';
import { voiceOf, charOfStory, lookOfChar, chapterNum } from '../data/relations.js';
import { ECONOMY, DIST, colorsToNumbers } from '../data/balance.js';
import { GOODS } from '../data/goods.js';
import { APP } from '../data/apps.js';
import { fmtClock } from '../sim/clock.js';
import { routeDist, nodePos, navRoute } from '../sim/cityLayout.js';
import { makeRng } from '../sim/rng.js';
import { uniformOf } from '../sim/GameState.js';
import { S } from '../sim/OrderManager.js';
import { STORY, HUD_PARTS, stepOf, chapterOf, storyTick, beginChapter, finishChapter, brandHelmet, storyEvent, actorsPresent, storyPick, REACT_ICONS, inChapter, titleNext } from '../sim/story.js';
import { lerpAngle } from '../world/controllers.js';
import { resolveCircle } from '../world/physics.js';
import { makePerson, setSitting, randomPersonOpts, npcLook, sitY, makeBike, animatePerson } from '../world/models.js';
import { jetjetLook, seatRider } from '../world/npcVehicles.js';
import { splitPages } from '../ui/modal.js';
import { Spotlight } from '../ui/spotlight.js';
import * as act from '../interactions.js';
import { sound } from '../audio.js';
import { fmt, has, pick } from '../content/index.js';
import { headOf } from '../ui/bubbles.js';
import { SW_H, NORMAL, dist2 } from './shared.js';

export class StoryPart {
  // ======================== CỐT TRUYỆN (src/sim/story.js · src/data/story.json) ========================
  // Bắt đầu chương đang chờ (chơi mới: sau màn "tới thành phố")
  storyBegin() {
    const s = this.gs?.story;
    if (s?.ch && s.step < 0) {
      beginChapter(s);
      this.saveGame(true); // lưu lúc bắt đầu chương
    }
  }
  // Mỗi khung hình (không chạy lúc đang mở hộp thoại): dMin = phút game vừa trôi
  storyUpdate(dMin) {
    const s = this.gs.story;
    const st = s?.ch ? stepOf(s) : null;
    // bước đang chờ hướng dẫn / cuốc cốt truyện, hoặc đang trong chương (đã hiện tên chương): app không phát đơn thường
    const inCh = !!s?.ch && inChapter(s);
    this.om.hold = !!st?.hold || inCh;
    // xong chương (đã sang chương khác / hết truyện) → có đơn lại. Trễ hạn quay lùi trong cùng chương thì không báo
    if (this.inChapterOf && !inCh && this.inChapterOf !== (s?.ch || null) && this.gs.brand) this.hud.toast(fmt('toast.storyOrdersBack'), 'good', 5000);
    this.inChapterOf = inCh ? s.ch : null;
    // sắp hiện tên chương: đang chạy đơn → chờ giao xong (nhắc) · có đơn mời chưa nhận → bỏ đơn mời, không tính bỏ đơn
    if (st && titleNext(s) && s.waited + dMin >= (st.delay || 0)) {
      const title = fmt(chapterOf(s).title);
      if (this.om.order && !this.om.order.story) {
        if (performance.now() - (this.storyBusyAt || 0) > 30000) { this.storyBusyAt = performance.now(); this.hud.toast(fmt('toast.storyBusy', { title }), 'warn', 6000); }
      } else if (this.om.state === S.OFFERED && this.om.dismissOffer(this.clockMin)) this.hud.toast(fmt('toast.storyOfferDropped', { title }), 'info', 5000);
    }
    // bước có cuốc cốt truyện mà cuốc chưa có (vừa mở lại game / lúc mời đang bận) → mời lại
    const offerAct = st && s.fired && (st.on || []).find((a) => a.do === 'offer');
    if (offerAct && !this.om.order && this.om.state !== S.OFFERED && !s.ev.delivered && performance.now() - (this.storyOfferAt || 0) > 1500) this.storyOffer(offerAct);
    if (!s?.ch || s.step < 0 || this.modal.open) return;
    this.storyLeash(st);
    const om = this.om;
    const orderStage = om.state === S.OFFERED ? 'offer' : !om.order ? null : om.state === S.TO_PICKUP || om.state === S.WAITING_FOOD || om.state === S.OUT_OF_STOCK || om.state === S.PACKING ? 'accept' : 'pickup';
    const acts = storyTick(this.gs, dMin, {
      orderStage,
      busy: () => !!om.order && !om.order.story, // đang chạy đơn thường (không phải đơn cốt truyện)
      near: (id, r) => { const pl = this.layout.placeById[id]; return !!pl && dist2(this.playerPos, pl.door) < r; },
      mounted: this.mode === 'bike',
      threadOpen: (who) => this.phone.open && this.phone.app === 'chat' && this.phone.thread === who,
      routed: (place) => this.storyRouted({ place }),
      actorNear: (who, r) => { const a = this.storyActors?.[who]; return !a || a.leaving || dist2(this.playerPos, a.mesh.position) < r; }, // người lạ không còn (mở lại game giữa cảnh) → coi như xong
      actorBoarded: (who) => !!this.storyActors?.[who]?.seated, // người lạ đang ngồi sau xe người chơi
      chased: (who) => !!this.storyActors?.[who]?.chase?.done, // tên cướp đã chạy hết lộ trình (người chơi bám theo)
      now: this.clockMin, // giờ chung (điều kiện "trong khung giờ")
      switchOn: (w) => this.om.state !== S.OFFLINE && !this.gs.flags[w === 'food' ? 'noFood' : 'noRide'] && (w !== 'ride' || this.gs.effect('passengerSeat')),
    });
    if (acts.length) this.runStoryActions(acts);
  }
  // Bước có "leash": chưa xong thì không cho đi xa địa điểm quá r m — giữ người chơi lại ở mép vùng + nhắc (mỗi ~4 giây một lần)
  storyLeash(st) {
    const L = st?.leash, c = L && this.layout.placeById[L.place]?.door;
    if (!c || !this.gs.story.fired) return;
    const P = this.playerPos, dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz), r = L.r || 30;
    if (d <= r) return;
    P.x = c.x + (dx / d) * r;
    P.z = c.z + (dz / d) * r;
    if (this.mode === 'bike') { this.bike.speed = 0; this.bike.vel.set(0, 0); }
    const now = performance.now();
    if (now - (this.leashAt || 0) > 4000) {
      this.leashAt = now;
      this.hud.toast(fmt(L.text, { name: this.gs.profile.name }), 'big', 3500);
    }
  }
  // Làm các việc của bước (story.json → on)
  runStoryActions(acts) {
    const gs = this.gs, ch = chapterOf(gs.story), name = gs.profile.name;
    for (const a of acts) {
      if (a.do === 'title') this.chapterCard(fmt(ch.title), fmt(ch.name), true); // tự mờ dần sau ~5 giây (bước sau chờ "wait" cho mờ hết)
      else if (a.do === 'openPhone') {
        this.phone.toggle(true);
        this.phone.openApp(a.app || 'chat');
        if ((a.app || 'chat') === 'chat' && a.who) {
          this.phone.thread = a.who;
          gs.readThread(a.who);
          this.phone.redraw();
        }
      } else if (a.do === 'closePhone') this.phone.toggle(false);
      else if (a.do === 'actor') this.storyActorSpawn(a);
      else if (a.do === 'approach') { const ac = this.storyActors?.[a.who]; if (ac) Object.assign(ac, { mode: 'approach', run: !!a.run, stop: !!a.stop, circle: null }); }
      else if (a.do === 'goto') this.storyActorGoto(a);
      else if (a.do === 'react') this.storyReact([].concat(a.who || []), a.icon);
      else if (a.do === 'cine') this.storyCineStart(a);
      else if (a.do === 'chase') this.storyChaseSpawn(a);
      else if (a.do === 'fail') this.storyFail(a);
      else if (a.do === 'sound' && a.code) sound(a.code);
      else if (a.do === 'leave') this.storyActorLeave(a.who);
      else if (a.do === 'remove') this.storyActorRemove(a.who);
      else if (a.do === 'board') this.storyActorBoard(a.who);
      else if (a.do === 'alight') this.storyActorAlight(a.who);
      else if (a.do === 'drop') { const ids = [].concat(a.id || []); gs.story.carry = [].concat(gs.story.carry || []).filter((x) => !ids.includes(x)); }
      // tuần tự: đang có câu chờ bấm E → câu mới / bảng chọn câu xếp hàng, người chơi bấm E mới hiện (không đè nhau)
      else if (a.do === 'choose') { if (a.ask) this.storyChooseShow(a); else this.storyEnqueue(() => this.storyChooseShow(a)); }
      else if (a.do === 'bubble') this.storyEnqueue(() => this.storyBubble(a.who, a.text, a.hold));
      else if (a.do === 'say') {
        // hội thoại bằng bong bóng trên đầu người nói: người lạ đang có mặt / NPC ở địa điểm của người trong danh bạ (không có thì trên đầu người chơi)
        const who = STORY.people?.[a.who] || STORY.contacts[a.who] || {};
        const mesh = this.storyActors?.[a.who]?.mesh || (who.place && this.npcs[who.place]) || null;
        this.storyConverse({ mesh, name: fmt(who.name || ''), pages: splitPages(fmt(a.text, this.storyVoice(a.who))) });
      } else if (a.do === 'msg') this.storyMessage(a.from, { key: a.text, loc: a.loc });
      else if (a.do === 'replies') gs.setReplies(a.who, a.texts || [], a.gains);
      else if (a.do === 'item') { if (!gs.story.items.includes(a.id)) gs.story.items.push(a.id); }
      else if (a.do === 'bike') {
        gs.flags.story = Math.max(1, gs.flags.story ?? 0);
        this.placeAtHomeBike();
        sound('place.gotBike');
        this.hud.toast(fmt('toast.gotBike'), 'big', 6000);
      } else if (a.do === 'give' && GOODS[a.goods]) gs.consumables[a.goods] = (gs.consumables[a.goods] || 0) + 1;
      else if (a.do === 'toast') this.hud.toast(fmt(a.text, { name }), 'big', 6000);
      else if (a.do === 'offer') this.storyOffer(a);
      else if (a.do === 'fuel' && gs.power !== 'pedal') gs.fuel = gs.vehicleSpec.tank * Math.max(0, Math.min(100, a.pct ?? 20)) / 100;
      else if (a.do === 'end') {
        this.chapterCard(fmt('story.chapterDone', { title: fmt(ch.title), name: fmt(ch.name) }), '');
        finishChapter(gs.story);
        this.saveGame(true); // lưu lúc kết thúc chương (= bắt đầu chương sau), kèm chỗ đứng
      }
    }
  }
  // ---------- NGƯỜI LẠ TRONG CẢNH (story.json → people; việc actor / approach / leave / remove / board / alight / bubble) ----------
  // Chỉ để nhìn, chỉ máy của người chơi này vẽ (cốt truyện riêng). Chỗ đứng cố định (xeOm / place) thì mở lại game dựng lại được.
  // Dáng người lạ (ACTOR_LOOKS): look + dress (đồ đi kèm)
  storyActorLook(kind, rng, a = {}) {
    if (kind === 'char') { // theo sơ đồ quan hệ: gắn NPC địa điểm → LUÔN lấy hình NPC đó (places.json, bỏ qua ngoại hình riêng) · không thì ngoại hình riêng (bộ đồ a.outfit)
      const c = charOfStory(a.who), pl = c?.place && this.layout.placeById[c.place];
      const look = pl?.npc ? npcLook(pl.id, colorsToNumbers(pl.npc)) : c?.look ? lookOfChar(c, a.outfit) : null;
      if (look) return { look: { ...look, hat: look.hat === 'helmet' ? 'helmet' : look.hat ?? null } };
      kind = 'normal';
    }
    if (kind === 'jetjet') return jetjetLook(rng);
    if (kind === 'girl') return { look: { ...randomPersonOpts(rng, 'f', { casual: true }), gender: 'f', hat: null } };
    if (kind === 'gentleman') return { look: { ...randomPersonOpts(rng, 'm', { casual: false }), gender: 'm', hat: null, shirt: 0xf4f4f4, pants: 0x1c2833, shoe: 0x2b1d14, shoeStyle: 'oxford', sleeves: 'long', shorts: false, hair: 0x1b1b1b } };
    return { look: randomPersonOpts(rng, 'm', { casual: true }) };
  }
  // Ngoại hình lúc đội mũ bảo hiểm (lên xe): nhân vật theo sơ đồ quan hệ có bộ đồ đội mũ (vd "Đi mô tô") → mặc bộ đó;
  // không thì giữ đồ đang mặc + mũ mặc định (helmet). Nhân vật gắn NPC địa điểm: luôn giữ hình NPC + mũ mặc định
  storyHelmetLook(ac, helmet) {
    const c0 = ac.def?.look === 'char' && charOfStory(ac.def.who);
    const c = c0 && !(c0.place && this.layout.placeById[c0.place]?.npc) ? c0 : null;
    const o = c && (c.outfits || []).find((x) => x.worn?.helmet);
    const look = o ? lookOfChar(c, o.id) : null;
    return look?.hat === 'helmet' ? { ...look, face: null } : { ...ac.look, face: null, ...helmet };
  }
  storyActorSpawn(a) {
    this.storyActors ||= {};
    const had = this.storyActors[a.who];
    if (had && (a.spot === 'xeOm' || a.spot === 'place') && had.def?.spot === a.spot && had.def.place === a.place && !had.leaving) { had.def = a; return; } // đã đứng sẵn đúng chỗ (dựng lúc mở game) → giữ nguyên
    this.storyActorRemove(a.who);
    const rng = makeRng([...a.who].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) + this.gs.day); // cố định theo người lạ + ngày
    const { look, dress = null } = this.storyActorLook(a.look, rng, a);
    const mesh = makePerson({ ...look, face: null });
    dress?.(mesh);
    const ac = { mesh, look, dress, mode: 'idle', phase: 0, t: 0, def: a, callT: 0 };
    const spot = a.spot === 'xeOm' ? this.storyActorSpot(a.place) : a.spot === 'place' ? this.storyPlaceSpot(a) : null;
    if (spot) {
      mesh.position.set(spot.x, SW_H, spot.z);
      mesh.rotation.y = spot.heading;
    } else {
      const cam = this.camera.position, p = this.storyPlayerAt(); // ngồi xe: hình người chơi gắn vào xe → lấy chỗ xe
      const fx = (p.x - cam.x), fz = (p.z - cam.z), fl = Math.hypot(fx, fz) || 1; // hướng camera nhìn (trên mặt đất)
      const d = a.dist ?? 8;
      // chỗ đứng: ưu tiên ngang hông người chơi (dọc vỉa hè), phải thấy trên màn hình, không nằm trong nhà / vật cản, đường đi tới người chơi thông
      const clear = (x, z) => !this.city.grid.inside(x, 0.5, z);
      const at = (deg) => { const r = (deg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r); return [p.x + ((fx * c + fz * sn) / fl) * d, p.z + ((fz * c - fx * sn) / fl) * d]; };
      const ok = (deg) => { const [x, z] = at(deg); for (let k = 1; k <= 8; k++) if (!clear(p.x + ((x - p.x) * k) / 8, p.z + ((z - p.z) * k) / 8)) return false; return true; };
      const seen = (deg) => { const [x, z] = at(deg), v = new THREE.Vector3(x, p.y + 1.7, z).project(this.camera); return v.z < 1 && Math.abs(v.x) < 0.55 && Math.abs(v.y) < 0.9; };
      const DEG = [70, -70, 55, -55, 40, -40, 25, -25, 0, 110, -110, 180];
      const [x, z] = at(DEG.find((g) => ok(g) && seen(g)) ?? DEG.find(ok) ?? 40);
      mesh.position.set(x, p.y, z);
      mesh.rotation.y = Math.atan2(p.x - mesh.position.x, p.z - mesh.position.z);
    }
    this.scene.add(mesh);
    // xe đi kèm (mô tô xịn): dựng sát lề phía đường, dọc theo đường
    if (a.vehicle === 'moto' && spot?.tx != null) {
      const bike = makeBike(0x15171c, 'sport');
      bike.userData.bagMesh.visible = false;
      // chỗ đứng bên kia đường (dist lớn) thì lòng đường nằm về phía cửa tiệm (-n); đứng ngay trước cửa thì lòng đường ở phía +n
      const toRoad = (a.dist ?? 1.5) > 8 ? -1 : 1;
      bike.position.set(spot.x + spot.nx * 1.7 * toRoad + spot.tx * 1.4, 0.02, spot.z + spot.nz * 1.7 * toRoad + spot.tz * 1.4);
      bike.rotation.y = Math.atan2(spot.tx, spot.tz);
      this.scene.add(bike);
      ac.vehicle = bike;
      ac.street = [spot.tx, spot.tz];
    }
    this.storyActors[a.who] = ac;
  }
  // Chỗ đứng "trước cửa địa điểm": từ cửa đi ra phía đường dist m (≈16,5 m = vỉa hè bên kia đường), lệch dọc đường lat m.
  // Quay mặt về phía cửa. Trả kèm hướng ra đường (nx, nz) và hướng dọc đường (tx, tz)
  storyPlaceSpot(a) {
    const pl = this.layout.placeById[a.place];
    if (!pl?.door) return null;
    const [nx, nz] = NORMAL[pl.face] || [0, 1], tx = -nz, tz = nx, d = a.dist ?? 1.5, lat = a.lat ?? 0;
    const x = pl.door.x + nx * d + tx * lat, z = pl.door.z + nz * d + tz * lat;
    return { x, z, heading: Math.atan2(-nx, -nz), nx, nz, tx, tz };
  }
  // Chỗ đứng "cạnh gốc cây kế chú xe ôm" ở địa điểm placeId: chú xe ôm gần cửa nhất → gốc cây gần chú nhất →
  // điểm sát gốc cây (không vướng vật cản, không đè lên xe chú), quay mặt ra phía cửa địa điểm. Cố định theo bản đồ (mở lại game vẫn đúng chỗ)
  storyActorSpot(placeId) {
    const pl = this.layout.placeById[placeId], door = pl?.door;
    if (!door) return null;
    const near = (list, p, f) => list.reduce((b, o) => { const d = Math.hypot(f(o)[0] - p.x, f(o)[1] - p.z); return !b || d < b.d ? { o, d } : b; }, null);
    const xe = near(this.traffic.xeOm || [], door, (o) => [o.g.position.x, o.g.position.z]);
    if (!xe || xe.d > 12) return null;
    const xp = xe.o.g.position;
    const tree = near(this.city.trees || [], xp, (t) => t);
    if (!tree || tree.d > 10) return null;
    const [tx, tz] = tree.o;
    let best = null;
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2, x = tx + Math.sin(ang) * 0.75, z = tz + Math.cos(ang) * 0.75;
      const dx = Math.hypot(x - xp.x, z - xp.z);
      if (this.city.grid.inside(x, 0.5, z) || dx < 1.9) continue; // xe chú dài ~1,9 m: đứng cách tâm xe đủ xa cho khỏi đè lên xe
      if (!best || dx < best.dx) best = { x, z, dx };
    }
    if (!best) return null;
    return { x: best.x, z: best.z, heading: Math.atan2(door.x - best.x, door.z - best.z) };
  }
  // Mở game / chơi mới: xóa người lạ của ván trước, dựng lại người đang có mặt (chỉ kiểu đứng cố định)
  storyActorsRestore() {
    for (const who of Object.keys(this.storyActors || {})) this.storyActorRemove(who);
    this.storyChoiceClose();
    this.storyTalkWith = null;
    this.storyAsk = null;
    this.pendingReply = null;
    this.storyQueue = [];
    this.storyCineStop();
    for (const a of Object.values(actorsPresent(this.gs.story))) {
      if (a.do === 'chase') this.storyChaseSpawn(a, true);
      else if (a.spot === 'xeOm' || a.spot === 'place') this.storyActorSpawn(a);
    }
    // mở lại game giữa cảnh phim → bỏ qua cảnh phim đó
    const s0 = this.gs.story, st0 = s0?.ch ? stepOf(s0) : null;
    if (s0?.fired && (st0?.on || []).some((a) => a.do === 'cine')) storyEvent(s0, 'cineDone');
    // mở lại game lúc đang chờ chọn câu trả lời → hiện lại bảng lựa chọn (kiểu "bấm E mới hiện" thì chờ bấm E)
    const s = this.gs.story, st = s?.ch ? stepOf(s) : null;
    const ch = s?.fired && (st?.on || []).find((a) => a.do === 'choose');
    if (ch && s.picks?.[ch.id] == null) this.storyChooseShow(ch);
  }
  // Người nói: 'player' · mã người lạ · 'place:<mã địa điểm>' (NPC đứng ở địa điểm) → { mesh, name, up (độ cao đỉnh đầu) }
  speakerOf(who) {
    if (who === 'player') return { mesh: this.walker.mesh, name: this.gs.profile.name, up: 2.05 };
    if (String(who).startsWith('place:')) {
      const id = who.slice(6), m = this.npcs[id];
      return m ? { mesh: m, name: this.layout.placeById[id]?.npc?.name || '', up: 1.95 } : null;
    }
    const ac = this.storyActors?.[who];
    return ac ? { mesh: ac.seated || ac.mesh, name: fmt(STORY.people?.[who]?.name || ''), up: ac.seated ? 1.6 : 1.95, ac } : null;
  }
  // Bong bóng kiểu cốt truyện: viền vàng, tên người nói, chữ hiện dần kèm tiếng; hold thì hiện xong có dấu [E] nhấp nháy (giữ tới câu sau)
  storyBubble(who, text, hold = false) {
    const sp = this.speakerOf(who);
    if (!sp || !text) return;
    if (who !== 'player') this.lastSpeaker = who; // camera nhìn theo người đang nói
    this.bubbles.show(`story:${who}`, () => headOf(sp.mesh, sp.up), fmt(text, this.storyVoice(who)), 'story', hold ? Infinity : undefined, { name: sp.name, type: true, wait: hold });
  }
  // Hiện 2–3 câu trả lời trên đầu người chơi (story.json → choose) · chọn bằng phím 1/2/3 hoặc bấm vào
  // a.ask: người chơi mở lời — chờ bấm E cạnh người nói (a.who) mới hiện các câu
  storyChooseShow(a, now = false) {
    if (a.ask && !now) { this.storyAsk = a; return; }
    this.storyAsk = null;
    const opts = (a.options || []).map((k) => fmt(k, this.storyVoice(a.who))); // câu người chơi nói với a.who: {khach} {minh} theo sơ đồ quan hệ
    if (!opts.length) return;
    this.storyChoice = { ...a, options: opts };
    if (this.speakerOf(a.who)) this.storyTalkWith = a.who; // đang nói chuyện với người này: đứng yên, camera nhìn 2 người
    this.bubbles.remove('story:player');
    this.bubbles.choices('story:choices', () => headOf(this.walker.mesh), opts, (i) => this.storyChoose(i));
  }
  // Vừa cộng điểm tính cách → thông báo nhỏ "😇 Gương mẫu ↑" (không hiện con số)
  storyGainToast(gain) {
    if (gain?.trait && gain.pts > 0) this.hud.toast(fmt(`story.trait.up.${gain.trait}`), 'info', 2500);
  }
  storyChoiceClose() {
    this.storyChoice = null;
    this.bubbles?.remove('story:choices');
  }
  // Người chơi chọn câu i: lưu lại (chương sau dùng) → người chơi nói câu đó → (dấu ? giật mình trên đầu c.react) →
  // ~1 giây sau người nói đáp câu tương ứng (giữ tới khi bấm E)
  storyChoose(i) {
    const c = this.storyChoice;
    if (!c || i >= c.options.length) return;
    this.storyChoiceClose();
    sound('ui.click');
    const gain = c.gains?.[i];
    storyPick(this.gs.story, c.id, i, gain);
    this.storyGainToast(gain);
    // câu người chơi vừa chọn: giữ tới khi bấm E, rồi người kia mới đáp (tuần tự, không đè nhau)
    this.bubbles.show('story:player', () => headOf(this.walker.mesh), c.options[i], 'story', Infinity, { name: this.gs.profile.name, type: true, wait: true });
    if (c.react?.length) this.reactAt = { list: c.react, t: 0.6 };
    if (c.answers?.[i] && this.speakerOf(c.who)) this.pendingReply = { who: c.who, text: c.answers[i] };
  }
  // ---------- THOẠI TUẦN TỰ: mỗi lúc một câu chờ E ----------
  // Câu đang giữ chờ bấm E (bong bóng cốt truyện có dấu E), trừ bảng chọn câu
  storyHeldId() {
    for (const [id, b] of this.bubbles.map) if (id.startsWith('story:') && id !== 'story:choices' && b.t === Infinity) return id;
    return null;
  }
  // Có câu đang chờ E → xếp hàng; không thì hiện luôn
  storyEnqueue(fn) {
    this.storyQueue ||= [];
    if (this.storyHeldId() || this.pendingReply) this.storyQueue.push(fn);
    else fn();
  }
  // Đang chờ người chơi bấm E để hiện câu kế (câu đáp / câu xếp hàng)
  storyWaitE() {
    return !!this.pendingReply || !!this.storyQueue?.length;
  }
  // Bấm E: chữ đang chạy → hiện hết · câu người chơi vừa chọn → người kia đáp · câu đang giữ → tắt, hiện câu kế trong hàng
  storyContinue() {
    const held = this.storyHeldId();
    if (held && this.bubbles.typing(held)) return this.bubbles.finish(held);
    if (this.pendingReply) {
      const r = this.pendingReply;
      this.pendingReply = null;
      this.bubbles.remove('story:player');
      return this.storyBubble(r.who, r.text, true);
    }
    if (held) this.bubbles.remove(held);
    const next = this.storyQueue?.shift();
    next?.();
  }
  // Dấu ? nhảy trên đầu (giật mình) ~1,8 giây
  // icon: '?' ngạc nhiên (mặc định) · '!' giật mình
  storyReact(list, icon = '?') {
    this.reacts ||= [];
    for (const who of list) {
      const sp = this.speakerOf(who);
      if (!sp) continue;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.reactTex[REACT_ICONS[icon] ? icon : '?'], depthTest: false, transparent: true }));
      s.renderOrder = 10;
      s.scale.set(0.6, 0.6, 1);
      sp.mesh.add(s);
      this.reacts.push({ s, t: 0, up: sp.up + 0.55 });
    }
  }
  reactsTick(dt) {
    if (this.reactAt && (this.reactAt.t -= dt) <= 0) { this.storyReact(this.reactAt.list); this.reactAt = null; }
    for (const r of this.reacts || []) {
      r.t += dt;
      r.s.position.y = r.up + Math.abs(Math.sin(r.t * 9)) * 0.15 * Math.max(0, 1 - r.t / 1.8);
      r.s.scale.setScalar(0.6 * Math.min(1, r.t / 0.18)); // bật lên
      if (r.t > 1.8) r.s.parent?.remove(r.s);
    }
    this.reacts = (this.reacts || []).filter((r) => r.t <= 1.8);
  }
  // Độ rõ của bảng tên / biển nổi (0..1): camera càng sát càng mờ (dưới near m: mờ hẳn, mờ dần trong span m);
  // bảng nằm giữa camera và người chơi (gần camera hơn, che hướng nhìn) → mờ còn tối đa 0,15
  labelFade(pos, near, span) {
    const cp = this.camera.position, pp = this.playerPos;
    const dc = Math.hypot(pos.x - cp.x, pos.z - cp.z);
    let a = Math.max(0, Math.min(1, (dc - near) / span));
    const vx = pp.x - cp.x, vz = pp.z - cp.z, L = Math.hypot(vx, vz) || 1;
    const along = ((pos.x - cp.x) * vx + (pos.z - cp.z) * vz) / L, side = Math.abs(((pos.x - cp.x) * vz - (pos.z - cp.z) * vx) / L);
    if (along > 0 && along < L - 0.5 && side < 2.5) a = Math.min(a, 0.15);
    return a;
  }
  // Khoảng cách tới mục tiêu theo đường đi thật (giống chỉ đường / bản đồ). Gần (< 25 m) thì đường chim bay.
  // Tính lại khi người chơi đi thêm > 4 m hoặc mục tiêu đổi chỗ (không tính mỗi khung hình)
  goalRouteDist(pp, tgt, straight) {
    if (straight < 25) return straight;
    const c = this.goalDistCache;
    if (c && Math.hypot(c.x - pp.x, c.z - pp.z) < 4 && c.tx === tgt.x && c.tz === tgt.z) return c.d;
    const d = Math.max(straight, routeDist(pp, tgt) || straight);
    this.goalDistCache = { x: pp.x, z: pp.z, tx: tgt.x, tz: tgt.z, d };
    return d;
  }
  // ---------- HỘI THOẠI BẰNG BONG BÓNG (mọi lời thoại cốt truyện: nói chuyện ở địa điểm, việc "say") ----------
  // mesh: người đang nói (NPC địa điểm / người lạ) · name: tên hiện trên bong bóng · pages: các câu (bấm E sang câu sau)
  // onDone: chạy khi nói xong (xếp hàng, tặng đồ, báo cốt truyện…). Không tự cho người chơi nói câu nào (người chơi chỉ nói khi tự chọn câu)
  // Trong lúc nói: người chơi đứng yên, quay mặt, camera xích lại (storyTalkActor); đồng hồ chung vẫn chạy (không dừng giờ).
  storyConverse({ mesh, name, pages, onDone = null }) {
    const list = (pages || []).map((t) => String(t).replace(/<[^>]+>/g, '').trim()).filter(Boolean); // bong bóng chỉ có chữ thường
    if (!list.length) return onDone?.();
    if (mesh?.userData?.label) mesh.userData.label.visible = false; // bảng tên trên đầu NPC: tạm ẩn cho khỏi chồng lên bong bóng
    this.talk = { mesh, name, pages: list, i: 0, onDone };
    this.talkLine();
    this.chatCh?.local('npc', name, list[0].length > 160 ? list[0].slice(0, 157) + '…' : list[0], { time: fmtClock(this.clockMin) }); // log chat bên trái
  }
  talkLine() {
    const t = this.talk;
    const head = t.mesh ? () => headOf(t.mesh, 1.95) : () => headOf(this.walker.mesh);
    this.bubbles.show('story:talk', head, t.pages[t.i], 'story', Infinity, { name: t.name, type: true, wait: true });
  }
  // Bấm E trong lúc nói chuyện: chữ đang chạy → hiện hết · không thì câu sau · hết câu → xong
  talkNext() {
    const t = this.talk;
    if (!t) return;
    if (this.bubbles.typing('story:talk')) return this.bubbles.finish('story:talk');
    if (++t.i < t.pages.length) return this.talkLine();
    this.talkEnd();
    t.onDone?.();
  }
  talkEnd() {
    const t = this.talk;
    if (!t) return;
    this.talk = null;
    this.bubbles.remove('story:talk');
    if (t.mesh?.userData?.label) t.mesh.userData.label.visible = true;
  }
  // Đang nói chuyện (để quay mặt + khóa camera): NPC địa điểm (storyConverse) · hoặc người chơi đã bấm E bắt chuyện, còn đứng gần,
  // bước đang chờ nói tiếp / chọn câu / sắp có câu đáp. Camera nhìn theo người vừa nói (lastSpeaker). Hết chuyện → camera trả lại như cũ
  storyTalkActor() {
    if (this.talk) return this.talk.mesh ? this.talk : null; // đang nói chuyện bằng bong bóng với NPC địa điểm
    const who = this.storyTalkWith;
    if (!who || this.mode !== 'foot') return null;
    const s = this.gs.story, st = s?.ch ? stepOf(s) : null, u = st?.until;
    const on = u?.type === 'talkActor' || u?.type === 'chosen' || this.storyWaitE() || !!this.storyChoice;
    const focus = (this.lastSpeaker && this.bubbles.map.has(`story:${this.lastSpeaker}`) && this.speakerOf(this.lastSpeaker)) || this.speakerOf(who);
    if (!on || !focus || focus.ac?.leaving || dist2(this.walker.pos, focus.mesh.position) > 5) {
      if (!on && s?.fired) this.storyTalkWith = null;
      return null;
    }
    return focus;
  }
  // Người chơi bấm E cạnh người nói (người lạ / NPC địa điểm): chờ mở lời → hiện các câu · chữ đang chạy → hiện hết ·
  // bước đang chờ nói chuyện với người này → sang câu tiếp theo · không thì người lạ nói câu "idle"
  storyActorTalk(who) {
    const s = this.gs.story, st = stepOf(s);
    if (this.storyChoice) return;
    if (this.storyAsk?.who === who) { this.storyTalkWith = who; return this.storyChooseShow(this.storyAsk, true); }
    if (this.storyTyping(who)) return this.bubbles.finish(`story:${who}`); // chữ đang chạy → bấm E hiện hết câu
    if (st && s.fired && st.until?.type === 'talkActor' && st.until.who === who) {
      this.storyTalkWith = who;
      this.bubbles.remove(`story:${who}`);
      storyEvent(s, `actor:${who}`);
      return;
    }
    const ac = this.storyActors?.[who];
    if (ac?.def?.idle && !this.storyActorPending(who)) this.storyBubble(who, ac.def.idle);
  }
  // Câu đang giữ (chờ bấm E) của người nói còn đang hiện dần chữ (câu gọi "Ê nhóc!" không tính: bấm E là bắt chuyện luôn)
  storyTyping(who) {
    const id = `story:${who}`;
    return this.bubbles.typing(id) && this.bubbles.map.get(id).t === Infinity;
  }
  // Còn chuyện để nói với người này không (để hiện nút E)
  storyActorTalkable(who) {
    const s = this.gs.story, st = stepOf(s), ac = this.storyActors?.[who];
    if (this.storyChoice || this.storyWaitE() || this.cine || ac?.leaving || ac?.seated || ac?.mode === 'goto' || ac?.mode === 'chase') return false;
    if (this.storyAsk?.who === who || this.storyTyping(who) || (st && s.fired && st.until?.type === 'talkActor' && st.until.who === who)) return true;
    return !!ac?.def?.idle && !this.storyActorPending(who);
  }
  // Chữ trên nút E khi đứng cạnh người nói
  storyTalkLabel(who) {
    const st = stepOf(this.gs.story);
    if (st?.talkLabel && (this.storyAsk?.who === who || st.until?.who === who)) return fmt(st.talkLabel);
    if (this.storyTalkWith && this.storyTalkWith !== null && (st?.until?.type === 'talkActor' || this.storyAsk)) return fmt('act.talkNext');
    return fmt('act.talkPed', { name: this.speakerOf(who)?.name || '' });
  }
  // Những người đang có thể bấm E nói chuyện: người lạ + NPC địa điểm mà bước đang chờ (mở lời / bấm E)
  storyTalkTargets() {
    const out = Object.keys(this.storyActors || {});
    const st = stepOf(this.gs.story), w = [this.storyAsk?.who, st?.until?.type === 'talkActor' ? st.until.who : null];
    for (const x of w) if (x && String(x).startsWith('place:') && !out.includes(x)) out.push(x);
    return out;
  }
  // Còn bước nào phía trước (kể cả bước đang chạy) chờ nói chuyện với người này không → chưa nói chuyện xong thì chưa có câu "idle"
  storyActorPending(who) {
    const s = this.gs.story, ch = s?.ch && chapterOf(s);
    return !!ch && ch.steps.slice(Math.max(0, s.step)).some((x) => x.until?.type === 'talkActor' && x.until.who === who);
  }
  // Chỗ người chơi trên bản đồ: đang ngồi xe thì là chỗ xe (hình người chơi lúc đó gắn vào xe, tọa độ là tọa độ trong xe)
  storyPlayerAt() {
    return this.mode === 'bike' ? this.bike.mesh.position : this.walker.mesh.position;
  }
  // Chỗ đứng trống quanh người chơi (cách ~1,9 m) cho người lạ đi tới rồi đứng lại: ưu tiên phía người đó đang đứng,
  // không chồng lên người lạ khác, không đứng sát xe, không đứng trong nhà / vật cản
  storyCircleSpot(who, ac) {
    const p = this.storyPlayerAt(), m = ac.mesh.position, R = 1.9;
    // chọn 1 lần rồi giữ (không thì chỗ đổi qua lại 2 bên mỗi khung hình → đứng nhún tại chỗ); người chơi đi chỗ khác (> 1,5 m) mới chọn lại
    const k = ac.circle;
    if (k && Math.hypot(k.px - p.x, k.pz - p.z) < 1.5) return k;
    const pick = (x, z) => (ac.circle = { x, z, px: p.x, pz: p.z });
    const base = Math.atan2(m.x - p.x, m.z - p.z);
    const others = Object.entries(this.storyActors || {}).filter(([w, x]) => w !== who && !x.seated && x.mode !== 'chase' && x.mesh.parent).flatMap(([, x]) => [x.mesh.position, ...(x.circle && x.mode === 'approach' ? [x.circle] : [])]);
    if (this.mode === 'foot') others.push(this.bike.mesh.position); // xe dựng gần đó
    for (const deg of [0, 35, -35, 70, -70, 105, -105, 140, -140, 180]) {
      const a = base + (deg * Math.PI) / 180, x = p.x + Math.sin(a) * R, z = p.z + Math.cos(a) * R;
      if (this.city.grid.inside(x, 0.5, z)) continue;
      if (others.some((o) => Math.hypot(o.x - x, o.z - z) < 1.1)) continue;
      return pick(x, z);
    }
    return pick(p.x + Math.sin(base) * R, p.z + Math.cos(base) * R);
  }
  // Hết cảnh phim (cine.endRide = mã người lạ): người chơi đã ngồi trên xe, xe quay về hướng đuổi theo người đó
  // (người đang chạy trốn: theo hướng lộ trình ở đoạn gần xe nhất · không thì quay thẳng về phía người đó). Camera ra sau xe.
  storyRideAfterCine(who) {
    const gs = this.gs;
    if (gs.towed || this.ferryRide || this.state !== 'play') return;
    if (this.mode !== 'bike') {
      const w = this.walker.pos, b = this.bike.pos;
      if (Math.hypot(b.x - w.x, b.z - w.z) > 6) { b.set(w.x, b.y, w.z); this.bike.mesh.position.set(w.x, this.bike.mesh.position.y, w.z); } // xe để xa → dắt lại chỗ người chơi
      act.mountBike(this);
    }
    const ac = this.storyActors?.[who], b = this.bike.pos;
    let h = this.bike.heading;
    if (ac?.chase) {
      const { path } = ac.chase;
      let best = Infinity;
      for (let i = 0; i + 1 < path.length; i++) {
        const A = path[i], B = path[i + 1], vx = B.x - A.x, vz = B.z - A.z, l2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((b.x - A.x) * vx + (b.z - A.z) * vz) / l2));
        const d = Math.hypot(A.x + vx * t - b.x, A.z + vz * t - b.z);
        if (d < best) [best, h] = [d, Math.atan2(vx, vz)];
      }
    } else if (ac) h = Math.atan2(ac.mesh.position.x - b.x, ac.mesh.position.z - b.z);
    this.bike.heading = h;
    this.bike.speed = 0;
    this.bike.vel?.set(0, 0);
    this.rig.yaw = h + Math.PI; // camera sau lưng xe
    this.rig.manualTimer = 0;
    // người đang chạy trốn: đặt ở trước người chơi ~1,3 × khoảng cách giữ (khuất sau góc phố) + lưu chỗ bắt đầu dí (thua thì về đây)
    if (ac?.chase) {
      const c = ac.chase;
      c.s = Math.min(c.total, this.chaseNearS(c, b) + (ac.def.gap ?? 30) * 1.3);
      c.v = 0;
      this.gs.story.chaseStart = { who, x: b.x, z: b.z, h, s: c.s };
      this.chasePlace(ac, 0);
    }
  }
  // Quãng đường trên lộ trình ở điểm gần chỗ p nhất
  chaseNearS(c, p) {
    let best = Infinity, s = 0;
    for (let i = 0; i + 1 < c.path.length; i++) {
      const A = c.path[i], B = c.path[i + 1], vx = B.x - A.x, vz = B.z - A.z, l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - A.x) * vx + (p.z - A.z) * vz) / l2));
      const d = Math.hypot(A.x + vx * t - p.x, A.z + vz * t - p.z);
      if (d < best) [best, s] = [d, c.len[i] + t * Math.sqrt(l2)];
    }
    return s;
  }
  // Mất dấu tên cướp: màn tối, báo thua, đưa người chơi (ngồi xe, quay đúng hướng) + tên cướp về chỗ bắt đầu dí (không chiếu lại cảnh phim).
  // Chơi nhiều người: chỉ dời chỗ của chính người chơi này (như hồi sinh), đồng hồ chung vẫn chạy.
  storyChaseLose(who, ac) {
    const c = ac.chase, st0 = this.gs.story.chaseStart;
    const st = st0?.who === who ? st0 : (() => { const p = this.chaseAt(c, Math.max(0, c.s - 70)); return { x: p.x, z: p.z, h: p.h, s: Math.min(c.total, c.s - 70 + (ac.def.gap ?? 30) * 1.3) }; })();
    sound('ui.warn');
    this.fadeFromBlack();
    this.hud.toast(fmt('story.chase.lost'), 'bad', 6000);
    const b = this.bike;
    if (this.mode !== 'bike') { this.walker.pos.set(st.x, this.walker.pos.y, st.z); this.walker.mesh.position.copy(this.walker.pos); }
    b.pos.set(st.x, b.pos.y, st.z);
    b.mesh.position.set(st.x, b.mesh.position.y, st.z);
    if (this.mode !== 'bike') act.mountBike(this);
    b.heading = st.h;
    b.speed = 0;
    b.vel?.set(0, 0);
    this.rig.yaw = st.h + Math.PI;
    this.rig.manualTimer = 0;
    Object.assign(c, { s: st.s, v: 0, done: false, warnAt: performance.now(), heading: null });
    this.chasePlace(ac, 0);
  }
  // Điểm trên lộ trình ở quãng s: { x, z, h (hướng đi) }
  chaseAt(c, s) {
    let i = 0;
    while (i < c.path.length - 2 && c.len[i + 1] < s) i++;
    const A = c.path[i], B = c.path[i + 1], t = Math.max(0, Math.min(1, (s - c.len[i]) / ((c.len[i + 1] - c.len[i]) || 1)));
    return { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t, h: Math.atan2(B.x - A.x, B.z - A.z) };
  }
  // Người lạ đi / chạy vào địa điểm rồi biến mất (vd chạy vào trường). Đang ngồi sau xe thì xuống trước
  storyActorGoto(a) {
    const ac = this.storyActors?.[a.who], door = this.layout.placeById[a.place]?.door;
    if (!ac) return;
    if (!door) return this.storyActorRemove(a.who);
    if (ac.seated) this.storyActorAlight(a.who);
    this.bubbles.remove(`story:${a.who}`);
    Object.assign(ac, { mode: 'goto', dest: door, run: a.run !== false, t: 0 });
  }
  // NPC địa điểm đang vắng: bước / chương có hideNpc + người lạ đang có mặt là nhân vật của NPC đó (không bị 2 chị Linh)
  storyNpcAway() {
    const out = new Set();
    const s = this.gs.story, st = s?.ch ? stepOf(s) : null, ch = s?.ch ? chapterOf(s) : null;
    for (const id of [...(ch?.hideNpc || []), ...(st?.hideNpc || [])]) out.add(id);
    for (const who of Object.keys(this.storyActors || {})) { const c = charOfStory(who); if (c?.place) out.add(c.place); }
    return out;
  }
  // Quá hạn giờ (bước có deadline): báo thất bại, (tin nhắn), dọn cảnh — story.js đã đưa tiến độ về bước "back"
  storyFail(a) {
    this.storyCineStop();
    sound('ui.warn');
    if (a.text) this.hud.toast(fmt(a.text, { name: this.gs.profile.name }), 'bad', 7000);
    if (a.from && a.msg) this.storyMessage(a.from, { key: a.msg });
    this.storyActorsRestore();
  }

  // ---------- 🎬 CẢNH PHIM (story.json → việc "cine") ----------
  // shots: [{ at: 'place:<mã>' | 'actor:<mã>' | 'player', t: giây, dist, height, angle (độ, 0 = phía trước mặt / trước cửa), follow, lookY }]
  // Camera rời người chơi, quay lần lượt từng cảnh (cắt cảnh), 2 dải đen trên dưới, ẩn bảng giao diện, khóa đi lại / lái xe.
  // Đồng hồ chung vẫn chạy (không dừng giờ — chơi nhiều người). Chỉ máy người chơi này thấy.
  storyCineStart(a) {
    const shots = (a.shots || []).filter((x) => x && (x.t ?? 0) > 0);
    if (!shots.length) return storyEvent(this.gs.story, 'cineDone');
    if (!this.cineEl) {
      this.cineEl = document.createElement('div');
      this.cineEl.id = 'cine';
      document.body.append(this.cineEl);
    }
    this.cine = { shots, i: 0, t: 0, cut: true, look: new THREE.Vector3(), pos: new THREE.Vector3(), def: a };
    document.body.classList.add('cine');
    if (this.phone.open) this.phone.toggle(false);
  }
  storyCineStop() {
    if (!this.cine) return;
    this.cine = null;
    document.body.classList.remove('cine');
  }
  // Cảnh quay đang chiếu → chỗ đặt camera + chỗ nhìn (null = mục tiêu không còn → sang cảnh sau)
  cinePose(shot) {
    let T = null, base = 0;
    const at = String(shot.at || 'player');
    if (at.startsWith('place:')) {
      const pl = this.layout.placeById[at.slice(6)];
      if (!pl?.door) return null;
      const [nx, nz] = NORMAL[pl.face] || [0, 1];
      T = pl.door;
      base = Math.atan2(nx, nz); // hướng từ cửa ra đường
    } else if (at.startsWith('actor:')) {
      const ac = this.storyActors?.[at.slice(6)], o = ac?.vehicle && ac.mode === 'chase' ? ac.vehicle : ac?.mesh;
      if (!o?.parent) return null;
      T = o.position;
      base = o.rotation.y; // hướng mặt / hướng xe chạy
    } else {
      const mounted = this.mode === 'bike';
      T = mounted ? this.bike.mesh.position : this.walker.mesh.position;
      base = mounted ? this.bike.mesh.rotation.y : this.walker.mesh.rotation.y;
    }
    const ang = base + ((shot.angle ?? 0) * Math.PI) / 180, dist = shot.dist ?? 8, y = T.y ?? 0;
    return {
      pos: new THREE.Vector3(T.x + Math.sin(ang) * dist, y + (shot.height ?? 3), T.z + Math.cos(ang) * dist),
      look: new THREE.Vector3(T.x, y + (shot.lookY ?? 1.1), T.z),
    };
  }
  cineTick(dt) {
    const c = this.cine;
    for (let guard = 0; guard < 20; guard++) {
      const shot = c.shots[c.i];
      if (!shot) {
        this.storyCineStop();
        storyEvent(this.gs.story, 'cineDone');
        if (c.def?.endRide) this.storyRideAfterCine(c.def.endRide);
        this.rig.manualTimer = 0;
        return this.updateCamera(0);
      }
      const pose = this.cinePose(shot);
      if (pose && c.t < shot.t) {
        // cắt cảnh: đặt camera ngay · bám theo: camera đi theo mượt · đứng yên: giữ chỗ đặt lúc cắt, chỉ xoay nhìn theo
        const k = c.cut ? 1 : 1 - Math.exp(-5 * dt);
        if (c.cut || shot.follow) c.pos.lerp(pose.pos, k);
        c.look.lerp(pose.look, c.cut ? 1 : 1 - Math.exp(-8 * dt));
        c.cut = false;
        c.t += dt;
        this.camera.position.copy(c.pos);
        this.camera.lookAt(c.look);
        return;
      }
      c.i += 1;
      c.t = 0;
      c.cut = true;
    }
  }

  // ---------- 🏍️ CHẠY TRỐN (story.json → việc "chase", vd tên cướp giật đồ) ----------
  // route: [{ place } | { node: [i, j] }] — chạy theo đường thật giữa các điểm (qua địa điểm giữa đường thì chạy ngang, không vào cửa).
  // Luôn giữ trước người chơi khoảng gap m: người chơi tới gần → rồ ga bỏ xa · bỏ xa quá → chạy chậm / dừng chờ. Đang chiếu cảnh phim thì
  // chạy thẳng (bỏ xa). Không đụng xe khác, không dừng đèn đỏ. Chỉ máy người chơi này thấy (cốt truyện riêng).
  storyChaseSpawn(a, resume = false) {
    this.storyActors ||= {};
    this.storyActorRemove(a.who);
    const path = this.chasePath(a.route || []);
    if (path.length < 2) return;
    const len = [0];
    for (let i = 1; i < path.length; i++) len.push(len[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    const rng = makeRng([...a.who].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) + this.gs.day);
    const { look } = this.storyActorLook(a.look || 'jetjet', rng, a);
    const bike = makeBike(a.color ? parseInt(String(a.color).slice(1), 16) : 0xb3261e, 'sport');
    bike.userData.bagMesh.visible = false;
    bike.rotation.order = 'YXZ'; // bốc đầu: ngửa quanh trục ngang của xe
    const rider = seatRider(bike, { ...look, face: null }, 'sport');
    this.scene.add(bike);
    const c = { path, len, total: len[len.length - 1], s: 0, v: 0, i: 0, wait: a.delay ?? 1, wheelie: a.wheelie ? 2.6 : 0, done: false, heading: null };
    if (resume) {
      // mở lại game giữa cuộc rượt: đã qua bước chờ chạy hết lộ trình → đứng ở cuối · không thì chạy trước người chơi một đoạn
      if (this.storyChasePassed(a.who)) Object.assign(c, { s: c.total, done: true });
      else {
        const P = this.playerPos;
        let best = 0, bd = Infinity;
        for (let i = 0; i < path.length; i++) { const d = Math.hypot(path[i].x - P.x, path[i].z - P.z); if (d < bd) [bd, best] = [d, i]; }
        c.s = Math.min(c.total, len[best] + (a.gap ?? 30));
      }
      Object.assign(c, { wait: 0, wheelie: 0 });
    } else if ((a.revAt ?? (a.wheelie ? 'start' : 'none')) === 'start') sound('city.rev'); // nẹt pô lúc xuất phát (mặc định mới: lúc chạy ngang người chơi)
    this.storyActors[a.who] = { mesh: bike, vehicle: bike, rider, look, def: a, mode: 'chase', phase: 0, t: 0, callT: 0, chase: c };
    this.chasePlace(this.storyActors[a.who], 0);
  }
  // Đã qua bước chờ người này chạy hết lộ trình chưa (để mở lại game đặt đúng chỗ)
  storyChasePassed(who) {
    const s = this.gs.story, ch = s?.ch && chapterOf(s);
    return !!ch && ch.steps.slice(0, Math.max(0, s.step)).some((x) => x.until?.type === 'chased' && x.until.who === who);
  }
  // Lộ trình → dãy điểm theo tim đường, lệch sang làn bên phải (xe chạy bên phải đường)
  chasePath(route) {
    const pts = route.map((r) => (r.place ? this.layout.placeById[r.place]?.door : Array.isArray(r.node) ? nodePos(r.node[0], r.node[1]) : null)).filter(Boolean);
    const line = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      let leg = navRoute(pts[i], pts[i + 1]);
      if (i > 0) leg = leg.slice(pts[i].mouth ? 2 : 1); // điểm giữa lộ trình: chạy ngang qua, không vào cửa
      if (i + 2 < pts.length) leg = leg.slice(0, leg.length - (pts[i + 1].mouth ? 2 : 1));
      for (const p of leg) if (!line.length || Math.hypot(p.x - line[line.length - 1].x, p.z - line[line.length - 1].z) > 0.5) line.push({ x: p.x, z: p.z });
    }
    const LANE = 1.8, out = [];
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, rx = -(b.z - a.z) / l, rz = (b.x - a.x) / l;
      out.push({ x: a.x + rx * LANE, z: a.z + rz * LANE }, { x: b.x + rx * LANE, z: b.z + rz * LANE });
    }
    return out;
  }
  chaseTick(who, ac, dt) {
    const c = ac.chase, a = ac.def;
    if (c.wait > 0) c.wait -= dt;
    else {
      const mounted = this.mode === 'bike', P = mounted ? this.bike.mesh.position : this.walker.mesh.position, pos = ac.vehicle.position;
      const d = Math.hypot(P.x - pos.x, P.z - pos.z), pv = mounted ? Math.abs(this.bike.speed) : 0;
      const gap = a.gap ?? 30, top = a.speed ?? 14;
      // chạy đều bằng pct% tốc độ tối đa của xe người chơi (xe đạp / xe máy đều theo kịp nếu chạy hết ga) — không dừng chờ
      const cruise = Math.max(3, (this.gs.vehicleSpec?.maxSpeed || 12) * (a.pct ?? 85) / 100);
      let want;
      if (this.cine) want = top; // đang chiếu cảnh phim: chạy thẳng, bỏ xa
      else want = Math.min(Math.max(top, cruise) * 1.6, Math.max(cruise, pv + (gap - d) * 0.5 + (d < gap * 0.5 ? 6 : 0))); // tới gần → rồ ga bỏ xa
      // tiếng nẹt pô lúc lướt ngang người chơi (revAt 'pass')
      if ((a.revAt ?? (a.wheelie ? 'start' : 'none')) === 'pass' && !c.revved && d < 12) { c.revved = true; sound('city.rev'); }
      // bị bỏ xa quá (lose m trên màn hình) → mất dấu, làm lại từ đầu đoạn dí · gần mốc thì cảnh báo
      const lose = (a.lose ?? 700) / DIST.displayPerUnit;
      if (!this.cine && !c.done && c.s < c.total) {
        if (d > lose) return this.storyChaseLose(who, ac);
        if (d > lose * 0.7 && performance.now() - (c.warnAt || 0) > 5000) { c.warnAt = performance.now(); this.hud.toast(fmt('story.chase.warn'), 'warn', 3000); }
      }
      c.v += Math.max(-10 * dt, Math.min((c.wheelie > 0 ? 16 : 8) * dt, want - c.v)); // bốc đầu: vọt mạnh
      if (c.wheelie > 0) c.wheelie = Math.max(0, c.wheelie - dt); // chỉ tính lúc đã chạy (không tính lúc đứng chờ)
      c.s = Math.min(c.total, c.s + c.v * dt);
      if (c.s >= c.total) {
        c.v = 0;
        if (!c.done && d < 60) c.done = true;
      }
    }
    this.chasePlace(ac, dt);
  }
  // Đặt xe theo quãng đã chạy c.s trên lộ trình: vị trí, độ cao (lên cầu), hướng xe, bốc đầu
  chasePlace(ac, dt) {
    const c = ac.chase, { path, len } = c;
    while (c.i < path.length - 2 && len[c.i + 1] < c.s) c.i++;
    while (c.i > 0 && len[c.i] > c.s) c.i--;
    const A = path[c.i], B = path[c.i + 1], seg = len[c.i + 1] - len[c.i] || 1, t = Math.max(0, Math.min(1, (c.s - len[c.i]) / seg));
    const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
    const want = Math.atan2(B.x - A.x, B.z - A.z);
    c.heading = c.heading == null || !dt ? want : lerpAngle(c.heading, want, 1 - Math.exp(-8 * dt));
    const lift = c.wheelie > 0 ? 0.42 * Math.min(1, c.wheelie / 0.5) : 0; // bốc đầu: ngửa đầu xe, bánh sau vẫn chạm đất
    const bike = ac.vehicle;
    bike.position.set(x, (this.city.elev?.topAt(x, z) ?? 0) + Math.sin(lift) * 0.7, z);
    bike.rotation.y = c.heading;
    bike.rotation.x = -lift;
  }

  storyActorLeave(who) {
    const ac = this.storyActors?.[who];
    if (!ac) return;
    this.bubbles.remove(`story:${who}`); // nói xong rồi mới đi
    // có xe đi kèm: đội nón full-face, lên xe, chạy dọc đường rồi biến mất
    if (ac.vehicle) {
      this.scene.remove(ac.mesh);
      ac.rider = seatRider(ac.vehicle, this.storyHelmetLook(ac, { hat: 'helmet', helmetStyle: 'full', hatColor: 0x111111 }), 'sport');
      Object.assign(ac, { mode: 'ride', leaving: true, t: 0, speed: 0 });
      return;
    }
    const p = this.walker.mesh.position, m = ac.mesh.position;
    const dx = m.x - p.x, dz = m.z - p.z, l = Math.hypot(dx, dz) || 1;
    // chạy ra xa người chơi: chọn hướng gần "thẳng ra xa" nhất mà 15 m phía trước không vướng nhà / vật cản
    const dirAt = (deg) => { const r = (deg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r); return [(dx * c + dz * sn) / l, (dz * c - dx * sn) / l]; };
    const free = ([ux, uz]) => { for (let k = 1; k <= 15; k++) if (this.city.grid.inside(m.x + ux * k, 0.5, m.z + uz * k)) return false; return true; };
    const dir = [0, 30, -30, 60, -60, 90, -90, 120, -120].map(dirAt).find(free) || dirAt(0);
    Object.assign(ac, { mode: 'leave', leaving: true, dir, t: 0 });
  }
  // Người lạ lên xe người chơi (ngồi sau, tự đội mũ — chuyến chở theo cốt truyện, không qua app): người chơi đang đi bộ thì đi theo,
  // người chơi ngồi trên xe, tới sát xe thì leo lên
  storyActorBoard(who) {
    const ac = this.storyActors?.[who];
    if (ac && !ac.seated) ac.mode = 'board';
  }
  storyActorSeat(ac) {
    const m = makePerson(this.storyHelmetLook(ac, { hat: 'helmet', hatColor: 0xff8fb1 })); // mũ bảo hiểm của mình
    this.scene.remove(ac.mesh);
    this.bike.mesh.add(m);
    setSitting(m, true);
    for (const s of ['L', 'R']) { m.userData.parts['arm' + s].rotation.x = -0.55; m.userData.parts['elbow' + s].rotation.x = -0.9; } // ôm hờ eo người lái
    m.position.set(0, sitY(m.scale.x, 1.02), -0.62);
    ac.seated = m;
    ac.mode = 'ride-with';
    this.bike.mesh.userData.bagMesh.visible = false;
  }
  storyActorAlight(who) {
    const ac = this.storyActors?.[who];
    if (!ac?.seated) return;
    ac.seated.parent?.remove(ac.seated);
    ac.seated = null;
    const h = this.bike.heading, b = this.bike.mesh.position; // xuống bên phải xe, đứng nhìn người chơi
    ac.mesh.position.set(b.x + Math.cos(h) * 1.1, b.y, b.z - Math.sin(h) * 1.1);
    this.scene.add(ac.mesh);
    ac.mode = 'idle';
  }
  storyActorRemove(who) {
    const ac = this.storyActors?.[who];
    if (!ac) return;
    this.scene.remove(ac.mesh);
    ac.seated?.parent?.remove(ac.seated);
    if (ac.vehicle) this.scene.remove(ac.vehicle);
    this.bubbles.remove(`story:${who}`);
    delete this.storyActors[who];
    if (this.lastSpeaker === who) this.lastSpeaker = null;
  }
  // Mỗi khung hình: đi tới chỗ người chơi, đứng nhìn người chơi / người cùng nói chuyện (def.faceTo), chạy đi, lên xe đi mất, theo người chơi lên xe
  storyActorsTick(dt) {
    this.reactsTick(dt);
    // câu đáp lại câu người chơi vừa chọn (người lạ / NPC địa điểm)
    // câu đang giữ đã tắt (vd đi xa) mà còn câu xếp hàng → hiện câu kế
    if (this.storyQueue?.length && !this.storyHeldId() && !this.pendingReply) this.storyQueue.shift()();
    for (const [who, ac] of Object.entries(this.storyActors || {})) {
      if (ac.seated) continue; // đang ngồi sau xe người chơi: đi theo xe
      if (ac.mode === 'chase') { this.chaseTick(who, ac, dt); continue; } // tên cướp chạy xe theo lộ trình
      if (ac.mode === 'ride') { // lên mô tô chạy dọc đường, 6 giây sau biến mất
        ac.t += dt;
        ac.speed = Math.min(11, ac.speed + dt * 5);
        ac.vehicle.position.x += ac.street[0] * ac.speed * dt;
        ac.vehicle.position.z += ac.street[1] * ac.speed * dt;
        if (ac.t > 6) this.storyActorRemove(who);
        continue;
      }
      const m = ac.mesh.position, p = this.storyPlayerAt();
      const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
      let speed = 0, amount = 0;
      if (ac.mode === 'approach' && d > 1.2) [speed, amount] = ac.run ? [3.8, 1] : [1.5, 0.55];
      if (ac.mode === 'leave') [speed, amount] = [5, 1];
      // đi / chạy vào địa điểm: tới sát cửa thì biến mất (vào trong)
      let gx = 0, gz = 0;
      // đi tới rồi đứng lại (approach.stop): tới chỗ trống quanh người chơi (vòng nhóm nói chuyện) thì dừng hẳn, không đi theo nữa
      if (ac.mode === 'approach' && ac.stop) {
        const sp = this.storyCircleSpot(who, ac);
        gx = sp.x - m.x; gz = sp.z - m.z;
        const gd = Math.hypot(gx, gz) || 1;
        if (gd < 0.3) { ac.mode = 'idle'; speed = 0; amount = 0; }
        else { [gx, gz] = [gx / gd, gz / gd]; [speed, amount] = ac.run && gd > 1.5 ? [3.8, 1] : [1.5, 0.55]; }
      }
      if (ac.mode === 'goto') {
        gx = ac.dest.x - m.x; gz = ac.dest.z - m.z;
        const gd = Math.hypot(gx, gz) || 1;
        if (gd < 1) { this.storyActorRemove(who); continue; }
        [gx, gz] = [gx / gd, gz / gd];
        [speed, amount] = ac.run ? [3.8, 1] : [1.5, 0.55];
        if ((ac.t += dt) > 20) { this.storyActorRemove(who); continue; } // kẹt đâu đó quá lâu → coi như đã vào
      }
      if (ac.mode === 'board') {
        const b = this.bike.mesh.position, db = Math.hypot(b.x - m.x, b.z - m.z);
        if (this.mode === 'bike' && db < 3.5 && Math.abs(this.bike.speed) < 1.5) { this.storyActorSeat(ac); continue; }
        if (d > 2.2) [speed, amount] = [Math.min(4, 1.4 + d * 0.3), 0.6]; // đi theo người chơi
      }
      const [ux, uz] = ac.mode === 'leave' ? ac.dir : ac.mode === 'goto' || (ac.mode === 'approach' && ac.stop) ? [gx, gz] : [dx / (d || 1), dz / (d || 1)];
      m.x += ux * speed * dt;
      m.z += uz * speed * dt;
      if (speed) resolveCircle(m, 0.35, this.city.grid); // né nhà, cột, xe buýt đậu… (trượt dọc theo)
      if (ac.mode === 'board' || ac.mode === 'approach' || ac.mode === 'goto' || (ac.def?.spot !== 'xeOm' && ac.def?.spot !== 'place')) m.y = p.y; // đứng cố định trên vỉa hè thì giữ nguyên độ cao
      if (speed) ac.mesh.rotation.y = Math.atan2(ux, uz);
      else {
        // đứng yên: người chơi tới gần (12 m) → quay về phía người đang nói (bong bóng đang hiện, không phải mình), không thì người chơi;
        // người chơi ở xa → nhìn người cùng nói chuyện (faceTo)
        const other = ac.def?.faceTo && this.storyActors[ac.def.faceTo]?.mesh;
        const ls = this.lastSpeaker && this.lastSpeaker !== who && this.bubbles.map.has(`story:${this.lastSpeaker}`) && this.speakerOf(this.lastSpeaker)?.mesh;
        const tgt = d < 12 ? (ls?.parent === this.scene ? ls.position : p) : other?.parent ? other.position : null;
        if (tgt) {
          const want = Math.atan2(tgt.x - m.x, tgt.z - m.z), cur = ac.mesh.rotation.y;
          ac.mesh.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 4);
        }
      }
      // đang có dấu ! trên đầu (chờ người chơi lại nói chuyện) → cứ ~6 giây gọi một câu
      const s = this.gs.story, st = s?.ch ? stepOf(s) : null, bid = `story:${who}`;
      const marked = [].concat(st?.mark || []).some((k) => k.actor === who && k.icon === '!');
      if (ac.def?.call && s.fired && marked && d < 25 && !this.bubbles.map.has(bid) && (ac.callT -= dt) <= 0) {
        this.storyBubble(who, ac.def.call);
        ac.callT = 6;
      }
      if (d > 10 && this.bubbles.map.get(bid)?.t === Infinity) this.bubbles.remove(bid); // đi xa: tắt câu đang giữ
      ac.phase += dt * (amount ? 5 + speed : 0);
      animatePerson(ac.mesh, ac.phase, amount);
      if (ac.mode === 'leave' && (ac.t += dt) > 5) this.storyActorRemove(who);
    }
  }

  // Mời cuốc chở khách cốt truyện (gần mình, không hết hạn, không bỏ qua được). Đang bận thì storyUpdate mời lại sau
  // a.kind: 'ride' (mặc định) = cuốc chở khách hướng dẫn · 'food' = đơn giao đồ ăn ở quán a.place (vd Bún Mọc Cô Yến)
  storyOffer(a = {}) {
    this.storyOfferAt = performance.now();
    if (this.om.order || this.om.state === S.OFFERED) return false;
    const o = a.kind === 'food' ? this.om.storyFood(a.place, this.playerPos, this.clockMin) : this.om.storyRide(this.playerPos, this.clockMin, a.customer || null);
    return this.om.forceOffer(o);
  }
  // Chữ cốt truyện: có bản riêng theo loại xe (khóa + ".gas" / ".electric") thì dùng bản đó; tham số chung: tên, luật tài khoản
  storyText(key) {
    if (!key) return '';
    const p = this.gs.power, k = has(`${key}.${p}`) ? `${key}.${p}` : key;
    return fmt(k, { name: this.gs.profile.name, lockBelow: Number(APP.account.lockBelow).toFixed(1), maxLate: ECONOMY.maxLate ?? 2 });
  }
  // Tham số thoại cốt truyện của người nói who (mã người trong story.json / 'place:<mã>'): tên người chơi
  // + xưng hô theo sơ đồ quan hệ (data/relations.json, công cụ /?relationship). Chưa vẽ dây thì chỉ có tên.
  storyVoice(who) {
    const gs = this.gs;
    return { name: gs.profile.name, ...(voiceOf(who, gs.profile?.gender, chapterNum(gs.story, STORY)) || {}) };
  }
  // Chỗ nạp năng lượng cho xe đang dùng: cây xăng (xe xăng) · trụ sạc (xe điện)
  fuelStop() {
    const kind = this.gs.power === 'electric' ? 'charger' : this.gs.power === 'gas' ? 'gas' : null;
    return kind ? this.nearestPlace((p) => p.kind === kind) : null;
  }
  // Chữ tên chương to giữa màn hình, tự mờ dần (~5 giây). dim: cảnh game phía sau tối hẳn rồi sáng lại cùng lúc
  chapterCard(title, sub, dim = false) {
    for (const id of ['chapterCard', 'chapterDim']) document.getElementById(id)?.remove();
    if (dim) {
      const bg = document.createElement('div');
      bg.id = 'chapterDim';
      document.body.appendChild(bg);
      setTimeout(() => bg.remove(), 5200);
    }
    const el = document.createElement('div');
    el.id = 'chapterCard';
    el.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5200);
  }
  // Mục tiêu trên màn hình của bước đang chạy (mũi tên tới target). Bước "bấm 📍 Chỉ đường": chưa bấm thì chưa có mũi tên
  storyGoal() {
    const st = stepOf(this.gs.story);
    if (!st?.goal || !this.gs.story.fired) return null; // tin nhắn của bước chưa tới → chưa hiện mục tiêu
    const g = { text: this.storyText(st.goal), sub: this.storyText(st.hint), color: '#f4d03f', noBeacon: !!st.noBeacon };
    const rg = st.guide?.type === 'route' ? st.guide : st.guide?.type === 'fuel' ? { place: 'fuel' } : null; // bước phải bấm 📍 Chỉ đường
    if (rg && this.storyRouted(rg)) this.gs.story.ev.routed = true; // đã bấm 📍 → nhớ (tới nơi game xóa chỉ đường)
    if (rg && !this.gs.story.ev.routed) return g;
    let at = null;
    if (st.target === 'bike') at = this.bike.pos;
    else if (st.target === 'fuel') {
      const w = this.waypointPlace();
      at = (w && ['gas', 'charger', 'swap'].includes(w.kind) ? w : this.fuelStop())?.door;
    }
    else if (st.target === 'office') {
      const w = this.waypointPlace();
      at = (w?.kind === 'office' ? w : this.nearestPlace((pl) => pl.kind === 'office'))?.door;
    } else if (st.target?.startsWith('actor:')) at = this.storyActors?.[st.target.slice(6)]?.mesh.position;
    else if (st.target) at = this.layout.placeById[st.target]?.door;
    return at ? { ...g, x: at.x, z: at.z } : g;
  }
  // Đã bấm 📍 Chỉ đường tới đúng chỗ của bước chưa ('office' = văn phòng hãng nào cũng được ·
  // 'fuel' = cây xăng / trụ sạc / trạm đổi pin nào cũng được, xe đã đầy thì coi như xong)
  storyRouted(gd) {
    const w = this.waypointPlace();
    if (gd.place === 'fuel') return ['gas', 'charger', 'swap'].includes(w?.kind) || this.gs.power === 'pedal' || this.gs.fuel >= this.gs.vehicleSpec.tank * 0.9;
    return gd.place === 'office' ? w?.kind === 'office' : this.waypoint === gd.place;
  }
  // Hướng dẫn màn xếp túi lúc nhận đồ theo cốt truyện (interactions.storyPack → this.storyPacking = màn xếp túi)
  packGuide() {
    const node = this.storyPacking;
    if (!node?.isConnected) return null;
    const { items, selected, placed, upright } = node.packState();
    const G = (id, sel, tk, params = {}) => ({ id, sel: [sel], title: fmt(`story.guide.${tk}`, params), hint: fmt(`story.guide.${tk}Hint`, params), top: true });
    const i = items.findIndex((it, k) => placed[k] < 0 || (it.has('liquid') && !upright[k]));
    if (i < 0) return G('pack-done', '.packing [data-act="done"]', 'packDone');
    if (selected !== i || !node.picked?.has(i)) return G(`pack-item-${i}`, `.packing [data-item="${i}"]`, 'packItem', { item: items[i].name });
    if (placed[i] < 0) return G(`pack-cell-${i}`, '.packing .pk-cell:not(.full)', 'packCell');
    return { ...G(`pack-rot-${i}`, '.packing [data-act="rotate"]', 'packRotate'), also: ['.packing .pk-cell.sel'] }; // sáng cả ô món đang xoay trong túi (không khung)
  }

  // Món cần mặc tiếp (bước "wear"): đồng phục hãng → mũ hãng
  storyWearNeed() {
    const gs = this.gs, u = uniformOf(gs.brand);
    if (u && !gs.wearingUniform()) return u;
    const h = brandHelmet(gs.brand);
    return h && gs.wornIds().helmet !== h.id ? h : null;
  }
  // Nút cần làm sáng trên điện thoại cho bước đang chạy → { id, sel, title, hint, app } (Spotlight) · null = không hướng dẫn
  storyGuide() {
    const st = stepOf(this.gs.story), gd = st?.guide, ph = this.phone;
    if (!gd || !this.gs.story.fired) return null;
    const btn = gd.btn ? fmt(gd.btn === 'ok' ? 'story.guide.btnOk' : 'story.guide.btnNext') : null; // nút Tiếp ▸ / Đã rõ (bấm mới sang bước sau)
    const offered = this.om.state === S.OFFERED;
    // làm sáng một phần màn hình (bản đồ tròn, dòng phím, thanh thể lực, màn hình điện thoại…) + bong bóng chữ có nút
    if ((gd.type === 'hud' && gd.part !== 'phone') || gd.type === 'minimap') {
      const part = HUD_PARTS[gd.type === 'minimap' ? 'minimap' : gd.part];
      return part ? { id: `hud-${st.id}`, sel: [part[1]], title: this.storyText(gd.title), hint: this.storyText(gd.hint), btn } : null;
    }
    // máy đang cất: làm sáng hình điện thoại cạnh bản đồ (bấm vào hoặc Tab; mặc đồ / dùng đồ thì I mở thẳng Túi đồ)
    if (!ph.open) {
      if ((gd.type === 'route' || gd.type === 'fuel') && this.gs.story.ev.routed) return null;
      if (gd.type === 'use' && !(this.gs.consumables[gd.goods] > 0)) return null;
      if (gd.type === 'wear' && !this.storyWearNeed()) return null;
      if (gd.type === 'order' && !offered) return null;
      if (!st.goal && gd.type !== 'order' && gd.type !== 'hud') return null;
      const bag = gd.type === 'wear' || gd.type === 'use';
      const title = gd.type === 'order' ? fmt('story.guide.offerIcon') : st.goal ? this.storyText(st.goal) : this.storyText(gd.title);
      return { id: `phone-${st.id}`, sel: ['#phoneIcon'], title, hint: fmt(bag ? 'story.guide.tabBagHint' : 'story.guide.tabHint'), keys: bag ? ['KeyI', 'Tab'] : ['Tab'] };
    }
    // màn hình điện thoại (vd app CSGT vừa tự mở): sáng cả màn hình máy + nút Đã rõ
    if (gd.type === 'hud') return { id: `hud-${st.id}`, sel: [HUD_PARTS.phone[1]], title: this.storyText(gd.title), hint: this.storyText(gd.hint), btn };
    const G = (id, sel, tk, params = {}, app = null) => ({ id, sel: [sel], title: fmt(`story.guide.${tk}`, params), hint: fmt(`story.guide.${tk}Hint`, params), app });
    const back = () => G('back', '.ph-appbar [data-home]', 'back');
    const openApp = (app, tk, params) => (ph.app ? back() : G(`app-${app}`, `.ph-apps button[data-app="${app}"]`, tk, params, app));
    if (gd.type === 'thread' || gd.type === 'reply' || gd.type === 'route') {
      if (gd.type === 'route' && this.storyRouted(gd)) return null;
      if (ph.app !== 'chat') return openApp('chat', 'chatApp');
      if (ph.thread !== gd.who) return ph.thread ? back() : G(`thread-${gd.who}`, `[data-thread="${gd.who}"]`, 'thread', { name: fmt(STORY.contacts[gd.who]?.name || '') });
      if (gd.type === 'thread') return null;
      if (gd.type === 'reply') return G('reply', '.msg-replies', 'reply');
      // chọn hãng: sáng cả tin nhắn có 2 nút 📍 (người chơi tự chọn hãng)
      const offices = this.layout.places.filter((p) => p.kind === 'office').map((p) => `.msg-loc[data-id="${p.id}"]`).join(', ');
      return G('loc', gd.place === 'office' ? `.bub:has(${offices})` : `.msg-loc[data-id="${gd.place}"]`, 'loc');
    }
    if (gd.type === 'use') {
      const g = GOODS[gd.goods];
      if (!g || !(this.gs.consumables[gd.goods] > 0)) return null;
      if (ph.app !== 'bag') return openApp('bag', 'bagApp');
      if (ph.bagSel !== `g:${g.id}`) return G(`cell-${g.id}`, `.bag-grid [data-bag="g:${g.id}"]`, 'bagCell', { item: g.name });
      return G(`use-${g.id}`, '.bag-detail [data-act="bagUse"]', 'bagUse');
    }
    if (gd.type === 'wear') {
      const need = this.storyWearNeed();
      if (!need) return null;
      if (ph.app !== 'bag') return openApp('bag', 'bagApp');
      if (ph.bagSel !== `g:${need.id}`) return G(`cell-${need.id}`, `.bag-grid [data-bag="g:${need.id}"]`, 'bagCell', { item: need.name });
      return G(`wear-${need.id}`, '.bag-detail [data-act="bagWear"]', 'bagWear');
    }
    const jobApp = () => openApp('goship', 'jobApp', { app: this.gs.brandSpec?.name || '' });
    if (gd.type === 'switch') {
      if (ph.app !== 'goship') return jobApp();
      if (ph.profile) return G('back', '.ph-appbar [data-home]', 'back');
      return { id: `sw-${gd.which}`, sel: [`.sw[data-act="${gd.which === 'food' ? 'wantFood' : 'wantRide'}"]`], title: this.storyText(st.goal), hint: this.storyText(st.hint) };
    }
    // app Xe → 📍 Chỉ đường tới cây xăng / trụ sạc gần nhất
    if (gd.type === 'fuel') {
      const stop = this.fuelStop();
      if (!stop || this.storyRouted({ place: 'fuel' })) return null;
      if (ph.app !== 'bike') return openApp('bike', 'bikeApp');
      return G('fuel-route', `.ph-body [data-act="waypoint"][data-id="${stop.id}"]`, 'fuelRoute');
    }
    // có đơn mời: app nhận đơn → nút Nhận
    if (gd.type === 'order') {
      if (!offered) return null;
      if (ph.app !== 'goship') return jobApp();
      if (ph.profile) return G('back', '.ph-appbar [data-home]', 'back');
      return G('accept', '.offer [data-act="accept"]', 'accept');
    }
    // app nhận đơn → 👤 Hồ sơ → sáng cả trang hồ sơ + luật tài khoản, nút Đã rõ
    if (gd.type === 'profile') {
      if (ph.app !== 'goship') return jobApp();
      if (!ph.profile) return G('prof', '.prof-btn', 'profileBtn');
      return { id: 'profile-info', sel: [HUD_PARTS.phone[1]], title: this.storyText(gd.title), hint: this.storyText(gd.hint), btn };
    }
    return null;
  }
}
