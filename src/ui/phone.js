// Điện thoại & ứng dụng giao hàng GoShip (DeliveryAppUI)
// Thẻ: Đơn · Bản đồ · Nhóm · Ví · Tài khoản · Túi đồ. Chữ lấy từ kho chữ phone.*
import { stateLabel, S } from '../sim/OrderManager.js';
import { APP, ORDER_TYPES, RIDER_TYPES } from '../data/apps.js';
import { traitLabel } from '../data/items.js';
import { VEHICLES, BAGS, ORDER } from '../data/balance.js';
import { GOODS } from '../data/goods.js';
import { PLACES } from '../data/places.js';
import { placesUsing } from '../sim/placeRules.js';
import { fmtK } from '../sim/economy.js';
import { dayOf } from '../sim/clock.js';
import { fmt, list, has } from '../content/index.js';
import { MiniMap } from './minimap.js';

const TABS = [
  ['order', '📦', 'phone.tabOrder'],
  ['map', '🗺️', 'phone.tabMap'],
  ['chat', '💬', 'phone.tabChat'],
  ['wallet', '💳', 'phone.tabWallet'],
  ['account', '👤', 'phone.tabAccount'],
  ['bag', '🎒', 'phone.tabBag'],
];

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

// Các bước của đơn (chữ ở phone.stepFood / phone.stepRide, cùng thứ tự)
const FOOD_STEPS = [[S.TO_PICKUP], [S.WAITING_FOOD, S.OUT_OF_STOCK], [S.PACKING], [S.DELIVERING], [S.AT_DROPOFF, S.NO_ANSWER, S.STAIRS]];
const RIDE_STEPS = [[S.TO_PICKUP], [S.DELIVERING], [S.AT_DROPOFF]];
const PARCEL_STEPS = [[S.TO_PICKUP], [S.PACKING], [S.DELIVERING], [S.AT_DROPOFF, S.NO_ANSWER, S.STAIRS], [S.RETURNING]];
const STEPS = { food: [FOOD_STEPS, 'phone.stepFood'], ride: [RIDE_STEPS, 'phone.stepRide'], parcel: [PARCEL_STEPS, 'phone.stepParcel'] };
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

// Nhãn loại đơn / loại khách / thu hộ / phụ phí trên thẻ đơn
function orderTags(o) {
  const tags = [];
  const rider = o.rider && RIDER_TYPES[o.rider];
  if (rider) tags.push(`<span class="tag">${rider.icon || ''} ${rider.name}</span>`);
  if (o.viaApp === false) tags.push(`<span class="tag good">${fmt('phone.regular')}</span>`);
  if (o.booker) tags.push(`<span class="tag">${fmt('phone.booked', { booker: o.booker })}</span>`);
  if (o.cod) tags.push(`<span class="tag warn">${fmt('phone.cod', { cod: o.cod })}</span>`);
  if (o.surcharge) tags.push(`<span class="tag good">${fmt('phone.surcharge', { k: o.surcharge })}</span>`);
  if (o.airportFee) tags.push(`<span class="tag good">${fmt('phone.airportFee', { k: o.airportFee })}</span>`);
  return tags.join('');
}
function offerTitle(o) {
  if (o.kind === 'food' && o.type === 'food') return fmt('phone.offerFood');
  if (o.kind === 'ride' && o.type === 'ride') return fmt('phone.offerRide');
  const t = ORDER_TYPES[o.type] || {};
  return fmt('phone.offerType', { icon: t.icon || '', name: (t.name || o.type).toLowerCase() });
}

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
    else if (this.tab === 'account') html = this.accountTab(d);
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
    else if (online && gs.lockedUntil > d.now) h += `<div class="ph-lock">${fmt('phone.lockedNote', { time: hhmm(gs.lockedUntil) })}</div>`;
    else if (online) {
      h += `<div class="ph-wait"><div class="spinner"></div>${fmt('phone.searching')}</div>`;
      if (d.appClosed) h += `<div class="ph-note">${fmt('phone.noMoreOrders')}</div>`;
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
      <div class="offer-top"><b>${offerTitle(o)}</b><span class="pay">~${fmtK(o.estPay)}</span></div>
      <div class="route"><div>📍 <b>${o.pickup.name}</b><small>${ride ? fmt('phone.pickupRide', { customer: o.customer }) : o.pickup.address}</small></div>
      <div>🏁 <b>${o.revealed ? o.dropoff.address : fmt('phone.vague')}</b><small>${o.customer}${floor}</small></div></div>
      <div class="items">${items.map((i) => `${i.icon} ${i.name}`).join(' · ')}</div>
      <div class="tags">${orderTags(o)}${traits}<span class="tag">📏 ${o.distanceKm.toFixed(1)} km</span>${o.flags.picky ? `<span class="tag warn">${fmt('phone.picky')}</span>` : ''}</div>
      <div class="timer"><div style="width:${(left / ORDER.offerTimeoutSec) * 100}%"></div></div>
      <div class="row"><button class="btn" data-act="decline">${fmt('phone.decline')}</button><button class="btn primary" data-act="accept">${fmt('phone.accept', { sec: Math.ceil(left) })}</button></div>
    </div>`;
  }

  orderCard(o, d) {
    const [steps, stepKey] = STEPS[o.kind] || STEPS.food;
    const names = list(stepKey);
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
      <div class="tags">${orderTags(o)}</div>
      <ul class="steps">${stepHtml}</ul>
      ${items}
      <div class="row"><button class="btn" data-act="call" ${canCall ? '' : 'disabled'}>${fmt('phone.call')}</button><button class="btn danger" data-act="cancel">${fmt('phone.cancel')}</button></div>
      <div class="ph-note small">${fmt('phone.cancelNote', { stars: APP.account.cancelStars })}</div>
    </div>`;
  }

  chatTab(d) {
    return `<div class="chat-title">${fmt('phone.chatTitle', { n: d.chat.length })}</div><div class="chat">` +
      d.chat.slice(-30).reverse().map((m) => `<div class="msg"><div class="from">${m.from} <small>${m.time}</small></div><div>${m.text}</div></div>`).join('') + '</div>';
  }

  walletTab(d) {
    const gs = d.gs;
    // nhãn thu/chi: kho chữ money.*; loại đơn mới tạo trong công cụ chưa có chữ riêng → dùng tên loại đơn
    const label = (k) => (has(`money.${k}`) ? fmt(`money.${k}`) : ORDER_TYPES[k]?.name || k);
    const inc = Object.entries(gs.stats.income).map(([k, v]) => `<div class="kv"><span>${label(k)}</span><b class="plus">+${fmtK(v)}</b></div>`).join('');
    const exp = Object.entries(gs.stats.expense).map(([k, v]) => `<div class="kv"><span>${label(k)}</span><b class="minus">−${fmtK(v)}</b></div>`).join('');
    const rec = d.receipts.slice(-8).reverse().map((r) => `<div class="kv"><span>#${r.order.id} ${r.order.customer} <small class="st">${stars(r.ev.stars)}</small></span><b>${r.ev.refused ? '0k' : fmtK(r.pay.walletCredit)}</b></div>`).join('');
    const none = `<small>${fmt('phone.none')}</small>`;
    return `<div class="card"><div class="big">${fmtK(gs.money)}</div><small>${fmt('phone.rentToday', { rent: gs.rent, day: gs.rentDueDay })}${gs.rentPaid ? fmt('phone.rentPaid') : ''}</small>
      ${gs.fines.length ? `<div class="kv"><span>${fmt(gs.hasOverdueFines ? 'phone.finesLate' : 'phone.fines', { day: dayOf(gs.finesDueAt) })}</span><b class="minus">${fmtK(gs.finesTotal)}</b></div>` : ''}
      <div class="kv"><span>${fmt('phone.rating')}</span><b>⭐ ${gs.rating.toFixed(2)}</b></div><small>${fmt('phone.ratingNote')}</small></div>
      <div class="card"><b>${fmt('phone.income')}</b>${inc || none}<b>${fmt('phone.expense')}</b>${exp || none}</div>
      <div class="card"><b>${fmt('phone.recent')}</b>${rec || `<small>${fmt('phone.noOrders')}</small>`}</div>`;
  }

  // Tài khoản tài xế: điểm, tỉ lệ nhận đơn, tự hủy, bom hàng + luật của app (apps.json → account)
  accountTab(d) {
    const gs = d.gs;
    const acc = APP.account || {};
    const a = gs.account;
    const kv = (l, v, note = '') => `<div class="kv"><span>${l}</span><b>${v}</b></div>${note ? `<small>${note}</small>` : ''}`;
    const locked = gs.lockedUntil > d.now;
    return `<div class="card"><b>${fmt('phone.accTitle')}</b>
      ${kv(fmt('phone.accRating'), `⭐ ${gs.rating.toFixed(2)}`, fmt('phone.accLockAt', { limit: Number(acc.lockBelow).toFixed(1) }))}
      ${kv(fmt('phone.accCompleted'), a.completed)}
      ${kv(fmt('phone.accRides'), a.rides)}
      ${kv(fmt('phone.accAccept', { n: a.recent.length }), `${Math.round(gs.acceptRate * 100)}%`, fmt('phone.accAcceptRule', { pct: Math.round((acc.lowAcceptBelow || 0) * 100) }))}
      ${kv(fmt('phone.accCancels'), `${gs.stats.driverCancels} / ${acc.cancelLimitPerDay}`, fmt('phone.accCancelRule', { n: acc.cancelLimitPerDay, min: acc.cancelLockMin, stars: acc.cancelStars }))}
      ${kv(fmt('phone.accBom'), a.bom)}
      <div class="ph-note">${locked ? fmt('phone.accLocked', { time: hhmm(gs.lockedUntil) }) : fmt('phone.accOk')}</div></div>`;
  }

  bagTab(d) {
    const gs = d.gs;
    const v = gs.vehicleSpec, b = gs.bagSpec;
    const gear = Object.values(GOODS).filter((g) => g.type === 'equipment').map((g) => `<div class="kv"><span>${gs.has(g.id) ? '✔' : '✕'} ${g.icon || ''} ${g.name}</span><small>${g.desc || ''}</small></div>`).join('');
    const cons = Object.entries(gs.consumables).filter(([id, n]) => GOODS[id] && n > 0).map(([id, n]) => {
      const where = GOODS[id].type === 'carry' ? placesUsing(id, PLACES).map((p) => p.short || p.name).join(', ') : '';
      return `<div class="kv"><span>${GOODS[id].icon || ''} ${GOODS[id].name}${where ? ` <small>${fmt('phone.carryWhere', { where })}</small>` : ''}</span><b>×${n}</b></div>`;
    }).join('');
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
      <div class="card"><b>${fmt('phone.equipment')}</b>${gear}</div>
      <div class="card"><b>${fmt('phone.consumables')}</b>${cons || `<small>${fmt('phone.nothing')}</small>`}</div>
      <div class="card"><b>${fmt('phone.items')}</b>${inv}</div>`;
  }
}
