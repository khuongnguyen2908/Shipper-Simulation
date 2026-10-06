// Lái tự động cho kiểm thử (chỉ nạp khi có ?debug).
// Đi theo lưới đường: ra ngã tư gần nhất → chạy dọc/ngang → tới đường trước cửa đích.
import { CITY, roadPos } from '../sim/cityLayout.js';

const nearestLine = (v) => Math.max(0, Math.min(CITY.N, Math.round((v - CITY.ORIGIN) / CITY.PITCH)));

export function planRoute(from, to) {
  const i0 = nearestLine(from.x), j0 = nearestLine(from.z);
  // đường mà cửa đích quay ra: đường gần nhất theo trục x hoặc z
  const ix = nearestLine(to.x), jz = nearestLine(to.z);
  const dX = Math.abs(to.x - roadPos(ix)), dZ = Math.abs(to.z - roadPos(jz));
  const pts = [];
  // ra lòng đường gần nhất
  const fx = Math.abs(from.x - roadPos(i0)), fz = Math.abs(from.z - roadPos(j0));
  if (fz < fx) pts.push({ x: from.x, z: roadPos(j0) + 2.5 }, { x: roadPos(i0), z: roadPos(j0) + 2.5 });
  else pts.push({ x: roadPos(i0) + 2.5, z: from.z }, { x: roadPos(i0) + 2.5, z: roadPos(j0) });
  if (dZ < dX) {
    // cửa quay ra đường ngang z = roadPos(jz)
    pts.push({ x: roadPos(i0), z: roadPos(jz) }, { x: to.x, z: roadPos(jz) + Math.sign(to.z - roadPos(jz)) * 4 });
  } else {
    pts.push({ x: roadPos(ix), z: roadPos(j0) }, { x: roadPos(ix) + Math.sign(to.x - roadPos(ix)) * 4, z: to.z });
  }
  pts.push({ x: to.x, z: to.z });
  return pts;
}

// Lái xe tới đích; trả về true nếu tới nơi. maxSec: giới hạn thời gian thật mô phỏng
export function driveTo(game, to, { maxSec = 90, maxSpeed = 10, stopDist = 2.2 } = {}) {
  const pts = planRoute(game.bike.pos, to);
  let k = 0, t = 0;
  const dt = 1 / 30;
  while (k < pts.length && t < maxSec && game.state === 'play') {
    if (game.modal.open) return false;
    const b = game.bike;
    const p = pts[k];
    const dx = p.x - b.pos.x, dz = p.z - b.pos.z;
    const d = Math.hypot(dx, dz);
    const last = k === pts.length - 1;
    if (d < (last ? stopDist : 3.5)) {
      k++;
      continue;
    }
    const want = Math.atan2(dx, dz);
    let diff = want - b.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const slow = last && d < 10;
    const hold = {
      left: diff > 0.06,
      right: diff < -0.06,
      // xe máy chỉ quay đầu được khi đang chạy → góc lệch lớn thì chạy chậm để vòng
      forward: (Math.abs(diff) < 1.0 && b.speed < (slow ? 3 : maxSpeed)) || b.speed < 2.5,
      back: (Math.abs(diff) > 1.4 && b.speed > 3.5) || (slow && b.speed > 4),
    };
    // phanh khi có xe / chó / người ngay phía trước
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    const obstacles = [...game.traffic.agents, ...game.traffic.dogs, ...game.traffic.peds, ...game.traffic.jamCircles];
    for (const a of obstacles) {
      const ox = a.x - b.pos.x, oz = a.z - b.pos.z;
      const along = ox * fx + oz * fz, lat = Math.abs(ox * fz - oz * fx);
      if (along > 0 && along < 3 + b.speed * 0.6 && lat < 1.8) {
        hold.forward = false;
        hold.back = b.speed > 0.5;
      }
    }
    game.step(dt, hold, dt, false);
    t += dt;
  }
  game.step(1, { back: true });
  return k >= pts.length;
}
