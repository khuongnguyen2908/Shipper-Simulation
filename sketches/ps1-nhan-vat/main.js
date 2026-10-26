// PHÁC HỌA (không vào game): nhân vật shipper kiểu PS1 — so 3 bản cạnh nhau.
// ① hình game hiện tại · ② chỉ thêm bộ lọc PS1 (vẽ độ phân giải thấp, ít màu + chấm nhiễu, đỉnh hình rung) · ③ bộ lọc + vẽ lại texture (mặt anime, áo phản quang, tường / sofa bẩn)
// Mở: npm run dev → http://localhost:5180/sketches/ps1-nhan-vat/
import * as THREE from 'three';
import { buildPerson, PERSON_MAT } from '../../src/world/person.js';

const LOOK = {
  gender: 'f', skin: 0xf1c7a5, hair: 0x6b3f22, style: 'bob',
  hat: 'helmet', hatColor: 0xe8731c,
  shirtStyle: 'gile', shirt: 0xd8e63c, shirt2: 0x26305c, // gile phản quang vàng chanh, áo thun xanh đậm bên trong
  pants: 0xb59a6c, pantsStyle: 'cargo', shoe: 0x8a6a45, shoeStyle: 'boots',
  gloves: 'gloves', gloveColor: 0xd9b48a,
};

// ---------- texture vẽ bằng canvas ----------
const canvasTex = (w, h, draw, pixel = false) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  return t;
};
// nhiễu "bẩn": chấm sáng / tối ngẫu nhiên có seed
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function grime(ctx, w, h, seed, k = 0.12) {
  const r = rng(seed);
  for (let i = 0; i < w * h * 0.6; i++) {
    const v = r() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${r() * k})`;
    ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1);
  }
  for (let i = 0; i < 6; i++) { // vết ố loang
    const x = r() * w, y = r() * h, rad = 4 + r() * w * 0.2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(70,40,10,0.18)'); g.addColorStop(1, 'rgba(70,40,10,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
}
// tường giấy dán sọc dây leo (giống ảnh mẫu)
const wallTex = () => canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#c99a5e'; c.fillRect(0, 0, w, h);
  for (let x = 6; x < w; x += 16) {
    c.fillStyle = '#b5844a'; c.fillRect(x, 0, 3, h);
    for (let y = 0; y < h; y += 8) { c.fillStyle = '#9c6c36'; c.fillRect(x + ((y / 8) % 2 ? 3 : -2), y + 2, 2, 3); }
  }
  grime(c, w, h, 7, 0.16);
}, true);
// vải sofa hồng hoa văn
const sofaTex = () => canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#d98f80'; c.fillRect(0, 0, w, h);
  const r = rng(3);
  for (let i = 0; i < 70; i++) { c.fillStyle = ['#e9a99a', '#c4766a', '#f0c2b0'][i % 3]; c.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2 + Math.floor(r() * 3), 2); }
  grime(c, w, h, 11, 0.14);
}, true);
const floorTex = () => canvasTex(64, 64, (c, w, h) => {
  c.fillStyle = '#7a5032'; c.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) { c.fillStyle = '#5e3a22'; c.fillRect(0, y, w, 1); }
  grime(c, w, h, 5, 0.2);
}, true);

// ---------- MẶT ANIME VẼ KIỂU PIXEL (nét cứng như texture PS1 thật) ----------
// Ô vẽ 64×64 phủ phía trước mặt: ngang x ∈ [−0,1; 0,1] m, dọc y ∈ [−0,11; 0,09] m quanh tâm đầu (1 điểm ảnh ≈ 3 mm)
const SKIN = '#f1c7a5';
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function pixelFace() {
  const N = 64, c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), D = img.data;
  const set = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= N || y >= N) return; const [r, g, b] = hex(col), i = (y * N + x) * 4; D[i] = r; D[i + 1] = g; D[i + 2] = b; D[i + 3] = 255; };
  const ell = (cx, cy, rx, ry, col, keep = () => true) => {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && keep(x, y)) set(x, y, typeof col === 'function' ? col(x, y) : col);
    }
  };
  const line = (x0, y0, x1, y1, col) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(x, y, SKIN);
  // bóng dưới cằm + 2 bên má (tô sẵn như PS1)
  for (let y = 50; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) % 2 === 0 || y > 55) set(x, y, '#e2ae8e');
  // MẮT to, mí trên sụp (mệt vì nóng), tròng xanh xám như ảnh mẫu
  const eye = (cx, s) => {
    const cy = 27;
    const inS = (x, y) => ((x + 0.5 - cx) / 7) ** 2 + ((y + 0.5 - cy - 1) / 5.6) ** 2 <= 1;
    ell(cx, cy + 1, 7, 5.6, '#f6f1ea'); // tròng trắng
    ell(cx - s * 0.6, cy + 1.6, 4.6, 5.8, (x, y) => (y < cy - 1 ? '#1d1830' : y < cy + 2 ? '#3d5294' : y < cy + 4 ? '#6f8fd0' : '#a9c4ee'), inS); // tròng
    ell(cx - s * 0.6, cy + 1.2, 1.7, 2.6, '#0c0912', inS); // con ngươi
    for (const [dx, dy] of [[-2, -1], [-1, -1], [-2, 0]]) set(cx - s * 0.6 + dx * -s, cy + dy, '#ffffff'); // đốm sáng to
    set(cx - s * 0.6 + 2 * s, cy + 4, '#ffffff'); // đốm sáng nhỏ
    for (let y = cy - 7; y < cy - 1; y++) for (let x = cx - 8; x <= cx + 8; x++) set(x, y, SKIN); // mí trên che nửa trên
    for (let x = cx - 7; x <= cx + 7; x++) { set(x, cy - 2, '#1a0f14'); if (Math.abs(x - cx) < 6) set(x, cy - 1, '#1a0f14'); } // viền mi dày
    set(cx + s * 7, cy - 3, '#1a0f14'); set(cx + s * 8, cy - 4, '#1a0f14'); set(cx + s * 8, cy - 3, '#1a0f14'); // đuôi mi hất lên
    line(cx - 4, cy + 7, cx + 4, cy + 7, '#9a6250'); // mi dưới
    line(cx - s * 6, cy - 9, cx + s * 4, cy - 11, '#5a3420'); // lông mày nhướng
  };
  eye(19, -1); eye(45, 1);
  set(32, 40, '#d49a80'); set(32, 41, '#d49a80'); // mũi
  // má hồng + gạch chéo
  for (const cx of [15, 49]) {
    ell(cx, 38, 5.5, 2.2, '#f28f8a');
    for (const dx of [-3, 0, 3]) { set(cx + dx - 1, 39, '#d0504f'); set(cx + dx, 38, '#d0504f'); set(cx + dx + 1, 37, '#d0504f'); }
  }
  // miệng hé
  ell(32, 48, 3.2, 2.6, '#6e1a22');
  ell(32, 49.4, 2, 1.1, '#e07a84');
  // giọt mồ hôi bên thái dương
  ell(56, 23, 2.2, 3, '#8fd3f5');
  set(56, 19, '#8fd3f5'); set(56, 18, '#3a8fc6');
  for (const [x, y] of [[54, 21], [54, 22], [54, 23], [54, 24], [55, 25], [56, 26], [57, 25], [58, 24], [58, 23], [58, 22], [57, 20], [55, 20]]) set(x, y, '#3a8fc6');
  set(55, 22, '#ffffff');
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
// Miếng mặt: chép đúng hình nửa trước cái đầu của game (person.js headGeo, nữ), phóng 2 % cho nằm ngoài da → mặt game giữ nguyên dáng
function faceMask() {
  const R = 0.115, g = new THREE.SphereGeometry(R, 6, 10, 0, Math.PI), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = y / R;
    x *= 0.8; y *= 1.13;
    if (ny < 0) { x *= 1 + ny * 0.36; if (z > 0) z *= 1 + ny * 0.1; }
    if (ny > -0.2 && ny < 0.25 && z > 0) x *= 1.03;
    if (z > 0 && Math.abs(x) < 0.07) { if (ny > 0.22 && ny < 0.42) z *= 1.05; else if (ny > -0.02 && ny <= 0.22) z *= 0.975; }
    p.setXYZ(i, x * 1.02, y * 1.02, z * 1.03);
    uv.setXY(i, 0.5 + x / 0.2, 0.5 + (y + 0.01) / 0.2); // chiếu thẳng từ trước mặt
  }
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: pixelFace(), flatShading: true, roughness: 0.78, metalness: 0.02 }));
}
// Vải "bẩn" cho quần áo: chấm nhiễu + vết ố + nếp nhăn (xám, nhân lên màu áo quần sẵn có)
const clothTex = () => {
  const t = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#d4d4d4'; c.fillRect(0, 0, w, h);
    const r = rng(19);
    for (let i = 0; i < 900; i++) { const v = 170 + Math.floor(r() * 85); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1); }
    for (let i = 0; i < 7; i++) { // vết ố / mòn
      const x = r() * w, y = r() * h, rad = 5 + r() * 12;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(60,50,40,0.45)'); g.addColorStop(1, 'rgba(60,50,40,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    c.strokeStyle = 'rgba(70,60,50,0.55)'; c.lineWidth = 1; // nếp nhăn
    for (let i = 0; i < 9; i++) { const x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 18, y + 6 + r() * 10); c.stroke(); }
  }, true);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

// ---------- dựng cảnh ----------
function makeScene(variant) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2018);
  scene.add(new THREE.HemisphereLight(0xffe2c0, 0x5a3a28, 1.6));
  const sun = new THREE.DirectionalLight(0xffd59a, 2.4);
  sun.position.set(-2, 3, 3);
  scene.add(sun);
  const tex = variant === 2;
  const mat = (color, map) => new THREE.MeshStandardMaterial({ color: map ? 0xffffff : color, map: map || null, roughness: 0.9, flatShading: true });
  const wt = tex && wallTex(), st = tex && sofaTex(), ft = tex && floorTex();
  if (wt) { wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(4, 3); }
  if (ft) { ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(4, 4); }
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); scene.add(b); return b; };
  box(6, 3, 0.1, mat(0xc99a5e, wt), 0, 1.5, -0.75); // tường
  box(6, 0.1, 4, mat(0x7a5032, ft), 0, -0.05, 0.6); // sàn
  const sm = mat(0xd98f80, st);
  box(2.2, 0.42, 0.85, sm, 0, 0.21, -0.25); // nệm ngồi
  box(2.2, 0.75, 0.25, sm, 0, 0.62, -0.6); // lưng tựa
  for (const s of [-1, 1]) box(0.25, 0.62, 0.85, sm, s * 1.1, 0.31, -0.25); // tay vịn

  const p = buildPerson(LOOK);
  const parts = p.userData.parts;
  // ngồi dạng chân trên sofa, ngả lưng, tay phải cầm điện thoại
  p.position.set(0.05, -0.43, -0.2);
  p.rotation.y = 0.18;
  parts.body.rotation.x = -0.12;
  for (const [leg, knee, s] of [[parts.legL, parts.kneeL, -1], [parts.legR, parts.kneeR, 1]]) {
    leg.rotation.x = -1.45; leg.rotation.z = s * 0.32;
    knee.rotation.x = 1.25;
  }
  parts.armL.rotation.set(-0.5, 0, -0.55); parts.elbowL.rotation.x = -1.25; // tay giơ điện thoại
  parts.armR.rotation.set(0.15, 0, 0.35); parts.elbowR.rotation.x = -0.2; // tay chống sofa
  const phone = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.012), new THREE.MeshStandardMaterial({ color: 0x5fb6f0, roughness: 0.3, flatShading: true }));
  phone.position.set(0, -0.27, 0.05); phone.rotation.x = 0.6;
  parts.elbowL.add(phone);

  if (tex) {
    const m = faceMask();
    m.position.set(0, 1.595, 0.005); // đúng chỗ cái đầu trong person.js (HEAD_Y − 0,005)
    parts.body.add(m);
  }
  scene.add(p);
  return { scene, person: p };
}

// ---------- đỉnh hình rung kiểu PS1 (làm tròn vị trí trên màn hình theo lưới thô) + vải bẩn cho người ----------
// Vật liệu người (PERSON_MAT) dùng chung cả 3 khung → bật / tắt bằng giá trị đặt trước mỗi lần vẽ
const SNAP = { value: new THREE.Vector2(0, 0) };
const DETAIL = { value: 0 }, DETAIL_MAP = { value: clothTex() };
const patched = new WeakSet();
function patchSnap(scene) {
  scene.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      if (patched.has(m)) continue;
      patched.add(m);
      const cloth = m === PERSON_MAT;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uSnap = SNAP;
        sh.vertexShader = 'uniform vec2 uSnap;\nvarying vec3 vObjPos; varying vec3 vObjN;\n' + sh.vertexShader
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vObjPos = position; vObjN = normal;')
          .replace('#include <project_vertex>', `#include <project_vertex>
          if (uSnap.x > 0.0) { vec4 q = gl_Position; q.xy = floor(q.xy / q.w * uSnap + 0.5) / uSnap * q.w; gl_Position = q; }`);
        if (!cloth) return;
        // texture vải chiếu 3 phía theo hình khối (người không có toạ độ texture riêng)
        sh.uniforms.uDetail = DETAIL; sh.uniforms.uDetailMap = DETAIL_MAP;
        sh.fragmentShader = 'uniform float uDetail; uniform sampler2D uDetailMap;\nvarying vec3 vObjPos; varying vec3 vObjN;\n' + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
          if (uDetail > 0.0) {
            vec3 bw = abs(vObjN) + 0.001; bw /= (bw.x + bw.y + bw.z);
            vec3 P = vObjPos * 5.0;
            float d = texture2D(uDetailMap, P.yz).r * bw.x + texture2D(uDetailMap, P.xz).r * bw.y + texture2D(uDetailMap, P.xy).r * bw.z;
            diffuseColor.rgb *= mix(1.0, d * 1.18, uDetail);
          }`);
      };
      m.customProgramCacheKey = () => (cloth ? 'snap-cloth' : 'snap');
      m.needsUpdate = true;
    }
  });
}

// ---------- lớp lọc PS1: ít màu (5 bit / kênh, như máy PS1) + chấm nhiễu Bayer 4×4 ----------
const post = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tex; varying vec2 vUv;
    float bayer(vec2 p){ int x = int(mod(p.x,4.0)), y = int(mod(p.y,4.0));
      int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return float(m[y*4+x]) / 16.0; }
    void main(){
      vec3 c = texture2D(tex, vUv).rgb;
      c = pow(max(c, 0.0), vec3(1.0/2.2)); // tuyến tính → sRGB
      c += (bayer(gl_FragCoord.xy) - 0.5) / 31.0;
      c = floor(c * 31.0 + 0.5) / 31.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
const postScene = new THREE.Scene(); postScene.add(quad);
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ---------- 3 khung ----------
const views = [0, 1, 2].map((variant) => {
  const canvas = document.getElementById(`c${variant}`);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: variant === 0 });
  const { scene, person } = makeScene(variant);
  patchSnap(scene);
  const cam = new THREE.PerspectiveCamera(36, 300 / 420, 0.05, 30);
  return { variant, canvas, renderer, scene, person, cam, rt: null };
});

function resize() {
  const H = +document.getElementById('res').value, W = Math.round((H * 300) / 420);
  for (const v of views) {
    if (v.variant === 0) { v.renderer.setPixelRatio(Math.min(2, devicePixelRatio)); v.renderer.setSize(300, 420, false); continue; }
    v.renderer.setPixelRatio(1);
    v.renderer.setSize(W, H, false); // canvas nhỏ, CSS phóng to giữ ô pixel
    v.rt?.dispose();
    v.rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    v.size = [W, H];
  }
}
document.getElementById('res').onchange = resize;
resize();

let t = 0, last = performance.now();
function frame(now) {
  if (document.getElementById('spin').checked) t += (now - last) / 1000;
  last = now;
  const a = Math.sin(t * 0.4) * 0.35; // máy quay đong đưa trái phải (thấy hình rung)
  for (const v of views) {
    const close = document.getElementById('shot').value === 'close'; // cận (như ảnh mẫu) / toàn thân
    const R = close ? 1.4 : 2.4;
    v.cam.position.set(Math.sin(a) * R, close ? 1.05 : 0.95, -0.2 + Math.cos(a) * R);
    v.cam.lookAt(0.02, close ? 0.9 : 0.72, -0.25);
    if (v.variant === 0) { SNAP.value.set(0, 0); DETAIL.value = 0; v.renderer.render(v.scene, v.cam); continue; }
    SNAP.value.set(v.size[0] * 0.25, v.size[1] * 0.25); // lưới thô = 2 điểm ảnh
    DETAIL.value = v.variant === 2 ? 1 : 0;
    v.renderer.setRenderTarget(v.rt);
    v.renderer.render(v.scene, v.cam);
    v.renderer.setRenderTarget(null);
    post.uniforms.tex.value = v.rt.texture;
    v.renderer.render(postScene, postCam);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.views = views; // soi bằng tay khi cần
