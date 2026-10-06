// Ngày – đêm theo giờ game + mưa (hạt) + chớp.
import * as THREE from 'three';

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const C = (h) => new THREE.Color(h);
const SKY_DAY = C(0x9fd3ff), SKY_DUSK = C(0xffa66b), SKY_NIGHT = C(0x1b2a4e), SKY_RAIN = C(0x6d7783);

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a5040, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -60;
    sc.right = 60;
    sc.top = 60;
    sc.bottom = -60;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0x9fd3ff, 70, 260);
    scene.background = new THREE.Color(0x9fd3ff);
    this.flash = 0;
    this.rain = new Rain(scene);
    this.night = 0;
  }

  // minutes: giờ game (phút trong ngày); rain: { heavy } | null; focus: vị trí người chơi
  update(dt, minutes, rain, focus, camera) {
    const h = minutes / 60;
    const day = smooth(5.0, 6.5, h) * (1 - smooth(18.0, 19.4, h));
    const dusk = Math.max(smooth(5.0, 6.0, h) * (1 - smooth(6.2, 7.6, h)), smooth(16.8, 18.2, h) * (1 - smooth(18.4, 19.4, h)));
    const wet = rain ? (rain.heavy ? 1 : 0.6) : 0;
    this.night = 1 - day;

    // mặt trời đi từ đông sang tây
    const ang = ((h - 6) / 13) * Math.PI;
    const elev = Math.max(0.15, Math.sin(ang));
    const dir = new THREE.Vector3(Math.cos(ang) * 0.8, elev, 0.45).normalize();
    this.sun.position.set(focus.x + dir.x * 120, dir.y * 120, focus.z + dir.z * 120);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.intensity = (0.25 + 2.6 * day) * (1 - 0.65 * wet);
    this.sun.color.setRGB(1, 1 - 0.35 * dusk, 1 - 0.55 * dusk);

    const sky = SKY_NIGHT.clone().lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.7).lerp(SKY_RAIN, wet * 0.75 * (0.3 + 0.7 * day));
    // chớp khi mưa to
    if (rain && rain.heavy && Math.random() < dt * 0.08) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 3);
    sky.lerp(C(0xdde6ff), this.flash * 0.6);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.scene.fog.near = wet ? 30 : 70;
    this.scene.fog.far = wet ? 150 : 260;
    this.hemi.intensity = 0.62 + 0.75 * day + this.flash * 2;
    this.hemi.color.copy(sky).lerp(C(0xffffff), 0.45 + 0.2 * (1 - day));

    this.rain.update(dt, wet, camera);
    return { night: this.night, wet };
  }
}

class Rain {
  constructor(scene) {
    this.N = 2600;
    const pos = new Float32Array(this.N * 6);
    this.drops = new Float32Array(this.N * 3);
    for (let i = 0; i < this.N; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * 70;
      this.drops[i * 3 + 1] = Math.random() * 30;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xaec6e0, transparent: true, opacity: 0 });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }
  update(dt, amount, camera) {
    this.mat.opacity += (amount * 0.8 - this.mat.opacity) * Math.min(1, dt * 2);
    this.lines.visible = this.mat.opacity > 0.01;
    if (!this.lines.visible) return;
    const p = this.geo.attributes.position.array;
    const cx = camera.position.x, cz = camera.position.z;
    const n = Math.floor(this.N * Math.max(0.3, amount));
    for (let i = 0; i < this.N; i++) {
      const k = i * 3;
      this.drops[k + 1] -= dt * 26;
      if (this.drops[k + 1] < 0) this.drops[k + 1] += 30;
      const x = cx + this.drops[k], y = this.drops[k + 1], z = cz + this.drops[k + 2];
      const j = i * 6;
      const vis = i < n ? 1 : 0;
      p[j] = x;
      p[j + 1] = y * vis;
      p[j + 2] = z;
      p[j + 3] = x + 0.08;
      p[j + 4] = (y + 1.0) * vis;
      p[j + 5] = z + 0.08;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
