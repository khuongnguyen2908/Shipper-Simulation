// =============================================================
// TRẠNG THÁI NGƯỜI CHƠI (thuần dữ liệu, chạy được trong Node)
// Tiền, điểm đánh giá, thể lực, tinh thần, xăng, đồ đã mua, cờ nhiệm vụ,
// điều kiện thắng/thua.
// =============================================================
import { ECONOMY, RATING, ENERGY, VEHICLES, BAGS, TIME, WALLET_QUEST } from '../data/balance.js';
import { GOODS, EFFECTS } from '../data/goods.js';
import { isOpen } from './placeRules.js';
import { RatingBook } from './economy.js';
import { fmt } from '../content/index.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class GameState {
  constructor({ day = 1, carry = null } = {}) {
    const c = carry || {};
    this.day = day;
    this.money = c.money ?? ECONOMY.startMoney;
    this.ratingBook = new RatingBook(c.rating ?? { count: RATING.startCount, sum: RATING.startCount * RATING.startAvg });
    this.owned = c.owned ?? { vehicles: ['cub'], bags: ['nylon'], gear: [] };
    this.vehicle = c.vehicle ?? 'cub';
    this.bag = c.bag ?? 'nylon';
    this.fuel = c.fuel ?? 0.35; // lít — xe gần cạn để người chơi phải đổ xăng
    this.bikeHp = c.bikeHp ?? 100;
    this.inventory = c.inventory ?? []; // vật phẩm nhiệm vụ (ví…)
    this.consumables = { ...(c.consumables || {}) }; // đồ dùng 1 lần: mã → số lượng
    this.activityUses = {}; // số lần làm hoạt động hôm nay: 'địaĐiểm.hoạtĐộng' → lần
    const tutorialDone = day > 1;
    this.flags = {
      mounted: tutorialDone,
      refueled: tutorialDone,
      online: tutorialDone,
      wallet: 0, // 0 chưa có · 1 nhặt được ví · 2 biết tạp hóa ở đâu · 3 biết cổng xanh · 4 biết Minh ở quán cà phê · 5 đã trả · -1 giữ tiền
      ...(c.flags || {}),
    };
    this.phys = 100;
    this.mental = 100;
    this.rent = ECONOMY.rentBase + ECONOMY.rentPerDay * (day - 1);
    this.rentPaid = false;
    this.stats = { completed: 0, refused: 0, cancelled: 0, stars: [], income: {}, expense: {}, distanceKm: 0, crashes: 0, fines: 0 };
    this.outcome = null;
  }

  get rating() {
    return this.ratingBook.value;
  }
  // (dữ liệu có thể bị xóa trong ?editor → rơi về đồ khởi đầu)
  get vehicleSpec() {
    return VEHICLES[this.vehicle] || VEHICLES.cub;
  }
  get bagSpec() {
    return BAGS[this.bag] || BAGS.nylon;
  }
  // Túi khi chở hàng: cộng thêm đệm từ trang bị (tối đa 90%)
  get cargoBag() {
    const b = this.bagSpec;
    const extra = this.effect('paddingPct') / 100;
    return extra ? { ...b, padding: Math.min(0.9, b.padding + extra) } : b;
  }
  // Đã sở hữu trang bị (owned.gear giữ tên cũ để bản lưu cũ vẫn đọc được)
  has(goodsId) {
    return this.owned.gear.includes(goodsId);
  }
  // Tổng tác dụng của mọi trang bị đang có (bool → true/false, số → cộng dồn)
  effect(name) {
    const kind = EFFECTS[name]?.kind;
    let sum = 0;
    for (const id of this.owned.gear) {
      const v = GOODS[id]?.type === 'equipment' ? GOODS[id].effects?.[name] : undefined;
      if (v === undefined || v === false) continue;
      if (kind === 'bool') return true;
      sum += Number(v) || 0;
    }
    return kind === 'bool' ? false : sum;
  }
  countOf(goodsId) {
    return this.consumables[goodsId] || 0;
  }
  hasItem(id) {
    return this.inventory.includes(id);
  }

  // source / reason: mã nhóm thu chi (kho chữ money.*), ví dụ 'food', 'fuel'
  earn(k, source) {
    if (!k) return;
    this.money += k;
    this.stats.income[source] = (this.stats.income[source] || 0) + k;
  }
  // force = true cho tiền phạt (có thể âm tiền)
  spend(k, reason, force = false) {
    if (!force && this.money < k) return false;
    this.money -= k;
    this.stats.expense[reason] = (this.stats.expense[reason] || 0) + k;
    return true;
  }

  addEnergy(phys = 0, mental = 0) {
    this.phys = clamp(this.phys + phys, 0, 100);
    this.mental = clamp(this.mental + mental, 0, 100);
  }

  // Tiêu hao theo hoạt động mỗi dt phút game
  // activity: 'idle' | 'walk' | 'run' | 'drive' | 'push'
  drain(activity, dt, env) {
    const P = ENERGY.phys, M = ENERGY.mental;
    let p = P[activity] ?? P.idle;
    let m = M.base;
    if (env.harshSun && env.outdoor && !this.effect('sunProtect')) p += P.sun;
    if (env.raining && env.outdoor && !this.effect('rainProtect')) {
      p += P.rain;
      m += M.rain;
    }
    if (env.inJam) m += M.jam;
    if (env.waiting) m += M.wait;
    p *= Math.max(0, 1 + this.effect('physDrainPct') / 100);
    m *= Math.max(0, 1 + this.effect('mentalDrainPct') / 100);
    this.addEnergy(-p * dt, -m * dt);
  }

  // ---------- mua bán ----------
  // category: 'vehicles' | 'bags' | 'goods' ('gear' = tên cũ của 'goods')
  buy(category, id) {
    if (category === 'gear') category = 'goods';
    const table = { vehicles: VEHICLES, bags: BAGS, goods: GOODS }[category];
    const spec = table && table[id];
    if (!spec) return { ok: false, msg: fmt('gs.noSuchItem') };
    const consumable = category === 'goods' && spec.type === 'consumable';
    const ownList = category === 'goods' ? this.owned.gear : this.owned[category];
    if (!consumable && ownList.includes(id)) return { ok: false, msg: fmt('gs.alreadyOwned') };
    if (!this.spend(spec.price, 'purchase')) return { ok: false, msg: fmt('gs.short', { k: Math.ceil(spec.price - this.money) }) };
    if (consumable) {
      this.consumables[id] = this.countOf(id) + 1;
      return { ok: true, msg: fmt('gs.bought', { name: spec.name }) };
    }
    ownList.push(id);
    if (category === 'vehicles') {
      this.vehicle = id;
      this.fuel = Math.min(this.fuel, VEHICLES[id].tank);
      this.bikeHp = 100;
    }
    if (category === 'bags') this.bag = id;
    return { ok: true, msg: fmt('gs.bought', { name: spec.name }) };
  }

  refuel() {
    const tank = this.vehicleSpec.tank;
    const need = Math.max(0, tank - this.fuel);
    if (need < 0.05) return { ok: false, msg: fmt('gs.tankFull') };
    const affordable = this.money / ECONOMY.fuelPrice;
    const liters = Math.min(need, affordable);
    if (liters < 0.05) return { ok: false, msg: fmt('gs.noFuelMoney') };
    const cost = Math.round(liters * ECONOMY.fuelPrice * 10) / 10;
    this.spend(cost, 'fuel');
    this.fuel += liters;
    this.flags.refueled = true;
    return { ok: true, liters, cost, msg: fmt('gs.refueled', { liters: liters.toFixed(2), cost }) };
  }

  repair() {
    if (this.bikeHp >= 99) return { ok: false, msg: fmt('gs.bikeOk') };
    if (!this.spend(ECONOMY.repairCost, 'repair')) return { ok: false, msg: fmt('gs.noRepairMoney') };
    this.bikeHp = 100;
    return { ok: true, msg: fmt('gs.repaired') };
  }

  // Dùng 1 đồ dùng trong túi → trả về số phút mất
  useConsumable(id) {
    const g = GOODS[id];
    if (!g || g.type !== 'consumable' || this.countOf(id) <= 0) return { ok: false, minutes: 0 };
    const u = g.use || {};
    this.consumables[id] -= 1;
    if (!this.consumables[id]) delete this.consumables[id];
    this.addEnergy(u.phys || 0, u.mental || 0);
    if (u.fuel) this.fuel = Math.min(this.vehicleSpec.tank, this.fuel + u.fuel);
    if (u.bikeHp) this.bikeHp = Math.min(100, this.bikeHp + u.bikeHp);
    return { ok: true, minutes: u.minutes || 0, name: g.name };
  }

  // Hoạt động tại địa điểm (đọc sách, hát karaoke…). Trả về lý do nếu không làm được.
  activityStatus(place, act, now) {
    if (!isOpen(place, now)) return 'closed';
    if (act.perDay > 0 && (this.activityUses[`${place.id}.${act.id}`] || 0) >= act.perDay) return 'usedUp';
    if (this.money < (act.cost || 0)) return 'money';
    return 'ok';
  }
  doActivity(place, act, now) {
    const st = this.activityStatus(place, act, now);
    if (st !== 'ok') return { ok: false, reason: st };
    if (act.cost) this.spend(act.cost, 'activity');
    const k = `${place.id}.${act.id}`;
    this.activityUses[k] = (this.activityUses[k] || 0) + 1;
    this.addEnergy(act.phys || 0, act.mental || 0);
    return { ok: true, minutes: act.minutes || 0 };
  }

  // ---------- kết quả đơn ----------
  applyReceipt(receipt) {
    const { ev, pay } = receipt;
    this.earn(pay.walletCredit, receipt.order.kind === 'ride' ? 'ride' : 'food');
    this.ratingBook.add(ev.stars);
    this.stats.stars.push(ev.stars);
    if (ev.refused) this.stats.refused += 1;
    else this.stats.completed += 1;
    this.stats.distanceKm += receipt.order.distanceKm;
    this.addEnergy(0, ENERGY.mental.stars[ev.stars]);
  }

  applyCancel({ byDriver, comp }) {
    this.stats.cancelled += 1;
    if (comp) this.earn(comp, 'cancelComp');
    if (byDriver) this.ratingBook.add(2);
    this.addEnergy(0, -ENERGY.mental.cancel);
  }

  // ---------- nhiệm vụ phụ: chiếc ví ----------
  findWallet() {
    if (this.flags.wallet !== 0) return false;
    this.flags.wallet = 1;
    this.inventory.push('wallet');
    return true;
  }
  returnWallet() {
    this.inventory = this.inventory.filter((i) => i !== 'wallet');
    this.flags.wallet = 5;
    this.flags.walletDay = this.day;
    this.earn(WALLET_QUEST.reward, 'thanks');
    this.addEnergy(10, 30);
  }
  keepWalletCash() {
    this.inventory = this.inventory.filter((i) => i !== 'wallet');
    this.flags.wallet = -1;
    this.flags.walletDay = this.day;
    this.earn(WALLET_QUEST.cash, 'walletCash');
    this.spend(WALLET_QUEST.complaintFine, 'complaint', true);
    for (const s of WALLET_QUEST.keepPenaltyStars) this.ratingBook.add(s);
    this.addEnergy(0, -35);
  }

  // ---------- thắng / thua ----------
  payRent(now) {
    if (this.rentPaid) return { ok: false, msg: fmt('gs.rentAlreadyPaid') };
    if (now >= TIME.dayEnd) return { ok: false, msg: fmt('gs.tooLate') };
    if (!this.spend(this.rent, 'rent')) return { ok: false, msg: fmt('gs.rentShort', { k: Math.ceil(this.rent - this.money) }) };
    this.rentPaid = true;
    this.outcome = { type: 'win', reason: fmt('end.win', { rent: this.rent }) };
    return { ok: true };
  }

  checkEnd(now) {
    if (this.outcome) return this.outcome;
    let reason = null;
    if (this.phys <= 0) reason = fmt('end.faint');
    else if (this.mental <= 0) reason = fmt('end.burnout');
    else if (this.rating < RATING.lockBelow) reason = fmt('end.locked', { rating: this.rating.toFixed(2), limit: RATING.lockBelow });
    else if (now >= TIME.dayEnd && !this.rentPaid) reason = fmt('end.evicted');
    if (reason) this.outcome = { type: 'lose', reason };
    return this.outcome;
  }

  // Lưu sang ngày sau (thể lực, tinh thần, cờ hướng dẫn được làm mới)
  carryOver() {
    return {
      money: this.money,
      rating: this.ratingBook.toJSON(),
      owned: this.owned,
      vehicle: this.vehicle,
      bag: this.bag,
      fuel: this.fuel,
      bikeHp: this.bikeHp,
      inventory: this.inventory,
      consumables: this.consumables,
      flags: { wallet: this.flags.wallet, walletDay: this.flags.walletDay },
    };
  }
}
