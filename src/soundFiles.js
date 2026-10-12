// File âm thanh trong thư mục src/sounds/ → đường dẫn (khi build được gói thẳng vào dist/index.html).
// Tách riêng vì import.meta.glob chỉ chạy trong Vite (trình duyệt), không chạy trong bộ thử Node.
// import.meta.env chỉ có trong Vite → chạy trong Node (bộ thử) thì coi như chưa có file nào
const found = import.meta.env ? import.meta.glob('./sounds/*.{ogg,mp3,wav,m4a,OGG,MP3,WAV,M4A}', { eager: true, query: '?url', import: 'default' }) : {};
export const SOUND_URLS = Object.fromEntries(Object.entries(found).map(([p, url]) => [p.replace('./sounds/', ''), url]));
