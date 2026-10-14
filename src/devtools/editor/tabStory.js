// Thẻ 📖 CỐT TRUYỆN (src/data/story.json): chương → các bước. Mỗi bước: việc làm khi vào bước (tin nhắn, hội thoại…),
// điều kiện xong bước, nói chuyện ở địa điểm, mục tiêu trên màn hình, hướng dẫn trên điện thoại.
// Câu chữ gõ ngay tại đây — lưu vào kho chữ vi.json (khóa story.*), sửa ở đây hay ở thẻ 💬 Chữ & hội thoại đều được.
// Bộ chạy: src/sim/story.js · hiển thị: game.js (runStoryActions, storyGoal, storyGuide).
import { UNTIL, ACTIONS, GUIDES, HUD_PARTS, ORDER_STAGES, GUIDE_BTNS } from '../../sim/story.js';
import { APP_DEFS } from '../../data/phoneApps.js';
import { isPlaced } from '../../data/places.js';
import { ID_RE } from '../../data/validate.js';
import { el, field, textInput, numInput, button, sideList, selectInput, emojiInput, areaInput, checkInput, explain } from './ui.js';

const TRAITS = [['fragile', '⚠️ Dễ vỡ'], ['hot', '🔥 Nóng'], ['cold', '❄️ Lạnh'], ['liquid', '💧 Nước']];

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
  const speakerOpts = [...Object.entries(data.people).map(([id, c]) => [id, `${c.icon || ''} ${C[c.name] || id}`]), ...contactOpts];
  const goodsOpts = Object.values(ctx.data.goods).filter((g) => g.type === 'consumable' || g.type === 'carry').map((g) => [g.id, `${g.icon || ''} ${g.name}`]);
  const parcelOpts = [['', '— Không —'], ...Object.entries(data.parcels).map(([id, p]) => [id, `${p.icon || ''} ${C[p.name] || id}`])];

  // ---------- bên trái ----------
  const rows = [{ id: 'people', icon: '👥', title: 'Danh bạ · người nói · vật phẩm', sub: `${Object.keys(data.contacts).length} người nhắn`, fixed: true }];
  for (const ch of data.chapters) {
    rows.push({ id: `ch:${ch.id}`, icon: '📖', title: `${C[ch.title] || ch.id}: ${C[ch.name] || ''}`, sub: `${(ch.steps || []).length} bước`, fixed: true });
    (ch.steps || []).forEach((st, i) => rows.push({ id: `${ch.id}/${st.id}`, icon: `${i + 1}.`, title: C[st.goal] || st.id, sub: `${st.id} · ${UNTIL[st.until?.type || 'none']?.split(' (')[0] || ''}`, fixed: true }));
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
        <p>Trong lúc chờ, màn hình hiện <b>mục tiêu</b> của bước (mũi tên chỉ tới địa điểm nếu có), điện thoại làm sáng nút cần bấm (<b>hướng dẫn</b>). Người chơi bấm "Bỏ qua hướng dẫn" thì chỉ tắt phần làm sáng nút.</p>
        <p>Chương 1 bắt đầu sau màn "tới thành phố" khi chơi mới. Hết bước có việc "Kết thúc chương" → hiện chữ hoàn thành, lưu game, sang chương sau.</p>
        <p>Chơi nhiều người: cốt truyện là của riêng từng người, đồng hồ vẫn chạy chung.</p>`]),
      el('div', { class: 'grid' },
        textBox('Tên chương (vd "Chương 1")', ch.title, 1),
        textBox('Tên phụ (vd "Cuộc sống mới, công việc mới")', ch.name, 1),
      ),
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
        field('', checkInput(st.hold, (v) => { if (v) st.hold = true; else delete st.hold; changed(); }, 'Chặn đơn thường trong bước này'), opt('hold', { hint: 'App chưa phát đơn mới trong lúc chờ bước này (để hướng dẫn / cuốc cốt truyện không bị đơn khác chen vào).' })),
      ),
    );

    // ---------- việc làm khi vào bước ----------
    st.on = st.on || [];
    const acts = el('div', { class: 'card' }, el('h3', {}, '▶️ Khi vào bước, làm lần lượt'));
    st.on.forEach((a, k) => acts.append(actionRow(st, a, k, base, rerender, opt)));
    acts.append(el('div', { class: 'row' }, selectInput('', [['', '＋ Thêm việc…'], ...Object.entries(ACTIONS)], (v) => {
      if (!v) return;
      const a = { do: v };
      if (v === 'say') Object.assign(a, { who: speakerOpts[0]?.[0] || '', text: newKey(`${base}.say`) });
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
    body.append(acts);

    // ---------- điều kiện xong bước ----------
    const u = (st.until = st.until || { type: 'none' });
    const until = el('div', { class: 'card' }, el('h3', {}, '✅ Xong bước khi'),
      el('div', { class: 'grid' }, field('Điều kiện', selectInput(u.type, Object.entries(UNTIL), (v) => {
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
        if (v === 'talk') {
          const place = st.talk?.place || placeOpts[0]?.[0] || '';
          st.until.place = place;
          st.talk = st.talk || { place, label: newKey(`${base}.label`), text: newKey(`${base}.text`), ok: newKey(`${base}.ok`) };
        } else delete st.talk;
        rerender();
      }), opt('until')),
      (u.type === 'read' || u.type === 'reply' || u.type === 'open') ? field('Người nhắn', selectInput(u.who, contactOpts, (v) => { u.who = v; changed(); }), opt('until')) : null,
      u.type === 'routed' ? field('Chỉ đường tới', selectInput(u.place, [['office', '🏢 Văn phòng hãng (bất kỳ)'], ['fuel', '⛽ Cây xăng / trụ sạc (bất kỳ)'], ...placeOpts], (v) => { u.place = v; changed(); }), opt('until')) : null,
      u.type === 'fuel' ? field('Xăng / pin ít nhất (%)', numInput(u.pct ?? 90, (v) => { u.pct = v; changed(); }, { step: 5, min: 1, max: 100 }), opt('until', { hint: 'Xe đạp: coi như xong ngay.' })) : null,
      u.type === 'order' ? field('Mốc', selectInput(u.stage, Object.entries(ORDER_STAGES), (v) => { u.stage = v; changed(); }), opt('until')) : null,
      u.type === 'ack' ? field('Tự sang sau (phút game, 0 = chờ bấm nút)', numInput(u.max ?? 0, (v) => { if (v > 0) u.max = v; else delete u.max; changed(); }, { step: 1, min: 0 }), opt('until', { hint: '1 phút game = 1 giây thật.' })) : null,
      u.type === 'use' ? field('Món', selectInput(u.goods, goodsOpts, (v) => { u.goods = v; changed(); }), opt('until')) : null,
      u.type === 'arrive' ? field('Địa điểm', selectInput(u.place, placeOpts, (v) => { u.place = v; changed(); }), opt('until')) : null,
      u.type === 'arrive' ? field('Bán kính (m)', numInput(u.r ?? 8, (v) => { u.r = v; changed(); }, { step: 1, min: 2 }), opt('until')) : null,
      u.type === 'wait' ? field('Số phút game', numInput(u.min ?? 0, (v) => { u.min = v; changed(); }, { step: 1, min: 0 }), opt('until')) : null,
      u.type === 'switch' ? field('Công tắc', selectInput(u.which, [['food', '📦 Giao hàng'], ['ride', '🛵 Chở khách']], (v) => { u.which = v; changed(); }), opt('until')) : null,
      u.type === 'talk' ? field('Địa điểm nói chuyện', selectInput(u.place, placeOpts, (v) => { u.place = v; st.talk.place = v; changed(); }), opt('talk')) : null));
    body.append(until);

    // ---------- nói chuyện ở địa điểm ----------
    if (u.type === 'talk' && st.talk) {
      const t = st.talk;
      body.append(el('div', { class: 'card' }, el('h3', {}, '💬 Nói chuyện (nút E riêng ở cửa địa điểm)'),
        textBox('Chữ trên nút E', t.label, 1, { ref, fieldKey: 'talk' }),
        textBox('Câu nói (hộp thoại)', t.text, 5, { hint: '[tiếp] = sang trang · {name} = tên người chơi · <b>…</b> = chữ đậm', ref, fieldKey: 'talk' }),
        textBox('Chữ nút đồng ý', t.ok, 1, { ref, fieldKey: 'talk' }),
        el('div', { class: 'grid' },
          field('Xếp gói hàng vào túi', parcelChips(t, 'pack'), { hint: 'Bấm đồng ý → mở màn xếp túi với các gói này (có hướng dẫn chọn món → bấm ô → xoay → xếp xong), xếp xong mới xong bước.' }),
          field('Giao gói hàng', parcelChips(t, 'drop'), { hint: 'Người chơi đang chở các gói này thì giao luôn.' }),
          field('Tặng đồ', selectInput(t.give || '', [['', '— Không —'], ...goodsOpts], (v) => { if (v) t.give = v; else delete t.give; changed(); }), { hint: 'Đồ dùng 1 lần / đồ mang theo, vào túi đồ.' }),
          t.give ? field('Số phần tặng', numInput(t.giveQty ?? 1, (v) => { if (v > 1) t.giveQty = v; else delete t.giveQty; changed(); }, { step: 1, min: 1, max: 20 })) : null)));
    }

    // ---------- dấu trên đầu NPC ----------
    body.append(el('div', { class: 'card' }, el('h3', {}, '❗ Dấu trên đầu NPC (trong lúc chờ bước này)'),
      el('div', { class: 'grid' },
        field('Dấu', selectInput(st.mark?.icon || '', [['', '— Không —'], ['!', '! (có việc mới)'], ['?', '? (quay lại nói chuyện)']], (v) => {
          if (!v) delete st.mark;
          else st.mark = { place: st.mark?.place || st.talk?.place || placeOpts[0]?.[0] || '', icon: v };
          rerender();
        }), opt('mark')),
        st.mark ? field('Ở địa điểm (NPC của địa điểm)', selectInput(st.mark.place, placeOpts, (v) => { st.mark.place = v; changed(); }), opt('mark')) : null)));

    // ---------- mục tiêu + hướng dẫn ----------
    const g = (st.guide = st.guide || null);
    const goal = el('div', { class: 'card' }, el('h3', {}, '🎯 Mục tiêu trên màn hình'));
    if (st.goal) goal.append(textBox('Mục tiêu', st.goal, 1, { ref, fieldKey: 'goal' }), st.hint ? textBox('Gợi ý (dòng nhỏ)', st.hint, 2, { ref, fieldKey: 'hint' }) : button('＋ Gợi ý', () => { st.hint = newKey(`${base}.hint`); rerender(); }, 'small'));
    else goal.append(el('p', { class: 'muted' }, 'Bước này chưa có mục tiêu (không có dòng mục tiêu trên màn hình — hợp với bước chỉ gửi tin / chờ / hướng dẫn chữ).'), button('＋ Mục tiêu', () => { st.goal = newKey(`${base}.goal`); rerender(); }, 'small'));
    {
      // hướng dẫn hiện cả khi bước không có mục tiêu (vd giải thích thanh xăng, app CSGT)
      goal.append(el('div', { class: 'grid' },
        st.goal ? field('Mũi tên chỉ tới', selectInput(st.target || '', [['', '— Không —'], ['bike', '🚲 Xe của mình'], ['office', '🏢 Văn phòng hãng (đã chỉ đường / gần nhất)'], ['fuel', '⛽ Cây xăng / trụ sạc (đã chỉ đường / gần nhất)'], ...placeOpts], (v) => { if (v) st.target = v; else delete st.target; changed(); }), opt('target')) : null,
        field('Hướng dẫn trên điện thoại', selectInput(g?.type || '', [['', '— Không —'], ...Object.entries(GUIDES)], (v) => {
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
    body.append(goal);
  }

  // Một dòng việc: loại + ô riêng theo loại + ↑ ↓ ✕
  function actionRow(st, a, k, base, rerender, opt) {
    const tools = el('div', { class: 'row' },
      el('b', {}, `${k + 1}. ${ACTIONS[a.do] || a.do}`),
      button('↑', () => { if (k > 0) { st.on.splice(k - 1, 0, st.on.splice(k, 1)[0]); rerender(); } }, 'small'),
      button('↓', () => { if (k < st.on.length - 1) { st.on.splice(k + 1, 0, st.on.splice(k, 1)[0]); rerender(); } }, 'small'),
      button('✕', () => { st.on.splice(k, 1); rerender(); }, 'small danger'));
    const box = el('div', { class: 'story-act' }, tools);
    const o = opt('on');
    if (a.do === 'say') box.append(field('Người nói', selectInput(a.who, speakerOpts, (v) => { a.who = v; ctx.changed('story'); }), o), textBox('Câu nói', a.text, 4, { hint: '[tiếp] = sang trang · {name} = tên người chơi', ...o }));
    if (a.do === 'msg') {
      box.append(field('Người gửi', selectInput(a.from, contactOpts, (v) => { a.from = v; ctx.changed('story'); }), o), textBox('Nội dung tin nhắn', a.text, 2, { hint: '{name} = tên người chơi', ...o }));
      a.loc = a.loc || [];
      box.append(field('Kèm định vị (nút 📍 Chỉ đường)', el('div', { class: 'chips' },
        a.loc.map((id, j) => button(`📍 ${placeOpts.find(([p]) => p === id)?.[1] || id} ✕`, () => { a.loc.splice(j, 1); if (!a.loc.length) delete a.loc; rerender(); }, 'small')),
        selectInput('', [['', '＋ Thêm định vị…'], ...placeOpts], (v) => { if (v) { a.loc.push(v); rerender(); } })), o));
    }
    if (a.do === 'replies') {
      box.append(field('Tin nhắn của', selectInput(a.who, contactOpts, (v) => { a.who = v; ctx.changed('story'); }), { ...o, hint: 'Gắn vào cuộc trò chuyện này; người chơi chọn 1 câu → xong điều kiện "Đã trả lời".' }));
      (a.texts || []).forEach((key, j) => box.append(textBox(`Câu trả lời ${j + 1}`, key, 1, o)));
    }
    if (a.do === 'item') box.append(field('Vật phẩm', selectInput(a.id, Object.entries(data.items).map(([id, it]) => [id, `${it.icon || ''} ${C[it.name] || id}`]), (v) => { a.id = v; ctx.changed('story'); }), o));
    if (a.do === 'give') box.append(field('Đồ tặng', selectInput(a.goods, goodsOpts, (v) => { a.goods = v; ctx.changed('story'); }), o));
    if (a.do === 'toast') box.append(textBox('Thông báo', a.text, 2, o));
    if (a.do === 'openPhone') {
      box.append(field('Mở app', selectInput(a.app || 'chat', Object.keys(APP_DEFS).map((id) => [id, `${APP_DEFS[id].icon} ${C[APP_DEFS[id].key] || id}`]), (v) => { if (v === 'chat') delete a.app; else { a.app = v; delete a.who; } rerender(); }), o));
      if (!a.app || a.app === 'chat') box.append(field('Mở tin nhắn của', selectInput(a.who || '', [['', '— Chỉ mở app Tin nhắn —'], ...contactOpts], (v) => { if (v) a.who = v; else delete a.who; ctx.changed('story'); }), o));
    }
    if (a.do === 'fuel') box.append(field('Xăng / pin còn (%)', numInput(a.pct ?? 15, (v) => { a.pct = v; ctx.changed('story'); }, { step: 5, min: 0, max: 100 }), o));
    if (a.do === 'offer') box.append(el('p', { class: 'muted' }, 'Khách app đứng gần người chơi (30–120 m), không hết hạn, nút Bỏ qua bị khóa. Nên tick "Chặn đơn thường" và đặt điều kiện xong "Đơn hàng: Đã nhận đơn".'));
    return box;
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
