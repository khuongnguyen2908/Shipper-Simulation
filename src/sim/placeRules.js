// Luật chung cho địa điểm (thuần dữ liệu, chạy được trong Node):
import { inHours, fmtHours } from './hours.js';
export { fmtHours };
// giờ mở cửa, hoạt động làm được hôm nay, khung giờ làm điểm đến của đơn.

// Mở theo ngày: openDay = ngày khai trương (địa điểm) / ngày bắt đầu có đơn (món). Không có = ngày 1.
export const openDayOf = (x) => (Number.isInteger(x?.openDay) && x.openDay > 1 ? x.openDay : 1);
// day bỏ trống = không xét ngày (vd công cụ, bộ thử cũ)
export const unlocked = (x, day = null) => day == null || openDayOf(x) <= day;

// hours: khung giờ (xem sim/hours.js — một đoạn, nhiều đoạn, hoặc mã khung giờ mẫu); không có = mở cả ngày.
// Chưa tới ngày khai trương = đóng.
export function isOpen(place, minutes, day = null) {
  if (!place) return true;
  if (!unlocked(place, day)) return false;
  return inHours(place.hours, minutes);
}

// Trọng số làm điểm đến của đơn ('rideWeight' | 'foodWeight') tại thời điểm minutes
export function orderWeight(place, key, minutes, day = null) {
  if (!unlocked(place, day)) return 0;
  const o = place.orders;
  if (!o || !(o[key] > 0)) return 0;
  // khung giờ có đơn riêng; bỏ trống = theo giờ mở cửa
  if (!inHours(o.hours ?? place.hours, minutes)) return 0;
  return o[key];
}

// Đồ "dùng tại địa điểm": nơi có hoạt động cần món này / nơi bán món này
export const placesUsing = (goodsId, places) => places.filter((p) => (p.activities || []).some((a) => a.needs?.id === goodsId));
export const placesSelling = (goodsId, places) => places.filter((p) => (p.sells?.goods || []).includes(goodsId));
