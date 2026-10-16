// Hằng số + hàm nhỏ dùng chung giữa game.js và các phần trong src/game/ (tách từ đầu game.js)

// tên tuyến ngắn: "Tuyến 1 · Trung tâm – Sân bay…" → "Tuyến 1"
export const routeShort = (r) => String(r?.name || '').split(' · ')[0];

export const SAVE_KEY = 'shipper-sim-save-v1';
export const PHOTO_KEY = 'shipper-sim-photos-v1'; // app Máy ảnh: 3 ô ảnh = 3 bản lưu { save, img, day, time, where }
export const PHOTO_SLOTS = 3;
// Tin nhóm Hội shipper (dự báo, quảng cáo, mẹo, kẹt xe…): TẮT theo yêu cầu chủ game (liên quan cốt truyện) — khi nào chủ game bảo thì bật lại
export const GROUP_CHAT_ON = false;
export const GARAGE_CAM = { dist: 3.2, pitch: 0.28 }; // camera khi đứng / chạy xe trong hầm xe phòng trọ
export const SW_H = 0.15;
export const NO_MOVE = { forward: false, back: false, left: false, right: false, run: false, brake: false }; // đứng yên (đang nói chuyện)
export const TALK_CAM_GROUP = { dist: 7.5, pitch: 0.36 }; // nói chuyện với 2 người cùng lúc
export const TALK_CAM = { dist: 5.5, pitch: 0.3 }; // camera lúc nói chuyện với người lạ (cốt truyện)
export const fmtTime = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
export const NORMAL = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const inRect = (r, p) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;

// Gắn các hàm của lớp "phần" (src/game/*.js) vào lớp Game — gọi this.xxx() như cũ, chỉ là code nằm ở file khác
export function mixParts(target, parts) {
  for (const P of parts) {
    for (const k of Object.getOwnPropertyNames(P.prototype)) {
      if (k === 'constructor') continue;
      if (Object.prototype.hasOwnProperty.call(target.prototype, k)) throw new Error(`Hàm ${k} bị trùng giữa game.js và ${P.name}`);
      Object.defineProperty(target.prototype, k, Object.getOwnPropertyDescriptor(P.prototype, k));
    }
  }
}
