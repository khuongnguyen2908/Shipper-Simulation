// Luật chung cho địa điểm (thuần dữ liệu, chạy được trong Node):
import { inHours, fmtHours } from './hours.js';
export { fmtHours };
// giờ mở cửa, hoạt động làm được hôm nay, khung giờ làm điểm đến của đơn.

// Mở theo ngày: openDay = ngày bắt đầu có đơn (món). Không có = ngày 1.
export const openDayOf = (x) => (Number.isInteger(x?.openDay) && x.openDay > 1 ? x.openDay : 1);
// Mở theo chương (địa điểm): openChapter = chương cốt truyện bắt đầu mở cửa (vd 3 = đóng tới khi xong chương 2). Không có = chương 1.
export const openChapterOf = (x) => (Number.isInteger(x?.openChapter) && x.openChapter > 1 ? x.openChapter : 1);
// prog: tiến độ của người chơi — số ngày (kiểu cũ) hoặc { day, chap } (chap = chương đang chơi, 1 = chương 1;
// hết cốt truyện / bản lưu cũ = Infinity). Bỏ trống = không xét (vd công cụ, bộ thử cũ)
export const unlocked = (x, prog = null) => {
  if (prog == null) return true;
  const p = typeof prog === 'number' ? { day: prog } : prog;
  if (p.day != null && openDayOf(x) > p.day) return false;
  if (p.chap != null && openChapterOf(x) > p.chap) return false;
  return true;
};

// hours: khung giờ (xem sim/hours.js — một đoạn, nhiều đoạn, hoặc mã khung giờ mẫu); không có = mở cả ngày.
// Chưa tới chương mở cửa = đóng. prog: như unlocked
export function isOpen(place, minutes, prog = null) {
  if (!place) return true;
  if (!unlocked(place, prog)) return false;
  return inHours(place.hours, minutes);
}

// Trọng số làm điểm đến của đơn ('rideWeight' | 'foodWeight') tại thời điểm minutes
export function orderWeight(place, key, minutes, prog = null) {
  if (!unlocked(place, prog)) return 0;
  const o = place.orders;
  if (!o || !(o[key] > 0)) return 0;
  // khung giờ có đơn riêng; bỏ trống = theo giờ mở cửa
  if (!inHours(o.hours ?? place.hours, minutes)) return 0;
  return o[key];
}

// Đồ "dùng tại địa điểm": nơi có hoạt động cần món này / nơi bán món này
export const placesUsing = (goodsId, places) => places.filter((p) => (p.activities || []).some((a) => a.needs?.id === goodsId));
export const placesSelling = (goodsId, places) => places.filter((p) => (p.sells?.goods || []).includes(goodsId));
