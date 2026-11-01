// Lưu dữ liệu máy chủ vào 1 file JSON (tài khoản, tiến độ, giờ thành phố). Đủ cho vài chục người.
// Ghi gộp (2 giây 1 lần) và ghi an toàn: viết ra file tạm rồi mới đổi tên → tắt máy giữa chừng không hỏng file.
import fs from 'node:fs';
import path from 'node:path';

export function fileStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    data = {};
  }
  let timer = null;
  const flush = () => {
    timer = null;
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  };
  return {
    data,
    dirty() {
      if (!timer) timer = setTimeout(flush, 2000);
    },
    // sao lưu file hiện tại (trước khi xóa trắng dữ liệu): city.json → city.<tag>.json
    backup(tag) {
      try { fs.copyFileSync(file, file.replace(/\.json$/, `.${tag}.json`)); } catch { /* chưa có file */ }
    },
    flushNow() {
      if (timer) clearTimeout(timer);
      flush();
    },
  };
}
