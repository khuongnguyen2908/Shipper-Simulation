// Ô "🕸️ Quan hệ" trong ?editor (trang NPC địa điểm, danh bạ / người nói cốt truyện): tóm tắt nhân vật trong sơ đồ quan hệ
// (/?relationship) + nút mở thẳng nhân vật đó. Chưa có trong sơ đồ → nút thêm vào sơ đồ.
// relationsJson được editor cập nhật tại chỗ khi /?relationship lưu (index.js → shipper:data-changed).
import relationsJson from '../../data/relations.json' with { type: 'json' };
import { el } from './ui.js';

// mở / dùng lại đúng 1 tab công cụ quan hệ
const open = (hash, label) => el('a', { class: 'btn small', href: `./?relationship#${hash}`, target: 'shipper-relationship' }, label);

export function relBox({ place = null, story = null }) {
  const R = relationsJson, chars = R.characters || {}, types = R.types || {};
  const id = Object.keys(chars).find((k) => (place && chars[k].place === place) || (story && chars[k].story === story));
  const key = place ? `place:${place}` : `story:${story}`;
  if (!id) {
    return el('div', { class: 'rel-box empty' },
      el('b', {}, '🕸️ Quan hệ'),
      el('span', { class: 'muted' }, 'Chưa có trong sơ đồ quan hệ nhân vật.'),
      open(`add=${key}`, '🕸️ Thêm vào sơ đồ'));
  }
  const c = chars[id];
  const meta = [c.role, c.age ? `${c.age} tuổi` : '', c.personality].filter(Boolean).join(' · ');
  const rows = (R.links || []).filter((l) => l.a === id || l.b === id).map((l) => {
    const o = chars[l.a === id ? l.b : l.a], s = (l.a === id ? l.ab : l.ba) || {};
    const t = types[l.type] || { color: '#888', name: l.type };
    const say = s.self || s.call ? ` · xưng "${s.self || '?'}", gọi "${s.call || '?'}"` : '';
    return el('div', { class: 'rel-l' }, el('i', { style: `background:${t.color}` }), `${l.secret ? '🔒 ' : ''}${o?.icon || ''} ${o?.name || '?'} — `, el('b', {}, s.label || t.name), say);
  });
  return el('div', { class: 'rel-box' },
    el('b', {}, `🕸️ Quan hệ — ${c.icon || ''} ${c.name}`, (c.from || 1) > 1 ? el('span', { class: 'tag' }, ` Từ chương ${c.from}`) : null),
    meta ? el('span', { class: 'muted' }, meta.length > 160 ? meta.slice(0, 158) + '…' : meta) : null,
    rows.length ? rows : el('span', { class: 'muted' }, 'Chưa có dây quan hệ nào.'),
    el('div', { class: 'row' }, open(key.replace(':', '='), '🕸️ Mở trong sơ đồ quan hệ')),
    el('small', { class: 'muted' }, 'Tên / chân dung / giới tính dùng chung với sơ đồ: sửa bên nào bên kia đổi theo (sau khi Lưu).'));
}
