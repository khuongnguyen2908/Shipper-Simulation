// Ô chọn khung giờ của công cụ ?editor: tick "Cả ngày" / một khung giờ mẫu / "Tự đặt" (nhiều đoạn, giờ lẻ 30 phút).
// Dùng cho giờ mở cửa, khung giờ có đơn (địa điểm) và khung giờ loại đơn / loại khách (App & Đơn).
import { el, button } from './ui.js';
import { ranges, fmtHours, fmtTime, packRanges } from '../../sim/hours.js';

// 0:00, 0:30 … 24:00
const TIMES = Array.from({ length: 49 }, (_, i) => i / 2);
let uid = 0;

// Chọn giờ (thả xuống, bước 30 phút); giá trị lẻ khác 30 phút vẫn giữ nguyên
function timeSelect(v, onChange) {
  const opts = TIMES.includes(v) ? TIMES : [...TIMES, v].sort((a, b) => a - b);
  const s = el('select', { class: 'time-sel', onchange: (e) => onChange(Number(e.target.value)) }, opts.map((t) => el('option', { value: t, selected: t === v }, fmtTime(t))));
  return s;
}

// Sửa danh sách đoạn giờ [[a,b],…]. onChange(list mới) — list luôn có ít nhất 1 đoạn.
export function rangesEditor(list, onChange) {
  const box = el('div', { class: 'ranges' });
  const draw = () => {
    box.innerHTML = '';
    list.forEach(([a, b], i) => {
      box.append(el('div', { class: 'inline range-row' },
        timeSelect(a, (v) => { list[i] = [v, list[i][1]]; onChange(list); }),
        el('span', {}, '→'),
        timeSelect(b, (v) => { list[i] = [list[i][0], v]; onChange(list); }),
        list.length > 1 ? button('✕', () => { list.splice(i, 1); onChange(list); draw(); }, 'small') : null));
    });
    box.append(button('＋ Thêm đoạn (vd nghỉ trưa)', () => {
      const end = Math.max(...list.map((r) => r[1]));
      list.push(end < 23 ? [Math.min(end + 1, 23), Math.min(end + 4, 24)] : [13, 17]);
      onChange(list);
      draw();
    }, 'small'));
  };
  draw();
  return box;
}

// value: null | [a,b] | [[a,b],…] | "mãMẫu". emptyLabel: ý nghĩa khi bỏ trống ("Cả ngày" / "Theo giờ mở cửa").
// onChange(giá trị mới) — null = bỏ trống.
export function hoursPicker({ value, presets = {}, emptyLabel = 'Cả ngày', onChange }) {
  const name = `hp${++uid}`;
  const box = el('div', { class: 'hours-picker' });
  let cur = value;
  const mode = () => (cur == null ? '' : typeof cur === 'string' ? `p:${cur}` : 'custom');
  const draw = () => {
    box.innerHTML = '';
    const radio = (key, label, sub, pick) => el('label', { class: `hp-opt${mode() === key ? ' on' : ''}` },
      el('input', { type: 'radio', name, checked: mode() === key, onchange: () => { cur = pick(); onChange(cur); draw(); } }),
      el('span', {}, label), sub ? el('small', { class: 'muted' }, sub) : null);
    box.append(radio('', emptyLabel, null, () => null));
    for (const p of Object.values(presets)) box.append(radio(`p:${p.id}`, `⏰ ${p.name}`, fmtHours(p.id, presets), () => p.id));
    if (typeof cur === 'string' && !presets[cur]) box.append(el('div', { class: 'error' }, `⛔ Khung giờ mẫu "${cur}" không còn — chọn lại.`));
    // "Tự đặt": lấy giờ đang thấy làm điểm bắt đầu
    box.append(radio('custom', '✏️ Tự đặt', mode() === 'custom' ? null : 'chọn giờ riêng cho nơi này', () => packRanges(ranges(cur, presets) || [[8, 21]])));
    if (mode() === 'custom') {
      const list = (ranges(cur, presets) || [[8, 21]]).map((r) => [...r]);
      box.append(rangesEditor(list, (l) => { cur = packRanges(l); onChange(cur); }));
    }
  };
  draw();
  return box;
}

// Những nơi đang dùng một khung giờ mẫu (để hiện "Đang dùng ở" và cập nhật khi đổi mã / xóa)
export function presetUsers(data, id) {
  const out = [];
  for (const p of data.places.places) {
    if (p.hours === id) out.push({ label: `${p.name} · giờ mở cửa`, tab: 'places', sel: { id: p.id }, obj: p, key: 'hours' });
    if (p.orders?.hours === id) out.push({ label: `${p.name} · giờ có đơn`, tab: 'places', sel: { id: p.id }, obj: p.orders, key: 'hours' });
  }
  for (const [cat, table] of [['orderTypes', data.apps?.orderTypes], ['riderTypes', data.apps?.riderTypes]]) {
    for (const t of Object.values(table || {})) if (t.hours === id) out.push({ label: `${t.name} · ${cat === 'orderTypes' ? 'loại đơn' : 'loại khách'}`, tab: 'app', sel: { cat, id: t.id }, obj: t, key: 'hours' });
  }
  return out;
}
