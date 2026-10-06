// Âm thanh tổng hợp bằng Web Audio API (không cần file âm thanh).
// Kiến trúc đơn giản: mỗi hiệu ứng là một hàm; sau này có thể thay bằng file.
let ctx = null, master = null, engine = null, rainNode = null;
let muted = false;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return true;
}

export function unlockAudio() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
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
