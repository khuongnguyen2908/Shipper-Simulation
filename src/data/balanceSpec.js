// Danh sách ô của thẻ ⚖️ Cân bằng (balance.json) — dùng chung cho công cụ (nhãn, gợi ý) và validate.js (phạm vi).
// Mỗi ô: [đường dẫn trong balance.json, nhãn, { min, max, scale, step, hint }]
//  - scale: hệ số hiển thị (vd 100 để hiện %, 3.6 để hiện km/h); min/max tính theo giá trị LƯU trong file
//  - pair: ô là cặp [từ, đến]
// Số nào không có ở đây vẫn sửa được ở mục "Nâng cao" (hiện tên gốc).

const pct = (hint, max = 1) => ({ min: 0, max, scale: 100, step: 1, hint });

export const BALANCE_GROUPS = [
  {
    id: 'money', title: '💰 Tiền & ngày',
    fields: [
      ['economy.startMoney', 'Tiền khởi đầu (k)', { min: 0, max: 5000, step: 10, hint: 'Tiền trong túi sáng ngày 1. Mặc định 80k.' }],
      ['economy.rentEveryDays', 'Tiền nhà trả mỗi … ngày (1 kỳ)', { min: 1, max: 30, step: 1, hint: 'Mặc định 3: hạn trả là ngày 3, 6, 9…' }],
      ['economy.rentDueHour', 'Hạn trả lúc (giờ, ngày cuối kỳ)', { min: 0, max: 24, step: 0.5, hint: 'Mặc định 22 (22:00). Trả sớm lúc nào cũng được.' }],
      ['economy.rentBase', 'Tiền nhà kỳ 1 (k)', { min: 50, max: 50000, step: 10, hint: 'Mặc định 1.000k. Bot thường kiếm ~450–600k/ngày.' }],
      ['economy.rentStep', 'Tiền nhà tăng mỗi kỳ (k)', { min: 0, max: 20000, step: 10, hint: 'Kỳ 2 = kỳ 1 + số này… Mặc định 200k. Kỳ nào tự đặt ở bảng bên dưới thì lấy số tự đặt.' }],
      ['economy.lateFeePct', 'Trễ hạn: phạt thêm (%)', { min: 0, max: 2, scale: 100, step: 1, hint: 'Nợ kỳ trễ × (1 + %) dồn sang kỳ sau. Mặc định 20%.' }],
      ['economy.maxLate', 'Trễ mấy lần liên tiếp thì bị đuổi', { min: 1, max: 10, step: 1, hint: 'Bị đuổi = thua. Trả kịp kỳ sau thì xóa vết trễ. Mặc định 2.' }],
    ],
  },
  {
    id: 'costs', title: '⛽ Chi phí & phạt',
    fields: [
      ['economy.fuelPrice', 'Giá xăng (k/lít)', { min: 1, max: 200, step: 1, hint: 'Mặc định 23k. Cub hao 3,5 lít/100 km ≈ 0,8k mỗi km.' }],
      ['economy.policeFine', 'Phạt CSGT (k)', { min: 0, max: 5000, step: 10, hint: 'Chạy quá tốc độ qua chốt. Mặc định 150k.' }],
      ['economy.speedLimit', 'Qua chốt chạy quá … km/h thì bị phạt', { min: 4, max: 30, scale: 3.6, step: 1, hint: 'Mặc định 40 km/h. Cũng là tốc độ khách xe ôm bắt đầu sợ.' }],
      ['economy.repairCost', 'Sửa xe về 100% (k)', { min: 0, max: 2000, step: 5, hint: 'Mặc định 40k.' }],
      ['economy.parkingFee', 'Gửi xe ở chung cư (k)', { min: 0, max: 200, step: 1, hint: 'Mỗi lần giao lên chung cư. Mặc định 5k.' }],
      ['economy.faintFee', 'Ngất (thể lực về 0): tiền thuốc (k)', { min: 0, max: 5000, step: 10, hint: 'Không đủ thì lấy hết tiền đang có. Mặc định 100k.' }],
    ],
  },
  {
    id: 'energy', title: '💪 Thể lực & tinh thần',
    note: 'Hai thanh 0–100, đầu ngày đầy, về 0 là thua. "Mỗi phút" = mất bấy nhiêu điểm mỗi phút trong game (1 ngày 6h → 22h = 960 phút).',
    fields: [
      ['energy.phys.idle', 'Thể lực: đứng / chờ (mỗi phút)', { min: 0, max: 2, step: 0.005, hint: 'Mặc định 0,02 (cả ngày ≈ 19 điểm).' }],
      ['energy.phys.drive', 'Thể lực: chạy xe (mỗi phút)', { min: 0, max: 2, step: 0.005, hint: 'Mặc định 0,045.' }],
      ['energy.phys.walk', 'Thể lực: đi bộ (mỗi phút)', { min: 0, max: 2, step: 0.005, hint: 'Mặc định 0,04.' }],
      ['energy.phys.run', 'Thể lực: chạy bộ (mỗi phút)', { min: 0, max: 5, step: 0.01, hint: 'Mặc định 0,2.' }],
      ['energy.phys.push', 'Thể lực: dắt xe hết xăng (mỗi phút)', { min: 0, max: 5, step: 0.01, hint: 'Mặc định 0,35.' }],
      ['energy.phys.sun', 'Thể lực: thêm khi nắng gắt (mỗi phút)', { min: 0, max: 2, step: 0.005, hint: '11h–15h, không có áo chống nắng. Mặc định 0,03.' }],
      ['energy.phys.rain', 'Thể lực: thêm khi mưa (mỗi phút)', { min: 0, max: 2, step: 0.005, hint: 'Không có áo mưa. Mặc định 0,04.' }],
      ['energy.phys.stairFloor', 'Thể lực: mỗi tầng thang bộ', { min: 0, max: 30, step: 0.5, hint: 'Thang máy chung cư hỏng. Mặc định 3,5.' }],
      ['energy.phys.crashPerMag', 'Thể lực: té xe (× độ mạnh cú va)', { min: 0, max: 50, step: 1, hint: 'Mặc định 6.' }],
      ['energy.mental.base', 'Tinh thần: hao nền (mỗi phút)', { min: 0, max: 2, step: 0.005, hint: 'Lúc nào cũng có. Mặc định 0,015 (cả ngày ≈ 14 điểm).' }],
      ['energy.mental.jam', 'Tinh thần: kẹt xe (mỗi phút)', { min: 0, max: 5, step: 0.01, hint: 'Mặc định 0,3 (kẹt 10 phút ≈ −3).' }],
      ['energy.mental.rain', 'Tinh thần: mưa (mỗi phút)', { min: 0, max: 2, step: 0.005, hint: 'Không có áo mưa. Mặc định 0,08.' }],
      ['energy.mental.wait', 'Tinh thần: chờ đợi (mỗi phút)', { min: 0, max: 2, step: 0.005, hint: 'Chờ quán làm món, chờ khách. Mặc định 0,05.' }],
      ['energy.mental.fine', 'Tinh thần: bị phạt CSGT', { min: 0, max: 100, step: 1, hint: 'Trừ một lần. Mặc định 10.' }],
      ['energy.mental.police', 'Tinh thần: bị CSGT dừng (không phạt thì một nửa)', { min: 0, max: 100, step: 1, hint: 'Mặc định 8.' }],
      ['energy.mental.carCrash', 'Tinh thần: đâm ô tô', { min: 0, max: 100, step: 1, hint: 'Mặc định 8.' }],
      ['energy.mental.dogHit', 'Tinh thần: tông chó', { min: 0, max: 100, step: 1, hint: 'Mặc định 10.' }],
      ['energy.mental.pedHit', 'Tinh thần: va người đi đường', { min: 0, max: 100, step: 1, hint: 'Mặc định 6.' }],
      ['energy.mental.noAnswer', 'Tinh thần: khách không nghe máy', { min: 0, max: 100, step: 1, hint: 'Mỗi lần gọi không ai nghe. Mặc định 3.' }],
      ['energy.mental.cancel', 'Tinh thần: đơn bị hủy', { min: 0, max: 100, step: 1, hint: 'Mặc định 6.' }],
      ['energy.sleep.physPerHour', 'Ngủ: hồi thể lực mỗi giờ', { min: 0, max: 100, step: 1, hint: 'Ngủ ở phòng trọ. Mặc định 12 (8 tiếng ≈ +96).' }],
      ['energy.sleep.mentalPerHour', 'Ngủ: hồi tinh thần mỗi giờ', { min: 0, max: 100, step: 1, hint: 'Mặc định 10.' }],
      ['energy.sleep.tiredAfterH', 'Buồn ngủ sau … giờ thức', { min: 1, max: 48, step: 1, hint: 'Từ đây thể lực/tinh thần hao nhanh hơn. Mặc định 16.' }],
      ['energy.sleep.tiredMul', 'Buồn ngủ: hao × mấy lần', { min: 1, max: 10, step: 0.5, hint: 'Mặc định ×2.' }],
      ['energy.sleep.veryTiredAfterH', 'Rất buồn ngủ sau … giờ thức', { min: 1, max: 72, step: 1, hint: 'Mặc định 22.' }],
      ['energy.sleep.veryTiredMul', 'Rất buồn ngủ: hao × mấy lần', { min: 1, max: 10, step: 0.5, hint: 'Mặc định ×3.' }],
      ['energy.collapse.hours', 'Kiệt sức: nằm nghỉ bắt buộc (giờ)', { min: 0, max: 24, step: 0.5, hint: 'Ngất / suy sụp → về phòng trọ nằm, đơn đang chạy bị hủy. Mặc định 6.' }],
      ['energy.collapse.phys', 'Sau khi ngất: thể lực còn', { min: 1, max: 100, step: 1, hint: 'Mặc định 40.' }],
      ['energy.collapse.mental', 'Sau khi suy sụp: tinh thần còn', { min: 1, max: 100, step: 1, hint: 'Mặc định 40.' }],
    ],
    stars: ['energy.mental.stars', 'Tinh thần theo số sao nhận được', 'Âm = buồn, dương = vui. Mặc định 1★ −12 · 2★ −8 · 3★ −3 · 4★ +2 · 5★ +5.'],
  },
  {
    id: 'orders', title: '📦 Đơn hàng',
    fields: [
      ['order.pingGap', 'Chờ giữa 2 lần có đơn (phút)', { pair: true, min: 0, max: 120, step: 1, hint: 'Ngẫu nhiên trong khoảng này; giờ cao điểm × 0,6. Mặc định 3 → 9. Nhỏ hơn = nhiều đơn hơn = dễ hơn.' }],
      ['order.queue', 'Quán làm món (phút)', { pair: true, min: 0, max: 120, step: 1, hint: 'Mặc định 2 → 9.' }],
      ['order.queuePeak', 'Quán làm món giờ cao điểm (phút)', { pair: true, min: 0, max: 120, step: 1, hint: '11h–13h và 17h–19h30. Mặc định 7 → 18.' }],
      ['order.dropDist', 'Quán → nhà khách (m trong game)', { pair: true, min: 10, max: 2000, step: 10, hint: 'Hiển thị × 10 ra mét thật. Mặc định 60 → 200.' }],
      ['order.planSpeed', 'Thời hạn: app tính tốc độ (m/phút)', { min: 1, max: 30, step: 0.5, hint: 'Lớn hơn = app tính hạn gấp hơn = dễ trễ. Mặc định 6,5.' }],
      ['order.slack', 'Thời hạn: cộng thêm (phút)', { min: 0, max: 60, step: 1, hint: 'Phút dư cho mỗi đơn. Mặc định 6.' }],
      ['order.prepAllowance', 'Thời hạn: tính sẵn chờ quán (phút)', { min: 0, max: 60, step: 1, hint: 'Quán làm lâu hơn số này thì phần dư được cộng vào hạn. Mặc định 8.' }],
      ['economy.refuseBelow', 'Hàng còn dưới … % thì khách từ chối', { min: 0, max: 90, step: 1, hint: 'Khách từ chối = 1★, không có tiền. Khách xe ôm dưới mức này thì hoảng sợ. Mặc định 25.' }],
      ['economy.scaredFarePct', 'Khách xe ôm hoảng sợ chỉ trả (% cước)', pct('Mặc định 50%.')],
      ['order.twoItemChance', 'Đơn có 2 món (%)', pct('Mặc định 30%.')],
      ['order.outOfStockChance', 'Quán hết món (%)', pct('Mặc định 15%.')],
      ['order.substituteAcceptChance', 'Khách chịu đổi món khác (%)', pct('Khi quán hết món. Mặc định 70%.')],
      ['order.noAnswerChance', 'Khách không nghe máy (%)', pct('Mặc định 20%.')],
      ['order.callAnswerChance', 'Gọi lại thì khách nghe (%)', pct('Mặc định 45%.')],
      ['order.vagueChance', 'Địa chỉ mơ hồ (%)', pct('Phải gọi hỏi đường. Mặc định 25%.')],
      ['order.apartmentChance', 'Giao lên chung cư (%)', pct('Mặc định 15%.')],
      ['order.liftBrokenChance', 'Thang máy chung cư hỏng (%)', pct('Phải leo thang bộ. Mặc định 60%.')],
      ['order.pickyChance', 'Khách khó tính (−0,5★) (%)', pct('Mặc định 20%.')],
    ],
  },
  {
    id: 'wallet', title: '👛 Nhiệm vụ chiếc ví',
    fields: [
      ['walletQuest.reward', 'Thưởng khi trả ví (k)', { min: 0, max: 5000, step: 10, hint: 'Mặc định 150k.' }],
      ['walletQuest.cash', 'Tiền trong ví (k)', { min: 0, max: 5000, step: 10, hint: 'Giữ ví thì được số này nhưng có thể bị tố. Mặc định 300k.' }],
      ['walletQuest.complaintFine', 'Phạt khi giữ ví bị tố (k)', { min: 0, max: 5000, step: 10, hint: 'Mặc định 100k.' }],
    ],
  },
];

// Mục rentByPeriod: tự đặt tiền nhà từng kỳ (bỏ trống = theo công thức)
export const RENT_PERIODS = 8;

export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
export function setPath(obj, path, v) {
  const ks = path.split('.');
  let o = obj;
  for (const k of ks.slice(0, -1)) o = o[k] = o[k] ?? {};
  o[ks[ks.length - 1]] = v;
}
// Các đường dẫn số đã có ô riêng (phần còn lại vào "Nâng cao")
export const KNOWN_PATHS = new Set([
  ...BALANCE_GROUPS.flatMap((g) => g.fields.map((f) => f[0])),
  ...BALANCE_GROUPS.filter((g) => g.stars).map((g) => g.stars[0]),
  'economy.rentByPeriod',
]);
