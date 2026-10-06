// Thẻ XE · TÚI · ĐỒ NGHỀ: chỉ số, giá, mô tả + bảng so sánh cả nhóm.
import { PROTECTED, ID_RE } from '../../data/validate.js';
import { el, field, textInput, numInput, colorInput, button, sideList, areaInput } from './ui.js';

const CATS = [
  ['vehicles', '🛵 Xe'],
  ['bags', '👜 Túi giao hàng'],
  ['gear', '🦺 Đồ nghề'],
];

// Các trường của từng nhóm: [khóa, nhãn, tùy chọn ô số, gợi ý]
const FIELDS = {
  vehicles: [
    ['maxSpeed', 'Tốc độ tối đa (km/h)', { scale: 3.6, step: 1, digits: 0 }, 'Cub 45 · tay ga 60 · mô tô 80'],
    ['accel', 'Tăng tốc (m/s²)', { step: 0.1 }, 'Càng cao càng bốc'],
    ['brake', 'Lực phanh (m/s²)', { step: 0.5 }, 'Phanh gấp > 6,5 m/s² làm canh sóng sánh'],
    ['steer', 'Độ nhạy lái', { step: 0.1 }, '2,2 là vừa'],
    ['suspension', 'Giảm xóc (%)', { scale: 100, step: 5, digits: 0 }, 'Giảm đổ canh khi qua ổ gà'],
    ['fuelPer100km', 'Hao xăng (L/100 km)', { step: 0.1 }, ''],
    ['tank', 'Bình xăng (L)', { step: 0.5 }, ''],
    ['price', 'Giá (k)', { step: 50 }, ''],
  ],
  bags: [
    ['insulation', 'Giữ nhiệt (%)', { scale: 100, step: 5, digits: 0 }, '≥ 50% mới nhận được đơn trà sữa, kem'],
    ['waterproof', 'Chống nước (%)', { scale: 100, step: 5, digits: 0 }, 'Bảo vệ hộp giấy khi mưa'],
    ['padding', 'Đệm chống sốc (%)', { scale: 100, step: 5, digits: 0 }, 'Giảm hư đồ dễ vỡ và đổ canh'],
    ['cols', 'Số cột ô', { step: 1, min: 1, max: 5 }, 'Lưới xếp túi = cột × hàng'],
    ['rows', 'Số hàng ô', { step: 1, min: 1, max: 4 }, ''],
    ['price', 'Giá (k)', { step: 10 }, 'Túi giá 0 = túi miễn phí lúc đầu'],
  ],
  gear: [['price', 'Giá (k)', { step: 5 }, '']],
};

export function render(root, ctx) {
  const sel = ctx.sel.gear;
  sel.cat = sel.cat || 'vehicles';
  const table = ctx.data.gear[sel.cat];
  if (!sel.id || !table[sel.id]) sel.id = Object.keys(table)[0];
  const changed = () => ctx.changed('gear');

  const side = el('aside', { class: 'ed-side' });
  const drawSide = () => {
    side.innerHTML = '';
    side.append(
      el('div', { class: 'seg' }, CATS.map(([c, label]) => button(label, () => ctx.select('gear', { cat: c, id: null }), sel.cat === c ? 'on' : ''))),
      el('div', { class: 'side-head' }, el('b', {}, `${Object.keys(table).length} mục`), sel.cat !== 'gear' ? button('＋ Thêm', add, 'small primary') : el('small', { class: 'muted' }, 'Đồ nghề gắn với luật game, không thêm/xóa')),
      sideList(
        Object.values(table).map((s) => ({ id: s.id, icon: sel.cat === 'vehicles' ? '🛵' : sel.cat === 'bags' ? '👜' : '🦺', title: s.name, sub: `${s.id} · ${s.price}k` })),
        sel.id,
        (id) => ctx.select('gear', { id }),
        { issuesFor: (id) => ctx.issuesFor('gear', id, { cat: sel.cat }) },
      ),
    );
  };
  drawSide();
  ctx.refreshSide = drawSide;

  const s = table[sel.id];
  const body = el('section', { class: 'ed-body' });
  root.append(el('div', { class: 'ed-split' }, side, body));
  if (!s) return;
  const ref = s.id, cat = sel.cat;
  const locked = PROTECTED[cat].includes(ref);
  const opt = (k, extra = {}) => ({ ref, fieldKey: k, cat, ...extra });

  const idInput = textInput(s.id, () => {}, { class: 'mono', disabled: locked || cat === 'gear' });
  idInput.addEventListener('change', () => rename(s.id, idInput.value.trim()));
  body.append(
    el('div', { class: 'body-head' }, el('h2', {}, s.name), locked ? el('span', { class: 'pill' }, cat === 'gear' ? '🔒 Gắn với luật game' : '🔒 Đồ khởi đầu') : button('🗑 Xóa', remove, 'danger small')),
    el(
      'div',
      { class: 'grid' },
      field('Mã (không dấu)', idInput, opt('id')),
      field('Tên', textInput(s.name, (v) => { s.name = v; changed(); }), opt('name')),
      cat !== 'gear' ? field('Màu', colorInput(s.color, (v) => { s.color = v; changed(); }), opt('color', { hint: cat === 'vehicles' ? 'Màu thân xe' : 'Màu túi trên baga' })) : null,
      ...FIELDS[cat].map(([k, label, o, hint]) => field(label, numInput(s[k], (v) => { s[k] = v; changed(); }, o), opt(k, { hint }))),
    ),
    field('Mô tả (hiện trong cửa hàng)', areaInput(s.desc, (v) => { s.desc = v; changed(); }, 2), opt('desc', { wide: true })),
  );
  if (cat === 'gear') body.append(el('p', { class: 'muted' }, gearRule(ref)));

  // bảng so sánh
  const cols = FIELDS[cat];
  body.append(
    el('h3', {}, 'So sánh cả nhóm'),
    el(
      'table',
      { class: 'cmp' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Tên'), cols.map(([, label]) => el('th', {}, label)))),
      el(
        'tbody',
        {},
        Object.values(table).map((x) =>
          el(
            'tr',
            { class: x.id === ref ? 'on' : '', onclick: () => ctx.select('gear', { id: x.id }) },
            el('td', {}, x.name),
            cols.map(([k, , o]) => el('td', {}, typeof x[k] === 'number' ? +(x[k] * (o.scale || 1)).toFixed(o.digits ?? 2) : '—')),
          ),
        ),
      ),
    ),
  );

  function add() {
    const prefix = cat === 'vehicles' ? 'xe' : 'tui';
    let n = 1;
    while (table[`${prefix}${n}`]) n++;
    const id = `${prefix}${n}`;
    table[id] = cat === 'vehicles'
      ? { id, name: 'Xe mới', maxSpeed: 15, accel: 5, brake: 10, steer: 2.3, suspension: 0.4, fuelPer100km: 3, tank: 4, price: 2000, color: '#2e86c1', desc: '' }
      : { id, name: 'Túi mới', insulation: 0.3, waterproof: 0.3, padding: 0.2, cols: 2, rows: 2, price: 80, color: '#8e44ad', desc: '' };
    changed();
    ctx.select('gear', { id });
  }

  function remove() {
    if (!confirm(`Xóa "${s.name}"? Bản lưu của người chơi đã mua món này sẽ không dùng được nó nữa.`)) return;
    delete table[ref];
    changed();
    ctx.select('gear', { id: null });
  }

  function rename(oldId, newId) {
    if (!newId || newId === oldId) return;
    if (!ID_RE.test(newId)) return alert('Mã chỉ gồm chữ không dấu, số, gạch dưới.');
    if (table[newId]) return alert('Mã này đã có.');
    const entries = Object.entries(table).map(([k, v]) => (k === oldId ? [newId, { ...v, id: newId }] : [k, v]));
    for (const k of Object.keys(table)) delete table[k];
    for (const [k, v] of entries) table[k] = v;
    changed();
    ctx.select('gear', { id: newId });
  }
}

function gearRule(id) {
  return {
    raincoat: 'Luật: khi mưa, không trừ thêm thể lực/tinh thần; khách xe ôm không bị ướt.',
    jacket: 'Luật: không mệt thêm khi nắng gắt 11h–15h.',
    spareHelmet: 'Luật: mở khóa đơn chở khách (và nhiệm vụ chiếc ví).',
  }[id] || '';
}
