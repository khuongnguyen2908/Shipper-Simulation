// Thẻ ĐỊA ĐIỂM & NPC: tên, biển hiệu, màu, vị trí trên bản đồ (bấm ô để dời), NPC,
// thực đơn quán, lời thoại riêng; mục "Tên đường & khách" cho tên phố, tên khách, người đi đường.
import { CITY, HALF, blockBounds, lotInfo, LOT_SIZES, lotParts, lotSize, lotFaces, blockPlan, blockRect } from '../../sim/cityLayout.js';
import { PROTECTED, ID_RE, LOTS, lotCells } from '../../data/validate.js';
import { moveInArray } from './order.js';
import { rowMenu, addButton, entryButtons, doRemove, doCopyActivity, doPasteActivity } from './opsUi.js';
import { personPreview } from './personPreview.js';
import { housePreview } from './housePreview.js';
import { LOOKS, guessLook, lookOf, looksFor } from '../../data/looks.js';
import { guessGender } from '../../sim/people.js';
import { el, field, textInput, numInput, colorInput, selectInput, checkInput, button, sideList, areaInput, dragHandle, makeSortable, emojiInput, explain, openDayInput, subTabs, advanced } from './ui.js';
import { openDayOf } from '../../sim/placeRules.js';
import { isPlaced } from '../../data/places.js';
import { findSpot } from './ops.js';
import { rentFor } from '../../data/balance.js';
import { HINT, EXPLAIN } from './help.js';
import { hoursPicker, rangesEditor, presetUsers } from './hoursUi.js';
import { ranges, packRanges, fmtHours } from '../../sim/hours.js';
import { CHANGEABLE_KINDS, canChangeKind, applyKind } from './placeKind.js';

const KIND = { home: '🏠 Nhà trọ', restaurant: '🍴 Quán ăn', gas: '⛽ Cây xăng', shop: '🎒 Tiệm đồ nghề', garage: '🔧 Tiệm xe', cafe: '☕ Quán cà phê', taphoa: '🛒 Tạp hóa', gate: '🟩 Nhà cổng xanh', apartment: '🏢 Chung cư', market: '🧺 Chợ', service: '⭐ Dịch vụ', scenery: '🌳 Cảnh quan', police: '🚓 Đồn công an' };
const ICON = { home: '🏠', restaurant: '🍴', gas: '⛽', shop: '🎒', garage: '🔧', cafe: '☕', taphoa: '🛒', gate: '🟩', apartment: '🏢', market: '🧺', service: '⭐', scenery: '🌳', police: '🚓' };
const LOT_LABEL = {
  N0: 'N0 · bắc trái', N1: 'N1 · bắc giữa', N2: 'N2 · bắc phải', S0: 'S0 · nam trái', S1: 'S1 · nam giữa', S2: 'S2 · nam phải', E1: 'E1 · đông', W1: 'W1 · tây',
  N01: 'N0+N1 · bắc, bên trái', N12: 'N1+N2 · bắc, bên phải', S01: 'S0+S1 · nam, bên trái', S12: 'S1+S2 · nam, bên phải',
  W01: 'N0+W1 · cột tây, phía trên', W12: 'W1+S0 · cột tây, phía dưới', E01: 'N2+E1 · cột đông, phía trên', E12: 'E1+S2 · cột đông, phía dưới',
  B: 'B · cả khối (9 ô)', N: 'N · cả dãy bắc', S: 'S · cả dãy nam', W: 'W · cả cột tây (N0+W1+S0)', E: 'E · cả cột đông (N2+E1+S2)', C: 'C · sân trong hẻm',
};
const DIR = { N: 'Bắc', S: 'Nam', E: 'Đông', W: 'Tây' };
const SIZE_LABEL = { one: '1 lô', two: '2 lô ngang', vtwo: '2 lô dọc', row: 'Cả dãy (3 lô ngang)', col: 'Cả cột (3 lô dọc)', block: 'Cả khối (9 ô — chỉ cảnh quan)' };
// cỡ chọn được theo loại: "Cả khối" chỉ dành cho cảnh quan (công viên lớn…)
// đồn công an: ít nhất 2 lô (nhà + bãi giữ xe vi phạm)
const sizesFor = (kind) => Object.entries(SIZE_LABEL).filter(([k]) => (k !== 'block' || kind === 'scenery') && (k !== 'one' || kind !== 'police'));
// Lô cùng cỡ có chứa ô vừa bấm (ưu tiên lô bắt đầu từ ô đó)
const lotForCell = (size, cell) => {
  const fits = LOT_SIZES[size].filter((l) => lotParts(l).includes(cell));
  return fits.find((l) => lotParts(l)[0] === cell) || fits[0] || null;
};
const SINGLE_LOTS = ['N0', 'N1', 'N2', 'S0', 'S1', 'S2', 'E1', 'W1'];

export function render(root, ctx) {
  const pd = ctx.data.places;
  const places = pd.places;
  const sel = ctx.sel.places;
  if (!sel.id || (!['__streets', '__schedule', '__hours'].includes(sel.id) && !places.some((p) => p.id === sel.id))) sel.id = places[0].id;
  let updHouse = null; // khung xem trước nhà (trang Thông tin) — vẽ lại khi sửa
  const changedP = () => {
    ctx.changed('places');
    updHouse?.();
  };

  const side = el('aside', { class: 'ed-side' });
  const drawSide = () => {
    side.innerHTML = '';
    side.append(
      el('div', { class: 'side-head' }, el('b', {}, `Địa điểm (${places.length})`), addButton(ctx, 'places', [['🍴 Quán ăn mới', () => addPlace('restaurant')], ['⭐ Địa điểm dịch vụ mới', () => addPlace('service')], ['🌳 Cảnh quan mới (công viên, đất trống…)', () => addPlace('scenery')], ['🚓 Đồn công an mới', () => addPlace('police')]])),
      sideList(
        [
          { id: '__streets', icon: '🛣️', title: 'Tên đường & khách', sub: 'phố, khách hàng, người đi đường', fixed: true },
          { id: '__schedule', icon: '📅', title: 'Lịch mở theo ngày', sub: 'quán, món mở từ ngày nào', fixed: true },
          { id: '__hours', icon: '⏰', title: 'Khung giờ mẫu', sub: `${Object.keys(pd.hourPresets || {}).length} mẫu · tick ở giờ mở cửa / có đơn`, fixed: true },
          ...places.map((p) => ({ id: p.id, icon: p.icon || ICON[p.kind] || '•', title: p.name, sub: `${p.id} · ${isPlaced(p) ? `khối ${p.block.join(',')} lô ${p.lot}` : '📦 chưa đặt trên bản đồ'}${p.openDay > 1 ? ` · mở ngày ${p.openDay}` : ''}` })),
        ],
        sel.id,
        (id) => ctx.select('places', { id }),
        { issuesFor: (id) => (id === '__schedule' ? [] : id === '__hours' ? ctx.issues.filter((i) => i.tab === 'places' && String(i.ref).startsWith('hour:')) : id === '__streets' ? ctx.issuesFor('places', '') : ctx.issuesFor('places', id)), onReorder: (a, b) => { moveInArray(places, a, b); changedP(); }, menu: rowMenu(ctx, 'places') },
      ),
    );
  };
  drawSide();
  ctx.refreshSide = drawSide;

  const body = el('section', { class: 'ed-body' });
  root.append(el('div', { class: 'ed-split' }, side, body));
  if (sel.id === '__streets') return renderStreets(body, ctx);
  if (sel.id === '__schedule') return renderSchedule(body, ctx);
  if (sel.id === '__hours') return renderHourPresets(body, ctx);

  const p = places.find((x) => x.id === sel.id);
  const ref = p.id;
  const locked = PROTECTED.places.includes(p.id);
  const opt = (k, extra = {}) => ({ ref, fieldKey: k, ...extra });

  // --- đầu trang ---
  body.append(
    el(
      'div',
      { class: 'body-head' },
      el('h2', {}, `${p.icon || ICON[p.kind] || ''} ${p.name}`),
      el('span', { class: 'pill' }, KIND[p.kind] || p.kind),
      p.hidden ? el('span', { class: 'pill' }, '👁 Ẩn trên bản đồ tới khi nhiệm vụ tiết lộ') : null,
      el('span', { class: 'inline' }, entryButtons(ctx, 'places', p.id), !locked ? button('🗑 Xóa địa điểm', () => doRemove(ctx, 'places', p.id), 'danger small') : null),
    ),
  );

  // --- bản đồ + vị trí ---
  const idInput = textInput(p.id, () => {}, { class: 'mono', disabled: locked });
  idInput.addEventListener('change', () => renamePlace(p, idInput.value.trim()));
  const map = ctx.data.map;
  const placed = isPlaced(p); // false = mới tạo, nằm chờ trong danh sách (kéo vào bản đồ ở thẻ 🏗️ Xây dựng)
  const plan = placed ? blockPlan(p.block[0], p.block[1], map) : null; // khối đang đặt có hẻm?
  const size = lotSize(p.lot) || 'one';
  // khối có hẻm: chọn một nhà (mặt phố hoặc trong hẻm); khối thường: lô theo kích thước
  const lotOptions = plan ? plan.lots.map((l) => l.id) : p.kind === 'gate' ? ['C'] : LOT_SIZES[size];
  const lotLabel = (l) => {
    if (!plan) return LOT_LABEL[l] || l;
    const info = lotInfo(p.block[0], p.block[1], l, null, map);
    return `${l} · ${info.inAlley ? 'trong hẻm' : 'mặt phố'} — ${info.address}`;
  };
  const mapBox = el('div', { class: 'mapbox' });
  // các phần của trang: mỗi lúc chỉ hiện một phần (nhớ phần đang mở)
  const T = subTabs('place', [
    ['info', '📍 Thông tin & vị trí'],
    ['npc', '🧍 NPC & lời thoại'],
    ['hours', '⏰ Giờ & hoạt động'],
    ['shop', '🛒 Thực đơn & bán hàng'],
    ['orders', '📦 Đơn hàng'],
  ]);
  body.append(T.el);
  T.pane('info').append(
    el(
      'div',
      { class: 'two' },
      el('div', {}, el(
        'div',
        { class: 'grid tight' },
        field('Tên đầy đủ', textInput(p.name, (v) => { p.name = v; changedP(); }), opt('name', { hint: HINT.place.name })),
        field('Tên ngắn (bản đồ)', textInput(p.short, (v) => { p.short = v; changedP(); }), opt('short', { hint: HINT.place.short })),
        kindField(),
        lookField(),
        floorsField(),
        field('Biểu tượng bản đồ', emojiInput(p.icon ?? '', (v) => { if (v) p.icon = v; else delete p.icon; changedP(); }, { placeholder: ICON[p.kind] || '📍' }), opt('icon', { hint: 'Emoji; để trống = theo loại' })),
        p.kind !== 'gate' && p.kind !== 'scenery' ? field('Chữ trên biển hiệu', textInput(p.sign, (v) => { p.sign = v; changedP(); }), opt('sign', { hint: HINT.place.sign })) : null,
        placed ? null : unplacedField(),
        placed && field('Khối (cột x, hàng z)', el('span', { class: 'inline' },
          numInput(p.block[0], (v) => { p.block[0] = Math.round(v); changedP(); drawMap(); }, { step: 1, min: 0, max: CITY.N - 1 }),
          numInput(p.block[1], (v) => { p.block[1] = Math.round(v); changedP(); drawMap(); }, { step: 1, min: 0, max: CITY.N - 1 })), opt('block', { hint: `0–${CITY.N - 1}, từ tây-bắc` })),
        placed && p.kind !== 'gate' && !plan ? field('Kích thước', selectInput(size, sizesFor(p.kind), (v) => {
          // giữ chỗ cũ nếu được: lấy lô cỡ mới chứa ô đầu của lô hiện tại
          p.lot = lotForCell(v, lotParts(p.lot)[0]) || lotParts(p.lot).map((c) => lotForCell(v, c)).find(Boolean) || LOT_SIZES[v][0];
          fixFace();
          changedP();
          ctx.rerender();
        }), opt('lotSize', { hint: 'Tòa nhà lớn chiếm nhiều lô (mỗi lô bớt 1 nhà khách). Mặt tiền: lô ngang quay ra đường phía bắc/nam; lô dọc quay ra đường phía tây/đông.' })) : null,
        placed && field('Lô trong khối', selectInput(lotOptions.includes(p.lot) ? p.lot : '', [...(lotOptions.includes(p.lot) ? [] : [['', `(${p.lot} — không có trong khối này)`]]), ...lotOptions.map((l) => [l, lotLabel(l)])], (v) => { if (!v) return; p.lot = v; if (plan) delete p.face; else fixFace(); changedP(); ctx.rerender(); }), opt('lot', { hint: plan ? 'Khối có hẻm: chọn một nhà (mặt tiền cố định theo nhà). Hoặc bấm vào nhà trên bản đồ.' : 'Hoặc bấm vào ô trên bản đồ (giữ nguyên kích thước)' })),
        placed && p.kind !== 'gate' && !plan ? faceField() : null,
      ),
      advanced('Nâng cao: mã, màu',
        field('Mã (không dấu)', idInput, opt('id', { hint: locked ? 'Code dùng trực tiếp mã này' : 'Đổi mã sẽ đổi cả khóa lời thoại npc.<mã>.*' })),
        p.signBg != null || (p.kind !== 'gate' && p.kind !== 'scenery') ? field('Màu biển hiệu', colorInput(p.signBg, (v) => { p.signBg = v; changedP(); }), opt('signBg')) : null,
        field('Màu tường', colorInput(p.color, (v) => { p.color = v; changedP(); }), opt('color')),
      ), houseBox()),
      mapBox,
    ),
  );

  // --- NPC ---
  if (p.npc) {
    const n = p.npc;
    const prev = personPreview(p.id);
    const changedN = () => { changedP(); prev.update(n); };
    // ô chọn có "mặc định" (bỏ trống = xóa trường khỏi dữ liệu)
    const optSel = (key, options) => {
      const cur = n[key] ?? '';
      const opts = options.some(([v]) => v === cur) ? options : [...options, [cur, `Tùy chỉnh (${cur})`]];
      return selectInput(cur, opts, (v) => { if (v === '') delete n[key]; else n[key] = v; changedN(); });
    };
    const guessLabel = () => `Tự đoán theo tên (${(guessGender(n.name) || 'm') === 'f' ? 'Nữ' : 'Nam'})`;
    const genderSel = optSel('gender', [['', guessLabel()], ['m', 'Nam'], ['f', 'Nữ']]);
    T.pane('npc').append(
      el('h3', {}, 'NPC đứng ở cửa'),
      el('div', { class: 'npc-wrap' },
        el(
          'div',
          { class: 'grid' },
          field('Tên NPC', textInput(n.name, (v) => { n.name = v; genderSel.options[0].textContent = guessLabel(); changedN(); }), opt('npc.name', { hint: 'Chị/Cô/Bà… → nữ; Anh/Chú/Ông… → nam' })),
          field('Chân dung (emoji)', emojiInput(n.portrait, (v) => { n.portrait = v; changedP(); }), opt('npc.portrait')),
          field('Giới tính', genderSel, opt('npc.gender')),
          field('Kiểu tóc', optSel('hairStyle', [['', 'Theo giới tính (nam ngắn, nữ dài)'], ['short', 'Ngắn'], ['long', 'Dài'], ['ponytail', 'Cột đuôi ngựa'], ['bun', 'Búi tóc'], ['bald', 'Trọc']]), opt('npc.hairStyle')),
          field('Màu tóc', optSel('hair', [['', 'Đen'], ['#5a3825', 'Nâu'], ['#8d8d8d', 'Bạc (lớn tuổi)'], ['#d4a94f', 'Vàng (nhuộm)'], ['#8e2b2b', 'Đỏ (nhuộm)']]), opt('npc.hair')),
          field('Màu da', optSel('skin', [['', 'Ngẫu nhiên (cố định)'], ['#ffdbac', 'Rất sáng'], ['#f1c27d', 'Sáng'], ['#e0ac69', 'Trung bình'], ['#c68642', 'Ngăm']]), opt('npc.skin')),
          field('Màu áo', colorInput(n.shirt, (v) => { n.shirt = v; changedN(); }), opt('npc.shirt')),
          field('Màu quần / váy', colorInput(n.pants, (v) => { n.pants = v; changedN(); }), opt('npc.pants')),
          field('Mặc váy', checkInput(!!n.skirt, (v) => { if (v) n.skirt = true; else delete n.skirt; changedN(); }, 'Có'), opt('npc.skirt', { hint: 'Váy lấy màu quần; chân màu da' })),
          field('Đội mũ', selectInput(n.hat || '', [['', 'Không'], ['nonla', 'Nón lá'], ['helmet', 'Mũ bảo hiểm'], ['police', 'Mũ CSGT']], (v) => { n.hat = v || null; changedN(); }), opt('npc.hat')),
          field('Vóc người', numInput(n.scale ?? 1, (v) => { if (v === 1) delete n.scale; else n.scale = v; changedN(); }, { step: 0.05, min: 0.6, max: 1.3 }), opt('npc.scale', { hint: HINT.npc.scale })),
        ),
        prev.el,
      ),
    );
    prev.update(n);
  }

  // --- thực đơn (quán ăn) ---
  if (p.kind === 'restaurant') {
    const items = Object.values(ctx.data.items).filter((it) => !it.traits.includes('passenger'));
    T.pane('shop').append(
      el('h3', {}, 'Thực đơn giao hàng'),
      field(
        'Món có đơn giao từ quán này',
        el('div', { class: 'chips' }, items.map((it) => checkInput((p.menu || []).includes(it.id), (on) => { p.menu = on ? [...(p.menu || []), it.id] : (p.menu || []).filter((m) => m !== it.id); changedP(); }, `${it.icon} ${it.name}`))),
        opt('menu', { wide: true, hint: 'Món lạnh chỉ có đơn khi người chơi đã có túi giữ nhiệt. Ngoài giờ mở cửa quán không có đơn.' }),
      ),
    );
  }

  // --- giờ mở cửa ---
  // read(): đọc (có thể không tồn tại) · write(): lấy object để ghi (tạo nếu chưa có)
  // Tick "Cả ngày" / một khung giờ mẫu (⏰, sửa ở mục Khung giờ mẫu) / "Tự đặt" (nhiều đoạn, giờ lẻ 30 phút)
  const hoursRow = (read, write, fieldKey, label, hint, onClear, emptyLabel = 'Cả ngày') => field(label, hoursPicker({
    value: read(),
    presets: pd.hourPresets || {},
    emptyLabel,
    onChange: (v) => {
      const o = write();
      if (v == null) delete o.hours;
      else o.hours = v;
      if (onClear) onClear();
      changedP();
    },
  }), opt(fieldKey, { hint, wide: true }));
  T.pane('hours').append(el('h3', {}, 'Giờ mở cửa'), el('div', { class: 'grid' },
    hoursRow(() => p.hours, () => p, 'hours', 'Giờ mở cửa (giờ)', 'Ngoài giờ: không vào được, không có đơn từ quán, không làm hoạt động. Đồng hồ chạy 24h; app nhận đơn 06:00–24:00 (thẻ 📱 App & Đơn).'),
    field('Mở từ ngày (khai trương)', openDayInput(p, changedP, { disabled: locked }), opt('openDay', { hint: locked ? 'Địa điểm gắn với cốt truyện → luôn mở từ ngày 1.' : HINT.place.openDay }))));

  // --- hoạt động ---
  const acts = () => p.activities || [];
  const actBox = el('div', { class: 'acts' });
  const drawActs = () => {
    actBox.innerHTML = '';
    acts().forEach((act, i) => {
      const num = (k, label, o = {}) => field(label, numInput(act[k], (v) => { act[k] = v; changedP(); }, { step: 1, ...o }), { hint: HINT.act[k] });
      const idIn = textInput(act.id, () => {}, { class: 'mono' });
      idIn.addEventListener('change', () => {
        const v = idIn.value.trim();
        if (!ID_RE.test(v) || acts().some((a, j) => j !== i && a.id === v)) { idIn.value = act.id; return alert('Mã không hợp lệ hoặc bị trùng.'); }
        act.id = v;
        changedP();
        ctx.rerender();
      });
      const head = el('b', {}, act.label || act.id);
      actBox.append(el('div', { class: 'act-card' },
        el('div', { class: 'act-head' }, dragHandle(), head),
        field('', el('div', { class: 'grid tight' },
          field('Tên hoạt động', textInput(act.label, (v) => { act.label = v; head.textContent = v || act.id; changedP(); }), { hint: HINT.act.label }),
          field('Mã', idIn),
          num('cost', 'Giá (k)', { min: 0 }),
          num('minutes', 'Mất bao nhiêu phút', { min: 0, max: 480 }),
          num('phys', 'Thể lực +/−', { min: -100, max: 100 }),
          num('mental', 'Tinh thần +/−', { min: -100, max: 100 }),
          num('perDay', 'Tối đa mỗi ngày (0 = không giới hạn)', { min: 0, max: 20 }),
          field('Có đơn thì dừng', checkInput(!!act.stopOnOrder, (v) => { if (v) act.stopOnOrder = true; else delete act.stopOnOrder; changedP(); }, 'Dừng khi có đơn'), { hint: HINT.act.stopOnOrder }),
          field('Cần đồ (dùng hết khi làm)', el('span', { class: 'inline' },
            selectInput(act.needs?.id || '', [['', 'Không cần'], ...Object.values(ctx.data.goods).filter((g) => g.type !== 'equipment').map((g) => [g.id, `${g.icon || ''} ${g.name}`])], (v) => {
              if (v) act.needs = { id: v, qty: act.needs?.qty || 1 };
              else delete act.needs;
              changedP();
              drawActs();
              ctx.applyFieldIssues();
            }),
            act.needs ? numInput(act.needs.qty || 1, (v) => { act.needs.qty = Math.round(v); changedP(); }, { step: 1, min: 1, max: 10 }) : null), { hint: HINT.act.needs })), { ref, fieldKey: `activities.${act.id}`, wide: true }),
        el('span', { class: 'inline' },
          button('📋 Sao chép', () => doCopyActivity(ctx, act), 'small'),
          button('🗑 Xóa hoạt động', () => { ctx.historyBreak(); p.activities.splice(i, 1); if (!p.activities.length) delete p.activities; changedP(); ctx.historyBreak(); drawActs(); ctx.applyFieldIssues(); }, 'danger small'))));
    });
    actBox.append(button('＋ Thêm hoạt động', () => {
      let n = 1;
      while (acts().some((a) => a.id === `hd${n}`)) n++;
      (p.activities = p.activities || []).push({ id: `hd${n}`, label: 'Hoạt động mới', cost: 10, minutes: 15, phys: 0, mental: 10, perDay: 0 });
      changedP();
      drawActs();
      ctx.applyFieldIssues();
    }, 'small primary'), button('📥 Dán hoạt động', () => doPasteActivity(ctx, p.id), 'small'));
  };
  drawActs();
  makeSortable(actBox, '.act-card', (a, b) => { moveInArray(p.activities, a, b); changedP(); drawActs(); ctx.applyFieldIssues(); });
  T.pane('hours').append(el('h3', {}, 'Hoạt động tại đây'), el('p', { class: 'muted' }, 'Người chơi chọn trong hộp thoại khi bấm E ở cửa (theo thứ tự dưới đây — kéo ⠿ để đổi). Thời gian trôi đúng số phút; thể lực/tinh thần cộng ngay.'), explain(EXPLAIN.act), actBox);
  // --- chợp mắt ---
  if (p.kind !== 'home') {
    const Z = ctx.data.balance.energy?.sleep || {};
    T.pane('hours').append(el('div', { class: 'grid' }, field('💤 Chợp mắt', checkInput(!!p.nap, (v) => { if (v) p.nap = true; else delete p.nap; changedP(); },
      `Cho chợp mắt ở đây (${Z.napShortMin ?? 30} phút / ${+((Z.napLongMin ?? 120) / 60).toFixed(1)} tiếng)`), opt('nap', { hint: HINT.place.nap, wide: true }))));
  }

  // --- hàng bán ---
  const gear = ctx.data.gear, goods = ctx.data.goods;
  const sellRow = (cat, label, table, iconOf) => {
    const list = p.sells?.[cat] || [];
    return field(label, el('div', { class: 'chips' }, Object.values(table).map((x) =>
      checkInput(list.includes(x.id), (on) => {
        p.sells = p.sells || {};
        const cur = p.sells[cat] || [];
        p.sells[cat] = on ? [...cur, x.id] : cur.filter((y) => y !== x.id);
        if (!p.sells[cat].length) delete p.sells[cat];
        if (!Object.keys(p.sells).length) delete p.sells;
        changedP();
      }, `${iconOf(x)} ${x.name} (${x.price}k)`))), opt(`sells.${cat}`, { wide: true }));
  };
  T.pane('shop').append(
    el('h3', {}, 'Bán gì'),
    el('p', { class: 'muted' }, 'Có hàng thì hộp thoại hiện nút "Xem hàng". Tạo đồ dùng mới ở thẻ Xe · Túi · Đồ dùng.'),
    sellRow('goods', 'Đồ dùng', goods, (x) => x.icon || '🎁'),
    sellRow('bags', 'Túi giao hàng', gear.bags, () => '👜'),
    sellRow('vehicles', 'Xe', gear.vehicles, () => '🛵'),
  );

  // --- điểm đến của đơn ---
  const ord = () => p.orders || {};
  const ordW = () => (p.orders = p.orders || {});
  const cleanup = () => { if (p.orders && !p.orders.rideWeight && !p.orders.foodWeight && !p.orders.parcelWeight && !p.orders.hours) delete p.orders; };
  T.pane('orders').append(
    el('h3', {}, 'Điểm đến của đơn hàng'),
    el('p', { class: 'muted' }, 'Mức 0 = không bao giờ, 10 = rất thường xuyên. Ví dụ karaoke: khách xe ôm mức 6, khung giờ 17→22.'),
    explain(EXPLAIN.orders),
    el('div', { class: 'grid' },
      field('Khách xe ôm đi tới / từ đây', numInput(ord().rideWeight ?? 0, (v) => { ordW().rideWeight = v; cleanup(); changedP(); }, { step: 1, min: 0, max: 10 }), opt('orders.rideWeight', { hint: HINT.orders.rideWeight })),
      p.kind !== 'restaurant' ? field('Đặt đồ ăn giao tới đây', numInput(ord().foodWeight ?? 0, (v) => { ordW().foodWeight = v; cleanup(); changedP(); }, { step: 1, min: 0, max: 10 }), opt('orders.foodWeight', { hint: HINT.orders.foodWeight })) : null,
      p.kind !== 'restaurant' ? field('Gửi hàng từ đây (đơn giao hàng)', numInput(ord().parcelWeight ?? 0, (v) => { ordW().parcelWeight = v; cleanup(); changedP(); }, { step: 1, min: 0, max: 10 }), opt('orders.parcelWeight', { hint: HINT.orders.parcelWeight })) : null,
      hoursRow(() => ord().hours, ordW, 'orders.hours', 'Khung giờ có đơn', '"Theo giờ mở cửa" = có đơn mọi lúc tiệm mở.', cleanup, 'Theo giờ mở cửa'),
    ),
  );

  // --- lời thoại riêng (kho chữ npc.<id>.*) ---
  const content = ctx.data.content;
  const keys = Object.keys(content).filter((k) => k.startsWith(`npc.${p.id}.`));
  T.pane('npc').append(el('h3', {}, 'Lời thoại riêng'), el('p', { class: 'muted' }, `Các khóa npc.${p.id}.* trong kho chữ (cũng sửa được ở thẻ Chữ & hội thoại).`));
  for (const k of keys) {
    T.pane('npc').append(field(k, areaInput(content[k], (v) => { content[k] = v; ctx.changed('content'); }, 2), { ref: k, fieldKey: 'text', wide: true }));
  }
  if (!content[`npc.${p.id}.greet`]) {
    T.pane('npc').append(button('＋ Thêm lời chào riêng', () => { content[`npc.${p.id}.greet`] = '"Chào em!"'; ctx.changed('content'); ctx.rerender(); }, 'small'));
  }

  T.done();
  if (placed) drawMap();
  else mapBox.append(el('div', { class: 'unplaced-card' }, el('b', {}, '📦 Chưa đặt trên bản đồ'), el('p', { class: 'muted' }, 'Game chưa có địa điểm này. Mở thẻ 🏗️ Xây dựng, kéo địa điểm từ danh sách thả vào một lô trên bản đồ 3D.')));

  // ---------- bản đồ khối/lô ----------
  function drawMap() {
    mapBox.innerHTML = '';
    const S = 640; // vẽ nét cao, CSS thu về vừa khung
    const c = el('canvas', { width: S, height: S, class: 'lotmap', title: 'Bấm vào một ô lô để dời địa điểm đang chọn tới đó' });
    const g = c.getContext('2d');
    const k = S / (HALF * 2 + 4);
    const X = (x) => (x + HALF + 2) * k, Z = (z) => (z + HALF + 2) * k;
    g.fillStyle = '#2b3038';
    g.fillRect(0, 0, S, S);
    const owner = new Map();
    for (const q of places) for (const cell of lotCells(q)) owner.set(cell, owner.has(cell) ? '__clash' : q.id);
    const alleyKey = `${pd.alley.block[0]},${pd.alley.block[1]},${pd.alley.lot}`;
    const rects = [];
    for (let bz = 0; bz < CITY.N; bz++) {
      for (let bx = 0; bx < CITY.N; bx++) {
        const b = blockBounds(bx, bz);
        g.fillStyle = '#4a5560';
        g.fillRect(X(b.x0), Z(b.z0), CITY.BLOCK * k, CITY.BLOCK * k);
        const bp = blockPlan(bx, bz, map);
        if (bp) {
          // khối có hẻm: hẻm + từng nhà có cửa (bấm để đặt địa điểm vào)
          for (const a of bp.alleys) { const r = blockRect(bx, bz, a); g.fillStyle = bp.walk ? '#d8cbb4' : '#b3a68f'; g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k); }
          for (const f of bp.fillers) { const r = blockRect(bx, bz, f); g.fillStyle = '#3d4650'; g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k); }
          for (const l of bp.lots) {
            const r = blockRect(bx, bz, l);
            const key = `${bx},${bz},${l.id}`;
            rects.push({ ...r, bx, bz, lot: l.id, key, alley: true });
            const who = owner.get(key);
            const q = places.find((x) => x.id === who);
            g.fillStyle = who === '__clash' ? '#c0392b' : q ? q.signBg || q.color || '#999' : l.front ? '#5f6b76' : '#717a62';
            g.fillRect(X(r.x0) + 0.5, Z(r.z0) + 0.5, (r.x1 - r.x0) * k - 1, (r.z1 - r.z0) * k - 1);
            if (q && q.id === p.id) {
              g.strokeStyle = '#f4d03f';
              g.lineWidth = 3;
              g.strokeRect(X(r.x0) + 1, Z(r.z0) + 1, (r.x1 - r.x0) * k - 2, (r.z1 - r.z0) * k - 2);
            }
          }
          continue;
        }
        for (const lot of [...SINGLE_LOTS, 'C']) {
          const r = lotInfo(bx, bz, lot, null, map);
          const key = `${bx},${bz},${lot}`;
          rects.push({ ...r, bx, bz, lot, key });
          const who = owner.get(key);
          const q = places.find((x) => x.id === who);
          g.fillStyle = key === alleyKey ? '#6d6458' : who === '__clash' ? '#c0392b' : q ? q.signBg || q.color || '#999' : lot === 'C' ? '#3d4650' : '#5f6b76';
          g.fillRect(X(r.x0) + 1, Z(r.z0) + 1, (r.x1 - r.x0) * k - 2, (r.z1 - r.z0) * k - 2);
          if (q && q.id === p.id) {
            g.fillStyle = 'rgba(244,208,63,0.55)';
            g.fillRect(X(r.x0) + 1, Z(r.z0) + 1, (r.x1 - r.x0) * k - 2, (r.z1 - r.z0) * k - 2);
            g.strokeStyle = '#f4d03f';
            g.lineWidth = 4;
            g.strokeRect(X(r.x0) + 2, Z(r.z0) + 2, (r.x1 - r.x0) * k - 4, (r.z1 - r.z0) * k - 4);
          }
        }
      }
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const q of places) {
      const r = lotInfo(q.block[0], q.block[1], q.lot, q.face, map);
      // vạch mặt tiền (cạnh có cửa)
      const edge = { N: [r.x0, r.z0, r.x1, r.z0], S: [r.x0, r.z1, r.x1, r.z1], W: [r.x0, r.z0, r.x0, r.z1], E: [r.x1, r.z0, r.x1, r.z1] }[r.face];
      if (edge && q.lot !== 'C') {
        g.strokeStyle = q.id === p.id ? '#f4d03f' : 'rgba(255,255,255,0.75)';
        g.lineWidth = q.id === p.id ? 6 : 3;
        g.beginPath();
        g.moveTo(X(edge[0]), Z(edge[1]));
        g.lineTo(X(edge[2]), Z(edge[3]));
        g.stroke();
      }
      const w = (r.x1 - r.x0) * k - 4;
      g.font = `${q.id === p.id ? 800 : 600} 13px "Segoe UI", sans-serif`;
      let label = q.short || q.id;
      while (label.length > 2 && g.measureText(label).width > w) label = label.slice(0, -1);
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.strokeText(label, X((r.x0 + r.x1) / 2), Z((r.z0 + r.z1) / 2));
      g.fillStyle = '#fff';
      g.fillText(label, X((r.x0 + r.x1) / 2), Z((r.z0 + r.z1) / 2));
    }
    c.addEventListener('click', (e) => {
      const bb = c.getBoundingClientRect();
      const wx = ((e.clientX - bb.left) / bb.width) * S / k - HALF - 2;
      const wz = ((e.clientY - bb.top) / bb.height) * S / k - HALF - 2;
      const hit = rects.find((r) => wx >= r.x0 && wx <= r.x1 && wz >= r.z0 && wz <= r.z1 && r.lot !== 'C') || rects.find((r) => wx >= r.x0 && wx <= r.x1 && wz >= r.z0 && wz <= r.z1);
      if (!hit) return;
      if (p.kind === 'gate') return alert('Nhà cổng xanh gắn với hẻm 42, không dời được.');
      if (hit.alley) {
        // khối có hẻm: đặt vào đúng nhà vừa bấm (1 lô, mặt tiền theo nhà)
        p.block = [hit.bx, hit.bz];
        p.lot = hit.lot;
        delete p.face;
        changedP();
        return ctx.rerender();
      }
      if (hit.lot === 'C') return alert('Lô C (sân trong hẻm) chỉ dành cho nhà cổng xanh.');
      const lot = lotForCell(lotSize(p.lot) || 'one', hit.lot); // (đang ở khối có hẻm → về lô 1 ô)
      if (!lot) return alert(`Ô ${hit.lot} không vừa kích thước "${SIZE_LABEL[lotSize(p.lot)]}". ${['col', 'vtwo'].includes(lotSize(p.lot)) ? 'Lô dọc chỉ đặt ở cột trái (N0, W1, S0) hoặc cột phải (N2, E1, S2).' : 'Chọn ô ở dãy bắc (N…) hoặc dãy nam (S…).'}`);
      p.block = [hit.bx, hit.bz];
      p.lot = lot;
      fixFace();
      changedP();
      ctx.rerender();
    });
    mapBox.append(c, el('small', { class: 'muted' }, 'Vàng = đang chọn · vạch = mặt tiền (cửa) · đỏ = trùng lô · nâu = lối vào hẻm 42 · khối có hẻm: bấm vào một nhà (xanh rêu = nhà trong hẻm) · bấm ô để dời'));
  }

  // ---------- loại địa điểm ----------
  function kindField() {
    const can = canChangeKind(p, locked);
    const options = can ? CHANGEABLE_KINDS.map((k) => [k, KIND[k]]) : [[p.kind, KIND[p.kind] || p.kind]];
    const s = selectInput(p.kind, options, (v) => {
      if (p.kind === 'restaurant' && (p.menu || []).length && !confirm(`Đổi "${p.name}" khỏi loại Quán ăn sẽ bỏ thực đơn (${p.menu.length} món) — chỉ quán ăn mới có đơn đồ ăn. Tiếp tục?`)) return ctx.rerender();
      applyKind(p, v, ctx.data.items);
      changedP();
      ctx.rerender();
    });
    s.disabled = !can;
    return field('Loại địa điểm', s, opt('kind', { hint: can ? HINT.place.kind
      : p.kind === 'scenery' ? 'Cảnh quan (công viên, đất trống…) tạo riêng — không đổi sang loại khác. Muốn có việc làm ở đây thì thêm hoạt động.'
      : p.kind === 'police' ? 'Đồn công an tạo riêng (nhận xe bị cẩu, nộp phạt nguội) — không đổi sang loại khác. Cần lô 2 ô trở lên.'
      : locked ? 'Địa điểm có khóa 🔒 (code gọi thẳng) — không đổi loại được.'
      : 'Loại này gắn với cốt truyện (quán cà phê, tạp hóa: nhiệm vụ chiếc ví) hoặc chỉ có một (nhà trọ, nhà cổng xanh, chung cư) — không đổi được.' }));
  }

  // ---------- kiểu nhà + số tầng + xem trước ----------
  function lookField() {
    const guess = LOOKS[guessLook(p)].label;
    const s = selectInput(p.look && LOOKS[p.look] ? p.look : '', [['', `Tự đoán theo loại — ${guess}`], ...looksFor(p.kind).map((k) => [k, LOOKS[k].label])], (v) => {
      if (v) p.look = v;
      else delete p.look;
      const r = LOOKS[lookOf(p)].floors;
      if (r && Number.isInteger(p.floors)) p.floors = Math.max(r[0], Math.min(r[1], p.floors)); // kéo số tầng vào khoảng của kiểu mới
      changedP();
      ctx.rerender();
    });
    return field(p.kind === 'scenery' ? 'Kiểu cảnh quan' : 'Kiểu nhà', s, opt('look', { hint: p.kind === 'scenery' ? HINT.place.sceneryLook : HINT.place.look }));
  }
  function floorsField() {
    const r = LOOKS[lookOf(p)].floors;
    if (!r) return null; // kiểu nhà hình cố định (chùa, cây xăng, cà phê…) — không chọn số tầng
    const cur = Number.isInteger(p.floors) ? p.floors : r[0];
    return field('Số tầng', numInput(cur, (v) => { p.floors = Math.max(r[0], Math.min(r[1], Math.round(v))); changedP(); }, { step: 1, min: r[0], max: r[1] }), opt('floors', { hint: `${r[0]}–${r[1]} tầng cho kiểu "${LOOKS[lookOf(p)].label}". ${HINT.place.floors}` }));
  }
  function houseBox() {
    const hp = housePreview();
    updHouse = () => hp.show(p, ctx.data.items, map);
    updHouse();
    return el('div', { class: 'house-wrap' }, hp.el, el('small', { class: 'muted' }, 'Xem trước nhà trong game (đổi kiểu nhà, số tầng, màu, biển, lô… là thấy ngay)'));
  }

  // ô "Vị trí" của địa điểm chưa đặt: mở thẻ Xây dựng, hoặc đặt nhanh vào lô trống đầu tiên
  function unplacedField() {
    return field('Vị trí', el('span', { class: 'inline' },
      button('🏗️ Kéo vào bản đồ (thẻ Xây dựng)', () => ctx.select('build', { id: p.id }), 'small primary'),
      button('📍 Đặt nhanh vào lô trống', () => {
        const spot = findSpot(ctx.data, 'N1');
        if (!spot) return alert('Hết lô trống.');
        p.block = spot.block;
        p.lot = spot.lot;
        changedP();
        ctx.rerender();
      }, 'small')), opt('block', { wide: true, hint: 'Địa điểm mới tạo nằm chờ trong danh sách. Kéo vào bản đồ ở thẻ 🏗️ Xây dựng, hoặc bấm "Đặt nhanh" rồi dời sau.' }));
  }

  // ---------- mặt tiền ----------
  // Bỏ hướng đã chọn nếu lô mới không còn chạm đường hướng đó
  function fixFace() {
    if (p.face && !lotFaces(p.lot).includes(p.face)) delete p.face;
  }
  function faceField() {
    const [bx, bz] = p.block;
    const street = (f) => ({ N: pd.streetsZ[bz], S: pd.streetsZ[bz + 1], W: pd.streetsX[bx], E: pd.streetsX[bx + 1] })[f] || '?';
    const faces = lotFaces(p.lot);
    const sel = selectInput(p.face || '', [
      ['', `Theo lô — ${DIR[faces[0]]} (đường ${street(faces[0])})`],
      ...faces.slice(1).map((f) => [f, `${DIR[f]} — đường ${street(f)}`]),
    ], (v) => { if (v) p.face = v; else delete p.face; changedP(); drawMap(); });
    sel.disabled = faces.length < 2;
    return field('Mặt tiền (cửa quay ra)', sel, opt('face', { hint: faces.length < 2
      ? 'Lô này chỉ chạm 1 con đường nên chỉ có 1 hướng. Lô góc, 2 lô, cả dãy, cả cột mới chọn được hướng khác.'
      : 'Vạch vàng trên bản đồ = mặt tiền. Cửa, biển hiệu, mái hiên, NPC và địa chỉ đổi theo.' }));
  }

  // ---------- thao tác ----------
  // Địa điểm mới nằm chờ trong danh sách (chưa có khối / lô) → kéo vào bản đồ ở thẻ 🏗️ Xây dựng
  function addPlace(kind) {
    const spot = {};
    const prefix = kind === 'restaurant' ? 'quan' : kind === 'scenery' ? 'canhquan' : kind === 'police' ? 'congan' : 'dichvu';
    let n = 1;
    while (places.some((x) => x.id === `${prefix}${n}`)) n++;
    const id = `${prefix}${n}`;
    const firstItem = Object.values(ctx.data.items).find((it) => !it.traits.includes('passenger'));
    if (kind === 'scenery') {
      // cảnh quan: không NPC, không biển hiệu, không giờ — thêm hoạt động sau nếu muốn có việc làm ở đây
      places.push({ id, name: 'Công viên mới', short: 'Công viên', kind, icon: '🌳', ...spot, look: 'park', color: '#5f9e45' });
      changedP();
      return ctx.select('places', { id });
    }
    if (kind === 'police') {
      // đồn công an: nhận xe bị cẩu, nộp phạt nguội (đặt vào lô 2 ô trở lên)
      places.push({ id, name: 'Công an phường', short: 'Công an', kind, icon: '🚓', ...spot, look: 'police', floors: 2, color: '#f2d16b', sign: 'CÔNG AN PHƯỜNG', signBg: '#b03a2e', npc: { name: 'Anh công an', shirt: '#c8b560', pants: '#3d4a2f', hat: 'police', portrait: '👮' } });
      ctx.data.content[`npc.${id}.greet`] = '"Chào anh/chị. Nộp phạt nguội hay lấy xe bị giữ?"';
      ctx.changed('content');
      changedP();
      return ctx.select('places', { id });
    }
    if (kind === 'restaurant') {
      places.push({ id, name: 'Quán mới', short: 'Quán', kind, ...spot, floors: 2, color: '#f4c095', sign: 'QUÁN MỚI', signBg: '#b03a2e', menu: firstItem ? [firstItem.id] : [], npc: { name: 'Chủ quán', shirt: '#ffffff', pants: '#333344', hat: null, portrait: '🧑‍🍳' } });
      ctx.data.content[`npc.${id}.greet`] = '"Chào em! Đơn của em đây."';
    } else {
      places.push({ id, name: 'Địa điểm mới', short: 'Mới', kind, icon: '⭐', ...spot, floors: 2, color: '#d6eaf8', sign: 'ĐỊA ĐIỂM MỚI', signBg: '#2e86c1', npc: { name: 'Nhân viên', shirt: '#2e86c1', pants: '#333344', hat: null, portrait: '🙂' }, hours: [8, 21], activities: [{ id: 'nghi', label: 'Ngồi nghỉ', cost: 0, minutes: 15, phys: 5, mental: 5, perDay: 0 }] });
      ctx.data.content[`npc.${id}.greet`] = '"Chào bạn! Vào chơi nha."';
    }
    ctx.changed('content');
    changedP();
    ctx.select('places', { id });
  }

  function renamePlace(q, newId) {
    if (!newId || newId === q.id) return;
    if (!ID_RE.test(newId)) return alert('Mã chỉ gồm chữ không dấu, số, gạch dưới.');
    if (places.some((x) => x.id === newId)) return alert('Mã này đã có.');
    const content = ctx.data.content;
    for (const k of Object.keys(content)) {
      if (k.startsWith(`npc.${q.id}.`)) {
        content[`npc.${newId}.${k.slice(`npc.${q.id}.`.length)}`] = content[k];
        if (!(k in ctx.base.content)) delete content[k];
      }
    }
    q.id = newId;
    ctx.changed('content');
    changedP();
    ctx.select('places', { id: newId });
  }
}

// Mục "Tên đường & khách"
function renderStreets(body, ctx) {
  const pd = ctx.data.places;
  const changedP = () => ctx.changed('places');
  const streetFields = (key, label) =>
    field(label, el('div', { class: 'grid tight' }, pd[key].map((s, i) => textInput(s, (v) => { pd[key][i] = v; changedP(); }))), { ref: '', fieldKey: key, wide: true });
  const lines = (arr) => (arr || []).join('\n');
  const toList = (v) => v.split('\n').map((s) => s.trim()).filter(Boolean);
  body.append(
    el('div', { class: 'body-head' }, el('h2', {}, '🛣️ Tên đường & khách')),
    streetFields('streetsX', `Đường dọc (tây → đông, ${CITY.N + 1} tên)`),
    streetFields('streetsZ', `Đường ngang (bắc → nam, ${CITY.N + 1} tên)`),
    el('p', { class: 'muted' }, `Đường chính hay kẹt xe: ${pd.mainRoads.map((r) => (r.axis === 'x' ? pd.streetsX[r.line] : pd.streetsZ[r.line])).join(', ')}. Lưu ý: vài câu thoại có nhắc tên đường cố định (ví dụ "Hai Bà Trưng") — đổi tên đường thì xem lại ở thẻ Chữ.`),
    field('Tên khách hàng (mỗi dòng 1 tên)', areaInput(lines(pd.customerNames), (v) => { pd.customerNames = toList(v); changedP(); }, 6), { ref: '', fieldKey: 'customerNames', wide: true }),
    field('Tên người đi đường (mỗi dòng 1 tên) — kho chữ ped.names', areaInput(lines(ctx.data.content['ped.names']), (v) => { ctx.data.content['ped.names'] = toList(v); ctx.changed('content'); }, 5), { ref: 'ped.names', fieldKey: 'text', wide: true }),
  );
}

// Trang "📅 Lịch mở theo ngày": mỗi ngày tiền nhà bao nhiêu, quán/món nào khai trương, mấy quán có đơn
function renderSchedule(body, ctx) {
  const places = ctx.data.places.places;
  const items = Object.values(ctx.data.items).filter((it) => !(it.traits || []).includes('passenger'));
  const eco = ctx.data.balance.economy;
  const every = Math.max(1, eco.rentEveryDays || 1);
  const last = Math.max(every * 3, ...places.map(openDayOf), ...items.map(openDayOf));
  const link = (label, tab, id) => button(label, () => ctx.select(tab, { id }), 'small');
  const rows = [];
  for (let d = 1; d <= last; d++) {
    const newPlaces = places.filter((p) => openDayOf(p) === d);
    const newItems = items.filter((it) => openDayOf(it) === d);
    // quán đã mở và có ít nhất 1 món đã có đơn tới ngày này
    const food = places.filter((p) => p.kind === 'restaurant' && openDayOf(p) <= d && (p.menu || []).some((id) => ctx.data.items[id] && openDayOf(ctx.data.items[id]) <= d)).length;
    const list = (arr, tab, icon) => (d === 1 && arr.length > 6
      ? el('small', { class: 'muted' }, `${arr.length} mục có sẵn từ đầu`)
      : arr.length ? el('div', { class: 'chips' }, arr.map((x) => link(`${x.icon || icon(x)} ${x.name}`, tab, x.id))) : el('small', { class: 'muted' }, '—'));
    rows.push(el('tr', {},
      el('td', {}, el('b', {}, `Ngày ${d}`)),
      el('td', {}, d % every === 0 ? `kỳ ${d / every}: ${rentFor(d / every, eco)}k (hạn ${eco.rentDueHour}h)` : el('small', { class: 'muted' }, '—')),
      el('td', {}, String(food)),
      el('td', {}, list(newPlaces, 'places', (x) => ICON[x.kind] || '📍')),
      el('td', {}, list(newItems, 'items', () => '🍽️')),
    ));
  }
  body.append(
    el('div', { class: 'body-head' }, el('h2', {}, '📅 Lịch mở theo ngày')),
    el('p', { class: 'muted' }, 'Đặt "Mở từ ngày" ở từng địa điểm và "Có đơn từ ngày" ở từng món (thẻ Vật phẩm). Bấm tên để sửa. Địa điểm gắn cốt truyện luôn mở từ ngày 1.'),
    explain(EXPLAIN.schedule),
    el('table', { class: 'cmp schedule' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Ngày'), el('th', {}, 'Hạn tiền nhà'), el('th', {}, 'Quán có đơn'), el('th', {}, 'Khai trương'), el('th', {}, 'Món mới trên app'))),
      el('tbody', {}, rows)),
  );
}

// Trang "⏰ Khung giờ mẫu": tạo / sửa / xóa mẫu; mỗi mẫu ghi rõ đang dùng ở đâu. Sửa mẫu → mọi nơi dùng đổi theo.
function renderHourPresets(body, ctx) {
  const pd = ctx.data.places;
  const presets = (pd.hourPresets = pd.hourPresets || {});
  const changed = (alsoApps = false) => {
    if (alsoApps) ctx.changed('apps');
    ctx.changed('places');
  };
  body.append(
    el('div', { class: 'body-head' }, el('h2', {}, '⏰ Khung giờ mẫu'), button('＋ Thêm khung giờ mẫu', add, 'small primary')),
    el('p', { class: 'muted' }, 'Ở mỗi địa điểm (giờ mở cửa, giờ có đơn) và thẻ 📱 App & Đơn (loại đơn, loại khách): tick một mẫu là lấy theo. Sửa mẫu ở đây → mọi nơi đang dùng đổi theo. Mỗi mẫu có thể nhiều đoạn (vd nghỉ trưa), giờ lẻ 30 phút.'),
  );
  if (!Object.keys(presets).length) body.append(el('p', { class: 'muted' }, 'Chưa có khung giờ mẫu nào.'));
  for (const h of Object.values(presets)) {
    const users = presetUsers(ctx.data, h.id);
    const ref = `hour:${h.id}`;
    const idIn = textInput(h.id, () => {}, { class: 'mono' });
    idIn.addEventListener('change', () => rename(h, idIn.value.trim()));
    const list = (ranges(h.ranges, {}) || [[8, 17]]).map((r) => [...r]);
    const preview = el('b', {}, fmtHours(h.ranges, {}));
    body.append(el('div', { class: 'act-card hp-card' },
      el('div', { class: 'act-head' }, el('b', {}, `⏰ ${h.name || h.id}`), preview),
      el('div', { class: 'grid tight' },
        field('Tên', textInput(h.name, (v) => { h.name = v; changed(); }), { ref, fieldKey: 'name' }),
        field('Mã (không dấu)', idIn, { ref, fieldKey: 'id', hint: 'Đổi mã → mọi nơi đang dùng tự đổi theo' })),
      field('Các đoạn giờ', rangesEditor(list, (l) => {
        h.ranges = packRanges(l);
        preview.textContent = fmtHours(h.ranges, {});
        changed(users.some((u) => u.tab === 'app'));
      }), { ref, fieldKey: 'ranges', wide: true }),
      field('Đang dùng ở', users.length
        ? el('div', { class: 'chips' }, users.map((u) => button(u.label, () => ctx.select(u.tab, u.sel), 'small')))
        : el('small', { class: 'muted' }, 'Chưa nơi nào dùng.'), { wide: true }),
      button('🗑 Xóa mẫu', () => remove(h, users), 'danger small')));
  }

  function add() {
    let n = 1;
    while (presets[`gio${n}`]) n++;
    const id = `gio${n}`;
    presets[id] = { id, name: 'Khung giờ mới', ranges: [8, 17] };
    ctx.historyBreak();
    changed();
    ctx.historyBreak();
    ctx.rerender();
  }
  function rename(h, newId) {
    if (!newId || newId === h.id) return;
    if (!ID_RE.test(newId)) return alert('Mã chỉ gồm chữ không dấu, số, gạch dưới.');
    if (presets[newId]) return alert('Mã này đã có.');
    const users = presetUsers(ctx.data, h.id);
    for (const u of users) u.obj[u.key] = newId;
    const entries = Object.entries(presets).map(([k, v]) => (k === h.id ? [newId, { ...v, id: newId }] : [k, v]));
    for (const k of Object.keys(presets)) delete presets[k];
    for (const [k, v] of entries) presets[k] = v;
    ctx.historyBreak();
    changed(users.some((u) => u.tab === 'app'));
    ctx.historyBreak();
    ctx.rerender();
  }
  // Xóa mẫu: nơi đang dùng giữ nguyên giờ (chuyển sang "Tự đặt")
  function remove(h, users) {
    const list = users.map((u) => `• ${u.label}`).join('\n');
    if (!confirm(`Xóa khung giờ mẫu "${h.name}"?${users.length ? `\n${users.length} nơi đang dùng sẽ giữ nguyên giờ ${fmtHours(h.ranges, {})} (chuyển sang "Tự đặt"):\n${list}` : ''}\n\n(Lỡ tay: Ctrl+Z)`)) return;
    const keep = packRanges(ranges(h.ranges, {}) || [[8, 17]]);
    for (const u of users) u.obj[u.key] = JSON.parse(JSON.stringify(keep));
    delete presets[h.id];
    ctx.historyBreak();
    changed(users.some((u) => u.tab === 'app'));
    ctx.historyBreak();
    ctx.rerender();
  }
}

export { LOTS };
