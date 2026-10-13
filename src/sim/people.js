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

// =============================================================
// XƯNG HÔ trong lời thoại: người nói (tên + giới tính + tuổi + vai) → cách tự xưng và cách gọi người chơi.
// Câu thoại trong vi.json dùng chỗ trống (chữ hoa đầu = viết hoa chữ đầu):
//   {toi} / {Toi}   người nói tự xưng ("chị", "chú", "con"…)
//   {ban} / {Ban}   người nói gọi người chơi ("em", "con", "anh"/"chị" theo giới tính nhân vật mình)
//   {khach} / {Khach} người chơi gọi người nói · {minh} / {Minh} người chơi tự xưng với người nói (câu người chơi chọn)
//   {anhchi} / {Anhchi} "anh" hoặc "chị" theo giới tính nhân vật mình (người nói nhỏ tuổi hơn / lịch sự)
// Câu trong danh sách có thể gắn thẻ đầu câu "[veso] Mua vé số không con?" → chỉ người có vai / tuổi / giới tính trùng một
// thẻ mới nói (vai: veso, xeom, anxin…; tuổi: kid, young, adult, elder; giới tính: m, f). Câu không thẻ ai cũng nói được.
// =============================================================
// Chữ đầu tên → tuổi (+ giới tính nếu rõ). "Bé Na" → trẻ con · "Anh Tuấn" → thanh niên · "Cô Mai" → trung niên · "Bà Sáu" → già
const KIN = {
  bé: { age: 'kid' }, nhóc: { age: 'kid' }, thằng: { age: 'kid', g: 'm' }, cậu: { age: 'kid', g: 'm' }, em: { age: 'kid' },
  anh: { age: 'young', g: 'm' }, chị: { age: 'young', g: 'f' },
  cô: { age: 'adult', g: 'f' }, chú: { age: 'adult', g: 'm' }, dì: { age: 'adult', g: 'f' }, thím: { age: 'adult', g: 'f' }, mợ: { age: 'adult', g: 'f' }, dượng: { age: 'adult', g: 'm' },
  bác: { age: 'elder' }, bà: { age: 'elder', g: 'f' }, ông: { age: 'elder', g: 'm' }, cụ: { age: 'elder' },
};
// tên nước ngoài hay gặp (khách du lịch): đoán nữ — còn lại coi là nam
const FOREIGN_F = new Set(['emma', 'sophie', 'min-ji', 'yuki', 'anna', 'mary', 'lisa', 'olivia', 'mia', 'hana', 'sakura', 'ji-woo', 'linda', 'julia', 'laura', 'marie', 'sarah', 'kate']);
export const AGES = ['kid', 'young', 'adult', 'elder'];

// Bỏ thẻ đầu câu: "[veso] Cô bán vé số" → { tags: ['veso'], text: 'Cô bán vé số' }
export function untag(s) {
  const m = /^\s*\[([^\]]*)\]\s*/.exec(String(s ?? ''));
  return m ? { tags: m[1].split(/[\s,]+/).filter(Boolean), text: String(s).slice(m[0].length) } : { tags: [], text: String(s ?? '') };
}

// Hồ sơ người nói từ tên. opts: { gender (đặt sẵn trong dữ liệu), age, role ('staff' = nhân viên quán / tiệm, 'veso'…) }
// Giới tính không đoán được từ tên → cố định theo tên (băm), để hình 3D và lời nói luôn khớp nhau.
export function personOf(rawName, opts = {}) {
  const { tags, text: name } = untag(rawName);
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() || '';
  const kin = KIN[first] ? first : null;
  const k = kin ? KIN[kin] : null;
  // tên Tây (chỉ chữ cái a–z, không dấu, không có chữ xưng hô đầu): đoán theo danh sách tên nữ hay gặp, còn lại nam
  const foreign = !kin && /^[a-z][a-z-]*$/i.test(first);
  const gender = opts.gender === 'f' || opts.gender === 'm' ? opts.gender
    : k?.g || (foreign ? (FOREIGN_F.has(first) ? 'f' : 'm') : hashStr(name) % 2 ? 'f' : 'm');
  const age = AGES.includes(opts.age) ? opts.age : k?.age || 'young';
  const role = opts.role || tags.find((t) => !AGES.includes(t) && t !== 'm' && t !== 'f') || null;
  return { name, gender, age, role, kin };
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// Tham số xưng hô cho fmt(): người nói who (personOf) nói với người chơi (giới tính playerGender 'm' | 'f')
export function pronouns(who, playerGender = 'm') {
  const anhchi = playerGender === 'f' ? 'chị' : 'anh';
  let toi, ban;
  if (who.role === 'staff' && (!who.kin || who.age === 'young')) { toi = 'em'; ban = anhchi; } // nhân viên quán / tiệm: lễ phép
  else if (who.age === 'kid') { toi = 'em'; ban = anhchi; } // trẻ con, học sinh
  else if (who.age === 'young') { toi = who.gender === 'f' ? 'chị' : 'anh'; ban = 'em'; }
  else if (who.age === 'adult') { toi = who.kin && KIN[who.kin].age === 'adult' ? who.kin : who.gender === 'f' ? 'cô' : 'chú'; ban = 'con'; }
  else { toi = who.kin === 'bác' || who.kin === 'cụ' ? 'bác' : who.gender === 'f' ? 'bà' : 'ông'; ban = 'con'; }
  // người chơi nói lại với người đó: gọi đúng cách người đó tự xưng, tự xưng đúng cách người đó gọi mình
  const khach = toi, minh = ban;
  return { toi, Toi: cap(toi), ban, Ban: cap(ban), khach, Khach: cap(khach), minh, Minh: cap(minh), anhchi, Anhchi: cap(anhchi) };
}

// Câu trong danh sách có hợp với người nói không (thẻ đầu câu)
export function lineFits(tags, who) {
  if (!tags.length) return true;
  return tags.some((t) => t === who?.role || t === who?.age || t === who?.gender);
}

// Số cố định từ một chuỗi (để mỗi NPC có ngoại hình riêng, không đổi khi sắp xếp lại danh sách)
export function hashStr(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}
