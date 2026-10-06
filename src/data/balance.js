// =============================================================
// MỌI CON SỐ CÂN BẰNG CỦA GAME — đổi ở đây, không sửa rải rác.
// Tiền: nghìn đồng (k). Thời gian: phút trong game. Tốc độ: m/s.
// =============================================================
import gearData from './gear.json' with { type: 'json' };

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

// Phí nền tảng, thuế, thưởng km, boa, bù hủy đơn, luật khóa tài khoản: xem apps.json (thẻ 📱 App & Đơn)
export const ECONOMY = {
  startMoney: 80,
  fuelPrice: 23,           // k / lít
  refuseBelow: 25,         // hàng còn dưới 25% → khách từ chối nhận (khách xe ôm: hoảng sợ)
  scaredFarePct: 0.5,      // khách xe ôm hoảng sợ (thoải mái dưới refuseBelow) → chỉ trả 50% cước, 1 sao
  rentBase: 400,           // tiền nhà ngày 1
  rentPerDay: 150,         // mỗi ngày sau tăng thêm
  policeFine: 150,         // phạt chạy quá tốc độ qua chốt
  repairCost: 40,          // sửa xe về 100%
  parkingFee: 5,           // gửi xe ở chung cư
  speedLimit: 11,          // m/s (~40 km/h) — đi qua chốt CSGT nhanh hơn là bị phạt
};

export const RATING = {
  startCount: 10,          // coi như đã có 10 đánh giá trước đó
  startAvg: 4.8,           // (ngưỡng khóa tài khoản: apps.json → account.lockBelow)
};

// Mức tiêu hao mỗi phút game, và các cú sốc tức thời
export const ENERGY = {
  phys: { idle: 0.02, walk: 0.04, run: 0.2, drive: 0.045, push: 0.35, sun: 0.03, rain: 0.04, stairFloor: 3.5, crashPerMag: 6 },
  mental: {
    base: 0.015, jam: 0.3, rain: 0.08, wait: 0.05,
    police: 8, fine: 10, carCrash: 8, dogHit: 10, pedHit: 6, noAnswer: 3, cancel: 6,
    stars: [0, -12, -8, -3, 2, 5], // theo số sao nhận được
  },
  meal: { cost: 35, phys: 45, mental: 5 },
  drink: { cost: 20, phys: 5, mental: 30 },
  nap: { minutes: 45, phys: 20, mental: 15 },
};

// Xe, túi — dữ liệu ở gear.json; đồ dùng/trang bị ở goods.json (xem goods.js)
export const VEHICLES = colorsToNumbers(gearData.vehicles);
export const BAGS = colorsToNumbers(gearData.bags);

export const ORDER = {
  pingGap: [3, 9],          // phút chờ giữa 2 lần có đơn (giờ cao điểm × 0,6)
  offerTimeoutSec: 25,      // giây thật để quyết định nhận đơn
  queue: [2, 9],            // phút chờ quán làm món
  queuePeak: [7, 18],
  prepAllowance: 8,         // app tính sẵn 8 phút chờ quán vào thời hạn
  planSpeed: 6.5,           // m game / phút game dùng để tính thời hạn
  slack: 6,
  outOfStockChance: 0.15,
  noAnswerChance: 0.2,
  vagueChance: 0.25,
  apartmentChance: 0.15,
  liftBrokenChance: 0.6,
  pickyChance: 0.2,
  twoItemChance: 0.3,      // (tỉ lệ từng loại đơn: apps.json → orderTypes.weight)
  callAnswerChance: 0.45,
  waitComeChance: 0.6,
  substituteAcceptChance: 0.7,
  dropDist: [60, 240],      // khoảng cách quán → khách (m game)
  stairMinPerFloor: 1.5,
  callDownWait: 8,
  liftMin: 3,
  placeDestBase: 12,       // điểm đến là địa điểm (karaoke…): xác suất = tổng trọng số / (tổng + số này)
};

export const HAZARD = {
  stormStart: [14 * 60, 15.5 * 60], stormLen: [55, 100],
  drizzleChance: 0.35, drizzleStart: [8 * 60, 10 * 60], drizzleLen: [25, 45],
  policeFirst: 8 * 60, policeGap: [80, 140], policeLen: [40, 60], policeReportChance: 0.7,
  rush: [[7 * 60, 8.5 * 60], [17 * 60, 18.75 * 60]], jamSegments: 3,
  jamSpeedCap: 3.2,
  potholes: 46,
  dogDartChance: 0.4,
  ambient: { night: 27, morning: 30, harsh: 35, rain: 25 },
};

export const WALLET_QUEST = { reward: 150, cash: 300, keepPenaltyStars: [1, 1, 1], complaintFine: 100 };
