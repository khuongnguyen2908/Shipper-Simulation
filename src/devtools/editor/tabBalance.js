// Thẻ ⚖️ CÂN BẰNG (balance.json): tiền & ngày (tiền nhà theo ngày), chi phí, thể lực/tinh thần, đơn hàng,
// nhiệm vụ ví, mục Nâng cao (mọi số còn lại) + nút "Chạy thử bot" chạy ngầm bằng số đang sửa.
import SimWorker from './simWorker.js?worker&inline';
import { BALANCE_GROUPS, RENT_DAYS, KNOWN_PATHS, getPath, setPath } from '../../data/balanceSpec.js';
import { rentFor } from '../../data/balance.js';
import { el, field, numInput, button, sideList, explain, selectInput } from './ui.js';
import { EXPLAIN } from './help.js';

const STRAT_LABEL = { careful: 'Cẩn thận (chạy chậm)', rush: 'Ẩu (max ga)', picky: 'Kén đơn gần', normal: 'Bình thường (trả ví)', greedy: 'Tham (giữ tiền ví)' };
const SECTIONS = [...BALANCE_GROUPS.map((g) => [g.id, g.title]), ['advanced', '🔧 Nâng cao'], ['sim', '🤖 Chạy thử bot']];
// gợi ý cho vài số kỹ thuật ở mục Nâng cao
const ADV_HINT = {
  'order.offerTimeoutSec': 'Giây (thật) để bấm nhận đơn trước khi đơn tự trôi.',
  'order.waitComeChance': 'Khách không nghe máy: chờ thêm thì khách ra (0–1).',
  'order.parcelShopMax': 'Đơn giao hàng lấy ở shop cách tài xế tối đa bấy nhiêu m.',
  'order.stairMinPerFloor': 'Phút leo mỗi tầng thang bộ.',
  'order.callDownWait': 'Phút chờ khách xuống lấy (khi không leo).',
  'order.liftMin': 'Phút đi thang máy.',
  'order.placeDestBase': 'Điểm đến là địa điểm (karaoke…): xác suất = tổng mức / (tổng + số này).',
  'energy.meal': 'Chỉ bot mô phỏng dùng (người chơi ăn qua hoạt động ở quán).',
  'energy.drink': 'Chỉ bot mô phỏng dùng.',
  'energy.nap': 'Ngủ trưa ở phòng trọ: số phút, thể lực, tinh thần.',
  'walletQuest.keepPenaltyStars': 'Giữ ví bị tố: mỗi số là 1 lượt chấm sao bị thêm.',
};

// ---------- trạng thái bot (giữ qua các lần vẽ lại) ----------
const LAST_KEY = 'shipper-editor-sim-last';
const readLS = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* chế độ riêng tư */ } };
const sim = { worker: null, progress: null, error: null, last: readLS(LAST_KEY), prev: null, runs: 60, days: 5, redraw: null };

// Mục (trong danh sách bên trái) chứa ô có đường dẫn này — dùng khi bấm vào lỗi ở danh sách vấn đề
export function sectionOf(path) {
  return BALANCE_GROUPS.find((g) => g.fields.some((f) => f[0] === path) || g.stars?.[0] === path)?.id || (path === 'economy.rentByDay' ? 'money' : 'advanced');
}

export function render(root, ctx) {
  const b = ctx.data.balance;
  const sel = ctx.sel.balance;
  if (!SECTIONS.some(([id]) => id === sel.id)) sel.id = 'money';
  const changed = () => ctx.changed('balance');
  const groupOf = sectionOf;

  const side = el('aside', { class: 'ed-side' });
  const drawSide = () => {
    side.innerHTML = '';
    side.append(
      el('div', { class: 'side-head' }, el('b', {}, 'Cân bằng')),
      sideList(
        SECTIONS.map(([id, title]) => ({ id, icon: title.split(' ')[0], title: title.slice(title.indexOf(' ') + 1), sub: id === 'sim' ? (sim.last ? `lần trước: ${sim.last.runs} lượt × ${sim.last.days} ngày` : 'chưa chạy') : '' })),
        sel.id,
        (id) => ctx.select('balance', { id }),
        { issuesFor: (id) => ctx.issues.filter((i) => i.tab === 'balance' && groupOf(i.field) === id) },
      ),
    );
  };
  drawSide();
  ctx.refreshSide = drawSide;

  const body = el('section', { class: 'ed-body' });
  root.append(el('div', { class: 'ed-split' }, side, body));
  const opt = (path, extra = {}) => ({ ref: '', fieldKey: path, ...extra });
  const runLink = () => button('🤖 Chạy thử bot với số này', () => ctx.select('balance', { id: 'sim' }), 'small');

  if (sel.id === 'sim') return renderSim();
  if (sel.id === 'advanced') return renderAdvanced();
  const g = BALANCE_GROUPS.find((x) => x.id === sel.id);
  body.append(el('div', { class: 'body-head' }, el('h2', {}, g.title), runLink()));
  if (g.id === 'money') body.append(explain(EXPLAIN.balance));
  if (g.note) body.append(el('p', { class: 'muted' }, g.note));
  body.append(el('div', { class: 'grid' }, g.fields.map(([path, label, o]) => numField(path, label, o))));
  if (g.stars) body.append(starsField(...g.stars));
  if (g.id === 'money') body.append(rentTable());

  // ---------- các ô ----------
  function numField(path, label, o) {
    const s = o.scale || 1, digits = s === 100 ? 1 : s === 3.6 ? 0 : undefined;
    const box = { min: o.min * s, max: o.max * s, step: o.step, scale: s, digits };
    if (o.pair) {
      const v = getPath(b, path) || [0, 0];
      return field(label, el('span', { class: 'inline' },
        numInput(v[0], (x) => { getPath(b, path)[0] = x; changed(); }, box), el('span', {}, '→'),
        numInput(v[1], (x) => { getPath(b, path)[1] = x; changed(); }, box)), opt(path, { hint: o.hint }));
    }
    return field(label, numInput(getPath(b, path), (x) => { setPath(b, path, x); changed(); }, box), opt(path, { hint: o.hint }));
  }

  function starsField(path, label, hint) {
    const arr = getPath(b, path);
    return field(label, el('span', { class: 'inline stars-row' }, [1, 2, 3, 4, 5].map((n) => el('label', { class: 'mini' }, `${n}★`,
      numInput(arr[n], (x) => { arr[n] = x; changed(); }, { step: 1, min: -100, max: 100 })))), opt(path, { hint, wide: true }));
  }

  // Bảng tiền nhà 10 ngày: theo công thức hoặc tự đặt từng ngày
  function rentTable() {
    const eco = b.economy;
    const rows = [];
    for (let d = 1; d <= RENT_DAYS; d++) {
      const formula = eco.rentBase + eco.rentPerDay * (d - 1);
      const own = Array.isArray(eco.rentByDay) ? eco.rentByDay[d - 1] : null;
      const used = el('b', {}, `${rentFor(d, eco)}k`);
      rows.push(el('tr', {},
        el('td', {}, `Ngày ${d}`),
        el('td', {}, `${formula}k`),
        el('td', {}, numInput(own ?? '', (x) => {
          const list = Array.isArray(eco.rentByDay) ? [...eco.rentByDay] : [];
          while (list.length < d) list.push(null);
          list[d - 1] = Number.isFinite(x) && x > 0 ? x : null;
          while (list.length && list[list.length - 1] == null) list.pop(); // bỏ ô trống ở cuối cho gọn
          eco.rentByDay = list;
          used.textContent = `${rentFor(d, eco)}k`;
          changed();
        }, { step: 10, min: 0 })),
        el('td', {}, used)));
    }
    return el('div', {},
      el('h3', {}, 'Tiền nhà từng ngày'),
      el('p', { class: 'muted' }, 'Ô "Tự đặt" bỏ trống = theo công thức (tiền ngày 1 + tăng mỗi ngày). Sau ngày 10 luôn theo công thức.'),
      field('', el('table', { class: 'cmp rent' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Ngày'), el('th', {}, 'Theo công thức'), el('th', {}, 'Tự đặt (k)'), el('th', {}, 'Tiền nhà dùng'))),
        el('tbody', {}, rows)), opt('economy.rentByDay', { wide: true })));
  }

  // ---------- Nâng cao: mọi số chưa có ô riêng ----------
  function renderAdvanced() {
    const leaves = [];
    const walk = (o, pre) => {
      for (const [k, v] of Object.entries(o || {})) {
        const path = pre ? `${pre}.${k}` : k;
        if (KNOWN_PATHS.has(path)) continue;
        if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path);
        else leaves.push(path);
      }
    };
    walk(b, '');
    body.append(
      el('div', { class: 'body-head' }, el('h2', {}, '🔧 Nâng cao'), runLink()),
      el('p', { class: 'muted' }, 'Các số kỹ thuật còn lại trong balance.json, hiện theo tên gốc. Chỉ đổi khi biết rõ; sai thì bấm ↺ Bỏ thay đổi.'),
      el('div', { class: 'grid' }, leaves.map((path) => {
        const v = getPath(b, path);
        const hint = ADV_HINT[path] || ADV_HINT[path.split('.').slice(0, 2).join('.')];
        const input = Array.isArray(v)
          ? el('span', { class: 'inline' }, v.map((x, i) => numInput(x, (y) => { getPath(b, path)[i] = y; changed(); }, { step: 'any' })))
          : numInput(v, (y) => { setPath(b, path, y); changed(); }, { step: 'any' });
        return field(el('span', { class: 'mono' }, path), input, opt(path, { hint }));
      })),
    );
  }

  // ---------- Chạy thử bot ----------
  function renderSim() {
    const box = el('div', {});
    body.append(
      el('div', { class: 'body-head' }, el('h2', {}, '🤖 Chạy thử bot')),
      el('p', { class: 'muted' }, 'Bot chơi nối từ ngày 1: thắng thì mang tiền, đồ sang ngày sau; thua là dừng. Dùng số Cân bằng ĐANG SỬA (chưa lưu cũng được); các thẻ khác theo bản đã lưu. Bot chưa biết dùng hoạt động/đồ dùng nên số chỉ là ước lượng. 60 lượt dao động khoảng ±7%.'),
      box,
    );
    sim.redraw = () => { if (box.isConnected) drawSim(box); };
    drawSim(box);
  }

  function drawSim(box) {
    box.innerHTML = '';
    const running = !!sim.worker;
    box.append(el('div', { class: 'pv-ctrl' },
      el('label', {}, 'Số lượt mỗi kiểu chơi ', selectInput(sim.runs, [[30, '30 (nhanh)'], [60, '60'], [150, '150 (chính xác hơn)']], (v) => { sim.runs = +v; })),
      el('label', {}, 'Số ngày ', selectInput(sim.days, [[3, '3'], [5, '5'], [7, '7']], (v) => { sim.days = +v; })),
      running ? button('■ Dừng', stopSim, 'danger') : button('▶ Chạy thử bot', startSim, 'primary'),
    ));
    if (running && sim.progress) {
      const pctDone = Math.round((sim.progress.done / sim.progress.total) * 100);
      box.append(el('div', { class: 'sim-bar' }, el('i', { style: `width:${pctDone}%` })), el('small', { class: 'muted' }, `Đang chạy… ${pctDone}%`));
    }
    if (sim.error) box.append(el('div', { class: 'error' }, `⛔ ${sim.error}`));
    if (sim.last) box.append(resultTable(sim.last, sim.prev));
  }

  function startSim() {
    if (sim.worker) return;
    sim.error = null;
    sim.progress = { done: 0, total: 1 };
    const w = (sim.worker = new SimWorker());
    const rents = Array.from({ length: sim.days }, (_, i) => rentFor(i + 1, b.economy));
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') sim.progress = m;
      else {
        if (m.type === 'done') {
          sim.prev = sim.last && sim.last.days === m.days ? sim.last : sim.prev;
          sim.last = { ...m, rents, at: Date.now() };
          writeLS(LAST_KEY, sim.last);
        } else sim.error = m.message;
        w.terminate();
        sim.worker = null;
        drawSide();
      }
      sim.redraw?.();
    };
    w.postMessage({ balance: JSON.parse(JSON.stringify(b)), runs: sim.runs, days: sim.days });
    sim.redraw?.();
  }

  function stopSim() {
    sim.worker?.terminate();
    sim.worker = null;
    sim.progress = null;
    sim.redraw?.();
  }
}

// Bảng kết quả: mỗi kiểu chơi × mỗi ngày: % thắng (trong số lượt chơi tới được ngày đó), so với lần chạy trước
function resultTable(r, prev) {
  const days = r.days;
  const head = el('tr', {}, el('th', {}, 'Kiểu chơi'), Array.from({ length: days }, (_, i) => el('th', {}, `Ngày ${i + 1}`, el('small', {}, ` · ${r.rents?.[i] ?? '?'}k`))), el('th', {}, 'Qua hết'));
  const rows = Object.entries(r.result).map(([strat, x]) => {
    const p = prev?.result?.[strat];
    const cells = [];
    for (let d = 1; d <= days; d++) {
      if (!x.reach[d]) { cells.push(el('td', { class: 'muted' }, '—')); continue; }
      const v = Math.round((x.win[d] / x.reach[d]) * 100);
      const pv = p && p.reach[d] ? Math.round((p.win[d] / p.reach[d]) * 100) : null;
      const diff = pv == null ? null : v - pv;
      cells.push(el('td', { class: `sim-cell ${v >= 70 ? 'easy' : v >= 35 ? 'mid' : 'hard'}` },
        el('b', {}, `${v}%`),
        diff ? el('small', { class: diff > 0 ? 'up' : 'down' }, ` ${diff > 0 ? '+' : ''}${diff}`) : null,
        el('div', { class: 'muted' }, `${(x.orders[d] / x.reach[d]).toFixed(1)} đơn · ${x.reach[d]} lượt`)));
    }
    const survive = Math.round((x.win[days] / r.runs) * 100);
    return el('tr', {}, el('td', {}, STRAT_LABEL[strat] || strat), cells, el('td', {}, el('b', {}, `${survive}%`)));
  });
  return el('div', {},
    el('h3', {}, `Kết quả: ${r.runs} lượt × ${days} ngày`),
    el('small', { class: 'muted' }, `Chạy lúc ${new Date(r.at).toLocaleTimeString('vi-VN')}. % thắng tính trong số lượt chơi tới được ngày đó. Số nhỏ xanh/đỏ = so với lần chạy trước. "Qua hết" = % lượt thắng đủ ${days} ngày.`),
    el('table', { class: 'cmp sim-table' }, el('thead', {}, head), el('tbody', {}, rows)),
    el('small', { class: 'muted' }, 'Màu: xanh ≥ 70% (dễ) · vàng 35–69% · đỏ < 35% (khó).'),
  );
}
