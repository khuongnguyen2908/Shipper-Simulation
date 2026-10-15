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
        <div class="r-dist" id="hDistrict"></div>
        <div class="r2"><span>💰 <b id="hMoney"></b></span><span id="rRating">⭐ <b id="hRating"></b></span></div>
        <div class="bar"><label>${fmt('hud.phys')}</label><div class="track"><div id="bPhys" class="fill phys"></div></div></div>
        <div class="bar"><label>${fmt('hud.mental')}</label><div class="track"><div id="bMental" class="fill mental"></div></div></div>
        <div class="bar" id="rFuel"><label id="lFuel">${fmt('hud.fuel')}</label><div class="track"><div id="bFuel" class="fill fuel"></div></div></div>
        <div class="bar"><label>${fmt('hud.hp')}</label><div class="track"><div id="bHp" class="fill hp"></div></div></div>
      </div>
      <div class="hud-goal"><div id="gArrow" class="g-arrow">▲</div><div><div id="gText"></div><div id="gSub"></div></div></div>
      <div class="hud-obj panel"><div class="ttl">${fmt('hud.objectives')}</div><ul id="objList"></ul></div>
      <div class="hud-br"><div id="mmChip"></div><canvas id="minimap" width="210" height="210"></canvas><div id="mmStreet"></div></div>
      <button id="phoneIcon" class="pi" title="${fmt('phone.iconHint')}"><span class="pi-wave"></span><span class="pi-wave w2"></span><span class="pi-body"><span class="pi-screen" id="piScreen"></span></span><span class="pi-badge hidden" id="piBadge"></span><span class="pi-key">${fmt('phone.iconHint')}</span></button>
      <div id="phoneNote" class="hidden"></div>
      <div id="cargo" class="panel hidden"></div>
      <div class="hud-bl"><div id="prompt"></div><div id="speedo"></div></div>
      <div class="hud-keys">${fmt('hud.keys')}</div>
      <div id="toasts"></div>
      <div id="vignette"></div>`;
    root.appendChild(this.el);
    this.mini = new MiniMap($(this.el, '#minimap'));
    this.cache = {};
    // hình điện thoại cạnh bản đồ: bấm vào = mở máy (như phím Tab); không cho cú bấm xoay camera
    this.onPhone = null;
    this.pi = $(this.el, '#phoneIcon');
    this.pi.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.pi.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onPhone?.();
    });
  }

  // Hình điện thoại nhỏ. p: { hidden (máy to đang mở), st: 'idle' | 'msg' | 'offer' | 'story', time, unread, from, pay, left (0–1, null = không hết hạn) }
  phoneIcon(p) {
    const pi = this.pi;
    pi.classList.toggle('hidden', !!p.hidden);
    if (p.hidden) return;
    for (const s of ['idle', 'msg', 'offer', 'story']) pi.classList.toggle(s, p.st === s);
    pi.classList.toggle('ringing', p.st === 'offer' || p.st === 'story');
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const time = `<span class="pi-time">${p.time}</span>`;
    let html = `${time}<span class="pi-dots">${['#00b14f', '#5dade2', '#f39c12', '#9b59b6', '#e74c3c', '#95a5a6'].map((c) => `<i style="background:${c}"></i>`).join('')}</span>`;
    if (p.st === 'msg') html = `${time}<span class="pi-big">💬</span><span class="pi-line">${esc(p.from)}</span>`;
    if (p.st === 'offer' || p.st === 'story') html = `${time}<span class="pi-big">${p.kind === 'ride' ? '🧍' : '🛵'}</span><span class="pi-line">${esc(p.pay)}</span>`
      + (p.left == null ? '' : `<span class="pi-timer"><b style="width:${Math.round(Math.max(0, Math.min(1, p.left)) * 100)}%"></b></span>`);
    this.set('piScreen', html);
    const badge = $(this.el, '#piBadge');
    const b = p.st === 'offer' || p.st === 'story' ? '🔔' : p.unread ? String(Math.min(99, p.unread)) : '';
    if (this.cache.piBadge !== b) {
      this.cache.piBadge = b;
      badge.textContent = b;
      badge.classList.toggle('hidden', !b);
      badge.classList.toggle('bell', b === '🔔');
    }
  }
  // Tin mới: máy rung 3 cái
  buzzPhone() {
    const pi = this.pi;
    pi.classList.remove('buzz');
    void pi.offsetWidth; // chạy lại hiệu ứng
    pi.classList.add('buzz');
  }
  // Bong bóng xem trước tin nhắn cạnh máy (3 giây)
  phonePreview(name, text, ms = 3000) {
    const el = $(this.el, '#phoneNote');
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    el.innerHTML = `<b>${esc(name)}:</b> ${esc(text)}`;
    el.classList.remove('hidden');
    clearTimeout(this.noteT);
    this.noteT = setTimeout(() => el.classList.add('hidden'), ms);
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
    this.set('hDistrict', d.district ? fmt('hud.district', { name: d.district }) : '');
    this.set('hMoney', fmtK(d.money));
    // điểm đánh giá: chỉ có khi đã vào hãng (rating = null → ẩn)
    $(this.el, '#rRating').style.display = d.rating == null ? 'none' : '';
    if (d.rating != null) this.set('hRating', d.rating.toFixed(2));
    this.bar('bPhys', d.phys);
    this.bar('bMental', d.mental);
    // thanh năng lượng theo loại xe: xăng · pin (xe điện) · ẩn (xe đạp)
    const pedal = d.power === 'pedal';
    if (this.cache.power !== d.power) {
      this.cache.power = d.power;
      $(this.el, '#rFuel').style.display = pedal ? 'none' : '';
      $(this.el, '#lFuel').textContent = fmt(d.power === 'electric' ? 'hud.battery' : 'hud.fuel');
    }
    if (!pedal) this.bar('bFuel', d.tank > 0 ? (d.fuel / d.tank) * 100 : 0);
    this.bar('bHp', d.hp);
    $(this.el, '.hud-obj').style.display = d.objectives.length ? '' : 'none'; // không còn mục nào → ẩn cả bảng
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
    if (d.round) {
      this.set('mmChip', d.round.chip);
      $(this.el, '#mmChip').style.visibility = d.round.chip ? '' : 'hidden';
      this.set('mmStreet', d.round.street);
      this.mini.drawRound(d.round.draw);
    }
  }

  // Thông báo nhỏ: mỗi lúc hiện tối đa 2 cái, cái mới hơn xếp hàng chờ (khỏi dồn 3–4 thông báo một lượt).
  // Trùng chữ với cái đang hiện / đang chờ thì bỏ qua.
  toast(text, kind = 'info', ms = 4200) {
    this.toastQ ||= [];
    const box = $(this.el, '#toasts');
    if ([...box.children].some((c) => c.dataset.text === text) || this.toastQ.some((q) => q.text === text)) return;
    this.toastQ.push({ text, kind, ms });
    this.toastPump();
  }
  toastPump() {
    const box = $(this.el, '#toasts');
    while (this.toastQ.length && [...box.children].filter((c) => !c.classList.contains('out')).length < 2) {
      const { text, kind, ms } = this.toastQ.shift();
      const t = document.createElement('div');
      t.className = `toast ${kind}`;
      t.innerHTML = text;
      t.dataset.text = text;
      box.appendChild(t);
      setTimeout(() => { t.classList.add('out'); this.toastPump(); }, ms);
      setTimeout(() => t.remove(), ms + 500);
    }
  }

  show(v) {
    this.el.style.display = v ? '' : 'none';
  }
}
