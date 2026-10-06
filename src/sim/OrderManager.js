// =============================================================
// QUẢN LÝ ĐƠN HÀNG (OrderManager) — máy trạng thái, không phụ thuộc Three.js/DOM.
//
//  OFFLINE ─bật app→ IDLE ─có đơn→ OFFERED ─nhận→ TO_PICKUP
//     ▲                ▲   └─từ chối/hết giờ─┘        │
//     └──tắt app───────┤                              ├─(đồ ăn) tới quán→ WAITING_FOOD ─xong→ PACKING ─xếp xong→ DELIVERING
//                      │                              │        └→ OUT_OF_STOCK ─đổi món/nấu thêm→ WAITING_FOOD
//                      │                              └─(xe ôm) đón khách──────────────────────────────→ DELIVERING
//                      │   DELIVERING ─tới nơi→ AT_DROPOFF ─giao→ IDLE (chấm sao + trả tiền)
//                      │                          ├→ NO_ANSWER ─gọi được/chờ→ AT_DROPOFF · hỏi hàng xóm→ DELIVERING (đổi chỗ)
//                      │                          └→ STAIRS (thang máy hư) ─leo bộ/gọi khách xuống→ AT_DROPOFF
//                      └──── hủy đơn (từ hầu hết trạng thái) ─────────────────────────────────────────────────┘
// =============================================================
import { ITEMS } from '../data/items.js';
import { ORDER, DIST, TIME, ECONOMY } from '../data/balance.js';
import { CUSTOMER_NAMES } from '../data/places.js';
import { DeliveryItem } from './ItemPhysics.js';
import { evaluateOrder } from './OrderCondition.js';
import { computePayout, estimatePay } from './economy.js';
import { manhattan } from './cityLayout.js';
import { fmt } from '../content/index.js';
import { isOpen, orderWeight } from './placeRules.js';

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
});

export const TRANSITIONS = {
  OFFLINE: ['IDLE'],
  IDLE: ['OFFERED', 'OFFLINE'],
  OFFERED: ['IDLE', 'TO_PICKUP'],
  TO_PICKUP: ['WAITING_FOOD', 'OUT_OF_STOCK', 'DELIVERING', 'IDLE'],
  WAITING_FOOD: ['PACKING', 'IDLE'],
  OUT_OF_STOCK: ['WAITING_FOOD', 'IDLE'],
  PACKING: ['DELIVERING'],
  DELIVERING: ['AT_DROPOFF', 'IDLE'],
  AT_DROPOFF: ['NO_ANSWER', 'STAIRS', 'DELIVERING', 'IDLE'],
  NO_ANSWER: ['AT_DROPOFF', 'DELIVERING', 'IDLE'],
  STAIRS: ['AT_DROPOFF', 'IDLE'],
};

// Nhãn hiển thị cho từng trạng thái (kho chữ: state.*)
export const stateLabel = (st) => fmt(`state.${st}`);

const CARGO_STATES = new Set([S.DELIVERING, S.AT_DROPOFF, S.NO_ANSWER, S.STAIRS]);

export class OrderManager {
  constructor({ rng, layout, gs }) {
    this.rng = rng;
    this.layout = layout;
    this.gs = gs;
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

  schedulePing(now) {
    const h = now / 60;
    const peak = (h >= 11 && h < 13) || (h >= 17 && h < 19.5);
    this.nextPingIn = this.rng.range(...ORDER.pingGap) * (peak ? 0.6 : 1);
  }

  // dtMin: phút game, dtSec: giây thật (đếm ngược thẻ đơn theo thời gian thật)
  update(dtMin, dtSec, now, pos) {
    if (this.state === S.IDLE) {
      if (now >= TIME.lastOfferAt) return;
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
        this.go(S.IDLE);
        this.schedulePing(now);
        this.emit('offerExpired', { offer });
      }
    }
  }

  // ---------- tạo đơn ----------
  canCarry(def) {
    if (def.traits.includes('cold')) return this.gs.bagSpec.insulation >= 0.5;
    if (def.traits.includes('passenger')) return this.gs.effect('passengerSeat');
    return true;
  }

  makeOffer(now, pos = { x: 0, z: 0 }) {
    const gs = this.gs;
    // Đơn cốt truyện: lần đầu có mũ cho khách → đơn chở anh Minh
    const canRide = gs.effect('passengerSeat');
    if (gs.flags.wallet === 0 && canRide) return this.makeRide(pos, true, now);
    if (canRide && this.rng.chance(ORDER.rideChance)) return this.makeRide(pos, false, now);

    // chỉ quán đang mở cửa mới có đơn
    const options = this.layout.places
      .filter((p) => p.kind === 'restaurant' && isOpen(p, now) && (p.menu || []).length)
      .map((r) => ({ r, menu: r.menu.filter((id) => this.canCarry(ITEMS[id])) }))
      .filter((o) => o.menu.length);
    if (!options.length) return null;
    const weights = options.map((o) => (o.menu.some((id) => ITEMS[id].traits.includes('cold')) ? 1.6 : 1) / (40 + manhattan(pos, o.r.door)));
    const { r, menu } = this.rng.weighted(options, weights);
    const n = this.rng.chance(ORDER.twoItemChance) ? 2 : 1;
    const itemIds = Array.from({ length: n }, () => this.rng.pick(menu));
    const dropoff = this.pickDropoff(r.door, true, now, 'foodWeight', r.id);
    const pickup = { placeId: r.id, name: r.name, address: r.address, door: r.door };
    return this.buildOrder('food', pickup, dropoff, itemIds, pos);
  }

  // Địa điểm (karaoke, nhà sách…) được đánh dấu làm điểm đến của đơn, theo trọng số + khung giờ.
  // Trả về null nếu lần này không chọn địa điểm nào.
  placeDestination(key, now, excludeId = null, scale = 1) {
    const cands = this.layout.places.filter((p) => p.id !== excludeId).map((p) => ({ p, w: orderWeight(p, key, now) })).filter((c) => c.w > 0);
    const W = cands.reduce((s, c) => s + c.w, 0);
    if (!W || !this.rng.chance((W / (W + ORDER.placeDestBase)) * scale)) return null;
    const { p } = this.rng.weighted(cands, cands.map((c) => c.w));
    return { placeId: p.id, name: p.name, address: p.name, door: p.door, apartment: false };
  }

  makeRide(pos, story, now = 0) {
    const market = this.layout.placeById.market;
    let pickup;
    if (story) pickup = { placeId: 'market', name: market.name, address: market.address, door: market.door };
    else if ((pickup = this.placeDestination('rideWeight', now, null, 0.5))) {
      // khách xuất phát từ một địa điểm (vd. hát karaoke xong về nhà)
    } else {
      const near = this.layout.lots.filter((l) => {
        const d = manhattan(pos, l.door);
        return d > 40 && d < 180;
      });
      const l = this.rng.pick(near.length ? near : this.layout.lots);
      pickup = { name: l.address, address: l.address, door: l.door, lotKey: l.key };
    }
    const dropoff = this.pickDropoff(pickup.door, false, now, pickup.placeId ? null : 'rideWeight', pickup.placeId);
    const o = this.buildOrder('ride', pickup, dropoff, ['passenger'], pos);
    o.flags.vague = false;
    o.flags.noAnswer = false;
    o.revealed = true;
    if (story) {
      o.story = 'wallet';
      o.customer = 'Anh Minh';
      o.flags.picky = false;
    }
    return o;
  }

  // destKey: 'foodWeight' | 'rideWeight' | null — cho phép giao tới địa điểm được đánh dấu
  pickDropoff(from, allowApartment = true, now = 0, destKey = null, excludeId = null) {
    if (destKey) {
      const place = this.placeDestination(destKey, now, excludeId);
      if (place) return place;
    }
    const apt = this.layout.placeById.apartment;
    if (allowApartment && this.rng.chance(ORDER.apartmentChance)) {
      return { name: apt.name, address: fmt('addr.apartment', { name: apt.name, address: apt.address }), door: apt.door, apartment: true, floor: this.rng.int(3, 11) };
    }
    const [a, b] = ORDER.dropDist;
    let cands = this.layout.lots.filter((l) => {
      const d = manhattan(from, l.door);
      return d >= a && d <= b;
    });
    if (!cands.length) cands = this.layout.lots;
    const l = this.rng.pick(cands);
    return { name: l.address, address: l.address, door: l.door, apartment: false, lotKey: l.key };
  }

  buildOrder(kind, pickup, dropoff, itemIds, pos) {
    const rng = this.rng;
    const defs = itemIds.map((id) => ITEMS[id]);
    const d1 = manhattan(pos, pickup.door);
    const d2 = manhattan(pickup.door, dropoff.door);
    const distanceKm = Math.round((d2 * DIST.displayPerUnit) / 100) / 10;
    const baseFare = Math.max(...defs.map((d) => d.base)) + (defs.length - 1) * ECONOMY.extraItemFare;
    const named = !!dropoff.placeId; // giao tới địa điểm có tên → không mơ hồ, khách có mặt
    const vague = kind === 'food' && !dropoff.apartment && !named && rng.chance(ORDER.vagueChance);
    const o = {
      id: ++this.orderSeq,
      kind,
      story: null,
      pickup,
      dropoff,
      itemIds,
      items: [],
      customer: rng.pick(CUSTOMER_NAMES),
      baseFare,
      distanceKm,
      d1,
      d2,
      estPay: estimatePay(baseFare, distanceKm),
      flags: {
        vague,
        noAnswer: kind === 'food' && !dropoff.apartment && !named && rng.chance(ORDER.noAnswerChance),
        picky: rng.chance(ORDER.pickyChance),
        outOfStock: kind === 'food' && rng.chance(ORDER.outOfStockChance),
        liftBroken: !!dropoff.apartment && rng.chance(ORDER.liftBrokenChance),
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
    };
    if (vague) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(6, 16);
      o.zone = { x: dropoff.door.x + Math.cos(a) * r, z: dropoff.door.z + Math.sin(a) * r, r: 26 };
    }
    return o;
  }

  accept(now, pos = null) {
    if (this.state !== S.OFFERED || !this.offer) return null;
    const o = this.offer;
    this.offer = null;
    if (pos) o.d1 = manhattan(pos, o.pickup.door);
    o.acceptedAt = now;
    const prep = o.kind === 'food' ? ORDER.prepAllowance : 2;
    o.allowedMin = Math.round((o.d1 + o.d2) / ORDER.planSpeed + prep + ORDER.slack);
    this.order = o;
    this.go(S.TO_PICKUP);
    this.emit('accepted', { order: o });
    return o;
  }

  decline(now = 0) {
    if (this.state !== S.OFFERED) return false;
    const offer = this.offer;
    this.offer = null;
    this.go(S.IDLE);
    this.schedulePing(now);
    this.emit('declined', { offer });
    return true;
  }

  // ---------- ở quán ----------
  arriveAtPickup(now) {
    const o = this.order;
    if (this.state !== S.TO_PICKUP || !o || o.kind !== 'food') return null;
    const h = now / 60;
    const peak = (h >= 11 && h < 13) || (h >= 17 && h < 19.5);
    const q = this.rng.range(...(peak ? ORDER.queuePeak : ORDER.queue));
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
      const menu = this.layout.placeById[o.pickup.placeId].menu.filter((id) => id !== o.missingItem && this.canCarry(ITEMS[id]));
      const sub = menu.length ? this.rng.pick(menu) : o.missingItem;
      o.itemIds = o.itemIds.map((id) => (id === o.missingItem ? sub : id));
      o.flags.outOfStock = false;
      o.readyAt = Math.max(o.readyAt, now) + 3;
      this.go(S.WAITING_FOOD);
      return { accepted: true, sub: ITEMS[sub] };
    }
    this.cancel(fmt('cancel.outOfStockCustomer'), now, { byDriver: false, comp: ECONOMY.cancelComp });
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
    o.items = [new DeliveryItem(ITEMS.passenger, ++this.uid)];
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
  // Trả về: 'noAnswer' | 'stairs' | 'lift' | 'ready'
  arriveAtDropoff(now) {
    const o = this.order;
    if (!o) return null;
    if (this.state === S.AT_DROPOFF) return 'ready';
    if (this.state !== S.DELIVERING) return null;
    this.go(S.AT_DROPOFF);
    if (o.flags.noAnswer && !o.noAnswerResolved) {
      this.go(S.NO_ANSWER);
      return 'noAnswer';
    }
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
      const d = manhattan(o.dropoff.door, l.door);
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

  canHandOver() {
    return this.state === S.AT_DROPOFF;
  }

  handOver(now) {
    const o = this.order;
    if (this.state !== S.AT_DROPOFF || !o) return null;
    const elapsed = now - o.acceptedAt;
    const ev = evaluateOrder({ items: o.items, elapsedMin: elapsed, allowedMin: o.allowedMin, picky: o.flags.picky, extraPenalty: o.extraPenalty });
    const pay = computePayout({ baseFare: o.baseFare, distanceKm: o.distanceKm, litersUsed: o.liters, stars: ev.stars, refused: ev.refused });
    // trang bị "boa thêm" (vd. sách giao tiếp) cho đơn 4–5 sao
    const bonus = !ev.refused && ev.stars >= 4 ? this.gs.effect('tipBonus') : 0;
    if (bonus) {
      pay.tip += bonus;
      pay.walletCredit = Math.round((pay.walletCredit + bonus) * 10) / 10;
      pay.net = Math.round((pay.net + bonus) * 10) / 10;
      pay.tipBonus = bonus;
    }
    const receipt = { order: o, ev, pay, elapsed, at: now };
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
    this.emit('cancelled', { order: o, reason, byDriver, comp });
    return true;
  }

  // ---------- vật lý món hàng ----------
  tickItems(env, dtMin) {
    if (!this.hasCargo) return;
    for (const it of this.order.items) it.tick(env, dtMin);
  }
  itemEvent(type, mag, env) {
    if (!this.hasCargo) return;
    for (const it of this.order.items) it.event(type, mag, env);
  }
  addFuel(liters) {
    if (this.order) this.order.liters += liters;
  }
}
