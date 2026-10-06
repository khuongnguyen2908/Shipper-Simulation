// Đồ dùng mua được — dữ liệu ở goods.json (sửa bằng ?editor, thẻ Xe · Túi · Đồ dùng).
//  - type 'consumable': dùng 1 lần từ túi đồ (phím I): use = { minutes, phys, mental, fuel, bikeHp }
//  - type 'equipment' : mua 1 lần, tác dụng lâu dài: effects = { <mã tác dụng>: giá trị }
// Danh sách tác dụng bên dưới là những gì code hiểu được. Muốn thêm kiểu tác dụng mới
// thì thêm vào EFFECTS + chỗ dùng trong code (GameState.effect(...)).
import raw from './goods.json' with { type: 'json' };

export const GOODS = raw;

// kind: 'bool' (có/không) · 'pct' (phần trăm, âm = giảm) · 'num' (số cộng thêm)
export const EFFECTS = {
  rainProtect: { kind: 'bool', label: 'Chống mưa', hint: 'Mưa không trừ thêm thể lực/tinh thần; khách xe ôm không bị ướt (không thì khách trừ sao)' },
  sunProtect: { kind: 'bool', label: 'Chống nắng', hint: 'Không mệt thêm khi nắng gắt 11h–15h (bình thường mất thêm ~0,03 thể lực/phút)' },
  passengerSeat: { kind: 'bool', label: 'Chở được khách', hint: 'Mở khóa đơn xe ôm (và nhiệm vụ chiếc ví)' },
  physDrainPct: { kind: 'pct', label: 'Hao thể lực (%)', hint: '−80 → +50. Thể lực tụt chậm hơn bao nhiêu % (chạy xe, đi bộ, nắng, mưa). Vd −10: mất 10 còn 9. Không giảm cú trừ ngay (té xe, leo thang).', min: -80, max: 50 },
  mentalDrainPct: { kind: 'pct', label: 'Hao tinh thần (%)', hint: '−80 → +50. Tinh thần tụt chậm hơn bao nhiêu % (kẹt xe, mưa, chờ đợi, hao theo giờ). Vd −10: mất 10 còn 9. Không giảm cú sốc như bị phạt, đâm xe, 1★.', min: -80, max: 50 },
  fuelUsePct: { kind: 'pct', label: 'Hao xăng (%)', hint: '−60 → +50. Âm = tiết kiệm xăng. Vd −20: cùng quãng đường tốn ít xăng hơn 20%.', min: -60, max: 50 },
  stairsPct: { kind: 'pct', label: 'Mệt khi leo thang (%)', hint: '−80 → +50. Leo thang chung cư mất 3,5 thể lực/tầng; −30 → còn ~2,5/tầng.', min: -80, max: 50 },
  paddingPct: { kind: 'pct', label: 'Đệm chống sốc thêm (%)', hint: '0 → 60. Cộng thẳng vào đệm chống sốc của túi (tổng tối đa 90%). Túi thùng có sẵn 55%.', min: 0, max: 60 },
  comfortKmh: { kind: 'num', label: 'Khách chịu tốc độ thêm (km/h)', hint: '0 → 30. Khách xe ôm bắt đầu sợ (trừ sao) khi chạy trên ~40 km/h; +10 → chịu tới ~50 km/h.', min: 0, max: 30 },
  tipBonus: { kind: 'num', label: 'Boa thêm mỗi đơn 4–5★ (k)', hint: '0 → 50k. Cộng thêm vào tiền boa đơn 4–5★ (bình thường 4★: 3k, 5★: 8k).', min: 0, max: 50 },
};

export const CONSUMABLE_FIELDS = {
  minutes: { label: 'Mất bao nhiêu phút', min: 0, max: 240 },
  phys: { label: 'Thể lực +/−', min: -100, max: 100 },
  mental: { label: 'Tinh thần +/−', min: -100, max: 100 },
  fuel: { label: 'Xăng (lít)', min: 0, max: 10 },
  bikeHp: { label: 'Độ bền xe +', min: 0, max: 100 },
};
