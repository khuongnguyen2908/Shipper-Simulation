// Điện thoại kiểu thật: màn hình chính có các app, bấm app mở to cả máy (‹ quay lại), thông báo trượt xuống.
// App: GoShip (nhận / chạy đơn) · Bản đồ (cityMap.js) · Tin nhắn · Ví · Hồ sơ · Túi đồ (kho đồ chia ô + bảng "Đang mặc" bên trái)
//      · Xe (xăng, tình trạng, nhớt, km) · CSGT (phạt nguội, chốt đã biết). Chữ lấy từ kho chữ phone.*
// Thứ tự / biểu tượng / màu / ẩn app: phone.json (thẻ 📱 Giao diện app trong ?editor).
// Phím khi mở điện thoại: 1–9 mở app · Esc về màn hình chính (đang ở màn hình chính thì cất máy).
import { stateLabel, S } from '../sim/OrderManager.js';
import { APP, ORDER_TYPES, RIDER_TYPES, BRANDS } from '../data/apps.js';
import { traitLabel } from '../data/items.js';
import { ORDER, ECONOMY } from '../data/balance.js';
import { GOODS, OUTFIT_SLOTS, isAccessorySlot, outfitLook } from '../data/goods.js';
import { PLACES } from '../data/places.js';
import { phoneApps } from '../data/phoneApps.js';
import { placesUsing } from '../sim/placeRules.js';
import { fmtK } from '../sim/economy.js';
import { dayOf } from '../sim/clock.js';
import { fmt, list, has } from '../content/index.js';
import { CityMap } from './cityMap.js';
import { createAvatar } from './avatar.js';
import { morph } from './morph.js';

// [mã app, biểu tượng, màu, khóa chữ tên app] — APPS: app đang hiện (theo thứ tự, phím 1–9); app ẩn vẫn mở được qua liên kết
const PHONE = phoneApps();
export const APPS = PHONE.visible;
// lý do biên bản phạt nguội (gs.fines[].reason) → khóa chữ
const FINE_REASON = { parking: 'csgt.rParking', airport: 'csgt.rAirport' };
const APP_BY_ID = Object.fromEntries(PHONE.all.map((a) => [a[0], a]));

// App chỉ có khi đã vào hãng: app nhận đơn của hãng + Hồ sơ tài xế (điểm đánh giá, tỉ lệ nhận đơn, đơn gần đây)
const BRAND_ONLY = new Set(['goship', 'account']);

// Biểu tượng / màu / tên app để vẽ: app nhận đơn mang màu + tên hãng đang chạy (GoShip / HồngSM)
function appLook([id, ic, color, key], gs) {
  const b = id === 'goship' && gs?.brandSpec;
  return b ? [id, b.icon || ic, b.color || color, esc(b.name)] : [id, ic, color, fmt(key)];
}

// Túi đồ: nút lọc (mã → loại món) · biểu tượng ô trống của bảng "Đang mặc" · 2 cột ô quanh avatar
const BAG_FILTERS = { all: null, wear: ['outfit'], use: ['use', 'carry'], other: ['equip', 'quest'] };
const SLOT_ICON = { helmet: '⛑️', face: '🕶️', shirt: '👕', hands: '🧤', acc: '🧥', pants: '👖', shoes: '👟' };
const SLOT_COLS = [['helmet', 'face', 'shirt', 'hands'], ['acc', 'pants', 'shoes']];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Mọi thứ trong túi: trang phục đã có, trang bị, đồ dùng 1 lần, đồ mang theo, vật phẩm nhiệm vụ
// → [{ key, id, kind: 'outfit'|'equip'|'use'|'carry'|'quest', g (dữ liệu món), n (số lượng), worn }]
function bagEntries(gs) {
  const out = [];
  const order = Object.keys(OUTFIT_SLOTS);
  const outfits = Object.values(GOODS).filter((g) => g.type === 'outfit' && gs.ownsOutfit(g.id)).sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  for (const g of outfits) out.push({ key: `g:${g.id}`, id: g.id, kind: 'outfit', g, n: 1, worn: gs.isWorn(g.id) });
  for (const g of Object.values(GOODS)) if (g.type === 'equipment' && gs.has(g.id)) out.push({ key: `g:${g.id}`, id: g.id, kind: 'equip', g, n: 1 });
  for (const [id, n] of Object.entries(gs.consumables)) {
    const g = GOODS[id];
    if (g && n > 0 && (g.type === 'consumable' || g.type === 'carry')) out.push({ key: `g:${id}`, id, kind: g.type === 'carry' ? 'carry' : 'use', g, n });
  }
  if (gs.hasItem('wallet')) out.push({ key: 'i:wallet', id: 'wallet', kind: 'quest', g: { icon: '👛', name: fmt('dlg.invWalletItem'), desc: fmt('phone.bagWalletDesc') }, n: 1 });
  return out;
}

// Việc làm được với một món (menu chuột phải + nút ở khung chi tiết) và dòng ghi chú
function bagActions(e) {
  const acts = [], notes = [];
  if (e.kind === 'use') acts.push({ act: 'bagUse', label: fmt('phone.bagUse', { min: e.g.use?.minutes || 0 }) });
  else if (e.kind === 'carry') notes.push(fmt('phone.bagCarry', { where: placesUsing(e.id, PLACES).map((p) => p.short || p.name).join(', ') || '—' }));
  else if (e.kind === 'outfit') {
    if (isAccessorySlot(e.g.slot)) acts.push(e.worn ? { act: 'bagOff', label: fmt('phone.bagOff') } : { act: 'bagWear', label: fmt('phone.bagWear') });
    else notes.push(fmt(e.worn ? 'phone.bagWornHome' : 'phone.bagHomeOnly'));
  } else if (e.kind === 'equip') notes.push(fmt('phone.bagAlwaysOn'));
  else if (e.kind === 'quest') acts.push({ act: 'wallet', label: fmt('phone.view') });
  return { acts, notes };
}
// "Áo · đang mặc" / "Đồ dùng 1 lần · còn 2"…
function bagKind(e) {
  if (e.kind === 'outfit') return fmt(`outfit.slot.${e.g.slot}`) + (e.worn ? ` · ${fmt('phone.bagWorn')}` : '');
  return fmt(`phone.bagKind.${e.kind}`, { n: e.n });
}

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
    // Túi đồ: nút lọc đang chọn, món đang chọn (khóa 'g:mã'), menu chuột phải { key, x, y }
    this.bagFilter = 'all';
    this.bagSel = null;
    this.bagMenu = null;
    // bảng "Đang mặc" bên trái điện thoại (chỉ hiện khi mở app Túi đồ)
    this.outfitEl = document.createElement('div');
    this.outfitEl.id = 'outfitPanel';
    this.outfitEl.className = 'hidden';
    root.appendChild(this.outfitEl);
    this.avatar = createAvatar();
    this.lastOutfitHtml = '';
    for (const host of [this.el, this.outfitEl]) {
      host.addEventListener('click', (e) => this.onClick(e));
      host.addEventListener('contextmenu', (e) => this.onContext(e));
      // ngăn click / lăn chuột trên điện thoại xoay / phóng camera
      host.addEventListener('pointerdown', (e) => e.stopPropagation());
      host.addEventListener('wheel', (e) => e.stopPropagation());
    }
  }

  onClick(e) {
    const inMenu = e.target.closest('.bag-menu');
    if (this.bagMenu && !inMenu) this.bagMenu = null; // bấm ra ngoài → đóng menu
    const app = e.target.closest('[data-app]');
    if (app) return this.openApp(app.dataset.app);
    if (e.target.closest('[data-home]')) return this.goHome();
    const f = e.target.closest('[data-bagf]');
    if (f) {
      this.bagFilter = f.dataset.bagf;
      return this.redraw();
    }
    const cell = e.target.closest('[data-bag]');
    if (cell) {
      this.bagSel = cell.dataset.bag;
      return this.redraw();
    }
    const act = e.target.closest('[data-act]');
    if (act && !act.disabled) {
      this.bagMenu = null;
      return this.handlers.action(act.dataset.act, act.dataset);
    }
    if (!inMenu) this.redraw();
  }

  // Chuột phải vào món trong túi (hoặc ô trong bảng "Đang mặc") → menu Dùng / Gắn / Tháo
  onContext(e) {
    e.preventDefault();
    const cell = e.target.closest('[data-bag]');
    if (!cell || this.app !== 'bag') {
      this.bagMenu = null;
      return this.redraw();
    }
    const r = this.screen.getBoundingClientRect();
    const x = Math.max(4, Math.min(e.clientX - r.left, r.width - 170));
    const y = Math.max(4, Math.min(e.clientY - r.top, r.height - 140));
    this.bagSel = cell.dataset.bag;
    this.bagMenu = { key: cell.dataset.bag, x: Math.round(x), y: Math.round(y) };
    this.redraw();
  }

  redraw() {
    this.lastHtml = '';
    this.handlers.refresh();
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.className = this.open ? '' : 'hidden';
    if (this.open) {
      if (this.app) this.unread[this.app] = 0;
      this.lastHtml = '';
      this.handlers.refresh();
    } else {
      this.hideNotif();
      this.bagMenu = null;
      this.showOutfit(null);
    }
  }

  openApp(id) {
    if (!APP_BY_ID[id]) return;
    this.app = id;
    this.bagMenu = null;
    this.unread[id] = 0;
    this.hideNotif();
    this.lastHtml = '';
    this.handlers.refresh();
  }

  // App hiện trên màn hình chính (= phím 1–9): chưa vào hãng thì chưa có app nhận đơn của hãng và Hồ sơ tài xế
  visibleApps(gs) {
    return APPS.filter(([id]) => !BRAND_ONLY.has(id) || !!gs?.brand);
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

  // d: { now, timeStr, state, offer, offerTimeLeft, order, gs, chat, receipts, mapData, lockedHints, garage }
  render(d) {
    this.el.querySelector('#phTime').textContent = d.timeStr;
    if (!this.open) return this.showOutfit(null);
    let html;
    if (!this.app) html = this.homeScreen(d);
    else {
      const [id, ic, color, name] = appLook(APP_BY_ID[this.app], d.gs);
      const body = id === 'goship' ? this.orderTab(d) : id === 'chat' ? this.chatTab(d) : id === 'wallet' ? this.walletTab(d) : id === 'account' ? this.accountTab(d) : id === 'bag' ? this.bagTab(d) : id === 'bike' ? this.bikeTab(d) : id === 'police' ? this.policeTab(d) : '';
      html = `<div class="ph-appbar" style="background:${color}"><button data-home="1" title="${fmt('phone.home')}">‹</button><b>${ic} ${name}</b><span></span></div>
        <div class="ph-body${id === 'map' ? ' ph-mapbody' : ''}"${id === 'map' ? ' data-keep' : ''}>${body}</div>${id === 'bag' ? this.bagMenuHtml(d) : ''}`;
    }
    this.showOutfit(this.app === 'bag' ? d : null);
    if (html !== this.lastHtml) {
      morph(this.screen, html); // sửa tại chỗ: nút không bị dựng lại → bấm chuột không bị mất
      this.lastHtml = html;
      const body = this.screen.querySelector('.ph-body');
      if (this.app === 'map' && (body.childNodes.length !== 1 || body.firstChild !== this.cityMap.el)) body.replaceChildren(this.cityMap.el);
      if (body && this.shownApp !== this.app) body.scrollTop = 0; // đổi app → cuộn về đầu
      this.shownApp = this.app;
    }
    if (this.app === 'map') this.cityMap.draw({ ...d.mapData, now: d.now, day: d.gs.day, busy: !!d.order || d.state === S.OFFERED, tut: d.tut });
  }

  // Màn hình chính: ô tóm tắt hôm nay + các app (chấm đỏ = có tin mới)
  homeScreen(d) {
    const gs = d.gs;
    const apps = this.visibleApps(gs);
    const online = d.state !== S.OFFLINE;
    const income = Object.values(gs.stats.income).reduce((a, b) => a + b, 0);
    const rent = gs.rentPaid ? fmt('phone.homeRentPaid') : fmt('phone.homeRent', { pct: Math.min(100, Math.round((gs.money / gs.rent) * 100)), rent: gs.rent, day: gs.rentDueDay });
    const badge = (id) => (this.unread[id] ? `<i class="badge">${this.unread[id]}</i>` : '');
    // ô tóm tắt: đã vào hãng → thu nhập, số đơn, điểm, đang bật app; chưa vào hãng → chỉ tiền + tiền nhà
    const work = gs.brand
      ? `<div class="w-big">${fmtK(income)} · ${fmt('phone.homeOrders', { n: gs.stats.completed })} · ⭐${gs.rating.toFixed(2)}</div>
        <small>${fmt(online ? 'phone.online' : 'phone.offline')} · 💰 ${fmtK(gs.money)}</small>`
      : `<div class="w-big">💰 ${fmtK(gs.money)}</div><small>${fmt('phone.homeNoBrand')}</small>`;
    // hướng dẫn người mới: nhấp nháy app Bản đồ
    const tut = (id) => (d.tut === 'map' && id === 'map' ? ' class="tut"' : '');
    return `<div class="ph-home">
      <div class="ph-widget"><small>${fmt('phone.homeToday', { day: gs.day })}</small>
        ${work}
        <small>${rent}</small></div>
      <div class="ph-apps">${apps.map((a) => appLook(a, gs)).map(([id, ic, color, name], i) => `<button data-app="${id}"${tut(id)}><i style="background:${color}">${ic}${badge(id)}</i><span>${name}</span><kbd>${i + 1}</kbd></button>`).join('')}</div>
      <div class="ph-hint">${fmt('phone.homeHint', { n: apps.length })}</div>
    </div>`;
  }

  orderTab(d) {
    const gs = d.gs;
    // chưa vào hãng: giới thiệu 2 hãng + chỉ đường tới văn phòng đăng ký
    if (gs.workBlock() === 'noBrand') {
      const offices = (d.offices || []).map((o) => `<div class="kv"><span>🏢 ${esc(o.name)}</span><small>${o.dist}</small></div><div class="row"><button class="btn small primary" data-act="waypoint" data-id="${o.id}">${fmt('map.route')}</button></div>`).join('');
      const brands = Object.values(BRANDS).map((b) => `<div class="kv"><span>${b.icon || ''} <b>${esc(b.name)}</b> · ${fmt(`power.${b.power}`)}</span><small>${fmt('phone.brandDeposit', { k: b.deposit || 0 })}</small></div><small class="blk">${esc(b.desc || '')}</small>`).join('');
      return `<div class="card"><b>${fmt('phone.noBrandTitle')}</b><small class="blk">${fmt('phone.noBrandText')}</small></div>
        <div class="card">${brands}</div><div class="card"><b>${fmt('phone.offices')}</b>${offices || `<small>${fmt('phone.nothing')}</small>`}</div>`;
    }
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
    const none = `<small>${fmt('phone.none')}</small>`;
    const pct = gs.rentPaid ? 100 : Math.min(100, Math.round((gs.money / gs.rent) * 100));
    return `<div class="card"><div class="big">${fmtK(gs.money)}</div><small>${fmt('phone.rentToday', { rent: gs.rent, day: gs.rentDueDay })}${gs.rentPaid ? fmt('phone.rentPaid') : ''}</small>
      <div class="track rent"><div class="fill ${gs.rentPaid ? 'ok' : pct >= 100 ? 'ok' : 'mid'}" style="width:${pct}%"></div></div>
      ${gs.rentPaid ? '' : `<small>${fmt('phone.rentPct', { pct })}</small>`}
      ${gs.fines.length ? `<button class="kv linkrow" data-app="police"><span>${fmt(gs.hasOverdueFines ? 'phone.finesLate' : 'phone.fines', { day: dayOf(gs.finesDueAt) })} ${fmt('phone.finesSee')}</span><b class="minus">${fmtK(gs.finesTotal)}</b></button>` : ''}</div>
      <div class="card"><b>${fmt('phone.income')}</b>${inc || none}<b>${fmt('phone.expense')}</b>${exp || none}</div>`;
  }

  // Tài khoản tài xế: điểm, tỉ lệ nhận đơn, tự hủy, bom hàng + luật của app (apps.json → account)
  accountTab(d) {
    const gs = d.gs;
    const acc = APP.account || {};
    const a = gs.account;
    const kv = (l, v, note = '') => `<div class="kv"><span>${l}</span><b>${v}</b></div>${note ? `<small>${note}</small>` : ''}`;
    const locked = gs.lockedUntil > d.now;
    // đơn gần đây: số đơn, khách, sao, tiền nhận
    const rec = d.receipts.slice(-8).reverse().map((r) => `<div class="kv"><span>#${r.order.id} ${r.order.customer} <small class="st">${stars(r.ev.stars)}</small></span><b>${r.ev.refused ? '0k' : fmtK(r.pay.walletCredit)}</b></div>`).join('');
    // vòng điểm: đầy theo điểm 1–5, đổi màu khi gần mức bị khóa
    const ring = Math.max(0, Math.min(1, (gs.rating - 1) / 4)), col = gs.rating < (acc.lockBelow || 4) + 0.3 ? '#e74c3c' : gs.rating < 4.6 ? '#f5b041' : '#2ecc71';
    return `<div class="card prof"><div class="ring" style="background:conic-gradient(${col} ${ring * 360}deg, rgba(255,255,255,.1) 0)"><b>${gs.rating.toFixed(2)}</b></div>
      <div><b>${esc(gs.profile.name)}</b><small>${fmt('phone.accTitle')} · ${fmt('phone.profSub', { n: a.completed, rides: a.rides })}</small>
      <div class="track"><div class="fill ${gs.acceptRate >= (acc.lowAcceptBelow || 0) ? 'ok' : 'bad'}" style="width:${Math.round(gs.acceptRate * 100)}%"></div></div>
      <small>${fmt('phone.profAccept', { pct: Math.round(gs.acceptRate * 100) })}</small></div></div>
      <div class="card">
      ${kv(fmt('phone.accRating'), `⭐ ${gs.rating.toFixed(2)}`, fmt('phone.accLockAt', { limit: Number(acc.lockBelow).toFixed(1) }))}
      ${kv(fmt('phone.accCompleted'), a.completed)}
      ${kv(fmt('phone.accRides'), a.rides)}
      ${kv(fmt('phone.accAccept', { n: a.recent.length }), `${Math.round(gs.acceptRate * 100)}%`, fmt('phone.accAcceptRule', { pct: Math.round((acc.lowAcceptBelow || 0) * 100) }))}
      ${kv(fmt('phone.accCancels'), `${gs.stats.driverCancels} / ${acc.cancelLimitPerDay}`, fmt('phone.accCancelRule', { n: acc.cancelLimitPerDay, min: acc.cancelLockMin, stars: acc.cancelStars }))}
      ${kv(fmt('phone.accBom'), a.bom)}
      <div class="ph-note">${locked ? fmt('phone.accLocked', { time: hhmm(gs.lockedUntil) }) : fmt('phone.accOk')}</div></div>
      <div class="card"><b>${fmt('phone.recent')}</b>${rec || `<small>${fmt('phone.noOrders')}</small>`}</div>`;
  }

  // Túi đồ: nút lọc · kho đồ chia ô (viền xanh = đang mặc, số góc = số lượng) · khung chi tiết món đang chọn
  bagTab(d) {
    const all = bagEntries(d.gs);
    if (this.bagSel && !all.some((e) => e.key === this.bagSel)) this.bagSel = null;
    if (!(this.bagFilter in BAG_FILTERS)) this.bagFilter = 'all';
    const kinds = BAG_FILTERS[this.bagFilter];
    const shown = kinds ? all.filter((e) => kinds.includes(e.kind)) : all;
    const cells = shown.map((e) => `<button class="bag-cell${e.worn ? ' on' : ''}${e.key === this.bagSel ? ' sel' : ''}" data-bag="${e.key}" title="${esc(e.g.name)}">${e.g.icon || '📦'}${e.n > 1 ? `<small>${e.n}</small>` : ''}</button>`);
    const total = Math.max(16, Math.ceil(cells.length / 4) * 4);
    while (cells.length < total) cells.push('<i class="bag-cell empty"></i>');
    const chips = Object.keys(BAG_FILTERS).map((k) => `<button class="bag-chip${k === this.bagFilter ? ' on' : ''}" data-bagf="${k}">${fmt(`phone.bagF.${k}`)}</button>`).join('');
    const sel = all.find((e) => e.key === this.bagSel);
    let detail = `<div class="ph-note">${fmt(all.length ? 'phone.bagHint' : 'phone.bagEmptyAll')}</div>`;
    if (sel) {
      const { acts, notes } = bagActions(sel);
      detail = `<div class="card bag-detail"><div class="bd-top"><span class="bd-ic">${sel.g.icon || ''}</span><div><b>${esc(sel.g.name)}</b><small>${bagKind(sel)}</small></div></div>
        ${sel.g.desc ? `<small class="blk">${esc(sel.g.desc)}</small>` : ''}${notes.map((n) => `<div class="ph-note small">${n}</div>`).join('')}
        ${acts.length ? `<div class="row">${acts.map((a) => `<button class="btn small primary" data-act="${a.act}" data-id="${sel.id}">${a.label}</button>`).join('')}</div>` : ''}</div>`;
    }
    return `<div class="bag-chips">${chips}</div><div class="bag-grid">${cells.join('')}</div>${detail}
      <div class="kv"><span>${fmt('phone.bagMoney')}</span><b>${fmtK(d.gs.money)}</b></div>`;
  }

  // Menu chuột phải (nằm đè trên màn hình điện thoại, chỗ vừa bấm)
  bagMenuHtml(d) {
    const m = this.bagMenu;
    if (!m) return '';
    const e = bagEntries(d.gs).find((x) => x.key === m.key);
    if (!e) {
      this.bagMenu = null;
      return '';
    }
    const { acts, notes } = bagActions(e);
    return `<div class="bag-menu" style="left:${m.x}px;top:${m.y}px"><b>${e.g.icon || ''} ${esc(e.g.name)}</b>
      ${acts.map((a) => `<button data-act="${a.act}" data-id="${e.id}">${a.label}</button>`).join('')}${notes.map((n) => `<small>${n}</small>`).join('')}</div>`;
  }

  // Bảng "Đang mặc" bên trái điện thoại: avatar 3D ở giữa, 7 ô trang phục 2 bên. d = null → ẩn
  showOutfit(d) {
    if (!d) {
      if (this.outfitEl.className !== 'hidden') this.outfitEl.className = 'hidden';
      this.avatar.stop();
      this.lastOutfitHtml = '';
      return;
    }
    this.outfitEl.className = '';
    const worn = d.gs.wornGoods();
    const slot = (s) => {
      const g = worn[s], key = g ? `g:${g.id}` : '';
      return `<button class="op-slot${g ? ' on' : ''}${key && key === this.bagSel ? ' sel' : ''}"${g ? ` data-bag="${key}"` : ''} title="${esc(g ? g.name : '')}">
        <i>${(g && g.icon) || SLOT_ICON[s] || '•'}</i><span><small>${fmt(`outfit.slot.${s}`)}</small><b>${esc(g ? g.name : fmt('phone.bagEmptySlot'))}</b></span></button>`;
    };
    const html = `<div class="op-head">${fmt('phone.outfitTitle')}</div>
      <div class="op-grid"><div class="op-col">${SLOT_COLS[0].map(slot).join('')}</div><div class="op-avatar" data-keep></div><div class="op-col">${SLOT_COLS[1].map(slot).join('')}</div></div>
      <div class="op-note">${fmt('phone.outfitNote')}</div>`;
    if (html !== this.lastOutfitHtml) {
      morph(this.outfitEl, html);
      this.lastOutfitHtml = html;
      const host = this.outfitEl.querySelector('.op-avatar');
      if (host && host.firstChild !== this.avatar.el) host.replaceChildren(this.avatar.el);
    }
    this.avatar.show({ ...outfitLook(worn), gender: d.gs.profile.gender });
    this.avatar.start();
  }

  // App Xe: theo loại xe — xe xăng (xăng, nhớt) · xe điện (pin, đổi pin) · xe đạp (không cần gì);
  // tình trạng, km đã chạy, thông số + túi giao hàng, nơi nạp năng lượng / bảo dưỡng gần nhất
  bikeTab(d) {
    const gs = d.gs;
    const v = gs.vehicleSpec, b = gs.bagSpec, p = gs.power, ev = p === 'electric';
    const kv = (l, val) => `<div class="kv"><span>${l}</span><b>${val}</b></div>`;
    const bar = (pct) => {
      const x = Math.max(0, Math.min(100, pct));
      return `<div class="track"><div class="fill ${x > 50 ? 'ok' : x > 20 ? 'mid' : 'bad'}" style="width:${x}%"></div></div>`;
    };
    const place = (pl, icon, note) => (pl ? `<div class="kv"><span>${icon} ${esc(pl.name)}</span><small>${pl.dist}</small></div>${note ? `<small class="blk">${note}</small>` : ''}
      <div class="row"><button class="btn small primary" data-act="waypoint" data-id="${pl.id}">${fmt('map.route')}</button></div>` : '');
    const company = gs.companyVehicle === gs.vehicle && gs.brandSpec ? `<span class="tag good">${fmt('phone.companyBike', { brand: esc(gs.brandSpec.name), k: gs.depositPaid })}</span>` : '';
    let rows = '', near = '';
    if (p === 'pedal') rows = `<div class="ph-note">${fmt('phone.pedalNote')}</div>`;
    else {
      const unit = ev ? 'kWh' : 'L';
      const mPct = (gs.maintLeftKm / gs.maintIntervalKm) * 100;
      const mVal = gs.maintOverdue ? fmt('phone.oilOver', { km: (-gs.maintLeftKm).toFixed(1) }) : fmt('phone.oilLeft', { km: gs.maintLeftKm.toFixed(1) });
      const mNote = gs.maintOverdue ? `<div class="ph-lock">${fmt(ev ? 'phone.batteryOverNote' : 'phone.oilOverNote', { pct: Math.round((ECONOMY.oilFuelPct ?? 0.2) * 100) })}</div>`
        : mPct < 20 ? `<div class="ph-lock">${fmt(ev ? 'phone.batterySoon' : 'phone.oilSoon')}</div>` : '';
      rows = `${kv(ev ? `🔋 ${fmt('phone.battery')}` : `⛽ ${fmt('phone.fuel')}`, `${Math.round((gs.fuel / v.tank) * 100)}% · ${gs.fuel.toFixed(2)} / ${v.tank} ${unit}`)}${bar((gs.fuel / v.tank) * 100)}
        ${kv(`🔧 ${fmt('phone.bikeHp')}`, `${gs.bikeHp.toFixed(0)}%`)}${bar(gs.bikeHp)}
        ${kv(ev ? `🔋 ${fmt('phone.batteryHealth')}` : `🛢️ ${fmt('phone.oil')}`, mVal)}${bar(mPct)}${mNote}
        ${kv(fmt('phone.suspension'), `${Math.round(v.suspension * 100)}%`)}
        ${kv(fmt(ev ? 'phone.elecUse' : 'phone.fuelUse'), `${v.fuelPer100km} ${unit}/100 km`)}`;
      near = `<div class="card"><b>${fmt(ev ? 'phone.evStops' : 'phone.gasStops')}</b>
        ${place(d.fuelStop, ev ? '🔌' : '⛽', ev ? fmt('phone.chargerNote', { price: ECONOMY.elecPrice ?? 8 }) : '')}
        ${place(d.garage, ev ? '🔋' : '🔧', ev ? fmt('phone.swapNote', { cost: ECONOMY.swapCost ?? 45 }) : fmt('phone.garageNote', { oil: ECONOMY.oilCost ?? 60, repair: ECONOMY.repairCost }))}</div>`;
    }
    // 📍 Định vị xe: xe đang ở đường nào, cách bao xa; bấm để chỉ đường tới xe
    const w = d.bikeWhere;
    const locate = w ? `<div class="card"><b>${fmt('phone.locateTitle')}</b><div class="kv"><span>📍 ${w.riding ? fmt('phone.bikeRiding') : esc(w.street || fmt('phone.bikeNoStreet'))}</span><small>${w.riding ? '' : w.dist}</small></div>
      ${w.riding ? '' : `<div class="row"><button class="btn small primary" data-act="findBike">${fmt('phone.locateBtn')}</button></div>`}</div>` : '';
    return `${locate}<div class="card"><b>${esc(v.name)}</b> <span class="tag">${fmt(`power.${p}`)}</span>${company}<small class="blk">${esc(v.desc)}</small>
      ${rows}
      ${kv(`📏 ${fmt('phone.odo')}`, `${gs.odoKm.toFixed(1)} km`)}
      ${kv(fmt('phone.maxSpeed'), `${Math.round(v.maxSpeed * 3.6)} km/h`)}</div>
      ${gs.brand ? `<div class="card"><b>👜 ${esc(b.name)}</b><small class="blk">${esc(b.desc)}</small>
      ${kv(fmt('phone.bagStats'), `${Math.round(b.insulation * 100)}% · ${Math.round(b.waterproof * 100)}% · ${Math.round(b.padding * 100)}%`)}
      ${kv(fmt('phone.slots'), `${b.cols}×${b.rows}`)}</div>` : ''}${near}`;
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
