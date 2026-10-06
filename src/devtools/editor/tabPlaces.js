// Thẻ ĐỊA ĐIỂM & NPC: tên, biển hiệu, màu, vị trí trên bản đồ (bấm ô để dời), NPC,
// thực đơn quán, lời thoại riêng; mục "Tên đường & khách" cho tên phố, tên khách, người đi đường.
import { CITY, HALF, blockBounds, lotInfo } from '../../sim/cityLayout.js';
import { PROTECTED, ID_RE, LOTS, lotCells } from '../../data/validate.js';
import { el, field, textInput, numInput, colorInput, selectInput, checkInput, button, sideList, areaInput } from './ui.js';

const KIND = { home: '🏠 Nhà trọ', restaurant: '🍴 Quán ăn', gas: '⛽ Cây xăng', shop: '🎒 Tiệm đồ nghề', garage: '🔧 Tiệm xe', cafe: '☕ Quán cà phê', taphoa: '🛒 Tạp hóa', gate: '🟩 Nhà cổng xanh', apartment: '🏢 Chung cư', market: '🧺 Chợ' };
const ICON = { home: '🏠', restaurant: '🍴', gas: '⛽', shop: '🎒', garage: '🔧', cafe: '☕', taphoa: '🛒', gate: '🟩', apartment: '🏢', market: '🧺' };
const LOT_LABEL = { N0: 'N0 · bắc trái', N1: 'N1 · bắc giữa', N2: 'N2 · bắc phải', S0: 'S0 · nam trái', S1: 'S1 · nam giữa', S2: 'S2 · nam phải', E1: 'E1 · đông', W1: 'W1 · tây', N: 'N · cả dãy bắc', S: 'S · cả dãy nam', C: 'C · sân trong hẻm' };
const SINGLE_LOTS = ['N0', 'N1', 'N2', 'S0', 'S1', 'S2', 'E1', 'W1'];

export function render(root, ctx) {
  const pd = ctx.data.places;
  const places = pd.places;
  const sel = ctx.sel.places;
  if (!sel.id || (sel.id !== '__streets' && !places.some((p) => p.id === sel.id))) sel.id = places[0].id;
  const changedP = () => ctx.changed('places');

  const side = el('aside', { class: 'ed-side' });
  const drawSide = () => {
    side.innerHTML = '';
    side.append(
      el('div', { class: 'side-head' }, el('b', {}, `Địa điểm (${places.length})`), button('＋ Thêm quán', addRestaurant, 'small primary')),
      sideList(
        [{ id: '__streets', icon: '🛣️', title: 'Tên đường & khách', sub: 'phố, khách hàng, người đi đường' }, ...places.map((p) => ({ id: p.id, icon: ICON[p.kind] || '•', title: p.name, sub: `${p.id} · khối ${p.block.join(',')} lô ${p.lot}` }))],
        sel.id,
        (id) => ctx.select('places', { id }),
        { issuesFor: (id) => (id === '__streets' ? ctx.issuesFor('places', '') : ctx.issuesFor('places', id)) },
      ),
    );
  };
  drawSide();
  ctx.refreshSide = drawSide;

  const body = el('section', { class: 'ed-body' });
  root.append(el('div', { class: 'ed-split' }, side, body));
  if (sel.id === '__streets') return renderStreets(body, ctx);

  const p = places.find((x) => x.id === sel.id);
  const ref = p.id;
  const locked = PROTECTED.places.includes(p.id);
  const opt = (k, extra = {}) => ({ ref, fieldKey: k, ...extra });

  // --- đầu trang ---
  body.append(
    el(
      'div',
      { class: 'body-head' },
      el('h2', {}, `${ICON[p.kind] || ''} ${p.name}`),
      el('span', { class: 'pill' }, KIND[p.kind] || p.kind),
      p.hidden ? el('span', { class: 'pill' }, '👁 Ẩn trên bản đồ tới khi nhiệm vụ tiết lộ') : null,
      !locked && p.kind === 'restaurant' ? button('🗑 Xóa quán', () => removePlace(p), 'danger small') : null,
    ),
  );

  // --- bản đồ + vị trí ---
  const idInput = textInput(p.id, () => {}, { class: 'mono', disabled: locked });
  idInput.addEventListener('change', () => renamePlace(p, idInput.value.trim()));
  const lotOptions = p.kind === 'gate' ? ['C'] : p.lot === 'N' || p.lot === 'S' ? ['N', 'S'] : SINGLE_LOTS;
  const mapBox = el('div', { class: 'mapbox' });
  body.append(
    el(
      'div',
      { class: 'two' },
      el(
        'div',
        { class: 'grid tight' },
        field('Mã (không dấu)', idInput, opt('id', { hint: locked ? 'Code dùng trực tiếp mã này' : 'Đổi mã sẽ đổi cả khóa lời thoại npc.<mã>.*' })),
        field('Tên đầy đủ', textInput(p.name, (v) => { p.name = v; changedP(); }), opt('name')),
        field('Tên ngắn (bản đồ)', textInput(p.short, (v) => { p.short = v; changedP(); }), opt('short')),
        p.kind !== 'gate' ? field('Chữ trên biển hiệu', textInput(p.sign, (v) => { p.sign = v; changedP(); }), opt('sign')) : null,
        p.signBg != null || p.kind !== 'gate' ? field('Màu biển hiệu', colorInput(p.signBg, (v) => { p.signBg = v; changedP(); }), opt('signBg')) : null,
        field('Màu tường', colorInput(p.color, (v) => { p.color = v; changedP(); }), opt('color')),
        p.floors != null ? field('Số tầng', numInput(p.floors, (v) => { p.floors = Math.round(v); changedP(); }, { step: 1, min: 1, max: 15 }), opt('floors')) : null,
        field('Khối (cột x, hàng z)', el('span', { class: 'inline' },
          numInput(p.block[0], (v) => { p.block[0] = Math.round(v); changedP(); drawMap(); }, { step: 1, min: 0, max: CITY.N - 1 }),
          numInput(p.block[1], (v) => { p.block[1] = Math.round(v); changedP(); drawMap(); }, { step: 1, min: 0, max: CITY.N - 1 })), opt('block', { hint: `0–${CITY.N - 1}, từ tây-bắc` })),
        field('Lô trong khối', selectInput(p.lot, lotOptions.map((l) => [l, LOT_LABEL[l]]), (v) => { p.lot = v; changedP(); drawMap(); }), opt('lot', { hint: 'Hoặc bấm vào ô trên bản đồ' })),
      ),
      mapBox,
    ),
  );

  // --- NPC ---
  if (p.npc) {
    const n = p.npc;
    body.append(
      el('h3', {}, 'NPC đứng ở cửa'),
      el(
        'div',
        { class: 'grid' },
        field('Tên NPC', textInput(n.name, (v) => { n.name = v; changedP(); }), opt('npc.name')),
        field('Chân dung (emoji)', textInput(n.portrait, (v) => { n.portrait = v; changedP(); }, { class: 'emoji' }), opt('npc.portrait')),
        field('Màu áo', colorInput(n.shirt, (v) => { n.shirt = v; changedP(); }), opt('npc.shirt')),
        field('Màu quần', colorInput(n.pants, (v) => { n.pants = v; changedP(); }), opt('npc.pants')),
        field('Đội mũ', selectInput(n.hat || '', [['', 'Không'], ['nonla', 'Nón lá'], ['helmet', 'Mũ bảo hiểm'], ['police', 'Mũ CSGT']], (v) => { n.hat = v || null; changedP(); }), opt('npc.hat')),
        field('Vóc người', numInput(n.scale ?? 1, (v) => { if (v === 1) delete n.scale; else n.scale = v; changedP(); }, { step: 0.05, min: 0.6, max: 1.3 }), opt('npc.scale', { hint: '1 = bình thường' })),
      ),
    );
  }

  // --- quán ăn: thực đơn + phục vụ ---
  if (p.kind === 'restaurant' || p.kind === 'cafe') {
    body.append(
      el('h3', {}, p.kind === 'restaurant' ? 'Thực đơn & phục vụ' : 'Phục vụ'),
      field('Người chơi mua được', selectInput(p.serves || '', [['', 'Không bán cho người chơi'], ['meal', 'Bữa ăn (+thể lực)'], ['drink', 'Đồ uống (+tinh thần)']], (v) => { if (v) p.serves = v; else delete p.serves; changedP(); }), opt('serves')),
    );
    if (p.kind === 'restaurant') {
      const items = Object.values(ctx.data.items).filter((it) => !it.traits.includes('passenger'));
      body.append(
        field(
          'Món có đơn giao từ quán này',
          el('div', { class: 'chips' }, items.map((it) => checkInput((p.menu || []).includes(it.id), (on) => { p.menu = on ? [...(p.menu || []), it.id] : (p.menu || []).filter((m) => m !== it.id); changedP(); }, `${it.icon} ${it.name}`))),
          opt('menu', { wide: true, hint: 'Món lạnh chỉ có đơn khi người chơi đã có túi giữ nhiệt' }),
        ),
      );
    }
  }

  // --- lời thoại riêng (kho chữ npc.<id>.*) ---
  const content = ctx.data.content;
  const keys = Object.keys(content).filter((k) => k.startsWith(`npc.${p.id}.`));
  body.append(el('h3', {}, 'Lời thoại riêng'), el('p', { class: 'muted' }, `Các khóa npc.${p.id}.* trong kho chữ (cũng sửa được ở thẻ Chữ & hội thoại).`));
  for (const k of keys) {
    body.append(field(k, areaInput(content[k], (v) => { content[k] = v; ctx.changed('content'); }, 2), { ref: k, fieldKey: 'text', wide: true }));
  }
  if (!content[`npc.${p.id}.greet`] && p.kind === 'restaurant') {
    body.append(button('＋ Thêm lời chào riêng', () => { content[`npc.${p.id}.greet`] = '"Chào em!"'; ctx.changed('content'); ctx.rerender(); }, 'small'));
  }

  drawMap();

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
        for (const lot of [...SINGLE_LOTS, 'C']) {
          const r = lotInfo(bx, bz, lot);
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
      const r = lotInfo(q.block[0], q.block[1], q.lot);
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
      if (hit.lot === 'C') return alert('Lô C (sân trong hẻm) chỉ dành cho nhà cổng xanh.');
      let lot = hit.lot;
      if (p.lot === 'N' || p.lot === 'S') {
        if (!/^[NS]/.test(lot)) return alert('Tòa nhà lớn chỉ đặt được ở cả dãy bắc (N) hoặc nam (S).');
        lot = lot[0];
      }
      p.block = [hit.bx, hit.bz];
      p.lot = lot;
      changedP();
      ctx.rerender();
    });
    mapBox.append(c, el('small', { class: 'muted' }, 'Vàng = đang chọn · đỏ = trùng lô · nâu = lối vào hẻm 42 · bấm ô để dời'));
  }

  // ---------- thao tác ----------
  function addRestaurant() {
    const taken = new Set(places.flatMap(lotCells));
    taken.add(`${pd.alley.block[0]},${pd.alley.block[1]},${pd.alley.lot}`);
    let spot = null;
    for (let bz = 0; bz < CITY.N && !spot; bz++) for (let bx = 0; bx < CITY.N && !spot; bx++) for (const lot of SINGLE_LOTS) if (!spot && !taken.has(`${bx},${bz},${lot}`)) spot = { block: [bx, bz], lot };
    if (!spot) return alert('Hết lô trống.');
    let n = 1;
    while (places.some((x) => x.id === `quan${n}`)) n++;
    const id = `quan${n}`;
    const firstItem = Object.values(ctx.data.items).find((it) => !it.traits.includes('passenger'));
    places.push({ id, name: 'Quán mới', short: 'Quán', kind: 'restaurant', ...spot, floors: 2, color: '#f4c095', sign: 'QUÁN MỚI', signBg: '#b03a2e', menu: firstItem ? [firstItem.id] : [], npc: { name: 'Chủ quán', shirt: '#ffffff', pants: '#333344', hat: null, portrait: '🧑‍🍳' } });
    ctx.data.content[`npc.${id}.greet`] = '"Chào em! Đơn của em đây."';
    ctx.changed('content');
    changedP();
    ctx.select('places', { id });
  }

  function removePlace(q) {
    if (places.filter((x) => x.kind === 'restaurant').length <= 1) return alert('Cần giữ ít nhất 1 quán ăn.');
    if (!confirm(`Xóa "${q.name}"?`)) return;
    pd.places = places.filter((x) => x !== q);
    for (const k of Object.keys(ctx.data.content)) if (k.startsWith(`npc.${q.id}.`) && !(k in ctx.base.content)) delete ctx.data.content[k];
    ctx.changed('content');
    changedP();
    ctx.select('places', { id: null });
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
    streetFields('streetsX', 'Đường dọc (tây → đông, 6 tên)'),
    streetFields('streetsZ', 'Đường ngang (bắc → nam, 6 tên)'),
    el('p', { class: 'muted' }, `Đường chính hay kẹt xe: ${pd.mainRoads.map((r) => (r.axis === 'x' ? pd.streetsX[r.line] : pd.streetsZ[r.line])).join(', ')}. Lưu ý: vài câu thoại có nhắc tên đường cố định (ví dụ "Hai Bà Trưng") — đổi tên đường thì xem lại ở thẻ Chữ.`),
    field('Tên khách hàng (mỗi dòng 1 tên)', areaInput(lines(pd.customerNames), (v) => { pd.customerNames = toList(v); changedP(); }, 6), { ref: '', fieldKey: 'customerNames', wide: true }),
    field('Tên người đi đường (mỗi dòng 1 tên) — kho chữ ped.names', areaInput(lines(ctx.data.content['ped.names']), (v) => { ctx.data.content['ped.names'] = toList(v); ctx.changed('content'); }, 5), { ref: 'ped.names', fieldKey: 'text', wide: true }),
  );
}

export { LOTS };
