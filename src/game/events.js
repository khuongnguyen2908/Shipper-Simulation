// =============================================================
// GAME — SỰ KIỆN: va chạm xe, giao thông, thời tiết / CSGT / kẹt xe / ngập, sự kiện đơn hàng, tin nhắn, chat
// Phần của lớp Game (src/game.js): các hàm ở đây gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// =============================================================
import { ENERGY, NIGHT, ORDER, NPC_FLAVOR } from '../data/balance.js';
import { APP } from '../data/apps.js';
import { isDark } from '../sim/clock.js';
import { S } from '../sim/OrderManager.js';
import { STORY, storyEvent, stepOf } from '../sim/story.js';
import { personOf, pronouns } from '../sim/people.js';
import * as act from '../interactions.js';
import { sound } from '../audio.js';
import { fmt, pick, pickFor } from '../content/index.js';
import { headOf } from '../ui/bubbles.js';
import { GROUP_CHAT_ON, fmtTime } from './shared.js';

export class EventsPart {
  // ======================== SỰ KIỆN ========================
  onBikeEvent(type, mag, info, env) {
    if (type === 'bump' && info?.what === 'pothole' && isDark(this.clockMin)) mag *= NIGHT.potholeMul || 1; // đêm tối khó thấy ổ gà
    this.om.itemEvent(type, mag, { ...env, speed: Math.abs(this.bike.speed) });
    const liquid = this.om.hasCargo && this.om.order.items.some((i) => i.has('liquid') || i.has('passenger'));
    if (type === 'bump') {
      if (mag > 0.25) {
        sound('drive.bump');
        this.shake = Math.max(this.shake, mag * 0.25);
        if (info && info.what === 'pothole') this.toastOnce('pothole', fmt(liquid ? 'toast.potholeCargo' : 'toast.pothole'), 'warn', 4);
      }
    } else if (type === 'collision' && !this.cheat.noCrash) {
      sound(mag > 0.4 ? 'drive.crash' : 'drive.bump');
      this.shake = Math.max(this.shake, Math.min(0.8, mag * 0.4));
      this.gs.bikeHp = Math.max(0, this.gs.bikeHp - mag * 8);
      if (mag > 0.6) {
        this.gs.addEnergy(-mag * ENERGY.phys.crashPerMag, -3);
        this.gs.stats.crashes += 1;
        this.toastOnce('wall', fmt('toast.wallCrash'), 'bad', 2);
      }
    } else if ((type === 'brake' || type === 'swerve') && liquid && mag > 0.02) {
      this.toastOnce('slosh', fmt(type === 'brake' ? 'toast.sloshBrake' : 'toast.sloshSwerve'), 'warn', 5);
    }
  }

  // Tài xế chửi người chơi (bị chắn đầu xe lâu / bị tông): bong bóng thoại trên đầu tài xế, câu trong vi.json
  // (bubble.driverMild / driverAngry / busMild / busAngry / driverHit). Cách nhau ít nhất 2,5 giây cho đỡ rối.
  // CSGT tuần tra (traffic.patrolNow, lịch chung sim/patrol.js): đang chạy xe quá tốc độ trong patrolRadius quanh xe tuần tra
  // → bị dừng xe phạt. Mỗi tổ chỉ dừng 1 lần mỗi lượt gặp (cách nhau ≥ 20 phút game).
  // Đầu trần trên xe máy / xe điện (đang chạy) gần xe tuần tra cũng bị dừng (reason 'helmet').
  patrolCheck(mounted, speed) {
    if (!mounted || this.cheat.noPolice || this.modal.open) return;
    const speeding = speed > this.speedLimit(), bare = this.gs.noHelmet && speed > 1;
    if (!speeding && !bare) return;
    const p = this.patrolNear();
    if (!p) return;
    this.patrolSeen.set(p.id, this.clockMin);
    act.patrolStop(this, speeding ? 'speed' : 'helmet', speed);
  }
  // Xe tuần tra đang ở gần người chơi (trong patrolRadius) và chưa dừng mình trong 20 phút game qua
  patrolNear(x = this.playerPos.x, z = this.playerPos.z) {
    this.patrolSeen ??= new Map();
    const R = NPC_FLAVOR.patrolRadius ?? 25;
    return (this.traffic.patrolNow || []).find((q) => Math.hypot(q.x - x, q.z - z) < R && !(this.clockMin - (this.patrolSeen.get(q.id) ?? -1e9) < 20)) || null;
  }

  // Bấm còi đuổi được xe trộm chó: chủ chó cảm ơn (mỗi vụ 1 lần) · chơi nhiều người: máy chủ kiểm tra giờ vụ trộm + khoảng cách rồi mới cộng
  thiefScared(e) {
    this.thiefPaid ??= new Set();
    if (this.thiefPaid.has(e.id)) return;
    this.thiefPaid.add(e.id);
    const k = NPC_FLAVOR.thiefReward ?? 30;
    if (k > 0) this.gs.earn(k, 'thanks');
    sound('money.earn');
    this.hud.toast(fmt('toast.thiefScared', { k }), 'good', 5000);
  }

  driverYell(e, key = null) {
    const now = performance.now();
    if (!e.obj?.mesh || this.cooldowns.get('yell') > now) return;
    this.cooldowns.set('yell', now + 2500);
    key = key || (e.bus ? (e.angry ? 'bubble.busAngry' : 'bubble.busMild') : e.angry ? 'bubble.driverAngry' : 'bubble.driverMild');
    const up = e.bus ? 3.5 : e.car ? 1.9 : 2.2;
    this.bubbles.show(e.id, () => headOf(e.obj.mesh, up), pick(key, Math.floor(Math.random() * 1000), {}, [isDark(this.clockMin) ? 'night' : 'day'])); // câu "nắng quá" chỉ ban ngày
  }

  onTrafficHit(h, env) {
    if (this.cheat.noCrash) return; // cheat: không té xe
    if (this.cooldowns.get('hit') > performance.now()) return;
    const speed = Math.abs(this.bike.speed);
    const gs = this.gs;
    let mag = 0, msg = '';
    if ((h.what === 'car' || h.what === 'moto') && h.into > 1.5) {
      mag = h.into / 5;
      gs.addEnergy(-mag * 6, -ENERGY.mental.carCrash);
      gs.bikeHp = Math.max(0, gs.bikeHp - mag * 10);
      msg = fmt(h.what === 'car' ? 'toast.hitCar' : 'toast.hitMoto');
      sound('drive.crash');
      if (h.obj?.mesh) this.driverYell({ obj: h.obj, id: `car:${h.obj.uid}`, car: h.what === 'car' }, 'bubble.driverHit');
    } else if (h.what === 'ped' && speed > 2) {
      mag = speed / 8;
      const ped = h.obj;
      if (ped) this.bubbles.show(`ped:${ped.id}`, () => headOf(ped.mesh, 1.95), pick('bubble.pedHit', Math.floor(Math.random() * 1000)));
      gs.addEnergy(-2, -ENERGY.mental.pedHit);
      msg = fmt('toast.hitPed');
      sound('drive.hitPed');
    } else if (h.what === 'dog' && speed > 1.5) {
      mag = speed / 6;
      gs.addEnergy(-2, -ENERGY.mental.dogHit);
      msg = fmt('toast.hitDog');
      sound('drive.hitDog');
    }
    if (!mag) return;
    this.cooldowns.set('hit', performance.now() + 900);
    gs.stats.crashes += 1;
    this.om.itemEvent('collision', mag, { ...env, speed });
    this.bike.speed *= 0.2;
    this.bike.vel.multiplyScalar(0.2);
    this.shake = Math.max(this.shake, Math.min(0.9, mag * 0.5));
    this.hud.toast(msg, 'bad', 3000);
  }

  onHazard(e) {
    const t = fmtTime(this.clockMin);
    if (e.type === 'rainStart') {
      if (!this.skipping) sound('city.thunder'); // sấm chỉ khi trời bắt đầu mưa lúc đang chơi, không phát khi đang tua giờ
      const coat = this.gs.effect('rainProtect');
      this.hud.toast(fmt(e.heavy ? 'toast.rainHeavy' : 'toast.rainLight') + fmt(coat ? 'toast.rainCoat' : 'toast.rainNoCoat'), 'warn', 5000);
      this.groupChat(fmt('chat.group'), fmt('chat.rain', { time: t }));
    } else if (e.type === 'rainEnd') this.hud.toast(fmt('toast.rainEnd'), 'info');
    else if (e.type === 'policeStart') {
      // chốt CSGT do anh em trong hội báo → chưa vào hãng (chưa ở nhóm) thì không biết
      if (e.police.reported && this.gs.brand) {
        this.knownPolice.add(e.police.id);
        this.groupChat(fmt('chat.tuan'), fmt('chat.police', { place: e.police.name }));
      }
    } else if (e.type === 'policeEnd') this.knownPolice.delete(e.police.id);
    else if (e.type === 'jamStart') {
      this.groupChat(fmt('chat.group'), fmt('chat.jam', { roads: e.names.join(', ') }));
      this.hud.toast(fmt('toast.jam', { roads: e.names.join(', ') }), 'warn');
    } else if (e.type === 'jamEnd') this.groupChat(fmt('chat.group'), fmt('chat.jamEnd'));
    else if (e.type === 'tideStart' || e.type === 'floodStart') {
      const roads = e.names.join(', ');
      const tide = e.type === 'tideStart';
      this.groupChat(fmt('chat.group'), fmt(tide ? 'chat.tide' : 'chat.flood', { roads }));
      this.hud.toast(fmt(tide ? 'toast.tide' : 'toast.flood', { roads }), 'warn', 6000);
    } else if (e.type === 'tideEnd') this.groupChat(fmt('chat.group'), fmt('chat.tideEnd'));
    else if (e.type === 'floodEnd') this.groupChat(fmt('chat.group'), fmt('chat.floodEnd'));
  }

  // Mất 1 nón chở khách: báo + ghi log; hết nón thì nhắc mua lại ở văn phòng hãng
  onHelmetLost(goods, why) {
    if (!goods) return;
    const brand = this.gs.brandSpec?.name || '';
    const left = this.gs.passengerHelmets().length;
    const msg = `${why} ${fmt(left ? 'toast.helmetLeft' : 'toast.helmetNone', { item: goods.name, brand })}`;
    sound('order.helmetLost');
    this.hud.toast(msg, 'warn', 7000);
    this.chatCh.local('system', '', msg, { time: fmtTime(this.clockMin) });
  }

  onOrderEvent(e) {
    // chở khách xong, khách cầm luôn nón đi: bong bóng trên đầu khách + báo
    if (e.type === 'helmetTaken') {
      const line = pick('bubble.helmetTaken', Math.floor(this.clockMin), pronouns(personOf(e.order.customer), this.gs.profile?.gender));
      this.bubbles.show('rider', () => headOf(this.passengerMesh, 1.9), line);
      this.chatCh.local('npc', e.order.customer, line, { time: fmtTime(this.clockMin) });
      return this.onHelmetLost(e.goods, fmt('toast.helmetTaken', { customer: e.order.customer }));
    }
    if (e.type === 'offer') {
      sound('phone.offer');
      this.ringAt = performance.now();
      // KHÔNG tự bật máy: máy cất → hình điện thoại cạnh bản đồ đổ chuông (Tab / bấm vào để xem);
      // đang mở máy: ở màn hình chính → vào thẳng app nhận đơn · đang xem app khác → trượt thông báo xuống (Y / N nhận / bỏ qua ở app nào cũng được)
      if (this.phone.open && !this.phone.app) this.phone.openApp('goship');
      else if (this.phone.open && this.phone.app !== 'goship') this.phone.notify('goship', { title: fmt('phone.offerNoteTitle'), text: fmt('phone.offerNoteText'), ms: ORDER.offerTimeoutSec * 1000 });
      if (!e.offer?.forced) this.hud.toast(fmt('toast.offer'), 'good', 3500); // cuốc cốt truyện: đã có hướng dẫn riêng
    } else if (e.type === 'offerExpired') this.hud.toast(fmt('toast.offerExpired'), 'info');
    else if (e.type === 'cancelled') {
      const r = this.gs.applyCancel(e, this.clockMin);
      this.clearTempNpcs();
      this.bike.showBag(true);
      this.hud.toast(fmt('toast.cancelled', { reason: e.reason }) + (e.comp ? fmt('toast.cancelComp', { k: e.comp }) : '') + (e.byDriver ? fmt('toast.cancelDriver', { stars: APP.account.cancelStars }) : '') + (e.flood ? fmt('toast.cancelFlood') : ''), 'bad', 5000);
      if (r.locked) this.hud.toast(fmt('toast.accountLocked', { n: APP.account.cancelLimitPerDay, time: fmtTime(r.until) }), 'bad', 7000);
      sound('order.cancelled');
    } else if (e.type === 'returning') this.hud.toast(fmt('toast.returning', { place: e.order.pickup.name }), 'warn', 5000);
    else if (e.type === 'rideEvent') act.rideEventDialog(this, e.event); // khách đổi điểm đến / khách lừa đảo
    else if (e.type === 'vomit') {
      sound('order.vomit');
      this.shake = Math.max(this.shake, 0.3);
      this.hud.toast(fmt('toast.vomit', { mental: e.mental, cost: e.cost }), 'bad', 4500);
    } else if (e.type === 'redirect') {
      this.clearTempNpcs();
      this.hud.toast(fmt('toast.redirect', { address: e.order.dropoff.address }), 'warn', 5000);
    } else if (e.type === 'revealed') this.hud.toast(fmt('toast.revealed', { address: e.order.dropoff.address }), 'good', 5000);
    else if (e.type === 'completed') this.storyDelivered(e.receipt); // cốt truyện: giao xong 1 đơn
    else if (e.type === 'state') this.renderPhone();
  }

  // Người chơi gửi tin chat (Enter) → log + bong bóng trên đầu mình
  sendChat(text) {
    this.chatCh.me.name = this.gs?.profile.name || '';
    const r = this.chatCh.send(text, { time: fmtTime(this.clockMin) });
    if (r.ok) sound('chat.send');
    if (!r.ok && r.reason === 'spam') this.hud.toast(fmt('chat.spam'), 'warn', 2000);
  }
  // Người đi đường gần mình thỉnh thoảng nói một câu (bong bóng trên đầu, không ghi vào log)
  pedChatter(dt) {
    this.pedChatT = (this.pedChatT ?? 4) - dt;
    if (this.pedChatT > 0) return;
    this.pedChatT = 6 + Math.random() * 8;
    const pp = this.playerPos;
    const near = this.traffic.peds.filter((p) => p.mesh.visible && p.knock <= 0 && Math.hypot(p.x - pp.x, p.z - pp.z) < 16);
    if (!near.length) return;
    const p = near[Math.floor(Math.random() * near.length)];
    this.bubbles.show(`ped:${p.id}`, () => headOf(p.mesh, 1.95), pickFor('bubble.ped', p.who, Math.floor(Math.random() * 1000), pronouns(p.who || personOf(p.name), this.gs.profile?.gender), [isDark(this.clockMin) ? 'night' : 'day'])); // câu hợp vai người nói (vé số…)
    sound('chat.bubble');
  }

  // Tin nhắn từ người / nhóm không có trong danh bạ cốt truyện (nhóm tài xế, phường, chủ tiệm…): mỗi tên 1 cuộc trò chuyện
  addChat(from, text) {
    this.gs.addMessage(`x:${from}`, { text }, this.clockMin, { name: from, icon: '💬' });
    this.onNewMessage(`x:${from}`, from, text);
  }
  // Tin nhắn cốt truyện: người gửi trong danh bạ story.json (Mẹ, Cô Hai…). m: { key, loc }
  // Giao xong 1 đơn → cốt truyện. Đơn thử thách (offer.minStars, vd chở thuốc cho bà cụ): chưa đủ sao thì chưa tính — nhắc câu
  // failText rồi mời lại đơn khác (storyUpdate tự mời lại vì chưa "delivered")
  storyDelivered(receipt) {
    const s = this.gs.story, st = s?.ch && s.fired ? stepOf(s) : null;
    const a = st && (st.on || []).find((x) => x.do === 'offer' && x.minStars);
    const stars = receipt?.ev?.stars ?? 5;
    if (a && receipt?.order?.story && stars < a.minStars) {
      sound('ui.warn');
      if (a.failText) this.hud.toast(fmt(a.failText, { name: this.gs.profile.name, stars }), 'warn', 7000);
      this.storyOfferAt = performance.now() + 4000; // nghỉ vài giây rồi mới mời lại
      return;
    }
    storyEvent(this.gs.story, 'delivered');
  }
  storyMessage(id, m) {
    this.gs.addMessage(id, m, this.clockMin);
    const c = STORY.contacts[id];
    const name = c ? fmt(c.name) : id; // nhóm chat: "Hội nhóm shipper · Hùng Grip"
    this.onNewMessage(id, m.as ? `${name} · ${fmt(m.as)}` : name, fmt(m.key, this.storyVoice(id)));
  }
  // Có tin mới: đang mở đúng cuộc trò chuyện thì coi như đã đọc; rung + tiếng; báo trên điện thoại / màn hình
  onNewMessage(id, name, text) {
    const plain = String(text).replace(/<[^>]+>/g, '');
    const short = plain.length > 70 ? plain.slice(0, 67) + '…' : plain;
    this.chatCh.local('phone', name, plain, { time: fmtTime(this.clockMin) }); // tin điện thoại cũng ghi vào log bên trái
    sound('phone.message');
    if (this.phone.open && this.phone.app === 'chat' && this.phone.thread === id) return this.gs.readThread(id);
    this.phone.buzz();
    if (this.phone.open) this.phone.notify('chat', { title: name, text: short });
    else {
      this.hud.buzzPhone(); // hình điện thoại cạnh bản đồ rung 3 cái
      this.hud.phonePreview(name, short); // bong bóng xem trước 3 giây
    }
  }
  // Tin nhắn nhóm Hội shipper (thời tiết, kẹt xe, chốt CSGT, mẹo, khai trương): chỉ người đã vào hãng mới thấy
  // Đang theo cốt truyện (chương 1): chưa nhận tin nhóm (vào hãng chỉ có tin chào mừng của hãng — chủ game sẽ quyết khi nào bật lại)
  groupChat(from, text) {
    if (GROUP_CHAT_ON && this.gs?.brand && !this.gs.story?.ch) this.addChat(from, text);
  }
  // Vào nhóm (bắt đầu ngày khi đã ở hãng / vừa đăng ký hãng): dự báo thời tiết, quảng cáo đồ nghề, mẹo
  joinGroupChat() {
    if (!GROUP_CHAT_ON || this.gs.flags.groupDay === this.gs.day) return; // mỗi ngày 1 lần (trước đây mở lại game là thêm lần nữa)
    this.gs.flags.groupDay = this.gs.day;
    this.groupChat(fmt('chat.group'), fmt('chat.forecast', { forecast: this.hz.forecastText() }));
    this.groupChat(fmt('chat.shopOwner'), fmt('chat.shopAd'));
    this.groupChat(fmt('chat.admin'), fmt('chat.tips'));
  }

  toastOnce(key, html, kind, cdSec) {
    const now = performance.now();
    if ((this.cooldowns.get(key) || 0) > now) return;
    this.cooldowns.set(key, now + cdSec * 1000);
    this.hud.toast(html, kind, 3500);
  }
}
