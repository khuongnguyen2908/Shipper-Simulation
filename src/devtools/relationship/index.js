// =============================================================
// CÔNG CỤ SƠ ĐỒ QUAN HỆ NHÂN VẬT (/?relationship)
// Bảng vẽ: mỗi nhân vật 1 thẻ (kéo để sắp xếp), dây quan hệ giữa 2 thẻ (kéo từ chấm xanh sang thẻ khác để nối).
// Bên phải: sửa nhân vật (hồ sơ · ngoại hình · quan hệ) / sửa dây (loại, xưng hô 2 chiều, tình cảm, chương, bí mật) /
//   loại dây / kết quả ✅ Kiểm tra (bộ luật validateRelations trong data/validate.js — dùng chung với npm test).
// Lưu (npm run dev): ghi src/data/relations.json; "Đưa vào cốt truyện" ghi thêm story.json + vi.json
//   (gộp vào bản mới nhất trên đĩa, không đè chỗ ?editor vừa lưu). Game đọc qua data/relations.js.
// =============================================================
import '../editor/editor.css';
import './relationship.css';
import relJson from '../../data/relations.json' with { type: 'json' };
import storyJson from '../../data/story.json' with { type: 'json' };
import placesJson from '../../data/places.json' with { type: 'json' };
import goodsJson from '../../data/goods.json' with { type: 'json' };
import contentJson from '../../content/vi.json' with { type: 'json' };
import { validateRelations, ID_RE, findOldName, swapName, PLACE_TEXT } from '../../data/validate.js';
import { DEFAULT_TYPES, LOOK_SLOTS, lookOfChar, PLAYER } from '../../data/relations.js';
import { OUTFIT_SLOTS, canWearOutfit } from '../../data/goods.js';
import { isPlaced } from '../../data/places.js';
import { faceOptions, eyeOptions } from '../../data/faces.js';
import { HAIR_BY_GENDER, HAIR_EXTRA, HAIR_COLORS, PLAYER_SKINS, LOOK_AGES, LOOK_BUILDS } from '../../sim/people.js';
import { colorsToNumbers } from '../../data/balance.js';
import { npcLook } from '../../world/models.js';
import { el, field, textInput, numInput, selectInput, checkInput, areaInput, button, emojiInput, colorInput, clone } from '../editor/ui.js';
import { personPreview } from '../editor/personPreview.js';
import { createHistory, syncMirror, record, breakStep, undo, redo } from '../editor/history.js';

const W = 168, H = 66; // cỡ thẻ nhân vật
const VIEW_KEY = 'shipper-rel-view';
const KEYS = ['rel', 'story', 'content', 'places'];
const LEVELS = { error: ['Lỗi — phải sửa', 'err'], warn: ['Cảnh báo — nên xem', 'wrn'], info: ['Gợi ý', 'inf'] };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const hex = (n) => `#${Number(n).toString(16).padStart(6, '0')}`;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* chế độ riêng tư */ } },
};

export function startRelationship(root) {
  document.body.classList.add('editor-mode', 'rl-mode');
  document.title = 'Quan hệ nhân vật — Shipper Simulation';
  const data = { rel: clone(relJson), story: clone(storyJson), content: clone(contentJson), places: clone(placesJson) };
  const rel = () => data.rel;
  rel().types ||= clone(DEFAULT_TYPES);
  rel().characters ||= {};
  rel().links ||= [];
  rel().notes ||= [];
  rel().ignore ||= [];
  if (!rel().characters[PLAYER]) rel().characters[PLAYER] = { icon: '🧑', name: 'Người chơi', x: 400, y: 300 };
  const base = Object.fromEntries(KEYS.map((k) => [k, JSON.stringify(data[k])]));
  const hist = createHistory();
  syncMirror(hist, data, KEYS);
  // mục đã sửa trong dữ liệu game (NPC địa điểm, danh bạ / người lạ cốt truyện, chữ) → lúc Lưu chỉ gộp đúng các mục này vào bản mới nhất trên đĩa
  const touched = { places: new Set(), story: new Set(), content: new Set() };
  const npcPlaces = () => data.places.places.filter((p) => isPlaced(p) && p.npc);
  const placeById = (id) => data.places.places.find((p) => p.id === id) || null;
  const S = {
    sel: null, // { kind: 'char' | 'link', id }
    panel: 'home', // home · char · link · types · check
    charTab: 'profile',
    outfit: {}, // bộ đồ đang xem của từng nhân vật
    nameBefore: {}, // tên lúc bắt đầu sửa ô Tên (để nhớ tên cũ)
    chapter: 0,
    query: '',
    connect: null, // chế độ nối dây bằng bấm: mã thẻ đầu tiên
    showIgnored: false,
    issues: [],
    checkedAt: null,
    view: { x: 40, y: 20, k: 1, ...(store.get(VIEW_KEY) || {}) },
  };
  const firstOpen = !store.get(VIEW_KEY); // lần đầu mở: tự "vừa màn"
  let relDisk = JSON.stringify(relJson); // relations.json trên đĩa lúc mở (để biết có ai lưu chen vào không)

  // ---------- khung ----------
  root.innerHTML = '';
  const bar = el('div', { class: 'rl-bar' });
  const board = el('div', { class: 'rl-board' });
  const world = el('div', { class: 'rl-world' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'rl-wires');
  const temp = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  temp.setAttribute('class', 'rl-temp');
  world.append(svg);
  const cardsEl = el('div', { class: 'rl-cards' });
  world.append(cardsEl);
  const legend = el('div', { class: 'rl-legend' });
  const zoomBox = el('div', { class: 'rl-zoom' });
  board.append(world, legend, zoomBox);
  const side = el('div', { class: 'rl-side' });
  const banner = el('div', { class: 'rl-banner hidden' });
  root.append(el('div', { class: 'rl' }, bar, board, side), banner);

  // ---------- tiện ích dữ liệu ----------
  const chars = () => rel().characters;
  const links = () => rel().links;
  const types = () => rel().types;
  const C = (id) => chars()[id];
  const linkById = (id) => links().find((l) => l.id === id);
  const storyName = (id) => {
    const p = data.story.contacts?.[id] || data.story.people?.[id];
    return p ? data.content[p.name] ?? p.name : '';
  };
  const storyEntries = (id) => ['contacts', 'people'].map((tb) => data.story[tb]?.[id]).filter(Boolean);
  // Nhân vật gắn với game: lấy tên / biểu tượng / giới tính theo dữ liệu game (NPC địa điểm trước, rồi danh bạ cốt truyện)
  const rememberOld = (c, old) => {
    old = String(old || '').trim();
    if (old && old !== c.name && !/^Nhân vật mới$/.test(old)) c.oldNames = [...new Set([...(c.oldNames || []).filter((x) => x !== c.name), old])];
  };
  const pullFromGame = (c) => {
    const before = c.name;
    const p = c.place && placeById(c.place);
    if (p?.npc) {
      c.name = p.npc.name || c.name;
      if (p.npc.portrait) c.icon = p.npc.portrait;
      if (p.npc.gender) c.gender = p.npc.gender;
    } else if (c.story && storyEntries(c.story).length) {
      c.name = storyName(c.story) || c.name;
      c.icon = storyEntries(c.story)[0].icon || c.icon;
    }
    if (before && before !== c.name && (c.place || c.story)) rememberOld(c, before);
  };
  // Sửa tên / biểu tượng / giới tính nhân vật gắn với game → ghi luôn vào dữ liệu game (NPC + danh bạ / người lạ cốt truyện)
  const pushToGame = (c, f) => {
    const p = c.place && placeById(c.place);
    if (p?.npc) {
      if (f === 'name') p.npc.name = c.name;
      if (f === 'icon') p.npc.portrait = c.icon;
      if (f === 'gender') { if (c.gender) p.npc.gender = c.gender; else delete p.npc.gender; }
      touched.places.add(p.id);
    }
    if (c.story) for (const e of storyEntries(c.story)) {
      if (f === 'name' && e.name) { data.content[e.name] = c.name; touched.content.add(e.name); }
      if (f === 'icon') { e.icon = c.icon; touched.story.add(c.story); }
    }
  };
  for (const c of Object.values(rel().characters)) pullFromGame(c);
  base.rel = JSON.stringify(data.rel); // bản sao tên trong relations.json chỉ là bản nháp — không tính là "chưa lưu"
  // vừa là NPC vừa có trong danh bạ / người lạ cốt truyện mà 2 tên khác nhau (vd đổi tên NPC ở ?editor) → lấy theo tên NPC, chờ bấm Lưu
  const renamed = [];
  for (const c of Object.values(rel().characters)) {
    if (!(c.place && placeById(c.place)?.npc && c.story)) continue;
    const old = storyName(c.story);
    if (old && old !== c.name) { renamed.push(`${old} → ${c.name}`); pushToGame(c, 'name'); }
  }
  syncMirror(hist, data, KEYS);
  const chapters = () => (data.story.chapters || []).length;
  const dirty = () => KEYS.some((k) => JSON.stringify(data[k]) !== base[k]);
  const newId = (name, used) => {
    const w = fold(name).replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    let id = w.length ? w[0] + w.slice(1).map((x) => x[0].toUpperCase() + x.slice(1)).join('') : 'nv';
    if (!/^[a-z]/.test(id)) id = `nv${id}`;
    let out = id;
    for (let n = 2; used[out]; n++) out = `${id}${n}`;
    return out;
  };
  const linkId = () => {
    let n = links().length + 1;
    while (linkById(`l${n}`)) n++;
    return `l${n}`;
  };
  const issueKey = (i) => `${i.ref}|${i.msg}`;
  const ignored = (i) => (rel().ignore || []).some((x) => `${x.ref}|${x.msg}` === issueKey(i));

  function banner_(html, kind = 'ok', ms = 4000) {
    banner.className = `rl-banner ${kind}`;
    banner.innerHTML = html;
    clearTimeout(banner_.t);
    if (ms) banner_.t = setTimeout(() => banner.classList.add('hidden'), ms);
  }

  // ---------- thay đổi + hoàn tác ----------
  let checkT = 0;
  function changed({ panel = false } = {}) {
    record(hist, data, KEYS);
    drawBoard();
    drawBar();
    if (panel) drawSide();
    clearTimeout(checkT);
    checkT = setTimeout(runCheck, 250);
  }
  function runCheck() {
    S.issues = validateRelations(rel(), { story: data.story, places: data.places, goods: goodsJson, content: data.content });
    drawBar();
    drawBoard();
    if (S.panel === 'check') drawSide();
  }
  function doUndo(redoIt = false) {
    breakStep(hist);
    if (!(redoIt ? redo : undo)(hist, data)) return;
    if (S.sel?.kind === 'char' && !C(S.sel.id)) select(null);
    if (S.sel?.kind === 'link' && !linkById(S.sel.id)) select(null);
    drawAll();
    runCheck();
  }

  // ---------- chọn ----------
  function select(sel, { center = false, tab = null } = {}) {
    S.sel = sel;
    S.panel = sel ? sel.kind : 'home';
    if (tab) S.charTab = tab;
    if (center && sel) centerOn(sel);
    drawBoard();
    drawSide();
  }
  function centerOn(sel) {
    let x, y;
    if (sel.kind === 'char' && C(sel.id)) [x, y] = [C(sel.id).x + W / 2, C(sel.id).y + H / 2];
    else if (sel.kind === 'link') {
      const l = linkById(sel.id), a = l && C(l.a), b = l && C(l.b);
      if (!a || !b) return;
      [x, y] = [(a.x + b.x) / 2 + W / 2, (a.y + b.y) / 2 + H / 2];
    } else return;
    const r = board.getBoundingClientRect();
    S.view.x = r.width / 2 - x * S.view.k;
    S.view.y = r.height / 2 - y * S.view.k;
    applyView();
  }

  // ---------- thanh trên ----------
  function drawBar() {
    const vis = S.issues.filter((i) => !ignored(i));
    const n = (lv) => vis.filter((i) => i.level === lv).length;
    const chOpts = [[0, 'Tất cả chương'], ...Array.from({ length: chapters() + 1 }, (_, i) => [i + 1, `Tới chương ${i + 1}`])];
    const search = el('input', { type: 'search', class: 'rl-search', placeholder: '🔍 Tìm nhân vật…', value: S.query });
    search.addEventListener('input', () => {
      S.query = search.value;
      drawBoard();
      const hit = Object.entries(chars()).find(([, c]) => S.query && fold(`${c.name} ${c.role}`).includes(fold(S.query)));
      if (hit) centerOn({ kind: 'char', id: hit[0] });
    });
    bar.replaceChildren(
      el('b', { class: 'rl-title' }, '🕸️ Quan hệ nhân vật'),
      button('＋ Nhân vật', () => addChar()),
      button('＋ Lấy từ game ▾', (e) => pickFromGame(e.currentTarget)),
      button(S.connect ? '🔗 Bấm thẻ thứ 2…' : '🔗 Nối dây', () => { S.connect = S.connect ? null : '?'; drawBar(); drawBoard(); if (S.connect) banner_('Bấm thẻ thứ nhất rồi thẻ thứ hai để nối dây (hoặc kéo từ chấm xanh bên phải thẻ). Esc để thôi.', 'info', 5000); }, S.connect ? 'on' : ''),
      button('🗑 Xóa', () => removeSel(), S.sel && !(S.sel.kind === 'char' && S.sel.id === PLAYER) ? '' : 'off'),
      button('↶', () => doUndo(false), hist.undo.length ? 'icon-btn' : 'icon-btn off'),
      button('↷', () => doUndo(true), hist.redo.length ? 'icon-btn' : 'icon-btn off'),
      selectInput(S.chapter, chOpts, (v) => { S.chapter = Number(v); drawBoard(); }),
      search,
      el('span', { class: 'rl-sp' }),
      button(el('span', {}, '✅ Kiểm tra', n('error') ? el('i', { class: 'rl-cnt err' }, n('error')) : null, n('warn') ? el('i', { class: 'rl-cnt wrn' }, n('warn')) : null), () => { runCheck(); S.checkedAt = new Date(); S.panel = 'check'; drawSide(); }, S.panel === 'check' ? 'on' : ''),
      button('🏷️ Loại dây', () => { S.panel = 'types'; drawSide(); }, S.panel === 'types' ? 'on' : ''),
      el('a', { class: 'btn', href: '/?editor', target: '_blank', title: 'Mở công cụ nội dung (?editor) ở tab mới' }, '🛠️ Editor'),
      button(dirty() ? '💾 Lưu *' : '💾 Lưu', () => save(), 'primary'),
    );
  }

  // ---------- bảng vẽ ----------
  function applyView() {
    world.style.transform = `translate(${S.view.x}px, ${S.view.y}px) scale(${S.view.k})`;
    zoomBox.querySelector('.rl-pct') && (zoomBox.querySelector('.rl-pct').textContent = `${Math.round(S.view.k * 100)}%`);
    store.set(VIEW_KEY, S.view);
  }
  function zoomAt(k, cx, cy) {
    const nk = Math.max(0.3, Math.min(2.2, k));
    S.view.x = cx - ((cx - S.view.x) * nk) / S.view.k;
    S.view.y = cy - ((cy - S.view.y) * nk) / S.view.k;
    S.view.k = nk;
    applyView();
  }
  function fit() {
    const list = Object.values(chars());
    if (!list.length) return;
    const x0 = Math.min(...list.map((c) => c.x)), y0 = Math.min(...list.map((c) => c.y));
    const x1 = Math.max(...list.map((c) => c.x + W)), y1 = Math.max(...list.map((c) => c.y + H));
    const r = board.getBoundingClientRect();
    const k = Math.max(0.3, Math.min(1.4, Math.min((r.width - 80) / (x1 - x0), (r.height - 110) / (y1 - y0))));
    S.view = { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k - 20 };
    applyView();
  }
  zoomBox.append(
    button('−', () => { const r = board.getBoundingClientRect(); zoomAt(S.view.k / 1.2, r.width / 2, r.height / 2); }, 'small'),
    el('span', { class: 'btn small rl-pct' }, '100%'),
    button('＋', () => { const r = board.getBoundingClientRect(); zoomAt(S.view.k * 1.2, r.width / 2, r.height / 2); }, 'small'),
    button('⤢ Vừa màn', fit, 'small'),
  );

  const issuesOf = (ref) => S.issues.filter((i) => i.ref === ref && !ignored(i));
  const hidden = (c) => S.chapter && (c.from || 1) > S.chapter;
  const linkHidden = (l) => S.chapter && ((l.from || 1) > S.chapter || (l.to != null && l.to < S.chapter));
  const tagOf = (id, c) => {
    if (id === PLAYER) return ['Người chơi', 'pl'];
    if (c.place) return [`🏪 NPC: ${placeById(c.place)?.name || c.place}`, ''];
    if (c.story) return ['📖 Cốt truyện', ''];
    return ['Mới — chưa có trong game', 'new'];
  };

  function drawBoard() {
    const q = fold(S.query);
    // dây: các dây cùng 2 người thì uốn cong lệch nhau
    const groups = {};
    for (const l of links()) (groups[[l.a, l.b].sort().join('|')] ||= []).push(l);
    let paths = '';
    const labels = [];
    for (const g of Object.values(groups)) {
      g.forEach((l, i) => {
        const a = C(l.a), b = C(l.b);
        if (!a || !b) return;
        const t = types()[l.type] || { color: '#888', name: l.type };
        const [x1, y1, x2, y2] = [a.x + W / 2, a.y + H / 2, b.x + W / 2, b.y + H / 2];
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const off = (i - (g.length - 1) / 2) * 46 * (l.a < l.b ? 1 : -1);
        const cx = (x1 + x2) / 2 + (-(y2 - y1) / len) * off, cy = (y1 + y2) / 2 + ((x2 - x1) / len) * off;
        const mx = 0.25 * x1 + 0.5 * cx + 0.25 * x2, my = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
        const on = S.sel?.kind === 'link' && S.sel.id === l.id;
        const bad = issuesOf(`link:${l.id}`);
        const err = bad.some((x) => x.level === 'error'), dim = linkHidden(l) || (q && ![a, b].some((c) => fold(`${c.name} ${c.role}`).includes(q)));
        const col = err ? '#e74c3c' : t.color;
        paths += `<path d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}" class="rl-wire${dim ? ' dim' : ''}" stroke="${col}" stroke-width="${on ? 5 : err ? 4 : 3}" ${l.secret ? 'stroke-dasharray="9 7"' : ''}/>`;
        paths += `<path d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}" class="rl-hit" data-link="${l.id}"/>`;
        const text = (l.secret ? '🔒 ' : '') + (l.ab?.label || t.name);
        labels.push(el('div', { class: `rl-lbl${on ? ' on' : ''}${dim ? ' dim' : ''}${err ? ' err' : bad.length ? ' wrn' : ''}`, 'data-link': l.id, style: `left:${mx}px;top:${my}px;border-color:${col}`, title: `${a.name} ↔ ${b.name}: ${t.name}` }, text.length > 26 ? text.slice(0, 25) + '…' : text));
      });
    }
    svg.innerHTML = paths;
    svg.append(temp);
    const cards = Object.entries(chars()).map(([id, c]) => {
      const [tag, tcls] = tagOf(id, c);
      const bad = issuesOf(`char:${id}`), err = bad.some((x) => x.level === 'error');
      const match = !q || fold(`${c.name} ${c.role}`).includes(q);
      const on = S.sel?.kind === 'char' && S.sel.id === id;
      return el('div', { class: `rl-card${on ? ' sel' : ''}${id === PLAYER ? ' player' : ''}${hidden(c) || !match ? ' dim' : ''}${err ? ' err' : bad.length ? ' wrn' : ''}${S.connect === id ? ' pick' : ''}`, 'data-id': id, style: `left:${c.x}px;top:${c.y}px` },
        el('span', { class: 'ic' }, c.icon || '🙂'),
        el('b', {}, c.name || id),
        el('small', {}, c.role || ''),
        el('span', { class: 'tags' }, el('span', { class: `tag ${tcls}` }, tag), (c.from || 1) > 1 ? el('span', { class: 'tag ch' }, `Từ ch.${c.from}`) : null),
        el('i', { class: 'dot', title: 'Kéo sang thẻ khác để nối dây' }),
        bad.length ? el('i', { class: `badge${err ? '' : ' w'}` }, bad.length) : null);
    });
    cardsEl.replaceChildren(...labels, ...cards);
    legend.replaceChildren(...Object.values(types()).map((t) => el('span', {}, el('i', { style: `background:${t.color}` }), t.name)), el('span', {}, el('i', { class: 'dash' }), 'Bí mật 🔒'));
    applyView();
  }

  // kéo nền / kéo thẻ / nối dây
  const toWorld = (e) => {
    const r = board.getBoundingClientRect();
    return [(e.clientX - r.left - S.view.x) / S.view.k, (e.clientY - r.top - S.view.y) / S.view.k];
  };
  let drag = null;
  board.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.rl-zoom, .rl-legend')) return;
    const card = e.target.closest('.rl-card');
    const linkEl = e.target.closest('[data-link]');
    if (e.target.classList.contains('dot') && card) {
      drag = { kind: 'wire', from: card.dataset.id };
      const c = C(card.dataset.id);
      temp.setAttribute('x1', c.x + W / 2);
      temp.setAttribute('y1', c.y + H / 2);
      const [x, y] = toWorld(e);
      temp.setAttribute('x2', x);
      temp.setAttribute('y2', y);
      temp.style.display = 'block';
    } else if (card) {
      const c = C(card.dataset.id), [x, y] = toWorld(e);
      drag = { kind: 'card', id: card.dataset.id, dx: x - c.x, dy: y - c.y, moved: false };
    } else if (linkEl) {
      drag = { kind: 'link', id: linkEl.dataset.link };
    } else drag = { kind: 'pan', x: e.clientX, y: e.clientY, vx: S.view.x, vy: S.view.y, moved: false };
    try { board.setPointerCapture(e.pointerId); } catch { /* bút cảm ứng / sự kiện giả lập: bỏ qua */ }
    document.body.classList.add('ed-dragging');
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
      S.view.x = drag.vx + e.clientX - drag.x;
      S.view.y = drag.vy + e.clientY - drag.y;
      applyView();
    } else if (drag.kind === 'card') {
      const [x, y] = toWorld(e), c = C(drag.id);
      const nx = Math.round(x - drag.dx), ny = Math.round(y - drag.dy);
      if (!drag.moved && Math.abs(nx - c.x) + Math.abs(ny - c.y) < 4) return;
      drag.moved = true;
      c.x = nx;
      c.y = ny;
      drawBoard();
    } else if (drag.kind === 'wire') {
      const [x, y] = toWorld(e);
      temp.setAttribute('x2', x);
      temp.setAttribute('y2', y);
    }
  });
  board.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    document.body.classList.remove('ed-dragging');
    temp.style.display = 'none';
    if (!d) return;
    if (d.kind === 'pan' && !d.moved) { S.connect = S.connect ? '?' : null; select(null); }
    else if (d.kind === 'card') {
      if (d.moved) { breakStep(hist); changed(); breakStep(hist); }
      else if (S.connect) clickConnect(d.id);
      else select({ kind: 'char', id: d.id });
    } else if (d.kind === 'link') select({ kind: 'link', id: d.id });
    else if (d.kind === 'wire') {
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.rl-card');
      if (t && t.dataset.id !== d.from) addLink(d.from, t.dataset.id);
    }
  });
  board.addEventListener('dblclick', (e) => {
    if (e.target.closest('.rl-card, [data-link], .rl-zoom, .rl-legend')) return;
    const [x, y] = toWorld(e);
    addChar({ x: Math.round(x - W / 2), y: Math.round(y - H / 2) });
  });
  board.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = board.getBoundingClientRect();
    zoomAt(S.view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  function clickConnect(id) {
    if (S.connect === '?' || !C(S.connect)) { S.connect = id; drawBoard(); drawBar(); return; }
    if (S.connect !== id) addLink(S.connect, id);
    S.connect = null;
    drawBar();
  }

  // ---------- thêm / xóa ----------
  function viewCenter() {
    const r = board.getBoundingClientRect();
    return { x: Math.round((r.width / 2 - S.view.x) / S.view.k - W / 2), y: Math.round((r.height / 2 - S.view.y) / S.view.k - H / 2) };
  }
  function addChar(over = {}) {
    const id = newId(over.name || 'nhan vat moi', chars());
    const at = over.x != null ? {} : viewCenter();
    chars()[id] = { icon: '🙂', name: 'Nhân vật mới', gender: '', age: null, role: '', personality: '', notes: '', story: '', place: '', from: 1, look: null, outfits: [], ...at, ...over };
    breakStep(hist);
    changed();
    select({ kind: 'char', id }, { tab: 'profile' });
    side.querySelector('input[type=text]')?.focus();
  }
  function addLink(a, b) {
    const ex = links().find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    if (ex && !confirm(`${C(a).name} và ${C(b).name} đã có dây "${types()[ex.type]?.name || ex.type}". Thêm dây nữa?`)) return select({ kind: 'link', id: ex.id });
    const id = linkId();
    const side_ = () => ({ label: '', self: '', call: '', feel: 0 });
    links().push({ id, a, b, type: types().friend ? 'friend' : Object.keys(types())[0], ab: side_(), ba: side_(), from: Math.max(C(a).from || 1, C(b).from || 1), to: null, secret: false, notes: '' });
    breakStep(hist);
    changed();
    select({ kind: 'link', id });
  }
  function removeSel() {
    const s = S.sel;
    if (!s) return;
    if (s.kind === 'char') {
      if (s.id === PLAYER) return;
      const c = C(s.id), n = links().filter((l) => l.a === s.id || l.b === s.id).length;
      if (!confirm(`Xóa ${c.name}${n ? ` và ${n} dây nối với người này` : ''}?`)) return;
      delete chars()[s.id];
      rel().links = links().filter((l) => l.a !== s.id && l.b !== s.id);
    } else {
      const l = linkById(s.id);
      if (!l || !confirm(`Xóa dây ${C(l.a)?.name} ↔ ${C(l.b)?.name}?`)) return;
      rel().links = links().filter((x) => x.id !== s.id);
    }
    breakStep(hist);
    changed();
    select(null);
  }

  // ＋ Lấy từ game: người trong cốt truyện / NPC địa điểm chưa có trong sơ đồ
  function pickFromGame(anchor) {
    document.querySelector('.rl-pop')?.remove();
    const usedStory = new Set(Object.values(chars()).map((c) => c.story).filter(Boolean));
    const usedPlace = new Set(Object.values(chars()).map((c) => c.place).filter(Boolean));
    const storyRows = [...Object.entries(data.story.contacts || {}), ...Object.entries(data.story.people || {})]
      .filter(([id], i, arr) => !usedStory.has(id) && arr.findIndex(([x]) => x === id) === i)
      .map(([id, p]) => ({ label: `${p.icon || '🙂'} ${storyName(id)}`, sub: `cốt truyện · ${id}`, make: () => ({ name: storyName(id), icon: p.icon || '🙂', story: id, place: p.place && !usedPlace.has(p.place) ? p.place : '' }) }));
    const placeRows = npcPlaces().filter((p) => !usedPlace.has(p.id)).map((p) => ({ label: `${p.npc.portrait || '🙂'} ${p.npc.name}`, sub: `NPC · ${p.name}`, make: () => ({ name: p.npc.name, icon: p.npc.portrait || '🙂', gender: p.npc.gender || '', place: p.id }) }));
    const q = el('input', { type: 'search', placeholder: 'Tìm tên người / tên địa điểm…' });
    const list = el('div', { class: 'rl-pop-list' });
    const draw = () => {
      const f = fold(q.value);
      const row = (r) => el('button', { type: 'button', onclick: () => { pop.remove(); addChar({ ...r.make(), ...viewCenter() }); } }, el('span', {}, r.label), el('small', {}, r.sub));
      const s = storyRows.filter((r) => !f || fold(r.label + r.sub).includes(f)), p = placeRows.filter((r) => !f || fold(r.label + r.sub).includes(f));
      list.replaceChildren(el('b', {}, `📖 Người trong cốt truyện (${s.length})`), ...s.map(row), el('b', {}, `🏪 NPC địa điểm (${p.length})`), ...p.slice(0, 200).map(row));
    };
    q.addEventListener('input', draw);
    const pop = el('div', { class: 'rl-pop' }, q, list, el('small', { class: 'muted' }, 'Chỉ hiện người chưa có trong sơ đồ. Esc để đóng.'));
    draw();
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${r.left}px`;
    pop.style.top = `${r.bottom + 4}px`;
    document.body.append(pop);
    q.focus();
    const close = (e) => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); removeEventListener('pointerdown', close, true); } };
    addEventListener('pointerdown', close, true);
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.remove(); });
  }

  // ---------- bảng bên phải ----------
  function drawSide() {
    side.replaceChildren();
    if (S.panel === 'char' && S.sel && C(S.sel.id)) return charPanel(S.sel.id);
    if (S.panel === 'link' && S.sel && linkById(S.sel.id)) return linkPanel(linkById(S.sel.id));
    if (S.panel === 'types') return typesPanel();
    if (S.panel === 'check') return checkPanel();
    homePanel();
  }

  function homePanel() {
    const n = Object.keys(chars()).length, m = links().length;
    side.append(
      el('h3', {}, '🕸️ Sơ đồ quan hệ'),
      el('p', { class: 'muted' }, `${n} nhân vật · ${m} dây quan hệ.`),
      el('div', { class: 'rl-note' },
        el('b', {}, 'Cách dùng'),
        el('ul', {},
          el('li', {}, 'Bấm thẻ / dây để sửa ở đây. Kéo thẻ để sắp xếp, kéo nền để di chuyển, lăn chuột để phóng to, bấm đúp nền để thêm nhân vật.'),
          el('li', {}, 'Nối dây: kéo từ chấm xanh bên phải thẻ sang thẻ khác (hoặc nút 🔗 Nối dây rồi bấm 2 thẻ).'),
          el('li', {}, 'Xưng hô 2 chiều trên dây là thứ game dùng thật: câu thoại có {toi} / {ban} của người đó tự đổi theo.'),
          el('li', {}, 'Nhân vật mới (chưa có trong game) có ngoại hình riêng; "Đưa vào cốt truyện" để cốt truyện gọi ra được.'),
          el('li', {}, '✅ Kiểm tra: tìm lỗi; bấm một dòng để nhảy tới chỗ cần sửa.'),
          el('li', {}, '💾 Lưu (Ctrl+S) rồi nhắn Claude — Claude đọc src/data/relations.json khi viết truyện, lời thoại.'))),
    );
    const notes = rel().notes || [];
    if (notes.length) side.append(el('div', { class: 'rl-note' }, el('b', {}, `📝 Ghi chú của Claude (${notes.length})`), el('p', { class: 'muted' }, 'Xem ở ✅ Kiểm tra.')));
  }

  // ----- nhân vật -----
  function charPanel(id) {
    const c = C(id);
    const [tag, tcls] = tagOf(id, c);
    side.append(el('h3', {}, el('span', { class: 'big' }, c.icon || '🙂'), c.name || id, el('span', { class: `tag ${tcls}` }, tag)));
    const tabs = [['profile', '📋 Hồ sơ'], ['look', '👕 Ngoại hình'], ['links', `🔗 Quan hệ (${links().filter((l) => l.a === id || l.b === id).length})`]];
    side.append(el('div', { class: 'rl-tabs' }, tabs.map(([k, label]) => el('button', { type: 'button', class: S.charTab === k ? 'on' : '', onclick: () => { S.charTab = k; drawSide(); } }, label))));
    const issues = issuesOf(`char:${id}`);
    if (issues.length) side.append(el('div', { class: 'rl-issues' }, issues.map((i) => el('div', { class: `rl-iss ${LEVELS[i.level][1]}` }, i.msg))));
    if (S.charTab === 'look') return lookTab(id, c);
    if (S.charTab === 'links') return linksTab(id);
    profileTab(id, c);
  }
  function profileTab(id, c) {
    const set = (k, v) => { c[k] = v; changed(); };
    const linked = !!(c.place && placeById(c.place)?.npc) || (c.story && storyEntries(c.story).length > 0);
    const setG = (k, v) => {
      if (k === 'name') { S.nameBefore[id] ??= c.name; }
      c[k] = v;
      if (k === 'name') { rememberOld(c, S.nameBefore[id]); c.oldNames = (c.oldNames || []).filter((x) => x !== c.name); if (!c.oldNames.length) delete c.oldNames; }
      pushToGame(c, k);
      changed();
    }; // ô dùng chung với game: sửa ở đây = sửa trong game
    const where = [c.place && placeById(c.place) ? `NPC ${placeById(c.place).name}` : '', c.story ? `cốt truyện (${c.story})` : ''].filter(Boolean).join(' + ');
    const storyOpts = [['', '— Không —'], ...[...Object.entries(data.story.contacts || {}), ...Object.entries(data.story.people || {})]
      .filter(([sid], i, arr) => arr.findIndex(([x]) => x === sid) === i)
      .map(([sid, p]) => [sid, `${p.icon || ''} ${storyName(sid)} (${sid})${Object.entries(chars()).some(([o, x]) => o !== id && x.story === sid) ? ' — đã có' : ''}`])];
    const placeOpts = [['', '— Không —'], ...npcPlaces().map((p) => [p.id, `${p.npc.portrait || ''} ${p.npc.name} — ${p.name}${Object.entries(chars()).some(([o, x]) => o !== id && x.place === p.id) ? ' (đã có)' : ''}`])];
    const idIn = textInput(id, () => {}, { class: 'mono' });
    idIn.addEventListener('change', () => renameChar(id, idIn.value.trim(), idIn));
    side.append(
      el('div', { class: 'grid2' },
        field('Biểu tượng', emojiInput(c.icon, (v) => setG('icon', v))),
        field('Mã', id === PLAYER ? el('code', {}, id) : idIn, { hint: 'Chữ không dấu, số, gạch dưới. Đổi mã thì dây tự đổi theo.' })),
      el('div', { class: 'rl-namerow' }, field(linked ? '🔗 Tên (dùng chung với game)' : 'Tên', textInput(c.name, (v) => setG('name', v)), { hint: linked ? `Sửa ở đây = sửa luôn tên trong game (${where}) và ngược lại sửa ở ?editor thì ở đây đổi theo. Tên cũ còn trong câu thoại thì dùng ✏️ Đổi tên khắp nơi.` : 'Tên để nhận ra trong sơ đồ.' }),
        button('✏️ Đổi tên khắp nơi', () => renameDialog(id), 'small')),
      c.oldNames?.length ? el('small', { class: 'muted' }, `Tên cũ: ${c.oldNames.join(', ')} — ✅ Kiểm tra nhắc nếu còn sót trong câu chữ.`) : null,
      el('div', { class: 'grid3' },
        field('Giới tính', selectInput(c.gender || '', [['', '—'], ['m', 'Nam'], ['f', 'Nữ']], (v) => setG('gender', v))),
        field('Tuổi', numInput(c.age ?? NaN, (v) => set('age', Number.isFinite(v) ? Math.round(v) : null), { min: 0, max: 120, step: 1 })),
        field('Từ chương', numInput(c.from ?? 1, (v) => set('from', Math.max(1, Math.round(v) || 1)), { min: 1, step: 1 }), { hint: 'Nhân vật xuất hiện từ chương này (lọc "Tới chương" làm mờ người chưa xuất hiện).' })),
      field('Vai trong đời', textInput(c.role, (v) => set('role', v)), { hint: 'Vd: chủ nhà trọ, sinh viên, trùm đường dây…' }),
      field('Tính cách', areaInput(c.personality, (v) => set('personality', v), 2), { hint: 'Claude đọc để viết thoại đúng giọng.' }),
      field('Ghi chú cho thoại / truyện', areaInput(c.notes, (v) => set('notes', v), 3), { hint: 'Bí mật, quá khứ, cách nói chuyện… — điều bạn muốn Claude nhớ.' }),
    );
    if (id === PLAYER) return side.append(el('p', { class: 'muted' }, 'Người chơi: tên, giới tính, ngoại hình do người chơi chọn lúc tạo nhân vật. Không xóa được.'));
    side.append(
      el('h4', {}, '🎮 Gắn với game'),
      field('Người trong cốt truyện (story.json)', selectInput(c.story || '', storyOpts, (v) => {
        c.story = v;
        pullFromGame(c); // gắn với game → tên / biểu tượng lấy theo game
        changed({ panel: true });
      }), { hint: 'Người nhắn tin (danh bạ) hoặc người lạ trong cảnh. Thoại của người đó dùng xưng hô theo dây với người chơi.' }),
      field('NPC địa điểm (places.json)', selectInput(c.place || '', placeOpts, (v) => {
        c.place = v;
        pullFromGame(c);
        changed({ panel: true });
      }), { hint: 'Người đứng ở địa điểm đó. Ngoại hình lấy theo NPC (sửa ở ?editor).' }),
    );
    if (!c.story && !c.place) {
      side.append(el('div', { class: 'rl-note' }, 'Nhân vật này chưa có trong game. Bấm nút dưới để thêm vào danh sách "Người nói" của cốt truyện — rồi ở thẻ 📖 Cốt truyện (?editor) dùng việc "Người lạ xuất hiện" với dáng "Theo sơ đồ quan hệ".',
        button('➕ Đưa vào cốt truyện', () => toStory(id), 'primary small')));
    }
    side.append(el('div', { class: 'row' }, button('🗑 Xóa nhân vật', () => removeSel(), 'danger small')));
  }
  function renameChar(id, nid, input) {
    if (nid === id) return;
    if (!ID_RE.test(nid) || chars()[nid] || nid === PLAYER) {
      banner_(`Mã "${nid}" không dùng được (chữ không dấu, số, gạch dưới; chưa có ai dùng).`, 'err');
      input.value = id;
      return;
    }
    const all = chars();
    rel().characters = Object.fromEntries(Object.entries(all).map(([k, v]) => [k === id ? nid : k, v])); // giữ thứ tự
    for (const l of links()) {
      if (l.a === id) l.a = nid;
      if (l.b === id) l.b = nid;
    }
    for (const i of rel().ignore) i.ref = i.ref === `char:${id}` ? `char:${nid}` : i.ref;
    S.sel = { kind: 'char', id: nid };
    breakStep(hist);
    changed({ panel: true });
  }
  // Nhân vật mới → người lạ trong cốt truyện (story.json people + tên ở vi.json)
  function toStory(id) {
    const c = C(id);
    let sid = id, n = 2;
    while (data.story.people?.[sid] || data.story.contacts?.[sid]) sid = `${id}${n++}`;
    const key = `story.people.${sid}`;
    data.story.people ||= {};
    data.story.people[sid] = { icon: c.icon || '🙂', name: key };
    data.content[key] = c.name;
    touched.story.add(sid);
    touched.content.add(key);
    c.story = sid;
    breakStep(hist);
    changed({ panel: true });
    banner_(`Đã thêm "${c.name}" vào cốt truyện (mã ${sid}). Bấm 💾 Lưu để ghi story.json + vi.json.`, 'ok', 6000);
  }

  // ----- ✏️ Đổi tên khắp nơi: liệt kê câu chữ / tên địa điểm còn tên cũ, tick chỗ muốn thay -----
  function renameDialog(id) {
    const c = C(id);
    document.querySelector('.rl-modal')?.remove();
    const st = { old: c.oldNames?.[c.oldNames.length - 1] || S.nameBefore[id] || '', neu: c.name, places: true, selfOld: '', selfNew: '', off: new Set(), items: [] };
    const oldIn = textInput(st.old, (v) => { st.old = v; search(); });
    const newIn = textInput(st.neu, (v) => { st.neu = v; search(); });
    const selfOldIn = textInput('', (v) => { st.selfOld = v.trim(); search(); }, { placeholder: 'vd cô' });
    const selfNewIn = textInput('', (v) => { st.selfNew = v.trim(); search(); }, { placeholder: 'vd dì' });
    const list = el('div', { class: 'rl-rn-list' });
    const count = el('div', { class: 'muted' });
    const go = button('✏️ Thay', () => apply(), 'primary');
    const esc = (s) => String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
    const plain = (s) => String(s).replace(/<[^>]+>/g, '');
    // câu xem trước: từng chỗ đổi đánh dấu (chữ cũ gạch đỏ, chữ mới xanh)
    const mark = (o, n) => `<s>${o}</s><ins>${n}</ins>`;
    const diff = (x) => {
      let h = swapName(esc(plain(x.before)), st.old, st.neu, mark);
      if (st.selfOld && st.selfNew && x.speaker === id) h = h.split(/(<s>.*?<\/s><ins>.*?<\/ins>)/).map((part, i) => (i % 2 ? part : swapName(part, st.selfOld, st.selfNew, mark))).join(''); // không đánh dấu lại chỗ đã đổi tên
      return h;
    };
    function search() {
      st.items = findOldName(st.old, st.neu, { rel: rel(), story: data.story, content: data.content, places: data.places, charId: id, inclPlaces: st.places, selfOld: st.selfOld, selfNew: st.selfNew });
      st.off = new Set(st.items.filter((x) => x.keep).map((x) => x.id)); // câu người nói cố ý gọi tên cũ → mặc định giữ
      draw();
    }
    function draw() {
      const on = st.items.filter((x) => !st.off.has(x.id));
      count.textContent = st.items.length ? `${st.items.length} chỗ · đã tick ${on.length}` : st.old && st.neu && st.old !== st.neu ? 'Không còn chỗ nào có tên cũ 🎉' : 'Nhập tên cũ và tên mới.';
      go.textContent = `✏️ Thay ${on.length} chỗ`;
      go.classList.toggle('off', !on.length);
      const row = (x) => {
        const cb = el('input', { type: 'checkbox', checked: !st.off.has(x.id) });
        cb.addEventListener('change', () => { if (cb.checked) st.off.delete(x.id); else st.off.add(x.id); draw(); });
        const label = x.kind === 'place' ? `🏪 ${x.placeId} · ${x.label || x.field}` : `${x.key}${x.speaker ? ` · ${C(x.speaker)?.name || x.speaker} nói` : ''}`;
        return el('label', { class: `rl-rn-it${st.off.has(x.id) ? ' off' : ''}` }, cb, el('div', {}, el('small', {}, label, x.keep ? ` (giữ: ${x.keep})` : ''), el('span', { class: 'rl-rn-txt', html: diff(x) })));
      };
      const places = st.items.filter((x) => x.kind === 'place'), texts = st.items.filter((x) => x.kind === 'text');
      list.replaceChildren(
        places.length ? el('div', { class: 'rl-grp' }, `Tên địa điểm (${places.length})`) : null, ...places.map(row),
        texts.length ? el('div', { class: 'rl-grp' }, `Lời thoại / tin nhắn / mục tiêu… (${texts.length})`) : null, ...texts.map(row));
    }
    function apply() {
      const on = st.items.filter((x) => !st.off.has(x.id));
      if (!on.length) return;
      for (const x of on) {
        if (x.kind === 'place') { placeById(x.placeId)[x.field] = x.after; touched.places.add(x.placeId); continue; }
        if (x.idx >= 0) data.content[x.key][x.idx] = x.after;
        else data.content[x.key] = x.after;
        touched.content.add(x.key);
      }
      // đổi chính tên hiện tại của nhân vật → đổi luôn tên nhân vật (NPC + danh bạ), nhớ tên cũ
      if (st.old === c.name && st.neu && st.neu !== c.name) {
        c.name = st.neu;
        rememberOld(c, st.old);
        pushToGame(c, 'name');
      }
      breakStep(hist);
      changed({ panel: true });
      modal.remove();
      banner_(`✏️ Đã thay ${on.length} chỗ "${st.old}" → "${st.neu}". Bấm 💾 Lưu để ghi vào game (Ctrl+Z để hoàn tác).`, 'ok', 6000);
    }
    const forget = button('Không nhắc tên cũ này nữa', () => {
      c.oldNames = (c.oldNames || []).filter((x) => x !== st.old);
      if (!c.oldNames.length) delete c.oldNames;
      changed({ panel: true });
      modal.remove();
    }, 'small');
    const modal = el('div', { class: 'rl-modal' }, el('div', { class: 'rl-dlg' },
      el('h3', {}, `✏️ Đổi tên khắp nơi — ${c.icon || ''} ${c.name}`),
      el('div', { class: 'muted' }, 'Tìm mọi câu chữ (kể cả hoa / thường chữ đầu) và tên địa điểm còn tên cũ. Tick chỗ muốn thay, bỏ tick chỗ cố ý giữ.'),
      el('div', { class: 'rl-rn-pair' }, field('Tên cũ', oldIn), el('b', {}, '→'), field('Tên mới', newIn)),
      el('div', { class: 'rl-rn-opts' },
        checkInput(st.places, (v) => { st.places = v; search(); }, 'Cả tên địa điểm'),
        el('span', { class: 'muted' }, `Chữ tự xưng trong lời ${c.name}:`), selfOldIn, el('b', {}, '→'), selfNewIn),
      count, list,
      el('div', { class: 'rl-rn-acts' }, c.oldNames?.includes(st.old) ? forget : null, el('span', { class: 'rl-sp' }), button('Thôi', () => modal.remove()), go)));
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) modal.remove(); });
    modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.remove(); });
    document.body.append(modal);
    search();
    (st.old ? newIn : oldIn).focus();
  }

  // ----- ngoại hình -----
  function lookTab(id, c) {
    if (id === PLAYER) return side.append(el('p', { class: 'muted' }, 'Ngoại hình người chơi do người chơi chọn ở màn tạo nhân vật (và đồ mặc trong game).'));
    const prev = personPreview(`rel-${id}`);
    if (c.place && placeById(c.place)?.npc) {
      const p = placeById(c.place);
      prev.showLook(npcLook(p.id, colorsToNumbers(p.npc)));
      side.append(el('div', { class: 'rl-look' }, prev.el, el('div', { class: 'rl-note' }, `${c.name} là NPC của ${p.name} → game dùng ngoại hình NPC (màu áo, quần, tóc…) trong places.json.`, el('br'), 'Muốn đổi: mở ', el('a', { href: '/?editor', target: '_blank' }, '?editor'), ' → Địa điểm & NPC → ', p.name, '.')));
      return;
    }
    if (!c.look) {
      side.append(el('div', { class: 'rl-note' }, c.story ? 'Chưa có ngoại hình riêng → cốt truyện dùng dáng chọn sẵn (trẻ trâu, cô gái…).' : 'Chưa có ngoại hình.',
        button('＋ Tạo ngoại hình riêng', () => {
          const f = c.gender === 'f';
          c.look = { gender: f ? 'f' : 'm', hairStyle: f ? 'long' : 'short', hair: '#1b1b1b', skin: hex(PLAYER_SKINS[1]), scale: 1 };
          c.outfits = [{ id: 'thuongNgay', name: 'Thường ngày', worn: defaultWorn(f ? 'f' : 'm') }];
          breakStep(hist);
          changed({ panel: true });
        }, 'primary small')));
      return;
    }
    const L = c.look;
    c.outfits ||= [];
    if (!c.outfits.length) c.outfits.push({ id: 'thuongNgay', name: 'Thường ngày', worn: {} });
    let o = c.outfits.find((x) => x.id === S.outfit[id]) || c.outfits[0];
    S.outfit[id] = o.id;
    const show = () => prev.showLook(lookOfChar(c, o.id, goodsJson));
    show();
    const setL = (k, v, re = false) => { L[k] = v; if (k === 'gender') c.gender = v; changed({ panel: re }); show(); };
    const sw = (list, cur, on) => el('div', { class: 'rl-sw' }, list.map((n) => el('button', { type: 'button', class: hex(n) === String(cur).toLowerCase() ? 'on' : '', style: `background:${hex(n)}`, onclick: () => on(hex(n)) })));
    const hairs = [...HAIR_BY_GENDER[L.gender === 'f' ? 'f' : 'm'], ...HAIR_EXTRA[L.gender === 'f' ? 'f' : 'm']];
    side.append(el('div', { class: 'rl-look' }, prev.el, el('div', { class: 'rl-look-f' },
      field('Giới tính', selectInput(L.gender || 'm', [['m', 'Nam'], ['f', 'Nữ']], (v) => { L.hairStyle = HAIR_BY_GENDER[v][0]; setL('gender', v, true); })),
      field('Kiểu tóc', selectInput(L.hairStyle, hairs.map((h) => [h, data.content[`hair.${h}`] || h]), (v) => setL('hairStyle', v))),
      field('Màu tóc', el('div', {}, sw(HAIR_COLORS, L.hair, (v) => setL('hair', v, true)), colorInput(L.hair, (v) => /^#[0-9a-f]{6}$/i.test(v) && setL('hair', v)))),
      field('Màu da', el('div', {}, sw(PLAYER_SKINS, L.skin, (v) => setL('skin', v, true)), colorInput(L.skin, (v) => /^#[0-9a-f]{6}$/i.test(v) && setL('skin', v)))),
      field('Vóc người', numInput(L.scale ?? 1, (v) => Number.isFinite(v) && setL('scale', Math.max(0.6, Math.min(1.4, v))), { min: 0.6, max: 1.4, step: 0.05 }), { hint: '1 = bình thường · 0,85 thấp nhỏ · 1,1 cao to.' }),
      field('Vóc dáng', selectInput(L.build || '', [['', 'Vừa'], ...Object.entries(LOOK_BUILDS)], (v) => { if (v) setL('build', v); else { delete L.build; changed({}); show(); } }), { hint: 'Gầy / đầy đặn / mập (bề ngang người).' }),
      field('Tuổi', selectInput(L.age || '', [['', 'Bình thường'], ...Object.entries(LOOK_AGES)], (v) => { if (v) setL('age', v); else { delete L.age; changed({}); show(); } }), { hint: 'Lớn tuổi: đứng hơi khom lưng. Tóc bạc chọn ở "Màu tóc".' }),
      field('Kiểu mặt', selectInput(L.faceStyle || '', [['', 'Tự lấy theo giới tính + tuổi'], ...faceOptions(L.gender === 'f' ? 'f' : 'm')], (v) => { if (v) setL('faceStyle', v); else { delete L.faceStyle; changed({}); show(); } }), { hint: 'Mặt anime vẽ pixel. Lông mày theo màu tóc.' }),
      field('Màu mắt', selectInput(L.eyeColor || '', [['', 'Theo kiểu mặt'], ...eyeOptions()], (v) => { if (v) setL('eyeColor', v); else { delete L.eyeColor; changed({}); show(); } })))));
    // bộ đồ
    side.append(el('h4', {}, '👕 Bộ đồ'),
      el('div', { class: 'rl-chips' },
        c.outfits.map((x) => el('button', { type: 'button', class: x.id === o.id ? 'on' : '', onclick: () => { S.outfit[id] = x.id; drawSide(); } }, x.name || x.id)),
        el('button', { type: 'button', onclick: () => {
          let n = c.outfits.length + 1, oid = `bo${n}`;
          while (c.outfits.some((x) => x.id === oid)) oid = `bo${++n}`;
          c.outfits.push({ id: oid, name: `Bộ ${n}`, worn: { ...o.worn } });
          S.outfit[id] = oid;
          breakStep(hist);
          changed({ panel: true });
        } }, '＋ Bộ khác')),
      el('div', { class: 'grid2' },
        field('Tên bộ đồ', textInput(o.name, (v) => { o.name = v; changed(); }), { hint: 'Cốt truyện chọn bộ theo tên này (việc "Người lạ xuất hiện").' }),
        field('Kiểu tóc riêng', selectInput(o.hairStyle || '', [['', '— Như trên —'], ...hairs.map((h) => [h, data.content[`hair.${h}`] || h])], (v) => { if (v) o.hairStyle = v; else delete o.hairStyle; changed({ panel: true }); }), { hint: 'Mặc bộ này thì để kiểu tóc này (vd đi đua: undercut vuốt ngược). Bỏ trống = kiểu tóc chung ở trên.' }),
        c.outfits.length > 1 ? field('', button('🗑 Bỏ bộ này', () => { c.outfits = c.outfits.filter((x) => x !== o); delete S.outfit[id]; breakStep(hist); changed({ panel: true }); }, 'danger small')) : null));
    const g = L.gender === 'f' ? 'f' : 'm';
    for (const slot of LOOK_SLOTS) {
      const items = Object.values(goodsJson).filter((x) => x.type === 'outfit' && x.slot === slot && canWearOutfit(x, g));
      const cur = o.worn?.[slot] || '';
      const item = goodsJson[cur];
      side.append(el('div', { class: 'rl-slot' },
        el('span', {}, OUTFIT_SLOTS[slot]?.label || slot),
        el('i', { class: 'sw1', style: `background:${item?.color || 'transparent'}` }),
        selectInput(cur, [['', '— Không —'], ...items.map((x) => [x.id, `${x.icon || ''} ${x.name}${x.npcOnly ? ' (chỉ NPC)' : ''}`])], (v) => {
          o.worn ||= {};
          if (v) o.worn[slot] = v;
          else delete o.worn[slot];
          changed({ panel: true });
        })));
    }
    side.append(el('div', { class: 'rl-note' }, 'Đồ lấy từ quần áo của game (goods.json). Cần món chưa có (vd đồ công an mặc thường): thêm ở ?editor → Xe · Túi · Đồ dùng (tick "Chỉ cho NPC" để không bán cho người chơi), lưu, rồi tải lại trang này.'),
      el('div', { class: 'row' }, button('🗑 Bỏ ngoại hình riêng', () => { if (confirm('Bỏ ngoại hình riêng (và mọi bộ đồ) của nhân vật này?')) { c.look = null; c.outfits = []; breakStep(hist); changed({ panel: true }); } }, 'danger small')));
  }
  // bộ đồ mặc định khi tạo ngoại hình: áo thun + quần dài + giày có sẵn (giá 0)
  function defaultWorn(g) {
    const pick = (slot, style) => Object.values(goodsJson).find((x) => x.type === 'outfit' && x.slot === slot && x.price === 0 && canWearOutfit(x, g) && (!style || x.style === style))?.id;
    const w = { shirt: pick('shirt', 'short') || pick('shirt'), pants: pick('pants', 'long') || pick('pants'), shoes: pick('shoes') };
    return Object.fromEntries(Object.entries(w).filter(([, v]) => v));
  }

  // ----- danh sách dây của 1 nhân vật -----
  function linksTab(id) {
    const mine = links().filter((l) => l.a === id || l.b === id);
    if (!mine.length) side.append(el('p', { class: 'muted' }, 'Chưa có dây nào.'));
    for (const l of mine) {
      const o = l.a === id ? l.b : l.a, t = types()[l.type] || { color: '#888', name: l.type };
      const s = l.a === id ? l.ab : l.ba;
      side.append(el('button', { type: 'button', class: 'rl-lrow', onclick: () => select({ kind: 'link', id: l.id }, { center: true }) },
        el('i', { style: `background:${t.color}` }),
        el('span', {}, el('b', {}, `${C(o)?.icon || ''} ${C(o)?.name || o}`), el('small', {}, `${l.secret ? '🔒 ' : ''}${t.name}${s?.label ? ` · ${s.label}` : ''}${s?.self || s?.call ? ` · xưng "${s.self || '?'}", gọi "${s.call || '?'}"` : ''}`))));
    }
    const others = Object.entries(chars()).filter(([o]) => o !== id).map(([o, c]) => [o, `${c.icon || ''} ${c.name}`]);
    side.append(field('＋ Nối với…', selectInput('', [['', '— Chọn người —'], ...others], (v) => v && addLink(id, v))));
  }

  // ----- dây -----
  function linkPanel(l) {
    const A = C(l.a), B = C(l.b);
    const t = types()[l.type];
    side.append(el('h3', {}, '🔗 ', `${A?.icon || ''} ${A?.name || l.a}`, ' ↔ ', `${B?.icon || ''} ${B?.name || l.b}`));
    const issues = issuesOf(`link:${l.id}`);
    if (issues.length) side.append(el('div', { class: 'rl-issues' }, issues.map((i) => el('div', { class: `rl-iss ${LEVELS[i.level][1]}` }, i.msg))));
    side.append(field('Loại dây', selectInput(l.type, Object.entries(types()).map(([k, x]) => [k, x.name]), (v) => { l.type = v; changed({ panel: true }); }), { hint: t ? '' : 'Loại dây này không còn — chọn lại.' }));
    const dir = (from, to, key) => {
      const s = (l[key] ||= { label: '', self: '', call: '', feel: 0 });
      const feel = el('b', { class: 'rl-feel' }, feelText(s.feel ?? 0));
      const range = el('input', { type: 'range', min: -3, max: 3, step: 1, value: s.feel ?? 0 });
      range.addEventListener('input', () => { s.feel = Number(range.value); feel.textContent = feelText(s.feel); changed(); });
      return el('div', { class: 'rl-dir' },
        el('b', {}, `${from?.name || '?'} → ${to?.name || '?'}`),
        field(`${from?.name || '?'} là gì của ${to?.name || '?'}`, textInput(s.label, (v) => { s.label = v; changed(); }), { hint: 'Vd: mẹ, chủ trọ, bạn thân, đàn em… (chữ trên dây lấy chiều đầu).' }),
        el('div', { class: 'grid2' },
          field('Tự xưng', textInput(s.self, (v) => { s.self = v; changed(); }), { hint: `${from?.name || ''} tự gọi mình là gì khi nói với ${to?.name || ''}. Điền chữ thật (em, anh, chị…), không điền {…}.${(key === 'ab' ? l.a : l.b) === PLAYER ? ' Gõ anh/chị = người chơi nam → anh, nữ → chị.' : ''}` }),
          field('Gọi là', textInput(s.call, (v) => { s.call = v; changed(); }), { hint: `${from?.name || ''} gọi ${to?.name || ''} là gì. Điền chữ thật, không điền {…}.${(key === 'ab' ? l.b : l.a) === PLAYER ? ' Gõ anh/chị = người chơi nam → anh, nữ → chị.' : ''}` })),
        field('Tình cảm', el('div', { class: 'rl-range' }, range, feel)));
    };
    side.append(dir(A, B, 'ab'), dir(B, A, 'ba'));
    side.append(
      el('div', { class: 'grid2' },
        field('Từ chương', numInput(l.from ?? 1, (v) => { l.from = Math.max(1, Math.round(v) || 1); changed(); }, { min: 1, step: 1 })),
        field('Tới chương', numInput(l.to ?? NaN, (v) => { l.to = Number.isFinite(v) ? Math.max(1, Math.round(v)) : null; changed(); }, { min: 1, step: 1 }), { hint: 'Bỏ trống = tới hết truyện (vd quan hệ đổ vỡ ở chương 4 thì ghi 3).' })),
      field('', checkInput(l.secret, (v) => { l.secret = v; changed(); }, '🔒 Bí mật — người chơi chưa biết quan hệ này (thoại chưa được lộ)')),
      field('Ghi chú cho thoại / truyện', areaInput(l.notes, (v) => { l.notes = v; changed(); }, 3), { hint: 'Giọng nói, chuyện cũ giữa 2 người, khi nào lộ bí mật…' }),
    );
    const pl = l.a === PLAYER ? 'ab' : l.b === PLAYER ? 'ba' : null;
    if (pl) {
      const other = pl === 'ab' ? B : A, os = pl === 'ab' ? l.ba : l.ab;
      side.append(el('div', { class: 'rl-note' }, `Trong game: câu thoại của ${other?.name} có {toi} / {ban} sẽ thành "${os?.self || '…'}" / "${os?.call || '…'}"; câu người chơi chọn có {minh} / {khach} thành "${l[pl]?.self || '…'}" / "${l[pl]?.call || '…'}".`));
    }
    side.append(el('div', { class: 'row' },
      button('⇄ Đổi chiều', () => { [l.a, l.b, l.ab, l.ba] = [l.b, l.a, l.ba, l.ab]; changed({ panel: true }); }, 'small'),
      button('🗑 Xóa dây', () => removeSel(), 'danger small')));
  }
  const feelText = (v) => ({ '-3': '−3 thù', '-2': '−2 ghét', '-1': '−1 không ưa', 0: '0 bình thường', 1: '+1 quý', 2: '+2 thân', 3: '+3 rất thân' })[v] ?? String(v);

  // ----- loại dây -----
  function typesPanel() {
    side.append(el('h3', {}, '🏷️ Loại dây'), el('p', { class: 'muted' }, 'Tên + màu dây. Loại đang dùng thì không xóa được.'));
    for (const [k, t] of Object.entries(types())) {
      const n = links().filter((l) => l.type === k).length;
      side.append(el('div', { class: 'rl-type' },
        colorInput(t.color, (v) => { if (/^#[0-9a-f]{6}$/i.test(v)) { t.color = v; changed(); } }),
        textInput(t.name, (v) => { t.name = v; changed(); }),
        el('small', { class: 'muted' }, `${n} dây`),
        button('🗑', () => { delete types()[k]; breakStep(hist); changed({ panel: true }); }, n ? 'small off' : 'small danger')));
    }
    side.append(button('＋ Loại dây mới', () => {
      let n = 1;
      while (types()[`loai${n}`]) n++;
      types()[`loai${n}`] = { name: `Loại ${n}`, color: '#16a085' };
      breakStep(hist);
      changed({ panel: true });
    }, 'small'));
  }

  // ----- kết quả kiểm tra -----
  function checkPanel() {
    const vis = S.issues.filter((i) => S.showIgnored || !ignored(i));
    const nIgn = S.issues.filter(ignored).length;
    const cnt = (lv) => S.issues.filter((i) => i.level === lv && !ignored(i)).length;
    side.append(el('h3', {}, '✅ Kết quả kiểm tra', S.checkedAt ? el('small', { class: 'muted' }, ` lúc ${S.checkedAt.toTimeString().slice(0, 5)}`) : null),
      el('div', { class: 'rl-sum' }, el('span', { class: 'err' }, `${cnt('error')} lỗi`), el('span', { class: 'wrn' }, `${cnt('warn')} cảnh báo`), el('span', { class: 'inf' }, `${cnt('info')} gợi ý`)));
    if (!vis.length && !(rel().notes || []).length) side.append(el('p', {}, '🎉 Không còn gì cần sửa.'));
    for (const lv of Object.keys(LEVELS)) {
      const list = vis.filter((i) => i.level === lv);
      if (!list.length) continue;
      side.append(el('div', { class: 'rl-grp' }, LEVELS[lv][0]));
      for (const i of list) side.append(issueRow(i));
    }
    const notes = rel().notes || [];
    if (notes.length) {
      side.append(el('div', { class: 'rl-grp' }, '📝 Ghi chú của Claude'));
      notes.forEach((n, k) => side.append(el('div', { class: 'rl-iss cl' }, el('b', {}, n.text),
        el('div', { class: 'acts' },
          n.ref ? button('Nhảy tới', () => jump(n.ref), 'small') : null,
          button('Đã sửa xong', () => { notes.splice(k, 1); breakStep(hist); changed({ panel: true }); }, 'small')))));
    }
    if (nIgn) side.append(el('p', { class: 'muted' }, `Đã bỏ qua ${nIgn} mục. `, el('a', { href: '#', onclick: (e) => { e.preventDefault(); S.showIgnored = !S.showIgnored; drawSide(); } }, S.showIgnored ? 'Ẩn lại' : 'Hiện lại')));
  }
  function issueRow(i) {
    const ign = ignored(i);
    return el('div', { class: `rl-iss ${LEVELS[i.level][1]}${ign ? ' ign' : ''}` }, el('b', {}, i.msg),
      el('div', { class: 'acts' },
        i.ref ? button('Nhảy tới', () => jump(i.ref, i.field), 'small') : null,
        i.level === 'error' ? null : button(ign ? 'Bỏ "bỏ qua"' : 'Bỏ qua', () => {
          const list = rel().ignore;
          if (ign) rel().ignore = list.filter((x) => `${x.ref}|${x.msg}` !== issueKey(i));
          else list.push({ ref: i.ref, msg: i.msg });
          breakStep(hist);
          changed({ panel: true });
        }, 'small')));
  }
  function jump(ref, fieldKey = '') {
    const [kind, id] = String(ref).split(':');
    if (kind === 'char' && C(id)) {
      const tab = ['look', 'outfits'].includes(fieldKey) ? 'look' : fieldKey === 'links' ? 'links' : 'profile';
      select({ kind: 'char', id }, { center: true, tab });
      if (fieldKey === 'rename') renameDialog(id);
    } else if (kind === 'link' && linkById(id)) select({ kind: 'link', id }, { center: true });
    else if (kind === 'type') { S.panel = 'types'; drawSide(); }
  }

  // ---------- lưu ----------
  async function readLatest(path) {
    const r = await fetch(`/__editor/read?path=${encodeURIComponent(path)}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    return JSON.parse(j.content);
  }
  async function save() {
    runCheck();
    const errs = S.issues.filter((i) => i.level === 'error').length;
    if (errs && !confirm(`Còn ${errs} lỗi (xem ✅ Kiểm tra). Vẫn lưu?`)) return;
    const files = [{ path: 'src/data/relations.json', content: JSON.stringify(rel(), null, 2) + '\n' }];
    try {
      // tab khác / ?editor / Claude vừa lưu relations.json sau lúc mở trang này → hỏi trước khi ghi đè
      const disk = JSON.stringify(await readLatest('src/data/relations.json'));
      if (disk !== relDisk && !confirm('Sơ đồ quan hệ vừa được lưu ở chỗ khác (tab khác, Claude…) sau lúc bạn mở trang này.\nLưu bây giờ sẽ GHI ĐÈ bản đó. Vẫn lưu?\n(Bấm Hủy rồi tải lại trang để lấy bản mới — mất chỗ chưa lưu.)')) return;
      // "Đưa vào cốt truyện": chỉ gộp phần mình thêm vào bản mới nhất trên đĩa (không đè thay đổi của ?editor)
      if (touched.places.size) {
        const pl = await readLatest('src/data/places.json'), before = JSON.stringify(pl);
        for (const id of touched.places) {
          const mine = placeById(id)?.npc, t = pl.places.find((p) => p.id === id)?.npc;
          if (mine && t) for (const k of ['name', 'portrait', 'gender']) { if (mine[k] == null) delete t[k]; else t[k] = mine[k]; }
          const P = placeById(id), T = pl.places.find((p) => p.id === id);
          if (P && T) for (const k of PLACE_TEXT) if (P[k] != null) T[k] = P[k]; // tên / biển hiệu địa điểm (✏️ Đổi tên khắp nơi)
        }
        if (JSON.stringify(pl) !== before) files.push({ path: 'src/data/places.json', content: JSON.stringify(pl, null, 2) + '\n' });
      }
      if (touched.story.size) {
        const st = await readLatest('src/data/story.json'), before = JSON.stringify(st);
        for (const id of touched.story) for (const tb of ['contacts', 'people']) {
          const mine = data.story[tb]?.[id];
          if (!mine) continue;
          st[tb] ||= {};
          st[tb][id] = st[tb][id] ? { ...st[tb][id], icon: mine.icon, name: mine.name } : mine;
        }
        if (JSON.stringify(st) !== before) files.push({ path: 'src/data/story.json', content: JSON.stringify(st, null, 2) + '\n' }); // đã hoàn tác thì thôi
      }
      if (touched.content.size) {
        const ct = await readLatest('src/content/vi.json'), before = JSON.stringify(ct);
        for (const k of touched.content) if (data.content[k] != null) ct[k] = data.content[k];
        if (JSON.stringify(ct) !== before) files.push({ path: 'src/content/vi.json', content: JSON.stringify(ct, null, 2) + '\n' });
      }
      const r = await fetch('/__editor/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files, source: 'relationship' }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      for (const k of KEYS) base[k] = JSON.stringify(data[k]);
      for (const t of Object.values(touched)) t.clear();
      lastSave = Date.now();
      relDisk = JSON.stringify(rel());
      banner_(`💾 Đã lưu ${j.written.join(', ')}. Nhắn Claude để áp dụng vào truyện / thoại.`, 'ok', 5000);
      drawBar();
    } catch (e) {
      console.error('[relationship] lưu thất bại', e);
      // không có máy chủ dev (bản build): tải file về để tự chép vào src/data/
      const blob = new Blob([files[0].content], { type: 'application/json' });
      const a = el('a', { href: URL.createObjectURL(blob), download: 'relations.json' });
      a.click();
      banner_(`Không ghi thẳng được (${e.message}). Đã tải relations.json về — chép vào src/data/ (chạy npm run dev để lưu thẳng).`, 'err', 9000);
    }
  }
  let lastSave = 0;
  // file bị sửa từ bên ngoài (Claude sửa relations.json…): chưa sửa gì thì tải lại, đang sửa dở thì báo
  if (import.meta.hot) import.meta.hot.on('shipper:data-changed', ({ file, source } = {}) => {
    if (!['src/data/relations.json', 'src/data/story.json', 'src/content/vi.json', 'src/data/places.json', 'src/data/goods.json'].includes(file) || source === 'relationship' || Date.now() - lastSave < 3000) return;
    if (!dirty()) location.reload();
    else banner_(`⚠️ ${file} vừa được sửa ở chỗ khác. Lưu bản của bạn sẽ ghi đè phần quan hệ; muốn lấy bản mới thì tải lại trang (mất chỗ chưa lưu).`, 'warn', 0);
  });
  addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- phím tắt ----------
  addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, textarea, select');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(e.shiftKey); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doUndo(true); }
    else if (e.key === 'Delete') removeSel();
    else if (e.key === 'Escape') { S.connect = null; drawBar(); select(null); }
  });

  function drawAll() {
    drawBar();
    drawBoard();
    drawSide();
  }
  drawAll();
  runCheck();
  if (firstOpen) setTimeout(fit, 0);
  const openHash = () => {
    const add = /^#add=(place|story):(.+)$/.exec(decodeURIComponent(location.hash || ''));
    if (add) {
      const [, kind, gid] = add;
      const has = Object.keys(chars()).find((k) => chars()[k][kind] === gid);
      if (has) return setTimeout(() => select({ kind: 'char', id: has }, { center: true, tab: 'profile' }), 0);
      const c = { [kind]: gid, ...viewCenter() };
      if (kind === 'place' && placeById(gid)?.npc) Object.assign(c, { name: placeById(gid).npc.name });
      if (kind === 'story') Object.assign(c, { name: storyName(gid) });
      pullFromGame(c);
      history.replaceState(null, '', `#${kind}=${gid}`);
      return addChar(c);
    }
    const m = /^#(char|place|story)=(.+)$/.exec(decodeURIComponent(location.hash || ''));
    if (!m) return;
    const id = m[1] === 'char' ? (C(m[2]) ? m[2] : null) : Object.keys(chars()).find((k) => chars()[k][m[1]] === m[2]);
    if (id) setTimeout(() => select({ kind: 'char', id }, { center: true, tab: 'profile' }), 0);
    else banner_(`Chưa có nhân vật nào gắn với ${m[1] === 'place' ? 'NPC địa điểm' : 'người trong cốt truyện'} "${m[2]}" — bấm ＋ Lấy từ game để thêm.`, 'info', 7000);
  };
  openHash();
  addEventListener('hashchange', openHash);
  if (renamed.length) banner_(`🔗 Tên trong danh bạ cốt truyện đã đổi theo tên NPC: ${renamed.join(', ')}. Bấm 💾 Lưu để ghi vào game.`, 'info', 0);
}
