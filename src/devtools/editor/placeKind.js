// Đổi loại địa điểm trong công cụ ?editor (thuần dữ liệu, chạy được trong bộ thử).
// Chỉ cho đổi qua lại giữa các loại "chung" — loại gắn với cốt truyện / code gọi thẳng thì không:
//  - cafe, taphoa: nhiệm vụ chiếc ví (anh Minh đợi ở quán cà phê, Cô Ba chỉ đường) → chỉ có ở địa điểm gốc
//  - home, gate, apartment: chỉ có một, code gọi thẳng theo mã
export const CHANGEABLE_KINDS = ['restaurant', 'gas', 'shop', 'garage', 'market', 'service'];

// Biểu tượng mặc định theo loại (trùng với bản đồ) — đổi loại thì bỏ biểu tượng mặc định cũ để lấy cái mới
const DEFAULT_ICON = { home: '🏠', restaurant: '🍴', gas: '⛽', shop: '🎒', garage: '🔧', cafe: '☕', taphoa: '🛒', gate: '🟩', apartment: '🏢', market: '🧺', service: '⭐' };

// locked: địa điểm có khóa (PROTECTED) → không đổi loại được
export function canChangeKind(p, locked) {
  return !locked && CHANGEABLE_KINDS.includes(p.kind);
}

// Đổi p sang loại kind, sửa các trường đi kèm cho hợp lệ. items: danh mục món (để quán ăn mới có ít nhất 1 món).
// Trả về danh sách việc đã làm (để báo cho người dùng).
export function applyKind(p, kind, items) {
  const done = [];
  if (!CHANGEABLE_KINDS.includes(kind) || p.kind === kind) return done;
  const old = p.kind;
  p.kind = kind;
  if (p.icon && p.icon === DEFAULT_ICON[old]) {
    delete p.icon;
    done.push('icon');
  }
  if (kind === 'restaurant' && !(p.menu || []).length) {
    // quán ăn phải bán ít nhất 1 món (đồ ăn thật, không phải hàng giao / khách xe ôm)
    const first = Object.values(items || {}).find((it) => !it.parcel && !(it.traits || []).includes('passenger'));
    p.menu = first ? [first.id] : [];
    done.push('menu');
  }
  if (old === 'restaurant' && kind !== 'restaurant' && p.menu) {
    delete p.menu; // chỉ quán ăn mới có đơn đồ ăn
    done.push('menuRemoved');
  }
  return done;
}
