// GHI CHÚ CỦA CÔNG CỤ ?editor — gợi ý dưới từng ô (HINT) và hộp "📖 Giải thích" (EXPLAIN).
// Chỉ hiện trong công cụ, không hiện trong game. Sửa câu chữ ở đây là xong.
// Số tham khảo lấy theo dữ liệu mẫu ban đầu; nếu bạn đổi dữ liệu thì cập nhật cho khớp.

export const HINT = {
  // ---------- món hàng ----------
  item: {
    name: 'Hiện trong app GoShip, hộp thoại, túi xếp hàng.',
    icon: 'Bấm 😀 Chọn, hoặc dán emoji.',
    base: '1–200k. Tiền cước khách trả; app trừ 20% phí + 1,5% thuế. Món mẫu 20–60k. Đơn nhiều món: lấy giá cao nhất + 6k mỗi món thêm.',
    hotStart: '40–100°C. Nguội dần về nhiệt độ ngoài trời (25–35°C); dưới 60°C bắt đầu mất điểm. Tham khảo: phở 85, cơm tấm 75.',
    coldStart: '−30 → 15°C. Ấm dần theo trời + nắng. Tham khảo: trà sữa 4, kem −8.',
    meltAt: 'Phải cao hơn nhiệt độ lúc nhận; cách càng xa càng lâu tan. Tham khảo: trà sữa 10 (nhận 4°C), kem −2 (nhận −8°C).',
    meltRate: '0–2. % mất mỗi phút cho mỗi °C vượt ngưỡng tan. Tham khảo: trà sữa 0,12 · kem 0,2.',
  },

  // ---------- xe ----------
  vehicles: {
    maxSpeed: '18–144 km/h. Tham khảo: Cub 45 · Wave 55 · tay ga 60 · SH 80 · mô tô 95. ⚠️ Qua chốt CSGT trên 40 km/h bị phạt 150k; khách xe ôm sợ khi chạy nhanh.',
    accel: '1–15 m/s². Càng cao càng bốc. Tham khảo: Cub 4,2 · tay ga 5,5 · Exciter 7,5 · mô tô 9.',
    brake: '3–20 m/s². Càng cao dừng càng nhanh. Phanh gấp mạnh hơn 6,5 làm canh, trà sóng sánh. Tham khảo: Cub 9 · mô tô 13.',
    steer: '1–4. Càng cao cua càng gắt (dễ lật đồ). 2,2–2,5 là vừa.',
    suspension: '0–100%. Giảm hư hàng khi qua ổ gà. Tham khảo: Cub 20% · tay ga 60% · SH 80%.',
    fuelPer100km: '0,5–10 lít/100 km. Xăng 23k/lít. Tham khảo: Wave 2,2 · Cub 3,5 · mô tô 5.',
    tank: '0,5–20 lít. Hết xăng phải dắt xe (rất mệt). Tham khảo: Cub 3 · tay ga 4,5 · SH 7.',
    price: '0–100 000k. Giá 0 = xe có sẵn lúc đầu. Tham khảo: Wave 200 · tay ga 1200 · SH 6000 (tiền nhà ngày 1 là 400k).',
  },

  // ---------- túi ----------
  bags: {
    insulation: '0–100%. Từ 50% trở lên mới nhận được đơn món lạnh (trà sữa, kem); món nóng cũng nguội chậm hơn. Tham khảo: nylon 0 · giữ nhiệt 55 · thùng 80.',
    waterproof: '0–100%. Hộp giấy (cơm tấm, bánh kem) ướt mưa là hỏng. Tham khảo: nylon 0 · giữ nhiệt 50 · thùng 100.',
    padding: '0–100%. Giảm hư đồ dễ vỡ và đổ canh khi xóc. Tham khảo: nylon 0 · giữ nhiệt 25 · thùng 55.',
    cols: '1–5. Số ô = cột × hàng = số món chở được một lần. Tham khảo: nylon 2×2 · thùng 3×3.',
    rows: '1–4.',
    price: '0–100 000k. Giá 0 = túi có sẵn lúc đầu. Tham khảo: giữ nhiệt 120 · thùng 380.',
  },

  // ---------- đồ dùng ----------
  goods: {
    price: '0–100 000k. Tham khảo: cà phê 20k (+30 tinh thần) · phở 35k (+45 thể lực) · nước tăng lực 15k (+25 thể lực).',
    type: 'Dùng 1 lần: mua được nhiều, mỗi lần dùng mất 1. Trang bị: mua 1 lần, tác dụng mãi (kể cả các ngày sau). Dùng tại địa điểm: chỉ mang theo, đem tới nơi có hoạt động cần nó (vd nhang → chùa). Trang phục: áo / quần / mũ bảo hiểm của shipper, mua rồi về tủ đồ phòng trọ để mặc; giá 0 = có sẵn.',
    carry: 'Tác dụng (tinh thần, thời gian…) đặt ở hoạt động của nơi dùng, không đặt ở đây. Món giữ qua các ngày.',
  },
  use: {
    minutes: '0–240 phút. Thời gian trôi khi dùng (trong lúc đó không chạy đơn). 1 = dùng liền.',
    phys: '−100 → +100. Thanh thể lực 0–100, về 0 là THUA. Tham khảo: phở +45 · nước tăng lực +25.',
    mental: '−100 → +100. Thanh tinh thần 0–100, về 0 là THUA. Tham khảo: cà phê +30 · đọc sách +20.',
    fuel: '0–10 lít đổ thêm vào bình (không vượt dung tích bình). Ở cây xăng 1 lít = 23k.',
    bikeHp: '0–100. Độ bền xe 0–100%; sửa xe ở tiệm 40k về 100%.',
  },

  // ---------- địa điểm ----------
  place: {
    name: 'Hiện trong app, hộp thoại, mục tiêu.',
    short: 'Hiện trên bản đồ nhỏ — nên ngắn (1–2 chữ).',
    sign: 'Chữ in trên biển trước cửa; nên VIẾT HOA, ngắn.',
    floors: '1–15 tầng (chỉ là hình dáng nhà).',
    kind: 'Quyết định địa điểm làm được gì: Quán ăn (có đơn đồ ăn, cần thực đơn) · Cây xăng (đổ xăng; hình mái che + trụ bơm, xe phải đậu gần) · Tiệm đồ nghề / Tiệm xe / Chợ / Dịch vụ (bán hàng, hoạt động; tiệm xe sửa được xe). Giờ mở cửa, hoạt động, hàng bán, NPC giữ nguyên khi đổi.',
  },
  act: {
    label: 'Chữ trên nút trong hộp thoại, vd "Ăn một tô phở".',
    cost: '0–10 000k. Trừ tiền ngay khi làm. Tham khảo: cà phê 20k · phở 35k · karaoke 80k.',
    minutes: '0–480 phút. Thời gian trôi trong lúc làm. Ngày chơi 6h → 22h (960 phút).',
    phys: '−100 → +100, cộng/trừ ngay. ⚠️ Thanh về 0 là THUA; −100 = thua chắc. Tham khảo: ăn phở +45 · hát karaoke −5.',
    mental: '−100 → +100, cộng/trừ ngay. ⚠️ Thanh về 0 là THUA. Tham khảo: cà phê +30 · hát karaoke +40.',
    perDay: '0 = không giới hạn. Vd hát karaoke 1 lần/ngày, đọc sách 3 lần/ngày.',
    needs: 'Người chơi phải mang theo đồ này (mua ở nơi khác) mới làm được; làm xong trừ đúng số lượng. Vd chùa "Thắp nhang" cần 1 Bó nhang. Số bên cạnh = số cái cần.',
  },
  orders: {
    rideWeight: '0–10. Mức 6 ≈ 1/3 số chuyến xe ôm đi tới/đi từ đây (nếu chỉ mình nơi này có mức). Tham khảo: karaoke 6 · chợ 3 · chung cư 1.',
    foodWeight: '0–10. Đơn đồ ăn giao tới đây thay vì tới nhà khách. Mức 3 ≈ 1/5 số đơn.',
    parcelWeight: '0–10. Đơn giao hàng / hỏa tốc lấy hàng ở đây (shop gửi hàng). Có nơi nào có mức > 0 thì mọi đơn giao hàng lấy ở các nơi đó (chia theo mức); không có thì lấy ở nhà người gửi. Mẫu: tạp hóa 3 · chợ 3 · nhà sách 2.',
  },
  npc: {
    scale: '0,6–1,3. 1 = bình thường; Chú Tư Lùn 0,85.',
  },

  // ---------- bản đồ ----------
  map: {
    alley: 'Kiểu mạng hẻm bên trong khối. Game tự xếp nhà mặt phố + nhà trong hẻm (địa chỉ "số hẻm/số nhà"). Khối có hẻm 42 (nhà cổng xanh) phải để "Không hẻm".',
    walk: 'Hẻm đi bộ hẹp 2 m, có cột chắn ở miệng hẻm: phải đậu xe ngoài đường rồi đi bộ vào. Khách xe ôm ở nhà trong hẻm đi bộ được đón/trả ở miệng hẻm.',
    river: 'Sông thay cho một con đường (từ ngã tư a tới b): xe không chạy dọc / băng qua được, trừ ở ngã tư có cầu. Quãng đường và thời hạn đơn tự tính vòng qua cầu. Sông không được cắt rời thành phố (bộ kiểm tra sẽ báo).',
  },

  // ---------- app giao hàng ----------
  app: {
    platformFee: '0–90%. App lấy bao nhiêu % tổng cước. Mẫu 20%. Phí + thuế trên 60% thì tài xế gần như không lời.',
    taxRate: '0–50%. Thuế thu nhập trên tổng cước. Mẫu 1,5%.',
    distBonusPerKm: '0–50k mỗi km quãng đường quán → khách. Mẫu 6k (xăng tốn ~1k/km). Bản đồ 8×8 có sông nên quãng đi dài hơn — 4k thì tỉ lệ thắng ngày 1 tụt (bot chơi bình thường 58% → 75% khi lên 6k).',
    extraItemFare: '0–100k cho mỗi món thêm trong đơn 2 món. Mẫu 6k.',
    cancelComp: '0–200k app bù khi đơn bị hủy không phải lỗi tài xế (quán hết món, khách không nghe máy). Mẫu 5k.',
    rainSurcharge: '0–100k cộng vào mỗi đơn nhận lúc trời mưa (như app thật). Mẫu 4k. Khách quen gọi thẳng không có phụ phí.',
    peakSurcharge: '0–100k cộng vào mỗi đơn nhận trong giờ cao điểm. Mẫu 3k.',
    peakHours: 'Giờ cao điểm: đơn tới dày hơn (khoảng chờ ×0,6), quán đông hơn, có phụ phí. Mẫu 11–13h và 17–19,5h.',
    tipByStars: 'Tiền boa theo số sao (k). Mẫu: 4★ 3k · 5★ 8k.',
    lockBelow: '1–5. Điểm trung bình dưới mức này → app khóa tài khoản → THUA. Mẫu 4,0 (người chơi bắt đầu 4,8).',
    cancelStars: '1–5. Mỗi lần tài xế tự hủy đơn bị tính như một đánh giá bao nhiêu sao. Mẫu 2.',
    cancelLimitPerDay: '0–20. Tự hủy quá số này trong ngày → tạm khóa nhận đơn. Mẫu 3 (lần thứ 4 bị khóa).',
    cancelLockMin: '0–600 phút bị khóa nhận đơn. Mẫu 60.',
    acceptWindow: '3–50. Tỉ lệ nhận đơn tính trên bao nhiêu lần mời gần nhất. Mẫu 10.',
    lowAcceptBelow: '0–100%. Tỉ lệ nhận đơn dưới mức này → app phát đơn thưa hơn. Mẫu 50%.',
    lowAcceptPingMult: '1–5 lần. Khoảng chờ giữa 2 đơn dài ra bao nhiêu lần khi tỉ lệ nhận thấp. Mẫu 1,6.',
  },
  orderType: {
    kind: 'Cách code xử lý đơn: Đồ ăn (tới quán chờ nấu, có thể hết món) · Chở khách · Giao hàng (lấy hàng ở shop / nhà người gửi, có thể thu hộ COD, bị bom).',
    weight: '0–20. Tỉ lệ so với các loại khác đang có lúc đó (đúng giờ, đủ trang bị). 0 = tắt. Mẫu: đồ ăn 6 · chở khách 2 · giao hàng 2 · hỏa tốc 1,2.',
    fareMult: '0,2–5. Nhân với cước của món. Mẫu: hỏa tốc 1,6.',
    deadlineMult: '0,2–3. Nhân với thời hạn app cho. Nhỏ = gắt hơn. Mẫu: hỏa tốc 0,8 (bot chạy đều vẫn trễ nhẹ; chạy nhanh thì kịp) · giao hàng 1,3.',
    requires: 'Chỉ có loại đơn này khi người chơi có trang bị với tác dụng này. Mẫu: chở khách cần "Chở được khách" (mũ cho khách).',
    items: 'Món hàng loại đơn này chở (chỉ hiện món đã đánh dấu "Hàng giao" ở thẻ Vật phẩm). Mỗi đơn chọn ngẫu nhiên 1 món.',
    codChance: '0–100%. Tỉ lệ đơn thu hộ: tài xế ứng trước tiền hàng (giá trị ở thẻ Vật phẩm), giao xong khách trả lại. App chỉ giao đơn COD khi ví đủ tiền.',
    bomChance: '0–100%. Đơn thu hộ bị khách bom → phải mang trả shop. Mẫu 12%.',
    persuadeChance: '0–100%. Khi bị bom, năn nỉ 1 lần có bao nhiêu % khách đổi ý. Mẫu 30%.',
    returnFeePct: '0–100% cước. App trả phí hoàn hàng khi tài xế mang hàng bị bom về trả shop. Mẫu 50%.',
  },
  rider: {
    weight: '0–20. Tỉ lệ so với các loại khách khác đang có (đúng giờ, đủ chuyến). Mẫu: khách app 6 · khách say 4 (chỉ buổi tối).',
    viaApp: 'Bỏ tích = khách gọi thẳng (khách quen): không mất phí app, không thuế, không phụ phí, không chấm sao trên app.',
    minRides: 'Chỉ có loại khách này sau khi đã chở xong bao nhiêu chuyến (tính cả các ngày). Mẫu: khách quen 3.',
    comfortKmh: '10–120 km/h. Chạy nhanh hơn mức này khách bắt đầu sợ (trừ "thoải mái"). Bình thường 40; cụ già 30; khách vội 55. Trang bị "Khách chịu tốc độ thêm" cộng thêm.',
    fareMult: '0,2–5. Nhân với cước. Mẫu: khách vội 1,2.',
    deadlineMult: '0,2–3. Nhân với thời hạn. Mẫu: khách vội 0,85 · khách say 1,2.',
    quitBelow: '0–90%. Thoải mái tụt dưới mức này khách đòi xuống giữa đường (trả theo quãng đã đi, 1★). 0 = không bao giờ (khách say).',
    vagueChance: '0–100%. Khách quên địa chỉ: chỉ biết khu vực (vòng tím), phải gọi hỏi hoặc hỏi người đi đường. Mẫu: khách say 50%.',
    vomitChance: '0–100% mỗi lần xóc mạnh, tối đa 1 lần mỗi chuyến. Mẫu: khách say 25%.',
    vomitMental: '0–100 tinh thần bị trừ khi khách ói ra xe. Mẫu 8.',
    vomitCost: '0–500k tiền rửa xe khi khách ói. Mẫu 10k.',
    noPayChance: '0–100%. Khách quỵt tiền cước (vẫn chấm sao). Mẫu: khách say 15%.',
    bigTipChance: '0–100%. Khách boa đậm (khi chuyến không có sự cố). Mẫu: khách say 25%.',
    bigTip: '0–500k tiền boa đậm. Mẫu 15k.',
    earlyTip: '0–500k boa khi tới nơi trong 80% thời hạn. Mẫu: khách vội 10k.',
    from: 'Khách loại này luôn được đón ở một trong các nơi này (đang mở cửa). Mẫu: khách say đi ra từ karaoke. Không chọn = đón ở nhà dân.',
    riderNames: 'Đặt xe dùm: người đi khác người đặt. Mỗi dòng một tên người đi. Tên bắt đầu "Bà/Ông" hiện tóc bạc, "Bé" hiện dáng nhỏ.',
  },
};

// Hộp "📖 Giải thích" (HTML)
const T = (rows) => `<table class="ref"><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

export const EXPLAIN = {
  item: ['Món hàng hư thế nào, ảnh hưởng sao và tiền ra sao', `
    <p>Mỗi món bắt đầu <b>100%</b>. Trên đường mất dần tùy đặc tính (nguội, tan, đổ, vỡ, ướt). Lúc giao, số sao tính theo tình trạng trung bình:</p>
    ${T([['Tình trạng', '≥ 90%', '75–89%', '60–74%', '40–59%', '25–39%', '&lt; 25%'], ['Trừ sao', '0', '−0,5', '−1,5', '−2,5', '−3,5', 'khách từ chối, 1★, không có tiền']])}
    <p>Trễ giờ cũng trừ sao (trễ ≤ 25%: −1, ≤ 50%: −2, hơn nữa: −3). Điểm đánh giá dưới <b>4,0</b> → app khóa tài khoản → thua.</p>
    <p>Tiền mỗi đơn ≈ cước − 20% phí − 1,5% thuế + thưởng quãng đường (6k/km) + boa (4★: 3k, 5★: 8k). Bot chơi thử lãi trung bình ~39k/đơn → ngày 1 (tiền nhà 400k) cần khoảng 12 đơn.</p>`],
  goods: ['Thể lực, tinh thần và đồ dùng', `
    <p>Hai thanh <b>thể lực</b> và <b>tinh thần</b> từ 0 đến 100, đầu ngày đầy. Về 0 là <b>thua</b> (ngất / suy sụp). Thanh không vượt quá 100.</p>
    ${T([['Thứ', 'Thể lực', 'Tinh thần'], ['Ăn phở / cơm tấm (35k)', '+45', '+5'], ['Cà phê / trà sữa (20k)', '+5', '+30'], ['Nước tăng lực (15k)', '+25', '+5'], ['Cả ngày tụt dần (chạy xe, nắng, chờ, kẹt xe)', '≈ −40 đến −60', '≈ −20 đến −40'], ['Leo thang chung cư (mỗi tầng)', '−3,5', ''], ['Bị CSGT phạt · bị 1★ · đơn bị hủy', '', '−10 · −12 · −6']])}
    <p><b>Dùng 1 lần</b>: cộng/trừ ngay khi dùng từ túi đồ (phím I). <b>Trang bị</b>: tác dụng lâu dài; "Hao … (%)" làm thanh tụt chậm/nhanh hơn theo %, chỉ với phần tụt dần (không giảm các cú trừ ngay như bị phạt, té xe).</p>`],
  vehicles: ['Xe ảnh hưởng gì', `
    <p>Xe nhanh giao kịp giờ hơn (ít bị trừ sao trễ giờ) nhưng hao xăng hơn, và chạy quá <b>40 km/h</b> qua chốt CSGT bị phạt <b>150k</b>. Giảm xóc tốt làm hàng ít hư khi qua ổ gà. Xem bảng <b>So sánh cả nhóm</b> ở cuối trang.</p>`],
  bags: ['Túi ảnh hưởng gì', `
    <p>Túi quyết định <b>loại đơn nhận được</b> (giữ nhiệt ≥ 50% mới có đơn trà sữa, kem) và <b>hàng hư nhanh hay chậm</b>. Số ô = số món chở cùng lúc. Thẻ 📦 Vật phẩm có biểu đồ xem trước món hư thế nào với từng túi.</p>`],
  act: ['Hoạt động hoạt động thế nào', `
    <p>Khi người chơi bấm E ở cửa (trong giờ mở cửa), hộp thoại hiện các hoạt động. Chọn một hoạt động: <b>trừ tiền</b> → <b>thời gian trôi</b> đúng số phút → <b>cộng/trừ thể lực, tinh thần</b> ngay.</p>
    ${T([['Hoạt động mẫu', 'Giá', 'Phút', 'Thể lực', 'Tinh thần', 'Lần/ngày'], ['Ăn tô phở', '35k', '15', '+45', '+5', '∞'], ['Cà phê sữa đá', '20k', '10', '+5', '+30', '∞'], ['Đọc sách tại chỗ', '5k', '30', '+5', '+20', '3'], ['Hát karaoke 1 tiếng', '80k', '60', '−5', '+40', '1']])}
    <p><b>Cần đồ</b>: hoạt động chỉ làm được khi người chơi mang theo món đó (mua ở nơi khác, vd mua nhang ở tiệm trà rồi đem tới chùa thắp). Thiếu đồ thì nút mờ và ghi nơi bán.</p>
    <p>⚠️ Số âm lớn (dưới −30) có thể làm người chơi đang yếu thua ngay; <b>−100 là thua chắc</b>.</p>`],
  map: ['Bản đồ hoạt động thế nào', `
    <p>Thành phố là lưới khối nhà, giữa các khối là đường lớn. Khối <b>không hẻm</b> có 8 lô quanh mép (như cũ). Khối <b>có hẻm</b> được chia lại: nhà mặt phố dọc 4 cạnh + mạng hẻm bên trong + nhà hai bên hẻm; phần còn lại là nhà phía sau (không có cửa).</p>
    <p>Địa điểm đặt được vào nhà trong hẻm (quán trong hẻm): chọn khối có hẻm ở thẻ Địa điểm rồi bấm vào một nhà. Đổi kiểu / hướng hẻm sẽ xếp lại nhà → các địa điểm trong khối đó cần chọn lại lô.</p>
    <p>Hẻm xe máy rộng 4 m (chạy xe vào được). Hẻm đi bộ rộng 2 m, có 2 cột chắn ở miệng hẻm: phải đậu xe ngoài và đi bộ vào giao hàng.</p>`],
  app: ['Tiền mỗi đơn tính thế nào', `
    <p><b>Tổng cước</b> = cước món × hệ số loại đơn × hệ số loại khách + thưởng km + phụ phí (mưa / giờ cao điểm).</p>
    <p><b>Tài xế nhận</b> = tổng cước − phí nền tảng − thuế + tiền boa. Tiền xăng trả ở cây xăng (hóa đơn vẫn ghi để biết lãi thực).</p>
    <p>Khách quen gọi thẳng: không phí, không thuế, không phụ phí, không chấm sao. Đơn thu hộ: tiền hàng tài xế ứng trước được khách trả lại riêng, không tính vào lãi.</p>
    <p>Bot chơi thử (npm run sim) lãi trung bình ~39k/đơn → ngày 1 (tiền nhà 400k) cần ~11–12 đơn. Đổi phí / thuế ở đây ảnh hưởng thẳng tới tỉ lệ thắng.</p>`],
  orderTypes: ['Loại đơn hoạt động thế nào', `
    <p>Mỗi lần app có đơn, game xét các loại đơn <b>đang có</b> (đúng khung giờ, đủ trang bị yêu cầu, mức > 0) rồi chọn theo <b>mức thường xuyên</b>. Ví dụ đủ cả 4 loại mẫu: 6 + 2 + 2 + 1,2 = 11,2 → đồ ăn ≈ 54%, chở khách ≈ 18%, giao hàng ≈ 18%, hỏa tốc ≈ 11%.</p>
    <p><b>Giao hàng</b>: lấy hàng ở nơi có "Gửi hàng từ đây" (thẻ Địa điểm) hoặc nhà người gửi gần đó, xếp túi, giao. Đơn thu hộ phải ứng tiền hàng lúc lấy; bị bom thì năn nỉ (1 lần) hoặc mang trả shop để nhận lại tiền + phí hoàn hàng. Hàng hỏng bị từ chối thì mất tiền đã ứng.</p>`],
  riderTypes: ['Loại khách xe ôm hoạt động thế nào', `
    <p>Mỗi đơn chở khách chọn 1 loại khách đang có (đúng giờ, đủ số chuyến, nơi đón đang mở) theo mức thường xuyên. Các ô để trống = như khách thường.</p>
    ${T([['Mẫu', 'Đặc điểm'], ['Khách app', 'Bình thường, chịu 40 km/h'], ['Khách quen', 'Sau 3 chuyến; gọi thẳng, không mất phí app'], ['Khách say', '19–22h từ karaoke; quên địa chỉ, ói, quỵt hoặc boa đậm; không bao giờ đòi xuống'], ['Đặt xe dùm', 'Cụ già / em bé, chỉ chịu 30 km/h'], ['Khách vội', 'Hạn gắt, cước ×1,2, tới sớm boa 10k, chịu 55 km/h']])}`],
  orders: ['Điểm đến của đơn tính thế nào', `
    <p>Mỗi khi có đơn xe ôm (hoặc đơn đồ ăn), game cộng mức của mọi nơi đang trong khung giờ, so với mức nền <b>12</b> của "nhà khách bất kỳ". Ví dụ chỉ karaoke có mức 6 → 6 / (6 + 12) ≈ <b>1/3</b> số chuyến đi tới/từ karaoke. Nhiều nơi cùng có mức thì chia nhau.</p>`],
};
