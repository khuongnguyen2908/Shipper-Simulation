# Việc đang dở — Shipper Simulation

Ghi lại những việc đã bàn mà chưa làm / còn treo, để đổi máy hay đổi tài khoản Claude vẫn làm tiếp được.
Làm xong mục nào thì xóa (hoặc chuyển xuống "Đã xong gần đây"). Cập nhật lần cuối: 14/10/2026.

## ⏸ Hoãn có chủ đích

### Đăng nhập tài khoản + lưu save trên mạng (Firebase)
- **Chỉ làm khi đã xong hết tính năng** (chủ game muốn nối Firebase 1 lần cho gọn).
- Đã chốt:
  - Firebase (Auth + Firestore), vẫn đăng game trên GitHub Pages như cũ.
  - Đăng nhập bằng **tên tự đặt + mật khẩu**, không dùng Gmail/email: ngầm đổi tên → email giả `ten@shipper-sim.game`.
    Tên 3–16 ký tự (chữ không dấu, số, `_`, không phân biệt hoa thường), mật khẩu ≥ 6 ký tự.
  - **Bắt buộc đăng nhập mới được chơi.**
  - Quên mật khẩu: lúc đầu chủ game đặt lại bằng tay trong trang quản lý Firebase; mã khôi phục để sau (cần Cloud Functions / gói Blaze).
  - **Không được làm mất save cũ**: save hiện ở `localStorage` (`SAVE_KEY` trong `src/game.js`, ghi lúc 06:00 / ngủ dậy qua `saveGame()`)
    → chuyển vào tài khoản đầu tiên đăng nhập trên máy đó.
  - Chủ game tự tạo dự án Firebase (Claude hướng dẫn từng bước), dán cấu hình vào code.

## 💬 Đang bàn
### 🧍 Đổi kiểu người sang "low-poly mượt" (14/10 — đã duyệt 4 đợt; P1 xong, CHỜ chủ game xem)
- Mẫu chủ game chốt: `src/devtools/personSample.js` (trình xem thử, game không dùng). Khung khớp giữ nguyên → mọi dáng / tư thế / tay nắm lái dùng lại.
- **P1 (xong)** `src/world/person.js` (buildPerson) — `models.makePerson` giữ nguyên tham số, gọi sang file mới; kiểu cũ còn trong `makePersonClassic`,
  xem lại bằng `?nguoicu` (để so / làm bản "người đơn giản" ở P4). Thân 10 cạnh, tay chân 8 cạnh; ~2.200 tam giác / người (cũ ~1.000),
  đo trong game: vẽ người ~2,7 ms / khung (cũ ~2,6 ms).
  - 16 kiểu tóc (`sim/people.js` HAIR_BY_GENDER): nam ngắn vuốt lệch · rẽ ngôi 7/3 · two block · mái ngố · húi cua · xoăn ngắn · dài buộc sau · trọc;
    nữ dài thẳng · ngang vai · bob · đuôi ngựa · búi cao · hai bím · mái bằng · xoăn dài. Đội mũ bảo hiểm: bỏ phần đỉnh, búi cao → búi thấp.
    Màn tạo nhân vật chỉ hiện kiểu của giới tính đang chọn; bản lưu cũ chọn kiểu giới kia → kiểu gần nhất (`hairFor`). NPC đặt sẵn chọn kiểu nào cũng được (?editor).
  - Tạo nhân vật thêm chọn **áo thun tay ngắn / tay dài + quần short / quần dài + giày đen / trắng** (món có sẵn giá 0: thêm `aoThunDai`, `quanDaiCu`, `giayTrangCu` vào goods.json;
    `goods.startOutfit`). Người đi đường ngẫu nhiên: 55% áo cộc tay, 25% đàn ông quần short.
  - Màn tạo nhân vật (phương án A): bảng rộng 780 px, hình 3D to 300×450 bên trái (nút Toàn thân / Cận mặt), ô chọn bên phải;
    kiểu tóc chọn kiểu lật trang ‹ Kiểu 2/8 › (phím ← →, đổi giới tính → về kiểu 1). Bảng hẹp (< 640 px) tự xếp hình lên trên.
  - Mũ bảo hiểm nửa đầu / fullface, nón lá, mũ công an, kính, khẩu trang, găng, thùng hàng, đồng phục hãng, áo khoác chống nắng, áo mưa: đã dựng lại
    theo đầu / thân mới ở mức dùng được — P2 làm kỹ.
  - Kho đồ: 6 món chọn lúc tạo nhân vật có ô `start` (goods.json, ?editor) → chỉ có món đã chọn; bản lưu cũ có món đầu như trước.
- **Mũ bảo hiểm (14/10, b1)**: thành phụ kiện (tháo / đội trong 🎒 Túi đồ, dừng xe). Lúc đầu KHÔNG có mũ (đi xe đạp đầu trần) —
  hãng cấp mũ khi đăng ký (quà vào hãng, đội luôn); nghỉ hãng trả mũ → còn mũ tự mua thì đội, không thì đầu trần. Mũ ở cửa hàng vẫn mua được.
  Xe máy / xe điện đầu trần: nhắc khi lên xe + dòng đỏ "⛑️ Chưa đội mũ" trên HUD; qua chốt CSGT hoặc gần xe tuần tra → dừng xe phạt
  `ECONOMY.noHelmetFine` (60k, thẻ ⚖️ Cân bằng), cộng dồn với lỗi quá tốc độ / vượt đèn đỏ. Xe đạp thường không bị.
  "Mũ bảo hiểm bể" (muXanh, giá 0) giờ không ai có → ?editor báo cảnh báo; chủ game chọn: đặt giá + nơi bán, hoặc xóa.
  🌐 Đội mũ là của riêng người chơi; máy chủ kiểm tra được (vị trí người chơi so với chốt / tuần tra theo lịch chung). Nộp phạt vẫn tua 15 phút (cần bỏ khi chơi nhiều người).
- **P2 (xong 14/10)**: mũ fullface có phần che cằm + gờ kính + khe gió; khẩu trang nhỏ lại, che kín mũi, có nếp gấp + quai tai; găng ngắn có cổ găng,
  găng ống dài kéo lên tới tay áo cộc (hết lởm chởm ở khuỷu); áo khoác chống nắng / đồng phục dài phủ hông (che thắt lưng) + viền gấu; mũ trùm sau gáy có lòng mũ;
  thùng hàng đeo lưng đổi màu theo đồng phục hãng + ô logo. Áo mưa, mũ nửa đầu, nón lá, mũ công an, kính giữ như P1.
- **P2b (xong 14/10, chủ game: "làm hết cho tôi xem thử")**: 88 món mới (chỉ để mặc đẹp, không tác dụng → npm run sim y hệt trước), bán ở
  Shop Quần Áo (64 món — dài, chủ game có thể chia bớt sang shop khác ở ?editor), Shop Giầy Dép, Shop Phụ Kiện.
  - Áo: polo, sơ mi, sơ mi caro, hoodie, ba lỗ, khoác kéo khóa, khoác jean, khoác da, vest + cà vạt, gile phản quang, bà ba, đá banh số 10,
    đội tuyển sao vàng, thun I ❤ SG, len cổ lọ · nữ: croptop, hai dây, áo dài (có tà trước theo chân / nằm trên đùi khi ngồi xe), đầm.
    Liền bộ: đầm (chân trần), yếm jean, đồ ngủ sọc (quần cùng màu).
  - Quần: jean, quần tây, jogger, túi hộp, 3 sọc, lửng, quần đùi · nữ: ống rộng, legging, chân váy, váy xòe, váy bút chì.
  - Giày: dép lê / quai ngang, xỏ ngón, sandal quai hậu, bata vải cổ cao, giày tây, giày lười, bốt, ủng · nữ: búp bê, cao gót.
  - 3 chỗ đeo mới (phụ kiện, tháo / đeo trong túi đồ): mũ lưỡi trai (đội mũ bảo hiểm thì không thấy), đồng hồ / vòng tay (tay trái), balo / túi đeo chéo.
  - goods.json thêm ô color2 (màu phụ) + gender 'f' (chỉ nữ: cửa hàng ghi "Chỉ dành cho nhân vật nữ", nam không mua / mặc được). ?editor có 2 ô này.
  - Sửa (chủ game xem trang tất cả quần áo): dây áo ba lỗ / hai dây / yếm vắt ngay trên vai (person.js strap); tà áo dài liền thân (taLathe);
    áo mưa thành áo mưa dài tay kiểu áo khoác chống nắng, dài tới mắt cá, có mũ trùm + vạt trước theo chân, ngồi xe thì thu ngắn và phủ lên đùi
    (bỏ áo mưa cánh dơi ở kiểu người mới). Áo khoác chống nắng / áo mưa giờ lấy đúng màu món đang mặc (trước luôn xanh nhạt / xanh dương).
  - Người đi đường / khách / người ngồi quán (cờ casual) mặc ngẫu nhiên các kiểu mới; NPC có đồ riêng (CSGT, ba gác…) giữ nguyên.
- **P3 (xong 14/10)**: đồ gắn thêm của NPC đặc biệt (npcStyles.PROPS) khớp thân mới — balo / cặp có quai vắt vai, khăn quàng đỏ có nút thắt,
  hình xăm ôm đúng phần da tay áo cộc, dây chuyền, áo choàng + bịt mắt, cà vạt áp ngực (ngực nam 0,118 / nữ 0,107 m — parts.female).
  Thay đồ rời bằng đồ có sẵn: jetjet mặc sơ mi caro thật (shirtStyle plaid + jean; bỏ PROPS.plaid + vải caro canvas), khách vội sơ mi + quần tây + giày tây,
  học sinh sơ mi, vé số túi đeo chéo (carry).
  Sửa thêm (chủ game xem): hình xăm thành nét tribal gọn + hoa hồng nhỏ (trước: mảng mực kín tay); áo choàng cong ôm vai, có cổ buộc + khuy;
  cụ ông / cụ bà luôn chống gậy (gậy tròn có tay cầm cong); dây dắt chó nối đúng bàn tay (có vòng dây trong tay); chai bia nâu có nhãn + nắp, cầm dựng đứng;
  CSGT (chốt + tuần tra, models.csgtLook): nguyên bộ vàng (áo kiểu police: cổ bẻ, cầu vai đỏ, bảng tên, phù hiệu, 2 túi ngực, thắt lưng đen to + khóa + bao súng),
  mũ bảo hiểm 3/4 vàng (helmetStyle open — che tai + gáy, chữ CSGT; cũng chọn được cho món mũ ở ?editor), dây chéo + bao bộ đàm, giày da đen, ~50% khẩu trang.
  ngồi xe banh 2 đùi ra 2 bên theo kiểu xe (BIKE_SPECS spread; người ngồi sau 0,3–0,32 — yên sau rộng); sọc xanh xe tuần tra thành 2 sọc mỏng áp hông xe → chân không lún vào yếm / thân xe. Đã xem: 12 vai người đi đường, 6 loại khách, 6 xe NPC (jetjet, đối thủ, ba gác, trộm chó, CSGT, xe ôm nằm).
- **P4 (xong 14/10)**: người ở xa (> 30 m, chừa 4 m chống nhấp nháy) vẽ bản đơn giản — person.js lite(): ít cạnh, bỏ chi tiết < 4,5 cm (giữ mắt,
  lông mày, miệng); ~960 tam giác / người (chi tiết ~2.190). Đổi hình theo khoảng cách camera (updatePeopleLod, 6 khung hình / lần). Người chơi + ô xem nhân vật
  luôn chi tiết (userData.keepDetail). Cài đặt → "Người đi đường: Chi tiết / Đơn giản" (settings.people). Đo trong game (414 người, ~220 trong khung):
  tam giác người 530k → 280k, thời gian vẽ người ~3,2 → ~1,6 ms / khung (kiểu cũ ~2,6 ms). CHỜ chủ game: có xóa kiểu người cũ (makePersonClassic, ?nguoicu)
  và file mẫu devtools/personSample.js không.
- 🌐 Nhiều người chơi: ngoại hình người chơi (tóc, áo quần) là của riêng từng người, gửi kèm hồ sơ để máy khác vẽ; người đi đường chỉ để nhìn.

### 🏘️ Nhà địa điểm "kiểu A" (14/10 — A1 + A2 xong, chủ game ok)
- Chủ game chọn hướng A: giữ kiểu khối vuông của game, học chi tiết từ mẫu nhà "đồ chơi" — KHÔNG đặt đồ ăn khổng lồ trên nóc (nhà Việt không có).
  Mẫu thử phong cách bo tròn (người xấu, nặng máy ~25 nghìn tam giác / người) đã bỏ, file thử đã xóa.
- **A1 (xong)** `placeBuildings.js` decoA / eateryInside: nhà ống mặt tiền phẳng (quán ăn, bánh mì, tạp hóa, sửa xe, trái cây, đồ chơi; tiệm vàng / xe máy chỉ sân thượng):
  tầng lầu đầu có cửa sổ lá sách + bồn hoa + lan can; sân thượng chậu cây, hoa giấy rủ, ăng-ten, dây phơi; mái hiên sọc + diềm + lồng đèn (quán ăn);
  quán ăn mặt tiền mở (`houses.js` ground 'open') thấy bàn inox, ghế nhựa, quầy nồi nước lèo, bàn thờ thần tài, quạt trần.
  Biển dọc chỉ quán bật ô "Biển dọc" (places.json signV / signVText, ?editor Địa điểm) — bật sẵn: Phở Bà Tư, Bún Mọc, Cơm Tấm, Hủ Tiếu, Lẩu Dê.
- **A2 (xong)** `cafeFront`: kiểu modern (trà sữa, tiệm bánh, nhà sách, cửa hàng tiện lợi…) thêm dây đèn bóng tròn, dù che + bàn ghế (lô ≥ 6 m),
  chậu cây; modern + cafe thêm sân thượng kiểu A. Biển dọc tím có sẵn của mọi nhà modern: chủ game chọn giữ nguyên.
- Ô giữa khối thường (trước là sân trống) → nhà phía sau 1–3 tầng không cửa (cityLayout centerFills + city.js), ngẫu nhiên theo khối.
- 2 trường đại học chọn được cỡ "Cả khối" (CAMPUS_LOOKS) → khuôn viên: Mỹ thuật chữ U kiểu Pháp; RMEET tòa kính + thư viện + căng tin + sân bóng rổ + nhà xe.
  Chưa đổi lô của 2 trường trên bản đồ — chủ game tự chọn ở ?editor nếu muốn.

### 🧍 Hình NPC khớp lời thoại — chia 3 đợt (14/10, đã duyệt; đợt 1 xong, CHỜ chủ game xem)
- **Đợt 1 (xong)** — `world/npcStyles.js` (pedStyle / riderStyle / suitcaseOnBike) + `models.applyPose` (ngồi bệt, còng lưng, lắc lư, gục, đi nghênh ngang, giơ tay định kỳ):
  người đi đường theo thẻ vai trên tên (ăn xin ngồi bệt + lon ở cổng chùa / chợ / nhà thờ / bệnh viện / bến xe, tối đa 5 người · vé số nón lá + túi + xấp vé ·
  anh / chị đại xăm tay, kính đen, dây chuyền · thằng khùng áo choàng đỏ giơ tay "bay" · ngoại quốc ba lô to + máy ảnh · sinh viên ba lô ·
  `[dacho]` người dắt chó (tên mới trong ped.names) · con nít đồng phục, khăn quàng đỏ · người già còng lưng, chống gậy, nón lá);
  khách xe ôm theo loại (say: mặt đỏ, cầm chai, ngồi gục · vali: kéo vali, lên xe thì vali luôn kẹp giữa người lái và khách ·
  ngoại quốc · học sinh · khách vội: áo trắng, cà vạt, cặp, xem đồng hồ). Khách lừa đảo cố ý mặc đồ thường.
- Sửa sau khi chủ game xem (14/10): anh đại to con + xăm kín 2 tay (hoa văn vẽ canvas), chị đại xăm tay; lắc lư / gục / đi nghênh ngang xoay quanh hông
  (trước bị đứt ngang người); tay người lái nắm đúng tay lái mọi kiểu xe (`models.gripBar`: tự tính góc vai / khuỷu + chồm lưng tới khi tay không với tới) —
  người chơi, xe máy NPC, xe trên phà.
- **Đợt 2 (xong 14/10, CHỜ chủ game xem trong game)** — hình ở `world/npcVehicles.js`, chạy ở `world/traffic.js` (spawnSpecials / specialTick / thiefTick),
  số liệu ở thẻ ⚖️ Cân bằng → 🧢 Xe NPC đặc biệt: Jetjet A (3 nhóm 2–3 xe nối đuôi theo xe dẫn, 19–24h, lạng lách, bốc đầu, nẹt pô `city.rev`, câu trêu),
  shipper đối thủ (15% xe máy NPC + 5 người đứng chờ trước quán ăn), ba gác (3 xe, 5–20h, chạy làn ô tô, né đường nhỏ),
  trộm chó B (`sim/dogThief.js`: 2 vụ / đêm 22–04h theo ngày + seed thế giới; chó luôn thoát; bấm còi gần → trộm bỏ chạy, chủ chó cảm ơn 30k / vụ;
  tin Tích Tắc `tt.hot.dogThief` sáng hôm sau).
  Câu thoại bổ sung: `[dacho]` người dắt chó, `[elder]` ông / bà cụ (ped.smallTalk, bubble.ped); khách chào khi lên xe (bubble.riderHi) theo loại khách
  ([drunk] [vali] [hurry] [hocSinh] [nuocNgoai] [sinhVien] + [elder]) — interactions.js boardPassenger dùng pickFor với role = loại khách. Thùng hàng của NGƯỜI CHƠI nhuộm màu bị lệch (thùng gốc màu xanh) — chưa sửa, chờ chủ game.
- **Đợt 3 (xong 14/10, CHỜ chủ game xem)**: CSGT tuần tra (`sim/patrol.js`: 2 tổ / ngày 7–21h, tuyến + giờ theo ngày + seed thế giới; xe mô tô
  2 thùng hai bên + đèn xanh đỏ; chạy quá tốc độ trong 25 m → `patrolStop` phạt như ở chốt; vượt đèn đỏ trước mặt → phạt luôn tiền phạt vượt đèn;
  mỗi tổ dừng mình tối đa 1 lần / 20 phút game; số liệu thẻ Cân bằng → npcFlavor.patrol*) · xe CSGT đậu trên vỉa hè cạnh mỗi chốt (đèn nháy)
  · chú xe ôm nằm ngủ trên xe trước địa điểm bật "Có chú xe ôm" (places.json xeOm; bật sẵn bến xe buýt, chợ Hòa Bình, bệnh viện), mời "xe ôm không?".
  Tính năng riêng của chú xe ôm: bàn sau. Lưu ý chơi nhiều người: nộp phạt đang tua 15 phút (như phạt ở chốt cũ) — tua giờ riêng cần bỏ khi chơi nhiều người.
- 🌐 Nhiều người chơi: hình NPC chỉ để nhìn, mỗi máy tự vẽ. NPC có ảnh hưởng luật chơi (CSGT, trộm chó, xe ôm) phải chạy theo lịch giờ chung như xe buýt.

### 🌐 Chuẩn bị chơi nhiều người: lương cứng 2 hãng · biển số tài xế · bỏ tua thời gian (14/10 — đã góp ý, CHỜ chủ game chọn)
- **Số đo (bot 6 ngày × 30 lượt, tiền kiếm/ngày sau phí sàn, chưa trừ tiền nhà)**: normal ~530k GripBike / ~510k CamSM (~11 đơn) ·
  careful ~480k / ~460k · picky ~400k / ~390k · rush ~740k / ~680k (bị phạt ~190k). Xăng + nhớt ~60k/ngày, sạc + đổi pin ~15k/ngày.
  Script đo: cộng dồn `gs.stats` mỗi ngày (vá `GameState.startDay`), thu nhập thật = income − codAdvance.
- **1. Lương cứng** (đề xuất, ≈ 10–30% thu nhập, mỗi hãng một kiểu người chơi):
  - GripBike "tự do + thưởng": 60k/ngày nếu bật app ≥ 4 giờ game; thưởng mốc 8 đơn +30k · 12 đơn +60k · 16 đơn +100k; phí sàn 20%; đơn ×1,1.
  - CamSM "lương cao + ràng buộc": 160k/ngày nếu bật app ≥ 8 giờ trong ca 7h–22h, nhận ≥ 80% đơn mời, điểm ≥ 4,5; phí sàn 25%; đơn ×0,9.
  - Ước tính/ngày: normal Grip ~620k vs Cam ~637k · rush 860k vs 793k · picky 490k vs ~364k (rớt chỉ tiêu) · careful 570k vs 586k.
  - Trả lương: chốt lúc app đóng (24h), cộng vào ví 06:00 hôm sau. Đổi hãng: mất cọc + chờ 1 ngày (chọn phe là quyết định thật).
  - Hướng mở khi có máy chủ: thị phần theo khu phố, bảng xếp hạng hãng theo tuần, giờ vàng riêng mỗi hãng.
- **2. Biển số = mã tài xế**: 1 người 1 số cố định dạng `59-G1 234.56` (G = GripBike, C = CamSM), đổi xe vẫn giữ số;
  hiện ở biển sau xe (mô hình xe có sẵn tấm biển), áo đồng phục, hồ sơ app. Tố cáo ẩn danh ở văn phòng hãng (lỗi dịch vụ)
  hoặc công an (lỗi giao thông): chỉ tố được người đã gặp (≤ 30 m trong 30 phút trước), tối đa 3 lần/ngày, cần ≥ 3 người khác nhau
  mới bị phạt, hay tố sai thì giảm uy tín; che biển số bị CSGT phạt. Làm được ngay: phần hiển thị; tố cáo chờ có máy chủ.
- **3. Bỏ tua thời gian** (đồng hồ: 1 giây thật = 1 phút game; 1 ngày = 24 phút thật). Chỗ đang tua: `g.advance` ở game.js
  (ngủ, chợp mắt, ngất 6 tiếng, chờ phà, phím T) và interactions.js (hoạt động, xe buýt cả chuyến, sạc / đổi pin / thay nhớt,
  chờ quán / chờ khách, leo thang, CSGT giữ 6–15 phút, dùng đồ 1–10 phút, mua đồ 2 phút).
  Hoạt động: 32/50 ≤ 15 phút · 11 ở 16–30 · 6 ở 31–60 · "đi làm văn phòng" 480 phút. Đề xuất:
  - Việc tốn thời gian: thanh tiến độ + động tác, đồng hồ vẫn chạy, đơn vẫn đổ về; dừng / bước đi lúc nào cũng được → nhận đúng phần đã làm.
    Tiền: món ăn / vé trả trước; dịch vụ tính giờ (karaoke, massage, thuê phòng, sạc) trả theo phút đã dùng.
  - Rút hoạt động còn tối đa ~20–30 phút game, giữ tổng tác dụng; "đi làm văn phòng 8 tiếng" bỏ hoặc thành ca 30 phút.
  - Ngủ: (a) ngủ thật hồi nhanh (~1 phút thật là đầy) + (b) đăng xuất ở nhà trọ = ngủ; bỏ luật "buồn ngủ sau 16 giờ thức" (= 16 phút thật).
  - Xe buýt: lên đúng xe đang chạy trên bản đồ, tới trạm bấm E xuống. Ngất: ~1 phút màn hình mờ, tỉnh ở bệnh viện, mất tiền + đơn.
  - Phím T / tua trong cheat chỉ còn ở ?debug / ?cheat. Câu hỏi để sau: có chậm đồng hồ chung lại khi chơi nhiều người không.
- Thứ tự đề xuất: (3) bỏ tua → (1) lương cứng (cân lại trên nền mới, đo bot trước/sau) → (2) biển số (phần hiển thị).
- **Chờ chủ game chọn**: kiểu lương 2 hãng · luật đổi hãng · dạng biển số + chỉ làm phần hiển thị · cách ngủ (a)+(b) và bỏ luật 16 giờ ·
  cách tính tiền dịch vụ (trả trước / trả theo phút).

### 🏙️ Phố giống Việt Nam hơn — đã làm A (13/10, chờ chủ game xem trong game)
- Đã làm (giữ lưới đường, không đổi tên đường): nhà ống 2–3 căn / lô (3,4–6,3 m, `houses.js splitFrontage`), biển hiệu to ngang mặt tiền,
  bậc dắt xe, cơi nới mái tôn, thêm màu tường; gạch vỉa hè lộn xộn (gạch đỏ, terrazzo, mảng vá, lặp mỗi 8 m); ~45% cây thân cao;
  xe máy đậu xiên sát lề (trước nhà dân + trước địa điểm, né cửa) + quán cóc ghế nhựa ngồi được (căn có cửa hàng); xe hàng rong ở mọi khu
  theo độ đông. Độ đông theo khu: `districts[mã].street = { bikes, stalls, vendors }` (thẻ 🗺️ Bản đồ → Khu phố, để trống = theo "người đi bộ").
  Lối đi bộ dời về 2,05 m từ lề (`traffic.js PED_LANE`).
- Làm thêm (13/10 tối): khách ngồi quán cóc (`world/stallPeople.js`, 12 người dùng lại, ~55% ghế có khách, ghế có khách thì người chơi
  không ngồi được); quán cóc luôn có bạt che; kho chữ biển hiệu 22 chữ (`city.shopSigns`), vẫn giữ nhà ở bình thường;
  **nhà góc 2 mặt tiền**: căn ngoài cùng ở góc khối (phía hông ra đường thật, không phải sông / khối gộp) có mặt hông sơn màu,
  cửa sổ từng tầng, trệt mở cửa hàng, biển chữ L chạy sang hông (`houses.js h.corner`, `city.js cornerDirOf`) — đã xem trong game: ổn.
- Có thể làm sau: B (ngã ba bằng gộp khối, vòng xoay).

### 🏍️ Xe nền (chỉ để nhìn) — đã làm A (13/10 tối)
- `src/world/bgTraffic.js`: xe máy khối đơn giản (~220 tam giác) chạy theo làn xe máy trong vùng 35–140 m quanh người chơi,
  rẽ ở ngã tư như xe NPC, không va chạm. Vào gần < 35 m (hoặc ra quá xa) thì mờ dần lấm tấm rồi hiện lại phía xa.
  Rải nhiều trên đường người chơi đang đứng; xe ở đường khuất sau 15–30 giây thì nhường chỗ. Đèn pha / đèn hậu luôn sáng.
  Dừng sau đuôi xe NPC thật cùng làn; qua ngã tư KHÔNG nhường xe khác (ở xa nên khó thấy).
- Số liệu: thẻ ⚖️ Cân bằng → 🏍️ Xe nền (tối đa 150, gần 35 m, xa 140 m, tốc độ); độ đông theo khu: thẻ 🗺️ Bản đồ → Khu phố →
  🏍️ Xe chạy nền (`districts[mã].street.flow`, để trống = theo "người đi bộ"). Cả đàn 5 lần vẽ, đo không thấy chậm hơn.
- Có thể làm sau (B): xe nền chạy vào gần thì chuyển thành xe NPC thật nếu còn chỗ (khỏi thấy xe mờ đi giữa đường).

### 🚦 Đèn giao thông — đã làm (13/10 khuya)
- `sim/lights.js` + `world/trafficLights.js`: đèn ở ngã tư đại lộ cắt đường thường / đại lộ (gợi ý tự động 27 đèn, 10 camera;
  sửa ở thẻ 🗺️ Bản đồ → 🚦), 2 pha theo giây thật (xanh 8 / vàng 2), xe NPC + xe nền dừng đỏ / vàng, rẽ phải luôn được.
- Vượt đèn đỏ (game.js redLightTick): lần đầu mỗi ngày chỉ nhắc; sau đó % bị ghi hình (thường 15%, camera 70%, chốt CSGT 100%),
  tối đa 2 lần phạt / ngày, 30–60 phút sau app CSGT báo phạt nguội 100k (nộp ở đồn như phạt nguội khác). Mỗi sáng nhóm tài xế báo
  ngã tư có camera. Số ở thẻ ⚖️ Cân bằng → 🚦 (đặt 3 ô % = 0 là chỉ để nhìn).
- Sim 9 ngày (trước → sau): bot tuân thủ chờ đèn ~70 phút game / ngày → normal 10,9 → 10,1 đơn/ngày, tiền cuối 2765k → 2372k;
  bot ẩu (vượt đèn) bị phạt 1,75 lần / ngày → tiền cuối 3688k → 2036k. Muốn nhẹ hơn: giảm giây đèn xanh / vàng hoặc bớt đèn.
- Chưa làm: xe buýt chạy theo lịch nên không dừng đèn; đường một chiều, 11c (chạy vỉa hè, bấm điện thoại, cấm rẽ trái) để sau.

## ✅ Đã xong (13/10/2026 khuya)
- App điện thoại **⏱️ Tích Tắc** (tên chọn để tránh trùng nhãn hiệu TikTok): lướt tin, thả tim, xem bình luận — chỉ để vui.
  Tin nóng theo chuyện trong game (dự báo, mưa, ngập, triều cường, kẹt xe, chốt CSGT, khai trương, điểm nóng lừa đảo, ví anh Minh),
  tin về mình (tân binh, số đơn, điểm), tin vui ngẫu nhiên. Ảnh = chụp thật trong thế giới 3D (game.snapPhoto), clip = vẽ 2D.
  Mẫu tin ở vi.json `tt.*` ("[loại ảnh] @tác_giả | chú thích | nhạc | chữ trên ảnh"), kiểm tra ở validate.js `validateFeedLines`.
  Tiếng mới `phone.swipe`, `phone.like` (chưa gắn file).
  Thêm: 18 tin theo trend TikTok VN (tháng 10/2026: "Ai đưa em về", 20/10, cạn phước, trùng sinh chắc luôn, delulu…),
  nhóm `tt.spot` (tin quán quen, luôn có 2 tin) = Tiệm Trà A Di Đà chị Linh; `photo:<mã địa điểm>` chụp đúng nơi đó.
- Người đi đường **TikToker** (vai `[tiktok]`): kiểu A giơ điện thoại trước mặt / kiểu B gậy tự sướng, đi chậm (models.holdPhone).
- Xưng hô: thẻ tuổi / giới tính trước tên ("[kid] Con nít", "[f] …"); tên không rõ nam nữ → mỗi người đi đường ngẫu nhiên;
  "Thằng …" = thanh niên ("Thằng nhóc / bé …" = trẻ con); tên Tây chỉ đoán theo danh sách tên quen.
- Người đi đường: chép câu ped.smallTalk sang bubble.ped (bỏ ngoặc kép); người có câu riêng 70% nói câu đúng vai (content/index.js ROLE_SHARE).
- `?editor`: sửa lỗi "Lưu thất bại … reading '0'" (thẻ Địa điểm vẽ bản đồ lô khi có địa điểm chưa đặt); lưu xong mà vẽ lại lỗi thì báo riêng.

## ✅ Đã xong (13/10/2026 tối) — 16 lỗi chủ game báo
- Điện thoại: tới văn phòng hãng thì hướng dẫn "bấm E đăng ký" (không quay lại bước mở Bản đồ) · có đơn mới khi đang xem app khác
  chỉ hiện thông báo (không tự nhảy app) · sửa Bản đồ bị đen (lỗi cập nhật giao diện khi nhảy thẳng từ Bản đồ sang app khác)
  · điện thoại nằm trên bong bóng thoại (lớp 7).
- Đổ xăng / sạc xong không chỉ đường về nhà nữa: nhắc trả tiền nhà chỉ vào ngày hạn trả.
- Cản trở giao thông: không tính khi đang kẹt xe, khi xe phía sau vốn đã bị xe khác chặn, khi mình đang chạy theo dòng;
  xe buýt xét xe NPC chắn trước rồi mới tới người chơi.
- Tiếng sấm chỉ khi trời bắt đầu mưa lúc đang chơi (không phát khi tua giờ: ngủ, chợp mắt, phím T…).
- Trạm sạc: chỗ sạc dưới mái che cạnh trụ (cityLayout.chargeSpot), phải chạy vào sân (≤ 3,5 m) mới sạc.
- Xuống xe không giật camera · đi bộ không xuyên qua xe của mình.
- Xe đậu lề đường giảm một nửa; không đậu trước bệnh viện, đồn công an, trường, bến xe, cây xăng, trạm sạc / đổi pin, nhà thờ,
  bưu điện, sân bay, bến phà, góc ngã tư (vạch qua đường), trạm xe buýt.
- Độ khó giao hàng / chở khách giảm 40% (mọi mức hư hại do chạy xe; số viết cứng chuyển ra thẻ Cân bằng → Lái xe).
  Sim 9 ngày: rush qua ngày 9 từ 20% → 97%, sao TB 3,85 → 4,18; careful 4,34 → 4,40; normal 4,30 → 4,43.
- Vựa ve chai: nút "♻️ Bán đồ cũ" (places.json `buys`): quần áo / trang bị đã mua 30% giá (economy.resalePct), vỏ chai / vỏ lon
  1k mỗi cái (goods `voChai`, `scrapPrice`); uống nước suối / soda / trà xanh / nước tăng lực xong còn vỏ (`use.leaves`).
- Chó: mẫu chó ta vàng; không lao qua sông, chạy xong về lại khối nhà của mình.
- Xưng hô (sim/people.js personOf + pronouns): lời thoại dùng {toi} {ban} {khach} {minh} {anhchi} theo người nói (giới tính + tuổi
  đoán từ tên, nhân viên quán lễ phép) và giới tính nhân vật mình; câu / tên gắn thẻ vai "[veso] …" (vé số, xe ôm, ăn xin,
  bán kẹo). Thêm người đi đường "Ông lão ăn xin", "Thằng nhóc bán kẹo". Bác Năm (mẹ anh Minh) là nữ.
- Lưu game: vẫn tự lưu lúc 06:00 (có báo "💾 Đã tự lưu"), thêm nút "💾 Lưu game" khi nói chuyện Cô Hai ở nhà trọ
  (đang chạy đơn thì không lưu được). Ngủ dậy / chợp mắt / bị ngất vẫn tự lưu như cũ.

## ✅ Đã xong (13/10/2026 chiều)
- Khách lừa đảo khó nhận ra hơn (A + D): khách app thường đôi khi cũng hiện "Tài khoản mới" (8%) / "Đòi trả tiền mặt" (10%);
  mỗi tối 20:30 nhóm Hội Shipper đồn 1 "điểm nóng" (`scamHotspot`, đổi theo ngày) — kẻ lừa đảo 70% đón ở đó.
  Số ở thẻ Cân bằng → 🧍 Sự cố khi chở khách. Bot cẩn thận chỉ từ chối khi thấy đủ 2 dấu hiệu (không còn "nhìn trộm" nhãn ẩn).
- Âm thanh: chủ game đánh dấu "Xong" cả 86 mã trong `docs/am-thanh.md` (có gì cập nhật sau). Bỏ theo dõi: `night.mp3` nặng,
  nhạc ngày ngắn (chủ game: "kệ đi"); IDM, điện thoại ở cửa sổ hẹp, lỗi Esc (chủ game đã thử: ổn / tạm xong).
- Chữ "GoShip" còn sót: `npc.goship.greet` → `npc.officeGoship.greet` (câu chào văn phòng GripBike chạy lại), `phone.app` = "Nhận đơn".
- Phụ phí ngập: đơn mà chỗ lấy hoặc chỗ giao đang ngập (từ mức xăm xắp) cộng `floodSurcharge` (apps.json, mặc định 5k, thẻ 📲 App & Đơn),
  thẻ đơn có nhãn "🌊 Đường ngập". Khách quen gọi thẳng không có.
- Bảng cheat: gộp 2 ô loại khách thành 1 ô "Loại khách" (dùng cho cả Gọi đơn ngay lẫn đơn tự đến, nhớ qua F5).

## ✅ Đã xong gần đây (13/10/2026 sáng — đã đẩy lên GitHub)
- Sửa bong bóng chat nhảy chữ (gần mép màn hình bị bóp hẹp → xuống dòng lại): rộng theo câu, làm tròn vị trí, giữ trong màn hình.
  Sửa thêm: bản đồ hụt 10px bên phải, biển nổi dài bị cắt chữ (tự co chữ), đang ngồi bị người đi đường đẩy trượt, bấm E việc khác
  khi đang ngồi thì đứng dậy trước, bảng giữ xe không mở khi đang chạy nhanh, mũi tên xe buýt giữ trạm đã chọn (không nhảy),
  bộ thử đổi tuyến thử thật, bảng "Đang mặc" ở màn hình hẹp cao theo nội dung.
- Ngồi ghế (E Ngồi / Đứng dậy, bấm đi cũng đứng dậy): đôn quán ăn, ghế cà phê, ghế đá công viên, ghế trạm / bến xe buýt, sân bay,
  sân tennis / pickleball, đại học. Ngồi hồi tinh thần chậm tới mức tối đa (thẻ Cân bằng → energy.seat). Quán trà chưa ngồi được
  (đôn bị sàn hiên che), võng không ngồi được (khách không vào trong).
- Camera chỉ né nhà (bỏ qua cây, cột, xe đậu), lùi ra từ từ → hết zoom giật.
- Tài xế chửi khi bị chắn đầu xe (1,5 giây câu nhẹ, 8 giây câu gắt) / bị tông — câu ở `bubble.driverMild / driverAngry / busMild / busAngry / driverHit`.
- Xe máy đậu lề đường / bãi giữ xe / sân bay / đồn / showroom: xe thật 1 kiểu (underbone, `PARKED_MODELS` trong world/parkedBikes.js),
  lề đường còn ~40% số xe cũ, chỉ hiện trong ~70 m quanh người chơi (không hiện trong thẻ 🏗️ Xây dựng).
- Bãi giữ xe: biển nổi + E "Xem bảng giữ xe" (phí gửi, luật đậu ngoài đường, số lấy từ thẻ Cân bằng).
- Túi đồ 4 × 5 ô / trang, lật trang ◀ ▶, đồ đang mặc không nằm trong túi. Điện thoại + bảng "Đang mặc" cỡ cố định 340 × 640, thu nhỏ đều khi cửa sổ thấp.
- Hoạt động ở địa điểm: thể lực = 0 hết (chỉ còn tinh thần). 11 đồ ăn uống mới bán ở 6 tiệm Triangle K (nước suối, sữa, soda, trà xanh,
  xúc xích, snack, mì ly, bánh mì, cơm nắm, bánh bao, cơm hộp). Bot mua đồ ăn ở tiệm thay cho số "meal/drink" cũ (đã bỏ khỏi balance.json).
- App Bản đồ: hiện trạm xe buýt (bật lọc 🚌), nút "🚏 Trạm gần nhất", thẻ trạm + Chỉ đường tới trạm. Xe đang ở đồn công an:
  chỉ đường đi bộ ra trạm → tuyến nào (đổi tuyến 1 lần nếu cần) → xuống đâu, hiện ở mục tiêu, app CSGT và thẻ địa điểm.

## ✅ Đã xong trước đó (12/10/2026)
- Âm thanh: kho tiếng Kenney + nghe thử / dừng trong editor, nghe tiếng tổng hợp, nhạc lặp liền.
- Ngập đường + triều cường (thẻ 🗺️ Bản đồ → 🌊 Đường ngập, thẻ ⚖️ Cân bằng → 🌊), hủy đơn vì ngập (chưa lấy hàng, không trừ sao).
- Bảng cheat `?cheat` (chỉ localhost).
- Xe buýt dừng khi bị chắn / bóp còi; người đi bộ né vật cản nhẹ nhàng; biển + vòng xanh ở trạm xe buýt; hộp thoại trạm xổ theo tuyến;
  công an phạt cản trở giao thông (đứng chắn xe 15 phút → đưa vào lề, phạt nguội 100k); thanh cuộn mảnh; cỡ túi theo số ô.
