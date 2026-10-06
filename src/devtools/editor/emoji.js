// Bảng emoji hay dùng cho công cụ ?editor, kèm từ khóa tiếng Việt để tìm.
// Muốn thêm: thêm [emoji, 'từ khóa ...'] vào nhóm phù hợp (mỗi emoji chỉ một lần).
// Emoji ghép (người + nghề, vd 🧑‍🍳) máy rất cũ có thể hiện thành 2 hình rời — dùng vừa phải.

export const EMOJI_GROUPS = [
  ['Món ăn', [
    ['🍜', 'phở bún mì hủ tiếu tô nước lèo'], ['🍚', 'cơm chén cơm trắng'], ['🍛', 'cơm cà ri'], ['🍱', 'cơm hộp cơm văn phòng bento'],
    ['🥖', 'bánh mì ổ'], ['🥪', 'bánh mì kẹp sandwich'], ['🍲', 'lẩu canh nồi súp'], ['🥘', 'chảo xào'], ['🍳', 'trứng ốp la chiên'],
    ['🍗', 'gà đùi gà rán'], ['🍖', 'thịt sườn nướng'], ['🥩', 'thịt bò bít tết'], ['🍤', 'tôm chiên tempura'], ['🦐', 'tôm hải sản'],
    ['🦀', 'cua ghẹ hải sản'], ['🦑', 'mực hải sản'], ['🐟', 'cá'], ['🥟', 'há cảo sủi cảo bánh bao'], ['🍢', 'xiên que nướng'],
    ['🥗', 'gỏi rau salad'], ['🌯', 'bò bía cuốn'], ['🍕', 'pizza'], ['🍔', 'hamburger bánh kẹp'], ['🍟', 'khoai tây chiên'],
    ['🌭', 'xúc xích hot dog'], ['🍝', 'mì ý spaghetti'], ['🍙', 'cơm nắm'], ['🥚', 'trứng'], ['🧀', 'phô mai'], ['🥡', 'hộp mang về'],
  ]],
  ['Đồ uống · tráng miệng', [
    ['☕', 'cà phê cafe sữa đá nóng'], ['🧋', 'trà sữa trân châu'], ['🍵', 'trà nóng'], ['🥤', 'nước ngọt ly nhựa'], ['🧃', 'nước ép hộp'],
    ['🥛', 'sữa'], ['🍺', 'bia'], ['🍹', 'sinh tố cocktail'], ['🧊', 'đá viên lạnh'], ['💧', 'nước suối giọt nước'], ['🍦', 'kem ốc quế'],
    ['🍨', 'kem ly'], ['🍧', 'đá bào chè'], ['🎂', 'bánh kem sinh nhật'], ['🍰', 'bánh ngọt'], ['🧁', 'cupcake bánh nướng'], ['🍩', 'bánh donut vòng'],
    ['🍪', 'bánh quy'], ['🍫', 'sô cô la socola'], ['🍬', 'kẹo'], ['🍮', 'bánh flan caramen'], ['🍡', 'chè bánh trôi'], ['🥭', 'xoài trái cây'],
    ['🍉', 'dưa hấu trái cây'], ['🍌', 'chuối trái cây'], ['🥥', 'dừa trái cây'], ['🍊', 'cam trái cây'],
  ]],
  ['Đồ dùng · trang bị', [
    ['📘', 'sách xanh'], ['📕', 'sách đỏ'], ['📗', 'sách lá'], ['📙', 'sách cam'], ['📖', 'sách mở đọc tiểu thuyết truyện'], ['📚', 'chồng sách nhà sách thư viện'],
    ['📰', 'báo tờ báo'], ['🧥', 'áo khoác chống nắng'], ['🦺', 'áo phản quang'], ['👕', 'áo thun đồng phục'], ['🧢', 'nón mũ lưỡi trai'],
    ['⛑️', 'mũ bảo hiểm nón bảo hiểm'], ['🪖', 'mũ bảo hiểm nón cối'], ['👟', 'giày thể thao giày êm'], ['🥾', 'giày ủng'], ['🧤', 'găng tay bao tay'],
    ['🧦', 'vớ tất'], ['🕶️', 'kính râm kính mát'], ['😷', 'khẩu trang'], ['☂️', 'dù ô áo mưa'], ['🌂', 'dù ô gấp'], ['🎒', 'ba lô balo'],
    ['👜', 'túi xách'], ['🛍️', 'túi mua sắm'], ['📦', 'thùng hộp giao hàng'], ['🧳', 'vali'], ['🔋', 'pin sạc dự phòng'], ['🔌', 'sạc dây cắm'],
    ['📱', 'điện thoại'], ['🎧', 'tai nghe nghe nhạc'], ['🔦', 'đèn pin'], ['🗺️', 'bản đồ'], ['🧭', 'la bàn'], ['💊', 'thuốc viên'], ['🩹', 'băng cá nhân'],
    ['🧴', 'kem chống nắng chai lọ'], ['🧻', 'giấy cuộn'], ['💳', 'thẻ ngân hàng'], ['👛', 'ví bóp'], ['🔑', 'chìa khóa'], ['🎁', 'quà hộp quà'],
    ['⚡', 'tia sét năng lượng tăng lực'], ['🍀', 'may mắn cỏ bốn lá'], ['🪔', 'nhang đèn dầu thờ cúng'], ['🙏', 'chắp tay cầu nguyện lạy'], ['📿', 'chuỗi hạt tràng hạt'], ['❤️', 'tim tình yêu'], ['⭐', 'ngôi sao sao'],
  ]],
  ['Xe · sửa xe', [
    ['🛵', 'xe máy tay ga'], ['🏍️', 'mô tô xe côn'], ['🚲', 'xe đạp'], ['🛴', 'xe trượt scooter'], ['🚗', 'ô tô xe hơi'], ['⛽', 'cây xăng đổ xăng'],
    ['🔧', 'cờ lê sửa xe'], ['🔩', 'ốc vít'], ['🛞', 'bánh xe lốp vỏ xe'], ['🪛', 'tua vít'], ['🧰', 'hộp đồ nghề'], ['🛢️', 'dầu nhớt thùng dầu'],
  ]],
  ['Địa điểm', [
    ['🏠', 'nhà'], ['🏚️', 'nhà trọ nhà cũ'], ['🏢', 'chung cư tòa nhà văn phòng'], ['🏬', 'trung tâm thương mại'], ['🏪', 'tạp hóa cửa hàng tiện lợi'],
    ['🏥', 'bệnh viện'], ['🏦', 'ngân hàng'], ['🏫', 'trường học'], ['🏨', 'khách sạn'], ['🛕', 'chùa'], ['⛪', 'nhà thờ'], ['🏟️', 'sân vận động'],
    ['🎬', 'rạp phim chiếu phim'], ['🎤', 'karaoke hát micro'], ['🎮', 'quán net game'], ['🎱', 'bi da'], ['💈', 'tiệm tóc cắt tóc'], ['💅', 'nail làm móng'],
    ['🧺', 'giặt ủi'], ['🛒', 'siêu thị chợ xe đẩy'], ['🌳', 'công viên cây'], ['⛲', 'đài phun nước'], ['🚏', 'trạm xe buýt'], ['🅿️', 'bãi giữ xe đậu xe'],
    ['🍽️', 'nhà hàng quán ăn'], ['🍴', 'quán ăn dao nĩa'], ['🏋️', 'phòng gym tập tạ'], ['🏊', 'hồ bơi'], ['💆', 'spa massage'], ['📮', 'bưu điện'],
    ['🚓', 'công an cảnh sát'], ['🚒', 'cứu hỏa'], ['🎡', 'khu vui chơi'], ['🐶', 'thú cưng thú y'], ['💐', 'tiệm hoa'], ['🎵', 'nhạc quán bar'], ['📍', 'ghim vị trí'],
  ]],
  ['Người (chân dung NPC)', [
    ['👨', 'đàn ông chú anh'], ['👩', 'phụ nữ cô chị'], ['🧑', 'người'], ['👦', 'bé trai em'], ['👧', 'bé gái em'], ['👴', 'ông cụ ông'],
    ['👵', 'bà cụ bà'], ['🧓', 'người già'], ['👱', 'tóc vàng'], ['🧔', 'râu chú'], ['👲', 'mũ quả dưa'], ['🧕', 'khăn trùm'],
    ['👮', 'công an cảnh sát giao thông csgt'], ['👷', 'công nhân thợ xây'], ['💂', 'bảo vệ lính gác'], ['🕵️', 'thám tử'], ['🤵', 'chú rể vest'],
    ['👰', 'cô dâu'], ['🧑‍🍳', 'đầu bếp chủ quán'], ['🧑‍🔧', 'thợ sửa xe'], ['🧑‍⚕️', 'bác sĩ y tá'], ['🧑‍🎓', 'sinh viên học sinh'],
    ['🧑‍💼', 'nhân viên văn phòng'], ['🧑‍🏫', 'giáo viên thầy cô'], ['🧑‍🎤', 'ca sĩ'], ['😀', 'mặt cười vui'], ['😎', 'ngầu kính'], ['😴', 'ngủ buồn ngủ'],
  ]],
];

// bỏ dấu tiếng Việt để gõ "pho" vẫn ra "phở"
export const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

// Tìm theo từ khóa: mỗi chữ gõ vào phải khớp ĐẦU một từ trong từ khóa.
// Gõ có dấu thì so đúng dấu ("dù" chỉ ra cái dù); gõ không dấu thì bỏ qua dấu ("du" ra dù, dưa, dừa…).
// Trả về [[tênNhóm, [[emoji, từKhóa]...]], ...]
export function searchEmoji(query) {
  const q = String(query).toLowerCase().trim();
  if (!q) return EMOJI_GROUPS;
  const exact = /[^\x00-\x7f]/.test(q); // có chữ có dấu
  const norm = exact ? (s) => s.toLowerCase().normalize('NFC') : plain;
  const words = norm(q).split(/\s+/).filter(Boolean);
  const hit = (kw) => { const ks = norm(kw).split(/\s+/); return words.every((w) => ks.some((k) => k.startsWith(w))); };
  return EMOJI_GROUPS.map(([name, list]) => [name, list.filter(([, kw]) => hit(kw))]).filter(([, list]) => list.length);
}
