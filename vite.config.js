import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Chỉ những file dữ liệu này được công cụ ?editor ghi đè
const EDITABLE = ['src/data/items.json', 'src/data/gear.json', 'src/data/goods.json', 'src/data/places.json', 'src/content/vi.json', 'src/data/apps.json', 'src/data/map.json', 'src/data/balance.json', 'src/data/editor.json', 'src/data/phone.json', 'src/data/sounds.json', 'src/data/story.json', 'src/data/relations.json', 'src/data/loading.json'];
// File âm thanh: editor tải lên vào thư mục này (thẻ 🔊 Âm thanh)
const SOUND_DIR = 'src/sounds';
const SOUND_NAME = /^[a-z0-9_\-.]+\.(ogg|mp3|wav|m4a)$/i;
// Ảnh màn loading (logo nhà phát hành, ảnh đi kèm mẹo): public/loading/ → bản build chép nguyên sang dist/loading/
const LOADING_DIR = 'public/loading';
const IMG_NAME = /^[a-z0-9_\-.]+\.(png|jpe?g|webp|svg)$/i;
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
      const w = editorWrites.get(f);
      const fromEditor = !!w && Date.now() - w.at < 3000;
      // source: công cụ vừa ghi ('editor' | 'relationship') → công cụ còn lại tự cập nhật file đó
      server.ws.send({ type: 'custom', event: 'shipper:data-changed', data: { file: rel, fromEditor, source: fromEditor ? w.source : null } });
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
      // danh sách ảnh màn loading đang có (thẻ ⏳ Loading của editor)
      server.middlewares.use('/__editor/loading-images', (req, res) => {
        const dir = path.resolve(server.config.root, LOADING_DIR);
        const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => IMG_NAME.test(f)).sort() : [];
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
      // đọc bản mới nhất của 1 file dữ liệu trên đĩa (công cụ /?relationship gộp thay đổi vào bản mới nhất trước khi ghi, không đè chỗ ?editor vừa lưu)
      server.middlewares.use('/__editor/read', (req, res) => {
        const rel = new URL(req.url, 'http://x').searchParams.get('path') || '';
        res.setHeader('Content-Type', 'application/json');
        if (!EDITABLE.includes(rel)) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ ok: false, error: `Không được đọc file: ${rel}` }));
        }
        res.end(JSON.stringify({ ok: true, content: fs.readFileSync(path.resolve(server.config.root, rel), 'utf8') }));
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
            const { files, source = 'editor' } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const written = [];
            for (const f of files) {
              if (!EDITABLE.includes(f.path)) throw new Error(`Không được ghi file: ${f.path}`);
              JSON.parse(f.content); // phải là JSON hợp lệ
              const abs = path.resolve(server.config.root, f.path);
              editorWrites.set(norm(abs), { at: Date.now(), source });
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

// Màn loading (src/boot/): chép thẳng vào chỗ <!--boot--> của index.html để hiện NGAY khi mở trang, trước khi tải code game.
// Chữ lấy từ vi.json (khóa loading.*), danh sách logo / mẹo + số giây từ src/data/loading.json, hình xe từ src/boot/moto.svg.
// Bản build: bỏ thẻ <script> nạp code game, thay bằng window.__BOOT_ENTRY = { src, size } → loader tự tải để đo % thật rồi mới chạy.
function bootLoaderPlugin() {
  const read = (f) => fs.readFileSync(path.resolve(f), 'utf8');
  const BOOT_FILES = ['src/boot/loader.js', 'src/boot/loader.css', 'src/boot/moto.svg'];
  const inject = (html) => {
    const vi = JSON.parse(read('src/content/vi.json'));
    const cfg = JSON.parse(read('src/data/loading.json'));
    const t = Object.fromEntries(Object.entries(vi).filter(([k]) => k.startsWith('loading.')));
    const data = {
      t,
      logos: cfg.logos || [],
      tips: (cfg.tips || []).map((x) => t[x.text]).filter(Boolean),
      logoSec: cfg.logoSec,
      bootMinSec: cfg.bootMinSec,
      pano: cfg.pano || null,
      rider: cfg.rider || null,
      base: './loading/',
      moto: read('src/boot/moto.svg').trim(),
    };
    const json = JSON.stringify(data).replace(/</g, '\\u003c'); // không để lọt "</script>" trong chữ
    const block = `<style>${read('src/boot/loader.css')}</style><div id="boot"></div><script>window.__LOADER = ${json};</script><script>${read('src/boot/loader.js')}</script>`;
    return html.replace('<!--boot-->', () => block);
  };
  return [
    {
      name: 'shipper-boot',
      transformIndexHtml: { order: 'pre', handler: inject },
      // sửa file màn loading khi chạy dev → tải lại trang
      configureServer(server) {
        server.watcher.add(BOOT_FILES.map((f) => path.resolve(server.config.root, f)));
        server.watcher.on('change', (f) => {
          if (BOOT_FILES.some((b) => norm(path.resolve(server.config.root, b)) === norm(f))) server.ws.send({ type: 'full-reload' });
        });
      },
    },
    {
      name: 'shipper-boot-entry',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          const chunk = ctx.chunk;
          if (!chunk) return html;
          // thẻ <script type="module" … src="…/assets/index-xxx.js"> Vite vừa chèn
          const m = [...html.matchAll(/<script type="module"[^>]*\ssrc="([^"]+)"[^>]*><\/script>/g)].find((x) => x[1].endsWith(chunk.fileName));
          if (!m) throw new Error('Không thấy thẻ <script> nạp code game trong index.html');
          const size = Buffer.byteLength(ctx.bundle?.[chunk.fileName]?.code || chunk.code || '');
          return html.replace(m[0], () => `<script>window.__BOOT_ENTRY = ${JSON.stringify({ src: m[1], size })};</script>`);
        },
      },
    },
  ];
}

// Build ra dist/: index.html nhẹ (có sẵn màn loading) + assets/ (code game, có cả âm thanh) + loading/ (ảnh logo, ảnh mẹo).
// Cần mở qua máy chủ web (GitHub Pages / npm run preview) — bấm đúp file index.html không chạy được.
export default defineConfig({
  base: './',
  plugins: [editorSavePlugin(), bootLoaderPlugin()],
  build: { chunkSizeWarningLimit: 30000 }, // code game gồm cả âm thanh (~23 MB) — loader đo % khi tải
});
