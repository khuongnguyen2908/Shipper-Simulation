// =============================================================
// DANH MỤC ÂM THANH — mỗi chỗ trong game phát tiếng có một MÃ riêng (code gọi sound('mã')).
// File âm thanh gắn cho từng mã nằm ở src/data/sounds.json (sửa ở thẻ 🔊 Âm thanh của ?editor),
// file đặt trong thư mục src/sounds/. Mã chưa gắn file → phát tiếng tổng hợp (synth) nếu có, không thì im.
//  kind: 'sfx' (tiếng ngắn) · 'loop' (tiếng lặp liên tục: máy xe, mưa, phố) · 'music' (bài nhạc, có thể nhiều bài)
//  Nhóm âm lượng trong Cài đặt: music = Nhạc · mọi thứ khác = Hiệu ứng
// Thêm mã mới = thêm vào đây + gọi sound('mã') ở chỗ cần + ghi vào docs/am-thanh.md
// =============================================================
export const SOUND_CATS = {
  music: '🎵 Nhạc',
  ui: '🖱️ Giao diện',
  phone: '📱 Điện thoại & chat',
  drive: '🛵 Lái xe & đi bộ',
  order: '📦 Giao hàng',
  city: '🏙️ Thành phố',
  place: '🏪 Địa điểm & hoạt động',
  law: '🚓 Luật lệ & sự cố',
  money: '💰 Tiền & tiến trình',
};

// [mã, nhóm, tên, phát khi nào, tiếng tổng hợp dự phòng (tên trong audio.js SYNTH) | '', kind]
const LIST = [
  // ---- nhạc ----
  ['music.menu', 'music', 'Nhạc màn hình chính', 'Đang ở màn hình chính / tạo nhân vật', '', 'music'],
  ['music.day', 'music', 'Nhạc trong game (ban ngày)', 'Đang chơi, trời sáng', '', 'music'],
  ['music.night', 'music', 'Nhạc trong game (ban đêm)', 'Đang chơi, trời tối', '', 'music'],
  // ---- giao diện ----
  ['ui.click', 'ui', 'Bấm nút', 'Bấm nút trong menu, hộp thoại, điện thoại', '', 'sfx'],
  ['ui.hover', 'ui', 'Rê chuột qua nút', 'Chuột đi qua nút menu / lựa chọn hộp thoại', '', 'sfx'],
  ['ui.modal', 'ui', 'Mở hộp thoại', 'Hộp thoại / lời NPC hiện lên', '', 'sfx'],
  ['ui.warn', 'ui', 'Cảnh báo', 'Bấm nút mà còn chỗ sai (vd Xếp xong lúc món nước còn nằm nghiêng) — hỏi lại 1 lần', 'bad', 'sfx'],
  ['ui.talk', 'ui', 'Chữ thoại hiện dần', 'Bong bóng thoại cốt truyện hiện từng chữ (cứ 2 chữ một tiếng ngắn, kiểu "lách cách")', 'talk', 'sfx'],
  ['ui.next', 'ui', 'Sang trang', 'Bấm "Tiếp ▸" trong lời thoại nhiều trang, chuyển trang giới thiệu', '', 'sfx'],
  ['ui.sign', 'ui', 'Ký tên', 'Bắt đầu một nét ký trong popup hợp đồng', '', 'sfx'],
  ['ui.tutorial', 'ui', 'Bước hướng dẫn', 'Hướng dẫn sang bước mới (chỗ sáng đổi vị trí)', '', 'sfx'],
  ['ui.interact', 'ui', 'Tương tác (E)', 'Bấm E: vào quán, nói chuyện, lấy hàng…', 'click', 'sfx'],
  // ---- điện thoại & chat ----
  ['phone.open', 'phone', 'Mở điện thoại', 'Bấm Tab mở điện thoại', '', 'sfx'],
  ['phone.close', 'phone', 'Cất điện thoại', 'Bấm Tab cất điện thoại', '', 'sfx'],
  ['phone.app', 'phone', 'Mở app', 'Bấm vào một app trên màn hình chính', '', 'sfx'],
  ['phone.offer', 'phone', 'Có đơn mới', 'App báo có đơn', 'ping', 'sfx'],
  ['phone.accept', 'phone', 'Nhận đơn', 'Bấm nhận đơn (Y)', 'click', 'sfx'],
  ['phone.decline', 'phone', 'Từ chối đơn', 'Bấm từ chối đơn (N)', '', 'sfx'],
  ['phone.message', 'phone', 'Tin nhắn mới', 'Tin nhắn nhóm tài xế / Cô Hai / phường…', '', 'sfx'],
  ['phone.call', 'phone', 'Gọi điện', 'Gọi khách, gọi quán, khách gọi xuống', 'phone', 'sfx'],
  ['phone.swipe', 'phone', 'Lướt tin (Tích Tắc)', 'Lướt sang tin khác trong app Tích Tắc', '', 'sfx'],
  ['phone.shutter', 'phone', 'Chụp ảnh (lưu game)', 'Bấm Chụp trong app Máy ảnh — lưu game vào 1 ô album', 'click', 'sfx'],
  ['phone.like', 'phone', 'Thả tim (Tích Tắc)', 'Thả tim một tin trong app Tích Tắc (bấm đúp / nút ❤️)', 'ping', 'sfx'],
  ['chat.open', 'phone', 'Mở ô chat', 'Bấm Enter mở ô gõ tin', '', 'sfx'],
  ['chat.send', 'phone', 'Gửi tin chat', 'Gửi tin, bong bóng hiện trên đầu mình', '', 'sfx'],
  ['chat.bubble', 'phone', 'Người khác nói', 'Bong bóng thoại hiện trên đầu người đi đường / khách', '', 'sfx'],
  // ---- lái xe & đi bộ ----
  ['loop.engine', 'drive', 'Máy xe (lặp)', 'Đang ngồi xe xăng / xe điện; cao độ theo tốc độ', 'engine', 'loop'],
  ['drive.mount', 'drive', 'Lên xe', 'Leo lên xe (F)', 'click', 'sfx'],
  ['drive.dismount', 'drive', 'Xuống xe', 'Xuống xe (F)', '', 'sfx'],
  ['drive.horn', 'drive', 'Bóp còi', 'Bấm H khi đang chạy xe', 'horn', 'sfx'],
  ['drive.brake', 'drive', 'Phanh gấp', 'Bấm Space khi đang chạy nhanh', '', 'sfx'],
  ['drive.bump', 'drive', 'Xóc / ổ gà', 'Xe sụp ổ gà, leo lề', 'bump', 'sfx'],
  ['drive.crash', 'drive', 'Đâm xe', 'Đâm vào ô tô, xe máy, tường', 'crash', 'sfx'],
  ['drive.hitPed', 'drive', 'Đâm người', 'Tông người đi đường', 'crash', 'sfx'],
  ['drive.hitDog', 'drive', 'Đâm chó', 'Tông chó', 'bark', 'sfx'],
  ['drive.splash', 'drive', 'Lội nước ngập', 'Chạy xe vào đoạn đường ngập (nước bắn)', 'splash', 'sfx'],
  ['drive.stall', 'drive', 'Chết máy vì ngập', 'Chạy nhanh qua nước sâu, xe tắt máy', 'stall', 'sfx'],
  ['drive.noFuel', 'drive', 'Hết xăng / hết pin', 'Xe vừa cạn xăng / pin', '', 'sfx'],
  ['drive.pedal', 'drive', 'Đạp xe đạp', 'Mỗi vòng đạp khi chạy xe đạp', '', 'sfx'],
  ['walk.step', 'drive', 'Bước chân', 'Mỗi bước khi đi bộ / chạy', '', 'sfx'],
  // ---- giao hàng ----
  ['order.pickup', 'order', 'Lấy hàng', 'Nhận món ở quán / lấy hàng ở shop', '', 'sfx'],
  ['order.pack', 'order', 'Xếp món vào túi', 'Thả một món vào ô trong túi (màn xếp túi)', '', 'sfx'],
  ['order.boarded', 'order', 'Khách lên xe', 'Khách xe ôm leo lên xe', 'click', 'sfx'],
  ['order.done', 'order', 'Giao xong', 'Giao thành công, hiện hóa đơn (3★ trở lên)', 'cash', 'sfx'],
  ['order.badStars', 'order', 'Bị chấm sao thấp', 'Giao xong mà 1–2★ hoặc khách từ chối nhận', 'bad', 'sfx'],
  ['order.cancelled', 'order', 'Đơn bị hủy', 'Đơn bị hủy (quán hết món, tự hủy…)', 'bad', 'sfx'],
  ['order.quit', 'order', 'Khách đòi xuống', 'Khách xe ôm sợ quá đòi xuống giữa đường', 'bad', 'sfx'],
  ['order.vomit', 'order', 'Khách ói', 'Khách say ói ra xe', 'bad', 'sfx'],
  ['order.bom', 'order', 'Bị bom hàng', 'Khách không nhận, phải mang trả shop', 'bad', 'sfx'],
  ['order.returned', 'order', 'Trả hàng về shop', 'Mang hàng bị bom về trả, được hoàn tiền', 'cash', 'sfx'],
  ['order.robbed', 'order', 'Bị khách lừa / cướp', 'Khách lừa đảo lấy tiền', 'bad', 'sfx'],
  ['order.scamCaught', 'order', 'Chở khách lừa đảo tới đồn', 'Giao khách lừa đảo cho công an, được thưởng', 'win', 'sfx'],
  ['order.helmetLost', 'order', 'Mất nón chở khách', 'Khách cầm nón đi / bị lấy khi đậu xe', 'bad', 'sfx'],
  ['quest.walletFound', 'order', 'Nhặt được ví', 'Chở anh Minh xong thấy ví rơi trên xe', 'ping', 'sfx'],
  ['quest.walletKept', 'order', 'Giữ tiền trong ví', 'Chọn lấy tiền trong ví', 'bad', 'sfx'],
  ['quest.walletReturned', 'order', 'Trả ví', 'Trả ví cho anh Minh, được thưởng', 'win', 'sfx'],
  // ---- thành phố ----
  ['loop.rain', 'city', 'Mưa (lặp)', 'Đang mưa; mưa to thì to hơn', 'rain', 'loop'],
  ['loop.city', 'city', 'Tiếng phố mở đầu (lặp)', 'Màn đen "Đã tới Sài Gòn": kèn xe, xe cộ, người cãi nhau', 'city', 'loop'],
  ['city.honk', 'city', 'Xe khác bóp còi', 'Xe NPC bóp còi khi mình chắn đường', 'horn', 'sfx'],
  ['city.dog', 'city', 'Chó sủa', 'Chó lao ra đường sủa · chó sủa xe trộm chó', 'bark', 'sfx'],
  ['city.rev', 'city', 'Nẹt pô', 'Nhóm Jetjet chạy ngang mình · xe trộm chó rồ ga bỏ chạy', 'rev', 'sfx'],
  ['city.thunder', 'city', 'Sấm', 'Trời bắt đầu mưa', '', 'sfx'],
  ['city.morning', 'city', 'Sáng ngày mới', '6:00 sang ngày mới (gà gáy, chim hót…)', '', 'sfx'],
  ['city.busArrive', 'city', 'Xe buýt tới trạm', 'Đi xe buýt tới trạm, xuống xe', '', 'sfx'],
  ['city.ferry', 'city', 'Phà', 'Lên phà qua sông', '', 'sfx'],
  // ---- địa điểm & hoạt động ----
  ['place.fuel', 'place', 'Đổ xăng', 'Đổ xăng ở cây xăng', 'cash', 'sfx'],
  ['place.charge', 'place', 'Sạc pin', 'Sạc xe điện ở trụ sạc', 'cash', 'sfx'],
  ['place.swap', 'place', 'Đổi pin', 'Đổi pin ở trạm đổi pin', 'cash', 'sfx'],
  ['place.repair', 'place', 'Sửa xe', 'Sửa xe ở tiệm sửa xe', 'cash', 'sfx'],
  ['place.oil', 'place', 'Thay nhớt', 'Thay nhớt ở tiệm sửa xe', 'cash', 'sfx'],
  ['place.buy', 'place', 'Mua đồ', 'Mua đồ dùng, túi, trang phục, đồ hãng', 'cash', 'sfx'],
  ['place.buyVehicle', 'place', 'Mua xe', 'Mua xe mới ở tiệm xe', 'win', 'sfx'],
  ['place.activity', 'place', 'Làm hoạt động', 'Ăn, uống, lên chùa, xem phim… ở địa điểm', 'cash', 'sfx'],
  ['place.wear', 'place', 'Thay đồ', 'Mặc / tháo đồ ở tủ đồ hoặc túi đồ', 'click', 'sfx'],
  ['place.use', 'place', 'Dùng đồ', 'Dùng đồ 1 lần trong túi đồ (nước, thuốc…)', 'click', 'sfx'],
  ['place.nap', 'place', 'Chợp mắt', 'Chợp mắt ở chỗ có ghế / võng', 'click', 'sfx'],
  ['place.sleep', 'place', 'Đi ngủ', 'Ngủ ở phòng trọ', 'click', 'sfx'],
  ['place.joinBrand', 'place', 'Vào hãng', 'Ký hợp đồng xong, nhận xe hãng', 'win', 'sfx'],
  ['place.gotBike', 'place', 'Được cho xe đạp', 'Cô Hai cho xe đạp lúc mở đầu', 'win', 'sfx'],
  ['place.takeVehicle', 'place', 'Lấy xe trong hầm', 'Lấy xe để dành trong hầm nhà trọ ra chạy', '', 'sfx'],
  // ---- luật lệ & sự cố ----
  ['law.whistle', 'law', 'CSGT thổi còi', 'Bị CSGT dừng xe', 'whistle', 'sfx'],
  ['law.fine', 'law', 'Bị phạt', 'CSGT phạt tiền / ghi phạt nguội', 'bad', 'sfx'],
  ['law.towed', 'law', 'Bị giữ xe', 'CSGT giữ xe về đồn', 'bad', 'sfx'],
  ['law.parking', 'law', 'Sự cố đậu xe', 'Xe đậu ngoài đường bị dán phạt / cẩu / trộm', 'bad', 'sfx'],
  ['law.airport', 'law', 'Nhắc nhở sân bay', 'Dừng xe sai chỗ ở sân bay: nhắc / phạt', 'whistle', 'sfx'],
  // ---- tiền & tiến trình ----
  ['money.pay', 'money', 'Trả tiền', 'Trả tiền vé xe buýt, phà, chuộc xe, nộp phạt, ứng tiền hàng', 'cash', 'sfx'],
  ['money.earn', 'money', 'Nhận tiền', 'Bán xe, được hoàn tiền', 'cash', 'sfx'],
  ['money.rentPaid', 'money', 'Trả tiền nhà', 'Trả tiền nhà cho Cô Hai', 'cash', 'sfx'],
  ['money.rentLate', 'money', 'Trễ hạn tiền nhà', 'Quá 22:00 hạn trả mà chưa trả đủ', 'bad', 'sfx'],
  ['progress.objective', 'money', 'Xong mục tiêu', 'Một mục tiêu trong danh sách vừa xong', '', 'sfx'],
  ['progress.collapse', 'money', 'Ngất / suy sụp', 'Kiệt sức phải nằm nghỉ', 'bad', 'sfx'],
  ['progress.gameOver', 'money', 'Thua', 'Bị đuổi khỏi phòng trọ / khóa tài khoản', 'lose', 'sfx'],
];

export const SOUNDS = Object.fromEntries(LIST.map(([id, cat, label, where, synth, kind]) => [id, { id, cat, label, where, synth, kind }]));
export const SOUND_IDS = Object.keys(SOUNDS);
export const SOUND_EXT = ['ogg', 'mp3', 'wav', 'm4a'];
export const SOUND_FILE_RE = /^[a-z0-9_\-.]+\.(ogg|mp3|wav|m4a)$/i; // tên file gọn: chữ không dấu, số, - _ .

// Nhóm âm lượng trong Cài đặt
export const volumeGroup = (id) => (SOUNDS[id]?.kind === 'music' ? 'music' : 'sfx');

// Kiểm tra sounds.json: mã có thật, file đúng tên / có trong thư mục (files: danh sách file đang có, null = không kiểm tra), âm lượng 0–2
export function validateSounds(data, files = null) {
  const out = [];
  const add = (level, ref, field, msg) => out.push({ level, tab: 'sound', ref, field, msg });
  const table = data?.sounds;
  if (!table || typeof table !== 'object' || Array.isArray(table)) return [{ level: 'error', tab: 'sound', ref: '', field: 'sounds', msg: 'sounds.json phải có mục "sounds" dạng { mã: {...} }.' }];
  for (const [id, s] of Object.entries(table)) {
    if (!SOUNDS[id]) { add('warn', id, 'id', `Mã "${id}" không còn dùng trong game (bỏ qua).`); continue; }
    if (s.files != null && !Array.isArray(s.files)) add('error', id, 'files', 'Danh sách file phải là mảng.');
    for (const f of Array.isArray(s.files) ? s.files : []) {
      if (!SOUND_FILE_RE.test(f)) add('error', id, 'files', `Tên file "${f}" không hợp lệ (chỉ chữ không dấu, số, - _ ., đuôi ${SOUND_EXT.join('/')}).`);
      else if (files && !files.includes(f)) add('error', id, 'files', `Không thấy file "${f}" trong thư mục src/sounds.`);
    }
    if (s.volume != null && !(Number.isFinite(s.volume) && s.volume >= 0 && s.volume <= 2)) add('error', id, 'volume', 'Âm lượng phải từ 0 đến 200%.');
  }
  return out;
}
