# Việc đang dở — Shipper Simulation

Ghi lại những việc đã bàn mà chưa làm / còn treo, để đổi máy hay đổi tài khoản Claude vẫn làm tiếp được.
Làm xong mục nào thì xóa (hoặc chuyển xuống "Đã xong gần đây"). Cập nhật lần cuối: 19/10/2026.

## ⏸ Hoãn có chủ đích

### 🚲 Đi xe đạp thì KHÔNG bị phạt (14/10 — chủ game yêu cầu, khi nào bật lại chủ game sẽ báo)
- Công tắc: thẻ ⚖️ Cân bằng → `economy.pedalNoFines` (1 = bật luật, 0 = phạt như mọi xe). Đang dùng xe đạp (gs.power = pedal) thì:
  không dán phạt đỗ xe, không cẩu xe, không phạt sân bay / cản đường / vượt đèn đỏ, chốt CSGT + CSGT tuần tra cho qua (game.js `noFines()`).
  Xe máy / xe điện vẫn bị phạt như cũ.

### 💬 Tin nhóm tài xế: TẮT HẲN (15/10 — chủ game: "khi nào tôi nói bật lại thì bật, vì liên quan cốt truyện")
- game.js `GROUP_CHAT_ON = false` → không có tin nhóm Hội Shipper (dự báo, quảng cáo, mẹo, kẹt xe…). Vào hãng chỉ có tin chào mừng của hãng.
  Bật lại: đổi thành true (mỗi ngày vào nhóm 1 lần — flags.groupDay, trước đây mở lại game là thêm 3 tin nữa).

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

## 💬 Đang bàn
### 🏗️ Chuẩn bị dự án nặng hơn + làm gọn tool cốt truyện (16/10 — chủ game duyệt thứ tự: Đợt 1 → tool cốt truyện → Đợt 2 → Đợt 3)
- **Đợt 1 (xong)**: nén âm thanh (cài ffmpeg; 8,9 MB → 3,9 MB, bản đăng 14,8 MB → 7,9 MB) + lệnh `npm run nen-am-thanh` cho file mới.
  Giữ editor trong bản đăng (README ghi chủ game có dùng "editor online"; bỏ thì nhẹ thêm ~0,9 MB — chủ game chốt 16/10: GIỮ editor).
- **Tool cốt truyện (xong, theo phác thảo `sketches/story-tool.png`)**: 1 bước chia 3 thẻ con (🎬 Diễn biến · 👀 Người chơi thấy gì · ⚙️ Luật trong bước,
  số = đã đặt bao nhiêu thứ) · khung chưa dùng thu gọn · ô hiếm dùng của "Người lạ xuất hiện" gấp vào "▸ Thêm" · "Thêm việc" / "Xong bước khi" chia nhóm
  (ACTION_GROUPS / UNTIL_GROUPS trong tabStory.js) · ẩn mục chưa ai dùng (say, give, fuel, read, talk kiểu cũ, hướng dẫn reply — bước đang dùng vẫn
  hiện ở nhóm "Kiểu cũ") · 3 việc remove / leave / goto = 1 mục "🚶 Rời cảnh" + ô Cách rời (bộ chạy giữ nguyên 3 mã) · "Chặn đơn thường" chỉ hiện ở bước
  trước tên chương · danh sách bước có biểu tượng (🎬🧍💬🎯❗⏰🏍️🎥🏁). story.json không đổi; đã mở thử đủ 100 bước 3 chương.
- Đợt 2 (HOÃN — chủ game "1. ok"): chia story.json + chữ cốt truyện theo chương; file còn nhỏ, chia ra dễ hỏng → để khi nào nặng hẳn.
- **Đợt 3 (xong 16/10)**: game.js 3570 → ~1070 dòng (khởi tạo, vòng đời ngày, vòng lặp); phần còn lại dời nguyên văn sang `src/game/`
  (events · roadRules · navigation · story · visuals · phoneData — lớp "phần" gắn vào Game.prototype bằng `mixParts`, trùng tên hàm thì báo lỗi ngay;
  hằng số chung ở `game/shared.js`). interactions.js 1771 dòng → `src/interactions/` (common · nearby · phone · delivery · places · road),
  interactions.js chỉ xuất lại 15 hàm cũ. Đã so từng dòng: chỉ dời chỗ, không đổi code. `scripts/kiem-ten.js` (dò tên quên import) chạy kèm `npm test`.
  tests/run.js chưa tách (chỉ chạy bằng node, không vào bản đăng). **Máy kia: kéo bản mới về trước khi sửa game.js / interactions.js.**

### 🎬 Trong chương thì không có đơn (16/10 — đã làm, chủ game chốt: "sau bước hiện tên chương là không nhận được đơn nào, xong chương mới có đơn lại")
- `sim/story.js inChapter()`: đã hiện tên chương (bước có việc "title") mà chưa hết chương → app không phát đơn thường (om.hold), trong app nhận
  đơn có dòng "🎬 Đang trong Chương N…"; bật công tắc → không cho + thông báo (trừ bước cốt truyện bắt bật công tắc — hướng dẫn chương 1).
- Đơn do cốt truyện mời (bún mọc Cô Yến, cuốc chở thử chương 1) vẫn có như cũ. Cuốc chở thử chương 1 KHÔNG có thanh đếm ngược (chủ game chốt 16/10).
- Tới bước hiện tên chương mà: đang chạy đơn → chờ giao xong / hủy mới hiện tên chương (nhắc mỗi 30 giây) · có đơn mời chưa nhận → bỏ đơn mời,
  không tính bỏ đơn (OrderManager.dismissOffer). Xong chương → thông báo "giờ nhận đơn lại được rồi" (trễ hạn quay lùi trong chương thì không báo).
- Chưa làm (chờ chủ game nếu cần): các bước TRƯỚC tên chương (vd chương 3: chờ chị Linh lúc 8h) vẫn cho nhận / chạy đơn như thường.

### 🕸️ Công cụ sơ đồ quan hệ nhân vật `/?relationship` (16/10 — đã làm, chờ chủ game vẽ / sửa)
- Phác thảo đã duyệt: `sketches/relationship.png` + `relationship-check.png`. Dữ liệu `src/data/relations.json`, hàm game `src/data/relations.js`,
  công cụ `src/devtools/relationship/`, bộ luật kiểm tra `validateRelations` (validate.js, có bộ thử).
- Thẻ nhân vật (hồ sơ: tuổi, vai, tính cách, ghi chú; gắn với người trong cốt truyện / NPC địa điểm; ngoại hình riêng nhiều bộ đồ chọn từ goods.json,
  xem 3D) · dây quan hệ (loại, nhãn 2 chiều, **xưng hô 2 chiều**, tình cảm −3…+3, từ / tới chương, 🔒 bí mật, ghi chú) · loại dây sửa được ·
  lọc "Tới chương" · tìm · ＋ Lấy từ game · hoàn tác · ✅ Kiểm tra (lỗi / cảnh báo / gợi ý, Nhảy tới, Bỏ qua) · "📝 Ghi chú của Claude" (mảng notes).
- Game dùng: xưng hô {toi} {ban} {khach} {minh} trong thoại cốt truyện, tin nhắn, lời NPC địa điểm có dây với người chơi (thay cho đoán theo tên);
  người lạ cốt truyện dáng "Theo sơ đồ quan hệ" (look: "char", chọn bộ đồ). Trang phục mới có ô **"Chỉ cho NPC"** (không bán, người chơi không có).
- Đã vẽ sẵn 11 nhân vật chương 1–2 + 14 dây theo thoại hiện có. ✅ Kiểm tra đang báo (để chủ game quyết):
  thiếu xưng hô Mẹ ↔ Cô Hai, Cô Hai ↔ Chú Hai; Chú Hai chương 1 gọi người chơi "cháu" nhưng chương 2 gọi "con"; bảo vệ trường xưng "mày" (khi hỏi hỗn);
  câu "Dạ để con đi tìm chị" (chữ "chị" = chị Linh — báo nhầm, bấm Bỏ qua).
- 16/10 (sau): chủ game đổi Cô Hai → **Dì Hai** (chị gái của mẹ), Chú Hai → **Dượng Hai** (chồng Dì Hai) → Claude đã sửa 55 câu chữ + tên
  2 địa điểm (giữ "chú Hai" ở câu chị Linh nói). Mã nội bộ vẫn là coHai / chuHai (không hiện ra ngoài).
- **Đồng bộ editor ↔ sơ đồ (phương án A, đã làm)**: nhân vật gắn với game thì tên / biểu tượng / giới tính là 1 nguồn — sửa trong /?relationship
  ghi thẳng vào places.json (NPC) + story.json / vi.json (danh bạ), chỉ gộp đúng ô đã sửa; ?editor lưu → tool tự tải lại; tool lưu → ?editor tự
  cập nhật file đó (nếu không đang sửa dở). Tên NPC ≠ tên danh bạ → tool lấy theo NPC + nhắc Lưu. Mở thẳng: /?relationship#place=home | #story=linh | #char=man.
- **Đã làm theo phác thảo** `sketches/sync-ui.png`: hộp ✏️ Đổi tên khắp nơi (tool: nút cạnh ô Tên — tìm câu chữ + tên / biển hiệu địa điểm,
  hoa / thường / VIẾT HOA, tick từng chỗ, giữ sẵn câu người nói cố ý gọi tên cũ, đổi cả chữ tự xưng trong lời người đó) · ô 🕸️ Quan hệ trong ?editor
  (trang NPC địa điểm + danh bạ / người nói cốt truyện; chưa có → "Thêm vào sơ đồ" = /?relationship#add=place:<mã>) · luật "tên cũ còn sót"
  (nhân vật có oldNames — tự nhớ khi đổi tên). Lưu mà relations.json vừa bị lưu chỗ khác → hỏi trước khi ghi đè (từng bị 1 tab cũ ghi đè 16/10).
- Khi chủ game vẽ xong / nhắn "soát quan hệ": Claude đọc relations.json, sửa thoại cho khớp, ghi ý kiến vào notes (hiện ở ✅ Kiểm tra).

### 📖 Chương 3 "Xui xẻo" (16/10 — XONG tới đoạn qua cầu; cutscene sau cầu chủ game tính sau)
- Luồng (story.json c3, 26 bước, lời thoại nháp story.c3.* — chủ game tự sửa):
  Dượng Hai nhắn cảm ơn (3 câu trả lời) → ngủ qua ngày → sáng chị Linh nhắc "8h nhớ qua" (3 câu) → chờ 8h–9h →
  8h chị Linh đứng trước Tiệm Trà A Di Đà (!) → E nói chuyện → "đi thôi" → hiện "Chương 3: Xui xẻo" → chị lên xe →
  chở tới ĐH Mỹ thuật **trước 9h** (quá 9h: báo thất bại + chị nhắn tin → quay lại chờ 8h **sáng hôm sau**, đồng hồ chung không quay ngược) →
  chị Nhi chạy lại (?) → hỏi đáp → 😅 → anh Hoàng chạy lại (!) → "Giờ này còn đứng đây…" → Linh, Nhi (!) → lần lượt chạy vào trường, "Bye em" → 😆 →
  🎬 cảnh phim: chợ Hòa Bình, cô Tư bán cá la "Cướp!" → tên cướp (dáng trẻ trâu) bốc đầu xe, camera bám theo →
  mục tiêu "Đuổi theo tên cướp!" (không bị phạt) → dí: Chợ → ĐH Mỹ thuật → Nhà thờ → ngã tư [7,5] quẹo trái → [7,2] quẹo phải → qua cầu Sông Ngân → [10,2] →
  🎬 cảnh phim MẪU ở chân cầu (chủ game sửa / thêm cảnh) → bước "wip" (Chưa viết tiếp — dừng ở đây, chơi bình thường).
- Máy mới (sửa được ở ?editor → Cốt truyện):
  - Việc: 🎬 Cảnh phim (cine — cảnh quay: nhìn địa điểm / người lạ / người chơi, giây, cách xa, cao, góc, bám theo) · 🏍️ Chạy trốn (chase — lộ trình địa điểm / ngã tư [cột, hàng],
    cách người chơi, tốc độ, chờ, bốc đầu) · Dấu ? / ! (react) · Đi / chạy vào địa điểm (goto) · Phát tiếng (sound) · "Người lạ đi tới" có ô Chạy.
  - Điều kiện: Cảnh phim chiếu xong (cine) · Người lạ chạy hết lộ trình (chased) · Chưa viết tiếp (never).
  - Bước: ⏰ Hạn giờ (deadline: giờ, quay lại bước, thông báo, tin nhắn) · NPC vắng mặt (hideNpc — bước + cả chương) · Không bị phạt (noFines).
  - Người lạ là nhân vật của NPC địa điểm (vd chị Linh ↔ tiệm trà) đang có mặt → NPC đó tự vắng (không bị 2 chị Linh).
  - ?cheat: "⏩ Bỏ qua cảnh phim"; "Xong mục tiêu" ở bước dí xe → tên cướp tới cuối lộ trình.
- Sơ đồ quan hệ: chị Nhi (chiNhi → story "nhi"), anh Hoàng (nhanVatMoi → story "hoang") — đã gắn cốt truyện, thêm ngoại hình riêng (Nhi: tóc xoăn nâu, sơ mi trắng + chân váy be;
  Hoàng: gầy, áo bà ba kem + quần tây) + dây với người chơi (Nhi: chị – bé · Hoàng: anh – em). Chủ game sửa lại tùy ý.
- Âm thanh: mới `city.thiefShout` (la "Cướp!"), dùng lại `city.rev` (nẹt pô bốc đầu).
- Lỗi cũ sửa luôn: người lạ "đi tới / chạy lại" khi người chơi đang ngồi xe bị chạy nhầm hướng (lấy nhầm tọa độ hình người chơi gắn trên xe) → game.js storyPlayerAt().
- Chơi nhiều người: cốt truyện riêng từng người — tên cướp, chị Linh, Nhi, Hoàng chỉ máy người đó thấy; cảnh phim không dừng giờ (1 giây = 1 phút game);
  hạn 9h theo giờ chung, thất bại thì chờ hôm sau. Sau này "không bị phạt lúc dí xe" cần máy chủ biết người chơi đang ở bước noFines.
- Đợt sửa 2 (16/10): Nhi, Hoàng chạy tới rồi **đứng lại** (việc "Người lạ đi tới" có ô "Tới nơi thì đứng lại": chọn 1 chỗ trống quanh người chơi ~1,9 m, không chồng người khác,
  quay về phía người đang nói — game.js storyCircleSpot) · dấu cảm xúc (react) đổi thành ? vàng / ! đỏ **không khung** (textures.js makeReactTexture); dấu nhiệm vụ vẫn khung tròn vàng ·
  tên cướp: bỏ cột sáng (bước có noBeacon) + dấu "dot" = chấm đỏ nhấp nháy · hết cảnh cướp (cine.endRide = thief) → người chơi tự ngồi lên xe (xe xa thì dắt lại),
  xe + camera quay theo hướng lộ trình dí (game.js storyRideAfterCine, interactions.js mountBike).
- Nhạc dí cướp (16/10): mã mới `music.chase`; bước có ô "Nhạc riêng" (story.json → music) thay nhạc ngày / đêm — đặt cho robbery → chaseMount → chase → bridgeCut,
  phát liền mạch, qua cầu (wip) về nhạc thường. CHỜ chủ game tìm bài (gợi ý: Pixabay Music "chase music loop", 140–160 bpm, 1–2 phút, 96–128 kbps) rồi gắn ở thẻ 🔊 Âm thanh.
- Dí cướp sửa (16/10): tên cướp KHÔNG dừng chờ nữa — chạy đều pct% (85) tốc độ tối đa xe người chơi, tới gần thì rồ ga bỏ ra; cách 70% mốc → "Sắp mất dấu";
  cách quá lose (700 m màn hình = 70 đơn vị) → thua: màn tối, về chỗ bắt đầu dí (gs.story.chaseStart, lưu lúc hết cảnh cướp) — không chiếu lại cảnh phim.
  Thử: xe đạp hết ga bám được tới cầu (xa nhất ~22 đơn vị, kể cả khựng 2 giây); đứng yên ~11 giây thì thua. Nẹt pô (city.rev) giờ phát lúc tên cướp lướt ngang người chơi (revAt 'pass').
  Chủ game đã chỉnh gap = 10 trong editor.
- Còn để ý: mở lại game giữa cảnh phim → bỏ qua cảnh đó; giữa lúc dí → tên cướp hiện trước người chơi ~30 m trên lộ trình.

### 🏍️ Chương 3 — cảnh dí cướp phần 2 (17/10 — XONG, CHỜ chủ game xem trong game; phác họa duyệt: sketches/canh-di-cuop/storyboard.jpg)
- Chủ game chốt: làm kiểu khối dùng lại được (A) · công trình đặt hẳn ở khối 5,7 (a) · tháo nón khi người chơi tới (2 tay gỡ nón) · nâng nhạc trước · quay chậm 3 giây.
- Luồng: dí qua cầu sắt 1 → xuống đường ven sông qua sân bóng → quẹo phải lên cầu 2 → **qua nửa cầu** (until "reach" [182, 0]) → 🎬 cảnh phim lớn ~37 giây (bước bigChase):
  ① mắt người chơi nhìn tới (pô gầm sau lưng `city.motoPass`) ② ngoái lại ③ xe vượt mặt, lia theo ④ trên cao ⑤ góc nhà thờ: drift + khói ⑥ bám theo qua cầu kênh
  ⑦ ngã tư bến cảng: xe tải container lao ra (còi `city.truckHorn`), tên cướp lạng trái lọt qua ⑧ lên tấm ván bay qua xe tải (quay chậm 0,6 ≈ 3 giây)
  ⑨ bám theo tới công viên ⑩ chó lao ra, té xe (`city.bikeFall`) ⑪ bỏ xe chạy bộ, anh mô tô vượt lên thắng gấp xoay ngang chặn ⑫ người chơi chạy tới từ xa →
  bước arrive2 (anh mô tô xuống xe, người chơi lại gần) → phần cuối chương (mục "🤼 Chương 3 — cuối chương" bên dưới).
- Máy mới (đều chỉnh được ở ?editor → Cốt truyện):
  - Cảnh quay: kiểu máy (quanh vật / góc nhìn thứ nhất / cố định ở tọa độ), quay đầu yaw→yawTo, nhìn theo (lookAt), tới mốc thì sang cảnh sau (until "người:mốc"),
    quay chậm (slow — chỉ diễn viên, đạo cụ, xe người chơi; đồng hồ chung vẫn chạy), góc rộng (fov), tiếng lúc vào cảnh. Cảnh phim: xe người chơi tự chạy theo (ride),
    dọn xe NPC quanh người chơi (clear — chỉ máy mình, hết cảnh hiện lại).
  - Chạy trốn: điểm tọa độ [x, z] (chạy thẳng), mốc, hành động (drift / té xe → chạy bộ), lệch ngang, cao (ván), bay, tốc độ từ điểm; kiểu xe (supersport), màu,
    đuổi theo người khác (follow — người đó té thì vượt lên chặn), xuất hiện sau lưng, né xe / người / chó (dodge), dáng "theo sơ đồ quan hệ" + bộ đồ.
  - Việc mới: 🚛 Đạo cụ (prop: xe tải / tấm ván / chó, chạy khi tới mốc) · Xuống xe (dismount) · Tháo nón (helmetOff). Điều kiện mới: Tới chỗ [x, z] (reach).
- Mô hình mới: xe `supersport` (đen sọc xanh lá — dùng chung chương 2 + 3), áo `racing` (chữ RACE, sọc trắng), nón `race` (kính khói, sọc, cánh gió), tóc `crop`
  (chỉ NPC — không có ở màn tạo nhân vật), xe tải container + tấm ván (world/storyProps.js). Đồ đua NPC: aoDaDua_den, muFullfaceDua, gangDa_den, quanDua_den, botDua_den.
  Sơ đồ quan hệ: bộ đồ có thể có "Kiểu tóc riêng" (anh mô tô bộ "Đi đua (dí cướp)" → slick); bộ "Thường ngày" lúc nói chuyện với chị Linh giữ nguyên.
- Công trình đang xây: địa điểm mới `congTrinhCang` (khối 5,7 lô E1). Nhạc dí cướp: nén lại từ bản gốc + nâng to ~12 dB, âm lượng 160% (cũ 200%).
- Bốc đầu tên cướp giờ đúng lúc nẹt pô (lướt ngang người chơi).
- Âm thanh mới (đang dùng tạm file có sẵn, CHỜ người làm sound): drive.skid, city.motoPass, city.truckHorn, city.bikeFall (docs/am-thanh.md).
- Sửa 17/10: tiếng máy xe (loop.engine) không kêu dù đã gắn file — lỗi audio.js (file tải sẵn rồi thì vòng lặp không bao giờ phát), đã sửa ·
  tiếng mô tô vụt qua phát khi anh mô tô tới cách người chơi ~20 (chase.nearSound / nearDist) · tách tiếng cuối: city.thiefCrash (té xe vì đâm chó, gắn ở điểm
  lộ trình "Té xe") + city.thiefDog (con chó lao ra, đạo cụ dog1) · tóc slick làm lại bằng các sợi chải ngược (hết giống búi len).
- Sửa 17/10 (2): tiếng ở điểm lộ trình phát SỚM cho khoảnh khắc mạnh nhất trong file (tự dò, hoặc ô "rầm lúc") trùng lúc tới điểm, tên cướp tự chỉnh tốc độ
  để tới đúng lúc (kể cả có quay chậm chen giữa) — file am_thanh_te_xe "rầm" ở giây 5,3 · tiếng chó (yodguard) phát đúng lúc bị đâm (gắn ở điểm té xe, bỏ ở đạo cụ chó) ·
  tiếng máy xe anh mô tô: mã lặp loop.motoChase (chase.loop), to nhỏ theo khoảng cách camera · tóc: 5 mẫu xem thử slickA–E (sketches/canh-di-cuop/mau-toc.jpg),
  → chủ game chốt (17/10): tóc "crop" (ngắn tỉa, mái rủ trán, đen — theo ảnh mẫu, làm gọn) cho bộ "Đi đua"; kính gọng mày đen (kinhGongMay_den,
  kiểu browline) đeo ở MỌI bộ đồ của anh mô tô. Đã bỏ tóc slick + các mẫu thử. Kính có gọng mới (5 kiểu: roundBig, roundThick, squareBig, aviator, browline)
  chọn được cho món "Phụ kiện đầu" ở ?editor.
- Sửa 17/10 (3): lúc chiếu cảnh dí lớn TẮT HẾT xe thường (cine.clearAll: xe NPC, xe buýt, xe nền — chỉ máy mình, hết cảnh chạy lại) · thay bằng 6 xe diễn viên
  (đạo cụ car / moto: xeW1–W3 đường trước nhà thờ, xeS1–S3 đường xuống bến cảng) chạy đúng làn, hiện khi tên cướp tới mốc west / south, có xe tấp lề dừng (keep) ·
  2 xe dí + xe người chơi tự chạy đều né xe diễn viên (sửa lỗi hàm né: đo lệch sai + bỏ né khi đang chạy ngang hàng). Đo: gần nhất 1,6 (tâm-tâm), không xuyên qua nhau.

### 📖 Chương 5 "Hội nhóm shipper" (19/10 — XONG bản đầu, đã đẩy lên GitHub d05cbe2; lời thoại nháp, chủ game tự sửa ở ?editor)
- Cả chương đã duyệt (19/10): 4 giờ sáng ngủ dậy → chị Linh hỏi anh Đạt → gọi không được → nhiệm vụ "Lướt Tích Tắc" thấy Tí Sún khoe xe anh Đạt →
  nhắn tin hỏi mua (chốt 20 triệu, hẹn 21h gầm cầu sắt ven kênh) → gặp mặt nó đòi 100 triệu, đàn em nhận ra người chơi (hẻm chương 4), dọa, đuổi về →
  Tí Sún chặn tin nhắn → Dượng Hai chỉ chú Tư xe ôm ở bến xe → thử thách chở thuốc cho bà Năm (chấm điểm thật, cần ≥ 4★) → vào nhóm "Hội nhóm shipper"
  (hiện tên chương), anh em góp ý → mini game 🗺️ Bày trận (3 chốt, chú Tư giữ sẵn 2 chốt, có đúng 2 lời giải) → đêm: anh em đứng chốt, bóp còi,
  Tí Sún lao vào đường cụt ngập, chết máy (quay chậm) → người chơi lội Cub tới, anh em vây, Tí Sún bỏ xe chạy bộ → chú Tư nói đùa → đẩy xe ra →
  xe dựng ở tiệm trà, chị Linh mở cốp: điện thoại anh Đạt (hết pin) + chìa khóa "Kho 7 – Bến cảng" → hết chương.
- Tên "Tí Sún" là tạm (chủ game đổi sau, sẽ gặp lại). Nước ngập là "cách 2": chỉ vẽ trên máy người chơi này (đạo cụ water), không ngập thật cả thành phố.
- Nhóm "Hội nhóm shipper" là nhóm chat CỐT TRUYỆN (danh bạ story.json, group: true) — khác tin nhóm tài xế GROUP_CHAT_ON (vẫn tắt).
- Mới trong bộ chạy + ?editor (thẻ Cốt truyện): việc 📱 Tin Tích Tắc (ttPost) · ⛔ Chặn (block) · 🗺️ Bày trận (ambush, sim/ambush.js + ui/ambush.js; editor tự đếm
  số lời giải) · 🛵 Anh em đứng chốt (ambushCrew) · "Làm sau … giây" cho mọi việc · mời đơn 📦 chở hàng (kind parcel: lấy ở, món, giao tới, chấm điểm thật,
  cần ít nhất … sao, câu khi chưa đủ sao) · tin nhắn nhóm có tên người gửi / dòng hệ thống · rời cảnh "bỏ xe chạy bộ" · người lạ đứng đúng tọa độ có xe
  đi kèm (chỗ dựng + đầu xe) · đạo cụ 🌊 nước ngập / 🏍️ mô tô dựng · lộ trình chạy trốn "chết máy giữa nước" · điều kiện: đã lướt tới tin Tích Tắc /
  đi xa khỏi người lạ / đã bày chốt đúng · hướng dẫn "Mở app …" · danh bạ: ô "Nhóm chat". validate.js kiểm tra hết (bày trận không lời giải → lỗi).
- Đã thử trong trình duyệt cả chương (tin Tích Tắc có ảnh thật, nhắn tin, gặp mặt, chặn, đơn thuốc đủ / thiếu sao, nhóm chat, bày trận, cảnh đêm, vây, hết chương).
  Sửa khi thử: nước ban đêm sáng hơn · hết cảnh đêm người chơi ngồi sẵn trên Cub quay về phía Tí Sún (endRide) · màn đen chỉ dọn đạo cụ có lúc bắt đầu tối
  (không xóa nhầm xe anh Đạt ở bước sau) · 😈 đứng lại chỗ dừng sau khi chạy thử · câu báo thiếu sao không dùng ngoặc kép.
- Sửa 20/10 (đã đẩy lên GitHub 9c29e28; chủ game báo chương 4 lấy tranh mà túi còn hũ chao + tàu hũ của chương 1 — do cheat "Nhảy tới bước" không dọn túi):
  hết chương dọn túi hàng cốt truyện (finishChapter) · xếp hàng chỉ giữ gói chương này đã cho xếp ở bước trước (sim/story.js carryAt — bản lưu bị sót tự hết) ·
  cheat "Nhảy tới bước" đặt túi đúng như chơi tới bước đó (vd giữa đoạn chở hoa thì có sẵn bó hoa).
- Còn để ý: mở lại game giữa đoạn lội nước / vây thì nước + xe vây không vẽ lại (đạo cụ chỉ có lúc vào bước) — chủ game thấy cần thì làm.
- Chơi nhiều người: cốt truyện của riêng từng người (Tí Sún, nước, anh em chốt chỉ máy mình vẽ); tiền / sao đơn thuốc đi qua OrderManager như đơn thường.

### 🧭 Sửa sau chương 4 + bảng mục tiêu mới (18/10 — XONG, đã đẩy lên GitHub 7c0f470; phác họa duyệt: sketches/hud-muc-tieu/hud-sketch2.jpg)
- Chỉ đường: bước cốt truyện không có chỗ đến (vd "Đi ngủ") mà người chơi tự bấm 📍 Chỉ đường trên bản đồ → chỉ tới chỗ đó (trước bị nuốt, navigation.js currentTarget).
- Màn hình: bỏ bảng mục tiêu cũ dưới bảng giờ/tiền. **Thanh giữa trên** (mũi tên + "Đi đến …" + khoảng cách) CHỈ hiện khi bước cốt truyện có chỗ đến;
  chữ mẫu `goal.goTo` ("Đi đến {place}") ở Chữ & hội thoại, từng bước muốn ghi khác: thẻ 📖 → "Người chơi thấy gì" → "＋ Chữ thanh 'Đi đến …' riêng" (st.goTo).
  **Góc phải "📋 Mục tiêu"** = danh sách: ⭐ mục tiêu cốt truyện (vàng) · 📦 đơn · 🧭 tự chỉ đường · ⚠️/😴/🚌… rồi tới mục tiêu hôm nay.
  Chạy đơn / tự chỉ đường: không có mũi tên giữa trên, chỉ còn đường trên bản đồ tròn + dòng "Rẽ phải sau …" (chủ game chốt).
- Chị Nhi vào danh bạ, đưa thiệp xong nhắn 3 địa chỉ (anh Đại, em Minh, Lan Anh — bấm vào là chỉ đường).
- Khung vàng hướng dẫn xếp túi: ô "Hướng dẫn xếp túi (khung vàng)" trong việc nói chuyện (talk.guide); chỉ chương 1 bật. Tắt = xếp như đơn thường.
- Đứng game sau khi nói với anh Đại (lỗi của Claude: khóa đứng yên cả khi bước sau chờ người khác) → đã sửa. Giờ người chơi nói trước 1 câu
  ("chị Linh gửi thiệp mời…") rồi anh Đại / em Minh / Lan Anh mới trả lời (story.c4.player.toDai / toMinh / toLan — sửa được).

### 🔧 Chương 4 sửa thêm (18/10 chiều — XONG, đã đẩy lên GitHub 7ab35e3)
- Nhạc bị rượt to hơn: bước cốt truyện có nhạc riêng (dí cướp, bị rượt) → tiếng lặp (máy xe, mưa, phố) hạ còn 40% (audio.js loopBus + setLoopDuck). File music.flee vốn đã to hơn nhạc menu (−10,5 vs −13,4 LUFS).
- Thùng rác thứ 4 (bin4, [-35.4, -181.5]) sát tụi giang hồ + bước mới "hideBin": tới cuối hẻm → mục tiêu "Núp vào thùng rác gần đó để nghe lén" (mũi tên + dấu ! trên thùng),
  núp rồi thoại nghe lén mới bắt đầu. Điều kiện mới "🗑️ Đang núp sau thùng rác" (until hidden), mũi tên / dấu chỉ vào đạo cụ (target "prop:<mã>", mark.prop) — có ở ?editor.
- Lấy bánh: bó hoa còn nằm sẵn đúng ô cũ trong túi (khóa, không dời), chỉ xếp thêm bánh; giao chị Linh cả hai (packing.js preset, story.carrySlots).
- 8h15 chị Linh nhờ (mingle until.from 8.25).
- Lỗi của Claude từ 23ab10c: chị Nhi nhận tranh chỉ bỏ tranh A → tranh B nằm mãi trong túi. Đã sửa: bỏ hết tranh đã chở.

### 🧪 Chơi thử chương 1 → 4 (18/10) — ĐÃ SỬA 19/10 theo đề xuất, đã đẩy lên GitHub d05cbe2 (chủ game duyệt "theo đề xuất hết")
- Đã sửa:
  - Đơn cốt truyện (forced): không tính trễ, giao được là 5★; thông báo / thẻ đơn ghi "không giới hạn giờ"; thẻ đơn giao đồ ăn ghi "🎓 Đơn giao thử".
  - Bị rượt: chạy được bất kể thể lực, chạy không tốn thêm thể lực (game.js walker phys + drain).
  - Xe bị giữ ở ĐỒN mà thiếu tiền: lấy được xe khác trong hầm ("Lấy … ra chạy (xe kia để lại đồn, chuộc sau)"), xe kia vào gs.impound;
    chuộc ở đồn (phí + phạt nguội) → xe về hầm. Bãi giữ xe thường không đổi (vẫn lấy hết tiền đang có rồi trả xe).
  - Kiệt sức lúc bước đang chạy / 12 bước tới có khung giờ / hạn giờ / onlyBefore-After → chỉ nằm energy.collapse.storyHours (2 giờ, sửa ở ⚖️ Cân bằng);
    cảnh báo "Thể lực / Tinh thần sắp cạn" khi < 15.
  - Tiền nhà: việc mới 💵 "Nhận tiền" (pay) — chị Linh trả: c3 arrive 50k · c4 nhiTake 150k · thanksOk 60k / thanksLate 40k · arriveTra 40k (sửa ở ?editor).
  - Chữ: bảo vệ 3 câu đáp riêng (guard.a1/a2, câu láo giữ guard.a) · c3.call.a1/a2 có chữ · "Phần cơm chay Dượng Hai" · GripBike · "2 bức" ·
    "Bấm Gắn vào" · 🔥 Nóng · "5h chiều qua sân bay…" · tin chị Nhi có 3 nút 📍 (traiCay, nhasach, dichvu3) ·
    thẻ điều kiện câu thoại [day] [night] [late] [damaged] (content/index.js COND_TAGS): ban đêm không than nắng, không chê "trễ / hư" khi không trễ / hư ·
    việc mới "Đổi tên hiển thị" (rename): anh Đạt tự giới thiệu → bong bóng ghi "Anh Đạt" (gs.story.names) ·
    chị bán hoa (people hoaBan, dáng girl) đứng cạnh cửa chợ, nói thay cô bán cá (talk.who — ô "Người nói thay NPC" trong thẻ Nói chuyện).
  - Giao diện: chương / bước chặn đơn thì không nhắc "Bật nhận đơn" · thanh "Đi đến …" tắt khi cách < 3 đơn vị (~30 m) · dấu trên đạo cụ cùng cỡ ·
    nút E: "Lên phòng" và "Lấy xe … ra chạy" cái nào gần hơn thì được (bằng nhau → Lên phòng) · xe đạp: câu nhắc đậu xe riêng (chỉ nói chuyện trộm).
  - Cốt truyện: diveThoi 2 câu tự tắt (câu 2 sau 3 giây), không giữ chờ E · chỗ làm lại khi bị phát hiện → vỉa hè [-7.4, -168] ·
    "nói / phát tiếng sau … giây" đếm theo vòng lặp game (storyAfter) như cảnh phim, không dùng setTimeout.
- Chủ game chốt 19/10:
  - Tiền chị Linh trả trong cốt truyện (việc 💵 Nhận tiền): GIỮ. Tiền thưởng cốt truyện không tính vào cân bằng kinh tế — không cần đo bằng npm run sim.
  - Nhiệm vụ ví anh Minh: để nguyên (ngẫu nhiên khi chở khách, vẫn ẩn khỏi danh sách mục tiêu).
  - Nhiệm vụ phụ (dấu ! ? xanh dương, kiếm thêm tiền / đồ — khác chính tuyến dấu vàng): HOÃN, tập trung làm xong cốt truyện trước.
    Đã phác cách làm: dùng chung bộ chạy bước của cốt truyện, chạy song song, tiến độ riêng từng người, phần thưởng ghi trong dữ liệu (máy chủ kiểm tra được).
- Ghi chú cũ (để đối chiếu):
- Quan trọng: 2 đơn hướng dẫn chương 1 vẫn tính trễ hạn (2★, 3★ → sao 4.58 ngay ngày đầu) dù thẻ đơn ghi "không hết hạn"; thông báo nhận đơn lại ghi "Hạn: 56 phút".
- Quan trọng: đoạn bị rượt rơi vào cuối ngày → thể lực thấp (<8 không chạy được Shift, <15 đi chậm) → gần như chắc chắn bị tóm. Đề xuất: lúc bị rượt cho chạy bất kể thể lực (hoặc hồi thể lực).
- Quan trọng: xe hãng bị cẩu mà không đủ tiền chuộc → không lấy được xe đạp cũ trong hầm (lấy xe hầm đòi xe đang dùng dựng trong hầm) → không có xe đi sân bay.
- Quan trọng: tinh thần về 0 trong chương (thức khuya) → nằm 6 tiếng → lỡ mốc giờ (khai mạc 10h dời sang hôm sau).
- Tiền nhà tăng mỗi kỳ (balance rentStep 200: 200k → 400k → 600k) trong khi chương 3/4 chặn đơn thường; chạy đơn cả sáng ngày 5 thì vẫn đủ 400k.
- Thoại / chữ: chú bảo vệ (c2 guardAsk) 3 câu chọn dùng chung 1 câu đáp "…Nói chuyện bố láo thế?" · story.c3.call.a2 trống (bong bóng anh Đạt rỗng) ·
  "Phần cơm chay Chú Hai" (goods.json, nên là Dượng Hai) · app Xe "Xe GoShip cấp khi vào hãng" · tin Dì Hai "GribBike" ≠ nút "GripBike" ·
  chị nhân viên sân bay "3 bức" (giờ 2 bức) · tin chị Nhi "bấm vô là chỉ đường 👇" nhưng loc rỗng (không có nút 📍) · thẻ đơn giao bún ghi "Cuốc chở thử" ·
  hướng dẫn "Bấm Mặc" nhưng nút là "Gắn vào" · pack.help thiếu 🔥 trước "Nóng" · goal sleep1 "Chiều mai 5h" khi đã qua ngày · người đi đường nói "Trời nắng quá" lúc 20h ·
  lời khách "đồ còn hư" khi hàng 100% · anh Đạt tự giới thiệu rồi tên bong bóng vẫn "Người đàn ông chạy xe moto" · người đưa hoa ở chợ là "Cô Tư bán cá".
- Giao diện: trong chương, bước không có mục tiêu thì góc phải hiện "• Bấm Tab → Bật nhận đơn" (dù đang chặn đơn) · nhiệm vụ phụ trả ví không hiện trong danh sách ·
  thanh "Đi đến …" vẫn hiện khi đã đứng tại chỗ (10–20 m) · dấu ! trên thùng rác đã thu nhỏ · E "Lên phòng" bị "Lấy xe đạp cũ ra chạy" giành khi đứng sát xe để dành ·
  nhắc phạt đậu xe hiện cả khi đi xe đạp (luật xe đạp không phạt).
- Cốt truyện: câu chờ E ở bước diveThoi ("Xong rồi, đi về thôi") treo suốt đoạn bám theo, chiếm nút E (phải bấm qua mới núp được) ·
  chỗ làm lại khi bị phát hiện [-3, -176] nằm giữa đường (xe bóp còi) · bong bóng "sau … giây" tính giờ thật, cảnh phim tính giờ game.

### 🗑️ Chương 4: ghé Triangle K · núp thùng rác · bị rượt phải lên xe (18/10 — XONG, đã đẩy lên GitHub 7c0f470; phác họa duyệt: sketches/trianglek/storyboard.png)
- Đường về: "Ghé Triangle K mua chai nước" (dichvu1_5, khối 5,1 lô f8, đối diện hẻm) → tới cửa (không bắt mua) → 🎬 cảnh phim ngang tầm mắt (máy quay đặt cố định trước cửa tiệm, cao 1,6 m —
  không dùng "mắt người chơi" vì cây ngay trước cửa che khuất) → anh tờ rơi + cậu SV nói qua lại 5 câu (3 câu cũ dời từ lúc bám theo + 2 câu mới) → "Hỏi nhiều quá… Đi lẹ đi!" → tắt cảnh phim, 2 người đi vô hẻm luôn.
  Chỗ đứng nói chuyện dời xuống [-7.6, -173.6] (cây ở miệng hẻm che), thêm làm điểm đầu lộ trình bám theo.
- Thùng rác (đạo cụ bin) chặn đường thật (lưới va chạm, SpatialGrid.remove khi dọn) · đứng sát bấm E "Núp sau thùng rác" → ngồi thụp (Walker.crouch), người kia ngoái lại không thấy,
  E / bấm đi → đứng dậy. Editor: ô "Núp được (E)" của thùng rác.
- Bị rượt: "Chỉ thoát bằng xe" (bikeOnly) — lên xe thì bọn kia đuối (80% tốc độ), xe chạy được 45 (quãng đường) thì biến mất (tính quãng xe chạy vì xe đạp chỉ nhanh ngang người chạy bộ).
  "Bị tóm = thua" (fail): màn "Bị tụi nó tóm rồi…" + nút ↻ Chơi lại (E / Enter cũng được) → chơi lại từ lúc vấp lon, xe để nguyên chỗ đậu. Mục tiêu bước này chỉ tới xe.
- Nhạc mới music.flee (bước trip + flee), chưa gắn file → tạm phát music.chase (MUSIC_FALLBACK trong soundSpec.js). Tiếng mới city.caught (màn thua).
- Bong bóng cốt truyện đè nhau (2 người đứng sát) → câu cũ tự đẩy lên trên câu mới (ui/bubbles.js) — có tác dụng cho mọi cảnh.

### 🖼️ Chương 4 "Bức tranh dang dở" (17/10 — XONG, đã đẩy lên GitHub 23ab10c; chủ game tự sửa lời thoại trong ?editor)
- Luồng (story.json c4, 51 bước): chiều tối chị Linh nhắn (sáng mốt khai mạc, chiều mai 5h qua sân bay) → ngủ → 17h Sân bay: tên chương + xếp 3 bức tranh dễ vỡ
  (trễ 18h → quay lại hôm sau) → trường: chị Nhi nhận tranh, anh Hoàng chê (chọn 3 câu) → ⬛ "2 tiếng sau…" (tua giờ thật như ngủ) → chị Nhi đưa thiệp →
  anh Đại (sạp Trái Cây Ba Miền, NPC địa điểm) → em Minh (đứng trước Nhà Sách) → Lan Anh (trước tiệm thú cưng) → về trọ ngang khối 4,1: anh phát tờ rơi dắt
  cậu sinh viên (dáng người lạ mới "student": áo thun, quần jean, balo) vào hẻm → 🕵️ bám theo lén → nghe lỏm đại ca ("thằng đó dạo này đánh hơi tụi mình… mai dọn cho gọn") → vấp lon, 🏃 2 đàn em rượt (người chơi TỰ chạy, không cảnh phim — chủ game chốt 17/10; bị tóm → làm lại từ chỗ núp; thoát = lên xe chạy / bỏ xa) → chạy về trọ →
  nhắn anh Đạt (3 câu) → "Hẹn em ngày mai :)" → ngủ → 8h triển lãm trong sân trường (giá tranh, khách, người quen nói "idle"; anh Đại câu 2 kể xe hơi đen) →
  8h30 chị Linh nhờ lấy hoa (Chợ Hòa Bình) + bánh (Tiệm Bánh Hạnh Phúc) trước 9h50 (kịp / trễ = 2 câu khác nhau, không thua) → 10h 🎬 khai mạc →
  ⬛ "30 phút trước…" → 🎬 anh Đạt (bó hoa buộc trên đuôi xe — chase.carry "bouquet") chạy lên trường bị 3 ô tô đen ép (📱 Linh đang gọi…) → ⬛ "Gần trưa…" (tua tới 11h) → chở chị Linh về (dọc đường gọi anh Đạt:
  thuê bao) → tiệm trà → nhắn anh Đạt (3 câu) → không ai đọc ("Đã gửi") → hết chương.
- Hẻm mới khối 4,1: kiểu `snake` (ngoằn ngoèo ~99 m, cụt, hẻm đi bộ 2 m, nhà mặt phố mỏng 5 m), miệng hẻm quay ra đường dọc x ≈ 0; Lẩu Dê Bảy Hiền dời lô f14 (sát miệng hẻm).
- Việc mới (có ở ?editor): 🕵️ Bám theo lén (sneak + điều kiện sneaked) · 🏃 Bị rượt (pursue + điều kiện escaped: chạy theo dấu chân người chơi) · ⬛ Màn đen tua giờ (fade.skip / skipTo, dọn đạo cụ chọn lẻ) · 🚧 Giữ vùng vắng xe (traffic) ·
  Cảnh phim: người chơi tự chạy bộ (playerRun, runSpeed, runDelay, bikeAt) · Người lạ đứng đúng tọa độ (spot "at") · câu "idle" nhiều câu · bước chỉ chạy trước / từ giờ
  (onlyBefore / onlyAfter) · bong bóng / tiếng "sau … giây" (after) · đạo cụ giá vẽ / thùng rác / lon. App Tin nhắn: "Đã gửi" dưới tin cuối của mình (cách A, đã duyệt phác họa).
- Dáng người lạ "jetjet" giờ cố định theo người (không đổi theo ngày) — anh phát tờ rơi chương 1 gặp lại vẫn y vậy (tên cướp chương 3 cũng đổi mặt theo).
- Âm thanh mới chờ gắn file: city.applause, city.canKick, city.sneakCaught, city.caught, music.flee.
- Sửa 17/10 tối: ô "Giao gói hàng" trong ?editor chọn được nhiều gói (trước chỉ 1 → giao 3 bức tranh hiện thành "Hũ chao" — lỗi hiển thị editor, game vẫn đúng).
- Còn để ý: lấy hoa + bánh 8h30 → 9h50 ≈ 80 giây thật, đường đi ~530 đơn vị — xe máy kịp, xe đạp dễ trễ (trễ chỉ đổi câu thoại). Bám theo lén núp kỹ ~85 giây.

### 🤼 Chương 3 — cuối chương: bắt cướp → công an → làm quen anh Đạt (17/10 — XONG, đã đẩy lên GitHub 247f977; phác họa duyệt: sketches/canh-bat-cuop/storyboard.jpg)
- Chủ game chốt: cách 1 (anh Đạt vật ngã) + nút E · công an kiểu gọn (xe tới → màn đen "Ít phút sau…") · không cần nút lưu danh bạ, chỉ tự nhắn qua
  (chữ tin nhắn chủ game sửa sau — khóa story.c3.dat.m1) · không cài câu móc · đổi tên "Người đàn ông chạy xe moto" → **Đạt** trong sơ đồ quan hệ (giữ tên cũ).
- Luồng (story.json chương 3, sau bigChase): arrive2 (tới gần tên cướp) → catch (tên cướp vùng chạy về phía người chơi, nút "E — Chặn lại!" 2 giây;
  bấm kịp: dang tay chặn · trễ: nó lách qua; anh Đạt vẫn quật xuống — quay chậm, ghì nằm sấp) → callPolice (chọn 3 câu) → callAns → call113 (điện thoại lên tai)
  → police (xe CẢNH SÁT hú còi `city.siren` chạy tới góc ngã tư, 2 anh công an đi tới tên cướp) → copSay → later (màn đen; dọn tên cướp + đạo cụ, anh Đạt đứng
  dậy trước mặt) → helmetOff → hi (vẫy tay) → who / whoAns → realize / realizeAns → name ("Anh tên Đạt…") → rideOff (đội nón, lên xe, nẹt pô, chạy đúng làn phải)
  → datMsg (tin nhắn từ "Anh Đạt" — danh bạ mã `man`, 3 câu trả lời) → done (hết chương 3).
- Việc mới (dùng lại được, có ở ?editor): 🤼 Vật ngã (tackle) + điều kiện "Vật ngã xong" (tackled) · ⬛ Màn đen (fade) · Đội nón lại (helmetOn) · Vẫy tay (wave)
  · Lên xe chạy đi (rideOff) · Người chơi gọi điện (phoneCall) · đạo cụ 🚓 xe công an (prop police: cops, copsTo; bong bóng "Ai nói" → prop:<mã>).
  Từ lúc vật ngã tới lúc anh Đạt chạy đi: giữ vùng 55 m quanh đó không có xe NPC (traffic.holdNear kiểu vùng) — chỉ máy mình.
- Xe anh Đạt (supersport) làm lại: vỏ "nặn" thon (models.js loftGeo), đèn đôi xếch, kính chắn gió, gương trên đầu xe, mảng xanh kiểu Ninja, mâm 3 chấu kép
  (so sánh: sketches/xe-dat/so-sanh.jpg). Dùng chung chương 2 + 3, chỗ ngồi / tay lái giữ nguyên.
- Âm thanh mới CHỜ gắn file: `city.siren` (còi hú — tạm tiếng tổng hợp), `city.tackle` (vật ngã), `city.qte` (nút bấm hiện).
- Còn để ý: dáng ghì / quỳ đặt bằng tay (không có hoạt cảnh mẫu) — thấy cứng thì chỉnh ở game/scene.js tackleTick.
- Còn để ý: xe NPC ở khu bến cảng vẫn chạy (để 2 xe có cái mà né) nên đôi khi chắn ống kính; mở lại game giữa cảnh phim → bỏ qua cảnh, anh mô tô + tên cướp đặt ở cuối đường.

### 🗣️ Xưng hô "anh/chị" theo giới tính người chơi (16/10 — XONG)
- Ô Tự xưng / Gọi là trên dây trong ?relationship gõ `anh/chị` (hoặc `chị/anh`) → người chơi nam thành "anh", nữ thành "chị".
  Dùng cho: NPC gọi người chơi (Gọi là) + người chơi tự xưng (Tự xưng). sim/people.js isAnhChi / anhChiOf, data/relations.js voiceOfChar.
- ✅ Kiểm tra: ô có `{…}` → lỗi; "anh/chị" trên dây giữa 2 NPC hoặc ở ô nói về NPC → cảnh báo.
- Dây Người chơi ↔ Em Minh: đã điền anh/chị vào 2 ô trống (người chơi tự xưng, Em Minh gọi người chơi).

### 👵 Tuổi + vóc dáng cho ngoại hình (16/10 — XONG, chờ chủ game xem)
- Ô mới ở `?editor` → Địa điểm & NPC (NPC đứng ở cửa) và `?relationship` → 👕 Ngoại hình (nhân vật có ngoại hình riêng):
  - **Vóc dáng**: Vừa · Gầy · Đầy đặn · Mập (`build`: thin/chubby/fat) — nở ngang thân + tay chân, đầu giữ nguyên; người mập tay dang ra hơn.
  - **Tuổi**: Bình thường · Lớn tuổi (~60, lưng trên hơi cong, đầu đưa ra trước) · Cao tuổi (còng hơn) (`age`: old/elder). Không chống gậy.
  - Danh sách: `sim/people.js` LOOK_AGES / LOOK_BUILDS · hình: `world/person.js` (BUILD_W, bend) + `world/models.js` (AGE_BEND, AGE_HUNCH) · kiểm: validate.js.
- Dì Hai + Dượng Hai: `age: old`, tóc bạc #8d8d8d; Dì Hai đổi tóc mái bằng → búi. Chủ game đổi lại được trong ?editor.
- Lưu ý: hồ sơ trong sơ đồ quan hệ vẫn ghi Dì Hai 55 tuổi, Dượng Hai 58 tuổi → chủ game sửa thành 60+ nếu muốn khớp.
- Không có ở màn tạo nhân vật của người chơi (chủ game chọn chỉ làm trong công cụ).
- Luật ngoại hình (16/10, chủ game chốt): nhân vật gắn NPC địa điểm → game LUÔN dùng hình NPC (places.json), kể cả khi ra cảnh cốt truyện / lên xe;
  ngoại hình riêng chỉ dùng cho nhân vật không gắn địa điểm (vd người đàn ông chạy moto). game.js storyActorLook + storyHelmetLook.

### 🧪 Chơi thử chương 1 như người chơi (16/10) — đã sửa theo ý chủ game
- **Từ nay mọi lời thoại cốt truyện là bong bóng** (chủ game chốt): nói chuyện ở địa điểm (talk), việc "say", câu "nhắn mẹ chưa?" →
  bong bóng trên đầu NPC (game.storyConverse: bấm E "Nghe tiếp" qua câu, câu "ok" = người chơi đáp; đứng yên + camera xích lại; dấu !/? ẩn khi đang nói).
  CÒN dạng bảng (là menu chọn, không phải lời thoại): mua bán, trả tiền nhà, CSGT phạt, hãng… — hỏi chủ game nếu muốn đổi.
- Đã sửa: ô phím trang giới thiệu đọc được + mục 🎮 Điều khiển (menu chính + Esc) · khoảng cách mục tiêu theo đường đi thật, dưới 1 km ghi mét
  · bảng "Mục tiêu hôm nay" không lặp mục tiêu cốt truyện · biển trạm xe buýt / bảng tên NPC mờ khi camera sát hoặc chắn trước người chơi
  · thông báo tối đa 2 cái một lúc (còn lại xếp hàng), màn ≤ 1100px lên giữa phía trên · màn tạo nhân vật: hàng nút Quay lại / Tiếp bám đáy
  · bảng nhắc Shift chỉ tới Esc → 🎮 Điều khiển · xếp túi cốt truyện phải đúng luật mới đi; đơn hàng thường xếp sai phải bấm 2 lần ("Vẫn đi…")
  · đứng yên > 0,6 giây: camera né cả cột điện / cây / biển (CAM_BLOCK_STILL).
- Chủ game: đi bộ xa đầu game "không sao" (giữ nguyên).
- (16/10) Đơn hướng dẫn cố định: đơn đầu = giao bún mọc ở **Bún Mọc Cô Yến** (bước firstOrder: offer kind food place bunmoc, không sự cố,
  không xét giờ mở cửa; swFood + firstOrder chặn đơn ngẫu nhiên) · cuốc chở thử: khách người lớn bình thường (OrderManager.plainName).
  Nút E trên bong bóng cốt truyện cố định ở góc phải dưới.
- (16/10 khuya) Không còn bong bóng người chơi tự đáp cuối cuộc nói chuyện (talk.ok không dùng nữa; câu cuối nút E = "Xong").
  · Xếp túi: lúc hướng dẫn bấm Xoay, ô món đang xoay trong túi cũng sáng (spotlight `also`, không khung).
  · Còn tin chưa đọc mà máy cất → hình điện thoại nhỏ rung lại mỗi ~4 giây (chỉ rung hình).
  · Khách xe ôm dễ chịu hơn 20% (driving.rider*: 2,88 / 4,8 / 2,4 / 0,29 / 14,4). Sim 20×6 ngày: sao +0,02–0,09, normal qua ngày 6: 60% → 80%.
  · Cuốc chở thử là **Cô Hằng**; thêm bước rideDone (chở tới nơi) → CSGT → hết chương 1. Bảng mục tiêu: hết chương 1 mới có "Giao 10 đơn".
- (16/10 tối) Nói chuyện: khóa camera (không xoay / phóng) · Cô Hai đã gặp rồi mà chưa tới lượt nói → câu `story.coHaiLater` (không hỏi lại "Ủa con tới rồi hả?")
  · đã nói xong / đang xếp túi thì không hiện lại nút nói chuyện của cốt truyện · bảng "Mục tiêu hôm nay" bỏ mục trả tiền nhà (bảng trống thì ẩn).
- Chưa chơi tới: chạy tới quán Chú Hai → 2 hãng → xăng → đơn đầu → CSGT (đường xa, cần chơi tay).

### 📖 Chương 2 "Bạn mới ở thành phố" (16/10 — XONG bản đầu, lời thoại nháp, chủ game tự sửa sau)
- Luồng: hết chương 1 → giao thêm 10 đơn (đếm dồn, qua ngày không mất; bảng mục tiêu "Giao 10 đơn (n/10)") → 🛏️ nghỉ ngơi qua ngày mới
  (điều kiện newDay; ngày mới bắt đầu 6:00) → ngày đó từ 17h30 →
  chú Hai nhắn → đọc tin mới hiện tên chương → lấy hộp cơm chay (xếp túi) → Tiệm Trà A Di Đà ĐÓNG (tới hết chương 2) →
  sư cô (!) nói + 3 câu → "Chị Linh đâu rồi?" → bảo vệ: bấm E mở lời (3 câu) → 3 câu → vòng tím quanh trường → chị Linh + người đàn ông
  (sau trường, đối diện Đồ Chơi Bé Yêu, mô tô xịn) → hỏi (3 câu, dấu ? giật mình 2 người) → 3 câu → thoại qua lại → anh ta đội full-face lên mô tô đi
  → "Chở chị Linh về" (chị tự đội mũ, không qua app) → về tiệm đưa cơm → chị Linh nhắn số → hết chương 2 (tiệm trà mở lại).
- Máy mới: địa điểm **"Mở từ chương"** (places.json → openChapter; thay "mở từ ngày" của địa điểm — món ăn vẫn "có đơn từ ngày"):
  tiệm trà = 3 (đóng tới hết chương 2), chùa = 2 (chương 1 không có đơn ở chùa). Chưa mở: "🔒 Đóng cửa", không đơn, NPC ẩn, mờ trên bản đồ.
- Cốt truyện có thêm: điều kiện ordersSince / clock / bring · việc board / alight / drop · người nói 'place:<mã>' (NPC địa điểm) ·
  choose.ask (bấm E mới hiện câu) + choose.react (dấu ? giật mình) · actor spot 'place' (dist / lat / faceTo / vehicle moto) ·
  zone (vòng tím) · talkLabel (chữ nút E) · mark nhiều dấu (mảng). Camera nói chuyện canh cả nhóm (2 người) — TALK_CAM_GROUP.
- Thoại tuần tự (16/10): mỗi lúc chỉ 1 bong bóng chờ E — câu người chơi chọn giữ tới khi bấm E rồi người kia mới đáp; câu thoại / bảng chọn câu mới
  xếp hàng (storyQueue) tới khi bấm E. Bán kính trong thẻ Cốt truyện tính theo đơn vị bản đồ (1 ≈ 10 m trên màn hình, cột sáng vàng ≈ 1).
- (16/10) Chương 2: chị Linh + người đàn ông dùng dáng "Theo sơ đồ quan hệ" (man → bộ thuongNgay; lên mô tô tự mặc bộ có mũ bảo hiểm — "Đi mô tô";
  chị Linh chưa có bộ riêng → lấy hình NPC tiệm trà, ngồi sau xe đội mũ hồng). Hàm game.storyHelmetLook.
- Cheat (?cheat → 📖 Cốt truyện): ✅ Xong mục tiêu này (×5) — làm luôn phần đi kèm (nhận gói hàng, chọn câu đầu, đọc tin…) · ⏩ Nhảy tới bước bất kỳ · bảng soi ghi chương / bước / điểm tính cách.
- Bản lưu đã xong chương 1 từ hồi chưa có chương 2 (story.ch = null) → mở game tự vào chương 2 (resumeNewChapters).
- CHƯA làm: mở lại game giữa lúc đang chở chị Linh → chị đứng lại ở sau trường (phải quay lại đón).

### 📖 Cốt truyện chơi một mình (14/10 — chương 1 XONG, chờ chủ game chơi thử; chương 2+ chủ game tự viết)
- Hướng truyện (chủ game chốt): sinh viên nghèo lên thành phố học + chạy shipper → dính đường dây tội phạm → làm đặc tình phối hợp công an.
  Gợi ý đã đưa (chưa chốt): đường dây trộm xe + lừa đảo qua app; 5 chương; nhiều kết. Mầm chương 2: **tờ rơi "Việc nhẹ lương cao"** (anh Tâm) nằm trong túi đồ.
- **Bộ chạy cốt truyện bằng dữ liệu**: `src/data/story.json` (thẻ **📖 Cốt truyện** trong ?editor) + `src/sim/story.js` (thuần, có bộ thử)
  + game.js (runStoryActions, storyGoal, storyGuide). Chữ ở vi.json khóa `story.*` (gõ ngay trong thẻ Cốt truyện).
  - Bước: delay (phút game) → on (việc: title, say, msg + định vị, replies 3 câu, item, bike, give, toast, end) → until (none, wait, read, reply,
    arrive, talk, mount, brand, wear, switch) · talk (nút E riêng ở địa điểm: pack = xếp gói hàng vào túi, drop = giao, give = tặng đồ)
    · goal / hint / target (mũi tên) · guide (làm sáng nút trên điện thoại: thread, route, reply, wear, switch).
  - Tiến độ lưu trong save (GameState.story). Chơi mới → chương 1 bắt đầu sau màn "tới thành phố"; bản lưu cũ coi như đã xong.
  - Bước "bấm 📍 Chỉ đường": chưa bấm thì chưa có mũi tên. (Nút "Bỏ qua hướng dẫn" đã bỏ 15/10.)
  - **Người lạ trong cảnh (15/10)**: việc `actor` (hiện người lạ — dáng jetjet / bình thường; chỗ đứng `xeOm` = gốc cây kế chú xe ôm ở địa điểm …,
    cố định, mở lại game vẫn dựng lại · hoặc `near` = chếch trước người chơi, không dựng lại), câu `call` (có dấu ! thì ~6 giây gọi 1 lần),
    câu `idle` (bấm E lúc hết chuyện) · `remove` (biến mất) · `approach` / `leave` (đi tới / chạy mất — hiện chưa dùng) · `bubble` (+ `hold` giữ tới câu sau).
    Điều kiện `talkActor` = người chơi đứng gần bấm E (mỗi E một câu). Bước có `leash` {place, r, text}: chưa xong thì bị giữ trong vùng + nhắc.
    Mũi tên mục tiêu tới người lạ: target `actor:<mã>`. Người lạ chỉ máy mình thấy.
    Bong bóng cốt truyện (16/10): viền vàng + tên người nói + chữ hiện dần kèm tiếng `ui.talk` (E lúc chữ đang chạy = hiện hết) + dấu [E] nhấp nháy;
    đang nói chuyện thì người chơi quay mặt + camera xích lại nhìn qua vai (không khóa điều khiển, không dừng giờ). Việc `choose` (2–3 câu trả lời trên đầu,
    phím 1/2/3, người lạ đáp theo câu chọn) + điều kiện `chosen`; lựa chọn lưu ở `story.picks` (chương sau rẽ nhánh — CHƯA có điều kiện đọc picks).
    Người lạ ở bước đầu chương đứng sẵn từ lúc vào game (actorsPresent).
  - **Tính cách → kết cục (16/10)**: 3 tính cách good (Công dân gương mẫu → kết vui) · neutral (trung lập → kết bình thường) · bad (xấu tính → kết xấu, tha hóa).
    Mỗi câu trả lời — chọn câu ngoài thế giới (choose.gains) lẫn trả lời nhanh trong tin nhắn (replies.gains) — cộng điểm vào `story.traits` (lưu trong save, mỗi lựa chọn tính 1 lần); người chơi không thấy số, chỉ thông báo "😇 Gương mẫu ↑".
    `leaning(story)`: nhiều điểm nhất thắng, bằng nhau → trung lập. Bước có `onlyTrait` chỉ chạy khi đang nghiêng về tính cách đó (nội dung riêng).
    **CHƯA làm**: màn kết cục cuối game (xét leaning) + nội dung độc quyền cụ thể — chủ game viết khi tới.
    Câu anh phát tờ rơi: o1 → xấu tính +1, o2 → trung lập +1, o3 → gương mẫu +1 (gợi ý, chủ game đổi được).
    Bong bóng cốt truyện được ưu tiên: bong bóng người đi đường chồng lên thì tạm ẩn.
- **Chương 1 "Cuộc sống mới, công việc mới"** (23 bước, sửa theo ý chủ game 14/10 tối): tên chương chữ to tự mờ dần (~5 giây, cảnh game tối hẳn rồi sáng lại) → mờ hết mới tới anh phát tờ rơi
  (16/10 bản 3: anh jetjet đứng sẵn ở gốc cây kế chú xe ôm từ lúc vào game; tên chương mờ hết + 1 giây mới có dấu ! + gọi "Ê nhóc!"; người chơi lại bấm E từng câu
  (2 câu, nhận tờ rơi) → E → chọn 1 trong 3 câu trả lời (anh ta đáp theo câu chọn, lưu picks.flyerAsk) → E → "???" trên đầu người chơi → Mẹ nhắn. Chưa nói xong mà đi quá 30 m khỏi bến xe → bị giữ lại + "Có người kêu kìa…".
  Anh ta vẫn đứng đó (E → "Nhớ gọi anh!") tới khi người chơi tới nhà Cô Hai thì biến mất. Chờ chủ game chơi thử đoạn này)
  → Mẹ nhắn tin 1, làm sáng dòng mục tiêu "Điện thoại rung" (chỉ cho bấm Tab) → mở tin của Mẹ rồi mới tính 5 giây ra tin 2, 5 giây ra định vị nhà Cô Hai
  → bấm 📍: điện thoại tự cất → làm sáng bản đồ tròn (tự tắt sau 2 giây) → bảng nhắc "Giữ Shift chạy nhanh" (bấm ra ngoài / 2 giây)
  → tới nhà, Cô Hai dấu **!** → chào lần 1, Cô Hai nhắc nhắn mẹ → điện thoại tự bật vào tin của Mẹ (không hướng dẫn), người chơi tự trả lời
  → dấu đổi **?** → nói chuyện lần 2: xe đạp, xếp **hũ chao**, Cô Hai nhắn định vị quán Chú Hai → bấm 📍 → leo xe → giao cho Chú Hai (`dichvu4`,
  tặng **phần cơm chay**) → hướng dẫn mở túi, Dùng cơm chay → Cô Hai nhắn từng tin (5 giây) → trả lời → Cô Hai gửi định vị 2 hãng → ký hợp đồng
  (chỉ nhận tin chào mừng của hãng) → mặc đồng phục + mũ → bật Giao hàng → bật Chở khách → hoàn thành, lưu game.
  - Sửa sau khi tự chơi thử (14/10 khuya): câu hỏi "có muốn chạy thử" không còn hướng dẫn (tự trả lời); lúc gửi 2 hãng làm sáng đúng tin 2 văn phòng;
    mục tiêu chỉ hiện khi tin nhắn của bước đã tới; mũi tên còn sau khi tới nơi (đã bấm 📍 1 lần là nhớ); điện thoại đang cất mà tới bước mặc đồ / ăn /
    bật công tắc → sáng dòng mục tiêu (cho bấm I / Tab); chờ nói chuyện theo truyện thì không hiện nút E thường của nơi đó; tự đi tới nơi trước khi
    bấm 📍 cũng tính (≤ 15 m, không bị kẹt); vào hãng → xe hãng dựng trước văn phòng, tính giờ đậu lại (trước đây có thể bị cẩu ngay vì xe đạp
    để ngoài đường lâu).
  - Bấm 📍 quán Dượng Hai: điện thoại tự cất như lần đầu (bước "mount" có việc closePhone — chủ game chốt 16/10).
  - Sửa 15/10: hướng dẫn Shift = làm sáng dòng phím dưới cùng (bỏ bảng nhắc giữa màn hình — bị màn đen); xe đạp dựng sẵn trong hầm từ đầu;
    dấu ! giữ tới khi Mẹ trả lời xong mới thành ?; Cô Hai gửi 2 món (hũ chao dễ vỡ + bịch tàu hũ món nước) — màn xếp túi có hướng dẫn
    chọn món → bấm ô → xoay → xếp xong (game.packGuide); Chú Hai tặng 2 phần cơm chay; ăn xong giải thích thanh Thể lực → Tinh thần → Xe
    (bấm để sang / tự sang sau 4 giây); emoji mới (Windows 10 hiện ô vuông) đổi sang emoji cũ + editor cảnh báo (validate.tooNewEmoji);
    lưu game lúc bắt đầu / kết thúc chương kèm chỗ đứng + chỗ xe (mở lại đứng đúng chỗ).
  - **Đợt 15/10 (đã làm, chờ chủ game chơi thử)**:
    - **Hình điện thoại cạnh bản đồ tròn** (phác thảo `sketches/phone-icon.png` đã duyệt): yên · tin mới (rung 3 cái, chấm đỏ đếm tin chưa đọc,
      bong bóng xem trước 3 giây thay cho thông báo trên đầu màn hình) · đơn mời (đổ chuông liên tục, tiếng lặp mỗi 3 giây, vạch vàng = thời gian
      còn) · cuốc cốt truyện (không vạch giờ). Bấm vào = Tab. Màn hình ≤ 1100px: hình nằm trên bản đồ. **Có đơn KHÔNG tự bật máy nữa.**
    - Hướng dẫn "bấm Tab" giờ làm sáng hình điện thoại ("Bấm Tab (hoặc bấm vào điện thoại)"); đang hướng dẫn thì thả con trỏ chuột.
    - Hướng dẫn chữ (bản đồ tròn, Shift, 3 thanh chỉ số, xăng, hồ sơ, CSGT) có nút **Tiếp ▸ / Đã rõ** (hoặc Enter / Space) — bỏ tự tắt 2 giây,
      bỏ "bấm ra ngoài". **Bỏ nút "Bỏ qua hướng dẫn".**
    - Chương 1 nối dài sau khi mặc đồ: giải thích thanh xăng / pin (chữ riêng theo xe xăng / điện) → app Xe 📍 cây xăng / trụ sạc gần nhất
      → nạp đầy (≥ 90%; xe hãng giao còn 15%) → bật Giao hàng → nhận + giao đơn đầu (hướng dẫn bấm Nhận) → Hồ sơ tài xế + luật thua
      (dưới 4.0 sao khóa app · trễ tiền phòng 2 kỳ liền mất phòng) → bật Chở khách → **cuốc chở thử** (khách gần mình, không hết hạn, nút Bỏ qua
      khóa) → đón khách → app CSGT tự mở giải thích phạt nguội → Đã rõ → hết chương. Từ bước Hồ sơ tới hết: app không phát đơn thường (`hold`).
    - **App 📷 Máy ảnh** (phím 9, không ẩn được): 3 ô ảnh = 3 bản lưu (ảnh nhỏ + ngày giờ + tên đường), chụp đè / quay lại đều hỏi trước;
      không chụp được khi có đơn, đang ngồi trên xe, đi phà, đang dở hội thoại. Ảnh mới nhất cũng là "Tiếp tục" ở màn hình chính.
    - **Bỏ tự lưu cũ** (06:00, ngủ dậy, chợp mắt, ngất, nút 💾 ở Cô Hai). Lưu chỉ còn: bắt đầu / kết thúc chương + Máy ảnh.
      "Thử lại" khi thua = bản lưu gần nhất.
    - Bộ chạy thêm: điều kiện `fuel` (xăng / pin ≥ …%), `order` (mốc: có đơn mời / đã nhận / đã đón – lấy hàng / đã giao); việc `offer`
      (cuốc chở thử: OrderManager.storyRide + forceOffer), `fuel` (đặt % xăng), openPhone mở app bất kỳ; hướng dẫn `fuel`, `order`, `profile`;
      ô bước `hold` (chặn đơn thường); nút hướng dẫn `btn: next | ok`; chữ có bản riêng theo xe: khóa + `.gas` / `.electric`.
    - Chưa làm: màn hình chính chưa có chỗ xem album (vào game rồi mở app Máy ảnh mới quay lại ảnh cũ được).
  - Kiểu mới trong bộ chạy: điều kiện open (đang mở tin của …), routed (đã bấm 📍 tới …), ack (bấm tắt hướng dẫn / hết … phút), use (đã dùng món …);
    việc openPhone / closePhone; hướng dẫn minimap, hint (bảng nhắc không làm tối), use; `mark` = dấu ! / ? trên đầu NPC theo bước.
- Đi kèm: app **Tin nhắn** kiểu điện thoại thật (danh sách → cuộc trò chuyện, nút 📍 Chỉ đường, trả lời nhanh, lưu trong save — GameState.inbox);
  **Hồ sơ tài xế** gộp vào app nhận đơn (nút 👤), app Hồ sơ riêng ẩn (phone.json); vào hãng được **tặng túi cơ bản** (apps.json brands.*.bag,
  thẻ App & Đơn → Hãng); đang theo cốt truyện thì vào hãng KHÔNG tự mặc đồng phục / mũ (bước "mặc đồ" hướng dẫn).
- Chơi nhiều người: cốt truyện + tin nhắn là của riêng từng người (save của mình), không dừng / tua đồng hồ chung.
- Giao diện cố định cỡ (14/10 tối): ô trang bị bảng "Đang mặc" 90×56 (chữ dài cắt …), khung chi tiết món trong túi cao 132px,
  dòng mục tiêu giữa trên màn hình rộng cố định; nút "👤 Hồ sơ" trong app nhận đơn có chữ.
- Chưa làm: chương 2 trở đi; thử kỹ trên Chrome thật (đã chạy hết chương 1 bằng ?debug trong trình duyệt của Claude).

### 🧍 Đổi kiểu người sang "low-poly mượt" (14/10 — đã duyệt 4 đợt; P1 xong, CHỜ chủ game xem)
- Mẫu chủ game chốt: `src/devtools/personSample.js` (trình xem thử, game không dùng). Khung khớp giữ nguyên → mọi dáng / tư thế / tay nắm lái dùng lại.
- **P1 (xong)** `src/world/person.js` (buildPerson) — `models.makePerson` giữ nguyên tham số, gọi sang file mới; kiểu cũ còn trong `makePersonClassic`,
  xem lại bằng `?nguoicu` (để so / làm bản "người đơn giản" ở P4). Thân 10 cạnh, tay chân 8 cạnh; ~2.200 tam giác / người (cũ ~1.000),
  đo trong game: vẽ người ~2,7 ms / khung (cũ ~2,6 ms).
  - 16 kiểu tóc (`sim/people.js` HAIR_BY_GENDER): nam ngắn vuốt lệch · rẽ ngôi 7/3 · two block · mái ngố · húi cua · xoăn ngắn · dài buộc sau · trọc;
    nữ dài thẳng · ngang vai · bob · đuôi ngựa · búi cao · hai bím · mái bằng · xoăn dài. Đội mũ bảo hiểm: bỏ phần đỉnh, búi cao → búi thấp.
    Màn tạo nhân vật chỉ hiện kiểu của giới tính đang chọn; bản lưu cũ chọn kiểu giới kia → kiểu gần nhất (`hairFor`). NPC đặt sẵn chọn kiểu nào cũng được (?editor).
  - Tạo nhân vật thêm chọn **áo thun tay ngắn / tay dài + quần short / quần dài + giày đen / trắng** (món có sẵn giá 0: thêm `aoThunDai`, `quanDaiCu`, `giayTrangCu` vào goods.json;
    `goods.startOutfit`). Người đi đường ngẫu nhiên: 55% áo cộc tay, 25% đàn ông quần short.
  - Màn tạo nhân vật (phương án A): bảng rộng 780 px, hình 3D to 300×450 bên trái (nút Toàn thân / Cận mặt), ô chọn bên phải;
    kiểu tóc chọn kiểu lật trang ‹ Kiểu 2/8 › (phím ← →, đổi giới tính → về kiểu 1). Bảng hẹp (< 640 px) tự xếp hình lên trên.
  - Mũ bảo hiểm nửa đầu / fullface, nón lá, mũ công an, kính, khẩu trang, găng, thùng hàng, đồng phục hãng, áo khoác chống nắng, áo mưa: đã dựng lại
    theo đầu / thân mới ở mức dùng được — P2 làm kỹ.
  - Kho đồ: 6 món chọn lúc tạo nhân vật có ô `start` (goods.json, ?editor) → chỉ có món đã chọn; bản lưu cũ có món đầu như trước.
- **Mũ bảo hiểm (14/10, b1)**: thành phụ kiện (tháo / đội trong 🎒 Túi đồ, dừng xe). Lúc đầu KHÔNG có mũ (đi xe đạp đầu trần) —
  hãng cấp mũ khi đăng ký (quà vào hãng, đội luôn); nghỉ hãng trả mũ → còn mũ tự mua thì đội, không thì đầu trần. Mũ ở cửa hàng vẫn mua được.
  Xe máy / xe điện đầu trần: nhắc khi lên xe + dòng đỏ "⛑️ Chưa đội mũ" trên HUD; qua chốt CSGT hoặc gần xe tuần tra → dừng xe phạt
  `ECONOMY.noHelmetFine` (60k, thẻ ⚖️ Cân bằng), cộng dồn với lỗi quá tốc độ / vượt đèn đỏ. Xe đạp thường không bị.
  "Mũ bảo hiểm bể" (muXanh, giá 0) giờ không ai có → ?editor báo cảnh báo; chủ game chọn: đặt giá + nơi bán, hoặc xóa.
  🌐 Đội mũ là của riêng người chơi; máy chủ kiểm tra được (vị trí người chơi so với chốt / tuần tra theo lịch chung). Nộp phạt vẫn tua 15 phút (cần bỏ khi chơi nhiều người).
- **P2 (xong 14/10)**: mũ fullface có phần che cằm + gờ kính + khe gió; khẩu trang nhỏ lại, che kín mũi, có nếp gấp + quai tai; găng ngắn có cổ găng,
  găng ống dài kéo lên tới tay áo cộc (hết lởm chởm ở khuỷu); áo khoác chống nắng / đồng phục dài phủ hông (che thắt lưng) + viền gấu; mũ trùm sau gáy có lòng mũ;
  thùng hàng đeo lưng đổi màu theo đồng phục hãng + ô logo. Áo mưa, mũ nửa đầu, nón lá, mũ công an, kính giữ như P1.
- **P2b (xong 14/10, chủ game: "làm hết cho tôi xem thử")**: 88 món mới (chỉ để mặc đẹp, không tác dụng → npm run sim y hệt trước), bán ở
  Shop Quần Áo (64 món — dài, chủ game có thể chia bớt sang shop khác ở ?editor), Shop Giầy Dép, Shop Phụ Kiện.
  - Áo: polo, sơ mi, sơ mi caro, hoodie, ba lỗ, khoác kéo khóa, khoác jean, khoác da, vest + cà vạt, gile phản quang, bà ba, đá banh số 10,
    đội tuyển sao vàng, thun I ❤ SG, len cổ lọ · nữ: croptop, hai dây, áo dài (có tà trước theo chân / nằm trên đùi khi ngồi xe), đầm.
    Liền bộ: đầm (chân trần), yếm jean, đồ ngủ sọc (quần cùng màu).
  - Quần: jean, quần tây, jogger, túi hộp, 3 sọc, lửng, quần đùi · nữ: ống rộng, legging, chân váy, váy xòe, váy bút chì.
  - Giày: dép lê / quai ngang, xỏ ngón, sandal quai hậu, bata vải cổ cao, giày tây, giày lười, bốt, ủng · nữ: búp bê, cao gót.
  - 3 chỗ đeo mới (phụ kiện, tháo / đeo trong túi đồ): mũ lưỡi trai (đội mũ bảo hiểm thì không thấy), đồng hồ / vòng tay (tay trái), balo / túi đeo chéo.
  - goods.json thêm ô color2 (màu phụ) + gender 'f' (chỉ nữ: cửa hàng ghi "Chỉ dành cho nhân vật nữ", nam không mua / mặc được). ?editor có 2 ô này.
  - Sửa (chủ game xem trang tất cả quần áo): dây áo ba lỗ / hai dây / yếm vắt ngay trên vai (person.js strap); tà áo dài liền thân (taLathe);
    áo mưa thành áo mưa dài tay kiểu áo khoác chống nắng, dài tới mắt cá, có mũ trùm + vạt trước theo chân, ngồi xe thì thu ngắn và phủ lên đùi
    (bỏ áo mưa cánh dơi ở kiểu người mới). Áo khoác chống nắng / áo mưa giờ lấy đúng màu món đang mặc (trước luôn xanh nhạt / xanh dương).
  - Người đi đường / khách / người ngồi quán (cờ casual) mặc ngẫu nhiên các kiểu mới; NPC có đồ riêng (CSGT, ba gác…) giữ nguyên.
- **P3 (xong 14/10)**: đồ gắn thêm của NPC đặc biệt (npcStyles.PROPS) khớp thân mới — balo / cặp có quai vắt vai, khăn quàng đỏ có nút thắt,
  hình xăm ôm đúng phần da tay áo cộc, dây chuyền, áo choàng + bịt mắt, cà vạt áp ngực (ngực nam 0,118 / nữ 0,107 m — parts.female).
  Thay đồ rời bằng đồ có sẵn: jetjet mặc sơ mi caro thật (shirtStyle plaid + jean; bỏ PROPS.plaid + vải caro canvas), khách vội sơ mi + quần tây + giày tây,
  học sinh sơ mi, vé số túi đeo chéo (carry).
  Sửa thêm (chủ game xem): hình xăm thành nét tribal gọn + hoa hồng nhỏ (trước: mảng mực kín tay); áo choàng cong ôm vai, có cổ buộc + khuy;
  cụ ông / cụ bà luôn chống gậy (gậy tròn có tay cầm cong); dây dắt chó nối đúng bàn tay (có vòng dây trong tay); chai bia nâu có nhãn + nắp, cầm dựng đứng;
  CSGT (chốt + tuần tra, models.csgtLook): nguyên bộ vàng (áo kiểu police: cổ bẻ, cầu vai đỏ, bảng tên, phù hiệu, 2 túi ngực, thắt lưng đen to + khóa + bao súng),
  mũ bảo hiểm 3/4 vàng (helmetStyle open — che tai + gáy, chữ CSGT; cũng chọn được cho món mũ ở ?editor), dây chéo + bao bộ đàm, giày da đen, ~50% khẩu trang.
  ngồi xe banh 2 đùi ra 2 bên theo kiểu xe (BIKE_SPECS spread; người ngồi sau 0,3–0,32 — yên sau rộng); sọc xanh xe tuần tra thành 2 sọc mỏng áp hông xe → chân không lún vào yếm / thân xe. Đã xem: 12 vai người đi đường, 6 loại khách, 6 xe NPC (jetjet, đối thủ, ba gác, trộm chó, CSGT, xe ôm nằm).
- **P4 (xong 14/10)**: người ở xa (> 30 m, chừa 4 m chống nhấp nháy) vẽ bản đơn giản — person.js lite(): ít cạnh, bỏ chi tiết < 4,5 cm (giữ mắt,
  lông mày, miệng); ~960 tam giác / người (chi tiết ~2.190). Đổi hình theo khoảng cách camera (updatePeopleLod, 6 khung hình / lần). Người chơi + ô xem nhân vật
  luôn chi tiết (userData.keepDetail). Cài đặt → "Người đi đường: Chi tiết / Đơn giản" (settings.people). Đo trong game (414 người, ~220 trong khung):
  tam giác người 530k → 280k, thời gian vẽ người ~3,2 → ~1,6 ms / khung (kiểu cũ ~2,6 ms). CHỜ chủ game: có xóa kiểu người cũ (makePersonClassic, ?nguoicu)
  và file mẫu devtools/personSample.js không.
- 🌐 Nhiều người chơi: ngoại hình người chơi (tóc, áo quần) là của riêng từng người, gửi kèm hồ sơ để máy khác vẽ; người đi đường chỉ để nhìn.

### 🏘️ Nhà địa điểm "kiểu A" (14/10 — A1 + A2 xong, chủ game ok)
- Chủ game chọn hướng A: giữ kiểu khối vuông của game, học chi tiết từ mẫu nhà "đồ chơi" — KHÔNG đặt đồ ăn khổng lồ trên nóc (nhà Việt không có).
  Mẫu thử phong cách bo tròn (người xấu, nặng máy ~25 nghìn tam giác / người) đã bỏ, file thử đã xóa.
- **A1 (xong)** `placeBuildings.js` decoA / eateryInside: nhà ống mặt tiền phẳng (quán ăn, bánh mì, tạp hóa, sửa xe, trái cây, đồ chơi; tiệm vàng / xe máy chỉ sân thượng):
  tầng lầu đầu có cửa sổ lá sách + bồn hoa + lan can; sân thượng chậu cây, hoa giấy rủ, ăng-ten, dây phơi; mái hiên sọc + diềm + lồng đèn (quán ăn);
  quán ăn mặt tiền mở (`houses.js` ground 'open') thấy bàn inox, ghế nhựa, quầy nồi nước lèo, bàn thờ thần tài, quạt trần.
  Biển dọc chỉ quán bật ô "Biển dọc" (places.json signV / signVText, ?editor Địa điểm) — bật sẵn: Phở Bà Tư, Bún Mọc, Cơm Tấm, Hủ Tiếu, Lẩu Dê.
- **A2 (xong)** `cafeFront`: kiểu modern (trà sữa, tiệm bánh, nhà sách, cửa hàng tiện lợi…) thêm dây đèn bóng tròn, dù che + bàn ghế (lô ≥ 6 m),
  chậu cây; modern + cafe thêm sân thượng kiểu A. Biển dọc tím có sẵn của mọi nhà modern: chủ game chọn giữ nguyên.
- Ô giữa khối thường (trước là sân trống) → nhà phía sau 1–3 tầng không cửa (cityLayout centerFills + city.js), ngẫu nhiên theo khối.
- 2 trường đại học chọn được cỡ "Cả khối" (CAMPUS_LOOKS) → khuôn viên: Mỹ thuật chữ U kiểu Pháp; RMEET tòa kính + thư viện + căng tin + sân bóng rổ + nhà xe.
  Chưa đổi lô của 2 trường trên bản đồ — chủ game tự chọn ở ?editor nếu muốn.

### 🧍 Hình NPC khớp lời thoại — chia 3 đợt (14/10, đã duyệt; đợt 1 xong, CHỜ chủ game xem)
- **Đợt 1 (xong)** — `world/npcStyles.js` (pedStyle / riderStyle / suitcaseOnBike) + `models.applyPose` (ngồi bệt, còng lưng, lắc lư, gục, đi nghênh ngang, giơ tay định kỳ):
  người đi đường theo thẻ vai trên tên (ăn xin ngồi bệt + lon ở cổng chùa / chợ / nhà thờ / bệnh viện / bến xe, tối đa 5 người · vé số nón lá + túi + xấp vé ·
  anh / chị đại xăm tay, kính đen, dây chuyền · thằng khùng áo choàng đỏ giơ tay "bay" · ngoại quốc ba lô to + máy ảnh · sinh viên ba lô ·
  `[dacho]` người dắt chó (tên mới trong ped.names) · con nít đồng phục, khăn quàng đỏ · người già còng lưng, chống gậy, nón lá);
  khách xe ôm theo loại (say: mặt đỏ, cầm chai, ngồi gục · vali: kéo vali, lên xe thì vali luôn kẹp giữa người lái và khách ·
  ngoại quốc · học sinh · khách vội: áo trắng, cà vạt, cặp, xem đồng hồ). Khách lừa đảo cố ý mặc đồ thường.
- Sửa sau khi chủ game xem (14/10): anh đại to con + xăm kín 2 tay (hoa văn vẽ canvas), chị đại xăm tay; lắc lư / gục / đi nghênh ngang xoay quanh hông
  (trước bị đứt ngang người); tay người lái nắm đúng tay lái mọi kiểu xe (`models.gripBar`: tự tính góc vai / khuỷu + chồm lưng tới khi tay không với tới) —
  người chơi, xe máy NPC, xe trên phà.
- **Đợt 2 (xong 14/10, CHỜ chủ game xem trong game)** — hình ở `world/npcVehicles.js`, chạy ở `world/traffic.js` (spawnSpecials / specialTick / thiefTick),
  số liệu ở thẻ ⚖️ Cân bằng → 🧢 Xe NPC đặc biệt: Jetjet A (3 nhóm 2–3 xe nối đuôi theo xe dẫn, 19–24h, lạng lách, bốc đầu, nẹt pô `city.rev`, câu trêu),
  shipper đối thủ (15% xe máy NPC + 5 người đứng chờ trước quán ăn), ba gác (3 xe, 5–20h, chạy làn ô tô, né đường nhỏ),
  trộm chó B (`sim/dogThief.js`: 2 vụ / đêm 22–04h theo ngày + seed thế giới; chó luôn thoát; bấm còi gần → trộm bỏ chạy, chủ chó cảm ơn 30k / vụ;
  tin Tích Tắc `tt.hot.dogThief` sáng hôm sau).
  Câu thoại bổ sung: `[dacho]` người dắt chó, `[elder]` ông / bà cụ (ped.smallTalk, bubble.ped); khách chào khi lên xe (bubble.riderHi) theo loại khách
  ([drunk] [vali] [hurry] [hocSinh] [nuocNgoai] [sinhVien] + [elder]) — interactions.js boardPassenger dùng pickFor với role = loại khách. Thùng hàng của NGƯỜI CHƠI nhuộm màu bị lệch (thùng gốc màu xanh) — chưa sửa, chờ chủ game.
- **Đợt 3 (xong 14/10, CHỜ chủ game xem)**: CSGT tuần tra (`sim/patrol.js`: 2 tổ / ngày 7–21h, tuyến + giờ theo ngày + seed thế giới; xe mô tô
  2 thùng hai bên + đèn xanh đỏ; chạy quá tốc độ trong 25 m → `patrolStop` phạt như ở chốt; vượt đèn đỏ trước mặt → phạt luôn tiền phạt vượt đèn;
  mỗi tổ dừng mình tối đa 1 lần / 20 phút game; số liệu thẻ Cân bằng → npcFlavor.patrol*) · xe CSGT đậu trên vỉa hè cạnh mỗi chốt (đèn nháy)
  · chú xe ôm nằm ngủ trên xe trước địa điểm bật "Có chú xe ôm" (places.json xeOm; bật sẵn bến xe buýt, chợ Hòa Bình, bệnh viện), mời "xe ôm không?".
  Tính năng riêng của chú xe ôm: bàn sau. Lưu ý chơi nhiều người: nộp phạt đang tua 15 phút (như phạt ở chốt cũ) — tua giờ riêng cần bỏ khi chơi nhiều người.
- 🌐 Nhiều người chơi: hình NPC chỉ để nhìn, mỗi máy tự vẽ. NPC có ảnh hưởng luật chơi (CSGT, trộm chó, xe ôm) phải chạy theo lịch giờ chung như xe buýt.

### 🌐 Chuẩn bị chơi nhiều người: lương cứng 2 hãng · biển số tài xế · bỏ tua thời gian (14/10 — đã góp ý, CHỜ chủ game chọn)
- **Số đo (bot 6 ngày × 30 lượt, tiền kiếm/ngày sau phí sàn, chưa trừ tiền nhà)**: normal ~530k GripBike / ~510k CamSM (~11 đơn) ·
  careful ~480k / ~460k · picky ~400k / ~390k · rush ~740k / ~680k (bị phạt ~190k). Xăng + nhớt ~60k/ngày, sạc + đổi pin ~15k/ngày.
  Script đo: cộng dồn `gs.stats` mỗi ngày (vá `GameState.startDay`), thu nhập thật = income − codAdvance.
- **1. Lương cứng** (đề xuất, ≈ 10–30% thu nhập, mỗi hãng một kiểu người chơi):
  - GripBike "tự do + thưởng": 60k/ngày nếu bật app ≥ 4 giờ game; thưởng mốc 8 đơn +30k · 12 đơn +60k · 16 đơn +100k; phí sàn 20%; đơn ×1,1.
  - CamSM "lương cao + ràng buộc": 160k/ngày nếu bật app ≥ 8 giờ trong ca 7h–22h, nhận ≥ 80% đơn mời, điểm ≥ 4,5; phí sàn 25%; đơn ×0,9.
  - Ước tính/ngày: normal Grip ~620k vs Cam ~637k · rush 860k vs 793k · picky 490k vs ~364k (rớt chỉ tiêu) · careful 570k vs 586k.
  - Trả lương: chốt lúc app đóng (24h), cộng vào ví 06:00 hôm sau. Đổi hãng: mất cọc + chờ 1 ngày (chọn phe là quyết định thật).
  - Hướng mở khi có máy chủ: thị phần theo khu phố, bảng xếp hạng hãng theo tuần, giờ vàng riêng mỗi hãng.
- **2. Biển số = mã tài xế**: 1 người 1 số cố định dạng `59-G1 234.56` (G = GripBike, C = CamSM), đổi xe vẫn giữ số;
  hiện ở biển sau xe (mô hình xe có sẵn tấm biển), áo đồng phục, hồ sơ app. Tố cáo ẩn danh ở văn phòng hãng (lỗi dịch vụ)
  hoặc công an (lỗi giao thông): chỉ tố được người đã gặp (≤ 30 m trong 30 phút trước), tối đa 3 lần/ngày, cần ≥ 3 người khác nhau
  mới bị phạt, hay tố sai thì giảm uy tín; che biển số bị CSGT phạt. Làm được ngay: phần hiển thị; tố cáo chờ có máy chủ.
- **3. Bỏ tua thời gian** (đồng hồ: 1 giây thật = 1 phút game; 1 ngày = 24 phút thật). Chỗ đang tua: `g.advance` ở game.js
  (ngủ, chợp mắt, ngất 6 tiếng, chờ phà, phím T) và interactions.js (hoạt động, xe buýt cả chuyến, sạc / đổi pin / thay nhớt,
  chờ quán / chờ khách, leo thang, CSGT giữ 6–15 phút, dùng đồ 1–10 phút, mua đồ 2 phút).
  Hoạt động: 32/50 ≤ 15 phút · 11 ở 16–30 · 6 ở 31–60 · "đi làm văn phòng" 480 phút. Đề xuất:
  - Việc tốn thời gian: thanh tiến độ + động tác, đồng hồ vẫn chạy, đơn vẫn đổ về; dừng / bước đi lúc nào cũng được → nhận đúng phần đã làm.
    Tiền: món ăn / vé trả trước; dịch vụ tính giờ (karaoke, massage, thuê phòng, sạc) trả theo phút đã dùng.
  - Rút hoạt động còn tối đa ~20–30 phút game, giữ tổng tác dụng; "đi làm văn phòng 8 tiếng" bỏ hoặc thành ca 30 phút.
  - Ngủ: (a) ngủ thật hồi nhanh (~1 phút thật là đầy) + (b) đăng xuất ở nhà trọ = ngủ; bỏ luật "buồn ngủ sau 16 giờ thức" (= 16 phút thật).
  - Xe buýt: lên đúng xe đang chạy trên bản đồ, tới trạm bấm E xuống. Ngất: ~1 phút màn hình mờ, tỉnh ở bệnh viện, mất tiền + đơn.
  - Phím T / tua trong cheat chỉ còn ở ?debug / ?cheat. Câu hỏi để sau: có chậm đồng hồ chung lại khi chơi nhiều người không.
- Thứ tự đề xuất: (3) bỏ tua → (1) lương cứng (cân lại trên nền mới, đo bot trước/sau) → (2) biển số (phần hiển thị).
- **Chờ chủ game chọn**: kiểu lương 2 hãng · luật đổi hãng · dạng biển số + chỉ làm phần hiển thị · cách ngủ (a)+(b) và bỏ luật 16 giờ ·
  cách tính tiền dịch vụ (trả trước / trả theo phút).

### 🏙️ Phố giống Việt Nam hơn — đã làm A (13/10, chờ chủ game xem trong game)
- Đã làm (giữ lưới đường, không đổi tên đường): nhà ống 2–3 căn / lô (3,4–6,3 m, `houses.js splitFrontage`), biển hiệu to ngang mặt tiền,
  bậc dắt xe, cơi nới mái tôn, thêm màu tường; gạch vỉa hè lộn xộn (gạch đỏ, terrazzo, mảng vá, lặp mỗi 8 m); ~45% cây thân cao;
  xe máy đậu xiên sát lề (trước nhà dân + trước địa điểm, né cửa) + quán cóc ghế nhựa ngồi được (căn có cửa hàng); xe hàng rong ở mọi khu
  theo độ đông. Độ đông theo khu: `districts[mã].street = { bikes, stalls, vendors }` (thẻ 🗺️ Bản đồ → Khu phố, để trống = theo "người đi bộ").
  Lối đi bộ dời về 2,05 m từ lề (`traffic.js PED_LANE`).
- Làm thêm (13/10 tối): khách ngồi quán cóc (`world/stallPeople.js`, 12 người dùng lại, ~55% ghế có khách, ghế có khách thì người chơi
  không ngồi được); quán cóc luôn có bạt che; kho chữ biển hiệu 22 chữ (`city.shopSigns`), vẫn giữ nhà ở bình thường;
  **nhà góc 2 mặt tiền**: căn ngoài cùng ở góc khối (phía hông ra đường thật, không phải sông / khối gộp) có mặt hông sơn màu,
  cửa sổ từng tầng, trệt mở cửa hàng, biển chữ L chạy sang hông (`houses.js h.corner`, `city.js cornerDirOf`) — đã xem trong game: ổn.
- Có thể làm sau: B (ngã ba bằng gộp khối, vòng xoay).

### 🏍️ Xe nền (chỉ để nhìn) — đã làm A (13/10 tối)
- `src/world/bgTraffic.js`: xe máy khối đơn giản (~220 tam giác) chạy theo làn xe máy trong vùng 35–140 m quanh người chơi,
  rẽ ở ngã tư như xe NPC, không va chạm. Vào gần < 35 m (hoặc ra quá xa) thì mờ dần lấm tấm rồi hiện lại phía xa.
  Rải nhiều trên đường người chơi đang đứng; xe ở đường khuất sau 15–30 giây thì nhường chỗ. Đèn pha / đèn hậu luôn sáng.
  Dừng sau đuôi xe NPC thật cùng làn; qua ngã tư KHÔNG nhường xe khác (ở xa nên khó thấy).
- Số liệu: thẻ ⚖️ Cân bằng → 🏍️ Xe nền (tối đa 150, gần 35 m, xa 140 m, tốc độ); độ đông theo khu: thẻ 🗺️ Bản đồ → Khu phố →
  🏍️ Xe chạy nền (`districts[mã].street.flow`, để trống = theo "người đi bộ"). Cả đàn 5 lần vẽ, đo không thấy chậm hơn.
- Có thể làm sau (B): xe nền chạy vào gần thì chuyển thành xe NPC thật nếu còn chỗ (khỏi thấy xe mờ đi giữa đường).

### 🚦 Đèn giao thông — đã làm (13/10 khuya)
- `sim/lights.js` + `world/trafficLights.js`: đèn ở ngã tư đại lộ cắt đường thường / đại lộ (gợi ý tự động 27 đèn, 10 camera;
  sửa ở thẻ 🗺️ Bản đồ → 🚦), 2 pha theo giây thật (xanh 8 / vàng 2), xe NPC + xe nền dừng đỏ / vàng, rẽ phải luôn được.
- Vượt đèn đỏ (game.js redLightTick): lần đầu mỗi ngày chỉ nhắc; sau đó % bị ghi hình (thường 15%, camera 70%, chốt CSGT 100%),
  tối đa 2 lần phạt / ngày, 30–60 phút sau app CSGT báo phạt nguội 100k (nộp ở đồn như phạt nguội khác). Mỗi sáng nhóm tài xế báo
  ngã tư có camera. Số ở thẻ ⚖️ Cân bằng → 🚦 (đặt 3 ô % = 0 là chỉ để nhìn).
- Sim 9 ngày (trước → sau): bot tuân thủ chờ đèn ~70 phút game / ngày → normal 10,9 → 10,1 đơn/ngày, tiền cuối 2765k → 2372k;
  bot ẩu (vượt đèn) bị phạt 1,75 lần / ngày → tiền cuối 3688k → 2036k. Muốn nhẹ hơn: giảm giây đèn xanh / vàng hoặc bớt đèn.
- Chưa làm: xe buýt chạy theo lịch nên không dừng đèn; đường một chiều, 11c (chạy vỉa hè, bấm điện thoại, cấm rẽ trái) để sau.

## ✅ Đã xong (13/10/2026 khuya)
- App điện thoại **⏱️ Tích Tắc** (tên chọn để tránh trùng nhãn hiệu TikTok): lướt tin, thả tim, xem bình luận — chỉ để vui.
  Tin nóng theo chuyện trong game (dự báo, mưa, ngập, triều cường, kẹt xe, chốt CSGT, khai trương, điểm nóng lừa đảo, ví anh Minh),
  tin về mình (tân binh, số đơn, điểm), tin vui ngẫu nhiên. Ảnh = chụp thật trong thế giới 3D (game.snapPhoto), clip = vẽ 2D.
  Mẫu tin ở vi.json `tt.*` ("[loại ảnh] @tác_giả | chú thích | nhạc | chữ trên ảnh"), kiểm tra ở validate.js `validateFeedLines`.
  Tiếng mới `phone.swipe`, `phone.like` (chưa gắn file).
  Thêm: 18 tin theo trend TikTok VN (tháng 10/2026: "Ai đưa em về", 20/10, cạn phước, trùng sinh chắc luôn, delulu…),
  nhóm `tt.spot` (tin quán quen, luôn có 2 tin) = Tiệm Trà A Di Đà chị Linh; `photo:<mã địa điểm>` chụp đúng nơi đó.
- Người đi đường **TikToker** (vai `[tiktok]`): kiểu A giơ điện thoại trước mặt / kiểu B gậy tự sướng, đi chậm (models.holdPhone).
- Xưng hô: thẻ tuổi / giới tính trước tên ("[kid] Con nít", "[f] …"); tên không rõ nam nữ → mỗi người đi đường ngẫu nhiên;
  "Thằng …" = thanh niên ("Thằng nhóc / bé …" = trẻ con); tên Tây chỉ đoán theo danh sách tên quen.
- Người đi đường: chép câu ped.smallTalk sang bubble.ped (bỏ ngoặc kép); người có câu riêng 70% nói câu đúng vai (content/index.js ROLE_SHARE).
- `?editor`: sửa lỗi "Lưu thất bại … reading '0'" (thẻ Địa điểm vẽ bản đồ lô khi có địa điểm chưa đặt); lưu xong mà vẽ lại lỗi thì báo riêng.

## ✅ Đã xong (13/10/2026 tối) — 16 lỗi chủ game báo
- Điện thoại: tới văn phòng hãng thì hướng dẫn "bấm E đăng ký" (không quay lại bước mở Bản đồ) · có đơn mới khi đang xem app khác
  chỉ hiện thông báo (không tự nhảy app) · sửa Bản đồ bị đen (lỗi cập nhật giao diện khi nhảy thẳng từ Bản đồ sang app khác)
  · điện thoại nằm trên bong bóng thoại (lớp 7).
- Đổ xăng / sạc xong không chỉ đường về nhà nữa: nhắc trả tiền nhà chỉ vào ngày hạn trả.
- Cản trở giao thông: không tính khi đang kẹt xe, khi xe phía sau vốn đã bị xe khác chặn, khi mình đang chạy theo dòng;
  xe buýt xét xe NPC chắn trước rồi mới tới người chơi.
- Tiếng sấm chỉ khi trời bắt đầu mưa lúc đang chơi (không phát khi tua giờ: ngủ, chợp mắt, phím T…).
- Trạm sạc: chỗ sạc dưới mái che cạnh trụ (cityLayout.chargeSpot), phải chạy vào sân (≤ 3,5 m) mới sạc.
- Xuống xe không giật camera · đi bộ không xuyên qua xe của mình.
- Xe đậu lề đường giảm một nửa; không đậu trước bệnh viện, đồn công an, trường, bến xe, cây xăng, trạm sạc / đổi pin, nhà thờ,
  bưu điện, sân bay, bến phà, góc ngã tư (vạch qua đường), trạm xe buýt.
- Độ khó giao hàng / chở khách giảm 40% (mọi mức hư hại do chạy xe; số viết cứng chuyển ra thẻ Cân bằng → Lái xe).
  Sim 9 ngày: rush qua ngày 9 từ 20% → 97%, sao TB 3,85 → 4,18; careful 4,34 → 4,40; normal 4,30 → 4,43.
- Vựa ve chai: nút "♻️ Bán đồ cũ" (places.json `buys`): quần áo / trang bị đã mua 30% giá (economy.resalePct), vỏ chai / vỏ lon
  1k mỗi cái (goods `voChai`, `scrapPrice`); uống nước suối / soda / trà xanh / nước tăng lực xong còn vỏ (`use.leaves`).
- Chó: mẫu chó ta vàng; không lao qua sông, chạy xong về lại khối nhà của mình.
- Xưng hô (sim/people.js personOf + pronouns): lời thoại dùng {toi} {ban} {khach} {minh} {anhchi} theo người nói (giới tính + tuổi
  đoán từ tên, nhân viên quán lễ phép) và giới tính nhân vật mình; câu / tên gắn thẻ vai "[veso] …" (vé số, xe ôm, ăn xin,
  bán kẹo). Thêm người đi đường "Ông lão ăn xin", "Thằng nhóc bán kẹo". Bác Năm (mẹ anh Minh) là nữ.
- Lưu game: vẫn tự lưu lúc 06:00 (có báo "💾 Đã tự lưu"), thêm nút "💾 Lưu game" khi nói chuyện Cô Hai ở nhà trọ
  (đang chạy đơn thì không lưu được). Ngủ dậy / chợp mắt / bị ngất vẫn tự lưu như cũ.

## ✅ Đã xong (13/10/2026 chiều)
- Khách lừa đảo khó nhận ra hơn (A + D): khách app thường đôi khi cũng hiện "Tài khoản mới" (8%) / "Đòi trả tiền mặt" (10%);
  mỗi tối 20:30 nhóm Hội Shipper đồn 1 "điểm nóng" (`scamHotspot`, đổi theo ngày) — kẻ lừa đảo 70% đón ở đó.
  Số ở thẻ Cân bằng → 🧍 Sự cố khi chở khách. Bot cẩn thận chỉ từ chối khi thấy đủ 2 dấu hiệu (không còn "nhìn trộm" nhãn ẩn).
- Âm thanh: chủ game đánh dấu "Xong" cả 86 mã trong `docs/am-thanh.md` (có gì cập nhật sau). Bỏ theo dõi: `night.mp3` nặng,
  nhạc ngày ngắn (chủ game: "kệ đi"); IDM, điện thoại ở cửa sổ hẹp, lỗi Esc (chủ game đã thử: ổn / tạm xong).
- Chữ "GoShip" còn sót: `npc.goship.greet` → `npc.officeGoship.greet` (câu chào văn phòng GripBike chạy lại), `phone.app` = "Nhận đơn".
- Phụ phí ngập: đơn mà chỗ lấy hoặc chỗ giao đang ngập (từ mức xăm xắp) cộng `floodSurcharge` (apps.json, mặc định 5k, thẻ 📲 App & Đơn),
  thẻ đơn có nhãn "🌊 Đường ngập". Khách quen gọi thẳng không có.
- Bảng cheat: gộp 2 ô loại khách thành 1 ô "Loại khách" (dùng cho cả Gọi đơn ngay lẫn đơn tự đến, nhớ qua F5).

## ✅ Đã xong gần đây (13/10/2026 sáng — đã đẩy lên GitHub)
- Sửa bong bóng chat nhảy chữ (gần mép màn hình bị bóp hẹp → xuống dòng lại): rộng theo câu, làm tròn vị trí, giữ trong màn hình.
  Sửa thêm: bản đồ hụt 10px bên phải, biển nổi dài bị cắt chữ (tự co chữ), đang ngồi bị người đi đường đẩy trượt, bấm E việc khác
  khi đang ngồi thì đứng dậy trước, bảng giữ xe không mở khi đang chạy nhanh, mũi tên xe buýt giữ trạm đã chọn (không nhảy),
  bộ thử đổi tuyến thử thật, bảng "Đang mặc" ở màn hình hẹp cao theo nội dung.
- Ngồi ghế (E Ngồi / Đứng dậy, bấm đi cũng đứng dậy): đôn quán ăn, ghế cà phê, ghế đá công viên, ghế trạm / bến xe buýt, sân bay,
  sân tennis / pickleball, đại học. Ngồi hồi tinh thần chậm tới mức tối đa (thẻ Cân bằng → energy.seat). Quán trà chưa ngồi được
  (đôn bị sàn hiên che), võng không ngồi được (khách không vào trong).
- Camera chỉ né nhà (bỏ qua cây, cột, xe đậu), lùi ra từ từ → hết zoom giật.
- Tài xế chửi khi bị chắn đầu xe (1,5 giây câu nhẹ, 8 giây câu gắt) / bị tông — câu ở `bubble.driverMild / driverAngry / busMild / busAngry / driverHit`.
- Xe máy đậu lề đường / bãi giữ xe / sân bay / đồn / showroom: xe thật 1 kiểu (underbone, `PARKED_MODELS` trong world/parkedBikes.js),
  lề đường còn ~40% số xe cũ, chỉ hiện trong ~70 m quanh người chơi (không hiện trong thẻ 🏗️ Xây dựng).
- Bãi giữ xe: biển nổi + E "Xem bảng giữ xe" (phí gửi, luật đậu ngoài đường, số lấy từ thẻ Cân bằng).
- Túi đồ 4 × 5 ô / trang, lật trang ◀ ▶, đồ đang mặc không nằm trong túi. Điện thoại + bảng "Đang mặc" cỡ cố định 340 × 640, thu nhỏ đều khi cửa sổ thấp.
- Hoạt động ở địa điểm: thể lực = 0 hết (chỉ còn tinh thần). 11 đồ ăn uống mới bán ở 6 tiệm Triangle K (nước suối, sữa, soda, trà xanh,
  xúc xích, snack, mì ly, bánh mì, cơm nắm, bánh bao, cơm hộp). Bot mua đồ ăn ở tiệm thay cho số "meal/drink" cũ (đã bỏ khỏi balance.json).
- App Bản đồ: hiện trạm xe buýt (bật lọc 🚌), nút "🚏 Trạm gần nhất", thẻ trạm + Chỉ đường tới trạm. Xe đang ở đồn công an:
  chỉ đường đi bộ ra trạm → tuyến nào (đổi tuyến 1 lần nếu cần) → xuống đâu, hiện ở mục tiêu, app CSGT và thẻ địa điểm.

## ✅ Đã xong trước đó (12/10/2026)
- Âm thanh: kho tiếng Kenney + nghe thử / dừng trong editor, nghe tiếng tổng hợp, nhạc lặp liền.
- Ngập đường + triều cường (thẻ 🗺️ Bản đồ → 🌊 Đường ngập, thẻ ⚖️ Cân bằng → 🌊), hủy đơn vì ngập (chưa lấy hàng, không trừ sao).
- Bảng cheat `?cheat` (chỉ localhost).
- Xe buýt dừng khi bị chắn / bóp còi; người đi bộ né vật cản nhẹ nhàng; biển + vòng xanh ở trạm xe buýt; hộp thoại trạm xổ theo tuyến;
  công an phạt cản trở giao thông (đứng chắn xe 15 phút → đưa vào lề, phạt nguội 100k); thanh cuộn mảnh; cỡ túi theo số ô.
