// =============================================================
// npm run nen-am-thanh — nén lại file âm thanh quá nặng trong src/sounds/ (giữ nguyên tên file → sounds.json không đổi)
// Game nhúng MỌI file trong src/sounds vào bản đăng, nên file càng nặng game càng lâu tải.
//   · nhạc / tiếng nền dài (> 20 giây): 112 kbps (2 kênh) · 80 kbps (1 kênh)
//   · tiếng ngắn: 96 kbps (2 kênh) · 64 kbps (1 kênh)
//   · chỉ nén file .mp3 / .wav từ 40 KB trở lên, và chỉ thay khi file mới nhẹ hơn (.wav đổi thành .mp3 cùng tên → sửa sounds.json)
// Cần ffmpeg (Windows: winget install Gyan.FFmpeg.Essentials). Không có ffmpeg thì báo rồi thôi.
// =============================================================
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIR = 'src/sounds';
const MIN = 40 * 1024;
const has = (cmd) => spawnSync(cmd, ['-version'], { encoding: 'utf8' }).status === 0;
const ff = ['ffmpeg', path.join(os.homedir(), 'AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe')].find(has);
const fp = ['ffprobe', path.join(os.homedir(), 'AppData/Local/Microsoft/WinGet/Links/ffprobe.exe')].find(has);
if (!ff || !fp) {
  console.log('⚠️ Chưa có ffmpeg → không nén. Cài: winget install Gyan.FFmpeg.Essentials (rồi mở lại cửa sổ lệnh).');
  process.exit(0);
}
const probe = (f) => {
  const r = spawnSync(fp, ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=channels', '-of', 'json', f], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout || '{}');
  return { dur: +j.format?.duration || 0, kbps: Math.round((+j.format?.bit_rate || 0) / 1000), ch: j.streams?.[0]?.channels || 2 };
};
const soundsJson = 'src/data/sounds.json';
let renamed = 0, saved = 0;
for (const name of fs.readdirSync(DIR)) {
  if (!/\.(mp3|wav)$/i.test(name)) continue;
  const file = path.join(DIR, name), size = fs.statSync(file).size;
  if (size < MIN) continue;
  const { dur, kbps, ch } = probe(file);
  const want = dur > 20 ? (ch >= 2 ? 112 : 80) : (ch >= 2 ? 96 : 64);
  if (/\.mp3$/i.test(name) && kbps && kbps <= want + 8) continue; // đã nén rồi
  const out = path.join(os.tmpdir(), `nen-${process.pid}.mp3`);
  const r = spawnSync(ff, ['-v', 'error', '-y', '-i', file, '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', `${want}k`, out]);
  if (r.status !== 0) { console.log(`❌ ${name}: không nén được`); continue; }
  const n = fs.statSync(out).size;
  if (n >= size) { fs.rmSync(out); continue; }
  const dest = name.replace(/\.wav$/i, '.mp3');
  fs.copyFileSync(out, path.join(DIR, dest));
  fs.rmSync(out);
  if (dest !== name) { // .wav → .mp3: đổi tên trong sounds.json, xóa file .wav
    const s = fs.readFileSync(soundsJson, 'utf8');
    fs.writeFileSync(soundsJson, s.split(`"${name}"`).join(`"${dest}"`));
    fs.rmSync(file);
    renamed++;
  }
  saved += size - n;
  console.log(`✔ ${name} ${Math.round(size / 1024)} KB → ${dest} ${Math.round(n / 1024)} KB (${want} kbps, ${ch} kênh, ${dur.toFixed(1)} giây)`);
}
console.log(saved ? `Xong: nhẹ bớt ${(saved / 1048576).toFixed(2)} MB${renamed ? ` · ${renamed} file .wav đổi thành .mp3` : ''}.` : 'Không có file nào cần nén.');
