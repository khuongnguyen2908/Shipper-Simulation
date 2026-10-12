// Màn hình toàn cảnh: màn hình chính (menu), tạm dừng, kết thúc. Chữ lấy từ kho chữ screen.* / menu.* / intro.* / settings.*
// Màn hình chính: menu cột trái (Tiếp tục · Chơi mới · Hướng dẫn · Cài đặt), thành phố 3D chạy phía sau.
// Chơi mới: (có bản lưu thì hỏi lại) → đặt tên + chọn nam/nữ → giới thiệu game 5 trang → vào game.
// Hướng dẫn dùng lại đúng 5 trang giới thiệu.
import { fmtK } from '../sim/economy.js';
import { APP } from '../data/apps.js';
import { fmt } from '../content/index.js';
import { ECONOMY } from '../data/balance.js';
import { NAME_MAX, normProfile } from '../sim/GameState.js';
import { HAIR_STYLES, HAIR_COLORS, PLAYER_SKINS, profileLook } from '../sim/people.js';
import { createAvatar } from './avatar.js';
import { DEFAULTS, SENS_RANGE, normSettings } from '../settings.js';

const INTRO = ['p1', 'p2', 'p3', 'p4', 'p5']; // trang giới thiệu: intro.pN.icon / .title / .body
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Screens {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'screen';
    this.el.className = 'hidden';
    root.appendChild(this.el);
    this.open = false;
    this.keyHandler = null; // phím riêng của màn hình đang mở (← → Enter Esc)
    window.addEventListener('keydown', (e) => {
      if (this.open && this.keyHandler) this.keyHandler(e);
    });
  }

  render(html, bind) {
    this.open = true;
    this.keyHandler = null;
    this.el.className = '';
    this.el.innerHTML = `<div class="sc-box">${html}</div>`;
    bind && bind(this.el);
  }

  hide() {
    this.open = false;
    this.keyHandler = null;
    this.avatar?.stop(); // dừng vòng vẽ hình xem trước nhân vật
    this.el.className = 'hidden';
    this.el.innerHTML = '';
  }

  // ======================== MÀN HÌNH CHÍNH ========================
  // save: tóm tắt bản lưu { name, day, time, money, rating, rentPaid, rent, dueDay, bike } hoặc null
  // settings + onSettings(s): cài đặt hiện tại, gọi lại mỗi lần đổi · onNew(profile) · onContinue()
  // view: mở thẳng vào 'new' (vd từ màn hình thua)
  title({ save, webgl2, settings, onNew, onContinue, onSettings, view = 'menu' }) {
    this.t = { save, webgl2, settings: normSettings(settings), onNew, onContinue, onSettings, profile: { name: '', gender: 'm' }, page: 0, mode: 'intro' };
    this.open = true;
    this.el.className = 'mm-mode';
    this.showView(view === 'new' ? 'profile' : view);
  }

  showView(view) {
    const t = this.t;
    t.view = view;
    const btn = (act, label, cls = '') => `<button class="mm-btn${cls}" data-mm="${act}">${label}</button>`;
    const s = t.save;
    const cont = s
      ? `<button class="mm-btn mm-cont" data-mm="continue"><b>${fmt('menu.continue')}</b>
        <small>${fmt('menu.continueInfo', { name: esc(s.name), day: s.day, time: s.time, money: fmtK(s.money), rating: s.rating.toFixed(2) })}</small>
        <small>${s.rentPaid ? fmt('menu.continueRentPaid') : fmt('menu.continueRent', { rent: s.rent, due: s.dueDay, hour: ECONOMY.rentDueHour ?? 22 })}</small>
        <small>${fmt('menu.continueBike', { bike: esc(s.bike) })}</small></button>`
      : '';
    const menu = `<nav class="mm">
      <div class="logo">${fmt('screen.logo')}</div><div class="sub">${fmt('screen.sub')}</div>
      ${cont}
      ${btn('new', fmt('menu.new'), s ? '' : ' primary')}${btn('help', fmt('menu.help'))}${btn('settings', fmt('menu.settings'))}
      ${t.webgl2 ? '' : `<div class="warn">${fmt('screen.noWebgl')}</div>`}
      <div class="credit">${fmt('screen.credit')}</div></nav>`;
    const panel = view === 'confirm' ? this.confirmHtml() : view === 'profile' ? this.profileHtml() : view === 'intro' ? this.introHtml() : view === 'settings' ? settingsHtml(t.settings) : '';
    this.el.innerHTML = `${menu}<div class="mm-stage">${panel ? `<div class="mm-panel">${panel}</div>` : ''}</div>`;
    this.el.classList.toggle('mm-sub', !!panel); // màn hình hẹp: đang mở bảng phụ thì ẩn menu
    this.bindTitle();
  }

  // Có bản lưu → hỏi lại trước khi chơi mới (bản lưu sẽ bị ghi đè)
  confirmHtml() {
    const s = this.t.save;
    return `<h2>${fmt('menu.confirmTitle')}</h2><p class="story">${fmt('menu.confirmText', { name: esc(s.name), day: s.day, time: s.time })}</p>
      <div class="row"><button class="btn big" data-mm="menu">${fmt('menu.cancel')}</button><button class="btn big danger" data-mm="profile">${fmt('menu.confirmOk')}</button></div>`;
  }

  // Tạo nhân vật: tên, nam / nữ, kiểu tóc, màu tóc, màu da + hình 3D xoay xem trước
  profileHtml() {
    const p = this.t.profile, n = normProfile(p); // n: giá trị đang dùng (chưa chọn → mặc định theo giới tính)
    const g = (v, key) => `<button class="mm-gender${p.gender === v ? ' on' : ''}" data-gender="${v}">${fmt(key)}</button>`;
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');
    const styles = HAIR_STYLES.map((s) => `<button class="mm-chip${n.hairStyle === s ? ' on' : ''}" data-hairstyle="${s}">${fmt(`hair.${s}`)}</button>`).join('');
    const swatch = (attr, list, cur) => list.map((c) => `<button class="mm-swatch${cur === c ? ' on' : ''}" data-${attr}="${c}" style="background:${hex(c)}" title="${hex(c)}"></button>`).join('');
    return `<h2>${fmt('menu.profileTitle')}</h2>
      <div class="mm-create"><div class="mm-create-form">
      <label class="mm-field"><span>${fmt('menu.profileName')}</span><input type="text" id="mmName" maxlength="${NAME_MAX}" value="${esc(p.name)}" placeholder="${esc(fmt('profile.defaultName'))}" autocomplete="off"></label>
      <small class="mm-note">${fmt('menu.profileNote', { name: esc(fmt('profile.defaultName')) })}</small>
      <div class="mm-field"><span>${fmt('menu.profileGender')}</span><div class="mm-genders">${g('m', 'menu.male')}${g('f', 'menu.female')}</div></div>
      <div class="mm-field"><span>${fmt('menu.profileHair')}</span><div class="mm-chips">${styles}</div></div>
      <div class="mm-field"><span>${fmt('menu.profileHairColor')}</span><div class="mm-swatches">${swatch('hair', HAIR_COLORS, n.hair)}</div></div>
      <div class="mm-field"><span>${fmt('menu.profileSkin')}</span><div class="mm-swatches">${swatch('skin', PLAYER_SKINS, n.skin)}</div></div>
      </div><div class="mm-avatar" id="mmAvatar"></div></div>
      <div class="row"><button class="btn big" data-mm="${this.t.save ? 'confirm' : 'menu'}">${fmt('menu.prev')}</button><button class="btn big primary" data-mm="toIntro">${fmt('menu.next')}</button></div>`;
  }
  // hình xem trước nhân vật (một bộ vẽ dùng lại; chỉ chạy khi đang ở bước tạo nhân vật)
  showAvatar() {
    const box = this.el.querySelector('#mmAvatar');
    if (!box) return this.avatar?.stop();
    this.avatar ??= createAvatar();
    box.appendChild(this.avatar.el);
    this.avatar.show({ shirt: 0x5dade2, pants: 0x34495e, ...profileLook(normProfile(this.t.profile)) });
    this.avatar.start();
  }

  // Giới thiệu game (Chơi mới) / Hướng dẫn: 5 trang, ← → chuyển trang
  introHtml() {
    const t = this.t, i = t.page, last = i === INTRO.length - 1, id = INTRO[i];
    const name = t.mode === 'intro' ? (t.profile.name || fmt('profile.defaultName')) : t.save?.name || fmt('profile.defaultName');
    const p = { name: esc(name), money: ECONOMY.startMoney, rent: ECONOMY.rentBase, every: ECONOMY.rentEveryDays, hour: ECONOMY.rentDueHour ?? 22, late: ECONOMY.maxLate, limit: Number(APP.account.lockBelow).toFixed(1), oilKm: ECONOMY.oilIntervalKm ?? 180 };
    const dots = INTRO.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('');
    const playing = t.mode === 'intro';
    return `<div class="mm-steps">${dots}</div>
      <div class="mm-ic">${fmt(`intro.${id}.icon`)}</div><h2>${fmt(`intro.${id}.title`, p)}</h2>
      <div class="story mm-body">${fmt(`intro.${id}.body`, p)}</div>
      <div class="row mm-nav"><button class="btn" data-mm="${playing ? 'play' : 'menu'}">${fmt(playing ? 'menu.skip' : 'menu.close')}</button>
        <span class="mm-page">${fmt('menu.page', { n: i + 1, total: INTRO.length })}</span>
        ${i > 0 ? `<button class="btn" data-mm="prev">${fmt('menu.prev')}</button>` : ''}
        <button class="btn primary" data-mm="${last ? (playing ? 'play' : 'menu') : 'next'}">${last ? fmt(playing ? 'menu.play' : 'menu.done') : fmt('menu.next')}</button></div>
      <small class="mm-note">${fmt('menu.keysHint')}</small>`;
  }

  bindTitle() {
    const t = this.t, el = this.el;
    const name = () => el.querySelector('#mmName');
    const go = (act) => {
      if (name()) t.profile.name = name().value; // giữ tên đang gõ khi chuyển màn
      if (act === 'continue') return t.onContinue();
      if (act === 'new') return this.showView(t.save ? 'confirm' : 'profile');
      if (act === 'help') { t.mode = 'help'; t.page = 0; return this.showView('intro'); }
      if (act === 'toIntro') { t.mode = 'intro'; t.page = 0; return this.showView('intro'); }
      if (act === 'next') { t.page = Math.min(INTRO.length - 1, t.page + 1); return this.showView('intro'); }
      if (act === 'prev') { t.page = Math.max(0, t.page - 1); return this.showView('intro'); }
      if (act === 'play') return t.onNew({ ...t.profile });
      this.showView(act); // menu · confirm · profile · settings
    };
    el.querySelectorAll('[data-mm]').forEach((b) => b.addEventListener('click', () => go(b.dataset.mm)));
    el.querySelectorAll('[data-gender]').forEach((b) => b.addEventListener('click', () => { t.profile.gender = b.dataset.gender; go('profile'); }));
    el.querySelectorAll('[data-hairstyle]').forEach((b) => b.addEventListener('click', () => { t.profile.hairStyle = b.dataset.hairstyle; go('profile'); }));
    el.querySelectorAll('[data-hair]').forEach((b) => b.addEventListener('click', () => { t.profile.hair = Number(b.dataset.hair); go('profile'); }));
    el.querySelectorAll('[data-skin]').forEach((b) => b.addEventListener('click', () => { t.profile.skin = Number(b.dataset.skin); go('profile'); }));
    this.showAvatar();
    if (t.view === 'settings') bindSettings(el, t.settings, (s) => { t.settings = s; t.onSettings?.(s); }, () => this.showView('settings'));
    if (t.view === 'profile') { const n = name(); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
    // phím: ← → chuyển trang · Enter tiếp · Esc quay lại menu
    this.keyHandler = (e) => {
      const typing = e.target instanceof HTMLInputElement;
      if (e.key === 'Escape') { e.preventDefault(); return t.view !== 'menu' && go(t.view === 'profile' && t.save ? 'confirm' : 'menu'); }
      if (t.view === 'intro') {
        if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(t.page === INTRO.length - 1 ? (t.mode === 'intro' ? 'play' : 'menu') : 'next'); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); if (t.page > 0) go('prev'); }
      } else if (t.view === 'profile' && e.key === 'Enter') { e.preventDefault(); go('toIntro'); }
      else if (!typing && t.view === 'menu' && e.key === 'Enter' && t.save) go('continue');
    };
  }

  pause({ onResume, onRestart, onTitle, onMute, muted, settings, onSettings }) {
    this.render(
      `<div class="logo small">${fmt('screen.paused')}</div>
      <div class="row col"><button class="btn big primary" data-a="resume">${fmt('screen.resume')}</button>
      <button class="btn big" data-a="mute">${fmt(muted ? 'screen.soundOn' : 'screen.soundOff')}</button>
      <button class="btn big" data-a="settings">${fmt('screen.settings')}</button>
      <button class="btn big" data-a="restart">${fmt('screen.restartDay')}</button>
      <button class="btn big" data-a="title">${fmt('screen.toTitle')}</button></div>`,
      (el) => {
        el.querySelector('[data-a="resume"]').addEventListener('click', onResume);
        el.querySelector('[data-a="restart"]').addEventListener('click', onRestart);
        el.querySelector('[data-a="title"]').addEventListener('click', onTitle);
        el.querySelector('[data-a="mute"]').addEventListener('click', onMute);
        el.querySelector('[data-a="settings"]').addEventListener('click', () => this.pauseSettings({ settings, onSettings, back: () => this.pause({ onResume, onRestart, onTitle, onMute, muted: normSettings(settings).muted, settings, onSettings }) }));
      },
    );
  }

  // Cài đặt mở từ màn hình tạm dừng (‹ Quay lại về màn hình tạm dừng)
  pauseSettings({ settings, onSettings, back }) {
    let s = normSettings(settings);
    const draw = () => this.render(`${settingsHtml(s)}<div class="row"><button class="btn big" data-a="back">${fmt('menu.prev')}</button></div>`, (el) => {
      bindSettings(el, s, (n) => { s = n; Object.assign(settings, n); onSettings?.(n); }, draw);
      el.querySelector('[data-a="back"]').addEventListener('click', back); // (Esc: game tự chơi tiếp như ở màn hình tạm dừng)
    });
    draw();
  }

  // Thua (bị đuổi / khóa tài khoản): chơi lại từ lần lưu gần nhất, chơi lại từ đầu, về màn hình chính
  end({ outcome, gs, timeStr, save, onRetry, onNew, onTitle }) {
    const win = false;
    const st = gs.stats;
    const avg = st.stars.length ? (st.stars.reduce((a, b) => a + b, 0) / st.stars.length).toFixed(2) : '—';
    const income = Object.values(st.income).reduce((a, b) => a + b, 0);
    const expense = Object.values(st.expense).reduce((a, b) => a + b, 0);
    const w = gs.flags.wallet;
    const wallet = w === 5 ? fmt('screen.walletReturned') : w === -1 ? fmt('screen.walletKept') : w > 0 ? fmt('screen.walletHolding') : '—';
    const stat = (k, v) => `<div><span>${fmt(k)}</span><b>${v}</b></div>`;
    this.render(
      `<div class="logo ${win ? 'win' : 'lose'}">${fmt(win ? 'screen.win' : 'screen.lose')}</div>
      <p class="story">${outcome.reason}</p>
      <div class="stats">
        ${stat('screen.statEnd', timeStr)}
        ${stat('screen.statOrders', st.completed)}
        ${stat('screen.statStars', avg)}
        ${stat('screen.statRating', gs.rating.toFixed(2))}
        <div><span>${fmt('screen.statIncome')}</span><b class="plus">+${fmtK(income)}</b></div>
        <div><span>${fmt('screen.statExpense')}</span><b class="minus">−${fmtK(expense)}</b></div>
        ${stat('screen.statMoney', fmtK(gs.money))}
        ${stat('screen.statCrash', `${st.crashes} / ${st.fines}`)}
        ${stat('screen.statWallet', wallet)}
      </div>
      <div class="row">${save ? `<button class="btn big primary" data-a="retry">${fmt('screen.retrySave', save)}</button>` : ''}
      <button class="btn big ${save ? '' : 'primary'}" data-a="new">${fmt('screen.newGame')}</button><button class="btn big" data-a="title">${fmt('screen.mainMenu')}</button></div>`,
      (el) => {
        el.querySelector('[data-a="retry"]')?.addEventListener('click', onRetry);
        el.querySelector('[data-a="new"]').addEventListener('click', onNew);
        el.querySelector('[data-a="title"]').addEventListener('click', onTitle);
      },
    );
  }
}

// ======================== CÀI ĐẶT (dùng chung: màn hình chính + tạm dừng) ========================
function settingsHtml(s) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  return `<h2>${fmt('settings.title')}</h2>
    <label class="mm-field"><span>${fmt('settings.volume')} <b data-out="volume">${pct(s.volume)}</b></span><input type="range" data-set="volume" min="0" max="1" step="0.05" value="${s.volume}"></label>
    <label class="mm-check"><input type="checkbox" data-set="muted"${s.muted ? ' checked' : ''}> ${fmt('settings.muted')}</label>
    <label class="mm-field"><span>${fmt('settings.sens')} <b data-out="sens">×${s.sens.toFixed(1)}</b></span><input type="range" data-set="sens" min="${SENS_RANGE[0]}" max="${SENS_RANGE[1]}" step="0.1" value="${s.sens}"></label>
    <label class="mm-check"><input type="checkbox" data-set="invertY"${s.invertY ? ' checked' : ''}> ${fmt('settings.invert')}</label>
    <div class="mm-field"><span>${fmt('settings.quality')}</span><div class="mm-genders">
      <button class="mm-gender${s.quality === 'high' ? ' on' : ''}" data-quality="high">${fmt('settings.high')}</button>
      <button class="mm-gender${s.quality === 'low' ? ' on' : ''}" data-quality="low">${fmt('settings.low')}</button></div></div>
    <small class="mm-note">${fmt('settings.note')}</small>
    <div class="row"><button class="btn" data-reset="1">${fmt('settings.reset')}</button></div>`;
}

// Gắn sự kiện cho bảng cài đặt: đổi là áp dụng + lưu ngay (onChange); nút bấm đổi xong thì vẽ lại (redraw)
function bindSettings(el, s, onChange, redraw) {
  const set = (k, v, again = false) => {
    const n = normSettings({ ...s, [k]: v });
    Object.assign(s, n);
    onChange(n);
    if (again) redraw();
  };
  el.querySelectorAll('[data-set]').forEach((inp) => {
    const k = inp.dataset.set;
    inp.addEventListener(inp.type === 'range' ? 'input' : 'change', () => {
      set(k, inp.type === 'checkbox' ? inp.checked : Number(inp.value));
      const out = el.querySelector(`[data-out="${k}"]`);
      if (out) out.textContent = k === 'volume' ? `${Math.round(s.volume * 100)}%` : `×${s.sens.toFixed(1)}`;
    });
  });
  el.querySelectorAll('[data-quality]').forEach((b) => b.addEventListener('click', () => set('quality', b.dataset.quality, true)));
  el.querySelector('[data-reset]')?.addEventListener('click', () => {
    Object.assign(s, DEFAULTS);
    onChange(normSettings(DEFAULTS));
    redraw();
  });
}
