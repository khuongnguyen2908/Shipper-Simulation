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
    // ch-tabs: thẻ Chung / Gần (chỉ khi chơi Online — setScope)
    this.el.innerHTML = `<div class="ch-log"></div><div class="ch-tabs hidden"><b data-s="all">${fmt('online.chatAll')}</b><b data-s="near">${fmt('online.chatNear')}</b></div><input class="ch-in hidden" type="text" maxlength="${CHAT_MAX}" placeholder="${fmt('chat.placeholder')}" autocomplete="off">`;
    root.appendChild(this.el);
    this.log = this.el.querySelector('.ch-log');
    this.input = this.el.querySelector('.ch-in');
    this.tabs = this.el.querySelector('.ch-tabs');
    this.scopeCtl = null; // Online: { get(), set(scope) } — 'all' cả thành phố · 'near' người ở gần
    this.tabs.addEventListener('mousedown', (e) => {
      const s = e.target.closest('[data-s]')?.dataset.s;
      if (s && this.scopeCtl) { e.preventDefault(); this.scopeCtl.set(s); this.drawTabs(); }
    });
    this.typing = false;
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // phím khi đang gõ không lọt vào game / điện thoại
      if (e.key === 'Tab' && this.scopeCtl) { // Tab khi đang gõ: đổi Chung ↔ Gần
        e.preventDefault();
        this.scopeCtl.set(this.scopeCtl.get() === 'near' ? 'all' : 'near');
        this.drawTabs();
        return;
      }
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
    if (line.scope === 'near') { // tin chat "Gần" (Online)
      const g = document.createElement('span');
      g.className = 'g';
      g.textContent = fmt('online.nearTag');
      row.appendChild(g);
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
    this.drawTabs();
    this.input.value = '';
    this.input.focus();
    this.log.scrollTop = this.log.scrollHeight;
  }

  close() {
    if (!this.typing) return;
    this.typing = false;
    this.el.classList.remove('open');
    this.input.classList.add('hidden');
    this.tabs.classList.add('hidden');
    this.input.blur();
  }
  // Online: bật thẻ Chung / Gần (ctl = null: chơi Offline, không có thẻ)
  setScope(ctl) {
    this.scopeCtl = ctl;
    this.drawTabs();
  }
  drawTabs() {
    const on = !!this.scopeCtl && this.typing;
    this.tabs.classList.toggle('hidden', !on);
    if (!on) return;
    const s = this.scopeCtl.get();
    for (const b of this.tabs.children) b.classList.toggle('on', b.dataset.s === s);
    this.input.placeholder = fmt(s === 'near' ? 'online.phNear' : 'online.phAll');
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
