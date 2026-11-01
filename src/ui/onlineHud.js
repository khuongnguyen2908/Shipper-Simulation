// =============================================================
// GIAO DIỆN ONLINE: ô trạng thái mạng (giữa trên) · danh sách người online (giữ phím O) · thanh tiến độ
// (Online không tua giờ: việc tốn thời gian chạy thanh này, đồng hồ thành phố vẫn chạy).
// Chữ người chơi gõ (tên) gán bằng textContent — không chèn HTML.
// =============================================================
import { fmt } from '../content/index.js';
import { BRANDS } from '../data/apps.js';

const el = (tag, cls, parent) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
};
const fmtDist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

export class OnlineHud {
  constructor(root) {
    this.chip = el('div', 'net-chip hidden', root);
    this.chip.id = 'netChip';
    this.who = el('div', 'net-who hidden', root);
    this.bar = el('div', 'net-busy hidden', root);
    this.bar.innerHTML = '<div class="nb-t"><b></b><span></span></div><div class="nb-bar"><i></i></div><div class="nb-s"><span></span><span class="nb-k"></span></div>';
  }
  show(on) {
    this.chip.classList.toggle('hidden', !on);
    if (!on) {
      this.who.classList.add('hidden');
      this.bar.classList.add('hidden');
    }
  }
  // net: { up, n, rtt }
  setNet({ up, n, rtt }) {
    const cls = !up ? 'down' : rtt > 150 ? 'slow' : 'ok';
    const text = up ? fmt('online.chip', { n, ms: Math.round(rtt) }) : fmt('online.chipDown');
    const key = `${cls}|${text}`;
    if (key === this.chipKey) return;
    this.chipKey = key;
    this.chip.className = `net-chip ${cls}`;
    this.chip.textContent = text;
  }
  // rows: [{ me, name, plate, brand, veh, rating, act, dist }]
  setWho(open, rows = [], info = {}) {
    this.who.classList.toggle('hidden', !open);
    if (!open) return;
    this.who.textContent = '';
    const h = el('h3', '', this.who);
    h.textContent = fmt('online.whoTitle');
    const sub = el('span', '', h);
    sub.textContent = fmt('online.whoSub', info);
    const tb = el('table', '', this.who);
    const head = el('tr', '', tb);
    for (const k of ['name', 'plate', 'brand', 'rating', 'act', 'dist']) el('th', '', head).textContent = fmt(`online.col.${k}`);
    for (const r of rows) {
      const tr = el('tr', r.me ? 'me' : '', tb);
      const n = el('td', '', tr);
      el('b', '', n).textContent = r.name;
      if (r.me) n.append(` ${fmt('online.you')}`);
      el('td', '', tr).textContent = r.plate || '—';
      const b = el('td', '', tr);
      const br = BRANDS[r.brand];
      if (br) el('i', 'hb', b).style.background = br.color;
      b.append(`${br ? br.name : '—'} · ${r.veh || '—'}`);
      el('td', '', tr).textContent = Number(r.rating ?? 5).toFixed(2).replace('.', ',');
      const a = el('td', '', tr);
      el('span', `st ${r.act}`, a).textContent = fmt(`online.act.${r.act}`);
      el('td', '', tr).textContent = r.me ? '—' : fmtDist(r.dist);
    }
    el('div', 'ft', this.who).textContent = fmt('online.whoFoot');
  }
  // busy: { label, left (giây thật còn lại), frac (0..1), sub, key } · null = ẩn
  setBusy(b) {
    this.bar.classList.toggle('hidden', !b);
    if (!b) return;
    this.bar.classList.toggle('sleep', !!b.sleep);
    const [t, s] = [this.bar.querySelector('.nb-t'), this.bar.querySelector('.nb-s')];
    t.firstChild.textContent = b.label;
    const m = Math.floor(b.left / 60), sec = Math.ceil(b.left % 60);
    t.lastChild.textContent = fmt('online.left', { t: `${m}:${String(sec === 60 ? 59 : sec).padStart(2, '0')}` });
    this.bar.querySelector('.nb-bar i').style.width = `${Math.round(Math.max(0, Math.min(1, b.frac)) * 100)}%`;
    s.firstChild.textContent = b.sub || '';
    s.lastChild.textContent = b.key || '';
  }
}
