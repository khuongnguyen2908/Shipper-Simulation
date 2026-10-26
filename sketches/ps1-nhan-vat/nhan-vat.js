// PHÁC HỌA (không vào game): anh Đạt + nhân vật chính nam / nữ kiểu PS1 — giữ mô hình game, vẽ lại mặt anime pixel + vải bẩn.
// Mở: npm run dev → http://localhost:5180/sketches/ps1-nhan-vat/nhan-vat.html
import { outfitLook, GOODS } from '../../src/data/goods.js';
import { lookOfChar } from '../../src/data/relations.js';
import REL from '../../src/data/relations.json' with { type: 'json' };
import { gallery } from './ps1.js';

// đồ khởi đầu của người chơi (áo thun xám cũ, quần dài cũ, giày trắng cũ)
const START = outfitLook({ shirt: GOODS.aoThuong, pants: GOODS.quanDaiCu, shoes: GOODS.giayTrangCu });
const CHARS = [
  {
    look: lookOfChar(REL.characters.man, 'thuongNgay'), female: false, turn: -0.28,
    face: { skin: '#e0ac69', eye: { rx: 7, ry: 3.1, lid: 1, tilt: 1.7, iris: ['#0d0d14', '#24242f', '#3e3e52', '#5a5a70'], lash: 2, flick: false, lower: false, glint: 1 },
      brow: { color: '#141010', w: 2, y: 19, tilt: 1.5 }, mouth: 'smirk', blush: 0, noseLine: true },
  },
  {
    look: { ...START, gender: 'm', hairStyle: 'short', hair: 0x1b1b1b, skin: 0xf1c27d }, female: false, turn: 0.15,
    // bớt "cute": mắt dẹt hơn, 1 đốm sáng, mày phẳng, miệng thẳng, không má hồng
    face: { skin: '#f1c27d', eye: { rx: 6, ry: 3.6, lid: 1, tilt: 0.4, iris: ['#120b06', '#3a220f', '#5e3a1c', '#7e5432'], lash: 2, flick: false, lower: false, glint: 1 },
      brow: { color: '#1b1b1b', w: 2, y: 19, tilt: 0.5 }, mouth: 'flat', blush: 0, noseLine: true },
  },
  {
    look: { ...START, gender: 'f', hairStyle: 'long', hair: 0x1b1b1b, skin: 0xf1c27d }, female: true, turn: -0.12,
    face: { skin: '#f1c27d', eye: { rx: 6.5, ry: 4.2, lid: 1, tilt: 0.8, iris: ['#140a05', '#3e2412', '#68401e', '#8a5c34'], lash: 2, flick: true, lower: true, glint: 1 },
      brow: { color: '#1e140e', w: 1, y: 19, tilt: 0.2 }, mouth: 'smile', blush: 0, noseLine: false },
  },
];

const NAMES = [['😎 Anh Đạt', 'mắt dài xếch, mày rậm, cười nhếch · bộ "Thường ngày"'], ['🙂 Nhân vật chính — nam', 'mắt dẹt, mày phẳng, miệng thẳng · đồ khởi đầu'], ['🙂 Nhân vật chính — nữ', 'mắt hơi xếch, mi mảnh, hơi cười · đồ khởi đầu']];
CHARS.forEach((c, i) => { [c.name, c.note] = NAMES[i]; });
gallery(CHARS, document.querySelector('.wrap'));
