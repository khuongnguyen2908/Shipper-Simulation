// Ngày – đêm theo giờ game + mưa (hạt) + chớp.
// Vòm trời có dải màu (đỉnh đậm, chân trời nhạt; bình minh/hoàng hôn cam hồng; đêm tím sẫm có sao, trăng),
// quầng mặt trời; sương mù lấy đúng màu chân trời để nhà ở xa chìm dần vào trời.
import * as THREE from 'three';

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const C = (h) => new THREE.Color(h);
// [đỉnh trời, chân trời]
const DAY = [C(0x3f86d8), C(0xc4e2f6)], DUSK = [C(0x4b4682), C(0xff9a62)], NIGHT = [C(0x05081a), C(0x1d2b4c)], RAIN = [C(0x4f5863), C(0x8d969f)];
const SUN_NOON = C(0xfff4e2), SUN_LOW = C(0xffb066);

// Vòm trời: hình cầu lớn đi theo camera, tô màu bằng shader (không bị sương mù che)
const skyVert = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // luôn nằm sau mọi thứ
}`;
const skyFrag = `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunAmt;
uniform vec3 uMoonDir; uniform float uMoonAmt; uniform float uStars;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.55)) : mix(uHorizon, uBottom, min(1.0, -h * 4.0));
  // quầng + đĩa mặt trời
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * uSunAmt * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.6 + smoothstep(0.9994, 0.9997, s) * 4.0);
  // sao: điểm sáng ngẫu nhiên theo ô hướng nhìn, chỉ phía trên chân trời
  if (uStars > 0.0 && h > 0.02) {
    vec3 cell = floor(d * 260.0);
    float r = hash(cell);
    float star = step(0.9982, r) * smoothstep(0.02, 0.25, h);
    col += vec3(0.9, 0.93, 1.0) * star * uStars * (0.5 + 0.5 * hash(cell + 7.0));
  }
  // trăng: đĩa sáng + quầng mờ
  float m = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * uMoonAmt * (smoothstep(0.99955, 0.9998, m) * 1.6 + pow(m, 200.0) * 0.25);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x7a6a52, 1);
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
    scene.fog = new THREE.Fog(0xc4e2f6, 70, 260);
    scene.background = new THREE.Color(0xc4e2f6);
    this.uni = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uSunAmt: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonAmt: { value: 0 }, uStars: { value: 0 },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;
    scene.add(this.dome);
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

    // mặt trời đi từ đông sang tây; nắng thấp (sáng sớm, chiều) ngả vàng cam, trưa trắng ấm
    const ang = ((h - 6) / 13) * Math.PI;
    const elev = Math.max(0.15, Math.sin(ang));
    const dir = new THREE.Vector3(Math.cos(ang) * 0.8, elev, 0.45).normalize();
    this.sun.position.set(focus.x + dir.x * 120, dir.y * 120, focus.z + dir.z * 120);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.intensity = (0.25 + 2.6 * day) * (1 - 0.65 * wet);
    const warm = Math.max(dusk, 1 - smooth(0.25, 0.75, Math.sin(Math.max(0, ang))));
    this.sun.color.copy(SUN_NOON).lerp(SUN_LOW, warm * 0.85);

    // màu trời: đêm → ngày → hoàng hôn → mưa
    const top = NIGHT[0].clone().lerp(DAY[0], day).lerp(DUSK[0], dusk * 0.75).lerp(RAIN[0], wet * 0.8 * (0.3 + 0.7 * day));
    const hor = NIGHT[1].clone().lerp(DAY[1], day).lerp(DUSK[1], dusk * 0.8).lerp(RAIN[1], wet * 0.8 * (0.3 + 0.7 * day));
    // chớp khi mưa to
    if (rain && rain.heavy && Math.random() < dt * 0.08) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 3);
    top.lerp(C(0xdde6ff), this.flash * 0.6);
    hor.lerp(C(0xdde6ff), this.flash * 0.6);
    const u = this.uni;
    u.uTop.value.copy(top);
    u.uHorizon.value.copy(hor);
    u.uBottom.value.copy(hor).multiplyScalar(0.75);
    u.uSunDir.value.copy(dir);
    u.uSunColor.value.copy(this.sun.color);
    u.uSunAmt.value = day * (1 - 0.9 * wet);
    u.uMoonDir.value.set(-dir.x, Math.max(0.35, 0.9 - dir.y * 0.5), -dir.z * 0.6).normalize();
    u.uMoonAmt.value = this.night * (1 - wet);
    u.uStars.value = smooth(0.4, 1, this.night) * (1 - wet);
    this.dome.position.copy(camera.position);
    this.scene.background.copy(hor);
    this.scene.fog.color.copy(hor);
    this.scene.fog.near = wet ? 30 : 70;
    this.scene.fog.far = wet ? 150 : 260;
    // ánh sáng trời: trên mát hơi xanh, dưới đất hắt lên ấm
    this.hemi.intensity = 0.62 + 0.75 * day + this.flash * 2;
    this.hemi.color.copy(top).lerp(C(0xffffff), 0.55 + 0.2 * (1 - day));
    this.hemi.groundColor.set(0x7a6a52).lerp(C(0x2a2a3a), this.night * 0.7);

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
