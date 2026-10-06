// Thẻ 🗺️ BẢN ĐỒ (map.json): kiểu hẻm của từng khối (bấm khối trên bản đồ để chọn) · sông và cầu.
import { CITY, HALF, blockBounds, blockPlan, blockRect, roadPos, roadGraph, segmentRect } from '../../sim/cityLayout.js';
import { ALLEY_TEMPLATES } from '../../sim/blockPlan.js';
import { el, field, button, selectInput, checkInput, numInput, explain } from './ui.js';
import { HINT, EXPLAIN } from './help.js';

export function render(root, ctx) {
  const map = ctx.data.map;
  map.blocks = map.blocks || {};
  const sel = ctx.sel.map;
  const changed = () => ctx.changed('map');
  const places = ctx.data.places.places;
  // khối có địa điểm (địa điểm trong khối có hẻm phải nằm trên lô của hẻm)
  const placeBlocks = new Map();
  for (const p of places) {
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
      ),
      canvasBox,
    ),
    explain(EXPLAIN.map),
    riversBox(),
  );
  drawMap();

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
        el('div', { class: 'act-head' }, el('b', {}, `🌊 Sông ${i + 1}: dọc ${roadName(r.axis, r.line)}`), button('🗑 Xóa sông', () => { map.rivers.splice(i, 1); changed(); ctx.rerender(); }, 'danger small')),
        el('div', { class: 'grid tight' },
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
    box.append(button('＋ Thêm sông', () => { map.rivers.push({ axis: 'z', line: CITY.N - 1, from: 0, to: CITY.N, bridges: [1, Math.floor(CITY.N / 2), CITY.N - 1] }); changed(); ctx.rerender(); }, 'small primary'));
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
    // tên địa điểm
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 11px "Segoe UI", sans-serif';
    for (const p of places) {
      const b = blockBounds(p.block[0], p.block[1]);
      const n = placeBlocks.get(p.block.join(',')).indexOf(p);
      g.fillStyle = '#fff';
      g.fillText((p.short || p.id).slice(0, 9), X((b.x0 + b.x1) / 2), Z(b.z0) + 26 + n * 12);
    }
    c.addEventListener('click', (e) => {
      const bb = c.getBoundingClientRect();
      const wx = ((e.clientX - bb.left) / bb.width) * S / k - HALF - 2;
      const wz = ((e.clientY - bb.top) / bb.height) * S / k - HALF - 2;
      const bx = Math.floor((wx - roadPos(0) - CITY.ROAD / 2) / CITY.PITCH), bz = Math.floor((wz - roadPos(0) - CITY.ROAD / 2) / CITY.PITCH);
      if (bx < 0 || bz < 0 || bx >= CITY.N || bz >= CITY.N) return;
      ctx.select('map', { id: `${bx},${bz}` });
    });
    canvasBox.append(c, el('small', { class: 'muted' }, 'Vàng = khối đang chọn · xám sáng = khối có địa điểm · nâu = hẻm xe máy · be = hẻm đi bộ · xanh rêu = nhà trong hẻm'));
  }
}
