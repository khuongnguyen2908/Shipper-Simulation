# Danh sách âm thanh — Shipper Simulation

Mỗi chỗ trong game phát tiếng có **một mã riêng**. Gắn file cho mã ở `?editor` → thẻ **🔊 Âm thanh**
(tải file lên ngay trong đó khi chạy `npm run dev`; file được chép vào `src/sounds/`). Bấm **Lưu** là game dùng file mới.
Mục **Kho tiếng** trong thẻ đó: ~530 tiếng mẫu Kenney (CC0) ở `sound-library/` — bấm ▶ Nghe / ■ Dừng để nghe thử, **+ Gắn** để dùng (chỉ file đã gắn mới vào game).

- Đuôi file: `.ogg` (nên dùng), `.mp3`, `.wav`, `.m4a`. **Mọi file trong `src/sounds/` (kể cả file chưa gắn) được gói vào `dist/index.html`**
  → thêm file xong chạy **`npm run nen-am-thanh`** (tự nén file nặng: nhạc dài 80–112 kbps, tiếng ngắn 64–96 kbps; cần ffmpeg).
  16/10: đã nén hết, âm thanh 8,9 MB → 3,9 MB, bản đăng 14,8 MB → 7,9 MB.
- Một mã gắn **nhiều file** → mỗi lần phát chọn ngẫu nhiên 1 file (vd 3–4 tiếng bước chân khác nhau). Nhạc nhiều bài → phát lần lượt.
- Tiếng **lặp liên tục** (máy xe, mưa, phố): chỉ dùng file đầu tiên, nên cắt sao cho nối vòng êm. Máy xe tự đổi cao độ theo tốc độ.
- 🎧 = đã gắn file (nghe thử trong editor) · Mã chưa gắn file: 🔉 = đang dùng tiếng tổng hợp có sẵn · 🔇 = đang im lặng.
- Âm lượng trong Cài đặt: **Nhạc** = các mã nhóm 🎵 Nhạc · **Hiệu ứng** = mọi mã còn lại. Mỗi mã còn có âm lượng riêng trong editor.
- Cột "Xong": tự đánh dấu `[x]` khi đã làm xong sound cho mã đó.

## 🎵 Nhạc

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [x] | `music.menu` | Nhạc màn hình chính | Đang ở màn hình chính / tạo nhân vật | bài nhạc | 🎧 có file |
| [x] | `music.day` | Nhạc trong game (ban ngày) | Đang chơi, trời sáng | bài nhạc | 🔇 im |
| [x] | `music.night` | Nhạc trong game (ban đêm) | Đang chơi, trời tối | bài nhạc | 🔇 im |
| [ ] | `music.chase` | Nhạc dí cướp | Chương 3: từ cảnh cướp tới qua cầu (bước có "Nhạc riêng"). Nên: nhịp nhanh 140–160 bpm, lặp liền, 1–2 phút, 96–128 kbps | bài nhạc | 🔇 im (chưa gắn → nhạc ngày / đêm) |

## 🖱️ Giao diện

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [x] | `ui.click` | Bấm nút | Bấm nút trong menu, hộp thoại, điện thoại | tiếng ngắn | 🎧 có file |
| [x] | `ui.hover` | Rê chuột qua nút | Chuột đi qua nút menu / lựa chọn hộp thoại | tiếng ngắn | 🎧 có file |
| [x] | `ui.modal` | Mở hộp thoại | Hộp thoại / lời NPC hiện lên | tiếng ngắn | 🎧 có file |
| [ ] | `ui.warn` | Cảnh báo | Bấm nút mà còn chỗ sai (vd Xếp xong lúc món nước còn nằm nghiêng) — hỏi lại 1 lần | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `ui.talk` | Chữ thoại hiện dần | Bong bóng thoại cốt truyện hiện từng chữ (cứ 2 chữ một tiếng ngắn, kiểu "lách cách") | tiếng ngắn | 🔉 tổng hợp |
| [x] | `ui.next` | Sang trang | Bấm "Tiếp ▸" trong lời thoại nhiều trang, chuyển trang giới thiệu | tiếng ngắn | 🎧 có file |
| [x] | `ui.sign` | Ký tên | Bắt đầu một nét ký trong popup hợp đồng | tiếng ngắn | 🎧 có file |
| [x] | `ui.tutorial` | Bước hướng dẫn | Hướng dẫn sang bước mới (chỗ sáng đổi vị trí) | tiếng ngắn | 🎧 có file |
| [x] | `ui.interact` | Tương tác (E) | Bấm E: vào quán, nói chuyện, lấy hàng… | tiếng ngắn | 🎧 có file |

## 📱 Điện thoại & chat

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [x] | `phone.open` | Mở điện thoại | Bấm Tab mở điện thoại | tiếng ngắn | 🎧 có file |
| [x] | `phone.close` | Cất điện thoại | Bấm Tab cất điện thoại | tiếng ngắn | 🎧 có file |
| [x] | `phone.app` | Mở app | Bấm vào một app trên màn hình chính | tiếng ngắn | 🎧 có file |
| [x] | `phone.offer` | Có đơn mới | App báo có đơn | tiếng ngắn | 🎧 có file |
| [x] | `phone.accept` | Nhận đơn | Bấm nhận đơn (Y) | tiếng ngắn | 🎧 có file |
| [x] | `phone.decline` | Từ chối đơn | Bấm từ chối đơn (N) | tiếng ngắn | 🎧 có file |
| [x] | `phone.message` | Tin nhắn mới | Tin nhắn nhóm tài xế / Cô Hai / phường… | tiếng ngắn | 🎧 có file |
| [x] | `phone.call` | Gọi điện | Gọi khách, gọi quán, khách gọi xuống | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `phone.swipe` | Lướt tin (Tích Tắc) | Lướt sang tin khác trong app Tích Tắc | tiếng ngắn | 🔇 im |
| [ ] | `phone.shutter` | Chụp ảnh (lưu game) | Bấm Chụp trong app Máy ảnh — lưu game vào 1 ô album | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `phone.like` | Thả tim (Tích Tắc) | Thả tim một tin trong app Tích Tắc (bấm đúp / nút ❤️) | tiếng ngắn | 🔉 tổng hợp |
| [x] | `chat.open` | Mở ô chat | Bấm Enter mở ô gõ tin | tiếng ngắn | 🎧 có file |
| [x] | `chat.send` | Gửi tin chat | Gửi tin, bong bóng hiện trên đầu mình | tiếng ngắn | 🎧 có file |
| [x] | `chat.bubble` | Người khác nói | Bong bóng thoại hiện trên đầu người đi đường / khách | tiếng ngắn | 🎧 có file |

## 🛵 Lái xe & đi bộ

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [x] | `loop.engine` | Máy xe (lặp) | Đang ngồi xe xăng / xe điện; cao độ theo tốc độ | lặp liên tục | 🔉 tổng hợp |
| [x] | `drive.mount` | Lên xe | Leo lên xe (F) | tiếng ngắn | 🔉 tổng hợp |
| [x] | `drive.dismount` | Xuống xe | Xuống xe (F) | tiếng ngắn | 🎧 có file |
| [x] | `drive.horn` | Bóp còi | Bấm H khi đang chạy xe | tiếng ngắn | 🔉 tổng hợp |
| [x] | `drive.brake` | Phanh gấp | Bấm Space khi đang chạy nhanh | tiếng ngắn | 🔇 im |
| [ ] | `drive.skid` | Rít lốp (drift / thắng gấp) | Cảnh phim chương 3: anh mô tô drift quẹo ở nhà thờ, thắng gấp xoay ngang chặn tên cướp | tiếng ngắn | 🔉 tạm dùng brake.mp3 |
| [x] | `drive.bump` | Xóc / ổ gà | Xe sụp ổ gà, leo lề | tiếng ngắn | 🎧 có file |
| [x] | `drive.crash` | Đâm xe | Đâm vào ô tô, xe máy, tường | tiếng ngắn | 🎧 có file |
| [x] | `drive.hitPed` | Đâm người | Tông người đi đường | tiếng ngắn | 🎧 có file |
| [x] | `drive.hitDog` | Đâm chó | Tông chó | tiếng ngắn | 🎧 có file |
| [x] | `drive.splash` | Lội nước ngập | Chạy xe vào đoạn đường ngập (nước bắn) | tiếng ngắn | 🔉 tổng hợp |
| [x] | `drive.stall` | Chết máy vì ngập | Chạy nhanh qua nước sâu, xe tắt máy | tiếng ngắn | 🔉 tổng hợp |
| [x] | `drive.noFuel` | Hết xăng / hết pin | Xe vừa cạn xăng / pin | tiếng ngắn | 🎧 có file |
| [x] | `drive.pedal` | Đạp xe đạp | Mỗi vòng đạp khi chạy xe đạp | tiếng ngắn | 🔇 im |
| [x] | `walk.step` | Bước chân | Mỗi bước khi đi bộ / chạy | tiếng ngắn | 🎧 có file |

## 📦 Giao hàng

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [x] | `order.pickup` | Lấy hàng | Nhận món ở quán / lấy hàng ở shop | tiếng ngắn | 🎧 có file |
| [x] | `order.pack` | Xếp món vào túi | Thả một món vào ô trong túi (màn xếp túi) | tiếng ngắn | 🎧 có file |
| [x] | `order.boarded` | Khách lên xe | Khách xe ôm leo lên xe | tiếng ngắn | 🔉 tổng hợp |
| [x] | `order.done` | Giao xong | Giao thành công, hiện hóa đơn (3★ trở lên) | tiếng ngắn | 🔉 tổng hợp |
| [x] | `order.badStars` | Bị chấm sao thấp | Giao xong mà 1–2★ hoặc khách từ chối nhận | tiếng ngắn | 🎧 có file |
| [x] | `order.cancelled` | Đơn bị hủy | Đơn bị hủy (quán hết món, tự hủy…) | tiếng ngắn | 🎧 có file |
| [x] | `order.quit` | Khách đòi xuống | Khách xe ôm sợ quá đòi xuống giữa đường | tiếng ngắn | 🔉 tổng hợp |
| [x] | `order.vomit` | Khách ói | Khách say ói ra xe | tiếng ngắn | 🔉 tổng hợp |
| [x] | `order.bom` | Bị bom hàng | Khách không nhận, phải mang trả shop | tiếng ngắn | 🔉 tổng hợp |
| [x] | `order.returned` | Trả hàng về shop | Mang hàng bị bom về trả, được hoàn tiền | tiếng ngắn | 🔉 tổng hợp |
| [x] | `order.robbed` | Bị khách lừa / cướp | Khách lừa đảo lấy tiền | tiếng ngắn | 🔉 tổng hợp |
| [x] | `order.scamCaught` | Chở khách lừa đảo tới đồn | Giao khách lừa đảo cho công an, được thưởng | tiếng ngắn | 🔉 tổng hợp |
| [x] | `order.helmetLost` | Mất nón chở khách | Khách cầm nón đi / bị lấy khi đậu xe | tiếng ngắn | 🔉 tổng hợp |
| [x] | `quest.walletFound` | Nhặt được ví | Chở anh Minh xong thấy ví rơi trên xe | tiếng ngắn | 🔉 tổng hợp |
| [x] | `quest.walletKept` | Giữ tiền trong ví | Chọn lấy tiền trong ví | tiếng ngắn | 🔉 tổng hợp |
| [x] | `quest.walletReturned` | Trả ví | Trả ví cho anh Minh, được thưởng | tiếng ngắn | 🔉 tổng hợp |

## 🏙️ Thành phố

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [x] | `loop.rain` | Mưa (lặp) | Đang mưa; mưa to thì to hơn | lặp liên tục | 🔉 tổng hợp |
| [x] | `loop.city` | Tiếng phố mở đầu (lặp) | Màn đen "Đã tới Sài Gòn": kèn xe, xe cộ, người cãi nhau | lặp liên tục | 🔉 tổng hợp |
| [x] | `city.honk` | Xe khác bóp còi | Xe NPC bóp còi khi mình chắn đường | tiếng ngắn | 🔉 tổng hợp |
| [x] | `city.dog` | Chó sủa | Chó lao ra đường sủa · chó sủa xe trộm chó | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `city.rev` | Nẹt pô | Nhóm Jetjet chạy ngang mình · xe trộm chó rồ ga bỏ chạy · tên cướp bốc đầu xe bỏ chạy (chương 3) | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `city.motoPass` | Mô tô gầm tới sau lưng rồi vụt qua | Cảnh phim chương 3: anh mô tô chạy tới cách người chơi ~20 đơn vị (sắp vượt mặt) thì phát — pô gầm to dần rồi vụt qua (~2–3 giây) | tiếng ngắn | 🔉 tạm dùng file pass-by của city.rev |
| [ ] | `city.truckHorn` | Còi hơi xe tải | Cảnh phim chương 3: xe tải container lao ra ngã tư chặn đầu | tiếng ngắn | 🔉 tạm dùng horn-2.mp3 |
| [ ] | `city.bikeFall` | Xe té, trượt trên đường | Cảnh phim chương 3: tên cướp tránh chó không kịp, xe đổ trượt dài | tiếng ngắn | 🔉 tạm dùng impactmetal |
| [x] | `city.thiefCrash` | Tên cướp đâm chó té xe | Cảnh phim chương 3, khúc cuối: đâm con chó, xe đổ trượt dài. File dài có tiếng trượt phía trước thì game tự phát sớm cho tiếng "rầm" trùng lúc đổ | tiếng ngắn | am_thanh_te_xe |
| [x] | `city.thiefDog` | Con chó bị xe tên cướp đâm | Cảnh phim chương 3, khúc cuối: kêu / sủa đúng lúc bị đâm | tiếng ngắn | yodguard dog bark |
| [ ] | `city.qte` | Nút bấm nhanh hiện ra | Chương 3: hiện nút "E — Chặn lại!" lúc tên cướp lao tới — tiếng báo gấp, ngắn | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `city.tackle` | Vật ngã | Chương 3: anh Đạt quật tên cướp xuống đường (bịch, sột soạt quần áo) | tiếng ngắn | 🔉 tổng hợp |
| [ ] | `city.siren` | Còi hú xe công an | Chương 3: xe công an chạy tới áp giải tên cướp (hú vài giây, nghe từ xa tới gần) | tiếng ngắn | 🔉 tổng hợp (tạm) |
| [ ] | `loop.motoChase` | Máy xe anh mô tô (cảnh phim) | Tiếng lặp: sport bike anh mô tô lúc dí cướp — to nhỏ theo khoảng cách tới camera, cao độ theo tốc độ | tiếng lặp | 🔉 tạm dùng file máy xe chakong |
| [ ] | `city.thiefShout` | La "Cướp!" | Chương 3: người trong chợ la lên "Cướp cướp!" | tiếng ngắn | 🔇 im |
| [x] | `city.thunder` | Sấm | Trời bắt đầu mưa | tiếng ngắn | 🔇 im |
| [x] | `city.morning` | Sáng ngày mới | 6:00 sang ngày mới (gà gáy, chim hót…) | tiếng ngắn | 🔇 im |
| [x] | `city.busArrive` | Xe buýt tới trạm | Đi xe buýt tới trạm, xuống xe | tiếng ngắn | 🔇 im |
| [x] | `city.ferry` | Phà | Lên phà qua sông | tiếng ngắn | 🔇 im |

## 🏪 Địa điểm & hoạt động

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [x] | `place.fuel` | Đổ xăng | Đổ xăng ở cây xăng | tiếng ngắn | 🔉 tổng hợp |
| [x] | `place.charge` | Sạc pin | Sạc xe điện ở trụ sạc | tiếng ngắn | 🔉 tổng hợp |
| [x] | `place.swap` | Đổi pin | Đổi pin ở trạm đổi pin | tiếng ngắn | 🔉 tổng hợp |
| [x] | `place.repair` | Sửa xe | Sửa xe ở tiệm sửa xe | tiếng ngắn | 🎧 có file |
| [x] | `place.oil` | Thay nhớt | Thay nhớt ở tiệm sửa xe | tiếng ngắn | 🔉 tổng hợp |
| [x] | `place.buy` | Mua đồ | Mua đồ dùng, túi, trang phục, đồ hãng | tiếng ngắn | 🎧 có file |
| [x] | `place.buyVehicle` | Mua xe | Mua xe mới ở tiệm xe | tiếng ngắn | 🔉 tổng hợp |
| [x] | `place.activity` | Làm hoạt động | Ăn, uống, lên chùa, xem phim… ở địa điểm | tiếng ngắn | 🔉 tổng hợp |
| [x] | `place.wear` | Thay đồ | Mặc / tháo đồ ở tủ đồ hoặc túi đồ | tiếng ngắn | 🎧 có file |
| [x] | `place.use` | Dùng đồ | Dùng đồ 1 lần trong túi đồ (nước, thuốc…) | tiếng ngắn | 🔉 tổng hợp |
| [x] | `place.nap` | Chợp mắt | Chợp mắt ở chỗ có ghế / võng | tiếng ngắn | 🔉 tổng hợp |
| [x] | `place.sleep` | Đi ngủ | Ngủ ở phòng trọ | tiếng ngắn | 🔉 tổng hợp |
| [x] | `place.joinBrand` | Vào hãng | Ký hợp đồng xong, nhận xe hãng | tiếng ngắn | 🔉 tổng hợp |
| [x] | `place.gotBike` | Được cho xe đạp | Cô Hai cho xe đạp lúc mở đầu | tiếng ngắn | 🔉 tổng hợp |
| [x] | `place.takeVehicle` | Lấy xe trong hầm | Lấy xe để dành trong hầm nhà trọ ra chạy | tiếng ngắn | 🎧 có file |

## 🚓 Luật lệ & sự cố

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [x] | `law.whistle` | CSGT thổi còi | Bị CSGT dừng xe | tiếng ngắn | 🔉 tổng hợp |
| [x] | `law.fine` | Bị phạt | CSGT phạt tiền / ghi phạt nguội | tiếng ngắn | 🔉 tổng hợp |
| [x] | `law.towed` | Bị giữ xe | CSGT giữ xe về đồn | tiếng ngắn | 🔉 tổng hợp |
| [x] | `law.parking` | Sự cố đậu xe | Xe đậu ngoài đường bị dán phạt / cẩu / trộm | tiếng ngắn | 🔉 tổng hợp |
| [x] | `law.airport` | Nhắc nhở sân bay | Dừng xe sai chỗ ở sân bay: nhắc / phạt | tiếng ngắn | 🔉 tổng hợp |

## 💰 Tiền & tiến trình

| Xong | Mã | Tên | Phát khi | Loại | Hiện tại |
|---|---|---|---|---|---|
| [x] | `money.pay` | Trả tiền | Trả tiền vé xe buýt, phà, chuộc xe, nộp phạt, ứng tiền hàng | tiếng ngắn | 🎧 có file |
| [x] | `money.earn` | Nhận tiền | Bán xe, được hoàn tiền | tiếng ngắn | 🎧 có file |
| [x] | `money.rentPaid` | Trả tiền nhà | Trả tiền nhà cho Cô Hai | tiếng ngắn | 🎧 có file |
| [x] | `money.rentLate` | Trễ hạn tiền nhà | Quá 22:00 hạn trả mà chưa trả đủ | tiếng ngắn | 🔉 tổng hợp |
| [x] | `progress.objective` | Xong mục tiêu | Một mục tiêu trong danh sách vừa xong | tiếng ngắn | 🎧 có file |
| [x] | `progress.collapse` | Ngất / suy sụp | Kiệt sức phải nằm nghỉ | tiếng ngắn | 🎧 có file |
| [x] | `progress.gameOver` | Thua | Bị đuổi khỏi phòng trọ / khóa tài khoản | tiếng ngắn | 🔉 tổng hợp |

## Thêm chỗ phát tiếng mới
Cần code: thêm mã vào `src/data/soundSpec.js` + gọi `sound('mã')` ở chỗ cần phát + thêm 1 dòng vào file này (bộ thử `npm test` sẽ nhắc nếu thiếu).
