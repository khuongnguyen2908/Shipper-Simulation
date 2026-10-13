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
export function pick(key, i = 0, params = {}) {
  const l = list(key);
  return fill(untag(l[((i % l.length) + l.length) % l.length]).text, params);
}

// Như pick nhưng chỉ chọn câu hợp với người nói who (sim/people.js personOf): câu có thẻ "[veso] …" chỉ người có vai / tuổi /
// giới tính trùng thẻ mới nói. Người có câu riêng thì ROLE_SHARE số lần nói câu riêng, còn lại câu chung (không thẻ) —
// không vậy thì câu chung (nhiều hơn hẳn) lấn hết, vd khách nước ngoài toàn nói tiếng Việt, con nít hỏi giá vàng.
export const ROLE_SHARE = 0.7;
export function pickFor(key, who, i = 0, params = {}) {
  const all = list(key).map(untag);
  const own = all.filter((x) => x.tags.length && lineFits(x.tags, who)), plain = all.filter((x) => !x.tags.length);
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
