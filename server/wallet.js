// =============================================================
// VÍ ONLINE (máy chủ giữ, đợt M2c): tiền của mỗi người nằm trên máy chủ, máy người chơi chỉ hiện lại.
//  - Tiền đơn: máy chủ tự cộng lúc giao xong (server/jobs.js tính) → khoản "tiền đơn" máy người chơi báo lên bị bỏ qua (không cộng 2 lần).
//  - Khoản thu khác: chỉ nhận lý do có trong EARN_CAP, kẹp tới mức trần theo dữ liệu game; lý do lạ (phím thử +100k, thưởng cốt truyện…) → 0.
//  - Khoản chi: luôn trừ (chi tiêu chỉ thiệt cho người chơi).
// Thuần logic (Node) — server/room.js gọi vào.
// =============================================================
import { BRANDS, ORDER_TYPES } from '../src/data/apps.js';
import { APP } from '../src/data/apps.js';
import { VEHICLES, RIDE_EVENTS } from '../src/data/balance.js';
import { ITEMS } from '../src/data/items.js';
import { GOODS } from '../src/data/goods.js';

const maxOf = (list, f) => list.reduce((m, x) => Math.max(m, f(x) || 0), 0);
// mức trần mỗi lần cho từng lý do thu (theo dữ liệu game — sửa dữ liệu ở ?editor thì trần đổi theo)
export const EARN_CAP = {
  depositBack: () => maxOf(Object.values(BRANDS), (b) => b.deposit), // nghỉ hãng: hoàn cọc
  policeReward: () => RIDE_EVENTS.policeReward ?? 30, // chở khách lừa tới đồn
  codRefund: () => maxOf(Object.values(ITEMS), (i) => i.cod), // hoàn tiền hàng thu hộ đã ứng
  codBack: () => 0, // tiền thu hộ khách trả lúc giao: máy chủ đã cộng cùng tiền đơn
  returnFee: () => 200, // đem trả hàng bom: phí trả hàng
  cancelComp: () => APP.cancelComp || 0, // khách hủy: tiền bồi thường
  sellVehicle: () => maxOf(Object.values(VEHICLES), (v) => v.price), // bán xe
  sellUsed: () => maxOf(Object.values(GOODS), (g) => g.price), // bán đồ cũ
};
// lý do "tiền đơn" (máy chủ đã cộng lúc giao) — máy người chơi báo lên thì bỏ qua
export const orderReason = (r) => !!ORDER_TYPES[r] || ['food', 'ride', 'parcel', 'express'].includes(r);

// Áp 1 khoản máy người chơi báo: trả về số tiền thực sự cộng / trừ trên máy chủ
export function applyTx(acc, tx) {
  const k = Number(tx?.k);
  if (!Number.isFinite(k) || k <= 0 || k > 1e6) return 0;
  const reason = String(tx.reason || '');
  let d = 0;
  if (tx.kind === 'spend') d = -k;
  else if (tx.kind === 'earn' && !orderReason(reason) && EARN_CAP[reason]) d = Math.min(k, EARN_CAP[reason]());
  acc.money = Math.round(((acc.money ?? 0) + d) * 10) / 10;
  return d;
}
