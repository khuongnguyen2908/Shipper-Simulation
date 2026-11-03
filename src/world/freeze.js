// =============================================================
// ĐÓNG BĂNG ĐỒ ĐỨNG YÊN — nhà cửa, cây, cột điện, bảng hiệu… không bao giờ dời chỗ, nhưng Three.js mặc định tính lại
// vị trí (ma trận) của MỌI vật thể mỗi khung hình (~15.000 cái → ~5 ms / khung). Đóng băng = tính 1 lần rồi thôi.
// Có người canh: mỗi khung soi lại 1 phần nhỏ các vật đã đóng băng; vật nào bị code dời chỗ / xoay / đổi cỡ (sót trong danh sách
// "đồ cử động") thì tự mở băng cho nó → không bao giờ bị kẹt hình, chỉ chậm tối đa ~0,5 giây ở lần dời đầu tiên.
// Chỉ ảnh hưởng cách vẽ trên từng máy (chơi nhiều người không liên quan).
// =============================================================
const CHECK_SHARE = 1 / 30; // mỗi khung soi 1/30 số vật đã đóng băng (60 khung / giây → mỗi vật được soi 2 lần / giây)

export class StaticFreezer {
  constructor(scene) {
    this.scene = scene;
    this.list = []; // vật đã đóng băng
    this.saved = new Float64Array(0); // 10 số / vật: vị trí (3) + xoay (4) + cỡ (3) lúc đóng băng
    this.cursor = 0;
    this.thawed = 0; // số vật đã tự mở băng (để soi khi thử)
  }

  // Đóng băng mọi vật đang có trong cảnh, trừ các vật trong `moving` (và mọi thứ nằm bên trong chúng).
  freeze(moving) {
    const skip = new Set();
    for (const m of moving) m?.traverse?.((o) => skip.add(o));
    this.scene.updateMatrixWorld(true); // tính đúng vị trí 1 lần trước khi khóa
    const list = [];
    this.scene.traverse((o) => {
      if (o === this.scene || skip.has(o) || o.isCamera || !o.matrixAutoUpdate) return;
      o.matrixAutoUpdate = false;
      // vật lẻ (không có con): khỏi ghé thăm luôn lúc cập nhật cảnh. Vật có con vẫn ghé (con có thể là đồ cử động / thêm vào sau)
      if (!o.children.length) o.matrixWorldAutoUpdate = false;
      list.push(o);
    });
    // cảnh gốc luôn ở gốc tọa độ: khóa luôn, không thì Three.js ép tính lại toàn bộ cây mỗi khung
    this.scene.matrixAutoUpdate = false;
    this.list = list;
    this.saved = new Float64Array(list.length * 10); // số thực đủ độ chính xác như vị trí gốc (Float32 làm tròn → tưởng bị dời)
    list.forEach((o, i) => this.save(o, i));
    return list.length;
  }

  save(o, i) {
    const s = this.saved, k = i * 10;
    s[k] = o.position.x; s[k + 1] = o.position.y; s[k + 2] = o.position.z;
    s[k + 3] = o.quaternion.x; s[k + 4] = o.quaternion.y; s[k + 5] = o.quaternion.z; s[k + 6] = o.quaternion.w;
    s[k + 7] = o.scale.x; s[k + 8] = o.scale.y; s[k + 9] = o.scale.z;
  }

  moved(o, i) {
    const s = this.saved, k = i * 10, p = o.position, q = o.quaternion, c = o.scale;
    return p.x !== s[k] || p.y !== s[k + 1] || p.z !== s[k + 2] || q.x !== s[k + 3] || q.y !== s[k + 4] || q.z !== s[k + 5] || q.w !== s[k + 6] || c.x !== s[k + 7] || c.y !== s[k + 8] || c.z !== s[k + 9];
  }

  // gọi mỗi khung hình: soi 1 phần, vật nào bị dời thì mở băng cho nó (và cho cả nhánh con, vì vị trí con tính theo cha)
  tick() {
    const n = this.list.length;
    if (!n) return;
    const step = Math.max(1, Math.ceil(n * CHECK_SHARE));
    for (let j = 0; j < step; j++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % n;
      const o = this.list[i];
      if (!o || o.matrixAutoUpdate || !this.moved(o, i)) continue;
      o.traverse((x) => { x.matrixAutoUpdate = true; x.matrixWorldAutoUpdate = true; });
      this.thawed++;
      if (import.meta.env?.DEV) console.warn('[đóng băng] vật bị dời chỗ → mở băng:', o.name || o.type, o);
    }
  }
}
