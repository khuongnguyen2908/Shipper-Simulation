// Cảnh báo đã "Bỏ qua" (src/data/editor.json → ignoredWarnings). Hàm thuần, chạy được trong bộ thử.
// Bỏ qua ĐÚNG một cảnh báo: cùng thẻ + mục + ô + nội dung. Nội dung đổi (vd số liệu khác) → hiện lại.
// Lỗi đỏ không bao giờ bị ẩn.
export const warnEntry = (i) => ({ tab: i.tab, ref: String(i.ref ?? ''), field: String(i.field ?? ''), msg: i.msg });
const keyOf = (e) => [e.tab, e.ref, e.field, e.msg].join('|');

// → { shown: vấn đề còn hiện, ignored: cảnh báo đang bị bỏ qua (để hiện lại được) }
export function splitIgnored(issues, list = []) {
  const keys = new Set((Array.isArray(list) ? list : []).filter((e) => e && typeof e === 'object').map(keyOf));
  const shown = [], ignored = [];
  for (const i of issues) (i.level === 'warn' && keys.has(keyOf(warnEntry(i))) ? ignored : shown).push(i);
  return { shown, ignored };
}

export function addIgnore(list, issue) {
  const e = warnEntry(issue);
  if (!list.some((x) => keyOf(x) === keyOf(e))) list.push(e);
}
export function removeIgnore(list, issue) {
  const k = keyOf(warnEntry(issue));
  const i = list.findIndex((x) => keyOf(x) === k);
  if (i >= 0) list.splice(i, 1);
}
