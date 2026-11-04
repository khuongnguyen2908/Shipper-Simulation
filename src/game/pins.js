// =============================================================
// GAME — BIỂU TƯỢNG NỔI TRÊN CỬA CHỖ QUAN TRỌNG (ui/placePins.js vẽ). Phần của lớp Game (gắn bằng mixParts).
// Luật chống rối màn hình:
//  - Tối đa PIN.max biểu tượng cùng lúc (chỗ gần nhất, trong PIN.far m, ở trước camera).
//  - Chỗ CHƯA GHÉ: biểu tượng nhún nhún + nhãn MỚI. Đã ghé (tới sát cửa 1 lần): chỉ hiện khi còn dưới PIN.seenNear m, nhỏ, đứng yên.
//  - Chỉ 1 bong bóng mở ("làm được gì ở đây"): chỗ gần nhất dưới PIN.open m, khi đi bộ / xe chạy chậm, và không đang hiện bong bóng đèn đỏ.
//  - Ẩn hết lúc có hộp thoại, cảnh phim, đánh nhau, màn đua, bản đồ riêng (trên tàu), đang chờ (thanh tiến độ Online), chỗ đang lấy / giao đơn.
// Chỉ để nhìn, mỗi máy tự vẽ (Online: đã ghé chỗ nào là của riêng từng người — gs.flags.seen, lưu cùng bản lưu).
// =============================================================
import * as THREE from 'three';
import { PlacePins, shouldPin, placeInfo } from '../ui/placePins.js';
import { unlocked } from '../sim/placeRules.js';

const PIN = { max: 3, far: 60, seenNear: 25, open: 15, visit: 5, slow: 3, up: 4.2 };
const V = new THREE.Vector3();

export class PinsPart {
  pinsTick() {
    this.pins ??= new PlacePins(this.uiRoot);
    const gs = this.gs;
    const hide = this.state !== 'play' || !gs || this.modal.open || this.screens.open || this.cine || this.fight || this.race || this.zone || this.busy || this.storyLose || this.paused;
    if (hide) return this.pins.clear();
    // danh sách chỗ có biểu tượng (tính lại khi đổi ván)
    if (this.pinGs !== gs) {
      this.pinGs = gs;
      this.pinList = this.layout.places.filter(shouldPin).map((p) => ({ p, info: placeInfo(p) }));
    }
    const pp = this.playerPos, seen = (gs.flags.seen ||= []);
    const o = this.om?.order, busyIds = new Set([o?.pickup?.placeId, o?.dropoff?.placeId].filter(Boolean)); // chỗ đang lấy / giao đơn: đã có dấu đích đến
    const cands = [];
    for (const c of this.pinList) {
      const p = c.p, d = Math.hypot(p.door.x - pp.x, p.door.z - pp.z);
      if (d < PIN.visit && !seen.includes(p.id)) seen.push(p.id); // tới sát cửa = đã ghé
      if (d > PIN.far || busyIds.has(p.id) || !unlocked(p, gs.progress)) continue;
      const isNew = !seen.includes(p.id);
      if (!isNew && d > PIN.seenNear) continue;
      V.set(p.door.x, PIN.up, p.door.z).project(this.camera);
      if (V.z > 1 || V.x < -1.1 || V.x > 1.1 || V.y < -1.1 || V.y > 1.1) continue; // sau lưng / ngoài khung hình
      cands.push({ id: p.id, d, info: c.info, isNew, small: !isNew, x: ((V.x + 1) / 2) * window.innerWidth, y: ((1 - V.y) / 2) * window.innerHeight });
    }
    cands.sort((a, b) => a.d - b.d);
    const list = cands.slice(0, PIN.max);
    const slow = this.mode === 'foot' || Math.abs(this.bike.speed) < PIN.slow;
    if (list[0] && list[0].d <= PIN.open && slow && !this.lightShown) list[0].open = true;
    this.pins.update(list);
  }
}
