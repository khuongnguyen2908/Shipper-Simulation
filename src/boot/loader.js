// =============================================================
// MÀN LOADING lúc mở game: logo nhà phát hành → loading lớn (phố thật trôi ngang + thanh tải) → menu.
// File này được chép thẳng vào index.html (vite.config.js · bootLoaderPlugin) nên hiện NGAY khi mở trang,
// trước khi tải code game. Chữ + danh sách logo / mẹo / ảnh phố nằm ở window.__LOADER (lấy từ vi.json khóa loading.*
// và src/data/loading.json lúc build).
// Phố trôi, bánh xe quay, khách gọi đều là hoạt ảnh CSS (transform / opacity) → trình duyệt tự chạy trên luồng vẽ riêng,
// lúc game đang dựng thành phố (bận vài giây) màn hình vẫn chạy mượt, chỉ thanh tải đứng chờ.
// Bản build: tự tải code game (window.__BOOT_ENTRY) để đo % thật. Chạy dev: Vite tự nạp code, % ước lượng.
// Code game (main.js) gọi window.__boot.start(dựngGame) → loader chọn lúc dựng game rồi tắt màn loading.
// window.__bootCover = true lúc màn loading còn che: game chỉ vẽ 1 khung (chuẩn bị đồ họa) rồi thôi, không vẽ phí phía sau.
// Chỉ để nhìn: mỗi máy tự vẽ, không gửi gì qua mạng.
// =============================================================
(() => {
  const C = window.__LOADER || { t: {}, logos: [], tips: [] };
  const T = (k) => (C.t[k] == null ? k : C.t[k]);
  const L = (k) => [].concat(C.t[k] || []);
  const entry = window.__BOOT_ENTRY; // { src, size } — chỉ có ở bản build
  const q = new URLSearchParams(location.search);
  const tool = q.has('editor') || q.has('relationship'); // công cụ nội dung: không cần màn loading
  let run = null; // hàm dựng game (main.js đưa vào)
  window.__boot = { start(fn) { if (tool || !root) return fn(); run = fn; } };
  const root = tool ? null : document.getElementById('boot');
  if (!root) {
    document.getElementById('boot')?.remove();
    if (entry) import(entry.src);
    return;
  }
  window.__bootCover = true;

  // ---------- dựng khung ----------
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const base = C.base || './loading/';
  const logos = h('div', 'bt-sec');
  const logoEls = (C.logos || []).map((l) => {
    const e = h('div', 'bt-logo');
    e.style.setProperty('--d', (C.logoSec || 2.4) + 's');
    if (l.img) { const im = h('img'); im.src = base + l.img; im.alt = T(l.text); e.append(im); }
    else e.append(h('b', '', esc(T(l.text))));
    logos.append(e);
    return e;
  });
  logos.append(h('div', 'bt-skip', esc(T('loading.skip'))));

  // xe máy dự phòng (khi chưa có ảnh chụp từ game): thân xe SVG + 2 bánh là thẻ riêng quay bằng CSS (quay trong SVG thì phải nhờ luồng chính → giật)
  const WHEEL = '<svg viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg"><circle cx="13" cy="13" r="13" fill="#15171c"/><circle cx="13" cy="13" r="6" fill="#9aa4b5"/><rect x="12" y="1" width="2" height="24" fill="#15171c"/></svg>';
  // có ảnh xe chụp từ game (nhiều khung, bánh quay dần) thì dùng ảnh đó, lật khung bằng CSS
  const R = C.rider;
  const moto = R?.img
    ? `<div class="bt-moto bt-real" style="aspect-ratio:${R.width}/${R.height}"><img src="${base}${R.img}" alt="" style="width:${R.frames * 100}%;animation-timing-function:steps(${R.frames})"></div>`
    : `<div class="bt-moto">${(C.moto || '').replace(/<g class="mt-wheel">.*?<\/g>/g, '')}<i class="bt-wheel" style="left:17.5%">${WHEEL}</i><i class="bt-wheel" style="left:67.5%">${WHEEL}</i></div>`;

  const main = h('div', 'bt-sec bt-main');
  const pano = C.pano;
  main.innerHTML = `<div class="bt-sky"><i class="bt-sun"></i><div class="bt-clouds"><i></i><i></i><i></i><i></i></div></div>
    <div class="bt-ground"></div>
    <div class="bt-pano"><div class="bt-strip"></div></div>
    <div class="bt-rider">${moto}<i class="bt-puff"></i><i class="bt-puff"></i><i class="bt-puff"></i></div>
    <div class="bt-title"><span>${esc(T('loading.title1'))}</span><span>${esc(T('loading.title2'))}</span><small>${esc(T('loading.subtitle'))}</small></div>
    <div class="bt-bar-wrap"><div class="bt-bar"><i></i></div><div class="bt-bar-txt"><span></span><span></span></div><div class="bt-tip"></div></div>`;
  root.append(logos, main);
  const $ = (s) => main.querySelector(s);
  const barEl = $('.bt-bar i'), [stepEl, pctEl] = main.querySelectorAll('.bt-bar-txt span'), tipEl = $('.bt-tip'), barWrap = $('.bt-bar-wrap');
  const tips = C.tips || [];
  if (tips.length) tipEl.textContent = T('loading.tipLabel') + ' ' + tips[Math.floor(Math.random() * tips.length)];
  const show = (sec) => { logos.classList.toggle('on', sec === logos); main.classList.toggle('on', sec === main); };

  // ---------- ảnh phố thật trôi ngang (2 bản nối đuôi, chạy hết 1 bản thì lặp) + khách gọi ----------
  // Tính 1 lần theo cỡ màn hình (đổi cỡ cửa sổ thì tính lại): độ dài 1 vòng, lúc từng bong bóng thoại hiện / tắt.
  const strip = $('.bt-strip'), panoBox = $('.bt-pano'), rider = $('.bt-rider');
  const CALLS = L('loading.calls');
  let keyStyle = null;
  function layoutPano() {
    if (!pano?.img) return;
    const H = panoBox.clientHeight, k = H / pano.height, Wd = pano.width * k;
    const speed = (pano.speed || 12) * (pano.pxPerM || 24) * k; // điểm ảnh / giây trên màn hình
    const P = Wd / speed; // giây cho 1 vòng
    // xe chạy trên làn gần của con đường trong ảnh (giữa mép dưới ảnh và tim đường)
    rider.style.bottom = `${(innerHeight - panoBox.getBoundingClientRect().bottom + (pano.height - pano.roadTop) * 0.12 * k).toFixed(1)}px`;
    const bikeX = innerWidth / 2, win = Math.min(innerWidth * 0.5, 620); // khách ở phía trước xe trong khoảng này thì gọi
    const wf = (win / Wd) * 100; // % của 1 vòng mà bong bóng hiện
    strip.style.width = `${2 * Wd}px`;
    strip.style.setProperty('--w', `${-Wd}px`);
    strip.style.animation = 'none';
    strip.innerHTML = `<img src="${base}${pano.img}" alt=""><img src="${base}${pano.img}" alt="">`;
    for (const im of strip.querySelectorAll('img')) im.style.width = `${Wd}px`;
    (pano.people || []).forEach((p, i) => {
      if (!CALLS.length) return;
      const px = p.x * k;
      const f = (((px - bikeX - win) / Wd) % 1 + 1) % 1; // lúc (phần của vòng) khách này lọt vào khoảng gọi
      const copy = px - f * Wd >= bikeX ? 0 : 1; // bản ảnh đang nằm đúng chỗ lúc đó
      const b = h('div', 'bt-say', esc(CALLS[i % CALLS.length]));
      b.style.left = `${px + copy * Wd}px`;
      b.style.top = `${p.y * k}px`;
      b.style.animationDuration = `${P}s`;
      b.style.animationDelay = `${f * P - P}s`; // âm: hoạt ảnh coi như đã chạy sẵn, đồng bộ với ảnh phố
      strip.append(b);
    });
    keyStyle?.remove();
    keyStyle = h('style', '', `@keyframes bt-say { 0% { opacity: 0; transform: translate(-50%, -100%) scale(0.6); } ${(wf * 0.06).toFixed(3)}%, ${(wf * 0.9).toFixed(3)}% { opacity: 1; transform: translate(-50%, -100%) scale(1); } ${wf.toFixed(3)}%, 100% { opacity: 0; transform: translate(-50%, -100%) scale(0.6); } }`);
    document.head.append(keyStyle);
    void strip.offsetWidth;
    strip.style.animation = `bt-scroll ${P}s linear infinite`;
  }
  let resizeT = 0;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(layoutPano, 200); });

  // ---------- tải code game (bản build): đếm byte đã nhận → % thật ----------
  let dl = 0, failed = false;
  const fail = (e) => {
    if (failed) return;
    failed = true;
    console.error(e);
    const box = h('div', 'bt-err', esc(T('loading.error')));
    const b = h('button', '', esc(T('loading.retry')));
    b.onclick = () => location.reload();
    box.append(b);
    barWrap.append(box);
  };
  if (entry) {
    (async () => {
      try {
        const r = await fetch(entry.src);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const total = entry.size || +r.headers.get('content-length') || 0;
        if (r.body && total) {
          const rd = r.body.getReader();
          let got = 0;
          for (;;) {
            const { done, value } = await rd.read();
            if (done) break;
            got += value.length;
            dl = Math.min(1, got / total);
          }
        } else await r.arrayBuffer();
        dl = 1;
        await import(entry.src); // vừa tải xong → trình duyệt lấy lại từ bộ nhớ đệm
      } catch (e) {
        fail(e);
      }
    })();
  }

  // ---------- thanh tải + trình tự ----------
  let mainAt = 0, lastAt = 0, shown = 0, built = false, building = false, closing = false, raf = 0;
  const STEP = { download: T('loading.step.download'), start: T('loading.step.start'), city: T('loading.step.city'), done: T('loading.step.done') };
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const sec = (now - mainAt) / 1000;
    // đích của thanh: tải code 0–80% (bản build đo thật · dev ước lượng) → dựng game 80–100%
    const loadPart = entry ? dl : run ? 1 : 1 - Math.exp(-sec / 1.5);
    const target = built ? 1 : building ? 0.9 : 0.8 * loadPart;
    const dt = Math.min(0.25, (now - (lastAt || now)) / 1000);
    lastAt = now;
    shown += (target - shown) * Math.min(1, dt * 8); // đuổi theo đích mượt, không phụ thuộc số khung hình / giây
    if (target - shown < 0.004) shown = target;
    barEl.style.transform = `scaleX(${shown.toFixed(4)})`;
    pctEl.textContent = Math.floor(shown * 100) + '%';
    stepEl.textContent = built ? STEP.done : building ? STEP.city : run ? STEP.start : STEP.download;
    if (failed) return;
    // code game đã nạp → dựng thành phố (việc nặng, chặn luồng chính vài giây — phố vẫn trôi vì là hoạt ảnh CSS)
    if (run && !building && shown > 0.78) { building = true; return; }
    if (building && !built) {
      built = true;
      try { run(); } catch (e) { console.error(e); }
      return;
    }
    if (built && !closing && shown >= 0.999 && sec >= (C.bootMinSec || 2)) {
      closing = true;
      window.__bootCover = false; // game vẽ lại bình thường → màn hình chính có hình trước khi màn loading mờ đi
      requestAnimationFrame(() => requestAnimationFrame(() => {
        root.classList.add('out');
        setTimeout(() => { cancelAnimationFrame(raf); keyStyle?.remove(); root.remove(); delete window.__LOADER; }, 650);
      }));
    }
  };
  const startMain = () => {
    show(main);
    layoutPano();
    mainAt = performance.now();
    raf = requestAnimationFrame(frame);
  };

  // logo lần lượt (bấm chuột / phím bất kỳ để bỏ qua) → loading lớn
  let li = 0, logoTimer = 0, done = false;
  const nextLogo = () => {
    if (done) return;
    logoEls.forEach((e) => e.classList.remove('show'));
    if (li >= logoEls.length) return endLogos();
    void logoEls[li].offsetWidth;
    logoEls[li++].classList.add('show');
    logoTimer = setTimeout(nextLogo, (C.logoSec || 2.4) * 1000);
  };
  const skip = (e) => { if (e.type === 'keydown' && e.repeat) return; endLogos(); };
  const endLogos = () => {
    if (done) return;
    done = true;
    clearTimeout(logoTimer);
    removeEventListener('keydown', skip, true);
    removeEventListener('pointerdown', skip, true);
    startMain();
  };
  if (!logoEls.length) startMain();
  else {
    show(logos);
    addEventListener('keydown', skip, true);
    addEventListener('pointerdown', skip, true);
    nextLogo();
  }
})();
