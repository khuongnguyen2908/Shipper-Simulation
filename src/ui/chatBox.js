import { fmt } from '../content/index.js';
import { CHAT_MAX } from '../sim/chat.js';

// Khung chat bên trái màn hình: log các dòng gần đây (tự mờ dần) + ô gõ tin (Enter mở · Enter gửi · Esc hủy).
// Mọi chữ người chơi gõ đều gán bằng textContent (không chèn HTML) — an toàn khi sau này chơi nhiều người.
const SHOW = 8; // số dòng hiện khi không gõ
const FADE_MS = 14000; // dòng cũ hơn mức này thì mờ đi (khi không gõ)

export class ChatBox {
  // channel: ChatChannel · onSend(text): gửi tin (game gắn giờ trong game, hiện bong bóng…)
  constructor(root, channel, onSend) {
    this.channel = channel;
    this.onSend = onSend;
    this.el = document.createElement('div');
    this.el.id = 'chat';
    this.el.innerHTML = `<div class="ch-log"></div><input class="ch-in hidden" type="text" maxlength="${CHAT_MAX}" placeholder="${fmt('chat.placeholder')}" autocomplete="off">`;
    root.appendChild(this.el);
    this.log = this.el.querySelector('.ch-log');
    this.input = this.el.querySelector('.ch-in');
    this.typing = false;
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // phím khi đang gõ không lọt vào game / điện thoại
      if (e.key === 'Enter') {
        e.preventDefault();
        const t = this.input.value;
        this.close();
        if (t.trim()) this.onSend(t);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    this.input.addEventListener('blur', () => this.close());
    channel.on((line) => this.add(line));
  }

  add(line) {
    const row = document.createElement('div');
    row.className = `ch-line k-${line.kind}${line.mine ? ' mine' : ''}`;
    row.dataset.at = String(performance.now());
    if (line.time) {
      const t = document.createElement('i');
      t.textContent = line.time;
      row.appendChild(t);
    }
    if (line.name) {
      const b = document.createElement('b');
      b.textContent = line.name;
      row.appendChild(b);
    }
    row.appendChild(document.createTextNode(line.text));
    this.log.appendChild(row);
    while (this.log.childElementCount > 80) this.log.firstElementChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  open() {
    if (this.typing) return;
    this.typing = true;
    this.el.classList.add('open');
    this.input.classList.remove('hidden');
    this.input.value = '';
    this.input.focus();
    this.log.scrollTop = this.log.scrollHeight;
  }

  close() {
    if (!this.typing) return;
    this.typing = false;
    this.el.classList.remove('open');
    this.input.classList.add('hidden');
    this.input.blur();
  }

  // mỗi khung hình: dòng cũ mờ đi, chỉ hiện vài dòng cuối (đang gõ thì hiện hết, cuộn xem lại được)
  update() {
    if (this.typing) return;
    const now = performance.now(), rows = this.log.children, n = rows.length;
    for (let i = 0; i < n; i++) {
      const r = rows[i], old = i < n - SHOW || now - Number(r.dataset.at) > FADE_MS;
      if (r.classList.contains('old') !== old) r.classList.toggle('old', old);
    }
  }
}
