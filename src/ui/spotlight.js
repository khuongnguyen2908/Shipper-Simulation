import { fmt } from '../content/index.js';

// Hướng dẫn người mới: làm tối cả màn hình, chỉ chừa một "lỗ sáng" quanh nút đang cần bấm (nút có class .tut)
// + bong bóng chữ chỉ dẫn bên cạnh. Chỉ bấm được trong lỗ sáng: 4 tấm chắn trong suốt phủ phần tối xung quanh
// (phím tắt thì game.js chặn). Có nút "Bỏ qua hướng dẫn" cho người đã biết chơi.
// Vẽ nằm ngoài điện thoại nên viền sáng không bị khung điện thoại cắt mất / đè lên nút bên cạnh.
const TARGETS = {
  map: ['.ph-apps button.tut'], // app Bản đồ (biểu tượng + tên)
  office: ['.cm-types .tut'], // nút "Văn phòng hãng"
  route: ['.cm-card:not(.hidden)', '.cm-results:not(.hidden)', '.cm-view'], // thẻ văn phòng (đọc hãng, loại xe, tiền cọc + nút Chỉ đường) → danh sách văn phòng → bản đồ
};
const PAD = 6; // lỗ sáng rộng hơn nút một chút

export class Spotlight {
  // onSkip: người chơi bấm "Bỏ qua hướng dẫn"
  constructor(root, onSkip) {
    this.el = document.createElement('div');
    this.el.id = 'spotlight';
    this.el.className = 'hidden';
    this.el.innerHTML = `<div class="sp-hole"></div>${'<div class="sp-block"></div>'.repeat(4)}
      <div class="sp-tip"><b></b><small></small></div><button class="sp-skip">${fmt('tut.skip')}</button>`;
    root.appendChild(this.el);
    this.hole = this.el.querySelector('.sp-hole');
    this.tip = this.el.querySelector('.sp-tip');
    this.blocks = [...this.el.querySelectorAll('.sp-block')];
    // tấm chắn: nuốt mọi cú bấm ngoài lỗ sáng
    for (const b of this.blocks) for (const ev of ['pointerdown', 'click', 'wheel', 'contextmenu']) b.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); });
    this.el.querySelector('.sp-skip').addEventListener('click', () => { onSkip?.(); this.hide(); });
    this.step = null;
  }

  // step: bước hướng dẫn hiện tại (game.tutorialStep()); gọi mỗi khung hình
  update(step) {
    const target = step && TARGETS[step] ? this.find(TARGETS[step]) : null;
    if (!target) return this.hide();
    if (step !== this.step) {
      this.step = step;
      this.key = null; // chữ đổi → đặt lại vị trí bong bóng
      this.tip.querySelector('b').textContent = fmt(`goal.tut.${step}`);
      this.tip.querySelector('small').textContent = fmt(`goal.tut.${step}Hint`);
      target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); // nút đang khuất trong hàng cuộn → kéo ra cho thấy
    }
    this.el.classList.remove('hidden');
    const r = target.getBoundingClientRect();
    const x = r.left - PAD, y = r.top - PAD, w = r.width + PAD * 2, h = r.height + PAD * 2;
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)},${innerWidth},${innerHeight}`;
    if (key === this.key) return;
    this.key = key;
    Object.assign(this.hole.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, borderRadius: getComputedStyle(target).borderRadius === '0px' ? '10px' : `calc(${getComputedStyle(target).borderRadius} + ${PAD}px)` });
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
    this.key = null;
    this.el.classList.add('hidden');
  }
}
