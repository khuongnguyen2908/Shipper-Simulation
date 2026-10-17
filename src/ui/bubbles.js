import * as THREE from 'three';
import { sound } from '../audio.js';

// Bong bóng thoại trên đầu người trong thế giới 3D (người chơi chat, khách, người đi đường…).
// Mỗi người (id) một bong bóng: nói câu mới thì thay câu cũ. Bong bóng bám theo vị trí đầu, khuất sau camera / xa quá thì ẩn.
const MAX_DIST = 45; // xa hơn (m) thì không hiện
const tmp = new THREE.Vector3();

export class Bubbles {
  constructor(root, camera) {
    this.camera = camera;
    this.el = document.createElement('div');
    this.el.id = 'bubbles';
    root.appendChild(this.el);
    this.map = new Map();
  }

  // id: ai nói · head(): vị trí đầu (Vector3) hoặc null · kind: 'chat' | 'npc' | 'story' (màu khác nhau)
  // life: số giây hiện (bỏ trống = theo độ dài câu; Infinity = giữ tới khi thay câu khác / remove)
  // opt (bong bóng cốt truyện): name = tên người nói (dòng nhỏ trên cùng) · type = chữ hiện dần kèm tiếng lách cách
  //   · wait = hiện xong thì có dấu [E] nhấp nháy (đang chờ người chơi bấm E)
  show(id, head, text, kind = 'npc', life, opt = {}) {
    let b = this.map.get(id);
    if (!b) {
      const el = document.createElement('div');
      this.el.appendChild(el);
      b = { el };
      this.map.set(id, b);
    }
    b.el.className = `bubble k-${kind}`;
    b.el.replaceChildren(); // không chèn HTML: chữ đi qua textContent
    if (opt.name) b.el.append(span('bub-name', opt.name));
    // chữ hiện dần: phần chưa hiện vẫn chiếm chỗ (ẩn) → bong bóng giữ nguyên cỡ, không nở dần
    b.tx = span('bub-tx', '');
    b.tx.append(span('', opt.type ? '' : text), span('bub-off', opt.type ? text : ''));
    b.el.append(b.tx);
    b.key = opt.wait ? span('bub-key', 'E') : null;
    if (b.key) { b.key.hidden = !!opt.type; b.el.append(b.key); }
    Object.assign(b, { full: text, shown: opt.type ? 0 : text.length, typing: !!opt.type, head, pick: null, born: (this.seq = (this.seq || 0) + 1) });
    b.t = life ?? Math.min(9, 3 + text.length * 0.06); // câu dài hiện lâu hơn
  }
  // Bảng 2–3 câu trả lời trên đầu (người chơi chọn bằng phím 1/2/3 hoặc bấm vào) → onPick(số thứ tự)
  choices(id, head, texts, onPick) {
    this.remove(id);
    const el = document.createElement('div');
    el.className = 'bubble k-choices';
    texts.forEach((t, i) => {
      const row = span('bub-opt', '');
      row.append(span('bub-num', String(i + 1)), document.createTextNode(t));
      row.onclick = () => onPick(i);
      el.append(row);
    });
    this.el.appendChild(el);
    this.map.set(id, { el, head, t: Infinity, pick: onPick });
  }
  // Đang hiện dần chữ? · hiện hết luôn (người chơi bấm E lúc chữ đang chạy)
  typing(id) {
    return !!this.map.get(id)?.typing;
  }
  finish(id) {
    const b = this.map.get(id);
    if (!b?.typing) return;
    b.shown = b.full.length;
    b.typing = false;
    b.tx.firstChild.textContent = b.full;
    b.tx.lastChild.textContent = '';
    if (b.key) b.key.hidden = false;
  }

  remove(id) {
    const b = this.map.get(id);
    if (!b) return;
    b.el.remove();
    this.map.delete(id);
  }

  update(dt) {
    const W = innerWidth, H = innerHeight;
    for (const [id, b] of this.map) {
      b.t -= dt;
      if (b.typing) { // chữ hiện dần (~35 chữ / giây), cứ 2 chữ một tiếng lách cách
        const was = Math.floor(b.shown);
        b.shown = Math.min(b.full.length, b.shown + dt * 35);
        const n = Math.floor(b.shown);
        if (n !== was) {
          b.tx.firstChild.textContent = b.full.slice(0, n);
          b.tx.lastChild.textContent = b.full.slice(n);
          if (Math.floor(n / 2) !== Math.floor(was / 2) && b.full[n - 1] !== ' ') sound('ui.talk');
        }
        if (n >= b.full.length) this.finish(id);
      }
      const p = b.t > 0 && b.head();
      if (!p) {
        if (b.t <= 0) this.remove(id);
        else b.el.style.display = 'none';
        continue;
      }
      tmp.copy(p);
      const far = tmp.distanceTo(this.camera.position) > MAX_DIST;
      tmp.project(this.camera);
      if (far || tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) {
        b.el.style.display = 'none';
        continue;
      }
      b.el.style.display = '';
      // giữa đáy bong bóng = đỉnh đầu; làm tròn điểm ảnh (chữ không rung), giữ trọn trong màn hình (không bị cắt ở mép)
      const w = b.el.offsetWidth, h = b.el.offsetHeight;
      const x = Math.round(Math.max(4, Math.min(W - w - 4, ((tmp.x + 1) / 2) * W - w / 2)));
      const y = Math.round(Math.max(4, ((1 - tmp.y) / 2) * H - h));
      b.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      b.el.style.opacity = String(Math.min(1, b.t / 0.4)); // mờ dần lúc sắp tắt
      b.box = [x, y, x + w, y + h];
    }
    // 2 bong bóng cốt truyện đè lên nhau (2 người đứng sát nhau nói qua lại): câu mới nằm đúng chỗ, câu cũ đẩy lên trên câu mới
    const story = [...this.map].filter(([id, b]) => id.startsWith('story:') && b.el.style.display !== 'none' && b.box && b.born).map(([, b]) => b).sort((a, b) => b.born - a.born);
    const placed = [];
    for (const b of story) {
      let [x0, y0, x1, y1] = b.box;
      for (let k = 0; k < 4; k++) {
        const hit = placed.find(([a0, b0, a1, b1]) => x0 < a1 + 4 && x1 > a0 - 4 && y0 < b1 + 4 && y1 > b0 - 4);
        if (!hit) break;
        const h = y1 - y0;
        y1 = hit[1] - 6;
        y0 = y1 - h;
      }
      if (y0 !== b.box[1]) { b.el.style.transform = `translate3d(${x0}px, ${Math.max(4, y0)}px, 0)`; b.box = [x0, y0, x1, y1]; }
      placed.push(b.box);
    }
    // bong bóng cốt truyện (id "story:…") được ưu tiên: bong bóng khác chồng lên nó thì tạm ẩn
    const main = [...this.map].filter(([id, b]) => id.startsWith('story:') && b.el.style.display !== 'none').map(([, b]) => b.box);
    if (!main.length) return;
    for (const [id, b] of this.map) {
      if (id.startsWith('story:') || b.el.style.display === 'none' || !b.box) continue;
      const [x0, y0, x1, y1] = b.box;
      if (main.some(([a0, b0, a1, b1]) => x0 < a1 + 6 && x1 > a0 - 6 && y0 < b1 + 6 && y1 > b0 - 6)) b.el.style.display = 'none';
    }
  }
}

function span(cls, text) {
  const e = document.createElement('span');
  e.className = cls;
  e.textContent = text;
  return e;
}

// Vị trí đỉnh đầu của một người (mesh) — dùng làm điểm bám bong bóng
export function headOf(mesh, up = 2.05) {
  if (!mesh || !mesh.parent || !mesh.visible) return null;
  const v = mesh.getWorldPosition(new THREE.Vector3());
  v.y += up;
  return v;
}
