// Thẻ 🗺️ BẢN ĐỒ (map.json): kiểu hẻm của từng khối (bấm khối trên bản đồ để chọn) · sông và cầu.
import { CITY, HALF, blockBounds, blockPlan, blockRect, roadPos, roadGraph, segmentRect, joinList, joinGap } from '../../sim/cityLayout.js';
import { ALLEY_TEMPLATES } from '../../sim/blockPlan.js';
import { isPlaced } from '../../data/places.js';
import { el, field, button, selectInput, checkInput, numInput, explain, textInput, colorInput } from './ui.js';
import { HINT, EXPLAIN } from './help.js';
import { DISTRICT_TRAITS, DISTRICT_PRESETS, TRAIT_IDS, TRAIT_RANGE, traitOf, HOUSE_STYLES, DECOR, LOOK_PRESETS, TREES_RANGE, treesOf } from '../../data/districtTraits.js';

// khu phố đang mở bảng "tính cách" (⚙️)
let openKhu = null;
// cọ tô khu phố đang chọn: null = không tô (bấm khối để chọn) · '' = xóa khu phố khỏi khối · mã khu phố = tô khu phố đó
let brush = null;
// đang kéo tô (giữ ctx để chốt bước hoàn tác khi thả chuột) — nghe "thả chuột" một lần cho cả trang
let painting = null;
addEventListener('pointerup', () => {
  painting?.historyBreak();
  painting = null;
});
const PALETTE = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#16a085', '#3498db', '#9b59b6', '#e84393', '#795548', '#607d8b'];

export function render(root, ctx) {
  const map = ctx.data.map;
  map.blocks = map.blocks || {};
  const sel = ctx.sel.map;
  const changed = () => ctx.changed('map');
  const places = ctx.data.places.places;
  // khối có địa điểm (địa điểm trong khối có hẻm phải nằm trên lô của hẻm)
  const placeBlocks = new Map();
  for (const p of places) {
    if (!isPlaced(p)) continue; // chưa đặt trên bản đồ
    const k = p.block.join(',');
    placeBlocks.set(k, [...(placeBlocks.get(k) || []), p]);
  }
  const alley42 = ctx.data.places.alley.block.join(',');
  if (!sel.id || !/^\d+,\d+$/.test(sel.id)) sel.id = '0,0';
  const [sbx, sbz] = sel.id.split(',').map(Number);

  const side = el('aside', { class: 'ed-side' });
  const drawSide = () => {
    side.innerHTML = '';
    const list = Object.entries(map.blocks);
    side.append(
      el('div', { class: 'side-head' }, el('b', {}, `Khối có hẻm (${list.length})`)),
      el('div', { class: 'side-list' }, list.map(([k, s]) => el('button', { class: `side-row${k === sel.id ? ' on' : ''}`, type: 'button', onclick: () => ctx.select('map', { id: k }) },
        el('span', { class: 'sr-icon' }, s.walk ? '🚶' : '🛵'),
        el('span', { class: 'sr-main' }, el('b', {}, `Khối ${k}`), el('small', {}, `${ALLEY_TEMPLATES[s.alley]?.label || s.alley} · xoay ${s.rot || 0}`)),
        ctx.issuesFor('map', k).length ? el('span', { class: 'dot err' }) : null))),
    );
  };
  drawSide();
  ctx.refreshSide = drawSide;

  const body = el('section', { class: 'ed-body' });
  root.append(el('div', { class: 'ed-split' }, side, body));
  const canvasBox = el('div', { class: 'mapbox big' });
  const spec = map.blocks[sel.id] || null;
  const here = placeBlocks.get(sel.id) || [];
  const opt = (k, extra = {}) => ({ ref: sel.id, fieldKey: k, ...extra });
  const setSpec = (patch) => {
    if (patch === null) delete map.blocks[sel.id];
    else map.blocks[sel.id] = { alley: 'I', rot: 0, walk: false, ...(map.blocks[sel.id] || {}), ...patch };
    changed();
    ctx.rerender();
  };

  map.districts = map.districts || {};
  map.districtBlocks = map.districtBlocks || {};
  if (brush && !map.districts[brush]) brush = null;
  const dBox = el('div');
  body.append(
    el('div', { class: 'body-head' }, el('h2', {}, `🗺️ Bản đồ ${CITY.N}×${CITY.N} khối`)),
    el('div', { class: 'two' },
      el('div', { class: 'grid tight' },
        field('Khối đang chọn', el('b', {}, `${sel.id}${here.length ? ` — có ${here.map((p) => p.short || p.name).join(', ')}` : ''}`), opt('block', { hint: 'Bấm vào một khối trên bản đồ để chọn.' })),
        field('Kiểu hẻm', selectInput(spec ? spec.alley : '', [['', 'Không hẻm (8 lô quanh mép như cũ)'], ...Object.entries(ALLEY_TEMPLATES).map(([k, t]) => [k, t.label])], (v) => {
          if (v && sel.id === alley42) return alert('Khối này có hẻm 42 (nhà cổng xanh) — phải để "Không hẻm".');
          if (v && here.length && !spec && !confirm(`Khối này có ${here.map((p) => p.name).join(', ')}. Đổi sang khối có hẻm thì phải chọn lại lô cho các địa điểm này ở thẻ Địa điểm (bộ kiểm tra sẽ báo). Tiếp tục?`)) return ctx.rerender();
          setSpec(v ? { alley: v } : null);
        }), opt('alley', { hint: HINT.map.alley })),
        spec ? field('Hướng', el('span', { class: 'inline' }, [0, 1, 2, 3].map((r) => button(['↑', '→', '↓', '←'][r], () => setSpec({ rot: r }), (spec.rot || 0) === r ? 'small on' : 'small'))), opt('rot', { hint: 'Xoay mạng hẻm 90° mỗi nấc.' })) : null,
        spec ? field('Loại hẻm', checkInput(!!spec.walk, (v) => setSpec({ walk: v }), '🚶 Hẻm đi bộ (xe máy không vào được)'), opt('walk', { hint: HINT.map.walk })) : null,
        spec ? blockStats() : null,
        field('Khu phố của khối', selectInput(map.districtBlocks[sel.id] || '', [['', '(chưa gán khu phố)'], ...Object.entries(map.districts).map(([id, d]) => [id, d.name])], (v) => {
          if (v) map.districtBlocks[sel.id] = v;
          else delete map.districtBlocks[sel.id];
          changed();
          drawMap();
          drawDistricts();
        }), opt('district', { hint: 'Hoặc chọn cọ 🖌 ở mục Khu phố bên dưới rồi bấm / kéo trên bản đồ để tô nhiều khối.' })),
      ),
      canvasBox,
    ),
    dBox,
    explain(EXPLAIN.map),
    riversBox(),
    joinsBox(),
  );
  drawDistricts();
  drawMap();

  // ---------- khu phố ----------
  function drawDistricts() {
    const count = {};
    for (const id of Object.values(map.districtBlocks)) count[id] = (count[id] || 0) + 1;
    const unset = CITY.N * CITY.N - Object.keys(map.districtBlocks).length;
    const rows = Object.entries(map.districts).map(([id, d]) => [el('div', { class: `dist-row${brush === id ? ' on' : ''}` },
      colorInput(d.color || '#888888', (v) => { d.color = v; changed(); drawMap(); }),
      textInput(d.name, (v) => { d.name = v; changed(); drawMap(); }, { class: 'dist-name' }),
      el('small', { class: 'muted' }, `${count[id] || 0} khối`),
      button(openKhu === id ? '⚙️ Đóng' : '⚙️ Tính cách', () => { openKhu = openKhu === id ? null : id; drawDistricts(); }, openKhu === id ? 'small primary' : 'small'),
      button(brush === id ? '✔ Đang tô' : '🖌 Tô', () => { brush = brush === id ? null : id; drawDistricts(); }, brush === id ? 'small primary' : 'small'),
      button('🗑', () => {
        if (count[id] && !confirm(`Xóa "${d.name}"? ${count[id]} khối sẽ thành chưa gán khu phố.`)) return;
        ctx.historyBreak();
        delete map.districts[id];
        for (const [k, v] of Object.entries(map.districtBlocks)) if (v === id) delete map.districtBlocks[k];
        if (brush === id) brush = null;
        changed();
        ctx.historyBreak();
        drawDistricts();
        drawMap();
      }, 'small danger')), openKhu === id ? traitsPanel(id, d) : null]);
    dBox.innerHTML = '';
    dBox.append(
      el('h3', {}, '🏙️ Khu phố'),
      el('p', { class: 'muted' }, `Đặt tên / màu cho từng khu phố. Bấm 🖌 Tô rồi bấm hoặc kéo chuột trên bản đồ để gán khối vào khu phố (bấm lại để thôi tô). ${unset ? `Còn ${unset} khối chưa gán khu phố.` : 'Mọi khối đã có khu phố.'}`),
      el('div', { class: 'dist-list' }, rows),
      el('span', { class: 'inline' },
        button('＋ Thêm khu phố', () => {
          let n = 1;
          while (map.districts[`khu${n}`]) n++;
          map.districts[`khu${n}`] = { name: 'Khu phố mới', color: PALETTE[Object.keys(map.districts).length % PALETTE.length] };
          brush = `khu${n}`;
          changed();
          drawDistricts();
        }, 'small primary'),
        button(brush === '' ? '✔ Đang xóa khu phố khỏi khối' : '🧽 Xóa khu phố khỏi khối', () => { brush = brush === '' ? null : ''; drawDistricts(); }, brush === '' ? 'small primary' : 'small')),
    );
  }
  // Bảng "tính cách" của một khu phố: mẫu khu + các hệ số (1 = bình thường như mọi nơi)
  function traitsPanel(id, d) {
    const box = el('div', { class: 'dist-traits' });
    const draw = () => {
      box.innerHTML = '';
      const preset = selectInput('', [['', '— Áp dụng mẫu khu —'], ...Object.entries(DISTRICT_PRESETS).map(([k, p]) => [k, p.label])], (v) => {
        if (!v) return;
        ctx.historyBreak();
        for (const k of TRAIT_IDS) d[k] = DISTRICT_PRESETS[v][k];
        const look = LOOK_PRESETS[v]; // mẫu khu điền luôn kiểu nhà / trang trí / cây
        if (look) Object.assign(d, JSON.parse(JSON.stringify(look)));
        changed();
        ctx.historyBreak();
        draw();
      });
      box.append(
        el('div', { class: 'inline wrap' }, preset, button('↺ Về bình thường (tất cả = 1)', () => {
          ctx.historyBreak();
          for (const k of TRAIT_IDS) delete d[k];
          changed();
          ctx.historyBreak();
          draw();
        }, 'small')),
        el('div', { class: 'grid tight' }, DISTRICT_TRAITS.map(([k, label, hint]) => field(label, numInput(traitOf(d, k), (v) => {
          if (Number.isFinite(v) && v !== 1) d[k] = v;
          else delete d[k];
          changed();
        }, { step: 0.1, min: TRAIT_RANGE[0], max: TRAIT_RANGE[1] }), { ref: `district:${id}`, fieldKey: k, hint: `${hint} 1 = bình thường, 0 = không có, 2 = gấp đôi.` }))),
        lookPanel(id, d),
      );
      ctx.applyFieldIssues();
    };
    draw();
    return box;
  }

  // Nhà dân + trang trí + cây của khu (chỉ hình dáng, không đổi luật chơi)
  function lookPanel(id, d) {
    const houses = d.houses && typeof d.houses === 'object' ? d.houses : {};
    const setHouse = (k, v) => {
      const h = { ...(d.houses || {}) };
      if (Number.isFinite(v) && v > 0) h[k] = v;
      else delete h[k];
      if (Object.keys(h).length) d.houses = h;
      else delete d.houses;
      changed();
    };
    const setDecor = (k, on) => {
      const dc = { ...(d.decor || {}) };
      if (on) dc[k] = true;
      else delete dc[k];
      if (Object.keys(dc).length) d.decor = dc;
      else delete d.decor;
      changed();
    };
    return el('div', {},
      el('h4', {}, '🏘️ Nhà dân & trang trí (chỉ hình dáng)'),
      explain(['Cách chỉnh', 'Tỉ lệ các kiểu nhà dân trong khu (số tương đối, vd Phố Hoa 0,8 + Nhà ống 0,2). Mỗi khối chọn 1 kiểu chủ đạo nên nhà cùng kiểu tụ thành dãy phố. Nhà trong hẻm chỉ dùng kiểu nhỏ (nhà ống, mái tôn, phố Hoa, phố Nhật). Để trống hết = toàn nhà ống như cũ. Đổi xong tải lại game để thấy.']),
      el('div', { class: 'grid tight' }, HOUSE_STYLES.map(([k, label]) => field(label, numInput(houses[k] ?? null, (v) => setHouse(k, v), { step: 0.05, min: 0 }), { ref: `district:${id}`, fieldKey: 'houses' }))),
      el('div', { class: 'inline wrap' }, DECOR.map(([k, label]) => checkInput(d.decor?.[k], (on) => setDecor(k, on), label))),
      field('🌳 Cây xanh vỉa hè', numInput(treesOf(d), (v) => {
        if (Number.isFinite(v) && v !== 1) d.trees = v;
        else delete d.trees;
        changed();
      }, { step: 0.1, min: TREES_RANGE[0], max: TREES_RANGE[1] }), { ref: `district:${id}`, fieldKey: 'trees', hint: '0 = không cây · 1 = như cũ (8 cây mỗi khối) · 2 = gấp đôi.' }),
    );
  }

  // tô 1 khối bằng cọ đang chọn
  function paint(key) {
    if (brush === null) return;
    const cur = map.districtBlocks[key] || '';
    if (cur === brush) return;
    if (brush) map.districtBlocks[key] = brush;
    else delete map.districtBlocks[key];
    changed();
    drawMap();
    drawDistricts();
  }

  // ---------- sông & cầu ----------
  function riversBox() {
    map.rivers = map.rivers || [];
    const pd = ctx.data.places;
    const roadName = (axis, line) => (axis === 'x' ? pd.streetsX[line] : pd.streetsZ[line]) || `đường ${line}`;
    const box = el('div', {}, el('h3', {}, 'Sông & cầu'), el('p', { class: 'muted' }, HINT.map.river));
    map.rivers.forEach((r, i) => {
      const ref = `river${i}`;
      const o = (k) => ({ ref, fieldKey: k });
      const num = (k, label, max) => field(label, numInput(r[k], (v) => { r[k] = Math.round(v); if (k !== 'line') r.bridges = (r.bridges || []).filter((b) => b >= r.from && b <= r.to); changed(); ctx.rerender(); }, { step: 1, min: 0, max }), o(k));
      const cross = r.axis === 'z' ? pd.streetsX : pd.streetsZ; // đường cắt ngang sông tại mỗi ngã tư
      const nodes = [];
      for (let k = r.from; k <= r.to; k++) nodes.push(k);
      box.append(el('div', { class: 'act-card' },
        el('div', { class: 'act-head' }, el('b', {}, `🌊 ${r.name || `Sông ${i + 1}`}: dọc ${roadName(r.axis, r.line)}`), button('🗑 Xóa sông', () => { map.rivers.splice(i, 1); changed(); ctx.rerender(); }, 'danger small')),
        el('div', { class: 'grid tight' },
          field('Tên sông', textInput(r.name || '', (v) => { if (v.trim()) r.name = v; else delete r.name; changed(); }), o('name')),
          field('Chạy dọc', selectInput(r.axis, [['z', 'Đường ngang (tây ↔ đông)'], ['x', 'Đường dọc (bắc ↔ nam)']], (v) => { r.axis = v; changed(); ctx.rerender(); }), o('axis')),
          num('line', 'Đường số (0 = mép bắc/tây)', CITY.N),
          num('from', 'Từ ngã tư số', CITY.N),
          num('to', 'Tới ngã tư số', CITY.N),
        ),
        field('Cầu ở ngã tư', el('div', { class: 'chips' }, nodes.map((k) => checkInput((r.bridges || []).includes(k), (on) => {
          r.bridges = on ? [...(r.bridges || []), k].sort((a, b) => a - b) : (r.bridges || []).filter((b) => b !== k);
          changed();
          ctx.rerender();
        }, `${k} · ${cross[k] || ''}`))), { ...o('bridges'), wide: true, hint: 'Ngã tư không có cầu thành mặt nước: đường cắt ngang tới đó là đường cụt.' }),
      ));
    });
    box.append(button('＋ Thêm sông', () => { map.rivers.push({ name: `Sông ${map.rivers.length + 1}`, axis: 'z', line: CITY.N - 1, from: 0, to: CITY.N, bridges: [1, Math.floor(CITY.N / 2), CITY.N - 1] }); changed(); ctx.rerender(); }, 'small primary'));
    return box;
  }

  // ---------- gộp khối (sân bay…) ----------
  function joinsBox() {
    map.joins = map.joins || [];
    const box = el('div', {}, el('h3', {}, 'Gộp khối'), el('p', { class: 'muted' }, HINT.map.join));
    map.joins.forEach((j, i) => {
      const ref = `join:${j.join(',')}`, o = (k) => ({ ref, fieldKey: k });
      const set = (k, v) => { map.joins[i] = [k === 0 ? v : j[0], k === 1 ? v : j[1], k === 2 ? v : j[2]]; changed(); ctx.rerender(); };
      const other = j[2] === 'E' ? `${j[0] + 1},${j[1]}` : `${j[0]},${j[1] + 1}`;
      box.append(el('div', { class: 'act-card' },
        el('div', { class: 'act-head' }, el('b', {}, `🧱 Khối ${j[0]},${j[1]} + ${other}`), button('🗑 Bỏ gộp', () => { map.joins.splice(i, 1); if (!map.joins.length) delete map.joins; changed(); ctx.rerender(); }, 'danger small')),
        el('div', { class: 'grid tight' },
          field('Cột (x)', numInput(j[0], (v) => set(0, Math.round(v)), { step: 1, min: 0, max: CITY.N - 1 }), o('joins')),
          field('Hàng (z)', numInput(j[1], (v) => set(1, Math.round(v)), { step: 1, min: 0, max: CITY.N - 1 }), o('joins')),
          field('Gộp với', selectInput(j[2], [['E', 'Khối bên phải (đông)'], ['S', 'Khối bên dưới (nam)']], (v) => set(2, v)), o('joins')),
        ),
      ));
    });
    box.append(button('＋ Gộp 2 khối', () => { map.joins.push([0, 0, 'E']); changed(); ctx.rerender(); }, 'small primary'));
    return box;
  }

  function blockStats() {
    const plan = blockPlan(sbx, sbz, map);
    if (!plan) return null;
    const front = plan.lots.filter((l) => l.front).length;
    return field('Trong khối', el('span', {}, `${front} nhà mặt phố · ${plan.lots.length - front} nhà trong hẻm · ${plan.fillers.length} khối nhà phía sau`), opt('stats'));
  }

  // ---------- vẽ cả bản đồ ----------
  function drawMap() {
    canvasBox.innerHTML = '';
    const S = 760;
    const c = el('canvas', { width: S, height: S, class: 'lotmap', title: 'Bấm vào một khối để chọn' });
    const g = c.getContext('2d');
    const k = S / (HALF * 2 + 4);
    const X = (x) => (x + HALF + 2) * k, Z = (z) => (z + HALF + 2) * k;
    const R = (r, color) => { g.fillStyle = color; g.fillRect(X(r.x0), Z(r.z0), Math.max(1, (r.x1 - r.x0) * k), Math.max(1, (r.z1 - r.z0) * k)); };
    g.fillStyle = '#2b3038';
    g.fillRect(0, 0, S, S);
    for (let bz = 0; bz < CITY.N; bz++) {
      for (let bx = 0; bx < CITY.N; bx++) {
        const b = blockBounds(bx, bz);
        const key = `${bx},${bz}`;
        R(b, placeBlocks.has(key) ? '#5d6670' : '#4a5560');
        const plan = blockPlan(bx, bz, map);
        if (plan) {
          for (const l of plan.lots) R(blockRect(bx, bz, l), l.front ? '#6f7c88' : '#8a8f74');
          for (const f of plan.fillers) R(blockRect(bx, bz, f), '#55606a');
          for (const a of plan.alleys) R(blockRect(bx, bz, a), plan.walk ? '#d8cbb4' : '#b3a68f');
        }
        if (key === sel.id) {
          g.strokeStyle = '#f4d03f';
          g.lineWidth = 4;
          g.strokeRect(X(b.x0) + 2, Z(b.z0) + 2, (b.x1 - b.x0) * k - 4, (b.z1 - b.z0) * k - 4);
        }
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.font = '600 11px "Segoe UI", sans-serif';
        g.fillText(key, X(b.x0) + 3, Z(b.z0) + 12);
      }
    }
    // màu khu phố (phủ mờ) + tâm các khối của khu phố (để ghi tên)
    const sums = {};
    for (const [key, id] of Object.entries(map.districtBlocks || {})) {
      const d = map.districts?.[id];
      const [bx, bz] = key.split(',').map(Number);
      if (!d || bx >= CITY.N || bz >= CITY.N) continue;
      const b = blockBounds(bx, bz);
      g.globalAlpha = 0.38;
      R(b, d.color || '#888');
      g.globalAlpha = 1;
      const s = (sums[id] = sums[id] || { x: 0, z: 0, n: 0 });
      s.x += (b.x0 + b.x1) / 2;
      s.z += (b.z0 + b.z1) / 2;
      s.n++;
    }
    // sông & cầu (bản đang sửa)
    const G = roadGraph(map);
    const H = CITY.ROAD / 2;
    for (const id of G.waterSegs) {
      const m = /^([xz])(\d+):(\d+)$/.exec(id);
      if (+m[2] > CITY.N || +m[3] >= CITY.N) continue;
      R(segmentRect({ axis: m[1], line: +m[2], from: +m[3] }), '#3d7ea6');
    }
    for (const key of G.waterNodes) { const [i, j] = key.split(',').map(Number); R({ x0: roadPos(i) - H, x1: roadPos(i) + H, z0: roadPos(j) - H, z1: roadPos(j) + H }, '#3d7ea6'); }
    for (const key of G.bridgeNodes) { const [i, j] = key.split(',').map(Number); R({ x0: roadPos(i) - H * 0.7, x1: roadPos(i) + H * 0.7, z0: roadPos(j) - H * 0.7, z1: roadPos(j) + H * 0.7 }, '#c9ccce'); }
    // khối đã gộp: lòng đường cũ tô như khối
    for (const j of joinList(map)) R(joinGap(j), '#8a7f6e');
    // tên địa điểm
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 11px "Segoe UI", sans-serif';
    for (const p of places) {
      if (!isPlaced(p)) continue;
      const b = blockBounds(p.block[0], p.block[1]);
      const n = placeBlocks.get(p.block.join(',')).indexOf(p);
      g.fillStyle = '#fff';
      g.fillText((p.short || p.id).slice(0, 9), X((b.x0 + b.x1) / 2), Z(b.z0) + 26 + n * 12);
    }
    // tên khu phố (viền tối cho dễ đọc)
    g.font = '800 15px "Segoe UI", sans-serif';
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    for (const [id, s] of Object.entries(sums)) {
      const name = map.districts[id].name;
      g.strokeText(name, X(s.x / s.n), Z(s.z / s.n));
      g.fillStyle = '#fff';
      g.fillText(name, X(s.x / s.n), Z(s.z / s.n));
    }
    const blockAtEvent = (e) => {
      const bb = c.getBoundingClientRect();
      const wx = ((e.clientX - bb.left) / bb.width) * S / k - HALF - 2;
      const wz = ((e.clientY - bb.top) / bb.height) * S / k - HALF - 2;
      const bx = Math.floor((wx - roadPos(0) - CITY.ROAD / 2) / CITY.PITCH), bz = Math.floor((wz - roadPos(0) - CITY.ROAD / 2) / CITY.PITCH);
      return bx < 0 || bz < 0 || bx >= CITY.N || bz >= CITY.N ? null : `${bx},${bz}`;
    };
    // có cọ: bấm / kéo để tô khu phố · không cọ: bấm để chọn khối
    c.addEventListener('pointerdown', (e) => {
      if (brush === null) return;
      painting = ctx;
      ctx.historyBreak();
      const key = blockAtEvent(e);
      if (key) paint(key);
    });
    c.addEventListener('pointermove', (e) => {
      if (!painting || !e.buttons) return;
      const key = blockAtEvent(e);
      if (key) paint(key);
    });
    c.addEventListener('click', (e) => {
      if (brush !== null) return;
      const key = blockAtEvent(e);
      if (key) ctx.select('map', { id: key });
    });
    canvasBox.append(c, el('small', { class: 'muted' }, 'Vàng = khối đang chọn · xám sáng = khối có địa điểm · nâu = hẻm xe máy · be = hẻm đi bộ · xanh rêu = nhà trong hẻm'));
  }
}
