// Thẻ CHỮ & HỘI THOẠI: mọi chữ hiển thị trong game (src/content/vi.json).
// Lọc theo nhóm, tìm theo khóa hoặc nội dung, xem trước với tham số mẫu,
// kiểm tra tham số {x} và thẻ HTML. Không thêm/xóa khóa (code đang dùng chúng).
import { el, field, areaInput, button, checkInput } from './ui.js';
import { paramsIn } from '../../data/validate.js';

const GROUPS = {
  screen: 'Màn hình chính & kết thúc',
  toast: 'Thông báo nổi',
  dlg: 'Hội thoại chung',
  npc: 'Lời NPC theo địa điểm',
  ped: 'Người đi đường',
  comment: 'Bình luận của khách',
  chat: 'Nhóm chat shipper',
  goal: 'Thanh chỉ đường',
  obj: 'Mục tiêu trong ngày',
  act: 'Nút tương tác (E / F)',
  receipt: 'Hóa đơn',
  phone: 'Điện thoại GoShip',
  hud: 'HUD',
  pack: 'Mini-game xếp túi',
  state: 'Trạng thái đơn',
  cancel: 'Lý do hủy đơn',
  trait: 'Đặc tính món',
  dmg: 'Lý do hỏng hàng',
  status: 'Tâm trạng khách xe ôm',
  pen: 'Phạt sao',
  money: 'Nhóm thu / chi',
  gs: 'Thông báo mua bán',
  end: 'Lý do thắng / thua',
  forecast: 'Dự báo thời tiết',
  addr: 'Mẫu địa chỉ',
  modal: 'Hộp thoại',
  outfit: 'Trang phục',
};

// Giá trị mẫu để xem trước
const SAMPLE = {
  customer: 'Chị Lan', place: 'Phở Bà Tư', address: '95 Lê Lợi', rent: 400, k: 25, min: 8, day: 1, id: 3,
  what: 'lấy hàng ở <b>Phở Bà Tư</b>', name: 'Túi giữ nhiệt', item: 'Phở bò', other: 'Kem dừa', bag: 'Túi giữ nhiệt',
  cost: 35, phys: 45, mental: 30, money: '120k', liters: '0.08', km: '2.40', floor: 7, fee: 5, calls: 1, cash: 300,
  fine: 150, n: 3, rating: '4.75', kmh: 42, hp: 80, susp: 20, fuel: 3.5, desc: 'Xe ông nội để lại.', time: '14:30',
  roads: 'Hai Bà Trưng', reason: 'Khách không nghe máy', msg: 'Đã mua Áo mưa', text: 'Đến Tạp hóa Cô Ba hỏi về nhà cổng xanh',
  hint: 'Xuống xe trước cửa rồi bấm E', forecast: 'Dự báo hôm nay: nắng gắt 11:00–15:00, mưa to 14:30–16:00.',
  rains: 'mưa to 14:30–16:00', from: '14:30', to: '16:00', goal: 5, limit: 4, pct: 20, allowed: 45, sec: 20,
  street: 'Lê Lợi', number: 95, npc: 'Cô Hai', left: '12 phút', error: 'WebGL không khả dụng', price: 120, sub: '',
  forecastText: '',
  worn: '👕 Áo thun xanh lá · 👖 Quần jean · ⛑️ Mũ bảo hiểm xanh lá', slot: 'Áo',
  kmh: 40, stars: 2, type: 'Giao hàng', cod: 450, refund: 450, icon: '📦', booker: 'Chị Lan',
};

const fill = (s, extra) => String(s).replace(/\{(\w+)\}/g, (m, k) => (extra[k] ?? SAMPLE[k]) !== undefined ? `<mark>${extra[k] ?? SAMPLE[k]}</mark>` : `<mark class="bad">{${k}}</mark>`);

export function render(root, ctx) {
  const content = ctx.data.content;
  const base = ctx.base.content;
  const sel = ctx.sel.text;
  sel.group = sel.group ?? '';
  sel.search = sel.search ?? '';
  const groupOf = (k) => k.split('.')[0];
  const counts = {};
  for (const k of Object.keys(content)) counts[groupOf(k)] = (counts[groupOf(k)] || 0) + 1;
  const editedKeys = () => Object.keys(content).filter((k) => JSON.stringify(content[k]) !== JSON.stringify(base[k]));

  // --- cột trái: nhóm ---
  const side = el('aside', { class: 'ed-side' });
  const drawSide = () => {
    side.innerHTML = '';
    const issueKeys = new Set(ctx.issues.filter((i) => i.tab === 'text').map((i) => i.ref));
    const groupRow = (g, label, n) => {
      const hasIssue = [...issueKeys].some((k) => !g || groupOf(k) === g);
      return el('button', { class: `side-row${sel.group === g ? ' on' : ''}`, type: 'button', onclick: () => { sel.group = g; drawSide(); drawList(); } },
        el('span', { class: 'sr-main' }, el('b', {}, label), el('small', {}, `${n} câu`)), hasIssue ? el('span', { class: 'dot warn' }) : null);
    };
    side.append(
      el('div', { class: 'side-head' }, el('b', {}, `Kho chữ (${Object.keys(content).length} khóa)`)),
      el('div', { class: 'side-list' },
        groupRow('', 'Tất cả', Object.keys(content).length),
        Object.keys(GROUPS).filter((g) => counts[g]).map((g) => groupRow(g, GROUPS[g], counts[g])),
        Object.keys(counts).filter((g) => !GROUPS[g]).map((g) => groupRow(g, g, counts[g]))),
    );
  };
  ctx.refreshSide = () => {
    drawSide();
    editedInfo.textContent = `${editedKeys().length} câu đã sửa (chưa lưu)`;
  };

  // --- cột phải: tìm + danh sách ---
  const body = el('section', { class: 'ed-body' });
  const search = el('input', { type: 'search', placeholder: '🔎 Tìm theo khóa hoặc nội dung… (vd: Cô Hai, toast.rain)', value: sel.search, class: 'search' });
  const editedInfo = el('small', { class: 'muted' }, `${editedKeys().length} câu đã sửa (chưa lưu)`);
  const onlyEdited = checkInput(!!sel.onlyEdited, (v) => { sel.onlyEdited = v; drawList(); }, 'Chỉ câu đã sửa');
  const onlyIssues = checkInput(!!sel.onlyIssues, (v) => { sel.onlyIssues = v; drawList(); }, 'Chỉ câu có lỗi/cảnh báo');
  const listBox = el('div', { class: 'text-list' });
  let timer = 0;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { sel.search = search.value; drawList(); }, 150);
  });
  body.append(
    el('div', { class: 'text-tools' }, search, onlyEdited, onlyIssues, editedInfo),
    el('p', { class: 'muted' }, 'Dùng được HTML đơn giản: <b>đậm</b>, <i>nghiêng</i>, <small>nhỏ</small>, <br> xuống dòng. {tên} là tham số game tự điền — chỉ dùng những tham số có sẵn của câu đó.'),
    listBox,
  );

  function drawList() {
    listBox.innerHTML = '';
    const q = sel.search.trim().toLowerCase();
    const issueByKey = new Map();
    for (const i of ctx.issues) if (i.tab === 'text') issueByKey.set(i.ref, [...(issueByKey.get(i.ref) || []), i]);
    const keys = Object.keys(content).filter((k) => {
      if (sel.group && groupOf(k) !== sel.group) return false;
      if (sel.onlyEdited && JSON.stringify(content[k]) === JSON.stringify(base[k])) return false;
      if (sel.onlyIssues && !issueByKey.has(k)) return false;
      if (!q) return true;
      const v = Array.isArray(content[k]) ? content[k].join('\n') : content[k];
      return k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q);
    });
    if (!keys.length) listBox.append(el('p', { class: 'muted' }, 'Không có câu nào khớp.'));
    const LIMIT = 150;
    for (const k of keys.slice(0, LIMIT)) listBox.append(entry(k));
    if (keys.length > LIMIT) listBox.append(el('p', { class: 'muted' }, `… còn ${keys.length - LIMIT} câu nữa — gõ tìm kiếm hoặc chọn nhóm để thu hẹp.`));
    ctx.applyFieldIssues();
  }

  function entry(k) {
    const isList = Array.isArray(base[k] ?? content[k]);
    const allowed = [...paramsIn(base[k] ?? content[k])];
    const preview = el('div', { class: 'tx-preview' });
    const drawPreview = () => {
      const v = content[k];
      preview.innerHTML = isList ? (v || []).map((s) => `<div>• ${fill(s, {})}</div>`).join('') : fill(v, {});
    };
    const input = areaInput(isList ? (content[k] || []).join('\n') : content[k], (v) => {
      content[k] = isList ? v.split('\n').filter((s) => s.trim()) : v;
      drawPreview();
      card.classList.toggle('edited', JSON.stringify(content[k]) !== JSON.stringify(base[k]));
      ctx.changed('content');
    }, isList ? Math.min(8, (content[k] || []).length + 1) : 1);
    const reset = button('↺', () => {
      content[k] = JSON.parse(JSON.stringify(base[k]));
      ctx.changed('content');
      card.replaceWith(entry(k));
      ctx.applyFieldIssues();
    }, 'small');
    reset.title = 'Trả về bản đã lưu';
    const card = el(
      'div',
      { class: `tx${JSON.stringify(content[k]) !== JSON.stringify(base[k]) ? ' edited' : ''}` },
      el('div', { class: 'tx-head' },
        el('code', {}, k),
        isList ? el('span', { class: 'pill' }, 'Danh sách · mỗi dòng 1 câu') : null,
        allowed.length ? el('span', { class: 'params' }, allowed.map((p) => el('span', { class: 'param', title: 'Tham số game tự điền — bấm để chèn', onclick: () => insertAt(input, `{${p}}`) }, `{${p}}`))) : null,
        k in base ? reset : null),
      field('', input, { ref: k, fieldKey: 'text', wide: true }),
      preview,
    );
    drawPreview();
    return card;
  }

  function insertAt(area, text) {
    const s = area.selectionStart ?? area.value.length, e = area.selectionEnd ?? s;
    area.value = area.value.slice(0, s) + text + area.value.slice(e);
    area.selectionStart = area.selectionEnd = s + text.length;
    area.dispatchEvent(new Event('input'));
    area.focus();
  }

  drawSide();
  root.append(el('div', { class: 'ed-split' }, side, body));
  drawList();
}
