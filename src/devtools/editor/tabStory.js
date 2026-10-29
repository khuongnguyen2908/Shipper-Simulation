// Thẻ 📖 CỐT TRUYỆN (src/data/story.json): chương → các bước. Mỗi bước: việc làm khi vào bước (tin nhắn, hội thoại…),
// điều kiện xong bước, nói chuyện ở địa điểm, mục tiêu trên màn hình, hướng dẫn trên điện thoại.
// Câu chữ gõ ngay tại đây — lưu vào kho chữ vi.json (khóa story.*), sửa ở đây hay ở thẻ 💬 Chữ & hội thoại đều được.
// Bộ chạy: src/sim/story.js · hiển thị: game.js (runStoryActions, storyGoal, storyGuide).
import { relBox } from './relBox.js';
import { UNTIL, ACTIONS, GUIDES, HUD_PARTS, ORDER_STAGES, GUIDE_BTNS, ACTOR_LOOKS, ACTOR_SPOTS, ACTOR_VEHICLES, REACT_ICONS, TRAITS as PERSONAS, PROP_KINDS, ROUTE_ACTS, CHASE_BIKES } from '../../sim/story.js';
import { SOUNDS } from '../../data/soundSpec.js';
import { APP_DEFS } from '../../data/phoneApps.js';
import relationsJson from '../../data/relations.json' with { type: 'json' }; // sơ đồ quan hệ (/?relationship) — chỉ đọc: bộ đồ nhân vật
import { isPlaced } from '../../data/places.js';
import { ID_RE } from '../../data/validate.js';
import { ambushSolutions, roundDef, roundNb } from '../../sim/ambush.js';
import { neighbors } from '../../sim/cityLayout.js';
import { ZONES } from '../../sim/zones.js';
import { BOSS_STEPS, SKILL_DEFAULT } from '../../sim/fight.js';
import { KIND_DEFAULT } from '../../sim/race.js';
import { el, field, textInput, numInput, button, sideList, selectInput, emojiInput, areaInput, checkInput, explain, subTabs } from './ui.js';

const TRAITS = [['fragile', '⚠️ Dễ vỡ'], ['hot', '🔥 Nóng'], ['cold', '❄️ Lạnh'], ['liquid', '💧 Nước']];

// Danh sách "＋ Thêm việc" / "Xong bước khi" chia nhóm. Mục không có ở đây (say, give, fuel · read, talk) là kiểu cũ / chưa ai dùng:
// không cho thêm mới, nhưng bước đang dùng thì vẫn hiện + sửa được (nhóm "Kiểu cũ"). Bộ chạy (sim/story.js) vẫn hiểu hết.
const ACTION_GROUPS = [
  ['💬 Thoại & tin nhắn', ['bubble', 'choose', 'msg', 'replies']],
  ['🧍 Người lạ', ['actor', 'approach', 'leave', 'board', 'alight', 'react', 'rename', 'dismount', 'helmetOff', 'helmetOn', 'wave', 'rideOff']],
  ['🎬 Cảnh & hành động', ['title', 'cine', 'chase', 'prop', 'tackle', 'sneak', 'pursue', 'fade', 'phoneCall', 'traffic', 'sound', 'ambush', 'ambushCrew', 'ship', 'zone', 'tie', 'untie', 'fpv', 'fight', 'race']],
  ['📦 Đồ & đơn', ['item', 'drop', 'offer', 'pay', 'bike']],
  ['📱 Điện thoại & khác', ['openPhone', 'closePhone', 'phone', 'ttPost', 'block', 'toast', 'end']],
];
// 3 việc người lạ rời cảnh (bộ chạy giữ nguyên 3 mã) → trong công cụ là 1 mục, chọn cách rời
const LEAVE_KINDS = [['remove', 'Biến mất ngay'], ['leave', 'Bỏ chạy ra xa rồi biến mất'], ['goto', 'Đi / chạy vào địa điểm … rồi biến mất']];
const LEAVE_LABEL = '🚶 Người lạ rời cảnh (biến mất / bỏ chạy / đi vào địa điểm)';
const UNTIL_GROUPS = [
  ['🧍 Người lạ & nói chuyện', ['talkActor', 'chosen', 'near', 'bring', 'chased']],
  ['💬 Tin nhắn & app', ['open', 'reply', 'routed', 'ttSeen']],
  ['🗺️ Di chuyển', ['arrive', 'reach', 'mount', 'away', 'useAt']],
  ['📦 Đơn & xe', ['ordersSince', 'order', 'switch', 'fuel', 'brand', 'wear', 'use']],
  ['⏱️ Thời gian & cảnh', ['wait', 'clock', 'newDay', 'cine', 'tackled', 'sneaked', 'hidden', 'escaped', 'ambushed', 'untied', 'fightWon', 'raceWon', 'kitCard', 'ack']],
  ['Khác', ['none', 'never']],
];
const HIDDEN_GUIDES = ['reply']; // chưa chương nào dùng

// Biểu tượng nhỏ cho danh sách bước: bước này có gì (người lạ, thoại, mục tiêu, dấu, hạn giờ, dí, cảnh phim)
function stepBadges(st) {
  const on = (st.on || []).map((a) => a.do);
  const b = [
    on.includes('title') && '🎬', on.includes('actor') && '🧍', on.some((d) => ['bubble', 'choose', 'msg', 'replies', 'say'].includes(d)) && '💬',
    st.goal && '🎯', st.mark && '❗', st.deadline && '⏰', on.includes('chase') && '🏍️', on.includes('prop') && '🚛', on.includes('cine') && '🎥', on.includes('end') && '🏁',
  ].filter(Boolean);
  return b.length ? `  ${b.join('')}` : '';
}
// Ô chọn có nhóm (optgroup). groups = [[tên nhóm, [[mã, chữ]…]]…] · mục đang chọn mà không nằm trong nhóm nào → thêm nhóm "Kiểu cũ"
function groupSelect(value, first, groups, onChange, allLabels = null) {
  const s = el('select', { onchange: (e) => onChange(e.target.value) });
  if (first) s.append(el('option', { value: '' }, first));
  const listed = new Set(groups.flatMap(([, list]) => list.map(([v]) => v)));
  for (const [g, list] of groups) s.append(el('optgroup', { label: g }, list.map(([v, label]) => el('option', { value: v, selected: String(v) === String(value) }, label))));
  if (value && !listed.has(value)) s.append(el('optgroup', { label: 'Kiểu cũ (đang dùng)' }, el('option', { value, selected: true }, allLabels?.[value] || value)));
  return s;
}

// Mã lỗi (validate.js → ref) → mục cần mở bên trái
export function selOf(ref) {
  const r = String(ref || '');
  if (/^(contact|item|parcel|spot):/.test(r)) return 'people';
  const [ch, st] = r.split('.');
  return st ? `${ch}/${st}` : ch ? `ch:${ch}` : 'people';
}

export function render(root, ctx) {
  const data = (ctx.data.story = ctx.data.story || {});
  data.contacts = data.contacts || {};
  data.people = data.people || {};
  data.items = data.items || {};
  data.parcels = data.parcels || {};
  data.spots = data.spots || {};
  data.chapters = data.chapters || [];
  const sel = (ctx.sel.story = ctx.sel.story || {});
  const C = ctx.data.content;
  const changed = () => ctx.changed('story');
  const issues = (ref) => ctx.issuesFor('story', ref);

  // ---------- câu chữ: ô nhập ghi thẳng vào vi.json ----------
  // Khóa mới: story.<chương>.<bước>.<tên> (trùng thì thêm số)
  const newKey = (base) => {
    let k = base, n = 2;
    while (C[k] !== undefined) k = `${base}${n++}`;
    C[k] = '';
    ctx.changed('content');
    return k;
  };
  const textBox = (label, key, rows = 2, opts = {}) => field(label, areaInput(C[key] ?? '', (v) => { C[key] = v; ctx.changed('content'); }, rows), { hint: `${opts.hint ? `${opts.hint} · ` : ''}khóa chữ: ${key}`, wide: true, ref: opts.ref, fieldKey: opts.fieldKey });

  // ---------- danh sách chọn ----------
  const placeOpts = ctx.data.places.places.filter((p) => isPlaced(p)).sort((a, b) => a.name.localeCompare(b.name)).map((p) => [p.id, `${p.name} (${p.id})`]);
  // chỗ hẹn theo tọa độ (📍 trong tin nhắn, mũi tên, điều kiện "Đã bấm 📍") — mã 'spot:<mã>'
  const spotOpts = () => Object.entries(data.spots || {}).map(([id, x]) => [`spot:${id}`, `📍 ${C[x.name] || id} (chỗ hẹn)`]);
  const contactOpts = Object.entries(data.contacts).map(([id, c]) => [id, `${c.icon || ''} ${C[c.name] || id}`]);
  // đạo cụ trong chương đang xem (mã) — mũi tên / dấu / điều kiện núp chỉ vào đạo cụ
  const propOpts = () => (data.chapters.find((c) => c.id === sel.ch)?.steps || []).flatMap((x) => (x.on || []).filter((a) => a.do === 'prop' && a.id)).map((a) => [a.id, `${PROP_KINDS[a.kind] || a.kind} (${a.id})`]);
  const binOpts = () => (data.chapters.find((c) => c.id === sel.ch)?.steps || []).flatMap((x) => (x.on || []).filter((a) => a.do === 'prop' && (a.kind === 'bin' || a.kind === 'mark') && a.id)).map((a) => [a.id, `${a.kind === 'bin' ? '🗑️' : '📍'} ${a.id}`]);
  const ttOpts = () => (data.chapters.find((c) => c.id === sel.ch)?.steps || []).flatMap((x) => (x.on || []).filter((a) => a.do === 'ttPost' && a.id)).map((a) => [a.id, `📱 ${a.id}`]);
  const FIXED_PROPS = ['ramp', 'easel', 'bin', 'can', 'water', 'bigbike', 'mark', 'bag']; // đạo cụ đặt cố định (không chạy theo đường)
  const actorOpts = () => Object.entries(data.people).map(([id, c]) => [id, `${c.icon || ''} ${C[c.name] || id}`]); // người lạ (story.json → people)
  // người nói được: người lạ + NPC đứng ở địa điểm ('place:<mã>', vd sư cô ở chùa, bảo vệ trường)
  const policeOpts = () => (data.chapters.find((c) => c.id === sel.ch)?.steps || []).flatMap((x) => x.on || []).filter((y) => y.do === 'prop' && y.kind === 'police' && y.id).map((y) => [`prop:${y.id}`, `👮 Công an (xe ${y.id})`]);
  const speakerOpts2 = () => [...actorOpts(), ...policeOpts(), ...ctx.data.places.places.filter((p) => isPlaced(p) && p.npc).sort((a, b) => a.name.localeCompare(b.name)).map((p) => [`place:${p.id}`, `🏠 ${p.npc.name} — ${p.name}`])];
  // NPC địa điểm vắng mặt (hideNpc): các địa điểm có NPC đứng ở cửa — ô tick
  const npcChips = (obj, onChange) => {
    const cur = new Set(obj.hideNpc || []);
    return el('div', { class: 'chips' }, ctx.data.places.places.filter((p) => isPlaced(p) && p.npc).sort((a, b) => a.name.localeCompare(b.name)).map((p) => checkInput(cur.has(p.id), (on) => {
      if (on) cur.add(p.id); else cur.delete(p.id);
      if (cur.size) obj.hideNpc = [...cur]; else delete obj.hideNpc;
      onChange();
    }, `${p.npc.name} — ${p.name}`)));
  };
  const speakerOpts = [...Object.entries(data.people).map(([id, c]) => [id, `${c.icon || ''} ${C[c.name] || id}`]), ...contactOpts];
  const goodsOpts = Object.values(ctx.data.goods).filter((g) => g.type === 'consumable' || g.type === 'carry').map((g) => [g.id, `${g.icon || ''} ${g.name}`]);
  const parcelOpts = [['', '— Không —'], ...Object.entries(data.parcels).map(([id, p]) => [id, `${p.icon || ''} ${C[p.name] || id}`])];

  // ---------- bên trái ----------
  const rows = [{ id: 'people', icon: '👥', title: 'Danh bạ · người nói · vật phẩm', sub: `${Object.keys(data.contacts).length} người nhắn`, fixed: true },
    { id: 'fight', icon: '⚔️', title: 'Đánh nhau: vũ khí · kiểu địch · trận', sub: `${Object.keys(data.fights || {}).length} trận`, fixed: true },
    { id: 'race', icon: '🏍️', title: 'Màn đua thoát thân', sub: `${Object.keys(data.races || {}).length} màn`, fixed: true }];
  for (const ch of data.chapters) {
    rows.push({ id: `ch:${ch.id}`, icon: '📖', title: `${C[ch.title] || ch.id}: ${C[ch.name] || ''}`, sub: `${(ch.steps || []).length} bước`, fixed: true });
    (ch.steps || []).forEach((st, i) => rows.push({ id: `${ch.id}/${st.id}`, icon: `${i + 1}.`, title: C[st.goal] || st.id, sub: `${st.id} · ${UNTIL[st.until?.type || 'none']?.split(' (')[0] || ''}${stepBadges(st)}`, fixed: true }));
  }
  if (!rows.some((r) => r.id === sel.id)) sel.id = rows[1]?.id || 'people';
  const side = el('aside', { class: 'ed-side' });
  const drawSide = () => {
    side.innerHTML = '';
    side.append(
      el('div', { class: 'side-head' }, el('b', {}, `${data.chapters.length} chương`), button('＋ Chương mới', addChapter, 'small')),
      sideList(rows, sel.id, (id) => ctx.select('story', { id }), {
        key: 'story',
        issuesFor: (id) => (id === 'people' ? ctx.issues.filter((i) => i.tab === 'story' && /^(contact|item|parcel|spot):/.test(i.ref))
          : id === 'fight' ? ctx.issues.filter((i) => i.tab === 'story' && /^(weapon|foe|fight):/.test(i.ref))
          : id === 'race' ? ctx.issues.filter((i) => i.tab === 'story' && /^race:/.test(i.ref))
          : id.startsWith('ch:') ? issues(id.slice(3)) : issues(id.replace('/', '.'))),
      }),
    );
  };
  drawSide();
  ctx.refreshSide = drawSide;
  const body = el('section', { class: 'ed-body' });
  root.append(el('div', { class: 'ed-split' }, side, body));

  function addChapter() {
    const n = data.chapters.length + 1;
    let id = `c${n}`;
    while (data.chapters.some((c) => c.id === id)) id += 'b';
    data.chapters.push({ id, title: newKey(`story.${id}.title`), name: newKey(`story.${id}.name`), steps: [] });
    C[`story.${id}.title`] = `Chương ${n}`;
    changed();
    ctx.select('story', { id: `ch:${id}` });
  }

  if (sel.id === 'people') return renderPeople();
  if (sel.id === 'fight') return renderFight();
  if (sel.id === 'race') return renderRace();
  if (sel.id.startsWith('ch:')) return renderChapter(data.chapters.find((c) => c.id === sel.id.slice(3)));
  const [chId, stId] = sel.id.split('/');
  const ch = data.chapters.find((c) => c.id === chId);
  return renderStep(ch, ch?.steps.find((s) => s.id === stId));

  // Mã các việc "Chọn câu trả lời" trong chương đang mở (cho điều kiện "Đã chọn câu trả lời")
  function chooseIds() {
    return [...new Set((ch?.steps || []).flatMap((x) => (x.on || []).filter((a) => a.do === 'choose').map((a) => a.id)))];
  }
  // Chọn nhiều gói hàng (talk.pack / talk.drop): mảng mã gói
  function parcelChips(t, key) {
    const cur = new Set([].concat(t[key] || []));
    return el('div', { class: 'chips' }, Object.entries(data.parcels).map(([id, x]) => checkInput(cur.has(id), (on) => {
      if (on) cur.add(id); else cur.delete(id);
      if (cur.size) t[key] = [...cur]; else delete t[key];
      changed();
    }, `${x.icon || ''} ${C[x.name] || id}${Object.values(data.parcels).filter((y) => y.name === x.name).length > 1 ? ` (${id})` : ''}`))); // trùng tên (3 bức tranh) → kèm mã
  }

  // ======================== CHƯƠNG ========================
  function renderChapter(ch) {
    if (!ch) return;
    body.append(
      el('div', { class: 'body-head' }, el('h2', {}, `📖 ${C[ch.title] || ch.id}`)),
      explain(['Cốt truyện chạy thế nào', `<p>Mỗi chương là một chuỗi <b>bước</b>, chạy lần lượt từ trên xuống. Vào một bước: game làm các <b>việc</b> của bước đó (gửi tin nhắn, hiện hội thoại, cho đồ…), rồi chờ tới khi <b>điều kiện xong</b> đúng thì sang bước sau.</p>
        <p>Trong lúc chờ, màn hình hiện <b>mục tiêu</b> của bước (mũi tên chỉ tới địa điểm nếu có), điện thoại làm sáng nút cần bấm (<b>hướng dẫn</b>). Hướng dẫn chữ có nút Tiếp / Đã rõ.</p>
        <p>Chương 1 bắt đầu sau màn "tới thành phố" khi chơi mới. Hết bước có việc "Kết thúc chương" → hiện chữ hoàn thành, lưu game, sang chương sau.</p>
        <p>Từ bước hiện tên chương tới hết chương: <b>không có đơn thường</b> (chỉ đơn do cốt truyện mời). Mỗi bước chia 3 thẻ con: 🎬 Diễn biến · 👀 Người chơi thấy gì · ⚙️ Luật trong bước.</p>
        <p>Chơi nhiều người: cốt truyện là của riêng từng người, đồng hồ vẫn chạy chung.</p>`]),
      el('div', { class: 'grid' },
        textBox('Tên chương (vd "Chương 1")', ch.title, 1),
        textBox('Tên phụ (vd "Cuộc sống mới, công việc mới")', ch.name, 1),
      ),
      field('NPC vắng mặt cả chương', npcChips(ch, changed), { ref: ch.id, fieldKey: 'hideNpc', wide: true, hint: 'NPC đứng ở cửa các địa điểm này không có mặt suốt chương (vd chị Linh chưa ra tiệm trà trước 8h). Người lạ đang có mặt mà là nhân vật của NPC đó (sơ đồ quan hệ) thì NPC cũng tự vắng, khỏi bị 2 người giống nhau.' }),
      el('div', { class: 'row' }, button('＋ Thêm bước', () => addStep(ch, ch.steps.length)), button('🗑 Xóa chương', () => {
        if (!confirm(`Xóa ${C[ch.title] || ch.id} và mọi bước của nó?`)) return;
        data.chapters.splice(data.chapters.indexOf(ch), 1);
        changed();
        ctx.select('story', { id: 'people' });
      }, 'danger small')),
    );
  }

  function addStep(ch, at) {
    let id = `b${ch.steps.length + 1}`;
    while (ch.steps.some((s) => s.id === id)) id += 'x';
    ch.steps.splice(at, 0, { id, until: { type: 'none' } });
    changed();
    ctx.select('story', { id: `${ch.id}/${id}` });
  }

  // ======================== BƯỚC ========================
  function renderStep(ch, st) {
    if (!ch || !st) return;
    const i = ch.steps.indexOf(st), ref = `${ch.id}.${st.id}`;
    const base = `story.${ch.id}.${st.id}`;
    const opt = (fieldKey, extra = {}) => ({ ref, fieldKey, ...extra });
    const rerender = () => { changed(); ctx.rerender(); };
    body.append(
      el('div', { class: 'body-head' }, el('h2', {}, `${C[ch.title] || ch.id} · bước ${i + 1}: ${st.id}`),
        el('div', { class: 'row' },
          button('↑', () => { if (i > 0) { ch.steps.splice(i - 1, 0, ch.steps.splice(i, 1)[0]); rerender(); } }, 'small'),
          button('↓', () => { if (i < ch.steps.length - 1) { ch.steps.splice(i + 1, 0, ch.steps.splice(i, 1)[0]); rerender(); } }, 'small'),
          button('＋ Bước sau', () => addStep(ch, i + 1), 'small'),
          button('🗑 Xóa bước', () => { if (confirm(`Xóa bước ${st.id}?`)) { ch.steps.splice(i, 1); changed(); ctx.select('story', { id: `ch:${ch.id}` }); } }, 'danger small'))),
      el('div', { class: 'grid' },
        field('Mã bước', textInput(st.id, (v) => { if (ID_RE.test(v) && !ch.steps.some((s) => s !== st && s.id === v)) { st.id = v; sel.id = `${ch.id}/${v}`; changed(); } }), opt('id', { hint: 'Chữ không dấu, số, gạch dưới. Không trùng trong chương.' })),
        field('Chờ trước khi làm (phút game)', numInput(st.delay ?? 0, (v) => { if (v > 0) st.delay = v; else delete st.delay; changed(); }, { step: 1, min: 0 }), opt('delay', { hint: '1 phút game = 1 giây thật. Vd tin nhắn tới sau 2–3 giây cho giống thật.' })),
      ),
    );
    // bước đã sau tên chương → đơn tự khóa (sim/story.js inChapter); ô "Chặn đơn thường" chỉ cần ở bước trước tên chương
    const titleAt = ch.steps.findIndex((x) => (x.on || []).some((a) => a.do === 'title'));
    const afterTitle = titleAt >= 0 && i >= titleAt;
    // 3 thẻ con: 🎬 Diễn biến · 👀 Người chơi thấy gì · ⚙️ Luật trong bước (số = đã đặt bao nhiêu thứ)
    const nFlow = (st.on || []).length + (st.until?.type && st.until.type !== 'none' ? 1 : 0);
    const nShow = [st.goal, st.guide, st.mark, st.zone, st.talkLabel].filter(Boolean).length;
    const nRules = [st.orders, st.hold && !afterTitle, st.noFines, st.leash, st.keepOut, st.deadline, st.music, st.onlyTrait, st.onlyBefore != null || st.onlyAfter != null, st.hideNpc?.length].filter(Boolean).length;
    const T = subTabs('storyStep', [['flow', `🎬 Diễn biến (${nFlow})`], ['show', `👀 Người chơi thấy gì (${nShow})`], ['rules', `⚙️ Luật trong bước (${nRules})`]]);
    body.append(T.el);
    // khung hiếm dùng: chưa đặt gì thì thu gọn (bấm để mở)
    const fold = (title, used, ...kids) => {
      const d = el('details', { class: 'card story-fold', open: !!used }, el('summary', {}, el('h3', {}, title), used ? null : el('small', { class: 'muted' }, ' · chưa dùng — bấm để mở')), ...kids);
      return d;
    };
    T.pane('rules').append(
      afterTitle
        ? el('div', { class: 'story-auto' }, '📦 Đơn hàng: ', el('b', {}, 'tự động khóa'), ' — bước này ở sau tên chương (đang trong chương: chỉ có đơn của cốt truyện).')
        : field('', checkInput(st.hold, (v) => { if (v) st.hold = true; else delete st.hold; changed(); }, 'Chặn đơn thường trong bước này'), opt('hold', { hint: 'Bước trước tên chương: app chưa phát đơn mới trong lúc chờ bước này (để hướng dẫn / cuốc cốt truyện không bị đơn khác chen vào). Sau tên chương thì tự khóa.' })),
      el('div', { class: 'grid' },
        field('', checkInput(!!st.orders, (v) => { if (v) st.orders = true; else delete st.orders; changed(); }, '🛵 Cho chạy đơn trong lúc chờ'), opt('orders', { hint: 'Bước chờ tới giờ (vd chờ 8h, chờ ngủ qua đêm): app vẫn phát đơn thường. Hết bước này mà đang chạy đơn thì cốt truyện chờ giao xong mới tiếp (nhắc mỗi 30 giây).' })),
        field('Nhạc riêng trong bước này', selectInput(st.music || '', [['', '— Nhạc ngày / đêm như thường —'], ...Object.values(SOUNDS).filter((x) => x.kind === 'music' && x.id !== 'music.menu').map((x) => [x.id, `${x.label} (${x.id})`])], (v) => { if (v) st.music = v; else delete st.music; changed(); }), opt('music', { hint: 'Thay nhạc ngày / đêm trong lúc chờ bước này. Các bước liền nhau cùng nhạc thì phát liền mạch. Gắn file ở thẻ 🔊 Âm thanh — mã chưa có file thì vẫn nhạc ngày / đêm. Mã nhạc mới: nhờ Claude thêm vào soundSpec.js.' })),
        field('Chỉ chạy trước giờ', numInput(st.onlyBefore ?? 0, (v) => { if (v > 0) st.onlyBefore = v; else delete st.onlyBefore; changed(); }, { step: 0.05, min: 0, max: 24 }), opt('onlyBefore', { hint: 'Vd 9.83 (= 9h50): tới bước này mà đã quá giờ thì bỏ qua bước. Dùng cặp với "chỉ chạy từ giờ" để có 2 câu: kịp giờ / trễ giờ. 0 = không.' })),
        field('Chỉ chạy từ giờ', numInput(st.onlyAfter ?? 0, (v) => { if (v > 0) st.onlyAfter = v; else delete st.onlyAfter; changed(); }, { step: 0.05, min: 0, max: 24 }), opt('onlyAfter', { hint: 'Tới bước này mà chưa tới giờ thì bỏ qua bước. 0 = không.' })),
        field('Chỉ chạy khi tính cách', selectInput(st.onlyTrait || '', [['', '— Mọi tính cách —'], ...Object.keys(PERSONAS).map((t) => [t, `đang nghiêng về ${C[`story.trait.${t}`] || t}`])], (v) => { if (v) st.onlyTrait = v; else delete st.onlyTrait; changed(); }), opt('onlyTrait', { hint: 'Nội dung riêng của 1 tính cách: người chơi đang nghiêng về tính cách khác thì bỏ qua bước này (đi thẳng sang bước sau). Nghiêng = tính cách nhiều điểm nhất, bằng nhau → trung lập.' })),
        field('', checkInput(!!st.noFines, (v) => { if (v) st.noFines = true; else delete st.noFines; changed(); }, '🚫 Không bị phạt trong bước này'), opt('noFines', { hint: 'CSGT cho qua, không dán phạt / cẩu xe, vượt đèn không bị ghi (vd đang đuổi theo tên cướp).' }))),
    );

    // ---------- việc làm khi vào bước ----------
    st.on = st.on || [];
    const acts = el('div', { class: 'card' }, el('h3', {}, '▶️ Khi vào bước, làm lần lượt'));
    st.on.forEach((a, k) => acts.append(actionRow(st, a, k, base, rerender, opt)));
    acts.append(el('div', { class: 'row' }, groupSelect('', '＋ Thêm việc…', ACTION_GROUPS.map(([g, ids]) => [g, ids.map((id) => [id, id === 'leave' ? LEAVE_LABEL : ACTIONS[id]])]), (v) => {
      if (!v) return;
      const a = { do: v };
      if (v === 'say') Object.assign(a, { who: speakerOpts[0]?.[0] || '', text: newKey(`${base}.say`) });
      if (['actor', 'approach', 'leave', 'remove', 'board', 'alight', 'goto', 'chase', 'rename', 'dismount', 'helmetOff', 'helmetOn', 'wave', 'rideOff', 'tackle', 'sneak'].includes(v)) a.who = Object.keys(data.people)[0] || '';
      if (v === 'prop') Object.assign(a, { id: `prop${(ch.steps || []).flatMap((x) => x.on || []).filter((y) => y.do === 'prop').length + 1}`, kind: 'ramp', at: [0, 0], heading: 0, len: 7, h: 1.5 });
      if (v === 'drop') a.id = Object.keys(data.parcels)[0] || '';
      if (v === 'goto') Object.assign(a, { place: placeOpts[0]?.[0] || '', run: true });
      if (v === 'approach') a.stop = true;
      if (v === 'tackle') Object.assign(a, { target: Object.keys(data.people).find((id) => id !== a.who) || '', qte: 2, text: 'story.qte.block' });
      if (v === 'fade') Object.assign(a, { text: newKey(`${base}.fade`), t: 2 });
      if (v === 'phoneCall') a.on = true;
      if (v === 'traffic') a.clear = 40;
      if (v === 'ship') Object.assign(a, { state: 'dock', at: [163, 265], heading: 0 });
      if (v === 'zone') Object.assign(a, { id: 'ship', at: 'captive', gate: false, door: false });
      if (v === 'phone') a.off = true;
      if (v === 'tie') Object.assign(a, { who: 'player', on: true });
      if (v === 'untie') Object.assign(a, { who: 'player', need: 14, text: 'story.qte.untie' });
      if (v === 'fpv') a.on = true;
      if (v === 'fight') a.id = Object.keys(data.fights || {})[0] || '';
      if (v === 'race') a.id = Object.keys(data.races || {})[0] || '';
      if (v === 'pursue') Object.assign(a, { who: [Object.keys(data.people)[0] || ''], speed: 4.6, delay: 0.8, lose: 30 });
      if (v === 'sneak') Object.assign(a, { route: [{ at: [0, 0] }, { at: [0, 10], look: 2 }], speed: 1.3, see: 11, lose: 24 });
      if (v === 'react') Object.assign(a, { who: [Object.keys(data.people)[0] || 'player'], icon: '!' });
      if (v === 'cine') a.shots = [{ at: 'player', t: 3, dist: 8, height: 3, angle: 180 }];
      if (v === 'chase') Object.assign(a, { look: 'jetjet', route: [{ place: placeOpts[0]?.[0] || '' }, { place: placeOpts[1]?.[0] || '' }], gap: 30, pct: 85, lose: 700, speed: 14, delay: 1, wheelie: true, revAt: 'pass' });
      if (v === 'sound') a.code = Object.keys(SOUNDS)[0];
      if (v === 'actor') Object.assign(a, { look: 'jetjet', spot: 'near', dist: 8 });
      if (v === 'bubble') Object.assign(a, { who: Object.keys(data.people)[0] || 'player', text: newKey(`${base}.bubble`) });
      if (v === 'choose') Object.assign(a, { id: `${st.id}Ask`, who: Object.keys(data.people)[0] || '', options: [newKey(`${base}.o1`), newKey(`${base}.o2`)], answers: [newKey(`${base}.a1`), newKey(`${base}.a2`)] });
      if (v === 'msg') Object.assign(a, { from: contactOpts[0]?.[0] || '', text: newKey(`${base}.m`) });
      if (v === 'replies') Object.assign(a, { who: contactOpts[0]?.[0] || '', texts: [newKey(`${base}.r1`), newKey(`${base}.r2`), newKey(`${base}.r3`)] });
      if (v === 'item') a.id = Object.keys(data.items)[0] || '';
      if (v === 'give') a.goods = goodsOpts[0]?.[0] || '';
      if (v === 'toast') a.text = newKey(`${base}.toast`);
      if (v === 'pay') a.amount = 50;
      if (v === 'rename') a.name = newKey(`${base}.name`);
      if (v === 'ttPost') Object.assign(a, { id: `${st.id}Tt`, who: Object.keys(data.people)[0] || '', author: newKey(`${base}.ttAuthor`), caption: newKey(`${base}.ttCap`), photo: { actor: Object.keys(data.people)[0] || '' }, likes: 1200, comments: [newKey(`${base}.ttC1`)] });
      if (v === 'block') a.who = contactOpts[0]?.[0] || '';
      if (v === 'ambush') Object.assign(a, { region: [0, 4, 0, 3], start: [2, 3], trap: [2, 0], exits: [[0, 0], [4, 0]], fixed: [], blocks: 3 });
      if (v === 'ambushCrew') a.per = 2;
      if (v === 'openPhone') a.who = contactOpts[0]?.[0] || '';
      if (v === 'fuel') a.pct = 15;
      st.on.push(a);
      rerender();
    })));
    T.pane('flow').append(acts);

    // ---------- điều kiện xong bước ----------
    const u = (st.until = st.until || { type: 'none' });
    const until = el('div', { class: 'card' }, el('h3', {}, '✅ Xong bước khi'),
      el('div', { class: 'grid' }, field('Điều kiện', groupSelect(u.type, null, UNTIL_GROUPS.map(([g, ids]) => [g, ids.map((id) => [id, UNTIL[id]])]), (v) => {
        st.until = { type: v };
        if (v === 'read' || v === 'reply' || v === 'open') st.until.who = contactOpts[0]?.[0] || '';
        if (v === 'routed') st.until.place = st.target || placeOpts[0]?.[0] || '';
        if (v === 'ack') st.until.max = 0;
        if (v === 'use') st.until.goods = goodsOpts[0]?.[0] || '';
        if (v === 'arrive') Object.assign(st.until, { place: placeOpts[0]?.[0] || '', r: 8 });
        if (v === 'wait') st.until.min = 2;
        if (v === 'switch') st.until.which = 'food';
        if (v === 'fuel') st.until.pct = 90;
        if (v === 'order') st.until.stage = 'deliver';
        if (v === 'near') Object.assign(st.until, { who: Object.keys(data.people)[0] || '', r: 1.6 });
        if (v === 'talkActor') st.until.who = Object.keys(data.people)[0] || '';
        if (v === 'ordersSince') st.until.n = 10;
        if (v === 'clock') Object.assign(st.until, { from: 17.5, to: 19 });
        if (v === 'bring') Object.assign(st.until, { who: Object.keys(data.people)[0] || '', place: placeOpts[0]?.[0] || '', r: 10 });
        if (v === 'chosen') st.until.id = chooseIds()[0] || '';
        if (v === 'reach') Object.assign(st.until, { at: [0, 0], r: 8 });
        if (v === 'ttSeen') st.until.id = ttOpts()[0]?.[0] || '';
        if (v === 'away') Object.assign(st.until, { who: Object.keys(data.people)[0] || '', r: 30 });
        if (v === 'useAt') Object.assign(st.until, { at: Object.keys(ZONES.ship.points)[0], r: 1.6, label: newKey(`${base}.useLabel`) });
        if (v === 'hidden') { const b = binOpts()[0]?.[0]; if (b) st.until.prop = b; }
        if (v === 'chased') st.until.who = (ch.steps || []).flatMap((x) => (x.on || []).filter((a) => a.do === 'chase').map((a) => a.who))[0] || Object.keys(data.people)[0] || '';
        if (v === 'talk') {
          const place = st.talk?.place || placeOpts[0]?.[0] || '';
          st.until.place = place;
          st.talk = st.talk || { place, label: newKey(`${base}.label`), text: newKey(`${base}.text`) };
        } else delete st.talk;
        rerender();
      }, UNTIL), opt('until')),
      (u.type === 'read' || u.type === 'reply' || u.type === 'open') ? field('Người nhắn', selectInput(u.who, contactOpts, (v) => { u.who = v; changed(); }), opt('until')) : null,
      u.type === 'routed' ? field('Chỉ đường tới', selectInput(u.place, [['office', '🏢 Văn phòng hãng (bất kỳ)'], ['fuel', '⛽ Cây xăng / trụ sạc (bất kỳ)'], ...spotOpts(), ...placeOpts], (v) => { u.place = v; changed(); }), opt('until')) : null,
      u.type === 'fuel' ? field('Xăng / pin ít nhất (%)', numInput(u.pct ?? 90, (v) => { u.pct = v; changed(); }, { step: 5, min: 1, max: 100 }), opt('until', { hint: 'Xe đạp: coi như xong ngay.' })) : null,
      u.type === 'order' ? field('Mốc', selectInput(u.stage, Object.entries(ORDER_STAGES), (v) => { u.stage = v; changed(); }), opt('until')) : null,
      u.type === 'ack' ? field('Tự sang sau (phút game, 0 = chờ bấm nút)', numInput(u.max ?? 0, (v) => { if (v > 0) u.max = v; else delete u.max; changed(); }, { step: 1, min: 0 }), opt('until', { hint: '1 phút game = 1 giây thật.' })) : null,
      u.type === 'use' ? field('Món', selectInput(u.goods, goodsOpts, (v) => { u.goods = v; changed(); }), opt('until')) : null,
      u.type === 'arrive' ? field('Địa điểm', selectInput(u.place, placeOpts, (v) => { u.place = v; changed(); }), opt('until')) : null,
      u.type === 'chosen' ? field('Lựa chọn', selectInput(u.id, chooseIds().map((id) => [id, id]), (v) => { u.id = v; changed(); }), opt('until', { hint: 'Mã của việc "Chọn câu trả lời" ở bước này hoặc bước trước.' })) : null,
      u.type === 'near' || u.type === 'bring' || u.type === 'chased' ? field('Người lạ', selectInput(u.who, actorOpts(), (v) => { u.who = v; changed(); }), opt('until', u.type === 'chased' ? { hint: 'Người có việc "🏍️ Chạy trốn" ở bước này / bước trước. Xong khi người đó chạy tới điểm cuối lộ trình mà người chơi đang ở gần (≤ 60 m).' } : {})) : null,
      u.type === 'cine' ? el('p', { class: 'muted' }, 'Thêm việc "🎬 Cảnh phim" ở phần "Khi vào bước" — chiếu hết các cảnh quay thì sang bước sau.') : null,
      u.type === 'reach' && Array.isArray(u.at?.[0]) ? field('Các chỗ (chạm chỗ nào cũng được)', el('div', {},
        ...u.at.map((q, k) => el('div', { class: 'row' }, ...[0, 1].map((j) => numInput(q[j], (v) => { q[j] = v; changed(); }, { step: 0.5 })),
          button('✕', () => { u.at.splice(k, 1); if (u.at.length === 1) u.at = u.at[0]; rerender(); }, 'small'))),
        button('＋ Thêm chỗ', () => { u.at.push([...u.at.at(-1)]); rerender(); }, 'small')), opt('until', { hint: 'Vd 2 lối mạn trái / mạn phải của tàu: đi lối nào cũng kích hoạt.' })) : null,
      u.type === 'reach' && !Array.isArray(u.at?.[0]) ? field('', button('＋ Thêm chỗ khác (chạm chỗ nào cũng được)', () => { u.at = [[...(u.at || [0, 0])], [...(u.at || [0, 0])]]; rerender(); }, 'small'), opt('until')) : null,
      u.type === 'reach' && !Array.isArray(u.at?.[0]) ? field('Tọa độ x', numInput(u.at?.[0] ?? 0, (v) => { u.at = [v, u.at?.[1] ?? 0]; changed(); }, { step: 1 }), opt('until', { hint: 'Chỗ trên bản đồ (đơn vị bản đồ). Đường dọc thứ i ở x = (i − 5) × 52, đường ngang thứ j ở z = (j − 5) × 52 · xem vị trí đang đứng: mở game ?debug, gõ game.snapshot().pos. Vd giữa cầu Sông Ngân hàng 5: [182, 0].' })) : null,
      u.type === 'reach' && !Array.isArray(u.at?.[0]) ? field('Tọa độ z', numInput(u.at?.[1] ?? 0, (v) => { u.at = [u.at?.[0] ?? 0, v]; changed(); }, { step: 1 }), opt('until')) : null,
      u.type === 'hidden' ? field('Chỗ núp', selectInput(u.prop || '', [['', '— Chỗ nào cũng được —'], ...binOpts()], (v) => { if (v) u.prop = v; else delete u.prop; changed(); }), opt('until', { hint: 'Thùng rác (🗑️) hoặc điểm đánh dấu (📍) đặt ngay chiếc xe hàng rong bên đường — đạo cụ ở bước này hoặc bước trước. Người chơi đứng sát bấm E ngồi núp → xong bước (vd núp rồi mới nghe lén).' })) : null,
      u.type === 'hidden' ? field('Lúc núp quay mặt về', selectInput(u.watch || '', [['', '— Quay vào chỗ núp —'], ...actorOpts()], (v) => { if (v) u.watch = v; else delete u.watch; changed(); }), opt('until', { hint: 'Người chơi ngồi phía bên kia chỗ núp, ló mắt nhìn về người này → camera thấy cảnh + lời thoại phía đó.' })) : null,
      u.type === 'reach' ? field('Bán kính', numInput(u.r ?? 8, (v) => { u.r = v; changed(); }, { step: 1, min: 2, max: 60 }), opt('until', { hint: 'Người chơi tới cách chỗ này ít hơn bao nhiêu thì xong (1 ≈ 10 m trên màn hình). Đường rộng ~15 → bán kính 9 là chạy ngang qua chỗ đó.' })) : null,
      u.type === 'ttSeen' ? field('Tin Tích Tắc', selectInput(u.id || '', ttOpts(), (v) => { u.id = v; changed(); }), opt('until', { hint: 'Tin đăng bằng việc "📱 Tin Tích Tắc" ở bước này / bước trước. Người chơi mở app Tích Tắc lướt tới tin đó → xong bước. Nên kèm hướng dẫn "Mở app …" (Tích Tắc).' })) : null,
      u.type === 'away' ? field('Đi xa khỏi', selectInput(u.who ? u.who : 'at', [...actorOpts(), ['at', '📍 Chỗ [x, z]']], (v) => { if (v === 'at') { delete u.who; u.at = u.at || [0, 0]; } else { u.who = v; delete u.at; } rerender(); }), opt('until', { hint: 'Vd bị đuổi về: người chơi đi xa người lạ này hơn bán kính thì xong bước (người lạ không còn ở cảnh cũng tính là xong).' })) : null,
      u.type === 'away' && !u.who ? field('Tọa độ x, z', el('div', { class: 'row' }, ...[0, 1].map((k) => numInput((u.at ||= [0, 0])[k], (v) => { u.at[k] = v; changed(); }, { step: 1 }))), opt('until')) : null,
      u.type === 'away' ? field('Xa hơn (đơn vị bản đồ · 1 ≈ 10 m)', numInput(u.r ?? 30, (v) => { u.r = v; changed(); }, { step: 5, min: 5, max: 300 }), opt('until')) : null,
      u.type === 'parked' ? field('Bãi giữ xe', selectInput(u.place || '', [['', '— Bãi nào cũng được —'], ...placeOpts.filter(([id]) => ctx.data.places.places.find((p) => p.id === id)?.look === 'parkingLot')], (v) => { if (v) u.place = v; else delete u.place; changed(); }), opt('until', { hint: 'Người chơi chạy xe vào bãi, xuống xe (trả tiền gửi) → xong bước. Vd gửi xe rồi mới đi bộ vào giao.' })) : null,
      u.type === 'useAt' ? field('Chỗ bấm E', selectInput(Array.isArray(u.at) ? 'xz' : u.at, [...Object.entries(ZONES).flatMap(([zid, z]) => Object.entries(z.points).map(([k, p]) => [k, `${z.name.split(' (')[0]} · ${p.name}`])), ['xz', '📍 Chỗ [x, z] (thành phố)']], (v) => { u.at = v === 'xz' ? [0, 0] : v; rerender(); }), opt('until', { hint: 'Người chơi tới gần chỗ này hiện nút E (chữ ở dưới) — bấm là xong bước. Vd mở tủ, lục ngăn kéo.' })) : null,
      u.type === 'useAt' && Array.isArray(u.at) ? field('Tọa độ x, z', el('div', { class: 'row' }, ...[0, 1].map((k) => numInput(u.at[k], (v) => { u.at[k] = v; changed(); }, { step: 0.5 }))), opt('until')) : null,
      u.type === 'useAt' ? field('Cách bao nhiêu thì hiện nút E', numInput(u.r ?? 1.6, (v) => { u.r = v; changed(); }, { step: 0.2, min: 0.4, max: 10 }), opt('until')) : null,
      u.type === 'useAt' ? textBox('Chữ trên nút E', u.label || (u.label = newKey(`${base}.useLabel`)), 1, { ref, fieldKey: 'until' }) : null,
      u.type === 'useAt' ? field('Tiếng lúc bấm E', selectInput(u.sound || '', [['', 'ui.interact — Tương tác (E)'], ...Object.values(SOUNDS).filter((x) => x.kind === 'sfx').map((x) => [x.id, `${x.id} — ${x.label}`])], (v) => { if (v) u.sound = v; else delete u.sound; changed(); }), opt('until')) : null,
      u.type === 'ambushed' ? el('p', { class: 'muted' }, 'Thêm việc "🗺️ Bày trận" ở phần "Khi vào bước" — người chơi đặt chốt đúng, bấm "Chốt kế hoạch" thì sang bước sau.') : null,
      u.type === 'never' ? el('p', { class: 'muted' }, 'Người chơi dừng ở bước này (chơi tiếp bình thường, chỉ là cốt truyện chưa đi tiếp). Dùng làm chỗ "còn tiếp" khi chương chưa viết xong.') : null,
      u.type === 'talkActor' ? field('Người nói', selectInput(u.who, speakerOpts2(), (v) => { u.who = v; changed(); }), opt('until', { hint: 'Người chơi đứng gần bấm E → sang bước sau (câu tiếp theo). Người lạ phải xuất hiện ở bước này hoặc bước trước; NPC địa điểm thì luôn có.' })) : null,
      u.type === 'bring' ? field('Chở tới', selectInput(u.place, placeOpts, (v) => { u.place = v; changed(); }), opt('until', { hint: 'Người lạ phải đang ngồi sau xe (việc "lên xe" ở bước này / bước trước).' })) : null,
      u.type === 'bring' ? field('Bán kính (đơn vị bản đồ)', numInput(u.r ?? 10, (v) => { u.r = v; changed(); }, { step: 0.5, min: 1 }), opt('until', { hint: 'Tới gần nơi đến bao nhiêu thì xong (người lạ xuống xe). đơn vị bản đồ: 1 ≈ 10 m trên màn hình. Cột sáng vàng rộng ≈ 1 → muốn tới đúng cột thì đặt 2–3.' })) : null,
      u.type === 'ordersSince' ? field('Số đơn phải giao thêm', numInput(u.n ?? 10, (v) => { u.n = Math.max(1, Math.round(v) || 1); changed(); }, { step: 1, min: 1, max: 200 }), opt('until', { hint: 'Đếm từ lúc vào bước, cộng dồn qua các ngày. Bảng "Mục tiêu hôm nay" hiện "Giao N đơn (n/N)".' })) : null,
      u.type === 'clock' ? field('Từ giờ', numInput(u.from ?? 17.5, (v) => { u.from = v; changed(); }, { step: 0.5, min: 0, max: 24 }), opt('until', { hint: 'Giờ chung của thế giới, vd 17,5 = 17:30. Quá giờ thì chờ tới hôm sau.' })) : null,
      u.type === 'clock' ? field('Tới giờ', numInput(u.to ?? 19, (v) => { u.to = v; changed(); }, { step: 0.5, min: 0, max: 24 }), opt('until')) : null,
      u.type === 'near' ? field('Cách người chơi (đơn vị bản đồ · 1 ≈ 10 m)', numInput(u.r ?? 1.6, (v) => { u.r = v; changed(); }, { step: 0.2, min: 0.8 }), opt('until')) : null,
      u.type === 'arrive' ? field('Bán kính (đơn vị bản đồ)', numInput(u.r ?? 8, (v) => { u.r = v; changed(); }, { step: 0.5, min: 1 }), opt('until', { hint: 'đơn vị bản đồ: 1 ≈ 10 m trên màn hình. Cột sáng vàng rộng ≈ 1; 8 = còn cách ~80 m đã tính là tới.' })) : null,
      u.type === 'wait' ? field('Số phút game', numInput(u.min ?? 0, (v) => { u.min = v; changed(); }, { step: 1, min: 0 }), opt('until')) : null,
      u.type === 'switch' ? field('Công tắc', selectInput(u.which, [['food', '📦 Giao hàng'], ['ride', '🛵 Chở khách']], (v) => { u.which = v; changed(); }), opt('until')) : null,
      u.type === 'talk' ? field('Địa điểm nói chuyện', selectInput(u.place, placeOpts, (v) => { u.place = v; st.talk.place = v; changed(); }), opt('talk')) : null));
    T.pane('flow').append(until);

    // ---------- nói chuyện ở địa điểm ----------
    if (u.type === 'talk' && st.talk) {
      const t = st.talk;
      T.pane('flow').append(el('div', { class: 'card' }, el('h3', {}, '💬 Nói chuyện (nút E riêng ở cửa địa điểm · bong bóng trên đầu NPC)'),
        textBox('Chữ trên nút E', t.label, 1, { ref, fieldKey: 'talk' }),
        field('Người nói thay NPC địa điểm', selectInput(t.who || '', [['', '— NPC của địa điểm —'], ...actorOpts()], (v) => { if (v) t.who = v; else delete t.who; changed(); }), { ref, fieldKey: 'talk', hint: 'Người lạ đang có mặt (việc "Người lạ xuất hiện" ở bước này / trước) nói thay — vd chị bán hoa đứng ở chợ thay cô bán cá. Nút E vẫn ở cửa địa điểm.' }),
        textBox('Câu nói (bong bóng)', t.text, 5, { hint: '[tiếp] = câu sau (người chơi bấm E) · {name} = tên người chơi · bong bóng chỉ có chữ thường (không chữ đậm)', ref, fieldKey: 'talk' }),
        el('div', { class: 'grid' },
          field('', checkInput(!!t.guide, (v) => { if (v) t.guide = true; else delete t.guide; changed(); }, 'Hướng dẫn xếp túi (khung vàng)'), { hint: 'Bật: màn xếp túi có khung vàng chỉ từng bước + phải xếp đúng luật (dùng ở chương 1 để dạy). Tắt: xếp như đơn thường.' }),
          field('Xếp gói hàng vào túi', parcelChips(t, 'pack'), { hint: 'Bấm đồng ý → mở màn xếp túi với các gói này (có hướng dẫn chọn món → bấm ô → xoay → xếp xong), xếp xong mới xong bước.' }),
          field('Giao gói hàng', parcelChips(t, 'drop'), { hint: 'Người chơi đang chở các gói này thì giao luôn.' }),
          field('Tặng đồ', selectInput(t.give || '', [['', '— Không —'], ...goodsOpts], (v) => { if (v) t.give = v; else delete t.give; changed(); }), { hint: 'Đồ dùng 1 lần / đồ mang theo, vào túi đồ.' }),
          t.give ? field('Số phần tặng', numInput(t.giveQty ?? 1, (v) => { if (v > 1) t.giveQty = v; else delete t.giveQty; changed(); }, { step: 1, min: 1, max: 20 })) : null)));
    }

    // ---------- hạn giờ · NPC vắng mặt · không bị phạt ----------
    const D = st.deadline;
    const earlier = ch.steps.slice(0, i + 1).map((x, j) => [x.id, `${j + 1}. ${x.id}`]);
    T.pane('rules').append(fold('⏰ Hạn giờ · NPC vắng mặt', D || st.hideNpc?.length,
      el('div', { class: 'grid' },
        field('Hạn giờ', checkInput(!!D, (v) => {
          if (v) st.deadline = { hour: 9, back: ch.steps[Math.max(0, i - 1)]?.id || st.id, text: newKey(`${base}.late`) };
          else delete st.deadline;
          rerender();
        }, 'Phải xong trước … giờ'), opt('deadline', { hint: 'Giờ chung của thế giới. Các bước liền nhau cùng tick hạn giờ dùng chung 1 hạn (tính lúc vào bước đầu). Quá hạn → báo thất bại → quay lại bước chọn ở dưới (vd bước "chờ 8h" → nhận lại sáng hôm sau). Không quay ngược đồng hồ.' })),
        D ? field('Trước (giờ)', numInput(D.hour ?? 9, (v) => { D.hour = v; changed(); }, { step: 0.5, min: 0, max: 24 }), opt('deadline', { hint: 'Vd 9 = 9:00, 17,5 = 17:30.' })) : null,
        D ? field('Thất bại thì quay lại bước', selectInput(D.back, earlier, (v) => { D.back = v; changed(); }), opt('deadline')) : null,
        D ? field('Tin nhắn khi thất bại từ', selectInput(D.from || '', [['', '— Không nhắn —'], ...contactOpts], (v) => {
          if (v) { D.from = v; D.msg = D.msg || newKey(`${base}.lateMsg`); } else { delete D.from; delete D.msg; }
          rerender();
        }), opt('deadline')) : null),
      D ? textBox('Thông báo thất bại', D.text, 1, { ref, fieldKey: 'deadline' }) : null,
      D?.from ? textBox('Tin nhắn khi thất bại', D.msg, 2, { ref, fieldKey: 'deadline' }) : null,
      field('NPC vắng mặt trong bước này', npcChips(st, changed), { ...opt('hideNpc'), wide: true, hint: 'Cộng thêm với "NPC vắng mặt cả chương" (thẻ chương).' })));

    // ---------- dấu trên đầu NPC ----------
    T.pane('show').append(el('div', { class: 'card' }, el('h3', {}, '❗ Dấu trên đầu NPC (trong lúc chờ bước này)'),
      el('div', { class: 'grid' },
        field('Dấu', selectInput(st.mark?.icon || '', [['', '— Không —'], ['!', '! (có việc mới)'], ['?', '? (quay lại nói chuyện)'], ['dot', '🔴 Chấm đỏ nhấp nháy (mục tiêu đang đuổi)']], (v) => {
          if (!v) delete st.mark;
          else st.mark = { place: st.mark?.place || st.talk?.place || placeOpts[0]?.[0] || '', icon: v };
          rerender();
        }), opt('mark')),
        st.mark ? field('Trên đầu', selectInput(st.mark.actor ? `actor:${st.mark.actor}` : st.mark.prop ? `prop:${st.mark.prop}` : st.mark.place, [...placeOpts, ...actorOpts().map(([id, l]) => [`actor:${id}`, `👤 ${l}`]), ...propOpts().map(([id, l]) => [`prop:${id}`, `🚛 ${l}`])], (v) => {
          delete st.mark.place; delete st.mark.actor; delete st.mark.prop;
          if (v.startsWith('actor:')) st.mark.actor = v.slice(6); else if (v.startsWith('prop:')) st.mark.prop = v.slice(5); else st.mark.place = v;
          changed();
        }), opt('mark', { hint: 'NPC của địa điểm, hoặc người lạ đang ở cảnh (việc "Người lạ xuất hiện").' })) : null)));

    // ---------- vòng tìm kiếm + chữ nút E ----------
    T.pane('show').append(fold('🟣 Vòng tìm kiếm · chữ trên nút E', st.zone || st.talkLabel,
      el('div', { class: 'grid' },
        field('Vòng tròn tím', checkInput(!!st.zone, (v) => { if (v) st.zone = { place: placeOpts[0]?.[0] || '' }; else delete st.zone; rerender(); }, 'Hiện vòng quanh địa điểm'), opt('zone', { hint: 'Vùng cần tìm (không có mũi tên chỉ đường). Vd tìm chị Linh quanh trường.' })),
        st.zone ? field('Quanh địa điểm', selectInput(st.zone.place, placeOpts, (v) => { st.zone.place = v; changed(); }), opt('zone')) : null,
        st.zone ? field('Bán kính (đơn vị bản đồ · 1 ≈ 10 m, 0 = tự tính theo lô)', numInput(st.zone.r ?? 0, (v) => { if (v > 0) st.zone.r = v; else delete st.zone.r; changed(); }, { step: 5, min: 0, max: 150 }), opt('zone')) : null,
        field('Chữ riêng trên nút E', checkInput(!!st.talkLabel, (v) => { if (v) st.talkLabel = newKey(`${base}.label`); else delete st.talkLabel; rerender(); }, 'Đổi chữ nút E ở bước này'), opt('talkLabel', { hint: 'Ở bước chờ bấm E nói chuyện / mở lời. Vd "Chở chị Linh về", "Hỏi chú bảo vệ".' }))),
      st.talkLabel ? textBox('Chữ trên nút E', st.talkLabel, 1, { ref, fieldKey: 'talkLabel' }) : null));

    // tâm vùng giữ / chặn: địa điểm thành phố · hoặc chỗ đứng có tên trên bản đồ riêng / [x, z] (vd giữ trong khu đang đánh trên tàu)
    const zoneSpots = Object.entries(ZONES).flatMap(([, z]) => Object.entries(z.points).map(([k, q]) => [`zp:${k}`, `${z.name.split(' (')[0]} · ${q.name}`]));
    const regionField = (R, key) => el('div', { class: 'grid' },
      field('Quanh', selectInput(R.at == null ? R.place : Array.isArray(R.at) ? 'xz' : `zp:${R.at}`, [...placeOpts, ...zoneSpots, ['xz', '📍 Chỗ [x, z]']], (v) => {
        if (v === 'xz') { R.at = [0, 0]; delete R.place; } else if (v.startsWith('zp:')) { R.at = v.slice(3); delete R.place; } else { R.place = v; delete R.at; }
        rerender();
      }), opt(key)),
      Array.isArray(R.at) ? field('Tọa độ x, z', el('div', { class: 'row' }, ...[0, 1].map((k) => numInput(R.at[k], (v) => { R.at[k] = v; changed(); }, { step: 0.5 }))), opt(key)) : null);
    // ---------- giữ người chơi trong một vùng ----------
    T.pane('rules').append(fold('🚧 Giữ người chơi trong vùng (trong lúc chờ bước này)', st.leash,
      el('div', { class: 'grid' },
        field('Giữ lại', checkInput(!!st.leash, (v) => {
          if (v) st.leash = { place: placeOpts[0]?.[0] || '', r: 30, text: newKey(`${base}.leash`) };
          else delete st.leash;
          rerender();
        }, 'Đi xa quá thì bị giữ lại + nhắc'), opt('leash', { hint: 'Vd chưa nói chuyện với anh phát tờ rơi thì không cho rời bến xe.' })),
        st.leash ? regionField(st.leash, 'leash') : null,
        st.leash ? field('Bán kính (đơn vị bản đồ · 1 ≈ 10 m)', numInput(st.leash.r ?? 30, (v) => { st.leash.r = v; changed(); }, { step: 5, min: 10, max: 200 }), opt('leash')) : null),
      st.leash ? textBox('Câu nhắc khi đi ra khỏi vùng', st.leash.text, 1, { ref, fieldKey: 'leash' }) : null));
    T.pane('rules').append(fold('⛔ Chặn lại gần địa điểm (trong lúc chờ bước này)', st.keepOut,
      el('div', { class: 'grid' },
        field('Chặn', checkInput(!!st.keepOut, (v) => {
          if (v) st.keepOut = { place: placeOpts[0]?.[0] || '', r: 30, text: newKey(`${base}.keepOut`) };
          else delete st.keepOut;
          rerender();
        }, 'Tới gần quá thì bị đẩy ra + nhắc'), opt('keepOut', { hint: 'Vd chưa gửi xe ở bãi thì không cho tới Kho 7 (phải gửi xe rồi đi bộ vào).' })),
        st.keepOut ? regionField(st.keepOut, 'keepOut') : null,
        st.keepOut ? field('Bán kính (m)', numInput(st.keepOut.r ?? 30, (v) => { st.keepOut.r = v; changed(); }, { step: 5, min: 5, max: 200 }), opt('keepOut')) : null),
      st.keepOut ? textBox('Câu nhắc khi lại gần', st.keepOut.text, 1, { ref, fieldKey: 'keepOut' }) : null));

    // ---------- mục tiêu + hướng dẫn ----------
    const g = (st.guide = st.guide || null);
    const goal = el('div', { class: 'card' }, el('h3', {}, '🎯 Mục tiêu trên màn hình'));
    if (st.goal) goal.append(textBox('Mục tiêu', st.goal, 1, { ref, fieldKey: 'goal' }), st.hint ? textBox('Gợi ý (dòng nhỏ)', st.hint, 2, { ref, fieldKey: 'hint' }) : button('＋ Gợi ý', () => { st.hint = newKey(`${base}.hint`); rerender(); }, 'small'));
    else goal.append(el('p', { class: 'muted' }, 'Bước này chưa có mục tiêu (không có dòng mục tiêu trên màn hình — hợp với bước chỉ gửi tin / chờ / hướng dẫn chữ).'), button('＋ Mục tiêu', () => { st.goal = newKey(`${base}.goal`); rerender(); }, 'small'));
    {
      // hướng dẫn hiện cả khi bước không có mục tiêu (vd giải thích thanh xăng, app CSGT)
      goal.append(el('div', { class: 'grid' },
        st.goal && st.target ? field('', checkInput(!!st.noBeacon, (v) => { if (v) st.noBeacon = true; else delete st.noBeacon; changed(); }, 'Không có cột sáng (chỉ mũi tên)'), opt('noBeacon', { hint: 'Vd mục tiêu là tên cướp đang chạy — đã có chấm đỏ trên đầu, khỏi cột sáng đi theo.' })) : null,
        st.goal && st.target ? (st.goTo
          ? el('div', {}, textBox('Chữ thanh chỉ đường giữa trên (riêng bước này)', st.goTo, 1, { ref, fieldKey: 'goTo', hint: 'Bỏ trống dùng mẫu chung "Đi đến {place}" (thẻ Chữ & hội thoại → goal.goTo).' }), button('✕ Dùng mẫu chung', () => { delete st.goTo; rerender(); }, 'small'))
          : button('＋ Chữ thanh "Đi đến …" riêng', () => { st.goTo = newKey(`${base}.goTo`); rerender(); }, 'small')) : null,
        st.goal ? field('Mũi tên chỉ tới', selectInput(st.target || '', [['', '— Không —'], ['bike', '🚲 Xe của mình'], ['office', '🏢 Văn phòng hãng (đã chỉ đường / gần nhất)'], ['fuel', '⛽ Cây xăng / trụ sạc (đã chỉ đường / gần nhất)'], ...actorOpts().map(([id, l]) => [`actor:${id}`, `👤 ${l}`]), ...propOpts().map(([id, l]) => [`prop:${id}`, `🚛 ${l}`]), ...spotOpts(), ...placeOpts], (v) => { if (v) st.target = v; else delete st.target; changed(); }), opt('target')) : null,
        field('Hướng dẫn trên điện thoại', selectInput(g?.type || '', [['', '— Không —'], ...Object.entries(GUIDES).filter(([k]) => !HIDDEN_GUIDES.includes(k) || k === g?.type)], (v) => {
          if (!v) delete st.guide;
          else st.guide = { type: v, ...(['thread', 'route', 'reply'].includes(v) ? { who: contactOpts[0]?.[0] || '' } : {}), ...(v === 'app' ? { app: 'tictac' } : {}), ...(v === 'route' ? { place: st.target || 'office' } : {}), ...(v === 'switch' ? { which: 'food' } : {}),
            ...(v === 'hud' || v === 'profile' ? { ...(v === 'hud' ? { part: 'minimap' } : {}), btn: 'ok', title: newKey(`${base}.guideTitle`), hint: newKey(`${base}.guideHint`) } : {}), ...(v === 'use' ? { goods: goodsOpts[0]?.[0] || '' } : {}) };
          if (v === 'hud' || v === 'profile') st.until = { type: 'ack' }; // có nút Tiếp / Đã rõ → bấm mới sang bước sau
          rerender();
        }), opt('guide', { hint: 'Làm sáng nút cần bấm (màn hình tối xung quanh). "Chỉ đường": chưa bấm 📍 thì chưa có mũi tên.' })),
        g && ['thread', 'route', 'reply'].includes(g.type) ? field('Tin nhắn của', selectInput(g.who, contactOpts, (v) => { g.who = v; changed(); }), opt('guide')) : null,
        g?.type === 'route' ? field('Nút 📍 tới', selectInput(g.place, [['office', '🏢 Văn phòng hãng (bất kỳ)'], ...placeOpts], (v) => { g.place = v; changed(); }), opt('guide')) : null,
        g?.type === 'switch' ? field('Công tắc', selectInput(g.which, [['food', '📦 Giao hàng'], ['ride', '🛵 Chở khách']], (v) => { g.which = v; changed(); }), opt('guide')) : null,
        g?.type === 'use' ? field('Món cần dùng', selectInput(g.goods, goodsOpts, (v) => { g.goods = v; changed(); }), opt('guide')) : null,
        g?.type === 'app' ? field('App', selectInput(g.app || '', Object.keys(APP_DEFS).map((id) => [id, `${APP_DEFS[id].icon} ${C[APP_DEFS[id].key] || id}`]), (v) => { g.app = v; changed(); }), opt('guide', { hint: 'Làm sáng hình điện thoại → biểu tượng app này. Mở app rồi thì tắt.' })) : null));
      if (g?.type === 'hud' || g?.type === 'profile') goal.append(el('div', { class: 'grid' },
        g.type === 'hud' ? field('Phần màn hình', selectInput(g.part, Object.entries(HUD_PARTS).map(([k, [label]]) => [k, label]), (v) => { g.part = v; changed(); }), opt('guide')) : null,
        field('Nút trên bong bóng', selectInput(g.btn || '', [['', '— Không (tự tắt khi bước xong) —'], ...Object.entries(GUIDE_BTNS)], (v) => { if (v) g.btn = v; else delete g.btn; changed(); }), opt('guide', { hint: 'Có nút: điều kiện xong nên là "Người chơi bấm tắt hướng dẫn". Chữ có bản riêng theo loại xe: thêm khóa + ".gas" / ".electric" ở thẻ Chữ.' }))));
      if (g && (g.type === 'minimap' || g.type === 'hud' || g.type === 'profile')) goal.append(textBox('Chữ hướng dẫn (dòng đậm)', g.title, 1, { ref, fieldKey: 'guide' }), textBox('Chữ hướng dẫn (dòng nhỏ)', g.hint, 2, { ref, fieldKey: 'guide' }));
    }
    T.pane('show').prepend(goal); // mục tiêu lên đầu thẻ 👀
    T.done();
  }

  // Một câu trả lời người chơi chọn được: chữ bên trái · bên phải chọn tính cách được cộng điểm + bao nhiêu điểm
  // a[listKey] = danh sách khóa chữ (choose → options, replies → texts) · a.gains[j] = { trait, pts } | null (cùng thứ tự)
  function answerRow(a, listKey, j, label, rerender, o) {
    const gn = a.gains?.[j];
    const setGain = (v) => {
      a.gains = a.gains || [];
      while (a.gains.length < a[listKey].length) a.gains.push(null);
      a.gains[j] = v;
      if (a.gains.every((x) => !x)) delete a.gains;
    };
    const traitOpts = [['', '— Không —'], ...Object.keys(PERSONAS).map((t) => [t, C[`story.trait.${t}`] || t])];
    return el('div', { class: 'story-ans' },
      el('div', { class: 'story-ans-l' }, textBox(label, a[listKey][j], 1, o)),
      el('div', { class: 'story-ans-r' },
        field('Tăng điểm', selectInput(gn?.trait || '', traitOpts, (v) => { setGain(v ? { trait: v, pts: gn?.pts || 1 } : null); rerender(); }), { ...o, hint: 'Chọn câu này → cộng điểm tính cách. Cuối game tính cách nhiều điểm nhất thắng (bằng nhau → trung lập). Người chơi không thấy số, chỉ thấy thông báo nhỏ "… ↑".' }),
        gn ? field('+ bao nhiêu', numInput(gn.pts ?? 1, (v) => { setGain({ trait: gn.trait, pts: Math.max(1, Math.min(10, Math.round(v) || 1)) }); ctx.changed('story'); }, { step: 1, min: 1, max: 10 }), o) : null));
  }

  // Một dòng việc: loại + ô riêng theo loại + ↑ ↓ ✕
  function actionRow(st, a, k, base, rerender, opt) {
    const tools = el('div', { class: 'row' },
      el('b', {}, `${k + 1}. ${LEAVE_KINDS.some(([d]) => d === a.do) ? '🚶 Người lạ rời cảnh' : ACTIONS[a.do] || a.do}`),
      button('↑', () => { if (k > 0) { st.on.splice(k - 1, 0, st.on.splice(k, 1)[0]); rerender(); } }, 'small'),
      button('↓', () => { if (k < st.on.length - 1) { st.on.splice(k + 1, 0, st.on.splice(k, 1)[0]); rerender(); } }, 'small'),
      button('✕', () => { st.on.splice(k, 1); rerender(); }, 'small danger'));
    const box = el('div', { class: 'story-act' }, tools);
    const o = opt('on');
    if (['actor', 'approach', 'leave', 'remove', 'board', 'alight', 'goto', 'chase', 'rename', 'dismount', 'helmetOff', 'helmetOn', 'wave', 'rideOff', 'tackle', 'sneak'].includes(a.do)) box.append(field('Người lạ', selectInput(a.who, actorOpts(), (v) => { a.who = v; ctx.changed('story'); }), { ...o, hint: 'Thêm người ở 👥 Danh bạ → Người nói.' }));
    // rời cảnh: đổi cách rời = đổi mã việc (remove / leave / goto) — bộ chạy giữ nguyên 3 mã
    if (LEAVE_KINDS.some(([d]) => d === a.do)) box.append(field('Cách rời', selectInput(a.do, LEAVE_KINDS, (v) => {
      a.do = v;
      if (v === 'goto') Object.assign(a, { place: a.place || placeOpts[0]?.[0] || '', run: a.run ?? true });
      else { delete a.place; delete a.run; }
      rerender();
    }), o));
    if (a.do === 'actor') {
      const xeOmPlaces = ctx.data.places.places.filter((p) => isPlaced(p) && p.xeOm).map((p) => [p.id, `${p.name} (${p.id})`]);
      const spot = a.spot || 'near';
      box.append(
        field('Dáng', selectInput(a.look || 'jetjet', Object.entries(ACTOR_LOOKS), (v) => { a.look = v; if (v !== 'char') delete a.outfit; rerender(); }), { ...o, hint: '"Theo sơ đồ quan hệ": hình của nhân vật gắn với người này trong công cụ /?relationship (mở ở nút 🕸️ trên thanh trên cùng).' }),
        a.look === 'char' ? (() => {
          const c = Object.values(relationsJson.characters || {}).find((x) => x.story === a.who);
          if (!c) return el('p', { class: 'muted' }, `Chưa có nhân vật nào trong sơ đồ quan hệ gắn với "${a.who}". Mở /?relationship → chọn / tạo nhân vật → Gắn với game.`);
          if (c.place) return el('p', { class: 'muted' }, `${c.name}: dùng hình NPC của địa điểm "${c.place}".`);
          const outs = (c.outfits || []).map((x) => [x.id, x.name]);
          return field(`Bộ đồ của ${c.name}`, selectInput(a.outfit || '', [['', '— Bộ đầu tiên —'], ...outs], (v) => { if (v) a.outfit = v; else delete a.outfit; ctx.changed('story'); }), o);
        })() : null,
        field('', checkInput(!!a.tied, (v) => { if (v) a.tied = true; else delete a.tied; ctx.changed('story'); }, '🪢 Bị trói (ngồi bệt, tay sau lưng)'), { ...o, hint: 'Cởi bằng việc "✂️ Cởi trói" (bấm E liên tục).' }),
        field('Chỗ đứng', selectInput(spot, Object.entries(ACTOR_SPOTS), (v) => {
          a.spot = v;
          if (v === 'xeOm') { a.place = a.place || xeOmPlaces[0]?.[0] || ''; delete a.dist; delete a.lat; }
          else if (v === 'place') { a.place = a.place || placeOpts[0]?.[0] || ''; a.dist = a.dist ?? 1.5; }
          else if (v === 'at') { a.at = a.at || [0, 0]; a.heading = a.heading ?? 0; delete a.place; delete a.dist; delete a.lat; }
          else { a.dist = a.dist ?? 8; delete a.place; delete a.lat; }
          rerender();
        }), { ...o, hint: 'Cạnh chú xe ôm: chỗ cố định (mở lại game vẫn đứng đó). Gần người chơi: hiện chếch phía trước, mở lại game giữa cảnh thì không còn.' }),
        spot === 'xeOm'
          ? field('Địa điểm có chú xe ôm', selectInput(a.place, xeOmPlaces, (v) => { a.place = v; ctx.changed('story'); }), { ...o, hint: 'Chỉ các nơi bật "Có chú xe ôm" (thẻ Địa điểm).' })
          : spot === 'place'
            ? el('div', { class: 'grid' },
              field('Trước cửa địa điểm', selectInput(a.place, placeOpts, (v) => { a.place = v; ctx.changed('story'); }), o),
              field('Cách cửa ra phía đường (m)', numInput(a.dist ?? 1.5, (v) => { a.dist = v; ctx.changed('story'); }, { step: 0.5, min: 0, max: 40 }), { ...o, hint: '≈ 1,5 = ngay trước cửa · ≈ 16,5 = vỉa hè bên kia đường.' }))
            : spot === 'at'
              ? el('div', { class: 'grid' },
                field('Tọa độ x, z', el('div', { class: 'row' }, ...[0, 1].map((i) => numInput((a.at ||= [0, 0])[i], (v) => { a.at[i] = v; ctx.changed('story'); }, { step: 0.5 }))), { ...o, hint: 'Xem chỗ đang đứng: mở game ?debug, gõ game.snapshot().pos. Mở lại game vẫn đứng đó.' }),
                field('Hướng mặt (độ, 0 = nhìn về nam)', numInput(a.heading ?? 0, (v) => { a.heading = v; ctx.changed('story'); }, { step: 15, min: -360, max: 360 }), o),
                field('Xe đi kèm', selectInput(a.vehicle || '', [['', '— Không —'], ...Object.entries(ACTOR_VEHICLES)], (v) => { if (v) a.vehicle = v; else { delete a.vehicle; delete a.bikeAt; delete a.bikeHeading; } rerender(); }), o),
                a.vehicle ? field('Xe dựng ở [x, z] · đầu xe (độ)', el('div', { class: 'row' }, ...[0, 1].map((k) => numInput((a.bikeAt || [0, 0])[k], (v) => { a.bikeAt = [...(a.bikeAt || [a.at?.[0] ?? 0, a.at?.[1] ?? 0])]; a.bikeAt[k] = v; ctx.changed('story'); }, { step: 0.5 })),
                  numInput(a.bikeHeading ?? a.heading ?? 0, (v) => { a.bikeHeading = v; ctx.changed('story'); }, { step: 15, min: -360, max: 360 })), { ...o, hint: 'Chưa nhập chỗ dựng: bên phải người 1,6 m, đầu xe theo hướng mặt.' }) : null)
              : field('Đứng cách người chơi (m)', numInput(a.dist ?? 8, (v) => { a.dist = v; ctx.changed('story'); }, { step: 1, min: 3, max: 20 }), o));
      // ô hiếm dùng → gấp vào "▸ Thêm" (đã đặt thì mở sẵn)
      const more = el('details', { class: 'adv', open: !!(a.lat || a.faceTo || a.vehicle || a.call || a.idle) },
        el('summary', {}, `▸ Thêm${spot === 'place' ? ': lệch dọc đường, nhìn về phía, xe đi kèm,' : ':'} câu gọi người chơi, câu nói khi hết chuyện`));
      if (spot === 'place') more.append(el('div', { class: 'grid' },
        field('Lệch dọc đường (m)', numInput(a.lat ?? 0, (v) => { if (v) a.lat = v; else delete a.lat; ctx.changed('story'); }, { step: 0.5, min: -20, max: 20 }), o),
        field('Nhìn về phía', selectInput(a.faceTo || '', [['', '— Cửa địa điểm —'], ...actorOpts().filter(([id]) => id !== a.who)], (v) => { if (v) a.faceTo = v; else delete a.faceTo; ctx.changed('story'); }), { ...o, hint: 'Hai người đứng nói chuyện với nhau. Người chơi tới gần (12 m) thì quay sang người chơi.' }),
        field('Xe đi kèm', selectInput(a.vehicle || '', [['', '— Không —'], ...Object.entries(ACTOR_VEHICLES)], (v) => { if (v) a.vehicle = v; else delete a.vehicle; ctx.changed('story'); }), { ...o, hint: 'Dựng sát lề. Việc "rời cảnh: bỏ chạy" → đội nón full-face, lên xe chạy mất.' })));
      // câu gọi (khi có dấu ! trên đầu) + câu nói khi hết chuyện (bấm E)
      if (a.call) more.append(textBox('Câu gọi người chơi', a.call, 1, { hint: 'Khi có dấu ! trên đầu người này, cứ ~6 giây gọi một lần (người chơi ở trong 25 m).', ...o }), button('✕ Bỏ câu gọi người chơi', () => { delete a.call; rerender(); }, 'small'));
      else more.append(button('＋ Câu gọi người chơi', () => { a.call = newKey(`${base}.call`); rerender(); }, 'small'));
      // câu nói khi hết chuyện: 1 hoặc nhiều câu (mỗi lần bấm E một câu, hết thì lặp câu cuối)
      const idles = a.idle == null ? [] : [].concat(a.idle);
      idles.forEach((k, i) => more.append(textBox(`Câu nói khi hết chuyện ${idles.length > 1 ? i + 1 : ''}`, k, 1, { hint: 'Người chơi bấm E lúc không có bước nào chờ nói chuyện với người này. Nhiều câu: mỗi lần bấm E nói câu kế, hết thì lặp câu cuối.', ...o }),
        button('✕', () => { idles.splice(i, 1); if (!idles.length) delete a.idle; else a.idle = idles.length > 1 ? idles : idles[0]; rerender(); }, 'small')));
      more.append(button(`＋ Câu nói khi hết chuyện${idles.length ? ' (câu kế)' : ''}`, () => { idles.push(newKey(`${base}.idle${idles.length || ''}`)); a.idle = idles.length > 1 ? idles : idles[0]; rerender(); }, 'small'));
      box.append(more);
    }
    if (a.do === 'choose') {
      box.append(
        field('Mã lựa chọn', textInput(a.id, (v) => { if (ID_RE.test(v)) { a.id = v; ctx.changed('story'); } }), { ...o, hint: 'Lưu vào bản lưu của người chơi (câu nào đã chọn) — chương sau dùng mã này để rẽ nhánh.' }),
        field('Người đáp lại', selectInput(a.who, speakerOpts2(), (v) => { a.who = v; ctx.changed('story'); }), o),
        field('Người chơi mở lời', checkInput(!!a.ask, (v) => { if (v) a.ask = true; else delete a.ask; ctx.changed('story'); }, 'Bấm E cạnh người này mới hiện các câu'), { ...o, hint: 'Câu người chơi tự chọn để bắt chuyện (vd hỏi chú bảo vệ). Không tick: hiện các câu ngay.' }),
        field('Dấu ? giật mình', el('div', { class: 'chips' }, actorOpts().map(([id, label]) => checkInput((a.react || []).includes(id), (on) => {
          const r = new Set(a.react || []);
          if (on) r.add(id); else r.delete(id);
          if (r.size) a.react = [...r]; else delete a.react;
          ctx.changed('story');
        }, label))), { ...o, hint: 'Người chơi nói xong → dấu ? nhảy trên đầu những người này (rồi mới đáp).' }));
      (a.options || []).forEach((key, j) => box.append(
        answerRow(a, 'options', j, `Câu trả lời ${j + 1} (phím ${j + 1})`, rerender, o),
        textBox(`→ Người lạ đáp lại câu ${j + 1}`, a.answers?.[j], 2, { hint: 'Hiện ~1 giây sau khi người chơi chọn, giữ tới khi bấm E.', ...o })));
      const n = (a.options || []).length;
      box.append(el('div', { class: 'row' },
        n < 3 ? button('＋ Thêm câu', () => { a.options.push(newKey(`${base}.o${n + 1}`)); (a.answers ||= []).push(newKey(`${base}.a${n + 1}`)); rerender(); }, 'small') : null,
        n > 2 ? button('− Bớt câu cuối', () => { a.options.pop(); a.answers?.pop(); if (a.gains) { a.gains.length = Math.min(a.gains.length, a.options.length); if (a.gains.every((x) => !x)) delete a.gains; } rerender(); }, 'small') : null));
    }
    if (a.do === 'approach' || a.do === 'goto') box.append(field('', checkInput(a.run ?? a.do === 'goto', (v) => { a.run = v; ctx.changed('story'); }, 'Chạy (không đi bộ)'), o));
    if (a.do === 'remove') box.append(el('p', { class: 'muted' }, 'Người này biến mất ngay (vd người chơi đã đi khỏi chỗ đó).'));
    if (a.do === 'leave') box.append(el('p', { class: 'muted' }, 'Chạy ngược ra xa người chơi, ~5 giây sau biến mất (bong bóng thoại của người này cũng tắt). Có xe đi kèm thì đội nón, lên xe chạy mất.'),
      field('', checkInput(!!a.onFoot, (v) => { if (v) a.onFoot = true; else delete a.onFoot; ctx.changed('story'); }, 'Bỏ xe lại, chạy bộ'), { ...o, hint: 'Đang ngồi xe (vd xe chết máy giữa nước): xuống xe chạy bộ, xe nằm lại chỗ cũ (đạo cụ "leftBike_<mã>", màn đen "dọn hết đạo cụ" thì dọn).' }));
    if (a.do === 'approach') box.append(field('', checkInput(!!a.stop, (v) => { if (v) a.stop = true; else delete a.stop; ctx.changed('story'); }, 'Tới nơi thì đứng lại (không đi theo người chơi)'), { ...o, hint: 'Tick: tới chỗ trống quanh người chơi (đứng thành vòng nhóm nói chuyện, không chồng lên người khác) rồi đứng yên, quay về phía người đang nói. Không tick: cứ bám theo người chơi.' }));
    if (a.do === 'goto') box.append(field('Vào địa điểm', selectInput(a.place, placeOpts, (v) => { a.place = v; ctx.changed('story'); }), { ...o, hint: 'Đi / chạy tới cửa địa điểm rồi biến mất (vào trong). Đang ngồi sau xe người chơi thì xuống xe trước.' }));
    if (a.do === 'react') {
      const cur = new Set([].concat(a.who || []));
      box.append(
        field('Dấu', selectInput(a.icon || '?', Object.entries(REACT_ICONS), (v) => { a.icon = v; ctx.changed('story'); }), o),
        field('Trên đầu ai', el('div', { class: 'chips' }, [['player', '🙂 Người chơi'], ...speakerOpts2()].map(([id, label]) => checkInput(cur.has(id), (on) => {
          if (on) cur.add(id); else cur.delete(id);
          a.who = [...cur];
          ctx.changed('story');
        }, label))), { ...o, hint: 'Dấu nhảy trên đầu ~1,8 giây (người lạ đang có mặt / NPC địa điểm / người chơi).' }));
    }
    if (a.do === 'sound') box.append(field('Mã âm thanh', selectInput(a.code, Object.values(SOUNDS).map((x) => [x.id, `${x.id} — ${x.label}`]), (v) => { a.code = v; ctx.changed('story'); }), { ...o, hint: 'Gắn file cho mã ở thẻ 🔊 Âm thanh. Mã mới: thêm vào soundSpec.js (nhờ Claude).' }));
    if (a.do === 'cine') box.append(cineEditor(a, rerender, o));
    if (a.do === 'chase') box.append(chaseEditor(a, rerender, o));
    if (a.do === 'prop') box.append(propEditor(a, rerender, o));
    if (a.do === 'dismount') box.append(el('p', { class: 'muted' }, 'Người lạ đang ngồi xe (chạy trốn / đuổi theo / mô tô đậu) dừng hẳn, xuống đứng bên trái xe; xe dựng lại.'));
    if (a.do === 'helmetOn') box.append(el('p', { class: 'muted' }, 'Người lạ đang cầm nón trên tay (sau "tháo nón"): 2 tay đưa nón lên cao rồi chụp xuống đầu, hạ tay. Thường dùng trước khi lên xe chạy đi ("Lên xe chạy đi" tự đội nón nếu còn cầm).'));
    if (a.do === 'wave') box.append(field('Vẫy trong (giây)', numInput(a.t ?? 2, (v) => { a.t = v; ctx.changed('story'); }, { step: 0.5, min: 0.5, max: 6 }), { ...o, hint: 'Tay trái giơ cao vẫy qua lại (tay phải có thể đang cầm nón).' }));
    if (a.do === 'rideOff') box.append(
      el('p', { class: 'muted' }, 'Người lạ có xe đi kèm (mô tô đậu / xe lúc chạy trốn, đã xuống xe): đang cầm nón thì đội lại → đi tới xe → leo lên, nẹt pô, chạy theo hướng đầu xe ~7 giây rồi mất khỏi cảnh. Không có xe thì bỏ chạy như "Người lạ rời cảnh".'),
      field('Tiếng lúc lên xe', selectInput(a.sound ?? 'city.rev', [['', '— Không —'], ...Object.values(SOUNDS).filter((x) => x.kind === 'sfx').map((x) => [x.id, `${x.id} — ${x.label}`])], (v) => { if (v === 'city.rev') delete a.sound; else a.sound = v; ctx.changed('story'); }), o));
    if (a.do === 'phoneCall') box.append(field('', checkInput(a.on !== false, (v) => { if (v) delete a.on; else a.on = false; ctx.changed('story'); }, 'Đưa điện thoại lên tai (bỏ tick = cất điện thoại)'), { ...o, hint: 'Hình người chơi tay phải áp điện thoại bên tai. Màn đen ("fade") tự cất.' }));
    if (a.do === 'tackle') box.append(
      el('p', { class: 'muted' }, 'Người bị vật (đang chạy bộ sau khi té xe / đứng) vùng chạy về phía người chơi; hiện nút "E — Chặn lại!" có vòng đếm. Bấm kịp: người chơi dang tay chặn, nó khựng lại · không kịp: nó lách qua, người vật vẫn tóm được từ phía sau (không có thua). Người vật lao tới quật xuống — cảnh quay chậm ngang hông — rồi ghì nằm sấp, 2 tay bẻ ra sau lưng. Người chơi đang ngồi xe thì tự xuống xe. Điều kiện xong bước: "Vật ngã xong".'),
      el('div', { class: 'grid' },
        field('Người bị vật', selectInput(a.target || '', actorOpts(), (v) => { a.target = v; ctx.changed('story'); }), o),
        field('Nút bấm nhanh (giây)', numInput(a.qte ?? 2, (v) => { a.qte = v; ctx.changed('story'); }, { step: 0.5, min: 0, max: 5 }), { ...o, hint: '0 = không có nút (người chơi đứng xem).' }),
        field('', checkInput(a.cine !== false, (v) => { if (v) delete a.cine; else a.cine = false; ctx.changed('story'); }, 'Quay chậm lúc quật xuống'), o)),
      textBox('Chữ trên nút', a.text || 'story.qte.block', 1, { hint: 'Dùng chung cho mọi nút "chặn lại".', ...o }));
    if (a.do === 'pursue') {
      const cur = new Set([].concat(a.who || []));
      const setN = (k, v, ok) => { if (ok(v)) a[k] = v; else delete a[k]; ctx.changed('story'); };
      box.append(
        el('p', { class: 'muted' }, 'Những người được tick rượt theo người chơi, chạy theo đúng dấu chân người chơi (quẹo theo hẻm, không xuyên tường). Người chơi tự chạy (giữ Shift chạy nhanh hơn bọn kia; đi bộ thì chậm hơn): leo lên xe chạy đi hoặc bỏ xa → "Đã chạy thoát". "Chỉ thoát bằng xe": phải leo lên xe chạy bỏ xa, bọn kia biến mất luôn. Bị tóm → màn đen làm lại, hoặc màn thua có nút "Chơi lại" (tick "Bị tóm = thua") — đều chơi lại từ chỗ đứng lúc bắt đầu, xe để nguyên chỗ đậu.'),
        field('Ai rượt', el('div', { class: 'chips' }, actorOpts().map(([id, label]) => checkInput(cur.has(id), (on) => { if (on) cur.add(id); else cur.delete(id); a.who = [...cur]; ctx.changed('story'); }, label))), o),
        el('div', { class: 'grid' },
          field('Tốc độ chạy', numInput(a.speed ?? 4.6, (v) => setN('speed', v, (x) => x > 0), { step: 0.1, min: 1, max: 9 }), { ...o, hint: 'Người chơi đi bộ 3,4 · chạy (Shift) 6,2.' }),
          field('Khựng lại trước khi rượt (giây)', numInput(a.delay ?? 0.8, (v) => setN('delay', v, (x) => x >= 0), { step: 0.1, min: 0, max: 5 }), o),
          field('', checkInput(!!a.bikeOnly, (v) => { if (v) a.bikeOnly = true; else delete a.bikeOnly; rerender(); }, 'Chỉ thoát bằng xe'), { ...o, hint: 'Chạy bộ xa cỡ nào cũng không thoát. Leo lên xe thì bọn kia đuối (chạy chậm lại), xe chạy được 1 đoạn thì bọn kia biến mất (xe đạp cũng thoát được).' }),
          a.bikeOnly
            ? field('Chạy xe được bao xa thì bọn kia biến mất', numInput(a.vanish ?? 40, (v) => setN('vanish', v, (x) => x > 0), { step: 5, min: 10, max: 200 }), o)
            : field('Bỏ xa bao nhiêu thì thoát', numInput(a.lose ?? 30, (v) => setN('lose', v, (x) => x > 0), { step: 1, min: 8, max: 120 }), o),
          field('', checkInput(!!a.fail, (v) => { if (v) a.fail = true; else delete a.fail; rerender(); }, 'Bị tóm = thua (màn thua + nút Chơi lại)'), { ...o, hint: 'Không tick: bị tóm thì màn đen ngắn rồi làm lại luôn.' })),
        ...(a.fail ? [['failText', 'Chữ lớn màn thua'], ['failHint', 'Gợi ý dưới chữ lớn']] : []).map(([k, label]) => a[k]
          ? el('div', {}, textBox(label, a[k], 1, o), button('✕', () => { delete a[k]; rerender(); }, 'small'))
          : button(`＋ ${label}`, () => { a[k] = newKey(`${base}.${k}`); rerender(); }, 'small')),
        ...[['stopText', a.bikeOnly ? 'Câu la lúc người chơi leo lên xe (người rượt đầu tiên nói)' : 'Câu khi người chơi thoát (người rượt đầu tiên nói)'], ['caughtText', 'Câu khi tóm được']].map(([k, label]) => a[k]
          ? el('div', {}, textBox(label, a[k], 1, o), button('✕', () => { delete a[k]; rerender(); }, 'small'))
          : button(`＋ ${label}`, () => { a[k] = newKey(`${base}.${k}`); rerender(); }, 'small')));
    }
    if (a.do === 'zone') {
      const mode = a.id ? 'enter' : a.gate != null || a.door != null ? 'set' : 'leave';
      const Z = ZONES[a.id || 'ship'];
      const pts = Object.entries(Z.points).map(([k, p]) => [k, p.name]);
      box.append(field('Làm gì', selectInput(mode, [['enter', '➡️ Vào bản đồ riêng'], ['set', '🔧 Chỉ mở / đóng cổng, cửa (đang ở trong)'], ['leave', '⬅️ Về thành phố']], (v) => {
        for (const k of ['id', 'at', 'gate', 'door', 'heading']) delete a[k];
        if (v === 'enter') Object.assign(a, { id: 'ship', at: Z.spawn, gate: false, door: false });
        if (v === 'set') a.door = true;
        if (v === 'leave') a.at = [146, 206];
        rerender();
      }), { ...o, hint: 'Bản đồ riêng nằm thật xa thành phố: vào thì người chơi bị dời tới đó (xe để lại thành phố), không đi ra ngoài được tới khi cốt truyện cho về. Đồng hồ vẫn chạy. Lưu trong bản lưu.' }));
      if (mode === 'enter') box.append(
        field('Bản đồ', selectInput(a.id, Object.entries(ZONES).map(([k, z]) => [k, z.name]), (v) => { a.id = v; rerender(); }), o),
        field('Đứng ở', selectInput(String(a.at ?? Z.spawn), [...pts, ...spotOpts()], (v) => { a.at = v; ctx.changed('story'); }), { ...o, hint: 'Chỗ có tên trong bản đồ riêng, hoặc chỗ hẹn 📍 (thẻ Người & chỗ hẹn).' }));
      if (mode === 'leave') box.append(field('Về chỗ [x, z] trong thành phố', el('div', { class: 'row' }, ...[0, 1].map((i) => numInput((Array.isArray(a.at) ? a.at : (a.at = [146, 206]))[i], (v) => { a.at[i] = v; ctx.changed('story'); }, { step: 1 }))), o));
      if (mode !== 'leave') box.append(
        field('', checkInput(!!a.gate, (v) => { a.gate = v; ctx.changed('story'); }, '🚪 Mở cổng đầu cầu thang mạn (xuống tàu được)'), o),
        field('', checkInput(!!a.door, (v) => { a.door = v; ctx.changed('story'); }, '📦 Mở cửa container nhốt người'), { ...o, hint: 'Cửa mở có hoạt cảnh 2 cánh bật ra. Đóng = chắn lối ra.' }));
    }
    if (a.do === 'fpv') box.append(field('', checkInput(a.on !== false, (v) => { a.on = v; ctx.changed('story'); }, '👁️ Bật góc nhìn thứ 1 (bỏ tick = tắt, về camera sau lưng)'), { ...o, hint: 'Camera ở mắt người chơi, thấy 2 tay cầm đồ; chuột xoay nhìn. Lưu trong bản lưu — nhớ tắt khi xuống tàu.' }));
    if (a.do === 'fight') box.append(field('Trận', selectInput(a.id || '', Object.entries(data.fights || {}).map(([id, f]) => [id, `⚔️ ${C[f.name] || id}`]), (v) => { a.id = v; ctx.changed('story'); }), { ...o, hint: 'Soạn trận ở mục ⚔️ Đánh nhau (bên trái). Tự bật góc nhìn thứ 1. Điều kiện xong của bước nên là "Đã thắng trận đánh". Thua → chơi lại từ đầu trận.' }));
    if (a.do === 'race') box.append(field('Màn đua', selectInput(a.id || '', Object.entries(data.races || {}).map(([id, r]) => [id, `🏍️ ${C[r.name] || id}`]), (v) => { a.id = v; ctx.changed('story'); }), { ...o, hint: 'Soạn đường đua ở mục 🏍️ Màn đua (bên trái). Người chơi lái xe anh Đạt (ngồi sau), camera cố định sau lưng. Điều kiện xong của bước nên là "Đã chạy tới đích màn đua". Thua → chơi lại từ đầu đoạn đang chạy.' }));
    if (a.do === 'phone') box.append(field('', checkInput(a.off !== false, (v) => { a.off = v; ctx.changed('story'); }, '📵 Tịch thu (bỏ tick = trả lại điện thoại)'), { ...o, hint: 'Tịch thu: ẩn hình điện thoại + thông báo, Tab / I không mở được. Lưu trong bản lưu — nhớ trả lại ở bước sau.' }));
    if (a.do === 'tie' || a.do === 'untie') {
      const whoOpts = [['player', '🙋 Người chơi'], ...Object.keys(data.people).map((id) => [id, `${data.people[id].icon || '🧍'} ${C[data.people[id].name] || id}`])];
      box.append(field('Ai', selectInput(a.who || 'player', whoOpts, (v) => { a.who = v; ctx.changed('story'); }), o));
      if (a.do === 'tie') box.append(field('', checkInput(a.on !== false, (v) => { a.on = v; ctx.changed('story'); }, '🪢 Trói (bỏ tick = thả ra ngay)'), { ...o, hint: 'Ngồi bệt dưới sàn, 2 tay quặt sau lưng. Người chơi bị trói thì không đi được. Người lạ: có thể tick "Bị trói" ngay ở việc "Người lạ xuất hiện".' }));
      else box.append(
        field('Số lần bấm E', numInput(a.need ?? 14, (v) => { a.need = v; ctx.changed('story'); }, { step: 1, min: 3, max: 60 }), { ...o, hint: 'Ngừng bấm thì dây lỏng lại chút (thanh tụt). Lúc cắt dây người chơi đứng yên.' }),
        textBox('Chữ cạnh nút E', a.text || (a.text = 'story.qte.untie'), 1, o));
    }
    if (a.do === 'ship') {
      box.append(field('Tàu', selectInput(a.state || 'dock', [['dock', '⚓ Cập bến (đậu ở chỗ dưới)'], ['leave', '🌊 Rời bến (chạy ra theo mũi tàu rồi mất)'], ['gone', '✖ Biến mất ngay']], (v) => { a.state = v; rerender(); }), { ...o, hint: 'Tàu dài 120 m, rộng 22 m, cầu thang mạn bên trái (theo hướng mũi tàu). Mặc định đậu sát bờ Kho 7, mũi chĩa ra cửa sông Ngân. Trạng thái lưu trong bản lưu: mở lại game vẫn thấy tàu.' }));
      if ((a.state || 'dock') === 'dock') box.append(
        field('Chỗ đậu [x, z] (giữa tàu)', el('div', { class: 'row' }, ...[0, 1].map((i) => numInput((a.at ||= [163, 265])[i], (v) => { a.at[i] = v; ctx.changed('story'); }, { step: 1 }))), o),
        field('Hướng mũi tàu (độ, 0 = về nam)', numInput(a.heading ?? 0, (v) => { a.heading = v; ctx.changed('story'); }, { step: 90, min: -360, max: 360 }), o));
    }
    if (a.do === 'traffic') box.append(field('Bán kính (0 = trả lại xe)', numInput(a.clear ?? 40, (v) => { a.clear = v; ctx.changed('story'); }, { step: 5, min: 0, max: 200 }), { ...o, hint: 'Tạm giấu xe máy, ô tô, xe buýt NPC quanh chỗ người chơi đang đứng — xe chạy vào vùng cũng bị giấu — tới khi có việc này với bán kính 0 (hoặc người lạ "lên xe chạy đi" xong). Chỉ máy người chơi này. Dùng cho cảnh đông người đứng giữa đường (vd triển lãm).' }));
    if (!['title', 'end', 'cine', 'chase'].includes(a.do)) box.append(field(a.do === 'bubble' ? 'Nói sau (giây)' : a.do === 'sound' ? 'Phát sau (giây)' : 'Làm sau (giây)', numInput(a.after ?? 0, (v) => { if (v > 0) a.after = v; else delete a.after; ctx.changed('story'); }, { step: 0.5, min: 0, max: 60 }), { ...o, hint: 'Đợi bấy nhiêu giây (đồng hồ game của người chơi, ~ giây thật) mới làm — vd trong cảnh phim mọi người nói lần lượt, tin nhắn nhóm tới lần lượt. 0 = ngay.' }));
    if (a.do === 'sneak') {
      a.route ||= [];
      const setN = (k, v, ok) => { if (ok(v)) a[k] = v; else delete a[k]; ctx.changed('story'); };
      box.append(
        el('p', { class: 'muted' }, 'Người lạ đi theo các điểm [x, z] (dắt theo người "đi cùng"); điểm có "ngoái lại" thì dừng, quay về phía sau nhìn bấy nhiêu giây (dấu ?). Người chơi theo sau: đang ngoái lại mà thấy người chơi (trong tầm nhìn, không bị tường / thùng rác che) thì bị nghi tăng; đi sát quá / chạy / đi xe gần cũng bị nghe. Bị nghi đầy hoặc bỏ xa quá → màn đen, làm lại từ đầu (người chơi về "chỗ làm lại"). Tới điểm cuối → điều kiện "Bám theo lén xong". Đặt thùng rác (đạo cụ 🗑️) dọc đường làm chỗ núp.'),
        el('div', { class: 'grid' },
          field('Người đi cùng', selectInput(a.with || '', [['', '— Không —'], ...actorOpts().filter(([id]) => id !== a.who)], (v) => { if (v) a.with = v; else delete a.with; ctx.changed('story'); }), o),
          field('Tốc độ đi', numInput(a.speed ?? 1.3, (v) => setN('speed', v, (x) => x > 0), { step: 0.1, min: 0.5, max: 4 }), o),
          field('Tầm nhìn khi ngoái lại', numInput(a.see ?? 11, (v) => setN('see', v, (x) => x > 0), { step: 1, min: 3, max: 30 }), o),
          field('Bỏ xa quá thì mất dấu', numInput(a.lose ?? 24, (v) => setN('lose', v, (x) => x > 0), { step: 1, min: 8, max: 80 }), o),
          field('Người chơi tới gần bao nhiêu thì bắt đầu đi', numInput(a.start ?? 16, (v) => setN('start', v, (x) => x > 0), { step: 1, min: 2, max: 60 }), o),
          field('Chỗ làm lại [x, z]', el('div', { class: 'row' }, ...[0, 1].map((i) => numInput((a.retry || [0, 0])[i], (v) => { a.retry = [...(a.retry || [0, 0])]; a.retry[i] = v; ctx.changed('story'); }, { step: 0.5 }))), { ...o, hint: 'Bị phát hiện → người chơi đứng ở đây (vd ngoài miệng hẻm).' })));
      a.route.forEach((r, k) => box.append(el('div', { class: 'row' }, el('b', {}, `${k + 1}.`),
        numInput(r.at?.[0] ?? 0, (v) => { r.at = [v, r.at?.[1] ?? 0]; ctx.changed('story'); }, { step: 0.5 }),
        numInput(r.at?.[1] ?? 0, (v) => { r.at = [r.at?.[0] ?? 0, v]; ctx.changed('story'); }, { step: 0.5 }),
        el('label', { class: 'muted' }, 'ngoái lại (giây) ', numInput(r.look ?? 0, (v) => { if (v > 0) r.look = v; else delete r.look; ctx.changed('story'); }, { step: 0.5, min: 0, max: 10 })),
        button('✕', () => { a.route.splice(k, 1); rerender(); }, 'small danger'))));
      box.append(button('＋ Điểm', () => { a.route.push({ at: [...(a.route.at(-1)?.at || [0, 0])] }); rerender(); }, 'small'));
    }
    if (a.do === 'fade') {
      const rm = new Set([].concat(a.remove || []));
      box.append(
        el('p', { class: 'muted' }, 'Màn hình tối dần → hiện chữ → sáng lại. Lúc tối hẳn: dọn những người lạ được tick (vd tên cướp đã bị áp giải), dọn đạo cụ (xe công an…), người lạ "đứng lại" đứng dậy trước mặt người chơi. Cất điện thoại, thôi ghì. Đồng hồ vẫn chạy (bước sau nên chờ ≥ thời gian tối + 1,5 phút).'),
        textBox('Chữ trên màn đen', a.text, 1, o),
        el('div', { class: 'grid' },
          field('Giữ tối (giây)', numInput(a.t ?? 2, (v) => { a.t = v; ctx.changed('story'); }, { step: 0.5, min: 0.5, max: 10 }), o),
          field('', checkInput(a.props === true, (v) => { if (v) a.props = true; else delete a.props; rerender(); }, 'Dọn hết đạo cụ'), o),
          field('Tua giờ (phút, như ngủ dậy)', numInput(a.skip ?? 0, (v) => { if (v > 0) { a.skip = v; delete a.skipTo; } else delete a.skip; ctx.changed('story'); }, { step: 10, min: 0, max: 720 }), { ...o, hint: 'Vd "2 tiếng sau…" = 120. Đồng hồ nhảy thật (như ngủ dậy) lúc màn hình tối.' }),
          field('… hoặc tua tới giờ', numInput(a.skipTo ?? 0, (v) => { if (v > 0) { a.skipTo = v; delete a.skip; } else delete a.skipTo; ctx.changed('story'); }, { step: 0.25, min: 0, max: 23.75 }), { ...o, hint: 'Vd 11 = tua tới 11h (đang trước giờ đó). 0 = không.' }),
          field('Người đứng lại trước mặt', selectInput(a.stand || '', [['', '— Không —'], ...actorOpts()], (v) => { if (v) a.stand = v; else delete a.stand; rerender(); }), o),
          a.stand ? field('Cách người chơi (m)', numInput(a.dist ?? 2.2, (v) => { a.dist = v; ctx.changed('story'); }, { step: 0.1, min: 1, max: 6 }), o) : null),
        field('Dọn người lạ', el('div', { class: 'chips' }, actorOpts().map(([id, label]) => checkInput(rm.has(id), (on) => {
          if (on) rm.add(id); else rm.delete(id);
          if (rm.size) a.remove = [...rm]; else delete a.remove;
          ctx.changed('story');
        }, label))), o),
        a.props === true ? null : (() => {
          const ids = (data.chapters.find((c) => c.id === sel.ch)?.steps || []).flatMap((x) => x.on || []).filter((y) => y.do === 'prop' && y.id).map((y) => y.id);
          const cur = new Set(Array.isArray(a.props) ? a.props : []);
          return field('Dọn mấy đạo cụ này', el('div', { class: 'chips' }, ids.map((id) => checkInput(cur.has(id), (on) => {
            if (on) cur.add(id); else cur.delete(id);
            if (cur.size) a.props = [...cur]; else delete a.props;
            ctx.changed('story');
          }, id))), o);
        })());
    }
    if (a.do === 'helmetOff') box.append(el('p', { class: 'muted' }, 'Người lạ đang đội mũ bảo hiểm (đang ngồi xe thì tự xuống trước): 2 tay giơ lên gỡ nón khỏi đầu (lộ tóc — kiểu tóc riêng của bộ đồ trong sơ đồ quan hệ), hạ xuống cầm nón tay phải.'));
    if (a.do === 'board') box.append(el('p', { class: 'muted' }, 'Người lạ đi theo người chơi; người chơi lên xe và chạy tới sát thì leo lên ngồi sau (tự đội mũ của mình, không qua app, không tính tiền). Dùng với điều kiện "Đã chở người lạ … tới …".'));
    if (a.do === 'alight') box.append(el('p', { class: 'muted' }, 'Người lạ xuống xe, đứng cạnh xe.'));
    if (a.do === 'drop') box.append(field('Gói hàng', parcelChips(a, 'id'), { ...o, hint: 'Tick 1 hay nhiều gói (vd 3 bức tranh) — gói nào người chơi đang chở thì giao luôn.' }));
    if (a.do === 'bubble') box.append(
      field('Ai nói', selectInput(a.who, [['player', '🙂 Người chơi'], ...speakerOpts2()], (v) => { a.who = v; ctx.changed('story'); }), o),
      textBox('Câu (bong bóng)', a.text, 2, { hint: 'Câu ngắn, hiện trên đầu ~3–9 giây (hoặc giữ tới câu sau). Không có chữ đậm / [tiếp]. {name} = tên người chơi', ...o }),
      field('Giữ tới câu sau', checkInput(!!a.hold, (v) => { if (v) a.hold = true; else delete a.hold; ctx.changed('story'); }, 'Không tự tắt'), { ...o, hint: 'Hợp với bước chờ người chơi bấm E (câu chỉ đổi khi bấm E / đi xa).' }));
    if (a.do === 'say') box.append(field('Người nói', selectInput(a.who, speakerOpts, (v) => { a.who = v; ctx.changed('story'); }), { ...o, hint: 'Bong bóng trên đầu người lạ đang có mặt, hoặc NPC ở địa điểm của người trong danh bạ (không có thì trên đầu người chơi).' }), textBox('Câu nói', a.text, 4, { hint: '[tiếp] = câu sau (bấm E) · {name} = tên người chơi', ...o }));
    if (a.do === 'msg') {
      box.append(field('Người gửi', selectInput(a.from, contactOpts, (v) => { a.from = v; rerender(); }), o), textBox('Nội dung tin nhắn', a.text, 2, { hint: '{name} = tên người chơi', ...o }));
      if (data.contacts[a.from]?.group) box.append(el('div', { class: 'grid' },
        field('', checkInput(!!a.sys, (v) => { if (v) { a.sys = true; delete a.as; } else delete a.sys; rerender(); }, 'Dòng hệ thống (giữa khung, chữ nhỏ)'), { ...o, hint: 'Vd "Chú Tư đã thêm bạn vào nhóm …".' }),
        a.sys ? null : field('Ai gửi trong nhóm', checkInput(!!a.as, (v) => { if (v) a.as = newKey(`${base}.as`); else delete a.as; rerender(); }, 'Ghi tên người gửi'), { ...o, hint: 'Hiện tên nhỏ trên tin nhắn (vd "Hùng Grip"). Không tick: không có tên.' })),
        a.as && !a.sys ? textBox('Tên người gửi', a.as, 1, o) : null);
      a.loc = a.loc || [];
      box.append(field('Kèm định vị (nút 📍 Chỉ đường)', el('div', { class: 'chips' },
        a.loc.map((id, j) => button(`📍 ${[...spotOpts(), ...placeOpts].find(([p]) => p === id)?.[1] || id} ✕`, () => { a.loc.splice(j, 1); if (!a.loc.length) delete a.loc; rerender(); }, 'small')),
        selectInput('', [['', '＋ Thêm định vị…'], ...spotOpts(), ...placeOpts], (v) => { if (v) { a.loc.push(v); rerender(); } })), o));
    }
    if (a.do === 'replies') {
      box.append(field('Tin nhắn của', selectInput(a.who, contactOpts, (v) => { a.who = v; ctx.changed('story'); }), { ...o, hint: 'Gắn vào cuộc trò chuyện này; người chơi chọn 1 câu → xong điều kiện "Đã trả lời".' }));
      (a.texts || []).forEach((key, j) => box.append(answerRow(a, 'texts', j, `Câu trả lời ${j + 1}`, rerender, o)));
    }
    if (a.do === 'item') box.append(field('Vật phẩm', selectInput(a.id, Object.entries(data.items).map(([id, it]) => [id, `${it.icon || ''} ${C[it.name] || id}`]), (v) => { a.id = v; ctx.changed('story'); }), o));
    if (a.do === 'give') box.append(field('Đồ tặng', selectInput(a.goods, goodsOpts, (v) => { a.goods = v; ctx.changed('story'); }), o));
    if (a.do === 'toast') box.append(textBox('Thông báo', a.text, 2, o));
    if (a.do === 'rename') box.append(textBox('Tên mới (hiện trên bong bóng)', a.name, 1, { ...o, hint: 'Từ bước này trở đi bong bóng của người này ghi tên mới (lưu theo bản lưu, giữ qua các chương sau).' }));
    if (a.do === 'pay') box.append(el('div', { class: 'grid' },
      field('Số tiền (nghìn đồng)', numInput(a.amount ?? 50, (v) => { a.amount = Math.max(1, Math.round(v) || 1); ctx.changed('story'); }, { step: 10, min: 1, max: 5000 }), { ...o, hint: 'Vào ví người chơi ngay (sổ thu: "Người quen trả công"). So sánh: tiền nhà kỳ đầu 200k, mỗi kỳ +200k.' }),
      field('Người trả', selectInput(a.from || '', [['', '— Không ghi tên —'], ...contactOpts, ...speakerOpts2().filter(([id]) => !data.contacts[id])], (v) => { if (v) a.from = v; else delete a.from; ctx.changed('story'); }), { ...o, hint: 'Thông báo mặc định: "💵 {tên} gửi {k}k". Gõ câu riêng ở dưới nếu muốn ({k} = số tiền, {who} = người trả).' }),
      field('Câu riêng', checkInput(!!a.text, (v) => { if (v) a.text = newKey(`${base}.pay`); else delete a.text; rerender(); }, 'Dùng câu thông báo riêng'), o)),
      a.text ? textBox('Thông báo nhận tiền', a.text, 1, o) : null);
    if (a.do === 'openPhone') {
      box.append(field('Mở app', selectInput(a.app || 'chat', Object.keys(APP_DEFS).map((id) => [id, `${APP_DEFS[id].icon} ${C[APP_DEFS[id].key] || id}`]), (v) => { if (v === 'chat') delete a.app; else { a.app = v; delete a.who; } rerender(); }), o));
      if (!a.app || a.app === 'chat') box.append(field('Mở tin nhắn của', selectInput(a.who || '', [['', '— Chỉ mở app Tin nhắn —'], ...contactOpts], (v) => { if (v) a.who = v; else delete a.who; ctx.changed('story'); }), o));
    }
    if (a.do === 'ttPost') box.append(ttPostEditor(a, base, rerender, o));
    if (a.do === 'block') box.append(field('Người chặn', selectInput(a.who || '', contactOpts, (v) => { a.who = v; ctx.changed('story'); }), { ...o, hint: 'Cuộc trò chuyện hiện "Bạn đã bị chặn", không trả lời được nữa; tin Tích Tắc của người này biến mất.' }));
    if (a.do === 'ambushCrew') box.append(
      el('p', { class: 'muted' }, 'Ở mỗi chốt có vài xe máy anh em đứng chặn, đầu xe quay vào giữa vùng vây. Chỉ để nhìn (máy người chơi này). Màn đen "dọn hết đạo cụ" thì dọn. Bày trận vẽ tự do (nhiều màn) không dính bản đồ thật → ghi các ngã tư thật đứng chốt ở dưới; bỏ trống = theo chốt người chơi đặt (bày trận 1 màn bản đồ thật).'),
      field('Số xe mỗi chốt', numInput(a.per ?? 2, (v) => { a.per = Math.max(1, Math.min(4, Math.round(v) || 1)); ctx.changed('story'); }, { step: 1, min: 1, max: 4 }), o),
      nodeList(a, 'nodes', 'Ngã tư thật đứng chốt [cột, hàng]', 'Cột 0 = đường dọc phía tây, hàng 0 = đường ngang phía bắc (sông ở hàng 7).', rerender, o, 0, 10));
    if (a.do === 'ambush') box.append(a.rounds ? roundsEditor(a, rerender, o) : ambushEditor(a, rerender, o));
    if (a.do === 'borrow') {
      const storyBikes = Object.values(ctx.data.gear?.vehicles || {}).filter((v) => v.story).map((v) => [v.id, `${v.name} (${v.id})`]);
      box.append(
        field('', checkInput(!!a.off, (v) => { if (v) { a.off = true; for (const k of ['vehicle', 'from', 'fuel']) delete a[k]; } else delete a.off; rerender(); }, 'Trả xe mượn (xe mình nằm trong hầm nhà trọ)'), o),
        ...(a.off ? [] : [
          field('Xe mượn', selectInput(a.vehicle || '', [['', '— chọn —'], ...storyBikes], (v) => { a.vehicle = v; ctx.changed('story'); }), { ...o, hint: 'Xe có đánh dấu "Xe cốt truyện" ở thẻ Xe/Túi/Đồ nghề (không bán, không có ở cửa hàng).' }),
          field('Lấy ở đạo cụ', selectInput(a.from || '', [['', '— ngay chỗ xe mình đang đậu —'], ...propOpts()], (v) => { if (v) a.from = v; else delete a.from; ctx.changed('story'); }), { ...o, hint: 'Đạo cụ xe dựng sẵn (vd 🏍️ mô tô anh Đạt): xe mượn hiện đúng chỗ đó, đạo cụ biến mất.' }),
          field('Xăng lúc nhận (%)', numInput(a.fuel ?? 60, (v) => { a.fuel = v; ctx.changed('story'); }, { step: 5, min: 0, max: 100 }), o),
        ]));
    }
    if (a.do === 'kit') {
      const ws = Object.entries(ctx.data.story?.weapons || {}).filter(([id]) => id !== 'fists' && id !== 'brick');
      box.append(
        field('', checkInput(!!a.clear, (v) => { if (v) { a.clear = true; delete a.give; delete a.card; } else { delete a.clear; a.give ||= {}; } rerender(); }, '🧹 Dọn sạch túi (hết đoạn đánh nhau)'), o),
        a.clear ? null : field('', checkInput(!!a.card, (v) => { if (v) a.card = true; else delete a.card; ctx.changed('story'); }, '📋 Hiện thẻ "Trong túi có gì" (tác dụng + dùng khi từng món)'), { ...o, hint: 'Bấm E cất thẻ. Bước chờ "Đã đọc xong thẻ túi đồ" thì trận bắt đầu sau khi cất. Phím I xem lại lúc nào cũng được.' }),
        ...(a.clear ? [] : [field('Cho vào túi (số món · thứ tự = ô 1–0)', el('div', {},
          ...Object.entries(a.give ||= {}).map(([id, c]) => el('div', { class: 'row' }, el('span', {}, `${ctx.data.story?.weapons?.[id]?.icon || '❓'} ${id}`), numInput(c, (v) => { a.give[id] = Math.max(1, Math.round(v) || 1); ctx.changed('story'); }, { step: 1, min: 1, max: 20 }), button('✕', () => { delete a.give[id]; rerender(); }, 'small'))),
          el('div', { class: 'row' }, selectInput('', [['', '＋ Thêm món…'], ...ws.filter(([id]) => !(id in a.give)).map(([id, w]) => [id, `${w.icon || ''} ${id}`])], (v) => { if (v) { a.give[v] = 1; rerender(); } }))), { ...o, hint: 'Đồ shipper dùng đánh nhau (thẻ ⚔️ Đánh nhau → Vũ khí & đồ ném). Túi lưu trong bản lưu; trận thua thì túi trở lại như lúc bắt đầu trận.' })]));
    }
    if (a.do === 'fuel') box.append(field('Xăng / pin còn (%)', numInput(a.pct ?? 15, (v) => { a.pct = v; ctx.changed('story'); }, { step: 5, min: 0, max: 100 }), o));
    if (a.do === 'offer') {
      const foodPlaces = ctx.data.places.places.filter((p) => isPlaced(p) && p.kind === 'restaurant' && (p.menu || []).length).map((p) => [p.id, `${p.name} (${p.id})`]);
      box.append(
        field('Loại đơn', selectInput(a.kind || 'ride', [['ride', '🛵 Chở khách (khách người lớn bình thường, đứng gần mình)'], ['food', '🍜 Giao đồ ăn ở quán …'], ['parcel', '📦 Chở hàng: lấy món … ở địa điểm …']], (v) => {
          for (const k of ['kind', 'place', 'item', 'to', 'strict', 'minStars', 'failText', 'customer']) delete a[k];
          if (v === 'food') { a.kind = 'food'; a.place = foodPlaces[0]?.[0] || ''; }
          if (v === 'parcel') Object.assign(a, { kind: 'parcel', place: placeOpts[0]?.[0] || '', item: Object.keys(ctx.data.items).find((id) => ctx.data.items[id].parcel) || '' });
          rerender();
        }), o),
        a.kind === 'parcel' ? parcelOffer(a, base, rerender, o) : null,
        a.kind === 'food' ? el('div', { class: 'grid' },
          field('Giao tới', selectInput(a.to || '', [['', '— Nhà dân gần quán —'], ...placeOpts], (v) => { if (v) a.to = v; else delete a.to; ctx.changed('story'); }), { ...o, hint: 'Vd Kho 7: thủy thủ trên tàu đặt đồ ăn.' }),
          field('', checkInput(!!a.customer, (v) => { if (v) a.customer = newKey(`${base}.customer`); else delete a.customer; rerender(); }, 'Tên khách riêng'), o),
          a.customer ? textBox('Tên khách', a.customer, 1, o) : null) : null,
        a.kind === 'food' ? field('Quán', selectInput(a.place, foodPlaces, (v) => { a.place = v; ctx.changed('story'); }), { ...o, hint: 'Món đầu tiên trong thực đơn quán; giao tới nhà dân, không hết món, khách nghe máy. Quán nấu riêng nên không xét giờ mở cửa.' })
          : a.kind === 'parcel' ? null : field('Tên khách', textInput(a.customer || '', (v) => { if (v.trim()) a.customer = v.trim(); else delete a.customer; ctx.changed('story'); }, { placeholder: 'Bỏ trống = tên người lớn bình thường' }), { ...o, hint: 'Vd "Cô Hằng". Chữ đầu (Cô / Chú / Anh / Chị…) quyết định giới tính, tuổi, cách xưng hô.' }),
        el('p', { class: 'muted' }, 'Không hết hạn, nút Bỏ qua bị khóa. Nên tick "Chặn đơn thường" ở bước này (và bước bật công tắc ngay trước) để đơn ngẫu nhiên không chen vào.'));
    }
    return box;
  }

  // 📱 Tin Tích Tắc của cốt truyện: người đăng, ảnh chụp thật trong game, chú thích, bình luận
  function ttPostEditor(a, base, rerender, o) {
    const ph = (a.photo ||= {}), photoAt = Array.isArray(ph.at);
    a.comments ||= [];
    const opt2 = (k, label, sfx) => (a[k]
      ? el('div', {}, textBox(label, a[k], 1, o), button('✕', () => { delete a[k]; rerender(); }, 'small'))
      : button(`＋ ${label}`, () => { a[k] = newKey(`${base}.${sfx}`); rerender(); }, 'small'));
    return el('div', {},
      el('p', { class: 'muted' }, 'Tin nằm đầu danh sách app Tích Tắc (ảnh chụp thật trong game, chỉ người chơi này thấy, lưu theo bản lưu). Người đăng chặn người chơi (việc "⛔ Chặn") thì tin biến mất. Điều kiện "Đã lướt tới tin Tích Tắc" dùng mã tin.'),
      el('div', { class: 'grid' },
        field('Mã tin', textInput(a.id || '', (v) => { if (ID_RE.test(v)) { a.id = v; ctx.changed('story'); } }), o),
        field('Người đăng', selectInput(a.who || '', [['', '— Không —'], ...actorOpts(), ...contactOpts], (v) => { if (v) a.who = v; else delete a.who; ctx.changed('story'); }), { ...o, hint: 'Để biết tin của ai (người đó chặn mình thì tin mất).' }),
        field('Lượt thích', numInput(a.likes ?? 1200, (v) => { a.likes = Math.max(0, Math.round(v) || 0); ctx.changed('story'); }, { step: 100, min: 0 }), o),
        field('Ảnh chụp', selectInput(photoAt ? 'at' : 'actor', [['actor', '👤 Người lạ (kèm xe nếu có)'], ['at', '📍 Từ chỗ [x, z] nhìn về [x, z]']], (v) => { a.photo = v === 'at' ? { at: [0, 0], look: [0, 10] } : { actor: Object.keys(data.people)[0] || '' }; rerender(); }), o),
        photoAt
          ? field('Máy ảnh ở [x, z] → nhìn về [x, z]', el('div', { class: 'row' }, ...[0, 1].map((k) => numInput(ph.at[k], (v) => { ph.at[k] = v; ctx.changed('story'); }, { step: 1 })), ...[0, 1].map((k) => numInput((ph.look ||= [0, 0])[k], (v) => { ph.look[k] = v; ctx.changed('story'); }, { step: 1 }))), o)
          : field('Chụp người lạ', selectInput(ph.actor || '', actorOpts(), (v) => { ph.actor = v; ctx.changed('story'); }), { ...o, hint: 'Người này phải đang có mặt (việc "Người lạ xuất hiện" ở bước này / trước, nên kèm xe).' })),
      a.author ? textBox('Tên tài khoản (không cần @)', a.author, 1, o) : button('＋ Tên tài khoản riêng', () => { a.author = newKey(`${base}.ttAuthor`); rerender(); }, 'small'),
      a.caption ? textBox('Chú thích', a.caption, 2, o) : button('＋ Chú thích', () => { a.caption = newKey(`${base}.ttCap`); rerender(); }, 'small'),
      opt2('music', 'Tên nhạc nền', 'ttMusic'),
      opt2('overlay', 'Chữ đè lên ảnh', 'ttOverlay'),
      ...a.comments.map((k, j) => el('div', {}, textBox(`Bình luận ${j + 1}`, k, 1, { ...o, hint: 'Dạng "tên: nội dung" — phần trước dấu : là tên người bình luận.' }), button('✕', () => { a.comments.splice(j, 1); rerender(); }, 'small'))),
      button('＋ Bình luận', () => { a.comments.push(newKey(`${base}.ttC${a.comments.length + 1}`)); rerender(); }, 'small'));
  }
  // 📦 Mời đơn chở hàng: lấy món ở địa điểm, giao nhà dân gần đó (hoặc địa điểm), chấm điểm thật + cần đủ sao
  function parcelOffer(a, base, rerender, o) {
    const items = Object.values(ctx.data.items).filter((it) => it.parcel).map((it) => [it.id, `${it.icon || ''} ${it.name}`]);
    return el('div', {},
      el('div', { class: 'grid' },
        field('Lấy ở', selectInput(a.place || '', placeOpts, (v) => { a.place = v; ctx.changed('story'); }), { ...o, hint: 'Bấm E ở cửa địa điểm này lấy hàng (không xét giờ mở cửa).' }),
        field('Món', selectInput(a.item || '', items, (v) => { a.item = v; ctx.changed('story'); }), { ...o, hint: 'Món "Hàng giao" ở thẻ Vật phẩm — đặc tính dễ vỡ / nước… tính như đơn thường.' }),
        field('Giao tới', selectInput(a.to || '', [['', '— Nhà dân gần chỗ lấy —'], ...placeOpts], (v) => { if (v) a.to = v; else delete a.to; ctx.changed('story'); }), o),
        field('', checkInput(!!a.strict, (v) => { if (v) a.strict = true; else { delete a.strict; delete a.minStars; delete a.failText; } rerender(); }, 'Chấm điểm thật'), { ...o, hint: 'Trễ / hư hàng bị trừ sao như đơn thường. Không tick: đơn cốt truyện luôn 5★.' }),
        a.strict ? field('Cần ít nhất (sao, 0 = không xét)', numInput(a.minStars ?? 0, (v) => { if (v >= 1) a.minStars = Math.min(5, Math.round(v)); else { delete a.minStars; delete a.failText; } rerender(); }, { step: 1, min: 0, max: 5 }), { ...o, hint: 'Chưa đủ sao: hiện câu dưới, chưa xong bước, vài giây sau mời lại đơn mới.' }) : null,
        field('', checkInput(!!a.customer, (v) => { if (v) a.customer = newKey(`${base}.customer`); else delete a.customer; rerender(); }, 'Tên khách riêng'), { ...o, hint: 'Không tick: tên người bình thường ngẫu nhiên.' })),
      a.customer ? textBox('Tên khách', a.customer, 1, o) : null,
      a.minStars ? (a.failText ? textBox('Câu khi chưa đủ sao ({stars} = số sao)', a.failText, 1, o) : button('＋ Câu khi chưa đủ sao', () => { a.failText = newKey(`${base}.fail`); rerender(); }, 'small')) : null);
  }
  // danh sách ngã tư [cột, hàng] (thêm / xóa) — dùng cho bày trận + anh em đứng chốt
  function nodeList(obj, key, label, hint, rerender, o, min = -1, max = 12) {
    obj[key] ||= [];
    const nodeIn = (n, set) => el('span', { class: 'row' }, ...[0, 1].map((k) => numInput(n?.[k] ?? 0, (v) => { const m = [...(n || [0, 0])]; m[k] = Math.round(v); set(m); rerender(); }, { step: 1, min, max })));
    return field(label, el('div', {},
      ...obj[key].map((n, j) => el('div', { class: 'row' }, nodeIn(n, (m) => { obj[key][j] = m; }), button('✕', () => { obj[key].splice(j, 1); rerender(); }, 'small danger'))),
      button('＋ Ngã tư', () => { obj[key].push([...(obj[key].at(-1) || [0, 0])]); rerender(); }, 'small')), { ...o, hint });
  }
  // 🗺️ Bày trận nhiều màn vẽ tự do (rounds): mỗi màn 1 lưới ngã tư, khó dần — thắng màn này mới sang màn sau
  function roundsEditor(a, rerender, o) {
    const nodeIn = (n, set, min = -1, max = 12) => el('span', { class: 'row' }, ...[0, 1].map((k) => numInput(n?.[k] ?? 0, (v) => { const m = [...(n || [0, 0])]; m[k] = Math.round(v); set(m); rerender(); }, { step: 1, min, max })));
    const wrap = el('div', {}, el('p', { class: 'muted' }, 'Bản đồ vẽ tự do (không theo đường thật). Mỗi màn: lưới cột × hàng ngã tư, ngã tư [cột, hàng] tính từ góc trên trái = [0, 0]. Lối thoát và đường cụt ngập nằm NGOÀI lưới, sát 1 ngã tư mép (vd cột −1 hoặc = số cột). Tí Sún chạy đường ngắn nhất né chốt ra lối thoát gần nhất; chặn hết thì lao vào đường cụt = thắng màn. Thắng màn cuối → "Chốt kế hoạch" → điều kiện "Đã bày chốt đúng".'));
    a.rounds.forEach((R, k) => {
      let check;
      try {
        const n = ambushSolutions(roundDef(R), roundNb(R), R.blocks ?? 1).length, less = (R.blocks ?? 1) > 1 ? ambushSolutions(roundDef(R), roundNb(R), (R.blocks ?? 1) - 1).length : 0;
        check = !n ? `❌ Không có cách đặt ${R.blocks ?? 1} chốt nào thắng — người chơi kẹt.` : less ? `⚠️ ${n} cách thắng, nhưng ít chốt hơn cũng thắng → dễ quá.` : `✅ Có ${n} cách đặt ${R.blocks ?? 1} chốt để thắng.`;
      } catch { check = '❌ Màn này chưa đúng.'; }
      R.cut ||= [];
      wrap.append(el('div', { class: 'card' },
        el('div', { class: 'row' }, el('b', {}, `Màn ${k + 1}`),
          button('↑', () => { if (k > 0) { a.rounds.splice(k - 1, 0, a.rounds.splice(k, 1)[0]); rerender(); } }, 'small'),
          button('↓', () => { if (k < a.rounds.length - 1) { a.rounds.splice(k + 1, 0, a.rounds.splice(k, 1)[0]); rerender(); } }, 'small'),
          button('✕', () => { if (a.rounds.length > 1) { a.rounds.splice(k, 1); rerender(); } }, 'small danger')),
        el('div', { class: 'grid' },
          field('Lưới: số cột, số hàng', el('div', { class: 'row' }, numInput(R.cols, (v) => { R.cols = Math.max(2, Math.min(9, Math.round(v) || 2)); rerender(); }, { step: 1, min: 2, max: 9 }), numInput(R.rows, (v) => { R.rows = Math.max(2, Math.min(8, Math.round(v) || 2)); rerender(); }, { step: 1, min: 2, max: 8 })), o),
          field('Tí Sún đứng ở', nodeIn(R.start, (m) => { R.start = m; }), o),
          field('Ngã tư dẫn vào đường cụt ngập', nodeIn(R.trap, (m) => { R.trap = m; }), o),
          field('Đường cụt ngập (ngoài lưới)', nodeIn(R.trapTo, (m) => { R.trapTo = m; }), o),
          field('Số chốt người chơi đặt', numInput(R.blocks ?? 1, (v) => { R.blocks = Math.max(1, Math.min(6, Math.round(v) || 1)); rerender(); }, { step: 1, min: 1, max: 6 }), o)),
        nodeList(R, 'exits', 'Lối thoát (ngoài lưới, sát ngã tư mép)', 'Tới đây là nó thoát.', rerender, o),
        nodeList(R, 'fixed', 'Chốt chú Tư giữ sẵn', 'Người chơi không gỡ được.', rerender, o),
        field('Đoạn đường bị đứt', el('div', {},
          ...R.cut.map((c, j) => el('div', { class: 'row' }, nodeIn(c[0], (m) => { R.cut[j][0] = m; }), el('span', { class: 'muted' }, '—'), nodeIn(c[1], (m) => { R.cut[j][1] = m; }), button('✕', () => { R.cut.splice(j, 1); rerender(); }, 'small danger'))),
          button('＋ Đoạn đứt', () => { R.cut.push([[0, 0], [1, 0]]); rerender(); }, 'small')), { ...o, hint: '2 ngã tư sát nhau — đoạn đường giữa chúng bị đứt (vẽ vạch đỏ ✕).' }),
        el('p', { class: check.startsWith('✅') ? 'muted' : 'warn' }, check)));
    });
    wrap.append(button('＋ Thêm màn', () => { a.rounds.push(JSON.parse(JSON.stringify(a.rounds.at(-1)))); rerender(); }, 'small'));
    return wrap;
  }
  // 🗺️ Bày trận: khung ngã tư, chỗ người bị vây, chỗ bẫy, lối thoát, chốt giữ sẵn + kiểm tra có lời giải
  function ambushEditor(a, rerender, o) {
    const nodeIn = (n, set) => el('span', { class: 'row' }, ...[0, 1].map((k) => numInput(n?.[k] ?? 0, (v) => { const m = [...(n || [0, 0])]; m[k] = Math.round(v); set(m); rerender(); }, { step: 1, min: 0, max: 10 })));
    const list = (key, label, hint) => {
      a[key] ||= [];
      return field(label, el('div', {},
        ...a[key].map((n, j) => el('div', { class: 'row' }, nodeIn(n, (m) => { a[key][j] = m; }), button('✕', () => { a[key].splice(j, 1); rerender(); }, 'small danger'))),
        button('＋ Ngã tư', () => { a[key].push([...(a[key].at(-1) || a.start || [0, 0])]); rerender(); }, 'small')), { ...o, hint });
    };
    a.region ||= [0, 4, 0, 3];
    let check;
    try {
      const k = a.blocks ?? 3, n = ambushSolutions(a, neighbors).length, less = k > 1 ? ambushSolutions(a, neighbors, k - 1).length : 0;
      check = !n ? `❌ Không có cách đặt ${k} chốt nào thắng — người chơi kẹt.` : less ? `⚠️ ${n} cách thắng, nhưng ít chốt hơn cũng thắng → dễ quá.` : `✅ Có ${n} cách đặt ${k} chốt để thắng.`;
    } catch { check = '❌ Khung / ngã tư chưa đúng.'; }
    return el('div', {},
      el('p', { class: 'muted' }, 'Mở bản đồ nhỏ các ngã tư trong khung: người chơi bấm ngã tư đặt chốt anh em, bấm "Cho nó chạy thử" — người bị vây chạy đường ngắn nhất né chốt ra lối thoát gần nhất; hết lối thoát thì chạy vào chỗ bẫy (thắng) → "Chốt kế hoạch" → điều kiện "Đã bày chốt đúng". Chỗ chốt được nhớ cho việc "🛵 Anh em đứng chốt". Ngã tư [cột, hàng]: cột 0 = đường dọc phía tây, hàng 0 = đường ngang phía bắc (sông ở hàng 7, chỉ qua được ở cầu).'),
      el('div', { class: 'grid' },
        field('Khung: cột đầu, cột cuối, hàng đầu, hàng cuối', el('div', { class: 'row' }, ...[0, 1, 2, 3].map((k) => numInput(a.region[k], (v) => { a.region[k] = Math.round(v); rerender(); }, { step: 1, min: 0, max: 10 }))), o),
        field('Người bị vây đứng ở', nodeIn(a.start, (m) => { a.start = m; }), o),
        field('Ngã tư dẫn vào chỗ bẫy', nodeIn(a.trap, (m) => { a.trap = m; }), o),
        field('Hướng đường cụt (chỉ để vẽ)', nodeIn(a.trapTo, (m) => { a.trapTo = m; }), { ...o, hint: 'Ngã tư kế bên chỗ bẫy theo hướng đường cụt.' }),
        field('Số chốt người chơi đặt', numInput(a.blocks ?? 3, (v) => { a.blocks = Math.max(1, Math.min(6, Math.round(v) || 1)); rerender(); }, { step: 1, min: 1, max: 6 }), o)),
      list('exits', 'Lối thoát (qua cầu / ra khỏi khu)', 'Tới đây là nó thoát. Có thể nằm ngoài khung.'),
      list('fixed', 'Chốt anh em giữ sẵn', 'Người chơi không gỡ được — dùng để màn chơi chỉ có ít lời giải.'),
      el('p', { class: check.startsWith('✅') ? 'muted' : 'warn' }, check));
  }
  // 🎬 Cảnh phim: danh sách cảnh quay (nhìn vào đâu, bao lâu, góc máy) + xe người chơi tự chạy theo + dọn xe NPC
  function cineEditor(a, rerender, o) {
    a.shots ||= [];
    const chapter = sel.ch && data.chapters.find((c) => c.id === sel.ch);
    const props = (chapter?.steps || []).flatMap((x) => x.on || []).filter((y) => y.do === 'prop' && y.id).map((y) => [`prop:${y.id}`, `🚛 ${y.id}`]);
    const marks = (chapter?.steps || []).flatMap((x) => x.on || []).filter((y) => y.do === 'chase').flatMap((y) => (y.route || []).filter((r) => r.mark).map((r) => `${y.who}:${r.mark}`));
    const atOpts = [['player', '🙂 Người chơi'], ...actorOpts().map(([id, l]) => [`actor:${id}`, `👤 ${l}`]), ...props, ...placeOpts.map(([id, l]) => [`place:${id}`, `🏠 ${l}`])];
    const chasers = (chapter?.steps || []).flatMap((x) => x.on || []).filter((y) => y.do === 'chase').map((y) => [y.who, y.who]);
    const wrap = el('div', {}, el('p', { class: 'muted' }, 'Camera rời người chơi, chiếu lần lượt từng cảnh (cắt cảnh), có 2 dải đen trên dưới, ẩn bảng giao diện, khóa đi lại / lái xe. Đồng hồ vẫn chạy: 1 giây = 1 phút game → nên ngắn gọn. Bong bóng thoại / người lạ xuất hiện cùng bước vẫn hiện trong cảnh.'));
    a.shots.forEach((sh, k) => {
      const set = (key, v) => { sh[key] = v; ctx.changed('story'); };
      const setOpt = (key, v, keep = (x) => x != null && x !== '') => { if (keep(v)) sh[key] = v; else delete sh[key]; ctx.changed('story'); };
      const mode = sh.eye ? 'eye' : Array.isArray(sh.pos) ? 'pos' : 'rel';
      wrap.append(el('div', { class: 'story-act' },
        el('div', { class: 'row' }, el('b', {}, `🎥 Cảnh ${k + 1}`),
          button('↑', () => { if (k > 0) { a.shots.splice(k - 1, 0, a.shots.splice(k, 1)[0]); rerender(); } }, 'small'),
          button('↓', () => { if (k < a.shots.length - 1) { a.shots.splice(k + 1, 0, a.shots.splice(k, 1)[0]); rerender(); } }, 'small'),
          button('✕', () => { a.shots.splice(k, 1); rerender(); }, 'small danger')),
        el('div', { class: 'grid' },
          field('Kiểu máy quay', selectInput(mode, [['rel', '📍 Đặt quanh vật (cách xa, cao, góc)'], ['eye', '👁️ Góc nhìn thứ nhất (mắt người chơi)'], ['pos', '📌 Đặt cố định ở tọa độ']], (v) => {
            delete sh.eye; delete sh.pos;
            if (v === 'eye') sh.eye = true;
            if (v === 'pos') sh.pos = [0, 3, 0];
            rerender();
          }), { ...o, hint: 'Góc nhìn thứ nhất: camera ở mắt người chơi (người chơi + thùng hàng tạm ẩn), quay đầu được (yaw → yawTo). Cố định: máy quay đứng yên ở [x, cao, z], xoay nhìn theo "Nhìn theo".' }),
          mode === 'rel' ? field('Nhìn vào', selectInput(sh.at || 'player', atOpts, (v) => set('at', v)), { ...o, hint: 'Người lạ: phải đang có mặt (xuất hiện ở bước này / trước). Địa điểm: nhìn vào cửa. Đạo cụ: việc "🚛 Đạo cụ" trong chương.' }) : null,
          field('Dài (giây)', numInput(sh.t ?? 3, (v) => set('t', v), { step: 0.5, min: 0.5, max: 30 }), o),
          mode === 'rel' ? field('Cách xa (m)', numInput(sh.dist ?? 8, (v) => set('dist', v), { step: 0.5, min: 1, max: 80 }), o) : null,
          mode === 'rel' ? field('Cao (m)', numInput(sh.height ?? 3, (v) => set('height', v), { step: 0.5, min: -2, max: 60 }), o) : null,
          mode === 'rel' ? field('Góc (độ)', numInput(sh.angle ?? 0, (v) => set('angle', v), { step: 15, min: -360, max: 360 }), { ...o, hint: '0 = đứng trước mặt (địa điểm: trước cửa, nhìn vào) · 180 = sau lưng · 90 / −90 = hai bên.' }) : null,
          mode === 'rel' ? field('', checkInput(!!sh.follow, (v) => { if (v) sh.follow = true; else delete sh.follow; ctx.changed('story'); }, 'Bám theo (camera chạy theo)'), { ...o, hint: 'Không tick: camera đứng yên một chỗ, chỉ xoay nhìn theo. Tick: camera đi theo người lạ (vd xe tên cướp).' }) : null,
          mode === 'pos' ? field('Máy quay ở [x, cao, z]', el('div', { class: 'row' }, ...[0, 1, 2].map((i) => numInput(sh.pos[i] ?? 0, (v) => { sh.pos[i] = v; ctx.changed('story'); }, { step: i === 1 ? 0.5 : 1 }))), { ...o, hint: 'Cao tính từ mặt đất / mặt cầu. Xem tọa độ: ?debug → game.snapshot().pos. Đặt trên mặt đường cho khỏi bị nhà, cây che.' }) : null,
          mode === 'eye' ? field('Quay đầu từ (độ)', numInput(sh.yaw ?? 0, (v) => setOpt('yaw', v, (x) => x !== 0), { step: 15, min: -360, max: 360 }), { ...o, hint: '0 = nhìn thẳng tới · 180 = ngoái ra sau · 90 / −90 = nhìn sang trái / phải.' }) : null,
          mode === 'eye' ? field('… tới (độ)', numInput(sh.yawTo ?? sh.yaw ?? 0, (v) => setOpt('yawTo', v, (x) => x !== (sh.yaw ?? 0)), { step: 15, min: -360, max: 360 }), o) : null,
          mode === 'eye' ? field('Quay trong (giây)', numInput(sh.turn ?? sh.t ?? 1, (v) => setOpt('turn', v, (x) => x > 0), { step: 0.1, min: 0.1, max: 30 }), o) : null,
          mode === 'eye' ? field('Cúi nhìn (độ)', numInput(sh.pitch ?? -18, (v) => setOpt('pitch', v, (x) => x !== -18), { step: 2, min: -60, max: 30 }), { ...o, hint: 'Âm = cúi xuống (−18: thấy đầu xe, gương).' }) : null,
          field('Nhìn theo', selectInput(sh.lookAt || '', [['', mode === 'eye' ? '— Theo góc quay đầu —' : mode === 'pos' ? '— Chọn —' : '— Chính chỗ "Nhìn vào" —'], ...atOpts], (v) => setOpt('lookAt', v)), { ...o, hint: 'Camera xoay nhìn bám theo người / vật này (vd lia mắt theo xe vừa vượt mặt).' }),
          field('Tới mốc thì sang cảnh sau', selectInput(sh.until || '', [['', '— Hết giờ mới sang —'], ...marks.map((m) => [m, m])], (v) => setOpt('until', v)), { ...o, hint: 'Mốc = điểm có tên trong lộ trình "🏍️ Chạy trốn" (người:mốc). "Dài" thành thời gian tối đa.' }),
          field('Quay chậm', numInput(sh.slow ?? 1, (v) => setOpt('slow', v, (x) => x > 0 && x < 1), { step: 0.1, min: 0.1, max: 1 }), { ...o, hint: '1 = bình thường · 0,6 = người lạ, đạo cụ, xe người chơi chạy chậm còn 60% (chỉ trong cảnh này). Đồng hồ chung vẫn chạy đều.' }),
          field('Góc rộng ống kính (độ)', numInput(sh.fov ?? 0, (v) => setOpt('fov', v, (x) => x >= 20 && x <= 100), { step: 2, min: 0, max: 100 }), { ...o, hint: '0 = mặc định (góc nhìn thứ nhất 78, còn lại như camera thường). Nhỏ = phóng to (zoom).' }),
          field('Tiếng lúc vào cảnh', selectInput(sh.sound || '', [['', '— Không —'], ...Object.values(SOUNDS).filter((x) => x.kind === 'sfx').map((x) => [x.id, `${x.id} — ${x.label}`])], (v) => setOpt('sound', v)), o))));
    });
    wrap.append(button('＋ Cảnh quay', () => { a.shots.push({ at: 'player', t: 3, dist: 8, height: 3, angle: 180 }); rerender(); }, 'small'),
      field('Xong cảnh: người chơi lên xe, quay xe đuổi theo', selectInput(a.endRide || '', [['', '— Không —'], ...actorOpts()], (v) => { if (v) a.endRide = v; else delete a.endRide; ctx.changed('story'); }), { ...o, hint: 'Hết cảnh phim → người chơi đã ngồi sẵn trên xe (xe để xa thì tự dắt lại), xe quay về hướng đuổi theo người này (người đang chạy trốn: theo hướng lộ trình), camera ra sau xe.' }),
      field('Trong lúc chiếu: xe người chơi tự chạy theo', selectInput(a.ride || '', [['', '— Không (xe đứng yên) —'], ...chasers], (v) => { if (v) a.ride = v; else { delete a.ride; delete a.rideSpeed; delete a.rideStop; } rerender(); }), { ...o, hint: 'Xe người chơi chạy theo lộ trình của người đang bị đuổi (không va chạm), dừng cách người đó một đoạn — hết cảnh thấy người chơi chạy tới từ xa.' }),
      a.ride ? field('Tốc độ xe người chơi', numInput(a.rideSpeed ?? 10, (v) => { a.rideSpeed = v; ctx.changed('story'); }, { step: 1, min: 3, max: 30 }), o) : null,
      a.ride ? field('Dừng cách (đơn vị bản đồ)', numInput(a.rideStop ?? 12, (v) => { a.rideStop = v; ctx.changed('story'); }, { step: 1, min: 2, max: 80 }), o) : null,
      field('', checkInput(!!a.clearAll, (v) => { if (v) a.clearAll = true; else delete a.clearAll; ctx.changed('story'); }, 'Tắt HẾT xe thường trên đường (xe NPC, xe buýt, xe nền) trong lúc chiếu'), { ...o, hint: 'Chỉ còn xe diễn viên: việc "🚛 Đạo cụ" loại ô tô / xe máy — đặt đúng chỗ, đúng làn, 2 xe dí né qua. Hết cảnh xe thường chạy lại. Chỉ máy người chơi này.' }),
      (() => {
        const pr = el('details', { class: 'adv', open: !!a.playerRun }, el('summary', {}, '▸ Người chơi tự chạy bộ trong lúc chiếu (vd bỏ chạy khỏi hẻm)'));
        (a.playerRun || []).forEach((p, k) => pr.append(el('div', { class: 'row' }, el('b', {}, `${k + 1}.`),
          numInput(p[0], (v) => { p[0] = v; ctx.changed('story'); }, { step: 0.5 }), numInput(p[1], (v) => { p[1] = v; ctx.changed('story'); }, { step: 0.5 }),
          button('✕', () => { a.playerRun.splice(k, 1); if (!a.playerRun.length) { delete a.playerRun; delete a.runSpeed; delete a.bikeAt; } rerender(); }, 'small danger'))));
        pr.append(button('＋ Điểm chạy [x, z]', () => { (a.playerRun ||= []).push([...(a.playerRun?.at(-1) || [0, 0])]); rerender(); }, 'small'));
        if (a.playerRun) pr.append(el('div', { class: 'grid' },
          field('Tốc độ chạy', numInput(a.runSpeed ?? 5.5, (v) => { a.runSpeed = v; ctx.changed('story'); }, { step: 0.5, min: 1, max: 9 }), o),
          field('Chờ trước khi chạy (giây)', numInput(a.runDelay ?? 0, (v) => { if (v > 0) a.runDelay = v; else delete a.runDelay; ctx.changed('story'); }, { step: 0.5, min: 0, max: 20 }), o),
          field('Hết cảnh: xe chờ ở [x, z, hướng°] rồi leo lên', el('div', { class: 'row' }, ...[0, 1, 2].map((i) => numInput((a.bikeAt || [0, 0, 0])[i] ?? 0, (v) => { a.bikeAt = [...(a.bikeAt || [0, 0, 0])]; a.bikeAt[i] = v; ctx.changed('story'); }, { step: i === 2 ? 15 : 0.5 }))), { ...o, hint: 'Xe người chơi được dời tới đây, người chơi leo lên luôn. Bỏ trống: đứng yên chỗ chạy tới.' })));
        return pr;
      })(),
      field('Dọn xe NPC quanh người chơi (bán kính, 0 = không)', numInput(a.clear ?? 0, (v) => { if (v > 0) a.clear = v; else delete a.clear; ctx.changed('story'); }, { step: 10, min: 0, max: 200 }), { ...o, hint: 'Lúc bắt đầu chiếu: tạm giấu xe máy, ô tô, xe buýt NPC trong bán kính này (khỏi chắn ống kính, vd ngoái lại nhìn). Hết cảnh hiện lại. Chỉ máy người chơi này.' }));
    return wrap;
  }
  // 🏍️ Chạy trốn: dáng, xe, lộ trình (địa điểm / ngã tư / tọa độ + mốc, hành động), khoảng cách, tốc độ, đuổi theo người khác
  function chaseEditor(a, rerender, o) {
    a.route ||= [];
    const set = (key, v) => { a[key] = v; ctx.changed('story'); };
    const setOpt = (key, v, keep = (x) => x != null && x !== '' && x !== false) => { if (keep(v)) a[key] = v; else delete a[key]; ctx.changed('story'); };
    const chapter = sel.ch && data.chapters.find((c) => c.id === sel.ch);
    const others = (chapter?.steps || []).flatMap((x) => x.on || []).filter((y) => y.do === 'chase' && y.who !== a.who).map((y) => [y.who, y.who]);
    const wrap = el('div', {},
      el('p', { class: 'muted' }, 'Người lạ chạy xe theo đường thật qua lần lượt các điểm (địa điểm giữa đường thì chạy ngang qua, không vào cửa), luôn ở trước người chơi khoảng "cách người chơi": người chơi tới gần → rồ ga bỏ xa · bỏ xa quá → chậm lại / dừng chờ. Không đụng xe khác, không dừng đèn đỏ. Đang chiếu cảnh phim thì chạy thẳng. "Đuổi theo người khác": chạy sau người đó (vd anh mô tô đuổi tên cướp), người đó té xe thì vượt lên chặn đầu.'),
      el('div', { class: 'grid' },
        field('Dáng', selectInput(a.look || 'jetjet', Object.entries(ACTOR_LOOKS), (v) => { a.look = v; if (v !== 'char') delete a.outfit; rerender(); }), o),
        a.look === 'char' ? charOutfit(a, o) : null,
        field('Kiểu xe', selectInput(a.bike || 'sport', Object.entries(CHASE_BIKES), (v) => setOpt('bike', v, (x) => x !== 'sport')), o),
        field('Chở theo', selectInput(a.carry || '', [['', '— Không —'], ['bouquet', '💐 Bó hoa (buộc trên đuôi xe)']], (v) => setOpt('carry', v)), o),
        field('Màu xe', textInput(a.color || '', (v) => setOpt('color', v.trim(), (x) => /^#[0-9a-f]{6}$/i.test(x)), { placeholder: '#b3261e (đỏ)' }), { ...o, hint: 'Dạng #rrggbb. Bỏ trống = đỏ.' }),
        field('Đuổi theo người khác', selectInput(a.follow || '', [['', '— Không (chạy trốn người chơi) —'], ...others], (v) => setOpt('follow', v)), o),
        field('Xuất hiện', selectInput(a.spawn || '', [['', 'Ở điểm đầu lộ trình'], ['behind', 'Sau lưng người chơi (trên lộ trình)']], (v) => { setOpt('spawn', v); rerender(); }), o),
        a.spawn === 'behind' ? field('… cách sau lưng (đơn vị bản đồ)', numInput(a.back ?? 40, (v) => set('back', v), { step: 5, min: 5, max: 200 }), { ...o, hint: 'Lao tới với "tốc độ lúc chiếu cảnh phim" — xa hơn thì vượt mặt người chơi trễ hơn.' }) : null,
        field('Giữ cách (đơn vị bản đồ)', numInput(a.gap ?? 30, (v) => set('gap', v), { step: 1, min: 10, max: 80 }), { ...o, hint: 'Chạy trốn: cách người chơi · Đuổi theo: cách người bị đuổi. 1 đơn vị ≈ 10 m trên màn hình.' }),
        field('Tốc độ chạy đều (% xe người chơi)', numInput(a.pct ?? 85, (v) => set('pct', v), { step: 5, min: 40, max: 100 }), { ...o, hint: 'So với tốc độ tối đa của xe người chơi đang đi (xe đạp / xe máy đều theo kịp nếu chạy hết ga). Không dừng chờ.' }),
        field('Mất dấu khi cách (m trên màn hình)', numInput(a.lose ?? 700, (v) => set('lose', v), { step: 50, min: 300, max: 5000 }), { ...o, hint: 'Bị bỏ xa hơn → thua, màn tối, về chỗ bắt đầu dí (lúc hết cảnh phim có "lên xe đuổi theo"). Cách 70% mốc này thì báo "Sắp mất dấu".' }),
        field('Tốc độ lúc chiếu cảnh phim', numInput(a.speed ?? 14, (v) => set('speed', v), { step: 1, min: 5, max: 30 }), { ...o, hint: 'Đơn vị bản đồ / giây — chỉ lúc cảnh phim đang chiếu. Điểm lộ trình có "tốc độ" thì đổi từ điểm đó.' }),
        field('Tiếng nẹt pô (city.rev)', selectInput(a.revAt ?? (a.wheelie ? 'start' : 'none'), [['pass', 'Lúc lướt ngang người chơi'], ['start', 'Lúc xuất phát'], ['none', 'Không có']], (v) => set('revAt', v)), o),
        field('Chờ trước khi chạy (giây)', numInput(a.delay ?? 1, (v) => set('delay', v), { step: 0.5, min: 0, max: 10 }), o),
        field('', checkInput(!!a.wheelie, (v) => setOpt('wheelie', v), 'Bốc đầu xe (cùng lúc tiếng nẹt pô)'), o),
        field('', checkInput(!!a.dodge, (v) => setOpt('dodge', v), 'Lạng lách né xe, người, chó phía trước'), o),
        field('Tiếng máy xe (lặp)', selectInput(a.loop || '', [['', '— Không —'], ...Object.values(SOUNDS).filter((x) => x.kind === 'loop').map((x) => [x.id, `${x.id} — ${x.label}`])], (v) => setOpt('loop', v)), { ...o, hint: 'Tiếng máy xe chạy theo người này: gần camera thì to, xa thì nhỏ, chạy nhanh thì cao. Xuống xe / té xe thì tắt.' }),
        field('Tiếng khi tới gần người chơi', selectInput(a.nearSound || '', [['', '— Không —'], ...Object.values(SOUNDS).filter((x) => x.kind === 'sfx').map((x) => [x.id, `${x.id} — ${x.label}`])], (v) => { setOpt('nearSound', v); rerender(); }), { ...o, hint: 'Phát 1 lần khi người này chạy tới cách người chơi bấy nhiêu (vd pô mô tô gầm rồi vụt qua).' }),
        a.nearSound ? field('… khi cách (đơn vị bản đồ)', numInput(a.nearDist ?? 20, (v) => set('nearDist', v), { step: 1, min: 2, max: 120 }), { ...o, hint: 'Xa hơn = phát sớm hơn. Chạy nhanh hơn người chơi ~13/giây → 20 ≈ 1,5 giây trước khi vượt mặt.' }) : null,
        field('Chạy bộ sau khi té (tốc độ)', numInput(a.runSpeed ?? 4.5, (v) => setOpt('runSpeed', v, (x) => x !== 4.5), { step: 0.5, min: 1, max: 8 }), { ...o, hint: 'Chỉ khi lộ trình có điểm "💥 Té xe".' })));
    a.route.forEach((r, k) => {
      const kind = r.node ? 'node' : r.at ? 'at' : 'place';
      const setR = (key, v, keep = (x) => x != null && x !== '' && x !== 0) => { if (keep(v)) r[key] = v; else delete r[key]; ctx.changed('story'); };
      wrap.append(el('div', { class: 'story-act' },
        el('div', { class: 'row' },
          el('b', {}, `${k + 1}.`),
          selectInput(kind === 'node' ? '__node' : kind === 'at' ? '__at' : r.place, [...placeOpts, ['__node', '✚ Ngã tư [cột, hàng]…'], ['__at', '📌 Tọa độ [x, z]…']], (v) => {
            delete r.place; delete r.node; delete r.at;
            if (v === '__node') r.node = [0, 0]; else if (v === '__at') r.at = [0, 0]; else r.place = v;
            rerender();
          }),
          kind === 'node' ? numInput(r.node[0], (v) => { r.node[0] = Math.max(0, Math.round(v) || 0); ctx.changed('story'); }, { step: 1, min: 0, max: 30 }) : null,
          kind === 'node' ? numInput(r.node[1], (v) => { r.node[1] = Math.max(0, Math.round(v) || 0); ctx.changed('story'); }, { step: 1, min: 0, max: 30 }) : null,
          kind === 'at' ? numInput(r.at[0], (v) => { r.at[0] = v; ctx.changed('story'); }, { step: 1 }) : null,
          kind === 'at' ? numInput(r.at[1], (v) => { r.at[1] = v; ctx.changed('story'); }, { step: 1 }) : null,
          button('↑', () => { if (k > 0) { a.route.splice(k - 1, 0, a.route.splice(k, 1)[0]); rerender(); } }, 'small'),
          button('↓', () => { if (k < a.route.length - 1) { a.route.splice(k + 1, 0, a.route.splice(k, 1)[0]); rerender(); } }, 'small'),
          button('✕', () => { a.route.splice(k, 1); rerender(); }, 'small danger')),
        el('div', { class: 'row' },
          textInput(r.mark || '', (v) => setR('mark', v.trim()), { placeholder: 'tên mốc (vd truck)' }),
          selectInput(r.act || '', [['', '— hành động —'], ...Object.entries(ROUTE_ACTS)], (v) => setR('act', v)),
          el('label', { class: 'muted', title: 'lệch ngang: + phải / − trái' }, 'lệch ', numInput(r.lat ?? 0, (v) => setR('lat', v), { step: 0.5, min: -8, max: 8 })),
          el('label', { class: 'muted', title: 'cao hơn mặt đường (đỉnh tấm ván)' }, 'cao ', numInput(r.y ?? 0, (v) => setR('y', v), { step: 0.1, min: 0, max: 6 })),
          el('label', { class: 'muted', title: 'bay tới điểm này, cao thêm' }, 'bay ', numInput(r.air ?? 0, (v) => setR('air', v), { step: 0.5, min: 0, max: 12 })),
          ...[0, 1].map((n) => selectInput([].concat(r.sound || [])[n] || '', [['', n ? '— tiếng 2 —' : '— tiếng ở điểm —'], ...Object.values(SOUNDS).filter((x) => x.kind === 'sfx').map((x) => [x.id, x.id])], (v) => {
            const list = [].concat(r.sound || []);
            list[n] = v;
            const out = list.filter(Boolean);
            setR('sound', out.length > 1 ? out : out[0] || '');
          })),
          el('label', { class: 'muted', title: 'giây trong file lúc "rầm" — bỏ trống (0) = game tự dò. Tiếng phát sớm đúng chừng đó để khớp lúc tới điểm' }, 'rầm lúc (giây) ', numInput(r.soundLead ?? 0, (v) => setR('soundLead', v), { step: 0.1, min: 0, max: 30 })),
          el('label', { class: 'muted', title: 'tốc độ lúc chiếu từ điểm này' }, 'tốc độ ', numInput(r.speed ?? 0, (v) => setR('speed', v), { step: 1, min: 0, max: 40 })))));
    });
    wrap.append(el('p', { class: 'muted' }, 'Ngã tư [cột, hàng]: cột = đường dọc thứ mấy tính từ tây (0) sang đông · hàng = đường ngang thứ mấy tính từ bắc (0) xuống nam. Tọa độ [x, z]: tới / từ điểm này chạy thẳng (không theo đường) — dùng cho đoạn lạng né, lên ván, bay. Hàng dưới mỗi điểm: tên mốc (chạy qua thì đạo cụ / cảnh quay chờ "người:mốc" bắt đầu) · hành động · tiếng phát khi tới điểm (tối đa 2; file có tiếng "rầm" ở giữa thì game tự phát sớm cho khớp, hoặc ghi "rầm lúc" giây trong file) · lệch ngang (+ phải, − trái) · cao (đỉnh ván) · bay cao thêm (vòng cung từ điểm trước tới đây) · tốc độ lúc chiếu.'),
      button('＋ Điểm', () => { a.route.push({ place: placeOpts[0]?.[0] || '' }); rerender(); }, 'small'));
    return wrap;
  }
  // 🚛 Đạo cụ cảnh phim: xe tải chạy ra chặn đường / tấm ván làm dốc / chó chạy ngang — chạy khi người lạ tới mốc
  function propEditor(a, rerender, o) {
    const chapter = sel.ch && data.chapters.find((c) => c.id === sel.ch);
    const marks = (chapter?.steps || []).flatMap((x) => x.on || []).filter((y) => y.do === 'chase').flatMap((y) => (y.route || []).filter((r) => r.mark).map((r) => `${y.who}:${r.mark}`));
    const setOpt = (key, v, keep = (x) => x != null && x !== '') => { if (keep(v)) a[key] = v; else delete a[key]; ctx.changed('story'); };
    a.route ||= [];
    const wrap = el('div', {},
      el('p', { class: 'muted' }, 'Chỉ để nhìn, chỉ máy người chơi này thấy. Tấm ván: đặt cố định ở [x, z], đầu cao quay theo "hướng". Xe tải / chó: hiện ra khi người lạ chạy qua mốc, chạy theo các điểm [x, z] (điểm có "dừng" thì phanh dừng đó bấy nhiêu giây), hết đường thì đi khỏi cảnh.'),
      el('div', { class: 'grid' },
        field('Mã đạo cụ', textInput(a.id || '', (v) => { a.id = v.trim(); ctx.changed('story'); }), { ...o, hint: 'Cảnh quay nhìn vào đạo cụ: "prop:<mã>".' }),
        field('Loại', selectInput(a.kind || 'ramp', Object.entries(PROP_KINDS), (v) => { a.kind = v; rerender(); }), o),
        field('Chạy khi tới mốc', selectInput(a.when || '', [['', a.kind === 'ramp' ? '— Có sẵn ngay —' : '— Chạy ngay —'], ...marks.map((m) => [m, m])], (v) => setOpt('when', v)), o),
        !FIXED_PROPS.includes(a.kind) ? field('Tốc độ', numInput(a.speed ?? 8, (v) => setOpt('speed', v, (x) => x > 0), { step: 1, min: 1, max: 30 }), o) : null,
        a.kind === 'car' || a.kind === 'moto' ? field('Màu', textInput(a.color || '', (v) => setOpt('color', v.trim(), (x) => /^#[0-9a-f]{6}$/i.test(x)), { placeholder: 'bỏ trống = màu ngẫu nhiên cố định' }), o) : null,
        !FIXED_PROPS.includes(a.kind) ? field('', checkInput(!!a.keep, (v) => { if (v) a.keep = true; else delete a.keep; ctx.changed('story'); }, 'Hết đường thì dừng lại (không biến mất)'), { ...o, hint: 'Vd xe máy tấp vào lề dừng hẳn. Không tick: hết đường thì đi khỏi cảnh (nên để điểm cuối ở xa, ngoài ống kính).' }) : null,
        a.kind === 'police' ? field('Số anh công an', numInput(a.cops ?? 2, (v) => { a.cops = v; ctx.changed('story'); }, { step: 1, min: 1, max: 4 }), { ...o, hint: 'Xe dừng ở cuối đường (tick "dừng lại") thì các anh bước xuống. Nói được: bong bóng "Ai nói" → 👮 Công an (xe <mã>).' }) : null,
        a.kind === 'police' ? field('Đi tới chỗ', selectInput(a.copsTo || '', [['', '— Đứng cạnh xe —'], ...actorOpts().map(([id, l]) => [`actor:${id}`, l])], (v) => setOpt('copsTo', v)), o) : null,
        a.kind === 'car' ? field('Kiểu ô tô', selectInput(a.model || '', [['', 'Sedan'], ['suv', 'SUV'], ['taxi', 'Taxi'], ['truck', 'Xe tải nhỏ']], (v) => setOpt('model', v)), o) : null,
        field('Tiếng lúc hiện ra', selectInput(a.sound || '', [['', '— Không —'], ...Object.values(SOUNDS).filter((x) => x.kind === 'sfx').map((x) => [x.id, `${x.id} — ${x.label}`])], (v) => setOpt('sound', v)), o),
        FIXED_PROPS.includes(a.kind) ? field('Chỗ đặt [x, z]', el('div', { class: 'row' }, ...[0, 1].map((i) => numInput((a.at ||= [0, 0])[i], (v) => { a.at[i] = v; ctx.changed('story'); }, { step: 0.5 }))), o) : null,
        FIXED_PROPS.includes(a.kind) ? field(a.kind === 'ramp' ? 'Hướng (độ, 0 = lên dần về phía nam)' : a.kind === 'water' ? 'Hướng (độ, 0 = chiều dài theo hướng bắc – nam)' : 'Hướng (độ, 0 = quay mặt về nam)', numInput(a.heading ?? 0, (v) => { a.heading = v; ctx.changed('story'); }, { step: 15, min: -360, max: 360 }), o) : null,
        a.kind === 'bin' ? field('', checkInput(a.hide !== false, (v) => { if (v) delete a.hide; else a.hide = false; ctx.changed('story'); }, 'Núp được (E)'), { ...o, hint: 'Đứng sát thùng bấm E ngồi thụp núp: người đang bị bám theo lén ngoái lại không thấy. Thùng rác luôn chặn đường (không đi xuyên).' }) : null,
        a.kind === 'water' ? field('Rộng / dài / sâu', el('div', { class: 'row' }, ...[['w', 9, 1], ['len', 30, 1], ['depth', 0.45, 0.05]].map(([k, d, s]) => numInput(a[k] ?? d, (v) => { a[k] = v; ctx.changed('story'); }, { step: s, min: s, max: 200 }))), { ...o, hint: 'Đơn vị bản đồ (1 ≈ 10 m). Đường rộng 12. Chỉ để nhìn: xe chạy qua không bị ngập thật (muốn chết máy giữa nước → lộ trình "🏍️ Chạy trốn" có hành động "Chết máy giữa nước").' }) : null,
        a.kind === 'ramp' ? field('Dài / cao', el('div', { class: 'row' }, numInput(a.len ?? 7, (v) => { a.len = v; ctx.changed('story'); }, { step: 0.5, min: 2, max: 15 }), numInput(a.h ?? 1.5, (v) => { a.h = v; ctx.changed('story'); }, { step: 0.1, min: 0.3, max: 4 })), { ...o, hint: 'Khớp với điểm "cao" (y) của lộ trình chạy lên ván.' }) : null));
    if (!FIXED_PROPS.includes(a.kind)) {
      a.route.forEach((r, k) => wrap.append(el('div', { class: 'row' }, el('b', {}, `${k + 1}.`),
        numInput(r.at?.[0] ?? 0, (v) => { r.at = [v, r.at?.[1] ?? 0]; ctx.changed('story'); }, { step: 1 }),
        numInput(r.at?.[1] ?? 0, (v) => { r.at = [r.at?.[0] ?? 0, v]; ctx.changed('story'); }, { step: 1 }),
        el('label', { class: 'muted', title: 'dừng chờ (giây)' }, 'dừng (giây) ', numInput(r.wait ?? 0, (v) => { if (v > 0) r.wait = v; else delete r.wait; ctx.changed('story'); }, { step: 0.5, min: 0, max: 30 })),
        button('✕', () => { a.route.splice(k, 1); rerender(); }, 'small danger'))));
      wrap.append(button('＋ Điểm đường chạy', () => { a.route.push({ at: [0, 0] }); rerender(); }, 'small'));
    }
    return wrap;
  }
  // Bộ đồ của nhân vật (sơ đồ quan hệ) cho dáng "Theo sơ đồ quan hệ"
  function charOutfit(a, o) {
    const c = Object.values(relationsJson.characters || {}).find((x) => x.story === a.who);
    if (!c) return el('p', { class: 'muted' }, `Chưa có nhân vật nào trong sơ đồ quan hệ gắn với "${a.who}". Mở /?relationship → chọn / tạo nhân vật → Gắn với game.`);
    if (c.place) return el('p', { class: 'muted' }, `${c.name}: dùng hình NPC của địa điểm "${c.place}".`);
    const outs = (c.outfits || []).map((x) => [x.id, x.name]);
    return field(`Bộ đồ của ${c.name}`, selectInput(a.outfit || '', [['', '— Bộ đầu tiên —'], ...outs], (v) => { if (v) a.outfit = v; else delete a.outfit; ctx.changed('story'); }), o);
  }

  // ======================== DANH BẠ · NGƯỜI NÓI · VẬT PHẨM · GÓI HÀNG ========================
  // ======================== ⚔️ ĐÁNH NHAU ========================
  function renderFight() {
    const rerender = () => { changed(); ctx.rerender(); };
    data.weapons ||= {};
    data.foes ||= {};
    data.fights ||= {};
    const num = (obj, k, label, opts = {}, ref = '', hint = '') => field(label, numInput(obj[k] ?? opts.def ?? 0, (v) => { if (v || opts.keep0) obj[k] = v; else delete obj[k]; changed(); }, { step: opts.step ?? 1, min: opts.min ?? 0, max: opts.max }), { ref, fieldKey: k, hint });
    const xz = (obj, k, label, ref) => field(label, el('div', { class: 'row' }, ...[0, 1].map((i) => numInput((obj[k] ||= [0, 0])[i], (v) => { obj[k][i] = v; changed(); }, { step: 0.5 }))), { ref, fieldKey: k });
    const weaponOpts = Object.entries(data.weapons).filter(([id]) => id !== 'fists').map(([id, w]) => [id, `${w.icon || ''} ${C[w.name] || id}`]);
    const foeOpts = Object.entries(data.foes).map(([id, f]) => [id, `${C[f.name] || id}${f.boss ? ' 👑' : ''}`]);
    body.append(el('div', { class: 'body-head' }, el('h2', {}, '⚔️ Đánh nhau (góc nhìn thứ 1)')),
      el('p', { class: 'muted' }, 'Chương 6 trên tàu: chuột trái vung / ném · chuột phải giữ đỡ · Space né · E đập lén / nhặt đồ. Người chơi 100 máu, anh Đạt 120 máu, đánh sau lưng (hoặc đánh tên đang đánh anh Đạt) gấp đôi.'));
    // --- vũ khí ---
    const wBox = el('div', {});
    for (const [id, w] of Object.entries(data.weapons)) {
      const ref = `weapon:${id}`;
      wBox.append(el('div', { class: 'act-card' }, el('div', { class: 'act-head' }, el('b', {}, `${w.icon || ''} ${C[w.name] || id} (${id})`), id === 'fists' ? null : button('🗑', () => { delete data.weapons[id]; rerender(); }, 'small danger')),
        el('div', { class: 'grid tight' },
          field('Biểu tượng', emojiInput(w.icon, (v) => { w.icon = v; changed(); }), { ref, fieldKey: 'icon' }),
          textBox('Tên', w.name || (w.name = newKey(`story.wpn.${id}`)), 1, { ref, fieldKey: 'name' }),
          textBox('Tác dụng (thẻ túi đồ + dòng trên thanh đồ lúc cầm)', w.tip || (w.tip = newKey(`story.wpnTip.${id}`)), 1, { ref, fieldKey: 'tip' }),
          textBox('Dùng khi (gợi ý chiến thuật)', w.when || (w.when = newKey(`story.wpnWhen.${id}`)), 1, { ref, fieldKey: 'when' }),
          textBox('Chữ ngắn dưới ô (1–2 từ)', w.short || (w.short = newKey(`story.wpnShort.${id}`)), 1, { ref, fieldKey: 'short' }),
          w.horn ? null : num(w, 'dmg', 'Mất máu / lần trúng', {}, ref),
          w.horn ? null : num(w, 'cd', w.throw ? 'Chờ giữa 2 lần ném (giây)' : 'Chờ vung (giây)', { step: 0.05 }, ref, 'Ném / vung xong phải chờ bấy nhiêu giây (vòng vàng quanh tâm ngắm).'),
          w.throw ? num(w, 'v', 'Tốc độ ném (m/giây, bỏ trống = 15)', { step: 1 }, ref, 'Món nặng ném chậm, bay gần (gói COD 10) · món nhẹ nhanh, xa (trứng 17).') : w.horn ? null : num(w, 'reach', 'Tầm với (m)', { step: 0.1 }, ref),
          w.horn ? null : num(w, 'stun', 'Choáng (giây)', { step: 0.1 }, ref, 'Trúng thì địch đứng khựng; phá được thế đỡ của boss.'),
          ...(w.throw ? [
            num(w, 'blind', '🧋 Lóa mắt (giây)', { step: 0.5 }, ref, 'Đứng dụi mắt, không đánh được; bị đánh mất gấp rưỡi máu.'),
            num(w, 'spicy', '🌶️ Cay chạy vòng (giây)', { step: 0.5 }, ref, 'Ôm mặt chạy lòng vòng, không đánh được.'),
            num(w, 'trap', '🛍️ Trùm đầu (giây)', { step: 0.5 }, ref, 'Quơ quào không đánh được, bị đánh mất gấp rưỡi máu.'),
            num(w, 'fall', '📦 Ngã (giây)', { step: 0.1 }, ref, 'Ngã xuống rồi chống dậy.'),
            field('', checkInput(!!w.slip, (v) => { if (v) w.slip = { r: 1.5, t: 5, fall: 2 }; else delete w.slip; rerender(); }, '🧊 Thành vũng trơn chỗ rơi / chỗ trúng'), { ref, fieldKey: 'slip', hint: 'Địch chạy qua thì trượt khựng; Tí Đô lao húc / bay qua thì ngã sấp lâu. Mỗi vũng 1 lần / tên.' }),
            ...(w.slip ? [num(w.slip, 'r', 'Vũng: bán kính (m)', { step: 0.1 }, ref), num(w.slip, 't', 'Vũng: còn bao lâu (giây)', { step: 0.5 }, ref), num(w.slip, 'fall', 'Vũng: húc qua thì ngã (giây)', { step: 0.1 }, ref)] : []),
            field('', checkInput(!!w.keep, (v) => { if (v) w.keep = true; else { delete w.keep; delete w.hits; delete w.breakTo; } rerender(); }, '♻️ Ném xong rơi xuống, nhặt lại được (không vỡ)'), { ref, fieldKey: 'keep' }),
            ...(w.keep ? [num(w, 'hits', 'Trúng mấy lần thì móp bung ra (0 = không)', {}, ref),
              w.hits ? field('Bung ra thành', selectInput(w.breakTo || '', [['', '— chọn —'], ...weaponOpts.filter(([k]) => k !== id)], (v) => { if (v) w.breakTo = v; else delete w.breakTo; changed(); }), { ref, fieldKey: 'breakTo', hint: 'Gói COD móp 3 lần → bung ra cục sạc dự phòng (ném tiếp được).' }) : null] : []),
            field('', checkInput(!!w.rapid, (v) => { if (v) w.rapid = true; else delete w.rapid; changed(); }, '🥚 Giữ chuột ném liên tiếp'), { ref, fieldKey: 'rapid' }),
          ] : w.horn ? [
            num(w.horn, 'r', 'Kèn: bán kính (m)', { step: 0.5 }, ref), num(w.horn, 'startle', 'Kèn: giật mình khựng (giây)', { step: 0.1 }, ref, 'Tên nào trong bán kính đang lấy đà / ra đòn thì bỏ đòn đó, khựng lại.'), num(w.horn, 'cd', 'Kèn: chờ bóp lại (giây)', { step: 0.5 }, ref),
          ] : [num(w, 'block', 'Đỡ được mấy đòn', { def: 3 }, ref, 'Có món này trong túi thì giữ chuột phải đỡ được (nón bảo hiểm: 4 nấc). Không món nào có nấc đỡ → không đỡ được.')]),
          field('Tiếng trúng', selectInput(w.sfx || '', [['', 'fight.hit (bịch)'], ...Object.keys(SOUNDS).filter((k) => k.startsWith('fight.')).map((k) => [k, `${k} — ${SOUNDS[k].label}`])], (v) => { if (v) w.sfx = v; else delete w.sfx; changed(); }), { ref, fieldKey: 'sfx' }),
          field('', checkInput(!!w.throw, (v) => { if (v) { w.throw = true; delete w.horn; } else delete w.throw; rerender(); }, '🎯 Đồ ném (chuột trái để ném)'), { ref, fieldKey: 'throw' }),
          w.throw ? null : field('', checkInput(!!w.horn, (v) => { if (v) w.horn = { r: 4, startle: 1, cd: 8 }; else delete w.horn; rerender(); }, '📯 Kèn bóp (không ném, không sát thương)'), { ref, fieldKey: 'horn' }))));
    }
    const wId = el('input', { placeholder: 'mã vũ khí mới (vd: ghe)' });
    wBox.append(el('div', { class: 'row' }, wId, button('＋ Thêm vũ khí', () => { const id = wId.value.trim(); if (!ID_RE.test(id) || data.weapons[id]) return ctx.notify('Mã chỉ gồm chữ không dấu, số, gạch dưới và chưa có.', 'warn'); data.weapons[id] = { icon: '📦', name: newKey(`story.wpn.${id}`), tip: newKey(`story.wpnTip.${id}`), throw: true, dmg: 8, cd: 0.6 }; rerender(); }, 'small')));
    // --- boss nhiều giai đoạn: mỗi giai đoạn 1 VÒNG ĐÒN CỐ ĐỊNH (lặp đúng thứ tự, không ngẫu nhiên → chơi vài lần là thuộc) ---
    const STEP_NAMES = { combo: '👊 Combo đấm → khựng', teep: '🦵 Đạp đẩy (chỉ khi đứng gần)', charge: '🐂 Lao húc', charge2: '🐂🐂 Húc liền 2 lần', slam: '🔴 Đòn bổ 2 tay (không đỡ được)', stompSuper: '🌊 Dậm đất → 🦸 Superman', stompFeint: '🌊 Dậm đất → 🎭 Nhử → 🦸 Superman' };
    const SKILL_NAMES = { combo: '👊 Combo', teep: '🦵 Đạp đẩy', charge2: '🐂🐂 Húc lần 2', slam: '🔴 Đòn bổ', stomp: '🌊 Dậm đất', superman: '🦸 Superman punch', clinch: '🤼 Ôm cổ + gối', throw: '🧱 Ném gạch', roar: '‼ Gầm đổi giai đoạn' };
    const SKILL_FIELDS = { wind: 'Lấy đà (giây)', dmg: 'Mất máu', hits: 'Số cú', rec: 'Khựng sau đó (giây) = cửa đánh', range: 'Chỉ đạp khi gần ≤ (m)', push: 'Đẩy / hất văng (m)', wallStun: 'Đập lưng vật cản: mình choáng (giây)',
      miss: 'Mình né được: nó khựng (giây)', reach: 'Tầm (m)', r: 'Vòng sóng rộng (m)', wave: 'Sóng loang trong (giây)', dist: 'Bay xa (m)', speed: 'Bay nhanh (m/giây)', parry: 'Cửa ĐỠ ĐÚNG LÚC (giây)', stagger: 'Bị gạt: loạng choạng (giây)',
      land: 'Đáp đất: khựng (giây)', feint: 'Nhử: khựng thêm (giây)', mash: 'Bấm mấy lần để thoát', time: 'Trong (giây)', knees: 'Hết giờ: số cú gối', far: 'Đứng xa hơn (m)', after: 'Quá (giây) thì ném', t: 'Gầm bao lâu (giây)' };
    const skillNum = (f, k, kk, ref) => { // ô số của 1 đòn: bằng số mặc định thì không ghi vào dữ liệu (chỉ ghi khi đổi — mở xem không làm bẩn dữ liệu)
      const cur = k === 'throw' ? f.throw?.[kk] : f.skills?.[k]?.[kk];
      return field(SKILL_FIELDS[kk] || kk, numInput(cur ?? SKILL_DEFAULT[k][kk], (v) => {
        const src = k === 'throw' ? (f.throw ||= {}) : ((f.skills ||= {})[k] ||= {});
        if (v === SKILL_DEFAULT[k][kk]) delete src[kk]; else src[kk] = v;
        if (k !== 'throw' && !Object.keys(src).length) delete f.skills[k];
        if (f.skills && !Object.keys(f.skills).length) delete f.skills;
        changed();
      }, { step: 0.05, min: 0 }), { ref, fieldKey: 'skills' });
    };
    const phaseBox = (id, f, ref) => {
      if (!f.phases?.length) return el('div', { class: 'grid tight' }, field('', checkInput(false, () => { f.phases = [{ at: 1, name: newKey(`story.foe.${id}P1`), loop: ['combo'] }]; delete f.rage; rerender(); }, '🎚 Chia giai đoạn (mỗi giai đoạn 1 vòng đòn cố định)'), { ref, fieldKey: 'phases', hint: 'Như Tí Đô: máu chạm mốc → gầm lên, đổi sang vòng đòn mới. Đánh không vọt qua giai đoạn được; thua thì chơi lại từ đầu giai đoạn đang dở.' }));
      const used = new Set(f.phases.flatMap((p) => p.loop || []).flatMap((x) => (x === 'stompSuper' || x === 'stompFeint' ? ['stomp', 'superman'] : [x])));
      if (f.phases.some((p) => p.throw)) used.add('throw');
      if (f.phases.some((p) => p.clinch)) used.add('clinch');
      if (f.phases.length > 1) used.add('roar');
      return el('div', {},
        el('h4', {}, `🎚 Giai đoạn (${f.phases.length}) — vòng đòn lặp đúng thứ tự`),
        ...f.phases.map((p, i) => el('div', { class: 'act-card' },
          el('div', { class: 'act-head' }, el('b', {}, `Giai đoạn ${i + 1}: ${C[p.name] || ''}`), i === 0 ? null : button('🗑', () => { f.phases.splice(i, 1); rerender(); }, 'small danger')),
          el('div', { class: 'grid tight' },
            i === 0 ? field('Từ máu', el('span', { class: 'muted' }, 'đầy máu (1)'), { ref, fieldKey: 'phases' }) : num(p, 'at', 'Từ khi máu còn (phần, vd 0,65)', { step: 0.05, max: 1 }, ref, 'Máu chạm mốc này thì gầm lên, chậm cảnh rồi sang giai đoạn này.'),
            textBox('Tên giai đoạn (chỉ để đọc ở đây — game không hiện)', p.name || (p.name = newKey(`story.foe.${id}P${i + 1}`)), 1, { ref, fieldKey: 'phases' }),
            p.say ? textBox('Câu nói lúc vào giai đoạn (bong bóng)', p.say, 1, { ref, fieldKey: 'phases' }) : field('', button('＋ Câu nói lúc vào giai đoạn', () => { p.say = newKey(`story.foe.${id}Say${i + 1}`); rerender(); }, 'small'), { ref, fieldKey: 'phases' }),
            field('', checkInput(!!p.guard, (v) => { if (v) p.guard = true; else delete p.guard; changed(); }, '🛡 Đỡ đòn trước mặt (đánh sau lưng / lúc nó ra đòn, khựng mới trúng)'), { ref, fieldKey: 'phases' }),
            field('', checkInput(!!p.throw, (v) => { if (v) { p.throw = true; f.throw ||= { dmg: 10 }; } else delete p.throw; rerender(); }, '🧱 Đứng xa quá lâu → ném gạch'), { ref, fieldKey: 'phases' }),
            field('', checkInput(!!p.clinch, (v) => { if (v) p.clinch = true; else delete p.clinch; rerender(); }, '🤼 Đấm liền vào thế đỡ → ôm cổ'), { ref, fieldKey: 'phases' }),
            field('', checkInput(!!p.flee, (v) => { if (v) p.flee = true; else delete p.flee; changed(); }, '🏃 Đàn em bỏ chạy (đánh tay đôi)'), { ref, fieldKey: 'phases' }),
            field('Vòng đòn (lặp lại)', el('div', {},
              ...(p.loop ||= ['combo']).map((x, j) => el('div', { class: 'row' }, el('b', {}, `${j + 1}.`),
                selectInput(x, BOSS_STEPS.map((k) => [k, STEP_NAMES[k] || k]), (v) => { p.loop[j] = v; rerender(); }),
                p.loop.length > 1 ? button('✕', () => { p.loop.splice(j, 1); rerender(); }, 'small') : null)),
              button('＋ Thêm bước', () => { p.loop.push(p.loop.at(-1)); rerender(); }, 'small')), { ref, fieldKey: 'phases', wide: true, hint: 'Mỗi bước xong là nó khựng (cửa đánh) rồi sang bước kế. Mọi đòn lấy đà đều lóe ĐỎ — người chơi nhìn dáng để biết né hay đỡ.' })))),
        button('＋ Thêm giai đoạn', () => { const L = f.phases.at(-1); f.phases.push({ at: Math.round(L.at * 50) / 100, name: newKey(`story.foe.${id}P${f.phases.length + 1}`), guard: true, loop: ['combo'] }); rerender(); }, 'small'),
        el('h4', {}, 'Số từng đòn (để như cũ = số mặc định)'),
        ...Object.keys(SKILL_DEFAULT).filter((k) => used.has(k)).map((k) => el('div', { class: 'act-card' }, el('b', {}, SKILL_NAMES[k] || k),
          el('div', { class: 'grid tight' }, ...Object.keys(SKILL_DEFAULT[k]).map((kk) => skillNum(f, k, kk, ref))))));
    };
    // --- kiểu địch ---
    const fBox = el('div', {});
    for (const [id, f] of Object.entries(data.foes)) {
      const ref = `foe:${id}`;
      fBox.append(el('div', { class: 'act-card' }, el('div', { class: 'act-head' }, el('b', {}, `${C[f.name] || id} (${id})${f.boss ? ' 👑' : ''}`), button('🗑', () => { delete data.foes[id]; rerender(); }, 'small danger')),
        el('div', { class: 'grid tight' },
          textBox('Tên hiện trên đầu', f.name || (f.name = newKey(`story.foe.${id}`)), 1, { ref, fieldKey: 'name' }),
          num(f, 'hp', 'Máu', {}, ref), num(f, 'dmg', 'Mất máu / cú (đánh mình)', {}, ref), num(f, 'windup', 'Giơ tay bao lâu mới bổ (giây)', { step: 0.1 }, ref, 'Lúc nó giơ tay là lúc nên đỡ (chuột phải) / né.'),
          num(f, 'cd', 'Nghỉ giữa 2 lần đánh (giây)', { step: 0.1 }, ref), num(f, 'speed', 'Chạy nhanh (m/giây)', { step: 0.1 }, ref), num(f, 'reach', 'Tầm với (m)', { step: 0.1 }, ref),
          num(f, 'combo', 'Đánh liền mấy cú', {}, ref), num(f, 'recover', 'Sơ hở sau khi đánh (giây)', { step: 0.1 }, ref),
          num(f, 'ccMul', 'Dính đồ lâu (nhân, bỏ trống = 1)', { step: 0.1, max: 2 }, ref, 'Trùm bao / lóa mắt / cay / ngã / giật mình kèn kéo dài bằng số giây của món × số này (Tí Đô 0,6 = ngắn hơn).'),
          field('Đòn đánh (lần lượt)', textInput((f.moves || []).join(', '), (v) => { const L = v.split(/[\s,]+/).filter(Boolean); if (L.length) f.moves = L; else delete f.moves; changed(); }, { placeholder: 'tự chọn' }), { ref, fieldKey: 'moves', hint: 'Chỉ khác dáng ra đòn (sát thương như nhau): jab = đấm thẳng tay trước · cross = đấm thẳng tay sau · hook = đấm móc ngang · upper = móc lên cằm · over = bổ từ trên xuống (cầm đồ) · side = quét ngang (cầm đồ). Bỏ trống: cầm đồ → over, side · tay không → jab, cross, hook.' }),
          field('', checkInput(!!f.boss, (v) => { if (v) f.boss = true; else delete f.boss; rerender(); }, '👑 Boss (không đập lén được, anh Đạt đánh nhẹ)'), { ref, fieldKey: 'boss' }),
          f.phases?.length ? null : field('', checkInput(!!f.guard, (v) => { if (v) f.guard = true; else delete f.guard; changed(); }, '🛡 Tự đỡ đòn đánh trước mặt'), { ref, fieldKey: 'guard', hint: 'Chỉ trúng lúc nó đang giơ tay / vừa đánh xong / choáng / bị phao trùm, hoặc đánh sau lưng. Chảo, gạch phá thế đỡ.' }),
          field('', checkInput(!!f.charge, (v) => { if (v) f.charge = { wind: 1, speed: 10, dmg: 25, stun: 3, dist: 14, cd: 5 }; else delete f.charge; rerender(); }, '🐂 Lao húc (như Tí Đô)'), { ref, fieldKey: 'charge' }),
          ...(f.charge ? [num(f.charge, 'wind', 'Húc: lấy đà (giây)', { step: 0.1 }, ref), num(f.charge, 'speed', 'Húc: tốc độ', { step: 0.5 }, ref), num(f.charge, 'dmg', 'Húc: mất máu', {}, ref), num(f.charge, 'stun', 'Đâm container: choáng (giây)', { step: 0.5 }, ref), num(f.charge, 'cd', 'Húc: nghỉ giữa 2 lần (giây)', { step: 0.5 }, ref)] : []),
          f.phases?.length ? null : num(f, 'rage', 'Nổi điên khi còn (phần máu, 0 = không)', { step: 0.1, max: 1 }, ref, 'Vd 0,5: còn nửa máu thì nổi điên — gọi đàn em (người trong trận có "vào khi boss nổi điên") + ném gạch.'),
          ...(f.rage && !f.phases?.length ? [num(f.throw ||= { every: 4, dmg: 10 }, 'every', 'Nổi điên: ném gạch mỗi (giây)', { step: 0.5 }, ref), num(f.throw, 'dmg', 'Gạch ném: mất máu', {}, ref)] : [])),
        phaseBox(id, f, ref)));
    }
    const fId = el('input', { placeholder: 'mã kiểu địch mới' });
    fBox.append(el('div', { class: 'row' }, fId, button('＋ Thêm kiểu địch', () => { const id = fId.value.trim(); if (!ID_RE.test(id) || data.foes[id]) return ctx.notify('Mã chỉ gồm chữ không dấu, số, gạch dưới và chưa có.', 'warn'); data.foes[id] = { name: newKey(`story.foe.${id}`), hp: 30, dmg: 8, windup: 0.6, cd: 1.4, speed: 3.6, reach: 1.6 }; rerender(); }, 'small')));
    // --- trận ---
    const tBox = el('div', {});
    const allyOpts = [['', '— Không có —'], ...Object.keys(data.people).map((id) => [id, `${data.people[id].icon || ''} ${C[data.people[id].name] || id}`])];
    for (const [id, t] of Object.entries(data.fights)) {
      const ref = `fight:${id}`;
      const foeRows = (t.foes ||= []).map((f, i) => el('div', { class: 'act-card' },
        el('div', { class: 'act-head' }, el('b', {}, `#${i + 1} ${f.who}`), button('🗑', () => { t.foes.splice(i, 1); rerender(); }, 'small danger')),
        el('div', { class: 'grid tight' },
          field('Mã người (diễn viên)', textInput(f.who, (v) => { f.who = v.trim(); changed(); }), { ref, fieldKey: 'foes', hint: 'Mỗi người 1 mã (vd g1). Muốn nói thoại / có tên riêng thì thêm vào "Người nói".' }),
          field('Kiểu địch', selectInput(f.foe || 'thug', foeOpts, (v) => { f.foe = v; changed(); }), { ref, fieldKey: 'foes' }),
          field('Dáng', selectInput(f.look || 'jetjet', Object.entries(ACTOR_LOOKS), (v) => { f.look = v; changed(); }), { ref, fieldKey: 'foes' }),
          xz(f, 'at', 'Đứng ở [x, z]', ref),
          num(f, 'heading', 'Hướng mặt (độ)', { step: 45, min: -360, max: 360, def: 180, keep0: true }, ref),
          field('Vào trận', selectInput(f.join == null ? '' : f.join === 'rage' ? 'rage' : 'sec', [['', 'Có mặt từ đầu'], ['sec', 'Chạy tới sau … giây'], ['rage', 'Khi boss nổi điên / sang giai đoạn 2']], (v) => { if (!v) delete f.join; else f.join = v === 'rage' ? 'rage' : 6; rerender(); }), { ref, fieldKey: 'foes' }),
          typeof f.join === 'number' ? num(f, 'join', 'Sau (giây)', { step: 1 }, ref) : null,
          f.join != null ? field('', checkInput(!!f.watch, (v) => { if (v) f.watch = true; else delete f.watch; changed(); }, '👀 Đứng xem, hò hét tới lúc vào trận'), { ref, fieldKey: 'foes', hint: 'Không bật: ẩn tới lúc chạy vào.' }) : null,
          field('', checkInput(!!f.sneak, (v) => { if (v) f.sneak = true; else delete f.sneak; changed(); }, '🤫 Chưa phát hiện (đập lén được)'), { ref, fieldKey: 'foes', hint: 'Đứng gác, chưa biết người chơi tới — lén ra sau lưng bấm E là gục.' }),
          num(f, 'sweep', 'Quét đèn ± (độ)', { step: 5, min: 0, max: 90 }, ref),
          num(f, 'sweepT', 'Chu kỳ quét (giây)', { step: 1, min: 2, max: 30 }, ref),
          num(f, 'sight', 'Nhìn xa (m, bỏ trống = 11)', { step: 1, min: 3, max: 25 }, ref),
          num(f, 'phase', 'Lệch nhịp đi tuần (giây đã đi trước)', { step: 1, min: 0, max: 300 }, ref),
          field('Đi tuần qua lại các điểm [x, z]', el('div', {},
            ...(f.patrol || []).map((q, k) => el('div', { class: 'row' }, ...[0, 1].map((j) => numInput(q[j], (v) => { q[j] = v; changed(); }, { step: 0.5 })),
              el('span', { class: 'muted' }, 'dừng'), numInput(q[2] ?? 2.2, (v) => { q[2] = v; changed(); }, { step: 0.5, min: 0, max: 30 }),
              el('span', { class: 'muted' }, 'nhìn (độ)'), textInput(q[3] ?? '', (v) => { if (v.trim() === '') { q.length = Math.min(q.length, 3); } else { q[2] ??= 2.2; q[3] = +v; } changed(); }, { placeholder: 'giữ hướng' }), button('✕', () => { f.patrol.splice(k, 1); if (!f.patrol.length) delete f.patrol; rerender(); }, 'small'))),
            button('＋ Điểm đi tuần', () => { (f.patrol ||= []).push([...(f.patrol?.at(-1) || f.at || [0, 0])]); rerender(); }, 'small')), { ref, fieldKey: 'foes', hint: 'Chưa phát hiện người chơi: đi lần lượt các điểm (tới mỗi điểm đứng nhìn ~2 giây). Thấy (trong tầm nhìn ~11 m, không bị container / vách che) thì la lên.' }))));
      const lootRows = (t.loot ||= []).map((l, i) => el('div', { class: 'row' },
        selectInput(l.id, weaponOpts, (v) => { l.id = v; changed(); }), ...[0, 1].map((k) => numInput((l.at ||= [0, 0])[k], (v) => { l.at[k] = v; changed(); }, { step: 0.5 })), button('✕', () => { t.loot.splice(i, 1); rerender(); }, 'small')));
      tBox.append(el('div', { class: 'act-card' },
        el('div', { class: 'act-head' }, el('b', {}, `⚔️ ${C[t.name] || id} (${id})`), button('🗑 Xóa trận', () => { if (confirm(`Xóa trận ${id}?`)) { delete data.fights[id]; rerender(); } }, 'small danger')),
        el('div', { class: 'grid tight' },
          textBox('Tên trận (hiện góc phải màn hình)', t.name || (t.name = newKey(`story.fight.${id}`)), 1, { ref, fieldKey: 'name' }),
          field('Bản đồ', selectInput(t.zone || 'ship', Object.entries(ZONES).map(([k, z]) => [k, z.name]), (v) => { t.zone = v; changed(); }), { ref, fieldKey: 'zone', hint: 'Toạ độ trong trận tính theo gốc bản đồ riêng (tàu: giữa tàu, mũi về +z, mạn trái -x sát bến Kho 7; boong cao 6,2).' }),
          field('', checkInput(!!t.keepPos, (v) => { if (v) t.keepPos = true; else delete t.keepPos; rerender(); }, '🚶 Đánh tại chỗ (không dịch chuyển)'), { ref, fieldKey: 'keepPos', hint: 'Bắt đầu trận ngay chỗ người chơi / đồng đội đang đứng (đi bộ tới là đánh, không màn đen). Thua thì làm lại từ chỗ đó. Bỏ trống: dịch tới "Người chơi bắt đầu ở".' }),
          t.keepPos ? null : xz(t, 'start', 'Người chơi bắt đầu ở [x, z]', ref),
          field('Đồng đội', selectInput(t.ally || '', allyOpts, (v) => { if (v) t.ally = v; else delete t.ally; rerender(); }), { ref, fieldKey: 'ally' }),
          t.ally ? xz(t, 'allyAt', t.keepPos ? 'Đồng đội đứng ở [x, z] (chỉ khi chưa có mặt)' : 'Đồng đội đứng ở [x, z]', ref) : null,
          field('', checkInput(!!t.stealth, (v) => { if (v) t.stealth = { goal: [...(t.start || [0, 0])], r: 2 }; else delete t.stealth; rerender(); }, '🤫 Màn lẻn (không đánh)'), { ref, fieldKey: 'stealth', hint: 'Tới chỗ cần tới mà không bị ai thấy = thắng. Bị thấy → màn đen, làm lại từ đầu màn. Địch nên có đường đi tuần / chưa phát hiện. Đập lén sau lưng (E) vẫn được.' }),
          t.stealth ? xz(t.stealth, 'goal', 'Màn lẻn: tới chỗ [x, z]', ref) : null,
          t.stealth ? field('Bán kính (m)', numInput(t.stealth.r ?? 2, (v) => { t.stealth.r = v; changed(); }, { step: 0.5, min: 0.5, max: 20 }), { ref, fieldKey: 'stealth' }) : null,
          t.stealth ? field('Chốt làm lại [x, z] (theo thứ tự)', el('div', {},
            ...(t.stealth.checkpoints || []).map((q, k) => el('div', { class: 'row' }, ...[0, 1].map((j) => numInput(q[j], (v) => { q[j] = v; changed(); }, { step: 0.5 })), button('✕', () => { t.stealth.checkpoints.splice(k, 1); if (!t.stealth.checkpoints.length) delete t.stealth.checkpoints; rerender(); }, 'small'))),
            button('＋ Chốt', () => { (t.stealth.checkpoints ||= []).push([...(t.stealth.checkpoints?.at(-1) || t.start || [0, 0])]); rerender(); }, 'small')), { ref, fieldKey: 'stealth', hint: 'Đi qua chốt (cách ~2 m) → bị phát hiện thì làm lại từ chốt đó, không phải từ đầu màn.' }) : null),
        el('h4', {}, `Địch (${t.foes.length})`), ...foeRows,
        button('＋ Thêm địch', () => { t.foes.push({ who: `g${Date.now() % 1000}`, foe: 'thug', look: 'jetjet', at: [...(t.start || [0, 0])] }); rerender(); }, 'small'),
        el('h4', {}, 'Đồ dưới đất (loại · x · z)'), ...lootRows,
        button('＋ Thêm đồ', () => { t.loot.push({ id: weaponOpts[0]?.[0] || 'wood', at: [...(t.start || [0, 0])] }); rerender(); }, 'small')));
    }
    const tId = el('input', { placeholder: 'mã trận mới (vd: f1)' });
    tBox.append(el('div', { class: 'row' }, tId, button('＋ Thêm trận', () => { const id = tId.value.trim(); if (!ID_RE.test(id) || data.fights[id]) return ctx.notify('Mã chỉ gồm chữ không dấu, số, gạch dưới và chưa có.', 'warn'); data.fights[id] = { zone: 'ship', name: newKey(`story.fight.${id}`), start: [-9.6, 0], ally: 'man', allyAt: [-9, -1.5], foes: [], loot: [] }; rerender(); }, 'small')));
    body.append(el('h3', {}, '🗡 Vũ khí & đồ ném'), wBox, el('h3', {}, '👊 Kiểu địch'), fBox, el('h3', {}, '⚔️ Trận đánh'), el('p', { class: 'muted' }, 'Thử nhanh: ?cheat → 📖 → ⚔️ Thử trận.'), tBox);
  }

  // ======================== 🏍️ MÀN ĐUA ========================
  function renderRace() {
    const rerender = () => { changed(); ctx.rerender(); };
    data.races ||= {};
    const KINDS = { port: '🏗️ Bến cảng (container 2 bên)', gate: '🚧 Cổng cảng', industrial: '🏭 Khu công nghiệp', highway: '🛣️ Quốc lộ (4 làn, nhiều xe)', work: '🚧 Đường đang làm (hẹp, cọc)', dirt: '🟫 Đường đất ven ruộng', village: '🏘️ Xóm (đường hẹp)', canal: '🌴 Bờ kênh dừa nước', bridge: '🌉 Cầu tạm (nước 2 bên)', levee: '🌊 Bờ đê', drawbridge: '🌉 Cầu cất (cuối màn: bay qua cầu đang nâng)', deadend: '⛔ Đường cụt (cuối màn)' };
    const EVENTS = { say: '💬 Anh Đạt hét (chỉ câu thoại)', container: '📦 2 container rơi chắn làn (lạng né)', barrier: '🚧 Barie hạ dần (phải chạy đủ nhanh lọt qua)', truck: '🛻 Bán tải Tí Đô áp sát lại sau lưng (nếu đang bị bỏ xa)', bus: '🚌 Xe khách xoay ngang chắn đường (chừa khe bên trái)', ram: '💥 Bán tải lên ngang hông, nháy đèn rồi tạt vào (phanh / lách xa để né; đường ≥ 9 m, đợi đường vắng)', throwers: '🧱 2 xe giang hồ vượt lên ném gạch rồi phóng đi (đợi đường vắng)', drawbridge: '🌉 Cầu cất đang nâng (giữa cầu ở đây; tới càng sớm cầu càng thấp)', potholes: '🕳 Ổ gà rải rác (xóc, chậm)', ducks: '🦆 Đàn vịt băng qua (chậm lại)', puddle: '💧 Vũng nước (trượt)', stall: '🛒 Sạp hàng đẩy ra chắn nửa phải', jump: '🌉 Cầu gãy (≥ 80 km/h mới bay qua; bán tải bị bỏ lại)',
      drums: '🛢 3 thùng phuy lăn ra làn', cones: '🚧 Rào công trình chắn 1 làn', brokencar: '🚗 Xe hư đậu giữa làn (tam giác cảnh báo phía sau)', trunk: '🌴 Cây dừa ngã chắn hơn nửa đường',
      buffalo: '🐃 Trâu đi băng ngang đường', forklift: '🚜 Xe nâng chạy ngang (bến cảng)', cart: '🛺 Xe ba gác đậu lấn ra đường' };
    const num = (obj, k, label, opts = {}, ref = '', hint = '') => field(label, numInput(obj[k] ?? opts.def ?? 0, (v) => { if (v || opts.keep0) obj[k] = v; else delete obj[k]; changed(); }, { step: opts.step ?? 1, min: opts.min ?? 0, max: opts.max }), { ref, fieldKey: k, hint });
    body.append(el('div', { class: 'body-head' }, el('h2', {}, '🏍️ Màn đua thoát thân')),
      el('p', { class: 'muted' }, 'Đường đua tự dựng từ các đoạn nối nhau (mỗi đoạn: kiểu cảnh, dài bao nhiêu m, rẽ bao nhiêu độ). Ga W · phanh S / Space · lái A D — chướng ngại tự nhìn mà né, không có nút bấm. Té xe 3 lần trong 1 đoạn / bị bám sát 4 giây / rớt cầu / barie đóng → chơi lại từ đầu đoạn. Thử nhanh: ?cheat&race=<mã>.'));
    for (const [id, r] of Object.entries(data.races)) {
      const ref = `race:${id}`, total = (r.sections || []).reduce((a, s) => a + (s.len || 0), 0);
      const secs = (r.sections ||= []).map((sec, i) => el('div', { class: 'act-card' },
        el('div', { class: 'act-head' }, el('b', {}, `${i + 1}. ${C[sec.name] || sec.kind} · ${sec.len} m`),
          i > 0 ? button('↑', () => { [r.sections[i - 1], r.sections[i]] = [r.sections[i], r.sections[i - 1]]; rerender(); }, 'small') : null,
          button('🗑', () => { r.sections.splice(i, 1); rerender(); }, 'small danger')),
        el('div', { class: 'grid tight' },
          textBox('Tên đoạn', sec.name || (sec.name = newKey(`story.race.${id}.s${i}`)), 1, { ref, fieldKey: 'sections' }),
          field('Kiểu', selectInput(sec.kind || 'highway', Object.entries(KINDS), (v) => { sec.kind = v; rerender(); }), { ref, fieldKey: 'sections' }),
          num(sec, 'len', 'Dài (m)', { step: 50, min: 40 }, ref),
          num(sec, 'turn', 'Rẽ (độ, + trái / − phải)', { step: 10, min: -180, max: 180, keep0: true }, ref),
          num(sec, 'width', `Rộng (m, bỏ trống = ${KIND_DEFAULT[sec.kind]?.width ?? 12})`, { step: 0.5 }, ref),
          num(sec, 'traffic', 'Xe cộ (0–1, bỏ trống = theo kiểu)', { step: 0.05, max: 1 }, ref),
          sec.line ? el('div', {}, textBox('Anh Đạt hét khi vào đoạn', sec.line, 1, { ref, fieldKey: 'sections' }), button('✕', () => { delete sec.line; rerender(); }, 'small')) : button('＋ Câu anh Đạt hét khi vào đoạn', () => { sec.line = newKey(`story.race.${id}.l${i}`); rerender(); }, 'small')),
        el('h4', {}, `Sự cố (${(sec.events ||= []).length})`),
        ...sec.events.map((e, k) => el('div', { class: 'row' },
          selectInput(e.type || 'say', Object.entries(EVENTS), (v) => { e.type = v; rerender(); }),
          el('span', { class: 'muted' }, 'ở m'), numInput(e.at ?? 0, (v) => { e.at = v; changed(); }, { step: 10, min: 0 }),
          e.line ? textInput(C[e.line] ?? '', (v) => { C[e.line] = v; ctx.changed('content'); }, { placeholder: 'câu anh Đạt hét' }) : button('＋ câu hét', () => { e.line = newKey(`story.race.${id}.e${i}_${k}`); rerender(); }, 'small'),
          button('✕', () => { sec.events.splice(k, 1); rerender(); }, 'small'))),
        button('＋ Thêm sự cố', () => { sec.events.push({ at: Math.round((sec.len || 100) / 2), type: 'say' }); rerender(); }, 'small')));
      body.append(el('div', { class: 'act-card' },
        el('div', { class: 'act-head' }, el('b', {}, `🏍️ ${C[r.name] || id} (${id}) · ${(total / 1000).toFixed(1)} km · ~${Math.round(total / ((r.bike?.maxSpeed || 29) * 0.8) / 60)} phút`)),
        el('div', { class: 'grid tight' },
          textBox('Tên màn', r.name || (r.name = newKey(`story.race.${id}.name`)), 1, { ref, fieldKey: 'name' }),
          num(r, 'motos', 'Số xe giang hồ ném gạch (sự cố 🧱)', { min: 0, max: 4, keep0: true }, ref),
          field('Đồng đội ngồi sau', selectInput(r.ally || '', [['', '— Không —'], ...Object.keys(data.people).map((p) => [p, C[data.people[p].name] || p])], (v) => { if (v) r.ally = v; else delete r.ally; changed(); }), { ref, fieldKey: 'ally' }),
          field('Xe: tốc độ tối đa (km/h)', numInput(Math.round((r.bike?.maxSpeed ?? 29) * 3.6), (v) => { (r.bike ||= {}).maxSpeed = +(v / 3.6).toFixed(2); changed(); }, { step: 5, min: 60, max: 180 }), { ref, fieldKey: 'bike', hint: 'Kẻ rượt chỉ có bán tải Tí Đô (thanh khoảng cách). Qua cầu gãy cần ≥ 80 km/h.' })),
        el('h3', {}, 'Các đoạn đường (theo thứ tự chạy)'), ...secs,
        button('＋ Thêm đoạn', () => { r.sections.splice(Math.max(0, r.sections.length - 1), 0, { kind: 'highway', len: 800, turn: 0, events: [] }); rerender(); }, 'small')));
    }
  }

  function renderPeople() {
    const rerender = () => { changed(); ctx.rerender(); };
    const block = (title, table, prefix, hint, extra) => {
      const card = el('div', { class: 'card' }, el('h3', {}, title), el('p', { class: 'muted' }, hint));
      for (const [id, x] of Object.entries(table)) {
        const ref = `${prefix}:${id}`;
        card.append(el('div', { class: 'grid' },
          field('Mã', el('b', {}, id), { ref, fieldKey: 'id' }),
          field('Biểu tượng', emojiInput(x.icon, (v) => { x.icon = v; changed(); }), { ref, fieldKey: 'icon' }),
          textBox('Tên', x.name, 1, { ref, fieldKey: 'name' }),
          ...(extra ? extra(x, ref) : []),
          button('🗑', () => { if (confirm(`Xóa ${id}? Bước nào đang dùng sẽ báo lỗi.`)) { delete table[id]; rerender(); } }, 'small danger')));
        if (prefix === 'contact' || prefix === 'people') card.append(relBox({ story: id })); // 🕸️ sơ đồ quan hệ
      }
      const idIn = textInput('', () => {}, { placeholder: 'mã mới (vd ba, chuBa)' });
      card.append(el('div', { class: 'row' }, idIn, button('＋ Thêm', () => {
        const id = idIn.value.trim();
        if (!ID_RE.test(id) || table[id]) return ctx.notify('Mã chỉ gồm chữ không dấu, số, gạch dưới và chưa có.', 'warn');
        table[id] = { icon: '🙂', name: newKey(`story.${prefix}.${id}`) };
        rerender();
      }, 'small')));
      return card;
    };
    body.append(
      el('div', { class: 'body-head' }, el('h2', {}, '👥 Danh bạ · người nói · vật phẩm')),
      block('📱 Danh bạ (người nhắn tin)', data.contacts, 'contact', 'Mỗi người 1 cuộc trò chuyện trong app Tin nhắn.', (x, ref) => [
        field('Ở địa điểm', selectInput(x.place || '', [['', '— Không —'], ...placeOpts], (v) => { if (v) x.place = v; else delete x.place; changed(); }), { ref, fieldKey: 'place' }),
        field('', checkInput(!!x.group, (v) => { if (v) x.group = true; else delete x.group; changed(); }, 'Nhóm chat'), { ref, fieldKey: 'group', hint: 'Tin nhắn của nhóm ghi được tên người gửi từng tin + dòng hệ thống (việc "Tin nhắn").' })]),
      block('🗣 Người nói (hội thoại, không nhắn tin)', data.people, 'people', 'Người lạ chỉ xuất hiện trong hộp thoại (vd anh phát tờ rơi).'),
      block('📄 Vật phẩm cốt truyện', data.items, 'item', 'Nằm trong túi đồ (mục Khác), vd tờ rơi.', (x, ref) => [textBox('Mô tả', x.desc || (x.desc = newKey(`${ref.replace(':', '.')}.desc`)), 2, { ref, fieldKey: 'desc' })]),
      block('📍 Chỗ hẹn (định vị theo tọa độ)', data.spots, 'spot', 'Chỗ không phải địa điểm có cửa (vd gầm cầu): gửi kèm tin nhắn (＋ Thêm định vị), làm mũi tên chỉ tới, điều kiện "Đã bấm 📍". Tọa độ xem bằng ?debug → game.snapshot().pos.', (x, ref) => [
        field('Tọa độ [x, z]', el('div', { class: 'row' }, ...[0, 1].map((i) => numInput((x.at ||= [0, 0])[i], (v) => { x.at[i] = v; changed(); }, { step: 0.5 }))), { ref, fieldKey: 'at' })]),
      block('📦 Gói hàng cốt truyện', data.parcels, 'parcel', 'Xếp vào túi khi nói chuyện (Xếp gói hàng), giao ở bước sau (Giao gói hàng).', (x, ref) => [
        textBox('Mô tả', x.desc || (x.desc = newKey(`${ref.replace(':', '.')}.desc`)), 2, { ref, fieldKey: 'desc' }),
        field('Đặc tính', el('div', { class: 'chips' }, TRAITS.map(([t, label]) => checkInput((x.traits || []).includes(t), (on) => {
          const s = new Set(x.traits || []);
          if (on) s.add(t); else s.delete(t);
          x.traits = [...s];
          changed();
        }, label))), { ref, fieldKey: 'traits' })]),
    );
  }
}
