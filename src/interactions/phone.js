// =============================================================
// TƯƠNG TÁC — Điện thoại: nhận / bỏ đơn, máy ảnh, túi đồ, gọi khách
// (một phần của src/interactions.js — mọi thao tác người chơi; chữ lấy từ vi.json qua fmt())
// =============================================================
import { ECONOMY } from '../data/balance.js';
import { APP, ORDER_TYPES, RIDER_TYPES } from '../data/apps.js';
import { GOODS, isAccessorySlot } from '../data/goods.js';
import { stepOf, storyEvent, chapterOf, inChapter } from '../sim/story.js';
import { S } from '../sim/OrderManager.js';
import { fmt } from '../content/index.js';
import { sound } from '../audio.js';
import { dist, stars, say, custVoice } from './common.js';
import { noAnswer, viewWallet } from './delivery.js';
import { gainText } from './places.js';

// ======================== ĐIỆN THOẠI ========================
export function acceptOffer(g) {
  if (g.om.state !== S.OFFERED) return;
  const o = g.om.accept(g.clockMin, g.playerPos);
  if (!o) return;
  sound('phone.accept');
  const what = o.kind === 'ride' ? fmt('toast.acceptedRide', { customer: o.customer })
    : o.kind === 'parcel' ? fmt('toast.acceptedParcel', { type: ORDER_TYPES[o.type]?.name || '', place: o.pickup.name })
    : fmt('toast.acceptedFood', { place: o.pickup.name });
  g.hud.toast(fmt('toast.accepted', { id: o.id, what, min: o.allowedMin }), 'good');
  if (o.story === 'wallet') g.gs.flags.walletOffered = true;
  g.waypoint = null; // nhận đơn thì bỏ chỉ đường tự chọn
}

export function declineOffer(g) {
  if (g.om.offer?.forced) return g.hud.toast(fmt('phone.forcedNoSkip'), 'info', 2500); // cuốc cốt truyện: không bỏ qua được
  if (!g.om.decline(g.clockMin)) return;
  sound('phone.decline');
  g.hud.toast(fmt('toast.declined'), 'info', 1800);
}

// App Máy ảnh: chụp = lưu game vào ô i (ô đã có ảnh thì hỏi trước khi chụp đè). Đang có đơn / ngồi trên xe… thì chưa cho.
function camShoot(g, i) {
  const block = g.camBlock();
  if (block) return g.hud.toast(block, 'warn', 3000);
  const old = g.photos()[i];
  const shoot = () => {
    const ph = g.photoSave(i);
    g.hud.toast(fmt('toast.camSaved', { n: i + 1, when: fmt('phone.camWhen', { day: ph.day, time: ph.time }) }), 'good', 3500);
    g.renderPhone();
  };
  if (!old) return shoot();
  g.modal.show({
    title: fmt('dlg.camOverTitle'),
    text: fmt('dlg.camOverText', { n: i + 1, when: fmt('phone.camWhen', { day: old.day, time: old.time }) }),
    choices: [{ label: fmt('dlg.camYes'), primary: true, onSelect: shoot }, { label: fmt('dlg.cancel') }],
  });
}
// Quay lại lúc chụp ảnh i (hỏi trước — tiến độ từ lúc đó tới giờ sẽ mất)
function camLoad(g, i) {
  const ph = g.photos()[i];
  if (!ph) return;
  const when = fmt('phone.camWhen', { day: ph.day, time: ph.time });
  g.modal.show({
    title: fmt('dlg.camLoadTitle', { when }),
    text: fmt('dlg.camLoadText', { n: i + 1 }),
    choices: [{ label: fmt('dlg.camYes'), primary: true, onSelect: () => { if (g.photoLoad(i)) g.hud.toast(fmt('toast.camLoaded', { when }), 'good', 4000); } }, { label: fmt('dlg.cancel') }],
  });
}

export function phoneAction(g, a, ds) {
  const { om, gs } = g;
  // bật app nhận đơn: phải vào hãng + đang đi đúng loại xe hãng yêu cầu
  const turningOn = om.state === S.OFFLINE && (a === 'online' || a === 'wantFood' || a === 'wantRide');
  // đang trong chương (đã hiện tên chương): chưa nhận đơn được — trừ bước cốt truyện bắt bật công tắc (hướng dẫn chương 1)
  if (turningOn && gs.story?.ch && inChapter(gs.story) && stepOf(gs.story)?.until?.type !== 'switch') {
    g.hud.toast(fmt('toast.storyNoOrders', { title: fmt(chapterOf(gs.story).title) }), 'warn', 4500);
    return g.renderPhone();
  }
  const block = turningOn && gs.workBlock();
  if (block) {
    const bp = gs.brandSpec && { brand: gs.brandSpec.name, kind: fmt(`power.${gs.brandSpec.power}`) };
    g.hud.toast(block === 'noBrand' ? fmt('toast.needBrand') : block === 'noUniform' ? fmt('toast.needUniform', bp) : fmt('toast.wrongVehicle', bp), 'warn', 4500);
    return g.renderPhone();
  }
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
  else if (a === 'cancelFlood') confirmFloodCancel(g);
  else if (a === 'wallet') viewWallet(g);
  else if (a === 'waypoint' && (g.layout.placeById[ds?.id] || g.bus?.byId?.[String(ds?.id).replace(/^stop:/, '')])) g.waypoint = ds.id; // bản đồ điện thoại: Chỉ đường (địa điểm hoặc 'stop:<trạm>')
  else if (a === 'waypointClear') g.waypoint = null;
  else if (a === 'wantFood' || a === 'wantRide') toggleWant(g, a === 'wantFood' ? 'food' : 'ride');
  else if (a === 'findBike') findBike(g);
  else if (a === 'bagUse') bagUse(g, ds?.id);
  else if (a === 'bagWear' || a === 'bagOff') bagWear(g, ds?.id, a === 'bagWear');
  else if (a === 'reply') {
    const r = g.gs.reply(ds?.thread, Number(ds?.i), g.clockMin);
    if (r) { sound('ui.click'); g.storyGainToast(r.gain); }
  }
  else if (a === 'readThread') g.gs.readThread(ds?.id);
  else if (a === 'camShoot') return camShoot(g, Number(ds?.i));
  else if (a === 'camLoad') return camLoad(g, Number(ds?.i));
  g.renderPhone();
}

// App Xe → 📍 Định vị xe: báo xe đang ở đường nào, cách bao xa, và chỉ đường tới xe
function findBike(g) {
  if (g.mode === 'bike') return g.hud.toast(fmt('toast.onBike'), 'info');
  const w = g.bikeWhere();
  g.waypoint = null;
  g.findBike = !w.towed; // xe bị cẩu: mục tiêu "chuộc xe" đã chỉ tới chỗ giữ xe
  sound('ui.click');
  g.hud.toast(fmt(w.towed ? 'toast.bikeTowedWhere' : 'toast.bikeWhere', { street: w.street || fmt('phone.bikeNoStreet'), dist: w.dist }), 'good', 6000);
}

// Túi đồ (app điện thoại): dùng 1 đồ dùng → mất vài phút, cộng thể lực / tinh thần…
export function bagUse(g, id) {
  const s = GOODS[id];
  const r = g.gs.useConsumable(id);
  if (r.ok) storyEvent(g.gs.story, `use:${id}`); // cốt truyện: đã dùng món này
  if (!s || !r.ok) return;
  if (r.minutes) g.advance(r.minutes, 'idle', { waiting: false });
  sound('place.use');
  g.hud.toast(fmt('toast.used', { name: s.name, gains: gainText(s.use || {}) }), 'good');
}

// Túi đồ: gắn / tháo phụ kiện (mũ bảo hiểm, áo mưa, áo khoác, kính, khẩu trang, găng tay) — phải dừng xe.
// Áo, quần, giày chỉ thay ở tủ đồ phòng trọ.
export function bagWear(g, id, on) {
  const s = GOODS[id];
  if (!s || s.type !== 'outfit') return;
  if (!isAccessorySlot(s.slot)) return g.hud.toast(fmt('toast.wearAtHome'), 'warn');
  if (g.mode === 'bike' && Math.abs(g.bike.speed) > 0.5) return g.hud.toast(fmt('toast.stopToWear'), 'warn');
  if (!(on ? g.gs.wear(id) : g.gs.takeOff(s.slot))) return;
  sound('place.wear');
  g.hud.toast(fmt(on ? 'toast.woreAcc' : 'toast.tookOffAcc', { name: s.name }), 'good', 1800);
  if (!on && g.mode === 'bike' && g.gs.noHelmet) g.hud.toast(fmt('toast.noHelmet'), 'warn', 5000);
  // cởi đồng phục hãng: app không nhận đơn mới nữa
  if (!on && s.slot === 'uniform' && s.brand === g.gs.brand) g.hud.toast(fmt('toast.uniformOff', { brand: g.gs.brandSpec?.name || '' }), 'warn', 4500);
}

// Công tắc GoShip: Giao hàng / Chở khách. Đang nghỉ mà bật một cái → chỉ bật đúng cái đó và lên mạng;
// tắt cái cuối cùng → nghỉ (đang chạy đơn thì chạy xong mới nghỉ — OrderManager.update).
function toggleWant(g, kind) {
  const { om, gs } = g;
  const key = kind === 'food' ? 'noFood' : 'noRide', other = kind === 'food' ? 'noRide' : 'noFood';
  const isOn = om.state !== S.OFFLINE && !gs.flags[key];
  if (isOn) {
    gs.flags[key] = true;
    if (om.wantsNothing() && (om.state === S.IDLE || om.state === S.OFFERED)) om.goOffline();
    return;
  }
  gs.flags[key] = false;
  if (om.state === S.OFFLINE) {
    gs.flags[other] = true;
    om.goOnline();
    gs.flags.online = true;
    g.hud.toast(fmt('toast.online'), 'good');
  }
}

function callCustomer(g) {
  const { om } = g;
  const o = om.order;
  if (!o) return;
  sound('phone.call');
  if (om.state === S.NO_ANSWER) return noAnswer(g, true);
  const wasHidden = !o.revealed;
  const r = om.callCustomer(g.clockMin);
  g.advance(r.waitMin || 1, 'idle');
  const who = fmt('dlg.phoneCall', { customer: o.customer });
  if (r.scam) say(g, who, '📱', fmt('dlg.callScam', custVoice(g, o)));
  else if (wasHidden && r.revealed && r.foreign) say(g, who, '📱', fmt('dlg.callForeign', { address: o.dropoff.address, min: r.waitMin }));
  else if (wasHidden && r.revealed) say(g, who, '📱', fmt('dlg.callRevealed', { ...custVoice(g, o), address: o.dropoff.address }));
  else if (om.state === S.TO_PICKUP || om.state === S.WAITING_FOOD) say(g, who, '📱', fmt('dlg.callPickup', custVoice(g, o)));
  else say(g, who, '📱', fmt('dlg.callDelivering', custVoice(g, o)));
}

// Tốc độ khách xe ôm chịu được (km/h) — theo loại khách, cộng trang bị
export function comfortKmh(g, o) {
  const rider = o && o.rider ? RIDER_TYPES[o.rider] : null;
  return Math.round((rider && rider.comfortKmh ? rider.comfortKmh : ECONOMY.speedLimit * 3.6) + g.gs.effect('comfortKmh'));
}

// Tên người nói khi app nhắn: tên hãng đang chạy (GripBike / CamSM), chưa vào hãng thì tên chung dlg.app
export const appName = (g) => g.gs.brandSpec?.name || fmt('dlg.app');

// Hủy vì ngập: chỉ khi chưa lấy hàng / chưa đón khách và chỗ lấy hoặc chỗ giao đang ngập → không bị trừ sao
function confirmFloodCancel(g) {
  if (!g.floodCancelOk()) return g.renderPhone();
  say(g, appName(g), '🌊', fmt('dlg.cancelFloodAsk'), [
    { label: fmt('dlg.cancelFloodYes'), onSelect: () => { if (g.floodCancelOk()) g.om.cancel(fmt('cancel.flood'), g.clockMin, { byDriver: false, flood: true }); } },
    { label: fmt('dlg.cancelNo'), primary: true },
  ]);
}

function confirmCancel(g) {
  say(g, appName(g), '📱', fmt('dlg.cancelAsk', { stars: APP.account.cancelStars }), [
    { label: fmt('dlg.cancelYes'), onSelect: () => g.om.cancel(fmt('cancel.driver'), g.clockMin, { byDriver: true }) },
    { label: fmt('dlg.cancelNo'), primary: true },
  ]);
}
