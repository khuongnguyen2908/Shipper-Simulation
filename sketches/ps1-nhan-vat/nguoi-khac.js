// PHÁC HỌA (không vào game): các nhân vật cốt truyện khác kiểu PS1 — ngoại hình lấy đúng từ game (NPC địa điểm / sơ đồ quan hệ),
// mặt anime pixel theo tính cách, kiểu "không cute". Mở: npm run dev → http://localhost:5180/sketches/ps1-nhan-vat/nguoi-khac.html
import { npcLook } from '../../src/world/models.js';
import { colorsToNumbers } from '../../src/data/balance.js';
import { lookOfChar } from '../../src/data/relations.js';
import REL from '../../src/data/relations.json' with { type: 'json' };
import PLACES from '../../src/data/places.json' with { type: 'json' };
import { gallery, skinHex } from './ps1.js';

const placeLook = (id) => { const pl = PLACES.places.find((p) => p.id === id); return npcLook(pl.id, colorsToNumbers(pl.npc)); };
const charLook = (id, outfit) => lookOfChar(REL.characters[id], outfit);
// tròng mắt nâu (trên → dưới), xám đen
const BROWN = ['#140a05', '#3e2412', '#68401e', '#8a5c34'], DARK = ['#0d0b10', '#24202a', '#3c3644', '#544c5c'];
const make = (name, note, look, turn, face) => ({ name, note, look, turn, female: look.gender === 'f', face: { skin: skinHex(look), noseLine: false, blush: 0, ...face } });

const CHARS = [
  make('👩 Chị Linh', '27 · thân thiện · NPC tiệm trà', placeLook('tra'), -0.15,
    { eye: { rx: 6.5, ry: 4.4, lid: 1, tilt: 0.6, iris: BROWN, lash: 2, flick: true, lower: true, glint: 1 }, brow: { color: '#1e140e', w: 1, y: 18, tilt: -0.2 }, mouth: 'smile' }),
  make('👩 Chị Nhi', '27 · thân thiện · bộ "Thường ngày"', charLook('chiNhi', 'thuongNgay'), 0.15,
    { eye: { rx: 6.5, ry: 4.6, lid: 1, tilt: 0.3, iris: ['#1a0d06', '#4e2c14', '#7e5026', '#a87442'], lash: 2, flick: true, lower: true, glint: 1 }, brow: { color: '#3e2618', w: 1, y: 18, tilt: -0.3 }, mouth: 'smile' }),
  // không dễ thương: tròng nhỏ lộ lòng trắng, không đốm sáng, mí nặng, mày sát mắt chau lại, quầng mắt
  make('🧑 Anh Hoàng', '30 · hơi khó tính · bộ "Thường ngày"', charLook('nhanVatMoi', 'thuongNgay'), -0.2,
    { eye: { rx: 6.5, ry: 2.6, lid: 1, tilt: 0.9, irisK: 0.42, iris: DARK, lash: 3, flick: false, lower: true, glint: 0 }, brow: { color: '#0e0b0b', w: 2, y: 21, tilt: 2.4 }, mouth: 'frown', noseLine: true, scowl: true, bags: true }),
  make('👵 Dì Hai', '60 · tốt bụng, hay nhắc · chủ nhà trọ', placeLook('home'), 0.1,
    { eye: { rx: 5.5, ry: 3.2, lid: 1, tilt: -0.2, iris: DARK, lash: 1, flick: false, lower: false, glint: 1 }, brow: { color: '#7a7a7a', w: 1, y: 19, tilt: -0.6 }, mouth: 'smile', old: true }),
  make('🧓 Dượng Hai', '62 · xởi lởi, biết hết chuyện trong khu', placeLook('dichvu4'), -0.1,
    { eye: { rx: 5.5, ry: 2.6, lid: 1, tilt: -0.3, iris: DARK, lash: 1, flick: false, lower: false, glint: 1 }, brow: { color: '#8d8d8d', w: 2, y: 19, tilt: -0.5 }, mouth: 'grin', old: true }),
  make('🛵 Chú Tư xe ôm', '62 · chịu chơi, bông đùa', charLook('chuTu', 'thuongNgay'), 0.2,
    { eye: { rx: 5.5, ry: 3, lid: 1, tilt: 0.3, iris: DARK, lash: 1, flick: false, lower: false, glint: 1 }, brow: { color: '#9a9a9a', w: 2, y: 19, tilt: -0.3 }, mouth: 'smirk', old: true, stubble: true }),
  make('👧 Em Minh', '18 · dễ thương, thân thiện · nhà sách', placeLook('nhasach'), -0.1,
    { eye: { rx: 6.5, ry: 4.8, lid: 1, tilt: 0.2, iris: BROWN, lash: 2, flick: true, lower: true, glint: 1 }, brow: { color: '#1e140e', w: 1, y: 18, tilt: -0.4 }, mouth: 'smile', blush: 1 }),
  make('💪 Tí Đô', '34 · hung hăng, ít nói · bộ "Áo ba lỗ"', charLook('tiDo', 'danhNhau'), 0.25,
    { eye: { rx: 6, ry: 2.4, lid: 1, tilt: -0.6, irisK: 0.36, iris: ['#1a1410', '#3a2a1e', '#4e3a2a', '#5e4836'], lash: 3, flick: false, lower: true, glint: 0 }, brow: { color: '#0e0b0b', w: 3, y: 21, tilt: 2.8 }, mouth: 'frown', noseLine: true, stubble: true, scar: true, scowl: true, bags: true, cheekLines: true }),
];
gallery(CHARS, document.querySelector('.wrap'));
