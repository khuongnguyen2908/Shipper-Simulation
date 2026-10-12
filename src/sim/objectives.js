// Danh sách mục tiêu trong ngày (tính lại từ GameState mỗi khung hình).
// optional = nhiệm vụ phụ; target = id địa điểm để chỉ đường. Chữ lấy từ kho chữ obj.*
import { fmt } from '../content/index.js';

export const ORDERS_GOAL = 10; // số đơn cần giao trong ngày

export function objectives(gs) {
  // "Luôn có": trả tiền nhà cho Cô Hai (hiện từ lúc đã gặp Cô Hai)
  const rent = { id: 'rent', text: fmt(gs.rentPaid ? 'obj.rentPaid' : 'obj.rent', { rent: gs.rent, day: gs.rentDueDay }), done: gs.rentPaid, target: 'home', final: true };
  // chưa vào hãng: chỉ hiện bước đang làm của mở đầu — tìm nhà trọ, gặp Cô Hai → leo lên xe đạp Cô Hai cho → đăng ký 1 hãng xe
  if (!gs.brand) {
    const st = gs.flags.story ?? 2;
    if (st <= 0) return [{ id: 'findHome', text: fmt('obj.findHome'), done: false, target: 'home' }];
    if (st === 1) return [{ id: 'mountBike', text: fmt('obj.mountBike'), done: false }, rent];
    return [{ id: 'brand', text: fmt('obj.brand'), done: false }, rent];
  }
  const list = [];
  const first = { id: 'first', text: fmt('obj.first'), done: gs.stats.completed >= 1 };
  // ngày 1: dòng đầu đi lần lượt — đổ xăng / sạc điện → giao đơn đầu tiên; xong đơn đầu mới hiện dòng "giao 10 đơn"
  // (ngày 2 trở đi: tạm chỉ có "giao 10 đơn" — sẽ thiết kế sau)
  if (gs.day === 1) {
    const ev = gs.brandSpec?.power === 'electric';
    if (!gs.flags.refueled) list.push({ id: 'fuel', text: fmt(ev ? 'obj.charge' : 'obj.fuel'), done: false, target: ev ? 'charger' : 'gas' });
    else list.push(first);
  }
  if (gs.day > 1 || first.done) list.push({ id: 'orders', text: fmt('obj.orders', { goal: ORDERS_GOAL, n: Math.min(gs.stats.completed, ORDERS_GOAL) }), done: gs.stats.completed >= ORDERS_GOAL });
  list.push(rent);
  return list;
}

// Truyện phụ "ví anh Minh" (vẫn có trong game) — tạm không hiện trong danh sách mục tiêu theo yêu cầu.
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
