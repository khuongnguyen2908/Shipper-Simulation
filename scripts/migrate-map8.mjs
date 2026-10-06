// Chuyển dữ liệu một lần (Đợt 2): bản đồ 5×5 → 8×8, đặt thành phố cũ vào giữa.
//  - dời mọi địa điểm, hẻm 42, đường chính lùi vào 1 khối (+1, +1)
//  - thêm tên cho 3 đường mới mỗi chiều (1 phía tây/bắc, 2 phía đông/nam)
// Chạy: node scripts/migrate-map8.mjs   (chạy lần 2 sẽ tự dừng vì đã đủ tên đường)
import fs from 'node:fs';

const p = new URL('../src/data/places.json', import.meta.url);
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
if (d.streetsX.length !== 6 || d.streetsZ.length !== 6) {
  console.log('Đã chuyển rồi (không còn là bản đồ 5×5) — bỏ qua.');
  process.exit(0);
}
const OFF = 1;
for (const pl of d.places) pl.block = [pl.block[0] + OFF, pl.block[1] + OFF];
d.alley.block = [d.alley.block[0] + OFF, d.alley.block[1] + OFF];
for (const r of d.mainRoads) r.line += OFF;
// đường dọc (tây → đông) · đường ngang (bắc → nam)
d.streetsX = ['Cách Mạng Tháng Tám', ...d.streetsX, 'Nguyễn Huệ', 'Tôn Thất Thiệp'];
d.streetsZ = ['Nguyễn Thị Minh Khai', ...d.streetsZ, 'Bến Chương Dương', 'Trần Hưng Đạo'];
fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
console.log(`Đã dời ${d.places.length} địa điểm +${OFF} khối; đường dọc: ${d.streetsX.length}, đường ngang: ${d.streetsZ.length}.`);
