// =============================================================
// TƯƠNG TÁC & HỘI THOẠI — mọi thao tác của người chơi đi qua đây
// (lấy hàng, xếp túi, giao hàng, sự cố, cửa hàng, nhiệm vụ chiếc ví, CSGT…)
// Mọi chữ lấy từ kho chữ qua fmt() — sửa bằng công cụ ?editor.
// =============================================================
import { TIME, ECONOMY, ENERGY, ORDER, VEHICLES, BAGS, WALLET_QUEST, PARKING } from './data/balance.js';
import { APP, ORDER_TYPES, RIDER_TYPES } from './data/apps.js';
import { GOODS, OUTFIT_SLOTS } from './data/goods.js';
import { isOpen, fmtHours, placesUsing, placesSelling, unlocked, openDayOf } from './sim/placeRules.js';
import { ITEMS } from './data/items.js';
import { S } from './sim/OrderManager.js';
import { fmtK } from './sim/economy.js';
import { intersectionName } from './sim/cityLayout.js';
import { fmt, pick, has } from './content/index.js';
import { fmtClock, minutesUntil } from './sim/clock.js';
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
  if (pl && !pl.npc && pl.kind === 'scenery') return { name: pl.name, portrait: pl.icon || '🌳' }; // cảnh quan: không có người, lời là của nơi đó
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
  if (foot && dist(p, bike.pos) < 3.2 && Math.abs(g.walker.mesh.position.y - bike.mesh.position.y) < 1.5) {
    // xe bị cẩu về bãi → chuộc rồi mới lấy được
    if (g.gs.towed) out.push({ key: 'F', label: redeemLabel(g), dist: 0, run: () => redeemBike(g) });
    else out.push({ key: 'F', label: fmt('act.mount'), dist: 0, run: () => mount(g) });
  }
  if (!foot) out.push({ key: 'F', label: fmt('act.dismount'), dist: 0, disabled: !slow, run: () => dismount(g) });

  const E = [];
  const o = om.order;
  if (o) {
    const dp = dist(p, o.pickup.door);
    if (o.kind !== 'ride' && [S.TO_PICKUP, S.WAITING_FOOD, S.OUT_OF_STOCK].includes(om.state) && dp < 3.6) {
      E.push(foot ? { label: fmt('act.pickup', { place: o.pickup.name }), dist: dp - 10, run: () => pickup(g) } : { label: fmt('act.pickupNeedFoot'), dist: dp - 10, disabled: true });
    }
    // bị bom: mang hàng về trả shop
    if (om.state === S.RETURNING && dp < 3.6) {
      E.push(foot ? { label: fmt('act.returnParcel', { place: o.pickup.name }), dist: dp - 10, run: () => returnParcel(g) } : { label: fmt('act.deliverNeedFoot'), dist: dp - 10, disabled: true });
    }
    if (o.kind === 'ride' && om.state === S.TO_PICKUP && dp < 5.5) {
      E.push(!foot ? { label: fmt('act.board', { customer: o.customer }), dist: dp - 10, disabled: !slow, run: () => boardPassenger(g) } : { label: fmt('act.boardNeedBike'), dist: dp - 10, disabled: true });
    }
    if ([S.DELIVERING, S.AT_DROPOFF, S.NO_ANSWER, S.STAIRS].includes(om.state) && o.revealed) {
      const dd = dist(p, o.dropoff.door);
      if (o.kind !== 'ride' && dd < 3.6) E.push(foot ? { label: fmt('act.deliver', { customer: o.customer }), dist: dd - 10, run: () => dropoff(g) } : { label: fmt('act.deliverNeedFoot'), dist: dd - 10, disabled: true });
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
  g.gs.parked = null; // hết lần đậu
  g.mode = 'bike';
  g.walker.sitOn(g.bike);
  g.gs.flags.mounted = true;
  sfx.click();
}

function dismount(g) {
  g.mode = 'foot';
  g.walker.standUp(g.scene, g.bike);
  const w = g.walker, el = g.city.elev;
  if (w.deckY != null && el && el.heightAt(w.pos.x, w.pos.z, w.deckY, 0.35) == null) {
    w.pos.x = w._ex = g.bike.pos.x;
    w.pos.z = w._ez = g.bike.pos.z;
  }
  g.bike.speed = 0;
  g.bike.vel.set(0, 0);
  g.startParking(); // bãi giữ xe: gửi (trả tiền) · ngoài đường: để lâu có rủi ro
}

// Xe đang bị giữ ở đồn công an? (khác bãi giữ xe thường)
const towedAtStation = (g) => g.gs.towed && g.layout.placeById[g.gs.towed.placeId]?.kind === 'police';
function redeemLabel(g) {
  const { gs } = g;
  return towedAtStation(g)
    ? fmt('act.redeemBikePolice', { total: gs.towed.fee + gs.finesTotal })
    : fmt('act.redeemBike', { fee: gs.towed.fee });
}
// Chuộc xe bị cẩu rồi lên xe.
//  - ở đồn công an: phải đóng đủ tiền chuộc + mọi phạt nguội (thiếu thì chưa lấy được, đi bộ kiếm thêm)
//  - ở bãi giữ xe thường: trả phí (không đủ thì lấy hết tiền đang có)
function redeemBike(g, { ride = true } = {}) {
  const { gs } = g;
  if (towedAtStation(g)) {
    const total = gs.towed.fee + gs.finesTotal;
    if (gs.money < total) return g.hud.toast(fmt('toast.redeemShort', { total, need: Math.ceil(total - gs.money) }), 'warn', 6000);
    gs.spend(gs.towed.fee, 'tow');
    const fines = gs.payFines() || 0;
    gs.towed = null;
    sfx.cash();
    g.hud.toast(fmt('toast.redeemedPolice', { total, fines }), 'info', 6000);
  } else {
    const fee = Math.min(Math.max(0, gs.money), gs.towed.fee);
    gs.spend(fee, 'tow', true);
    gs.towed = null;
    sfx.cash();
    g.hud.toast(fmt('toast.redeemed', { fee }), 'info', 5000);
  }
  if (ride && dist(g.playerPos, g.bike.pos) < 3.2) mount(g);
}

// Đồn công an: nộp phạt nguội, lấy xe bị giữ
function policeChoices(g, pl) {
  const { gs } = g;
  const out = [];
  if (gs.towed && gs.towed.placeId === pl.id) {
    const total = gs.towed.fee + gs.finesTotal;
    out.push({
      label: fmt('dlg.policeRedeem', { total }),
      hint: gs.money >= total ? fmt('dlg.policeRedeemHint', { fee: gs.towed.fee, fines: gs.finesTotal }) : fmt('dlg.policeShort', { need: Math.ceil(total - gs.money) }),
      disabled: gs.money < total,
      primary: gs.money >= total,
      onSelect: () => redeemBike(g, { ride: false }),
    });
  } else if (gs.fines.length) {
    const total = gs.finesTotal;
    out.push({
      label: fmt('dlg.policeFines', { total }),
      hint: gs.money >= total ? fmt(gs.hasOverdueFines ? 'dlg.policeFinesLate' : 'dlg.policeFinesHint', { n: gs.fines.length }) : fmt('dlg.policeShort', { need: Math.ceil(total - gs.money) }),
      disabled: gs.money < total,
      primary: gs.money >= total,
      onSelect: () => {
        const paid = gs.payFines();
        if (paid == null) return;
        sfx.cash();
        g.hud.toast(fmt('toast.finePaid', { fine: paid }), 'good', 5000);
      },
    });
  }
  return out;
}

// ======================== ĐIỆN THOẠI ========================
export function acceptOffer(g) {
  if (g.om.state !== S.OFFERED) return;
  const o = g.om.accept(g.clockMin, g.playerPos);
  if (!o) return;
  sfx.click();
  const what = o.kind === 'ride' ? fmt('toast.acceptedRide', { customer: o.customer })
    : o.kind === 'parcel' ? fmt('toast.acceptedParcel', { type: ORDER_TYPES[o.type]?.name || '', place: o.pickup.name })
    : fmt('toast.acceptedFood', { place: o.pickup.name });
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

// Tốc độ khách xe ôm chịu được (km/h) — theo loại khách, cộng trang bị
export function comfortKmh(g, o) {
  const rider = o && o.rider ? RIDER_TYPES[o.rider] : null;
  return Math.round((rider && rider.comfortKmh ? rider.comfortKmh : ECONOMY.speedLimit * 3.6) + g.gs.effect('comfortKmh'));
}

function confirmCancel(g) {
  say(g, fmt('dlg.app'), '📱', fmt('dlg.cancelAsk', { stars: APP.account.cancelStars }), [
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
  if (o.kind === 'parcel') return parcelPickup(g);
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
        else say(g, who, '📱', fmt('dlg.oosCancelled', { k: APP.cancelComp }));
      },
    },
    { label: fmt('dlg.oosCook'), hint: fmt('dlg.oosCookHint'), onSelect: () => { om.resolveOutOfStock('cook', g.clockMin); waitFood(g, fmt('dlg.oosCookReply')); } },
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
    return say(g, n.name, n.portrait, fmt('dlg.parcelNoMoney', { cod: o.cod }), [
      { label: fmt('dlg.parcelCancel'), onSelect: () => om.cancel(fmt('cancel.driver'), g.clockMin, { byDriver: true }) },
      { label: fmt('dlg.leave'), primary: true },
    ]);
  }
  say(g, n.name, n.portrait, o.cod ? fmt('dlg.parcelCod', { cod: o.cod }) : fmt('dlg.parcelReady'), [
    {
      label: fmt('dlg.parcelPack'),
      primary: true,
      onSelect: () => {
        const r = om.collectParcel(g.clockMin);
        if (!r || r.noMoney) return;
        if (r.cod) sfx.cash();
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
  g.hud.toast(fmt('toast.boarded', { customer: o.customer, kmh: comfortKmh(g, o) }), 'good');
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
      hint: o.calls < 3 ? fmt('dlg.reportCancelLocked', { calls: o.calls }) : fmt('dlg.reportCancelOk', { k: APP.cancelComp }),
      onSelect: () => om.cancel(fmt('cancel.noAnswer'), g.clockMin, { byDriver: false, comp: APP.cancelComp }),
    },
  ]);
}

// Khách bom hàng COD: năn nỉ (1 lần) hoặc mang hàng về trả shop
function bom(g) {
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
        if (r && r.accepted) say(g, o.customer, '🙋', fmt('dlg.bomPersuadeOk'), [{ label: fmt('dlg.handOver'), primary: true, onSelect: () => handOver(g) }], { dismissible: false });
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
      sfx.bad();
    },
  });
  choices.push({ label: fmt('dlg.bomWait') });
  say(g, o.customer, '🙅', fmt('dlg.bom', { cod: o.cod }), choices);
}

function returnParcel(g) {
  const { om } = g;
  const o = om.order;
  const n = sender(g, o);
  const r = om.returnToShop(g.clockMin);
  if (!r) return;
  sfx.cash();
  say(g, n.name, n.portrait, fmt('dlg.returned', { refund: r.refund, fee: r.fee }));
}

// Khách xe ôm sợ quá đòi xuống giữa đường (game gọi khi mức thoải mái tụt dưới ngưỡng của loại khách)
export function passengerQuit(g) {
  const { om, gs } = g;
  const receipt = om.quitRide(g.clockMin, g.playerPos);
  if (!receipt) return;
  gs.applyReceipt(receipt);
  g.bike.speed *= 0.3;
  sfx.bad();
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
        sfx.phone();
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
function showReceipt(g, receipt) {
  const { gs } = g;
  const { ev, pay, order: o } = receipt;
  const ride = o.kind === 'ride'; // chở khách: chấm theo mức thoải mái, lời khách kiểu đi xe
  ev.refused || ev.stars <= 2 ? sfx.bad() : sfx.cash();
  const comment = ev.refused ? fmt('dlg.refusedComment') : receipt.quit ? fmt('dlg.quitComment') : receipt.noPay ? fmt('dlg.noPayComment') : ev.scared ? fmt('dlg.scaredComment') : pick(`comment.${ride ? 'ride.' : ''}${ev.stars}`, o.id);
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
// Mọi địa điểm dùng chung: lời chào + việc riêng (nếu có) + hoạt động + xem hàng.
// Hoạt động, hàng bán, giờ mở cửa đều lấy từ places.json (sửa bằng ?editor).
export function placeAction(g, pl) {
  const { gs } = g;
  const p = { place: pl.name, npc: pl.npc ? pl.npc.name : '' };
  const open = isOpen(pl, g.clockMin, gs.day);
  // chưa tới ngày khai trương → ghi "sắp khai trương", khác với ngoài giờ mở cửa
  const closed = open ? '' : !unlocked(pl, gs.day) ? fmt('act.soon', { day: openDayOf(pl) }) : fmt('act.closed', { hours: fmtHours(pl.hours) });
  const generic = (key, extra = {}) => ({ label: fmt(key, p) + closed, needFoot: true, run: () => openPlace(g, pl), ...extra });
  switch (pl.kind) {
    case 'home': return { label: fmt('act.home', p), run: () => landlord(g, pl) };
    case 'restaurant': return generic('act.restaurant');
    case 'gas': return { label: fmt('act.gas', p) + closed, run: () => openPlace(g, pl, gasChoices(g, pl)) };
    case 'shop': return generic('act.shop', { run: () => (open ? shopDialog(g, pl) : openPlace(g, pl)) });
    case 'garage': return generic('act.garage', { run: () => (open ? shopDialog(g, pl) : openPlace(g, pl)) });
    case 'cafe': return gs.flags.wallet === 4 ? { label: fmt('act.cafeMinh', p), needFoot: true, run: () => minhReturn(g) } : generic('act.cafe');
    case 'taphoa': return { label: fmt('act.taphoa', p) + closed, needFoot: true, run: () => taphoa(g, pl) };
    case 'gate': return { label: fmt('act.gate', p), needFoot: true, run: () => gate(g) };
    case 'apartment': return { label: fmt('act.apartment', p), run: () => openPlace(g, pl) };
    case 'market': return (pl.activities || []).length || hasStock(pl) ? generic('act.market') : null;
    case 'police': return generic('act.police', { run: () => openPlace(g, pl, policeChoices(g, pl)) });
    // cảnh quan (công viên, đất trống…): chỉ có nút E khi đã thêm hoạt động / hàng bán ở thẻ Địa điểm
    case 'scenery': return (pl.activities || []).length || hasStock(pl) ? generic('act.scenery') : null;
    default: return generic('act.service'); // 'service' và mọi loại mới tạo trong công cụ
  }
}

const hasStock = (pl) => !!pl.sells && ['goods', 'bags', 'vehicles'].some((k) => (pl.sells[k] || []).length);

// Hộp thoại chung của một địa điểm. extra = lựa chọn riêng đặt lên đầu.
function openPlace(g, pl, extra = [], text = null) {
  const n = npc(g, pl.id);
  if (!unlocked(pl, g.gs.day)) return say(g, n.name, n.portrait, fmt('dlg.soon', { day: openDayOf(pl), name: pl.name }));
  if (!isOpen(pl, g.clockMin)) return say(g, n.name, n.portrait, fmt('dlg.closed', { hours: fmtHours(pl.hours) }));
  const choices = [...extra, ...activityChoices(g, pl)];
  if (hasStock(pl)) choices.push({ label: fmt('dlg.browseShop'), onSelect: () => shopDialog(g, pl) });
  choices.push({ label: fmt('dlg.leave') });
  say(g, n.name, n.portrait, text ?? placeLine(pl.id, 'greet'), choices);
}

const placeShort = (p) => p.short || p.name;
// "Chùa, Nhà thờ" — nơi dùng được một món mang theo
function whereUsed(g, goodsId) {
  const list = placesUsing(goodsId, g.layout.places);
  return list.length ? list.map(placeShort).join(', ') : fmt('dlg.nowhere');
}

// "+20 tinh thần · +5 thể lực"
function gainText(o) {
  const parts = [];
  const sign = (v) => (v > 0 ? `+${v}` : `${v}`);
  if (o.phys) parts.push(fmt('dlg.gainPhys', { n: sign(o.phys) }));
  if (o.mental) parts.push(fmt('dlg.gainMental', { n: sign(o.mental) }));
  if (o.fuel) parts.push(fmt('dlg.gainFuel', { n: o.fuel }));
  if (o.bikeHp) parts.push(fmt('dlg.gainHp', { n: o.bikeHp }));
  return parts.join(' · ');
}

function activityChoices(g, pl) {
  return [...placeActivities(g, pl), ...napChoices(g, pl)];
}

function placeActivities(g, pl) {
  const { gs } = g;
  return (pl.activities || []).map((act) => {
    const st = gs.activityStatus(pl, act, g.clockMin);
    const used = gs.activityUses[`${pl.id}.${act.id}`] || 0;
    const label = fmt(act.cost ? 'dlg.activity' : 'dlg.activityFree', { label: act.label, cost: act.cost, min: act.minutes });
    let hint = gainText(act);
    const need = act.needs && GOODS[act.needs.id];
    const needP = need && { n: act.needs.qty || 1, icon: need.icon || '', name: need.name, have: gs.countOf(need.id) };
    if (need) hint = [fmt('dlg.needsUse', needP), hint].filter(Boolean).join(' · ');
    if (act.perDay > 0) hint += ` · ${fmt('dlg.usesLeft', { n: Math.max(0, act.perDay - used), max: act.perDay })}`;
    if (act.stopOnOrder) hint += ` · ${fmt('dlg.stopOnOrder')}`;
    if (st === 'usedUp') hint = fmt('dlg.usedUp', { n: act.perDay });
    if (st === 'needItem') {
      const shops = placesSelling(need.id, g.layout.places);
      hint = shops.length ? fmt('dlg.needItem', { ...needP, where: shops.map(placeShort).join(', ') }) : fmt('dlg.needItemNoShop', needP);
    }
    if (st === 'money') hint = fmt('dlg.noMoney');
    return {
      label,
      hint,
      disabled: st !== 'ok',
      onSelect: () => {
        const r = gs.doActivity(pl, act, g.clockMin);
        if (!r.ok) return;
        if (r.minutes) g.advance(r.minutes, 'idle', { indoor: true, waiting: false, stopOnOffer: !!act.stopOnOrder });
        sfx.cash();
        g.hud.toast(fmt('toast.activity', { label: act.label, gains: gainText(act) }), 'good');
        if (act.stopOnOrder && g.om.state === S.OFFERED) g.hud.toast(fmt('toast.orderWake'), 'info', 4000);
      },
    };
  });
}

function gasChoices(g, pl) {
  const { gs } = g;
  const n = npc(g, pl.id);
  return [{
    label: fmt('dlg.refuelChoice'),
    primary: true,
    onSelect: () => {
      if (dist(g.bike.pos, pl.door) > 9) return say(g, n.name, n.portrait, fmt('dlg.gasTooFar'));
      const r = gs.refuel();
      if (r.ok) {
        g.advance(2, 'idle', { waiting: false });
        sfx.cash();
        g.hud.toast(fmt('toast.refuel', { msg: r.msg }), 'good');
      } else say(g, n.name, n.portrait, `"${r.msg}"`);
    },
  }];
}

// Cửa hàng chung: đồ dùng, túi, xe mà địa điểm này bán (places.json → sells)
function shopDialog(g, pl) {
  const { gs } = g;
  const n = npc(g, pl.id);
  const sells = pl.sells || {};
  const reopen = () => shopDialog(g, pl);
  const choices = [];
  for (const id of sells.goods || []) {
    const s = GOODS[id];
    if (!s) continue;
    const consumable = s.type === 'consumable', carry = s.type === 'carry', outfit = s.type === 'outfit';
    const owned = (s.type === 'equipment' && gs.has(id)) || (outfit && gs.ownsOutfit(id));
    choices.push({
      label: `${owned ? '✔ ' : ''}${s.icon || ''} ${s.name} – ${s.price}k`,
      hint: owned ? fmt(outfit ? 'dlg.outfitOwned' : 'dlg.shopOwned')
        : consumable ? fmt('dlg.goodsCount', { n: gs.countOf(id), desc: s.desc || '', gains: gainText(s.use || {}) })
        : carry ? fmt('dlg.carryShop', { n: gs.countOf(id), desc: s.desc || '', where: whereUsed(g, id) })
        : outfit ? fmt('dlg.outfitShop', { slot: fmt(`outfit.slot.${s.slot}`), desc: s.desc || '' })
        : s.desc,
      disabled: owned || gs.money < s.price,
      keepOpen: true,
      onSelect: () => {
        const r = gs.buy('goods', id);
        g.hud.toast(r.ok ? fmt(outfit ? 'toast.boughtOutfit' : 'toast.bought', { msg: r.msg }) : r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) sfx.cash();
        reopen();
      },
    });
  }
  for (const id of sells.bags || []) {
    const s = BAGS[id];
    if (!s) continue;
    const owned = gs.owned.bags.includes(id);
    const swap = owned && gs.bag !== id;
    choices.push({
      label: `${owned ? '✔ ' : ''}👜 ${s.name} – ${s.price}k`,
      hint: owned ? fmt(swap ? 'dlg.shopUseBag' : 'dlg.shopOwned') : s.desc,
      disabled: (owned && !swap) || (!owned && gs.money < s.price),
      keepOpen: true,
      onSelect: () => {
        if (owned) gs.bag = id;
        else {
          const r = gs.buy('bags', id);
          g.hud.toast(r.ok ? fmt('toast.bought', { msg: r.msg }) : r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) sfx.cash();
        }
        g.bike.setBag(gs.bagSpec);
        reopen();
      },
    });
  }
  if ((sells.bags || []).length) {
    const free = Object.values(BAGS).find((b) => b.price === 0);
    if (free && gs.bag !== free.id && gs.owned.bags.includes(free.id)) choices.push({ label: fmt('dlg.shopUseNylon'), keepOpen: true, onSelect: () => { gs.bag = free.id; g.bike.setBag(gs.bagSpec); reopen(); } });
  }
  for (const id of sells.vehicles || []) {
    const v = VEHICLES[id];
    if (!v) continue;
    const owned = gs.owned.vehicles.includes(id);
    const using = gs.vehicle === id;
    choices.push({
      label: `${using ? '🛵 ' : owned ? '✔ ' : ''}${v.name}${owned ? '' : ` – ${v.price}k`}`,
      hint: fmt('dlg.garageSpec', { kmh: Math.round(v.maxSpeed * 3.6), susp: Math.round(v.suspension * 100), fuel: v.fuelPer100km, desc: v.desc }),
      disabled: using || (!owned && gs.money < v.price),
      keepOpen: true,
      onSelect: () => {
        if (owned) {
          gs.vehicle = id;
          gs.fuel = Math.min(gs.fuel, v.tank);
        } else {
          const r = gs.buy('vehicles', id);
          g.hud.toast(r.ok ? fmt('toast.boughtVehicle', { msg: r.msg }) : r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) sfx.win();
        }
        g.bike.setSpec(gs.vehicleSpec);
        reopen();
      },
    });
  }
  if (pl.kind === 'garage') {
    choices.push({
      label: fmt('dlg.repair', { cost: ECONOMY.repairCost }),
      hint: fmt('dlg.repairHint', { hp: gs.bikeHp.toFixed(0) }),
      disabled: gs.bikeHp >= 99 || gs.money < ECONOMY.repairCost || dist(g.bike.pos, pl.door) > 10,
      keepOpen: true,
      onSelect: () => { const r = gs.repair(); g.hud.toast(r.msg, r.ok ? 'good' : 'bad'); reopen(); },
    });
  }
  choices.push(...activityChoices(g, pl).map((c) => ({ ...c, onSelect: () => { c.onSelect(); } })));
  choices.push({ label: fmt('dlg.shopExit') });
  const intro = pl.kind === 'shop' ? fmt('dlg.shopIntro', { money: fmtK(gs.money), bag: gs.bagSpec.name })
    : pl.kind === 'garage' ? fmt('dlg.garageIntro', { money: fmtK(gs.money) })
    : fmt('dlg.shopTitle', { money: fmtK(gs.money) });
  g.modal.show({ speaker: n.name, portrait: n.portrait, text: intro, choices, wide: true });
}

function landlord(g, pl) {
  const { gs } = g;
  const busy = !!g.om.order;
  const paid = gs.rentPaid;
  const can = !paid && gs.money >= gs.rent && !busy;
  const extra = [
    {
      label: paid ? fmt('dlg.rentPaid', { day: gs.rentDueDay }) : fmt('dlg.payRent', { rent: gs.rent, day: gs.rentDueDay }),
      disabled: !can,
      hint: paid ? '' : busy ? fmt('dlg.payRentBusy') : can ? fmt('dlg.payRentOk') : fmt('dlg.payRentShort', { k: Math.ceil(gs.rent - gs.money) }),
      primary: can,
      onSelect: () => {
        const r = gs.payRent();
        if (r.ok) {
          sfx.cash();
          g.hud.toast(fmt('toast.rentPaid', { rent: fmtK(r.paid), day: gs.rentDueDay }), 'good', 6000);
        }
      },
    },
    ...sleepChoices(g),
    { label: fmt('dlg.wardrobe'), hint: fmt('dlg.wardrobeHint'), onSelect: () => wardrobe(g) },
  ];
  const text = paid ? fmt('npc.home.greetPaid', { day: gs.rentDueDay }) : can ? fmt('npc.home.greetCan', { rent: gs.rent, day: gs.rentDueDay }) : fmt('npc.home.greet', { rent: gs.rent, day: gs.rentDueDay, money: fmtK(gs.money) });
  openPlace(g, pl, extra, text);
}

// Chợp mắt ở địa điểm được tick "Cho chợp mắt ở đây" (places.json → nap): 2 lựa chọn ngắn / dài, có đơn thì dậy
function napChoices(g, pl) {
  if (!pl.nap || pl.kind === 'home') return [];
  const S2 = ENERGY.sleep;
  const k = S2.napMul ?? 0.6;
  const busy = !!g.om.order || g.om.state === S.OFFERED;
  const online = g.om.state !== S.OFFLINE;
  return [['dlg.napShort', S2.napShortMin ?? 30], ['dlg.napLong', S2.napLongMin ?? 120]].map(([key, min]) => ({
    label: fmt(key, { min, h: +(min / 60).toFixed(1), time: fmtClock(g.clockMin + min) }),
    hint: busy ? fmt('dlg.sleepBusy')
      : fmt(online ? 'dlg.napHint' : 'dlg.napHintOff', { phys: Math.round((S2.physPerHour * k * min) / 60), mental: Math.round((S2.mentalPerHour * k * min) / 60) }),
    disabled: busy,
    onSelect: () => {
      const r = g.nap(min);
      if (!r) return;
      sfx.click();
      const p = { min: r.slept, time: fmtClock(g.clockMin), phys: Math.round(g.gs.phys), mental: Math.round(g.gs.mental) };
      g.hud.toast(fmt(r.byOrder ? 'toast.napOrder' : 'toast.napDone', p), r.byOrder ? 'info' : 'good', 6000);
    },
  }));
}

// Ngủ: 2 / 4 / 6 / 8 tiếng hoặc tới 06:00 sáng. Đang chạy đơn thì không ngủ được.
function sleepChoices(g) {
  const { gs } = g;
  const S = ENERGY.sleep;
  const busy = !!g.om.order;
  const opt = (min, key) => ({
    label: fmt(key, { h: +(min / 60).toFixed(1), time: fmtClock(g.clockMin + min) }),
    hint: busy ? fmt('dlg.sleepBusy') : fmt('dlg.sleepHint', { phys: Math.round((S.physPerHour * min) / 60), mental: Math.round((S.mentalPerHour * min) / 60) }),
    disabled: busy,
    onSelect: () => {
      if (g.sleep(min) == null) return;
      sfx.click();
      g.hud.toast(fmt('toast.woke', { time: fmtClock(g.clockMin), phys: Math.round(gs.phys), mental: Math.round(gs.mental) }), 'good', 7000);
    },
  });
  const untilMorning = minutesUntil(g.clockMin, TIME.dayStart / 60);
  const list = [2, 4, 6, 8].map((h) => opt(h * 60, 'dlg.sleep'));
  // "tới sáng" khi còn ≤ 10 tiếng nữa là 06:00 (đêm khuya)
  if (untilMorning <= 10 * 60 && ![2, 4, 6, 8].includes(untilMorning / 60)) list.unshift({ ...opt(untilMorning, 'dlg.sleepUntil'), primary: !busy });
  return list;
}

// "Áo thun xanh lá · Quần jean · Mũ bảo hiểm xanh lá"
function wornText(gs) {
  return Object.values(gs.wornGoods()).map((x) => `${x.icon || ''} ${x.name}`).join(' · ') || fmt('dlg.invNone');
}

// Tủ đồ ở phòng trọ: mặc trang phục đã mua (đồ giá 0 có sẵn)
function wardrobe(g) {
  const { gs } = g;
  const worn = gs.wornIds();
  const choices = [];
  for (const slot of Object.keys(OUTFIT_SLOTS)) {
    for (const s of Object.values(GOODS)) {
      if (s.type !== 'outfit' || s.slot !== slot || !gs.ownsOutfit(s.id)) continue;
      const on = worn[slot] === s.id;
      choices.push({
        label: `${on ? '✔ ' : ''}${s.icon || ''} ${s.name}`,
        hint: fmt(on ? 'dlg.wardrobeWearing' : 'dlg.wardrobeItem', { slot: fmt(`outfit.slot.${slot}`), desc: s.desc || '' }),
        disabled: on,
        keepOpen: true,
        onSelect: () => {
          gs.wear(s.id);
          sfx.click();
          wardrobe(g);
        },
      });
    }
  }
  choices.push({ label: fmt('dlg.wardrobeClose') });
  g.modal.show({ title: fmt('dlg.wardrobeTitle'), text: fmt('dlg.wardrobeIntro', { worn: wornText(gs) }), choices, wide: true });
}

function minhReturn(g) {
  const { gs } = g;
  say(g, fmt('npc.minh.name'), '🙋‍♂️', fmt('dlg.minhGreet'), [
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

function taphoa(g, pl) {
  const { gs } = g;
  const n = npc(g, 'taphoa');
  if (gs.flags.wallet === 1 || gs.flags.wallet === 2) {
    gs.flags.wallet = 3;
    return say(g, n.name, n.portrait, fmt('npc.taphoa.clue'), [{ label: fmt('npc.taphoa.clueThanks') }]);
  }
  openPlace(g, pl);
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
  // còn phạt nguội quá hạn → tạm giữ xe về đồn công an gần nhất (đóng hết mới lấy lại)
  const station = gs.hasOverdueFines && !g.om.hasCargo && g.nearestStation();
  if (station) {
    say(g, fmt('dlg.police'), '👮', fmt('dlg.policeImpound', { fine: gs.finesTotal, place: station.name }), [{
      label: fmt('dlg.policeImpoundOk'),
      onSelect: () => {
        dismount(g);
        g.towBikeTo(station, PARKING.towFee ?? 150);
        gs.addEnergy(0, -ENERGY.mental.fine);
        sfx.bad();
        g.advance(10, 'idle');
      },
    }], { dismissible: false });
    return;
  }
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
  const gear = Object.values(GOODS).filter((x) => x.type === 'equipment' && gs.has(x.id)).map((x) => `${x.icon || ''} ${x.name}`).join(', ') || fmt('dlg.invNoGear');
  const choices = [];
  // đồ dùng 1 lần: bấm để dùng (đồ mang theo thì chỉ dùng ở địa điểm)
  for (const [id, n] of Object.entries(gs.consumables)) {
    const s = GOODS[id];
    if (!s || n <= 0 || s.type !== 'consumable') continue;
    choices.push({
      label: fmt('dlg.invUse', { icon: s.icon || '', name: s.name, n, min: s.use?.minutes || 0 }),
      hint: gainText(s.use || {}),
      onSelect: () => {
        const r = gs.useConsumable(id);
        if (!r.ok) return;
        if (r.minutes) g.advance(r.minutes, 'idle', { waiting: false });
        sfx.click();
        g.hud.toast(fmt('toast.used', { name: s.name, gains: gainText(s.use || {}) }), 'good');
        if (g.state === 'play') openInventory(g);
      },
    });
  }
  if (gs.hasItem('wallet')) choices.push({ label: fmt('dlg.invWallet'), onSelect: () => viewWallet(g) });
  choices.push({ label: fmt('dlg.invClose') });
  const row = (l, val) => `<div class="kv"><span>${l}</span><b>${val}</b></div>`;
  const held = (type) => Object.entries(gs.consumables).filter(([id, n]) => GOODS[id]?.type === type && n > 0);
  const cons = held('consumable').map(([id, n]) => `${GOODS[id].icon || ''} ${GOODS[id].name} ×${n}`).join(', ');
  const carry = held('carry').map(([id, n]) => fmt('dlg.carryItem', { icon: GOODS[id].icon || '', name: GOODS[id].name, n, where: whereUsed(g, id) })).join('<br>');
  g.modal.show({
    title: fmt('dlg.invTitle'),
    html: row(fmt('dlg.invVehicle'), `${v.name} · ${gs.bikeHp.toFixed(0)}%`) +
      row(fmt('dlg.invFuel'), `${gs.fuel.toFixed(2)} / ${v.tank} L`) +
      row(fmt('dlg.invBag'), b.name) +
      row(fmt('dlg.invGear'), gear) +
      row(fmt('dlg.invOutfit'), wornText(gs)) +
      row(fmt('dlg.invConsumables'), cons || fmt('dlg.invNone')) +
      (carry ? row(fmt('dlg.invCarry'), carry) : '') +
      row(fmt('dlg.invItems'), gs.inventory.length ? fmt('dlg.invWalletItem') : fmt('dlg.invNone')),
    choices,
  });
}
