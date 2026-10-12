// Âm thanh tổng hợp bằng Web Audio API (không cần file âm thanh).
// Kiến trúc đơn giản: mỗi hiệu ứng là một hàm; sau này có thể thay bằng file.
let ctx = null, master = null, engine = null, rainNode = null;
let muted = false;
let volume = 1; // âm lượng người chơi chọn (0–1, màn hình Cài đặt); 1 = mức gốc của game
const BASE = 0.5;
const gainNow = () => (muted ? 0 : BASE * volume);

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = gainNow();
  master.connect(ctx.destination);
  return true;
}

export function unlockAudio() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
}

export function toggleMute() {
  return setMuted(!muted);
}
export function setMuted(on) {
  muted = !!on;
  if (master) master.gain.value = gainNow();
  return muted;
}
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0));
  if (master) master.gain.value = gainNow();
}

function tone(freq, dur, { type = 'square', vol = 0.15, at = 0, slide = 0 } = {}) {
  if (!ensure() || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.3, freq = 800, at = 0 } = {}) {
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
  g.gain.value = vol;
  s.connect(f).connect(g).connect(master);
  s.start(t);
}

export const sfx = {
  ping() { tone(880, 0.12, { type: 'sine', vol: 0.25 }); tone(1320, 0.18, { type: 'sine', vol: 0.25, at: 0.12 }); },
  cash() { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.1, { type: 'triangle', vol: 0.18, at: i * 0.07 })); },
  bad() { tone(300, 0.25, { type: 'sawtooth', vol: 0.12, slide: -120 }); },
  click() { tone(1200, 0.04, { type: 'square', vol: 0.06 }); },
  horn() { tone(392, 0.25, { type: 'square', vol: 0.1 }); tone(494, 0.25, { type: 'square', vol: 0.08 }); },
  crash() { noise(0.35, { vol: 0.5, freq: 1200 }); tone(90, 0.3, { type: 'sine', vol: 0.3 }); },
  bump() { noise(0.12, { vol: 0.35, freq: 300 }); },
  bark() { tone(520, 0.08, { type: 'sawtooth', vol: 0.15, slide: -200 }); tone(520, 0.08, { type: 'sawtooth', vol: 0.15, slide: -200, at: 0.18 }); },
  whistle() { tone(2400, 0.5, { type: 'sine', vol: 0.15, slide: 200 }); },
  phone() { for (let i = 0; i < 3; i++) tone(440, 0.3, { type: 'sine', vol: 0.12, at: i * 0.6 }); },
  step() { tone(180, 0.05, { type: 'triangle', vol: 0.05 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.2, at: i * 0.15 })); },
  lose() { [440, 370, 311, 262].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.2, at: i * 0.2 })); },
};

// Tiếng máy xe liên tục (cao độ theo tốc độ)
export function setEngine(on, speed01) {
  if (!ensure()) return;
  if (!engine) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(f).connect(g).connect(master);
    o.start();
    engine = { o, g, f };
  }
  const t = ctx.currentTime;
  engine.o.frequency.setTargetAtTime(45 + speed01 * 90, t, 0.1);
  engine.g.gain.setTargetAtTime(on && !muted ? 0.035 + speed01 * 0.03 : 0, t, 0.15);
}

// Tiếng mưa liên tục
export function setRain(amount) {
  if (!ensure()) return;
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
    s.connect(f).connect(g).connect(master);
    s.start();
    rainNode = g;
  }
  rainNode.gain.setTargetAtTime(muted ? 0 : amount * 0.12, ctx.currentTime, 0.5);
}

// ---------- Tiếng phố xá lúc vừa tới Sài Gòn (màn mở đầu) ----------
// Tạo hoàn toàn bằng máy: tiếng xe cộ rì rầm, xe máy chạy ngang, kèn xe lác đác, 2 người cãi nhau
// (giọng tổng hợp: nghe như người nói chồng lên nhau, gắt, không ra chữ). Gọi cityAmbience(false) để nhỏ dần rồi tắt.
let amb = null;
export function cityAmbience(on) {
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
  out.connect(master);
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
