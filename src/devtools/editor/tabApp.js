// Thẻ 📱 APP & ĐƠN (apps.json): phí app + luật tài khoản · các loại đơn · các loại khách xe ôm.
import { ID_RE } from '../../data/validate.js';
import { ORDER_KINDS, FROM_HOMES } from '../../data/apps.js';
import { isPlaced } from '../../data/places.js';
import { EFFECTS } from '../../data/goods.js';
import { el, field, textInput, numInput, button, sideList, selectInput, checkInput, emojiInput, explain, areaInput, subTabs } from './ui.js';
import { HINT, EXPLAIN } from './help.js';
import { hoursPicker } from './hoursUi.js';
import { moveKey } from './order.js';
import { rowMenu, addButton, entryButtons, doRemove } from './opsUi.js';

const CATS = [
  ['app', '📱 App'],
  ['orderTypes', '📦 Loại đơn'],
  ['riderTypes', '🧍 Loại khách xe ôm'],
];
const KIND_LABEL = { food: 'Đồ ăn (tới quán chờ nấu)', ride: 'Chở khách', parcel: 'Giao hàng (lấy ở shop, có thể thu hộ)' };
const pct = { scale: 100, step: 1, digits: 1 };

export function render(root, ctx) {
  const data = ctx.data.apps;
  const sel = ctx.sel.app;
  sel.cat = CATS.some(([c]) => c === sel.cat) ? sel.cat : 'app';
  const cat = sel.cat;
  const table = cat === 'app' ? data.apps : data[cat];
  if (!sel.id || !table[sel.id]) sel.id = Object.keys(table)[0];
  const changed = () => ctx.changed('apps');

  const side = el('aside', { class: 'ed-side' });
  const drawSide = () => {
    side.innerHTML = '';
    const total = Object.values(table).reduce((s, x) => s + (x.weight > 0 ? x.weight : 0), 0);
    side.append(
      el('div', { class: 'seg' }, CATS.map(([c, label]) => button(label, () => ctx.select('app', { cat: c, id: null }), cat === c ? 'on' : ''))),
      el('div', { class: 'side-head' }, el('b', {}, `${Object.keys(table).length} mục`), cat === 'app' ? null : addButton(ctx, cat, [['＋ Mục mới', add]])),
      sideList(
        Object.values(table).map((x) => ({
          id: x.id,
          icon: cat === 'app' ? '📱' : x.icon || '•',
          title: x.name,
          sub: cat === 'app' ? `phí ${Math.round(x.platformFee * 100)}%` : `${x.id} · ${total ? Math.round(((x.weight > 0 ? x.weight : 0) / total) * 100) : 0}%${cat === 'orderTypes' ? ` · ${KIND_LABEL[x.kind]?.split(' (')[0] || x.kind}` : ''}`,
        })),
        sel.id,
        (id) => ctx.select('app', { id }),
        { issuesFor: (id) => ctx.issuesFor('app', id, { cat }), onReorder: cat === 'app' ? null : (a, b) => { moveKey(table, a, b); changed(); }, menu: cat === 'app' ? null : rowMenu(ctx, cat) },
      ),
    );
  };
  drawSide();
  ctx.refreshSide = drawSide;

  const x = table[sel.id];
  const body = el('section', { class: 'ed-body' });
  root.append(el('div', { class: 'ed-split' }, side, body));
  if (!x) return;
  const ref = x.id;
  const opt = (k, extra = {}) => ({ ref, fieldKey: k, cat, ...extra });
  const num = (k, label, o = {}, obj = x) => field(label, numInput(obj[k], (v) => { obj[k] = v; changed(); }, o), opt(k, { hint: o.hint }));
  // ô số có thể bỏ trống (bỏ trống = như khách thường)
  const optNum = (k, label, o = {}) => field(label, numInput(x[k], (v) => { if (Number.isFinite(v)) x[k] = v; else delete x[k]; changed(); }, o), opt(k, { hint: o.hint }));
  // khung giờ: tick "Cả ngày" / một khung giờ mẫu (⏰, sửa ở thẻ Địa điểm → Khung giờ mẫu) / "Tự đặt"
  const hoursRow = (label, hint, key = 'hours', emptyLabel = 'Cả ngày') => field(label, hoursPicker({
    value: x[key],
    presets: ctx.data.places.hourPresets || {},
    emptyLabel,
    onChange: (v) => { if (v == null) delete x[key]; else x[key] = v; changed(); },
  }), opt(key, { hint, wide: true }));

  body.append(el('div', { class: 'body-head' }, el('h2', {}, `${cat === 'app' ? '📱' : x.icon || ''} ${x.name}`), cat === 'app' ? el('span', { class: 'pill' }, '🔒 App đang chạy') : el('span', { class: 'inline' }, entryButtons(ctx, cat, x.id), button('🗑 Xóa', () => doRemove(ctx, cat, x.id), 'danger small'))));

  if (cat === 'app') renderApp();
  else if (cat === 'orderTypes') renderOrderType();
  else renderRider();

  // ---------- app ----------
  function renderApp() {
    const H = HINT.app;
    const acc = (x.account = x.account || {});
    const T = subTabs('app', [['fees', '💰 Phí & tiền mỗi đơn'], ['time', '⏰ Giờ & nhu cầu đơn'], ['account', '🛡️ Luật tài khoản']]);
    body.append(T.el);
    T.pane('fees').append(
      el('div', { class: 'grid' },
        field('Tên app', textInput(x.name, (v) => { x.name = v; changed(); }), opt('name')),
        num('platformFee', 'Phí nền tảng (%)', { ...pct, min: 0, max: 90, hint: H.platformFee }),
        num('taxRate', 'Thuế (%)', { ...pct, min: 0, max: 50, hint: H.taxRate }),
        num('distBonusPerKm', 'Thưởng mỗi km (k)', { step: 0.5, min: 0, hint: H.distBonusPerKm }),
        num('extraItemFare', 'Cước mỗi món thêm (k)', { step: 1, min: 0, hint: H.extraItemFare }),
        num('cancelComp', 'Bù khi đơn bị hủy (k)', { step: 1, min: 0, hint: H.cancelComp }),
        num('rainSurcharge', 'Phụ phí mưa (k/đơn)', { step: 1, min: 0, hint: H.rainSurcharge }),
        num('peakSurcharge', 'Phụ phí giờ cao điểm (k/đơn)', { step: 1, min: 0, hint: H.peakSurcharge }),
        num('nightSurcharge', 'Phụ phí đêm (k/đơn)', { step: 1, min: 0, hint: H.nightSurcharge }),
        num('airportFee', '✈️ Phụ phí sân bay (k/đơn)', { step: 1, min: 0, hint: H.airportFee }),
      ),
      field('Tiền boa theo số sao (k)', el('span', { class: 'inline' }, [1, 2, 3, 4, 5].map((s) => el('label', {}, `${s}★ `, numInput(x.tipByStars?.[s], (v) => { x.tipByStars = x.tipByStars || [0, 0, 0, 0, 0, 0]; x.tipByStars[s] = v; changed(); }, { step: 1, min: 0 })))), opt('tipByStars', { wide: true, hint: H.tipByStars })),
      example(),
      explain(EXPLAIN.app),
    );
    T.pane('time').append(
      hoursRow('Giờ app nhận đơn', 'Ngoài giờ này app nghỉ, không phát đơn nào (người chơi về ngủ). Mặc định 06:00–24:00.'),
      field('Giờ cao điểm', el('div', {}, (x.peakHours || []).map((h, i) => el('div', { class: 'inline' },
        numInput(h[0], (v) => { h[0] = v; changed(); }, { step: 0.5, min: 0, max: 24 }), el('span', {}, '→'), numInput(h[1], (v) => { h[1] = v; changed(); }, { step: 0.5, min: 0, max: 24 }),
        button('✕', () => { x.peakHours.splice(i, 1); changed(); ctx.rerender(); }, 'small'))),
      button('＋ Thêm khung giờ', () => { (x.peakHours = x.peakHours || []).push([11, 13]); changed(); ctx.rerender(); }, 'small')), opt('peakHours', { wide: true, hint: H.peakHours })),
      hoursRow('Giờ tính phụ phí đêm', H.nightHours, 'nightHours', 'Không có phụ phí đêm'),
      demandField(),
    );
    T.pane('account').append(
      el('div', { class: 'grid' },
        field('Khóa tài khoản khi điểm dưới', numInput(acc.lockBelow, (v) => { acc.lockBelow = v; changed(); }, { step: 0.1, min: 1, max: 5 }), opt('account.lockBelow', { hint: H.lockBelow })),
        field('Mỗi lần tự hủy tính như (sao)', numInput(acc.cancelStars, (v) => { acc.cancelStars = v; changed(); }, { step: 1, min: 1, max: 5 }), opt('account.cancelStars', { hint: H.cancelStars })),
        field('Tự hủy tối đa mỗi ngày', numInput(acc.cancelLimitPerDay, (v) => { acc.cancelLimitPerDay = v; changed(); }, { step: 1, min: 0, max: 20 }), opt('account.cancelLimitPerDay', { hint: H.cancelLimitPerDay })),
        field('Bị khóa nhận đơn (phút)', numInput(acc.cancelLockMin, (v) => { acc.cancelLockMin = v; changed(); }, { step: 5, min: 0 }), opt('account.cancelLockMin', { hint: H.cancelLockMin })),
        field('Tỉ lệ nhận đơn tính trên (lần mời)', numInput(acc.acceptWindow, (v) => { acc.acceptWindow = v; changed(); }, { step: 1, min: 3, max: 50 }), opt('account.acceptWindow', { hint: H.acceptWindow })),
        field('Tỉ lệ nhận đơn thấp khi dưới (%)', numInput(acc.lowAcceptBelow, (v) => { acc.lowAcceptBelow = v; changed(); }, { ...pct, min: 0, max: 100 }), opt('account.lowAcceptBelow', { hint: H.lowAcceptBelow })),
        field('Khi đó đơn thưa hơn (lần)', numInput(acc.lowAcceptPingMult, (v) => { acc.lowAcceptPingMult = v; changed(); }, { step: 0.1, min: 1, max: 5 }), opt('account.lowAcceptPingMult', { hint: H.lowAcceptPingMult })),
      ),
    );
    T.done();
  }

  // Nhu cầu đơn theo giờ: 24 ô số + thanh cao thấp (1 = bình thường)
  function demandField() {
    const DEF = [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.8, 0.6, 0.5];
    const arr = Array.isArray(x.demandByHour) && x.demandByHour.length === 24 ? x.demandByHour : [...DEF];
    const bars = [];
    const cells = arr.map((v, h) => {
      const bar = el('i', { class: 'dm-bar', style: `height:${Math.min(100, (v / 2) * 100)}%` });
      bars.push(bar);
      return el('label', { class: 'dm-cell' },
        el('span', { class: 'dm-col' }, bar),
        numInput(v, (n) => { x.demandByHour = x.demandByHour || arr; x.demandByHour[h] = n; bar.style.height = `${Math.min(100, ((n || 0) / 2) * 100)}%`; changed(); }, { step: 0.1, min: 0, max: 5 }),
        el('small', {}, `${h}h`));
    });
    return field('Nhu cầu đơn theo giờ (1 = bình thường)', el('div', {},
      el('div', { class: 'dm-grid' }, cells),
      button('↺ Đặt lại mặc định', () => { x.demandByHour = [...DEF]; changed(); ctx.rerender(); }, 'small')), opt('demandByHour', { wide: true, hint: HINT.app.demandByHour }));
  }

  // Ví dụ tính tiền một đơn mẫu (cập nhật khi đổi số)
  function example() {
    const box = el('div', { class: 'ref' });
    const draw = () => {
      const f = Number(x.platformFee) || 0, t = Number(x.taxRate) || 0;
      const gross = 30 + 2.5 * (Number(x.distBonusPerKm) || 0);
      const net = gross * (1 - f - t);
      box.innerHTML = `Ví dụ đơn cước 30k, 2,5 km, giao 5★: tổng cước <b>${gross.toFixed(1)}k</b> → phí ${(gross * f).toFixed(1)}k, thuế ${(gross * t).toFixed(1)}k → tài xế nhận <b>${(net + (x.tipByStars?.[5] || 0)).toFixed(1)}k</b> (gồm boa ${x.tipByStars?.[5] || 0}k). Mưa thêm ${x.rainSurcharge || 0}k, giờ cao điểm thêm ${x.peakSurcharge || 0}k, đêm thêm ${x.nightSurcharge || 0}k (trước phí).`;
    };
    draw();
    body.addEventListener('input', draw);
    return field('Ví dụ', box, opt('example', { wide: true }));
  }

  // ---------- loại đơn ----------
  function renderOrderType() {
    const H = HINT.orderType;
    const items = Object.values(ctx.data.items).filter((i) => i.parcel);
    const boolEffects = Object.entries(EFFECTS).filter(([, d]) => d.kind === 'bool');
    body.append(
      el('div', { class: 'grid' },
        field('Mã', textInput(x.id, () => {}, { class: 'mono', disabled: true }), opt('id', { hint: 'Mã đặt lúc tạo, không đổi được (thu nhập trong ví ghi theo mã này).' })),
        field('Tên', textInput(x.name, (v) => { x.name = v; changed(); }), opt('name')),
        field('Biểu tượng', emojiInput(x.icon, (v) => { x.icon = v; changed(); }), opt('icon')),
        field('Kiểu xử lý', selectInput(x.kind, ORDER_KINDS.map((k) => [k, KIND_LABEL[k] || k]), (v) => {
          x.kind = v;
          if (v === 'parcel') Object.assign(x, { items: x.items || [], codChance: x.codChance ?? 0, bomChance: x.bomChance ?? 0, persuadeChance: x.persuadeChance ?? 0, returnFeePct: x.returnFeePct ?? 0 });
          else for (const k of ['items', 'codChance', 'bomChance', 'persuadeChance', 'returnFeePct']) delete x[k];
          changed();
          ctx.rerender();
        }), opt('kind', { hint: H.kind })),
        num('weight', 'Mức thường xuyên', { step: 0.1, min: 0, max: 20, hint: H.weight }),
        hoursRow('Khung giờ có đơn', 'Ngoài khung này loại đơn này không xuất hiện. App chỉ phát đơn trong "Giờ app nhận đơn" (mục 📱 App).'),
        num('fareMult', 'Hệ số cước', { step: 0.1, min: 0.2, max: 5, hint: H.fareMult }),
        num('deadlineMult', 'Hệ số thời hạn', { step: 0.05, min: 0.2, max: 3, hint: H.deadlineMult }),
        field('Cần trang bị', selectInput(x.requires || '', [['', 'Không cần'], ...boolEffects.map(([k, d]) => [k, d.label])], (v) => { if (v) x.requires = v; else delete x.requires; changed(); }), opt('requires', { hint: H.requires })),
      ),
      explain(EXPLAIN.orderTypes),
    );
    if (x.kind !== 'parcel') return;
    body.append(
      el('h3', {}, 'Giao hàng: món chở, thu hộ, bom hàng'),
      field('Món hàng', el('div', { class: items.length ? 'chips' : 'muted' }, items.length
        ? items.map((i) => checkInput((x.items || []).includes(i.id), (on) => { x.items = on ? [...(x.items || []), i.id] : (x.items || []).filter((id) => id !== i.id); changed(); }, `${i.icon || ''} ${i.name}${i.cod ? ` (thu hộ ${i.cod}k)` : ''}`))
        : 'Chưa có món nào đánh dấu "Hàng giao". Vào thẻ 🍜 Vật phẩm → chọn món → tích "📦 Hàng giao".'), opt('items', { wide: true, hint: H.items })),
      field('Hàng riêng của tiệm', checkInput(!!x.shopItems, (v) => { if (v) x.shopItems = true; else delete x.shopItems; changed(); }, 'Lấy ở tiệm có "Hàng riêng" thì giao hàng của tiệm đó'), opt('shopItems', { hint: 'Bật: đơn loại này lấy ở tiệm vàng thì giao trang sức, ở tiệm đồ chơi thì giao đồ chơi (thẻ Địa điểm → Điểm đến của đơn → Hàng riêng của tiệm). Tắt: luôn giao các món ở trên (vd hỏa tốc chỉ giấy tờ, điện thoại).' })),
      el('div', { class: 'grid' },
        num('codChance', 'Tỉ lệ đơn thu hộ (%)', { ...pct, min: 0, max: 100, hint: H.codChance }),
        num('bomChance', 'Tỉ lệ bị bom (%)', { ...pct, min: 0, max: 100, hint: H.bomChance }),
        num('persuadeChance', 'Năn nỉ được (%)', { ...pct, min: 0, max: 100, hint: H.persuadeChance }),
        num('returnFeePct', 'Phí hoàn hàng (% cước)', { ...pct, min: 0, max: 100, hint: H.returnFeePct }),
      ),
    );
  }

  // "Đón ở": 🏠 Nhà dân + địa điểm chia theo khu phố, có ô tìm, nút chọn hết / bỏ hết từng khu
  function fromPicker() {
    const places = ctx.data.places.places;
    const map = ctx.data.map || {};
    const box = el('div', { class: 'from-pick' });
    let q = '';
    const has = (id) => (x.from || []).includes(id);
    const setMany = (ids, on) => {
      const set = new Set(x.from || []);
      for (const id of ids) on ? set.add(id) : set.delete(id);
      if (set.size) x.from = [...set]; else delete x.from;
      changed();
      draw();
    };
    const draw = () => {
      box.innerHTML = '';
      const groups = new Map();
      for (const p of places) {
        if (q && !`${p.name} ${p.short || ''} ${p.id}`.toLowerCase().includes(q)) continue;
        const key = isPlaced(p) ? map.districtBlocks?.[p.block.join(',')] || '_none' : '_unplaced';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      }
      const name = (k) => (k === '_unplaced' ? '📦 Chưa đặt trên bản đồ' : k === '_none' ? '❔ Chưa gán khu phố' : `🏙️ ${map.districts?.[k]?.name || k}`);
      const order = [...Object.keys(map.districts || {}).filter((k) => groups.has(k)), ...['_none', '_unplaced'].filter((k) => groups.has(k))];
      const n = (x.from || []).length;
      box.append(
        el('div', { class: 'inline wrap' },
          el('input', { type: 'search', placeholder: 'Tìm địa điểm…', value: q, oninput: (e) => { q = e.target.value.trim().toLowerCase(); draw(); box.querySelector('input[type=search]').focus(); } }),
          el('small', { class: 'muted' }, n ? `Đã chọn ${n} nơi${has(FROM_HOMES) ? ' (có nhà dân)' : ''}` : 'Chưa chọn = đón ở nhà dân + mọi địa điểm có khách xe ôm'),
          n ? button('Bỏ chọn hết', () => setMany(x.from || [], false), 'small') : ''),
        el('div', { class: 'from-home' }, checkInput(has(FROM_HOMES), (on) => setMany([FROM_HOMES], on), '🏠 Nhà dân (cùng các địa điểm đã chọn: chia đôi nhà dân / địa điểm)')),
        ...order.map((k) => {
          const list = groups.get(k);
          const all = list.every((p) => has(p.id));
          return el('div', { class: 'from-group' },
            el('div', { class: 'inline' }, el('b', {}, `${name(k)} (${list.filter((p) => has(p.id)).length}/${list.length})`),
              button(all ? 'Bỏ hết khu' : 'Chọn hết khu', () => setMany(list.map((p) => p.id), !all), 'small')),
            el('div', { class: 'chips' }, list.map((p) => checkInput(has(p.id), (on) => setMany([p.id], on), `${p.icon || ''} ${p.name}`))));
        }),
      );
    };
    draw();
    return field('Đón ở', box, opt('from', { wide: true, hint: HINT.rider.from }));
  }

  // ---------- loại khách xe ôm ----------
  function renderRider() {
    const H = HINT.rider;
    const places = ctx.data.places.places;
    body.append(
      el('div', { class: 'grid' },
        field('Mã', textInput(x.id, () => {}, { class: 'mono', disabled: true }), opt('id')),
        field('Tên', textInput(x.name, (v) => { x.name = v; changed(); }), opt('name')),
        field('Biểu tượng', emojiInput(x.icon, (v) => { x.icon = v; changed(); }), opt('icon')),
        num('weight', 'Mức thường xuyên', { step: 0.1, min: 0, max: 20, hint: H.weight }),
        hoursRow('Khung giờ', 'Ngoài khung giờ không có loại khách này.'),
        field('Qua app', checkInput(x.viaApp !== false, (v) => { x.viaApp = v; changed(); }, 'Đặt qua app (mất phí, có chấm sao)'), opt('viaApp', { hint: H.viaApp })),
        optNum('minRides', 'Mở sau số chuyến', { step: 1, min: 0, hint: H.minRides }),
        optNum('comfortKmh', 'Chịu tốc độ (km/h)', { step: 1, min: 10, max: 120, hint: H.comfortKmh }),
        optNum('fareMult', 'Hệ số cước', { step: 0.1, min: 0.2, max: 5, hint: H.fareMult }),
        optNum('deadlineMult', 'Hệ số thời hạn', { step: 0.05, min: 0.2, max: 3, hint: H.deadlineMult }),
        optNum('quitBelow', 'Đòi xuống khi thoải mái dưới (%)', { step: 1, min: 0, max: 90, hint: H.quitBelow }),
        optNum('earlyTip', 'Boa khi tới sớm (k)', { step: 1, min: 0, hint: H.earlyTip }),
      ),
      el('h3', {}, 'Sự cố & tiền boa'),
      el('div', { class: 'grid' },
        optNum('vagueChance', 'Quên địa chỉ (%)', { ...pct, min: 0, max: 100, hint: H.vagueChance }),
        optNum('vomitChance', 'Ói ra xe khi xóc (%)', { ...pct, min: 0, max: 100, hint: H.vomitChance }),
        optNum('vomitMental', 'Ói: trừ tinh thần', { step: 1, min: 0, max: 100, hint: H.vomitMental }),
        optNum('vomitCost', 'Ói: tiền rửa xe (k)', { step: 1, min: 0, hint: H.vomitCost }),
        optNum('noPayChance', 'Quỵt tiền (%)', { ...pct, min: 0, max: 100, hint: H.noPayChance }),
        optNum('bigTipChance', 'Boa đậm (%)', { ...pct, min: 0, max: 100, hint: H.bigTipChance }),
        optNum('bigTip', 'Tiền boa đậm (k)', { step: 1, min: 0, hint: H.bigTip }),
        optNum('changeDestChance', 'Đổi điểm đến giữa đường (%)', { ...pct, min: 0, max: 100, hint: 'Đang chở thì khách xin đổi qua chỗ khác (60–220 m quanh đó). Đồng ý → chở tới chỗ mới; từ chối → khách xuống, trả theo quãng đã đi, chấm sao thấp (thẻ Cân bằng → Sự cố khi chở khách).' }),
        optNum('changeDestPays', 'Đổi điểm đến: khách bù thêm tiền (%)', { ...pct, min: 0, max: 100, hint: 'Khi đổi điểm đến, tỉ lệ khách chịu trả thêm theo quãng đi thêm (còn lại thì tính như cũ).' }),
      ),
      el('h3', {}, 'Kiểu khách đặc biệt'),
      el('div', { class: 'grid' },
        field('Lừa đảo', checkInput(!!x.scam, (v) => { if (v) x.scam = true; else delete x.scam; changed(); ctx.rerender(); }, '🕵️ Khách lừa đảo (giữa đường đòi rẽ vào hẻm vắng để cướp tiền)'), opt('scam', { hint: 'Thẻ đơn hiện dấu hiệu "tài khoản mới, đòi tiền mặt". Giữa đường người chơi chọn: chạy vào (mất tiền) / mời xuống (mất chuyến) / chở tới đồn công an gần đó (được thưởng). Nên để hiếm, chỉ ban đêm.' })),
        x.scam ? optNum('robMax', 'Bị lấy tối đa (k)', { step: 10, min: 0, max: 5000, hint: 'Mặc định 300k.' }) : '',
        x.scam ? optNum('robPctMin', 'Bị lấy ít nhất (% tiền trong ví)', { ...pct, min: 0, max: 100, hint: 'Lấy từ mức này tới hết ví (không quá "tối đa"). Mặc định 50%.' }) : '',
        field('Mang vali', checkInput(!!x.luggage, (v) => { if (v) x.luggage = true; else delete x.luggage; changed(); }, '🧳 Xe nặng, chạy chậm hơn'), opt('luggage', { hint: 'Tốc độ tối đa giảm theo thẻ Cân bằng → Sự cố khi chở khách. Nên cho cước cao hơn.' })),
        field('Nước ngoài', checkInput(!!x.foreign, (v) => { if (v) x.foreign = true; else delete x.foreign; changed(); }, '🌍 Không nói tiếng Việt'), opt('foreign', { hint: 'Gọi hỏi đường phải dịch bằng điện thoại, mất thêm phút. Nên cho hay quên địa chỉ + boa đậm.' })),
      ),
      fromPicker(),
      field('Tên khách (thay tên ngẫu nhiên)', areaInput((x.names || []).join('\n'), (v) => {
        const names = v.split('\n').map((s) => s.trim()).filter(Boolean);
        if (names.length) x.names = names; else delete x.names;
        changed();
      }, 3), opt('names', { wide: true, hint: 'Mỗi dòng một tên. Để trống = tên Việt ngẫu nhiên (vd khách nước ngoài: John, Emma…).' })),
      field('Tên người đi (đặt xe dùm)', areaInput((x.riderNames || []).join('\n'), (v) => {
        const names = v.split('\n').map((s) => s.trim()).filter(Boolean);
        if (names.length) x.riderNames = names; else delete x.riderNames;
        changed();
      }, 3), opt('riderNames', { wide: true, hint: H.riderNames })),
      explain(EXPLAIN.riderTypes),
    );
  }

  // ---------- thêm / xóa ----------
  function add() {
    const prefix = cat === 'orderTypes' ? 'loaidon' : 'loaikhach';
    let n = 1;
    while (table[`${prefix}${n}`]) n++;
    const id = `${prefix}${n}`;
    if (!ID_RE.test(id)) return;
    table[id] = cat === 'orderTypes'
      ? { id, name: 'Loại đơn mới', icon: '📦', kind: 'parcel', weight: 1, fareMult: 1, deadlineMult: 1, items: [], codChance: 0, bomChance: 0, persuadeChance: 0, returnFeePct: 0 }
      : { id, name: 'Loại khách mới', icon: '🙂', weight: 1, viaApp: true, comfortKmh: 40, fareMult: 1, deadlineMult: 1, quitBelow: 10 };
    changed();
    ctx.select('app', { id });
  }
}
