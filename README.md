# 🛵 Shipper Simulation

Game mô phỏng cuộc sống shipper ở Sài Gòn (chơi tự do, đồng hồ 24h), góc nhìn thứ ba, Three.js / WebGL 2.

## Chạy

```bash
npm install
npm run dev        # chơi thử ở http://localhost:5173
npm test           # bộ thử luật
npm run sim        # bot chơi liên tục 9 ngày (100 lượt, ~2 phút): % còn trụ qua từng hạn tiền nhà
npm run sim -- 50 --days 12   # tự chọn số lượt / số ngày
npm run build      # thử + build ra dist/ (index.html nhẹ có màn loading + assets/ + loading/)
npm run preview    # chơi thử bản build ở http://localhost:4173 (bấm đúp dist/index.html không chạy)
```

## Điều khiển

| Phím | Việc |
|---|---|
| W A S D / mũi tên | lái xe / đi bộ (camera tự quay ra sau lưng — tắt trong Cài đặt) |
| Shift | chạy (đi bộ) |
| Space (hoặc S / ↓, Ctrl phải, số 0) | phanh êm — không đổ hàng |
| Space + S | phanh gấp — dừng nhanh, đổ hàng |
| F | lên / xuống xe |
| E | tương tác (lấy hàng, giao hàng, nói chuyện, đổ xăng…) |
| Tab | điện thoại GoShip |
| Y / N | nhận / bỏ đơn |
| I | túi đồ |
| H | còi · M tắt tiếng · Esc tạm dừng |
| Kéo chuột / cuộn | xoay / zoom camera |

`?debug` trên địa chỉ: `T` tua 30 phút, `K` +100k, `L` đầy xăng; `window.game.step()` và `window.autopilot` dùng để kiểm thử.

**Mã cheat** (kiểu GTA, chỉ khi chơi Offline): bấm phím `` ` `` (dưới Esc) → gõ mã → Enter.
`GIAUTO` +1.000k · `HOISUC` đầy thể lực + tinh thần · `DAYXANG` đầy xăng / pin, xe như mới · `NAMSAO` 5 sao ·
`XOANO` xóa phạt + nợ tiền nhà · `HANGBEN` hàng không hư (bật / tắt) · `BATTU` không mệt (bật / tắt) · `XEXIN` xe mạnh nhất.

## Đăng game cho bạn bè chơi (GitHub Pages)

Mỗi lần sửa xong (trong `?editor` đã bấm Lưu):

```bash
npm run dang -- "ghi chú ngắn, vd: thêm 2 món cơm tấm"
```

Lệnh này chạy bộ thử → gom thay đổi thành 1 commit → đẩy lên GitHub. GitHub Actions (`.github/workflows/deploy.yml`) tự build và cập nhật link `https://<tên>.github.io/<repo>/` sau 1–2 phút. Bộ thử lỗi thì không đăng.

Lần đầu: tạo repo **Public** trống trên GitHub, vào **Settings → Pages → Source: GitHub Actions**, rồi `git remote add origin <link repo>.git`.

## Công cụ nội dung `?editor`

Chạy `npm run dev -- --port 5180` rồi mở `http://localhost:5180/?editor`.

| Thẻ | Sửa được | File |
|---|---|---|
| 🍜 Vật phẩm | thêm/xóa/đổi mã món, tên, biểu tượng, đặc tính (nóng, lạnh, nước, dễ vỡ, hộp giấy), giá cước, nhiệt độ, quán nào bán; biểu đồ món hư trong 30 phút theo từng túi | `src/data/items.json` |
| 🛵 Xe · Túi · Đồ dùng | xe, túi (chỉ số, giá, màu); **đồ dùng**: loại *dùng 1 lần* (dùng bằng phím I: +thể lực/tinh thần/xăng/độ bền xe, mất N phút) hoặc *trang bị* (chọn tác dụng: chống mưa, chống nắng, chở được khách, giảm % mệt/căng thẳng/hao xăng/mệt leo thang, thêm đệm, khách chịu tốc độ, boa thêm); chọn nơi bán | `src/data/gear.json`, `src/data/goods.json` |
| 🏪 Địa điểm & NPC | thêm **Quán ăn** hoặc **Dịch vụ** (nhà sách, karaoke…); tên, biểu tượng bản đồ, biển hiệu, màu, vị trí (bấm ô trên bản đồ), NPC, **giờ mở cửa**, **hoạt động** (giá, số phút, ±thể lực, ±tinh thần, số lần/ngày), **hàng bán**, **điểm đến của đơn** (khách xe ôm / đặt đồ ăn tới, mức 0–10, khung giờ), thực đơn quán, lời thoại riêng; tên đường, tên khách | `src/data/places.json` |
| 🗺️ Bản đồ | cỡ bản đồ, hẻm trong từng khối, sông và cầu | `src/data/map.json` |
| 📱 App & Đơn | phí app, thuế, phụ phí, luật tài khoản; loại đơn; loại khách xe ôm | `src/data/apps.json` |
| ⚖️ Cân bằng | tiền khởi đầu, tiền nhà từng ngày, chi phí, hao thể lực/tinh thần, nhịp đơn, tỉ lệ sự cố; nút **🤖 Chạy thử bot** (bảng thắng theo ngày, dùng số đang sửa) | `src/data/balance.json` |
| 💬 Chữ & hội thoại | toàn bộ chữ trong game, tìm kiếm, lọc theo nhóm, xem trước với tham số mẫu | `src/content/vi.json` |

- **Lưu (Ctrl+S)** ghi thẳng vào file JSON; game đang mở tự tải lại. Còn lỗi ⛔ thì không lưu được.
- **↶ Hoàn tác (Ctrl+Z) / ↷ Làm lại (Ctrl+Y)** mọi thay đổi chưa lưu, kể cả xóa và "Bỏ thay đổi" (khi đang gõ trong ô thì Ctrl+Z chỉ hoàn tác chữ trong ô).
- Thẻ **🏗️ Xây dựng**: bản đồ 3D đúng hình trong game. Tạo địa điểm ở thẻ Địa điểm → nó nằm chờ trong danh sách "Chưa đặt" → kéo thả vào lô. Kéo nhà sang lô khác, **R** xoay mặt tiền, **Delete** cất vào danh sách, bấm khối để đổi kiểu hẻm. Chuột trái kéo = dời bản đồ, chuột phải = xoay, lăn = phóng to.
- Mỗi dòng ở danh sách bên trái có nút **⋯** (hoặc chuột phải): **📋 Sao chép (Ctrl+C) · 📥 Dán (Ctrl+V) · 🗑 Xóa (Delete)**. Bản dán giống hệt bản gốc (tên, thông số, quán bán / thực đơn / loại đơn…), chỉ khác mã. Sao chép xong dán được ở máy khác / editor online. Thẻ hoạt động trong địa điểm cũng có Sao chép / Dán.
- Thay đổi chưa lưu được giữ làm **bản nháp** trong trình duyệt, mở lại sẽ hỏi khôi phục.
- Không có máy chủ dev (bản build) → chỉ **Xuất JSON** để chép tay vào dự án.
- Những mục code dùng trực tiếp (🔒) không xóa/đổi mã được: món `passenger`, xe `cub`, túi `nylon`, 3 đồ nghề, các địa điểm không phải quán ăn.
- `npm test` kiểm tra lại dữ liệu và mọi khóa chữ code đang dùng.

Thiết kế chi tiết: [DESIGN.md](DESIGN.md).

## Bản quyền

© 2026 Khương (Flynt) Nguyễn. Giữ mọi quyền — xem [LICENSE](LICENSE).
Được chơi miễn phí qua link chính thức; không sao chép, sửa, đăng lại, phát tán hay dùng lại mã nguồn, hình ảnh, nhân vật, cốt truyện khi chưa được tác giả cho phép bằng văn bản.

Copyright © 2026 Khương (Flynt) Nguyễn. All rights reserved — see [LICENSE](LICENSE).
