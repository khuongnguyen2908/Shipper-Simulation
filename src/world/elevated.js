// Mặt đi trên cao (đường dẫn lên sân bay…): xe / người chạy lên dốc, đi trên sàn, không rơi qua mép (lan can).
// Hai loại mặt, toạ độ thế giới (cao độ đã cộng vỉa hè):
//  - dải theo đường cong (ramp): chuỗi điểm cách đều + phần chạy được hai bên tim (lệch lo…hi, âm = bên trái chiều chạy)
//  - tấm phẳng (pad): tứ giác lồi + một cao độ (lề đi bộ trên sàn ga…)
// Mỗi thân (xe, người) có `deckY`: null = đang ở dưới đất, số = đang đứng trên mặt cao độ đó.

const STEP = 0.45; // bậc cao nhất leo lên được (từ đất vào đầu dốc, từ mặt đường lên lề)
const NEAR = 0.6; // trên cao: chỉ tính mặt chênh với chỗ đang đứng không quá chừng này (tránh "nhảy" lên tầng khác)

export class Elevated {
  constructor() {
    this.ramps = [];
    this.pads = [];
  }

  get empty() {
    return !this.ramps.length && !this.pads.length;
  }

  // pts: [{x, y, z}] theo thứ tự chạy. Gọi addRamp(pts, nửaBềRộng) cho dải đều hai bên tim,
  // hoặc addRamp(pts, lo, hi): mép trái / phải lệch khỏi tim (số, hoặc mảng theo từng điểm để bề rộng đổi dần)
  addRamp(pts, lo, hi) {
    if (hi === undefined) {
      hi = lo;
      lo = -lo;
    }
    const reach = Math.max(...[lo, hi].flat().map(Math.abs));
    this.ramps.push({ pts, lo, hi, box: bbox(pts, reach) });
  }

  // corners: 4 góc [x, z] theo vòng; y: cao độ mặt
  addPad(corners, y) {
    // xếp góc ngược chiều kim đồng hồ (nhìn từ trên xuống, trục x phải, z xuống) để kiểm tra trong / ngoài
    let area = 0;
    for (let i = 0; i < corners.length; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % corners.length];
      area += ax * bz - bx * az;
    }
    const c = area < 0 ? [...corners].reverse() : corners;
    this.pads.push({ c, y, box: bbox(c.map(([x, z]) => ({ x, z })), 0) });
  }

  // Các mặt chứa điểm (x, z): [{ h }] — margin > 0 thu hẹp mép (bán kính thân), < 0 nới rộng
  hits(x, z, margin = 0) {
    const out = [];
    for (const r of this.ramps) {
      if (!inBox(r.box, x, z)) continue;
      const p = projectRamp(r, x, z);
      if (p && p.lat >= p.lo + margin && p.lat <= p.hi - margin) out.push({ h: p.y });
    }
    for (const p of this.pads) {
      if (!inBox(p.box, x, z)) continue;
      if (insidePoly(p.c, x, z, margin)) out.push({ h: p.y });
    }
    return out;
  }

  // Mặt cao nhất tại (x, z) — xe bot chạy trên cầu lấy độ cao này; không có mặt → 0 (mặt đường)
  topAt(x, z) {
    let best = 0;
    for (const s of this.hits(x, z, 0)) if (s.h > best) best = s.h;
    return best;
  }

  // Cao độ mặt gần mức `near` nhất tại (x, z); không có → null
  heightAt(x, z, near, margin = 0) {
    let best = null;
    for (const s of this.hits(x, z, margin)) if (Math.abs(s.h - near) <= NEAR && (best == null || Math.abs(s.h - near) < Math.abs(best - near))) best = s.h;
    return best;
  }

  // Cập nhật thân sau khi đã di chuyển ngang: lên / xuống dốc, giữ trong lan can, chặn chui gầm thấp.
  // body: { pos: {x, z}, deckY }, r: bán kính thân, floorY: cao độ đất tại chỗ (0 lòng đường / vỉa hè),
  // clearance: cao tối thiểu để chui qua gầm. Trả về { y, normals } (pháp tuyến chạm mép, như va tường).
  settle(body, r, floorY, clearance) {
    const p = body.pos;
    const px = body._ex ?? p.x, pz = body._ez ?? p.z;
    const normals = [];
    if (Math.hypot(p.x - px, p.z - pz) > 4) body.deckY = null; // dịch chuyển tức thì (về nhà, xe bị cẩu…)
    let y = floorY;
    if (!this.empty) {
      if (body.deckY != null) {
        const h = this.heightAt(p.x, p.z, body.deckY, r);
        if (h != null) y = body.deckY = h;
        else if (body.deckY - floorY < STEP && this.heightAt(p.x, p.z, body.deckY, -r - 0.5) == null) body.deckY = null; // ra khỏi đầu dốc → xuống đất
        else {
          // chạm mép (lan can): giữ lại, trượt dọc mép nếu được
          slide(p, px, pz, (x, z) => this.heightAt(x, z, body.deckY, r) != null, normals);
          y = body.deckY;
        }
      } else {
        // dưới đất: đoạn dốc còn thấp (chưa đủ cao để chui qua) → chắn như tường
        const blocked = (x, z) => this.hits(x, z, -r).some((s) => s.h - floorY >= STEP && s.h - floorY < clearance);
        if (blocked(p.x, p.z)) slide(p, px, pz, (x, z) => !blocked(x, z), normals);
        // bước vào đầu dốc (mặt gần sát đất)
        for (const s of this.hits(p.x, p.z, 0)) if (s.h - floorY < STEP && s.h > floorY - STEP) y = body.deckY = Math.max(body.deckY ?? -Infinity, s.h);
      }
    }
    body._ex = p.x;
    body._ez = p.z;
    return { y, normals };
  }
}

// Trượt về chỗ hợp lệ: thử giữ trục x, rồi trục z, không được thì đứng lại chỗ cũ
function slide(p, px, pz, ok, normals) {
  const nx0 = p.x, nz0 = p.z;
  if (ok(p.x, pz)) p.z = pz;
  else if (ok(px, p.z)) p.x = px;
  else {
    p.x = px;
    p.z = pz;
  }
  const dx = p.x - nx0, dz = p.z - nz0, d = Math.hypot(dx, dz);
  if (d > 1e-6) normals.push({ x: dx / d, z: dz / d });
}

function bbox(pts, pad) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  const m = pad + 1;
  return { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
}
const inBox = (b, x, z) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;

// Chiếu điểm lên tim dải: độ lệch ngang có dấu (âm = bên trái chiều chạy, như cạnh "up × hướng chạy" lúc dựng cầu),
// cao độ và mép lo / hi tại đó; ra ngoài 2 đầu dải → null
function projectRamp(r, x, z) {
  const P = r.pts, n = P.length;
  const at = (v, i) => (Array.isArray(v) ? v[i] : v);
  let best = null;
  for (let i = 0; i < n - 1; i++) {
    const a = P[i], b = P[i + 1];
    const ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez || 1e-9;
    const raw = ((x - a.x) * ex + (z - a.z) * ez) / L2;
    const t = Math.max(0, Math.min(1, raw));
    const qx = a.x + ex * t, qz = a.z + ez * t;
    const d = Math.hypot(x - qx, z - qz);
    if (best && d >= best.d) continue;
    const L = Math.sqrt(L2);
    const lat = ((x - qx) * ez - (z - qz) * ex) / L; // chiếu lên cạnh (ez, -ex) = up × hướng chạy
    const lerp = (v) => at(v, i) + (at(v, i + 1) - at(v, i)) * t;
    best = { d, lat, lo: lerp(r.lo), hi: lerp(r.hi), y: a.y + (b.y - a.y) * t, out: (i === 0 && raw < 0) || (i === n - 2 && raw > 1) };
  }
  return best && !best.out ? best : null; // quá đầu / cuối dải → không thuộc dải
}

// Điểm trong tứ giác lồi (góc ngược chiều kim đồng hồ), cách mỗi cạnh ít nhất `margin`
function insidePoly(c, x, z, margin) {
  for (let i = 0; i < c.length; i++) {
    const [ax, az] = c[i], [bx, bz] = c[(i + 1) % c.length];
    const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez) || 1e-9;
    if (((x - ax) * ez - (z - az) * ex) / L > -margin) return false;
  }
  return true;
}
