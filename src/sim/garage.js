// =============================================================
// HẦM XE của phòng trọ Cô Hai (tầng trệt dãy trọ, xem BUILD.tro trong src/world/placeBuildings.js).
// Thuần dữ liệu (chạy được trong Node): vùng trong hầm theo toạ độ thế giới, chỗ dựng xe / chỗ đứng lúc mới vào game.
//  - Xe để trong hầm mới an toàn (không trộm, không cẩu, không phạt) — src/sim/parking.js → safeSpot
//  - Muốn ngủ phải chạy xe vào hầm, xuống xe (interactions.js → sleepChoices)
// =============================================================
export const LOT_INSET = 0.25; // nhà lùi vào trong lô mỗi phía (giống city.js)
export const GARAGE_WALL = 0.22; // tường 2 bên hầm
export const GARAGE_BACK = 0.3; // tường sau hầm

// Hướng nhìn ra đường theo mặt tiền (forward = (sin h, cos h))
const OUT_HEADING = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };

// Lòng hầm (bên trong tường) theo toạ độ thế giới: { x0, x1, z0, z1, face } — mặt hở là mặt tiền (face)
export function garageRect(p) {
  if (!p || p.x0 == null) return null;
  const r = { x0: p.x0 + LOT_INSET, x1: p.x1 - LOT_INSET, z0: p.z0 + LOT_INSET, z1: p.z1 - LOT_INSET };
  const t = GARAGE_WALL, b = GARAGE_BACK;
  switch (p.face) {
    case 'N': return { x0: r.x0 + t, x1: r.x1 - t, z0: r.z0, z1: r.z1 - b, face: 'N' };
    case 'E': return { x0: r.x0 + b, x1: r.x1, z0: r.z0 + t, z1: r.z1 - t, face: 'E' };
    case 'W': return { x0: r.x0, x1: r.x1 - b, z0: r.z0 + t, z1: r.z1 - t, face: 'W' };
    default: return { x0: r.x0 + t, x1: r.x1 - t, z0: r.z0 + b, z1: r.z1, face: 'S' };
  }
}

// Khoảng cách từ điểm tới mép hở (cửa hầm), đo vào trong hầm
function depthIn(g, x, z) {
  return g.face === 'S' ? g.z1 - z : g.face === 'N' ? z - g.z0 : g.face === 'E' ? g.x1 - x : x - g.x0;
}

// Điểm (x, z) nằm trong hầm, sâu vào trong ít nhất `deep` m tính từ cửa (xe đậu hẳn vào trong, không chìa ra ngoài)
export function inGarage(p, x, z, deep = 0.9) {
  const g = garageRect(p);
  return !!g && x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1 && depthIn(g, x, z) >= deep;
}

// Toạ độ trong hầm theo (d = sâu vào từ cửa hầm, l = lệch ngang khỏi giữa hầm, dương = phía tường "phải")
function frame(g) {
  const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2;
  const ns = g.face === 'S' || g.face === 'N';
  return {
    at: (d, l = 0) => (g.face === 'S' ? { x: cx + l, z: g.z1 - d } : g.face === 'N' ? { x: cx - l, z: g.z0 + d } : g.face === 'E' ? { x: g.x1 - d, z: cz - l } : { x: g.x0 + d, z: cz + l }),
    len: ns ? g.z1 - g.z0 : g.x1 - g.x0, // độ sâu hầm
    half: (ns ? g.x1 - g.x0 : g.z1 - g.z0) / 2, // nửa bề ngang hầm
  };
}

// Số chỗ dựng xe để dành trong hầm (dọc tường phải), ngoài chỗ của xe đang dùng. Hầm đầy thì phải bán bớt mới mua thêm.
export const PARK_SLOTS = 3;

// Chỗ dựng xe đang dùng (sâu trong hầm, lệch sang trái chừa chỗ cho xe để dành, đầu xe quay ra đường)
// + chỗ người đứng (gần cửa hầm, nhìn ra đường) — lúc mới vào game / sau khi ngất
export function garageSpots(p) {
  const g = garageRect(p);
  if (!g) return null;
  const f = frame(g), h = OUT_HEADING[g.face];
  return { bike: { ...f.at(Math.min(f.len - 1.2, 3.6), -0.3), heading: h }, walker: { ...f.at(1.4, -0.3), heading: h } };
}

// Các chỗ dựng xe để dành (xe không dùng tới nằm ở đây), dọc tường phải, đầu xe quay ra đường
export function parkSlots(p) {
  const g = garageRect(p);
  if (!g) return [];
  const f = frame(g), h = OUT_HEADING[g.face], l = f.half - 0.42;
  const out = [];
  for (let i = 0; i < PARK_SLOTS; i++) {
    const d = Math.min(f.len - 1, 2 + i * 2.1);
    out.push({ ...f.at(d, l), heading: h });
  }
  return out;
}
