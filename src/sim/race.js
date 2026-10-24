// =============================================================
// MÀN ĐUA THOÁT THÂN (cốt truyện chương 6): luật thuần, không Three.js / DOM.
// Đường đua dựng từ các đoạn (story.json → races.<id>.sections): mỗi đoạn dài len m, rẽ turn độ, rộng width m, kiểu kind
// (cảng, cổng, quốc lộ, công trình, đường đất, xóm, bờ kênh, cầu, đê, cầu cất, đường cụt) — sửa ở ?editor 📖 → 🏍️ Màn đua.
// Toạ độ đường tính từ gốc 0 (game cộng gốc bản đồ riêng). Đường đi theo hướng heading (0 = +z), turn dương = rẽ trái.
// =============================================================
import storyData from '../data/story.json' with { type: 'json' };

export const raceOf = (id, data = storyData) => data.races?.[id] || null;
// Số mặc định từng kiểu đoạn: bề rộng, độ uốn lượn, xe cộ
export const KIND_DEFAULT = {
  port: { width: 12, wig: 0.06, traffic: 0 },
  gate: { width: 9, wig: 0, traffic: 0 },
  industrial: { width: 12, wig: 0.08, traffic: 0.35 },
  highway: { width: 16, wig: 0.05, traffic: 0.8 },
  work: { width: 8, wig: 0, traffic: 0 },
  dirt: { width: 6.5, wig: 0.22, traffic: 0.05 },
  village: { width: 6, wig: 0.18, traffic: 0.15 },
  canal: { width: 5.5, wig: 0.25, traffic: 0.05 },
  bridge: { width: 5, wig: 0, traffic: 0 },
  levee: { width: 6, wig: 0.15, traffic: 0 },
  drawbridge: { width: 8, wig: 0, traffic: 0 },
  deadend: { width: 7, wig: 0, traffic: 0 },
};
export const RACE = { step: 2, caughtGap: 5, caughtTime: 4, crashMax: 3, crashStop: 1.8, jumpSpeed: 22.2, chaseGap: 16, moto: 40, truck: 38, endBrake: 50,
  leaf: 14, bridgeOpen: 450, bridgeRate: 2.2, bridgeMax: 75, bridgeSteep: 42, g: 18 }; // moto / truck: tốc độ tối đa xe giang hồ / bán tải Tí Đô (nhanh hơn xe mình chút — chạy giỏi chỉ giữ được khoảng cách, té là bị áp sát)
// Cầu cất: mỗi nửa cầu dài leaf m, bắt đầu mở khi mình còn cách giữa cầu bridgeOpen m, nâng bridgeRate độ/giây (tối đa bridgeMax); dốc hơn bridgeSteep độ thì xe không leo nổi · g: trọng lực khi bay (nặng hơn thật cho cú bay gọn, kiểu game)

// Dựng đường: mảng điểm cách nhau step m { x, z, h (hướng), s (quãng đường), si (đoạn), w (rộng) }
export function buildTrack(def, step = RACE.step) {
  const pts = [], secStart = [];
  let x = 0, z = 0, h = 0, s = 0;
  (def.sections || []).forEach((sec, si) => {
    const K = KIND_DEFAULT[sec.kind] || KIND_DEFAULT.highway;
    const n = Math.max(2, Math.round((sec.len || 100) / step)), turn = ((sec.turn || 0) * Math.PI) / 180;
    const wig = sec.wig ?? K.wig, waves = Math.max(1, Math.round((sec.len || 100) / 260));
    const w = sec.width || K.width;
    secStart.push(s);
    let prevH = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      // rẽ dần ở giữa đoạn (đầu / cuối đoạn đi thẳng) + uốn lượn nhẹ
      const ease = t < 0.15 ? 0 : t > 0.85 ? 1 : (1 - Math.cos(((t - 0.15) / 0.7) * Math.PI)) / 2;
      const hh = turn * ease + wig * Math.sin(t * Math.PI * 2 * waves);
      h += hh - prevH;
      prevH = hh;
      x += Math.sin(h) * step;
      z += Math.cos(h) * step;
      s += step;
      pts.push({ x, z, h, s, si, w });
    }
  });
  return { pts, step, total: s, secStart };
}

// Chỗ trên đường ở quãng s (nội suy) + lệch ngang lat (dương = bên trái theo chiều chạy)
export function trackAt(T, s, lat = 0) {
  const P = T.pts;
  if (s < P[0].s || s > P[P.length - 1].s) { const a = s < P[0].s ? P[0] : P[P.length - 1], d = s - a.s; return { x: a.x + Math.sin(a.h) * d + Math.cos(a.h) * lat, z: a.z + Math.cos(a.h) * d - Math.sin(a.h) * lat, h: a.h, w: a.w, si: a.si }; } // ngoài 2 đầu: kéo dài thẳng
  const k = Math.max(0, Math.min(P.length - 1.001, s / T.step - 1));
  const i = Math.floor(k), f = k - i, a = P[i], b = P[Math.min(P.length - 1, i + 1)];
  const h = a.h + (b.h - a.h) * f, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
  return { x: x + Math.cos(h) * lat, z: z - Math.sin(h) * lat, h, w: a.w, si: a.si };
}
// Điểm gần nhất trên đường (tìm quanh quãng hint): { s, lat, h, w, si }
export function nearestOnTrack(T, x, z, hint = 0, span = 60) {
  const P = T.pts, i0 = Math.max(0, Math.floor((hint - span) / T.step)), i1 = Math.min(P.length - 1, Math.ceil((hint + span) / T.step));
  let best = i0, bd = Infinity;
  for (let i = i0; i <= i1; i++) { const d = (P[i].x - x) ** 2 + (P[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
  const p = P[best], dx = x - p.x, dz = z - p.z;
  const fwd = dx * Math.sin(p.h) + dz * Math.cos(p.h), lat = dx * Math.cos(p.h) - dz * Math.sin(p.h);
  return { s: p.s + fwd, lat, h: p.h, w: p.w, si: p.si };
}
// Đoạn đang chạy ở quãng s
export const sectionAt = (T, s) => { let k = 0; for (let i = 0; i < T.secStart.length; i++) if (s >= T.secStart[i]) k = i; return k; };

// Tốc độ bọn rượt: giữ khoảng cách mong muốn sau lưng người chơi (bám dai — chạy giỏi thì bỏ xa được, té xe là bị áp sát)
// gap: mình đi trước bao nhiêu m · vP: tốc độ mình · vmax: tốc độ tối đa của xe nó
export function chaseSpeed(gap, vP, vmax, want = RACE.chaseGap) {
  const v = vP + (gap - want) * (gap > want ? 0.35 : 0.55);
  return Math.max(0, Math.min(vmax, v));
}

// Cầu cất: chạy lên nửa cầu đang nghiêng aDeg độ với tốc độ v m/s (ở chân cầu) → bay qua khe giữa có tới được nửa bên kia không
// { ok, why: 'steep' (dốc quá) | 'short' (không đủ nhanh), vt: tốc độ ở mép cầu, gap: khe ngang giữa 2 mép }
export function drawbridgeJump(v, aDeg, L = RACE.leaf, g = RACE.g) {
  if (aDeg > RACE.bridgeSteep) return { ok: false, why: 'steep' };
  const a = (aDeg * Math.PI) / 180, h = L * Math.sin(a), gap = 2 * L * (1 - Math.cos(a)), vt2 = v * v - 2 * g * h;
  if (vt2 <= 1) return { ok: false, why: 'short', vt: 0, gap };
  const vt = Math.sqrt(vt2), vx = vt * Math.cos(a), vy = vt * Math.sin(a), tg = gap / vx;
  return { ok: vy * tg - 0.5 * g * tg * tg > -0.3, why: 'short', vt, gap }; // qua tới mép bên kia mà còn cao hơn mép đó (chút xíu thấp hơn vẫn bám được)
}
// Góc nửa cầu sau t giây kể từ lúc bắt đầu mở
export const drawbridgeAngle = (t) => Math.min(RACE.bridgeMax, Math.max(0, t) * RACE.bridgeRate);

// Sự cố trên đường (story.json → sections[].events): tính quãng tuyệt đối, xếp theo thứ tự
export function raceEvents(def, T) {
  const out = [];
  (def.sections || []).forEach((sec, si) => (sec.events || []).forEach((e, k) => out.push({ ...e, id: `${si}:${k}`, si, s: T.secStart[si] + (e.at || 0), done: false })));
  return out.sort((a, b) => a.s - b.s);
}
// Chướng ngại người chơi tự lái né (không có nút bấm): hiện ra khi còn cách near m
export const OBSTACLE_EVENTS = { container: { near: 85 }, bus: { near: 120 }, stall: { near: 70 }, drums: { near: 110 }, cones: { near: 120 }, brokencar: { near: 130 }, trunk: { near: 110 }, buffalo: { near: 115 }, forklift: { near: 90 }, cart: { near: 110 } };
