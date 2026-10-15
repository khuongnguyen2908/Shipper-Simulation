import { fmt } from '../content/index.js';

// Hướng dẫn người mới: làm tối cả màn hình, chỉ chừa một "lỗ sáng" quanh nút đang cần bấm (nút có class .tut)
// + bong bóng chữ chỉ dẫn bên cạnh. Chỉ bấm được trong lỗ sáng: 4 tấm chắn trong suốt phủ phần tối xung quanh
// (phím tắt thì game.js chặn). Hướng dẫn chữ (bản đồ tròn, thanh thể lực…) có nút "Tiếp ▸" / "Đã rõ" trong bong bóng (hoặc Enter / Space).
// Vẽ nằm ngoài điện thoại nên viền sáng không bị khung điện thoại cắt mất / đè lên nút bên cạnh.
const TARGETS = {
  map: ['.ph-apps button.tut'], // app Bản đồ (biểu tượng + tên)
  office: ['.cm-types .tut'], // nút "Văn phòng hãng"
  route: ['.cm-card:not(.hidden)', '.cm-results:not(.hidden)', '.cm-view'], // thẻ văn phòng (đọc hãng, loại xe, tiền cọc + nút Chỉ đường) → danh sách văn phòng → bản đồ
};
const PAD = 6; // lỗ sáng rộng hơn nút một chút

export class Spotlight {
  // onAck: người chơi bấm nút "Tiếp ▸" / "Đã rõ" của hướng dẫn chữ → cốt truyện sang bước sau
  constructor(root, onAck) {
    this.el = document.createElement('div');
    this.el.id = 'spotlight';
    this.el.className = 'hidden';
    this.el.innerHTML = `<div class="sp-hole"></div><div class="sp-ring hidden"></div>${'<div class="sp-block"></div>'.repeat(4)}
      <div class="sp-tip"><b></b><small></small><button class="sp-btn hidden"></button></div>`;
    root.appendChild(this.el);
    this.hole = this.el.querySelector('.sp-hole');
    this.ring = this.el.querySelector('.sp-ring'); // khung vàng riêng quanh nút cần bấm khi lỗ sáng được nới ra (also)
    this.tip = this.el.querySelector('.sp-tip');
    this.blocks = [...this.el.querySelectorAll('.sp-block')];
    // tấm chắn: nuốt mọi cú bấm ngoài lỗ sáng
    for (const b of this.blocks) for (const ev of ['pointerdown', 'click', 'wheel', 'contextmenu']) b.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); });
    this.btn = this.tip.querySelector('.sp-btn');
    this.onAck = onAck;
    this.btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.press();
    });
    this.step = null;
  }

  // step: bước hướng dẫn hiện tại (game.tutorialStep()); gọi mỗi khung hình
  // — chữ (hướng dẫn cũ: mã trong TARGETS, chữ goal.tut.*) hoặc (cốt truyện)
  //   { id, sel: [bộ chọn], title, hint, app, keys: [phím được bấm], btn: chữ trên nút (bấm = sang bước sau), top: nổi trên hộp thoại }
  update(step) {
    const obj = step && typeof step === 'object' ? step : null;
    const id = obj ? obj.id : step;
    let target = obj ? this.find(obj.sel) : step && TARGETS[step] ? this.find(TARGETS[step]) : null;
    // phần cần làm sáng đang bị ẩn (vd dòng phím dưới cùng ẩn ở màn hình ≤ 1100px) mà hướng dẫn có nút bấm:
    // vẫn hiện bong bóng + nút ở giữa phía dưới màn hình (không có lỗ sáng) — không thì người chơi kẹt ở bước "bấm nút"
    const loose = !target && !!obj?.btn;
    if (loose) target = { getBoundingClientRect: () => ({ left: innerWidth / 2, top: innerHeight - 150, width: 0, height: 0 }), loose: true };
    if (!target) return this.hide();
    this.hasBtn = !!obj?.btn;
    this.el.classList.toggle('top', !!obj?.top); // nổi trên hộp thoại (màn xếp túi)
    this.app = obj?.app || null; // app đang sáng trên màn hình chính → game cho bấm phím số của app đó
    this.keys = obj?.keys || null; // phím được bấm thêm (vd Tab mở điện thoại)
    if (id !== this.step || (obj && obj.title !== this.title)) {
      this.step = id;
      this.title = obj?.title;
      this.key = null; // chữ đổi → đặt lại vị trí bong bóng
      this.tip.querySelector('b').textContent = obj ? obj.title : fmt(`goal.tut.${step}`);
      this.tip.querySelector('small').textContent = obj ? obj.hint || '' : fmt(`goal.tut.${step}Hint`);
      this.btn.textContent = obj?.btn || '';
      this.btn.classList.toggle('hidden', !obj?.btn);
      this.tip.classList.toggle('has-btn', !!obj?.btn);
      target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); // nút đang khuất trong hàng cuộn → kéo ra cho thấy
    }
    this.el.classList.remove('hidden');
    this.hole.style.visibility = target.loose ? 'hidden' : '';
    const r = target.getBoundingClientRect();
    // also: phần cần làm SÁNG thêm (không khung vàng), vd ô bịch tàu hũ trong túi lúc hướng dẫn bấm Xoay → lỗ sáng ôm cả hai
    const extra = (obj?.also || []).map((sel) => document.querySelector(sel)).filter((e) => e && e.getClientRects().length).map((e) => e.getBoundingClientRect());
    let L = r.left, T = r.top, R = r.left + r.width, B = r.top + r.height;
    for (const e of extra) { L = Math.min(L, e.left); T = Math.min(T, e.top); R = Math.max(R, e.right); B = Math.max(B, e.bottom); }
    const x = L - PAD, y = T - PAD, w = R - L + PAD * 2, h = B - T + PAD * 2;
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)},${Math.round(r.left)},${Math.round(r.top)},${innerWidth},${innerHeight}`;
    if (key === this.key) return;
    this.key = key;
    this.hole.classList.toggle('plain', extra.length > 0);
    this.ring.classList.toggle('hidden', !extra.length);
    if (extra.length) Object.assign(this.ring.style, { left: `${r.left - PAD}px`, top: `${r.top - PAD}px`, width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px` });
    const rad = target.loose ? '0px' : getComputedStyle(target).borderRadius;
    Object.assign(this.hole.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, borderRadius: rad === '0px' ? '10px' : `calc(${rad} + ${PAD}px)` });
    // 4 tấm chắn: trên · dưới · trái · phải lỗ sáng
    const W = innerWidth, H = innerHeight, box = (b, l, t, bw, bh) => Object.assign(b.style, { left: `${l}px`, top: `${t}px`, width: `${Math.max(0, bw)}px`, height: `${Math.max(0, bh)}px` });
    box(this.blocks[0], 0, 0, W, y);
    box(this.blocks[1], 0, y + h, W, H - y - h);
    box(this.blocks[2], 0, y, x, h);
    box(this.blocks[3], x + w, y, W - x - w, h);
    // bong bóng chữ: bên trái lỗ sáng nếu đủ chỗ (điện thoại nằm bên phải), không thì ở trên / dưới
    const tw = Math.min(260, innerWidth - 32), t = this.tip.style;
    t.width = `${tw}px`;
    const th = this.tip.offsetHeight; // chiều cao thật của bong bóng (để không tràn ra ngoài màn hình)
    if (x - 16 >= tw + 16) {
      Object.assign(t, { left: `${x - 16 - tw}px`, top: `${Math.max(16, Math.min(innerHeight - th - 16, y + h / 2 - th / 2))}px` });
      this.tip.dataset.side = 'left';
    } else {
      const below = y + h + 14 + th < innerHeight;
      Object.assign(t, { left: `${Math.max(16, Math.min(innerWidth - tw - 16, x + w / 2 - tw / 2))}px`, top: below ? `${y + h + 14}px` : `${Math.max(16, y - th - 14)}px` });
      this.tip.dataset.side = below ? 'below' : 'above';
    }
  }

  // Bấm nút Tiếp / Đã rõ (chuột, Enter, Space) → báo game, ẩn tới khi bước sau có hướng dẫn
  press() {
    if (!this.hasBtn || this.step === null) return;
    this.onAck?.(this.step);
    this.hide();
  }

  // phần tử đầu tiên trong danh sách đang hiện trên màn hình
  find(sels) {
    for (const s of sels) {
      const e = document.querySelector(s);
      if (e && e.getClientRects().length) return e;
    }
    return null;
  }

  hide() {
    if (this.step === null && this.el.classList.contains('hidden')) return;
    this.step = null;
    this.app = null;
    this.keys = null;
    this.key = null;
    this.hasBtn = false;
    this.ring.classList.add('hidden');
    this.hole.classList.remove('plain');
    this.el.classList.add('hidden');
  }
}
