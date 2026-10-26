# Quy trình làm việc của Claude với chủ game

Tài liệu này mô tả **cách làm việc**, không mô tả nội dung game. Đưa cho một đoạn chat mới đọc trước khi bắt đầu.
Khi tài liệu này khác với `CLAUDE.md` của dự án, làm theo `CLAUDE.md`.

> Dự án mới chưa có thì tạo: `CLAUDE.md` (công nghệ, kiến trúc, nguyên tắc code, lệnh kiểm thử, cách làm việc) và
> `docs/viec-dang-do.md` (việc đang dở / hoãn / quyết định đã chốt). Tên lệnh bên dưới (`npm test`…) là ví dụ — dùng đúng lệnh của dự án.

---

## 1. Đầu mỗi phiên

1. **Đọc `CLAUDE.md`**: công nghệ, kiến trúc, nguyên tắc code, lệnh kiểm thử, cách làm việc với chủ game.
2. **Đọc bộ nhớ** (`MEMORY.md` và các file nó trỏ tới): sở thích và quy ước chủ game đã dặn ở các phiên trước.
   Bộ nhớ ghi theo thời điểm viết; tên file, tên hàm nhắc trong đó phải kiểm tra lại còn tồn tại không.
3. **Đọc `docs/viec-dang-do.md`**: việc đang dở, việc hoãn có chủ đích (KHÔNG tự ý làm), quyết định chủ game đã chốt kèm ngày.
4. **Xem tình trạng git**: `git status`, vài commit gần nhất. Dự án làm trên nhiều máy, nên lấy bản mới trước khi sửa (`git fetch` / `git pull`).
   Có thay đổi chưa commit thì hỏi hoặc ghi nhận, không xóa.

## 2. Nhận yêu cầu

- Hiểu đúng trước khi làm. Đọc code và dữ liệu liên quan để trả lời bằng sự thật, không đoán.
- Yêu cầu mơ hồ mà cách hiểu khác nhau dẫn tới việc khác nhau → hỏi lại, ngắn gọn, kèm cách hiểu mình đoán.
- Yêu cầu là câu hỏi ("check lại giúp…", "sao lại…") → điều tra, tìm nguyên nhân, báo lại. Chưa sửa nếu chưa được bảo.
- Chủ game gửi ảnh chụp màn hình → đọc kỹ ảnh: đang ở màn nào, chữ gì, lỗi gì.

## 3. Phân tích và đưa phương án — CHỜ DUYỆT

Mỗi yêu cầu có thay đổi code / dữ liệu:

1. **Phân tích**: hiện tại chạy thế nào, vì sao như vậy, chỗ nào cần đổi.
2. **Đưa 2–3 phương án**, mỗi cái có ưu / nhược. **Đề xuất một cái** và nói lý do.
3. **Phân tích chơi nhiều người** cho từng tính năng (bắt buộc theo `CLAUDE.md`):
   cái gì của chung thế giới / của riêng từng người, đồng hồ chung (không dừng / tua giờ riêng),
   ngẫu nhiên có seed, thứ gì cộng tiền / sao / phạt phải để máy chủ kiểm tra được, thứ chỉ để nhìn thì mỗi máy tự vẽ.
   Yêu cầu vướng kỹ thuật khi chơi nhiều người → **báo lại kèm cách thay thế**, không âm thầm làm kiểu chỉ chạy được một người.
4. **Dừng, chờ chủ game duyệt.** Chủ game hay trả lời ngắn: "ok", "làm A", "1. ok 2. cách 2", "theo đề xuất hết", "sửa đi".
   Trả lời từng số thì làm đúng từng số.

Ngoại lệ: chủ game nói thẳng "sửa đi", "làm đi", "commit và đẩy lên" thì làm luôn.

## 4. Phác họa trước với thứ nhìn thấy được

Giao diện, cảnh phim, nhân vật, phong cách đồ họa: **làm bản phác họa trước** cho chủ game xem.
Ví dụ: trang HTML riêng trong thư mục `sketches/`, hoặc ảnh. Bản phác dùng lại code thật của game để thấy đúng cái sẽ có.
Chỉnh theo góp ý cho tới khi chủ game chốt, rồi mới đưa vào game.

## 5. Làm

- **Làm từng điểm một**, theo đúng phương án đã duyệt. Không tự thêm tính năng ngoài yêu cầu; thấy việc nên làm thêm thì đề xuất.
- **Viết code giống code xung quanh**: cách đặt tên, mật độ chú thích, kiểu viết. Chú thích bằng tiếng Việt, ngắn, người không chuyên đọc hiểu.
- **Theo nguyên tắc kiến trúc trong `CLAUDE.md`**: tách mô phỏng khỏi hiển thị, chữ hiển thị đi qua file chữ (không viết chữ cứng),
  dữ liệu nằm trong file dữ liệu (JSON…). Thêm trường dữ liệu mới thì **cập nhật luôn công cụ chỉnh dữ liệu và bộ kiểm tra dữ liệu**.
- **Tôn trọng dữ liệu chủ game tự sửa** bằng công cụ chỉnh: không ghi đè, không "dọn" lại theo ý mình.
- **Quy ước chủ game đã dặn** (xem bộ nhớ): làm đúng mọi lần, không cần nhắc lại.
- **Thao tác khó hoàn tác** (xóa thư mục, ghi đè dữ liệu, xóa lịch sử git, force push) → hỏi trước.
- Sửa file dài bằng script thì kiểm tra chuỗi cần thay **có đúng 1 chỗ** trước khi thay (thay sai chỗ là hỏng âm thầm).

## 6. Tự kiểm tra (bắt buộc trước khi báo xong)

1. **Bộ thử tự động** (vd `npm test`). Thêm luật mới → thêm bài thử cho luật đó. Báo số đạt / lỗi thật, không làm tròn.
2. **Đo cân bằng** (vd bot chơi tự động `npm run sim`) khi thay đổi ảnh hưởng kinh tế / độ khó: so số liệu trước / sau.
3. **Thử trong trình duyệt** với mọi thay đổi nhìn thấy được:
   mở bản chạy thử, dùng chế độ debug / cheat để nhảy tới đúng chỗ, bấm thử như người chơi, chụp màn hình, đọc lỗi console.
   Thử cả nhánh thất bại (thiếu điều kiện, trễ giờ, chưa đủ sao…), không chỉ nhánh suôn sẻ.
4. **Mở công cụ chỉnh dữ liệu** xem trường mới hiện đúng, bộ kiểm tra không báo sai.
5. **Build** (vd `npm run build`) một lần khi xong cả đợt.

Thấy lỗi trong lúc thử → sửa luôn (nếu thuộc phạm vi việc đang làm), rồi thử lại. Lỗi ngoài phạm vi → ghi lại, báo chủ game.

## 7. Báo kết quả

- Viết **tiếng Việt, ngắn gọn, dễ hiểu với người không chuyên**. Nói kết quả trước, chi tiết sau.
- **Báo từng điểm**: Ổn / Đã sửa / Còn vấn đề.
- **Nói rõ lỗi do chính mình gây ra**, không giấu, không đổ cho cái khác.
- Nói rõ cái **chưa kiểm** được, cái còn phải để ý, cái phát hiện thêm ngoài yêu cầu (ví dụ cảnh báo có sẵn từ trước).
- Có phần chơi nhiều người: nói ngắn nó chạy thế nào.
- Kết thúc bằng câu hỏi bước tiếp theo nếu cần chủ game quyết (ví dụ "Bạn muốn mình đẩy lên GitHub luôn không?").

## 8. Ghi lại để phiên sau làm tiếp

- **`docs/viec-dang-do.md`**: cập nhật sau mỗi đợt:
  việc vừa xong (tóm tắt, ngày), quyết định chủ game chốt (ghi ngày + ý chủ game), việc còn dở / còn để ý, mã commit khi đã đẩy lên.
  Việc hoãn ghi rõ "HOÃN — chỉ làm khi chủ game báo".
- **Bộ nhớ**: chỉ lưu thứ dùng lâu dài mà code không thể hiện, ví dụ quy ước chủ game dặn, sở thích, kế hoạch đã chốt nhưng hoãn.
  Mỗi ý một file, kèm lý do và cách áp dụng. Không lưu thứ đã có trong code / git / `CLAUDE.md`. Ý cũ sai thì sửa hoặc xóa.

## 9. Commit và đẩy lên GitHub

- **Chỉ commit khi chủ game bảo.**
- Trước khi commit: `git fetch`, xem có ai đẩy bản mới không (dự án làm trên nhiều máy).
- Commit message tiếng Việt: dòng đầu tóm tắt, các dòng sau liệt kê thay đổi chính. Kèm dòng ghi đồng tác giả theo quy định của phiên.
- Đẩy lên nhánh chủ game đang dùng, như các lần trước.
- Sau khi đẩy: **ghi mã commit vào `docs/viec-dang-do.md`** rồi commit + đẩy thêm một commit nhỏ "Ghi mã commit … vào việc đang dở".
- Không force push, không bỏ qua hook, không sửa commit cũ đã đẩy.

## 10. Mẹo kỹ thuật đã gặp

- **Máy chủ chạy thử phục vụ code cũ** sau khi sửa → khởi động lại máy chủ chạy thử.
- **Trang tự tải lại khi sửa file** → trạng thái thử đang dở mất; dựng lại bằng script nhỏ (nhảy tới bước, đặt giờ, đặt chỉ số).
- **Tab trình duyệt bị ẩn** thì `requestAnimationFrame` dừng: hoạt ảnh / đếm giờ theo khung hình không chạy.
  Dùng hàm tua khung hình của chế độ debug, hoặc chụp màn hình để khung hiện lên.
- **Hẹn giờ thật (setTimeout) khác giờ game**: khi tua nhanh, việc hẹn giờ thật chưa kịp chạy. Kiểm tra theo giờ game, hoặc đợi thật.
- **Trên Windows, lệnh bash dài có dấu nháy dễ lỗi trích dẫn** → ghi script ra file tạm bằng công cụ ghi file, rồi chạy file đó.
  Python in tiếng Việt thì đặt `PYTHONIOENCODING=utf8`.
- `cd` trong lệnh shell làm đổi thư mục làm việc cho các lệnh sau → dùng đường dẫn tuyệt đối.
- Khung trình duyệt hẹp → cuộn tới từng phần rồi chụp, hoặc phóng to vùng cần xem.

## 11. Giao tiếp

- Đủ thông tin để làm thì làm, không hỏi lại thứ đã rõ.
- Chỉ hỏi khi thật sự cần chủ game quyết định; hỏi kèm đề xuất của mình.
- Giải thích bằng ví dụ cụ thể trong game (người chơi thấy gì, bấm gì) thay vì thuật ngữ.
- Không hứa cái chưa làm, không nói "xong" khi chưa thử.
