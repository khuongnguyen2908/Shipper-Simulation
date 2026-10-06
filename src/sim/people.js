// Ngoại hình người: đoán nam/nữ theo cách xưng hô đầu tên ("Chị Lan" → nữ, "Chú Bảy" → nam).
// Chỉ dùng để chọn hình 3D, không hiển thị chữ. Không đoán được (Bé, Em, Bác…) → null.

const FEMALE = ['chị', 'cô', 'bà', 'dì', 'thím', 'mợ', 'má', 'mẹ', 'nàng'];
const MALE = ['anh', 'chú', 'ông', 'cậu', 'dượng', 'ba', 'bố', 'cha', 'chàng'];

export const GENDERS = ['m', 'f'];
// short = tóc ngắn · long = tóc dài · ponytail = cột đuôi ngựa · bun = búi tóc
export const HAIR_STYLES = ['short', 'long', 'ponytail', 'bun'];

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
