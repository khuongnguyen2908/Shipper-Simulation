// =============================================================
// BẢNG ĐƠN CHUNG (máy chủ, đợt M2a): đơn là của cả thành phố, ai bấm nhận trước thì được.
// Dùng lại nguyên bộ luật sinh đơn của game (src/sim/OrderManager.js) — máy chủ tự sinh, máy người chơi chỉ xin + hiện.
//  - Người chơi xin đơn (app tới lượt phát đơn): có đơn chưa ai nhận ở gần, cùng hãng, mình chở được → có thể mời chung đơn đó
//    (tỉ lệ ONLINE.orderShare); không thì sinh đơn mới theo vị trí + trang bị của người đó.
//  - Một đơn có thể đang mời nhiều người cùng lúc ("👥 N shipper gần đây cũng thấy"); người nhận trước khóa đơn, người khác được báo mất.
//  - Đơn không ai nhận quá ONLINE.orderTtlMin phút game thì hết hạn.
// M2b — máy chủ tính tiền: lúc nhận, máy chủ giữ bản sao đơn (tự tính hạn giao theo giờ chung). Lấy hàng / giao hàng phải đứng gần
// cửa quán / cửa khách (vị trí máy chủ đang biết). Giao xong: máy chủ chạy đúng hàm giao hàng của game (OrderManager.handOver) với
// độ nguyên vẹn món hàng máy người chơi báo lên (kẹp 0–100) → tiền, sao, tiền boa do máy chủ quyết.
// Thuần logic (chạy được trong Node, không mạng): server/room.js gọi vào; tests/run.js thử bằng người chơi giả.
// =============================================================
import { OrderManager, S } from '../src/sim/OrderManager.js';
import { DeliveryItem } from '../src/sim/ItemPhysics.js';
import { GameState } from '../src/sim/GameState.js';
import { buildLayout, routeDist } from '../src/sim/cityLayout.js';
import { HazardManager } from '../src/sim/hazards.js';
import { floodBand, nearestSegId } from '../src/sim/flood.js';
import { makeRng } from '../src/sim/rng.js';
import { dayOf } from '../src/sim/clock.js';
import { ITEMS } from '../src/data/items.js';
import { ONLINE } from '../src/data/balance.js';

let LAYOUT = null; // bản đồ thành phố (dựng 1 lần, dùng chung)
const NEAR_M = 30; // lấy / giao hàng: phải đứng trong bấy nhiêu m quanh cửa
const EXT_MAX = 60; // hạn giao được cộng thêm tối đa (quán làm lâu, chờ nấu nồi mới, khách đổi điểm…) — phút
const clamp = (v, lo, hi, def = lo) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);
const far = (p, door) => Math.hypot((p?.x ?? 1e9) - door.x, (p?.z ?? 1e9) - door.z);

export class JobBoard {
  // world: { seed } · rnd: số ngẫu nhiên 0..1 (thử nghiệm truyền vào cho cố định)
  constructor({ world, rnd = Math.random }) {
    this.layout = LAYOUT ||= buildLayout();
    this.world = world;
    this.rnd = rnd;
    this.rng = makeRng(Math.floor(rnd() * 1e9));
    this.jobs = new Map(); // id → { id, o, brand, at, holders: Set(người đang được mời), passed: Set, takenBy }
    this.seq = 0;
    this.hzDay = null;
  }
  // thời tiết / ngập của ngày thành phố (cùng seed với mọi máy → phụ phí mưa / ngập khớp)
  hzAt(min) {
    const d = dayOf(min);
    if (d !== this.hzDay) {
      this.hz = new HazardManager(makeRng(this.world.seed + d * 101), d);
      this.hzDay = d;
    }
    return this.hz;
  }
  // GameState của người chơi dựng từ bản lưu mới nhất (xe, túi, đồ, ngày, số cuốc đã chở…) — chỉ để biết họ nhận được đơn gì
  gsFor(p) {
    const sv = p.acc.save;
    const key = sv?.at ?? 0;
    if (!p.jobGs || p.jobGsKey !== key) {
      p.jobGs = new GameState({ day: sv?.pday || 1, carry: sv?.carry || null });
      p.jobGs.online = true;
      p.jobGsKey = key;
    }
    return p.jobGs;
  }
  // Bộ sinh đơn theo người chơi p: công tắc app (Giao hàng / Chở khách) + tiền đang có (đơn thu hộ) lấy theo lúc xin
  managerFor(p, req, now) {
    const gs = this.gsFor(p);
    gs.flags.noFood = !req.food;
    gs.flags.noRide = !req.ride;
    gs.flags.wallet = -1; // không có nhiệm vụ chiếc ví (cốt truyện chơi một mình)
    if (Number.isFinite(req.money)) gs.money = req.money;
    const hz = this.hzAt(now);
    const om = new OrderManager({ rng: this.rng, layout: this.layout, gs, isRaining: (m) => hz.isRaining(m), isFlooded: (door, m) => floodBand(hz.floodDepth(nearestSegId(door), m)) >= 1 });
    om.now = now;
    om.orderSeq = this.seq;
    return om;
  }
  expire(now) {
    const ttl = ONLINE.orderTtlMin ?? 20;
    for (const [id, j] of this.jobs) if (!j.takenBy && now - j.at > ttl) this.jobs.delete(id);
  }
  // Số người khác đang được mời cùng đơn
  seen(j, exceptId) {
    return [...j.holders].filter((id) => id !== exceptId).length;
  }

  // Xin đơn. req: { pos {x,z}, food, ride, money }. Trả về đơn (job) hoặc null (lúc này không có đơn hợp)
  request(p, req, now) {
    this.expire(now);
    const brand = p.info?.brand;
    if (!brand || !req?.pos) return null;
    this.release(p); // đơn đang mời cũ (nếu còn) bỏ
    const om = this.managerFor(p, req, now);
    const pos = { x: +req.pos.x || 0, z: +req.pos.z || 0 };
    // 1) đơn đang có ở gần, chưa ai nhận, cùng hãng, mình chưa bỏ qua, chở được, đúng loại mình bật
    const share = ONLINE.orderShareM ?? 150;
    const cands = [...this.jobs.values()].filter((j) => !j.takenBy && j.brand === brand && !j.passed.has(p.acc.id) && !j.holders.has(p.acc.id)
      && om.wants(j.o.kind) && j.o.itemIds.every((id) => ITEMS[id] && om.canCarry(ITEMS[id])) && routeDist(pos, j.o.pickup.door) <= share);
    let j = null;
    if (cands.length && this.rnd() < (ONLINE.orderShare ?? 0.35)) {
      cands.sort((a, b) => routeDist(pos, a.o.pickup.door) - routeDist(pos, b.o.pickup.door));
      j = cands[0];
    } else {
      // 2) sinh đơn mới theo vị trí + trang bị của người này
      const o = om.makeOffer(now, pos);
      this.seq = om.orderSeq;
      if (!o) return null;
      o.jobId = `j${this.seq}`;
      j = { id: o.jobId, o, brand, at: now, holders: new Set(), passed: new Set(), takenBy: null };
      this.jobs.set(j.id, j);
    }
    j.holders.add(p.acc.id);
    p.jobOffer = j.id;
    return j;
  }
  // Bấm nhận: còn → khóa cho người này (trả về { ok, job, others: người khác đang được mời }); đã có người nhận → { ok: false, by }
  take(p, id, now = null) {
    const j = this.jobs.get(id);
    if (!j) return { ok: false, by: null };
    if (j.takenBy && j.takenBy !== p.acc.id) return { ok: false, by: j.takenByName || null, plate: j.takenByPlate || null };
    if (j.brand !== p.info?.brand) return { ok: false, by: null };
    j.takenBy = p.acc.id;
    j.takenByName = p.acc.name;
    j.takenByPlate = p.acc.plate;
    // bản sao đơn trên máy chủ: nhận lúc này, hạn giao tính theo chỗ người chơi đang đứng (máy chủ biết) + giờ chung
    const at = now ?? j.at;
    const om = this.managerFor(p, { food: true, ride: true }, at);
    om.offer = JSON.parse(JSON.stringify(j.o));
    om.state = S.OFFERED;
    om.accept(at, p.st && Number.isFinite(p.st.x) ? { x: p.st.x, z: p.st.z } : null);
    j.om = om;
    j.picked = false;
    const others = [...j.holders].filter((h) => h !== p.acc.id);
    j.holders.clear();
    p.jobOffer = null;
    p.jobTaken = j.id;
    return { ok: true, job: j, others };
  }
  // Bỏ qua / hết giờ mời: đơn vẫn còn cho người khác, chỉ không mời lại người này
  pass(p, id) {
    const j = this.jobs.get(id);
    if (!j) return null;
    j.holders.delete(p.acc.id);
    j.passed.add(p.acc.id);
    if (p.jobOffer === id) p.jobOffer = null;
    return j;
  }
  // Người chơi rời thành phố / xin đơn mới: thôi giữ đơn đang mời
  release(p) {
    const id = p.jobOffer;
    p.jobOffer = null;
    const j = id && this.jobs.get(id);
    if (j) j.holders.delete(p.acc.id);
    return j || null;
  }
  // Đã lấy hàng / đón khách: phải đứng gần cửa quán (chỗ đón). Sai → { ok: false, why, dist }
  picked(p, id, now) {
    const j = this.jobs.get(id);
    if (!j?.om?.order || j.takenBy !== p.acc.id) return { ok: false, why: 'nojob' };
    const o = j.om.order, d = far(p.st, o.pickup.door);
    if (d > NEAR_M) return { ok: false, why: 'far', dist: Math.round(d) };
    j.picked = true;
    o.pickedAt = now;
    o.items = o.itemIds.map((iid) => new DeliveryItem(ITEMS[iid], ++j.om.uid));
    j.om.state = S.DELIVERING;
    return { ok: true };
  }
  // Giao xong (hoặc khách xe ôm xuống giữa đường): máy chủ tính tiền + sao. rep: báo cáo từ máy người chơi
  //  { outcome: 'done' | 'quit', items: [độ nguyên vẹn %], ext (phút hạn được cộng), liters, extraPenalty, km, drop {x,z} (khách đổi điểm), stars (quit) }
  settle(p, id, rep, now) {
    const j = this.jobs.get(id);
    if (!j?.om?.order || j.takenBy !== p.acc.id) return { ok: false, why: 'nojob' };
    if (!j.picked) return { ok: false, why: 'nopick' };
    const om = j.om, o = om.order, r = rep || {};
    // khách xe ôm đổi điểm đến: nhận điểm mới nếu không quá xa điểm cũ
    if (r.drop && far(r.drop, o.dropoff.door) <= 400) o.dropoff = { ...o.dropoff, door: { x: +r.drop.x, z: +r.drop.z } };
    const quit = r.outcome === 'quit' && o.kind === 'ride';
    if (!quit) {
      const d = far(p.st, o.dropoff.door);
      if (d > NEAR_M) return { ok: false, why: 'far', dist: Math.round(d) };
    }
    (Array.isArray(r.items) ? r.items : []).forEach((c, i) => { if (o.items[i]) o.items[i].condition = clamp(c, 0, 100, 100); });
    o.allowedMin += clamp(r.ext, 0, EXT_MAX, 0);
    o.liters = clamp(r.liters, 0, o.distanceKm * 0.2 + 1, 0);
    o.extraPenalty = clamp(r.extraPenalty, 0, 4, 0);
    if (Number.isFinite(r.km)) o.distanceKm = clamp(r.km, o.distanceKm, o.distanceKm + 5); // đổi điểm có bù tiền: quãng dài hơn
    o.flags.bom = false; // tới được bước giao = khách đã nhận hàng
    let rec;
    if (quit) {
      om.state = S.DELIVERING;
      rec = om.quitRide(now, p.st, { stars: clamp(r.stars, 1, 5, 1) });
    } else {
      om.state = S.AT_DROPOFF;
      rec = om.handOver(now);
    }
    this.finish(p, id);
    if (!rec) return { ok: false, why: 'nojob' };
    const ev = rec.ev;
    return { ok: true, brand: j.brand, kind: o.kind, pay: rec.pay, ev: { stars: ev.stars, refused: !!ev.refused, scared: !!ev.scared, quit: !!ev.quit, conditionPct: ev.conditionPct, timeRatio: ev.timeRatio, penalties: ev.penalties }, noPay: !!rec.noPay, bigTip: rec.bigTip || 0, earlyTip: rec.earlyTip || 0, elapsed: rec.elapsed, allowedMin: o.allowedMin, viaApp: o.viaApp !== false };
  }
  // Đơn đã nhận xong việc (giao xong / hủy) — M2b ghi sổ ở đây
  finish(p, id) {
    if (p.jobTaken === id) p.jobTaken = null;
    this.jobs.delete(id);
  }
}
