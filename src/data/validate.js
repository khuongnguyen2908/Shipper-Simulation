// =============================================================
// KIỂM TRA DỮ LIỆU — dùng chung cho công cụ ?editor và bộ thử (npm test).
// Trả về danh sách vấn đề: { level: 'error' | 'warn', tab, ref, field, msg }
//  - error: game sẽ chạy sai → công cụ không cho lưu
//  - warn : chạy được nhưng nên xem lại
// =============================================================
import { CITY, LOT_IDS, MULTI_LOTS, lotParts, lotFaces, blockPlan, blockLotIds, roadGraph, neighbors } from '../sim/cityLayout.js';
import { ALLEY_TEMPLATES } from '../sim/blockPlan.js';
import { EFFECTS, CONSUMABLE_FIELDS, OUTFIT_SLOTS } from './goods.js';
import { ORDER_KINDS } from './apps.js';
import { GENDERS, HAIR_STYLES } from '../sim/people.js';
import { openDayOf } from '../sim/placeRules.js';
import { LOOKS, lookOf } from './looks.js';
import { hoursProblem, totalHours } from '../sim/hours.js';
import { BALANCE_GROUPS, KNOWN_PATHS, getPath } from './balanceSpec.js';
import { ITEM_GROUP_IDS } from './itemGroups.js';

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
  vehicles: ['cub'],
  bags: ['nylon'],
  places: ['home', 'gas', 'gear', 'garage', 'cafe', 'taphoa', 'gate', 'apartment', 'market'],
};
export const LOTS = [...LOT_IDS, ...Object.keys(MULTI_LOTS), 'C'];
// Kiểu dáng xe (khớp BIKE_MODELS trong src/world/models.js — có bộ thử kiểm tra)
export const VEHICLE_MODELS = { cub: 'Xe số cổ (Cub)', underbone: 'Xe số (Wave)', scooter: 'Tay ga (Vision, SH)', sport: 'Tay côn / mô tô' };
export const PLACE_KINDS =['home', 'restaurant', 'gas', 'shop', 'garage', 'cafe', 'taphoa', 'gate', 'apartment', 'market', 'service'];
export const ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Cảnh báo số trừ thể lực/tinh thần quá lớn (thanh 0–100, về 0 là thua)
function drainWarn(add, ref, field, phys, mental, who) {
  for (const [v, name] of [[phys, 'thể lực'], [mental, 'tinh thần']]) {
    if (!num(v)) continue;
    if (v <= -100) add('warn', ref, field, `${who}trừ ${-v} ${name} → người chơi THUA ngay (thanh tối đa 100).`);
    else if (v <= -30) add('warn', ref, field, `${who}trừ ${-v} ${name} một lần — người chơi đang yếu có thể thua ngay. Thường chỉ −5 đến −20.`);
  }
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);

// Các ô lô mà một địa điểm chiếm (tòa nhà lớn chiếm nhiều lô — xem MULTI_LOTS)
export function lotCells(p) {
  const [bx, bz] = p.block;
  return lotParts(p.lot).map((id) => `${bx},${bz},${id}`);
}

export function validateItems(items, placesData, appsData = null) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'items', ref, field, msg });
  const menus = (placesData?.places || []).filter((p) => p.kind === 'restaurant').flatMap((p) => p.menu || []);
  const parcelUse = new Set(Object.values(appsData?.orderTypes || {}).filter((t) => t.kind === 'parcel').flatMap((t) => t.items || []));
  for (const id of PROTECTED.items) if (!items[id]) add('error', id, 'id', `Thiếu món bắt buộc "${id}" (code dùng trực tiếp).`);
  for (const [key, it] of Object.entries(items)) {
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
    for (const f of ['vagueChance', 'vomitChance', 'noPayChance', 'bigTipChance']) inRange(add, key, f, r[f], 0, 1, 'Tỉ lệ', { optional: true });
    for (const f of ['bigTip', 'earlyTip', 'vomitCost']) inRange(add, key, f, r[f], 0, 500, 'Số tiền (k)', { optional: true });
    inRange(add, key, 'vomitMental', r.vomitMental, 0, 100, 'Trừ tinh thần', { optional: true });
    if (hoursProblem(r.hours, presets)) add('error', key, 'hours', `Khung giờ: ${hoursProblem(r.hours, presets)}`);
    if (r.viaApp != null && typeof r.viaApp !== 'boolean') add('error', key, 'viaApp', 'Qua app phải là có/không.');
    for (const id of r.from || []) if (placesData && !placeIds.has(id)) add('error', key, 'from', `Địa điểm "${id}" không tồn tại.`);
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

export function validateGear(gear) {
  const out = [];
  for (const cat of ['vehicles', 'bags']) {
    const table = gear[cat] || {};
    const add = (level, ref, field, msg) => out.push({ level, tab: 'gear', cat, ref, field, msg });
    for (const id of PROTECTED[cat]) if (!table[id]) add('error', id, 'id', `Thiếu "${id}" (code dùng trực tiếp).`);
    for (const [key, s] of Object.entries(table)) {
      if (!ID_RE.test(key)) add('error', key, 'id', 'Mã chỉ gồm chữ không dấu, số, gạch dưới.');
      if (s.id !== key) add('error', key, 'id', `Mã bên trong (${s.id}) khác khóa (${key}).`);
      if (!s.name || !String(s.name).trim()) add('error', key, 'name', 'Chưa có tên.');
      for (const [f, [a, b]] of Object.entries(RANGES[cat])) {
        if (!num(s[f])) add('error', key, f, 'Phải là số.');
        else if (s[f] < a || s[f] > b) add('error', key, f, `Phải trong khoảng ${a}–${b}.`);
      }
      if (cat === 'bags' && (!Number.isInteger(s.cols) || !Number.isInteger(s.rows))) add('error', key, 'cols', 'Số ô phải là số nguyên.');
      if (cat === 'bags' && s.cols * s.rows < 2) add('warn', key, 'cols', 'Túi chỉ có 1 ô → không chở được đơn 2 món.');
      if (!COLOR_RE.test(s.color || '')) add('error', key, 'color', 'Màu phải dạng #rrggbb.');
      if (cat === 'vehicles') {
        if (s.model == null) add('warn', key, 'model', 'Chưa chọn kiểu dáng → hiện như xe số.');
        else if (!(s.model in VEHICLE_MODELS)) add('error', key, 'model', `Kiểu dáng phải là: ${Object.keys(VEHICLE_MODELS).join(', ')}.`);
      }
      if (s.price === 0 && !PROTECTED[cat].includes(key)) add('warn', key, 'price', 'Giá 0 → người chơi lấy miễn phí ngay từ đầu.');
    }
    if (cat === 'bags' && table.nylon && table.nylon.price !== 0) add('warn', 'nylon', 'price', 'Túi nylon là túi khởi đầu, nên để giá 0.');
    if (cat === 'vehicles' && table.cub && table.cub.price !== 0) add('warn', 'cub', 'price', 'Xe Cub là xe khởi đầu, nên để giá 0.');
  }
  if (!Object.values(gear.bags || {}).some((b) => b.insulation >= 0.5)) out.push({ level: 'warn', tab: 'gear', cat: 'bags', ref: '', field: 'insulation', msg: 'Không túi nào giữ nhiệt ≥ 50% → đơn trà sữa, kem không bao giờ mở khóa.' });
  return out;
}

export function validatePlaces(pd, items, goodsTable = null, gearTable = null, mapData = undefined) {
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
    if (!ID_RE.test(p.id)) add('error', p.id, 'id', 'Mã chỉ gồm chữ không dấu, số, gạch dưới.');
    if (ids.has(p.id)) add('error', p.id, 'id', 'Trùng mã với địa điểm khác.');
    ids.add(p.id);
    if (!p.name || !String(p.name).trim()) add('error', p.id, 'name', 'Chưa có tên.');
    if (!p.short) add('warn', p.id, 'short', 'Chưa có tên ngắn (hiện trên bản đồ).');
    const [bx, bz] = p.block || [];
    if (!Number.isInteger(bx) || !Number.isInteger(bz) || bx < 0 || bz < 0 || bx >= CITY.N || bz >= CITY.N) add('error', p.id, 'block', `Khối phải từ 0 đến ${CITY.N - 1}.`);
    const plan = Number.isInteger(bx) && Number.isInteger(bz) ? blockPlan(bx, bz, mapData) : null;
    if (plan) {
      // khối có hẻm: chỉ đặt được vào lô có cửa của mặt bằng hẻm (1 lô, mặt tiền theo lô)
      const l = plan.lots.find((x) => x.id === p.lot);
      if (p.kind === 'gate') add('error', p.id, 'lot', 'Nhà cổng xanh phải ở khối không hẻm (lô C của hẻm 42).');
      else if (!l) add('error', p.id, 'lot', `Khối ${bx},${bz} có hẻm — chọn một lô của hẻm (bấm vào nhà trên bản đồ). Lô "${p.lot}" không có trong khối này.`);
      else if (p.face != null && p.face !== l.face) add('error', p.id, 'face', 'Lô trong khối có hẻm có mặt tiền cố định — bỏ chọn hướng mặt tiền.');
      // đổ xăng / sửa xe cần dắt xe tới cửa — hẻm đi bộ có cột chắn, xe không vào được
      if (l && !l.front && plan.walk && (p.kind === 'gas' || p.kind === 'garage')) add('warn', p.id, 'lot', `${p.kind === 'gas' ? 'Cây xăng' : 'Tiệm xe'} nằm trong hẻm đi bộ — xe máy không vào được nên không ${p.kind === 'gas' ? 'đổ xăng' : 'sửa xe'} được. Chọn nhà mặt phố hoặc khối hẻm xe máy.`);
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
    if (p.kind !== 'gas' && p.kind !== 'gate' && p.kind !== 'market' && p.sign == null) add('warn', p.id, 'sign', 'Chưa có biển hiệu.');
    if (p.signBg && !COLOR_RE.test(p.signBg)) add('error', p.id, 'signBg', 'Màu biển phải dạng #rrggbb.');
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
    // điểm đến của đơn
    if (p.orders) {
      for (const k of ['rideWeight', 'foodWeight', 'parcelWeight']) if (p.orders[k] != null && (!num(p.orders[k]) || p.orders[k] < 0 || p.orders[k] > 10)) add('error', p.id, `orders.${k}`, 'Mức độ thường xuyên từ 0 đến 10.');
      const bad = hoursProblem(p.orders.hours, presets);
      if (bad) add('error', p.id, 'orders.hours', `Khung giờ có đơn: ${bad}`);
    }
  }
  for (const [k, arr] of [['streetsX', pd.streetsX], ['streetsZ', pd.streetsZ]]) {
    if (!Array.isArray(arr) || arr.length !== CITY.N + 1) add('error', '', k, `Cần đúng ${CITY.N + 1} tên đường.`);
    else arr.forEach((s, i) => !String(s).trim() && add('error', '', k, `Tên đường số ${i + 1} đang trống.`));
  }
  if (!pd.customerNames || !pd.customerNames.filter((s) => String(s).trim()).length) add('error', '', 'customerNames', 'Cần ít nhất 1 tên khách.');
  // mở theo ngày
  for (const p of places) {
    openDayErr(add, p.id, p.openDay, PROTECTED.places.includes(p.id));
    if (p.nap != null && typeof p.nap !== 'boolean') add('error', p.id, 'nap', 'Ô "Cho chợp mắt" phải là true/false.');
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
export function validateGoods(goods, placesData) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'gear', cat: 'goods', ref, field, msg });
  const sold = new Set((placesData?.places || []).flatMap((p) => p.sells?.goods || []));
  for (const [key, s] of Object.entries(goods)) {
    if (!ID_RE.test(key)) add('error', key, 'id', 'Mã chỉ gồm chữ không dấu, số, gạch dưới.');
    if (s.id !== key) add('error', key, 'id', `Mã bên trong (${s.id}) khác khóa (${key}).`);
    if (!s.name || !String(s.name).trim()) add('error', key, 'name', 'Chưa có tên.');
    if (!num(s.price) || s.price < 0 || s.price > 100000) add('error', key, 'price', 'Giá phải từ 0 đến 100000.');
    if (s.type === 'consumable') {
      const u = s.use || {};
      for (const [k, r] of Object.entries(CONSUMABLE_FIELDS)) if (u[k] != null && (!num(u[k]) || u[k] < r.min || u[k] > r.max)) add('error', key, `use.${k}`, `Phải từ ${r.min} đến ${r.max}.`);
      if (!u.phys && !u.mental && !u.fuel && !u.bikeHp) add('warn', key, 'use', 'Dùng xong không có tác dụng gì.');
      drainWarn(add, key, u.phys <= -30 ? 'use.phys' : 'use.mental', u.phys, u.mental, '');
      const gain = Math.max(0, u.phys || 0) + Math.max(0, u.mental || 0);
      if (num(s.price) && gain > 0) {
        if (s.price === 0) add('warn', key, 'price', 'Miễn phí mà có tác dụng → người chơi mua bao nhiêu cũng được.');
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
      }
    } else if (s.type === 'carry') {
      // dùng tại địa điểm: phải có hoạt động nào đó cần món này
      if (placesData && !(placesData.places || []).some((p) => (p.activities || []).some((a) => a.needs?.id === key))) add('warn', key, 'type', 'Chưa địa điểm nào có hoạt động cần món này → mua về không dùng được. Thêm ô "Cần đồ" ở hoạt động (thẻ Địa điểm).');
    } else add('error', key, 'type', 'Loại phải là "đồ dùng 1 lần", "trang bị", "dùng tại địa điểm" hoặc "trang phục".');
    // trang phục giá 0 là đồ có sẵn, không cần nơi bán
    if (placesData && !sold.has(key) && !(s.type === 'outfit' && s.price === 0)) add('warn', key, 'sells', 'Chưa địa điểm nào bán món này.');
  }
  for (const [slot, def] of Object.entries(OUTFIT_SLOTS)) {
    if (!Object.values(goods).some((g) => g.type === 'outfit' && g.slot === slot && g.price === 0)) out.push({ level: 'warn', tab: 'gear', cat: 'goods', ref: '', field: 'slot', msg: `Chưa có ${def.label.toLowerCase()} giá 0 (có sẵn) → shipper mặc ${def.label.toLowerCase()} mặc định cho tới khi mua.` });
  }
  const has = (eff) => Object.values(goods).some((g) => g.type === 'equipment' && g.effects?.[eff] && sold.has(g.id));
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
  // sông
  const size = Number.isInteger(map.size) ? map.size : CITY.N;
  (map.rivers || []).forEach((r, i) => {
    const ref = `river${i}`;
    const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    if (!['x', 'z'].includes(r.axis)) add('error', ref, 'axis', 'Hướng sông: chạy dọc đường dọc (x) hoặc đường ngang (z).');
    if (!int(r.line, 0, size)) add('error', ref, 'line', `Đường số 0–${size}.`);
    if (!int(r.from, 0, size) || !int(r.to, 0, size) || r.from >= r.to) add('error', ref, 'from', `Đoạn sông: từ ngã tư a tới b, 0 ≤ a < b ≤ ${size}.`);
    if (!Array.isArray(r.bridges) || r.bridges.some((b) => !int(b, r.from, r.to))) add('error', ref, 'bridges', 'Cầu phải ở các ngã tư nằm trên đoạn sông.');
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

export function validateAll({ items, gear, goods, places, content, baseContent, apps = null, map = undefined, balance = null }) {
  return [
    ...(balance ? validateBalance(balance) : []),
    ...validateItems(items, places, apps),
    ...(apps ? validateApps(apps, items, places) : []),
    ...(map ? validateMap(map, places) : []),
    ...validateGear(gear),
    ...(goods ? validateGoods(goods, places) : []),
    ...validatePlaces(places, items, goods, gear, map),
    ...validateContent(content, baseContent || content),
  ];
}
