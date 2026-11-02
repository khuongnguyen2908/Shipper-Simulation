// Loading nhỏ khi từ màn hình chính vào game (Chơi tiếp / Chơi mới / Online): ảnh + mẹo đổi mỗi tipSec giây,
// xe máy chạy tại chỗ cạnh chữ "Đang vào thành phố.....". Không có thanh % — đóng khi game vào xong thật.
// Mẹo + ảnh ở src/data/loading.json (thẻ ⏳ Loading của ?editor), ảnh trong public/loading/. Chỉ để nhìn, mỗi máy tự vẽ.
import LOADING from '../data/loading.json' with { type: 'json' };
import motoSvg from '../boot/moto.svg?raw';
import { fmt } from '../content/index.js';

const IMG_BASE = './loading/';
// thân xe (bỏ bánh) + 2 bánh là thẻ riêng quay bằng CSS → vẫn quay mượt lúc game đang bận vào ván
const WHEEL = '<svg viewBox="0 0 26 26"><circle cx="13" cy="13" r="13" fill="#15171c"/><circle cx="13" cy="13" r="6" fill="#9aa4b5"/><rect x="12" y="1" width="2" height="24" fill="#15171c"/></svg>';
const RIDER = LOADING.rider;
// có ảnh xe chụp từ game (nhiều khung, bánh quay dần) thì dùng ảnh đó; chưa có thì dùng hình vẽ
const MOTO = RIDER?.img
  ? `<div class="ml-real" style="aspect-ratio:${RIDER.width}/${RIDER.height}"><img src="${IMG_BASE}${RIDER.img}" alt="" style="width:${RIDER.frames * 100}%;animation-timing-function:steps(${RIDER.frames})"></div>`
  : `${motoSvg.replace(/<g class="mt-wheel">.*?<\/g>/g, '')}<i class="ml-wheel" style="left:17.5%">${WHEEL}</i><i class="ml-wheel" style="left:67.5%">${WHEEL}</i>`;

export class MiniLoader {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'miniLoad';
    this.el.className = 'hidden';
    this.el.innerHTML = `<div class="ml-card"><div class="ml-img"></div><div class="ml-tip"></div><div class="ml-pips"></div></div>
      <div class="ml-run"><div class="ml-road"><div class="ml-moto">${MOTO}</div><i></i><i></i><i></i></div>
      <div class="ml-word"><span class="ml-txt"></span><span class="ml-dots"></span><div class="ml-sub"></div></div></div>`;
    root.append(this.el);
    this.card = this.el.querySelector('.ml-card');
    this.timers = [];
    // tải sẵn ảnh mẹo (nhỏ, ~100 KB / ảnh) → lúc đổi mẹo ảnh hiện ngay, không bị khung trống
    this.preload = (LOADING.tips || []).filter((t) => t.img).map((t) => Object.assign(new Image(), { src: IMG_BASE + t.img }));
  }

  // kind: 'offline' | 'new' | 'online'
  show(kind) {
    this.stop();
    const tips = (LOADING.tips || []).filter((t) => t.text);
    this.el.querySelector('.ml-txt').textContent = fmt(`loading.mini.${kind}`);
    this.el.querySelector('.ml-sub').textContent = '';
    this.el.querySelector('.ml-pips').innerHTML = tips.map(() => '<i></i>').join('');
    this.card.classList.toggle('hidden', !tips.length);
    let i = Math.floor(Math.random() * tips.length);
    const paint = () => {
      const t = tips[i];
      this.el.querySelector('.ml-img').style.backgroundImage = t.img ? `url("${IMG_BASE}${t.img}")` : '';
      this.el.querySelector('.ml-tip').innerHTML = `<b>${fmt('loading.tipLabel')}</b> ${fmt(t.text)}`;
      [...this.el.querySelectorAll('.ml-pips i')].forEach((p, k) => p.classList.toggle('on', k === i));
    };
    if (tips.length) {
      paint();
      // chờ lâu → đổi mẹo + ảnh (mờ ra rồi hiện lại)
      this.timers.push(setInterval(() => {
        this.card.classList.add('swap');
        this.timers.push(setTimeout(() => { i = (i + 1) % tips.length; paint(); this.card.classList.remove('swap'); }, 350));
      }, (LOADING.tipSec || 5) * 1000));
    }
    if (kind === 'online') this.timers.push(setTimeout(() => (this.el.querySelector('.ml-sub').textContent = fmt('loading.mini.slow')), (LOADING.tipSec || 5) * 1000));
    this.el.classList.remove('hidden', 'out');
  }

  hide() {
    this.stop();
    this.el.classList.add('out');
    this.timers.push(setTimeout(() => this.el.classList.add('hidden'), 400));
  }

  stop() {
    for (const t of this.timers) { clearInterval(t); clearTimeout(t); }
    this.timers = [];
  }
}
