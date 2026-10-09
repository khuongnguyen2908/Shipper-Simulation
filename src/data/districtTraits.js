// TÍNH CÁCH KHU PHỐ (map.json → districts[mã]): các hệ số nhân, 1 = bình thường như mọi nơi.
// Sửa ở thẻ 🗺️ Bản đồ → Khu phố (bấm ⚙️ một khu). Khu chưa đặt số nào → như bình thường.
// Thuần dữ liệu — dùng chung cho game, bot mô phỏng, bộ thử và công cụ.
export const DISTRICT_TRAITS = [
  ['orders', '📦 Khách đặt đơn ban ngày', 'Nhà khách trong khu được chọn làm điểm giao nhiều / ít hơn (6h–21h). 2 = gấp đôi.'],
  ['ordersNight', '🌙 Khách đặt đơn ban đêm', 'Như trên nhưng lúc trời tối (mục Ban đêm ở thẻ Cân bằng). Phố ăn đêm, bến cảng nên cao.'],
  ['tips', '💵 Tiền boa', 'Nhân tiền boa theo sao khi giao tới khu này. Biệt thự 1,5 · ven kênh 0,7.'],
  ['potholes', '🕳️ Ổ gà', 'Ổ gà trên đường trong / quanh khu nhiều hay ít (tổng số ổ gà cả bản đồ không đổi, chỉ dồn về khu số cao).'],
  ['police', '👮 Chốt CSGT', 'Khả năng chốt CSGT đứng ở ngã tư trong khu.'],
  ['jam', '🚗 Kẹt xe giờ cao điểm', 'Khả năng đoạn đường trong khu bị kẹt lúc cao điểm (đường chính vẫn hay kẹt nhất).'],
  ['traffic', '🚶 Người đi bộ đông / vắng', 'Số người đi bộ trên vỉa hè trong khu.'],
  ['tow', '🚛 Đậu xe: bị phạt / cẩu', 'Nhân khả năng bị dán phạt và bị cẩu khi để xe ngoài đường trong khu.'],
  ['theft', '🌙 Đậu xe: bị trộm đêm', 'Nhân khả năng bị trộm khi để xe ngoài đường ban đêm trong khu.'],
];
export const TRAIT_IDS = DISTRICT_TRAITS.map(([k]) => k);
export const TRAIT_RANGE = [0, 5];

// Hệ số của khu (thiếu / sai → 1)
export const traitOf = (d, k) => (d && Number.isFinite(d[k]) && d[k] >= 0 ? d[k] : 1);

// Mẫu khu: bấm một cái là điền sẵn cả bảng (sửa lại từng số sau)
export const DISTRICT_PRESETS = {
  trungtam: { label: 'Trung tâm (đông, kẹt, nhiều CSGT)', orders: 1.4, ordersNight: 1.1, tips: 1.1, potholes: 0.8, police: 2, jam: 2, traffic: 1.6, tow: 2, theft: 0.7 },
  phoco: { label: 'Phố cũ (hẻm dày)', orders: 1.1, ordersNight: 0.9, tips: 1, potholes: 1.2, police: 1, jam: 1.2, traffic: 1.1, tow: 1, theft: 1 },
  trunghoa: { label: 'Phố Hoa (đông ban ngày)', orders: 1.2, ordersNight: 0.9, tips: 1, potholes: 1.1, police: 1.2, jam: 1.4, traffic: 1.4, tow: 1.2, theft: 0.9 },
  chohoa: { label: 'Khu chợ', orders: 1.1, ordersNight: 0.8, tips: 1, potholes: 1, police: 1, jam: 1.3, traffic: 1.3, tow: 1, theft: 1 },
  sanbay: { label: 'Sân bay', orders: 1, ordersNight: 1.2, tips: 1.1, potholes: 0.8, police: 1.3, jam: 1.2, traffic: 1.2, tow: 1.2, theft: 0.8 },
  amthuc: { label: 'Phố ăn (đông về tối)', orders: 1.2, ordersNight: 1.6, tips: 1, potholes: 1, police: 1, jam: 1.1, traffic: 1.2, tow: 0.8, theft: 1 },
  caooc: { label: 'Cao ốc văn phòng (đông ban ngày)', orders: 1.4, ordersNight: 0.7, tips: 1.1, potholes: 0.7, police: 1.3, jam: 1.8, traffic: 1.4, tow: 1.5, theft: 0.7 },
  cang: { label: 'Bến cảng (nhậu đêm)', orders: 0.9, ordersNight: 1.4, tips: 0.9, potholes: 1.8, police: 0.7, jam: 0.9, traffic: 0.9, tow: 0.6, theft: 1.5 },
  venkenh: { label: 'Ven kênh (nghèo, xóc, trộm)', orders: 0.8, ordersNight: 1, tips: 0.7, potholes: 2.2, police: 0.5, jam: 0.7, traffic: 0.8, tow: 0.4, theft: 1.8 },
  dothimoi: { label: 'Đô thị mới (đường đẹp, vắng)', orders: 1, ordersNight: 0.8, tips: 1.2, potholes: 0.3, police: 0.8, jam: 0.6, traffic: 0.7, tow: 0.8, theft: 0.6 },
  bietthu: { label: 'Biệt thự (vắng, boa cao)', orders: 0.7, ordersNight: 0.6, tips: 1.6, potholes: 0.5, police: 0.6, jam: 0.5, traffic: 0.5, tow: 0.5, theft: 0.8 },
  bandao: { label: 'Bán đảo / đất mới (rất vắng)', orders: 0.6, ordersNight: 0.5, tips: 1.2, potholes: 0.6, police: 0.5, jam: 0.4, traffic: 0.4, tow: 0.4, theft: 1 },
};

// ---------- NHÀ DÂN & TRANG TRÍ THEO KHU (chỉ là hình dáng, không đổi luật chơi) ----------
// districts[mã].houses = { kiểu: tỉ lệ } (không đặt = toàn nhà ống như cũ) · decor = { mã: true } · trees = hệ số cây xanh
export const HOUSE_STYLES = [
  ['tube', '🏠 Nhà ống (như cũ)'],
  ['tower', '🏢 Cao ốc kính'],
  ['condo', '🏬 Chung cư mới'],
  ['tin', '🏚️ Nhà thấp mái tôn'],
  ['chinese', '🏮 Phố Hoa'],
  ['japanese', '🎏 Phố Nhật'],
  ['villa', '🏡 Biệt thự sân vườn'],
];
export const HOUSE_STYLE_IDS = HOUSE_STYLES.map(([k]) => k);
// kiểu nhà vừa với nhà trong hẻm (nhỏ, thấp) — kiểu khác gặp nhà trong hẻm thì dùng nhà ống
export const ALLEY_STYLES = ['tube', 'tin', 'chinese', 'japanese'];
export const DECOR = [
  ['lanterns', '🏮 Dây đèn lồng đỏ giăng ngang đường (phố Hoa)'],
  ['chochin', '🎏 Đèn lồng giấy dọc vỉa hè (phố Nhật)'],
  ['vendors', '🛒 Xe hàng rong trên vỉa hè'],
];
export const DECOR_IDS = DECOR.map(([k]) => k);

// Chọn kiểu nhà theo tỉ lệ của khu (rng: bộ ngẫu nhiên cố định theo seed)
function pickByMix(d, rng, inAlley) {
  const mix = d && d.houses && typeof d.houses === 'object' ? d.houses : null;
  if (!mix) return 'tube';
  const ok = Object.entries(mix).filter(([k, w]) => HOUSE_STYLE_IDS.includes(k) && w > 0 && (!inAlley || ALLEY_STYLES.includes(k)));
  if (!ok.length) return 'tube';
  return rng.weighted(ok.map(([k]) => k), ok.map(([, w]) => w));
}
// Kiểu chủ đạo của một khối: nhà cùng kiểu tụ thành dãy phố (vd vài khối phố Nhật trong khu Trung Tâm) thay vì rải lẻ
export const blockHouseStyle = (d, rng) => pickByMix(d, rng, false);
export const BLOCK_STYLE_SHARE = 0.75; // 3/4 lô trong khối theo kiểu chủ đạo, còn lại chọn theo tỉ lệ khu
// Kiểu nhà cho một lô: theo kiểu chủ đạo của khối (nếu có), nhà trong hẻm chỉ dùng kiểu nhỏ
export function pickHouseStyle(d, rng, inAlley = false, primary = null) {
  if (primary && rng.next() < BLOCK_STYLE_SHARE && (!inAlley || ALLEY_STYLES.includes(primary))) return primary;
  return pickByMix(d, rng, inAlley);
}
export const TREES_RANGE = [0, 2]; // 0 = không cây · 1 = như cũ · 2 = gấp đôi
export const treesOf = (d) => (d && Number.isFinite(d.trees) && d.trees >= 0 ? Math.min(d.trees, TREES_RANGE[1]) : 1);

// mẫu nhà dân + trang trí + cấp đường cho từng mẫu khu (đi kèm DISTRICT_PRESETS)
// roads = tỉ lệ tuyến đường trong khu là đại lộ / thường / nhỏ (dùng khi bấm "Chia lại theo khu phố" ở mục Đường to / nhỏ)
export const LOOK_PRESETS = {
  trungtam: { houses: { tube: 0.5, tower: 0.3, japanese: 0.2 }, decor: { chochin: true, vendors: true }, trees: 1, roads: { big: 0.45, normal: 0.4, small: 0.15 } },
  phoco: { houses: { tube: 1 }, decor: { vendors: true }, trees: 1.3, roads: { normal: 0.3, small: 0.7 } },
  trunghoa: { houses: { chinese: 0.8, tube: 0.2 }, decor: { lanterns: true, vendors: true }, trees: 0.7, roads: { normal: 0.45, small: 0.55 } },
  chohoa: { houses: { tube: 0.8, chinese: 0.2 }, decor: { vendors: true }, trees: 1, roads: { normal: 0.4, small: 0.6 } },
  sanbay: { houses: { tube: 0.7, tin: 0.3 }, decor: {}, trees: 0.8, roads: { big: 0.6, normal: 0.4 } },
  amthuc: { houses: { tube: 0.85, japanese: 0.15 }, decor: { vendors: true }, trees: 1, roads: { normal: 0.6, small: 0.4 } },
  caooc: { houses: { tower: 0.6, condo: 0.3, tube: 0.1 }, decor: {}, trees: 1.2, roads: { big: 0.6, normal: 0.4 } },
  cang: { houses: { tin: 0.6, tube: 0.4 }, decor: { vendors: true }, trees: 0.5, roads: { normal: 0.7, small: 0.3 } },
  venkenh: { houses: { tin: 0.8, tube: 0.2 }, decor: {}, trees: 0.5, roads: { normal: 0.2, small: 0.8 } },
  dothimoi: { houses: { condo: 0.7, villa: 0.15, tube: 0.15 }, decor: {}, trees: 1.6, roads: { big: 0.5, normal: 0.5 } },
  bietthu: { houses: { villa: 0.85, tube: 0.15 }, decor: {}, trees: 2, roads: { normal: 0.7, small: 0.3 } },
  bandao: { houses: { condo: 0.45, villa: 0.2, tube: 0.35 }, decor: {}, trees: 1.2, roads: { big: 0.25, normal: 0.6, small: 0.15 } },
};
