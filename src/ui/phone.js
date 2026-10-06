// Điện thoại & ứng dụng giao hàng GoShip (DeliveryAppUI)
// Thẻ: Đơn · Bản đồ · Nhóm · Ví · Túi đồ. Chữ lấy từ kho chữ phone.*
import { stateLabel, S } from '../sim/OrderManager.js';
import { traitLabel } from '../data/items.js';
import { VEHICLES, BAGS, GEAR, ORDER } from '../data/balance.js';
import { fmtK } from '../sim/economy.js';
import { fmt, list } from '../content/index.js';
import { MiniMap } from './minimap.js';

const TABS = [
  ['order', '📦', 'phone.tabOrder'],
  ['map', '🗺️', 'phone.tabMap'],
  ['chat', '💬', 'phone.tabChat'],
  ['wallet', '💳', 'phone.tabWallet'],
  ['bag', '🎒', 'phone.tabBag'],
];

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

// Các bước của đơn (chữ ở phone.stepFood / phone.stepRide, cùng thứ tự)
const FOOD_STEPS = [[S.TO_PICKUP], [S.WAITING_FOOD, S.OUT_OF_STOCK], [S.PACKING], [S.DELIVERING], [S.AT_DROPOFF, S.NO_ANSWER, S.STAIRS]];
const RIDE_STEPS = [[S.TO_PICKUP], [S.DELIVERING], [S.AT_DROPOFF]];

export class Phone {
  constructor(root, handlers) {
    this.handlers = handlers;
    this.tab = 'order';
    this.open = false;
    this.unread = { chat: 0, order: 0 };
    this.el = document.createElement('div');
    this.el.id = 'phone';
    this.el.className = 'hidden';
    this.el.innerHTML = `
      <div class="ph-notch"></div>
      <div class="ph-top"><span id="phTime"></span><span class="ph-app">${fmt('phone.app')}</span><span>📶 🔋</span></div>
      <div class="ph-body" id="phBody"></div>
      <div class="ph-tabs">${TABS.map(([id, ic, t]) => `<button data-tab="${id}"><span>${ic}</span><small>${fmt(t)}</small><i class="badge" id="badge-${id}"></i></button>`).join('')}</div>`;
    root.appendChild(this.el);
    this.body = this.el.querySelector('#phBody');
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 560;
    this.mapCanvas.height = 560;
    this.map = new MiniMap(this.mapCanvas, { scale: 2, labels: true });
    this.lastHtml = '';
    this.el.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this.tab = tab.dataset.tab;
        this.unread[this.tab] = 0;
        this.lastHtml = '';
        this.handlers.refresh();
        return;
      }
      const act = e.target.closest('[data-act]');
      if (act && !act.disabled) this.handlers.action(act.dataset.act, act.dataset);
    });
    // ngăn click trên điện thoại xoay camera
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.className = this.open ? '' : 'hidden';
    if (this.open) {
      this.unread[this.tab] = 0;
      this.lastHtml = '';
      this.handlers.refresh();
    }
  }

  notify(tab) {
    if (this.open && this.tab === tab) return;
    this.unread[tab] = (this.unread[tab] || 0) + 1;
  }

  // d: { now, timeStr, state, offer, offerTimeLeft, order, gs, chat, receipts, mapData, lockedHints }
  render(d) {
    this.el.querySelector('#phTime').textContent = d.timeStr;
    for (const [id] of TABS) {
      const b = this.el.querySelector(`#badge-${id}`);
      const n = this.unread[id] || 0;
      b.textContent = n ? String(n) : '';
      b.style.display = n ? '' : 'none';
    }
    if (!this.open) return;
    let html = '';
    if (this.tab === 'order') html = this.orderTab(d);
    else if (this.tab === 'chat') html = this.chatTab(d);
    else if (this.tab === 'wallet') html = this.walletTab(d);
    else if (this.tab === 'bag') html = this.bagTab(d);
    else if (this.tab === 'map') html = `<div class="ph-map" id="phMap"></div><div class="ph-legend">${fmt('phone.mapLegend')}</div>`;
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    if (html !== this.lastHtml) {
      this.body.innerHTML = html;
      this.lastHtml = html;
      if (this.tab === 'map') this.body.querySelector('#phMap').appendChild(this.mapCanvas);
    }
    if (this.tab === 'map') this.map.draw(d.mapData);
  }

  orderTab(d) {
    const gs = d.gs;
    const online = d.state !== S.OFFLINE;
    let h = `<div class="ph-head"><div><b>${fmt(online ? 'phone.online' : 'phone.offline')}</b><small>${fmt('phone.summary', { rating: gs.rating.toFixed(2), n: gs.stats.completed })}</small></div>`;
    h += `<button class="btn small ${online ? '' : 'primary'}" data-act="online" ${d.order ? 'disabled' : ''}>${fmt(online ? 'phone.turnOff' : 'phone.turnOn')}</button></div>`;
    if (d.state === S.OFFERED && d.offer) h += this.offerCard(d.offer, d.offerTimeLeft, d);
    else if (d.order) h += this.orderCard(d.order, d);
    else if (online) {
      h += `<div class="ph-wait"><div class="spinner"></div>${fmt('phone.searching')}</div>`;
      if (d.now >= d.lastOfferAt) h += `<div class="ph-note">${fmt('phone.noMoreOrders')}</div>`;
    } else h += `<div class="ph-note">${fmt('phone.offlineNote')}</div>`;
    for (const t of d.lockedHints) h += `<div class="ph-lock">🔒 ${t}</div>`;
    return h;
  }

  offerCard(o, left, d) {
    const items = o.itemIds.map((id) => d.itemDefs[id]);
    const traits = [...new Set(items.flatMap((i) => i.traits))].map((t) => {
      const l = traitLabel(t);
      return `<span class="tag">${l.icon} ${l.text}</span>`;
    }).join('');
    const ride = o.kind === 'ride';
    const floor = o.dropoff.apartment ? fmt('phone.floor', { floor: o.dropoff.floor }) : '';
    return `<div class="card offer">
      <div class="offer-top"><b>${fmt(ride ? 'phone.offerRide' : 'phone.offerFood')}</b><span class="pay">~${fmtK(o.estPay)}</span></div>
      <div class="route"><div>📍 <b>${o.pickup.name}</b><small>${ride ? fmt('phone.pickupRide', { customer: o.customer }) : o.pickup.address}</small></div>
      <div>🏁 <b>${o.revealed ? o.dropoff.address : fmt('phone.vague')}</b><small>${o.customer}${floor}</small></div></div>
      <div class="items">${items.map((i) => `${i.icon} ${i.name}`).join(' · ')}</div>
      <div class="tags">${traits}<span class="tag">📏 ${o.distanceKm.toFixed(1)} km</span>${o.flags.picky ? `<span class="tag warn">${fmt('phone.picky')}</span>` : ''}</div>
      <div class="timer"><div style="width:${(left / ORDER.offerTimeoutSec) * 100}%"></div></div>
      <div class="row"><button class="btn" data-act="decline">${fmt('phone.decline')}</button><button class="btn primary" data-act="accept">${fmt('phone.accept', { sec: Math.ceil(left) })}</button></div>
    </div>`;
  }

  orderCard(o, d) {
    const steps = o.kind === 'ride' ? RIDE_STEPS : FOOD_STEPS;
    const names = list(o.kind === 'ride' ? 'phone.stepRide' : 'phone.stepFood');
    const cur = steps.findIndex((st) => st.includes(d.state));
    const stepHtml = steps.map((_, i) => `<li class="${i < cur ? 'done' : i === cur ? 'cur' : ''}">${i < cur ? '✔' : i === cur ? '➤' : '○'} ${names[i] ?? ''}</li>`).join('');
    const left = Math.round(o.allowedMin - (d.now - o.acceptedAt));
    const items = o.items.length
      ? o.items.map((it) => `<div class="cg"><span>${it.icon} ${it.name}</span><span class="cg-s">${it.statusText()} · ${it.condition.toFixed(0)}%</span><div class="track"><div class="fill ${it.condition > 70 ? 'ok' : it.condition > 40 ? 'mid' : 'bad'}" style="width:${it.condition}%"></div></div></div>`).join('')
      : `<div class="items">${o.itemIds.map((id) => `${d.itemDefs[id].icon} ${d.itemDefs[id].name}`).join(' · ')}</div>`;
    const canCall = d.state === S.NO_ANSWER || d.state === S.TO_PICKUP || d.state === S.DELIVERING;
    const floor = o.dropoff.apartment ? fmt('phone.floor', { floor: o.dropoff.floor }) : '';
    return `<div class="card">
      <div class="offer-top"><b>#${o.id} · ${stateLabel(d.state)}</b><span class="${left < 0 ? 'late' : 'pay'}">${left >= 0 ? fmt('phone.left', { min: left }) : fmt('phone.late', { min: -left })}</span></div>
      <div class="route"><div>📍 <b>${o.pickup.name}</b></div><div>🏁 <b>${o.revealed ? o.dropoff.address : fmt('phone.unknownAddr')}</b><small>${o.customer}${floor}</small></div></div>
      <ul class="steps">${stepHtml}</ul>
      ${items}
      <div class="row"><button class="btn" data-act="call" ${canCall ? '' : 'disabled'}>${fmt('phone.call')}</button><button class="btn danger" data-act="cancel">${fmt('phone.cancel')}</button></div>
      <div class="ph-note small">${fmt('phone.cancelNote')}</div>
    </div>`;
  }

  chatTab(d) {
    return `<div class="chat-title">${fmt('phone.chatTitle', { n: d.chat.length })}</div><div class="chat">` +
      d.chat.slice(-30).reverse().map((m) => `<div class="msg"><div class="from">${m.from} <small>${m.time}</small></div><div>${m.text}</div></div>`).join('') + '</div>';
  }

  walletTab(d) {
    const gs = d.gs;
    const inc = Object.entries(gs.stats.income).map(([k, v]) => `<div class="kv"><span>${fmt(`money.${k}`)}</span><b class="plus">+${fmtK(v)}</b></div>`).join('');
    const exp = Object.entries(gs.stats.expense).map(([k, v]) => `<div class="kv"><span>${fmt(`money.${k}`)}</span><b class="minus">−${fmtK(v)}</b></div>`).join('');
    const rec = d.receipts.slice(-8).reverse().map((r) => `<div class="kv"><span>#${r.order.id} ${r.order.customer} <small class="st">${stars(r.ev.stars)}</small></span><b>${r.ev.refused ? '0k' : fmtK(r.pay.walletCredit)}</b></div>`).join('');
    const none = `<small>${fmt('phone.none')}</small>`;
    return `<div class="card"><div class="big">${fmtK(gs.money)}</div><small>${fmt('phone.rentToday', { rent: gs.rent })}${gs.rentPaid ? fmt('phone.rentPaid') : ''}</small>
      <div class="kv"><span>${fmt('phone.rating')}</span><b>⭐ ${gs.rating.toFixed(2)}</b></div><small>${fmt('phone.ratingNote')}</small></div>
      <div class="card"><b>${fmt('phone.income')}</b>${inc || none}<b>${fmt('phone.expense')}</b>${exp || none}</div>
      <div class="card"><b>${fmt('phone.recent')}</b>${rec || `<small>${fmt('phone.noOrders')}</small>`}</div>`;
  }

  bagTab(d) {
    const gs = d.gs;
    const v = VEHICLES[gs.vehicle], b = BAGS[gs.bag];
    const gear = Object.values(GEAR).map((g) => `<div class="kv"><span>${gs.has(g.id) ? '✔' : '✕'} ${g.name}</span><small>${g.desc}</small></div>`).join('');
    const inv = gs.inventory.length
      ? gs.inventory.map((id) => (id === 'wallet' ? `<div class="kv"><span>${fmt('phone.walletItem')}</span><button class="btn small" data-act="wallet">${fmt('phone.view')}</button></div>` : '')).join('')
      : `<small>${fmt('phone.nothing')}</small>`;
    const kv = (l, val) => `<div class="kv"><span>${l}</span><b>${val}</b></div>`;
    return `<div class="card"><b>🛵 ${v.name}</b><small>${v.desc}</small>
      ${kv(fmt('phone.maxSpeed'), `${Math.round(v.maxSpeed * 3.6)} km/h`)}
      ${kv(fmt('phone.suspension'), `${Math.round(v.suspension * 100)}%`)}
      ${kv(fmt('phone.fuel'), `${gs.fuel.toFixed(2)} / ${v.tank} L`)}
      ${kv(fmt('phone.bikeHp'), `${gs.bikeHp.toFixed(0)}%`)}</div>
      <div class="card"><b>👜 ${b.name}</b><small>${b.desc}</small>
      ${kv(fmt('phone.bagStats'), `${Math.round(b.insulation * 100)}% · ${Math.round(b.waterproof * 100)}% · ${Math.round(b.padding * 100)}%`)}
      ${kv(fmt('phone.slots'), `${b.cols}×${b.rows}`)}</div>
      <div class="card"><b>${fmt('phone.gear')}</b>${gear}</div>
      <div class="card"><b>${fmt('phone.items')}</b>${inv}</div>`;
  }
}
