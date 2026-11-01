// =============================================================
// MÁY CHỦ THÀNH PHỐ CHUNG — chạy: npm run server   (cổng 8787, đổi bằng biến PORT)
// Trình duyệt nối vào bằng WebSocket (ws://máy:8787). Địa chỉ /status trả tình trạng (màn vào Online đọc).
// Dữ liệu (tài khoản, tiến độ) lưu ở server/data/city.json — xóa file này = xóa trắng thành phố.
// =============================================================
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { fileStore } from './store.js';
import { NET } from '../src/net/protocol.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || NET.port;
const store = fileStore(process.env.CITY_FILE || path.join(here, 'data', 'city.json'));
const time = () => new Date().toLocaleTimeString('vi-VN');
const room = new Room({ store, log: (s) => console.log(`[${time()}] ${s}`) });

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // game chạy ở GitHub Pages / localhost:5173 hỏi tình trạng được
  if (req.url?.startsWith('/status')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(room.status()));
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Máy chủ Shipper Simulation đang chạy. Mở game → 🌐 Online để vào thành phố.');
});

const wss = new WebSocketServer({ server, maxPayload: 512 * 1024 });
wss.on('connection', (ws) => {
  const conn = {
    send: (o) => ws.readyState === 1 && ws.send(JSON.stringify(o)),
    close: () => ws.close(),
    buffered: () => ws.bufferedAmount,
  };
  room.connect(conn);
  ws.on('message', (buf) => {
    let msg = null;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return; // gói hỏng: bỏ qua
    }
    room.message(conn, msg);
  });
  ws.on('close', () => room.disconnect(conn));
  ws.on('error', () => room.disconnect(conn));
});

setInterval(() => room.tick(), 1000 / NET.posHz);
// tắt máy chủ (Ctrl+C): ghi dữ liệu ngay
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { store.flushNow(); process.exit(0); });

server.listen(PORT, () => {
  const w = room.world;
  console.log(`Máy chủ thành phố chung đang chạy: ws://localhost:${PORT}  (tình trạng: http://localhost:${PORT}/status)`);
  console.log(`Seed thành phố ${w.seed} · tối đa ${room.max} người · Ctrl+C để tắt`);
});
