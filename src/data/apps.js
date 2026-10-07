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

// khung giờ của loại đơn / loại khách: một đoạn, nhiều đoạn, hoặc mã khung giờ mẫu (xem sim/hours.js)
export const typeOpen = (t, now) => inHours(t.hours, now);

// Giờ cao điểm (đơn nhiều hơn, quán đông, có phụ phí)
export function isPeak(now, app = APP) {
  return (app.peakHours || []).some((hours) => inHours(hours, now));
}

// Phụ phí cộng vào cước tại lúc có đơn
export function surchargeAt(now, raining, app = APP) {
  return (raining ? app.rainSurcharge || 0 : 0) + (isPeak(now, app) ? app.peakSurcharge || 0 : 0);
}
