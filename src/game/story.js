// =============================================================
// GAME — CỐT TRUYỆN lúc chơi: chạy bước (src/sim/story.js), người lạ, thoại bong bóng, chọn câu, cảnh phim, dí, hướng dẫn
// Phần của lớp Game (src/game.js): các hàm ở đây gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// =============================================================
import * as THREE from 'three';
import { voiceOf, charOfStory, lookOfChar, chapterNum } from '../data/relations.js';
import { ECONOMY, DIST, colorsToNumbers } from '../data/balance.js';
import { GOODS } from '../data/goods.js';
import { APP } from '../data/apps.js';
import { APP_DEFS } from '../data/phoneApps.js';
import { fmtClock } from '../sim/clock.js';
import { routeDist, nodePos, navRoute, neighbors, blockAt } from '../sim/cityLayout.js';
import { ambushPanel } from '../ui/ambush.js';
import { roundDef, roundNb } from '../sim/ambush.js';
import { makeRng } from '../sim/rng.js';
import { uniformOf } from '../sim/GameState.js';
import { S } from '../sim/OrderManager.js';
import { STORY, spotOf, HUD_PARTS, stepOf, chapterOf, storyTick, beginChapter, finishChapter, brandHelmet, storyEvent, actorsPresent, storyPick, REACT_ICONS, inChapter, titleNext, orderGate } from '../sim/story.js';
import { lerpAngle } from '../world/controllers.js';
import { kitGive, kitNew } from '../sim/fight.js';
import { resolveCircle } from '../world/physics.js';
import { makePerson, setSitting, randomPersonOpts, npcLook, sitY, makeBike, animatePerson, bikeSeatZ } from '../world/models.js';
import { jetjetLook, seatRider } from '../world/npcVehicles.js';
import { splitPages } from '../ui/modal.js';
import { makeBouquet } from '../world/storyProps.js';
import { Spotlight } from '../ui/spotlight.js';
import * as act from '../interactions.js';
import { sound, soundPick, loopSound } from '../audio.js';
import { fmt, has, pick } from '../content/index.js';
import { headOf } from '../ui/bubbles.js';
import { parkingLotAt } from '../sim/parking.js';
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
    this.om.hold = (!!st?.hold || inCh) && !st?.orders; // bước chờ tới giờ có "cho chạy đơn" → app phát đơn thường như bình thường
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
    // hết giờ chờ (bước trước cho chạy đơn) mà đang chạy đơn → nhắc giao xong rồi quay lại · đơn mời chưa nhận → bỏ, không tính bỏ đơn
    if (st && !s.fired && !st.orders && orderGate(s)) {
      if (this.om.order && !this.om.order.story) {
        if (performance.now() - (this.storyBusyAt || 0) > 30000) { this.storyBusyAt = performance.now(); this.hud.toast(fmt('toast.storyOrderFirst'), 'warn', 6000); }
      } else if (this.om.state === S.OFFERED) this.om.dismissOffer(this.clockMin);
    }
    // bước có cuốc cốt truyện mà cuốc chưa có (vừa mở lại game / lúc mời đang bận) → mời lại
    const offerAct = st && s.fired && (st.on || []).find((a) => a.do === 'offer');
    if (offerAct && !this.om.order && this.om.state !== S.OFFERED && !s.ev.delivered && performance.now() - (this.storyOfferAt || 0) > 1500) this.storyOffer(offerAct);
    if (!s?.ch || s.step < 0 || this.modal.open) return;
    this.storyLeash(st);
    this.storyKeepOut(st);
    const om = this.om;
    const orderStage = om.state === S.OFFERED ? 'offer' : !om.order ? null : om.state === S.TO_PICKUP || om.state === S.WAITING_FOOD || om.state === S.OUT_OF_STOCK || om.state === S.PACKING ? 'accept' : 'pickup';
    const acts = storyTick(this.gs, dMin, {
      orderStage,
      busy: () => !!om.order && !om.order.story, // đang chạy đơn thường (không phải đơn cốt truyện)
      near: (id, r) => { const sp = spotOf(id), pl = sp ? { door: { x: sp.at[0], z: sp.at[1] } } : this.layout.placeById[id]; return !!pl && dist2(this.playerPos, pl.door) < r; }, // địa điểm hoặc chỗ hẹn theo tọa độ
      mounted: this.mode === 'bike',
      threadOpen: (who) => this.phone.open && this.phone.app === 'chat' && this.phone.thread === who,
      routed: (place) => this.storyRouted({ place }),
      actorNear: (who, r) => { const a = this.storyActors?.[who]; return !a || a.leaving || dist2(this.playerPos, a.mesh.position) < r; }, // người lạ không còn (mở lại game giữa cảnh) → coi như xong
      actorBoarded: (who) => !!this.storyActors?.[who]?.seated, // người lạ đang ngồi sau xe người chơi
      chased: (who) => !!this.storyActors?.[who]?.chase?.done, // tên cướp đã chạy hết lộ trình (người chơi bám theo)
      parkedAt: (place) => this.mode === 'foot' && !!this.gs.parked && this.gs.parked.kind === 'lot' && (!place || parkingLotAt(this.layout.places, this.bike.pos.x, this.bike.pos.z)?.id === place), // đã gửi xe ở bãi (đang đi bộ)
      hiddenAt: (id) => this.storyHiddenAt(id), // đang núp sau thùng rác / xe hàng rong (id: đúng thùng / điểm đánh dấu này)
      // tới chỗ [x, z] (vd giữa cầu) · hoặc nhiều chỗ [[x, z], …] — chạm chỗ nào cũng được (vd 2 lối mạn trái / mạn phải của tàu)
      reachAt: (at, r) => Array.isArray(at) && (Array.isArray(at[0]) ? at : [at]).some((q) => Math.hypot(this.playerPos.x - q[0], this.playerPos.z - q[1]) < r),
      // đi xa người lạ who (hoặc chỗ at) hơn r — người lạ không còn thì coi như xong
      awayFrom: (u, r) => { const p = u.who ? this.storyActors?.[u.who]?.mesh.position : Array.isArray(u.at) ? { x: u.at[0], z: u.at[1] } : null; return !p || Math.hypot(this.playerPos.x - p.x, this.playerPos.z - p.z) > r; },
      now: this.clockMin, // giờ chung (điều kiện "trong khung giờ")
      switchOn: (w) => this.om.state !== S.OFFLINE && !this.gs.flags[w === 'food' ? 'noFood' : 'noRide'] && (w !== 'ride' || this.gs.effect('passengerSeat')),
    });
    if (acts.length) this.runStoryActions(acts);
  }
  // Tâm vùng giữ / chặn: địa điểm (place) · hoặc chỗ đứng trên bản đồ riêng / [x, z] (at — vd giữ người chơi trong khu đang đánh trên tàu)
  storyRegionCenter(L) {
    if (L.at != null) { const p = this.zoneAt(L.at); return p ? { x: p[0], z: p[1] } : null; }
    return this.layout.placeById[L.place]?.door || null;
  }
  // Bước có "leash": chưa xong thì không cho đi xa địa điểm quá r m — giữ người chơi lại ở mép vùng + nhắc (mỗi ~4 giây một lần)
  storyLeash(st) {
    const L = st?.leash, c = L && this.storyRegionCenter(L);
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
  // Bước có "keepOut": chưa xong thì không cho lại gần địa điểm hơn r m (vd chưa gửi xe ở bãi thì không cho tới Kho 7) — đẩy ra mép vùng + nhắc
  storyKeepOut(st) {
    const K = st?.keepOut, c = K && this.storyRegionCenter(K);
    if (!c || !this.gs.story.fired) return;
    const P = this.playerPos, dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz) || 0.01, r = K.r || 30;
    if (d >= r) return;
    P.x = c.x + (dx / d) * r;
    P.z = c.z + (dz / d) * r;
    if (this.mode === 'bike') { this.bike.speed = 0; this.bike.vel.set(0, 0); }
    const now = performance.now();
    if (now - (this.keepOutAt || 0) > 4000) {
      this.keepOutAt = now;
      this.hud.toast(fmt(K.text, { name: this.gs.profile.name }), 'big', 3500);
      sound('ui.warn');
    }
  }
  // Làm các việc của bước (story.json → on)
  runStoryActions(acts) {
    const gs = this.gs, ch = chapterOf(gs.story), name = gs.profile.name;
    for (const a of acts) {
      // "sau … giây" cho mọi việc (tin nhắn nhóm lần lượt…) — đếm theo vòng lặp game như cảnh phim
      if (a.after > 0 && a.do !== 'bubble' && a.do !== 'sound') { this.storyAfter(a.after, () => this.runStoryActions([{ ...a, after: 0 }])); continue; }
      if (a.do === 'title') { this.chapterCard(fmt(ch.title), fmt(ch.name), true); sound('progress.chapter'); } // tự mờ dần sau ~5 giây (bước sau chờ "wait" cho mờ hết)
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
      else if (a.do === 'ttPost') this.storyTtPost(a); // tin Tích Tắc của cốt truyện
      else if (a.do === 'block') this.storyBlock(a.who); // người nhắn chặn người chơi
      else if (a.do === 'ambush') this.storyAmbushOpen(a); // mini game bày trận trên bản đồ
      else if (a.do === 'ambushCrew') this.storyAmbushCrew(a); // anh em shipper đứng ở các chốt đã bày
      else if (a.do === 'approach') { const ac = this.storyActors?.[a.who]; if (ac) Object.assign(ac, { mode: 'approach', run: !!a.run, stop: !!a.stop, circle: null }); }
      else if (a.do === 'goto') this.storyActorGoto(a);
      else if (a.do === 'react') this.storyReact([].concat(a.who || []), a.icon);
      else if (a.do === 'cine') this.storyCineStart(a);
      else if (a.do === 'chase') this.storyChaseSpawn(a);
      else if (a.do === 'prop') this.storyPropSpawn(a); // đạo cụ cảnh phim: xe tải, tấm ván, chó
      else if (a.do === 'ship') this.storyShip(a); // tàu hàng HẢI LONG cập bến / rời bến
      else if (a.do === 'zone') this.storyZone(a); // vào / ra bản đồ riêng (trên tàu), mở cổng / cửa
      else if (a.do === 'phone') this.storyPhoneOff(a); // tịch thu / trả điện thoại
      else if (a.do === 'tie') this.storyTie(a); // trói / thả (ngồi bệt, tay sau lưng)
      else if (a.do === 'untie') this.storyUntie(a); // bấm E liên tục cắt dây
      else if (a.do === 'fpv') { if (a.on !== false) gs.story.fpv = true; else delete gs.story.fpv; this.fpvSet(a.on !== false); } // góc nhìn thứ 1
      else if (a.do === 'fight') this.fightStart(a.id); // trận đánh (story.json → fights)
      else if (a.do === 'race') this.raceStart(a.id); // màn đua thoát thân (story.json → races)
      else if (a.do === 'dismount') this.storyActorDismount(a.who);
      else if (a.do === 'helmetOff') this.storyHelmetOff(a.who);
      else if (a.do === 'helmetOn') this.storyHelmetOn(a.who); // đội nón lại (đang cầm trên tay)
      else if (a.do === 'tackle') this.storyTackleStart(a); // vật ngã người bị đuổi (có nút bấm nhanh E)
      else if (a.do === 'wave') this.storyWave(a.who, a.t);
      else if (a.do === 'rideOff') this.storyActorRideOff(a.who, a); // lên xe của mình chạy đi
      else if (a.do === 'phoneCall') this.storyPhoneCall(a.on !== false); // người chơi đưa điện thoại lên tai / cất
      else if (a.do === 'fade') this.storyFade(a); // màn đen "Ít phút sau…"
      else if (a.do === 'sneak') this.storySneakStart(a); // bám theo lén
      else if (a.do === 'pursue') this.storyPursueStart(a); // bị rượt — người chơi tự chạy thoát
      else if (a.do === 'fail') this.storyFail(a);
      else if (a.do === 'sound' && a.code) { if (a.after > 0) this.storyAfter(a.after, () => sound(a.code)); else sound(a.code); } // after: phát sau … giây (giờ game)
      else if (a.do === 'traffic') this.storyTraffic(a); // giữ vùng vắng xe NPC (cảnh đứng giữa đường lâu) / trả lại
      else if (a.do === 'leave') this.storyActorLeave(a.who, a);
      else if (a.do === 'remove') this.storyActorRemove(a.who);
      else if (a.do === 'board') this.storyActorBoard(a.who);
      else if (a.do === 'alight') this.storyActorAlight(a.who);
      else if (a.do === 'drop') { const ids = [].concat(a.id || []); gs.story.carry = [].concat(gs.story.carry || []).filter((x) => !ids.includes(x)); }
      // tuần tự: đang có câu chờ bấm E → câu mới / bảng chọn câu xếp hàng, người chơi bấm E mới hiện (không đè nhau)
      else if (a.do === 'choose') { if (a.ask) this.storyChooseShow(a); else this.storyEnqueue(() => this.storyChooseShow(a)); }
      else if (a.do === 'bubble') {
        const go = () => this.storyEnqueue(() => this.storyBubble(a.who, a.text, a.hold));
        if (a.after > 0) this.storyAfter(a.after, go); else go(); // after: nói sau … giây (cảnh phim nói lần lượt)
      }
      else if (a.do === 'say') {
        // hội thoại bằng bong bóng trên đầu người nói: người lạ đang có mặt / NPC ở địa điểm của người trong danh bạ (không có thì trên đầu người chơi)
        const who = STORY.people?.[a.who] || STORY.contacts[a.who] || {};
        const mesh = this.storyActors?.[a.who]?.mesh || (who.place && this.npcs[who.place]) || null;
        this.storyConverse({ mesh, name: fmt(who.name || ''), pages: splitPages(fmt(a.text, this.storyVoice(a.who))) });
      } else if (a.do === 'msg') this.storyMessage(a.from, { key: a.text, loc: a.loc, ...(a.as ? { as: a.as } : {}), ...(a.sys ? { sys: true } : {}) }); // nhóm chat: as = tên người gửi · sys = dòng hệ thống (vd "… đã thêm bạn vào nhóm")
      else if (a.do === 'replies') gs.setReplies(a.who, a.texts || [], a.gains);
      else if (a.do === 'item') { if (!gs.story.items.includes(a.id)) gs.story.items.push(a.id); }
      else if (a.do === 'borrow') this.storyBorrow(a);
      else if (a.do === 'kit') this.storyKit(a);
      else if (a.do === 'bike') {
        gs.flags.story = Math.max(1, gs.flags.story ?? 0);
        this.placeAtHomeBike();
        sound('place.gotBike');
        this.hud.toast(fmt('toast.gotBike'), 'big', 6000);
      } else if (a.do === 'give' && GOODS[a.goods]) gs.consumables[a.goods] = (gs.consumables[a.goods] || 0) + 1;
      else if (a.do === 'toast') this.hud.toast(fmt(a.text, { name }), 'big', 6000);
      else if (a.do === 'rename' && a.who && a.name) (gs.story.names ||= {})[a.who] = a.name; // tên hiển thị mới (lưu theo bản lưu, giữ qua các chương)
      else if (a.do === 'pay' && a.amount > 0) { // người quen trả công (chơi nhiều người: máy chủ trả theo bước cốt truyện, mỗi bước 1 lần)
        gs.earn(a.amount, 'story');
        sound('money.earn');
        const who = a.from ? this.speakerOf(a.from)?.name || fmt(STORY.contacts[a.from]?.name || STORY.people?.[a.from]?.name || '') : '';
        this.hud.toast(a.text ? fmt(a.text, { name, k: a.amount, who }) : fmt(who ? 'story.pay' : 'story.payNoName', { k: a.amount, who }), 'good', 6000);
      }
      else if (a.do === 'offer') this.storyOffer(a);
      else if (a.do === 'fuel' && gs.power !== 'pedal') gs.fuel = gs.vehicleSpec.tank * Math.max(0, Math.min(100, a.pct ?? 20)) / 100;
      else if (a.do === 'end') {
        const last = STORY.chapters.at(-1)?.id === ch.id; // hết chương cuối: báo chờ hồi tiếp theo, quay lại chạy đơn bình thường
        if (last) { this.chapterCard(fmt('story.toBeContinued'), fmt('story.toBeContinuedSub')); this.hud.toast(fmt('story.toBeContinuedToast'), 'info', 9000); }
        else this.chapterCard(fmt('story.chapterDone', { title: fmt(ch.title), name: fmt(ch.name) }), '');
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
    if (kind === 'student') { // nam sinh viên: áo thun, quần jean, giày thể thao trắng, đeo balo, tóc ngắn
      const base = randomPersonOpts(rng, 'm', { casual: true });
      return { look: { ...base, gender: 'm', hat: null, face: null, hairStyle: 'short', hair: 0x1b1b1b, shirt: rng.pick([0xf4f4f4, 0x2e86de, 0x34495e, 0x16a085]), sleeves: 'short', shirtStyle: null, shorts: false, pants: 0x2c4a7a, pantsStyle: null, shoe: 0xf2f2f2, shoeStyle: 'sneaker', carry: 'backpack', carryColor: rng.pick([0x1f2d3d, 0x7f1d1d, 0x2d3436]), build: 'thin', age: null } };
    }
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
    if (had && (a.spot === 'xeOm' || a.spot === 'place') && had.def?.spot === a.spot && had.def.place === a.place && !had.leaving) { had.def = a; return; }
    if (had && a.spot === 'at' && had.def?.spot === 'at' && String(had.def.at) === String(a.at) && !had.leaving) { had.def = a; return; } // đã đứng sẵn đúng chỗ (dựng lúc mở game) → giữ nguyên
    this.storyActorRemove(a.who);
    const rng = makeRng([...a.who].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)); // cố định theo người lạ (gặp lại ngày khác vẫn y vậy)
    const { look, dress = null } = this.storyActorLook(a.look, rng, a);
    const mesh = makePerson({ ...look, face: null });
    dress?.(mesh);
    const ac = { mesh, look, dress, mode: 'idle', phase: 0, t: 0, def: a, callT: 0 };
    const spot = a.spot === 'xeOm' ? this.storyActorSpot(a.place) : a.spot === 'place' ? this.storyPlaceSpot(a)
      : a.spot === 'at' && Array.isArray(a.at) ? { x: a.at[0], z: a.at[1], heading: ((a.heading ?? 0) * Math.PI) / 180, at: true } : null; // đứng đúng tọa độ [x, z]
    if (spot) {
      mesh.position.set(spot.x, spot.at ? this.city.elev?.topAt(spot.x, spot.z) ?? 0 : SW_H, spot.z);
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
      const bike = makeBike(0x15171c, 'supersport'); // sport bike đen sọc xanh lá — cùng chiếc anh mô tô chạy ở chương 3
      bike.userData.bagMesh.visible = false;
      // chỗ đứng bên kia đường (dist lớn) thì lòng đường nằm về phía cửa tiệm (-n); đứng ngay trước cửa thì lòng đường ở phía +n
      const toRoad = (a.dist ?? 1.5) > 8 ? -1 : 1;
      bike.position.set(spot.x + spot.nx * 1.7 * toRoad + spot.tx * 1.4, 0.02, spot.z + spot.nz * 1.7 * toRoad + spot.tz * 1.4);
      bike.rotation.y = Math.atan2(spot.tx, spot.tz);
      this.scene.add(bike);
      ac.vehicle = bike;
      ac.street = [spot.tx, spot.tz];
    }
    // đứng đúng tọa độ (spot "at") có xe kèm: xe dựng ở bikeAt [x, z] (bỏ trống = bên phải người 1,6 m), đầu xe theo bikeHeading (độ)
    if (a.vehicle === 'moto' && spot?.at) {
      const bike = makeBike(0x15171c, 'supersport');
      bike.userData.bagMesh.visible = false;
      const bh = ((a.bikeHeading ?? a.heading ?? 0) * Math.PI) / 180;
      const [bx, bz] = Array.isArray(a.bikeAt) ? a.bikeAt : [spot.x + Math.cos(spot.heading) * 1.6, spot.z - Math.sin(spot.heading) * 1.6];
      bike.position.set(bx, (this.city.elev?.topAt(bx, bz) ?? 0) + 0.02, bz);
      bike.rotation.y = bh;
      this.scene.add(bike);
      ac.vehicle = bike;
      ac.street = [Math.sin(bh), Math.cos(bh)];
    }
    this.storyActors[a.who] = ac;
    if (this.gs.story?.tied?.[a.who] != null || a.tied) { if (a.tied && this.gs.story) (this.gs.story.tied ||= {})[a.who] ??= true; this.tieApply(a.who); } // đứng sẵn bị trói
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
    this.storyLater = []; // câu / tiếng hẹn giờ của cảnh cũ bỏ hết
    for (const who of Object.keys(this.storyActors || {})) this.storyActorRemove(who);
    this.storyPropsClear(); // đạo cụ cảnh phim, khói, mốc lộ trình
    this.storyShipShow(true); // tàu hàng đang đậu (lưu trong bản lưu)
    this.untie = null;
    this.fightStop?.(); // trận đánh đang dở: bỏ (chơi lại từ bước bắt đầu trận)
    this.raceStop?.(); // màn đua đang dở: bỏ, trả xe
    this.zoneApply(true); // bản đồ riêng, điện thoại, người bị trói, góc nhìn thứ 1
    this.storyChoiceClose();
    this.storyTalkWith = null;
    this.storyAsk = null;
    this.pendingReply = null;
    this.storyQueue = [];
    this.storyCineStop();
    this.sceneRelease(); // xe NPC đã dọn cho cảnh vật ngã
    this.tackle = null;
    for (const a of Object.values(actorsPresent(this.gs.story))) {
      if (a.do === 'chase') this.storyChaseSpawn(a, true);
      else if (a.spot === 'xeOm' || a.spot === 'place' || a.spot === 'at') this.storyActorSpawn(a);
    }
    // đã xuống xe / tháo nón ở bước trước → đặt ngay dáng cuối (không diễn lại)
    const s1 = this.gs.story, ch1 = s1?.ch && chapterOf(s1);
    for (const st of ch1 ? ch1.steps.slice(0, Math.max(0, s1.step + (s1.fired ? 1 : 0))) : []) {
      for (const a of st.on || []) {
        if (a.do === 'dismount' && this.storyActors?.[a.who]) this.storyActorDismount(a.who);
        if (a.do === 'helmetOff' && this.storyActors?.[a.who]) this.storyHelmetOff(a.who, true);
        if (a.do === 'helmetOn' && this.storyActors?.[a.who]) this.storyHelmetOn(a.who, true);
        if (a.do === 'fade') this.storyFadeClean(a, true); // màn đen đã qua: người / đạo cụ đã dọn (không tua giờ lại)
        if (a.do === 'rideOff') this.storyActorRemove(a.who); // đã chạy đi mất
        if (a.do === 'traffic') this.storyTraffic(a); // vùng vắng xe đang giữ
      }
    }
    // mở lại game giữa cảnh phim → bỏ qua cảnh phim đó
    const s0 = this.gs.story, st0 = s0?.ch ? stepOf(s0) : null;
    if (s0?.fired && (st0?.on || []).some((a) => a.do === 'cine')) storyEvent(s0, 'cineDone');
    // mở lại game lúc đang chờ chọn câu trả lời → hiện lại bảng lựa chọn (kiểu "bấm E mới hiện" thì chờ bấm E)
    const s = this.gs.story, st = s?.ch ? stepOf(s) : null;
    const ch = s?.fired && (st?.on || []).find((a) => a.do === 'choose');
    if (ch && s.picks?.[ch.id] == null) this.storyChooseShow(ch);
    // … lúc đang bám theo lén → làm lại đoạn bám theo từ đầu · đang bị rượt → rượt lại từ chỗ đứng bây giờ
    this.sneak = null;
    this.pursue = null;
    const pu = s?.fired && !s.ev?.escaped && (st?.on || []).find((a) => a.do === 'pursue');
    if (pu) this.storyPursueStart(pu);
    const sn = s?.fired && !s.ev?.sneaked && (st?.on || []).find((a) => a.do === 'sneak');
    if (sn) this.storySneakStart(sn);
    // … lúc đang bày trận → mở lại bản đồ bày chốt
    const am = s?.fired && !s.ev?.ambushed && (st?.on || []).find((a) => a.do === 'ambush');
    if (am) this.storyAmbushOpen(am);
    this.kitCardShow?.('off');
    if (s?.fired && !s.ev?.kitCard && (st?.on || []).some((a) => a.do === 'kit' && a.card)) this.kitCardShow('big'); // đang chờ đọc thẻ túi đồ
    // … lúc đang đánh nhau / lẻn (trận đã bị bỏ ở trên) → dựng lại trận từ đầu · đang đua → đua lại từ đầu (không thì bước kẹt mãi)
    // làm ở CUỐI lúc mở game (storyResumeRun — game.js), sau khi đã đặt xe, chỗ đứng, loại xe (làm sớm thì bị các bước đó ghi đè)
    const fi = s?.fired && !s.ev?.fightWon && (st?.on || []).find((a) => a.do === 'fight');
    const ra = s?.fired && !s.ev?.raceWon && (st?.on || []).find((a) => a.do === 'race');
    // đồng đội đang đi theo (đã đánh chung 1 trận từ lúc xuất hiện — vd anh Đạt trên tàu): mở game thì đứng ngay sau lưng người chơi,
    // không thì bị dựng lại ở chỗ xuất hiện đầu tiên (anh Đạt về lại trong container nhốt)
    const follow = [], spawnAt = {};
    (ch1 ? ch1.steps.slice(0, Math.max(0, s1.step + (s1.fired ? 1 : 0))) : []).forEach((st2, i) => {
      for (const a of st2.on || []) {
        if (a.do === 'actor') spawnAt[a.who] = i;
        if (a.do === 'fight') { const d = STORY.fights?.[a.id]; if (d?.ally && i >= (spawnAt[d.ally] ?? 0) && !follow.includes(d.ally)) follow.push(d.ally); }
      }
    });
    this.storyResume = fi || ra || follow.length ? { fight: fi?.id, race: ra?.id, follow: follow.filter((w) => this.storyActors?.[w]) } : null;
  }
  // Túi đồ shipper (đánh nhau chương 6): give = { mã món: số } cho thêm vào túi · clear = dọn sạch (hết đoạn đánh nhau)
  storyKit(a) {
    const s = this.gs.story;
    if (a.clear) { delete s.kit; this.heldRefresh?.(); return; }
    s.kit = kitGive(s.kit || kitNew(), a.give || {});
    this.heldRefresh?.();
    if (!a.card) sound('fight.bag'); // có thẻ: tiếng kéo dây kéo đã phát lúc lục túi (màn đen 7 giây)
    if (a.card) this.kitCardShow('big'); // thẻ "Trong túi có gì" (bấm E cất)
  }
  storyResumeRun() {
    const r = this.storyResume;
    this.storyResume = null;
    if (r?.follow?.length && this.zone && !r.race) {
      // đồng đội: đặt sau lưng người chơi, cùng tầng (boong / bến) · không có trận thì vẫn đi theo (fightFollow)
      const w = this.walker, h = w.heading, wy = w.mesh.position.y;
      r.follow.forEach((who, i) => {
        const m = this.storyActors[who].mesh, x = w.pos.x - Math.sin(h) * 1.6 + (i ? 0.8 : 0), z = w.pos.z - Math.cos(h) * 1.6;
        m.position.set(x, this.city.elev?.heightAt(x, z, wy, 0) ?? wy, z);
        resolveCircle(m.position, 0.35, this.city.grid, m.position.y);
        this.storyTie?.({ who, on: false });
      });
      if (!r.fight) this.fightFollow?.(r.follow[0]);
    }
    if (r?.fight) { this.gs.story.fpv = true; this.fightStart(r.fight); }
    if (r?.race) this.raceStart(r.race);
  }
  // Người nói: 'player' · mã người lạ · 'place:<mã địa điểm>' (NPC đứng ở địa điểm) → { mesh, name, up (độ cao đỉnh đầu) }
  speakerOf(who) {
    if (who === 'player') return { mesh: this.walker.mesh, name: this.gs.profile.name, up: 2.05 };
    if (String(who).startsWith('place:')) {
      const id = who.slice(6), m = this.npcs[id];
      return m ? { mesh: m, name: this.layout.placeById[id]?.npc?.name || '', up: 1.95 } : null;
    }
    if (String(who).startsWith('prop:')) {
      const p = this.storyProps?.[who.slice(5)], m = p?.cops?.[0]?.mesh; // anh công an bước xuống xe (cops: [{ mesh, … }])
      return m ? { mesh: m, name: fmt(p.def.name || 'story.people.cop'), up: 1.95 } : null;
    }
    const ac = this.storyActors?.[who];
    return ac ? { mesh: ac.seated || ac.mesh, name: fmt(this.gs.story?.names?.[who] || STORY.people?.[who]?.name || ''), up: ac.seated ? 1.6 : 1.95, ac } : null; // tên đổi sau khi tự giới thiệu (việc "rename")
  }
  // Bong bóng kiểu cốt truyện: viền vàng, tên người nói, chữ hiện dần kèm tiếng; hold thì hiện xong có dấu [E] nhấp nháy (giữ tới câu sau)
  // Câu có "[tiếp]" = chia trang: câu giữ chờ E → bấm E qua trang sau · câu tự tắt → trang sau tự hiện khi trang trước tắt
  storyBubble(who, text, hold = false, page = null) {
    const sp = this.speakerOf(who);
    if (!sp || !text) return;
    if (who !== 'player') this.lastSpeaker = who; // camera nhìn theo người đang nói
    let line = page ?? fmt(text, this.storyVoice(who));
    const pages = line.split('[tiếp]').map((p) => p.trim()).filter(Boolean);
    if (pages.length > 1) {
      line = pages[0];
      if (hold) (this.storyQueue ||= []).unshift(...pages.slice(1).map((p) => () => this.storyBubble(who, text, true, p))); // E qua trang sau (trước các câu đang xếp hàng)
      else this.storyAfter(Math.min(9, 3 + line.length * 0.06), () => this.storyBubble(who, text, false, pages.slice(1).join('[tiếp]')));
    }
    this.bubbles.show(`story:${who}`, () => headOf(sp.mesh, sp.up), line, 'story', hold ? Infinity : undefined, { name: sp.name, type: true, wait: hold });
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
    // chỉ khóa đứng yên khi bước đang chờ nói chuyện đúng với người này (bước sau chờ người khác → đi được, không kẹt)
    const on = (u?.type === 'talkActor' && u.who === who) || u?.type === 'chosen' || this.storyWaitE() || !!this.storyChoice;
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
    if (ac?.def?.idle && !this.storyActorPending(who)) {
      const L = [].concat(ac.def.idle);
      ac.idleI = Math.min(L.length - 1, (ac.idleI ?? -1) + 1); // nhiều câu: mỗi lần bấm E một câu, hết thì lặp câu cuối
      this.storyBubble(who, L[ac.idleI]);
    }
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
  // shots: [{ at: 'place:<mã>' | 'actor:<mã>' | 'prop:<mã>' | 'player', t: giây, dist, height, angle (độ, 0 = phía trước mặt / trước cửa), follow, lookY,
  //           eye (góc nhìn thứ nhất) + yaw / yawTo / turn / pitch, lookAt (nhìn theo vật khác), until ("who:mark" — tới mốc thì sang cảnh sau), slow (quay chậm), sound }]
  // ride: xe người chơi tự chạy theo người bị đuổi (rideSpeed, dừng cách rideStop)
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
    this.cine = { shots, i: 0, t: 0, cut: true, look: new THREE.Vector3(), pos: new THREE.Vector3(), def: a, slow: 1, fov0: this.camera.fov };
    // xe người chơi tự chạy theo người bị đuổi (ride) trong lúc chiếu
    if (a.ride && this.mode === 'bike') this.cine.ride = { who: a.ride, speed: a.rideSpeed ?? 10, stop: a.rideStop ?? 12, s: null };
    // người chơi tự chạy bộ theo các điểm (vd bỏ chạy khỏi hẻm); hết cảnh leo lên xe đặt ở bikeAt
    if (Array.isArray(a.playerRun) && a.playerRun.length) {
      if (this.mode === 'bike') act.dismount(this);
      this.cine.run = { pts: a.playerRun.filter((p) => Array.isArray(p)), i: 0, speed: a.runSpeed ?? 5.5, delay: a.runDelay || 0 };
    }
    if (a.clear > 0) this.traffic.holdNear(this.playerPos.x, this.playerPos.z, a.clear); // dọn xe NPC quanh người chơi (khỏi che cảnh quay)
    if (a.clearAll) { this.traffic.holdNear(0, 0, Infinity); this.bgTraffic.held = true; } // tắt HẾT xe thường (xe NPC, xe buýt, xe nền) — chỉ còn xe diễn viên (đạo cụ car / moto)
    document.body.classList.add('cine');
    if (this.phone.open) this.phone.toggle(false);
  }
  storyCineStop() {
    if (!this.cine) return;
    if (this.camera.fov !== this.cine.fov0) { this.camera.fov = this.cine.fov0; this.camera.updateProjectionMatrix(); } // trả góc rộng camera
    this.walker.mesh.visible = true;
    if (this.cine.def?.clear > 0 || this.cine.def?.clearAll) this.traffic.release();
    this.bgTraffic.held = false;
    if (this.cine.bagHidden) this.bike.mesh.userData.bagMesh.visible = true;
    this.cine = null;
    document.body.classList.remove('cine');
  }
  // Vật được nhắm tới: 'player' · 'actor:<mã>' (người chạy bộ / xe / người) · 'place:<mã>' (cửa) · 'prop:<mã>' (đạo cụ) → { T: vị trí, base: hướng }
  cineTarget(at) {
    at = String(at || 'player');
    if (at.startsWith('place:')) {
      const pl = this.layout.placeById[at.slice(6)];
      if (!pl?.door) return null;
      const [nx, nz] = NORMAL[pl.face] || [0, 1];
      return { T: pl.door, base: Math.atan2(nx, nz) }; // hướng từ cửa ra đường
    }
    if (at.startsWith('actor:')) {
      const ac = this.storyActors?.[at.slice(6)];
      const o = ac?.chase?.runner?.mesh || (ac?.vehicle && (ac.mode === 'chase' || ac.rider) ? ac.vehicle : ac?.mesh);
      return o?.parent ? { T: o.position, base: o.rotation.y } : null; // hướng mặt / hướng xe chạy
    }
    if (at.startsWith('prop:')) {
      const p = this.storyProps?.[at.slice(5)];
      return p?.mesh.visible ? { T: p.mesh.position, base: p.mesh.rotation.y } : null;
    }
    const mounted = this.mode === 'bike';
    return { T: mounted ? this.bike.mesh.position : this.walker.mesh.position, base: mounted ? this.bike.mesh.rotation.y : this.walker.mesh.rotation.y };
  }
  // Cảnh quay đang chiếu → chỗ đặt camera + chỗ nhìn (null = mục tiêu không còn → sang cảnh sau)
  // eye: góc nhìn thứ nhất (mắt người chơi) — yaw → yawTo (độ, 0 = nhìn tới, 180 = ngoái ra sau) trong "turn" giây · lookAt: nhìn theo vật khác
  cinePose(shot, t = 0) {
    const look = shot.lookAt ? this.cineTarget(shot.lookAt) : null;
    if (shot.eye) {
      // mắt = đầu nhân vật người chơi (đang chồm trên xe thì theo dáng chồm) — người chơi ẩn đi, nhìn xuống thấy đầu xe, gương
      const b = this.bike.mesh, mounted = this.mode === 'bike', m = mounted ? b : this.walker.mesh;
      const h = m.rotation.y, body = this.walker.mesh.userData.parts?.body;
      const pos = body ? body.localToWorld(new THREE.Vector3(0, 1.6, 0.1)) : new THREE.Vector3(m.position.x, m.position.y + 1.6, m.position.z);
      if (look) return { pos, look: new THREE.Vector3(look.T.x, (look.T.y ?? 0) + 1.0, look.T.z), eye: true };
      const k = (t / Math.max(0.1, shot.turn ?? shot.t)), y0 = shot.yaw ?? 0, y1 = shot.yawTo ?? y0;
      const yaw = h + ((y0 + (y1 - y0) * Math.min(1, k * k * (3 - 2 * Math.min(1, k)))) * Math.PI) / 180, pitch = ((shot.pitch ?? -18) * Math.PI) / 180;
      return { pos, look: pos.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(10)), eye: true };
    }
    if (Array.isArray(shot.pos)) {
      // máy quay đặt cố định ở tọa độ [x, y, z] (y tính từ mặt đất / mặt cầu), nhìn theo lookAt (không có thì nhìn "at")
      const tg = look || this.cineTarget(shot.at);
      if (!tg) return null;
      const [px, py, pz] = shot.pos;
      return { pos: new THREE.Vector3(px, (this.city.elev?.topAt(px, pz) ?? 0) + py, pz), look: new THREE.Vector3(tg.T.x, (tg.T.y ?? 0) + (shot.lookY ?? 1.1), tg.T.z) };
    }
    const tg = this.cineTarget(shot.at);
    if (!tg) return null;
    const { T, base } = tg;
    const ang = base + ((shot.angle ?? 0) * Math.PI) / 180, dist = shot.dist ?? 8, y = T.y ?? 0;
    return {
      pos: new THREE.Vector3(T.x + Math.sin(ang) * dist, y + (shot.height ?? 3), T.z + Math.cos(ang) * dist),
      look: look ? new THREE.Vector3(look.T.x, (look.T.y ?? 0) + (shot.lookY ?? 1.1), look.T.z) : new THREE.Vector3(T.x, y + (shot.lookY ?? 1.1), T.z),
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
        if (c.run) this.cineRunEnd(c.def); // chạy tới chỗ xe → leo lên
        if (c.ride) { this.bike.speed = 0; this.bike.vel?.set(0, 0); this.rig.yaw = this.bike.heading + Math.PI; } // xe tự chạy theo: dừng lại, camera ra sau xe
        this.rig.manualTimer = 0;
        return this.updateCamera(0);
      }
      if (c.cut && shot.sound) sound(shot.sound); // tiếng đi kèm cảnh quay (vd pô xe gầm sau lưng)
      c.slow = shot.slow ?? 1; // quay chậm: diễn viên, đạo cụ, xe người chơi chạy chậm lại (đồng hồ chung vẫn chạy)
      const pose = this.cinePose(shot, c.t);
      // hết giờ cảnh quay · hoặc chờ mốc lộ trình (until "who:mark") đã tới → sang cảnh sau
      if (pose && c.t < shot.t && !(shot.until && this.sceneHas(shot.until))) {
        // cắt cảnh: đặt camera ngay · bám theo / góc nhìn thứ nhất: camera đi theo · đứng yên: giữ chỗ đặt lúc cắt, chỉ xoay nhìn theo
        const k = c.cut || pose.eye ? 1 : 1 - Math.exp(-5 * dt);
        if (c.cut || shot.follow || pose.eye) c.pos.lerp(pose.pos, k);
        c.look.lerp(pose.look, c.cut || (pose.eye && !shot.lookAt) ? 1 : 1 - Math.exp(-8 * dt));
        c.cut = false;
        c.t += dt;
        this.walker.mesh.visible = !pose.eye; // góc nhìn thứ nhất: ẩn người chơi (ngoái lại không bị tóc, vai mình che), vẫn thấy đầu xe
        const bag = this.bike.mesh.userData.bagMesh; // … và thùng giao hàng sau lưng (ngoái lại khỏi bị che)
        if (pose.eye && bag?.visible) { bag.visible = false; c.bagHidden = true; } else if (!pose.eye && c.bagHidden) { bag.visible = true; c.bagHidden = false; }
        const fov = shot.fov ?? (pose.eye ? 78 : c.fov0);
        if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); } // góc nhìn thứ nhất: rộng hơn (thấy tay lái)
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
    const model = a.bike || 'sport';
    const bike = makeBike(a.color ? parseInt(String(a.color).slice(1), 16) : 0xb3261e, model);
    bike.userData.bagMesh.visible = false;
    bike.rotation.order = 'YXZ'; // bốc đầu: ngửa quanh trục ngang của xe
    const rider = seatRider(bike, { ...look, face: null }, model, bikeSeatZ(model));
    if (a.carry === 'bouquet') { const b = makeBouquet(); b.position.set(0, 1.17, -0.66); b.rotation.set(-0.1, Math.PI, 0); bike.add(b); } // bó hoa buộc trên đuôi xe
    this.scene.add(bike);
    const revAt = a.revAt ?? (a.wheelie ? 'start' : 'none');
    // bốc đầu: cùng lúc tiếng nẹt pô — nẹt lúc lướt ngang người chơi thì bốc đầu lúc đó (chaseTick), không thì lúc xuất phát
    const c = { path, len, total: len[len.length - 1], s: 0, v: 0, i: 0, mi: 0, wait: a.delay ?? 1, wheelie: a.wheelie && revAt !== 'pass' ? 2.6 : 0, done: false, heading: null };
    if (a.spawn === 'behind') {
      // xuất hiện sau lưng người chơi (trên lộ trình của mình) back đơn vị, lao tới với tốc độ tối đa
      Object.assign(c, { s: Math.max(0, this.chaseNearS(c, this.playerPos) - (a.back ?? 40)), wait: 0, v: a.speed ?? 20 });
    }
    if (resume) {
      // mở lại game giữa cuộc rượt: đã qua bước chờ chạy hết lộ trình / đã qua cảnh phim của cuộc rượt → đứng ở cuối · không thì chạy trước người chơi một đoạn
      if (this.storyChasePassed(a.who)) Object.assign(c, { s: c.total, done: true });
      else if (a.spawn !== 'behind') {
        const P = this.playerPos;
        let best = 0, bd = Infinity;
        for (let i = 0; i < path.length; i++) { const d = Math.hypot(path[i].x - P.x, path[i].z - P.z); if (d < bd) [bd, best] = [d, i]; }
        c.s = Math.min(c.total, len[best] + (a.gap ?? 30));
      }
      Object.assign(c, { wait: 0, wheelie: 0 });
      while (c.mi < path.length && len[c.mi] <= c.s) c.mi++; // mốc đã qua: không chạy lại
    } else if (revAt === 'start') sound('city.rev'); // nẹt pô lúc xuất phát (mặc định mới: lúc chạy ngang người chơi)
    this.storyActors[a.who] = { mesh: bike, vehicle: bike, rider, look, def: a, mode: 'chase', phase: 0, t: 0, callT: 0, chase: c };
    if (resume && c.done && path.some((p) => p.act === 'crash')) {
      // đã té xe + bị chặn ở cuối cảnh: xe nằm đổ, người đứng ở cuối lộ trình
      const ac = this.storyActors[a.who], end = this.chaseAt(c, c.total);
      rider.parent?.remove(rider);
      ac.rider = null;
      bike.position.set(end.x - Math.sin(end.h) * 6, this.city.elev?.topAt(end.x, end.z) ?? 0, end.z - Math.cos(end.h) * 6);
      bike.rotation.set(0, end.h, 1.45, 'YXZ');
      const mesh = makePerson({ ...look, face: null });
      mesh.position.set(end.x, bike.position.y, end.z);
      mesh.rotation.y = end.h + Math.PI;
      this.scene.add(mesh);
      Object.assign(ac, { mesh, mode: 'idle', chase: null });
      return;
    }
    this.chasePlace(this.storyActors[a.who], 0);
  }
  // Đã qua bước chờ người này chạy hết lộ trình chưa, hoặc đã qua cảnh phim có người này (để mở lại game đặt đúng chỗ: cuối lộ trình)
  storyChasePassed(who) {
    const s = this.gs.story, ch = s?.ch && chapterOf(s);
    if (!ch) return false;
    if (ch.steps.slice(0, Math.max(0, s.step)).some((x) => x.until?.type === 'chased' && x.until.who === who)) return true;
    const passed = ch.steps.slice(0, Math.max(0, s.step + (s.fired ? 1 : 0))); // bước cảnh phim đang làm dở (mở lại game) cũng tính: cảnh phim bị bỏ qua
    // cảnh phim cho xe người chơi chạy theo người này (cine.ride) — hoặc theo người mà người này đuổi (follow) — đã chiếu → cuộc rượt đã xong
    const rides = passed.flatMap((x) => (x.on || []).filter((a) => a.do === 'cine' && a.ride).map((a) => a.ride));
    const def = passed.flatMap((x) => (x.on || []).filter((a) => a.do === 'chase' && a.who === who)).pop();
    return rides.includes(who) || (!!def?.follow && rides.includes(def.follow));
  }
  // Lộ trình → dãy điểm theo tim đường, lệch sang làn bên phải (xe chạy bên phải đường)
  // Điểm: { place } | { node: [cột, hàng] } | { at: [x, z] } (tới / từ điểm "at" thì chạy thẳng, không theo đường)
  // Thêm ở mỗi điểm: lat (lệch ngang, + phải / − trái) · y (cao hơn mặt đường, vd đỉnh tấm ván) · air (bay vọt từ điểm trước tới đây, cao thêm air)
  //                  mark (tên mốc: chạy qua thì ghi "who:mark") · act (drift / crash) · speed (tốc độ lúc chiếu cảnh phim từ đây)
  chasePath(route) {
    const posOf = (r) => (r.place ? this.layout.placeById[r.place]?.door : Array.isArray(r.node) ? nodePos(r.node[0], r.node[1]) : Array.isArray(r.at) ? { x: r.at[0], z: r.at[1] } : null);
    const pts = route.map((r) => { const p = posOf(r); return p ? { p, r } : null; }).filter(Boolean);
    const META = ['lat', 'y', 'air', 'mark', 'act', 'speed', 'sound', 'soundLead'];
    const metaOf = (r) => Object.fromEntries(META.filter((k) => r[k] != null).map((k) => [k, r[k]]));
    const line = [];
    const push = (p) => { const L = line[line.length - 1]; if (!L || Math.hypot(p.x - L.x, p.z - L.z) > 0.5) line.push({ x: p.x, z: p.z }); };
    for (let i = 0; i + 1 < pts.length; i++) {
      const A = pts[i], B = pts[i + 1];
      if (i === 0) { push(A.p); Object.assign(line[line.length - 1], metaOf(A.r)); }
      let leg;
      if (A.r.at || B.r.at) leg = [B.p];
      else {
        leg = navRoute(A.p, B.p);
        if (i > 0) leg = leg.slice(A.p.mouth ? 2 : 1); // điểm giữa lộ trình: chạy ngang qua, không vào cửa
        if (i + 2 < pts.length) leg = leg.slice(0, leg.length - (B.p.mouth ? 2 : 1));
      }
      for (const p of leg) push(p);
      Object.assign(line[line.length - 1], metaOf(B.r)); // thông tin của điểm gắn vào điểm cuối của chặng
    }
    const LANE = 1.8, out = [];
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, rx = -(b.z - a.z) / l, rz = (b.x - a.x) / l;
      const oa = LANE + (a.lat || 0), ob = LANE + (b.lat || 0);
      out.push({ x: a.x + rx * oa, z: a.z + rz * oa, y: a.y || 0, ...(i === 0 ? { mark: a.mark, act: a.act, speed: a.speed, sound: a.sound, soundLead: a.soundLead } : {}) },
        { x: b.x + rx * ob, z: b.z + rz * ob, y: b.y || 0, air: b.air, mark: b.mark, act: b.act, speed: b.speed, sound: b.sound, soundLead: b.soundLead });
    }
    return out;
  }
  chaseTick(who, ac, dt) {
    const c = ac.chase, a = ac.def;
    if (c.crash) return this.chaseCrashTick(who, ac, dt); // té xe → bỏ xe chạy bộ
    if (c.block) return this.chaseBlockTick(who, ac, dt); // vượt lên chặn đầu
    if (c.wait > 0) c.wait -= dt;
    else {
      const mounted = this.mode === 'bike', P = mounted ? this.bike.mesh.position : this.walker.mesh.position, pos = ac.vehicle.position;
      const d = Math.hypot(P.x - pos.x, P.z - pos.z), pv = mounted ? Math.abs(this.bike.speed) : 0;
      const gap = a.gap ?? 30, top = c.cineSpeed ?? a.speed ?? 14;
      // chạy đều bằng pct% tốc độ tối đa của xe người chơi (xe đạp / xe máy đều theo kịp nếu chạy hết ga) — không dừng chờ
      const cruise = Math.max(3, (this.gs.vehicleSpec?.maxSpeed || 12) * (a.pct ?? 85) / 100);
      let want;
      const lead = a.follow && this.storyActors?.[a.follow];
      if (lead) {
        // người đuổi theo (follow): giữ cách người bị đuổi gap đơn vị; người đó té xe → 1 giây sau vượt lên chặn đầu
        const lc = lead.chase, lp = lc?.runner?.mesh.position || lead.vehicle?.position || lead.mesh.position;
        const dl = Math.hypot(lp.x - pos.x, lp.z - pos.z), lv = lc?.runner ? lc.runner.v : lc?.v ?? 0;
        want = Math.max(0, Math.min(top, lv + (dl - gap) * 1.5));
        if (lc?.runner && !c.block && (c.blockIn = (c.blockIn ?? 1) - dt) <= 0) { c.block = { t: 0 }; c.v = Math.max(c.v, 8); }
      } else if (this.cine) want = top; // đang chiếu cảnh phim: chạy thẳng, bỏ xa
      else want = Math.min(Math.max(top, cruise) * 1.6, Math.max(cruise, pv + (gap - d) * 0.5 + (d < gap * 0.5 ? 6 : 0))); // tới gần → rồ ga bỏ xa
      // chết máy giữa nước (act "stall"): khựng lại, nước văng, dừng hẳn, vẫn ngồi trên xe — coi như đã chạy xong
      if (c.stall) {
        want = 0;
        c.stall.t += dt;
        if (c.v > 0.6 && Math.random() < 0.6) this.sceneSmoke(pos.x, pos.y, pos.z, 1, 0x9fc6d6);
        if (c.v < 0.15) { c.v = 0; c.done = true; }
      }
      // tiếng khi chạy tới gần người chơi (vd pô mô tô gầm rồi vụt qua) — mỗi lần xuất hiện phát 1 lần
      if (a.nearSound && !c.nearPlayed && d < (a.nearDist ?? 20)) { c.nearPlayed = true; sound(a.nearSound); }
      // tiếng nẹt pô lúc lướt ngang người chơi (revAt 'pass')
      if ((a.revAt ?? (a.wheelie ? 'start' : 'none')) === 'pass' && !c.revved && d < 12) {
        c.revved = true;
        sound('city.rev');
        if (a.wheelie) c.wheelie = 2.6; // bốc đầu đúng lúc nẹt pô
      }
      // bị bỏ xa quá (lose m trên màn hình) → mất dấu, làm lại từ đầu đoạn dí · gần mốc thì cảnh báo (người đuổi theo / cảnh phim: không)
      const lose = (a.lose ?? 700) / DIST.displayPerUnit;
      if (!this.cine && !a.follow && !c.done && !c.stall && c.s < c.total) {
        if (d > lose) return this.storyChaseLose(who, ac);
        if (d > lose * 0.7 && performance.now() - (c.warnAt || 0) > 5000) { c.warnAt = performance.now(); this.hud.toast(fmt('story.chase.warn'), 'warn', 3000); }
      }
      c.v += Math.max(-10 * dt, Math.min((c.wheelie > 0 ? 16 : 8) * dt, want - c.v)); // bốc đầu: vọt mạnh
      // đã phát sớm tiếng của điểm sắp tới (vd té xe): chỉnh tốc độ cho tới điểm đúng lúc "rầm" trong file (kể cả có quay chậm chen giữa)
      if (c.sync && c.mi <= c.sync.i) {
        const rem = c.len[c.sync.i] - c.s, remT = c.sync.at - (c.rt || 0);
        c.v = Math.max(top * 0.4, Math.min(top * 2.5, remT > 0.03 ? rem / (remT * this.sceneScale()) : top * 2.5));
      }
      if (c.wheelie > 0) c.wheelie = Math.max(0, c.wheelie - dt); // chỉ tính lúc đã chạy (không tính lúc đứng chờ)
      c.s = Math.min(c.total, c.s + c.v * dt);
      this.chaseSounds(c, dt);
      // chạy qua điểm có mốc / hành động / tốc độ mới
      while (c.mi < c.path.length && c.len[c.mi] <= c.s) {
        const p = c.path[c.mi];
        if (p.mark) this.sceneMark(who, p.mark);
        if (p.speed) c.cineSpeed = p.speed;
        if (p.act) this.chaseAct(who, ac, p, c.mi);
        c.mi++;
      }
      if (c.crash) return;
      if (c.s >= c.total) {
        c.v = 0;
        if (!c.done && (d < 60 || a.follow)) c.done = true;
      }
      if (a.dodge && c.v > 2) this.chaseDodge(c, pos, c.heading ?? 0, dt);
      else if (c.lat) c.lat *= Math.exp(-3 * dt);
    }
    this.chasePlace(ac, dt);
    this.chaseEngine(ac);
  }
  // Tiếng gắn ở điểm lộ trình (sound: mã hoặc [mã…], vd té xe + chó): phát SỚM sao cho khoảnh khắc mạnh nhất trong file ("rầm")
  // trùng đúng lúc tới điểm — soundLead (giây trong file) ghi tay, bỏ trống thì tự dò trong file. File chưa tải xong → phát lúc tới điểm.
  chaseSounds(c, dt) {
    c.sq ||= c.path.map((p, i) => (p.sound ? { i, codes: [].concat(p.sound), lead: p.soundLead, done: new Set(), picks: {} } : null)).filter((x) => x && c.len[x.i] > c.s);
    const scale = this.sceneScale(), v = Math.max(0.3, c.v) * scale; // quay chậm: tới điểm lâu hơn (giây thật)
    c.rt = (c.rt || 0) + dt / scale; // đồng hồ thật của người này (dt đã nhân hệ số quay chậm)
    for (const q of c.sq) {
      if (q.done.size === q.codes.length) continue;
      const left = (c.len[q.i] - c.s) / v; // còn bao nhiêu giây thật nữa thì tới điểm
      for (const code of q.codes) {
        if (q.done.has(code)) continue;
        const pick = (q.picks[code] ||= soundPick(code));
        const lead = q.lead ?? pick.onset ?? 0;
        if (left <= lead || left <= 0) {
          q.done.add(code);
          sound(code, { file: pick.file });
          if (lead > 0.05 && left > 0 && (!c.sync || c.sync.i !== q.i || c.sync.at < c.rt + lead)) c.sync = { i: q.i, at: c.rt + lead }; // tới điểm đúng lúc "rầm"
        }
      }
    }
  }
  // Tiếng máy xe của người lạ (chase.loop): to nhỏ theo khoảng cách tới camera, cao độ theo tốc độ
  chaseEngine(ac, on = true) {
    const a = ac.def, c = ac.chase;
    if (!a?.loop) return;
    if (!on || !c || !ac.vehicle?.parent || c.crash || c.stall) return loopSound(a.loop, 0);
    const p = ac.vehicle.position, cam = this.camera.position;
    const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
    const level = Math.max(0, Math.min(1, 1 - (d - 6) / 70)) * (c.v > 0.5 ? 1 : 0.35);
    loopSound(a.loop, level, (0.75 + Math.min(1, c.v / (a.speed || 20)) * 0.75) * Math.sqrt(this.sceneScale()));
  }
  // Đặt xe theo quãng đã chạy c.s trên lộ trình: vị trí (+ lệch ngang né xe), độ cao (lên cầu, lên ván, bay), hướng xe, nghiêng khi cua, drift, bốc đầu
  chasePlace(ac, dt) {
    const c = ac.chase, { path, len } = c;
    while (c.i < path.length - 2 && len[c.i + 1] < c.s) c.i++;
    while (c.i > 0 && len[c.i] > c.s) c.i--;
    const A = path[c.i], B = path[c.i + 1], seg = len[c.i + 1] - len[c.i] || 1, t = Math.max(0, Math.min(1, (c.s - len[c.i]) / seg));
    const want = Math.atan2(B.x - A.x, B.z - A.z);
    const prev = c.heading;
    c.heading = c.heading == null || !dt ? want : lerpAngle(c.heading, want, 1 - Math.exp(-8 * dt));
    const lat = c.lat || 0;
    const x = A.x + (B.x - A.x) * t - Math.cos(c.heading) * lat, z = A.z + (B.z - A.z) * t + Math.sin(c.heading) * lat;
    // cao độ: mặt đường + độ cao điểm (ván) + vòng cung bay (air)
    const air = B.air ? 4 * B.air * t * (1 - t) : 0;
    const yy = (A.y || 0) + ((B.y || 0) - (A.y || 0)) * t + air;
    const slope = ((B.y || 0) - (A.y || 0) + (B.air ? 4 * B.air * (1 - 2 * t) : 0)) / seg;
    if (B.air && t > 0.97 && !c.landed) { c.landed = true; this.sceneSmoke(x, 0, z, 4); sound('drive.bump'); }
    const lift = c.wheelie > 0 ? 0.42 * Math.min(1, c.wheelie / 0.5) : 0; // bốc đầu: ngửa đầu xe, bánh sau vẫn chạm đất
    // drift: đuôi văng ra ngoài khúc cua ~1,2 giây, khói lốp
    let slide = 0;
    if (c.drift) {
      c.drift.t += dt;
      const k = c.drift.t / 1.2;
      slide = c.drift.dir * 0.75 * Math.sin(Math.min(1, k) * Math.PI);
      if (k < 1 && dt) this.sceneSmoke(x - Math.sin(c.heading) * 0.8, 0, z - Math.cos(c.heading) * 0.8, 1);
      if (k >= 1) c.drift = null;
    }
    // nghiêng xe khi cua (theo tốc độ đổi hướng)
    const turn = prev == null || !dt ? 0 : Math.atan2(Math.sin(c.heading - prev), Math.cos(c.heading - prev)) / dt;
    c.lean = (c.lean || 0) + (Math.max(-0.5, Math.min(0.5, -turn * 0.18)) - (c.lean || 0)) * (1 - Math.exp(-6 * (dt || 1)));
    const bike = ac.vehicle;
    bike.position.set(x, (this.city.elev?.topAt(x, z) ?? 0) + yy + Math.sin(lift) * 0.7, z);
    bike.rotation.set(-lift - Math.atan(slope) * (B.air || B.y || A.y ? 1 : 0), c.heading + slide, c.lean, 'YXZ');
  }

  // a.onFoot: bỏ xe lại chạy bộ (vd xe chết máy giữa nước) — xe thành đạo cụ "leftBike_<mã>" nằm lại chỗ cũ
  storyActorLeave(who, a = {}) {
    const ac = this.storyActors?.[who];
    if (!ac) return;
    this.bubbles.remove(`story:${who}`); // nói xong rồi mới đi
    if (a.onFoot && ac.vehicle) {
      if (ac.rider) this.storyActorDismount(who);
      const id = `leftBike_${who}`;
      this.storyProps ||= {};
      this.storyProps[id] = { mesh: ac.vehicle, def: { id, kind: 'bigbike' }, route: [], i: 0, v: 0, wait: 0, on: true, done: true, t: 0 };
      ac.vehicle = null;
    }
    // có xe đi kèm: đội nón full-face, lên xe, chạy dọc đường rồi biến mất
    if (ac.vehicle) {
      this.scene.remove(ac.mesh);
      const model = ac.vehicle.userData.model || 'sport';
      ac.rider = seatRider(ac.vehicle, this.storyHelmetLook(ac, { hat: 'helmet', helmetStyle: 'full', hatColor: 0x111111 }), model, bikeSeatZ(model));
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
  // Mượn xe cốt truyện (story.json → borrow): xe dựng sẵn (đạo cụ from) thành xe mình đang chạy, đúng chỗ đó; xe của mình để trong hầm nhà trọ.
  // off: trả xe mượn → xe của mình ở trong hầm nhà trọ (người chơi đi bộ / xe buýt về lấy)
  storyBorrow(a) {
    const gs = this.gs, b = this.bike;
    if (this.mode === 'bike') act.dismount(this);
    if (a.off) {
      if (!gs.returnVehicle()) return;
      b.setSpec(gs.vehicleSpec);
      this.placeAtHomeBike();
      sound('place.takeVehicle');
      this.hud.toast(fmt('toast.borrowBack', { name: gs.vehicleSpec.name }), 'info', 6000);
      return;
    }
    const pr = a.from && this.storyProps?.[a.from], at = pr?.mesh.position || b.pos, h = pr ? pr.mesh.rotation.y : b.heading;
    if (!gs.borrowVehicle(a.vehicle, a.fuel ?? 60)) return;
    b.setSpec(gs.vehicleSpec);
    b.pos.set(at.x, 0, at.z);
    b.heading = h;
    b.speed = 0;
    b.vel?.set(0, 0);
    b.mesh.position.set(at.x, 0, at.z);
    b.mesh.rotation.set(0, h, 0);
    if (pr) this.storyPropRemove(a.from);
    this.startParking(true);
    sound('place.gotBike');
    this.hud.toast(fmt('toast.borrowGot', { name: gs.vehicleSpec.name }), 'big', 6000);
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
    this.chaseEngine(ac, false); // tắt tiếng máy xe của người này
    this.scene.remove(ac.mesh);
    ac.seated?.parent?.remove(ac.seated);
    if (ac.vehicle) this.scene.remove(ac.vehicle);
    this.bubbles.remove(`story:${who}`);
    delete this.storyActors[who];
    if (this.lastSpeaker === who) this.lastSpeaker = null;
  }
  // Mỗi khung hình: đi tới chỗ người chơi, đứng nhìn người chơi / người cùng nói chuyện (def.faceTo), chạy đi, lên xe đi mất, theo người chơi lên xe
  // ---------- 📱 TIN TÍCH TẮC CỦA CỐT TRUYỆN (việc "ttPost") ----------
  // a: { id, who (người lạ — tên tác giả), author (khóa chữ, tên tài khoản), caption, music, overlay (khóa chữ), photo: { actor } | { at: [x, z], look: [x, z] },
  //      likes, comments: [khóa chữ] } — lưu trong tiến độ (gs.story.tt) để mở lại game vẫn còn; nằm đầu danh sách app
  storyTtPost(a) {
    const s = this.gs.story;
    s.tt ||= [];
    if (!s.tt.some((x) => x.id === a.id)) s.tt.push({ ...a });
    this.feedCache = null; // làm lại danh sách tin ngay
    // chụp sẵn ảnh ngay lúc đăng (người lạ / xe còn đứng đó) → người lạ đi đâu sau đó ảnh vẫn còn (lưu cùng bản lưu)
    // chụp hụt (cửa sổ game đang thu nhỏ…) → thử lại mỗi giây, trong lúc người lạ còn đứng đó
    const tries = (n) => this.storyAfter(n === 30 ? 0.4 : 1, () => {
      if (!a.photo || s.ttShots?.[a.id]) return;
      const cv = this.snapPhoto({ media: { at: { story: a.photo } } });
      if (cv) { try { (s.ttShots ||= {})[a.id] = cv.toDataURL('image/jpeg', 0.8); } catch { /* bỏ qua */ } }
      else if (n > 0 && (!a.photo.actor || this.storyActors?.[a.photo.actor])) tries(n - 1);
    });
    tries(30);
  }
  // Tin Tích Tắc cốt truyện → dạng tin của app (sim/feed.js). Người đã chặn mình thì tin của họ biến mất
  storyTtFeed() {
    const s = this.gs.story, blocked = (id) => !!this.gs.inbox.threads[id]?.blocked;
    return (s?.tt || []).filter((a) => !blocked(a.who)).map((a) => ({
      id: `story:${a.id}`, story: a.id, hot: false, key: 'story',
      author: `@${fmt(a.author || 'story.tt.author')}`, caption: a.caption ? fmt(a.caption) : '', music: a.music ? fmt(a.music) : '', overlay: a.overlay ? fmt(a.overlay) : '',
      media: { type: 'photo', what: 'story', at: { story: a.photo || null } },
      likes: a.likes ?? 1200, comments: (a.comments || []).length * 37 + 12, cmts: a.comments || [],
    }));
  }
  // Ảnh tin cốt truyện: máy ảnh chĩa vào người lạ (xe đang đi kèm) hoặc nhìn từ chỗ at về chỗ look
  storyTtShot(ph) {
    if (ph?.actor) {
      const ac = this.storyActors?.[ph.actor], o = ac?.vehicle || ac?.mesh;
      if (!o?.parent) return null;
      const h = o.rotation.y + Math.PI / 2.6, d = ph.dist ?? 3.6, p = o.position;
      return { eye: new THREE.Vector3(p.x + Math.sin(h) * d, p.y + (ph.height ?? 1.2), p.z + Math.cos(h) * d), look: new THREE.Vector3(p.x, p.y + 0.9, p.z) };
    }
    if (Array.isArray(ph?.at) && Array.isArray(ph?.look)) return { eye: new THREE.Vector3(ph.at[0], ph.height ?? 1.6, ph.at[1]), look: new THREE.Vector3(ph.look[0], 1, ph.look[1]) };
    return null;
  }
  // Người chơi lướt tới tin cốt truyện (app gọi lại) → ghi nhớ (điều kiện "ttSeen")
  storyTtSeen(post) {
    if (!post?.story) return;
    const s = this.gs.story;
    if (!s) return;
    s.ttSeen ||= [];
    if (!s.ttSeen.includes(post.story)) s.ttSeen.push(post.story);
    storyEvent(s, `tt:${post.story}`);
  }
  // ---------- 🗺️ BÀY TRẬN (việc "ambush"): mở bản đồ nhỏ, đặt chốt — đúng thì nhớ chỗ chốt (gs.story.ambush) cho cảnh vây sau ----------
  storyAmbushOpen(a) {
    const s = this.gs.story;
    if (s.ev.ambushed || this.modal.open) return;
    // nhiều màn vẽ tự do (rounds): thắng màn này mới sang màn sau, nhớ màn đang chơi (mở lại game chơi tiếp màn đó)
    if (a.rounds?.length) {
      const i = Math.min(s.ambushRound || 0, a.rounds.length - 1), R = a.rounds[i];
      const node = ambushPanel({ def: roundDef(R), nb: roundNb(R), round: { i, n: a.rounds.length }, onWin: () => {
        this.modal.hide();
        if (i < a.rounds.length - 1) { s.ambushRound = i + 1; sound('ui.next'); this.storyAmbushOpen(a); return; }
        delete s.ambushRound;
        s.ambush = { rounds: a.rounds.length };
        storyEvent(s, 'ambushed');
      } });
      this.modal.show({ title: fmt(a.title || 'amb.title'), node, wide: true, dismissible: false });
      return;
    }
    const node = ambushPanel({ def: a, nb: (i, j) => neighbors(i, j), onWin: (blocks) => {
      s.ambush = { blocks, fixed: a.fixed || [] };
      storyEvent(s, 'ambushed');
      this.modal.hide();
    } });
    this.modal.show({ title: fmt(a.title || 'amb.title'), node, wide: true, dismissible: false });
  }
  // Anh em shipper đứng chốt (cảnh vây đêm): mỗi chốt per chiếc xe, đầu xe quay vào giữa khu; id đạo cụ "crew<k>"
  // a.nodes: các ngã tư thật đứng chốt (cố định trong dữ liệu — bày trận vẽ tự do không dính bản đồ thật) · không có → theo chốt người chơi đã đặt
  storyAmbushCrew(a) {
    const s = this.gs.story, A = s.ambush;
    const nodes = a.nodes?.length ? a.nodes : A ? [...(A.fixed || []), ...(A.blocks || [])] : [], per = Math.max(1, a.per ?? 2);
    if (!nodes.length) return;
    const cx = nodes.reduce((t, n) => t + nodePos(...n).x, 0) / nodes.length, cz = nodes.reduce((t, n) => t + nodePos(...n).z, 0) / nodes.length;
    nodes.forEach((n, k) => {
      const p = nodePos(...n), h = Math.atan2(cx - p.x, cz - p.z);
      for (let q = 0; q < per; q++) {
        const side = (q - (per - 1) / 2) * 1.6; // xếp hàng ngang chắn ngã tư
        const x = p.x + Math.cos(h) * side, z = p.z - Math.sin(h) * side;
        this.storyPropSpawn({ id: `crew${k}_${q}`, kind: 'moto', at: [x, z], heading: (h * 180) / Math.PI, color: a.color });
      }
    });
  }
  // ⛔ Người nhắn chặn người chơi: cuộc trò chuyện còn đó nhưng không gửi được nữa (không có câu trả lời nhanh), tin Tích Tắc của họ biến mất
  storyBlock(who) {
    const gs = this.gs, t = (gs.inbox.threads[who] ||= { msgs: [], unread: 0 });
    t.blocked = true;
    t.replies = [];
    this.feedCache = null;
    sound('phone.blocked');
    this.renderPhone?.();
  }
  // Làm fn sau sec giây — đếm theo vòng lặp game (cùng nhịp cảnh phim: dừng game / ẩn tab thì cũng dừng), không dùng setTimeout
  storyAfter(sec, fn) {
    (this.storyLater ||= []).push({ t: sec, fn });
  }
  storyActorsTick(dt) {
    if (this.storyLater?.length) {
      const due = [];
      this.storyLater = this.storyLater.filter((x) => ((x.t -= dt) > 0 ? true : (due.push(x.fn), false)));
      for (const fn of due) fn();
    }
    this.reactsTick(dt);
    this.tackleTick(dt); // vật ngã (việc "tackle"): người vật + người bị vật do phần cảnh phim điều khiển
    this.sneakTick(dt); // bám theo lén (việc "sneak")
    this.pursueTick(dt); // bị rượt (việc "pursue")
    if (this.cine?.run) this.cinePlayerRun(dt); // cảnh phim: người chơi tự chạy bộ
    this.storyPropsTick(dt * this.sceneScale()); // đạo cụ cảnh phim (xe tải, chó…) + khói lốp
    this.storyShipTick(dt); // tàu hàng đang rời bến
    // câu đáp lại câu người chơi vừa chọn (người lạ / NPC địa điểm)
    // câu đang giữ đã tắt (vd đi xa) mà còn câu xếp hàng → hiện câu kế
    if (this.storyQueue?.length && !this.storyHeldId() && !this.pendingReply) this.storyQueue.shift()();
    for (const [who, ac] of Object.entries(this.storyActors || {})) {
      if (ac.seated || ac.tied) continue; // đang ngồi sau xe người chơi: đi theo xe · bị trói ngồi bệt
      if (ac.mode === 'chase') { this.chaseTick(who, ac, dt * this.sceneScale()); continue; } // tên cướp chạy xe theo lộ trình (quay chậm: chạy chậm lại)
      if (ac.mode === 'tackled' || ac.mode === 'tackler' || ac.mode === 'sneak' || ac.mode === 'pursue') continue; // đang vật / bị ghì (tackleTick) · đang bị bám theo (sneakTick)
      if (ac.mode === 'rideoff') { if (ac.helmet) this.helmetTick(ac, dt); this.rideOffTick(who, ac, dt); continue; } // đội nón, lên xe chạy đi
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
      // độ cao theo mặt đất / mặt cầu ngay dưới chân người lạ (không theo người chơi: người chơi chạy lên cầu thì người đứng dưới gầm không bị nhấc lên)
      // đứng yên → giữ chỗ đứng · đi lại → bám mặt gần độ cao hiện tại (lên dốc cầu dần dần), không có mặt cao → vỉa hè / lòng đường
      if (speed) m.y = this.city.elev?.heightAt(m.x, m.z, m.y, 0.3) ?? (blockAt(m.x, m.z) ? SW_H : 0);
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
      if (ac.helmet) this.helmetTick(ac, dt); // đang tháo nón / cầm nón trên tay
      if (ac.wave) this.waveTick(ac, dt); // vẫy tay chào
      if (ac.mode === 'leave' && (ac.t += dt) > 5) this.storyActorRemove(who);
    }
  }

  // Mời cuốc chở khách cốt truyện (gần mình, không hết hạn, không bỏ qua được). Đang bận thì storyUpdate mời lại sau
  // a.kind: 'ride' (mặc định) = cuốc chở khách hướng dẫn · 'food' = đơn giao đồ ăn ở quán a.place (vd Bún Mọc Cô Yến)
  storyOffer(a = {}) {
    this.storyOfferAt = performance.now();
    if (this.om.order || this.om.state === S.OFFERED) return false;
    const o = a.kind === 'food' ? this.om.storyFood(a.place, this.playerPos, this.clockMin, { to: a.to || null, customer: a.customer ? fmt(a.customer) : null })
      : a.kind === 'parcel' ? this.om.storyParcel({ place: a.place, item: a.item, customer: a.customer ? fmt(a.customer) : null, to: a.to || null, strict: !!a.strict }, this.playerPos, this.clockMin)
      : this.om.storyRide(this.playerPos, this.clockMin, a.customer || null);
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
    let at = null, dest = '';
    if (st.target === 'bike') { at = this.bike.pos; dest = this.gs.vehicleSpec?.name || ''; }
    else if (st.target === 'fuel') {
      const w = this.waypointPlace(), pl = w && ['gas', 'charger', 'swap'].includes(w.kind) ? w : this.fuelStop();
      at = pl?.door; dest = pl?.name || '';
    }
    else if (st.target === 'office') {
      const w = this.waypointPlace(), pl = w?.kind === 'office' ? w : this.nearestPlace((p) => p.kind === 'office');
      at = pl?.door; dest = pl?.name || '';
    } else if (st.target?.startsWith('spot:')) { const sp = spotOf(st.target); if (sp) { at = { x: sp.at[0], z: sp.at[1] }; dest = fmt(sp.name); } } // chỗ hẹn theo tọa độ
    else if (st.target?.startsWith('prop:')) { const pr = this.storyProps?.[st.target.slice(5)]; at = pr?.mesh.position; dest = pr ? fmt(`story.propName.${pr.def.kind}`) : ''; } // đạo cụ (vd thùng rác để núp)
    else if (st.target?.startsWith('actor:')) { const who = st.target.slice(6); at = this.storyActors?.[who]?.mesh.position; dest = fmt(STORY.people?.[who]?.name || ''); }
    else if (st.target) { const pl = this.layout.placeById[st.target]; at = pl?.door; dest = pl?.name || ''; }
    // thanh "Đi đến …" giữa trên (chỉ khi cốt truyện chỉ đường): chữ riêng của bước (goTo) hoặc mẫu chung goal.goTo
    const nav = st.goTo ? this.storyText(st.goTo) : fmt('goal.goTo', { place: dest });
    return at ? { ...g, x: at.x, z: at.z, storyNav: nav } : g;
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
    if (!node?.isConnected || !node.guided) return null; // bước không bật "Hướng dẫn xếp túi" → không khung vàng
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
    if (gd.type === 'app') { // mở app … (vd Tích Tắc lướt tin)
      if (ph.app === gd.app) return null;
      return openApp(gd.app, 'appOpen', { app: fmt(APP_DEFS[gd.app]?.key || gd.app) });
    }
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
