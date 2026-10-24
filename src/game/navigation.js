// =============================================================
// GAME — MỤC TIÊU & CHỈ ĐƯỜNG: chỗ đã bấm 📍, xe buýt, mục tiêu trên màn hình (currentTarget)
// Phần của lớp Game (src/game.js): các hàm ở đây gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// =============================================================
import { busHint, busPlan, inService } from '../sim/bus.js';
import { APP } from '../data/apps.js';
import { inHours } from '../sim/hours.js';
import { routeDist } from '../sim/cityLayout.js';
import { fmtDist } from '../sim/nav.js';
import { S } from '../sim/OrderManager.js';
import { objectives } from '../sim/objectives.js';
import * as act from '../interactions.js';
import { fmt } from '../content/index.js';
import { routeShort, dist2 } from './shared.js';
import { spotOf } from '../sim/story.js';

export class NavigationPart {
  // ======================== MỤC TIÊU / CHỈ ĐƯỜNG ========================
  // Chỗ đã bấm "Chỉ đường": mã địa điểm, hoặc 'stop:<mã trạm>' (trạm xe buýt) → { id, name, door, kind } | null
  waypointPlace() {
    const w = this.waypoint;
    if (!w) return null;
    const sp = spotOf(w); // chỗ hẹn theo tọa độ (cốt truyện)
    if (sp) return { id: w, name: fmt(sp.name), door: { x: sp.at[0], z: sp.at[1] }, kind: 'spot' };
    if (w.startsWith('stop:')) {
      const st = this.bus?.byId?.[w.slice(5)];
      return st ? { id: w, name: st.name, door: st.wait, kind: 'busStop' } : null;
    }
    return this.layout.placeById[w] || null;
  }
  // Xe đang bị giữ ở đồn công an → không có xe để chạy
  bikeAtPolice() {
    const t = this.gs.towed;
    return !!t && this.layout.placeById[t.placeId]?.kind === 'police';
  }
  // Kế hoạch đi xe buýt từ chỗ mình tới điểm (đi bộ + 1 tuyến), null nếu đi bộ thẳng nhanh hơn (src/sim/bus.js → busPlan)
  busPlanTo(to) {
    if (!this.bus) return null;
    const plan = busPlan(this.bus, this.playerPos, to, this.clockMin, routeDist, 3.4, this.busPrefer);
    this.busPrefer = plan ? plan.from.id : null; // giữ trạm đã gợi ý (mũi tên không nhảy qua lại giữa 2 trạm)
    return plan;
  }
  // Dòng gợi ý đi xe buýt cho điện thoại (app CSGT, thẻ địa điểm / trạm trên app Bản đồ): null nếu đi bộ thẳng nhanh hơn
  planText(pl) {
    const plan = pl?.door && this.busPlanTo(pl.door);
    if (!plan) return null;
    const p = { walk1: fmtDist(plan.walk1), from: plan.from.name, route: routeShort(plan.route), to: plan.to.name, walk2: fmtDist(plan.walk2), min: Math.round(plan.minutes) };
    const x = plan.legs[1]; // đổi tuyến 1 lần
    return x ? fmt('map.busPlan2', { ...p, route2: routeShort(x.route), to2: x.to.name }) : fmt('map.busPlan', p);
  }

  currentTarget() {
    const { om, gs } = this;
    const o = om.order;
    if (gs.towed && this.mode === 'foot') {
      const lot = this.layout.placeById[gs.towed.placeId];
      const fee = gs.towed.fee + (lot?.kind === 'police' ? gs.finesTotal : 0); // ở đồn: đóng cả phạt nguội
      // xa thì gợi ý đi xe buýt (trạm gần mình → trạm gần nơi giữ xe, cùng tuyến)
      const pp = this.playerPos, far = lot && Math.hypot(lot.door.x - pp.x, lot.door.z - pp.z) > 200;
      // xe đang ở đồn công an (không có xe để chạy): chỉ đường đi bộ ra trạm → xe buýt tuyến nào → xuống trạm nào
      const plan = lot?.kind === 'police' && this.busPlanTo(lot.door);
      if (plan) {
        const x = plan.legs[1]; // có đổi tuyến: xuống trạm đổi rồi đón tuyến thứ 2
        return { ...plan.from.wait, text: fmt('goal.busPlan', { from: plan.from.name, route: routeShort(plan.route), to: plan.to.name }),
          sub: x ? fmt('goal.busPlanHintX', { route2: routeShort(x.route), to: x.to.name, place: lot.name, fee }) : fmt('goal.busPlanHint', { place: lot.name, fee }), color: '#16a085' };
      }
      const h = far && inService(this.clockMin) && busHint(this.bus, pp.x, pp.z, lot.door.x, lot.door.z);
      const sub = h ? fmt('goal.towedBus', { from: h.from.name, route: h.route.name, to: h.to.name }) : fmt('goal.towedHint');
      return { x: this.bike.pos.x, z: this.bike.pos.z, text: fmt('goal.towed', { place: lot?.name || '', fee }), sub, color: '#e74c3c' };
    }
    // app Xe → 📍 Định vị xe: chỉ đường tới chỗ xe đang dựng (tới nơi / lên xe thì thôi)
    if (this.findBike) {
      if (this.mode === 'bike' || dist2(this.playerPos, this.bike.pos) < 3) this.findBike = false;
      else return { x: this.bike.pos.x, z: this.bike.pos.z, text: fmt('goal.findBike', { bike: gs.vehicleSpec.name }), sub: fmt('goal.findBikeHint'), color: '#5dade2' };
    }
    if (o) {
      if ([S.TO_PICKUP, S.WAITING_FOOD, S.OUT_OF_STOCK, S.PACKING].includes(om.state)) {
        const wait = om.state === S.WAITING_FOOD ? Math.ceil(om.minutesUntilReady(this.clockMin)) : 0;
        const k = o.kind === 'ride' ? 'Ride' : o.kind === 'parcel' ? 'Parcel' : 'Food';
        return { ...o.pickup.door, text: fmt(`goal.pickup${k}`, { customer: o.customer, place: o.pickup.name }), sub: wait ? fmt('goal.pickupWait', { min: wait }) : fmt(`goal.pickup${k}Hint`), color: '#f39c12' };
      }
      // bị bom: mang hàng về trả shop
      if (om.state === S.RETURNING) return { ...o.pickup.door, text: fmt('goal.returnParcel', { place: o.pickup.name }), sub: fmt('goal.returnParcelHint'), color: '#e67e22' };
      if (!o.revealed && o.zone) return { x: o.zone.x, z: o.zone.z, zone: o.zone, text: fmt('goal.vague', { customer: o.customer }), sub: fmt('goal.vagueHint'), color: '#9b59b6' };
      return { ...o.dropoff.door, text: fmt(o.kind === 'ride' ? 'goal.dropRide' : 'goal.dropFood', { address: o.dropoff.address }), sub: o.kind === 'ride' ? fmt('goal.dropRideHint', { kmh: act.comfortKmh(this, o) }) : fmt('goal.dropFoodHint'), color: '#2ecc71' };
    }
    const P = this.layout.placeById;
    // cốt truyện đang chạy: mục tiêu của bước hiện tại
    const sg = om.state !== S.OFFERED && this.storyGoal();
    if (sg) {
      // bước cốt truyện không có chỗ đến (vd "Đi ngủ", "Nhắn cho anh Đạt") mà người chơi tự bấm 📍 Chỉ đường trên bản đồ → chỉ tới chỗ đó
      const wp0 = sg.x == null && this.waypointPlace();
      if (wp0) return { ...wp0.door, text: fmt('goal.waypoint', { place: wp0.name }), sub: sg.text, color: '#1e90ff' };
      return sg;
    }
    if (gs.story?.ch && !gs.brand) return null; // giữa 2 bước cốt truyện (chưa vào hãng): chưa có gì để nhắc
    // địa điểm tự chọn trên bản đồ điện thoại (Chỉ đường) — ưu tiên hơn gợi ý mục tiêu
    const wp = this.waypointPlace();
    if (wp && om.state !== S.OFFERED) {
      // người mới đang đi tới văn phòng hãng: nhắc cất máy, tới nơi bấm E đăng ký
      if (wp.kind === 'office' && !gs.brand) return { ...wp.door, text: fmt('goal.toOffice', { place: wp.name }), sub: fmt(this.phone.open ? 'goal.toOfficeClose' : 'goal.toOfficeHint'), color: '#1e90ff' };
      return { ...wp.door, text: fmt('goal.waypoint', { place: wp.name }), sub: fmt('goal.waypointHint'), color: '#1e90ff' };
    }
    // buồn ngủ / app nghỉ ban đêm → nhắc về phòng trọ ngủ (ưu tiên hơn mua đồ)
    const tired = gs.tiredLevel(this.clockMin);
    if (tired && om.state !== S.OFFERED) return { ...P.home.door, text: fmt(tired > 1 ? 'goal.veryTired' : 'goal.tired', { h: Math.floor(gs.awakeHours(this.clockMin)) }), sub: fmt('goal.sleepHint'), color: '#8e7cc3' };
    if (!inHours(APP.hours, this.clockMin) && om.state !== S.OFFERED) return { ...P.home.door, text: fmt('goal.appClosed'), sub: fmt('goal.sleepHint'), color: '#8e7cc3' };
    for (const ob of objectives(gs)) {
      if (ob.done) continue;
      // mở đầu: tìm nhà trọ (tới gần thì nhắc nói chuyện với Cô Hai) → leo lên xe đạp trong hầm
      if (ob.id === 'findHome') {
        const h = P.home, near = dist2(this.playerPos, h.door) < 8;
        return { ...h.door, text: fmt(near ? 'goal.talkLandlord' : 'goal.findHome', { place: h.name }), sub: fmt(near ? 'goal.talkLandlordHint' : 'goal.findHomeHint'), color: '#f4d03f' };
      }
      if (ob.id === 'mountBike') return { x: this.bike.pos.x, z: this.bike.pos.z, text: fmt('goal.mountBike'), sub: fmt('goal.mountBikeHint'), color: '#5dade2' };
      if (ob.id === 'mount') return { x: this.bike.pos.x, z: this.bike.pos.z, text: fmt('goal.mount'), sub: fmt('goal.mountHint'), color: '#5dade2' };
      if (ob.id === 'brand') {
        const st = this.tutorialStep();
        if (['phone', 'map', 'office', 'route'].includes(st)) return { text: fmt(`goal.tut.${st}`), sub: fmt(`goal.tut.${st}Hint`) };
        const at = this.nearOffice();
        if (at) return { ...at.door, text: fmt('goal.atOffice', { place: at.name }), sub: fmt(this.phone.open ? 'goal.atOfficeClose' : 'goal.atOfficeHint'), color: '#1e90ff' };
        const off = this.nearestPlace((p) => p.kind === 'office');
        return off ? { ...off.door, text: fmt('goal.brand'), sub: fmt('goal.brandHint', { place: off.name }), color: '#5dade2' } : { text: fmt('goal.brand'), sub: '' };
      }
      if (ob.id === 'fuel') {
        if (gs.power === 'electric') {
          const ch = this.nearestPlace((p) => p.kind === 'charger');
          if (ch) return { ...(ch.chargeSpot || ch.door), text: fmt('goal.charge'), sub: fmt('goal.chargeHint'), color: '#5dade2' };
        } else if (gs.power === 'gas') return { ...P.gas.door, text: fmt('goal.fuel'), sub: fmt('goal.fuelHint'), color: '#5dade2' };
      }
      if (ob.id === 'online' && !om.hold) return { text: fmt('goal.online'), sub: '' }; // cốt truyện đang chặn đơn thường → không nhắc bật nhận đơn
      // nhắc về trả tiền nhà chỉ vào NGÀY hạn trả (đủ tiền từ sớm thì cứ chạy đơn, không bị kéo về nhà sau khi đổ xăng / sạc)
      if (ob.id === 'rent' && gs.money >= gs.rent && gs.day >= gs.rentDueDay) return { ...P.home.door, text: fmt('goal.rent', { rent: gs.rent, day: gs.rentDueDay }), sub: fmt('goal.rentHint'), color: '#e74c3c' };
    }
    if (gs.fines.length && gs.money >= gs.finesTotal && (gs.hasOverdueFines || gs.finesDueAt - this.clockMin < 1440)) {
      const st = this.nearestStation();
      if (st) return { ...st.door, text: fmt('goal.fines', { fine: gs.finesTotal, place: st.name }), sub: fmt('goal.finesHint'), color: '#e67e22' };
    }
    // đã vào hãng nhưng đang đi xe không đúng loại (xe đạp / xe xăng ↔ xe điện) → nhắc đổi xe
    if (gs.workBlock() === 'noUniform') return { text: fmt('goal.noUniform', { brand: gs.brandSpec.name }), sub: fmt('goal.noUniformHint') };
    if (gs.workBlock() === 'wrongVehicle') return { text: fmt('goal.wrongVehicle', { brand: gs.brandSpec.name, kind: fmt(`power.${gs.brandSpec.power}`) }), sub: fmt('goal.wrongVehicleHint') };
    if (om.hold) return null; // trong chương / bước cốt truyện chặn đơn thường: không nhắc bật nhận đơn / chờ đơn
    if (om.state === S.OFFLINE) return { text: fmt('goal.online'), sub: '' };
    if (!gs.rentPaid && gs.money < gs.rent) return { text: fmt('goal.waiting', { k: Math.ceil(gs.rent - gs.money), day: gs.rentDueDay }), sub: fmt('goal.waitingHint') };
    return null;
  }
}
