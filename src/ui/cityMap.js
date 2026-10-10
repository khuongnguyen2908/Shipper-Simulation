// BẢN ĐỒ LỚN trong app Bản đồ của điện thoại: cả thành phố, hướng bắc lên trên.
// Kéo để dời · lăn chuột / ＋ － để phóng · ◎ về chỗ mình · lọc theo nhóm địa điểm.
// Thu nhỏ: điểm gần nhau gộp thành vòng có số · phóng gần: biểu tượng + tên (không chồng chữ).
// Chạm một địa điểm → thẻ thông tin + nút Chỉ đường (handlers.action('waypoint', { id })).
import { CITY, HALF, roadPos, blockBounds, segmentRect, roadGraph, joinList, joinGap, routeDist } from '../sim/cityLayout.js';
import { allSegments, tierOf, TIER_GEO } from '../sim/roads.js';
import { STREETS_X, STREETS_Z } from '../data/places.js';
import { lookOf } from '../data/looks.js';
import { isOpen, fmtHours } from '../sim/placeRules.js';
import { ICON, placeGroup } from './minimap.js';
import { fmtDist } from '../sim/nav.js';
import { fmt } from '../content/index.js';

const segOf = (id) => { const m = /^([xz])(\d+):(\d+)$/.exec(id); return { axis: m[1], line: +m[2], from: +m[3] }; };
// nhóm lọc: mã nhóm (minimap.placeGroup) → biểu tượng, màu, khóa chữ
export const FILTERS = [
  ['food', '🍜', '#f39c12', 'map.fFood'],
  ['fix', '🛠️', '#e74c3c', 'map.fFix'],
  ['shop', '🛍️', '#9b59b6', 'map.fShop'],
  ['svc', '🏛️', '#3498db', 'map.fSvc'],
  ['transit', '🚌', '#16a085', 'map.fTransit'],
  ['park', '🌳', '#27ae60', 'map.fPark'],
];
const COLOR = Object.fromEntries(FILTERS.map(([id, , c]) => [id, c]));
COLOR.home = '#7f8c8d';
COLOR.police = '#34495e';
const SOFT = { road: '#d3d7dc', block: '#f4f1ea', water: '#a9cfe8', bridge: '#bfc4ca', big: '#f3dfa2', alley: '#e4dfd4', walk: '#ece6da', park: '#cfe6c1' };
const STORE = 'shipper-map-filters';
const CLUSTER_BELOW = 1.25; // px / m: nhỏ hơn thì gộp điểm
const LABEL_FROM = 1.9; // px / m: từ mức này hiện tên địa điểm

const iconOf = (p) => {
  const look = lookOf(p);
  if (look === 'ferry') return '⛴';
  if (look === 'airport') return '✈️';
  if (look === 'busStation') return '🚌';
  return p.icon || ICON[p.kind] || '•';
};

export class CityMap {
  constructor(handlers) {
    this.handlers = handlers;
    this.el = document.createElement('div');
    this.el.className = 'cm';
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { saved = null; }
    this.on = new Set(Array.isArray(saved) ? saved : FILTERS.filter(([id]) => id !== 'park').map(([id]) => id));
    this.el.innerHTML = `<div class="cm-filters">${FILTERS.map(([id, ic, , key]) => `<button data-f="${id}">${ic} ${fmt(key)}</button>`).join('')}</div>
      <div class="cm-view"><canvas></canvas>
        <div class="cm-zoom"><button data-z="in" title="${fmt('map.zoomIn')}">＋</button><button data-z="out" title="${fmt('map.zoomOut')}">－</button><button data-z="me" title="${fmt('map.center')}">◎</button></div>
        <div class="cm-card hidden"></div></div>`;
    this.c = this.el.querySelector('canvas');
    this.g = this.c.getContext('2d');
    this.card = this.el.querySelector('.cm-card');
    this.view = null; // { cx, cz, k } — k: px trên 1 m
    this.follow = true; // bám theo mình tới khi người chơi kéo bản đồ
    this.sel = null; // địa điểm đang chọn
    this.hits = []; // [{ x, y, r, place | cluster }] để bấm
    this.syncFilters();
    this.el.addEventListener('click', (e) => {
      const f = e.target.closest('[data-f]');
      if (f) {
        const id = f.dataset.f;
        if (this.on.has(id)) this.on.delete(id);
        else this.on.add(id);
        try { localStorage.setItem(STORE, JSON.stringify([...this.on])); } catch { /* không lưu được thì thôi */ }
        this.syncFilters();
        return;
      }
      const z = e.target.closest('[data-z]');
      if (z) {
        if (z.dataset.z === 'me') { this.follow = true; this.view.k = Math.max(this.view.k, 1.6); }
        else this.zoomAt(z.dataset.z === 'in' ? 1.5 : 1 / 1.5, this.c.clientWidth / 2, this.c.clientHeight / 2);
        return;
      }
      const b = e.target.closest('[data-cm]');
      if (b && this.sel) {
        if (b.dataset.cm === 'route') this.handlers.action('waypoint', { id: this.sel.id });
        else if (b.dataset.cm === 'clear') this.handlers.action('waypointClear', {});
        else if (b.dataset.cm === 'close') this.select(null);
      }
    });
    // kéo để dời bản đồ; chạm (không kéo) để chọn
    let drag = null;
    this.c.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, moved: false };
      this.c.setPointerCapture(e.pointerId);
    });
    this.c.addEventListener('pointermove', (e) => {
      if (!drag || !this.view) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      this.follow = false;
      this.view.cx -= dx / this.view.k;
      this.view.cz -= dy / this.view.k;
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    this.c.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) this.tap(e.offsetX, e.offsetY);
      drag = null;
    });
    this.c.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.zoomAt(e.deltaY < 0 ? 1.25 : 1 / 1.25, e.offsetX, e.offsetY);
    }, { passive: false });
  }

  syncFilters() {
    this.el.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('off', !this.on.has(b.dataset.f)));
  }

  kMin() { return Math.min(this.c.clientWidth, this.c.clientHeight) / (2 * HALF + 16); }

  zoomAt(f, sx, sy) {
    const v = this.view;
    if (!v) return;
    const W = this.c.clientWidth, H = this.c.clientHeight;
    const wx = v.cx + (sx - W / 2) / v.k, wz = v.cz + (sy - H / 2) / v.k; // điểm dưới con trỏ giữ nguyên
    v.k = Math.max(this.kMin(), Math.min(5, v.k * f));
    v.cx = wx - (sx - W / 2) / v.k;
    v.cz = wz - (sy - H / 2) / v.k;
    if (f > 1 || sx !== W / 2) this.follow = false;
  }

  tap(x, y) {
    const hit = this.hits.filter((h) => Math.hypot(h.x - x, h.y - y) <= h.r + 4).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (!hit) return this.select(null);
    if (hit.cluster) { // vòng gộp: phóng gần vào đó
      this.follow = false;
      this.view.cx = hit.cluster.x;
      this.view.cz = hit.cluster.z;
      this.view.k = Math.max(this.view.k * 2.2, CLUSTER_BELOW + 0.1);
      return;
    }
    this.select(hit.place);
  }

  select(p) {
    this.sel = p;
    this.cardKey = '';
    if (!p) this.card.classList.add('hidden');
  }

  // Thẻ địa điểm đang chọn: tên, nhóm, địa chỉ, khoảng cách, giờ mở cửa, nút Chỉ đường / Bỏ chỉ đường
  renderCard(d) {
    const p = this.sel;
    if (!p) return;
    const dist = fmtDist(routeDist(d.player, p.door)); // theo đường đi thật
    const grp = placeGroup(p), f = FILTERS.find(([id]) => id === grp);
    const open = isOpen(p, d.now, d.day);
    const hours = fmtHours(p.hours) || fmt('map.allDay');
    const status = p.soon ? fmt('map.soon') : open ? fmt('map.open', { hours }) : fmt('map.closed', { hours });
    const routed = d.waypoint && d.waypoint.id === p.id;
    const html = `<div class="cm-c1"><b>${iconOf(p)} ${p.name}</b><button data-cm="close">✕</button></div>
      <small>${f ? fmt(f[3]) : ''}${p.address ? ' · ' + p.address : ''} · ${dist}</small>
      <small class="${open && !p.soon ? 'ok' : 'warn'}">${status}</small>
      ${d.busy ? `<small>${fmt('map.busy')}</small>` : routed ? `<button class="btn small" data-cm="clear">${fmt('map.unroute')}</button>` : `<button class="btn small primary" data-cm="route">${fmt('map.route')}</button>`}`;
    if (html === this.cardKey) return;
    this.cardKey = html;
    this.card.innerHTML = html;
    this.card.classList.remove('hidden');
  }

  // d: mapData của game + { now, day, route, ferries, waypoint, busy }
  draw(d) {
    const { c, g } = this;
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    if (!this.view) this.view = { cx: d.player.x, cz: d.player.z, k: 1.6 };
    const v = this.view;
    v.k = Math.max(this.kMin(), v.k);
    if (this.follow) { v.cx = d.player.x; v.cz = d.player.z; }
    // không cho kéo ra ngoài thành phố; thu nhỏ tới mức thấy hết chiều nào thì canh giữa chiều đó
    const clampC = (c, half) => { const m = HALF + 8 - half / v.k; return m <= 0 ? 0 : Math.max(-m, Math.min(m, c)); };
    v.cx = clampC(v.cx, W / 2);
    v.cz = clampC(v.cz, H / 2);
    const k = v.k;
    const X = (x) => (x - v.cx) * k + W / 2, Z = (z) => (z - v.cz) * k + H / 2;
    const vis = (x, z, m = 20) => X(x) > -m && X(x) < W + m && Z(z) > -m && Z(z) < H + m;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = SOFT.road;
    g.fillRect(0, 0, W, H);
    // ---- nền (toạ độ thế giới) ----
    g.save();
    g.translate(W / 2, H / 2);
    g.scale(k, k);
    g.translate(-v.cx, -v.cz);
    const R = (r, col) => { g.fillStyle = col; g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); };
    for (let bz = 0; bz < CITY.N; bz++) for (let bx = 0; bx < CITY.N; bx++) R(blockBounds(bx, bz), SOFT.block);
    for (const j of joinList()) R(joinGap(j), SOFT.block);
    for (const s of allSegments()) {
      const t = tierOf(s.id);
      if (t === 'normal') continue;
      const r = segmentRect(s), cl = roadPos(s.line), tg = TIER_GEO[t], along = s.axis === 'x';
      if (t === 'big') R(r, SOFT.big);
      else {
        const strip = (l0, l1) => R(along ? { x0: cl + l0, x1: cl + l1, z0: r.z0, z1: r.z1 } : { x0: r.x0, x1: r.x1, z0: cl + l0, z1: cl + l1 }, SOFT.block);
        strip(-CITY.ROAD / 2, -tg.half);
        strip(tg.half, CITY.ROAD / 2);
      }
    }
    const G = roadGraph(), H2 = CITY.ROAD / 2;
    const node = (key) => { const [i, j] = key.split(',').map(Number); return { x0: roadPos(i) - H2, x1: roadPos(i) + H2, z0: roadPos(j) - H2, z1: roadPos(j) + H2 }; };
    for (const id of G.waterSegs) R(segmentRect(segOf(id)), SOFT.water);
    for (const key of G.waterNodes) R(node(key), SOFT.water);
    for (const key of G.waterBlocks) { const [bx, bz] = key.split(',').map(Number); R(blockBounds(bx, bz), SOFT.water); }
    for (const id of G.highSegs) R(segmentRect(segOf(id)), SOFT.water);
    for (const id of G.bridgeSegs) R(segmentRect(segOf(id)), SOFT.bridge);
    for (const key of G.bridgeNodes) R(node(key), SOFT.bridge);
    if (k >= 1.2) for (const ab of d.alleyBlocks || []) for (const r of ab.alleys) R(r, ab.walk ? SOFT.walk : SOFT.alley);
    for (const p of d.places) if (p.kind === 'scenery') R(p, SOFT.park);
    for (const s of d.jams || []) R(segmentRect(s), 'rgba(231,76,60,.8)');
    if (d.zone) {
      g.fillStyle = 'rgba(155,89,182,.25)';
      g.strokeStyle = '#9b59b6';
      g.lineWidth = 2 / k;
      g.beginPath();
      g.arc(d.zone.x, d.zone.z, d.zone.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // xe buýt & phà (khi bật lọc)
    if (this.on.has('transit')) {
      g.lineWidth = 2.2 / k;
      g.globalAlpha = 0.7;
      for (const r of d.bus?.routes || []) {
        if (r.error || !r.pts.length) continue;
        g.strokeStyle = r.color;
        g.beginPath();
        r.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)));
        g.stroke();
      }
      g.globalAlpha = 1;
      g.setLineDash([6 / k, 5 / k]);
      g.strokeStyle = '#16a085';
      g.lineWidth = 2.5 / k;
      for (const pr of d.ferries || []) {
        g.beginPath();
        g.moveTo(pr.a.edge.x, pr.a.edge.z);
        g.lineTo(pr.b.edge.x, pr.b.edge.z);
        g.stroke();
      }
      g.setLineDash([]);
    }
    // đường tới điểm đến
    if (d.route && d.route.length > 1) {
      g.strokeStyle = '#1e90ff';
      g.lineWidth = Math.max(3, 5 * Math.min(1, k / 1.6)) / k;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.beginPath();
      d.route.forEach((p, i) => (i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)));
      g.stroke();
    }
    g.restore();

    // ---- tên đường (phóng gần) ----
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (k >= 1.4) {
      g.font = '600 10px "Segoe UI", system-ui, sans-serif';
      g.fillStyle = 'rgba(70,75,85,.75)';
      for (let i = 0; i <= CITY.N; i++) {
        const x = X(roadPos(i));
        if (x > 10 && x < W - 10 && STREETS_X[i]) {
          g.save();
          g.translate(x, Math.min(H - 40, Math.max(40, Z(Math.round(v.cz / CITY.PITCH) * CITY.PITCH + CITY.PITCH / 2 - CITY.PITCH))));
          g.rotate(-Math.PI / 2);
          g.fillText(STREETS_X[i], 0, 0);
          g.restore();
        }
        const z = Z(roadPos(i));
        if (z > 10 && z < H - 10 && STREETS_Z[i]) g.fillText(STREETS_Z[i], Math.min(W - 50, Math.max(50, X(Math.round(v.cx / CITY.PITCH) * CITY.PITCH + CITY.PITCH / 2 - CITY.PITCH))), z);
      }
    }

    // ---- địa điểm ----
    this.hits = [];
    const badge = (x, y, icon, ring, r) => {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = r > 10 ? 3 : 2;
      g.strokeStyle = ring;
      g.stroke();
      g.font = `${Math.round(r * 1.2)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      g.fillStyle = '#000';
      g.fillText(icon, x, y + 1);
    };
    const shown = d.places.filter((p) => p.door && (p.kind !== 'scenery' || (p.activities || []).length) && (placeGroup(p) === 'home' || placeGroup(p) === 'police' || this.on.has(placeGroup(p))) && vis(p.door.x, p.door.z));
    if (k < CLUSTER_BELOW) {
      // gộp theo ô lưới trên màn hình
      const cell = 34, bins = new Map();
      for (const p of shown) {
        const sx = X(p.door.x), sy = Z(p.door.z), key = `${Math.floor(sx / cell)},${Math.floor(sy / cell)}`;
        let b = bins.get(key);
        if (!b) bins.set(key, (b = { sx: 0, sy: 0, x: 0, z: 0, n: 0, groups: {}, one: p }));
        b.sx += sx; b.sy += sy; b.x += p.door.x; b.z += p.door.z; b.n++;
        b.groups[placeGroup(p)] = (b.groups[placeGroup(p)] || 0) + 1;
      }
      for (const b of bins.values()) {
        const x = b.sx / b.n, y = b.sy / b.n;
        if (b.n === 1) {
          g.globalAlpha = b.one.soon ? 0.45 : 1;
          badge(x, y, iconOf(b.one), COLOR[placeGroup(b.one)] || '#888', 8);
          g.globalAlpha = 1;
          this.hits.push({ x, y, r: 9, place: b.one });
          continue;
        }
        const top = Object.entries(b.groups).sort((a, c2) => c2[1] - a[1])[0][0], r = 9 + Math.min(6, b.n);
        g.fillStyle = COLOR[top] || '#888';
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = '#fff';
        g.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
        g.fillText(String(b.n), x, y + 1);
        this.hits.push({ x, y, r, cluster: { x: b.x / b.n, z: b.z / b.n } });
      }
    } else {
      const r = k >= LABEL_FROM ? 10 : 8.5;
      const boxes = [];
      for (const p of shown) {
        const x = X(p.door.x), y = Z(p.door.z);
        g.globalAlpha = p.soon ? 0.45 : 1;
        badge(x, y, iconOf(p), COLOR[placeGroup(p)] || '#888', p === this.sel ? r + 3 : r);
        g.globalAlpha = 1;
        this.hits.push({ x, y, r, place: p });
        boxes.push({ x0: x - r, x1: x + r, y0: y - r, y1: y + r });
      }
      if (k >= LABEL_FROM) {
        // tên dưới biểu tượng; chữ nào đè chữ / biểu tượng khác thì bỏ (địa điểm đang chọn được ưu tiên)
        g.font = '600 10px "Segoe UI", system-ui, sans-serif';
        const free = (b) => !boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
        for (const p of [...shown].sort((a) => (a === this.sel ? -1 : 0))) {
          const t = p.name.length > 18 ? p.name.slice(0, 16) + '…' : p.name, x = X(p.door.x), y = Z(p.door.z);
          const w = g.measureText(t).width + 6, b = { x0: x - w / 2, x1: x + w / 2, y0: y + r + 1, y1: y + r + 14 };
          if (p !== this.sel && !free(b)) continue;
          boxes.push(b);
          g.fillStyle = 'rgba(255,255,255,.9)';
          g.fillRect(b.x0, b.y0, w, 13);
          g.fillStyle = '#222';
          g.fillText(t, x, y + r + 7.5);
        }
      }
    }
    // CSGT đã biết, xe đang dựng, điểm đến
    for (const p of d.police || []) if (vis(p.x, p.z)) badge(X(p.x), Z(p.z), '👮', COLOR.police, 9);
    if (d.bike) badge(X(d.bike.x), Z(d.bike.z), '🛵', '#5dade2', 10);
    if (d.target) {
      const t = d.target, x = X(t.x), y = Z(t.z), pulse = 3 * Math.sin(performance.now() / 200);
      g.fillStyle = 'rgba(30,144,255,.25)';
      g.beginPath();
      g.arc(x, y, 16 + pulse, 0, Math.PI * 2);
      g.fill();
      badge(x, y, '📍', t.color || '#1e90ff', 11);
    }
    // mình (mũi tên theo hướng đi, bắc ở trên)
    const pl = d.player;
    g.save();
    g.translate(X(pl.x), Z(pl.z));
    g.rotate(-pl.heading + Math.PI);
    g.fillStyle = '#2ecc71';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -11);
    g.lineTo(8, 8);
    g.lineTo(0, 3.5);
    g.lineTo(-8, 8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    this.renderCard(d);
  }
}
