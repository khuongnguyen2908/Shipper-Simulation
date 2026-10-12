// Thẻ 🔊 ÂM THANH (sounds.json): gắn file âm thanh cho từng chỗ trong game phát tiếng.
// Danh mục chỗ phát tiếng (mã, tên, khi nào) nằm trong code: src/data/soundSpec.js — danh sách đầy đủ ở docs/am-thanh.md.
// File đặt trong src/sounds/ (tải lên ngay ở đây khi chạy npm run dev). Mã chưa gắn file → game dùng tiếng tổng hợp (nếu có).
import { SOUNDS, SOUND_CATS, SOUND_FILE_RE, SOUND_EXT } from '../../data/soundSpec.js';
import { el, field, numInput, button, sideList, selectInput } from './ui.js';

const KIND = { sfx: 'Tiếng ngắn', loop: 'Tiếng lặp liên tục', music: 'Bài nhạc' };
const lib = { files: null, error: null, loading: false }; // file đang có trong src/sounds (hỏi máy chủ dev)
let player = null; // đang nghe thử

function loadFiles(ctx) {
  if (lib.loading) return;
  lib.loading = true;
  fetch('/__editor/sounds')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j) => { lib.files = j.files || []; lib.error = null; })
    .catch(() => { lib.files = lib.files || []; lib.error = 'Không nói chuyện được với máy chủ dev (chạy npm run dev để tải file lên / nghe thử).'; })
    .finally(() => { lib.loading = false; ctx.rerender(); });
}

// Nghe thử: âm lượng = âm lượng của mã (100% = mức gốc)
function preview(name, level = 1) {
  player?.pause();
  player = new Audio(`/src/sounds/${encodeURIComponent(name)}`);
  player.volume = Math.max(0, Math.min(1, level * 0.8));
  player.play().catch(() => {});
}

// Tên file gọn: bỏ dấu, chữ thường, khoảng trắng → "-"
const cleanName = (n) => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9_.\-]+/g, '-').replace(/-+/g, '-');

function upload(ctx, file, onDone) {
  const name = cleanName(file.name);
  if (!SOUND_FILE_RE.test(name)) return alert(`File phải có đuôi ${SOUND_EXT.join(', ')}.`);
  if (file.size > 15 * 1024 * 1024) return alert('File quá lớn (tối đa 15 MB). Nhạc nên xuất .ogg / .mp3 để nhẹ.');
  const rd = new FileReader();
  rd.onload = () => {
    const data = String(rd.result).split(',')[1] || '';
    fetch('/__editor/sound-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, data }) })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'lỗi');
        if (!lib.files.includes(j.name)) lib.files.push(j.name);
        onDone(j.name);
      })
      .catch((e) => alert(`Không tải lên được: ${e.message}`));
  };
  rd.readAsDataURL(file);
}

export function render(root, ctx) {
  const data = (ctx.data.sounds = ctx.data.sounds || { sounds: {} });
  data.sounds = data.sounds && typeof data.sounds === 'object' ? data.sounds : {};
  const sel = (ctx.sel.sound = ctx.sel.sound || {});
  if (!SOUNDS[sel.id]) sel.id = Object.keys(SOUNDS)[0];
  const changed = () => ctx.changed('sounds');
  if (lib.files == null) loadFiles(ctx);
  const filesOf = (id) => data.sounds[id]?.files || [];
  const status = (id) => (filesOf(id).length ? '🎧' : SOUNDS[id].synth ? '🔉' : '🔇');

  // ---------- bên trái: mọi chỗ phát tiếng, theo nhóm ----------
  const side = el('aside', { class: 'ed-side' });
  const drawSide = () => {
    side.innerHTML = '';
    const ids = Object.keys(SOUNDS);
    const done = ids.filter((id) => filesOf(id).length).length;
    side.append(
      el('div', { class: 'side-head' }, el('b', {}, `Âm thanh · đã gắn ${done}/${ids.length}`)),
      el('small', { class: 'muted', style: 'display:block;padding:0 10px 6px' }, '🎧 có file · 🔉 đang dùng tiếng tổng hợp · 🔇 chưa có tiếng'),
      sideList(
        ids.map((id) => ({ id, icon: status(id), title: SOUNDS[id].label, sub: `${SOUND_CATS[SOUNDS[id].cat] || ''} · ${id}` })),
        sel.id,
        (id) => ctx.select('sound', { id }),
        { key: 'sound', issuesFor: (id) => ctx.issues.filter((i) => i.tab === 'sound' && i.ref === id) },
      ),
    );
  };
  drawSide();
  ctx.refreshSide = drawSide;

  // ---------- bên phải: mã đang chọn ----------
  const body = el('section', { class: 'ed-body' });
  root.append(el('div', { class: 'ed-split' }, side, body));
  const id = sel.id, spec = SOUNDS[id];
  const entry = () => (data.sounds[id] = data.sounds[id] || { files: [] });
  const cleanup = () => { const e = data.sounds[id]; if (e && !(e.files || []).length && (e.volume ?? 1) === 1) delete data.sounds[id]; }; // không gắn gì → bỏ khỏi file
  const opt = (fieldKey) => ({ ref: id, fieldKey });
  body.append(
    el('div', { class: 'body-head' }, el('h2', {}, `${status(id)} ${spec.label}`), el('span', { class: 'pill' }, id)),
    el('p', { class: 'muted' }, `${SOUND_CATS[spec.cat]} · ${KIND[spec.kind]} · Phát khi: ${spec.where}. ` +
      (spec.synth ? 'Chưa gắn file thì game dùng tiếng tổng hợp có sẵn.' : 'Chưa gắn file thì im lặng.') +
      (spec.kind === 'music' ? ' Gắn nhiều bài → phát lần lượt, hết vòng lại; 1 bài → lặp lại. Âm lượng theo thanh Nhạc trong Cài đặt.' : spec.kind === 'loop' ? ' Lặp liên tục (chỉ dùng file đầu tiên); nên cắt file nối vòng êm. Âm lượng theo thanh Hiệu ứng.' : ' Gắn nhiều file → mỗi lần phát chọn ngẫu nhiên 1 file (đỡ nhàm, vd tiếng bước chân). Âm lượng theo thanh Hiệu ứng.')),
  );
  if (lib.error) body.append(el('p', { class: 'warn' }, lib.error));

  // danh sách file đã gắn
  const files = filesOf(id);
  body.append(field('File đã gắn', el('div', { class: 'snd-files' },
    files.length ? files.map((f, i) => el('div', { class: 'snd-row' },
      el('b', {}, f),
      lib.files && !lib.files.includes(f) ? el('span', { class: 'warn' }, ' ⚠️ không thấy file') : null,
      button('▶ Nghe', () => preview(f, data.sounds[id]?.volume ?? 1), 'small'),
      button('✕ Bỏ', () => { entry().files.splice(i, 1); cleanup(); changed(); ctx.rerender(); }, 'small'))) : el('span', { class: 'muted' }, 'Chưa gắn file nào.')),
  opt('files')));

  // gắn thêm: chọn file có sẵn trong src/sounds hoặc tải file mới lên
  const avail = (lib.files || []).filter((f) => !files.includes(f));
  const add = (name) => { const e = entry(); if (!e.files.includes(name)) e.files.push(name); changed(); ctx.rerender(); };
  const input = el('input', { type: 'file', accept: SOUND_EXT.map((x) => `.${x}`).join(','), style: 'display:none' });
  input.addEventListener('change', () => { if (input.files[0]) upload(ctx, input.files[0], add); });
  body.append(field('Gắn thêm', el('div', { class: 'inline' },
    avail.length ? selectInput('', [['', '— chọn file có sẵn —'], ...avail.map((f) => [f, f])], (v) => v && add(v)) : el('span', { class: 'muted' }, lib.files ? 'Chưa có file nào khác trong src/sounds.' : 'Đang tải danh sách…'),
    input,
    button('⬆️ Tải file lên', () => input.click(), 'small'),
  ), { ref: id, fieldKey: 'add', hint: `Đuôi ${SOUND_EXT.join(', ')}. File được chép vào thư mục src/sounds/ (tên tự đổi thành chữ không dấu). Nhạc nên dùng .ogg / .mp3 cho nhẹ — mọi file được gói chung vào dist/index.html.` }));

  body.append(el('div', { class: 'grid' },
    field('Âm lượng riêng (%)', numInput(data.sounds[id]?.volume ?? 1, (v) => { entry().volume = Number.isFinite(v) ? v : 1; cleanup(); changed(); }, { step: 5, min: 0, max: 2, scale: 100 }), { ...opt('volume'), hint: '100% = như file gốc. Chỉnh để các tiếng to nhỏ đều nhau (0–200%).' }),
    files.length ? field('', button('▶ Nghe thử (ngẫu nhiên 1 file)', () => preview(files[Math.floor(Math.random() * files.length)], data.sounds[id]?.volume ?? 1)), opt('play')) : null,
  ));
  body.append(el('p', { class: 'muted' }, 'Danh sách mọi chỗ phát tiếng (để đánh dấu khi làm sound): docs/am-thanh.md. Lưu xong, tab game tự tải lại và dùng file mới.'));
}
