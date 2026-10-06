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
export function field(label, input, { hint, ref = '', fieldKey = '', cat = '', wide = false } = {}) {
  return el(
    'div',
    { class: `fld${wide ? ' wide' : ''}`, 'data-ref': ref, 'data-field': fieldKey, 'data-cat': cat },
    el('span', { class: 'fld-l' }, label),
    input,
    hint ? el('small', { class: 'fld-h' }, hint) : null,
    el('div', { class: 'fld-msg' }),
  );
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
export function sideList(rows, selected, onPick, { issuesFor, onReorder } = {}) {
  const list = el(
    'div',
    { class: 'side-list' },
    rows.map((r) => {
      const iss = issuesFor ? issuesFor(r.id) : [];
      const err = iss.some((i) => i.level === 'error'), warn = iss.length && !err;
      const sortable = onReorder && !r.fixed;
      return el(
        'button',
        { class: `side-row${r.id === selected ? ' on' : ''}`, type: 'button', 'data-sort': sortable ? '' : null, onclick: () => onPick(r.id) },
        sortable ? dragHandle() : null,
        el('span', { class: 'sr-icon' }, r.icon || '•'),
        el('span', { class: 'sr-main' }, el('b', {}, r.title), el('small', {}, r.sub || '')),
        err ? el('span', { class: 'dot err', title: 'Có lỗi' }) : warn ? el('span', { class: 'dot warn', title: 'Có cảnh báo' }) : null,
      );
    }),
  );
  if (onReorder) makeSortable(list, '.side-row[data-sort]', onReorder);
  return list;
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

export const clone = (o) => JSON.parse(JSON.stringify(o));
