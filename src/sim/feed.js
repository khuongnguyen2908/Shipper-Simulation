// APP TÍCH TẮC (chỉ để vui, không ảnh hưởng gameplay): danh sách tin lướt được trong điện thoại.
// Mẫu tin nằm ở vi.json (sửa ở ?editor → Chữ & hội thoại), mỗi dòng: "[loại ảnh] @tác_giả | chú thích | nhạc nền | chữ trên ảnh"
//   loại ảnh: photo:here (ảnh chụp đúng chỗ của tin: đường ngập, quán khai trương…) · photo:food (quán ăn / cà phê bất kỳ)
//             photo:place (địa điểm bất kỳ) · photo:<mã địa điểm> (đúng nơi đó, vd photo:tra = Tiệm Trà A Di Đà)
//             clip:dog | dance | food | rain | text | meme (clip vẽ động)
// tt.spot = tin quán quen (vd tiệm trà chị Linh): lần nào làm mới danh sách cũng lấy 2 tin
//   chữ trên ảnh (tùy chọn): dòng chữ to hiện trên ảnh / clip
// Tin nóng (tt.hot.*) lấy từ chuyện đang xảy ra trong game hôm đó (facts, game.js gom), tin về mình (tt.me.*), tin vui (tt.fun).
// Thuần dữ liệu: không Three.js, không DOM; ngẫu nhiên có seed (cùng ngày + cùng giờ → cùng danh sách).
import { list } from '../content/index.js';
import { makeRng } from './rng.js';
import { untag } from './people.js';

const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? p[k] : m));

// "[photo:food] @anuong | Phở ngon | nhạc - anuong | ĐỈNH NÓC" → { media, author, caption, music, overlay }
export function parsePost(line, params = {}) {
  const { tags, text } = untag(line);
  const [author = '', caption = '', music = '', overlay = ''] = fill(text, params).split('|').map((s) => s.trim());
  const m = tags.find((t) => /^(photo|clip):/.test(t)) || 'clip:text';
  const [type, what] = m.split(':');
  return { media: { type, what }, author: author.replace(/^@?/, '@'), caption, music, overlay };
}

// Số like / bình luận kiểu "12,4K", "1,2M"
export function fmtCount(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace('.', ',')}K`;
  return String(Math.round(n));
}

// facts: { forecast, raining, heavy, flood: [{ street, at }], tide: { from, peak, to } | null, jams: [{ street, at }],
//          police: [{ place, at }], openings: [{ place, at }], scam: { place, at } | null, wallet: bool,
//          me: { name, orders, stars, day } }
// places: địa điểm đã đặt (để chụp ảnh quán / nơi bất kỳ) · seed: đổi theo ngày + khung giờ (tin nóng cập nhật)
export function buildFeed({ facts = {}, places = [], seed = 1, fun = 18 } = {}) {
  const rng = makeRng(seed);
  const out = [];
  const one = (key, params = {}, at = null, hot = false) => {
    const lines = list(key);
    if (!lines.length || String(lines[0]).startsWith('⟦')) return;
    const p = parsePost(rng.pick(lines), params);
    if (p.media.what === 'here') p.media.at = at;
    out.push({ ...p, hot, key });
  };
  // ---- tin nóng: chuyện đang xảy ra ----
  if (facts.forecast) one('tt.hot.forecast', { forecast: facts.forecast }, null, true);
  if (facts.raining) one(facts.heavy ? 'tt.hot.rainHeavy' : 'tt.hot.rain', {}, null, true);
  for (const f of (facts.flood || []).slice(0, 2)) one('tt.hot.flood', { street: f.street }, f.at, true);
  if (facts.tide) one('tt.hot.tide', facts.tide, null, true);
  for (const j of (facts.jams || []).slice(0, 2)) one('tt.hot.jam', { street: j.street }, j.at, true);
  for (const c of (facts.police || []).slice(0, 1)) one('tt.hot.police', { place: c.place }, c.at, true);
  for (const o of (facts.openings || []).slice(0, 2)) one('tt.hot.opening', { place: o.place }, o.at, true);
  if (facts.scam) one('tt.hot.scam', { place: facts.scam.place }, facts.scam.at, true);
  if (facts.wallet) one('tt.hot.wallet', {}, null, true);
  // ---- tin về mình ----
  const me = facts.me;
  if (me) {
    if (me.orders >= 10) one('tt.me.orders', { name: me.name, n: me.orders });
    else if (me.day <= 1) one('tt.me.newbie', { name: me.name });
    if (me.orders >= 3 && me.stars >= 4.8) one('tt.me.rating', { name: me.name, stars: me.stars.toFixed(2) });
  }
  // ---- tin quán quen: luôn có 2 tin ----
  const spot = rng.shuffle(list('tt.spot').filter((s) => !String(s).startsWith('⟦')));
  for (const line of spot.slice(0, 2)) out.push({ ...parsePost(line), hot: false, key: 'tt.spot' });
  // ---- tin vui ngẫu nhiên (không lặp mẫu) ----
  const pool = rng.shuffle(list('tt.fun').filter((s) => !String(s).startsWith('⟦')));
  for (const line of pool.slice(0, fun)) out.push({ ...parsePost(line), hot: false, key: 'tt.fun' });
  // trộn: tin nóng nằm rải ở đầu (cứ 2–3 tin vui có 1 tin nóng), tin vui lấp phần còn lại
  const hot = out.filter((p) => p.hot), rest = rng.shuffle(out.filter((p) => !p.hot));
  const feed = [];
  while (hot.length || rest.length) {
    if (hot.length) feed.push(hot.shift());
    for (let k = rng.int(1, 2); k > 0 && rest.length; k--) feed.push(rest.shift());
  }
  // chỗ chụp ảnh cho "photo:food" / "photo:place" + số like, bình luận, mã tin
  const food = places.filter((p) => ['restaurant', 'cafe'].includes(p.kind) && p.door);
  const any = places.filter((p) => p.door && p.kind !== 'gate');
  feed.forEach((p) => {
    if (p.media.type === 'photo' && !p.media.at && !['here', 'food', 'place'].includes(p.media.what)) {
      const pl = places.find((q) => q.id === p.media.what && q.door); // photo:<mã địa điểm>
      if (pl) p.media.at = { placeId: pl.id };
    }
    if (p.media.type === 'photo' && !p.media.at) {
      const pl = rng.pick(p.media.what === 'food' && food.length ? food : any);
      if (pl) p.media.at = { placeId: pl.id };
    }
    if (p.media.type === 'photo' && !p.media.at) p.media = { type: 'clip', what: 'text' }; // không có chỗ chụp → clip chữ
    p.likes = Math.round(Math.exp(rng.range(Math.log(300), Math.log(p.hot ? 2e6 : 4e5))));
    p.comments = Math.round(p.likes * rng.range(0.01, 0.06));
    // mã tin cố định theo nội dung (đổi giờ, danh sách làm lại thì tin cũ vẫn giữ tim đã thả, ảnh đã chụp)
    p.id = `${p.key}:${[...(p.author + p.caption)].reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0, 2166136261).toString(36)}`;
  });
  return feed;
}
