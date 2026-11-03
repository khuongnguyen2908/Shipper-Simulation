// =============================================================
// MÃ CHEAT kiểu GTA — bấm phím ` (dưới Esc) mở ô nhập mã (src/ui/cheatBox.js), gõ mã rồi Enter.
// Gõ không dấu, không phân biệt hoa thường, bỏ qua dấu cách. Chữ báo kết quả ở vi.json khóa cheat.*.
// Chơi nhiều người: CHỈ dùng khi chơi Offline (tiền / sao Online do máy chủ giữ và kiểm tra). Dùng rồi thì ghi dấu
// gs.flags.cheated vào bản lưu (sau này bảng xếp hạng / thành tích có thể bỏ qua ván đã cheat).
// =============================================================
import { VEHICLES } from '../data/balance.js';
import { fmt } from '../content/index.js';
import { sound } from '../audio.js';

const MONEY = 1000; // k — GIAUTO

// mã → việc làm; trả về khóa chữ báo kết quả (vi.json cheat.*) + tham số
const CODES = {
  GIAUTO: (g) => { g.gs.money += MONEY; return ['cheat.money', { n: MONEY }]; },
  HOISUC: (g) => { Object.assign(g.gs, { phys: 100, mental: 100, awakeSince: g.clockMin }); return ['cheat.heal']; },
  DAYXANG: (g) => {
    const gs = g.gs;
    gs.fuel = gs.vehicleSpec.tank || 0;
    gs.bikeHp = 100;
    gs.maintKm = 0;
    g.stalled = false;
    return ['cheat.fuel'];
  },
  NAMSAO: (g) => {
    const b = g.gs.ratingBook;
    if (!b.count) b.count = 1;
    b.sum = 5 * b.count; // giữ số lượt đánh giá, điểm trung bình = 5
    return ['cheat.stars'];
  },
  XOANO: (g) => {
    const gs = g.gs;
    gs.fines = [];
    if (gs.rentState) Object.assign(gs.rentState, { debt: 0, late: 0 });
    return ['cheat.clear'];
  },
  HANGBEN: (g) => { g.cheat.goods = !g.cheat.goods; return [g.cheat.goods ? 'cheat.goodsOn' : 'cheat.goodsOff']; },
  BATTU: (g) => { g.cheat.god = !g.cheat.god; return [g.cheat.god ? 'cheat.godOn' : 'cheat.godOff']; },
  XEXIN: (g) => {
    const gs = g.gs;
    // xe chạy nhanh nhất trong danh sách xe (không tính xe đạp)
    const id = Object.keys(VEHICLES).filter((k) => VEHICLES[k].power !== 'pedal').sort((a, b) => VEHICLES[b].maxSpeed - VEHICLES[a].maxSpeed)[0];
    if (!id) return ['cheat.wrong'];
    if (!gs.owned.vehicles.includes(id)) { gs.owned.vehicles.push(id); gs.newVehicleState(id); }
    gs.vehicle = id;
    gs.fuel = VEHICLES[id].tank || 0;
    g.stalled = false;
    g.bike.setSpec(gs.vehicleSpec);
    g.bike.setBag(gs.bagSpec);
    g.renderPhone?.();
    return ['cheat.bike', { name: VEHICLES[id].name }];
  },
};
export const CHEAT_CODES = Object.keys(CODES);

// Nhập 1 mã. Trả về { ok, text } để ô nhập mã hiện ra.
export function applyCheatCode(g, raw) {
  const code = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!code) return { ok: false, text: '' };
  if (g.online) return { ok: false, text: fmt('cheat.online') };
  if (g.state !== 'play' || !g.gs) return { ok: false, text: fmt('cheat.notPlaying') };
  const fn = CODES[code];
  if (!fn) return { ok: false, text: fmt('cheat.wrong') };
  const [key, args] = fn(g);
  g.gs.flags.cheated = true;
  sound('ui.cheat');
  const text = fmt(key, args);
  g.hud.toast(text, 'good', 3500);
  return { ok: true, text };
}
