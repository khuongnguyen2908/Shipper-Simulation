// Bản đồ thành phố — dữ liệu ở map.json (sửa bằng ?editor, thẻ 🗺️ Bản đồ):
//  - size:   số khối mỗi chiều (lưới size × size khối, size + 1 đường mỗi chiều)
//  - blocks: kiểu hẻm của từng khối "bx,bz" → { alley, rot, walk } (không có = không hẻm)
//  - rivers: sông chạy dọc một con đường → { axis, line, from, to, bridges: [chỉ số ngã tư có cầu] }
// Tên đường, địa điểm vẫn ở places.json.
import raw from './map.json' with { type: 'json' };

export const MAP = raw;
