// =============================================================
// BẢNG CHEAT để test game — chỉ nạp khi chạy `npm run dev` và mở với ?cheat (xem game.js; bản build không có).
// Bấm phím ` (dưới phím Esc) để mở / đóng. Các công tắc (khóa chỉ số, miễn CSGT…) nhớ qua F5 trên máy này.
// Chữ trong bảng là công cụ cho người làm game (như ?editor) nên viết thẳng, không qua vi.json.
// Danh sách xe, túi, đồ, địa điểm, loại đơn, loại khách đọc từ dữ liệu JSON → thêm trong ?editor là bảng có theo.
// =============================================================
import { S } from '../sim/OrderManager.js';
import { ORDER_TYPES, RIDER_TYPES, BRANDS } from '../data/apps.js';
import { VEHICLES, BAGS, ORDER } from '../data/balance.js';
import { GOODS } from '../data/goods.js';
import { ITEMS } from '../data/items.js';
import { minutesUntil, fmtClock } from '../sim/clock.js';
import { depthAtPoint, floodBand } from '../sim/flood.js';
import { roadSegAt } from '../sim/roads.js';
import { STORY, stepOf, chapterOf, storyPick, finishChapter } from '../sim/story.js';

const STORE = 'shipper-cheat'; // công tắc đang bật (localStorage, chỉ máy này)
const DEFAULT = { lockStats: false, noPolice: false, noCrash: false, noStall: false, noLose: false, fast: false, timeScale: 1, rider: '', flood: null };
let T = { ...DEFAULT };
try { T = { ...DEFAULT, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { /* không đọc được thì dùng mặc định */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(T)); } catch { /* bỏ qua */ } };

const CSS = `
#cheat{position:fixed;top:8px;right:8px;width:360px;max-height:calc(100vh - 16px);overflow:auto;z-index:9999;background:rgba(14,18,26,.97);color:#e8ecf2;
  border:1px solid #3a4558;border-radius:12px;font:13px 'Segoe UI',system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.6);pointer-events:auto}
#cheat.hidden{display:none}
#cheat h3{margin:0;padding:10px 12px;font-size:15px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#1a202b;border-bottom:1px solid #2d3644;z-index:1}
#cheat details{border-bottom:1px solid #232b38}
#cheat summary{padding:8px 12px;cursor:pointer;font-weight:700;user-select:none}
#cheat summary:hover{background:#1f2733}
#cheat .bd{padding:4px 12px 10px;display:flex;flex-direction:column;gap:6px}
#cheat .row{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
#cheat button{background:#2c3544;color:#fff;border:1px solid #3a4558;border-radius:7px;padding:4px 8px;font:600 12px inherit;cursor:pointer}
#cheat button:hover{border-color:#00b14f}
#cheat button.on{background:#00b14f;border-color:transparent}
#cheat input,#cheat select{background:#11151c;color:#e8ecf2;border:1px solid #3a4558;border-radius:6px;padding:3px 6px;font:12px inherit;min-width:0}
#cheat input[type=number]{width:80px}
#cheat select{max-width:100%;flex:1}
#cheat label.sw{display:flex;gap:6px;align-items:center;cursor:pointer}
#cheat .muted{color:#8b97a8;font-size:11px}
#cheat pre{margin:0;white-space:pre-wrap;font:11px/1.45 Consolas,monospace;color:#cfe8d6}
#cheat .msg{padding:6px 12px;color:#f5b041;font-size:12px;min-height:16px}
#cheatHint{position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:9998;background:rgba(192,57,43,.9);color:#fff;font:700 11px 'Segoe UI',sans-serif;padding:3px 10px;border-radius:9px;pointer-events:none}
`;

// ---------- tạo phần tử nhỏ gọn ----------
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
  return e;
}
const btn = (label, fn, cls) => h('button', { class: cls, onclick: fn }, label);
const sel = (opts, value = '') => {
  const s = h('select', {}, opts.map(([v, l]) => h('option', { value: v }, l)));
  s.value = value;
  return s;
};
const num = (value, attrs = {}) => h('input', { type: 'number', value, ...attrs });
const row = (...kids) => h('div', { class: 'row' }, ...kids);
const group = (title, open, ...kids) => h('details', { open }, h('summary', {}, title), h('div', { class: 'bd' }, ...kids));

export function mountCheat(g) {
  document.head.append(h('style', {}, CSS));
  document.body.append(h('div', { id: 'cheatHint' }, '🧪 CHEAT · bấm ` để mở'));
  const msgEl = h('div', { class: 'msg' });
  const say = (m, bad = false) => {
    msgEl.textContent = m;
    msgEl.style.color = bad ? '#ec7063' : '#58d68d';
    if (g.state === 'play') g.hud.toast(`🧪 ${m}`, bad ? 'bad' : 'info', 2500);
  };
  // cần đang trong ván chơi
  const need = () => {
    if (g.state === 'play' && g.gs) return g.gs;
    say('Vào game (Chơi mới / Tiếp tục) trước đã.', true);
    return null;
  };
  const refresh = () => { g.renderPhone?.(); g.lookKey = null; };
  const now = () => g.clockMin;

  // ======================== 💰 TIỀN & CHỈ SỐ ========================
  const money = num(1000, { step: 50 });
  const phys = num(100, { min: 0, max: 100 }), mental = num(100, { min: 0, max: 100 });
  const stars = num(5, { min: 1, max: 5, step: 0.1 });
  const gStats = group('💰 Tiền & chỉ số', true,
    row(money, btn('Đặt tiền (k)', () => { const gs = need(); if (gs) { gs.money = +money.value || 0; say(`Tiền = ${gs.money}k`); } }),
      btn('+100k', () => { const gs = need(); if (gs) { gs.money += 100; say(`+100k → ${gs.money}k`); } }),
      btn('+1000k', () => { const gs = need(); if (gs) { gs.money += 1000; say(`+1000k → ${gs.money}k`); } })),
    row('Thể lực', phys, 'Tinh thần', mental, btn('Đặt', () => { const gs = need(); if (gs) { gs.phys = +phys.value; gs.mental = +mental.value; say(`Thể lực ${gs.phys} · tinh thần ${gs.mental}`); } })),
    row(btn('Đầy thể lực + tinh thần', () => { const gs = need(); if (gs) { gs.phys = 100; gs.mental = 100; gs.awakeSince = now(); say('Đầy thể lực, tinh thần, hết buồn ngủ'); } })),
    row('Sao', stars, btn('Đặt điểm sao', () => {
      const gs = need();
      if (!gs) return;
      const v = Math.max(1, Math.min(5, +stars.value || 5));
      gs.ratingBook.sum = v * gs.ratingBook.count; // giữ số lượt đánh giá, đổi điểm trung bình
      say(`Điểm sao = ${gs.rating.toFixed(2)}`);
    })),
    row(btn('⛽ Đầy xăng / pin', () => { const gs = need(); if (gs) { gs.fuel = gs.vehicleSpec.tank || 0; say('Đầy xăng / pin'); } }),
      btn('🔧 Sửa xe 100%', () => { const gs = need(); if (gs) { gs.bikeHp = 100; g.stalled = false; say('Xe 100%'); } }),
      btn('🛢️ Nhớt / pin mới', () => { const gs = need(); if (gs) { gs.maintKm = 0; say('Vừa thay nhớt / đổi pin'); } })),
  );

  // ======================== ⏰ THỜI GIAN ========================
  const hour = sel(Array.from({ length: 24 }, (_, i) => [String(i), `${String(i).padStart(2, '0')}:00`]), '12');
  const scale = sel([['0', '⏸ Đứng đồng hồ'], ['1', '×1 (bình thường)'], ['2', '×2'], ['5', '×5'], ['10', '×10'], ['30', '×30']], String(T.timeScale));
  scale.onchange = () => { T.timeScale = +scale.value; save(); say(T.timeScale ? `Thời gian ×${T.timeScale}` : 'Đồng hồ đứng yên'); };
  const skip = (min) => { if (need()) { g.advance(min, 'idle', { quiet: true }); say(`Tua ${Math.round(min)} phút → ${fmtClock(now())}`); } };
  const gTime = group('⏰ Thời gian', false,
    row(btn('+10 phút', () => skip(10)), btn('+30 phút', () => skip(30)), btn('+1 giờ', () => skip(60)), btn('+3 giờ', () => skip(180))),
    row('Tới giờ', hour, btn('Tua tới', () => { if (need()) skip(minutesUntil(now(), +hour.value)); })),
    row(btn('🌅 Sang ngày mới (06:00)', () => { if (need()) skip(minutesUntil(now(), 6)); })),
    row('Tốc độ thời gian', scale),
    h('div', { class: 'muted' }, 'Tua giờ vẫn tính hao thể lực / tiền nhà như chờ thật (bật "Khóa chỉ số" nếu không muốn mệt).'),
  );

  // ======================== 🌦️ THỜI TIẾT & NGẬP ========================
  const rel = () => now() - g.hz.base; // phút trong ngày theo lịch HazardManager
  const setRain = (heavy, len) => {
    if (!need()) return;
    const m = rel();
    g.hz.rain = g.hz.rain.filter((r) => r.end <= m || r.start > m + len);
    g.hz.rain.push({ start: m, end: m + len, heavy });
    g.hz._floodAt = null;
    say(heavy ? `Mưa to ${len} phút (ngập sau ~20 phút)` : `Mưa phùn ${len} phút`);
  };
  const floodSel = sel([['', '— theo thời tiết thật —'], ...[0, 0.1, 0.2, 0.35, 0.5, 0.7, 0.9, 1].map((v) => [String(v), `${Math.round(v * 100)}%`])], T.flood == null ? '' : String(T.flood));
  floodSel.onchange = () => { T.flood = floodSel.value === '' ? null : +floodSel.value; save(); if (g.hz) g.hz._floodAt = null; say(T.flood == null ? 'Mực nước theo thời tiết thật' : `Ép mực nước ${Math.round(T.flood * 100)}%`); };
  const gWeather = group('🌦️ Thời tiết & ngập', false,
    row(btn('🌦️ Mưa phùn 30\'', () => setRain(false, 30)), btn('⛈️ Mưa to 60\'', () => setRain(true, 60)),
      btn('⛅ Tạnh', () => { if (!need()) return; const m = rel(); for (const r of g.hz.rain) if (r.start <= m && r.end > m) r.end = m; g.hz._floodAt = null; say('Tạnh mưa'); })),
    row(btn('🌊 Triều cường lên ngay', () => {
      if (!need()) return;
      const m = rel();
      g.hz.tide = { start: m - 80, top: m + 10, topEnd: m + 70, end: m + 160, peak: m + 40 }; // đang lên, 10 phút nữa đỉnh, giữ 1 giờ
      g.hz._floodAt = null;
      say('Triều cường đang lên (đỉnh sau 10 phút, giữ 1 giờ)');
    }), btn('Tắt triều', () => { if (need()) { g.hz.tide = null; g.hz._floodAt = null; say('Hôm nay không có triều'); } })),
    row('Ép mực nước', floodSel),
    h('div', { class: 'muted' }, 'Ép mực nước = như mưa to ở mức đó: đoạn "Rất trũng" đúng mức này, đoạn "Trũng" thấp hơn. 15% xăm xắp · 50% ngập sâu.'),
  );

  // ======================== 📦 ĐƠN HÀNG ========================
  const typeSel = sel(Object.values(ORDER_TYPES).map((t) => [t.id, `${t.name} (${t.kind})`]), 'food');
  const restSel = sel([['', '— quán ngẫu nhiên —'], ...g.layout.places.filter((p) => p.kind === 'restaurant' && (p.menu || []).length).map((p) => [p.id, p.name])]);
  const riderOpts = [['', '— ngẫu nhiên —'], ...Object.entries(RIDER_TYPES).map(([id, r]) => [id, `${r.icon || ''} ${r.name}`])];
  // 1 ô loại khách dùng chung: đơn "Gọi đơn ngay" (chở khách) + mọi đơn chở khách tự đến; nhớ qua F5
  const riderSel = sel(riderOpts, T.rider);
  // chọn loại khách → loại đơn tự thành "chở khách"; chọn quán → "đồ ăn" (tránh chọn khách mà vẫn ra đơn giao hàng)
  const typeOfKind = (kind) => Object.values(ORDER_TYPES).find((t) => t.kind === kind)?.id;
  riderSel.onchange = () => {
    T.rider = riderSel.value;
    save();
    if (riderSel.value && typeOfKind('ride')) typeSel.value = typeOfKind('ride');
    say(T.rider ? `Khách chở từ giờ luôn là: ${RIDER_TYPES[T.rider].name}` : 'Khách chở ngẫu nhiên như thường');
  };
  restSel.onchange = () => { if (restSel.value && typeOfKind('food')) typeSel.value = typeOfKind('food'); };
  const spawn = (story = false) => {
    const gs = need();
    if (!gs) return;
    const om = g.om, t = ORDER_TYPES[typeSel.value], pos = g.playerPos;
    if (om.state === S.OFFERED) { om.offer = null; om.go(S.IDLE); } // thay đơn đang mời
    if (om.state === S.OFFLINE) om.goOnline();
    if (om.state !== S.IDLE) return say('Đang chạy đơn — giao xong hoặc hủy (nút bên dưới) trước.', true);
    let o = null;
    if (story) {
      gs.flags.wallet = 0;
      o = om.makeRide(pos, true, now(), ORDER_TYPES.ride || t);
    } else if (t.kind === 'ride') {
      const orig = om.pickRider;
      if (riderSel.value) om.pickRider = () => RIDER_TYPES[riderSel.value];
      try { o = om.makeRide(pos, false, now(), t); } finally { om.pickRider = orig; }
    } else if (t.kind === 'parcel') o = om.makeParcel(t, now(), pos);
    else if (restSel.value) {
      const r = g.layout.placeById[restSel.value];
      const menu = (r.menu || []).filter((id) => ITEMS[id]);
      if (!menu.length) return say('Quán này không có món.', true);
      const pickup = { placeId: r.id, name: r.name, address: r.address, door: r.door };
      o = om.buildOrder({ type: t, pickup, dropoff: om.pickDropoff(r.door, true, now(), 'foodWeight', r.id), itemIds: [menu[Math.floor(Math.random() * menu.length)]], pos, now: now() });
    } else o = om.makeFood(t, now(), pos);
    if (!o) return say('Không tạo được đơn (quán đóng cửa / chưa có món mở bán / túi không chở được…).', true);
    om.offer = o;
    om.go(S.OFFERED);
    om.offerTimeLeft = ORDER.offerTimeoutSec * 6; // để lâu cho kịp bấm
    om.emit('offer', { offer: o });
    say(`Có đơn: ${t.name}${o.rider ? ` · ${RIDER_TYPES[o.rider]?.name}` : ''} — bấm Y để nhận`);
  };
  const order = () => {
    if (!need()) return null;
    if (!g.om.order) say('Chưa có đơn đang chạy (nhận đơn trước).', true);
    return g.om.order;
  };
  const teleport = (p, label) => {
    if (!need() || !p) return;
    const q = p; // cửa nhà (nhà trong hẻm: cửa trong hẻm)
    if (g.mode === 'bike') {
      g.bike.pos.set(q.x, 0, q.z);
      g.bike.speed = 0;
      g.bike.vel?.multiplyScalar?.(0);
      g.bike.mesh.position.set(q.x, 0, q.z);
    } else {
      g.walker.pos.set(q.x, 0, q.z);
      g.walker.mesh.position.set(q.x, 0, q.z);
    }
    say(`Đã tới ${label}`);
  };
  const quickPickup = () => {
    const o = order();
    if (!o) return;
    const om = g.om, t = now();
    if (o.kind === 'ride') return say('Chở khách: dùng "Tới nơi lấy" rồi bấm E để khách lên xe.', true);
    if (om.state === S.TO_PICKUP && o.kind === 'food') { o.flags.outOfStock = false; om.arriveAtPickup(t); }
    if (om.state === S.OUT_OF_STOCK) { o.flags.outOfStock = false; om.go(S.WAITING_FOOD); }
    if (om.state === S.WAITING_FOOD) { o.readyAt = t; om.collectFood(t); }
    if (om.state === S.TO_PICKUP && o.kind === 'parcel') {
      const r = om.collectParcel(t);
      if (r?.noMoney) return say(`Không đủ tiền ứng COD (${r.cod}k).`, true);
    }
    if (om.state !== S.PACKING) return say('Đơn này đã lấy hàng rồi.', true);
    om.finishPacking(o.items.map(() => ({ upright: true })), t); // xếp túi đúng chiều
    g.bike.showBag(true);
    refresh();
    teleport(o.dropoff.door, 'nơi giao — bấm E để giao');
  };
  const forceEvent = (type) => {
    const o = order();
    if (!o) return;
    if (type === 'outOfStock') {
      if (o.kind !== 'food' || g.om.state !== S.TO_PICKUP) return say('Chỉ đơn đồ ăn, lúc chưa tới quán.', true);
      o.flags.outOfStock = true;
      return say('Quán sẽ hết món khi bạn tới');
    }
    if (type === 'noAnswer') { o.flags.noAnswer = true; return say('Khách sẽ không nghe máy khi tới nơi'); }
    if (type === 'bom') {
      if (o.kind !== 'parcel') return say('Chỉ đơn giao hàng.', true);
      o.cod = o.cod || ITEMS[o.itemIds[0]]?.cod || 100;
      o.flags.bom = true;
      return say('Khách sẽ bom hàng (không nhận)');
    }
    if (o.kind !== 'ride' || g.om.state !== S.DELIVERING) return say('Chỉ khi đang chở khách trên đường.', true);
    if (type === 'scam') {
      const r = RIDER_TYPES.luaDao || {};
      o.flags.scam = true;
      o.midEvent = { type: 'scam', at: 0, robMax: r.robMax ?? 300, robPctMin: r.robPctMin ?? 0.5 };
    } else o.midEvent = { type: 'changeDest', at: 0, pays: true };
    g.om.checkMidEvent(now(), g.playerPos, true);
    say(type === 'scam' ? 'Khách lộ mặt lừa đảo' : 'Khách đòi đổi điểm đến');
  };
  const gOrder = group('📦 Đơn hàng & khách', true,
    row('Loại đơn', typeSel),
    row('Quán (đồ ăn)', restSel),
    row('Loại khách', riderSel),
    h('div', { class: 'muted' }, 'Áp dụng cho cả đơn "Gọi đơn ngay" lẫn mọi đơn chở khách tự đến, tới khi chọn lại "ngẫu nhiên". Muốn có đơn xe ôm tự đến thì cần nón chở khách.'),
    row(btn('📲 Gọi đơn ngay', () => spawn()), btn('👛 Chuyến anh Minh', () => spawn(true))),
    row(btn('📍 Tới nơi lấy', () => { const o = order(); if (o) teleport(o.pickup.door, o.pickup.name); }),
      btn('🏁 Tới nơi giao', () => { const o = order(); if (o) teleport(o.dropoff.door, o.dropoff.address); }),
      btn('⏩ Lấy hàng ngay', quickPickup)),
    row(btn('❌ Hủy đơn (không phạt)', () => { const o = order(); if (o) { g.om.cancel('🧪 cheat', now(), { byDriver: false }); say('Đã hủy đơn, không trừ sao'); } })),
    row('Ép sự cố:', btn('Hết món', () => forceEvent('outOfStock')), btn('Không nghe máy', () => forceEvent('noAnswer')), btn('Bom hàng', () => forceEvent('bom'))),
    row(btn('Khách đổi điểm đến', () => forceEvent('changeDest')), btn('Khách lừa đảo', () => forceEvent('scam'))),
  );

  // ======================== 🛵 XE & ĐỒ ========================
  const vehSel = sel(Object.values(VEHICLES).map((v) => [v.id, `${v.name} (${v.power})`]));
  const bagSel = sel(Object.values(BAGS).map((b) => [b.id, `${b.name} ${b.cols}×${b.rows}`]));
  const goodsSel = sel(Object.values(GOODS).map((x) => [x.id, `${x.icon || ''} ${x.name} · ${x.type}${x.brand ? ` · ${x.brand}` : ''}`]));
  // cho miễn phí: cộng đúng giá rồi mua theo luật thường (đồ chồng số lượng, trang phục…)
  const free = (cat, id, price) => {
    const gs = need();
    if (!gs) return null;
    gs.money += price || 0;
    const r = gs.buy(cat, id);
    if (!r.ok) gs.money -= price || 0;
    return r;
  };
  const gGear = group('🛵 Xe, túi & đồ', false,
    row(vehSel, btn('Lấy xe này', () => {
      const gs = need();
      if (!gs) return;
      const id = vehSel.value;
      if (!gs.owned.vehicles.includes(id)) { gs.owned.vehicles.push(id); gs.newVehicleState(id); }
      gs.vehicle = id;
      gs.fuel = VEHICLES[id].tank || 0;
      g.stalled = false;
      g.bike.setSpec(gs.vehicleSpec);
      g.bike.setBag(gs.bagSpec);
      refresh();
      say(`Đang dùng ${VEHICLES[id].name}`);
    })),
    row(bagSel, btn('Lấy túi này', () => {
      const gs = need();
      if (!gs) return;
      if (!gs.owned.bags.includes(bagSel.value)) gs.owned.bags.push(bagSel.value);
      gs.bag = bagSel.value;
      g.bike.setBag(gs.bagSpec);
      refresh();
      say(`Đang dùng ${gs.bagSpec.name}`);
    })),
    row(goodsSel),
    row(btn('🎁 Cho món này', () => { const r = free('goods', goodsSel.value, GOODS[goodsSel.value]?.price); if (r) { refresh(); say(r.msg.replace(/<[^>]+>/g, ''), !r.ok); } }),
      btn('👕 Cho + mặc', () => {
        const id = goodsSel.value;
        if (GOODS[id]?.type !== 'outfit') return say('Món này không phải trang phục.', true);
        const gs = need();
        if (!gs) return;
        if (!gs.ownsOutfit(id)) free('goods', id, GOODS[id].price);
        gs.wear(id);
        refresh();
        say(`Đang mặc ${GOODS[id].name}`);
      })),
    row(...Object.values(BRANDS).map((b) => btn(`🏢 Vào ${b.name}`, () => {
      const gs = need();
      if (!gs) return;
      gs.money += b.deposit || 0;
      const r = gs.joinBrand(b.id, null, now());
      if (!r.ok) { gs.money -= b.deposit || 0; return say(r.msg.replace(/<[^>]+>/g, ''), true); }
      g.bike.setSpec(gs.vehicleSpec);
      g.bike.setBag(gs.bagSpec);
      refresh();
      say(`Đã vào hãng ${b.name}`);
    }))),
    row(btn('⛑️ Cho nón chở khách', () => {
      const gs = need();
      if (!gs) return;
      const seat = Object.values(GOODS).find((x) => x.effects?.passengerSeat && (!x.brand || x.brand === gs.brand)) || Object.values(GOODS).find((x) => x.effects?.passengerSeat);
      if (!seat) return say('Dữ liệu không có nón chở khách.', true);
      const r = free('goods', seat.id, seat.price);
      refresh();
      say(r?.ok ? `Có ${seat.name}` : r?.msg?.replace(/<[^>]+>/g, '') || '', !r?.ok);
    })),
  );

  // ======================== 🗺️ DI CHUYỂN ========================
  const placeSel = sel(g.layout.places.slice().sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((p) => [p.id, `${p.icon || ''} ${p.name}`]));
  const gMove = group('🗺️ Dịch chuyển', false,
    row(placeSel, btn('Tới đó', () => { const p = g.layout.placeById[placeSel.value]; if (p) teleport(p.door, p.name); })),
    row(btn('🏠 Nhà trọ', () => { const p = g.layout.placeById.home; if (p) teleport(p.door, p.name); }),
      btn('🛵 Tới chỗ xe', () => { if (!need()) return; if (g.mode === 'bike') return say('Đang ngồi trên xe rồi.', true); teleport({ x: g.bike.pos.x + 1.2, z: g.bike.pos.z }, 'chỗ xe'); })),
    h('div', { class: 'muted' }, 'Đang ngồi xe thì cả người + xe cùng dịch chuyển; đi bộ thì chỉ người.'),
  );

  // ======================== 🛡️ BẤT TỬ & CÔNG TẮC ========================
  const sw = (key, label, hint) => {
    const c = h('input', { type: 'checkbox' });
    c.checked = !!T[key];
    c.onchange = () => { T[key] = c.checked; save(); say(`${label}: ${c.checked ? 'BẬT' : 'tắt'}`); };
    return h('label', { class: 'sw', title: hint || '' }, c, label);
  };
  const gGod = group('🛡️ Bất tử & công tắc', false,
    sw('lockStats', 'Khóa chỉ số (luôn đầy thể lực, tinh thần, xăng/pin; không buồn ngủ)'),
    sw('noPolice', 'Không bị CSGT dừng'),
    sw('noCrash', 'Không té xe (đâm xe / tường không sao)'),
    sw('noStall', 'Không chết máy khi lội nước'),
    sw('noLose', 'Không bao giờ thua (đuổi nhà, khóa tài khoản)'),
    sw('fast', 'Xe nhanh ×2'),
  );

  // ======================== 📖 CỐT TRUYỆN ========================
  const storySel = sel([['0', '0 · vừa xuống bến xe buýt'], ['1', '1 · Cô Hai đã cho xe đạp'], ['2', '2 · đã leo lên xe (xong mở đầu)']]);
  const walletSel = sel([['0', '0 · chưa có ví'], ['1', '1 · nhặt được ví'], ['2', '2 · biết tạp hóa'], ['3', '3 · biết cổng xanh'], ['4', '4 · biết Minh ở quán cà phê'], ['5', '5 · đã trả ví'], ['-1', '-1 · giữ tiền']]);
  // --- cốt truyện theo chương (story.json): xong mục tiêu đang làm / nhảy tới bước bất kỳ ---
  const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  // dọn cảnh đang dở: bảng chọn câu, bong bóng, hội thoại, màn xếp túi, đơn cốt truyện đang mời / đang chạy
  const storyClean = () => {
    g.storyChoiceClose?.();
    g.storyAsk = null;
    g.pendingReply = null;
    g.storyQueue = [];
    g.storyTalkWith = null;
    if (g.talk) g.talkEnd();
    for (const k of [...g.bubbles.map.keys()]) if (k.startsWith('story:')) g.bubbles.remove(k);
    if (g.storyPacking) { g.modal.hide(); g.storyPacking = null; }
    if (g.om.state === S.OFFERED && g.om.offer?.forced) { g.om.offer = null; g.om.go(S.IDLE); }
  };
  const storyDone = () => {
    const gs = need();
    if (!gs) return;
    const s = gs.story, st = stepOf(s);
    if (!st) return say('Không có bước cốt truyện nào đang chạy.', true);
    const ch = s.ch;
    // bước chưa chạy việc đầu bước (tin nhắn, người lạ, cho đồ…) → chạy luôn
    if (!s.fired) {
      s.fired = true;
      s.waited = 0;
      if (st.until?.type === 'ordersSince') s.base = gs.account.completed || 0;
      if (st.until?.type === 'newDay') s.baseDay = gs.day;
      g.runStoryActions(st.on || []);
      if (s.ch !== ch) { storyClean(); refresh(); return say(`Xong bước ${st.id} → hết chương`); } // bước có "kết thúc chương"
    }
    // phần việc của điều kiện xong bước
    const u = st.until || {};
    if (st.talk) {
      const t = st.talk;
      if (t.drop) s.carry = list(s.carry).filter((id) => !list(t.drop).includes(id));
      if (t.give && GOODS[t.give]) gs.consumables[t.give] = (gs.consumables[t.give] || 0) + Math.max(1, t.giveQty || 1);
      if (t.pack) s.carry = [...list(t.pack)];
    }
    if (u.type === 'chosen' && s.picks?.[u.id] == null) {
      const a = chapterOf(s).steps.flatMap((x) => x.on || []).find((x) => x.do === 'choose' && x.id === u.id);
      storyPick(s, u.id, 0, a?.gains?.[0]); // chọn câu đầu
    }
    if (u.type === 'read' || u.type === 'open') gs.readThread(u.who);
    if (u.type === 'reply' && gs.inbox.threads[u.who]?.replies?.length) gs.reply(u.who, 0, g.clockMin);
    storyClean();
    s.step += 1;
    s.fired = false;
    s.waited = 0;
    s.ev = {};
    if (s.step >= chapterOf(s).steps.length) finishChapter(s);
    g.storyActorsRestore?.();
    refresh();
    say(`✅ Xong "${st.id}" → ${stepOf(s)?.id || 'hết cốt truyện'}`);
  };
  const stepSel = sel(STORY.chapters.flatMap((c) => c.steps.map((x, i) => [`${c.id}:${i}`, `${c.id} · ${i + 1}. ${x.id}`])));
  const storyJump = () => {
    const gs = need();
    if (!gs) return;
    const [chId, i] = stepSel.value.split(':');
    const s = gs.story;
    storyClean();
    const idx = STORY.chapters.findIndex((c) => c.id === chId);
    Object.assign(s, { ch: chId, step: +i, fired: false, waited: 0, ev: {}, done: STORY.chapters.slice(0, idx).map((c) => c.id) });
    if (idx > 0 || +i > 0) gs.flags.story = Math.max(gs.flags.story ?? 0, 2); // qua mở đầu → có xe đạp
    g.storyActorsRestore?.();
    refresh();
    say(`⏩ Tới ${chId} · ${stepOf(s)?.id}`);
  };
  const gStory = group('📖 Cốt truyện & hướng dẫn', false,
    row(btn('✅ Xong mục tiêu này', storyDone), btn('×5', () => { for (let k = 0; k < 5; k++) storyDone(); })),
    row('Nhảy tới bước', stepSel, btn('⏩ Tới', storyJump)),
    row(btn('⏭ Bỏ hướng dẫn', () => { const gs = need(); if (gs) { gs.flags.tutSkip = true; Object.assign(gs.flags, { mounted: true, refueled: true, online: true }); say('Đã bỏ hướng dẫn người mới'); } })),
    row('Mở đầu', storySel, btn('Đặt', () => { const gs = need(); if (gs) { gs.flags.story = +storySel.value; refresh(); say(`Cốt truyện = ${storySel.value}`); } })),
    row('Nhiệm vụ ví', walletSel, btn('Đặt', () => {
      const gs = need();
      if (!gs) return;
      gs.flags.wallet = +walletSel.value;
      const has = gs.inventory.includes('wallet');
      if (gs.flags.wallet >= 1 && gs.flags.wallet <= 4 && !has) gs.inventory.push('wallet');
      if ((gs.flags.wallet <= 0 || gs.flags.wallet >= 5) && has) gs.inventory = gs.inventory.filter((i) => i !== 'wallet');
      refresh();
      say(`Nhiệm vụ ví = ${walletSel.value}`);
    })),
  );

  // ======================== 🔍 SOI ========================
  const info = h('pre');
  const gInfo = group('🔍 Soi thông số', true, info);

  const panel = h('div', { id: 'cheat', class: 'hidden' },
    h('h3', {}, '🧪 Cheat (chỉ localhost)', btn('✕', () => toggle(false))),
    msgEl, gInfo, gStats, gOrder, gWeather, gTime, gGear, gMove, gGod, gStory);
  document.body.append(panel);
  // phím trong bảng không lọt xuống game (WASD trong ô chọn…)
  for (const ev of ['keydown', 'keyup']) panel.addEventListener(ev, (e) => { if (e.code !== 'Backquote') e.stopPropagation(); });

  function toggle(open = panel.classList.contains('hidden')) {
    panel.classList.toggle('hidden', !open);
    g.cheatOpen = open; // mở bảng: thả con trỏ chuột (không tạm dừng game)
  }
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    toggle();
  });

  // ---------- mỗi 0,2 giây: giữ các công tắc + cập nhật bảng soi ----------
  const wrapped = new WeakSet();
  setInterval(() => {
    g.cheat.noPolice = T.noPolice;
    g.cheat.noCrash = T.noCrash;
    g.timeScale = T.timeScale;
    const gs = g.gs;
    if (g.state !== 'play' || !gs) return;
    if (T.lockStats) {
      gs.phys = 100;
      gs.mental = 100;
      gs.awakeSince = now();
      if (gs.power !== 'pedal') gs.fuel = gs.vehicleSpec.tank || gs.fuel;
    }
    if (T.noStall) g.stalled = false;
    // không thua: bọc checkEnd của ván đang chơi (ván / ngày mới có thể tạo GameState mới)
    if (!wrapped.has(gs)) {
      wrapped.add(gs);
      const orig = gs.checkEnd.bind(gs);
      gs.checkEnd = (t) => {
        const r = orig(t);
        if (T.noLose && r && r.type === 'lose') { gs.outcome = null; return null; }
        return r;
      };
    }
    // loại khách xe ôm cố định cho đơn tự đến
    if (g.om && !wrapped.has(g.om)) {
      wrapped.add(g.om);
      const orig = g.om.pickRider.bind(g.om);
      g.om.pickRider = (t) => (T.rider && RIDER_TYPES[T.rider] ? RIDER_TYPES[T.rider] : orig(t));
    }
    // ép mực nước (như mưa to ở mức đó)
    if (g.hz && !wrapped.has(g.hz)) {
      wrapped.add(g.hz);
      const orig = g.hz.waterAt.bind(g.hz);
      g.hz.waterAt = (m) => (T.flood != null ? { rain: T.flood, tide: 0 } : orig(m));
    }
    if (g.hz && T.flood != null) g.hz._floodAt = null;
    // xe nhanh ×2 (trên thông số xe đang dùng; đổi xe thì áp lại)
    const spec = g.bike.spec;
    if (T.fast && spec && !spec.cheatFast) g.bike.spec = { ...spec, maxSpeed: spec.maxSpeed * 2, accel: spec.accel * 1.8, cheatFast: true };
    if (!T.fast && spec?.cheatFast) g.bike.spec = gs.vehicleSpec;
    if (!panel.classList.contains('hidden') && gInfo.open) info.textContent = inspect(g);
  }, 200);
}

// Bảng soi: giờ, đơn, mực nước, vị trí, lịch mưa / triều hôm nay
function inspect(g) {
  const gs = g.gs, om = g.om, hz = g.hz, p = g.playerPos;
  const hhmm = (m) => fmtClock(hz.base + m);
  const o = om.order || om.offer;
  const seg = roadSegAt(p.x, p.z);
  const water = depthAtPoint(p.x, p.z, (id) => hz.floodDepth(id, g.clockMin));
  const w = hz.waterAt(g.clockMin);
  return [
    `Ngày ${gs.day} · ${fmtClock(g.clockMin)} · thời gian ×${g.timeScale}`,
    `Tiền ${Math.round(gs.money)}k · ⭐ ${gs.rating.toFixed(2)} · thể lực ${gs.phys.toFixed(0)} · tinh thần ${gs.mental.toFixed(0)}`,
    `Xe ${gs.vehicleSpec.name} · ${gs.power} · xăng/pin ${gs.fuel.toFixed(2)}/${gs.vehicleSpec.tank} · xe ${gs.bikeHp.toFixed(0)}%${g.stalled ? ' · CHẾT MÁY' : ''}`,
    `Hãng: ${gs.brand || '—'} · túi ${gs.bagSpec.name} · ${g.mode === 'bike' ? 'đang ngồi xe' : 'đi bộ'}`,
    `Đơn: ${om.state}${o ? ` · #${o.id} ${o.kind}${o.rider ? ` · khách ${RIDER_TYPES[o.rider]?.name || o.rider}` : ''}` : ''}`,
    `Cốt truyện: ${gs.story?.ch ? `${gs.story.ch} · bước ${gs.story.step + 1}/${chapterOf(gs.story)?.steps.length} ${stepOf(gs.story)?.id || ''}${gs.story.fired ? '' : ' (chưa chạy)'}` : '— (không theo / hết cốt truyện)'} · tính cách ${JSON.stringify(gs.story?.traits || {})}`,
    o ? `  Lấy: ${o.pickup.name}\n  Giao: ${o.dropoff.address}` : '',
    `Vị trí x ${p.x.toFixed(1)} z ${p.z.toFixed(1)} · đoạn ${seg?.id || '— (ngã tư / vỉa hè)'}`,
    `Nước tại chỗ: ${Math.round(water * 100)}% (mức ${['khô', 'xăm xắp', 'sâu'][floodBand(water)]}) · mưa ${Math.round(w.rain * 100)}% · triều ${Math.round(w.tide * 100)}%`,
    `Mưa hôm nay: ${hz.rain.map((r) => `${r.heavy ? 'to' : 'phùn'} ${hhmm(r.start)}–${hhmm(r.end)}`).join(', ') || 'không'}`,
    `Triều hôm nay: ${hz.tide ? `${hhmm(hz.tide.start)}–${hhmm(hz.tide.end)} (đỉnh ${hhmm(hz.tide.peak)})` : 'không'}`,
    `Đoạn đang ngập: ${hz.floodedSegs(g.clockMin).length}`,
  ].filter(Boolean).join('\n');
}
