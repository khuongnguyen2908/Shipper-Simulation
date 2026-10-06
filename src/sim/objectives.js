// Danh sách mục tiêu trong ngày (tính lại từ GameState mỗi khung hình).
// optional = nhiệm vụ phụ; target = id địa điểm để chỉ đường. Chữ lấy từ kho chữ obj.*
import { fmt } from '../content/index.js';

export const ORDERS_GOAL = 5;

export function objectives(gs) {
  const list = [];
  if (gs.day === 1) {
    list.push({ id: 'mount', text: fmt('obj.mount'), done: gs.flags.mounted });
    list.push({ id: 'fuel', text: fmt('obj.fuel'), done: gs.flags.refueled, target: 'gas' });
    list.push({ id: 'online', text: fmt('obj.online'), done: gs.flags.online });
  }
  list.push({ id: 'first', text: fmt('obj.first'), done: gs.stats.completed >= 1 });
  list.push({ id: 'thermal', text: fmt('obj.thermal'), done: gs.bagSpec.insulation >= 0.5, target: 'gear' });
  list.push({ id: 'helmet', text: fmt('obj.helmet'), done: gs.effect('passengerSeat'), target: 'gear' });
  list.push({ id: 'orders', text: fmt('obj.orders', { goal: ORDERS_GOAL, n: Math.min(gs.stats.completed, ORDERS_GOAL) }), done: gs.stats.completed >= ORDERS_GOAL });
  const w = walletObjective(gs);
  if (w) list.push(w);
  list.push({ id: 'rent', text: fmt('obj.rent', { rent: gs.rent }), done: gs.rentPaid, target: 'home', final: true });
  return list;
}

// text: không có tiền tố "Phụ:" (HUD tự thêm cho nhiệm vụ phụ)
export function walletObjective(gs) {
  const s = gs.flags.wallet;
  // nhiệm vụ đã xong ở ngày trước thì không hiện nữa
  if ((s === 5 || s === -1) && gs.flags.walletDay !== gs.day) return null;
  const base = { id: 'wallet', optional: true };
  if (s === 1) return { ...base, text: fmt('obj.wallet1'), done: false };
  if (s === 2) return { ...base, text: fmt('obj.wallet2'), done: false, target: 'taphoa' };
  if (s === 3) return { ...base, text: fmt('obj.wallet3'), done: false, target: 'gate' };
  if (s === 4) return { ...base, text: fmt('obj.wallet4'), done: false, target: 'cafe' };
  if (s === 5) return { ...base, text: fmt('obj.walletDone'), done: true };
  if (s === -1) return { ...base, text: fmt('obj.walletKept'), done: true };
  return null;
}

// Mục tiêu bắt buộc đầu tiên chưa xong (để hiện gợi ý chính)
export function currentObjective(gs) {
  return objectives(gs).find((o) => !o.done && !o.optional) || null;
}
