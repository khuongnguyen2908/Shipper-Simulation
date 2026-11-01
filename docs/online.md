# Chơi Online — chạy máy chủ thành phố chung

Máy chủ là một chương trình Node.js nhỏ (`server/`), chạy trên máy của chủ game. Người chơi mở game như bình thường
(GitHub Pages hoặc `npm run dev`), bấm **🌐 Online** → nhập tên → **Vào thành phố**.

## 1. Thử trên một máy (không cần mạng)

```bash
npm run server
```

Mở game (`npm run dev` → http://localhost:5173), bấm 🌐 Online. Ô tình trạng phải hiện "🟢 Máy chủ đang mở".
Muốn thử 2 người trên cùng máy: mở tab thứ 2 với link `http://localhost:5173/?server=ws://127.0.0.1:8787`
(địa chỉ khác → máy coi là tài khoản khác).

- Dữ liệu (tài khoản, tiền, xe…) lưu ở `server/data/city.json` — **xóa file này = xóa trắng thành phố** (tắt máy chủ trước).
- Tắt máy chủ: Ctrl+C (dữ liệu được ghi ngay).
- Đổi cổng: `PORT=9000 npm run server`.
- Các con số (tiền người mới, ngủ, chat gần, số người tối đa…): `?editor` → ⚖️ Cân bằng → 🌐 Chơi online.

## 2. Cho bạn bè vào (miễn phí, qua Tailscale Funnel)

Tailscale Funnel tạo một địa chỉ `https://….ts.net` cố định trỏ về máy chủ trên máy bạn —
không phải mở cổng modem, không lộ địa chỉ IP nhà.

1. Tải và cài Tailscale: https://tailscale.com/download → đăng nhập (Google được).
2. Bật máy chủ: `npm run server`.
3. Mở một cửa sổ dòng lệnh khác, chạy:
   ```bash
   tailscale funnel 8787
   ```
   Lần đầu Tailscale sẽ đưa một đường link để bật HTTPS + Funnel cho tài khoản — mở link, bấm đồng ý, rồi chạy lại lệnh.
   Lệnh in ra địa chỉ dạng `https://ten-may.ten-mang.ts.net` (giữ cửa sổ này mở; muốn chạy nền thì thêm `--bg`).
4. Gửi bạn bè link mời (đổi `https://` thành `wss://` ở phần sau `?server=`):
   ```
   https://khuongnguyen2908.github.io/Shipper-Simulation/?server=wss://ten-may.ten-mang.ts.net
   ```
   Bấm link là game tự nhớ địa chỉ máy chủ. Hoặc dán `wss://ten-may.ten-mang.ts.net` vào ô "Địa chỉ máy chủ" ở bảng 🌐 Online.

Lưu ý: bản game trên GitHub Pages phải là bản đã có chế độ Online (đã đẩy code lên). Máy bạn tắt / máy chủ tắt thì mọi người rớt;
tiến độ đã lưu không mất.

## 3. Luật riêng của Online (Offline không đổi)

- Giờ là của chung: 1 phút trong game = 1 giây thật, không ai tua được. Việc tốn thời gian (chờ quán, nộp phạt, đi xe buýt…) chạy thanh tiến độ.
- Ngủ: nằm giường ~1 phút thật là hồi như ngủ đủ giấc; hoặc thoát game ở phòng trọ = coi như đi ngủ (hồi sức theo thời gian vắng, không cộng ngày).
- Tiền nhà / đói / mệt chỉ tính khi đang online; kỳ tiền nhà đếm theo **ngày của mình** (số ngày đã chơi), không theo lịch thành phố.
- Không có cốt truyện; mọi địa điểm mở sẵn. Tiến độ Online tách riêng bản chơi Offline.
- Lần đầu vào một máy chủ: nhập tên → màn tạo nhân vật (như Chơi mới) → vào thành phố. Ngoại hình máy chủ giữ theo tài khoản.
- Biển số do máy chủ cấp lúc vào lần đầu (không trùng ai), gắn theo người. Đi xe đạp / đi bộ thì người khác chỉ thấy tên.
- Chat: Enter mở ô chat, Tab đổi **Chung** (cả thành phố) / **Gần** (người trong 40 m, hiện bong bóng). Giữ **O**: danh sách người online.

## 4. Đơn hàng + tiền (đợt M2)

- **Đơn chung:** máy chủ sinh đơn (dùng nguyên luật đơn của game), đơn mang hãng của khách. Shipper cùng hãng ở gần có thể cùng thấy một đơn
  ("👥 N shipper gần đây cũng thấy") — ai bấm Nhận trước được, người kia thấy "Đơn đã có người nhận" (không bị trừ điểm nhận đơn).
- **Máy chủ tính tiền:** lấy hàng / giao hàng phải đứng gần cửa quán / cửa khách; giao xong máy chủ tự tính tiền, sao, tiền boa
  (hóa đơn có dòng "🔒 Máy chủ đã ghi sổ").
- **Ví do máy chủ giữ:** mọi khoản thu / chi báo lên máy chủ; khoản thu lạ không được nhận. Thoát vào lại tiền vẫn đúng như máy chủ giữ.
- **App 🏆 Xếp hạng** (thay chỗ app Máy ảnh khi Online): thu nhập hôm nay / tuần, hãng nào nhiều đơn hơn.
- Các số chỉnh ở ?editor → ⚖️ Cân bằng → 🌐 Chơi online: tỉ lệ mời chung đơn, khoảng cách, đơn hết hạn.
- Lần đầu chạy máy chủ bản M2 đã xóa trắng tiền thử nghiệm của M1 (file cũ sao lưu ở server/data/city.truoc-kinh-te-2.json).

Chưa chặn được: mua đồ / xe vẫn tự trừ ở máy người chơi rồi báo lên (người cố ý sửa game có thể không báo khoản chi) — chặn hẳn phải để máy chủ
giữ cả túi đồ / xe (để sau). Bảng xếp hạng chỉ tính tiền đơn do máy chủ tính nên không gian lận được.
- Mọi người dùng chung một nhà trọ (cùng hầm xe).
