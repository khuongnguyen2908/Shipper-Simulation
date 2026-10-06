// Hình học thành phố dạng dữ liệu thuần (không phụ thuộc Three.js) —
// dùng chung cho phần dựng hình 3D và phần mô phỏng/bộ thử.
import { STREETS_X, STREETS_Z, PLACES, ALLEY } from '../data/places.js';
import { fmt } from '../content/index.js';

export const CITY = { N: 5, PITCH: 52, ROAD: 12, SW: 3, ORIGIN: -130, BLOCK: 40 };
export const LOT_W = (CITY.BLOCK - 2 * CITY.SW) / 3;
export const HALF = -CITY.ORIGIN + CITY.ROAD / 2; // biên bản đồ: |x|,|z| ≤ 136
export const LOT_IDS = ['N0', 'N1', 'N2', 'S0', 'S1', 'S2', 'E1', 'W1'];

// Mỗi khối chia 3×3 ô:   N0 | N1 | N2   ← dãy bắc
//                         W1 | C  | E1   ← giữa (C = sân trong hẻm)
//                         S0 | S1 | S2   ← dãy nam
// Lô nhiều ô (tòa nhà lớn) = danh sách các lô đơn bên trong. Mặt tiền = chữ cái đầu (N/S/W/E).
export const MULTI_LOTS = {
  N01: ['N0', 'N1'], N12: ['N1', 'N2'], S01: ['S0', 'S1'], S12: ['S1', 'S2'], // 2 lô ngang
  W01: ['N0', 'W1'], W12: ['W1', 'S0'], E01: ['N2', 'E1'], E12: ['E1', 'S2'], // 2 lô dọc (mặt tiền tây/đông)
  N: ['N0', 'N1', 'N2'], S: ['S0', 'S1', 'S2'], // cả dãy
  W: ['N0', 'W1', 'S0'], E: ['N2', 'E1', 'S2'], // cả cột
};
// Kích thước → các lô cùng cỡ
export const LOT_SIZES = { one: LOT_IDS, two: ['N01', 'N12', 'S01', 'S12'], vtwo: ['W01', 'W12', 'E01', 'E12'], row: ['N', 'S'], col: ['W', 'E'] };
export const lotParts = (lot) => MULTI_LOTS[lot] || [lot];
export const lotSize = (lot) => Object.keys(LOT_SIZES).find((k) => LOT_SIZES[k].includes(lot)) || null;
const CELL = { N0: [0, 0], N1: [1, 0], N2: [2, 0], W1: [0, 1], E1: [2, 1], S0: [0, 2], S1: [1, 2], S2: [2, 2] };

// Các hướng mặt tiền chọn được: những cạnh của lô chạm ra đường. Hướng mặc định (theo lô) đứng đầu.
export function lotFaces(lot) {
  const cells = lotParts(lot).map((id) => CELL[id]);
  if (lot === 'C' || !cells.length || !cells.every(Boolean)) return ['E'];
  const out = [lot[0]];
  const touch = { N: cells.some((c) => c[1] === 0), E: cells.some((c) => c[0] === 2), S: cells.some((c) => c[1] === 2), W: cells.some((c) => c[0] === 0) };
  for (const f of ['N', 'E', 'S', 'W']) if (touch[f] && !out.includes(f)) out.push(f);
  return out;
}

export const roadPos = (i) => CITY.ORIGIN + i * CITY.PITCH;

export function blockBounds(bx, bz) {
  const x0 = roadPos(bx) + CITY.ROAD / 2;
  const z0 = roadPos(bz) + CITY.ROAD / 2;
  return { x0, z0, x1: x0 + CITY.BLOCK, z1: z0 + CITY.BLOCK };
}

// Trả về khối (bx,bz) nếu điểm nằm trên vỉa hè/khối nhà, ngược lại null (đang ở lòng đường)
export function blockAt(x, z) {
  const off = CITY.ORIGIN + CITY.ROAD / 2;
  const bx = Math.floor((x - off) / CITY.PITCH);
  const bz = Math.floor((z - off) / CITY.PITCH);
  if (bx < 0 || bz < 0 || bx >= CITY.N || bz >= CITY.N) return null;
  const lx = x - off - bx * CITY.PITCH;
  const lz = z - off - bz * CITY.PITCH;
  if (lx < 0 || lz < 0 || lx > CITY.BLOCK || lz > CITY.BLOCK) return null;
  return [bx, bz];
}

// face: hướng mặt tiền người dùng chọn (không hợp lệ hoặc bỏ trống → theo lô)
export function lotInfo(bx, bz, lot, wantFace = null) {
  const b = blockBounds(bx, bz);
  const ax = b.x0 + CITY.SW, az = b.z0 + CITY.SW, W = LOT_W;
  let r, face = lot[0];
  const cells = lotParts(lot).map((id) => CELL[id]);
  if (lot !== 'C' && cells.length && cells.every(Boolean)) {
    // khung bao các ô của lô (1 ô, 2 ô ngang, cả dãy, cả cột)
    const cs = cells.map((c) => c[0]), rs = cells.map((c) => c[1]);
    r = { x0: ax + Math.min(...cs) * W, x1: ax + (Math.max(...cs) + 1) * W, z0: az + Math.min(...rs) * W, z1: az + (Math.max(...rs) + 1) * W };
    if (wantFace && lotFaces(lot).includes(wantFace)) face = wantFace;
  } else { r = { x0: ax + W, x1: ax + 1.5 * W, z0: az + W + 1, z1: az + 2 * W - 1 }; face = 'E'; } // 'C' sân giữa
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  let door;
  if (lot === 'C') door = { x: r.x1 + 1.6, z: cz };
  else if (face === 'N') door = { x: cx, z: b.z0 + 1.4 };
  else if (face === 'S') door = { x: cx, z: b.z1 - 1.4 };
  else if (face === 'E') door = { x: b.x1 - 1.4, z: cz };
  else door = { x: b.x0 + 1.4, z: cz };
  let street;
  if (lot === 'C') street = fmt('addr.alleyStreet', { street: STREETS_X[bx + 1] });
  else if (face === 'N') street = STREETS_Z[bz];
  else if (face === 'S') street = STREETS_Z[bz + 1];
  else if (face === 'W') street = STREETS_X[bx];
  else street = STREETS_X[bx + 1];
  const along = face === 'N' || face === 'S' ? cx : cz;
  const number = Math.round((along - CITY.ORIGIN) / 5) * 2 + (face === 'N' || face === 'W' ? 1 : 2);
  const address = lot === 'C' ? fmt('addr.gate', { street }) : fmt('addr.house', { number, street });
  return { ...r, cx, cz, face, door, street, number, address };
}

const key = (bx, bz, lot) => `${bx},${bz},${lot}`;

// Dựng danh sách địa điểm đặc biệt + các lô nhà dân (khách hàng)
export function buildLayout() {
  const places = PLACES.map((p) => ({ ...p, ...lotInfo(p.block[0], p.block[1], p.lot, p.face) }));
  const taken = new Set();
  for (const p of places) {
    const [bx, bz] = p.block;
    for (const id of lotParts(p.lot)) taken.add(key(bx, bz, id));
  }
  taken.add(key(ALLEY.block[0], ALLEY.block[1], ALLEY.lot));
  const lots = [];
  for (let bz = 0; bz < CITY.N; bz++) {
    for (let bx = 0; bx < CITY.N; bx++) {
      for (const id of LOT_IDS) {
        const k = key(bx, bz, id);
        if (taken.has(k)) continue;
        lots.push({ key: k, block: [bx, bz], lot: id, ...lotInfo(bx, bz, id) });
      }
    }
  }
  const placeById = Object.fromEntries(places.map((p) => [p.id, p]));
  return { places, placeById, lots };
}

// Quãng đường theo lưới phố (đi dọc đường, không xuyên nhà)
export function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

export function nodePos(i, j) {
  return { x: roadPos(i), z: roadPos(j) };
}

export function nearestNode(x, z) {
  const i = Math.max(0, Math.min(CITY.N, Math.round((x - CITY.ORIGIN) / CITY.PITCH)));
  const j = Math.max(0, Math.min(CITY.N, Math.round((z - CITY.ORIGIN) / CITY.PITCH)));
  return [i, j];
}

// Tên ngã tư để hiện trong tin nhắn nhóm
export function intersectionName(i, j) {
  return `${STREETS_X[i]} – ${STREETS_Z[j]}`;
}

// Đoạn đường (giữa 2 ngã tư liền nhau) → hình chữ nhật trên mặt đất
export function segmentRect(seg) {
  const h = CITY.ROAD / 2;
  if (seg.axis === 'x') {
    const x = roadPos(seg.line);
    return { x0: x - h, x1: x + h, z0: roadPos(seg.from) + h, z1: roadPos(seg.from + 1) - h };
  }
  const z = roadPos(seg.line);
  return { x0: roadPos(seg.from) + h, x1: roadPos(seg.from + 1) - h, z0: z - h, z1: z + h };
}

export function segmentName(seg) {
  return seg.axis === 'x' ? STREETS_X[seg.line] : STREETS_Z[seg.line];
}
