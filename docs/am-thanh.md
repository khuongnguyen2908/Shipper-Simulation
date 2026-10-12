# Danh sách âm thanh — Shipper Simulation

Mỗi chỗ trong game phát tiếng có **một mã riêng**. Gắn file cho mã ở `?editor` → thẻ **🔊 Âm thanh**
(tải file lên ngay trong đó khi chạy `npm run dev`; file được chép vào `src/sounds/`). Bấm **Lưu** là game dùng file mới.

- Đuôi file: `.ogg` (nên dùng), `.mp3`, `.wav`, `.m4a`. Mọi file được gói chung vào `dist/index.html` → nhạc nên nén nhẹ.
- Một mã gắn **nhiều file** → mỗi lần phát chọn ngẫu nhiên 1 file (vd 3–4 tiếng bước chân khác nhau). Nhạc nhiều bài → phát lần lượt.
- Tiếng **lặp liên tục** (máy xe, mưa, phố): chỉ dùng file đầu tiên, nên cắt sao cho nối vòng êm. Máy xe tự đổi cao độ theo tốc độ.
- Mã chưa gắn file: 🔉 = đang dùng tiếng tổng hợp có sẵn · 🔇 = đang im lặng.
- Âm lượng trong Cài đặt: **Nhạc** = các mã nhóm 🎵 Nhạc · **Hiệu ứng** = mọi mã còn lại. Mỗi mã còn có âm lượng riêng trong editor.
- Cột "Xong": tự đánh dấu `[x]` khi đã làm xong sound cho mã đó.

## 🎵 Nhạc

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [ ] | `music.menu` | Nhạc màn hình chính | Đang ở màn hình chính / tạo nhân vật | bài nhạc | 🔇 im |
| [ ] | `music.day` | Nhạc trong game (ban ngày) | Đang chơi, trời sáng | bài nhạc | 🔇 im |
| [ ] | `music.night` | Nhạc trong game (ban đêm) | Đang chơi, trời tối | bài nhạc | 🔇 im |

## 🖱️ Giao diện

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [ ] | `ui.click` | Bấm nút | Bấm nút trong menu, hộp thoại, điện thoại | tiếng ngắn | 🔇 im |
| [ ] | `ui.hover` | Rê chuột qua nút | Chuột đi qua nút menu / lựa chọn hộp thoại | tiếng ngắn | 🔇 im |
| [ ] | `ui.modal` | Mở hộp thoại | Hộp thoại / lời NPC hiện lên | tiếng ngắn | 🔇 im |
| [ ] | `ui.next` | Sang trang | Bấm "Tiếp ▸" trong lời thoại nhiều trang, chuyển trang giới thiệu | tiếng ngắn | 🔇 im |
| [ ] | `ui.sign` | Ký tên | Bắt đầu một nét ký trong popup hợp đồng | tiếng ngắn | 🔇 im |
| [ ] | `ui.tutorial` | Bước hướng dẫn | Hướng dẫn sang bước mới (chỗ sáng đổi vị trí) | tiếng ngắn | 🔇 im |
| [ ] | `ui.interact` | Tương tác (E) | Bấm E: vào quán, nói chuyện, lấy hàng… | tiếng ngắn | 🔉 tổng hợp |

## 📱 Điện thoại & chat

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [ ] | `phone.open` | Mở điện thoại | Bấm Tab mở điện thoại | tiếng ngắn | 🔇 im |
| [ ] | `phone.close` | Cất điện thoại | Bấm Tab cất điện thoại | tiếng ngắn | 🔇 im |
| [ ] | `phone.app` | Mở app | Bấm vào một app trên màn hình chính | tiếng ngắn | 🔇 im |
| [ ] | `phone.offer` | Có đơn mới | App báo có đơn | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `phone.accept` | Nhận đơn | Bấm nhận đơn (Y) | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `phone.decline` | Từ chối đơn | Bấm từ chối đơn (N) | tiếng ngắn | 🔇 im |
| [ ] | `phone.message` | Tin nhắn mới | Tin nhắn nhóm tài xế / Cô Hai / phường… | tiếng ngắn | 🔇 im |
| [ ] | `phone.call` | Gọi điện | Gọi khách, gọi quán, khách gọi xuống | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `chat.open` | Mở ô chat | Bấm Enter mở ô gõ tin | tiếng ngắn | 🔇 im |
| [ ] | `chat.send` | Gửi tin chat | Gửi tin, bong bóng hiện trên đầu mình | tiếng ngắn | 🔇 im |
| [ ] | `chat.bubble` | Người khác nói | Bong bóng thoại hiện trên đầu người đi đường / khách | tiếng ngắn | 🔇 im |

## 🛵 Lái xe & đi bộ

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [ ] | `loop.engine` | Máy xe (lặp) | Đang ngồi xe xăng / xe điện; cao độ theo tốc độ | lặp liên tục | 🔉 tổng hợp |
| [ ] | `drive.mount` | Lên xe | Leo lên xe (F) | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `drive.dismount` | Xuống xe | Xuống xe (F) | tiếng ngắn | 🔇 im |
| [ ] | `drive.horn` | Bóp còi | Bấm H khi đang chạy xe | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `drive.brake` | Phanh gấp | Bấm Space khi đang chạy nhanh | tiếng ngắn | 🔇 im |
| [ ] | `drive.bump` | Xóc / ổ gà | Xe sụp ổ gà, leo lề | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `drive.crash` | Đâm xe | Đâm vào ô tô, xe máy, tường | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `drive.hitPed` | Đâm người | Tông người đi đường | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `drive.hitDog` | Đâm chó | Tông chó | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `drive.noFuel` | Hết xăng / hết pin | Xe vừa cạn xăng / pin | tiếng ngắn | 🔇 im |
| [ ] | `drive.pedal` | Đạp xe đạp | Mỗi vòng đạp khi chạy xe đạp | tiếng ngắn | 🔇 im |
| [ ] | `walk.step` | Bước chân | Mỗi bước khi đi bộ / chạy | tiếng ngắn | 🔇 im |

## 📦 Giao hàng

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [ ] | `order.pickup` | Lấy hàng | Nhận món ở quán / lấy hàng ở shop | tiếng ngắn | 🔇 im |
| [ ] | `order.pack` | Xếp món vào túi | Thả một món vào ô trong túi (màn xếp túi) | tiếng ngắn | 🔇 im |
| [ ] | `order.boarded` | Khách lên xe | Khách xe ôm leo lên xe | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `order.done` | Giao xong | Giao thành công, hiện hóa đơn (3★ trở lên) | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `order.badStars` | Bị chấm sao thấp | Giao xong mà 1–2★ hoặc khách từ chối nhận | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `order.cancelled` | Đơn bị hủy | Đơn bị hủy (quán hết món, tự hủy…) | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `order.quit` | Khách đòi xuống | Khách xe ôm sợ quá đòi xuống giữa đường | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `order.vomit` | Khách ói | Khách say ói ra xe | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `order.bom` | Bị bom hàng | Khách không nhận, phải mang trả shop | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `order.returned` | Trả hàng về shop | Mang hàng bị bom về trả, được hoàn tiền | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `order.robbed` | Bị khách lừa / cướp | Khách lừa đảo lấy tiền | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `order.scamCaught` | Chở khách lừa đảo tới đồn | Giao khách lừa đảo cho công an, được thưởng | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `order.helmetLost` | Mất nón chở khách | Khách cầm nón đi / bị lấy khi đậu xe | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `quest.walletFound` | Nhặt được ví | Chở anh Minh xong thấy ví rơi trên xe | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `quest.walletKept` | Giữ tiền trong ví | Chọn lấy tiền trong ví | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `quest.walletReturned` | Trả ví | Trả ví cho anh Minh, được thưởng | tiếng ngắn | 🔉 tổng hợp |

## 🏙️ Thành phố

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [ ] | `loop.rain` | Mưa (lặp) | Đang mưa; mưa to thì to hơn | lặp liên tục | 🔉 tổng hợp |
| [ ] | `loop.city` | Tiếng phố mở đầu (lặp) | Màn đen "Đã tới Sài Gòn": kèn xe, xe cộ, người cãi nhau | lặp liên tục | 🔉 tổng hợp |
| [ ] | `city.honk` | Xe khác bóp còi | Xe NPC bóp còi khi mình chắn đường | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `city.dog` | Chó sủa | Chó lao ra đường sủa | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `city.thunder` | Sấm | Trời bắt đầu mưa | tiếng ngắn | 🔇 im |
| [ ] | `city.morning` | Sáng ngày mới | 6:00 sang ngày mới (gà gáy, chim hót…) | tiếng ngắn | 🔇 im |
| [ ] | `city.busArrive` | Xe buýt tới trạm | Đi xe buýt tới trạm, xuống xe | tiếng ngắn | 🔇 im |
| [ ] | `city.ferry` | Phà | Lên phà qua sông | tiếng ngắn | 🔇 im |

## 🏪 Địa điểm & hoạt động

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [ ] | `place.fuel` | Đổ xăng | Đổ xăng ở cây xăng | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.charge` | Sạc pin | Sạc xe điện ở trụ sạc | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.swap` | Đổi pin | Đổi pin ở trạm đổi pin | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.repair` | Sửa xe | Sửa xe ở tiệm sửa xe | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.oil` | Thay nhớt | Thay nhớt ở tiệm sửa xe | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.buy` | Mua đồ | Mua đồ dùng, túi, trang phục, đồ hãng | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.buyVehicle` | Mua xe | Mua xe mới ở tiệm xe | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.activity` | Làm hoạt động | Ăn, uống, lên chùa, xem phim… ở địa điểm | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.wear` | Thay đồ | Mặc / tháo đồ ở tủ đồ hoặc túi đồ | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.use` | Dùng đồ | Dùng đồ 1 lần trong túi đồ (nước, thuốc…) | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.nap` | Chợp mắt | Chợp mắt ở chỗ có ghế / võng | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.sleep` | Đi ngủ | Ngủ ở phòng trọ | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.joinBrand` | Vào hãng | Ký hợp đồng xong, nhận xe hãng | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.gotBike` | Được cho xe đạp | Cô Hai cho xe đạp lúc mở đầu | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `place.takeVehicle` | Lấy xe trong hầm | Lấy xe để dành trong hầm nhà trọ ra chạy | tiếng ngắn | 🔇 im |

## 🚓 Luật lệ & sự cố

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [ ] | `law.whistle` | CSGT thổi còi | Bị CSGT dừng xe | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `law.fine` | Bị phạt | CSGT phạt tiền / ghi phạt nguội | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `law.towed` | Bị giữ xe | CSGT giữ xe về đồn | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `law.parking` | Sự cố đậu xe | Xe đậu ngoài đường bị dán phạt / cẩu / trộm | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `law.airport` | Nhắc nhở sân bay | Dừng xe sai chỗ ở sân bay: nhắc / phạt | tiếng ngắn | 🔉 tổng hợp |

## 💰 Tiền & tiến trình

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [ ] | `money.pay` | Trả tiền | Trả tiền vé xe buýt, phà, chuộc xe, nộp phạt, ứng tiền hàng | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `money.earn` | Nhận tiền | Bán xe, được hoàn tiền | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `money.rentPaid` | Trả tiền nhà | Trả tiền nhà cho Cô Hai | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `money.rentLate` | Trễ hạn tiền nhà | Quá 22:00 hạn trả mà chưa trả đủ | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `progress.objective` | Xong mục tiêu | Một mục tiêu trong danh sách vừa xong | tiếng ngắn | 🔇 im |
| [ ] | `progress.collapse` | Ngất / suy sụp | Kiệt sức phải nằm nghỉ | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `progress.gameOver` | Thua | Bị đuổi khỏi phòng trọ / khóa tài khoản | tiếng ngắn | 🔉 tổng hợp |

## Thêm chỗ phát tiếng mới
Cần code: thêm mã vào `src/data/soundSpec.js` + gọi `sound('mã')` ở chỗ cần phát + thêm 1 dòng vào file này (bộ thử `npm test` sẽ nhắc nếu thiếu).
