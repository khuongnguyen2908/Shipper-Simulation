// Các loại món hàng — dữ liệu ở items.json (sửa bằng công cụ ?editor, thẻ Vật phẩm).
// traits = đặc tính vật lý (xem src/sim/ItemPhysics.js):
//  hot: nguội dần · cold: tan theo thời gian/nắng · liquid: đổ khi xóc/phanh
//  fragile: hỏng khi va chạm · paper: hộp giấy, ướt mưa là hỏng · passenger: khách xe ôm
import raw from './items.json' with { type: 'json' };
import { fmt } from '../content/index.js';

export const ITEMS = raw;

// Danh sách đặc tính mà code vật lý hiểu được (không thêm được từ công cụ)
export const TRAIT_IDS = ['hot', 'cold', 'liquid', 'fragile', 'paper', 'passenger'];
const TRAIT_ICON = { hot: '🔥', cold: '❄️', liquid: '💧', fragile: '⚠️', paper: '📦', passenger: '🧍' };

export function traitLabel(t) {
  return { icon: TRAIT_ICON[t] || '•', text: fmt(`trait.${t}`) };
}
