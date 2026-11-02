// Thẻ ⏳ LOADING (loading.json): logo nhà phát hành (hiện lúc mở game), mẹo + ảnh của loading nhỏ (lúc vào game từ màn hình chính),
// số giây từng màn. Ảnh đặt trong public/loading/ (chép file vào đó rồi bấm 🔄). Chữ nằm ở vi.json khóa loading.* — sửa ngay tại đây.
// Lời khách gọi, chữ bảng hiệu, các bước tải… của màn loading lớn sửa ở thẻ 💬 Chữ & hội thoại (khóa loading.*).
import { el, field, numInput, textInput, selectInput, button, dragHandle, makeSortable } from './ui.js';
import { moveInArray } from './order.js';
import { LOADING_SECS } from '../../data/validate.js';

const IMG_URL = '/loading/';
const imgs = { files: null, loading: false, error: null }; // ảnh đang có trong public/loading (hỏi máy chủ dev)

function loadImages(ctx) {
  if (imgs.loading) return;
  imgs.loading = true;
  fetch('/__editor/loading-images')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j) => { imgs.files = j.files || []; imgs.error = null; ctx.loadingImages = imgs.files; })
    .catch(() => { imgs.files = imgs.files || []; imgs.error = 'Không nói chuyện được với máy chủ dev (chạy npm run dev để xem danh sách ảnh).'; })
    .finally(() => { imgs.loading = false; ctx.changed(); ctx.rerender(); });
}

const SEC_LABEL = {
  logoSec: ['Mỗi logo hiện (giây)', 'Logo nhà phát hành lúc mở game — bấm chuột / phím bất kỳ để bỏ qua.'],
  bootMinSec: ['Loading lớn hiện ít nhất (giây)', 'Máy nhanh tải xong ngay thì vẫn giữ màn phố trôi ngang chừng này cho người chơi kịp xem.'],
  tipSec: ['Đổi mẹo + ảnh sau (giây)', 'Loading nhỏ chờ lâu (mạng chậm) thì cứ chừng này giây đổi sang mẹo khác.'],
  miniMinSec: ['Loading nhỏ hiện ít nhất (giây)', 'Vào game nhanh quá thì vẫn hiện chừng này cho kịp thấy xe chạy.'],
};

export function render(root, ctx) {
  const data = (ctx.data.loading = ctx.data.loading || { logos: [], tips: [] });
  data.logos = Array.isArray(data.logos) ? data.logos : [];
  data.tips = Array.isArray(data.tips) ? data.tips : [];
  const content = ctx.data.content;
  const changed = () => ctx.changed('loading');
  if (!imgs.files && !imgs.loading) loadImages(ctx);

  const body = el('section', { class: 'ed-body ld-body' });
  root.append(body);
  body.append(
    el('div', { class: 'body-head' }, el('h2', {}, '⏳ Loading'), button('🔄 Tải lại danh sách ảnh', () => { imgs.files = null; loadImages(ctx); }, 'small')),
    el('p', { class: 'muted' }, 'Mở game: logo nhà phát hành → loading lớn (phố trôi ngang + thanh tải) → màn hình chính. Bấm Chơi tiếp / Chơi mới / Online: loading nhỏ (ảnh + mẹo, xe chạy tại chỗ). ',
      'Ảnh đặt trong thư mục ', el('code', {}, 'public/loading/'), ' (tên chữ thường không dấu, .jpg .png .webp .svg; ảnh mẹo nên tỉ lệ 2:1, vd 1280×640). Lời khách gọi, chữ bảng hiệu, các bước tải: thẻ 💬 Chữ & hội thoại, khóa ', el('code', {}, 'loading.*'), '.'),
    ...(imgs.error ? [el('p', { class: 'warn' }, imgs.error)] : []),
  );

  // ---------- số giây ----------
  body.append(el('h3', {}, '⏱ Thời gian'), el('div', { class: 'ld-secs' }, Object.entries(LOADING_SECS).map(([k, [lo, hi]]) =>
    field(SEC_LABEL[k][0], numInput(data[k], (v) => { data[k] = v; changed(); }, { step: 0.1, min: lo, max: hi }), { hint: SEC_LABEL[k][1], ref: '', fieldKey: k }))));

  // ---------- ảnh phố thật của loading lớn ----------
  const pano = data.pano;
  body.append(el('h3', {}, '🏙 Phố trôi ngang (loading lớn)'),
    el('p', { class: 'muted' }, 'Ảnh chụp thẳng góc một con đường trong game (nền trời trong suốt, có khách giơ tay vẫy). Chụp lại khi bản đồ đổi: mở game với ',
      el('code', {}, '?debug'), ', bấm F12 gõ ', el('code', {}, 'panorama()'), ' (hoặc ', el('code', {}, 'panorama({ line: 3, from: 0, to: 8 })'), ' để chọn đường) → tải về pano.webp, chép vào public/loading/, dán thông số in ra vào loading.json.'),
    pano?.img ? el('div', { class: 'ld-pano', style: `background-image:url("${IMG_URL}${pano.img}")` }) : null,
    el('div', { class: 'ld-secs' },
      field('Tốc độ xe (m/giây)', numInput(pano?.speed, (v) => { if (pano) { pano.speed = v; changed(); } }, { step: 0.5, min: 1, max: 40 }), { hint: 'Phố trôi nhanh / chậm. 12 m/s ≈ 43 km/h.', ref: 'pano', fieldKey: 'speed' }),
      field('Ảnh', el('span', { class: 'muted' }, pano ? `${pano.img} · ${pano.width}×${pano.height} · ${(pano.people || []).length} khách gọi` : 'chưa có'), { ref: 'pano', fieldKey: 'img' }),
      field('Xe + người lái', data.rider?.img
        ? el('div', { class: 'ld-rider', style: `background-image:url("${IMG_URL}${data.rider.img}");aspect-ratio:${data.rider.width}/${data.rider.height};background-size:${data.rider.frames * 100}% 100%` })
        : el('span', { class: 'muted' }, 'chưa có — dùng hình vẽ'), { ref: 'rider', fieldKey: 'img', hint: 'Chụp từ game (đang ngồi trên xe, đầu xe hướng đông): captureRider() trong src/devtools/panorama.js. Dùng cho cả loading lớn và loading nhỏ.' })));

  // ---------- 1 dòng logo / mẹo: ảnh + chữ (sửa thẳng khóa chữ trong vi.json) ----------
  const imgOptions = (cur) => {
    const files = imgs.files || [];
    const opts = [['', '— chưa có ảnh —'], ...files.map((f) => [f, f])];
    if (cur && !files.includes(cur)) opts.push([cur, `${cur} (không thấy file)`]);
    return opts;
  };
  const row = (list, i, ref, kind) => {
    const it = list[i];
    const thumb = el('div', { class: `ld-thumb ${kind}`, style: it.img ? `background-image:url("${IMG_URL}${it.img}")` : '' }, it.img ? '' : 'Chưa có ảnh');
    const key = it.text || '';
    return el('div', { class: 'ld-row', 'data-sort': '' },
      dragHandle(),
      el('b', { class: 'ld-no' }, i + 1),
      thumb,
      el('div', { class: 'ld-fields' },
        field('Ảnh', selectInput(it.img || '', imgOptions(it.img), (v) => { it.img = v; changed(); ctx.rerender(); }), { ref, fieldKey: 'img' }),
        field(kind === 'logo' ? 'Chữ (khi chưa có ảnh / chữ thay ảnh)' : 'Mẹo', textInput(content[key] ?? '', (v) => { if (key) { content[key] = v; ctx.changed('content'); } }, { placeholder: key ? '' : 'chưa có khóa chữ' }), { ref, fieldKey: 'text', hint: `Khóa chữ: ${key || '—'}` }),
      ),
      button('🗑', () => {
        if (!confirm('Xóa dòng này? (khóa chữ trong vi.json vẫn giữ)')) return;
        list.splice(i, 1);
        changed();
        ctx.rerender();
      }, 'small'),
    );
  };
  // khóa chữ mới chưa trùng: loading.tip.moi1, loading.tip.moi2…
  const newKey = (base) => {
    let n = 1;
    while (`${base}${n}` in content) n++;
    return `${base}${n}`;
  };
  const section = (title, list, kind, hint, keyBase, blank) => {
    const box = el('div', { class: 'ld-list' }, list.map((_, i) => row(list, i, `${kind}${i}`, kind)));
    makeSortable(box, '.ld-row[data-sort]', (from, to) => { moveInArray(list, from, to); changed(); ctx.rerender(); });
    body.append(el('h3', {}, title), el('p', { class: 'muted' }, hint), box,
      field('', button('➕ Thêm', () => {
        const key = newKey(keyBase);
        content[key] = blank;
        ctx.changed('content');
        list.push({ img: '', text: key });
        changed();
        ctx.rerender();
      }, 'small'), { ref: '', fieldKey: kind === 'logo' ? 'logos' : 'tips', wide: true }));
  };
  section('🏷 Logo nhà phát hành', data.logos, 'logo', 'Hiện lần lượt lúc mở game (trước loading lớn). Chưa có ảnh thì hiện chữ.', 'loading.logo.', 'Logo mới');
  section('💡 Mẹo + ảnh (loading nhỏ)', data.tips, 'tip', 'Mỗi lần vào game hiện 1 mẹo ngẫu nhiên; chờ lâu thì đổi lần lượt. Ảnh nên chụp đúng tình huống của mẹo. Mẹo cũng hiện 1 câu dưới thanh tải của loading lớn.', 'loading.tip.moi', 'Mẹo mới');
}
