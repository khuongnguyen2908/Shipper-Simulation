// Bộ thử tự động cho phần mô phỏng thuần. Chạy: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS as DATA_ITEMS } from '../src/data/items.js';
import { ECONOMY, TIME, ENERGY, HAZARD as HAZARD_DATA, rentFor } from '../src/data/balance.js';
import { DeliveryItem } from '../src/sim/ItemPhysics.js';
import { evaluateOrder } from '../src/sim/OrderCondition.js';
import { computePayout } from '../src/sim/economy.js';
import { OrderManager, S, TRANSITIONS } from '../src/sim/OrderManager.js';
import { GameState } from '../src/sim/GameState.js';
import { HazardManager } from '../src/sim/hazards.js';
import { makeRng } from '../src/sim/rng.js';
import { buildLayout, blockAt, HALF } from '../src/sim/cityLayout.js';
import * as CITYLAYOUT from '../src/sim/cityLayout.js';
import { objectives } from '../src/sim/objectives.js';
import { ranges } from '../src/sim/hours.js';
import { dayOf, dayStartAt, atHour, fmtClock, minutesUntil } from '../src/sim/clock.js';
import { isOpen } from '../src/sim/placeRules.js';
import * as CONTENT from '../src/content/index.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✘ ${name}\n    ${e.message}`);
  }
}

// Món dùng cho bộ thử luật: cố định ở đây để việc sửa items.json trong công cụ không làm hỏng bộ thử
const ITEMS = {
  comTam: { id: 'comTam', name: 'Cơm', icon: '🍱', traits: ['hot', 'paper'], base: 25, startTemp: 75 },
  pho: { id: 'pho', name: 'Phở', icon: '🍜', traits: ['hot', 'liquid'], base: 28, startTemp: 85 },
  kem: { id: 'kem', name: 'Kem', icon: '🍨', traits: ['cold'], base: 32, startTemp: -8, meltAt: -2, meltRate: 0.2 },
  banhKem: { id: 'banhKem', name: 'Bánh', icon: '🎂', traits: ['fragile', 'paper'], base: 45 },
  passenger: { id: 'passenger', name: 'Khách', icon: '🧍', traits: ['passenger'], base: 30 },
};
// Số app cố định cho bộ thử công thức tiền (sửa apps.json trong công cụ không làm hỏng bộ thử)
const TEST_APP = { platformFee: 0.2, taxRate: 0.015, distBonusPerKm: 4, extraItemFare: 6, tipByStars: [0, 0, 0, 0, 3, 8], cancelComp: 5 };
const NO_BAG = { insulation: 0, waterproof: 0, padding: 0 };
const THERMAL = { insulation: 0.55, waterproof: 0.5, padding: 0.25 };
const env = (o = {}) => ({ ambient: 30, sun: 0.5, raining: false, exposed: true, speed: 8, comfortSpeed: 11, suspension: 0.2, bag: NO_BAG, ...o });
const layout = buildLayout();
// dữ liệu đúng như trên đĩa (đã sửa bằng ?editor)
const readJson = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const DATA = { items: readJson('src/data/items.json'), apps: readJson('src/data/apps.json'), places: readJson('src/data/places.json'), itemsCod: (id) => DATA.items[id].cod };
const ITEMS_DATA_BASE = (id) => DATA_ITEMS[id].base;
const VALIDATE = await import('../src/data/validate.js');

console.log('Vật lý món hàng');
test('Phở nguội dần, túi giữ nhiệt nguội chậm hơn', () => {
  const a = new DeliveryItem(ITEMS.pho), b = new DeliveryItem(ITEMS.pho);
  for (let i = 0; i < 30; i++) { a.tick(env(), 1); b.tick(env({ bag: THERMAL }), 1); }
  assert.ok(a.temp < 85 && b.temp > a.temp, `${a.temp} vs ${b.temp}`);
  assert.ok(a.condition <= b.condition);
});
test('Kem tan nhanh hơn khi nắng gắt', () => {
  const a = new DeliveryItem(ITEMS.kem), b = new DeliveryItem(ITEMS.kem);
  for (let i = 0; i < 25; i++) { a.tick(env({ bag: THERMAL, sun: 0, ambient: 27 }), 1); b.tick(env({ bag: THERMAL, sun: 1, ambient: 35 }), 1); }
  assert.ok(b.condition < a.condition, `${a.condition} vs ${b.condition}`);
});
test('Canh đổ khi xóc; giảm xóc tốt và để đứng thì đổ ít hơn', () => {
  const cub = new DeliveryItem(ITEMS.pho), sport = new DeliveryItem(ITEMS.pho), tilted = new DeliveryItem(ITEMS.pho);
  tilted.applyPacking({ upright: false });
  const before = tilted.condition;
  cub.event('bump', 1, env({ suspension: 0.2 }));
  sport.event('bump', 1, env({ suspension: 0.8 }));
  tilted.event('bump', 1, env({ suspension: 0.2 }));
  assert.ok(sport.condition > cub.condition);
  assert.ok(before - tilted.condition > 100 - cub.condition);
});
test('Bánh kem hỏng nặng khi va chạm, đệm túi giảm hư hại', () => {
  const a = new DeliveryItem(ITEMS.banhKem), b = new DeliveryItem(ITEMS.banhKem);
  a.event('collision', 2, env());
  b.event('collision', 2, env({ bag: { insulation: 0.8, waterproof: 1, padding: 0.55 } }));
  assert.ok(a.condition < 50 && b.condition > a.condition);
});
test('Bánh kem bị đè khi xếp túi mất 30%', () => {
  const a = new DeliveryItem(ITEMS.banhKem);
  a.applyPacking({ crushed: true });
  assert.equal(a.condition, 70);
});
test('Hộp giấy ướt mưa, túi chống nước bảo vệ', () => {
  const a = new DeliveryItem(ITEMS.comTam), b = new DeliveryItem(ITEMS.comTam);
  for (let i = 0; i < 20; i++) { a.tick(env({ raining: true }), 1); b.tick(env({ raining: true, bag: { insulation: 0.8, waterproof: 1, padding: 0.5 } }), 1); }
  assert.ok(a.reasons.wet > 5 && !b.reasons.wet);
});
test('Khách xe ôm hoảng khi chạy quá nhanh', () => {
  const a = new DeliveryItem(ITEMS.passenger), b = new DeliveryItem(ITEMS.passenger);
  for (let i = 0; i < 10; i++) { a.tick(env({ speed: 15 }), 1); b.tick(env({ speed: 9 }), 1); }
  assert.ok(a.condition < 80 && b.condition === 100);
});

console.log('Chấm sao & tiền');
test('Giao nhanh, hàng tốt → 5 sao', () => {
  const ev = evaluateOrder({ items: [new DeliveryItem(ITEMS.comTam)], elapsedMin: 20, allowedMin: 40 });
  assert.equal(ev.stars, 5);
});
test('Trễ 20% và hàng còn 80% → 3 sao; trễ 30% + hàng 70% → 1 sao', () => {
  const it = new DeliveryItem(ITEMS.comTam);
  it.damage(20, 'x');
  assert.equal(evaluateOrder({ items: [it], elapsedMin: 48, allowedMin: 40 }).stars, 3); // 5 − 0.5 − 1 = 3.5 → 3
  it.damage(10, 'x');
  assert.equal(evaluateOrder({ items: [it], elapsedMin: 52, allowedMin: 40 }).stars, 1); // 5 − 1.5 − 2 = 1.5 → 1
});
test('Hàng dưới 25% → khách từ chối, 0 đồng', () => {
  const it = new DeliveryItem(ITEMS.pho);
  it.damage(80, 'x');
  const ev = evaluateOrder({ items: [it], elapsedMin: 10, allowedMin: 40 });
  assert.ok(ev.refused);
  const pay = computePayout({ baseFare: 28, distanceKm: 2, litersUsed: 0.1, refused: true });
  assert.equal(pay.walletCredit, 0);
});
test('Chở khách: chấm theo "thoải mái"; hoảng sợ (<25%) → 1 sao, chỉ trả một phần cước', () => {
  const { fmt } = CONTENT;
  const ok = new DeliveryItem(ITEMS.passenger);
  ok.damage(30, 'x');
  const ev1 = evaluateOrder({ items: [ok], elapsedMin: 10, allowedMin: 40, ride: true });
  assert.ok(ev1.penalties.some((p) => p.label === fmt('pen.comfort', { pct: 70 })), 'nhãn phạt phải nói về khách');
  assert.ok(!ev1.penalties.some((p) => p.label === fmt('pen.condition', { pct: 70 })), 'không được dùng nhãn "hàng"');
  const scared = new DeliveryItem(ITEMS.passenger);
  scared.damage(80, 'x');
  const ev2 = evaluateOrder({ items: [scared], elapsedMin: 10, allowedMin: 40, ride: true });
  assert.ok(ev2.scared && !ev2.refused);
  assert.equal(ev2.stars, 1);
  const full = computePayout({ baseFare: 30, distanceKm: 2.5, stars: 1 });
  const half = computePayout({ baseFare: 30, distanceKm: 2.5, stars: 1, farePct: ECONOMY.scaredFarePct });
  assert.ok(half.walletCredit > 0 && Math.abs(half.gross - full.gross * ECONOMY.scaredFarePct) < 0.11, `${half.gross} vs ${full.gross}`);
});
test('Công thức: (cước + quãng đường) − 20% − thuế − xăng', () => {
  const p = computePayout({ baseFare: 30, distanceKm: 2.5, litersUsed: 0.1, stars: 5, app: TEST_APP });
  assert.equal(p.gross, 40);
  assert.equal(p.fee, 8);
  assert.equal(p.tax, 0.6);
  assert.equal(p.fuelCost, 2.3);
  assert.equal(p.final, 29.1);
  assert.equal(p.tip, 8);
  assert.equal(p.walletCredit, 39.4);
});

console.log('Máy trạng thái đơn hàng');
function mkOM(seed = 1, gsOpts = {}) {
  const gs = new GameState(gsOpts);
  const om = new OrderManager({ rng: makeRng(seed), layout, gs });
  return { gs, om };
}
test('Giao chung cư: tầng giao nằm trong số tầng chung cư (đặt trong editor)', () => {
  const apt = layout.placeById.apartment, old = apt.floors;
  try {
    for (const [fl, lo, hi] of [[12, 3, 11], [5, 3, 4], [3, 2, 2]]) {
      apt.floors = fl;
      const om = new OrderManager({ rng: makeRng(fl), layout, gs: new GameState() });
      const seen = [];
      for (let i = 0; i < 600; i++) {
        const d = om.pickDropoff({ x: 0, z: 0 });
        if (d.apartment) seen.push(d.floor);
      }
      assert.ok(seen.length > 20, 'có đơn chung cư');
      assert.ok(seen.every((f) => f >= lo && f <= hi), fl + ' tầng → ' + Math.min(...seen) + '–' + Math.max(...seen));
    }
  } finally {
    apt.floors = old;
  }
});
test('Chuyển trạng thái sai thì báo lỗi', () => {
  const { om } = mkOM();
  assert.throws(() => om.go(S.DELIVERING));
  for (const [k, v] of Object.entries(TRANSITIONS)) for (const n of v) assert.ok(S[n], `${k}→${n}`);
});
function getOffer(om, now = 480) {
  om.goOnline();
  for (let i = 0; i < 100 && om.state !== S.OFFERED; i++) om.update(1, 1, now, { x: 0, z: 0 });
  assert.equal(om.state, S.OFFERED);
  return om.offer;
}
test('Đơn hết hạn nếu không nhận trong 25 giây', () => {
  const { om } = mkOM(3);
  getOffer(om);
  for (let i = 0; i < 30; i++) om.update(0.01, 1, 480, { x: 0, z: 0 });
  assert.equal(om.state, S.IDLE);
});
test('Một đơn đồ ăn đi trọn vòng → IDLE và có hóa đơn', () => {
  for (let seed = 1; seed < 40; seed++) {
    const { om } = mkOM(seed);
    const offer = getOffer(om);
    if (offer.kind !== 'food') continue;
    let now = 480;
    om.accept(now);
    const r = om.arriveAtPickup(now);
    if (r.outOfStock) om.resolveOutOfStock('cook', now);
    now = om.order.readyAt + 0.1;
    const items = om.collectFood(now);
    assert.ok(items.length >= 1);
    om.finishPacking(items.map(() => ({ upright: true })), now);
    assert.equal(om.state, S.DELIVERING);
    if (!om.order.revealed) om.callCustomer(now);
    let res = om.arriveAtDropoff(now + 10);
    let guard = 0;
    while (res !== 'ready' && res !== 'lift' && guard++ < 20) {
      if (res === 'noAnswer') { const c = om.callCustomer(now); res = c.answered ? 'ready' : 'noAnswer'; }
      else if (res === 'stairs') { om.resolveStairs('climb'); res = 'ready'; }
    }
    const receipt = om.handOver(now + 15);
    assert.ok(receipt && receipt.ev.stars >= 1);
    assert.equal(om.state, S.IDLE);
    return;
  }
  assert.fail('Không tìm được đơn đồ ăn');
});
test('Khách không nghe máy → hỏi hàng xóm → đổi điểm giao', () => {
  for (let seed = 1; seed < 300; seed++) {
    const { om } = mkOM(seed);
    const offer = getOffer(om);
    if (offer.kind !== 'food' || !offer.flags.noAnswer || offer.flags.outOfStock) continue;
    om.accept(480);
    om.arriveAtPickup(480);
    om.collectFood(om.order.readyAt + 1);
    om.finishPacking([], 500);
    const old = om.order.dropoff.door;
    assert.equal(om.arriveAtDropoff(510), 'noAnswer');
    om.askNeighbor(511);
    assert.equal(om.state, S.DELIVERING);
    assert.notDeepEqual(om.order.dropoff.door, old);
    assert.equal(om.arriveAtDropoff(520), 'ready');
    return;
  }
  assert.fail('Không có đơn khách không nghe máy');
});
test('Đơn kem/trà sữa chỉ xuất hiện khi có túi giữ nhiệt', () => {
  const { om, gs } = mkOM(7, { carry: { money: 500 } });
  om.goOnline();
  for (let i = 0; i < 80; i++) {
    const o = om.makeOffer(480, { x: 0, z: 0 });
    assert.ok(!o.itemIds.some((id) => DATA_ITEMS[id].traits.includes('cold')));
  }
  gs.buy('bags', 'thermal');
  // chọn giờ quán có món lạnh đang mở (giờ mở cửa do người dùng chỉnh trong ?editor)
  const coldShop = om.layout.places.find((p) => (p.menu || []).some((id) => DATA_ITEMS[id]?.traits.includes('cold')));
  if (!coldShop) return; // dữ liệu không còn quán nào bán món lạnh
  const open1 = ranges(coldShop.hours); // khung giờ có thể là mẫu / nhiều đoạn
  const t = open1 ? open1[0][0] * 60 + 30 : 480;
  let sawCold = false;
  for (let i = 0; i < 200 && !sawCold; i++) if (om.makeOffer(t, { x: 0, z: 0 }).itemIds.some((id) => DATA_ITEMS[id].traits.includes('cold'))) sawCold = true;
  assert.ok(sawCold, `không thấy đơn món lạnh lúc ${t / 60}h từ ${coldShop.id}`);
});
test('Có mũ cho khách → đơn chở anh Minh (nhiệm vụ ví)', () => {
  const { om, gs } = mkOM(9, { carry: { money: 500 } });
  gs.buy('goods', 'spareHelmet');
  const o = om.makeOffer(480, { x: 0, z: 0 });
  assert.equal(o.kind, 'ride');
  assert.equal(o.story, 'wallet');
});

console.log('Trạng thái người chơi');
test('Tiền nhà theo kỳ: trả sớm được; đúng hạn sang kỳ mới; trễ lần 1 phạt + dồn nợ; trễ 2 lần liên tiếp bị đuổi', () => {
  const every = ECONOMY.rentEveryDays, due = (k) => atHour(k * every, ECONOMY.rentDueHour);
  const gs = new GameState({ carry: { money: 1e6 } });
  assert.equal(gs.rentDueDay, every);
  assert.equal(gs.rent, rentFor(1));
  assert.ok(gs.payRent().ok);
  assert.ok(!gs.payRent().ok, 'đã trả kỳ này thì không trả nữa');
  assert.equal(gs.checkEnd(due(1)), null, 'trả rồi → không thua');
  assert.equal(gs.rentState.period, 2);
  assert.equal(gs.rent, rentFor(2));
  // kỳ 2 không trả → trễ lần 1: phạt, nợ dồn sang kỳ 3
  assert.equal(gs.checkEnd(due(2)), null);
  const lateEv = gs.takeEvents().find((e) => e.type === 'late');
  assert.ok(lateEv && lateEv.fine === Math.round(rentFor(2) * ECONOMY.lateFeePct));
  assert.equal(gs.rent, rentFor(3) + Math.round(rentFor(2) * (1 + ECONOMY.lateFeePct)));
  // trả kịp kỳ 3 → xóa vết trễ
  assert.ok(gs.payRent().ok);
  assert.equal(gs.rentState.late, 0);
  gs.checkEnd(due(3));
  // kỳ 4, 5 không trả → bị đuổi
  gs.checkEnd(due(4));
  assert.equal(gs.outcome, null);
  assert.equal(gs.checkEnd(due(5)).type, 'lose');
});
test('Thua khi điểm dưới 4,0; kiệt sức không thua mà phải nằm nghỉ (ngất mất tiền thuốc)', () => {
  const a = new GameState();
  for (let i = 0; i < 4; i++) a.ratingBook.add(1);
  assert.equal(a.checkEnd(600).type, 'lose');
  const b = new GameState({ carry: { money: 500 } });
  b.phys = 0;
  assert.equal(b.checkEnd(600), null);
  assert.equal(b.collapsed, 'faint');
  const r = b.recoverCollapse('faint');
  assert.equal(r.fee, ECONOMY.faintFee);
  assert.equal(b.money, 500 - ECONOMY.faintFee);
  assert.equal(b.phys, ENERGY.collapse.phys);
  const c = new GameState({ carry: { money: 30 } });
  c.mental = 0;
  assert.equal(c.collapsed, 'burnout');
  c.recoverCollapse('burnout');
  assert.ok(c.mental > 0 && c.money === 30, 'suy sụp không mất tiền');
  const d = new GameState({ carry: { money: 20 } });
  d.phys = 0;
  d.recoverCollapse('faint');
  assert.equal(d.money, 0, 'không đủ tiền thuốc thì lấy hết, không âm');
});
test('Ngủ hồi thanh; thức quá lâu thì hao nhanh hơn; sang ngày mới làm mới số liệu theo ngày', () => {
  const S = ENERGY.sleep;
  const gs = new GameState();
  gs.phys = 10; gs.mental = 10;
  gs.drain('sleep', 60, { now: 600 });
  assert.ok(Math.abs(gs.phys - (10 + S.physPerHour)) < 1e-6 && Math.abs(gs.mental - (10 + S.mentalPerHour)) < 1e-6);
  const t0 = gs.awakeSince;
  assert.equal(gs.tiredMul(t0 + 60), 1);
  assert.equal(gs.tiredMul(t0 + (S.tiredAfterH + 1) * 60), S.tiredMul);
  assert.equal(gs.tiredMul(t0 + (S.veryTiredAfterH + 1) * 60), S.veryTiredMul);
  const x = new GameState(), y = new GameState();
  x.drain('drive', 10, { now: t0 + 60 });
  y.drain('drive', 10, { now: t0 + (S.veryTiredAfterH + 1) * 60 });
  assert.ok(100 - y.phys > (100 - x.phys) * (S.veryTiredMul - 0.01));
  gs.wake(t0 + 999);
  assert.equal(gs.tiredMul(t0 + 1000), 1);
  gs.activityUses = { 'a.b': 1 };
  gs.stats.driverCancels = 3;
  gs.startDay(2);
  assert.equal(gs.day, 2);
  assert.deepEqual(gs.activityUses, {});
  assert.equal(gs.stats.driverCancels, 0);
});
test('Lưu game giữ thể lực, tinh thần, giờ thức dậy, tiền nhà kỳ này', () => {
  const gs = new GameState({ carry: { money: 5000 } });
  gs.phys = 33; gs.mental = 44; gs.awakeSince = 777;
  gs.payRent();
  const b = new GameState({ day: 2, carry: JSON.parse(JSON.stringify(gs.carryOver())) });
  assert.deepEqual([b.phys, b.mental, b.awakeSince, b.rentPaid, b.rentState.period], [33, 44, 777, true, 1]);
});
test('Đồng hồ 24h: đổi ngày lúc 06:00; giờ mở cửa tính theo giờ trong ngày', () => {
  assert.equal(dayOf(TIME.dayStart), 1);
  assert.equal(dayOf(dayStartAt(2) - 1), 1);
  assert.equal(dayOf(dayStartAt(2)), 2);
  assert.equal(atHour(3, 22), dayStartAt(3) + 16 * 60);
  assert.equal(atHour(1, 2), dayStartAt(1) + 20 * 60, '02:00 vẫn thuộc ngày chơi hôm trước');
  assert.equal(fmtClock(dayStartAt(2) + 17 * 60 + 5), '23:05');
  assert.equal(minutesUntil(dayStartAt(1) + 22 * 60, 6), 2 * 60);
  // quán 8–21: ngày 2 lúc 07:00 đóng, 08:00 mở
  assert.equal(isOpen({ hours: [8, 21] }, dayStartAt(2) + 60), false);
  assert.equal(isOpen({ hours: [8, 21] }, dayStartAt(2) + 120), true);
});
test('Lịch mưa / CSGT theo từng ngày: cùng giờ trong ngày ở ngày nào cũng tính đúng', () => {
  const h1 = new HazardManager(makeRng(5), 1), h3 = new HazardManager(makeRng(5), 3);
  const r = h1.rain[0];
  const mid = (r.start + r.end) / 2;
  assert.equal(h1.isRaining(mid), true);
  assert.equal(h3.isRaining(dayStartAt(3) - TIME.dayStart + mid), true, 'cùng lịch → ngày 3 cũng mưa đúng giờ đó');
  assert.equal(h3.isRaining(mid), false, 'giờ của ngày 1 không ảnh hưởng ngày 3');
});
test('Đổ xăng trừ tiền đúng giá', () => {
  const gs = new GameState();
  const m = gs.money;
  const r = gs.refuel();
  assert.ok(r.ok);
  assert.ok(Math.abs(m - gs.money - r.liters * ECONOMY.fuelPrice) < 0.1);
});
test('Ngày 1 có 3 mục tiêu hướng dẫn, ngày 2 thì không', () => {
  assert.ok(objectives(new GameState()).some((o) => o.id === 'mount'));
  assert.ok(!objectives(new GameState({ day: 2 })).some((o) => o.id === 'mount'));
});

console.log('Bản đồ & chướng ngại');
test('Mọi cửa nhà nằm trên vỉa hè, trong bản đồ', () => {
  for (const l of [...layout.lots, ...layout.places]) {
    assert.ok(Math.abs(l.door.x) < HALF && Math.abs(l.door.z) < HALF, l.address);
    assert.ok(blockAt(l.door.x, l.door.z), `${l.address} không nằm trên vỉa hè`);
    const inside = l.door.x > l.x0 && l.door.x < l.x1 && l.door.z > l.z0 && l.door.z < l.z1;
    assert.ok(!inside, `${l.address}: cửa nằm trong nhà`);
  }
});
test('Địa chỉ khách hàng không trùng nhau', () => {
  const s = new Set(layout.lots.map((l) => l.address));
  assert.equal(s.size, layout.lots.length);
});
test('Lịch chướng ngại lặp lại theo seed, luôn có mưa chiều', () => {
  const a = new HazardManager(makeRng(42)), b = new HazardManager(makeRng(42));
  assert.deepEqual(a.rain, b.rain);
  assert.ok(a.rain.some((r) => r.heavy && r.start >= 14 * 60));
  assert.ok(a.police.length >= 3);
  assert.equal(a.potholes.length, HAZARD_DATA.potholes);
  for (const p of a.potholes) assert.ok(!blockAt(p.x, p.z), 'ổ gà nằm trên vỉa hè');
});

console.log('Đồ dùng, hoạt động, điểm đến (luật bằng dữ liệu)');
{
  const goodsMod = await import('../src/data/goods.js');
  const { GOODS } = goodsMod;
  const { isOpen } = await import('../src/sim/placeRules.js');
  test('Trang bị cộng dồn tác dụng; bản lưu cũ (owned.gear) vẫn có tác dụng', () => {
    const gs = new GameState({ carry: { money: 1000, owned: { vehicles: ['cub'], bags: ['nylon'], gear: ['raincoat'] } } });
    assert.equal(gs.effect('rainProtect'), true);
    assert.equal(gs.effect('passengerSeat'), false);
    GOODS.__t1 = { id: '__t1', name: 'a', price: 1, type: 'equipment', effects: { physDrainPct: -10 } };
    GOODS.__t2 = { id: '__t2', name: 'b', price: 1, type: 'equipment', effects: { physDrainPct: -20, paddingPct: 30 } };
    gs.buy('goods', '__t1');
    gs.buy('goods', '__t2');
    assert.equal(gs.effect('physDrainPct'), -30);
    assert.ok(Math.abs(gs.cargoBag.padding - 0.3) < 1e-9);
    const a = new GameState();
    a.drain('drive', 60, { outdoor: true });
    gs.drain('drive', 60, { outdoor: true });
    assert.ok(100 - gs.phys < 100 - a.phys);
    delete GOODS.__t1;
    delete GOODS.__t2;
  });
  test('Đồ dùng 1 lần: mua cộng dồn, dùng thì trừ và có tác dụng', () => {
    GOODS.__c = { id: '__c', name: 'Nước', price: 10, type: 'consumable', use: { minutes: 3, phys: 20, mental: 0, fuel: 0.5, bikeHp: 0 } };
    const gs = new GameState({ carry: { money: 100 } });
    gs.buy('goods', '__c');
    gs.buy('goods', '__c');
    assert.equal(gs.countOf('__c'), 2);
    gs.phys = 50;
    const f = gs.fuel;
    const r = gs.useConsumable('__c');
    assert.ok(r.ok && r.minutes === 3);
    assert.equal(gs.phys, 70);
    assert.ok(gs.fuel > f);
    assert.equal(gs.countOf('__c'), 1);
    assert.equal(new GameState({ carry: gs.carryOver() }).countOf('__c'), 1);
    delete GOODS.__c;
  });
  test('Hoạt động: đóng cửa, hết lượt trong ngày, thiếu tiền', () => {
    const place = { id: 'p', hours: [16, 23] };
    const act = { id: 'sing', cost: 80, minutes: 60, phys: -5, mental: 40, perDay: 1 };
    const gs = new GameState({ carry: { money: 100 } });
    gs.mental = 50;
    assert.equal(gs.activityStatus(place, act, 10 * 60), 'closed');
    assert.ok(gs.doActivity(place, act, 18 * 60).ok);
    assert.equal(gs.mental, 90);
    assert.equal(gs.money, 20);
    assert.equal(gs.activityStatus(place, act, 19 * 60), 'usedUp');
    assert.equal(gs.activityStatus(place, { ...act, id: 'x' }, 19 * 60), 'money');
    assert.ok(isOpen({}, 3 * 60));
  });
  test('Quán đóng cửa thì không có đơn từ quán đó', () => {
    const { om, gs } = mkOM(5);
    const pho = layout.placeById.pho;
    const old = pho.hours;
    pho.hours = [6, 7];
    for (let i = 0; i < 60; i++) assert.notEqual(om.makeOffer(9 * 60, { x: 0, z: 0 })?.pickup.placeId, 'pho');
    pho.hours = old;
  });
  test('Karaoke buổi tối là điểm đến của khách xe ôm; buổi sáng thì không', () => {
    const k = layout.placeById.karaoke;
    assert.ok(k, 'thiếu địa điểm mẫu karaoke');
    const { om, gs } = mkOM(11, { carry: { money: 500, flags: { wallet: 5 } } });
    gs.buy('goods', 'spareHelmet');
    let night = 0, morning = 0;
    for (let i = 0; i < 300; i++) {
      if (om.makeRide({ x: 0, z: 0 }, false, 20 * 60).dropoff.placeId === 'karaoke') night++;
      if (om.makeRide({ x: 0, z: 0 }, false, 9 * 60).dropoff.placeId === 'karaoke') morning++;
    }
    assert.ok(night > 20, `buổi tối chỉ ${night}/300`);
    assert.equal(morning, 0);
  });
  test('Chuyến xe ôm khách hoảng sợ: tới nơi vẫn được trả một phần, không tính là bị từ chối', () => {
    const { om, gs } = mkOM(11, { carry: { money: 500, flags: { wallet: 5 } } });
    gs.buy('goods', 'spareHelmet');
    om.goOnline();
    om.offer = om.makeRide({ x: 0, z: 0 }, false, 600);
    om.go(S.OFFERED);
    om.accept(600);
    assert.ok(om.boardPassenger(600));
    om.order.items[0].damage(90, 'x');
    assert.equal(om.arriveAtDropoff(610), 'ready');
    const r = om.handOver(612);
    assert.ok(r.ev.scared && r.ev.stars === 1);
    assert.ok(r.pay.walletCredit > 0, 'phải được trả một phần cước');
    gs.applyReceipt(r);
    assert.equal(gs.stats.refused, 0);
  });
  test('Trang phục: đồ giá 0 mặc sẵn; mua rồi phải mặc mới có tác dụng; giữ qua ngày sau', () => {
    const { outfitLook } = goodsMod;
    GOODS.__ao = { id: '__ao', name: 'Áo test', price: 0, type: 'outfit', slot: 'shirt', style: 'long', color: '#111111' };
    GOODS.__aoTip = { id: '__aoTip', name: 'Áo boa', price: 10, type: 'outfit', slot: 'shirt', style: 'short', color: '#222222', effects: { tipBonus: 3 } };
    const gs = new GameState({ carry: { money: 100 } });
    const free = gs.wornIds().shirt;
    assert.ok(free && GOODS[free].price === 0, 'phải có sẵn một áo giá 0');
    assert.ok(!gs.wear('__aoTip'), 'chưa mua thì không mặc được');
    assert.ok(gs.buy('goods', '__aoTip').ok);
    assert.equal(gs.effect('tipBonus'), 0, 'mua rồi nhưng chưa mặc → chưa có tác dụng');
    assert.ok(!gs.buy('goods', '__aoTip').ok, 'không mua trùng');
    assert.ok(gs.wear('__aoTip'));
    assert.equal(gs.wornIds().shirt, '__aoTip');
    assert.equal(gs.effect('tipBonus'), 3);
    const look = outfitLook(gs.wornGoods());
    assert.equal(look.shirt, 0x222222);
    assert.equal(look.sleeves, 'short');
    const next = new GameState({ day: 2, carry: gs.carryOver() });
    assert.equal(next.wornIds().shirt, '__aoTip');
    delete GOODS.__aoTip; // món bị xóa trong công cụ → quay về áo có sẵn
    assert.equal(GOODS[next.wornIds().shirt].price, 0);
    assert.equal(next.effect('tipBonus'), 0);
    delete GOODS.__ao;
  });
  test('Trang bị boa thêm được cộng vào đơn 5 sao', () => {
    GOODS.__tip = { id: '__tip', name: 't', price: 1, type: 'equipment', effects: { tipBonus: 4 } };
    for (let seed = 1; seed < 40; seed++) {
      const { om, gs } = mkOM(seed, { carry: { money: 100 } });
      gs.buy('goods', '__tip');
      const offer = getOffer(om);
      if (offer.kind !== 'food' || offer.flags.outOfStock || offer.flags.noAnswer || offer.dropoff.apartment) continue;
      om.accept(480);
      om.arriveAtPickup(480);
      om.finishPacking(om.collectFood(om.order.readyAt + 0.1).map(() => ({ upright: true })), 490);
      om.reveal();
      om.arriveAtDropoff(495);
      const r = om.handOver(495);
      assert.equal(r.ev.stars, 5);
      // boa theo sao × hệ số khu phố nơi giao ("tips") + boa thêm của trang bị
      const tm = CITYLAYOUT.traitAt(om.history.at(-1).order.dropoff.door.x, om.history.at(-1).order.dropoff.door.z, 'tips');
      assert.equal(r.pay.tip, Math.round(8 * tm * 10) / 10 + 4);
      delete GOODS.__tip;
      return;
    }
    assert.fail('không tìm được đơn phù hợp');
  });
}

console.log('App giao hàng, loại đơn, tài khoản, loại khách (apps.json)');
{
  const { APP, ORDER_TYPES, RIDER_TYPES, surchargeAt } = await import('../src/data/apps.js');
  const { estimatePay } = await import('../src/sim/economy.js');
  // tạo sẵn một đơn theo loại rồi nhận đơn (không qua ngẫu nhiên chọn loại)
  const forceOffer = (om, make, now = 600) => {
    if (om.state === S.OFFLINE) om.goOnline();
    om.offer = make();
    om.go(S.OFFERED);
    return om.accept(now, { x: 0, z: 0 });
  };
  const withRider = (om, id) => {
    const orig = om.pickRider;
    om.pickRider = () => RIDER_TYPES[id];
    return () => (om.pickRider = orig);
  };

  test('Phụ phí mưa / giờ cao điểm cộng vào cước; khách quen (không qua app) không mất phí, không thuế', () => {
    assert.equal(surchargeAt(9 * 60, false), 0);
    assert.equal(surchargeAt(9 * 60, true), APP.rainSurcharge);
    assert.equal(surchargeAt(12 * 60, true), APP.rainSurcharge + APP.peakSurcharge);
    const a = computePayout({ baseFare: 30, distanceKm: 2.5, stars: 5, surcharge: 4, app: TEST_APP });
    assert.equal(a.gross, 44);
    const b = computePayout({ baseFare: 30, distanceKm: 2.5, stars: 5, viaApp: false, app: TEST_APP });
    assert.equal(b.fee + b.tax, 0);
    assert.equal(b.walletCredit, 40 + TEST_APP.tipByStars[5]);
    assert.ok(estimatePay(30, 2.5, { viaApp: false }) > estimatePay(30, 2.5));
  });
  test('Loại đơn: chưa có mũ cho khách thì không có đơn chở khách; có đủ đồ ăn, giao hàng, hỏa tốc', () => {
    const { om } = mkOM(4, { carry: { money: 2000, flags: { wallet: 5 } } });
    const seen = {};
    for (let i = 0; i < 400; i++) { const o = om.makeOffer(10 * 60, { x: 0, z: 0 }); seen[o.type] = (seen[o.type] || 0) + 1; }
    assert.ok(!seen.ride, 'không được có đơn xe ôm khi chưa có mũ');
    for (const t of ['food', 'parcel', 'express']) assert.ok(seen[t] > 10, `thiếu đơn ${t}: ${JSON.stringify(seen)}`);
    const night = om.makeOffer(21.5 * 60, { x: 0, z: 0 });
    assert.ok(!['parcel', 'express'].includes(night?.type), 'ngoài khung giờ giao hàng');
  });
  test('Hỏa tốc: cước cao hơn, thời hạn gắt hơn đơn giao hàng thường', () => {
    const { om } = mkOM(6, { carry: { money: 2000 } });
    const e = om.makeParcel(ORDER_TYPES.express, 600, { x: 0, z: 0 });
    const p = om.makeParcel({ ...ORDER_TYPES.parcel, items: ['taiLieu'], codChance: 0 }, 600, { x: 0, z: 0 });
    assert.ok(e.deadlineMult < p.deadlineMult);
    assert.ok(e.baseFare > ITEMS_DATA_BASE('taiLieu') && Math.abs(p.baseFare - ITEMS_DATA_BASE('taiLieu')) < 0.01);
  });
  test('Giao hàng COD: chỉ có khi đủ tiền ứng; lấy hàng trừ tiền, giao xong khách trả lại', () => {
    const poor = mkOM(8, { carry: { money: 20 } }).om;
    for (let i = 0; i < 50; i++) assert.equal(poor.makeParcel({ ...ORDER_TYPES.parcel, codChance: 1 }, 600, { x: 0, z: 0 }).cod, 0);
    const { om, gs } = mkOM(8, { carry: { money: 1000 } });
    const o = forceOffer(om, () => om.makeParcel({ ...ORDER_TYPES.parcel, items: ['hopGiay'], codChance: 1, bomChance: 0 }, 600, { x: 0, z: 0 }));
    o.flags.noAnswer = false; o.revealed = true; o.dropoff.apartment = false;
    assert.equal(o.cod, DATA.itemsCod('hopGiay'));
    const r = om.collectParcel(600);
    assert.equal(gs.money, 1000 - o.cod);
    om.finishPacking(r.items.map(() => ({ upright: true })), 601);
    assert.equal(om.arriveAtDropoff(610), 'ready');
    const rec = om.handOver(612);
    gs.applyReceipt(rec);
    assert.equal(rec.pay.cod, o.cod);
    assert.ok(gs.money > 1000, 'nhận lại tiền ứng + tiền cước');
    assert.ok(gs.stats.income.parcel > 0);
  });
  test('Bom hàng: năn nỉ không được → mang trả shop: hoàn tiền ứng + phí hoàn, tính 1 lần bom', () => {
    const { om, gs } = mkOM(9, { carry: { money: 1000 } });
    const o = forceOffer(om, () => om.makeParcel({ ...ORDER_TYPES.parcel, items: ['aoQuan'], codChance: 1, bomChance: 1, persuadeChance: 0 }, 600, { x: 0, z: 0 }));
    o.flags.noAnswer = false; o.revealed = true; o.dropoff.apartment = false;
    om.finishPacking(om.collectParcel(600).items.map(() => ({ upright: true })), 601);
    assert.equal(om.arriveAtDropoff(610), 'bom');
    assert.equal(om.handOver(611), null, 'đang bị bom thì không giao được');
    assert.equal(om.persuadeBom(611).accepted, false);
    assert.equal(om.persuadeBom(612), null, 'chỉ năn nỉ được 1 lần');
    assert.ok(om.startReturn(612));
    assert.equal(om.state, S.RETURNING);
    const before = gs.money;
    const r = om.returnToShop(630);
    assert.equal(r.refund, o.cod);
    assert.ok(r.fee > 0);
    assert.equal(gs.money, before + r.refund + r.fee);
    assert.equal(gs.account.bom, 1);
    assert.equal(om.state, S.IDLE);
  });
  test('Hàng giao hỏng bị từ chối → mất tiền đã ứng; hủy khi đang giữ hàng COD → được hoàn', () => {
    const { om, gs } = mkOM(10, { carry: { money: 1000 } });
    const o = forceOffer(om, () => om.makeParcel({ ...ORDER_TYPES.parcel, items: ['dienThoai'], codChance: 1, bomChance: 0 }, 600, { x: 0, z: 0 }));
    o.flags.noAnswer = false; o.revealed = true; o.dropoff.apartment = false;
    om.finishPacking(om.collectParcel(600).items.map(() => ({ upright: true })), 601);
    o.items[0].damage(90, 'x');
    om.arriveAtDropoff(610);
    const rec = om.handOver(611);
    assert.ok(rec.ev.refused && rec.pay.cod === 0 && rec.codLost === o.cod);
    let refund = 0;
    const b = mkOM(11, { carry: { money: 1000 } });
    b.om.on((e) => { if (e.type === 'cancelled') refund = e.codRefund; });
    const o2 = forceOffer(b.om, () => b.om.makeParcel({ ...ORDER_TYPES.parcel, items: ['hopGiay'], codChance: 1, bomChance: 0 }, 600, { x: 0, z: 0 }));
    b.om.collectParcel(600);
    b.om.cancel('x', 605, { byDriver: true });
    assert.equal(refund, o2.cod);
  });
  test('Tài khoản: từ chối nhiều → tỉ lệ nhận thấp → đơn thưa hơn; tự hủy quá giới hạn → tạm khóa nhận đơn', () => {
    const gs = new GameState();
    assert.equal(gs.acceptRate, 1);
    for (let i = 0; i < 8; i++) gs.recordOffer(false);
    gs.recordOffer(true);
    assert.ok(gs.acceptRate < APP.account.lowAcceptBelow);
    const lo = new OrderManager({ rng: makeRng(1), layout, gs });
    const hi = new OrderManager({ rng: makeRng(1), layout, gs: new GameState() });
    lo.schedulePing(9 * 60); hi.schedulePing(9 * 60);
    assert.ok(Math.abs(lo.nextPingIn / hi.nextPingIn - APP.account.lowAcceptPingMult) < 1e-9);
    const g2 = new GameState();
    let r;
    for (let i = 0; i <= APP.account.cancelLimitPerDay; i++) r = g2.applyCancel({ byDriver: true }, 600);
    assert.ok(r.locked && g2.lockedUntil === 600 + APP.account.cancelLockMin);
    const om = new OrderManager({ rng: makeRng(2), layout, gs: g2 });
    om.goOnline();
    for (let i = 0; i < 30; i++) om.update(1, 1, 610, { x: 0, z: 0 });
    assert.equal(om.state, S.IDLE, 'đang bị khóa thì không có đơn');
    const next = new GameState({ day: 2, carry: g2.carryOver() });
    assert.equal(next.account.driverCancels, APP.account.cancelLimitPerDay + 1);
    assert.equal(next.lockedUntil, 0, 'khóa chỉ trong ngày');
  });
  test('Khách say: chỉ buổi tối, đón ở karaoke; khách quen: mở sau vài chuyến, không qua app, không chấm sao', () => {
    const { om, gs } = mkOM(12, { carry: { money: 500, flags: { wallet: 5 } } });
    gs.buy('goods', 'spareHelmet');
    for (let i = 0; i < 100; i++) assert.notEqual(om.pickRider(9 * 60).id, 'drunk');
    let drunk = 0;
    for (let i = 0; i < 200; i++) if (om.pickRider(20.5 * 60).id === 'drunk') drunk++;
    assert.ok(drunk > 20, `khách say buổi tối chỉ ${drunk}/200`);
    const undo = withRider(om, 'drunk');
    const d = om.makeRide({ x: 0, z: 0 }, false, 20.5 * 60);
    undo();
    assert.equal(d.pickup.placeId, 'karaoke');
    for (let i = 0; i < 100; i++) assert.notEqual(om.pickRider(10 * 60).id, 'regular', 'chưa đủ số chuyến thì chưa có khách quen');
    gs.account.rides = 5;
    const undo2 = withRider(om, 'regular');
    const o = forceOffer(om, () => om.makeRide({ x: 0, z: 0 }, false, 600));
    undo2();
    assert.equal(o.viaApp, false);
    om.boardPassenger(600);
    om.arriveAtDropoff(610);
    const count = gs.ratingBook.count;
    const rec = om.handOver(612);
    gs.applyReceipt(rec);
    assert.equal(rec.pay.fee, 0);
    assert.equal(gs.ratingBook.count, count, 'khách quen không chấm sao trên app');
  });
  test('Đặt xe dùm (cụ già) sợ nhanh hơn khách thường; khách vội tới sớm được boa', () => {
    const { om, gs } = mkOM(13, { carry: { money: 500, flags: { wallet: 5 } } });
    gs.buy('goods', 'spareHelmet');
    const ride = (id) => { const u = withRider(om, id); const o = forceOffer(om, () => om.makeRide({ x: 0, z: 0 }, false, 600)); u(); om.boardPassenger(600); return o; };
    const a = ride('booked');
    assert.ok(RIDER_TYPES.booked.riderNames.includes(a.customer) && a.booker);
    a.items[0].tick(env({ speed: 10 }), 5);
    const scaredOld = 100 - a.items[0].condition;
    om.cancel('x', 601, { byDriver: false });
    const b = ride('app');
    b.items[0].tick(env({ speed: 10 }), 5);
    assert.ok(scaredOld > 100 - b.items[0].condition, 'cụ già phải sợ hơn ở cùng tốc độ');
    om.cancel('x', 601, { byDriver: false });
    const h = ride('hurry');
    h.flags.picky = false;
    om.arriveAtDropoff(602);
    const rec = om.handOver(603);
    assert.equal(rec.earlyTip, RIDER_TYPES.hurry.earlyTip);
  });
  test('Khách đòi xuống giữa đường: trả theo quãng đã đi, 1 sao; khách say ói ra xe thì mất tinh thần + tiền rửa xe', () => {
    const { om, gs } = mkOM(14, { carry: { money: 500, flags: { wallet: 5 } } });
    gs.buy('goods', 'spareHelmet');
    const u = withRider(om, 'app');
    const o = forceOffer(om, () => om.makeRide({ x: 0, z: 0 }, false, 600));
    u();
    om.boardPassenger(600);
    // điểm giữa trên đường đi thật (đường chim bay có thể rơi sang bờ sông bên kia khi chuyến phải vòng qua cầu)
    const { routeNodes, nodePos } = CITYLAYOUT;
    const path = routeNodes(o.pickup.door, o.dropoff.door);
    // điểm ở nửa quãng trên đường gấp khúc: cửa đón → các ngã tư → cửa trả
    const pts = [o.pickup.door, ...path.map((n) => nodePos(...n)), o.dropoff.door];
    const seg = pts.slice(1).map((q, i) => Math.abs(q.x - pts[i].x) + Math.abs(q.z - pts[i].z));
    let half = seg.reduce((a2, b2) => a2 + b2, 0) / 2, mid = pts[0];
    for (let i = 0; i < seg.length; i++) {
      if (half <= seg[i]) { const t = half / Math.max(1e-6, seg[i]); mid = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, z: pts[i].z + (pts[i + 1].z - pts[i].z) * t }; break; }
      half -= seg[i];
    }
    const rec = om.quitRide(605, mid);
    assert.ok(rec.quit && rec.ev.stars === 1 && rec.traveled > 0.2 && rec.traveled < 0.8, `đi được ${rec.traveled} · đón ${JSON.stringify(o.pickup.door)} trả ${JSON.stringify(o.dropoff.door)} d2 ${o.d2} giữa ${JSON.stringify(mid)} còn ${CITYLAYOUT.routeDist(mid, o.dropoff.door)} · ${path.length} nút`);
    const full = computePayout({ baseFare: o.baseFare, distanceKm: o.distanceKm, stars: 1, surcharge: o.surcharge });
    assert.ok(rec.pay.gross < full.gross);
    const u2 = withRider(om, 'drunk');
    forceOffer(om, () => om.makeRide({ x: 0, z: 0 }, false, 20.5 * 60));
    u2();
    om.boardPassenger(1230);
    const RT = RIDER_TYPES.drunk, old = RT.vomitChance;
    RT.vomitChance = 1;
    const m0 = gs.mental, money0 = gs.money;
    om.itemEvent('bump', 0.5, env());
    om.itemEvent('bump', 0.5, env());
    RT.vomitChance = old;
    assert.equal(gs.mental, m0 - RT.vomitMental, 'chỉ ói 1 lần mỗi chuyến');
    assert.equal(gs.money, money0 - RT.vomitCost);
  });
  test('Bộ kiểm tra app & loại đơn: số sai, món không phải hàng giao, thiếu kiểu đơn → lỗi', () => {
    const { validateApps } = VALIDATE;
    assert.equal(validateApps(DATA.apps, DATA.items, DATA.places).filter((i) => i.level === 'error').length, 0);
    const bad = JSON.parse(JSON.stringify(DATA.apps));
    bad.apps.goship.platformFee = 2;
    bad.apps.goship.account.lockBelow = 9;
    bad.orderTypes.parcel.items = ['comTam'];
    bad.riderTypes.drunk.from = ['khongCo'];
    delete bad.orderTypes.ride;
    const errs = validateApps(bad, DATA.items, DATA.places).filter((i) => i.level === 'error').map((i) => `${i.ref}.${i.field}`);
    for (const f of ['goship.platformFee', 'goship.account.lockBelow', 'parcel.items', 'drunk.from', '.kind']) assert.ok(errs.includes(f), `không bắt lỗi ${f}: ${errs.join(', ')}`);
  });
}

console.log('Bản đồ 8×8, hẻm trong khối (map.json)');
{
  const { planBlock, ALLEY_TEMPLATES, INNER } = await import('../src/sim/blockPlan.js');
  const { CITY, blockPlan, lotInfo, rideDoor } = await import('../src/sim/cityLayout.js');
  const { validatePlaces, validateMap } = VALIDATE;
  const MAPD = readJson('src/data/map.json');
  const overlap = (a, b) => a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;
  test('Mọi kiểu hẻm × 4 hướng × xe máy/đi bộ: nhà không chồng nhau, không lấn hẻm, có miệng hẻm; hẻm đi bộ có 2 cột mỗi miệng', () => {
    for (const t of Object.keys(ALLEY_TEMPLATES)) for (const walk of [false, true]) for (let rot = 0; rot < 4; rot++) {
      const p = planBlock({ alley: t, rot, walk }, 7 + rot);
      const rects = [...p.lots, ...p.fillers];
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert.ok(!overlap(rects[i], rects[j]), `${t}/${rot}: nhà chồng nhau`);
      for (const r of rects) for (const a of p.alleys) assert.ok(!overlap(r, a), `${t}/${rot}: nhà lấn hẻm`);
      for (const r of rects) assert.ok(r.u0 >= 0 && r.v0 >= 0 && r.u1 <= INNER && r.v1 <= INNER);
      assert.ok(p.mouths.length >= 1 && p.lots.some((l) => !l.front), `${t}/${rot}: thiếu miệng hẻm / nhà trong hẻm`);
      assert.equal(p.posts.length, walk ? p.mouths.length * 2 : 0);
      assert.equal(new Set(p.lots.map((l) => l.id)).size, p.lots.length);
    }
  });
  test('Bản đồ theo map.json (cỡ đọc từ dữ liệu); nhà trong hẻm có địa chỉ "số hẻm/số nhà", cửa ra hẻm (không nằm trong nhà nào)', () => {
    assert.equal(CITY.N, MAPD.size);
    for (const p of layout.places) assert.ok(p.block.every((v) => v >= 0 && v < CITY.N), `${p.id} nằm ngoài bản đồ`);
    const inner = layout.lots.filter((l) => l.inAlley);
    assert.ok(inner.length > 60, `chỉ có ${inner.length} nhà trong hẻm`);
    for (const l of inner) {
      assert.match(l.address, /^\d+\/\d+ /);
      for (const ab of layout.alleyBlocks) for (const f of ab.fillers) assert.ok(!(l.door.x > f.x0 && l.door.x < f.x1 && l.door.z > f.z0 && l.door.z < f.z1), `cửa ${l.address} nằm trong nhà`);
      assert.ok(ab0(l), `cửa ${l.address} không nằm trong hẻm`);
    }
    function ab0(l) { return layout.alleyBlocks.some((ab) => ab.alleys.some((a) => l.door.x >= a.x0 - 0.01 && l.door.x <= a.x1 + 0.01 && l.door.z >= a.z0 - 0.01 && l.door.z <= a.z1 + 0.01)); }
  });
  test('Xe ôm không đón/trả trong hẻm đi bộ: dùng miệng hẻm', () => {
    const walkLots = layout.lots.filter((l) => l.walkOnly);
    assert.ok(walkLots.length > 5);
    for (const l of walkLots) assert.deepEqual(rideDoor(l), l.mouthDoor);
    const { om, gs } = mkOM(21, { carry: { money: 500, flags: { wallet: 5 } } });
    gs.buy('goods', 'spareHelmet');
    const byKey = Object.fromEntries(layout.lots.map((l) => [l.key, l]));
    for (let i = 0; i < 300; i++) {
      const o = om.makeRide({ x: 0, z: 0 }, false, 600);
      for (const end of [o.pickup, o.dropoff]) if (end.lotKey && byKey[end.lotKey].walkOnly) assert.deepEqual(end.door, byKey[end.lotKey].mouthDoor);
    }
  });
  test('Địa điểm trong khối có hẻm: đúng lô của hẻm thì hợp lệ (quán trong hẻm); lô cũ / nhà cổng xanh / khối hẻm 42 → lỗi', () => {
    const pd = JSON.parse(JSON.stringify(DATA.places));
    const cafe = pd.places.find((p) => p.id === 'cafe');
    const [k, spec] = Object.entries(MAPD.blocks)[0];
    const [bx, bz] = k.split(',').map(Number);
    const plan = blockPlan(bx, bz, MAPD);
    const inner = plan.lots.find((l) => !l.front);
    Object.assign(cafe, { block: [bx, bz], lot: inner.id });
    delete cafe.face;
    const errs = (x, m = MAPD) => validatePlaces(x, DATA.items, null, null, m).filter((i) => i.level === 'error');
    assert.equal(errs(pd).length, 0, errs(pd).map((e) => e.msg).join('; '));
    assert.ok(lotInfo(bx, bz, inner.id, null, MAPD).inAlley);
    cafe.lot = 'N0';
    assert.ok(errs(pd).some((e) => e.ref === 'cafe' && e.field === 'lot'));
    const m2 = JSON.parse(JSON.stringify(MAPD));
    m2.blocks[pd.alley.block.join(',')] = { alley: 'I', rot: 0, walk: false };
    cafe.lot = inner.id;
    assert.ok(errs(pd, m2).some((e) => e.field === 'alley'), 'khối có hẻm 42 không được đặt kiểu hẻm');
    assert.ok(spec);
  });
  test('Bộ kiểm tra bản đồ: kiểu hẻm lạ, hướng sai, khối ngoài bản đồ, thiếu tên đường → lỗi', () => {
    assert.equal(validateMap(MAPD, DATA.places).filter((i) => i.level === 'error').length, 0);
    const bad = JSON.parse(JSON.stringify(MAPD));
    const out = `${MAPD.size},${MAPD.size}`; // khối ngoài bản đồ
    bad.blocks[out] = { alley: 'I' };
    bad.blocks['0,0'] = { alley: 'xoanoc', rot: 7 };
    const fields = validateMap(bad, DATA.places).filter((i) => i.level === 'error').map((i) => `${i.ref}.${i.field}`);
    for (const f of [`${out}.block`, '0,0.alley', '0,0.rot']) assert.ok(fields.includes(f), `không bắt lỗi ${f}`);
    const pd = JSON.parse(JSON.stringify(DATA.places));
    pd.streetsX.pop();
    assert.ok(validateMap(MAPD, pd).some((i) => i.field === 'size' && i.level === 'error'));
  });
}

console.log('Đổi loại địa điểm (công cụ ?editor)');
{
  const { CHANGEABLE_KINDS, canChangeKind, applyKind } = await import('../src/devtools/editor/placeKind.js');
  const { validatePlaces } = VALIDATE;
  test('Dịch vụ → cây xăng hợp lệ (đổ xăng được); quán ăn mới có sẵn món; địa điểm khóa / cốt truyện không đổi được', () => {
    const pd = JSON.parse(JSON.stringify(DATA.places));
    const svc = pd.places.find((p) => p.kind === 'service' && !VALIDATE.PROTECTED.places.includes(p.id));
    assert.ok(svc && canChangeKind(svc, false));
    applyKind(svc, 'gas', DATA.items);
    assert.equal(svc.kind, 'gas');
    assert.equal(validatePlaces(pd, DATA.items).filter((i) => i.level === 'error' && i.ref === svc.id).length, 0);
    applyKind(svc, 'restaurant', DATA.items);
    assert.ok(svc.menu.length === 1 && !DATA.items[svc.menu[0]].parcel, 'quán ăn mới phải có 1 món đồ ăn');
    assert.equal(validatePlaces(pd, DATA.items).filter((i) => i.level === 'error' && i.ref === svc.id).length, 0);
    applyKind(svc, 'service', DATA.items);
    assert.ok(!svc.menu, 'bỏ quán ăn thì bỏ thực đơn');
    const cafe = pd.places.find((p) => p.id === 'cafe');
    assert.ok(!canChangeKind(cafe, true) && !canChangeKind({ kind: 'taphoa' }, false) && !canChangeKind({ kind: 'gate' }, false));
    assert.ok(!CHANGEABLE_KINDS.includes('cafe') && !CHANGEABLE_KINDS.includes('home'));
    const before = svc.kind;
    applyKind(svc, 'cafe', DATA.items);
    assert.equal(svc.kind, before, 'không đổi sang loại cốt truyện');
  });
}

console.log('Sông, cầu, quãng đường thật (map.json → rivers)');
{
  const { roadPos, routeDist, manhattan, neighbors, isWaterSeg, roadGraph, CITY } = await import('../src/sim/cityLayout.js');
  const { HazardManager } = await import('../src/sim/hazards.js');
  const { validateMap } = VALIDATE;
  const MAPD = readJson('src/data/map.json');
  const R = MAPD.rivers[0];
  test('Bản đồ mẫu có sông + cầu; đi qua sông phải vòng qua cầu (quãng đường dài hơn nhiều đường chim bay)', () => {
    assert.ok(R && R.bridges.length >= 2, 'bản đồ mẫu phải có 1 sông và vài cây cầu');
    const noBridge = [...Array(R.to - R.from + 1).keys()].map((k) => k + R.from).find((k) => k > 0 && k < CITY.N && !R.bridges.includes(k));
    const x = roadPos(noBridge), zr = roadPos(R.line);
    const north = { x: x + 3, z: zr - 14 }, south = { x: x + 3, z: zr + 14 };
    const d = routeDist(north, south);
    assert.ok(d > manhattan(north, south) * 3, `qua sông chỉ ${d.toFixed(0)} m (đường chim bay ${manhattan(north, south)})`);
    const a = { x: roadPos(2) + 3, z: roadPos(2) + 10 }, b = { x: roadPos(2) + 3, z: roadPos(3) + 20 };
    assert.ok(Math.abs(routeDist(a, b) - manhattan(a, b)) < 1, 'cùng một con đường thì bằng quãng thẳng');
  });
  test('Nhà trong hẻm: quãng đường cộng thêm đoạn đi trong hẻm', () => {
    const l = layout.lots.find((x) => x.inAlley && x.inner > 5);
    const from = { x: roadPos(0) + 3, z: roadPos(0) + 20 };
    assert.ok(routeDist(from, l.door) >= routeDist(from, l.door.mouth) + l.inner - 0.01);
  });
  test('Xe NPC, ổ gà, chốt CSGT, kẹt xe không ở trên mặt sông', () => {
    const g = roadGraph();
    for (let j = 0; j <= CITY.N; j++) for (let i = 0; i <= CITY.N; i++) for (const [a, b] of neighbors(i, j)) {
      const seg = i === a ? ['x', i, Math.min(j, b)] : ['z', j, Math.min(i, a)];
      assert.ok(!isWaterSeg(...seg), `xe đi qua sông ở ${i},${j} → ${a},${b}`);
    }
    for (let s = 1; s <= 5; s++) {
      const h = new HazardManager(makeRng(s));
      for (const p of h.potholes) {
        const nearZ = Math.abs(p.z - roadPos(R.line)) < CITY.ROAD / 2 + 0.01;
        assert.ok(!(nearZ && R.axis === 'z'), 'ổ gà trên mặt sông');
      }
      for (const p of h.police) assert.ok(neighbors(...p.node).length >= 3 && !g.bridgeNodes.has(p.node.join(',')), 'chốt CSGT ở cầu / đường cụt');
      for (const j of h.jams) for (const sg of j.segments) assert.ok(!isWaterSeg(sg.axis, sg.line, sg.from));
    }
  });
  test('Thời hạn đơn tính theo quãng đường thật', () => {
    const { om } = mkOM(31);
    for (let i = 0; i < 30; i++) {
      const o = om.makeOffer(10 * 60, { x: 0, z: 0 });
      assert.ok(Math.abs(o.d2 - routeDist(o.pickup.door, o.dropoff.door)) < 1e-6);
    }
  });
  test('Bộ kiểm tra sông: cắt rời thành phố (không cầu), cầu ngoài đoạn sông, số sai → lỗi', () => {
    assert.equal(validateMap(MAPD, DATA.places).filter((i) => i.level === 'error').length, 0);
    const cut = JSON.parse(JSON.stringify(MAPD));
    cut.rivers[0].bridges = [];
    assert.ok(validateMap(cut, DATA.places).some((i) => i.level === 'error' && /cắt rời/.test(i.msg)));
    const bad = JSON.parse(JSON.stringify(MAPD));
    bad.rivers[0].bridges = [99];
    const n = bad.rivers.length; // sông thêm vào có số thứ tự = số sông đang có
    bad.rivers.push({ axis: 'y', line: 3, from: 5, to: 2, bridges: [] });
    const f = validateMap(bad, DATA.places).filter((i) => i.level === 'error').map((i) => `${i.ref}.${i.field}`);
    for (const k of ['river0.bridges', `river${n}.axis`, `river${n}.from`]) assert.ok(f.includes(k), `không bắt lỗi ${k}: ${f.join(', ')}`);
  });
}

console.log('Bot mô phỏng (chạy thử 1 ngày)');
{
  const { playDay } = await import('./economy-sim.js');
  test('Bot chơi trọn 1 ngày không lỗi, có giao đơn', () => {
    const { log, outcome } = playDay(1, 'normal');
    assert.ok(outcome && log.orders > 3, `chỉ ${log.orders} đơn`);
  });
}

console.log('Cân bằng (balance.json, thẻ ⚖️)');
{
  const { rentFor, applyBalance, ECONOMY, ORDER, ENERGY } = await import('../src/data/balance.js');
  const { BALANCE_GROUPS, getPath } = await import('../src/data/balanceSpec.js');
  const { validateBalance } = await import('../src/data/validate.js');
  const bal = JSON.parse(fs.readFileSync(new URL('../src/data/balance.json', import.meta.url), 'utf8'));
  test('Mọi ô của thẻ Cân bằng trỏ đúng số có trong balance.json', () => {
    for (const g of BALANCE_GROUPS) {
      for (const [path, , o] of g.fields) {
        const v = getPath(bal, path);
        assert.ok(o.pair ? Array.isArray(v) && v.length === 2 : typeof v === 'number', `${path} không có / sai kiểu`);
      }
      if (g.stars) assert.equal(getPath(bal, g.stars[0]).length, 6);
    }
    assert.deepEqual(validateBalance(bal), []);
  });
  test('Tiền nhà theo kỳ: theo công thức, hoặc số tự đặt từng kỳ', () => {
    const eco = { rentBase: 1000, rentStep: 200, rentByPeriod: [] };
    assert.deepEqual([1, 2, 3].map((k) => rentFor(k, eco)), [1000, 1200, 1400]);
    eco.rentByPeriod = [800, null, 1500];
    assert.deepEqual([1, 2, 3, 4].map((k) => rentFor(k, eco)), [800, 1200, 1500, 1600]);
  });
  test('Thay số lúc chạy (bot thử trong editor) sửa thẳng vào số game đang dùng, rồi trả lại được', () => {
    const keep = JSON.parse(JSON.stringify({ economy: ECONOMY, order: ORDER, energy: ENERGY }));
    try {
      applyBalance({ economy: { rentBase: 123 }, order: { pingGap: [1, 2] }, energy: { mental: { base: 0.5 } } });
      assert.equal(ECONOMY.rentBase, 123);
      assert.deepEqual(ORDER.pingGap, [1, 2]);
      assert.equal(ENERGY.mental.base, 0.5);
      assert.equal(ENERGY.mental.jam, keep.energy.mental.jam, 'số không đổi phải giữ nguyên');
      assert.equal(new GameState({}).rent, 123);
    } finally { applyBalance(keep); }
    assert.equal(ECONOMY.rentBase, keep.economy.rentBase);
  });
  test('Bộ kiểm tra bắt số cân bằng hỏng', () => {
    const bad = JSON.parse(JSON.stringify(bal));
    bad.economy.rentBase = -5;
    bad.order.pingGap = [9, 3];
    bad.order.noAnswerChance = 2;
    bad.economy.rentByPeriod = [400, -1];
    bad.order.liftMin = 'ba';
    const f = validateBalance(bad).filter((i) => i.level === 'error').map((i) => i.field);
    for (const k of ['economy.rentBase', 'order.pingGap', 'order.noAnswerChance', 'economy.rentByPeriod', 'order.liftMin']) assert.ok(f.includes(k), `không bắt lỗi ${k}`);
  });
}

console.log('Sao chép · dán · xóa · hoàn tác (công cụ ?editor)');
{
  const H = await import('../src/devtools/editor/history.js');
  const O = await import('../src/devtools/editor/ops.js');
  const { validateAll } = await import('../src/data/validate.js');
  const rd = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  const load = () => ({ items: rd('src/data/items.json'), gear: rd('src/data/gear.json'), goods: rd('src/data/goods.json'), places: rd('src/data/places.json'), content: rd('src/content/vi.json'), apps: rd('src/data/apps.json'), map: rd('src/data/map.json') });
  const errs = (d) => validateAll({ ...d, baseContent: d.content }).filter((i) => i.level === 'error');
  test('Hoàn tác / làm lại: gõ liền gộp 1 bước; thao tác tách bước; làm lại sau hoàn tác', () => {
    const data = { items: { a: { name: 'A' } } };
    const h = H.createHistory({ mergeMs: 700 });
    H.syncMirror(h, data, ['items']);
    data.items.a.name = 'AB'; H.record(h, data, ['items'], 1000);
    data.items.a.name = 'ABC'; H.record(h, data, ['items'], 1300); // gõ tiếp trong 0,7 giây → cùng bước
    assert.equal(h.undo.length, 1);
    H.breakStep(h);
    data.items.b = { name: 'B' }; H.record(h, data, ['items'], 1400);
    assert.equal(h.undo.length, 2);
    assert.deepEqual(H.undo(h, data), ['items']);
    assert.ok(!data.items.b && data.items.a.name === 'ABC');
    H.undo(h, data);
    assert.equal(data.items.a.name, 'A');
    H.redo(h, data);
    assert.equal(data.items.a.name, 'ABC');
    assert.equal(H.undo(H.createHistory(), {}), null);
  });
  // dán = bản giống hệt bản gốc, chỉ khác mã (và lô với địa điểm), có mặt ở đúng những chỗ bản gốc có
  const same = (a, b, skip) => assert.deepEqual({ ...a, ...Object.fromEntries(skip.map((k) => [k, 0])) }, { ...b, ...Object.fromEntries(skip.map((k) => [k, 0])) });
  test('Sao chép → dán món: giữ nguyên tên + mọi thông số, mã mới; có trong thực đơn các quán + loại đơn như bản gốc', () => {
    const d = load();
    const r = O.paste(d, O.parseClip(JSON.stringify(O.makeClip(d, 'items', 'pho'))), 'pho');
    assert.ok(r.id !== 'pho' && /^pho_\d+$/.test(r.id));
    same(d.items[r.id], d.items.pho, ['id']);
    assert.equal(d.items[r.id].name, d.items.pho.name, 'tên giữ nguyên, không thêm "(bản sao)"');
    const keys = Object.keys(d.items);
    assert.equal(keys.indexOf(r.id), keys.indexOf('pho') + 1, 'đứng ngay sau bản gốc');
    const menus = (id) => d.places.places.filter((p) => (p.menu || []).includes(id)).map((p) => p.id);
    assert.ok(menus('pho').length > 0);
    assert.deepEqual(menus(r.id), menus('pho'));
    const r2 = O.paste(d, O.makeClip(d, 'items', 'dienThoai'));
    const types = (id) => Object.values(d.apps.orderTypes).filter((t) => (t.items || []).includes(id)).map((t) => t.id);
    assert.deepEqual(types(r2.id), types('dienThoai'));
    assert.deepEqual(errs(d), []);
  });
  test('Sao chép → dán đồ dùng / địa điểm: giữ tên, cùng nơi bán / cùng loại khách; địa điểm sang lô trống, chép lời thoại', () => {
    const d = load();
    const r = O.paste(d, O.makeClip(d, 'goods', 'nhang'));
    same(d.goods[r.id], d.goods.nhang, ['id']);
    const sellers = (id) => d.places.places.filter((p) => (p.sells?.goods || []).includes(id)).map((p) => p.id);
    assert.deepEqual(sellers(r.id), sellers('nhang'));
    assert.ok(!d.places.places.some((p) => (p.activities || []).some((a) => a.needs?.id === r.id)), 'chùa vẫn cần đồ gốc');
    const src = d.places.places.find((p) => p.id === 'karaoke');
    const rp = O.paste(d, O.makeClip(d, 'places', 'karaoke'), 'karaoke');
    const c = d.places.places.find((p) => p.id === rp.id);
    same(c, src, ['id', 'block', 'lot', 'face']);
    assert.equal(c.name, src.name);
    assert.equal(O.KINDS.places.get(d).indexOf(c), O.KINDS.places.get(d).indexOf(src) + 1);
    assert.ok(d.content[`npc.${rp.id}.greet`]);
    const riders = (id) => Object.values(d.apps.riderTypes).filter((x) => (x.from || []).includes(id)).map((x) => x.id);
    assert.deepEqual(riders(rp.id), riders('karaoke'));
    assert.ok(O.paste(d, O.makeClip(d, 'places', 'home')).error, 'địa điểm cốt truyện chỉ có một');
    assert.deepEqual(errs(d).filter((i) => i.field === 'lot'), [], 'bản dán đè lô khác');
    // dán sang dữ liệu không có quán / loại đơn đó → bỏ chỗ đó và báo
    const clip = O.makeClip(d, 'items', 'pho');
    clip.links.menus.push('quanKhongCo');
    assert.ok(O.paste(d, clip).dropped.some((x) => x.includes('quanKhongCo')));
  });
  test('Sao chép → dán (kể cả sang dữ liệu khác): bỏ tham chiếu không có, mã không trùng', () => {
    const d = load();
    const clip = O.parseClip(JSON.stringify(O.makeClip(d, 'places', 'chua')));
    assert.ok(clip && clip.kind === 'places');
    clip.data.menu = ['monKhongCo'];
    const r = O.paste(d, clip);
    assert.ok(r.id !== 'chua' && r.dropped.some((x) => x.includes('monKhongCo')));
    assert.equal(O.parseClip('{"khong":"phai"}'), null);
    assert.equal(O.parseClip('chữ thường'), null);
    const r2 = O.paste(d, O.makeClip(d, 'goods', 'nhang'));
    assert.ok(r2.id !== 'nhang' && !!d.goods[r2.id]);
    assert.deepEqual(errs(d).filter((i) => i.field === 'lot'), []);
  });
  test('Xóa: dọn thực đơn / hàng bán / đồ cần; mục khóa và quán ăn cuối cùng không xóa được', () => {
    const d = load(), base = load();
    assert.ok(O.remove(d, base, 'vehicles', 'cub').error);
    assert.ok(O.remove(d, base, 'places', 'home').error);
    O.remove(d, base, 'items', 'pho');
    assert.ok(!d.items.pho && !d.places.places.some((p) => (p.menu || []).includes('pho')));
    O.remove(d, base, 'goods', 'nhang');
    assert.ok(!d.places.places.some((p) => (p.sells?.goods || []).includes('nhang') || (p.activities || []).some((a) => a.needs?.id === 'nhang')));
    const rest = d.places.places.filter((p) => p.kind === 'restaurant');
    for (const p of rest.slice(1)) O.remove(d, base, 'places', p.id);
    assert.ok(O.remove(d, base, 'places', rest[0].id).error, 'phải giữ ít nhất 1 quán ăn');
  });
}

console.log('Khung giờ (một đoạn, nhiều đoạn, giờ lẻ, khung giờ mẫu)');
{
  const Hr = await import('../src/sim/hours.js');
  const { isOpen, orderWeight } = await import('../src/sim/placeRules.js');
  const { typeOpen } = await import('../src/data/apps.js');
  const { presetUsers } = await import('../src/devtools/editor/hoursUi.js');
  const { validatePlaces } = await import('../src/data/validate.js');
  const presets = { hc: { id: 'hc', name: 'Hành chính', ranges: [[7.5, 11.5], [13, 17]] }, toi: { id: 'toi', name: 'Tối', ranges: [17, 23] } };
  test('Đọc khung giờ: cả ngày / một đoạn / nhiều đoạn / mẫu', () => {
    assert.equal(Hr.ranges(null), null);
    assert.deepEqual(Hr.ranges([8, 21]), [[8, 21]]);
    assert.deepEqual(Hr.ranges([[7.5, 11.5], [13, 17]]), [[7.5, 11.5], [13, 17]]);
    assert.deepEqual(Hr.ranges('toi', presets), [[17, 23]]);
    assert.equal(Hr.ranges('khongCo', presets), null);
    assert.equal(Hr.fmtHours('hc', presets), '07:30–11:30, 13:00–17:00');
    assert.equal(Hr.fmtHours([17, 24]), '17:00–24:00');
    assert.equal(Hr.totalHours('hc', presets), 8);
  });
  test('Nghỉ trưa thì đóng, 7:30 thì mở, đúng giờ đóng là đóng', () => {
    const h = 'hc';
    assert.equal(Hr.inHours(h, 7 * 60 + 29, presets), false);
    assert.equal(Hr.inHours(h, 7 * 60 + 30, presets), true);
    assert.equal(Hr.inHours(h, 12 * 60, presets), false);
    assert.equal(Hr.inHours(h, 13 * 60, presets), true);
    assert.equal(Hr.inHours(h, 17 * 60, presets), false);
  });
  test('Game dùng khung giờ mẫu thật trong places.json (cửa tiệm, điểm đến đơn, loại đơn)', () => {
    const real = Hr.hourPresets();
    const id = Object.keys(real).find((k) => Hr.ranges(k).length >= 2) || Object.keys(real)[0];
    if (!id) return;
    const [[a, b]] = Hr.ranges(id);
    assert.equal(isOpen({ hours: id }, a * 60), true);
    assert.equal(isOpen({ hours: id }, b * 60), false);
    assert.equal(orderWeight({ hours: id, orders: { rideWeight: 4 } }, 'rideWeight', a * 60), 4);
    assert.equal(orderWeight({ hours: id, orders: { rideWeight: 4 } }, 'rideWeight', b * 60), 0);
    assert.equal(typeOpen({ hours: id }, a * 60), true);
  });
  test('Bộ kiểm tra: đoạn sai, chồng nhau, mẫu không tồn tại, mẫu hỏng', () => {
    assert.ok(Hr.hoursProblem([9, 8]));
    assert.ok(Hr.hoursProblem([[8, 12], [11, 15]]));
    assert.ok(Hr.hoursProblem([8, 25]));
    assert.ok(Hr.hoursProblem('khongCo', presets));
    assert.equal(Hr.hoursProblem('hc', presets), null);
    assert.equal(Hr.hoursProblem([[7.5, 11.5], [13, 17]]), null);
    const pd = { places: [{ id: 'p', name: 'P', short: 'P', kind: 'service', block: [0, 0], lot: 'N0', color: '#ffffff', sign: 'P', hours: 'khongCo' }], hourPresets: { ...presets, xau: { id: 'xau', name: 'Xấu', ranges: [[8, 12], [10, 14]] } }, alley: { block: [1, 0], lot: 'E1' }, streetsX: [], streetsZ: [], customerNames: ['A'] };
    const iss = validatePlaces(pd, {}).filter((i) => i.level === 'error');
    assert.ok(iss.some((i) => i.ref === 'p' && i.field === 'hours'));
    assert.ok(iss.some((i) => i.ref === 'hour:xau' && i.field === 'ranges'));
  });
  test('Gọn dữ liệu: 1 đoạn lưu [a,b], nhiều đoạn xếp theo giờ', () => {
    assert.deepEqual(Hr.packRanges([[8, 21]]), [8, 21]);
    assert.deepEqual(Hr.packRanges([[13, 17], [7.5, 11.5]]), [[7.5, 11.5], [13, 17]]);
  });
  test('Tìm nơi đang dùng một khung giờ mẫu (địa điểm + loại đơn / loại khách)', () => {
    const data = { places: { places: [{ id: 'a', name: 'A', hours: 'hc' }, { id: 'b', name: 'B', hours: [8, 9], orders: { hours: 'hc' } }] }, apps: { orderTypes: { x: { id: 'x', name: 'X', hours: 'hc' } }, riderTypes: {} } };
    assert.equal(presetUsers(data, 'hc').length, 3);
    assert.equal(presetUsers(data, 'toi').length, 0);
  });
}

console.log('Ban đêm: đơn thưa, phụ phí đêm, đường tối');
{
  const { demandAt, surchargeAt, isNightFare, APP: APPX } = await import('../src/data/apps.js');
  const { isDark } = await import('../src/sim/clock.js');
  const { validateApps } = await import('../src/data/validate.js');
  const NIGHT_ = (await import('../src/data/balance.js')).NIGHT;
  const at = (h) => dayStartAt(1) + (h * 60 - TIME.dayStart) + (h < 6 ? 1440 : 0); // giờ h của ngày chơi 1
  test('Nhu cầu đơn theo giờ và phụ phí đêm đọc đúng từ apps.json', () => {
    const app = { demandByHour: Array.from({ length: 24 }, (_, h) => (h >= 22 ? 0.5 : 1)), nightHours: [[22, 24], [0, 6]], nightSurcharge: 5, rainSurcharge: 4, peakSurcharge: 3, peakHours: [[11, 13]] };
    assert.equal(demandAt(at(14), app), 1);
    assert.equal(demandAt(at(23), app), 0.5);
    assert.equal(isNightFare(at(23), app), true);
    assert.equal(isNightFare(at(2), app), true);
    assert.equal(isNightFare(at(14), app), false);
    assert.equal(surchargeAt(at(23), false, app), 5);
    assert.equal(surchargeAt(at(12), true, app), 7);
    assert.equal(surchargeAt(at(23), false, { ...app, nightHours: undefined }), 0, 'không đặt giờ đêm = không có phụ phí đêm');
  });
  test('Đêm khuya đơn thưa hơn ban ngày (theo nhu cầu trong apps.json)', () => {
    const count = (h) => {
      const { om, gs } = mkOM(4);
      gs.flags.online = true;
      om.goOnline();
      let n = 0;
      for (let i = 0; i < 600; i++) {
        om.update(1, 0, at(h), { x: 0, z: 0 });
        if (om.state === S.OFFERED) { n++; om.decline(at(h)); gs.account.recent = []; }
      }
      return n;
    };
    const day = count(14), night = count(23);
    const ratio = demandAt(at(23)) / demandAt(at(14));
    assert.ok(day > 20, `ban ngày quá ít đơn: ${day}`);
    if (ratio < 0.9) assert.ok(night < day * ((ratio + 1) / 2), `đêm ${night} đơn, ngày ${day} đơn`);
  });
  test('Đường tối: qua nửa đêm vẫn tính là tối; chạy đêm hao tinh thần thêm', () => {
    const n = { start: 21, end: 5 };
    assert.ok(isDark(at(22), n) && isDark(at(3), n) && !isDark(at(12), n) && !isDark(at(6), n));
    const a = new GameState(), b = new GameState();
    a.wake(at(14) - 60); // cùng mới thức 1 tiếng → chỉ khác ở chỗ đêm / ngày
    b.wake(at(23) - 60);
    a.drain('drive', 60, { outdoor: true, now: at(14) });
    b.drain('drive', 60, { outdoor: true, now: at(23) });
    assert.ok(Math.abs((a.mental - b.mental) - NIGHT_.mentalPerMin * 60) < 1e-6);
  });
  test('Bộ kiểm tra bắt nhu cầu theo giờ / phụ phí đêm sai', () => {
    const ad = JSON.parse(JSON.stringify(require_apps()));
    const g = ad.apps[Object.keys(ad.apps)[0]];
    g.demandByHour = [1, 2];
    g.nightSurcharge = -3;
    g.nightHours = [[22, 30]];
    const f = validateApps(ad, {}, { places: [], hourPresets: {} }).filter((i) => i.level === 'error').map((i) => i.field);
    for (const k of ['demandByHour', 'nightSurcharge', 'nightHours']) assert.ok(f.includes(k), `không bắt lỗi ${k}`);
  });
  function require_apps() { return JSON.parse(fs.readFileSync(new URL('../src/data/apps.json', import.meta.url), 'utf8')); }
}

console.log('Vẽ xe kẹt giờ cao điểm');
{
  const THREE = await import('three');
  const { Traffic } = await import('../src/world/traffic.js');
  test('Xe kẹt xe được tính lại vùng bao (không bị bỏ qua khi vẽ), hết kẹt thì không còn xe', () => {
    const t = Object.create(Traffic.prototype);
    Object.assign(t, { scene: new THREE.Scene(), rng: makeRng(1), jamKeys: new Set(), jamCircles: [] });
    t.buildJamMeshes();
    t.jamCarMesh.computeBoundingSphere(); // lần vẽ đầu tiên lúc chưa có xe → vùng bao rỗng
    t.setJams([{ axis: 'x', line: 2, from: 1 }]);
    const m = t.jamCarMesh, s = m.boundingSphere;
    assert.ok(m.count > 0 && s.radius > 0, `vùng bao rỗng: r=${s.radius}`);
    const M = new THREE.Matrix4(), p = new THREE.Vector3();
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, M);
      p.setFromMatrixPosition(M);
      assert.ok(s.containsPoint(p), `xe thứ ${i} nằm ngoài vùng bao`);
    }
    t.setJams([]);
    assert.equal(t.jamCarMesh.count, 0);
  });
}

console.log('Mở tiệm / món theo ngày');
{
  const { playRun } = await import('./economy-sim.js');
  const { isOpen, orderWeight, unlocked, openDayOf } = await import('../src/sim/placeRules.js');
  const { ITEMS: LIVE_ITEMS } = await import('../src/data/items.js');
  const { validatePlaces, validateItems } = await import('../src/data/validate.js');
  const require_json = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  test('Luật chung: chưa tới ngày khai trương = đóng, không làm điểm đến', () => {
    const pl = { openDay: 3, hours: [6, 22], orders: { rideWeight: 5 } };
    assert.equal(openDayOf(pl), 3);
    assert.equal(openDayOf({}), 1);
    assert.equal(isOpen(pl, 600, 2), false);
    assert.equal(isOpen(pl, 600, 3), true);
    assert.equal(isOpen(pl, 600), true); // không xét ngày (công cụ)
    assert.equal(orderWeight(pl, 'rideWeight', 600, 2), 0);
    assert.equal(orderWeight(pl, 'rideWeight', 600, 4), 5);
    assert.ok(unlocked({}, 1) && !unlocked({ openDay: 2 }, 1));
  });
  test('Quán chưa khai trương không có đơn; tới ngày thì có', () => {
    // quán đang mở lúc 12:00, có món nóng có đơn từ ngày 1 (dữ liệu người dùng đổi giờ / thêm quán đêm thoải mái)
    const r2 = layout.places.find((p) => p.kind === 'restaurant' && isOpen(p, 12 * 60) && (p.menu || []).some((id) => LIVE_ITEMS[id] && openDayOf(LIVE_ITEMS[id]) === 1 && !LIVE_ITEMS[id].traits.includes('cold')));
    if (!r2) return; // dữ liệu không có quán mở buổi trưa
    const saved = r2.openDay;
    r2.openDay = 3;
    const from = (day) => {
      const { om } = mkOM(11, { day });
      let n = 0;
      for (let i = 0; i < 300; i++) { const o = om.makeFood({ id: 'food', kind: 'food', fareMult: 1, deadlineMult: 1 }, 12 * 60, r2.door); if (o && o.pickup.placeId === r2.id) n++; }
      return n;
    };
    try {
      assert.equal(from(2), 0, 'ngày 2 vẫn có đơn từ quán chưa mở');
      assert.ok(from(3) > 0, 'ngày 3 không có đơn từ quán vừa khai trương');
    } finally { if (saved === undefined) delete r2.openDay; else r2.openDay = saved; }
  });
  test('Món chưa tới ngày không có đơn (kể cả khi quán đã mở)', () => {
    const r = layout.places.find((p) => p.kind === 'restaurant' && isOpen(p, 12 * 60) && (p.menu || []).length >= 2 && p.menu.every((id) => LIVE_ITEMS[id] && openDayOf(LIVE_ITEMS[id]) === 1 && !LIVE_ITEMS[id].traits.includes('cold')));
    if (!r) return; // dữ liệu không có quán 2 món nóng
    const id = r.menu[0], it = LIVE_ITEMS[id], saved = it.openDay;
    it.openDay = 4;
    const seen = (day) => {
      const { om } = mkOM(5, { day });
      for (let i = 0; i < 400; i++) { const o = om.makeFood({ id: 'food', kind: 'food', fareMult: 1, deadlineMult: 1 }, 12 * 60, r.door); if (o && o.itemIds.includes(id)) return true; }
      return false;
    };
    try {
      assert.equal(seen(3), false);
      assert.equal(seen(4), true);
    } finally { if (saved === undefined) delete it.openDay; else it.openDay = saved; }
  });
  test('Bộ kiểm tra: địa điểm cốt truyện phải mở ngày 1; ngày 1 không có quán thì cảnh báo', () => {
    const fs2 = require_json('src/data/places.json'), items2 = require_json('src/data/items.json');
    const home = fs2.places.find((p) => p.id === 'home');
    home.openDay = 2;
    for (const p of fs2.places) if (p.kind === 'restaurant') p.openDay = 2;
    const iss = validatePlaces(fs2, items2);
    assert.ok(iss.some((i) => i.ref === 'home' && i.field === 'openDay' && i.level === 'error'));
    assert.ok(iss.some((i) => i.field === 'openDay' && i.level === 'warn' && /Ngày 1/.test(i.msg)));
    items2.passenger.openDay = 3;
    assert.ok(validateItems(items2, null).some((i) => i.ref === 'passenger' && i.field === 'openDay' && i.level === 'error'));
  });
  test('Bot chơi liên tục 3 ngày (24h) không lỗi: ngủ, sang ngày, tiền nhà theo kỳ', () => {
    const run = playRun(2, 'normal', 3);
    assert.ok(run.lastDay >= 1 && run.log.daily.length >= 1);
    assert.ok(run.log.sleeps >= 1, 'bot phải ngủ');
    if (run.outcome.type !== 'lose') assert.equal(run.lastDay, 3);
  });
}

console.log('Giữ chỗ đang xem khi vẽ lại / tải lại (công cụ ?editor)');
{
  const { selKey, planScroll, selToSave } = await import('../src/devtools/editor/viewState.js');
  test('Cùng món → giữ chỗ cuộn; sang món khác → về đầu món mới, danh sách trái giữ nguyên; đổi thẻ → về đầu hết', () => {
    const k1 = selKey('gear', { cat: 'goods', id: 'raincoat' });
    const before = { key: k1, tab: 'gear', body: 900, side: 300 };
    assert.deepEqual(planScroll(before, selKey('gear', { cat: 'goods', id: 'raincoat', itemsPreview: { bumps: 2 } }), true), { body: 900, side: 300 });
    assert.deepEqual(planScroll(before, selKey('gear', { cat: 'goods', id: 'jacket' }), true), { body: 0, side: 300 });
    assert.deepEqual(planScroll(before, selKey('items', { id: 'pho' }), false), { body: 0, side: 0 });
    assert.deepEqual(planScroll(null, k1, false), { body: 0, side: 0 });
  });
  test('Nhớ món đang chọn: chỉ giữ mã/nhóm/tìm kiếm, bỏ tùy chọn tạm và dữ liệu hỏng', () => {
    const saved = selToSave({ items: { id: 'pho' }, itemsPreview: { weather: 'rain', bumps: 2 }, gear: { cat: 'vehicles', id: 'SH' }, text: { group: 'dlg', search: 'mưa' }, bad: 5 });
    assert.ok(!('itemsPreview' in saved), 'tùy chọn biểu đồ không được lưu thành {} (biểu đồ sẽ hỏng sau F5)');
    assert.deepEqual(saved, { items: { id: 'pho' }, gear: { cat: 'vehicles', id: 'SH' }, text: { group: 'dlg', search: 'mưa' } });
    assert.deepEqual(selToSave(null), {});
  });
}

console.log('Kéo thả đổi thứ tự (công cụ ?editor)');
{
  const { moveInArray, moveKey } = await import('../src/devtools/editor/order.js');
  test('Dời phần tử trong mảng lên/xuống, giữ đủ phần tử', () => {
    assert.deepEqual(moveInArray(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
    assert.deepEqual(moveInArray(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
    assert.deepEqual(moveInArray(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c']);
    assert.deepEqual(moveInArray(['a', 'b', 'c'], 0, 99), ['b', 'c', 'a']);
  });
  test('Dời khóa trong bảng: giữ nguyên đối tượng và dữ liệu, chỉ đổi thứ tự', () => {
    const t = { pho: { n: 1 }, kem: { n: 2 }, traSua: { n: 3 } };
    const ref = t.kem;
    const out = moveKey(t, 1, 0);
    assert.equal(out, t);
    assert.deepEqual(Object.keys(t), ['kem', 'pho', 'traSua']);
    assert.equal(t.kem, ref);
  });
}

console.log('Đồ mang tới địa điểm dùng (vd nhang → chùa)');
{
  const { GOODS } = await import('../src/data/goods.js');
  const { validatePlaces, validateGoods } = await import('../src/data/validate.js');
  // món thử gắn tạm vào danh mục, xong thì gỡ
  GOODS.__nhangThu = { id: '__nhangThu', name: 'Nhang thử', icon: '🪔', price: 10, type: 'carry', desc: '' };
  const temple = { id: 'chuaThu', hours: null, activities: [] };
  const act = { id: 'thap', label: 'Thắp nhang', cost: 0, minutes: 10, phys: 0, mental: 25, perDay: 1, needs: { id: '__nhangThu', qty: 2 } };
  test('Mua đồ mang theo được nhiều cái; không bấm dùng từ túi đồ được', () => {
    const gs = new GameState({ carry: { money: 100 } });
    assert.ok(gs.buy('goods', '__nhangThu').ok && gs.buy('goods', '__nhangThu').ok);
    assert.equal(gs.countOf('__nhangThu'), 2);
    assert.equal(gs.useConsumable('__nhangThu').ok, false);
    assert.equal(gs.countOf('__nhangThu'), 2);
  });
  test('Hoạt động cần đồ: thiếu thì không làm được; đủ thì làm và trừ đúng số lượng', () => {
    const gs = new GameState({ carry: { money: 100 } });
    gs.mental = 50;
    gs.buy('goods', '__nhangThu');
    assert.equal(gs.activityStatus(temple, act, 480), 'needItem');
    assert.equal(gs.doActivity(temple, act, 480).ok, false);
    gs.buy('goods', '__nhangThu');
    assert.equal(gs.activityStatus(temple, act, 480), 'ok');
    assert.ok(gs.doActivity(temple, act, 480).ok);
    assert.equal(gs.countOf('__nhangThu'), 0);
    assert.equal(gs.mental, 75);
    // đồ mang theo giữ qua ngày hôm sau
    gs.buy('goods', '__nhangThu');
    assert.equal(new GameState({ day: 2, carry: gs.carryOver() }).countOf('__nhangThu'), 1);
  });
  test('Bộ kiểm tra: đồ mang theo chưa nơi dùng → cảnh báo; cần đồ lạ / trang bị / số lượng sai → lỗi', () => {
    const pd = { places: [], alley: { block: [1, 0], lot: 'E1' }, streetsX: [], streetsZ: [], customerNames: ['A'] };
    assert.ok(validateGoods({ x: { ...GOODS.__nhangThu, id: 'x' } }, pd).some((i) => i.ref === 'x' && i.level === 'warn' && /Chưa địa điểm/.test(i.msg)));
    const bad = (needs) => validatePlaces({ ...pd, places: [{ id: 'p', name: 'P', short: 'P', kind: 'service', block: [0, 0], lot: 'N0', color: '#ffffff', sign: 'P', activities: [{ ...act, needs }] }] }, {}, { ...GOODS }, null)
      .filter((i) => i.level === 'error' && i.field === 'activities.thap');
    assert.ok(bad({ id: 'khongCo', qty: 1 }).length);
    assert.ok(bad({ id: Object.values(GOODS).find((g) => g.type === 'equipment').id, qty: 1 }).length);
    assert.ok(bad({ id: '__nhangThu', qty: 0 }).length);
    assert.equal(bad({ id: '__nhangThu', qty: 1 }).length, 0);
  });
  delete GOODS.__nhangThu;
}

console.log('Tòa nhà nhiều lô');
{
  const { lotInfo, LOT_W, lotParts, LOT_SIZES, lotSize, lotFaces } = await import('../src/sim/cityLayout.js');
  const { lotCells } = await import('../src/data/validate.js');
  const W = LOT_W, near = (a, b) => Math.abs(a - b) < 1e-9;
  test('Khung lô đúng cỡ và mặt tiền đúng hướng', () => {
    const cases = { N1: [1, 1, 'N'], N01: [2, 1, 'N'], S12: [2, 1, 'S'], W01: [1, 2, 'W'], E12: [1, 2, 'E'], N: [3, 1, 'N'], S: [3, 1, 'S'], W: [1, 3, 'W'], E: [1, 3, 'E'], E1: [1, 1, 'E'] };
    for (const [lot, [w, d, face]] of Object.entries(cases)) {
      const r = lotInfo(2, 2, lot);
      assert.ok(near(r.x1 - r.x0, w * W) && near(r.z1 - r.z0, d * W), `${lot}: ${(r.x1 - r.x0) / W}×${(r.z1 - r.z0) / W}`);
      assert.equal(r.face, face, lot);
    }
    // cả cột tây trùng khít 3 lô đơn N0, W1, S0
    const col = lotInfo(2, 2, 'W'), n0 = lotInfo(2, 2, 'N0'), s0 = lotInfo(2, 2, 'S0');
    assert.ok(near(col.z0, n0.z0) && near(col.z1, s0.z1) && near(col.x0, n0.x0));
  });
  test('Mặt tiền chọn được: chỉ các cạnh chạm đường, hướng theo lô đứng đầu', () => {
    assert.deepEqual(lotFaces('N1'), ['N']);
    assert.deepEqual(lotFaces('W1'), ['W']);
    assert.deepEqual(lotFaces('N0'), ['N', 'W']);
    assert.deepEqual(lotFaces('S2'), ['S', 'E']);
    assert.deepEqual(lotFaces('N12'), ['N', 'E']);
    assert.deepEqual(lotFaces('W12'), ['W', 'S']);
    assert.deepEqual(lotFaces('N'), ['N', 'E', 'W']);
    assert.deepEqual(lotFaces('E'), ['E', 'N', 'S']);
  });
  test('Đổi mặt tiền: cửa và tên đường đổi theo; hướng không hợp lệ thì giữ theo lô', () => {
    const def = lotInfo(1, 1, 'N0'), west = lotInfo(1, 1, 'N0', 'W'), bad = lotInfo(1, 1, 'N1', 'W');
    assert.equal(def.face, 'N');
    assert.equal(west.face, 'W');
    assert.ok(west.door.x < def.door.x && west.street !== def.street, 'cửa phải dời sang vỉa hè phía tây');
    assert.equal(bad.face, 'N');
  });
  test('Mỗi kích thước có đủ lô, tên lô ↔ kích thước khớp nhau', () => {
    for (const [size, lots] of Object.entries(LOT_SIZES)) for (const l of lots) assert.equal(lotSize(l), size);
    assert.deepEqual(lotParts('E'), ['N2', 'E1', 'S2']);
    assert.deepEqual(lotCells({ block: [1, 2], lot: 'N12' }), ['1,2,N1', '1,2,N2']);
  });
  const fs = await import('node:fs');
  const { validatePlaces } = await import('../src/data/validate.js');
  const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  test('Tòa nhà lớn: không còn nhà khách trên lô bị chiếm; bộ kiểm tra bắt đè lối hẻm', () => {
    const layout = buildLayout();
    const placeCells = new Set(layout.places.flatMap((p) => lotCells(p)));
    assert.ok(!layout.lots.some((l) => placeCells.has(l.key)), 'có nhà khách nằm trên lô của địa điểm');
    const pd = read('src/data/places.json'), items = read('src/data/items.json');
    const pho = pd.places.find((p) => p.id === 'pho');
    Object.assign(pho, { block: [...pd.alley.block], lot: 'E' }); // cả cột đông ở khối có hẻm 42
    assert.ok(validatePlaces(pd, items).some((i) => i.ref === 'pho' && i.field === 'lot' && /hẻm/.test(i.msg)));
  });
}

console.log('Ngoại hình nam/nữ');
{
  const { guessGender } = await import('../src/sim/people.js');
  const MODELS = await import('../src/world/models.js');
  const { makePerson, npcLook, randomPersonOpts, setSitting, sitY, HIP_Y } = MODELS;
  const THREE = await import('three');
  test('Đoán giới tính theo cách xưng hô đầu tên', () => {
    assert.equal(guessGender('Chị Lan'), 'f');
    assert.equal(guessGender('cô bán vé số'), 'f');
    assert.equal(guessGender('Bà Tư'), 'f');
    assert.equal(guessGender('Anh Tuấn'), 'm');
    assert.equal(guessGender('Chú Tư Lùn'), 'm');
    assert.equal(guessGender('Bé Na'), null);
    assert.equal(guessGender('Em Duy'), null);
    assert.equal(guessGender(''), null);
  });
  test('NPC: chưa đặt thì đoán theo tên; đặt rồi thì theo dữ liệu; cố định theo mã', () => {
    const coHai = npcLook('home', { name: 'Cô Hai', hat: null });
    assert.equal(coHai.gender, 'f');
    assert.equal(coHai.hairStyle, 'long');
    assert.equal(coHai.skirt, false);
    assert.equal(coHai.hat, null);
    const set = npcLook('home', { name: 'Cô Hai', gender: 'm', hairStyle: 'bun', skirt: true, hair: 0x8d8d8d, skin: 0xc68642 });
    assert.deepEqual([set.gender, set.hairStyle, set.skirt, set.hair, set.skin], ['m', 'bun', true, 0x8d8d8d, 0xc68642]);
    assert.deepEqual(npcLook('pho', { name: 'Bà Tư' }), npcLook('pho', { name: 'Bà Tư' }));
    assert.equal(npcLook('x', { name: 'Chủ quán' }).gender, 'm'); // không đoán được → nam như cũ
  });
  test('Người ngẫu nhiên: trộn nam/nữ; ngồi sau xe thì không mặc váy', () => {
    const rng = makeRng(3);
    const many = Array.from({ length: 400 }, () => randomPersonOpts(rng));
    const f = many.filter((o) => o.gender === 'f').length;
    assert.ok(f > 150 && f < 250, `nữ ${f}/400`);
    assert.ok(many.some((o) => o.skirt) && many.every((o) => !o.skirt || o.gender === 'f'));
    assert.ok(many.every((o) => o.gender === 'f' || o.hairStyle === 'short'));
    assert.ok(Array.from({ length: 200 }, () => randomPersonOpts(rng, 'f', { sitting: true })).every((o) => o.gender === 'f' && !o.skirt));
  });
  // Người gộp khối: tìm màu trong hình (bỏ qua độ tối ở chân mảnh — chỉ so tỉ lệ R:G:B)
  const meshOf = (pivot) => pivot.children.find((o) => o.isMesh);
  const hasColor = (geo, hex) => {
    const c = new THREE.Color(hex), m = Math.max(c.r, c.g, c.b), col = geo.attributes.color;
    for (let i = 0; i < col.count; i++) {
      const r = col.getX(i), g = col.getY(i), b = col.getZ(i), k = Math.max(r, g, b);
      if (k > 0 && Math.abs(r / k - c.r / m) < 0.01 && Math.abs(g / k - c.g / m) < 0.01 && Math.abs(b / k - c.b / m) < 0.01) return true;
    }
    return false;
  };
  const tris = (o) => o.userData.parts.torso.geometry.attributes.position.count;
  test('Dựng hình 3D: tóc dài, búi, váy có đủ phần', () => {
    const skin = 0xf1c27d, pants = 0x2c3e50;
    const skirt = makePerson({ gender: 'f', hairStyle: 'long', skirt: true, skin, pants });
    const noSkirt = makePerson({ gender: 'f', hairStyle: 'long', skin, pants });
    const low = (p) => (p.userData.parts.torso.geometry.computeBoundingBox(), p.userData.parts.torso.geometry.boundingBox.min.y);
    assert.ok(low(skirt) < 0.5 && low(noSkirt) > 0.75, 'váy phủ xuống gần gối');
    const thigh = meshOf(skirt.userData.parts.legL).geometry;
    assert.ok(hasColor(thigh, skin) && !hasColor(thigh, pants), 'mặc váy: chân màu da');
    assert.ok(hasColor(meshOf(noSkirt.userData.parts.legL).geometry, pants));
    assert.ok(tris(makePerson({ gender: 'f', hairStyle: 'bun' })) > tris(makePerson({ gender: 'f', hairStyle: 'short' })), 'búi tóc');
    assert.ok(tris(noSkirt) > tris(makePerson({ gender: 'f', hairStyle: 'bald' })), 'tóc dài');
  });
  test('Dựng hình 3D người: đủ khớp gối/khuỷu, ≤ 10 khối, chung 1 vật liệu, ngồi đúng yên xe', () => {
    const looks = [{}, { hat: 'helmet', helmetStyle: 'full', overlay: 'raincoat' }, { gender: 'f', skirt: true, hat: 'nonla' }, { hat: 'police', bag: true }, { overlay: 'jacket', scale: 0.72 }];
    const mats = new Set();
    for (const o of looks) {
      const p = makePerson(o), parts = p.userData.parts;
      for (const k of ['legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR', 'body', 'torso']) assert.ok(parts[k], k);
      let n = 0;
      p.traverse((m) => {
        if (!m.isMesh) return;
        n++;
        if (m !== parts.overlay) mats.add(m.material);
      });
      assert.ok(n <= 10, JSON.stringify(o) + ": " + n + " khối");
      setSitting(p, true);
      assert.ok(parts.legL.rotation.x < -1 && parts.kneeL.rotation.x > 1, 'ngồi: đùi ra trước, cẳng chân thả xuống');
      setSitting(p, false);
      assert.equal(parts.kneeL.rotation.x, 0);
    }
    assert.equal(mats.size, 1, 'mọi người dùng chung 1 vật liệu');
    assert.ok(Math.abs(sitY(1) + HIP_Y - 0.98) < 1e-9 && Math.abs(sitY(0.72, 1.02) + HIP_Y * 0.72 - 1.02) < 1e-9, 'háng nằm đúng độ cao yên');
  });
  {
    const { makeBike, setBikeColor, BIKE_MODELS, makeCar, CAR_KINDS, makeNpcMoto, jamCarGeo, jamMotoGeo } = await import('../src/world/models.js');
    const { VEHICLE_MODELS } = await import('../src/data/validate.js');
    test('Xe máy: kiểu dáng trong công cụ khớp với kiểu dựng được', () => {
      assert.deepEqual(Object.keys(VEHICLE_MODELS).sort(), [...BIKE_MODELS].sort());
    });
    test('Xe máy 4 kiểu dáng: bánh, túi, phần sơn; đổi màu đổi hết phần sơn', () => {
      for (const model of BIKE_MODELS) {
        const b = makeBike(0x123456, model);
        const ud = b.userData;
        assert.equal(ud.model, model);
        assert.ok(ud.wheelF && ud.wheelR && ud.wheelRadius > 0.2 && ud.wheelRadius < 0.4, model);
        assert.ok(ud.painted.length >= 1 && ud.painted[0].geometry.attributes.position.count > 100, `${model}: thiếu phần sơn`);
        assert.ok(ud.bagY > 1.1 && ud.bagY < 1.4, `${model}: túi ở độ cao ${ud.bagY}`);
        setBikeColor(b, 0xff0000);
        assert.ok(ud.painted.every((m) => m.material.color.getHex() === 0xff0000), model);
      }
      assert.equal(makeBike(0x123456, 'khongCo').userData.model, 'underbone', 'kiểu lạ → xe số');
    });
    const meshes = (o) => { let n = 0; o.traverse((m) => m.isMesh && m.visible && n++); return n; };
    test('Xe gộp khối: xe máy ≤ 8 khối, đèn pha riêng từng xe, cùng kiểu dùng chung hình; ô tô 4 kiểu ≤ 3 khối, dài ≤ 4,4 m', () => {
      for (const model of BIKE_MODELS) {
        const a = makeBike(0x111111, model), b = makeBike(0x222222, model);
        assert.ok(meshes(a) <= 8, `${model}: ${meshes(a)} khối`);
        assert.equal(a.userData.body.geometry, b.userData.body.geometry, 'cùng kiểu dùng chung hình');
        assert.notEqual(a.userData.lamp.material, b.userData.lamp.material, 'đèn pha mỗi xe sáng riêng');
        assert.notEqual(a.userData.body.material, b.userData.body.material, 'màu sơn riêng');
      }
      const npc = makeNpcMoto(0x123456, makeRng(3));
      assert.ok(meshes(npc) <= 17, `NPC xe máy: ${meshes(npc)} khối`);
      for (const kind of CAR_KINDS) {
        const c = makeCar(0x123456, kind);
        assert.equal(c.userData.kind, kind);
        assert.ok(meshes(c) <= 3, kind);
        const bb = new THREE.Box3().setFromObject(c), size = bb.getSize(new THREE.Vector3());
        assert.ok(size.z <= 4.5 && size.x <= 2.1 && bb.min.y > -0.01, `${kind}: ${size.x.toFixed(2)} × ${size.z.toFixed(2)}`);
      }
      assert.equal(makeCar(0x123456, 'laLam').userData.kind, 'sedan', 'kiểu lạ → sedan');
      assert.ok(jamCarGeo().attributes.color && jamMotoGeo().attributes.color, 'xe kẹt có màu kính/lốp riêng');
    });
  }
  test('Áo mưa cánh dơi che kín vai và 2 tay khi đứng, đi, chạy (không thò ra ngoài)', () => {
    const { animatePerson } = MODELS;
    const p = makePerson({ hat: 'helmet', overlay: 'raincoat' });
    const parts = p.userData.parts, pon = parts.overlay;
    for (const [phase, amt] of [[0, 0], [1.2, 0.7], [1.57, 1], [4.7, 1]]) {
      animatePerson(p, phase, amt);
      p.updateMatrixWorld(true);
      // khung áo theo từng lát cao 5 cm (thế giới)
      const bins = new Map(), v = new THREE.Vector3(), pos = pon.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(pon.matrixWorld);
        const k = Math.round(v.y / 0.05), b = bins.get(k) || { x: 0, z: 0 };
        b.x = Math.max(b.x, Math.abs(v.x));
        b.z = Math.max(b.z, Math.abs(v.z));
        bins.set(k, b);
      }
      for (const key of ['armL', 'armR']) {
        parts[key].traverse((m) => {
          if (!m.isMesh) return;
          const ap = m.geometry.attributes.position;
          for (let i = 0; i < ap.count; i++) {
            v.fromBufferAttribute(ap, i).applyMatrix4(m.matrixWorld);
            const b = bins.get(Math.round(v.y / 0.05));
            if (!b) continue; // dưới mép áo
            assert.ok(Math.abs(v.x) <= b.x + 0.02 && Math.abs(v.z) <= b.z + 0.02, `pha ${phase}: ${key} thò ra ở cao ${v.y.toFixed(2)} m`);
          }
        });
      }
    }
    setSitting(p, true);
    assert.ok(pon.scale.z > 1, 'ngồi xe: vạt trước phủ lên đùi');
    setSitting(p, false);
    assert.equal(pon.scale.z, 1);
  });
  test('Dựng hình 3D trang phục: tay ngắn, quần short, mũ fullface, áo mưa, áo khoác', () => {
    const skin = 0xf1c27d, pants = 0x2c3e50, shirt = 0x3498db;
    const upper = (p) => meshOf(p.userData.parts.armL).geometry;
    const plain = makePerson({ hat: 'helmet', skin, pants, shirt });
    assert.ok(!hasColor(upper(plain), skin), 'tay dài: bắp tay toàn màu áo');
    assert.ok(!plain.userData.parts.overlay);
    const p = makePerson({ sleeves: 'short', shorts: true, hat: 'helmet', helmetStyle: 'full', skin, pants, shirt });
    assert.ok(hasColor(upper(p), skin) && hasColor(upper(p), shirt), 'tay ngắn = phần áo + da');
    const thigh = meshOf(p.userData.parts.legL).geometry;
    assert.ok(hasColor(thigh, skin) && hasColor(thigh, pants), 'quần short = phần quần + da');
    assert.ok(hasColor(p.userData.parts.torso.geometry, 0x2b3a48), 'mũ fullface có kính');
    assert.ok(makePerson({ overlay: 'raincoat' }).userData.parts.overlay);
    const j = makePerson({ overlay: 'jacket', sleeves: 'short', shirt: 0xff0000, skin });
    assert.ok(!hasColor(upper(j), skin), 'áo khoác luôn tay dài');
    assert.ok(!hasColor(j.userData.parts.torso.geometry, 0xff0000), 'áo khoác che áo trong');
  });
}

console.log('Nhà ống A+ (src/world/houses.js)');
{
  const { HouseGeo, buildHouse, housesForLot, houseTop, SPLIT_MIN } = await import('../src/world/houses.js');
  const build = (lot, o) => {
    const g = new HouseGeo(), list = housesForLot(lot, { colors: [0xffcc88, 0x9fd8cb], seed: 7, ...o });
    for (const h of list) buildHouse(g, h);
    return { g, list };
  };
  const bounds = (g) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < g.p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g.p[i + k]); mx[k] = Math.max(mx[k], g.p[i + k]); }
    return { mn, mx };
  };
  test('Lô rộng > 7 m chia 2 căn phủ kín mặt tiền; lô hẹp 1 căn', () => {
    assert.equal(housesForLot({ x: 0, z: 0, nx: 0, nz: 1, width: 6, depth: 9 }, { floors: 3, colors: [1], seed: 1 }).length, 1);
    const two = housesForLot({ x: 0, z: 0, nx: 0, nz: 1, width: 11, depth: 9 }, { floors: 3, colors: [1], seed: 1 });
    assert.equal(two.length, 2);
    assert.ok(Math.abs(two[0].W + two[1].W - 11) < 0.1 && two.every((h) => h.W > 4 && h.W < SPLIT_MIN));
  });
  test('Nhà nằm trong lô theo cả 4 hướng mặt tiền (chỉ mái bạt/ban công đua ra trước ≤ 1,3 m), cao đúng số tầng, UV trong tấm texture', () => {
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const lot = { x: 10 * nx, y: 0.15, z: 10 * nz, nx, nz, width: 9, depth: 9 };
      const { g, list } = build(lot, { floors: 4 });
      const { mn, mx } = bounds(g);
      // lô: mặt trước tại (x, z), lùi vào trong 9 m, bề ngang 9 m; phía trước cho đua ra 1,3 m, các phía khác 0,1 m
      const lo = (n, c) => (n > 0 ? c - 9 - 0.1 : n < 0 ? c - 1.3 : -4.6);
      const hi = (n, c) => (n > 0 ? c + 1.3 : n < 0 ? c + 9 + 0.1 : 4.6);
      assert.ok(mn[0] >= lo(nx, lot.x) && mx[0] <= hi(nx, lot.x) && mn[2] >= lo(nz, lot.z) && mx[2] <= hi(nz, lot.z), 'hướng ' + nx + ',' + nz + ': x ' + mn[0].toFixed(2) + '…' + mx[0].toFixed(2) + ' z ' + mn[2].toFixed(2) + '…' + mx[2].toFixed(2));
      const top = Math.max(...list.map((h) => houseTop(h.floors)));
      assert.ok(mx[1] >= 0.15 + top && mx[1] <= 0.15 + top + 3, 'chiều cao');
      assert.ok(g.uv.every((v) => v >= 0 && v <= 1), 'UV ngoài tấm texture');
    }
  });
  test('Nhà ống: cùng seed ra cùng hình; số tam giác vừa phải (6 tầng ≤ 600/căn, vùng ven ≤ 150/căn)', () => {
    const lot = { x: 0, z: 0, nx: 0, nz: 1, width: 5.5, depth: 9 };
    const a = build(lot, { floors: 6 }).g, b = build(lot, { floors: 6 }).g;
    assert.deepEqual(a.p, b.p);
    assert.ok(a.tris <= 600, a.tris + ' tam giác');
    const low = build({ ...lot, width: 11 }, { floors: 8, low: true });
    assert.ok(low.g.tris / low.list.length <= 150, low.g.tris + ' tam giác');
    for (const fl of [1, 2, 3, 5]) assert.ok(build(lot, { floors: fl, alley: true }).g.tris > 0);
  });
}

console.log('Kiểu nhà địa điểm (src/data/looks.js, src/world/placeBuildings.js)');
{
  const { LOOKS, guessLook, lookOf, lookFloors } = await import('../src/data/looks.js');
  const { buildPlace, BUILT_LOOKS } = await import('../src/world/placeBuildings.js');
  const THREE = await import('three');
  test('Kiểu nhà: danh sách trong editor khớp với kiểu dựng được', () => {
    assert.deepEqual(Object.keys(LOOKS).sort(), [...BUILT_LOOKS].sort());
  });
  test('Tự đoán kiểu nhà theo loại + tên (dữ liệu hiện tại)', () => {
    const want = { chua: 'pagoda', karaoke: 'karaoke', cafevong: 'hammock', gas: 'gas', home: 'tro', apartment: 'apartment', market: 'tower', banhmi: 'banhmi', banhtrang: 'eatery', trasua: 'modern', cafe: 'cafe', garage: 'repair', pho: 'eatery' };
    for (const p of DATA.places.places) {
      assert.ok(LOOKS[guessLook(p)], p.id);
      if (want[p.id] && !p.look) assert.equal(guessLook(p), want[p.id], p.id);
    }
    assert.equal(lookOf({ kind: 'restaurant', name: 'Phở', look: 'pagoda' }), 'pagoda', 'đã chọn thì theo đã chọn');
    assert.equal(lookOf({ kind: 'restaurant', name: 'Phở', look: 'laLam' }), 'eatery', 'kiểu lạ → tự đoán');
    assert.equal(lookFloors({ kind: 'apartment', floors: 30 }), 15, 'kéo vào khoảng');
    assert.equal(lookFloors({ kind: 'service', name: 'Chùa', floors: 4 }), null, 'chùa không có số tầng');
  });
  test('Mọi kiểu nhà dựng được với mọi cỡ lô, nằm trong lô (đồ bày ra vỉa hè ≤ 3,1 m), không quá nhiều khối', () => {
    for (const look of Object.keys(LOOKS)) {
      for (const [W, D] of [[6, 6], [10.8, 10.8], [22.2, 10.8], [33.6, 10.8]]) {
        const fl = LOOKS[look].floors;
        const b = buildPlace({ look, W, D, floors: fl ? fl[1] : 2, color: '#f4c095', signBg: '#c0392b', sign: 'THỬ', short: 'T', kind: look === 'tower' ? 'market' : 'restaurant', menu: ['Phở'], seed: 5 });
        const box = new THREE.Box3().setFromObject(b.group);
        const where = `${look} ${W}×${D}`;
        assert.ok(box.min.z >= -D - 0.3 && box.max.z <= 3.1, `${where}: z ${box.min.z.toFixed(2)}…${box.max.z.toFixed(2)}`);
        assert.ok(box.min.x >= -W / 2 - 1.6 && box.max.x <= W / 2 + 1.6, `${where}: x ${box.min.x.toFixed(2)}…${box.max.x.toFixed(2)}`);
        let n = 0;
        b.group.traverse((m) => m.isMesh && n++);
        assert.ok(n <= 30, `${where}: ${n} khối`);
        assert.ok(b.colliders === 'full' || (Array.isArray(b.colliders) && b.colliders.length), where);
      }
    }
  });
  test('Kiểm tra dữ liệu: kiểu nhà lạ → lỗi; tự chọn kiểu mà số tầng ngoài khoảng → lỗi', () => {
    const pd = JSON.parse(JSON.stringify(DATA.places));
    const p = pd.places.find((x) => x.kind === 'restaurant');
    p.look = 'laLam';
    assert.ok(VALIDATE.validatePlaces(pd, DATA.items).some((i) => i.level === 'error' && i.field === 'look' && i.ref === p.id));
    p.look = 'tro';
    p.floors = 5;
    assert.ok(VALIDATE.validatePlaces(pd, DATA.items).some((i) => i.level === 'error' && i.field === 'floors' && i.ref === p.id));
    p.floors = 2;
    assert.ok(!VALIDATE.validatePlaces(pd, DATA.items).some((i) => i.ref === p.id && (i.field === 'floors' || i.field === 'look')));
  });
}

console.log('Gộp 2 khối (sân bay)');
{
  const CL = await import('../src/sim/cityLayout.js');
  const { buildPlace, airportPath, AIRPORT_UP } = await import('../src/world/placeBuildings.js');
  const base = JSON.parse(JSON.stringify(readJson('src/data/map.json')));
  delete base.joins;
  const mapJ = { ...base, joins: [[1, 0, 'E']] };
  test('Gộp khối: bỏ đúng 1 đoạn đường giữa 2 khối, mạng đường vẫn liền, xe vẫn đi vòng được', () => {
    const g0 = CL.roadGraph(base), g1 = CL.roadGraph(mapJ);
    assert.equal(g0.segs.length - g1.segs.length, 1);
    assert.ok(g1.closedSegs.has('x2:0') && !g1.segs.some((s) => s.axis === 'x' && s.line === 2 && s.from === 0));
    assert.ok(!CL.neighbors(2, 0, mapJ).some(([i, j]) => i === 2 && j === 1), 'ngã tư 2,0 không còn nối xuống 2,1');
    const a = { x: CL.roadPos(2), z: CL.roadPos(0) }, b = { x: CL.roadPos(2), z: CL.roadPos(1) };
    assert.ok(CL.routeDist(a, b, mapJ) > CL.routeDist(a, b, base) + 50, 'phải đi vòng');
  });
  test('Lô gộp JE: khung 2 khối (~86 × 34 m), mặt tiền quay ra 1 trong 2 cạnh dài; chiếm hết ô cả 2 khối', () => {
    const info = CL.lotInfo(1, 0, 'JE', null, mapJ);
    assert.ok(Math.abs(info.x1 - info.x0 - 86) < 0.01 && Math.abs(info.z1 - info.z0 - 34) < 0.01);
    assert.equal(info.face, 'S');
    assert.deepEqual(CL.lotFaces('JE'), ['S', 'N']);
    assert.equal(CL.lotInfo(1, 0, 'JE', 'N', mapJ).face, 'N');
    const cells = CL.placeCells({ block: [1, 0], lot: 'JE' });
    assert.equal(cells.length, 18);
    assert.ok(cells.some(([x, z]) => x === 2 && z === 0));
  });
  test('Gộp khối: lòng đường cũ là mặt bằng (đứng trên đó không còn là "dưới đường")', () => {
    const r = CL.joinGap([1, 0, 'E']);
    assert.ok(Math.abs(r.x1 - r.x0 - 12) < 0.01);
    // blockAt đọc bản đồ của game → chỉ kiểm khi dữ liệu thật có gộp 1,0 + 2,0
    if (CL.joinList().some(([x, z, d]) => x === 1 && z === 0 && d === 'E')) assert.deepEqual(CL.blockAt((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2), [1, 0]);
    assert.ok(CL.joinedSide(1, 0, 'E', mapJ) && CL.joinedSide(2, 0, 'W', mapJ) && !CL.joinedSide(1, 0, 'N', mapJ));
  });
  test('Kiểm tra dữ liệu gộp khối: ra ngoài bản đồ, gộp 1 khối 2 lần, có hẻm, qua sông → lỗi; lô JE mà chưa gộp → lỗi', () => {
    const errs = (m) => VALIDATE.validateMap(m).filter((i) => i.level === 'error' && i.field === 'joins');
    assert.equal(errs(mapJ).length, 0);
    assert.ok(errs({ ...base, joins: [[base.size - 1, 0, 'E']] }).length, 'ra ngoài');
    assert.ok(errs({ ...base, joins: [[1, 0, 'E'], [2, 0, 'S']] }).length, 'gộp 2 lần');
    const k = Object.keys(base.blocks || {})[0];
    if (k) {
      const [x, z] = k.split(',').map(Number);
      assert.ok(errs({ ...base, joins: [[x, z, x + 1 < base.size ? 'E' : 'S']] }).length, 'khối có hẻm');
    }
    const r = (base.rivers || [])[0];
    if (r && r.axis === 'x' && r.line > 0) assert.ok(errs({ ...base, joins: [[r.line - 1, r.from, 'E']] }).length, 'qua sông');
    const pd = JSON.parse(JSON.stringify(DATA.places));
    pd.places = pd.places.filter((p) => !(Array.isArray(p.block) && ((p.block[0] === 1 || p.block[0] === 2) && p.block[1] === 0)));
    pd.places.push({ id: 'thuSanBay', name: 'Sân bay thử', short: 'SB', kind: 'service', block: [1, 0], lot: 'JE', color: '#ffffff', sign: 'SB', look: 'airport' });
    assert.ok(VALIDATE.validatePlaces(pd, DATA.items, null, null, base).some((i) => i.level === 'error' && i.ref === 'thuSanBay' && i.field === 'lot'), 'chưa gộp');
    assert.ok(!VALIDATE.validatePlaces(pd, DATA.items, null, null, mapJ).some((i) => i.level === 'error' && i.ref === 'thuSanBay'), 'đã gộp');
  });
  test('Sân bay dựng được: lô 2 khối có đường trên cao cong (lên ở mép phải, xuống ở mép trái, cao 4,6 m giữa); lô nhỏ chỉ có nhà ga', () => {
    const big = buildPlace({ look: 'airport', W: 85.5, D: 33.5, color: '#e0e0e0', sign: 'SÂN BAY', kind: 'service', seed: 3 });
    assert.ok(big.upPath && Array.isArray(big.colliders) && big.colliders.length > 5);
    const p = airportPath(85.5);
    assert.ok(p.getPoint(0).y < 0.2 && p.getPoint(1).y < 0.2 && Math.abs(p.getPoint(0.5).y - AIRPORT_UP) < 0.05);
    assert.ok(p.getPoint(0).x > 40 && p.getPoint(1).x < -40);
    const small = buildPlace({ look: 'airport', W: 10.8, D: 10.8, color: '#e0e0e0', sign: 'SB', kind: 'service', seed: 3 });
    assert.equal(small.upPath, null);
  });
}

console.log('Bảng chọn emoji (công cụ ?editor)');
{
  const { EMOJI_GROUPS, searchEmoji } = await import('../src/devtools/editor/emoji.js');
  const all = EMOJI_GROUPS.flatMap(([, list]) => list);
  const found = (q) => searchEmoji(q).flatMap(([, list]) => list.map(([e]) => e));
  test('Mỗi emoji chỉ có một lần và đều có từ khóa', () => {
    const seen = new Set();
    for (const [e, kw] of all) {
      assert.ok(!seen.has(e), `trùng ${e}`);
      seen.add(e);
      assert.ok(kw && kw.trim(), `${e} chưa có từ khóa`);
    }
    assert.ok(all.length >= 100, `chỉ có ${all.length} emoji`);
  });
  test('Tìm bằng tiếng Việt, có dấu hay không dấu đều ra', () => {
    assert.ok(found('phở').includes('🍜') && found('pho').includes('🍜'));
    assert.ok(found('ca phe').includes('☕'));
    assert.ok(found('Karaoke').includes('🎤'));
    assert.ok(found('nhà sách').includes('📚'));
    assert.ok(found('đầu bếp').includes('🧑‍🍳'));
    // gõ có dấu thì đúng dấu; chỉ khớp đầu từ, không lấy tên nhóm
    assert.deepEqual(found('dù'), ['☂️', '🌂']);
    assert.ok(found('du').includes('☂️') && found('du').includes('🍉') && !found('du').includes('📘'));
    assert.ok(!found('an').includes('🥖'), '"an" không được khớp giữa chữ "bánh"');
    assert.equal(found('xyzabc').length, 0);
    assert.equal(found('').length, all.length);
  });
}

console.log('Dữ liệu & kho chữ (sửa bằng công cụ ?editor)');
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  const data = { items: read('src/data/items.json'), gear: read('src/data/gear.json'), goods: read('src/data/goods.json'), places: read('src/data/places.json'), content: read('src/content/vi.json'), apps: read('src/data/apps.json'), map: read('src/data/map.json') };
  const { validateAll, validateItems, validatePlaces, validateContent, validateGoods, validateGear } = await import('../src/data/validate.js');
  test('Dữ liệu hiện tại không có lỗi', () => {
    const errs = validateAll({ ...data, baseContent: data.content }).filter((i) => i.level === 'error');
    assert.equal(errs.length, 0, errs.map((e) => `${e.tab}/${e.ref}/${e.field}: ${e.msg}`).join('\n'));
  });
  test('Mọi khóa chữ dùng trong code đều có trong vi.json', () => {
    const files = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (p.endsWith('.js')) files.push(p);
      }
    };
    walk(fileURLToPath(new URL('../src', import.meta.url)));
    const missing = new Set();
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\b(?:fmt|pick|list|has)\(\s*'([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)'/g)) if (!(m[1] in data.content)) missing.add(`${m[1]} (${path.basename(f)})`);
    }
    // khóa ghép động
    const dyn = [
      ...['OFFLINE', 'IDLE', 'OFFERED', 'TO_PICKUP', 'WAITING_FOOD', 'OUT_OF_STOCK', 'PACKING', 'DELIVERING', 'AT_DROPOFF', 'NO_ANSWER', 'STAIRS'].map((s) => `state.${s}`),
      ...['hot', 'cold', 'liquid', 'fragile', 'paper', 'passenger'].map((t) => `trait.${t}`),
      ...[1, 2, 3, 4, 5].flatMap((n) => [`comment.${n}`, `comment.ride.${n}`]),
      ...['shirt', 'pants', 'helmet'].map((s) => `outfit.slot.${s}`),
      ...['Ride', 'Food', 'Parcel'].flatMap((k) => [`goal.pickup${k}`, `goal.pickup${k}Hint`]),
      ...Object.keys(data.apps.orderTypes).map((t) => `money.${t}`), // thu nhập ghi theo loại đơn
      'state.RETURNING', 'phone.stepParcel',
      'npc.default.greet', 'npc.default.name',
    ];
    const physics = fs.readFileSync(new URL('../src/sim/ItemPhysics.js', import.meta.url), 'utf8');
    for (const m of physics.matchAll(/\.damage\([^'\n]*'(\w+)'\)/g)) dyn.push(`dmg.${m[1]}`);
    for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\b(?:spend|earn)\([^)]*?,\s*'(\w+)'/g)) dyn.push(`money.${m[1]}`);
    for (const k of dyn) if (!(k in data.content)) missing.add(k);
    assert.equal(missing.size, 0, `Thiếu khóa: ${[...missing].join(', ')}`);
  });
  test('Bộ kiểm tra bắt được dữ liệu hỏng', () => {
    const items = JSON.parse(JSON.stringify(data.items));
    items.pho.base = -1;
    items.pho.traits = ['hot', 'cold'];
    delete items.passenger;
    const e1 = validateItems(items, data.places).filter((i) => i.level === 'error');
    assert.ok(e1.length >= 3);
    const places = JSON.parse(JSON.stringify(data.places));
    const pho = places.places.find((p) => p.id === 'pho');
    const comtam = places.places.find((p) => p.id === 'comtam');
    pho.block = [...comtam.block];
    pho.lot = comtam.lot;
    assert.ok(validatePlaces(places, data.items).some((i) => i.field === 'lot' && i.level === 'error'));
    Object.assign(comtam.npc, { gender: 'nam', hairStyle: 'xoăn', hair: 'đen', skirt: 'có' });
    const npcErr = validatePlaces(places, data.items).filter((i) => i.ref === 'comtam' && i.level === 'error').map((i) => i.field);
    for (const f of ['npc.gender', 'npc.hairStyle', 'npc.hair', 'npc.skirt']) assert.ok(npcErr.includes(f), `không bắt lỗi ${f}`);
  });
  test('Bộ kiểm tra trang phục: chỗ mặc / kiểu / màu sai → lỗi; đồ có sẵn không cần nơi bán', () => {
    const goods = JSON.parse(JSON.stringify(data.goods));
    goods.aoLoi = { id: 'aoLoi', name: 'Áo lỗi', price: 10, type: 'outfit', slot: 'giay', style: 'x', color: 'đỏ' };
    goods.quanLoi = { id: 'quanLoi', name: 'Quần lỗi', price: 10, type: 'outfit', slot: 'pants', style: 'short', color: '#000000' };
    const issues = validateGoods(goods, data.places);
    const errs = (ref) => issues.filter((i) => i.ref === ref && i.level === 'error').map((i) => i.field);
    assert.ok(errs('aoLoi').includes('slot') && errs('aoLoi').includes('color'));
    assert.ok(errs('quanLoi').includes('style'), 'quần không có kiểu "short" (tay ngắn là của áo)');
    const free = Object.values(data.goods).find((g) => g.type === 'outfit' && g.price === 0);
    assert.ok(free, 'dữ liệu mẫu phải có trang phục có sẵn');
    assert.ok(!issues.some((i) => i.ref === free.id && i.field === 'sells'));
  });
  test('Bộ kiểm tra xe: kiểu dáng lạ → lỗi; chưa chọn → cảnh báo', () => {
    const gear = JSON.parse(JSON.stringify(data.gear));
    gear.vehicles.cub.model = 'xeDap';
    delete gear.vehicles.wave.model;
    const issues = validateGear(gear);
    assert.ok(issues.some((i) => i.ref === 'cub' && i.field === 'model' && i.level === 'error'));
    assert.ok(issues.some((i) => i.ref === 'wave' && i.field === 'model' && i.level === 'warn'));
    assert.ok(!validateGear(data.gear).some((i) => i.field === 'model'), 'dữ liệu mẫu phải có kiểu dáng cho mọi xe');
  });
  test('Cảnh báo số nguy hiểm: trừ thanh quá mạnh, miễn phí không giới hạn, quá rẻ, xe giá 0', () => {
    const places = JSON.parse(JSON.stringify(data.places));
    const pho = places.places.find((p) => p.id === 'pho');
    pho.activities = [
      { id: 'a', label: 'Ngất', cost: 10, minutes: 5, phys: -100, mental: 0, perDay: 0 },
      { id: 'b', label: 'Mệt', cost: 10, minutes: 5, phys: 0, mental: -40, perDay: 0 },
      { id: 'c', label: 'Free', cost: 0, minutes: 5, phys: 20, mental: 0, perDay: 0 },
      { id: 'd', label: 'Ổn', cost: 20, minutes: 10, phys: -5, mental: 30, perDay: 1 },
    ];
    const w = validatePlaces(places, data.items).filter((i) => i.ref === 'pho' && i.level === 'warn');
    assert.ok(w.some((i) => i.field === 'activities.a' && /THUA ngay/.test(i.msg)));
    assert.ok(w.some((i) => i.field === 'activities.b' && /có thể thua/.test(i.msg)));
    assert.ok(w.some((i) => i.field === 'activities.c' && /miễn phí/.test(i.msg)));
    assert.ok(!w.some((i) => i.field === 'activities.d'), 'hoạt động bình thường không bị cảnh báo');
    const goods = { cheap: { id: 'cheap', name: 'Rẻ', price: 5, type: 'consumable', use: { minutes: 1, phys: 30, mental: 0 } }, free: { id: 'free', name: 'Free', price: 0, type: 'consumable', use: { minutes: 1, phys: 5 } } };
    const gw = validateGoods(goods, null).filter((i) => i.level === 'warn' && i.field === 'price').map((i) => i.ref);
    assert.deepEqual(gw.sort(), ['cheap', 'free']);
    const gear = JSON.parse(JSON.stringify(data.gear));
    const someBike = Object.keys(gear.vehicles).find((k) => k !== 'cub');
    gear.vehicles[someBike].price = 0;
    assert.ok(validateGear(gear).some((i) => i.ref === someBike && i.field === 'price' && i.level === 'warn'));
    const content ={ ...data.content, 'toast.dayStart': 'Ngày {abc}' };
    assert.ok(validateContent(content, data.content).some((i) => i.ref === 'toast.dayStart' && i.level === 'error'));
  });
}

console.log('Chợp mắt ở địa điểm');
{
  const { validatePlaces, validateBalance } = await import('../src/data/validate.js');
  const S = ENERGY.sleep;
  test('Chợp mắt hồi kém ngủ ở nhà (× napMul) và bớt giờ đã thức', () => {
    const a = new GameState(), b = new GameState();
    a.phys = b.phys = 10; a.mental = b.mental = 10;
    a.drain('sleep', 60, { now: 600 });
    b.drain('nap', 60, { now: 600 });
    assert.ok(Math.abs((b.phys - 10) - (a.phys - 10) * S.napMul) < 1e-6);
    assert.ok(Math.abs((b.mental - 10) - (a.mental - 10) * S.napMul) < 1e-6);
    const g = new GameState();
    const now = g.awakeSince + 20 * 60; // thức 20 tiếng → buồn ngủ
    assert.equal(g.tiredLevel(now), 1);
    g.napWake(now, S.napLongMin);
    assert.ok(Math.abs(g.awakeHours(now) - (20 - (S.napLongMin * S.napAwakeCut) / 60)) < 1e-6);
    assert.equal(g.tiredLevel(now), 0, 'ngủ ngắn 2 tiếng hết buồn ngủ');
    g.napWake(now, 10000);
    assert.equal(g.awakeHours(now), 0, 'không bớt quá lúc này');
  });
  test('Bộ kiểm tra: ô chợp mắt / dừng khi có đơn phải là true/false; phòng trọ tick chợp mắt → cảnh báo', () => {
    const pd = { places: [], alley: { block: [1, 0], lot: 'E1' }, streetsX: [], streetsZ: [], customerNames: ['A'] };
    const act = { id: 'ngoi', label: 'Ngồi', cost: 0, minutes: 30, phys: 0, mental: 5, perDay: 0 };
    const run = (extra, a2 = act) => validatePlaces({ ...pd, places: [{ id: 'p', name: 'P', short: 'P', kind: 'service', block: [0, 0], lot: 'N0', color: '#ffffff', sign: 'P', activities: [a2], ...extra }] }, {}, null, null);
    assert.equal(run({ nap: true }, { ...act, stopOnOrder: true }).filter((i) => i.level === 'error' && (i.field === 'nap' || i.field === 'activities.ngoi')).length, 0);
    assert.ok(run({ nap: 'có' }).some((i) => i.level === 'error' && i.field === 'nap'));
    assert.ok(run({}, { ...act, stopOnOrder: 1 }).some((i) => i.level === 'error' && i.field === 'activities.ngoi'));
    assert.ok(run({ nap: true, kind: 'home' }).some((i) => i.level === 'warn' && i.field === 'nap'));
    const bal = JSON.parse(fs.readFileSync(new URL('../src/data/balance.json', import.meta.url), 'utf8'));
    bal.energy.sleep.napLongMin = 10;
    assert.ok(validateBalance(bal).some((i) => i.field === 'energy.sleep.napLongMin' || i.ref === 'energy.sleep.napLongMin'));
  });
}

console.log('Công cụ ?editor: bỏ qua cảnh báo, nhóm vật phẩm');
{
  const { splitIgnored, addIgnore, removeIgnore } = await import('../src/devtools/editor/ignore.js');
  const { groupOf, guessGroup } = await import('../src/data/itemGroups.js');
  const { goodsGroupOf } = await import('../src/devtools/editor/goodsGroups.js');
  const { validateItems } = await import('../src/data/validate.js');
  test('Bỏ qua đúng một cảnh báo; nội dung đổi thì hiện lại; lỗi đỏ không ẩn được', () => {
    const w1 = { level: 'warn', tab: 'places', ref: 'cafe', field: 'activities.a', msg: 'Hoạt động hơn 2 tiếng' };
    const w2 = { ...w1, ref: 'chua' };
    const e1 = { ...w1, level: 'error' };
    const list = [];
    addIgnore(list, w1);
    addIgnore(list, w1);
    assert.equal(list.length, 1, 'không ghi trùng');
    let r = splitIgnored([w1, w2, e1], list);
    assert.deepEqual([r.shown, r.ignored], [[w2, e1], [w1]]);
    r = splitIgnored([{ ...w1, msg: 'Hoạt động hơn 3 tiếng' }], list);
    assert.equal(r.shown.length, 1, 'nội dung đổi → hiện lại');
    removeIgnore(list, w1);
    assert.equal(splitIgnored([w1], list).shown.length, 1);
    assert.equal(splitIgnored([w1], null).shown.length, 1, 'file hỏng / thiếu → không ẩn gì');
  });
  test('Nhóm đồ dùng: quần áo chỉ để mặc → Thời trang; quần áo có tác dụng → nhóm riêng', () => {
    assert.equal(goodsGroupOf({ type: 'outfit', name: 'Áo thun', slot: 'shirt' }), 'fashion');
    assert.equal(goodsGroupOf({ type: 'outfit', name: 'Áo đồng phục', slot: 'shirt', effects: { tipBonus: 1 } }), 'wearFx');
    assert.equal(goodsGroupOf({ type: 'outfit', name: 'Áo', effects: {} }), 'fashion', 'tác dụng rỗng = chỉ để mặc');
    assert.equal(goodsGroupOf({ type: 'equipment', name: 'Áo mưa', effects: { rainProtect: true } }), 'wearFx');
    assert.equal(goodsGroupOf({ type: 'equipment', name: 'Sách hay', effects: { tipBonus: 2 } }), 'equipment');
    assert.equal(goodsGroupOf({ type: 'consumable', name: 'Nước tăng lực' }), 'consumable');
    assert.equal(goodsGroupOf({ type: 'carry', name: 'Nhang' }), 'carry');
  });
  test('Nhóm vật phẩm: tự đoán theo đặc tính / tên; nhóm lạ → lỗi', () => {
    assert.equal(guessGroup({ name: 'Trà sữa', traits: ['cold', 'liquid'] }), 'drink');
    assert.equal(guessGroup({ name: 'Phở bò', traits: ['hot', 'liquid'] }), 'food');
    assert.equal(guessGroup({ name: 'Khách', traits: ['passenger'] }), 'rider');
    assert.equal(guessGroup({ name: 'Hộp giày', traits: ['paper'], parcel: true }), 'parcel');
    assert.equal(groupOf({ name: 'Phở bò', traits: ['hot'], group: 'drink' }), 'drink', 'đã chọn nhóm thì theo nhóm đã chọn');
    const items = JSON.parse(JSON.stringify(DATA.items));
    const k = Object.keys(items).find((x) => x !== 'passenger');
    items[k].group = 'drink';
    assert.ok(!validateItems(items, DATA.places).some((i) => i.field === 'group'));
    items[k].group = 'banhKeo';
    assert.ok(validateItems(items, DATA.places).some((i) => i.level === 'error' && i.field === 'group' && i.ref === k));
  });
}

console.log('Thẻ 🏗️ Xây dựng: địa điểm chưa đặt, kéo thả vào lô');
{
  const { buildLayout, lotInfo, blockPlan, CITY } = await import('../src/sim/cityLayout.js');
  const { validatePlaces } = await import('../src/data/validate.js');
  const B = await import('../src/devtools/editor/buildRules.js');
  const rd = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  const center = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
  test('Địa điểm chưa đặt: game bỏ qua; bộ kiểm tra nhắc; địa điểm bắt buộc thì báo lỗi', () => {
    const pd = rd('src/data/places.json');
    const src = pd.places.find((p) => p.kind === 'restaurant');
    pd.places.push({ ...JSON.parse(JSON.stringify(src)), id: 'quanCho', block: undefined, lot: undefined });
    delete pd.places.at(-1).block; delete pd.places.at(-1).lot;
    assert.ok(!buildLayout(pd.places).placeById.quanCho, 'game không dựng địa điểm chưa đặt');
    const iss = validatePlaces(pd, rd('src/data/items.json'));
    assert.ok(iss.some((i) => i.ref === 'quanCho' && i.level === 'warn' && i.field === 'block'));
    assert.ok(!iss.some((i) => i.ref === 'quanCho' && i.level === 'error'), 'chưa đặt không phải lỗi');
    const home = pd.places.find((p) => p.id === 'home');
    delete home.block; delete home.lot;
    assert.ok(validatePlaces(pd, rd('src/data/items.json')).some((i) => i.ref === 'home' && i.level === 'error' && i.field === 'block'));
  });
  test('Kéo thả: lô trống thì được; lô có địa điểm khác / khối hẻm với nhà nhiều lô thì không', () => {
    const data = { places: rd('src/data/places.json'), map: rd('src/data/map.json') };
    const placed = data.places.places.filter((p) => p.block && p.lot);
    const a = placed.find((p) => p.kind === 'restaurant' && !blockPlan(p.block[0], p.block[1], data.map));
    const b = placed.find((p) => p !== a && p.kind !== 'gate' && !blockPlan(p.block[0], p.block[1], data.map));
    // thả a lên chỗ của b → không được
    const [bx, bz] = center(lotInfo(b.block[0], b.block[1], b.lot, null, data.map));
    const onB = B.dropTarget(data, { ...a, lot: 'N1' }, bx, bz);
    assert.equal(onB.ok, false);
    assert.match(onB.why, /đã có/);
    // một lô 1 ô trống nào đó → được
    let free = null;
    for (let z = 0; z < CITY.N && !free; z++) for (let x = 0; x < CITY.N && !free; x++) {
      if (blockPlan(x, z, data.map)) continue;
      for (const lot of ['N0', 'N1', 'N2', 'S0', 'S1', 'S2']) {
        const t = B.dropTarget(data, { id: 'moi', kind: 'restaurant' }, ...center(lotInfo(x, z, lot, null, data.map)));
        if (t.ok && t.lot === lot && t.bx === x && t.bz === z) { free = t; break; }
      }
    }
    assert.ok(free, 'phải có lô trống đặt được');
    // nhà 2 lô thả vào khối có hẻm → không được
    const alleyKey = Object.keys(data.map.blocks || {})[0];
    if (alleyKey) {
      const [ax, az] = alleyKey.split(',').map(Number);
      const l = blockPlan(ax, az, data.map).lots[0];
      const t = B.dropTarget(data, { id: 'to', kind: 'service' }, ...center(lotInfo(ax, az, l.id, null, data.map)), 'two');
      assert.equal(t.ok, false);
    }
    assert.equal(B.lotProblem(data, { id: 'g', kind: 'gate' }, 0, 0, 'N1') !== '', true, 'nhà cổng xanh không dời');
  });
}

console.log('Cảnh quan (công viên, đất trống, sân bóng, bãi giữ xe, công trình) + cỡ cả khối');
{
  const { lotInfo, lotFaces, blockPlan, blockBounds, CITY } = await import('../src/sim/cityLayout.js');
  const { validatePlaces } = await import('../src/data/validate.js');
  const { buildPlace } = await import('../src/world/placeBuildings.js');
  const { LOOKS, looksFor, lookOf } = await import('../src/data/looks.js');
  const B = await import('../src/devtools/editor/buildRules.js');
  const rd = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  test('Cả khối: lô B phủ cả khối, quay ra 4 hướng; chỉ cảnh quan được dùng', () => {
    const r = lotInfo(1, 1, 'B'), b = blockBounds(1, 1);
    assert.ok(Math.abs(r.x0 - (b.x0 + CITY.SW)) < 1e-6 && Math.abs(r.x1 - (b.x1 - CITY.SW)) < 1e-6 && Math.abs(r.z1 - (b.z1 - CITY.SW)) < 1e-6);
    assert.equal(r.face, 'N');
    assert.deepEqual(lotFaces('B').slice().sort(), ['E', 'N', 'S', 'W']);
    const pd = rd('src/data/places.json');
    const base = { name: 'Công viên', short: 'CV', kind: 'scenery', color: '#5f9e45' };
    const run = (extra) => validatePlaces({ ...pd, places: [...pd.places, { id: 'cv', ...base, ...extra }] }, rd('src/data/items.json')).filter((i) => i.ref === 'cv' && i.level === 'error');
    assert.deepEqual(run({ look: 'park' }), [], 'cảnh quan không cần NPC, biển hiệu');
    assert.ok(run({ look: 'tube' }).some((i) => i.field === 'look'), 'cảnh quan dùng kiểu nhà thường → lỗi');
    const shop = pd.places.find((p) => p.kind === 'restaurant');
    assert.ok(validatePlaces({ ...pd, places: pd.places.map((p) => (p === shop ? { ...p, look: 'park' } : p)) }, rd('src/data/items.json')).some((i) => i.ref === shop.id && i.field === 'look' && i.level === 'error'));
    assert.ok(validatePlaces({ ...pd, places: pd.places.map((p) => (p === shop ? { ...p, lot: 'B' } : p)) }, rd('src/data/items.json')).some((i) => i.ref === shop.id && i.field === 'lot' && i.level === 'error'));
    assert.deepEqual(looksFor('scenery').sort(), Object.keys(LOOKS).filter((k) => LOOKS[k].scenery).sort());
    assert.equal(lookOf({ kind: 'scenery', name: 'Bãi giữ xe chợ' }), 'parkingLot');
  });
  test('Dựng 5 mẫu cảnh quan (1 lô, 2 lô, cả khối): đi xuyên qua được — chỉ vật nhỏ chắn', () => {
    for (const look of Object.keys(LOOKS).filter((k) => LOOKS[k].scenery)) {
      for (const [W, D] of [[11, 9], [22, 9], [34, 34]]) {
        const b = buildPlace({ look, W, D, seed: 3 });
        assert.ok(Array.isArray(b.colliders), `${look}: không chắn kín cả lô`);
        const area = b.colliders.reduce((s, c) => s + (c.x1 - c.x0) * (c.z1 - c.z0), 0);
        assert.ok(area < W * D * 0.85, `${look} ${W}×${D}: vật cản phủ gần hết lô`);
      }
    }
  });
  test('Kéo cảnh quan cả khối: vào khối trống thì được, khối có địa điểm / có hẻm thì không', () => {
    const data = { places: rd('src/data/places.json'), map: rd('src/data/map.json') };
    const placed = data.places.places.filter((p) => p.block && p.lot);
    const used = new Set(placed.map((p) => p.block.join(',')));
    used.add(data.places.alley.block.join(','));
    for (const [x, z, s] of data.map.joins || []) used.add(s === 'E' ? `${x + 1},${z}` : `${x},${z + 1}`); // khối thứ 2 của lô gộp
    const center = (bx, bz) => { const r = blockBounds(bx, bz); return [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]; };
    let freeBlock = null, busyBlock = placed.find((p) => !blockPlan(p.block[0], p.block[1], data.map))?.block;
    for (let z = 0; z < CITY.N && !freeBlock; z++) for (let x = 0; x < CITY.N && !freeBlock; x++) if (!used.has(`${x},${z}`) && !blockPlan(x, z, data.map)) freeBlock = [x, z];
    const cv = { id: 'cv', kind: 'scenery' };
    if (freeBlock) {
      const t = B.dropTarget(data, cv, ...center(...freeBlock), 'block');
      assert.equal(t.lot, 'B');
      assert.ok(t.ok, t.why);
    }
    if (busyBlock) assert.equal(B.dropTarget(data, cv, ...center(...busyBlock), 'block').ok, false);
    const ak = Object.keys(data.map.blocks || {})[0];
    if (ak) assert.equal(B.dropTarget(data, cv, ...center(...ak.split(',').map(Number)), 'block').ok, false);
  });
  test('Không file dữ liệu / chữ nào chứa ký tự vỡ "�" (lỗi lưu file cắt đôi chữ có dấu)', () => {
    for (const f of ['src/content/vi.json', 'src/data/items.json', 'src/data/places.json', 'src/data/gear.json', 'src/data/goods.json', 'src/data/apps.json', 'src/data/map.json', 'src/data/balance.json', 'src/data/editor.json']) {
      const t = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
      const i = t.indexOf('�');
      assert.equal(i, -1, `${f}: có ký tự vỡ quanh "${t.slice(Math.max(0, i - 30), i + 10)}"`);
    }
  });
}

console.log('Đậu xe: gửi bãi, dán phạt, cẩu xe, trộm đêm');
{
  const PK = await import('../src/sim/parking.js');
  const { PARKING } = await import('../src/data/balance.js');
  const { atHour } = await import('../src/sim/clock.js');
  const always = { next: () => 0 }, never = { next: () => 0.9999 };
  const parkedAt = (h) => ({ since: atHour(1, h), safe: false, ticketed: false, robbed: false });
  test('Để xe ngoài đường: trong thời gian được để yên thì không sao; quá giờ → ban ngày phạt / cẩu, ban đêm trộm', () => {
    const p = parkedAt(10);
    assert.equal(PK.parkingRoll(always, p.since + PARKING.graceMin - 1, p), null, 'chưa quá thời gian được để yên');
    const t = p.since + PARKING.graceMin + 1;
    assert.equal(PK.parkingRoll(always, t, p, { canTow: true }), 'tow', 'giờ hành chính, có bãi → cẩu');
    assert.equal(PK.parkingRoll(always, t, p, { canTow: false }), 'ticket', 'chưa có bãi giữ xe → chỉ phạt');
    assert.equal(PK.parkingRoll(always, t, p, { canTow: true, hasCargo: true }), 'ticket', 'đang chở hàng → không cẩu');
    assert.equal(PK.parkingRoll(always, t, { ...p, ticketed: true }, { canTow: false }), null, 'mỗi lần đậu phạt 1 lần');
    assert.equal(PK.parkingRoll(never, t, p), null);
    assert.equal(PK.parkingRoll(always, t, { ...p, safe: true }), null, 'xe gửi bãi / gần nhà: an toàn');
    const night = parkedAt(23);
    assert.equal(PK.parkingRoll(always, night.since + PARKING.graceMin + 5, night), 'theft');
    assert.equal(PK.parkingRoll(always, night.since + PARKING.graceMin + 5, { ...night, robbed: true }), null);
  });
  test('Xác suất mỗi giờ khớp số trong thẻ Cân bằng (giả lập 1 giờ nhiều lần)', () => {
    const rng = makeRng(42);
    let hit = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const p = parkedAt(9);
      for (let m = 1; m <= 60; m++) if (PK.parkingRoll(rng, p.since + PARKING.graceMin + m, p, { canTow: false }) === 'ticket') { hit++; break; }
    }
    assert.ok(Math.abs(hit / N - PARKING.ticketPerHour) < 0.03, `${hit / N} so với ${PARKING.ticketPerHour}`);
  });
  test('Bãi giữ xe: nhận ra xe đậu trong bãi, tìm bãi gần nhất; gần phòng trọ là an toàn', () => {
    const lot = { id: 'bai', kind: 'scenery', look: 'parkingLot', x0: 0, x1: 10, z0: 0, z1: 10 };
    const park = { id: 'cv', kind: 'scenery', look: 'park', x0: 20, x1: 30, z0: 0, z1: 10 };
    const home = { id: 'home', kind: 'home', door: { x: 100, z: 100 } };
    const places = [lot, park, home];
    assert.equal(PK.parkingLotAt(places, 5, 5), lot);
    assert.equal(PK.parkingLotAt(places, 25, 5), null, 'công viên không phải bãi giữ xe');
    assert.equal(PK.nearestParkingLot(places, 50, 50), lot);
    assert.equal(PK.nearestParkingLot([park, home], 50, 50), null);
    assert.ok(PK.safeSpot(places, 105, 100) && !PK.safeSpot(places, 150, 100));
  });
}

console.log('Đồn công an: phạt nguội, giữ xe');
{
  const PK = await import('../src/sim/parking.js');
  const { PARKING } = await import('../src/data/balance.js');
  const { validatePlaces } = await import('../src/data/validate.js');
  const { looksFor, lookOf } = await import('../src/data/looks.js');
  const { buildPlace } = await import('../src/world/placeBuildings.js');
  const B = await import('../src/devtools/editor/buildRules.js');
  const { lotInfo, blockPlan, CITY } = await import('../src/sim/cityLayout.js');
  const rd = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  test('Phạt nguội: ghi sổ, quá hạn tăng tiền một lần, đủ tiền mới nộp được, lưu qua lần chơi', () => {
    const gs = new GameState({ carry: { money: 30 } });
    gs.addFine(50, 'parking', 1000);
    assert.equal(gs.finesTotal, 50);
    assert.equal(gs.updateFines(1000 + PARKING.fineDays * 1440).length, 0, 'đúng hạn chưa tính quá hạn');
    assert.equal(gs.updateFines(1001 + PARKING.fineDays * 1440).length, 1);
    assert.equal(gs.finesTotal, Math.round(50 * (1 + PARKING.overduePct)));
    assert.equal(gs.updateFines(99999).length, 0, 'chỉ tăng một lần');
    assert.ok(gs.hasOverdueFines);
    assert.equal(gs.payFines(), null, 'thiếu tiền thì chưa nộp được');
    const back = new GameState({ day: 2, carry: gs.carryOver() });
    assert.equal(back.finesTotal, gs.finesTotal);
    back.money = 500;
    assert.equal(back.payFines(), gs.finesTotal);
    assert.equal(back.fines.length, 0);
  });
  test('Xe bị cẩu về đồn công an gần nhất; chưa có đồn thì về bãi giữ xe', () => {
    const lot = { id: 'bai', kind: 'scenery', look: 'parkingLot', x0: 0, x1: 10, z0: 0, z1: 10 };
    const st1 = { id: 'ca1', kind: 'police', door: { x: 200, z: 0 } }, st2 = { id: 'ca2', kind: 'police', door: { x: -200, z: 0 } };
    assert.equal(PK.towTarget([lot, st1, st2], -150, 0), st2);
    assert.equal(PK.towTarget([lot], 50, 50), lot);
    assert.equal(PK.towTarget([], 0, 0), null);
  });
  test('Đồn công an: chỉ dùng kiểu đồn, cần ít nhất 2 lô; dựng được nhà + bãi (không chắn kín)', () => {
    assert.deepEqual(looksFor('police'), ['police']);
    assert.ok(!looksFor('restaurant').includes('police') && !looksFor('scenery').includes('police'));
    assert.equal(lookOf({ kind: 'police' }), 'police');
    const pd = rd('src/data/places.json'), items = rd('src/data/items.json'), map = rd('src/data/map.json');
    const base = { name: 'Công an phường', short: 'CA', kind: 'police', color: '#f2d16b', sign: 'CÔNG AN', npc: { name: 'Anh công an' } };
    let free = null;
    for (let z = 0; z < CITY.N && !free; z++) for (let x = 0; x < CITY.N && !free; x++) {
      if (blockPlan(x, z, map)) continue;
      if (!B.lotProblem({ places: pd, map }, base, x, z, 'S01')) free = [x, z];
    }
    assert.ok(free, 'phải có chỗ trống 2 lô');
    const err = (lot) => validatePlaces({ ...pd, places: [...pd.places, { id: 'ca', ...base, block: free, lot }] }, items, null, null, map).filter((i) => i.ref === 'ca' && i.level === 'error');
    assert.deepEqual(err('S01'), []);
    assert.ok(err('S0').some((i) => i.field === 'lot'), '1 lô → lỗi');
    assert.equal(B.lotProblem({ places: pd, map }, base, free[0], free[1], 'S0') !== '', true);
    const r = lotInfo(free[0], free[1], 'S0');
    const t = B.dropTarget({ places: pd, map }, { id: 'caMoi', kind: 'police' }, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
    assert.ok(['S01', 'S12'].includes(t.lot), `chưa đặt → kéo ra mặc định 2 lô (được ${t.lot})`);
    for (const [W, D] of [[22.2, 10.8], [10.8, 22.2], [33.6, 10.8]]) {
      const b = buildPlace({ look: 'police', W, D, seed: 2, sign: 'CA', color: '#f2d16b' });
      assert.ok(Array.isArray(b.colliders) && b.colliders.length > 3, 'nhà + rào + xe là vật cản riêng');
    }
  });
}

console.log('Chùa tứ hợp viện (cả khối chừa góc) + quán trà');
{
  const CL = await import('../src/sim/cityLayout.js');
  const { validatePlaces } = await import('../src/data/validate.js');
  const { buildPlace } = await import('../src/world/placeBuildings.js');
  const B = await import('../src/devtools/editor/buildRules.js');
  const rd = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  test('Cả khối chừa góc: 8 ô, mặt tiền chỉ quay ra 2 đường chạm góc chừa, cổng ở giữa phần mặt tiền còn lại', () => {
    assert.equal(CL.lotParts('BN0').length, 8);
    assert.ok(!CL.lotParts('BN0').includes('N0') && CL.lotParts('BN0').includes('C'));
    assert.equal(CL.cutCell('BS2'), 'S2');
    assert.equal(CL.cutCell('B'), null);
    assert.deepEqual(CL.lotFaces('BN0'), ['N', 'W']);
    assert.deepEqual(CL.lotFaces('BS2'), ['S', 'E']);
    // cổng (cửa) dời về phía 2 ô mặt tiền còn lại
    const full = CL.lotInfo(2, 2, 'B'), cut = CL.lotInfo(2, 2, 'BN0');
    assert.ok(cut.door.x > full.door.x + 5, 'chừa góc tây-bắc → cổng lệch sang đông');
    // góc chừa nằm bên nào khi nhìn từ đường (khớp với cách xoay nhà trong city.js)
    assert.equal(CL.cutSide('BN0', 'N'), 'FR');
    assert.equal(CL.cutSide('BN0', 'W'), 'FL');
    assert.equal(CL.cutSide('BS2', 'S'), 'FR');
    assert.equal(CL.cutSide('B', 'N'), null);
  });
  test('Dữ liệu: chừa góc chỉ cho chùa tứ hợp viện; chùa tứ hợp viện phải cả khối; ô góc chừa đặt được địa điểm khác', () => {
    const pd = rd('src/data/places.json'), items = rd('src/data/items.json'), map = rd('src/data/map.json');
    const used = new Set(pd.places.filter((p) => p.block).map((p) => p.block.join(',')));
    used.add(pd.alley.block.join(','));
    for (const [x, z, s] of map.joins || []) used.add(s === 'E' ? `${x + 1},${z}` : `${x},${z + 1}`); // khối thứ 2 của lô gộp
    let blk = null;
    for (let z = 0; z < CL.CITY.N && !blk; z++) for (let x = 0; x < CL.CITY.N && !blk; x++) if (!used.has(`${x},${z}`) && !CL.blockPlan(x, z, map)) blk = [x, z];
    assert.ok(blk, 'cần 1 khối trống');
    const chua = { id: 'chuaT', name: 'Chùa', short: 'Chùa', kind: 'service', look: 'pagodaCourtyard', color: '#e2b85c', sign: 'CHÙA', npc: { name: 'Sư' }, block: blk, lot: 'BN0' };
    const tra = { id: 'traT', name: 'Trà', short: 'Trà', kind: 'service', look: 'teahouse', color: '#f3e3c3', sign: 'TRÀ', npc: { name: 'Cô' }, block: blk, lot: 'N0' };
    const errs = (extra) => validatePlaces({ ...pd, places: [...pd.places, ...extra] }, items, null, null, map).filter((i) => ['chuaT', 'traT'].includes(i.ref) && i.level === 'error');
    assert.deepEqual(errs([chua, tra]), [], 'chùa chừa góc + quán trà ở ô góc: hợp lệ');
    assert.ok(errs([{ ...chua, lot: 'N1' }]).some((i) => i.field === 'lot'), 'chùa tứ hợp viện 1 lô → lỗi');
    assert.ok(errs([{ ...chua, look: 'park', kind: 'scenery' }]).some((i) => i.field === 'lot'), 'cảnh quan không dùng chừa góc');
    assert.ok(errs([chua, { ...tra, lot: 'N1' }]).some((i) => i.field === 'lot'), 'quán trà đè lên chùa → lỗi');
    // kéo chùa (chưa đặt) vào khối trống → mặc định cả khối chừa góc
    const r = CL.lotInfo(blk[0], blk[1], 'B');
    const t = B.dropTarget({ places: pd, map }, { id: 'moi', kind: 'service', look: 'pagodaCourtyard' }, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
    assert.ok(CL.cutCell(t.lot) && t.ok, `${t.lot} ${t.why}`);
  });
  test('Dựng chùa tứ hợp viện (chừa góc trái / phải / không chừa) và quán trà: đi được trong sân', () => {
    for (const cut of ['FR', 'FL', null]) {
      const b = buildPlace({ look: 'pagodaCourtyard', W: 33.6, D: 33.6, seed: 4, sign: 'CHÙA', color: '#e2b85c', cut });
      assert.ok(Array.isArray(b.colliders), 'sân đi bộ được (không chắn kín)');
      const area = b.colliders.reduce((s, c) => s + (c.x1 - c.x0) * (c.z1 - c.z0), 0);
      assert.ok(area < 33.6 * 33.6 * 0.6, `cut ${cut}: vật cản phủ quá nhiều`);
      if (cut) {
        // không có vật cản nào lấn vào ô góc chừa (để quán bên cạnh đứng được)
        const s = cut === 'FL' ? -1 : 1, x0 = s > 0 ? 33.6 / 2 - 11.2 : -33.6 / 2, x1 = x0 + 11.2;
        assert.ok(!b.colliders.some((c) => c.x1 > x0 + 0.5 && c.x0 < x1 - 0.5 && c.z1 > -11.2 + 0.5 && c.z0 < -0.5), `cut ${cut}: vật cản lấn vào góc chừa`);
      }
    }
    const t = buildPlace({ look: 'teahouse', W: 10.8, D: 10.8, seed: 1, sign: 'TRÀ' });
    assert.ok(Array.isArray(t.colliders) && t.colliders.length >= 1);
  });
}

console.log('Ô giữa khối (M) cho cảnh quan');
{
  const CL = await import('../src/sim/cityLayout.js');
  const { validatePlaces } = await import('../src/data/validate.js');
  const B = await import('../src/devtools/editor/buildRules.js');
  const rd = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  test('Ô giữa khối: đúng ô giữa, quay 4 hướng; chỉ cảnh quan đặt được; kéo cảnh quan vào giữa khối → M', () => {
    const r = CL.lotInfo(2, 2, 'M'), b = CL.blockBounds(2, 2), w = CL.LOT_W;
    assert.ok(Math.abs(r.x0 - (b.x0 + CL.CITY.SW + w)) < 1e-6 && Math.abs(r.x1 - (b.x0 + CL.CITY.SW + 2 * w)) < 1e-6);
    assert.deepEqual(CL.lotFaces('M'), ['N', 'E', 'S', 'W']);
    const pd = rd('src/data/places.json'), items = rd('src/data/items.json'), map = rd('src/data/map.json');
    const used = new Set(pd.places.filter((p) => p.block).map((p) => p.block.join(',')));
    used.add(pd.alley.block.join(','));
    for (const [x, z, s] of map.joins || []) used.add(s === 'E' ? `${x + 1},${z}` : `${x},${z + 1}`); // khối thứ 2 của lô gộp
    let blk = null;
    for (let z = 0; z < CL.CITY.N && !blk; z++) for (let x = 0; x < CL.CITY.N && !blk; x++) if (!used.has(`${x},${z}`) && !CL.blockPlan(x, z, map)) blk = [x, z];
    const cv = { id: 'cvGiua', name: 'CV', short: 'CV', kind: 'scenery', look: 'park', color: '#5f9e45', block: blk, lot: 'M' };
    const errs = (p) => validatePlaces({ ...pd, places: [...pd.places, p] }, items, null, null, map).filter((i) => i.ref === p.id && i.level === 'error');
    assert.deepEqual(errs(cv), []);
    assert.ok(errs({ ...cv, kind: 'service', look: 'tube', sign: 'X', npc: { name: 'A' } }).some((i) => i.field === 'lot'), 'quán vào ô giữa → lỗi');
    const m = CL.lotInfo(blk[0], blk[1], 'M');
    const t = B.dropTarget({ places: pd, map }, { id: 'cv2', kind: 'scenery' }, (m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2);
    assert.equal(t.lot, 'M');
    assert.ok(t.ok, t.why);
    const q = B.dropTarget({ places: pd, map }, { id: 'q', kind: 'restaurant' }, (m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2);
    assert.notEqual(q.lot, 'M', 'quán không bao giờ được gợi ý ô giữa');
  });
}

console.log('Quận (map.json → districts)');
{
  const CL = await import('../src/sim/cityLayout.js');
  const { validateMap } = await import('../src/data/validate.js');
  const rd = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  test('Quận của khối / của một điểm; bộ kiểm tra bắt tên trống, màu sai, khối ngoài bản đồ, quận không có', () => {
    const map = { size: 4, districts: { q1: { name: 'Quận 1', color: '#ff0000' } }, districtBlocks: { '1,1': 'q1' } };
    assert.equal(CL.districtAt(1, 1, map).name, 'Quận 1');
    assert.equal(CL.districtAt(0, 0, map), null);
    const b = CL.blockBounds(1, 1);
    assert.equal(CL.districtAtPoint((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, map)?.id, 'q1');
    const real = rd('src/data/map.json');
    assert.ok(!validateMap(real, rd('src/data/places.json')).some((i) => i.level === 'error' && String(i.ref).startsWith('district:')), 'dữ liệu quận hiện tại hợp lệ');
    const bad = JSON.parse(JSON.stringify(real));
    bad.districts.xx = { name: ' ', color: 'đỏ' };
    bad.districtBlocks[`${real.size},0`] = 'q1';
    bad.districtBlocks['0,0'] = 'khongCo';
    const f = validateMap(bad, rd('src/data/places.json')).filter((i) => i.level === 'error').map((i) => `${i.ref}.${i.field}`);
    for (const k of ['district:xx.name', 'district:xx.color', 'district:q1.blocks', 'district:khongCo.blocks']) assert.ok(f.includes(k), `không bắt lỗi ${k}`);
  });
}

console.log('Tính cách khu phố (hệ số theo khu)');
{
  const DT = await import('../src/data/districtTraits.js');
  const CL = await import('../src/sim/cityLayout.js');
  const { HazardManager } = await import('../src/sim/hazards.js');
  const PK = await import('../src/sim/parking.js');
  const { MAP } = await import('../src/data/map.js');
  test('Hệ số khu: thiếu / sai → 1; mẫu khu đủ mọi thông số trong khoảng cho phép', () => {
    assert.equal(DT.traitOf(null, 'tips'), 1);
    assert.equal(DT.traitOf({ tips: -2 }, 'tips'), 1);
    assert.equal(DT.traitOf({ tips: 1.6 }, 'tips'), 1.6);
    for (const p of Object.values(DT.DISTRICT_PRESETS)) for (const k of DT.TRAIT_IDS) assert.ok(p[k] >= DT.TRAIT_RANGE[0] && p[k] <= DT.TRAIT_RANGE[1], `${p.label}.${k}`);
  });
  test('Khách đặt đơn theo khu: khu hệ số 0 không bao giờ là điểm giao; khu cao được chọn nhiều hơn', () => {
    const ids = Object.keys(MAP.districts || {});
    if (ids.length < 2) return;
    const saved = JSON.parse(JSON.stringify(MAP.districts));
    const [zero, hi] = ids;
    MAP.districts[zero].orders = 0;
    MAP.districts[hi].orders = 5;
    try {
      const { om } = mkOM(3);
      om.now = 600; // ban ngày
      const cnt = { zero: 0, hi: 0 };
      for (let i = 0; i < 400; i++) {
        const l = om.pickLotAround({ x: 0, z: 0 }, 0, 9999);
        const d = CL.districtAtPoint(l.door.x, l.door.z)?.id;
        if (d === zero) cnt.zero++;
        if (d === hi) cnt.hi++;
      }
      assert.equal(cnt.zero, 0);
      assert.ok(cnt.hi > 20, `khu hệ số 5 chỉ được ${cnt.hi} lần`);
    } finally { for (const id of ids) MAP.districts[id] = saved[id]; }
  });
  test('Ổ gà dồn về khu xóc; rủi ro đậu xe nhân theo khu', () => {
    const ids = Object.keys(MAP.districts || {});
    if (!ids.length) return;
    const saved = JSON.parse(JSON.stringify(MAP.districts));
    for (const id of ids) MAP.districts[id].potholes = id === ids[0] ? 5 : 0;
    try {
      const h = new HazardManager(makeRng(9), 1);
      const own = h.potholes.filter((p) => CL.districtAtPoint(p.x, p.z)?.id === ids[0]).length;
      assert.ok(h.potholes.length > 0 && own / h.potholes.length > 0.6, `chỉ ${own}/${h.potholes.length} ổ gà ở khu xóc`);
    } finally { for (const id of ids) MAP.districts[id] = saved[id]; }
    // dán phạt: hệ số 0 → không bao giờ; hệ số cao → nhiều hơn
    const always = { next: () => 0.0001 };
    const p = { since: 600, safe: false, ticketed: false, robbed: false };
    assert.equal(PK.parkingRoll(always, 700, p, { canTow: false, towMul: 0 }), null);
    assert.equal(PK.parkingRoll(always, 700, p, { canTow: false, towMul: 2 }), 'ticket');
  });
}

console.log('Nhà dân & trang trí theo khu phố');
{
  const THREE = await import('three');
  const DT = await import('../src/data/districtTraits.js');
  const { buildResidential, mergeKits, RES_STYLES } = await import('../src/world/placeBuildings.js');
  const { validateMap } = await import('../src/data/validate.js');
  const rd = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  test('Mọi kiểu nhà dân dựng được, nằm trong lô; gộp cả loạt còn vài khối vẽ', () => {
    // số khối = số vật liệu + số biển chữ khác nhau (có hạn), không tăng theo số căn
    for (const [k] of DT.HOUSE_STYLES) if (k !== 'tube') assert.ok(RES_STYLES.includes(k), `thiếu kiểu nhà ${k}`);
    const entries = [];
    for (const style of RES_STYLES) {
      for (const [W, D] of [[5.2, 5.2], [10.8, 10.8]]) {
        for (const seed of [1, 7, 99]) {
          const { kit, height } = buildResidential(style, { W, D }, seed);
          const g = new THREE.Group();
          mergeKits([{ kit, matrix: new THREE.Matrix4() }], g);
          const box = new THREE.Box3().setFromObject(g);
          const where = `${style} ${W}×${D} #${seed}`;
          assert.ok(box.min.z >= -D - 0.3 && box.max.z <= 1.3, `${where}: z ${box.min.z.toFixed(2)}…${box.max.z.toFixed(2)}`);
          assert.ok(box.min.x >= -W / 2 - 0.3 && box.max.x <= W / 2 + 0.3, `${where}: x ${box.min.x.toFixed(2)}…${box.max.x.toFixed(2)}`);
          assert.ok(height > 0 && height >= box.max.y - 0.5, `${where}: cao ${height} < ${box.max.y.toFixed(1)}`);
          entries.push({ kit, matrix: new THREE.Matrix4().makeTranslation(entries.length * 12, 0, 0) });
        }
      }
    }
    const all = new THREE.Group();
    mergeKits(entries, all);
    assert.ok(all.children.length <= 30, `${entries.length} căn gộp còn ${all.children.length} khối`);
  });
  test('Chọn kiểu nhà: không đặt → nhà ống; trong hẻm chỉ kiểu nhỏ; kiểu chủ đạo của khối chiếm đa số', () => {
    const rng = makeRng(3);
    assert.equal(DT.pickHouseStyle(null, rng), 'tube');
    assert.equal(DT.pickHouseStyle({ houses: { tower: 0 } }, rng), 'tube');
    for (let i = 0; i < 200; i++) assert.ok(DT.ALLEY_STYLES.includes(DT.pickHouseStyle({ houses: { tower: 1, villa: 1, japanese: 0.1 } }, rng, true, 'tower')));
    let same = 0;
    for (let i = 0; i < 400; i++) same += DT.pickHouseStyle({ houses: { chinese: 0.5, tube: 0.5 } }, rng, false, 'chinese') === 'chinese';
    assert.ok(same > 300, `kiểu chủ đạo chỉ ${same}/400`);
    assert.equal(DT.treesOf({ trees: 9 }), 2);
    assert.equal(DT.treesOf({}), 1);
    for (const [id, L] of Object.entries(DT.LOOK_PRESETS)) {
      assert.ok(DT.DISTRICT_PRESETS[id], `mẫu nhà ${id} không có mẫu khu tương ứng`);
      for (const k of Object.keys(L.houses)) assert.ok(DT.HOUSE_STYLE_IDS.includes(k), `${id}: kiểu ${k}`);
      for (const k of Object.keys(L.decor)) assert.ok(DT.DECOR_IDS.includes(k), `${id}: trang trí ${k}`);
    }
  });
  test('Bộ kiểm tra bắt kiểu nhà lạ, tỉ lệ âm, trang trí lạ, cây ngoài khoảng', () => {
    const bad = rd('src/data/map.json');
    bad.districts = { xx: { name: 'X', houses: { lauDai: 1, tin: -1 }, decor: { phaoHoa: true }, trees: 7 } };
    bad.districtBlocks = {};
    const f = validateMap(bad, rd('src/data/places.json')).filter((i) => i.level === 'error').map((i) => `${i.ref}.${i.field}`);
    for (const k of ['district:xx.houses', 'district:xx.decor', 'district:xx.trees']) assert.ok(f.includes(k), `không bắt lỗi ${k}`);
    assert.equal(f.filter((x) => x === 'district:xx.houses').length, 2);
  });
}

console.log(`\n${pass} đạt, ${fail} lỗi`);
if (fail) process.exit(1);
