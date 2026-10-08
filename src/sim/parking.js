// ĐẬU XE (thuần dữ liệu, chạy được trong Node). Số liệu: balance.json → parking (thẻ ⚖️ Cân bằng).
// Xuống xe ngoài đường thì sau graceMin phút bắt đầu có rủi ro mỗi phút:
//   - dán phạt (ticket): một lần mỗi lần đậu
//   - bị cẩu (tow): trong giờ phường làm (towFrom–towTo), về bãi giữ xe gần nhất → tới đó chuộc
//   - trộm ban đêm (theft): hút xăng, bẻ đồ → xe hư; một lần mỗi lần đậu
// An toàn: gửi ở bãi giữ xe (cảnh quan kiểu "Bãi giữ xe", trả phí), đậu gần phòng trọ, gửi bảo vệ chung cư.
import { PARKING } from '../data/balance.js';
import { isDark, tod } from './clock.js';
import { lookOf } from '../data/looks.js';

// xác suất mỗi giờ → mỗi phút
const perMin = (pHour) => 1 - Math.pow(1 - Math.max(0, Math.min(0.999, pHour || 0)), 1 / 60);

// Bãi giữ xe (cảnh quan) chứa điểm (x, z), hoặc null
export function parkingLotAt(places, x, z) {
  return places.find((p) => p.kind === 'scenery' && lookOf(p) === 'parkingLot' && x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) || null;
}
// Bãi giữ xe gần điểm (x, z) nhất (để cẩu xe về), hoặc null nếu bản đồ chưa có bãi nào
export function nearestParkingLot(places, x, z) {
  let best = null, bd = Infinity;
  for (const p of places) {
    if (p.kind !== 'scenery' || lookOf(p) !== 'parkingLot') continue;
    const d = Math.hypot((p.x0 + p.x1) / 2 - x, (p.z0 + p.z1) / 2 - z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
// Đậu ở đây có an toàn không (không tính bãi giữ xe — bãi phải trả tiền gửi)
export function safeSpot(places, x, z, P = PARKING) {
  const home = places.find((p) => p.kind === 'home');
  return !!home && Math.hypot(home.door.x - x, home.door.z - z) <= (P.homeSafeM ?? 12);
}

// Mỗi phút xe đứng ngoài đường: trả về 'ticket' | 'tow' | 'theft' | null
// parked: { since, safe, ticketed, robbed } · canTow: bản đồ có bãi để cẩu về và xe không chở hàng
export function parkingRoll(rng, now, parked, { canTow = true, hasCargo = false } = {}, P = PARKING) {
  if (!parked || parked.safe) return null;
  if (now - parked.since < (P.graceMin ?? 20)) return null;
  const h = tod(now) / 60;
  if (isDark(now)) {
    if (!parked.robbed && !hasCargo && rng.next() < perMin(P.theftPerHour)) return 'theft';
    return null;
  }
  if (canTow && !hasCargo && h >= (P.towFrom ?? 7) && h < (P.towTo ?? 18) && rng.next() < perMin(P.towPerHour)) return 'tow';
  if (!parked.ticketed && rng.next() < perMin(P.ticketPerHour)) return 'ticket';
  return null;
}
