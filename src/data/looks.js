// =============================================================
// KIỂU NHÀ của địa điểm (places.json → "look"). Chỉ là hình dáng, không đổi lối chơi.
// floors: [ít nhất, nhiều nhất] số tầng cho phép · null = hình cố định (ô "Số tầng" ẩn trong ?editor)
// Chưa chọn kiểu → tự đoán theo loại địa điểm (và tên) bằng guessLook.
// =============================================================
export const LOOKS = {
  tube: { label: 'Nhà ống thường', floors: [1, 5] },
  eatery: { label: 'Quán ăn bình dân', floors: [1, 5] },
  banhmi: { label: 'Tiệm bánh mì', floors: [1, 5] },
  cafe: { label: 'Quán cà phê', floors: null },
  hammock: { label: 'Cà phê võng', floors: null },
  modern: { label: 'Tiệm mặt kính hiện đại', floors: [1, 5] },
  pagoda: { label: 'Chùa', floors: null },
  gas: { label: 'Cây xăng', floors: null },
  repair: { label: 'Tiệm sửa xe / đồ nghề', floors: [1, 5] },
  tro: { label: 'Dãy phòng trọ', floors: [1, 3] },
  apartment: { label: 'Chung cư cũ', floors: [4, 15] },
  tower: { label: 'Tòa nhà kính (TTTM, văn phòng)', floors: [3, 15] },
  karaoke: { label: 'Karaoke', floors: [2, 6] },
  // cảnh quan (loại địa điểm "scenery"): không nhà, đi xuyên qua được — chỉ cây, ghế, hàng rào là vật cản
  park: { label: '🌳 Công viên', floors: null, scenery: true },
  emptyLot: { label: '🟫 Đất trống', floors: null, scenery: true },
  soccer: { label: '⚽ Sân bóng mini', floors: null, scenery: true },
  parkingLot: { label: '🅿️ Bãi giữ xe', floors: null, scenery: true },
  construction: { label: '🏗️ Công trình đang xây', floors: null, scenery: true },
  pagodaCourtyard: { label: '🛕 Chùa tứ hợp viện (cả khối)', floors: null },
  teahouse: { label: '🍵 Quán trà', floors: null },
  // đồn công an: căn nhà công an + bãi giữ xe vi phạm (cần ít nhất 2 lô)
  police: { label: '🚓 Đồn công an', floors: [2, 3], only: 'police' },
};
// Kiểu dùng được cho loại địa điểm: cảnh quan ↔ kiểu cảnh quan; đồn công an ↔ kiểu đồn; loại khác ↔ kiểu nhà thường
export const looksFor = (kind) => Object.keys(LOOKS).filter((k) => {
  const L = LOOKS[k];
  if (kind === 'scenery') return !!L.scenery;
  if (L.only) return L.only === kind;
  return !L.scenery && !LOOKS_ONLY_FOR(kind);
});
// loại địa điểm có kiểu nhà riêng (chỉ dùng kiểu đó)
const LOOKS_ONLY_FOR = (kind) => Object.values(LOOKS).some((l) => l.only === kind);

// Kiểu nhà tự đoán khi chưa chọn
export function guessLook(p) {
  const n = String(p.name || '').toLowerCase();
  switch (p.kind) {
    case 'home':
      return 'tro';
    case 'gas':
      return 'gas';
    case 'apartment':
      return 'apartment';
    case 'market':
      return 'tower';
    case 'garage':
    case 'shop':
      return 'repair';
    case 'cafe':
      return /võng/.test(n) ? 'hammock' : 'cafe';
    case 'restaurant':
      if (/bánh mì/.test(n)) return 'banhmi';
      if (/bánh tráng|bánh canh|bánh xèo/.test(n)) return 'eatery';
      if (/cà phê|cafe/.test(n)) return 'cafe';
      if (/trà|bánh|kem|sinh tố/.test(n)) return 'modern';
      return 'eatery';
    case 'police':
      return 'police';
    case 'scenery':
      if (/đất trống|bãi đất/.test(n)) return 'emptyLot';
      if (/sân bóng|bóng đá/.test(n)) return 'soccer';
      if (/giữ xe|gửi xe|đậu xe/.test(n)) return 'parkingLot';
      if (/công trình|đang xây/.test(n)) return 'construction';
      return 'park';
    case 'service':
      if (/chùa/.test(n)) return 'pagoda';
      if (/karaoke/.test(n)) return 'karaoke';
      if (/võng/.test(n)) return 'hammock';
      if (/cà phê|cafe/.test(n)) return 'cafe';
      if (/công ty|văn phòng|tòa nhà/.test(n)) return 'tower';
      return 'modern';
    default:
      return 'tube';
  }
}

// Kiểu nhà đang dùng (đã chọn hoặc tự đoán)
export const lookOf = (p) => (LOOKS[p.look] ? p.look : guessLook(p));

// Số tầng dùng để dựng: trong khoảng cho phép của kiểu nhà (kiểu cố định → null)
export function lookFloors(p) {
  const r = LOOKS[lookOf(p)].floors;
  if (!r) return null;
  const f = Number.isInteger(p.floors) ? p.floors : r[0];
  return Math.max(r[0], Math.min(r[1], f));
}
