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
import { buildLayout, routeDist } from '../src/sim/cityLayout.js';
import { TIME, ENERGY, DIST, ORDER, ECONOMY, NIGHT, AIRPORT, dueDayOf } from '../src/data/balance.js';
import { airportAt } from '../src/sim/airport.js';
import { APP, ORDER_TYPES, RIDER_TYPES } from '../src/data/apps.js';
import { inHours } from '../src/sim/hours.js';
import { dayOf, dayStartAt, minutesUntil, isDark } from '../src/sim/clock.js';

const layout = buildLayout();
const P = layout.placeById;

export const STRATEGIES = {
  // cẩn thận: chạy chậm, ít xóc, mua đồ nghề sớm
  careful: { speed: 9, eff: 0.7, bumpsPer100: 0.25, brakesPer100: 0.1, brakeMag: 0.3, buyGear: true, maxD1: 999, honest: true },
  // ẩu: chạy max ga, hay xóc, phanh gấp
  rush: { speed: 12.5, eff: 0.75, bumpsPer100: 0.8, brakesPer100: 0.5, brakeMag: 0.6, buyGear: true, maxD1: 999, honest: true },
  // kén đơn: chỉ nhận đơn gần, không mua đồ
  picky: { speed: 10, eff: 0.7, bumpsPer100: 0.4, brakesPer100: 0.2, brakeMag: 0.4, buyGear: false, maxD1: 120, honest: true },
  // bình thường: như 'tham' nhưng trả ví (để so sánh)
  normal: { speed: 10, eff: 0.7, bumpsPer100: 0.4, brakesPer100: 0.2, brakeMag: 0.4, buyGear: true, maxD1: 999, honest: true },
  // tham: giữ tiền trong ví
  greedy: { speed: 10, eff: 0.7, bumpsPer100: 0.4, brakesPer100: 0.2, brakeMag: 0.4, buyGear: true, maxD1: 999, honest: false },
};

// Bot chơi liên tục từ 06:00 ngày 1 tới 06:00 ngày (days + 1), hoặc tới khi thua.
// Trả về { gs, log, outcome, now, lastDay } — outcome.type: 'lose' | 'alive'
export function playRun(seed, strat, days = 9) {
  const rng = makeRng(seed);
  const gs = new GameState({ day: 1 });
  let hz = new HazardManager(makeRng(seed * 7 + 1), 1);
  const om = new OrderManager({ rng: makeRng(seed * 13 + 5), layout, gs, isRaining: (m) => hz.isRaining(m) });
  const st = STRATEGIES[strat];
  const end = dayStartAt(days + 1);
  let now = TIME.dayStart;
  let pos = { ...P.home.door };
  const log = { idleMin: 0, orders: 0, purchases: [], byType: {}, quits: 0, faints: 0, burnouts: 0, sleeps: 0, lates: 0, rentPaid: 0, earned: 0, stars: 0, starN: 0, bom: 0, daily: [] };
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
  const envAt = (speed) => ({
    ambient: hz.ambient(now), sun: hz.sun(now), raining: hz.isRaining(now), exposed: true,
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
  const drive = (to) => {
    const d = routeDist(pos, to);
    const v = st.speed * st.eff;
    let min = d / v; // m game / phút game = m/s × 1 giây thật
    if (rng.chance(0.15)) min += rng.range(2, 6); // kẹt xe, chốt CSGT
    const liters = (d * DIST.displayPerUnit / 1000) * gs.vehicleSpec.fuelPer100km / 100;
    gs.fuel = Math.max(0, gs.fuel - liters);
    om.addFuel(liters);
    const e = envAt(st.speed);
    const bumps = Math.round((d / 100) * st.bumpsPer100 + rng.next());
    const brakes = Math.round((d / 100) * st.brakesPer100 + rng.next() * 0.5);
    const dark = isDark(now) ? NIGHT.potholeMul || 1 : 1; // đêm tối: ổ gà xóc mạnh hơn
    for (let i = 0; i < bumps; i++) om.itemEvent('bump', (st.speed / 12.5) * rng.range(0.7, 1.2) * dark, e);
    for (let i = 0; i < brakes; i++) om.itemEvent('brake', st.brakeMag, e);
    pass(Math.ceil(min), 'drive', st.speed);
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
  const shop = () => {
    if (gs.fuel < 0.6) { drive(P.gas.door); gs.refuel(); pass(2, 'idle'); }
    if (gs.phys < 40 && gs.money > 60 + rentReserve()) { drive(P.comtam.door); gs.spend(ENERGY.meal.cost, 'meal'); gs.addEnergy(ENERGY.meal.phys, ENERGY.meal.mental); pass(15, 'idle'); }
    if (gs.mental < 40 && gs.money > 40 + rentReserve()) { drive(P.cafe.door); gs.spend(ENERGY.drink.cost, 'meal'); gs.addEnergy(ENERGY.drink.phys, ENERGY.drink.mental); pass(10, 'idle'); }
    if (!st.buyGear) return;
    const want = [['bags', 'thermal', 60], ['goods', 'spareHelmet', 60], ['goods', 'raincoat', 40]];
    for (const [cat, id, reserve] of want) {
      if (cat === 'goods' ? gs.has(id) : gs.owned[cat].includes(id)) continue;
      const price = { thermal: 120, spareHelmet: 50, raincoat: 40 }[id];
      if (gs.money >= price + reserve + rentReserve()) {
        drive(P.gear.door);
        if (gs.buy(cat, id).ok) log.purchases.push(`${id}@${Math.round(now)}`);
      }
      break;
    }
  };

  // Mở đầu: lên xe, đổ xăng, bật app
  drive(P.gas.door);
  gs.refuel();
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
      if (routeDist(pos, om.offer.pickup.door) > st.maxD1 || gs.fuel < 0.2) { om.decline(now); continue; }
      // bot cẩn thận / kén chọn để ý dấu hiệu lừa đảo trên thẻ đơn (tài khoản mới, đòi tiền mặt) → từ chối
      if (om.offer.flags?.scam && (strat === 'careful' || strat === 'picky')) { om.decline(now); continue; }
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
    console.log(`${strat.padEnd(8)} | ${cps} | ${r.ordersPerDay.toFixed(1)} đơn/ngày | sao ${r.stars.toFixed(2)} | tiền cuối ${Math.round(r.endMoney)}k | ngất/suy sụp ${r.faints.toFixed(2)} | trễ ${r.lates.toFixed(2)} | ${r.topReason ? `${r.topReason[0]}… (${r.topReason[1]})` : 'không ai thua'}`);
  }
}
