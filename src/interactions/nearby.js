// =============================================================
// TƯƠNG TÁC — Danh sách tương tác gần người chơi · cốt truyện nói chuyện ở địa điểm · lên / xuống xe, lấy xe bị cẩu
// (một phần của src/interactions.js — mọi thao tác người chơi; chữ lấy từ vi.json qua fmt())
// =============================================================
import { VEHICLES } from '../data/balance.js';
import { circleFree } from '../world/physics.js';
import { GOODS } from '../data/goods.js';
import { STORY, stepOf, storyEvent } from '../sim/story.js';
import { DeliveryItem } from '../sim/ItemPhysics.js';
import { S } from '../sim/OrderManager.js';
import { nearestStop } from '../sim/bus.js';
import { fmt } from '../content/index.js';
import { buildPacking } from '../ui/packing.js';
import { sound } from '../audio.js';
import { inGarage, parkSlots } from '../sim/garage.js';
import { splitPages } from '../ui/modal.js';
import { dist, npc } from './common.js';
import { pickup, boardPassenger, dropoff, bom, returnParcel } from './delivery.js';
import { placeAction } from './places.js';
import { busDialog, landlord, talkPed } from './road.js';

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
  const storyBusy = !!g.storyChoice || !!g.cine; // đang chọn câu / đang chiếu cảnh phim
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

// Cốt truyện tự cho người chơi leo lên xe (hết cảnh phim cướp → ngồi sẵn trên xe để đuổi theo) — game.js storyRideAfterCine
export function mountBike(g) {
  if (g.mode !== 'bike') mount(g);
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

export function dismount(g) {
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
export function policeChoices(g, pl) {
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
