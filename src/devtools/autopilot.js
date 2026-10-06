// Lái tự động cho kiểm thử (chỉ nạp khi có ?debug).
// Đi theo mạng đường (vòng qua cầu, tránh sông): ngã tư gần nhất → các ngã tư trên đường ngắn nhất → miệng hẻm → cửa đích.
import { roadPos, routeNodes } from '../sim/cityLayout.js';

export function planRoute(from, to) {
  const pts = routeNodes(from, to).map(([i, j]) => ({ x: roadPos(i), z: roadPos(j) }));
  if (to.mouth) pts.push({ x: to.mouth.x, z: to.mouth.z }); // nhà trong hẻm: vào qua miệng hẻm
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
