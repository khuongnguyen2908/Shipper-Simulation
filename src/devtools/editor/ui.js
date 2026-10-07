// Hàm dựng giao diện nhỏ gọn cho công cụ nội dung (không dùng framework)
import { searchEmoji } from './emoji.js';

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

// Một dòng nhập liệu có nhãn, gợi ý và chỗ hiện lỗi.
// ref/field/cat dùng để gắn lỗi từ src/data/validate.js vào đúng ô.
// Ghi chú thu vào nút ⓘ cạnh tên ô (rê chuột / bấm để xem); bật "Hiện ghi chú" ở thanh trên thì hiện hết như cũ.
export function field(label, input, { hint, ref = '', fieldKey = '', cat = '', wide = false } = {}) {
  const tip = hint ? el('span', { class: 'fld-i', tabindex: 0, title: '', onclick: (e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.closest('.fld').classList.toggle('tip-on'); } }, 'ⓘ') : null;
  return el(
    'div',
    { class: `fld${wide ? ' wide' : ''}`, 'data-ref': ref, 'data-field': fieldKey, 'data-cat': cat },
    label || tip ? el('span', { class: 'fld-l' }, label, tip) : null,
    input,
    hint ? el('small', { class: 'fld-h' }, hint) : null,
    el('div', { class: 'fld-msg' }),
  );
}

// ---------- thẻ con: chia trang dài thành nhiều phần, mỗi lúc chỉ hiện một phần ----------
// key: loại trang (vd 'place') → nhớ phần đang mở khi chuyển mục / F5.
// defs: [[mã, nhãn], …]. Dùng: const t = subTabs('place', defs); t.pane('npc').append(…); body.append(t.el); t.done();
const SUB_KEY = 'shipper-editor-sub';
const subOpen = (() => {
  try {
    return JSON.parse(localStorage.getItem(SUB_KEY) || '{}') || {};
  } catch {
    return {};
  }
})();
export function subTabs(key, defs) {
  const bar = el('div', { class: 'subtabs', role: 'tablist' });
  const panes = {};
  const btns = {};
  for (const [id, label] of defs) {
    panes[id] = el('div', { class: 'sec-pane', 'data-sec': id });
    btns[id] = el('button', { type: 'button', class: 'subtab', onclick: () => show(id) }, label, el('i', { class: 'sub-dot' }));
    bar.append(btns[id]);
  }
  const wrap = el('div', { class: 'subtabs-wrap' }, bar, Object.values(panes));
  wrap.showSec = (id) => show(id);
  function show(id) {
    if (!panes[id] || btns[id].hidden) id = defs.map(([d]) => d).find((d) => !btns[d].hidden) || id;
    for (const [d] of defs) {
      panes[d].hidden = d !== id;
      btns[d].classList.toggle('on', d === id);
    }
    subOpen[key] = id;
    try {
      localStorage.setItem(SUB_KEY, JSON.stringify(subOpen));
    } catch {
      /* chế độ riêng tư */
    }
  }
  return {
    el: wrap,
    pane: (id) => panes[id],
    // gọi sau khi đổ nội dung: ẩn phần rỗng, mở phần đã nhớ
    done() {
      for (const [d] of defs) btns[d].hidden = !panes[d].childNodes.length;
      show(subOpen[key] || defs[0][0]);
    },
  };
}
// Đánh dấu chấm đỏ / vàng trên thẻ con có ô lỗi / cảnh báo (gọi sau khi gắn lỗi vào ô)
export function markSubTabs(root) {
  root.querySelectorAll('.subtabs-wrap').forEach((w) => {
    const bar = w.querySelector(':scope > .subtabs');
    w.querySelectorAll(':scope > .sec-pane').forEach((pane, i) => {
      const btn = bar.children[i];
      btn.classList.toggle('has-err', !!pane.querySelector('.fld.has-err'));
      btn.classList.toggle('has-warn', !pane.querySelector('.fld.has-err') && !!pane.querySelector('.fld.has-warn'));
    });
  });
}
// Mở đúng thẻ con / mục "Nâng cao" đang chứa một ô (để nhảy tới chỗ lỗi)
export function revealField(fld) {
  for (let n = fld; n; n = n.parentElement) {
    if (n.tagName === 'DETAILS') n.open = true;
    if (n.classList?.contains('sec-pane')) n.parentElement.showSec?.(n.dataset.sec);
  }
}

// Mục "⚙️ Nâng cao": ô ít khi sửa, mặc định thu gọn (nhớ trạng thái mở khi trang vẽ lại)
export function advanced(title, ...children) {
  const d = el('details', { class: 'adv', open: openExplain.has(`adv:${title}`) }, el('summary', {}, `⚙️ ${title}`), el('div', { class: 'grid tight' }, children));
  d.addEventListener('toggle', () => (d.open ? openExplain.add(`adv:${title}`) : openExplain.delete(`adv:${title}`)));
  return d;
}

export function textInput(value, onInput, attrs = {}) {
  return el('input', { type: 'text', value: value ?? '', ...attrs, oninput: (e) => onInput(e.target.value) });
}

// scale: hệ số hiển thị (vd. 3.6 để hiện km/h, 100 để hiện %)
export function numInput(value, onInput, { step = 'any', min, max, scale = 1, digits } = {}) {
  const shown = typeof value === 'number' && Number.isFinite(value) ? +(value * scale).toFixed(digits ?? 4) : '';
  return el('input', {
    type: 'number',
    value: shown,
    step,
    min,
    max,
    oninput: (e) => {
      const v = e.target.value === '' ? NaN : Number(e.target.value) / scale;
      onInput(Number.isFinite(v) ? +v.toFixed(6) : NaN);
    },
  });
}

// Ô biểu tượng: gõ/dán emoji, hoặc bấm 😀 để chọn trong bảng (có ô tìm tiếng Việt)
export function emojiInput(value, onInput, attrs = {}) {
  const input = textInput(value, onInput, { ...attrs, class: 'emoji' });
  const wrap = el('span', { class: 'emoji-in' }, input);
  let pop = null;
  const close = () => {
    if (!pop) return;
    pop.remove();
    pop = null;
    removeEventListener('pointerdown', outside, true);
    removeEventListener('keydown', esc, true);
  };
  const outside = (e) => { if (!wrap.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const choose = (em) => {
    input.value = em;
    onInput(em);
    close();
    input.focus();
  };
  const open = () => {
    document.querySelectorAll('.emoji-pop').forEach((x) => x.dispatchEvent(new Event('close')));
    const search = el('input', { type: 'search', placeholder: 'Tìm: phở, sách, karaoke, xăng…' });
    const grid = el('div', { class: 'emoji-grid' });
    const draw = () => {
      grid.innerHTML = '';
      const groups = searchEmoji(search.value);
      if (!groups.length) grid.append(el('small', { class: 'muted' }, 'Không thấy. Thử từ khác, hoặc nhấn phím Windows + . để mở bảng emoji của Windows.'));
      for (const [name, list] of groups) {
        grid.append(el('b', {}, name), el('div', { class: 'emoji-row' }, list.map(([em, kw]) => el('button', { type: 'button', class: `emoji-btn${em === input.value ? ' on' : ''}`, title: kw, onclick: () => choose(em) }, em))));
      }
    };
    search.addEventListener('input', draw);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = grid.querySelector('.emoji-btn'); if (first) first.click(); } });
    pop = el('div', { class: 'emoji-pop' }, search, grid, el('small', { class: 'muted' }, 'Bấm để chọn · Enter chọn kết quả đầu · Esc đóng'));
    pop.addEventListener('close', close);
    draw();
    wrap.append(pop);
    addEventListener('pointerdown', outside, true);
    addEventListener('keydown', esc, true);
    search.focus();
  };
  wrap.append(el('button', { type: 'button', class: 'btn small emoji-open', title: 'Chọn biểu tượng', onclick: () => (pop ? close() : open()) }, '😀 Chọn'));
  return wrap;
}

export function colorInput(value, onInput) {
  const wrap = el('span', { class: 'color-in' });
  const pick = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#888888' });
  const txt = el('input', { type: 'text', value: value || '', maxlength: 7, class: 'mono' });
  pick.addEventListener('input', () => {
    txt.value = pick.value;
    onInput(pick.value);
  });
  txt.addEventListener('input', () => {
    if (/^#[0-9a-f]{6}$/i.test(txt.value)) pick.value = txt.value;
    onInput(txt.value);
  });
  wrap.append(pick, txt);
  return wrap;
}

export function selectInput(value, options, onChange) {
  const s = el('select', { onchange: (e) => onChange(e.target.value) }, options.map(([v, label]) => el('option', { value: v, selected: String(v) === String(value) }, label)));
  return s;
}

export function checkInput(checked, onChange, label) {
  return el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!checked, onchange: (e) => onChange(e.target.checked) }), label);
}

export function areaInput(value, onInput, rows = 2) {
  const a = el('textarea', { rows, oninput: (e) => { autoGrow(a); onInput(e.target.value); } });
  a.value = value ?? '';
  requestAnimationFrame(() => autoGrow(a));
  return a;
}

export function autoGrow(a) {
  a.style.height = 'auto';
  a.style.height = `${a.scrollHeight + 2}px`;
}

export function button(label, onClick, cls = '') {
  return el('button', { class: `btn ${cls}`, type: 'button', onclick: onClick }, label);
}

// Danh sách chọn bên trái (dùng chung cho các thẻ)
// onReorder(from, to): có thì mỗi dòng có tay nắm ⠿ để kéo đổi thứ tự; dòng r.fixed đứng yên ở đầu
// menu(id): có thì mỗi dòng có nút ⋯ (và chuột phải) mở menu thao tác [{ label, onClick, disabled, danger }]
// Danh sách dài (> 8 dòng) có ô tìm ở trên: lọc theo tên / mã / dòng phụ, không phân biệt dấu. Đang lọc thì tắt kéo thả.
const listQuery = new Map(); // chữ đang tìm của từng danh sách (giữ khi vẽ lại)
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
export function sideList(rows, selected, onPick, opts = {}) {
  const list = sideRows(rows, selected, onPick, opts);
  if (rows.length <= 8) return list;
  const key = opts.key || rows.find((r) => !r.fixed)?.id || 'list';
  const q = el('input', { type: 'search', class: 'side-search', placeholder: '🔎 Tìm…', value: listQuery.get(key) || '' });
  const apply = () => {
    const words = fold(q.value).split(/\s+/).filter(Boolean);
    listQuery.set(key, q.value);
    list.classList.toggle('filtering', words.length > 0);
    list.querySelectorAll('.side-row').forEach((row) => {
      const hay = fold(row.dataset.find);
      row.hidden = !words.every((w) => hay.includes(w));
    });
  };
  q.addEventListener('input', apply);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { q.value = ''; apply(); }
    if (e.key === 'Enter') list.querySelector('.side-row:not([hidden])')?.click();
  });
  apply();
  return el('div', { class: 'side-wrap' }, q, list);
}

function sideRows(rows, selected, onPick, { issuesFor, onReorder, menu } = {}) {
  const list = el(
    'div',
    { class: 'side-list' },
    rows.map((r) => {
      const iss = issuesFor ? issuesFor(r.id) : [];
      const err = iss.some((i) => i.level === 'error'), warn = iss.length && !err;
      const sortable = onReorder && !r.fixed;
      const hasMenu = menu && !r.fixed;
      const row = el(
        'button',
        { class: `side-row${r.id === selected ? ' on' : ''}`, type: 'button', 'data-sort': sortable ? '' : null, 'data-find': `${r.title} ${r.sub || ''} ${r.id}`, onclick: () => onPick(r.id) },
        sortable ? dragHandle() : null,
        el('span', { class: 'sr-icon' }, r.icon || '•'),
        el('span', { class: 'sr-main' }, el('b', {}, r.title), el('small', {}, r.sub || '')),
        err ? el('span', { class: 'dot err', title: 'Có lỗi' }) : warn ? el('span', { class: 'dot warn', title: 'Có cảnh báo' }) : null,
        hasMenu ? el('span', { class: 'sr-more', title: 'Thao tác (hoặc chuột phải)', onclick: (e) => { e.preventDefault(); e.stopPropagation(); const b = e.currentTarget.getBoundingClientRect(); openMenu(b.right, b.bottom, menu(r.id)); } }, '⋯') : null,
      );
      if (hasMenu) row.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, menu(r.id)); });
      return row;
    }),
  );
  if (onReorder) makeSortable(list, '.side-row[data-sort]', onReorder);
  return list;
}

// Menu nổi (nút ⋯ / chuột phải). items: [{ label, kbd, onClick, disabled, danger, hint }] — mục null = vạch ngăn
let openPop = null;
export function openMenu(x, y, items) {
  openPop?.remove();
  const pop = el('div', { class: 'ctx-menu', role: 'menu' }, items.map((it) => (it
    ? el('button', { type: 'button', class: `ctx-item${it.danger ? ' danger' : ''}`, disabled: it.disabled || null, title: it.hint || null, onclick: () => { close(); it.onClick(); } }, el('span', {}, it.label), it.kbd ? el('span', { class: 'kbd' }, it.kbd) : null)
    : el('hr', {}))));
  document.body.append(pop);
  // giữ menu trong màn hình
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 4))}px`;
  pop.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 4))}px`;
  openPop = pop;
  const outside = (e) => { if (!pop.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    pop.remove();
    if (openPop === pop) openPop = null;
    removeEventListener('pointerdown', outside, true);
    removeEventListener('keydown', esc, true);
    removeEventListener('scroll', close, true);
  }
  setTimeout(() => {
    addEventListener('pointerdown', outside, true);
    addEventListener('keydown', esc, true);
    addEventListener('scroll', close, true);
  });
  pop.querySelector('.ctx-item:not([disabled])')?.focus();
}

// Tay nắm để kéo (bấm vào tay nắm không mở mục)
export function dragHandle() {
  return el('span', { class: 'drag-h', title: 'Giữ và kéo để đổi thứ tự', onclick: (e) => { e.preventDefault(); e.stopPropagation(); } }, '⠿');
}

// Kéo thả bằng chuột hoặc cảm ứng: giữ tay nắm .drag-h trong một dòng rồi kéo lên/xuống.
// Dòng đi theo tay ngay khi kéo; thả ra thì gọi onMove(vịTríCũ, vịTríMới) nếu có đổi.
export function makeSortable(container, itemSelector, onMove) {
  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-h');
    const row = handle && handle.closest(itemSelector);
    if (!row || !container.contains(row) || e.button !== 0) return;
    e.preventDefault();
    const items = () => [...container.querySelectorAll(itemSelector)];
    const from = items().indexOf(row);
    // vùng đang cuộn gần nhất (cột trái, hoặc cả trang)
    let scroller = container.parentElement;
    while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
    scroller = scroller || document.scrollingElement;
    let lastY = e.clientY, raf = 0;
    row.classList.add('dragging');
    document.body.classList.add('ed-dragging');

    // đặt dòng đang kéo vào chỗ con trỏ đang chỉ
    const place = (y) => {
      for (const other of items()) {
        if (other === row) continue;
        const b = other.getBoundingClientRect();
        if (y < b.top + b.height / 2) {
          if (other.previousElementSibling !== row) other.before(row);
          return;
        }
      }
      const all = items(), last = all[all.length - 1];
      if (last !== row) last.after(row);
    };
    // gần mép trên/dưới thì tự cuộn danh sách
    const autoScroll = () => {
      const r = scroller.getBoundingClientRect();
      const head = document.querySelector('.ed-head')?.getBoundingClientRect().bottom || 0; // thanh trên cùng che mất phần đầu
      const top = Math.max(r.top, 0, scroller.contains(document.querySelector('.ed-head')) ? head : 0), bottom = Math.min(r.bottom, innerHeight);
      const d = lastY < top + 40 ? -10 : lastY > bottom - 40 ? 10 : 0;
      if (d) { scroller.scrollTop += d; place(lastY); }
      raf = requestAnimationFrame(autoScroll);
    };
    raf = requestAnimationFrame(autoScroll);

    // nghe trên cả cửa sổ: dời dòng trong trang làm trình duyệt bỏ "bắt" con trỏ của tay nắm
    const move = (ev) => { if (ev.pointerId === e.pointerId) { lastY = ev.clientY; place(lastY); } };
    const end = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      row.classList.remove('dragging');
      document.body.classList.remove('ed-dragging');
      const to = items().indexOf(row);
      if (to !== from) onMove(from, to);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  });
}

// Hộp "📖 Giải thích" bấm mở/đóng; nhớ trạng thái mở khi trang vẽ lại
const openExplain = new Set();
export function explain([title, html]) {
  const d = el('details', { class: 'explain', open: openExplain.has(title) }, el('summary', {}, `📖 ${title}`), el('div', { class: 'explain-body', html }));
  d.addEventListener('toggle', () => (d.open ? openExplain.add(title) : openExplain.delete(title)));
  return d;
}

// Ô "Mở từ ngày": 1 (hoặc trống) = có ngay từ ngày 1 → xóa trường khỏi dữ liệu cho gọn
export function openDayInput(obj, onChange, { disabled = false } = {}) {
  const inp = numInput(obj.openDay ?? 1, (v) => {
    const d = Math.round(v);
    if (!Number.isFinite(d) || d <= 1) delete obj.openDay;
    else obj.openDay = d;
    onChange();
  }, { step: 1, min: 1, max: 60 });
  inp.disabled = disabled;
  return inp;
}

export const clone = (o) => JSON.parse(JSON.stringify(o));
