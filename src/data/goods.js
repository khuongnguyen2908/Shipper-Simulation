// Đồ dùng mua được — dữ liệu ở goods.json (sửa bằng ?editor, thẻ Xe · Túi · Đồ dùng).
//  - type 'consumable': dùng 1 lần từ túi đồ (phím I): use = { minutes, phys, mental, fuel, bikeHp }
//  - type 'equipment' : mua 1 lần, tác dụng lâu dài: effects = { <mã tác dụng>: giá trị }
// Danh sách tác dụng bên dưới là những gì code hiểu được. Muốn thêm kiểu tác dụng mới
// thì thêm vào EFFECTS + chỗ dùng trong code (GameState.effect(...)).
import raw from './goods.json' with { type: 'json' };

export const GOODS = raw;

// kind: 'bool' (có/không) · 'pct' (phần trăm, âm = giảm) · 'num' (số cộng thêm)
export const EFFECTS = {
  rainProtect: { kind: 'bool', label: 'Chống mưa', hint: 'Mưa không trừ thêm thể lực/tinh thần; khách xe ôm không bị ướt' },
  sunProtect: { kind: 'bool', label: 'Chống nắng', hint: 'Không mệt thêm khi nắng gắt 11h–15h' },
  passengerSeat: { kind: 'bool', label: 'Chở được khách', hint: 'Mở khóa đơn xe ôm (và nhiệm vụ chiếc ví)' },
  physDrainPct: { kind: 'pct', label: 'Hao thể lực (%)', hint: 'Âm = đỡ mệt hơn. Vd −10', min: -80, max: 50 },
  mentalDrainPct: { kind: 'pct', label: 'Hao tinh thần (%)', hint: 'Âm = đỡ căng thẳng hơn (kẹt xe, mưa…)', min: -80, max: 50 },
  fuelUsePct: { kind: 'pct', label: 'Hao xăng (%)', hint: 'Âm = tiết kiệm xăng', min: -60, max: 50 },
  stairsPct: { kind: 'pct', label: 'Mệt khi leo thang (%)', hint: 'Âm = leo thang đỡ mệt', min: -80, max: 50 },
  paddingPct: { kind: 'pct', label: 'Đệm chống sốc thêm (%)', hint: 'Cộng vào đệm của túi (tối đa 90%)', min: 0, max: 60 },
  comfortKmh: { kind: 'num', label: 'Khách chịu tốc độ thêm (km/h)', hint: 'Khách xe ôm bớt sợ khi chạy nhanh', min: 0, max: 30 },
  tipBonus: { kind: 'num', label: 'Boa thêm mỗi đơn 4–5★ (k)', hint: 'Cộng vào tiền boa', min: 0, max: 50 },
};

export const CONSUMABLE_FIELDS = {
  minutes: { label: 'Mất bao nhiêu phút', min: 0, max: 240 },
  phys: { label: 'Thể lực +/−', min: -100, max: 100 },
  mental: { label: 'Tinh thần +/−', min: -100, max: 100 },
  fuel: { label: 'Xăng (lít)', min: 0, max: 10 },
  bikeHp: { label: 'Độ bền xe +', min: 0, max: 100 },
};
