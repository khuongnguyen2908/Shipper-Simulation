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
  let sawCold = false;
  for (let i = 0; i < 80; i++) if (om.makeOffer(480, { x: 0, z: 0 }).itemIds.some((id) => DATA_ITEMS[id].traits.includes('cold'))) sawCold = true;
  assert.ok(sawCold);
});
test('Có mũ cho khách → đơn chở anh Minh (nhiệm vụ ví)', () => {
  const { om, gs } = mkOM(9, { carry: { money: 500 } });
  gs.buy('gear', 'spareHelmet');
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

console.log('Dữ liệu & kho chữ (sửa bằng công cụ ?editor)');
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  const data = { items: read('src/data/items.json'), gear: read('src/data/gear.json'), places: read('src/data/places.json'), content: read('src/content/vi.json') };
  const { validateAll, validateItems, validatePlaces, validateContent } = await import('../src/data/validate.js');
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
    const content = { ...data.content, 'toast.dayStart': 'Ngày {abc}' };
    assert.ok(validateContent(content, data.content).some((i) => i.ref === 'toast.dayStart' && i.level === 'error'));
  });
}

console.log(`\n${pass} đạt, ${fail} lỗi`);
if (fail) process.exit(1);
