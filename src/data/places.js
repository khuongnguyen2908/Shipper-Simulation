// Bố cục thành phố: tên đường và các địa điểm — dữ liệu ở places.json
// (sửa bằng công cụ ?editor, thẻ Địa điểm & NPC).
// Thành phố là lưới 5×5 khối nhà; mỗi khối có 8 lô quanh mép:
//   N0 N1 N2 (mặt bắc) · S0 S1 S2 (mặt nam) · W1 (tây) · E1 (đông) · C (sân giữa, chỉ vào được qua hẻm)
//   'N' / 'S' = cả dãy (dùng cho tòa nhà lớn)
// Trục x: đông (+) / tây (−). Trục z: nam (+) / bắc (−).
import raw from './places.json' with { type: 'json' };
import { colorsToNumbers } from './balance.js';

export const STREETS_X = raw.streetsX; // đường dọc, tây → đông
export const STREETS_Z = raw.streetsZ; // đường ngang, bắc → nam
export const MAIN_ROADS = raw.mainRoads; // đường chính hay kẹt giờ cao điểm
export const ALLEY = raw.alley; // hẻm 42: lô bỏ trống làm lối vào sân giữa
// Địa điểm đã đặt trên bản đồ (có khối + lô). Địa điểm mới tạo trong ?editor nằm "chờ" trong danh sách,
// game bỏ qua cho tới khi được kéo vào bản đồ ở thẻ 🏗️ Xây dựng.
export const isPlaced = (p) => Array.isArray(p?.block) && p.block.length === 2 && typeof p.lot === 'string';
export const PLACES = colorsToNumbers(raw.places.filter(isPlaced));
export const CUSTOMER_NAMES = raw.customerNames;

// Địa điểm mà code gọi thẳng theo mã → không được xóa/đổi mã trong công cụ
export const REQUIRED_PLACES = ['home', 'gas', 'gear', 'garage', 'cafe', 'taphoa', 'gate', 'apartment', 'market'];
