// Mini-game xếp hàng vào túi.
// Luật: 🔥 món nóng và ❄️ món lạnh không được nằm sát nhau (ngang/dọc)
//       💧 món nước phải dựng đứng (bấm Xoay / phím R)
//       ⚠️ đồ dễ vỡ không được có món khác đè lên (ô phía trên)
import { traitLabel } from '../data/items.js';
import { fmt } from '../content/index.js';

export function buildPacking({ items, bag, onDone }) {
  const cols = bag.cols, rows = bag.rows;
  const slots = new Array(cols * rows).fill(-1); // chỉ số món ở mỗi ô
  const placed = items.map(() => -1); // ô của từng món
  const upright = items.map((it) => !it.has('liquid')); // món nước ban đầu bị đưa nằm nghiêng
  let selected = items.length ? 0 : -1;

  const root = document.createElement('div');
  root.className = 'packing';

  const analyze = () => {
    const mods = items.map(() => ({ upright: true, heatNeighbor: false, crushed: false }));
    const warns = [];
    items.forEach((it, i) => {
      mods[i].upright = upright[i];
      if (!upright[i] && it.has('liquid')) warns.push(fmt('pack.warnTilted', { item: it.name }));
      const c = placed[i];
      if (c < 0) return;
      const x = c % cols, y = Math.floor(c / cols);
      const near = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
        .filter(([a, b]) => a >= 0 && b >= 0 && a < cols && b < rows)
        .map(([a, b]) => slots[b * cols + a])
        .filter((j) => j >= 0);
      for (const j of near) {
        const o = items[j];
        if ((it.has('hot') && o.has('cold')) || (it.has('cold') && o.has('hot'))) {
          mods[i].heatNeighbor = true;
          if (it.has('hot')) warns.push(fmt('pack.warnHeat', { item: it.name, other: o.name }));
        }
      }
      if (it.has('fragile') && y > 0 && slots[(y - 1) * cols + x] >= 0) {
        mods[i].crushed = true;
        warns.push(fmt('pack.warnCrushed', { item: it.name, other: items[slots[(y - 1) * cols + x]].name }));
      }
    });
    return { mods, warns };
  };

  const render = () => {
    const { warns } = analyze();
    const allPlaced = placed.every((c) => c >= 0);
    const tray = items
      .map((it, i) => {
        const traits = it.def.traits.map((t) => `<span title="${traitLabel(t).text}">${traitLabel(t).icon}</span>`).join('');
        return `<button class="pk-item${selected === i ? ' sel' : ''}${placed[i] >= 0 ? ' in' : ''}" data-item="${i}">
          <span class="pk-icon" style="transform:rotate(${upright[i] ? 0 : 90}deg)">${it.icon}</span>
          <span class="pk-name">${it.name}</span><span class="pk-traits">${traits}</span>
          <span class="pk-state">${fmt(placed[i] >= 0 ? 'pack.inBag' : 'pack.notPlaced')}${it.has('liquid') ? fmt(upright[i] ? 'pack.upright' : 'pack.tilted') : ''}</span></button>`;
      })
      .join('');
    let gridHtml = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = y * cols + x;
        const i = slots[c];
        gridHtml += `<button class="pk-cell${i >= 0 ? ' full' : ''}${i >= 0 && i === selected ? ' sel' : ''}" data-cell="${c}">${i >= 0 ? `<span style="transform:rotate(${upright[i] ? 0 : 90}deg)">${items[i].icon}</span>` : ''}<small>${y === 0 ? fmt('pack.top') : y === rows - 1 ? fmt('pack.bottom') : ''}</small></button>`;
      }
    }
    root.innerHTML = `
      <div class="pk-help">${fmt('pack.help', { bag: bag.name })}</div>
      <div class="pk-wrap">
        <div class="pk-tray">${tray}</div>
        <div><div class="pk-grid" style="grid-template-columns:repeat(${cols},64px)">${gridHtml}</div>
        <div class="pk-actions"><button class="btn" data-act="rotate" ${selected < 0 || !items[selected]?.has('liquid') ? 'disabled' : ''}>${fmt('pack.rotate')}</button>
        <button class="btn primary" data-act="done" ${allPlaced ? '' : 'disabled'}>${fmt('pack.done')}</button></div></div>
      </div>
      <div class="pk-warns">${warns.length ? warns.map((w) => `<div>${w}</div>`).join('') : allPlaced ? `<div class="ok">${fmt('pack.ok')}</div>` : ''}</div>`;
    root.querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => { selected = Number(b.dataset.item); render(); }));
    root.querySelectorAll('[data-cell]').forEach((b) => b.addEventListener('click', () => clickCell(Number(b.dataset.cell))));
    root.querySelector('[data-act="rotate"]').addEventListener('click', rotate);
    root.querySelector('[data-act="done"]').addEventListener('click', done);
  };

  const clickCell = (c) => {
    const occ = slots[c];
    // bấm vào ô chứa chính món đang chọn (hoặc chưa chọn gì) → chọn món ở ô đó
    if (selected < 0 || occ === selected) {
      if (occ >= 0) selected = occ;
      render();
      return;
    }
    const from = placed[selected]; // ô cũ của món đang chọn (−1 nếu chưa xếp)
    if (occ >= 0) {
      // ô đã có món khác → đổi chỗ 2 món
      if (from >= 0) {
        slots[from] = occ;
        placed[occ] = from;
      } else placed[occ] = -1;
    } else if (from >= 0) slots[from] = -1;
    slots[c] = selected;
    placed[selected] = c;
    const next = placed.findIndex((p) => p < 0);
    if (next >= 0) selected = next;
    render();
  };

  const rotate = () => {
    if (selected < 0 || !items[selected].has('liquid')) return;
    upright[selected] = !upright[selected];
    render();
  };

  const done = () => {
    if (!placed.every((c) => c >= 0)) return;
    window.removeEventListener('keydown', onKey, true);
    onDone(analyze().mods);
  };

  const onKey = (e) => {
    if (e.code === 'KeyR') rotate();
    if (e.code === 'Enter') done();
  };
  window.addEventListener('keydown', onKey, true);
  render();
  return root;
}
