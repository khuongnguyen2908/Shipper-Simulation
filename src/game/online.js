// =============================================================
// GAME — CHƠI ONLINE (thành phố chung). Phần của lớp Game (src/game.js): gắn vào Game.prototype (mixParts).
// this.online = null khi chơi Offline → mọi luật Offline giữ nguyên.
// Luật riêng Online:
//  - Giờ là của chung: lấy theo giờ máy chủ (src/net/protocol.js → worldMinAt), không tua được.
//    Việc tốn thời gian (chờ quán, nộp phạt, ngủ…) thành thanh tiến độ (this.busy), đồng hồ vẫn chạy.
//  - Ngày của riêng mình (gs.day) chỉ tăng khi mình đang online lúc thành phố qua 06:00, hoặc thoát game ở phòng trọ
//    đủ lâu (coi như ngủ qua đêm). gs.dayShift = ngày thành phố − ngày của mình → tiền nhà tính theo số ngày đã chơi.
//  - Không có cốt truyện; mọi địa điểm mở sẵn (gs.online → progress). Tiến độ lưu trên máy chủ, không đè bản lưu Offline.
// =============================================================
import { NetClient, tokenFor, rememberToken, rememberServer } from '../net/client.js';
import { NET, worldMinAt, dist2d } from '../net/protocol.js';
import { RemotePlayers } from '../world/remotePlayers.js';
import { OnlineHud } from '../ui/onlineHud.js';
import { headOf } from '../ui/bubbles.js';
import { localTransport } from '../sim/chat.js';
import { dayOf } from '../sim/clock.js';
import { S } from '../sim/OrderManager.js';
import { STORY, freshStory } from '../sim/story.js';
import { startOutfit, GOODS } from '../data/goods.js';
import { ONLINE, TIME } from '../data/balance.js';
import { NORMAL, fmtTime } from './shared.js';
import { fmt } from '../content/index.js';

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
      if (sv.home && away >= (ONLINE.homeSleepMinGame ?? 360)) pday += 1; // ngủ qua đêm ở phòng trọ → ngày mới của mình
      if (!sv.home) pos = sv.pos;
    } else carry = newCarry(w.name, w.profile);
    carry.profile = { ...(carry.profile || {}), name: w.name };
    this.startGame({ clock: now, carry, seed: w.world.seed, pos, pday });
    const gs = this.gs;
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
