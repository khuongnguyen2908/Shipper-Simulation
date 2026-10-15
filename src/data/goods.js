// Đồ dùng mua được — dữ liệu ở goods.json (sửa bằng ?editor, thẻ Xe · Túi · Đồ dùng).
//  - type 'consumable': dùng 1 lần từ túi đồ (phím I): use = { minutes, phys, mental, fuel, bikeHp }
//  - type 'equipment' : mua 1 lần, tác dụng lâu dài: effects = { <mã tác dụng>: giá trị }
//  - type 'carry'     : mang theo, dùng tại địa điểm có hoạt động cần nó (vd nhang → chùa)
//  - type 'outfit'    : trang phục shipper: slot (chỗ mặc) + style (kiểu) + color;
//                       effects (nếu có) chỉ tính khi đang mặc. Giá 0 = có sẵn từ đầu.
//                       start: true (giá 0) = đồ chọn ở màn tạo nhân vật — chỉ có món đã chọn, không có hết.
//                       color2: màu phụ (áo trong của áo khoác mở, sọc caro / 3 sọc, chữ / số in, dây áo hoodie, nơ…)
//                       gender: 'f' = chỉ nhân vật nữ mặc được (áo dài, chân váy, đầm…)
//                       Áo / quần / nón / giày thay ở tủ đồ phòng trọ; phụ kiện (accessory) gắn / tháo ngay trong túi đồ.
// Danh sách tác dụng bên dưới là những gì code hiểu được. Muốn thêm kiểu tác dụng mới
// thì thêm vào EFFECTS + chỗ dùng trong code (GameState.effect(...)).
import raw from './goods.json' with { type: 'json' };

export const GOODS = raw;

// Chỗ mặc → các kiểu dáng (nhãn chỉ hiện trong công cụ ?editor; trong game dùng kho chữ outfit.*)
// accessory: phụ kiện — được để trống, gắn / tháo ở bất cứ đâu (trong túi đồ, phải dừng xe)
// Kiểu áo "đầm / yếm / đồ ngủ" là đồ liền bộ: mặc vào thì bỏ qua quần đang mặc (đầm: chân trần; yếm, đồ ngủ: quần cùng màu áo).
export const OUTFIT_SLOTS = {
  shirt: {
    label: 'Áo',
    styles: {
      short: 'Thun tay ngắn', long: 'Thun tay dài', polo: 'Polo', shirt: 'Sơ mi', plaid: 'Sơ mi caro', hoodie: 'Hoodie', tank: 'Ba lỗ',
      zip: 'Khoác mở khóa', denim: 'Khoác jean', biker: 'Khoác da', blazer: 'Vest (sơ mi + cà vạt)', gile: 'Gile phản quang',
      baba: 'Bà ba', soccer: 'Áo đá banh (số sau lưng)', vnteam: 'Áo đội tuyển (sao vàng)', printed: 'Thun in chữ I ❤ SG', turtleneck: 'Len cổ lọ',
      croptop: 'Croptop (nữ)', halter: 'Hai dây (nữ)', aodai: 'Áo dài (nữ)', dress: 'Đầm liền (nữ)', overalls: 'Yếm jean (liền quần)', pajama: 'Đồ ngủ (liền bộ)',
    },
  },
  pants: {
    label: 'Quần',
    styles: {
      long: 'Quần dài', shorts: 'Quần short', jeans: 'Jean', slacks: 'Quần tây', jogger: 'Jogger', cargo: 'Túi hộp', track: 'Thể thao 3 sọc',
      capri: 'Quần lửng', boxer: 'Quần đùi', wide: 'Ống rộng (nữ)', legging: 'Legging (nữ)', skirt: 'Chân váy (nữ)', flare: 'Váy xòe (nữ)', pencil: 'Váy bút chì (nữ)',
    },
  },
  // mũ bảo hiểm: tháo / đội trong túi đồ (dừng xe). Lúc đầu không có — hãng cấp khi đăng ký (quà vào hãng) hoặc mua ở cửa hàng.
  // Chạy xe máy / xe điện không đội → CSGT ở chốt / xe tuần tra phạt (ECONOMY.noHelmetFine); xe đạp thường không bắt buộc.
  helmet: { label: 'Mũ bảo hiểm', styles: { half: 'Nửa đầu', open: 'Mũ 3/4 (che tai + gáy)', full: 'Fullface (có kính)' }, accessory: true },
  shoes: {
    label: 'Giày',
    styles: {
      sneaker: 'Giày thể thao', sandal: 'Dép tổ ong', slide: 'Dép lê / quai ngang', flipflop: 'Dép xỏ ngón', strap: 'Sandal quai hậu', canvas: 'Bata vải cổ cao',
      oxford: 'Giày tây', loafer: 'Giày lười', boots: 'Bốt cổ cao', rainboots: 'Ủng cao su', flats: 'Giày búp bê (nữ)', heels: 'Giày cao gót (nữ)',
    },
  },
  acc: { label: 'Phụ kiện', styles: { raincoat: 'Áo mưa', jacket: 'Áo khoác chống nắng' }, accessory: true },
  face: { label: 'Phụ kiện đầu', styles: { glasses: 'Kính', mask: 'Khẩu trang' }, accessory: true },
  hands: { label: 'Phụ kiện tay', styles: { gloves: 'Găng tay', armSleeves: 'Găng tay ống dài' }, accessory: true },
  // đồng phục hãng (món có ô brand = mã hãng): cấp khi vào hãng / mua ở văn phòng hãng; phải mặc mới bật app nhận đơn
  uniform: { label: 'Đồng phục', styles: { jacket: 'Áo khoác đồng phục' }, accessory: true },
  // mũ lưỡi trai: chỉ thấy khi không đội mũ bảo hiểm (đội cả 2 thì thấy mũ bảo hiểm)
  cap: { label: 'Mũ lưỡi trai', styles: { cap: 'Mũ lưỡi trai' }, accessory: true },
  wrist: { label: 'Đồng hồ / vòng tay', styles: { watch: 'Đồng hồ', bracelet: 'Vòng tay' }, accessory: true },
  // balo / túi đeo chéo (khi đeo thùng giao hàng của NPC thì không thấy)
  bag: { label: 'Balo / túi', styles: { backpack: 'Balo', crossbody: 'Túi đeo chéo' }, accessory: true },
};
// Kiểu chỉ dành cho nữ: món có kiểu này phải đặt gender 'f' (?editor báo nếu thiếu)
export const FEMALE_STYLES = ['croptop', 'halter', 'aodai', 'dress', 'wide', 'legging', 'skirt', 'flare', 'pencil', 'flats', 'heels'];
// Nhân vật giới tính `gender` mặc được món này không
export const canWearOutfit = (g, gender) => !g || g.gender !== 'f' || gender === 'f';
export const isAccessorySlot = (slot) => !!OUTFIT_SLOTS[slot]?.accessory;

// Ngoại hình khi một chỗ mặc không có món nào (giống shipper áo xanh lá ban đầu).
// Giày / phụ kiện (kể cả mũ bảo hiểm) không có món → giày tự chọn theo bộ đồ, không đeo / không đội.
const DEFAULT_PART = {
  shirt: { color: '#27ae60', style: 'long' },
  pants: { color: '#1f2d3d', style: 'long' },
};

const hex = (c, fallback) => parseInt(String(/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : fallback).slice(1), 16);

// Món có sẵn (giá 0) đầu tiên của một chỗ mặc (style: chỉ lấy món đúng kiểu đó, không có thì lấy món có sẵn bất kỳ)
export function freeOutfit(goods, slot, style = null) {
  const free = Object.values(goods).filter((g) => g.type === 'outfit' && g.slot === slot && g.price === 0 && !g.npcOnly); // npcOnly: đồ chỉ NPC mặc (công cụ /?relationship)
  return (style && free.find((g) => g.style === style)) || free[0] || null;
}
// Bộ đồ lúc bắt đầu (màn tạo nhân vật): áo thun tay dài / tay ngắn + quần dài / quần short + giày đen / trắng — lấy món có sẵn (giá 0).
// Trả về { shirt, pants, shoes: mã } để ghi vào trang phục đang mặc; đồ khác mua ở cửa hàng.
export const START_SLEEVES = ['short', 'long'];
export const START_LEGS = ['shorts', 'long'];
export const START_SHOES = ['black', 'white'];
const bright = (c) => { const n = parseInt(String(c || '#000000').slice(1), 16) || 0; return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255); };
// Các món chọn lúc tạo nhân vật của một chỗ mặc (giá 0 + start), theo thứ tự trong goods.json
export const startPicks = (goods, slot) => Object.values(goods).filter((g) => g.type === 'outfit' && g.slot === slot && g.price === 0 && g.start);
export function startOutfit(goods, { sleeves, legs, shoes } = {}) {
  const out = {};
  const pick = (slot, style) => { const l = startPicks(goods, slot); return l.find((g) => g.style === style) || l[0] || null; };
  // giày: giày bata chọn được sáng nhất (trắng) hoặc tối nhất (đen)
  const free = startPicks(goods, 'shoes').filter((g) => g.style === 'sneaker').sort((a, b) => bright(a.color) - bright(b.color));
  const sho = shoes === 'white' ? free[free.length - 1] : free[0];
  if (sho) out.shoes = sho.id;
  const sh = pick('shirt', START_SLEEVES.includes(sleeves) ? sleeves : 'short');
  const pa = pick('pants', START_LEGS.includes(legs) ? legs : 'shorts');
  if (sh) out.shirt = sh.id;
  if (pa) out.pants = pa.id;
  return out;
}

// worn: { shirt, pants, helmet, shoes, acc, face, hands } → món đồ (hoặc null). Trả về tham số cho makePerson (màu dạng số).
// Chỉ thêm khóa giày / phụ kiện khi có mặc → ngoại hình cũ giữ nguyên khóa (so sánh JSON để dựng lại người).
export function outfitLook(worn = {}) {
  const part = (slot) => ({ ...DEFAULT_PART[slot], ...(worn[slot] || {}) });
  const sh = part('shirt'), pa = part('pants'), he = worn.helmet;
  const look = {
    shirt: hex(sh.color, DEFAULT_PART.shirt.color),
    sleeves: sh.style === 'short' ? 'short' : 'long',
    pants: hex(pa.color, DEFAULT_PART.pants.color),
    shorts: pa.style === 'shorts',
    hat: he ? 'helmet' : null, // không đội mũ → thấy tóc
  };
  // kiểu áo / quần mới (ngoài thun + quần dài / short) và màu phụ — chỉ thêm khóa khi có (ngoại hình cũ giữ nguyên khóa)
  if (sh.style && sh.style !== 'short' && sh.style !== 'long') look.shirtStyle = sh.style;
  if (sh.color2) look.shirt2 = hex(sh.color2, '#ffffff');
  if (pa.style && pa.style !== 'shorts' && pa.style !== 'long') look.pantsStyle = pa.style;
  if (pa.color2) look.pants2 = hex(pa.color2, '#ffffff');
  if (he) Object.assign(look, { hatColor: hex(he.color, '#27ae60'), helmetStyle: he.style === 'full' || he.style === 'open' ? he.style : 'half' });
  const { shoes, acc, face, hands, uniform, cap, wrist, bag } = worn;
  if (cap && !he) Object.assign(look, { hat: 'cap', hatColor: hex(cap.color, '#c0392b') });
  if (wrist && (wrist.style === 'watch' || wrist.style === 'bracelet')) Object.assign(look, { wrist: wrist.style, wristColor: hex(wrist.color, '#222222') });
  if (bag && (bag.style === 'backpack' || bag.style === 'crossbody')) Object.assign(look, { carry: bag.style, carryColor: hex(bag.color, '#34495e') });
  if (uniform) look.uniform = hex(uniform.color, '#00b14f'); // áo khoác đồng phục màu hãng, mặc ngoài áo
  if (shoes) Object.assign(look, { shoe: hex(shoes.color, '#2b2b2b'), shoeStyle: OUTFIT_SLOTS.shoes.styles[shoes.style] ? shoes.style : 'sneaker' });
  if (shoes?.color2) look.shoe2 = hex(shoes.color2, '#ffffff');
  if (acc && (acc.style === 'raincoat' || acc.style === 'jacket')) Object.assign(look, { overlay: acc.style, overlayColor: hex(acc.color, acc.style === 'raincoat' ? '#3c8dde' : '#bfe3f5') });
  if (face && (face.style === 'glasses' || face.style === 'mask')) Object.assign(look, { face: face.style, faceColor: hex(face.color, '#222222') });
  if (hands && (hands.style === 'gloves' || hands.style === 'armSleeves')) Object.assign(look, { gloves: hands.style, gloveColor: hex(hands.color, '#333333') });
  return look;
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
