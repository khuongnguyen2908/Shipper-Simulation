// =============================================================
// TRẠNG THÁI NGƯỜI CHƠI (thuần dữ liệu, chạy được trong Node)
// Tiền, điểm đánh giá, thể lực, tinh thần, xăng, đồ đã mua, cờ nhiệm vụ,
// tiền nhà theo kỳ, ngủ / thức, kiệt sức, điều kiện thua (game chơi tự do 24h — không có "thắng").
// =============================================================
import { ECONOMY, RATING, ENERGY, VEHICLES, BAGS, WALLET_QUEST, rentFor, periodOfDay, dueDayOf } from '../data/balance.js';
import { dayStartAt, atHour } from './clock.js';
import { APP } from '../data/apps.js';
import { GOODS, EFFECTS, OUTFIT_SLOTS, freeOutfit } from '../data/goods.js';
import { isOpen } from './placeRules.js';
import { RatingBook } from './economy.js';
import { fmt } from '../content/index.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const freshStats = () => ({ completed: 0, refused: 0, cancelled: 0, driverCancels: 0, bom: 0, stars: [], income: {}, expense: {}, distanceKm: 0, crashes: 0, fines: 0 });
// Kỳ tiền nhà mới: tiền kỳ này + nợ kỳ trước (đã cộng phạt)
const newRent = (period, debt, late) => ({ period, amount: rentFor(period), debt, paid: false, late });

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
    this.consumables = { ...(c.consumables || {}) }; // đồ dùng 1 lần + đồ mang theo (dùng tại địa điểm): mã → số lượng
    this.outfit = { ...(c.outfit || {}) }; // trang phục đang mặc: chỗ mặc → mã (trống = đồ có sẵn)
    this.activityUses = {}; // số lần làm hoạt động hôm nay: 'địaĐiểm.hoạtĐộng' → lần
    const tutorialDone = day > 1;
    this.flags = {
      mounted: tutorialDone,
      refueled: tutorialDone,
      online: tutorialDone,
      wallet: 0, // 0 chưa có · 1 nhặt được ví · 2 biết tạp hóa ở đâu · 3 biết cổng xanh · 4 biết Minh ở quán cà phê · 5 đã trả · -1 giữ tiền
      ...(c.flags || {}),
    };
    this.phys = c.phys ?? 100;
    this.mental = c.mental ?? 100;
    this.awakeSince = c.awakeSince ?? dayStartAt(day); // thức dậy lúc nào (thức quá lâu → mệt nhanh)
    // tiền nhà theo kỳ: { period, amount, debt (nợ kỳ trước + phạt), paid, late (số lần trễ liên tiếp) }
    this.rentState = c.rentState ? { ...c.rentState } : newRent(periodOfDay(day), 0, 0);
    this.stats = freshStats();
    this.events = []; // sự kiện cho giao diện: trễ tiền nhà, sang kỳ mới, bị đuổi
    // Tài khoản tài xế (giữ qua các ngày): số đơn được mời / đã nhận, các lần mời gần đây (1 nhận · 0 bỏ),
    // tổng đơn hoàn thành, số chuyến xe ôm, số lần tự hủy, số đơn bị bom
    this.account = { offers: 0, accepted: 0, recent: [], completed: 0, rides: 0, driverCancels: 0, bom: 0, ...(c.account || {}) };
    this.lockedUntil = 0; // tạm khóa nhận đơn tới phút này (tự hủy quá nhiều trong ngày)
    this.outcome = null;
  }

  // Tỉ lệ nhận đơn trong các lần mời gần đây (chưa đủ 3 lần thì coi như 100%)
  get acceptRate() {
    const r = this.account.recent;
    return r.length < 3 ? 1 : r.reduce((a, b) => a + b, 0) / r.length;
  }
  recordOffer(accepted) {
    const a = this.account;
    a.offers += 1;
    if (accepted) a.accepted += 1;
    a.recent = [...a.recent, accepted ? 1 : 0].slice(-(APP.account?.acceptWindow || 10));
  }
  recordBom() {
    this.account.bom += 1;
    this.stats.bom += 1;
  }

  get rating() {
    return this.ratingBook.value;
  }
  // Tiền nhà phải trả kỳ này (gồm nợ + phạt kỳ trước) · đã trả chưa · hạn trả
  get rent() {
    return this.rentState.amount + this.rentState.debt;
  }
  get rentPaid() {
    return this.rentState.paid;
  }
  get rentDueDay() {
    return dueDayOf(this.rentState.period);
  }
  rentDueAt() {
    return atHour(this.rentDueDay, ECONOMY.rentDueHour ?? 22);
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
  // Tổng tác dụng của mọi trang bị đang có + trang phục đang mặc (bool → true/false, số → cộng dồn)
  effect(name) {
    const kind = EFFECTS[name]?.kind;
    let sum = 0;
    const sources = [...this.owned.gear.filter((id) => GOODS[id]?.type === 'equipment'), ...Object.values(this.wornIds())];
    for (const id of sources) {
      const v = GOODS[id]?.effects?.[name];
      if (v === undefined || v === false) continue;
      if (kind === 'bool') return true;
      sum += Number(v) || 0;
    }
    return kind === 'bool' ? false : sum;
  }

  // ---------- trang phục ----------
  // Có món trang phục này chưa (giá 0 = có sẵn)
  ownsOutfit(id) {
    const g = GOODS[id];
    return !!g && g.type === 'outfit' && (g.price === 0 || this.owned.gear.includes(id));
  }
  // Mã món đang mặc ở từng chỗ (món đã mất/bị xóa → rơi về món có sẵn; không có thì bỏ trống)
  wornIds() {
    const out = {};
    for (const slot of Object.keys(OUTFIT_SLOTS)) {
      const id = this.outfit[slot];
      const ok = id && this.ownsOutfit(id) && GOODS[id].slot === slot;
      const pick = ok ? id : freeOutfit(GOODS, slot)?.id;
      if (pick) out[slot] = pick;
    }
    return out;
  }
  // Món đang mặc: chỗ mặc → dữ liệu món (dùng để dựng ngoại hình)
  wornGoods() {
    return Object.fromEntries(Object.entries(this.wornIds()).map(([slot, id]) => [slot, GOODS[id]]));
  }
  wear(id) {
    if (!this.ownsOutfit(id)) return false;
    this.outfit[GOODS[id].slot] = id;
    return true;
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
  // activity: 'idle' | 'walk' | 'run' | 'drive' | 'push' · 'sleep' (ngủ: hồi lại) · 'rest' (nằm bắt buộc khi kiệt sức: không đổi)
  // env.now (phút tuyệt đối): để tính thức quá lâu
  drain(activity, dt, env) {
    if (activity === 'sleep') {
      const S = ENERGY.sleep;
      this.addEnergy((S.physPerHour / 60) * dt, (S.mentalPerHour / 60) * dt);
      return;
    }
    if (activity === 'rest') return;
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
    const tired = this.tiredMul(env.now);
    this.addEnergy(-p * dt * tired, -m * dt * tired);
  }

  // ---------- ngủ / thức ----------
  // Số giờ đã thức
  awakeHours(now) {
    return now == null ? 0 : Math.max(0, (now - this.awakeSince) / 60);
  }
  // Thức quá lâu → hao nhanh hơn (1 · tiredMul · veryTiredMul)
  tiredMul(now) {
    const S = ENERGY.sleep, h = this.awakeHours(now);
    return h > S.veryTiredAfterH ? S.veryTiredMul : h > S.tiredAfterH ? S.tiredMul : 1;
  }
  // 0 tỉnh táo · 1 buồn ngủ · 2 rất buồn ngủ (để hiện trên màn hình)
  tiredLevel(now) {
    const S = ENERGY.sleep, h = this.awakeHours(now);
    return h > S.veryTiredAfterH ? 2 : h > S.tiredAfterH ? 1 : 0;
  }
  wake(now) {
    this.awakeSince = now;
  }
  // Kiệt sức: 'faint' (thể lực về 0) · 'burnout' (tinh thần về 0) · null
  get collapsed() {
    return this.phys <= 0 ? 'faint' : this.mental <= 0 ? 'burnout' : null;
  }
  // Sau khi nằm nghỉ bắt buộc: trả tiền thuốc (ngất), hồi thanh về mức tối thiểu
  recoverCollapse(kind) {
    const C = ENERGY.collapse;
    let fee = 0;
    if (kind === 'faint') {
      fee = Math.min(Math.max(0, this.money), ECONOMY.faintFee || 0);
      if (fee) this.spend(fee, 'medical');
    }
    if (this.phys <= 0 || kind === 'faint') this.phys = Math.max(this.phys, C.phys);
    if (this.mental <= 0 || kind === 'burnout') this.mental = Math.max(this.mental, C.mental);
    return { fee, hours: C.hours };
  }

  // Sang ngày mới (06:00): làm mới số liệu theo ngày
  startDay(day) {
    this.day = day;
    this.activityUses = {};
    this.stats = freshStats();
  }

  // ---------- mua bán ----------
  // category: 'vehicles' | 'bags' | 'goods' ('gear' = tên cũ của 'goods')
  buy(category, id) {
    if (category === 'gear') category = 'goods';
    const table = { vehicles: VEHICLES, bags: BAGS, goods: GOODS }[category];
    const spec = table && table[id];
    if (!spec) return { ok: false, msg: fmt('gs.noSuchItem') };
    // đồ dùng 1 lần và đồ "dùng tại địa điểm" mua được nhiều cái (đếm số lượng)
    const stack = category === 'goods' && (spec.type === 'consumable' || spec.type === 'carry');
    const ownList = category === 'goods' ? this.owned.gear : this.owned[category];
    if (!stack && (ownList.includes(id) || this.ownsOutfit(id))) return { ok: false, msg: fmt('gs.alreadyOwned') };
    if (!this.spend(spec.price, 'purchase')) return { ok: false, msg: fmt('gs.short', { k: Math.ceil(spec.price - this.money) }) };
    if (stack) {
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
    if (!isOpen(place, now, this.day)) return 'closed';
    if (act.perDay > 0 && (this.activityUses[`${place.id}.${act.id}`] || 0) >= act.perDay) return 'usedUp';
    if (act.needs && this.countOf(act.needs.id) < (act.needs.qty || 1)) return 'needItem';
    if (this.money < (act.cost || 0)) return 'money';
    return 'ok';
  }
  doActivity(place, act, now) {
    const st = this.activityStatus(place, act, now);
    if (st !== 'ok') return { ok: false, reason: st };
    if (act.cost) this.spend(act.cost, 'activity');
    if (act.needs) {
      // dùng hết đồ mang theo (vd thắp nhang ở chùa)
      this.consumables[act.needs.id] -= act.needs.qty || 1;
      if (this.consumables[act.needs.id] <= 0) delete this.consumables[act.needs.id];
    }
    const k = `${place.id}.${act.id}`;
    this.activityUses[k] = (this.activityUses[k] || 0) + 1;
    this.addEnergy(act.phys || 0, act.mental || 0);
    return { ok: true, minutes: act.minutes || 0 };
  }

  // ---------- kết quả đơn ----------
  applyReceipt(receipt) {
    const { ev, pay, order } = receipt;
    // thu nhập ghi theo loại đơn (money.food, money.ride, money.parcel, money.express…)
    this.earn(pay.walletCredit, order.type || order.kind);
    if (pay.cod) this.earn(pay.cod, 'codBack'); // khách trả lại tiền hàng đã ứng
    // khách quen gọi thẳng (không qua app) không chấm sao trên app
    if (order.viaApp !== false) this.ratingBook.add(ev.stars);
    this.stats.stars.push(ev.stars);
    if (ev.refused) this.stats.refused += 1;
    else this.stats.completed += 1;
    if (!ev.refused && !receipt.quit) {
      this.account.completed += 1;
      if (order.kind === 'ride') this.account.rides += 1;
    }
    this.stats.distanceKm += order.distanceKm;
    this.addEnergy(0, ENERGY.mental.stars[ev.stars]);
  }

  // now: phút lúc hủy (để tính tạm khóa). Trả về { locked } nếu bị tạm khóa nhận đơn.
  applyCancel({ byDriver, comp, codRefund = 0 }, now = 0) {
    const acc = APP.account || {};
    this.stats.cancelled += 1;
    if (comp) this.earn(comp, 'cancelComp');
    if (codRefund) this.earn(codRefund, 'codRefund');
    this.addEnergy(0, -ENERGY.mental.cancel);
    if (!byDriver) return { locked: false };
    this.ratingBook.add(acc.cancelStars ?? 2);
    this.stats.driverCancels += 1;
    this.account.driverCancels += 1;
    if (acc.cancelLimitPerDay != null && this.stats.driverCancels > acc.cancelLimitPerDay) {
      this.lockedUntil = now + (acc.cancelLockMin || 0);
      return { locked: true, until: this.lockedUntil };
    }
    return { locked: false };
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

  // ---------- tiền nhà theo kỳ / thua ----------
  // Trả đủ tiền nhà kỳ này (trả sớm lúc nào cũng được)
  payRent() {
    if (this.rentPaid) return { ok: false, msg: fmt('gs.rentAlreadyPaid', { day: this.rentDueDay }) };
    const owed = this.rent;
    if (!this.spend(owed, 'rent')) return { ok: false, msg: fmt('gs.rentShort', { k: Math.ceil(owed - this.money) }) };
    this.rentState = { ...this.rentState, paid: true, debt: 0, late: 0 };
    return { ok: true, paid: owed };
  }

  // Qua hạn trả: đã trả → sang kỳ mới; chưa trả → trễ (phạt, nợ dồn kỳ sau); trễ đủ maxLate lần liên tiếp → bị đuổi
  tickRent(now) {
    const out = [];
    while (!this.outcome && now >= this.rentDueAt()) {
      const r = this.rentState;
      if (r.paid) {
        this.rentState = newRent(r.period + 1, 0, 0);
        out.push({ type: 'newPeriod', rent: this.rent, dueDay: this.rentDueDay });
        continue;
      }
      const late = r.late + 1;
      if (late >= (ECONOMY.maxLate ?? 2)) {
        this.outcome = { type: 'lose', reason: fmt('end.evicted', { n: late }) };
        out.push({ type: 'evicted', late });
        break;
      }
      const owed = r.amount + r.debt;
      const debt = Math.round(owed * (1 + (ECONOMY.lateFeePct ?? 0)));
      this.rentState = newRent(r.period + 1, debt, late);
      out.push({ type: 'late', owed, fine: debt - owed, rent: this.rent, dueDay: this.rentDueDay, late });
    }
    this.events.push(...out);
    return out;
  }
  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // Thua chỉ khi bị đuổi khỏi phòng (trễ tiền nhà) hoặc bị khóa tài khoản (điểm thấp)
  checkEnd(now) {
    if (this.outcome) return this.outcome;
    this.tickRent(now);
    if (!this.outcome && this.rating < APP.account.lockBelow) this.outcome = { type: 'lose', reason: fmt('end.locked', { rating: this.rating.toFixed(2), limit: Number(APP.account.lockBelow).toFixed(1) }) };
    return this.outcome;
  }

  // Lưu game (tiền, đồ, điểm, tiền nhà, thể lực/tinh thần, giờ thức dậy, cờ nhiệm vụ)
  carryOver() {
    return {
      phys: this.phys,
      mental: this.mental,
      awakeSince: this.awakeSince,
      rentState: { ...this.rentState },
      money: this.money,
      rating: this.ratingBook.toJSON(),
      owned: this.owned,
      vehicle: this.vehicle,
      bag: this.bag,
      fuel: this.fuel,
      bikeHp: this.bikeHp,
      inventory: this.inventory,
      consumables: this.consumables,
      outfit: this.outfit,
      account: this.account,
      flags: { wallet: this.flags.wallet, walletDay: this.flags.walletDay },
    };
  }
}
