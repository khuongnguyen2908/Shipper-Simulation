// Hình học thành phố dạng dữ liệu thuần (không phụ thuộc Three.js) —
// dùng chung cho phần dựng hình 3D và phần mô phỏng/bộ thử.
import { STREETS_X, STREETS_Z, PLACES, ALLEY } from '../data/places.js';
import { fmt } from '../content/index.js';

export const CITY = { N: 5, PITCH: 52, ROAD: 12, SW: 3, ORIGIN: -130, BLOCK: 40 };
export const LOT_W = (CITY.BLOCK - 2 * CITY.SW) / 3;
export const HALF = -CITY.ORIGIN + CITY.ROAD / 2; // biên bản đồ: |x|,|z| ≤ 136
export const LOT_IDS = ['N0', 'N1', 'N2', 'S0', 'S1', 'S2', 'E1', 'W1'];

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

export function lotInfo(bx, bz, lot) {
  const b = blockBounds(bx, bz);
  const ax = b.x0 + CITY.SW, az = b.z0 + CITY.SW, W = LOT_W;
  const side = lot[0];
  const k = lot.length > 1 ? Number(lot[1]) : -1;
  let r, face = side;
  if (side === 'N') r = k < 0 ? { x0: ax, x1: ax + 3 * W, z0: az, z1: az + W } : { x0: ax + k * W, x1: ax + (k + 1) * W, z0: az, z1: az + W };
  else if (side === 'S') r = k < 0 ? { x0: ax, x1: ax + 3 * W, z0: az + 2 * W, z1: az + 3 * W } : { x0: ax + k * W, x1: ax + (k + 1) * W, z0: az + 2 * W, z1: az + 3 * W };
  else if (side === 'E') r = { x0: ax + 2 * W, x1: ax + 3 * W, z0: az + W, z1: az + 2 * W };
  else if (side === 'W') r = { x0: ax, x1: ax + W, z0: az + W, z1: az + 2 * W };
  else { r = { x0: ax + W, x1: ax + 1.5 * W, z0: az + W + 1, z1: az + 2 * W - 1 }; face = 'E'; } // 'C' sân giữa
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
  const places = PLACES.map((p) => ({ ...p, ...lotInfo(p.block[0], p.block[1], p.lot) }));
  const taken = new Set();
  for (const p of places) {
    const [bx, bz] = p.block;
    if (p.lot.length === 1 && p.lot !== 'C') for (let k = 0; k < 3; k++) taken.add(key(bx, bz, p.lot + k));
    else taken.add(key(bx, bz, p.lot));
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
