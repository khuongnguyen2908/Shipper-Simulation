// =============================================================
// KIỂM TRA DỮ LIỆU — dùng chung cho công cụ ?editor và bộ thử (npm test).
// Trả về danh sách vấn đề: { level: 'error' | 'warn', tab, ref, field, msg }
//  - error: game sẽ chạy sai → công cụ không cho lưu
//  - warn : chạy được nhưng nên xem lại
// =============================================================
import { CITY } from '../sim/cityLayout.js';

export const TRAIT_IDS = ['hot', 'cold', 'liquid', 'fragile', 'paper', 'passenger'];
export const PROTECTED = {
  items: ['passenger'],
  vehicles: ['cub'],
  bags: ['nylon'],
  gear: ['raincoat', 'jacket', 'spareHelmet'],
  places: ['home', 'gas', 'gear', 'garage', 'cafe', 'taphoa', 'gate', 'apartment', 'market'],
};
export const LOTS = ['N0', 'N1', 'N2', 'S0', 'S1', 'S2', 'E1', 'W1', 'N', 'S', 'C'];
export const ID_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const num = (v) => typeof v === 'number' && Number.isFinite(v);

// Các ô lô mà một địa điểm chiếm (lô 'N'/'S' = cả dãy 3 ô)
export function lotCells(p) {
  const [bx, bz] = p.block;
  if (p.lot === 'N' || p.lot === 'S') return [0, 1, 2].map((k) => `${bx},${bz},${p.lot}${k}`);
  return [`${bx},${bz},${p.lot}`];
}

export function validateItems(items, placesData) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'items', ref, field, msg });
  const menus = (placesData?.places || []).filter((p) => p.kind === 'restaurant').flatMap((p) => p.menu || []);
  for (const id of PROTECTED.items) if (!items[id]) add('error', id, 'id', `Thiếu món bắt buộc "${id}" (code dùng trực tiếp).`);
  for (const [key, it] of Object.entries(items)) {
    if (!ID_RE.test(key)) add('error', key, 'id', 'Mã chỉ gồm chữ không dấu, số, gạch dưới; bắt đầu bằng chữ.');
    if (it.id !== key) add('error', key, 'id', `Mã bên trong (${it.id}) khác khóa (${key}).`);
    if (!it.name || !String(it.name).trim()) add('error', key, 'name', 'Chưa có tên.');
    if (!it.icon) add('warn', key, 'icon', 'Chưa có biểu tượng.');
    const tr = it.traits || [];
    for (const t of tr) if (!TRAIT_IDS.includes(t)) add('error', key, 'traits', `Đặc tính lạ: ${t}.`);
    if (!tr.length) add('warn', key, 'traits', 'Không có đặc tính nào → món không bao giờ hư.');
    if (tr.includes('hot') && tr.includes('cold')) add('error', key, 'traits', 'Không thể vừa Nóng vừa Lạnh.');
    if (tr.includes('passenger') && tr.length > 1) add('error', key, 'traits', 'Khách xe ôm không đi kèm đặc tính khác.');
    if (!num(it.base) || it.base <= 0) add('error', key, 'base', 'Giá cước phải là số > 0.');
    else if (it.base > 200) add('warn', key, 'base', 'Giá cước rất cao (> 200k) – kiểm tra cân bằng.');
    if (tr.includes('hot') && (!num(it.startTemp) || it.startTemp < 40 || it.startTemp > 100)) add('error', key, 'startTemp', 'Món nóng cần nhiệt độ ban đầu 40–100°C.');
    if (tr.includes('cold')) {
      if (!num(it.startTemp) || it.startTemp < -30 || it.startTemp > 15) add('error', key, 'startTemp', 'Món lạnh cần nhiệt độ ban đầu −30–15°C.');
      if (!num(it.meltAt)) add('error', key, 'meltAt', 'Món lạnh cần ngưỡng tan (°C).');
      else if (num(it.startTemp) && it.meltAt <= it.startTemp) add('warn', key, 'meltAt', 'Ngưỡng tan ≤ nhiệt độ ban đầu → món tan ngay khi nhận.');
      if (!num(it.meltRate) || it.meltRate <= 0 || it.meltRate > 2) add('error', key, 'meltRate', 'Tốc độ tan phải trong khoảng 0–2.');
    }
    if (!tr.includes('passenger') && placesData && !menus.includes(key)) add('warn', key, 'menu', 'Chưa quán nào bán món này → không bao giờ có đơn.');
  }
  return out;
}

const RANGES = {
  vehicles: { maxSpeed: [5, 40], accel: [1, 15], brake: [3, 20], steer: [1, 4], suspension: [0, 1], fuelPer100km: [0.5, 10], tank: [0.5, 20], price: [0, 100000] },
  bags: { insulation: [0, 1], waterproof: [0, 1], padding: [0, 1], cols: [1, 5], rows: [1, 4], price: [0, 100000] },
  gear: { price: [0, 100000] },
};

export function validateGear(gear) {
  const out = [];
  for (const cat of ['vehicles', 'bags', 'gear']) {
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
      if (cat !== 'gear' && !COLOR_RE.test(s.color || '')) add('error', key, 'color', 'Màu phải dạng #rrggbb.');
    }
    if (cat === 'bags' && table.nylon && table.nylon.price !== 0) add('warn', 'nylon', 'price', 'Túi nylon là túi khởi đầu, nên để giá 0.');
    if (cat === 'vehicles' && table.cub && table.cub.price !== 0) add('warn', 'cub', 'price', 'Xe Cub là xe khởi đầu, nên để giá 0.');
  }
  if (!Object.values(gear.bags || {}).some((b) => b.insulation >= 0.5)) out.push({ level: 'warn', tab: 'gear', cat: 'bags', ref: '', field: 'insulation', msg: 'Không túi nào giữ nhiệt ≥ 50% → đơn trà sữa, kem không bao giờ mở khóa.' });
  return out;
}

export function validatePlaces(pd, items) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'places', ref, field, msg });
  const places = pd.places || [];
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
    if (!LOTS.includes(p.lot)) add('error', p.id, 'lot', 'Lô không hợp lệ.');
    else {
      if (p.lot === 'C' && p.kind !== 'gate') add('error', p.id, 'lot', 'Lô C (sân trong hẻm) chỉ dành cho nhà cổng xanh.');
      if (p.kind === 'gate' && (p.lot !== 'C' || bx !== pd.alley.block[0] || bz !== pd.alley.block[1])) add('error', p.id, 'lot', 'Nhà cổng xanh phải ở lô C của khối có hẻm 42.');
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
    if (p.npc) {
      if (!p.npc.name) add('error', p.id, 'npc.name', 'NPC chưa có tên.');
      for (const f of ['shirt', 'pants']) if (p.npc[f] && !COLOR_RE.test(p.npc[f])) add('error', p.id, `npc.${f}`, 'Màu phải dạng #rrggbb.');
    }
    if (p.kind === 'restaurant') {
      if (!p.menu || !p.menu.length) add('error', p.id, 'menu', 'Quán chưa bán món nào.');
      for (const m of p.menu || []) {
        if (!items[m]) add('error', p.id, 'menu', `Món "${m}" không tồn tại.`);
        else if (items[m].traits.includes('passenger')) add('error', p.id, 'menu', 'Quán không bán "khách xe ôm".');
      }
    }
    if (p.serves && !['meal', 'drink'].includes(p.serves)) add('error', p.id, 'serves', 'Phục vụ chỉ là meal hoặc drink.');
  }
  for (const [k, arr] of [['streetsX', pd.streetsX], ['streetsZ', pd.streetsZ]]) {
    if (!Array.isArray(arr) || arr.length !== CITY.N + 1) add('error', '', k, `Cần đúng ${CITY.N + 1} tên đường.`);
    else arr.forEach((s, i) => !String(s).trim() && add('error', '', k, `Tên đường số ${i + 1} đang trống.`));
  }
  if (!pd.customerNames || !pd.customerNames.filter((s) => String(s).trim()).length) add('error', '', 'customerNames', 'Cần ít nhất 1 tên khách.');
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

export function validateAll({ items, gear, places, content, baseContent }) {
  return [...validateItems(items, places), ...validateGear(gear), ...validatePlaces(places, items), ...validateContent(content, baseContent || content)];
}
