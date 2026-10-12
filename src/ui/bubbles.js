import * as THREE from 'three';

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

  // id: ai nói · head(): vị trí đầu (Vector3) hoặc null · kind: 'chat' | 'npc' (màu khác nhau)
  show(id, head, text, kind = 'npc') {
    let b = this.map.get(id);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'bubble';
      this.el.appendChild(el);
      b = { el };
      this.map.set(id, b);
    }
    b.el.textContent = text; // không chèn HTML
    b.el.className = `bubble k-${kind}`;
    b.head = head;
    b.t = Math.min(9, 3 + text.length * 0.06); // câu dài hiện lâu hơn
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
      b.el.style.left = `${((tmp.x + 1) / 2) * W}px`;
      b.el.style.top = `${((1 - tmp.y) / 2) * H}px`;
      b.el.style.opacity = String(Math.min(1, b.t / 0.4)); // mờ dần lúc sắp tắt
    }
  }
}

// Vị trí đỉnh đầu của một người (mesh) — dùng làm điểm bám bong bóng
export function headOf(mesh, up = 2.05) {
  if (!mesh || !mesh.parent || !mesh.visible) return null;
  const v = mesh.getWorldPosition(new THREE.Vector3());
  v.y += up;
  return v;
}
