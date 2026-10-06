// =============================================================
// npm run dang  — đăng bản cập nhật game lên GitHub trong 1 lệnh:
//   1) chạy bộ thử (lỗi thì dừng, không đăng)
//   2) gom mọi thay đổi (kể cả dữ liệu sửa bằng ?editor) thành 1 commit
//   3) đẩy lên GitHub → GitHub Actions tự build và cập nhật link game sau 1–2 phút
// Ghi chú cho lần đăng (không bắt buộc):  npm run dang -- "thêm 2 món cơm tấm"
// =============================================================
import { spawnSync } from 'node:child_process';

// Trên Windows chỉ 'npm' (npm.cmd) cần chạy qua shell; git chạy thẳng để ghi chú có dấu cách không bị cắt
const useShell = (cmd) => process.platform === 'win32' && cmd === 'npm';
const run = (cmd, args, opts = {}) =>
  useShell(cmd) ? spawnSync([cmd, ...args].join(' '), { stdio: 'inherit', shell: true, ...opts }) : spawnSync(cmd, args, { stdio: 'inherit', ...opts });
const out = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', shell: useShell(cmd) }).stdout?.trim() ?? '';
const stop = (msg) => {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
};

if (out('git', ['rev-parse', '--is-inside-work-tree']) !== 'true') stop('Thư mục này chưa phải repo git.');
const remote = out('git', ['remote', 'get-url', 'origin']);
if (!remote) stop('Chưa nối với GitHub (thiếu remote "origin"). Tạo repo trên GitHub rồi chạy:\n   git remote add origin https://github.com/<tên-bạn>/<tên-repo>.git');

console.log('🧪 Chạy bộ thử…');
if (run('npm', ['test']).status !== 0) stop('Bộ thử báo lỗi → KHÔNG đăng. Sửa lỗi (hoặc xem danh sách lỗi trong ?editor) rồi chạy lại.');

run('git', ['add', '-A']);
const changed = out('git', ['status', '--porcelain']);
if (changed) {
  const note = process.argv.slice(2).join(' ').trim();
  const stamp = new Date().toLocaleString('vi-VN', { hour12: false });
  const files = changed.split('\n').map((l) => l.slice(3)).join(', ');
  console.log(`\n📦 Thay đổi: ${files}`);
  if (run('git', ['commit', '-q', '-m', note ? `${note} (${stamp})` : `Cập nhật game ${stamp}`]).status !== 0) stop('Commit thất bại.');
} else {
  console.log('\nℹ️  Không có thay đổi mới — chỉ đẩy các commit chưa đẩy (nếu có).');
}

console.log(`\n🚀 Đẩy lên ${remote} …`);
if (run('git', ['push', '-u', 'origin', 'main']).status !== 0) stop('Đẩy lên GitHub thất bại (mạng hoặc chưa đăng nhập).');

const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
console.log('\n✅ Đã đẩy lên GitHub. Game tự cập nhật sau khoảng 1–2 phút.');
if (m) {
  console.log(`   Link chơi:  https://${m[1].toLowerCase()}.github.io/${m[2]}/`);
  console.log(`   Tiến độ:    https://github.com/${m[1]}/${m[2]}/actions`);
}
