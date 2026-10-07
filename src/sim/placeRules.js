// Luật chung cho địa điểm (thuần dữ liệu, chạy được trong Node):
// giờ mở cửa, hoạt động làm được hôm nay, khung giờ làm điểm đến của đơn.

// Mở theo ngày: openDay = ngày khai trương (địa điểm) / ngày bắt đầu có đơn (món). Không có = ngày 1.
export const openDayOf = (x) => (Number.isInteger(x?.openDay) && x.openDay > 1 ? x.openDay : 1);
// day bỏ trống = không xét ngày (vd công cụ, bộ thử cũ)
export const unlocked = (x, day = null) => day == null || openDayOf(x) <= day;

// hours = [mở, đóng] tính bằng giờ (vd [16, 23]); không có = mở cả ngày. Chưa tới ngày khai trương = đóng.
export function isOpen(place, minutes, day = null) {
  if (!place) return true;
  if (!unlocked(place, day)) return false;
  if (!Array.isArray(place.hours)) return true;
  const h = minutes / 60;
  const [a, b] = place.hours;
  return h >= a && h < b;
}

export const fmtHours = (hours) => (Array.isArray(hours) ? `${String(hours[0]).padStart(2, '0')}:00–${String(hours[1]).padStart(2, '0')}:00` : '');

// Trọng số làm điểm đến của đơn ('rideWeight' | 'foodWeight') tại thời điểm minutes
export function orderWeight(place, key, minutes, day = null) {
  if (!unlocked(place, day)) return 0;
  const o = place.orders;
  if (!o || !(o[key] > 0)) return 0;
  const window = o.hours || place.hours;
  if (Array.isArray(window)) {
    const h = minutes / 60;
    if (h < window[0] || h >= window[1]) return 0;
  }
  return o[key];
}

// Đồ "dùng tại địa điểm": nơi có hoạt động cần món này / nơi bán món này
export const placesUsing = (goodsId, places) => places.filter((p) => (p.activities || []).some((a) => a.needs?.id === goodsId));
export const placesSelling = (goodsId, places) => places.filter((p) => (p.sells?.goods || []).includes(goodsId));
