// =============================================================
// KIỂM TRA DỮ LIỆU — dùng chung cho công cụ ?editor và bộ thử (npm test).
// Trả về danh sách vấn đề: { level: 'error' | 'warn', tab, ref, field, msg }
//  - error: game sẽ chạy sai → công cụ không cho lưu
//  - warn : chạy được nhưng nên xem lại
// =============================================================
import { validateSounds, SOUNDS } from './soundSpec.js';
import { ambushSolutions, roundDef, roundNb } from '../sim/ambush.js';
import { FACES, EYE_COLORS } from './faces.js';
import { CITY, LOT_IDS, MULTI_LOTS, lotParts, lotFaces, blockPlan, blockLotIds, roadGraph, neighbors, cutCell, joinList, joinSeg, joinPartner, isJoinLot, riverInfo, BRIDGE_STYLES } from '../sim/cityLayout.js';
import { ALLEY_TEMPLATES } from '../sim/blockPlan.js';
import { EFFECTS, CONSUMABLE_FIELDS, OUTFIT_SLOTS, FEMALE_STYLES } from './goods.js';
import { validatePhone } from './phoneApps.js';
import { ORDER_KINDS, FROM_HOMES } from './apps.js';
import { GENDERS, HAIR_STYLES, LOOK_AGES, LOOK_BUILDS, isAnhChi } from '../sim/people.js';
import { openDayOf } from '../sim/placeRules.js';
import { LOOKS, lookOf, looksFor, CAMPUS_LOOKS, WHOLE_BLOCK_LOOKS } from './looks.js';
import { hoursProblem, totalHours } from '../sim/hours.js';
import { BALANCE_GROUPS, KNOWN_PATHS, getPath } from './balanceSpec.js';
import { ITEM_GROUP_IDS } from './itemGroups.js';
import { DISTRICT_TRAITS, TRAIT_RANGE, HOUSE_STYLE_IDS, DECOR_IDS, TREES_RANGE, STREET_IDS, STREET_RANGE } from './districtTraits.js';
const ROAD_TIER_IDS = ['big', 'normal', 'small']; // cấp đường (giống TIER_IDS trong src/sim/roads.js)
import { isPlaced } from './places.js';
import { lightable } from '../sim/lights.js';
import { ZONE_LIST, ZONE_POINTS } from '../sim/zones.js';

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
export const VEHICLE_MODELS = { cub: 'Xe số cổ (Cub)', underbone: 'Xe số (Wave)', scooter: 'Tay ga (Vision, SH, xe điện)', sport: 'Tay côn / mô tô', supersport: 'Sport bike phân khối lớn (ốp kín, sọc xanh lá)', bicycle: 'Xe đạp' };
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
const MARK_RE = /^[a-zA-Z]\w*:[a-zA-Z]\w*$/; // mốc lộ trình chạy trốn: người:mốc

// Các ô lô mà một địa điểm chiếm (tòa nhà lớn chiếm nhiều lô — xem MULTI_LOTS)
export function lotCells(p) {
  if (!isPlaced(p)) return []; // chưa đặt trên bản đồ
  const [bx, bz] = p.block;
  const out = lotParts(p.lot).map((id) => `${bx},${bz},${id}`);
  const q = joinPartner(bx, bz, p.lot); // lô gộp 2 khối: chiếm cả khối thứ 2
  if (q) for (const id of MULTI_LOTS.B) out.push(`${q[0]},${q[1]},${id}`);
  return out;
}

export function validateItems(items, placesData, appsData = null, story = null) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'items', ref, field, msg });
  const menus = (placesData?.places || []).filter((p) => p.kind === 'restaurant').flatMap((p) => p.menu || []);
  const parcelTypes = Object.values(appsData?.orderTypes || {}).filter((t) => t.kind === 'parcel');
  const parcelUse = new Set(parcelTypes.flatMap((t) => t.items || []));
  // món chỉ dùng cho đơn cốt truyện (việc "Mời đơn" chở hàng) cũng tính là có dùng
  for (const ch of story?.chapters || []) for (const st of ch.steps || []) for (const a of st.on || []) if (a.do === 'offer' && a.kind === 'parcel' && a.item) parcelUse.add(a.item);
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
      if (s.story != null && typeof s.story !== 'boolean') add('error', key, 'story', 'Xe cốt truyện: có / không.');
      if (s.price === 0 && !PROTECTED[cat].includes(key) && !brandVehicles.has(key) && !s.story) add('warn', key, 'price', 'Giá 0 → người chơi lấy miễn phí ngay từ đầu.');
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
    if (p.lot === 'B' && p.kind !== 'scenery' && !courtyard && !campus && !WHOLE_BLOCK_LOOKS.includes(lookOf(p))) add('error', p.id, 'lot', 'Cỡ "Cả khối" chỉ dành cho cảnh quan, chùa tứ hợp viện, trường đại học hoặc kho hàng cảng.');
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
      if (p.npc.age != null && !LOOK_AGES[p.npc.age]) add('error', p.id, 'npc.age', `Tuổi phải là: ${Object.keys(LOOK_AGES).join(', ')} (bỏ trống = bình thường).`);
      if (p.npc.build != null && !LOOK_BUILDS[p.npc.build]) add('error', p.id, 'npc.build', `Vóc dáng phải là: ${Object.keys(LOOK_BUILDS).join(', ')} (bỏ trống = vừa).`);
      if (p.npc.faceStyle != null && !FACES[p.npc.faceStyle]) add('error', p.id, 'npc.faceStyle', `Kiểu mặt lạ "${p.npc.faceStyle}" (${Object.keys(FACES).join(', ')}).`);
      if (p.npc.eyeColor != null && !EYE_COLORS[p.npc.eyeColor]) add('error', p.id, 'npc.eyeColor', `Màu mắt lạ "${p.npc.eyeColor}" (${Object.keys(EYE_COLORS).join(', ')}).`);
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
    if (s.npcOnly != null && typeof s.npcOnly !== 'boolean') add('error', key, 'npcOnly', '"Chỉ cho NPC" phải là có / không.');
    if (s.npcOnly && s.type !== 'outfit') add('error', key, 'npcOnly', '"Chỉ cho NPC" chỉ dùng cho trang phục.');
    if (s.npcOnly && sold.has(key)) add('error', key, 'npcOnly', 'Món "Chỉ cho NPC" mà có địa điểm bán → bỏ khỏi hàng bán hoặc bỏ tick.');
    if (s.npcOnly && s.start) add('error', key, 'npcOnly', 'Món "Chỉ cho NPC" không chọn được lúc tạo nhân vật.');
    if (placesData && !sold.has(key) && !madeInGame && !s.npcOnly && !(s.type === 'outfit' && s.price === 0)) add('warn', key, 'sells', 'Chưa địa điểm nào bán món này.');
    // phụ kiện (kể cả mũ bảo hiểm) giá 0 không tự có → chỉ có khi là quà vào hãng
    if (s.type === 'outfit' && s.price === 0 && OUTFIT_SLOTS[s.slot]?.accessory && !s.brand && !s.npcOnly) add('warn', key, 'price', 'Phụ kiện giá 0 không ai có sẵn (mũ bảo hiểm lúc đầu không có) → chỉ có nếu là quà vào hãng. Đặt giá + nơi bán, hoặc xóa món này.');
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
    if (r.mouth != null) {
      if (!['start', 'end', 'both'].includes(r.mouth)) add('error', ref, 'mouth', 'Cửa sông ra ngoài bản đồ: start (đầu) / end (cuối) / both (cả hai).');
      else if (((r.mouth === 'start' || r.mouth === 'both') && r.from !== 0) || ((r.mouth === 'end' || r.mouth === 'both') && r.to !== size)) add('warn', ref, 'mouth', 'Sông chưa chạy tới biên bản đồ ở phía mở cửa → phía đó không mở được.');
    }
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

export function validateAll({ items, gear, goods, places, content, baseContent, apps = null, map = undefined, balance = null, phone = null, sounds = null, story = null, relations = null }) {
  return [
    ...(story ? validateStory(story, { places, goods, content, apps, relations, orderItems: items, gear }) : []),
    ...(relations ? validateRelations(relations, { story, places, goods, content }).filter((i) => i.level === 'error') : []), // chỉ lỗi; cảnh báo xem ở /?relationship
    ...(sounds ? validateSounds(sounds) : []),
    ...(phone ? validatePhone(phone) : []),
    ...(balance ? validateBalance(balance) : []),
    ...validateItems(items, places, apps, story),
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
const STORY_UNTIL = ['none', 'wait', 'read', 'open', 'reply', 'routed', 'ack', 'use', 'arrive', 'talk', 'mount', 'brand', 'wear', 'switch', 'fuel', 'order', 'near', 'talkActor', 'chosen', 'ordersSince', 'newDay', 'clock', 'bring', 'cine', 'chased', 'reach', 'tackled', 'sneaked', 'hidden', 'escaped', 'never', 'ttSeen', 'away', 'ambushed', 'untied', 'fightWon', 'raceWon', 'useAt', 'parked'];
const STORY_DO = ['title', 'say', 'actor', 'bubble', 'approach', 'leave', 'remove', 'choose', 'board', 'alight', 'drop', 'msg', 'replies', 'item', 'bike', 'give', 'toast', 'openPhone', 'closePhone', 'offer', 'fuel', 'end', 'goto', 'react', 'cine', 'chase', 'sound', 'prop', 'dismount', 'helmetOff', 'helmetOn', 'tackle', 'wave', 'rideOff', 'phoneCall', 'fade', 'sneak', 'traffic', 'pursue', 'pay', 'rename', 'ttPost', 'block', 'ambush', 'ambushCrew', 'ship', 'zone', 'phone', 'tie', 'untie', 'fpv', 'fight', 'race', 'borrow'];
const STORY_ACTOR_LOOKS = ['jetjet', 'normal', 'girl', 'student', 'gentleman', 'char']; // = ACTOR_LOOKS (sim/story.js)
const STORY_ACTOR_SPOTS = ['xeOm', 'place', 'near', 'at']; // = ACTOR_SPOTS (sim/story.js)
const STORY_ACTOR_VEHICLES = ['moto']; // = ACTOR_VEHICLES (sim/story.js)
const STORY_TRAITS = ['good', 'neutral', 'bad']; // = TRAITS (sim/story.js)
const STORY_GUIDE = ['thread', 'route', 'reply', 'wear', 'switch', 'minimap', 'hud', 'use', 'fuel', 'order', 'profile', 'app'];
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
export function validateStory(story, { places = null, goods = null, content = null, apps = null, relations = null, orderItems = null, gear = null } = {}) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'story', ref, field, msg });
  const placeIds = new Set((places?.places || []).filter((p) => isPlaced(p)).map((p) => p.id));
  const contacts = story?.contacts || {}, people = story?.people || {}, items = story?.items || {}, parcels = story?.parcels || {}, spots = story?.spots || {};
  const text = (ref, field, key, what) => {
    if (!key) return add('error', ref, field, `Chưa có ${what}.`);
    if (content && typeof content[key] === 'string' && content[key].split('[tiếp]').some((p) => p.replace(/<[^>]+>/g, '').trim().length > 100)) add('warn', ref, field, `Câu "${key}" có đoạn dài quá 100 chữ — chèn [tiếp] để chia trang (bấm E qua).`);
    if (content && content[key] === undefined) add('error', ref, field, `Thiếu chữ "${key}" (${what}) — gõ nội dung ở ô này.`);
  };
  // người lạ đang có mặt ở bước i của chương (việc actor ở bước 0..i, chưa leave / remove) — giống actorsPresent (sim/story.js)
  const actorsHere = (ch, i) => {
    const out = new Set();
    for (const st of (ch.steps || []).slice(0, i + 1)) for (const a of st.on || []) {
      if (a.do === 'actor' || a.do === 'chase') out.add(a.who);
      if (a.do === 'leave' || a.do === 'remove' || a.do === 'goto') out.delete(a.who);
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
    if (String(id).startsWith('spot:')) { if (!spots[id.slice(5)]) add('error', ref, field, `Chỗ hẹn "${id.slice(5)}" không có (Danh bạ · người nói → 📍 Chỗ hẹn).`); return; } // chỗ hẹn theo tọa độ
    if (places && !placeIds.has(id) && !extra.includes(id)) add('error', ref, field, `Địa điểm "${id}" không có (hoặc chưa đặt lên bản đồ).`);
  };
  for (const [id, sp] of Object.entries(spots)) {
    const ref = `spot:${id}`;
    if (!ID_RE.test(id)) add('error', ref, 'id', 'Mã chỗ hẹn chỉ gồm chữ không dấu, số, gạch dưới.');
    text(ref, 'name', sp.name, 'tên chỗ hẹn');
    if (!(Array.isArray(sp.at) && sp.at.length === 2 && sp.at.every(num))) add('error', ref, 'at', 'Chỗ hẹn: tọa độ phải là [x, z].');
  }
  // ---- đánh nhau: vũ khí · kiểu địch · trận (thẻ ⚔️) ----
  const weapons = story?.weapons || {}, foes = story?.foes || {}, fights = story?.fights || {};
  const nonNeg = (v) => v == null || (num(v) && v >= 0);
  for (const [id, w] of Object.entries(weapons)) {
    const ref = `weapon:${id}`;
    if (!ID_RE.test(id)) add('error', ref, 'id', 'Mã vũ khí chỉ gồm chữ không dấu, số, gạch dưới.');
    text(ref, 'name', w.name, 'tên vũ khí');
    for (const k of ['dmg', 'cd', 'reach', 'dur', 'stun', 'block', 'trap']) if (!nonNeg(w[k])) add('error', ref, k, `Vũ khí: ${k} phải là số ≥ 0.`);
    if (!w.throw && id !== 'fists' && !(w.cd > 0)) add('warn', ref, 'cd', 'Vũ khí cầm tay nên có thời gian chờ vung > 0.');
  }
  if (Object.keys(weapons).length && !weapons.fists) add('error', 'weapon:fists', 'id', 'Thiếu "fists" (tay không) — dùng khi chưa nhặt gì / vũ khí gãy.');
  for (const [id, f] of Object.entries(foes)) {
    const ref = `foe:${id}`;
    if (!ID_RE.test(id)) add('error', ref, 'id', 'Mã kiểu địch chỉ gồm chữ không dấu, số, gạch dưới.');
    text(ref, 'name', f.name, 'tên kiểu địch');
    if (!(num(f.hp) && f.hp > 0)) add('error', ref, 'hp', 'Kiểu địch: máu phải > 0.');
    for (const k of ['dmg', 'windup', 'cd', 'speed', 'reach', 'combo', 'recover']) if (!nonNeg(f[k])) add('error', ref, k, `Kiểu địch: ${k} phải là số ≥ 0.`);
    if (f.rage != null && !(num(f.rage) && f.rage >= 0 && f.rage < 1)) add('error', ref, 'rage', 'Nổi điên khi còn: phần máu 0–1 (vd 0,5).');
  }
  for (const [id, t] of Object.entries(fights)) {
    const ref = `fight:${id}`;
    if (!ID_RE.test(id)) add('error', ref, 'id', 'Mã trận chỉ gồm chữ không dấu, số, gạch dưới.');
    text(ref, 'name', t.name, 'tên trận');
    if (!ZONE_LIST.includes(t.zone)) add('error', ref, 'zone', `Trận: bản đồ lạ "${t.zone}".`);
    const xy = (v) => Array.isArray(v) && v.length === 2 && v.every(num);
    if (!xy(t.start)) add('error', ref, 'start', 'Trận: chỗ người chơi bắt đầu phải là [x, z].');
    if (t.ally && !people[t.ally]) add('error', ref, 'ally', `Trận: đồng đội "${t.ally}" không có trong "Người nói".`);
    if (t.ally && !xy(t.allyAt)) add('error', ref, 'allyAt', 'Trận: chỗ đồng đội đứng phải là [x, z].');
    if (!Array.isArray(t.foes) || !t.foes.length) add('error', ref, 'foes', 'Trận chưa có địch nào.');
    if (t.stealth) { // màn lẻn: tới chỗ goal mà không bị thấy
      if (!xy(t.stealth.goal)) add('error', ref, 'stealth', 'Màn lẻn: chỗ cần tới phải là [x, z].');
      if (t.stealth.r != null && !(num(t.stealth.r) && t.stealth.r > 0.3)) add('error', ref, 'stealth', 'Màn lẻn: bán kính phải > 0,3.');
      if (t.stealth.checkpoints != null && !(Array.isArray(t.stealth.checkpoints) && t.stealth.checkpoints.every(xy))) add('error', ref, 'stealth', 'Màn lẻn: chốt làm lại là danh sách [x, z].');
      if (!(t.foes || []).some((f) => f.patrol?.length || f.sneak)) add('warn', ref, 'stealth', 'Màn lẻn mà không ai đi tuần / đứng gác chưa phát hiện → vừa vào đã bị thấy.');
    }
    const seen = new Set();
    for (const f of t.foes || []) {
      if (!ID_RE.test(f.who || '')) add('error', ref, 'foes', `Trận: mã người "${f.who}" chỉ gồm chữ không dấu, số, gạch dưới.`);
      if (seen.has(f.who)) add('error', ref, 'foes', `Trận: mã người "${f.who}" bị trùng.`);
      seen.add(f.who);
      if (!foes[f.foe || 'thug']) add('error', ref, 'foes', `Trận: kiểu địch lạ "${f.foe}".`);
      if (f.look && !STORY_ACTOR_LOOKS.includes(f.look)) add('error', ref, 'foes', `Trận: dáng lạ "${f.look}".`);
      if (!xy(f.at)) add('error', ref, 'foes', `Trận: chỗ đứng của "${f.who}" phải là [x, z].`);
      if (f.join != null && f.join !== 'rage' && !(num(f.join) && f.join >= 0)) add('error', ref, 'foes', `Trận: "${f.who}" vào trận sau … giây (số ≥ 0) hoặc khi boss nổi điên.`);
      if (f.join === 'rage' && !(t.foes || []).some((x) => foes[x.foe]?.rage)) add('warn', ref, 'foes', `Trận: "${f.who}" chờ boss nổi điên mà trận không có boss nào nổi điên → không bao giờ vào.`);
      const pt = (q) => Array.isArray(q) && q.length >= 2 && q.length <= 4 && xy(q.slice(0, 2)) && (q[2] == null || (num(q[2]) && q[2] >= 0 && q[2] <= 30)) && (q[3] == null || (num(q[3]) && Math.abs(q[3]) <= 360));
      if (f.patrol != null && !(Array.isArray(f.patrol) && f.patrol.length >= 2 && f.patrol.every(pt))) add('error', ref, 'foes', `Trận: đường đi tuần của "${f.who}" cần ≥ 2 điểm [x, z, (dừng 0–30 giây), (hướng nhìn lúc dừng, độ)].`);
      if (f.sweep != null && !(num(f.sweep) && f.sweep >= 0 && f.sweep <= 90)) add('error', ref, 'foes', `Trận: "${f.who}" quét đèn 0–90 độ.`);
      if (f.sweepT != null && !(num(f.sweepT) && f.sweepT >= 2 && f.sweepT <= 30)) add('error', ref, 'foes', `Trận: "${f.who}" chu kỳ quét 2–30 giây.`);
      if (f.sight != null && !(num(f.sight) && f.sight >= 3 && f.sight <= 25)) add('error', ref, 'foes', `Trận: "${f.who}" nhìn xa 3–25 m.`);
      if (f.phase != null && !(num(f.phase) && f.phase >= 0 && f.phase <= 300)) add('error', ref, 'foes', `Trận: "${f.who}" lệch nhịp 0–300 giây.`);
    }
    for (const l of t.loot || []) {
      if (!weapons[l.id] || l.id === 'fists') add('error', ref, 'loot', `Trận: đồ dưới đất lạ "${l.id}".`);
      if (!xy(l.at)) add('error', ref, 'loot', 'Trận: chỗ đặt đồ phải là [x, z].');
    }
  }
  const RACE_KINDS = ['port', 'gate', 'industrial', 'highway', 'work', 'dirt', 'village', 'canal', 'bridge', 'levee', 'drawbridge', 'deadend'];
  const RACE_EVENTS = ['say', 'container', 'barrier', 'truck', 'bus', 'ram', 'potholes', 'ducks', 'puddle', 'stall', 'jump', 'drums', 'cones', 'brokencar', 'trunk', 'buffalo', 'forklift', 'cart', 'throwers', 'drawbridge'];
  for (const [id, r] of Object.entries(story?.races || {})) {
    const ref = `race:${id}`;
    if (!ID_RE.test(id)) add('error', ref, 'id', 'Mã màn đua chỉ gồm chữ không dấu, số, gạch dưới.');
    text(ref, 'name', r.name, 'tên màn đua');
    if (r.ally && !people[r.ally]) add('error', ref, 'ally', `Màn đua: đồng đội "${r.ally}" không có trong "Người nói".`);
    if (!Array.isArray(r.sections) || r.sections.length < 2) add('error', ref, 'sections', 'Màn đua cần ít nhất 2 đoạn đường.');
    (r.sections || []).forEach((sec, i) => {
      if (!RACE_KINDS.includes(sec.kind)) add('error', ref, 'sections', `Đoạn ${i + 1}: kiểu lạ "${sec.kind}".`);
      if (!(num(sec.len) && sec.len >= 40)) add('error', ref, 'sections', `Đoạn ${i + 1}: dài phải ≥ 40 m.`);
      if (sec.turn != null && !(num(sec.turn) && Math.abs(sec.turn) <= 180)) add('error', ref, 'sections', `Đoạn ${i + 1}: rẽ −180…180 độ.`);
      if (sec.name) text(ref, 'sections', sec.name, `tên đoạn ${i + 1}`);
      if (sec.line) text(ref, 'sections', sec.line, `câu hét đoạn ${i + 1}`);
      for (const e of sec.events || []) {
        if (!RACE_EVENTS.includes(e.type)) add('error', ref, 'sections', `Đoạn ${i + 1}: sự cố lạ "${e.type}".`);
        if (!(num(e.at) && e.at >= 0 && e.at <= sec.len)) add('error', ref, 'sections', `Đoạn ${i + 1}: sự cố "${e.type}" phải nằm trong đoạn (0–${sec.len} m).`);
        if (e.line) text(ref, 'sections', e.line, 'câu hét của sự cố');
        if (e.type === 'drawbridge' && sec.kind !== 'drawbridge') add('warn', ref, 'sections', `Đoạn ${i + 1}: cầu cất nên nằm trong đoạn kiểu "Cầu cất" (có nước 2 bên).`);
        if (e.type === 'drawbridge' && (e.at < 40 || e.at > sec.len - 120)) add('warn', ref, 'sections', `Đoạn ${i + 1}: cầu cất cần ≥ 40 m đường trước và ≥ 120 m đường sau để đáp xuống + phanh.`);
      }
    });
    if (r.sections?.length && !['deadend', 'drawbridge'].includes(r.sections[r.sections.length - 1].kind)) add('warn', ref, 'sections', 'Đoạn cuối nên là "Cầu cất" hoặc "Đường cụt" (xe tự phanh dừng ở cuối đường).');
  }
  for (const [id, c] of Object.entries(contacts)) {
    if (!ID_RE.test(id)) add('error', `contact:${id}`, 'id', 'Mã người nhắn chỉ gồm chữ không dấu, số, gạch dưới.');
    text(`contact:${id}`, 'name', c.name, 'tên người nhắn');
    if (c.place && places && !placeIds.has(c.place)) add('warn', `contact:${id}`, 'place', `Địa điểm "${c.place}" không có.`);
  }
  for (const [id, it] of Object.entries(items)) text(`item:${id}`, 'name', it.name, 'tên vật phẩm');
  for (const [pre, tb] of [['contact', contacts], ['people', people], ['item', items], ['parcel', parcels]]) for (const [id, x] of Object.entries(tb)) if (tooNewEmoji(x.icon)) add('warn', `${pre}:${id}`, 'icon', NEW_EMOJI_MSG);
  for (const [id, it] of Object.entries(parcels)) text(`parcel:${id}`, 'name', it.name, 'tên gói hàng');
  const chIds = new Set();
  // NPC địa điểm vắng mặt (hideNpc của chương / bước): địa điểm phải có NPC
  const npcPlaces = (ref, list) => {
    if (list == null) return;
    if (!Array.isArray(list)) return add('error', ref, 'hideNpc', 'NPC vắng mặt: phải là danh sách địa điểm.');
    for (const id of list) {
      place(ref, 'hideNpc', id);
      if (places && (places.places || []).some((p) => p.id === id && !p.npc)) add('warn', ref, 'hideNpc', `"${id}" không có NPC đứng ở cửa → ẩn cũng như không.`);
    }
  };
  for (const ch of story?.chapters || []) {
    if (chIds.has(ch.id)) add('error', ch.id, 'id', 'Trùng mã chương.');
    npcPlaces(ch.id, ch.hideNpc);
    chIds.add(ch.id);
    text(ch.id, 'title', ch.title, 'tên chương');
    if (!(ch.steps || []).length) add('warn', ch.id, 'steps', 'Chương chưa có bước nào.');
    const stIds = new Set();
    // cả chương: đạo cụ (prop), người chạy trốn (chase), mốc lộ trình "người:mốc" — cảnh quay / đạo cụ chờ mốc
    const chActs = (ch.steps || []).flatMap((x) => x.on || []);
    const chProps = new Set(chActs.filter((a) => a.do === 'prop' && a.id).map((a) => a.id));
    const chChasers = new Set(chActs.filter((a) => a.do === 'chase').map((a) => a.who));
    const chMarks = new Set(chActs.filter((a) => a.do === 'chase').flatMap((a) => (a.route || []).filter((r) => r?.mark).map((r) => `${a.who}:${r.mark}`)));
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
      if (u.type === 'reach') {
        if (!(Array.isArray(u.at) && u.at.length === 2 && u.at.every(num))) add('error', ref, 'until', 'Tới chỗ: tọa độ phải là [x, z] (số).');
        if (u.r != null && !(num(u.r) && u.r >= 2 && u.r <= 60)) add('error', ref, 'until', 'Tới chỗ: bán kính 2–60.');
      }
      if (u.type === 'use' && goods && !goods[u.goods]) add('error', ref, 'until', `Món "${u.goods}" không có trong đồ dùng.`);
      if (u.type === 'ack' && u.max != null && !(num(u.max) && u.max >= 0)) add('error', ref, 'until', 'Tự tắt sau … phút phải ≥ 0.');
      const chProps = new Set((ch.steps || []).flatMap((x) => (x.on || []).filter((a) => a.do === 'prop').map((a) => a.id)));
      if (u.type === 'ttSeen' && !(ch.steps || []).slice(0, i + 1).some((x) => (x.on || []).some((y) => y.do === 'ttPost' && y.id === u.id))) add('error', ref, 'until', `Đã lướt tới tin Tích Tắc: chưa có tin "${u.id}" (việc "📱 Tin Tích Tắc" ở bước này / trước) → người chơi kẹt.`);
      if (u.type === 'away' && !(u.who ? people[u.who] : Array.isArray(u.at) && u.at.length === 2 && u.at.every(num))) add('error', ref, 'until', 'Đi xa khỏi: chưa chọn người lạ / chỗ [x, z].');
      if (u.type === 'ambushed' && !(st.on || []).some((y) => y.do === 'ambush')) add('error', ref, 'until', 'Đã bày chốt đúng: bước này chưa có việc "🗺️ Bày trận" → người chơi kẹt.');
      if (u.type === 'hidden' && u.prop != null && !(ch.steps || []).some((x) => (x.on || []).some((a) => a.do === 'prop' && (a.kind === 'bin' || a.kind === 'mark') && a.id === u.prop))) add('error', ref, 'until', `Núp: chương này không có thùng rác / điểm đánh dấu "${u.prop}".`);
      if (u.type === 'hidden' && u.watch != null && !people[u.watch]) add('error', ref, 'until', `Núp: "quay mặt về" "${u.watch}" không có trong "Người nói".`);
      for (const mk of [].concat(st.mark || [])) { // một hoặc nhiều dấu
        if (mk.prop) { if (!chProps.has(mk.prop)) add('error', ref, 'mark', `Dấu: chương này không có đạo cụ "${mk.prop}".`); }
        else if (mk.actor) { if (!people[mk.actor]) add('error', ref, 'mark', `Dấu trên đầu: người lạ "${mk.actor}" không có.`); }
        else place(ref, 'mark', mk.place);
        if (!['!', '?', 'dot'].includes(mk.icon)) add('error', ref, 'mark', 'Dấu trên đầu NPC chỉ là ! · ? · chấm đỏ (dot).');
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
      if (u.type === 'cine' && !(st.on || []).some((a) => a.do === 'cine')) add('error', ref, 'until', 'Chờ cảnh phim chiếu xong mà bước này không có việc "🎬 Cảnh phim" → kẹt.');
      if (u.type === 'tackled' && !(st.on || []).some((a) => a.do === 'tackle')) add('error', ref, 'until', 'Chờ vật ngã xong mà bước này không có việc "🤼 Vật ngã" → kẹt.');
      if (u.type === 'raceWon' && !(st.on || []).some((a) => a.do === 'race')) add('error', ref, 'until', 'Chờ tới đích màn đua mà bước này không có việc "🏍️ Màn đua" → kẹt.');
      if (u.type === 'fightWon' && !(st.on || []).some((a) => a.do === 'fight')) add('error', ref, 'until', 'Chờ thắng trận mà bước này không có việc "⚔️ Trận đánh" → kẹt.');
      if (u.type === 'parked' && u.place) { place(ref, 'until', u.place); const pl = (places?.places || []).find((p) => p.id === u.place); if (pl && pl.look !== 'parkingLot') add('error', ref, 'until', `Gửi xe ở bãi: "${u.place}" không phải bãi giữ xe.`); }
      if (u.type === 'useAt') {
        if (!(Array.isArray(u.at) ? u.at.length === 2 && u.at.every(num) : ZONE_POINTS.includes(u.at))) add('error', ref, 'until', `Bấm E tại chỗ: chỗ lạ "${u.at}" (chỗ đứng có tên trong bản đồ riêng hoặc [x, z]).`);
        if (u.r != null && !(num(u.r) && u.r > 0.3 && u.r <= 20)) add('error', ref, 'until', 'Bấm E tại chỗ: bán kính 0,3 – 20.');
        if (u.label) text(ref, 'until', u.label, 'chữ trên nút E');
      }
      if (u.type === 'escaped' && !(st.on || []).some((a) => a.do === 'pursue')) add('error', ref, 'until', 'Chờ chạy thoát mà bước này không có việc "🏃 Bị rượt" → kẹt.');
      if (u.type === 'sneaked' && !(st.on || []).some((a) => a.do === 'sneak')) add('error', ref, 'until', 'Chờ bám theo lén xong mà bước này không có việc "🕵️ Bám theo lén" → kẹt.');
      if (u.type === 'chased') {
        const ok = (ch.steps || []).slice(0, i + 1).some((x) => (x.on || []).some((a) => a.do === 'chase' && a.who === u.who));
        if (!ok) add('error', ref, 'until', `Chờ "${u.who}" chạy hết lộ trình mà chưa có việc "🏍️ Chạy trốn" cho người này ở bước này hoặc bước trước → kẹt.`);
      }
      if (u.type === 'never') add(i < (ch.steps || []).length - 1 ? 'warn' : 'info', ref, 'until', 'Bước "Chưa viết tiếp": người chơi dừng ở đây (các bước sau không chạy tới).');
      if (st.deadline) {
        const D = st.deadline, back = (ch.steps || []).findIndex((x) => x.id === D.back);
        if (!(num(D.hour) && D.hour >= 0 && D.hour <= 24)) add('error', ref, 'deadline', 'Hạn giờ: 0–24 giờ.');
        if (back < 0 || back > i) add('error', ref, 'deadline', 'Hạn giờ: "quay lại bước" phải là một bước ở trước (hoặc chính bước này).');
        text(ref, 'deadline', D.text, 'thông báo thất bại');
        if (D.from || D.msg) {
          if (!contacts[D.from]) add('error', ref, 'deadline', 'Hạn giờ: người nhắn tin khi thất bại không có trong danh bạ.');
          text(ref, 'deadline', D.msg, 'tin nhắn khi thất bại');
        }
      }
      npcPlaces(ref, st.hideNpc);
      if (st.noFines != null && typeof st.noFines !== 'boolean') add('error', ref, 'noFines', 'Ô "không bị phạt" phải là có / không.');
      if (st.music != null && SOUNDS[st.music]?.kind !== 'music') add('error', ref, 'music', `Nhạc riêng: "${st.music}" không phải mã nhạc (music.*).`);
      if (st.noBeacon != null && typeof st.noBeacon !== 'boolean') add('error', ref, 'noBeacon', 'Ô "không có cột sáng" phải là có / không.');
      if (st.onlyTrait != null && !STORY_TRAITS.includes(st.onlyTrait)) add('error', ref, 'onlyTrait', `Chỉ chạy khi tính cách: tính cách lạ "${st.onlyTrait}".`);
      for (const k of ['onlyBefore', 'onlyAfter']) if (st[k] != null && !(num(st[k]) && st[k] >= 0 && st[k] <= 24)) add('error', ref, k, 'Chỉ chạy trước / từ giờ: 0–24.');
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
        if (st.talk.who && !people[st.talk.who]) add('error', ref, 'talk', `Người nói thay NPC: người lạ "${st.talk.who}" không có.`);
        else if (st.talk.who && !actorsHere(ch, i).has(st.talk.who)) add('error', ref, 'talk', `Người nói thay NPC "${st.talk.who}" chưa xuất hiện (thêm việc "Người lạ xuất hiện" ở bước này hoặc bước trước).`);
        text(ref, 'talk', st.talk.label, 'chữ trên nút E');
        text(ref, 'talk', st.talk.text, 'câu nói');
        if (st.talk.ok) text(ref, 'talk', st.talk.ok, 'chữ nút đồng ý (cũ, không còn hiện)');
        for (const pid of [].concat(st.talk.pack || [], st.talk.drop || [])) if (!parcels[pid]) add('error', ref, 'talk', `Gói hàng "${pid}" không có.`);
        if (st.talk.guide != null && typeof st.talk.guide !== 'boolean') add('error', ref, 'talk', 'Ô "hướng dẫn xếp túi" phải là có / không.');
        if (st.talk.giveQty != null && !(num(st.talk.giveQty) && st.talk.giveQty >= 1 && st.talk.giveQty <= 20)) add('error', ref, 'talk', 'Số phần tặng: 1–20.');
        if (st.talk.give && goods && !goods[st.talk.give]) add('error', ref, 'talk', `Đồ tặng "${st.talk.give}" không có trong đồ dùng.`);
      }
      if (st.goal) text(ref, 'goal', st.goal, 'mục tiêu');
      if (st.goTo) text(ref, 'goTo', st.goTo, 'chữ thanh chỉ đường');
      if (st.orders != null && typeof st.orders !== 'boolean') add('error', ref, 'orders', 'Ô "cho chạy đơn trong lúc chờ" phải là có / không.');
      if (st.hint) text(ref, 'hint', st.hint, 'gợi ý');
      if (st.target?.startsWith('actor:')) { if (!people[st.target.slice(6)]) add('error', ref, 'target', `Mũi tên: người lạ "${st.target.slice(6)}" không có.`); }
      else if (st.target?.startsWith('prop:')) { if (!new Set((ch.steps || []).flatMap((x) => (x.on || []).filter((a) => a.do === 'prop').map((a) => a.id))).has(st.target.slice(5))) add('error', ref, 'target', `Mũi tên: chương này không có đạo cụ "${st.target.slice(5)}".`); }
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
        if (gd.type === 'app' && !STORY_APPS.includes(gd.app)) add('error', ref, 'guide', `Hướng dẫn mở app: app lạ "${gd.app}".`);
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
        if (a.do === 'rename') {
          if (!people[a.who]) add('error', ref, 'on', `Đổi tên: người lạ "${a.who}" không có.`);
          text(ref, 'on', a.name, 'tên mới');
        }
        if (a.do === 'pay') {
          if (!(num(a.amount) && a.amount > 0 && a.amount <= 5000)) add('error', ref, 'on', 'Nhận tiền: số tiền 1–5000 (nghìn đồng).');
          if (a.from && !speakerOk(a.from) && !contacts[a.from]) add('error', ref, 'on', `Nhận tiền: người trả "${a.from}" không có.`);
          if (a.text) text(ref, 'on', a.text, 'thông báo nhận tiền');
        }
        if (['actor', 'approach', 'leave', 'remove', 'board', 'alight', 'goto', 'chase', 'dismount', 'helmetOff', 'helmetOn', 'tackle', 'wave', 'rideOff', 'sneak'].includes(a.do) && !people[a.who]) add('error', ref, 'on', `Người lạ "${a.who}" không có (danh sách Người nói).`);
        if (a.do === 'sneak') {
          if (a.with != null && (!people[a.with] || a.with === a.who)) add('error', ref, 'on', `Bám theo lén: người đi cùng "${a.with}" không có.`);
          const rt = Array.isArray(a.route) ? a.route : [];
          if (rt.length < 2 || rt.some((r) => !(Array.isArray(r?.at) && r.at.length === 2 && r.at.every(num)))) add('error', ref, 'on', 'Bám theo lén: lộ trình ≥ 2 điểm [x, z].');
          if (rt.some((r) => r?.look != null && !(num(r.look) && r.look >= 0 && r.look <= 10))) add('error', ref, 'on', 'Bám theo lén: ngoái lại 0–10 giây.');
          if (!rt.some((r) => r?.look > 0)) add('warn', ref, 'on', 'Bám theo lén: không điểm nào ngoái lại → chỉ bị phát hiện khi đi sát quá.');
          for (const [k, lo, hi] of [['speed', 0.5, 4], ['see', 3, 30], ['lose', 8, 80], ['start', 2, 60]]) if (a[k] != null && !(num(a[k]) && a[k] >= lo && a[k] <= hi)) add('error', ref, 'on', `Bám theo lén: ${k} ${lo}–${hi}.`);
          if (a.retry != null && !(Array.isArray(a.retry) && a.retry.length === 2 && a.retry.every(num))) add('error', ref, 'on', 'Bám theo lén: chỗ làm lại phải là [x, z].');
          if (a.hmm != null) text(ref, 'on', a.hmm, 'câu lúc bắt đầu nghi');
          if (a.caught != null) text(ref, 'on', a.caught, 'câu lúc phát hiện');
          if (u.type !== 'sneaked') add('warn', ref, 'on', 'Bám theo lén: điều kiện xong của bước nên là "Bám theo lén xong" (sneaked).');
        }
        if (a.do === 'tackle') {
          if (!people[a.target] || a.target === a.who) add('error', ref, 'on', `Vật ngã: người bị vật "${a.target}" không có (hoặc trùng người vật).`);
          if (a.qte != null && !(num(a.qte) && a.qte >= 0 && a.qte <= 5)) add('error', ref, 'on', 'Vật ngã: nút bấm nhanh 0–5 giây (0 = không có nút).');
          if (a.text != null) text(ref, 'on', a.text, 'chữ trên nút bấm nhanh');
          if (a.cine != null && typeof a.cine !== 'boolean') add('error', ref, 'on', 'Vật ngã: "quay chậm" phải là có / không.');
          if (u.type !== 'tackled') add('warn', ref, 'on', 'Vật ngã: điều kiện xong của bước nên là "Vật ngã xong" (tackled) — không thì bước sau có thể chạy khi chưa vật xong.');
        }
        if (a.do === 'pursue') {
          const ws = [].concat(a.who || []);
          if (!ws.length || ws.some((w) => !people[w])) add('error', ref, 'on', 'Bị rượt: người rượt phải là người lạ có trong danh sách.');
          for (const [k, lo, hi] of [['speed', 1, 9], ['delay', 0, 5], ['lose', 8, 120], ['catch', 0.5, 3], ['vanish', 10, 200]]) if (a[k] != null && !(num(a[k]) && a[k] >= lo && a[k] <= hi)) add('error', ref, 'on', `Bị rượt: ${k} ${lo}–${hi}.`);
          for (const k of ['stopText', 'caughtText', 'retryText', 'failText', 'failHint']) if (a[k] != null) text(ref, 'on', a[k], 'câu khi bị rượt');
          for (const k of ['bikeOnly', 'fail']) if (a[k] != null && typeof a[k] !== 'boolean') add('error', ref, 'on', `Bị rượt: ${k} phải là có / không.`);
          if (a.vanish != null && !(num(a.vanish) && a.vanish >= 10 && a.vanish <= 200)) add('error', ref, 'on', 'Bị rượt: chạy xe được 10–200 thì bọn kia biến mất.');
          if (u.type !== 'escaped') add('warn', ref, 'on', 'Bị rượt: điều kiện xong của bước nên là "Đã chạy thoát" (escaped).');
        }
        if (a.do === 'zone') {
          if (a.id && !ZONE_LIST.includes(a.id)) add('error', ref, 'on', `Bản đồ riêng: mã lạ "${a.id}" (có: ${ZONE_LIST.join(', ')}).`);
          if (a.at != null && !(Array.isArray(a.at) ? a.at.length === 2 && a.at.every(num) : typeof a.at === 'string' && (a.at.startsWith('spot:') ? spots[a.at.slice(5)] : ZONE_POINTS.includes(a.at)))) add('error', ref, 'on', `Bản đồ riêng: chỗ đứng lạ "${a.at}".`);
          for (const k of ['gate', 'door']) if (a[k] != null && typeof a[k] !== 'boolean') add('error', ref, 'on', `Bản đồ riêng: ${k} phải là có / không.`);
        }
        if (a.do === 'actor' && a.tied != null && typeof a.tied !== 'boolean') add('error', ref, 'on', 'Người lạ: "bị trói" phải là có / không.');
        if ((a.do === 'phone' && a.off != null && typeof a.off !== 'boolean') || (a.do === 'tie' && a.on != null && typeof a.on !== 'boolean')) add('error', ref, 'on', 'Tịch thu điện thoại / trói: phải là có / không.');
        if ((a.do === 'tie' || a.do === 'untie') && a.who !== 'player' && !people[a.who]) add('error', ref, 'on', `Trói / cởi trói: người lạ "${a.who}" không có.`);
        if (a.do === 'untie') {
          if (a.need != null && !(num(a.need) && a.need >= 3 && a.need <= 60)) add('error', ref, 'on', 'Cởi trói: số lần bấm E 3–60.');
          if (u.type !== 'untied') add('warn', ref, 'on', 'Cởi trói: điều kiện xong của bước nên là "Đã cởi trói" (untied).');
        }
        if (a.do === 'ship') {
          if (!['dock', 'leave', 'gone'].includes(a.state)) add('error', ref, 'on', 'Tàu hàng: trạng thái dock (cập bến) / leave (rời bến) / gone (biến mất).');
          if (a.state === 'dock' && !(Array.isArray(a.at) && a.at.length === 2 && a.at.every(num))) add('error', ref, 'on', 'Tàu hàng cập bến: chỗ đậu phải là [x, z].');
          if (a.heading != null && !num(a.heading)) add('error', ref, 'on', 'Tàu hàng: hướng mũi tàu phải là số (độ).');
        }
        if (a.do === 'traffic') {
          if (!(num(a.clear) && a.clear >= 0 && a.clear <= 200)) add('error', ref, 'on', 'Giữ vùng vắng xe: bán kính 0–200 (0 = trả lại xe).');
          if (a.at != null && !(Array.isArray(a.at) && a.at.length === 2 && a.at.every(num))) add('error', ref, 'on', 'Giữ vùng vắng xe: tâm vùng phải là [x, z].');
        }
        if ((a.do === 'bubble' || a.do === 'sound') && a.after != null && !(num(a.after) && a.after >= 0 && a.after <= 60)) add('error', ref, 'on', 'Nói / phát sau 0–60 giây.');
        if (a.do === 'wave' && a.t != null && !(num(a.t) && a.t >= 0.5 && a.t <= 6)) add('error', ref, 'on', 'Vẫy tay: 0,5–6 giây.');
        if (a.do === 'rideOff' && a.sound && !SOUNDS[a.sound]) add('error', ref, 'on', `Lên xe chạy đi: mã âm thanh lạ "${a.sound}".`);
        if (a.do === 'phoneCall' && a.on != null && typeof a.on !== 'boolean') add('error', ref, 'on', 'Gọi điện: "đưa lên tai" phải là có / không.');
        if (a.do === 'fade') {
          if (a.text != null) text(ref, 'on', a.text, 'chữ trên màn đen');
          if (a.t != null && !(num(a.t) && a.t >= 0.5 && a.t <= 10)) add('error', ref, 'on', 'Màn đen: giữ tối 0,5–10 giây.');
          for (const w of [].concat(a.remove || [])) if (!people[w]) add('error', ref, 'on', `Màn đen: dọn người lạ "${w}" không có.`);
          if (a.props != null && typeof a.props !== 'boolean' && !Array.isArray(a.props)) add('error', ref, 'on', 'Màn đen: "dọn đạo cụ" phải là có / không hoặc danh sách mã đạo cụ.');
          if (a.stand != null && !people[a.stand]) add('error', ref, 'on', `Màn đen: người đứng lại "${a.stand}" không có.`);
          if (a.dist != null && !(num(a.dist) && a.dist >= 1 && a.dist <= 6)) add('error', ref, 'on', 'Màn đen: đứng cách người chơi 1–6 m.');
          if (a.skip != null && !(num(a.skip) && a.skip >= 0 && a.skip <= 720)) add('error', ref, 'on', 'Màn đen: tua 0–720 phút.');
          if (a.skipTo != null && !(num(a.skipTo) && a.skipTo >= 0 && a.skipTo < 24)) add('error', ref, 'on', 'Màn đen: tua tới giờ 0–24.');
          if (Array.isArray(a.props)) for (const id of a.props) if (!chProps.has(id)) add('error', ref, 'on', `Màn đen: dọn đạo cụ "${id}" chưa có trong chương.`);
        }
        if (a.do === 'actor' && a.look && !STORY_ACTOR_LOOKS.includes(a.look)) add('error', ref, 'on', `Dáng người lạ lạ "${a.look}".`);
        if (a.do === 'race' && !(story?.races || {})[a.id]) add('error', ref, 'on', `Màn đua: màn "${a.id}" không có (mục 🏍️ Màn đua).`);
        if (a.do === 'fight' && !(story?.fights || {})[a.id]) add('error', ref, 'on', `Trận đánh: trận "${a.id}" không có (thẻ ⚔️ Đánh nhau).`);
        if (a.do === 'fpv' && a.on != null && typeof a.on !== 'boolean') add('error', ref, 'on', 'Góc nhìn thứ 1: bật phải là có / không.');
        // dáng "theo sơ đồ quan hệ": phải có nhân vật gắn với người này, có ngoại hình riêng hoặc là NPC địa điểm
        if (a.do === 'actor' && a.look === 'char' && relations) {
          const c = Object.values(relations.characters || {}).find((x) => x.story === a.who);
          if (!c) add('error', ref, 'on', `Dáng "Theo sơ đồ quan hệ": chưa có nhân vật nào gắn với "${a.who}" (công cụ /?relationship → Gắn với game).`);
          else if (!c.look && !c.place) add('error', ref, 'on', `Dáng "Theo sơ đồ quan hệ": ${c.name} chưa có ngoại hình (thẻ Ngoại hình trong /?relationship).`);
        }
        if (a.do === 'actor') {
          if (a.spot && !STORY_ACTOR_SPOTS.includes(a.spot)) add('error', ref, 'on', `Chỗ đứng người lạ lạ "${a.spot}".`);
          if (a.spot === 'at' && !(Array.isArray(a.at) && a.at.length === 2 && a.at.every(num))) add('error', ref, 'on', 'Người lạ: chỗ đứng tọa độ phải là [x, z].');
          if (a.spot === 'at' && a.heading != null && !num(a.heading)) add('error', ref, 'on', 'Người lạ: hướng mặt phải là số (độ).');
          if (a.spot === 'place') {
            place(ref, 'on', a.place);
            if (a.dist != null && !(num(a.dist) && a.dist >= 0 && a.dist <= 40)) add('error', ref, 'on', 'Người lạ: cách cửa 0–40 m.');
            if (a.lat != null && !(num(a.lat) && Math.abs(a.lat) <= 20)) add('error', ref, 'on', 'Người lạ: lệch dọc đường −20…20 m.');
          }
          if (a.vehicle != null && !STORY_ACTOR_VEHICLES.includes(a.vehicle)) add('error', ref, 'on', `Xe đi kèm lạ "${a.vehicle}".`);
          if (a.vehicle && a.spot !== 'place' && a.spot !== 'at') add('warn', ref, 'on', 'Xe đi kèm chỉ dựng được khi người lạ đứng "trước cửa địa điểm" hoặc "đúng tọa độ".');
          if (a.bikeAt != null && !(Array.isArray(a.bikeAt) && a.bikeAt.length === 2 && a.bikeAt.every(num))) add('error', ref, 'on', 'Người lạ: chỗ dựng xe phải là [x, z].');
          if (a.faceTo != null && !people[a.faceTo]) add('error', ref, 'on', `Nhìn về phía "${a.faceTo}": người lạ không có.`);
          if (a.spot === 'xeOm') {
            place(ref, 'on', a.place);
            if (a.place && places && (places.places || []).some((p) => p.id === a.place && !p.xeOm)) add('error', ref, 'on', `"${a.place}" không bật "Có chú xe ôm" → người lạ không có chỗ đứng (thẻ Địa điểm → Chú xe ôm).`);
          }
          if (a.call) text(ref, 'on', a.call, 'câu gọi người chơi');
          for (const k of a.idle == null ? [] : [].concat(a.idle)) text(ref, 'on', k, 'câu nói khi hết chuyện');
        }
        if (a.do === 'bubble') {
          if (!speakerOk(a.who, true) && !(String(a.who).startsWith('prop:') && chActs.some((x) => x.do === 'prop' && x.kind === 'police' && x.id === a.who.slice(5)))) add('error', ref, 'on', `Bong bóng: người nói "${a.who}" không có (player / người lạ / place:<địa điểm có NPC> / prop:<xe công an>).`);
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
        if (a.do === 'goto') place(ref, 'on', a.place);
        if (a.do === 'approach' && a.stop != null && typeof a.stop !== 'boolean') add('error', ref, 'on', 'Ô "tới nơi thì đứng lại" phải là có / không.');
        if (a.do === 'react') {
          const ws = [].concat(a.who || []);
          if (!ws.length) add('error', ref, 'on', 'Dấu ? / !: chưa chọn ai.');
          for (const w of ws) if (!speakerOk(w, true)) add('error', ref, 'on', `Dấu ? / !: "${w}" không có (player / người lạ / place:<địa điểm có NPC>).`);
          if (a.icon != null && !['?', '!'].includes(a.icon)) add('error', ref, 'on', 'Dấu nhảy trên đầu chỉ là ? hoặc !.');
        }
        if (a.do === 'sound' && !SOUNDS[a.code]) add('error', ref, 'on', `Phát tiếng: mã âm thanh lạ "${a.code}".`);
        if (a.do === 'cine') {
          const shots = Array.isArray(a.shots) ? a.shots : [];
          if (!shots.length || shots.length > 16) add('error', ref, 'on', 'Cảnh phim: 1–16 cảnh quay.');
          const tgtOk = (at) => at === 'player' || (at.startsWith('place:') && (!places || placeIds.has(at.slice(6)))) || (at.startsWith('actor:') && !!people[at.slice(6)]) || (at.startsWith('prop:') && chProps.has(at.slice(5)));
          shots.forEach((sh, k) => {
            const w = `Cảnh phim — cảnh ${k + 1}: `, at = String(sh?.at || (sh?.eye || sh?.pos ? 'player' : ''));
            if (sh?.pos != null && !(Array.isArray(sh.pos) && sh.pos.length === 3 && sh.pos.every(num))) add('error', ref, 'on', `${w}chỗ đặt máy quay phải là [x, cao, z] (số).`);
            if (Array.isArray(sh?.pos) && sh.at == null && sh.lookAt == null) add('error', ref, 'on', `${w}máy quay đặt cố định thì phải chọn "nhìn theo".`);
            if (at.startsWith('place:')) place(ref, 'on', at.slice(6));
            else if (at.startsWith('actor:')) { if (!people[at.slice(6)]) add('error', ref, 'on', `${w}người lạ "${at.slice(6)}" không có.`); }
            else if (at.startsWith('prop:')) { if (!chProps.has(at.slice(5))) add('error', ref, 'on', `${w}đạo cụ "${at.slice(5)}" chưa có (việc "🚛 Đạo cụ" trong chương).`); }
            else if (at !== 'player') add('error', ref, 'on', `${w}nhìn vào đâu? (địa điểm / người lạ / đạo cụ / người chơi).`);
            if (sh?.lookAt != null && !tgtOk(String(sh.lookAt))) add('error', ref, 'on', `${w}"nhìn theo" — "${sh.lookAt}" không có.`);
            if (sh?.until != null && !MARK_RE.test(String(sh.until))) add('error', ref, 'on', `${w}"tới mốc thì sang cảnh sau" phải dạng người:mốc (vd thief:truck).`);
            else if (sh?.until != null && !chMarks.has(sh.until)) add('warn', ref, 'on', `${w}mốc "${sh.until}" không thấy trong lộ trình chạy trốn nào của chương → cảnh quay chạy hết giờ mới sang.`);
            if (sh?.slow != null && !(num(sh.slow) && sh.slow >= 0.1 && sh.slow <= 1)) add('error', ref, 'on', `${w}quay chậm 0,1–1 (1 = bình thường).`);
            if (sh?.sound != null && !SOUNDS[sh.sound]) add('error', ref, 'on', `${w}mã âm thanh lạ "${sh.sound}".`);
            for (const k of ['yaw', 'yawTo', 'pitch']) if (sh?.[k] != null && !num(sh[k])) add('error', ref, 'on', `${w}góc ${k} phải là số (độ).`);
            if (sh?.turn != null && !(num(sh.turn) && sh.turn > 0)) add('error', ref, 'on', `${w}thời gian quay đầu phải > 0 giây.`);
            if (sh?.fov != null && !(num(sh.fov) && sh.fov >= 20 && sh.fov <= 100)) add('error', ref, 'on', `${w}góc rộng ống kính 20–100 độ.`);
            if (sh?.eye != null && typeof sh.eye !== 'boolean') add('error', ref, 'on', `${w}"góc nhìn thứ nhất" phải là có / không.`);
            if (!(num(sh?.t) && sh.t >= 0.5 && sh.t <= 30)) add('error', ref, 'on', `${w}dài 0,5–30 giây.`);
            if (sh?.dist != null && !(num(sh.dist) && sh.dist >= 1 && sh.dist <= 80)) add('error', ref, 'on', `${w}khoảng cách 1–80 m.`);
            if (sh?.height != null && !(num(sh.height) && sh.height >= -2 && sh.height <= 60)) add('error', ref, 'on', `${w}độ cao −2…60 m.`);
            if (sh?.angle != null && !num(sh.angle)) add('error', ref, 'on', `${w}góc phải là số (độ).`);
            if (sh?.follow != null && typeof sh.follow !== 'boolean') add('error', ref, 'on', `${w}"bám theo" phải là có / không.`);
          });
          if (a.endRide != null && !people[a.endRide]) add('error', ref, 'on', `Cảnh phim: "xong cảnh lên xe đuổi theo" — người lạ "${a.endRide}" không có.`);
          if (a.ride != null && !chChasers.has(a.ride)) add('error', ref, 'on', `Cảnh phim: "xe người chơi tự chạy theo" — "${a.ride}" không có việc "🏍️ Chạy trốn" trong chương.`);
          if (a.rideSpeed != null && !(num(a.rideSpeed) && a.rideSpeed >= 3 && a.rideSpeed <= 30)) add('error', ref, 'on', 'Cảnh phim: tốc độ xe người chơi tự chạy 3–30.');
          if (a.rideStop != null && !(num(a.rideStop) && a.rideStop >= 2 && a.rideStop <= 80)) add('error', ref, 'on', 'Cảnh phim: xe người chơi dừng cách 2–80.');
          if (a.clear != null && !(num(a.clear) && a.clear > 0 && a.clear <= 200)) add('error', ref, 'on', 'Cảnh phim: dọn xe NPC bán kính 1–200.');
          if (a.clearAll != null && typeof a.clearAll !== 'boolean') add('error', ref, 'on', 'Cảnh phim: "tắt hết xe thường" phải là có / không.');
          if (a.playerRun != null && !(Array.isArray(a.playerRun) && a.playerRun.length && a.playerRun.every((p) => Array.isArray(p) && p.length === 2 && p.every(num)))) add('error', ref, 'on', 'Cảnh phim: người chơi chạy bộ theo các điểm [x, z].');
          if (a.runSpeed != null && !(num(a.runSpeed) && a.runSpeed >= 1 && a.runSpeed <= 9)) add('error', ref, 'on', 'Cảnh phim: tốc độ chạy bộ 1–9.');
          if (a.runDelay != null && !(num(a.runDelay) && a.runDelay >= 0 && a.runDelay <= 20)) add('error', ref, 'on', 'Cảnh phim: chờ trước khi chạy 0–20 giây.');
          if (a.bikeAt != null && !(Array.isArray(a.bikeAt) && a.bikeAt.length >= 2 && a.bikeAt.every(num))) add('error', ref, 'on', 'Cảnh phim: chỗ xe chờ phải là [x, z, hướng°].');
          const total = shots.reduce((t, sh) => t + (num(sh?.t) ? sh.t : 0), 0);
          if (total > 45) add('warn', ref, 'on', `Cảnh phim dài tối đa ${Math.round(total)} giây = ${Math.round(total)} phút trong game (đồng hồ không dừng) — nên ngắn gọn (cảnh có "tới mốc" có thể ngắn hơn).`);
        }
        if (a.do === 'chase') {
          if (a.look && !STORY_ACTOR_LOOKS.includes(a.look)) add('error', ref, 'on', `Dáng người lạ lạ "${a.look}".`);
          const route = Array.isArray(a.route) ? a.route : [];
          if (route.length < 2) add('error', ref, 'on', 'Chạy trốn: lộ trình cần ít nhất 2 điểm.');
          for (const r of route) {
            if (r?.place) place(ref, 'on', r.place);
            else if (Array.isArray(r?.at)) { if (!(r.at.length === 2 && r.at.every(num))) add('error', ref, 'on', 'Chạy trốn: điểm tọa độ phải là [x, z] (số).'); }
            else if (!(Array.isArray(r?.node) && r.node.length === 2 && r.node.every((v) => Number.isInteger(v) && v >= 0 && v <= 30))) add('error', ref, 'on', 'Chạy trốn: điểm lộ trình phải là địa điểm, ngã tư [cột, hàng] hoặc tọa độ [x, z].');
            if (r?.lat != null && !(num(r.lat) && r.lat >= -8 && r.lat <= 8)) add('error', ref, 'on', 'Chạy trốn: lệch ngang −8…8.');
            if (r?.y != null && !(num(r.y) && r.y >= 0 && r.y <= 6)) add('error', ref, 'on', 'Chạy trốn: độ cao điểm 0–6.');
            if (r?.air != null && !(num(r.air) && r.air > 0 && r.air <= 12)) add('error', ref, 'on', 'Chạy trốn: bay cao thêm 0–12.');
            if (r?.air != null && !r.at) add('warn', ref, 'on', 'Chạy trốn: "bay" nên đặt ở điểm tọa độ [x, z] (chặng bay là đường thẳng).');
            if (r?.mark != null && !ID_RE.test(String(r.mark))) add('error', ref, 'on', `Chạy trốn: tên mốc "${r.mark}" chỉ gồm chữ không dấu, số.`);
            if (r?.act != null && !['drift', 'crash', 'stall'].includes(r.act)) add('error', ref, 'on', `Chạy trốn: hành động lạ "${r.act}" (drift / crash / stall).`);
            if (r?.speed != null && !(num(r.speed) && r.speed >= 3 && r.speed <= 40)) add('error', ref, 'on', 'Chạy trốn: tốc độ từ điểm này 3–40.');
            for (const code of r?.sound == null ? [] : [].concat(r.sound)) if (!SOUNDS[code]) add('error', ref, 'on', `Chạy trốn: tiếng ở điểm — mã âm thanh lạ "${code}".`);
            if (r?.soundLead != null && !(num(r.soundLead) && r.soundLead >= 0 && r.soundLead <= 30)) add('error', ref, 'on', 'Chạy trốn: lúc "rầm" trong file 0–30 giây.');
          }
          if (a.gap != null && !(num(a.gap) && a.gap >= 10 && a.gap <= 80)) add('error', ref, 'on', 'Chạy trốn: cách người chơi 10–80 m.');
          if (a.speed != null && !(num(a.speed) && a.speed >= 5 && a.speed <= 30)) add('error', ref, 'on', 'Chạy trốn: tốc độ 5–30.');
          if (a.delay != null && !(num(a.delay) && a.delay >= 0 && a.delay <= 10)) add('error', ref, 'on', 'Chạy trốn: chờ trước khi chạy 0–10 giây.');
          if (a.pct != null && !(num(a.pct) && a.pct >= 40 && a.pct <= 100)) add('error', ref, 'on', 'Chạy trốn: tốc độ 40–100 % xe người chơi.');
          if (a.lose != null && !(num(a.lose) && a.lose >= 300 && a.lose <= 5000)) add('error', ref, 'on', 'Chạy trốn: mất dấu khi cách 300–5000 m.');
          if (a.lose != null && num(a.gap) && a.lose / 10 <= a.gap * 1.5) add('warn', ref, 'on', `Chạy trốn: mốc mất dấu ${a.lose} m sát quá khoảng giữ cách (${a.gap} đơn vị ≈ ${a.gap * 10} m trên màn hình) → dễ thua ngay.`);
          if (a.revAt != null && !['start', 'pass', 'none'].includes(a.revAt)) add('error', ref, 'on', 'Chạy trốn: tiếng nẹt pô lúc start / pass / none.');
          if (a.carry != null && a.carry !== 'bouquet') add('error', ref, 'on', `Chạy trốn: đồ chở theo lạ "${a.carry}" (bouquet).`);
          if (a.bike != null && !['sport', 'supersport'].includes(a.bike)) add('error', ref, 'on', `Chạy trốn: kiểu xe lạ "${a.bike}".`);
          if (a.color != null && !COLOR_RE.test(String(a.color))) add('error', ref, 'on', 'Chạy trốn: màu xe dạng #rrggbb.');
          if (a.follow != null && (!chChasers.has(a.follow) || a.follow === a.who)) add('error', ref, 'on', `Chạy trốn: "đuổi theo" — "${a.follow}" không có việc "🏍️ Chạy trốn" trong chương.`);
          if (a.spawn != null && a.spawn !== 'behind') add('error', ref, 'on', 'Chạy trốn: chỗ xuất hiện lạ (bỏ trống hoặc behind).');
          if (a.back != null && !(num(a.back) && a.back >= 5 && a.back <= 200)) add('error', ref, 'on', 'Chạy trốn: xuất hiện sau lưng cách 5–200.');
          if (a.nearSound != null && !SOUNDS[a.nearSound]) add('error', ref, 'on', `Chạy trốn: tiếng khi tới gần — mã âm thanh lạ "${a.nearSound}".`);
          if (a.loop != null && SOUNDS[a.loop]?.kind !== 'loop') add('error', ref, 'on', `Chạy trốn: tiếng máy xe phải là mã tiếng lặp (loop.*), không phải "${a.loop}".`);
          if (a.nearDist != null && !(num(a.nearDist) && a.nearDist >= 2 && a.nearDist <= 120)) add('error', ref, 'on', 'Chạy trốn: tới gần người chơi 2–120 thì phát tiếng.');
          if (a.dodge != null && typeof a.dodge !== 'boolean') add('error', ref, 'on', 'Chạy trốn: "né xe" phải là có / không.');
          if (a.runSpeed != null && !(num(a.runSpeed) && a.runSpeed >= 1 && a.runSpeed <= 8)) add('error', ref, 'on', 'Chạy trốn: tốc độ chạy bộ sau khi té 1–8.');
          if (a.look === 'char' && relations && !Object.values(relations.characters || {}).some((x) => x.story === a.who)) add('error', ref, 'on', `Dáng "Theo sơ đồ quan hệ": chưa có nhân vật nào gắn với "${a.who}".`);
        }
        if (a.do === 'prop') {
          if (!ID_RE.test(String(a.id || ''))) add('error', ref, 'on', 'Đạo cụ: mã chỉ gồm chữ không dấu, số (vd truck1).');
          if (!['truck', 'ramp', 'dog', 'car', 'moto', 'police', 'easel', 'bin', 'can', 'water', 'bigbike', 'mark'].includes(a.kind)) add('error', ref, 'on', `Đạo cụ: loại lạ "${a.kind}" (truck / ramp / dog / car / moto / police / easel / bin / can / water / bigbike / mark).`);
          if (a.kind === 'water' && [a.w, a.len, a.depth].some((v) => v != null && !(num(v) && v > 0 && v <= 200))) add('error', ref, 'on', 'Nước ngập: rộng / dài / sâu phải là số dương.');
          if (a.hide != null && (a.kind !== 'bin' || typeof a.hide !== 'boolean')) add('error', ref, 'on', 'Đạo cụ: "núp được" chỉ cho thùng rác, phải là có / không.');
          if (a.cops != null && !(Number.isInteger(a.cops) && a.cops >= 1 && a.cops <= 4)) add('error', ref, 'on', 'Xe công an: 1–4 anh công an.');
          if (a.copsTo != null && !(String(a.copsTo).startsWith('actor:') && people[String(a.copsTo).slice(6)])) add('error', ref, 'on', `Xe công an: "đi tới chỗ" phải là actor:<người lạ có trong danh sách>.`);
          if (a.name != null) text(ref, 'on', a.name, 'tên người nói (công an)');
          if (a.color != null && !COLOR_RE.test(String(a.color))) add('error', ref, 'on', 'Đạo cụ: màu dạng #rrggbb.');
          if (a.model != null && !['suv', 'taxi', 'truck'].includes(a.model)) add('error', ref, 'on', `Đạo cụ: kiểu ô tô lạ "${a.model}".`);
          if (a.keep != null && typeof a.keep !== 'boolean') add('error', ref, 'on', 'Đạo cụ: "dừng lại ở cuối đường" phải là có / không.');
          const rt = Array.isArray(a.route) ? a.route : [];
          if (rt.some((r) => !(Array.isArray(r?.at) && r.at.length === 2 && r.at.every(num)))) add('error', ref, 'on', 'Đạo cụ: điểm đường chạy phải là [x, z].');
          if (rt.some((r) => r?.wait != null && !(num(r.wait) && r.wait >= 0 && r.wait <= 30))) add('error', ref, 'on', 'Đạo cụ: dừng chờ 0–30 giây.');
          if (!rt.length && !(Array.isArray(a.at) && a.at.length === 2 && a.at.every(num))) add('error', ref, 'on', 'Đạo cụ: chưa có chỗ đặt [x, z] (hoặc đường chạy).');
          if (!['ramp', 'easel', 'bin', 'can', 'water', 'bigbike', 'mark'].includes(a.kind) && rt.length < 2) add('warn', ref, 'on', 'Đạo cụ xe tải / chó nên có đường chạy ≥ 2 điểm.');
          if (a.speed != null && !(num(a.speed) && a.speed > 0 && a.speed <= 30)) add('error', ref, 'on', 'Đạo cụ: tốc độ 0–30.');
          if (a.when != null && !MARK_RE.test(String(a.when))) add('error', ref, 'on', 'Đạo cụ: "chạy khi" phải dạng người:mốc (vd thief:truck).');
          else if (a.when != null && !chMarks.has(a.when)) add('warn', ref, 'on', `Đạo cụ: mốc "${a.when}" không thấy trong lộ trình chạy trốn nào của chương → không bao giờ chạy.`);
          if (a.sound != null && !SOUNDS[a.sound]) add('error', ref, 'on', `Đạo cụ: mã âm thanh lạ "${a.sound}".`);
        }
        if (a.do === 'offer' && a.kind != null && !['ride', 'food', 'parcel'].includes(a.kind)) add('error', ref, 'on', `Mời đơn: loại lạ "${a.kind}" (ride / food / parcel).`);
        if (a.do === 'offer' && a.kind === 'parcel') {
          place(ref, 'on', a.place);
          if (a.to) place(ref, 'on', a.to);
          if (orderItems && !orderItems[a.item]) add('error', ref, 'on', `Mời đơn chở hàng: món "${a.item}" không có trong items.json.`);
          if (a.minStars != null && !(Number.isInteger(a.minStars) && a.minStars >= 1 && a.minStars <= 5)) add('error', ref, 'on', 'Mời đơn: cần ít nhất 1–5 sao.');
          if (a.minStars && !a.strict) add('warn', ref, 'on', 'Mời đơn: có "cần ít nhất … sao" mà không tick "chấm điểm thật" → đơn cốt truyện luôn 5★, điều kiện sao vô nghĩa.');
          if (a.customer) text(ref, 'on', a.customer, 'tên khách');
          if (a.failText) text(ref, 'on', a.failText, 'câu khi chưa đủ sao');
        }
        if (a.do === 'ttPost') {
          if (!a.id || !ID_RE.test(a.id)) add('error', ref, 'on', 'Tin Tích Tắc: thiếu mã (chữ + số).');
          text(ref, 'on', a.author, 'tên tài khoản');
          if (a.caption) text(ref, 'on', a.caption, 'chú thích');
          for (const k of a.comments || []) text(ref, 'on', k, 'bình luận');
          if (a.photo?.actor && !people[a.photo.actor]) add('error', ref, 'on', `Tin Tích Tắc: ảnh chụp người lạ "${a.photo.actor}" không có.`);
          else if (a.photo?.actor && !actorsHere(ch, i).has(a.photo.actor)) add('warn', ref, 'on', `Tin Tích Tắc: người lạ "${a.photo.actor}" chưa xuất hiện ở bước này / trước → ảnh không chụp được (thành tin chữ).`);
          if (a.who && !people[a.who] && !contacts[a.who]) add('error', ref, 'on', `Tin Tích Tắc: người đăng "${a.who}" không có.`);
        }
        if (a.do === 'block' && !contacts[a.who]) add('error', ref, 'on', `Chặn: người nhắn "${a.who}" không có trong danh bạ.`);
        if (a.do === 'msg' && a.as) text(ref, 'on', a.as, 'tên người gửi trong nhóm');
        if (a.do === 'msg' && a.as && !contacts[a.from]?.group) add('warn', ref, 'on', 'Tin nhắn có "người gửi trong nhóm" mà người nhắn không phải nhóm chat.');
        if (a.do === 'ambush' && Array.isArray(a.rounds)) { // nhiều màn vẽ tự do
          const n2 = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(x) && x >= -1 && x <= 12);
          if (!a.rounds.length) add('error', ref, 'on', 'Bày trận: chưa có màn nào.');
          a.rounds.forEach((R, k) => {
            const w = `Bày trận màn ${k + 1}: `;
            if (!(Number.isInteger(R.cols) && Number.isInteger(R.rows) && R.cols >= 2 && R.rows >= 2 && R.cols <= 9 && R.rows <= 8)) return add('error', ref, 'on', `${w}lưới 2–9 cột × 2–8 hàng.`);
            if (![R.start, R.trap, R.trapTo].every(n2) || !(R.exits || []).every(n2) || !(R.fixed || []).every(n2) || !(R.cut || []).every((c) => Array.isArray(c) && c.length === 2 && c.every(n2))) return add('error', ref, 'on', `${w}ngã tư phải là [cột, hàng].`);
            if (!(R.exits || []).length) add('error', ref, 'on', `${w}chưa có lối thoát.`);
            const sols = ambushSolutions(roundDef(R), roundNb(R), R.blocks ?? 1).length;
            if (!sols) add('error', ref, 'on', `${w}không có cách đặt ${R.blocks ?? 1} chốt nào thắng — người chơi kẹt.`);
            else if ((R.blocks ?? 1) > 1 && ambushSolutions(roundDef(R), roundNb(R), (R.blocks ?? 1) - 1).length) add('warn', ref, 'on', `${w}ít chốt hơn vẫn thắng → dễ quá.`);
          });
        }
        if (a.do === 'ambushCrew' && a.nodes != null && !(Array.isArray(a.nodes) && a.nodes.every((v) => Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(x) && x >= 0 && x <= 10)))) add('error', ref, 'on', 'Anh em đứng chốt: ngã tư thật phải là [cột, hàng] 0–10.');
        if (a.do === 'ambush' && !Array.isArray(a.rounds)) {
          const n2 = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(x) && x >= 0 && x <= 30);
          if (!(Array.isArray(a.region) && a.region.length === 4 && a.region.every(Number.isInteger))) add('error', ref, 'on', 'Bày trận: khung [cột đầu, cột cuối, hàng đầu, hàng cuối] chưa đúng.');
          else if (![a.start, a.trap].every(n2) || !(a.exits || []).every(n2) || !(a.fixed || []).every(n2)) add('error', ref, 'on', 'Bày trận: ngã tư phải là [cột, hàng].');
          else {
            const nb = (x, y) => neighbors(x, y);
            const sols = ambushSolutions(a, nb).length;
            if (!sols) add('error', ref, 'on', `Bày trận: không có cách đặt ${a.blocks ?? 3} chốt nào thắng — người chơi kẹt.`);
            else if ((a.blocks ?? 3) > 1 && ambushSolutions(a, nb, (a.blocks ?? 3) - 1).length) add('warn', ref, 'on', 'Bày trận: ít chốt hơn vẫn thắng → dễ quá.');
          }
        }
        if (a.do === 'offer' && a.customer != null && (typeof a.customer !== 'string' || !a.customer.trim())) add('error', ref, 'on', 'Mời đơn: tên khách phải là chữ (hoặc bỏ trống).');
        if (a.do === 'offer' && a.kind === 'food') {
          place(ref, 'on', a.place);
          if (a.to) place(ref, 'on', a.to);
          if (a.customer) text(ref, 'on', a.customer, 'tên khách');
          const pl = (places?.places || []).find((p) => p.id === a.place);
          if (pl && (pl.kind !== 'restaurant' || !(pl.menu || []).length)) add('error', ref, 'on', `Mời đơn giao đồ ăn: "${a.place}" không phải quán ăn có thực đơn.`);
        }
        if (a.do === 'openPhone' && a.who && !contacts[a.who]) add('error', ref, 'on', `Mở điện thoại: người nhắn "${a.who}" không có.`);
        if (a.do === 'openPhone' && a.app && !STORY_APPS.includes(a.app)) add('error', ref, 'on', `Mở điện thoại: app lạ "${a.app}".`);
        if (a.do === 'fuel' && a.pct != null && !(num(a.pct) && a.pct >= 0 && a.pct <= 100)) add('error', ref, 'on', 'Đặt xăng / pin: 0–100 %.');
        if (a.do === 'borrow' && !a.off) {
          if (gear && !gear.vehicles?.[a.vehicle]) add('error', ref, 'on', `Mượn xe: xe "${a.vehicle}" không có (thẻ Xe/Túi/Đồ nghề).`);
          else if (gear && !gear.vehicles[a.vehicle].story) add('warn', ref, 'on', `Mượn xe: "${a.vehicle}" chưa đánh dấu "Xe cốt truyện" → bán được / có trong cửa hàng.`);
          if (a.from && !(ch.steps || []).some((x) => (x.on || []).some((b) => b.do === 'prop' && b.id === a.from))) add('error', ref, 'on', `Mượn xe: chương này không có đạo cụ "${a.from}" (xe dựng sẵn).`);
          if (a.fuel != null && !(num(a.fuel) && a.fuel >= 0 && a.fuel <= 100)) add('error', ref, 'on', 'Mượn xe: xăng lúc nhận 0–100 %.');
        }
        if (a.do === 'drop') for (const pid of [].concat(a.id || [])) if (!parcels[pid]) add('error', ref, 'on', `Giao gói hàng: "${pid}" không có.`);
        if (a.do === 'item' && !items[a.id]) add('error', ref, 'on', `Vật phẩm "${a.id}" không có.`);
        if (a.do === 'give' && goods && !goods[a.goods]) add('error', ref, 'on', `Đồ tặng "${a.goods}" không có.`);
      }
    });
  }
  return out;
}

// ======================== SƠ ĐỒ QUAN HỆ (relations.json — công cụ /?relationship) ========================
// Mức: error (phải sửa) · warn (nên xem) · info (gợi ý). ref: 'char:<mã>' · 'link:<mã>' · 'type:<mã>'
const REL_SLOTS = ['shirt', 'pants', 'shoes', 'helmet', 'cap', 'face', 'acc', 'bag', 'hands', 'wrist', 'uniform']; // = LOOK_SLOTS (data/relations.js)
// chữ tự xưng của người lớn hơn / nhỏ hơn người kia (xét ngược tuổi)
const SELF_OLDER = ['ông', 'bà', 'bác', 'cô', 'chú', 'dì', 'mẹ', 'má', 'ba', 'bố', 'cha', 'cậu', 'mợ', 'thím', 'dượng', 'sư', 'thầy', 'anh', 'chị'];
const SELF_YOUNGER = ['em', 'con', 'cháu'];
// chữ gọi người đối diện hay gặp trong thoại (so với sơ đồ)
const ADDRESS = ['em', 'con', 'cháu', 'bạn', 'mày', 'nhóc', 'anh', 'chị', 'cô', 'chú', 'bác', 'cậu', 'ông', 'bà'];
const firstWord = (s) => String(s || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
const ageWord = (s) => (isAnhChi(s) ? 'anh' : firstWord(s)); // "anh/chị" xét tuổi như "anh"

// Thoại cốt truyện theo người nói → [{ key, who (người nói), to (người nghe) }]. Người nói 'player' = câu người chơi chọn.
// who / to là mã người trong story.json hoặc 'place:<mã địa điểm>'
export function storyLines(story) {
  const out = [];
  for (const ch of story?.chapters || []) for (const st of ch.steps || []) {
    for (const a of st.on || []) {
      if (a.do === 'say' && a.text) out.push({ key: a.text, who: a.who, to: 'player' });
      if (a.do === 'msg' && a.text) out.push({ key: a.text, who: a.from, to: 'player' });
      if (a.do === 'replies') for (const k of a.texts || []) out.push({ key: k, who: 'player', to: a.who });
      if (a.do === 'choose') {
        for (const k of a.options || []) out.push({ key: k, who: 'player', to: a.who });
        for (const k of [].concat(a.answers || [], a.answer || [])) out.push({ key: k, who: a.who, to: 'player' });
      }
    }
    if (st.talk?.text) out.push({ key: st.talk.text, who: `place:${st.talk.place}`, to: 'player' });
  }
  return out;
}

export function validateRelations(rel, { story = null, places = null, goods = null, content = null } = {}) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'relations', ref, field, msg });
  if (!rel || typeof rel !== 'object') return [{ level: 'error', tab: 'relations', ref: '', field: '', msg: 'File relations.json hỏng.' }];
  const chars = rel.characters || {}, links = rel.links || [], types = rel.types || {};
  const storyIds = new Set([...Object.keys(story?.contacts || {}), ...Object.keys(story?.people || {})]);
  const placeList = places?.places || [];
  const placeIds = new Set(placeList.filter((p) => isPlaced(p)).map((p) => p.id));
  const nameOf = (id) => chars[id]?.name || id;
  // ---- loại dây ----
  for (const [id, t] of Object.entries(types)) {
    if (!ID_RE.test(id)) add('error', `type:${id}`, 'id', 'Mã loại dây chỉ gồm chữ không dấu, số, gạch dưới.');
    if (!String(t?.name || '').trim()) add('error', `type:${id}`, 'name', 'Loại dây chưa có tên.');
    if (!COLOR_RE.test(t?.color || '')) add('error', `type:${id}`, 'color', 'Màu dây phải dạng #rrggbb.');
  }
  // ---- nhân vật ----
  if (!chars.player) add('error', '', 'characters', 'Thiếu nhân vật "player" (người chơi).');
  const byStory = {}, byPlace = {};
  for (const [id, c] of Object.entries(chars)) {
    const ref = `char:${id}`;
    if (!ID_RE.test(id)) add('error', ref, 'id', 'Mã nhân vật chỉ gồm chữ không dấu, số, gạch dưới (vd coHai).');
    if (!String(c.name || '').trim()) add('error', ref, 'name', 'Nhân vật chưa có tên.');
    if (tooNewEmoji(c.icon)) add('warn', ref, 'icon', NEW_EMOJI_MSG);
    if (c.gender && c.gender !== 'm' && c.gender !== 'f') add('error', ref, 'gender', 'Giới tính: bỏ trống, "m" (nam) hoặc "f" (nữ).');
    if (c.age != null && !(num(c.age) && c.age >= 0 && c.age <= 120)) add('error', ref, 'age', 'Tuổi phải từ 0 đến 120.');
    if (c.from != null && !(Number.isInteger(c.from) && c.from >= 1)) add('error', ref, 'from', 'Xuất hiện từ chương phải là số nguyên ≥ 1.');
    if (c.story) {
      if (story && !storyIds.has(c.story)) add('error', ref, 'story', `Người "${c.story}" không còn trong cốt truyện (story.json) → chọn lại ở "Gắn với game".`);
      if (byStory[c.story]) add('error', ref, 'story', `Trùng: ${nameOf(byStory[c.story])} cũng gắn với người "${c.story}" trong cốt truyện.`);
      byStory[c.story] = id;
    }
    if (c.place) {
      if (places && !placeIds.has(c.place)) add('error', ref, 'place', `Địa điểm "${c.place}" không có (hoặc chưa đặt lên bản đồ) → chọn lại ở "Gắn với game".`);
      else if (places && !placeList.find((p) => p.id === c.place)?.npc) add('error', ref, 'place', `Địa điểm "${c.place}" không có NPC.`);
      if (byPlace[c.place]) add('error', ref, 'place', `Trùng: ${nameOf(byPlace[c.place])} cũng gắn với NPC của địa điểm "${c.place}".`);
      byPlace[c.place] = id;
    }
    if (c.place && c.look) add('warn', ref, 'look', 'Nhân vật là NPC địa điểm → game lấy ngoại hình trong places.json (sửa ở ?editor); ngoại hình riêng ở đây bị bỏ qua.');
    if (c.look) {
      const L = c.look;
      if (L.gender && !GENDERS.includes(L.gender)) add('error', ref, 'look', 'Ngoại hình: giới tính phải là nam / nữ.');
      if (L.hairStyle && !HAIR_STYLES.includes(L.hairStyle)) add('error', ref, 'look', `Kiểu tóc lạ "${L.hairStyle}".`);
      for (const k of ['hair', 'skin']) if (L[k] != null && !COLOR_RE.test(L[k])) add('error', ref, 'look', `Màu ${k === 'hair' ? 'tóc' : 'da'} phải dạng #rrggbb.`);
      if (L.scale != null && !(num(L.scale) && L.scale >= 0.6 && L.scale <= 1.4)) add('error', ref, 'look', 'Vóc người: 0,6 – 1,4.');
      if (L.age != null && !LOOK_AGES[L.age]) add('error', ref, 'look', `Tuổi lạ "${L.age}".`);
      if (L.build != null && !LOOK_BUILDS[L.build]) add('error', ref, 'look', `Vóc dáng lạ "${L.build}".`);
      if (L.faceStyle != null && !FACES[L.faceStyle]) add('error', ref, 'look', `Kiểu mặt lạ "${L.faceStyle}".`);
      else if (L.faceStyle && FACES[L.faceStyle].g && L.gender && FACES[L.faceStyle].g !== L.gender) add('warn', ref, 'look', `Kiểu mặt "${FACES[L.faceStyle].label}" dành cho ${FACES[L.faceStyle].g === 'f' ? 'nữ' : 'nam'}.`);
      if (L.eyeColor != null && !EYE_COLORS[L.eyeColor]) add('error', ref, 'look', `Màu mắt lạ "${L.eyeColor}".`);
      const oids = new Set();
      for (const o of c.outfits || []) {
        if (!o.id || oids.has(o.id)) add('error', ref, 'outfits', `Bộ đồ "${o.name || o.id}": mã trống hoặc trùng.`);
        oids.add(o.id);
        if (!String(o.name || '').trim()) add('error', ref, 'outfits', 'Có bộ đồ chưa đặt tên.');
        if (o.hairStyle != null && !HAIR_STYLES.includes(o.hairStyle)) add('error', ref, 'outfits', `Bộ "${o.name}": kiểu tóc lạ "${o.hairStyle}".`);
        for (const [slot, gid] of Object.entries(o.worn || {})) {
          if (!REL_SLOTS.includes(slot)) { add('error', ref, 'outfits', `Bộ "${o.name}": chỗ mặc lạ "${slot}".`); continue; }
          const g = goods?.[gid];
          if (goods && (!g || g.type !== 'outfit' || g.slot !== slot)) add('error', ref, 'outfits', `Bộ "${o.name}": món "${gid}" không còn (hoặc không phải ${OUTFIT_SLOTS[slot]?.label.toLowerCase() || slot}) → chọn lại.`);
          else if (g?.gender === 'f' && (L.gender || c.gender) === 'm') add('warn', ref, 'outfits', `Bộ "${o.name}": "${g.name}" là đồ nữ mà nhân vật là nam.`);
        }
      }
    }
    if (id !== 'player' && c.story && !String(c.personality || '').trim()) add('info', ref, 'personality', 'Chưa ghi tính cách — Claude cần để viết thoại đúng giọng.');
  }
  // ---- dây ----
  const lids = new Set(), pairs = {};
  for (const l of links) {
    const ref = `link:${l.id}`;
    if (!l.id || lids.has(l.id)) add('error', ref, 'id', 'Dây có mã trống hoặc trùng.');
    lids.add(l.id);
    const A = chars[l.a], B = chars[l.b];
    if (!A || !B) { add('error', ref, 'a', `Dây nối tới nhân vật không còn (${!A ? l.a : l.b}) → xóa dây hoặc nối lại.`); continue; }
    const title = `${nameOf(l.a)} ↔ ${nameOf(l.b)}`;
    if (l.a === l.b) add('error', ref, 'b', `${title}: dây nối nhân vật với chính mình.`);
    if (!types[l.type]) add('error', ref, 'type', `${title}: loại dây lạ "${l.type}".`);
    const pk = [l.a, l.b].sort().join('|') + '|' + l.type;
    if (pairs[pk]) add('error', ref, 'type', `${title}: trùng dây cùng loại "${types[l.type]?.name || l.type}" giữa 2 người.`);
    pairs[pk] = true;
    const from = l.from ?? 1;
    if (!(Number.isInteger(from) && from >= 1)) add('error', ref, 'from', `${title}: "Từ chương" phải là số nguyên ≥ 1.`);
    if (l.to != null && !(Number.isInteger(l.to) && l.to >= from)) add('error', ref, 'to', `${title}: "Tới chương" phải ≥ "Từ chương".`);
    for (const [cid, c] of [[l.a, A], [l.b, B]]) if ((c.from ?? 1) > from) add('error', ref, 'from', `${title}: dây có từ chương ${from} nhưng ${c.name} chỉ xuất hiện từ chương ${c.from}.`);
    const sides = [[l.a, l.b, l.ab || {}], [l.b, l.a, l.ba || {}]];
    const withPlayer = l.a === 'player' || l.b === 'player';
    const missing = sides.filter(([, , s]) => !String(s.self || '').trim() || !String(s.call || '').trim());
    for (const [x, y] of missing) add(withPlayer ? 'error' : 'warn', ref, x === l.a ? 'ab' : 'ba', `${title}: thiếu xưng hô chiều ${nameOf(x)} → ${nameOf(y)} (tự xưng / gọi là).`);
    for (const [x, y, s] of sides) {
      const dirKey = x === l.a ? 'ab' : 'ba';
      for (const [k, what] of [['self', 'Tự xưng'], ['call', 'Gọi là']]) {
        const v = String(s[k] || '');
        if (/[{}]/.test(v)) add('error', ref, dirKey, `${title}: ô "${what}" chiều ${nameOf(x)} → ${nameOf(y)} đang là "${v}" — chỉ điền chữ thật (em, anh, chị…), không điền {…}. Muốn đổi theo giới tính người chơi thì gõ anh/chị.`);
        else if (isAnhChi(v) && !withPlayer) add('warn', ref, dirKey, `${title}: "anh/chị" chỉ có tác dụng trên dây với người chơi (đổi theo giới tính người chơi) — dây này giữa 2 NPC nên ghi rõ anh hoặc chị.`);
        else if (isAnhChi(v) && (x === 'player') !== (k === 'self')) add('warn', ref, dirKey, `${title}: ô "${what}" chiều ${nameOf(x)} → ${nameOf(y)} là "anh/chị" nhưng ô này nói về ${x === 'player' ? nameOf(y) : nameOf(x)}, không phải người chơi → vẫn đổi theo giới tính NGƯỜI CHƠI. Có cố ý không?`);
      }
      if (s.feel != null && !(Number.isInteger(s.feel) && s.feel >= -3 && s.feel <= 3)) add('error', ref, x === l.a ? 'ab' : 'ba', `${title}: tình cảm phải từ −3 tới +3.`);
      const X = chars[x], Y = chars[y], self = ageWord(s.self);
      if (num(X.age) && num(Y.age) && self) {
        if (SELF_OLDER.includes(self) && X.age + 1 < Y.age) add('warn', ref, x === l.a ? 'ab' : 'ba', `${title}: ${X.name} (${X.age} tuổi) tự xưng "${s.self}" với ${Y.name} (${Y.age} tuổi) — xưng ngược tuổi, có cố ý không?`);
        if (SELF_YOUNGER.includes(self) && X.age > Y.age + 1) add('warn', ref, x === l.a ? 'ab' : 'ba', `${title}: ${X.name} (${X.age} tuổi) tự xưng "${s.self}" với ${Y.name} (${Y.age} tuổi) — xưng ngược tuổi, có cố ý không?`);
      }
    }
    // A gọi B là "c" thì B nên tự xưng "c" với A
    const [s1, s2] = [l.ab || {}, l.ba || {}];
    for (const [x, y, call, self] of [[l.a, l.b, s1.call, s2.self], [l.b, l.a, s2.call, s1.self]]) {
      if (firstWord(call) && firstWord(self) && firstWord(call) !== firstWord(self)) add('warn', ref, 'ab', `${title}: ${nameOf(x)} gọi ${nameOf(y)} là "${call}" nhưng ${nameOf(y)} tự xưng "${self}" — hai chiều chưa khớp.`);
    }
  }
  // ---- nhân vật: dây ----
  for (const [id, c] of Object.entries(chars)) {
    if (id === 'player') continue;
    const mine = links.filter((l) => l.a === id || l.b === id);
    if (!mine.length) add('info', `char:${id}`, 'links', `${c.name} chưa có dây quan hệ nào.`);
    else if (mine.every((l) => l.secret)) add('warn', `char:${id}`, 'links', `Mọi dây của ${c.name} đều bí mật → người chơi chưa biết gì về người này.`);
  }
  // ---- tên cũ còn sót (nhân vật đã đổi tên) ----
  if (content) out.push(...staleNames(rel, { story, content, places }));
  // ---- thoại cốt truyện lệch sơ đồ (chữ gọi người đối diện viết cứng trong câu) ----
  if (story && content) {
    const charOf = (who) => {
      if (who === 'player') return 'player';
      const s = String(who || '');
      const e = Object.entries(chars).find(([, c]) => (s.startsWith('place:') ? c.place === s.slice(6) : c.story === s));
      return e ? e[0] : null;
    };
    const seen = new Set();
    for (const ln of storyLines(story)) {
      const x = charOf(ln.who), y = charOf(ln.to);
      if (!x || !y || seen.has(ln.key)) continue;
      const l = links.find((k) => (k.a === x && k.b === y) || (k.a === y && k.b === x));
      const side = l && (l.a === x ? l.ab : l.ba);
      const call = firstWord(side?.call), self = firstWord(side?.self);
      if (!call) continue;
      let text = String(content[ln.key] ?? '').replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\[tiếp\]/g, ' ');
      if (` ${text.toLowerCase()} `.includes(` ${String(side.call).trim().toLowerCase()}`)) continue; // câu có gọi đúng như sơ đồ
      // bỏ cụm xưng hô nhiều chữ đúng sơ đồ (vd "sư cô", "chú Hai") để không bắt nhầm chữ bên trong cụm
      const other = l.a === x ? l.ba : l.ab;
      for (const ph of [side.self, side.call, other?.self, other?.call].map((v) => String(v || '').trim()).filter((v) => v.includes(' '))) text = text.split(new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).join(' ');
      const words = text.split(/[^\p{L}]+/u).filter(Boolean);
      const lower = words.map((w) => w.toLowerCase());
      if (lower.includes(call)) continue;
      // chữ gọi người khác (không phải cách sơ đồ ghi), bỏ qua khi theo sau là tên riêng (vd "chú Hai", "chị Linh")
      const bad = words.find((w, i) => ADDRESS.includes(w.toLowerCase()) && w.toLowerCase() !== self && !/^\p{Lu}/u.test(words[i + 1] || ''));
      if (!bad) continue;
      seen.add(ln.key);
      add('warn', `link:${l.id}`, 'dialog', `Thoại lệch sơ đồ — ${ln.key}: ${nameOf(x)} nói với ${nameOf(y)} có chữ "${bad}" nhưng sơ đồ ghi ${nameOf(x)} gọi ${nameOf(y)} là "${side.call}". Sửa câu (hoặc dùng {ban} / {khach}) hay sửa dây.`);
    }
  }
  return out;
}

// ======================== ĐỔI TÊN KHẮP NƠI (công cụ /?relationship) ========================
// Chữ của địa điểm có thể chứa tên người: tên, tên ngắn, biển hiệu, biển dọc
export const PLACE_TEXT = ['name', 'short', 'sign', 'signVText'];
// Biến thể hoa / thường chữ đầu: "Cô Hai" → ["Cô Hai", "cô Hai"]
const caseForms = (s) => [...new Set([s, s[0].toUpperCase() + s.slice(1), s[0].toLowerCase() + s.slice(1), s.toUpperCase()])]; // + VIẾT HOA (biển hiệu)
const wordRe = (s) => new RegExp(`(?<![\\p{L}\\p{N}])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
// Thay oldName → newName (giữ hoa / thường chữ đầu) trong chuỗi s. wrap(cũ, mới): chữ thay vào (vd đánh dấu để xem trước)
export function swapName(s, oldName, newName, wrap = null) {
  let out = String(s);
  for (const o of caseForms(oldName)) {
    const n = o === o.toUpperCase() && o !== o.toLowerCase() && o.length > 1 && o !== oldName ? newName.toUpperCase() : o[0] === o[0].toUpperCase() ? newName[0].toUpperCase() + newName.slice(1) : newName[0].toLowerCase() + newName.slice(1);
    out = out.replace(wordRe(o), wrap ? wrap(o, n) : n);
  }
  return out;
}
// Mọi chỗ còn tên cũ của nhân vật charId: [{ id, kind: 'text' | 'place', key | placeId, field, idx, before, after, keep: lý do giữ (người nói gọi đúng như vậy) }]
// opts.places: cả tên địa điểm · opts.selfOld / selfNew: thay cả chữ tự xưng trong lời của chính nhân vật này
export function findOldName(oldName, newName, { rel, story = null, content = {}, places = null, charId = null, inclPlaces = true, selfOld = '', selfNew = '' } = {}) {
  const out = [];
  oldName = String(oldName || '').trim();
  newName = String(newName || '').trim();
  if (!oldName || !newName || oldName === newName) return out;
  const chars = rel?.characters || {}, links = rel?.links || [];
  const who = {}; // khóa chữ → mã nhân vật nói câu đó
  const charOf = (w) => {
    const s = String(w || '');
    return s === 'player' ? 'player' : Object.keys(chars).find((k) => (s.startsWith('place:') ? chars[k].place === s.slice(6) : chars[k].story === s)) || null;
  };
  for (const ln of storyLines(story)) who[ln.key] = charOf(ln.who);
  // bong bóng thoại (người lạ nói với nhau / với người chơi): biết người nói
  for (const ch of story?.chapters || []) for (const st of ch.steps || []) for (const a of st.on || []) if (a.do === 'bubble' && a.text) who[a.text] = charOf(a.who);
  const me = charId && chars[charId];
  if (me?.place) for (const k of Object.keys(content)) if (k.startsWith(`npc.${me.place}.`)) who[k] = charId;
  const keepWhy = (speaker) => {
    if (!speaker || !charId || speaker === charId) return '';
    const l = links.find((x) => (x.a === speaker && x.b === charId) || (x.b === speaker && x.a === charId));
    const call = String((l && (l.a === speaker ? l.ab : l.ba))?.call || '').trim();
    return call && call.toLowerCase() === oldName.toLowerCase() ? `${chars[speaker]?.name || speaker} gọi ${me?.name || ''} là "${call}"` : '';
  };
  // tên mới chứa tên cũ (vd "Người đàn ông" → "Người đàn ông chạy xe moto"): chỗ đã là tên mới thì không tính
  const mask = (s) => (newName.toLowerCase().includes(oldName.toLowerCase()) ? caseForms(newName).reduce((t, n) => t.replace(wordRe(n), '\u0000'), String(s)) : String(s));
  const test = (s) => caseForms(oldName).some((o) => wordRe(o).test(mask(s)));
  // thay tên cũ nhưng giữ nguyên chỗ đã là tên mới (không thành "… chạy xe moto chạy xe moto")
  const swapKeepNew = (s) => {
    if (!newName.toLowerCase().includes(oldName.toLowerCase())) return swapName(s, oldName, newName);
    const kept = [];
    const masked = caseForms(newName).reduce((t, n) => t.replace(wordRe(n), (m) => `\u0001${kept.push(m) - 1}\u0002`), String(s));
    return swapName(masked, oldName, newName).replace(/\u0001(\d+)\u0002/g, (_, i) => kept[+i]);
  };
  for (const [key, v] of Object.entries(content || {})) {
    const list = Array.isArray(v) ? v : [v];
    list.forEach((s, idx) => {
      if (typeof s !== 'string') return;
      const own = selfOld && who[key] === charId;
      let after = test(s) ? swapKeepNew(s) : s;
      if (own && selfNew) after = swapName(after, selfOld, selfNew);
      if (after === s) return;
      out.push({ id: `t:${key}:${Array.isArray(v) ? idx : -1}`, kind: 'text', key, idx: Array.isArray(v) ? idx : -1, before: s, after, speaker: who[key] || null, keep: keepWhy(who[key]) });
    });
  }
  if (inclPlaces) for (const p of places?.places || []) for (const f of PLACE_TEXT) {
    if (typeof p[f] !== 'string' || !test(p[f])) continue;
    out.push({ id: `p:${p.id}:${f}`, kind: 'place', placeId: p.id, field: f, label: { name: 'tên địa điểm', short: 'tên ngắn', sign: 'biển hiệu', signVText: 'biển dọc' }[f], before: p[f], after: swapName(p[f], oldName, newName), keep: '' });
  }
  return out;
}
// Luật kiểm tra: nhân vật đã đổi tên (oldNames) mà tên cũ còn sót trong câu chữ / tên địa điểm (trừ câu người nói cố ý gọi như vậy)
export function staleNames(rel, { story = null, content = {}, places = null } = {}) {
  const out = [];
  for (const [id, c] of Object.entries(rel?.characters || {})) {
    for (const old of c.oldNames || []) {
      const left = findOldName(old, c.name, { rel, story, content, places, charId: id }).filter((x) => !x.keep);
      if (left.length) out.push({ level: 'warn', tab: 'relations', ref: `char:${id}`, field: 'rename', old, msg: `Tên cũ "${old}" của ${c.name} còn ở ${left.length} chỗ (vd ${left.slice(0, 3).map((x) => x.key || x.placeId).join(', ')}) → ✏️ Đổi tên khắp nơi.` });
    }
  }
  return out;
}
