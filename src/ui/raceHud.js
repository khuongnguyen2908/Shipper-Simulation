// =============================================================
// GIAO DIỆN MÀN ĐUA (chương 6) — theo phác thảo sketches/chuong6/race-hud.png (bỏ thanh đường chạy theo ý chủ game):
// số lần té xe (góc trái trên) · khoảng cách bọn rượt (góc phải) · đồng hồ tốc độ (góc trái dưới) · nút bấm nhanh (giữa).
// Mọi chữ qua fmt().
// =============================================================
import { fmt } from '../content/index.js';
import { RACE } from '../sim/race.js';

export class RaceHud {
  constructor(root = document.body) {
    const el = (this.el = document.createElement('div'));
    el.id = 'raceHud';
    el.className = 'rh hidden';
    el.innerHTML = `
      <div class="rh-crash rh-panel"><div>${fmt('hud.race.crash')} <span class="pips"></span></div><small>${fmt('hud.race.crashMax', { n: RACE.crashMax })}</small></div>
      <div class="rh-gap rh-panel"><div class="gtxt"></div><div class="gauge"><i></i></div><small>${fmt('hud.race.gapHint', { t: RACE.caughtTime })}</small></div>
      <div class="rh-speed"><b>0</b><small>${fmt('hud.race.kmh')}</small></div>
      <div class="rh-qte"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="bg"/><circle cx="50" cy="50" r="44" class="ring"/></svg><b class="key"></b><span class="txt"></span></div>
      <div class="rh-flash"></div>`;
    root.append(el);
    const q = (s) => el.querySelector(s);
    this.$ = { pips: q('.pips'), gtxt: q('.gtxt'), mark: q('.gauge i'), speed: q('.rh-speed b'), qte: q('.rh-qte'), ring: q('.rh-qte .ring'), key: q('.rh-qte .key'), txt: q('.rh-qte .txt'), flash: q('.rh-flash') };
  }
  show(on) { this.el.className = `rh${on ? '' : ' hidden'}`; }
  // d: { crashes, max, gap (m), caught (0..1), kmh }
  update(d) {
    const $ = this.$;
    if ($.pips.childElementCount !== d.max) $.pips.innerHTML = '<i></i>'.repeat(d.max);
    [...$.pips.children].forEach((e, i) => e.classList.toggle('on', i < d.crashes));
    const m = Number.isFinite(d.gap) ? Math.max(0, Math.round(d.gap)) : null;
    $.gtxt.innerHTML = m == null ? fmt('hud.race.gapFree') : fmt('hud.race.gap', { m });
    // vạch: 0 m (trái, đỏ) → 60 m (phải, xanh)
    $.mark.style.left = `${m == null ? 100 : Math.min(100, (m / 60) * 100)}%`;
    this.el.classList.toggle('danger', d.caught > 0.05);
    $.speed.textContent = String(Math.round(d.kmh));
  }
  // q: { key: 'KeyA' | 'KeyD' | 'Space', k (1 → 0) } | null
  qte(q) {
    const $ = this.$;
    $.qte.classList.toggle('on', !!q);
    if (!q) return;
    $.key.textContent = q.key === 'Space' ? '␣' : q.key.slice(3);
    $.txt.textContent = fmt(`hud.race.qte.${q.key}`);
    $.ring.style.strokeDashoffset = String(276.5 * (1 - Math.max(0, Math.min(1, q.k))));
  }
  flash() {
    const e = this.$.flash;
    e.classList.remove('on');
    void e.offsetWidth;
    e.classList.add('on');
  }
}
