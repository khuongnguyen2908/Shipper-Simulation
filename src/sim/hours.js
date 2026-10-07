// KHUNG GIỜ dùng chung (thuần dữ liệu, chạy được trong Node).
// Một khung giờ có thể là:
//   null / bỏ trống        → cả ngày
//   [8, 21]                → một đoạn (giờ, được lẻ: 7.5 = 7:30)
//   [[7.5, 11.5], [13, 17]] → nhiều đoạn (vd nghỉ trưa)
//   "hanhChinh"            → khung giờ mẫu (places.json → hourPresets): sửa mẫu thì mọi nơi dùng mẫu đổi theo
import placesRaw from '../data/places.json' with { type: 'json' };

let PRESETS = placesRaw.hourPresets || {};
// Công cụ ?editor gọi khi đang sửa khung giờ mẫu (chưa lưu)
export function setHourPresets(p) {
  PRESETS = p || {};
}
export const hourPresets = () => PRESETS;

const isRange = (r) => Array.isArray(r) && r.length === 2 && typeof r[0] === 'number' && typeof r[1] === 'number';

// → danh sách đoạn [[a,b], …], hoặc null = cả ngày. Mẫu không tồn tại → null (bộ kiểm tra báo lỗi riêng)
export function ranges(h, presets = PRESETS) {
  if (h == null) return null;
  if (typeof h === 'string') return presets[h] ? ranges(presets[h].ranges, presets) : null;
  if (isRange(h)) return [h];
  if (Array.isArray(h) && h.every(isRange)) return h.length ? h : null;
  return null;
}

// Đang trong khung giờ không (minutes = phút trong ngày)
export function inHours(h, minutes, presets = PRESETS) {
  const r = ranges(h, presets);
  if (!r) return true;
  const x = (((minutes % 1440) + 1440) % 1440) / 60; // đồng hồ chạy liên tục → lấy giờ trong ngày
  return r.some(([a, b]) => x >= a && x < b);
}

// 7.5 → "07:30"
export function fmtTime(x) {
  const hh = Math.floor(x + 1e-9);
  const mm = Math.round((x - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
// → "07:30–11:30, 13:00–17:00" ('' = cả ngày)
export function fmtHours(h, presets = PRESETS) {
  const r = ranges(h, presets);
  return r ? r.map(([a, b]) => `${fmtTime(a)}–${fmtTime(b)}`).join(', ') : '';
}
// Tổng số giờ mở trong ngày (24 = cả ngày)
export function totalHours(h, presets = PRESETS) {
  const r = ranges(h, presets);
  return r ? r.reduce((s, [a, b]) => s + (b - a), 0) : 24;
}

// Lỗi của một khung giờ (null = hợp lệ). Mỗi đoạn: 0 ≤ đầu < cuối ≤ 24; các đoạn không chồng nhau.
export function hoursProblem(h, presets = PRESETS) {
  if (h == null) return null;
  if (typeof h === 'string') return presets[h] ? null : `Khung giờ mẫu "${h}" không tồn tại.`;
  const list = isRange(h) ? [h] : Array.isArray(h) && h.length && h.every(isRange) ? h : null;
  if (!list) return 'Khung giờ phải là các đoạn [giờ đầu, giờ cuối].';
  for (const [a, b] of list) if (!(a >= 0 && b <= 24 && a < b)) return 'Mỗi đoạn: giờ đầu < giờ cuối, trong 0–24.';
  const sorted = [...list].sort((p, q) => p[0] - q[0]);
  for (let i = 1; i < sorted.length; i++) if (sorted[i][0] < sorted[i - 1][1]) return 'Các đoạn giờ bị chồng lên nhau.';
  return null;
}

// Ghi gọn: 1 đoạn → [a,b]; nhiều đoạn → [[a,b],…] (xếp theo giờ)
export function packRanges(list) {
  const sorted = [...list].sort((p, q) => p[0] - q[0]);
  return sorted.length === 1 ? [...sorted[0]] : sorted.map((r) => [...r]);
}
