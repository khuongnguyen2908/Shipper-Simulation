// =============================================================
// KHO CHỮ HIỂN THỊ — mọi chữ trong game đi qua fmt(khóa, tham số).
// Dữ liệu ở src/content/vi.json (sửa bằng công cụ ?editor).
//  - Chuỗi: "Xin chào {name}!" → fmt('khóa', { name: 'Lan' })
//  - Danh sách (mảng): dùng list('khóa') hoặc pick('khóa', số) để lấy 1 câu
// =============================================================
import vi from './vi.json' with { type: 'json' };

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

// Lấy câu thứ i (vòng lại) trong danh sách, có thay tham số
export function pick(key, i = 0, params = {}) {
  const l = list(key);
  return fill(l[((i % l.length) + l.length) % l.length], params);
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
