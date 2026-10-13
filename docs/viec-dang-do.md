# Việc đang dở — Shipper Simulation

Ghi lại những việc đã bàn mà chưa làm / còn treo, để đổi máy hay đổi tài khoản Claude vẫn làm tiếp được.
Làm xong mục nào thì xóa (hoặc chuyển xuống "Đã xong gần đây"). Cập nhật lần cuối: 13/10/2026 (khuya).

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

### 🚦 Luật giao thông — TẠM DỪNG (13/10, chủ game bảo dừng để làm phố trước)
- Đã chốt (13/10):
  - Làm **đèn giao thông trước**; đường một chiều + 11c (chạy vỉa hè, bấm điện thoại, cấm rẽ trái) để sau.
  - Vị trí đèn: **máy tự gợi ý** (ngã tư có đại lộ), chủ game sửa trong thẻ 🗺️ Bản đồ (như đường ngập).
  - Vượt đèn đỏ chỉ bị phạt ở ngã tư có **camera phạt nguội** (đặt / gợi ý trong editor) hoặc đang có **chốt CSGT**;
    **nhóm tài xế báo trong chat ở đâu có camera phạt nguội**.
  - Phạt vượt đèn đỏ **200k** (thẻ Cân bằng). Chu kỳ đèn **xanh 8 · vàng 2 · đỏ 8 giây thật** (1 giây thật = 1 phút game nên phải ngắn), chỉnh ở thẻ Cân bằng;
    bot tính thêm thời gian chờ đèn, đo trước / sau.
- **Điểm 5 (đã phác thảo B, chờ chốt) "rẽ phải khi đèn đỏ: tùy chỗ, có tiểu đảo phân luồng được không"**: đã đưa 3 phương án
  (A: cài từng ngã tư Được / Cấm + biển nhỏ · B: A + vạch sơn đảo phân luồng ở góc · C: tiểu đảo nổi thật + làn rẽ phải riêng — phải khoét góc khối nhà, rất lớn).
- Chỗ nối sẵn: `map.json` dạng `floodSegs`, cọ vẽ như `floodBox/paintFlood` trong `tabMap.js`; xe NPC giữ chỗ ngã tư ở `traffic.canEnter`;
  rẽ phải là cung bậc hai `makeTurn` (TURN_R = 8 m) chạy sát góc cong vỉa hè (~1–2 m) nên không còn chỗ cho đảo nổi trong ngã tư hiện tại.

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
