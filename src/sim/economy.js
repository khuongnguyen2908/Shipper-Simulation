// =============================================================
// KINH TẾ GIG
// Lãi thực = (Giá cước + Thưởng quãng đường) − Phí nền tảng 20% − Thuế − Tiền xăng
// Tiền xăng đã trả ở cây xăng nên ví chỉ được cộng: cước − phí − thuế + tiền boa.
// =============================================================
import { ECONOMY } from '../data/balance.js';

const r1 = (v) => Math.round(v * 10) / 10;

// farePct: phần cước khách chịu trả (1 = đủ; khách xe ôm hoảng sợ → ECONOMY.scaredFarePct)
export function computePayout({ baseFare, distanceKm, litersUsed = 0, stars = 5, refused = false, farePct = 1 }) {
  const fuelCost = r1(litersUsed * ECONOMY.fuelPrice);
  if (refused) {
    return { baseFare: 0, distBonus: 0, gross: 0, fee: 0, tax: 0, fuelCost, final: -fuelCost, tip: 0, walletCredit: 0, net: -fuelCost };
  }
  baseFare = r1(baseFare * farePct);
  const distBonus = r1(distanceKm * ECONOMY.distBonusPerKm * farePct);
  const gross = r1(baseFare + distBonus);
  const fee = r1(gross * ECONOMY.platformFee);
  const tax = r1(gross * ECONOMY.taxRate);
  const final = r1(gross - fee - tax - fuelCost);
  const tip = ECONOMY.tipByStars[stars] ?? 0;
  const walletCredit = r1(gross - fee - tax + tip);
  return { baseFare, distBonus, gross, fee, tax, fuelCost, final, tip, walletCredit, net: r1(final + tip) };
}

// Ước tính thu nhập hiện trên thẻ đơn (chưa trừ xăng, chưa có boa)
export function estimatePay(baseFare, distanceKm) {
  const gross = baseFare + distanceKm * ECONOMY.distBonusPerKm;
  return r1(gross * (1 - ECONOMY.platformFee - ECONOMY.taxRate));
}

// Điểm đánh giá trung bình (có sẵn lịch sử trước khi vào game)
export class RatingBook {
  constructor({ count, sum }) {
    this.count = count;
    this.sum = sum;
    this.recent = [];
  }
  add(stars) {
    this.count += 1;
    this.sum += stars;
    this.recent.push(stars);
  }
  get value() {
    return this.sum / this.count;
  }
  toJSON() {
    return { count: this.count, sum: this.sum };
  }
}

export function fmtK(v) {
  const n = r1(v);
  return `${n.toLocaleString('vi-VN')}k`;
}
