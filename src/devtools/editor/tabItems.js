// Thẻ VẬT PHẨM: món hàng (tên, biểu tượng, đặc tính, giá cước, nhiệt độ) + quán nào bán
// + xem trước món hư thế nào trong 30 phút với từng loại túi.
import { DeliveryItem } from '../../sim/ItemPhysics.js';
import { fmt } from '../../content/index.js';
import { TRAIT_IDS, PROTECTED, ID_RE } from '../../data/validate.js';
import { el, field, textInput, numInput, checkInput, button, sideList, selectInput } from './ui.js';

const TRAIT_INFO = {
  hot: ['🔥 Nóng', 'Nguội dần; dưới 60°C bắt đầu mất điểm'],
  cold: ['❄️ Lạnh', 'Ấm dần theo trời + nắng; quá ngưỡng tan thì mất điểm'],
  liquid: ['💧 Nước', 'Đổ khi xóc, phanh gấp, ôm cua; phải dựng đứng khi xếp túi'],
  fragile: ['⚠️ Dễ vỡ', 'Hỏng nặng khi va chạm; không được để món khác đè lên'],
  paper: ['📦 Hộp giấy', 'Ướt mưa là hỏng nếu túi không chống nước'],
  passenger: ['🧍 Chở người', 'Dành riêng cho khách xe ôm'],
};

export function render(root, ctx) {
  const items = ctx.data.items;
  const sel = ctx.sel.items;
  const ids = Object.keys(items);
  if (!sel.id || !items[sel.id]) sel.id = ids[0];

  const side = el('aside', { class: 'ed-side' });
  const drawSide = () => {
    side.innerHTML = '';
    side.append(
      el('div', { class: 'side-head' }, el('b', {}, `Món hàng (${ids.length})`), button('＋ Thêm món', addItem, 'small primary')),
      sideList(
        Object.values(items).map((it) => ({ id: it.id, icon: it.icon, title: it.name || '(chưa đặt tên)', sub: `${it.id} · ${it.base}k` })),
        sel.id,
        (id) => ctx.select('items', { id }),
        { issuesFor: (id) => ctx.issuesFor('items', id) },
      ),
    );
  };
  drawSide();
  ctx.refreshSide = drawSide;

  const it = items[sel.id];
  const body = el('section', { class: 'ed-body' });
  root.append(el('div', { class: 'ed-split' }, side, body));
  if (!it) return;

  const ref = it.id;
  const protectedId = PROTECTED.items.includes(ref);
  const changed = () => ctx.changed('items');
  const restaurants = ctx.data.places.places.filter((p) => p.kind === 'restaurant');
  const tr = it.traits;

  // --- thông tin chung ---
  const idInput = textInput(it.id, () => {}, { disabled: protectedId, class: 'mono' });
  idInput.addEventListener('change', () => renameItem(it.id, idInput.value.trim()));
  body.append(
    el('div', { class: 'body-head' }, el('h2', {}, `${it.icon || ''} ${it.name || ''}`), protectedId ? el('span', { class: 'pill' }, '🔒 Món bắt buộc') : button('🗑 Xóa món', () => removeItem(it.id), 'danger small')),
    el(
      'div',
      { class: 'grid' },
      field('Mã (không dấu)', idInput, { ref, fieldKey: 'id', hint: protectedId ? 'Code dùng trực tiếp mã này' : 'Đổi mã sẽ tự cập nhật thực đơn các quán' }),
      field('Tên hiển thị', textInput(it.name, (v) => { it.name = v; changed(); }), { ref, fieldKey: 'name' }),
      field('Biểu tượng (emoji)', textInput(it.icon, (v) => { it.icon = v; changed(); }, { class: 'emoji' }), { ref, fieldKey: 'icon' }),
      field('Giá cước (k)', numInput(it.base, (v) => { it.base = v; changed(); }, { step: 1, min: 1 }), { ref, fieldKey: 'base', hint: 'Đơn nhiều món: lấy giá cao nhất + 6k mỗi món thêm' }),
    ),
  );

  // --- đặc tính ---
  body.append(
    el('h3', {}, 'Đặc tính vật lý'),
    field(
      '',
      el(
        'div',
        { class: 'traits' },
        TRAIT_IDS.filter((t) => t !== 'passenger' || protectedId).map((t) =>
          el(
            'div',
            { class: 'trait' },
            checkInput(tr.includes(t), (on) => {
              it.traits = on ? [...tr, t] : tr.filter((x) => x !== t);
              if (on && t === 'hot' && it.startTemp == null) it.startTemp = 80;
              if (on && t === 'cold') Object.assign(it, { startTemp: it.startTemp ?? 4, meltAt: it.meltAt ?? 10, meltRate: it.meltRate ?? 0.12 });
              changed();
              ctx.rerender();
            }, TRAIT_INFO[t][0]),
            el('small', {}, TRAIT_INFO[t][1]),
          ),
        ),
      ),
      { ref, fieldKey: 'traits', wide: true },
    ),
  );
  if (tr.includes('hot') || tr.includes('cold')) {
    const temps = el('div', { class: 'grid' }, field('Nhiệt độ lúc nhận (°C)', numInput(it.startTemp, (v) => { it.startTemp = v; changed(); }, { step: 1 }), { ref, fieldKey: 'startTemp' }));
    if (tr.includes('cold')) {
      temps.append(
        field('Bắt đầu tan ở (°C)', numInput(it.meltAt, (v) => { it.meltAt = v; changed(); }, { step: 0.5 }), { ref, fieldKey: 'meltAt' }),
        field('Tốc độ tan', numInput(it.meltRate, (v) => { it.meltRate = v; changed(); }, { step: 0.01, min: 0 }), { ref, fieldKey: 'meltRate', hint: '% mất mỗi phút cho mỗi °C vượt ngưỡng (0,1–0,3 là vừa)' }),
      );
    }
    body.append(temps);
  }

  // --- quán bán ---
  if (!tr.includes('passenger')) {
    body.append(
      el('h3', {}, 'Quán nào bán món này'),
      field(
        '',
        el(
          'div',
          { class: 'chips' },
          restaurants.map((p) =>
            checkInput((p.menu || []).includes(it.id), (on) => {
              p.menu = on ? [...(p.menu || []), it.id] : (p.menu || []).filter((m) => m !== it.id);
              ctx.changed('places');
              ctx.changed('items');
            }, `${p.name}`),
          ),
        ),
        { ref, fieldKey: 'menu', wide: true, hint: 'Lưu ý: thay đổi này nằm trong file địa điểm (places.json)' },
      ),
    );
  }

  // --- xem trước ---
  body.append(el('h3', {}, 'Xem trước: món hư thế nào trong 30 phút'), previewBox(it, ctx));

  // ---------- thao tác ----------
  function addItem() {
    let n = 1;
    while (items[`mon${n}`]) n++;
    const id = `mon${n}`;
    items[id] = { id, name: 'Món mới', icon: '🥡', traits: ['hot'], base: 25, startTemp: 80 };
    ctx.changed('items');
    ctx.select('items', { id });
  }

  function removeItem(id) {
    const using = restaurants.filter((p) => (p.menu || []).includes(id));
    if (!confirm(`Xóa món "${items[id].name}"?${using.length ? `\nMón này sẽ bị gỡ khỏi thực đơn: ${using.map((p) => p.name).join(', ')}.` : ''}`)) return;
    delete items[id];
    for (const p of using) p.menu = p.menu.filter((m) => m !== id);
    ctx.changed('places');
    ctx.changed('items');
    ctx.select('items', { id: Object.keys(items)[0] });
  }

  function renameItem(oldId, newId) {
    if (!newId || newId === oldId) return;
    if (!ID_RE.test(newId)) return alert('Mã chỉ gồm chữ không dấu, số, gạch dưới; bắt đầu bằng chữ.');
    if (items[newId]) return alert('Mã này đã có.');
    // giữ thứ tự khóa
    const entries = Object.entries(items).map(([k, v]) => (k === oldId ? [newId, { ...v, id: newId }] : [k, v]));
    for (const k of Object.keys(items)) delete items[k];
    for (const [k, v] of entries) items[k] = v;
    for (const p of restaurants) p.menu = (p.menu || []).map((m) => (m === oldId ? newId : m));
    ctx.changed('places');
    ctx.changed('items');
    ctx.select('items', { id: newId });
  }
}

// Biểu đồ: tình trạng món theo thời gian với từng túi trong gear.json
function previewBox(it, ctx) {
  const opts = ctx.sel.itemsPreview || (ctx.sel.itemsPreview = { weather: 'normal', bumps: 2, crash: false, speed: 10 });
  const box = el('div', { class: 'preview' });
  const chart = el('div', { class: 'chart' });
  const legend = el('div', { class: 'legend' });
  const draw = () => {
    chart.innerHTML = '';
    legend.innerHTML = '';
    if (!it.traits.length || it.traits.some((t) => !TRAIT_INFO[t])) return;
    const W = 460, H = 170, P = 28;
    const weather = { normal: { ambient: 30, sun: 0.5, raining: false }, harsh: { ambient: 35, sun: 1, raining: false }, rain: { ambient: 25, sun: 0, raining: true }, night: { ambient: 27, sun: 0, raining: false } }[opts.weather];
    const bags = Object.values(ctx.data.gear.bags);
    const cub = ctx.data.gear.vehicles.cub || Object.values(ctx.data.gear.vehicles)[0];
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%"><g class="grid">`;
    for (let y = 0; y <= 100; y += 25) svg += `<line x1="${P}" x2="${W - 6}" y1="${H - P - (y / 100) * (H - P - 8)}" y2="${H - P - (y / 100) * (H - P - 8)}"/><text x="2" y="${H - P - (y / 100) * (H - P - 8) + 4}">${y}%</text>`;
    for (let m = 0; m <= 30; m += 10) svg += `<text x="${P + (m / 30) * (W - P - 6) - 6}" y="${H - 8}">${m}′</text>`;
    svg += '</g>';
    for (const bag of bags) {
      let item;
      try {
        item = new DeliveryItem(it);
      } catch {
        return;
      }
      const env = { ...weather, exposed: true, speed: opts.speed, comfortSpeed: 11, suspension: cub ? cub.suspension : 0.2, bag, passengerRaincoat: false };
      const pts = [[0, 100]];
      // ổ gà rải đều trên quãng đường
      const bumpAt = new Set(Array.from({ length: opts.bumps }, (_, k) => Math.round(((k + 1) * 30) / (opts.bumps + 1))));
      for (let m = 1; m <= 30; m++) {
        item.tick(env, 1);
        if (bumpAt.has(m)) item.event('bump', opts.speed / 12.5, env);
        if (opts.crash && m === 15) item.event('collision', 1.5, env);
        pts.push([m, item.condition]);
      }
      const color = /^#/.test(bag.color) ? (bag.color.toLowerCase() === '#f2f2f2' ? '#cfd8dc' : bag.color) : '#ccc';
      svg += `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${pts.map(([m, c]) => `${P + (m / 30) * (W - P - 6)},${H - P - (Math.max(0, c) / 100) * (H - P - 8)}`).join(' ')}"/>`;
      const reasons = Object.entries(item.reasons).filter(([, v]) => v >= 0.5).map(([k, v]) => `${fmt(`dmg.${k}`)} −${v.toFixed(0)}%`).join(', ');
      legend.append(el('div', {}, el('i', { style: `background:${color}` }), el('b', {}, `${bag.name}: ${item.condition.toFixed(0)}%`), reasons ? el('small', {}, ` (${reasons})`) : null));
    }
    svg += '</svg>';
    chart.innerHTML = svg;
  };
  const ctrl = el(
    'div',
    { class: 'pv-ctrl' },
    el('label', {}, 'Thời tiết ', selectInput(opts.weather, [['normal', 'Bình thường 30°C'], ['harsh', 'Nắng gắt 35°C'], ['rain', 'Mưa 25°C'], ['night', 'Tối 27°C']], (v) => { opts.weather = v; draw(); })),
    el('label', {}, 'Ổ gà trên đường ', numInput(opts.bumps, (v) => { opts.bumps = Math.max(0, Math.min(10, Math.round(v || 0))); draw(); }, { step: 1, min: 0, max: 10 })),
    el('label', {}, 'Tốc độ (km/h) ', numInput(opts.speed, (v) => { opts.speed = v || 0; draw(); }, { step: 5, scale: 3.6, digits: 0 })),
    checkInput(opts.crash, (v) => { opts.crash = v; draw(); }, 'Va chạm ở phút 15'),
  );
  box.append(ctrl, chart, legend, el('small', { class: 'muted' }, 'Mỗi đường là một loại túi (lấy từ thẻ Xe · Túi · Đồ nghề), xe Cub, xếp túi đúng cách. Tên lý do hỏng sửa ở thẻ Chữ, nhóm "Lý do hỏng hàng".'));
  draw();
  return box;
}
