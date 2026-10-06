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
  },
  npc: {
    scale: '0,6–1,3. 1 = bình thường; Chú Tư Lùn 0,85.',
  },
};

// Hộp "📖 Giải thích" (HTML)
const T = (rows) => `<table class="ref"><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

export const EXPLAIN = {
  item: ['Món hàng hư thế nào, ảnh hưởng sao và tiền ra sao', `
    <p>Mỗi món bắt đầu <b>100%</b>. Trên đường mất dần tùy đặc tính (nguội, tan, đổ, vỡ, ướt). Lúc giao, số sao tính theo tình trạng trung bình:</p>
    ${T([['Tình trạng', '≥ 90%', '75–89%', '60–74%', '40–59%', '25–39%', '&lt; 25%'], ['Trừ sao', '0', '−0,5', '−1,5', '−2,5', '−3,5', 'khách từ chối, 1★, không có tiền']])}
    <p>Trễ giờ cũng trừ sao (trễ ≤ 25%: −1, ≤ 50%: −2, hơn nữa: −3). Điểm đánh giá dưới <b>4,0</b> → app khóa tài khoản → thua.</p>
    <p>Tiền mỗi đơn ≈ cước − 20% phí − 1,5% thuế + thưởng quãng đường (4k/km) + boa (4★: 3k, 5★: 8k). Bot chơi thử lãi trung bình ~36k/đơn → ngày 1 (tiền nhà 400k) cần khoảng 12 đơn.</p>`],
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
  orders: ['Điểm đến của đơn tính thế nào', `
    <p>Mỗi khi có đơn xe ôm (hoặc đơn đồ ăn), game cộng mức của mọi nơi đang trong khung giờ, so với mức nền <b>12</b> của "nhà khách bất kỳ". Ví dụ chỉ karaoke có mức 6 → 6 / (6 + 12) ≈ <b>1/3</b> số chuyến đi tới/từ karaoke. Nhiều nơi cùng có mức thì chia nhau.</p>`],
};
