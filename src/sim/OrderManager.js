// =============================================================
// QUẢN LÝ ĐƠN HÀNG (OrderManager) — máy trạng thái, không phụ thuộc Three.js/DOM.
//
//  OFFLINE ─bật app→ IDLE ─có đơn→ OFFERED ─nhận→ TO_PICKUP
//     ▲                ▲   └─từ chối/hết giờ─┘        │
//     └──tắt app───────┤                              ├─(đồ ăn) tới quán→ WAITING_FOOD ─xong→ PACKING ─xếp xong→ DELIVERING
//                      │                              │        └→ OUT_OF_STOCK ─đổi món/nấu thêm→ WAITING_FOOD
//                      │                              ├─(giao hàng / hỏa tốc) lấy hàng ở shop──→ PACKING
//                      │                              └─(xe ôm) đón khách──────────────────────────────→ DELIVERING
//                      │   DELIVERING ─tới nơi→ AT_DROPOFF ─giao→ IDLE (chấm sao + trả tiền)
//                      │                          ├→ NO_ANSWER ─gọi được/chờ→ AT_DROPOFF · hỏi hàng xóm→ DELIVERING (đổi chỗ)
//                      │                          ├→ STAIRS (thang máy hư) ─leo bộ/gọi khách xuống→ AT_DROPOFF
//                      │                          └→ RETURNING (khách bom hàng COD) ─trả hàng cho shop→ IDLE
//                      └──── hủy đơn (từ hầu hết trạng thái) · khách xe ôm đòi xuống giữa đường ──────────────────┘
// Loại đơn, loại khách xe ôm, phí app đọc từ apps.json (sửa bằng ?editor, thẻ 📱 App & Đơn).
// =============================================================
import { ITEMS } from '../data/items.js';
import { ORDER, DIST, TIME, ECONOMY } from '../data/balance.js';
import { APP, ORDER_TYPES, RIDER_TYPES, ORDER_KINDS, typeOpen, isPeak, surchargeAt } from '../data/apps.js';
import { CUSTOMER_NAMES } from '../data/places.js';
import { DeliveryItem } from './ItemPhysics.js';
import { evaluateOrder } from './OrderCondition.js';
import { computePayout, estimatePay, addTip } from './economy.js';
import { routeDist, rideDoor } from './cityLayout.js';
import { fmt } from '../content/index.js';
import { isOpen, orderWeight, unlocked } from './placeRules.js';

export const S = Object.freeze({
  OFFLINE: 'OFFLINE',
  IDLE: 'IDLE',
  OFFERED: 'OFFERED',
  TO_PICKUP: 'TO_PICKUP',
  WAITING_FOOD: 'WAITING_FOOD',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  PACKING: 'PACKING',
  DELIVERING: 'DELIVERING',
  AT_DROPOFF: 'AT_DROPOFF',
  NO_ANSWER: 'NO_ANSWER',
  STAIRS: 'STAIRS',
  RETURNING: 'RETURNING',
});

export const TRANSITIONS = {
  OFFLINE: ['IDLE'],
  IDLE: ['OFFERED', 'OFFLINE'],
  OFFERED: ['IDLE', 'TO_PICKUP'],
  TO_PICKUP: ['WAITING_FOOD', 'OUT_OF_STOCK', 'PACKING', 'DELIVERING', 'IDLE'],
  WAITING_FOOD: ['PACKING', 'IDLE'],
  OUT_OF_STOCK: ['WAITING_FOOD', 'IDLE'],
  PACKING: ['DELIVERING'],
  DELIVERING: ['AT_DROPOFF', 'IDLE'],
  AT_DROPOFF: ['NO_ANSWER', 'STAIRS', 'DELIVERING', 'RETURNING', 'IDLE'],
  NO_ANSWER: ['AT_DROPOFF', 'DELIVERING', 'IDLE'],
  STAIRS: ['AT_DROPOFF', 'IDLE'],
  RETURNING: ['IDLE'],
};

// Nhãn hiển thị cho từng trạng thái (kho chữ: state.*)
export const stateLabel = (st) => fmt(`state.${st}`);

const CARGO_STATES = new Set([S.DELIVERING, S.AT_DROPOFF, S.NO_ANSWER, S.STAIRS, S.RETURNING]);
const r1 = (v) => Math.round(v * 10) / 10;
// Hệ số "xa" khi chọn nơi lấy hàng: (30 + d)² → quán / shop gần tài xế được chọn nhiều hơn hẳn
const near = (d) => (30 + d) ** 2;

export class OrderManager {
  // isRaining(phút): để tính phụ phí mưa lúc có đơn (game / bot truyền vào; bỏ trống = không mưa)
  constructor({ rng, layout, gs, isRaining = () => false }) {
    this.rng = rng;
    this.layout = layout;
    this.gs = gs;
    this.isRaining = isRaining;
    this.state = S.OFFLINE;
    this.order = null;
    this.offer = null;
    this.offerTimeLeft = 0;
    this.nextPingIn = 2;
    this.listeners = [];
    this.uid = 0; // mã món hàng
    this.orderSeq = 0; // số thứ tự đơn trong ngày
    this.history = [];
  }

  on(fn) {
    this.listeners.push(fn);
  }
  emit(type, data = {}) {
    for (const fn of this.listeners) fn({ type, ...data });
  }

  go(next) {
    const allowed = TRANSITIONS[this.state] || [];
    if (!allowed.includes(next)) throw new Error(`Chuyển trạng thái không hợp lệ: ${this.state} → ${next}`);
    const prev = this.state;
    this.state = next;
    this.emit('state', { prev, next });
  }

  get hasCargo() {
    return !!(this.order && this.order.items.length && CARGO_STATES.has(this.state));
  }
  // Loại đơn / loại khách của đơn (dữ liệu có thể đã bị xóa trong công cụ → dùng mặc định)
  typeOf(o) {
    return ORDER_TYPES[o.type] || Object.values(ORDER_TYPES).find((t) => t.kind === o.kind) || { kind: o.kind, fareMult: 1, deadlineMult: 1 };
  }
  riderOf(o) {
    return o.rider ? RIDER_TYPES[o.rider] || null : null;
  }
  // Khách đang bom hàng (chưa thuyết phục được, chưa đem trả)
  bomPending(o = this.order) {
    return !!(o && o.flags.bom && !o.bomResolved);
  }

  // ---------- bật / tắt app ----------
  goOnline() {
    if (this.state !== S.OFFLINE) return false;
    this.go(S.IDLE);
    this.nextPingIn = this.rng.range(1, 3);
    return true;
  }
  goOffline() {
    if (this.state === S.OFFERED) this.decline();
    if (this.state !== S.IDLE) return false;
    this.go(S.OFFLINE);
    return true;
  }

  // Khoảng chờ tới đơn kế: giờ cao điểm nhanh hơn; tỉ lệ nhận đơn thấp thì app phát đơn thưa hơn
  schedulePing(now) {
    const acc = APP.account || {};
    const lowAccept = this.gs.acceptRate < (acc.lowAcceptBelow ?? 0) ? acc.lowAcceptPingMult || 1 : 1;
    this.nextPingIn = this.rng.range(...ORDER.pingGap) * (isPeak(now) ? 0.6 : 1) * lowAccept;
  }

  // dtMin: phút game, dtSec: giây thật (đếm ngược thẻ đơn theo thời gian thật)
  update(dtMin, dtSec, now, pos) {
    if (this.state === S.IDLE) {
      if (now >= TIME.lastOfferAt) return;
      if (this.gs.lockedUntil > now) return; // tài khoản đang bị tạm khóa nhận đơn
      this.nextPingIn -= dtMin;
      if (this.nextPingIn <= 0) {
        this.offer = this.makeOffer(now, pos);
        if (this.offer) {
          this.go(S.OFFERED);
          this.offerTimeLeft = ORDER.offerTimeoutSec;
          this.emit('offer', { offer: this.offer });
        } else this.nextPingIn = 3;
      }
    } else if (this.state === S.OFFERED) {
      this.offerTimeLeft -= dtSec;
      if (this.offerTimeLeft <= 0) {
        const offer = this.offer;
        this.offer = null;
        this.gs.recordOffer(false);
        this.go(S.IDLE);
        this.schedulePing(now);
        this.emit('offerExpired', { offer });
      }
    }
  }

  // ---------- tạo đơn ----------
  // Món có đơn được lúc này: đã tới ngày bắt đầu có đơn + chở được (túi giữ nhiệt, mũ cho khách)
  itemOk(id) {
    const def = ITEMS[id];
    return !!def && unlocked(def, this.gs.day) && this.canCarry(def);
  }

  canCarry(def) {
    if (def.traits.includes('cold')) return this.gs.bagSpec.insulation >= 0.5;
    if (def.traits.includes('passenger')) return this.gs.effect('passengerSeat');
    return true;
  }

  // Loại đơn đang có: đúng khung giờ, đủ trang bị yêu cầu (vd mũ cho khách → đơn xe ôm)
  availableTypes(now) {
    return Object.values(ORDER_TYPES).filter((t) => ORDER_KINDS.includes(t.kind) && t.weight > 0 && typeOpen(t, now) && (!t.requires || this.gs.effect(t.requires)));
  }

  makeOffer(now, pos = { x: 0, z: 0 }) {
    const gs = this.gs;
    // Đơn cốt truyện: lần đầu có mũ cho khách → đơn chở anh Minh
    if (gs.flags.wallet === 0 && gs.effect('passengerSeat')) {
      const rideType = ORDER_TYPES.ride || Object.values(ORDER_TYPES).find((t) => t.kind === 'ride');
      if (rideType) return this.makeRide(pos, true, now, rideType);
    }
    // chọn loại đơn theo mức thường xuyên; loại nào lúc này không tạo được đơn thì thử loại khác
    let types = this.availableTypes(now);
    while (types.length) {
      const t = this.rng.weighted(types, types.map((x) => x.weight));
      const o = t.kind === 'ride' ? this.makeRide(pos, false, now, t) : t.kind === 'parcel' ? this.makeParcel(t, now, pos) : this.makeFood(t, now, pos);
      if (o) return o;
      types = types.filter((x) => x !== t);
    }
    return null;
  }

  makeFood(type, now, pos) {
    // chỉ quán đang mở cửa mới có đơn
    const options = this.layout.places
      .filter((p) => p.kind === 'restaurant' && isOpen(p, now, this.gs.day) && (p.menu || []).length)
      .map((r) => ({ r, menu: r.menu.filter((id) => this.itemOk(id)) }))
      .filter((o) => o.menu.length);
    if (!options.length) return null;
    // app giao đơn cho tài xế ở gần: quán gần được ưu tiên mạnh (gấp đôi khoảng cách → ít đơn hơn ~4 lần)
    const weights = options.map((o) => (o.menu.some((id) => ITEMS[id].traits.includes('cold')) ? 1.6 : 1) / near(routeDist(pos, o.r.door)));
    const { r, menu } = this.rng.weighted(options, weights);
    const n = this.rng.chance(ORDER.twoItemChance) ? 2 : 1;
    const itemIds = Array.from({ length: n }, () => this.rng.pick(menu));
    const dropoff = this.pickDropoff(r.door, true, now, 'foodWeight', r.id);
    const pickup = { placeId: r.id, name: r.name, address: r.address, door: r.door };
    return this.buildOrder({ type, pickup, dropoff, itemIds, pos, now });
  }

  // Giao hàng / hỏa tốc: lấy hàng ở shop (nơi có "gửi hàng từ đây") hoặc nhà người gửi gần đó
  makeParcel(type, now, pos) {
    const items = (type.items || []).filter((id) => ITEMS[id] && ITEMS[id].parcel && this.itemOk(id));
    if (!items.length) return null;
    const id = this.rng.pick(items);
    // lấy ở shop "gửi hàng từ đây" gần tài xế (trong ORDER.parcelShopMax m, ưu tiên gần); không có thì nhà người gửi gần đó
    let pickup = null;
    const shops = this.layout.places
      .map((p) => ({ p, w: orderWeight(p, 'parcelWeight', now, this.gs.day), d: routeDist(pos, p.door) }))
      .filter((c) => c.w > 0 && c.d <= ORDER.parcelShopMax);
    if (shops.length) {
      const { p } = this.rng.weighted(shops, shops.map((c) => c.w / near(c.d)));
      pickup = { placeId: p.id, name: p.name, address: p.name, door: p.door };
    }
    if (!pickup) {
      const l = this.pickLotAround(pos, 30, 160);
      pickup = { name: l.address, address: l.address, door: l.door, lotKey: l.key };
    }
    const dropoff = this.pickDropoff(pickup.door, true, now, null, pickup.placeId);
    const o = this.buildOrder({ type, pickup, dropoff, itemIds: [id], pos, now });
    // thu hộ (COD): app chỉ giao đơn COD khi ví tài xế đủ tiền ứng trước
    const value = ITEMS[id].cod || 0;
    if (value > 0 && this.rng.chance(type.codChance || 0) && this.gs.money >= value) o.cod = value;
    o.flags.bom = !!o.cod && this.rng.chance(type.bomChance || 0);
    return o;
  }

  // Địa điểm (karaoke, nhà sách…) được đánh dấu làm điểm đến của đơn, theo trọng số + khung giờ.
  // force: luôn chọn nếu có nơi đủ điều kiện. Trả về null nếu lần này không chọn địa điểm nào.
  // forRide: đơn xe ôm → địa điểm trong hẻm đi bộ thì đón/trả ở miệng hẻm
  placeDestination(key, now, excludeId = null, scale = 1, force = false, forRide = false) {
    const cands = this.layout.places.filter((p) => p.id !== excludeId).map((p) => ({ p, w: orderWeight(p, key, now, this.gs.day) })).filter((c) => c.w > 0);
    const W = cands.reduce((s, c) => s + c.w, 0);
    if (!W || (!force && !this.rng.chance((W / (W + ORDER.placeDestBase)) * scale))) return null;
    const { p } = this.rng.weighted(cands, cands.map((c) => c.w));
    return { placeId: p.id, name: p.name, address: p.name, door: forRide ? rideDoor(p) : p.door, apartment: false };
  }

  // Loại khách xe ôm lúc này (theo giờ, số chuyến đã chở, nơi đón)
  pickRider(now) {
    const gs = this.gs;
    const cands = Object.values(RIDER_TYPES).filter((r) => r.weight > 0 && typeOpen(r, now) && (!r.minRides || gs.account.rides >= r.minRides) && (!r.from || this.riderPlaces(r, now).length));
    if (!cands.length) return RIDER_TYPES.app || Object.values(RIDER_TYPES)[0] || null;
    return this.rng.weighted(cands, cands.map((r) => r.weight));
  }
  riderPlaces(r, now) {
    return (r.from || []).map((id) => this.layout.placeById[id]).filter((p) => p && isOpen(p, now, this.gs.day));
  }

  makeRide(pos, story, now = 0, type = ORDER_TYPES.ride) {
    const market = this.layout.placeById.market;
    const rider = story ? RIDER_TYPES.app || null : this.pickRider(now);
    let pickup;
    const from = rider && rider.from ? this.riderPlaces(rider, now) : [];
    if (story) pickup = { placeId: 'market', name: market.name, address: market.address, door: rideDoor(market) };
    else if (from.length) {
      const p = this.rng.pick(from); // khách say đi ra từ karaoke…
      pickup = { placeId: p.id, name: p.name, address: p.name, door: rideDoor(p) };
    } else if ((pickup = this.placeDestination('rideWeight', now, null, 0.5, false, true))) {
      // khách xuất phát từ một địa điểm (vd. hát karaoke xong về nhà)
    } else {
      const l = this.pickLotAround(pos, 40, 180);
      pickup = { name: l.address, address: l.address, door: rideDoor(l), lotKey: l.key };
    }
    const dropoff = this.pickDropoff(pickup.door, false, now, pickup.placeId ? null : 'rideWeight', pickup.placeId, true);
    const o = this.buildOrder({ type: type || { id: 'ride', kind: 'ride', fareMult: 1, deadlineMult: 1 }, pickup, dropoff, itemIds: ['passenger'], pos, now, rider });
    o.flags.noAnswer = false;
    // khách say hay quên địa chỉ → chỉ biết khu vực, gọi hỏi lại / hỏi người đi đường
    o.flags.vague = !story && !dropoff.placeId && !!rider && this.rng.chance(rider.vagueChance || 0);
    o.revealed = !o.flags.vague;
    if (o.flags.vague) o.zone = this.vagueZone(dropoff.door);
    // đặt xe dùm: người đi khác người đặt
    if (rider && Array.isArray(rider.riderNames) && rider.riderNames.length) {
      o.booker = o.customer;
      o.customer = this.rng.pick(rider.riderNames);
    }
    if (story) {
      o.story = 'wallet';
      o.customer = 'Anh Minh';
      o.flags.picky = false;
    }
    return o;
  }

  vagueZone(door) {
    const a = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(6, 16);
    return { x: door.x + Math.cos(a) * r, z: door.z + Math.sin(a) * r, r: 26 };
  }

  // destKey: 'foodWeight' | 'rideWeight' | null — cho phép giao tới địa điểm được đánh dấu
  // forRide: đơn xe ôm → nhà / địa điểm trong hẻm đi bộ thì trả khách ở miệng hẻm
  pickDropoff(from, allowApartment = true, now = 0, destKey = null, excludeId = null, forRide = false) {
    if (destKey) {
      const place = this.placeDestination(destKey, now, excludeId, 1, false, forRide);
      if (place) return place;
    }
    const apt = this.layout.placeById.apartment;
    if (allowApartment && this.rng.chance(ORDER.apartmentChance)) {
      return { name: apt.name, address: fmt('addr.apartment', { name: apt.name, address: apt.address }), door: apt.door, apartment: true, floor: this.rng.int(3, 11) };
    }
    const l = this.pickLotAround(from, ...ORDER.dropDist);
    return { name: l.address, address: l.address, door: forRide ? rideDoor(l) : l.door, apartment: false, lotKey: l.key };
  }

  // Nhà khách cách điểm `from` từ a tới b m (đường đi thật), ưu tiên nhà gần hơn (khả năng ~ 1/khoảng cách)
  // — vòng càng xa càng nhiều nhà, chọn đều thì hầu hết đơn rơi vào khoảng xa nhất
  pickLotAround(from, a, b) {
    const cands = [];
    for (const l of this.layout.lots) {
      const d = routeDist(from, l.door);
      if (d >= a && d <= b) cands.push({ l, d });
    }
    if (!cands.length) return this.rng.pick(this.layout.lots);
    return this.rng.weighted(cands, cands.map((c) => 1 / c.d)).l;
  }

  buildOrder({ type, pickup, dropoff, itemIds, pos, now = 0, rider = null }) {
    const rng = this.rng;
    const kind = type.kind;
    const defs = itemIds.map((id) => ITEMS[id]);
    const d1 = routeDist(pos, pickup.door);
    const d2 = routeDist(pickup.door, dropoff.door);
    const distanceKm = Math.round((d2 * DIST.displayPerUnit) / 100) / 10;
    const fareMult = (type.fareMult ?? 1) * (rider ? rider.fareMult ?? 1 : 1);
    const baseFare = r1((Math.max(...defs.map((d) => d.base)) + (defs.length - 1) * APP.extraItemFare) * fareMult);
    const viaApp = rider ? rider.viaApp !== false : true;
    const surcharge = viaApp ? surchargeAt(now, this.isRaining(now)) : 0; // khách quen gọi thẳng: không có phụ phí app
    const named = !!dropoff.placeId; // giao tới địa điểm có tên → không mơ hồ, khách có mặt
    const vague = kind !== 'ride' && !dropoff.apartment && !named && rng.chance(ORDER.vagueChance);
    const o = {
      id: ++this.orderSeq,
      type: type.id || kind,
      kind,
      rider: rider ? rider.id : null,
      viaApp,
      story: null,
      pickup,
      dropoff,
      itemIds,
      items: [],
      customer: rng.pick(CUSTOMER_NAMES),
      booker: null,
      baseFare,
      surcharge,
      cod: 0,
      codPaid: false,
      distanceKm,
      d1,
      d2,
      estPay: estimatePay(baseFare, distanceKm, { surcharge, viaApp }),
      deadlineMult: (type.deadlineMult ?? 1) * (rider ? rider.deadlineMult ?? 1 : 1),
      flags: {
        vague,
        noAnswer: kind !== 'ride' && !dropoff.apartment && !named && rng.chance(ORDER.noAnswerChance),
        picky: rng.chance(ORDER.pickyChance),
        outOfStock: kind === 'food' && rng.chance(ORDER.outOfStockChance),
        liftBroken: !!dropoff.apartment && rng.chance(ORDER.liftBrokenChance),
        bom: false,
      },
      revealed: !vague,
      zone: null,
      allowedMin: 0,
      acceptedAt: 0,
      readyAt: 0,
      pickedAt: 0,
      liters: 0,
      extraPenalty: 0,
      calls: 0,
      noAnswerResolved: false,
      stairsDone: false,
      missingItem: null,
      bomResolved: false,
      persuaded: false,
      vomited: false,
    };
    if (vague) o.zone = this.vagueZone(dropoff.door);
    return o;
  }

  accept(now, pos = null) {
    if (this.state !== S.OFFERED || !this.offer) return null;
    const o = this.offer;
    this.offer = null;
    if (pos) o.d1 = routeDist(pos, o.pickup.door);
    o.acceptedAt = now;
    const prep = o.kind === 'food' ? ORDER.prepAllowance : 2;
    o.allowedMin = Math.round(((o.d1 + o.d2) / ORDER.planSpeed + prep + ORDER.slack) * o.deadlineMult);
    this.order = o;
    this.gs.recordOffer(true);
    this.go(S.TO_PICKUP);
    this.emit('accepted', { order: o });
    return o;
  }

  decline(now = 0) {
    if (this.state !== S.OFFERED) return false;
    const offer = this.offer;
    this.offer = null;
    this.gs.recordOffer(false);
    this.go(S.IDLE);
    this.schedulePing(now);
    this.emit('declined', { offer });
    return true;
  }

  // ---------- ở quán ----------
  arriveAtPickup(now) {
    const o = this.order;
    if (this.state !== S.TO_PICKUP || !o || o.kind !== 'food') return null;
    const q = this.rng.range(...(isPeak(now) ? ORDER.queuePeak : ORDER.queue));
    o.readyAt = now + q;
    // quán làm lâu là lỗi của quán: cộng phần dư vào thời hạn
    o.allowedMin += Math.max(0, Math.round(q - ORDER.prepAllowance));
    if (o.flags.outOfStock) {
      o.missingItem = this.rng.pick(o.itemIds);
      this.go(S.OUT_OF_STOCK);
      return { outOfStock: true, item: ITEMS[o.missingItem] };
    }
    this.go(S.WAITING_FOOD);
    return { outOfStock: false, queueMin: q };
  }

  // choice: 'call' (gọi khách đổi món) | 'cook' (chờ nấu thêm) | 'cancel'
  resolveOutOfStock(choice, now) {
    const o = this.order;
    if (this.state !== S.OUT_OF_STOCK) return null;
    if (choice === 'cancel') {
      this.cancel(fmt('cancel.outOfStockDriver'), now, { byDriver: true });
      return { cancelled: true };
    }
    if (choice === 'cook') {
      const wait = this.rng.range(15, 22);
      o.readyAt = now + wait; // nấu nồi mới: tính lại từ bây giờ
      o.allowedMin += Math.round(wait);
      o.flags.outOfStock = false;
      this.go(S.WAITING_FOOD);
      return { wait };
    }
    // gọi khách
    if (this.rng.chance(ORDER.substituteAcceptChance)) {
      const menu = this.layout.placeById[o.pickup.placeId].menu.filter((id) => id !== o.missingItem && this.itemOk(id));
      const sub = menu.length ? this.rng.pick(menu) : o.missingItem;
      o.itemIds = o.itemIds.map((id) => (id === o.missingItem ? sub : id));
      o.flags.outOfStock = false;
      o.readyAt = Math.max(o.readyAt, now) + 3;
      this.go(S.WAITING_FOOD);
      return { accepted: true, sub: ITEMS[sub] };
    }
    this.cancel(fmt('cancel.outOfStockCustomer'), now, { byDriver: false, comp: APP.cancelComp });
    return { accepted: false, cancelled: true };
  }

  isFoodReady(now) {
    return this.state === S.WAITING_FOOD && now >= this.order.readyAt;
  }

  minutesUntilReady(now) {
    return this.state === S.WAITING_FOOD ? Math.max(0, this.order.readyAt - now) : 0;
  }

  collectFood(now) {
    if (!this.isFoodReady(now)) return null;
    const o = this.order;
    o.items = o.itemIds.map((id) => new DeliveryItem(ITEMS[id], ++this.uid));
    this.go(S.PACKING);
    return o.items;
  }

  // Giao hàng / hỏa tốc: nhận hàng ở shop (đơn COD phải ứng tiền hàng trước) → xếp túi
  collectParcel(now) {
    const o = this.order;
    if (this.state !== S.TO_PICKUP || !o || o.kind !== 'parcel') return null;
    if (o.cod && !o.codPaid) {
      if (!this.gs.spend(o.cod, 'codAdvance')) return { noMoney: true, cod: o.cod };
      o.codPaid = true;
    }
    o.items = o.itemIds.map((id) => new DeliveryItem(ITEMS[id], ++this.uid));
    this.go(S.PACKING);
    return { items: o.items, cod: o.codPaid ? o.cod : 0 };
  }

  // modsList[i] = { upright, heatNeighbor, crushed } cho món thứ i
  finishPacking(modsList, now) {
    if (this.state !== S.PACKING) return false;
    const o = this.order;
    o.items.forEach((it, i) => it.applyPacking(modsList[i] || {}));
    o.pickedAt = now;
    this.go(S.DELIVERING);
    this.emit('pickedUp', { order: o });
    return true;
  }

  boardPassenger(now) {
    const o = this.order;
    if (this.state !== S.TO_PICKUP || !o || o.kind !== 'ride') return false;
    const it = new DeliveryItem(ITEMS.passenger, ++this.uid);
    // mỗi loại khách chịu tốc độ khác nhau (cụ già sợ nhanh, khách vội thì không)
    const rider = this.riderOf(o);
    if (rider && rider.comfortKmh) it.comfortDelta = rider.comfortKmh / 3.6 - ECONOMY.speedLimit;
    o.items = [it];
    o.pickedAt = now;
    this.go(S.DELIVERING);
    this.emit('pickedUp', { order: o });
    return true;
  }

  // Địa chỉ mơ hồ → gọi khách hoặc hỏi người dân để biết đúng nhà
  reveal() {
    if (!this.order || this.order.revealed) return false;
    this.order.revealed = true;
    this.emit('revealed', { order: this.order });
    return true;
  }

  // ---------- ở điểm giao ----------
  // Trả về: 'noAnswer' | 'stairs' | 'lift' | 'bom' | 'ready'
  arriveAtDropoff(now) {
    const o = this.order;
    if (!o) return null;
    if (this.state === S.AT_DROPOFF) return this.bomPending(o) ? 'bom' : 'ready';
    if (this.state !== S.DELIVERING) return null;
    this.go(S.AT_DROPOFF);
    if (o.flags.noAnswer && !o.noAnswerResolved) {
      this.go(S.NO_ANSWER);
      return 'noAnswer';
    }
    if (this.bomPending(o)) return 'bom';
    if (o.dropoff.apartment && !o.stairsDone) {
      if (o.flags.liftBroken) {
        this.go(S.STAIRS);
        return 'stairs';
      }
      o.stairsDone = true;
      return 'lift';
    }
    return 'ready';
  }

  callCustomer(now) {
    const o = this.order;
    if (!o) return null;
    o.calls += 1;
    if (this.state === S.NO_ANSWER) {
      if (this.rng.chance(ORDER.callAnswerChance)) {
        o.noAnswerResolved = true;
        this.go(S.AT_DROPOFF);
        return { answered: true, waitMin: 3 };
      }
      return { answered: false, waitMin: 2 };
    }
    // Đang giao mà địa chỉ mơ hồ → khách tả đường
    if (!o.revealed && (this.state === S.DELIVERING || this.state === S.TO_PICKUP)) {
      this.reveal();
      return { answered: true, revealed: true, waitMin: 1 };
    }
    return { answered: true, waitMin: 1 };
  }

  // Hàng xóm chỉ: khách đang ở chỗ khác gần đó → đổi điểm giao
  askNeighbor(now) {
    const o = this.order;
    if (this.state !== S.NO_ANSWER) return null;
    const cafe = this.layout.placeById.cafe;
    const near = this.layout.lots.filter((l) => {
      const d = routeDist(o.dropoff.door, l.door);
      return d > 25 && d < 110 && l.key !== o.dropoff.lotKey;
    });
    let alt;
    if (this.rng.chance(0.35) || !near.length) alt = { name: cafe.name, address: cafe.address, door: cafe.door, apartment: false, placeId: 'cafe' };
    else {
      const l = this.rng.pick(near);
      alt = { name: l.address, address: l.address, door: l.door, apartment: false, lotKey: l.key };
    }
    o.dropoff = alt;
    o.noAnswerResolved = true;
    o.revealed = true;
    o.zone = null;
    o.allowedMin += 10;
    this.go(S.AT_DROPOFF);
    this.go(S.DELIVERING);
    this.emit('redirect', { order: o });
    return { alt };
  }

  waitForCustomer(now) {
    if (this.state !== S.NO_ANSWER) return null;
    const came = this.rng.chance(ORDER.waitComeChance);
    if (came) {
      this.order.noAnswerResolved = true;
      this.go(S.AT_DROPOFF);
    }
    return { came, waitMin: 10 };
  }

  // choice: 'climb' (leo bộ) | 'callDown' (gọi khách xuống)
  resolveStairs(choice) {
    const o = this.order;
    if (this.state !== S.STAIRS) return null;
    o.stairsDone = true;
    this.go(S.AT_DROPOFF);
    if (choice === 'climb') return { floors: o.dropoff.floor, minutes: o.dropoff.floor * ORDER.stairMinPerFloor };
    o.extraPenalty += 0.5;
    return { floors: 0, minutes: ORDER.callDownWait };
  }

  // ---------- bom hàng (đơn COD) ----------
  // Năn nỉ khách nhận hàng (mỗi đơn 1 lần)
  persuadeBom(now) {
    const o = this.order;
    if (this.state !== S.AT_DROPOFF || !this.bomPending(o) || o.persuaded) return null;
    o.persuaded = true;
    const accepted = this.rng.chance(this.typeOf(o).persuadeChance || 0);
    if (accepted) o.bomResolved = true;
    return { accepted };
  }
  // Báo bom → mang hàng về trả shop
  startReturn(now) {
    const o = this.order;
    if (this.state !== S.AT_DROPOFF || !this.bomPending(o)) return false;
    this.go(S.RETURNING);
    this.emit('returning', { order: o });
    return true;
  }
  // Trả hàng cho shop: nhận lại tiền đã ứng + phí hoàn hàng của app
  returnToShop(now) {
    const o = this.order;
    if (this.state !== S.RETURNING || !o) return null;
    const refund = o.codPaid ? o.cod : 0;
    const fee = r1(o.baseFare * (this.typeOf(o).returnFeePct || 0));
    this.gs.earn(refund, 'codRefund');
    this.gs.earn(fee, 'returnFee');
    this.gs.recordBom();
    this.order = null;
    this.go(S.IDLE);
    this.schedulePing(now);
    const res = { order: o, refund, fee };
    this.emit('returned', res);
    return res;
  }

  canHandOver() {
    return this.state === S.AT_DROPOFF && !this.bomPending();
  }

  handOver(now) {
    const o = this.order;
    if (!this.canHandOver() || !o) return null;
    const rider = this.riderOf(o);
    const elapsed = now - o.acceptedAt;
    const ev = evaluateOrder({ items: o.items, elapsedMin: elapsed, allowedMin: o.allowedMin, picky: o.flags.picky, extraPenalty: o.extraPenalty, ride: o.kind === 'ride' });
    // khách say có khi quỵt tiền
    const noPay = !ev.refused && !!rider && this.rng.chance(rider.noPayChance || 0);
    const farePct = noPay ? 0 : ev.scared ? ECONOMY.scaredFarePct : 1;
    const pay = computePayout({ baseFare: o.baseFare, distanceKm: o.distanceKm, litersUsed: o.liters, stars: ev.stars, refused: ev.refused, farePct, surcharge: o.surcharge, viaApp: o.viaApp });
    const good = !ev.refused && !ev.scared && !noPay;
    // trang bị "boa thêm" (vd. sách giao tiếp) cho đơn 4–5 sao
    const bonus = good && ev.stars >= 4 ? this.gs.effect('tipBonus') : 0;
    addTip(pay, bonus);
    if (bonus) pay.tipBonus = bonus;
    // khách say boa đậm · khách vội tới sớm thì boa
    const bigTip = good && rider && rider.bigTip && this.rng.chance(rider.bigTipChance || 0) ? rider.bigTip : 0;
    const earlyTip = good && rider && rider.earlyTip && elapsed <= o.allowedMin * 0.8 ? rider.earlyTip : 0;
    addTip(pay, bigTip + earlyTip);
    // thu hộ: khách nhận hàng thì trả lại tiền hàng tài xế đã ứng; hàng hỏng bị từ chối thì mất luôn
    pay.cod = o.codPaid && !ev.refused ? o.cod : 0;
    const codLost = o.codPaid && ev.refused ? o.cod : 0;
    const receipt = { order: o, ev, pay, elapsed, at: now, noPay, bigTip, earlyTip, codLost };
    this.history.push(receipt);
    this.order = null;
    this.go(S.IDLE);
    this.schedulePing(now);
    this.emit('completed', { receipt });
    return receipt;
  }

  // Khách xe ôm sợ quá đòi xuống giữa đường: trả tiền theo quãng đã đi, 1 sao
  quitRide(now, pos) {
    const o = this.order;
    if (this.state !== S.DELIVERING || !o || o.kind !== 'ride') return null;
    const traveled = Math.max(0, Math.min(1, 1 - routeDist(pos, o.dropoff.door) / Math.max(1, o.d2)));
    const conditionPct = o.items.length ? o.items[0].condition : 0;
    const ev = { refused: false, quit: true, stars: 1, conditionPct, timeRatio: o.allowedMin > 0 ? (now - o.acceptedAt) / o.allowedMin : 0, penalties: [{ label: fmt('pen.quit'), value: 4 }], reasons: Object.entries(o.items[0]?.reasons || {}).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]) };
    const pay = computePayout({ baseFare: o.baseFare, distanceKm: o.distanceKm, litersUsed: o.liters, stars: 1, farePct: traveled, surcharge: o.surcharge, viaApp: o.viaApp });
    pay.cod = 0;
    const receipt = { order: o, ev, pay, elapsed: now - o.acceptedAt, at: now, quit: true, traveled };
    this.history.push(receipt);
    this.order = null;
    this.go(S.IDLE);
    this.schedulePing(now);
    this.emit('completed', { receipt });
    return receipt;
  }

  cancel(reason, now, { byDriver = true, comp = 0 } = {}) {
    const o = this.order;
    if (!o) return false;
    this.order = null;
    // Từ PACKING không hủy được (đang xếp hàng) — chuyển qua DELIVERING trước
    if (this.state === S.PACKING) this.go(S.DELIVERING);
    this.go(S.IDLE);
    this.schedulePing(now);
    // hủy khi đang giữ hàng COD: app thu hồi hàng và hoàn tiền đã ứng
    this.emit('cancelled', { order: o, reason, byDriver, comp, codRefund: o.codPaid ? o.cod : 0, now });
    return true;
  }

  // ---------- vật lý món hàng ----------
  tickItems(env, dtMin) {
    if (!this.hasCargo) return;
    for (const it of this.order.items) it.tick(env, dtMin);
  }
  itemEvent(type, mag, env) {
    if (!this.hasCargo) return;
    const o = this.order;
    for (const it of o.items) it.event(type, mag, env);
    // khách say gặp xóc mạnh thì ói ra xe: mệt tinh thần + tiền rửa xe (mỗi chuyến tối đa 1 lần)
    const rider = this.riderOf(o);
    if (type === 'bump' && this.state === S.DELIVERING && rider && rider.vomitChance && !o.vomited && mag > 0.15 && this.rng.chance(rider.vomitChance)) {
      o.vomited = true;
      this.gs.addEnergy(0, -(rider.vomitMental || 0));
      if (rider.vomitCost) this.gs.spend(rider.vomitCost, 'cleaning', true);
      this.emit('vomit', { order: o, cost: rider.vomitCost || 0, mental: rider.vomitMental || 0 });
    }
  }
  addFuel(liters) {
    if (this.order) this.order.liters += liters;
  }
}
