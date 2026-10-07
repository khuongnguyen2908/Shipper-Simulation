// ĐỒNG HỒ 24H (thuần dữ liệu, chạy được trong Node).
// Thời gian trong game là SỐ PHÚT TUYỆT ĐỐI tính từ 00:00 ngày 1, chạy liên tục (không quay vòng):
// ngày 1 bắt đầu 06:00 = phút 360, 06:00 ngày 2 = phút 1800…  Ngày mới bắt đầu lúc TIME.dayStart (06:00).
// Luật theo giờ trong ngày (giờ mở cửa, nắng, cao điểm…) dùng tod() = phút trong ngày 0–1439.
import { TIME, NIGHT } from '../data/balance.js';

export const DAY = 1440;
// phút trong ngày (0–1439)
export const tod = (m) => ((Math.floor(m) % DAY) + DAY) % DAY;
// ngày thứ mấy (đổi ngày lúc 06:00)
export const dayOf = (m) => Math.floor((m - TIME.dayStart) / DAY) + 1;
// phút tuyệt đối lúc ngày `d` bắt đầu (06:00)
export const dayStartAt = (d) => (d - 1) * DAY + TIME.dayStart;
// phút tuyệt đối của giờ `hour` (0–24, được lẻ) trong ngày chơi `d` (ngày chơi kéo dài 06:00 → 06:00 hôm sau)
export function atHour(d, hour) {
  const off = (((hour * 60 - TIME.dayStart) % DAY) + DAY) % DAY;
  return dayStartAt(d) + off;
}
// Trời tối (đường vắng, khó thấy ổ gà): từ NIGHT.start tới NIGHT.end giờ (qua nửa đêm)
export function isDark(m, night = NIGHT) {
  const h = tod(m) / 60, a = night.start, b = night.end;
  return a > b ? h >= a || h < b : h >= a && h < b;
}
// "07:05"
export const fmtClock = (m) => `${String(Math.floor(tod(m) / 60)).padStart(2, '0')}:${String(tod(m) % 60).padStart(2, '0')}`;
// số phút từ `now` tới lần kế tiếp đồng hồ chỉ `hour` giờ (luôn > 0)
export function minutesUntil(now, hour) {
  const diff = (((hour * 60 - tod(now)) % DAY) + DAY) % DAY;
  return diff || DAY;
}
