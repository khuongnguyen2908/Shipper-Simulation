// =============================================================
// MỌI CON SỐ CÂN BẰNG CỦA GAME — đổi ở đây, không sửa rải rác.
// Tiền: nghìn đồng (k). Thời gian: phút trong game. Tốc độ: m/s.
// =============================================================
import gearData from './gear.json' with { type: 'json' };
import balanceData from './balance.json' with { type: 'json' };

// JSON lưu màu dạng "#rrggbb"; Three.js dùng số → đổi khi nạp
const COLOR_KEYS = ['color', 'shirt', 'pants', 'hatColor', 'hair', 'skin'];
export function colorsToNumbers(o) {
  if (Array.isArray(o)) return o.map(colorsToNumbers);
  if (!o || typeof o !== 'object') return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) r[k] = COLOR_KEYS.includes(k) && typeof v === 'string' && v[0] === '#' ? parseInt(v.slice(1), 16) : colorsToNumbers(v);
  return r;
}

export const TIME = {
  dayStart: 6 * 60,        // 06:00 bắt đầu ngày
  dayEnd: 22 * 60,         // 22:00 hết ngày
  lastOfferAt: 21 * 60,    // sau giờ này app không phát đơn mới
  gameMinPerRealSec: 1,    // 1 giây thật = 1 phút trong game (1 ngày ≈ 16 phút chơi)
  sunHarsh: [11 * 60, 15 * 60], // nắng gắt
};

// 1 m trong game hiển thị thành 10 m ngoài đời (để quãng đường giống thật)
export const DIST = { displayPerUnit: 10 };


export const RATING = {
  startCount: 10,          // coi như đã có 10 đánh giá trước đó
  startAvg: 4.8,           // (ngưỡng khóa tài khoản: apps.json → account.lockBelow)
};


// Xe, túi — dữ liệu ở gear.json; đồ dùng/trang bị ở goods.json (xem goods.js)
export const VEHICLES = colorsToNumbers(gearData.vehicles);
export const BAGS = colorsToNumbers(gearData.bags);


export const HAZARD = {
  stormStart: [14 * 60, 15.5 * 60], stormLen: [55, 100],
  drizzleChance: 0.35, drizzleStart: [8 * 60, 10 * 60], drizzleLen: [25, 45],
  policeFirst: 8 * 60, policeGap: [80, 140], policeLen: [40, 60], policeReportChance: 0.7,
  rush: [[7 * 60, 8.5 * 60], [17 * 60, 18.75 * 60]], jamSegments: 5,
  jamSpeedCap: 3.2,
  potholes: 110,           // bản đồ 8×8 (mật độ như bản 5×5 cũ: 46 ổ gà)
  dogDartChance: 0.4,
  ambient: { night: 27, morning: 30, harsh: 35, rain: 25 },
};

// ---------- Số sửa được bằng ?editor (thẻ ⚖️ Cân bằng) — dữ liệu ở balance.json ----------
// Phí nền tảng, thuế, thưởng km, boa, bù hủy đơn, luật khóa tài khoản: xem apps.json (thẻ 📱 App & Đơn)
export const ECONOMY = balanceData.economy; // tiền khởi đầu, tiền nhà, xăng, phạt, sửa xe… (speedLimit: m/s)
export const ENERGY = balanceData.energy; // hao thể lực/tinh thần mỗi phút + các cú trừ tức thời
export const ORDER = balanceData.order; // nhịp đơn, chờ quán, tỉ lệ sự cố
export const WALLET_QUEST = balanceData.walletQuest; // nhiệm vụ chiếc ví

// Tiền nhà ngày `day`: có số tự đặt trong rentByDay thì dùng, không thì = tiền ngày 1 + tăng mỗi ngày
export function rentFor(day, eco = ECONOMY) {
  const own = Array.isArray(eco.rentByDay) ? eco.rentByDay[day - 1] : null;
  return Number.isFinite(own) && own > 0 ? own : eco.rentBase + eco.rentPerDay * (day - 1);
}

// Thay số cân bằng ngay lúc chạy (bot thử trong editor dùng số đang sửa, chưa lưu).
// Sửa thẳng vào các đối tượng đã xuất để mọi nơi đang dùng đều thấy số mới.
export function applyBalance(data) {
  const into = (dst, src) => {
    for (const [k, v] of Object.entries(src || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) into(dst[k], v);
      else dst[k] = Array.isArray(v) ? [...v] : v;
    }
  };
  into(ECONOMY, data.economy);
  into(ENERGY, data.energy);
  into(ORDER, data.order);
  into(WALLET_QUEST, data.walletQuest);
}

