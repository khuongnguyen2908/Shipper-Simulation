// Thẻ 📱 GIAO DIỆN APP (phone.json): thứ tự app trên màn hình chính điện thoại (= phím 1–9),
// biểu tượng, màu, ẩn / hiện. Tên app sửa ở thẻ 💬 Chữ & hội thoại (khóa phone.*).
// Bên trái: xem trước màn hình chính đúng như trong game.
import { APP_DEFS, MAX_VISIBLE, phoneApps } from '../../data/phoneApps.js';
import { el, field, emojiInput, colorInput, checkInput, button, dragHandle, makeSortable } from './ui.js';
import { moveInArray } from './order.js';

export function render(root, ctx) {
  const data = (ctx.data.phone = ctx.data.phone || { apps: [] });
  data.apps = Array.isArray(data.apps) ? data.apps : [];
  const changed = () => ctx.changed('phone');
  const nameOf = (id) => ctx.data.content?.[APP_DEFS[id]?.key] || id;

  // ---------- bên trái: xem trước màn hình chính ----------
  const side = el('aside', { class: 'ed-side' });
  const drawSide = () => {
    const { visible } = phoneApps(data);
    side.innerHTML = '';
    side.append(
      el('div', { class: 'side-head' }, el('b', {}, 'Xem trước màn hình chính')),
      el('div', { class: 'pa-preview' },
        el('div', { class: 'pa-grid' }, visible.map(([id, icon, color], i) => el('div', { class: 'pa-app' },
          el('i', { style: `background:${color}` }, icon, el('kbd', {}, i + 1)),
          el('span', {}, nameOf(id))))),
        el('small', {}, `Phím 1–${visible.length} mở app theo thứ tự này.`)),
    );
  };
  drawSide();
  ctx.refreshSide = drawSide;

  // ---------- bên phải: danh sách app ----------
  const body = el('section', { class: 'ed-body' });
  root.append(el('div', { class: 'ed-split' }, side, body));
  body.append(
    el('div', { class: 'body-head' }, el('h2', {}, '📱 Giao diện app')),
    el('p', { class: 'muted' }, `Giữ ⠿ và kéo để đổi thứ tự — thứ tự cũng là phím tắt 1–${MAX_VISIBLE} khi mở điện thoại. Tối đa ${MAX_VISIBLE} app hiện. 🔒 = app game cần, không ẩn được. Tên app sửa ở thẻ 💬 Chữ & hội thoại.`),
  );

  let shownNo = 0;
  const list = el('div', { class: 'pa-list' }, data.apps.map((a) => {
    const def = APP_DEFS[a.id];
    if (!def) {
      return el('div', { class: 'pa-row', 'data-sort': '' }, dragHandle(), el('b', { class: 'pa-no' }, '?'),
        field('', el('span', { class: 'muted' }, `App lạ "${a.id}" — game bỏ qua.`), { ref: String(a.id ?? ''), fieldKey: 'id' }),
        button('🗑 Xóa', () => { data.apps.splice(data.apps.indexOf(a), 1); changed(); ctx.rerender(); }, 'small'));
    }
    const hidden = !!a.hidden && !def.locked;
    const no = hidden ? '—' : ++shownNo <= MAX_VISIBLE ? shownNo : '✕';
    const opt = (fieldKey) => ({ ref: a.id, fieldKey });
    return el('div', { class: `pa-row${hidden ? ' off' : ''}`, 'data-sort': '' },
      dragHandle(),
      el('b', { class: 'pa-no', title: hidden ? 'Đang ẩn' : `Phím ${no}` }, no),
      el('i', { class: 'pa-ic', style: `background:${/^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : def.color}` }, a.icon || def.icon),
      el('div', { class: 'pa-name' }, el('b', {}, nameOf(a.id)), el('small', { class: 'muted' }, `${a.id}${def.locked ? ' · 🔒' : ''}`)),
      field('Biểu tượng', emojiInput(a.icon, (v) => { a.icon = v; changed(); }), opt('icon')),
      field('Màu', colorInput(a.color, (v) => { a.color = v; changed(); }), opt('color')),
      field('', def.locked
        ? el('span', { class: 'muted' }, '🔒 Luôn hiện')
        : checkInput(a.hidden, (v) => { a.hidden = v; changed(); ctx.rerender(); }, 'Ẩn app'), opt('hidden')),
    );
  }));
  makeSortable(list, '.pa-row[data-sort]', (from, to) => {
    moveInArray(data.apps, from, to);
    changed();
    ctx.rerender();
  });
  body.append(list);

  // app có trong game mà thiếu trong file → nút thêm vào cuối
  const missing = Object.keys(APP_DEFS).filter((id) => !data.apps.some((a) => a.id === id));
  if (missing.length) {
    body.append(field('', el('div', { class: 'inline' },
      el('span', { class: 'muted' }, `Thiếu: ${missing.map(nameOf).join(', ')} (game tự thêm vào cuối).`),
      button('➕ Thêm vào danh sách', () => {
        for (const id of missing) data.apps.push({ id, icon: APP_DEFS[id].icon, color: APP_DEFS[id].color, hidden: false });
        changed();
        ctx.rerender();
      }, 'small')), { ref: '', fieldKey: 'apps', wide: true }));
  } else body.append(field('', el('span'), { ref: '', fieldKey: 'apps', wide: true }));
}
