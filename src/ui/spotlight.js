import { fmt } from '../content/index.js';

// Hướng dẫn người mới: làm tối cả màn hình, chỉ chừa một "lỗ sáng" quanh nút đang cần bấm (nút có class .tut)
// + bong bóng chữ chỉ dẫn bên cạnh. Lớp phủ không chặn chuột (bấm xuyên qua được), vẽ nằm ngoài điện thoại
// nên viền sáng không bị khung điện thoại cắt mất / đè lên nút bên cạnh.
const TARGETS = {
  map: ['.ph-apps button.tut'], // app Bản đồ (biểu tượng + tên)
  office: ['.cm-types .tut'], // nút "Văn phòng hãng"
  route: ['.cm-card:not(.hidden)', '.cm-results:not(.hidden)', '.cm-view'], // thẻ văn phòng (đọc hãng, loại xe, tiền cọc + nút Chỉ đường) → danh sách văn phòng → bản đồ
};
const PAD = 6; // lỗ sáng rộng hơn nút một chút

export class Spotlight {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'spotlight';
    this.el.className = 'hidden';
    this.el.innerHTML = '<div class="sp-hole"></div><div class="sp-tip"><b></b><small></small></div>';
    root.appendChild(this.el);
    this.hole = this.el.querySelector('.sp-hole');
    this.tip = this.el.querySelector('.sp-tip');
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
