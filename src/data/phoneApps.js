// Giao diện điện thoại (phone.json, sửa ở thẻ 📱 Giao diện app trong ?editor):
// thứ tự app trên màn hình chính (= phím 1–9), biểu tượng, màu, ẩn / hiện.
// Danh sách app có thật nằm ở APP_DEFS (code mới vẽ được nội dung app); tên app ở kho chữ (khóa `key`).
import raw from './phone.json' with { type: 'json' };

// locked: không ẩn được (GoShip để nhận đơn, Túi đồ để dùng / mặc đồ)
export const APP_DEFS = {
  goship: { icon: '🛵', color: '#00b14f', key: 'phone.app', locked: true },
  map: { icon: '🗺️', color: '#2e86de', key: 'phone.tabMap' },
  chat: { icon: '💬', color: '#5dade2', key: 'phone.appChat' },
  wallet: { icon: '💳', color: '#8e44ad', key: 'phone.tabWallet' },
  account: { icon: '👤', color: '#e67e22', key: 'phone.appProfile' },
  bag: { icon: '🎒', color: '#7f8c8d', key: 'phone.tabBag', locked: true },
  bike: { icon: '🏍️', color: '#c0392b', key: 'phone.appBike' },
  police: { icon: '🚓', color: '#34495e', key: 'phone.appPolice' },
};
export const MAX_VISIBLE = 9; // bàn phím chỉ có phím 1–9

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// data (phone.json) → { all, visible }: mỗi app [mã, biểu tượng, màu, khóa chữ tên].
// Mã lạ bỏ qua, trùng lấy lần đầu; app có trong code mà thiếu trong file thì thêm vào cuối (đang hiện).
export function phoneApps(data = raw) {
  const seen = new Set();
  const rows = [];
  for (const a of data?.apps || []) {
    const def = APP_DEFS[a?.id];
    if (!def || seen.has(a.id)) continue;
    seen.add(a.id);
    rows.push({ id: a.id, icon: String(a.icon || '').trim() || def.icon, color: COLOR_RE.test(a.color || '') ? a.color : def.color, hidden: !!a.hidden && !def.locked });
  }
  for (const [id, def] of Object.entries(APP_DEFS)) if (!seen.has(id)) rows.push({ id, icon: def.icon, color: def.color, hidden: false });
  const tuple = (r) => [r.id, r.icon, r.color, APP_DEFS[r.id].key];
  return { all: rows.map(tuple), visible: rows.filter((r) => !r.hidden).slice(0, MAX_VISIBLE).map(tuple) };
}

// Kiểm tra phone.json (dùng trong validate.js)
export function validatePhone(data) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'phone', ref, field, msg });
  if (!data || !Array.isArray(data.apps)) return [{ level: 'error', tab: 'phone', ref: '', field: 'apps', msg: 'Thiếu danh sách app.' }];
  const seen = new Set();
  for (const a of data.apps) {
    const id = a?.id;
    if (!APP_DEFS[id]) { add('error', String(id ?? ''), 'id', `App lạ "${id}". Chỉ có: ${Object.keys(APP_DEFS).join(', ')}.`); continue; }
    if (seen.has(id)) add('error', id, 'id', 'App bị lặp 2 lần.');
    seen.add(id);
    if (!String(a.icon || '').trim()) add('error', id, 'icon', 'Chưa có biểu tượng.');
    if (!COLOR_RE.test(a.color || '')) add('error', id, 'color', 'Màu phải dạng #rrggbb.');
    if (a.hidden && APP_DEFS[id].locked) add('error', id, 'hidden', 'App này không ẩn được (game cần nó).');
  }
  for (const id of Object.keys(APP_DEFS)) if (!seen.has(id)) add('warn', id, 'id', 'Thiếu app này trong danh sách → game tự thêm vào cuối.');
  const shown = data.apps.filter((a) => APP_DEFS[a?.id] && !(a.hidden && !APP_DEFS[a.id].locked)).length;
  if (shown > MAX_VISIBLE) add('error', '', 'apps', `Đang hiện ${shown} app — tối đa ${MAX_VISIBLE} (phím 1–9). Ẩn bớt app.`);
  return out;
}
