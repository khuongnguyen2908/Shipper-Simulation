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
