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

## Công cụ nội dung `?editor`

Chạy `npm run dev` rồi mở `http://localhost:5173/?editor`.

| Thẻ | Sửa được | File |
|---|---|---|
| 🍜 Vật phẩm | thêm/xóa/đổi mã món, tên, biểu tượng, đặc tính (nóng, lạnh, nước, dễ vỡ, hộp giấy), giá cước, nhiệt độ, quán nào bán; biểu đồ món hư trong 30 phút theo từng túi | `src/data/items.json` |
| 🛵 Xe · Túi · Đồ nghề | chỉ số, giá, màu, mô tả; thêm/xóa xe và túi; bảng so sánh | `src/data/gear.json` |
| 🏪 Địa điểm & NPC | tên, biển hiệu, màu, số tầng, vị trí (bấm ô trên bản đồ), NPC, thực đơn, bán đồ ăn/uống, lời thoại riêng; thêm/xóa quán; tên đường, tên khách, tên người đi đường | `src/data/places.json` |
| 💬 Chữ & hội thoại | toàn bộ chữ trong game (475 khóa), tìm kiếm, lọc theo nhóm, xem trước với tham số mẫu | `src/content/vi.json` |

- **Lưu (Ctrl+S)** ghi thẳng vào file JSON; game đang mở tự tải lại. Còn lỗi ⛔ thì không lưu được.
- Thay đổi chưa lưu được giữ làm **bản nháp** trong trình duyệt, mở lại sẽ hỏi khôi phục.
- Không có máy chủ dev (bản build) → chỉ **Xuất JSON** để chép tay vào dự án.
- Những mục code dùng trực tiếp (🔒) không xóa/đổi mã được: món `passenger`, xe `cub`, túi `nylon`, 3 đồ nghề, các địa điểm không phải quán ăn.
- `npm test` kiểm tra lại dữ liệu và mọi khóa chữ code đang dùng.

Thiết kế chi tiết: [DESIGN.md](DESIGN.md).
