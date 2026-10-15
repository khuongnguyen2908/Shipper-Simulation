// =============================================================
// KIỂM TRA DỮ LIỆU — dùng chung cho công cụ ?editor và bộ thử (npm test).
// Trả về danh sách vấn đề: { level: 'error' | 'warn', tab, ref, field, msg }
//  - error: game sẽ chạy sai → công cụ không cho lưu
//  - warn : chạy được nhưng nên xem lại
// =============================================================
import { validateSounds } from './soundSpec.js';
import { CITY, LOT_IDS, MULTI_LOTS, lotParts, lotFaces, blockPlan, blockLotIds, roadGraph, neighbors, cutCell, joinList, joinSeg, joinPartner, isJoinLot, riverInfo, BRIDGE_STYLES } from '../sim/cityLayout.js';
import { ALLEY_TEMPLATES } from '../sim/blockPlan.js';
import { EFFECTS, CONSUMABLE_FIELDS, OUTFIT_SLOTS, FEMALE_STYLES } from './goods.js';
import { validatePhone } from './phoneApps.js';
import { ORDER_KINDS, FROM_HOMES } from './apps.js';
import { GENDERS, HAIR_STYLES } from '../sim/people.js';
import { openDayOf } from '../sim/placeRules.js';
import { LOOKS, lookOf, looksFor, CAMPUS_LOOKS } from './looks.js';
import { hoursProblem, totalHours } from '../sim/hours.js';
import { BALANCE_GROUPS, KNOWN_PATHS, getPath } from './balanceSpec.js';
import { ITEM_GROUP_IDS } from './itemGroups.js';
import { DISTRICT_TRAITS, TRAIT_RANGE, HOUSE_STYLE_IDS, DECOR_IDS, TREES_RANGE, STREET_IDS, STREET_RANGE } from './districtTraits.js';
const ROAD_TIER_IDS = ['big', 'normal', 'small']; // cấp đường (giống TIER_IDS trong src/sim/roads.js)
import { isPlaced } from './places.js';
import { lightable } from '../sim/lights.js';

const MAX_OPEN_DAY = 60;
// "Mở từ ngày" / "Có đơn từ ngày": số nguyên 1–60, bỏ trống = ngày 1
function openDayErr(add, ref, v, locked) {
  if (v == null) return;
  if (!Number.isInteger(v) || v < 1 || v > MAX_OPEN_DAY) add('error', ref, 'openDay', `Ngày mở phải là số nguyên 1–${MAX_OPEN_DAY}.`);
  else if (locked && v > 1) add('error', ref, 'openDay', 'Mục này gắn với cốt truyện / code → phải có từ ngày 1.');
}

export const TRAIT_IDS = ['hot', 'cold', 'liquid', 'fragile', 'paper', 'passenger'];
export const PROTECTED = {
  items: ['passenger'],
  vehicles: ['xeDap', 'cub'],
  bags: ['nylon'],
  places: ['home', 'gas', 'gear', 'garage', 'cafe', 'taphoa', 'gate', 'apartment', 'market'],
};
export const LOTS = [...LOT_IDS, ...Object.keys(MULTI_LOTS), 'C'];
// Kiểu dáng xe (khớp BIKE_MODELS trong src/world/models.js — có bộ thử kiểm tra)
export const VEHICLE_MODELS = { cub: 'Xe số cổ (Cub)', underbone: 'Xe số (Wave)', scooter: 'Tay ga (Vision, SH, xe điện)', sport: 'Tay côn / mô tô', bicycle: 'Xe đạp' };
export const POWER_LABELS = { gas: '⛽ Xe xăng', electric: '🔋 Xe điện', pedal: '🚲 Xe đạp' };
// office: văn phòng hãng (đăng ký chạy app) · charger: trụ sạc xe điện · swap: trạm đổi pin
export const PLACE_KINDS = ['home', 'restaurant', 'gas', 'shop', 'garage', 'cafe', 'taphoa', 'gate', 'apartment', 'market', 'service', 'scenery', 'police', 'office', 'charger', 'swap'];
export const ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Cảnh báo số trừ thể lực/tinh thần quá lớn (thanh 0–100, về 0 là ngất / suy sụp)
function drainWarn(add, ref, field, phys, mental, who) {
  for (const [v, name] of [[phys, 'thể lực'], [mental, 'tinh thần']]) {
    if (!num(v)) continue;
    if (v <= -100) add('warn', ref, field, `${who}trừ ${-v} ${name} → người chơi ngất / suy sụp ngay (thanh tối đa 100).`);
    else if (v <= -30) add('warn', ref, field, `${who}trừ ${-v} ${name} một lần — người chơi đang yếu có thể ngất / suy sụp ngay. Thường chỉ −5 đến −20.`);
  }
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);

// Các ô lô mà một địa điểm chiếm (tòa nhà lớn chiếm nhiều lô — xem MULTI_LOTS)
export function lotCells(p) {
  if (!isPlaced(p)) return []; // chưa đặt trên bản đồ
  const [bx, bz] = p.block;
  const out = lotParts(p.lot).map((id) => `${bx},${bz},${id}`);
  const q = joinPartner(bx, bz, p.lot); // lô gộp 2 khối: chiếm cả khối thứ 2
  if (q) for (const id of MULTI_LOTS.B) out.push(`${q[0]},${q[1]},${id}`);
  return out;
}

export function validateItems(items, placesData, appsData = null) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'items', ref, field, msg });
  const menus = (placesData?.places || []).filter((p) => p.kind === 'restaurant').flatMap((p) => p.menu || []);
  const parcelTypes = Object.values(appsData?.orderTypes || {}).filter((t) => t.kind === 'parcel');
  const parcelUse = new Set(parcelTypes.flatMap((t) => t.items || []));
  // hàng riêng của tiệm (places.json → orders.parcelItems) cũng có đơn nếu có loại đơn bật "shopItems"
  if (parcelTypes.some((t) => t.shopItems)) for (const p of placesData?.places || []) for (const id of p.orders?.parcelItems || []) parcelUse.add(id);
  for (const id of PROTECTED.items) if (!items[id]) add('error', id, 'id', `Thiếu món bắt buộc "${id}" (code dùng trực tiếp).`);
  for (const [key, it] of Object.entries(items)) {
    if (tooNewEmoji(it.icon)) add('warn', key, 'icon', NEW_EMOJI_MSG);
    openDayErr(add, key, it.openDay, PROTECTED.items.includes(key));
    if (!ID_RE.test(key)) add('error', key, 'id', 'Mã chỉ gồm chữ không dấu, số, gạch dưới; bắt đầu bằng chữ.');
    if (it.id !== key) add('error', key, 'id', `Mã bên trong (${it.id}) khác khóa (${key}).`);
    if (!it.name || !String(it.name).trim()) add('error', key, 'name', 'Chưa có tên.');
    if (!it.icon) add('warn', key, 'icon', 'Chưa có biểu tượng.');
    if (it.group != null && !ITEM_GROUP_IDS.includes(it.group)) add('error', key, 'group', `Nhóm "${it.group}" không có (chọn: ${ITEM_GROUP_IDS.join(', ')}).`);
    const tr = it.traits || [];
    for (const t of tr) if (!TRAIT_IDS.includes(t)) add('error', key, 'traits', `Đặc tính lạ: ${t}.`);
    if (!tr.length) add('warn', key, 'traits', 'Không có đặc tính nào → món không bao giờ hư.');
    if (tr.includes('hot') && tr.includes('cold')) add('error', key, 'traits', 'Không thể vừa Nóng vừa Lạnh.');
    if (tr.includes('passenger') && tr.length > 1) add('error', key, 'traits', 'Khách xe ôm không đi kèm đặc tính khác.');
    if (!num(it.base) || it.base <= 0) add('error', key, 'base', 'Giá cước phải là số > 0.');
    else if (it.base > 200) add('warn', key, 'base', 'Giá cước rất cao (> 200k) – kiểm tra cân bằng.');
    else if (it.base < 10 && !tr.includes('passenger')) add('warn', key, 'base', 'Cước dưới 10k — sau phí app 20% gần như không lời (xăng ~1k/km).');
    if (tr.includes('hot') && (!num(it.startTemp) || it.startTemp < 40 || it.startTemp > 100)) add('error', key, 'startTemp', 'Món nóng cần nhiệt độ ban đầu 40–100°C.');
    if (tr.includes('cold')) {
      if (!num(it.startTemp) || it.startTemp < -30 || it.startTemp > 15) add('error', key, 'startTemp', 'Món lạnh cần nhiệt độ ban đầu −30–15°C.');
      if (!num(it.meltAt)) add('error', key, 'meltAt', 'Món lạnh cần ngưỡng tan (°C).');
      else if (num(it.startTemp) && it.meltAt <= it.startTemp) add('warn', key, 'meltAt', 'Ngưỡng tan ≤ nhiệt độ ban đầu → món tan ngay khi nhận.');
      if (!num(it.meltRate) || it.meltRate <= 0 || it.meltRate > 2) add('error', key, 'meltRate', 'Tốc độ tan phải trong khoảng 0–2.');
    }
    if (it.parcel) {
      // hàng giao (không phải đồ ăn): giá trị thu hộ COD
      if (tr.includes('passenger')) add('error', key, 'parcel', 'Khách xe ôm không phải hàng giao.');
      if (it.cod != null && (!num(it.cod) || it.cod < 0 || it.cod > 100000)) add('error', key, 'cod', 'Giá trị thu hộ từ 0 đến 100000k.');
      if (menus.includes(key)) add('error', key, 'menu', 'Hàng giao không bán trong thực đơn quán ăn — bỏ khỏi thực đơn.');
      if (appsData && !parcelUse.has(key)) add('warn', key, 'parcel', 'Chưa loại đơn giao hàng nào chở món này → không bao giờ có đơn. Chọn ở thẻ 📱 App & Đơn → Loại đơn.');
    } else if (!tr.includes('passenger') && placesData && !menus.includes(key)) add('warn', key, 'menu', 'Chưa quán nào bán món này → không bao giờ có đơn.');
  }
  return out;
}

// ---------- App giao hàng, loại đơn, loại khách (apps.json) ----------
const inRange = (add, ref, field, v, lo, hi, label, { int = false, optional = false } = {}) => {
  if (v == null && optional) return;
  if (!num(v) || v < lo || v > hi || (int && !Number.isInteger(v))) add('error', ref, field, `${label}: ${int ? 'số nguyên ' : ''}từ ${lo} đến ${hi}.`);
};
const badHours = (h) => !Array.isArray(h) || !num(h[0]) || !num(h[1]) || h[0] < 0 || h[1] > 24 || h[0] >= h[1];

export function validateApps(ad, items = {}, placesData = null) {
  const out = [];
  const presets = placesData?.hourPresets || {};
  const mk = (cat) => (level, ref, field, msg) => out.push({ level, tab: 'app', cat, ref, field, msg });
  if (!ad || typeof ad !== 'object') return [{ level: 'error', tab: 'app', cat: 'app', ref: '', field: '', msg: 'Thiếu dữ liệu app.' }];
  // app
  const apps = Object.entries(ad.apps || {});
  if (!apps.length) mk('app')('error', '', 'id', 'Cần ít nhất 1 app giao hàng.');
  for (const [key, a] of apps) {
    const add = mk('app');
    if (!ID_RE.test(key) || a.id !== key) add('error', key, 'id', 'Mã app không hợp lệ hoặc khác khóa.');
    if (!a.name || !String(a.name).trim()) add('error', key, 'name', 'Chưa có tên app.');
    inRange(add, key, 'platformFee', a.platformFee, 0, 0.9, 'Phí nền tảng');
    inRange(add, key, 'taxRate', a.taxRate, 0, 0.5, 'Thuế');
    inRange(add, key, 'distBonusPerKm', a.distBonusPerKm, 0, 50, 'Thưởng mỗi km');
    inRange(add, key, 'extraItemFare', a.extraItemFare, 0, 100, 'Cước mỗi món thêm');
    inRange(add, key, 'cancelComp', a.cancelComp, 0, 200, 'Bù khi đơn bị hủy');
    inRange(add, key, 'rainSurcharge', a.rainSurcharge, 0, 100, 'Phụ phí mưa');
    inRange(add, key, 'peakSurcharge', a.peakSurcharge, 0, 100, 'Phụ phí giờ cao điểm');
    if (a.floodSurcharge != null) inRange(add, key, 'floodSurcharge', a.floodSurcharge, 0, 100, 'Phụ phí ngập');
    if (a.airportFee != null) inRange(add, key, 'airportFee', a.airportFee, 0, 100, 'Phụ phí sân bay');
    if (!Array.isArray(a.tipByStars) || a.tipByStars.length !== 6 || a.tipByStars.some((v) => !num(v) || v < 0 || v > 500)) add('error', key, 'tipByStars', 'Tiền boa: đủ 1★ → 5★, mỗi mức 0–500k.');
    if (!Array.isArray(a.peakHours) || a.peakHours.some(badHours)) add('error', key, 'peakHours', 'Giờ cao điểm: mỗi khung là giờ bắt đầu < giờ kết thúc, trong 0–24.');
    if (hoursProblem(a.hours, presets)) add('error', key, 'hours', `Giờ app nhận đơn: ${hoursProblem(a.hours, presets)}`);
    if (a.nightHours != null && hoursProblem(a.nightHours, presets)) add('error', key, 'nightHours', `Giờ phụ phí đêm: ${hoursProblem(a.nightHours, presets)}`);
    if (a.nightSurcharge != null && (!num(a.nightSurcharge) || a.nightSurcharge < 0 || a.nightSurcharge > 1000)) add('error', key, 'nightSurcharge', 'Phụ phí đêm: số từ 0 đến 1000.');
    if (a.demandByHour != null) {
      if (!Array.isArray(a.demandByHour) || a.demandByHour.length !== 24 || a.demandByHour.some((v) => !num(v) || v < 0 || v > 5)) add('error', key, 'demandByHour', 'Nhu cầu theo giờ: 24 số từ 0 đến 5.');
      else if (a.demandByHour.every((v) => v === 0)) add('warn', key, 'demandByHour', 'Giờ nào nhu cầu cũng bằng 0 → không bao giờ có đơn.');
    }
    if (num(a.platformFee) && num(a.taxRate) && a.platformFee + a.taxRate > 0.6) add('warn', key, 'platformFee', 'Phí + thuế trên 60% cước — tài xế gần như không lời.');
    const acc = a.account || {};
    inRange(add, key, 'account.lockBelow', acc.lockBelow, 1, 5, 'Khóa tài khoản dưới');
    inRange(add, key, 'account.cancelStars', acc.cancelStars, 1, 5, 'Sao tính cho mỗi lần tự hủy', { int: true });
    inRange(add, key, 'account.cancelLimitPerDay', acc.cancelLimitPerDay, 0, 20, 'Số lần tự hủy mỗi ngày', { int: true });
    inRange(add, key, 'account.cancelLockMin', acc.cancelLockMin, 0, 600, 'Phút khóa nhận đơn');
    inRange(add, key, 'account.acceptWindow', acc.acceptWindow, 3, 50, 'Số lần mời để tính tỉ lệ nhận', { int: true });
    inRange(add, key, 'account.lowAcceptBelow', acc.lowAcceptBelow, 0, 1, 'Tỉ lệ nhận đơn thấp');
    inRange(add, key, 'account.lowAcceptPingMult', acc.lowAcceptPingMult, 1, 5, 'Đơn thưa hơn (lần)');
    if (num(acc.lockBelow) && acc.lockBelow >= 4.8) add('warn', key, 'account.lockBelow', 'Ngưỡng khóa ≥ 4,8 — người chơi khởi đầu 4,8 sao, chỉ 1 đơn tệ là thua.');
  }
  // loại đơn
  const types = Object.entries(ad.orderTypes || {});
  const parcelItems = Object.values(items).filter((i) => i.parcel).map((i) => i.id);
  for (const [key, t] of types) {
    const add = mk('orderTypes');
    if (!ID_RE.test(key) || t.id !== key) add('error', key, 'id', 'Mã loại đơn không hợp lệ hoặc khác khóa.');
    if (!t.name || !String(t.name).trim()) add('error', key, 'name', 'Chưa có tên.');
    if (!ORDER_KINDS.includes(t.kind)) add('error', key, 'kind', `Kiểu xử lý phải là: ${ORDER_KINDS.join(', ')}.`);
    inRange(add, key, 'weight', t.weight, 0, 20, 'Mức thường xuyên');
    inRange(add, key, 'fareMult', t.fareMult, 0.2, 5, 'Hệ số cước');
    inRange(add, key, 'deadlineMult', t.deadlineMult, 0.2, 3, 'Hệ số thời hạn');
    if (hoursProblem(t.hours, presets)) add('error', key, 'hours', `Khung giờ: ${hoursProblem(t.hours, presets)}`);
    if (t.requires != null && EFFECTS[t.requires]?.kind !== 'bool') add('error', key, 'requires', 'Điều kiện mở phải là một tác dụng có/không của trang bị.');
    if (t.kind === 'parcel') {
      if (!(t.items || []).length) add('error', key, 'items', 'Chưa chọn món hàng nào cho loại đơn này.');
      for (const id of t.items || []) if (!parcelItems.includes(id)) add('error', key, 'items', `"${id}" không phải hàng giao (thẻ Vật phẩm → đánh dấu "Hàng giao").`);
      for (const f of ['codChance', 'bomChance', 'persuadeChance', 'returnFeePct']) inRange(add, key, f, t[f] ?? 0, 0, 1, 'Tỉ lệ');
      if (t.codChance > 0 && !(t.items || []).some((id) => items[id]?.cod > 0)) add('warn', key, 'codChance', 'Có thu hộ nhưng không món nào có giá trị thu hộ → không bao giờ có đơn COD.');
      if (t.bomChance > 0 && !(t.codChance > 0)) add('warn', key, 'bomChance', 'Bom hàng chỉ xảy ra với đơn thu hộ — tỉ lệ thu hộ đang là 0.');
    }
  }
  for (const k of ['food', 'ride']) if (!types.some(([, t]) => t.kind === k)) mk('orderTypes')('error', '', 'kind', `Cần ít nhất 1 loại đơn kiểu "${k}" (nhiệm vụ chiếc ví dùng đơn chở khách).`);
  if (!types.some(([, t]) => t.weight > 0)) mk('orderTypes')('error', '', 'weight', 'Mọi loại đơn đều có mức 0 → không bao giờ có đơn.');
  // loại khách xe ôm
  const riders = Object.entries(ad.riderTypes || {});
  const placeIds = new Set((placesData?.places || []).map((p) => p.id));
  for (const [key, r] of riders) {
    const add = mk('riderTypes');
    if (!ID_RE.test(key) || r.id !== key) add('error', key, 'id', 'Mã loại khách không hợp lệ hoặc khác khóa.');
    if (!r.name || !String(r.name).trim()) add('error', key, 'name', 'Chưa có tên.');
    inRange(add, key, 'weight', r.weight, 0, 20, 'Mức thường xuyên');
    inRange(add, key, 'comfortKmh', r.comfortKmh, 10, 120, 'Chịu tốc độ (km/h)', { optional: true });
    inRange(add, key, 'fareMult', r.fareMult, 0.2, 5, 'Hệ số cước', { optional: true });
    inRange(add, key, 'deadlineMult', r.deadlineMult, 0.2, 3, 'Hệ số thời hạn', { optional: true });
    inRange(add, key, 'quitBelow', r.quitBelow, 0, 90, 'Đòi xuống khi thoải mái dưới (%)', { optional: true });
    inRange(add, key, 'minRides', r.minRides, 0, 500, 'Mở sau số chuyến', { int: true, optional: true });
    for (const f of ['vagueChance', 'vomitChance', 'noPayChance', 'bigTipChance', 'changeDestChance', 'changeDestPays', 'robPctMin', 'helmetTaken']) inRange(add, key, f, r[f], 0, 1, 'Tỉ lệ', { optional: true });
    inRange(add, key, 'robMax', r.robMax, 0, 5000, 'Bị lấy tối đa (k)', { optional: true });
    for (const f of ['scam', 'luggage', 'foreign']) if (r[f] != null && typeof r[f] !== 'boolean') add('error', key, f, 'Phải là có / không.');
    if (r.names != null && (!Array.isArray(r.names) || r.names.some((s) => typeof s !== 'string' || !s.trim()))) add('error', key, 'names', 'Tên khách: mỗi dòng một tên, không để trống.');
    if (r.scam && !(r.weight <= 2)) add('warn', key, 'weight', 'Khách lừa đảo nên hiếm (mức ≤ 2) — nhiều quá người chơi mất tiền liên tục.');
    for (const f of ['bigTip', 'earlyTip', 'vomitCost']) inRange(add, key, f, r[f], 0, 500, 'Số tiền (k)', { optional: true });
    inRange(add, key, 'vomitMental', r.vomitMental, 0, 100, 'Trừ tinh thần', { optional: true });
    if (hoursProblem(r.hours, presets)) add('error', key, 'hours', `Khung giờ: ${hoursProblem(r.hours, presets)}`);
    if (r.viaApp != null && typeof r.viaApp !== 'boolean') add('error', key, 'viaApp', 'Qua app phải là có/không.');
    for (const id of r.from || []) if (placesData && id !== FROM_HOMES && !placeIds.has(id)) add('error', key, 'from', `Địa điểm "${id}" không tồn tại.`);
    if (r.riderNames != null && (!Array.isArray(r.riderNames) || r.riderNames.some((s) => typeof s !== 'string' || !s.trim()))) add('error', key, 'riderNames', 'Tên người đi: mỗi dòng một tên, không để trống.');
    if (num(r.vomitMental) && r.vomitMental >= 30) add('warn', key, 'vomitMental', 'Trừ tinh thần ≥ 30 một lần — người chơi đang yếu có thể thua ngay.');
  }
  if (riders.length && !riders.some(([, r]) => r.weight > 0)) mk('riderTypes')('error', '', 'weight', 'Mọi loại khách đều có mức 0 → đơn chở khách không tạo được.');
  return out;
}

const RANGES = {
  vehicles: { maxSpeed: [5, 40], accel: [1, 15], brake: [3, 20], steer: [1, 4], suspension: [0, 1], fuelPer100km: [0.5, 10], tank: [0.5, 20], price: [0, 100000] },
  bags: { insulation: [0, 1], waterproof: [0, 1], padding: [0, 1], cols: [1, 5], rows: [1, 4], price: [0, 100000] },
};

// Hãng xe công nghệ (apps.json → brands) + văn phòng hãng, trụ sạc, trạm đổi pin trong places.json
export function validateBrands(apps, gear, placesData, goods = null) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'app', cat: 'brands', ref, field, msg });
  const brands = apps.brands || {};
  const places = (placesData?.places || []).filter((p) => isPlaced(p));
  if (!Object.keys(brands).length) add('error', '', 'brands', 'Chưa có hãng nào → người chơi không vào hãng được, không chạy đơn được.');
  for (const [key, b] of Object.entries(brands)) {
    if (!ID_RE.test(key)) add('error', key, 'id', 'Mã chỉ gồm chữ không dấu, số, gạch dưới.');
    if (b.id !== key) add('error', key, 'id', `Mã bên trong (${b.id}) khác khóa (${key}).`);
    if (!b.name || !String(b.name).trim()) add('error', key, 'name', 'Chưa có tên hãng.');
    if (!COLOR_RE.test(b.color || '')) add('error', key, 'color', 'Màu phải dạng #rrggbb.');
    if (b.power !== 'gas' && b.power !== 'electric') add('error', key, 'power', 'Loại xe của hãng phải là xe xăng hoặc xe điện.');
    const v = gear?.vehicles?.[b.vehicle];
    if (!v) add('error', key, 'vehicle', `Xe cấp khi vào hãng "${b.vehicle}" không có trong danh sách xe.`);
    else if ((v.power || 'gas') !== b.power) add('error', key, 'vehicle', `Xe cấp "${v.name}" không đúng loại xe của hãng.`);
    if (!num(b.deposit) || b.deposit < 0 || b.deposit > 100000) add('error', key, 'deposit', 'Tiền cọc phải từ 0 đến 100000.');
    if (b.bag != null && b.bag !== '' && !gear?.bags?.[b.bag]) add('error', key, 'bag', `Túi tặng khi vào hãng "${b.bag}" không có trong danh sách túi.`);
    if (placesData && !places.some((p) => p.kind === 'office' && p.brand === key)) add('warn', key, 'office', `Chưa có văn phòng ${b.name || key} trên bản đồ → người chơi không đăng ký hãng này được.`);
    if (b.perks != null && (!Array.isArray(b.perks) || b.perks.some((x) => typeof x !== 'string'))) add('error', key, 'perks', 'Đãi ngộ phải là danh sách câu chữ.');
    // quà khi vào hãng: món có thật, là trang phục / trang bị; món của hãng khác thì nhắc
    if (b.gifts != null && !Array.isArray(b.gifts)) add('error', key, 'gifts', 'Quà khi vào hãng phải là danh sách món.');
    for (const gid of Array.isArray(b.gifts) ? b.gifts : []) {
      const g = goods?.[gid];
      if (goods && !g) add('error', key, 'gifts', `Quà "${gid}" không có trong danh sách đồ dùng.`);
      else if (g && g.type !== 'outfit' && g.type !== 'equipment') add('error', key, 'gifts', `Quà "${g.name}" phải là trang phục hoặc trang bị.`);
      else if (g && g.brand && g.brand !== key) add('warn', key, 'gifts', `Quà "${g.name}" là đồ của hãng khác.`);
    }
    if (goods && !Object.values(goods).some((g) => g.type === 'outfit' && g.slot === 'uniform' && g.brand === key)) add('error', key, 'uniform', `${b.name || key} chưa có đồng phục (thẻ 🛵 Xe · Túi · Đồ dùng → trang phục, chỗ mặc "Đồng phục", chọn hãng) → người chơi không bật được app.`);
  }
  // đồ của hãng (đồng phục bắt buộc chọn hãng; mũ, nón chở khách… tùy): hãng phải có thật; chỉ bán ở văn phòng của đúng hãng đó
  for (const g of Object.values(goods || {})) {
    const uniform = g.type === 'outfit' && g.slot === 'uniform';
    if (!uniform && g.brand == null) continue;
    if (!brands[g.brand]) out.push({ level: 'error', tab: 'gear', cat: 'goods', ref: g.id, field: 'brand', msg: uniform ? 'Đồng phục chưa chọn hãng (hoặc hãng đã bị xóa).' : 'Hãng của món này đã bị xóa.' });
    for (const p of placesData?.places || []) {
      if (!(p.sells?.goods || []).includes(g.id)) continue;
      if (p.kind !== 'office' || p.brand !== g.brand) out.push({ level: 'warn', tab: 'places', ref: p.id, field: 'sells', msg: `"${g.name}" chỉ nên bán ở văn phòng ${brands[g.brand]?.name || 'của hãng'} (đồ của hãng chỉ cấp hoặc mua tại văn phòng).` });
    }
  }
  for (const p of placesData?.places || []) if (p.kind === 'office' && !brands[p.brand]) out.push({ level: 'error', tab: 'places', ref: p.id, field: 'brand', msg: 'Văn phòng chưa chọn hãng (hoặc hãng đã bị xóa).' });
  if (placesData && Object.values(brands).some((b) => b.power === 'electric')) {
    if (!places.some((p) => p.kind === 'charger')) add('warn', '', 'charger', 'Có hãng xe điện mà chưa có trụ sạc nào trên bản đồ.');
    if (!places.some((p) => p.kind === 'swap')) add('warn', '', 'swap', 'Có hãng xe điện mà chưa có trạm đổi pin nào → không bảo dưỡng pin được.');
  }
  return out;
}

// apps (apps.json, không bắt buộc): để biết xe nào là xe hãng cấp (giá 0 là đúng)
export function validateGear(gear, apps = null) {
  const out = [];
  const brandVehicles = new Set(Object.values(apps?.brands || {}).map((b) => b.vehicle));
  for (const cat of ['vehicles', 'bags']) {
    const table = gear[cat] || {};
    const add = (level, ref, field, msg) => out.push({ level, tab: 'gear', cat, ref, field, msg });
    for (const id of PROTECTED[cat]) if (!table[id]) add('error', id, 'id', `Thiếu "${id}" (code dùng trực tiếp).`);
    for (const [key, s] of Object.entries(table)) {
      if (!ID_RE.test(key)) add('error', key, 'id', 'Mã chỉ gồm chữ không dấu, số, gạch dưới.');
      if (s.id !== key) add('error', key, 'id', `Mã bên trong (${s.id}) khác khóa (${key}).`);
      if (!s.name || !String(s.name).trim()) add('error', key, 'name', 'Chưa có tên.');
      const pedal = cat === 'vehicles' && s.power === 'pedal';
      for (const [f, [a, b]] of Object.entries(RANGES[cat])) {
        if (pedal && (f === 'fuelPer100km' || f === 'tank')) continue; // xe đạp không có xăng / pin
        if (!num(s[f])) add('error', key, f, 'Phải là số.');
        else if (s[f] < a || s[f] > b) add('error', key, f, `Phải trong khoảng ${a}–${b}.`);
      }
      if (cat === 'vehicles' && !(s.power in POWER_LABELS)) add('error', key, 'power', `Loại xe phải là: ${Object.keys(POWER_LABELS).join(', ')}.`);
      if (cat === 'bags' && (!Number.isInteger(s.cols) || !Number.isInteger(s.rows))) add('error', key, 'cols', 'Số ô phải là số nguyên.');
      if (cat === 'bags' && s.cols * s.rows < 2) add('warn', key, 'cols', 'Túi chỉ có 1 ô → không chở được đơn 2 món.');
      if (!COLOR_RE.test(s.color || '')) add('error', key, 'color', 'Màu phải dạng #rrggbb.');
      if (cat === 'vehicles') {
        if (s.model == null) add('warn', key, 'model', 'Chưa chọn kiểu dáng → hiện như xe số.');
        else if (!(s.model in VEHICLE_MODELS)) add('error', key, 'model', `Kiểu dáng phải là: ${Object.keys(VEHICLE_MODELS).join(', ')}.`);
      }
      if (s.price === 0 && !PROTECTED[cat].includes(key) && !brandVehicles.has(key)) add('warn', key, 'price', 'Giá 0 → người chơi lấy miễn phí ngay từ đầu.');
    }
    if (cat === 'bags' && table.nylon && table.nylon.price !== 0) add('warn', 'nylon', 'price', 'Túi nylon là túi khởi đầu, nên để giá 0.');
    if (cat === 'vehicles' && table.xeDap && table.xeDap.power !== 'pedal') add('warn', 'xeDap', 'power', 'Xe khởi đầu nên là xe đạp (chưa vào hãng thì chưa chạy đơn).');
  }
  if (!Object.values(gear.bags || {}).some((b) => b.insulation >= 0.5)) out.push({ level: 'warn', tab: 'gear', cat: 'bags', ref: '', field: 'insulation', msg: 'Không túi nào giữ nhiệt ≥ 50% → đơn trà sữa, kem không bao giờ mở khóa.' });
  return out;
}

export function validatePlaces(pd, items, goodsTable = null, gearTable = null, mapData = undefined) {
  const waterBlocks = riverInfo(mapData).waterBlocks; // khối nằm dưới sông lớn
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'places', ref, field, msg });
  const places = pd.places || [];
  const presets = pd.hourPresets || {};
  // khung giờ mẫu
  for (const [key, h] of Object.entries(presets)) {
    if (!ID_RE.test(key) || h.id !== key) add('error', `hour:${key}`, 'id', `Mã khung giờ mẫu "${key}" không hợp lệ hoặc khác khóa.`);
    if (!h.name || !String(h.name).trim()) add('error', `hour:${key}`, 'name', 'Khung giờ mẫu chưa có tên.');
    const bad = h.ranges == null ? 'Chưa có đoạn giờ nào.' : typeof h.ranges === 'string' ? 'Khung giờ mẫu không được trỏ tới mẫu khác.' : hoursProblem(h.ranges, presets);
    if (bad) add('error', `hour:${key}`, 'ranges', `"${h.name || key}": ${bad}`);
  }
  const ids = new Set();
  for (const id of PROTECTED.places) if (!places.some((p) => p.id === id)) add('error', id, 'id', `Thiếu địa điểm bắt buộc "${id}".`);
  if (!places.some((p) => p.kind === 'restaurant')) add('error', '', 'kind', 'Cần ít nhất một quán ăn.');
  const occupied = new Map();
  const alleyKey = `${pd.alley.block[0]},${pd.alley.block[1]},${pd.alley.lot}`;
  for (const p of places) {
    if (tooNewEmoji(p.icon)) add('warn', p.id, 'icon', NEW_EMOJI_MSG);
    if (tooNewEmoji(p.npc?.portrait)) add('warn', p.id, 'portrait', NEW_EMOJI_MSG);
    if (!ID_RE.test(p.id)) add('error', p.id, 'id', 'Mã chỉ gồm chữ không dấu, số, gạch dưới.');
    if (ids.has(p.id)) add('error', p.id, 'id', 'Trùng mã với địa điểm khác.');
    ids.add(p.id);
    if (!p.name || !String(p.name).trim()) add('error', p.id, 'name', 'Chưa có tên.');
    if (!p.short) add('warn', p.id, 'short', 'Chưa có tên ngắn (hiện trên biển hiệu / thực đơn).');
    if (!isPlaced(p)) {
      // nằm chờ trong danh sách, chưa kéo vào bản đồ → game chưa có địa điểm này
      if (PROTECTED.places.includes(p.id)) add('error', p.id, 'block', 'Địa điểm bắt buộc — phải đặt trên bản đồ (thẻ 🏗️ Xây dựng).');
      else add('warn', p.id, 'block', 'Chưa đặt trên bản đồ — game chưa có địa điểm này. Kéo vào bản đồ ở thẻ 🏗️ Xây dựng.');
    }
    const [bx, bz] = p.block || [];
    if (isPlaced(p) && (!Number.isInteger(bx) || !Number.isInteger(bz) || bx < 0 || bz < 0 || bx >= CITY.N || bz >= CITY.N)) add('error', p.id, 'block', `Khối phải từ 0 đến ${CITY.N - 1}.`);
    const plan = Number.isInteger(bx) && Number.isInteger(bz) ? blockPlan(bx, bz, mapData) : null;
    // lô gộp 2 khối (sân bay…): bản đồ phải có gộp đúng cặp khối đó
    if (isJoinLot(p.lot) && !joinList(mapData).some(([x, z, d]) => x === bx && z === bz && d === (p.lot === 'JE' ? 'E' : 'S'))) {
      add('error', p.id, 'lot', `Lô gộp 2 khối cần gộp khối ${bx},${bz} với khối bên ${p.lot === 'JE' ? 'phải' : 'dưới'} (thẻ Bản đồ → Gộp khối).`);
    }
    if (isPlaced(p) && lotCells(p).some((c) => waterBlocks.has(c.split(',').slice(0, 2).join(',')))) add('error', p.id, 'block', `Khối ${bx},${bz} nằm dưới sông lớn — dời địa điểm sang khối khác.`);
    if (!isPlaced(p)) {
      /* chưa đặt: bỏ qua kiểm tra vị trí */
    } else if (plan) {
      // khối có hẻm: chỉ đặt được vào lô có cửa của mặt bằng hẻm (1 lô, mặt tiền theo lô)
      const l = plan.lots.find((x) => x.id === p.lot);
      if (p.kind === 'gate') add('error', p.id, 'lot', 'Nhà cổng xanh phải ở khối không hẻm (lô C của hẻm 42).');
      else if (!l) add('error', p.id, 'lot', `Khối ${bx},${bz} có hẻm — chọn một lô của hẻm (bấm vào nhà trên bản đồ). Lô "${p.lot}" không có trong khối này.`);
      else if (p.face != null && p.face !== l.face) add('error', p.id, 'face', 'Lô trong khối có hẻm có mặt tiền cố định — bỏ chọn hướng mặt tiền.');
      // đổ xăng / sửa xe cần dắt xe tới cửa — hẻm đi bộ có cột chắn, xe không vào được
      const NEED_BIKE = { gas: ['Cây xăng', 'đổ xăng'], garage: ['Tiệm xe', 'sửa xe'], charger: ['Trụ sạc', 'sạc xe'], swap: ['Trạm đổi pin', 'đổi pin'] };
      if (l && !l.front && plan.walk && NEED_BIKE[p.kind]) add('warn', p.id, 'lot', `${NEED_BIKE[p.kind][0]} nằm trong hẻm đi bộ — xe máy không vào được nên không ${NEED_BIKE[p.kind][1]} được. Chọn nhà mặt phố hoặc khối hẻm xe máy.`);
      for (const c of lotCells(p)) {
        if (occupied.has(c)) add('error', p.id, 'lot', `Trùng lô với "${occupied.get(c)}".`);
        else occupied.set(c, p.id);
      }
    } else if (!LOTS.includes(p.lot)) add('error', p.id, 'lot', 'Lô không hợp lệ.');
    else {
      if (p.lot === 'C' && p.kind !== 'gate') add('error', p.id, 'lot', 'Lô C (sân trong hẻm) chỉ dành cho nhà cổng xanh.');
      if (p.kind === 'gate' && (p.lot !== 'C' || bx !== pd.alley.block[0] || bz !== pd.alley.block[1])) add('error', p.id, 'lot', 'Nhà cổng xanh phải ở lô C của khối có hẻm 42.');
      if (p.face != null && !lotFaces(p.lot).includes(p.face)) add('error', p.id, 'face', `Lô ${p.lot} không có mặt tiền hướng "${p.face}" ra đường — chọn: ${lotFaces(p.lot).join(', ')}.`);
      for (const c of lotCells(p)) {
        if (c === alleyKey) add('error', p.id, 'lot', 'Lô này là lối vào hẻm 42.');
        if (occupied.has(c)) add('error', p.id, 'lot', `Trùng lô với "${occupied.get(c)}".`);
        else occupied.set(c, p.id);
      }
    }
    if (!COLOR_RE.test(p.color || '')) add('error', p.id, 'color', 'Màu tường phải dạng #rrggbb.');
    if (p.kind !== 'gas' && p.kind !== 'gate' && p.kind !== 'market' && p.kind !== 'scenery' && p.sign == null) add('warn', p.id, 'sign', 'Chưa có biển hiệu.');
    // cỡ cả khối: cảnh quan hoặc chùa tứ hợp viện · cả khối chừa góc: chỉ chùa tứ hợp viện (cảnh quan phủ kín khối)
    const courtyard = lookOf(p) === 'pagodaCourtyard', campus = CAMPUS_LOOKS.includes(lookOf(p));
    if (p.lot === 'B' && p.kind !== 'scenery' && !courtyard && !campus) add('error', p.id, 'lot', 'Cỡ "Cả khối" chỉ dành cho cảnh quan, chùa tứ hợp viện hoặc trường đại học.');
    if (p.lot === 'M' && p.kind !== 'scenery') add('error', p.id, 'lot', 'Ô giữa khối (M) không chạm đường — chỉ đặt cảnh quan (công viên, đất trống…).');
    if (cutCell(p.lot || '') && !courtyard) add('error', p.id, 'lot', 'Cỡ "Cả khối, chừa 1 góc" chỉ dành cho chùa tứ hợp viện.');
    if (courtyard && isPlaced(p) && p.lot !== 'B' && !cutCell(p.lot)) add('error', p.id, 'lot', 'Chùa tứ hợp viện chiếm cả khối — chọn kích thước "Cả khối" hoặc "Cả khối, chừa 1 góc" (khối không hẻm).');
    if (p.look != null && LOOKS[p.look] && !looksFor(p.kind).includes(p.look)) add('error', p.id, 'look', p.kind === 'scenery' ? 'Cảnh quan chỉ dùng kiểu cảnh quan (công viên, đất trống, sân bóng, bãi giữ xe, công trình).' : LOOKS[p.look].scenery ? `Kiểu "${LOOKS[p.look].label}" chỉ dành cho loại Cảnh quan.` : `Loại này không dùng được kiểu "${LOOKS[p.look].label}".`);
    if (p.kind === 'police' && isPlaced(p) && lotParts(p.lot).length < 2) add('error', p.id, 'lot', 'Đồn công an cần ít nhất 2 lô (nhà công an + bãi giữ xe vi phạm) — đổi kích thước 2 lô / cả dãy, đặt ở khối không hẻm.');
    if (p.signBg && !COLOR_RE.test(p.signBg)) add('error', p.id, 'signBg', 'Màu biển phải dạng #rrggbb.');
    if (p.signV != null && typeof p.signV !== 'boolean') add('error', p.id, 'signV', 'Biển dọc phải là có / không.');
    if (p.xeOm != null && typeof p.xeOm !== 'boolean') add('error', p.id, 'xeOm', 'Chú xe ôm phải là có / không.');
    if (p.signVText != null && (typeof p.signVText !== 'string' || [...p.signVText.replace(/\s+/g, '')].length > 8)) add('warn', p.id, 'signVText', 'Chữ biển dọc nên ngắn (tối đa 8 chữ cái) — viết dọc từng chữ.');
    if (p.floors != null && (!Number.isInteger(p.floors) || p.floors < 1 || p.floors > 15)) add('error', p.id, 'floors', 'Số tầng 1–15.');
    // kiểu nhà (hình dáng) + số tầng cho phép theo kiểu
    if (p.look != null && !LOOKS[p.look]) add('error', p.id, 'look', `Kiểu nhà lạ: ${p.look}.`);
    // chỉ kiểm khi đã tự chọn kiểu (kiểu tự đoán thì lúc vẽ tự kéo số tầng vào khoảng, không báo lỗi dữ liệu cũ)
    const fr = LOOKS[p.look]?.floors;
    if (fr && Number.isInteger(p.floors) && (p.floors < fr[0] || p.floors > fr[1])) add('error', p.id, 'floors', `Kiểu nhà "${LOOKS[lookOf(p)].label}": số tầng ${fr[0]}–${fr[1]}.`);
    if (p.npc) {
      if (!p.npc.name) add('error', p.id, 'npc.name', 'NPC chưa có tên.');
      for (const f of ['shirt', 'pants', 'hair', 'skin']) if (p.npc[f] && !COLOR_RE.test(p.npc[f])) add('error', p.id, `npc.${f}`, 'Màu phải dạng #rrggbb.');
      if (p.npc.gender != null && !GENDERS.includes(p.npc.gender)) add('error', p.id, 'npc.gender', 'Giới tính phải là "m" (nam) hoặc "f" (nữ).');
      if (p.npc.hairStyle != null && !HAIR_STYLES.includes(p.npc.hairStyle)) add('error', p.id, 'npc.hairStyle', `Kiểu tóc phải là: ${HAIR_STYLES.join(', ')}.`);
      if (p.npc.skirt != null && typeof p.npc.skirt !== 'boolean') add('error', p.id, 'npc.skirt', 'Mặc váy phải là true/false.');
    }
    if (p.kind === 'restaurant') {
      if (!p.menu || !p.menu.length) add('error', p.id, 'menu', 'Quán chưa bán món nào.');
      for (const m of p.menu || []) {
        if (!items[m]) add('error', p.id, 'menu', `Món "${m}" không tồn tại.`);
        else if (items[m].traits.includes('passenger')) add('error', p.id, 'menu', 'Quán không bán "khách xe ôm".');
      }
    }
    if (!PLACE_KINDS.includes(p.kind)) add('error', p.id, 'kind', `Loại địa điểm lạ: ${p.kind}.`);
    // giờ mở cửa
    if (p.hours != null) {
      const bad = hoursProblem(p.hours, presets);
      if (bad) add('error', p.id, 'hours', `Giờ mở cửa: ${bad}`);
      else if (totalHours(p.hours, presets) < 1) add('warn', p.id, 'hours', 'Mở cửa chưa tới 1 tiếng.');
    }
    // hoạt động
    const actIds = new Set();
    for (const act of p.activities || []) {
      const f = `activities.${act.id}`;
      if (!ID_RE.test(act.id || '')) add('error', p.id, f, 'Mã hoạt động chỉ gồm chữ không dấu, số, gạch dưới.');
      if (actIds.has(act.id)) add('error', p.id, f, 'Trùng mã hoạt động.');
      actIds.add(act.id);
      if (!act.label || !String(act.label).trim()) add('error', p.id, f, 'Hoạt động chưa có tên.');
      for (const [k, name, lo, hi] of [['cost', 'Giá', 0, 10000], ['minutes', 'Số phút', 0, 480], ['phys', 'Thể lực', -100, 100], ['mental', 'Tinh thần', -100, 100], ['perDay', 'Tối đa mỗi ngày', 0, 20]]) {
        if (!num(act[k]) || act[k] < lo || act[k] > hi) add('error', p.id, f, `"${act.label || act.id}": ${name} phải là số từ ${lo} đến ${hi}.`);
      }
      if (num(act.minutes) && act.minutes > 120) add('warn', p.id, f, 'Hoạt động hơn 2 tiếng — tốn nhiều thời gian trong ngày.');
      if (act.stopOnOrder != null && typeof act.stopOnOrder !== 'boolean') add('error', p.id, f, `"${act.label || act.id}": "Dừng khi có đơn" phải là true/false.`);
      drainWarn(add, p.id, f, act.phys, act.mental, `"${act.label || act.id}": `);
      if (act.needs != null) {
        const g = goodsTable && goodsTable[act.needs.id];
        if (!act.needs.id || (goodsTable && !g)) add('error', p.id, f, `"${act.label || act.id}": cần đồ "${act.needs.id}" nhưng không có trong danh mục đồ dùng.`);
        else if (g && (g.type === 'equipment' || g.type === 'outfit')) add('error', p.id, f, `"${act.label || act.id}": trang bị / trang phục không bị dùng hết — chọn đồ loại "dùng tại địa điểm" hoặc "dùng 1 lần".`);
        if (!Number.isInteger(act.needs.qty) || act.needs.qty < 1 || act.needs.qty > 10) add('error', p.id, f, `"${act.label || act.id}": số lượng đồ cần từ 1 đến 10.`);
      }
      if (!act.cost && !act.perDay && Math.max(0, act.phys || 0) + Math.max(0, act.mental || 0) > 10) add('warn', p.id, f, `"${act.label || act.id}": miễn phí, không giới hạn lần mà hồi hơn 10 điểm → người chơi có thể hồi đầy thanh liên tục. Đặt giá hoặc giới hạn lần/ngày.`);
    }
    // hàng bán
    for (const [k, table] of [['goods', goodsTable], ['bags', gearTable?.bags], ['vehicles', gearTable?.vehicles]]) {
      for (const id of p.sells?.[k] || []) if (table && !table[id]) add('error', p.id, `sells.${k}`, `Bán "${id}" nhưng không có trong danh mục.`);
    }
    if (p.buys != null && typeof p.buys !== 'boolean') add('error', p.id, 'buys', '"Thu mua đồ cũ" phải là true/false.');
    // điểm đến của đơn
    if (p.orders) {
      for (const k of ['rideWeight', 'foodWeight', 'parcelWeight']) if (p.orders[k] != null && (!num(p.orders[k]) || p.orders[k] < 0 || p.orders[k] > 10)) add('error', p.id, `orders.${k}`, 'Mức độ thường xuyên từ 0 đến 10.');
      if (p.orders.parcelItems != null) {
        if (!Array.isArray(p.orders.parcelItems)) add('error', p.id, 'orders.parcelItems', 'Hàng riêng của tiệm phải là danh sách mã món.');
        else for (const id of p.orders.parcelItems) if (!items?.[id]) add('error', p.id, 'orders.parcelItems', `Món "${id}" không có.`);
          else if (!items[id].parcel) add('error', p.id, 'orders.parcelItems', `Món "${id}" chưa đánh dấu là hàng giao (parcel).`);
        if (Array.isArray(p.orders.parcelItems) && p.orders.parcelItems.length && !(p.orders.parcelWeight > 0)) add('warn', p.id, 'orders.parcelItems', 'Có hàng riêng nhưng "Gửi hàng từ đây" = 0 → không có đơn nào lấy ở đây.');
      }
      const bad = hoursProblem(p.orders.hours, presets);
      if (bad) add('error', p.id, 'orders.hours', `Khung giờ có đơn: ${bad}`);
    }
  }
  for (const [k, arr] of [['streetsX', pd.streetsX], ['streetsZ', pd.streetsZ]]) {
    if (!Array.isArray(arr) || arr.length !== CITY.N + 1) add('error', '', k, `Cần đúng ${CITY.N + 1} tên đường.`);
    else arr.forEach((s, i) => !String(s).trim() && add('error', '', k, `Tên đường số ${i + 1} đang trống.`));
  }
  if (!pd.customerNames || !pd.customerNames.filter((s) => String(s).trim()).length) add('error', '', 'customerNames', 'Cần ít nhất 1 tên khách.');
  // mở theo chương (cốt truyện)
  for (const p of places) {
    if (p.openChapter != null && !(Number.isInteger(p.openChapter) && p.openChapter >= 1 && p.openChapter <= 50)) add('error', p.id, 'openChapter', 'Mở từ chương phải là số nguyên 1–50.');
    else if (p.openChapter > 1 && PROTECTED.places.includes(p.id)) add('error', p.id, 'openChapter', 'Địa điểm gắn với code → phải luôn mở (chương 1).');
    if (p.openDay != null) add('warn', p.id, 'openDay', 'Ô "mở từ ngày" của địa điểm đã bỏ — dùng "Mở từ chương" (thẻ Địa điểm → Giờ mở cửa).');
    if (p.nap != null && typeof p.nap !== 'boolean') add('error', p.id, 'nap', 'Ô "Cho chợp mắt" phải là true/false.');
    // bến phà: ô "Bến bên kia" phải trỏ tới một bến phà khác
    if (p.ferryTo != null) {
      const q = places.find((x) => x.id === p.ferryTo);
      if (lookOf(p) !== 'ferry') add('warn', p.id, 'ferryTo', 'Chỉ bến phà (kiểu nhà "Bến phà") mới dùng ô "Bến bên kia".');
      else if (!q || q.id === p.id || lookOf(q) !== 'ferry') add('error', p.id, 'ferryTo', `"Bến bên kia" phải là một bến phà khác (đang là "${p.ferryTo}").`);
      else if (q.ferryTo && q.ferryTo !== p.id) add('warn', p.id, 'ferryTo', `"${q.name}" đang nối tới bến khác — phà chỉ chạy giữa 2 bến nối nhau.`);
    } else if (lookOf(p) === 'ferry' && isPlaced(p) && !places.some((x) => x.ferryTo === p.id)) add('warn', p.id, 'ferryTo', 'Bến phà chưa nối với bến nào — chọn "Bến bên kia" để có phà chạy.');
    if (p.nap && p.kind === 'home') add('warn', p.id, 'nap', 'Phòng trọ đã có giường ngủ — ô chợp mắt không có tác dụng.');
    if (p.kind === 'restaurant' && items && (p.menu || []).length) {
      const first = Math.min(...p.menu.filter((id) => items[id]).map((id) => openDayOf(items[id])));
      if (Number.isFinite(first) && first > openDayOf(p)) add('warn', p.id, 'openDay', `Quán mở ngày ${openDayOf(p)} nhưng tới ngày ${first} mới có món nào có đơn.`);
    }
  }
  if (items && !places.some((p) => p.kind === 'restaurant' && openDayOf(p) === 1 && (p.menu || []).some((id) => items[id] && openDayOf(items[id]) === 1))) {
    add('warn', '', 'openDay', 'Ngày 1 không có quán ăn nào có món → ngày đầu không có đơn đồ ăn.');
  }
  // nhà dân còn lại làm điểm giao hàng (tòa nhà lớn chiếm bớt)
  if (blockPlan(pd.alley.block[0], pd.alley.block[1], mapData)) add('error', '', 'alley', `Khối ${pd.alley.block.join(',')} chứa hẻm 42 (nhà cổng xanh) — phải để kiểu "không hẻm" ở thẻ Bản đồ.`);
  let allLots = 0;
  for (let bz = 0; bz < CITY.N; bz++) for (let bx = 0; bx < CITY.N; bx++) allLots += blockLotIds(bx, bz, mapData).length;
  const homes = allLots - [...occupied.keys()].filter((c) => !c.endsWith(',C')).length - 1; // − lô lối vào hẻm 42
  const minHomes = Math.round(CITY.N * CITY.N * 4.8); // bản 5×5 cũ: 120
  if (homes < minHomes) add('warn', '', 'lot', `Chỉ còn ${homes} nhà khách làm điểm giao (nên ≥ ${minHomes}) — tòa nhà lớn đang chiếm nhiều lô.`);
  return out;
}

// Tham số {x} trong chuỗi / danh sách
export function paramsIn(value) {
  const out = new Set();
  for (const s of Array.isArray(value) ? value : [value]) for (const m of String(s).matchAll(/\{(\w+)\}/g)) out.add(m[1]);
  return out;
}

const TAGS = ['b', 'i', 'small', 'kbd', 'span'];
export function tagProblems(s) {
  const bad = [];
  for (const t of TAGS) {
    const open = (String(s).match(new RegExp(`<${t}[\\s>]`, 'g')) || []).length;
    const close = (String(s).match(new RegExp(`</${t}>`, 'g')) || []).length;
    if (open !== close) bad.push(t);
  }
  return bad;
}

// base: bản gốc trên đĩa (để biết code truyền tham số nào cho mỗi khóa)
export function validateContent(content, base) {
  const out = [];
  const add = (level, ref, msg) => out.push({ level, tab: 'text', ref, field: 'text', msg });
  for (const key of Object.keys(base)) if (!(key in content)) add('error', key, 'Khóa bị xóa — code vẫn dùng khóa này.');
  for (const [key, v] of Object.entries(content)) {
    const arr = Array.isArray(v) ? v : [v];
    if (Array.isArray(base[key]) !== Array.isArray(v) && key in base) add('error', key, Array.isArray(base[key]) ? 'Khóa này phải là danh sách.' : 'Khóa này phải là 1 câu.');
    if (!arr.length || arr.some((s) => typeof s !== 'string')) add('error', key, 'Nội dung không hợp lệ.');
    if (Array.isArray(v) ? !v.length : !String(v).trim()) {
      // chuỗi rỗng được phép cho vài khóa ghép (bắt đầu bằng dấu cách) – chỉ cảnh báo
      add('warn', key, 'Đang để trống.');
    }
    if (key in base) {
      const allowed = paramsIn(base[key]);
      const used = paramsIn(v);
      for (const p of used) if (!allowed.has(p)) add('error', key, `Tham số {${p}} không có — game chỉ cung cấp: ${[...allowed].map((x) => `{${x}}`).join(' ') || '(không có)'}.`);
      for (const p of allowed) if (!used.has(p) && !Array.isArray(v)) add('warn', key, `Bỏ mất tham số {${p}}.`);
    }
    for (const s of arr) {
      const bad = tagProblems(s);
      if (bad.length) add('warn', key, `Thẻ HTML chưa đóng/mở đủ: ${bad.map((t) => `<${t}>`).join(', ')}.`);
    }
  }
  return out;
}

// Đồ dùng (goods.json): tiêu hao + trang bị
export function validateGoods(goods, placesData, gifts = new Set()) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'gear', cat: 'goods', ref, field, msg });
  const sold = new Set((placesData?.places || []).flatMap((p) => p.sells?.goods || []));
  for (const [key, s] of Object.entries(goods)) {
    if (tooNewEmoji(s.icon)) add('warn', key, 'icon', NEW_EMOJI_MSG);
    if (!ID_RE.test(key)) add('error', key, 'id', 'Mã chỉ gồm chữ không dấu, số, gạch dưới.');
    if (s.id !== key) add('error', key, 'id', `Mã bên trong (${s.id}) khác khóa (${key}).`);
    if (!s.name || !String(s.name).trim()) add('error', key, 'name', 'Chưa có tên.');
    if (!num(s.price) || s.price < 0 || s.price > 100000) add('error', key, 'price', 'Giá phải từ 0 đến 100000.');
    if (s.type === 'consumable') {
      const u = s.use || {};
      for (const [k, r] of Object.entries(CONSUMABLE_FIELDS)) if (u[k] != null && (!num(u[k]) || u[k] < r.min || u[k] > r.max)) add('error', key, `use.${k}`, `Phải từ ${r.min} đến ${r.max}.`);
      if (!u.phys && !u.mental && !u.fuel && !u.bikeHp) add('warn', key, 'use', 'Dùng xong không có tác dụng gì.');
      if (u.leaves != null && goods[u.leaves]?.type !== 'carry') add('error', key, 'use.leaves', `"Dùng xong còn lại" phải là món loại "dùng tại địa điểm" (vd vỏ chai), không phải: ${u.leaves}.`);
      drainWarn(add, key, u.phys <= -30 ? 'use.phys' : 'use.mental', u.phys, u.mental, '');
      const gain = Math.max(0, u.phys || 0) + Math.max(0, u.mental || 0);
      if (num(s.price) && gain > 0) {
        if (s.price === 0 && !gifts.has(key)) add('warn', key, 'price', 'Miễn phí mà có tác dụng → người chơi mua bao nhiêu cũng được.'); // quà trong cốt truyện (không bán) thì không sao
        else if (gain / s.price > 3) add('warn', key, 'price', `Rẻ so với tác dụng (+${gain} điểm / ${s.price}k). Tham khảo: cà phê 20k cho +35, phở 35k cho +50.`);
      }
    } else if (s.type === 'equipment' || s.type === 'outfit') {
      const e = s.effects || {};
      for (const [k, v] of Object.entries(e)) {
        const def = EFFECTS[k];
        if (!def) add('error', key, `effects.${k}`, `Tác dụng lạ: ${k}.`);
        else if (def.kind !== 'bool' && (!num(v) || v < def.min || v > def.max)) add('error', key, `effects.${k}`, `Phải từ ${def.min} đến ${def.max}.`);
      }
      if (s.type === 'equipment' && !Object.values(e).some((v) => v)) add('warn', key, 'effects', 'Trang bị chưa có tác dụng nào.');
      if (s.type === 'outfit') {
        const slot = OUTFIT_SLOTS[s.slot];
        if (!slot) add('error', key, 'slot', `Chỗ mặc phải là: ${Object.keys(OUTFIT_SLOTS).join(', ')}.`);
        else if (!(s.style in slot.styles)) add('error', key, 'style', `Kiểu phải là: ${Object.keys(slot.styles).join(', ')}.`);
        if (!COLOR_RE.test(s.color || '')) add('error', key, 'color', 'Màu phải dạng #rrggbb.');
        if (s.color2 != null && !COLOR_RE.test(s.color2)) add('error', key, 'color2', 'Màu phụ phải dạng #rrggbb.');
        if (s.gender != null && s.gender !== 'f') add('error', key, 'gender', 'Ai mặc: bỏ trống (mọi người) hoặc "f" (chỉ nữ).');
        if (FEMALE_STYLES.includes(s.style) && s.gender !== 'f') add('warn', key, 'gender', 'Kiểu này là đồ nữ — nên chọn "Ai mặc: Chỉ nhân vật nữ".');
        if (s.start != null && typeof s.start !== 'boolean') add('error', key, 'start', 'Chọn lúc tạo nhân vật phải là có / không.');
        else if (s.start && s.price !== 0) add('error', key, 'start', 'Chỉ món giá 0 mới chọn lúc tạo nhân vật được.');
      }
    } else if (s.type === 'carry') {
      if (s.scrapPrice != null && (!num(s.scrapPrice) || s.scrapPrice < 0 || s.scrapPrice > 100)) add('error', key, 'scrapPrice', 'Giá bán ve chai phải từ 0 đến 100.');
      const scrap = s.scrapPrice > 0;
      if (scrap && placesData && !(placesData.places || []).some((p) => p.buys)) add('warn', key, 'scrapPrice', 'Chưa địa điểm nào "Thu mua đồ cũ" → không bán được.');
      // dùng tại địa điểm: phải có hoạt động nào đó cần món này (phế liệu bán ve chai thì thôi)
      if (!scrap && placesData && !(placesData.places || []).some((p) => (p.activities || []).some((a) => a.needs?.id === key))) add('warn', key, 'type', 'Chưa địa điểm nào có hoạt động cần món này → mua về không dùng được. Thêm ô "Cần đồ" ở hoạt động (thẻ Địa điểm).');
    } else add('error', key, 'type', 'Loại phải là "đồ dùng 1 lần", "trang bị", "dùng tại địa điểm" hoặc "trang phục".');
    // trang phục giá 0 là đồ có sẵn, không cần nơi bán
    const madeInGame = Object.values(goods).some((x) => x.use?.leaves === key) || gifts.has(key); // vỏ chai (có sau khi uống) · quà trong cốt truyện: không cần nơi bán
    if (placesData && !sold.has(key) && !madeInGame && !(s.type === 'outfit' && s.price === 0)) add('warn', key, 'sells', 'Chưa địa điểm nào bán món này.');
    // phụ kiện (kể cả mũ bảo hiểm) giá 0 không tự có → chỉ có khi là quà vào hãng
    if (s.type === 'outfit' && s.price === 0 && OUTFIT_SLOTS[s.slot]?.accessory && !s.brand) add('warn', key, 'price', 'Phụ kiện giá 0 không ai có sẵn (mũ bảo hiểm lúc đầu không có) → chỉ có nếu là quà vào hãng. Đặt giá + nơi bán, hoặc xóa món này.');
  }
  for (const [slot, def] of Object.entries(OUTFIT_SLOTS)) {
    if (def.accessory) continue; // phụ kiện được để trống
    if (!Object.values(goods).some((g) => g.type === 'outfit' && g.slot === slot && g.price === 0)) out.push({ level: 'warn', tab: 'gear', cat: 'goods', ref: '', field: 'slot', msg: `Chưa có ${def.label.toLowerCase()} giá 0 (có sẵn) → shipper mặc ${def.label.toLowerCase()} mặc định cho tới khi mua.` });
  }
  const has = (eff) => Object.values(goods).some((g) => (g.type === 'equipment' || g.type === 'outfit') && g.effects?.[eff] && sold.has(g.id));
  if (placesData && !has('passengerSeat')) out.push({ level: 'warn', tab: 'gear', cat: 'goods', ref: '', field: 'effects', msg: 'Không nơi nào bán trang bị "Chở được khách" → đơn xe ôm (và nhiệm vụ chiếc ví) không bao giờ mở.' });
  if (placesData && !has('rainProtect')) out.push({ level: 'warn', tab: 'gear', cat: 'goods', ref: '', field: 'effects', msg: 'Không nơi nào bán trang bị "Chống mưa".' });
  return out;
}

// Bản đồ (map.json): cỡ, kiểu hẻm từng khối, sông + cầu (sông không được cắt rời thành phố)
export function validateMap(map, placesData = null) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'map', ref, field, msg });
  if (!map || typeof map !== 'object') return [{ level: 'error', tab: 'map', ref: '', field: '', msg: 'Thiếu dữ liệu bản đồ.' }];
  if (!Number.isInteger(map.size) || map.size < 3 || map.size > 12) add('error', '', 'size', 'Cỡ bản đồ: số nguyên 3–12 khối.');
  else if (map.size !== CITY.N) add('warn', '', 'size', `Đổi cỡ bản đồ (${CITY.N} → ${map.size}) cần tải lại trang sau khi lưu; nhớ sửa đủ ${map.size + 1} tên đường mỗi chiều.`);
  if (placesData && Number.isInteger(map.size)) {
    for (const k of ['streetsX', 'streetsZ']) if ((placesData[k] || []).length !== map.size + 1) add('error', '', 'size', `Bản đồ ${map.size} khối cần ${map.size + 1} tên đường (${k === 'streetsX' ? 'dọc' : 'ngang'}) — đang có ${(placesData[k] || []).length}. Sửa ở thẻ Địa điểm → Tên đường.`);
  }
  for (const [key, s] of Object.entries(map.blocks || {})) {
    const m = /^(\d+),(\d+)$/.exec(key);
    if (!m || +m[1] >= (map.size || CITY.N) || +m[2] >= (map.size || CITY.N)) add('error', key, 'block', 'Khối nằm ngoài bản đồ.');
    if (!ALLEY_TEMPLATES[s.alley]) add('error', key, 'alley', `Kiểu hẻm phải là: ${Object.keys(ALLEY_TEMPLATES).join(', ')}.`);
    if (s.rot != null && (!Number.isInteger(s.rot) || s.rot < 0 || s.rot > 3)) add('error', key, 'rot', 'Hướng xoay 0–3.');
    if (s.walk != null && typeof s.walk !== 'boolean') add('error', key, 'walk', 'Hẻm đi bộ phải là có/không.');
  }
  // gộp khối: [bx, bz, 'E' | 'S'], 2 khối trong bản đồ, không có hẻm, không gộp 1 khối 2 lần, không gộp qua sông
  const sz = Number.isInteger(map.size) ? map.size : CITY.N;
  const usedJ = new Set(), water = riverInfo(map).waterSegs;
  for (const j of map.joins || []) {
    const ok = Array.isArray(j) && Number.isInteger(j[0]) && Number.isInteger(j[1]) && (j[2] === 'E' || j[2] === 'S');
    const ref = `join:${Array.isArray(j) ? j.join(',') : '?'}`;
    if (!ok) { add('error', ref, 'joins', 'Gộp khối phải dạng [cột, hàng, "E" (gộp khối bên phải) | "S" (gộp khối bên dưới)].'); continue; }
    const [bx, bz, d] = j, px = d === 'E' ? bx + 1 : bx, pz = d === 'S' ? bz + 1 : bz;
    if (bx < 0 || bz < 0 || px >= sz || pz >= sz) { add('error', ref, 'joins', `Gộp khối ${bx},${bz} với ${px},${pz}: ra ngoài bản đồ.`); continue; }
    for (const k of [`${bx},${bz}`, `${px},${pz}`]) {
      if (usedJ.has(k)) add('error', ref, 'joins', `Khối ${k} đã gộp với khối khác (mỗi khối chỉ gộp 1 lần).`);
      usedJ.add(k);
      if (map.blocks && map.blocks[k]) add('error', ref, 'joins', `Khối ${k} có hẻm — bỏ hẻm trước khi gộp.`);
    }
    if (water.has(joinSeg(j))) add('error', ref, 'joins', 'Giữa 2 khối là sông — không gộp được.');
    if (placesData && !(placesData.places || []).some((p) => Array.isArray(p.block) && isJoinLot(p.lot) && p.block[0] === bx && p.block[1] === bz && p.lot === (d === 'E' ? 'JE' : 'JS'))) add('warn', ref, 'joins', `Đã gộp khối ${bx},${bz} + ${px},${pz} nhưng chưa có địa điểm nào đặt vào lô gộp (vd sân bay) → nhà dân sẽ quay ra khoảng đất trống.`);
  }
  // khu phố: tên, màu; khối gán khu phố phải nằm trong bản đồ và trỏ tới khu phố có thật
  const size = Number.isInteger(map.size) ? map.size : CITY.N;
  for (const [id, d] of Object.entries(map.districts || {})) {
    if (!ID_RE.test(id)) add('error', `district:${id}`, 'id', 'Mã khu phố chỉ gồm chữ không dấu, số, gạch dưới.');
    if (!d || !String(d.name || '').trim()) add('error', `district:${id}`, 'name', 'Khu phố chưa có tên.');
    for (const [k, label] of DISTRICT_TRAITS) {
      const v = d?.[k];
      if (v != null && (!num(v) || v < TRAIT_RANGE[0] || v > TRAIT_RANGE[1])) add('error', `district:${id}`, k, `${label}: số từ ${TRAIT_RANGE[0]} đến ${TRAIT_RANGE[1]} (1 = bình thường).`);
    }
    if (d && d.color != null && !/^#[0-9a-f]{6}$/i.test(d.color)) add('error', `district:${id}`, 'color', 'Màu khu phố phải dạng #rrggbb.');
    // nhà dân / trang trí / cây xanh (chỉ hình dáng)
    if (d && d.houses != null) {
      if (typeof d.houses !== 'object' || Array.isArray(d.houses)) add('error', `district:${id}`, 'houses', 'Tỉ lệ kiểu nhà phải là bảng { kiểu: số }.');
      else {
        for (const [k, w] of Object.entries(d.houses)) {
          if (!HOUSE_STYLE_IDS.includes(k)) add('error', `district:${id}`, 'houses', `Kiểu nhà lạ: ${k}.`);
          else if (!num(w) || w < 0) add('error', `district:${id}`, 'houses', `Tỉ lệ kiểu nhà ${k} phải là số ≥ 0.`);
        }
        if (Object.values(d.houses).every((w) => !(w > 0))) add('warn', `district:${id}`, 'houses', 'Mọi tỉ lệ kiểu nhà đều 0 → khu sẽ dùng toàn nhà ống.');
      }
    }
    if (d && d.decor != null) {
      if (typeof d.decor !== 'object' || Array.isArray(d.decor)) add('error', `district:${id}`, 'decor', 'Trang trí phải là bảng { mã: true }.');
      else for (const k of Object.keys(d.decor)) if (!DECOR_IDS.includes(k)) add('error', `district:${id}`, 'decor', `Trang trí lạ: ${k}.`);
    }
    if (d && d.trees != null && (!num(d.trees) || d.trees < TREES_RANGE[0] || d.trees > TREES_RANGE[1])) add('error', `district:${id}`, 'trees', `Cây xanh: số từ ${TREES_RANGE[0]} đến ${TREES_RANGE[1]} (1 = như cũ).`);
    // độ đông vỉa hè: { bikes, stalls, vendors } mỗi số 0–2
    if (d && d.street != null) {
      if (typeof d.street !== 'object' || Array.isArray(d.street)) add('error', `district:${id}`, 'street', 'Độ đông vỉa hè phải là bảng { bikes, stalls, vendors }.');
      else for (const [k, v] of Object.entries(d.street)) {
        if (!STREET_IDS.includes(k)) add('error', `district:${id}`, `street.${k}`, `Mục độ đông vỉa hè lạ: ${k}.`);
        else if (!num(v) || v < STREET_RANGE[0] || v > STREET_RANGE[1]) add('error', `district:${id}`, `street.${k}`, `Độ đông vỉa hè: số từ ${STREET_RANGE[0]} đến ${STREET_RANGE[1]}.`);
      }
    }
  }
  for (const [key, id] of Object.entries(map.districtBlocks || {})) {
    const m = /^(\d+),(\d+)$/.exec(key);
    if (!m || +m[1] >= size || +m[2] >= size) add('error', `district:${id}`, 'blocks', `Khối ${key} nằm ngoài bản đồ.`);
    else if (!map.districts?.[id]) add('error', `district:${id}`, 'blocks', `Khối ${key} gán vào khu phố "${id}" không có.`);
  }
  // xe buýt: tuyến (id, tên, màu, số xe, điểm ghé là địa điểm có trên bản đồ) + tên trạm
  const placeList = placesData?.places || placesData || [];
  const routeIds = new Set();
  (map.busRoutes || []).forEach((r, i) => {
    const ref = `bus:${r?.id || i}`;
    if (!r || !ID_RE.test(String(r.id || ''))) add('error', ref, 'id', 'Mã tuyến chỉ gồm chữ không dấu, số, gạch dưới.');
    else if (routeIds.has(r.id)) add('error', ref, 'id', `Trùng mã tuyến "${r.id}".`);
    else routeIds.add(r.id);
    if (!String(r?.name || '').trim()) add('error', ref, 'name', 'Tuyến chưa có tên.');
    if (r?.color != null && !/^#[0-9a-f]{6}$/i.test(r.color)) add('error', ref, 'color', 'Màu tuyến phải dạng #rrggbb.');
    if (r?.buses != null && (!Number.isInteger(r.buses) || r.buses < 1 || r.buses > 6)) add('error', ref, 'buses', 'Số xe từ 1 đến 6.');
    const via = Array.isArray(r?.via) ? r.via : [];
    if (via.length < 2) add('error', ref, 'via', 'Tuyến cần ít nhất 2 điểm ghé.');
    for (const id of via) {
      const p = placeList.find((x) => x.id === id);
      if (!p) add('error', ref, 'via', `Điểm ghé "${id}" không có.`);
      else if (!Array.isArray(p.block)) add('error', ref, 'via', `Điểm ghé "${p.name}" chưa đặt trên bản đồ.`);
    }
  });
  if (map.busStopNames != null && (typeof map.busStopNames !== 'object' || Object.values(map.busStopNames).some((v) => typeof v !== 'string'))) add('error', 'bus', 'busStopNames', 'Tên trạm phải là chữ.');
  // tỉ lệ cấp đường của khu phố (districts[mã].roads) + cấp từng đoạn đường (roadTiers)
  for (const [id, d] of Object.entries(map.districts || {})) {
    if (d?.roads == null) continue;
    if (typeof d.roads !== 'object' || Array.isArray(d.roads)) add('error', `district:${id}`, 'roads', 'Tỉ lệ cấp đường phải là bảng { big, normal, small }.');
    else for (const [k, w] of Object.entries(d.roads)) {
      if (!ROAD_TIER_IDS.includes(k)) add('error', `district:${id}`, 'roads', `Cấp đường lạ: ${k}.`);
      else if (!num(w) || w < 0) add('error', `district:${id}`, 'roads', `Tỉ lệ ${k} phải là số ≥ 0.`);
    }
  }
  for (const [key, t] of Object.entries(map.roadTiers || {})) {
    const m = /^([xz])(\d+):(\d+)$/.exec(key);
    if (!m || +m[2] > size || +m[3] >= size) add('error', 'roads', key, `Đoạn đường ${key} không có trên bản đồ.`);
    else if (!ROAD_TIER_IDS.includes(t)) add('error', 'roads', key, `Cấp đường lạ "${t}" (chỉ big / normal / small).`);
  }
  // đoạn đường hay ngập (floodSegs): "low" = Trũng · "tide" = Rất trũng
  if (map.floodSegs != null && (typeof map.floodSegs !== 'object' || Array.isArray(map.floodSegs))) add('error', 'flood', 'floodSegs', 'Đường ngập phải là bảng { "x3:5": "low" | "tide" }.');
  else for (const [key, lv] of Object.entries(map.floodSegs || {})) {
    const m = /^([xz])(\d+):(\d+)$/.exec(key);
    if (!m || +m[2] > size || +m[3] >= size) add('error', 'flood', key, `Đoạn ngập ${key} không có trên bản đồ.`);
    else if (!['low', 'tide'].includes(lv)) add('error', 'flood', key, `Mức ngập lạ "${lv}" (chỉ low = Trũng / tide = Rất trũng).`);
  }
  // đèn giao thông (lights) + camera phạt nguội (cameras): danh sách ngã tư "i,j"; chưa có lights = gợi ý tự động
  for (const f of ['lights', 'cameras']) {
    if (map[f] == null) continue;
    if (!Array.isArray(map[f])) { add('error', 'lights', f, `${f === 'lights' ? 'Đèn giao thông' : 'Camera'} phải là danh sách ngã tư ["i,j", …].`); continue; }
    for (const k of map[f]) {
      const m = /^(\d+),(\d+)$/.exec(String(k));
      if (!m || +m[1] > size || +m[2] > size) add('error', 'lights', f, `Ngã tư "${k}" không có trên bản đồ.`);
      else if (!lightable(+m[1], +m[2], map)) add('warn', 'lights', f, `Ngã tư ${k} không đặt đèn được (ít hơn 3 hướng / cầu) → bỏ qua.`);
    }
  }
  if (Array.isArray(map.cameras) && Array.isArray(map.lights)) for (const k of map.cameras) if (!map.lights.includes(k)) add('warn', 'lights', 'cameras', `Ngã tư ${k} có camera mà không có đèn → camera không dùng tới.`);
  // sông
  (map.rivers || []).forEach((r, i) => {
    const ref = `river${i}`;
    const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    if (r.name != null && typeof r.name !== 'string') add('error', ref, 'name', 'Tên sông phải là chữ.');
    if (!['x', 'z'].includes(r.axis)) add('error', ref, 'axis', 'Hướng sông: chạy dọc đường dọc (x) hoặc đường ngang (z).');
    if (!int(r.line, 0, size)) add('error', ref, 'line', `Đường số 0–${size}.`);
    if (!int(r.from, 0, size) || !int(r.to, 0, size) || r.from >= r.to) add('error', ref, 'from', `Đoạn sông: từ ngã tư a tới b, 0 ≤ a < b ≤ ${size}.`);
    if (!Array.isArray(r.bridges) || r.bridges.some((b) => !int(b, r.from, r.to))) add('error', ref, 'bridges', 'Cầu phải ở các ngã tư nằm trên đoạn sông.');
    if (r.wide != null && typeof r.wide !== 'boolean') add('error', ref, 'wide', 'Sông lớn phải là true/false.');
    if (r.wide && !int(r.line, 0, size - 1)) add('error', ref, 'line', `Sông lớn phủ đường số a và a+1 — a từ 0 đến ${size - 1}.`);
    if (r.wide && Array.isArray(r.bridges) && !r.bridges.length) add('warn', ref, 'bridges', 'Sông lớn chưa có cầu nào.');
    if (r.bridgeStyles != null) {
      if (typeof r.bridgeStyles !== 'object' || Array.isArray(r.bridgeStyles)) add('error', ref, 'bridgeStyles', 'Kiểu cầu phải là bảng {ngã tư: kiểu}.');
      else {
        const ok = BRIDGE_STYLES[r.wide ? 'wide' : 'narrow'];
        for (const [k, v] of Object.entries(r.bridgeStyles)) {
          if (!ok.includes(v)) add('error', ref, 'bridgeStyles', `Kiểu cầu "${v}" ở ngã tư ${k} không dùng được cho ${r.wide ? 'sông lớn' : 'kênh / sông nhỏ'} (chỉ: ${ok.join(', ')}).`);
        }
      }
    }
    // sông lớn đè lên khối đã gộp (sân bay…)
    if (r.wide && Number.isInteger(r.line)) {
      for (const j of joinList(map)) {
        const cells = [[j[0], j[1]], j[2] === 'E' ? [j[0] + 1, j[1]] : [j[0], j[1] + 1]];
        if (cells.some(([bx, bz]) => (r.axis === 'x' ? bx === r.line && bz >= r.from && bz < r.to : bz === r.line && bx >= r.from && bx < r.to))) add('error', ref, 'line', `Sông lớn đè lên khối đã gộp ${j[0]},${j[1]}.`);
      }
    }
  });
  // sông không được cắt rời một khu (mọi ngã tư có đường phải tới được nhau)
  if (size === CITY.N && !out.some((i) => i.level === 'error' && i.ref.startsWith('river'))) {
    const g = roadGraph(map);
    const nodes = [];
    for (let j = 0; j <= size; j++) for (let i = 0; i <= size; i++) if (neighbors(i, j, map).length) nodes.push(j * (size + 1) + i);
    const cut = nodes.filter((v) => g.D[nodes[0] * g.n + v] === Infinity).length;
    if (cut) add('error', 'river0', 'bridges', `Sông cắt rời ${cut} ngã tư khỏi phần còn lại của thành phố — thêm cầu để xe qua được.`);
  }
  return out;
}

// Cân bằng (balance.json): mọi ô đúng phạm vi; tiền nhà tự đặt từng ngày phải > 0
export function validateBalance(b) {
  const out = [];
  const add = (level, field, msg) => out.push({ level, tab: 'balance', ref: '', field, msg });
  const show = (v, o) => +(v * (o.scale || 1)).toFixed(2);
  for (const g of BALANCE_GROUPS) {
    for (const [path, label, o] of g.fields) {
      const v = getPath(b, path);
      const bad = (x) => !num(x) || x < o.min || x > o.max;
      if (o.pair) {
        if (!Array.isArray(v) || v.length !== 2 || v.some(bad)) add('error', path, `${label}: 2 số từ ${show(o.min, o)} đến ${show(o.max, o)}.`);
        else if (v[0] > v[1]) add('error', path, `${label}: số đầu phải ≤ số sau.`);
      } else if (bad(v)) add('error', path, `${label}: phải là số từ ${show(o.min, o)} đến ${show(o.max, o)}.`);
    }
    if (g.stars) {
      const v = getPath(b, g.stars[0]);
      if (!Array.isArray(v) || v.length !== 6 || v.slice(1).some((x) => !num(x) || x < -100 || x > 100)) add('error', g.stars[0], `${g.stars[1]}: 5 số từ −100 đến 100.`);
    }
  }
  const rb = b.economy?.rentByPeriod;
  if (rb != null && (!Array.isArray(rb) || rb.some((x) => x != null && (!num(x) || x <= 0 || x > 1000000)))) add('error', 'economy.rentByPeriod', 'Tiền nhà tự đặt: số > 0 (bỏ trống = theo công thức).');
  if (num(b.economy?.rentEveryDays) && !Number.isInteger(b.economy.rentEveryDays)) add('error', 'economy.rentEveryDays', 'Số ngày mỗi kỳ phải là số nguyên.');
  if (num(b.economy?.maxLate) && !Number.isInteger(b.economy.maxLate)) add('error', 'economy.maxLate', 'Số lần trễ phải là số nguyên.');
  const S = b.energy?.sleep;
  if (S && num(S.napShortMin) && num(S.napLongMin) && S.napLongMin < S.napShortMin) add('warn', 'energy.sleep.napLongMin', '"Ngủ một giấc ngắn" nên dài hơn "Chợp mắt".');
  if (S && num(S.tiredAfterH) && num(S.veryTiredAfterH) && S.veryTiredAfterH < S.tiredAfterH) add('warn', 'energy.sleep.veryTiredAfterH', 'Mốc "rất buồn ngủ" nên sau mốc "buồn ngủ".');
  // mục Nâng cao: mọi giá trị lá phải là số (hoặc danh sách số)
  const walk = (o, pre) => {
    for (const [k, v] of Object.entries(o || {})) {
      const path = pre ? `${pre}.${k}` : k;
      if (KNOWN_PATHS.has(path)) continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path);
      else if (Array.isArray(v) ? v.some((x) => !num(x)) : !num(v)) add('error', path, `${path}: phải là số.`);
    }
  };
  walk(b, '');
  return out;
}

export function validateAll({ items, gear, goods, places, content, baseContent, apps = null, map = undefined, balance = null, phone = null, sounds = null, story = null }) {
  return [
    ...(story ? validateStory(story, { places, goods, content, apps }) : []),
    ...(sounds ? validateSounds(sounds) : []),
    ...(phone ? validatePhone(phone) : []),
    ...(balance ? validateBalance(balance) : []),
    ...validateItems(items, places, apps),
    ...(apps ? validateApps(apps, items, places) : []),
    ...(map ? validateMap(map, places) : []),
    ...validateGear(gear, apps),
    ...(apps ? validateBrands(apps, gear, places, goods) : []),
    ...(goods ? validateGoods(goods, places, storyGifts(story)) : []),
    ...validatePlaces(places, items, goods, gear, map),
    ...validateContent(content, baseContent || content),
    ...validateFeedLines(content, places),
  ];
}

// App Tích Tắc (sim/feed.js): mỗi mẫu tin "[photo:here|food|place hoặc clip:dog|dance|food|rain|text|meme] @tác_giả | chú thích | nhạc | chữ trên ảnh"
export const FEED_MEDIA = ['photo:here', 'photo:food', 'photo:place', 'clip:dog', 'clip:dance', 'clip:food', 'clip:rain', 'clip:text', 'clip:meme'];
export function validateFeedLines(content, placesData = null) {
  const out = [];
  const placeIds = new Set((placesData?.places || []).map((p) => p.id));
  for (const [key, v] of Object.entries(content || {})) {
    if (!/^tt\.(hot|me)\.|^tt\.(fun|spot)$/.test(key)) continue;
    for (const s of Array.isArray(v) ? v : [v]) {
      const m = /^\s*\[([^\]]*)\]/.exec(String(s));
      const add = (msg) => out.push({ level: 'error', tab: 'text', ref: key, field: 'text', msg: `"${String(s).slice(0, 40)}…": ${msg}` });
      if (!m) add(`Thiếu loại ảnh ở đầu câu, vd [photo:food] hoặc [clip:dog]. Có: ${FEED_MEDIA.join(', ')}.`);
      else if (!FEED_MEDIA.includes(m[1].trim()) && !(/^photo:/.test(m[1].trim()) && placeIds.has(m[1].trim().slice(6)))) add(`Loại ảnh lạ "${m[1]}". Có: ${FEED_MEDIA.join(', ')} hoặc photo:<mã địa điểm> (vd photo:tra).`);
      if (String(s).split('|').length < 2) add('Thiếu dấu | giữa tác giả và chú thích: "[clip:dog] @ten | chú thích | nhạc | chữ trên ảnh".');
    }
  }
  return out;
}

// ======================== CỐT TRUYỆN (story.json — thẻ 📖 Cốt truyện) ========================
// Món đồ cốt truyện tặng (talk.give / hành động give) → không cần nơi bán
export function storyGifts(story) {
  const out = new Set();
  for (const ch of story?.chapters || []) for (const st of ch.steps || []) {
    if (st.talk?.give) out.add(st.talk.give);
    for (const a of st.on || []) if (a.do === 'give' && a.goods) out.add(a.goods);
  }
  return out;
}
const STORY_UNTIL = ['none', 'wait', 'read', 'open', 'reply', 'routed', 'ack', 'use', 'arrive', 'talk', 'mount', 'brand', 'wear', 'switch', 'fuel', 'order', 'near', 'talkActor', 'chosen', 'ordersSince', 'newDay', 'clock', 'bring'];
const STORY_DO = ['title', 'say', 'actor', 'bubble', 'approach', 'leave', 'remove', 'choose', 'board', 'alight', 'drop', 'msg', 'replies', 'item', 'bike', 'give', 'toast', 'openPhone', 'closePhone', 'offer', 'fuel', 'end'];
const STORY_ACTOR_LOOKS = ['jetjet', 'normal', 'girl', 'gentleman']; // = ACTOR_LOOKS (sim/story.js)
const STORY_ACTOR_SPOTS = ['xeOm', 'place', 'near']; // = ACTOR_SPOTS (sim/story.js)
const STORY_ACTOR_VEHICLES = ['moto']; // = ACTOR_VEHICLES (sim/story.js)
const STORY_TRAITS = ['good', 'neutral', 'bad']; // = TRAITS (sim/story.js)
const STORY_GUIDE = ['thread', 'route', 'reply', 'wear', 'switch', 'minimap', 'hud', 'use', 'fuel', 'order', 'profile'];
const STORY_HUD = ['minimap', 'keys', 'goal', 'stats', 'phys', 'mental', 'vehicle', 'objectives', 'fuel', 'phoneIcon', 'phone']; // = HUD_PARTS (sim/story.js)
const STORY_STAGES = ['offer', 'accept', 'pickup', 'deliver']; // = ORDER_STAGES (sim/story.js)
const STORY_APPS = ['goship', 'map', 'chat', 'wallet', 'account', 'bag', 'bike', 'police', 'tictac', 'camera']; // = APP_DEFS (data/phoneApps.js)
// Emoji mới quá (Unicode 13 trở lên, 2020+) → Windows 10 hiện ô vuông. Dùng cho ô biểu tượng.
export function tooNewEmoji(s) {
  const str = String(s || '');
  if (/🧑‍/u.test(str)) return true; // người không rõ giới tính + nghề (🧑‍🍳…): Windows 10 tách thành 2 hình
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x1FA70 && cp <= 0x1FAFF && !((cp >= 0x1FA70 && cp <= 0x1FA73) || (cp >= 0x1FA78 && cp <= 0x1FA7A) || (cp >= 0x1FA80 && cp <= 0x1FA82) || (cp >= 0x1FA90 && cp <= 0x1FA95))) return true;
    if ([0x1F90C, 0x1F972, 0x1F977, 0x1F978, 0x1F979, 0x1F9A3, 0x1F9A4, 0x1F9AB, 0x1F9AC, 0x1F9AD, 0x1F9CB, 0x1F9CC, 0x1F6D6, 0x1F6D7, 0x1F6DC, 0x1F6DD, 0x1F6DE, 0x1F6DF, 0x1F6FB, 0x1F6FC, 0x1F7F0, 0x26A7].includes(cp)) return true;
  }
  return false;
}
const NEW_EMOJI_MSG = 'Biểu tượng này mới quá (emoji 2020 trở lên) → máy Windows 10 hiện ô vuông. Chọn emoji khác (vd 👨‍🍳 thay 🧑‍🍳, 🍯 thay 🫙, 🥤 thay 🧋).';
export function validateStory(story, { places = null, goods = null, content = null, apps = null } = {}) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'story', ref, field, msg });
  const placeIds = new Set((places?.places || []).filter((p) => isPlaced(p)).map((p) => p.id));
  const contacts = story?.contacts || {}, people = story?.people || {}, items = story?.items || {}, parcels = story?.parcels || {};
  const text = (ref, field, key, what) => {
    if (!key) return add('error', ref, field, `Chưa có ${what}.`);
    if (content && content[key] === undefined) add('error', ref, field, `Thiếu chữ "${key}" (${what}) — gõ nội dung ở ô này.`);
  };
  // người lạ đang có mặt ở bước i của chương (việc actor ở bước 0..i, chưa leave / remove) — giống actorsPresent (sim/story.js)
  const actorsHere = (ch, i) => {
    const out = new Set();
    for (const st of (ch.steps || []).slice(0, i + 1)) for (const a of st.on || []) {
      if (a.do === 'actor') out.add(a.who);
      if (a.do === 'leave' || a.do === 'remove') out.delete(a.who);
    }
    return out;
  };
  // điểm tính cách gắn vào các câu trả lời (choose / replies): [{ trait, pts } | null], tối đa n ô
  const gainsCheck = (ref, gains, n) => {
    if (gains == null) return;
    if (!Array.isArray(gains) || gains.length > n) add('error', ref, 'on', 'Điểm tính cách: mỗi câu trả lời tối đa 1 ô điểm.');
    for (const gn of Array.isArray(gains) ? gains : []) {
      if (!gn) continue;
      if (!STORY_TRAITS.includes(gn.trait)) add('error', ref, 'on', `Điểm tính cách: tính cách lạ "${gn.trait}".`);
      if (!(Number.isInteger(gn.pts) && gn.pts >= 1 && gn.pts <= 10)) add('error', ref, 'on', 'Điểm tính cách: + 1–10 điểm.');
    }
  };
  // người nói: 'player' (nếu cho) · mã người lạ · 'place:<mã địa điểm>' (NPC đứng ở địa điểm, phải có NPC)
  const speakerOk = (who, allowPlayer = false) => (allowPlayer && who === 'player') || !!people[who]
    || (String(who).startsWith('place:') && (!places || (places.places || []).some((p) => p.id === who.slice(6) && p.npc)));
  const place = (ref, field, id, extra = []) => {
    if (!id) return add('error', ref, field, 'Chưa chọn địa điểm.');
    if (places && !placeIds.has(id) && !extra.includes(id)) add('error', ref, field, `Địa điểm "${id}" không có (hoặc chưa đặt lên bản đồ).`);
  };
  for (const [id, c] of Object.entries(contacts)) {
    if (!ID_RE.test(id)) add('error', `contact:${id}`, 'id', 'Mã người nhắn chỉ gồm chữ không dấu, số, gạch dưới.');
    text(`contact:${id}`, 'name', c.name, 'tên người nhắn');
    if (c.place && places && !placeIds.has(c.place)) add('warn', `contact:${id}`, 'place', `Địa điểm "${c.place}" không có.`);
  }
  for (const [id, it] of Object.entries(items)) text(`item:${id}`, 'name', it.name, 'tên vật phẩm');
  for (const [pre, tb] of [['contact', contacts], ['people', people], ['item', items], ['parcel', parcels]]) for (const [id, x] of Object.entries(tb)) if (tooNewEmoji(x.icon)) add('warn', `${pre}:${id}`, 'icon', NEW_EMOJI_MSG);
  for (const [id, it] of Object.entries(parcels)) text(`parcel:${id}`, 'name', it.name, 'tên gói hàng');
  const chIds = new Set();
  for (const ch of story?.chapters || []) {
    if (chIds.has(ch.id)) add('error', ch.id, 'id', 'Trùng mã chương.');
    chIds.add(ch.id);
    text(ch.id, 'title', ch.title, 'tên chương');
    if (!(ch.steps || []).length) add('warn', ch.id, 'steps', 'Chương chưa có bước nào.');
    const stIds = new Set();
    (ch.steps || []).forEach((st, i) => {
      const ref = `${ch.id}.${st.id || i}`;
      if (!st.id || stIds.has(st.id)) add('error', ref, 'id', st.id ? 'Trùng mã bước.' : 'Bước chưa có mã.');
      stIds.add(st.id);
      if (st.delay != null && (!num(st.delay) || st.delay < 0 || st.delay > 600)) add('error', ref, 'delay', 'Chờ trước khi làm: 0–600 phút game.');
      const u = st.until || { type: 'none' };
      if (!STORY_UNTIL.includes(u.type)) add('error', ref, 'until', `Điều kiện xong lạ "${u.type}".`);
      if (u.type === 'routed') place(ref, 'until', u.place, ['office', 'fuel']);
      if (u.type === 'order' && !STORY_STAGES.includes(u.stage)) add('error', ref, 'until', `Mốc đơn hàng lạ "${u.stage}" (offer / accept / pickup / deliver).`);
      if (u.type === 'fuel' && u.pct != null && !(num(u.pct) && u.pct > 0 && u.pct <= 100)) add('error', ref, 'until', 'Xăng / pin: 1–100 %.');
      if (st.hold != null && typeof st.hold !== 'boolean') add('error', ref, 'hold', 'Ô "chặn đơn thường" phải là có / không.');
      if (u.type === 'use' && goods && !goods[u.goods]) add('error', ref, 'until', `Món "${u.goods}" không có trong đồ dùng.`);
      if (u.type === 'ack' && u.max != null && !(num(u.max) && u.max >= 0)) add('error', ref, 'until', 'Tự tắt sau … phút phải ≥ 0.');
      for (const mk of [].concat(st.mark || [])) { // một hoặc nhiều dấu
        if (mk.actor) { if (!people[mk.actor]) add('error', ref, 'mark', `Dấu trên đầu: người lạ "${mk.actor}" không có.`); }
        else place(ref, 'mark', mk.place);
        if (!['!', '?'].includes(mk.icon)) add('error', ref, 'mark', 'Dấu trên đầu NPC chỉ là ! hoặc ?.');
      }
      if (st.zone) place(ref, 'zone', st.zone.place);
      if (st.zone?.r != null && !(num(st.zone.r) && st.zone.r >= 5 && st.zone.r <= 150)) add('error', ref, 'zone', 'Vòng tìm kiếm: bán kính 5–150 m.');
      if (st.talkLabel) text(ref, 'talkLabel', st.talkLabel, 'chữ trên nút E');
      if (u.type === 'ordersSince' && !(Number.isInteger(u.n) && u.n >= 1 && u.n <= 200)) add('error', ref, 'until', 'Số đơn phải giao: 1–200.');
      if (u.type === 'clock' && !(num(u.from) && num(u.to) && u.from >= 0 && u.from <= 24 && u.to >= 0 && u.to <= 24 && u.from !== u.to)) add('error', ref, 'until', 'Khung giờ: từ / tới 0–24 giờ, khác nhau.');
      if (u.type === 'bring') {
        if (!people[u.who]) add('error', ref, 'until', `Người lạ "${u.who}" không có (danh sách Người nói).`);
        place(ref, 'until', u.place);
        const boarded = (ch.steps || []).slice(0, i + 1).some((x) => (x.on || []).some((a) => a.do === 'board' && a.who === u.who));
        if (!boarded) add('error', ref, 'until', `Chờ chở "${u.who}" mà chưa có việc "lên xe" cho người này ở bước này hoặc bước trước → kẹt.`);
      }
      if ((u.type === 'read' || u.type === 'reply' || u.type === 'open') && !contacts[u.who]) add('error', ref, 'until', 'Chưa chọn người nhắn (hoặc người đó không có trong danh bạ).');
      if (u.type === 'arrive') place(ref, 'until', u.place);
      if (u.type === 'talkActor') {
        if (!speakerOk(u.who)) add('error', ref, 'until', `Người nói "${u.who}" không có (người lạ / place:<địa điểm có NPC>).`);
        else if (people[u.who] && !actorsHere(ch, i).has(u.who)) add('error', ref, 'until', `Chờ nói chuyện với "${u.who}" mà người này chưa xuất hiện (thêm việc "Người lạ xuất hiện" ở bước này hoặc bước trước).`);
      }
      if (u.type === 'chosen') {
        const ok = (ch.steps || []).slice(0, i + 1).some((x) => (x.on || []).some((a) => a.do === 'choose' && a.id === u.id));
        if (!ok) add('error', ref, 'until', `Chờ chọn câu trả lời "${u.id}" mà chưa có việc "Chọn câu trả lời" mã này ở bước này hoặc bước trước → kẹt.`);
      }
      if (st.onlyTrait != null && !STORY_TRAITS.includes(st.onlyTrait)) add('error', ref, 'onlyTrait', `Chỉ chạy khi tính cách: tính cách lạ "${st.onlyTrait}".`);
      if (st.onlyTrait && ['talkActor', 'chosen'].includes(u.type)) add('warn', ref, 'onlyTrait', 'Bước chỉ dành cho 1 tính cách mà chờ nói chuyện / chọn câu: người chơi tính cách khác sẽ bỏ qua cả bước này — nhớ bước sau không phụ thuộc vào nó.');
      if (st.leash) {
        place(ref, 'leash', st.leash.place);
        if (!(num(st.leash.r) && st.leash.r >= 10 && st.leash.r <= 200)) add('error', ref, 'leash', 'Vùng giữ người chơi: bán kính 10–200 m.');
        text(ref, 'leash', st.leash.text, 'câu nhắc khi đi ra khỏi vùng');
      }
      if (u.type === 'near' && !people[u.who]) add('error', ref, 'until', `Người lạ "${u.who}" không có (danh sách Người nói).`);
      if (u.type === 'wait' && !(num(u.min) && u.min >= 0)) add('error', ref, 'until', 'Số phút chờ phải ≥ 0.');
      if (u.type === 'switch' && u.which !== 'food' && u.which !== 'ride') add('error', ref, 'until', 'Công tắc phải là Giao hàng (food) hoặc Chở khách (ride).');
      if (u.type === 'talk') {
        if (!st.talk) add('error', ref, 'talk', 'Điều kiện "nói chuyện" cần phần Nói chuyện (địa điểm, câu nói).');
        else if (st.talk.place !== u.place) add('error', ref, 'talk', 'Địa điểm nói chuyện phải trùng địa điểm ở điều kiện xong.');
      }
      if (st.talk) {
        place(ref, 'talk', st.talk.place);
        text(ref, 'talk', st.talk.label, 'chữ trên nút E');
        text(ref, 'talk', st.talk.text, 'câu nói');
        if (st.talk.ok) text(ref, 'talk', st.talk.ok, 'chữ nút đồng ý (cũ, không còn hiện)');
        for (const pid of [].concat(st.talk.pack || [], st.talk.drop || [])) if (!parcels[pid]) add('error', ref, 'talk', `Gói hàng "${pid}" không có.`);
        if (st.talk.giveQty != null && !(num(st.talk.giveQty) && st.talk.giveQty >= 1 && st.talk.giveQty <= 20)) add('error', ref, 'talk', 'Số phần tặng: 1–20.');
        if (st.talk.give && goods && !goods[st.talk.give]) add('error', ref, 'talk', `Đồ tặng "${st.talk.give}" không có trong đồ dùng.`);
      }
      if (st.goal) text(ref, 'goal', st.goal, 'mục tiêu');
      if (st.hint) text(ref, 'hint', st.hint, 'gợi ý');
      if (st.target?.startsWith('actor:')) { if (!people[st.target.slice(6)]) add('error', ref, 'target', `Mũi tên: người lạ "${st.target.slice(6)}" không có.`); }
      else if (st.target && !['bike', 'office', 'fuel'].includes(st.target)) place(ref, 'target', st.target);
      if (st.guide) {
        const gd = st.guide;
        if (!STORY_GUIDE.includes(gd.type)) add('error', ref, 'guide', `Kiểu hướng dẫn lạ "${gd.type}".`);
        if (['thread', 'route', 'reply'].includes(gd.type) && !contacts[gd.who]) add('error', ref, 'guide', 'Hướng dẫn: chưa chọn người nhắn.');
        if (gd.type === 'route') place(ref, 'guide', gd.place, ['office']);
        if (gd.type === 'minimap' || gd.type === 'hud' || gd.type === 'profile') text(ref, 'guide', gd.title, 'chữ hướng dẫn');
        if (gd.btn != null && !['next', 'ok'].includes(gd.btn)) add('error', ref, 'guide', 'Nút hướng dẫn chỉ là "next" (Tiếp ▸) hoặc "ok" (Đã rõ).');
        if (gd.btn && u.type !== 'ack') add('warn', ref, 'guide', 'Có nút Tiếp / Đã rõ thì điều kiện xong nên là "Người chơi bấm tắt hướng dẫn" (ack).');
        if (u.type === 'ack' && !gd.btn && ['hud', 'profile'].includes(gd.type) && !(u.max > 0)) add('error', ref, 'guide', 'Điều kiện "bấm tắt hướng dẫn" mà hướng dẫn không có nút Tiếp / Đã rõ → người chơi kẹt ở bước này.');
        if (gd.type === 'hud' && !STORY_HUD.includes(gd.part)) add('error', ref, 'guide', `Phần màn hình lạ "${gd.part}".`);
        if (gd.type === 'use' && goods && !goods[gd.goods]) add('error', ref, 'guide', `Món "${gd.goods}" không có trong đồ dùng.`);
      }
      for (const a of st.on || []) {
        if (!STORY_DO.includes(a.do)) { add('error', ref, 'on', `Việc lạ "${a.do}".`); continue; }
        if (a.do === 'msg') {
          if (!contacts[a.from]) add('error', ref, 'on', `Tin nhắn: người gửi "${a.from}" không có trong danh bạ.`);
          text(ref, 'on', a.text, 'nội dung tin nhắn');
          for (const id of a.loc || []) place(ref, 'on', id);
        }
        if (a.do === 'replies') {
          if (!contacts[a.who]) add('error', ref, 'on', 'Trả lời nhanh: chưa chọn người nhắn.');
          if (!Array.isArray(a.texts) || !a.texts.length || a.texts.length > 3) add('error', ref, 'on', 'Trả lời nhanh: 1–3 câu.');
          for (const k of a.texts || []) text(ref, 'on', k, 'câu trả lời nhanh');
          gainsCheck(ref, a.gains, (a.texts || []).length);
        }
        if (a.do === 'say') {
          if (!people[a.who] && !contacts[a.who]) add('error', ref, 'on', `Hội thoại: người nói "${a.who}" không có.`);
          text(ref, 'on', a.text, 'câu nói');
        }
        if (a.do === 'toast') text(ref, 'on', a.text, 'thông báo');
        if (['actor', 'approach', 'leave', 'remove', 'board', 'alight'].includes(a.do) && !people[a.who]) add('error', ref, 'on', `Người lạ "${a.who}" không có (danh sách Người nói).`);
        if (a.do === 'actor' && a.look && !STORY_ACTOR_LOOKS.includes(a.look)) add('error', ref, 'on', `Dáng người lạ lạ "${a.look}".`);
        if (a.do === 'actor') {
          if (a.spot && !STORY_ACTOR_SPOTS.includes(a.spot)) add('error', ref, 'on', `Chỗ đứng người lạ lạ "${a.spot}".`);
          if (a.spot === 'place') {
            place(ref, 'on', a.place);
            if (a.dist != null && !(num(a.dist) && a.dist >= 0 && a.dist <= 40)) add('error', ref, 'on', 'Người lạ: cách cửa 0–40 m.');
            if (a.lat != null && !(num(a.lat) && Math.abs(a.lat) <= 20)) add('error', ref, 'on', 'Người lạ: lệch dọc đường −20…20 m.');
          }
          if (a.vehicle != null && !STORY_ACTOR_VEHICLES.includes(a.vehicle)) add('error', ref, 'on', `Xe đi kèm lạ "${a.vehicle}".`);
          if (a.vehicle && a.spot !== 'place') add('warn', ref, 'on', 'Xe đi kèm chỉ dựng được khi người lạ đứng "trước cửa địa điểm".');
          if (a.faceTo != null && !people[a.faceTo]) add('error', ref, 'on', `Nhìn về phía "${a.faceTo}": người lạ không có.`);
          if (a.spot === 'xeOm') {
            place(ref, 'on', a.place);
            if (a.place && places && (places.places || []).some((p) => p.id === a.place && !p.xeOm)) add('error', ref, 'on', `"${a.place}" không bật "Có chú xe ôm" → người lạ không có chỗ đứng (thẻ Địa điểm → Chú xe ôm).`);
          }
          if (a.call) text(ref, 'on', a.call, 'câu gọi người chơi');
          if (a.idle) text(ref, 'on', a.idle, 'câu nói khi hết chuyện');
        }
        if (a.do === 'bubble') {
          if (!speakerOk(a.who, true)) add('error', ref, 'on', `Bong bóng: người nói "${a.who}" không có (player / người lạ / place:<địa điểm có NPC>).`);
          text(ref, 'on', a.text, 'bong bóng thoại');
          if (a.hold != null && typeof a.hold !== 'boolean') add('error', ref, 'on', 'Ô "giữ tới câu sau" phải là có / không.');
        }
        if (a.do === 'choose') {
          if (!a.id || !ID_RE.test(a.id)) add('error', ref, 'on', 'Chọn câu trả lời: thiếu mã (chữ + số, vd flyerAsk).');
          if (!speakerOk(a.who)) add('error', ref, 'on', `Chọn câu trả lời: người đáp "${a.who}" không có (người lạ / place:<địa điểm có NPC>).`);
          if (a.ask != null && typeof a.ask !== 'boolean') add('error', ref, 'on', 'Ô "bấm E mới hiện" phải là có / không.');
          for (const w of a.react || []) if (!people[w] && !String(w).startsWith('place:')) add('error', ref, 'on', `Dấu ? giật mình: "${w}" không có.`);
          const n = (a.options || []).length;
          if (n < 2 || n > 3) add('error', ref, 'on', 'Chọn câu trả lời: 2–3 câu.');
          if ((a.answers || []).length !== n) add('error', ref, 'on', 'Chọn câu trả lời: mỗi câu cần 1 câu đáp lại.');
          for (const k of [...(a.options || []), ...(a.answers || [])]) text(ref, 'on', k, 'câu trả lời / câu đáp');
          gainsCheck(ref, a.gains, n);
        }
        if (a.do === 'offer' && a.kind != null && a.kind !== 'ride' && a.kind !== 'food') add('error', ref, 'on', `Mời đơn: loại lạ "${a.kind}" (ride / food).`);
        if (a.do === 'offer' && a.customer != null && (typeof a.customer !== 'string' || !a.customer.trim())) add('error', ref, 'on', 'Mời đơn: tên khách phải là chữ (hoặc bỏ trống).');
        if (a.do === 'offer' && a.kind === 'food') {
          place(ref, 'on', a.place);
          const pl = (places?.places || []).find((p) => p.id === a.place);
          if (pl && (pl.kind !== 'restaurant' || !(pl.menu || []).length)) add('error', ref, 'on', `Mời đơn giao đồ ăn: "${a.place}" không phải quán ăn có thực đơn.`);
        }
        if (a.do === 'openPhone' && a.who && !contacts[a.who]) add('error', ref, 'on', `Mở điện thoại: người nhắn "${a.who}" không có.`);
        if (a.do === 'openPhone' && a.app && !STORY_APPS.includes(a.app)) add('error', ref, 'on', `Mở điện thoại: app lạ "${a.app}".`);
        if (a.do === 'fuel' && a.pct != null && !(num(a.pct) && a.pct >= 0 && a.pct <= 100)) add('error', ref, 'on', 'Đặt xăng / pin: 0–100 %.');
        if (a.do === 'drop') for (const pid of [].concat(a.id || [])) if (!parcels[pid]) add('error', ref, 'on', `Giao gói hàng: "${pid}" không có.`);
        if (a.do === 'item' && !items[a.id]) add('error', ref, 'on', `Vật phẩm "${a.id}" không có.`);
        if (a.do === 'give' && goods && !goods[a.goods]) add('error', ref, 'on', `Đồ tặng "${a.goods}" không có.`);
      }
    });
  }
  return out;
}
