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

// Gạch lát vỉa hè: 8 × 8 viên mỗi lần lặp (viên 0,5 m khi lặp mỗi 4 m), màu lệch từng viên, ron vữa, vài viên nứt / ố
export function makeTileTexture() {
  const S = 256, n = 8, s = S / n;
  const [c, g] = canvas(S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = 182 + rnd() * 26, warm = (i + j) % 5 === 0 ? 18 : 0; // thỉnh thoảng một viên ngả đỏ gạch
      g.fillStyle = `rgb(${v + 10 + warm},${v - 2},${v - 16 - warm / 2})`;
      g.fillRect(i * s, j * s, s, s);
      if (rnd() < 0.12) {
        g.fillStyle = 'rgba(70,55,40,0.15)'; // viên ố
        g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      }
      if (rnd() < 0.08) {
        g.strokeStyle = 'rgba(60,50,40,0.35)'; // viên nứt
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(i * s + rnd() * s, j * s);
        g.lineTo(i * s + rnd() * s, j * s + s);
        g.stroke();
      }
    }
  }
  g.fillStyle = 'rgba(90,75,60,0.45)';
  for (let k = 0; k <= n; k++) {
    g.fillRect(k * s - 1, 0, 2, S);
    g.fillRect(0, k * s - 1, S, 2);
  }
  for (let i = 0; i < 900; i++) {
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

// Nhãn nổi trên đầu NPC
export function makeLabelTexture(text, bg = 'rgba(20,24,32,0.8)') {
  const [c, g] = canvas(512, 96);
  g.font = '700 44px "Segoe UI", Arial, sans-serif';
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
