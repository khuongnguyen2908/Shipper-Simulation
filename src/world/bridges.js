// Cầu có độ cao (map.json → rivers[].bridges + bridgeStyles, sửa ở ?editor → Bản đồ → Sông & cầu):
//  - 'arch'     cầu vòm thép cao qua sông lớn: dốc dẫn bắt đầu sau ngã tư gần sông, mặt cầu cao ~8 m giữa sông
//  - 'iron'     cầu sắt cong nhỏ qua kênh (kiểu cầu Mống): vồng ~2,2 m ngay trên kênh
//  - 'concrete' cầu vồng bê tông nhỏ qua kênh, 4 trụ đèn: vồng ~2 m
// Cầu phẳng ('flat') vẫn vẽ trong city.js như cũ.
// bridgeDecks(): thuần (không Three.js) — đường tim mặt cầu + độ cao, dùng cho mặt đi trên cao (elevated.js) và bộ thử.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, roadPos } from '../sim/cityLayout.js';

export const ARCH = { hc: 8, hb: 5, start: 10, rise: 15 }; // cao giữa sông · cao ở mép sông · dốc bắt đầu cách ngã tư · vòm cao hơn mặt cầu
export const HUMP = { iron: 2.2, concrete: 2.0, reach: 14 }; // độ vồng · dốc bắt đầu cách tim kênh
const HALF_ROAD = CITY.ROAD / 2, RAIL = 5.6; // xe chạy trong ±5,6 m (lan can ở mép đường)

// Mặt cầu có độ cao: { style, along ('x' | 'z': trục đường chạy), w (toạ độ trục còn lại), u0, u1, mid, half, h(u), pts }
export function bridgeDecks(G) {
  const out = [];
  for (const b of G.bridges) {
    if (b.style === 'flat') continue;
    // sông chạy theo b.axis → đường qua cầu chạy theo trục còn lại; w: vị trí con đường đó
    const along = b.axis === 'x' ? 'x' : 'z';
    const w = roadPos(b.k);
    let u0, u1, mid, half, h;
    if (b.wide) {
      const c0 = roadPos(b.line) - HALF_ROAD, c1 = roadPos(b.line + 1) + HALF_ROAD;
      mid = (c0 + c1) / 2;
      half = (c1 - c0) / 2;
      u0 = b.line - 1 >= 0 ? roadPos(b.line - 1) + ARCH.start : c0 - 36;
      u1 = b.line + 2 <= CITY.N ? roadPos(b.line + 2) - ARCH.start : c1 + 36;
      const lenA = c0 - u0, lenB = u1 - c1;
      h = (u) => {
        const a = Math.abs(u - mid);
        if (a <= half) return ARCH.hc - (ARCH.hc - ARCH.hb) * (a / half) ** 2;
        const d = (a - half) / (u < mid ? lenA : lenB);
        return Math.max(0, ARCH.hb * (1 - d));
      };
    } else {
      mid = roadPos(b.line);
      half = HALF_ROAD;
      const hc = HUMP[b.style] ?? 2;
      u0 = mid - HUMP.reach;
      u1 = mid + HUMP.reach;
      h = (u) => {
        const a = Math.abs(u - mid);
        return a >= HUMP.reach ? 0 : hc * Math.cos((a / HUMP.reach) * (Math.PI / 2)) ** 1.4;
      };
    }
    const pts = [];
    const n = Math.round(u1 - u0);
    for (let i = 0; i <= n; i++) {
      const u = u0 + ((u1 - u0) * i) / n;
      pts.push(along === 'x' ? { x: u, y: h(u), z: w } : { x: w, y: h(u), z: u });
    }
    out.push({ ...b, along, w, u0, u1, mid, half, h, pts });
  }
  return out;
}

// ---------- dựng hình ----------
const MAT = {};
const mat = (c, o = {}) => (MAT[c + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o }));

// Dựng mọi cầu có độ cao; đăng ký mặt đi trên cao vào elev. Trả về danh sách mặt cầu (bridgeDecks).
export function buildBridges(scene, G, elev) {
  const decks = bridgeDecks(G);
  const parts = new Map(); // vật liệu → các hình gộp
  const put = (m, geo) => {
    // mọi hình cùng thuộc tính (vị trí + pháp tuyến) để gộp được
    if (geo.index) geo = geo.toNonIndexed();
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    geo.computeVertexNormals();
    if (!parts.has(m)) parts.set(m, []);
    parts.get(m).push(geo);
  };
  for (const d of decks) {
    // điểm theo (dọc u, ngang l, cao y) → thế giới
    const P = (u, l, y) => (d.along === 'x' ? [u, y, d.w + l] : [d.w + l, y, u]);
    // dải mặt cầu chạy dọc u, ngang từ la tới lb, mặt trên lệch dy so với mặt đường, dày th
    const strip = (la, lb, dy, th, m, from = d.u0, to = d.u1, hf = d.h) => {
      const pos = [], idx = [];
      const n = Math.max(2, Math.round((to - from) * 2));
      for (let i = 0; i <= n; i++) {
        const u = from + ((to - from) * i) / n, y = hf(u);
        for (const [l, yy] of [[la, dy], [lb, dy], [lb, dy - th], [la, dy - th]]) pos.push(...P(u, l, y + yy));
      }
      for (let i = 0; i < n; i++) {
        const a = i * 4, b = a + 4;
        for (const [p, q] of [[0, 1], [1, 2], [2, 3], [3, 0]]) idx.push(a + p, b + p, b + q, a + p, b + q, a + q);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      put(m, geo.toNonIndexed());
    };
    const boxAt = (m, w, hh, len, u, l, y, ry = 0) => {
      const g = d.along === 'x' ? new THREE.BoxGeometry(len, hh, w) : new THREE.BoxGeometry(w, hh, len);
      if (ry) g.rotateY(ry);
      g.translate(...P(u, l, y));
      put(m, g.toNonIndexed());
    };
    const cylAt = (m, r, hh, u, l, y) => put(m, new THREE.CylinderGeometry(r, r, hh, 10).translate(...P(u, l, y)).toNonIndexed());
    // nối 2 điểm (u, l, y) bằng thanh vuông cạnh s
    const beam = (m, a, b, s) => {
      const A = new THREE.Vector3(...P(...a)), B = new THREE.Vector3(...P(...b));
      const len = A.distanceTo(B), g = new THREE.BoxGeometry(s, s, len + 0.02);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), B.clone().sub(A).normalize());
      g.applyQuaternion(q).translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
      put(m, g.toNonIndexed());
    };
    const road = mat(0x4a4c52, { roughness: 0.92 });
    const dash = (u0, u1, hf = d.h) => {
      for (let u = u0 + 1; u < u1 - 2; u += 5) {
        const y = hf(u), y2 = hf(u + 2.5);
        const g = new THREE.BoxGeometry(d.along === 'x' ? 2.5 : 0.18, 0.03, d.along === 'x' ? 0.18 : 2.5);
        if (d.along === 'x') g.rotateZ(Math.atan2(y2 - y, 2.5));
        else g.rotateX(-Math.atan2(y2 - y, 2.5));
        g.translate(...P(u + 1.25, 0, (y + y2) / 2 + 0.05));
        put(mat(0xe8e2c8), g.toNonIndexed());
      }
    };

    if (d.style === 'arch') {
      const concrete = mat(0xd2cfc8), red = mat(0xc0392b, { roughness: 0.55, metalness: 0.2 }), white = mat(0xf2f2f2);
      strip(-HALF_ROAD - 0.5, HALF_ROAD + 0.5, 0, 1.0, concrete);
      strip(-HALF_ROAD + 0.2, HALF_ROAD - 0.2, 0.04, 0.04, road);
      dash(d.u0, d.u1);
      for (const s of [-1, 1]) strip(s * (HALF_ROAD + 0.2), s * (HALF_ROAD + 0.5), 1.1, 1.1, concrete); // lan can
      // 2 vòm thép đỏ trên nhịp + dây treo + giằng ngang
      const c0 = d.mid - d.half, c1 = d.mid + d.half, N = 32;
      for (const s of [-1, 1]) {
        let prev = null;
        for (let i = 0; i <= N; i++) {
          const u = c0 + ((c1 - c0) * i) / N, t = Math.sin((Math.PI * i) / N);
          const p = [u, s * (HALF_ROAD + 0.9) * (1 - 0.18 * t), d.h(u) + ARCH.rise * t];
          if (prev) beam(red, prev, p, 0.9);
          if (i % 2 === 0 && i > 0 && i < N) beam(white, [u, p[1], d.h(u) + 0.2], p, 0.08);
          prev = p;
        }
      }
      for (let i = 6; i <= 26; i += 5) {
        const u = c0 + ((c1 - c0) * i) / N, t = Math.sin((Math.PI * i) / N), y = d.h(u) + ARCH.rise * t - 0.3;
        beam(red, [u, -(HALF_ROAD + 0.9) * (1 - 0.18 * t), y], [u, (HALF_ROAD + 0.9) * (1 - 0.18 * t), y], 0.6);
      }
      // trụ: 2 bên bờ + dưới dốc dẫn (chỗ đủ cao)
      for (const u of [c0, c1, c0 - 12, c0 - 24, c1 + 12, c1 + 24]) {
        const y = d.h(u) - 1;
        if (y < 1.2) continue;
        for (const l of [-3.5, 3.5]) cylAt(concrete, 0.7, y + 1.5, u, l, (y - 1.5) / 2);
      }
    } else {
      const iron = d.style === 'iron';
      const side = iron ? mat(0x2e7d8c, { roughness: 0.5, metalness: 0.3 }) : mat(0xecebe6);
      strip(-HALF_ROAD + 0.4, HALF_ROAD - 0.4, 0, iron ? 0.5 : 0.7, iron ? mat(0x8a8f94) : mat(0xd2cfc8));
      strip(-HALF_ROAD + 0.6, HALF_ROAD - 0.6, 0.04, 0.04, road);
      for (const s of [-1, 1]) {
        if (iron) {
          // dầm thép cong dưới mặt cầu, cột lan can + tay vịn
          strip(s * (HALF_ROAD - 0.6), s * (HALF_ROAD - 0.2), -0.45, 0.9, side, d.mid - 9, d.mid + 9);
          for (let u = d.u0 + 2; u <= d.u1 - 2; u += 1.5) boxAt(side, 0.08, 1.1, 0.08, u, s * (HALF_ROAD - 0.3), d.h(u) + 0.55);
          strip(s * (HALF_ROAD - 0.36), s * (HALF_ROAD - 0.24), 1.12, 0.12, side, d.u0 + 2, d.u1 - 2);
          for (const u of [d.u0 + 2, d.u1 - 2]) boxAt(mat(0xecf0f1), 0.4, 1.6, 0.4, u, s * (HALF_ROAD - 0.3), d.h(u) + 0.8);
        } else {
          strip(s * (HALF_ROAD - 0.6), s * (HALF_ROAD - 0.25), 0.95, 0.95, side, d.u0 + 1, d.u1 - 1);
          for (const u of [d.u0 + 1, d.u1 - 1]) {
            boxAt(side, 0.6, 2.6, 0.6, u, s * (HALF_ROAD - 0.4), d.h(u) + 1.3);
            put(mat(0xfff2cc, { emissive: 0xffd27a, emissiveIntensity: 0.6 }), new THREE.IcosahedronGeometry(0.35, 0).translate(...P(u, s * (HALF_ROAD - 0.4), d.h(u) + 2.9)).toNonIndexed());
          }
        }
      }
    }
    elev.addRamp(d.pts, RAIL);
  }
  for (const [m, geos] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return decks;
}
