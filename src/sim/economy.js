// =============================================================
// KINH TẾ GIG
// Lãi thực = (Giá cước + Thưởng quãng đường + Phụ phí) − Phí nền tảng − Thuế − Tiền xăng
// Tiền xăng đã trả ở cây xăng nên ví chỉ được cộng: cước − phí − thuế + tiền boa.
// Phí, thuế, thưởng km, boa… lấy từ app đang chạy (apps.json, sửa bằng ?editor).
// =============================================================
import { ECONOMY } from '../data/balance.js';
import { APP } from '../data/apps.js';

const r1 = (v) => Math.round(v * 10) / 10;

// farePct: phần cước khách chịu trả (1 = đủ; khách hoảng sợ → ECONOMY.scaredFarePct; xuống giữa đường → quãng đã đi)
// surcharge: phụ phí mưa / giờ cao điểm (k) · viaApp = false: khách quen gọi thẳng, không mất phí app, không thuế
// airportFee: phụ phí sân bay khách trả thêm (k) — tài xế nhận đủ để bù phí vào cổng, app không trích phí / thuế phần này
export function computePayout({ baseFare, distanceKm, litersUsed = 0, stars = 5, refused = false, farePct = 1, surcharge = 0, airportFee = 0, viaApp = true, app = APP }) {
  const fuelCost = r1(litersUsed * ECONOMY.fuelPrice);
  if (refused) {
    return { baseFare: 0, distBonus: 0, surcharge: 0, airportFee: 0, gross: 0, fee: 0, tax: 0, fuelCost, final: -fuelCost, tip: 0, walletCredit: 0, net: -fuelCost };
  }
  baseFare = r1(baseFare * farePct);
  surcharge = r1(surcharge * farePct);
  airportFee = r1(airportFee * farePct);
  const distBonus = r1(distanceKm * app.distBonusPerKm * farePct);
  const fare = r1(baseFare + distBonus + surcharge);
  const gross = r1(fare + airportFee);
  const fee = viaApp ? r1(fare * app.platformFee) : 0;
  const tax = viaApp ? r1(fare * app.taxRate) : 0;
  const final = r1(gross - fee - tax - fuelCost);
  const tip = app.tipByStars[stars] ?? 0;
  const walletCredit = r1(gross - fee - tax + tip);
  return { baseFare, distBonus, surcharge, airportFee, gross, fee, tax, fuelCost, final, tip, walletCredit, net: r1(final + tip) };
}

// Cộng thêm tiền boa (trang bị, khách vội, khách say boa đậm…) vào hóa đơn
export function addTip(pay, k) {
  if (!k) return pay;
  pay.tip = r1(pay.tip + k);
  pay.walletCredit = r1(pay.walletCredit + k);
  pay.net = r1(pay.net + k);
  return pay;
}

// Ước tính thu nhập hiện trên thẻ đơn (chưa trừ xăng, chưa có boa)
export function estimatePay(baseFare, distanceKm, { surcharge = 0, airportFee = 0, viaApp = true, app = APP } = {}) {
  const fare = baseFare + distanceKm * app.distBonusPerKm + surcharge;
  return r1((viaApp ? fare * (1 - app.platformFee - app.taxRate) : fare) + airportFee);
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
