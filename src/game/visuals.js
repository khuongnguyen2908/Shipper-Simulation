// =============================================================
// GAME — HIỂN THỊ: camera, người tạm (khách, CSGT), biển trạm xe buýt / bãi giữ xe, điện thoại, ngoại hình, cập nhật HUD mỗi khung hình
// Phần của lớp Game (src/game.js): các hàm ở đây gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// =============================================================
import * as THREE from 'three';
import { VEHICLES, PARKING, ORDER } from '../data/balance.js';
import { inGarage, parkSlots } from '../sim/garage.js';
import { tierLabel } from '../sim/roads.js';
import { outfitLook } from '../data/goods.js';
import { lookOf } from '../data/looks.js';
import { unlocked } from '../sim/placeRules.js';
import { tod } from '../sim/clock.js';
import { roadPos, districtAtPoint } from '../sim/cityLayout.js';
import { fmtDist } from '../sim/nav.js';
import { makeRng } from '../sim/rng.js';
import { S } from '../sim/OrderManager.js';
import { floodBand, floodSpeedCap } from '../sim/flood.js';
import { objectives } from '../sim/objectives.js';
import { STORY, stepOf, chapterOf } from '../sim/story.js';
import { lerpAngle } from '../world/controllers.js';
import { makePerson, makeZoneRing, setSitting, pedalPerson, randomPersonOpts, sitY, makeBike, applyPose } from '../world/models.js';
import { riderStyle, suitcaseOnBike } from '../world/npcStyles.js';
import { personOf, profileLook } from '../sim/people.js';
import { makeLabelTexture } from '../world/textures.js';
import { roundMapData } from '../roundMap.js';
import { sound } from '../audio.js';
import { fmt, has } from '../content/index.js';
import { fmtK } from '../sim/economy.js';
import { GARAGE_CAM, SW_H, TALK_CAM_GROUP, TALK_CAM, fmtTime, dist2 } from './shared.js';

export class VisualsPart {
  // ======================== HIỂN THỊ ========================
  updateCamera(dt) {
    if (this.cine) return this.cineTick(dt); // đang chiếu cảnh phim cốt truyện: camera theo cảnh quay
    // độ nhạy chuột + đảo trục dọc (màn hình Cài đặt)
    const k = this.settings.sens, ky = k * (this.settings.invertY ? -1 : 1);
    const locked = !!this.storyTalkActor(); // đang nói chuyện (cốt truyện): khóa camera ở góc nhìn 2 người, không xoay / phóng
    if (!locked && (this.input.drag.dx || this.input.drag.dy)) this.rig.drag(this.input.drag.dx * k, this.input.drag.dy * ky);
    // chuột (khi khóa con trỏ): xoay tự do; ngưng di chuột ~2 giây thì camera tự quay về sau xe
    if (!locked && (this.input.look.dx || this.input.look.dy)) this.rig.drag(this.input.look.dx * 0.6 * k, this.input.look.dy * 0.6 * ky);
    if (!locked && this.input.wheel) this.rig.zoom(this.input.wheel);
    if (locked) this.rig.manualTimer = 0; // vừa xoay trước lúc bắt chuyện → camera về ngay góc nói chuyện
    const mounted = this.mode === 'bike';
    const focus = mounted ? this.bike.mesh.position : this.walker.mesh.position;
    // trong hầm xe: camera kéo gần + hạ thấp để không xuyên trần (sàn lầu 1)
    const inG = inGarage(this.layout.placeById.home, focus.x, focus.z, 0);
    const talk = !mounted && this.storyTalkActor();
    if (talk) {
      // nói chuyện với người lạ: camera xích lại, nhìn chéo qua vai người chơi, giữa khung là 2 người (không khóa điều khiển, không dừng giờ)
      // cả nhóm đang nói chuyện: người nói + người đứng cùng (def.faceTo, vd chị Linh với người đàn ông) → canh giữa cả nhóm
      const mates = [talk.mesh.position];
      const mateId = talk.ac?.def?.faceTo || Object.entries(this.storyActors || {}).find(([, x]) => x !== talk.ac && x.def?.faceTo && this.speakerOf(x.def.faceTo)?.mesh === talk.mesh)?.[0];
      const mate = mateId && this.storyActors?.[mateId];
      if (mate && !mate.leaving && mate.mesh.parent) mates.push(mate.mesh.position);
      this.talkGroup = mates.length;
      const m = { x: mates.reduce((a, p) => a + p.x, 0) / mates.length, z: mates.reduce((a, p) => a + p.z, 0) / mates.length };
      const lx = m.x - focus.x, lz = m.z - focus.z, l = Math.hypot(lx, lz) || 1;
      const ux = lx / l, uz = lz / l;
      const side = Math.sin(this.rig.yaw) * -uz + Math.cos(this.rig.yaw) * ux >= 0 ? 1 : -1; // giữ bên camera đang đứng (không vòng qua)
      const want = Math.atan2(-ux * 0.8 - uz * side * 0.6, -uz * 0.8 + ux * side * 0.6);
      if (this.rig.manualTimer <= 0) this.rig.yaw = lerpAngle(this.rig.yaw, want, 1 - Math.exp(-2.5 * dt));
      this.talkFocus = (this.talkFocus || new THREE.Vector3()).set((focus.x + m.x) / 2, focus.y, (focus.z + m.z) / 2);
    }
    // đứng yên quá 0,6 giây → camera né cả cột điện / biển / cây (đang chạy thì chỉ né nhà, khỏi giật camera liên tục)
    const moving = mounted ? Math.abs(this.bike.speed) > 0.5 : this.walker.mesh.position.distanceTo(this.lastFocus || focus) > 0.01;
    this.lastFocus = (this.lastFocus || new THREE.Vector3()).copy(focus);
    this.stillT = moving ? 0 : (this.stillT || 0) + dt;
    // đang nói chuyện: chỉ né nhà (né cây / cột lúc này kéo camera sát quá, mất khung cả nhóm) · nhóm 3 người → lùi xa hơn
    this.rig.update(dt, talk ? this.talkFocus : focus, mounted && Math.abs(this.bike.speed) > 1 ? this.bike.heading : null, this.city.grid, inG ? GARAGE_CAM : talk ? (this.talkGroup > 1 ? TALK_CAM_GROUP : TALK_CAM) : null, !talk && this.stillT > 0.6);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2);
    }
  }

  clearTempNpcs() {
    for (const k of ['customerMesh', 'passengerMesh', 'passengerCargo']) {
      const m = this[k];
      if (m) m.parent && m.parent.remove(m);
      this[k] = null;
    }
    this.customerFor = null;
    this.passengerStyle = null;
  }
  // Khách xe ôm theo loại khách (world/npcStyles.js riderStyle): quần áo + đồ đi kèm + tư thế; ride = đang ngồi sau xe
  makePassenger(o, ride) {
    const rng = makeRng(o.id * 31), who = personOf(o.customer);
    const st = (this.passengerStyle ??= { s: riderStyle(o.rider, who, makeRng(o.id * 17)) }).s;
    const look = { ...randomPersonOpts(rng, who.gender, { sitting: true, casual: !st?.look }), ...(st?.look || {}), hat: 'helmet', hatColor: 0xffffff };
    // đặt xe dùm cho cụ già / em bé: tóc bạc, dáng nhỏ
    if (who.age === 'elder') look.hair = 0xc8c8c8;
    else if (look.hair === 0x8d8d8d && (who.age === 'kid' || who.age === 'young')) look.hair = 0x1b1b1b; // người trẻ không tóc bạc
    if (/^Bé\s/.test(o.customer)) look.scale = 0.72;
    const m = makePerson(look);
    st?.dress?.(m, ride);
    return m;
  }

  // Khách đứng chờ ở cửa / khách xe ôm ngồi sau xe
  updateTempNpcs() {
    const { om } = this;
    const o = om.order;
    if (!o) {
      if (this.customerMesh || this.passengerMesh) this.clearTempNpcs();
      return;
    }
    const pp = this.playerPos;
    const rng = makeRng(o.id * 31);
    if (o.kind === 'ride') {
      if (!this.passengerMesh) {
        this.passengerMesh = this.makePassenger(o, false);
        this.scene.add(this.passengerMesh);
      }
      let m = this.passengerMesh;
      const st = this.passengerStyle?.s;
      if (om.state === S.TO_PICKUP) {
        if (m.parent !== this.scene) this.scene.add(m);
        m.position.set(o.pickup.door.x, SW_H, o.pickup.door.z);
        m.rotation.y = Math.atan2(pp.x - m.position.x, pp.z - m.position.z);
        if (st?.wave !== false) m.userData.parts.armR.rotation.x = Math.abs(Math.sin(performance.now() / 300)) * -2.5; // vẫy tay
      } else if (m.parent !== this.bike.mesh) {
        // lên xe: dựng lại khách ở dáng ngồi (bỏ đồ cầm tay: vali, chai bia, cặp…); vali đặt lên xe
        if (st) {
          m.parent?.remove(m);
          m = this.passengerMesh = this.makePassenger(o, true);
          if (st.suitcase && !this.passengerCargo) this.passengerCargo = suitcaseOnBike(this.bike.mesh, this.gs.vehicleSpec.model, st.suitcase);
        }
        this.bike.mesh.add(m);
        setSitting(m, true);
        // khách ôm hờ eo người lái: tay đưa ra trước vừa phải, gập khuỷu
        for (const s of ['L', 'R']) {
          m.userData.parts['arm' + s].rotation.x = -0.55;
          m.userData.parts['elbow' + s].rotation.x = -0.9;
        }
        m.position.set(0, sitY(m.scale.x, 1.02), -0.62);
        m.rotation.set(0, 0, 0);
        this.bike.mesh.userData.bagMesh.visible = false;
      }
      // tư thế riêng (khách say lắc lư, khách vội xem đồng hồ…): tính lại mỗi khung hình
      if (m.userData.parts.pose) {
        m.userData.parts.body.position.y = 0;
        applyPose(m.userData.parts);
      }
      return;
    }
    if ([S.DELIVERING, S.AT_DROPOFF, S.NO_ANSWER, S.STAIRS].includes(om.state) && o.revealed) {
      const key = `${o.id}:${o.dropoff.door.x}`;
      const near = dist2(pp, o.dropoff.door) < 45;
      const hideCustomer = o.flags.noAnswer && !o.noAnswerResolved; // khách vắng nhà
      if (near && !hideCustomer && this.customerFor !== key && !o.dropoff.apartment) {
        this.clearTempNpcs();
        const m = makePerson(randomPersonOpts(rng, personOf(o.customer).gender, { casual: true }));
        m.position.set(o.dropoff.door.x, SW_H, o.dropoff.door.z);
        this.scene.add(m);
        this.customerMesh = m;
        this.customerFor = key;
      }
      if (this.customerMesh) this.customerMesh.rotation.y = Math.atan2(pp.x - this.customerMesh.position.x, pp.z - this.customerMesh.position.z);
    }
  }

  // Phím I: mở điện thoại vào app Túi đồ (đang mở đúng app đó thì cất máy)
  // ======================== BIỂN TRẠM XE BUÝT ========================
  // Tới gần trạm (≤ 25 m): biển "🚏 Trạm xe buýt" nổi trên trạm · đứng trong tầm bấm E (đi bộ, 3 m): biển xanh
  // "Bấm E · Đi xe buýt" + vòng xanh dưới chân · đang ngồi xe: "Xuống xe để đi xe buýt" (tầm như interactions.js)
  updateBusSigns() {
    const stops = this.bus?.stops || [];
    if (!stops.length) return;
    if (!this.busSigns) {
      const tex = (k, bg) => makeLabelTexture(fmt(k), bg);
      this.busSignTex = { near: tex('busSign.near'), press: tex('busSign.press', 'rgba(0,140,60,0.92)'), bike: tex('busSign.bike', 'rgba(160,105,20,0.92)') };
      this.busSigns = stops.map((st) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.busSignTex.near, depthWrite: false, transparent: true }));
        s.scale.set(3.6, 0.68, 1);
        s.position.set(st.wait.x, 3.2, st.wait.z);
        s.visible = false;
        this.scene.add(s);
        return s;
      });
      this.busRing = makeZoneRing(0x2ecc71);
      this.busRing.visible = false;
      this.scene.add(this.busRing);
    }
    const p = this.playerPos, foot = this.mode === 'foot';
    const eStop = this.prompts?.find((x) => x.key === 'E')?.busStop; // phím E lúc này đúng là "đi xe buýt" ở trạm nào
    let ring = null;
    stops.forEach((st, i) => {
      const s = this.busSigns[i], d = Math.hypot(st.wait.x - p.x, st.wait.z - p.z);
      s.visible = this.state === 'play' && !this.ferryRide && d < 25;
      if (!s.visible) return;
      const near = eStop === st.id;
      const t = near ? (foot ? this.busSignTex.press : this.busSignTex.bike) : this.busSignTex.near;
      if (s.material.map !== t) {
        s.material.map = t;
        s.material.needsUpdate = true;
      }
      if (near && foot) ring = st.wait;
      s.material.opacity = this.labelFade(s.position, 5, 4); // camera sát / biển chắn trước người chơi → mờ
    });
    this.busRing.visible = !!ring;
    if (ring) {
      this.busRing.position.set(ring.x, 0.2, ring.z);
      this.busRing.scale.setScalar(3); // đúng tầm bấm E
    }
  }

  // ======================== BIỂN BÃI GIỮ XE ========================
  // Tới gần bãi giữ xe (≤ 30 m): biển "🅿️ Bãi giữ xe · 5k" nổi trên cổng · trong tầm bấm E: biển xanh "Bấm E · Xem bảng giữ xe"
  updateParkSigns() {
    if (!this.parkSigns) {
      const tex = (k, bg) => makeLabelTexture(fmt(k, { fee: PARKING.fee ?? 5 }), bg);
      this.parkSignTex = { near: tex('parkSign.near', 'rgba(31,97,141,0.92)'), press: tex('parkSign.press', 'rgba(0,140,60,0.92)') };
      this.parkSigns = this.layout.places.filter((pl) => pl.kind === 'scenery' && pl.door && lookOf(pl) === 'parkingLot').map((pl) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.parkSignTex.near, depthWrite: false, transparent: true }));
        s.scale.set(3.6, 0.68, 1);
        s.position.set(pl.door.x, 3.6, pl.door.z);
        s.visible = false;
        this.scene.add(s);
        return { s, pl };
      });
    }
    const p = this.playerPos;
    const eLot = this.prompts?.find((x) => x.key === 'E')?.parkLot; // phím E lúc này đúng là "xem bảng" ở bãi nào
    for (const { s, pl } of this.parkSigns) {
      s.visible = this.state === 'play' && !this.ferryRide && Math.hypot(pl.door.x - p.x, pl.door.z - p.z) < 30;
      if (!s.visible) continue;
      const t = eLot === pl.id ? this.parkSignTex.press : this.parkSignTex.near;
      if (s.material.map !== t) {
        s.material.map = t;
        s.material.needsUpdate = true;
      }
    }
  }

  // Đang mở popup nào đó (Esc dùng để đóng popup, không tạm dừng game)
  popupOpen() {
    return !!(this.modal?.open || this.phone?.open || this.chatBox?.typing || this.cheatOpen);
  }
  // Lần Esc vừa bấm (trong 0,5 giây) là để đóng popup
  escForPopup() {
    return performance.now() - (this.escPopupAt || 0) < 500;
  }

  // Tab / bấm hình điện thoại cạnh bản đồ: bật / cất máy. Có đơn đang mời mà máy đang ở màn hình chính → vào thẳng app nhận đơn
  togglePhone() {
    if (this.state !== 'play' || this.paused || this.modal.open || this.screens.open) return;
    const opening = !this.phone.open;
    if (opening && this.om.state === S.OFFERED) this.phone.openApp('goship');
    this.phone.toggle();
    sound(this.phone.open ? 'phone.open' : 'phone.close');
  }

  toggleBag() {
    if (this.phone.open && this.phone.app === 'bag') return this.phone.toggle(false);
    this.phone.openApp('bag');
    if (!this.phone.open) this.phone.toggle(true);
  }

  // Ngoại hình shipper: trang phục đang mặc (phụ kiện: áo mưa / áo khoác người chơi tự gắn trong túi đồ)
  applyLook() {
    const look = { ...outfitLook(this.gs.wornGoods()), ...profileLook(this.gs.profile) }; // dáng, kiểu tóc, màu tóc, màu da theo hồ sơ
    const key = JSON.stringify(look);
    if (key === this.lookKey) return;
    this.lookKey = key;
    this.walker.setLook(look);
  }

  // Xe để dành dựng trong hầm nhà trọ (mọi xe đang có trừ xe đang dùng) — chỉ dựng lại khi danh sách đổi
  syncGarage() {
    const home = this.layout.placeById.home, slots = parkSlots(home);
    const ids = this.gs.parkedVehicles.slice(0, slots.length), key = ids.join(',');
    if (key === this.garageKey) return;
    this.garageKey = key;
    if (this.garageFleet) this.scene.remove(this.garageFleet);
    this.garageFleet = new THREE.Group();
    ids.forEach((id, i) => {
      const v = VEHICLES[id], m = makeBike(v.color, v.model || 'underbone'), s = slots[i];
      if (m.userData.bagMesh) m.userData.bagMesh.visible = false; // túi đồ đi theo xe đang dùng
      m.position.set(s.x, 0, s.z);
      m.rotation.y = s.heading;
      this.garageFleet.add(m);
    });
    this.scene.add(this.garageFleet);
  }

  // Tiếng theo chuyển động: bước chân / đạp xe theo quãng đi, phanh gấp, xe vừa cạn xăng / pin
  moveSounds() {
    const gs = this.gs, p = this.playerPos, mounted = this.mode === 'bike';
    const last = this.soundPos || p, d = Math.hypot(p.x - last.x, p.z - last.z);
    this.soundPos = { x: p.x, z: p.z };
    if (d < 3) { // nhảy chỗ (ngủ, đi xe buýt, phà…) thì không tính
      this.strideM = (this.strideM || 0) + d;
      const stride = mounted ? (gs.power === 'pedal' ? 2.2 : Infinity) : this.input.state.run ? 1.1 : 0.8;
      if (this.strideM >= stride) {
        this.strideM = 0;
        sound(mounted ? 'drive.pedal' : 'walk.step');
      }
    }
    const brake = mounted && this.input.state.brake && Math.abs(this.bike.speed) > 6;
    if (brake && !this.braking) sound('drive.brake');
    this.braking = brake;
    const has = gs.power === 'pedal' || gs.fuel > 0;
    if (mounted && this.hadFuel && !has) sound('drive.noFuel');
    this.hadFuel = has;
    // hướng dẫn sang bước mới (chỗ sáng đổi chỗ)
    const tut = this.spotlight.step;
    if (tut && tut !== this.lastTut) sound('ui.tutorial');
    this.lastTut = tut;
  }

  updateVisuals(dt) {
    const { gs, om, hz } = this;
    const now = this.clockMin;
    this.syncGarage();
    this.moveSounds();
    this.chatBox.update();
    this.bubbles.update(dt);
    this.pedChatter(dt);
    this.updateBusSigns();
    this.updateParkSigns();
    this.city.parked?.update(this.playerPos.x, this.playerPos.z); // xe máy đậu: hiện các ô gần người chơi
    this.stallPeople?.update(dt, this.playerPos.x, this.playerPos.z, this.walker.seat); // khách ngồi quán cóc quanh người chơi
    const rain = hz.rainAt(now);
    const pp = this.playerPos;
    this.applyLook();
    const { night, wet } = this.sky.update(dt, tod(now), rain, pp, this.camera);
    this.nightLevel = night; // bản đồ tròn tối lại ban đêm
    this.city.update?.(dt, this.traffic.loopCars); // barie sân bay nâng khi ô tô tới
    // xe buýt chạy theo lịch; bị chắn trước đầu thì đứng chờ, chắn lâu thì bóp còi
    for (const e of this.traffic.updateBuses(now, pp.x, pp.z, dt)) {
      if (e.type === 'busHonk') { sound('city.honk'); this.toastOnce('busHonk', fmt('toast.busHonk'), 'warn', 8); }
      if (e.type === 'driverYell') this.driverYell(e);
    }
    this.city.setNight(night);
    this.city.setWet(wet);
    this.city.setFlood(hz.floodState(now)); // nước trên các đoạn đường đang ngập
    this.traffic.setFlood(hz.floodedSegs(now).filter((s) => floodBand(s.depth) >= 2).map((s) => s.id)); // xe NPC né đoạn ngập sâu
    this.bike.setNight(night, this.mode === 'bike');
    this.npcs.minh.visible = gs.flags.wallet === 4;
    // tiệm chưa tới chương mở cửa (places.json → openChapter): NPC không đứng ở cửa (vd chị Linh ở Tiệm Trà A Di Đà tới hết chương 2)
    const prog = gs.progress;
    const away = this.storyNpcAway();
    for (const [id, n] of Object.entries(this.npcs)) { const pl = this.layout.placeById[id]; if (pl) n.visible = unlocked(pl, prog) && !away.has(id); }
    // mở đầu: chấm than nhún trên đầu Cô Hai tới khi nói chuyện; xe đạp chỉ hiện khi Cô Hai đã cho
    // dấu trên đầu NPC: cốt truyện → theo bước (story.json → mark), không theo cốt truyện → "!" ở Cô Hai lúc mở đầu
    const sst = gs.story?.ch ? stepOf(gs.story) : null, prev = sst && !gs.story.fired ? chapterOf(gs.story).steps[gs.story.step - 1] : null;
    const mk = gs.story?.ch ? (prev ? prev.mark : sst?.mark) : gs.flags.story === 0 ? { place: 'home', icon: '!' } : null;
    // một hoặc nhiều dấu (story.json → mark: { … } hoặc [{ … }, …]): dấu đầu dùng questMark, các dấu sau dùng thêm sprite
    const marks = [].concat(mk || []);
    this.extraMarks ||= [];
    while (this.extraMarks.length < marks.length - 1) this.extraMarks.push(new THREE.Sprite(new THREE.SpriteMaterial({ map: this.questTex['!'], depthWrite: false, transparent: true })));
    const talkingMesh = this.talk?.mesh || (this.storyTalkWith && this.speakerOf(this.storyTalkWith)?.mesh); // đang nói chuyện với người này → ẩn dấu
    [this.questMark, ...this.extraMarks].forEach((sprite, i) => {
      const k = marks[i];
      const host = k && (k.actor ? this.storyActors?.[k.actor]?.seated || this.storyActors?.[k.actor]?.mesh : this.npcs[k.place]);
      sprite.visible = !!host && talkingMesh !== host; // đang nói chuyện với chính người đó → tạm ẩn dấu
      if (!sprite.visible) return;
      if (sprite.parent !== host) host.add(sprite);
      sprite.scale.set(0.75, 0.75, 1);
      const tex = this.questTex[k.icon] || this.questTex['!'];
      if (sprite.material.map !== tex) { sprite.material.map = tex; sprite.material.needsUpdate = true; }
      // người lạ đang nói (bong bóng trên đầu) → nhấc dấu lên trên bong bóng cho khỏi bị che
      let y = 2.75;
      sprite.material.depthTest = !k.actor; // dấu của người lạ: luôn vẽ đè (đứng dưới mái che vẫn thấy)
      sprite.renderOrder = k.actor ? 10 : 0;
      const bub = this.bubbles.map.get(`story:${k.actor || `place:${k.place}`}`);
      if (bub && bub.el.style.display !== 'none') {
        const perPx = (2 * host.position.distanceTo(this.camera.position) * Math.tan((this.camera.fov * Math.PI) / 360)) / innerHeight; // mét / điểm ảnh ở chỗ người nói
        y = Math.max(y, 1.95 + (bub.el.offsetHeight + 4) * perPx + 0.3);
      }
      if (k.icon === 'dot') { // chấm đỏ mục tiêu: không nhún, nhấp nháy + phập phồng
        const t = performance.now() / 1000, pulse = 0.5 + 0.5 * Math.sin(t * 7);
        sprite.material.opacity = 0.35 + 0.65 * pulse;
        sprite.scale.setScalar(0.62 + 0.16 * pulse);
        sprite.position.y = y;
      } else {
        sprite.material.opacity = 1;
        sprite.position.y = y + Math.abs(Math.sin(performance.now() / 260 + i)) * 0.28;
      }
    });
    // vòng tròn tím quanh địa điểm (story.json → zone): vùng tìm kiếm, không có mũi tên
    const zn = gs.story?.ch && gs.story.fired && sst?.zone && this.layout.placeById[sst.zone.place];
    if (zn && !this.storyZone) { this.storyZone = makeZoneRing(); this.scene.add(this.storyZone); }
    if (this.storyZone) {
      this.storyZone.visible = !!zn;
      if (zn) {
        const r = sst.zone.r || Math.hypot(zn.x1 - zn.x0, zn.z1 - zn.z0) / 2 + 8;
        this.storyZone.position.set(zn.cx ?? zn.door.x, 0.3, zn.cz ?? zn.door.z);
        this.storyZone.scale.setScalar(r);
      }
    }
    this.bike.mesh.visible = true; // xe đạp dựng sẵn trong hầm từ đầu (leo lên được sau khi Cô Hai cho — bikeReady)
    // bảng tên NPC mờ dần khi camera sát lại (dưới ~6 m), nằm giữa camera và người chơi thì mờ hẳn — khỏi che màn hình
    for (const n of Object.values(this.npcs)) {
      const l = n.userData.label;
      const talking = this.bubbles.map.has(`story:place:${n.userData.placeId}`) || this.storyTalkWith === `place:${n.userData.placeId}` || this.talk?.mesh === n;
      if (l) l.material.opacity = talking ? 0 : this.labelFade(n.position, 3, 3); // đang nói chuyện với NPC này → ẩn bảng tên
    }
    const storyRider = Object.values(this.storyActors || {}).some((ac) => ac.seated); // người lạ ngồi sau (cốt truyện): túi giao hàng tạm ẩn
    if (!storyRider && !(this.om.order && this.om.order.kind === 'ride' && this.passengerMesh && this.passengerMesh.parent === this.bike.mesh)) this.bike.showBag(true);
    // xe đạp: chân đạp vòng theo tốc độ (đứng yên thì ngồi bình thường)
    if (this.mode === 'bike' && this.gs.power === 'pedal' && this.walker.mesh.userData.parts) {
      const v = Math.abs(this.bike.speed);
      this.pedalPhase = (this.pedalPhase || 0) + dt * v * 2.2;
      pedalPerson(this.walker.mesh, this.pedalPhase, Math.min(1, v / 1.5));
    }
    this.updateTempNpcs();

    // có biên bản phạt nguội mới → chấm đỏ + thông báo ở app CSGT
    if (this.fineSeen != null && gs.fines.length > this.fineSeen) {
      const f = gs.fines[gs.fines.length - 1];
      this.phone.notify('police', { title: fmt('csgt.newTitle'), text: fmt('csgt.newText', { k: f.amount }) });
    }
    this.fineSeen = gs.fines.length;
    // tới địa điểm đã chọn chỉ đường → bỏ chỉ đường
    const wp = this.waypointPlace();
    if (wp && dist2(pp, wp.door) < 5) {
      this.waypoint = null;
      this.hud.toast(fmt('toast.waypointArrived', { place: wp.name }), 'good', 3000);
    }
    // điểm đến
    const tgt = this.state === 'play' ? this.currentTarget() : null;
    const hasPos = tgt && tgt.x != null;
    this.beacon.visible = !!hasPos && !tgt.zone && !tgt.noBeacon; // bước có noBeacon (vd đuổi tên cướp): chỉ mũi tên, không cột sáng
    this.zoneRing.visible = !!(tgt && tgt.zone);
    if (hasPos) {
      this.beacon.position.set(tgt.x, 0, tgt.z);
      // đứng gần thì cột sáng mờ đi để không che tầm nhìn
      this.beacon.userData.m.opacity = Math.max(0.04, Math.min(0.28, (dist2(pp, tgt) - 3) / 40));
      const c = new THREE.Color(tgt.color || '#f39c12');
      this.beacon.userData.m.color.copy(c);
      this.beacon.userData.ringM.color.copy(c);
      this.beacon.userData.ring.scale.setScalar(1 + 0.15 * Math.sin(performance.now() / 250));
    }
    if (tgt && tgt.zone) {
      this.zoneRing.position.set(tgt.zone.x, 0.25, tgt.zone.z);
      this.zoneRing.scale.setScalar(tgt.zone.r);
    }
    let goal = null;
    if (tgt) {
      goal = { text: tgt.text, sub: tgt.sub, color: tgt.color };
      if (hasPos) {
        const d = dist2(pp, tgt);
        const fx = -Math.sin(this.rig.yaw), fz = -Math.cos(this.rig.yaw);
        const tx = (tgt.x - pp.x) / (d || 1), tz = (tgt.z - pp.z) / (d || 1);
        goal.angle = Math.atan2(tx * -fz + tz * fx, tx * fx + tz * fz);
        goal.sub = fmt('goal.distance', { dist: fmtDist(this.goalRouteDist(pp, tgt, d)), hint: goal.sub || '' });
      }
    }

    const mounted = this.mode === 'bike';
    const o = om.order;
    const cargo = om.hasCargo ? o.items.map((it) => ({ icon: it.icon, name: it.name, status: it.statusText(), cond: it.condition })) : null;
    const left = o ? Math.round(o.allowedMin - (now - o.acceptedAt)) : 0;
    const objs = objectives(gs);
    const firstOpen = objs.find((x) => !x.done && !x.optional);
    // mục tiêu vừa xong (đã tick, hoặc biến khỏi danh sách vì xong — vd đổ xăng xong đổi sang "giao đơn đầu tiên") → tiếng
    const open = new Set(objs.filter((x) => !x.done).map((x) => x.id));
    if (this.objOpen && this.objDay === gs.day && [...this.objOpen].some((id) => !open.has(id))) sound('progress.objective');
    this.objOpen = open;
    this.objDay = gs.day;
    const amb = hz.ambient(now);
    const weather = (rain ? (rain.heavy ? '⛈️' : '🌦️') : hz.isHarshSun(now) ? '☀️🔥' : night > 0.5 ? '🌙' : '⛅') + (hz.floodedSegs(now).length ? '🌊' : '');
    // khu phố đang đứng (map.json → districts); đổi khu phố thì báo
    const dist = districtAtPoint(this.playerPos.x, this.playerPos.z);
    if (dist && dist.id !== this.lastDistrict) {
      if (this.lastDistrict !== undefined) this.hud.toast(fmt('toast.enterDistrict', { name: dist.name }), 'info', 2500);
      this.lastDistrict = dist.id;
    }
    this.hud.update({
      time: fmtTime(now),
      day: gs.day,
      district: [dist?.name, fmt('hud.road', { road: tierLabel(this.roadTier || 'normal'), limit: this.speedLimitKmh() }), mounted && gs.noHelmet ? fmt('hud.noHelmet') : ''].filter(Boolean).join(' · '),
      weather: `${weather} ${amb}°C`,
      money: gs.money,
      rating: gs.brand ? gs.rating : null, // chưa vào hãng: chưa có điểm đánh giá
      phys: gs.phys,
      mental: gs.mental,
      fuel: gs.fuel,
      tank: gs.vehicleSpec.tank,
      power: gs.power,
      hp: gs.bikeHp,
      // bảng "Mục tiêu hôm nay": không lặp mục tiêu cốt truyện (đã ở dòng mục tiêu góc trái), không ghi mục trả tiền nhà (chủ game bỏ)
      objectives: objs.filter((x) => x.id !== 'story' && x.id !== 'rent').map((x) => ({ ...x, current: x === firstOpen })),
      goal,
      prompts: this.prompts || [],
      speedo: mounted
        ? fmt('hud.speed', { kmh: Math.round(Math.abs(this.bike.speed) * 3.6) }) + (Math.abs(this.bike.speed) > this.speedLimit() ? fmt('hud.overSpeed', { limit: this.speedLimitKmh() }) : '') + (this.inJam ? fmt('hud.inJam') : '') + (this.floodBandNow ? fmt('hud.flood', { kmh: Math.round(floodSpeedCap(this.floodHere()) * 3.6) }) : '') + (this.stalled ? fmt('hud.stalled') : '') + (gs.power !== 'pedal' && gs.fuel <= 0 ? fmt(gs.power === 'electric' ? 'hud.noBattery' : 'hud.noFuel') : '')
        : fmt('hud.walking'),
      cargo,
      timeLeft: left >= 0 ? fmt('hud.minutes', { min: left }) : fmt('hud.late', { min: -left }),
      vignette: Math.max(0, (25 - Math.min(gs.phys, gs.mental)) / 25) * 0.8,
      round: roundMapData(this, tgt, dt), // bản đồ tròn góc màn hình
    });
    if (this.phone.open || this.om.state === S.OFFERED) this.renderPhone(tgt);
    this.updatePhoneIcon();
    this.spotlight.update(this.modal.open ? this.packGuide() : this.tutorialStep());
  }

  // Hình điện thoại cạnh bản đồ: đơn đang mời (đổ chuông, lặp lại tiếng mỗi 3 giây) · tin chưa đọc (chấm đỏ) · yên
  updatePhoneIcon() {
    const gs = this.gs, om = this.om, ph = this.phone;
    const offer = om.state === S.OFFERED ? om.offer : null;
    if (offer && !ph.open && performance.now() - (this.ringAt || 0) > 3000) {
      this.ringAt = performance.now();
      sound('phone.offer');
    }
    const unread = gs.unreadMessages + (ph.unread.police || 0);
    // còn tin chưa đọc mà máy đang cất → hình điện thoại nhỏ rung lại mỗi ~4 giây (vừa cất máy thì rung ngay, chỉ rung hình, không kêu) tới khi đọc
    if (ph.open) this.msgBuzzAt = 0;
    else if (!offer && unread && performance.now() - (this.msgBuzzAt || 0) > 4000) {
      this.msgBuzzAt = performance.now();
      this.hud.buzzPhone();
    }
    let from = '';
    if (!offer && unread) {
      const th = gs.inbox.threads, ids = Object.keys(th).filter((id) => th[id].unread).sort((a, b) => (th[b].last ?? 0) - (th[a].last ?? 0));
      const id = ids[0];
      from = id ? (STORY.contacts[id] ? fmt(STORY.contacts[id].name) : th[id].name || id) : fmt('phone.appPolice');
    }
    this.hud.phoneIcon({
      hidden: ph.open,
      st: offer ? (offer.forced ? 'story' : 'offer') : unread ? 'msg' : 'idle',
      time: fmtTime(this.clockMin),
      unread,
      from,
      kind: offer?.kind,
      pay: offer ? '~' + fmtK(offer.estPay) : '',
      left: offer && !offer.forced ? om.offerTimeLeft / ORDER.offerTimeoutSec : null,
    });
  }

  mapData(tgt) {
    const gs = this.gs;
    const places = this.layout.places
      .filter((p) => !p.hidden || (p.id === 'taphoa' && (gs.flags.wallet >= 2 || gs.flags.wallet === -1)) || (p.id === 'gate' && gs.flags.wallet >= 3))
      .map((p) => (unlocked(p, gs.progress) ? p : { ...p, soon: true })); // chưa tới chương mở cửa → biểu tượng mờ
    const police = this.hz.activePolice(this.clockMin).filter((p) => this.knownPolice.has(p.id)).map((p) => ({ x: roadPos(p.node[0]), z: roadPos(p.node[1]) }));
    const pp = this.playerPos;
    return {
      player: { x: pp.x, z: pp.z, heading: this.mode === 'bike' ? this.bike.heading : this.walker.heading },
      bus: this.bus, // tuyến + trạm xe buýt
      planFor: this.mode === 'foot' && this.bikeAtPolice() ? (pl) => this.planText(pl) : null, // xe đang ở đồn: gợi ý đi xe buýt
      bike: this.mode === 'foot' && this.bikeReady() ? { x: this.bike.pos.x, z: this.bike.pos.z } : null,
      quest: this.gs.flags.story === 0 ? this.layout.placeById.home?.door : null, // ❗ chỗ Cô Hai trên bản đồ
      places,
      alleyBlocks: this.layout.alleyBlocks,
      target: tgt && tgt.x != null && !tgt.zone ? { x: tgt.x, z: tgt.z, color: tgt.color } : null,
      zone: tgt && tgt.zone,
      police,
      jams: this.hz.activeJams(this.clockMin),
      floods: this.hz.floodedSegs(this.clockMin), // đoạn đang ngập (tô xanh, đậm theo mực nước)
      raining: this.hz.isRaining(this.clockMin),
    };
  }
}
