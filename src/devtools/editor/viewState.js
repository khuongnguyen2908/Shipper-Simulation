// Giữ chỗ đang xem của công cụ ?editor khi vẽ lại trang hoặc tải lại (F5):
//  - vị trí cuộn của trang và của danh sách bên trái
//  - món đang chọn ở từng thẻ
// Phần tính toán ở đây là hàm thuần (chạy được trong bộ thử); đọc/ghi trình duyệt nằm ở index.js.

// "Đang xem gì": thẻ + nhóm + món. Cùng khóa = vẫn trang đó → giữ nguyên chỗ cuộn.
export function selKey(tab, sel = {}) {
  return [tab, sel.cat || '', sel.id || '', sel.group || ''].join('|');
}

// before: { key, body, side } chụp trước khi vẽ lại · nextKey: khóa sau khi vẽ lại · sameTab: cùng thẻ không
// → vị trí cuộn cần đặt lại. Đổi sang món khác: trang hiện từ đầu món mới, danh sách bên trái giữ nguyên.
export function planScroll(before, nextKey, sameTab) {
  if (!before) return { body: 0, side: 0 };
  return {
    body: before.key === nextKey ? before.body : 0,
    side: sameTab ? before.side : 0,
  };
}

// Món đang chọn để lưu lại (bỏ các tùy chọn tạm như bộ lọc xem trước)
export function selToSave(sel) {
  const out = {};
  for (const [tab, s] of Object.entries(sel || {})) {
    if (!s || typeof s !== 'object') continue;
    const keep = {};
    for (const k of ['id', 'cat', 'group', 'search']) if (typeof s[k] === 'string') keep[k] = s[k];
    out[tab] = keep;
  }
  return out;
}
