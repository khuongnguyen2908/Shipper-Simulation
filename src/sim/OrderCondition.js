// =============================================================
// CHẤM ĐIỂM ĐƠN HÀNG (OrderCondition)
// Số sao = 5 − (phạt tình trạng hàng) − (phạt trễ giờ) − (khách khó tính) − (phạt khác)
// Hàng còn dưới ECONOMY.refuseBelow % → khách từ chối nhận, 1 sao, không có tiền.
// Chở khách (ride): "tình trạng" là mức thoải mái; dưới ngưỡng thì khách hoảng sợ:
// vẫn tới nơi nhưng 1 sao và chỉ trả một phần cước (scared).
// =============================================================
import { ECONOMY } from '../data/balance.js';
import { fmt } from '../content/index.js';

export function conditionPenalty(pct) {
  if (pct >= 90) return 0;
  if (pct >= 75) return 0.5;
  if (pct >= 60) return 1.5;
  if (pct >= 40) return 2.5;
  return 3.5;
}

export function timePenalty(ratio) {
  if (ratio <= 1) return 0;
  if (ratio <= 1.25) return 1;
  if (ratio <= 1.5) return 2;
  return 3;
}

// Gộp lý do mất điểm của tất cả món (mã lý do → %, để hiện trên hóa đơn)
export function collectReasons(items) {
  const out = {};
  for (const it of items) for (const [k, v] of Object.entries(it.reasons)) out[k] = (out[k] || 0) + v / items.length;
  return Object.entries(out)
    .filter(([, v]) => v >= 0.5)
    .sort((a, b) => b[1] - a[1]);
}

export function evaluateOrder({ items, elapsedMin, allowedMin, picky = false, extraPenalty = 0, ride = false }) {
  const conditionPct = items.length ? items.reduce((s, i) => s + i.condition, 0) / items.length : 100;
  const timeRatio = allowedMin > 0 ? elapsedMin / allowedMin : 0;
  const penalties = [];
  const cp = conditionPenalty(conditionPct);
  if (cp) penalties.push({ label: fmt(ride ? 'pen.comfort' : 'pen.condition', { pct: Math.round(conditionPct) }), value: cp });
  const tp = timePenalty(timeRatio);
  if (tp) penalties.push({ label: fmt('pen.late', { pct: Math.round((timeRatio - 1) * 100) }), value: tp });
  if (picky) penalties.push({ label: fmt('pen.picky'), value: 0.5 });
  if (extraPenalty) penalties.push({ label: fmt('pen.extra'), value: extraPenalty });
  const reasons = collectReasons(items);
  if (conditionPct < ECONOMY.refuseBelow && ride) {
    penalties.push({ label: fmt('pen.scared'), value: 5 });
    return { refused: false, scared: true, stars: 1, conditionPct, timeRatio, penalties, reasons };
  }
  if (conditionPct < ECONOMY.refuseBelow) {
    penalties.push({ label: fmt('pen.refused'), value: 5 });
    return { refused: true, stars: 1, conditionPct, timeRatio, penalties, reasons };
  }
  const total = penalties.reduce((s, p) => s + p.value, 0);
  // làm tròn nửa xuống: 4,5 sao → 4 sao
  const stars = Math.max(1, Math.min(5, Math.round(5 - total - 1e-6)));
  return { refused: false, stars, conditionPct, timeRatio, penalties, reasons };
}
