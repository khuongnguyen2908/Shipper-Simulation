// =============================================================
// KHO CHỮ HIỂN THỊ — mọi chữ trong game đi qua fmt(khóa, tham số).
// Dữ liệu ở src/content/vi.json (sửa bằng công cụ ?editor).
//  - Chuỗi: "Xin chào {name}!" → fmt('khóa', { name: 'Lan' })
//  - Danh sách (mảng): dùng list('khóa') hoặc pick('khóa', số) để lấy 1 câu
// =============================================================
import vi from './vi.json' with { type: 'json' };
import { untag, lineFits } from '../sim/people.js';

let table = vi;

const fill = (s, params) => String(s).replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));

export function fmt(key, params = {}) {
  const s = table[key];
  if (s === undefined) {
    if (typeof console !== 'undefined') console.warn(`[content] thiếu khóa chữ: ${key}`);
    return `⟦${key}⟧`;
  }
  if (Array.isArray(s)) return fill(s[0] ?? '', params);
  return fill(s, params);
}

// Có khóa này không (dùng cho khóa động như npc.<id>.greet)
export function has(key) {
  return table[key] !== undefined;
}

export function list(key) {
  const s = table[key];
  if (s === undefined) return [`⟦${key}⟧`];
  return Array.isArray(s) ? s : [s];
}

// Lấy câu thứ i (vòng lại) trong danh sách, có thay tham số (bỏ thẻ đầu câu "[veso] …" nếu có)
// Thẻ ĐIỀU KIỆN (khác thẻ vai): câu chỉ nói khi đúng lúc — [day] ban ngày · [night] ban đêm · [late] giao trễ · [damaged] hàng hư / móp.
// Ghép được với thẻ vai: "[veso,day] Vé số chiều nay xổ…". Người gọi đưa danh sách điều kiện đang đúng (cond); câu có thẻ điều kiện
// mà điều kiện đó không đúng thì không nói. Không đưa cond → không lọc.
export const COND_TAGS = ['day', 'night', 'late', 'damaged'];
const condOk = (tags, cond) => !cond || tags.filter((t) => COND_TAGS.includes(t)).every((t) => cond.includes(t));
const roleTags = (tags) => tags.filter((t) => !COND_TAGS.includes(t));
// Câu hợp điều kiện; không còn câu nào → bỏ lọc (thà nói câu chung còn hơn im)
function condLines(key, cond) {
  const all = list(key).map(untag);
  const ok = all.filter((x) => condOk(x.tags, cond));
  return ok.length ? ok : all;
}
export function pick(key, i = 0, params = {}, cond = null) {
  const l = condLines(key, cond);
  return fill(l[((i % l.length) + l.length) % l.length].text, params);
}

// Như pick nhưng chỉ chọn câu hợp với người nói who (sim/people.js personOf): câu có thẻ "[veso] …" chỉ người có vai / tuổi /
// giới tính trùng thẻ mới nói. Người có câu riêng thì ROLE_SHARE số lần nói câu riêng, còn lại câu chung (không thẻ) —
// không vậy thì câu chung (nhiều hơn hẳn) lấn hết, vd khách nước ngoài toàn nói tiếng Việt, con nít hỏi giá vàng.
export const ROLE_SHARE = 0.7;
export function pickFor(key, who, i = 0, params = {}, cond = null) {
  const all = condLines(key, cond);
  const own = all.filter((x) => roleTags(x.tags).length && lineFits(roleTags(x.tags), who)), plain = all.filter((x) => !roleTags(x.tags).length);
  const n = ((i % 1000) + 1000) % 1000, roll = ((Math.imul(n + 1, 2654435761) >>> 0) % 1000) / 1000; // cố định theo i
  let l = own.length && (!plain.length || roll < ROLE_SHARE) ? own : plain;
  if (!l.length) l = all;
  return fill(l[(Math.imul(n + 7, 40503) >>> 0) % l.length].text, params); // mỗi số i một câu (i liền nhau ra câu khác nhau)
}

// Công cụ ?editor dùng để xem trước bản đang sửa
export function setContentTable(t) {
  table = t;
}

export function contentTable() {
  return table;
}

// Các tham số {x} xuất hiện trong một chuỗi / danh sách
export function paramsOf(value) {
  const out = new Set();
  for (const s of Array.isArray(value) ? value : [value]) for (const m of String(s).matchAll(/\{(\w+)\}/g)) out.add(m[1]);
  return [...out];
}
