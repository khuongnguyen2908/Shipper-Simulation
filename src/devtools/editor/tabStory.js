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
import { el, field, textInput, numInput, button, sideList, selectInput, emojiInput, areaInput, checkInput, explain, subTabs } from './ui.js';

const TRAITS = [['fragile', '⚠️ Dễ vỡ'], ['hot', '🔥 Nóng'], ['cold', '❄️ Lạnh'], ['liquid', '💧 Nước']];

// Danh sách "＋ Thêm việc" / "Xong bước khi" chia nhóm. Mục không có ở đây (say, give, fuel · read, talk) là kiểu cũ / chưa ai dùng:
// không cho thêm mới, nhưng bước đang dùng thì vẫn hiện + sửa được (nhóm "Kiểu cũ"). Bộ chạy (sim/story.js) vẫn hiểu hết.
const ACTION_GROUPS = [
  ['💬 Thoại & tin nhắn', ['bubble', 'choose', 'msg', 'replies']],
  ['🧍 Người lạ', ['actor', 'approach', 'leave', 'board', 'alight', 'react', 'dismount', 'helmetOff', 'helmetOn', 'wave', 'rideOff']],
  ['🎬 Cảnh & hành động', ['title', 'cine', 'chase', 'prop', 'tackle', 'fade', 'phoneCall', 'sound']],
  ['📦 Đồ & đơn', ['item', 'drop', 'offer', 'bike']],
  ['📱 Điện thoại & khác', ['openPhone', 'closePhone', 'toast', 'end']],
];
// 3 việc người lạ rời cảnh (bộ chạy giữ nguyên 3 mã) → trong công cụ là 1 mục, chọn cách rời
const LEAVE_KINDS = [['remove', 'Biến mất ngay'], ['leave', 'Bỏ chạy ra xa rồi biến mất'], ['goto', 'Đi / chạy vào địa điểm … rồi biến mất']];
const LEAVE_LABEL = '🚶 Người lạ rời cảnh (biến mất / bỏ chạy / đi vào địa điểm)';
const UNTIL_GROUPS = [
  ['🧍 Người lạ & nói chuyện', ['talkActor', 'chosen', 'near', 'bring', 'chased']],
  ['💬 Tin nhắn', ['open', 'reply', 'routed']],
  ['🗺️ Di chuyển', ['arrive', 'reach', 'mount']],
  ['📦 Đơn & xe', ['ordersSince', 'order', 'switch', 'fuel', 'brand', 'wear', 'use']],
  ['⏱️ Thời gian & cảnh', ['wait', 'clock', 'newDay', 'cine', 'tackled', 'ack']],
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
  if (/^(contact|item|parcel):/.test(r)) return 'people';
  const [ch, st] = r.split('.');
  return st ? `${ch}/${st}` : ch ? `ch:${ch}` : 'people';
}

export function render(root, ctx) {
  const data = (ctx.data.story = ctx.data.story || {});
  data.contacts = data.contacts || {};
  data.people = data.people || {};
  data.items = data.items || {};
  data.parcels = data.parcels || {};
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
  const contactOpts = Object.entries(data.contacts).map(([id, c]) => [id, `${c.icon || ''} ${C[c.name] || id}`]);
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
  const rows = [{ id: 'people', icon: '👥', title: 'Danh bạ · người nói · vật phẩm', sub: `${Object.keys(data.contacts).length} người nhắn`, fixed: true }];
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
        issuesFor: (id) => (id === 'people' ? ctx.issues.filter((i) => i.tab === 'story' && /^(contact|item|parcel):/.test(i.ref))
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
    }, `${x.icon || ''} ${C[x.name] || id}`)));
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
    const nRules = [st.hold && !afterTitle, st.noFines, st.leash, st.deadline, st.music, st.onlyTrait, st.hideNpc?.length].filter(Boolean).length;
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
        field('Nhạc riêng trong bước này', selectInput(st.music || '', [['', '— Nhạc ngày / đêm như thường —'], ...Object.values(SOUNDS).filter((x) => x.kind === 'music' && x.id !== 'music.menu').map((x) => [x.id, `${x.label} (${x.id})`])], (v) => { if (v) st.music = v; else delete st.music; changed(); }), opt('music', { hint: 'Thay nhạc ngày / đêm trong lúc chờ bước này. Các bước liền nhau cùng nhạc thì phát liền mạch. Gắn file ở thẻ 🔊 Âm thanh — mã chưa có file thì vẫn nhạc ngày / đêm. Mã nhạc mới: nhờ Claude thêm vào soundSpec.js.' })),
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
      if (['actor', 'approach', 'leave', 'remove', 'board', 'alight', 'goto', 'chase', 'dismount', 'helmetOff', 'helmetOn', 'wave', 'rideOff', 'tackle'].includes(v)) a.who = Object.keys(data.people)[0] || '';
      if (v === 'prop') Object.assign(a, { id: `prop${(ch.steps || []).flatMap((x) => x.on || []).filter((y) => y.do === 'prop').length + 1}`, kind: 'ramp', at: [0, 0], heading: 0, len: 7, h: 1.5 });
      if (v === 'drop') a.id = Object.keys(data.parcels)[0] || '';
      if (v === 'goto') Object.assign(a, { place: placeOpts[0]?.[0] || '', run: true });
      if (v === 'approach') a.stop = true;
      if (v === 'tackle') Object.assign(a, { target: Object.keys(data.people).find((id) => id !== a.who) || '', qte: 2, text: 'story.qte.block' });
      if (v === 'fade') Object.assign(a, { text: newKey(`${base}.fade`), t: 2 });
      if (v === 'phoneCall') a.on = true;
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
        if (v === 'chased') st.until.who = (ch.steps || []).flatMap((x) => (x.on || []).filter((a) => a.do === 'chase').map((a) => a.who))[0] || Object.keys(data.people)[0] || '';
        if (v === 'talk') {
          const place = st.talk?.place || placeOpts[0]?.[0] || '';
          st.until.place = place;
          st.talk = st.talk || { place, label: newKey(`${base}.label`), text: newKey(`${base}.text`) };
        } else delete st.talk;
        rerender();
      }, UNTIL), opt('until')),
      (u.type === 'read' || u.type === 'reply' || u.type === 'open') ? field('Người nhắn', selectInput(u.who, contactOpts, (v) => { u.who = v; changed(); }), opt('until')) : null,
      u.type === 'routed' ? field('Chỉ đường tới', selectInput(u.place, [['office', '🏢 Văn phòng hãng (bất kỳ)'], ['fuel', '⛽ Cây xăng / trụ sạc (bất kỳ)'], ...placeOpts], (v) => { u.place = v; changed(); }), opt('until')) : null,
      u.type === 'fuel' ? field('Xăng / pin ít nhất (%)', numInput(u.pct ?? 90, (v) => { u.pct = v; changed(); }, { step: 5, min: 1, max: 100 }), opt('until', { hint: 'Xe đạp: coi như xong ngay.' })) : null,
      u.type === 'order' ? field('Mốc', selectInput(u.stage, Object.entries(ORDER_STAGES), (v) => { u.stage = v; changed(); }), opt('until')) : null,
      u.type === 'ack' ? field('Tự sang sau (phút game, 0 = chờ bấm nút)', numInput(u.max ?? 0, (v) => { if (v > 0) u.max = v; else delete u.max; changed(); }, { step: 1, min: 0 }), opt('until', { hint: '1 phút game = 1 giây thật.' })) : null,
      u.type === 'use' ? field('Món', selectInput(u.goods, goodsOpts, (v) => { u.goods = v; changed(); }), opt('until')) : null,
      u.type === 'arrive' ? field('Địa điểm', selectInput(u.place, placeOpts, (v) => { u.place = v; changed(); }), opt('until')) : null,
      u.type === 'chosen' ? field('Lựa chọn', selectInput(u.id, chooseIds().map((id) => [id, id]), (v) => { u.id = v; changed(); }), opt('until', { hint: 'Mã của việc "Chọn câu trả lời" ở bước này hoặc bước trước.' })) : null,
      u.type === 'near' || u.type === 'bring' || u.type === 'chased' ? field('Người lạ', selectInput(u.who, actorOpts(), (v) => { u.who = v; changed(); }), opt('until', u.type === 'chased' ? { hint: 'Người có việc "🏍️ Chạy trốn" ở bước này / bước trước. Xong khi người đó chạy tới điểm cuối lộ trình mà người chơi đang ở gần (≤ 60 m).' } : {})) : null,
      u.type === 'cine' ? el('p', { class: 'muted' }, 'Thêm việc "🎬 Cảnh phim" ở phần "Khi vào bước" — chiếu hết các cảnh quay thì sang bước sau.') : null,
      u.type === 'reach' ? field('Tọa độ x', numInput(u.at?.[0] ?? 0, (v) => { u.at = [v, u.at?.[1] ?? 0]; changed(); }, { step: 1 }), opt('until', { hint: 'Chỗ trên bản đồ (đơn vị bản đồ). Đường dọc thứ i ở x = (i − 5) × 52, đường ngang thứ j ở z = (j − 5) × 52 · xem vị trí đang đứng: mở game ?debug, gõ game.snapshot().pos. Vd giữa cầu Sông Ngân hàng 5: [182, 0].' })) : null,
      u.type === 'reach' ? field('Tọa độ z', numInput(u.at?.[1] ?? 0, (v) => { u.at = [u.at?.[0] ?? 0, v]; changed(); }, { step: 1 }), opt('until')) : null,
      u.type === 'reach' ? field('Bán kính', numInput(u.r ?? 8, (v) => { u.r = v; changed(); }, { step: 1, min: 2, max: 60 }), opt('until', { hint: 'Người chơi tới cách chỗ này ít hơn bao nhiêu thì xong (1 ≈ 10 m trên màn hình). Đường rộng ~15 → bán kính 9 là chạy ngang qua chỗ đó.' })) : null,
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
        textBox('Câu nói (bong bóng)', t.text, 5, { hint: '[tiếp] = câu sau (người chơi bấm E) · {name} = tên người chơi · bong bóng chỉ có chữ thường (không chữ đậm)', ref, fieldKey: 'talk' }),
        el('div', { class: 'grid' },
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
        st.mark ? field('Trên đầu', selectInput(st.mark.actor ? `actor:${st.mark.actor}` : st.mark.place, [...placeOpts, ...actorOpts().map(([id, l]) => [`actor:${id}`, `👤 ${l}`])], (v) => {
          if (v.startsWith('actor:')) { st.mark.actor = v.slice(6); delete st.mark.place; } else { st.mark.place = v; delete st.mark.actor; }
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

    // ---------- giữ người chơi trong một vùng ----------
    T.pane('rules').append(fold('🚧 Giữ người chơi trong vùng (trong lúc chờ bước này)', st.leash,
      el('div', { class: 'grid' },
        field('Giữ lại', checkInput(!!st.leash, (v) => {
          if (v) st.leash = { place: placeOpts[0]?.[0] || '', r: 30, text: newKey(`${base}.leash`) };
          else delete st.leash;
          rerender();
        }, 'Đi xa quá thì bị giữ lại + nhắc'), opt('leash', { hint: 'Vd chưa nói chuyện với anh phát tờ rơi thì không cho rời bến xe.' })),
        st.leash ? field('Quanh địa điểm', selectInput(st.leash.place, placeOpts, (v) => { st.leash.place = v; changed(); }), opt('leash')) : null,
        st.leash ? field('Bán kính (đơn vị bản đồ · 1 ≈ 10 m)', numInput(st.leash.r ?? 30, (v) => { st.leash.r = v; changed(); }, { step: 5, min: 10, max: 200 }), opt('leash')) : null),
      st.leash ? textBox('Câu nhắc khi đi ra khỏi vùng', st.leash.text, 1, { ref, fieldKey: 'leash' }) : null));

    // ---------- mục tiêu + hướng dẫn ----------
    const g = (st.guide = st.guide || null);
    const goal = el('div', { class: 'card' }, el('h3', {}, '🎯 Mục tiêu trên màn hình'));
    if (st.goal) goal.append(textBox('Mục tiêu', st.goal, 1, { ref, fieldKey: 'goal' }), st.hint ? textBox('Gợi ý (dòng nhỏ)', st.hint, 2, { ref, fieldKey: 'hint' }) : button('＋ Gợi ý', () => { st.hint = newKey(`${base}.hint`); rerender(); }, 'small'));
    else goal.append(el('p', { class: 'muted' }, 'Bước này chưa có mục tiêu (không có dòng mục tiêu trên màn hình — hợp với bước chỉ gửi tin / chờ / hướng dẫn chữ).'), button('＋ Mục tiêu', () => { st.goal = newKey(`${base}.goal`); rerender(); }, 'small'));
    {
      // hướng dẫn hiện cả khi bước không có mục tiêu (vd giải thích thanh xăng, app CSGT)
      goal.append(el('div', { class: 'grid' },
        st.goal && st.target ? field('', checkInput(!!st.noBeacon, (v) => { if (v) st.noBeacon = true; else delete st.noBeacon; changed(); }, 'Không có cột sáng (chỉ mũi tên)'), opt('noBeacon', { hint: 'Vd mục tiêu là tên cướp đang chạy — đã có chấm đỏ trên đầu, khỏi cột sáng đi theo.' })) : null,
        st.goal ? field('Mũi tên chỉ tới', selectInput(st.target || '', [['', '— Không —'], ['bike', '🚲 Xe của mình'], ['office', '🏢 Văn phòng hãng (đã chỉ đường / gần nhất)'], ['fuel', '⛽ Cây xăng / trụ sạc (đã chỉ đường / gần nhất)'], ...actorOpts().map(([id, l]) => [`actor:${id}`, `👤 ${l}`]), ...placeOpts], (v) => { if (v) st.target = v; else delete st.target; changed(); }), opt('target')) : null,
        field('Hướng dẫn trên điện thoại', selectInput(g?.type || '', [['', '— Không —'], ...Object.entries(GUIDES).filter(([k]) => !HIDDEN_GUIDES.includes(k) || k === g?.type)], (v) => {
          if (!v) delete st.guide;
          else st.guide = { type: v, ...(['thread', 'route', 'reply'].includes(v) ? { who: contactOpts[0]?.[0] || '' } : {}), ...(v === 'route' ? { place: st.target || 'office' } : {}), ...(v === 'switch' ? { which: 'food' } : {}),
            ...(v === 'hud' || v === 'profile' ? { ...(v === 'hud' ? { part: 'minimap' } : {}), btn: 'ok', title: newKey(`${base}.guideTitle`), hint: newKey(`${base}.guideHint`) } : {}), ...(v === 'use' ? { goods: goodsOpts[0]?.[0] || '' } : {}) };
          if (v === 'hud' || v === 'profile') st.until = { type: 'ack' }; // có nút Tiếp / Đã rõ → bấm mới sang bước sau
          rerender();
        }), opt('guide', { hint: 'Làm sáng nút cần bấm (màn hình tối xung quanh). "Chỉ đường": chưa bấm 📍 thì chưa có mũi tên.' })),
        g && ['thread', 'route', 'reply'].includes(g.type) ? field('Tin nhắn của', selectInput(g.who, contactOpts, (v) => { g.who = v; changed(); }), opt('guide')) : null,
        g?.type === 'route' ? field('Nút 📍 tới', selectInput(g.place, [['office', '🏢 Văn phòng hãng (bất kỳ)'], ...placeOpts], (v) => { g.place = v; changed(); }), opt('guide')) : null,
        g?.type === 'switch' ? field('Công tắc', selectInput(g.which, [['food', '📦 Giao hàng'], ['ride', '🛵 Chở khách']], (v) => { g.which = v; changed(); }), opt('guide')) : null,
        g?.type === 'use' ? field('Món cần dùng', selectInput(g.goods, goodsOpts, (v) => { g.goods = v; changed(); }), opt('guide')) : null));
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
    if (['actor', 'approach', 'leave', 'remove', 'board', 'alight', 'goto', 'chase', 'dismount', 'helmetOff', 'helmetOn', 'wave', 'rideOff', 'tackle'].includes(a.do)) box.append(field('Người lạ', selectInput(a.who, actorOpts(), (v) => { a.who = v; ctx.changed('story'); }), { ...o, hint: 'Thêm người ở 👥 Danh bạ → Người nói.' }));
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
        field('Chỗ đứng', selectInput(spot, Object.entries(ACTOR_SPOTS), (v) => {
          a.spot = v;
          if (v === 'xeOm') { a.place = a.place || xeOmPlaces[0]?.[0] || ''; delete a.dist; delete a.lat; }
          else if (v === 'place') { a.place = a.place || placeOpts[0]?.[0] || ''; a.dist = a.dist ?? 1.5; }
          else { a.dist = a.dist ?? 8; delete a.place; delete a.lat; }
          rerender();
        }), { ...o, hint: 'Cạnh chú xe ôm: chỗ cố định (mở lại game vẫn đứng đó). Gần người chơi: hiện chếch phía trước, mở lại game giữa cảnh thì không còn.' }),
        spot === 'xeOm'
          ? field('Địa điểm có chú xe ôm', selectInput(a.place, xeOmPlaces, (v) => { a.place = v; ctx.changed('story'); }), { ...o, hint: 'Chỉ các nơi bật "Có chú xe ôm" (thẻ Địa điểm).' })
          : spot === 'place'
            ? el('div', { class: 'grid' },
              field('Trước cửa địa điểm', selectInput(a.place, placeOpts, (v) => { a.place = v; ctx.changed('story'); }), o),
              field('Cách cửa ra phía đường (m)', numInput(a.dist ?? 1.5, (v) => { a.dist = v; ctx.changed('story'); }, { step: 0.5, min: 0, max: 40 }), { ...o, hint: '≈ 1,5 = ngay trước cửa · ≈ 16,5 = vỉa hè bên kia đường.' }))
            : field('Đứng cách người chơi (m)', numInput(a.dist ?? 8, (v) => { a.dist = v; ctx.changed('story'); }, { step: 1, min: 3, max: 20 }), o));
      // ô hiếm dùng → gấp vào "▸ Thêm" (đã đặt thì mở sẵn)
      const more = el('details', { class: 'adv', open: !!(a.lat || a.faceTo || a.vehicle || a.call || a.idle) },
        el('summary', {}, `▸ Thêm${spot === 'place' ? ': lệch dọc đường, nhìn về phía, xe đi kèm,' : ':'} câu gọi người chơi, câu nói khi hết chuyện`));
      if (spot === 'place') more.append(el('div', { class: 'grid' },
        field('Lệch dọc đường (m)', numInput(a.lat ?? 0, (v) => { if (v) a.lat = v; else delete a.lat; ctx.changed('story'); }, { step: 0.5, min: -20, max: 20 }), o),
        field('Nhìn về phía', selectInput(a.faceTo || '', [['', '— Cửa địa điểm —'], ...actorOpts().filter(([id]) => id !== a.who)], (v) => { if (v) a.faceTo = v; else delete a.faceTo; ctx.changed('story'); }), { ...o, hint: 'Hai người đứng nói chuyện với nhau. Người chơi tới gần (12 m) thì quay sang người chơi.' }),
        field('Xe đi kèm', selectInput(a.vehicle || '', [['', '— Không —'], ...Object.entries(ACTOR_VEHICLES)], (v) => { if (v) a.vehicle = v; else delete a.vehicle; ctx.changed('story'); }), { ...o, hint: 'Dựng sát lề. Việc "rời cảnh: bỏ chạy" → đội nón full-face, lên xe chạy mất.' })));
      // câu gọi (khi có dấu ! trên đầu) + câu nói khi hết chuyện (bấm E)
      for (const [k, label, hint] of [['call', 'Câu gọi người chơi', 'Khi có dấu ! trên đầu người này, cứ ~6 giây gọi một lần (người chơi ở trong 25 m).'], ['idle', 'Câu nói khi hết chuyện', 'Người chơi bấm E lúc không có bước nào chờ nói chuyện với người này.']]) {
        if (a[k]) more.append(textBox(label, a[k], 1, { hint, ...o }), button(`✕ Bỏ ${label.toLowerCase()}`, () => { delete a[k]; rerender(); }, 'small'));
        else more.append(button(`＋ ${label}`, () => { a[k] = newKey(`${base}.${k}`); rerender(); }, 'small'));
      }
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
    if (a.do === 'leave') box.append(el('p', { class: 'muted' }, 'Chạy ngược ra xa người chơi, ~5 giây sau biến mất (bong bóng thoại của người này cũng tắt). Có xe đi kèm thì đội nón, lên xe chạy mất.'));
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
    if (a.do === 'fade') {
      const rm = new Set([].concat(a.remove || []));
      box.append(
        el('p', { class: 'muted' }, 'Màn hình tối dần → hiện chữ → sáng lại. Lúc tối hẳn: dọn những người lạ được tick (vd tên cướp đã bị áp giải), dọn đạo cụ (xe công an…), người lạ "đứng lại" đứng dậy trước mặt người chơi. Cất điện thoại, thôi ghì. Đồng hồ vẫn chạy (bước sau nên chờ ≥ thời gian tối + 1,5 phút).'),
        textBox('Chữ trên màn đen', a.text, 1, o),
        el('div', { class: 'grid' },
          field('Giữ tối (giây)', numInput(a.t ?? 2, (v) => { a.t = v; ctx.changed('story'); }, { step: 0.5, min: 0.5, max: 10 }), o),
          field('', checkInput(!!a.props, (v) => { if (v) a.props = true; else delete a.props; ctx.changed('story'); }, 'Dọn hết đạo cụ'), o),
          field('Người đứng lại trước mặt', selectInput(a.stand || '', [['', '— Không —'], ...actorOpts()], (v) => { if (v) a.stand = v; else delete a.stand; rerender(); }), o),
          a.stand ? field('Cách người chơi (m)', numInput(a.dist ?? 2.2, (v) => { a.dist = v; ctx.changed('story'); }, { step: 0.1, min: 1, max: 6 }), o) : null),
        field('Dọn người lạ', el('div', { class: 'chips' }, actorOpts().map(([id, label]) => checkInput(rm.has(id), (on) => {
          if (on) rm.add(id); else rm.delete(id);
          if (rm.size) a.remove = [...rm]; else delete a.remove;
          ctx.changed('story');
        }, label))), o));
    }
    if (a.do === 'helmetOff') box.append(el('p', { class: 'muted' }, 'Người lạ đang đội mũ bảo hiểm (đang ngồi xe thì tự xuống trước): 2 tay giơ lên gỡ nón khỏi đầu (lộ tóc — kiểu tóc riêng của bộ đồ trong sơ đồ quan hệ), hạ xuống cầm nón tay phải.'));
    if (a.do === 'board') box.append(el('p', { class: 'muted' }, 'Người lạ đi theo người chơi; người chơi lên xe và chạy tới sát thì leo lên ngồi sau (tự đội mũ của mình, không qua app, không tính tiền). Dùng với điều kiện "Đã chở người lạ … tới …".'));
    if (a.do === 'alight') box.append(el('p', { class: 'muted' }, 'Người lạ xuống xe, đứng cạnh xe.'));
    if (a.do === 'drop') box.append(field('Gói hàng', selectInput(a.id, parcelOpts.filter(([id]) => id), (v) => { a.id = v; ctx.changed('story'); }), o));
    if (a.do === 'bubble') box.append(
      field('Ai nói', selectInput(a.who, [['player', '🙂 Người chơi'], ...speakerOpts2()], (v) => { a.who = v; ctx.changed('story'); }), o),
      textBox('Câu (bong bóng)', a.text, 2, { hint: 'Câu ngắn, hiện trên đầu ~3–9 giây (hoặc giữ tới câu sau). Không có chữ đậm / [tiếp]. {name} = tên người chơi', ...o }),
      field('Giữ tới câu sau', checkInput(!!a.hold, (v) => { if (v) a.hold = true; else delete a.hold; ctx.changed('story'); }, 'Không tự tắt'), { ...o, hint: 'Hợp với bước chờ người chơi bấm E (câu chỉ đổi khi bấm E / đi xa).' }));
    if (a.do === 'say') box.append(field('Người nói', selectInput(a.who, speakerOpts, (v) => { a.who = v; ctx.changed('story'); }), { ...o, hint: 'Bong bóng trên đầu người lạ đang có mặt, hoặc NPC ở địa điểm của người trong danh bạ (không có thì trên đầu người chơi).' }), textBox('Câu nói', a.text, 4, { hint: '[tiếp] = câu sau (bấm E) · {name} = tên người chơi', ...o }));
    if (a.do === 'msg') {
      box.append(field('Người gửi', selectInput(a.from, contactOpts, (v) => { a.from = v; ctx.changed('story'); }), o), textBox('Nội dung tin nhắn', a.text, 2, { hint: '{name} = tên người chơi', ...o }));
      a.loc = a.loc || [];
      box.append(field('Kèm định vị (nút 📍 Chỉ đường)', el('div', { class: 'chips' },
        a.loc.map((id, j) => button(`📍 ${placeOpts.find(([p]) => p === id)?.[1] || id} ✕`, () => { a.loc.splice(j, 1); if (!a.loc.length) delete a.loc; rerender(); }, 'small')),
        selectInput('', [['', '＋ Thêm định vị…'], ...placeOpts], (v) => { if (v) { a.loc.push(v); rerender(); } })), o));
    }
    if (a.do === 'replies') {
      box.append(field('Tin nhắn của', selectInput(a.who, contactOpts, (v) => { a.who = v; ctx.changed('story'); }), { ...o, hint: 'Gắn vào cuộc trò chuyện này; người chơi chọn 1 câu → xong điều kiện "Đã trả lời".' }));
      (a.texts || []).forEach((key, j) => box.append(answerRow(a, 'texts', j, `Câu trả lời ${j + 1}`, rerender, o)));
    }
    if (a.do === 'item') box.append(field('Vật phẩm', selectInput(a.id, Object.entries(data.items).map(([id, it]) => [id, `${it.icon || ''} ${C[it.name] || id}`]), (v) => { a.id = v; ctx.changed('story'); }), o));
    if (a.do === 'give') box.append(field('Đồ tặng', selectInput(a.goods, goodsOpts, (v) => { a.goods = v; ctx.changed('story'); }), o));
    if (a.do === 'toast') box.append(textBox('Thông báo', a.text, 2, o));
    if (a.do === 'openPhone') {
      box.append(field('Mở app', selectInput(a.app || 'chat', Object.keys(APP_DEFS).map((id) => [id, `${APP_DEFS[id].icon} ${C[APP_DEFS[id].key] || id}`]), (v) => { if (v === 'chat') delete a.app; else { a.app = v; delete a.who; } rerender(); }), o));
      if (!a.app || a.app === 'chat') box.append(field('Mở tin nhắn của', selectInput(a.who || '', [['', '— Chỉ mở app Tin nhắn —'], ...contactOpts], (v) => { if (v) a.who = v; else delete a.who; ctx.changed('story'); }), o));
    }
    if (a.do === 'fuel') box.append(field('Xăng / pin còn (%)', numInput(a.pct ?? 15, (v) => { a.pct = v; ctx.changed('story'); }, { step: 5, min: 0, max: 100 }), o));
    if (a.do === 'offer') {
      const foodPlaces = ctx.data.places.places.filter((p) => isPlaced(p) && p.kind === 'restaurant' && (p.menu || []).length).map((p) => [p.id, `${p.name} (${p.id})`]);
      box.append(
        field('Loại đơn', selectInput(a.kind || 'ride', [['ride', '🛵 Chở khách (khách người lớn bình thường, đứng gần mình)'], ['food', '🍜 Giao đồ ăn ở quán …']], (v) => {
          if (v === 'food') { a.kind = 'food'; a.place = a.place || foodPlaces[0]?.[0] || ''; } else { delete a.kind; delete a.place; }
          rerender();
        }), o),
        a.kind === 'food' ? field('Quán', selectInput(a.place, foodPlaces, (v) => { a.place = v; ctx.changed('story'); }), { ...o, hint: 'Món đầu tiên trong thực đơn quán; giao tới nhà dân, không hết món, khách nghe máy. Quán nấu riêng nên không xét giờ mở cửa.' })
          : field('Tên khách', textInput(a.customer || '', (v) => { if (v.trim()) a.customer = v.trim(); else delete a.customer; ctx.changed('story'); }, { placeholder: 'Bỏ trống = tên người lớn bình thường' }), { ...o, hint: 'Vd "Cô Hằng". Chữ đầu (Cô / Chú / Anh / Chị…) quyết định giới tính, tuổi, cách xưng hô.' }),
        el('p', { class: 'muted' }, 'Không hết hạn, nút Bỏ qua bị khóa. Nên tick "Chặn đơn thường" ở bước này (và bước bật công tắc ngay trước) để đơn ngẫu nhiên không chen vào.'));
    }
    return box;
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
        a.kind !== 'ramp' ? field('Tốc độ', numInput(a.speed ?? 8, (v) => setOpt('speed', v, (x) => x > 0), { step: 1, min: 1, max: 30 }), o) : null,
        a.kind === 'car' || a.kind === 'moto' ? field('Màu', textInput(a.color || '', (v) => setOpt('color', v.trim(), (x) => /^#[0-9a-f]{6}$/i.test(x)), { placeholder: 'bỏ trống = màu ngẫu nhiên cố định' }), o) : null,
        a.kind !== 'ramp' ? field('', checkInput(!!a.keep, (v) => { if (v) a.keep = true; else delete a.keep; ctx.changed('story'); }, 'Hết đường thì dừng lại (không biến mất)'), { ...o, hint: 'Vd xe máy tấp vào lề dừng hẳn. Không tick: hết đường thì đi khỏi cảnh (nên để điểm cuối ở xa, ngoài ống kính).' }) : null,
        a.kind === 'police' ? field('Số anh công an', numInput(a.cops ?? 2, (v) => { a.cops = v; ctx.changed('story'); }, { step: 1, min: 1, max: 4 }), { ...o, hint: 'Xe dừng ở cuối đường (tick "dừng lại") thì các anh bước xuống. Nói được: bong bóng "Ai nói" → 👮 Công an (xe <mã>).' }) : null,
        a.kind === 'police' ? field('Đi tới chỗ', selectInput(a.copsTo || '', [['', '— Đứng cạnh xe —'], ...actorOpts().map(([id, l]) => [`actor:${id}`, l])], (v) => setOpt('copsTo', v)), o) : null,
        a.kind === 'car' ? field('Kiểu ô tô', selectInput(a.model || '', [['', 'Sedan'], ['suv', 'SUV'], ['taxi', 'Taxi'], ['truck', 'Xe tải nhỏ']], (v) => setOpt('model', v)), o) : null,
        field('Tiếng lúc hiện ra', selectInput(a.sound || '', [['', '— Không —'], ...Object.values(SOUNDS).filter((x) => x.kind === 'sfx').map((x) => [x.id, `${x.id} — ${x.label}`])], (v) => setOpt('sound', v)), o),
        a.kind === 'ramp' ? field('Chỗ đặt [x, z]', el('div', { class: 'row' }, ...[0, 1].map((i) => numInput((a.at ||= [0, 0])[i], (v) => { a.at[i] = v; ctx.changed('story'); }, { step: 0.5 }))), o) : null,
        a.kind === 'ramp' ? field('Hướng (độ, 0 = lên dần về phía nam)', numInput(a.heading ?? 0, (v) => { a.heading = v; ctx.changed('story'); }, { step: 15, min: -360, max: 360 }), o) : null,
        a.kind === 'ramp' ? field('Dài / cao', el('div', { class: 'row' }, numInput(a.len ?? 7, (v) => { a.len = v; ctx.changed('story'); }, { step: 0.5, min: 2, max: 15 }), numInput(a.h ?? 1.5, (v) => { a.h = v; ctx.changed('story'); }, { step: 0.1, min: 0.3, max: 4 })), { ...o, hint: 'Khớp với điểm "cao" (y) của lộ trình chạy lên ván.' }) : null));
    if (a.kind !== 'ramp') {
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
        field('Ở địa điểm', selectInput(x.place || '', [['', '— Không —'], ...placeOpts], (v) => { if (v) x.place = v; else delete x.place; changed(); }), { ref, fieldKey: 'place' })]),
      block('🗣 Người nói (hội thoại, không nhắn tin)', data.people, 'people', 'Người lạ chỉ xuất hiện trong hộp thoại (vd anh phát tờ rơi).'),
      block('📄 Vật phẩm cốt truyện', data.items, 'item', 'Nằm trong túi đồ (mục Khác), vd tờ rơi.', (x, ref) => [textBox('Mô tả', x.desc || (x.desc = newKey(`${ref.replace(':', '.')}.desc`)), 2, { ref, fieldKey: 'desc' })]),
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
