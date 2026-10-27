// =============================================================
// GAME — BẢN ĐỒ RIÊNG (cốt truyện chương 6: trên tàu HẢI LONG) · tịch thu điện thoại · trói / cởi trói (bấm E liên tục).
// Phần của lớp Game (src/game.js): gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// Bản đồ riêng nằm thật xa thành phố (world/shipMap.js) → chỉ cần dịch người chơi tới đó + đổi biên đi lại; đồng hồ vẫn chạy.
// Trạng thái lưu trong bản lưu: gs.story.zone { id, gate, door } · gs.story.noPhone · gs.story.tied { người: true/false }.
// =============================================================
import * as THREE from 'three';
import { buildShipZone } from '../world/shipMap.js';
import { ZONES, zonePoint } from '../sim/zones.js';
import { setTied, sitY, TIED_SEAT } from '../world/models.js';
import { storyEvent, spotOf } from '../sim/story.js';
import * as act from '../interactions.js';
import { sound } from '../audio.js';
import { fmt } from '../content/index.js';

// bản đồ riêng → hàm dựng (danh sách mã + chỗ đứng: sim/zones.js)
const BUILD = { ship: buildShipZone };

export class ZonePart {
  // ---------- việc "zone": { id: 'ship' | '' (về thành phố), at: chỗ đứng ('captive' / 'spot:…' / [x, z]), heading, gate, door } ----------
  // gate: cổng đầu cầu thang mạn (true = mở, xuống tàu được) · door: cửa container nhốt người (true = mở)
  storyZone(a) {
    const s = this.gs.story, doorWas = !!s.zone?.door;
    if (a.id) {
      s.zone = { id: a.id, gate: a.gate ?? s.zone?.gate ?? false, door: a.door ?? s.zone?.door ?? false };
      this.zoneEnter(a.id);
      if (a.at != null) this.zoneTeleport(this.zoneAt(a.at), a.heading);
    } else if (a.gate != null || a.door != null) { // chỉ mở / đóng cổng, cửa (đang ở trên tàu)
      if (!s.zone) return;
      if (a.gate != null) s.zone.gate = !!a.gate;
      if (a.door != null) s.zone.door = !!a.door;
    } else {
      delete s.zone;
      this.zoneExit();
      if (a.at != null) this.zoneTeleport(this.zoneAt(a.at), a.heading);
    }
    this.zoneApply(false);
    if (!doorWas && s.zone?.door) sound('fight.door'); // cửa container nhốt người bật mở
  }
  // chỗ đứng: tên chỗ trong bản đồ riêng / chỗ hẹn (spot:…) / [x, z]
  zoneAt(at) {
    if (Array.isArray(at)) return at;
    if (typeof at === 'string' && at.startsWith('spot:')) return spotOf(at)?.at || null;
    return zonePoint(this.gs.story?.zone?.id, at);
  }
  zoneEnter(id) {
    if (!ZONES[id] || (!BUILD[id] && !this.zones?.[id])) return; // đường đua: dựng sẵn ở game/race.js
    this.zones ||= {};
    if (!this.zones[id]) {
      const water = new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.15, metalness: 0.35 });
      this.zones[id] = BUILD[id](this.scene, this.city.grid, this.city.elev, water);
    }
    this.zone = this.zones[id];
    this.zone.group.visible = true;
    this.city.grid.zones = [this.zone.bounds];
    if (this.mode === 'bike') act.dismount(this); // xe để lại thành phố
    this.hud.el.classList.add('in-zone');
  }
  zoneExit() {
    if (!this.zone) return;
    this.zone.group.visible = false;
    this.zone = null;
    this.city.grid.zones = [];
    this.hud.el.classList.remove('in-zone');
  }
  // Dịch người chơi tới chỗ (đi bộ): đứng đúng mặt cao nhất ở đó (boong tàu…)
  zoneTeleport(p, heading) {
    if (!p) return;
    if (this.mode === 'bike') act.dismount(this);
    const w = this.walker;
    w.leaveSeat?.(false);
    w.leaveCrouch?.();
    w.pos.set(p[0], 0, p[1]);
    const top = this.city.elev?.topAt(p[0], p[1]) ?? 0;
    w.deckY = top > 0.01 ? top : null;
    w._ex = p[0];
    w._ez = p[1];
    if (heading != null) w.heading = (heading * Math.PI) / 180;
    w.mesh.position.set(p[0], top, p[1]);
    this.rig.init = false; // camera nhảy theo ngay, không lướt từ chỗ cũ
  }
  // Áp trạng thái đã lưu (mở game / nhảy bước / sau mỗi việc): bản đồ, cổng, cửa, điện thoại, người bị trói
  zoneApply(restore) {
    const s = this.gs.story || {};
    const zs = s.zone;
    if (zs?.id === 'race' && !this.race) delete s.zone; // mở lại game giữa màn đua: chơi lại từ bước bắt đầu đua (ở thành phố)
    if (s.zone?.id !== 'race' && (this.race || this.raceSaved)) this.raceStop(); // ra khỏi đường đua → trả xe
    if (zs?.id && s.zone && ZONES[zs.id]) {
      if (!this.zone || this.zone !== this.zones?.[zs.id]) this.zoneEnter(zs.id); // mở game mới: chưa dựng bản đồ nào (cả 2 đều rỗng)
      if (!this.zone) { delete s.zone; return this.zoneApply(restore); } // bản đồ không dựng được → về thành phố cho khỏi kẹt
      this.zone.setGate?.(!!zs.gate);
      this.zone.setDoor?.(!!zs.door, restore);
      const p = this.playerPos, b = this.zone.bounds;
      if (restore && !(p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1)) this.zoneTeleport(zonePoint(zs.id, ZONES[zs.id].spawn));
      else if (restore && this.mode !== 'bike' && !this.race) { const h = this.walker.heading; this.zoneTeleport([p.x, p.z]); this.walker.heading = h; } // đứng lên đúng mặt boong / cầu thang
    } else if (this.zone) {
      const p = this.playerPos, b = this.zone.bounds, inside = p.x >= b.x0 - 40 && p.x <= b.x1 + 40 && p.z >= b.z0 - 40 && p.z <= b.z1 + 40;
      this.zoneExit();
      if (inside) this.placeAtHome?.(); // mở game ngoài cốt truyện mà còn kẹt trên tàu → về nhà trọ
    }
    // điện thoại bị tịch thu
    if (s.noPhone && this.phone.open) this.phone.toggle(false);
    this.hud.el.classList.toggle('no-phone', !!s.noPhone);
    // người chơi bị trói
    this.walker.setTied?.(!!s.tied?.player);
    // góc nhìn thứ 1 (lén đi / đánh nhau trên tàu)
    this.fpvSet(!!s.fpv);
  }
  zoneTick(dt) {
    this.zone?.tick?.(dt);
    this.untieTick(dt);
    this.fightTick(dt); // đánh nhau góc nhìn thứ 1 (game/fight.js)
    this.raceTick(dt); // màn đua thoát thân (game/race.js)
  }

  // ---------- việc "phone": { off: true } tịch thu điện thoại (ẩn hình điện thoại, Tab không mở) · off: false trả lại ----------
  storyPhoneOff(a) {
    const s = this.gs.story;
    if (a.off) s.noPhone = true;
    else delete s.noPhone;
    this.zoneApply(false);
  }
  phoneBlocked() {
    if (!this.gs?.story?.noPhone) return false;
    this.toastOnce?.('noPhone', fmt('toast.noPhone'), 'warn', 6);
    return true;
  }

  // ---------- việc "tie": { who: 'player' | người lạ, on } trói (ngồi bệt, tay quặt sau lưng) / thả ----------
  storyTie(a) {
    const s = this.gs.story;
    (s.tied ||= {})[a.who] = a.on !== false;
    this.tieApply(a.who);
  }
  tieApply(who) {
    const on = !!this.gs.story?.tied?.[who];
    if (who === 'player') { this.walker.setTied(on); return; }
    const ac = this.storyActors?.[who];
    if (!ac) return;
    ac.tied = on;
    const m = ac.mesh, floor = this.city.elev?.topAt(m.position.x, m.position.z) ?? 0;
    setTied(m, on);
    m.position.y = on ? sitY(m.scale.x, floor + TIED_SEAT) : floor;
  }
  // ---------- việc "untie": { who, need (số lần bấm E), text } — bấm E liên tục để cắt dây; xong → điều kiện "untied" ----------
  // Cởi trói người khác: đứng xa thì đi lại tự do (nhắc "lại gần"), tới sát (≤ 1,5 m) mới hiện thanh bấm E + đứng yên (game.js khóa đi khi !U.go)
  storyUntie(a) {
    const s = this.gs.story;
    if (!s.tied?.[a.who]) { storyEvent(s, 'untied'); return; } // không bị trói (mở lại game sau khi cởi) → xong luôn
    this.untie = { who: a.who, need: Math.max(3, a.need ?? 14), n: 0, t: 0, text: a.text || 'story.qte.untie', go: a.who !== 'player' };
    if (!this.untie.go) this.qteShow(0, this.untie.text);
  }
  untieTick(dt) {
    const U = this.untie;
    if (!U) return;
    if (U.go) { // đang đi lại gần người cần cởi trói
      const m = this.storyActors?.[U.who]?.mesh.position, P = this.walker.pos;
      if (!m) { U.go = false; this.qteShow(0, U.text); return; }
      const d = Math.hypot(m.x - P.x, m.z - P.z);
      if (d > 1.5) {
        if ((U.hintT = (U.hintT ?? 0) - dt) <= 0) { U.hintT = 6; this.hud.toast(fmt('story.qte.goUntie', { name: this.speakerOf(U.who)?.name || '' }), 'info', 3500); }
        return;
      }
      U.go = false;
      this.walker.heading = Math.atan2(m.x - P.x, m.z - P.z); // quay mặt về phía người đang được cởi trói
      this.qteShow(0, U.text);
    }
    U.t += dt;
    if (this.input.was('KeyE')) { U.n += 1; sound('fight.rope'); }
    U.n = Math.max(0, U.n - dt * 1.1); // ngừng bấm thì dây lỏng ra lại chút
    this.qteShow(U.n / U.need);
    if (U.n < U.need) return;
    this.untie = null;
    this.qteDone(true);
    sound('fight.rope');
    this.gs.story.tied[U.who] = false;
    this.tieApply(U.who);
    storyEvent(this.gs.story, 'untied');
  }
}
