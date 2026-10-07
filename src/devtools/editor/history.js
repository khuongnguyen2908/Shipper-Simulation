// HOÀN TÁC / LÀM LẠI cho công cụ ?editor (thuần dữ liệu, chạy được trong bộ thử).
// Mỗi bước = các file đã đổi + nội dung trước/sau (chuỗi JSON). Thay đổi liên tiếp trong mergeMs
// (vd gõ một từ, hay một thao tác đổi nhiều file) gộp thành 1 bước; breakStep() để tách bước.

export function createHistory({ limit = 100, mergeMs = 700 } = {}) {
  return { undo: [], redo: [], mirror: {}, lastAt: 0, limit, mergeMs };
}

// Ghi nhận trạng thái hiện tại làm mốc (lúc mở editor) — không tạo bước
export function syncMirror(h, data, keys) {
  for (const k of keys) h.mirror[k] = JSON.stringify(data[k]);
}

// Gọi sau mỗi lần dữ liệu đổi. Trả về true nếu có bước mới / bước được gộp.
export function record(h, data, keys, now = Date.now()) {
  const entries = [];
  for (const k of keys) {
    const s = JSON.stringify(data[k]);
    if (s !== h.mirror[k]) {
      entries.push({ k, before: h.mirror[k], after: s });
      h.mirror[k] = s;
    }
  }
  if (!entries.length) return false;
  const top = h.undo[h.undo.length - 1];
  if (top && h.lastAt && now - h.lastAt < h.mergeMs) {
    // gộp vào bước đang mở: file đã có thì chỉ cập nhật "sau", file mới thì thêm vào
    for (const e of entries) {
      const t = top.entries.find((x) => x.k === e.k);
      if (t) t.after = e.after;
      else top.entries.push(e);
    }
  } else {
    h.undo.push({ entries });
    if (h.undo.length > h.limit) h.undo.shift();
  }
  h.lastAt = now;
  h.redo = [];
  return true;
}

// Bước tiếp theo luôn là bước mới (dùng trước/sau các thao tác như nhân bản, xóa)
export function breakStep(h) {
  h.lastAt = 0;
}

function apply(h, data, from, to, side) {
  const step = from.pop();
  if (!step) return null;
  for (const e of step.entries) {
    data[e.k] = JSON.parse(e[side]);
    h.mirror[e.k] = e[side];
  }
  to.push(step);
  h.lastAt = 0;
  return step.entries.map((e) => e.k);
}

// Trả về danh sách file vừa đổi lại (null nếu không còn gì để hoàn tác / làm lại)
export const undo = (h, data) => apply(h, data, h.undo, h.redo, 'before');
export const redo = (h, data) => apply(h, data, h.redo, h.undo, 'after');
