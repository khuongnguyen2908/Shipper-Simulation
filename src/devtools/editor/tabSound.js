// Thẻ 🔊 ÂM THANH (sounds.json): gắn file âm thanh cho từng chỗ trong game phát tiếng.
// Danh mục chỗ phát tiếng (mã, tên, khi nào) nằm trong code: src/data/soundSpec.js — danh sách đầy đủ ở docs/am-thanh.md.
// File đặt trong src/sounds/ (tải lên ngay ở đây khi chạy npm run dev). Mã chưa gắn file → game dùng tiếng tổng hợp (nếu có).
import { SOUNDS, SOUND_CATS, SOUND_FILE_RE, SOUND_EXT } from '../../data/soundSpec.js';
import { el, field, numInput, button, sideList, selectInput } from './ui.js';
import { previewSynth } from '../../audio.js';

const KIND = { sfx: 'Tiếng ngắn', loop: 'Tiếng lặp liên tục', music: 'Bài nhạc' };
const lib = { files: null, error: null, loading: false }; // file đang có trong src/sounds (hỏi máy chủ dev)
const kho = { files: null, loading: false, shown: 40 }; // kho tiếng để nghe thử (thư mục sound-library, không gói vào game)
const LIB_SHOW = 40; // số dòng kho hiện mỗi lần (bấm "xem thêm" để hiện tiếp)

function loadFiles(ctx) {
  if (lib.loading) return;
  lib.loading = true;
  fetch('/__editor/sounds')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j) => { lib.files = j.files || []; lib.error = null; })
    .catch(() => { lib.files = lib.files || []; lib.error = 'Không nói chuyện được với máy chủ dev (chạy npm run dev để tải file lên / nghe thử).'; })
    .finally(() => { lib.loading = false; ctx.rerender(); });
}
function loadKho(ctx) {
  if (kho.loading) return;
  kho.loading = true;
  fetch('/__editor/sound-library')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j) => { kho.files = j.files || []; })
    .catch(() => { kho.files = []; })
    .finally(() => { kho.loading = false; ctx.rerender(); });
}

// ---------- nghe thử: mỗi lúc chỉ phát 1 tiếng; nút ▶ Nghe đang phát thì thành ■ Dừng ----------
const now = { audio: null, url: '', btns: new Set(), loop: '' }; // loop: mã tiếng tổng hợp lặp đang phát
const PLAY = '▶ Nghe', STOP = '■ Dừng';
function stopPreview() {
  now.audio?.pause();
  now.audio = null;
  now.url = '';
  if (now.loop) previewSynth(now.loop, false);
  now.loop = '';
  for (const b of now.btns) { b.textContent = b.dataset.label || PLAY; b.classList.remove('playing'); }
  now.btns.clear();
}
// url: đường dẫn file · level: âm lượng của mã (100% = mức gốc) · btn: nút bấm để đổi chữ
function togglePreview(url, level, btn) {
  if (now.url === url && now.btns.has(btn)) return stopPreview();
  stopPreview();
  const a = new Audio(url);
  a.volume = Math.max(0, Math.min(1, level * 0.8));
  now.audio = a;
  now.url = url;
  now.btns.add(btn);
  btn.textContent = STOP;
  btn.classList.add('playing');
  a.addEventListener('ended', () => { if (now.audio === a) stopPreview(); });
  a.play().catch(() => { if (now.audio === a) stopPreview(); });
}
// nút ▶ Nghe / ■ Dừng; getUrl gọi lúc bấm (vd chọn ngẫu nhiên 1 file)
function playButton(getUrl, getLevel = () => 1, label = PLAY) {
  const b = button(label, () => togglePreview(getUrl(), getLevel(), b), 'small');
  b.dataset.label = label;
  return b;
}
// nút nghe tiếng tổng hợp: tiếng ngắn phát 1 lần; tiếng lặp bấm lần nữa (■ Dừng) mới tắt
function synthButton(id, kind, getSpeed) {
  const label = '▶ Nghe tiếng tổng hợp';
  const b = button(label, () => {
    if (kind !== 'loop') { stopPreview(); return previewSynth(id); }
    if (now.loop === id) return stopPreview();
    stopPreview();
    previewSynth(id, true, getSpeed());
    now.loop = id;
    now.btns.add(b);
    b.textContent = STOP;
    b.classList.add('playing');
  }, 'small');
  b.dataset.label = label;
  return b;
}
const soundUrl = (name) => `/src/sounds/${encodeURIComponent(name)}`;
const khoUrl = (p) => `/sound-library/${p.split('/').map(encodeURIComponent).join('/')}`;

// chép file từ kho sang src/sounds → tên file trong src/sounds
function importFromKho(p, onDone) {
  fetch('/__editor/sound-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) })
    .then((r) => r.json())
    .then((j) => {
      if (!j.ok) throw new Error(j.error || 'lỗi');
      if (lib.files && !lib.files.includes(j.name)) lib.files.push(j.name);
      onDone(j.name);
    })
    .catch((e) => alert(`Không chép được: ${e.message}`));
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
  stopPreview(); // vẽ lại → nút cũ mất, dừng tiếng đang nghe
  if (lib.files == null) loadFiles(ctx);
  if (kho.files == null) loadKho(ctx);
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

  // tiếng tổng hợp (tiếng do máy tạo, dùng khi chưa gắn file) — nghe để so với file
  if (spec.synth) {
    const speed = el('input', { type: 'range', min: 0, max: 100, value: 50 });
    speed.addEventListener('input', () => { if (now.loop === id) previewSynth(id, true, speed.value / 100); });
    body.append(field('Tiếng tổng hợp', el('div', { class: 'inline' },
      synthButton(id, spec.kind, () => speed.value / 100),
      spec.synth === 'engine' ? el('label', { class: 'inline', style: 'align-items:center' }, 'Tốc độ xe', speed) : null,
    ), { ref: id, fieldKey: 'synth', hint: filesOf(id).length
      ? 'Mã này đã gắn file nên game KHÔNG dùng tiếng tổng hợp nữa — nút này chỉ để so sánh.'
      : 'Tiếng do máy tự tạo (không cần file), game đang dùng tiếng này. Gắn file thì game dùng file thay thế.' }));
  }

  // danh sách file đã gắn
  const files = filesOf(id);
  body.append(field('File đã gắn', el('div', { class: 'snd-files' },
    files.length ? files.map((f, i) => el('div', { class: 'snd-row' },
      el('b', {}, f),
      lib.files && !lib.files.includes(f) ? el('span', { class: 'warn' }, ' ⚠️ không thấy file') : null,
      playButton(() => soundUrl(f), () => data.sounds[id]?.volume ?? 1),
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
    files.length ? field('', playButton(() => soundUrl(files[Math.floor(Math.random() * files.length)]), () => data.sounds[id]?.volume ?? 1, '▶ Nghe thử (ngẫu nhiên 1 file)'), opt('play')) : null,
  ));

  // ---------- kho tiếng (sound-library): tìm, nghe thử, bấm + Gắn để chép vào src/sounds và gắn cho mã này ----------
  if (kho.files?.length) {
    const box = el('div', { class: 'snd-files snd-kho' });
    const count = el('small', { class: 'muted' });
    const search = el('input', { type: 'search', value: sel.khoQuery || '', placeholder: 'tìm: click, footstep, coin, error, jingles…' });
    const draw = () => {
      if (now.btns.size && [...now.btns].some((b) => box.contains(b))) stopPreview(); // nút đang phát sắp bị xóa
      box.innerHTML = '';
      const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = kho.files.filter((p) => words.every((w) => p.toLowerCase().includes(w)));
      count.textContent = ` ${hits.length}/${kho.files.length} tiếng`;
      const list = hits.slice(0, kho.shown);
      if (!list.length) box.append(el('span', { class: 'muted' }, 'Không có tiếng nào khớp.'));
      for (const p of list) {
        const i = p.lastIndexOf('/');
        box.append(el('div', { class: 'snd-row' },
          el('b', {}, p.slice(i + 1)), el('small', { class: 'muted' }, p.slice(0, i)),
          playButton(() => khoUrl(p), () => data.sounds[id]?.volume ?? 1),
          button('+ Gắn', () => importFromKho(p, add), 'small')));
      }
      if (hits.length > list.length) box.append(button(`Xem thêm (${hits.length - list.length} tiếng nữa)`, () => { kho.shown += LIB_SHOW; draw(); }, 'small'));
    };
    search.addEventListener('input', () => { sel.khoQuery = search.value; kho.shown = LIB_SHOW; draw(); });
    draw();
    body.append(field('Kho tiếng', el('div', {}, el('div', { class: 'inline' }, search, count), box), {
      ref: id, fieldKey: 'kho', wide: true,
      hint: 'Tiếng mẫu trong thư mục sound-library/ (Kenney.nl, CC0 — dùng tự do). Nghe thử thoải mái; bấm "+ Gắn" mới chép file vào src/sounds và gắn cho mã này. Không gắn thì không vào game.',
    }));
  }
  body.append(el('p', { class: 'muted' }, 'Danh sách mọi chỗ phát tiếng (để đánh dấu khi làm sound): docs/am-thanh.md. Lưu xong, tab game tự tải lại và dùng file mới.'));
}
