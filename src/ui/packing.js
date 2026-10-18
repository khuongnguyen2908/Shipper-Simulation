// Mini-game xếp hàng vào túi.
// Luật: 🔥 món nóng và ❄️ món lạnh không được nằm sát nhau (ngang/dọc)
//       💧 món nước phải dựng đứng (bấm Xoay / phím R)
//       ⚠️ đồ dễ vỡ không được có món khác đè lên (ô phía trên)
import { sound } from '../audio.js';
import { traitLabel } from '../data/items.js';
import { fmt } from '../content/index.js';

// strict: còn món xếp sai luật thì không cho bấm Xếp xong (bước xếp túi có hướng dẫn của cốt truyện)
// không strict (đơn hàng): xếp sai vẫn đi được nhưng phải bấm 2 lần ("Vẫn đi dù có món sai") — người chơi tự chịu hậu quả
// preset: [ { cell, upright } | null ] theo từng món — món đã nằm sẵn trong túi (vd bó hoa lấy lúc nãy): khóa đúng ô cũ, không dời được
// onDone(mods, { placed, upright }): xếp xong (kèm ô + dựng đứng của từng món, để lần xếp sau đặt lại đúng chỗ)
export function buildPacking({ items, bag, onDone, strict = false, preset = [] }) {
  let sure = false; // đã bấm "Xếp xong" 1 lần lúc còn món sai
  const cols = bag.cols, rows = bag.rows;
  const slots = new Array(cols * rows).fill(-1); // chỉ số món ở mỗi ô
  const placed = items.map(() => -1); // ô của từng món
  const upright = items.map((it) => !it.has('liquid')); // món nước ban đầu bị đưa nằm nghiêng
  const locked = items.map(() => false);
  preset.forEach((p, i) => {
    if (!p || !(p.cell >= 0 && p.cell < cols * rows) || slots[p.cell] >= 0) return;
    slots[p.cell] = i;
    placed[i] = p.cell;
    upright[i] = p.upright ?? upright[i];
    locked[i] = true;
  });
  let selected = locked.findIndex((l) => !l);

  const root = document.createElement('div');
  root.className = 'packing';
  // hướng dẫn xếp túi (cốt truyện) đọc trạng thái: món đang chọn, ô của từng món, món đã dựng đứng chưa
  root.packState = () => ({ items, selected, placed: [...placed], upright: [...upright] });

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
    if (!warns.length) sure = false;
    const doneOk = allPlaced && !(strict && warns.length);
    const doneLabel = fmt(warns.length && allPlaced && !strict && sure ? 'pack.doneAnyway' : 'pack.done');
    const tray = items
      .map((it, i) => {
        const traits = it.def.traits.map((t) => `<span title="${traitLabel(t).text}">${traitLabel(t).icon}</span>`).join('');
        return `<button class="pk-item${selected === i ? ' sel' : ''}${placed[i] >= 0 ? ' in' : ''}${locked[i] ? ' locked' : ''}" data-item="${i}">
          <span class="pk-icon" style="transform:rotate(${upright[i] ? 0 : 90}deg)">${it.icon}</span>
          <span class="pk-name">${it.name}</span><span class="pk-traits">${traits}</span>
          <span class="pk-state">${fmt(locked[i] ? 'pack.already' : placed[i] >= 0 ? 'pack.inBag' : 'pack.notPlaced')}${it.has('liquid') ? fmt(upright[i] ? 'pack.upright' : 'pack.tilted') : ''}</span></button>`;
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
        <div class="pk-actions"><button class="btn" data-act="rotate" ${selected < 0 || locked[selected] || !items[selected]?.has('liquid') ? 'disabled' : ''}>${fmt('pack.rotate')}</button>
        <button class="btn ${warns.length && allPlaced ? 'warn' : 'primary'}" data-act="done" ${doneOk ? '' : 'disabled'}>${doneLabel}</button></div></div>
      </div>
      <div class="pk-warns">${warns.length ? warns.map((w) => `<div>${w}</div>`).join('') : allPlaced ? `<div class="ok">${fmt('pack.ok')}</div>` : ''}</div>`;
    root.querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => { if (!locked[Number(b.dataset.item)]) { selected = Number(b.dataset.item); render(); } })); // món đã nằm sẵn: không chọn để dời
    root.querySelectorAll('[data-cell]').forEach((b) => b.addEventListener('click', () => clickCell(Number(b.dataset.cell))));
    root.querySelector('[data-act="rotate"]').addEventListener('click', rotate);
    root.querySelector('[data-act="done"]').addEventListener('click', done);
  };

  const clickCell = (c) => {
    const occ = slots[c];
    if (occ >= 0 && locked[occ]) return; // ô của món đã nằm sẵn: không đè, không đổi chỗ
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
    sound('order.pack');
    const next = placed.findIndex((p, i) => p < 0 && !locked[i]);
    if (next >= 0) selected = next;
    render();
  };

  const rotate = () => {
    if (selected < 0 || locked[selected] || !items[selected].has('liquid')) return;
    upright[selected] = !upright[selected];
    render();
  };

  const done = () => {
    if (!placed.every((c) => c >= 0)) return;
    const { warns } = analyze();
    if (warns.length && strict) return; // hướng dẫn: phải xếp đúng mới đi
    if (warns.length && !sure) { sure = true; sound('ui.warn'); return render(); } // đơn hàng: hỏi lại 1 lần
    window.removeEventListener('keydown', onKey, true);
    onDone(analyze().mods, { placed: [...placed], upright: [...upright] });
  };

  const onKey = (e) => {
    if (e.code === 'KeyR') rotate();
    if (e.code === 'Enter') done();
  };
  window.addEventListener('keydown', onKey, true);
  render();
  return root;
}
