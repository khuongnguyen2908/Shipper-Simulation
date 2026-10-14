// =============================================================
// CỐT TRUYỆN (chơi một mình) — chạy theo dữ liệu src/data/story.json (thẻ 📖 Cốt truyện của ?editor).
// Mỗi chương = danh sách bước. Mỗi bước:
//   delay  — chờ bấy nhiêu phút game rồi mới làm các việc ở "on" (tin nhắn tới trễ một chút cho giống thật)
//   on     — việc làm khi vào bước: gửi tin nhắn, hiện hội thoại, cho đồ… (game.js → runStoryActions)
//   until  — điều kiện xong bước (bảng UNTIL bên dưới) → sang bước sau
//   goal / hint / target / guide — mục tiêu trên màn hình, chỗ mũi tên chỉ tới, nút cần làm sáng trên điện thoại
//   talk   — nói chuyện ở một địa điểm (nút E riêng): có thể xếp hàng vào túi (pack) / giao hàng (drop) / tặng đồ (give)
//   mark   — dấu trên đầu NPC ở địa điểm trong lúc chờ bước này: { place, icon: '!' | '?' }
//   hold   — true: app chưa phát đơn thường trong lúc chờ bước này (để hướng dẫn / đơn cốt truyện không bị đơn khác chen vào)
// Tiến độ lưu trong GameState.story: { ch, step, fired, waited, ev, done, items, carry }.
// Chơi nhiều người: cốt truyện là của RIÊNG từng người (lưu trong save của mình), không dừng / tua đồng hồ chung.
// Chữ hiển thị ở vi.json (khóa story.*).
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
  talk: 'Nói chuyện ở địa điểm … (nút E riêng)',
  mount: 'Leo lên xe',
  brand: 'Đã vào 1 hãng xe',
  wear: 'Mặc đồng phục + đội mũ hãng',
  switch: 'Bật công tắc nhận đơn (Giao hàng / Chở khách)',
  fuel: 'Xe đã đổ xăng / sạc pin tới … %',
  order: 'Đơn hàng: có đơn mời / đã nhận / đã đón khách – lấy hàng / đã giao xong',
};
// Mốc của điều kiện "order"
export const ORDER_STAGES = { offer: 'Có đơn mời', accept: 'Đã nhận đơn', pickup: 'Đã đón khách / lấy hàng', deliver: 'Đã giao xong 1 đơn' };
// Việc làm khi vào bước: mã → mô tả
export const ACTIONS = {
  title: 'Hiện tên chương',
  say: 'Hội thoại (hộp thoại giữa màn hình)',
  msg: 'Gửi tin nhắn (có thể kèm định vị)',
  replies: 'Gắn 3 câu trả lời nhanh vào tin nhắn',
  item: 'Cho vật phẩm cốt truyện (nằm trong túi đồ)',
  bike: 'Cô Hai cho xe đạp (đặt trong hầm xe)',
  give: 'Tặng đồ dùng (goods.json)',
  toast: 'Thông báo nhỏ',
  openPhone: 'Tự bật điện thoại (mở app …, tin nhắn của …)',
  closePhone: 'Tự cất điện thoại',
  offer: 'Mời 1 cuốc chở khách cốt truyện (gần mình, không hết hạn, không bỏ qua được)',
  fuel: 'Đặt xăng / pin xe đang dùng còn … %',
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
  return { ch: started ? STORY.chapters[0]?.id ?? null : null, step: -1, fired: false, waited: 0, ev: {}, done: [], items: [], carry: null };
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
export function storyTick(gs, dt, ctx, data = STORY) {
  const s = gs.story;
  const st = stepOf(s, data);
  if (!st) return [];
  s.waited += dt;
  if (!s.fired) {
    if (s.waited < (st.delay || 0)) return [];
    s.fired = true;
    s.waited = 0;
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

// Ghi một việc người chơi vừa làm (đã trả lời tin của X, đã nói chuyện ở Y…) để bước đang chạy kiểm tra
export function storyEvent(s, key) {
  if (s?.ch) s.ev[key] = true;
}
