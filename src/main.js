// Điểm khởi động: ?editor → công cụ nội dung; còn lại → game
import './style.css';
import { Game } from './game.js';
import { fmt } from './content/index.js';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');

if (new URLSearchParams(location.search).has('editor')) {
  import('./devtools/editor/index.js').then((m) => m.startEditor(ui));
} else {
  // dữ liệu JSON vừa được lưu (từ ?editor hoặc sửa tay) → tải lại game để dùng dữ liệu mới
  if (import.meta.hot) import.meta.hot.on('shipper:data-changed', () => location.reload());
  try {
    new Game(canvas, ui);
  } catch (e) {
    console.error(e);
    ui.innerHTML = `<div id="screen"><div class="sc-box"><div class="logo lose">${fmt('screen.startError')}</div><p class="story">${fmt('screen.startErrorText', { error: e.message })}</p></div></div>`;
  }
}
