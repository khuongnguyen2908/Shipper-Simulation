// Nối thao tác danh sách (ops.js) với giao diện: hỏi lại trước khi xóa, báo kết quả, clipboard, menu ⋯ / chuột phải.
// Mỗi thao tác là MỘT bước hoàn tác (ctx.historyBreak trước và sau).
import { KINDS, duplicate, makeClip, makeActivityClip, parseClip, paste, remove, removeInfo, currentEntry, pasteKindFor, uniqueId } from './ops.js';
import { CHANGEABLE_KINDS } from './placeKind.js';
import { button, openMenu } from './ui.js';

const CLIP_KEY = 'shipper-editor-clip';
const TAB_NAME = { items: '🍜 Vật phẩm', gear: '🛵 Xe · Túi · Đồ dùng', places: '🏪 Địa điểm', app: '📱 App & Đơn' };
const label = (kind) => (kind === 'activity' ? 'hoạt động' : KINDS[kind]?.label || kind);
const where = (kind) => (kind === 'activity' ? `${TAB_NAME.places} → một địa điểm → Hoạt động` : `${TAB_NAME[KINDS[kind].tab]}${KINDS[kind].tab === 'gear' || KINDS[kind].tab === 'app' ? ` (nhóm ${label(kind)})` : ''}`);

// Bộ nhớ sao chép: giữ trong trình duyệt + chép ra clipboard của máy (dán được ở máy khác / editor online)
export function readClip() {
  try {
    return parseClip(localStorage.getItem(CLIP_KEY));
  } catch {
    return null;
  }
}
function writeClip(clip) {
  const text = JSON.stringify(clip);
  try { localStorage.setItem(CLIP_KEY, text); } catch { /* chế độ riêng tư */ }
  try { navigator.clipboard?.writeText(text).catch(() => {}); } catch { /* trình duyệt không cho */ }
}

function finish(ctx, kind, r, msg) {
  for (const f of r.files) ctx.changed(f);
  ctx.historyBreak();
  ctx.select(KINDS[kind].tab, KINDS[kind].sel(r.id));
  ctx.notify(msg, 'ok', true);
}

export function doDuplicate(ctx, kind, id) {
  ctx.historyBreak();
  const r = duplicate(ctx.data, kind, id);
  if (r.error) return ctx.notify(`⚠️ ${r.error}`, 'warn', true);
  finish(ctx, kind, r, `📄 Đã nhân bản → <b>${r.id}</b>${r.where ? ` (${r.where})` : ''}. Hoàn tác: Ctrl+Z.`);
}

export function doCopy(ctx, kind, id) {
  const clip = makeClip(ctx.data, kind, id);
  if (!clip) return;
  writeClip(clip);
  ctx.notify(`📋 Đã sao chép ${label(kind)} <b>${id}</b>. Dán (Ctrl+V hoặc ⋯ → Dán) ở ${where(kind)} — dán được cả ở máy khác / editor online.`, 'ok', true);
}

export function doPaste(ctx, clip) {
  if (!clip) return ctx.notify('📥 Chưa có gì để dán. Sao chép một mục trước (⋯ → Sao chép, hoặc Ctrl+C).', 'warn', true);
  if (clip.kind === 'activity') {
    const cur = currentEntry(ctx.tab, ctx.sel[ctx.tab]);
    if (cur?.kind === 'places') return doPasteActivity(ctx, cur.id, clip);
    return ctx.notify(`Đang sao chép một hoạt động — mở ${where('activity')} rồi dán.`, 'warn', true);
  }
  const want = pasteKindFor(ctx.tab, ctx.sel[ctx.tab]);
  if (want !== clip.kind) return ctx.notify(`Đang sao chép ${label(clip.kind)} "${clip.data.name || clip.data.id}" — sang ${where(clip.kind)} để dán.`, 'warn', true);
  ctx.historyBreak();
  const cur = currentEntry(ctx.tab, ctx.sel[ctx.tab]);
  const r = paste(ctx.data, clip, cur && cur.kind === clip.kind ? cur.id : null);
  if (r.error) return ctx.notify(`⚠️ ${r.error}`, 'warn', true);
  finish(ctx, clip.kind, r, `📥 Đã dán → <b>${r.id}</b>${r.where ? ` (${r.where})` : ''}.${r.dropped.length ? ` Bỏ tham chiếu không có ở đây: ${r.dropped.join(', ')}.` : ''} Hoàn tác: Ctrl+Z.`);
}

export function doRemove(ctx, kind, id) {
  const info = removeInfo(ctx.data, kind, id);
  if (info.error) return ctx.notify(`⚠️ ${info.error}`, 'warn', true);
  if (!confirm(`Xóa ${label(kind)} "${info.name}"?${info.notes.length ? `\n${info.notes.join('\n')}` : ''}\n\n(Lỡ tay thì bấm ↶ Hoàn tác hoặc Ctrl+Z)`)) return;
  ctx.historyBreak();
  const r = remove(ctx.data, ctx.base, kind, id);
  for (const f of r.files) ctx.changed(f);
  ctx.historyBreak();
  ctx.select(KINDS[kind].tab, KINDS[kind].sel(null));
  ctx.notify(`🗑 Đã xóa "${info.name}". Bấm ↶ Hoàn tác (Ctrl+Z) để lấy lại.`, 'ok', true);
}

// ---------- hoạt động trong một địa điểm ----------
const actsOf = (ctx, placeId) => ctx.data.places.places.find((p) => p.id === placeId);
export function doDuplicateActivity(ctx, placeId, i) {
  const p = actsOf(ctx, placeId);
  const src = p?.activities?.[i];
  if (!src) return;
  ctx.historyBreak();
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uniqueId(src.id, (x) => p.activities.some((a) => a.id === x));
  copy.label = `${src.label} (bản sao)`;
  p.activities.splice(i + 1, 0, copy);
  ctx.changed('places');
  ctx.historyBreak();
  ctx.rerender();
  ctx.notify(`📄 Đã nhân bản hoạt động → <b>${copy.id}</b>.`, 'ok', true);
}
export function doCopyActivity(ctx, act) {
  writeClip(makeActivityClip(act));
  ctx.notify(`📋 Đã sao chép hoạt động "${act.label}". Mở địa điểm khác → 📥 Dán hoạt động (hoặc Ctrl+V).`, 'ok', true);
}
export function doPasteActivity(ctx, placeId, clip = readClip()) {
  if (!clip || clip.kind !== 'activity') return ctx.notify('📥 Chưa sao chép hoạt động nào (nút 📋 trên thẻ hoạt động).', 'warn', true);
  const p = actsOf(ctx, placeId);
  if (!p) return;
  ctx.historyBreak();
  const act = JSON.parse(JSON.stringify(clip.data));
  act.id = (p.activities || []).some((a) => a.id === act.id) ? uniqueId(act.id, (x) => p.activities.some((a) => a.id === x)) : act.id;
  let note = '';
  if (act.needs && !ctx.data.goods[act.needs.id]) { note = ` Bỏ "cần đồ ${act.needs.id}" (không có ở đây).`; delete act.needs; }
  (p.activities = p.activities || []).push(act);
  ctx.changed('places');
  ctx.historyBreak();
  ctx.rerender();
  ctx.notify(`📥 Đã dán hoạt động "${act.label}" vào ${p.name}.${note}`, 'ok', true);
}

// ---------- nút & menu dùng ở các thẻ ----------
// Menu ⋯ / chuột phải của một dòng trong danh sách bên trái
export function rowMenu(ctx, kind) {
  return (id) => {
    const K = KINDS[kind];
    const locked = (K.lock || []).includes(id);
    const p = kind === 'places' ? ctx.data.places.places.find((x) => x.id === id) : null;
    const noDup = p && !CHANGEABLE_KINDS.includes(p.kind);
    const clip = readClip();
    return [
      { label: '📄 Nhân bản', kbd: 'Ctrl+D', disabled: noDup, hint: noDup ? 'Địa điểm gắn cốt truyện chỉ có một' : null, onClick: () => doDuplicate(ctx, kind, id) },
      { label: '📋 Sao chép', kbd: 'Ctrl+C', onClick: () => doCopy(ctx, kind, id) },
      { label: '📥 Dán', kbd: 'Ctrl+V', disabled: !clip || clip.kind !== kind, hint: clip ? `Đang có ${label(clip.kind)} "${clip.data.name || clip.data.id}"` : 'Chưa sao chép gì', onClick: () => doPaste(ctx, readClip()) },
      null,
      { label: '🗑 Xóa', kbd: 'Delete', danger: true, disabled: locked, hint: locked ? 'Gắn với code / cốt truyện' : null, onClick: () => doRemove(ctx, kind, id) },
    ];
  };
}

// Nút "＋ Thêm ▾" ở đầu danh sách: các cách thêm mới + Dán mục đã sao chép
// adds: [[nhãn, hàm], …]
export function addButton(ctx, kind, adds) {
  const b = button('＋ Thêm ▾', () => {
    const clip = readClip();
    const ok = clip && clip.kind === kind;
    const r = b.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [
      ...adds.map(([lbl, fn]) => ({ label: lbl, onClick: fn })),
      null,
      { label: ok ? `📥 Dán "${clip.data.name || clip.data.id}"` : '📥 Dán', kbd: 'Ctrl+V', disabled: !ok, hint: ok ? '' : 'Chưa sao chép mục loại này (⋯ → Sao chép)', onClick: () => doPaste(ctx, readClip()) },
    ]);
  }, 'small primary');
  return b;
}

// Nút ở đầu trang của mục đang mở: Nhân bản · Sao chép (nút Xóa giữ ở chỗ cũ, gọi doRemove)
export function entryButtons(ctx, kind, id) {
  const p = kind === 'places' ? ctx.data.places.places.find((x) => x.id === id) : null;
  const out = [];
  if (!p || CHANGEABLE_KINDS.includes(p.kind)) out.push(button('📄 Nhân bản', () => doDuplicate(ctx, kind, id), 'small'));
  out.push(button('📋 Sao chép', () => doCopy(ctx, kind, id), 'small'));
  return out;
}
