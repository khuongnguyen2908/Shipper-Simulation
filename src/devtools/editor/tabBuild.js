// Thẻ 🏗️ XÂY DỰNG: bản đồ 3D (đúng hình trong game) để xếp địa điểm lên bản đồ.
//  - Danh sách bên trái: mọi địa điểm đã tạo ở thẻ 🏪 Địa điểm ("Chưa đặt" nằm chờ ở trên).
//  - Kéo một dòng thả vào lô trên bản đồ · kéo nhà đang đứng sang lô khác · R xoay mặt tiền · Delete cất vào danh sách.
//  - Bấm vào khối (chỗ không có địa điểm) để đổi kiểu hẻm.
//  - Camera: kéo chuột trái để dời, giữ chuột phải để xoay, lăn chuột để phóng to / thu nhỏ.
// Bộ vẽ WebGL tạo 1 lần, dùng lại khi chuyển thẻ (giống khung xem trước nhà). Chỉ vẽ lại khi có thay đổi.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildCity } from '../../world/city.js';
import { buildLayout, CITY, LOT_SIZES, lotParts, lotSize, lotFaces, lotInfo, blockPlan, blockBounds } from '../../sim/cityLayout.js';
import { blockUnder, dropTarget, lotProblem } from './buildRules.js';
import { ALLEY_TEMPLATES } from '../../sim/blockPlan.js';
import { isPlaced } from '../../data/places.js';
import { PROTECTED } from '../../data/validate.js';
import { LOOKS, lookOf, looksFor } from '../../data/looks.js';
import { el, button, selectInput, checkInput } from './ui.js';

const ICON = { home: '🏠', restaurant: '🍴', gas: '⛽', shop: '🎒', garage: '🔧', cafe: '☕', taphoa: '🛒', gate: '🟩', apartment: '🏢', market: '🧺', service: '⭐', scenery: '🌳' };
const DIR = { N: 'Bắc', S: 'Nam', E: 'Đông', W: 'Tây' };
const SIZE_LABEL = { one: '1 lô', two: '2 lô ngang', vtwo: '2 lô dọc', row: 'Cả dãy (3 lô ngang)', col: 'Cả cột (3 lô dọc)', block: 'Cả khối (9 ô)' };
const sizesFor = (kind) => Object.entries(SIZE_LABEL).filter(([k]) => k !== 'block' || kind === 'scenery'); // cả khối: chỉ cảnh quan

// Kích thước của địa điểm vừa cất vào danh sách (để kéo ra lại vẫn đúng cỡ cũ)
const stashSize = new Map();

// ---------- bộ vẽ dùng chung ----------
let R = null; // { renderer, scene, camera, controls, city, ghost, mark, sig, dirty, labels }

function setup() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc7e6);
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x55624a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(120, 220, 80);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.screenSpacePanning = false; // kéo = trượt trên mặt đất
  controls.maxPolarAngle = 1.35; // không chui xuống dưới đất
  controls.minDistance = 12;
  controls.maxDistance = 700;
  controls.addEventListener('change', () => (R.dirty = true));
  // khung ma: chỗ sắp thả (xanh = được, đỏ = không)
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.35, depthWrite: false }));
  ghost.visible = false;
  scene.add(ghost);
  // khung đang chọn (viền vàng)
  const mark = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd400 }));
  mark.visible = false;
  scene.add(mark);
  R = { renderer, scene, camera, controls, city: null, ghost, mark, sig: '', dirty: true };
  if (import.meta.env?.DEV) window.__buildView = R; // gỡ lỗi / thử trong trình duyệt (chỉ khi npm run dev)
  topView(false);
  loop();
}

function loop() {
  requestAnimationFrame(loop);
  const c = R.renderer.domElement;
  if (!c.isConnected || !R.dirty) return;
  R.dirty = false;
  R.renderer.render(R.scene, R.camera);
  R.labels?.();
}

// Nhìn từ trên xuống (gần như thẳng đứng) hoặc nhìn chéo
function topView(tilt = true) {
  const d = CITY.N * CITY.PITCH * 1.05;
  R.controls.target.set(0, 0, 0);
  R.camera.position.set(0, d, tilt ? d * 0.75 : 1);
  R.controls.update();
  R.dirty = true;
}

// Dựng lại thành phố từ dữ liệu đang sửa (chưa cần lưu)
function rebuild(data) {
  const sig = JSON.stringify([data.places.places, data.places.alley, data.map, Object.keys(data.items)]);
  if (sig === R.sig && R.city) return;
  R.sig = sig;
  if (R.city) {
    R.scene.remove(R.city);
    R.city.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) {
        for (const k of ['map', 'emissiveMap', 'alphaMap']) m[k]?.dispose();
        m.dispose();
      }
    });
  }
  const group = new THREE.Group();
  const lay = buildLayout(data.places.places, data.map);
  buildCity(group, lay, [], 7, { map: data.map, alley: data.places.alley, items: data.items });
  group.updateMatrixWorld(true); // để bấm chọn nhà được ngay cả trước khung hình đầu tiên
  R.city = group;
  R.layout = lay;
  R.scene.add(group);
  R.dirty = true;
}

// ---------- thẻ ----------
export function render(root, ctx) {
  if (!R) setup();
  const data = ctx.data;
  const pd = data.places;
  const places = pd.places;
  const sel = ctx.sel.build;
  const changedP = () => ctx.changed('places');

  // ---- cột trái: danh sách địa điểm ----
  const side = el('aside', { class: 'ed-side build-side' });
  const search = el('input', { type: 'search', class: 'side-search', placeholder: '🔎 Tìm địa điểm…', value: sel.search || '' });
  const listBox = el('div', { class: 'side-list' });
  search.addEventListener('input', () => { sel.search = search.value; drawList(); });
  const drawList = () => {
    listBox.innerHTML = '';
    const q = (sel.search || '').trim().toLowerCase();
    const match = (p) => !q || `${p.name} ${p.short || ''} ${p.id}`.toLowerCase().includes(q);
    const waiting = places.filter((p) => !isPlaced(p) && match(p));
    const onMap = places.filter((p) => isPlaced(p) && match(p));
    const row = (p) => {
      const r = el('div', { class: `side-row build-row${p.id === sel.id ? ' on' : ''}${isPlaced(p) ? '' : ' waiting'}`, title: 'Kéo thả vào bản đồ · bấm để chọn' },
        el('span', { class: 'drag-h' }, '⠿'),
        el('span', { class: 'sr-icon' }, p.icon || ICON[p.kind] || '•'),
        el('span', { class: 'sr-main' }, el('b', {}, p.name), el('small', {}, isPlaced(p) ? `khối ${p.block.join(',')} · lô ${p.lot}` : 'chưa đặt — kéo vào bản đồ')));
      r.addEventListener('pointerdown', (e) => startDragFromList(e, p));
      return r;
    };
    listBox.append(...[
      el('div', { class: 'build-sec' }, `📦 Chưa đặt (${places.filter((p) => !isPlaced(p)).length})`),
      waiting.length ? waiting.map(row) : el('small', { class: 'muted build-empty' }, 'Không có. Tạo địa điểm mới ở thẻ 🏪 Địa điểm → nó nằm chờ ở đây.'),
      el('div', { class: 'build-sec' }, `📍 Trên bản đồ (${places.filter(isPlaced).length})`),
      onMap.map(row),
    ].flat()); // append không tự trải mảng
  };
  side.append(el('div', { class: 'side-head' }, el('b', {}, 'Địa điểm'), button('🏪 Tạo mới', () => ctx.select('places', {}), 'small')), search, listBox);
  ctx.refreshSide = () => { drawList(); drawPanel(); };

  // ---- khung 3D ----
  const body = el('section', { class: 'ed-body build-body' });
  const view = el('div', { class: 'build-view' });
  const labels = el('div', { class: 'build-labels' });
  const panel = el('div', { class: 'build-panel' });
  const chip = el('div', { class: 'build-chip' });
  const tip = el('div', { class: 'build-tip' }, 'Kéo địa điểm từ danh sách thả vào lô · Kéo nhà sang lô khác · R xoay mặt tiền · Delete cất vào danh sách · Chuột trái kéo = dời bản đồ · Chuột phải = xoay · Lăn = phóng to');
  view.append(R.renderer.domElement, labels, panel, tip);
  body.append(
    el('div', { class: 'build-tools' },
      el('b', {}, '🏗️ Xây dựng'),
      button('⬇️ Nhìn từ trên', () => topView(false), 'small'),
      button('↘️ Nhìn chéo', () => topView(true), 'small'),
      checkInput(sel.labels !== false, (v) => { sel.labels = v; R.dirty = true; }, '🏷️ Tên địa điểm')),
    view,
  );
  root.append(el('div', { class: 'ed-split' }, side, body));
  R.chip?.remove();
  R.chip = chip;
  document.body.append(chip);

  rebuild(data);
  drawList();
  // cỡ khung vẽ theo chỗ trống
  const fit = () => {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    R.renderer.setSize(w, h);
    R.camera.aspect = w / h;
    R.camera.updateProjectionMatrix();
    R.dirty = true;
  };
  R.resize?.disconnect();
  R.resize = new ResizeObserver(fit);
  R.resize.observe(view);
  fit();

  // ---- tên địa điểm nổi trên nhà ----
  const v3 = new THREE.Vector3();
  R.labels = () => {
    labels.innerHTML = '';
    if (sel.labels === false || !R.layout) return;
    const w = view.clientWidth, h = view.clientHeight;
    for (const p of R.layout.places) {
      v3.set((p.x0 + p.x1) / 2, 9, (p.z0 + p.z1) / 2).project(R.camera);
      if (v3.z > 1 || Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05) continue;
      labels.append(el('span', { class: `build-label${p.id === sel.id ? ' on' : ''}`, style: `left:${((v3.x + 1) / 2) * w}px;top:${((1 - v3.y) / 2) * h}px` }, p.short || p.name));
    }
  };

  // ---- chọn ----
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const aim = (e) => {
    const r = R.renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    R.camera.updateMatrixWorld(); // camera có thể vừa dời mà chưa kịp vẽ khung mới
    ray.setFromCamera(ndc, R.camera);
  };
  const groundAt = (e) => { aim(e); return ray.ray.intersectPlane(ground, new THREE.Vector3()); };
  const placeAt = (e) => {
    aim(e);
    for (const h of ray.intersectObject(R.city, true)) {
      for (let o = h.object; o && o !== R.city; o = o.parent) if (o.userData.placeId) return places.find((p) => p.id === o.userData.placeId) || null;
    }
    return null;
  };
  const select = (id) => {
    sel.id = id;
    drawList();
    drawPanel();
    R.dirty = true;
  };

  // camera trượt tới địa điểm (giữ góc nhìn đang có)
  function focusOn(p) {
    const r = lotInfo(p.block[0], p.block[1], p.lot, p.face, data.map);
    const to = new THREE.Vector3((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2);
    const off = R.camera.position.clone().sub(R.controls.target);
    if (off.length() > 160) off.setLength(160); // đang ở xa → lại gần
    R.controls.target.copy(to);
    R.camera.position.copy(to).add(off);
    R.controls.update();
    drawMark();
  }

  // khung vàng quanh lô / khối đang chọn
  function drawMark() {
    const p = places.find((x) => x.id === sel.id);
    let r = null, hgt = 14;
    if (p && isPlaced(p)) r = lotInfo(p.block[0], p.block[1], p.lot, p.face, data.map);
    else if (/^b:\d+,\d+$/.test(sel.id || '')) { const [bx, bz] = sel.id.slice(2).split(',').map(Number); r = blockBounds(bx, bz); hgt = 1; }
    R.mark.visible = !!r;
    if (r) {
      R.mark.scale.set(r.x1 - r.x0 + 0.4, hgt, r.z1 - r.z0 + 0.4);
      R.mark.position.set((r.x0 + r.x1) / 2, hgt / 2, (r.z0 + r.z1) / 2);
    }
    R.dirty = true;
  }

  // ---- kéo thả ----
  let drag = null; // { p, target }
  const showGhost = (t) => {
    R.ghost.visible = !!t;
    if (!t) return (R.dirty = true);
    const r = t.rect;
    R.ghost.scale.set(r.x1 - r.x0, 10, r.z1 - r.z0);
    R.ghost.position.set((r.x0 + r.x1) / 2, 5, (r.z0 + r.z1) / 2);
    R.ghost.material.color.set(t.ok ? 0x2ecc71 : 0xe74c3c);
    R.dirty = true;
  };
  const overCanvas = (e) => {
    const r = R.renderer.domElement.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  function dragMove(e) {
    if (!drag || !drag.started) return;
    chip.style.left = `${e.clientX + 14}px`;
    chip.style.top = `${e.clientY + 10}px`;
    drag.target = null;
    if (overCanvas(e)) {
      const g = groundAt(e);
      if (g) drag.target = dropTarget(data, drag.p, g.x, g.z, stashSize.get(drag.p.id));
    }
    showGhost(drag.target);
    chip.textContent = drag.target ? (drag.target.ok ? `${drag.p.name} → khối ${drag.target.bx},${drag.target.bz} lô ${drag.target.lot}` : `⛔ ${drag.target.why}`) : `${drag.p.icon || ICON[drag.p.kind] || ''} ${drag.p.name}`;
    chip.classList.toggle('bad', !!drag.target && !drag.target.ok);
  }
  function dragEnd() {
    removeEventListener('pointermove', dragMove);
    removeEventListener('pointerup', dragEnd);
    chip.classList.remove('on', 'bad');
    R.controls.enabled = true;
    const d = drag;
    drag = null;
    showGhost(null);
    if (!d || !d.started) return;
    const t = d.target;
    if (!t) { if (d.fromList && isPlaced(d.p)) focusOn(d.p); return; } // bấm dòng trong danh sách → bay tới nhà

    if (!t.ok) return ctx.notify(`⛔ ${t.why}`, 'warn', true);
    movePlace(d.p, t);
  }
  function beginDrag(p, e, fromList) {
    if (p.kind === 'gate') return ctx.notify('Nhà cổng xanh gắn với hẻm 42 — không dời được.', 'warn', true);
    drag = { p, target: null, started: fromList, fromList, x: e.clientX, y: e.clientY };
    R.controls.enabled = false;
    if (fromList) chip.classList.add('on');
    addEventListener('pointermove', dragMove);
    addEventListener('pointerup', dragEnd);
  }
  function startDragFromList(e, p) {
    if (e.button !== 0) return;
    e.preventDefault();
    select(p.id);
    beginDrag(p, e, true);
    dragMove(e);
  }
  // bấm trong khung 3D: trúng nhà → chọn (kéo đi thì dời); trúng khối trống → chọn khối; trúng đường → bỏ chọn
  view.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target !== R.renderer.domElement) return;
    const p = placeAt(e);
    const down = { x: e.clientX, y: e.clientY };
    if (p) {
      select(p.id);
      drawMark();
      beginDrag(p, e, false);
      const wake = (ev) => {
        if (!drag || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 6) return;
        drag.started = true;
        chip.classList.add('on');
        removeEventListener('pointermove', wake);
      };
      addEventListener('pointermove', wake);
      addEventListener('pointerup', () => removeEventListener('pointermove', wake), { once: true });
      return;
    }
    // không trúng nhà: để bản đồ tự dời; nếu thả ra gần chỗ bấm (= bấm) thì chọn khối / bỏ chọn
    const up = (ev) => {
      if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
      const g = groundAt(ev);
      const b = g && blockUnder(g.x, g.z);
      select(b ? `b:${b[0]},${b[1]}` : null);
      drawMark();
    };
    addEventListener('pointerup', up, { once: true });
  }, true);

  // ---- thao tác trên dữ liệu (mỗi thao tác = 1 bước hoàn tác) ----
  const commit = (fn, msg) => {
    ctx.historyBreak();
    fn();
    changedP();
    ctx.historyBreak();
    rebuild(data);
    drawList();
    drawPanel();
    drawMark();
    if (msg) ctx.notify(msg, 'ok', true);
  };
  function movePlace(p, t) {
    const was = isPlaced(p);
    commit(() => {
      p.block = [t.bx, t.bz];
      p.lot = t.lot;
      if (blockPlan(t.bx, t.bz, data.map) || (p.face && !lotFaces(t.lot).includes(p.face))) delete p.face;
    }, `${was ? '🚚 Đã dời' : '📍 Đã đặt'} "${p.name}" → khối ${t.bx},${t.bz} lô ${t.lot}.`);
    select(p.id);
  }
  function rotatePlace(p) {
    if (!p || !isPlaced(p)) return;
    if (blockPlan(p.block[0], p.block[1], data.map)) return ctx.notify('Nhà trong khối có hẻm có mặt tiền cố định theo nhà.', 'warn', true);
    const faces = lotFaces(p.lot);
    if (faces.length < 2) return ctx.notify(`Lô ${p.lot} chỉ chạm 1 con đường nên chỉ quay được ra hướng ${DIR[faces[0]]}. Lô góc, 2 lô, cả dãy, cả cột mới xoay được.`, 'warn', true);
    const cur = p.face || faces[0];
    const next = faces[(faces.indexOf(cur) + 1) % faces.length];
    commit(() => { if (next === faces[0]) delete p.face; else p.face = next; }, `🔄 "${p.name}" quay mặt tiền ra hướng ${DIR[next]}.`);
  }
  function stashPlace(p) {
    if (!p || !isPlaced(p)) return;
    if (PROTECTED.places.includes(p.id)) return ctx.notify(`"${p.name}" là địa điểm bắt buộc của game — phải luôn có trên bản đồ (dời sang lô khác thì được).`, 'warn', true);
    stashSize.set(p.id, lotSize(p.lot) || 'one');
    commit(() => { delete p.block; delete p.lot; delete p.face; }, `📦 Đã cất "${p.name}" vào danh sách (game chưa có địa điểm này tới khi đặt lại).`);
  }
  // Đổi kích thước: lấy lô cỡ mới có chứa ô của lô hiện tại và còn trống
  function resizePlace(p, size) {
    const mine = lotParts(p.lot);
    const [bx, bz] = p.block;
    const lot = LOT_SIZES[size].filter((l) => lotParts(l).some((c) => mine.includes(c))).find((l) => !lotProblem(data, p, bx, bz, l));
    if (!lot) { drawPanel(); return ctx.notify(`Không đủ chỗ trống quanh lô ${p.lot} cho cỡ "${SIZE_LABEL[size]}". Dời sang chỗ rộng hơn trước.`, 'warn', true); }
    commit(() => { p.lot = lot; if (p.face && !lotFaces(lot).includes(p.face)) delete p.face; }, `📐 "${p.name}" giờ là ${SIZE_LABEL[size]} (lô ${lot}).`);
  }
  function setBlock(key, patch) {
    const map = data.map;
    map.blocks = map.blocks || {};
    ctx.historyBreak();
    if (patch === null) delete map.blocks[key];
    else map.blocks[key] = { alley: 'I', rot: 0, walk: false, ...(map.blocks[key] || {}), ...patch };
    ctx.changed('map');
    ctx.historyBreak();
    rebuild(data);
    drawPanel();
    drawMark();
  }

  // ---- bảng thông tin nổi (mục đang chọn) ----
  function drawPanel() {
    panel.innerHTML = '';
    const p = places.find((x) => x.id === sel.id);
    if (p) {
      const placed = isPlaced(p);
      const plan = placed && blockPlan(p.block[0], p.block[1], data.map);
      const faces = placed && !plan ? lotFaces(p.lot) : [];
      const face = placed ? lotInfo(p.block[0], p.block[1], p.lot, p.face, data.map).face : null;
      panel.append(
        el('div', { class: 'bp-head' }, el('b', {}, `${p.icon || ICON[p.kind] || ''} ${p.name}`), button('✕', () => { select(null); drawMark(); }, 'small ghost')),
        el('small', { class: 'muted' }, placed ? `Khối ${p.block.join(',')} · lô ${p.lot} · mặt tiền ${DIR[face] || face}` : 'Chưa đặt — kéo từ danh sách thả vào bản đồ.'),
        placed ? el('div', { class: 'inline wrap' },
          button('🔄 Xoay (R)', () => rotatePlace(p), `small${faces.length > 1 ? '' : ' dim'}`),
          !PROTECTED.places.includes(p.id) ? button('📦 Cất vào danh sách (Delete)', () => stashPlace(p), 'small') : null) : null,
        placed && !plan && p.kind !== 'gate' ? el('label', { class: 'bp-row' }, 'Kích thước ', selectInput(lotSize(p.lot) || 'one', sizesFor(p.kind), (v) => resizePlace(p, v))) : null,
        el('label', { class: 'bp-row' }, p.kind === 'scenery' ? 'Kiểu ' : 'Kiểu nhà ', selectInput(p.look || '', [['', `Tự chọn (${LOOKS[lookOf(p)]?.label || '—'})`], ...looksFor(p.kind).map((k) => [k, LOOKS[k].label])], (v) => commit(() => { if (v) p.look = v; else delete p.look; }))),
        button('✏️ Sửa chi tiết ở thẻ Địa điểm', () => ctx.select('places', { id: p.id }), 'small'),
      );
      panel.hidden = false;
      return;
    }
    const m = /^b:(\d+),(\d+)$/.exec(sel.id || '');
    if (m) {
      const key = `${m[1]},${m[2]}`;
      const spec = data.map.blocks?.[key] || null;
      const here = places.filter((q) => isPlaced(q) && q.block.join(',') === key);
      const is42 = pd.alley.block.join(',') === key;
      panel.append(
        el('div', { class: 'bp-head' }, el('b', {}, `🧱 Khối ${key}`), button('✕', () => { select(null); drawMark(); }, 'small ghost')),
        el('small', { class: 'muted' }, here.length ? `Có: ${here.map((q) => q.short || q.name).join(', ')}` : 'Chưa có địa điểm nào.'),
        el('label', { class: 'bp-row' }, 'Kiểu hẻm ', selectInput(spec ? spec.alley : '', [['', 'Không hẻm (8 lô quanh mép)'], ...Object.entries(ALLEY_TEMPLATES).map(([k, t]) => [k, t.label])], (v) => {
          if (v && is42) { ctx.notify('Khối này có hẻm 42 (nhà cổng xanh) — phải để "Không hẻm".', 'warn', true); return drawPanel(); }
          if (v && here.length && !spec && !confirm(`Khối này có ${here.map((q) => q.name).join(', ')}. Đổi sang khối có hẻm thì các địa điểm này phải đặt lại vào nhà của hẻm (bộ kiểm tra sẽ báo). Tiếp tục?`)) return drawPanel();
          setBlock(key, v ? { alley: v } : null);
        })),
        spec ? el('div', { class: 'bp-row' }, 'Hướng hẻm ', [0, 1, 2, 3].map((r) => button(['↑', '→', '↓', '←'][r], () => setBlock(key, { rot: r }), (spec.rot || 0) === r ? 'small on' : 'small'))) : null,
        spec ? checkInput(!!spec.walk, (v) => setBlock(key, { walk: v }), '🚶 Hẻm đi bộ (xe máy không vào)') : null,
      );
      panel.hidden = false;
      return;
    }
    panel.hidden = true;
  }

  // ---- phím tắt (chỉ khi đang ở thẻ này, không gõ trong ô nhập) ----
  if (!R.keys) {
    R.keys = true;
    addEventListener('keydown', (e) => {
      if (!R.renderer.domElement.isConnected || e.target.closest?.('input, textarea, select') || e.ctrlKey || e.metaKey) return;
      R.onKey?.(e);
    });
  }
  R.onKey = (e) => {
    const p = places.find((x) => x.id === sel.id);
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotatePlace(p); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); stashPlace(p); }
    else if (e.key === 'Escape') { select(null); drawMark(); }
  };

  drawPanel();
  drawMark();
}

