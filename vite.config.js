import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';

// Chỉ những file dữ liệu này được công cụ ?editor ghi đè
const EDITABLE = ['src/data/items.json', 'src/data/gear.json', 'src/data/places.json', 'src/content/vi.json'];

// Plugin cho công cụ nội dung: POST /__editor/save ghi file JSON (chỉ khi chạy npm run dev)
function editorSavePlugin() {
  return {
    name: 'shipper-editor-save',
    apply: 'serve',
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
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { files } = JSON.parse(body);
            const written = [];
            for (const f of files) {
              if (!EDITABLE.includes(f.path)) throw new Error(`Không được ghi file: ${f.path}`);
              JSON.parse(f.content); // phải là JSON hợp lệ
              const abs = path.resolve(server.config.root, f.path);
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
