// =============================================================
// SƠ ĐỒ QUAN HỆ NHÂN VẬT (relations.json — sửa bằng công cụ /?relationship)
// Nhân vật: hồ sơ (tuổi, vai, tính cách, ghi chú), gắn với game (người trong cốt truyện story.json / NPC địa điểm places.json),
//   ngoại hình riêng (nhân vật không phải NPC địa điểm): dáng + nhiều bộ đồ chọn từ quần áo goods.json.
// Dây quan hệ: loại, 2 chiều (a → b và b → a): là gì của nhau, tự xưng, gọi người kia là gì, tình cảm −3…+3;
//   từ chương / tới chương, bí mật (người chơi chưa biết), ghi chú cho lời thoại.
// Game dùng: xưng hô {toi} {ban} {khach} {minh} trong thoại (thay cho đoán theo tên — sim/people.js),
//   ngoại hình người lạ cốt truyện (việc "actor" dáng "char"). Thuần dữ liệu — chạy được trong Node.
// =============================================================
import raw from './relations.json' with { type: 'json' };
import { GOODS, outfitLook } from './goods.js';
import { personOf, pronouns } from '../sim/people.js';

export const REL = raw;
export const PLAYER = 'player'; // mã nhân vật người chơi (luôn có, không xóa được)
// Loại dây mặc định (dùng khi relations.json chưa có bảng types)
export const DEFAULT_TYPES = {
  family: { name: 'Gia đình', color: '#e74c3c' },
  relative: { name: 'Họ hàng', color: '#c0392b' },
  friend: { name: 'Bạn bè', color: '#2ecc71' },
  neighbor: { name: 'Hàng xóm', color: '#1abc9c' },
  host: { name: 'Chủ – khách', color: '#5dade2' },
  work: { name: 'Đồng nghiệp', color: '#f1c40f' },
  love: { name: 'Tình cảm', color: '#ff7eb6' },
  enemy: { name: 'Thù ghét', color: '#e67e22' },
  boss: { name: 'Cấp trên – cấp dưới', color: '#95a5a6' },
  gang: { name: 'Băng nhóm', color: '#9b59b6' },
  police: { name: 'Công an – đặc tình', color: '#34495e' },
};
// Chỗ mặc chọn được cho nhân vật (theo thứ tự hiện trong công cụ)
export const LOOK_SLOTS = ['shirt', 'pants', 'shoes', 'helmet', 'cap', 'face', 'acc', 'bag', 'hands', 'wrist', 'uniform'];

const chars = (rel) => rel?.characters || {};
const links = (rel) => rel?.links || [];

// Nhân vật gắn với người trong cốt truyện (mã danh bạ / người lạ trong story.json)
export function charOfStory(id, rel = REL) {
  if (!id) return null;
  const e = Object.entries(chars(rel)).find(([, c]) => c.story === id);
  return e ? { id: e[0], ...e[1] } : null;
}
// Nhân vật gắn với NPC của địa điểm
export function charOfPlace(placeId, rel = REL) {
  if (!placeId) return null;
  const e = Object.entries(chars(rel)).find(([, c]) => c.place === placeId);
  return e ? { id: e[0], ...e[1] } : null;
}

// Dây đang có hiệu lực giữa 2 nhân vật ở chương `chapter` (số, 1 = chương 1; null = không xét chương)
export function linkBetween(a, b, chapter = null, rel = REL) {
  return links(rel).find((l) => ((l.a === a && l.b === b) || (l.a === b && l.b === a)) && (chapter == null || ((l.from ?? 1) <= chapter && (l.to == null || chapter <= l.to)))) || null;
}
// Chiều của dây nhìn từ nhân vật `from`: { self (tự xưng), call (gọi người kia), label, feel }
export function sideOf(l, from) {
  return (l.a === from ? l.ab : l.ba) || {};
}

// Xưng hô của nhân vật `charId` khi nói với người chơi, theo dây đã vẽ (thiếu ô nào thì đoán như cũ theo tên).
// Trả về tham số cho fmt(): {toi} {ban} {khach} {minh} {anhchi} (+ chữ hoa đầu). Không có dây → null.
export function voiceOfChar(charId, playerGender = 'm', chapter = null, rel = REL) {
  const c = chars(rel)[charId];
  if (!c || charId === PLAYER) return null;
  const l = linkBetween(charId, PLAYER, chapter, rel);
  if (!l) return null;
  const base = pronouns(personOf(c.name || '', { gender: c.gender || undefined }), playerGender);
  const them = sideOf(l, charId), me = sideOf(l, PLAYER);
  const pick = (v, d) => (String(v || '').trim() ? String(v).trim() : d);
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const toi = pick(them.self, base.toi), ban = pick(them.call, base.ban), minh = pick(me.self, ban), khach = pick(me.call, toi);
  return { ...base, toi, Toi: cap(toi), ban, Ban: cap(ban), minh, Minh: cap(minh), khach, Khach: cap(khach) };
}
// Xưng hô theo người nói trong cốt truyện: mã người trong story.json, hoặc 'place:<mã địa điểm>' (NPC của địa điểm)
export function voiceOf(who, playerGender = 'm', chapter = null, rel = REL) {
  const s = String(who || '');
  const c = s.startsWith('place:') ? charOfPlace(s.slice(6), rel) : charOfStory(s, rel);
  return c ? voiceOfChar(c.id, playerGender, chapter, rel) : null;
}

// Món đồ của một bộ đồ: { slot: món goods.json } (mã không còn / sai chỗ mặc thì bỏ)
export function wornOf(outfit, goods = GOODS) {
  const out = {};
  for (const [slot, id] of Object.entries(outfit?.worn || {})) {
    const g = goods[id];
    if (g && g.type === 'outfit' && g.slot === slot) out[slot] = g;
  }
  return out;
}
const hexNum = (c, d) => (/^#[0-9a-f]{6}$/i.test(c || '') ? parseInt(c.slice(1), 16) : d);
// Tham số makePerson cho nhân vật (bộ đồ outfitId, không có thì bộ đầu tiên). Nhân vật chưa có ngoại hình riêng → null
export function lookOfChar(c, outfitId = null, goods = GOODS) {
  if (!c?.look) return null;
  const outfits = c.outfits || [];
  const o = outfits.find((x) => x.id === outfitId) || outfits[0] || null;
  const L = c.look;
  const gender = L.gender === 'f' || L.gender === 'm' ? L.gender : c.gender === 'f' ? 'f' : 'm';
  return {
    ...outfitLook(wornOf(o, goods)),
    gender,
    hairStyle: L.hairStyle || (gender === 'f' ? 'long' : 'short'),
    hair: hexNum(L.hair, 0x1b1b1b),
    skin: hexNum(L.skin, 0xf1c27d),
    scale: Number.isFinite(L.scale) && L.scale > 0 ? L.scale : 1,
  };
}

// Số chương (1, 2…) theo tiến độ cốt truyện: đang ở chương nào; đã xong hết thì sau chương cuối
export function chapterNum(story, storyData) {
  const list = storyData?.chapters || [];
  const i = story?.ch ? list.findIndex((c) => c.id === story.ch) : -1;
  return i >= 0 ? i + 1 : (story?.done?.length || 0) + 1;
}
