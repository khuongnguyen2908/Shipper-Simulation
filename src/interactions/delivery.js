// =============================================================
// TƯƠNG TÁC — Lấy hàng · giao hàng · nhiệm vụ chiếc ví
// (một phần của src/interactions.js — mọi thao tác người chơi; chữ lấy từ vi.json qua fmt())
// =============================================================
import { ECONOMY, ENERGY, ORDER, WALLET_QUEST } from '../data/balance.js';
import { APP, ORDER_TYPES } from '../data/apps.js';
import { ITEMS } from '../data/items.js';
import { S } from '../sim/OrderManager.js';
import { fmtK } from '../sim/economy.js';
import { fmt, pick, pickFor } from '../content/index.js';
import { personOf } from '../sim/people.js';
import { fmtClock } from '../sim/clock.js';
import { buildPacking } from '../ui/packing.js';
import { sound } from '../audio.js';
import { headOf } from '../ui/bubbles.js';
import { stars, say, npc, custVoice, npcVoice } from './common.js';
import { comfortKmh, appName } from './phone.js';

// ======================== LẤY HÀNG ========================
export function pickup(g) {
  const { om } = g;
  const o = om.order;
  const now = g.clockMin;
  const n = npc(g, o.pickup.placeId);
  if (o.kind === 'parcel') return parcelPickup(g);
  if (om.state === S.TO_PICKUP) {
    const r = om.arriveAtPickup(now);
    if (r.outOfStock) return outOfStock(g, r.item);
    return waitFood(g, fmt('dlg.queue', { ...npcVoice(g, n), customer: o.customer, min: Math.ceil(r.queueMin) }));
  }
  if (om.state === S.OUT_OF_STOCK) return outOfStock(g, ITEMS[o.missingItem]);
  if (om.state === S.WAITING_FOOD) {
    if (om.isFoodReady(now)) return say(g, n.name, n.portrait, fmt('dlg.ready', npcVoice(g, n)), [{ label: fmt('dlg.readyPack'), primary: true, onSelect: () => startPacking(g) }], { dismissible: false });
    return waitFood(g, fmt('dlg.notReady', { ...npcVoice(g, n), min: Math.ceil(om.minutesUntilReady(now)) }));
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
  say(g, n.name, n.portrait, fmt('dlg.outOfStock', { ...npcVoice(g, n), item: item.name }), [
    {
      label: fmt('dlg.oosCall'),
      onSelect: () => {
        sound('phone.call');
        g.advance(2, 'idle');
        const r = om.resolveOutOfStock('call', g.clockMin);
        if (r.accepted) say(g, who, '📱', fmt('dlg.oosSubOk', { ...custVoice(g, o), item: r.sub.name }), [{ label: fmt('dlg.oosSubOrder'), onSelect: () => waitFood(g, fmt('dlg.oosSubReady', { ...npcVoice(g, n), item: r.sub.name })) }]);
        else say(g, who, '📱', fmt('dlg.oosCancelled', { ...custVoice(g, o), k: APP.cancelComp }));
      },
    },
    { label: fmt('dlg.oosCook'), hint: fmt('dlg.oosCookHint'), onSelect: () => { om.resolveOutOfStock('cook', g.clockMin); waitFood(g, fmt('dlg.oosCookReply', npcVoice(g, n))); } },
    { label: fmt('dlg.oosCancel'), hint: fmt('dlg.oosCancelHint', { stars: APP.account.cancelStars }), onSelect: () => om.resolveOutOfStock('cancel', g.clockMin) },
  ], { dismissible: false });
}

// Người giao hàng ở điểm lấy: chủ shop (nếu là địa điểm) hoặc người gửi ở nhà dân
function sender(g, o) {
  return o.pickup.placeId ? npc(g, o.pickup.placeId) : { name: fmt('npc.sender.name'), portrait: '🧑' };
}

// Giao hàng / hỏa tốc: nhận hàng (đơn COD ứng tiền trước) rồi xếp túi
function parcelPickup(g) {
  const { om } = g;
  const o = om.order;
  const n = sender(g, o);
  if (om.state !== S.TO_PICKUP) return;
  if (o.cod && g.gs.money < o.cod) {
    return say(g, n.name, n.portrait, fmt('dlg.parcelNoMoney', { ...npcVoice(g, n), cod: o.cod }), [
      { label: fmt('dlg.parcelCancel'), onSelect: () => om.cancel(fmt('cancel.driver'), g.clockMin, { byDriver: true }) },
      { label: fmt('dlg.leave'), primary: true },
    ]);
  }
  say(g, n.name, n.portrait, o.cod ? fmt('dlg.parcelCod', { ...npcVoice(g, n), cod: o.cod }) : fmt('dlg.parcelReady', npcVoice(g, n)), [
    {
      label: fmt('dlg.parcelPack'),
      primary: true,
      onSelect: () => {
        const r = om.collectParcel(g.clockMin);
        if (!r || r.noMoney) return;
        sound('order.pickup');
        if (r.cod) sound('money.pay');
        startPacking(g, r.items);
      },
    },
  ], { dismissible: false });
}

// items: món đã nhận (giao hàng); bỏ trống = lấy món quán vừa làm xong (đồ ăn)
function startPacking(g, items = null) {
  const { om, gs } = g;
  items = items || om.collectFood(g.clockMin);
  if (!items) return;
  sound('order.pickup');
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

export function boardPassenger(g) {
  const { om } = g;
  const o = om.order;
  om.boardPassenger(g.clockMin);
  sound('order.boarded');
  // khách chào khi leo lên xe: bong bóng trên đầu khách + ghi log
  // câu chào hợp loại khách (thẻ [drunk] [vali] [hurry]… trong vi.json, mã loại khách ở apps.json → riderTypes) hoặc hợp tuổi ([elder])
  const hi = pickFor('bubble.riderHi', { ...personOf(o.customer), role: o.rider }, Math.floor(g.clockMin), custVoice(g, o));
  g.bubbles?.show('rider', () => headOf(g.passengerMesh, 1.9), hi);
  sound('chat.bubble');
  g.chatCh?.local('npc', o.customer, hi, { time: fmtClock(g.clockMin) });
  g.hud.toast(fmt('toast.boarded', { customer: o.customer, kmh: comfortKmh(g, o) }), 'good');
}

// ======================== GIAO HÀNG ========================
export function dropoff(g) {
  const { om, gs } = g;
  const o = om.order;
  const now = g.clockMin;
  if (om.state === S.NO_ANSWER) return noAnswer(g);
  if (om.state === S.STAIRS) return stairs(g);
  if (o?.scamToPolice) {
    om.arriveAtDropoff(now);
    const r = om.finishAtPolice(now);
    if (r) {
      sound('order.scamCaught');
      say(g, fmt('dlg.police'), '👮', fmt('dlg.scamCaught', { reward: r.reward }));
    }
    return;
  }
  const res = om.arriveAtDropoff(now);
  if (res === 'noAnswer') return noAnswer(g);
  if (res === 'bom') return bom(g);
  if (res === 'stairs') return stairs(g);
  if (res === 'lift') {
    gs.spend(ECONOMY.parkingFee, 'parking', true);
    g.markParkedSafe(); // đã gửi xe cho bảo vệ
    const n = npc(g, 'apartment');
    say(g, n.name, n.portrait, fmt('dlg.liftGuard', { fee: ECONOMY.parkingFee, floor: o.dropoff.floor }), [{ label: fmt('dlg.liftGo'), onSelect: () => { g.advance(ORDER.liftMin, 'walk', { indoor: true }); handOver(g); } }], { dismissible: false });
    return;
  }
  handOver(g);
}

export function noAnswer(g, fromPhone = false) {
  const { om, gs } = g;
  const o = om.order;
  const text = fromPhone ? fmt('dlg.noAnswerPhone', { customer: o.customer }) : fmt('dlg.noAnswer', { customer: o.customer, calls: o.calls });
  say(g, fmt('dlg.doorstep'), '🔔', text, [
    {
      label: fmt('dlg.callAgain'),
      onSelect: () => {
        sound('phone.call');
        const r = om.callCustomer(g.clockMin);
        g.advance(r.waitMin, 'idle');
        if (r.answered) say(g, fmt('dlg.phoneCall', { customer: o.customer }), '📱', fmt('dlg.answered', custVoice(g, o)), [{ label: fmt('dlg.handOver'), primary: true, onSelect: () => handOver(g) }], { dismissible: false });
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
        if (r.came) say(g, o.customer, '🙋', fmt('dlg.customerCame', custVoice(g, o)), [{ label: fmt('dlg.handOver'), primary: true, onSelect: () => handOver(g) }], { dismissible: false });
        else noAnswer(g);
      },
    },
    {
      label: fmt('dlg.reportCancel'),
      disabled: o.calls < 3,
      hint: o.calls < 3 ? fmt('dlg.reportCancelLocked', { calls: o.calls }) : fmt('dlg.reportCancelOk', { k: APP.cancelComp }),
      onSelect: () => om.cancel(fmt('cancel.noAnswer'), g.clockMin, { byDriver: false, comp: APP.cancelComp }),
    },
  ]);
}

// Khách bom hàng COD: năn nỉ (1 lần) hoặc mang hàng về trả shop
export function bom(g) {
  const { om } = g;
  const o = om.order;
  const type = ORDER_TYPES[o.type] || {};
  const choices = [];
  if (!o.persuaded && type.persuadeChance > 0) {
    choices.push({
      label: fmt('dlg.bomPersuade'),
      hint: fmt('dlg.bomPersuadeHint'),
      onSelect: () => {
        const r = om.persuadeBom(g.clockMin);
        g.advance(3, 'idle');
        if (g.state !== 'play') return;
        if (r && r.accepted) say(g, o.customer, '🙋', fmt('dlg.bomPersuadeOk', custVoice(g, o)), [{ label: fmt('dlg.handOver'), primary: true, onSelect: () => handOver(g) }], { dismissible: false });
        else say(g, o.customer, '😤', fmt('dlg.bomPersuadeFail'), [{ label: fmt('dlg.ellipsis'), onSelect: () => bom(g) }], { dismissible: false });
      },
    });
  }
  choices.push({
    label: fmt('dlg.bomReturn'),
    hint: fmt('dlg.bomReturnHint'),
    primary: !choices.length,
    onSelect: () => {
      om.startReturn(g.clockMin);
      sound('order.bom');
    },
  });
  choices.push({ label: fmt('dlg.bomWait') });
  say(g, o.customer, '🙅', fmt('dlg.bom', { ...custVoice(g, o), cod: o.cod }), choices);
}

export function returnParcel(g) {
  const { om } = g;
  const o = om.order;
  const n = sender(g, o);
  const r = om.returnToShop(g.clockMin);
  if (!r) return;
  sound('order.returned');
  say(g, n.name, n.portrait, fmt('dlg.returned', { ...npcVoice(g, n), refund: r.refund, fee: r.fee }));
}

// Khách xe ôm sợ quá đòi xuống giữa đường (game gọi khi mức thoải mái tụt dưới ngưỡng của loại khách)
export function passengerQuit(g) {
  const { om, gs } = g;
  const receipt = om.quitRide(g.clockMin, g.playerPos);
  if (!receipt) return;
  gs.applyReceipt(receipt);
  g.bike.speed *= 0.3;
  sound('order.quit');
  showReceipt(g, receipt);
}

function stairs(g) {
  const { om, gs } = g;
  const o = om.order;
  const f = o.dropoff.floor;
  const cost = f * ENERGY.phys.stairFloor * Math.max(0, 1 + gs.effect('stairsPct') / 100);
  const n = npc(g, 'apartment');
  say(g, n.name, n.portrait, fmt('dlg.stairs', { floor: f, fee: ECONOMY.parkingFee }), [
    {
      label: fmt('dlg.climb', { cost: cost.toFixed(0), min: Math.round(f * ORDER.stairMinPerFloor) }),
      hint: gs.phys < cost + 5 ? fmt('dlg.climbTired') : fmt('dlg.climbHint'),
      onSelect: () => {
        gs.spend(ECONOMY.parkingFee, 'parking', true);
        g.markParkedSafe(); // đã gửi xe cho bảo vệ
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
        g.markParkedSafe(); // đã gửi xe cho bảo vệ
        const r = om.resolveStairs('callDown');
        sound('phone.call');
        g.advance(r.minutes, 'idle');
        if (g.state === 'play') handOver(g);
      },
    },
  ], { dismissible: false });
}

function handOver(g) {
  const { om, gs } = g;
  // khách nghe máy xong mới lộ ra bom hàng (đơn thu hộ) → xử lý bom thay vì bấm "Giao hàng" mà không có gì xảy ra
  if (om.state === S.AT_DROPOFF && om.arriveAtDropoff(g.clockMin) === 'bom') return bom(g);
  const receipt = om.handOver(g.clockMin);
  if (!receipt) return;
  gs.applyReceipt(receipt);
  showReceipt(g, receipt);
}

// Hóa đơn sau mỗi đơn (giao xong, hoặc khách xe ôm bỏ xuống giữa đường)
export function showReceipt(g, receipt) {
  const { gs } = g;
  const { ev, pay, order: o } = receipt;
  const ride = o.kind === 'ride'; // chở khách: chấm theo mức thoải mái, lời khách kiểu đi xe
  sound(ev.refused || ev.stars <= 2 ? 'order.badStars' : 'order.done');
  const cv = custVoice(g, o);
  const comment = ev.refused ? fmt('dlg.refusedComment', cv) : receipt.quit ? fmt('dlg.quitComment', cv) : receipt.noPay ? fmt('dlg.noPayComment', cv) : ev.scared ? fmt('dlg.scaredComment', cv) : pick(`comment.${ride ? 'ride.' : ''}${ev.stars}`, o.id, cv);
  const reasons = ev.reasons.map(([k, v]) => `<span class="tag">${fmt(`dmg.${k}`)} −${v.toFixed(0)}%</span>`).join('') || `<span class="tag ok">${fmt(ride ? 'receipt.noDamageRide' : 'receipt.noDamage')}</span>`;
  const pens = ev.penalties.map((p) => `<div class="kv"><span>${p.label}</span><b class="minus">−${p.value} ★</b></div>`).join('');
  const row = (l, v, cls = '') => `<div class="kv ${cls}"><span>${l}</span><b>${v}</b></div>`;
  const pct = (v) => (Math.round(v * 1000) / 10).toLocaleString('vi-VN'); // 0.015 → "1,5"
  const extras = [
    receipt.quit ? row(fmt('receipt.quitNote', { pct: Math.round(receipt.traveled * 100) }), '', 'minus') : '',
    ev.scared ? row(fmt('receipt.scaredNote', { pct: Math.round(ECONOMY.scaredFarePct * 100) }), '', 'minus') : '',
    receipt.noPay ? row(fmt('receipt.noPay'), '0k', 'minus') : '',
  ].join('');
  const tipNotes = [receipt.bigTip ? row(fmt('receipt.bigTip'), '+' + fmtK(receipt.bigTip)) : '', receipt.earlyTip ? row(fmt('receipt.earlyTip'), '+' + fmtK(receipt.earlyTip)) : ''].join('');
  const html = `<div class="receipt">
    <div class="stars-big ${ev.stars >= 4 ? 'good' : ev.stars <= 2 ? 'bad' : ''}">${stars(ev.stars)}</div>
    <div class="cmt">${o.customer}: ${comment}</div>
    ${row(fmt(ride ? 'receipt.comfort' : 'receipt.condition'), `${ev.conditionPct.toFixed(0)}%`)}
    ${row(fmt('receipt.time'), fmt('receipt.timeValue', { min: Math.round(receipt.elapsed), allowed: o.allowedMin }))}
    <div class="tags">${reasons}</div>${pens}
    <div class="sep"></div>
    ${ev.refused ? row(fmt('receipt.refused'), '0k', 'minus') + (receipt.codLost ? row(fmt('receipt.codLost'), '−' + fmtK(receipt.codLost), 'minus') : '') : `
    ${extras}
    ${row(fmt('receipt.base'), fmtK(pay.baseFare))}
    ${row(fmt('receipt.dist', { km: o.distanceKm.toFixed(1) }), '+' + fmtK(pay.distBonus))}
    ${pay.surcharge ? row(fmt('receipt.surcharge'), '+' + fmtK(pay.surcharge)) : ''}
    ${pay.airportFee ? row(fmt('receipt.airportFee'), '+' + fmtK(pay.airportFee)) : ''}
    ${o.viaApp === false ? row(fmt('receipt.noAppFee'), '0k') : row(fmt('receipt.fee', { pct: pct(APP.platformFee) }), '−' + fmtK(pay.fee), 'minus') + row(fmt('receipt.tax', { pct: pct(APP.taxRate) }), '−' + fmtK(pay.tax), 'minus')}
    ${row(fmt('receipt.fuel', { liters: o.liters.toFixed(2) }), '−' + fmtK(pay.fuelCost), 'minus')}
    ${row(fmt('receipt.final'), fmtK(pay.final), 'total')}
    ${tipNotes}
    ${row(fmt('receipt.tip'), '+' + fmtK(pay.tip))}`}
    <div class="sep"></div>
    ${row(fmt('receipt.wallet'), '+' + fmtK(pay.walletCredit), 'total')}
    ${pay.cod ? row(fmt('receipt.cod'), '+' + fmtK(pay.cod), 'total') : ''}
    ${o.viaApp === false ? row(fmt('receipt.notRated'), '') : row(fmt('receipt.rating'), '⭐ ' + gs.rating.toFixed(2))}
  </div>`;
  g.modal.show({
    title: fmt(receipt.quit ? 'receipt.titleQuit' : ride ? 'receipt.titleRide' : 'receipt.title', { id: o.id }),
    html,
    choices: [{ label: fmt('receipt.continue'), primary: true, onSelect: () => afterDelivery(g, o) }],
    onClose: () => afterDelivery(g, o),
  });
}

function afterDelivery(g, o) {
  g.clearTempNpcs();
  g.checkEnd();
  if (o.story === 'wallet' && g.gs.findWallet()) {
    sound('quest.walletFound');
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
        sound('quest.walletKept');
        say(g, appName(g), '📱', fmt('dlg.walletComplaint', { fine: WALLET_QUEST.complaintFine, n: WALLET_QUEST.keepPenaltyStars.length, rating: gs.rating.toFixed(2) }), [{ label: fmt('dlg.ellipsis') }]);
        g.checkEnd();
      },
    },
  ]);
}
