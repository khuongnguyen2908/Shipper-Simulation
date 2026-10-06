// Màn hình toàn cảnh: tiêu đề, tạm dừng, kết thúc ngày. Chữ lấy từ kho chữ screen.*
import { fmtK } from '../sim/economy.js';
import { ECONOMY } from '../data/balance.js';
import { fmt } from '../content/index.js';

export class Screens {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'screen';
    this.el.className = 'hidden';
    root.appendChild(this.el);
    this.open = false;
  }

  render(html, bind) {
    this.open = true;
    this.el.className = '';
    this.el.innerHTML = `<div class="sc-box">${html}</div>`;
    bind && bind(this.el);
  }

  hide() {
    this.open = false;
    this.el.className = 'hidden';
    this.el.innerHTML = '';
  }

  title({ save, onNew, onContinue, webgl2 }) {
    this.render(
      `<div class="logo">${fmt('screen.logo')}</div>
      <div class="sub">${fmt('screen.sub')}</div>
      <p class="story">${fmt('screen.story')}</p>
      <div class="rules">
        <div>${fmt('screen.ruleWin')}</div>
        <div>${fmt('screen.ruleLose')}</div>
        <div>${fmt('screen.ruleItems')}</div>
      </div>
      <div class="keys">${fmt('screen.keys')}</div>
      ${webgl2 ? '' : `<div class="warn">${fmt('screen.noWebgl')}</div>`}
      <div class="row">${save ? `<button class="btn big primary" data-act="continue">${fmt('screen.continue', { day: save.day })}</button>` : ''}<button class="btn big ${save ? '' : 'primary'}" data-act="new">${fmt('screen.newGame')}</button></div>`,
      (el) => {
        el.querySelector('[data-act="new"]').addEventListener('click', onNew);
        const c = el.querySelector('[data-act="continue"]');
        if (c) c.addEventListener('click', onContinue);
      },
    );
  }

  pause({ onResume, onRestart, onTitle, onMute, muted }) {
    this.render(
      `<div class="logo small">${fmt('screen.paused')}</div>
      <div class="row col"><button class="btn big primary" data-a="resume">${fmt('screen.resume')}</button>
      <button class="btn big" data-a="mute">${fmt(muted ? 'screen.soundOn' : 'screen.soundOff')}</button>
      <button class="btn big" data-a="restart">${fmt('screen.restartDay')}</button>
      <button class="btn big" data-a="title">${fmt('screen.toTitle')}</button></div>`,
      (el) => {
        el.querySelector('[data-a="resume"]').addEventListener('click', onResume);
        el.querySelector('[data-a="restart"]').addEventListener('click', onRestart);
        el.querySelector('[data-a="title"]').addEventListener('click', onTitle);
        el.querySelector('[data-a="mute"]').addEventListener('click', onMute);
      },
    );
  }

  end({ outcome, gs, timeStr, onNext, onRetry, onTitle }) {
    const win = outcome.type === 'win';
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
      <div class="row">${win ? `<button class="btn big primary" data-a="next">${fmt('screen.nextDay', { day: gs.day + 1, rent: gs.rent + ECONOMY.rentPerDay })}</button>` : ''}
      <button class="btn big ${win ? '' : 'primary'}" data-a="retry">${fmt('screen.retryDay', { day: gs.day })}</button><button class="btn big" data-a="title">${fmt('screen.mainMenu')}</button></div>`,
      (el) => {
        const n = el.querySelector('[data-a="next"]');
        if (n) n.addEventListener('click', onNext);
        el.querySelector('[data-a="retry"]').addEventListener('click', onRetry);
        el.querySelector('[data-a="title"]').addEventListener('click', onTitle);
      },
    );
  }
}
