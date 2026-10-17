// =============================================================
// CỐT TRUYỆN (chơi một mình) — chạy theo dữ liệu src/data/story.json (thẻ 📖 Cốt truyện của ?editor).
// Mỗi chương = danh sách bước. Mỗi bước:
//   delay  — chờ bấy nhiêu phút game rồi mới làm các việc ở "on" (tin nhắn tới trễ một chút cho giống thật)
//   on     — việc làm khi vào bước: gửi tin nhắn, hiện hội thoại, cho đồ… (game.js → runStoryActions)
//   until  — điều kiện xong bước (bảng UNTIL bên dưới) → sang bước sau
//   goal / hint / target / guide — mục tiêu trên màn hình, chỗ mũi tên chỉ tới, nút cần làm sáng trên điện thoại
//   talk   — nói chuyện ở một địa điểm (nút E riêng): có thể xếp hàng vào túi (pack) / giao hàng (drop) / tặng đồ (give)
//   mark   — dấu trên đầu NPC trong lúc chờ bước này: { place, icon: '!' | '?' } (NPC của địa điểm) hoặc { actor, icon } (người lạ đang ở cảnh)
//   hold   — true: app chưa phát đơn thường trong lúc chờ bước này (để hướng dẫn / đơn cốt truyện không bị đơn khác chen vào)
//   leash  — { place, r, text }: chưa xong bước thì không cho đi xa địa điểm quá r m (bị giữ lại + thông báo text)
//   zone   — { place, r }: vòng tròn tím quanh địa điểm (vùng tìm kiếm, không mũi tên)
//   talkLabel — chữ trên nút E ở bước chờ bấm E nói chuyện (talkActor), vd "Chở chị Linh"
//   deadline — { hour, back, text, from, msg }: phải xong trước hour giờ (giờ chung). Các bước liền nhau cùng có deadline dùng chung 1 hạn
//              (tính lúc vào bước đầu tiên). Quá hạn → thông báo text (+ tin nhắn msg của from) → quay lại bước back (vd chờ 8h sáng hôm sau).
//              Không tua / quay ngược đồng hồ (đồng hồ là của chung khi chơi nhiều người).
//   hideNpc  — [mã địa điểm]: NPC của các địa điểm này vắng mặt trong bước (vd chị Linh chưa ra tiệm trà trước 8h). Chương cũng có hideNpc
//              (cả chương). Người lạ đang có mặt mà là nhân vật của NPC địa điểm (sơ đồ quan hệ) thì NPC đó cũng tự vắng (không bị 2 người giống nhau).
//   noFines  — true: đang ở bước này thì không bị phạt / CSGT cho qua (vd đang đuổi theo tên cướp)
//   chase (việc 🏍️ Chạy trốn): gap (m giữ cách) · pct (% tốc độ tối đa xe người chơi khi chạy đều) · lose (m trên màn hình: bị bỏ xa hơn → mất dấu,
//              làm lại từ chỗ bắt đầu dí = lúc hết cảnh phim có endRide) · revAt ('start' | 'pass' | 'none': tiếng nẹt pô lúc xuất phát / lúc lướt ngang người chơi)
//   music    — mã nhạc (music.*) thay nhạc ngày / đêm trong lúc chờ bước này (vd music.chase lúc dí cướp); chưa gắn file → giữ nhạc thường
//   noBeacon — true: mũi tên chỉ tới mục tiêu nhưng không có cột sáng (vd mục tiêu là tên cướp đang chạy — đã có chấm đỏ trên đầu)
//   mark.icon — '!' / '?' (dấu nhiệm vụ, khung tròn vàng) · 'dot' (chấm đỏ nhấp nháy: mục tiêu đang truy đuổi)
// Người nói trong bong bóng / chọn câu: 'player' · mã người lạ (people) · 'place:<mã địa điểm>' (NPC đứng ở địa điểm đó, vd sư cô ở chùa)
// Tiến độ lưu trong GameState.story: { ch, step, fired, waited, ev, done, items, carry, picks }.
// picks: câu trả lời người chơi đã chọn ({ mã lựa chọn: số thứ tự 0..2 }) — để chương sau cho nhân vật phản ứng khác nhau.
// traits: điểm tính cách { good, neutral, bad } — mỗi câu trả lời có thể cộng điểm (story.json → choose.gains). Cuối game xét kết:
//   tính cách nhiều điểm nhất thắng, bằng điểm nhau → trung lập (leaning). Bước có onlyTrait chỉ chạy khi đang nghiêng về tính cách đó (nội dung riêng).
// Chơi nhiều người: cốt truyện là của RIÊNG từng người (lưu trong save của mình), không dừng / tua đồng hồ chung.
// Chữ hiển thị ở vi.json (khóa story.*).
// Người lạ (story.json → people, vd anh phát tờ rơi): việc actor / approach / leave / remove / bubble cho một cảnh ngắn ngay trong thế giới,
// không mở hộp thoại; chỉ máy của người chơi đó vẽ (cốt truyện riêng — chơi nhiều người người khác không thấy, không cần đồng bộ).
// Người chơi đứng gần bấm E: bước đang chờ "talkActor" → sang bước sau (câu tiếp theo); không thì người lạ nói câu "idle".
// Có dấu ! trên đầu thì người lạ cứ vài giây gọi câu "call". Dáng: ACTOR_LOOKS · chỗ đứng: ACTOR_SPOTS.
export const ACTOR_LOOKS = { jetjet: 'Trẻ trâu (sơ mi caro, nón lưỡi trai đội ngược)', normal: 'Người đi đường bình thường', girl: 'Cô gái trẻ (sinh viên)', student: 'Nam sinh viên (áo thun, quần jean, đeo balo)', gentleman: 'Đàn ông lịch lãm (sơ mi trắng, quần tây, giày da)', char: 'Theo sơ đồ quan hệ (ngoại hình nhân vật gắn với người này — /?relationship)' };
// 3 tính cách (tên hiển thị ở vi.json: story.trait.<mã>) — mô tả cho công cụ ?editor
export const TRAITS = {
  good: 'Công dân gương mẫu — kết vui: nhân hậu, hiền hòa với mọi người',
  neutral: 'Công dân trung lập — kết bình thường',
  bad: 'Công dân xấu tính — kết xấu: tha hóa khi lên thành phố',
};
export const ACTOR_SPOTS = { xeOm: 'Cạnh gốc cây kế chú xe ôm nằm ở địa điểm …', place: 'Trước cửa địa điểm … (cách cửa … m ra phía đường, lệch … m dọc đường)', near: 'Gần người chơi (cách … m, thấy trên màn hình)', at: 'Đúng tọa độ [x, z] trên bản đồ (quay mặt theo hướng …°)' };
// Xe đi kèm người lạ (dựng cạnh, bỏ đi thì đội mũ lên xe chạy mất)
export const ACTOR_VEHICLES = { moto: 'Sport bike phân khối lớn đen sọc xanh lá (cùng chiếc anh mô tô chạy ở chương 3)' };
// Dấu nhảy trên đầu (việc "react"): ? ngạc nhiên · ! giật mình
export const REACT_ICONS = { '?': '? Ngạc nhiên', '!': '! Giật mình' };
// Cảnh phim: camera nhìn vào đâu
export const CINE_TARGETS = { place: 'Địa điểm …', actor: 'Người lạ …', prop: 'Đạo cụ …', player: 'Người chơi' };
// Đạo cụ cảnh phim (việc "prop"): xe tải chạy ra chặn đường · tấm ván làm dốc · chó chạy ngang
export const PROP_KINDS = { truck: '🚛 Xe tải container dài', ramp: '🪵 Tấm ván dựng làm dốc', dog: '🐕 Chó chạy ngang', car: '🚗 Ô tô diễn viên (chạy theo đường, 2 xe dí né)', moto: '🛵 Xe máy diễn viên (chạy theo đường, 2 xe dí né)', police: '🚓 Xe công an (đèn chớp; dừng ở cuối đường → các anh công an bước xuống)', easel: '🖼️ Giá vẽ + tranh (đặt cố định)', bin: '🗑️ Thùng rác (chỗ núp khi bám theo lén)', can: '🥫 Lon nước nằm dưới đất' };
// Hành động ở điểm lộ trình chạy trốn (act): drift quẹo gắt · crash té xe → bỏ xe chạy bộ
export const ROUTE_ACTS = { drift: '💨 Drift (quẹo gắt, đuôi văng, khói lốp)', crash: '💥 Té xe → bỏ xe chạy bộ' };
// Kiểu xe người lạ chạy trốn / đuổi theo
export const CHASE_BIKES = { sport: 'Tay côn (Exciter)', supersport: 'Sport bike phân khối lớn (đen sọc xanh lá)' };
// =============================================================
import storyData from '../data/story.json' with { type: 'json' };
import { BRANDS } from '../data/apps.js';
import { GOODS } from '../data/goods.js';

export const STORY = storyData;

// Điều kiện xong bước: mã → mô tả (cho công cụ ?editor)
export const UNTIL = {
  none: 'Xong ngay (chỉ làm việc ở "Khi vào bước")',
  wait: 'Chờ … phút game',
  read: 'Đã đọc tin nhắn của …',
  open: 'Đang mở tin nhắn của … (vừa bấm vào cuộc trò chuyện)',
  routed: 'Đã bấm 📍 Chỉ đường tới …',
  ack: 'Người chơi bấm tắt hướng dẫn (hoặc hết … phút game)',
  use: 'Đã dùng món … trong túi đồ',
  reply: 'Đã trả lời tin nhắn của …',
  arrive: 'Tới gần địa điểm …',
  talk: 'Nói chuyện ở địa điểm … (nút E riêng, bong bóng)',
  mount: 'Leo lên xe',
  brand: 'Đã vào 1 hãng xe',
  wear: 'Mặc đồng phục + đội mũ hãng',
  switch: 'Bật công tắc nhận đơn (Giao hàng / Chở khách)',
  fuel: 'Xe đã đổ xăng / sạc pin tới … %',
  order: 'Đơn hàng: có đơn mời / đã nhận / đã đón khách – lấy hàng / đã giao xong',
  near: 'Người lạ … đã đi tới sát người chơi',
  talkActor: 'Người chơi bấm E nói chuyện với người lạ … / NPC địa điểm',
  ordersSince: 'Đã giao thêm … đơn (tính từ lúc vào bước, qua ngày không mất)',
  newDay: 'Đã qua ngày mới (ngủ / nghỉ qua nửa đêm — ngày nào cũng được)',
  clock: 'Đồng hồ trong khoảng … giờ (quá giờ thì chờ hôm sau)',
  bring: 'Đã chở người lạ … (ngồi sau xe) tới gần địa điểm …',
  chosen: 'Người chơi đã chọn câu trả lời (việc "Chọn câu trả lời" mã …)',
  cine: 'Cảnh phim (việc "🎬 Cảnh phim" ở bước này) đã chiếu xong',
  chased: 'Người lạ … (việc "🏍️ Chạy trốn") đã chạy hết lộ trình, người chơi đang bám theo',
  reach: 'Người chơi tới gần chỗ [x, z] trên bản đồ (vd giữa cầu)',
  tackled: 'Việc "🤼 Vật ngã" ở bước này đã xong (người kia bị ghì nằm sấp)',
  escaped: 'Người chơi đã chạy thoát (việc "🏃 Bị rượt" ở bước này: lên xe chạy đi / bỏ xa · chỉ bằng xe: chạy xe bỏ xa, bọn kia biến mất)',
  sneaked: 'Việc "🕵️ Bám theo lén" ở bước này đã xong (người bị bám theo tới điểm cuối mà không phát hiện người chơi)',
  never: 'Chưa viết tiếp — dừng ở bước này (để chỗ cho nội dung sau)',
};
// Mốc của điều kiện "order"
export const ORDER_STAGES = { offer: 'Có đơn mời', accept: 'Đã nhận đơn', pickup: 'Đã đón khách / lấy hàng', deliver: 'Đã giao xong 1 đơn' };
// Việc làm khi vào bước: mã → mô tả
export const ACTIONS = {
  title: 'Hiện tên chương',
  say: 'Hội thoại bằng bong bóng trên đầu người nói (bấm E qua câu)',
  actor: 'Người lạ xuất hiện (chỉ người chơi này thấy)',
  bubble: 'Bong bóng thoại trên đầu (người lạ / người chơi) — không mở hộp thoại',
  approach: 'Người lạ đi (hoặc chạy) tới chỗ người chơi',
  goto: 'Người lạ đi (hoặc chạy) vào địa điểm … rồi biến mất (vd chạy vào trường)',
  react: 'Dấu ? / ! nhảy trên đầu những người … (ngạc nhiên / giật mình)',
  cine: '🎬 Cảnh phim: camera rời người chơi, quay lần lượt các cảnh (địa điểm / người lạ / bám theo người lạ) — khóa điều khiển, đồng hồ vẫn chạy',
  chase: '🏍️ Chạy trốn: người lạ chạy xe theo lộ trình (địa điểm / ngã tư), luôn ở trước người chơi một đoạn — dí mãi không kịp',
  leave: 'Người lạ bỏ đi (chạy mất rồi biến khỏi cảnh)',
  remove: 'Người lạ biến mất (không còn đứng đó)',
  choose: 'Chọn câu trả lời (2–3 câu trên đầu người chơi, phím 1/2/3) — người nói đáp lại theo câu đã chọn',
  board: 'Người lạ lên xe người chơi (ngồi sau, tự đội mũ — không qua app, không tính tiền)',
  alight: 'Người lạ xuống xe (đứng cạnh xe)',
  drop: 'Giao gói hàng cốt truyện đang chở (bỏ khỏi túi)',
  msg: 'Gửi tin nhắn (có thể kèm định vị)',
  replies: 'Gắn 3 câu trả lời nhanh vào tin nhắn',
  item: 'Cho vật phẩm cốt truyện (nằm trong túi đồ)',
  bike: 'Cô Hai cho xe đạp (đặt trong hầm xe)',
  give: 'Tặng đồ dùng (goods.json)',
  toast: 'Thông báo nhỏ',
  openPhone: 'Tự bật điện thoại (mở app …, tin nhắn của …)',
  closePhone: 'Tự cất điện thoại',
  offer: 'Mời 1 đơn cốt truyện: cuốc chở khách thường / đơn giao đồ ăn ở quán … (không hết hạn, không bỏ qua được, không sự cố)',
  fuel: 'Đặt xăng / pin xe đang dùng còn … %',
  sound: 'Phát tiếng (mã âm thanh, vd tiếng la "Cướp!")',
  prop: '🚛 Đạo cụ cảnh phim: xe tải chạy ra chặn đường / tấm ván làm dốc / chó chạy ngang (chạy khi người lạ tới mốc …)',
  dismount: 'Người lạ đang chạy xe dừng hẳn rồi xuống xe, đứng cạnh xe',
  helmetOff: 'Người lạ tháo nón bảo hiểm (2 tay giơ lên gỡ nón, cầm nón trên tay — lộ tóc)',
  helmetOn: 'Người lạ đội nón lại (nón đang cầm trên tay: 2 tay đưa lên chụp xuống đầu)',
  tackle: '🤼 Vật ngã: người bị đuổi chạy về phía người chơi → nút bấm nhanh "E — Chặn lại!" → người lạ … lao tới quật xuống (quay chậm), ghì nằm sấp',
  wave: 'Người lạ vẫy tay chào (tay trái)',
  rideOff: 'Người lạ lên xe của mình chạy đi (đang cầm nón thì đội lại trước, nẹt pô, chạy dọc đường rồi mất)',
  phoneCall: 'Người chơi đưa điện thoại lên tai (gọi điện) / cất điện thoại',
  fade: '⬛ Màn đen + chữ (vd "2 tiếng sau…"): lúc tối dọn người lạ / đạo cụ, tua giờ (như ngủ dậy), người lạ … đứng lại trước mặt người chơi',
  pursue: '🏃 Bị rượt: người lạ … rượt theo người chơi (chạy theo dấu chân) — người chơi tự chạy thoát (lên xe / bỏ xa, hoặc chỉ bằng xe); bị tóm → làm lại / màn thua',
  traffic: '🚧 Giữ vùng vắng xe NPC quanh người chơi (cảnh đứng giữa đường lâu) — bán kính 0 = trả lại xe',
  sneak: '🕵️ Bám theo lén: người lạ … (dắt theo người khác) đi theo lộ trình, thỉnh thoảng ngoái lại — người chơi theo sau không để bị thấy (bị phát hiện / mất dấu → làm lại)',
  end: 'Kết thúc chương (hiện chữ, lưu game)',
};
// Hướng dẫn trên điện thoại (làm sáng nút cần bấm)
// Phần màn hình làm sáng được (hướng dẫn "hud"): mã → [mô tả, bộ chọn]
export const HUD_PARTS = {
  minimap: ['Bản đồ tròn', '#minimap'],
  keys: ['Dòng phím điều khiển dưới cùng', '.hud-keys'],
  goal: ['Dòng mục tiêu giữa trên', '.hud-goal'],
  stats: ['Bảng giờ / tiền / thể lực / tinh thần / xe (góc trên trái)', '.hud-tl'],
  phys: ['Thanh thể lực', '.bar:has(#bPhys)'],
  mental: ['Thanh tinh thần', '.bar:has(#bMental)'],
  vehicle: ['Thanh độ bền xe', '.bar:has(#bHp)'],
  objectives: ['Bảng mục tiêu hôm nay', '.hud-obj'],
  fuel: ['Thanh xăng / pin', '#rFuel'],
  phoneIcon: ['Hình điện thoại cạnh bản đồ', '#phoneIcon'],
  phone: ['Màn hình điện thoại (app đang mở)', '#phone .ph-body'],
};
// Nút trên bong bóng hướng dẫn "hud" / "profile": bấm mới sang bước sau (điều kiện "ack")
export const GUIDE_BTNS = { next: 'Tiếp ▸', ok: 'Đã rõ' };
export const GUIDES = {
  thread: 'Mở tin nhắn của …',
  route: 'Bấm 📍 Chỉ đường trong tin nhắn của …',
  reply: 'Chọn câu trả lời trong tin nhắn của …',
  wear: 'Mở túi đồ, mặc đồng phục + mũ hãng',
  switch: 'Bật công tắc trong app nhận đơn',
  hud: 'Làm sáng một phần màn hình (bản đồ tròn, dòng phím, thanh thể lực / tinh thần / xe…)',
  use: 'Mở túi đồ, dùng món …',
  fuel: 'App Xe → bấm 📍 Chỉ đường tới cây xăng / trụ sạc gần nhất',
  order: 'Có đơn mời: mở app nhận đơn → bấm Nhận',
  profile: 'App nhận đơn → 👤 Hồ sơ, giải thích luật tài khoản',
};

// Tiến độ mới: started = vừa chơi mới (chương 1 chờ bắt đầu sau màn "tới thành phố"), không thì coi như đã xong cốt truyện
export function freshStory(started) {
  return { ch: started ? STORY.chapters[0]?.id ?? null : null, step: -1, fired: false, waited: 0, ev: {}, done: [], items: [], carry: null, picks: {}, traits: { good: 0, neutral: 0, bad: 0 } };
}

export const chapterOf = (s, data = STORY) => (s?.ch ? data.chapters.find((c) => c.id === s.ch) || null : null);
// Bước đang chạy (null = chưa bắt đầu / không có cốt truyện)
export function stepOf(s, data = STORY) {
  const ch = chapterOf(s, data);
  return ch && s.step >= 0 ? ch.steps[s.step] || null : null;
}
// Đang trong một chương (kể cả chờ bắt đầu)
export const storyActive = (s) => !!s?.ch;

// Mũ bảo hiểm hãng tặng (quà có chỗ mặc helmet) — điều kiện "wear"
export function brandHelmet(brand) {
  return (BRANDS[brand]?.gifts || []).map((id) => GOODS[id]).find((g) => g?.type === 'outfit' && g.slot === 'helmet') || null;
}
export function wearsBrandKit(gs) {
  if (!gs.brand || !gs.wearingUniform()) return false;
  const h = brandHelmet(gs.brand);
  return !h || gs.wornIds().helmet === h.id;
}

// Bản lưu đã xong hết các chương có lúc đó (ch = null) mà giờ có thêm chương mới → vào chương kế tiếp (bước đầu).
// Bản lưu cũ không theo cốt truyện (chưa xong chương nào) thì để nguyên.
export function resumeNewChapters(s, data = STORY) {
  if (!s || s.ch || !(s.done || []).length) return;
  const next = data.chapters.find((c) => !s.done.includes(c.id));
  if (!next) return;
  Object.assign(s, { ch: next.id, step: 0, fired: false, waited: 0, ev: {} });
}

// Số thứ tự chương đang chơi (1 = chương 1) — để mở tiệm theo chương (places.json → openChapter).
// Hết cốt truyện / bản lưu cũ (không theo cốt truyện) = Infinity (mọi nơi đều mở)
export function chapterNo(s, data = STORY) {
  if (!s?.ch) return Infinity;
  const i = data.chapters.findIndex((c) => c.id === s.ch);
  return i < 0 ? Infinity : i + 1;
}

// Bắt đầu chương (bước 0) — các việc của bước 0 làm ở lần storyTick kế tiếp
export function beginChapter(s) {
  s.step = 0;
  s.fired = false;
  s.waited = 0;
  s.ev = {};
}

// Điều kiện xong bước. ctx (game.js / bộ thử cung cấp): { near(place, r), mounted, switchOn(which), threadOpen(who), routed(place), orderStage }
// orderStage: 'offer' (có đơn mời) · 'accept' (đã nhận, đang tới chỗ lấy) · 'pickup' (đang chở khách / hàng) · null
export function untilMet(u, gs, ctx) {
  const s = gs.story;
  switch (u?.type || 'none') {
    case 'none': return true;
    case 'wait': return s.waited >= (u.min || 0);
    case 'read': {
      const t = gs.inbox.threads[u.who];
      return !!t && t.msgs.length > 0 && !t.unread;
    }
    case 'reply': return !!s.ev[`reply:${u.who}`];
    case 'open': return !!ctx.threadOpen?.(u.who);
    case 'routed': return !!ctx.routed?.(u.place) || (u.place !== 'office' && !!ctx.near?.(u.place, 15)); // tự đi tới nơi trước khi bấm 📍 → cũng xong
    case 'ack': return !!s.ev.ack || (u.max > 0 && s.waited >= u.max);
    case 'use': return !!s.ev[`use:${u.goods}`];
    case 'arrive': return !!ctx.near?.(u.place, u.r || 8);
    case 'talk': return !!s.ev[`talk:${u.place}`];
    case 'mount': return !!ctx.mounted;
    case 'brand': return !!gs.brand;
    case 'wear': return wearsBrandKit(gs);
    case 'switch': return !!ctx.switchOn?.(u.which);
    case 'fuel': return gs.power === 'pedal' || gs.fuel >= (gs.vehicleSpec?.tank || 0) * ((u.pct ?? 90) / 100) - 1e-6;
    case 'near': return !!ctx.actorNear?.(u.who, u.r || 1.6);
    case 'talkActor': return !!s.ev[`actor:${u.who}`];
    case 'chosen': return s.picks?.[u.id] != null;
    case 'cine': return !!s.ev.cineDone;
    case 'chased': return !!s.ev[`chased:${u.who}`] || !!ctx.chased?.(u.who);
    case 'reach': return !!ctx.reachAt?.(u.at, u.r || 8);
    case 'tackled': return !!s.ev.tackled;
    case 'sneaked': return !!s.ev.sneaked;
    case 'escaped': return !!s.ev.escaped;
    case 'never': return false;
    case 'ordersSince': return (gs.account?.completed || 0) - (s.base || 0) >= (u.n || 1);
    case 'newDay': return (gs.day || 1) > (s.baseDay ?? gs.day ?? 1);
    case 'clock': return inWindow(((ctx.now ?? 0) % 1440 + 1440) % 1440 / 60, u.from ?? 0, u.to ?? 24);
    case 'bring': return !!ctx.actorBoarded?.(u.who) && !!ctx.near?.(u.place, u.r || 8);
    case 'order': {
      if (u.stage === 'deliver') return !!s.ev.delivered;
      const at = ORDER_RANK[ctx.orderStage] ?? -1;
      return at >= (ORDER_RANK[u.stage] ?? 9) || !!s.ev.delivered;
    }
    default: return false;
  }
}

const ORDER_RANK = { offer: 0, accept: 1, pickup: 2 };

// Mỗi lần game chạy (không tính lúc đang mở hộp thoại): dt = số phút game vừa trôi.
// Trả về danh sách việc cần làm ngay (on của bước vừa tới hạn); bước xong thì tự sang bước sau.
// Đang trong chương = đã hiện tên chương (bước có việc "title") mà chưa hết chương → không có đơn thường,
// chỉ có đơn do cốt truyện mời (việc "offer"). Hết chương mới có đơn lại.
export function inChapter(s, data = STORY) {
  const ch = chapterOf(s, data);
  if (!ch || s.step < 0) return false;
  const t = ch.steps.findIndex((x) => (x.on || []).some((a) => a.do === 'title'));
  return t >= 0 && (s.step > t || (s.step === t && s.fired));
}
// Bước sắp hiện tên chương (chưa chạy)
export const titleNext = (s, data = STORY) => { const st = stepOf(s, data); return !!st && !s.fired && (st.on || []).some((a) => a.do === 'title'); };

export function storyTick(gs, dt, ctx, data = STORY) {
  const s = gs.story;
  let st = stepOf(s, data);
  // bước chưa chạy mà chỉ dành cho tính cách khác → bỏ qua, sang bước sau
  while (st && !s.fired && skipStep(s, st, ctx.now)) {
    s.step += 1;
    s.waited = 0;
    s.ev = {};
    if (s.step >= chapterOf(s, data).steps.length) { finishChapter(s, data); return []; }
    st = stepOf(s, data);
  }
  if (!st) return [];
  s.waited += dt;
  // hạn giờ (deadline): quá hạn → quay lại bước "back" (việc "fail" báo cho game dọn cảnh: người lạ, thông báo, tin nhắn)
  if (st.deadline && ctx.now != null) {
    if (s.due == null) s.due = dueAt(ctx.now, st.deadline.hour ?? 9);
    if (ctx.now >= s.due) {
      const back = chapterOf(s, data).steps.findIndex((x) => x.id === st.deadline.back);
      Object.assign(s, { step: Math.max(0, back), fired: false, waited: 0, ev: {} });
      delete s.due;
      return [{ do: 'fail', ...st.deadline }];
    }
  } else if (s.due != null) delete s.due; // ra khỏi chuỗi bước có hạn
  if (!s.fired) {
    if (s.waited < (st.delay || 0)) return [];
    if (ctx.busy?.() && (st.on || []).some((a) => a.do === 'title')) return []; // đang chạy đơn: giao xong mới vào chương
    s.fired = true;
    s.waited = 0;
    if (st.until?.type === 'ordersSince') s.base = gs.account?.completed || 0; // đếm đơn từ lúc này
    if (st.until?.type === 'newDay') s.baseDay = gs.day || 1; // qua ngày tính từ ngày này
    return st.on || [];
  }
  if (!untilMet(st.until, gs, ctx)) return [];
  s.step += 1;
  s.fired = false;
  s.waited = 0;
  s.ev = {};
  if (s.step >= chapterOf(s, data).steps.length) finishChapter(s, data); // hết bước mà chưa có "end": tự kết thúc
  return [];
}

// Kết thúc chương đang chạy → sang chương sau (nếu có), không thì hết cốt truyện
export function finishChapter(s, data = STORY) {
  const i = data.chapters.findIndex((c) => c.id === s.ch);
  if (s.ch && !s.done.includes(s.ch)) s.done.push(s.ch);
  const next = data.chapters[i + 1];
  s.ch = next ? next.id : null;
  s.step = next ? 0 : -1;
  s.fired = false;
  s.waited = 0;
  s.ev = {};
}

// Người lạ đang có mặt (việc "actor" ở các bước đã chạy, chưa bị "leave" / "remove") → { who: việc actor }.
// Mở lại game giữa chương: game.js dựng lại những người này (chỗ đứng cố định — kiểu "near" thì không dựng lại).
export function actorsPresent(s, data = STORY) {
  const ch = s?.ch && data.chapters.find((c) => c.id === s.ch);
  const out = {};
  if (!ch) return out;
  const last = Math.max(0, s.fired ? s.step : s.step - 1); // người lạ ở bước đầu chương đứng sẵn từ trước khi chương bắt đầu
  for (const st of ch.steps.slice(0, last + 1)) {
    if (skipStep(s, st)) continue;
    for (const a of st.on || []) {
      if (a.do === 'actor' || a.do === 'chase') out[a.who] = a;
      if (a.do === 'leave' || a.do === 'remove' || a.do === 'goto' || a.do === 'rideOff') delete out[a.who];
      if (a.do === 'fade') for (const w of [].concat(a.remove || [])) delete out[w]; // dọn lúc màn đen
    }
  }
  return out;
}

// Người chơi chọn câu trả lời thứ i ở lựa chọn id (lưu lại cho chương sau) · gain { trait, pts }: cộng điểm tính cách của câu đó
export function storyPick(s, id, i, gain = null) {
  if (!s?.ch) return;
  s.picks ||= {};
  if (s.picks[id] != null) return; // mỗi lựa chọn chỉ tính 1 lần
  s.picks[id] = i;
  if (gain && TRAITS[gain.trait] && gain.pts > 0) {
    s.traits ||= { good: 0, neutral: 0, bad: 0 };
    s.traits[gain.trait] = (s.traits[gain.trait] || 0) + gain.pts;
  }
}

// Đang nghiêng về tính cách nào: nhiều điểm nhất thắng; bằng điểm nhau (kể cả chưa có điểm) → trung lập
export function leaning(s) {
  const t = s?.traits || {};
  const best = Math.max(t.good || 0, t.neutral || 0, t.bad || 0);
  const top = Object.keys(TRAITS).filter((k) => (t[k] || 0) === best);
  return top.length === 1 ? top[0] : 'neutral';
}
// Mốc giờ (phút tuyệt đối) lần tới đồng hồ chỉ hour giờ, tính từ now (đúng lúc đó thì là now)
export function dueAt(now, hour) {
  const tod = ((now % 1440) + 1440) % 1440;
  return now + ((((hour * 60 - tod) % 1440) + 1440) % 1440);
}
// Giờ h (0–24) có nằm trong khoảng [from, to) không — khoảng qua nửa đêm (vd 22 → 2) cũng được
function inWindow(h, from, to) {
  return from <= to ? h >= from && h < to : h >= from || h < to;
}
// Số đơn đã giao kể từ lúc vào bước "ordersSince" (để hiện "Giao 10 đơn (n/10)")
export function ordersProgress(gs) {
  const st = stepOf(gs.story);
  if (!st || st.until?.type !== 'ordersSince' || !gs.story.fired) return null;
  return { n: Math.max(0, (gs.account?.completed || 0) - (gs.story.base || 0)), goal: st.until.n || 1 };
}
// Bước dành riêng cho tính cách khác (onlyTrait) → bỏ qua
// … hoặc chỉ chạy trước giờ onlyBefore / từ giờ onlyAfter trong ngày (now = giờ chung; không có giờ thì bỏ qua điều kiện giờ)
const skipStep = (s, st, now = null) => {
  if (st?.onlyTrait && leaning(s) !== st.onlyTrait) return true;
  if (now == null || (st?.onlyBefore == null && st?.onlyAfter == null)) return false;
  const h = (((now % 1440) + 1440) % 1440) / 60;
  return (st.onlyBefore != null && h >= st.onlyBefore) || (st.onlyAfter != null && h < st.onlyAfter);
};

// Ghi một việc người chơi vừa làm (đã trả lời tin của X, đã nói chuyện ở Y…) để bước đang chạy kiểm tra
export function storyEvent(s, key) {
  if (s?.ch) s.ev[key] = true;
}
