// Bản đồ nhỏ (góc màn hình) và bản đồ lớn trong điện thoại — vẽ bằng canvas 2D.
import { CITY, HALF, roadPos, blockBounds, segmentRect } from '../sim/cityLayout.js';
import { STREETS_X, STREETS_Z } from '../data/places.js';

const ICON = { home: '🏠', restaurant: '🍴', gas: '⛽', shop: '🎒', garage: '🔧', cafe: '☕', taphoa: '🛒', gate: '🟩', apartment: '🏢', market: '🧺' };

export class MiniMap {
  constructor(canvas, { scale = 1, labels = false } = {}) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.labels = labels;
    this.scale = scale;
  }

  // data: { player:{x,z,heading}, bike:{x,z}|null, places:[...], target, zone, police:[...], jams:[...], raining }
  draw(data) {
    const { c, g } = this;
    const S = c.width;
    const k = S / (HALF * 2 + 8);
    const X = (x) => (x + HALF + 4) * k;
    const Z = (z) => (z + HALF + 4) * k;
    g.fillStyle = '#2f343c';
    g.fillRect(0, 0, S, S);
    // khối nhà
    for (let bz = 0; bz < CITY.N; bz++) {
      for (let bx = 0; bx < CITY.N; bx++) {
        const b = blockBounds(bx, bz);
        g.fillStyle = '#5c6b5a';
        g.fillRect(X(b.x0), Z(b.z0), CITY.BLOCK * k, CITY.BLOCK * k);
        g.fillStyle = '#7d8a74';
        g.fillRect(X(b.x0 + 3), Z(b.z0 + 3), (CITY.BLOCK - 6) * k, (CITY.BLOCK - 6) * k);
      }
    }
    // kẹt xe
    for (const s of data.jams || []) {
      const r = segmentRect(s);
      g.fillStyle = 'rgba(231,76,60,0.75)';
      g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
    }
    // tên đường (bản đồ lớn)
    if (this.labels) {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = `${Math.round(9 * this.scale)}px "Segoe UI", sans-serif`;
      g.textAlign = 'center';
      for (let i = 0; i <= CITY.N; i++) {
        g.save();
        g.translate(X(roadPos(i)), Z(-HALF + 40));
        g.rotate(-Math.PI / 2);
        g.fillText(STREETS_X[i], 0, 3);
        g.restore();
        g.fillText(STREETS_Z[i], X(-HALF + 42), Z(roadPos(i)) + 3);
      }
    }
    // địa điểm
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const p of data.places) {
      const fs = Math.round((this.labels ? 15 : 11) * this.scale);
      g.font = `${fs}px "Segoe UI Emoji", "Segoe UI", sans-serif`;
      g.fillText(p.icon || ICON[p.kind] || '•', X(p.door.x), Z(p.door.z));
      if (this.labels) {
        g.font = `600 ${Math.round(9 * this.scale)}px "Segoe UI", sans-serif`;
        g.fillStyle = '#fff';
        g.fillText(p.short, X(p.door.x), Z(p.door.z) + fs * 0.9);
      }
    }
    // CSGT
    for (const p of data.police || []) {
      g.font = `${Math.round(13 * this.scale)}px "Segoe UI Emoji", sans-serif`;
      g.fillText('👮', X(p.x), Z(p.z));
    }
    // vùng địa chỉ mơ hồ
    if (data.zone) {
      g.strokeStyle = '#c39bd3';
      g.fillStyle = 'rgba(155,89,182,0.25)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(X(data.zone.x), Z(data.zone.z), data.zone.r * k, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // điểm đến
    if (data.target) {
      const t = data.target;
      const pulse = 4 + 2 * Math.sin(performance.now() / 200);
      g.fillStyle = t.color || '#f39c12';
      g.beginPath();
      g.arc(X(t.x), Z(t.z), pulse * this.scale, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.stroke();
    }
    // xe đang đậu
    if (data.bike) {
      g.fillStyle = '#5dade2';
      g.fillRect(X(data.bike.x) - 3, Z(data.bike.z) - 3, 6, 6);
    }
    // người chơi (mũi tên)
    const p = data.player;
    g.save();
    g.translate(X(p.x), Z(p.z));
    g.rotate(-p.heading + Math.PI);
    g.fillStyle = '#2ecc71';
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5;
    const s = 6 * this.scale;
    g.beginPath();
    g.moveTo(0, -s * 1.3);
    g.lineTo(s, s);
    g.lineTo(0, s * 0.4);
    g.lineTo(-s, s);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    if (data.raining) {
      g.fillStyle = 'rgba(120,150,190,0.18)';
      g.fillRect(0, 0, S, S);
    }
  }
}
