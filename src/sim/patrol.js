// CSGT TUẦN TRA (mô phỏng thuần, không Three.js): mỗi ngày vài tổ chạy vòng quanh phố trong giờ làm việc.
// Tuyến + giờ tính từ (ngày, seed thế giới) → máy nào cũng thấy xe tuần tra ở cùng chỗ, cùng lúc (chơi nhiều người).
// Vị trí lấy thẳng từ đồng hồ chung: quãng đã đi = tốc độ × số phút từ đầu ca (1 phút game = 1 giây thật).
import { CITY, roadPos, neighbors } from './cityLayout.js';
import { NPC_FLAVOR } from '../data/balance.js';
import { atHour, dayStartAt } from './clock.js';
import { makeRng } from './rng.js';

const DAY = 1440;

// Các tổ tuần tra của ngày `day`: { id, start, end (phút game), speed (m mỗi phút game), route: [[i, j]…] }
export function patrolTeams(day, seed = 1, cfg = NPC_FLAVOR) {
  const n = cfg.patrolTeams ?? 2;
  if (n <= 0) return [];
  const from = cfg.patrolFrom ?? 7, to = cfg.patrolTo ?? 21, v = cfg.patrolSpeed ?? 8;
  const start = atHour(day, from), len = Math.max(30, ((to - from + 24) % 24 || 24) * 60);
  const out = [];
  for (let k = 0; k < n; k++) {
    const rng = makeRng(seed * 6151 + day * 3571 + k * 977 + 11);
    // xuất phát ở ngã tư có đường; đi ngẫu nhiên, không quay đầu (trừ đường cụt), đủ dài cho cả ca
    let node = [rng.int(0, CITY.N), rng.int(0, CITY.N)];
    for (let t = 0; t < 50 && !neighbors(...node).length; t++) node = [rng.int(0, CITY.N), rng.int(0, CITY.N)];
    const route = [node];
    let prev = null;
    const need = Math.ceil((v * len) / CITY.PITCH) + 2;
    for (let s = 0; s < need; s++) {
      const opts = neighbors(...node);
      if (!opts.length) break;
      let c = opts.filter((q) => !prev || q[0] !== prev[0] || q[1] !== prev[1]);
      if (!c.length) c = opts;
      // hay đi thẳng (tuần tra theo trục đường), thỉnh thoảng rẽ
      const straight = prev && [node[0] + (node[0] - prev[0]), node[1] + (node[1] - prev[1])];
      const nx = straight && c.some((q) => q[0] === straight[0] && q[1] === straight[1]) && rng.chance(0.6) ? straight : rng.pick(c);
      prev = node;
      node = nx;
      route.push(node);
    }
    out.push({ id: `${day}:${k}`, day, start: start + k * 7, end: start + len, speed: v, route });
  }
  return out;
}

// Vị trí tâm đường của tổ tuần tra lúc `now` (null nếu ngoài ca): { x, z, dx, dz (hướng chạy), seg: [từ ngã tư, tới ngã tư], t (m trong đoạn) }
export function patrolPose(team, now) {
  if (now < team.start || now >= team.end) return null;
  const d = (now - team.start) * team.speed;
  const i = Math.min(team.route.length - 2, Math.floor(d / CITY.PITCH));
  if (i < 0) return null;
  const a = team.route[i], b = team.route[i + 1], t = Math.min(CITY.PITCH, d - i * CITY.PITCH);
  const dx = b[0] - a[0], dz = b[1] - a[1];
  return { x: roadPos(a[0]) + dx * t, z: roadPos(a[1]) + dz * t, dx, dz, seg: [a, b], t };
}

// Các tổ đang làm việc lúc `now` (xét cả ca của ngày hôm trước nếu ca kéo qua nửa đêm)
export function activePatrols(now, seed = 1, cfg = NPC_FLAVOR) {
  const d = Math.floor((now - dayStartAt(1)) / DAY) + 1;
  const out = [];
  for (const day of [d - 1, d]) {
    if (day < 1) continue;
    for (const team of patrolTeams(day, seed, cfg)) {
      const pose = patrolPose(team, now);
      if (pose) out.push({ team, pose });
    }
  }
  return out;
}
