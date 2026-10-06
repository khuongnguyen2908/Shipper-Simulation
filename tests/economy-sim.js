// =============================================================
// MÔ PHỎNG KINH TẾ: bot chơi headless 1 ngày, nhiều seed, nhiều chiến thuật.
// Dùng ĐÚNG OrderManager, GameState, HazardManager, ItemPhysics của game;
// chỉ phần lái xe được thay bằng ước lượng thời gian + số lần xóc/phanh.
// Chạy: npm run sim   (thêm số seed: node tests/economy-sim.js 500)
// =============================================================
import { OrderManager, S } from '../src/sim/OrderManager.js';
import { GameState } from '../src/sim/GameState.js';
import { HazardManager } from '../src/sim/hazards.js';
import { makeRng } from '../src/sim/rng.js';
import { buildLayout, manhattan } from '../src/sim/cityLayout.js';
import { TIME, ENERGY, DIST, ORDER } from '../src/data/balance.js';
import { ORDER_TYPES, RIDER_TYPES } from '../src/data/apps.js';

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

export function playDay(seed, strat, day = 1) {
  const rng = makeRng(seed);
  const gs = new GameState({ day });
  const hz = new HazardManager(makeRng(seed * 7 + 1));
  const om = new OrderManager({ rng: makeRng(seed * 13 + 5), layout, gs, isRaining: (m) => hz.isRaining(m) });
  const st = STRATEGIES[strat];
  let now = TIME.dayStart;
  let pos = { ...P.home.door };
  const log = { idleMin: 0, orders: 0, winAt: null, purchases: [], byType: {}, quits: 0 };
  om.on((e) => { if (e.type === 'cancelled') gs.applyCancel(e, now); });

  const envAt = (speed) => ({
    ambient: hz.ambient(now), sun: hz.sun(now), raining: hz.isRaining(now), exposed: true,
    speed, comfortSpeed: 11, suspension: gs.vehicleSpec.suspension, bag: gs.bagSpec, passengerRaincoat: gs.effect('rainProtect'),
  });
  const pass = (min, activity, speed = 0) => {
    for (let i = 0; i < min && !gs.checkEnd(now); i++) {
      now += 1;
      gs.drain(activity, 1, { harshSun: hz.isHarshSun(now), raining: hz.isRaining(now), outdoor: true, inJam: false, waiting: activity === 'idle' });
      om.tickItems(envAt(speed), 1);
    }
  };
  const drive = (to) => {
    const d = manhattan(pos, to);
    const v = st.speed * st.eff;
    let min = d / v; // m game / phút game = m/s × 1 giây thật
    if (rng.chance(0.15)) min += rng.range(2, 6); // kẹt xe, chốt CSGT
    const liters = (d * DIST.displayPerUnit / 1000) * gs.vehicleSpec.fuelPer100km / 100;
    gs.fuel = Math.max(0, gs.fuel - liters);
    om.addFuel(liters);
    const e = envAt(st.speed);
    const bumps = Math.round((d / 100) * st.bumpsPer100 + rng.next());
    const brakes = Math.round((d / 100) * st.brakesPer100 + rng.next() * 0.5);
    for (let i = 0; i < bumps; i++) om.itemEvent('bump', (st.speed / 12.5) * rng.range(0.7, 1.2), e);
    for (let i = 0; i < brakes; i++) om.itemEvent('brake', st.brakeMag, e);
    pass(Math.ceil(min), 'drive', st.speed);
    pos = { ...to };
  };
  const shop = () => {
    if (gs.fuel < 0.6) { drive(P.gas.door); gs.refuel(); pass(2, 'idle'); }
    if (gs.phys < 40 && gs.money > 60) { drive(P.comtam.door); gs.spend(ENERGY.meal.cost, 'meal'); gs.addEnergy(ENERGY.meal.phys, ENERGY.meal.mental); pass(15, 'idle'); }
    if (gs.mental < 40 && gs.money > 40) { drive(P.cafe.door); gs.spend(ENERGY.drink.cost, 'meal'); gs.addEnergy(ENERGY.drink.phys, ENERGY.drink.mental); pass(10, 'idle'); }
    if (!st.buyGear) return;
    const want = [['bags', 'thermal', 60], ['goods', 'spareHelmet', 60], ['goods', 'raincoat', 40]];
    for (const [cat, id, reserve] of want) {
      if (cat === 'goods' ? gs.has(id) : gs.owned[cat].includes(id)) continue;
      const price = { thermal: 120, spareHelmet: 50, raincoat: 40 }[id];
      if (gs.money >= price + reserve + gs.rent * Math.max(0, (now - 17 * 60) / 300)) {
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

  while (!gs.checkEnd(now)) {
    if (gs.money >= gs.rent && om.state === S.IDLE) {
      drive(P.home.door);
      if (gs.payRent(now).ok) { log.winAt = now; break; }
    }
    // nhiệm vụ ví (ngắn gọn: 4 chặng)
    if (gs.flags.wallet === 1 && om.state === S.IDLE) {
      drive(P.taphoa.door); pass(3, 'walk'); drive(P.gate.door); pass(3, 'walk'); drive(P.cafe.door);
      if (st.honest) gs.returnWallet(); else gs.keepWalletCash();
      continue;
    }
    if (om.state === S.IDLE || om.state === S.OFFLINE) {
      shop();
      if (now >= TIME.lastOfferAt) { pass(1, 'idle'); log.idleMin++; continue; }
      om.update(1, 1, now, pos);
      if (om.state !== S.OFFERED) { pass(1, 'idle'); log.idleMin++; continue; }
    }
    if (om.state === S.OFFERED) {
      if (manhattan(pos, om.offer.pickup.door) > st.maxD1 || gs.fuel < 0.2) { om.decline(now); continue; }
      om.accept(now, pos);
    }
    const o = om.order;
    log.byType[o.type] = (log.byType[o.type] || 0) + 1;
    drive(o.pickup.door);
    if (o.kind === 'food') {
      const r = om.arriveAtPickup(now);
      if (r.outOfStock) {
        const res = om.resolveOutOfStock('call', now);
        if (res.cancelled) continue;
      }
      pass(Math.ceil(om.minutesUntilReady(now)), 'idle');
      const items = om.collectFood(now);
      if (!items) break; // hết ngày khi đang chờ quán làm món
      om.finishPacking(items.map(() => ({ upright: true })), now);
    } else if (o.kind === 'parcel') {
      const r = om.collectParcel(now);
      if (r.noMoney) { om.cancel('noMoney', now, { byDriver: true }); continue; }
      om.finishPacking(r.items.map(() => ({ upright: true })), now);
    } else om.boardPassenger(now);
    if (!o.revealed) { om.callCustomer(now); pass(1, 'idle'); }
    const from = { ...pos };
    drive(o.dropoff.door);
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
        if (c.answered) res = 'ready';
        else if (o.calls >= 2) { om.askNeighbor(now); drive(o.dropoff.door); res = om.arriveAtDropoff(now); }
      } else if (res === 'stairs') {
        const r = om.resolveStairs(gs.phys > 45 ? 'climb' : 'callDown');
        gs.addEnergy(-r.floors * ENERGY.phys.stairFloor, 0);
        pass(Math.ceil(r.minutes), 'walk');
        res = 'ready';
      } else if (res === 'lift') { pass(ORDER.liftMin, 'walk'); res = 'ready'; }
    }
    if (returned) continue;
    const receipt = om.handOver(now);
    gs.applyReceipt(receipt);
    log.orders++;
    if (o.story === 'wallet') gs.findWallet();
  }
  const out = gs.checkEnd(now);
  return { gs, log, outcome: out, now };
}

// ---------- chạy & in bảng ----------
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/economy-sim.js');
if (isMain) {
  const N = Number(process.argv[2]) || 300;
  const fmtT = (m) => (m == null ? '—' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`);
  console.log(`Mô phỏng ${N} ngày cho mỗi chiến thuật (ngày 1, tiền nhà 400k)\n`);
  const typeIds = Object.keys(ORDER_TYPES);
  console.log(`Chiến thuật | Thắng | Giờ thắng TB | Đơn/ngày | Sao TB | Lãi/đơn | Điểm cuối | Phút rảnh | Bom/ngày | Tỉ lệ loại đơn (${typeIds.join('/')}) | Lý do thua chính`);
  for (const strat of Object.keys(STRATEGIES)) {
    let wins = 0, winT = 0, orders = 0, stars = 0, starN = 0, rating = 0, idle = 0, earned = 0, bom = 0;
    const reasons = {}, byType = {};
    for (let s = 1; s <= N; s++) {
      const { gs, log, outcome } = playDay(s, strat);
      if (outcome.type === 'win') { wins++; winT += log.winAt; }
      else { const k = outcome.reason.slice(0, 28); reasons[k] = (reasons[k] || 0) + 1; }
      orders += log.orders;
      stars += gs.stats.stars.reduce((a, b) => a + b, 0);
      starN += gs.stats.stars.length;
      rating += gs.rating;
      idle += log.idleMin;
      bom += gs.stats.bom;
      for (const t of typeIds) earned += gs.stats.income[t] || 0;
      for (const [t, n] of Object.entries(log.byType)) byType[t] = (byType[t] || 0) + n;
    }
    const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    const total = Object.values(byType).reduce((a, b) => a + b, 0) || 1;
    const mix = typeIds.map((t) => Math.round(((byType[t] || 0) / total) * 100)).join('/');
    console.log(
      `${strat.padEnd(11)} | ${String(Math.round((wins / N) * 100)).padStart(4)}% | ${fmtT(wins ? winT / wins : null).padStart(12)} | ${(orders / N).toFixed(1).padStart(8)} | ${(stars / starN).toFixed(2).padStart(6)} | ${(earned / Math.max(1, orders)).toFixed(1).padStart(7)}k | ${(rating / N).toFixed(2).padStart(9)} | ${(idle / N).toFixed(0).padStart(9)} | ${(bom / N).toFixed(2).padStart(8)} | ${mix.padStart(13)} | ${top ? `${top[0]}… (${top[1]})` : '—'}`,
    );
  }
}
