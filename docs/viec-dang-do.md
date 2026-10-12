# Việc đang dở — Shipper Simulation

Ghi lại những việc đã bàn mà chưa làm / còn treo, để đổi máy hay đổi tài khoản Claude vẫn làm tiếp được.
Làm xong mục nào thì xóa (hoặc chuyển xuống "Đã xong gần đây"). Cập nhật lần cuối: 13/10/2026.

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

### 🚦 Luật giao thông (chủ game: "để làm sau, bàn kỹ hơn")
- Đề xuất đã đưa (chưa chốt):
  - **11a Đèn giao thông**: cọ "🚦 Đèn" trong thẻ Bản đồ (bấm ngã tư đặt/gỡ, chỉnh xanh/vàng/đỏ + độ lệch), lưu map.json;
    cột đèn có số đếm ngược; xe NPC dừng vạch; người chơi vượt đỏ bị phạt khi có camera phạt nguội (đặt trong editor) hoặc chốt CSGT.
  - **11b Đường một chiều**: cọ "➡️ Một chiều" tô đoạn đường (bấm lại đổi chiều); mũi tên sơn + biển; NPC, xe buýt, chỉ đường
    (khi đi xe) tránh ngược chiều; tuyến buýt bị kẹt → báo lỗi trong editor; đi ngược chiều bị phạt (dắt bộ thì không).
  - **11c** (tùy chọn): chạy trên vỉa hè, bấm điện thoại khi chạy xe, cấm rẽ trái.
  - Mỗi vi phạm = 1 lý do phạt mới trong app CSGT; mức phạt / tỉ lệ bị bắt ở thẻ Cân bằng; bot phải tính thêm thời gian chờ đèn.
  - Chỗ nối sẵn: `map.json` dạng `floodSegs` (theo đoạn `x3:5`), cọ vẽ như `floodBox/paintFlood` trong `tabMap.js`;
    xe NPC chọn hướng ở `traffic.pickNext`, giữ chỗ ngã tư ở `traffic.canEnter`; đường đi `cityLayout.roadGraph` (đang vô hướng).

## 🔊 Âm thanh (chủ game làm trong `?editor` → 🔊 Âm thanh)
- Đã có file: **51/86 mã**. Cột "Xong" trong `docs/am-thanh.md` chưa đánh dấu mã nào (cần nghe duyệt).
- **35 mã chưa có file** (đang dùng tiếng tổng hợp hoặc im):
  `ui.sign`, `phone.call`, `chat.open`, `chat.bubble`, `loop.engine`, `drive.splash`, `drive.stall`, `order.boarded`, `order.done`,
  `order.quit`, `order.vomit`, `order.bom`, `order.returned`, `order.robbed`, `order.scamCaught`, `order.helmetLost`,
  `quest.walletFound`, `quest.walletKept`, `quest.walletReturned`, `loop.rain`, `loop.city`, `place.fuel`, `place.charge`,
  `place.swap`, `place.oil`, `place.buyVehicle`, `place.activity`, `place.use`, `place.nap`, `place.sleep`, `place.joinBrand`,
  `place.gotBike`, `law.airport`, `money.rentLate`, `progress.gameOver`.
- Kho tiếng mẫu CC0 (Kenney) ở `sound-library/` — nghe thử, bấm "+ Gắn" trong editor. Tiếng đặc trưng VN (gà gáy, còi xe máy, phà, tiếng phố)
  thì tìm trên Pixabay (miễn phí, không cần ghi tên) với từ khóa như `scooter horn`, `rooster`, `rain loop`, `asian street`, `ship horn`.
- **Dung lượng:** `night.mp3` nặng 3,8 MB làm `dist/index.html` ~11 MB → nên cắt 1–2 phút hoặc xuất lại 128 kbps.
- Nhạc ban ngày `morning-street.mp3` chỉ 30 giây nên lặp dày (đã chồng tiếng ở chỗ nối, không còn giật) → nên thay bài dài hơn / bài "loop".
- 2 mã mới cho ngập đường: `drive.splash` (lội nước), `drive.stall` (chết máy) — đang dùng tiếng tổng hợp.

## 🐞 Cần theo dõi
- **IDM tự tải file tiếng khi chạy `npm run dev`**: đã đổi `src/soundFiles.js` sang nhúng tiếng (`?inline`) — bản build vốn đã nhúng sẵn.
  Chưa thử với IDM thật (đường dẫn dev vẫn có đuôi `.mp3?import&inline`). Nếu IDM vẫn bắt: gom 64 tiếng thành 1 module không đuôi .mp3.
  Nút nghe thử kho tiếng trong editor: thêm `localhost` vào danh sách loại trừ của IDM.
- Điện thoại ở cửa sổ hẹp < 1100px: máy dời lên trên bản đồ tròn nên thu nhỏ nhiều (cửa sổ 1000×600 → ~45%). Không méo, nhưng nhỏ.
- **Esc đóng popup lại bật màn hình tạm dừng:** đã sửa chung (Esc lúc đang mở hộp thoại / điện thoại / chat / bảng cheat chỉ để đóng popup,
  kể cả khi trình duyệt dùng Esc để thả chuột) nhưng **chưa tái hiện được đúng popup chủ game gặp**. Gặp lại thì ghi rõ popup nào.

## 💡 Tùy chọn (đã đề xuất, chủ game chưa quyết)
- Chữ "GoShip" còn sót: `npc.goship.greet` không chỗ nào dùng (văn phòng hãng đã đổi mã thành `officeGoship`) → xóa hoặc đổi thành
  `npc.officeGoship.greet`; `phone.app` người chơi gần như không thấy → có thể đổi thành "Nhận đơn".
- Ngập đường: **phụ phí ngập** trên app (để sau); xe buýt vẫn chạy qua chỗ ngập (cao gầm); game chưa có đường chỉ dẫn vẽ trên bản đồ
  nên chưa "né đường ngập" cho người chơi — đoạn ngập chỉ tô xanh trên bản đồ.
- Bảng cheat (`?cheat`): đổi tên 2 ô "Loại khách (chở khách)" và "Khách xe ôm LUÔN là" cho đỡ nhầm (vd "Khách cho đơn gọi ngay" /
  "Khách cho đơn tự đến") hoặc gộp làm một.
- Khách lừa đảo: thẻ đơn đã đội lốt "Khách app"; còn 2 dấu hiệu tinh ý ("Tài khoản mới · 0 chuyến", "Đòi trả tiền mặt").
  Có thể làm khó hơn: bỏ bớt dấu hiệu, hoặc thỉnh thoảng khách thường cũng có dấu hiệu đó để gây nhiễu.

## ✅ Đã xong gần đây (13/10/2026 — đã đẩy lên GitHub)
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
