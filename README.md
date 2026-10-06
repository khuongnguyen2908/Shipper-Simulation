# 🛵 Shipper Simulation

Game mô phỏng một ngày làm shipper ở Sài Gòn, góc nhìn thứ ba, Three.js / WebGL 2.

## Chạy

```bash
npm install
npm run dev        # chơi thử ở http://localhost:5173
npm test           # bộ thử luật
npm run sim        # bot mô phỏng kinh tế
npm run build      # thử + build ra MỘT file dist/index.html (bấm đúp là chơi)
```

## Điều khiển

| Phím | Việc |
|---|---|
| W A S D / mũi tên | lái xe / đi bộ |
| Shift | chạy (đi bộ) |
| Space | phanh |
| F | lên / xuống xe |
| E | tương tác (lấy hàng, giao hàng, nói chuyện, đổ xăng…) |
| Tab | điện thoại GoShip |
| Y / N | nhận / bỏ đơn |
| I | túi đồ |
| H | còi · M tắt tiếng · Esc tạm dừng |
| Kéo chuột / cuộn | xoay / zoom camera |

`?debug` trên địa chỉ: `T` tua 30 phút, `K` +100k, `L` đầy xăng; `window.game.step()` và `window.autopilot` dùng để kiểm thử.

## Đăng game cho bạn bè chơi (GitHub Pages)

Mỗi lần sửa xong (trong `?editor` đã bấm Lưu):

```bash
npm run dang -- "ghi chú ngắn, vd: thêm 2 món cơm tấm"
```

Lệnh này chạy bộ thử → gom thay đổi thành 1 commit → đẩy lên GitHub. GitHub Actions (`.github/workflows/deploy.yml`) tự build và cập nhật link `https://<tên>.github.io/<repo>/` sau 1–2 phút. Bộ thử lỗi thì không đăng.

Lần đầu: tạo repo **Public** trống trên GitHub, vào **Settings → Pages → Source: GitHub Actions**, rồi `git remote add origin <link repo>.git`.

## Công cụ nội dung `?editor`

Chạy `npm run dev` rồi mở `http://localhost:5173/?editor`.

| Thẻ | Sửa được | File |
|---|---|---|
| 🍜 Vật phẩm | thêm/xóa/đổi mã món, tên, biểu tượng, đặc tính (nóng, lạnh, nước, dễ vỡ, hộp giấy), giá cước, nhiệt độ, quán nào bán; biểu đồ món hư trong 30 phút theo từng túi | `src/data/items.json` |
| 🛵 Xe · Túi · Đồ dùng | xe, túi (chỉ số, giá, màu); **đồ dùng**: loại *dùng 1 lần* (dùng bằng phím I: +thể lực/tinh thần/xăng/độ bền xe, mất N phút) hoặc *trang bị* (chọn tác dụng: chống mưa, chống nắng, chở được khách, giảm % mệt/căng thẳng/hao xăng/mệt leo thang, thêm đệm, khách chịu tốc độ, boa thêm); chọn nơi bán | `src/data/gear.json`, `src/data/goods.json` |
| 🏪 Địa điểm & NPC | thêm **Quán ăn** hoặc **Dịch vụ** (nhà sách, karaoke…); tên, biểu tượng bản đồ, biển hiệu, màu, vị trí (bấm ô trên bản đồ), NPC, **giờ mở cửa**, **hoạt động** (giá, số phút, ±thể lực, ±tinh thần, số lần/ngày), **hàng bán**, **điểm đến của đơn** (khách xe ôm / đặt đồ ăn tới, mức 0–10, khung giờ), thực đơn quán, lời thoại riêng; tên đường, tên khách | `src/data/places.json` |
| 💬 Chữ & hội thoại | toàn bộ chữ trong game (475 khóa), tìm kiếm, lọc theo nhóm, xem trước với tham số mẫu | `src/content/vi.json` |

- **Lưu (Ctrl+S)** ghi thẳng vào file JSON; game đang mở tự tải lại. Còn lỗi ⛔ thì không lưu được.
- Thay đổi chưa lưu được giữ làm **bản nháp** trong trình duyệt, mở lại sẽ hỏi khôi phục.
- Không có máy chủ dev (bản build) → chỉ **Xuất JSON** để chép tay vào dự án.
- Những mục code dùng trực tiếp (🔒) không xóa/đổi mã được: món `passenger`, xe `cub`, túi `nylon`, 3 đồ nghề, các địa điểm không phải quán ăn.
- `npm test` kiểm tra lại dữ liệu và mọi khóa chữ code đang dùng.

Thiết kế chi tiết: [DESIGN.md](DESIGN.md).
