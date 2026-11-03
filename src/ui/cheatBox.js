// Ô nhập mã cheat (kiểu GTA): bấm phím ` (dưới Esc) mở, gõ mã rồi Enter, Esc đóng. Mã + việc làm ở src/interactions/cheatCodes.js.
// Đang mở thì phím không lọt xuống game (WASD, E…). Chữ người chơi gõ gán bằng .value / textContent (không chèn HTML).
import { fmt } from '../content/index.js';

export class CheatBox {
  // onCode(text) → { ok, text }: game nhập mã, trả chữ báo kết quả · onToggle(open): game thả / khóa con trỏ chuột
  constructor(root, onCode, onToggle) {
    this.el = document.createElement('div');
    this.el.id = 'cheatBox';
    this.el.className = 'hidden';
    this.el.innerHTML = `<b>${fmt('cheat.title')}</b><input type="text" maxlength="24" autocomplete="off" spellcheck="false" placeholder="${fmt('cheat.placeholder')}"><div class="cb-msg"></div>`;
    root.appendChild(this.el);
    this.input = this.el.querySelector('input');
    this.msg = this.el.querySelector('.cb-msg');
    this.open = false;
    this.onToggle = onToggle;
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // phím khi đang gõ không lọt vào game
      if (e.key === 'Enter') {
        e.preventDefault();
        const r = onCode(this.input.value);
        this.msg.textContent = r.text;
        this.msg.className = `cb-msg ${r.ok ? 'ok' : 'bad'}`;
        this.input.value = '';
        if (r.ok) setTimeout(() => this.toggle(false), 700);
      } else if (e.key === 'Escape' || e.code === 'Backquote') {
        e.preventDefault();
        this.toggle(false);
      }
    });
  }

  toggle(open = !this.open) {
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    this.onToggle?.(open);
    if (open) {
      this.msg.textContent = '';
      this.input.value = '';
      this.input.focus();
    } else this.input.blur();
  }
}
