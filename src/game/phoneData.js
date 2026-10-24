// =============================================================
// GAME — APP TÍCH TẮC + dữ liệu cho điện thoại (renderPhone)
// Phần của lớp Game (src/game.js): các hàm ở đây gắn vào Game.prototype (mixParts) → dùng this như trong game.js.
// =============================================================
import * as THREE from 'three';
import { TIME, RIDE_EVENTS } from '../data/balance.js';
import { recentThieves } from '../sim/dogThief.js';
import { APP } from '../data/apps.js';
import { ITEMS } from '../data/items.js';
import { openDayOf } from '../sim/placeRules.js';
import { tod } from '../sim/clock.js';
import { inHours } from '../sim/hours.js';
import { segmentRect, roadPos, routeDist, segmentName, intersectionName, nodePos } from '../sim/cityLayout.js';
import { buildFeed } from '../sim/feed.js';
import { fmtDist } from '../sim/nav.js';
import { S, scamHotspot } from '../sim/OrderManager.js';
import { chapterOf, inChapter } from '../sim/story.js';
import { fmt } from '../content/index.js';
import { fmtTime } from './shared.js';

export class PhoneDataPart {
  // ======================== APP TÍCH TẮC (chỉ để vui) ========================
  // Chuyện đang xảy ra trong game lúc này → tin nóng (sim/feed.js). Danh sách đổi mỗi giờ trong game.
  feedNow() {
    const now = this.clockMin, hz = this.hz, gs = this.gs;
    const key = `${gs.day}:${Math.floor(tod(now) / 60)}:${(gs.story?.tt || []).length}`; // có tin cốt truyện mới → làm lại
    if (this.feedCache?.key === key) return this.feedCache.feed;
    const mid = (seg) => { const r = segmentRect(seg); return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, axis: seg.axis }; };
    const uniq = (arr) => arr.filter((x, i) => arr.findIndex((y) => y.street === x.street) === i);
    const rain = hz.rainAt(now);
    const t = hz.tide, hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
    const h = tod(now) / 60, late = h < TIME.dayStart / 60 ? h + 24 : h;
    const scam = gs.brand && late >= (RIDE_EVENTS.rumorHour ?? 20.5) ? scamHotspot(gs.day, this.layout) : null;
    const facts = {
      forecast: hz.forecastText(),
      raining: !!rain,
      heavy: !!rain?.heavy,
      flood: uniq(hz.floodedSegs(now).map((s) => ({ street: segmentName(s), at: mid(s) }))),
      tide: t ? { from: hhmm(t.start), peak: hhmm(t.peak), to: hhmm(t.end) } : null,
      jams: uniq(hz.activeJams(now).map((s) => ({ street: segmentName(s), at: mid(s) }))),
      police: hz.activePolice(now).map((p) => ({ place: intersectionName(...p.node), at: { ...nodePos(...p.node), axis: 'x' } })),
      openings: this.layout.places.filter((p) => openDayOf(p) === gs.day && gs.day > 1).map((p) => ({ place: p.name, at: { placeId: p.id } })),
      scam: scam ? { place: scam.name, at: { placeId: scam.id } } : null,
      wallet: gs.hasItem('wallet'),
      dogThief: recentThieves(now, this.worldSeed).filter((e) => e.street).map((e) => ({ street: e.street, at: { x: e.x, z: e.z, axis: e.side % 2 ? 'x' : 'z' } })),
      me: { name: gs.profile?.name || fmt('profile.defaultName'), orders: gs.stats.completed, stars: gs.rating, day: gs.day },
    };
    const base = buildFeed({ facts, places: this.layout.places, seed: gs.day * 97 + Math.floor(tod(now) / 60) });
    const feed = [...base.slice(0, 5), ...this.storyTtFeed(), ...base.slice(5)]; // tin cốt truyện nằm thứ 6: lướt vài tin mới tới
    this.feedCache = { key, feed };
    return feed;
  }
  // Chụp ảnh cho tin "photo" của app Tích Tắc: camera đặt bên kia đường nhìn vào mặt tiền địa điểm (hoặc nhìn dọc đoạn đường),
  // vẽ 1 khung vào canvas chính rồi cắt khung dọc 9:16, vẽ lại khung game ngay sau đó (không bị chớp). Trả về canvas 270×480.
  // ảnh tin cốt truyện chụp được lúc hiện tin → giữ lại vào bản lưu (người lạ đi rồi vẫn còn ảnh)
  snapPhoto(post) {
    const cv = this.snapPhotoRaw(post);
    if (cv && post.story && post.media?.at?.story !== undefined && this.gs.story && !this.gs.story.ttShots?.[post.story] && cv.toDataURL) {
      try { (this.gs.story.ttShots ||= {})[post.story] = cv.toDataURL('image/jpeg', 0.8); } catch { /* bỏ qua */ }
    }
    return cv;
  }
  snapPhotoRaw(post) {
    const at = post.media.at;
    if (!at) return null;
    let eye, look;
    const kept = post.story && this.gs.story?.ttShots?.[post.story]; // tin cốt truyện: ảnh đã chụp sẵn lúc đăng
    if (kept) { const img = new Image(); img.src = kept; return img; }
    if (at.story !== undefined) { // tin cốt truyện: chụp người lạ / chỗ đã định
      const shot = this.storyTtShot(at.story);
      if (!shot) return null;
      ({ eye, look } = shot);
    } else if (at.placeId) {
      const p = this.layout.placeById[at.placeId];
      if (!p?.door) return null;
      const n = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[p.face] || [0, 1];
      eye = new THREE.Vector3(p.door.x + n[0] * 12, 1.8, p.door.z + n[1] * 12);
      look = new THREE.Vector3(p.door.x - n[0] * 3, 3.2, p.door.z - n[1] * 3);
    } else {
      const along = at.axis === 'x' ? [0, 1] : [1, 0]; // đoạn đường dọc (x cố định) chạy theo z
      eye = new THREE.Vector3(at.x + along[0] * 16 + along[1] * 2, 4.5, at.z + along[1] * 16 + along[0] * 2);
      look = new THREE.Vector3(at.x, 0.5, at.z);
    }
    const cam = (this.snapCam ||= new THREE.PerspectiveCamera(55, 1, 0.1, 900));
    const r = this.renderer, cv = r.domElement;
    if (!cv.width || !cv.height) return null;
    cam.aspect = cv.width / cv.height;
    cam.fov = 55;
    cam.updateProjectionMatrix();
    cam.position.copy(eye);
    cam.lookAt(look);
    const out = document.createElement('canvas');
    out.width = 270;
    out.height = 480;
    r.render(this.scene, cam);
    const ch = cv.height, cw = Math.min(cv.width, ch * (270 / 480));
    out.getContext('2d').drawImage(cv, (cv.width - cw) / 2, 0, cw, ch, 0, 0, 270, 480);
    r.render(this.scene, this.camera);
    return out;
  }

  renderPhone(tgt) {
    if (!this.gs) return;
    const gs = this.gs;
    const locked = [];
    if (gs.story?.ch && inChapter(gs.story)) locked.push(fmt('phone.lockStory', { title: fmt(chapterOf(gs.story).title) })); // đang trong chương: không có đơn thường
    if (gs.workBlock() === 'noUniform') locked.push(fmt('phone.lockUniform', { brand: gs.brandSpec.name }));
    if (gs.workBlock() === 'wrongVehicle') locked.push(fmt('phone.lockVehicle', { brand: gs.brandSpec.name, kind: fmt(`power.${gs.brandSpec.power}`) }));
    if (gs.bagSpec.insulation < 0.5) locked.push(fmt('phone.lockCold'));
    if (!gs.effect('passengerSeat')) locked.push(gs.brand ? fmt('phone.lockRideBrand', { brand: gs.brandSpec.name }) : fmt('phone.lockRide'));
    else if (gs.flags.noRide && this.om.state !== S.OFFLINE) locked.push(fmt('phone.rideOff')); // có mũ cho khách mà đang tắt Chở khách
    const st = this.nearestStation(), pp = this.playerPos;
    // app Xe: nơi bảo dưỡng gần nhất (tiệm sửa xe / trạm đổi pin) + nơi nạp năng lượng (cây xăng / trụ sạc)
    const app = this.phone.app;
    const near = (pl) => (pl ? { id: pl.id, name: pl.name, dist: fmtDist(routeDist(pp, pl.door)) } : null);
    const gar = app === 'bike' ? this.nearestGarage() : null;
    const fuelKind = gs.power === 'electric' ? 'charger' : gs.power === 'gas' ? 'gas' : null;
    const stop = app === 'bike' && fuelKind ? this.nearestPlace((p) => p.kind === fuelKind) : null;
    // app hãng khi chưa vào hãng: văn phòng các hãng để chỉ đường tới đăng ký
    const offices = app === 'goship' && gs.workBlock() === 'noBrand' ? this.layout.places.filter((p) => p.kind === 'office' && p.door).map(near) : [];
    this.phone.render({
      bikeWhere: app === 'bike' ? this.bikeWhere() : null,
      photos: app === 'camera' ? this.photos() : null, // app Máy ảnh: 3 ô ảnh lưu game
      camBlock: app === 'camera' ? this.camBlock() : null,
      tut: this.tutorialStep(), // hướng dẫn người mới: nhấp nháy app Bản đồ / nút Văn phòng hãng / nút Chỉ đường
      atOffice: !!this.nearOffice(), // đang đứng ở văn phòng hãng (chưa vào hãng): ô tóm tắt nhắc bấm E
      feed: app === 'tictac' ? this.feedNow() : null, // app Tích Tắc
      garage: near(gar),
      fuelStop: near(stop),
      offices,
      now: this.clockMin,
      timeStr: fmtTime(this.clockMin),
      appClosed: !inHours(APP.hours, this.clockMin),
      state: this.om.state,
      floodCancel: this.floodCancelOk(), // hiện nút "Hủy vì ngập"
      offer: this.om.offer,
      offerTimeLeft: this.om.offerTimeLeft,
      order: this.om.order,
      gs,
      receipts: this.om.history,
      itemDefs: ITEMS,
      lockedHints: locked,
      // bản đồ lớn: thêm đường đang chỉ (bản đồ tròn tính sẵn), tuyến phà, địa điểm đang chỉ đường
      // app CSGT: đồn gần nhất (nơi nộp phạt) + chốt CSGT đã biết hôm nay
      station: st ? { id: st.id, name: st.name, dist: fmtDist(routeDist(pp, st.door)) } : null,
      // xe đang bị giữ ở đồn: đồn nào + cách đi (xe buýt tuyến nào, hoặc đi bộ nếu gần)
      held: this.phone.open && this.bikeAtPolice() ? (() => {
        const pl = this.layout.placeById[this.gs.towed.placeId];
        return { id: pl.id, name: pl.name, dist: fmtDist(routeDist(pp, pl.door)), plan: this.mode === 'foot' ? this.planText(pl) : null };
      })() : null,
      checkpoints: this.hz.activePolice(this.clockMin).filter((p) => this.knownPolice.has(p.id)).map((p) => ({
        name: p.name, until: fmtTime(this.clockMin - this.hz.rel(this.clockMin) + p.end), dist: fmtDist(Math.hypot(roadPos(p.node[0]) - pp.x, roadPos(p.node[1]) - pp.z)),
      })),
      waypoint: this.waypoint, // app Tin nhắn: nút 📍 đang chỉ đường
      mapData: { ...this.mapData(tgt === undefined ? this.currentTarget() : tgt), route: this.navPath, ferries: this.ferries?.pairs, waypoint: this.waypoint ? { id: this.waypoint } : null },
    });
  }
}
