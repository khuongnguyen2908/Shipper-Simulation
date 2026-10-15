// =============================================================
// TRẠNG THÁI NGƯỜI CHƠI (thuần dữ liệu, chạy được trong Node)
// Tiền, điểm đánh giá, thể lực, tinh thần, xăng, đồ đã mua, cờ nhiệm vụ,
// tiền nhà theo kỳ, ngủ / thức, kiệt sức, điều kiện thua (game chơi tự do 24h — không có "thắng").
// =============================================================
import { ECONOMY, RATING, ENERGY, VEHICLES, BAGS, WALLET_QUEST, NIGHT, PARKING, rentFor, periodOfDay, dueDayOf } from '../data/balance.js';
import { dayStartAt, atHour, isDark } from './clock.js';
import { APP, BRANDS } from '../data/apps.js';
import { GOODS, EFFECTS, OUTFIT_SLOTS, freeOutfit, isAccessorySlot, startPicks, canWearOutfit } from '../data/goods.js';
import { isOpen } from './placeRules.js';
import { RatingBook } from './economy.js';
import { fmt } from '../content/index.js';
import { hairFor, HAIR_COLORS, PLAYER_SKINS } from './people.js';
import { PARK_SLOTS } from './garage.js';
import { freshStory, storyEvent, storyPick, chapterNo, resumeNewChapters } from './story.js';

const MSG_KEEP = 60; // mỗi cuộc trò chuyện giữ tối đa bấy nhiêu tin (cũ hơn thì bỏ)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const NAME_MAX = 20;
// Hồ sơ shipper (đặt khi Chơi mới): tên, giới tính 'm' | 'f', kiểu tóc, màu tóc, màu da.
// Thiếu / hỏng → tên mặc định, nam, tóc theo giới tính, tóc đen, da sáng (bản lưu cũ vẫn mở được)
export function normProfile(p) {
  const name = String(p?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  const gender = p?.gender === 'f' ? 'f' : 'm';
  return {
    name: name || fmt('profile.defaultName'),
    gender,
    hairStyle: hairFor(gender, p?.hairStyle), // kiểu của giới tính kia (bản lưu cũ) → kiểu gần nhất; chưa chọn → kiểu đầu danh sách
    hair: HAIR_COLORS.includes(p?.hair) ? p.hair : HAIR_COLORS[0],
    skin: PLAYER_SKINS.includes(p?.skin) ? p.skin : PLAYER_SKINS[1],
  };
}
const freshStats = () => ({ completed: 0, refused: 0, cancelled: 0, driverCancels: 0, bom: 0, stars: [], income: {}, expense: {}, distanceKm: 0, crashes: 0, fines: 0 });
// Đồng phục của hãng (goods.json: trang phục ô "uniform", brand = mã hãng)
export const uniformOf = (brand) => (brand ? Object.values(GOODS).find((g) => g.type === 'outfit' && g.slot === 'uniform' && g.brand === brand) || null : null);
const freshAccount = () => ({ offers: 0, accepted: 0, recent: [], completed: 0, rides: 0, driverCancels: 0, bom: 0 });
const freshRating = () => new RatingBook({ count: RATING.startCount, sum: RATING.startCount * RATING.startAvg });
// Xe khởi đầu (xe đạp): chưa vào hãng thì chưa chạy đơn được
export const START_VEHICLE = 'xeDap';
// Xe mới (mua / hãng cấp) có sẵn bấy nhiêu phần bình xăng / pin
const NEW_TANK = 0.15;
// Kỳ tiền nhà mới: tiền kỳ này + nợ kỳ trước (đã cộng phạt)
const newRent = (period, debt, late) => ({ period, amount: rentFor(period), debt, paid: false, late });

export class GameState {
  constructor({ day = 1, carry = null } = {}) {
    const c = carry || {};
    this.day = day;
    this.profile = normProfile(c.profile);
    this.money = c.money ?? ECONOMY.startMoney;
    this.ratingBook = c.rating ? new RatingBook(c.rating) : freshRating();
    // bản lưu trước khi có hãng (có đồ nhưng chưa có ô brand): coi như đang chạy GoShip bằng Cub, chưa đặt cọc
    const oldSave = !!c.owned && c.brand === undefined;
    this.owned = c.owned ? { ...c.owned, vehicles: [...c.owned.vehicles] } : { vehicles: [START_VEHICLE], bags: ['nylon'], gear: [] };
    if (VEHICLES[START_VEHICLE] && !this.owned.vehicles.includes(START_VEHICLE)) this.owned.vehicles.unshift(START_VEHICLE);
    this.vehicle = c.vehicle ?? START_VEHICLE;
    this.bag = c.bag ?? 'nylon';
    // hãng đang chạy (null = chưa vào hãng) · xe hãng cấp (nghỉ hãng thì trả lại) · tiền cọc đã đặt (nghỉ thì hoàn)
    this.brand = oldSave ? 'goship' : c.brand ?? null;
    this.companyVehicle = oldSave ? null : c.companyVehicle ?? null;
    this.depositPaid = c.depositPaid ?? 0;
    // trạng thái riêng từng xe: fuel (lít xăng / kWh pin), hp (độ bền %), maintKm (km từ lần thay nhớt / đổi pin)
    this.vstate = {};
    for (const [id, v] of Object.entries(c.vstate || {})) this.vstate[id] = { ...v };
    if (!c.vstate && c.owned) this.vstate[this.vehicle] = { fuel: c.fuel ?? 0, hp: c.bikeHp ?? 100, maintKm: c.oilKm ?? 0 }; // bản lưu cũ: 1 bộ số chung
    this.odoKm = c.odoKm ?? 0; // đồng hồ km: tổng quãng đường đã chạy (mọi xe)
    this.inventory = c.inventory ?? []; // vật phẩm nhiệm vụ (ví…)
    this.consumables = { ...(c.consumables || {}) }; // đồ dùng 1 lần + đồ mang theo (dùng tại địa điểm): mã → số lượng
    this.outfit = { ...(c.outfit || {}) }; // trang phục đang mặc: chỗ mặc → mã (trống = đồ có sẵn; phụ kiện null = đã tháo)
    // bản lưu cũ: giày từng là trang bị (mua là có tác dụng) → nay là trang phục; đã mua thì tự mang vào
    for (const slot of Object.keys(OUTFIT_SLOTS)) {
      if (isAccessorySlot(slot) || this.outfit[slot] !== undefined) continue;
      const own = this.owned.gear.find((id) => GOODS[id]?.type === 'outfit' && GOODS[id].slot === slot);
      if (own) this.outfit[slot] = own;
    }
    // Đồ chọn lúc tạo nhân vật (goods.json start): chỉ có món đã chọn (ghi vào owned.gear). Chưa có món nào của chỗ mặc đó
    // (bản lưu cũ, chơi mới không qua màn tạo nhân vật) → có món đầu tiên như trước đây.
    for (const slot of Object.keys(OUTFIT_SLOTS)) {
      const picks = startPicks(GOODS, slot), gear = this.owned.gear;
      if (!picks.length) continue;
      const chosen = this.outfit[slot];
      if (picks.some((g) => g.id === chosen) && !gear.includes(chosen)) gear.push(chosen);
      if (!picks.some((g) => gear.includes(g.id))) gear.push(picks[0].id);
    }
    this.activityUses = {}; // số lần làm hoạt động hôm nay: 'địaĐiểm.hoạtĐộng' → lần
    // đậu xe (src/sim/parking.js): parked = lần đậu hiện tại { since, safe, ticketed, robbed } (null khi đang chạy xe)
    // towed = xe bị cẩu về bãi { placeId, fee } — chuộc rồi mới lấy được (lưu qua các lần chơi)
    this.parked = null;
    this.towed = c.towed ?? null;
    // phạt nguội (nộp ở đồn công an): [{ amount, reason, at (lúc bị phạt), dueAt (phút tuyệt đối), overdue }]
    this.fines = (c.fines || []).map((f) => ({ ...f }));
    const tutorialDone = day > 1;
    this.flags = {
      mounted: tutorialDone,
      refueled: tutorialDone,
      online: tutorialDone,
      wallet: 0, // 0 chưa có · 1 nhặt được ví · 2 biết tạp hóa ở đâu · 3 biết cổng xanh · 4 biết Minh ở quán cà phê · 5 đã trả · -1 giữ tiền
      // mở đầu: 0 vừa xuống bến xe buýt, đi tìm nhà trọ · 1 Cô Hai đã cho xe đạp, chưa leo lên · 2 đã leo lên xe (đi đăng ký hãng)
      // bản lưu cũ (có carry mà chưa có ô này) coi như đã xong mở đầu
      story: carry ? 2 : 0,
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
    this.account = { ...freshAccount(), ...(c.account || {}) };
    this.lockedUntil = 0; // tạm khóa nhận đơn tới phút này (tự hủy quá nhiều trong ngày)
    // hợp đồng đã ký với các hãng: mã hãng → { sig (ảnh chữ ký), day, at (phút tuyệt đối) } — hiện ở app Hồ sơ
    this.contracts = { ...(c.contracts || {}) };
    this.gifted = c.gifted ?? null; // đã nhận quà vào hãng của hãng nào (bản lưu cũ chưa có → tặng bù 1 lần)
    // Tin nhắn (app Tin nhắn): mỗi người gửi 1 cuộc trò chuyện { name?, icon?, msgs: [{ key | text, params, loc, me, at }], unread, replies }
    this.inbox = c.inbox ? JSON.parse(JSON.stringify(c.inbox)) : { threads: {} };
    // Cốt truyện (src/sim/story.js): chơi mới → chương 1 chờ bắt đầu; bản lưu cũ (đã qua mở đầu) → coi như xong
    this.story = c.story ? JSON.parse(JSON.stringify(c.story)) : freshStory(this.flags.story === 0 && !this.brand);
    resumeNewChapters(this.story); // xong chương 1 từ hồi chưa có chương 2 → vào chương 2
    this.ensureUniform(); // bản lưu cũ đã ở hãng mà chưa có đồng phục → cấp + mặc sẵn
    if (this.brand && this.gifted !== this.brand) this.giveBrandGifts(this.brand);
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
    return VEHICLES[this.vehicle] || VEHICLES[START_VEHICLE] || VEHICLES.cub;
  }
  // Loại xe đang dùng: 'gas' (xăng) · 'electric' (điện) · 'pedal' (xe đạp)
  get power() {
    return this.vehicleSpec.power || 'gas';
  }
  // Xe đang dùng bắt buộc đội mũ bảo hiểm không (xe máy, xe điện: có · xe đạp thường: không)
  get helmetRequired() {
    return this.power !== 'pedal';
  }
  // Đang chạy xe bắt buộc đội mũ mà đầu trần → CSGT bắt (game.js / interactions.js policeStop, patrolStop)
  get noHelmet() {
    return this.helmetRequired && !this.wornIds().helmet;
  }
  // Số liệu riêng của một xe (mặc định xe đang dùng). Xăng / pin, độ bền, km bảo dưỡng không dùng chung giữa các xe.
  vs(id = this.vehicle) {
    return (this.vstate[id] ||= { fuel: 0, hp: 100, maintKm: 0 });
  }
  get fuel() {
    return this.vs().fuel;
  }
  set fuel(v) {
    this.vs().fuel = v;
  }
  get bikeHp() {
    return this.vs().hp;
  }
  set bikeHp(v) {
    this.vs().hp = v;
  }
  get maintKm() {
    return this.vs().maintKm;
  }
  set maintKm(v) {
    this.vs().maintKm = v;
  }
  // Xe mới vào tay (mua / hãng cấp): đầy độ bền, nhớt / pin mới, ít xăng / pin
  newVehicleState(id) {
    this.vstate[id] = { fuel: (VEHICLES[id]?.tank || 0) * NEW_TANK, hp: 100, maintKm: 0 };
  }

  // ---------- hãng xe công nghệ ----------
  get brandSpec() {
    return BRANDS[this.brand] || null;
  }
  // Có nhận đơn được không: null = được · 'noBrand' chưa vào hãng · 'wrongVehicle' xe không đúng loại hãng yêu cầu
  workBlock() {
    const b = this.brandSpec;
    if (!b) return 'noBrand';
    if (this.power !== (b.power || 'gas')) return 'wrongVehicle';
    if (!this.wearingUniform()) return 'noUniform';
    return null;
  }
  // Vào hãng: đặt cọc, nhận xe hãng. Đang ở hãng khác → đổi hãng = cày lại từ đầu
  // (trả xe hãng cũ + hoàn cọc; điểm đánh giá, số đơn, tỉ lệ nhận đơn về như người mới; tiền và đồ đã mua giữ nguyên)
  // sig: ảnh chữ ký (data URL) ký ở popup hợp đồng · now: phút lúc ký
  // wear: false = đồng phục / mũ hãng chỉ cất vào túi, người chơi tự mặc (cốt truyện chương 1 hướng dẫn mặc)
  joinBrand(id, sig = undefined, now = 0, { wear = true } = {}) {
    const b = BRANDS[id];
    if (!b) return { ok: false, msg: fmt('gs.noSuchItem') };
    if (this.brand === id) return { ok: false, msg: fmt('gs.brandAlready', { brand: b.name }) };
    const dep = b.deposit || 0, refund = this.brand ? this.depositPaid : 0;
    if (this.money + refund < dep) return { ok: false, msg: fmt('gs.short', { k: Math.ceil(dep - this.money - refund) }) };
    // xe hãng cấp chạy luôn, mọi xe còn lại về hầm nhà trọ (xe hãng cũ thì trả lại) → hầm không đủ chỗ thì chưa vào được
    const keep = this.owned.vehicles.filter((v) => VEHICLES[v] && v !== b.vehicle && !(this.brand && v === this.companyVehicle));
    if (VEHICLES[b.vehicle] && keep.length > PARK_SLOTS) return { ok: false, msg: fmt('gs.garageFull', { n: PARK_SLOTS }) };
    const switched = !!this.brand;
    if (switched) {
      this.leaveBrand();
      this.ratingBook = freshRating();
      this.account = freshAccount();
      this.lockedUntil = 0;
    }
    if (dep) this.spend(dep, 'deposit');
    this.brand = id;
    this.depositPaid = dep;
    const vid = VEHICLES[b.vehicle] ? b.vehicle : null;
    if (vid) {
      if (!this.owned.vehicles.includes(vid)) {
        this.owned.vehicles.push(vid);
        this.newVehicleState(vid);
        this.companyVehicle = vid;
      }
      this.vehicle = vid;
    }
    // đồng phục hãng: cấp + mặc luôn (wear = false: chỉ cất vào túi)
    const u = uniformOf(id);
    if (u) {
      if (!this.owned.gear.includes(u.id)) this.owned.gear.push(u.id);
      this.outfit.uniform = wear ? u.id : null;
    }
    this.giveBrandGifts(id, wear);
    // túi hãng tặng (apps.json → brands.<hãng>.bag): chưa có thì nhận + dùng luôn
    if (BAGS[b.bag] && !this.owned.bags.includes(b.bag)) {
      this.owned.bags.push(b.bag);
      this.bag = b.bag;
    }
    if (sig !== undefined) this.contracts[id] = { sig, day: this.day, at: now };
    return { ok: true, switched, msg: fmt(switched ? 'gs.brandSwitched' : 'gs.brandJoined', { brand: b.name, k: dep }) };
  }
  // Đang mặc đồng phục đúng hãng mình chưa (điều kiện bật app nhận đơn)
  wearingUniform() {
    const id = this.wornIds().uniform;
    return !!id && GOODS[id]?.brand === this.brand;
  }
  // Đã ở hãng mà chưa từng có đồng phục (bản lưu cũ): cấp và mặc sẵn. Đã tự cởi (outfit.uniform = null) thì để yên.
  ensureUniform() {
    const u = this.brand && uniformOf(this.brand);
    if (!u || this.owned.gear.includes(u.id)) return;
    this.owned.gear.push(u.id);
    if (this.outfit.uniform === undefined) this.outfit.uniform = u.id;
  }
  // Quà khi vào hãng (apps.json → brands.<hãng>.gifts, sửa ở thẻ App & Đơn → Hãng): trang phục thì mặc / đội luôn
  // (phụ kiện thì không, riêng mũ bảo hiểm đội luôn), trang bị thì có tác dụng ngay
  giveBrandGifts(id, wear = true) {
    for (const gid of BRANDS[id]?.gifts || []) {
      const g = GOODS[gid];
      if (!g || (g.type !== 'outfit' && g.type !== 'equipment')) continue;
      if (!this.owned.gear.includes(gid)) this.owned.gear.push(gid);
      if (wear && g.type === 'outfit' && g.slot && g.slot !== 'uniform' && (g.slot === 'helmet' || !isAccessorySlot(g.slot))) this.outfit[g.slot] = gid;
    }
    this.gifted = id;
  }
  // Nón chở khách còn mấy cái (trang bị có tác dụng "chở khách") — mất hết thì không nhận được đơn chở khách
  passengerHelmets() {
    return this.owned.gear.filter((id) => GOODS[id]?.type === 'equipment' && GOODS[id].effects?.passengerSeat);
  }
  // Mất 1 nón chở khách (khách cầm đi / bị lấy khi đậu xe). Trả về món bị mất (null = không có nón)
  losePassengerHelmet() {
    const id = this.passengerHelmets().at(-1);
    if (!id) return null;
    this.owned.gear.splice(this.owned.gear.lastIndexOf(id), 1);
    return GOODS[id];
  }
  // Nghỉ hãng (khi đổi hãng): trả xe hãng cấp, trả đồ của hãng (đồng phục, mũ, nón chở khách…), hoàn tiền cọc
  leaveBrand() {
    const cv = this.companyVehicle;
    if (cv) {
      this.owned.vehicles = this.owned.vehicles.filter((v) => v !== cv);
      delete this.vstate[cv];
      if (this.vehicle === cv) this.vehicle = START_VEHICLE;
    }
    if (this.depositPaid) this.earn(this.depositPaid, 'depositBack');
    // trả mọi đồ của hãng cũ (goods có brand = hãng cũ: đồng phục, mũ, nón chở khách — cả đồ mua thêm)
    const old = this.brand, mine = (gid) => !!GOODS[gid] && GOODS[gid].brand === old;
    for (const [slot, gid] of Object.entries(this.outfit)) {
      if (!gid || !mine(gid)) continue;
      if (slot === 'uniform') this.outfit.uniform = null;
      else delete this.outfit[slot];
    }
    this.owned.gear = this.owned.gear.filter((g) => !mine(g));
    // trả mũ hãng → còn mũ tự mua thì đội mũ đó, không thì đầu trần
    if (this.outfit.helmet === undefined) {
      const own = this.owned.gear.find((g) => GOODS[g]?.type === 'outfit' && GOODS[g].slot === 'helmet');
      if (own) this.outfit.helmet = own;
    }
    this.brand = null;
    this.companyVehicle = null;
    this.depositPaid = 0;
  }
  // Bán xe đã mua: được ECONOMY.sellPct (50%) giá xe mới. Xe đạp khởi đầu và xe hãng cấp không bán được.
  sellPrice(id) {
    const v = VEHICLES[id];
    return v ? Math.round(v.price * (ECONOMY.sellPct ?? 0.5)) : 0;
  }
  canSell(id) {
    const v = VEHICLES[id];
    return !!v && this.owned.vehicles.includes(id) && id !== START_VEHICLE && id !== this.companyVehicle && v.power !== 'pedal' && this.sellPrice(id) > 0;
  }
  // Xe đang để trong hầm nhà trọ = mọi xe đang có trừ xe đang dùng (thứ tự = chỗ dựng trong hầm)
  get parkedVehicles() {
    return this.owned.vehicles.filter((v) => v !== this.vehicle && VEHICLES[v]);
  }
  garageFull() {
    return this.parkedVehicles.length >= PARK_SLOTS;
  }
  // Lấy xe trong hầm ra dùng: xe đang dùng dựng vào đúng chỗ của xe vừa lấy (đổi chỗ trong danh sách)
  swapVehicle(id) {
    const list = this.owned.vehicles, i = list.indexOf(id), j = list.indexOf(this.vehicle);
    if (i < 0 || id === this.vehicle || !VEHICLES[id]) return { ok: false, msg: fmt('gs.noSuchItem') };
    if (j >= 0) [list[i], list[j]] = [list[j], list[i]];
    this.vehicle = id;
    return { ok: true, msg: fmt('gs.tookVehicle', { name: VEHICLES[id].name }) };
  }
  sellVehicle(id) {
    if (!this.canSell(id)) return { ok: false, msg: fmt('gs.cantSell') };
    const k = this.sellPrice(id);
    this.owned.vehicles = this.owned.vehicles.filter((v) => v !== id);
    delete this.vstate[id];
    if (this.vehicle === id) this.vehicle = this.companyVehicle && this.owned.vehicles.includes(this.companyVehicle) ? this.companyVehicle : START_VEHICLE;
    this.earn(k, 'sellVehicle');
    return { ok: true, k, msg: fmt('gs.sold', { name: VEHICLES[id].name, k }) };
  }
  // ---------- bán đồ cũ (vựa ve chai, địa điểm có "buys") ----------
  // Đồ bán được: quần áo / trang bị đã MUA (giá > 0, không phải đồ của hãng) → ECONOMY.resalePct giá mua;
  // đồ phế liệu có scrapPrice (vỏ chai, vỏ lon) → bán hết cả chồng. Trả về [{ id, kind, name, icon, n, k }]
  usedSellables() {
    const pct = ECONOMY.resalePct ?? 0.3, out = [];
    for (const id of this.owned.gear) {
      const g = GOODS[id];
      if (!g || !(g.price > 0) || g.brand || (g.type !== 'outfit' && g.type !== 'equipment')) continue;
      const k = Math.round(g.price * pct);
      if (k > 0) out.push({ id, kind: g.type, name: g.name, icon: g.icon, n: 1, k });
    }
    for (const [id, n] of Object.entries(this.consumables)) {
      const g = GOODS[id];
      if (g && g.scrapPrice > 0 && n > 0) out.push({ id, kind: 'scrap', name: g.name, icon: g.icon, n, k: Math.round(g.scrapPrice * n * 10) / 10 });
    }
    return out;
  }
  sellUsed(id) {
    const e = this.usedSellables().find((x) => x.id === id);
    if (!e) return { ok: false, msg: fmt('gs.cantSell') };
    if (e.kind === 'scrap') delete this.consumables[id];
    else {
      this.owned.gear = this.owned.gear.filter((x) => x !== id);
      // đang mặc → cởi ra (áo, quần, nón, giày tự về đồ có sẵn; phụ kiện để trống)
      const g = GOODS[id];
      if (g.type === 'outfit' && this.outfit[g.slot] === id) this.outfit[g.slot] = null;
    }
    this.earn(e.k, 'sellUsed');
    return { ok: true, k: e.k, msg: fmt('gs.sold', { name: e.n > 1 ? `${e.n} ${e.name}` : e.name, k: e.k }) };
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
    // giá 0 = có sẵn (trừ đồ chọn lúc tạo nhân vật và phụ kiện — mũ bảo hiểm phải được hãng cấp / mua)
    return !!g && g.type === 'outfit' && ((g.price === 0 && !g.start && !g.npcOnly && !isAccessorySlot(g.slot)) || this.owned.gear.includes(id)); // npcOnly: đồ chỉ NPC mặc
  }
  // Mã món đang mặc ở từng chỗ (món đã mất/bị xóa → rơi về món có sẵn; không có thì bỏ trống).
  // Phụ kiện không tự đeo món có sẵn: chưa gắn / đã tháo là trống.
  wornIds() {
    const out = {};
    for (const slot of Object.keys(OUTFIT_SLOTS)) {
      const id = this.outfit[slot];
      const ok = id && this.ownsOutfit(id) && GOODS[id].slot === slot && this.canWear(id);
      // món đang mặc mất / không còn → món có sẵn đang có của chỗ đó
      const pick = ok ? id : isAccessorySlot(slot) ? null : (Object.values(GOODS).find((g) => g.type === 'outfit' && g.slot === slot && g.price === 0 && this.ownsOutfit(g.id)) || freeOutfit(GOODS, slot))?.id;
      if (pick) out[slot] = pick;
    }
    return out;
  }
  // Món đang mặc: chỗ mặc → dữ liệu món (dùng để dựng ngoại hình)
  wornGoods() {
    return Object.fromEntries(Object.entries(this.wornIds()).map(([slot, id]) => [slot, GOODS[id]]));
  }
  // Nhân vật mình mặc được món này không (món gender 'f' — áo dài, chân váy, đầm… — chỉ nhân vật nữ)
  canWear(id) {
    return canWearOutfit(GOODS[id], this.profile.gender);
  }
  wear(id) {
    if (!this.ownsOutfit(id) || !OUTFIT_SLOTS[GOODS[id].slot] || !this.canWear(id)) return false;
    this.outfit[GOODS[id].slot] = id;
    return true;
  }
  // Tháo phụ kiện (áo, quần, nón, giày thì chỉ thay chứ không tháo)
  takeOff(slot) {
    if (!isAccessorySlot(slot) || !this.wornIds()[slot]) return false;
    this.outfit[slot] = null;
    return true;
  }
  isWorn(id) {
    const g = GOODS[id];
    return !!g && g.type === 'outfit' && this.wornIds()[g.slot] === id;
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

  // ---------- phạt nguội ----------
  addFine(amount, reason, now) {
    this.fines.push({ amount, reason, at: now, dueAt: now + (PARKING.fineDays ?? 3) * 1440, overdue: false });
    this.stats.fines += 1;
  }
  // Quá hạn → tiền phạt tăng overduePct (một lần). Trả về các khoản vừa quá hạn.
  updateFines(now) {
    const out = [];
    for (const f of this.fines) {
      if (f.overdue || now <= f.dueAt) continue;
      f.overdue = true;
      f.amount = Math.round(f.amount * (1 + (PARKING.overduePct ?? 0.5)));
      out.push(f);
    }
    return out;
  }
  get finesTotal() {
    return this.fines.reduce((s, f) => s + f.amount, 0);
  }
  get hasOverdueFines() {
    return this.fines.some((f) => f.overdue);
  }
  // hạn nộp sớm nhất (phút tuyệt đối) hoặc null
  get finesDueAt() {
    return this.fines.length ? Math.min(...this.fines.map((f) => f.dueAt)) : null;
  }
  // Nộp hết phạt nguội (đủ tiền mới nộp được). Trả về số đã nộp hoặc null
  payFines() {
    const t = this.finesTotal;
    if (!t || this.money < t) return null;
    this.spend(t, 'fine');
    this.fines = [];
    return t;
  }

  addEnergy(phys = 0, mental = 0) {
    this.phys = clamp(this.phys + phys, 0, 100);
    this.mental = clamp(this.mental + mental, 0, 100);
  }

  // Tiêu hao theo hoạt động mỗi dt phút game
  // activity: 'idle' | 'walk' | 'run' | 'drive' | 'pedal' (đạp xe đạp) | 'push' · 'sleep' (ngủ ở nhà: hồi lại) · 'nap' (chợp mắt ngoài: hồi ít hơn) · 'rest' (nằm bắt buộc khi kiệt sức: không đổi)
  // env.now (phút tuyệt đối): để tính thức quá lâu
  drain(activity, dt, env) {
    if (activity === 'sleep' || activity === 'nap') {
      const S = ENERGY.sleep;
      const k = activity === 'nap' ? S.napMul ?? 0.6 : 1; // chợp mắt ở quán / võng: hồi kém giường nhà
      this.addEnergy((S.physPerHour / 60) * dt * k, (S.mentalPerHour / 60) * dt * k);
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
    // gắn áo mưa mà trời không mưa (ban ngày, ngoài trời) → nóng, mệt thêm
    if (!env.raining && env.outdoor && env.now != null && !isDark(env.now) && this.effect('rainProtect')) p += P.raincoatHot || 0;
    if (env.inJam) m += M.jam;
    if (env.outdoor && env.now != null && isDark(env.now)) m += NIGHT.mentalPerMin || 0; // chạy đêm: đường vắng, sợ
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
  // Chợp mắt `minutes` phút: bớt số giờ đã thức (mỗi phút ngủ bớt napAwakeCut phút), không bớt quá lúc này
  napWake(now, minutes) {
    const cut = minutes * (ENERGY.sleep.napAwakeCut ?? 4);
    this.awakeSince = Math.min(now, this.awakeSince + cut);
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
    if (spec.type === 'outfit' && !this.canWear(id)) return { ok: false, msg: fmt('gs.femaleOnly') };
    // xe mới chạy luôn, xe đang dùng được chở về hầm nhà trọ → hầm đầy thì không mua được
    if (category === 'vehicles' && this.garageFull()) return { ok: false, msg: fmt('gs.garageFull', { n: PARK_SLOTS }) };
    if (!this.spend(spec.price, 'purchase')) return { ok: false, msg: fmt('gs.short', { k: Math.ceil(spec.price - this.money) }) };
    if (stack) {
      this.consumables[id] = this.countOf(id) + 1;
      return { ok: true, msg: fmt('gs.bought', { name: spec.name }) };
    }
    ownList.push(id);
    if (category === 'vehicles') {
      this.vehicle = id;
      this.newVehicleState(id); // xe mới: đầy độ bền, nhớt / pin mới, ít xăng / pin
    }
    if (category === 'bags') this.bag = id;
    return { ok: true, msg: fmt('gs.bought', { name: spec.name }) };
  }

  // Đổ xăng (chỉ xe xăng; xe điện sạc ở trụ sạc, xe đạp không cần)
  refuel() {
    if (this.power !== 'gas') return { ok: false, msg: fmt(this.power === 'electric' ? 'gs.evNoGas' : 'gs.pedalNoFuel') };
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

  // ---------- bảo dưỡng (xe xăng: thay nhớt · xe điện: thay pin) + đồng hồ km ----------
  // Mốc bảo dưỡng của xe đang dùng (xe đạp không cần → vô hạn)
  get maintIntervalKm() {
    const p = this.power;
    if (p === 'electric') return Math.max(1, ECONOMY.batteryIntervalKm ?? 180);
    if (p === 'gas') return Math.max(1, ECONOMY.oilIntervalKm ?? 180);
    return Infinity;
  }
  // còn chạy được bao nhiêu km tới hạn bảo dưỡng (âm = đã quá hạn)
  get maintLeftKm() {
    return this.maintIntervalKm - this.maintKm;
  }
  get maintOverdue() {
    return this.maintLeftKm < 0;
  }
  // Hệ số hao xăng / điện do quá hạn bảo dưỡng (1 = bình thường)
  maintFuelMul() {
    return this.maintOverdue ? 1 + (ECONOMY.oilFuelPct ?? 0.2) : 1;
  }
  // Xe vừa chạy thêm `km`: cộng đồng hồ; quá hạn bảo dưỡng thì xe hao dần theo số km chạy quá
  addKm(km) {
    if (!(km > 0)) return;
    this.odoKm += km;
    if (this.power === 'pedal') return;
    const I = this.maintIntervalKm, m = this.maintKm;
    const over = Math.max(0, m + km - I) - Math.max(0, m - I);
    this.maintKm = m + km;
    if (over > 0) this.bikeHp = Math.max(0, this.bikeHp - over * (ECONOMY.oilHpPerKm ?? 0.5));
  }
  // Thay nhớt ở tiệm sửa xe (chỉ xe xăng)
  changeOil() {
    if (this.power !== 'gas') return { ok: false, msg: fmt('gs.oilNotGas') };
    const cost = ECONOMY.oilCost ?? 60;
    if (this.maintKm < 0.5) return { ok: false, msg: fmt('gs.oilFresh') };
    if (!this.spend(cost, 'oil')) return { ok: false, msg: fmt('gs.noOilMoney', { cost }) };
    this.maintKm = 0;
    return { ok: true, minutes: ECONOMY.oilChangeMin ?? 15, msg: fmt('gs.oilChanged', { km: this.maintIntervalKm }) };
  }
  // Sạc ở trụ sạc (chỉ xe điện): rẻ nhưng chậm; thiếu tiền thì sạc được bao nhiêu hay bấy nhiêu
  charge() {
    if (this.power !== 'electric') return { ok: false, msg: fmt('gs.notEv') };
    const need = Math.max(0, this.vehicleSpec.tank - this.fuel);
    if (need < 0.02) return { ok: false, msg: fmt('gs.batteryFull') };
    const price = ECONOMY.elecPrice ?? 8;
    const kwh = Math.min(need, this.money / price);
    if (kwh < 0.02) return { ok: false, msg: fmt('gs.noChargeMoney') };
    const cost = Math.round(kwh * price * 10) / 10;
    this.spend(cost, 'charge');
    this.fuel += kwh;
    this.flags.refueled = true;
    const minutes = Math.max(5, Math.ceil(kwh / Math.max(0.001, ECONOMY.chargeKwhPerMin ?? 0.02)));
    return { ok: true, kwh, cost, minutes, msg: fmt('gs.charged', { kwh: kwh.toFixed(2), cost, min: minutes }) };
  }
  // Đổi pin ở trạm đổi pin (chỉ xe điện): đầy pin ngay + tính là bảo dưỡng (như thay nhớt của xe xăng)
  swapBattery() {
    if (this.power !== 'electric') return { ok: false, msg: fmt('gs.notEv') };
    const cost = ECONOMY.swapCost ?? 45;
    if (this.maintKm < 0.5 && this.vehicleSpec.tank - this.fuel < 0.02) return { ok: false, msg: fmt('gs.batteryFresh') };
    if (!this.spend(cost, 'swap')) return { ok: false, msg: fmt('gs.noSwapMoney', { cost }) };
    this.fuel = this.vehicleSpec.tank;
    this.maintKm = 0;
    this.flags.refueled = true;
    return { ok: true, minutes: ECONOMY.swapMin ?? 3, msg: fmt('gs.swapped', { km: this.maintIntervalKm }) };
  }

  // Dùng 1 đồ dùng trong túi → trả về số phút mất
  useConsumable(id) {
    const g = GOODS[id];
    if (!g || g.type !== 'consumable' || this.countOf(id) <= 0) return { ok: false, minutes: 0 };
    const u = g.use || {};
    this.consumables[id] -= 1;
    if (!this.consumables[id]) delete this.consumables[id];
    if (u.leaves && GOODS[u.leaves]) this.consumables[u.leaves] = this.countOf(u.leaves) + 1; // uống xong còn vỏ chai / vỏ lon trong túi
    this.addEnergy(u.phys || 0, u.mental || 0);
    if (u.fuel) this.fuel = Math.min(this.vehicleSpec.tank, this.fuel + u.fuel);
    if (u.bikeHp) this.bikeHp = Math.min(100, this.bikeHp + u.bikeHp);
    return { ok: true, minutes: u.minutes || 0, name: g.name };
  }

  // Hoạt động tại địa điểm (đọc sách, hát karaoke…). Trả về lý do nếu không làm được.
  activityStatus(place, act, now) {
    if (!isOpen(place, now, this.progress)) return 'closed';
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
  // ---------- tin nhắn ----------
  // Thêm 1 tin vào cuộc trò chuyện id. m: { key | text, params, loc: [mã địa điểm], me } · info: { name, icon } (người gửi lạ)
  addMessage(id, m, now = 0, info = null) {
    const t = (this.inbox.threads[id] = this.inbox.threads[id] || { msgs: [], unread: 0 });
    if (info?.name) t.name = info.name;
    if (info?.icon) t.icon = info.icon;
    t.msgs.push({ ...m, at: now });
    if (t.msgs.length > MSG_KEEP) t.msgs.splice(0, t.msgs.length - MSG_KEEP);
    if (!m.me) t.unread = (t.unread || 0) + 1;
    t.last = now;
    return t;
  }
  readThread(id) {
    const t = this.inbox.threads[id];
    if (t) t.unread = 0;
  }
  get unreadMessages() {
    return Object.values(this.inbox.threads).reduce((a, t) => a + (t.unread || 0), 0);
  }
  // Gắn câu trả lời nhanh (khóa chữ, tối đa 3) vào cuộc trò chuyện · gains: điểm tính cách của từng câu ({ trait, pts } | null)
  setReplies(id, keys, gains = null) {
    const t = this.inbox.threads[id];
    if (!t) return;
    t.replies = keys.slice(0, 3);
    if (gains?.some(Boolean)) t.replyGains = gains.slice(0, 3);
    else delete t.replyGains;
  }
  // Người chơi chọn câu trả lời nhanh thứ i → thành tin của mình, báo cho cốt truyện, cộng điểm tính cách (nếu câu đó có)
  // Trả về false (không trả lời được) hoặc { gain } (gain = điểm vừa cộng, null nếu câu không có điểm)
  reply(id, i, now = 0) {
    const t = this.inbox.threads[id];
    const key = t?.replies?.[i];
    if (!key) return false;
    const gain = t.replyGains?.[i] || null;
    storyPick(this.story, `msg.${t.replies[0]}`, i, gain); // mã lựa chọn = khóa câu trả lời đầu (mỗi bộ câu trả lời tính 1 lần)
    t.replies = null;
    delete t.replyGains;
    this.addMessage(id, { key, me: true }, now);
    storyEvent(this.story, `reply:${id}`);
    return { gain };
  }

  // Tiến độ để xét địa điểm đã mở chưa (sim/placeRules.js → unlocked): ngày + chương cốt truyện đang chơi
  get progress() {
    return { day: this.day, chap: chapterNo(this.story) };
  }

  carryOver() {
    return {
      profile: { ...this.profile },
      contracts: { ...this.contracts },
      phys: this.phys,
      mental: this.mental,
      awakeSince: this.awakeSince,
      rentState: { ...this.rentState },
      money: this.money,
      rating: this.ratingBook.toJSON(),
      owned: this.owned,
      vehicle: this.vehicle,
      bag: this.bag,
      vstate: JSON.parse(JSON.stringify(this.vstate)),
      brand: this.brand,
      companyVehicle: this.companyVehicle,
      depositPaid: this.depositPaid,
      gifted: this.gifted,
      odoKm: this.odoKm,
      inventory: this.inventory,
      consumables: this.consumables,
      outfit: this.outfit,
      account: this.account,
      flags: { wallet: this.flags.wallet, walletDay: this.flags.walletDay, walletRetryAt: this.flags.walletRetryAt, story: this.flags.story, tutSkip: this.flags.tutSkip, groupDay: this.flags.groupDay },
      towed: this.towed,
      fines: this.fines.map((f) => ({ ...f })),
      inbox: this.inbox,
      story: this.story,
    };
  }
}
