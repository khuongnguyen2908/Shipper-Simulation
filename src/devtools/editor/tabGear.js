// Thẻ XE · TÚI · ĐỒ DÙNG: chỉ số, giá, mô tả, tác dụng + nơi bán + bảng so sánh.
import { PROTECTED, ID_RE, VEHICLE_MODELS } from '../../data/validate.js';
import { moveKey } from './order.js';
import { rowMenu, addButton, entryButtons, doRemove } from './opsUi.js';
import { EFFECTS, CONSUMABLE_FIELDS, OUTFIT_SLOTS, freeOutfit, outfitLook } from '../../data/goods.js';
import { el, field, textInput, numInput, colorInput, button, sideList, areaInput, selectInput, checkInput, emojiInput, explain } from './ui.js';
import { HINT, EXPLAIN } from './help.js';
import { personPreview } from './personPreview.js';
import { GOODS_GROUPS, goodsGroupOf } from './goodsGroups.js';

const TYPE_SHORT = { consumable: 'dùng 1 lần', equipment: 'trang bị', carry: 'dùng tại địa điểm', outfit: 'trang phục' };

const CATS = [
  ['vehicles', '🛵 Xe'],
  ['bags', '👜 Túi'],
  ['goods', '🎁 Đồ dùng'],
];

// Các trường của từng nhóm: [khóa, nhãn, tùy chọn ô số] — gợi ý dưới ô nằm ở help.js
const FIELDS = {
  vehicles: [
    ['maxSpeed', 'Tốc độ tối đa (km/h)', { scale: 3.6, step: 1, digits: 0 }],
    ['accel', 'Tăng tốc (m/s²)', { step: 0.1 }],
    ['brake', 'Lực phanh (m/s²)', { step: 0.5 }],
    ['steer', 'Độ nhạy lái', { step: 0.1 }],
    ['suspension', 'Giảm xóc (%)', { scale: 100, step: 5, digits: 0 }],
    ['fuelPer100km', 'Hao xăng (L/100 km)', { step: 0.1 }],
    ['tank', 'Bình xăng (L)', { step: 0.5 }],
    ['price', 'Giá (k)', { step: 50 }],
  ],
  bags: [
    ['insulation', 'Giữ nhiệt (%)', { scale: 100, step: 5, digits: 0 }],
    ['waterproof', 'Chống nước (%)', { scale: 100, step: 5, digits: 0 }],
    ['padding', 'Đệm chống sốc (%)', { scale: 100, step: 5, digits: 0 }],
    ['cols', 'Số cột ô', { step: 1, min: 1, max: 5 }],
    ['rows', 'Số hàng ô', { step: 1, min: 1, max: 4 }],
    ['price', 'Giá (k)', { step: 10 }],
  ],
};

export function render(root, ctx) {
  const sel = ctx.sel.gear;
  sel.cat = sel.cat || 'vehicles';
  const cat = sel.cat;
  const fileKey = cat === 'goods' ? 'goods' : 'gear';
  const table = cat === 'goods' ? ctx.data.goods : ctx.data.gear[cat];
  // Đồ dùng: lọc theo nhóm ('' = tất cả; goodsGroups.js) — chỉ để xếp danh sách
  if (sel.group && !GOODS_GROUPS.some(([g]) => g === sel.group)) sel.group = '';
  const group = cat === 'goods' ? sel.group || '' : '';
  const inGroup = (s) => !group || goodsGroupOf(s) === group;
  if (!sel.id || !table[sel.id]) sel.id = (Object.values(table).find(inGroup) || Object.values(table)[0])?.id;
  const changed = () => ctx.changed(fileKey);
  const places = ctx.data.places.places;

  const side = el('aside', { class: 'ed-side' });
  const drawSide = () => {
    side.innerHTML = '';
    const shown = Object.values(table).filter(inGroup);
    const count = (g) => Object.values(table).filter((s) => goodsGroupOf(s) === g).length;
    // đổi nhóm: giữ mục đang mở nếu thuộc nhóm mới, không thì mở mục đầu của nhóm
    const pickGroup = (g) => {
      const fits = (s) => !g || goodsGroupOf(s) === g;
      ctx.select('gear', { group: g, id: table[sel.id] && fits(table[sel.id]) ? sel.id : Object.values(table).find(fits)?.id });
    };
    side.append(
      el('div', { class: 'seg' }, CATS.map(([c, label]) => button(label, () => ctx.select('gear', { cat: c, id: null }), cat === c ? 'on' : ''))),
      cat === 'goods' ? el('div', { class: 'seg group-seg' },
        button(`Tất cả (${Object.keys(table).length})`, () => pickGroup(''), `small${!group ? ' on' : ''}`),
        GOODS_GROUPS.map(([g, label]) => button(`${label} (${count(g)})`, () => pickGroup(g), `small${group === g ? ' on' : ''}`))) : null,
      el('div', { class: 'side-head' }, el('b', {}, `${shown.length} mục`), addButton(ctx, cat, [[cat === 'goods' && group ? `＋ ${GOODS_GROUPS.find(([g]) => g === group)[1]} mới` : '＋ Mục mới', add]])),
      sideList(
        shown.map((s) => ({
          id: s.id,
          icon: cat === 'vehicles' ? '🛵' : cat === 'bags' ? '👜' : s.icon || '🎁',
          title: s.name,
          sub: `${s.id} · ${s.price}k${cat === 'goods' ? ` · ${TYPE_SHORT[s.type] || s.type}` : ''}`,
        })),
        sel.id,
        (id) => ctx.select('gear', { id }),
        {
          key: `gear:${cat}:${group || 'all'}`,
          issuesFor: (id) => ctx.issuesFor('gear', id, { cat }),
          // đang xem một nhóm: dời mục tới chỗ của mục đích trong danh sách đầy đủ
          onReorder: (a, b) => { const keys = Object.keys(table); moveKey(table, keys.indexOf(shown[a].id), keys.indexOf(shown[b].id)); changed(); },
          menu: rowMenu(ctx, cat),
        },
      ),
    );
  };
  drawSide();
  ctx.refreshSide = drawSide;

  const s = table[sel.id];
  const body = el('section', { class: 'ed-body' });
  root.append(el('div', { class: 'ed-split' }, side, body));
  if (!s) return;
  const ref = s.id;
  const locked = (PROTECTED[cat] || []).includes(ref);
  const opt = (k, extra = {}) => ({ ref, fieldKey: k, cat, ...extra });

  const idInput = textInput(s.id, () => {}, { class: 'mono', disabled: locked });
  idInput.addEventListener('change', () => rename(s.id, idInput.value.trim()));
  // xe: chọn kiểu dáng + xem trước 3D (đổi màu cũng vẽ lại)
  const bikePrev = cat === 'vehicles' ? personPreview(`bike-${s.id}`) : null;
  const drawBike = () => bikePrev && bikePrev.showBike(s.color, s.model || 'underbone');
  body.append(
    el('div', { class: 'body-head' }, el('h2', {}, `${cat === 'goods' ? s.icon || '' : ''} ${s.name}`), el('span', { class: 'inline' }, entryButtons(ctx, cat, s.id), locked ? el('span', { class: 'pill' }, '🔒 Đồ khởi đầu') : button('🗑 Xóa', () => doRemove(ctx, cat, s.id), 'danger small'))),
    el(
      'div',
      { class: 'grid' },
      field('Mã (không dấu)', idInput, opt('id', { hint: 'Đổi mã sẽ tự cập nhật danh sách hàng của các địa điểm' })),
      field('Tên', textInput(s.name, (v) => { s.name = v; changed(); }), opt('name')),
      cat === 'goods'
        ? field('Biểu tượng (emoji)', emojiInput(s.icon, (v) => { s.icon = v; changed(); }), opt('icon'))
        : field('Màu', colorInput(s.color, (v) => { s.color = v; changed(); drawBike(); }), opt('color', { hint: cat === 'vehicles' ? 'Màu thân xe' : 'Màu túi trên baga' })),
      cat === 'vehicles' ? field('Kiểu dáng', selectInput(s.model || 'underbone', Object.entries(VEHICLE_MODELS), (v) => { s.model = v; changed(); drawBike(); }), opt('model', { hint: 'Chỉ đổi hình dáng; tốc độ, xăng… chỉnh ở các ô bên dưới.' })) : null,
      cat === 'goods' ? field('Giá (k)', numInput(s.price, (v) => { s.price = v; changed(); }, { step: 5, min: 0 }), opt('price', { hint: HINT.goods.price })) : null,
      ...(FIELDS[cat] || []).map(([k, label, o]) => field(label, numInput(s[k], (v) => { s[k] = v; changed(); }, o), opt(k, { hint: HINT[cat][k] }))),
    ),
    field('Mô tả (hiện trong cửa hàng)', areaInput(s.desc, (v) => { s.desc = v; changed(); }, 2), opt('desc', { wide: true })),
    ...(bikePrev ? [field('Xem trước', bikePrev.el, opt('preview', { hint: 'Tự xoay. Túi trên baga đổi theo túi đang dùng trong game.' }))] : []),
    explain(EXPLAIN[cat]),
  );
  drawBike();

  if (cat === 'goods') renderGoods(body, s, ctx, opt, changed);
  body.append(sellsBox(s, cat, ctx));

  // bảng so sánh (xe, túi)
  if (FIELDS[cat]) {
    const cols = FIELDS[cat];
    body.append(
      el('h3', {}, 'So sánh cả nhóm'),
      el(
        'table',
        { class: 'cmp' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Tên'), cols.map(([, label]) => el('th', {}, label)))),
        el('tbody', {}, Object.values(table).map((x) =>
          el('tr', { class: x.id === ref ? 'on' : '', onclick: () => ctx.select('gear', { id: x.id }) },
            el('td', {}, x.name),
            cols.map(([k, , o]) => el('td', {}, typeof x[k] === 'number' ? +(x[k] * (o.scale || 1)).toFixed(o.digits ?? 2) : '—'))))),
      ),
    );
  }

  function add() {
    const prefix = { vehicles: 'xe', bags: 'tui', goods: 'do' }[cat];
    let n = 1;
    while (table[`${prefix}${n}`]) n++;
    const id = `${prefix}${n}`;
    table[id] = {
      vehicles: { id, name: 'Xe mới', maxSpeed: 15, accel: 5, brake: 10, steer: 2.3, suspension: 0.4, fuelPer100km: 3, tank: 4, price: 2000, color: '#2e86c1', model: 'underbone', desc: '' },
      bags: { id, name: 'Túi mới', insulation: 0.3, waterproof: 0.3, padding: 0.2, cols: 2, rows: 2, price: 80, color: '#8e44ad', desc: '' },
      goods: goodsTemplate(id, group || 'consumable'),
    }[cat];
    changed();
    ctx.select('gear', { id });
  }

  function rename(oldId, newId) {
    if (!newId || newId === oldId) return;
    if (!ID_RE.test(newId)) return alert('Mã chỉ gồm chữ không dấu, số, gạch dưới.');
    if (table[newId]) return alert('Mã này đã có.');
    const entries = Object.entries(table).map(([k, v]) => (k === oldId ? [newId, { ...v, id: newId }] : [k, v]));
    for (const k of Object.keys(table)) delete table[k];
    for (const [k, v] of entries) table[k] = v;
    for (const p of places) if (p.sells?.[cat]) p.sells[cat] = p.sells[cat].map((x) => (x === oldId ? newId : x));
    if (cat === 'goods') for (const p of places) for (const a of p.activities || []) if (a.needs?.id === oldId) a.needs.id = newId;
    ctx.changed('places');
    changed();
    ctx.select('gear', { id: newId });
  }
}

// Đồ dùng mới theo nhóm đang xem
function goodsTemplate(id, group) {
  const base = { id, price: 20, desc: '' };
  if (group === 'equipment') return { ...base, name: 'Trang bị mới', icon: '🛡️', type: 'equipment', effects: {} };
  if (group === 'wearFx') return { ...base, name: 'Áo mới', icon: '🧥', type: 'equipment', effects: {} };
  if (group === 'carry') return { ...base, name: 'Đồ mang theo mới', icon: '🎒', type: 'carry' };
  if (group === 'fashion') {
    const slot = Object.keys(OUTFIT_SLOTS)[0];
    return { ...base, name: 'Áo mới', icon: '👕', type: 'outfit', slot, style: Object.keys(OUTFIT_SLOTS[slot].styles)[0], color: '#2e86c1' };
  }
  return { ...base, name: 'Đồ dùng mới', icon: '🎁', type: 'consumable', use: { minutes: 5, phys: 10, mental: 10, fuel: 0, bikeHp: 0 } };
}

// Phần riêng của đồ dùng: loại + tác dụng
function renderGoods(body, s, ctx, opt, changed) {
  body.append(
    el('h3', {}, 'Loại & tác dụng'),
    field('Loại', selectInput(s.type, [['consumable', 'Đồ dùng 1 lần (dùng từ túi đồ, phím I)'], ['equipment', 'Trang bị (mua 1 lần, tác dụng mãi)'], ['carry', 'Dùng tại địa điểm (mang tới nơi dùng, vd nhang → chùa)'], ['outfit', 'Trang phục (mua rồi mặc ở tủ đồ phòng trọ)']], (v) => {
      s.type = v;
      if (v !== 'outfit') { delete s.slot; delete s.style; delete s.color; }
      if (v === 'consumable') { delete s.effects; s.use = s.use || { minutes: 5, phys: 10, mental: 10, fuel: 0, bikeHp: 0 }; }
      else if (v === 'carry') { delete s.use; delete s.effects; }
      else if (v === 'outfit') {
        delete s.use;
        s.slot = OUTFIT_SLOTS[s.slot] ? s.slot : 'shirt';
        s.style = s.style in OUTFIT_SLOTS[s.slot].styles ? s.style : Object.keys(OUTFIT_SLOTS[s.slot].styles)[0];
        s.color = s.color || '#2e86c1';
      } else { delete s.use; s.effects = s.effects || {}; }
      changed();
      ctx.rerender();
    }), opt('type', { hint: HINT.goods.type })),
  );
  if (s.type === 'outfit') renderOutfit(body, s, ctx, opt, changed);
  if (s.type === 'carry') {
    // tác dụng nằm ở hoạt động của địa điểm; ở đây chỉ cho xem nơi dùng
    const using = ctx.data.places.places.filter((p) => (p.activities || []).some((a) => a.needs?.id === s.id));
    body.append(field('Dùng được ở', el('div', { class: using.length ? 'chips' : 'muted' }, using.length
      ? using.map((p) => button(`${p.icon || '📍'} ${p.name}: ${p.activities.filter((a) => a.needs?.id === s.id).map((a) => a.label).join(', ')}`, () => ctx.select('places', { id: p.id }), 'small'))
      : 'Chưa nơi nào. Vào thẻ 🏪 Địa điểm → chọn nơi → ở một hoạt động, đặt ô "Cần đồ" là món này.'), opt('type', { wide: true, hint: HINT.goods.carry })));
    return;
  }
  if (s.type === 'consumable') {
    s.use = s.use || {};
    body.append(el('div', { class: 'grid' }, Object.entries(CONSUMABLE_FIELDS).map(([k, r]) =>
      field(r.label, numInput(s.use[k] ?? 0, (v) => { s.use[k] = v; changed(); }, { step: k === 'fuel' ? 0.1 : 1, min: r.min, max: r.max }), opt(`use.${k}`, { hint: HINT.use[k] })))));
    return;
  }
  // chỉ ghi "effects" vào dữ liệu khi thật sự tích một tác dụng (mở xem không làm file bị coi là đã sửa)
  if (s.type === 'equipment') s.effects = s.effects || {};
  const effects = s.effects || {};
  const rows = Object.entries(EFFECTS).map(([k, def]) => {
    const on = effects[k] !== undefined && effects[k] !== false;
    const head = checkInput(on, (v) => {
      if (v) (s.effects = s.effects || {})[k] = def.kind === 'bool' ? true : def.kind === 'pct' ? (def.min < 0 ? -10 : 10) : 2;
      else if (s.effects) {
        delete s.effects[k];
        if (s.type === 'outfit' && !Object.keys(s.effects).length) delete s.effects; // trang phục không tác dụng: bỏ hẳn
      }
      changed();
      ctx.rerender();
    }, def.label);
    const val = on && def.kind !== 'bool' ? numInput(effects[k], (v) => { s.effects[k] = v; changed(); }, { step: 1, min: def.min, max: def.max }) : null;
    return el('div', { class: 'trait' }, head, val, el('small', {}, def.hint));
  });
  const hint = s.type === 'outfit'
    ? 'Chỉ có tác dụng khi đang mặc (thay ở tủ đồ phòng trọ). Để trống = chỉ để đẹp.'
    : 'Nhiều trang bị cùng tác dụng thì cộng dồn. Muốn kiểu tác dụng mới hoàn toàn thì cần thêm vào code.';
  body.append(field(s.type === 'outfit' ? 'Tác dụng khi mặc' : '', el('div', { class: 'traits' }, rows), opt('effects', { wide: true, hint })));
}

// Phần riêng của trang phục: chỗ mặc, kiểu, màu + xem trước 3D (mặc cùng đồ có sẵn ở các chỗ khác)
function renderOutfit(body, s, ctx, opt, changed) {
  const prev = personPreview(`outfit-${s.id}`);
  const draw = () => {
    const worn = Object.fromEntries(Object.keys(OUTFIT_SLOTS).map((k) => [k, freeOutfit(ctx.data.goods, k)]));
    worn[s.slot] = s;
    prev.showLook(outfitLook(worn));
  };
  const slot = OUTFIT_SLOTS[s.slot] || OUTFIT_SLOTS.shirt;
  body.append(
    el('div', { class: 'grid' },
      field('Chỗ mặc', selectInput(s.slot, Object.entries(OUTFIT_SLOTS).map(([k, d]) => [k, d.label]), (v) => {
        s.slot = v;
        if (!(s.style in OUTFIT_SLOTS[v].styles)) s.style = Object.keys(OUTFIT_SLOTS[v].styles)[0];
        changed();
        ctx.rerender();
      }), opt('slot', { hint: 'Mỗi chỗ mặc 1 món. Món giá 0 là đồ có sẵn từ đầu.' })),
      field('Kiểu', selectInput(s.style, Object.entries(slot.styles), (v) => { s.style = v; changed(); draw(); }), opt('style')),
      field('Màu', colorInput(s.color, (v) => { s.color = v; changed(); draw(); }), opt('color')),
    ),
    field('Xem trước', prev.el, opt('preview', { hint: 'Mặc cùng đồ có sẵn ở các chỗ còn lại.' })),
  );
  draw();
}

// Nơi bán: tích chọn địa điểm bán món này (ghi vào places.json → sells)
function sellsBox(s, cat, ctx) {
  const places = ctx.data.places.places;
  return el(
    'div',
    {},
    el('h3', {}, 'Bán ở đâu'),
    field(
      '',
      el('div', { class: 'chips' }, places.map((p) =>
        checkInput((p.sells?.[cat] || []).includes(s.id), (on) => {
          p.sells = p.sells || {};
          const list = p.sells[cat] || [];
          p.sells[cat] = on ? [...list, s.id] : list.filter((x) => x !== s.id);
          if (!p.sells[cat].length) delete p.sells[cat];
          if (!Object.keys(p.sells).length) delete p.sells;
          ctx.changed('places');
        }, `${p.icon || ''} ${p.name}`))),
      { ref: s.id, fieldKey: 'sells', cat, wide: true, hint: 'Thay đổi này nằm trong file địa điểm (places.json)' },
    ),
  );
}
