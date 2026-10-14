// Tạo texture bằng canvas (không cần file ảnh ngoài)
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Gạch lát vỉa hè kiểu phố Việt Nam: 16 × 16 viên mỗi lần lặp (viên 0,5 m, lặp mỗi 8 m) — gạch xám lệch màu, mảng gạch đỏ,
// gạch terrazzo lấm chấm, mảng vá xi măng, viên vỡ / mất, ron vữa, vết ố. Lộn xộn như vỉa hè mỗi nhà lát một kiểu.
export function makeTileTexture() {
  const S = 512, n = 16, s = S / n;
  const [c, g] = canvas(S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // các mảng (theo ô viên) lát kiểu khác: 0 xám thường · 1 gạch đỏ · 2 terrazzo
  const zone = (i, j) => {
    const a = Math.floor(i / 4), b = Math.floor(j / 5);
    const h = (a * 73 + b * 151 + 11) % 7;
    return h === 0 || h === 3 ? 1 : h === 5 ? 2 : 0;
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const z = zone(i, j), v = 176 + rnd() * 30;
      if (z === 1) g.fillStyle = `rgb(${150 + rnd() * 30},${80 + rnd() * 20},${62 + rnd() * 16})`; // gạch đỏ
      else if (z === 2) g.fillStyle = `rgb(${v + 6},${v},${v - 8})`;
      else g.fillStyle = `rgb(${v + 8},${v - 2},${v - 14})`;
      g.fillRect(i * s, j * s, s, s);
      if (z === 2) {
        for (let k = 0; k < 14; k++) {
          g.fillStyle = rnd() < 0.5 ? 'rgba(60,60,60,0.35)' : 'rgba(180,120,90,0.4)'; // hạt đá terrazzo
          g.fillRect(i * s + rnd() * s, j * s + rnd() * s, 2, 2);
        }
      }
      if (rnd() < 0.12) {
        g.fillStyle = 'rgba(70,55,40,0.16)'; // viên ố
        g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      }
      if (rnd() < 0.08) {
        g.strokeStyle = 'rgba(60,50,40,0.4)'; // viên nứt
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(i * s + rnd() * s, j * s);
        g.lineTo(i * s + rnd() * s, j * s + s);
        g.stroke();
      }
      if (rnd() < 0.025) {
        g.fillStyle = 'rgba(85,70,55,0.75)'; // viên vỡ mất, lộ nền đất
        g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      }
    }
  }
  g.fillStyle = 'rgba(90,75,60,0.45)';
  for (let k = 0; k <= n; k++) {
    g.fillRect(k * s - 1, 0, 2, S);
    g.fillRect(0, k * s - 1, S, 2);
  }
  // mảng vá xi măng xám (đào lên lấp lại), không theo ron gạch
  for (let k = 0; k < 4; k++) {
    const w = 30 + rnd() * 70, h = 20 + rnd() * 50, x = rnd() * (S - w), y = rnd() * (S - h);
    g.fillStyle = `rgba(${150 + rnd() * 20},${150 + rnd() * 20},${148 + rnd() * 20},0.92)`;
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x, y, w, 2);
    g.fillRect(x, y, 2, h);
  }
  for (let i = 0; i < 3600; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
    g.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Nhựa đường: hạt đá, mảng màu loang, vết nứt mảnh, vệt dầu
export function makeAsphaltTexture() {
  const S = 512;
  const [c, g] = canvas(S, S);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#4a4c52';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const r = 30 + rnd() * 90, x = rnd() * S, y = rnd() * S;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.5;
    gr.addColorStop(0, dark ? 'rgba(20,20,24,0.18)' : 'rgba(120,120,126,0.12)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9000; i++) {
    const v = 55 + rnd() * 55;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.4)`;
    g.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  g.strokeStyle = 'rgba(25,25,28,0.55)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    let x = rnd() * S, y = rnd() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) g.lineTo((x += (rnd() - 0.5) * 30), (y += (rnd() - 0.5) * 30));
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S, y = rnd() * S, r = 8 + rnd() * 16;
    g.fillStyle = 'rgba(15,15,20,0.22)'; // vệt dầu
    g.beginPath();
    g.ellipse(x, y, r, r * 0.6, rnd() * 3, 0, 7);
    g.fill();
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Mặt nước ngập (nâu đục, gợn sáng) — lặp liền, trượt chậm để thấy nước chảy
export function makeWaterTexture() {
  const S = 256;
  const [c, g] = canvas(S, S);
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#9a8761';
  g.fillRect(0, 0, S, S);
  // mảng đục / trong lốm đốm
  for (let i = 0; i < 26; i++) {
    const r = 20 + rnd() * 50, x = rnd() * S, y = rnd() * S;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rnd() < 0.5 ? 'rgba(80,66,40,0.25)' : 'rgba(170,160,130,0.22)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2); // vẽ cả 8 ô bên cạnh → lặp liền
  }
  // gợn sóng sáng (vệt cong ngắn)
  g.strokeStyle = 'rgba(235,228,205,0.55)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, w = 8 + rnd() * 18;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.quadraticCurveTo(x + dx + w / 2, y + dy - 3, x + dx + w, y + dy);
      g.stroke();
    }
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Biển hiệu chữ tiếng Việt
export function makeSignTexture(text, bg = '#b03a2e', fg = '#ffffff') {
  const [c, g] = canvas(1024, 192);
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = 8;
  g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.fillStyle = fg;
  let size = 96;
  g.font = `800 ${size}px "Segoe UI", "Be Vietnam Pro", Arial, sans-serif`;
  while (g.measureText(text).width > c.width - 70 && size > 30) {
    size -= 4;
    g.font = `800 ${size}px "Segoe UI", "Be Vietnam Pro", Arial, sans-serif`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  return toTexture(c);
}

// Dấu chấm than vàng trên đầu NPC có việc cần gặp (Cô Hai lúc mới vào game)
// symbol: '!' (có việc mới) · '?' (quay lại nói chuyện)
export function makeQuestTexture(symbol = '!') {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#f4d03f';
  g.strokeStyle = '#7d5c00';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#3b2a00';
  g.font = '900 84px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(symbol, 64, 68);
  return toTexture(c);
}

// Nhãn nổi trên đầu NPC
export function makeLabelTexture(text, bg = 'rgba(20,24,32,0.8)') {
  const [c, g] = canvas(512, 96);
  // chữ dài thì co cỡ chữ cho vừa khung (không bị cắt 2 đầu)
  let size = 44;
  g.font = `700 ${size}px "Segoe UI", Arial, sans-serif`;
  const tw = g.measureText(text).width;
  if (tw > 460) {
    size = Math.max(24, Math.floor((size * 460) / tw));
    g.font = `700 ${size}px "Segoe UI", Arial, sans-serif`;
  }
  const w = Math.min(500, g.measureText(text).width + 40);
  g.fillStyle = bg;
  const x = (512 - w) / 2;
  g.beginPath();
  g.roundRect(x, 12, w, 72, 20);
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  return toTexture(c);
}

// Vòng sáng mềm (đèn đường chiếu xuống, điểm đến)
export function makeGlowTexture() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return toTexture(c);
}
