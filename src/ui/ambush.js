// =============================================================
// MINI GAME "BÀY TRẬN" — giao diện (luật ở sim/ambush.js). Bản đồ nhỏ các ngã tư trong khung: bấm ngã tư để đặt / gỡ chốt
// anh em shipper, "Cho nó chạy thử" → chấm Tí Sún chạy theo đường ngắn nhất né chốt. Vào đường cụt ngập = thắng.
// Chỉ để nhìn + chọn, mỗi máy tự vẽ. Chữ ở vi.json (khóa amb.*).
// =============================================================
import { fmt } from '../content/index.js';
import { ambushNodes, ambushRun, ambushCandidates } from '../sim/ambush.js';
import { sound } from '../audio.js';

const NS = 'http://www.w3.org/2000/svg';
const key = (n) => `${n[0]},${n[1]}`;
const svg = (tag, attrs = {}, text = '') => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

// def: việc ambush (story.json) · nb(i, j): ngã tư nối thẳng (cityLayout.neighbors) · onWin(blocks): đặt đúng, bấm chốt kế hoạch
export function ambushPanel({ def, nb, onWin }) {
  const all = [...ambushNodes(def), ...(def.exits || []), ...(def.trapTo ? [def.trapTo] : [])];
  const xs = all.map((n) => n[0]), ys = all.map((n) => n[1]);
  const i0 = Math.min(...xs), i1 = Math.max(...xs), j0 = Math.min(...ys), j1 = Math.max(...ys);
  const C = 70, pad = 46, W = (i1 - i0) * C + pad * 2, H = (j1 - j0) * C + pad * 2;
  const P = (n) => [pad + (n[0] - i0) * C, pad + (n[1] - j0) * C];
  const max = def.blocks ?? 3;
  const fixed = new Set((def.fixed || []).map(key)), cand = new Set(ambushCandidates(def).map(key));
  const isExit = (n) => (def.exits || []).some((e) => key(e) === key(n));
  let mine = new Set(), busy = false, endAt = null; // endAt: chỗ Tí Sún dừng sau lần chạy thử

  const root = document.createElement('div');
  root.className = 'amb';
  root.innerHTML = `<p class="amb-help">${fmt('amb.help', { n: max })}</p>`;
  const map = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'amb-map' });
  root.append(map);
  const foot = document.createElement('div');
  foot.className = 'amb-foot';
  foot.innerHTML = `<span class="amb-count"></span><span class="amb-msg"></span>
    <button class="btn" data-a="reset">${fmt('amb.reset')}</button><button class="btn primary" data-a="run">${fmt('amb.run')}</button>`;
  root.append(foot);
  const legend = document.createElement('div');
  legend.className = 'amb-legend';
  legend.innerHTML = fmt('amb.legend');
  root.append(legend);

  // đường (cạnh) giữa các ngã tư có mặt trong khung
  const seen = new Set();
  const inMap = new Set(all.map(key));
  for (const n of all) for (const m of nb(n[0], n[1])) {
    if (!inMap.has(key(m))) continue;
    const k = [key(n), key(m)].sort().join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    const [x1, y1] = P(n), [x2, y2] = P(m);
    map.append(svg('line', { x1, y1, x2, y2, class: 'amb-road' }));
  }
  // đường cụt ngập (chỗ bẫy)
  if (def.trapTo) {
    const [x1, y1] = P(def.trap), [x2, y2] = P(def.trapTo);
    map.append(svg('line', { x1, y1, x2, y2, class: 'amb-flood' }));
    map.append(svg('text', { x: (x1 + x2) / 2 + 8, y: (y1 + y2) / 2, class: 'amb-label flood' }, fmt('amb.flood')));
  }
  const pathLine = svg('polyline', { class: 'amb-path', points: '' });
  map.append(pathLine);
  // ngã tư
  const dots = new Map();
  for (const n of all) {
    if (def.trapTo && key(n) === key(def.trapTo)) continue;
    const [x, y] = P(n), g = svg('g', { class: 'amb-node', transform: `translate(${x},${y})` });
    g.append(svg('circle', { r: 13 }));
    const t = svg('text', { y: 5, class: 'amb-ic' });
    g.append(t);
    if (isExit(n)) g.append(svg('text', { y: -19, class: 'amb-label exit' }, fmt('amb.exit')));
    if (cand.has(key(n))) g.addEventListener('click', () => toggle(n));
    map.append(g);
    dots.set(key(n), { g, t });
  }
  const thief = svg('text', { class: 'amb-thief' }, '😈');
  map.append(thief);

  const draw = () => {
    for (const [k, d] of dots) {
      const kind = fixed.has(k) ? 'fixed' : mine.has(k) ? 'mine' : k === key(def.start) ? 'start' : k === key(def.trap) ? 'trap' : (def.exits || []).some((e) => key(e) === k) ? 'exit' : cand.has(k) ? 'free' : '';
      d.g.setAttribute('class', `amb-node ${kind}`);
      d.t.textContent = kind === 'fixed' || kind === 'mine' ? '🛵' : kind === 'trap' ? '🌊' : '';
    }
    const [sx, sy] = P(def.start);
    const [tx, ty] = endAt || [sx, sy];
    if (!busy) { thief.setAttribute('x', tx - 9); thief.setAttribute('y', ty + 7); }
    foot.querySelector('.amb-count').textContent = fmt('amb.count', { n: mine.size, max });
    const runBtn = foot.querySelector('[data-a="run"]'); // thắng rồi thì nút này đã đổi thành "Chốt kế hoạch"
    if (runBtn) runBtn.disabled = busy;
  };
  const say = (k, cls = '') => {
    const m = foot.querySelector('.amb-msg');
    m.textContent = k ? fmt(k) : '';
    m.className = `amb-msg ${cls}`;
  };
  const toggle = (n) => {
    if (busy) return;
    const k = key(n);
    if (mine.has(k)) mine.delete(k);
    else if (mine.size < max) mine.add(k);
    else return say('amb.full', 'warn');
    sound('ui.click');
    endAt = null;
    pathLine.setAttribute('points', '');
    say('');
    draw();
  };
  // cho chạy thử: chấm Tí Sún đi theo đường, tới nơi thì báo kết quả
  const run = () => {
    if (busy) return;
    const r = ambushRun(def, new Set([...fixed, ...mine]), nb);
    const pts = r.path.map(P);
    pathLine.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
    pathLine.setAttribute('class', `amb-path ${r.result}`);
    busy = true;
    draw();
    let t = 0, last = performance.now();
    const seg = 0.42; // giây mỗi đoạn
    const tick = (now) => {
      t += (now - last) / 1000;
      last = now;
      const f = Math.min(pts.length - 1, t / seg), i = Math.floor(f), u = f - i;
      const a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)];
      thief.setAttribute('x', a[0] + (b[0] - a[0]) * u - 9);
      thief.setAttribute('y', a[1] + (b[1] - a[1]) * u + 7);
      if (f < pts.length - 1) return requestAnimationFrame(tick);
      busy = false;
      endAt = pts[pts.length - 1];
      if (r.result === 'trap') {
        sound('progress.objective');
        say('amb.win', 'good');
        foot.querySelector('[data-a="run"]').outerHTML = `<button class="btn primary" data-a="ok">${fmt('amb.ok')}</button>`;
        foot.querySelector('[data-a="ok"]').addEventListener('click', () => onWin([...mine].map((k) => k.split(',').map(Number))));
      } else {
        sound('ui.warn');
        say(r.result === 'escape' ? 'amb.escape' : 'amb.boxed', 'bad');
      }
      draw();
    };
    requestAnimationFrame(tick);
  };
  foot.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'run') run();
    if (a === 'reset' && !busy) {
      const ok = foot.querySelector('[data-a="ok"]'); // đã thắng mà muốn đặt lại → trả nút chạy thử
      if (ok) ok.outerHTML = `<button class="btn primary" data-a="run">${fmt('amb.run')}</button>`;
      mine = new Set();
      endAt = null;
      pathLine.setAttribute('points', '');
      say('');
      draw();
    }
  });
  draw();
  return root;
}
