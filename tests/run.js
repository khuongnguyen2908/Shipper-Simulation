// Bộ thử tự động cho phần mô phỏng thuần. Chạy: npm test
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ITEMS as DATA_ITEMS } from '../src/data/items.js';
import { ECONOMY, TIME } from '../src/data/balance.js';
import { DeliveryItem } from '../src/sim/ItemPhysics.js';
import { evaluateOrder } from '../src/sim/OrderCondition.js';
import { computePayout } from '../src/sim/economy.js';
import { OrderManager, S, TRANSITIONS } from '../src/sim/OrderManager.js';
import { GameState } from '../src/sim/GameState.js';
import { HazardManager } from '../src/sim/hazards.js';
import { makeRng } from '../src/sim/rng.js';
import { buildLayout, blockAt, HALF } from '../src/sim/cityLayout.js';
import { objectives } from '../src/sim/objectives.js';

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
const NO_BAG = { insulation: 0, waterproof: 0, padding: 0 };
const THERMAL = { insulation: 0.55, waterproof: 0.5, padding: 0.25 };
const env = (o = {}) => ({ ambient: 30, sun: 0.5, raining: false, exposed: true, speed: 8, comfortSpeed: 11, suspension: 0.2, bag: NO_BAG, ...o });
const layout = buildLayout();

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
test('Công thức: (cước + quãng đường) − 20% − thuế − xăng', () => {
  const p = computePayout({ baseFare: 30, distanceKm: 2.5, litersUsed: 0.1, stars: 5 });
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
  const t = coldShop.hours ? coldShop.hours[0] * 60 + 30 : 480;
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
test('Thắng khi trả đủ tiền nhà trước 22:00', () => {
  const gs = new GameState({ carry: { money: 500 } });
  assert.ok(gs.payRent(20 * 60).ok);
  assert.equal(gs.checkEnd(20 * 60).type, 'win');
});
test('Thua khi 22:00 chưa trả tiền nhà', () => {
  const gs = new GameState();
  assert.equal(gs.checkEnd(TIME.dayEnd).type, 'lose');
});
test('Thua khi điểm dưới 4.0, khi kiệt sức, khi suy sụp', () => {
  const a = new GameState();
  for (let i = 0; i < 4; i++) a.ratingBook.add(1);
  assert.equal(a.checkEnd(600).type, 'lose');
  const b = new GameState();
  b.phys = 0;
  assert.equal(b.checkEnd(600).type, 'lose');
  const c = new GameState();
  c.mental = 0;
  assert.equal(c.checkEnd(600).type, 'lose');
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
  assert.equal(a.potholes.length, 46);
  for (const p of a.potholes) assert.ok(!blockAt(p.x, p.z), 'ổ gà nằm trên vỉa hè');
});

console.log('Đồ dùng, hoạt động, điểm đến (luật bằng dữ liệu)');
{
  const { GOODS } = await import('../src/data/goods.js');
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
      assert.equal(r.pay.tip, 8 + 4);
      delete GOODS.__tip;
      return;
    }
    assert.fail('không tìm được đơn phù hợp');
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

console.log('Tòa nhà nhiều lô');
{
  const { lotInfo, LOT_W, lotParts, LOT_SIZES, lotSize } = await import('../src/sim/cityLayout.js');
  const { lotCells } = await import('../src/data/validate.js');
  const W = LOT_W, near = (a, b) => Math.abs(a - b) < 1e-9;
  test('Khung lô đúng cỡ và mặt tiền đúng hướng', () => {
    const cases = { N1: [1, 1, 'N'], N01: [2, 1, 'N'], S12: [2, 1, 'S'], N: [3, 1, 'N'], S: [3, 1, 'S'], W: [1, 3, 'W'], E: [1, 3, 'E'], E1: [1, 1, 'E'] };
    for (const [lot, [w, d, face]] of Object.entries(cases)) {
      const r = lotInfo(2, 2, lot);
      assert.ok(near(r.x1 - r.x0, w * W) && near(r.z1 - r.z0, d * W), `${lot}: ${(r.x1 - r.x0) / W}×${(r.z1 - r.z0) / W}`);
      assert.equal(r.face, face, lot);
    }
    // cả cột tây trùng khít 3 lô đơn N0, W1, S0
    const col = lotInfo(2, 2, 'W'), n0 = lotInfo(2, 2, 'N0'), s0 = lotInfo(2, 2, 'S0');
    assert.ok(near(col.z0, n0.z0) && near(col.z1, s0.z1) && near(col.x0, n0.x0));
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
  const { makePerson, npcLook, randomPersonOpts } = await import('../src/world/models.js');
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
  test('Dựng hình 3D: tóc dài, búi, váy có đủ phần', () => {
    const a = makePerson({ gender: 'f', hairStyle: 'long', skirt: true });
    assert.ok(a.userData.parts.hair && a.userData.parts.skirt);
    const b = makePerson({ gender: 'f', hairStyle: 'bun' });
    assert.ok(b.userData.parts.hair && !b.userData.parts.skirt);
    const c = makePerson({});
    assert.ok(!c.userData.parts.hair && !c.userData.parts.skirt); // nam mặc định giữ như cũ
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
  const data = { items: read('src/data/items.json'), gear: read('src/data/gear.json'), goods: read('src/data/goods.json'), places: read('src/data/places.json'), content: read('src/content/vi.json') };
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
      ...[1, 2, 3, 4, 5].map((n) => `comment.${n}`),
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

console.log(`\n${pass} đạt, ${fail} lỗi`);
if (fail) process.exit(1);
