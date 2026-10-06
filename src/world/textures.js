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

// Mặt tiền nhà ống: 4 cột × 4 tầng cửa sổ; màu tường do instanceColor quyết định
export function makeFacadeTextures(seed = 1) {
  const S = 64;
  const [c, g] = canvas(S * 4, S * 4);
  const [e, ge] = canvas(S * 4, S * 4);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  ge.fillStyle = '#000000';
  ge.fillRect(0, 0, e.width, e.height);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let fy = 0; fy < 4; fy++) {
    for (let fx = 0; fx < 4; fx++) {
      const x = fx * S, y = fy * S;
      // ban công / gờ tầng
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x, y + S - 6, S, 6);
      // cửa sổ
      const wx = x + 14, wy = y + 12, ww = S - 28, wh = S - 26;
      g.fillStyle = '#3e4a56';
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = '#6f8494';
      g.fillRect(wx + 3, wy + 3, ww / 2 - 4, wh - 6);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(wx - 3, wy - 3, ww + 6, 3);
      // song sắt (rất Sài Gòn)
      g.fillStyle = 'rgba(30,30,30,0.5)';
      for (let k = 1; k < 4; k++) g.fillRect(wx + (ww * k) / 4, wy, 2, wh);
      // cửa sổ sáng ban đêm
      if (rnd() < 0.55) {
        ge.fillStyle = rnd() < 0.7 ? '#ffcf7a' : '#cfe8ff';
        ge.fillRect(wx, wy, ww, wh);
      }
    }
  }
  const map = toTexture(c);
  const emissive = toTexture(e);
  map.wrapS = map.wrapT = emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  return { map, emissive };
}

export function makeTileTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#c9bfb3';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(80,60,40,0.18)';
  g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function makeAsphaltTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#4a4c52';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    const v = 60 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
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
