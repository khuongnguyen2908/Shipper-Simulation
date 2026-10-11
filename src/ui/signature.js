// Ô ký tên (popup hợp đồng khi đăng ký hãng): kéo chuột / vuốt ngón tay để ký.
// signaturePad(tên) → { el, signed(), dataURL(), clear() } — dataURL lưu vào GameState.contracts, hiện ở app Hồ sơ.
import { fmt } from '../content/index.js';

const W = 420, H = 120, INK = 24; // phải vẽ dài ít nhất INK px mới tính là đã ký

export function signaturePad(name) {
  const wrap = document.createElement('div');
  wrap.className = 'sig-pad';
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const hint = document.createElement('small');
  hint.textContent = fmt('dlg.contractSignHint', { name });
  wrap.append(c, hint);
  const g = c.getContext('2d');
  let ink = 0, last = null;

  // giấy: nền kem + dòng kẻ ký + tên in sẵn ở góc
  const paper = () => {
    g.fillStyle = '#fdfaf0';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#c9c2ad';
    g.lineWidth = 1;
    g.setLineDash([6, 5]);
    g.beginPath();
    g.moveTo(16, H - 26);
    g.lineTo(W - 16, H - 26);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#8a8370';
    g.font = '12px sans-serif';
    g.fillText(name, 18, H - 9);
    ink = 0;
  };
  paper();

  // toạ độ trên khung vẽ (khung có thể bị co theo bề rộng popup)
  const at = (e) => {
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  c.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    c.setPointerCapture(e.pointerId);
    last = at(e);
  });
  c.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = at(e);
    g.strokeStyle = '#1b2a4a';
    g.lineWidth = 2.6;
    g.lineCap = g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(last.x, last.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    ink += Math.hypot(p.x - last.x, p.y - last.y);
    last = p;
  });
  const up = () => (last = null);
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', up);

  return {
    el: wrap,
    signed: () => ink >= INK,
    dataURL: () => c.toDataURL('image/png'),
    clear: paper,
  };
}
