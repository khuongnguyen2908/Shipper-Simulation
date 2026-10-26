// PHÁC HỌA PS1 — phần dùng chung cho trang 3 nhân vật (nhan-vat.html): mặt anime vẽ pixel theo kiểu từng người,
// miếng mặt áp lên đầu game, vải bẩn cho quần áo, đỉnh hình rung, lớp lọc ít màu + chấm nhiễu.
import * as THREE from 'three';
import { PERSON_MAT } from '../../src/world/person.js';
import { makePerson } from '../../src/world/models.js';

export const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export const canvasTex = (w, h, draw, pixel = true) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  return t;
};
export function grime(ctx, w, h, seed, k = 0.12) {
  const r = rng(seed);
  for (let i = 0; i < w * h * 0.6; i++) {
    const v = r() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${r() * k})`;
    ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1);
  }
  for (let i = 0; i < 6; i++) {
    const x = r() * w, y = r() * h, rad = 4 + r() * w * 0.2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(70,40,10,0.18)'); g.addColorStop(1, 'rgba(70,40,10,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
}

// ---------- MẶT ANIME PIXEL 64×64 (phủ trước mặt: x ∈ [−0,1; 0,1] m, y ∈ [−0,11; 0,09] m quanh tâm đầu) ----------
// f: { skin, eye: { rx, ry, lid (số hàng mí che), tilt (đuôi mắt xếch lên), iris: [4 màu trên → dưới], lash (độ dày), flick, lower },
//      brow: { color, w (độ dày), y, tilt (+ = đầu mày trong cụp xuống / ngầu) }, mouth: 'open' | 'smile' | 'flat' | 'grin' | 'smirk',
//      blush: 0 | 1 | 2 (2 = có gạch chéo), sweat, noseLine (sống mũi), old (nếp nhăn), stubble (râu lún phún), scar (sẹo má),
//      scowl (nếp chau giữa 2 mày), bags (quầng dưới mắt), cheekLines (rãnh má); eye.irisK: cỡ tròng (nhỏ = dữ), eye.glint 0 = mắt không đốm sáng }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shadeHex = (h, k) => '#' + hex(h).map((v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join('');
export function pixelFace(f) {
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
  const skin = f.skin, shade = shadeHex(skin, 0.9), dark = shadeHex(skin, 0.78);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(x, y, skin);
  for (let y = 50; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) % 2 === 0 || y > 55) set(x, y, shade); // bóng dưới cằm
  const E = f.eye, cy = 27;
  const eye = (cx, s) => {
    // s = −1 mắt bên trái hình, +1 bên phải; đuôi mắt (phía ngoài) ở phía s
    const yOff = (x) => -E.tilt * ((x - cx) * s) / E.rx; // xếch: đuôi mắt cao hơn đầu mắt
    const inS = (x, y) => ((x + 0.5 - cx) / E.rx) ** 2 + ((y + 0.5 - cy - 1 - yOff(x)) / E.ry) ** 2 <= 1;
    for (let y = cy - 10; y <= cy + 10; y++) for (let x = cx - E.rx - 1; x <= cx + E.rx + 1; x++) if (inS(x, y)) set(x, y, '#f6f1ea');
    const ic = E.iris;
    const ik = E.irisK ?? 0.62; // cỡ tròng so với mắt: nhỏ = mắt "dữ", lộ nhiều lòng trắng
    ell(cx - s * 0.5, cy + 1.4, E.rx * ik, E.ry * (ik < 0.5 ? 0.9 : 1.05), (x, y) => (y < cy - 1 ? ic[0] : y < cy + 2 ? ic[1] : y < cy + 4 ? ic[2] : ic[3]), inS);
    ell(cx - s * 0.5, cy + 1.1, Math.max(ik < 0.5 ? 0.9 : 1.2, E.rx * ik * 0.35), Math.max(1.2, E.ry * 0.45), '#0b0910', inS); // con ngươi
    // mí trên che lid hàng trên cùng của tròng trắng
    const top = (x) => cy + 1 - E.ry + yOff(x);
    for (let x = cx - E.rx - 1; x <= cx + E.rx + 1; x++) for (let y = Math.floor(top(x)) - 3; y < top(x) + E.lid; y++) if (inS(x, y) || y < top(x)) set(x, y, skin);
    // đốm sáng
    if (E.glint >= 2) { set(cx - s * 0.5 + 2 * s * -1, cy, '#ffffff'); set(cx - s * 0.5 + 1 * s * -1, cy, '#ffffff'); set(cx - s * 0.5 + 2 * s * -1, cy + 1, '#ffffff'); set(cx - s * 0.5 + 2 * s, cy + 4, '#ffffff'); }
    else if (E.glint === 1) set(cx - s * 0.5 - s, cy + 0.5, '#ffffff');
    // viền mi trên (dày E.lash), theo đường mí
    for (let x = cx - E.rx; x <= cx + E.rx; x++) {
      const y = Math.round(top(x) + E.lid) - 1;
      for (let k = 0; k < E.lash; k++) if (Math.abs(x - cx) < E.rx - k * 0.5) set(x, y - k, '#17100f');
    }
    if (E.flick) { const ox = cx + s * E.rx, oy = Math.round(top(ox) + E.lid) - 1; set(ox, oy - 1, '#17100f'); set(ox + s, oy - 2, '#17100f'); set(ox + s, oy - 1, '#17100f'); }
    if (f.bags) { const yb = cy + 2 + E.ry + yOff(cx); line(cx - E.rx * 0.7, yb, cx + E.rx * 0.6, yb + 0.5, shadeHex(skin, 0.7)); line(cx - E.rx * 0.3, yb + 1, cx + E.rx * 0.4, yb + 1.5, shadeHex(skin, 0.82)); }
    if (E.lower) line(cx - E.rx * 0.55, cy + 1 + E.ry + yOff(cx) + 0.5, cx + E.rx * 0.55, cy + 1 + E.ry + yOff(cx) + 0.5, shadeHex(skin, 0.62));
    // lông mày: đầu mày (phía trong) thấp hơn đuôi khi tilt > 0
    const B = f.brow, by = B.y;
    for (let k = 0; k < B.w; k++) line(cx - s * 2, by + B.tilt + k, cx + s * (E.rx + 1), by - B.tilt * 0.3 + k, B.color);
  };
  eye(19, -1); eye(45, 1);
  // mũi
  if (f.noseLine) { line(33, 31, 33, 39, shade); set(33, 40, dark); set(31, 41, dark); set(34, 41, dark); }
  else { set(32, 40, dark); set(32, 41, dark); }
  // má hồng
  if (f.blush) for (const cx of [14, 50]) {
    ell(cx, 38, 5, 2, f.blush === 2 ? '#f28f8a' : '#f2a49a');
    if (f.blush === 2) for (const dx of [-3, 0, 3]) { set(cx + dx - 1, 39, '#d0504f'); set(cx + dx, 38, '#d0504f'); set(cx + dx + 1, 37, '#d0504f'); }
  }
  // miệng
  const lip = '#8a3a36';
  if (f.mouth === 'open') { ell(32, 48, 3.2, 2.6, '#6e1a22'); ell(32, 49.4, 2, 1.1, '#e07a84'); }
  else if (f.mouth === 'grin') { ell(32, 48, 4.2, 2.4, '#6e1a22', (x, y) => y >= 47); for (let x = 29; x <= 35; x++) set(x, 47, '#fbf7f2'); set(27, 47, lip); set(37, 47, lip); }
  else if (f.mouth === 'smile') { line(30, 48, 34, 48, lip); set(35, 47, lip); } // hơi cười (1 khóe nhếch nhẹ)
  else if (f.mouth === 'flat') { line(30, 48, 34, 48, lip); set(31, 50, shade); set(33, 50, shade); } // miệng thẳng + bóng môi dưới
  else if (f.mouth === 'frown') { line(30, 48, 34, 48, lip); set(29, 49, lip); set(35, 49, lip); } // khóe miệng trễ xuống (cau có)
  else if (f.mouth === 'smirk') { line(29, 49, 34, 49, lip); set(35, 48, lip); set(36, 47, lip); set(30, 50, shade); set(33, 50, shade); }
  // nếp nhăn tuổi già: chân chim đuôi mắt, rãnh mũi – miệng, 2 vạch trán
  if (f.scowl) { const w = shadeHex(skin, 0.66); line(30, f.brow.y + 1, 30, f.brow.y + 4, w); line(34, f.brow.y + 1, 34, f.brow.y + 4, w); }
  if (f.cheekLines) { const w = shadeHex(skin, 0.74); for (const s of [-1, 1]) line(32 + s * 9, 38, 32 + s * 11, 46, w); }
  if (f.old) {
    const w = shadeHex(skin, 0.74);
    for (const s of [-1, 1]) {
      const ox = 32 + s * 13 + s * (E.rx + 1);
      set(ox, 26, w); set(ox + s, 25, w); set(ox, 29, w); set(ox + s, 30, w);
      line(32 + s * 5, 42, 32 + s * 7, 47, w);
    }
    line(25, 12, 39, 12, w); line(27, 14, 37, 14, w);
  }
  // râu lún phún quanh cằm (chừa môi)
  if (f.stubble) for (let y = 44; y < 58; y++) for (let x = 20; x < 45; x++) if ((x * 7 + y * 13) % 7 === 0 && !(y > 46 && y < 51 && x > 27 && x < 37)) set(x, y, shadeHex(skin, 0.68));
  // sẹo chéo trên má phải
  if (f.scar) { line(47, 32, 53, 41, shadeHex(skin, 0.62)); line(48, 32, 54, 41, '#d39a86'); for (const k of [34, 37, 40]) set(48 + (k - 32) * 0.66, k, shadeHex(skin, 0.55)); }
  if (f.sweat) {
    ell(56, 23, 2.2, 3, '#8fd3f5'); set(56, 19, '#8fd3f5'); set(56, 18, '#3a8fc6');
    for (const [x, y] of [[54, 21], [54, 22], [54, 23], [54, 24], [55, 25], [56, 26], [57, 25], [58, 24], [58, 23], [58, 22], [57, 20], [55, 20]]) set(x, y, '#3a8fc6');
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
// Miếng mặt: chép đúng nửa trước cái đầu của game (person.js headGeo), phóng 2–3 % nằm ngoài da — gắn vào parts.body ở (0; 1,595; 0,005)
// bend: lưng còng của người già (models.js AGE_BEND) — đầu bị uốn ra trước bao nhiêu thì miếng mặt dời theo y hệt (person.js bendZ)
export function faceMask(female, tex, bend = 0) {
  const R = 0.115, g = new THREE.SphereGeometry(R, 6, 10, 0, Math.PI), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = y / R;
    x *= female ? 0.8 : 0.84; y *= 1.13;
    if (ny < 0) { x *= 1 + ny * 0.36; if (z > 0) z *= 1 + ny * 0.1; }
    if (ny > -0.2 && ny < 0.25 && z > 0) x *= 1.03;
    if (z > 0 && Math.abs(x) < 0.07) { if (ny > 0.22 && ny < 0.42) z *= 1.05; else if (ny > -0.02 && ny <= 0.22) z *= 0.975; }
    p.setXYZ(i, x * 1.02, y * 1.02, z * 1.03 + bend * Math.max(0, 1.595 + y * 1.02 - 1.1) ** 2);
    uv.setXY(i, 0.5 + x / 0.2, 0.5 + (y + 0.01) / 0.2);
  }
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, flatShading: true, roughness: 0.78, metalness: 0.02 }));
  m.position.set(0, 1.595, 0.005);
  return m;
}
// vải bẩn
export const clothTex = () => {
  const t = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#d4d4d4'; c.fillRect(0, 0, w, h);
    const r = rng(19);
    for (let i = 0; i < 900; i++) { const v = 170 + Math.floor(r() * 85); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1); }
    for (let i = 0; i < 7; i++) {
      const x = r() * w, y = r() * h, rad = 5 + r() * 12;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(60,50,40,0.45)'); g.addColorStop(1, 'rgba(60,50,40,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    c.strokeStyle = 'rgba(70,60,50,0.55)'; c.lineWidth = 1;
    for (let i = 0; i < 9; i++) { const x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 18, y + 6 + r() * 10); c.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

// ---------- đỉnh hình rung + vải bẩn (vật liệu người dùng chung → bật / tắt bằng giá trị đặt trước mỗi lần vẽ) ----------
export const SNAP = { value: new THREE.Vector2(0, 0) };
export const DETAIL = { value: 0 };
const DETAIL_MAP = { value: null };
const patched = new WeakSet();
export function patchPS1(scene) {
  DETAIL_MAP.value ||= clothTex();
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

// ---------- lớp lọc: 5 bit / kênh + chấm nhiễu Bayer 4×4 ----------
const post = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tex; varying vec2 vUv;
    float bayer(vec2 p){ int x = int(mod(p.x,4.0)), y = int(mod(p.y,4.0));
      int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return float(m[y*4+x]) / 16.0; }
    void main(){
      vec3 c = texture2D(tex, vUv).rgb;
      c = pow(max(c, 0.0), vec3(1.0/2.2));
      c += (bayer(gl_FragCoord.xy) - 0.5) / 31.0;
      c = floor(c * 31.0 + 0.5) / 31.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
// Vẽ 1 khung kiểu PS1: vào ảnh nhỏ W×H → lớp lọc → canvas (CSS phóng to giữ ô pixel)
export function renderPS1(renderer, rt, scene, cam, W, H) {
  SNAP.value.set(W * 0.25, H * 0.25);
  DETAIL.value = 1;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  post.uniforms.tex.value = rt.texture;
  renderer.render(postScene, postCam);
}

// ---------- KHUNG XEM: mỗi nhân vật 1 khung (đứng trước tường gạch bẩn), điều khiển chung ở thanh trên (spin · shot · res · raw) ----------
// chars: [{ name, note, look (tham số makePerson), female, turn, face (pixelFace) }] · wrap: chỗ đặt các khung
const hexOf = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
export const skinHex = (look) => hexOf(look.skin ?? 0xf1c27d);
const wallTex = () => {
  const t = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#9a8f80'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { c.fillStyle = '#857a6c'; c.fillRect(0, y, w, 1); }
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 0 : 16; x < w; x += 32) { c.fillStyle = '#857a6c'; c.fillRect(x, y, 1, 16); }
    grime(c, w, h, 23, 0.18);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 3);
  return t;
};
const floorTex = () => {
  const t = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#6d6a66'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 16) { c.fillStyle = '#5a5753'; c.fillRect(i, 0, 1, h); c.fillRect(0, i, w, 1); }
    grime(c, w, h, 29, 0.2);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  return t;
};
function makeScene(ch) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c1e24);
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x4a4038, 1.5));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.3);
  sun.position.set(-2, 3, 3);
  scene.add(sun);
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); scene.add(b); };
  box(8, 4, 0.1, new THREE.MeshStandardMaterial({ map: wallTex(), roughness: 0.95 }), 0, 2, -1.2);
  box(8, 0.1, 6, new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.95 }), 0, -0.05, 1);
  const p = makePerson(ch.look);
  p.rotation.y = ch.turn || 0;
  p.userData.parts.body.add(faceMask(ch.female, pixelFace(ch.face), { old: 0.3, elder: 0.55 }[ch.look.age] || 0));
  scene.add(p);
  patchPS1(scene);
  return { scene, person: p };
}
// khung máy: cận mặt / nửa người / toàn thân — [khoảng cách, cao máy, nhìn vào độ cao]
const SHOTS = { face: [0.78, 1.6, 1.58], close: [1.55, 1.48, 1.36], full: [3.3, 1.1, 0.88] };
export function gallery(chars, wrap) {
  const $ = (id) => document.getElementById(id);
  const views = chars.map((ch) => {
    const canvas = document.createElement('canvas');
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.innerHTML = `${ch.name}<small>${ch.note || ''}</small>`;
    fig.append(canvas, cap);
    wrap.append(fig);
    const renderer = new THREE.WebGLRenderer({ canvas });
    const { scene, person } = makeScene(ch);
    // cao thấp khác nhau (vóc to / tuổi già): máy quay theo độ cao đầu thật
    person.updateWorldMatrix(true, true);
    const head = new THREE.Vector3();
    person.userData.parts.body.children.at(-1).getWorldPosition(head); // miếng mặt = tâm đầu thật (người già cúi đầu ra trước)
    return { head, canvas, renderer, scene, person, cam: new THREE.PerspectiveCamera(34, 300 / 420, 0.05, 40), rt: null, size: [0, 0] };
  });
  const resize = () => {
    const raw = $('raw').checked;
    const H = +$('res').value, W = Math.round((H * 300) / 420);
    for (const v of views) {
      if (raw) { v.renderer.setPixelRatio(Math.min(2, devicePixelRatio)); v.renderer.setSize(300, 420, false); continue; }
      v.renderer.setPixelRatio(1);
      v.renderer.setSize(W, H, false);
      v.rt?.dispose();
      v.rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      v.size = [W, H];
    }
  };
  for (const id of ['res', 'raw']) $(id).onchange = resize;
  resize();
  let t = 0, last = performance.now();
  const frame = (now) => {
    if ($('spin').checked) t += (now - last) / 1000;
    last = now;
    const [R, y, look] = SHOTS[$('shot').value];
    const a = Math.sin(t * 0.4) * 0.4, raw = $('raw').checked;
    for (const v of views) {
      const k = v.person.scale.y;
      if ($('shot').value === 'face') { // cận mặt: nhắm đúng vào đầu
        const h = v.head;
        v.cam.position.set(h.x + Math.sin(a) * R, h.y + 0.02, h.z + Math.cos(a) * R);
        v.cam.lookAt(h.x, h.y, h.z);
      } else {
        v.cam.position.set(Math.sin(a) * R * Math.max(1, k * 0.95), y * k, Math.cos(a) * R * Math.max(1, k * 0.95));
        v.cam.lookAt(0, look * k, 0);
      }
      if (raw) { SNAP.value.set(0, 0); DETAIL.value = 0; v.renderer.render(v.scene, v.cam); continue; }
      renderPS1(v.renderer, v.rt, v.scene, v.cam, v.size[0], v.size[1]);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.views = views;
  return views;
}
