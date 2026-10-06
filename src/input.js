// Bàn phím + chuột (kéo để xoay camera, cuộn để zoom)
const MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'brake',
};

export class Input {
  constructor(canvas) {
    this.state = { forward: false, back: false, left: false, right: false, run: false, brake: false };
    this.pressed = new Set(); // phím vừa bấm trong khung hình này
    this.drag = { dx: 0, dy: 0 };
    this.wheel = 0;
    this.enabled = true;
    let dragging = false, lx = 0, ly = 0;
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (MAP[e.code]) this.state[MAP[e.code]] = true;
      if (!e.repeat) this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (MAP[e.code]) this.state[MAP[e.code]] = false;
    });
    // nhả hết phím khi tab bị ẩn
    const release = () => {
      for (const k of Object.keys(this.state)) this.state[k] = false;
      dragging = false;
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.drag.dx += e.clientX - lx;
      this.drag.dy += e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
    });
    canvas.addEventListener('pointerup', () => (dragging = false));
    canvas.addEventListener('pointercancel', () => (dragging = false));
    canvas.addEventListener('wheel', (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  was(code) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.drag.dx = this.drag.dy = 0;
    this.wheel = 0;
  }
}
