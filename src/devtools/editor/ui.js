// Hàm dựng giao diện nhỏ gọn cho công cụ nội dung (không dùng framework)

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
export function sideList(rows, selected, onPick, { issuesFor } = {}) {
  return el(
    'div',
    { class: 'side-list' },
    rows.map((r) => {
      const iss = issuesFor ? issuesFor(r.id) : [];
      const err = iss.some((i) => i.level === 'error'), warn = iss.length && !err;
      return el(
        'button',
        { class: `side-row${r.id === selected ? ' on' : ''}`, type: 'button', onclick: () => onPick(r.id) },
        el('span', { class: 'sr-icon' }, r.icon || '•'),
        el('span', { class: 'sr-main' }, el('b', {}, r.title), el('small', {}, r.sub || '')),
        err ? el('span', { class: 'dot err', title: 'Có lỗi' }) : warn ? el('span', { class: 'dot warn', title: 'Có cảnh báo' }) : null,
      );
    }),
  );
}

export const clone = (o) => JSON.parse(JSON.stringify(o));
