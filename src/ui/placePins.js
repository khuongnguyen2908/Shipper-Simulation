// =============================================================
// BIỂU TƯỢNG NỔI trên cửa các chỗ quan trọng (cây xăng, sửa xe, văn phòng hãng, đồ nghề…) + bong bóng "làm được gì ở đây".
// Chống rối màn hình (game/pins.js chọn): tối đa 3 biểu tượng, chỉ 1 bong bóng mở; chỗ đã ghé thì nhỏ lại, chỉ hiện khi rất gần.
// Chữ lấy từ kho chữ pin.* + dữ liệu địa điểm (hàng bán, hoạt động) — người chơi gõ không có ở đây nhưng vẫn gán bằng textContent.
// =============================================================
import { fmt, has } from '../content/index.js';
import { ICON } from './minimap.js';
import { GOODS } from '../data/goods.js';
import { VEHICLES, BAGS } from '../data/balance.js';

// Loại địa điểm mặc định có biểu tượng nổi (places.json → pin: true / false để bật / tắt riêng từng chỗ trong ?editor)
export const PIN_KINDS = new Set(['gas', 'garage', 'charger', 'swap', 'office', 'shop', 'taphoa', 'market', 'police', 'home']);
const COLOR = { gas: '#e74c3c', garage: '#e74c3c', charger: '#16a085', swap: '#16a085', office: '#00b14f', shop: '#2e86de', taphoa: '#8e44ad', market: '#8e44ad', police: '#2c3e50', home: '#7f8c8d' };

// Địa điểm này có biểu tượng nổi không: pin true / false (chủ game chọn) > tự động (loại quan trọng, bán túi / xe / mũ cho khách)
export function shouldPin(p) {
  if (!p?.door) return false;
  if (p.pin === true || p.pin === false) return p.pin;
  if (PIN_KINDS.has(p.kind)) return true;
  const s = p.sells || {};
  return !!(s.bags?.length || s.vehicles?.length || (s.goods || []).some((id) => GOODS[id]?.effects?.passengerSeat));
}

// Làm được gì ở đây: { icon, color, title, short, lines: [chữ], how }
export function placeInfo(p) {
  const lines = [];
  if (has(`pin.kind.${p.kind}`)) lines.push(fmt(`pin.kind.${p.kind}`)); // việc riêng của loại chỗ (đổ xăng, sửa xe…)
  const s = p.sells || {};
  // món mở thêm loại đơn xếp lên đầu (mũ cho khách → đơn chở khách · túi giữ lạnh → đơn kem, trà sữa), rồi tới món khác
  const top = [], rest = [];
  for (const id of s.goods || []) {
    const g = GOODS[id];
    if (!g) continue;
    if (g.effects?.passengerSeat) top.push(`${g.icon || '•'} ${g.name} — ${fmt('pin.forRide')}`);
    else rest.push(`${g.icon || '•'} ${g.name}`);
  }
  for (const id of s.bags || []) {
    const b = BAGS[id];
    if (!b) continue;
    if (b.insulation >= 0.5) top.push(`🎒 ${b.name} — ${fmt('pin.forCold')}`);
    else rest.push(`🎒 ${b.name} — ${fmt('pin.forMore')}`);
  }
  lines.push(...top, ...rest);
  const veh = (s.vehicles || []).map((id) => VEHICLES[id]?.name).filter(Boolean);
  if (veh.length) lines.push(fmt('pin.vehicles', { list: veh.slice(0, 3).join(', ') }));
  for (const a of p.activities || []) if (a?.label) lines.push(`✨ ${a.label}`);
  const MAX = 4;
  const shown = lines.length > MAX ? [...lines.slice(0, MAX - 1), fmt('pin.more', { n: lines.length - (MAX - 1) })] : lines;
  const bike = ['gas', 'charger', 'swap', 'garage'].includes(p.kind);
  return { icon: p.icon || ICON[p.kind] || '📍', color: COLOR[p.kind] || '#2e86de', title: p.name, short: p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name, lines: shown, how: fmt(bike ? 'pin.howBike' : 'pin.howFoot') };
}

export class PlacePins {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'placePins';
    root.appendChild(this.el);
    this.map = new Map(); // mã địa điểm → { el, key }
  }
  // list: [{ id, x, y (điểm ảnh), info, isNew, small, open }] — không có trong list thì gỡ
  update(list) {
    const keep = new Set(list.map((q) => q.id));
    for (const [id, r] of this.map) if (!keep.has(id)) { r.el.remove(); this.map.delete(id); }
    for (const q of list) {
      let r = this.map.get(q.id);
      if (!r) {
        r = { el: document.createElement('div'), key: '' };
        this.el.appendChild(r.el);
        this.map.set(q.id, r);
      }
      const key = `${q.open}|${q.isNew}|${q.small}`;
      if (key !== r.key) this.draw(r, q, key);
      r.el.style.left = `${Math.round(q.x)}px`;
      r.el.style.top = `${Math.round(q.y)}px`;
    }
  }
  draw(r, q, key) {
    r.key = key;
    const { info } = q;
    const e = r.el;
    e.className = `pp${q.open ? ' open' : ''}${q.isNew ? ' new' : ''}${q.small ? ' small' : ''}`;
    e.style.setProperty('--c', info.color);
    e.textContent = '';
    const mk = (tag, cls, txt, parent = e) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; parent.appendChild(x); return x; };
    if (q.open) { // bong bóng: tên + làm được gì + cách làm
      const b = mk('div', 'pp-pop');
      const h = mk('b', 'pp-t', `${info.icon} ${info.title}`, b);
      if (q.isNew) mk('span', 'pp-new', fmt('pin.new'), h);
      const ul = mk('ul', '', null, b);
      for (const l of info.lines) mk('li', '', l, ul);
      mk('small', 'pp-how', info.how, b);
      return;
    }
    const ic = mk('div', 'pp-ic', info.icon);
    if (q.isNew) mk('span', 'pp-new', fmt('pin.new'), ic);
    if (!q.small) mk('div', 'pp-nm', info.short);
  }
  clear() {
    this.update([]);
  }
}
