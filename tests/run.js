// Bộ thử tự động cho phần mô phỏng thuần. Chạy: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS as DATA_ITEMS } from '../src/data/items.js';
import { ECONOMY, TIME, ENERGY, HAZARD as HAZARD_DATA, rentFor, VEHICLES as VEHICLES_T, WALLET_QUEST, BAGS } from '../src/data/balance.js';
import { BRANDS as BRANDS_T } from '../src/data/apps.js';
import { DeliveryItem } from '../src/sim/ItemPhysics.js';
import { evaluateOrder } from '../src/sim/OrderCondition.js';
import { computePayout } from '../src/sim/economy.js';
import { OrderManager, S, TRANSITIONS } from '../src/sim/OrderManager.js';
import { GameState } from '../src/sim/GameState.js';
import { HazardManager } from '../src/sim/hazards.js';
import { makeRng } from '../src/sim/rng.js';
import * as PE from '../src/sim/people.js';
import { splitPages } from '../src/ui/modal.js';
import { buildLayout, blockAt, HALF } from '../src/sim/cityLayout.js';
import * as CITYLAYOUT from '../src/sim/cityLayout.js';
import { objectives, ORDERS_GOAL } from '../src/sim/objectives.js';
import { ranges } from '../src/sim/hours.js';
import { dayOf, dayStartAt, atHour, fmtClock, minutesUntil } from '../src/sim/clock.js';
import { isOpen } from '../src/sim/placeRules.js';
import * as PLACE_RULES from '../src/sim/placeRules.js';
import * as CONTENT from '../src/content/index.js';
import * as SETTINGS_MOD from '../src/settings.js';

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
const DATA = { items: readJson('src/data/items.json'), apps: readJson('src/data/apps.json'), places: readJson('src/data/places.json'), gear: readJson('src/data/gear.json'), itemsCod: (id) => DATA.items[id].cod };
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
  assert.ok(a.condition < 70 && b.condition > a.condition); // va chạm mạnh (2) × 16,8 ≈ −34
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
  assert.ok(a.condition < 90 && b.condition === 100); // 4 m/s quá mức × 0,36%/phút × 10 phút ≈ −14
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
// Người chơi đã vào GoShip, đang chạy Cub đầy xăng (bộ thử luật đơn hàng; người chơi mới thì đi xe đạp, chưa có đơn)
// Bản lưu mẫu của tài xế đã ở hãng (đã nhận quà vào hãng từ trước: gifted = hãng → không được tặng bù nón / mũ)
function workerState({ day = 1, carry = {} } = {}) {
  const c = { brand: 'goship', vehicle: 'cub', owned: { vehicles: ['xeDap', 'cub'], bags: ['nylon'], gear: [] }, vstate: { cub: { fuel: 3, hp: 100, maintKm: 0 } }, ...carry };
  if (!('gifted' in c)) c.gifted = c.brand;
  return new GameState({ day, carry: c });
}
// ngày mà mọi món đã có đơn (món có "mở từ ngày" do người dùng đặt trong ?editor) — cho bài thử dùng món cụ thể
const DAY_ALL = Math.max(1, ...Object.values(DATA_ITEMS).map((it) => (Number.isInteger(it.openDay) ? it.openDay : 1)));
function mkOM(seed = 1, gsOpts = {}) {
  const gs = workerState(gsOpts);
  const om = new OrderManager({ rng: makeRng(seed), layout, gs });
  return { gs, om };
}
test('Giao chung cư: tầng giao nằm trong số tầng chung cư (đặt trong editor)', () => {
  const apt = layout.placeById.apartment, old = apt.floors;
  try {
    for (const [fl, lo, hi] of [[12, 3, 11], [5, 3, 4], [3, 2, 2]]) {
      apt.floors = fl;
      const om = new OrderManager({ rng: makeRng(fl), layout, gs: workerState() });
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
  // túi giữ nhiệt: túi rẻ nhất giữ nhiệt ≥ 50% (mã túi do người dùng đặt trong ?editor)
  const thermal = Object.values(BAGS).filter((b) => b.insulation >= 0.5).sort((a, b) => a.price - b.price)[0];
  if (!thermal) return; // dữ liệu không còn túi giữ nhiệt
  assert.ok(gs.buy('bags', thermal.id).ok, `không mua được túi ${thermal.id}`);
  // chọn giờ quán có món lạnh đang mở (giờ mở cửa do người dùng chỉnh trong ?editor)
  const coldShop = om.layout.places.find((p) => (p.menu || []).some((id) => DATA_ITEMS[id]?.traits.includes('cold')));
  if (!coldShop) return; // dữ liệu không còn quán nào bán món lạnh
  const open1 = ranges(coldShop.hours); // khung giờ có thể là mẫu / nhiều đoạn
  const t = open1 ? open1[0][0] * 60 + 30 : 480;
  let sawCold = false;
  for (let i = 0; i < 200 && !sawCold; i++) if (om.makeOffer(t, { x: 0, z: 0 }).itemIds.some((id) => DATA_ITEMS[id].traits.includes('cold'))) sawCold = true;
  assert.ok(sawCold, `không thấy đơn món lạnh lúc ${t / 60}h từ ${coldShop.id}`);
});
test('Có nón chở khách + giao xong vài đơn → đơn chở anh Minh; từ chối thì một lúc sau mới mời lại, ở giữa có đơn thường', () => {
  const { om, gs } = mkOM(9, { carry: { money: 500 } });
  gs.buy('goods', 'spareHelmet');
  const need = WALLET_QUEST.minOrders ?? 3, wait = WALLET_QUEST.retryMin ?? 60;
  gs.account.completed = need - 1;
  for (let i = 0; i < 20; i++) assert.notEqual(om.makeOffer(480, { x: 0, z: 0 })?.story, 'wallet', 'chưa đủ số đơn thì chưa có chuyến anh Minh');
  gs.account.completed = need;
  const o = om.makeOffer(480, { x: 0, z: 0 });
  assert.equal(o.kind, 'ride');
  assert.equal(o.story, 'wallet');
  om.goOnline();
  om.offer = o;
  om.go(S.OFFERED);
  om.decline(480);
  assert.equal(gs.flags.walletRetryAt, 480 + wait);
  for (let i = 0; i < 20; i++) assert.notEqual(om.makeOffer(480 + wait - 1, { x: 0, z: 0 })?.story, 'wallet', 'vừa từ chối: có đơn thường');
  assert.equal(om.makeOffer(480 + wait, { x: 0, z: 0 }).story, 'wallet', 'hết thời gian chờ thì mời lại');
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
test('Đổ xăng trừ tiền đúng giá; xe điện / xe đạp không đổ xăng', () => {
  const gs = workerState({ carry: { vstate: { cub: { fuel: 0.35, hp: 100, maintKm: 0 } } } });
  const m = gs.money;
  const r = gs.refuel();
  assert.ok(r.ok);
  assert.ok(Math.abs(m - gs.money - r.liters * ECONOMY.fuelPrice) < 0.1);
  assert.ok(!new GameState().refuel().ok, 'xe đạp không đổ xăng');
  assert.ok(!workerState({ carry: { brand: 'hongsm', vehicle: 'evStd', owned: { vehicles: ['xeDap', 'evStd'], bags: ['nylon'], gear: [] }, vstate: {} } }).refuel().ok, 'xe điện không đổ xăng');
});
test('Mục tiêu: mở đầu từng bước; ngày 1 đổ xăng → đơn đầu tiên → giao 10 đơn; luôn có tiền nhà', () => {
  // mở đầu: chỉ hiện bước đang làm — tìm nhà trọ gặp Cô Hai → leo lên xe đạp → đăng ký hãng
  const gs0 = new GameState();
  gs0.story.ch = null; // không theo cốt truyện (mục tiêu cốt truyện thử ở phần "Cốt truyện")
  assert.deepEqual(objectives(gs0).map((o) => o.id), ['findHome'], 'mới vào: tìm nhà trọ');
  gs0.flags.story = 1;
  assert.deepEqual(objectives(gs0).map((o) => o.id), ['mountBike', 'rent'], 'Cô Hai cho xe: leo lên xe đạp (+ tiền nhà)');
  gs0.flags.story = 2;
  assert.deepEqual(objectives(gs0).map((o) => o.id), ['brand', 'rent'], 'đã lên xe: đăng ký hãng');
  assert.deepEqual(objectives(new GameState({ day: 5, carry: { money: 10 } })).map((o) => o.id), ['brand', 'rent'], 'bản lưu cũ chưa có hãng: bỏ qua mở đầu');
  assert.equal(new GameState({ day: 2, carry: new GameState({ carry: { flags: { story: 1 } } }).carryOver() }).flags.story, 1, 'bước mở đầu được lưu');
  // ngày 1 đi lần lượt: chưa đổ xăng → chỉ "đổ xăng"; đổ rồi → "đơn đầu tiên"; giao xong đơn đầu → hiện "giao 10 đơn"
  const w1 = workerState(), ids = () => objectives(w1).map((o) => o.id);
  assert.deepEqual(ids(), ['fuel', 'rent']);
  w1.flags.refueled = true;
  assert.deepEqual(ids(), ['first', 'rent']);
  w1.stats.completed = 1;
  assert.deepEqual(ids(), ['first', 'orders', 'rent']);
  assert.ok(objectives(w1)[0].done && !objectives(w1)[1].done);
  w1.stats.completed = ORDERS_GOAL;
  assert.ok(objectives(w1)[1].done, `đủ ${ORDERS_GOAL} đơn`);
  assert.equal(ORDERS_GOAL, 10);
  // không còn túi giữ nhiệt / mũ khách / ví anh Minh trong danh sách
  assert.ok(!objectives(w1).some((o) => ['thermal', 'helmet', 'wallet', 'online'].includes(o.id)));
  assert.deepEqual(objectives(workerState({ day: 2 })).map((o) => o.id), ['orders', 'rent'], 'ngày 2: tạm chỉ giao 10 đơn + tiền nhà');
});

test('Hội thoại nhiều trang: [tiếp] chia trang, bỏ trang trống; lời Cô Hai + "Đã tới Sài Gòn" có nhiều trang', () => {
  assert.deepEqual(splitPages('Một [tiếp] Hai\n[TIẾP]\nBa'), ['Một', 'Hai', 'Ba']);
  assert.deepEqual(splitPages('Không ngắt'), ['Không ngắt']);
  assert.deepEqual(splitPages('A [tiếp] [tiếp] B [tiếp]'), ['A', 'B']);
  for (const k of ['dlg.arriveText', 'dlg.landlordIntro']) assert.ok(splitPages(CONTENT.fmt(k, {})).length >= 2, k);
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
    GOODS.__rc = { id: '__rc', name: 'r', price: 1, type: 'equipment', effects: { rainProtect: true } };
    const gs = new GameState({ carry: { money: 1000, gifted: 'goship', owned: { vehicles: ['cub'], bags: ['nylon'], gear: ['__rc'] } } });
    assert.equal(gs.effect('rainProtect'), true);
    assert.equal(gs.effect('passengerSeat'), false);
    delete GOODS.__rc;
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
    const gs = workerState({ carry: { money: 100, vstate: { cub: { fuel: 0.3, hp: 100, maintKm: 0 } } } });
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
    assert.ok(night >= 5, `buổi tối chỉ ${night}/300`); // (càng nhiều địa điểm buổi tối thì tỉ lệ karaoke càng giảm — chỉ cần có)
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
  test('Đơn cốt truyện (forced): giao trễ bao lâu cũng không trừ sao — luôn 5★; đơn thường trễ vẫn bị trừ', () => {
    const run = (forced) => {
      const { om } = mkOM(11, { carry: { money: 500, flags: { wallet: 5 } } });
      om.goOnline();
      om.offer = om.makeRide({ x: 0, z: 0 }, false, 600);
      if (forced) om.offer.forced = true;
      om.go(S.OFFERED);
      om.accept(600);
      assert.ok(om.boardPassenger(600));
      assert.equal(om.arriveAtDropoff(600 + om.order.allowedMin * 3), 'ready');
      return om.handOver(600 + om.order.allowedMin * 3 + 1);
    };
    assert.equal(run(true).ev.stars, 5, 'đơn cốt truyện trễ gấp 3 vẫn 5★');
    assert.ok(run(false).ev.stars < 5, 'đơn thường trễ thì bị trừ');
  });
  test('Đơn cốt truyện chở hàng "chấm thật" (strict): giao trễ bị trừ sao như đơn thường; không strict thì 5★', () => {
    const run = (strict) => {
      const { om } = mkOM(11, { carry: { money: 500, flags: { wallet: 5 } } });
      om.goOnline();
      const o = om.storyParcel({ place: 'benXeBuyt', item: 'thuocBaNam', customer: 'Bà Năm', strict }, { x: 0, z: 0 }, 600);
      assert.ok(o && o.forced && o.customer === 'Bà Năm' && o.itemIds[0] === 'thuocBaNam' && o.pickup.placeId === 'benXeBuyt');
      assert.ok(om.forceOffer(o));
      om.accept(600);
      om.order.flags.picky = false;
      const t = 600 + om.order.allowedMin * 3;
      om.go(S.DELIVERING);
      assert.equal(om.arriveAtDropoff(t), 'ready');
      return om.handOver(t + 1);
    };
    assert.ok(run(true).ev.stars < 5, 'chấm thật: trễ bị trừ');
    assert.equal(run(false).ev.stars, 5, 'không chấm thật: 5★');
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
  test('Phụ kiện: mua rồi phải gắn mới có tác dụng; 1 ô chỉ 1 món (áo mưa HOẶC áo khoác); tháo được, áo thì không; mặc áo mưa trời khô thì nóng', () => {
    const { outfitLook } = goodsMod;
    GOODS.__mua = { id: '__mua', name: 'Áo mưa test', price: 5, type: 'outfit', slot: 'acc', style: 'raincoat', color: '#2e86c1', effects: { rainProtect: true } };
    GOODS.__khoac = { id: '__khoac', name: 'Áo khoác test', price: 5, type: 'outfit', slot: 'acc', style: 'jacket', color: '#5d6d7e', effects: { sunProtect: true } };
    const gs = new GameState({ carry: { money: 100 } });
    assert.equal(gs.wornIds().acc, undefined, 'ban đầu không đeo phụ kiện');
    assert.ok(gs.buy('goods', '__mua').ok && gs.buy('goods', '__khoac').ok);
    assert.equal(gs.effect('rainProtect'), false, 'mua rồi chưa gắn → chưa chống mưa');
    assert.ok(gs.wear('__mua'));
    assert.equal(gs.effect('rainProtect'), true);
    assert.equal(outfitLook(gs.wornGoods()).overlay, 'raincoat');
    assert.ok(gs.wear('__khoac'));
    assert.equal(gs.effect('rainProtect'), false, 'gắn áo khoác thì áo mưa bị thay ra');
    assert.equal(gs.effect('sunProtect'), true);
    assert.equal(outfitLook(gs.wornGoods()).overlay, 'jacket');
    assert.ok(gs.takeOff('acc'));
    assert.equal(gs.wornIds().acc, undefined);
    assert.equal(outfitLook(gs.wornGoods()).overlay, undefined);
    assert.ok(!gs.takeOff('shirt'), 'áo chỉ thay chứ không tháo');
    // nóng: cùng 1 giờ ban ngày trời khô, có gắn áo mưa mệt hơn
    const hot = (s) => { s.phys = 100; s.drain('idle', 60, { outdoor: true, raining: false, harshSun: false, now: atHour(1, 10) }); return 100 - s.phys; };
    gs.wear('__mua');
    const plain = new GameState({ carry: { money: 0 } });
    assert.ok(hot(gs) > hot(plain) + 0.5, `${hot(gs)} vs ${hot(plain)}`);
    gs.takeOff('acc');
    assert.equal(new GameState({ day: 2, carry: gs.carryOver() }).wornIds().acc, undefined, 'đã tháo thì lưu là đang tháo');
    delete GOODS.__mua;
    delete GOODS.__khoac;
  });
  test('Bản lưu cũ: giày từng là trang bị đã mua → tự mang vào, vẫn có tác dụng; mọi chỗ mặc đều có chữ', () => {
    const { outfitLook, OUTFIT_SLOTS } = goodsMod;
    GOODS.__giay = { id: '__giay', name: 'Giày test', price: 10, type: 'outfit', slot: 'shoes', style: 'sandal', color: '#ffffff', effects: { stairsPct: -30 } };
    const gs = new GameState({ day: 3, carry: { money: 0, owned: { vehicles: ['cub'], bags: ['nylon'], gear: ['__giay'] }, outfit: {} } });
    assert.equal(gs.wornIds().shoes, '__giay');
    assert.equal(gs.effect('stairsPct'), -30);
    const look = outfitLook(gs.wornGoods());
    assert.equal(look.shoe, 0xffffff);
    assert.equal(look.shoeStyle, 'sandal');
    for (const slot of Object.keys(OUTFIT_SLOTS)) assert.ok(CONTENT.has(`outfit.slot.${slot}`), slot);
    delete GOODS.__giay;
  });
  test('Nhớt (xe xăng): quá hạn thì hao xăng thêm + xe xuống cấp theo km chạy quá; thay ở tiệm trừ tiền, về đầy; lưu qua ngày', () => {
    const gs = workerState({ carry: { money: 1000 } });
    const I = gs.maintIntervalKm;
    gs.addKm(I - 1);
    assert.ok(!gs.maintOverdue && gs.maintFuelMul() === 1 && gs.bikeHp === 100);
    gs.addKm(3);
    assert.ok(gs.maintOverdue && gs.maintFuelMul() > 1);
    assert.ok(Math.abs(gs.bikeHp - (100 - 2 * ECONOMY.oilHpPerKm)) < 1e-9, `chỉ trừ phần chạy quá hạn: ${gs.bikeHp}`);
    assert.ok(Math.abs(gs.odoKm - (I + 2)) < 1e-9);
    const next = new GameState({ day: 2, carry: gs.carryOver() });
    assert.ok(Math.abs(next.maintKm - gs.maintKm) < 1e-9 && Math.abs(next.odoKm - gs.odoKm) < 1e-9);
    const money = gs.money;
    const r = gs.changeOil();
    assert.ok(r.ok && r.minutes > 0);
    assert.equal(gs.money, money - ECONOMY.oilCost);
    assert.equal(gs.stats.expense.oil, ECONOMY.oilCost);
    assert.equal(gs.maintKm, 0);
    assert.ok(Math.abs(gs.odoKm - (I + 2)) < 1e-9, 'thay nhớt không xóa đồng hồ km');
    assert.ok(!gs.changeOil().ok, 'vừa thay thì chưa cần thay');
    const poor = workerState({ carry: { money: 0 } });
    poor.addKm(5);
    assert.ok(!poor.changeOil().ok, 'không đủ tiền');
  });
  test('Khởi đầu bằng xe đạp: không xăng, không bảo dưỡng, chưa vào hãng thì không có đơn; mục tiêu nhắc vào hãng', () => {
    const gs = new GameState();
    assert.equal(gs.vehicle, 'xeDap');
    assert.equal(gs.power, 'pedal');
    assert.equal(gs.workBlock(), 'noBrand');
    assert.equal(gs.maintIntervalKm, Infinity);
    gs.addKm(500);
    assert.equal(gs.bikeHp, 100, 'xe đạp không xuống cấp vì quá hạn bảo dưỡng');
    gs.story.ch = null; // không theo cốt truyện
    assert.deepEqual(objectives(gs).map((o) => o.id), ['findHome'], 'mới vào game: đi tìm nhà trọ trước');
    const om = new OrderManager({ rng: makeRng(2), layout, gs });
    om.goOnline();
    for (let i = 0; i < 300; i++) om.update(1, 0, 600, { x: 0, z: 0 });
    assert.notEqual(om.state, S.OFFERED, 'chưa vào hãng → không có đơn');
  });
  test('Vào hãng: đặt cọc, nhận xe hãng; đi sai loại xe thì không có đơn; đổi hãng = trả xe, hoàn cọc, cày lại từ đầu', () => {
    const gs = new GameState({ carry: { money: 300 } });
    const gsh = BRANDS_T.goship, hsm = BRANDS_T.hongsm;
    assert.ok(gs.joinBrand('goship').ok);
    assert.equal(gs.money, 300 - gsh.deposit);
    assert.equal(gs.stats.expense.deposit, gsh.deposit);
    assert.equal(gs.vehicle, gsh.vehicle);
    assert.equal(gs.companyVehicle, gsh.vehicle);
    assert.equal(gs.workBlock(), null);
    assert.ok(!gs.joinBrand('goship').ok, 'đã ở hãng này');
    gs.vehicle = 'xeDap';
    assert.equal(gs.workBlock(), 'wrongVehicle', 'GoShip mà đạp xe đạp → không có đơn');
    gs.vehicle = gsh.vehicle;
    for (let i = 0; i < 5; i++) gs.ratingBook.add(1);
    gs.account.completed = 30;
    const before = gs.money;
    const r = gs.joinBrand('hongsm');
    assert.ok(r.ok && r.switched);
    assert.equal(gs.money, before + gsh.deposit - hsm.deposit, 'hoàn cọc cũ, đặt cọc mới');
    assert.ok(!gs.owned.vehicles.includes(gsh.vehicle), 'trả xe hãng cũ');
    assert.equal(gs.vehicle, hsm.vehicle);
    assert.equal(gs.power, 'electric');
    assert.equal(gs.account.completed, 0, 'cày lại từ đầu');
    assert.ok(Math.abs(gs.rating - new GameState().rating) < 1e-9, 'điểm đánh giá về như người mới');
    const next = new GameState({ day: 2, carry: gs.carryOver() });
    assert.deepEqual([next.brand, next.companyVehicle, next.depositPaid, next.vehicle], ['hongsm', hsm.vehicle, hsm.deposit, hsm.vehicle]);
    assert.ok(!new GameState({ carry: { money: 10 } }).joinBrand('goship').ok, 'thiếu tiền cọc');
  });
  test('Xe điện: sạc ở trụ (rẻ, lâu), đổi pin ở trạm (đầy pin + bảo dưỡng); không thay nhớt; mỗi xe giữ xăng / pin riêng', () => {
    const gs = new GameState({ carry: { money: 500 } });
    gs.joinBrand('hongsm');
    const tank = gs.vehicleSpec.tank;
    assert.ok(gs.fuel < tank);
    const m = gs.money;
    const c = gs.charge();
    assert.ok(c.ok && c.minutes >= 5);
    assert.ok(Math.abs(gs.fuel - tank) < 1e-9);
    assert.ok(Math.abs(m - gs.money - c.kwh * ECONOMY.elecPrice) < 0.1);
    assert.ok(!gs.charge().ok, 'pin đầy');
    assert.ok(!gs.changeOil().ok, 'xe điện không thay nhớt');
    gs.addKm(gs.maintIntervalKm + 4);
    gs.fuel = 0.1;
    assert.ok(gs.maintOverdue && gs.maintFuelMul() > 1);
    const s = gs.swapBattery();
    assert.ok(s.ok && s.minutes > 0);
    assert.ok(Math.abs(gs.fuel - tank) < 1e-9 && gs.maintKm === 0, 'đổi pin: đầy pin + pin mới');
    assert.equal(gs.stats.expense.swap, ECONOMY.swapCost);
    // xe khác giữ xăng / pin riêng
    gs.vehicle = 'xeDap';
    assert.equal(gs.power, 'pedal');
    gs.vehicle = BRANDS_T.hongsm.vehicle;
    assert.ok(Math.abs(gs.fuel - tank) < 1e-9);
  });
  test('Bán xe cũ: được 50% giá xe mới; xe đạp khởi đầu và xe hãng không bán được; bán xe đang chạy → về xe hãng / xe đạp', () => {
    const gs = new GameState({ carry: { money: 5000 } });
    gs.joinBrand('goship');
    const id = Object.keys(VEHICLES_T).find((k) => VEHICLES_T[k].price > 0 && VEHICLES_T[k].power === 'gas');
    assert.ok(gs.buy('vehicles', id).ok);
    assert.equal(gs.vehicle, id);
    assert.ok(!gs.canSell('xeDap') && !gs.canSell(BRANDS_T.goship.vehicle));
    const m = gs.money;
    const r = gs.sellVehicle(id);
    assert.ok(r.ok);
    assert.equal(gs.money - m, Math.round(VEHICLES_T[id].price * ECONOMY.sellPct));
    assert.ok(!gs.owned.vehicles.includes(id));
    assert.equal(gs.vehicle, BRANDS_T.goship.vehicle, 'bán xe đang chạy → về xe hãng');
    assert.ok(!gs.sellVehicle(id).ok);
  });
  test('Đồng phục: vào hãng được cấp + mặc sẵn, lưu chữ ký hợp đồng; cởi ra thì không nhận đơn; đổi hãng thì trả áo cũ, nhận áo mới', () => {
    const { outfitLook } = goodsMod;
    const gs = new GameState({ carry: { money: 500 } });
    assert.ok(gs.joinBrand('goship', 'data:image/png;base64,KY', 600).ok);
    const u1 = Object.values(GOODS).find((g) => g.slot === 'uniform' && g.brand === 'goship');
    assert.ok(u1 && gs.ownsOutfit(u1.id) && gs.wornIds().uniform === u1.id && gs.workBlock() === null);
    assert.deepEqual(gs.contracts.goship, { sig: 'data:image/png;base64,KY', day: 1, at: 600 });
    assert.equal(outfitLook(gs.wornGoods()).uniform, parseInt(u1.color.slice(1), 16), 'áo khoác màu hãng');
    assert.ok(gs.takeOff('uniform'));
    assert.equal(gs.workBlock(), 'noUniform', 'cởi đồng phục → không nhận đơn');
    const next = new GameState({ day: 2, carry: gs.carryOver() });
    assert.equal(next.workBlock(), 'noUniform', 'đã tự cởi thì lưu là đang cởi (không tự mặc lại)');
    assert.ok(next.contracts.goship.sig);
    assert.ok(next.wear(u1.id) && next.workBlock() === null);
    assert.ok(next.joinBrand('hongsm').ok);
    const u2 = Object.values(GOODS).find((g) => g.slot === 'uniform' && g.brand === 'hongsm');
    assert.ok(!next.ownsOutfit(u1.id), 'trả đồng phục hãng cũ');
    assert.ok(next.wornIds().uniform === u2.id && next.workBlock() === null);
    const old = new GameState({ day: 3, carry: { money: 50, owned: { vehicles: ['cub'], bags: ['nylon'], gear: [] }, vehicle: 'cub', fuel: 1 } });
    assert.ok(old.wearingUniform(), 'bản lưu cũ đang ở GoShip: tự cấp + mặc đồng phục');
    const om = new OrderManager({ rng: makeRng(3), layout, gs: next });
    next.takeOff('uniform');
    om.goOnline();
    for (let i = 0; i < 300; i++) om.update(1, 0, 600, { x: 0, z: 0 });
    assert.notEqual(om.state, S.OFFERED, 'không mặc đồng phục → không có đơn');
  });
  test('Bộ kiểm tra: hãng thiếu đồng phục → lỗi; đồng phục bán ngoài văn phòng hãng → cảnh báo; đãi ngộ phải là danh sách chữ', () => {
    const goods = JSON.parse(JSON.stringify(readJson('src/data/goods.json')));
    assert.deepEqual(VALIDATE.validateBrands(DATA.apps, DATA.gear, DATA.places, goods).filter((i) => i.level === 'error'), []);
    for (const g of Object.values(goods)) if (g.slot === 'uniform' && g.brand === 'hongsm') delete goods[g.id];
    const apps = JSON.parse(JSON.stringify(DATA.apps));
    apps.brands.goship.perks = 'sai';
    const places = JSON.parse(JSON.stringify(DATA.places));
    const shop = places.places.find((p) => p.kind === 'shop');
    shop.sells = { ...(shop.sells || {}), goods: [...(shop.sells?.goods || []), Object.values(goods).find((g) => g.slot === 'uniform').id] };
    const iss = VALIDATE.validateBrands(apps, DATA.gear, places, goods);
    assert.ok(iss.some((i) => i.ref === 'hongsm' && i.field === 'uniform' && i.level === 'error'));
    assert.ok(iss.some((i) => i.ref === 'goship' && i.field === 'perks' && i.level === 'error'));
    assert.ok(iss.some((i) => i.ref === shop.id && i.field === 'sells' && i.level === 'warn'));
  });
  test('Bản lưu cũ (trước khi có hãng): coi như đang chạy GoShip bằng Cub, giữ xăng / độ bền / km nhớt, có thêm xe đạp', () => {
    const gs = new GameState({ day: 4, carry: { money: 200, owned: { vehicles: ['cub', 'wave'], bags: ['nylon'], gear: [] }, vehicle: 'wave', fuel: 1.2, bikeHp: 80, oilKm: 33 } });
    assert.equal(gs.brand, 'goship');
    assert.equal(gs.depositPaid, 0, 'chưa đặt cọc → đổi hãng không được hoàn tiền');
    assert.ok(gs.owned.vehicles.includes('xeDap'));
    assert.deepEqual([gs.fuel, gs.bikeHp, gs.maintKm], [1.2, 80, 33]);
    assert.equal(gs.workBlock(), null);
  });
  test('Bộ kiểm tra hãng: dữ liệu hiện tại hợp lệ; bắt xe hãng sai loại, thiếu xe, văn phòng không hãng', () => {
    assert.deepEqual(VALIDATE.validateBrands(DATA.apps, DATA.gear, DATA.places).filter((i) => i.level === 'error'), []);
    const apps = JSON.parse(JSON.stringify(DATA.apps));
    apps.brands.goship.vehicle = 'evStd';
    apps.brands.hongsm.vehicle = 'khongCo';
    const places = JSON.parse(JSON.stringify(DATA.places));
    places.places.find((p) => p.kind === 'office').brand = 'zzz';
    const iss = VALIDATE.validateBrands(apps, DATA.gear, places);
    assert.ok(iss.some((i) => i.ref === 'goship' && i.field === 'vehicle' && i.level === 'error'));
    assert.ok(iss.some((i) => i.ref === 'hongsm' && i.field === 'vehicle' && i.level === 'error'));
    assert.ok(iss.some((i) => i.tab === 'places' && i.field === 'brand'));
    for (const k of ['power.gas', 'power.electric', 'power.pedal']) assert.ok(CONTENT.has(k), k);
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
      assert.equal(r.pay.tip, Math.round(8 * tm * 10) / 10 + gs.effect('tipBonus')); // trang bị +4 (+ đồng phục hãng đang mặc, nếu có)
      assert.ok(gs.effect('tipBonus') >= 4);
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
  test('Công tắc GoShip: tắt Chở khách → không có xe ôm; tắt Giao hàng → chỉ xe ôm; tắt cả hai → app tự nghỉ', () => {
    const mk = (flags) => {
      const r = mkOM(7, { carry: { money: 2000, flags: { wallet: 5, ...flags } } });
      r.gs.buy('goods', 'spareHelmet');
      return r;
    };
    const kinds = (om) => { const s = new Set(); for (let i = 0; i < 300; i++) { const o = om.makeOffer(10 * 60, { x: 0, z: 0 }); if (o) s.add(o.kind); } return s; };
    const both = kinds(mk({}).om);
    assert.ok(both.has('ride') && both.has('food') && both.has('parcel'), [...both].join(','));
    const noRide = kinds(mk({ noRide: true }).om);
    assert.ok(!noRide.has('ride') && noRide.has('food') && noRide.has('parcel'), [...noRide].join(','));
    assert.deepEqual([...kinds(mk({ noFood: true }).om)], ['ride']);
    const { om } = mk({ noFood: true, noRide: true });
    om.goOnline();
    om.update(1, 1, 10 * 60, { x: 0, z: 0 });
    assert.equal(om.state, S.OFFLINE);
    // chỉ bật Chở khách mà chưa có mũ cho khách → cũng coi như không nhận được gì
    const r2 = mkOM(8, { carry: { flags: { noFood: true } } });
    assert.equal(r2.om.wantsNothing(), true);
  });
  const { plain, TYPES } = await import('../src/ui/cityMap.js');
  test('Tìm địa điểm trên bản đồ điện thoại: bỏ dấu vẫn khớp; nút loại lọc đúng', () => {
    assert.equal(plain('Cây Xăng Đường số 5'), 'cay xang duong so 5');
    const T = Object.fromEntries(TYPES.map((t) => [t[0], t[3]]));
    const placed = layout.places;
    assert.ok(placed.filter(T.gas).length >= 1 && placed.filter(T.gas).every((p) => ['gas', 'charger', 'swap'].includes(p.kind)));
    assert.ok(placed.filter(T.office).length >= 2 && placed.filter(T.office).every((p) => p.kind === 'office'), 'nút Văn phòng hãng');
    assert.ok(placed.filter(T.cafe).length >= 1 && !placed.filter(T.food).some(T.cafe), 'quán cà phê không lẫn vào quán ăn');
  });
  test('Hỏa tốc: cước cao hơn, thời hạn gắt hơn đơn giao hàng thường', () => {
    const { om } = mkOM(6, { carry: { money: 2000 } });
    const e = om.makeParcel(ORDER_TYPES.express, 600, { x: 0, z: 0 });
    const p = om.makeParcel({ ...ORDER_TYPES.parcel, items: ['taiLieu'], codChance: 0, shopItems: false }, 600, { x: 0, z: 0 });
    assert.ok(e.deadlineMult < p.deadlineMult);
    assert.ok(e.baseFare > ITEMS_DATA_BASE('taiLieu') && Math.abs(p.baseFare - ITEMS_DATA_BASE('taiLieu')) < 0.01);
  });
  test('Giao hàng COD: chỉ có khi đủ tiền ứng; lấy hàng trừ tiền, giao xong khách trả lại', () => {
    const poor = mkOM(8, { carry: { money: 20 } }).om;
    for (let i = 0; i < 50; i++) assert.equal(poor.makeParcel({ ...ORDER_TYPES.parcel, codChance: 1 }, 600, { x: 0, z: 0 }).cod, 0);
    const { om, gs } = mkOM(8, { carry: { money: 1000 } });
    const o = forceOffer(om, () => om.makeParcel({ ...ORDER_TYPES.parcel, items: ['hopGiay'], codChance: 1, bomChance: 0, shopItems: false }, 600, { x: 0, z: 0 }));
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
    // năn nỉ dùng tỉ lệ của loại đơn trong dữ liệu (sửa trong editor) → tạm đặt 0 để chắc chắn "không được"
    const oldPersuade = ORDER_TYPES.parcel.persuadeChance;
    ORDER_TYPES.parcel.persuadeChance = 0;
    try { assert.equal(om.persuadeBom(611).accepted, false); } finally { ORDER_TYPES.parcel.persuadeChance = oldPersuade; }
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
    const { om, gs } = mkOM(10, { day: DAY_ALL, carry: { money: 1000 } });
    const o = forceOffer(om, () => om.makeParcel({ ...ORDER_TYPES.parcel, items: ['dienThoai'], codChance: 1, bomChance: 0 }, 600, { x: 0, z: 0 }));
    o.flags.noAnswer = false; o.revealed = true; o.dropoff.apartment = false;
    om.finishPacking(om.collectParcel(600).items.map(() => ({ upright: true })), 601);
    o.items[0].damage(90, 'x');
    om.arriveAtDropoff(610);
    const rec = om.handOver(611);
    assert.ok(rec.ev.refused && rec.pay.cod === 0 && rec.codLost === o.cod);
    let refund = 0;
    const b = mkOM(11, { day: DAY_ALL, carry: { money: 1000 } });
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
    const hi = new OrderManager({ rng: makeRng(1), layout, gs: workerState() });
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
    assert.ok(RIDER_TYPES.drunk.from.includes(d.pickup.placeId), `đón ở ${d.pickup.placeId}`); // một trong các nơi đã tick "Đón ở"
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
    // chọn điểm trên đường gấp khúc mà quãng còn lại (cách game tính, kể cả đoạn đi trong hẻm) ≈ nửa tổng quãng
    const total = CITYLAYOUT.routeDist(o.pickup.door, o.dropoff.door);
    let mid = pts[0], best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 0; k <= 20; k++) {
        const q = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * (k / 20), z: pts[i].z + (pts[i + 1].z - pts[i].z) * (k / 20) };
        const e = Math.abs(CITYLAYOUT.routeDist(q, o.dropoff.door) - total / 2);
        if (e < best) { best = e; mid = q; }
      }
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
  // sông lớn thử: chạy dọc đường số 2 → 3, phủ cả cột khối 2; cầu ở ngã tư 1 (vòm cao) và 4 (thấp)
  const wideMap = () => {
    const m = JSON.parse(JSON.stringify(MAPD));
    m.rivers = [{ name: 'Thử', axis: 'x', line: 2, from: 0, to: CITY.N, wide: true, bridges: [1, 4], bridgeStyles: { 1: 'arch' } }];
    m.joins = [];
    m.busRoutes = [];
    return m;
  };
  test('Sông lớn: cả cột khối thành mặt nước (không lô, không vỉa hè), chỉ qua sông ở chỗ có cầu', () => {
    const CLm = CITYLAYOUT;
    const m = wideMap(), G = roadGraph(m);
    for (let k = 0; k < CITY.N; k++) {
      assert.ok(G.waterBlocks.has(`2,${k}`) && CLm.isWaterBlock(2, k, m), `khối 2,${k} phải là nước`);
      assert.deepEqual(CLm.blockLotIds(2, k, m), []);
    }
    assert.ok(G.waterSegs.has('x2:0') && G.waterSegs.has('x3:0'), '2 đường hai bên đều là sông');
    assert.ok(G.bridgeSegs.has('z1:2') && G.bridgeSegs.has('z4:2') && G.waterSegs.has('z2:2'), 'đường ngang qua sông chỉ còn ở chỗ có cầu');
    assert.ok(neighbors(2, 1, m).some((q) => q[0] === 3 && q[1] === 1), 'cầu nối 2 bờ');
    assert.equal(neighbors(2, 2, m).length, 0, 'không cầu → ngã tư thành mặt nước');
    assert.ok(G.rampSegs.has('z1:1') && G.rampSegs.has('z1:2') && G.rampSegs.has('z1:3') && G.highSegs.has('z1:2'), 'cầu vòm: 2 đoạn dẫn + nhịp nằm trên cao');
    assert.ok(!G.rampSegs.has('z4:2'), 'cầu thấp không có dốc');
    const lay = CLm.buildLayout(DATA.places.places.filter((p) => !p.block || p.block[0] !== 2), m);
    assert.ok(!lay.lots.some((l) => l.block[0] === 2), 'không còn nhà dân dưới sông');
  });
  test('Sông lớn: bộ kiểm tra bắt địa điểm nằm dưới sông, kiểu cầu sai, đè khối gộp; kiểu cầu thiếu → cầu phẳng', () => {
    const m = wideMap();
    const pd = JSON.parse(JSON.stringify(DATA.places));
    const p = pd.places.find((q) => q.kind === 'restaurant');
    pd.places = pd.places.filter((q) => !q.block || q.block[0] !== 2 || q === p);
    p.block = [2, 3];
    p.lot = 'N0';
    assert.ok(VALIDATE.validatePlaces(pd, DATA.items, null, null, m).some((i) => i.level === 'error' && i.ref === p.id && /dưới sông lớn/.test(i.msg)));
    const bad = wideMap();
    bad.rivers[0].bridgeStyles = { 1: 'iron', 4: 'bay' };
    bad.joins = [[2, 5, 'S']];
    const errs = validateMap(bad, DATA.places).filter((i) => i.level === 'error').map((i) => i.msg).join(' | ');
    assert.ok(/"iron"/.test(errs) && /"bay"/.test(errs), 'kiểu cầu sông lớn chỉ flat / arch');
    assert.ok(/đè lên khối đã gộp/.test(errs));
    assert.equal(CITYLAYOUT.bridgeStyle({ wide: false, bridgeStyles: { 3: 'arch' } }, 3), 'flat');
    assert.equal(CITYLAYOUT.bridgeStyle({ wide: false, bridgeStyles: { 3: 'iron' } }, 3), 'iron');
  });
  {
    const { bridgeDecks, ARCH, HUMP } = await import('../src/world/bridges.js');
    test('Mặt cầu: cầu vòm dốc dẫn bắt đầu sau ngã tư, cao ~8 m giữa sông, về 0 ở 2 đầu; cầu kênh vồng ~2 m', () => {
      const m = wideMap();
      m.rivers.push({ name: 'Kênh', axis: 'z', line: 6, from: 0, to: CITY.N, bridges: [1, 5, 8], bridgeStyles: { 1: 'iron', 5: 'concrete' } });
      const decks = bridgeDecks(roadGraph(m));
      const arch = decks.find((d) => d.style === 'arch'), iron = decks.find((d) => d.style === 'iron'), conc = decks.find((d) => d.style === 'concrete');
      assert.ok(arch && iron && conc && decks.length === 3, 'cầu phẳng không có mặt cầu cao');
      assert.ok(Math.abs(arch.h(arch.mid) - ARCH.hc) < 0.01 && arch.h(arch.u0) < 0.01 && arch.h(arch.u1) < 0.01);
      assert.ok(Math.abs(arch.u0 - (roadPos(1) + ARCH.start)) < 0.01 && Math.abs(arch.u1 - (roadPos(4) - ARCH.start)) < 0.01, 'dốc bắt đầu sau ngã tư, ngã tư vẫn ở mặt đất');
      assert.ok(Math.abs(iron.h(iron.mid) - HUMP.iron) < 0.01 && Math.abs(conc.h(conc.mid) - HUMP.concrete) < 0.01 && iron.h(iron.mid + HUMP.reach) === 0);
      assert.ok(arch.pts.every((p, i) => i === 0 || Math.hypot(p.x - arch.pts[i - 1].x, p.z - arch.pts[i - 1].z) <= 1.01), 'điểm mặt cầu cách đều ~1 m');
    });
  }
  test('Không đặt ổ gà / kẹt xe trên dốc hay nhịp cầu cao', () => {
    const g = roadGraph();
    for (let s = 1; s <= 5; s++) {
      const h = new HazardManager(makeRng(s));
      for (const j of h.jams) for (const sg of j.segments) assert.ok(!g.rampSegs.has(`${sg.axis}${sg.line}:${sg.from}`), 'kẹt xe trên cầu cao');
      for (const p of h.potholes) for (const id of g.rampSegs) {
        const mm = /^([xz])(\d+):(\d+)$/.exec(id), r = CITYLAYOUT.segmentRect({ axis: mm[1], line: +mm[2], from: +mm[3] });
        assert.ok(!(p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1), 'ổ gà dưới dốc cầu');
      }
    }
  });
}

console.log('Phà (src/sim/ferry.js)');
{
  const F = await import('../src/sim/ferry.js');
  const { roadPos, buildLayout: BL } = CITYLAYOUT;
  const lay = BL();
  const pairs = F.ferryPairs(lay.places);
  test('Bến phà mẫu: 1 cặp nối nhau, chỗ phà đậu nằm trên mặt sông lớn, người lên bờ ở cửa bến', () => {
    assert.equal(pairs.length, 1);
    const P = pairs[0], x0 = roadPos(8) - 6, x1 = roadPos(9) + 6;
    for (const s of [P.a, P.b]) {
      assert.ok(s.dock.x > x0 && s.dock.x < x1, `${s.id}: phà đậu ngoài sông (${s.dock.x})`);
      assert.ok(Math.hypot(s.door.x - s.edge.x, s.door.z - s.edge.z) < 3, 'cửa bến sát mép bờ');
    }
  });
  test('Lịch phà: mỗi bờ 10 phút 1 chuyến, chờ không quá 1 khoảng; ngoài giờ chạy chờ tới chuyến đầu', () => {
    assert.equal(F.ferryEvery(), 10);
    for (let now = 6 * 60; now < 7 * 60; now += 0.7) {
      for (const side of ['a', 'b']) {
        const nb = F.nextBoat(side, now);
        assert.ok(nb.wait >= 0 && nb.wait <= F.ferryEvery() + 0.01, `chờ ${nb.wait} phút lúc ${now}`);
        if (nb.wait === 0) assert.equal(F.boatPose(pairs[0], nb.boat, now).at, side, 'chờ 0 = phà đang đậu ở bến này');
      }
    }
    const night = F.nextBoat('a', 23 * 60);
    assert.ok(night.wait >= 6 * 60 - 0.01, 'sau 22h chờ tới 5h sáng');
  });
  test('Phà chạy: rời bến A → giữa sông 2 chiều đi lệch nhau → cập bến B; không phà nào đứng ngoài sông', () => {
    const P = pairs[0];
    let sawCross = false;
    for (let now = 600; now < 640; now += 0.25) {
      const ps = [0, 1].map((i) => F.boatPose(P, i, now));
      for (const p of ps) assert.ok(p.x >= Math.min(P.a.dock.x, P.b.dock.x) - 0.01 && p.x <= Math.max(P.a.dock.x, P.b.dock.x) + 0.01);
      if (!ps[0].at && !ps[1].at) {
        sawCross = true;
        assert.ok(Math.hypot(ps[0].x - ps[1].x, ps[0].z - ps[1].z) > F.BOAT_W * 0.9 || Math.abs(ps[0].x - ps[1].x) > F.BOAT_L, '2 phà đâm nhau giữa sông');
      }
    }
    assert.ok(sawCross);
  });
  test('Bộ kiểm tra bến phà: bến bên kia không có / không phải bến phà → lỗi; bến chưa nối → cảnh báo', () => {
    const pd = JSON.parse(JSON.stringify(DATA.places));
    const a = pd.places.find((p) => p.id === 'benPhaTrungTam');
    a.ferryTo = 'pho';
    assert.ok(VALIDATE.validatePlaces(pd, DATA.items).some((i) => i.level === 'error' && i.ref === a.id && i.field === 'ferryTo'));
    delete a.ferryTo;
    delete pd.places.find((p) => p.id === 'benPhaBanDao').ferryTo;
    assert.ok(VALIDATE.validatePlaces(pd, DATA.items).some((i) => i.level === 'warn' && i.ref === a.id && i.field === 'ferryTo'));
    assert.equal(F.ferryFare(true), 3);
    assert.equal(F.ferryFare(false), 1);
  });
}

console.log('Chỉ đường bản đồ tròn (src/sim/nav.js)');
{
  const N = await import('../src/sim/nav.js');
  const { roadPos, navRoute, routeDist, streetAt, CITY } = CITYLAYOUT;
  const { STREETS_X } = await import('../src/data/places.js');
  const lay = buildLayout();
  test('Đường chỉ đường: đầu = mình, cuối = cửa nhà; dài xấp xỉ quãng đường thật (không vòng ngược)', () => {
    const from = { x: roadPos(3) + 2, z: roadPos(2) + 30 };
    let n = 0;
    for (const l of lay.lots.filter((_, i) => i % 7 === 0)) {
      const pts = navRoute(from, l.door);
      assert.deepEqual(pts[0], { x: from.x, z: from.z });
      assert.ok(Math.hypot(pts[pts.length - 1].x - l.door.x, pts[pts.length - 1].z - l.door.z) < 0.01);
      const len = N.routeLen(pts), real = routeDist(from, l.door);
      assert.ok(len <= real + CITY.ROAD * 2 + 1, `${l.id}: đường vẽ ${len.toFixed(0)} m > quãng thật ${real.toFixed(0)} m`);
      n++;
    }
    assert.ok(n > 10);
  });
  test('Rẽ kế tiếp: đi lên rồi sang đông = rẽ phải, sang tây = rẽ trái; bỏ qua khúc ra tim đường; thẳng → không rẽ', () => {
    assert.deepEqual(N.nextTurn([{ x: 0, z: 0 }, { x: 0, z: -50 }, { x: 30, z: -50 }]), { dir: 'right', dist: 50 });
    assert.deepEqual(N.nextTurn([{ x: 0, z: 0 }, { x: 0, z: -50 }, { x: -30, z: -50 }]), { dir: 'left', dist: 50 });
    assert.deepEqual(N.nextTurn([{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: -50 }, { x: 32, z: -50 }]), { dir: 'right', dist: 52 });
    assert.equal(N.nextTurn([{ x: 0, z: 0 }, { x: 0, z: -50 }, { x: 0, z: -90 }]), null);
    assert.equal(N.nextTurn([{ x: 0, z: 0 }, { x: 0, z: -50 }, { x: 2, z: -50 }]), null, 'khúc cuối vào cửa nhà không tính là rẽ');
    // đứng ở lề (cách tim đường 5 m), xe hướng đông: ra tim đường rồi chạy đông, rẽ xuống nam = rẽ phải (không phải trái)
    const jog = [{ x: 20, z: -5 }, { x: 20, z: 0 }, { x: 52, z: 0 }, { x: 52, z: 52 }];
    assert.deepEqual(N.nextTurn(jog, 4, undefined, Math.PI / 2), { dir: 'right', dist: 37 });
    assert.deepEqual(N.nextTurn(jog, 4, undefined, -Math.PI / 2), { dir: 'back', dist: 0 }, 'xe hướng tây mà phải chạy đông → quay đầu');
  });
  test('Cảnh báo trên đường đi: điểm sát tuyến → quãng đường tới đó; đoạn kẹt nằm trên tuyến được nhận ra', () => {
    const pts = [{ x: roadPos(2), z: roadPos(1) }, { x: roadPos(2), z: roadPos(4) }];
    assert.ok(Math.abs(N.alongRoute(pts, { x: roadPos(2) + 3, z: roadPos(2) }) - CITY.PITCH) < 0.01);
    assert.equal(N.alongRoute(pts, { x: roadPos(3), z: roadPos(2) }), null);
    const jam = N.jamOnRoute(pts, [{ axis: 'x', line: 2, from: 2 }, { axis: 'z', line: 2, from: 5 }]);
    assert.ok(jam && Math.abs(jam.dist - CITY.PITCH - CITY.ROAD / 2) < 1, JSON.stringify(jam));
    assert.equal(N.jamOnRoute(pts, [{ axis: 'x', line: 5, from: 2 }]), null);
  });
  test('Tên đường đang đứng: trên đường → tên đường; giữa khối nhà → trống', () => {
    assert.equal(streetAt(roadPos(3) + 2, roadPos(2) + 30), STREETS_X[3]);
    assert.equal(streetAt(roadPos(3) + CITY.PITCH / 2, roadPos(2) + CITY.PITCH / 2), '');
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
  test('Bộ kiểm tra: địa điểm gắn với code phải luôn mở (chương 1); ngày 1 không có món nào có đơn thì cảnh báo', () => {
    const fs2 = require_json('src/data/places.json'), items2 = require_json('src/data/items.json');
    const home = fs2.places.find((p) => p.id === 'home');
    home.openChapter = 2;
    for (const it of Object.values(items2)) if (it && typeof it === 'object') it.openDay = 2;
    const iss = validatePlaces(fs2, items2);
    assert.ok(iss.some((i) => i.ref === 'home' && i.field === 'openChapter' && i.level === 'error'));
    assert.ok(iss.some((i) => i.field === 'openDay' && i.level === 'warn' && /Ngày 1/.test(i.msg)));
    items2.passenger.openDay = 1;
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
    const old = npcLook('home', { name: 'Dì Hai', age: 'old', build: 'chubby' });
    assert.deepEqual([old.age, old.build], ['old', 'chubby'], 'tuổi + vóc dáng NPC đi qua npcLook');
  });
  test('Tuổi / vóc dáng: places.json (npc) và relations.json (look) chỉ nhận mã hợp lệ', () => {
    const pd = JSON.parse(JSON.stringify(DATA.places));
    const home = pd.places.find((p) => p.id === 'home');
    const errOf = () => VALIDATE.validatePlaces(pd, DATA.items).filter((i) => i.level === 'error' && i.ref === 'home').map((i) => i.field);
    assert.deepEqual(errOf().filter((f) => f === 'npc.age' || f === 'npc.build'), []);
    Object.assign(home.npc, { age: 'gia', build: 'beo' });
    assert.ok(errOf().includes('npc.age') && errOf().includes('npc.build'));
  });
  test('Người ngẫu nhiên: trộn nam/nữ; ngồi sau xe thì không mặc váy', () => {
    const rng = makeRng(3);
    const many = Array.from({ length: 400 }, () => randomPersonOpts(rng));
    const f = many.filter((o) => o.gender === 'f').length;
    assert.ok(f > 150 && f < 250, `nữ ${f}/400`);
    assert.ok(many.some((o) => o.skirt) && many.every((o) => !o.skirt || o.gender === 'f'));
    assert.ok(many.every((o) => PE.HAIR_BY_GENDER[o.gender].includes(o.hairStyle)), 'tóc đúng danh sách của giới tính');
    assert.ok(new Set(many.map((o) => o.hairStyle)).size >= 12, 'đủ kiểu tóc khác nhau');
    assert.ok(many.some((o) => o.sleeves === 'short') && many.some((o) => o.sleeves === 'long') && many.some((o) => o.shorts), 'áo cộc / áo dài tay / quần short');
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
  test('Người ở xa vẽ đơn giản (LOD): ít tam giác hơn nhiều, vẫn đủ khớp + mặt; đổi qua lại không hỏng; người chơi luôn chi tiết', () => {
    const { setPersonDetail, updatePeopleLod, setPeopleMode } = MODELS;
    const count = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count / 3; }); return n; };
    for (const o of [{}, { gender: 'f', hairStyle: 'braids', shirtStyle: 'hoodie' }, { hat: 'helmet', overlay: 'raincoat' }]) {
      const p = makePerson(o), hi = count(p);
      setPersonDetail(p, true);
      assert.ok(count(p) < hi * 0.65, 'đơn giản: ' + count(p) + ' / ' + hi);
      setPersonDetail(p, false);
      assert.equal(count(p), hi, 'trở lại chi tiết');
    }
    // theo khoảng cách tới camera; nhân vật người chơi (keepDetail) không đổi
    const scene = new THREE.Scene(), near = makePerson({}), far = makePerson({}), me = makePerson({});
    far.position.set(80, 0, 0);
    me.position.set(80, 0, 5);
    me.userData.keepDetail = true;
    scene.add(near, far, me);
    scene.updateMatrixWorld(true);
    updatePeopleLod(new THREE.Vector3(0, 2, 5));
    assert.ok(!near.userData.lo && far.userData.lo && !me.userData.lo);
    setPeopleMode('simple');
    updatePeopleLod(new THREE.Vector3(0, 2, 5));
    assert.ok(near.userData.lo && !me.userData.lo, 'tùy chọn người đơn giản: ai cũng đơn giản trừ người chơi');
    setPeopleMode('auto');
    const { normSettings } = SETTINGS_MOD;
    assert.equal(normSettings({}).people, 'auto');
    assert.equal(normSettings({ people: 'simple' }).people, 'simple');
    assert.equal(normSettings({ people: 'xyz' }).people, 'auto');
  });
  test('Dựng hình 3D: tóc dài, búi, váy có đủ phần', () => {
    const skin = 0xf1c27d, pants = 0x2c3e50;
    const skirt = makePerson({ gender: 'f', hairStyle: 'long', skirt: true, skin, pants });
    const noSkirt = makePerson({ gender: 'f', hairStyle: 'long', skin, pants });
    const low = (p) => (p.userData.parts.torso.geometry.computeBoundingBox(), p.userData.parts.torso.geometry.boundingBox.min.y);
    assert.ok(low(skirt) < 0.5 && low(noSkirt) > 0.75, 'váy phủ xuống gần gối');
    const thigh = meshOf(skirt.userData.parts.legL).geometry;
    assert.ok(hasColor(thigh, skin) && !hasColor(thigh, pants), 'mặc váy: chân màu da');
    assert.ok(hasColor(meshOf(noSkirt.userData.parts.legL).geometry, pants));
    // 16 kiểu tóc đều dựng được, có thêm phần tóc so với đầu trọc; kiểu khác nhau → hình khác nhau
    const bald = tris(makePerson({ gender: 'f', hairStyle: 'bald' })), seen = new Set();
    for (const st of PE.HAIR_STYLES.filter((s) => s !== 'bald')) {
      for (const hat of [null, 'helmet']) assert.ok(tris(makePerson({ gender: 'f', hairStyle: st, hat })) > (hat ? 0 : bald), `${st} ${hat}`);
      const g = makePerson({ hairStyle: st }).userData.parts.torso.geometry;
      const pa = g.attributes.position.array;
      let sum = 0;
      for (let i = 0; i < pa.length; i++) sum += pa[i] * ((i % 7) + 1);
      seen.add(`${pa.length}|${sum.toFixed(3)}`);
    }
    assert.equal(seen.size, PE.HAIR_STYLES.length - 1, 'mỗi kiểu tóc một hình');
    // đội mũ bảo hiểm: búi cao chuyển xuống gáy, tóc không xuyên lên trên mũ
    const top = (o) => { const g = makePerson(o).userData.parts.torso.geometry; g.computeBoundingBox(); return g.boundingBox.max.y; };
    assert.ok(top({ hairStyle: 'bun', hat: 'helmet' }) < top({ hairStyle: 'bun' }), 'búi cao khi đội mũ');
    assert.ok(Math.abs(top({ hairStyle: 'curly', hat: 'helmet' }) - top({ hairStyle: 'bald', hat: 'helmet' })) < 1e-6, 'tóc xoăn không lòi khỏi mũ');
  });
  test('Dựng hình 3D người: đủ khớp gối/khuỷu, ≤ 11 khối (áo mưa dài thêm 2 vạt), chung 1 vật liệu, ngồi đúng yên xe', () => {
    const looks = [{}, { hat: 'helmet', helmetStyle: 'full', overlay: 'raincoat' }, { gender: 'f', skirt: true, hat: 'nonla' }, { hat: 'police', bag: true }, { overlay: 'jacket', scale: 0.72 },
      { hat: 'helmet', face: 'mask', faceColor: 0x5dade2, gloves: 'armSleeves', gloveColor: 0xffffff, shoe: 0xffffff, shoeStyle: 'sandal', sleeves: 'short' }, { face: 'glasses', gloves: 'gloves' }];
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
      assert.ok(n <= (o.overlay === 'raincoat' ? 11 : 10), JSON.stringify(o) + ": " + n + " khối");
      setSitting(p, true);
      assert.ok(parts.legL.rotation.x < -1 && parts.kneeL.rotation.x > 1, 'ngồi: đùi ra trước, cẳng chân thả xuống');
      assert.ok(parts.legL.rotation.z < -0.1 && parts.legR.rotation.z > 0.1, 'ngồi xe: 2 đùi banh ra 2 bên, chân khỏi lún vào thân xe');
      setSitting(p, false);
      assert.ok(parts.legL.rotation.z === 0 && parts.legR.rotation.z === 0, 'đứng dậy: khép chân lại');
      assert.equal(parts.kneeL.rotation.x, 0);
    }
    assert.equal(mats.size, 1, 'mọi người dùng chung 1 vật liệu');
    assert.ok(Math.abs(sitY(1) + HIP_Y - 0.98) < 1e-9 && Math.abs(sitY(0.72, 1.02) + HIP_Y * 0.72 - 1.02) < 1e-9, 'háng nằm đúng độ cao yên');
  });
  test('Xe đạp: không có thùng giao hàng; đạp xe 2 chân ngược pha, đứng yên thì ngồi bình thường', () => {
    const bike = MODELS.makeBike(0x123456, 'bicycle');
    assert.ok(bike.userData.noBag && !bike.userData.bagMesh.visible, 'xe đạp không có thùng');
    assert.ok(MODELS.makeBike(0x123456, 'cub').userData.bagMesh.visible, 'xe máy vẫn có thùng');
    const p = makePerson({}), parts = p.userData.parts;
    MODELS.pedalPerson(p, Math.PI / 2, 1);
    assert.ok(parts.legL.rotation.x < -1.4 && parts.legR.rotation.x > -1.0, 'chân trái đạp lên, chân phải xuống');
    assert.ok(parts.kneeL.rotation.x > parts.kneeR.rotation.x, 'chân ở trên gập gối nhiều hơn');
    MODELS.pedalPerson(p, 1.3, 0);
    assert.ok(Math.abs(parts.legL.rotation.x + 1.2) < 1e-9 && Math.abs(parts.legR.rotation.x + 1.2) < 1e-9, 'đứng yên = dáng ngồi');
  });
  test('Dựng hình 3D phụ kiện: khẩu trang / kính trên mặt, găng tay đổi màu bàn tay, dép lộ bàn chân', () => {
    const skin = 0xf1c27d, mask = 0x5dade2, glass = 0x1c1c1c, glove = 0xaa3311, sandal = 0x8e44ad;
    const p = makePerson({ skin, face: 'mask', faceColor: mask, gloves: 'gloves', gloveColor: glove, shoe: sandal, shoeStyle: 'sandal', shorts: true });
    assert.ok(hasColor(p.userData.parts.torso.geometry, mask), 'khẩu trang');
    assert.ok(hasColor(makePerson({ skin, face: 'glasses', faceColor: glass }).userData.parts.torso.geometry, glass), 'kính');
    const fore = meshOf(p.userData.parts.elbowL).geometry;
    assert.ok(hasColor(fore, glove), 'bàn tay màu găng');
    const shin = meshOf(p.userData.parts.kneeL).geometry;
    assert.ok(hasColor(shin, sandal) && hasColor(shin, skin), 'dép: đế màu dép + bàn chân trần');
    const longGlove = meshOf(makePerson({ skin, sleeves: 'short', gloves: 'armSleeves', gloveColor: glove }).userData.parts.elbowL).geometry;
    assert.ok(hasColor(longGlove, glove) && !hasColor(longGlove, skin), 'găng ống dài che kín cẳng tay');
    assert.ok(!hasColor(meshOf(makePerson({ skin }).userData.parts.elbowL).geometry, glove), 'không đeo găng thì tay trần');
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
  test('Áo mưa dài: kín thân + tay, vạt dưới tới gần mắt cá, vạt trước theo chân; ngồi xe thì thu ngắn, phủ lên đùi', () => {
    const { animatePerson } = MODELS;
    const color = 0x3c8dde, p = makePerson({ hat: 'helmet', overlay: 'raincoat', overlayColor: color, shirt: 0xff0000 });
    const parts = p.userData.parts, coat = parts.overlay;
    assert.ok(coat && coat.userData.coat && parts.ta?.userData.coatFlap, 'có vạt dưới + vạt trước');
    assert.ok(hasColor(parts.torso.geometry, color) && !hasColor(parts.torso.geometry, 0xff0000), 'che kín áo trong');
    assert.ok(hasColor(meshOf(parts.armL).geometry, color), 'tay áo màu áo mưa');
    p.updateMatrixWorld(true);
    const low = (o) => { let m = 9; o.traverse((x) => { if (!x.isMesh) return; x.geometry.computeBoundingBox(); m = Math.min(m, x.geometry.boundingBox.clone().applyMatrix4(x.matrixWorld).min.y); }); return m; };
    assert.ok(low(coat) < 0.25 && low(coat) > 0.05, 'vạt tới gần mắt cá: ' + low(coat).toFixed(2));
    animatePerson(p, 1.57, 1);
    assert.ok(parts.ta.rotation.x < -0.2, 'bước chân: vạt trước nhấc theo đùi');
    setSitting(p, true);
    assert.ok(coat.scale.y < 0.6 && parts.ta.rotation.x < -1, 'ngồi xe: vạt dưới thu ngắn, vạt trước nằm trên đùi');
    setSitting(p, false);
    assert.equal(coat.scale.y, 1);
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
  const { HouseGeo, buildHouse, housesForLot, houseTop, PX } = await import('../src/world/houses.js');
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
  test('Lô rộng > 7 m chia 2–3 căn hẹp (3,4–6,3 m) sát nhau phủ kín mặt tiền; lô hẹp 1 căn', () => {
    assert.equal(housesForLot({ x: 0, z: 0, nx: 0, nz: 1, width: 6, depth: 9 }, { floors: 3, colors: [1], seed: 1 }).length, 1);
    const counts = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      const list = housesForLot({ x: 0, z: 0, nx: 0, nz: 1, width: 10.8, depth: 9 }, { floors: 3, colors: [1], seed });
      counts.add(list.length);
      assert.ok(list.length === 2 || list.length === 3, `${list.length} căn`);
      const sum = list.reduce((a, h) => a + h.W, 0);
      assert.ok(Math.abs(sum - 10.8) < 0.1, `tổng mặt tiền ${sum}`);
      assert.ok(list.every((h) => h.W >= 3.3 && h.W <= 6.3), list.map((h) => h.W.toFixed(2)).join(','));
    }
    assert.ok(counts.has(2) && counts.has(3), 'có cả lô 2 căn lẫn 3 căn');
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
  test('Chữ biển nhà dân (city.shopSigns): có chữ, không quá 28 (số ô trên tấm texture nhà); các ô chữ không đè lên nhau', () => {
    const words = CONTENT.list('city.shopSigns');
    assert.ok(words.length >= 1 && words.length <= 28, `${words.length} chữ`);
    const rects = Object.entries(PX);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const [a, A] = rects[i], [b, B] = rects[j];
      const overlap = A[0] < B[0] + B[2] && B[0] < A[0] + A[2] && A[1] < B[1] + B[3] && B[1] < A[1] + A[3];
      assert.ok(!overlap, `${a} đè ${b}`);
      assert.ok(A[0] + A[2] <= 1024 && A[1] + A[3] <= 1024, `${a} ra ngoài tấm`);
    }
  });
  test('Nhà góc: căn ngoài cùng phía hông ra đường có mặt hông (cửa sổ, biển chữ L), không lấn ra ngoài lô quá 0,2 m', () => {
    for (const [nx, nz, dir] of [[0, 1, [1, 0]], [0, 1, [-1, 0]], [1, 0, [0, -1]], [-1, 0, [0, 1]]]) {
      const lot = { x: 0, y: 0, z: 0, nx, nz, width: 10.8, depth: 10 };
      const list = housesForLot(lot, { floors: 4, colors: [0xffcc88], seed: 3, cornerDir: dir });
      const corners = list.filter((h) => h.corner);
      assert.equal(corners.length, 1, `hướng ${nx},${nz}`);
      // căn góc nằm đúng phía hông: tâm căn lệch về phía dir
      const h = corners[0];
      assert.ok(h.x * dir[0] + h.z * dir[1] > 0, 'căn góc phải ở phía đường cắt ngang');
      const plain = { ...h, corner: null };
      const g1 = new HouseGeo(), g2 = new HouseGeo();
      buildHouse(g1, h);
      buildHouse(g2, plain);
      assert.ok(g1.tris > g2.tris, 'nhà góc có thêm mặt hông');
      const { mn, mx } = bounds(g1);
      const side = dir[0] ? (dir[0] > 0 ? mx[0] : -mn[0]) : (dir[1] > 0 ? mx[2] : -mn[2]);
      assert.ok(side <= 10.8 / 2 + 0.2 + 1e-6, `lấn ra ${side.toFixed(2)} m`);
    }
    // không có hướng hông → không căn nào là nhà góc; nhà trong hẻm không làm nhà góc
    assert.ok(housesForLot({ x: 0, z: 0, nx: 0, nz: 1, width: 10.8, depth: 9 }, { floors: 3, colors: [1], seed: 1 }).every((h) => !h.corner));
    assert.ok(housesForLot({ x: 0, z: 0, nx: 0, nz: 1, width: 10.8, depth: 9 }, { floors: 3, colors: [1], seed: 1, alley: true, cornerDir: [1, 0] }).every((h) => !h.corner));
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
    // công trình lớn đợt B: đoán theo tên
    for (const [name, want] of [['Nhà Thờ Đá Đỏ', 'cathedral'], ['Bưu Điện Thành Phố', 'postOffice'], ['Kho Hàng Cảng', 'portWarehouse'], ['Vựa Ve Chai Cô Bảy', 'scrapYard'], ['Bệnh Viện Quốc Tế', 'hospital']]) {
      assert.equal(guessLook({ kind: 'service', name }), want, name);
    }
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
  test('Phòng trọ có hầm xe: tầng trệt chạy xe vào được (chỉ chặn 2 tường bên + tường sau), nằm trong lô; lô hẹp thật (~3,1 m) vẫn dựng được', () => {
    for (const [W, D] of [[3.13, 8.5], [6, 9]]) {
      const b = buildPlace({ look: 'tro', W, D, floors: 3, color: '#f2d7a7', sign: 'PHÒNG TRỌ', short: 'Trọ', kind: 'home', seed: 3, garage: true });
      assert.ok(Array.isArray(b.colliders), 'có danh sách khối chặn');
      const walls = b.colliders.filter((c) => !c.cam), cams = b.colliders.filter((c) => c.cam);
      assert.ok(walls.length === 3, 'chỉ 3 bức tường chặn người / xe');
      // lầu phía trên hầm: chặn camera từ trần hầm trở lên (camera không lọt vào trong nhà khi xe vừa ra khỏi hầm)
      assert.ok(cams.length === 1 && cams[0].y0 >= 2.5 && cams[0].z1 === 0, 'khối chặn camera ở lầu trên');
      const box = new THREE.Box3().setFromObject(b.group);
      assert.ok(box.min.z >= -D - 0.35 && box.max.z <= 0.6 && box.min.x >= -W / 2 - 0.35 && box.max.x <= W / 2 + 0.35, `${W}×${D}`);
      // lòng hầm (giữa 2 tường, trước tường sau) không bị chặn → xe (bán kính 0,7) chạy vào được
      const inner = (x, z) => walls.some((c) => x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1);
      for (const z of [-0.5, -D / 2, -D + 1]) assert.ok(!inner(0, z), `giữa hầm z ${z}`);
      const gap = W - 2 * 0.22;
      assert.ok(gap >= 1.4 + 1.2, `lòng hầm đủ rộng cho xe: ${gap.toFixed(2)} m`);
    }
    const plain = buildPlace({ look: 'tro', W: 6, D: 9, floors: 2, color: '#f2d7a7', kind: 'home', seed: 3 });
    assert.equal(plain.colliders, 'full', 'dãy trọ thường (không hầm) vẫn đặc');
  });
  const { SpatialGrid, resolveCircle } = await import('../src/world/physics.js');
  test('Khối chỉ chặn camera: camera không vào được lầu trên, người / xe vẫn đi qua bên dưới', () => {
    const grid = new SpatialGrid();
    grid.add({ x0: 0, z0: 0, x1: 4, z1: 8, h: 9, y0: 2.8, cam: true });
    assert.ok(grid.inside(2, 4, 4), 'camera trên lầu bị chặn');
    assert.ok(!grid.inside(2, 1.5, 4), 'camera trong lòng hầm không bị chặn');
    const pos = { x: 2, z: 4 };
    resolveCircle(pos, 0.7, grid);
    assert.deepEqual(pos, { x: 2, z: 4 }, 'xe trong hầm không bị đẩy ra');
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
  const { Elevated } = await import('../src/world/elevated.js');
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
    assert.ok(big.ramp && big.ramp.path && big.ramp.walk && big.ramp.walk.pts.length > 20 && big.ramp.stops.length === 3 && Array.isArray(big.colliders) && big.colliders.length > 5);
    const p = airportPath(85.5);
    assert.ok(p.getPoint(0).y < 0.2 && p.getPoint(1).y < 0.2 && Math.abs(p.getPoint(0.5).y - AIRPORT_UP) < 0.05);
    assert.ok(p.getPoint(0).x > 40 && p.getPoint(1).x < -40);
    const small = buildPlace({ look: 'airport', W: 10.8, D: 10.8, color: '#e0e0e0', sign: 'SB', kind: 'service', seed: 3 });
    assert.equal(small.ramp, null);
  });
  test('Mặt đi trên cao: vào đầu dốc lên cao dần, lan can giữ lại, gầm thấp chắn, gầm cao đi qua, ra cuối dốc xuống đất', () => {
    const el = new Elevated();
    // dốc thẳng dọc trục x: 0 → 20 m lên 0 → 5 m, rồi sàn phẳng 20 → 40 m, rồi xuống 40 → 60 m
    const pts = [];
    for (let x = 0; x <= 60; x++) pts.push({ x, y: x < 20 ? x / 4 : x <= 40 ? 5 : (60 - x) / 4, z: 0 });
    el.addRamp(pts, 3);
    el.addPad([[25, -3], [35, -3], [35, -6], [25, -6]], 5.15); // lề đi bộ sát sàn
    const body = { pos: { x: -1, z: 0 }, deckY: null };
    const go = (x, z) => {
      body.pos.x = x;
      body.pos.z = z;
      return el.settle(body, 0.4, 0, 2.2);
    };
    assert.equal(go(-1, 0).y, 0);
    for (let x = 0; x <= 12; x += 0.5) go(x, 0);
    assert.ok(body.deckY != null && Math.abs(go(12.5, 0).y - 12.5 / 4) < 0.05, 'đang lên dốc');
    for (let x = 12.5; x <= 30; x += 0.5) go(x, 0);
    assert.ok(Math.abs(body.deckY - 5) < 0.01, 'trên sàn');
    // lan can: bước ra ngoài mép (z = 4) bị giữ lại, có pháp tuyến chạm
    const hit = go(30, 3.5);
    assert.ok(body.pos.z < 3 && hit.normals.length, 'lan can');
    // bước lên lề đi bộ (cao hơn 0,15 m) được
    go(30, -1.5);
    go(30, -2.9);
    go(30, -4);
    assert.ok(Math.abs(body.deckY - 5.15) < 0.01, 'lên lề');
    go(30, -2);
    go(30, 0);
    for (let x = 30; x <= 61; x += 0.5) go(x, 0);
    assert.equal(body.deckY, null, 'ra khỏi cuối dốc thì xuống đất');
    // dưới đất: đi ngang qua đoạn dốc thấp (cao 1,25 m) bị chắn; đi dưới sàn cao 5 m thì qua được
    const g = { pos: { x: 5, z: -6 }, deckY: null };
    const walk = (x, z) => {
      g.pos.x = x;
      g.pos.z = z;
      return el.settle(g, 0.4, 0, 2.2);
    };
    for (let z = -6; z <= 0; z += 0.5) walk(5, z);
    assert.ok(g.pos.z < -3 && g.deckY == null, 'gầm thấp chắn');
    walk(30, -8);
    for (let z = -8; z <= 6; z += 0.5) walk(30, z);
    assert.ok(g.pos.z > 5 && g.deckY == null, 'gầm cao đi qua');
    // dịch chuyển tức thì (về nhà) thì về mặt đất
    body.deckY = 5;
    body._ex = 30;
    body._ez = 0;
    assert.equal(go(-50, 50).y, 0);
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
  const data = { items: read('src/data/items.json'), gear: read('src/data/gear.json'), goods: read('src/data/goods.json'), places: read('src/data/places.json'), content: read('src/content/vi.json'), apps: read('src/data/apps.json'), map: read('src/data/map.json'), story: read('src/data/story.json'), relations: read('src/data/relations.json') };
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
    assert.ok(w.some((i) => i.field === 'activities.a' && /suy sụp ngay \(thanh tối đa/.test(i.msg)));
    assert.ok(w.some((i) => i.field === 'activities.b' && /có thể ngất \/ suy sụp/.test(i.msg)));
    assert.ok(w.some((i) => i.field === 'activities.c' && /miễn phí/.test(i.msg)));
    assert.ok(!w.some((i) => i.field === 'activities.d'), 'hoạt động bình thường không bị cảnh báo');
    const goods = { cheap: { id: 'cheap', name: 'Rẻ', price: 5, type: 'consumable', use: { minutes: 1, phys: 30, mental: 0 } }, free: { id: 'free', name: 'Free', price: 0, type: 'consumable', use: { minutes: 1, phys: 5 } } };
    const gw = validateGoods(goods, null).filter((i) => i.level === 'warn' && i.field === 'price').map((i) => i.ref);
    assert.deepEqual(gw.sort(), ['cheap', 'free']);
    const gear = JSON.parse(JSON.stringify(data.gear));
    const someBike = Object.keys(gear.vehicles).find((k) => !['cub', 'xeDap', 'evStd'].includes(k)); // xe khởi đầu / xe hãng cấp giá 0 là đúng
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
  test('Bãi giữ xe: nhận ra xe đậu trong bãi, tìm bãi gần nhất; chỉ trong hầm xe phòng trọ là an toàn (lề trước nhà thì không)', () => {
    const lot = { id: 'bai', kind: 'scenery', look: 'parkingLot', x0: 0, x1: 10, z0: 0, z1: 10 };
    const park = { id: 'cv', kind: 'scenery', look: 'park', x0: 20, x1: 30, z0: 0, z1: 10 };
    const home = { id: 'home', kind: 'home', x0: 100, x1: 104, z0: 90, z1: 99, face: 'S', door: { x: 102, z: 100.6 } };
    const places = [lot, park, home];
    assert.equal(PK.parkingLotAt(places, 5, 5), lot);
    assert.equal(PK.parkingLotAt(places, 25, 5), null, 'công viên không phải bãi giữ xe');
    assert.equal(PK.nearestParkingLot(places, 50, 50), lot);
    assert.equal(PK.nearestParkingLot([park, home], 50, 50), null);
    assert.ok(PK.safeSpot(places, 102, 94), 'trong hầm');
    assert.ok(!PK.safeSpot(places, 102, 100.6), 'trước cửa nhà (lề đường) không còn an toàn');
    assert.ok(!PK.safeSpot(places, 102, 98.6), 'chìa ra ngoài cửa hầm chưa tính là trong hầm');
  });
  const G = await import('../src/sim/garage.js');
  test('Hầm xe phòng trọ: lòng hầm theo 4 hướng mặt tiền, chỗ dựng xe / chỗ đứng nằm trong hầm, đầu xe quay ra đường', () => {
    for (const face of ['N', 'S', 'E', 'W']) {
      const p = { x0: 0, x1: face === 'E' || face === 'W' ? 9 : 4, z0: 0, z1: face === 'E' || face === 'W' ? 4 : 9, face };
      const s = G.garageSpots(p);
      assert.ok(G.inGarage(p, s.bike.x, s.bike.z) && G.inGarage(p, s.walker.x, s.walker.z, 0.5), face);
      const fwd = { x: Math.sin(s.bike.heading), z: Math.cos(s.bike.heading) };
      const out = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[face];
      assert.ok(Math.abs(fwd.x - out[0]) < 1e-9 && Math.abs(fwd.z - out[1]) < 1e-9, `${face}: đầu xe quay ra đường`);
      const g = G.garageRect(p);
      assert.ok(g.x1 - g.x0 > 3 || g.z1 - g.z0 > 3);
    }
    const home = layout.placeById.home;
    const s = G.garageSpots(home);
    assert.ok(G.inGarage(home, s.bike.x, s.bike.z) && !G.inGarage(home, home.door.x, home.door.z), 'phòng trọ thật: xe trong hầm, cửa nhà ngoài vỉa hè');
    assert.ok(PK.safeSpot(layout.places, s.bike.x, s.bike.z));
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

console.log('Sân bay: luật xe máy (điểm đón, bãi xe, cấm dừng, phí)');
{
  const AP = await import('../src/sim/airport.js');
  const { APP } = await import('../src/data/apps.js');
  const { buildPlace, airportPath } = await import('../src/world/placeBuildings.js');
  const { rideDoor } = await import('../src/sim/cityLayout.js');
  const { lookOf } = await import('../src/data/looks.js');
  // sân bay giả (không phụ thuộc dữ liệu người dùng): lô 2 khối, mặt tiền quay xuống (+z)
  const fake = { id: 'sbThu', name: 'SB', kind: 'service', look: 'airport', face: 'S', x0: -43, x1: 43, z0: -34, z1: 0, door: { x: 0, z: 1.4 } };
  test('Vùng sân bay: điểm đón & bãi xe trong khuôn viên, không tính dừng sai chỗ; vỉa hè trước sảnh là vùng cấm dừng; sân bay nhỏ không chia vùng', () => {
    const rd = AP.airportRideDoor(fake);
    assert.equal(AP.airportAt([fake], rd.x, rd.z), fake);
    assert.equal(AP.airportNoStopAt([fake], rd.x, rd.z), null);
    assert.equal(AP.airportNoStopAt([fake], rd.x, rd.z + 4), null, 'đứng chờ sát điểm đón (bấm E trong 5,5 m)');
    const fr = AP.lotFrame(fake), zn = AP.airportZones(fr.W);
    const [px, pz] = fr.toWorld((zn.park.x0 + zn.park.x1) / 2, (zn.park.z0 + zn.park.z1) / 2);
    assert.equal(AP.airportParkAt([fake], px, pz), fake);
    assert.equal(AP.airportNoStopAt([fake], px, pz), null);
    const [sx, sz] = fr.toWorld(0, 2);
    assert.equal(AP.airportNoStopAt([fake], sx, sz), fake, 'vỉa hè trước sảnh');
    assert.equal(AP.airportAt([fake], sx, sz), null, 'vỉa hè chưa phải khuôn viên (chưa thu phí)');
    assert.equal(AP.airportNoStopAt([fake], 0, 30), null);
    assert.equal(AP.airportRideDoor({ ...fake, x0: -5, x1: 5 }), null);
    // địa điểm sân bay thật trên bản đồ (nếu có): xe ôm đón / trả ở điểm đón
    for (const p of layout.places) if (lookOf(p) === 'airport' && AP.airportZones(AP.lotFrame(p).W)) assert.deepEqual(rideDoor(p), AP.airportRideDoor(p));
  });
  test('Điểm đón, bãi xe không đè lên nhà ga / cột / đường dốc sát đất của model', () => {
    const W = 85.5, D = 33.5, zn = AP.airportZones(W);
    const b = buildPlace({ look: 'airport', W, D, color: '#e0e0e0', sign: 'SB', kind: 'service', seed: 3 });
    const hit = (r, c) => r.x0 < c.x1 && r.x1 > c.x0 && r.z0 < c.z1 && r.z1 > c.z0;
    for (const c of b.colliders) assert.ok(!hit(zn.pickup, c), `điểm đón đè vật chắn ${JSON.stringify(c)}`);
    const inPark = (c) => c.x0 >= zn.park.x0 - 0.3 && c.x1 <= zn.park.x1 + 0.3 && c.z0 >= zn.park.z0 - 0.3 && c.z1 <= zn.park.z1 + 0.3;
    for (const c of b.colliders) if (!inPark(c)) assert.ok(!hit(zn.park, c), `bãi xe đè vật chắn ${JSON.stringify(c)}`);
    for (const r of [zn.pickup, zn.park]) assert.ok(r.x0 > -W / 2 && r.x1 < W / 2 && r.z0 > -D && r.z1 < 0, 'nằm trong lô');
    const path = airportPath(W);
    for (const q of path.getSpacedPoints(200)) {
      if (q.y > 3.8) continue; // sàn ga đi trên cao: gầm đủ cao cho xe máy
      for (const r of [zn.pickup, zn.park]) assert.ok(!(q.x > r.x0 - 3.6 && q.x < r.x1 + 3.6 && q.z > r.z0 - 3.6 && q.z < r.z1 + 3.6), `đường dốc thấp đè vùng ở ${q.x.toFixed(1)},${q.z.toFixed(1)}`);
    }
  });
  test('Barie chân dốc: 2 đầu đường trên cao bị chắn (xe máy không lên được), có cần chắn để nâng cho ô tô', () => {
    const W = 85.5, b = buildPlace({ look: 'airport', W, D: 33.5, color: '#e0e0e0', sign: 'SB', kind: 'service', seed: 3 });
    assert.equal(b.barriers.length, 2);
    const path = airportPath(W), L = path.getLength();
    for (const t of [3 / L, 1 - 3 / L, 6 / L, 1 - 6 / L]) {
      // đi dọc tim dốc từ ngoài vào: phải đụng 1 khối chắn cao ≥ 1 m trước khi tới điểm này
      const end = path.getPointAt(t), start = path.getPointAt(t < 0.5 ? 0 : 1);
      let blocked = false;
      for (let i = 0; i <= 20 && !blocked; i++) {
        const x = start.x + ((end.x - start.x) * i) / 20, z = start.z + ((end.z - start.z) * i) / 20;
        blocked = b.colliders.some((c) => c.h >= 1 && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1);
      }
      assert.ok(blocked, `lọt vào dốc tới t=${t.toFixed(3)}`);
    }
  });
  test('Phụ phí sân bay: khách trả thêm, tài xế nhận đủ (app không trích); đơn đón / trả ở sân bay mới có', () => {
    const r1 = (v) => Math.round(v * 10) / 10;
    const p = computePayout({ baseFare: 20, distanceKm: 0, stars: 1, airportFee: 10 });
    assert.equal(p.airportFee, 10);
    assert.equal(p.fee, r1(20 * APP.platformFee));
    assert.equal(p.gross, 30);
    assert.equal(p.walletCredit, r1(30 - p.fee - p.tax + p.tip));
    assert.equal(computePayout({ baseFare: 20, distanceKm: 0, stars: 1, airportFee: 10, farePct: 0.5 }).airportFee, 5, 'khách xuống giữa đường');
    const lay = { ...layout, placeById: { ...layout.placeById, sbThu: fake } };
    const om = new OrderManager({ rng: makeRng(4), layout: lay, gs: workerState() });
    const lot = layout.lots[0];
    const mk = (pickup) => om.buildOrder({ type: { id: 'ride', kind: 'ride', fareMult: 1, deadlineMult: 1 }, pickup, dropoff: { name: lot.address, address: lot.address, door: lot.door, lotKey: lot.key }, itemIds: ['passenger'], pos: { x: 0, z: 0 } });
    assert.equal(mk({ placeId: 'sbThu', name: 'SB', address: 'SB', door: AP.airportRideDoor(fake) }).airportFee, APP.airportFee || 0);
    assert.equal(mk({ name: lot.address, address: lot.address, door: lot.door }).airportFee, 0);
  });
  test('Dừng sai chỗ: bảo vệ thổi còi rồi phạt, mỗi lần dừng 1 lần', () => {
    const A = { noStopWarnMin: 3, noStopFineMin: 8 };
    const st = { since: 100, warned: false, fined: false };
    assert.equal(AP.noStopStep(st, 102, A), null);
    assert.equal(AP.noStopStep(st, 103, A), 'warn');
    st.warned = true;
    assert.equal(AP.noStopStep(st, 107, A), null);
    assert.equal(AP.noStopStep(st, 108, A), 'fine');
    st.fined = true;
    assert.equal(AP.noStopStep(st, 200, A), null);
    assert.equal(AP.noStopStep(null, 200, A), null);
  });
  test('Kiểm tra dữ liệu: phụ phí sân bay ngoài 0–100k là lỗi', () => {
    const bad = JSON.parse(JSON.stringify(DATA.apps));
    bad.apps.goship.airportFee = 500;
    assert.ok(VALIDATE.validateApps(bad, DATA.items, DATA.places).some((i) => i.level === 'error' && i.field === 'airportFee'));
  });
}

console.log('Cấp đường (đại lộ / thường / nhỏ)');
{
  const RD = await import('../src/sim/roads.js');
  const CL = await import('../src/sim/cityLayout.js');
  const { MAP } = await import('../src/data/map.js');
  const { HazardManager } = await import('../src/sim/hazards.js');
  const { ECONOMY } = await import('../src/data/balance.js');
  test('Đoạn đường dưới chân: giữa đoạn → đúng mã; ngã tư / khối nhà → không có', () => {
    const P = CL.CITY.PITCH, x = CL.roadPos(3), z = CL.roadPos(2) + P / 2;
    assert.equal(RD.roadSegAt(x + 2, z).id, 'x3:2');
    assert.equal(RD.roadSegAt(z, x - 2).id, 'z3:2');
    assert.equal(RD.roadSegAt(x, CL.roadPos(2)), null, 'ngã tư');
    assert.equal(RD.roadSegAt(x + 20, z), null, 'khối nhà');
    assert.equal(RD.tierBetween([3, 2], [3, 3], { roadTiers: { 'x3:2': 'small' } }), 'small');
    assert.equal(RD.tierOf('x3:2', { roadTiers: { 'x3:2': 'lạ' } }), 'normal');
  });
  test('Chia tự động theo khu phố: đường chính = đại lộ; cả tuyến trong một khu cùng cấp; giáp 2 khu khác nhau lấy mức giữa; bỏ sông / khối gộp', () => {
    const m = JSON.parse(JSON.stringify(MAP));
    m.districts = { nho: { name: 'Nhỏ', roads: { small: 1 } }, to: { name: 'To', roads: { big: 1 } } };
    m.districtBlocks = {};
    for (let bz = 0; bz < CL.CITY.N; bz++) for (let bx = 0; bx < CL.CITY.N; bx++) m.districtBlocks[`${bx},${bz}`] = bx < CL.CITY.N / 2 ? 'nho' : 'to';
    const mains = [{ axis: 'z', line: 1 }];
    const t = RD.suggestRoadTiers(m, mains);
    const G = CL.roadGraph(m);
    for (const s of RD.allSegments(m)) {
      const want = s.axis === 'z' && s.line === 1 ? 'big' : (() => {
        const sides = RD.sideBlocks(s).filter(Boolean).map(([bx]) => (bx < CL.CITY.N / 2 ? 0 : 2));
        const avg = sides.reduce((a, b) => a + b, 0) / sides.length;
        return avg >= 1.5 ? 'big' : avg <= 0.5 ? 'small' : 'normal';
      })();
      assert.equal(t[s.id] || 'normal', want, s.id);
    }
    for (const id of Object.keys(t)) assert.ok(!G.waterSegs.has(id) && !G.closedSegs.has(id), `đoạn sông / gộp ${id}`);
    assert.ok(Object.values(t).every((v) => v === 'big' || v === 'small'), 'đường thường không ghi');
    // khu trộn tỉ lệ: mỗi tuyến trong khu một cấp (không loang lổ)
    m.districts.nho.roads = { small: 1, normal: 1 };
    const t2 = RD.suggestRoadTiers(m, []);
    for (let line = 0; line < CL.CITY.N / 2 - 1; line++) {
      const segs = RD.allSegments(m).filter((s) => s.axis === 'x' && s.line === line && line > 0);
      if (segs.length) assert.equal(new Set(segs.map((s) => t2[s.id] || 'normal')).size, 1, `tuyến x${line}`);
    }
  });
  test('Luật theo cấp: ổ gà dồn về đường nhỏ, kẹt xe dồn về đại lộ; giới hạn tốc độ đại lộ > thường > nhỏ', () => {
    const saved = MAP.roadTiers;
    MAP.roadTiers = {};
    for (const s of RD.allSegments()) MAP.roadTiers[s.id] = s.line % 2 ? 'small' : 'big';
    try {
      const per = { big: [0, 0], small: [0, 0] };
      for (const s of RD.allSegments()) per[MAP.roadTiers[s.id]][1]++;
      let jamBig = 0, jamSmall = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const h = new HazardManager(makeRng(seed), 1);
        for (const p of h.potholes) {
          const s = RD.roadSegAt(p.x, p.z);
          if (s) per[RD.tierOf(s.id)][0]++;
          const tg = RD.TIER_GEO[RD.tierOf(s.id)], lat = Math.abs(s.axis === 'x' ? p.x - CL.roadPos(s.line) : p.z - CL.roadPos(s.line));
          assert.ok(lat <= tg.half && lat >= tg.median, `ổ gà nằm ngoài mặt nhựa / trên dải phân cách (${lat.toFixed(1)})`);
        }
        for (const j of h.jams) for (const s of j.segments) (RD.tierOf(RD.segKeyOf(s.axis, s.line, s.from)) === 'big' ? jamBig++ : jamSmall++);
      }
      assert.ok(per.small[0] / per.small[1] > (per.big[0] / per.big[1]) * 2, `ổ gà mỗi đoạn: nhỏ ${(per.small[0] / per.small[1]).toFixed(2)}, đại lộ ${(per.big[0] / per.big[1]).toFixed(2)}`);
      assert.ok(jamBig > jamSmall, `kẹt: đại lộ ${jamBig}, nhỏ ${jamSmall}`);
    } finally {
      if (saved === undefined) delete MAP.roadTiers;
      else MAP.roadTiers = saved;
    }
    const L = (t) => RD.speedLimitOf(t, ECONOMY.speedLimit);
    assert.ok(L('big') > L('normal') && L('normal') > L('small'));
    assert.equal(L('normal'), ECONOMY.speedLimit);
  });
  test('Kiểm tra dữ liệu: đoạn đường lạ, cấp lạ, tỉ lệ cấp đường khu phố sai', () => {
    const { validateMap } = VALIDATE;
    const rd = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
    const bad = rd('src/data/map.json');
    bad.roadTiers = { 'x99:0': 'big', 'x1:0': 'rộng' };
    bad.districts = { ...bad.districts, xx: { name: 'X', roads: { sieuto: 1, small: -1 } } };
    const f = validateMap(bad, rd('src/data/places.json')).filter((i) => i.level === 'error').map((i) => `${i.ref}.${i.field}`);
    for (const k of ['roads.x99:0', 'roads.x1:0']) assert.ok(f.includes(k), `không bắt lỗi ${k}`);
    assert.equal(f.filter((x) => x === 'district:xx.roads').length, 2);
  });
}

console.log('Xe buýt (tuyến, trạm, lịch chạy)');
{
  const BUS = await import('../src/sim/bus.js');
  const CL = await import('../src/sim/cityLayout.js');
  const { MAP } = await import('../src/data/map.js');
  // tuyến thử dựng từ địa điểm có sẵn (không phụ thuộc tuyến người dùng đặt)
  const { ORDER_TYPES } = await import('../src/data/apps.js');
  const placed = layout.places.filter((p) => p.kind !== 'scenery' && p.lot !== 'C' && !p.inAlley && BUS.frontSegment(p));
  const pick3 = [placed[0], placed[Math.floor(placed.length / 2)], placed[placed.length - 1]].map((p) => p.id);
  const testMap = { ...MAP, busRoutes: [{ id: 'tt', name: 'Thử', color: '#123456', buses: 3, via: pick3 }], busStopNames: {} };
  const sys = BUS.buildBusSystem(layout, testMap);
  const r = sys.routes[0];
  test('Dựng tuyến: vòng kín qua đúng các điểm ghé, có trạm, nhà chờ trên vỉa hè không chắn cửa nhà', () => {
    assert.equal(r.error, null, `lỗi ${r.error}`);
    assert.ok(r.length > 100 && r.stops.length >= pick3.length, `${Math.round(r.length)} m, ${r.stops.length} trạm`);
    assert.deepEqual(r.nodes[0], r.nodes[r.nodes.length - 1], 'vòng kín');
    for (let k = 1; k < r.nodes.length; k++) assert.equal(Math.abs(r.nodes[k][0] - r.nodes[k - 1][0]) + Math.abs(r.nodes[k][1] - r.nodes[k - 1][1]), 1, 'đi theo từng đoạn đường');
    const doors = [...layout.places.map((p) => p.door), ...layout.lots.map((l) => l.door)];
    for (const st of sys.stops) {
      assert.ok(CL.blockAt(st.x, st.z), `trạm ${st.id} không nằm trên vỉa hè`);
      assert.ok(doors.every((d) => Math.hypot(d.x - st.x, d.z - st.z) > 2), `trạm ${st.id} chắn cửa nhà`);
      assert.ok(st.name && st.name.length > 3, 'trạm có tên');
    }
    // mỗi điểm ghé có trạm trong vòng 30 m
    for (const id of pick3) {
      const p = layout.placeById[id];
      assert.ok(r.stops.some((s) => Math.hypot(sys.byId[s.id].x - p.door.x, sys.byId[s.id].z - p.door.z) < 30), `không có trạm gần ${p.name}`);
    }
    // tên người dùng đặt thay tên tự đặt
    const st0 = sys.stops[0];
    const named = BUS.buildBusSystem(layout, { ...testMap, busStopNames: { [st0.id]: 'Trạm Cây Đa' } });
    assert.equal(named.byId[st0.id].name, 'Trạm Cây Đa');
  });
  test('Lịch chạy: chờ không quá 1 khoảng cách giữa 2 xe; đi theo chiều tuyến; chọn nhầm (đi ngược) thì mất gần 1 vòng', () => {
    const T = r.timetable, head = T.lap / r.buses;
    const [a, b] = [r.stops[0].id, r.stops[1].id];
    for (let now = 600; now < 600 + T.lap; now += 7) {
      const t = BUS.tripOn(r, a, b, now);
      assert.ok(t.wait >= 0 && t.wait <= head + 0.01, `chờ ${t.wait.toFixed(1)} > ${head.toFixed(1)}`);
      assert.ok(t.arrive > t.board && Math.abs(t.total - (t.wait + t.ride)) < 1e-6);
    }
    const fwd = BUS.tripOn(r, a, b, 600), back = BUS.tripOn(r, b, a, 600);
    assert.ok(back.ride > fwd.ride * 3 && back.ride < T.lap + T.dwell, `đi ngược ${back.ride.toFixed(0)} phút, xuôi ${fwd.ride.toFixed(0)}`);
    assert.equal(BUS.tripOn(r, a, a, 600), null);
    const ds = BUS.destinations(sys, a, 600);
    assert.equal(ds.length, r.stops.length - 1);
    for (let i = 1; i < ds.length; i++) assert.ok(ds[i].trip.arrive >= ds[i - 1].trip.arrive);
  });
  test('Xe trên đường khớp lịch: lúc xe tới trạm thì đứng sát trạm; ngoài giờ chạy không đón khách', () => {
    const T = r.timetable, st = T.stops[2];
    const poses = BUS.busPoses(r, st.arrive + 0.2); // xe số 0 ở pha đúng giờ tới trạm 3
    const s = sys.byId[st.id];
    assert.ok(poses[0].stopped && Math.hypot(poses[0].x - s.x, poses[0].z - s.z) < 7, `xe cách trạm ${Math.hypot(poses[0].x - s.x, poses[0].z - s.z).toFixed(1)} m`);
    assert.ok(BUS.inService(8 * 60) && !BUS.inService(23 * 60) && !BUS.inService(3 * 60));
  });
  test('Gợi ý đi buýt (xe bị cẩu): trạm gần mình → trạm gần nơi giữ xe, cùng tuyến', () => {
    const A = sys.byId[r.stops[0].id], B = sys.byId[r.stops[r.stops.length - 1].id];
    const h = BUS.busHint(sys, A.wait.x + 2, A.wait.z, B.wait.x, B.wait.z + 2);
    assert.ok(h && h.route.id === 'tt' && h.from.id !== h.to.id);
  });
  test('Dữ liệu tuyến hiện tại chạy được; bộ kiểm tra bắt tuyến sai', () => {
    const real = BUS.buildBusSystem(layout, MAP);
    for (const x of real.routes) assert.equal(x.error, null, `${x.name}: ${x.error}`);
    const bad = { ...MAP, busRoutes: [{ id: 'x y', name: '', color: 'xanh', buses: 9, via: ['khongCo'] }], busStopNames: { a: 5 } };
    const f = VALIDATE.validateMap(bad, DATA.places).filter((i) => i.level === 'error').map((i) => `${i.ref}.${i.field}`);
    for (const k of ['bus:x y.id', 'bus:x y.name', 'bus:x y.color', 'bus:x y.buses', 'bus:x y.via', 'bus.busStopNames']) assert.ok(f.includes(k), `không bắt lỗi ${k}: ${f.join(', ')}`);
  });
  test('Hàng riêng của tiệm: loại đơn bật "shopItems" lấy ở tiệm có hàng riêng thì giao hàng của tiệm; hỏa tốc thì không', () => {
    // chỉ tiệm thử có "gửi hàng từ đây" (các nơi khác tắt) để đơn chắc chắn lấy ở đó
    const shop = { ...layout.places.find((p) => p.kind !== 'scenery'), id: 'shopThu', orders: { parcelWeight: 10, parcelItems: ['dienThoai'] } };
    const others = layout.places.map((p) => (p.orders?.parcelWeight ? { ...p, orders: { ...p.orders, parcelWeight: 0 } } : p));
    const lay = { ...layout, places: [...others, shop], placeById: { ...layout.placeById, shopThu: shop } };
    const om = new OrderManager({ rng: makeRng(5), layout: lay, gs: workerState({ day: DAY_ALL }) });
    for (let i = 0; i < 20; i++) {
      const o = om.makeParcel({ ...ORDER_TYPES.parcel, items: ['taiLieu'], shopItems: true, codChance: 0 }, 600, shop.door);
      assert.equal(o.pickup.placeId, 'shopThu');
      assert.deepEqual(o.itemIds, ['dienThoai']);
      assert.deepEqual(om.makeParcel({ ...ORDER_TYPES.parcel, items: ['taiLieu'], shopItems: false, codChance: 0 }, 600, shop.door).itemIds, ['taiLieu']);
    }
    const bad = JSON.parse(JSON.stringify(DATA.places));
    bad.places[0].orders = { parcelWeight: 1, parcelItems: ['khongCo', 'pho'] };
    const errs = VALIDATE.validatePlaces(bad, DATA.items).filter((i) => i.level === 'error' && i.field === 'orders.parcelItems');
    assert.equal(errs.length, 2);
  });
}

console.log('Loại khách mới: nhà dân + địa điểm, đổi điểm đến, lừa đảo, vali, nước ngoài');
{
  const { RIDER_TYPES, FROM_HOMES } = await import('../src/data/apps.js');
  const { RIDE_EVENTS } = await import('../src/data/balance.js');
  // chạy makeRide với một loại khách thử (không phụ thuộc dữ liệu người dùng)
  const offerNow = (om, make, now) => {
    if (om.state === S.OFFLINE) om.goOnline();
    om.offer = make();
    om.go(S.OFFERED);
    return om.accept(now, { x: 0, z: 0 });
  };
  const withType = (om, r) => { const old = om.pickRider; om.pickRider = () => r; return () => { om.pickRider = old; }; };
  const base = { id: 'thu', name: 'Thử', weight: 1, viaApp: true, comfortKmh: 40, fareMult: 1, deadlineMult: 1, quitBelow: 0 };
  const shop = layout.places.find((p) => p.kind === 'restaurant' && (!p.hours || p.hours === 'haiTuGio' || p.hours === 'caNgay'));
  const mk = (seed = 21, money = 500) => {
    const { om, gs } = mkOM(seed, { carry: { money, flags: { wallet: 5 } } });
    gs.buy('goods', 'spareHelmet');
    return { om, gs };
  };
  test('"Đón ở": chỉ địa điểm → luôn ở địa điểm; thêm 🏠 Nhà dân → cả hai; để trống → như cũ', () => {
    const { om } = mk();
    let undo = withType(om, { ...base, from: [shop.id] });
    for (let i = 0; i < 30; i++) assert.equal(om.makeRide({ x: 0, z: 0 }, false, 12 * 60).pickup.placeId, shop.id);
    undo();
    undo = withType(om, { ...base, from: [FROM_HOMES, shop.id] });
    let atShop = 0, atHome = 0;
    for (let i = 0; i < 80; i++) (om.makeRide({ x: 0, z: 0 }, false, 12 * 60).pickup.placeId === shop.id ? atShop++ : atHome++);
    undo();
    assert.ok(atShop > 15 && atHome > 15, `địa điểm ${atShop}, nhà dân ${atHome}`);
    // chỉ tick nhà dân (địa điểm đều đóng cửa) vẫn có khách
    assert.ok(om.pickRider.call({ ...om, riderPlaces: () => [] }, 12 * 60));
  });
  test('Đổi điểm đến: đồng ý (bù tiền / không bù) → chở tới chỗ mới; từ chối → khách xuống, trả theo quãng, sao thấp', () => {
    for (const [choice, pays] of [[true, true], [true, false], [false, false]]) {
      const { om, gs } = mk(31);
      const undo = withType(om, { ...base, changeDestChance: 1, changeDestPays: pays ? 1 : 0 });
      const o = offerNow(om, () => om.makeRide({ x: 0, z: 0 }, false, 12 * 60), 12 * 60);
      undo();
      assert.ok(om.boardPassenger(12 * 60));
      assert.equal(o.midEvent?.type, 'changeDest');
      const mid = { x: (o.pickup.door.x + o.dropoff.door.x) / 2, z: (o.pickup.door.z + o.dropoff.door.z) / 2 };
      om.checkMidEvent(12 * 60 + 5, mid, true);
      if (!o.midEvent.alt) continue; // không có chỗ đổi gần đó
      const km0 = o.distanceKm, old = o.dropoff.lotKey;
      const r = om.resolveChangeDest(choice, 12 * 60 + 5, mid);
      if (choice) {
        assert.notEqual(o.dropoff.lotKey, old);
        assert.ok(pays ? o.distanceKm >= km0 : o.distanceKm === km0, `km ${km0} → ${o.distanceKm}`);
      } else {
        assert.ok(r && r.quit && r.ev.stars === (RIDE_EVENTS.refuseStars ?? 3));
        gs.applyReceipt(r);
        assert.equal(om.order, null);
      }
    }
  });
  test('Khách lừa đảo: thẻ đơn có dấu hiệu; chạy vào → mất tiền (≤ tối đa); mời xuống → ví còn nguyên; chở tới đồn → được thưởng', () => {
    const scam = { ...base, scam: true, robMax: 200, robPctMin: 0.5 };
    for (const choice of ['comply', 'refuse', 'police']) {
      const { om, gs } = mk(41, 500);
      const undo = withType(om, scam);
      const o = offerNow(om, () => om.makeRide({ x: 0, z: 0 }, false, 22 * 60), 22 * 60);
      undo();
      assert.ok(o.flags.scam && o.flags.vague && o.midEvent.type === 'scam');
      om.boardPassenger(22 * 60);
      const station = layout.places.find((p) => p.kind === 'police');
      const pos = choice === 'police' && station ? station.door : { x: (o.pickup.door.x + o.dropoff.door.x) / 2, z: (o.pickup.door.z + o.dropoff.door.z) / 2 };
      om.checkMidEvent(22 * 60 + 5, pos, true);
      const m0 = gs.money;
      if (choice === 'police') {
        if (!o.midEvent.station) continue; // bản đồ không có đồn
        om.resolveScam('police', 22 * 60 + 5);
        assert.equal(o.dropoff.placeId, station.id);
        om.arriveAtDropoff(22 * 60 + 8);
        const r = om.finishAtPolice(22 * 60 + 8);
        assert.ok(r.reward > 0 && gs.money === m0 + r.reward && om.order === null);
      } else {
        const r = om.resolveScam(choice, 22 * 60 + 5);
        assert.equal(om.order, null);
        if (choice === 'comply') assert.ok(r.robbed >= 200 * 0.5 - 0.01 && r.robbed <= 200 && gs.money === m0 - r.robbed, `mất ${r.robbed}`);
        else assert.equal(gs.money, m0);
      }
    }
  });
  test('Khách nước ngoài: tên riêng, gọi hỏi đường mất lâu hơn; khách vali: có cờ để xe chạy chậm', () => {
    const { om } = mk(51);
    const undo = withType(om, { ...base, foreign: true, vagueChance: 1, names: ['Emma'] });
    const o = offerNow(om, () => om.makeRide({ x: 0, z: 0 }, false, 12 * 60), 12 * 60);
    undo();
    assert.equal(o.customer, 'Emma');
    om.boardPassenger(12 * 60);
    if (!o.revealed) assert.equal(om.callCustomer(12 * 60).waitMin, RIDE_EVENTS.foreignCallMin ?? 4);
    for (const r of Object.values(RIDER_TYPES)) if (r.luggage) assert.ok(r.fareMult >= 1, `${r.name}: khách vali nên cước ≥ thường`);
  });
  test('Kiểm tra dữ liệu: "nhaDan" hợp lệ trong Đón ở; tỉ lệ đổi điểm đến ngoài 0–100% là lỗi', () => {
    const { validateApps } = VALIDATE;
    const bad = JSON.parse(JSON.stringify(DATA.apps));
    bad.riderTypes.app.from = [FROM_HOMES];
    bad.riderTypes.app.changeDestChance = 3;
    const errs = validateApps(bad, DATA.items, DATA.places).filter((i) => i.level === 'error').map((i) => `${i.ref}.${i.field}`);
    assert.ok(errs.includes('app.changeDestChance') && !errs.includes('app.from'), errs.join(', '));
  });
}

console.log('Điện thoại: thứ tự app (phone.json, thẻ 📱 Giao diện app)');
{
  const { phoneApps, validatePhone, APP_DEFS } = await import('../src/data/phoneApps.js');
  test('Thứ tự / biểu tượng / màu theo dữ liệu; app lạ bỏ qua, thiếu thì thêm cuối; app khóa không ẩn được; app ẩn vẫn mở qua liên kết', () => {
    const p = phoneApps({ apps: [
      { id: 'bag', icon: 'X', color: '#123456' },
      { id: 'nope', icon: '?', color: '#000000' },
      { id: 'goship', icon: 'G', color: '#000000', hidden: true },
      { id: 'map', icon: 'M', color: 'sai', hidden: true },
    ] });
    assert.deepEqual(p.visible.slice(0, 2).map((a) => a[0]), ['bag', 'goship'], 'GoShip khóa → không ẩn');
    assert.deepEqual(p.visible[0].slice(1, 3), ['X', '#123456']);
    assert.ok(!p.visible.some((a) => a[0] === 'map') && p.all.some((a) => a[0] === 'map'));
    assert.equal(p.all.find((a) => a[0] === 'map')[2], APP_DEFS.map.color, 'màu sai → màu mặc định');
    assert.equal(p.all.length, Object.keys(APP_DEFS).length);
    assert.ok(!p.all.some((a) => a[0] === 'nope'));
    assert.ok(p.visible.length <= 9);
  });
  test('Dữ liệu phone.json hiện tại hợp lệ; bộ kiểm tra bắt app lạ, lặp, thiếu biểu tượng, màu sai, ẩn app khóa', () => {
    assert.deepEqual(validatePhone(readJson('src/data/phone.json')), []);
    const bad = validatePhone({ apps: [{ id: 'goship', icon: '', color: 'x', hidden: true }, { id: 'goship', icon: 'a', color: '#000000' }, { id: 'zzz' }] });
    for (const f of ['icon', 'color', 'hidden']) assert.ok(bad.some((i) => i.level === 'error' && i.field === f), f);
    assert.ok(bad.some((i) => i.level === 'error' && i.msg.includes('lặp')));
    assert.ok(bad.some((i) => i.level === 'error' && i.ref === 'zzz'));
    assert.ok(bad.some((i) => i.level === 'warn'), 'thiếu app → cảnh báo');
    for (const d of Object.values(APP_DEFS)) assert.ok(CONTENT.has(d.key), d.key);
  });
}

console.log('Đồ của hãng: quà khi vào hãng, nón chở khách bị mất');
{
  const GOODS_MOD = await import('../src/data/goods.js');
  const { GOODS, outfitLook } = GOODS_MOD;
  const { makePerson } = await import('../src/world/models.js');
  const { ORDER_TYPES, RIDER_TYPES } = await import('../src/data/apps.js');
  const { RIDE_EVENTS, PARKING } = await import('../src/data/balance.js');
  const PK = await import('../src/sim/parking.js');
  const seatOf = (brand) => Object.values(GOODS).find((g) => g.brand === brand && g.type === 'equipment' && g.effects?.passengerSeat);
  test('Vào hãng: được tặng quà (mũ hãng đội luôn, nón chở khách → nhận được đơn chở khách); đổi hãng thì trả hết đồ hãng cũ', () => {
    const gs = new GameState({ day: 1, carry: { money: 5000, flags: { story: 2 } } });
    gs.leaveBrand(); // bản lưu mẫu mặc định đang ở hãng → nghỉ để thử đăng ký từ đầu
    assert.ok(!gs.effect('passengerSeat'));
    assert.ok(gs.joinBrand('goship').ok);
    for (const id of BRANDS_T.goship.gifts) assert.ok(gs.owned.gear.includes(id), `được tặng ${id}`);
    const helmet = BRANDS_T.goship.gifts.map((id) => GOODS[id]).find((g) => g.slot === 'helmet');
    if (helmet) assert.equal(gs.wornIds().helmet, helmet.id, 'mũ hãng đội luôn');
    assert.ok(gs.effect('passengerSeat'), 'có nón chở khách');
    assert.ok(gs.joinBrand('hongsm').ok);
    assert.ok(!gs.owned.gear.some((id) => GOODS[id]?.brand === 'goship'), 'trả hết đồ GripBike (đồng phục, mũ, nón)');
    for (const id of BRANDS_T.hongsm.gifts) assert.ok(gs.owned.gear.includes(id), `được tặng ${id}`);
    const camHelmet = BRANDS_T.hongsm.gifts.map((id) => GOODS[id]).find((g) => g.slot === 'helmet');
    if (camHelmet) assert.equal(gs.wornIds().helmet, camHelmet.id);
  });
  test('Mũ bảo hiểm: lúc đầu không có (đầu trần, xe đạp không bị bắt); vào hãng được cấp + đội; tháo ra trên xe máy → lỗi đầu trần', () => {
    const fresh = new GameState({ carry: { profile: { name: 'A' } } });
    assert.equal(fresh.wornIds().helmet, undefined, 'chơi mới chưa có mũ');
    assert.ok(!Object.values(GOODS).some((g) => g.type === 'outfit' && g.slot === 'helmet' && fresh.ownsOutfit(g.id)), 'không có mũ nào trong túi');
    assert.equal(outfitLook(fresh.wornGoods()).hat, null, 'hình nhân vật đầu trần');
    assert.ok(fresh.power === 'pedal' && !fresh.helmetRequired && !fresh.noHelmet, 'xe đạp thường không bắt buộc');
    const gs = new GameState({ day: 1, carry: { money: 5000, flags: { story: 2 } } });
    gs.leaveBrand();
    gs.joinBrand('goship');
    assert.ok(gs.helmetRequired, 'xe hãng cấp là xe máy / xe điện');
    const helmet = BRANDS_T.goship.gifts.map((id) => GOODS[id]).find((g) => g.slot === 'helmet');
    if (helmet) {
      assert.ok(!gs.noHelmet && outfitLook(gs.wornGoods()).hat === 'helmet', 'đội mũ hãng');
      assert.ok(gs.takeOff('helmet') && gs.noHelmet, 'tháo mũ → đầu trần');
      assert.ok(gs.wear(helmet.id) && !gs.noHelmet, 'đội lại');
      gs.leaveBrand();
      assert.equal(gs.wornIds().helmet, undefined, 'nghỉ hãng trả mũ → đầu trần');
    }
    assert.ok(ECONOMY.noHelmetFine > 0, 'có mức phạt không đội mũ');
  });
  test('Quần áo mua ở shop: mọi kiểu dựng được, đồ nữ chỉ nhân vật nữ mua / mặc, kiểu + màu phụ đi vào ngoại hình', () => {
    const { OUTFIT_SLOTS, FEMALE_STYLES } = GOODS_MOD;
    const shopOutfits = Object.values(GOODS).filter((g) => g.type === 'outfit' && g.price > 0 && !g.brand);
    assert.ok(shopOutfits.length >= 100, 'đủ nhiều món');
    for (const slot of ['shirt', 'pants', 'shoes', 'cap', 'wrist', 'bag']) for (const st of Object.keys(OUTFIT_SLOTS[slot].styles)) {
      const g = Object.values(GOODS).find((x) => x.type === 'outfit' && x.slot === slot && x.style === st);
      assert.ok(g, 'có món kiểu ' + slot + '/' + st);
      if (FEMALE_STYLES.includes(st)) assert.equal(g.gender, 'f', g.id + ' là đồ nữ');
      const look = outfitLook({ [slot]: g });
      const m = makePerson({ ...look, gender: g.gender === 'f' ? 'f' : 'm' });
      assert.ok(m.userData.parts.torso.geometry.attributes.position.count > 0, g.id);
    }
    // kiểu + màu phụ vào ngoại hình; mũ lưỡi trai không đè mũ bảo hiểm
    const hoodie = Object.values(GOODS).find((g) => g.style === 'hoodie');
    assert.equal(outfitLook({ shirt: hoodie }).shirtStyle, 'hoodie');
    const cap = Object.values(GOODS).find((g) => g.slot === 'cap');
    const helmet = Object.values(GOODS).find((g) => g.slot === 'helmet' && g.price > 0);
    assert.equal(outfitLook({ cap }).hat, 'cap');
    assert.equal(outfitLook({ cap, helmet }).hat, 'helmet');
    // áo dài có tà trước theo chân
    const aodai = makePerson(outfitLook({ shirt: GOODS.aoDaiTrang }));
    assert.ok(aodai.userData.parts.ta, 'tà trước');
    // nam không mua / mặc được đồ nữ; nữ thì được
    const dress = Object.values(GOODS).find((g) => g.style === 'dress');
    const man = new GameState({ carry: { money: 5000, profile: { name: 'A', gender: 'm' } } });
    assert.ok(!man.buy('goods', dress.id).ok && !man.wear(dress.id));
    const woman = new GameState({ carry: { money: 5000, profile: { name: 'B', gender: 'f' } } });
    assert.ok(woman.buy('goods', dress.id).ok && woman.wear(dress.id) && woman.wornIds().shirt === dress.id);
    assert.ok(woman.buy('goods', cap.id).ok && woman.wear(cap.id) && woman.takeOff('cap'), 'mũ lưỡi trai là phụ kiện');
  });
  test('Bản lưu cũ đã ở hãng mà chưa nhận quà → tặng bù 1 lần (lưu rồi mở lại không tặng thêm)', () => {
    const gs = new GameState({ day: 3, carry: { money: 100, brand: 'goship', owned: { vehicles: ['xeDap', 'cub'], bags: ['nylon'], gear: [] } } });
    for (const id of BRANDS_T.goship.gifts) assert.ok(gs.owned.gear.includes(id));
    const seat = seatOf('goship');
    gs.losePassengerHelmet();
    const again = new GameState({ day: 4, carry: gs.carryOver() });
    assert.ok(!again.owned.gear.includes(seat.id), 'mất nón rồi thì mở lại vẫn mất (không tặng lại)');
  });
  test('Chở khách xong khách cầm luôn nón đi: theo tỉ lệ chung / riêng loại khách; hết nón thì không còn đơn chở khách', () => {
    const { om, gs } = mkOM(21, { carry: { money: 500, gifted: null, flags: { wallet: 5 } } });
    assert.ok(gs.passengerHelmets().length >= 1, 'được tặng bù nón');
    const ride = (pct) => {
      const old = RIDE_EVENTS.helmetTaken, oldR = RIDER_TYPES.app.helmetTaken;
      RIDE_EVENTS.helmetTaken = pct;
      delete RIDER_TYPES.app.helmetTaken;
      const orig = om.pickRider;
      om.pickRider = () => RIDER_TYPES.app;
      try {
        if (om.state === S.OFFLINE) om.goOnline();
        om.offer = om.makeRide({ x: 0, z: 0 }, false, 600);
        om.go(S.OFFERED);
        om.accept(600, { x: 0, z: 0 });
        om.boardPassenger(600);
        om.arriveAtDropoff(610);
        return om.handOver(612);
      } finally {
        om.pickRider = orig;
        RIDE_EVENTS.helmetTaken = old;
        if (oldR !== undefined) RIDER_TYPES.app.helmetTaken = oldR;
      }
    };
    const n = gs.passengerHelmets().length;
    assert.ok(!ride(0).helmetLost && gs.passengerHelmets().length === n, 'tỉ lệ 0 → không mất');
    const events = [];
    om.on((e) => e.type === 'helmetTaken' && events.push(e));
    const r = ride(1);
    assert.ok(r.helmetLost && gs.passengerHelmets().length === n - 1 && events.length === 1, 'tỉ lệ 100% → mất 1 nón, báo sự kiện');
    while (gs.passengerHelmets().length) gs.losePassengerHelmet();
    assert.ok(!gs.effect('passengerSeat'), 'hết nón → khóa đơn chở khách');
    assert.equal(gs.losePassengerHelmet(), null);
    assert.ok(gs.buy('goods', seatOf('goship').id).ok && gs.effect('passengerSeat'), 'mua lại nón của hãng');
  });
  test('Đậu xe: mất nón ngoài đường / bãi giữ xe theo tỉ lệ riêng; hầm nhà trọ không mất; chưa hết thời gian được để yên thì chưa mất', () => {
    const always = { next: () => 0 }, never = { next: () => 0.999999 };
    const P = { ...PARKING, graceMin: 20, helmetStreetPerHour: 0.5, helmetLotPerHour: 0 };
    const street = { since: 0, safe: false, kind: 'street' };
    assert.ok(!PK.helmetRoll(always, 10, street, {}, P), 'chưa hết 20 phút');
    assert.ok(PK.helmetRoll(always, 30, street, {}, P));
    assert.ok(!PK.helmetRoll(never, 30, street, {}, P));
    assert.ok(!PK.helmetRoll(always, 30, { ...street, helmetLost: true }, {}, P), 'mỗi lần đậu tối đa 1 lần');
    assert.ok(!PK.helmetRoll(always, 30, { since: 0, safe: true, kind: 'lot' }, {}, P), 'bãi giữ xe tỉ lệ 0');
    assert.ok(PK.helmetRoll(always, 30, { since: 0, safe: true, kind: 'lot' }, {}, { ...P, helmetLotPerHour: 0.1 }));
    assert.ok(!PK.helmetRoll(always, 300, { since: 0, safe: true, kind: 'garage' }, {}, { ...P, helmetLotPerHour: 0.9 }), 'hầm nhà trọ');
    assert.ok(!PK.helmetRoll(always, 300, { since: 0, safe: true }, {}, P), 'bản lưu cũ (chưa có loại chỗ đậu) → như cũ');
    assert.ok(!PK.helmetRoll(always, 30, street, { theftMul: 0 }, P), 'khu phố không trộm');
  });
  test('Bộ kiểm tra: quà khi vào hãng phải có thật, là trang phục / trang bị; đồ của hãng bán ngoài văn phòng → cảnh báo', () => {
    const goods = JSON.parse(JSON.stringify(readJson('src/data/goods.json')));
    const apps = JSON.parse(JSON.stringify(DATA.apps));
    apps.brands.goship.gifts = ['khongCo', 'raincoat'];
    const places = JSON.parse(JSON.stringify(DATA.places));
    const shop = places.places.find((p) => p.kind === 'shop');
    const seat = seatOf('hongsm');
    shop.sells = { ...(shop.sells || {}), goods: [...(shop.sells?.goods || []), seat.id] };
    const iss = VALIDATE.validateBrands(apps, DATA.gear, places, goods);
    assert.ok(iss.some((i) => i.ref === 'goship' && i.field === 'gifts' && i.level === 'error' && i.msg.includes('khongCo')));
    assert.ok(!iss.some((i) => i.ref === 'goship' && i.field === 'gifts' && i.msg.includes(goods.raincoat.name)), 'áo mưa (đồ thường) tặng được');
    assert.ok(iss.some((i) => i.ref === shop.id && i.field === 'sells' && i.level === 'warn'));
    goods[seat.id].brand = 'khongCoHang';
    assert.ok(VALIDATE.validateBrands(DATA.apps, DATA.gear, DATA.places, goods).some((i) => i.ref === seat.id && i.field === 'brand' && i.level === 'error'));
  });
}

console.log('Hầm xe nhà trọ: xe để dành, đổi xe');
{
  const G = await import('../src/sim/garage.js');
  test('Chỗ dựng xe để dành: đủ PARK_SLOTS chỗ, nằm trong hầm, không đè nhau, không đè chỗ xe đang dùng (4 hướng)', () => {
    for (const face of ['N', 'S', 'E', 'W']) {
      const p = { x0: 0, x1: face === 'E' || face === 'W' ? 9 : 4, z0: 0, z1: face === 'E' || face === 'W' ? 4 : 9, face };
      const sl = G.parkSlots(p), main = G.garageSpots(p).bike;
      assert.equal(sl.length, G.PARK_SLOTS, face);
      for (const a of sl) {
        assert.ok(G.inGarage(p, a.x, a.z, 0.5), `${face}: chỗ dựng nằm trong hầm`);
        assert.ok(Math.hypot(a.x - main.x, a.z - main.z) > 0.6, `${face}: không đè xe đang dùng`);
      }
      for (let i = 1; i < sl.length; i++) assert.ok(Math.hypot(sl[i].x - sl[i - 1].x, sl[i].z - sl[i - 1].z) > 1.8, `${face}: hai xe để dành cách nhau`);
    }
    const home = layout.placeById.home;
    for (const a of G.parkSlots(home)) assert.ok(G.inGarage(home, a.x, a.z, 0.5), 'phòng trọ thật');
  });
  test('Xe không dùng nằm trong hầm; lấy xe ra thì xe đang dùng dựng vào đúng chỗ đó; hầm đầy thì không mua thêm được', () => {
    const gs = workerState({ carry: { money: 99999 } });
    assert.deepEqual(gs.parkedVehicles, ['xeDap'], 'đang chạy cub → xe đạp trong hầm');
    assert.ok(gs.buy('vehicles', 'wave').ok);
    assert.equal(gs.vehicle, 'wave', 'xe mới chạy luôn');
    assert.deepEqual(gs.parkedVehicles, ['xeDap', 'cub'], 'xe cũ về hầm');
    const r = gs.swapVehicle('xeDap');
    assert.ok(r.ok && gs.vehicle === 'xeDap');
    assert.deepEqual(gs.parkedVehicles, ['wave', 'cub'], 'wave dựng vào chỗ xe đạp vừa lấy (chỗ số 1)');
    assert.ok(!gs.swapVehicle('xeDap').ok, 'đang dùng rồi');
    assert.ok(!gs.swapVehicle('SH').ok, 'không có xe này');
    assert.ok(gs.buy('vehicles', 'scooter').ok);
    assert.equal(gs.parkedVehicles.length, G.PARK_SLOTS, 'hầm đầy');
    const m = gs.money, b = gs.buy('vehicles', 'exciter');
    assert.ok(!b.ok && gs.money === m && !gs.owned.vehicles.includes('exciter'), 'hầm đầy: không mua được, không mất tiền');
    assert.ok(gs.sellVehicle('wave').ok);
    assert.ok(gs.buy('vehicles', 'exciter').ok, 'bán bớt rồi mua được');
  });
  test('Xe bị giữ ở đồn mà thiếu tiền: lấy được xe đạp trong hầm, xe kia ở lại đồn; đủ tiền chuộc → xe về hầm', () => {
    const gs = workerState({ carry: { money: 50 } });
    gs.towed = { placeId: 'police1', fee: 150 };
    assert.deepEqual(gs.parkedVehicles, ['xeDap']);
    const r = gs.leaveTowed('xeDap');
    assert.ok(r.ok && gs.vehicle === 'xeDap' && !gs.towed, 'lấy xe đạp ra chạy, hết bị kẹt');
    assert.deepEqual(gs.impound.map((x) => x.id), ['cub'], 'cub nằm ở đồn');
    assert.deepEqual(gs.parkedVehicles, [], 'cub không nằm trong hầm (không lấy lậu được)');
    assert.ok(!gs.canSell('cub') && !gs.swapVehicle('cub').ok, 'xe ở đồn: không bán, không lấy ra được');
    assert.ok(!gs.redeemImpound(0).ok && gs.money === 50, 'thiếu tiền: chưa chuộc, không mất tiền');
    gs.money = 500;
    const q = gs.redeemImpound(0);
    assert.ok(q.ok && gs.money === 350 && !gs.impound.length, 'chuộc xong');
    assert.deepEqual(gs.parkedVehicles, ['cub'], 'cub về hầm');
    assert.deepEqual(new GameState({ carry: gs.carryOver?.() ?? gs.toSave?.() ?? {} }).impound ?? [], [], 'lưu được');
  });
  test('Vào hãng khi hầm đầy: chưa vào được (không mất cọc); đủ chỗ thì xe đang dùng về hầm', () => {
    const full = new GameState({ day: 1, carry: { money: 5000, vehicle: 'wave', owned: { vehicles: ['xeDap', 'cub', 'wave', 'scooter'], bags: ['nylon'], gear: [] }, flags: { story: 2 } } });
    const m = full.money, before = full.brand, r = full.joinBrand('hongsm');
    assert.ok(!r.ok && full.brand === before && full.money === m, 'hầm đầy → chưa vào hãng mới');
    const ok = new GameState({ day: 1, carry: { money: 5000, flags: { story: 2 } } });
    assert.ok(ok.joinBrand('hongsm').ok);
    assert.ok(ok.parkedVehicles.includes('xeDap') && ok.vehicle !== 'xeDap', 'xe đạp về hầm, chạy xe hãng');
  });
}

console.log('Chat: log + bong bóng (chuẩn bị chơi nhiều người)');
{
  const C = await import('../src/sim/chat.js');
  test('Làm sạch tin: bỏ ký tự điều khiển, gộp khoảng trắng, cắt độ dài; rỗng → không gửi', () => {
    assert.equal(C.cleanChat('  xin\n\tchào   bạn  '), 'xin chào bạn');
    assert.equal(C.cleanChat('a'.repeat(500)).length, C.CHAT_MAX);
    assert.equal(C.cleanChat('   '), '');
    assert.equal(C.cleanChat(null), '');
  });
  test('Kênh chat: gửi qua đường truyền rồi nhận lại; chống spam; lời NPC chỉ ở máy mình; log giữ giới hạn', () => {
    let t = 0;
    const sent = [];
    const tr = C.localTransport(), spy = { send: (m) => { sent.push(m); tr.send(m); }, onReceive: tr.onReceive };
    const ch = new C.ChatChannel({ me: { id: 'me', name: 'Tèo' }, transport: spy, now: () => t });
    const got = [];
    ch.on((l) => got.push(l));
    assert.ok(ch.send('chào cả nhà', { time: '06:10' }).ok);
    assert.equal(sent.length, 1);
    assert.ok(got[0].mine && got[0].name === 'Tèo' && got[0].text === 'chào cả nhà' && got[0].time === '06:10');
    assert.equal(ch.send('lần nữa').reason, 'spam', 'gửi liền tay → chặn');
    t += C.CHAT_GAP_MS;
    assert.ok(ch.send('lần nữa').ok);
    assert.equal(ch.send('   ').reason, 'empty');
    ch.local('npc', 'Cô Hai', 'Về rồi hả con');
    assert.equal(sent.length, 2, 'lời NPC không gửi lên đường truyền');
    assert.equal(got.at(-1).kind, 'npc');
    tr.send({ kind: 'chat', from: 'p2', name: 'Bạn khác', text: 'hi\u0007 ' });
    assert.ok(!got.at(-1).mine && got.at(-1).text === 'hi', 'tin người khác cũng được làm sạch');
    for (let i = 0; i < C.LOG_KEEP + 20; i++) ch.local('system', '', `dòng ${i}`);
    assert.equal(ch.lines.length, C.LOG_KEEP);
  });
}

console.log('Âm thanh: mã từng chỗ phát tiếng, file gắn trong sounds.json');
{
  const SP = await import('../src/data/soundSpec.js');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : d.name.endsWith('.js') ? [`${dir}/${d.name}`] : []));
  const code = walk(`${root}src`).filter((f) => !f.endsWith('soundSpec.js')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  test('Mọi sound(\'mã\') trong code đều có trong danh mục; mọi mã trong danh mục đều được code dùng tới', () => {
    const used = [...code.matchAll(/\bsound\(\s*'([\w.]+)'/g)].map((m) => m[1]);
    // sound(điều kiện ? 'a' : 'b')
    for (const m of code.matchAll(/\bsound\([^)]*\?\s*'([\w.]+)'\s*:\s*'([\w.]+)'/g)) used.push(m[1], m[2]);
    for (const id of used) assert.ok(SP.SOUNDS[id], `sound('${id}') chưa có trong soundSpec.js`);
    // mã phát từ dữ liệu cốt truyện (story.json → việc "Phát tiếng") cũng tính là có dùng
    // (+ tiếng đi kèm cảnh quay "sound" và tiếng đạo cụ lúc bắt đầu chạy)
    const storyCodes = readJson('src/data/story.json').chapters.flatMap((c) => c.steps.flatMap((st) => [...(st.on || []).filter((x) => x.do === 'sound').map((x) => x.code), ...(st.music ? [st.music] : []),
      ...(st.on || []).filter((x) => x.do === 'cine').flatMap((x) => (x.shots || []).map((sh) => sh.sound).filter(Boolean)), ...(st.on || []).filter((x) => x.do === 'prop' && x.sound).map((x) => x.sound),
      ...(st.on || []).filter((x) => x.do === 'chase').flatMap((x) => [x.nearSound, x.loop, ...(x.route || []).flatMap((r) => [].concat(r.sound || []))].filter(Boolean))]));
    for (const id of storyCodes) assert.ok(SP.SOUNDS[id], `story.json: mã âm thanh "${id}" chưa có trong soundSpec.js`);
    for (const id of SP.SOUND_IDS) assert.ok(code.includes(`'${id}'`) || storyCodes.includes(id), `mã ${id} không chỗ nào dùng`);
    assert.ok(!/\bsfx\.\w+\(\)/.test(code), 'còn chỗ gọi sfx.xxx() kiểu cũ');
    for (const s2 of Object.values(SP.SOUNDS)) assert.ok(SP.SOUND_CATS[s2.cat] && ['sfx', 'loop', 'music'].includes(s2.kind), s2.id);
  });
  test('sounds.json hợp lệ, file đã gắn có trong src/sounds; bộ kiểm tra bắt tên file sai / thiếu file / âm lượng lạ', () => {
    const data = readJson('src/data/sounds.json');
    const dir = `${root}src/sounds`;
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    assert.deepEqual(SP.validateSounds(data, files).filter((i) => i.level === 'error'), []);
    const bad = { sounds: { 'ui.click': { files: ['Tiếng Bấm.mp3', 'khongco.ogg'], volume: 5 }, 'khong.co': { files: [] } } };
    const iss = SP.validateSounds(bad, ['a.ogg']);
    assert.ok(iss.some((i) => i.ref === 'ui.click' && i.field === 'files' && i.msg.includes('Tiếng Bấm')));
    assert.ok(iss.some((i) => i.ref === 'ui.click' && i.field === 'files' && i.msg.includes('khongco.ogg')));
    assert.ok(iss.some((i) => i.ref === 'ui.click' && i.field === 'volume'));
    assert.ok(iss.some((i) => i.ref === 'khong.co' && i.level === 'warn'));
    assert.equal(SP.validateSounds({}).length, 1);
    assert.equal(SP.volumeGroup('music.menu'), 'music');
    assert.equal(SP.volumeGroup('drive.horn'), 'sfx');
  });
  const { SYNTH, previewSynth } = await import('../src/audio.js');
  test('Mọi tiếng tổng hợp ghi trong danh mục đều có thật (nghe thử được trong editor)', () => {
    assert.equal(typeof previewSynth, 'function');
    for (const s2 of Object.values(SP.SOUNDS)) if (s2.synth) assert.ok(SYNTH[s2.synth] || (s2.kind === 'loop' && ['engine', 'rain', 'city'].includes(s2.synth)), `${s2.id}: không có tiếng tổng hợp "${s2.synth}"`);
  });
  test('docs/am-thanh.md có đủ mọi mã âm thanh (danh sách để làm sound)', () => {
    const doc = fs.readFileSync(`${root}docs/am-thanh.md`, 'utf8');
    for (const id of SP.SOUND_IDS) assert.ok(doc.includes(`\`${id}\``), `docs/am-thanh.md thiếu ${id}`);
  });
}

console.log('Màn hình chính: hồ sơ shipper, cài đặt');
{
  const { normProfile, NAME_MAX } = await import('../src/sim/GameState.js');
  const { normSettings, DEFAULTS, SENS_RANGE } = await import('../src/settings.js');
  const { GOODS, startOutfit } = await import('../src/data/goods.js');
  test('Hồ sơ: tên gọn khoảng trắng, tối đa ký tự, trống → tên mặc định; giới tính lạ → nam; lưu qua ngày', () => {
    const lan = normProfile({ name: '  Lan   Anh ', gender: 'f' });
    assert.equal(lan.name, 'Lan Anh');
    assert.equal(lan.gender, 'f');
    assert.equal(lan.hairStyle, 'long', 'nữ chưa chọn tóc → tóc dài');
    // tóc / da chọn ở màn hình tạo nhân vật; giá trị lạ → mặc định
    const pick = normProfile({ gender: 'm', hairStyle: 'undercut', hair: PE.HAIR_COLORS[3], skin: PE.PLAYER_SKINS[4] });
    assert.deepEqual([pick.hairStyle, pick.hair, pick.skin], ['undercut', PE.HAIR_COLORS[3], PE.PLAYER_SKINS[4]]);
    assert.equal(normProfile({ gender: 'm' }).hairStyle, 'short', 'nam chưa chọn tóc → ngắn vuốt lệch');
    // kiểu tóc chia theo giới tính; bản lưu cũ (kiểu của giới kia) → kiểu gần nhất của giới mình
    assert.equal(normProfile({ gender: 'm', hairStyle: 'bun' }).hairStyle, 'tied');
    assert.equal(normProfile({ gender: 'f', hairStyle: 'short' }).hairStyle, 'bob');
    assert.equal(normProfile({ gender: 'f', hairStyle: 'bald' }).hairStyle, 'bob');
    assert.equal(normProfile({ gender: 'f', hairStyle: 'ponytail' }).hairStyle, 'ponytail');
    for (const g of PE.GENDERS) {
      assert.equal(PE.HAIR_BY_GENDER[g].length, 8);
      for (const st of PE.HAIR_STYLES) assert.ok(PE.HAIR_BY_GENDER[g].includes(normProfile({ gender: g, hairStyle: st }).hairStyle));
    }
    for (const st of PE.HAIR_STYLES) assert.ok(CONTENT.has('hair.' + st), 'thiếu tên kiểu tóc ' + st);
    // bộ đồ ban đầu: áo thun tay dài / ngắn + quần dài / short (món có sẵn giá 0 đúng kiểu)

    // giày đen / trắng: giày bata có sẵn tối nhất / sáng nhất; không chọn → giày đen (như trước)
    const shoeOf = (shoes) => GOODS[startOutfit(GOODS, { shoes }).shoes];
    assert.ok(shoeOf('white').price === 0 && shoeOf('black').price === 0 && shoeOf('white').id !== shoeOf('black').id);
    assert.equal(shoeOf(undefined).id, shoeOf('black').id);
    const lum = (c) => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16);
    assert.ok(lum(shoeOf('white').color) > 600 && lum(shoeOf('black').color) < 200, 'trắng sáng, đen tối');
    assert.equal(shoeOf('black').id, new GameState({ carry: { profile: { name: 'A' } } }).wornIds().shoes, 'giày đen = giày mặc sẵn như cũ');
    for (const sleeves of ['short', 'long']) for (const legs of ['shorts', 'long']) {
      const o = startOutfit(GOODS, { sleeves, legs });
      assert.deepEqual([GOODS[o.shirt].style, GOODS[o.pants].style, GOODS[o.shirt].price, GOODS[o.pants].price], [sleeves, legs, 0, 0]);
      const g2 = new GameState({ carry: { profile: { name: 'A' }, outfit: o } });
      assert.deepEqual([g2.wornGoods().shirt.style, g2.wornGoods().pants.style], [sleeves, legs], 'mặc sẵn đúng bộ đã chọn');
    }
    assert.deepEqual(startOutfit(GOODS, {}), startOutfit(GOODS, { sleeves: 'short', legs: 'shorts' }), 'không chọn → áo cộc + quần short như trước');
    // kho đồ: đồ chọn lúc tạo nhân vật (goods start) chỉ có món đã chọn, không có hết; bản lưu cũ / không chọn → món đầu như trước
    const ownedIds = (g3) => Object.values(GOODS).filter((x) => x.type === 'outfit' && g3.ownsOutfit(x.id)).map((x) => x.id);
    const pickLong = new GameState({ carry: { profile: { name: 'A' }, outfit: startOutfit(GOODS, { sleeves: 'long', legs: 'long', shoes: 'white' }) } });
    for (const slot of ['shirt', 'pants', 'shoes']) assert.equal(ownedIds(pickLong).filter((id) => GOODS[id].slot === slot).length, 1, 'chỉ 1 món ' + slot);
    assert.deepEqual(ownedIds(new GameState({ day: 2, carry: pickLong.carryOver() })), ownedIds(pickLong), 'qua ngày giữ nguyên');
    const fresh = new GameState({});
    assert.deepEqual(['shirt', 'pants', 'shoes'].map((k) => fresh.wornIds()[k]), ['shirt', 'pants', 'shoes'].map((k) => startOutfit(GOODS, {})[k]));
    assert.ok(Object.values(GOODS).every((x) => !x.start || x.price === 0), 'start chỉ cho món giá 0');
    const odd = normProfile({ hairStyle: 'mohawk', hair: 123, skin: 'xanh' });
    assert.ok(PE.HAIR_STYLES.includes(odd.hairStyle) && PE.HAIR_COLORS.includes(odd.hair) && PE.PLAYER_SKINS.includes(odd.skin));
    assert.equal(normProfile({ name: 'x'.repeat(50) }).name.length, NAME_MAX);
    assert.equal(normProfile({ name: '   ' }).name, CONTENT.fmt('profile.defaultName'));
    assert.equal(normProfile(null).gender, 'm');
    assert.equal(normProfile({ gender: 'khác' }).gender, 'm');
    const gs = new GameState({ carry: { profile: { name: 'Lan', gender: 'f' } } });
    assert.equal(gs.money, ECONOMY.startMoney, 'chơi mới có hồ sơ vẫn bắt đầu như thường');
    const next = new GameState({ day: 2, carry: gs.carryOver() });
    assert.deepEqual(next.profile, gs.profile, 'lưu qua ngày giữ nguyên ngoại hình');
    assert.equal(next.profile.name, 'Lan');
    assert.ok(new GameState({ day: 2, carry: { money: 5 } }).profile.name, 'bản lưu cũ chưa có hồ sơ → tên mặc định');
    assert.ok(CONTENT.has('profile.defaultName'));
  });
  test('Cài đặt: thiếu / hỏng → mặc định; số bị giới hạn trong khoảng', () => {
    assert.deepEqual(normSettings(null), DEFAULTS);
    assert.deepEqual(normSettings('rác'), DEFAULTS);
    const s = normSettings({ music: 7, sfx: -1, sens: -3, quality: 'siêu', invertY: 1, muted: 'có' });
    assert.equal(s.music, 1);
    assert.equal(s.sfx, 0);
    assert.equal(s.sens, SENS_RANGE[0]);
    assert.equal(s.quality, 'high');
    assert.equal(s.invertY, true);
    assert.equal(s.muted, true);
    assert.equal(normSettings({ quality: 'low', music: 'abc' }).quality, 'low');
    assert.equal(normSettings({ music: 'abc' }).music, DEFAULTS.music);
    // cài đặt cũ (1 thanh "Âm lượng") → Hiệu ứng lấy theo, Nhạc mặc định
    const old = normSettings({ volume: 0.3 });
    assert.equal(old.sfx, 0.3);
    assert.equal(old.music, DEFAULTS.music);
    assert.ok(!('volume' in old));
  });
  test('Chữ của màn hình chính, giới thiệu 5 trang, cài đặt đều có trong kho chữ', () => {
    for (let i = 1; i <= 5; i++) for (const k of ['icon', 'title', 'body']) assert.ok(CONTENT.has(`intro.p${i}.${k}`), `intro.p${i}.${k}`);
  });
}

console.log('Ngập đường & triều cường');
{
  const FL = await import('../src/sim/flood.js');
  const { FLOOD } = await import('../src/data/balance.js');
  const { roadGraph, roadPos, CITY } = CITYLAYOUT;
  const MAPD = readJson('src/data/map.json');
  // số cố định cho bộ thử (không phụ thuộc số người dùng chỉnh trong ⚖️ Cân bằng)
  const F = { ...FLOOD, tideChance: 0.2, tideFromDay: 2, tidePeakFrom: 17, tidePeakTo: 19, tideRiseMin: 60, tideHoldMin: 30, tideFallMin: 60, tideDepth: 0.9, rainDelayMin: 20, rainRiseMin: 40, rainDrainMin: 60, lowDepth: 0.6, shallow: 0.15, deep: 0.5, shallowKmh: 25, deepKmh: 10, autoLowPct: 0.12, autoTidePct: 0.4 };
  test('Gợi ý tự động: đường sát sông là "Rất trũng", không có mặt cầu / dốc cầu; đã tô thì theo dữ liệu (bỏ mã sai)', () => {
    const G = roadGraph(MAPD);
    const sug = FL.suggestFlood(MAPD, F);
    const tide = Object.keys(sug).filter((k) => sug[k] === 'tide');
    assert.ok(tide.length > 0, 'có đoạn sát sông');
    for (const id of Object.keys(sug)) assert.ok(!G.rampSegs.has(id) && !G.highSegs.has(id) && !G.bridgeSegs.has(id) && !G.waterSegs.has(id), id);
    // đoạn Rất trũng nằm trên đường song song ngay sát một con sông
    for (const id of tide) {
      const sg = FL.segOfId(id);
      assert.ok((MAPD.rivers || []).some((r) => r.axis === sg.axis && (sg.line === r.line - 1 || sg.line === r.line + (r.wide ? 2 : 1))), id);
    }
    assert.deepEqual(FL.suggestFlood(MAPD, F), sug, 'gợi ý lần nào cũng như nhau');
    const own = FL.floodMap({ ...MAPD, floodSegs: { 'x1:1': 'tide', 'z2:3': 'low', 'x1:2': 'sâu', bậy: 'low' } });
    assert.deepEqual(own, { 'x1:1': 'tide', 'z2:3': 'low' });
    assert.deepEqual(FL.floodMap({ ...MAPD, floodSegs: {} }), {}, 'tô xóa hết = không đoạn nào ngập');
  });
  test('Mực nước: mưa to một lúc mới ngập, tạnh thì rút; mưa phùn không ngập; triều lên – giữ – rút', () => {
    const rains = [{ start: 600, end: 700, heavy: true }, { start: 400, end: 500, heavy: false }];
    assert.equal(FL.rainWaterAt(450, rains, F), 0, 'mưa phùn');
    assert.equal(FL.rainWaterAt(615, rains, F), 0, 'chưa đủ 20 phút');
    assert.ok(Math.abs(FL.rainWaterAt(640, rains, F) - 0.5) < 1e-9, 'dâng nửa chừng');
    assert.equal(FL.rainWaterAt(690, rains, F), 1);
    assert.ok(Math.abs(FL.rainWaterAt(730, rains, F) - 0.5) < 1e-9, 'tạnh 30/60 phút → còn nửa');
    assert.equal(FL.rainWaterAt(760, rains, F), 0);
    const tide = { start: 1000, top: 1060, topEnd: 1090, end: 1150, peak: 1075 };
    assert.equal(FL.tideWaterAt(990, tide, F), 0);
    assert.ok(Math.abs(FL.tideWaterAt(1030, tide, F) - 0.45) < 1e-9);
    assert.equal(FL.tideWaterAt(1075, tide, F), 0.9);
    assert.ok(Math.abs(FL.tideWaterAt(1120, tide, F) - 0.45) < 1e-9);
    assert.equal(FL.tideWaterAt(1200, tide, F), 0);
    assert.equal(FL.tideWaterAt(1075, null, F), 0);
    // cấp trũng: Trũng chỉ ngập mưa (thấp hơn) · Rất trũng ngập cả triều, trùng nhau thì sâu hơn (tối đa 100%)
    assert.equal(FL.segDepth('low', 1, 0.9, F), 0.6);
    assert.equal(FL.segDepth('low', 0, 0.9, F), 0);
    assert.equal(FL.segDepth('tide', 0, 0.9, F), 0.9);
    assert.equal(FL.segDepth('tide', 0.5, 0.9, F), 1);
    assert.equal(FL.segDepth(null, 1, 1, F), 0);
  });
  test('Triều cường: ngày đầu không có; tỉ lệ ngày có triều theo số chỉnh; giờ cao nhất trong khung đã đặt', () => {
    assert.equal(FL.makeTide(makeRng(1), 1, { ...F, tideChance: 1 }), null, 'ngày 1 chưa có');
    assert.equal(FL.makeTide(makeRng(1), 5, { ...F, tideChance: 0 }), null, '0% = tắt');
    let n = 0;
    for (let d = 2; d < 1002; d++) {
      const t = FL.makeTide(makeRng(d * 7919), d, F);
      if (!t) continue;
      n++;
      assert.ok(t.peak >= 17 * 60 && t.peak <= 19 * 60 && t.start < t.top && t.top <= t.topEnd && t.topEnd < t.end);
    }
    assert.ok(n > 150 && n < 250, `1000 ngày có ${n} ngày triều (mong ~200)`);
    // HazardManager dùng số đang chỉnh trong ⚖️ Cân bằng
    let m = 0;
    for (let d = 2; d < 402; d++) if (new HazardManager(makeRng(3 + d * 101), d).tide) m++;
    const want = (FLOOD.tideChance ?? 0.2) * 400;
    assert.ok(Math.abs(m - want) < 60, `400 ngày có ${m} ngày triều (mong ~${want})`);
  });
  test('Lội nước: tốc độ tối đa giảm dần theo mực nước; mức khô / xăm xắp / sâu; đường qua đoạn ngập thì chậm thêm', () => {
    assert.equal(FL.floodSpeedCap(0.1, F), 0, 'khô: không giới hạn');
    assert.ok(Math.abs(FL.floodSpeedCap(0.15, F) - 25 / 3.6) < 1e-9);
    assert.ok(Math.abs(FL.floodSpeedCap(0.8, F) - 10 / 3.6) < 1e-9);
    assert.ok(FL.floodSpeedCap(0.3, F) < FL.floodSpeedCap(0.2, F));
    assert.deepEqual([0.1, 0.2, 0.6].map((d) => FL.floodBand(d, F)), [0, 1, 2]);
    const nodes = [[1, 1], [1, 2], [2, 2]];
    assert.equal(FL.routeFloodDelay(nodes, () => 0, 12, F), 0);
    const extra = FL.routeFloodDelay(nodes, (id) => (id === 'x1:1' ? 0.9 : 0), 12, F);
    assert.ok(Math.abs(extra - (CITY.PITCH / (10 / 3.6) - CITY.PITCH / 12)) < 1e-9);
  });
  test('Vị trí → đoạn ngập: giữa đoạn, giữa ngã tư (lấy đoạn ngập nhất), trong khối thì khô; cửa trong hẻm tính theo miệng hẻm', () => {
    const depth = (id) => ({ 'x2:3': 0.7, 'z3:2': 0.3 })[id] || 0;
    const mid = roadPos(3) + CITY.PITCH / 2;
    assert.equal(FL.depthAtPoint(roadPos(2), mid, depth), 0.7, 'giữa đoạn x2:3');
    assert.equal(FL.depthAtPoint(roadPos(2), roadPos(3), depth), 0.7, 'ngã tư (2,3)');
    assert.equal(FL.depthAtPoint(roadPos(2) + CITY.PITCH / 2, roadPos(2) + CITY.PITCH / 2, depth), 0, 'giữa khối nhà');
    assert.equal(FL.nearestSegId({ x: roadPos(2) + 8, z: mid }), 'x2:3', 'cửa nhà sát đường dọc');
    assert.equal(FL.nearestSegId({ x: roadPos(1) + 20, z: roadPos(3) - 7, mouth: { x: roadPos(2) + 2, z: mid } }), 'x2:3', 'nhà trong hẻm');
  });
  test('Hủy vì ngập: chỉ khi chưa lấy hàng / chưa đón khách và chỗ lấy hoặc chỗ giao đang ngập; không bị trừ sao', () => {
    const mid = roadPos(3) + CITY.PITCH / 2;
    const order = { pickup: { door: { x: roadPos(2) + 8, z: mid } }, dropoff: { door: { x: roadPos(6) + 8, z: roadPos(6) + CITY.PITCH / 2 } } };
    const wetPickup = (id) => (id === 'x2:3' ? 0.4 : 0);
    const wetDrop = (id) => (id === 'x6:6' ? 0.6 : 0);
    for (const st of ['TO_PICKUP', 'WAITING_FOOD', 'OUT_OF_STOCK']) assert.ok(FL.floodCancelOk(st, order, wetPickup, F), st);
    assert.ok(FL.floodCancelOk('TO_PICKUP', order, wetDrop, F), 'chỗ giao ngập cũng được');
    for (const st of ['PACKING', 'DELIVERING', 'AT_DROPOFF', 'IDLE', 'OFFERED']) assert.ok(!FL.floodCancelOk(st, order, wetPickup, F), `${st}: đã lấy hàng / chưa nhận → không`);
    assert.ok(!FL.floodCancelOk('TO_PICKUP', order, () => 0.1, F), 'nước dưới mức xăm xắp → không');
    assert.ok(!FL.floodCancelOk('TO_PICKUP', null, wetPickup, F));
    for (const st of FL.FLOOD_CANCEL_STATES) assert.ok(TRANSITIONS[st].includes('IDLE'), `${st} hủy được`);
    // hủy vì ngập qua OrderManager: không tính là tài xế tự hủy (không trừ sao, không cộng lần tự hủy)
    const { om, gs } = mkOM(4);
    let ev = null;
    om.on((e) => { if (e.type === 'cancelled') ev = e; });
    om.goOnline();
    om.offer = om.makeOffer(600, { x: 0, z: 0 });
    om.go(S.OFFERED);
    om.accept(600, { x: 0, z: 0 });
    const before = gs.rating;
    om.cancel('ngập', 605, { byDriver: false, flood: true });
    assert.ok(ev && ev.flood && !ev.byDriver);
    gs.applyCancel(ev, 605);
    assert.equal(gs.rating, before);
    assert.equal(gs.account.driverCancels, 0);
  });
  test('HazardManager: chỉ đoạn trũng mới ngập; đoạn Rất trũng ngập khi triều lên; báo triều lên / rút; dự báo có triều', () => {
    let hz = null;
    for (let d = 2; d < 300 && !hz; d++) { const h = new HazardManager(makeRng(11 + d * 101), d); if (h.tide) hz = h; }
    assert.ok(hz, 'tìm được 1 ngày có triều');
    const fm = FL.floodMap();
    const peak = hz.base + (hz.tide.top + hz.tide.topEnd) / 2;
    const st = hz.floodState(peak);
    for (const id of Object.keys(st)) assert.ok(fm[id], `${id} không phải đoạn trũng mà vẫn ngập`);
    for (const id of Object.keys(fm).filter((k) => fm[k] === 'tide')) assert.ok(st[id] > 0, `${id}: Rất trũng mà không ngập lúc triều cao`);
    const types = [];
    for (let m = hz.base + hz.tide.start - 10; m < hz.base + hz.tide.end + 10; m++) for (const e of hz.poll(m)) types.push(e.type);
    assert.ok(types.includes('tideStart') && types.includes('tideEnd'), types.join(','));
    assert.ok(hz.forecastText().includes(CONTENT.fmt('forecast.tide', { from: '', to: '', peak: '' }).split(' ')[1]), 'dự báo có triều cường');
  });
  test('Bộ kiểm tra bản đồ: mức ngập lạ, đoạn ngoài bản đồ → lỗi', () => {
    const { validateMap } = VALIDATE;
    const bad = { ...MAPD, floodSegs: { 'x1:1': 'sâu lắm', 'x99:1': 'low', 'x2:2': 'tide' } };
    const errs = validateMap(bad, DATA.places).filter((i) => i.level === 'error' && i.ref === 'flood').map((i) => i.field);
    assert.deepEqual(errs.sort(), ['x1:1', 'x99:1']);
    assert.ok(validateMap({ ...MAPD, floodSegs: [] }, DATA.places).some((i) => i.level === 'error' && i.field === 'floodSegs'));
  });
}

console.log('Trạm xe buýt: chia theo tuyến');
{
  const { buildBusSystem, routeDestinations, tripOn, busPlan } = await import('../src/sim/bus.js');
  const { routeDist } = await import('../src/sim/cityLayout.js');
  const sys = buildBusSystem(layout);
  test('Hộp thoại ở trạm: mỗi tuyến liệt kê các trạm theo thứ tự xe chạy tới, không lặp tên, không có trạm đang đứng', () => {
    const routes = sys.routes.filter((r) => !r.error);
    assert.ok(routes.length > 0, 'có tuyến chạy được');
    for (const r of routes) {
      const from = r.stops[0].id;
      const list = routeDestinations(sys, r.id, from, 8 * 60);
      const ids = list.map((d) => d.stop.id);
      assert.ok(!ids.includes(from), `${r.id}: có cả trạm đang đứng`);
      assert.equal(new Set(ids).size, ids.length, `${r.id}: trạm lặp`);
      assert.ok(list.every((d) => d.route === r), 'đúng tuyến');
      // thứ tự xe chạy: thời gian đi tăng dần
      for (let k = 1; k < list.length; k++) assert.ok(list[k].trip.ride >= list[k - 1].trip.ride, `${r.id}: sai thứ tự ở ${ids[k]}`);
      // mỗi tên trạm 1 lần, không có tên trạm đang đứng; đủ mọi tên trạm khác của tuyến
      const names = list.map((d) => d.stop.name);
      assert.equal(new Set(names).size, names.length, `${r.id}: tên trạm lặp`);
      assert.ok(!names.includes(sys.byId[from].name), `${r.id}: có trạm cùng tên trạm đang đứng`);
      const expect = new Set(r.stops.map((s) => sys.byId[s.id].name).filter((n) => n !== sys.byId[from].name));
      assert.deepEqual(new Set(names), expect);
    }
    assert.deepEqual(routeDestinations(sys, 'khongCo', 'x', 480), []);
    assert.deepEqual(routeDestinations(sys, routes[0].id, 'khongCoTram', 480), []);
  });
  test('Kế hoạch đi xe buýt (xe ở đồn): đi bộ ra trạm → 1 tuyến → đi bộ; gần thì đi bộ, ngoài giờ xe chạy thì không', () => {
    const r = sys.routes.find((x) => !x.error && x.stops.length >= 3);
    // từ cạnh trạm đầu tới cạnh trạm giữa tuyến (xa) → có kế hoạch, cùng tuyến, nhanh hơn đi bộ thẳng
    const a = sys.byId[r.stops[0].id].wait, b = sys.byId[r.stops[Math.floor(r.stops.length / 2)].id].wait;
    assert.ok(routeDist(a, b) > 300, 'chọn 2 trạm đủ xa để thử');
    const plan = busPlan(sys, a, b, 9 * 60, routeDist);
    {
      assert.ok(plan, 'xa thì phải gợi ý xe buýt');
      assert.ok(plan.from.routes.some((x) => x.id === plan.route.id) && plan.to.routes.some((x) => x.id === plan.route.id), 'trạm lên và xuống cùng tuyến');
      assert.ok(plan.minutes < routeDist(a, b) / 3.4, 'nhanh hơn đi bộ thẳng');
    }
    // đứng sát nơi cần tới → đi bộ (không có kế hoạch)
    assert.equal(busPlan(sys, a, { x: a.x + 5, z: a.z }, 9 * 60, routeDist), null);
    // ngoài giờ xe chạy (2 giờ sáng) → không có
    assert.equal(busPlan(sys, a, b, 2 * 60, routeDist), null);
    // 2 trạm chỉ có ở 2 tuyến khác nhau → đổi tuyến 1 lần ở chỗ 2 tuyến gặp nhau (trạm chung / 2 trạm sát nhau)
    const rs = sys.routes.filter((x) => !x.error);
    if (rs.length >= 2) {
      const only = (r) => r.stops.map((x) => sys.byId[x.id]).filter((st) => st.routes.length === 1 && st.routes[0].id === r.id);
      const A = only(rs[0]), Bx = only(rs[1]);
      let found = null;
      for (const s1 of A) for (const s2 of Bx) {
        if (found || routeDist(s1.wait, s2.wait) < 400) continue;
        const p = busPlan(sys, s1.wait, s2.wait, 9 * 60, routeDist);
        if (p?.legs.length === 2) found = p;
      }
      assert.ok(found, 'phải có ít nhất 1 cặp trạm cần đổi tuyến');
      assert.ok(found.legs[0].route !== found.legs[1].route, 'đổi sang tuyến khác');
      assert.ok(found.walkX <= 60, 'chỗ đổi tuyến đi bộ ≤ 60 m');
      assert.ok(found.legs[0].to.routes.some((x) => x.id === found.legs[0].route.id) && found.legs[1].from.routes.some((x) => x.id === found.legs[1].route.id), 'xuống / lên đúng tuyến');
      // giữ trạm lên đã gợi ý nếu chỉ chậm hơn chút
      const alt = busPlan(sys, a, b, 9 * 60, routeDist, 3.4, plan.from.id);
      assert.equal(alt.from.id, plan.from.id);
    }
  });
}

console.log('Cốt truyện (story.json) + tin nhắn');
{
  const { STORY, stepOf, storyTick, beginChapter, storyEvent, wearsBrandKit, actorsPresent, storyPick, leaning, inChapter, titleNext } = await import('../src/sim/story.js');
  const { personOf: personOfS } = await import('../src/sim/people.js');
  const { finishChapter: finishChapterS, dueAt, carryAt } = await import('../src/sim/story.js');
  const AMB5 = await import('../src/sim/ambush.js'); // mini game bày trận (chương 5)
  const { validateStory } = await import('../src/data/validate.js');
  // chạy bộ chạy cốt truyện tới khi đứng ở bước có mã id (tối đa n lần), ctx giả lập việc người chơi làm
  const runTo = (gs, id, ctx, acts = [], n = 200) => {
    for (let i = 0; i < n && stepOf(gs.story)?.id !== id; i++) acts.push(...storyTick(gs, 1, ctx));
    return stepOf(gs.story)?.id;
  };
  const doMsgs = (gs, acts) => { // làm phần tin nhắn của các việc (game.js runStoryActions làm phần còn lại)
    for (const a of acts.splice(0)) {
      if (a.do === 'msg') gs.addMessage(a.from, { key: a.text, loc: a.loc });
      if (a.do === 'replies') gs.setReplies(a.who, a.texts);
      if (a.do === 'item') gs.story.items.push(a.id);
    }
  };
  test('Chơi mới: chương 1 chờ bắt đầu; bản lưu cũ: không có cốt truyện', () => {
    const gs = new GameState({ carry: { flags: { story: 0 } } });
    assert.equal(gs.story.ch, 'c1');
    assert.equal(gs.story.step, -1);
    assert.equal(stepOf(gs.story), null, 'chưa qua màn "tới thành phố" thì chưa chạy');
    assert.equal(new GameState({ carry: { money: 100 } }).story.ch, null, 'bản lưu cũ đã qua mở đầu');
    assert.equal(new GameState({ carry: { brand: 'goship' } }).story.ch, null);
  });
  test('Chương 1 đi đúng thứ tự: tên chương → tờ rơi → Mẹ nhắn từng tin → chỉ đường → bản đồ tròn → Shift → chào Cô Hai (!) → nhắn Mẹ → Cô Hai (?) → hũ chao → quán Chú Hai → ăn cơm chay → Cô Hai nhắn → trả lời → 2 hãng → mặc đồ → xăng → đơn đầu → hồ sơ → chở khách → CSGT', () => {
    const gs = new GameState({ carry: { flags: { story: 0 } } });
    let open = null, routed = null;
    const ctx = { near: () => false, mounted: false, switchOn: () => false, threadOpen: (w) => open === w, routed: (p) => routed === p };
    assert.ok(actorsPresent(gs.story).flyer, 'chưa bắt đầu chương: anh phát tờ rơi đã đứng sẵn ở gốc cây');
    beginChapter(gs.story);
    const acts = [];
    const sid = () => stepOf(gs.story)?.id;
    assert.equal(runTo(gs, 'flyerCall', ctx, acts), 'flyerCall');
    assert.equal(acts[0]?.do, 'title', 'tên chương trước tiên');
    const actor = acts.find((a) => a.do === 'actor' && a.who === 'flyer');
    assert.ok(actor, 'anh phát tờ rơi có mặt từ bước tên chương (không tự nhiên xuất hiện)');
    assert.ok(stepOf(gs.story).delay > 0, 'tên chương mờ hết rồi chờ thêm chút mới hiện dấu !');
    for (let i = 0; i < 3; i++) acts.push(...storyTick(gs, 1, ctx));
    assert.equal(actor.spot, 'xeOm', 'đứng cạnh chú xe ôm ở bến xe');
    assert.ok(actor.call && actor.idle, 'có câu gọi "Ê nhóc!" + câu "Nhớ gọi anh"');
    assert.equal(stepOf(gs.story).mark?.actor, 'flyer', 'có dấu ! trên đầu anh ta');
    assert.ok(stepOf(gs.story).leash, 'chưa nói chuyện thì không cho đi khỏi bến xe');
    const E = () => { storyEvent(gs.story, 'actor:flyer'); for (let i = 0; i < 3; i++) acts.push(...storyTick(gs, 1, ctx)); };
    for (let i = 0; i < 30; i++) storyTick(gs, 1, ctx);
    assert.equal(sid(), 'flyerCall', 'không tự đi tới / tự nói: chờ người chơi bấm E');
    for (const [id, line] of [['flyerTalk1', 'story.c1.flyer.t1'], ['flyerTalk2', 'story.c1.flyer.t2']]) {
      E();
      assert.equal(sid(), id);
      assert.ok(acts.some((a) => a.do === 'bubble' && a.text === line && a.hold), `câu ${line} giữ nguyên`);
      for (let i = 0; i < 30; i++) storyTick(gs, 1, ctx);
      assert.equal(sid(), id, 'không tự đổi câu');
    }
    assert.ok(acts.some((a) => a.do === 'item' && a.id === 'flyer'), 'nhận tờ rơi');
    E();
    assert.equal(sid(), 'flyerAsk');
    const ask = acts.find((a) => a.do === 'choose');
    assert.ok(ask && ask.options.length === 3 && ask.answers.length === 3, 'sau câu "500 cành": 3 câu trả lời, mỗi câu 1 câu đáp');
    for (let i = 0; i < 30; i++) storyTick(gs, 1, ctx);
    assert.equal(sid(), 'flyerAsk', 'chưa chọn thì chờ');
    storyPick(gs.story, 'flyerAsk', 2);
    acts.push(...storyTick(gs, 1, ctx));
    assert.equal(sid(), 'flyerAfter', 'chọn xong → anh ta đáp lại, chờ bấm E');
    assert.equal(gs.story.picks.flyerAsk, 2, 'lựa chọn được lưu (chương sau dùng)');
    assert.equal(new GameState({ carry: JSON.parse(JSON.stringify(gs.carryOver())) }).story.picks.flyerAsk, 2, 'lưu vào bản lưu');
    E();
    assert.equal(sid(), 'huh');
    assert.ok(acts.some((a) => a.do === 'bubble' && a.who === 'player' && a.text === 'story.c1.flyer.huh'), '"???" trên đầu người chơi');
    assert.ok(actorsPresent(gs.story).flyer, 'nói xong anh ta vẫn đứng đó');
    assert.equal(runTo(gs, 'momMsg', ctx, acts), 'momMsg', 'rồi Mẹ nhắn');
    assert.ok(!acts.some((a) => a.do === 'say' || a.do === 'leave'), 'không mở hộp thoại, không chạy mất');
    doMsgs(gs, acts);
    const seen = [];
    for (let i = 0; i < 4; i++) seen.push(...storyTick(gs, 1, ctx));
    assert.equal(seen.filter((a) => a.do === 'msg').length, 1, 'Mẹ gửi tin 1 trước');
    assert.equal(stepOf(gs.story).guide?.type, 'thread', 'có hướng dẫn mở tin nhắn');
    doMsgs(gs, seen.slice());
    for (let i = 0; i < 20; i++) storyTick(gs, 1, ctx);
    assert.equal(sid(), 'momMsg', 'chưa mở tin nhắn thì Mẹ chưa gửi tin 2');
    open = 'me';
    const t2 = [];
    const wait2 = STORY.chapters[0].steps.find((x) => x.id === 'mom2').delay || 0; // chủ game chỉnh được trong ?editor
    for (let i = 0; i < Math.max(0, Math.ceil(wait2) - 1); i++) t2.push(...storyTick(gs, 1, ctx));
    assert.equal(t2.filter((a) => a.do === 'msg').length, 0, `mở tin rồi mới tính ${wait2} giây`);
    for (let i = 0; i < 3; i++) t2.push(...storyTick(gs, 1, ctx));
    assert.equal(t2.filter((a) => a.do === 'msg').length, 1, `tin 2 sau ~${wait2} giây`);
    for (let i = 0; i < 8; i++) t2.push(...storyTick(gs, 1, ctx));
    assert.ok(t2.some((a) => a.do === 'msg' && a.loc?.includes('home')), 'rồi tới định vị nhà Cô Hai');
    assert.equal(sid(), 'momLoc');
    doMsgs(gs, t2.slice());
    routed = 'home';
    const t3 = [];
    for (let i = 0; i < 3; i++) t3.push(...storyTick(gs, 1, ctx));
    assert.ok(t3.some((a) => a.do === 'closePhone'), 'bấm định vị → điện thoại tự cất');
    assert.equal(sid(), 'minimap');
    for (let i = 0; i < 30; i++) storyTick(gs, 1, ctx);
    assert.equal(sid(), 'minimap', 'hướng dẫn bản đồ tròn không tự tắt — chờ bấm Tiếp');
    storyEvent(gs.story, 'ack'); // bấm Tiếp ▸
    assert.equal(runTo(gs, 'shift', ctx), 'shift');
    assert.equal(stepOf(gs.story).guide.btn, 'ok', 'Shift: nút Đã rõ');
    storyEvent(gs.story, 'ack');
    assert.equal(runTo(gs, 'toHome', ctx), 'toHome');
    assert.equal(stepOf(gs.story).mark?.icon, '!', 'Cô Hai có dấu !');
    assert.equal(runTo(gs, 'talk1', { ...ctx, near: (p) => p === 'home' }), 'talk1');
    storyEvent(gs.story, 'talk:home');
    const t4 = [];
    assert.equal(runTo(gs, 'tellMom', ctx, t4), 'tellMom');
    assert.ok(t4.some((a) => a.do === 'remove' && a.who === 'flyer') && !actorsPresent(gs.story).flyer, 'tới nhà Cô Hai → anh phát tờ rơi biến mất');
    for (let i = 0; i < 2; i++) t4.push(...storyTick(gs, 1, ctx));
    assert.ok(t4.some((a) => a.do === 'openPhone' && a.who === 'me'), 'chào xong → điện thoại tự bật');
    doMsgs(gs, t4);
    assert.ok(!stepOf(gs.story).guide, 'không hướng dẫn, tự nhắn');
    assert.equal(stepOf(gs.story).mark?.icon, '!', 'đang chờ nhắn Mẹ: vẫn dấu !');
    assert.ok(gs.reply('me', 0));
    assert.equal(runTo(gs, 'talk2', ctx), 'talk2');
    assert.equal(stepOf(gs.story).mark?.icon, '?', 'nhắn mẹ xong → dấu ?');
    assert.deepEqual(stepOf(gs.story).talk?.pack, ['huChao', 'tauHu'], 'Cô Hai gửi 2 món: hũ chao + tàu hũ');
    storyEvent(gs.story, 'talk:home');
    const t5 = [];
    assert.equal(runTo(gs, 'chuHaiLoc', ctx, t5), 'chuHaiLoc');
    for (let i = 0; i < 4; i++) t5.push(...storyTick(gs, 1, ctx));
    assert.ok(t5.some((a) => a.do === 'bike') && t5.some((a) => a.loc?.includes('dichvu4')), 'xe đạp + định vị quán Chú Hai');
    routed = 'dichvu4';
    assert.equal(runTo(gs, 'toChuHai', { ...ctx, mounted: true }), 'toChuHai');
    storyEvent(gs.story, 'talk:dichvu4');
    assert.equal(runTo(gs, 'eat', ctx), 'eat');
    for (let i = 0; i < 20; i++) storyTick(gs, 1, ctx);
    assert.equal(sid(), 'eat', 'chưa ăn thì Cô Hai chưa nhắn');
    storyEvent(gs.story, 'use:phanComChay');
    assert.equal(runTo(gs, 'statPhys', ctx), 'statPhys', 'ăn xong → giải thích thể lực, tinh thần, xe');
    for (const id of ['statPhys', 'statMental', 'statVehicle']) {
      assert.equal(runTo(gs, id, ctx), id);
      for (let i = 0; i < 10; i++) storyTick(gs, 1, ctx);
      assert.equal(sid(), id, 'chờ bấm nút, không tự sang');
      storyEvent(gs.story, 'ack');
    }
    const t6 = [];
    assert.equal(runTo(gs, 'coHaiAsk', ctx, t6), 'coHaiAsk');
    for (let i = 0; i < 8; i++) t6.push(...storyTick(gs, 1, ctx));
    assert.ok(!t6.some((a) => a.loc?.length), 'chưa trả lời thì chưa có định vị hãng');
    doMsgs(gs, t6);
    assert.equal(gs.inbox.threads.coHai.replies?.length, 3);
    gs.reply('coHai', 0);
    const t7 = [];
    assert.equal(runTo(gs, 'brandLocs', ctx, t7), 'brandLocs');
    for (let i = 0; i < 5; i++) t7.push(...storyTick(gs, 1, ctx));
    assert.ok(t7.some((a) => a.do === 'msg' && a.loc?.length === 2), 'trả lời rồi mới gửi 2 hãng');
    assert.ok(gs.joinBrand('goship', undefined, 0, { wear: false }).ok);
    assert.equal(runTo(gs, 'wear', ctx), 'wear');
    gs.wear('aoDongPhuc');
    gs.wear('muGrip');
    assert.equal(runTo(gs, 'fuelInfo', ctx), 'fuelInfo', 'mặc xong → giải thích xăng');
    assert.equal(stepOf(gs.story).guide.part, 'fuel');
    storyEvent(gs.story, 'ack');
    assert.equal(runTo(gs, 'fuelRoute', ctx), 'fuelRoute');
    assert.ok(gs.fuel < gs.vehicleSpec.tank * 0.5, 'xe hãng giao còn ít xăng');
    assert.equal(runTo(gs, 'refuel', { ...ctx, routed: (p) => p === 'fuel' }), 'refuel', 'bấm 📍 tới cây xăng');
    for (let i = 0; i < 10; i++) storyTick(gs, 1, ctx);
    assert.equal(sid(), 'refuel', 'chưa đổ xăng thì chưa sang');
    gs.money = 500;
    assert.ok(gs.refuel().ok);
    assert.equal(runTo(gs, 'swFood', ctx), 'swFood');
    assert.equal(runTo(gs, 'firstOrder', { ...ctx, switchOn: (w) => w === 'food' }), 'firstOrder');
    assert.ok(stepOf(gs.story).hold, 'đang chờ đơn đầu: chặn đơn ngẫu nhiên');
    assert.deepEqual((stepOf(gs.story).on || []).find((a) => a.do === 'offer'), { do: 'offer', kind: 'food', place: 'bunmoc' }, 'đơn đầu cố định: giao bún mọc Cô Yến');
    for (const stage of ['offer', 'accept', 'pickup']) {
      for (let i = 0; i < 5; i++) storyTick(gs, 1, { ...ctx, orderStage: stage });
      assert.equal(sid(), 'firstOrder', 'chưa giao xong (' + stage + ')');
    }
    storyEvent(gs.story, 'delivered');
    assert.equal(runTo(gs, 'profile', ctx), 'profile', 'giao xong đơn đầu → xem hồ sơ');
    assert.ok(stepOf(gs.story).hold, 'đang xem hồ sơ: chưa phát đơn thường');
    storyEvent(gs.story, 'ack');
    assert.equal(runTo(gs, 'swRide', ctx), 'swRide');
    const r = [];
    assert.equal(runTo(gs, 'rideOffer', { ...ctx, switchOn: () => true }, r), 'rideOffer');
    for (let i = 0; i < 4; i++) r.push(...storyTick(gs, 1, ctx));
    assert.ok(r.some((a) => a.do === 'offer' && a.customer === 'Cô Hằng'), 'mời cuốc chở thử: khách cô Hằng');
    assert.equal(runTo(gs, 'pickup', { ...ctx, orderStage: 'accept' }), 'pickup');
    assert.equal(runTo(gs, 'rideDone', { ...ctx, orderStage: 'pickup' }), 'rideDone', 'khách lên xe → chở tới nơi');
    for (let i = 0; i < 20; i++) storyTick(gs, 1, { ...ctx, orderStage: 'pickup' });
    assert.equal(sid(), 'rideDone', 'chưa chở tới nơi thì chưa hết chương');
    assert.deepEqual(objectives(gs).map((x) => x.id), ['story', 'rent'], 'đang chương 1: chưa có mục "giao 10 đơn"');
    storyEvent(gs.story, 'delivered');
    const c = [];
    assert.equal(runTo(gs, 'csgt', ctx, c), 'csgt', 'chở cô Hằng tới nơi → app CSGT');
    for (let i = 0; i < 2; i++) c.push(...storyTick(gs, 1, ctx));
    assert.ok(c.some((a) => a.do === 'openPhone' && a.app === 'police'), 'tự mở app CSGT');
    storyEvent(gs.story, 'ack');
    const end = [];
    runTo(gs, 'zzz', ctx, end, 20);
    assert.ok(end.some((a) => a.do === 'end'), 'bấm Đã rõ → chương 1 kết thúc');
    if (gs.story.ch === 'c1') finishChapterS(gs.story); // bước "end" (game.js) — chạy thử ở trên có thể đã tự sang chương 2
    storyTick(gs, 1, ctx);
    assert.equal(gs.story.ch, 'c2');
    assert.ok(objectives(gs).some((x) => x.id === 'orders'), 'hết chương 1 → mục tiêu giao 10 đơn');
  });
  test('Hàng cốt truyện: carryAt tính đúng túi theo bước; hết chương dọn túi (không sót hũ chao sang chương 4)', () => {
    const ST = STORY, fin = finishChapterS;
    const c1 = ST.chapters.find((c) => c.id === 'c1'), c4 = ST.chapters.find((c) => c.id === 'c4');
    const iOf = (ch, id) => ch.steps.findIndex((x) => x.id === id);
    assert.deepEqual(carryAt(c1, iOf(c1, 'toChuHai')).sort(), ['huChao', 'tauHu']); // đang chở tới quán Dượng Hai
    assert.deepEqual(carryAt(c1, c1.steps.length), []); // giao xong hết
    assert.deepEqual(carryAt(c4, iOf(c4, 'cake')), ['hoa']); // lấy bánh: bó hoa nằm sẵn trong túi
    for (const ch of ST.chapters) assert.deepEqual(carryAt(ch, ch.steps.length), [], `${ch.id}: hết chương còn hàng`);
    const s = { ch: 'c1', step: 0, done: [], carry: ['huChao', 'tauHu'], carrySlots: { huChao: {} } };
    fin(s, ST);
    assert.equal(s.carry, null);
    assert.equal(s.carrySlots, undefined);
  });
  test('Chương 5 "Hội nhóm shipper": Linh hỏi → gọi anh Đạt → Tích Tắc thấy xe → nhắn Tí Sún → 9h gầm cầu → đòi 100 triệu, bị nhận ra, đuổi về → Dượng Hai → chú Tư → chở thuốc (chấm thật) → vào nhóm → bày trận → đêm ngập → tiệm trà → hết chương', () => {
    const A = AMB5, L = CITYLAYOUT;
    const gs = new GameState({ carry: { flags: { story: 2 } } });
    Object.assign(gs.story, { ch: 'c5', step: 0, fired: false, waited: 0, ev: {}, done: ['c1', 'c2', 'c3', 'c4'] });
    let now = 7 * 60, closeTo = false, awayOk = false;
    const ctx = () => ({ now, actorNear: () => closeTo, awayFrom: () => awayOk, near: () => false, threadOpen: () => false });
    const acts = [];
    const tick = (n = 1) => { for (let i = 0; i < n; i++) { acts.push(...storyTick(gs, 1, ctx())); now += 1; } };
    const sid = () => stepOf(gs.story)?.id;
    const run = (id, fn) => { for (let k = 0; k < 40 && sid() !== id; k++) { fn?.(stepOf(gs.story)); tick(1); } return sid(); };
    const auto = (st) => {
      const u = st?.until || {};
      if (u.type === 'reply') storyEvent(gs.story, `reply:${u.who}`);
      if (u.type === 'read') gs.story.ev.read = true, gs.inbox.threads[u.who] = { msgs: [{}], unread: 0 };
      if (u.type === 'talkActor') storyEvent(gs.story, `actor:${u.who}`);
      if (u.type === 'chosen') storyPick(gs.story, u.id, 0);
    };
    tick(2); gs.day += 1; tick(4);
    assert.equal(run('ttNews', auto), 'ttNews');
    tick(1); // bước vừa tới: chạy việc của bước
    const post = acts.find((a) => a.do === 'ttPost');
    assert.ok(post && post.photo.actor === 'tiSun' && acts.some((a) => a.do === 'actor' && a.who === 'tiSun' && a.vehicle === 'moto'), 'tin Tích Tắc chụp Tí Sún + xe anh Đạt');
    tick(5);
    assert.equal(sid(), 'ttNews', 'chưa lướt tới tin thì chưa qua');
    gs.story.ttSeen = ['tiSunXe']; tick(2);
    assert.equal(run('waitMeet', auto), 'waitMeet');
    tick(10);
    assert.equal(sid(), 'waitMeet', 'chờ 9h tối');
    now = Math.floor(now / 1440) * 1440 + 21 * 60; tick(2);
    closeTo = true;
    assert.equal(run('leave', auto), 'leave');
    tick(1);
    assert.ok(acts.some((a) => a.do === 'react' && a.who.includes('thug1')), 'đàn em nhận ra người chơi');
    tick(5);
    assert.equal(sid(), 'leave', 'còn đứng gần thì chưa qua');
    awayOk = true; tick(2);
    assert.equal(run('med', auto), 'med');
    tick(1);
    const off = acts.find((a) => a.do === 'offer');
    assert.ok(off.kind === 'parcel' && off.strict && off.minStars === 4, 'cuốc thử thách chấm điểm thật');
    assert.ok(acts.some((a) => a.do === 'block' && a.who === 'tiSun'), 'Tí Sún chặn tin nhắn');
    storyEvent(gs.story, 'delivered'); tick(2);
    assert.equal(sid(), 'joined');
    assert.ok(acts.some((a) => a.do === 'title'), 'vào nhóm mới hiện tên chương');
    assert.equal(run('plan', auto), 'plan');
    tick(1);
    const am = acts.find((a) => a.do === 'ambush');
    const nb = (i, j) => L.neighbors(i, j);
    assert.equal(A.ambushSolutions(am, nb).length, 2, 'bày trận: đúng 2 lời giải');
    assert.equal(A.ambushSolutions(am, nb, 2).length, 0, '2 chốt không đủ');
    assert.equal(A.ambushRun(am, new Set(['0,8', '2,10', '3,8', '4,9', '4,10']), nb).result, 'trap');
    assert.equal(A.ambushRun(am, new Set(['0,8', '2,10']), nb).result, 'escape');
    tick(5);
    assert.equal(sid(), 'plan', 'chưa bày xong');
    storyEvent(gs.story, 'ambushed'); tick(2);
    assert.equal(run('waitNight', auto), 'waitNight');
    now = Math.floor(now / 1440) * 1440 + 22.5 * 60; tick(2);
    assert.equal(run('night', auto), 'night');
    tick(1);
    const ch = acts.find((a) => a.do === 'chase' && a.who === 'tiSun');
    assert.ok(ch.route.some((r) => r.act === 'stall'), 'xe Tí Sún chết máy giữa nước');
    assert.ok(acts.some((a) => a.do === 'prop' && a.kind === 'water'), 'nước ngập chỉ là đạo cụ (không ngập cả thành phố)');
    storyEvent(gs.story, 'cineDone'); tick(2);
    assert.equal(run('done', (st) => { auto(st); if (st?.until?.type === 'cine') storyEvent(gs.story, 'cineDone'); if (st?.until?.type === 'arrive') gs.story.ev.__ = 1; }), 'toTea');
  });
  test('Chương 3 "Xui xẻo": Dượng Hai nhắn → ngủ qua ngày → chị Linh nhắc → 8h chị ra tiệm → quá 9h thất bại, mai 8h nhận lại → tới trường → chị Nhi, anh Hoàng → cảnh phim cướp → dí tên cướp (không phạt) → qua nửa cầu 2 → cảnh phim dí lớn (anh mô tô) → xuống xe → vật ngã (nút E) → gọi 113 → xe công an → màn đen → tháo nón, "Hi!" → làm quen anh Đạt → chạy đi → tin nhắn → hết chương', () => {
    const gs = new GameState({ carry: { flags: { story: 2 } } });
    Object.assign(gs.story, { ch: 'c3', step: 0, fired: false, waited: 0, ev: {}, done: ['c1', 'c2'] });
    let near = null, boarded = false, now = 20 * 60, closeTo = false, mounted = false, chased = false, pos = { x: 0, z: 0 };
    const ctx = () => ({ near: (p) => p === near, now, actorNear: () => closeTo, actorBoarded: () => boarded, mounted, chased: () => chased, reachAt: (at, r) => Math.hypot(pos.x - at[0], pos.z - at[1]) < r });
    const acts = [];
    const tick = (n = 1) => { for (let i = 0; i < n; i++) { acts.push(...storyTick(gs, 1, ctx())); now += 1; } };
    const sid = () => stepOf(gs.story)?.id;
    const ch3 = STORY.chapters.find((c) => c.id === 'c3');
    assert.ok(ch3 && ch3.hideNpc.includes('tra'), 'chương 3: chị Linh không đứng sẵn ở tiệm trà');
    tick(4);
    assert.ok(acts.some((a) => a.do === 'msg' && a.from === 'chuHai'), 'Dượng Hai nhắn cảm ơn');
    assert.ok(acts.some((a) => a.do === 'replies' && a.who === 'chuHai' && a.texts.length === 3), '3 câu trả lời');
    storyEvent(gs.story, 'reply:chuHai'); tick(2);
    assert.equal(sid(), 'sleep');
    gs.day += 1; now = 2 * 1440 + 6.5 * 60; tick(3);
    assert.ok(acts.some((a) => a.do === 'msg' && a.from === 'linh'), 'sáng hôm sau chị Linh nhắc');
    storyEvent(gs.story, 'reply:linh'); tick(2);
    assert.equal(sid(), 'wait8', 'chờ 8h');
    now = 2 * 1440 + 8 * 60; tick(2);
    assert.equal(sid(), 'linhWait');
    assert.ok(acts.some((a) => a.do === 'actor' && a.who === 'linh' && a.place === 'tra'), '8h chị Linh ra trước tiệm trà');
    // trễ quá 9h → thất bại, quay lại chờ 8h (sáng hôm sau — đồng hồ chung không quay ngược)
    now = 2 * 1440 + 9 * 60; tick(1);
    assert.equal(sid(), 'wait8', 'quá 9h → quay lại bước chờ 8h');
    const fail = acts.find((a) => a.do === 'fail');
    assert.ok(fail && fail.text && fail.from === 'linh', 'báo thất bại + chị Linh nhắn');
    assert.equal(gs.story.due, undefined, 'xóa hạn cũ');
    tick(30);
    assert.equal(sid(), 'wait8', '9h30 cùng ngày: chưa nhận lại được');
    now = 3 * 1440 + 8 * 60 + 5; tick(2);
    assert.equal(sid(), 'linhWait', '8h hôm sau: chị Linh ra lại');
    storyEvent(gs.story, 'actor:linh'); tick(2);
    assert.equal(sid(), 'linhGo');
    storyEvent(gs.story, 'actor:linh'); tick(2);
    assert.ok(acts.some((a) => a.do === 'title'), 'tên chương 3');
    assert.ok(acts.some((a) => a.do === 'board' && a.who === 'linh'), 'chị Linh lên xe');
    tick(6);
    assert.equal(sid(), 'ride');
    boarded = true; near = 'dhMyThuat'; tick(3);
    assert.equal(sid(), 'arrive', 'tới trường trước 9h');
    assert.equal(gs.story.due, undefined, 'xong phần có hạn → bỏ hạn');
    const n0 = acts.length;
    closeTo = true;
    for (let i = 0; i < 40 && sid() !== 'robbery'; i++) {
      const st = stepOf(gs.story);
      if (st.until?.type === 'talkActor') storyEvent(gs.story, `actor:${st.until.who}`);
      tick(1);
    }
    assert.equal(sid(), 'robbery');
    const after = acts.slice(n0);
    assert.ok(after.some((a) => a.do === 'react' && a.icon === '!' && a.who.includes('linh')), 'Linh, Nhi giật mình (!)');
    assert.deepEqual(after.filter((a) => a.do === 'goto').map((a) => a.who), ['nhi', 'linh', 'hoang'], 'lần lượt chạy vào trường');
    tick(2);
    const chase = acts.find((a) => a.do === 'chase');
    assert.ok(acts.some((a) => a.do === 'cine') && chase && chase.route.length >= 4, 'cảnh phim + tên cướp chạy theo lộ trình');
    assert.ok(chase.lose >= chase.gap * 15 && chase.pct <= 100 && chase.revAt === 'pass', 'mất dấu xa hơn hẳn khoảng giữ cách · tốc độ theo xe người chơi · nẹt pô lúc lướt ngang');
    assert.equal(sid(), 'robbery', 'chưa chiếu xong cảnh phim');
    storyEvent(gs.story, 'cineDone'); tick(2);
    assert.equal(sid(), 'chaseMount');
    assert.ok(stepOf(gs.story).noFines, 'đang dí: không bị phạt');
    assert.ok(stepOf(gs.story).noBeacon && stepOf(gs.story).mark.icon === 'dot', 'tên cướp: chấm đỏ, không cột sáng');
    assert.ok(['robbery', 'chaseMount', 'chase', 'bigChase'].every((id) => ch3.steps.find((x) => x.id === id).music === 'music.chase'), 'nhạc dí cướp từ cảnh cướp tới hết cảnh phim dí lớn');
    assert.ok(!ch3.steps.find((x) => x.id === 'arrive2').music, 'hết cảnh dí → nhạc thường');
    assert.equal(acts.find((a) => a.do === 'cine' && a.endRide)?.endRide, 'thief', 'hết cảnh cướp → ngồi sẵn trên xe, quay về hướng tên cướp');
    assert.ok(acts.filter((a) => a.do === 'approach').every((a) => a.stop), 'Nhi, Hoàng chạy tới rồi đứng lại (không đi theo)');
    mounted = true; tick(2);
    assert.equal(sid(), 'chase');
    tick(5);
    assert.equal(sid(), 'chase', 'chưa qua cầu');
    pos = { x: 200, z: 0 }; tick(2);
    assert.equal(sid(), 'chase', 'mới lên đầu cầu 2');
    pos = { x: 181, z: -1.8 }; tick(2);
    assert.equal(sid(), 'bigChase', 'qua nửa cầu 2 → cảnh phim dí lớn');
    const big = stepOf(gs.story).on, man = big.find((a) => a.do === 'chase');
    assert.ok(man && man.who === 'man' && man.follow === 'thief' && man.spawn === 'behind' && man.bike === 'supersport', 'anh mô tô từ sau lưng vọt lên đuổi theo tên cướp, xe sport bike');
    assert.ok(man.route.some((r) => r.act === 'drift') && man.route.some((r) => r.air > 0), 'drift ở góc nhà thờ, bay qua xe tải');
    const kinds = new Set(big.filter((a) => a.do === 'prop').map((a) => a.kind));
    assert.ok(['dog', 'ramp', 'truck', 'car', 'moto'].every((k) => kinds.has(k)), 'xe tải, tấm ván, con chó + xe diễn viên (ô tô, xe máy)');
    assert.ok(big.find((a) => a.do === 'cine').clearAll, 'lúc chiếu tắt hết xe thường, chỉ còn xe diễn viên');
    const cine = big.find((a) => a.do === 'cine');
    assert.ok(cine.ride === 'thief' && cine.shots.slice(0, 3).every((sh) => sh.eye), 'xe người chơi tự chạy theo · 3 cảnh đầu góc nhìn thứ nhất');
    assert.ok(cine.shots.some((sh) => sh.slow < 1), 'có cảnh quay chậm (bay qua xe tải)');
    assert.ok(chase.route.some((r) => r.act === 'crash'), 'tên cướp té xe ở công viên');
    storyEvent(gs.story, 'cineDone'); tick(2);
    assert.equal(sid(), 'arrive2');
    assert.ok(acts.some((a) => a.do === 'dismount' && a.who === 'man'), 'anh mô tô xuống xe');
    assert.equal(stepOf(gs.story).until.who, 'thief', 'tới gần tên cướp (đang bị chặn) thì bắt đầu');
    closeTo = true; tick(2);
    assert.equal(sid(), 'catch');
    const tk = acts.find((a) => a.do === 'tackle');
    assert.ok(tk && tk.who === 'man' && tk.target === 'thief' && tk.qte > 0, 'anh Đạt vật tên cướp, có nút bấm nhanh');
    tick(30);
    assert.equal(sid(), 'catch', 'chưa vật xong thì chờ');
    storyEvent(gs.story, 'tackled'); tick(3);
    assert.equal(sid(), 'callPolice');
    const call = acts.find((a) => a.do === 'choose' && a.id === 'c3Call');
    assert.ok(call && call.options.length === 3 && call.gains.length === 3, 'gọi công an: 3 câu theo 3 tính cách');
    storyPick(gs.story, 'c3Call', 2, call.gains[2]); tick(1);
    assert.equal(sid(), 'callAns');
    storyEvent(gs.story, 'actor:man'); tick(2);
    assert.equal(sid(), 'call113');
    tick(1);
    assert.ok(acts.some((a) => a.do === 'phoneCall' && a.on), 'người chơi đưa điện thoại lên tai');
    tick(5);
    assert.equal(sid(), 'police');
    const pol = acts.find((a) => a.do === 'prop' && a.kind === 'police');
    assert.ok(pol && pol.keep && pol.copsTo === 'actor:thief' && pol.sound === 'city.siren', 'xe công an hú còi chạy tới, dừng lại, công an đi tới tên cướp');
    tick(10);
    assert.equal(sid(), 'copSay');
    tick(4);
    assert.equal(sid(), 'later');
    tick(1);
    const fade = acts.find((a) => a.do === 'fade');
    assert.ok(fade.remove.includes('thief') && fade.props && fade.stand === 'man', 'màn đen: tên cướp + xe công an đi rồi, anh Đạt đứng lại');
    assert.ok(!actorsPresent(gs.story).thief && actorsPresent(gs.story).man, 'sau màn đen: không còn tên cướp, còn anh Đạt');
    tick(5);
    assert.equal(sid(), 'helmetOff');
    tick(4);
    assert.equal(sid(), 'hi');
    tick(1);
    assert.ok(acts.some((a) => a.do === 'wave' && a.who === 'man'), 'vẫy tay "Hi!"');
    for (const [id, pick] of [['who', 'c3Who'], ['realize', 'c3Realize']]) {
      storyEvent(gs.story, 'actor:man'); tick(2);
      assert.equal(sid(), id);
      storyPick(gs.story, pick, 0, { trait: 'good', pts: 1 }); tick(2);
      assert.equal(sid(), `${id}Ans`);
    }
    storyEvent(gs.story, 'actor:man'); tick(2);
    assert.equal(sid(), 'name');
    storyEvent(gs.story, 'actor:man'); tick(2);
    assert.equal(sid(), 'rideOff');
    tick(7);
    assert.equal(sid(), 'datMsg');
    assert.ok(!actorsPresent(gs.story).man, 'anh Đạt đã chạy đi');
    tick(3);
    const m = acts.find((a) => a.do === 'msg' && a.from === 'man');
    assert.ok(m && acts.some((a) => a.do === 'replies' && a.who === 'man'), 'tin nhắn của anh Đạt + 3 câu trả lời nhanh');
    storyEvent(gs.story, 'reply:man'); tick(2);
    assert.ok(acts.some((a) => a.do === 'end'), 'hết chương 3');
    tick(2);
    assert.ok(gs.story.done.includes('c3'), 'xong chương 3');
    assert.equal(dueAt(10 * 60, 9), 10 * 60 + 23 * 60, 'mốc 9h tiếp theo tính từ 10h = 9h hôm sau');
  });
  test('Chương 4 "Bức tranh dang dở": chiều tối chị Linh nhắn → ngủ → 17h sân bay (trễ 18h quay lại) → trường → 2 tiếng sau → 3 thiệp → hẻm 4,1 bám theo lén → vấp lon bỏ chạy → nhắn anh Đạt → ngủ → triển lãm → hoa + bánh (kịp / trễ 9h50) → khai mạc → 30 phút trước: anh Đạt bị chặn → chở chị Linh về → tin nhắn không ai đọc → hết chương', () => {
    const gs = new GameState({ carry: { flags: { story: 0 } } });
    Object.assign(gs.story, { ch: 'c4', step: 0, fired: false, waited: 0, ev: {}, done: ['c1', 'c2', 'c3'] });
    let now = 10 * 60, near = null, closeTo = false, boarded = false, reach = false;
    let hid = null;
    const ctx = () => ({ now, near: (p) => p === near, actorNear: () => closeTo, actorBoarded: () => boarded, reachAt: () => reach, hiddenAt: (id) => hid === id });
    const acts = [];
    const tick = (n = 1) => { for (let i = 0; i < n; i++) { acts.push(...storyTick(gs, 1, ctx())); now += 1; } };
    const sid = () => stepOf(gs.story)?.id;
    const ch4 = STORY.chapters.find((c) => c.id === 'c4');
    const go = (id, n = 400) => { for (let i = 0; i < n && sid() !== id; i++) { const st = stepOf(gs.story); if (gs.story.fired && st?.until?.type === 'talkActor') storyEvent(gs.story, `actor:${st.until.who}`); if (gs.story.fired && st?.until?.type === 'chosen') storyPick(gs.story, st.until.id, 0); tick(1); } assert.equal(sid(), id); tick(1); };
    tick(3);
    assert.equal(sid(), 'evening', 'chưa tới chiều tối thì chờ');
    now = 17 * 60; tick(3);
    assert.ok(acts.some((a) => a.do === 'msg' && a.from === 'linh'), 'chị Linh nhắn hẹn chiều mai qua sân bay');
    storyEvent(gs.story, 'reply:linh'); tick(2);
    assert.equal(sid(), 'sleep1');
    gs.day = 2; now = 1440 + 9 * 60; tick(2);
    assert.equal(sid(), 'waitAirport');
    now = 1440 + 16.5 * 60; tick(2);
    assert.equal(sid(), 'airport');
    assert.ok(acts.some((a) => a.do === 'title'), 'hiện tên chương 4 lúc lấy tranh');
    const air = stepOf(gs.story);
    assert.ok(air.talk.pack.length >= 1 && air.talk.pack.every((id) => STORY.parcels[id].traits.includes('fragile')), 'tranh dễ vỡ');
    assert.ok(!air.talk.guide, 'chương 4 không có khung vàng hướng dẫn xếp túi');
    now = 1440 + 18 * 60 + 1; const fail = storyTick(gs, 1, ctx());
    assert.ok(fail.some((a) => a.do === 'fail') && sid() === 'waitAirport', 'quá 18h chưa lấy tranh → quay lại chờ hôm sau');
    gs.day = 3; now = 2 * 1440 + 16.6 * 60; tick(2);
    assert.equal(sid(), 'airport');
    storyEvent(gs.story, 'talk:sanbay'); tick(2);
    assert.equal(sid(), 'toSchool');
    closeTo = true; go('later2h');
    assert.equal(acts.findLast((a) => a.do === 'fade').skip, 120, 'màn đen tua 2 tiếng');
    go('toDai');
    assert.equal(stepOf(gs.story).until.who, 'place:traiCay', 'anh Đại ở sạp trái cây');
    go('toMinh'); go('toLan'); go('goHome');
    assert.equal(stepOf(gs.story).target, 'dichvu1_5', 'đường về: ghé Triangle K đối diện hẻm');
    near = 'dichvu1_5'; tick(2);
    assert.equal(sid(), 'spotCine', 'tới Triangle K → cảnh phim');
    const sc = stepOf(gs.story).on;
    const sh0 = sc.find((a) => a.do === 'cine').shots[0];
    assert.ok(sh0.eye || (Array.isArray(sh0.pos) && sh0.pos[1] < 2 && sh0.lookAt === 'actor:flyer'), 'cảnh phim nhìn ngang tầm mắt người chơi, bám theo anh tờ rơi');
    assert.equal(sc.filter((a) => a.do === 'bubble').at(-1).text, 'story.c4.flyer.go', 'câu chót "Đi lẹ đi!"');
    near = null; storyEvent(gs.story, 'cineDone'); tick(2);
    assert.equal(sid(), 'sneak');
    const sn = stepOf(gs.story).on.find((a) => a.do === 'sneak');
    assert.ok(sn.who === 'flyer' && sn.with === 'student' && sn.route.length >= 8 && sn.route.some((r) => r.look > 0), 'anh phát tờ rơi dắt cậu học sinh vào hẻm, có ngoái lại');
    tick(30);
    assert.equal(sid(), 'sneak', 'chưa đi tới cuối hẻm');
    storyEvent(gs.story, 'sneaked'); tick(2);
    assert.equal(sid(), 'hideBin', 'tới cuối hẻm → dẫn vào núp thùng rác gần tụi giang hồ');
    assert.equal(stepOf(gs.story).target, 'prop:bin4');
    tick(20);
    assert.equal(sid(), 'hideBin', 'chưa núp thì tụi giang hồ chưa nói');
    hid = 'bin4'; tick(2);
    assert.equal(sid(), 'overhear1', 'núp rồi mới nghe lén');
    hid = null; go('trip');
    const pu = stepOf(gs.story).on.find((a) => a.do === 'pursue');
    assert.ok(pu && pu.who.includes('thug1') && !stepOf(gs.story).on.some((a) => a.do === 'cine'), 'vấp lon → 2 đàn em rượt, người chơi tự chạy (không cảnh phim)');
    assert.ok(pu.bikeOnly && pu.fail && stepOf(gs.story).music === 'music.flee', 'chỉ thoát bằng xe, bị tóm = thua, có nhạc bị rượt');
    tick(20);
    assert.equal(sid(), 'trip', 'chưa thoát thì còn bị rượt');
    storyEvent(gs.story, 'escaped'); tick(2);
    assert.equal(sid(), 'flee');
    near = 'home'; tick(2);
    assert.equal(sid(), 'msgDat');
    storyEvent(gs.story, 'reply:man'); tick(8);
    assert.ok(acts.some((a) => a.do === 'msg' && a.from === 'man' && a.text === 'story.c4.dat.m1'), 'anh Đạt: "Hẹn em ngày mai :)"');
    assert.equal(sid(), 'sleep2');
    gs.day = 4; now = 3 * 1440 + 8 * 60; near = 'dhMyThuat'; tick(6);
    assert.equal(sid(), 'mingle');
    const ex = ch4.steps.find((x) => x.id === 'exhibit').on;
    assert.ok(['linh', 'nhi', 'hoang', 'minh', 'lanAnh', 'dai'].every((w) => ex.some((a) => a.do === 'actor' && a.who === w)), 'người quen đều có mặt ở triển lãm');
    assert.equal([].concat(ex.find((a) => a.who === 'dai').idle).length, 2, 'anh Đại có câu thứ 2 (xe hơi đen)');
    now = 3 * 1440 + 8.5 * 60; go('linhAsk2'); go('flowers');
    storyEvent(gs.story, 'talk:choTruyenThong'); tick(2);
    assert.equal(sid(), 'cake');
    storyEvent(gs.story, 'talk:banh'); tick(2);
    assert.equal(sid(), 'back');
    // về trễ (sau 9h50) → bỏ câu cảm ơn, nói câu "Nhi gọi tiệm giao tới rồi"
    const save = JSON.parse(JSON.stringify(gs.story));
    now = 3 * 1440 + 9.9 * 60; storyEvent(gs.story, 'actor:linh'); tick(2);
    assert.equal(sid(), 'thanksLate', 'trễ 9h50 → câu trễ');
    Object.assign(gs.story, JSON.parse(JSON.stringify(save)));
    now = 3 * 1440 + 9.5 * 60; storyEvent(gs.story, 'actor:linh'); tick(2);
    assert.equal(sid(), 'thanksOk', 'kịp → câu cảm ơn');
    storyEvent(gs.story, 'actor:linh'); tick(2);
    assert.equal(sid(), 'waitOpen', 'kịp giờ thì bỏ qua câu trễ');
    now = 3 * 1440 + 10 * 60; tick(2);
    assert.equal(sid(), 'opening');
    storyEvent(gs.story, 'cineDone'); go('datCine');
    const dc = stepOf(gs.story).on;
    assert.ok(dc.filter((a) => a.do === 'prop' && a.kind === 'car' && a.when === 'man:block').length === 3, '3 chiếc ô tô đen chặn anh Đạt');
    storyEvent(gs.story, 'cineDone'); go('noon');
    assert.equal(acts.findLast((a) => a.do === 'fade').skipTo, 11, 'quay lại người chơi lúc 11h');
    go('ride');
    boarded = true; near = 'tra'; tick(2);
    go('finalMsg');
    storyEvent(gs.story, 'reply:man'); tick(8);
    assert.ok(gs.story.done.includes('c4'), 'hết chương 4');
    assert.equal(acts.filter((a) => a.do === 'msg' && a.from === 'man').length, 1, 'tin cuối gửi anh Đạt không ai trả lời');
  });
  test('Chương 2 "Bạn mới ở thành phố": giao thêm 10 đơn → 17h30–19h chú Hai nhắn → đọc tin mới vào chương → chú Hai (cơm chay) → tiệm trà đóng → sư cô (3 câu) → bảo vệ (mở lời 3 câu + 3 câu) → tìm trong vòng tím → chị Linh + người đàn ông → chở chị Linh về → Linh nhắn số → hết chương', () => {
    const gs = new GameState({ carry: { flags: { story: 0 } } });
    Object.assign(gs.story, { ch: 'c2', step: 0, fired: false, waited: 0, ev: {}, done: ['c1'] });
    let near = null, boarded = false, now = 9 * 60, open = null, closeTo = false;
    const ctx = () => ({ near: (p) => p === near, now, actorNear: () => closeTo, actorBoarded: () => boarded, threadOpen: (w) => open === w });
    const acts = [];
    const tick = (n = 1) => { for (let i = 0; i < n; i++) acts.push(...storyTick(gs, 1, ctx())); };
    const sid = () => stepOf(gs.story)?.id;
    tick(2);
    assert.equal(sid(), 'orders10');
    assert.deepEqual(objectives(gs).map((x) => x.id), ['orders', 'rent'], 'chưa vào chương: bảng mục tiêu "Giao 10 đơn"');
    gs.account.completed = (gs.account.completed || 0) + 9; tick(3);
    assert.equal(sid(), 'orders10', '9 đơn: chưa đủ');
    assert.ok(/9\/10/.test(objectives(gs)[0].text), 'hiện 9/10');
    gs.day += 1; tick(2); // qua ngày vẫn đếm dồn
    assert.equal(sid(), 'orders10', 'qua ngày: vẫn 9/10');
    assert.ok(/9\/10/.test(objectives(gs)[0].text), 'qua ngày không bị đặt lại');
    gs.account.completed += 1; tick(2);
    assert.equal(sid(), 'sleep', 'đủ 10 đơn → nghỉ ngơi qua ngày mới');
    now = 18 * 60; tick(10);
    assert.equal(sid(), 'sleep', 'cùng ngày, 18h cũng chưa có tin chú Hai');
    gs.day += 1; now = 9 * 60; tick(2);
    assert.equal(sid(), 'evening', 'qua ngày mới → chờ 17h30');
    tick(5);
    assert.equal(sid(), 'evening', '9h sáng: chưa tới giờ');
    now = 18 * 60; tick(4);
    assert.equal(sid(), 'chuHaiMsg');
    assert.ok(acts.some((a) => a.do === 'msg' && a.from === 'chuHai' && a.loc.includes('dichvu4')), 'chú Hai nhắn kèm định vị quán');
    assert.ok(!acts.some((a) => a.do === 'title'), 'chưa đọc tin: chưa hiện tên chương');
    open = 'chuHai'; tick(3);
    assert.ok(acts.some((a) => a.do === 'title'), 'đọc tin xong → tên chương 2');
    tick(8);
    assert.equal(sid(), 'toChuHai');
    assert.deepEqual(stepOf(gs.story).talk.pack, ['comChay'], 'chú Hai đưa hộp cơm chay');
    storyEvent(gs.story, 'talk:dichvu4'); tick(2);
    assert.equal(sid(), 'toTea');
    near = 'tra'; tick(3);
    assert.equal(sid(), 'suco', 'tới tiệm trà (đóng cửa) → hỏi sư cô');
    assert.equal(stepOf(gs.story).mark.place, 'chua');
    storyEvent(gs.story, 'talk:chua'); tick(2);
    const sucoAsk = acts.find((a) => a.do === 'choose' && a.id === 'c2Suco');
    assert.ok(sucoAsk && sucoAsk.who === 'place:chua' && sucoAsk.options.length === 3 && !sucoAsk.ask, 'sư cô: 3 câu trả lời');
    storyPick(gs.story, 'c2Suco', 0, sucoAsk.gains[0]); tick(4);
    assert.equal(sid(), 'sucoInfo');
    storyEvent(gs.story, 'actor:place:chua'); tick(2);
    assert.equal(sid(), 'toSchool');
    near = 'dhMyThuat'; tick(3);
    const g1 = acts.find((a) => a.do === 'choose' && a.id === 'c2GuardAsk');
    assert.ok(g1 && g1.ask && g1.who === 'place:dhMyThuat', 'bảo vệ: người chơi bấm E mở lời (3 câu)');
    storyPick(gs.story, 'c2GuardAsk', 1, g1.gains[1]); tick(4);
    storyPick(gs.story, 'c2GuardWho', 2, { trait: 'bad', pts: 1 }); tick(3);
    storyEvent(gs.story, 'actor:place:dhMyThuat'); tick(3);
    assert.equal(sid(), 'search');
    assert.ok(stepOf(gs.story).zone?.place === 'dhMyThuat' && !stepOf(gs.story).target, 'vòng tím quanh trường, không mũi tên');
    const pres = actorsPresent(gs.story);
    assert.ok(pres.linh?.place === 'doChoi' && pres.man?.vehicle === 'moto', 'chị Linh + người đàn ông đi mô tô đứng trước tiệm Bé Yêu');
    tick(5);
    assert.equal(sid(), 'search', 'chưa tìm thấy chị Linh');
    closeTo = true; tick(2);
    const la = acts.find((a) => a.do === 'choose' && a.id === 'c2LinhAsk');
    assert.ok(la.ask && la.react.includes('linh') && la.react.includes('man'), 'hỏi chị Linh: dấu ? giật mình trên 2 người');
    storyPick(gs.story, 'c2LinhAsk', 0, la.gains[0]); tick(4);
    storyPick(gs.story, 'c2LinhWhy', 1, { trait: 'neutral', pts: 1 }); tick(3);
    for (const who of ['linh', 'man', 'linh', 'man', 'linh', 'man']) { assert.equal(stepOf(gs.story).until.who, who); storyEvent(gs.story, `actor:${who}`); tick(3); }
    assert.equal(sid(), 'manGo');
    tick(6);
    assert.ok(acts.some((a) => a.do === 'leave' && a.who === 'man'), 'người đàn ông lên xe đi mất');
    storyEvent(gs.story, 'actor:linh'); tick(3);
    assert.equal(sid(), 'rideHome');
    near = 'tra'; tick(5);
    assert.equal(sid(), 'rideHome', 'chị Linh chưa lên xe thì chưa xong');
    boarded = true; tick(3);
    assert.equal(sid(), 'give');
    storyEvent(gs.story, 'actor:linh'); tick(4);
    assert.ok(acts.some((a) => a.do === 'drop' && a.id === 'comChay'), 'đưa hộp cơm chay');
    storyEvent(gs.story, 'actor:linh'); tick(4); // chị Linh cảm ơn
    // chị Linh hỏi: cháu chú Hai? · chạy xe hả? · mai chở chị đi học? (3 lần chọn câu)
    for (const id of ['hoiaivayAsk', 'hoichayxeAsk', 'rumaidiAsk']) {
      assert.equal(stepOf(gs.story).until.id, id, `chờ chọn câu ${id}`);
      assert.ok(!acts.some((a) => a.do === 'end'), 'chưa chọn xong thì chưa hết chương');
      storyPick(gs.story, id, 0, null); tick(3);
    }
    tick(8);
    assert.ok(acts.some((a) => a.do === 'msg' && a.from === 'linh'), 'chị Linh nhắn số');
    assert.ok(acts.some((a) => a.do === 'end'), 'hết chương 2');
    assert.deepEqual(gs.story.traits, { good: 2, neutral: 2, bad: 1 }, 'điểm tính cách cộng đúng theo câu chọn');
  });
  test('Bản lưu đã xong chương 1 từ hồi chưa có chương 2 → tự vào chương 2; bản lưu không theo cốt truyện thì không', () => {
    const old = new GameState({ carry: { money: 300, story: { ch: null, step: -1, fired: false, waited: 0, ev: {}, done: ['c1'], items: [], carry: null } } });
    assert.equal(old.story.ch, 'c2');
    assert.equal(old.story.step, 0);
    assert.equal(new GameState({ carry: { money: 300 } }).story.ch, null, 'không theo cốt truyện: để nguyên');
  });
  test('Mở tiệm theo chương: Tiệm Trà A Di Đà đóng tới hết chương 2, chùa đóng ở chương 1; bản lưu cũ mọi nơi đều mở', () => {
    const { isOpen: isOpenR, unlocked: unl } = PLACE_RULES;
    const L = CITYLAYOUT.buildLayout(), tra = L.placeById.tra, chua = L.placeById.chua;
    const gs = new GameState({ carry: { flags: { story: 0 } } });
    assert.equal(gs.progress.chap, 1);
    assert.ok(!unl(tra, gs.progress) && !unl(chua, gs.progress), 'chương 1: tiệm trà + chùa đóng');
    assert.ok(!isOpenR(tra, 7 * 60, gs.progress), 'đang giờ mở cửa vẫn đóng');
    gs.story.ch = 'c2';
    assert.ok(!unl(tra, gs.progress) && unl(chua, gs.progress), 'chương 2: chùa mở, tiệm trà vẫn đóng');
    gs.story.ch = null;
    assert.ok(unl(tra, gs.progress), 'xong chương 2 → tiệm trà mở');
    assert.ok(unl(tra, new GameState({ carry: { money: 100 } }).progress), 'bản lưu cũ: mở');
    const om = new OrderManager({ rng: makeRng(3), layout: L, gs: new GameState({ carry: { flags: { story: 0 } } }) });
    for (let i = 0; i < 300; i++) { const o = om.makeOffer(7 * 60 + (i % 120), { x: tra.door.x, z: tra.door.z }); assert.ok(!o || (o.pickup.placeId !== 'tra' && o.dropoff.placeId !== 'tra' && o.dropoff.placeId !== 'chua'), 'chương 1: không có đơn ở tiệm trà / chùa'); }
  });
  test('Đơn cốt truyện: đơn đầu = bún mọc Cô Yến (không sự cố, kể cả quán đã nghỉ); khách chở thử luôn là người lớn bình thường', () => {
    const personOf = personOfS;
    const gs = new GameState({ day: 1, carry: { money: 500, brand: 'goship', vehicle: 'cub', owned: { vehicles: ['xeDap', 'cub'], bags: ['nylon', 'thermal'], gear: [] }, flags: { story: 2 } } });
    const om = new OrderManager({ rng: makeRng(9), layout: CITYLAYOUT.buildLayout(), gs });
    const pos = { x: CITYLAYOUT.roadPos(3), z: CITYLAYOUT.roadPos(3) + 30 };
    for (const now of [600, 20 * 60]) { // 10:00 quán mở · 20:00 quán đã nghỉ
      const o = om.storyFood('bunmoc', pos, now);
      assert.ok(o && o.kind === 'food' && o.pickup.placeId === 'bunmoc' && o.forced && o.story === 'tutorial');
      assert.ok(o.itemIds.every((id) => /^bunMoc/.test(id)), 'món bún mọc');
      assert.ok(!o.flags.outOfStock && !o.flags.noAnswer && !o.flags.picky && !o.flags.vague && !o.dropoff.apartment, 'không sự cố');
    }
    for (let k = 0; k < 40; k++) {
      const w = personOf(om.storyRide(pos, 600 + k).customer);
      assert.ok(w.age === 'young' || w.age === 'adult', 'khách chở thử là người lớn / người trẻ: ' + w.name);
    }
  });
  test('Từ lúc hiện tên chương tới hết chương: không có đơn thường; đang chạy đơn thì chờ giao xong mới hiện tên chương; đơn mời bỏ không bị tính', () => {
    const data = { chapters: [{ id: 'k1', title: 't', steps: [
      { id: 'tuDo', until: { type: 'none' } },
      { id: 'ten', on: [{ do: 'title' }], until: { type: 'none' } },
      { id: 'canh', until: { type: 'wait', min: 5 } },
    ] }, { id: 'k2', title: 't2', steps: [{ id: 'x', until: { type: 'wait', min: 99 } }] }] };
    const gs = new GameState({ carry: { money: 100 } });
    gs.story = { ch: 'k1', step: 0, fired: false, waited: 0, ev: {}, done: [], items: [] };
    assert.equal(inChapter(gs.story, data), false, 'bước trước tên chương: tự do chạy đơn');
    let busy = true;
    const ctx = { busy: () => busy };
    storyTick(gs, 1, ctx, data); storyTick(gs, 1, ctx, data);
    assert.ok(titleNext(gs.story, data), 'tới bước hiện tên chương');
    for (let i = 0; i < 5; i++) assert.deepEqual(storyTick(gs, 1, ctx, data), [], 'đang chạy đơn: chưa hiện tên chương');
    assert.equal(inChapter(gs.story, data), false);
    busy = false;
    assert.equal(storyTick(gs, 1, ctx, data)[0]?.do, 'title', 'giao xong đơn → hiện tên chương');
    assert.equal(inChapter(gs.story, data), true, 'đã hiện tên chương: không có đơn thường');
    for (let i = 0; i < 4; i++) storyTick(gs, 1, ctx, data);
    assert.equal(stepOf(gs.story, data).id, 'canh');
    assert.equal(inChapter(gs.story, data), true);
    for (let i = 0; i < 8; i++) storyTick(gs, 1, ctx, data);
    assert.equal(gs.story.ch, 'k2');
    assert.equal(inChapter(gs.story, data), false, 'hết chương (chương sau chưa có tên chương) → có đơn lại');
    // bỏ đơn mời vì vào chương: không trừ tỉ lệ nhận đơn (khác bấm Bỏ qua)
    const g2 = new GameState({ day: 1, carry: { money: 500, brand: 'goship', vehicle: 'cub', owned: { vehicles: ['xeDap', 'cub'], bags: ['nylon', 'thermal'], gear: [] }, flags: { story: 2 } } });
    const om = new OrderManager({ rng: makeRng(9), layout: CITYLAYOUT.buildLayout(), gs: g2 });
    const pos = { x: CITYLAYOUT.roadPos(3), z: CITYLAYOUT.roadPos(3) + 30 };
    om.goOnline();
    for (let i = 0; i < 200 && om.state !== S.OFFERED; i++) om.update(1, 1, 600, pos);
    assert.equal(om.state, S.OFFERED);
    const before = g2.account.offers;
    assert.ok(om.dismissOffer(600));
    assert.equal(om.state, S.IDLE);
    assert.equal(g2.account.offers, before, 'không ghi là bỏ đơn');
    om.hold = true;
    for (let i = 0; i < 300; i++) om.update(1, 1, 600, pos);
    assert.equal(om.state, S.IDLE, 'trong chương: không có đơn mời mới');
  });
  test('Cuốc chở thử (cốt truyện): khách gần mình, không hết hạn, không bỏ qua được; bước "hold" chặn đơn thường', () => {
    const gs = new GameState({ day: 1, carry: { money: 500, brand: 'goship', vehicle: 'cub', owned: { vehicles: ['xeDap', 'cub'], bags: ['nylon', 'thermal'], gear: [] }, flags: { story: 2 } } });
    const om = new OrderManager({ rng: makeRng(5), layout: CITYLAYOUT.buildLayout(), gs });
    const pos = { x: CITYLAYOUT.roadPos(3), z: CITYLAYOUT.roadPos(3) + 30 };
    om.goOnline();
    om.hold = true;
    for (let i = 0; i < 200; i++) om.update(1, 1, 600, pos);
    assert.equal(om.state, S.IDLE, 'đang hold: không có đơn thường');
    const o = om.storyRide(pos, 600);
    assert.ok(o && o.kind === 'ride' && o.forced && o.story === 'tutorial');
    assert.ok(CITYLAYOUT.routeDist(pos, o.pickup.door) <= 200, 'khách đứng gần');
    assert.ok(om.forceOffer(o));
    for (let i = 0; i < 300; i++) om.update(1, 1, 600, pos);
    assert.equal(om.state, S.OFFERED, 'không hết hạn');
    assert.equal(om.decline(600), false, 'không bỏ qua được');
    assert.equal(om.forceOffer(om.storyRide(pos, 600)), false, 'đang có đơn mời thì không mời chồng');
    assert.ok(om.accept(600, pos));
    assert.equal(om.state, S.TO_PICKUP);
  });
  test('Vào hãng: tặng túi cơ bản; không theo cốt truyện thì mặc luôn đồng phục + mũ', () => {
    const gs = new GameState({ carry: { money: 500 } });
    assert.equal(gs.bag, 'nylon');
    assert.ok(gs.joinBrand('hongsm').ok);
    assert.equal(gs.bag, 'thermal', 'được tặng túi cơ bản và dùng luôn');
    assert.ok(gs.owned.bags.includes('thermal'));
    assert.ok(wearsBrandKit(gs), 'mặc luôn đồng phục + mũ hãng');
  });
  test('Tin nhắn: lưu vào save, giữ tối đa 60 tin mỗi cuộc, đọc / chưa đọc', () => {
    const gs = new GameState();
    for (let i = 0; i < 70; i++) gs.addMessage('x:Nhóm', { text: `tin ${i}` }, i, { name: 'Nhóm' });
    assert.equal(gs.inbox.threads['x:Nhóm'].msgs.length, 60);
    assert.equal(gs.unreadMessages, 70);
    gs.readThread('x:Nhóm');
    assert.equal(gs.unreadMessages, 0);
    const back = new GameState({ carry: JSON.parse(JSON.stringify(gs.carryOver())) });
    assert.equal(back.inbox.threads['x:Nhóm'].msgs.at(-1).text, 'tin 69', 'tải lại vẫn còn tin nhắn');
    assert.ok(!gs.reply('x:Nhóm', 0), 'không có câu trả lời nhanh thì không trả lời được');
  });
  test('Tính cách: chọn câu cộng điểm (1 lần), nhiều điểm nhất thắng, bằng nhau → trung lập; bước onlyTrait của tính cách khác bị bỏ qua', () => {
    const gs = new GameState({ carry: { flags: { story: 0 } } });
    beginChapter(gs.story);
    assert.equal(leaning(gs.story), 'neutral', 'chưa có điểm → trung lập');
    storyPick(gs.story, 'a', 0, { trait: 'good', pts: 2 });
    storyPick(gs.story, 'a', 1, { trait: 'bad', pts: 5 });
    assert.deepEqual(gs.story.traits, { good: 2, neutral: 0, bad: 0 }, 'mỗi lựa chọn chỉ tính lần đầu');
    assert.equal(leaning(gs.story), 'good');
    storyPick(gs.story, 'b', 0, { trait: 'bad', pts: 2 });
    assert.equal(leaning(gs.story), 'neutral', 'gương mẫu = xấu tính → trung lập');
    storyPick(gs.story, 'c', 0, { trait: 'bad', pts: 1 });
    assert.equal(leaning(gs.story), 'bad');
    assert.equal(new GameState({ carry: JSON.parse(JSON.stringify(gs.carryOver())) }).story.traits.bad, 3, 'điểm nằm trong bản lưu');
    const data = { chapters: [{ id: 'x', steps: [
      { id: 's0', until: { type: 'none' } },
      { id: 'onlyGood', onlyTrait: 'good', on: [{ do: 'toast', text: 'g' }], until: { type: 'none' } },
      { id: 'onlyBad', onlyTrait: 'bad', on: [{ do: 'toast', text: 'b' }], until: { type: 'wait', min: 99 } },
    ] }] };
    const s2 = new GameState({ carry: { flags: { story: 0 } } });
    Object.assign(s2.story, { ch: 'x', traits: { good: 0, neutral: 0, bad: 4 } });
    beginChapter(s2.story);
    const acts = [];
    for (let i = 0; i < 6; i++) acts.push(...storyTick(s2, 1, {}, data));
    assert.equal(stepOf(s2.story, data)?.id, 'onlyBad', 'người xấu tính bỏ qua bước của gương mẫu');
    assert.deepEqual(acts.map((a) => a.text), ['b'], 'chỉ chạy nội dung của tính cách mình');
    // câu trả lời nhanh trong tin nhắn cũng cộng điểm
    const s3 = new GameState({ carry: { flags: { story: 0 } } });
    beginChapter(s3.story);
    s3.addMessage('me', { key: 'm' });
    s3.setReplies('me', ['r1', 'r2', 'r3'], [null, { trait: 'bad', pts: 2 }, null]);
    assert.deepEqual(s3.reply('me', 1), { gain: { trait: 'bad', pts: 2 } }, 'trả lời tin nhắn → báo điểm vừa cộng');
    assert.equal(s3.story.traits.bad, 2);
    s3.setReplies('me', ['q1', 'q2'], null);
    assert.deepEqual(s3.reply('me', 0), { gain: null }, 'câu không gắn điểm → không cộng');
    assert.equal(s3.story.traits.bad, 2);
    const ask = STORY.chapters[0].steps.flatMap((x) => x.on || []).find((a) => a.do === 'choose');
    assert.equal(ask.gains.length, 3, 'câu trả lời anh phát tờ rơi có gắn điểm');
    const badData = { contacts: {}, people: { p: {} }, items: {}, parcels: {}, chapters: [{ id: 'c', title: 't', steps: [
      { id: 'a', onlyTrait: 'evil', on: [{ do: 'choose', id: 'q', who: 'p', options: ['o1', 'o2'], answers: ['a1', 'a2'], gains: [{ trait: 'good', pts: 0 }, { trait: 'xx', pts: 1 }] }], until: { type: 'chosen', id: 'q' } },
    ] }] };
    const errs = validateStory(badData, {}).filter((i) => i.level === 'error').map((i) => i.msg).join(' | ');
    for (const w of ['tính cách lạ "evil"', 'tính cách lạ "xx"', '+ 1–10 điểm']) assert.ok(errs.includes(w), `thiếu lỗi: ${w}`);
  });
  test('Bộ kiểm tra cốt truyện: người nhắn lạ, địa điểm lạ, thiếu chữ, quá 3 câu trả lời, điều kiện lạ → lỗi', () => {
    const bad = {
      contacts: { me: { icon: '👩', name: 'k.me' } },
      chapters: [{ id: 'c1', title: 'k.t', steps: [
        { id: 'a', on: [{ do: 'msg', from: 'ai', text: 'k.x' }, { do: 'replies', who: 'me', texts: ['k.1', 'k.2', 'k.3', 'k.4'] }], until: { type: 'bay' } },
        { id: 'b', until: { type: 'arrive', place: 'khongCo' }, goal: 'k.thieu' },
      ] }],
    };
    const content = { 'k.me': 'Mẹ', 'k.t': 'C1', 'k.x': 'x', 'k.1': '1', 'k.2': '2', 'k.3': '3', 'k.4': '4' };
    const errs = validateStory(bad, { places: { places: [] }, content }).filter((i) => i.level === 'error').map((i) => i.msg).join(' | ');
    assert.ok(/người gửi "ai"/.test(errs), errs);
    assert.ok(/1–3 câu/.test(errs), errs);
    assert.ok(/Điều kiện xong lạ/.test(errs), errs);
    assert.ok(/khongCo/.test(errs), errs);
    assert.ok(/k\.thieu/.test(errs), errs);
    assert.equal(validateStory(STORY, {}).filter((i) => i.level === 'error').length, 0, 'cốt truyện hiện tại không lỗi');
  });
  test('Bộ kiểm tra cảnh phim nâng cao: đạo cụ, mốc, góc máy, đuổi theo, tới chỗ — dữ liệu sai thì báo', () => {
    const bad = { contacts: {}, people: { t: {}, m: {} }, items: {}, parcels: {}, chapters: [{ id: 'c', title: 't', steps: [
      { id: 'a', on: [{ do: 'chase', who: 't', route: [{ node: [1, 1] }, { at: [5, 'x'] }, { at: [9, 9], mark: 'go', act: 'bay', lat: 20, air: -1 }] }], until: { type: 'reach', at: [1], r: 999 } },
      { id: 'b', on: [
        { do: 'chase', who: 'm', follow: 'khongCo', spawn: 'sau', bike: 'xe lạ', route: [{ node: [0, 0] }, { node: [1, 0] }] },
        { do: 'prop', id: '1x', kind: 'tau', when: 't:khongCoMoc' },
        { do: 'cine', ride: 'ai', shots: [{ eye: true, t: 2, slow: 3, until: 'khong co' }, { pos: [1, 2], t: 1 }, { at: 'prop:khongCo', t: 1, lookAt: 'actor:ai' }] },
        { do: 'helmetOff', who: 'ai' },
      ], until: { type: 'cine' } },
    ] }] };
    const all = validateStory(bad, {});
    const errs = all.filter((i) => i.level === 'error').map((i) => i.msg).join(' | ');
    for (const w of ['tọa độ phải là [x, z]', 'hành động lạ "bay"', 'lệch ngang', 'bay cao thêm', 'Tới chỗ: tọa độ', 'Tới chỗ: bán kính', '"đuổi theo" — "khongCo"', 'chỗ xuất hiện lạ', 'kiểu xe lạ',
      'Đạo cụ: mã', 'Đạo cụ: loại lạ "tau"', '"xe người chơi tự chạy theo" — "ai"', 'quay chậm 0,1–1', 'người:mốc', 'chỗ đặt máy quay', 'đạo cụ "khongCo"', '"nhìn theo" — "actor:ai"', 'Người lạ "ai"']) assert.ok(errs.includes(w), `thiếu lỗi: ${w}`);
    assert.ok(all.some((i) => i.level === 'warn' && i.msg.includes('t:khongCoMoc')), 'đạo cụ chờ mốc không có → cảnh báo');
  });
  {
    const { HAIR_BY_GENDER, HAIR_STYLES, HAIR_EXTRA } = await import('../src/sim/people.js');
    const { lookOfChar } = await import('../src/data/relations.js');
    const rel = readJson('src/data/relations.json');
    test('Tóc "crop" (ngắn tỉa, mái rủ trán): hợp lệ cho NPC, không có ở màn tạo nhân vật; bộ "Đi đua" của anh mô tô để tóc crop, bộ thường giữ tóc cũ; anh ấy đeo kính gọng mày mọi bộ', () => {
      assert.ok(HAIR_STYLES.includes('crop') && HAIR_EXTRA.m.includes('crop') && !HAIR_BY_GENDER.m.includes('crop'));
      const man = rel.characters.man;
      assert.equal(lookOfChar(man, 'duaXe').hairStyle, 'crop');
      for (const o of man.outfits) assert.equal(lookOfChar(man, o.id).face, 'browline', `bộ ${o.name}: đeo kính gọng mày`);
      assert.equal(lookOfChar(man, 'duaXe').helmetStyle, 'race');
      assert.equal(lookOfChar(man, 'duaXe').shirtStyle, 'racing');
      assert.equal(lookOfChar(man, 'thuongNgay').hairStyle, man.look.hairStyle, 'bộ thường ngày (nói chuyện với chị Linh) giữ tóc cũ');
    });
  }
}

console.log('Sơ đồ quan hệ nhân vật (relations.json — /?relationship)');
{
  const R = await import('../src/data/relations.js');
  const { GOODS } = await import('../src/data/goods.js');
  const { validateRelations, validateStory, validateGoods } = await import('../src/data/validate.js');
  const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  const story = read('src/data/story.json'), places = read('src/data/places.json'), goods = read('src/data/goods.json'), content = read('src/content/vi.json');
  test('relations.json hiện tại không lỗi; có người chơi', () => {
    const errs = validateRelations(R.REL, { story, places, goods, content }).filter((i) => i.level === 'error');
    assert.equal(errs.length, 0, errs.map((i) => i.msg).join(' | '));
    assert.ok(R.REL.characters.player);
  });
  test('Xưng hô theo dây: người trong cốt truyện / NPC địa điểm; chưa có dây hoặc chưa tới chương thì không đổi', () => {
    const rel = {
      characters: { player: { name: 'Người chơi' }, a: { name: 'Cô Ba', gender: 'f', story: 'coBa' }, b: { name: 'Anh Tư', place: 'quanTu' }, c: { name: 'Chị Năm', story: 'chiNam' } },
      links: [
        { id: 'l1', a: 'a', b: 'player', type: 'host', ab: { self: 'cô', call: 'cháu' }, ba: { self: 'cháu', call: 'cô Ba' }, from: 1 },
        { id: 'l2', a: 'player', b: 'b', type: 'friend', ab: { self: 'tui', call: 'ông' }, ba: { self: 'tao', call: 'mày' }, from: 1 },
        { id: 'l3', a: 'c', b: 'player', type: 'friend', ab: { self: 'chị', call: 'em' }, ba: {}, from: 3 },
      ],
    };
    const v = R.voiceOf('coBa', 'm', 1, rel);
    assert.deepEqual([v.toi, v.ban, v.minh, v.khach, v.Ban], ['cô', 'cháu', 'cháu', 'cô Ba', 'Cháu']);
    const w = R.voiceOf('place:quanTu', 'm', 1, rel);
    assert.deepEqual([w.toi, w.ban, w.minh, w.khach], ['tao', 'mày', 'tui', 'ông'], 'dây ghi chiều người chơi → B trước vẫn đọc đúng');
    assert.equal(R.voiceOf('chiNam', 'm', 2, rel), null, 'dây từ chương 3: chương 2 chưa dùng');
    assert.equal(R.voiceOf('chiNam', 'm', 3, rel).toi, 'chị');
    assert.equal(R.voiceOf('khongCo', 'm', 1, rel), null);
    assert.equal(R.chapterNum({ ch: 'c2' }, story), 2);
    assert.equal(R.chapterNum({ ch: null, done: ['c1', 'c2'] }, story), 3, 'xong hết → sau chương cuối');
  });
  test('Ngoại hình nhân vật: bộ đồ chọn từ goods.json; món không còn thì bỏ qua; chưa có ngoại hình → null', () => {
    const c = { look: { gender: 'm', hairStyle: 'part', hair: '#1b1b1b', skin: '#e0ac69', scale: 1.05 }, outfits: [{ id: 'a', name: 'A', worn: { shirt: 'aoSoMiTrang', face: 'kinhRam', pants: 'khongCo' } }] };
    const L = R.lookOfChar(c, 'a', goods);
    assert.equal(L.shirt, 0xf4f4f4);
    assert.equal(L.face, 'glasses');
    assert.equal(L.scale, 1.05);
    assert.equal(R.lookOfChar({ name: 'x' }), null);
    const old = R.lookOfChar({ look: { gender: 'f', age: 'old', build: 'fat' } });
    assert.deepEqual([old.age, old.build], ['old', 'fat'], 'tuổi + vóc dáng');
  });
  test('Xưng hô "anh/chị": đổi theo giới tính người chơi; ô có {…} bị báo lỗi', () => {
    const rel = {
      types: { friend: { name: 'Bạn', color: '#2ecc71' } },
      characters: { player: { name: 'Người chơi', age: 19 }, minh: { name: 'Minh', gender: 'f', story: 'minh' }, x: { name: 'X' } },
      links: [
        { id: 'l1', a: 'player', b: 'minh', type: 'friend', ab: { self: 'anh/chị', call: 'em' }, ba: { self: 'em', call: 'Chị / Anh' } },
        { id: 'l2', a: 'player', b: 'x', type: 'friend', ab: { self: '{tôi}', call: 'em' }, ba: { self: 'em', call: '{ban}' } },
      ],
    };
    const m = R.voiceOf('minh', 'm', 1, rel), f = R.voiceOf('minh', 'f', 1, rel);
    assert.deepEqual([m.ban, m.Ban, m.minh, m.toi, m.khach], ['anh', 'Anh', 'anh', 'em', 'em'], 'người chơi nam');
    assert.deepEqual([f.ban, f.minh], ['chị', 'chị'], 'người chơi nữ');
    const errs = validateRelations(rel, {}).filter((i) => i.level === 'error').map((i) => i.msg);
    assert.equal(errs.filter((x) => x.includes('{…}')).length, 2, 'ô {tôi} + ô {ban}');
    assert.ok(!errs.some((x) => x.includes('Minh')), 'anh/chị hợp lệ');
  });
  test('Bộ kiểm tra quan hệ: dây hỏng, thiếu xưng hô với người chơi, trùng dây, chương sai, xưng ngược tuổi, 2 chiều không khớp, thoại lệch sơ đồ', () => {
    const rel = {
      types: { friend: { name: 'Bạn', color: '#2ecc71' } },
      characters: {
        player: { name: 'Người chơi', age: 19 },
        coHai: { name: 'Cô Hai', age: 55, story: 'coHai', from: 1 },
        late: { name: 'Người tới sau', from: 3 },
        bad: { name: 'Sai', story: 'khongCoNguoiNay', look: { gender: 'm' }, outfits: [{ id: 'o', name: 'O', worn: { shirt: 'khongCoAo' } }] },
      },
      links: [
        { id: 'x1', a: 'coHai', b: 'player', type: 'friend', ab: { self: 'em', call: 'con' }, ba: { self: 'cháu', call: 'cô' }, from: 1 },
        { id: 'x2', a: 'coHai', b: 'player', type: 'friend', ab: {}, ba: {}, from: 1 },
        { id: 'x3', a: 'late', b: 'coHai', type: 'friend', ab: { self: 'a', call: 'b' }, ba: { self: 'b', call: 'a' }, from: 1 },
        { id: 'x4', a: 'ma', b: 'coHai', type: 'friend' },
        { id: 'x5', a: 'coHai', b: 'late', type: 'kiLa', ab: {}, ba: {} },
      ],
    };
    const all = validateRelations(rel, { story, places, goods, content });
    const msg = (lv) => all.filter((i) => i.level === lv).map((i) => i.msg).join(' | ');
    const errs = msg('error'), warns = msg('warn');
    assert.ok(/không còn \(ma\)/.test(errs), errs);
    assert.ok(/thiếu xưng hô chiều Cô Hai → Người chơi/.test(errs), errs);
    assert.ok(/trùng dây/.test(errs), errs);
    assert.ok(/chỉ xuất hiện từ chương 3/.test(errs), errs);
    assert.ok(/khongCoNguoiNay/.test(errs) && /khongCoAo/.test(errs), errs);
    assert.ok(/loại dây lạ "kiLa"/.test(errs), errs);
    assert.ok(/tự xưng "em".*xưng ngược tuổi/.test(warns), warns);
    assert.ok(/gọi Người chơi là "con" nhưng Người chơi tự xưng "cháu"/.test(warns), warns);
    // thoại lệch: chú Hai chương 1 nói "cháu" nhưng dây ghi gọi "con"
    const r2 = { types: rel.types, characters: { player: { name: 'P' }, chuHai: { name: 'Chú Hai', story: 'chuHai', place: 'dichvu4' } }, links: [{ id: 'k', a: 'chuHai', b: 'player', type: 'friend', ab: { self: 'chú', call: 'con' }, ba: { self: 'con', call: 'chú Hai' } }] };
    const fake = { ...content, 'story.c1.toChuHai.text': 'A, cháu hả? Chú gói cơm cho cháu nè.' }; // câu ghi "cháu" nhưng dây ghi gọi "con"
    assert.ok(validateRelations(r2, { story, places, goods, content: fake }).some((i) => /Thoại lệch sơ đồ — story\.c1\.toChuHai\.text/.test(i.msg)));
    assert.ok(!validateRelations(r2, { story, places, goods, content: { ...content, 'story.c1.toChuHai.text': 'A, con hả? Dượng gói cơm cho con nè.' } }).some((i) => /toChuHai/.test(i.msg)), 'câu gọi đúng như dây thì không báo');
  });
  test('Người lạ dáng "Theo sơ đồ quan hệ": phải có nhân vật gắn với người đó (có ngoại hình / là NPC); đồ "Chỉ cho NPC" không bán, người chơi không tự có', () => {
    const st = { contacts: {}, people: { flyer: { icon: '🧢', name: 'story.people.flyer' } }, chapters: [{ id: 'c1', title: 'story.c1.title', steps: [{ id: 's', on: [{ do: 'actor', who: 'flyer', look: 'char' }], until: { type: 'none' } }] }] };
    const e1 = validateStory(st, { relations: { characters: {} } }).filter((i) => i.level === 'error').map((i) => i.msg).join(' | ');
    assert.ok(/chưa có nhân vật nào gắn với "flyer"/.test(e1), e1);
    const e2 = validateStory(st, { relations: { characters: { f: { name: 'F', story: 'flyer' } } } }).filter((i) => i.level === 'error').map((i) => i.msg).join(' | ');
    assert.ok(/chưa có ngoại hình/.test(e2), e2);
    assert.equal(validateStory(st, { relations: { characters: { f: { name: 'F', story: 'flyer', look: { gender: 'm' } } } } }).filter((i) => i.level === 'error' && /sơ đồ/.test(i.msg)).length, 0);
    const g2 = { ...goods, npcAo: { id: 'npcAo', type: 'outfit', slot: 'shirt', style: 'shirt', color: '#123456', name: 'Áo NPC', icon: '👕', price: 0, npcOnly: true } };
    assert.ok(!validateGoods(g2, places).some((i) => i.ref === 'npcAo' && i.level !== 'info'), 'không cảnh báo "chưa nơi bán"');
    GOODS.npcAo = g2.npcAo;
    try {
      assert.ok(!new GameState({ day: 1, carry: { money: 100 } }).ownsOutfit('npcAo'), 'người chơi không tự có đồ chỉ cho NPC');
    } finally { delete GOODS.npcAo; }
  });
}

console.log('Đổi tên khắp nơi + tên cũ còn sót (sơ đồ quan hệ)');
{
  const { findOldName, staleNames } = await import('../src/data/validate.js');
  const story = {
    contacts: { coBa: { icon: '👵', name: 'k.coBa', place: 'nha' } },
    people: { linh: { icon: '👩', name: 'k.linh' } },
    chapters: [{ id: 'c1', title: 'k.t', steps: [
      { id: 'a', on: [{ do: 'say', who: 'coBa', text: 'k.say' }, { do: 'bubble', who: 'linh', text: 'k.linh' }], until: { type: 'none' } },
    ] }],
  };
  const rel = {
    characters: { player: { name: 'P' }, diBa: { name: 'Dì Ba', story: 'coBa', place: 'nha', oldNames: ['Cô Ba'] }, linh: { name: 'Linh', story: 'linh' } },
    links: [{ id: 'l1', a: 'linh', b: 'diBa', type: 'friend', ab: { self: 'con', call: 'cô Ba' }, ba: { self: 'cô', call: 'con' } }],
  };
  const content = { 'k.coBa': 'Cô Ba', 'k.say': 'Phòng cô dọn sẵn rồi nghe con.', 'k.goal': '🏠 Tới nhà Cô Ba', 'k.mom': 'Nhớ chào cô Ba nghe', 'k.linh': 'Dạ con chào cô Ba', 'k.list': ['Cô Bảy bán bánh', 'Gặp Cô Ba'], 'npc.nha.greet': 'Trễ là cô phạt đó!' };
  const places = { places: [{ id: 'nha', name: 'Nhà trọ Cô Ba', short: 'Nhà', sign: 'PHÒNG TRỌ CÔ BA' }] };
  test('Tìm tên cũ: hoa / thường chữ đầu, nguyên chữ (không đụng "Cô Bảy"), cả danh sách câu + tên địa điểm; người nói cố ý gọi tên cũ → giữ', () => {
    const it = findOldName('Cô Ba', 'Dì Ba', { rel, story, content, places, charId: 'diBa' });
    const by = Object.fromEntries(it.map((x) => [x.key || `${x.placeId}.${x.field}`, x]));
    assert.equal(by['k.goal'].after, '🏠 Tới nhà Dì Ba');
    assert.equal(by['k.mom'].after, 'Nhớ chào dì Ba nghe', 'chữ thường giữ chữ thường');
    assert.equal(by['k.list'].after, 'Gặp Dì Ba');
    assert.equal(by['k.list'].idx, 1, '"Cô Bảy" không bị đổi');
    assert.equal(by['nha.name'].after, 'Nhà trọ Dì Ba');
    assert.equal(by['nha.sign'].after, 'PHÒNG TRỌ DÌ BA', 'biển hiệu VIẾT HOA');
    assert.ok(by['k.linh'].keep, 'Linh gọi "cô Ba" theo dây → mặc định giữ');
    assert.ok(!by['k.say'], 'chưa bật đổi chữ tự xưng');
    const it2 = findOldName('Cô Ba', 'Dì Ba', { rel, story, content, places, charId: 'diBa', selfOld: 'cô', selfNew: 'dì', inclPlaces: false });
    assert.equal(it2.find((x) => x.key === 'k.say')?.after, 'Phòng dì dọn sẵn rồi nghe con.', 'đổi chữ tự xưng trong lời của chính người đó');
    assert.equal(it2.find((x) => x.key === 'npc.nha.greet')?.after, 'Trễ là dì phạt đó!', 'cả lời NPC riêng của địa điểm');
    assert.ok(!it2.some((x) => x.kind === 'place'));
  });
  test('Tên mới chứa tên cũ ("Người đàn ông" → "Người đàn ông chạy xe moto"): chỗ đã là tên mới không bị tính / không bị thay lần nữa', () => {
    const it = findOldName('Người đàn ông', 'Người đàn ông chạy xe moto', { rel: { characters: {} }, content: { a: 'Người đàn ông chạy xe moto', b: 'Người đàn ông đứng đó. Người đàn ông chạy xe moto đi rồi.' } });
    assert.deepEqual(it.map((x) => x.key), ['b']);
    assert.equal(it[0].after, 'Người đàn ông chạy xe moto đứng đó. Người đàn ông chạy xe moto đi rồi.');
  });
  test('Luật "tên cũ còn sót": có tên cũ trong câu chữ → cảnh báo; chỉ còn câu cố ý giữ → thôi', () => {
    assert.ok(/Tên cũ "Cô Ba" của Dì Ba còn ở/.test(staleNames(rel, { story, content, places })[0]?.msg || ''));
    const clean = { ...content, 'k.coBa': 'Dì Ba', 'k.goal': 'Tới nhà Dì Ba', 'k.mom': 'Nhớ chào dì Ba', 'k.list': ['Cô Bảy bán bánh', 'Gặp Dì Ba'] };
    assert.equal(staleNames(rel, { story, content: clean, places: { places: [{ id: 'nha', name: 'Nhà trọ Dì Ba' }] } }).length, 0);
  });
}

console.log('Cản trở giao thông: đưa vào lề');
{
  const { curbSpot, roadSegAt } = await import('../src/sim/roads.js');
  const { roadPos, CITY } = CITYLAYOUT;
  const H = CITY.ROAD / 2;
  test('Công an đưa vào lề: đi bộ lên vỉa hè, đi xe sát mép đường, giữa ngã tư ra góc; ngoài đường thì giữ nguyên', () => {
    const mid = roadPos(3) + CITY.PITCH / 2;
    // giữa lòng đường dọc (x = roadPos(2)), lệch phải 1 m
    const foot = curbSpot(roadPos(2) + 1, mid, false), bike = curbSpot(roadPos(2) + 1, mid, true);
    assert.ok(Math.abs(foot.x - roadPos(2)) > H && foot.z === mid, 'đi bộ: lên vỉa hè, cùng bên');
    assert.ok(foot.x > roadPos(2) && bike.x > roadPos(2), 'tấp vào lề bên gần hơn');
    assert.ok(Math.abs(bike.x - roadPos(2)) < H && Math.abs(bike.x - roadPos(2)) > H - 1.5, 'đi xe: sát mép lòng đường');
    // đường ngang, lệch trái
    const f2 = curbSpot(mid, roadPos(4) - 2, false);
    assert.ok(f2.z < roadPos(4) - H && f2.x === mid);
    // giữa ngã tư (2,3)
    const c = curbSpot(roadPos(2) + 2, roadPos(3) + 1, false);
    assert.ok(c.x > roadPos(2) + H && c.z > roadPos(3) + H, 'ra góc vỉa hè gần nhất');
    const cb = curbSpot(roadPos(2) + 2, roadPos(3) + 1, true);
    assert.ok(roadSegAt(cb.x, cb.z), 'đi xe: ra khỏi ngã tư, nằm trên một đoạn đường');
    // đang trong khối nhà / vỉa hè: giữ nguyên
    const inBlock = { x: roadPos(2) + CITY.PITCH / 2, z: mid };
    assert.deepEqual(curbSpot(inBlock.x, inBlock.z, false), inBlock);
  });
}

console.log('Phụ phí ngập');
{
  const { APP, ORDER_TYPES } = await import('../src/data/apps.js');
  test('Chỗ lấy hoặc chỗ giao đang ngập → đơn qua app cộng phụ phí ngập + nhãn 🌊; không ngập thì không', () => {
    const make = (isFlooded) => {
      const om = new OrderManager({ rng: makeRng(21), layout, gs: workerState({ day: DAY_ALL }), isFlooded });
      for (let i = 0; i < 50; i++) {
        const o = om.makeFood(ORDER_TYPES.food, 10 * 60, { x: 0, z: 0 });
        if (o) return o;
      }
      return null;
    };
    const dry = make(() => false), wet = make(() => true);
    assert.ok(dry && wet, 'tạo được đơn đồ ăn');
    assert.equal(wet.surcharge - dry.surcharge, APP.floodSurcharge || 0);
    assert.ok(wet.flags.flood && !dry.flags.flood);
    // chỉ chỗ giao ngập cũng tính (hỏi chỗ lấy trước, chỗ giao sau → chỉ trả "ngập" ở lần hỏi thứ 2 của mỗi đơn)
    let asks = 0;
    const onlyDrop = new OrderManager({ rng: makeRng(21), layout, gs: workerState({ day: DAY_ALL }), isFlooded: () => asks++ % 2 === 1 });
    const o2 = onlyDrop.makeFood(ORDER_TYPES.food, 10 * 60, { x: 0, z: 0 });
    assert.ok(o2 && o2.flags.flood && asks === 2, 'chỉ chỗ giao ngập vẫn có phụ phí');
  });
}

console.log('Khách lừa đảo khó nhận ra: dấu hiệu gây nhiễu, điểm nóng');
{
  const { scamHotspot } = await import('../src/sim/OrderManager.js');
  const { RIDER_TYPES, ORDER_TYPES } = await import('../src/data/apps.js');
  const { RIDE_EVENTS } = await import('../src/data/balance.js');
  const scam = Object.values(RIDER_TYPES).find((r) => r.scam);
  const plain = RIDER_TYPES.app;
  // chạy makeRide với một loại khách cố định, lúc 22:00 (giờ khách lừa đảo có)
  const rides = (rider, n, seed = 3, day = DAY_ALL) => {
    const om = new OrderManager({ rng: makeRng(seed), layout, gs: workerState({ day }) });
    om.pickRider = () => rider;
    const out = [];
    for (let i = 0; i < n; i++) { const o = om.makeRide({ x: 0, z: 0 }, false, 22 * 60, ORDER_TYPES.ride); if (o) out.push(o); }
    return out;
  };
  test('Khách lừa đảo luôn có đủ 2 dấu hiệu; khách app thường đôi khi cũng có (gây nhiễu) theo tỉ lệ ở thẻ Cân bằng', () => {
    if (!scam || !plain) return;
    for (const o of rides(scam, 30)) assert.ok(o.flags.newAcct && o.flags.cashOnly && o.flags.scam);
    const list = rides(plain, 800);
    const rate = (k) => list.filter((o) => o.flags[k]).length / list.length;
    assert.ok(Math.abs(rate('newAcct') - (RIDE_EVENTS.decoyNew ?? 0.08)) < 0.04, `newAcct ${rate('newAcct')}`);
    assert.ok(Math.abs(rate('cashOnly') - (RIDE_EVENTS.decoyCash ?? 0.1)) < 0.04, `cashOnly ${rate('cashOnly')}`);
    assert.ok(list.every((o) => !o.flags.scam));
  });
  test('Điểm nóng lừa đảo: cố định theo ngày, thuộc danh sách "Đón ở"; kẻ lừa đảo phần lớn đón ở đó', () => {
    if (!scam) return;
    const hot = scamHotspot(DAY_ALL, layout);
    if (!hot) return; // dữ liệu chưa đặt nơi đón cho khách lừa đảo
    assert.ok(scam.from.includes(hot.id));
    assert.equal(scamHotspot(DAY_ALL, layout), hot, 'cùng ngày cùng điểm');
    const days = new Set(Array.from({ length: 20 }, (_, d) => scamHotspot(d + 1, layout)?.id));
    if (scam.from.filter((id) => layout.placeById[id]).length > 1) assert.ok(days.size > 1, 'đổi theo ngày');
    // trong các chuyến đón ở địa điểm (không phải nhà dân), phần lớn đúng điểm nóng (nếu điểm nóng đang mở cửa)
    const atPlace = rides(scam, 300, 5).filter((o) => o.pickup.placeId);
    if (!atPlace.length || !isOpen(hot, 22 * 60, DAY_ALL)) return;
    const share = atPlace.filter((o) => o.pickup.placeId === hot.id).length / atPlace.length;
    assert.ok(share > (RIDE_EVENTS.hotspotPct ?? 0.7) - 0.1, `chỉ ${(share * 100).toFixed(0)}% đón ở điểm nóng`);
  });
}

console.log('Phố Việt Nam: độ đông vỉa hè theo khu');
{
  const { streetOf, STREET_IDS } = await import('../src/data/districtTraits.js');
  test('Độ đông vỉa hè: đặt riêng thì theo số đặt (tối đa 2); chưa đặt thì theo "người đi bộ"; hàng rong khu chưa bật 🛒 chỉ 40%', () => {
    assert.equal(streetOf({ street: { bikes: 1.5 }, traffic: 0.3 }, 'bikes'), 1.5);
    assert.equal(streetOf({ street: { bikes: 9 } }, 'bikes'), 2);
    assert.equal(streetOf({ traffic: 1.6 }, 'stalls'), 1.6);
    assert.equal(streetOf({ traffic: 3 }, 'bikes'), 2);
    assert.equal(streetOf({}, 'bikes'), 1);
    assert.equal(streetOf({ traffic: 1 }, 'vendors'), 0.4);
    assert.equal(streetOf({ traffic: 1, decor: { vendors: true } }, 'vendors'), 1);
    assert.equal(streetOf({ street: { vendors: 0 }, decor: { vendors: true } }, 'vendors'), 0);
    assert.deepEqual(STREET_IDS, ['bikes', 'stalls', 'vendors', 'flow']);
  });
  test('Bộ kiểm tra bản đồ: độ đông vỉa hè sai (mục lạ, ngoài 0–2, không phải bảng) → lỗi', () => {
    const { validateMap } = VALIDATE;
    const MAPD = readJson('src/data/map.json');
    const id = Object.keys(MAPD.districts)[0];
    const withStreet = (street) => ({ ...MAPD, districts: { ...MAPD.districts, [id]: { ...MAPD.districts[id], street } } });
    const errs = (m) => validateMap(m, DATA.places).filter((i) => i.level === 'error' && i.ref === `district:${id}`).map((i) => i.field);
    assert.deepEqual(errs(withStreet({ bikes: 1.2, stalls: 0, vendors: 2 })), []);
    assert.deepEqual(errs(withStreet({ bikes: 3, xe: 1 })).sort(), ['street.bikes', 'street.xe']);
    assert.deepEqual(errs(withStreet([1])), ['street']);
  });
}

console.log('Xe nền (chỉ để nhìn, src/world/bgTraffic.js)');
{
  const { BgTraffic } = await import('../src/world/bgTraffic.js');
  const { CITY, roadPos } = CITYLAYOUT;
  const cfg = { max: 120, near: 35, far: 140, speedMin: 7, speedMax: 10.5 };
  // người chơi đứng giữa đường ngang gần tâm bản đồ
  const P = { x: roadPos(Math.floor(CITY.N / 2)) + 20, z: roadPos(Math.floor(CITY.N / 2)) };
  const run = (density, sec = 60, move = 0) => {
    const bg = new BgTraffic({ seed: 5, cfg, density });
    let bad = null;
    for (let t = 0; t < sec; t += 1 / 30) {
      const px = P.x + move * t;
      bg.update(1 / 30, px, P.z, {});
      for (const b of bg.bikes) {
        if (!b.on || b.fade <= 0 || bad) continue;
        const d = Math.hypot(b.x - px, b.z - P.z);
        // đang hiện (dù mờ) thì không lấn vào gần quá: tối đa chạy thêm trong lúc mờ dần (~0,7 s × (10,5 + 9) m/s)
        if (d < cfg.near - 14) bad = `xe ${b.i} cách ${d.toFixed(1)} m`;
        // luôn nằm trên lòng đường (cách tim một đường dọc hoặc ngang ≤ nửa bề rộng đường)
        const ox = Math.abs(b.x - roadPos(Math.round((b.x - CITY.ORIGIN) / CITY.PITCH)));
        const oz = Math.abs(b.z - roadPos(Math.round((b.z - CITY.ORIGIN) / CITY.PITCH)));
        if (Math.min(ox, oz) > CITY.ROAD / 2 + 0.01) bad = `xe ${b.i} ra khỏi lòng đường (${ox.toFixed(1)}, ${oz.toFixed(1)})`;
      }
    }
    return { bg, bad };
  };
  test('Xe nền: không hiện trong vòng gần người chơi, luôn chạy trên lòng đường; người chơi chạy tới thì xe gần mờ đi', () => {
    for (const move of [0, 9]) {
      const { bg, bad } = run(() => 2, 40, move);
      assert.equal(bad, null, bad || '');
      assert.ok(bg.active > cfg.max * 0.6, `chỉ có ${bg.active} xe`);
    }
  });
  test('Xe nền: khu vắng ít xe, độ đông 0 thì không có xe; số tối đa 0 = tắt', () => {
    const busy = run(() => 2, 30).bg.active, quiet = run(() => 0.4, 30).bg.active;
    assert.ok(quiet < busy * 0.6, `khu vắng ${quiet} / khu đông ${busy}`);
    assert.equal(run(() => 0, 20).bg.active, 0);
    const off = new BgTraffic({ cfg: { ...cfg, max: 0 } });
    off.update(1 / 30, P.x, P.z, {});
    assert.equal(off.bikes.length, 0);
  });
  test('Xe nền: chạy qua được ngã tư (đổi đoạn đường) và dừng sau đuôi xe phía trước cùng làn', () => {
    const bg = new BgTraffic({ seed: 9, cfg, density: () => 2 });
    const start = new Map();
    for (let t = 0; t < 30; t += 1 / 30) {
      bg.update(1 / 30, P.x, P.z, {});
      for (const b of bg.bikes) if (b.on && !start.has(b.i)) start.set(b.i, b.from + '>' + b.to);
    }
    assert.ok(bg.bikes.some((b) => b.on && start.get(b.i) !== b.from + '>' + b.to), 'không xe nào qua ngã tư');
    // xe NPC thật đang đứng yên phía trước (cùng đoạn, cùng làn) → xe nền dừng sau đuôi
    const b = bg.bikes.find((x) => x.on && !x.turn && x.t < CITY.PITCH - 28);
    const car = { t: b.t + 14, lane: b.lane, turn: null };
    const onSeg = new Map([[b.from + '>' + b.to, [car]]]);
    for (let t = 0; t < 5; t += 1 / 30) bg.move(b, 1 / 30, new Map(), { onSeg });
    assert.ok(car.t - b.t > 2.5 && b.speed < 0.5, `xe nền cách xe trước ${(car.t - b.t).toFixed(1)} m, tốc độ ${b.speed.toFixed(1)}`);
  });
}

console.log('Vựa ve chai: bán đồ cũ, vỏ chai');
{
  const { GOODS } = await import('../src/data/goods.js');
  test('Uống nước suối xong còn vỏ chai trong túi; bán ve chai được giá theo cái, hết vỏ', () => {
    const gs = new GameState({ carry: { money: 100 } });
    gs.buy('goods', 'nuocSuoi');
    gs.buy('goods', 'lonSoda');
    gs.useConsumable('nuocSuoi');
    gs.useConsumable('lonSoda');
    assert.equal(gs.countOf('voChai'), 2);
    const e = gs.usedSellables().find((x) => x.id === 'voChai');
    assert.equal(e.k, 2 * GOODS.voChai.scrapPrice);
    const m = gs.money;
    assert.ok(gs.sellUsed('voChai').ok);
    assert.equal(gs.countOf('voChai'), 0);
    assert.equal(gs.money, m + e.k);
  });
  test('Bán quần áo đã mua được % giá mua (thẻ Cân bằng); đang mặc thì cởi ra; đồ có sẵn / đồ của hãng không bán được', () => {
    const gs = new GameState({ carry: { money: 5000 } });
    const shirt = Object.values(GOODS).find((g) => g.type === 'outfit' && g.price > 0 && !g.brand && g.slot === 'shirt');
    const free = Object.values(GOODS).find((g) => g.type === 'outfit' && g.price === 0);
    const branded = Object.values(GOODS).find((g) => g.brand);
    assert.ok(gs.buy('goods', shirt.id).ok);
    gs.wear(shirt.id);
    assert.ok(gs.isWorn(shirt.id));
    const ids = gs.usedSellables().map((x) => x.id);
    assert.ok(ids.includes(shirt.id) && !ids.includes(free.id));
    if (branded) {
      gs.owned.gear.push(branded.id);
      assert.ok(!gs.usedSellables().some((x) => x.id === branded.id));
    }
    const m = gs.money;
    const r = gs.sellUsed(shirt.id);
    assert.ok(r.ok && r.k === Math.round(shirt.price * (ECONOMY.resalePct ?? 0.3)));
    assert.equal(gs.money, m + r.k);
    assert.ok(!gs.isWorn(shirt.id) && !gs.owned.gear.includes(shirt.id));
    assert.ok(gs.wornIds().shirt, 'cởi áo đã bán → mặc lại áo có sẵn');
  });
  test('Dữ liệu: vựa ve chai có "Thu mua đồ cũ"; đồ uống chai / lon để lại vỏ', () => {
    assert.ok(DATA.places.places.some((p) => p.buys));
    for (const id of ['nuocSuoi', 'lonSoda', 'chaiTraXanh', 'energyDrink']) assert.equal(GOODS[id].use.leaves, 'voChai');
  });
}

console.log('Xưng hô theo người nói');
{
  const { personOf, pronouns, untag: untagLine } = await import('../src/sim/people.js');
  const { pickFor } = await import('../src/content/index.js');
  test('Tên → giới tính + tuổi; tự xưng / gọi người chơi đúng vai vế', () => {
    const t = (name, pg, opts) => { const p = pronouns(personOf(name, opts), pg); return `${p.toi}/${p.ban}`; };
    assert.equal(t('Chị Lan', 'm'), 'chị/em');
    assert.equal(t('Anh Tuấn', 'f'), 'anh/em');
    assert.equal(t('Chú Bảy', 'm'), 'chú/con');
    assert.equal(t('Bà Sáu', 'f'), 'bà/con');
    assert.equal(t('Bé Na', 'f'), 'em/chị');
    assert.equal(t('Bé Na', 'm'), 'em/anh');
    assert.equal(t('Nhân viên bán hàng', 'f', { role: 'staff' }), 'em/chị');
    assert.equal(personOf('Emma').gender, 'f');
    assert.equal(personOf('Kenji').gender, 'm');
    assert.equal(personOf('Bác Năm (mẹ anh Minh)', { gender: 'f' }).gender, 'f');
    // không đoán được → cố định theo tên (lần nào cũng như nhau)
    assert.equal(personOf('Hai Thông').gender, personOf('Hai Thông').gender);
    // thẻ trước tên đặt được tuổi / giới tính; "Thằng …" là thanh niên, "Thằng nhóc …" là trẻ con
    assert.equal(personOf('[kid] Con nít').age, 'kid');
    assert.equal(personOf('[elder,f] Người bán xôi').gender, 'f');
    assert.equal(personOf('[elder,f] Người bán xôi').age, 'elder');
    assert.equal(personOf('[khung] Thằng khùng').age, 'young');
    assert.equal(personOf('Thằng nhóc bán kẹo').age, 'kid');
    assert.ok(personOf('Sinh viên').guessed && !personOf('Anh sinh viên').guessed && !personOf('[f] Sinh viên').guessed);
  });
  test('Thẻ điều kiện: [day] không nói ban đêm · [late,damaged] chỉ khi vừa trễ vừa hư; không thẻ vai nên không lấn câu riêng', () => {
    const hs = personOf('Cậu học sinh');
    const night = Array.from({ length: 300 }, (_, i) => pickFor('bubble.ped', hs, i, pronouns(hs, 'm'), ['night']));
    assert.ok(!night.some((s) => /nắng quá|Nóng quá trời/i.test(s)), 'ban đêm không than nắng');
    const day = Array.from({ length: 300 }, (_, i) => pickFor('bubble.ped', hs, i, pronouns(hs, 'm'), ['day']));
    assert.ok(day.some((s) => /nắng quá|Nóng quá trời/i.test(s)), 'ban ngày vẫn có');
    const c2 = (cond) => Array.from({ length: 20 }, (_, i) => CONTENT.pick('comment.2', i, { ban: 'em' }, cond));
    assert.ok(!c2([]).some((s) => /trễ mà đồ còn hư/.test(s)), 'đúng giờ + hàng nguyên: không chê trễ / hư');
    assert.ok(c2(['late', 'damaged']).some((s) => /trễ mà đồ còn hư/.test(s)));
    assert.ok(Array.from({ length: 20 }, (_, i) => CONTENT.pick('comment.2', i, { ban: 'em' })).every((s) => !/^\[/.test(s)), 'không bỏ sót thẻ ra chữ');
  });
  test('Câu gắn thẻ vai chỉ người đúng vai nói ("[veso] Mua vé số…"); tên người đi đường bỏ thẻ khi hiện', () => {
    const veso = personOf('[veso] Cô bán vé số'), hs = personOf('Cậu học sinh');
    assert.equal(veso.name, 'Cô bán vé số');
    assert.equal(veso.role, 'veso');
    const say = (who) => Array.from({ length: 60 }, (_, i) => pickFor('bubble.ped', who, i, pronouns(who, 'm')));
    assert.ok(say(veso).some((s) => /vé số/i.test(s)));
    assert.ok(!say(hs).some((s) => /vé số|\[/.test(s)));
    // người có câu riêng: phần lớn nói câu đúng vai (ROLE_SHARE), vẫn có câu chung; i liền nhau ra câu khác nhau
    const { ROLE_SHARE } = CONTENT;
    const own = new Set(CONTENT.list('bubble.ped').map(untagLine).filter((x) => x.tags.includes('veso')).map((x) => x.text.replace(/\{(\w+)\}/g, (m, k) => pronouns(veso, 'm')[k])));
    const lines = Array.from({ length: 400 }, (_, i) => pickFor('bubble.ped', veso, i, pronouns(veso, 'm')));
    const share = lines.filter((s) => own.has(s)).length / lines.length;
    assert.ok(Math.abs(share - ROLE_SHARE) < 0.12, `câu đúng vai ${Math.round(share * 100)}%`);
    assert.ok(new Set(lines.slice(0, 6)).size >= 4, 'i liền nhau phải ra câu khác nhau');
    // câu bong bóng không bọc ngoặc kép
    assert.ok(CONTENT.list('bubble.ped').every((s) => !/^\s*(\[[^\]]*\]\s*)?"/.test(s)), 'bubble.ped có câu bọc ngoặc kép');
  });
  test('Mọi câu có chỗ trống xưng hô đều điền được (không còn {toi} / {ban} sót lại)', () => {
    const v = pronouns(personOf('Chú Bảy'), 'f');
    for (const [k, val] of Object.entries(CONTENT.contentTable())) {
      for (const s of Array.isArray(val) ? val : [val]) {
        const out = String(s).replace(/\{(\w+)\}/g, (m, p) => (p in v ? v[p] : m));
        assert.ok(!/\{(toi|Toi|ban|Ban|khach|Khach|minh|Minh|anhchi|Anhchi)\}/.test(out), k);
      }
    }
  });
}

console.log('Trạm sạc, cản trở giao thông lúc kẹt xe');
{
  const { lotFrame } = await import('../src/sim/airport.js');
  test('Trạm sạc kiểu cây xăng: chỗ sạc nằm trong sân trạm (sau vỉa hè), không phải cửa ngoài vỉa hè', () => {
    const ch = layout.places.filter((p) => p.kind === 'charger' && p.chargeSpot);
    assert.ok(ch.length);
    for (const p of ch) {
      const [, v] = lotFrame(p).toLocal(p.chargeSpot.x, p.chargeSpot.z);
      assert.ok(v < -1, `${p.id}: chỗ sạc cách mặt tiền ${v.toFixed(1)} m (phải nằm trong lô)`);
    }
  });
  const THREE = await import('three');
  const { Traffic } = await import('../src/world/traffic.js');
  test('Đứng trong đoạn kẹt xe / đang chạy theo dòng thì không bị tính cản trở giao thông; đứng yên giữa đường thường thì có', () => {
    const t = Object.create(Traffic.prototype);
    Object.assign(t, { scene: new THREE.Scene(), rng: makeRng(1), jamKeys: new Set(), jamCircles: [] });
    t.buildJamMeshes();
    const seg = { axis: 'x', line: 2, from: 1 };
    t.setJams([seg]);
    const r = CITYLAYOUT.segmentRect(seg), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    assert.ok(!t.blameable({ px: cx, pz: cz, onBike: false }), 'trong đoạn kẹt');
    assert.ok(!t.blameable({ px: cx + 300, pz: cz + 300, onBike: true, speed: 3 }), 'đang chạy theo dòng');
    assert.ok(t.blameable({ px: cx + 300, pz: cz + 300, onBike: false }), 'đứng yên giữa đường thường');
  });
}

console.log('App Tích Tắc (sim/feed.js)');
{
  const { buildFeed, parsePost, fmtCount } = await import('../src/sim/feed.js');
  const { validateFeedLines } = await import('../src/data/validate.js');
  test('Mẫu tin: tách loại ảnh / tác giả / chú thích / nhạc / chữ trên ảnh; số like kiểu 12,4K', () => {
    const p = parsePost('[photo:food] anuong | Phở {place} ngon | nhạc nền | 10/10', { place: 'Bà Tư' });
    assert.deepEqual(p.media, { type: 'photo', what: 'food' });
    assert.equal(p.author, '@anuong');
    assert.equal(p.caption, 'Phở Bà Tư ngon');
    assert.equal(p.overlay, '10/10');
    assert.equal(fmtCount(12400), '12,4K');
    assert.equal(fmtCount(1200000), '1,2M');
  });
  test('Tin nóng theo chuyện trong game (ngập, khai trương…) nằm đầu danh sách, có chỗ chụp ảnh; cùng seed ra cùng danh sách', () => {
    const facts = { forecast: 'mưa chiều', flood: [{ street: 'Đường số 16', at: { x: 0, z: 0, axis: 'x' } }], openings: [{ place: 'Quán Mới', at: { placeId: layout.places[0].id } }], me: { name: 'Tí', orders: 12, stars: 4.9, day: 3 } };
    const f = buildFeed({ facts, places: layout.places, seed: 5 });
    assert.ok(f.length > 15);
    assert.ok(f.slice(0, 4).some((p) => p.hot));
    const flood = f.find((p) => p.key === 'tt.hot.flood');
    assert.ok(flood && flood.caption.includes('Đường số 16') && flood.media.at?.axis === 'x');
    assert.ok(f.some((p) => p.key === 'tt.me.orders' && p.caption.includes('Tí')));
    for (const p of f) {
      assert.ok(p.likes > 0 && p.comments >= 0 && p.id, p.caption);
      if (p.media.type === 'photo') assert.ok(p.media.at, `tin ảnh chưa có chỗ chụp: ${p.caption}`);
      assert.ok(!/\{\w+\}/.test(p.caption + p.overlay), `còn chỗ trống chưa điền: ${p.caption}`);
    }
    assert.deepEqual(buildFeed({ facts, places: layout.places, seed: 5 }).map((p) => p.caption), f.map((p) => p.caption));
    // tin quán quen (tt.spot) lần nào cũng có 2 tin; photo:tra chụp đúng Tiệm Trà A Di Đà
    const spot = f.filter((p) => p.key === 'tt.spot');
    assert.equal(spot.length, 2);
    for (const p of spot) if (p.media.type === 'photo') assert.equal(p.media.at?.placeId, 'tra');
  });
  test('Bộ kiểm tra: mẫu tin Tích Tắc trong vi.json đúng dạng; sai loại ảnh / thiếu dấu | → lỗi', () => {
    assert.deepEqual(validateFeedLines(CONTENT.contentTable(), DATA.places), []);
    assert.equal(validateFeedLines({ 'tt.spot': ['[photo:khongCo] @a | b'] }, DATA.places).length, 1, 'photo:<mã địa điểm> không có → lỗi');
    const bad = validateFeedLines({ 'tt.fun': ['[photo:xyz] @a | b', '[clip:dog] không có dấu gạch', 'thiếu thẻ | x'] });
    assert.equal(bad.length, 3);
  });
}

console.log('Đèn giao thông & phạt nguội (sim/lights.js)');
{
  const L = await import('../src/sim/lights.js');
  const { LIGHTS } = await import('../src/data/balance.js');
  test('Hai trục đèn ngược pha: hướng này xanh / vàng thì hướng kia đỏ; đủ xanh → vàng → đỏ trong 1 chu kỳ', () => {
    const key = '3,4', cycle = 2 * ((LIGHTS.greenSec ?? 8) + (LIGHTS.yellowSec ?? 2));
    const seen = new Set();
    for (let t = 0; t < cycle; t += 0.25) {
      const z = L.lightColor(key, [0, 1], t), x = L.lightColor(key, [1, 0], t);
      seen.add(z);
      assert.ok(z === 'r' || x === 'r', `t=${t}: trục z ${z}, trục x ${x} — phải có 1 hướng đỏ`);
      assert.equal(L.lightColor(key, [0, -1], t), z, 'cùng trục 2 chiều cùng màu');
    }
    assert.deepEqual([...seen].sort(), ['g', 'r', 'y']);
  });
  test('Xe NPC dừng khi đỏ / vàng, rẽ phải luôn được, ngã tư không đèn không dừng', () => {
    const lm = new Map([['3,4', { i: 3, j: 4, cam: false }]]);
    let tRed = 0;
    while (L.lightColor('3,4', [0, 1], tRed) !== 'r') tRed += 0.5;
    assert.ok(L.mustStop(lm, '3,4', [0, 1], 'straight', tRed));
    assert.ok(L.mustStop(lm, '3,4', [0, 1], 'left', tRed));
    assert.ok(!L.mustStop(lm, '3,4', [0, 1], 'right', tRed));
    assert.ok(!L.mustStop(lm, '5,5', [0, 1], 'straight', tRed));
    assert.equal(L.turnOf([0, 1], [-1, 0]), 'right'); // bên phải của (x, z) là (−z, x)
  });
  test('Gợi ý tự động: đèn ở ngã tư ≥ 3 hướng nơi đại lộ cắt đường thường; camera là tập con; bản đồ đặt tay thì theo bản đồ', () => {
    const sg = L.suggestLights();
    assert.ok(sg.lights.length > 5, `chỉ có ${sg.lights.length} đèn`);
    for (const k of sg.lights) assert.ok(L.lightable(...k.split(',').map(Number)), k);
    assert.ok(sg.cameras.every((k) => sg.lights.includes(k)) && sg.cameras.length > 0);
    const MAPD = readJson('src/data/map.json');
    const own = L.lightMap({ ...MAPD, lights: [sg.lights[0]], cameras: [sg.lights[0]] });
    assert.equal(own.size, 1);
    assert.ok(own.get(sg.lights[0]).cam);
    assert.equal(L.lightMap({ ...MAPD, lights: [] }).size, 0, 'đặt danh sách rỗng = không có đèn nào');
  });
  test('% bị ghi hình: chốt CSGT > camera > ngã tư thường (thẻ Cân bằng)', () => {
    assert.equal(L.ticketChance({ police: true, cam: true }), LIGHTS.policePct ?? 1);
    assert.equal(L.ticketChance({ cam: true }), LIGHTS.cameraPct ?? 0.7);
    assert.equal(L.ticketChance({}), LIGHTS.basePct ?? 0.15);
  });
  test('Bộ kiểm tra bản đồ: đèn ở ngã tư lạ → lỗi, camera không có đèn → cảnh báo', () => {
    const { validateMap } = VALIDATE;
    const MAPD = readJson('src/data/map.json');
    const k = L.suggestLights().lights[0];
    const iss = (m) => validateMap(m, DATA.places).filter((i) => i.ref === 'lights');
    assert.deepEqual(iss({ ...MAPD, lights: [k], cameras: [k] }), []);
    assert.ok(iss({ ...MAPD, lights: ['99,99'] }).some((i) => i.level === 'error'));
    assert.ok(iss({ ...MAPD, lights: 'abc' }).some((i) => i.level === 'error'));
    assert.ok(iss({ ...MAPD, lights: [k], cameras: [k, '0,0'] }).some((i) => i.level === 'warn'));
  });
}

console.log('Trộm chó theo lịch chung (sim/dogThief.js)');
{
  const T = await import('../src/sim/dogThief.js');
  const F = await import('../src/sim/feed.js');
  const { atHour } = await import('../src/sim/clock.js');
  const { neighbors, roadPos } = await import('../src/sim/cityLayout.js');
  const cfg = { thiefPerNight: 2, thiefFrom: 22, thiefTo: 4 };
  test('Cùng ngày + cùng seed → cùng giờ, cùng chỗ (mọi máy thấy giống nhau); khác ngày → khác', () => {
    const a = T.thiefEvents(3, 777, cfg), b = T.thiefEvents(3, 777, cfg);
    assert.deepEqual(a, b);
    assert.equal(a.length, 2);
    assert.notDeepEqual(T.thiefEvents(4, 777, cfg).map((e) => e.at - 1440), a.map((e) => e.at));
  });
  test('Vụ trộm rơi trong khung 22:00 → 04:00, không chồng nhau, ở trên đường có thật', () => {
    for (let day = 1; day <= 20; day++) {
      const ev = T.thiefEvents(day, 99, cfg);
      const from = atHour(day, 22), to = from + 6 * 60;
      ev.forEach((e, i) => {
        assert.ok(e.at >= from && e.at + T.PHASE.end <= to, `ngày ${day}: ${e.at} ngoài khung ${from}–${to}`);
        if (i) assert.ok(e.at >= ev[i - 1].at + T.PHASE.end, 'hai vụ chồng lúc');
        const sp = T.thiefSpot(e.bx, e.bz, e.side, e.u);
        assert.ok(sp && Math.abs(sp.x - e.x) < 1e-9 && Math.abs(sp.z - e.z) < 1e-9);
        // điểm nằm trên tim một đường (x hoặc z trùng tim đường của ngã tư)
        const onLine = [...Array(30).keys()].some((i) => Math.abs(roadPos(i) - e.x) < 1e-6 || Math.abs(roadPos(i) - e.z) < 1e-6);
        assert.ok(onLine, `ngày ${day}: không nằm trên đường`);
      });
    }
  });
  test('activeThief: có vụ từ lúc chó ngồi chờ tới lúc trộm đi khuất; recentThieves: tin sáng hôm sau', () => {
    const e = T.thiefEvents(2, 5, cfg)[0];
    assert.equal(T.activeThief(e.at + 3, 5, cfg)?.id, e.id);
    assert.equal(T.activeThief(e.at + T.PHASE.dogFrom - 1, 5, cfg)?.id ?? null, null);
    assert.ok(T.recentThieves(e.at + 8 * 60, 5, cfg).some((x) => x.id === e.id));
    assert.ok(!T.recentThieves(e.at + 1, 5, cfg).some((x) => x.id === e.id), 'chưa xong thì chưa có tin');
    assert.deepEqual(T.thiefEvents(2, 5, { ...cfg, thiefPerNight: 0 }), []);
  });
  test('Mẫu tin Tích Tắc trộm chó hợp lệ, tin nóng có tên đường', () => {
    const feed = F.buildFeed({ facts: { dogThief: [{ street: 'Đường số 6', at: { x: 0, z: 0, axis: 'x' } }] }, seed: 3 });
    const p = feed.find((x) => x.key === 'tt.hot.dogThief');
    assert.ok(p && p.hot && p.caption.includes('Đường số 6'));
  });
}

console.log('Nhà địa điểm kiểu A, ô giữa khối, khuôn viên đại học');
{
  const CL = await import('../src/sim/cityLayout.js');
  const { validatePlaces } = VALIDATE;
  test('Ô giữa khối thường còn trống được lấp nhà phía sau; khối có hẻm / sông / gộp / địa điểm cả khối thì không', () => {
    const lay = CL.buildLayout();
    assert.ok(lay.centerFills.length > 0);
    const big = new Set(lay.places.filter((q) => ['B', 'M', 'BN0', 'BN2', 'BS0', 'BS2', 'JE', 'JS'].includes(q.lot)).map((q) => q.block.join(',')));
    for (const c of lay.centerFills) {
      const [bx, bz] = c.block, b = CL.blockBounds(bx, bz);
      assert.ok(!CL.blockPlan(bx, bz) && !CL.isWaterBlock(bx, bz) && !CL.isJoinedBlock(bx, bz), `${c.block}: khối có hẻm / sông / gộp`);
      assert.ok(!big.has(c.block.join(',')), `${c.block}: đã có địa điểm cả khối / ô giữa`);
      assert.ok(c.x0 > b.x0 + CL.CITY.SW && c.x1 < b.x1 - CL.CITY.SW && c.z0 > b.z0 + CL.CITY.SW && c.z1 < b.z1 - CL.CITY.SW, 'nằm trong lòng khối');
      for (const l of lay.lots.filter((l) => l.block[0] === bx && l.block[1] === bz)) assert.ok(c.x1 <= l.x0 + 0.3 || l.x1 <= c.x0 + 0.3 || c.z1 <= l.z0 + 0.3 || l.z1 <= c.z0 + 0.3, `${c.block}: chồng lô ${l.lot}`);
    }
  });
  test('Trường đại học được chọn "Cả khối"; quán ăn thì không; biển dọc phải là có / không', () => {
    const P = DATA.places;
    assert.deepEqual(validatePlaces({ ...P, places: P.places.map((q) => (q.id === 'rmit' ? { ...q, lot: 'B' } : q)) }, DATA.items).filter((i) => i.level === 'error' && i.ref === 'rmit' && i.field === 'lot'), []);
    assert.ok(validatePlaces({ ...P, places: P.places.map((q) => (q.id === 'pho' ? { ...q, lot: 'B' } : q)) }, DATA.items).some((i) => i.level === 'error' && i.ref === 'pho' && i.field === 'lot'));
    assert.ok(validatePlaces({ ...P, places: P.places.map((q) => (q.id === 'pho' ? { ...q, signV: 'có' } : q)) }, DATA.items).some((i) => i.level === 'error' && i.ref === 'pho' && i.field === 'signV'));
  });
}

console.log('CSGT tuần tra theo lịch chung (sim/patrol.js)');
{
  const PT = await import('../src/sim/patrol.js');
  const CL = await import('../src/sim/cityLayout.js');
  const { atHour } = await import('../src/sim/clock.js');
  const cfg = { patrolTeams: 2, patrolFrom: 7, patrolTo: 21, patrolSpeed: 8 };
  test('Cùng ngày + seed → cùng tuyến; tuyến đi theo đường có thật, đủ dài cho cả ca', () => {
    const a = PT.patrolTeams(4, 55, cfg), b = PT.patrolTeams(4, 55, cfg);
    assert.deepEqual(a, b);
    assert.equal(a.length, 2);
    for (const t of a) {
      for (let i = 1; i < t.route.length; i++) {
        const [p, q] = [t.route[i - 1], t.route[i]];
        assert.ok(CL.neighbors(...p).some(([x, z]) => x === q[0] && z === q[1]), `${t.id}: ${p} → ${q} không phải đoạn đường`);
      }
      assert.ok((t.route.length - 1) * CL.CITY.PITCH >= (t.end - t.start) * t.speed - CL.CITY.PITCH, 'tuyến ngắn hơn ca');
    }
    assert.deepEqual(PT.patrolTeams(4, 55, { ...cfg, patrolTeams: 0 }), []);
  });
  test('Chỉ chạy trong ca (7–21h); vị trí liền mạch theo đồng hồ (không nhảy cóc)', () => {
    const day = 3, t0 = atHour(day, 7);
    assert.equal(PT.activePatrols(t0 - 5, 9, cfg).length, 0);
    assert.equal(PT.activePatrols(atHour(day, 21) + 5, 9, cfg).length, 0);
    const team = PT.patrolTeams(day, 9, cfg)[0];
    let last = PT.patrolPose(team, team.start + 1);
    for (let m = team.start + 1.5; m < team.start + 200; m += 0.5) {
      const p = PT.patrolPose(team, m);
      assert.ok(Math.hypot(p.x - last.x, p.z - last.z) <= team.speed * 0.5 + 1e-6, `nhảy ${Math.hypot(p.x - last.x, p.z - last.z)} m lúc ${m}`);
      last = p;
    }
  });
}

console.log(`\n${pass} đạt, ${fail} lỗi`);
if (fail) process.exit(1);
