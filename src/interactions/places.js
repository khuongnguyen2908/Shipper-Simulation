// =============================================================
// TƯƠNG TÁC — Địa điểm: hoạt động, cửa hàng, văn phòng hãng, sạc / đổi pin, đổ xăng, phà
// (một phần của src/interactions.js — mọi thao tác người chơi; chữ lấy từ vi.json qua fmt())
// =============================================================
import { ECONOMY, VEHICLES, BAGS, PARKING } from '../data/balance.js';
import { APP, BRANDS } from '../data/apps.js';
import { GOODS } from '../data/goods.js';
import { isOpen, fmtHours, placesUsing, placesSelling, unlocked } from '../sim/placeRules.js';
import { S } from '../sim/OrderManager.js';
import { fmtK } from '../sim/economy.js';
import { nextBoat, ferryFare, ferryOpen, ferryRule } from '../sim/ferry.js';
import { fmt } from '../content/index.js';
import { fmtClock } from '../sim/clock.js';
import { sound } from '../audio.js';
import { PARK_SLOTS } from '../sim/garage.js';
import { uniformOf } from '../sim/GameState.js';
import { signaturePad } from '../ui/signature.js';
import { lookOf } from '../data/looks.js';
import { dist, say, npc, placeLine, npcVoice } from './common.js';
import { dismount, policeChoices } from './nearby.js';
import { landlord, napChoices, minhReturn, taphoa, gate } from './road.js';

// ======================== ĐỊA ĐIỂM ========================
// Mọi địa điểm dùng chung: lời chào + việc riêng (nếu có) + hoạt động + xem hàng.
// Hoạt động, hàng bán, giờ mở cửa đều lấy từ places.json (sửa bằng ?editor).
export function placeAction(g, pl) {
  const { gs } = g;
  const p = { place: pl.name, npc: pl.npc ? pl.npc.name : '' };
  const open = isOpen(pl, g.clockMin, gs.progress);
  // chưa tới chương mở cửa (cốt truyện) → "🔒 Đóng cửa" (không vào được); ngoài giờ → ghi giờ mở cửa
  if (!unlocked(pl, gs.progress)) return { label: fmt('act.locked', p), needFoot: false, disabled: true, run: () => {} };
  const closed = open ? '' : fmt('act.closed', { hours: fmtHours(pl.hours) });
  const generic = (key, extra = {}) => ({ label: fmt(key, p) + closed, needFoot: true, run: () => openPlace(g, pl), ...extra });
  switch (pl.kind) {
    case 'home': return { label: fmt('act.home', p), run: () => landlord(g, pl) };
    case 'restaurant': return generic('act.restaurant');
    case 'gas': return { label: fmt('act.gas', p) + closed, run: () => openPlace(g, pl, gasChoices(g, pl)) };
    case 'charger': return { label: fmt('act.charger', p) + closed, run: () => openPlace(g, pl, chargeChoices(g, pl)) };
    case 'swap': return { label: fmt('act.swap', p) + closed, run: () => openPlace(g, pl, swapChoices(g, pl)) };
    // đã là tài xế hãng này: nút ghi "Vào <tên văn phòng>" thay vì "Đăng ký chạy xe"
    case 'office': return generic(gs.brand && gs.brand === pl.brand ? 'act.officeMember' : 'act.office', { run: () => (open ? officeDialog(g, pl) : openPlace(g, pl)) });
    case 'shop': return generic('act.shop', { run: () => (open ? shopDialog(g, pl) : openPlace(g, pl)) });
    case 'garage': return generic('act.garage', { run: () => (open ? shopDialog(g, pl) : openPlace(g, pl)) });
    case 'cafe': return gs.flags.wallet === 4 ? { label: fmt('act.cafeMinh', p), needFoot: true, run: () => minhReturn(g) } : generic('act.cafe');
    case 'taphoa': return { label: fmt('act.taphoa', p) + closed, needFoot: true, run: () => taphoa(g, pl) };
    case 'gate': return { label: fmt('act.gate', p), needFoot: true, run: () => gate(g) };
    case 'apartment': return { label: fmt('act.apartment', p), run: () => openPlace(g, pl) };
    case 'market': return (pl.activities || []).length || hasStock(pl) ? generic('act.market') : null;
    case 'police': return generic('act.police', { run: () => openPlace(g, pl, policeChoices(g, pl)) });
    // cảnh quan (công viên, đất trống…): chỉ có nút E khi đã thêm hoạt động / hàng bán ở thẻ Địa điểm
    // · bãi giữ xe: E xem bảng luật gửi xe (đi xe hay đi bộ đều xem được)
    case 'scenery':
      if ((pl.activities || []).length || hasStock(pl)) return generic('act.scenery');
      return lookOf(pl) === 'parkingLot' ? { label: fmt('act.parkInfo', p), parkLot: pl.id, disabled: g.mode !== 'foot' && Math.abs(g.bike.speed) > 1.2, run: () => parkingInfo(g, pl) } : null;
    default: return generic('act.service'); // 'service' và mọi loại mới tạo trong công cụ
  }
}

// Bảng thông tin ở bãi giữ xe: phí gửi, luật đậu xe ngoài đường (số lấy từ thẻ ⚖️ Cân bằng → parking)
function parkingInfo(g, pl) {
  const n = npc(g, pl.id);
  say(g, n.name, n.portrait, fmt('dlg.parkInfo', {
    fee: PARKING.fee ?? 5, grace: PARKING.graceMin ?? 20, ticket: PARKING.ticketFine ?? 50, days: PARKING.fineDays ?? 3,
    tow: PARKING.towFee ?? 150, towFrom: PARKING.towFrom ?? 7, towTo: PARKING.towTo ?? 18,
  }));
}

const hasStock = (pl) => !!pl.sells && ['goods', 'bags', 'vehicles'].some((k) => (pl.sells[k] || []).length);

// Hộp thoại chung của một địa điểm. extra = lựa chọn riêng đặt lên đầu.
export function openPlace(g, pl, extra = [], text = null) {
  const n = npc(g, pl.id);
  if (!unlocked(pl, g.gs.progress)) return g.hud.toast(fmt('act.locked', { place: pl.name }), 'warn', 2500);
  if (!isOpen(pl, g.clockMin)) return say(g, n.name, n.portrait, fmt('dlg.closed', { hours: fmtHours(pl.hours) }));
  const choices = [...extra, ...activityChoices(g, pl)];
  if (hasStock(pl)) choices.push({ label: fmt('dlg.browseShop'), onSelect: () => shopDialog(g, pl) });
  if (pl.buys) choices.push({ label: fmt('dlg.sellUsed'), onSelect: () => sellUsedDialog(g, pl) });
  choices.push({ label: fmt('dlg.leave') });
  say(g, n.name, n.portrait, text ?? placeLine(pl.id, 'greet', npcVoice(g, n)), choices);
}

// Vựa ve chai (địa điểm có "buys"): bán quần áo / trang bị đã mua (ECONOMY.resalePct giá mua) và vỏ chai, vỏ lon
function sellUsedDialog(g, pl) {
  const n = npc(g, pl.id), gs = g.gs;
  const reopen = () => sellUsedDialog(g, pl);
  const list = gs.usedSellables();
  const choices = list.map((e) => ({
    label: fmt(e.kind === 'scrap' ? 'dlg.sellScrap' : 'dlg.sellItem', { icon: e.icon || '', name: e.name, n: e.n, k: e.k }),
    hint: e.kind === 'scrap' ? '' : gs.isWorn(e.id) ? fmt('dlg.sellWornHint') : '',
    keepOpen: true,
    onSelect: () => {
      const worn = gs.isWorn(e.id);
      const r = gs.sellUsed(e.id);
      g.hud.toast(r.msg, r.ok ? 'good' : 'bad');
      if (r.ok) sound('money.earn');
      if (r.ok && worn) g.applyLook(); // đang mặc → cởi ra, cập nhật ngoại hình
      reopen();
    },
  }));
  choices.push({ label: fmt('dlg.back'), onSelect: () => openPlace(g, pl) });
  say(g, n.name, n.portrait, fmt(list.length ? 'dlg.sellUsedIntro' : 'dlg.sellUsedNone', { pct: Math.round((ECONOMY.resalePct ?? 0.3) * 100) }), choices);
}

const placeShort = (p) => p.short || p.name;
// "Chùa, Nhà thờ" — nơi dùng được một món mang theo
function whereUsed(g, goodsId) {
  const list = placesUsing(goodsId, g.layout.places);
  return list.length ? list.map(placeShort).join(', ') : fmt('dlg.nowhere');
}

// "+20 tinh thần · +5 thể lực"
export function gainText(o) {
  const parts = [];
  const sign = (v) => (v > 0 ? `+${v}` : `${v}`);
  if (o.phys) parts.push(fmt('dlg.gainPhys', { n: sign(o.phys) }));
  if (o.mental) parts.push(fmt('dlg.gainMental', { n: sign(o.mental) }));
  if (o.fuel) parts.push(fmt('dlg.gainFuel', { n: o.fuel }));
  if (o.bikeHp) parts.push(fmt('dlg.gainHp', { n: o.bikeHp }));
  return parts.join(' · ');
}

function activityChoices(g, pl) {
  return [...ferryChoices(g, pl), ...placeActivities(g, pl), ...napChoices(g, pl)];
}

// Bến phà: đi cùng xe máy (đang lái, hoặc xe dựng gần bến) hoặc đi bộ; kèm giờ chờ / giờ chạy
function ferryChoices(g, pl) {
  const pair = (g.ferries?.pairs || []).find((q) => q.a.id === pl.id || q.b.id === pl.id);
  if (!pair) return [];
  const side = pair.a.id === pl.id ? 'a' : 'b', other = pair[side === 'a' ? 'b' : 'a'];
  const now = g.clockMin, nb = nextBoat(side, now), cross = Math.round(ferryRule('crossMin', 8));
  const hint = !ferryOpen(now)
    ? fmt('dlg.ferryClosed', { from: ferryRule('from', 5), to: ferryRule('to', 22), at: fmtClock(now + nb.wait) })
    : nb.wait > 0 ? fmt('dlg.ferryWait', { wait: Math.ceil(nb.wait), at: fmtClock(now + nb.wait), cross, other: other.name })
      : fmt('dlg.ferryNow', { cross, other: other.name });
  const foot = g.mode === 'foot';
  const bikeNear = !g.gs.towed && (!foot || Math.hypot(g.bike.pos.x - pl.door.x, g.bike.pos.z - pl.door.z) < 25);
  const out = [];
  const opt = (withBike) => {
    const fare = ferryFare(withBike);
    return {
      label: fmt(withBike ? 'dlg.ferryBike' : 'dlg.ferryFoot', { fare }),
      hint,
      disabled: g.gs.money < fare,
      onSelect: () => {
        g.gs.spend(fare, 'ferry');
        sound('money.pay');
        sound('city.ferry');
        g.startFerry(pair, side, withBike);
      },
    };
  };
  if (bikeNear) out.push(opt(true));
  if (foot) out.push(opt(false));
  return out;
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
        sound('place.activity');
        g.hud.toast(fmt('toast.activity', { label: act.label, gains: gainText(act) }), 'good');
        if (act.stopOnOrder && g.om.state === S.OFFERED) g.hud.toast(fmt('toast.orderWake'), 'info', 4000);
      },
    };
  });
}

// Trụ sạc (xe điện): rẻ, chậm — đứng chờ sạc đầy
function chargeChoices(g, pl) {
  const { gs } = g;
  const n = npc(g, pl.id);
  if (gs.power !== 'electric') return [{ label: fmt('dlg.chargeNotEv'), disabled: true }];
  const need = Math.max(0, gs.vehicleSpec.tank - gs.fuel), price = ECONOMY.elecPrice ?? 8;
  const min = Math.max(5, Math.ceil(need / Math.max(0.001, ECONOMY.chargeKwhPerMin ?? 0.02)));
  return [{
    label: fmt('dlg.chargeChoice', { cost: Math.ceil(need * price), min }),
    hint: fmt('dlg.chargeHint', { pct: Math.round((gs.fuel / gs.vehicleSpec.tank) * 100) }),
    primary: true,
    onSelect: () => {
      if (dist(g.bike.pos, pl.chargeSpot || pl.door) > (pl.chargeSpot ? 3.5 : 9)) return say(g, n.name, n.portrait, fmt('dlg.chargeTooFar'));
      const r = gs.charge();
      if (!r.ok) return say(g, n.name, n.portrait, r.msg);
      g.advance(r.minutes, 'idle', { waiting: true });
      sound('place.charge');
      g.hud.toast(r.msg, 'good');
    },
  }];
}

// Trạm đổi pin (xe điện): đầy pin ngay + bảo dưỡng pin (như thay nhớt của xe xăng)
function swapChoices(g, pl) {
  const { gs } = g;
  const n = npc(g, pl.id);
  if (gs.power !== 'electric') return [{ label: fmt('dlg.chargeNotEv'), disabled: true }];
  const cost = ECONOMY.swapCost ?? 45;
  return [{
    label: fmt('dlg.swapChoice', { cost, min: ECONOMY.swapMin ?? 3 }),
    hint: gs.maintOverdue ? fmt('dlg.swapHintOver', { km: (-gs.maintLeftKm).toFixed(1) }) : fmt('dlg.swapHint', { pct: Math.round((gs.fuel / gs.vehicleSpec.tank) * 100), km: gs.maintLeftKm.toFixed(1) }),
    primary: true,
    disabled: gs.money < cost,
    onSelect: () => {
      if (dist(g.bike.pos, pl.door) > 10) return say(g, n.name, n.portrait, fmt('dlg.chargeTooFar'));
      const r = gs.swapBattery();
      if (!r.ok) return say(g, n.name, n.portrait, r.msg);
      g.advance(r.minutes, 'idle', { indoor: true, waiting: false });
      sound('place.swap');
      g.hud.toast(r.msg, 'good');
    },
  }];
}

// Văn phòng hãng: giới thiệu hãng, đăng ký (đặt cọc, nhận xe hãng); đang ở hãng khác → đổi hãng = cày lại từ đầu
function officeDialog(g, pl) {
  const { gs, om } = g;
  const n = npc(g, pl.id);
  const b = BRANDS[pl.brand];
  if (!b) return openPlace(g, pl);
  const bike = VEHICLES[b.vehicle];
  const mine = gs.brand === b.id;
  const busy = !!om.order || om.state === S.OFFERED;
  const choices = [];
  if (!mine) {
    const refund = gs.brand ? gs.depositPaid : 0;
    const why = busy ? fmt('dlg.officeBusy') : gs.towed ? fmt('dlg.officeTowed') : gs.money + refund < (b.deposit || 0) ? fmt('gs.short', { k: Math.ceil((b.deposit || 0) - gs.money - refund) }) : '';
    choices.push({
      label: fmt(gs.brand ? 'dlg.officeSwitch' : 'dlg.officeJoin', { brand: b.name, k: b.deposit || 0 }),
      hint: why || fmt(gs.brand ? 'dlg.officeSwitchHint' : 'dlg.officeJoinHint', { bike: bike?.name || '', old: gs.brandSpec?.name || '', refund }),
      primary: true,
      disabled: !!why,
      onSelect: () => contractDialog(g, pl, b), // popup hợp đồng: đãi ngộ + ký tên rồi mới vào hãng
    });
  }
  // đồ của hãng (đồng phục, nón chở khách…): chỉ cấp hoặc mua tại văn phòng hãng (places.json → sells.goods của văn phòng);
  // chỉ tài xế hãng mua được — mất áo / bị khách cầm nón đi thì mua lại ở đây
  for (const id of pl.sells?.goods || []) {
    const u = GOODS[id];
    if (!u || u.brand !== b.id) continue;
    const owned = u.type === 'outfit' ? gs.ownsOutfit(id) : gs.owned.gear.includes(id);
    choices.push({
      label: `${owned ? '✔ ' : ''}${u.icon || ''} ${u.name} – ${u.price}k`,
      hint: owned ? fmt(u.type === 'outfit' ? 'dlg.outfitOwnedAcc' : 'dlg.shopOwned') : !mine ? fmt('dlg.uniformMembersOnly', { brand: b.name }) : u.desc || '',
      disabled: owned || !mine || gs.money < u.price,
      keepOpen: true,
      onSelect: () => {
        const r = gs.buy('goods', id);
        g.hud.toast(r.ok ? fmt('toast.bought', { msg: r.msg }) : r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) sound('place.buy');
        officeDialog(g, pl);
      },
    });
  }
  choices.push(...activityChoices(g, pl), { label: fmt('dlg.leave') });
  const text = fmt(mine ? 'dlg.officeMember' : 'dlg.officeIntro', { brand: b.name, desc: b.desc || '', bike: bike?.name || '', k: b.deposit || 0, kind: fmt(`power.${b.power}`) });
  say(g, n.name, n.portrait, text, choices, { wide: true });
}

// Popup hợp đồng: đãi ngộ (luật chung của app + dòng riêng của hãng), đồ được cấp, ô ký tên. Ký xong mới vào hãng.
function contractDialog(g, pl, b) {
  const { gs } = g;
  const bike = VEHICLES[b.vehicle], u = uniformOf(b.id);
  const pad = signaturePad(gs.profile.name);
  const perks = [
    fmt('dlg.perkOrders'),
    fmt('dlg.perkFee', { fee: Math.round((APP.platformFee || 0) * 100), tax: +((APP.taxRate || 0) * 100).toFixed(1), tip: APP.tipByStars?.[5] ?? 0 }),
    fmt('dlg.perkSurcharge', { rain: APP.rainSurcharge || 0, flood: APP.floodSurcharge || 0, peak: APP.peakSurcharge || 0, night: APP.nightSurcharge || 0 }),
    ...(b.perks || []),
  ];
  const gifts = (b.gifts || []).map((id) => GOODS[id]).filter((x) => x && x !== u).map((x) => `${x.icon || '🎁'} ${x.name}`);
  const gives = [bike && `🛵 ${bike.name}`, u && `${u.icon || '🦺'} ${u.name}`, ...gifts, fmt('dlg.contractDeposit', { k: b.deposit || 0 })].filter(Boolean);
  const html = `<div class="ct">
    <div class="ct-sec">${fmt('dlg.contractPerks')}</div><ul class="ct-list">${perks.map((t) => `<li>${t}</li>`).join('')}</ul>
    <div class="ct-sec">${fmt('dlg.contractGive')}</div><div class="ct-chips">${gives.map((t) => `<span class="tag good">${t}</span>`).join('')}</div>
    <small class="ct-note">${fmt('dlg.contractUniform')}</small>
    ${gs.brand ? `<div class="ph-lock">${fmt('dlg.contractSwitchWarn', { old: gs.brandSpec?.name || '' })}</div>` : ''}
    <div class="ct-sec">${fmt('dlg.contractSign')}</div></div>`;
  g.modal.show({
    title: fmt('dlg.contractTitle', { brand: b.name }),
    html,
    node: pad.el,
    wide: true,
    choices: [
      { label: fmt('dlg.contractClear'), keepOpen: true, onSelect: () => pad.clear() },
      { label: fmt('dlg.contractLater') },
      {
        label: fmt('dlg.contractSignBtn'),
        primary: true,
        keepOpen: true,
        onSelect: () => {
          if (!pad.signed()) return g.hud.toast(fmt('toast.signFirst'), 'warn');
          g.modal.hide();
          joinBrand(g, pl, b, pad.dataURL());
        },
      },
    ],
  });
}

// Ký hợp đồng xong: đặt cọc, nhận xe + đồng phục (mặc luôn), vào nhóm Hội shipper
function joinBrand(g, pl, b, sig) {
  const { gs, om } = g;
  const n = npc(g, pl.id);
  const bike = VEHICLES[b.vehicle];
  if (om.state !== S.OFFLINE) om.goOffline();
  const r = gs.joinBrand(b.id, sig, g.clockMin, { wear: !gs.story?.ch });
  if (!r.ok) return say(g, n.name, n.portrait, r.msg);
  gs.flags.online = false;
  g.bike.setSpec(gs.vehicleSpec);
  g.bike.setBag(gs.bagSpec); // hãng tặng túi cơ bản
  g.parkBikeAtPlace(pl); // xe hãng dựng trước văn phòng (đi bộ tới ký), giờ đậu tính lại từ đầu
  g.lookKey = null;
  sound('place.joinBrand');
  g.hud.toast(r.msg, 'big', 6000);
  g.addChat(b.name, fmt(r.switched ? 'chat.brandSwitched' : 'chat.brandWelcome', { name: gs.profile.name, brand: b.name, bike: bike?.name || '' }));
  if (!r.switched && !gs.story?.ch) g.joinGroupChat(); // lần đầu vào hãng: được thêm vào nhóm Hội shipper (đang theo cốt truyện: chỉ tin chào mừng của hãng)
}

function gasChoices(g, pl) {
  const { gs } = g;
  const n = npc(g, pl.id);
  if (gs.power !== 'gas') return [{ label: fmt(gs.power === 'electric' ? 'dlg.gasIsEv' : 'dlg.gasIsPedal'), disabled: true }];
  return [{
    label: fmt('dlg.refuelChoice'),
    primary: true,
    onSelect: () => {
      if (dist(g.bike.pos, pl.door) > 9) return say(g, n.name, n.portrait, fmt('dlg.gasTooFar', npcVoice(g, n)));
      const r = gs.refuel();
      if (r.ok) {
        g.advance(2, 'idle', { waiting: false });
        sound('place.fuel');
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
    const notMine = outfit && !owned && !gs.canWear(id); // đồ chỉ cho nữ, nhân vật nam
    choices.push({
      label: `${owned ? '✔ ' : ''}${s.icon || ''} ${s.name} – ${s.price}k`,
      hint: notMine ? fmt('dlg.femaleOnly')
        : owned ? fmt(outfit ? 'dlg.outfitOwned' : 'dlg.shopOwned')
        : consumable ? fmt('dlg.goodsCount', { n: gs.countOf(id), desc: s.desc || '', gains: gainText(s.use || {}) })
        : carry ? fmt('dlg.carryShop', { n: gs.countOf(id), desc: s.desc || '', where: whereUsed(g, id) })
        : outfit ? fmt('dlg.outfitShop', { slot: fmt(`outfit.slot.${s.slot}`), desc: s.desc || '' })
        : s.desc,
      disabled: notMine || owned || gs.money < s.price,
      keepOpen: true,
      onSelect: () => {
        const r = gs.buy('goods', id);
        g.hud.toast(r.ok ? fmt(outfit ? 'toast.boughtOutfit' : 'toast.bought', { msg: r.msg }) : r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) sound('place.buy');
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
          if (r.ok) sound('place.buy');
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
  // Xe: mua xe tiệm bán (xe mới chạy luôn, xe đang dùng chở về hầm nhà trọ) + bán xe cũ (50% giá xe mới).
  // Xe đang có mà không dùng thì nằm trong hầm nhà trọ — muốn đổi xe phải về hầm lấy (không đổi ở tiệm nữa)
  if ((sells.vehicles || []).length) {
    const list = [...new Set([...(sells.vehicles || []), ...gs.owned.vehicles])].filter((id) => VEHICLES[id]);
    for (const id of list) {
      const v = VEHICLES[id];
      const owned = gs.owned.vehicles.includes(id);
      const using = gs.vehicle === id;
      const kind = fmt(`power.${v.power || 'gas'}`);
      const spec = v.power === 'pedal' ? fmt('dlg.garageSpecPedal', { kmh: Math.round(v.maxSpeed * 3.6), desc: v.desc })
        : fmt(v.power === 'electric' ? 'dlg.garageSpecEv' : 'dlg.garageSpec', { kmh: Math.round(v.maxSpeed * 3.6), susp: Math.round(v.suspension * 100), fuel: v.fuelPer100km, tank: v.tank, desc: v.desc });
      choices.push({
        label: `${using ? '🛵 ' : owned ? '✔ ' : ''}${v.name} · ${kind}${owned ? '' : ` – ${v.price}k`}`,
        hint: owned && !using ? fmt('dlg.vehicleInGarage') : !owned && gs.garageFull() ? fmt('dlg.garageFullHint', { n: PARK_SLOTS }) : spec,
        disabled: owned || gs.money < v.price || gs.garageFull(),
        keepOpen: true,
        onSelect: () => {
          const old = gs.vehicleSpec.name;
          const r = gs.buy('vehicles', id);
          g.hud.toast(r.ok ? fmt('toast.boughtVehicle', { msg: r.msg }) : r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) {
            sound('place.buyVehicle');
            g.hud.toast(fmt('toast.oldToGarage', { name: old }), 'info', 5000);
          }
          g.bike.setSpec(gs.vehicleSpec);
          reopen();
        },
      });
    }
    for (const id of gs.owned.vehicles.filter((x) => gs.canSell(x))) {
      const k = gs.sellPrice(id);
      choices.push({
        label: fmt('dlg.sellVehicle', { name: VEHICLES[id].name, k }),
        hint: fmt('dlg.sellHint', { pct: Math.round((ECONOMY.sellPct ?? 0.5) * 100), price: VEHICLES[id].price }),
        keepOpen: true,
        onSelect: () => {
          const active = gs.vehicle === id;
          const r = gs.sellVehicle(id);
          g.hud.toast(r.msg, r.ok ? 'good' : 'bad');
          if (r.ok) sound('money.earn');
          // bán đúng chiếc đang chạy → đi bộ; xe thay thế (xe đạp / xe hãng) vẫn đang dựng trong hầm nhà trọ
          if (r.ok && active) {
            if (g.mode === 'bike') dismount(g);
            g.placeAtHomeBike();
            g.hud.toast(fmt('toast.soldActive', { name: gs.vehicleSpec.name }), 'info', 6000);
          }
          g.bike.setSpec(gs.vehicleSpec);
          reopen();
        },
      });
    }
  }
  if (pl.kind === 'garage') {
    choices.push({
      label: fmt('dlg.repair', { cost: ECONOMY.repairCost }),
      hint: fmt('dlg.repairHint', { hp: gs.bikeHp.toFixed(0) }),
      disabled: gs.bikeHp >= 99 || gs.money < ECONOMY.repairCost || dist(g.bike.pos, pl.door) > 10,
      keepOpen: true,
      onSelect: () => { const r = gs.repair(); g.hud.toast(r.msg, r.ok ? 'good' : 'bad'); if (r.ok) sound('place.repair'); reopen(); },
    });
    // thay nhớt (chỉ xe xăng): mất vài phút, nhớt về đầy (balance.json → economy.oilCost / oilIntervalKm / oilChangeMin)
    // xe điện: bảo dưỡng = đổi pin ở trạm đổi pin
    const oilCost = ECONOMY.oilCost ?? 60;
    const gas = gs.power === 'gas';
    if (gs.power === 'electric') choices.push({ label: fmt('dlg.oilIsEv'), disabled: true });
    else if (gas) choices.push({
      label: fmt('dlg.oilChange', { cost: oilCost, min: ECONOMY.oilChangeMin ?? 15 }),
      hint: gs.maintOverdue ? fmt('dlg.oilHintOver', { km: (-gs.maintLeftKm).toFixed(1) }) : fmt('dlg.oilHint', { km: gs.maintLeftKm.toFixed(1), full: gs.maintIntervalKm }),
      primary: gs.maintOverdue,
      disabled: gs.maintKm < 0.5 || gs.money < oilCost || dist(g.bike.pos, pl.door) > 10,
      keepOpen: true,
      onSelect: () => {
        const r = gs.changeOil();
        g.hud.toast(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) {
          sound('place.oil');
          g.advance(r.minutes, 'idle', { indoor: true, waiting: true });
        }
        if (g.state === 'play') reopen();
      },
    });
  }
  choices.push(...activityChoices(g, pl).map((c) => ({ ...c, onSelect: () => { c.onSelect(); } })));
  choices.push({ label: fmt('dlg.shopExit') });
  const onlyBikes = (sells.vehicles || []).length && !(sells.goods || []).length && !(sells.bags || []).length;
  const intro = onlyBikes ? fmt('dlg.showroomIntro', { ...npcVoice(g, n), money: fmtK(gs.money) })
    : pl.kind === 'shop' ? fmt('dlg.shopIntro', { ...npcVoice(g, n), money: fmtK(gs.money), bag: gs.bagSpec.name })
    : pl.kind === 'garage' ? fmt((sells.vehicles || []).length ? 'dlg.garageIntro' : 'dlg.garageRepairIntro', { money: fmtK(gs.money) })
    : fmt('dlg.shopTitle', { ...npcVoice(g, n), money: fmtK(gs.money) });
  g.modal.show({ speaker: n.name, portrait: n.portrait, text: intro, choices, wide: true });
}
