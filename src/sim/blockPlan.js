// =============================================================
// HẺM TRONG KHỐI NHÀ — dựng mặt bằng một khối có hẻm (thuần dữ liệu, chạy được trong Node).
// Khối 40 m: vỉa hè 3 m quanh, bên trong 34 × 34 m (toạ độ cục bộ u: tây→đông, v: bắc→nam).
// Kiểu hẻm (ALLEY_TEMPLATES) = các đoạn hẻm thẳng; xoay 0–3 lần 90°. Miệng hẻm luôn ở giữa cạnh khối
// (u hoặc v = 17) để không vướng cây, cột đèn trên vỉa hè.
// Sau khi vạch hẻm, tự xếp nhà:
//   1) nhà mặt phố (sâu 9 m) dọc 4 cạnh, chừa chỗ miệng hẻm   → lô 'f0', 'f1'…  (cửa ra vỉa hè)
//   2) nhà trong hẻm (sâu 6 m) dọc hai bên mỗi đoạn hẻm      → lô 'h0', 'h1'…  (cửa ra hẻm)
//   3) phần còn trống → khối nhà phía sau (không có cửa)
// Ngẫu nhiên cố định theo toạ độ khối + kiểu hẻm → game và công cụ ?editor luôn ra cùng một mặt bằng.
// =============================================================
import { makeRng } from './rng.js';

export const INNER = 34; // cạnh phần bên trong khối (m)
const MID = 17;
// Bề rộng hẻm xe máy / hẻm đi bộ (m) — số nguyên, tâm hẻm ở số nguyên → mép hẻm trùng lưới 1 m (nhà không lấn hẻm).
// Hẻm đi bộ 2 m + 2 cột chắn ở miệng hẻm chừa khe giữa 0,9 m — người (0,7 m) đi qua, xe máy (1,4 m) thì không.
export const ALLEY_W = { bike: 4, walk: 2 };
const FRONT_D = 9; // độ sâu nhà mặt phố
const ALLEY_D = 6; // độ sâu nhà trong hẻm

// Đoạn hẻm: { a: 'v' (dọc, u = c, v từ s → e) | 'h' (ngang, v = c, u từ s → e), c, s, e }
export const ALLEY_TEMPLATES = {
  I: { label: 'Hẻm thẳng xuyên khối', segs: [{ a: 'v', c: MID, s: 0, e: INNER }] },
  dead: { label: 'Hẻm cụt', segs: [{ a: 'v', c: MID, s: 0, e: 25 }] },
  L: { label: 'Hẻm chữ L', segs: [{ a: 'v', c: MID, s: 0, e: MID }, { a: 'h', c: MID, s: MID, e: INNER }] },
  T: { label: 'Hẻm chữ T', segs: [{ a: 'h', c: MID, s: 0, e: INNER }, { a: 'v', c: MID, s: MID, e: INNER }] },
  fish: { label: 'Hẻm xương cá', segs: [{ a: 'v', c: MID, s: 0, e: INNER }, { a: 'h', c: 12, s: 3, e: MID }, { a: 'h', c: 22, s: MID, e: 31 }] },
};

// Xoay đoạn hẻm quanh tâm khối, mỗi lần 90° theo chiều kim đồng hồ (nhìn từ trên: bắc lên trên)
function rotSeg(sg, rot) {
  let { a, c, s, e } = sg;
  for (let k = 0; k < (rot & 3); k++) {
    // (u, v) → (INNER − v, u)
    if (a === 'v') ({ a, c, s, e } = { a: 'h', c, s: INNER - e, e: INNER - s }); // u = c, v∈[s,e] → v' = c, u' = INNER − v
    else ({ a, c, s, e } = { a: 'v', c: INNER - c, s, e }); // v = c, u∈[s,e] → u' = INNER − c, v' = u
  }
  return { a, c, s, e };
}

// Mặt bằng khối có hẻm, toạ độ cục bộ (0..INNER). spec: { alley, rot, walk }. seed: số nguyên theo khối.
export function planBlock(spec, seed) {
  const tpl = ALLEY_TEMPLATES[spec && spec.alley];
  if (!tpl) return null;
  const rng = makeRng(seed);
  const w = spec.walk ? ALLEY_W.walk : ALLEY_W.bike;
  const segs = tpl.segs.map((s) => rotSeg(s, spec.rot || 0));
  // hình chữ nhật của từng đoạn hẻm (nối dài nửa bề rộng ở đầu trong để các đoạn chạm nhau)
  const alleys = segs.map((sg) => {
    const s0 = sg.s > 0 ? sg.s - w / 2 : 0, e0 = sg.e < INNER ? sg.e + w / 2 : INNER;
    return sg.a === 'v' ? { u0: sg.c - w / 2, u1: sg.c + w / 2, v0: s0, v1: e0 } : { u0: s0, u1: e0, v0: sg.c - w / 2, v1: sg.c + w / 2 };
  });
  // miệng hẻm: đầu đoạn chạm mép khối → cạnh N/S/W/E
  const mouths = [];
  for (const sg of segs) {
    if (sg.a === 'v') {
      if (sg.s <= 0) mouths.push({ face: 'N', u: sg.c, v: 0 });
      if (sg.e >= INNER) mouths.push({ face: 'S', u: sg.c, v: INNER });
    } else {
      if (sg.s <= 0) mouths.push({ face: 'W', u: 0, v: sg.c });
      if (sg.e >= INNER) mouths.push({ face: 'E', u: INNER, v: sg.c });
    }
  }
  // lưới chiếm chỗ 1 m: 0 trống · 1 hẻm · 2 đã có nhà
  const grid = new Uint8Array(INNER * INNER);
  const at = (i, j) => grid[j * INNER + i];
  const inAlley = (i, j) => alleys.some((r) => i + 0.5 > r.u0 && i + 0.5 < r.u1 && j + 0.5 > r.v0 && j + 0.5 < r.v1);
  for (let j = 0; j < INNER; j++) for (let i = 0; i < INNER; i++) if (inAlley(i, j)) grid[j * INNER + i] = 1;
  // ô hẻm cắt qua lưới 1 m không tròn → dải nhà sát hẻm lấy theo mép thật của hẻm
  const free = (u0, v0, u1, v1) => {
    for (let j = Math.floor(v0); j < Math.ceil(v1); j++) for (let i = Math.floor(u0); i < Math.ceil(u1); i++) if (i < 0 || j < 0 || i >= INNER || j >= INNER || at(i, j) !== 0) return false;
    return true;
  };
  const take = (r) => {
    for (let j = Math.floor(r.v0); j < Math.ceil(r.v1); j++) for (let i = Math.floor(r.u0); i < Math.ceil(r.u1); i++) grid[j * INNER + i] = 2;
  };
  const lots = [];
  // chạy dọc một dải, cắt thành nhà rộng [wMin, wMax]; mk(a, b) → hình chữ nhật của nhà từ a tới b dọc dải
  const strip = (from, to, wMin, wMax, mk, extra) => {
    let a = from;
    while (a < to - 2.5) {
      let b = Math.min(to, a + rng.range(wMin, wMax));
      if (to - b < wMin * 0.6) b = to; // phần thừa ngắn quá thì gộp vào nhà cuối
      // co lại tới chỗ còn trống (gặp hẻm thì dừng trước hẻm)
      let r = mk(a, b);
      while (b - a > 2.5 && !free(r.u0, r.v0, r.u1, r.v1)) {
        b -= 1;
        r = mk(a, b);
      }
      if (b - a > 2.5 && free(r.u0, r.v0, r.u1, r.v1)) {
        take(r);
        lots.push({ ...r, ...extra });
        a = b;
      } else a += 1;
    }
  };
  // 1) nhà mặt phố: dãy bắc, nam (cả bề ngang), rồi tây, đông (phần giữa)
  strip(0, INNER, 5, 8, (a, b) => ({ u0: a, u1: b, v0: 0, v1: FRONT_D }), { face: 'N', front: true });
  strip(0, INNER, 5, 8, (a, b) => ({ u0: a, u1: b, v0: INNER - FRONT_D, v1: INNER }), { face: 'S', front: true });
  strip(FRONT_D, INNER - FRONT_D, 5, 8, (a, b) => ({ u0: 0, u1: FRONT_D, v0: a, v1: b }), { face: 'W', front: true });
  strip(FRONT_D, INNER - FRONT_D, 5, 8, (a, b) => ({ u0: INNER - FRONT_D, u1: INNER, v0: a, v1: b }), { face: 'E', front: true });
  // 2) nhà trong hẻm: hai bên mỗi đoạn hẻm, cửa quay ra hẻm
  alleys.forEach((r, k) => {
    const sg = segs[k];
    if (sg.a === 'v') {
      strip(r.v0, r.v1, 4.5, 6.5, (a, b) => ({ u0: Math.max(0, r.u0 - ALLEY_D), u1: r.u0, v0: a, v1: b }), { face: 'E', seg: k });
      strip(r.v0, r.v1, 4.5, 6.5, (a, b) => ({ u0: r.u1, u1: Math.min(INNER, r.u1 + ALLEY_D), v0: a, v1: b }), { face: 'W', seg: k });
    } else {
      strip(r.u0, r.u1, 4.5, 6.5, (a, b) => ({ u0: a, u1: b, v0: Math.max(0, r.v0 - ALLEY_D), v1: r.v0 }), { face: 'S', seg: k });
      strip(r.u0, r.u1, 4.5, 6.5, (a, b) => ({ u0: a, u1: b, v0: r.v1, v1: Math.min(INNER, r.v1 + ALLEY_D) }), { face: 'N', seg: k });
    }
  });
  // 3) phần còn trống → khối nhà phía sau (gộp ô trống thành hình chữ nhật)
  const fillers = [];
  for (let j = 0; j < INNER; j++) {
    for (let i = 0; i < INNER; i++) {
      if (at(i, j) !== 0) continue;
      let i1 = i;
      while (i1 < INNER && at(i1, j) === 0) i1++;
      let j1 = j + 1;
      while (j1 < INNER && [...Array(i1 - i).keys()].every((d) => at(i + d, j1) === 0)) j1++;
      const r = { u0: i, u1: i1, v0: j, v1: j1 };
      take(r);
      fillers.push(r);
    }
  }
  // đặt mã lô: nhà mặt phố f0…, nhà trong hẻm h0… (theo thứ tự xếp)
  let nf = 0, nh = 0;
  for (const l of lots) l.id = l.front ? `f${nf++}` : `h${nh++}`;
  // cột chắn ở miệng hẻm đi bộ: 2 cột cách tâm hẻm 0,55 m, lùi vào 0,3 m → khe giữa 0,9 m
  // (người đi bộ đi thẳng qua được; xe máy rộng 1,4 m thì không)
  const IN = { N: [0, 0.3], S: [0, -0.3], W: [0.3, 0], E: [-0.3, 0] };
  const posts = spec.walk ? mouths.flatMap((m) => [-0.55, 0.55].map((o) => {
    const across = m.face === 'N' || m.face === 'S' ? [o, 0] : [0, o];
    return { u: m.u + IN[m.face][0] + across[0], v: m.v + IN[m.face][1] + across[1] };
  })) : [];
  return { alleys, mouths, lots, fillers, posts, walk: !!spec.walk, w };
}
