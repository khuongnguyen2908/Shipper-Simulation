// Điện thoại kiểu thật: màn hình chính có các app, bấm app mở to cả máy (‹ quay lại), thông báo trượt xuống.
// App: GoShip (nhận / chạy đơn) · Bản đồ (cityMap.js) · Tin nhắn · Ví · Hồ sơ · Túi đồ · CSGT (phạt nguội, chốt đã biết). Chữ lấy từ kho chữ phone.*
// Phím khi mở điện thoại: 1–7 mở app · Esc về màn hình chính (đang ở màn hình chính thì cất máy).
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
import { CityMap } from './cityMap.js';
import { morph } from './morph.js';

// [mã app, biểu tượng, màu, khóa chữ tên app]
export const APPS = [
  ['goship', '🛵', '#00b14f', 'phone.app'],
  ['map', '🗺️', '#2e86de', 'phone.tabMap'],
  ['chat', '💬', '#5dade2', 'phone.appChat'],
  ['wallet', '💳', '#8e44ad', 'phone.tabWallet'],
  ['account', '👤', '#e67e22', 'phone.appProfile'],
  ['bag', '🎒', '#7f8c8d', 'phone.tabBag'],
  ['police', '🚓', '#34495e', 'phone.appPolice'],
];
// lý do biên bản phạt nguội (gs.fines[].reason) → khóa chữ
const FINE_REASON = { parking: 'csgt.rParking', airport: 'csgt.rAirport' };
const APP_BY_ID = Object.fromEntries(APPS.map((a) => [a[0], a]));

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
  // dấu hiệu khách lừa đảo (người chơi tinh ý thì từ chối từ đầu)
  if (o.flags?.scam) tags.push(`<span class="tag warn">${fmt('phone.scamNew')}</span>`, `<span class="tag warn">${fmt('phone.scamCash')}</span>`);
  if (rider?.luggage) tags.push(`<span class="tag">${fmt('phone.luggage')}</span>`);
  if (rider?.foreign) tags.push(`<span class="tag">${fmt('phone.foreign')}</span>`);
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
    this.app = null; // null = màn hình chính
    this.lastApp = null; // cất máy khi đang trong app → mở lại vào đúng app đó
    this.open = false;
    this.unread = { goship: 0, chat: 0, police: 0 };
    this.el = document.createElement('div');
    this.el.id = 'phone';
    this.el.className = 'hidden';
    this.el.innerHTML = `
      <div class="ph-notch"></div>
      <div class="ph-status"><span id="phTime"></span><span>📶 🔋</span></div>
      <div class="ph-notif hidden" id="phNotif"></div>
      <div class="ph-screen" id="phScreen"></div>
      <button class="ph-homebar" data-home="1" title="${fmt('phone.home')}"></button>`;
    root.appendChild(this.el);
    this.screen = this.el.querySelector('#phScreen');
    this.notifEl = this.el.querySelector('#phNotif');
    this.cityMap = new CityMap({ action: (a, ds) => this.handlers.action(a, ds) });
    this.lastHtml = '';
    this.el.addEventListener('click', (e) => {
      const app = e.target.closest('[data-app]');
      if (app) return this.openApp(app.dataset.app);
      if (e.target.closest('[data-home]')) return this.goHome();
      const act = e.target.closest('[data-act]');
      if (act && !act.disabled) this.handlers.action(act.dataset.act, act.dataset);
    });
    // ngăn click / lăn chuột trên điện thoại xoay / phóng camera
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation());
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.className = this.open ? '' : 'hidden';
    if (this.open) {
      if (this.app) this.unread[this.app] = 0;
      this.lastHtml = '';
      this.handlers.refresh();
    } else this.hideNotif();
  }

  openApp(id) {
    if (!APP_BY_ID[id]) return;
    this.app = id;
    this.unread[id] = 0;
    this.hideNotif();
    this.lastHtml = '';
    this.handlers.refresh();
  }

  goHome() {
    this.app = null;
    this.lastHtml = '';
    this.handlers.refresh();
  }

  // Esc: trong app → về màn hình chính; đang ở màn hình chính → cất máy
  back() {
    if (this.app) this.goHome();
    else this.toggle(false);
  }

  // Có tin mới ở app: thêm chấm đỏ; đang mở máy ở chỗ khác thì trượt thông báo xuống (bấm vào để mở app)
  notify(app, note = null) {
    if (this.open && this.app === app) return;
    this.unread[app] = (this.unread[app] || 0) + 1;
    if (this.open && note) this.showNotif(app, note);
  }

  showNotif(app, { title, text }) {
    const a = APP_BY_ID[app];
    this.notifEl.innerHTML = `<button data-app="${app}"><b>${a[1]} ${title}</b><span>${text}</span></button>`;
    this.notifEl.classList.remove('hidden');
    clearTimeout(this.notifTimer);
    this.notifTimer = setTimeout(() => this.hideNotif(), 4000);
  }

  hideNotif() {
    this.notifEl.classList.add('hidden');
  }

  // d: { now, timeStr, state, offer, offerTimeLeft, order, gs, chat, receipts, mapData, lockedHints }
  render(d) {
    this.el.querySelector('#phTime').textContent = d.timeStr;
    if (!this.open) return;
    let html;
    if (!this.app) html = this.homeScreen(d);
    else {
      const [id, ic, color, key] = APP_BY_ID[this.app];
      const body = id === 'goship' ? this.orderTab(d) : id === 'chat' ? this.chatTab(d) : id === 'wallet' ? this.walletTab(d) : id === 'account' ? this.accountTab(d) : id === 'bag' ? this.bagTab(d) : id === 'police' ? this.policeTab(d) : '';
      html = `<div class="ph-appbar" style="background:${color}"><button data-home="1" title="${fmt('phone.home')}">‹</button><b>${ic} ${fmt(key)}</b><span></span></div>
        <div class="ph-body${id === 'map' ? ' ph-mapbody' : ''}"${id === 'map' ? ' data-keep' : ''}>${body}</div>`;
    }
    if (html !== this.lastHtml) {
      morph(this.screen, html); // sửa tại chỗ: nút không bị dựng lại → bấm chuột không bị mất
      this.lastHtml = html;
      const body = this.screen.querySelector('.ph-body');
      if (this.app === 'map' && (body.childNodes.length !== 1 || body.firstChild !== this.cityMap.el)) body.replaceChildren(this.cityMap.el);
      if (body && this.shownApp !== this.app) body.scrollTop = 0; // đổi app → cuộn về đầu
      this.shownApp = this.app;
    }
    if (this.app === 'map') this.cityMap.draw({ ...d.mapData, now: d.now, day: d.gs.day, busy: !!d.order || d.state === S.OFFERED });
  }

  // Màn hình chính: ô tóm tắt hôm nay + các app (chấm đỏ = có tin mới)
  homeScreen(d) {
    const gs = d.gs;
    const online = d.state !== S.OFFLINE;
    const income = Object.values(gs.stats.income).reduce((a, b) => a + b, 0);
    const rent = gs.rentPaid ? fmt('phone.homeRentPaid') : fmt('phone.homeRent', { pct: Math.min(100, Math.round((gs.money / gs.rent) * 100)), rent: gs.rent, day: gs.rentDueDay });
    const badge = (id) => (this.unread[id] ? `<i class="badge">${this.unread[id]}</i>` : '');
    return `<div class="ph-home">
      <div class="ph-widget"><small>${fmt('phone.homeToday', { day: gs.day })}</small>
        <div class="w-big">${fmtK(income)} · ${fmt('phone.homeOrders', { n: gs.stats.completed })} · ⭐${gs.rating.toFixed(2)}</div>
        <small>${fmt(online ? 'phone.online' : 'phone.offline')} · 💰 ${fmtK(gs.money)}</small>
        <small>${rent}</small></div>
      <div class="ph-apps">${APPS.map(([id, ic, color, key], i) => `<button data-app="${id}"><i style="background:${color}">${ic}${badge(id)}</i><span>${fmt(key)}</span><kbd>${i + 1}</kbd></button>`).join('')}</div>
      <div class="ph-hint">${fmt('phone.homeHint')}</div>
    </div>`;
  }

  orderTab(d) {
    const gs = d.gs;
    const online = d.state !== S.OFFLINE;
    let h = `<div class="ph-head"><div><b>${fmt(online ? 'phone.online' : 'phone.offline')}</b><small>${fmt('phone.summary', { rating: gs.rating.toFixed(2), n: gs.stats.completed })}</small></div></div>`;
    // 2 công tắc riêng: Giao hàng (đồ ăn + hàng hóa + hỏa tốc) · Chở khách (cần mũ cho khách)
    const rideLocked = !gs.effect('passengerSeat');
    const sw = (act, on, label, dis) => `<button class="sw${on ? ' on' : ''}" data-act="${act}"${dis ? ' disabled' : ''}><span>${label}</span><i></i></button>`;
    h += `<div class="sw-row">${sw('wantFood', online && !gs.flags.noFood, fmt('phone.swFood'), false)}${sw('wantRide', online && !gs.flags.noRide && !rideLocked, fmt('phone.swRide'), rideLocked)}</div>`;
    if (d.state === S.OFFERED && d.offer) h += this.offerCard(d.offer, d.offerTimeLeft, d);
    else if (d.order) h += this.orderCard(d.order, d);
    else if (online && gs.lockedUntil > d.now) h += `<div class="ph-lock">${fmt('phone.lockedNote', { time: hhmm(gs.lockedUntil) })}</div>`;
    else if (online) {
      h += `<div class="ph-wait"><div class="spinner"></div>${fmt('phone.searching')}</div>`;
      if (d.appClosed) h += `<div class="ph-note">${fmt('phone.noMoreOrders')}</div>`;
    } else h += `<div class="ph-note">${fmt('phone.offlineNote')}</div>`;
    for (const t of d.lockedHints) h += `<div class="ph-lock">🔒 ${t}</div>`;
    if (!d.order && d.state !== S.OFFERED) h += this.todayCard(gs);
    return h;
  }

  // Hôm nay: thu, chi, số đơn
  todayCard(gs) {
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    return `<div class="card"><b>${fmt('phone.today')}</b>
      <div class="kv"><span>${fmt('phone.income')}</span><b class="plus">+${fmtK(sum(gs.stats.income))}</b></div>
      <div class="kv"><span>${fmt('phone.expense')}</span><b class="minus">−${fmtK(sum(gs.stats.expense))}</b></div>
      <div class="kv"><span>${fmt('phone.accCompleted')}</span><b>${gs.stats.completed}</b></div></div>`;
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
      <div class="offer-top"><b>${offerTitle(o)}</b><small>${fmt('phone.offerSec', { sec: Math.ceil(left) })}</small></div>
      <div class="timer"><div style="width:${(left / ORDER.offerTimeoutSec) * 100}%"></div></div>
      <div class="pay-big">~${fmtK(o.estPay)}</div>
      <div class="route"><div>📍 <b>${o.pickup.name}</b><small>${ride ? fmt('phone.pickupRide', { customer: o.customer }) : o.pickup.address}</small></div>
      <div>🏁 <b>${o.revealed ? o.dropoff.address : fmt('phone.vague')}</b><small>${o.customer}${floor}</small></div></div>
      <div class="items">${items.map((i) => `${i.icon} ${i.name}`).join(' · ')}</div>
      <div class="tags">${orderTags(o)}${traits}<span class="tag">📏 ${o.distanceKm.toFixed(1)} km</span>${o.flags.picky ? `<span class="tag warn">${fmt('phone.picky')}</span>` : ''}</div>
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
      <div class="segs">${steps.map((_, i) => `<i class="${i < cur ? 'done' : i === cur ? 'now' : ''}"></i>`).join('')}</div>
      <ul class="steps">${stepHtml}</ul>
      ${items}
      <div class="row"><button class="btn primary" data-app="map">${fmt('phone.openMap')}</button><button class="btn" data-act="call" ${canCall ? '' : 'disabled'}>${fmt('phone.call')}</button></div>
      <div class="row"><button class="btn danger" data-act="cancel">${fmt('phone.cancel')}</button></div>
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
    const pct = gs.rentPaid ? 100 : Math.min(100, Math.round((gs.money / gs.rent) * 100));
    return `<div class="card"><div class="big">${fmtK(gs.money)}</div><small>${fmt('phone.rentToday', { rent: gs.rent, day: gs.rentDueDay })}${gs.rentPaid ? fmt('phone.rentPaid') : ''}</small>
      <div class="track rent"><div class="fill ${gs.rentPaid ? 'ok' : pct >= 100 ? 'ok' : 'mid'}" style="width:${pct}%"></div></div>
      ${gs.rentPaid ? '' : `<small>${fmt('phone.rentPct', { pct })}</small>`}
      ${gs.fines.length ? `<button class="kv linkrow" data-app="police"><span>${fmt(gs.hasOverdueFines ? 'phone.finesLate' : 'phone.fines', { day: dayOf(gs.finesDueAt) })} ${fmt('phone.finesSee')}</span><b class="minus">${fmtK(gs.finesTotal)}</b></button>` : ''}
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
    // vòng điểm: đầy theo điểm 1–5, đổi màu khi gần mức bị khóa
    const ring = Math.max(0, Math.min(1, (gs.rating - 1) / 4)), col = gs.rating < (acc.lockBelow || 4) + 0.3 ? '#e74c3c' : gs.rating < 4.6 ? '#f5b041' : '#2ecc71';
    return `<div class="card prof"><div class="ring" style="background:conic-gradient(${col} ${ring * 360}deg, rgba(255,255,255,.1) 0)"><b>${gs.rating.toFixed(2)}</b></div>
      <div><b>${fmt('phone.accTitle')}</b><small>${fmt('phone.profSub', { n: a.completed, rides: a.rides })}</small>
      <div class="track"><div class="fill ${gs.acceptRate >= (acc.lowAcceptBelow || 0) ? 'ok' : 'bad'}" style="width:${Math.round(gs.acceptRate * 100)}%"></div></div>
      <small>${fmt('phone.profAccept', { pct: Math.round(gs.acceptRate * 100) })}</small></div></div>
      <div class="card">
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

  // App CSGT: phạt nguội (từng biên bản, hạn nộp, nơi nộp) + chốt CSGT đã biết hôm nay
  policeTab(d) {
    const gs = d.gs;
    const when = (m) => fmt('csgt.when', { day: dayOf(m), time: hhmm(((m % 1440) + 1440) % 1440) });
    let h = '';
    if (!gs.fines.length) h += `<div class="card"><b>${fmt('csgt.noFines')}</b><small class="blk">${fmt('csgt.noFinesNote')}</small></div>`;
    else {
      h += `<div class="card${gs.hasOverdueFines ? ' late-card' : ''}"><small>${fmt('csgt.total')}</small><div class="big">${fmtK(gs.finesTotal)}</div>
        <small>${gs.hasOverdueFines ? fmt('csgt.overdue') : fmt('csgt.due', { when: when(gs.finesDueAt) })}</small></div>`;
      h += `<div class="card"><b>${fmt('csgt.tickets', { n: gs.fines.length })}</b>` + gs.fines.map((f) => `<div class="kv"><span>${fmt(FINE_REASON[f.reason] || 'csgt.rOther')}
        <small class="sub">${f.at != null ? fmt('csgt.at', { when: when(f.at) }) + ' · ' : ''}${f.overdue ? fmt('csgt.lateTag') : fmt('csgt.dueTag', { when: when(f.dueAt) })}</small></span><b class="minus">${fmtK(f.amount)}</b></div>`).join('') + '</div>';
    }
    if (d.station) h += `<div class="card"><b>${fmt('csgt.payAt')}</b><div class="kv"><span>🚓 ${d.station.name}</span><small>${d.station.dist}</small></div>
      <div class="row"><button class="btn small primary" data-act="waypoint" data-id="${d.station.id}">${fmt('map.route')}</button></div><small class="blk">${fmt('csgt.payNote')}</small></div>`;
    h += `<div class="card"><b>${fmt('csgt.checkpoints')}</b>${(d.checkpoints || []).length
      ? d.checkpoints.map((c) => `<div class="kv"><span>👮 ${c.name}</span><small>${fmt('csgt.until', { time: c.until })} · ${c.dist}</small></div>`).join('')
      : `<small class="blk">${fmt('csgt.noCheckpoints')}</small>`}<small class="blk">${fmt('csgt.checkNote')}</small></div>`;
    return h;
  }
}
