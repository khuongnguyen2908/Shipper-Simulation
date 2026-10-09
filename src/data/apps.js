// App giao hàng, loại đơn, loại khách xe ôm — dữ liệu ở apps.json (sửa bằng ?editor, thẻ 📱 App & Đơn).
//  - apps:       phí nền tảng, thuế, thưởng km, boa, phụ phí mưa / giờ cao điểm, luật tài khoản
//  - orderTypes: mỗi loại đơn thuộc một "kiểu xử lý" (kind) mà code hiểu:
//                  food (lấy món ở quán, chờ nấu) · ride (chở khách) · parcel (lấy hàng ở shop, có thể thu hộ COD / bị bom)
//  - riderTypes: các loại khách xe ôm (khách app, khách quen, khách say…)
import raw from './apps.json' with { type: 'json' };
import { inHours } from '../sim/hours.js';

export const APPS = raw.apps;
export const ORDER_TYPES = raw.orderTypes;
export const RIDER_TYPES = raw.riderTypes;
// App đang chạy (hiện chỉ có 1 app; dữ liệu để sẵn dạng nhiều app)
export const APP = Object.values(APPS)[0];

export const ORDER_KINDS = ['food', 'ride', 'parcel'];
// mục "Đón ở" của loại khách: mã đặc biệt = nhà dân (tick cùng địa điểm → đón ở nhà dân hoặc các địa điểm đó)
export const FROM_HOMES = 'nhaDan';

// khung giờ của loại đơn / loại khách: một đoạn, nhiều đoạn, hoặc mã khung giờ mẫu (xem sim/hours.js)
export const typeOpen = (t, now) => inHours(t.hours, now);

// Giờ cao điểm (đơn nhiều hơn, quán đông, có phụ phí)
export function isPeak(now, app = APP) {
  return (app.peakHours || []).some((hours) => inHours(hours, now));
}
// Khung giờ tính phụ phí đêm (không đặt = không có phụ phí đêm)
export function isNightFare(now, app = APP) {
  return app.nightHours != null && inHours(app.nightHours, now);
}
// Nhu cầu đơn theo giờ trong ngày: 1 = bình thường, 0,5 = thưa một nửa, 2 = dày gấp đôi (apps.json → demandByHour, 24 số)
export function demandAt(now, app = APP) {
  const h = Math.floor((((now % 1440) + 1440) % 1440) / 60);
  const v = Array.isArray(app.demandByHour) ? app.demandByHour[h] : 1;
  return Number.isFinite(v) && v >= 0 ? v : 1;
}

// Phụ phí cộng vào cước tại lúc có đơn: mưa + giờ cao điểm + đêm
export function surchargeAt(now, raining, app = APP) {
  return (raining ? app.rainSurcharge || 0 : 0) + (isPeak(now, app) ? app.peakSurcharge || 0 : 0) + (isNightFare(now, app) ? app.nightSurcharge || 0 : 0);
}
