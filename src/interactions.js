// =============================================================
// TƯƠNG TÁC & HỘI THOẠI — mọi thao tác của người chơi đi qua đây
// (lấy hàng, xếp túi, giao hàng, sự cố, cửa hàng, nhiệm vụ chiếc ví, CSGT…)
// Mọi chữ lấy từ kho chữ qua fmt() — sửa bằng công cụ ?editor.
// =============================================================
import { ECONOMY, ENERGY, ORDER, VEHICLES, BAGS, GEAR, WALLET_QUEST } from './data/balance.js';
import { ITEMS } from './data/items.js';
import { S } from './sim/OrderManager.js';
import { fmtK } from './sim/economy.js';
import { intersectionName } from './sim/cityLayout.js';
import { fmt, pick, has } from './content/index.js';
import { buildPacking } from './ui/packing.js';
import { sfx } from './audio.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

function say(g, speaker, portrait, text, choices = [{ label: fmt('dlg.ok') }], extra = {}) {
  g.modal.show({ speaker, portrait, text, choices, ...extra });
}

// NPC của một địa điểm (tên + chân dung)
function npc(g, placeId) {
  const pl = g.layout.placeById[placeId];
  return pl && pl.npc ? pl.npc : { name: fmt('npc.default.name'), portrait: '🙂' };
}

// Lời thoại riêng của địa điểm (npc.<id>.<loại>), không có thì dùng lời mặc định
function placeLine(placeId, kind, params) {
  const k = `npc.${placeId}.${kind}`;
  return has(k) ? fmt(k, params) : fmt(`npc.default.${kind}`, params);
}

// ======================== DANH SÁCH TƯƠNG TÁC GẦN NGƯỜI CHƠI ========================
export function gatherInteractions(g) {
  const { om, bike } = g;
  const foot = g.mode === 'foot';
  const p = g.playerPos;
  const slow = Math.abs(bike.speed) < 1.2;
  const out = [];
  // F: lên / xuống xe
  if (foot && dist(p, bike.pos) < 3.2) out.push({ key: 'F', label: fmt('act.mount'), dist: 0, run: () => mount(g) });
  if (!foot) out.push({ key: 'F', label: fmt('act.dismount'), dist: 0, disabled: !slow, run: () => dismount(g) });

  const E = [];
  const o = om.order;
  if (o) {
    const dp = dist(p, o.pickup.door);
    if (o.kind === 'food' && [S.TO_PICKUP, S.WAITING_FOOD, S.OUT_OF_STOCK].includes(om.state) && dp < 3.6) {
      E.push(foot ? { label: fmt('act.pickup', { place: o.pickup.name }), dist: dp - 10, run: () => pickup(g) } : { label: fmt('act.pickupNeedFoot'), dist: dp - 10, disabled: true });
    }
    if (o.kind === 'ride' && om.state === S.TO_PICKUP && dp < 5.5) {
      E.push(!foot ? { label: fmt('act.board', { customer: o.customer }), dist: dp - 10, disabled: !slow, run: () => boardPassenger(g) } : { label: fmt('act.boardNeedBike'), dist: dp - 10, disabled: true });
    }
    if ([S.DELIVERING, S.AT_DROPOFF, S.NO_ANSWER, S.STAIRS].includes(om.state) && o.revealed) {
      const dd = dist(p, o.dropoff.door);
      if (o.kind === 'food' && dd < 3.6) E.push(foot ? { label: fmt('act.deliver', { customer: o.customer }), dist: dd - 10, run: () => dropoff(g) } : { label: fmt('act.deliverNeedFoot'), dist: dd - 10, disabled: true });
      if (o.kind === 'ride' && dd < 5.5) E.push(!foot ? { label: fmt('act.dropRide', { customer: o.customer }), dist: dd - 10, disabled: !slow, run: () => dropoff(g) } : { label: fmt('act.dropRideNeedBike'), dist: dd - 10, disabled: true });
    }
  }
  const R = foot ? 3.2 : 4.5;
  for (const pl of g.layout.places) {
    const d = dist(p, pl.door);
    if (d > R) continue;
    const a = placeAction(g, pl);
    if (!a) continue;
    if (a.needFoot && !foot) E.push({ label: fmt('act.needFoot', { place: pl.name }), dist: d, disabled: true });
    else E.push({ ...a, dist: d });
  }
  if (foot || slow) {
    const ped = g.traffic.nearestPed(p.x, p.z, foot ? 2.6 : 3.5);
    if (ped) E.push({ label: fmt('act.talkPed', { name: ped.name }), dist: dist(p, ped) + 0.5, run: () => talkPed(g, ped) });
  }
  // việc của đơn hàng luôn ưu tiên (dist đã trừ 10), kể cả khi đang mờ để người chơi thấy hướng dẫn
  E.sort((a, b) => a.dist - b.dist);
  if (E.length) out.unshift({ key: 'E', ...E[0] });
  return out;
}

function mount(g) {
  g.mode = 'bike';
  g.walker.sitOn(g.bike);
  g.gs.flags.mounted = true;
  sfx.click();
}

function dismount(g) {
  g.mode = 'foot';
  g.walker.standUp(g.scene, g.bike);
  g.bike.speed = 0;
  g.bike.vel.set(0, 0);
}

// ======================== ĐIỆN THOẠI ========================
export function acceptOffer(g) {
  if (g.om.state !== S.OFFERED) return;
  const o = g.om.accept(g.clockMin, g.playerPos);
  if (!o) return;
  sfx.click();
  const what = o.kind === 'ride' ? fmt('toast.acceptedRide', { customer: o.customer }) : fmt('toast.acceptedFood', { place: o.pickup.name });
  g.hud.toast(fmt('toast.accepted', { id: o.id, what, min: o.allowedMin }), 'good');
  if (o.story === 'wallet') g.gs.flags.walletOffered = true;
}

export function declineOffer(g) {
  if (g.om.decline(g.clockMin)) g.hud.toast(fmt('toast.declined'), 'info', 1800);
}

export function phoneAction(g, a) {
  const { om, gs } = g;
  if (a === 'online') {
    if (om.state === S.OFFLINE) {
      om.goOnline();
      gs.flags.online = true;
      g.hud.toast(fmt('toast.online'), 'good');
    } else om.goOffline();
  } else if (a === 'accept') acceptOffer(g);
  else if (a === 'decline') declineOffer(g);
  else if (a === 'call') callCustomer(g);
  else if (a === 'cancel') confirmCancel(g);
  else if (a === 'wallet') viewWallet(g);
  g.renderPhone();
}

function callCustomer(g) {
  const { om } = g;
  const o = om.order;
  if (!o) return;
  sfx.phone();
  if (om.state === S.NO_ANSWER) return noAnswer(g, true);
  const wasHidden = !o.revealed;
  const r = om.callCustomer(g.clockMin);
  g.advance(r.waitMin || 1, 'idle');
  const who = fmt('dlg.phoneCall', { customer: o.customer });
  if (wasHidden && r.revealed) say(g, who, '📱', fmt('dlg.callRevealed', { address: o.dropoff.address }));
  else if (om.state === S.TO_PICKUP || om.state === S.WAITING_FOOD) say(g, who, '📱', fmt('dlg.callPickup'));
  else say(g, who, '📱', fmt('dlg.callDelivering'));
}

function confirmCancel(g) {
  say(g, fmt('dlg.app'), '📱', fmt('dlg.cancelAsk'), [
    { label: fmt('dlg.cancelYes'), onSelect: () => g.om.cancel(fmt('cancel.driver'), g.clockMin, { byDriver: true }) },
    { label: fmt('dlg.cancelNo'), primary: true },
  ]);
}

// ======================== LẤY HÀNG ========================
export function pickup(g) {
  const { om } = g;
  const o = om.order;
  const now = g.clockMin;
  const n = npc(g, o.pickup.placeId);
  if (om.state === S.TO_PICKUP) {
    const r = om.arriveAtPickup(now);
    if (r.outOfStock) return outOfStock(g, r.item);
    return waitFood(g, fmt('dlg.queue', { customer: o.customer, min: Math.ceil(r.queueMin) }));
  }
  if (om.state === S.OUT_OF_STOCK) return outOfStock(g, ITEMS[o.missingItem]);
  if (om.state === S.WAITING_FOOD) {
    if (om.isFoodReady(now)) return say(g, n.name, n.portrait, fmt('dlg.ready'), [{ label: fmt('dlg.readyPack'), primary: true, onSelect: () => startPacking(g) }], { dismissible: false });
    return waitFood(g, fmt('dlg.notReady', { min: Math.ceil(om.minutesUntilReady(now)) }));
  }
}

function waitFood(g, text) {
  const { om } = g;
  const o = om.order;
  const n = npc(g, o.pickup.placeId);
  const left = Math.ceil(om.minutesUntilReady(g.clockMin));
  say(g, n.name, n.portrait, text, [
    { label: fmt('dlg.waitChoice', { min: left }), hint: fmt('dlg.waitHint'), primary: true, onSelect: () => { g.advance(left, 'idle'); if (g.state === 'play') startPacking(g); } },
    { label: fmt('dlg.waitLater'), hint: fmt('dlg.waitLaterHint') },
  ]);
}

function outOfStock(g, item) {
  const { om } = g;
  const o = om.order;
  const n = npc(g, o.pickup.placeId);
  const who = fmt('dlg.phoneCall', { customer: o.customer });
  say(g, n.name, n.portrait, fmt('dlg.outOfStock', { item: item.name }), [
    {
      label: fmt('dlg.oosCall'),
      onSelect: () => {
        sfx.phone();
        g.advance(2, 'idle');
        const r = om.resolveOutOfStock('call', g.clockMin);
        if (r.accepted) say(g, who, '📱', fmt('dlg.oosSubOk', { item: r.sub.name }), [{ label: fmt('dlg.oosSubOrder'), onSelect: () => waitFood(g, fmt('dlg.oosSubReady', { item: r.sub.name })) }]);
        else say(g, who, '📱', fmt('dlg.oosCancelled', { k: ECONOMY.cancelComp }));
      },
    },
    { label: fmt('dlg.oosCook'), hint: fmt('dlg.oosCookHint'), onSelect: () => { om.resolveOutOfStock('cook', g.clockMin); waitFood(g, fmt('dlg.oosCookReply')); } },
    { label: fmt('dlg.oosCancel'), hint: fmt('dlg.oosCancelHint'), onSelect: () => om.resolveOutOfStock('cancel', g.clockMin) },
  ], { dismissible: false });
}

function startPacking(g) {
  const { om, gs } = g;
  const items = om.collectFood(g.clockMin);
  if (!items) return;
  const node = buildPacking({
    items,
    bag: gs.bagSpec,
    onDone: (mods) => {
      g.modal.hide();
      om.finishPacking(mods, g.clockMin);
      const bad = mods.filter((m) => m.crushed || m.heatNeighbor).length + items.filter((it, i) => it.has('liquid') && !mods[i].upright).length;
      g.hud.toast(fmt(bad ? 'toast.packBad' : 'toast.packGood'), bad ? 'warn' : 'good');
    },
  });
  g.modal.show({ title: fmt('dlg.packTitle', { bag: gs.bagSpec.name }), node, dismissible: false, wide: true });
}

function boardPassenger(g) {
  const { om } = g;
  const o = om.order;
  om.boardPassenger(g.clockMin);
  sfx.click();
  g.hud.toast(fmt('toast.boarded', { customer: o.customer }), 'good');
}

// ======================== GIAO HÀNG ========================
export function dropoff(g) {
  const { om, gs } = g;
  const o = om.order;
  const now = g.clockMin;
  if (om.state === S.NO_ANSWER) return noAnswer(g);
  if (om.state === S.STAIRS) return stairs(g);
  const res = om.arriveAtDropoff(now);
  if (res === 'noAnswer') return noAnswer(g);
  if (res === 'stairs') return stairs(g);
  if (res === 'lift') {
    gs.spend(ECONOMY.parkingFee, 'parking', true);
    const n = npc(g, 'apartment');
    say(g, n.name, n.portrait, fmt('dlg.liftGuard', { fee: ECONOMY.parkingFee, floor: o.dropoff.floor }), [{ label: fmt('dlg.liftGo'), onSelect: () => { g.advance(ORDER.liftMin, 'walk', { indoor: true }); handOver(g); } }], { dismissible: false });
    return;
  }
  handOver(g);
}

function noAnswer(g, fromPhone = false) {
  const { om, gs } = g;
  const o = om.order;
  const text = fromPhone ? fmt('dlg.noAnswerPhone', { customer: o.customer }) : fmt('dlg.noAnswer', { customer: o.customer, calls: o.calls });
  say(g, fmt('dlg.doorstep'), '🔔', text, [
    {
      label: fmt('dlg.callAgain'),
      onSelect: () => {
        sfx.phone();
        const r = om.callCustomer(g.clockMin);
        g.advance(r.waitMin, 'idle');
        if (r.answered) say(g, fmt('dlg.phoneCall', { customer: o.customer }), '📱', fmt('dlg.answered'), [{ label: fmt('dlg.handOver'), primary: true, onSelect: () => handOver(g) }], { dismissible: false });
        else {
          gs.addEnergy(0, -ENERGY.mental.noAnswer);
          noAnswer(g);
        }
      },
    },
    {
      label: fmt('dlg.askNeighbor'),
      hint: fmt('dlg.askNeighborHint'),
      onSelect: () => {
        const r = om.askNeighbor(g.clockMin);
        say(g, fmt('dlg.neighbor'), '👵', fmt('dlg.neighborSays', { customer: o.customer, place: r.alt.name }), [{ label: fmt('dlg.neighborThanks') }]);
      },
    },
    {
      label: fmt('dlg.wait10'),
      onSelect: () => {
        const r = om.waitForCustomer(g.clockMin);
        g.advance(10, 'idle');
        if (g.state !== 'play') return;
        if (r.came) say(g, o.customer, '🙋', fmt('dlg.customerCame'), [{ label: fmt('dlg.handOver'), primary: true, onSelect: () => handOver(g) }], { dismissible: false });
        else noAnswer(g);
      },
    },
    {
      label: fmt('dlg.reportCancel'),
      disabled: o.calls < 3,
      hint: o.calls < 3 ? fmt('dlg.reportCancelLocked', { calls: o.calls }) : fmt('dlg.reportCancelOk', { k: ECONOMY.cancelComp }),
      onSelect: () => om.cancel(fmt('cancel.noAnswer'), g.clockMin, { byDriver: false, comp: ECONOMY.cancelComp }),
    },
  ]);
}

function stairs(g) {
  const { om, gs } = g;
  const o = om.order;
  const f = o.dropoff.floor;
  const cost = f * ENERGY.phys.stairFloor;
  const n = npc(g, 'apartment');
  say(g, n.name, n.portrait, fmt('dlg.stairs', { floor: f, fee: ECONOMY.parkingFee }), [
    {
      label: fmt('dlg.climb', { cost: cost.toFixed(0), min: Math.round(f * ORDER.stairMinPerFloor) }),
      hint: gs.phys < cost + 5 ? fmt('dlg.climbTired') : fmt('dlg.climbHint'),
      onSelect: () => {
        gs.spend(ECONOMY.parkingFee, 'parking', true);
        const r = om.resolveStairs('climb');
        gs.addEnergy(-cost, -2);
        const env = g.itemEnv(0, true);
        for (let i = 0; i < r.floors; i++) om.itemEvent('bump', 0.1, env);
        g.advance(r.minutes, 'walk', { indoor: true });
        if (g.state === 'play') handOver(g);
      },
    },
    {
      label: fmt('dlg.callDown'),
      hint: fmt('dlg.callDownHint'),
      onSelect: () => {
        gs.spend(ECONOMY.parkingFee, 'parking', true);
        const r = om.resolveStairs('callDown');
        sfx.phone();
        g.advance(r.minutes, 'idle');
        if (g.state === 'play') handOver(g);
      },
    },
  ], { dismissible: false });
}

function handOver(g) {
  const { om, gs } = g;
  const o = om.order;
  const receipt = om.handOver(g.clockMin);
  if (!receipt) return;
  gs.applyReceipt(receipt);
  const { ev, pay } = receipt;
  ev.refused || ev.stars <= 2 ? sfx.bad() : sfx.cash();
  const comment = ev.refused ? fmt('dlg.refusedComment') : pick(`comment.${ev.stars}`, o.id);
  const reasons = ev.reasons.map(([k, v]) => `<span class="tag">${fmt(`dmg.${k}`)} −${v.toFixed(0)}%</span>`).join('') || `<span class="tag ok">${fmt('receipt.noDamage')}</span>`;
  const pens = ev.penalties.map((p) => `<div class="kv"><span>${p.label}</span><b class="minus">−${p.value} ★</b></div>`).join('');
  const row = (l, v, cls = '') => `<div class="kv ${cls}"><span>${l}</span><b>${v}</b></div>`;
  const html = `<div class="receipt">
    <div class="stars-big ${ev.stars >= 4 ? 'good' : ev.stars <= 2 ? 'bad' : ''}">${stars(ev.stars)}</div>
    <div class="cmt">${o.customer}: ${comment}</div>
    ${row(fmt('receipt.condition'), `${ev.conditionPct.toFixed(0)}%`)}
    ${row(fmt('receipt.time'), fmt('receipt.timeValue', { min: Math.round(receipt.elapsed), allowed: o.allowedMin }))}
    <div class="tags">${reasons}</div>${pens}
    <div class="sep"></div>
    ${ev.refused ? row(fmt('receipt.refused'), '0k', 'minus') : `
    ${row(fmt('receipt.base'), fmtK(pay.baseFare))}
    ${row(fmt('receipt.dist', { km: o.distanceKm.toFixed(1) }), '+' + fmtK(pay.distBonus))}
    ${row(fmt('receipt.fee'), '−' + fmtK(pay.fee), 'minus')}
    ${row(fmt('receipt.tax'), '−' + fmtK(pay.tax), 'minus')}
    ${row(fmt('receipt.fuel', { liters: o.liters.toFixed(2) }), '−' + fmtK(pay.fuelCost), 'minus')}
    ${row(fmt('receipt.final'), fmtK(pay.final), 'total')}
    ${row(fmt('receipt.tip'), '+' + fmtK(pay.tip))}`}
    <div class="sep"></div>
    ${row(fmt('receipt.wallet'), '+' + fmtK(pay.walletCredit), 'total')}
    ${row(fmt('receipt.rating'), '⭐ ' + gs.rating.toFixed(2))}
  </div>`;
  g.modal.show({
    title: fmt('receipt.title', { id: o.id }),
    html,
    choices: [{ label: fmt('receipt.continue'), primary: true, onSelect: () => afterDelivery(g, o) }],
    onClose: () => afterDelivery(g, o),
  });
}

function afterDelivery(g, o) {
  g.clearTempNpcs();
  g.checkEnd();
  if (o.story === 'wallet' && g.gs.findWallet()) {
    sfx.ping();
    say(g, fmt('dlg.you'), '🤔', fmt('dlg.walletFound'), [{ label: fmt('dlg.walletOpen'), primary: true, onSelect: () => viewWallet(g) }]);
  }
}

// ======================== NHIỆM VỤ CHIẾC VÍ ========================
export function viewWallet(g) {
  const { gs } = g;
  if (!gs.hasItem('wallet')) return;
  say(g, fmt('dlg.walletTitle'), '👛', fmt('dlg.walletInside', { cash: WALLET_QUEST.cash }), [
    { label: fmt('dlg.walletReturnPlan'), primary: true, onSelect: () => g.hud.toast(fmt('toast.walletKeep'), 'good') },
    {
      label: fmt('dlg.walletTake', { cash: WALLET_QUEST.cash }),
      hint: fmt('dlg.walletTakeHint'),
      onSelect: () => {
        gs.keepWalletCash();
        sfx.bad();
        say(g, fmt('dlg.app'), '📱', fmt('dlg.walletComplaint', { fine: WALLET_QUEST.complaintFine, n: WALLET_QUEST.keepPenaltyStars.length, rating: gs.rating.toFixed(2) }), [{ label: fmt('dlg.ellipsis') }]);
        g.checkEnd();
      },
    },
  ]);
}

// ======================== ĐỊA ĐIỂM ========================
export function placeAction(g, pl) {
  const { gs } = g;
  const p = { place: pl.name, npc: pl.npc ? pl.npc.name : '' };
  switch (pl.kind) {
    case 'home': return { label: fmt('act.home', p), run: () => landlord(g) };
    case 'restaurant': return { label: fmt('act.restaurant', p), needFoot: true, run: () => restaurant(g, pl) };
    case 'gas': return { label: fmt('act.gas', p), run: () => gas(g, pl) };
    case 'shop': return { label: fmt('act.shop', p), needFoot: true, run: () => gearShop(g) };
    case 'garage': return { label: fmt('act.garage', p), needFoot: true, run: () => garage(g) };
    case 'cafe': return { label: gs.flags.wallet === 4 ? fmt('act.cafeMinh', p) : fmt('act.cafe', p), needFoot: true, run: () => cafe(g, pl) };
    case 'taphoa': return { label: fmt('act.taphoa', p), needFoot: true, run: () => taphoa(g) };
    case 'gate': return { label: fmt('act.gate', p), needFoot: true, run: () => gate(g) };
    case 'apartment': return { label: fmt('act.apartment', p), run: () => say(g, pl.npc.name, pl.npc.portrait, placeLine('apartment', 'greet')) };
    default: return null;
  }
}

function landlord(g) {
  const { gs } = g;
  const n = npc(g, 'home');
  const busy = !!g.om.order;
  const can = gs.money >= gs.rent && !busy;
  say(g, n.name, n.portrait, can ? fmt('npc.home.greetCan', { rent: gs.rent }) : fmt('npc.home.greet', { rent: gs.rent, money: fmtK(gs.money) }), [
    {
      label: fmt('dlg.payRent', { rent: gs.rent }),
      disabled: !can,
      hint: busy ? fmt('dlg.payRentBusy') : can ? fmt('dlg.payRentOk') : fmt('dlg.payRentShort', { k: Math.ceil(gs.rent - gs.money) }),
      primary: can,
      onSelect: () => {
        const r = gs.payRent(g.clockMin);
        if (r.ok) g.checkEnd();
      },
    },
    {
      label: fmt('dlg.nap', { min: ENERGY.nap.minutes }),
      hint: fmt('dlg.napHint', { phys: ENERGY.nap.phys, mental: ENERGY.nap.mental }),
      disabled: !!g.om.hasCargo,
      onSelect: () => { g.advance(ENERGY.nap.minutes, 'idle', { indoor: true, waiting: false }); gs.addEnergy(ENERGY.nap.phys + ENERGY.nap.minutes * 0.02, ENERGY.nap.mental); },
    },
    { label: fmt('dlg.backToWork') },
  ]);
}

// Lựa chọn ăn / uống theo trường "serves" của địa điểm (sửa trong công cụ)
function serviceChoices(g, pl) {
  const { gs } = g;
  const out = [];
  if (pl.serves === 'meal') out.push({ label: fmt('dlg.meal', { cost: ENERGY.meal.cost }), hint: fmt('dlg.mealHint', { phys: ENERGY.meal.phys }), disabled: gs.money < ENERGY.meal.cost, onSelect: () => { gs.spend(ENERGY.meal.cost, 'meal'); g.advance(15, 'idle', { waiting: false }); gs.addEnergy(ENERGY.meal.phys, ENERGY.meal.mental); g.hud.toast(fmt('toast.meal'), 'good'); } });
  if (pl.serves === 'drink') out.push({ label: fmt('dlg.drink', { cost: ENERGY.drink.cost }), hint: fmt('dlg.drinkHint', { mental: ENERGY.drink.mental }), disabled: gs.money < ENERGY.drink.cost, onSelect: () => { gs.spend(ENERGY.drink.cost, 'meal'); g.advance(10, 'idle', { waiting: false }); gs.addEnergy(ENERGY.drink.phys, ENERGY.drink.mental); g.hud.toast(fmt('toast.drink'), 'good'); } });
  return out;
}

function restaurant(g, pl) {
  const n = npc(g, pl.id);
  say(g, n.name, n.portrait, placeLine(pl.id, 'greet'), [...serviceChoices(g, pl), { label: fmt('dlg.leave') }]);
}

function gas(g, pl) {
  const { gs } = g;
  const n = npc(g, pl.id);
  if (dist(g.bike.pos, pl.door) > 9) return say(g, n.name, n.portrait, fmt('dlg.gasTooFar'));
  const r = gs.refuel();
  if (r.ok) {
    g.advance(2, 'idle', { waiting: false });
    sfx.cash();
    g.hud.toast(fmt('toast.refuel', { msg: r.msg }), 'good');
  } else say(g, n.name, n.portrait, `"${r.msg}"`);
}

function gearShop(g) {
  const { gs } = g;
  const n = npc(g, 'gear');
  // mọi túi (trừ túi nylon miễn phí) + mọi đồ nghề trong gear.json
  const items = [...Object.values(BAGS).filter((b) => b.price > 0).map((b) => ['bags', b]), ...Object.values(GEAR).map((x) => ['gear', x])];
  const choices = items.map(([cat, s]) => {
    const owned = gs.owned[cat].includes(s.id);
    const swap = cat === 'bags' && owned && gs.bag !== s.id;
    return {
      label: `${owned ? '✔ ' : ''}${s.name} – ${s.price}k`,
      hint: owned ? fmt(swap ? 'dlg.shopUseBag' : 'dlg.shopOwned') : s.desc,
      disabled: (owned && !swap) || (!owned && gs.money < s.price),
      keepOpen: true,
      onSelect: () => {
        if (owned) gs.bag = s.id;
        else {
          const r = gs.buy(cat, s.id);
          g.hud.toast(r.ok ? fmt('toast.bought', { msg: r.msg }) : r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) sfx.cash();
        }
        g.bike.setBag(gs.bagSpec);
        gearShop(g);
      },
    };
  });
  const free = Object.values(BAGS).find((b) => b.price === 0);
  if (free && gs.bag !== free.id) choices.push({ label: fmt('dlg.shopUseNylon'), keepOpen: true, onSelect: () => { gs.bag = free.id; g.bike.setBag(gs.bagSpec); gearShop(g); } });
  choices.push({ label: fmt('dlg.shopExit') });
  g.modal.show({ speaker: n.name, portrait: n.portrait, text: fmt('dlg.shopIntro', { money: fmtK(gs.money), bag: gs.bagSpec.name }), choices, wide: true });
}

function garage(g) {
  const { gs } = g;
  const n = npc(g, 'garage');
  const choices = Object.values(VEHICLES).map((v) => {
    const owned = gs.owned.vehicles.includes(v.id);
    const using = gs.vehicle === v.id;
    return {
      label: `${using ? '🛵 ' : owned ? '✔ ' : ''}${v.name}${owned ? '' : ` – ${v.price}k`}`,
      hint: fmt('dlg.garageSpec', { kmh: Math.round(v.maxSpeed * 3.6), susp: Math.round(v.suspension * 100), fuel: v.fuelPer100km, desc: v.desc }),
      disabled: using || (!owned && gs.money < v.price),
      keepOpen: true,
      onSelect: () => {
        if (owned) {
          gs.vehicle = v.id;
          gs.fuel = Math.min(gs.fuel, v.tank);
        } else {
          const r = gs.buy('vehicles', v.id);
          g.hud.toast(r.ok ? fmt('toast.boughtVehicle', { msg: r.msg }) : r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) sfx.win();
        }
        g.bike.setSpec(gs.vehicleSpec);
        garage(g);
      },
    };
  });
  choices.push({
    label: fmt('dlg.repair', { cost: ECONOMY.repairCost }),
    hint: fmt('dlg.repairHint', { hp: gs.bikeHp.toFixed(0) }),
    disabled: gs.bikeHp >= 99 || gs.money < ECONOMY.repairCost || dist(g.bike.pos, g.layout.placeById.garage.door) > 10,
    keepOpen: true,
    onSelect: () => { const r = gs.repair(); g.hud.toast(r.msg, r.ok ? 'good' : 'bad'); garage(g); },
  });
  choices.push({ label: fmt('dlg.shopExit') });
  g.modal.show({ speaker: n.name, portrait: n.portrait, text: fmt('dlg.garageIntro', { money: fmtK(gs.money) }), choices, wide: true });
}

function cafe(g, pl) {
  const { gs } = g;
  if (gs.flags.wallet === 4) {
    return say(g, fmt('npc.minh.name'), '🙋‍♂️', fmt('dlg.minhGreet'), [
      {
        label: fmt('dlg.minhReturn'),
        primary: true,
        onSelect: () => {
          gs.returnWallet();
          sfx.win();
          g.addChat(fmt('npc.minh.name'), fmt('chat.minhThanks'));
          g.hud.toast(fmt('toast.walletReturned', { k: WALLET_QUEST.reward }), 'good', 5000);
        },
      },
    ], { dismissible: false });
  }
  const n = npc(g, pl.id);
  say(g, n.name, n.portrait, placeLine(pl.id, 'greet'), [...serviceChoices(g, pl), { label: fmt('dlg.leave') }]);
}

function taphoa(g) {
  const { gs } = g;
  const n = npc(g, 'taphoa');
  if (gs.flags.wallet === 1 || gs.flags.wallet === 2) {
    gs.flags.wallet = 3;
    return say(g, n.name, n.portrait, fmt('npc.taphoa.clue'), [{ label: fmt('npc.taphoa.clueThanks') }]);
  }
  say(g, n.name, n.portrait, fmt('npc.taphoa.greet'), [
    { label: fmt('npc.taphoa.water'), hint: fmt('npc.taphoa.waterHint'), disabled: gs.money < 10, onSelect: () => { gs.spend(10, 'meal'); gs.addEnergy(8, 3); } },
    { label: fmt('dlg.leave') },
  ]);
}

function gate(g) {
  const { gs } = g;
  const n = npc(g, 'gate');
  if (gs.flags.wallet === 3) {
    gs.flags.wallet = 4;
    return say(g, n.name, n.portrait, fmt('npc.gate.clue'), [{ label: fmt('npc.gate.clueReply') }]);
  }
  if (gs.flags.wallet >= 4) return say(g, n.name, n.portrait, fmt('npc.gate.after'));
  say(g, fmt('dlg.gateTitle'), '🚪', fmt('dlg.gateNobody'));
}

// ======================== NGƯỜI ĐI ĐƯỜNG ========================
function talkPed(g, ped) {
  const { om, gs } = g;
  ped.talk = 6;
  const o = om.order;
  if (o && !o.revealed && o.zone && dist(ped, o.zone) < o.zone.r + 22) {
    om.reveal();
    return say(g, ped.name, '🧑', fmt('dlg.pedReveal', { customer: o.customer, address: o.dropoff.address }), [{ label: fmt('dlg.thanks') }]);
  }
  if (gs.flags.wallet === 1) {
    gs.flags.wallet = 2;
    return say(g, ped.name, '🧑', fmt('dlg.pedTaphoa'), [{ label: fmt('dlg.pedTaphoaOk') }]);
  }
  const police = g.hz.activePolice(g.clockMin).find((p) => !g.knownPolice.has(p.id));
  if (police && Math.random() < 0.6) {
    g.knownPolice.add(police.id);
    return say(g, ped.name, '🧑', fmt('dlg.pedPolice', { place: intersectionName(...police.node) }), [{ label: fmt('dlg.thanks') }]);
  }
  say(g, ped.name, '🧑', pick('ped.smallTalk', ped.id + Math.floor(g.clockMin / 30)));
}

// ======================== CSGT ========================
export function policeStop(g, p, speed) {
  const { gs, bike } = g;
  const speeding = speed > ECONOMY.speedLimit;
  bike.speed = 0;
  bike.vel.set(0, 0);
  sfx.whistle();
  const kmh = Math.round(speed * 3.6);
  say(g, fmt('dlg.police'), '👮', speeding ? fmt('dlg.policeSpeeding', { kmh, fine: ECONOMY.policeFine }) : fmt('dlg.policeCheck'), [
    {
      label: speeding ? fmt('dlg.policePay', { fine: ECONOMY.policeFine }) : fmt('dlg.policeShow'),
      onSelect: () => {
        if (speeding) {
          gs.spend(ECONOMY.policeFine, 'fine', true);
          gs.stats.fines += 1;
          gs.addEnergy(0, -ENERGY.mental.fine);
          sfx.bad();
        } else gs.addEnergy(0, -ENERGY.mental.police / 2);
        g.advance(speeding ? 15 : 6, 'idle');
      },
    },
  ], { dismissible: false });
}

// ======================== TÚI ĐỒ ========================
export function openInventory(g) {
  const { gs } = g;
  const v = gs.vehicleSpec, b = gs.bagSpec;
  const gear = Object.values(GEAR).filter((x) => gs.has(x.id)).map((x) => x.name).join(', ') || fmt('dlg.invNoGear');
  const choices = [];
  if (gs.hasItem('wallet')) choices.push({ label: fmt('dlg.invWallet'), onSelect: () => viewWallet(g) });
  choices.push({ label: fmt('dlg.invClose') });
  const row = (l, val) => `<div class="kv"><span>${l}</span><b>${val}</b></div>`;
  g.modal.show({
    title: fmt('dlg.invTitle'),
    html: row(fmt('dlg.invVehicle'), `${v.name} · ${gs.bikeHp.toFixed(0)}%`) +
      row(fmt('dlg.invFuel'), `${gs.fuel.toFixed(2)} / ${v.tank} L`) +
      row(fmt('dlg.invBag'), b.name) +
      row(fmt('dlg.invGear'), gear) +
      row(fmt('dlg.invItems'), gs.inventory.length ? fmt('dlg.invWalletItem') : fmt('dlg.invNone')),
    choices,
  });
}
