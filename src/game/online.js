// =============================================================
// GAME — CHƠI ONLINE (thành phố chung). Phần của lớp Game (src/game.js): gắn vào Game.prototype (mixParts).
// this.online = null khi chơi Offline → mọi luật Offline giữ nguyên.
// Luật riêng Online:
//  - Giờ là của chung: lấy theo giờ máy chủ (src/net/protocol.js → worldMinAt), không tua được.
//    Việc tốn thời gian (chờ quán, nộp phạt, ngủ…) thành thanh tiến độ (this.busy), đồng hồ vẫn chạy.
//  - Ngày của riêng mình (gs.day) chỉ tăng khi mình đang online lúc thành phố qua 06:00 (~24 phút chơi = 1 ngày, như Offline).
//    Thoát game ở phòng trọ chỉ hồi sức như đi ngủ, KHÔNG cộng ngày (vào ra nhiều lần không làm tiền nhà tới nhanh). gs.dayShift = ngày thành phố − ngày của mình → tiền nhà tính theo số ngày đã chơi.
//  - Không có cốt truyện; mọi địa điểm mở sẵn (gs.online → progress). Tiến độ lưu trên máy chủ, không đè bản lưu Offline.
// =============================================================
import { NetClient, tokenFor, rememberToken, rememberServer } from '../net/client.js';
import { NET, worldMinAt, dist2d } from '../net/protocol.js';
import { RemotePlayers } from '../world/remotePlayers.js';
import { OnlineHud } from '../ui/onlineHud.js';
import { headOf } from '../ui/bubbles.js';
import { localTransport } from '../sim/chat.js';
import { dayOf } from '../sim/clock.js';
import { routeDist } from '../sim/cityLayout.js';
import { S } from '../sim/OrderManager.js';
import { STORY, freshStory } from '../sim/story.js';
import { startOutfit, GOODS } from '../data/goods.js';
import { ONLINE, TIME } from '../data/balance.js';
import { NORMAL, fmtTime } from './shared.js';
import { fmt } from '../content/index.js';
import * as act from '../interactions.js';

// Người mới vào Online: xe đạp, ít tiền, chưa vào hãng, không có cốt truyện (coi như đã xong hết chương).
// look: ngoại hình chọn ở màn tạo nhân vật (máy chủ giữ) — dáng, tóc, da + áo / quần / giày lúc đầu
function newCarry(name, look) {
  const { sleeves = 'short', legs = 'shorts', shoes = 'black', ...prof } = look || {};
  return {
    profile: { ...prof, name },
    outfit: startOutfit(GOODS, { sleeves, legs, shoes }),
    money: ONLINE.startMoney ?? 200,
    flags: { story: 2 },
    story: { ...freshStory(false), done: STORY.chapters.map((c) => c.id) },
  };
}

export class OnlinePart {
  // ---------- vào / ra ----------
  // Màn hình chính → 🌐 Online → Vào thành phố. Lỗi → ném { code } cho màn hình hiện chữ
  async onlineJoin({ url, name, profile = null }) {
    const net = new NetClient(url);
    const w = await net.connect({ token: tokenFor(url), name, ...(profile ? { profile } : {}) });
    rememberToken(url, w.token, w.name);
    rememberServer(url);
    this.onlineStart(net, w, url);
  }

  onlineStart(net, w, url) {
    if (this.online?.net !== net) this.onlineCleanup();
    const o = (this.online = { net, url, id: w.id, plate: w.plate, name: w.name, profile: w.profile, world: w.world, scope: 'all', sendT: 0, saveT: 0, infoKey: '', up: true, retryT: 0 });
    o.remotes = new RemotePlayers(this.scene, ONLINE);
    o.hud = this.onlineHud || (this.onlineHud = new OnlineHud(this.uiRoot));
    const now = this.worldNow();
    const sv = w.save;
    let carry, pday = 1, pos = null, away = 0;
    if (sv?.carry) {
      carry = sv.carry;
      pday = sv.pday || 1;
      away = Math.max(0, now - (sv.worldMin ?? now));
      if (!sv.home) pos = sv.pos;
    } else carry = newCarry(w.name, w.profile);
    carry.profile = { ...(carry.profile || {}), name: w.name };
    this.startGame({ clock: now, carry, seed: w.world.seed, pos, pday });
    const gs = this.gs;
    if (Number.isFinite(w.money)) gs.money = w.money; // ví do máy chủ giữ (M2c)
    // thời gian vắng mặt: ở phòng trọ = ngủ (hồi sức theo số phút vắng, tối đa 1 giấc) · ở ngoài = không tính là thức
    if (sv?.carry && away > 0) {
      if (sv.home) {
        const full = Math.min(away, (ONLINE.sleepToHours ?? 8) * 60);
        for (let m = 0; m < full; m += 10) gs.drain('sleep', Math.min(10, full - m), { harshSun: false, raining: false, outdoor: false, inJam: false, waiting: false, now });
        gs.wake(now);
      } else gs.awakeSince = Math.min(now, (gs.awakeSince ?? now) + away);
    }
    // chat: thay đường truyền nội bộ bằng máy chủ
    this.chatCh.me.id = w.id;
    this.chatCh.transport = { send: (m) => net.send('chat', { text: m.text, scope: o.scope }), onReceive: () => {} };
    this.chatBox.setScope({ get: () => this.online?.scope || 'all', set: (s) => { if (this.online) this.online.scope = s; } });
    for (const p of w.players) o.remotes.upsert(p);
    // nghe máy chủ (mỗi đường nối chỉ gắn 1 lần; bỏ qua nếu đã rời thành phố)
    const on = (t, f) => net.on(t, (m) => { if (this.online?.net === net) f(this.online, m); });
    on('pos', (O, m) => O.remotes.applyPos(m.p));
    on('join', (O, m) => O.remotes.upsert(m.p));
    on('info', (O, m) => O.remotes.upsert(m.p));
    on('leave', (O, m) => O.remotes.remove(m.id));
    on('chat', (O, m) => this.chatCh.receive({ kind: 'chat', from: m.from, name: m.name, text: m.text, time: fmtTime(m.wm), scope: m.scope }));
    on('sys', (O, m) => this.chatCh.local('sys', '', fmt(m.key, m.params || {})));
    on('down', (O) => { O.up = false; O.retryT = 2; this.hud.toast(fmt('online.toastDown'), 'warn', 5000); });
    on('welcome', (O, m) => this.onlineResync(m));
    on('err', (O, m) => { if (m.code === 'other') this.onlineKicked(); });
    // đơn chung (M2a)
    on('job', (O, m) => this.onlineJob(m));
    on('jobSeen', (O, m) => { if (this.om.offer?.jobId === m.id) this.om.offer.seen = m.n; });
    on('jobOk', (O, m) => { if (this.om.offer?.jobId === m.id && this.om.state === S.OFFERED) act.acceptOffer(this, true); });
    on('jobGone', (O, m) => this.onlineJobGone(m));
    on('jobPaid', (O, m) => this.onlineJobPaid(m));
    // số dư ví trên máy chủ: chỉ áp khi máy chủ đã nhận hết các khoản mình gửi (tránh nhảy số giữa chừng)
    on('money', (O, m) => {
      if (m.seq != null && m.seq !== O.txSeq) return;
      if (this.gs && Math.abs(this.gs.money - m.money) > 0.05) this.gs.money = m.money;
    });
    on('jobDeny', (O, m) => this.hud.toast(fmt(`online.denied.${m.why}`, { dist: m.dist ?? '' }), 'warn', 5000));
    on('board', (O, m) => { O.board = m; if (this.phone.open && this.phone.app === 'rank') this.phone.redraw(); });
    o.hud.show(true);
    this.chatCh.local('sys', '', fmt('online.sys.welcome', { name: w.name, plate: w.plate, n: w.players.length + 1 }));
    this.onlineSendInfo(true);
  }

  // nối lại sau khi rớt mạng: vẽ lại người khác theo danh sách mới
  onlineResync(w) {
    const o = this.online;
    if (!o) return;
    o.up = true;
    o.remotes.clear();
    for (const p of w.players) o.remotes.upsert(p);
    o.infoKey = '';
    for (const tx of (o.txQueue || []).splice(0)) o.net.send('tx', tx); // khoản thu / chi lúc rớt mạng
    if (o.pending) o.net.send('jobDone', o.pending.rep); // giao xong lúc rớt mạng
    this.hud.toast(fmt('online.toastUp'), 'good', 3000);
  }
  // cùng tài khoản vừa vào ở máy / tab khác
  onlineKicked() {
    if (!this.online) return;
    this.onlineCleanup(false);
    this.showTitle();
    this.modal.show({ title: fmt('online.kickTitle'), text: fmt('online.kickText'), choices: [{ label: fmt('dlg.ok'), primary: true }] });
  }
  // Rời thành phố (về màn hình chính): lưu rồi ngắt
  onlineLeave() {
    if (!this.online) return;
    this.onlineSave();
    this.onlineCleanup();
  }
  onlineCleanup(close = true) {
    const o = this.online;
    if (!o) return;
    if (close) o.net.close();
    o.remotes.clear();
    o.hud.show(false);
    this.busy = null;
    this.online = null;
    this.chatCh.me.id = 'me';
    this.chatCh.transport = localTransport();
    this.chatBox.setScope(null);
    this.chatBox.input.placeholder = fmt('chat.placeholder');
  }
  // Thua (bị đuổi / khóa tài khoản) → bắt đầu lại từ đầu, giữ tên + biển số
  onlineReset() {
    const o = this.online;
    if (!o) return this.showTitle();
    this.startGame({ clock: this.worldNow(), carry: newCarry(o.name, o.profile), seed: o.world.seed, pday: 1 });
    o.hud.show(true);
    o.infoKey = '';
  }

  // ---------- ĐƠN CHUNG (M2a): app xin đơn từ máy chủ, bấm nhận thì máy chủ khóa cho người bấm trước ----------
  // Gọi từ startGame khi đang Online (mỗi ván có OrderManager mới)
  onlineOrders() {
    // ví do máy chủ giữ (M2c): mỗi khoản thu / chi báo lên máy chủ (rớt mạng thì xếp hàng, nối lại gửi tiếp)
    const o = this.online;
    o.txSeq ??= 0;
    o.txQueue ??= [];
    this.gs.onTx = (kind, k, reason) => {
      const tx = { seq: ++o.txSeq, kind, k: Math.round(k * 10) / 10, reason };
      if (!o.up || !o.net.send('tx', tx)) o.txQueue.push(tx);
    };
    this.om.source = { request: (now, pos) => this.onlineJobReq(now, pos) };
    // bỏ qua / hết giờ mời → báo máy chủ (đơn vẫn còn cho người khác) · lấy hàng xong → máy chủ kiểm tra đứng ở quán ·
    // đơn kết thúc mà không giao (hủy, đem trả, khách lừa) → máy chủ bỏ đơn (không có tiền đơn)
    this.om.on((e) => {
      const net = this.online?.net, o = e.offer || e.order;
      if (!net || !o?.jobId) return;
      if ((e.type === 'declined' || e.type === 'offerExpired' || e.type === 'dismissed') && !o.lost) net.send('jobPass', { id: o.jobId });
      else if (e.type === 'accepted') o.allowedMin0 = o.allowedMin; // hạn lúc nhận (phần cộng thêm sau đó báo máy chủ)
      else if (e.type === 'pickedUp') net.send('jobStep', { id: o.jobId, step: 'picked' });
      else if (['cancelled', 'returned', 'robbed', 'scamRefused', 'scamCaught'].includes(e.type)) net.send('jobCancel', { id: o.jobId });
    });
  }
  onlineJobReq(now, pos) {
    const o = this.online, om = this.om, gs = this.gs;
    if (!o?.up) return void (om.asking = false, om.nextPingIn = 3); // đang rớt mạng: chờ nối lại
    o.askAt = performance.now();
    o.net.send('jobReq', { pos: { x: pos.x, z: pos.z }, food: om.wants('food'), ride: om.wants('ride') && !!gs.effect('passengerSeat'), money: gs.money });
  }
  // máy chủ trả đơn (hoặc chưa có): app mời đơn như thường; đang bận / đã tắt app thì trả lại cho người khác
  onlineJob(m) {
    const o = m.o ? { ...m.o, seen: m.seen || 0 } : null;
    if (o) o.d1 = routeDist(this.playerPos, o.pickup.door); // đơn chung có thể sinh theo vị trí người khác
    if (!this.om.receiveOffer(o, this.clockMin) && o) this.online.net.send('jobPass', { id: o.jobId });
  }
  // Bấm nhận (Y): gửi xin nhận, chờ máy chủ trả lời (đồng hồ thẻ đơn đứng lại; quá 6 giây không trả lời thì cho bấm lại)
  onlineTake() {
    const o = this.om.offer;
    if (!o || o.taking) return;
    o.taking = true;
    this.online.takeAt = performance.now();
    this.online.net.send('jobTake', { id: o.jobId });
  }
  // Đơn đang mời / đang xin nhận đã có người khác nhận: thẻ đơn tắt, hiện "Đơn đã có người nhận" 2,5 giây (không tính là bỏ qua)
  onlineJobGone(m) {
    const om = this.om;
    if (om.offer?.jobId !== m.id || om.state !== S.OFFERED) return;
    om.offer.lost = true;
    om.dismissOffer(this.clockMin);
    this.online.lost = { by: m.by || '', plate: m.plate || '', until: performance.now() + 2500 };
    this.hud.toast(m.by ? fmt('online.toastLost', { name: m.by }) : fmt('online.jobLostGone'), 'info', 3000);
  }
  // Giao xong (gọi thay cho gs.applyReceipt): Offline ghi ngay. Online (đơn chung): gửi báo cáo, chờ máy chủ tính tiền + sao rồi mới ghi + hiện hóa đơn
  settleReceipt(receipt, done) {
    const o = receipt.order;
    if (!this.online || !o.jobId) {
      this.gs.applyReceipt(receipt);
      return done();
    }
    const drop = o.dropoff?.door;
    const rep = { id: o.jobId, outcome: receipt.quit ? 'quit' : 'done', items: o.items.map((it) => Math.round(it.condition * 10) / 10), ext: Math.max(0, o.allowedMin - (o.allowedMin0 ?? o.allowedMin)), liters: o.liters, extraPenalty: o.extraPenalty || 0, km: o.distanceKm, drop: drop ? { x: drop.x, z: drop.z } : null, stars: receipt.ev.stars };
    this.online.pending = { rep, receipt, done, at: performance.now() };
    this.online.net.send('jobDone', rep);
    this.hud.toast(fmt('online.waitPay'), 'info', 2500);
  }
  // Máy chủ trả kết quả: thay tiền + sao trên hóa đơn bằng số của máy chủ rồi mới ghi vào ví / điểm
  onlineJobPaid(m) {
    const P = this.online?.pending;
    if (!P || P.rep.id !== m.id) return;
    this.online.pending = null;
    const r = P.receipt;
    if (m.ok) {
      r.pay = m.pay;
      r.ev = { ...r.ev, ...m.ev, reasons: r.ev.reasons }; // giữ lý do hư hỏng chi tiết của máy mình
      Object.assign(r, { noPay: m.noPay, bigTip: m.bigTip, earlyTip: m.earlyTip, elapsed: m.elapsed, server: true });
      r.order.allowedMin = m.allowedMin;
    } else {
      // máy chủ không ghi nhận (chưa tới quán / cửa khách): không có tiền, không chấm sao
      r.pay = { ...r.pay, walletCredit: 0, final: 0, tip: 0, cod: 0 };
      r.order = { ...r.order, viaApp: false };
      r.serverDenied = m.why || 'nojob';
      r.deniedDist = m.dist;
    }
    this.gs.applyReceipt(r);
    P.done();
  }
  // mạng chậm / mất gói: xin đơn hoặc xin nhận quá lâu không thấy trả lời → cho thử lại
  onlineJobWatch() {
    const o = this.online, om = this.om, t = performance.now();
    if (om.asking && t - (o.askAt || 0) > 6000) { om.asking = false; om.nextPingIn = 3; }
    if (om.offer?.taking && t - (o.takeAt || 0) > 6000) om.offer.taking = false;
    // giao xong mà chưa thấy máy chủ trả tiền: gửi lại báo cáo (máy chủ đã ghi rồi thì trả "nojob" → không cộng tiền 2 lần)
    if (o.pending && o.up && t - o.pending.at > 8000) { o.pending.at = t; o.net.send('jobDone', o.pending.rep); }
    // đang xem app Xếp hạng: hỏi máy chủ mỗi 5 giây
    if (this.phone.open && this.phone.app === 'rank' && o.up && t - (o.boardAt || 0) > 5000) { o.boardAt = t; o.net.send('board'); }
  }

  // ---------- giờ thành phố ----------
  worldNow() {
    const o = this.online;
    return o ? worldMinAt(o.net.serverNow(), o.world) : this.clockMin;
  }
  // Mỗi khung hình (simulate): đồng hồ = giờ thành phố; trả về số phút đã trôi để tính hao sức (tab bị ẩn lâu thì tính tối đa 1 phút)
  onlineClock() {
    const now = this.worldNow(), d = now - this.clockMin;
    this.clockMin = Math.max(this.clockMin, now);
    return Math.max(0, Math.min(1, d));
  }

  // ---------- việc tốn thời gian (thay cho tua giờ) ----------
  // Gọi từ advance() khi đang Online: min phút game = min giây thật. Ngủ / nằm nghỉ: rút ngắn (ONLINE.sleepRealSec cho 1 giấc đủ),
  // hồi sức nhân lên cho bằng ngủ thật. then(): chạy khi xong (bị kiệt sức giữa chừng / bấm dậy sớm thì vẫn gọi).
  onlineBusy(min, activity, opts, then) {
    const fast = activity === 'sleep' || activity === 'rest';
    const full = (ONLINE.sleepToHours ?? 8) * 60, realSec = ONLINE.sleepRealSec ?? 60;
    const dur = fast ? Math.max(1, ((realSec * min) / full) * TIME.gameMinPerRealSec) : Math.max(0.05, min);
    this.busy = { start: this.clockMin, end: this.clockMin + dur, dur, mul: fast ? min / dur : 1, activity, opts: opts || {}, then };
    this.phone.toggle(false);
    this.chatBox.close?.();
  }
  busyLabel(b) {
    if (b.opts.text) return b.opts.text;
    const key = b.opts.label || { sleep: 'online.busy.sleep', nap: 'online.busy.nap', rest: 'online.busy.rest', walk: 'online.busy.walk' }[b.activity] || 'online.busy.wait';
    return fmt(key);
  }
  // Mỗi khung hình: xong chưa (hết giờ · có đơn khi đang chợp mắt · bấm E dậy sớm)
  busyTick() {
    const b = this.busy;
    if (!b) return;
    const early = b.opts.stopOnOffer && this.om.state === S.OFFERED;
    const wake = (b.activity === 'sleep' || b.activity === 'nap') && this.input.was('KeyE');
    if (this.clockMin < b.end && !early && !wake) return;
    if (wake) this.input.pressed.delete('KeyE'); // phím E này dùng để dậy, không chạy thêm việc khác
    this.busy = null;
    b.then?.();
  }

  // ---------- gửi / nhận mỗi khung hình (cả lúc tạm dừng: thành phố không dừng) ----------
  onlineTick(dt) {
    const o = this.online;
    if (!o) return;
    if (this.state === 'play') o.remotes.update(dt, this.camera.position);
    // rớt mạng: thử nối lại mỗi 3 giây (game vẫn chơi tiếp ở máy mình)
    if (!o.up) {
      o.retryT -= dt;
      if (o.retryT <= 0 && !o.retrying) {
        o.retrying = true;
        o.net.connect(o.net.hello).then((w) => this.onlineResync(w)).catch(() => {}).finally(() => { o.retrying = false; o.retryT = 3; });
      }
    }
    if (this.state !== 'play' || !this.gs) return;
    this.onlineJobWatch();
    o.sendT -= dt;
    if (o.sendT <= 0 && o.up) {
      o.sendT = 1 / NET.sendHz;
      const onBike = this.mode === 'bike', body = onBike ? this.bike : this.walker, b = this.bike;
      const a = this.busy ? (this.busy.activity === 'sleep' || this.busy.activity === 'nap' ? 'sleep' : 'busy') : this.om.order ? 'deliver' : 'idle';
      o.net.send('st', { x: body.pos.x, z: body.pos.z, y: (onBike ? b.mesh : this.walker.mesh).position.y, h: body.heading, m: onBike ? 1 : 0, s: onBike ? b.speed : this.walker.speed || 0, bx: b.mesh.visible && !this.gs.towed ? b.pos.x : 0, bz: b.mesh.visible && !this.gs.towed ? b.pos.z : 0, bh: b.heading, a }, true);
      this.onlineSendInfo();
    }
    o.saveT += dt;
    if (o.saveT >= (ONLINE.saveEverySec ?? 20)) this.onlineSave();
    // giữ O: danh sách người online
    const whoOpen = !!this.input.state.who && !this.modal.open && !this.chatBox.typing;
    if (whoOpen || o.whoOpen) o.hud.setWho(whoOpen, whoOpen ? this.onlineRows() : [], { n: o.remotes.map.size + 1, max: ONLINE.maxPlayers ?? 10, time: fmtTime(this.clockMin), day: this.gs.day });
    o.whoOpen = whoOpen;
    o.hud.setNet({ up: o.up, n: o.remotes.map.size + 1, rtt: o.net.rtt });
    const b = this.busy;
    o.hud.setBusy(b && { label: this.busyLabel(b), left: Math.max(0, (b.end - this.clockMin) / TIME.gameMinPerRealSec), frac: (this.clockMin - b.start) / b.dur, sleep: b.activity === 'sleep' || b.activity === 'nap', sub: fmt(b.activity === 'sleep' || b.activity === 'rest' ? 'online.busySubSleep' : 'online.busySub', { min: Math.round(b.dur * (b.mul || 1)) }), key: b.activity === 'sleep' || b.activity === 'nap' ? fmt('online.busyWake') : '' });
  }
  // Thông tin ít đổi (ngoại hình, xe, hãng, sao): chỉ gửi khi đổi
  onlineSendInfo(force = false) {
    const o = this.online, gs = this.gs;
    if (!o || !gs) return;
    const spec = gs.vehicleSpec;
    const info = { look: JSON.parse(this.lookKey || 'null'), veh: { model: spec.model || 'underbone', color: spec.color, pedal: gs.power === 'pedal', name: spec.name || '' }, bag: gs.power === 'pedal' ? null : gs.bagSpec?.color ?? null, brand: gs.brand, rating: +gs.rating.toFixed(2) };
    const key = JSON.stringify(info);
    if (!force && key === o.infoKey) return;
    o.infoKey = key;
    o.net.send('info', info);
  }
  // Danh sách người online (bảng giữ O): mình trước, rồi gần → xa
  onlineRows() {
    const o = this.online, gs = this.gs, me = this.playerPos;
    const myAct = this.busy ? (this.busy.activity === 'sleep' ? 'sleep' : 'busy') : this.om.order ? 'deliver' : 'idle';
    const rows = o.remotes.list.map((r) => ({ name: r.name, plate: r.plate, brand: r.brand, veh: r.vehName, rating: r.rating, act: r.a, dist: dist2d(me, r) }));
    rows.sort((a, b) => a.dist - b.dist);
    return [{ me: true, name: o.name, plate: o.plate, brand: gs.brand, veh: gs.vehicleSpec.name, rating: gs.rating, act: myAct, dist: 0 }, ...rows];
  }
  // Đầu người chơi khác (bong bóng chat "Gần"): đang hiện bảng tên thì đặt bong bóng phía trên bảng tên cho khỏi che
  remoteHead(id) {
    const r = this.online?.remotes.map.get(id);
    if (!r) return null;
    if (!r.tag.visible) return headOf(r.person);
    const v = r.tag.position.clone();
    v.y += r.tag.scale.y * 0.55;
    return v;
  }
  // Đang ở phòng trọ (thoát game ở đây = coi như đi ngủ)
  atHome() {
    const home = this.layout.placeById.home;
    if (this.bikeInGarage()) return true;
    if (this.mode !== 'foot' || !home?.door) return false;
    const [nx, nz] = NORMAL[home.face] || [0, 0];
    return Math.hypot(this.walker.pos.x - (home.door.x - nx * 2), this.walker.pos.z - (home.door.z - nz * 2)) < 6;
  }
  // Lưu tiến độ lên máy chủ (mỗi ONLINE.saveEverySec giây + lúc thoát)
  onlineSave() {
    const o = this.online;
    if (!o || !this.gs || this.state !== 'play') return; // màn thua: bản lưu đã bị xóa, không ghi lại
    o.saveT = 0;
    const d = this.saveData(true);
    o.net.send('save', { carry: d.carry, pday: this.gs.day, pos: d.pos || null, home: this.atHome() });
  }
}

// Sang ngày thành phố mới khi đang online: ngày của mình +1 (dù thành phố có thể đã qua nhiều ngày lúc mình vắng)
export function onlineDayOf(g) {
  return dayOf(g.clockMin) - (g.gs.dayShift || 0);
}
