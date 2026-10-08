import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';

// Chỉ những file dữ liệu này được công cụ ?editor ghi đè
const EDITABLE = ['src/data/items.json', 'src/data/gear.json', 'src/data/goods.json', 'src/data/places.json', 'src/content/vi.json', 'src/data/apps.json', 'src/data/map.json', 'src/data/balance.json', 'src/data/editor.json'];

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
