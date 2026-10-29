// =============================================================
// TƯƠNG TÁC — đánh nhau góc nhìn thứ 1 (chương 6): E nhặt đồ dưới đất · E đập lén tên chưa thấy mình (đứng sau lưng)
// (một phần của src/interactions.js — mọi thao tác người chơi; chữ lấy từ vi.json qua fmt())
// =============================================================
import { fmt } from '../content/index.js';
import { weaponOf } from '../sim/fight.js';

// Thêm nút E của trận đánh vào danh sách E (gần hơn thì được ưu tiên)
export function fightPrompts(g, E) {
  if (!g.fight || !g.fpvOn) return;
  const foe = !g.fight.won && g.fightNearTakedown();
  if (foe) E.push({ label: fmt('act.takedown'), dist: -20, run: () => g.fightTakedown(foe) });
  // nhặt lại đồ của mình dưới đất — cả lúc đi giữa các trận (đánh liền mạch)
  const near = g.fightNearLoot();
  if (near) E.push({ label: fmt('act.pickWeapon', { name: `${weaponOf(near.l.id).icon || ''} ${fmt(weaponOf(near.l.id).name)}` }), dist: near.d - 8, run: () => g.fightPick(near.l) });
}
