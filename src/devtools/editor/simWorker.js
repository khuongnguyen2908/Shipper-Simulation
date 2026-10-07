// Chạy bot mô phỏng NGẦM trong trình duyệt (Web Worker) cho nút "▶ Chạy thử bot" ở thẻ ⚖️ Cân bằng.
// Nhận số cân bằng đang sửa (chưa cần lưu), cho bot chơi liên tục nhiều ngày (24h), gửi lại bảng còn trụ theo hạn tiền nhà.
// Các dữ liệu khác (địa điểm, món, app…) lấy theo bản đã lưu.
import { applyBalance } from '../../data/balance.js';
import { playRun, summarize, STRATEGIES } from '../../../tests/economy-sim.js';

self.onmessage = (e) => {
  const { balance, runs, days, strategies } = e.data;
  try {
    applyBalance(balance);
    const strats = (strategies && strategies.length ? strategies : Object.keys(STRATEGIES)).filter((s) => STRATEGIES[s]);
    const total = strats.length * runs;
    let done = 0;
    const result = {};
    for (const strat of strats) {
      const list = [];
      for (let s = 1; s <= runs; s++) {
        list.push(playRun(s, strat, days));
        done++;
        self.postMessage({ type: 'progress', done, total });
      }
      result[strat] = summarize(list, days);
    }
    self.postMessage({ type: 'done', result, runs, days });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
};
