// SÂN BAY (thuần dữ liệu, chạy được trong Node): các vùng trên mặt bằng sân bay + luật cho xe máy.
// Số liệu: balance.json → airport (thẻ ⚖️ Cân bằng) · phụ phí khách trả: apps.json → airportFee (thẻ 📱 App & Đơn).
//  - Xe máy không được lên đường trên cao ga đi (barie ở chân dốc, chỉ ô tô)
//  - Đón / trả khách xe ôm ở "Điểm đón xe công nghệ" dưới trệt (pickup)
//  - Chạy xe vào khuôn viên sân bay → trả phí vào cổng (gateFee) mỗi lượt
//  - Muốn vào sảnh thì gửi xe ở bãi xe máy sân bay (park); dừng / bỏ xe chỗ khác trước sảnh → bảo vệ thổi còi rồi phạt
// Toạ độ riêng của lô (như lúc dựng nhà): gốc giữa mặt tiền, x dọc mặt tiền (+ = bên phải nhìn từ đường), z âm đi vào trong lô.
import { lookOf } from '../data/looks.js';

export const AIRPORT_MIN_W = 60; // lô hẹp hơn thì sân bay chỉ có nhà ga (không đường trên cao, không chia vùng)
export const AIRPORT_FRONT = 7; // vùng cấm dừng tính ra phía đường từ mép lô: vỉa hè (3 m) + làn đường sát lề

// Khung toạ độ riêng của địa điểm (gốc giữa mặt tiền lô đã chừa 0,25 m mỗi bên, như world/city.js dựng nhà)
export function lotFrame(p) {
  const r = { x0: p.x0 + 0.25, x1: p.x1 - 0.25, z0: p.z0 + 0.25, z1: p.z1 - 0.25 };
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const f =
    p.face === 'N' ? { x: cx, z: r.z0, rotY: Math.PI, W: r.x1 - r.x0, D: r.z1 - r.z0 }
    : p.face === 'S' ? { x: cx, z: r.z1, rotY: 0, W: r.x1 - r.x0, D: r.z1 - r.z0 }
    : p.face === 'E' ? { x: r.x1, z: cz, rotY: Math.PI / 2, W: r.z1 - r.z0, D: r.x1 - r.x0 }
    : { x: r.x0, z: cz, rotY: -Math.PI / 2, W: r.z1 - r.z0, D: r.x1 - r.x0 };
  const c = Math.cos(f.rotY), s = Math.sin(f.rotY);
  return {
    W: f.W, D: f.D, c, s,
    toWorld: (x, z) => [f.x + x * c + z * s, f.z - x * s + z * c],
    toLocal: (wx, wz) => {
      const dx = wx - f.x, dz = wz - f.z;
      return [dx * c - dz * s, dx * s + dz * c];
    },
  };
}

// Các vùng (toạ độ riêng) của sân bay rộng W — null nếu lô hẹp (sân bay nhỏ không chia vùng)
export function airportZones(W) {
  if (W < AIRPORT_MIN_W) return null;
  const X = W / 2;
  return {
    pickup: { x0: 3, x1: 12, z0: -7, z1: -2.5 }, // điểm đón xe công nghệ: trước nhà ga, dưới sàn ga đi (gầm cao), bên phải lối giữa
    park: { x0: -(X - 1.5), x1: -(X - 12), z0: -7.5, z1: -1.5 }, // bãi xe máy: góc trước bên trái (ngoài đường dốc)
  };
}
const inRect = (r, x, z, pad = 0) => !!r && x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
export const PICKUP_PAD = 3; // quanh điểm đón: xe đứng chờ đón / trả khách (bấm E trong 5,5 m) không tính là dừng sai chỗ
const isAirport = (p) => lookOf(p) === 'airport';

// Sân bay có lô chứa điểm (x, z) (toạ độ thế giới), hoặc null — chạy xe vào đây là qua cổng thu phí
export function airportAt(places, x, z) {
  return places.find((p) => isAirport(p) && x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) || null;
}
// Toạ độ riêng của điểm thế giới trong sân bay p + vùng của sân bay đó
function local(p, x, z) {
  const fr = lotFrame(p);
  const [lx, lz] = fr.toLocal(x, z);
  return { fr, lx, lz, zones: airportZones(fr.W) };
}
// Tâm điểm đón xe công nghệ (thế giới) — đơn xe ôm tới / từ sân bay đón trả ở đây; sân bay nhỏ → null (dùng cửa)
export function airportRideDoor(p) {
  if (!isAirport(p)) return null;
  const fr = lotFrame(p), zn = airportZones(fr.W);
  if (!zn) return null;
  const [x, z] = fr.toWorld((zn.pickup.x0 + zn.pickup.x1) / 2, (zn.pickup.z0 + zn.pickup.z1) / 2);
  return { x, z };
}
// Điểm (x, z) nằm trong bãi xe máy của một sân bay → sân bay đó, không thì null
export function airportParkAt(places, x, z) {
  for (const p of places) {
    if (!isAirport(p)) continue;
    const { lx, lz, zones } = local(p, x, z);
    if (zones && inRect(zones.park, lx, lz)) return p;
  }
  return null;
}
// Vùng cấm dừng trước sảnh: cả khuôn viên + vỉa hè, làn đường phía trước — trừ điểm đón và bãi xe máy.
// Trả về sân bay đó hoặc null.
export function airportNoStopAt(places, x, z) {
  for (const p of places) {
    if (!isAirport(p)) continue;
    const { fr, lx, lz, zones } = local(p, x, z);
    if (!zones) continue;
    if (Math.abs(lx) > fr.W / 2 || lz < -fr.D || lz > AIRPORT_FRONT) continue;
    if (inRect(zones.pickup, lx, lz, PICKUP_PAD) || inRect(zones.park, lx, lz)) continue;
    return p;
  }
  return null;
}

// Đứng yên trong vùng cấm dừng: stop = { since } (phút game). Trả về 'warn' (bảo vệ thổi còi) | 'fine' (phạt) | null.
// Mỗi lần dừng tối đa 1 lần nhắc + 1 lần phạt (stop.warned / stop.fined do người gọi đánh dấu).
export function noStopStep(stop, now, A) {
  if (!stop) return null;
  const t = now - stop.since;
  if (!stop.fined && t >= (A.noStopFineMin ?? 8)) return 'fine';
  if (!stop.warned && t >= (A.noStopWarnMin ?? 3)) return 'warn';
  return null;
}
