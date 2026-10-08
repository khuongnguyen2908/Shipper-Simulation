// THAO TÁC DANH SÁCH của công cụ ?editor: sao chép · dán · xóa (thuần dữ liệu, chạy được trong bộ thử).
// Dán = bản giống hệt bản gốc (tên, thông số, nơi bán / thực đơn…); chỉ MÃ mới (và lô, với địa điểm).
// data = ctx.data (items, gear, goods, places, apps, content…). Mỗi hàm trả về { id?, files: [file đã đổi], … }
// hoặc { error } — phần hỏi/báo người dùng nằm ở opsUi.js.
import { PROTECTED, ID_RE, lotCells } from '../../data/validate.js';
import { CITY, LOT_SIZES, lotSize, lotParts, lotFaces, blockPlan } from '../../sim/cityLayout.js';
import { CHANGEABLE_KINDS } from './placeKind.js';
import { moveKey } from './order.js';
import { isPlaced } from '../../data/places.js';

// Các loại mục: ở thẻ nào, file nào, bảng nào, mã nào bị khóa
export const KINDS = {
  items: { label: 'món hàng', tab: 'items', file: 'items', get: (d) => d.items, sel: (id) => ({ id }), lock: PROTECTED.items },
  vehicles: { label: 'xe', tab: 'gear', file: 'gear', get: (d) => d.gear.vehicles, sel: (id) => ({ cat: 'vehicles', id }), lock: PROTECTED.vehicles },
  bags: { label: 'túi', tab: 'gear', file: 'gear', get: (d) => d.gear.bags, sel: (id) => ({ cat: 'bags', id }), lock: PROTECTED.bags },
  goods: { label: 'đồ dùng', tab: 'gear', file: 'goods', get: (d) => d.goods, sel: (id) => ({ cat: 'goods', id }), lock: [] },
  places: { label: 'địa điểm', tab: 'places', file: 'places', array: true, get: (d) => d.places.places, sel: (id) => ({ id }), lock: PROTECTED.places },
  orderTypes: { label: 'loại đơn', tab: 'app', file: 'apps', get: (d) => d.apps.orderTypes, sel: (id) => ({ cat: 'orderTypes', id }), lock: [] },
  riderTypes: { label: 'loại khách', tab: 'app', file: 'apps', get: (d) => d.apps.riderTypes, sel: (id) => ({ cat: 'riderTypes', id }), lock: [] },
};

// Mục đang chọn ở thẻ hiện tại → { kind, id } (null nếu thẻ/mục không có thao tác)
export function currentEntry(tab, sel = {}) {
  const id = sel.id;
  if (!id || id.startsWith('__')) return null;
  if (tab === 'items') return { kind: 'items', id };
  if (tab === 'places') return { kind: 'places', id };
  if (tab === 'gear') return KINDS[sel.cat || 'vehicles'] ? { kind: sel.cat || 'vehicles', id } : null;
  if (tab === 'app' && ['orderTypes', 'riderTypes'].includes(sel.cat)) return { kind: sel.cat, id };
  return null;
}
// Thẻ/nhóm đang xem dán được loại nào
export function pasteKindFor(tab, sel = {}) {
  if (tab === 'items' || tab === 'places') return tab;
  if (tab === 'gear') return sel.cat || 'vehicles';
  if (tab === 'app' && ['orderTypes', 'riderTypes'].includes(sel.cat)) return sel.cat;
  return null;
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const has = (kind, data, id) => (KINDS[kind].array ? KINDS[kind].get(data).some((x) => x.id === id) : !!KINDS[kind].get(data)[id]);
const find = (kind, data, id) => (KINDS[kind].array ? KINDS[kind].get(data).find((x) => x.id === id) : KINDS[kind].get(data)[id]);

// "pho" → "pho_2", "pho_2" → "pho_3" (mã mới chưa ai dùng)
export function uniqueId(base, taken) {
  const root = String(base).replace(/_\d+$/, '') || 'moi';
  let n = 2;
  while (taken(`${root}_${n}`)) n++;
  const id = `${root}_${n}`;
  return ID_RE.test(id) ? id : `moi_${n}`;
}

// Chèn mục mới ngay sau mục afterId (cuối danh sách nếu không có)
function insert(kind, data, obj, afterId) {
  const K = KINDS[kind];
  if (K.array) {
    const arr = K.get(data);
    const i = arr.findIndex((x) => x.id === afterId);
    arr.splice(i < 0 ? arr.length : i + 1, 0, obj);
    return;
  }
  const table = K.get(data);
  table[obj.id] = obj;
  const keys = Object.keys(table);
  const at = keys.indexOf(afterId);
  if (at >= 0) moveKey(table, keys.length - 1, at + 1);
}

// Lô trống cùng kích thước cho địa điểm (ưu tiên khối gần khối gốc). Trả về { block, lot } hoặc null.
export function findSpot(data, lot, near = [0, 0]) {
  const places = data.places.places;
  const pd = data.places;
  const taken = new Set(places.flatMap(lotCells));
  if (pd.alley) taken.add(`${pd.alley.block[0]},${pd.alley.block[1]},${pd.alley.lot}`);
  const size = lotSize(lot) || 'one';
  const blocks = [];
  for (let bz = 0; bz < CITY.N; bz++) for (let bx = 0; bx < CITY.N; bx++) blocks.push([bx, bz]);
  blocks.sort((a, b) => Math.abs(a[0] - near[0]) + Math.abs(a[1] - near[1]) - (Math.abs(b[0] - near[0]) + Math.abs(b[1] - near[1])));
  for (const [bx, bz] of blocks) {
    const plan = blockPlan(bx, bz, data.map);
    // khối có hẻm: chỉ nhà 1 lô theo mặt bằng hẻm; khối thường: lô cùng kích thước
    const cands = plan ? (size === 'one' ? plan.lots.map((l) => l.id) : []) : LOT_SIZES[size];
    for (const l of cands) if (lotParts(l).every((c) => !taken.has(`${bx},${bz},${c}`))) return { block: [bx, bz], lot: l, alleyBlock: !!plan };
  }
  return null;
}

// Đặt địa điểm (bản dán) vào lô trống; bỏ hướng mặt tiền nếu lô mới không hợp
function placeSomewhere(data, p, near) {
  const spot = findSpot(data, p.lot, near);
  if (!spot) return false;
  p.block = spot.block;
  p.lot = spot.lot;
  if (p.face && (spot.alleyBlock || !lotFaces(p.lot).includes(p.face))) delete p.face;
  return true;
}

// Lời thoại riêng npc.<mã>.* của địa điểm
const npcLines = (content, id) => Object.fromEntries(Object.entries(content).filter(([k]) => k.startsWith(`npc.${id}.`)).map(([k, v]) => [k.slice(`npc.${id}.`.length), v]));

// ---------- SAO CHÉP / DÁN ----------
export const CLIP_TAG = 'shipper-editor';

// Mục này đang có mặt ở đâu (dữ liệu nằm NGOÀI mục): thực đơn quán, loại đơn, tiệm bán, loại khách xe ôm
export function linksOf(data, kind, id) {
  const places = data.places?.places || [];
  if (kind === 'items') {
    return {
      menus: places.filter((p) => (p.menu || []).includes(id)).map((p) => p.id),
      orderTypes: Object.values(data.apps?.orderTypes || {}).filter((t) => (t.items || []).includes(id)).map((t) => t.id),
    };
  }
  if (['vehicles', 'bags', 'goods'].includes(kind)) return { sells: places.filter((p) => (p.sells?.[kind] || []).includes(id)).map((p) => p.id) };
  if (kind === 'places') return { riders: Object.values(data.apps?.riderTypes || {}).filter((r) => (r.from || []).includes(id)).map((r) => r.id) };
  return {};
}

// Gắn bản dán vào đúng những chỗ bản gốc đang có; chỗ không có ở dữ liệu này thì bỏ và báo
function applyLinks(data, kind, newId, links = {}, files, dropped) {
  const places = data.places?.places || [];
  const placeById = (pid) => places.find((p) => p.id === pid);
  for (const pid of links.menus || []) {
    const p = placeById(pid);
    if (!p || p.kind !== 'restaurant') { dropped.push(`thực đơn quán "${pid}"`); continue; }
    if (!(p.menu = p.menu || []).includes(newId)) p.menu.push(newId);
    files.add('places');
  }
  for (const tid of links.orderTypes || []) {
    const t = data.apps?.orderTypes?.[tid];
    if (!t) { dropped.push(`loại đơn "${tid}"`); continue; }
    if (!(t.items = t.items || []).includes(newId)) t.items.push(newId);
    files.add('apps');
  }
  for (const pid of links.sells || []) {
    const p = placeById(pid);
    if (!p) { dropped.push(`nơi bán "${pid}"`); continue; }
    p.sells = p.sells || {};
    if (!(p.sells[kind] = p.sells[kind] || []).includes(newId)) p.sells[kind].push(newId);
    files.add('places');
  }
  for (const rid of links.riders || []) {
    const r = data.apps?.riderTypes?.[rid];
    if (!r) { dropped.push(`loại khách "${rid}"`); continue; }
    if (!(r.from = r.from || []).includes(newId)) r.from.push(newId);
    files.add('apps');
  }
}

export function makeClip(data, kind, id) {
  const src = find(kind, data, id);
  if (!src) return null;
  const clip = { [CLIP_TAG]: 1, kind, data: clone(src), links: linksOf(data, kind, id) };
  if (kind === 'places') clip.npc = npcLines(data.content, id);
  return clip;
}
// Hoạt động trong địa điểm (dán vào thẻ hoạt động của địa điểm khác)
export const makeActivityClip = (act) => ({ [CLIP_TAG]: 1, kind: 'activity', data: clone(act) });

export function parseClip(text) {
  try {
    const j = typeof text === 'string' ? JSON.parse(text) : text;
    return j && j[CLIP_TAG] === 1 && (KINDS[j.kind] || j.kind === 'activity') && j.data && typeof j.data === 'object' ? j : null;
  } catch {
    return null;
  }
}

// Dán: tạo mục mới (mã không trùng). Tham chiếu tới thứ không có ở đây (món, đồ, địa điểm) bị bỏ và báo lại.
export function paste(data, clip, afterId = null) {
  const kind = clip.kind;
  const K = KINDS[kind];
  if (!K) return { error: 'Không dán được loại này ở đây.' };
  const obj = clone(clip.data);
  const wanted = ID_RE.test(obj.id || '') && !has(kind, data, obj.id) ? obj.id : uniqueId(obj.id || 'moi', (x) => has(kind, data, x));
  obj.id = wanted;
  const files = new Set([K.file]);
  const dropped = [];
  const keep = (list, ok, what) => (list || []).filter((x) => (ok(x) ? true : (dropped.push(`${what} "${x}"`), false)));
  if (kind === 'places') {
    if (!CHANGEABLE_KINDS.includes(obj.kind)) return { error: `Địa điểm loại "${obj.kind}" gắn với cốt truyện — không dán thêm được.` };
    delete obj.hidden;
    // bản gốc đã đặt trên bản đồ → bản dán vào lô trống gần đó; bản gốc đang chờ → bản dán cũng nằm chờ
    if (isPlaced(obj) && !placeSomewhere(data, obj, obj.block)) return { error: 'Hết lô trống cùng kích thước để dán địa điểm này.' };
    if (obj.menu) obj.menu = keep(obj.menu, (x) => !!data.items[x], 'món');
    if (obj.sells) {
      if (obj.sells.goods) obj.sells.goods = keep(obj.sells.goods, (x) => !!data.goods[x], 'đồ dùng');
      if (obj.sells.bags) obj.sells.bags = keep(obj.sells.bags, (x) => !!data.gear.bags[x], 'túi');
      if (obj.sells.vehicles) obj.sells.vehicles = keep(obj.sells.vehicles, (x) => !!data.gear.vehicles[x], 'xe');
    }
    for (const a of obj.activities || []) if (a.needs && !data.goods[a.needs.id]) { dropped.push(`đồ cần "${a.needs.id}"`); delete a.needs; }
    for (const [k, v] of Object.entries(clip.npc || {})) data.content[`npc.${obj.id}.${k}`] = v;
    if (Object.keys(clip.npc || {}).length) files.add('content');
  }
  if (kind === 'orderTypes' && obj.items) obj.items = keep(obj.items, (x) => !!data.items[x], 'món');
  if (kind === 'riderTypes' && obj.from) obj.from = keep(obj.from, (x) => data.places.places.some((p) => p.id === x), 'địa điểm');
  insert(kind, data, obj, afterId);
  applyLinks(data, kind, obj.id, clip.links, files, dropped);
  return { id: obj.id, files: [...files], dropped, where: kind === 'places' ? (isPlaced(obj) ? `khối ${obj.block.join(',')} lô ${obj.lot}` : 'chưa đặt trên bản đồ') : null };
}

// ---------- XÓA ----------
// Những gì sẽ bị ảnh hưởng (để hỏi lại trước khi xóa)
export function removeInfo(data, kind, id) {
  const src = find(kind, data, id);
  if (!src) return { error: 'Không tìm thấy mục để xóa.' };
  if ((KINDS[kind].lock || []).includes(id)) return { error: `"${src.name || id}" gắn với code / cốt truyện — không xóa được.` };
  if (kind === 'places' && src.kind === 'restaurant' && data.places.places.filter((x) => x.kind === 'restaurant').length <= 1) return { error: 'Cần giữ ít nhất 1 quán ăn.' };
  const notes = [];
  const places = data.places.places;
  if (kind === 'items') {
    const using = places.filter((p) => (p.menu || []).includes(id));
    if (using.length) notes.push(`Gỡ khỏi thực đơn: ${using.map((p) => p.name).join(', ')}.`);
  }
  if (['vehicles', 'bags', 'goods'].includes(kind)) {
    const users = places.filter((p) => (p.sells?.[kind] || []).includes(id));
    if (users.length) notes.push(`Gỡ khỏi hàng của: ${users.map((p) => p.name).join(', ')}.`);
    if (kind === 'goods') {
      const needers = places.filter((p) => (p.activities || []).some((a) => a.needs?.id === id));
      if (needers.length) notes.push(`Hoạt động ở ${needers.map((p) => p.name).join(', ')} sẽ không cần món này nữa.`);
    }
    notes.push('Người chơi đã mua sẽ không còn tác dụng của món này.');
  }
  return { name: src.name || id, notes };
}

export function remove(data, base, kind, id) {
  const info = removeInfo(data, kind, id);
  if (info.error) return info;
  const K = KINDS[kind];
  const files = new Set([K.file]);
  const places = data.places.places;
  if (K.array) data.places.places = places.filter((x) => x.id !== id);
  else delete K.get(data)[id];
  if (kind === 'items') {
    for (const p of places) if ((p.menu || []).includes(id)) { p.menu = p.menu.filter((m) => m !== id); files.add('places'); }
    for (const t of Object.values(data.apps?.orderTypes || {})) if ((t.items || []).includes(id)) { t.items = t.items.filter((x) => x !== id); files.add('apps'); }
  }
  if (['vehicles', 'bags', 'goods'].includes(kind)) {
    for (const p of places) {
      if ((p.sells?.[kind] || []).includes(id)) {
        p.sells[kind] = p.sells[kind].filter((x) => x !== id);
        files.add('places');
      }
      if (kind === 'goods') for (const a of p.activities || []) if (a.needs?.id === id) { delete a.needs; files.add('places'); }
    }
  }
  if (kind === 'places') {
    // lời thoại riêng mới tạo thêm thì xóa theo; khóa gốc của game giữ lại
    for (const k of Object.keys(data.content)) if (k.startsWith(`npc.${id}.`) && !(k in (base?.content || {}))) { delete data.content[k]; files.add('content'); }
    for (const r of Object.values(data.apps?.riderTypes || {})) if ((r.from || []).includes(id)) { r.from = r.from.filter((x) => x !== id); files.add('apps'); }
  }
  return { files: [...files] };
}
