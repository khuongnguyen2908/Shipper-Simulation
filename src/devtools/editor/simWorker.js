// Chạy bot mô phỏng NGẦM trong trình duyệt (Web Worker) cho nút "▶ Chạy thử bot" ở thẻ ⚖️ Cân bằng.
// Nhận số cân bằng đang sửa (chưa cần lưu), cho bot chơi nối nhiều ngày, gửi lại bảng tỉ lệ thắng từng ngày.
// Các dữ liệu khác (địa điểm, món, app…) lấy theo bản đã lưu.
import { applyBalance } from '../../data/balance.js';
import { playRun, STRATEGIES } from '../../../tests/economy-sim.js';

self.onmessage = (e) => {
  const { balance, runs, days, strategies } = e.data;
  try {
    applyBalance(balance);
    const strats = (strategies && strategies.length ? strategies : Object.keys(STRATEGIES)).filter((s) => STRATEGIES[s]);
    const total = strats.length * runs;
    let done = 0;
    const result = {};
    for (const strat of strats) {
      const reach = Array(days + 1).fill(0), win = Array(days + 1).fill(0), orders = Array(days + 1).fill(0), money = Array(days + 1).fill(0);
      for (let s = 1; s <= runs; s++) {
        playRun(s, strat, days).forEach((r, i) => {
          const d = i + 1;
          reach[d]++;
          orders[d] += r.log.orders;
          if (r.outcome.type === 'win') { win[d]++; money[d] += r.gs.money; }
        });
        done++;
        if (done % 5 === 0) self.postMessage({ type: 'progress', done, total });
      }
      result[strat] = { reach, win, orders, money };
    }
    self.postMessage({ type: 'done', result, runs, days });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
};
