// =============================================================
// TƯƠNG TÁC & HỘI THOẠI — mọi thao tác của người chơi đi qua đây
// (lấy hàng, xếp túi, giao hàng, sự cố, cửa hàng, nhiệm vụ chiếc ví, CSGT…)
// Mọi chữ lấy từ kho chữ qua fmt() — sửa bằng công cụ ?editor.
// =============================================================
import { TIME, ECONOMY, ENERGY, ORDER, VEHICLES, BAGS, WALLET_QUEST, PARKING, LIGHTS } from './data/balance.js';
import { circleFree } from './world/physics.js';
import { APP, ORDER_TYPES, RIDER_TYPES, BRANDS } from './data/apps.js';
import { GOODS, OUTFIT_SLOTS, isAccessorySlot } from './data/goods.js';
import { STORY, stepOf, storyEvent, chapterOf } from './sim/story.js';
import { voiceOf, chapterNum } from './data/relations.js';
import { DeliveryItem } from './sim/ItemPhysics.js';
import { isOpen, fmtHours, placesUsing, placesSelling, unlocked } from './sim/placeRules.js';
import { ITEMS } from './data/items.js';
import { S } from './sim/OrderManager.js';
import { fmtK } from './sim/economy.js';
import { intersectionName, routeDist } from './sim/cityLayout.js';
import { tierLabel } from './sim/roads.js';
import { nearestStop, routeDestinations, inService, busRule } from './sim/bus.js';
import { nextBoat, ferryFare, ferryOpen, ferryRule } from './sim/ferry.js';
import { fmt, pick, pickFor, has } from './content/index.js';
import { personOf, pronouns } from './sim/people.js';
import { fmtClock, minutesUntil } from './sim/clock.js';
import { buildPacking } from './ui/packing.js';
import { sound } from './audio.js';
import { inGarage, parkSlots, PARK_SLOTS } from './sim/garage.js';
import { uniformOf } from './sim/GameState.js';
import { signaturePad } from './ui/signature.js';
import { splitPages } from './ui/modal.js';
import { lookOf } from './data/looks.js';
import { headOf } from './ui/bubbles.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

function say(g, speaker, portrait, text, choices = [{ label: fmt('dlg.ok') }], extra = {}) {
  g.modal.show({ speaker, portrait, text, choices, ...extra });
  // ghi lời NPC vào log chat bên trái (trang đầu, bỏ định dạng, cắt ngắn)
  const plain = splitPages(String(text).replace(/<[^>]+>/g, ''))[0] || '';
  g.chatCh?.local('npc', speaker, plain.length > 160 ? plain.slice(0, 157) + '…' : plain, { time: fmtClock(g.clockMin) });
}

// NPC của một địa điểm (tên + chân dung)
function npc(g, placeId) {
  const pl = g.layout.placeById[placeId];
  if (pl && !pl.npc && pl.kind === 'scenery') return { name: pl.name, portrait: pl.icon || '🌳' }; // cảnh quan: không có người, lời là của nơi đó
  if (pl && !pl.npc && pl.kind === 'charger') return { name: pl.name, portrait: pl.icon || '🔌' }; // trụ sạc tự phục vụ
  return pl && pl.npc ? pl.npc : { name: fmt('npc.default.name'), portrait: '🙂' };
}

// Lời thoại riêng của địa điểm (npc.<id>.<loại>), không có thì dùng lời mặc định
function placeLine(placeId, kind, params) {
  const k = `npc.${placeId}.${kind}`;
  return has(k) ? fmt(k, params) : fmt(`npc.default.${kind}`, params);
}

// XƯNG HÔ (sim/people.js): tham số {toi} {ban} {khach} {minh} {anhchi} theo người nói (giới tính + tuổi + vai) và giới tính nhân vật mình
const voice = (g, name, opts = {}) => pronouns(personOf(name, opts), g.gs.profile?.gender);
const custVoice = (g, o = g.om.order) => voice(g, o?.customer || ''); // khách của đơn
// người ở quán / tiệm: NPC có dây quan hệ với người chơi (sơ đồ /?relationship) thì xưng hô theo dây, không thì đoán theo tên
const npcVoice = (g, n) => {
  const pl = n && g.layout.places.find((p) => p.npc === n);
  return (pl && voiceOf(`place:${pl.id}`, g.gs.profile?.gender, chapterNum(g.gs.story, STORY))) || voice(g, n?.name || '', { gender: n?.gender, role: 'staff' });
};
const pedVoice = (g, ped) => pronouns(ped.who || personOf(ped.name), g.gs.profile?.gender); // người đi đường

// ======================== DANH SÁCH TƯƠNG TÁC GẦN NGƯỜI CHƠI ========================
export function gatherInteractions(g) {
  if (g.ferryRide) return []; // đang trên phà: chờ qua sông
  const { om, bike } = g;
  const foot = g.mode === 'foot';
  const p = g.playerPos;
  const slow = Math.abs(bike.speed) < 1.2;
  const out = [];
  // F: lên / xuống xe
  if (foot && g.bikeReady() && dist(p, bike.pos) < 3.2 && Math.abs(g.walker.mesh.position.y - bike.mesh.position.y) < 1.5) {
    // xe bị cẩu về bãi → chuộc rồi mới lấy được
    if (g.gs.towed) out.push({ key: 'F', label: redeemLabel(g), dist: 0, run: () => redeemBike(g) });
    else out.push({ key: 'F', label: fmt('act.mount'), dist: 0, run: () => mount(g) });
  }
  if (!foot) out.push({ key: 'F', label: fmt('act.dismount'), dist: 0, disabled: !slow, run: () => dismount(g) });

  const E = [];
  // hầm xe nhà trọ: tới gần xe để dành, bấm E lấy ra chạy (xe đang dùng phải dựng trong hầm, không có đơn, xe không bị giữ)
  if (foot && g.bikeReady() && !g.gs.towed && !om.order) {
    const home = g.layout.placeById.home, slots = parkSlots(home);
    g.gs.parkedVehicles.slice(0, slots.length).forEach((id, i) => {
      const d = dist(p, slots[i]);
      if (d > 1.6) return;
      const name = VEHICLES[id].name, here = g.bikeInGarage();
      E.push({ label: fmt(here ? 'act.takeVehicle' : 'act.takeVehicleNeedBike', { name }), dist: here ? d - 30 : d, disabled: !here, run: () => takeVehicle(g, id) }); // đứng sát xe: ưu tiên hơn "Lên phòng"
    });
  }
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
  // đang nói chuyện bằng bong bóng (cốt truyện): E = nghe câu tiếp theo (ưu tiên hơn mọi nút khác)
  if (g.talk) E.push({ label: fmt(g.talk.i >= g.talk.pages.length - 1 && !g.bubbles.typing('story:talk') ? 'act.talkDone' : 'act.talkNext'), dist: -50, run: () => g.talkNext() }); // câu cuối: "Xong"
  // thoại tuần tự: đang chờ bấm E để hiện câu kế (câu đáp sau câu người chơi vừa chọn, câu xếp hàng)
  else if (g.storyWaitE()) E.push({ label: fmt('act.talkNext'), dist: -50, run: () => g.storyContinue() });
  // cốt truyện: bước "nói chuyện ở địa điểm" → nút E riêng ở cửa (đi bộ)
  const st = stepOf(g.gs.story);
  // chờ việc đầu bước làm xong (vd tin nhắn tới) rồi mới cho nói chuyện · đã nói xong (đang xếp túi / chờ sang bước sau) thì thôi
  if (st?.talk && st.until?.type === 'talk' && g.gs.story.fired && !g.gs.story.ev[`talk:${st.talk.place}`] && !g.storyPacking && !g.talk) {
    const pl = g.layout.placeById[st.talk.place];
    const d = pl && dist(p, pl.door);
    if (pl && d <= R) E.push(foot ? { label: fmt(st.talk.label), dist: d - 5, run: () => storyTalk(g, st, pl) } : { label: fmt('act.needFoot', { place: pl.name }), dist: d - 5, disabled: true });
  }
  // cốt truyện: người lạ (anh phát tờ rơi, chị Linh…) / NPC địa điểm đang chờ nói chuyện (sư cô, bảo vệ…) → đứng gần bấm E (đi bộ)
  for (const who of g.storyTalkTargets()) {
    const sp = g.speakerOf(who);
    if (!sp?.mesh?.parent || !g.storyActorTalkable(who)) continue;
    const d = dist(p, sp.mesh.position);
    if (d > (who.startsWith('place:') ? 3.4 : 3)) continue;
    E.push(foot ? { label: g.storyTalkLabel(who), dist: d - 6, run: () => g.storyActorTalk(who) } : { label: fmt('act.talkNeedFoot', { name: sp.name }), dist: d - 6, disabled: true });
  }
  const storyPlace = st?.until?.type === 'talk' ? st.talk?.place : null;
  for (const pl of g.layout.places) {
    if (pl.id === storyPlace) continue; // cốt truyện: nút E riêng (hoặc chờ tin nhắn tới rồi mới hiện)
    const d = dist(p, pl.chargeSpot || pl.door); // trạm sạc: tới chỗ sạc trong sân mới hiện nút
    if (d > R) continue;
    const a = placeAction(g, pl);
    if (!a) continue;
    if (a.needFoot && !foot) E.push({ label: fmt('act.needFoot', { place: pl.name }), dist: d, disabled: true });
    else E.push({ ...a, dist: d });
  }
  // trong hầm xe phòng trọ: E lên phòng (trả tiền nhà, ngủ, tủ đồ) — cửa nhà nằm ngoài vỉa hè, xa chỗ dựng xe
  const home = g.layout.placeById.home;
  if (foot && inGarage(home, p.x, p.z, 0)) E.push({ label: fmt('act.homeGarage'), dist: 0.5, run: () => landlord(g, home) });
  // trạm xe buýt (src/sim/bus.js): đi bộ tới trạm, bấm E chọn trạm xuống
  const stop = g.bus && nearestStop(g.bus, p.x, p.z, foot ? 3 : 4.5);
  if (stop) {
    // trong vùng trạm (vòng xanh) thì đi xe buýt được ưu tiên hơn cửa địa điểm sát bên (vd Bến Xe Buýt) — đứng hẳn sát cửa thì vẫn vào cửa
    const d = dist(p, stop.wait) - 0.6;
    E.push(foot ? { label: fmt('act.bus', { stop: stop.name }), dist: d, busStop: stop.id, run: () => busDialog(g, stop) } : { label: fmt('act.busNeedFoot'), dist: d, busStop: stop.id, disabled: true });
  }
  // ghế (quán, công viên, trạm xe buýt…): đứng sát ghế bấm E ngồi · đang ngồi thì E đứng dậy (bấm đi cũng đứng dậy)
  if (foot && g.walker.seat) E.push({ label: fmt('act.standUp'), dist: -5, seatAct: true, run: () => g.walker.leaveSeat() });
  else if (foot) {
    // đứng sát ghế (≤ 0,9 m) thì "Ngồi" được ưu tiên hơn cửa quán ngay bên cạnh (đôn quán ăn đặt sát cửa)
    const s = nearestSeat(g, p, 0.9);
    if (s) E.push({ label: fmt('act.sit'), dist: s.d - 0.5, seatAct: true, run: () => g.walker.sitSeat(s.seat) });
  }
  if (foot || slow) {
    const ped = g.traffic.nearestPed(p.x, p.z, foot ? 2.6 : 3.5);
    if (ped) E.push({ label: fmt('act.talkPed', { name: ped.name }), dist: dist(p, ped) + 0.5, run: () => talkPed(g, ped) });
  }
  // việc của đơn hàng luôn ưu tiên (dist đã trừ 10), kể cả khi đang mờ để người chơi thấy hướng dẫn
  E.sort((a, b) => a.dist - b.dist);
  // đang chọn câu trả lời (phím 1/2/3) / người lạ sắp đáp lại: tạm không có nút E (khỏi bấm nhầm vào cửa bên cạnh)
  const storyBusy = !!g.storyChoice;
  if (E.length && !storyBusy) out.unshift({ key: 'E', ...E[0] });
  return out;
}

// Ghế trống gần nhất trong bán kính r (cùng độ cao: không ngồi được ghế dưới gầm cầu khi đang ở trên cầu)
function nearestSeat(g, p, r) {
  const y = g.walker.mesh.position.y;
  let best = null;
  for (const seat of g.city.seats || []) {
    const d = Math.hypot(seat.x - p.x, seat.z - p.z);
    if (seat.npc) continue; // ghế quán cóc đang có khách ngồi (world/stallPeople.js)
    if (d < r && Math.abs(seat.y - y) < 1.2 && (!best || d < best.d)) best = { seat, d };
  }
  return best;
}

// ======================== CỐT TRUYỆN: NÓI CHUYỆN Ở ĐỊA ĐIỂM ========================
// story.json → talk { place, label, text, ok, pack (xếp gói hàng vào túi), drop (giao gói hàng), give (tặng đồ) }
function storyTalk(g, st, pl) {
  const t = st.talk, n = npc(g, pl.id), gs = g.gs;
  // nói bằng bong bóng trên đầu NPC (bấm E sang câu sau); người chơi không tự nói gì
  g.storyConverse({
    mesh: g.npcs[pl.id] || null,
    name: n.name,
    pages: splitPages(fmt(t.text, g.storyVoice(`place:${pl.id}`))),
    onDone: () => {
      const done = () => storyEvent(gs.story, `talk:${pl.id}`);
      const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);
      // giao gói hàng đang chở (1 hay nhiều gói)
      if (t.drop) gs.story.carry = list(gs.story.carry).filter((id) => !list(t.drop).includes(id));
      if (t.give && GOODS[t.give]) {
        const n = Math.max(1, t.giveQty || 1);
        gs.consumables[t.give] = (gs.consumables[t.give] || 0) + n;
        g.hud.toast(fmt('toast.storyGift', { item: GOODS[t.give].name, qty: n > 1 ? ` ×${n}` : '' }), 'good', 4000);
      }
      const pack = list(t.pack).filter((id) => STORY.parcels?.[id]);
      if (pack.length) return storyPack(g, pack, done);
      done();
    },
  });
}
// Xếp các gói hàng cốt truyện vào túi (dùng màn xếp túi của đơn hàng, có hướng dẫn — game.packGuide) → xong thì đang chở các gói đó
function storyPack(g, ids, done) {
  const gs = g.gs;
  const items = ids.map((id) => { const P = STORY.parcels[id]; return new DeliveryItem({ id, name: fmt(P.name), icon: P.icon, traits: P.traits || [] }); });
  sound('order.pickup');
  const node = buildPacking({
    items,
    bag: gs.bagSpec,
    strict: true, // xếp túi có hướng dẫn (cốt truyện): phải xếp đúng luật mới đi
    onDone: () => {
      g.modal.hide();
      g.storyPacking = null;
      gs.story.carry = [...ids];
      g.hud.toast(fmt('story.carrying', { icon: items[0]?.icon || '📦', item: items.map((it) => it.name).join(' + ') }), 'good', 4000); // hình của gói đầu (hũ chao 🍯, hộp cơm 🍱…)
      done();
    },
  });
  g.storyPacking = node;
  // hướng dẫn "chọn món": nhớ món người chơi đã tự bấm chọn (màn xếp túi tự chọn sẵn món kế tiếp, nhưng vẫn dạy bước chọn món)
  node.picked = new Set();
  node.addEventListener('click', (e) => { const b = e.target.closest('[data-item]'); if (b) node.picked.add(Number(b.dataset.item)); }, true);
  g.modal.show({ title: fmt('dlg.packTitle', { bag: gs.bagSpec.name }), node, dismissible: false, wide: true });
}

function mount(g) {
  g.walker.leaveSeat(false);
  g.gs.parked = null; // hết lần đậu
  g.mode = 'bike';
  g.walker.sitOn(g.bike);
  g.gs.flags.mounted = true;
  sound('drive.mount');
  if (g.gs.noHelmet) g.hud.toast(fmt('toast.noHelmet'), 'warn', 5000); // xe máy / xe điện mà đầu trần
  // mở đầu: lần đầu leo lên xe đạp Cô Hai cho → bắt đầu hướng dẫn đi đăng ký hãng
  if (g.gs.flags.story === 1) {
    g.gs.flags.story = 2;
    if (!g.gs.story?.ch) g.hud.toast(fmt('toast.firstRide'), 'big', 7000);
  }
}

// Lấy xe trong hầm ra chạy: xe đang dùng dựng vào chỗ xe vừa lấy, rồi leo lên xe mới luôn
function takeVehicle(g, id) {
  const r = g.gs.swapVehicle(id);
  if (!r.ok) return g.hud.toast(r.msg, 'bad');
  g.bike.setSpec(g.gs.vehicleSpec);
  g.bike.setBag(g.gs.bagSpec);
  g.hud.toast(r.msg, 'good');
  sound('place.takeVehicle');
  mount(g);
}

function dismount(g) {
  sound('drive.dismount');
  g.mode = 'foot';
  g.walker.standUp(g.scene, g.bike);
  const w = g.walker, el = g.city.elev;
  // chỗ đứng không dính tường (xe dựng sát tường hầm thì xuống bên kia): trái → phải → sau → trước xe → ngay chỗ xe.
  // Trước đây luôn xuống bên trái → lọt vào trong tường → bị đẩy văng ra ngoài nhà.
  const f = g.bike.forward(), b = g.bike.pos, y = w.deckY ?? 0;
  const spots = [[f.z * 0.9, -f.x * 0.9], [-f.z * 0.9, f.x * 0.9], [-f.x * 1.4, -f.z * 1.4], [f.x * 1.4, f.z * 1.4]];
  const [dx, dz] = spots.find(([sx, sz]) => circleFree(g.city.grid, b.x + sx, b.z + sz, 0.4, y)) || [0, 0];
  w.pos.x = w._ex = b.x + dx;
  w.pos.z = w._ez = b.z + dz;
  if (w.deckY != null && el && el.heightAt(w.pos.x, w.pos.z, w.deckY, 0.35) == null) {
    w.pos.x = w._ex = g.bike.pos.x;
    w.pos.z = w._ez = g.bike.pos.z;
  }
  // đặt hình người đúng chỗ đứng NGAY khung này (vừa gỡ khỏi xe, vị trí hình còn tính theo xe → camera bám theo bị giật)
  w.mesh.position.set(w.pos.x, g.bike.mesh.position.y, w.pos.z);
  w.mesh.rotation.set(0, w.heading, 0);
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
    sound('money.pay');
    g.hud.toast(fmt('toast.redeemedPolice', { total, fines }), 'info', 6000);
  } else {
    const fee = Math.min(Math.max(0, gs.money), gs.towed.fee);
    gs.spend(fee, 'tow', true);
    gs.towed = null;
    sound('money.pay');
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
        sound('money.pay');
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
function bagUse(g, id) {
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
function bagWear(g, id, on) {
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
const appName = (g) => g.gs.brandSpec?.name || fmt('dlg.app');

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

function boardPassenger(g) {
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

function noAnswer(g, fromPhone = false) {
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

function returnParcel(g) {
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
function showReceipt(g, receipt) {
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
function openPlace(g, pl, extra = [], text = null) {
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
function busDialog(g, stop, openId = null, reopen = false) {
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

function landlord(g, pl) {
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

function minhReturn(g) {
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
  say(g, ped.name, '🧑', pickFor('ped.smallTalk', ped.who || personOf(ped.name), ped.id + Math.floor(g.clockMin / 30), pedVoice(g, ped)));
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
