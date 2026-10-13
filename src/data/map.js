// Bản đồ thành phố — dữ liệu ở map.json (sửa bằng ?editor, thẻ 🗺️ Bản đồ):
//  - size:   số khối mỗi chiều (lưới size × size khối, size + 1 đường mỗi chiều)
//  - blocks: kiểu hẻm của từng khối "bx,bz" → { alley, rot, walk } (không có = không hẻm)
//  - rivers: sông chạy dọc một con đường → { axis, line, from, to, bridges: [chỉ số ngã tư có cầu] }
//  - floodSegs: đoạn đường hay ngập { "x3:5": "low" (Trũng: ngập khi mưa to) | "tide" (Rất trũng: cả khi triều cường) }
//  - lights / cameras: ngã tư có đèn giao thông / có camera phạt nguội ["i,j", …] (thẻ 🗺️ Bản đồ → 🚦; chưa có lights = gợi ý tự động, sim/lights.js)
//    không có = gợi ý tự động theo sông (src/sim/flood.js)
// Tên đường, địa điểm vẫn ở places.json.
import raw from './map.json' with { type: 'json' };

export const MAP = raw;
