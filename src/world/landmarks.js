// Công trình lớn (đợt B): nhà thờ, bưu điện, kho hàng cảng, vựa ve chai, bệnh viện — theo phác thảo đã duyệt (sketches/landmarks.png).
// Mỗi hàm dựng theo cỡ lô chuẩn (W0 × D0) rồi co đều cho vừa lô nhỏ hơn (scaledKit) — đặt vào lô nào cũng nằm gọn trong lô.
// Toạ độ riêng của lô: x ∈ [−W/2, W/2], z ∈ [−D, 0], mặt tiền z = 0 nhìn ra đường.
// h: đồ dùng chung từ placeBuildings.js { THREE, T, texKey, textTex, tree, sideGeo, makeCar, fmt }
const PI = Math.PI;

// Kit co đều theo tỉ lệ s (dựng theo cỡ chuẩn rồi thu nhỏ)
function scaledKit(k, s) {
  if (s === 1) return k;
  return {
    add: (geo, color, kind = '', x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, ao) => k.add(geo.scale(s, s, s), color, kind, x * s, y * s, z * s, rx, ry, rz, ao),
    box: (w, h, d, x, y, z, color, kind = '', r = [0, 0, 0]) => k.box(w * s, h * s, d * s, x * s, y * s, z * s, color, kind, r),
    cyl: (rt, rb, h, x, y, z, color, kind = '', seg = 10, r = [0, 0, 0]) => k.cyl(rt * s, rb * s, h * s, x * s, y * s, z * s, color, kind, seg, r),
    ball: (rad, x, y, z, color, kind = '', sc = [1, 1, 1]) => k.ball(rad * s, x * s, y * s, z * s, color, kind, sc),
    rod: (a, b, rad, color, kind = '') => k.rod(a.map((v) => v * s), b.map((v) => v * s), rad * s, color, kind),
    plane: (w, h, x, y, z, color, kind = '', r = [0, 0, 0], rep = 0) => k.plane(w * s, h * s, x * s, y * s, z * s, color, kind, r, rep * s),
  };
}
const fitScale = (o, W0, D0) => Math.min(1, o.W / W0, o.D / D0);
const scaleBox = (c, s) => ({ x0: c.x0 * s, z0: c.z0 * s, x1: c.x1 * s, z1: c.z1 * s, h: c.h * s });
const scaleSign = (g, s) => ({ ...g, y: g.y * s, z: (g.z ?? 0) * s, x: (g.x ?? 0) * s, w: g.w * s });

// ---------- texture riêng ----------
function textures(h) {
  const { texKey } = h;
  return {
    brick: () => texKey('lm-brick', 128, 128, (g, w) => {
      g.fillStyle = '#d9c7b2';
      g.fillRect(0, 0, w, w);
      for (let r = 0; r < 8; r++) for (let c = -1; c < 4; c++) {
        g.fillStyle = ['#b5523b', '#a84a35', '#c25c42', '#9e4430'][(r * 3 + c + 8) % 4];
        g.fillRect(c * 32 + (r % 2 ? 16 : 0) + 1, r * 16 + 1, 30, 14);
      }
    }, true),
    // cửa vòm: kính / gỗ trong khung màu tường
    arch: (glass, frame) => texKey(`lm-arch|${glass}|${frame}`, 64, 128, (g, w, hh) => {
      g.fillStyle = frame;
      g.fillRect(0, 0, w, hh);
      g.fillStyle = glass;
      g.beginPath();
      g.moveTo(10, hh - 6);
      g.lineTo(10, 34);
      g.arc(w / 2, 34, w / 2 - 10, PI, 0);
      g.lineTo(w - 10, hh - 6);
      g.closePath();
      g.fill();
      g.strokeStyle = frame;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(w / 2, 14);
      g.lineTo(w / 2, hh - 6);
      g.moveTo(10, 60);
      g.lineTo(w - 10, 60);
      g.stroke();
    }),
    rose: () => texKey('lm-rose', 128, 128, (g) => {
      g.fillStyle = '#b5523b';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#e8e0d0';
      g.beginPath();
      g.arc(64, 64, 60, 0, PI * 2);
      g.fill();
      const cols = ['#2e5c9a', '#c0392b', '#f1c40f', '#27ae60'];
      for (let i = 0; i < 12; i++) {
        g.fillStyle = cols[i % 4];
        g.beginPath();
        g.moveTo(64, 64);
        g.arc(64, 64, 52, (i * PI) / 6, ((i + 0.8) * PI) / 6);
        g.fill();
      }
      g.fillStyle = '#f1c40f';
      g.beginPath();
      g.arc(64, 64, 12, 0, PI * 2);
      g.fill();
    }),
    clock: () => texKey('lm-clock', 128, 128, (g) => {
      g.fillStyle = '#f2d28b';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#fbf8ef';
      g.beginPath();
      g.arc(64, 64, 58, 0, PI * 2);
      g.fill();
      g.strokeStyle = '#2c3e50';
      g.lineWidth = 5;
      g.stroke();
      for (let i = 0; i < 12; i++) g.fillRect(64 + Math.cos((i * PI) / 6) * 48 - 2, 64 + Math.sin((i * PI) / 6) * 48 - 2, 4, 4);
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(64, 64);
      g.lineTo(64, 22);
      g.moveTo(64, 64);
      g.lineTo(92, 74);
      g.stroke();
    }),
    heli: () => texKey('lm-heli', 128, 128, (g) => {
      g.fillStyle = '#3d4247';
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#f1c40f';
      g.lineWidth = 7;
      g.beginPath();
      g.arc(64, 64, 54, 0, PI * 2);
      g.stroke();
      g.fillStyle = '#ffffff';
      g.font = 'bold 76px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('H', 64, 68);
    }),
  };
}

// 5 kiểu nhà chọn được trong ?editor (bản dãy là biến thể tự dùng khi lô nông)
export const LANDMARK_LOOKS = ['cathedral', 'postOffice', 'portWarehouse', 'scrapYard', 'hospital', 'ferry'];
export const LANDMARKS = {
  // ⛴️ Bến phà (chuẩn 2 lô 22,2 × 10,8, mặt tiền nhìn ra sông): phòng vé, nhà chờ mái tôn có ghế, barie, biển tên trên 2 cột.
  // Cầu dẫn + phao nổi chìa ra sông và chiếc phà dựng riêng ở src/world/ferry.js
  ferry(k0, o, r, h) {
    const s = fitScale(o, 22.2, 10.8), k = scaledKit(k0, s), cols = [];
    const corr = 'tex:' + h.T.corr();
    k.box(22.2, 0.05, 10.8, 0, 0.025, -5.4, 0xb5ab98);
    // phòng vé
    k.box(5, 3, 4, -7, 1.5, -6, 0x5dade2);
    k.box(5.6, 0.3, 4.6, -7, 3.15, -6, 0x1f618d);
    k.box(2, 1.2, 0.05, -7, 1.7, -3.98, 0xa9cce3, 'glass');
    k.plane(1.8, 0.5, -7, 2.55, -3.95, 0xffffff, 'tex:' + h.textTex(h.fmt('city.ferryTicket'), { bg: '#1f618d', w: 256, h: 64 }));
    cols.push({ x0: -9.5, z0: -8, x1: -4.5, z1: -4, h: 3.3 });
    // nhà chờ mái tôn + 3 băng ghế
    k.box(9, 0.12, 5, 3, 2.9, -5.5, 0x2e86c1, corr, [0.06, 0, 0]);
    for (const x of [-1.2, 7.2]) for (const z of [-3.2, -7.8]) {
      k.box(0.15, 2.9, 0.15, x, 1.45, z, 0x555555, 'metal');
      cols.push({ x0: x - 0.15, z0: z - 0.15, x1: x + 0.15, z1: z + 0.15, h: 2.9 });
    }
    for (let i = 0; i < 3; i++) {
      k.box(2.2, 0.08, 0.5, 0.4 + i * 2.6, 0.45, -6.5, 0x7f8c8d, 'metal');
      for (const sx of [-0.9, 0.9]) k.box(0.06, 0.45, 0.45, 0.4 + i * 2.6 + sx, 0.22, -6.5, 0x555555, 'metal');
    }
    // barie chắn xe (mở khi phà cập bến) + biển tên trên 2 cột trước bến
    k.box(0.4, 1, 0.4, -1.2, 0.5, -0.9, 0xecf0f1);
    k.box(4, 0.12, 0.12, 0.8, 1.05, -0.9, 0xd62d20);
    for (const x of [-3.8, 3.8]) k.box(0.12, 4.3, 0.12, x, 2.15, -0.2, 0x555555, 'metal');
    for (const x of [-10, 10]) h.tree(k, x, -1.2, 3, r, 0.9);
    return { sign: scaleSign({ y: 4.4, z: -0.14, w: 7.4, glow: 0.3 }, s), height: 5 * s, colliders: cols.map((c) => scaleBox(c, s)) };
  },
  // ⛪ Nhà thờ bản dãy 3 lô (chuẩn 33,5 × 10,8): sân trước hẹp có rào, mặt tiền 2 tháp chuông + cửa sổ hoa hồng, gian giữa ngắn phía sau
  cathedralRow(k0, o, r, h) {
    const s = fitScale(o, 33.5, 10.8), k = scaledKit(k0, s), T = textures(h), cols = [];
    const BR = 0xb5523b, ROOF = 0x56677a, STONE = 0xe8e0d0, brick = 'tex:' + T.brick();
    k.box(33.5, 0.05, 10.8, 0, 0.025, -5.4, 0xd8d2c4);
    for (const sx of [-1, 1]) {
      const x0 = sx * 3.2, x1 = sx * 16.2;
      k.box(Math.abs(x1 - x0), 0.4, 0.3, (x0 + x1) / 2, 0.2, -0.4, STONE);
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 0.5) k.box(0.05, 1.2, 0.05, x, 1.0, -0.4, 0x2c2c2c, 'metal');
      cols.push({ x0: Math.min(x0, x1), z0: -0.6, x1: Math.max(x0, x1), z1: -0.2, h: 1.6 });
      k.box(0.6, 3.2, 0.6, x0, 1.6, -0.4, STONE);
      h.tree(k, sx * 13.5, -2.4, 3, r, 1);
    }
    k.box(7, 0.35, 0.4, 0, 3.4, -0.4, STONE);
    // gian giữa ngắn + mái
    k.box(13, 11, 4.6, 0, 5.5, -8.1, BR);
    k.add(h.sideGeo([[-7, 0], [7, 0], [0, 4.6]], 4.6), ROOF, '', 0, 11, -8.1, 0, PI / 2, 0);
    for (const sx of [-1, 1]) k.box(4, 8, 4.4, sx * 12.5, 4, -8.2, BR); // 2 cánh thấp
    // mặt tiền + trán tường + 2 tháp chuông mái nhọn
    const fz = -4.3;
    k.box(12, 14, 2.4, 0, 7, fz, BR);
    k.plane(12, 14, 0, 7, fz + 1.22, 0xffffff, brick, [0, 0, 0], 2);
    k.add(h.sideGeo([[-6.2, 0], [6.2, 0], [0, 3.6]], 2.4), BR, '', 0, 14, fz, 0, PI / 2, 0);
    k.box(0.15, 2, 0.15, 0, 18.6, fz, 0x333333, 'metal');
    k.box(1.1, 0.15, 0.15, 0, 18.9, fz, 0x333333, 'metal');
    for (const sx of [-1, 1]) {
      const tx = sx * 8;
      k.box(4.4, 24, 4.4, tx, 12, fz - 1, BR);
      k.plane(4.4, 24, tx, 12, fz + 1.22, 0xffffff, brick, [0, 0, 0], 2);
      k.box(4.8, 0.5, 4.8, tx, 18, fz - 1, STONE);
      for (const fy of [8, 15, 21]) k.plane(1.4, 3, tx, fy, fz + 1.25, 0xffffff, 'tex:' + T.arch('#2b2f36', '#b5523b'));
      k.cyl(0, 3.2, 9, tx, 28.5, fz - 1, ROOF, '', 4, [0, PI / 4, 0]);
      k.box(0.12, 1.6, 0.12, tx, 33.8, fz - 1, 0x333333, 'metal');
      k.box(0.9, 0.12, 0.12, tx, 34.1, fz - 1, 0x333333, 'metal');
    }
    k.plane(4.6, 4.6, 0, 9.8, fz + 1.25, 0xffffff, 'tex:' + T.rose());
    for (const x of [-3.6, 0, 3.6]) k.plane(x ? 2 : 2.6, x ? 4 : 5, x, x ? 2 : 2.5, fz + 1.25, 0xffffff, 'tex:' + T.arch('#4a2f22', '#b5523b'));
    cols.push({ x0: -14.5, z0: -10.4, x1: 14.5, z1: fz + 1.2, h: 24 });
    return { sign: scaleSign({ y: 2.75, z: -0.15, w: 6.2, glow: 0.3 }, s), height: 35 * s, colliders: cols.map((c) => scaleBox(c, s)) };
  },
  // 🏭 Kho hàng cảng bản dãy 3 lô (chuẩn 33,5 × 10,8): nhà kho tôn mái răng cưa bên trái, container xếp chồng bên phải, chòi bảo vệ + barie, xe nâng
  portWarehouseRow(k0, o, r, h) {
    const s = fitScale(o, 33.5, 10.8), k = scaledKit(k0, s), cols = [];
    const corr = 'tex:' + h.T.corr();
    k.box(33.5, 0.05, 10.8, 0, 0.025, -5.4, 0x6f7177);
    const wx0 = -16.3, wx1 = -1, wz0 = -3, wz1 = -10.5;
    k.box(wx1 - wx0, 7, wz0 - wz1, (wx0 + wx1) / 2, 3.5, (wz0 + wz1) / 2, 0x7f97a8);
    k.plane(wx1 - wx0, 7, (wx0 + wx1) / 2, 3.5, wz0 + 0.01, 0x9fb3c0, corr, [0, 0, 0], 1.2);
    for (let i = 0; i < 2; i++) {
      const z = wz0 - 1.9 - i * 3.75;
      k.add(h.sideGeo([[-1.9, 0], [1.9, 0], [-1.9, 2]], wx1 - wx0), 0x9aa7b0, 'metal', (wx0 + wx1) / 2, 7, z);
    }
    for (const x of [-12.5, -5]) {
      k.box(4.5, 5, 0.1, x, 2.5, wz0 + 0.06, 0x5d6d7e, 'metal');
      for (let y = 0.4; y < 5; y += 0.45) k.box(4.5, 0.05, 0.12, x, y, wz0 + 0.08, 0x3d4a55);
    }
    cols.push({ x0: wx0, z0: wz1, x1: wx1, z1: wz0, h: 9 });
    // container nằm dọc mặt tiền, 2 hàng sâu, chồng 1–3 tầng
    const CC = [0xc0392b, 0x1d5fa8, 0x27ae60, 0xe67e22, 0xecf0f1, 0x8e44ad, 0x16a085];
    for (const z of [-5.6, -8.7]) for (const x of [4.5, 11]) {
      const n = 1 + Math.floor(r.next() * 3);
      for (let j = 0; j < n; j++) k.box(6.1, 2.6, 2.5, x, 1.3 + j * 2.65, z, CC[Math.floor(r.next() * CC.length)], corr);
      cols.push({ x0: x - 3.05, z0: z - 1.25, x1: x + 3.05, z1: z + 1.25, h: n * 2.65 });
    }
    // chòi bảo vệ + barie, xe nâng
    k.box(2, 2.6, 2, 15.3, 1.3, -1.8, 0xecf0f1);
    k.box(2.4, 0.25, 2.4, 15.3, 2.75, -1.8, 0xc0392b);
    k.box(6, 0.12, 0.12, 11, 1.05, -1.2, 0xd62d20);
    cols.push({ x0: 14.3, z0: -2.8, x1: 16.3, z1: -0.8, h: 2.9 });
    k.box(1.2, 1.4, 2, 1.5, 0.75, -3.6, 0xf39c12);
    for (const sx of [1.15, 1.85]) k.box(0.08, 2.4, 0.08, sx, 1.2, -2.5, 0x333333, 'metal');
    cols.push({ x0: 0.9, z0: -4.6, x1: 2.1, z1: -2.4, h: 2.4 });
    return { sign: scaleSign({ x: (wx0 + wx1) / 2, y: 5.8, z: wz0 + 0.06, w: 8, glow: 0.2 }, s), height: 10 * s, colliders: cols.map((c) => scaleBox(c, s)) };
  },
  // ⛪ Nhà thờ gạch đỏ (chuẩn cả khối 33,5 × 33,5): quảng trường + tượng, gian giữa + cánh ngang + hậu cung, 2 tháp chuông mái nhọn, cửa sổ hoa hồng
  cathedral(k0, o, r, h) {
    if (o.D < 20) return LANDMARKS.cathedralRow(k0, o, r, h); // lô dãy / lô nhỏ: bản mặt tiền
    const s = fitScale(o, 33.5, 33.5), k = scaledKit(k0, s), T = textures(h), cols = [];
    const W = 33.5, BR = 0xb5523b, ROOF = 0x56677a, STONE = 0xe8e0d0;
    const brick = 'tex:' + T.brick();
    k.box(W, 0.05, 33.5, 0, 0.025, -16.75, 0xd8d2c4);
    k.box(W - 1, 0.04, 13, 0, 0.06, -7, 0xc9c2b6); // quảng trường lát đá
    k.cyl(3.2, 3.4, 0.4, 0, 0.2, -6.5, 0x4f8a3a, '', 20); // bồn cỏ tròn + tượng
    k.box(1, 1.6, 1, 0, 1.2, -6.5, STONE);
    k.cyl(0.25, 0.4, 2.2, 0, 3.1, -6.5, 0xf4f1ea, '', 10);
    k.ball(0.3, 0, 4.4, -6.5, 0xf4f1ea);
    cols.push({ x0: -1.2, z0: -7.7, x1: 1.2, z1: -5.3, h: 4.6 });
    for (const sx of [-1, 1]) for (const z of [-4, -10]) h.tree(k, sx * 12.5, z, 3.2, r, 1.1);
    // hàng rào sắt thấp + cổng giữa có vòm biển tên
    for (const sx of [-1, 1]) {
      const x0 = sx * 3.2, x1 = sx * 16.2;
      k.box(Math.abs(x1 - x0), 0.4, 0.3, (x0 + x1) / 2, 0.2, -0.4, STONE);
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 0.5) k.box(0.05, 1.2, 0.05, x, 1.0, -0.4, 0x2c2c2c, 'metal');
      cols.push({ x0: Math.min(x0, x1), z0: -0.6, x1: Math.max(x0, x1), z1: -0.2, h: 1.6 });
      k.box(0.6, 3.2, 0.6, x0, 1.6, -0.4, STONE);
      k.box(0.12, 1.4, 0.12, x0, 3.9, -0.4, 0x333333, 'metal');
    }
    k.box(7, 0.35, 0.4, 0, 3.4, -0.4, STONE);
    // gian giữa + mái
    const nz0 = -14, nz1 = -26.8, nzc = (nz0 + nz1) / 2, NL = nz0 - nz1;
    k.box(13, 12, NL, 0, 6, nzc, BR);
    for (const sx of [-1, 1]) k.plane(NL, 12, sx * 6.52, 6, nzc, 0xffffff, brick, [0, (sx * PI) / 2, 0], 2);
    k.add(h.sideGeo([[-7, 0], [7, 0], [0, 5]], NL), ROOF, '', 0, 12, nzc, 0, PI / 2, 0);
    for (let z = -17.5; z >= -25; z -= 3.7) for (const sx of [-1, 1]) k.plane(1.4, 4, sx * 6.56, 7, z, 0xffffff, 'tex:' + T.arch('#2e4a6b', '#b5523b'), [0, (sx * PI) / 2, 0]);
    // cánh ngang (mặt bằng chữ thập) + hậu cung bán nguyệt
    k.box(25, 11, 5, 0, 5.5, -21.5, BR);
    k.add(h.sideGeo([[-2.8, 0], [2.8, 0], [0, 3.4]], 25), ROOF, '', 0, 11, -21.5);
    k.add(new h.THREE.CylinderGeometry(6.5, 6.5, 10, 16, 1, false, PI / 2, PI), BR, '', 0, 5, nz1);
    cols.push({ x0: -6.5, z0: nz1 - 6.5, x1: 6.5, z1: nz0, h: 17 }, { x0: -12.5, z0: -24, x1: 12.5, z1: -19, h: 14.5 });
    // mặt tiền: khối giữa + trán tường + 2 tháp chuông mái nhọn
    const fz = -15.5;
    k.box(12, 14, 3, 0, 7, fz, BR);
    k.plane(12, 14, 0, 7, fz + 1.52, 0xffffff, brick, [0, 0, 0], 2);
    k.add(h.sideGeo([[-6.2, 0], [6.2, 0], [0, 3.6]], 3), BR, '', 0, 14, fz, 0, PI / 2, 0);
    k.box(0.15, 2, 0.15, 0, 18.6, fz, 0x333333, 'metal');
    k.box(1.1, 0.15, 0.15, 0, 18.9, fz, 0x333333, 'metal');
    for (const sx of [-1, 1]) {
      const tx = sx * 8;
      k.box(4.6, 24, 4.6, tx, 12, fz, BR);
      k.plane(4.6, 24, tx, 12, fz + 2.32, 0xffffff, brick, [0, 0, 0], 2);
      k.box(5, 0.5, 5, tx, 18, fz, STONE);
      for (const fy of [8, 15, 21]) k.plane(1.4, 3, tx, fy, fz + 2.35, 0xffffff, 'tex:' + T.arch('#2b2f36', '#b5523b'));
      k.cyl(0, 3.3, 9, tx, 28.5, fz, ROOF, '', 4, [0, PI / 4, 0]);
      k.box(0.12, 1.6, 0.12, tx, 33.8, fz, 0x333333, 'metal');
      k.box(0.9, 0.12, 0.12, tx, 34.1, fz, 0x333333, 'metal');
      cols.push({ x0: tx - 2.3, z0: fz - 2.3, x1: tx + 2.3, z1: fz + 2.3, h: 24 });
    }
    k.plane(4.6, 4.6, 0, 9.8, fz + 1.55, 0xffffff, 'tex:' + T.rose());
    for (const x of [-3.6, 0, 3.6]) k.plane(x ? 2 : 2.6, x ? 4 : 5, x, x ? 2 : 2.5, fz + 1.55, 0xffffff, 'tex:' + T.arch('#4a2f22', '#b5523b'));
    cols.push({ x0: -6, z0: fz - 1.5, x1: 6, z1: fz + 1.5, h: 17 });
    return { sign: scaleSign({ y: 2.75, z: -0.15, w: 6.2, glow: 0.3 }, s), height: 35 * s, colliders: cols.map((c) => scaleBox(c, s)) };
  },

  // 📮 Bưu điện kiểu Pháp (chuẩn cả dãy 33,5 × 10,8): tường vàng gờ trắng, cửa vòm 2 tầng, mái vòm sẫm, khối giữa trán tường + đồng hồ
  postOffice(k0, o, r, h) {
    const s = fitScale(o, 33.5, 10.8), k = scaledKit(k0, s), T = textures(h), cols = [];
    const W = 33.5, D = 10.8, WALL = 0xf2d28b, TRIM = 0xfbf6e8, GREEN = 0x2e6b4a;
    const bz = -D / 2 - 0.5, bd = D - 2;
    k.box(W, 0.05, D, 0, 0.025, -D / 2, 0xd8d2c4);
    k.box(W - 1, 9, bd, 0, 4.5, bz, WALL);
    for (const y of [0.4, 4.4, 9.1]) k.box(W - 0.6, 0.35, bd + 0.4, 0, y, bz, TRIM);
    k.add(new h.THREE.CylinderGeometry(4.2, 4.2, W - 1.4, 18, 1, false, PI / 2 - 1.1, 2.2).rotateZ(PI / 2), 0x4b5a63, 'metal', 0, 6.75, bz);
    const fz = bz + bd / 2 + 0.02, win = 'tex:' + T.arch('#2f3b45', '#fbf6e8');
    for (let i = 0; i < 12; i++) {
      const x = -14.3 + i * 2.6;
      if (Math.abs(x) < 4.5) continue;
      k.plane(1.3, 2.8, x, 2.05, fz, 0xffffff, win);
      k.plane(1.3, 2.6, x, 6.45, fz, 0xffffff, win);
      k.box(0.25, 3.6, 0.25, x + 1.3, 2.25, fz + 0.1, TRIM);
    }
    cols.push({ x0: -W / 2 + 0.5, z0: bz - bd / 2, x1: W / 2 - 0.5, z1: bz + bd / 2, h: 11 });
    // khối giữa nhô ra: trán tường tam giác + đồng hồ + 3 cửa vòm xanh + mái hiên xanh
    const pz = fz + 1.2;
    k.box(9, 11, 2.4, 0, 5.5, pz - 0.6, WALL);
    k.box(9.4, 0.4, 2.8, 0, 11.15, pz - 0.6, TRIM);
    k.add(h.sideGeo([[-4.7, 0], [4.7, 0], [0, 2.6]], 2.4), WALL, '', 0, 11.35, pz - 0.6, 0, PI / 2, 0);
    k.plane(2.6, 2.6, 0, 9.05, pz + 0.62, 0xffffff, 'tex:' + T.clock());
    for (const x of [-2.8, 0, 2.8]) k.plane(2, 3.6, x, 2.35, pz + 0.62, 0xffffff, 'tex:' + T.arch('#1f4d36', '#fbf6e8'));
    k.box(9, 0.5, 2.6, 0, 4.45, pz + 0.9, GREEN);
    cols.push({ x0: -4.5, z0: pz - 1.8, x1: 4.5, z1: pz + 0.6, h: 13 });
    // cột cờ + 2 đèn cổ trước sân
    k.cyl(0.06, 0.08, 9, 6.5, 4.5, -0.8, 0xdddddd, 'metal', 6);
    k.box(1.6, 1.0, 0.04, 7.3, 8.3, -0.8, 0xd62d20);
    for (const x of [-10, 10]) {
      k.cyl(0.07, 0.1, 3.2, x, 1.6, -0.8, 0x2c2c2c, 'metal', 6);
      k.ball(0.3, x, 3.35, -0.8, 0xfff2cc, 'light');
    }
    cols.push({ x0: 6.35, z0: -0.95, x1: 6.65, z1: -0.65, h: 9 });
    return { sign: scaleSign({ y: 5.3, z: pz + 0.65, w: 7, glow: 0.3 }, s), height: 14 * s, colliders: cols.map((c) => scaleBox(c, s)) };
  },

  // 🏭 Kho hàng cảng (chuẩn cả khối 33,5 × 33,5): sân bê tông, nhà kho tôn mái răng cưa + cửa cuốn, bãi container xếp chồng, cẩu khung vàng, chòi bảo vệ + barie, xe nâng
  portWarehouse(k0, o, r, h) {
    if (o.D < 20) return LANDMARKS.portWarehouseRow(k0, o, r, h); // lô dãy / lô nhỏ: bản gọn
    const s = fitScale(o, 33.5, 33.5), k = scaledKit(k0, s), cols = [];
    const corr = 'tex:' + h.T.corr();
    k.box(33.5, 0.05, 33.5, 0, 0.025, -16.75, 0x6f7177);
    // nhà kho tôn
    const wx0 = -16, wx1 = -1, wz0 = -12, wz1 = -33;
    k.box(wx1 - wx0, 7, wz0 - wz1, (wx0 + wx1) / 2, 3.5, (wz0 + wz1) / 2, 0x7f97a8);
    for (const sx of [wx0 - 0.01, wx1 + 0.01]) k.plane(wz0 - wz1, 7, sx, 3.5, (wz0 + wz1) / 2, 0x9fb3c0, corr, [0, PI / 2, 0], 1.2);
    k.plane(wx1 - wx0, 7, (wx0 + wx1) / 2, 3.5, wz0 + 0.01, 0x9fb3c0, corr, [0, 0, 0], 1.2);
    for (let i = 0; i < 4; i++) {
      const z = wz0 - 2.6 - i * 5.25;
      k.add(h.sideGeo([[-2.6, 0], [2.65, 0], [-2.6, 2.4]], wx1 - wx0), 0x9aa7b0, 'metal', (wx0 + wx1) / 2, 7, z);
      k.box(wx1 - wx0, 2.2, 0.1, (wx0 + wx1) / 2, 8.1, z - 2.6, 0xb9dcef, 'glass');
    }
    for (const z of [-15, -21, -27]) {
      k.box(0.1, 5, 4.5, wx1 + 0.06, 2.5, z, 0x5d6d7e, 'metal');
      for (let y = 0.4; y < 5; y += 0.45) k.box(0.12, 0.05, 4.5, wx1 + 0.08, y, z, 0x3d4a55);
    }
    cols.push({ x0: wx0, z0: wz1, x1: wx1, z1: wz0, h: 9.5 });
    // bãi container (màu, số tầng ngẫu nhiên theo seed)
    const CC = [0xc0392b, 0x1d5fa8, 0x27ae60, 0xe67e22, 0xecf0f1, 0x8e44ad, 0x16a085];
    for (let row = 0; row < 3; row++) for (let c = 0; c < 4; c++) {
      const n = 1 + Math.floor(r.next() * 3), x = 3 + c * 3.3, z = -11.5 - row * 7.5;
      for (let j = 0; j < n; j++) k.box(2.5, 2.6, 6.1, x, 1.3 + j * 2.65, z, CC[Math.floor(r.next() * CC.length)], corr);
      cols.push({ x0: x - 1.25, z0: z - 3.05, x1: x + 1.25, z1: z + 3.05, h: n * 2.65 });
    }
    // cẩu khung vàng bắc ngang bãi
    for (const x of [1, 15.5]) for (const z of [-20, -30]) {
      k.box(0.6, 11, 0.6, x, 5.5, z, 0xf1c40f, 'metal');
      cols.push({ x0: x - 0.4, z0: z - 0.4, x1: x + 0.4, z1: z + 0.4, h: 11 });
    }
    for (const z of [-20, -30]) k.box(15.1, 0.8, 0.8, 8.25, 11.1, z, 0xf1c40f, 'metal');
    k.box(1.2, 0.8, 10.6, 8.25, 11.1, -25, 0xf1c40f, 'metal');
    k.box(1.6, 1.2, 1.6, 8.25, 10.3, -25, 0x34495e);
    k.rod([8.25, 9.7, -25], [8.25, 6.2, -25], 0.04, 0x222222);
    // chòi bảo vệ + barie cổng
    k.box(2.4, 2.6, 2.4, 13.5, 1.3, -2.5, 0xecf0f1);
    k.box(2.8, 0.25, 2.8, 13.5, 2.75, -2.5, 0xc0392b);
    k.box(1.6, 0.8, 0.05, 13.5, 1.6, -1.28, 0x9fc3d6, 'glass');
    k.box(7, 0.12, 0.12, 8.5, 1.05, -1.5, 0xd62d20);
    k.cyl(0.12, 0.12, 1, 12.1, 0.5, -1.5, 0x555555, 'metal', 6);
    cols.push({ x0: 12.3, z0: -3.7, x1: 14.7, z1: -1.3, h: 2.9 });
    // xe nâng + pallet hàng
    k.box(1.2, 1.4, 2, 0, 0.75, -18, 0xf39c12);
    for (const sx of [-0.35, 0.35]) k.box(0.08, 2.4, 0.08, sx, 1.2, -16.9, 0x333333, 'metal');
    for (let i = 0; i < 3; i++) k.box(1.2, 0.9, 1.2, -4 + i * 1.4, 0.45, -8, 0xb08a5a);
    cols.push({ x0: -0.6, z0: -19, x1: 0.6, z1: -16.8, h: 2.4 }, { x0: -4.6, z0: -8.6, x1: -0.6, z1: -7.4, h: 0.9 });
    return { sign: scaleSign({ x: (wx0 + wx1) / 2, y: 5.8, z: wz0 + 0.06, w: 9, glow: 0.2 }, s), height: 12 * s, colliders: cols.map((c) => scaleBox(c, s)) };
  },

  // ♻️ Vựa ve chai (chuẩn 2 lô 22,2 × 10,8): mái tôn rỉ trên cột sắt, vách tôn, kiện giấy, đống sắt vụn, bao chai nhựa, tủ lạnh cũ, cân treo, xe ba gác
  scrapYard(k0, o, r, h) {
    const s = fitScale(o, 22.2, 10.8), k = scaledKit(k0, s), cols = [];
    const W = 22.2, D = 10.8, corr = 'tex:' + h.T.corr();
    k.box(W, 0.05, D, 0, 0.025, -D / 2, 0x8a8172);
    for (const x of [-10.5, -3.5, 3.5, 10.5]) for (const z of [-3.5, -10.3]) {
      const hh = z === -3.5 ? 4.2 : 3.4;
      k.box(0.15, hh, 0.15, x, hh / 2, z, 0x555555, 'metal');
      cols.push({ x0: x - 0.15, z0: z - 0.15, x1: x + 0.15, z1: z + 0.15, h: hh });
    }
    k.box(W - 0.4, 0.08, 7.6, 0, 3.8, -6.9, 0x9c6b4a, corr, [-0.11, 0, 0]); // mái tôn rỉ
    for (const sx of [-1, 1]) k.box(0.08, 3, D - 0.6, sx * (W / 2 - 0.2), 1.5, -D / 2, 0x8a9399, corr);
    k.box(W - 0.4, 3, 0.08, 0, 1.5, -D + 0.3, 0x8a9399, corr);
    cols.push({ x0: -W / 2, z0: -D, x1: -W / 2 + 0.4, z1: 0, h: 3 }, { x0: W / 2 - 0.4, z0: -D, x1: W / 2, z1: 0, h: 3 }, { x0: -W / 2, z0: -D, x1: W / 2, z1: -D + 0.5, h: 3 });
    // kiện giấy carton
    for (let i = 0; i < 9; i++) {
      const x = -9.5 + (i % 3) * 1.25, y = 0.5 + Math.floor(i / 3) * 0.95;
      k.box(1.15, 0.9, 1.1, x, y, -9.6, 0xb08a5a);
      k.box(1.17, 0.06, 1.12, x, y, -9.6, 0x5d4a33);
    }
    cols.push({ x0: -10.3, z0: -10.2, x1: -6.4, z1: -9, h: 2.9 });
    // đống sắt vụn
    for (let i = 0; i < 36; i++) {
      const a = r.next() * PI * 2, d = r.next() * 2.6, y = 0.2 + (2.6 - d) * 0.45 * r.next();
      const col = [0x6d6f72, 0x8b5a3c, 0x9a9da0, 0x5c3d2e][i % 4], x = 2 + Math.cos(a) * d, z = -7 + Math.sin(a) * d * 0.8;
      if (r.next() < 0.5) k.box(0.3 + r.next() * 0.9, 0.08 + r.next() * 0.2, 0.2 + r.next() * 0.6, x, y, z, col, 'metal', [r.next() * 3, r.next() * 3, r.next() * 3]);
      else k.cyl(0.06, 0.06, 0.6 + r.next() * 1.2, x, y, z, col, 'metal', 6, [r.next() * 3, r.next() * 3, r.next() * 3]);
    }
    cols.push({ x0: -0.6, z0: -9.1, x1: 4.6, z1: -4.9, h: 1.4 });
    // bao chai nhựa, tủ lạnh cũ, máy giặt
    for (let i = 0; i < 7; i++) k.ball(0.55, 7 + (i % 3) * 1.05, 0.55 + Math.floor(i / 3) * 0.8, -9.3 + (i % 2) * 0.3, 0xf2f2f2);
    k.box(0.8, 1.7, 0.7, -4, 0.85, -9.8, 0xe8e8e8);
    k.box(0.7, 0.9, 0.7, -3, 0.45, -9.8, 0xd5dbe0);
    cols.push({ x0: 6.4, z0: -9.9, x1: 9.8, z1: -8.6, h: 2 }, { x0: -4.4, z0: -10.2, x1: -2.6, z1: -9.4, h: 1.7 });
    // cân treo dưới mái
    k.box(0.06, 1.2, 0.06, -1, 3.1, -4, 0x555555, 'metal');
    k.cyl(0.25, 0.25, 0.1, -1, 2.45, -4, 0xc0392b, '', 10);
    k.cyl(0.6, 0.6, 0.05, -1, 1.85, -4, 0x888888, 'metal', 12);
    // xe ba gác chở carton
    k.box(1.4, 0.15, 2, -6, 0.6, -1.6, 0x2c3e50, 'metal');
    for (const [x, z] of [[-6.6, -2.3], [-5.4, -2.3], [-6, 0]]) k.cyl(0.32, 0.32, 0.12, x, 0.32, z, 0x222222, '', 12, [0, 0, PI / 2]);
    k.box(1.3, 0.9, 1.6, -6, 1.15, -1.7, 0xb08a5a);
    cols.push({ x0: -6.8, z0: -2.7, x1: -5.2, z1: 0.3, h: 1.6 });
    // biển tên trên 2 cột sắt trước vựa
    for (const x of [-4, 4]) k.box(0.1, 4.1, 0.1, x, 2.05, -0.1, 0x555555, 'metal');
    return { sign: scaleSign({ y: 4.4, z: -0.04, w: 8, glow: 0.2 }, s), height: 5 * s, colliders: cols.map((c) => scaleBox(c, s)) };
  },

  // 🏥 Bệnh viện (chuẩn cả dãy 33,5 × 10,8): khối kính nhiều tầng + dải xanh, chữ thập đỏ trên nóc, sân đỗ trực thăng, khối cấp cứu + mái che + xe cứu thương
  hospital(k0, o, r, h) {
    const s = fitScale(o, 33.5, 10.8), k = scaledKit(k0, s), T = textures(h), cols = [], extra = [];
    const D = 10.8, WHITE = 0xf4f6f7, floors = Math.max(4, Math.min(9, o.floors || 7)), H = floors * 3.1 + 0.4;
    const tx0 = -6, tx1 = 15, tz = -D / 2 - 0.6, td = D - 2, fz = tz + td / 2 + 0.02;
    k.box(33.5, 0.05, D, 0, 0.025, -D / 2, 0xd8d2c4);
    k.box(tx1 - tx0, H, td, (tx0 + tx1) / 2, H / 2, tz, WHITE);
    k.plane(tx1 - tx0 - 1, H - 1.4, (tx0 + tx1) / 2, H / 2, fz, 0xffffff, 'tex:' + h.T.glassGrid(), [0, 0, 0], 3);
    for (let f = 1; f <= floors; f++) k.box(tx1 - tx0 + 0.2, 0.35, 0.3, (tx0 + tx1) / 2, f * 3.1, fz + 0.1, WHITE);
    k.box(1.6, H + 1, 1.2, tx0 + 0.8, (H + 1) / 2, fz - 0.2, 0x2e86c1);
    cols.push({ x0: tx0, z0: tz - td / 2, x1: tx1, z1: fz + 0.3, h: H + 3 });
    // chữ thập đỏ trên nóc + sân đỗ trực thăng
    k.box(4, 4, 0.4, 11, H + 2.2, tz - 2, WHITE);
    k.box(2.8, 0.9, 0.45, 11, H + 2.2, tz - 1.98, 0xd62d20);
    k.box(0.9, 2.8, 0.45, 11, H + 2.2, tz - 1.98, 0xd62d20);
    k.cyl(3.4, 3.4, 0.3, 1, H + 0.15, tz, 0xffffff, 'tex:' + T.heli(), 24);
    // khối cấp cứu thấp + mái che vươn ra trước + biển CẤP CỨU
    k.box(9.5, 4.5, td, -11.5, 2.25, tz, WHITE);
    k.plane(7, 3, -11.5, 1.8, fz, 0xffffff, 'tex:' + h.T.glassGrid(), [0, 0, 0], 3);
    k.box(10, 0.4, 3.8, -11.5, 4.3, fz + 1.7, 0xecf0f1);
    for (const x of [-15.8, -7.2]) {
      k.cyl(0.15, 0.15, 4.2, x, 2.1, fz + 3.3, WHITE, '', 8);
      cols.push({ x0: x - 0.2, z0: fz + 3.1, x1: x + 0.2, z1: fz + 3.5, h: 4.2 });
    }
    k.plane(5.5, 1, -11.5, 4.3, fz + 3.62, 0xffffff, 'tex:' + h.textTex(h.fmt('city.hospitalER'), { bg: '#d62d20', w: 512, h: 96 }));
    cols.push({ x0: -16.25, z0: tz - td / 2, x1: -6.75, z1: fz, h: 4.6 });
    // xe cứu thương đậu dưới mái che (có dải đỏ, đèn xanh)
    if (h.makeCar) {
      const amb = h.makeCar(0xf8f9f9, 'suv');
      amb.position.set(-11.5 * s, 0, (fz + 1.6) * s);
      amb.rotation.y = PI / 2;
      amb.scale.setScalar(Math.min(1, s * 1.4));
      extra.push(amb);
      k.box(4.1, 0.25, 1.92, -11.5, 0.95, fz + 1.6, 0xd62d20);
      k.box(0.9, 0.18, 0.4, -11.5, 1.85, fz + 1.6, 0x3498db, 'light');
      cols.push({ x0: -13.6, z0: fz + 0.6, x1: -9.4, z1: fz + 2.6, h: 2 });
    }
    for (const x of [-3, 16.2]) h.tree(k, x, -0.9, 3, r, 0.9);
    return { sign: scaleSign({ x: 3, y: H - 1.4, z: fz + 0.35, w: 12, glow: 0.5 }, s), height: (H + 4.5) * s, colliders: cols.map((c) => scaleBox(c, s)), extra };
  },
};
