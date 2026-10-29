// =============================================================
// GIAO DIỆN ĐÁNH NHAU (góc nhìn thứ 1, chương 6) — theo phác thảo sketches/chuong6/combat-fps.png
// Máu mình + máu anh Đạt (góc trái) · máu tên đang nhắm (giữa trên) · mục tiêu + số tên còn lại (góc phải) ·
// tâm ngắm + vòng chờ vung + nấc đỡ · món đang cầm (góc phải dưới) · thanh máu trên đầu từng người · số máu bay lên ·
// loé đỏ mép màn hình phía bị đánh · gợi ý phím. Mọi chữ qua fmt().
// =============================================================
import { fmt } from '../content/index.js';

const h = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

export class FightHud {
  constructor(root = document.body) {
    this.el = h('div', 'fh hidden');
    this.el.id = 'fightHud';
    this.el.innerHTML = `
      <div class="fh-bars fh-panel">
        <div class="fh-row"><label>${fmt('hud.fight.me')}</label><div class="fh-track"><div class="fh-fill me"></div></div><span class="fh-num me"></span></div>
        <div class="fh-row ally"><label class="aname"></label><div class="fh-track"><div class="fh-fill ally"></div></div><span class="fh-num ally"></span></div>
      </div>
      <div class="fh-boss fh-panel"><div class="bh"><span class="bname"></span><span class="bph"></span></div><div class="fh-track"><div class="fh-fill"></div></div></div>
      <div class="fh-target fh-panel"><span class="tname"></span><div class="fh-track"><div class="fh-fill foe"></div></div></div>
      <div class="fh-goal fh-panel"><div class="gtext"></div><b class="gleft"></b></div>
      <svg class="fh-xh" width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="24" fill="none" stroke="#ffffff30" stroke-width="5"/>
        <circle class="cdring" cx="60" cy="60" r="24" fill="none" stroke="#ffd54a" stroke-width="5" stroke-dasharray="150.8" stroke-dashoffset="0" transform="rotate(-90 60 60)" stroke-linecap="round"/>
        <circle cx="60" cy="60" r="2.6" fill="#fff"/>
        <g class="pips"></g>
      </svg>
      <div class="fh-wpn fh-panel"><div class="wname"></div><div class="wpips"></div></div>
      <div class="fh-keys fh-panel">${fmt('hud.fight.keys')}</div>
      <div class="fh-tags"></div>
      <div class="fh-floats"></div>
      ${['l', 'r', 't', 'b'].map((s) => `<div class="fh-edge ${s}"></div>`).join('')}`;
    root.append(this.el);
    const q = (s) => this.el.querySelector(s);
    this.$ = { meFill: q('.fh-fill.me'), meNum: q('.fh-num.me'), allyRow: q('.fh-row.ally'), allyName: q('.aname'), allyFill: q('.fh-fill.ally'), allyNum: q('.fh-num.ally'),
      boss: q('.fh-boss'), bname: q('.bname'), bph: q('.bph'), btrack: q('.fh-boss .fh-track'), bfill: q('.fh-boss .fh-fill'),
      target: q('.fh-target'), tname: q('.tname'), tfill: q('.fh-fill.foe'), goal: q('.fh-goal'), gtext: q('.gtext'), gleft: q('.gleft'), xh: q('.fh-xh'), cd: q('.cdring'), pips: q('.pips'),
      wpn: q('.fh-wpn'), wname: q('.wname'), wpips: q('.wpips'), keys: q('.fh-keys'), tags: q('.fh-tags'), floats: q('.fh-floats'), edges: Object.fromEntries(['l', 'r', 't', 'b'].map((s) => [s, q(`.fh-edge.${s}`)])) };
    this.tagEls = new Map();
    this.on = false;
  }
  // mode: 'off' · 'fpv' (chỉ tâm ngắm + món đang cầm — lúc lén đi) · 'fight' (đủ hết)
  show(mode) {
    this.el.className = `fh ${mode === 'off' ? 'hidden' : mode}`;
    this.on = mode !== 'off';
    if (!this.on) { for (const e of this.tagEls.values()) e.remove(); this.tagEls.clear(); }
  }
  // d: { me: {hp, max}, ally: {name, hp, max} | null, target: {name, hp, max} | null, boss: {name, phase, n, hp, max, marks: [0.65, 0.3]} | null, goal, left, cd (0..1, 1 = vung được), pips: {n, max},
  //      blocking, weapon: {icon, name, dur, max, throw}, tags: [{id, x, y, hp, max, name, lock, ally}] }
  update(d) {
    if (!this.on) return;
    const $ = this.$, pct = (a, b) => `${Math.max(0, Math.min(100, (a / (b || 1)) * 100))}%`;
    $.meFill.style.width = pct(d.me.hp, d.me.max);
    $.meNum.textContent = `${Math.ceil(d.me.hp)}/${d.me.max}`;
    $.allyRow.style.display = d.ally ? '' : 'none';
    if (d.ally) { $.allyName.textContent = d.ally.name; $.allyFill.style.width = pct(d.ally.hp, d.ally.max); $.allyNum.textContent = `${Math.ceil(d.ally.hp)}/${d.ally.max}`; }
    // boss nhiều giai đoạn: tên + giai đoạn đang đánh + máu, vạch trắng ở mốc đổi giai đoạn
    $.boss.style.display = d.boss ? '' : 'none';
    this.el.classList.toggle('has-boss', !!d.boss);
    if (d.boss) {
      $.bname.textContent = d.boss.name;
      $.bph.textContent = d.boss.phase;
      $.bph.className = `bph p${d.boss.n}`;
      $.bfill.style.width = pct(d.boss.hp, d.boss.max);
      const key = d.boss.marks.join(',');
      if ($.btrack.dataset.marks !== key) {
        $.btrack.dataset.marks = key;
        $.btrack.querySelectorAll('.bmark').forEach((e) => e.remove());
        for (const m of d.boss.marks) { const e = h('i', 'bmark'); e.style.left = `${m * 100}%`; $.btrack.append(e); }
      }
    }
    $.target.style.display = d.target ? '' : 'none';
    if (d.target) { $.tname.textContent = fmt('hud.fight.target', { name: d.target.name }); $.tfill.style.width = pct(d.target.hp, d.target.max); }
    $.goal.style.display = d.goal ? '' : 'none';
    if (d.goal) { $.gtext.textContent = d.goal; $.gleft.textContent = d.left > 0 ? fmt('story.fight.left', { n: d.left }) : ''; }
    $.cd.style.strokeDashoffset = String(150.8 * (1 - Math.max(0, Math.min(1, d.cd))));
    $.xh.classList.toggle('ready', d.cd >= 1);
    // nấc đỡ: dưới tâm ngắm
    const n = d.pips?.max || 0;
    if ($.pips.childElementCount !== n) $.pips.innerHTML = Array.from({ length: n }, (_, i) => `<rect x="${60 - n * 8.5 + i * 17 + 2}" y="96" width="13" height="6" rx="2"/>`).join('');
    [...$.pips.children].forEach((r, i) => r.setAttribute('class', i < d.pips.n ? 'on' : ''));
    $.xh.classList.toggle('blocking', !!d.blocking);
    // món đang cầm
    $.wname.textContent = fmt(d.weapon.throw ? 'hud.fight.throw' : 'hud.fight.weapon', { icon: d.weapon.icon || '', name: d.weapon.name });
    const m = d.weapon.max || 0;
    $.wpips.style.display = m > 1 ? '' : 'none';
    if (m > 1 && $.wpips.childElementCount !== m) $.wpips.innerHTML = '<i></i>'.repeat(m);
    if (m > 1) [...$.wpips.children].forEach((e, i) => e.classList.toggle('off', i >= d.weapon.dur));
    // thanh máu trên đầu (toạ độ màn hình đã tính sẵn)
    const seen = new Set();
    for (const t of d.tags || []) {
      seen.add(t.id);
      let e = this.tagEls.get(t.id);
      if (!e) { e = h('div', 'fh-tag', '<span></span><div class="fh-track"><div class="fh-fill"></div></div>'); $.tags.append(e); this.tagEls.set(t.id, e); }
      e.style.transform = `translate(${t.x - 34}px, ${t.y - 22}px)`;
      e.className = `fh-tag${t.lock ? ' lock' : ''}${t.ally ? ' ally' : ''}`;
      e.firstChild.textContent = t.name;
      e.lastChild.firstChild.style.width = pct(t.hp, t.max);
    }
    for (const [id, e] of this.tagEls) if (!seen.has(id)) { e.remove(); this.tagEls.delete(id); }
  }
  // số / chữ bay lên ở chỗ (x, y) màn hình: kind 'dmg' | 'block' | 'big'
  float(text, x, y, kind = 'dmg') {
    const e = h('div', `fh-float ${kind}`);
    e.textContent = text;
    e.style.left = `${x}px`;
    e.style.top = `${y}px`;
    this.$.floats.append(e);
    setTimeout(() => e.remove(), 900);
  }
  // loé đỏ mép màn hình phía bị đánh: side 'l' | 'r' | 't' (trước mặt) | 'b' (sau lưng)
  flash(side) {
    const e = this.$.edges[side];
    if (!e) return;
    e.classList.remove('on');
    void e.offsetWidth;
    e.classList.add('on');
  }
}
