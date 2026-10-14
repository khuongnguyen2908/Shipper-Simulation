import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';

// Chỉ những file dữ liệu này được công cụ ?editor ghi đè
const EDITABLE = ['src/data/items.json', 'src/data/gear.json', 'src/data/goods.json', 'src/data/places.json', 'src/content/vi.json', 'src/data/apps.json', 'src/data/map.json', 'src/data/balance.json', 'src/data/editor.json', 'src/data/phone.json', 'src/data/sounds.json', 'src/data/story.json'];
// File âm thanh: editor tải lên vào thư mục này (thẻ 🔊 Âm thanh)
const SOUND_DIR = 'src/sounds';
const SOUND_NAME = /^[a-z0-9_\-.]+\.(ogg|mp3|wav|m4a)$/i;
// Kho tiếng để nghe thử (không gói vào game): editor chép file chọn được sang SOUND_DIR
const LIB_DIR = 'sound-library';
const LIB_PATH = /^[a-z0-9_\-./]+\.(ogg|mp3|wav|m4a)$/i;

const norm = (f) => path.resolve(f).toLowerCase();
// file → lúc editor vừa ghi. Để ngoài plugin: Vite có thể tạo plugin nhiều lần, phải dùng chung một bảng.
const editorWrites = new Map();

// Plugin cho công cụ nội dung: POST /__editor/save ghi file JSON (chỉ khi chạy npm run dev)
// File dữ liệu đổi → không tải lại kiểu mặc định (editor sẽ mất chỗ đang sửa), mà báo sự kiện
// 'shipper:data-changed': tab game tự tải lại, editor chỉ báo khi file bị sửa từ bên ngoài.
function editorSavePlugin() {
  return {
    name: 'shipper-editor-save',
    apply: 'serve',
    handleHotUpdate({ file, server }) {
      const f = norm(file);
      const rel = EDITABLE.find((p) => norm(path.resolve(server.config.root, p)) === f);
      if (!rel) return;
      const fromEditor = Date.now() - (editorWrites.get(f) || 0) < 3000;
      server.ws.send({ type: 'custom', event: 'shipper:data-changed', data: { file: rel, fromEditor } });
      return [];
    },
    configureServer(server) {
      server.middlewares.use('/__editor/ping', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, files: EDITABLE }));
      });
      // danh sách file âm thanh đang có
      server.middlewares.use('/__editor/sounds', (req, res) => {
        const dir = path.resolve(server.config.root, SOUND_DIR);
        const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => SOUND_NAME.test(f)).sort() : [];
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, files }));
      });
      // kho tiếng: mọi file trong sound-library (kể cả thư mục con) → ['kenney/ui-audio/click1.ogg', …]
      server.middlewares.use('/__editor/sound-library', (req, res) => {
        const dir = path.resolve(server.config.root, LIB_DIR);
        const walk = (d, pre) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : [])
          .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${pre}${e.name}/`) : LIB_PATH.test(pre + e.name) ? [pre + e.name] : []));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, files: walk(dir, '').sort() }));
      });
      // chép 1 file từ kho sang src/sounds: { path } → { name }. Đã có file trùng nội dung thì dùng lại, trùng tên khác nội dung thì thêm -2, -3…
      server.middlewares.use('/__editor/sound-import', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const rel = String(JSON.parse(Buffer.concat(chunks).toString('utf8')).path || '');
            if (!LIB_PATH.test(rel) || rel.split('/').includes('..')) throw new Error('Đường dẫn không hợp lệ');
            const src = path.resolve(server.config.root, LIB_DIR, rel);
            if (!fs.existsSync(src)) throw new Error('Không thấy file trong kho');
            const buf = fs.readFileSync(src);
            const dir = path.resolve(server.config.root, SOUND_DIR);
            fs.mkdirSync(dir, { recursive: true });
            const name = path.basename(rel).toLowerCase();
            const dot = name.lastIndexOf('.');
            let out = name;
            for (let n = 2; fs.existsSync(path.join(dir, out)) && !fs.readFileSync(path.join(dir, out)).equals(buf); n++) out = `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
            if (!fs.existsSync(path.join(dir, out))) fs.writeFileSync(path.join(dir, out), buf);
            res.end(JSON.stringify({ ok: true, name: out }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
      });
      // tải file âm thanh lên: { name, data (base64) } → src/sounds/name (không ghi đè file đã có: thêm -2, -3…)
      server.middlewares.use('/__editor/sound-upload', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { name, data } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!SOUND_NAME.test(name || '')) throw new Error('Tên file không hợp lệ');
            const buf = Buffer.from(String(data || ''), 'base64');
            if (!buf.length || buf.length > 15 * 1024 * 1024) throw new Error('File rỗng hoặc quá 15 MB');
            const dir = path.resolve(server.config.root, SOUND_DIR);
            fs.mkdirSync(dir, { recursive: true });
            const dot = name.lastIndexOf('.');
            let out = name;
            for (let n = 2; fs.existsSync(path.join(dir, out)); n++) out = `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
            fs.writeFileSync(path.join(dir, out), buf);
            res.end(JSON.stringify({ ok: true, name: out }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
      });
      server.middlewares.use('/__editor/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('POST only');
        }
        // gom các mảnh dạng byte rồi mới đổi sang chữ: đổi từng mảnh riêng sẽ làm vỡ chữ có dấu nằm ở chỗ cắt mảnh (file lớn như vi.json)
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { files } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const written = [];
            for (const f of files) {
              if (!EDITABLE.includes(f.path)) throw new Error(`Không được ghi file: ${f.path}`);
              JSON.parse(f.content); // phải là JSON hợp lệ
              const abs = path.resolve(server.config.root, f.path);
              editorWrites.set(norm(abs), Date.now());
              fs.writeFileSync(abs, f.content.endsWith('\n') ? f.content : f.content + '\n', 'utf8');
              written.push(f.path);
            }
            res.end(JSON.stringify({ ok: true, written }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
      });
    },
  };
}

// Build ra MỘT file dist/index.html (gộp cả JS, CSS) → bấm đúp là chạy, không cần máy chủ
export default defineConfig({
  base: './',
  plugins: [editorSavePlugin(), viteSingleFile()],
  build: { chunkSizeWarningLimit: 2000 },
});
