// =============================================================
// TƯƠNG TÁC — Sự cố giữa đường · cản trở giao thông · xe buýt · nhà trọ, ngủ, tủ đồ · người đi đường · CSGT
// (một phần của src/interactions.js — mọi thao tác người chơi; chữ lấy từ vi.json qua fmt())
// =============================================================
import { TIME, ECONOMY, ENERGY, WALLET_QUEST, PARKING, LIGHTS } from '../data/balance.js';
import { GOODS, OUTFIT_SLOTS, isAccessorySlot } from '../data/goods.js';
import { stepOf, chapterOf } from '../sim/story.js';
import { S } from '../sim/OrderManager.js';
import { fmtK } from '../sim/economy.js';
import { intersectionName, routeDist } from '../sim/cityLayout.js';
import { tierLabel } from '../sim/roads.js';
import { routeDestinations, inService, busRule } from '../sim/bus.js';
import { fmt, pickFor } from '../content/index.js';
import { personOf } from '../sim/people.js';
import { fmtClock, minutesUntil, isDark } from '../sim/clock.js';
import { sound } from '../audio.js';
import { splitPages } from '../ui/modal.js';
import { dist, say, npc, voice, custVoice, pedVoice } from './common.js';
import { dismount } from './nearby.js';
import { bagUse, bagWear } from './phone.js';
import { showReceipt } from './delivery.js';
import { openPlace } from './places.js';

// ======================== SỰ CỐ GIỮA ĐƯỜNG (khách xe ôm) ========================
// Gọi từ game khi OrderManager báo 'rideEvent': khách đổi điểm đến / khách lừa đảo đòi rẽ vào hẻm vắng
export function rideEventDialog(g, ev) {
  const { om, gs } = g;
  const o = om.order;
  if (!o) return;
  g.bike.speed *= 0.4; // khách vỗ vai, tài xế chạy chậm lại nghe
  if (ev.type === 'changeDest') {
    const km = (Math.round((ev.extra * 10) / 100) / 10).toFixed(1);
    say(g, o.customer, '🧍', fmt(ev.pays ? 'dlg.changeDestPay' : 'dlg.changeDestFree', { ...custVoice(g, o), address: ev.alt.address, km }), [
      {
        label: fmt('dlg.changeDestYes', custVoice(g, o)),
        primary: true,
        onSelect: () => {
          const r = om.resolveChangeDest(true, g.clockMin, g.playerPos);
          if (r) g.hud.toast(fmt(r.pays ? 'toast.changeDestPay' : 'toast.changeDestFree', { address: o.dropoff.address, km: r.extraKm.toFixed(1) }), 'info', 5000);
        },
      },
      {
        label: fmt('dlg.changeDestNo', custVoice(g, o)),
        hint: fmt('dlg.changeDestNoHint'),
        onSelect: () => {
          const receipt = om.resolveChangeDest(false, g.clockMin, g.playerPos);
          if (!receipt) return;
          gs.applyReceipt(receipt);
          g.bike.speed = 0;
          showReceipt(g, receipt);
        },
      },
    ], { dismissible: false });
    return;
  }
  if (ev.type === 'scam') {
    const choices = [
      { label: fmt('dlg.scamComply'), onSelect: () => scamResult(g, om.resolveScam('comply', g.clockMin)) },
      { label: fmt('dlg.scamRefuse'), hint: fmt('dlg.scamRefuseHint'), primary: true, onSelect: () => scamResult(g, om.resolveScam('refuse', g.clockMin)) },
    ];
    if (ev.station) choices.push({ label: fmt('dlg.scamPolice', { place: ev.station.name }), hint: fmt('dlg.scamPoliceHint'), onSelect: () => { om.resolveScam('police', g.clockMin); g.hud.toast(fmt('toast.scamToPolice', { place: ev.station.name }), 'warn', 6000); } });
    say(g, o.customer, '🧍', fmt('dlg.scamAsk', custVoice(g, o)), choices, { dismissible: false });
  }
}
function scamResult(g, r) {
  if (!r) return;
  g.bike.speed = 0;
  if (r.robbed != null) {
    sound('order.robbed');
    g.shake = Math.max(g.shake, 0.5);
    const msg = fmt('dlg.scamRobbed', { amount: fmtK(r.robbed) });
    say(g, fmt('dlg.scamTitle'), '🕵️', msg);
    g.addChat(fmt('chat.ward'), fmt('chat.robbed', { amount: fmtK(r.robbed) }));
  } else if (r.refused) say(g, fmt('dlg.scamTitle'), '🕵️', fmt('dlg.scamRefused'));
}

// ======================== CẢN TRỞ GIAO THÔNG ========================
// Đứng chắn xe quá lâu (game.blockTick): công an tới đưa vào lề, lập biên bản phạt nguội — nộp ở đồn công an
export function blockTicket(g) {
  const { gs } = g, fine = ECONOMY.blockFine ?? 100;
  g.moveToCurb();
  g.spawnCop();
  gs.addFine(fine, 'blocking', g.clockMin);
  sound('law.whistle');
  const p = g.playerPos;
  const station = g.layout.places.filter((x) => x.kind === 'police' && x.door).sort((a, b) => routeDist(p, a.door) - routeDist(p, b.door))[0];
  const done = () => g.hud.toast(fmt('toast.blockFined', { fine }), 'bad', 5000);
  say(g, fmt('npc.trafficCop.name'), '👮', fmt('dlg.blockTicket', { ...voice(g, fmt('npc.trafficCop.name')), fine, place: station?.name || fmt('dlg.blockTicketAnyStation') }), [{ label: fmt('dlg.blockTicketOk'), onSelect: done }], { dismissible: false });
}

// ======================== XE BUÝT ========================
// Chọn trạm xuống trước khi lên xe; xe chạy một chiều theo vòng tuyến → chọn nhầm thì phải đi tiếp / chờ chuyến khác.
// Trạm có nhiều tuyến: các dòng tuyến (chấm màu + tên) xếp dọc; bấm tuyến nào thì danh sách trạm của tuyến đó xổ ra
// ngay bên dưới (theo thứ tự xe chạy), bấm lại thì thu vào. openId: tuyến đang mở (null = chưa mở tuyến nào)
export function busDialog(g, stop, openId = null, reopen = false) {
  const { gs } = g, now = g.clockMin, fare = busRule('fare', 7);
  const speaker = fmt('dlg.busSpeaker', { stop: stop.name });
  // mở / thu một tuyến: vẽ lại hộp thoại tại chỗ, không ghi thêm lời vào ô chat
  const speak = (text, choices) => (reopen ? g.modal.show({ speaker, portrait: '🚏', text, choices }) : say(g, speaker, '🚏', text, choices));
  if (g.om.order?.kind === 'ride' && g.om.hasCargo) return speak(fmt('dlg.busPassenger'));
  const noService = fmt('dlg.busNoService', { from: busRule('from', 5), to: busRule('to', 21) });
  if (!inService(now)) return speak(noService);
  const routes = stop.routes.map((ref) => g.bus.routeById[ref.id]).filter((r) => r && !r.error);
  if (!routes.length) return speak(noService);
  const single = routes.length === 1;
  const stopsOf = (r) => routeDestinations(g.bus, r.id, stop.id, now).filter((d) => inService(d.trip.board)).map((d) => ({
    label: fmt('dlg.busStopDest', { stop: d.stop.name }),
    hint: fmt('dlg.busDestHint', { wait: Math.round(d.trip.wait), ride: Math.round(d.trip.ride), at: fmtClock(d.trip.arrive) }),
    disabled: gs.money < fare,
    cls: single ? '' : 'sub',
    onSelect: () => rideBus(g, d, fare),
  }));
  const choices = [];
  if (single) choices.push(...stopsOf(routes[0]));
  else for (const r of routes) {
    const open = r.id === openId;
    choices.push({ label: fmt(open ? 'dlg.busRouteOpen' : 'dlg.busRouteClosed', { color: r.color || '#1e8449', route: r.name }), hint: open ? '' : fmt('dlg.busRouteHint'), primary: open, cls: 'group', keepOpen: true, onSelect: () => busDialog(g, stop, open ? null : r.id, true) });
    if (open) {
      const list = stopsOf(r);
      choices.push(...(list.length ? list : [{ label: noService, disabled: true, cls: 'sub' }]));
    }
  }
  choices.push({ label: fmt('dlg.leave') });
  speak(fmt('dlg.bus', { fare, money: fmtK(gs.money) }) + (single ? '' : `<br>${fmt('dlg.busPickRoute')}`), choices);
}
function rideBus(g, d, fare) {
  g.gs.spend(fare, 'bus');
  sound('money.pay');
  g.advance(d.trip.total, 'idle', { indoor: true, waiting: true, quiet: true });
  const w = d.stop.wait, wk = g.walker;
  wk.pos.set(w.x, 0, w.z);
  wk._ex = w.x;
  wk._ez = w.z;
  wk.deckY = null;
  sound('city.busArrive');
  g.hud.toast(fmt('toast.busArrive', { stop: d.stop.name, time: fmtClock(g.clockMin), min: Math.round(d.trip.total) }), 'good', 5000);
}

export function landlord(g, pl) {
  const { gs } = g;
  if (gs.flags.story === 0 && gs.story?.ch) { // cốt truyện: chưa tới lúc nói chuyện (sắp tới lượt thì chờ chút)
    if (stepOf(gs.story)?.talk?.place === pl.id) return;
    const n = npc(g, pl.id);
    // đã nói chuyện với cô ở bước trước trong chương (vd vừa xếp hũ chao xong) → câu nhắc đi làm việc, không hỏi lại "Ủa con tới rồi hả?"
    const ch = chapterOf(gs.story), met = ch && ch.steps.slice(0, Math.max(0, gs.story.step)).some((x) => x.talk?.place === pl.id);
    return g.storyConverse({ mesh: g.npcs[pl.id] || null, name: n.name, pages: splitPages(fmt(met ? 'story.coHaiLater' : 'story.coHaiEarly')) });
  }
  if (gs.flags.story === 0) return landlordIntro(g, pl); // lần đầu gặp: Cô Hai cho xe đạp
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
          sound('money.rentPaid');
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
export function napChoices(g, pl) {
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
      sound('place.nap');
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
  // muốn ngủ phải chạy xe vào hầm, xuống xe dựng trong hầm (xe đang bị cẩu thì thôi — xe không có ở đây)
  const noBike = !gs.towed && !g.bikeInGarage();
  const why = busy ? fmt('dlg.sleepBusy') : noBike ? fmt(g.mode === 'bike' ? 'dlg.sleepDismount' : 'dlg.sleepGarage') : '';
  const opt = (min, key) => ({
    label: fmt(key, { h: +(min / 60).toFixed(1), time: fmtClock(g.clockMin + min) }),
    hint: why || fmt('dlg.sleepHint', { phys: Math.round((S.physPerHour * min) / 60), mental: Math.round((S.mentalPerHour * min) / 60) }),
    disabled: !!why,
    onSelect: () => {
      if (g.sleep(min) == null) return;
      sound('place.sleep');
      g.hud.toast(fmt('toast.woke', { time: fmtClock(g.clockMin), phys: Math.round(gs.phys), mental: Math.round(gs.mental) }), 'good', 7000);
    },
  });
  const untilMorning = minutesUntil(g.clockMin, TIME.dayStart / 60);
  const list = [2, 4, 6, 8].map((h) => opt(h * 60, 'dlg.sleep'));
  // "tới sáng" khi còn ≤ 10 tiếng nữa là 06:00 (đêm khuya)
  if (untilMorning <= 10 * 60 && ![2, 4, 6, 8].includes(untilMorning / 60)) list.unshift({ ...opt(untilMorning, 'dlg.sleepUntil'), primary: !why });
  return list;
}

// Mở đầu: lần đầu tới nhà trọ gặp Cô Hai — khuyên đi chạy xe công nghệ, cho chiếc xe đạp cũ (xuất hiện trong hầm xe)
function landlordIntro(g, pl) {
  const n = npc(g, pl.id);
  say(g, n.name, n.portrait, fmt('dlg.landlordIntro', { name: g.gs.profile.name }), [{
    label: fmt('dlg.landlordIntroOk'),
    primary: true,
    onSelect: () => {
      g.gs.flags.story = 1;
      g.placeAtHomeBike();
      sound('place.gotBike');
      g.hud.toast(fmt('toast.gotBike'), 'big', 6000);
    },
  }], { dismissible: false });
}

// "Áo thun xanh lá · Quần jean · Mũ bảo hiểm xanh lá"
function wornText(gs) {
  return Object.values(gs.wornGoods()).map((x) => `${x.icon || ''} ${x.name}`).join(' · ') || fmt('dlg.invNone');
}

// Tủ đồ ở phòng trọ: mặc trang phục đã mua (đồ giá 0 có sẵn); phụ kiện đang đeo thì bấm để tháo
function wardrobe(g) {
  const { gs } = g;
  const worn = gs.wornIds();
  const choices = [];
  for (const slot of Object.keys(OUTFIT_SLOTS)) {
    const acc = isAccessorySlot(slot);
    for (const s of Object.values(GOODS)) {
      if (s.type !== 'outfit' || s.slot !== slot || !gs.ownsOutfit(s.id) || !gs.canWear(s.id)) continue;
      const on = worn[slot] === s.id;
      choices.push({
        label: `${on ? '✔ ' : ''}${s.icon || ''} ${s.name}`,
        hint: fmt(on ? (acc ? 'dlg.wardrobeTakeOff' : 'dlg.wardrobeWearing') : 'dlg.wardrobeItem', { slot: fmt(`outfit.slot.${slot}`), desc: s.desc || '' }),
        disabled: on && !acc,
        keepOpen: true,
        onSelect: () => {
          if (on) gs.takeOff(slot);
          else gs.wear(s.id);
          sound('place.wear');
          wardrobe(g);
        },
      });
    }
  }
  choices.push({ label: fmt('dlg.wardrobeClose') });
  g.modal.show({ title: fmt('dlg.wardrobeTitle'), text: fmt('dlg.wardrobeIntro', { worn: wornText(gs) }), choices, wide: true });
}

export function minhReturn(g) {
  const { gs } = g;
  say(g, fmt('npc.minh.name'), '🙋‍♂️', fmt('dlg.minhGreet', voice(g, fmt('npc.minh.name'))), [
    {
      label: fmt('dlg.minhReturn'),
      primary: true,
      onSelect: () => {
        gs.returnWallet();
        sound('quest.walletReturned');
        g.addChat(fmt('npc.minh.name'), fmt('chat.minhThanks', voice(g, fmt('npc.minh.name'))));
        g.hud.toast(fmt('toast.walletReturned', { k: WALLET_QUEST.reward }), 'good', 5000);
      },
    },
  ], { dismissible: false });
}

export function taphoa(g, pl) {
  const { gs } = g;
  const n = npc(g, 'taphoa');
  if (gs.flags.wallet === 1 || gs.flags.wallet === 2) {
    gs.flags.wallet = 3;
    return say(g, n.name, n.portrait, fmt('npc.taphoa.clue'), [{ label: fmt('npc.taphoa.clueThanks') }]);
  }
  openPlace(g, pl);
}

export function gate(g) {
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
export function talkPed(g, ped) {
  const { om, gs } = g;
  ped.talk = 6;
  const o = om.order;
  if (o && !o.revealed && o.zone && dist(ped, o.zone) < o.zone.r + 22) {
    om.reveal();
    return say(g, ped.name, '🧑', fmt('dlg.pedReveal', { ...pedVoice(g, ped), customer: o.customer, address: o.dropoff.address }), [{ label: fmt('dlg.thanks') }]);
  }
  if (gs.flags.wallet === 1) {
    gs.flags.wallet = 2;
    return say(g, ped.name, '🧑', fmt('dlg.pedTaphoa', pedVoice(g, ped)), [{ label: fmt('dlg.pedTaphoaOk') }]);
  }
  const police = g.hz.activePolice(g.clockMin).find((p) => !g.knownPolice.has(p.id));
  if (police && Math.random() < 0.6) {
    g.knownPolice.add(police.id);
    return say(g, ped.name, '🧑', fmt('dlg.pedPolice', { ...pedVoice(g, ped), place: intersectionName(...police.node) }), [{ label: fmt('dlg.thanks') }]);
  }
  say(g, ped.name, '🧑', pickFor('ped.smallTalk', ped.who || personOf(ped.name), ped.id + Math.floor(g.clockMin / 30), pedVoice(g, ped), [isDark(g.clockMin) ? 'night' : 'day']));
}

// ======================== CSGT ========================
export function policeStop(g, p, speed) {
  if (g.noFines()) return; // xe đạp: CSGT cho qua
  const { gs, bike } = g;
  const speeding = speed > g.speedLimit(); // giới hạn theo cấp đường đang chạy (src/sim/roads.js)
  const noHelmet = gs.noHelmet, helmetFine = noHelmet ? ECONOMY.noHelmetFine ?? 60 : 0; // đầu trần: phạt thêm (cộng dồn)
  bike.speed = 0;
  bike.vel.set(0, 0);
  sound('law.whistle');
  const kmh = Math.round(speed * 3.6);
  // còn phạt nguội quá hạn → tạm giữ xe về đồn công an gần nhất (đóng hết mới lấy lại)
  const station = gs.hasOverdueFines && !g.om.hasCargo && g.nearestStation();
  if (station) {
    say(g, fmt('dlg.police'), '👮', fmt('dlg.policeImpound', { ...voice(g, fmt('dlg.police')), fine: gs.finesTotal, place: station.name }), [{
      label: fmt('dlg.policeImpoundOk'),
      onSelect: () => {
        dismount(g);
        g.towBikeTo(station, PARKING.towFee ?? 150);
        gs.addEnergy(0, -ENERGY.mental.fine);
        sound('law.towed');
        g.advance(10, 'idle');
      },
    }], { dismissible: false });
    return;
  }
  const fine = (speeding ? ECONOMY.policeFine : 0) + helmetFine, fined = fine > 0;
  const text = speeding
    ? fmt('dlg.policeSpeeding', { kmh, fine: ECONOMY.policeFine, limit: g.speedLimitKmh(), road: tierLabel(g.roadTier || 'normal') }) + (noHelmet ? fmt('dlg.noHelmetToo', { fine: helmetFine, total: fine }) : '')
    : noHelmet ? fmt('dlg.policeNoHelmet', { fine }) : fmt('dlg.policeCheck');
  say(g, fmt('dlg.police'), '👮', text, [
    {
      label: fined ? fmt('dlg.policePay', { fine }) : fmt('dlg.policeShow'),
      onSelect: () => {
        if (fined) {
          gs.spend(fine, 'fine', true);
          gs.stats.fines += 1;
          gs.addEnergy(0, -ENERGY.mental.fine);
          sound('law.fine');
        } else gs.addEnergy(0, -ENERGY.mental.police / 2);
        g.advance(fined ? 15 : 6, 'idle');
      },
    },
  ], { dismissible: false });
}

// CSGT tuần tra áp sát ra hiệu dừng xe (game.js patrolTick): reason 'speed' = chạy quá tốc độ gần xe tuần tra (phạt như ở chốt),
// 'red' = vượt đèn đỏ ngay trước mặt (luôn bị, tiền phạt như phạt nguội vượt đèn), 'helmet' = chỉ lỗi không đội mũ bảo hiểm.
// Đầu trần (xe máy / xe điện) thì lỗi nào cũng phạt cộng thêm ECONOMY.noHelmetFine. place: tên ngã tư (vượt đèn).
// Chơi nhiều người: máy chủ kiểm tra tốc độ / vị trí người chơi với vị trí xe tuần tra (lịch chung) rồi mới trừ tiền.
export function patrolStop(g, reason, speed, place = '') {
  if (g.noFines()) return; // xe đạp: CSGT tuần tra cho qua
  const { gs, bike } = g;
  bike.speed = 0;
  bike.vel.set(0, 0);
  sound('law.whistle');
  const red = reason === 'red', helmetFine = gs.noHelmet ? ECONOMY.noHelmetFine ?? 60 : 0;
  const base = reason === 'helmet' ? 0 : red ? LIGHTS.fine ?? 100 : ECONOMY.policeFine, fine = base + helmetFine;
  const text = reason === 'helmet'
    ? fmt('dlg.patrolNoHelmet', { fine })
    : (red
      ? fmt('dlg.patrolRed', { fine: base, place })
      : fmt('dlg.patrolSpeeding', { kmh: Math.round(speed * 3.6), fine: base, limit: g.speedLimitKmh(), road: tierLabel(g.roadTier || 'normal') })) + (helmetFine ? fmt('dlg.noHelmetToo', { fine: helmetFine, total: fine }) : '');
  say(g, fmt('dlg.patrol'), '🚓', text, [{
    label: fmt('dlg.policePay', { fine }),
    onSelect: () => {
      gs.spend(fine, 'fine', true);
      gs.stats.fines += 1;
      gs.addEnergy(0, -ENERGY.mental.fine);
      sound('law.fine');
      g.advance(15, 'idle');
    },
  }], { dismissible: false });
}

// Túi đồ: app 🎒 trên điện thoại (src/ui/phone.js), thao tác ở bagUse / bagWear phía trên.
