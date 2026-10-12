// Ngoại hình người: đoán nam/nữ theo cách xưng hô đầu tên ("Chị Lan" → nữ, "Chú Bảy" → nam).
// Chỉ dùng để chọn hình 3D, không hiển thị chữ. Không đoán được (Bé, Em, Bác…) → null.

const FEMALE = ['chị', 'cô', 'bà', 'dì', 'thím', 'mợ', 'má', 'mẹ', 'nàng'];
const MALE = ['anh', 'chú', 'ông', 'cậu', 'dượng', 'ba', 'bố', 'cha', 'chàng'];

export const GENDERS = ['m', 'f'];
// short = tóc ngắn · long = tóc dài · ponytail = cột đuôi ngựa · bun = búi tóc · bald = trọc (sư thầy, sư cô)
export const HAIR_STYLES = ['short', 'long', 'ponytail', 'bun', 'bald'];
// Tạo nhân vật (màn hình Chơi mới): màu tóc, màu da người chơi chọn được (số màu 0xRRGGBB)
export const HAIR_COLORS = [0x1b1b1b, 0x4a2c1a, 0x7b3f1d, 0xc9a050, 0xe8dcb5, 0x5d6d7e, 0xe75b8d, 0xb8b8b8];
export const PLAYER_SKINS = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x9c6b3c, 0x6b4423];
// Ngoại hình người chơi theo hồ sơ (dùng cho nhân vật trong game, hình xem trước, avatar trong túi đồ)
export const profileLook = (p) => ({ gender: p?.gender === 'f' ? 'f' : 'm', hairStyle: p?.hairStyle, hair: p?.hair, skin: p?.skin });

export function guessGender(name) {
  const w = String(name || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
  if (FEMALE.includes(w)) return 'f';
  if (MALE.includes(w)) return 'm';
  return null;
}

// Số cố định từ một chuỗi (để mỗi NPC có ngoại hình riêng, không đổi khi sắp xếp lại danh sách)
export function hashStr(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}
