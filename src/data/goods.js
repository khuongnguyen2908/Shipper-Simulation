// Đồ dùng mua được — dữ liệu ở goods.json (sửa bằng ?editor, thẻ Xe · Túi · Đồ dùng).
//  - type 'consumable': dùng 1 lần từ túi đồ (phím I): use = { minutes, phys, mental, fuel, bikeHp }
//  - type 'equipment' : mua 1 lần, tác dụng lâu dài: effects = { <mã tác dụng>: giá trị }
//  - type 'carry'     : mang theo, dùng tại địa điểm có hoạt động cần nó (vd nhang → chùa)
//  - type 'outfit'    : trang phục shipper, mặc ở tủ đồ phòng trọ: slot (chỗ mặc) + style (kiểu) + color;
//                       effects (nếu có) chỉ tính khi đang mặc. Giá 0 = có sẵn từ đầu.
// Danh sách tác dụng bên dưới là những gì code hiểu được. Muốn thêm kiểu tác dụng mới
// thì thêm vào EFFECTS + chỗ dùng trong code (GameState.effect(...)).
import raw from './goods.json' with { type: 'json' };

export const GOODS = raw;

// Chỗ mặc → các kiểu dáng (nhãn chỉ hiện trong công cụ ?editor; trong game dùng kho chữ outfit.*)
export const OUTFIT_SLOTS = {
  shirt: { label: 'Áo', styles: { long: 'Tay dài', short: 'Tay ngắn' } },
  pants: { label: 'Quần', styles: { long: 'Quần dài', shorts: 'Quần short' } },
  helmet: { label: 'Mũ bảo hiểm', styles: { half: 'Nửa đầu', full: 'Fullface (có kính)' } },
};

// Ngoại hình khi một chỗ mặc không có món nào (giống shipper áo xanh lá ban đầu)
const DEFAULT_PART = {
  shirt: { color: '#27ae60', style: 'long' },
  pants: { color: '#1f2d3d', style: 'long' },
  helmet: { color: '#27ae60', style: 'half' },
};

const hex = (c, fallback) => parseInt(String(/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : fallback).slice(1), 16);

// Món có sẵn (giá 0) đầu tiên của một chỗ mặc
export function freeOutfit(goods, slot) {
  return Object.values(goods).find((g) => g.type === 'outfit' && g.slot === slot && g.price === 0) || null;
}

// worn: { shirt, pants, helmet } → món đồ (hoặc null). Trả về tham số cho makePerson (màu dạng số).
export function outfitLook(worn = {}) {
  const part = (slot) => ({ ...DEFAULT_PART[slot], ...(worn[slot] || {}) });
  const sh = part('shirt'), pa = part('pants'), he = part('helmet');
  return {
    shirt: hex(sh.color, DEFAULT_PART.shirt.color),
    sleeves: sh.style === 'short' ? 'short' : 'long',
    pants: hex(pa.color, DEFAULT_PART.pants.color),
    shorts: pa.style === 'shorts',
    hat: 'helmet',
    hatColor: hex(he.color, DEFAULT_PART.helmet.color),
    helmetStyle: he.style === 'full' ? 'full' : 'half',
  };
}

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
