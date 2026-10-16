// =============================================================
// TƯƠNG TÁC — Dùng chung: khoảng cách, nói chuyện (say), NPC của địa điểm, xưng hô
// (một phần của src/interactions.js — mọi thao tác người chơi; chữ lấy từ vi.json qua fmt())
// =============================================================
import { STORY } from '../sim/story.js';
import { voiceOf, chapterNum } from '../data/relations.js';
import { fmt, has } from '../content/index.js';
import { personOf, pronouns } from '../sim/people.js';
import { fmtClock } from '../sim/clock.js';
import { splitPages } from '../ui/modal.js';

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function say(g, speaker, portrait, text, choices = [{ label: fmt('dlg.ok') }], extra = {}) {
  g.modal.show({ speaker, portrait, text, choices, ...extra });
  // ghi lời NPC vào log chat bên trái (trang đầu, bỏ định dạng, cắt ngắn)
  const plain = splitPages(String(text).replace(/<[^>]+>/g, ''))[0] || '';
  g.chatCh?.local('npc', speaker, plain.length > 160 ? plain.slice(0, 157) + '…' : plain, { time: fmtClock(g.clockMin) });
}

// NPC của một địa điểm (tên + chân dung)
export function npc(g, placeId) {
  const pl = g.layout.placeById[placeId];
  if (pl && !pl.npc && pl.kind === 'scenery') return { name: pl.name, portrait: pl.icon || '🌳' }; // cảnh quan: không có người, lời là của nơi đó
  if (pl && !pl.npc && pl.kind === 'charger') return { name: pl.name, portrait: pl.icon || '🔌' }; // trụ sạc tự phục vụ
  return pl && pl.npc ? pl.npc : { name: fmt('npc.default.name'), portrait: '🙂' };
}

// Lời thoại riêng của địa điểm (npc.<id>.<loại>), không có thì dùng lời mặc định
export function placeLine(placeId, kind, params) {
  const k = `npc.${placeId}.${kind}`;
  return has(k) ? fmt(k, params) : fmt(`npc.default.${kind}`, params);
}

// XƯNG HÔ (sim/people.js): tham số {toi} {ban} {khach} {minh} {anhchi} theo người nói (giới tính + tuổi + vai) và giới tính nhân vật mình
export const voice = (g, name, opts = {}) => pronouns(personOf(name, opts), g.gs.profile?.gender);
export const custVoice = (g, o = g.om.order) => voice(g, o?.customer || ''); // khách của đơn
// người ở quán / tiệm: NPC có dây quan hệ với người chơi (sơ đồ /?relationship) thì xưng hô theo dây, không thì đoán theo tên
export const npcVoice = (g, n) => {
  const pl = n && g.layout.places.find((p) => p.npc === n);
  return (pl && voiceOf(`place:${pl.id}`, g.gs.profile?.gender, chapterNum(g.gs.story, STORY))) || voice(g, n?.name || '', { gender: n?.gender, role: 'staff' });
};
export const pedVoice = (g, ped) => pronouns(ped.who || personOf(ped.name), g.gs.profile?.gender); // người đi đường
