// =============================================================
// ÂM THANH (Web Audio API)
// Mỗi chỗ trong game gọi sound('mã') — danh mục mã ở src/data/soundSpec.js.
// Mã đã gắn file (src/data/sounds.json, thẻ 🔊 Âm thanh của ?editor; file trong src/sounds/) → phát file
// (nhiều file thì chọn ngẫu nhiên mỗi lần). Chưa gắn file → tiếng tổng hợp bằng máy như trước, không có thì im.
// 2 nhóm âm lượng (Cài đặt): Nhạc (bài nhạc) · Hiệu ứng (mọi tiếng còn lại). Tắt tiếng = tắt cả hai.
// =============================================================
import soundsJson from './data/sounds.json' with { type: 'json' };
import { SOUNDS } from './data/soundSpec.js';
import { SOUND_URLS } from './soundFiles.js';

let ctx = null, master = null, fxBus = null, musicBus = null, loopBus = null;
let duck = 1; // tiếng lặp (máy xe, mưa, phố…) đang được giữ bao nhiêu (bước cốt truyện có nhạc riêng → nhỏ lại cho nhạc nổi lên)
let muted = false;
const vol = { music: 0.6, sfx: 0.8 }; // người chơi chọn (0–1)
const BASE = 0.5; // mức gốc của hiệu ứng
const data = soundsJson.sounds || {};

function ensure() {
  if (ctx) return true;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  fxBus = ctx.createGain();
  fxBus.gain.value = BASE * vol.sfx;
  fxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = vol.music;
  musicBus.connect(master);
  // tiếng lặp đi riêng 1 đường (vẫn thuộc nhóm Hiệu ứng) để hạ nhỏ được mà không đụng tiếng ngắn (còi, la, va chạm…)
  loopBus = ctx.createGain();
  loopBus.gain.value = duck;
  loopBus.connect(fxBus);
  return true;
}

// Trình duyệt chỉ cho phát tiếng sau cú bấm đầu tiên → gọi ở mọi cú bấm / phím
export function unlockAudio() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
  preload();
  if (music.id && !music.track) switchTrack(); // nhạc chờ cú bấm đầu tiên mới phát được
}

export function setMuted(on) {
  muted = !!on;
  if (master) master.gain.value = muted ? 0 : 1;
  applyMusicVolume();
  return muted;
}
// Hạ tiếng lặp (máy xe, mưa, tiếng phố) còn k (0–1) — đang có nhạc riêng của cốt truyện (dí cướp, bị rượt) thì nhạc nổi lên.
// Gọi mỗi khung hình; đổi mức thì nhỏ / to dần ~0,5 giây
export function setLoopDuck(k) {
  if (k === duck) return;
  duck = k;
  if (loopBus) loopBus.gain.setTargetAtTime(k, ctx.currentTime, 0.25);
}
// { music, sfx }: 0–1
export function setVolumes(v) {
  if (Number.isFinite(v.music)) vol.music = Math.max(0, Math.min(1, v.music));
  if (Number.isFinite(v.sfx)) vol.sfx = Math.max(0, Math.min(1, v.sfx));
  if (fxBus) fxBus.gain.value = BASE * vol.sfx;
  applyMusicVolume();
}

// ---------- file âm thanh ----------
const buffers = new Map(); // tên file → AudioBuffer | Promise
const filesOf = (id) => (data[id]?.files || []).filter((f) => SOUND_URLS[f]);
const levelOf = (id) => data[id]?.volume ?? 1;
function load(name) {
  if (buffers.has(name)) return buffers.get(name);
  const p = fetch(SOUND_URLS[name])
    .then((r) => r.arrayBuffer())
    .then((b) => ctx.decodeAudioData(b))
    .then((buf) => { buffers.set(name, buf); return buf; })
    .catch(() => { buffers.set(name, null); return null; });
  buffers.set(name, p);
  return p;
}
// tải sẵn mọi file hiệu ứng đã gắn (lần đầu phát không bị trễ)
let preloaded = false;
function preload() {
  if (preloaded || !ctx) return;
  preloaded = true;
  for (const [id, d] of Object.entries(data)) if (SOUNDS[id]?.kind !== 'music') for (const f of d.files || []) if (SOUND_URLS[f]) load(f);
}
function playBuffer(buf, gain, rate = 1) {
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf;
  s.playbackRate.value = rate;
  g.gain.value = gain;
  s.connect(g).connect(fxBus);
  s.start();
}

// Khoảnh khắc "mạnh nhất" trong file (giây): lần đầu tiếng to tới 90% đỉnh — vd tiếng "rầm" trong file té xe dài có tiếng trượt phía trước
const onsets = new Map();
function onsetOf(buf) {
  if (onsets.has(buf)) return onsets.get(buf);
  const ch = buf.getChannelData(0), win = Math.max(1, Math.floor(buf.sampleRate * 0.01)), env = [];
  for (let i = 0; i < ch.length; i += win) { let m = 0; for (let k = i; k < Math.min(ch.length, i + win); k++) m = Math.max(m, Math.abs(ch[k])); env.push(m); }
  const top = Math.max(...env), at = env.findIndex((m) => m >= top * 0.9) * 0.01;
  onsets.set(buf, at);
  return at;
}
// Chọn trước file sẽ phát cho mã này + thời điểm "mạnh nhất" trong file (null nếu file chưa tải xong / chưa gắn file)
// → chỗ gọi phát sớm đúng chừng đó để khoảnh khắc mạnh nhất trùng sự việc (vd xe đổ). Phát bằng sound(id, { file })
export function soundPick(id) {
  const files = filesOf(id);
  if (!files.length) return { file: null, onset: 0 };
  const file = files[Math.floor(Math.random() * files.length)];
  if (ctx) load(file);
  const b = buffers.get(file);
  return { file, onset: b && !(b instanceof Promise) ? onsetOf(b) : null };
}

// Phát tiếng theo mã. opt: { vol (nhân thêm), rate (tốc độ / cao độ), file (đã chọn trước bằng soundPick) }
export function sound(id, opt = {}) {
  const spec = SOUNDS[id];
  if (!spec || muted || !ensure()) return;
  const files = filesOf(id);
  if (files.length) {
    const name = files.includes(opt.file) ? opt.file : files[Math.floor(Math.random() * files.length)];
    const gain = levelOf(id) * (opt.vol ?? 1) * 2; // ×2: file thường nhỏ hơn tiếng tổng hợp
    const b = buffers.get(name);
    if (b && !(b instanceof Promise)) return playBuffer(b, gain, opt.rate ?? 1);
    const t0 = performance.now();
    Promise.resolve(load(name)).then((buf) => buf && performance.now() - t0 < 600 && playBuffer(buf, gain, opt.rate ?? 1)); // tải lâu quá thì thôi (file hỏng: load trả null)
    return;
  }
  SYNTH[spec.synth]?.();
}

// Tiếng lặp từ file (máy xe, mưa, phố): level 0 = tắt dần. Trả về false nếu mã chưa gắn file (dùng tiếng tổng hợp)
const loops = new Map();
function loopFile(id, level, rate = 1) {
  const files = filesOf(id);
  if (!files.length) return false;
  let L = loops.get(id);
  if (!L) {
    if (level <= 0) return true;
    L = { g: ctx.createGain(), src: null };
    L.g.gain.value = 0;
    L.g.connect(loopBus);
    loops.set(id, L);
    // load() trả về buffer luôn nếu đã tải sẵn (preload) → bọc Promise.resolve (trước đây gọi .then trên buffer → lỗi, tiếng lặp không bao giờ phát)
    Promise.resolve(load(files[0])).then((buf) => {
      if (!buf || loops.get(id) !== L) return;
      L.src = ctx.createBufferSource();
      L.src.buffer = buf;
      L.src.loop = true;
      L.src.connect(L.g);
      L.src.start();
    });
  }
  const t = ctx.currentTime;
  L.g.gain.setTargetAtTime(muted ? 0 : level * levelOf(id) * 2, t, 0.15);
  if (L.src) L.src.playbackRate.setTargetAtTime(rate, t, 0.1);
  return true;
}

// Tiếng lặp gắn với vật trong cảnh (vd máy xe anh mô tô trong cảnh phim): level 0..1 (0 = tắt dần), rate = cao độ theo tốc độ
export function loopSound(id, level, rate = 1) {
  if (!ensure()) return;
  loopFile(id, Math.max(0, Math.min(1, level)), rate);
}

// ---------- nhạc ----------
// Phát bằng Web Audio (giải mã cả bài vào bộ nhớ) để lặp liền mạch: gần hết bài thì lượt sau bắt đầu,
// 2 lượt chồng lên nhau XF giây (tiếng cũ nhỏ dần, tiếng mới to dần) → chỗ nối không bị giật.
// Đổi bài (ngày ↔ đêm, menu ↔ chơi): bài cũ nhỏ dần, bài mới to dần trong SWITCH giây.
const XF = 3; // giây chồng tiếng ở chỗ nối (bài ngắn thì tối đa 1/4 bài)
const SWITCH = 1.5; // giây hòa khi đổi bài
const music = { id: null, track: null };
function applyMusicVolume() {
  if (musicBus) musicBus.gain.value = vol.music; // tắt tiếng: master = 0
}
// đường cong to dần / nhỏ dần giữ độ to đều khi 2 tiếng chồng nhau
const FADE_IN = Float32Array.from({ length: 32 }, (_, i) => Math.sin((i / 31) * Math.PI / 2));
const FADE_OUT = Float32Array.from(FADE_IN).reverse();

// Đổi bài theo mã (music.menu / music.day / music.night); null = tắt. Gọi mỗi khung hình: cùng mã thì chỉ lo lặp tiếp.
// Nhiều file = phát lần lượt (cũng chồng tiếng ở chỗ nối), hết vòng lại
export function setMusic(id) {
  if (id !== music.id) {
    music.id = id;
    if (ctx) switchTrack();
  } else if (music.track) pump(music.track);
}
function switchTrack() {
  const old = music.track;
  music.track = null;
  if (old) {
    old.dead = true;
    clearTimeout(old.timer);
    const t = ctx.currentTime;
    old.out.gain.cancelScheduledValues(t);
    old.out.gain.setValueAtTime(old.out.gain.value, t);
    old.out.gain.linearRampToValueAtTime(0, t + SWITCH);
    setTimeout(() => { for (const p of old.passes) try { p.src.stop(); } catch { /* đã dừng */ } old.out.disconnect(); }, SWITCH * 1000 + 300);
  }
  const list = music.id ? filesOf(music.id) : [];
  if (!list.length) return;
  const out = ctx.createGain(), t = ctx.currentTime;
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(levelOf(music.id), t + (old ? SWITCH : 0.5));
  out.connect(musicBus);
  music.track = { list, i: Math.floor(Math.random() * list.length), out, passes: [], nextAt: 0, timer: 0, busy: false, dead: false };
  pump(music.track);
}
// Lên lịch lượt phát kế tiếp khi còn ~2 giây nữa tới chỗ nối (gọi mỗi khung hình + hẹn giờ dự phòng khi tab bị ẩn)
function pump(tr) {
  if (tr.dead || tr.busy) return;
  const wait = tr.nextAt - 2 - ctx.currentTime;
  if (tr.passes.length && wait > 0) {
    clearTimeout(tr.timer);
    tr.timer = setTimeout(() => pump(tr), Math.max(250, wait * 1000));
    return;
  }
  tr.busy = true;
  // load() trả về buffer luôn nếu đã giải mã rồi → bọc Promise.resolve
  Promise.resolve(load(tr.list[tr.i++ % tr.list.length])).then((buf) => {
    tr.busy = false;
    if (tr.dead || !buf) return;
    const first = !tr.passes.length;
    const start = first ? ctx.currentTime : Math.max(ctx.currentTime, tr.nextAt);
    const xf = Math.min(XF, buf.duration / 4), end = start + buf.duration;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    src.connect(g).connect(tr.out);
    if (!first) g.gain.setValueCurveAtTime(FADE_IN, start, xf); // to dần, chồng lên đoạn cuối lượt trước
    g.gain.setValueCurveAtTime(FADE_OUT, end - xf, xf); // nhỏ dần ở cuối (lượt sau to dần cùng lúc)
    src.start(start);
    const pass = { src, g };
    tr.passes.push(pass);
    src.onended = () => { tr.passes = tr.passes.filter((p) => p !== pass); g.disconnect(); };
    tr.nextAt = end - xf;
    pump(tr); // hẹn giờ cho lượt sau
  });
}
// ?debug: xem nhạc đang chạy thế nào
// Mã nhạc này đã gắn file chưa (chưa gắn → game giữ nhạc ngày / đêm, không tắt nhạc)
export function hasMusic(id) {
  return filesOf(id).length > 0;
}
export function musicState() {
  const tr = music.track;
  return { id: music.id, now: ctx?.currentTime ?? 0, nextAt: tr?.nextAt ?? 0, passes: tr?.passes.length ?? 0, files: tr?.list ?? [] };
}

// ---------- tiếng tổng hợp (dự phòng khi chưa gắn file) ----------
function tone(freq, dur, { type = 'square', vol: v = 0.15, at = 0, slide = 0 } = {}) {
  if (!ensure() || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(fxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol: v = 0.3, freq = 800, at = 0 } = {}) {
  if (!ensure() || muted) return;
  const t = ctx.currentTime + at;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = v;
  s.connect(f).connect(g).connect(fxBus);
  s.start(t);
}

export const SYNTH = {
  ping() { tone(880, 0.12, { type: 'sine', vol: 0.25 }); tone(1320, 0.18, { type: 'sine', vol: 0.25, at: 0.12 }); },
  cash() { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.1, { type: 'triangle', vol: 0.18, at: i * 0.07 })); },
  bad() { tone(300, 0.25, { type: 'sawtooth', vol: 0.12, slide: -120 }); },
  click() { tone(1200, 0.04, { type: 'square', vol: 0.06 }); },
  talk() { tone(170 + Math.random() * 70, 0.035, { type: 'square', vol: 0.035 }); }, // chữ thoại hiện dần (chỉ để nghe, không ảnh hưởng ai)
  horn() { tone(392, 0.25, { type: 'square', vol: 0.1 }); tone(494, 0.25, { type: 'square', vol: 0.08 }); },
  crash() { noise(0.35, { vol: 0.5, freq: 1200 }); tone(90, 0.3, { type: 'sine', vol: 0.3 }); },
  bump() { noise(0.12, { vol: 0.35, freq: 300 }); },
  splash() { noise(0.45, { vol: 0.45, freq: 1800 }); noise(0.3, { vol: 0.25, freq: 500, at: 0.08 }); },
  stall() { tone(140, 0.18, { type: 'sawtooth', vol: 0.12, slide: -40 }); tone(110, 0.25, { type: 'sawtooth', vol: 0.1, slide: -60, at: 0.2 }); tone(70, 0.35, { type: 'sawtooth', vol: 0.08, slide: -30, at: 0.45 }); },
  rev() { tone(90, 0.25, { type: 'sawtooth', vol: 0.12, slide: 160 }); tone(140, 0.35, { type: 'sawtooth', vol: 0.1, slide: 220, at: 0.28 }); tone(120, 0.4, { type: 'square', vol: 0.06, slide: -60, at: 0.65 }); },
  bark() { tone(520, 0.08, { type: 'sawtooth', vol: 0.15, slide: -200 }); tone(520, 0.08, { type: 'sawtooth', vol: 0.15, slide: -200, at: 0.18 }); },
  whistle() { tone(2400, 0.5, { type: 'sine', vol: 0.15, slide: 200 }); },
  phone() { for (let i = 0; i < 3; i++) tone(440, 0.3, { type: 'sine', vol: 0.12, at: i * 0.6 }); },
  step() { tone(180, 0.05, { type: 'triangle', vol: 0.05 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.2, at: i * 0.15 })); },
  lose() { [440, 370, 311, 262].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.2, at: i * 0.2 })); },
};

// Tiếng máy xe liên tục (cao độ theo tốc độ) — mã loop.engine
let engine = null;
export function setEngine(on, speed01) {
  if (!ensure()) return;
  if (loopFile('loop.engine', on ? 0.5 + speed01 * 0.5 : 0, 0.7 + speed01 * 0.9)) {
    if (engine) engine.g.gain.setTargetAtTime(0, ctx.currentTime, 0.15); // vừa gắn file: tắt tiếng tổng hợp
    return;
  }
  engineSynth(on, speed01);
}
function engineSynth(on, speed01) {
  if (!engine) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(f).connect(g).connect(loopBus);
    o.start();
    engine = { o, g, f };
  }
  const t = ctx.currentTime;
  engine.o.frequency.setTargetAtTime(45 + speed01 * 90, t, 0.1);
  engine.g.gain.setTargetAtTime(on && !muted ? 0.035 + speed01 * 0.03 : 0, t, 0.15);
}

// Tiếng mưa liên tục — mã loop.rain
let rainNode = null;
export function setRain(amount) {
  if (!ensure()) return;
  if (loopFile('loop.rain', amount)) return;
  rainSynth(amount);
}
function rainSynth(amount) {
  if (!rainNode) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2500;
    f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(f).connect(g).connect(loopBus);
    s.start();
    rainNode = g;
  }
  rainNode.gain.setTargetAtTime(muted ? 0 : amount * 0.12, ctx.currentTime, 0.5);
}

// ---------- Tiếng phố xá lúc vừa tới Sài Gòn (màn mở đầu) — mã loop.city ----------
// Tổng hợp: tiếng xe cộ rì rầm, xe máy chạy ngang, kèn xe lác đác, 2 người cãi nhau
// (giọng tổng hợp: nghe như người nói chồng lên nhau, gắt, không ra chữ). Gọi cityAmbience(false) để nhỏ dần rồi tắt.
let amb = null;
export function cityAmbience(on) {
  if (ensure() && filesOf('loop.city').length) { loopFile('loop.city', on ? 1 : 0); return; }
  citySynth(on);
}
function citySynth(on) {
  if (!on) {
    if (!amb || !ctx) return;
    const a = amb;
    amb = null;
    a.timers.forEach(clearTimeout);
    a.out.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
    setTimeout(() => { try { a.src.stop(); a.out.disconnect(); } catch { /* đã tắt */ } }, 2500);
    return;
  }
  if (amb || !ensure()) return;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
  out.connect(loopBus);
  // tiếng xe cộ rì rầm: nhiễu nâu qua lọc thấp, lên xuống chậm
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  const rum = ctx.createGain();
  rum.gain.value = 0.35;
  src.connect(lp).connect(rum).connect(out);
  src.start();
  const a = { out, src, timers: [] };
  amb = a;
  const later = (ms, fn) => a.timers.push(setTimeout(() => amb === a && fn(), ms));
  const R = (x, y) => x + Math.random() * (y - x);
  // xe máy chạy ngang: tiếng máy kêu to dần rồi nhỏ dần, cao rồi trầm (hiệu ứng xe chạy qua)
  const passBy = () => {
    const t = ctx.currentTime, dur = R(1.4, 2.6), f0 = R(70, 110);
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 1.25, t);
    o.frequency.linearRampToValueAtTime(f0 * 0.8, t + dur);
    f.type = 'bandpass';
    f.frequency.value = 380;
    f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(R(0.05, 0.1), t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    later(R(500, 1800), passBy);
  };
  // kèn xe: 1–3 tiếng bíp, cao độ khác nhau mỗi xe
  const honk = () => {
    const t = ctx.currentTime, f = R(330, 520), n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const at = t + i * R(0.18, 0.3), dur = R(0.12, i === n - 1 ? 0.5 : 0.18);
      for (const mul of [1, 1.26]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = f * mul;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.045, at + 0.02);
        g.gain.setValueAtTime(0.045, at + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.05);
        o.connect(g).connect(out);
        o.start(at);
        o.stop(at + dur + 0.1);
      }
    }
    later(R(700, 2600), honk);
  };
  // một tràng "nói" gắt: các âm tiết ngắn, cao độ nhảy lên xuống, lọc qua 2 vùng âm (giống nguyên âm)
  const say = (base) => {
    let at = ctx.currentTime;
    const n = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const dur = R(0.09, 0.2), p = base * R(0.85, 1.35) * (i === n - 1 ? 1.25 : 1);
      const o = ctx.createOscillator(), g = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(p, at);
      o.frequency.linearRampToValueAtTime(p * R(0.8, 1.2), at + dur);
      f1.type = f2.type = 'bandpass';
      f1.frequency.value = R(500, 900);
      f2.frequency.value = R(1100, 1900);
      f1.Q.value = f2.Q.value = 6;
      const mix = ctx.createGain();
      mix.gain.value = 1;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(R(0.25, 0.4), at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(f1).connect(mix);
      o.connect(f2).connect(mix);
      mix.connect(g).connect(out);
      o.start(at);
      o.stop(at + dur + 0.02);
      at += dur + R(0.02, 0.07);
    }
    return at - ctx.currentTime;
  };
  // 2 người cãi qua cãi lại (giọng trầm / giọng cao), có lúc nói chồng lên nhau
  let turn = 0;
  const argue = () => {
    const sec = say(turn++ % 2 ? R(190, 250) : R(110, 150));
    later((sec + R(-0.15, 0.6)) * 1000, argue);
  };
  passBy();
  later(400, honk);
  later(900, argue);
}

// ---------- nghe thử tiếng tổng hợp (editor) — luôn phát tiếng tổng hợp, kể cả khi mã đã gắn file ----------
// Tiếng ngắn: phát 1 lần. Tiếng lặp (máy xe, mưa, phố): on = bật / tắt; speed01 = tốc độ xe (0–1) cho tiếng máy
export function previewSynth(id, on = true, speed01 = 0.5) {
  const syn = SOUNDS[id]?.synth;
  if (!syn || !ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (syn === 'engine') return engineSynth(on, speed01);
  if (syn === 'rain') return rainSynth(on ? 1 : 0);
  if (syn === 'city') return citySynth(on);
  if (on) SYNTH[syn]?.();
}
