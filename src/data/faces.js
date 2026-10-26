// =============================================================
// KIỂU MẶT ANIME (vẽ pixel 64×64 áp lên mặt người — world/faces.js vẽ, world/person.js gắn vào).
// Dữ liệu thuần: không Three.js, không DOM (chạy được trong Node / công cụ).
// Mỗi kiểu: label (tên trong công cụ), g ('m' | 'f' | null = ai cũng được), pool (người đi đường tự lấy được: 'young' | 'old'),
//   eye { rx, ry (nửa rộng / nửa cao, điểm ảnh), lid (số hàng mí che), tilt (+ = đuôi mắt xếch lên), irisK (cỡ tròng, nhỏ = dữ),
//         lash (độ dày viền mi), flick (đuôi mi hất), lower (mi dưới), glint (0 / 1 / 2 đốm sáng) }, iris (màu mắt mặc định — EYE_COLORS),
//   brow { w (độ dày), y (hàng), tilt (+ = đầu mày chau xuống) }, mouth ('smile' | 'flat' | 'grin' | 'smirk' | 'frown' | 'open'),
//   blush (0 / 1 / 2), noseLine (sống mũi), old (nếp nhăn), stubble (râu lún phún), scar (sẹo má), scowl (nếp chau giữa mày),
//   bags (quầng mắt), cheekLines (rãnh má)
// Nhân vật cốt truyện / NPC địa điểm chọn kiểu ở ?relationship / ?editor (faceStyle = mã FACES, eyeColor = mã EYE_COLORS);
// người chơi: chinhNam / chinhNu.
// =============================================================

// màu tròng mắt: [trên cùng (tối) … dưới cùng (sáng)]
export const EYE_COLORS = {
  nau: { label: 'Nâu', c: ['#140a05', '#3e2412', '#68401e', '#8a5c34'] },
  nauSang: { label: 'Nâu sáng', c: ['#1a0d06', '#4e2c14', '#7e5026', '#a87442'] },
  hoPhach: { label: 'Hổ phách', c: ['#1c0e06', '#5a3212', '#9a6230', '#d9a060'] },
  den: { label: 'Đen', c: ['#0d0b10', '#24202a', '#3c3644', '#544c5c'] },
  xamXanh: { label: 'Xám xanh', c: ['#1d1830', '#3d5294', '#6f8fd0', '#a9c4ee'] },
};

export const FACES = {
  chinhNam: { label: 'Nhân vật chính nam — mắt dẹt, mày phẳng, miệng thẳng', g: 'm', pool: 'young', iris: 'nau',
    eye: { rx: 6, ry: 3.6, lid: 1, tilt: 0.4, lash: 2, glint: 1 }, brow: { w: 2, y: 19, tilt: 0.5 }, mouth: 'flat', noseLine: true },
  namHien: { label: 'Nam hiền — mắt mở, hơi cười', g: 'm', pool: 'young', iris: 'nau',
    eye: { rx: 6, ry: 4, lid: 1, tilt: 0.2, lash: 2, lower: true, glint: 1 }, brow: { w: 2, y: 18, tilt: -0.2 }, mouth: 'smile' },
  ngau: { label: 'Ngầu, đẹp trai — mắt dài xếch, cười nhếch (anh Đạt)', g: 'm', pool: 'young', iris: 'den',
    eye: { rx: 7, ry: 3.1, lid: 1, tilt: 1.7, lash: 2, glint: 1 }, brow: { w: 2, y: 19, tilt: 1.5 }, mouth: 'smirk', noseLine: true },
  khoTinh: { label: 'Khó tính, lạnh — tròng nhỏ, mày chau (anh Hoàng)', g: null, pool: 'young', iris: 'den',
    eye: { rx: 6.5, ry: 2.6, lid: 1, tilt: 0.9, irisK: 0.42, lash: 3, lower: true, glint: 0 }, brow: { w: 2, y: 21, tilt: 2.4 }, mouth: 'frown',
    noseLine: true, scowl: true, bags: true },
  duTon: { label: 'Dữ tợn — mắt nhỏ trễ, sẹo, râu (Tí Đô)', g: 'm', iris: 'nau',
    eye: { rx: 6, ry: 2.4, lid: 1, tilt: -0.6, irisK: 0.36, lash: 3, lower: true, glint: 0 }, brow: { w: 3, y: 21, tilt: 2.8 }, mouth: 'frown',
    noseLine: true, stubble: true, scar: true, scowl: true, bags: true, cheekLines: true },
  chinhNu: { label: 'Nhân vật chính nữ — mắt hơi xếch, mi mảnh, hơi cười', g: 'f', pool: 'young', iris: 'nau',
    eye: { rx: 6.5, ry: 4.2, lid: 1, tilt: 0.8, lash: 2, flick: true, lower: true, glint: 1 }, brow: { w: 1, y: 19, tilt: 0.2 }, mouth: 'smile' },
  diuDang: { label: 'Dịu dàng, thân thiện (chị Linh)', g: 'f', pool: 'young', iris: 'nau',
    eye: { rx: 6.5, ry: 4.4, lid: 1, tilt: 0.6, lash: 2, flick: true, lower: true, glint: 1 }, brow: { w: 1, y: 18, tilt: -0.2 }, mouth: 'smile' },
  tuoiTan: { label: 'Tươi tắn — mắt tròn hơn (chị Nhi)', g: 'f', pool: 'young', iris: 'nauSang',
    eye: { rx: 6.5, ry: 4.6, lid: 1, tilt: 0.3, lash: 2, flick: true, lower: true, glint: 1 }, brow: { w: 1, y: 18, tilt: -0.3 }, mouth: 'smile' },
  treTrung: { label: 'Trẻ trung, má hơi ửng (em Minh)', g: 'f', pool: 'young', iris: 'nau',
    eye: { rx: 6.5, ry: 4.8, lid: 1, tilt: 0.2, lash: 2, flick: true, lower: true, glint: 1 }, brow: { w: 1, y: 18, tilt: -0.4 }, mouth: 'smile', blush: 1 },
  baHien: { label: 'Bà hiền — nếp nhăn, cười (Dì Hai)', g: 'f', pool: 'old', iris: 'den',
    eye: { rx: 5.5, ry: 3.2, lid: 1, tilt: -0.2, lash: 1, glint: 1 }, brow: { w: 1, y: 19, tilt: -0.6 }, mouth: 'smile', old: true },
  ongXoiLoi: { label: 'Ông xởi lởi — mắt híp, cười toe (Dượng Hai)', g: 'm', pool: 'old', iris: 'den',
    eye: { rx: 5.5, ry: 2.6, lid: 1, tilt: -0.3, lash: 1, glint: 1 }, brow: { w: 2, y: 19, tilt: -0.5 }, mouth: 'grin', old: true },
  ongBongDua: { label: 'Ông bông đùa — cười nhếch, râu lún phún (chú Tư)', g: 'm', pool: 'old', iris: 'den',
    eye: { rx: 5.5, ry: 3, lid: 1, tilt: 0.3, lash: 1, glint: 1 }, brow: { w: 2, y: 19, tilt: -0.3 }, mouth: 'smirk', old: true, stubble: true },
};
export const MOUTHS = ['smile', 'flat', 'grin', 'smirk', 'frown', 'open'];
// Danh sách chọn cho công cụ (?editor / ?relationship)
export const faceOptions = (gender = null) => Object.entries(FACES).filter(([, f]) => !gender || !f.g || f.g === gender).map(([id, f]) => [id, f.label]);
export const eyeOptions = () => Object.entries(EYE_COLORS).map(([id, e]) => [id, e.label]);

// Người chơi: không chọn mặt — theo giới tính
export const playerFace = (gender) => (gender === 'f' ? 'chinhNu' : 'chinhNam');

// Người không đặt kiểu mặt (người đi đường, khách, NPC chưa chọn): lấy 1 kiểu hợp giới tính + tuổi, cố định theo ngoại hình
// (băm màu áo / quần / tóc / da — không gọi thêm số ngẫu nhiên nên không làm đổi ngoại hình người cũ)
export function defaultFace({ gender = 'm', old = false, key = 0 } = {}) {
  const want = old ? 'old' : 'young';
  const list = Object.keys(FACES).filter((id) => FACES[id].pool === want && (!FACES[id].g || FACES[id].g === gender));
  const pool = list.length ? list : Object.keys(FACES).filter((id) => FACES[id].pool === want);
  let h = Math.floor(Math.abs(key)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return pool[((h ^ (h >>> 16)) >>> 0) % pool.length]; // >>> 0: luôn dương (không thì ra chỉ số âm → không có kiểu mặt)
}
