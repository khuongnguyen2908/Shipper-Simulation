// Bàn phím + chuột (kéo để xoay camera, cuộn để zoom).
// Khóa con trỏ (pointer lock): lúc đang chơi mà không mở điện thoại / hộp thoại, con trỏ ẩn đi và di chuột là xoay camera.
// Trình duyệt chỉ cho khóa ngay sau một cú bấm chuột / phím; Esc luôn thả con trỏ (game coi như tạm dừng).
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
    this.look = { dx: 0, dy: 0 }; // chuột di khi đang khóa con trỏ
    this.canvas = canvas;
    this.locked = false;
    this.wantLock = false;
    this.onUnlock = null; // người chơi tự thả con trỏ (Esc) → game tạm dừng
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      this.lockPending = false;
      if (was && !this.locked) {
        this.unlockedAt = performance.now();
        if (this.wantLock) this.onUnlock?.();
      }
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockPending = false;
      this.lockFailedAt = performance.now();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look.dx += e.movementX || 0;
      this.look.dy += e.movementY || 0;
    });
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
      if (this.wantLock && !this.locked) this.requestLock(); // bấm vào màn hình chơi → khóa con trỏ
      if (this.locked) return;
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* vừa khóa con trỏ thì trình duyệt không cho bắt chuột — bỏ qua */ }
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

  // Gọi mỗi khung hình: want = đang chơi, không mở điện thoại / hộp thoại / tạm dừng
  setLock(want) {
    this.wantLock = want;
    if (!want) {
      if (this.locked) document.exitPointerLock();
      return;
    }
    // chỉ thử khóa ngay sau khi người chơi vừa bấm phím / chuột (trình duyệt chặn nếu không)
    if (!this.locked && navigator.userActivation?.isActive) this.requestLock();
  }

  requestLock() {
    if (this.lockPending || performance.now() - (this.lockFailedAt || 0) < 1200) return;
    this.lockPending = true;
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => { this.lockPending = false; this.lockFailedAt = performance.now(); });
    } catch {
      this.lockPending = false;
      this.lockFailedAt = performance.now();
    }
  }

  endFrame() {
    this.pressed.clear();
    this.drag.dx = this.drag.dy = 0;
    this.look.dx = this.look.dy = 0;
    this.wheel = 0;
  }
}
