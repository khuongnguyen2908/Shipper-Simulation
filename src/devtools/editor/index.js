// =============================================================
// CÔNG CỤ NỘI DUNG (?editor)
// Sửa vật phẩm, xe/túi/đồ nghề, địa điểm & NPC, toàn bộ chữ hiển thị.
// Lưu: khi chạy `npm run dev` → ghi thẳng vào file JSON (game tự tải lại).
//      Không có máy chủ dev → Xuất file JSON để tự chép vào dự án.
// Bản nháp chưa lưu được giữ trong trình duyệt (localStorage).
// =============================================================
import './editor.css';
import itemsJson from '../../data/items.json' with { type: 'json' };
import gearJson from '../../data/gear.json' with { type: 'json' };
import goodsJson from '../../data/goods.json' with { type: 'json' };
import placesJson from '../../data/places.json' with { type: 'json' };
import contentJson from '../../content/vi.json' with { type: 'json' };
import appsJson from '../../data/apps.json' with { type: 'json' };
import { validateAll } from '../../data/validate.js';
import { setContentTable } from '../../content/index.js';
import { el, button, clone } from './ui.js';
import * as tabItems from './tabItems.js';
import * as tabGear from './tabGear.js';
import * as tabPlaces from './tabPlaces.js';
import * as tabText from './tabText.js';
import * as tabApp from './tabApp.js';
import { selKey, planScroll, selToSave } from './viewState.js';

const FILES = {
  items: { path: 'src/data/items.json', label: 'Vật phẩm', src: itemsJson },
  gear: { path: 'src/data/gear.json', label: 'Xe & Túi', src: gearJson },
  goods: { path: 'src/data/goods.json', label: 'Đồ dùng', src: goodsJson },
  places: { path: 'src/data/places.json', label: 'Địa điểm & NPC', src: placesJson },
  content: { path: 'src/content/vi.json', label: 'Chữ & hội thoại', src: contentJson },
  apps: { path: 'src/data/apps.json', label: 'App & Đơn', src: appsJson },
};
const TABS = [
  { id: 'items', icon: '🍜', label: 'Vật phẩm', mod: tabItems },
  { id: 'gear', icon: '🛵', label: 'Xe · Túi · Đồ dùng', mod: tabGear },
  { id: 'places', icon: '🏪', label: 'Địa điểm & NPC', mod: tabPlaces },
  { id: 'app', icon: '📱', label: 'App & Đơn', mod: tabApp },
  { id: 'text', icon: '💬', label: 'Chữ & hội thoại', mod: tabText },
];
const DRAFT_KEY = 'shipper-editor-draft-v1';
const TAB_KEY = 'shipper-editor-tab';
const SEL_KEY = 'shipper-editor-sel'; // món đang chọn ở từng thẻ (giữ qua F5)
const SCROLL_KEY = 'shipper-editor-scroll'; // chỗ đang cuộn lúc rời trang

const readJson = (k) => {
  try {
    return JSON.parse(store.get(k) || 'null');
  } catch {
    return null;
  }
};

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    } catch {
      /* chế độ riêng tư */
    }
  },
};

export async function startEditor(root) {
  document.body.classList.add('editor-mode');
  const canvas = document.getElementById('game');
  if (canvas) canvas.style.display = 'none';

  const base = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, clone(f.src)]));
  const ctx = {
    base,
    data: clone(base),
    issues: [],
    tab: TABS.some((t) => t.id === store.get(TAB_KEY)) ? store.get(TAB_KEY) : 'items',
    sel: selToSave(readJson(SEL_KEY)),
    canSave: false,
  };

  // ---------- khung ----------
  const header = el('header', { class: 'ed-head' });
  const banner = el('div', { class: 'ed-banner hidden' });
  const main = el('main', { class: 'ed-main' });
  const issuesBox = el('section', { class: 'ed-issues' });
  root.innerHTML = '';
  root.append(el('div', { class: 'ed-app' }, header, banner, main, issuesBox));

  const dirtyFiles = () => Object.keys(FILES).filter((k) => JSON.stringify(ctx.data[k]) !== JSON.stringify(ctx.base[k]));

  let draftTimer = 0;
  ctx.changed = (fileKey) => {
    if (fileKey === 'content') setContentTable(ctx.data.content);
    validate();
    renderHeader();
    renderIssues();
    applyFieldIssues();
    if (ctx.refreshSide) {
      const side = main.querySelector('.ed-side');
      const top = side ? side.scrollTop : 0;
      ctx.refreshSide();
      if (side) side.scrollTop = top; // vẽ lại danh sách bên trái mà không cuộn về đầu
    }
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const d = dirtyFiles();
      store.set(DRAFT_KEY, d.length ? JSON.stringify({ at: Date.now(), data: Object.fromEntries(d.map((k) => [k, ctx.data[k]])) }) : null);
    }, 400);
  };

  // Chỗ đang xem: lần đầu lấy từ lúc rời trang trước (F5), sau đó cập nhật mỗi lần vẽ
  const page = document.body; // trang editor cuộn trong <body>
  const sideScroll = () => main.querySelector('.ed-side')?.scrollTop || 0;
  let view = readJson(SCROLL_KEY);
  const currentView = () => ({ key: selKey(ctx.tab, ctx.sel[ctx.tab]), tab: ctx.tab, body: page.scrollTop, side: sideScroll() });

  // Vẽ lại cả trang nhưng giữ chỗ cuộn: cùng món → đứng yên; sang món khác → hiện từ đầu món mới
  ctx.rerender = () => {
    const before = view && { ...view, body: view.restore ? view.body : page.scrollTop, side: view.restore ? view.side : sideScroll() };
    renderHeader();
    renderTab();
    renderIssues();
    const key = selKey(ctx.tab, ctx.sel[ctx.tab]);
    const to = planScroll(before, key, !!before && before.tab === ctx.tab);
    page.scrollTop = to.body;
    const side = main.querySelector('.ed-side');
    if (side) side.scrollTop = to.side;
    view = { key, tab: ctx.tab };
    store.set(SEL_KEY, JSON.stringify(selToSave(ctx.sel)));
  };

  ctx.select = (tab, sel) => {
    ctx.tab = tab;
    store.set(TAB_KEY, tab);
    if (sel) ctx.sel[tab] = { ...(ctx.sel[tab] || {}), ...sel };
    ctx.rerender();
  };

  ctx.issuesFor = (tab, ref, extra = {}) => ctx.issues.filter((i) => i.tab === tab && i.ref === ref && (!extra.cat || i.cat === extra.cat));

  function validate() {
    ctx.issues = validateAll({ items: ctx.data.items, gear: ctx.data.gear, goods: ctx.data.goods, places: ctx.data.places, content: ctx.data.content, baseContent: ctx.base.content, apps: ctx.data.apps });
  }

  // Gắn lỗi vào đúng ô nhập (theo data-ref / data-field / data-cat)
  function applyFieldIssues() {
    const tabIssues = ctx.issues.filter((i) => i.tab === ctx.tab);
    main.querySelectorAll('.fld').forEach((f) => {
      const ref = f.dataset.ref, field = f.dataset.field, cat = f.dataset.cat;
      const msg = f.querySelector(':scope > .fld-msg'); // khung lỗi của chính ô này (không lấy của ô con)
      if (!field) return;
      const mine = tabIssues.filter((i) => i.ref === ref && (i.field === field || i.field.startsWith(field + '.')) && (!cat || !i.cat || i.cat === cat));
      msg.innerHTML = mine.map((i) => `<div class="${i.level}">${i.level === 'error' ? '⛔' : '⚠️'} ${escapeHtml(i.msg)}</div>`).join('');
      f.classList.toggle('has-err', mine.some((i) => i.level === 'error'));
      f.classList.toggle('has-warn', mine.length > 0 && !mine.some((i) => i.level === 'error'));
    });
  }
  ctx.applyFieldIssues = applyFieldIssues;

  // ---------- thanh trên ----------
  function renderHeader() {
    const dirty = dirtyFiles();
    const errors = ctx.issues.filter((i) => i.level === 'error').length;
    const warns = ctx.issues.length - errors;
    header.innerHTML = '';
    header.append(
      el('div', { class: 'ed-title' }, '🛠️ Công cụ nội dung', el('small', {}, 'Shipper Simulation')),
      el(
        'nav',
        { class: 'ed-tabs' },
        TABS.map((t) => {
          const n = ctx.issues.filter((i) => i.tab === t.id && i.level === 'error').length;
          const fileKeys = t.id === 'text' ? ['content'] : t.id === 'gear' ? ['gear', 'goods'] : t.id === 'app' ? ['apps'] : [t.id];
          return el(
            'button',
            { class: `ed-tab${ctx.tab === t.id ? ' on' : ''}`, type: 'button', onclick: () => ctx.select(t.id) },
            `${t.icon} ${t.label}`,
            fileKeys.some((k) => dirty.includes(k)) ? el('i', { class: 'dirty', title: 'Có thay đổi chưa lưu' }, '●') : null,
            n ? el('span', { class: 'cnt err' }, n) : null,
          );
        }),
      ),
      el(
        'div',
        { class: 'ed-actions' },
        el('span', { class: `ed-status ${errors ? 'err' : warns ? 'warn' : 'ok'}` }, errors ? `⛔ ${errors} lỗi` : warns ? `⚠️ ${warns} cảnh báo` : '✔ Hợp lệ'),
        ctx.canSave
          ? button(dirty.length ? `💾 Lưu (${dirty.length} file)` : '💾 Đã lưu', save, `primary${!dirty.length || errors ? ' off' : ''}`)
          : button('⬇️ Xuất JSON', exportFiles, dirty.length ? 'primary' : ''),
        button('⬆️ Nhập JSON', importFiles),
        button('↺ Bỏ thay đổi', revertAll, dirty.length ? '' : 'off'),
        el('a', { class: 'btn', href: './?debug', target: '_blank', title: 'Game chỉ thấy thay đổi đã lưu' }, '▶ Thử trong game'),
      ),
    );
  }

  function renderTab() {
    main.innerHTML = '';
    ctx.refreshSide = null;
    const t = TABS.find((x) => x.id === ctx.tab);
    ctx.sel[t.id] = ctx.sel[t.id] || {};
    t.mod.render(main, ctx);
    applyFieldIssues();
  }

  function renderIssues() {
    const list = ctx.issues;
    issuesBox.innerHTML = '';
    if (!list.length) {
      issuesBox.append(el('div', { class: 'iss-empty' }, '✔ Không có lỗi hay cảnh báo nào.'));
      return;
    }
    const tabName = (id) => TABS.find((t) => t.id === id)?.label || id;
    issuesBox.append(
      el('div', { class: 'iss-head' }, `Danh sách vấn đề (${list.length}) — bấm để tới chỗ cần sửa`),
      el(
        'div',
        { class: 'iss-list' },
        list
          .slice()
          .sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1))
          .slice(0, 200)
          .map((i) =>
            el(
              'button',
              { class: `iss ${i.level}`, type: 'button', onclick: () => jump(i) },
              i.level === 'error' ? '⛔ ' : '⚠️ ',
              el('b', {}, `${tabName(i.tab)}${i.ref ? ` › ${i.ref}` : ''}`),
              ` — ${i.msg}`,
            ),
          ),
      ),
    );
  }

  function jump(i) {
    if (i.tab === 'items') ctx.select('items', { id: i.ref });
    else if (i.tab === 'gear') ctx.select('gear', { cat: i.cat, id: i.ref });
    else if (i.tab === 'places') ctx.select('places', { id: i.ref || '__streets' });
    else if (i.tab === 'text') ctx.select('text', { search: i.ref, group: '' });
    else if (i.tab === 'app') ctx.select('app', { cat: i.cat, id: i.ref || null });
  }

  // ---------- lưu / xuất / nhập ----------
  async function save() {
    const dirty = dirtyFiles();
    if (!dirty.length) return;
    if (ctx.issues.some((i) => i.level === 'error')) {
      alert('Còn lỗi (⛔) — sửa hết lỗi trước khi lưu. Xem danh sách bên dưới.');
      return;
    }
    const files = dirty.map((k) => ({ path: FILES[k].path, content: JSON.stringify(ctx.data[k], null, 2) + '\n' }));
    try {
      const r = await fetch('/__editor/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      store.set(DRAFT_KEY, null);
      for (const k of dirty) ctx.base[k] = clone(ctx.data[k]);
      showBanner(`💾 Đã lưu ${j.written.join(', ')}. Game đang mở sẽ tự tải lại.`, 'ok');
      ctx.rerender();
    } catch (e) {
      showBanner(`Lưu thất bại: ${e.message}`, 'err');
    }
  }

  function exportFiles() {
    const dirty = dirtyFiles();
    const keys = dirty.length ? dirty : Object.keys(FILES);
    for (const k of keys) {
      const blob = new Blob([JSON.stringify(ctx.data[k], null, 2) + '\n'], { type: 'application/json' });
      const a = el('a', { href: URL.createObjectURL(blob), download: FILES[k].path.split('/').pop() });
      document.body.append(a);
      a.click();
      a.remove();
    }
    showBanner(`⬇️ Đã xuất ${keys.map((k) => FILES[k].path).join(', ')} — chép đè vào đúng thư mục trong dự án.`, 'ok');
  }

  function importFiles() {
    const inp = el('input', { type: 'file', accept: '.json,application/json', multiple: true });
    inp.addEventListener('change', async () => {
      const done = [];
      for (const f of inp.files) {
        try {
          const j = JSON.parse(await f.text());
          const first = Object.values(j)[0] || {};
          const k = j.vehicles ? 'gear' : j.places ? 'places' : j.orderTypes ? 'apps' : Object.keys(j).some((x) => x.includes('.')) ? 'content' : ['consumable', 'equipment', 'carry', 'outfit'].includes(first.type) ? 'goods' : 'items';
          ctx.data[k] = j;
          done.push(`${f.name} → ${FILES[k].label}`);
        } catch (e) {
          done.push(`${f.name}: lỗi (${e.message})`);
        }
      }
      setContentTable(ctx.data.content);
      ctx.changed();
      ctx.rerender();
      showBanner(`⬆️ Đã nhập: ${done.join(' · ')} (chưa lưu)`, 'ok');
    });
    inp.click();
  }

  function revertAll() {
    if (!dirtyFiles().length) return;
    if (!confirm('Bỏ mọi thay đổi chưa lưu?')) return;
    ctx.data = clone(ctx.base);
    setContentTable(ctx.data.content);
    store.set(DRAFT_KEY, null);
    ctx.changed();
    ctx.rerender();
  }

  function showBanner(html, kind = 'ok', actions = []) {
    banner.className = `ed-banner ${kind}`;
    banner.innerHTML = '';
    banner.append(el('span', { html }), ...actions, button('✕', () => (banner.className = 'ed-banner hidden'), 'small'));
  }

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      ctx.canSave ? save() : exportFiles();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirtyFiles().length) e.preventDefault();
  });
  // rời trang / F5: nhớ chỗ đang cuộn để mở lại đúng chỗ
  window.addEventListener('pagehide', () => store.set(SCROLL_KEY, JSON.stringify({ ...currentView(), restore: true })));

  // File dữ liệu đổi trên đĩa: do chính editor lưu → không làm gì (editor đã có dữ liệu mới);
  // bị sửa từ bên ngoài (sửa tay, git pull…) → báo để tải lại, tránh lưu đè lên bản mới
  if (import.meta.hot) {
    import.meta.hot.on('shipper:data-changed', ({ file, fromEditor }) => {
      if (fromEditor) return;
      showBanner(`📂 File <b>${escapeHtml(file)}</b> vừa bị sửa bên ngoài công cụ. Tải lại để thấy bản mới${dirtyFiles().length ? ' (thay đổi chưa lưu sẽ còn trong bản nháp)' : ''}.`, 'warn', [
        button('Tải lại', () => location.reload(), 'primary small'),
      ]);
    });
  }

  // ---------- khởi động ----------
  try {
    const r = await fetch('/__editor/ping');
    ctx.canSave = r.ok && (await r.json()).ok;
  } catch {
    ctx.canSave = false;
  }
  validate();
  ctx.rerender();
  if (!ctx.canSave) showBanner('Không có máy chủ dev (npm run dev) → chỉ <b>Xuất JSON</b> được, rồi tự chép file vào dự án.', 'warn');

  // bản nháp chưa lưu từ lần trước
  const raw = store.get(DRAFT_KEY);
  if (raw) {
    try {
      const d = JSON.parse(raw);
      const keys = Object.keys(d.data).filter((k) => FILES[k] && JSON.stringify(d.data[k]) !== JSON.stringify(ctx.base[k]));
      if (keys.length) {
        showBanner(`📝 Có bản nháp chưa lưu (${new Date(d.at).toLocaleString('vi-VN')}): ${keys.map((k) => FILES[k].label).join(', ')}.`, 'warn', [
          button('Khôi phục', () => {
            for (const k of keys) ctx.data[k] = d.data[k];
            setContentTable(ctx.data.content);
            ctx.changed();
            ctx.rerender();
            banner.className = 'ed-banner hidden';
          }, 'primary small'),
          button('Bỏ bản nháp', () => {
            store.set(DRAFT_KEY, null);
            banner.className = 'ed-banner hidden';
          }, 'small'),
        ]);
      }
    } catch {
      store.set(DRAFT_KEY, null);
    }
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
