// =============================================================
// MÔ PHỎNG KINH TẾ: bot chơi headless LIÊN TỤC nhiều ngày (đồng hồ 24h), nhiều seed, nhiều chiến thuật.
// Dùng ĐÚNG OrderManager, GameState, HazardManager, ItemPhysics của game;
// chỉ phần lái xe được thay bằng ước lượng thời gian + số lần xóc/phanh.
// Bot: nhận đơn khi app mở, trả tiền nhà theo kỳ, ngủ khi app nghỉ / thức quá lâu, ăn uống khi mệt.
// Chạy: npm run sim              (100 lượt × 9 ngày, ~2 phút)
//       npm run sim -- 100 --days 6
// =============================================================
import { OrderManager, S } from '../src/sim/OrderManager.js';
import { GameState } from '../src/sim/GameState.js';
import { HazardManager } from '../src/sim/hazards.js';
import { makeRng } from '../src/sim/rng.js';
import { buildLayout, routeDist, routeNodes, CITY } from '../src/sim/cityLayout.js';
import { lightMap, lightColor, ticketChance, turnOf } from '../src/sim/lights.js';
const lmap = lightMap();
import { routeFloodDelay, floodSpeedCap, floodBand, nearestSegId } from '../src/sim/flood.js';
import { segKeyOf } from '../src/sim/roads.js';
import { TIME, ENERGY, DIST, ORDER, ECONOMY, NIGHT, AIRPORT, BAGS, LIGHTS, dueDayOf } from '../src/data/balance.js';
import { airportAt } from '../src/sim/airport.js';
import { GOODS } from '../src/data/goods.js';
import { APP, ORDER_TYPES, RIDER_TYPES } from '../src/data/apps.js';
import { inHours } from '../src/sim/hours.js';
import { isOpen } from '../src/sim/placeRules.js';
import { dayOf, dayStartAt, minutesUntil, isDark } from '../src/sim/clock.js';

const layout = buildLayout();
const P = layout.placeById;

export const STRATEGIES = {
  // cẩn thận: chạy chậm, ít xóc, mua đồ nghề sớm
  careful: { speed: 9, eff: 0.7, bumpsPer100: 0.25, brakesPer100: 0.1, brakeMag: 0.3, buyGear: true, maxD1: 999, honest: true },
  // ẩu: chạy max ga, hay xóc, phanh gấp
  rush: { speed: 12.5, eff: 0.75, bumpsPer100: 0.8, brakesPer100: 0.5, brakeMag: 0.6, buyGear: true, maxD1: 999, honest: true, runReds: true }, // vượt đèn đỏ
  // kén đơn: chỉ nhận đơn gần, không mua đồ
  picky: { speed: 10, eff: 0.7, bumpsPer100: 0.4, brakesPer100: 0.2, brakeMag: 0.4, buyGear: false, maxD1: 120, honest: true },
  // bình thường: như 'tham' nhưng trả ví (để so sánh)
  normal: { speed: 10, eff: 0.7, bumpsPer100: 0.4, brakesPer100: 0.2, brakeMag: 0.4, buyGear: true, maxD1: 999, honest: true },
  // tham: giữ tiền trong ví
  greedy: { speed: 10, eff: 0.7, bumpsPer100: 0.4, brakesPer100: 0.2, brakeMag: 0.4, buyGear: true, maxD1: 999, honest: false },
};

// Bot chơi liên tục từ 06:00 ngày 1 tới 06:00 ngày (days + 1), hoặc tới khi thua.
// Trả về { gs, log, outcome, now, lastDay } — outcome.type: 'lose' | 'alive'
// brand: mã hãng bot chạy cho (bỏ trống = lượt lẻ GoShip, lượt chẵn HồngSM)
export function playRun(seed, strat, days = 9, brand = null) {
  const rng = makeRng(seed);
  const gs = new GameState({ day: 1 });
  let hz = new HazardManager(makeRng(seed * 7 + 1), 1);
  const om = new OrderManager({ rng: makeRng(seed * 13 + 5), layout, gs, isRaining: (m) => hz.isRaining(m), isFlooded: (door, m) => floodBand(hz.floodDepth(nearestSegId(door), m)) >= 1 });
  const st = STRATEGIES[strat];
  const end = dayStartAt(days + 1);
  let now = TIME.dayStart;
  let pos = { ...P.home.door };
  const log = { idleMin: 0, orders: 0, purchases: [], byType: {}, quits: 0, faints: 0, burnouts: 0, sleeps: 0, lates: 0, rentPaid: 0, earned: 0, stars: 0, starN: 0, bom: 0, oil: 0, daily: [] };
  let dayOrders = 0;
  om.on((e) => { if (e.type === 'cancelled') gs.applyCancel(e, now); });
  const over = () => !!gs.outcome || now >= end;

  // sang ngày mới lúc 06:00: số liệu theo ngày làm mới, lịch thời tiết / CSGT mới
  const rollDay = () => {
    const d = dayOf(now);
    if (d === gs.day) return;
    log.daily.push({ day: gs.day, orders: dayOrders, money: gs.money });
    for (const t of Object.keys(ORDER_TYPES)) log.earned += gs.stats.income[t] || 0;
    log.stars += gs.stats.stars.reduce((a, b) => a + b, 0);
    log.starN += gs.stats.stars.length;
    log.bom += gs.stats.bom;
    dayOrders = 0;
    gs.startDay(d);
    hz = new HazardManager(makeRng(seed * 7 + d * 101), d);
  };
  let wading = 0; // mực nước đang lội (đoạn ngập trên đường đi)
  const envAt = (speed) => ({
    ambient: hz.ambient(now), sun: hz.sun(now), raining: hz.isRaining(now), exposed: true, flood: speed > 0 ? wading : 0,
    speed, comfortSpeed: 11, suspension: gs.vehicleSpec.suspension, bag: gs.bagSpec, passengerRaincoat: gs.effect('rainProtect'),
  });
  const pass = (min, activity, speed = 0) => {
    for (let i = 0; i < min && !over(); i++) {
      now += 1;
      rollDay();
      gs.drain(activity, 1, { harshSun: hz.isHarshSun(now), raining: hz.isRaining(now), outdoor: activity !== 'sleep' && activity !== 'rest', inJam: false, waiting: activity === 'idle', now });
      om.tickItems(envAt(speed), 1);
      for (const e of (gs.checkEnd(now), gs.takeEvents())) if (e.type === 'late') log.lates++;
      if (gs.collapsed && activity !== 'rest') break; // kiệt sức → dừng để xử lý (đang nằm nghỉ thì thôi)
    }
  };
  // Đèn giao thông (sim/lights.js): qua mỗi ngã tư có đèn (trừ rẽ phải) gặp màu ngẫu nhiên theo chu kỳ.
  // Không xanh → bot thường đứng chờ tới xanh (1 giây thật = 1 phút game); bot ẩu (runReds) vượt luôn: đèn đỏ thì tính 1 lần vi phạm
  // như game.js (lần đầu mỗi ngày chỉ nhắc, tối đa maxPerDay lần phạt, tung % theo camera) — phạt trừ tiền ngay cho gọn.
  const G = LIGHTS.greenSec ?? 8, Y = LIGHTS.yellowSec ?? 2, cycle = 2 * (G + Y);
  const red = { day: 0, n: 0, tickets: 0 };
  const lightDelay = (nodes) => {
    let wait = 0;
    for (let k = 1; k < nodes.length - 1; k++) {
      const key = nodes[k].join(',');
      if (!lmap.has(key)) continue;
      const din = [Math.sign(nodes[k][0] - nodes[k - 1][0]), Math.sign(nodes[k][1] - nodes[k - 1][1])];
      const dout = [Math.sign(nodes[k + 1][0] - nodes[k][0]), Math.sign(nodes[k + 1][1] - nodes[k][1])];
      if (turnOf(din, dout) === 'right') continue;
      let t = rng.range(0, cycle);
      const c = lightColor(key, din, t);
      if (c === 'g') continue;
      if (st.runReds) {
        if (c !== 'r') continue;
        if (red.day !== gs.day) Object.assign(red, { day: gs.day, n: 0, tickets: 0 });
        red.n++;
        log.redRuns = (log.redRuns || 0) + 1;
        if ((red.n === 1 && (LIGHTS.warnFirst ?? 1)) || red.tickets >= (LIGHTS.maxPerDay ?? 2)) continue;
        if (rng.next() < ticketChance({ cam: lmap.get(key).cam })) {
          red.tickets++;
          log.redFines = (log.redFines || 0) + 1;
          gs.spend(LIGHTS.fine ?? 100, 'fine', true);
        }
        continue;
      }
      let w = 0;
      while (lightColor(key, din, t) !== 'g' && w < cycle) { t += 0.5; w += 0.5; }
      wait += w;
      log.lightWait = (log.lightWait || 0) + w;
    }
    return wait;
  };
  const drive = (to) => {
    const d = routeDist(pos, to);
    const v = st.speed * st.eff;
    let min = d / v; // m game / phút game = m/s × 1 giây thật
    if (rng.chance(0.15)) min += rng.range(2, 6); // kẹt xe, chốt CSGT
    min += lightDelay(routeNodes(pos, to)); // đèn giao thông: chờ đèn đỏ (bot ẩu thì vượt, có thể bị phạt nguội)
    // đường ngập: lội chậm trên các đoạn ngập (bot chạy chậm qua nước sâu nên không chết máy)
    const nodes = routeNodes(pos, to), depthOf = (id) => hz.floodDepth(id, now);
    min += routeFloodDelay(nodes, depthOf, v);
    let wetMin = 0, deepest = 0;
    for (let k = 1; k < nodes.length; k++) {
      const [a, b] = [nodes[k - 1], nodes[k]];
      const dep = depthOf(a[0] === b[0] ? segKeyOf('x', a[0], Math.min(a[1], b[1])) : segKeyOf('z', a[1], Math.min(a[0], b[0])));
      const cap = floodSpeedCap(dep);
      if (cap > 0) { wetMin += CITY.PITCH / Math.min(cap, v); deepest = Math.max(deepest, dep); }
    }
    // áo mưa: mưa thì gắn vào, tạnh thì tháo ra (gắn khi trời khô thì nóng — GameState.drain)
    if (gs.ownsOutfit('raincoat')) {
      const wet = hz.isRaining(now);
      if (wet && !gs.isWorn('raincoat')) gs.wear('raincoat');
      else if (!wet && gs.isWorn('raincoat')) gs.takeOff(GOODS.raincoat.slot);
    }
    const km = d * DIST.displayPerUnit / 1000;
    if (gs.power !== 'pedal') {
      const used = km * gs.vehicleSpec.fuelPer100km / 100 * gs.maintFuelMul(); // quá hạn bảo dưỡng → hao xăng / điện thêm
      gs.fuel = Math.max(0, gs.fuel - used);
      if (gs.power === 'gas') om.addFuel(used);
    }
    gs.addKm(km);
    const e = envAt(st.speed);
    const bumps = Math.round((d / 100) * st.bumpsPer100 + rng.next());
    const brakes = Math.round((d / 100) * st.brakesPer100 + rng.next() * 0.5);
    const dark = isDark(now) ? NIGHT.potholeMul || 1 : 1; // đêm tối: ổ gà xóc mạnh hơn
    for (let i = 0; i < bumps; i++) om.itemEvent('bump', (st.speed / 12.5) * rng.range(0.7, 1.2) * dark, e);
    for (let i = 0; i < brakes; i++) om.itemEvent('brake', st.brakeMag, e);
    // phần đường lội nước (hàng hộp giấy dễ ướt), rồi phần đường khô
    wading = deepest;
    pass(Math.min(Math.ceil(min), Math.round(wetMin)), 'drive', st.speed);
    wading = 0;
    pass(Math.max(0, Math.ceil(min) - Math.round(wetMin)), 'drive', st.speed);
    // chạy xe vào khuôn viên sân bay (đón / trả khách ở điểm đón xe công nghệ) → trả phí vào cổng
    if (airportAt(layout.places, to.x, to.z) && !airportAt(layout.places, pos.x, pos.z)) gs.spend(AIRPORT.gateFee ?? 0, 'airportGate', true);
    pos = { ...to };
  };
  // kiệt sức: hủy đơn đang chạy, nằm nghỉ bắt buộc ở phòng trọ
  const collapse = () => {
    const k = gs.collapsed;
    if (!k) return false;
    if (om.order) om.cancel('collapse', now, { byDriver: false });
    log[k === 'faint' ? 'faints' : 'burnouts']++;
    pos = { ...P.home.door };
    pass(ENERGY.collapse.hours * 60, 'rest');
    gs.recoverCollapse(k);
    gs.wake(now);
    return true;
  };
  const sleep = (minutes) => {
    drive(P.home.door);
    log.sleeps++;
    pass(minutes, 'sleep');
    gs.wake(now);
  };
  // tiền nhà sắp tới hạn (trong 1 ngày) thì giữ lại, không tiêu
  const rentReserve = () => (!gs.rentPaid && gs.rentDueAt() - now < 24 * 60 ? gs.rent : 0);
  // địa điểm gần nhất theo loại (trụ sạc, trạm đổi pin…)
  const nearestKind = (kind) => layout.places.filter((p) => p.kind === kind && p.door).sort((a, b) => routeDist(pos, a.door) - routeDist(pos, b.door))[0];
  // nạp năng lượng: xe xăng → cây xăng · xe điện → trụ sạc (đứng chờ sạc)
  const refill = () => {
    if (gs.power === 'electric') {
      const ch = nearestKind('charger');
      if (!ch) return;
      drive(ch.door);
      const r = gs.charge();
      if (r.ok) pass(r.minutes, 'idle');
    } else if (gs.power === 'gas') { drive(P.gas.door); gs.refuel(); pass(2, 'idle'); }
  };
  // mệt: tới chỗ bán đồ ăn uống gần nhất (đang mở cửa), mua món hồi thể lực nhiều nhất mà đủ tiền, ăn tới khi khỏe (tối đa 3 món)
  const foodOf = (pl) => (pl.sells?.goods || []).map((id) => GOODS[id]).filter((g) => g?.type === 'consumable' && g.use?.phys > 0);
  const eat = () => {
    const shopAt = layout.places.filter((pl) => pl.door && foodOf(pl).length && isOpen(pl, now, gs.day)).sort((a, b) => routeDist(pos, a.door) - routeDist(pos, b.door))[0];
    if (!shopAt) return;
    drive(shopAt.door);
    const menu = foodOf(shopAt).sort((a, b) => b.use.phys - a.use.phys);
    for (let n = 0; n < 3 && gs.phys < 75; n++) {
      const g = menu.find((x) => gs.money >= x.price + 25 + rentReserve());
      if (!g || !gs.buy('goods', g.id).ok) break;
      pass(gs.useConsumable(g.id).minutes, 'idle');
    }
  };
  // buồn chán: làm hoạt động tăng tinh thần nhiều nhất ở quán cà phê (đúng dữ liệu places.json)
  const relax = () => {
    const act = (P.cafe?.activities || []).filter((a) => a.mental > 0).sort((a, b) => b.mental - a.mental)[0];
    if (!act || gs.activityStatus(P.cafe, act, now) !== 'ok') return;
    drive(P.cafe.door);
    const r = gs.doActivity(P.cafe, act, now);
    if (r.ok) pass(r.minutes, 'idle');
  };
  const shop = () => {
    if (gs.power !== 'pedal' && gs.fuel < gs.vehicleSpec.tank * 0.2) refill();
    // bảo dưỡng sắp tới hạn (xe xăng: thay nhớt ở tiệm sửa xe · xe điện: đổi pin ở trạm) — đủ tiền, không đụng tiền nhà
    const ev = gs.power === 'electric';
    const maint = ev ? nearestKind('swap') : P.garage;
    if (gs.maintLeftKm < 2 && maint && gs.money >= (ev ? ECONOMY.swapCost ?? 45 : ECONOMY.oilCost ?? 60) + rentReserve()) {
      drive(maint.door);
      const r = ev ? gs.swapBattery() : gs.changeOil();
      if (r.ok) { log.oil++; pass(r.minutes, 'idle'); }
    }
    if (gs.phys < 40 && gs.money > 60 + rentReserve()) eat();
    if (gs.mental < 40 && gs.money > 40 + rentReserve()) relax();
    if (!st.buyGear) return;
    // nón chở khách: được tặng khi vào hãng; mất (khách cầm đi) thì mua lại nón của hãng ở văn phòng hãng
    const seatId = Object.values(GOODS).find((g) => g.brand === gs.brand && g.type === 'equipment' && g.effects?.passengerSeat)?.id || 'spareHelmet';
    const thermalId = Object.values(BAGS).filter((b) => b.insulation >= 0.5).sort((a, b) => a.price - b.price)[0]?.id; // túi rẻ nhất mở đơn lạnh
    const want = [...(thermalId ? [['bags', thermalId, 60]] : []), ['goods', seatId, 60], ['goods', 'raincoat', 40]];
    for (const [cat, id, reserve] of want) {
      if (cat === 'goods' ? (id === seatId ? gs.effect('passengerSeat') : gs.has(id)) : gs.owned[cat].includes(id)) continue;
      const price = (cat === 'goods' ? GOODS[id]?.price : BAGS[id]?.price) ?? 0;
      if (gs.money >= price + reserve + rentReserve()) {
        const at = GOODS[id]?.brand ? layout.places.find((p) => p.kind === 'office' && p.brand === gs.brand && p.door) : P.gear;
        drive((at || P.gear).door);
        if (gs.buy(cat, id).ok) log.purchases.push(`${id}@${Math.round(now)}`);
      }
      break;
    }
  };

  // Mở đầu: đạp xe tới văn phòng hãng (lượt lẻ GoShip · lượt chẵn HồngSM, hoặc theo `brand`), vào hãng, nạp năng lượng, bật app
  const brandId = brand || (seed % 2 ? 'goship' : 'hongsm');
  const office = layout.places.find((p) => p.kind === 'office' && p.brand === brandId && p.door);
  if (office) drive(office.door);
  gs.joinBrand(brandId);
  refill();
  gs.flags.mounted = gs.flags.online = true;
  om.goOnline();

  while (!over()) {
    if (collapse()) continue;
    if (om.state === S.IDLE || om.state === S.OFFLINE) {
      // trả tiền nhà khi đủ (giữ lại chút tiền xăng)
      if (!gs.rentPaid && gs.money >= gs.rent + 30) {
        drive(P.home.door);
        if (gs.payRent().ok) log.rentPaid++;
        continue;
      }
      // ngủ: app nghỉ → ngủ tới sáng; thức quá lâu → ngủ 8 tiếng
      if (!inHours(APP.hours, now)) { sleep(Math.min(9 * 60, minutesUntil(now, TIME.dayStart / 60))); continue; }
      if (gs.awakeHours(now) > ENERGY.sleep.tiredAfterH) { sleep(8 * 60); continue; }
    }
    // nhiệm vụ ví (ngắn gọn: 4 chặng)
    if (gs.flags.wallet === 1 && om.state === S.IDLE) {
      drive(P.taphoa.door); pass(3, 'walk'); drive(P.gate.door); pass(3, 'walk'); drive(P.cafe.door);
      if (st.honest) gs.returnWallet(); else gs.keepWalletCash();
      continue;
    }
    if (om.state === S.IDLE || om.state === S.OFFLINE) {
      shop();
      om.update(1, 1, now, pos);
      if (om.state !== S.OFFERED) { pass(1, 'idle'); log.idleMin++; continue; }
    }
    if (om.state === S.OFFERED) {
      if (routeDist(pos, om.offer.pickup.door) > st.maxD1 || gs.fuel < gs.vehicleSpec.tank * 0.07) { om.decline(now); continue; }
      // bot cẩn thận / kén chọn để ý dấu hiệu lừa đảo trên thẻ đơn (tài khoản mới, đòi tiền mặt) → từ chối
      // người chơi cẩn thận chỉ thấy dấu hiệu trên thẻ đơn (khách thường đôi khi cũng có) → thấy đủ 2 dấu hiệu thì từ chối
      const f = om.offer.flags || {};
      if (f.newAcct && f.cashOnly && (strat === 'careful' || strat === 'picky')) { om.decline(now); continue; }
      om.accept(now, pos);
    }
    const o = om.order;
    if (!o) continue;
    log.byType[o.type] = (log.byType[o.type] || 0) + 1;
    drive(o.pickup.door);
    if (collapse() || over()) continue;
    if (o.kind === 'food') {
      const r = om.arriveAtPickup(now);
      if (r.outOfStock) {
        const res = om.resolveOutOfStock('call', now);
        if (res.cancelled) continue;
      }
      pass(Math.ceil(om.minutesUntilReady(now)), 'idle');
      if (collapse() || over()) continue;
      const items = om.collectFood(now);
      if (!items) continue;
      om.finishPacking(items.map(() => ({ upright: true })), now);
    } else if (o.kind === 'parcel') {
      const r = om.collectParcel(now);
      if (r.noMoney) { om.cancel('noMoney', now, { byDriver: true }); continue; }
      om.finishPacking(r.items.map(() => ({ upright: true })), now);
    } else om.boardPassenger(now);
    // sự cố giữa đường (khách xe ôm): chạy tới khoảng giữa rồi xử lý
    if (o.kind === 'ride' && o.midEvent) {
      const ev = o.midEvent;
      drive({ x: o.pickup.door.x + (o.dropoff.door.x - o.pickup.door.x) * ev.at, z: o.pickup.door.z + (o.dropoff.door.z - o.pickup.door.z) * ev.at });
      if (collapse() || over()) continue;
      om.checkMidEvent(now, pos, true);
      if (ev.type === 'scam') {
        const r = om.resolveScam('comply', now); // đã nhận chuyến thì bot không kịp nhận ra
        if (r?.robbed != null) log.robbed = (log.robbed || 0) + r.robbed;
        continue;
      }
      if (ev.type === 'changeDest' && ev.alt) om.resolveChangeDest(true, now, pos);
    }
    if (!o.revealed) { const c = om.callCustomer(now); pass(c?.waitMin || 1, 'idle'); } // khách nước ngoài: gọi lâu hơn
    const from = { ...pos };
    drive(o.dropoff.door);
    if (collapse() || over()) continue;
    // khách xe ôm sợ quá đòi xuống (bot coi như xuống ở giữa đường)
    const rider = o.rider && RIDER_TYPES[o.rider];
    if (o.kind === 'ride' && rider && o.items[0].condition < (rider.quitBelow || 0)) {
      gs.applyReceipt(om.quitRide(now, { x: (from.x + pos.x) / 2, z: (from.z + pos.z) / 2 }));
      log.quits++;
      continue;
    }
    let res = om.arriveAtDropoff(now);
    let guard = 0;
    let returned = false;
    while (res !== 'ready' && guard++ < 10) {
      if (res === 'bom') {
        const p = om.persuadeBom(now);
        pass(3, 'idle');
        if (p && p.accepted) { res = 'ready'; continue; }
        om.startReturn(now);
        drive(o.pickup.door);
        om.returnToShop(now);
        returned = true;
        break;
      }
      if (res === 'noAnswer') {
        const c = om.callCustomer(now);
        pass(c.waitMin, 'idle');
        if (c.answered) res = om.arriveAtDropoff(now); // nghe máy rồi vẫn có thể bị bom (đơn thu hộ)
        else if (o.calls >= 2) { om.askNeighbor(now); drive(o.dropoff.door); res = om.arriveAtDropoff(now); }
      } else if (res === 'stairs') {
        const r = om.resolveStairs(gs.phys > 45 ? 'climb' : 'callDown');
        gs.addEnergy(-r.floors * ENERGY.phys.stairFloor, 0);
        pass(Math.ceil(r.minutes), 'walk');
        res = 'ready';
      } else if (res === 'lift') { pass(ORDER.liftMin, 'walk'); res = 'ready'; }
    }
    if (returned || !om.order || collapse()) continue;
    const receipt = om.handOver(now);
    if (!receipt) continue;
    gs.applyReceipt(receipt);
    log.orders++;
    dayOrders++;
    if (o.story === 'wallet') gs.findWallet();
  }
  if (!gs.outcome) rollDay();
  log.daily.push({ day: gs.day, orders: dayOrders, money: gs.money });
  for (const t of Object.keys(ORDER_TYPES)) log.earned += gs.stats.income[t] || 0;
  log.stars += gs.stats.stars.reduce((a, b) => a + b, 0);
  log.starN += gs.stats.stars.length;
  const lastDay = gs.outcome ? dayOf(now) : days;
  return { gs, log, outcome: gs.outcome || { type: 'alive' }, now, lastDay };
}

// Bản cũ (1 ngày) — để bộ thử gọn
export const playDay = (seed, strat) => playRun(seed, strat, 1);

// Gom kết quả nhiều lượt: % còn trụ qua từng hạn tiền nhà (ngày 3, 6, 9…), đơn/ngày, tiền cuối, ngất, trễ, lý do thua
export function summarize(runs, days) {
  const every = Math.max(1, ECONOMY.rentEveryDays || 1);
  const checkpoints = [];
  for (let k = 1; dueDayOf(k) <= days; k++) checkpoints.push(dueDayOf(k));
  if (!checkpoints.includes(days)) checkpoints.push(days);
  const n = runs.length || 1;
  // còn trụ qua ngày d = chưa thua trước 06:00 ngày d+1
  const alive = (r, d) => !r.outcome || r.outcome.type !== 'lose' || r.lastDay > d;
  const reasons = {};
  for (const r of runs) if (r.outcome.type === 'lose') { const k = r.outcome.reason.slice(0, 32); reasons[k] = (reasons[k] || 0) + 1; }
  const dayCount = runs.reduce((s, r) => s + r.log.daily.length, 0) || 1;
  return {
    every,
    checkpoints: checkpoints.map((d) => ({ day: d, pct: Math.round((runs.filter((r) => alive(r, d)).length / n) * 100) })),
    ordersPerDay: runs.reduce((s, r) => s + r.log.orders, 0) / dayCount,
    endMoney: runs.reduce((s, r) => s + r.gs.money, 0) / n,
    faints: runs.reduce((s, r) => s + r.log.faints + r.log.burnouts, 0) / n,
    lates: runs.reduce((s, r) => s + r.log.lates, 0) / n,
    stars: runs.reduce((s, r) => s + r.log.stars, 0) / Math.max(1, runs.reduce((s, r) => s + r.log.starN, 0)),
    topReason: Object.entries(reasons).sort((a, b) => b[1] - a[1])[0] || null,
    kmPerDay: runs.reduce((s, r) => s + r.gs.odoKm, 0) / dayCount,
    oilChanges: runs.reduce((s, r) => s + (r.log.oil || 0), 0) / n,
    lightWaitPerDay: runs.reduce((s, r) => s + (r.log.lightWait || 0), 0) / dayCount, // phút game chờ đèn đỏ mỗi ngày
    redFinesPerDay: runs.reduce((s, r) => s + (r.log.redFines || 0), 0) / dayCount, // lần bị phạt nguội vượt đèn đỏ mỗi ngày
  };
}

// ---------- chạy & in bảng ----------
// chạy bằng node (npm run sim); trong trình duyệt (nút Chạy thử bot của editor) không có process
const ARGV = typeof process !== 'undefined' && Array.isArray(process.argv) ? process.argv : [];
const isMain = !!ARGV[1] && ARGV[1].replace(/\\/g, '/').endsWith('tests/economy-sim.js');
if (isMain) {
  const N = Number(ARGV[2]) || 100;
  const daysArg = ARGV.indexOf('--days');
  const D = daysArg > 0 ? Number(ARGV[daysArg + 1]) || 9 : 9;
  console.log(`Bot chơi liên tục ${D} ngày (24h), ${N} lượt mỗi kiểu chơi. Tiền nhà mỗi ${ECONOMY.rentEveryDays} ngày, hạn ${ECONOMY.rentDueHour}:00, trễ ${ECONOMY.maxLate} lần liên tiếp là bị đuổi.\n`);
  for (const strat of Object.keys(STRATEGIES)) {
    const runs = [];
    for (let s = 1; s <= N; s++) runs.push(playRun(s, strat, D));
    const r = summarize(runs, D);
    const cps = r.checkpoints.map((c) => `qua ngày ${c.day}: ${String(c.pct).padStart(3)}%`).join(' · ');
    console.log(`${strat.padEnd(8)} | ${cps} | ${r.ordersPerDay.toFixed(1)} đơn/ngày | sao ${r.stars.toFixed(2)} | tiền cuối ${Math.round(r.endMoney)}k | ngất/suy sụp ${r.faints.toFixed(2)} | trễ ${r.lates.toFixed(2)} | ${r.kmPerDay.toFixed(1)} km/ngày · thay nhớt ${r.oilChanges.toFixed(1)} lần | chờ đèn ${Math.round(r.lightWaitPerDay)} phút/ngày · phạt đèn đỏ ${r.redFinesPerDay.toFixed(2)}/ngày | ${r.topReason ? `${r.topReason[0]}… (${r.topReason[1]})` : 'không ai thua'}`);
  }
}
