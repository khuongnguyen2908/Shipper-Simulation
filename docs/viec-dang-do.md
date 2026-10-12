# Việc đang dở — Shipper Simulation

Ghi lại những việc đã bàn mà chưa làm / còn treo, để đổi máy hay đổi tài khoản Claude vẫn làm tiếp được.
Làm xong mục nào thì xóa (hoặc chuyển xuống "Đã xong gần đây"). Cập nhật lần cuối: 12/10/2026.

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

## ✅ Đã xong gần đây (12/10/2026)
- Âm thanh: kho tiếng Kenney + nghe thử / dừng trong editor, nghe tiếng tổng hợp, nhạc lặp liền.
- Ngập đường + triều cường (thẻ 🗺️ Bản đồ → 🌊 Đường ngập, thẻ ⚖️ Cân bằng → 🌊), hủy đơn vì ngập (chưa lấy hàng, không trừ sao).
- Bảng cheat `?cheat` (chỉ localhost).
- Xe buýt dừng khi bị chắn / bóp còi; người đi bộ né vật cản nhẹ nhàng; biển + vòng xanh ở trạm xe buýt; hộp thoại trạm xổ theo tuyến;
  công an phạt cản trở giao thông (đứng chắn xe 15 phút → đưa vào lề, phạt nguội 100k); thanh cuộn mảnh; cỡ túi theo số ô.
