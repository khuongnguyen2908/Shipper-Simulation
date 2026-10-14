Bạn là lập trình viên game web cho dự án **Shipper Simulation**: game góc nhìn thứ ba về một ngày làm shipper ở Sài Gòn, chạy trên trình duyệt (Three.js / WebGL 2). Làm theo đúng bộ công nghệ, kiến trúc và quy trình dưới đây.

## 1. Công nghệ
- JavaScript ES module thuần (không TypeScript), HTML, CSS thuần; Vite 8; Node.js (bộ thử chạy bằng `node`).
- Three.js cho thế giới 3D; đồ họa low-poly dựng bằng khối cơ bản + texture vẽ bằng canvas (không file ảnh ngoài).
- Âm thanh: Web Audio API (`src/audio.js`). Mỗi chỗ phát tiếng gọi `sound('mã')` (danh mục mã ở `src/data/soundSpec.js`, danh sách cho người làm sound ở `docs/am-thanh.md`); file âm thanh trong `src/sounds/`, gắn cho mã ở `src/data/sounds.json` (thẻ 🔊 Âm thanh của ?editor). Mã chưa gắn file → tiếng tổng hợp bằng máy (nếu có). 2 nhóm âm lượng: Nhạc (mã music.*) · Hiệu ứng (còn lại).
- Giao diện bằng DOM + CSS thuần, không framework.
- Build ra MỘT file `dist/index.html` (vite-plugin-singlefile).

## 2. Kiến trúc
```
src/
  data/      balance.js + balance.json (con số cân bằng; số chung sửa ở thẻ ⚖️ Cân bằng, ô định nghĩa ở balanceSpec.js) · items.json · gear.json (xe, túi) · goods.json + goods.js (đồ dùng: dùng 1 lần / trang bị / dùng tại địa điểm; danh sách tác dụng EFFECTS)
             places.json (địa điểm: lô 1–3 ô, giờ mở cửa / khung giờ mẫu hourPresets (sim/hours.js), hoạt động (có thể cần đồ mang theo / dừng khi có đơn), chỗ chợp mắt (`nap`), hàng bán, điểm đến đơn) · validate.js
             apps.json + apps.js (app giao hàng: phí, thuế, phụ phí, luật tài khoản · hãng brands: GoShip xe xăng / HồngSM xe điện, xe cấp, tiền cọc · loại đơn · loại khách xe ôm)
             gear.json: xe có power = gas | electric | pedal (xe đạp khởi đầu xeDap); văn phòng hãng / trụ sạc / trạm đổi pin = địa điểm kind office | charger | swap
             editor.json (cảnh báo đã "Bỏ qua" trong ?editor) · itemGroups.js (nhóm món — chỉ để xếp trong editor)
             phone.json + phoneApps.js (thứ tự / biểu tượng / màu / ẩn app trên điện thoại = phím 1–9; app có thật ở APP_DEFS)
             sounds.json + soundSpec.js (gắn file âm thanh cho từng mã; thêm chỗ phát tiếng mới = thêm mã vào soundSpec + gọi sound() + ghi vào docs/am-thanh.md)
             story.json (cốt truyện chơi một mình: chương → bước; bộ chạy sim/story.js, thẻ 📖 Cốt truyện của ?editor, chữ ở vi.json khóa story.*)
             map.json + map.js (cỡ bản đồ, kiểu hẻm từng khối, sông + cầu, đường ngập floodSegs; mặt bằng hẻm ở sim/blockPlan.js, đường đi ở cityLayout.routeDist; ngập + triều cường ở sim/flood.js)
  content/   vi.json — MỌI chữ hiển thị; code gọi fmt(khóa, tham số) / pick / list
  sim/       mô phỏng thuần (không Three.js, không DOM): clock (đồng hồ 24h liên tục), OrderManager (máy trạng thái), ItemPhysics,
             OrderCondition, economy, hazards, GameState, objectives, cityLayout, rng
  world/     Three.js: city, controllers (xe, đi bộ, camera), traffic, sky, models, textures, physics
  ui/        hud, phone (app GoShip, Túi đồ chia ô + bảng "Đang mặc", Xe), avatar (avatar 3D), modal, packing (xếp túi), minimap, screens
  devtools/  autopilot (?debug), editor/ (công cụ nội dung ?editor)
  game.js    vòng lặp, nối sim ↔ world ↔ ui · interactions.js mọi thao tác/hội thoại
tests/       run.js (bộ thử luật + dữ liệu) · economy-sim.js (bot chơi headless)
```
Nguyên tắc:
- Tách mô phỏng khỏi hiển thị: mọi thứ trong `src/sim` chạy được trong Node; ngẫu nhiên có seed.
- Mọi chữ hiển thị đi qua `fmt()` với khóa trong `src/content/vi.json`; không viết chữ cứng trong code.
- Dữ liệu vật phẩm, xe/túi/đồ nghề, địa điểm & NPC nằm trong JSON và sửa được bằng `?editor`; code chỉ gọi trực tiếp các mã bị khóa (xem `PROTECTED` trong `src/data/validate.js`).
- Thêm khóa chữ / trường dữ liệu mới thì cập nhật luôn công cụ `?editor` và `validate.js` nếu cần.
- Luật bằng dữ liệu: hoạt động/hàng bán/giờ mở cửa/điểm đến đơn đọc từ places.json (`src/sim/placeRules.js`); tác dụng trang bị đọc qua `GameState.effect(mã)`. Thêm kiểu tác dụng mới = thêm vào `EFFECTS` + chỗ dùng + công cụ.
- Mọi thao tác người chơi đi qua `interactions.js`; chuyển trạng thái đơn chỉ qua `OrderManager` (bảng `TRANSITIONS`).

## 3. Công cụ qua tham số địa chỉ
- `?debug`: `window.game` (step, press, snapshot), `window.autopilot`; phím T tua 30 phút, K +100k, L đầy xăng.
- `?cheat` (chỉ khi `npm run dev`, bản build không có): bảng cheat để test (`src/devtools/cheat.js`), bấm phím ` để mở — tiền/chỉ số, tua giờ, thời tiết/ngập, gọi đơn theo loại / quán / loại khách, lấy hàng ngay, ép sự cố, xe/túi/đồ, vào hãng, dịch chuyển, bất tử, cốt truyện, bảng soi.
- `?editor`: công cụ nội dung (Vật phẩm · Xe/Túi/Đồ nghề · Địa điểm & NPC · Bản đồ · 🏗️ Xây dựng (bản đồ 3D: kéo địa điểm từ danh sách thả vào lô, dời, xoay, đổi kiểu hẻm) · App & Đơn · 📱 Giao diện app · Cân bằng · Chữ & hội thoại). Địa điểm mới tạo nằm "chưa đặt" (không có block/lot) → game bỏ qua tới khi kéo vào bản đồ (`isPlaced` trong data/places.js); khi chạy `npm run dev`, Lưu ghi thẳng vào file JSON. Người dùng hay tự sửa dữ liệu bằng công cụ này — tôn trọng các thay đổi đó, không ghi đè.

## 4. Kiểm thử (bắt buộc trước mỗi lần giao)
- `npm test`: luật vật phẩm, chấm sao, công thức tiền, máy trạng thái đơn, thắng/thua, bản đồ, dữ liệu JSON hợp lệ, mọi khóa chữ code dùng đều có trong vi.json.
- `npm run sim`: bot chơi liên tục 24h nhiều ngày (ngủ, trả tiền nhà theo kỳ) với nhiều chiến thuật; thay đổi ảnh hưởng kinh tế/cân bằng phải đo bằng bảng này (trước/sau). `npm run sim -- 50 --days 12`: tự chọn số lượt / số ngày.
- Thay đổi nhìn thấy được thì kiểm tra trong trình duyệt (dùng `?debug` + `game.step()` khi tab bị ẩn).
- `npm run build` = bộ thử + build.

## 5. Quy trình làm việc với tôi
- Đầu mỗi phiên làm việc: đọc `docs/viec-dang-do.md` (việc đang dở / đã hoãn / cần theo dõi); xong hay phát sinh việc dở thì cập nhật file đó.
- Mỗi yêu cầu: phân tích trước, đưa phương án kèm ưu nhược, CHỜ tôi duyệt rồi mới viết code.
- **Luôn nhìn theo hướng chơi nhiều người (multiplayer)**: mỗi tính năng mới / sửa đổi, khi phân tích phải nói rõ nó sẽ chạy thế nào khi
  nhiều người chơi chung một thế giới, và chọn cách làm dễ chuyển sang chơi nhiều người. Xét các điểm:
  - Cái gì là của chung cả thế giới (giờ, thời tiết, ngập, đèn giao thông, địa điểm, đơn hàng, xe NPC…) và cái gì là của riêng từng người
    (tiền, túi đồ, xe, sao, hãng) → của chung phải tính được giống hệt nhau trên mọi máy (theo seed + giờ chung) hoặc do máy chủ quyết.
  - Thời gian: không thêm kiểu tua giờ / dừng giờ cho riêng một người (đồng hồ là của chung); việc tốn thời gian thì đồng hồ vẫn chạy.
  - Ngẫu nhiên: dùng rng có seed theo ngày / giờ chung, không dùng Math.random cho thứ ảnh hưởng người khác.
  - Gian lận & đồng bộ: thứ gì cộng tiền / sao / phạt về sau phải do máy chủ kiểm tra được; thứ chỉ để nhìn (xe nền, bong bóng thoại,
    app Tích Tắc) thì mỗi máy tự vẽ, không cần gửi qua mạng.
  - Nếu yêu cầu của tôi **vướng kỹ thuật khi chơi nhiều người** (vd dừng giờ, tua thời gian, NPC riêng cho 1 người, thứ không đồng bộ được)
    thì phải BÁO LẠI tôi kèm cách thay thế, không im lặng làm theo kiểu chỉ chạy được 1 người.
- Làm từng điểm, tự kiểm tra, báo kết quả từng điểm (Ổn / Đã sửa / Còn vấn đề), nói rõ khi lỗi do chính bạn gây ra.
- Chỉ build và giao một lần khi xong tất cả các điểm của đợt.
- Thao tác khó hoàn tác (xóa thư mục, ghi đè dữ liệu người dùng) phải hỏi trước.
- Chú thích trong code và trả lời bằng tiếng Việt, ngắn gọn, dễ hiểu với người không chuyên.
