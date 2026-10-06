// Hộp thoại dùng chung: hội thoại NPC, lựa chọn, cửa hàng, hóa đơn…
// Khi hộp thoại mở, thế giới tạm dừng. Phím 1–9 chọn nhanh, Esc đóng (nếu cho phép).
import { fmt } from '../content/index.js';

export class Modal {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'modal';
    this.el.className = 'hidden';
    root.appendChild(this.el);
    this.open = false;
    this.choices = [];
    this.dismissible = true;
    this.onClose = null;
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Escape' && this.dismissible) {
        e.stopPropagation();
        this.close();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && this.choices[n - 1] && !this.choices[n - 1].disabled) {
        e.preventDefault();
        this.pick(n - 1);
      }
    }, true);
  }

  // opts: { title, speaker, portrait, text, html, choices:[{label, hint, disabled, onSelect, keepOpen}], wide, dismissible, onClose, node }
  show(opts) {
    this.open = true;
    this.dismissible = opts.dismissible !== false;
    this.onClose = opts.onClose || null;
    this.choices = opts.choices || [];
    const head = opts.speaker
      ? `<div class="m-speaker"><span class="m-portrait">${opts.portrait || '🙂'}</span><b>${opts.speaker}</b></div>`
      : opts.title
        ? `<div class="m-title">${opts.title}</div>`
        : '';
    const body = opts.html ?? (opts.text ? `<p class="m-text">${opts.text}</p>` : '');
    const choices = this.choices
      .map((c, i) => `<button class="m-choice${c.disabled ? ' disabled' : ''}${c.primary ? ' primary' : ''}" data-i="${i}" ${c.disabled ? 'disabled' : ''}><span class="m-key">${i + 1}</span><span>${c.label}${c.hint ? `<small>${c.hint}</small>` : ''}</span></button>`)
      .join('');
    this.el.className = opts.wide ? 'wide' : '';
    this.el.innerHTML = `<div class="m-box">${head}<div class="m-body">${body}</div><div class="m-choices">${choices}</div>${this.dismissible ? `<button class="m-close" title="${fmt('modal.close')}">✕</button>` : ''}</div>`;
    if (opts.node) this.el.querySelector('.m-body').appendChild(opts.node);
    this.el.querySelectorAll('.m-choice').forEach((b) => b.addEventListener('click', () => this.pick(Number(b.dataset.i))));
    const x = this.el.querySelector('.m-close');
    if (x) x.addEventListener('click', () => this.close());
    if (opts.afterRender) opts.afterRender(this.el);
  }

  pick(i) {
    const c = this.choices[i];
    if (!c || c.disabled) return;
    if (!c.keepOpen) this.hide();
    c.onSelect && c.onSelect();
  }

  hide() {
    this.open = false;
    this.el.className = 'hidden';
    this.el.innerHTML = '';
  }

  close() {
    const cb = this.onClose;
    this.hide();
    cb && cb();
  }
}
