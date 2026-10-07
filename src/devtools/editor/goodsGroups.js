// Nhóm đồ dùng trong thẻ Xe · Túi · Đồ dùng — CHỈ để xếp danh sách trong editor, tính từ dữ liệu sẵn có:
//  - theo "Loại" (dùng 1 lần / trang bị / dùng tại địa điểm / trang phục)
//  - quần áo chia 2: chỉ để mặc cho đẹp (thời trang) · có tác dụng (áo mưa, giày êm, đồng phục +boa…)
export const GOODS_GROUPS = [
  ['consumable', '🧃 Dùng 1 lần'],
  ['equipment', '🛡️ Trang bị'],
  ['wearFx', '🧥 Đồ mặc có tác dụng'],
  ['carry', '🎒 Dùng tại địa điểm'],
  ['fashion', '👕 Thời trang'],
];

// Trang bị có tên là đồ mặc → xếp chung với quần áo có tác dụng
const WEAR_RE = /áo|quần|mũ|nón|giày|dép|găng|khẩu trang|kính|vớ|tất/i;

export function goodsGroupOf(g) {
  if (g.type === 'outfit') return g.effects && Object.keys(g.effects).length ? 'wearFx' : 'fashion';
  if (g.type === 'equipment') return WEAR_RE.test(g.name || '') ? 'wearFx' : 'equipment';
  return g.type;
}
