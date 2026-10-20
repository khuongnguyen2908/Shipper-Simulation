// =============================================================
// GAME — LUẬT ĐƯỜNG PHỐ & XE: đậu xe, cấp đường, ngập, cản trở giao thông, sân bay, nơi gần nhất, xe bị cẩu · vượt đèn đỏ, phạt nguội
// Phần của lớp Game (src/game.js): các hàm ở đây gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// =============================================================
import { TIME, ECONOMY, PARKING, AIRPORT, RIDE_EVENTS, LIGHTS } from '../data/balance.js';
import { parkingRoll, helmetRoll, parkingLotAt, nearestStation, towTarget, safeSpot } from '../sim/parking.js';
import { airportAt, airportParkAt, airportNoStopAt, noStopStep } from '../sim/airport.js';
import { roadSegAt, tierOf, tierLabel, speedLimitOf, curbSpot } from '../sim/roads.js';
import { unlocked } from '../sim/placeRules.js';
import { tod } from '../sim/clock.js';
import { CITY, roadPos, districtAtPoint, traitAt, routeDist, streetAt, intersectionName } from '../sim/cityLayout.js';
import { lightColor, ticketChance, turnOf } from '../sim/lights.js';
import { fmtDist } from '../sim/nav.js';
import { OrderManager, S, scamHotspot } from '../sim/OrderManager.js';
import { depthAtPoint, floodBand, floodNum, floodCancelOk } from '../sim/flood.js';
import { stepOf } from '../sim/story.js';
import { makePerson } from '../world/models.js';
import * as act from '../interactions.js';
import { sound, hasMusic } from '../audio.js';
import { fmt } from '../content/index.js';
import { dist2 } from './shared.js';
import { MUSIC_FALLBACK } from '../data/soundSpec.js';

export class RoadRulesPart {
  // ======================== ĐẬU XE (src/sim/parking.js) ========================
  // Xuống xe: bắt đầu một lần đậu. Trong bãi giữ xe → trả tiền gửi, xe được trông; gần phòng trọ → an toàn.
  startParking(quiet = false) {
    const { gs, bike } = this;
    const places = this.layout.places;
    const ap = airportParkAt(places, bike.pos.x, bike.pos.z); // bãi xe máy trong khuôn viên sân bay
    const lot = parkingLotAt(places, bike.pos.x, bike.pos.z) || (ap && { name: fmt('place.airportPark', { place: ap.name }) });
    let safe = safeSpot(places, bike.pos.x, bike.pos.z);
    if (lot && !safe) {
      const fee = PARKING.fee ?? 5;
      if (gs.spend(fee, 'parking')) {
        safe = true;
        if (!quiet) this.hud.toast(fmt('toast.parkLot', { place: lot.name, fee }), 'good', 4000);
      } else if (!quiet) this.hud.toast(fmt('toast.parkNoMoney', { fee }), 'warn', 4000);
    }
    // kind: chỗ đậu (hầm nhà trọ an toàn tuyệt đối; bãi giữ xe / ngoài đường vẫn có thể mất nón chở khách)
    const kind = safe ? (lot ? 'lot' : 'garage') : 'street';
    gs.parked = { since: this.clockMin, safe, kind, ticketed: false, robbed: false, checked: Math.floor(this.clockMin) };
    if (!safe && !quiet) this.toastOnce('parkHint', fmt(this.noFines() ? 'toast.parkHintNoFine' : 'toast.parkHint', { min: PARKING.graceMin }), 'info', 600); // xe đạp (luật không phạt): chỉ nhắc trộm
    if (safe && !lot && !quiet) this.toastOnce('parkGarage', fmt('toast.parkGarage'), 'good', 60); // dựng xe trong hầm phòng trọ
  }
  // Gửi bảo vệ (chung cư…) → xe được trông tới khi lấy
  markParkedSafe() {
    if (!this.gs.parked) return;
    this.gs.parked.safe = true;
    if (this.gs.parked.kind === 'street') this.gs.parked.kind = 'guard';
  }
  // Mỗi phút xe đứng ngoài đường (người chơi đang đi bộ): xét rủi ro dán phạt / cẩu / trộm
  parkTick() {
    const p = this.gs.parked;
    if (!p || (p.safe && (!p.kind || p.kind === 'garage')) || this.mode !== 'foot' || !this.parkRng) return;
    const to = Math.floor(this.clockMin);
    for (let m = p.checked + 1; m <= to && this.gs.parked === p; m++) {
      p.checked = m;
      const bx = this.bike.pos.x, bz = this.bike.pos.z, theftMul = traitAt(bx, bz, 'theft');
      // nón chở khách để trên xe bị lấy mất (cả ở bãi giữ xe)
      if (this.gs.passengerHelmets().length && helmetRoll(this.parkRng, m, p, { theftMul })) {
        p.helmetLost = true;
        this.onHelmetLost(this.gs.losePassengerHelmet(), fmt(p.safe ? 'toast.helmetStolenLot' : 'toast.helmetStolen'));
      }
      if (p.safe) continue;
      const canTow = !!towTarget(this.layout.places, bx, bz);
      const ev = parkingRoll(this.parkRng, m, p, { canTow, hasCargo: this.om.hasCargo, towMul: traitAt(bx, bz, 'tow'), theftMul });
      if (ev) this.onParkingEvent(ev);
    }
  }
  // Đang dùng xe đạp → công an / phường không phạt gì (thẻ ⚖️ Cân bằng → economy.pedalNoFines: 1 = bật luật này, 0 = phạt như thường)
  // Nhạc riêng của bước cốt truyện đang chạy (story.json → music). Mã chưa gắn file → null (giữ nhạc ngày / đêm)
  storyMusic() {
    const s = this.gs?.story, id = s?.ch ? stepOf(s)?.music : null;
    if (!id) return null;
    if (hasMusic(id)) return id;
    const alt = MUSIC_FALLBACK[id]; // chưa gắn file → tạm phát nhạc dự phòng (vd nhạc bị rượt → nhạc dí cướp)
    return alt && hasMusic(alt) ? alt : null;
  }
  // Bước cốt truyện có noFines (vd đang đuổi theo tên cướp) → cũng không phạt
  noFines() {
    const s = this.gs?.story, st = s?.ch && s.fired ? stepOf(s) : null;
    if (st?.noFines) return true;
    return (ECONOMY.pedalNoFines ?? 1) > 0 && this.gs?.power === 'pedal';
  }

  onParkingEvent(ev) {
    const { gs } = this;
    if ((ev === 'ticket' || ev === 'tow') && this.noFines()) return; // xe đạp: không dán phạt, không cẩu
    const P = PARKING;
    let msg = '';
    if (ev === 'ticket') {
      const station = nearestStation(this.layout.places, this.bike.pos.x, this.bike.pos.z);
      gs.parked.ticketed = true;
      if (station) {
        // có đồn công an → phạt nguội, nộp ở đồn trước hạn
        gs.addFine(P.ticketFine ?? 50, 'parking', this.clockMin);
        msg = fmt('toast.parkTicketFine', { fine: P.ticketFine ?? 50, days: P.fineDays ?? 3, place: station.name });
      } else {
        const fine = Math.min(Math.max(0, gs.money), P.ticketFine ?? 50);
        gs.spend(fine, 'parkingTicket', true);
        msg = fmt('toast.parkTicket', { fine: P.ticketFine ?? 50 });
      }
    } else if (ev === 'theft') {
      gs.fuel = Math.max(0, gs.fuel * (1 - (P.theftFuelPct ?? 0.6)));
      gs.bikeHp = Math.max(0, gs.bikeHp - (P.theftHp ?? 15));
      gs.parked.robbed = true;
      msg = fmt('toast.parkTheft', { hp: P.theftHp ?? 15 });
    } else if (ev === 'tow') {
      const lot = towTarget(this.layout.places, this.bike.pos.x, this.bike.pos.z);
      if (!lot) return;
      this.towBikeTo(lot, P.towFee ?? 150);
      msg = fmt('toast.parkTow', { place: lot.name, fee: P.towFee ?? 150 });
    }
    sound('law.parking');
    this.hud.toast(msg, 'bad', 8000);
    this.addChat(fmt('chat.ward'), msg);
  }
  // ======================== CẤP ĐƯỜNG (src/sim/roads.js) ========================
  // Đoạn đường đang đứng → cấp đường (vào ngã tư / vỉa hè thì giữ cấp của đoạn vừa đi). Chạy sang đường chậm hơn thì nhắc.
  roadTick(mounted) {
    const seg = roadSegAt(this.playerPos.x, this.playerPos.z);
    if (!seg) return;
    const t = tierOf(seg.id);
    if (t === this.roadTier) return;
    const slower = this.roadTier && speedLimitOf(t, ECONOMY.speedLimit) < speedLimitOf(this.roadTier, ECONOMY.speedLimit);
    this.roadTier = t;
    if (slower && mounted) this.toastOnce(`road-${t}`, fmt('toast.roadTier', { road: tierLabel(t), limit: this.speedLimitKmh() }), 'info', 25);
  }
  // ======================== NGẬP ĐƯỜNG (src/sim/flood.js) ========================
  // Mực nước 0..1 ngay chỗ đang đứng (trên phà / mặt cầu, dốc cao: khô)
  floodHere() {
    if (!this.hz || this.ferryRide) return 0;
    const now = this.clockMin, p = this.playerPos;
    if ((this.mode === 'bike' ? this.bike.mesh : this.walker.mesh).position.y > 0.5) return 0;
    return depthAtPoint(p.x, p.z, (id) => this.hz.floodDepth(id, now));
  }
  // Mỗi bước: báo khi lội vào nước · chạy nhanh qua nước sâu thì có thể chết máy (hư xe) · dắt ra chỗ cạn thì đề lại
  floodTick(dt, water, speed, mounted) {
    const gs = this.gs, band = floodBand(water);
    if (band > this.floodBandNow) {
      if (mounted && speed > 3) sound('drive.splash');
      this.toastOnce(band >= 2 ? 'floodDeep' : 'floodShallow', fmt(band >= 2 ? 'toast.floodDeep' : 'toast.floodShallow'), band >= 2 ? 'bad' : 'warn', 60);
    }
    this.floodBandNow = band;
    if (this.stalled) {
      // đang ngồi / dắt xe ở chỗ cạn (dưới mức ngập sâu) đủ vài giây → đề lại được
      this.stallDry = mounted && band < 2 ? (this.stallDry || 0) + dt : 0;
      if (this.stallDry >= floodNum('restartSec')) {
        this.stalled = false;
        this.hud.toast(fmt('toast.restart'), 'good', 2500);
      }
      return;
    }
    const engine = mounted && gs.power !== 'pedal' && gs.fuel > 0; // xe đạp không có máy để chết
    if (!engine || band < 2 || speed * 3.6 <= floodNum('stallKmh')) return;
    if (Math.random() >= 1 - Math.pow(1 - floodNum('stallChance'), dt)) return; // khả năng mỗi giây
    const ev = gs.power === 'electric', hp = floodNum(ev ? 'stallHpElec' : 'stallHp');
    this.stalled = true;
    this.stallDry = 0;
    gs.bikeHp = Math.max(0, gs.bikeHp - hp);
    this.shake = Math.max(this.shake, 0.25);
    sound('drive.stall');
    this.hud.toast(fmt(ev ? 'toast.stallElec' : 'toast.stall', { hp }), 'bad', 6000);
  }

  // Mỗi tối (rideEvents.rumorHour) nhóm tài xế đồn 1 "điểm nóng" hay có khách lừa đảo — đúng nơi kẻ lừa đảo hay đón đêm nay
  // (OrderManager.scamHotspot). Chỉ người đã vào hãng (ở trong nhóm) mới đọc được.
  scamRumorTick() {
    const gs = this.gs;
    const h = tod(this.clockMin) / 60, late = h < TIME.dayStart / 60 ? h + 24 : h; // sau nửa đêm vẫn là "tối nay" của ngày chơi này
    if (!gs.brand || this.rumorDay === gs.day || late < (RIDE_EVENTS.rumorHour ?? 20.5)) return;
    this.rumorDay = gs.day;
    const p = scamHotspot(gs.day, this.layout);
    if (p) this.groupChat(fmt('chat.group'), fmt('chat.scamRumor', { place: p.name }));
  }

  // ======================== CẢN TRỞ GIAO THÔNG ========================
  // Có xe (buýt, ô tô, xe máy NPC) phải dừng vì mình đứng chắn liên tục: phút blockWarnMin → cảnh báo,
  // phút blockFineMin → công an tới (interactions.blockTicket). Tránh ra quá 3 giây thật thì đếm lại từ đầu.
  blockTick(dMin, dt) {
    if (this.copMesh && (this.copT -= dt) <= 0) this.removeCop(); // công an đứng thêm vài giây sau khi nói xong rồi đi
    const blocking = this.traffic.blockedByPlayer || this.traffic.busBlockedByPlayer;
    if (blocking) {
      this.blockGap = 0;
      this.blockMin = (this.blockMin || 0) + dMin;
    } else if ((this.blockGap = (this.blockGap || 0) + dt) > 3) this.blockMin = 0;
    if (!blocking) return;
    if (this.blockMin >= (ECONOMY.blockWarnMin ?? 10)) this.toastOnce('blockWarn', fmt('toast.blockWarn'), 'warn', 30);
    if (this.blockMin >= (ECONOMY.blockFineMin ?? 15)) {
      this.blockMin = 0;
      if (!this.noFines()) act.blockTicket(this); // xe đạp: không phạt cản đường
    }
  }
  // Đưa người chơi (và xe nếu đang ngồi xe) vào lề đường gần nhất
  moveToCurb() {
    const onBike = this.mode === 'bike', p = this.playerPos;
    const q = curbSpot(p.x, p.z, onBike);
    // dời cả hình (lúc hộp thoại mở game không cập nhật hình nên phải tự đặt)
    if (onBike) {
      this.bike.pos.set(q.x, this.bike.pos.y, q.z);
      this.bike.mesh.position.set(q.x, this.bike.mesh.position.y, q.z);
      this.bike.speed = 0;
      this.bike.vel?.multiplyScalar?.(0);
    } else {
      this.walker.pos.set(q.x, this.walker.pos.y, q.z);
      this.walker.mesh.position.set(q.x, 0.15, q.z); // đứng trên vỉa hè
    }
    return q;
  }
  // Anh công an đứng cạnh người chơi (phía lòng đường), quay mặt vào người chơi
  spawnCop() {
    this.removeCop();
    const p = this.playerPos, m = makePerson({ shirt: 0xd8c25a, pants: 0x2e5d3a, hat: 'police' });
    const s = roadSegAt(p.x, p.z);
    const toRoad = s ? (s.axis === 'x' ? [Math.sign(roadPos(s.line) - p.x) || 1, 0] : [0, Math.sign(roadPos(s.line) - p.z) || 1]) : [1, 0];
    const x = p.x + toRoad[0] * 1.3 + toRoad[1] * 0.6, z = p.z + toRoad[1] * 1.3 + toRoad[0] * 0.6;
    m.position.set(x, 0.15, z);
    m.rotation.y = Math.atan2(p.x - x, p.z - z);
    this.scene.add(m);
    this.copMesh = m;
    this.copT = 4; // giây (chỉ đếm khi game chạy, tức là sau khi đóng hộp thoại)
  }
  removeCop() {
    if (this.copMesh) this.scene.remove(this.copMesh);
    this.copMesh = null;
  }

  // Được hủy đơn vì ngập không (chưa lấy hàng + chỗ lấy / chỗ giao đang ngập)
  floodCancelOk() {
    const now = this.clockMin;
    return !!this.hz && floodCancelOk(this.om.state, this.om.order, (id) => this.hz.floodDepth(id, now));
  }

  // Giới hạn tốc độ nơi đang chạy (m/s / km/h)
  speedLimit() {
    return speedLimitOf(this.roadTier || 'normal', ECONOMY.speedLimit);
  }
  speedLimitKmh() {
    return Math.round(this.speedLimit() * 3.6);
  }

  // ======================== SÂN BAY (src/sim/airport.js) ========================
  // Gọi mỗi bước: phí vào cổng khi chạy xe vào khuôn viên (1 lần mỗi lượt), nhắc khi chạy tới barie chân dốc,
  // xe đứng yên / bỏ lại trong vùng cấm dừng trước sảnh → bảo vệ thổi còi rồi phạt (mỗi lần dừng 1 lần)
  airportTick(speed = 0) {
    const { gs, bike } = this;
    const places = this.layout.places;
    const mounted = this.mode === 'bike';
    const { x, z } = bike.pos;
    const ap = airportAt(places, x, z);
    if (ap && mounted && !this.airportVisit) {
      this.airportVisit = ap.id;
      const fee = AIRPORT.gateFee ?? 5;
      if (fee > 0) gs.spend(fee, 'airportGate', true);
      this.hud.toast(fmt('toast.airportGate', { fee }), 'info', 6000);
    } else if (!ap && this.airportVisit) {
      // ra xa hẳn khỏi khuôn viên (> 10 m) mới tính lượt mới, chạy sát mép không bị trừ lặp
      const p = this.layout.placeById[this.airportVisit];
      const out = p ? Math.max(p.x0 - x, x - p.x1, p.z0 - z, z - p.z1) : Infinity;
      if (out > 10) this.airportVisit = null;
    }
    if (mounted) for (const b of this.city.barriers || []) if (Math.hypot(b.x - x, b.z - z) < 4.5) this.toastOnce('airportNoBike', fmt('toast.airportNoBike'), 'warn', 20);
    // cấm dừng: đang ngồi xe mà đứng yên, hoặc đã xuống xe và để xe ở đó
    const ns = airportNoStopAt(places, x, z);
    if (!ns || (mounted && speed >= 0.6) || gs.towed) {
      this.noStop = null;
      return;
    }
    if (!this.noStop) this.noStop = { since: this.clockMin, warned: false, fined: false };
    const ev = noStopStep(this.noStop, this.clockMin, AIRPORT);
    if (ev === 'warn') {
      this.noStop.warned = true;
      sound('law.airport');
      this.hud.toast(fmt('toast.airportWarn'), 'warn', 6000);
    } else if (ev === 'fine') {
      this.noStop.warned = this.noStop.fined = true;
      if (this.noFines()) return; // xe đạp: không phạt
      const fine = AIRPORT.noStopFine ?? 50;
      const station = nearestStation(places, x, z);
      let msg;
      if (station) {
        gs.addFine(fine, 'airport', this.clockMin);
        msg = fmt('toast.airportFine', { fine, days: PARKING.fineDays ?? 3, place: station.name });
      } else {
        gs.spend(fine, 'airportFine', true);
        msg = fmt('toast.airportFineNow', { fine });
      }
      sound('law.airport');
      this.hud.toast(msg, 'bad', 8000);
      this.addChat(fmt('chat.airportGuard'), msg);
    }
  }

  // Phạt nguội quá hạn → tiền tăng, báo một lần
  fineTick() {
    for (const f of this.gs.updateFines(this.clockMin)) {
      const msg = fmt('toast.fineOverdue', { fine: f.amount });
      this.hud.toast(msg, 'bad', 7000);
      this.addChat(fmt('chat.ward'), msg);
    }
  }
  nearestStation() {
    const p = this.playerPos;
    return nearestStation(this.layout.places, p.x, p.z);
  }
  // Địa điểm gần nhất (theo đường đi thật) thỏa điều kiện, đã khai trương — null nếu không có
  nearestPlace(test) {
    const p = this.playerPos;
    let best = null, bestD = Infinity;
    for (const pl of this.layout.places) {
      if (!test(pl) || !pl.door || !unlocked(pl, this.gs.progress)) continue;
      const d = routeDist(p, pl.door);
      if (d < bestD) [best, bestD] = [pl, d];
    }
    return best;
  }
  // Hướng dẫn người mới (chưa vào hãng): Tab mở điện thoại → app Bản đồ → nút "Văn phòng hãng" → chọn 1 hãng, Chỉ đường
  // → cất máy, đi theo mũi tên → bấm E ở văn phòng để đăng ký. Bước tính lại theo trạng thái lúc này (đóng máy giữa chừng thì quay lại bước 1).
  tutorialStep() {
    if (this.gs?.story?.ch) return this.storyGuide(); // đang theo cốt truyện: hướng dẫn theo bước (src/sim/story.js)
    if (!this.gs || this.gs.brand || (this.gs.flags.story ?? 2) < 2 || this.gs.flags.tutSkip) return null; // chỉ sau khi đã leo lên xe đạp Cô Hai cho; bấm "Bỏ qua hướng dẫn" thì thôi
    if (this.nearOffice()) return 'talk'; // đã tới văn phòng hãng: chỉ còn bấm E nói chuyện (không quay lại bước mở Bản đồ)
    const wp = this.waypoint && this.layout.placeById[this.waypoint];
    if (wp?.kind === 'office') return this.phone.open ? 'close' : 'go';
    if (!this.phone.open) return 'phone';
    if (this.phone.app !== 'map') return 'map';
    const cm = this.phone.cityMap;
    return cm.type === 'office' || cm.sel?.kind === 'office' ? 'route' : 'office';
  }
  // Văn phòng hãng ngay cạnh (≤ 8 m) khi chưa vào hãng → hướng dẫn "bấm E đăng ký" thay cho "mở Bản đồ tìm văn phòng"
  nearOffice() {
    if (!this.gs || this.gs.brand) return null;
    const off = this.nearestPlace((p) => p.kind === 'office');
    return off && dist2(this.playerPos, off.door) < 8 ? off : null;
  }
  // Xe đang ở đâu (app Xe → Định vị xe): tên đường gần nhất (không có thì tên khu phố), quãng đường từ chỗ mình đứng
  bikeWhere() {
    const b = this.bike.pos;
    const street = streetAt(b.x, b.z, 40) || districtAtPoint(b.x, b.z)?.name || '';
    return { street, dist: fmtDist(routeDist(this.playerPos, b)), riding: this.mode === 'bike', towed: !!this.gs.towed };
  }
  // Nơi bảo dưỡng xe đang dùng: xe xăng → tiệm sửa xe (thay nhớt) · xe điện → trạm đổi pin
  nearestGarage() {
    const kind = this.gs.power === 'electric' ? 'swap' : this.gs.power === 'gas' ? 'garage' : null;
    return kind ? this.nearestPlace((p) => p.kind === kind) : null;
  }

  // Xe bị cẩu: đặt ở vỉa hè trước bãi giữ xe / đồn công an, phải chuộc mới lấy được
  // Xe hãng cấp khi vào hãng: dựng ngay trước cửa văn phòng (lệch ra phía đường), tính giờ đậu lại từ đầu
  // (không thì xe đạp đã để ngoài đường lâu → xe hãng vừa nhận bị tính đậu quá giờ, bị cẩu ngay)
  parkBikeAtPlace(pl) {
    if (!pl?.door || this.mode === 'bike') return;
    const cx = (pl.x0 + pl.x1) / 2, cz = (pl.z0 + pl.z1) / 2;
    const dx = pl.door.x - cx, dz = pl.door.z - cz, n = Math.hypot(dx, dz) || 1;
    this.bike.pos.set(pl.door.x + (dx / n) * 2.5, 0, pl.door.z + (dz / n) * 2.5);
    this.bike.speed = 0;
    this.bike.vel.set(0, 0);
    this.bike.update(0.016, {}, { mounted: false, fuel: 1, hp: 100, wet: false, grid: this.city.grid, elev: this.city.elev, potholes: [], emit: () => {} });
    this.startParking(true);
  }

  towBikeTo(lot, fee) {
    const { bike, gs } = this;
    bike.pos.set(lot.door.x, 0, lot.door.z);
    bike.speed = 0;
    bike.vel.set(0, 0);
    this.bike.update(0.016, {}, { mounted: false, fuel: 1, hp: 100, wet: false, grid: this.city.grid, elev: this.city.elev, potholes: [], emit: () => {} });
    gs.towed = { placeId: lot.id, fee };
    gs.parked = { since: this.clockMin, safe: true, ticketed: true, robbed: true, checked: Math.floor(this.clockMin) };
  }

  // ======================== ĐÈN GIAO THÔNG: VƯỢT ĐÈN ĐỎ ========================
  // Đi xe vào lòng ngã tư có đèn: nhớ phía đi vào + màu đèn lúc vào. Ra khỏi ngã tư: biết rẽ hướng nào →
  // vào lúc đèn đỏ mà không rẽ phải (và chạy nhanh hơn lights.minSpeed) = vượt đèn đỏ → redLightViolation.
  redLightTick(mounted, speed) {
    if (this.noFines()) return; // xe đạp: vượt đèn không bị phạt / ghi hình
    const p = this.bike.pos;
    const i = Math.round((p.x - CITY.ORIGIN) / CITY.PITCH), j = Math.round((p.z - CITY.ORIGIN) / CITY.PITCH);
    const key = `${i},${j}`, dx = p.x - roadPos(i), dz = p.z - roadPos(j), H = CITY.ROAD / 2;
    const inside = mounted && this.lmap.has(key) && Math.abs(dx) < H && Math.abs(dz) < H && (this.bike.mesh.position.y || 0) < 1;
    const cur = this.inLight;
    if (inside && !cur) {
      // đi vào từ phía nào: phía lệch xa tâm nhất (vd đang ở phía z âm → đang chạy theo +z)
      const din = Math.abs(dz) > Math.abs(dx) ? [0, -Math.sign(dz) || 1] : [-Math.sign(dx) || 1, 0];
      this.inLight = { key, din, red: lightColor(key, din, this.lightT) === 'r', fast: speed > (LIGHTS.minSpeed ?? 2.5) };
    } else if (cur && (!inside || key !== cur.key)) {
      this.inLight = null;
      if (!cur.red || !cur.fast) return;
      const [ci, cj] = cur.key.split(',').map(Number);
      const ex = p.x - roadPos(ci), ez = p.z - roadPos(cj);
      const dout = Math.abs(ez) > Math.abs(ex) ? [0, Math.sign(ez) || 1] : [Math.sign(ex) || 1, 0];
      if (turnOf(cur.din, dout) !== 'right') this.redLightViolation(cur.key, ci, cj);
    }
  }
  // Vượt đèn đỏ: tài xế quanh đó bóp còi; lần đầu mỗi ngày chỉ nhắc (lights.warnFirst); đã bị phạt đủ maxPerDay thì thôi;
  // còn lại tung xúc xắc theo % (chốt CSGT > camera > thường) → bị ghi hình thì sau delayMin–delayMax phút app CSGT báo phạt nguội.
  redLightViolation(key, i, j) {
    const L = LIGHTS, gs = this.gs, now = this.clockMin;
    if (Math.random() < 0.6) sound('city.honk');
    if (this.redDay !== gs.day) Object.assign(this, { redDay: gs.day, redCount: 0, redTickets: 0 });
    this.redCount++;
    const place = intersectionName(i, j);
    // vượt đèn đỏ ngay trước mặt xe CSGT tuần tra → bị dừng xe phạt luôn (không nhắc lần đầu, không tung xúc xắc)
    const pat = !this.cheat.noPolice && this.patrolNear();
    if (pat) {
      this.patrolSeen.set(pat.id, this.clockMin);
      return act.patrolStop(this, 'red', 0, place);
    }
    if (this.redCount === 1 && (L.warnFirst ?? 1)) return this.hud.toast(fmt('toast.redWarn', { place }), 'warn', 5000);
    if (this.redTickets >= (L.maxPerDay ?? 2)) return;
    const police = this.hz.activePolice(now).some((c) => c.node && c.node[0] === i && c.node[1] === j);
    if (Math.random() >= ticketChance({ cam: this.lmap.get(key)?.cam, police })) return;
    this.redTickets++;
    const lo = L.delayMin ?? 30, hi = Math.max(lo, L.delayMax ?? 60);
    this.pendingTickets.push({ at: now + lo + Math.random() * (hi - lo), place });
  }
  // phạt nguội đến hạn báo: cộng vào phạt nguội (nộp ở đồn), app CSGT có chấm đỏ + thông báo
  ticketTick() {
    if (!this.pendingTickets.length) return;
    const now = this.clockMin;
    for (const t of this.pendingTickets.filter((x) => now >= x.at)) {
      const fine = LIGHTS.fine ?? 100;
      this.gs.addFine(fine, 'redLight', now);
      this.hud.toast(fmt('toast.redTicket', { fine, place: t.place }), 'bad', 7000);
      this.phone.notify('police', { title: fmt('phone.redTicketTitle'), text: fmt('phone.redTicketText', { place: t.place, fine }) });
      sound('phone.message');
    }
    this.pendingTickets = this.pendingTickets.filter((x) => now < x.at);
  }
}
