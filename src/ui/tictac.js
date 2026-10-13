// APP TÍCH TẮC trong điện thoại: lướt tin (mỗi tin chiếm cả màn hình), thả tim, xem bình luận — chỉ để vui.
// Danh sách tin: sim/feed.js (game.js truyền vào). Ảnh "photo" = ảnh chụp thật trong thế giới 3D (game.snapPhoto, chụp 1 lần
// rồi giữ lại), clip = hình vẽ động bằng canvas 2D (chỉ chạy khi app đang mở).
// Lướt: lăn chuột / kéo lên xuống / nút ▲▼ · bấm đúp hoặc nút ❤️ = thả tim · 💬 = xem vài bình luận.
import { fmt, list } from '../content/index.js';
import { fmtCount } from '../sim/feed.js';
import { sound } from '../audio.js';

const W = 270, H = 480; // cỡ vẽ (CSS co vừa màn hình điện thoại)
const BG = ['#7F77DD', '#1D9E75', '#D85A30', '#378ADD', '#D4537E', '#BA7517', '#534AB7', '#0F6E56'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hash = (s) => [...String(s)].reduce((h, c) => (Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0), 2166136261);

export class TicTac {
  // opts: { snap(post) → canvas | null (ảnh chụp trong game) }
  constructor(opts = {}) {
    this.opts = opts;
    this.feed = [];
    this.i = 0;
    this.liked = new Set();
    this.photos = new Map(); // mã tin → ảnh đã chụp
    this.t0 = performance.now();
    this.el = document.createElement('div');
    this.el.className = 'tt';
    this.el.innerHTML = `
      <div class="tt-top"><span data-tt="follow">${fmt('tt.following')}</span> · <b>${fmt('tt.forYou')}</b></div>
      <canvas class="tt-media" width="${W}" height="${H}"></canvas>
      <div class="tt-tag hidden"></div>
      <div class="tt-side">
        <button data-tt="like"><i>🤍</i><span></span></button>
        <button data-tt="comments"><i>💬</i><span></span></button>
        <button data-tt="share"><i>↪️</i><span>${fmt('tt.share')}</span></button>
        <button data-tt="prev" title="▲">▲</button>
        <button data-tt="next" title="▼">▼</button>
      </div>
      <div class="tt-cap"><b></b><p></p><small></small></div>
      <div class="tt-bar"><span></span></div>
      <div class="tt-heart hidden">❤️</div>
      <div class="tt-sheet hidden"></div>
      <div class="tt-hint">${fmt('tt.hint')}</div>`;
    this.c = this.el.querySelector('canvas');
    this.g = this.c.getContext('2d');
    this.q = (s) => this.el.querySelector(s);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) this.like(true); });
    this.el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const now = performance.now();
      if (Math.abs(e.deltaY) < 20 || now - (this.wheelT || 0) < 350) return;
      this.wheelT = now;
      this.go(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    this.el.addEventListener('pointerdown', (e) => { this.dragY = e.clientY; });
    this.el.addEventListener('pointerup', (e) => {
      if (this.dragY == null) return;
      const dy = e.clientY - this.dragY;
      this.dragY = null;
      if (Math.abs(dy) > 50) this.go(dy < 0 ? 1 : -1);
    });
  }

  // feed mới (đổi theo giờ trong game): giữ tin đang xem nếu vẫn còn
  setFeed(feed) {
    if (!feed || feed === this.src) return;
    if (!this.src) setTimeout(() => this.flash(fmt('tt.hint')), 300); // lần đầu mở app: nhắc cách lướt
    this.src = feed;
    const cur = this.feed[this.i]?.id;
    this.feed = feed;
    const k = feed.findIndex((p) => p.id === cur);
    this.i = k >= 0 ? k : 0;
    this.show();
  }
  go(d) {
    if (!this.feed.length) return;
    this.i = (this.i + d + this.feed.length) % this.feed.length;
    sound('phone.swipe');
    this.el.classList.remove('tt-in-up', 'tt-in-down');
    void this.el.offsetWidth; // chạy lại hiệu ứng trượt
    this.el.classList.add(d > 0 ? 'tt-in-up' : 'tt-in-down');
    this.show();
  }
  post() {
    return this.feed[this.i];
  }
  like(fromDouble = false) {
    const p = this.post();
    if (!p) return;
    if (this.liked.has(p.id) && !fromDouble) this.liked.delete(p.id);
    else {
      this.liked.add(p.id);
      sound('phone.like');
      const h = this.q('.tt-heart');
      h.classList.remove('hidden', 'pop');
      void h.offsetWidth;
      h.classList.add('pop');
    }
    this.side();
  }
  onClick(e) {
    const b = e.target.closest('[data-tt]');
    if (!b) return this.q('.tt-sheet').classList.add('hidden');
    const a = b.dataset.tt;
    if (a === 'like') this.like();
    else if (a === 'next') this.go(1);
    else if (a === 'prev') this.go(-1);
    else if (a === 'share') this.flash(fmt('tt.shared'));
    else if (a === 'follow') this.flash(fmt('tt.noFollow'));
    else if (a === 'comments') this.comments();
    else if (a === 'closeSheet') this.q('.tt-sheet').classList.add('hidden');
  }
  flash(text) {
    const h = this.q('.tt-hint');
    h.textContent = text;
    h.classList.add('on');
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => { h.textContent = fmt('tt.hint'); h.classList.remove('on'); }, 2200);
  }
  // vài bình luận ngẫu nhiên (cố định theo tin)
  comments() {
    const p = this.post();
    if (!p) return;
    const all = list('tt.comments'), h = hash(p.id), n = Math.min(4, all.length);
    const rows = Array.from({ length: n }, (_, k) => all[(h + k * 7) % all.length]);
    const names = ['nguoiquaduong', 'meomeo99', 'shipperhaiphong', 'banhmi_pate', 'saigonchill', 'cobe2k7', 'anhbaxeom'];
    const sh = this.q('.tt-sheet');
    sh.innerHTML = `<b>${esc(fmt('tt.commentsTitle', { n: fmtCount(p.comments) }))}</b><button data-tt="closeSheet">✕</button>`
      + rows.map((r, k) => `<p><small>@${names[(h + k) % names.length]}</small>${esc(r)}</p>`).join('');
    sh.classList.remove('hidden');
  }
  side() {
    const p = this.post();
    if (!p) return;
    const liked = this.liked.has(p.id);
    const lb = this.q('[data-tt="like"]');
    lb.querySelector('i').textContent = liked ? '❤️' : '🤍';
    lb.querySelector('span').textContent = fmtCount(p.likes + (liked ? 1 : 0));
    this.q('[data-tt="comments"] span').textContent = fmtCount(p.comments);
  }
  show() {
    const p = this.post();
    this.q('.tt-sheet').classList.add('hidden');
    this.q('.tt-heart').classList.add('hidden');
    if (!p) return;
    this.t0 = performance.now();
    const tag = this.q('.tt-tag');
    tag.textContent = p.hot ? fmt('tt.hotTag') : p.media.type === 'clip' ? fmt('tt.clipTag') : '';
    tag.classList.toggle('hidden', !tag.textContent);
    this.q('.tt-cap b').textContent = p.author;
    this.q('.tt-cap p').textContent = p.caption;
    this.q('.tt-cap small').textContent = p.music ? fmt('tt.music', { music: p.music }) : '';
    this.side();
    if (p.media.type === 'photo' && !this.photos.has(p.id)) this.photos.set(p.id, this.opts.snap?.(p) || null);
    this.draw();
  }
  // gọi mỗi khung hình khi app đang mở (phone.render)
  update(feed) {
    this.setFeed(feed);
    this.draw();
  }
  draw() {
    const p = this.post(), g = this.g;
    if (!p) {
      g.fillStyle = '#10141b';
      g.fillRect(0, 0, W, H);
      return;
    }
    const t = (performance.now() - this.t0) / 1000;
    const bg = BG[hash(p.id) % BG.length];
    const photo = p.media.type === 'photo' ? this.photos.get(p.id) : null;
    if (photo) {
      // ảnh tĩnh: phóng rất chậm cho có cảm giác "clip"
      const z = 1 + Math.min(0.08, t * 0.01);
      g.drawImage(photo, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z);
    } else CLIPS[p.media.what === 'here' || p.media.type === 'photo' ? 'text' : p.media.what]?.(g, t, bg, p) ?? CLIPS.text(g, t, bg, p);
    if (p.overlay) bigText(g, p.overlay, H * 0.2, p.media.what === 'text' && !photo ? 1 + Math.sin(t * 3) * 0.04 : 1);
    this.q('.tt-bar span').style.width = `${((t % 8) / 8) * 100}%`;
  }
}

// chữ to trắng viền đen (kiểu chữ trên video)
function bigText(g, text, y, scale = 1) {
  g.save();
  g.translate(W / 2, y);
  g.scale(scale, scale);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 30;
  g.font = `900 ${size}px "Segoe UI", sans-serif`;
  while (g.measureText(text).width > W - 30 && size > 14) g.font = `900 ${(size -= 2)}px "Segoe UI", sans-serif`;
  g.lineWidth = 6;
  g.strokeStyle = '#111';
  g.strokeText(text, 0, 0);
  g.fillStyle = '#fff';
  g.fillText(text, 0, 0);
  g.restore();
}
function emoji(g, ch, x, y, size, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  g.fillStyle = '#000'; // emoji màu: không để màu / độ trong của lần vẽ trước làm mờ
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, 0, 0);
  g.restore();
}
const firstEmoji = (s) => (String(s).match(/\p{Extended_Pictographic}/u) || ['😂'])[0];

// Clip vẽ động (g: canvas 2D, t: giây từ lúc mở tin, bg: màu nền, p: tin)
const CLIPS = {
  // chó ta vàng nhún nhảy
  dog(g, t, bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const y = 270 + Math.sin(t * 6) * 10, x = W / 2 + Math.sin(t * 2) * 12;
    g.fillStyle = '#D9A15B';
    g.fillRect(x - 55, y - 40, 110, 95); // đầu
    g.fillRect(x - 40, y + 50, 80, 60); // cổ / ức
    g.fillStyle = '#F6EAD2';
    g.fillRect(x - 28, y + 15, 56, 32); // mõm
    g.fillRect(x - 25, y + 70, 50, 40); // ức trắng
    g.fillStyle = '#B07A3B';
    g.beginPath(); g.moveTo(x - 52, y - 40); g.lineTo(x - 40, y - 80 - Math.sin(t * 8) * 4); g.lineTo(x - 22, y - 40); g.fill();
    g.beginPath(); g.moveTo(x + 22, y - 40); g.lineTo(x + 40, y - 80 + Math.sin(t * 8) * 4); g.lineTo(x + 52, y - 40); g.fill();
    g.fillStyle = '#1b1b1b';
    g.fillRect(x - 30, y - 12, 12, 12);
    g.fillRect(x + 18, y - 12, 12, 12);
    g.fillRect(x - 10, y + 16, 20, 12); // mũi
    g.fillStyle = '#E8828F';
    g.fillRect(x - 7, y + 47, 14, 10 + Math.abs(Math.sin(t * 5)) * 10); // lưỡi
  },
  // người hộp nhảy trend + đèn sàn
  dance(g, t, bg) {
    g.fillStyle = '#1b1b2f';
    g.fillRect(0, 0, W, H);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = BG[(k + Math.floor(t * 4)) % BG.length];
      g.globalAlpha = 0.35;
      g.beginPath();
      g.arc(40 + k * 40, 90 + Math.sin(t * 3 + k) * 30, 26, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    const x = W / 2, y = 300, s = Math.sin(t * 7), b = Math.abs(s) * 8;
    g.fillStyle = bg;
    g.fillRect(x - 28, y - 60 - b, 56, 80); // thân
    g.fillStyle = '#F1C27D';
    g.fillRect(x - 20, y - 105 - b, 40, 40); // đầu
    g.fillStyle = '#2C2C2A';
    g.fillRect(x - 22, y - 110 - b, 44, 12); // tóc
    g.save(); g.translate(x - 28, y - 55 - b); g.rotate(-1.2 + s * 0.9); g.fillStyle = bg; g.fillRect(-8, 0, 16, 55); g.restore();
    g.save(); g.translate(x + 28, y - 55 - b); g.rotate(1.2 - s * 0.9); g.fillStyle = bg; g.fillRect(-8, 0, 16, 55); g.restore();
    g.fillStyle = '#2C3E50';
    g.save(); g.translate(x - 14, y + 18 - b); g.rotate(s * 0.4); g.fillRect(-9, 0, 18, 60); g.restore();
    g.save(); g.translate(x + 14, y + 18 - b); g.rotate(-s * 0.4); g.fillRect(-9, 0, 18, 60); g.restore();
  },
  // tô mì bốc khói
  food(g, t, bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(W / 2, 330, 95, 24, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(W / 2, 330, 95, 70, 0, 0, Math.PI); g.fill();
    g.fillStyle = '#E9C48E';
    g.beginPath(); g.ellipse(W / 2, 330, 82, 18, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 5;
    for (let k = -1; k <= 1; k++) {
      g.beginPath();
      for (let s = 0; s < 1; s += 0.05) {
        const yy = 300 - s * 130, xx = W / 2 + k * 32 + Math.sin(s * 10 - t * 4 + k) * 9;
        s === 0 ? g.moveTo(xx, yy) : g.lineTo(xx, yy);
      }
      g.stroke();
    }
    g.fillStyle = '#6b4a2b';
    g.save(); g.translate(W / 2 + 40, 290); g.rotate(-0.5); g.fillRect(0, -110, 7, 120); g.fillRect(14, -110, 7, 120); g.restore();
  },
  // mưa rơi
  rain(g, t) {
    g.fillStyle = '#24323f';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(180,210,255,0.7)';
    g.lineWidth = 2;
    for (let k = 0; k < 70; k++) {
      const x = (k * 37) % W, y = ((k * 53 + t * 420) % (H + 40)) - 20;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4, y + 16); g.stroke();
    }
    emoji(g, '☔', W / 2, 320 + Math.sin(t * 2) * 6, 90);
  },
  // tin chữ: nền màu, emoji lớn nhịp nhàng
  text(g, t, bg, p) {
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let k = 0; k < 8; k++) g.fillRect(0, ((k * 70 + t * 30) % (H + 70)) - 70, W, 35);
    emoji(g, p.hot ? '📢' : firstEmoji(p.caption), W / 2, 310, 96 + Math.sin(t * 4) * 6);
  },
  // meme: emoji lắc lư giữa khung, chữ to trên + dưới
  meme(g, t, bg, p) {
    g.fillStyle = '#f4f1ea';
    g.fillRect(0, 0, W, H);
    g.fillStyle = bg;
    g.fillRect(20, 150, W - 40, 230);
    emoji(g, firstEmoji(p.caption), W / 2, 265, 110, Math.sin(t * 5) * 0.25);
  },
};
