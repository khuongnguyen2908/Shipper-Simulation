// HUD: giờ, tiền, điểm, thanh năng lượng, mục tiêu, mũi tên chỉ đường, hàng đang chở, thông báo.
import { MiniMap } from './minimap.js';
import { fmtK } from '../sim/economy.js';
import { fmt } from '../content/index.js';

const $ = (root, sel) => root.querySelector(sel);

export class Hud {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div class="hud-tl panel">
        <div class="r1"><b id="hTime">06:00</b><span id="hDay">Ngày 1</span><span id="hWeather">☀️</span></div>
        <div class="r2"><span>💰 <b id="hMoney"></b></span><span>⭐ <b id="hRating"></b></span></div>
        <div class="bar"><label>${fmt('hud.phys')}</label><div class="track"><div id="bPhys" class="fill phys"></div></div></div>
        <div class="bar"><label>${fmt('hud.mental')}</label><div class="track"><div id="bMental" class="fill mental"></div></div></div>
        <div class="bar"><label>${fmt('hud.fuel')}</label><div class="track"><div id="bFuel" class="fill fuel"></div></div></div>
        <div class="bar"><label>${fmt('hud.hp')}</label><div class="track"><div id="bHp" class="fill hp"></div></div></div>
      </div>
      <div class="hud-goal"><div id="gArrow" class="g-arrow">▲</div><div><div id="gText"></div><div id="gSub"></div></div></div>
      <div class="hud-obj panel"><div class="ttl">${fmt('hud.objectives')}</div><ul id="objList"></ul></div>
      <div class="hud-br"><canvas id="minimap" width="210" height="210"></canvas></div>
      <div id="cargo" class="panel hidden"></div>
      <div class="hud-bl"><div id="prompt"></div><div id="speedo"></div></div>
      <div class="hud-keys">${fmt('hud.keys')}</div>
      <div id="toasts"></div>
      <div id="vignette"></div>`;
    root.appendChild(this.el);
    this.mini = new MiniMap($(this.el, '#minimap'));
    this.cache = {};
  }

  set(id, html) {
    if (this.cache[id] === html) return;
    this.cache[id] = html;
    $(this.el, '#' + id).innerHTML = html;
  }

  bar(id, v) {
    const k = id + '%';
    const s = Math.max(0, Math.min(100, v)).toFixed(0);
    if (this.cache[k] === s) return;
    this.cache[k] = s;
    const e = $(this.el, '#' + id);
    e.style.width = s + '%';
    e.classList.toggle('low', v < 25);
  }

  // d: ảnh chụp trạng thái từ game mỗi khung hình
  update(d) {
    this.set('hTime', d.time);
    this.set('hDay', fmt('hud.day', { day: d.day }));
    this.set('hWeather', d.weather);
    this.set('hMoney', fmtK(d.money));
    this.set('hRating', d.rating.toFixed(2));
    this.bar('bPhys', d.phys);
    this.bar('bMental', d.mental);
    this.bar('bFuel', (d.fuel / d.tank) * 100);
    this.bar('bHp', d.hp);
    this.set('objList', d.objectives.map((o) => `<li class="${o.done ? 'done' : ''}${o.optional ? ' opt' : ''}${o.current ? ' cur' : ''}">${o.done ? '✔' : o.optional ? '◇' : '○'} ${o.optional ? fmt('obj.optionalPrefix') : ''}${o.text}</li>`).join(''));
    this.set('gText', d.goal ? d.goal.text : '');
    this.set('gSub', d.goal ? d.goal.sub || '' : '');
    const arrow = $(this.el, '#gArrow');
    if (d.goal && d.goal.angle != null) {
      arrow.style.display = 'block';
      arrow.style.transform = `rotate(${d.goal.angle}rad)`;
      arrow.style.color = d.goal.color || '#f39c12';
    } else arrow.style.display = 'none';
    this.set('prompt', d.prompts.map((p) => `<div class="pr${p.disabled ? ' dis' : ''}"><kbd>${p.key}</kbd> ${p.label}</div>`).join(''));
    this.set('speedo', d.speedo);
    const cargo = $(this.el, '#cargo');
    if (d.cargo && d.cargo.length) {
      cargo.classList.remove('hidden');
      this.set('cargo', `<div class="ttl">${fmt('hud.cargo', { left: d.timeLeft })}</div>` + d.cargo.map((c) => `<div class="cg"><span>${c.icon} ${c.name}</span><span class="cg-s">${c.status}</span><div class="track"><div class="fill ${c.cond > 70 ? 'ok' : c.cond > 40 ? 'mid' : 'bad'}" style="width:${c.cond.toFixed(0)}%"></div></div></div>`).join(''));
    } else cargo.classList.add('hidden');
    $(this.el, '#vignette').style.opacity = d.vignette.toFixed(2);
    this.mini.draw(d.map);
  }

  toast(text, kind = 'info', ms = 4200) {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = text;
    const box = $(this.el, '#toasts');
    box.appendChild(t);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 500);
  }

  show(v) {
    this.el.style.display = v ? '' : 'none';
  }
}
