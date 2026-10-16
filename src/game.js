// =============================================================
// GAME — điều phối: vòng lặp, nối mô phỏng (src/sim) với thế giới 3D (src/world) và giao diện (src/ui)
// =============================================================
// Các nhóm hàm khác của lớp Game nằm ở src/game/ (sự kiện, luật đường phố, chỉ đường, cốt truyện, hiển thị, điện thoại) — gắn vào ở cuối file.
import * as THREE from 'three';
import { TIME, ECONOMY, ENERGY, HAZARD, DIST, VEHICLES, RIDE_EVENTS, NPC_FLAVOR } from './data/balance.js';
import { garageSpots, inGarage } from './sim/garage.js';
import { startOutfit, GOODS } from './data/goods.js';
import { lookOf } from './data/looks.js';
import { APP, RIDER_TYPES } from './data/apps.js';
import { ITEMS } from './data/items.js';
import { openDayOf } from './sim/placeRules.js';
import { dayOf, dayStartAt, tod, isDark } from './sim/clock.js';
import { buildLayout, segmentRect, roadPos, districtAtPoint, streetAt, intersectionName } from './sim/cityLayout.js';
import { lightMap } from './sim/lights.js';
import { buildTrafficLights } from './world/trafficLights.js';
import { makeRng } from './sim/rng.js';
import { GameState, START_VEHICLE } from './sim/GameState.js';
import { OrderManager, S } from './sim/OrderManager.js';
import { HazardManager } from './sim/hazards.js';
import { floodBand, floodSpeedCap, floodNum, nearestSegId } from './sim/flood.js';
import { storyEvent } from './sim/story.js';
import { buildCity } from './world/city.js';
import { Bike, Walker, CameraRig, lerpAngle } from './world/controllers.js';
import { Traffic } from './world/traffic.js';
import { buildFerries } from './world/ferry.js';
import { makeStallPeople } from './world/stallPeople.js';
import { BgTraffic } from './world/bgTraffic.js';
import { pushCircle } from './world/physics.js';
import { nextBoat, BOAT_DECK } from './sim/ferry.js';
import { Sky } from './world/sky.js';
import { makePerson, makeBeacon, makeZoneRing, npcLook, updatePeopleLod, setPeopleMode } from './world/models.js';
import { makeLabelTexture, makeQuestTexture, makeReactTexture, makeTargetDotTexture } from './world/textures.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import { Phone } from './ui/phone.js';
import { Modal } from './ui/modal.js';
import { Spotlight } from './ui/spotlight.js';
import { Screens } from './ui/screens.js';
import * as act from './interactions.js';
import { sound, setEngine, setRain, unlockAudio, setMuted, setVolumes, setMusic, cityAmbience } from './audio.js';
import { loadSettings, saveSettings, normSettings } from './settings.js';
import { fmt } from './content/index.js';
import { ChatChannel } from './sim/chat.js';
import { ChatBox } from './ui/chatBox.js';
import { Bubbles, headOf } from './ui/bubbles.js';
import { fmtK } from './sim/economy.js';
import { SAVE_KEY, PHOTO_KEY, PHOTO_SLOTS, SW_H, NO_MOVE, fmtTime, NORMAL, inRect, mixParts } from './game/shared.js';
import { EventsPart } from './game/events.js';
import { RoadRulesPart } from './game/roadRules.js';
import { NavigationPart } from './game/navigation.js';
import { StoryPart } from './game/story.js';
import { VisualsPart } from './game/visuals.js';
import { PhoneDataPart } from './game/phoneData.js';

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    // Esc bấm lúc đang mở popup (hộp thoại, điện thoại, ô chat, bảng cheat) chỉ để đóng popup đó → không bật tạm dừng.
    // Ghi nhận ngay lúc bấm (pha "capture", trước mọi phần xử lý phím khác) vì popup tự đóng trước khi game đọc phím.
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape') this.escPopupAt = this.popupOpen() ? performance.now() : 0; }, true);
    this.debug = new URLSearchParams(location.search).has('debug');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.webgl2 = this.renderer.capabilities.isWebGL2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 700);
    this.rig = new CameraRig(this.camera);

    // ---- thế giới (dựng 1 lần, dùng lại qua các ngày) ----
    this.layout = buildLayout();
    this.worldSeed = 20261006;
    this.potholes = new HazardManager(makeRng(this.worldSeed)).potholes;
    this.city = buildCity(this.scene, this.layout, this.potholes, this.worldSeed);
    this.sky = new Sky(this.scene);
    this.traffic = new Traffic(this.scene, makeRng(99));
    this.traffic.elev = this.city.elev; // xe bot chạy lên cầu theo độ cao mặt cầu
    this.traffic.grid = this.city.grid; // người đi bộ né cây, cột, trạm xe buýt… trên vỉa hè
    // người ăn xin ngồi cạnh cổng chùa, chợ, nhà thờ, bệnh viện, bến xe (theo dữ liệu địa điểm → mọi máy giống nhau)
    this.traffic.placeStill(this.layout.places.filter((p) => p.door && ['pagoda', 'pagodaCourtyard', 'wetMarket', 'cathedral', 'hospital', 'busStation'].includes(lookOf(p))).map((p) => p.door));
    // shipper hãng đối thủ đứng chờ trước vài quán ăn (chọn rải đều theo mã địa điểm → máy nào cũng giống)
    const eats = this.layout.places.filter((p) => p.door && p.kind === 'restaurant' && !p.inAlley).sort((a, b) => (a.id < b.id ? -1 : 1));
    const nw = Math.min(eats.length, NPC_FLAVOR.rivalWaiting ?? 5);
    this.traffic.placeRivals(Array.from({ length: nw }, (_, k) => eats[Math.floor(((k + 0.5) * eats.length) / nw)].door));
    this.traffic.thiefSeed = this.worldSeed; // lịch trộm chó + CSGT tuần tra theo seed thế giới (sim/dogThief.js, sim/patrol.js)
    // chú xe ôm nằm chờ trước địa điểm bật "Có chú xe ôm" (places.json → xeOm, ?editor)
    this.traffic.placeXeOm(this.layout.places.filter((p) => p.xeOm && p.door && !p.inAlley).map((p) => p.door));
    this.stallPeople = makeStallPeople(this.scene, this.city.seats); // khách ngồi ghế nhựa quán cóc (chỉ để nhìn)
    this.bgTraffic = new BgTraffic({ scene: this.scene }); // xe máy chạy ở xa cho đường đông (chỉ để nhìn, không va chạm)
    // đèn giao thông (sim/lights.js): đồng hồ đèn tính bằng giây thật; xe NPC / xe nền dừng đèn đỏ, người chơi vượt đèn đỏ có thể bị phạt nguội
    this.lmap = lightMap();
    this.trafficLights = buildTrafficLights(this.scene, this.lmap, this.city.grid);
    this.lightT = 0;
    this.traffic.lights = { map: this.lmap, t: 0 };
    this.pendingTickets = []; // phạt nguội vượt đèn đỏ chờ báo: { at (phút game), place }
    this.ferries = buildFerries(this.scene, this.layout.places); // phà chạy qua sông theo lịch (src/sim/ferry.js)
    this.ferryRide = null; // đang đi phà: { pair, i, to, withBike, off }
    for (const l of this.city.loops || []) this.traffic.addLoop(l); // xe bot chạy vòng lên sàn ga đi sân bay
    this.bus = this.city.bus; // xe buýt: tuyến + trạm (src/sim/bus.js)
    this.traffic.setBuses(this.bus);
    this.bike = new Bike(this.scene, VEHICLES[START_VEHICLE] || VEHICLES.cub);
    this.walker = new Walker(this.scene);
    this.beacon = makeBeacon();
    this.zoneRing = makeZoneRing();
    this.scene.add(this.beacon, this.zoneRing);
    this.npcs = this.spawnPlaceNpcs();
    // dấu chấm than nhún nhún trên đầu Cô Hai (mở đầu: tới nhà trọ nói chuyện để nhận xe đạp)
    this.questTex = { '!': makeQuestTexture('!'), '?': makeQuestTexture('?'), dot: makeTargetDotTexture() }; // dấu trên đầu NPC: ! có việc mới · ? quay lại nói chuyện · chấm đỏ = mục tiêu đang đuổi
    this.reactTex = { '?': makeReactTexture('?', '#f4d03f'), '!': makeReactTexture('!', '#e53935') }; // dấu cảm xúc (không khung): ? ngạc nhiên vàng · ! giật mình đỏ
    this.questMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.questTex['!'], depthWrite: false, transparent: true }));
    this.questMark.scale.set(0.75, 0.75, 1);
    this.questMark.visible = false;
    this.npcs.home?.add(this.questMark);

    // ---- giao diện ----
    this.input = new Input(canvas);
    // Esc thả con trỏ → tạm dừng (trừ khi Esc đó dùng để đóng popup)
    this.input.onUnlock = () => { if (this.state === 'play' && !this.paused && !this.escForPopup() && !this.popupOpen()) this.pauseGame(); };
    this.hud = new Hud(uiRoot);
    this.modal = new Modal(uiRoot);
    // hướng dẫn người mới: làm tối xung quanh nút cần bấm; nút "Tiếp ▸" / "Đã rõ" của hướng dẫn chữ → cốt truyện sang bước sau
    this.spotlight = new Spotlight(uiRoot, () => storyEvent(this.gs?.story, 'ack'));
    this.hud.onPhone = () => this.togglePhone(); // bấm vào hình điện thoại cạnh bản đồ = phím Tab
    // chat: log bên trái + bong bóng trên đầu (tin người chơi đi qua ChatChannel — sau này nối mạng để chơi nhiều người)
    this.chatCh = new ChatChannel({ me: { id: 'me', name: '' } });
    this.chatBox = new ChatBox(uiRoot, this.chatCh, (t) => this.sendChat(t));
    this.bubbles = new Bubbles(uiRoot, this.camera);
    // góc nhỏ trên cùng bên phải: số khung hình / giây (FPS), cập nhật 2 lần mỗi giây
    this.fpsEl = document.createElement('div');
    this.fpsEl.id = 'fps';
    uiRoot.appendChild(this.fpsEl);
    this.fpsN = 0;
    this.fpsT = 0;
    this.chatCh.on((l) => {
      if (l.kind === 'chat') this.bubbles.show(`p:${l.from}`, () => (l.mine ? headOf(this.walker.mesh) : null), l.text, 'chat'); // người chơi khác: sau này bám theo nhân vật của họ
    });
    this.phone = new Phone(uiRoot, {
      refresh: () => this.renderPhone(),
      action: (a, ds) => act.phoneAction(this, a, ds),
      snap: (post) => this.snapPhoto(post), // app Tích Tắc: chụp ảnh trong thế giới 3D cho tin "photo"
    });
    this.screens = new Screens(uiRoot);

    this.state = 'title';
    this.applySettings(loadSettings(), false); // âm lượng, độ nhạy chuột, đồ họa (lưu trên trình duyệt)
    this.clockMin = TIME.dayStart;
    this.shake = 0;
    this.cooldowns = new Map();
    this.timeScale = 1;
    this.lastT = performance.now();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    // tiếng bấm nút / rê chuột qua nút (menu, hộp thoại, điện thoại) — mã ui.click, ui.hover
    uiRoot.addEventListener('click', (e) => { if (e.target.closest?.('button:not([disabled])')) sound('ui.click'); }, true);
    uiRoot.addEventListener('mouseover', (e) => {
      const b = e.target.closest?.('button:not([disabled])');
      if (b && b !== this.hoverBtn) sound('ui.hover');
      this.hoverBtn = b;
    });
    if (this.debug) {
      window.game = this;
      import('./devtools/autopilot.js').then((m) => (window.autopilot = m));
    }
    // Bảng cheat để test (src/devtools/cheat.js): chỉ khi chạy npm run dev + ?cheat — bản build không có đoạn này
    this.cheat = {}; // cờ cheat đang bật: noPolice, noCrash… (bảng cheat ghi vào)
    if (import.meta.env?.DEV && new URLSearchParams(location.search).has('cheat')) import('./devtools/cheat.js').then((m) => m.mountCheat(this));
    this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // NPC đứng ở cửa các địa điểm (chủ quán, Cô Hai, bảo vệ…)
  spawnPlaceNpcs() {
    const out = {};
    const add = (id, opts, door, face, name, inward = 1.0) => {
      const m = makePerson(npcLook(id, { name, ...opts }));
      const [nx, nz] = NORMAL[face];
      m.position.set(door.x - nx * inward, SW_H, door.z - nz * inward);
      m.rotation.y = Math.atan2(nx, nz);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(name), depthWrite: false, transparent: true }));
      label.scale.set(2.8, 0.52, 1);
      label.position.y = 2.25 / (opts.scale || 1);
      m.add(label);
      m.userData.label = label;
      this.scene.add(m);
      m.userData.placeId = id;
      out[id] = m;
      return m;
    };
    // quán trong hẻm: cửa sát mặt nhà (0,7 m) → NPC đứng lùi ít hơn để không lọt vào tường
    for (const p of this.layout.places) {
      if (!p.npc) continue;
      if (p.kind === 'home') {
        // nhà trọ: cửa là miệng hầm xe → Cô Hai đứng lệch sang bên trên vỉa hè, không chắn lối xe ra vào
        const [hx, hz] = NORMAL[p.face];
        add(p.id, p.npc, { x: p.door.x - (hz ? 1.8 : 0), z: p.door.z - (hx ? 1.8 : 0) }, p.face, p.npc.name, 0.2);
      } else add(p.id, p.npc, p.door, p.face, p.npc.name, p.inAlley ? 0.3 : 1.0);
    }
    const cafe = this.layout.placeById.cafe;
    const [cnx, cnz] = NORMAL[cafe.face]; // đứng lệch 1,6 m dọc theo mặt tiền (hướng nào cũng nằm trên vỉa hè)
    const minh = add('minh', { shirt: 0x34495e, pants: 0x1c2833, gender: 'm' }, { x: cafe.door.x + (cnz ? 1.6 : 0), z: cafe.door.z + (cnx ? 1.6 : 0) }, cafe.face, fmt('npc.minh.name'), 0.4);
    minh.visible = false;
    return out;
  }

  // ======================== VÒNG ĐỜI NGÀY ========================
  loadSave() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch {
      return null;
    }
  }
  writeSave(data) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* chế độ riêng tư: bỏ qua */
    }
  }

  // view: 'menu' (mặc định) | 'new' (mở thẳng phần Chơi mới, vd từ màn hình thua)
  showTitle(view = 'menu') {
    this.state = 'title';
    this.hud.show(false);
    this.phone.toggle(false);
    this.modal.hide();
    setEngine(false, 0);
    setRain(0);
    const save = this.normSave(this.loadSave());
    this.screens.title({
      save: save && this.saveSummary(save),
      webgl2: this.webgl2,
      settings: this.settings,
      view,
      onNew: (profile) => this.newGame(profile),
      onContinue: () => this.startGame(save),
      onSettings: (s) => this.applySettings(s),
    });
  }

  // Thẻ "Tiếp tục": tên, ngày giờ, tiền, điểm, tiền nhà kỳ này, xe (đọc từ bản lưu bằng GameState)
  saveSummary(save) {
    const day = dayOf(save.clock);
    try {
      const gs = new GameState({ day, carry: save.carry });
      return { name: gs.profile.name, day, time: fmtTime(save.clock), money: gs.money, rating: gs.rating, rentPaid: gs.rentPaid, rent: gs.rent, dueDay: gs.rentDueDay, bike: gs.vehicleSpec.name };
    } catch {
      return { name: '', day, time: fmtTime(save.clock), money: 0, rating: 0, rentPaid: false, rent: 0, dueDay: day, bike: '' };
    }
  }

  // Cài đặt: âm lượng / tắt tiếng, độ nhạy chuột, đồ họa (Cao: bóng đổ + nét · Thấp: tắt bóng, giảm độ nét)
  applySettings(s, save = true) {
    const prev = this.settings;
    this.settings = normSettings(s);
    const st = this.settings;
    setVolumes({ music: st.music, sfx: st.sfx });
    this.muted = setMuted(st.muted);
    const high = st.quality === 'high';
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 1);
    if (this.renderer.shadowMap.enabled !== high) {
      this.renderer.shadowMap.enabled = high;
      // bật / tắt bóng đổ: vật liệu phải dựng lại
      this.scene.traverse((o) => { for (const m of [].concat(o.material || [])) m.needsUpdate = true; });
    }
    if (!prev || prev.quality !== st.quality) this.resize();
    setPeopleMode(st.people); // người đi đường: chi tiết theo khoảng cách / luôn đơn giản
    if (save) saveSettings(st);
  }
  // Phím M / nút tắt tiếng: nhớ vào cài đặt
  setMute(on) {
    this.applySettings({ ...this.settings, muted: on });
  }

  // Bản lưu: { v: 2, clock (phút tuyệt đối), carry, seed }. Bản cũ { day, carry, seed } → 06:00 của ngày đó.
  normSave(s) {
    if (!s) return null;
    if (s.v === 2 && Number.isFinite(s.clock)) return s;
    if (Number.isInteger(s.day)) return { v: 2, clock: dayStartAt(s.day), carry: s.carry || null, seed: s.seed ?? 1 };
    return null;
  }
  // profile: { name, gender } đặt ở màn hình Chơi mới
  // profile: { name, gender } đặt ở màn hình Chơi mới · story 0: bắt đầu ở bến xe buýt, đi tìm nhà trọ
  // profile: hồ sơ từ màn tạo nhân vật + sleeves / legs / shoes (áo thun tay dài / ngắn, quần dài / short, giày đen / trắng → mặc sẵn món có sẵn đúng kiểu)
  newGame(profile = null) {
    const { sleeves, legs, shoes, ...prof } = profile || {};
    const carry = profile ? { profile: prof, outfit: startOutfit(GOODS, { sleeves, legs, shoes }) } : {};
    this.startGame({ clock: TIME.dayStart, carry: { ...carry, flags: { story: 0 } }, seed: Math.floor(Math.random() * 1e6) });
  }
  // Lưu game CHỈ ở 2 chỗ: bắt đầu / kết thúc chương (cốt truyện) và app Máy ảnh (người chơi tự chụp, 3 ô).
  // Đơn đang chạy không lưu. Bản lưu mới nhất = "Tiếp tục" ở màn hình chính, "Thử lại" khi thua.
  // withPos: lưu cả chỗ đứng + chỗ xe → mở lại đứng đúng chỗ đó (không thì về hầm xe nhà trọ)
  saveData(withPos = false) {
    const pos = withPos && this.state === 'play' && !this.ferryRide ? {
      x: this.playerPos.x, z: this.playerPos.z, heading: this.mode === 'bike' ? this.bike.heading : this.walker.heading,
      bike: { x: this.bike.pos.x, z: this.bike.pos.z, heading: this.bike.heading },
    } : null;
    return { v: 2, clock: Math.floor(this.clockMin), carry: JSON.parse(JSON.stringify(this.gs.carryOver())), seed: this.seed, ...(pos ? { pos } : {}) };
  }
  saveGame(withPos = false) {
    this.lastSave = this.saveData(withPos);
    this.writeSave(this.lastSave);
  }

  // ---- APP MÁY ẢNH: 3 ô ảnh, mỗi ô = 1 bản lưu (kèm ảnh nhỏ chụp màn hình lúc đó) ----
  photos() {
    try {
      const a = JSON.parse(localStorage.getItem(PHOTO_KEY) || '[]');
      return Array.from({ length: PHOTO_SLOTS }, (_, i) => (a[i]?.save ? a[i] : null));
    } catch {
      return Array(PHOTO_SLOTS).fill(null);
    }
  }
  // Lý do chưa chụp lưu được lúc này (null = được): đang có đơn · đang ngồi trên xe · đi phà · đang dở hội thoại / xếp túi
  camBlock() {
    if (this.om.order || this.om.state === S.OFFERED) return fmt('phone.camBlockOrder');
    if (this.mode === 'bike') return fmt('phone.camBlockBike');
    if (this.ferryRide) return fmt('phone.camBlockFerry');
    if (this.modal.open || this.storyPacking?.isConnected) return fmt('phone.camBlockTalk');
    return null;
  }
  // Ảnh nhỏ 192×108 của khung game hiện tại (vẽ lại 1 khung rồi chép ra)
  thumb() {
    const r = this.renderer, cv = r.domElement;
    if (!cv.width || !cv.height) return '';
    r.render(this.scene, this.camera);
    const out = document.createElement('canvas');
    out.width = 192;
    out.height = 108;
    const k = Math.min(cv.width / 192, cv.height / 108), w = 192 * k, h = 108 * k;
    out.getContext('2d').drawImage(cv, (cv.width - w) / 2, (cv.height - h) / 2, w, h, 0, 0, 192, 108);
    try { return out.toDataURL('image/jpeg', 0.7); } catch { return ''; }
  }
  // Chụp + lưu vào ô i (đã kiểm tra camBlock ở interactions.js): ghi cả bản lưu chính (= "Tiếp tục")
  photoSave(i) {
    const save = this.saveData(true);
    const p = this.playerPos;
    const where = streetAt(p.x, p.z, 40) || districtAtPoint(p.x, p.z)?.name || '';
    const list = this.photos();
    list[i] = { save, img: this.thumb(), day: dayOf(save.clock), time: fmtTime(save.clock), where };
    try {
      localStorage.setItem(PHOTO_KEY, JSON.stringify(list));
    } catch {
      list[i].img = ''; // đầy bộ nhớ trình duyệt: bỏ ảnh nhỏ, vẫn lưu game
      try { localStorage.setItem(PHOTO_KEY, JSON.stringify(list)); } catch { /* chế độ riêng tư: bỏ qua */ }
    }
    this.lastSave = save;
    this.writeSave(save);
    sound('phone.shutter');
    document.getElementById('camFlash')?.remove();
    const fl = document.createElement('div');
    fl.id = 'camFlash';
    document.body.appendChild(fl);
    setTimeout(() => fl.remove(), 700);
    return list[i];
  }
  // Quay lại lúc chụp ảnh i
  photoLoad(i) {
    const ph = this.photos()[i];
    if (!ph) return false;
    this.phone.toggle(false);
    this.lastSave = ph.save;
    this.writeSave(ph.save);
    this.startGame(ph.save);
    return true;
  }

  startGame({ clock, carry, seed, pos = null }) {
    this.pendingTickets = []; // ván mới: bỏ phạt nguội vượt đèn đỏ đang chờ báo của ván cũ
    this.inLight = null;
    this.screens.hide();
    this.modal.hide();
    this.seed = seed;
    const day = dayOf(clock);
    this.gs = new GameState({ day, carry });
    if (!carry || carry.awakeSince == null) this.gs.wake(clock); // bản lưu cũ chưa có giờ thức dậy
    this.hz = new HazardManager(makeRng(seed + day * 101), day);
    this.om = new OrderManager({ rng: makeRng(seed * 7 + day), layout: this.layout, gs: this.gs, isRaining: (m) => this.hz.isRaining(m), isFlooded: (door, m) => floodBand(this.hz.floodDepth(nearestSegId(door), m)) >= 1 });
    this.om.on((e) => this.onOrderEvent(e));
    this.clockMin = clock;
    this.waypoint = null; // mã địa điểm người chơi bấm "Chỉ đường" trên bản đồ điện thoại
    this.findBike = false; // đang chỉ đường tới xe (app Xe → Định vị xe)
    this.knownPolice = new Set();
    this.policeChecked = new Set();
    this.cooldowns.clear();
    this.collapsing = false;
    this.stalled = false; // xe chết máy vì lội nước sâu (dắt ra chỗ cạn mới đề lại được)
    this.floodBandNow = 0;
    this.storyOfferAt = 0;
    this.inChapterOf = null; // chương đang diễn (để báo "xong chương — có đơn lại")
    this.storyActorsRestore(); // người lạ của cốt truyện: xóa người của ván trước, dựng lại người đang có mặt ở bước đang chạy
    this.ringAt = 0;
    this.lastSave = { v: 2, clock, carry: JSON.parse(JSON.stringify(this.gs.carryOver())), seed, ...(pos ? { pos } : {}) }; // "Thử lại" khi thua (không ghi đè bản lưu)

    this.placeAtHome(); // xe trong hầm xe phòng trọ (mở đầu: xe đạp đặt sẵn nhưng ẩn tới khi Cô Hai cho)
    if (this.gs.flags.story === 0) this.placeAtBusStation();
    this.bike.setSpec(this.gs.vehicleSpec);
    this.bike.setBag(this.gs.bagSpec);
    this.parkRng = makeRng(this.seed * 13 + day);
    this.lastDistrict = undefined; // lần đầu vào game không báo "Vào khu phố…"
    // bản lưu có chỗ đứng (lưu lúc bắt đầu / kết thúc chương): đứng đúng chỗ đó, xe dựng đúng chỗ cũ (đi bộ)
    if (pos) {
      this.walker.pos.set(pos.x, 0, pos.z);
      this.walker.heading = pos.heading || 0;
      if (pos.bike && !this.gs.towed) {
        this.bike.pos.set(pos.bike.x, 0, pos.bike.z);
        this.bike.heading = pos.bike.heading || 0;
      }
    }
    const towLot = this.gs.towed && this.layout.placeById[this.gs.towed.placeId];
    if (towLot) this.towBikeTo(towLot, this.gs.towed.fee);
    else {
      this.gs.towed = null;
      this.startParking(true);
    }
    this.lookKey = null; // dựng lại ngoại hình shipper theo đồ đang mặc
    this.bike.update(0.016, {}, { mounted: false, fuel: 1, hp: 100, wet: false, grid: this.city.grid, elev: this.city.elev, potholes: [], emit: () => {} });
    this.walker.update(0.016, {}, 0, { grid: this.city.grid, elev: this.city.elev, phys: 100 });
    this.rig.yaw = this.walker.heading + Math.PI; // camera sau lưng người (trong hầm xe / ở bến xe buýt, nhìn ra đường)
    this.rig.init = false;
    this.clearTempNpcs();
    this.traffic.setPolice([]);
    this.traffic.setJams([]);

    this.joinGroupChat(); // đã vào hãng (bản lưu): tin nhóm đầu ngày; chưa vào hãng thì chưa có
    this.state = 'play';
    this.paused = false;
    this.hud.show(true);
    if (this.gs.flags.story === 0 && this.gs.story?.step < 0) this.arriveInCity(); // mở đầu: vừa xuống bến xe buýt
    else {
      this.storyBegin(); // bản lưu giữa chương: chạy tiếp
      this.hud.toast(fmt(day === 1 && clock === TIME.dayStart ? 'toast.dayStart' : 'toast.welcomeBack', { day, rent: this.gs.rent, dueDay: this.gs.rentDueDay, time: fmtTime(clock) }), 'big', 7000);
    }
    this.announceOpenings(day);
  }

  // đặt người + xe trong hầm xe phòng trọ (mới vào game, ngất / kiệt sức): xe dựng sâu trong hầm, đầu quay ra đường
  placeAtHome() {
    this.ferryRide = null; // đang đi phà mà ngất / sang ngày mới → về nhà, bỏ chuyến phà
    const home = this.layout.placeById.home;
    const spot = garageSpots(home);
    if (this.mode === 'bike') this.walker.standUp(this.scene, this.bike);
    this.mode = 'foot';
    if (spot) {
      this.walker.pos.set(spot.walker.x, 0, spot.walker.z);
      this.walker.heading = spot.walker.heading;
    } else {
      const [nx, nz] = NORMAL[home.face];
      this.walker.pos.set(home.door.x + nx * 0.6, 0, home.door.z + nz * 0.6);
      this.walker.heading = Math.atan2(nx, nz);
    }
    if (this.gs?.towed) return; // xe đang ở bãi cẩu → để nguyên, phải tới chuộc
    if (spot) this.bike.pos.set(spot.bike.x, 0, spot.bike.z);
    else this.bike.pos.set(home.door.x + 1.8, 0, home.door.z + 2.4);
    this.bike.heading = spot ? spot.bike.heading : Math.PI / 2;
    this.bike.speed = 0;
    this.bike.vel.set(0, 0);
    if (this.gs && this.parkRng) this.startParking(true); // xe trong hầm: an toàn
  }
  // Mở đầu: người chơi vừa xuống Bến Xe Buýt Trung Tâm (kiểu nhà "Bến xe buýt"), đứng trên vỉa hè quay mặt vào bến
  // (camera ở phía đường nhìn vào → thấy người chơi + bảng tên bến; quay ra đường thì mái che bến xe che mất người chơi)
  placeAtBusStation() {
    const st = this.layout.places.find((p) => lookOf(p) === 'busStation' && p.door) || this.layout.placeById.home;
    const [nx, nz] = NORMAL[st.face] || [0, 1];
    this.walker.pos.set(st.door.x + nx * 0.8, 0, st.door.z + nz * 0.8);
    this.walker.heading = Math.atan2(-nx, -nz);
    this.arrivedAt = st.name;
  }
  // Đặt xe vào chỗ dựng trong hầm xe phòng trọ (Cô Hai vừa cho xe đạp), không dời người
  placeAtHomeBike() {
    const spot = garageSpots(this.layout.placeById.home);
    if (!spot || this.gs.towed) return;
    this.bike.pos.set(spot.bike.x, 0, spot.bike.z);
    this.bike.heading = spot.bike.heading;
    this.bike.speed = 0;
    this.bike.vel.set(0, 0);
    this.startParking(true);
  }
  // Có xe để lên chưa (mở đầu: Cô Hai chưa cho xe đạp thì chưa có)
  bikeReady() {
    return (this.gs?.flags.story ?? 2) >= 1;
  }
  // Hộp thoại "Đã tới Sài Gòn!" lúc vừa vào game → mục tiêu tìm đường tới nhà trọ Cô Hai
  // Nền đen + tiếng phố xá (kèn xe, xe cộ, người cãi nhau); bấm đi tìm nhà trọ thì tiếng nhỏ dần, màn đen mở dần ra cảnh bến xe
  arriveInCity() {
    const home = this.layout.placeById.home;
    cityAmbience(true);
    sound('city.busArrive'); // xe buýt vừa thắng lại ở bến (trang đầu của bảng)
    this.modal.show({
      title: fmt('dlg.arriveTitle'),
      text: fmt('dlg.arriveText', { name: this.gs.profile.name, place: this.arrivedAt || '', home: home?.name || '', address: home?.address || '' }),
      choices: [{ label: fmt('dlg.arriveGo'), primary: true, onSelect: () => { cityAmbience(false); this.fadeFromBlack(); this.storyBegin(); } }],
      dismissible: false,
      backdrop: 'black',
    });
  }
  fadeFromBlack() {
    document.getElementById('fadeIn')?.remove();
    const el = document.createElement('div');
    el.id = 'fadeIn';
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '0'; }));
    setTimeout(() => el.remove(), 2200);
  }
  // Xe đang dựng trong hầm xe phòng trọ (không ngồi trên xe) — điều kiện để đi ngủ
  bikeInGarage() {
    return this.mode === 'foot' && inGarage(this.layout.placeById.home, this.bike.pos.x, this.bike.pos.z);
  }

  // 06:00: sang ngày mới (không dừng game): số liệu theo ngày, thời tiết / CSGT mới, khai trương
  beginDay(day) {
    sound('city.morning');
    this.gs.startDay(day);
    this.hz = new HazardManager(makeRng(this.seed + day * 101), day);
    this.knownPolice = new Set();
    this.policeChecked = new Set();
    this.groupChat(fmt('chat.group'), fmt('chat.forecast', { forecast: this.hz.forecastText() }));
    // nhóm tài xế báo ngã tư có camera phạt nguội vượt đèn đỏ
    const cams = [...this.lmap.values()].filter((n) => n.cam).map((n) => intersectionName(n.i, n.j));
    if (cams.length) this.groupChat(fmt('chat.group'), fmt('chat.cameras', { list: cams.slice(0, 6).join(', ') + (cams.length > 6 ? fmt('chat.camerasMore', { n: cams.length - 6 }) : '') }));
    this.hud.toast(fmt('toast.newDay', { day, rent: this.gs.rent, dueDay: this.gs.rentDueDay, paid: this.gs.rentPaid ? fmt('toast.rentPaidNote') : '' }), 'big', 6000);
    this.announceOpenings(day);
  }
  // đồng hồ vừa qua 06:00 → sang ngày mới
  rollDay() {
    const d = dayOf(this.clockMin);
    if (d !== this.gs.day) this.beginDay(d);
  }

  // khai trương hôm nay (địa điểm / món có openDay = ngày này)
  announceOpenings(day) {
    const opening = this.layout.places.filter((p) => openDayOf(p) === day && day > 1).map((p) => p.name);
    const newItems = Object.values(ITEMS).filter((it) => openDayOf(it) === day && day > 1).map((it) => `${it.icon || ''} ${it.name}`);
    if (opening.length) {
      this.groupChat(fmt('chat.admin'), fmt('chat.grandOpening', { names: opening.join(', ') }));
      this.hud.toast(fmt('toast.grandOpening', { names: opening.join(', ') }), 'good', 7000);
    }
    if (newItems.length) this.groupChat(fmt('chat.admin'), fmt('chat.newItems', { names: newItems.join(', ') }));
  }

  endGame(outcome) {
    if (this.state !== 'play') return;
    this.state = 'over';
    setEngine(false, 0);
    setRain(0);
    this.modal.hide();
    this.phone.toggle(false);
    sound('progress.gameOver');
    const gs = this.gs;
    this.screens.end({
      outcome,
      gs,
      timeStr: `${fmt('hud.day', { day: gs.day })} · ${fmtTime(this.clockMin)}`,
      save: this.lastSave && { day: dayOf(this.lastSave.clock), time: fmtTime(this.lastSave.clock) },
      onRetry: () => this.startGame(this.lastSave),
      onNew: () => this.showTitle('new'), // đặt tên / giới tính + giới thiệu như Chơi mới ở màn hình chính
      onTitle: () => this.showTitle(),
    });
  }

  pauseGame() {
    this.paused = true;
    setEngine(false, 0);
    this.screens.pause({
      muted: this.muted,
      settings: this.settings,
      onSettings: (s) => this.applySettings(s),
      onResume: () => this.resume(),
      onRestart: () => this.startGame(this.lastSave),
      onTitle: () => this.showTitle(),
      onMute: () => {
        this.setMute(!this.muted);
        this.pauseGame();
      },
    });
  }
  resume() {
    this.paused = false;
    this.screens.hide();
  }

  // Đi bộ không xuyên qua xe của mình: thân xe = 2 vòng tròn nhỏ (đầu xe, đuôi xe). Xe bị giữ / đang ẩn thì bỏ qua.
  blockOwnBike() {
    const b = this.bike, w = this.walker;
    if (this.gs.towed || !b.mesh.visible || b.mesh.parent !== this.scene) return;
    if (Math.abs(b.mesh.position.y - w.mesh.position.y) > 1 || Math.hypot(b.pos.x - w.pos.x, b.pos.z - w.pos.z) > 3) return;
    const f = b.forward();
    for (const s of [-0.55, 0.55]) pushCircle(w.pos, 0.35, b.pos.x + f.x * s, b.pos.z + f.z * s, 0.33);
  }

  // ======================== VÒNG LẶP ========================
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    // nhạc nền: màn hình chính → music.menu · đang chơi → nhạc riêng của bước cốt truyện (story.json → music, vd dí cướp)
    // hoặc music.day / music.night theo giờ trong game. Các bước liền nhau cùng nhạc thì phát liền mạch, không chạy lại từ đầu
    setMusic(this.state === 'play' ? this.storyMusic() || (isDark(this.clockMin) ? 'music.night' : 'music.day') : 'music.menu');
    const dt = Math.min(0.05, Math.max(0, (t - this.lastT) / 1000));
    this.fpsN++;
    this.fpsT += Math.max(0, (t - this.lastT) / 1000) || 0; // đo theo thời gian thật (không giới hạn 0,05 giây như dt)
    if (this.fpsT >= 0.5) {
      this.fpsEl.textContent = fmt('hud.fps', { n: Math.round(this.fpsN / this.fpsT) });
      this.fpsN = 0;
      this.fpsT = 0;
    }
    this.lastT = t;
    if (this.state === 'play') this.update(dt);
    else {
      this.input.setLock(false); // màn hình tiêu đề / kết thúc: hiện con trỏ
      this.titleTick(dt);
    }
    // người xa camera vẽ bản đơn giản (6 khung hình xét 1 lần là đủ — người đi chậm)
    if ((this.lodTick = (this.lodTick || 0) + 1) % 6 === 0) updatePeopleLod(this.camera.position);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  // Nền màn hình chính: xe cộ chạy thật trên phố, camera bám sau một xe máy NPC (đổi xe mỗi ~25 giây);
  // trời sáng / tối theo giờ thật của máy
  titleTick(dt) {
    const tr = this.traffic;
    this.titleT = (this.titleT || 0) + dt;
    let m = this.titleMoto;
    if (!m || this.titleT > 25) {
      const motos = tr.agents.filter((a) => a.kind === 'moto');
      m = this.titleMoto = motos[Math.floor(Math.random() * motos.length)] || null;
      this.titleT = 0;
      this.titleJump = true;
    }
    const px = m ? m.x : 0, pz = m ? m.z : 0;
    tr.update(dt, { px, pz, py: 99, onBike: false, speed: 0, fx: 0, fz: 1 }); // py cao: "người chơi" không chắn đường xe NPC
    if (m) {
      const fx = Math.sin(m.heading), fz = Math.cos(m.heading), y = m.y || 0;
      const want = new THREE.Vector3(m.x - fx * 8, y + 3.6, m.z - fz * 8);
      if (this.titleJump || this.camera.position.distanceTo(want) > 40) this.camera.position.copy(want);
      else this.camera.position.lerp(want, 1 - Math.exp(-dt * 2.5));
      this.titleJump = false;
      this.camera.lookAt(m.x + fx * 6, y + 1.2, m.z + fz * 6);
    }
    const d = new Date();
    const { night } = this.sky.update(dt, d.getHours() * 60 + d.getMinutes(), null, { x: px, z: pz }, this.camera);
    this.city.setNight(night);
  }

  update(dt) {
    const inp = this.input;
    // con trỏ: ẩn + xoay camera theo chuột khi đang chơi; mở điện thoại / hộp thoại / tạm dừng thì hiện lại
    // đang hướng dẫn (màn hình tối): thả con trỏ để bấm được nút Tiếp / hình điện thoại
    inp.setLock(this.state === 'play' && !this.paused && !this.phone.open && !this.modal.open && !this.screens.open && !this.chatBox.typing && !this.cheatOpen && !this.spotlight.step);
    // Esc vừa thả con trỏ (trình duyệt) → onUnlock đã tạm dừng; bỏ qua phím Esc đó để không bật tắt 2 lần
    if (inp.was('Escape') && performance.now() - (inp.unlockedAt || 0) < 400) inp.pressed.delete('Escape');
    // đang hướng dẫn (màn hình tối, chỉ sáng nút cần bấm): chặn mọi phím trừ Esc (tạm dừng) và phím số của app đang sáng
    const tut = !this.modal.open && !this.paused && this.spotlight.step;
    if (tut) {
      if (this.spotlight.hasBtn && ['Enter', 'NumpadEnter', 'Space'].some((k) => inp.was(k))) this.spotlight.press(); // Enter / Space = bấm nút Tiếp / Đã rõ
      const app = tut === 'map' ? 'map' : this.spotlight.app; // app đang làm sáng trên màn hình chính
      const appKey = app ? `Digit${this.phone.visibleApps(this.gs).findIndex(([id]) => id === app) + 1}` : null;
      const keys = this.spotlight.keys || [];
      for (const c of [...inp.pressed]) if (c !== 'Escape' && c !== appKey && !(app === 'bag' && c === 'KeyI') && !keys.includes(c)) inp.pressed.delete(c);
      for (const k of Object.keys(inp.state)) inp.state[k] = false;
    }
    if (inp.was('Escape') && !this.modal.open) {
      if (this.paused) this.resume();
      else if (this.phone.open) this.phone.back(); // trong app → về màn hình chính, rồi mới cất máy
      else if (!this.escForPopup()) this.pauseGame(); // Esc vừa đóng popup (hộp thoại, chat…) thì thôi
    }
    if (this.paused) return;
    const frozen = this.modal.open || this.screens.open;
    if (!frozen) {
      if (inp.was('Tab')) this.togglePhone();
      // Enter: mở ô chat (thả hết phím đang giữ để nhân vật đứng lại trong lúc gõ)
      if (inp.was('Enter') || inp.was('NumpadEnter')) {
        for (const k of Object.keys(inp.state)) inp.state[k] = false;
        if (!this.chatBox.typing) sound('chat.open');
        this.chatBox.open();
      }
      if (this.phone.open) this.phone.visibleApps(this.gs).forEach(([id], i) => inp.was(`Digit${i + 1}`) && this.phone.openApp(id)); // phím 1–9 mở app (thứ tự ở phone.json; chưa vào hãng thì không có app hãng)
      else if (this.storyChoice) this.storyChoice.options.forEach((_, i) => (inp.was(`Digit${i + 1}`) || inp.was(`Numpad${i + 1}`)) && this.storyChoose(i)); // cất máy: phím 1/2/3 = chọn câu trả lời
      if (inp.was('KeyM')) this.setMute(!this.muted);
      if (inp.was('KeyI')) this.toggleBag();
      if (inp.was('KeyY')) act.acceptOffer(this);
      if (inp.was('KeyN')) act.declineOffer(this);
      if (inp.was('KeyH') && this.mode === 'bike') {
        sound('drive.horn');
        this.honkNow = true; // traffic.js: bấm còi gần vụ trộm chó thì trộm bỏ chạy
      }
      if (this.debug) this.debugKeys(inp);
      this.simulate(dt);
    } else setEngine(false, 0);
    if (this.state !== 'play') return;
    this.updateCamera(dt);
    this.updateVisuals(dt);
  }

  // Chỉ dùng khi kiểm thử (?debug): chạy game N giây với bước cố định, giữ các phím trong `hold`
  step(seconds = 1, hold = {}, dt = 1 / 60, render = true) {
    const st = this.input.state;
    for (const k of Object.keys(st)) st[k] = !!hold[k];
    for (let t = 0; t < seconds; t += dt) {
      if (this.state === 'play') this.update(dt);
      this.input.endFrame();
    }
    for (const k of Object.keys(st)) st[k] = false;
    if (!render) return null;
    updatePeopleLod(this.camera.position);
    this.renderer.render(this.scene, this.camera);
    return this.snapshot();
  }
  press(code) {
    this.input.pressed.add(code);
    return this.step(1 / 60);
  }
  snapshot() {
    const o = this.om.order;
    return {
      time: fmtTime(this.clockMin), mode: this.mode, state: this.om.state,
      pos: [+this.playerPos.x.toFixed(1), +this.playerPos.z.toFixed(1)], speed: +this.bike.speed.toFixed(2),
      money: +this.gs.money.toFixed(1), rating: +this.gs.rating.toFixed(2), phys: +this.gs.phys.toFixed(1), mental: +this.gs.mental.toFixed(1), fuel: +this.gs.fuel.toFixed(3),
      prompts: (this.prompts || []).map((p) => `${p.key}:${p.label}${p.disabled ? ' (x)' : ''}`),
      order: o ? { id: o.id, kind: o.kind, pickup: o.pickup.name, drop: o.dropoff.address, items: o.items.map((i) => `${i.name} ${i.condition.toFixed(0)}%`) } : null,
      modal: this.modal.open ? this.modal.el.innerText.slice(0, 300) : null,
    };
  }

  debugKeys(inp) {
    if (inp.was('KeyT')) this.advance(30, 'idle');
    if (inp.was('KeyK')) this.gs.earn(100, 'debug');
    if (inp.was('KeyL')) this.gs.fuel = this.gs.vehicleSpec.tank;
  }

  itemEnv(speed = 0, indoor = false) {
    const now = this.clockMin;
    return {
      ambient: this.hz.ambient(now),
      sun: this.hz.sun(now),
      raining: this.hz.isRaining(now),
      exposed: !indoor,
      speed,
      comfortSpeed: ECONOMY.speedLimit + this.gs.effect('comfortKmh') / 3.6,
      suspension: this.gs.vehicleSpec.suspension,
      bag: this.gs.cargoBag,
      passengerRaincoat: this.gs.effect('rainProtect'),
    };
  }

  get playerPos() {
    return this.mode === 'bike' ? this.bike.pos : this.walker.pos;
  }

  simulate(dt) {
    const { gs, om, hz, bike } = this;
    const inp = this.input;
    const now = this.clockMin;
    const rain = hz.rainAt(now);
    const jams = hz.activeJams(now);
    this.traffic.setJams(jams);
    this.traffic.setPolice(hz.activePolice(now));
    const mounted = this.mode === 'bike';
    this.inJam = mounted && jams.some((s) => inRect(segmentRect(s), bike.pos));
    const speed = Math.abs(bike.speed);
    // ngập: mực nước ngay chỗ đang đứng (0..1) → lội chậm, chết máy, hàng ướt (src/sim/flood.js)
    const water = this.floodHere();

    // ---- di chuyển ----
    let activity = 'idle';
    const env = { ...this.itemEnv(speed), flood: water };
    const emit = (type, mag, info) => this.onBikeEvent(type, mag, info, env);
    // chở khách mang vali: xe nặng, chạy chậm hơn (balance.json → rideEvents.luggageSpeedMul)
    const lug = om.hasCargo && RIDER_TYPES[om.order?.rider]?.luggage ? gs.vehicleSpec.maxSpeed * (RIDE_EVENTS.luggageSpeedMul ?? 0.8) : 0;
    const speedCap = [this.inJam ? HAZARD.jamSpeedCap : 0, lug, floodSpeedCap(water)].filter((v) => v > 0).reduce((a, b) => Math.min(a, b), Infinity);
    if (this.ferryRide) this.ferryTick(dt); // đang trên phà: người + xe đứng yên trên boong, phà chở qua sông
    else {
      const pedal = gs.power === 'pedal', ev = gs.power === 'electric';
      const moved = bike.update(dt, mounted && !this.cine ? inp.state : {}, { mounted, fuel: this.stalled ? 0 : pedal ? 1 : gs.fuel, hp: gs.bikeHp, wet: !!rain, speedCap: Number.isFinite(speedCap) ? speedCap : 0, grid: this.city.grid, elev: this.city.elev, potholes: this.potholes, emit });
      if (mounted) {
        const km = (moved * DIST.displayPerUnit) / 1000;
        if (pedal) gs.addKm(km); // xe đạp: không xăng, không bảo dưỡng — chỉ cộng đồng hồ km
        else if (gs.fuel > 0 && !this.stalled) {
          // quá hạn bảo dưỡng (nhớt / pin) → hao xăng, điện thêm (balance.json → economy.oilFuelPct)
          const used = km * (gs.vehicleSpec.fuelPer100km / 100) * Math.max(0.1, 1 + gs.effect('fuelUsePct') / 100) * gs.maintFuelMul();
          gs.fuel = Math.max(0, gs.fuel - used);
          gs.addKm(km);
          if (!ev) om.addFuel(used); // hóa đơn đơn hàng tính tiền xăng; điện rẻ, không trừ vào đơn
          const low = gs.vehicleSpec.tank * 0.1;
          if (gs.fuel <= 0) this.toastOnce('nofuel', fmt(ev ? 'toast.noBattery' : 'toast.noFuel'), 'bad', 30);
          else if (gs.fuel < Math.max(0.25, low) && !ev) this.toastOnce('lowfuel', fmt('toast.lowFuel'), 'warn', 40);
          else if (gs.fuel < low && ev) this.toastOnce('lowfuel', fmt('toast.lowBattery'), 'warn', 40);
          if (gs.maintOverdue) this.toastOnce('oilOver', fmt(ev ? 'toast.batteryOver' : 'toast.oilOver'), 'bad', 120);
          else if (gs.maintLeftKm < gs.maintIntervalKm * 0.1) this.toastOnce('oilSoon', fmt(ev ? 'toast.batterySoon' : 'toast.oilSoon', { km: gs.maintLeftKm.toFixed(1) }), 'warn', 300);
        }
        activity = speed > 0.5 ? (pedal ? 'pedal' : gs.fuel <= 0 || this.stalled ? 'push' : 'drive') : 'idle';
        for (const h of this.traffic.collidePlayer(bike.pos, 0.75, bike.vel, true, bike.mesh.position.y)) this.onTrafficHit(h, env);
      } else {
        // đang nói chuyện với người lạ (cốt truyện): đứng yên tới khi nói xong (phím đi bị bỏ qua; đồng hồ vẫn chạy)
        activity = this.walker.update(dt, this.storyTalkActor() || this.cine ? NO_MOVE : inp.state, this.rig.yaw, { grid: this.city.grid, elev: this.city.elev, phys: gs.phys, speedMul: floodBand(water) >= 2 ? floodNum('walkMul') : 1 });
        const talk = this.storyTalkActor(); // đang nói chuyện với người lạ, đứng yên → quay mặt về phía người đó
        if (talk && activity === 'idle' && !this.walker.seat) {
          const m = talk.mesh.position, w = this.walker.pos;
          this.walker.heading = lerpAngle(this.walker.heading, Math.atan2(m.x - w.x, m.z - w.z), 1 - Math.exp(-8 * dt));
          this.walker.mesh.rotation.y = this.walker.heading;
        }
        // đang ngồi ghế: người đi đường / chó không đẩy được, giữ đúng chỗ ngồi (Walker đã đặt sẵn)
        if (!this.walker.seat) {
          this.traffic.collidePlayer(this.walker.pos, 0.35, { x: 0, y: 0 }, false, this.walker.mesh.position.y);
          this.blockOwnBike();
          this.walker.mesh.position.set(this.walker.pos.x, this.walker.mesh.position.y, this.walker.pos.z);
        }
        // bước chân ra lề / vào nhà không tính, chỉ cập nhật vị trí
      }
    }

    // ---- thời gian & năng lượng ----
    const dMin = dt * TIME.gameMinPerRealSec * this.timeScale;
    this.clockMin += dMin;
    this.parkTick();
    this.fineTick();
    this.ticketTick();
    this.airportTick(mounted ? speed : 0);
    this.roadTick(mounted);
    gs.drain(activity, dMin, { harshSun: hz.isHarshSun(now), raining: !!rain, outdoor: true, inJam: this.inJam, waiting: false, now: this.clockMin });
    // ngồi ghế (quán, công viên, trạm xe buýt): tinh thần hồi chậm, tới mức tối đa thì thôi (thẻ ⚖️ Cân bằng → energy.seat)
    const seatK = ENERGY.seat || {};
    if (!mounted && this.walker.seat && seatK.mentalPerMin > 0 && gs.mental < (seatK.mentalMax ?? 70)) {
      gs.addEnergy(0, Math.min(seatK.mentalPerMin * dMin, (seatK.mentalMax ?? 70) - gs.mental));
    }
    this.rollDay();
    this.storyUpdate(dMin);
    this.storyActorsTick(dt);

    // ---- giao thông ----
    const f = bike.forward();
    const pp = this.playerPos;
    const py = (mounted ? bike.mesh : this.walker.mesh).position.y;
    this.ferries.update(this.clockMin, performance.now() / 1000);
    this.lightT += dt;
    this.traffic.lights.t = this.lightT;
    this.trafficLights.update(this.lightT);
    this.redLightTick(mounted, speed);
    const trafficEvents = this.traffic.update(dt, { px: pp.x, pz: pp.z, py, onBike: mounted, speed, fx: f.x, fz: f.z, hour: tod(this.clockMin) / 60, now: this.clockMin, honk: this.honkNow });
    this.honkNow = false;
    this.bgTraffic.update(dt, pp.x, pp.z, { onSeg: this.traffic.onSeg, floodIds: this.traffic.floodIds, elev: this.city.elev, lights: this.traffic.lights });
    for (const e of trafficEvents) {
      if (e.type === 'honk' && Math.random() < 0.5) {
        sound('city.honk');
        this.toastOnce('honk', fmt('toast.honk'), 'info', 15);
      }
      if (e.type === 'driverYell') this.driverYell(e);
      if (e.type === 'dogDart') {
        sound('city.dog');
        this.hud.toast(fmt('toast.dogDart'), 'warn', 2500);
      }
      // xe đặc biệt (traffic.js specialTick / thiefTick): nẹt pô, câu nói, chó sủa, đuổi được trộm chó
      if (e.type === 'npcRev') sound('city.rev');
      if (e.type === 'npcLine') this.driverYell({ obj: e.obj, id: e.id }, e.key);
      if (e.type === 'dogBark') sound('city.dog');
      if (e.type === 'thiefScared') this.thiefScared(e);
    }
    this.patrolCheck(mounted, speed);

    // ---- chướng ngại ----
    for (const e of hz.poll(this.clockMin)) this.onHazard(e);
    this.floodTick(dt, water, mounted ? speed : 0, mounted);
    this.blockTick(dMin, dt);
    this.scamRumorTick();
    if (mounted && !this.cheat.noPolice) {
      for (const p of hz.activePolice(this.clockMin)) {
        if (this.policeChecked.has(p.id)) continue;
        if (Math.hypot(bike.pos.x - roadPos(p.node[0]), bike.pos.z - roadPos(p.node[1])) < 9) {
          this.policeChecked.add(p.id);
          this.knownPolice.add(p.id);
          act.policeStop(this, p, speed);
          break;
        }
      }
    }

    // ---- đơn hàng ----
    om.update(dMin, dt, this.clockMin, pp);
    om.tickItems({ ...env, speed: mounted ? speed : 0 }, dMin);
    // khách xe ôm sợ quá (dưới ngưỡng của loại khách) → đòi xuống giữa đường
    const ro = om.order;
    if (ro && ro.kind === 'ride' && om.state === S.DELIVERING && ro.items[0]) {
      const quitBelow = RIDER_TYPES[ro.rider]?.quitBelow || 0;
      if (ro.items[0].condition < quitBelow) return act.passengerQuit(this);
    }

    // ---- tương tác ----
    this.prompts = act.gatherInteractions(this);
    if (inp.was('KeyE')) {
      const p = this.prompts.find((x) => x.key === 'E' && !x.disabled);
      if (p) {
        sound('ui.interact');
        if (this.walker.seat && !p.seatAct) this.walker.leaveSeat(); // đang ngồi mà làm việc khác (lấy hàng, vào quán…) → đứng dậy trước
        p.run();
      }
    }
    if (inp.was('KeyF') && !this.storyTalkActor() && !this.cine) {
      const p = this.prompts.find((x) => x.key === 'F' && !x.disabled);
      if (p) p.run();
    }

    setEngine(mounted && gs.power !== 'pedal' && gs.fuel > 0 && !this.stalled, Math.min(1, speed / gs.vehicleSpec.maxSpeed) * (gs.power === 'electric' ? 0.35 : 1)); // xe điện chạy êm, xe đạp không tiếng máy
    setRain(rain ? (rain.heavy ? 1 : 0.5) : 0);
    this.checkEnd();
  }

  // Thua (bị đuổi / khóa tài khoản) · sự kiện tiền nhà · kiệt sức
  checkEnd() {
    const gs = this.gs;
    const o = gs.checkEnd(this.clockMin);
    for (const e of gs.takeEvents()) this.onRentEvent(e);
    if (o) return this.endGame(o);
    if (gs.collapsed && !this.collapsing) this.collapse(gs.collapsed);
  }

  onRentEvent(e) {
    if (e.type === 'late') {
      sound('money.rentLate');
      this.hud.toast(fmt('toast.rentLate', { fine: fmtK(e.fine), rent: fmtK(e.rent), day: e.dueDay }), 'bad', 9000);
      this.addChat(fmt('npc.home.name'), fmt('chat.rentLate', { fine: fmtK(e.fine), rent: fmtK(e.rent), day: e.dueDay }));
    } else if (e.type === 'newPeriod') {
      this.hud.toast(fmt('toast.rentNewPeriod', { rent: fmtK(e.rent), day: e.dueDay }), 'info', 6000);
    }
  }

  // Kiệt sức: hủy đơn đang chạy, về phòng trọ nằm nghỉ bắt buộc, (ngất) mất tiền thuốc
  collapse(kind) {
    const { om, gs } = this;
    this.collapsing = true;
    if (om.order) om.cancel(fmt('cancel.collapse'), this.clockMin, { byDriver: false });
    om.goOffline();
    this.clearTempNpcs();
    this.placeAtHome();
    this.advance(ENERGY.collapse.hours * 60, 'rest', { indoor: true, waiting: false, quiet: true });
    if (this.state !== 'play') return;
    const r = gs.recoverCollapse(kind);
    gs.wake(this.clockMin);
    this.collapsing = false;
    sound('progress.collapse');
    this.modal.show({
      speaker: fmt('npc.home.name'),
      portrait: '🏥',
      text: fmt(kind === 'faint' ? 'dlg.faint' : 'dlg.burnout', { hours: ENERGY.collapse.hours, fee: fmtK(r.fee), time: fmtTime(this.clockMin) }),
      choices: [{ label: fmt('dlg.ok'), primary: true }],
    });
  }

  // Ngủ ở phòng trọ: tắt app, tua nhanh, hồi thể lực / tinh thần
  sleep(minutes) {
    this.om.goOffline();
    this.advance(minutes, 'sleep', { indoor: true, waiting: false, quiet: true });
    if (this.state !== 'play') return null;
    this.gs.wake(this.clockMin);
    return this.clockMin;
  }

  // Chợp mắt ở địa điểm (không tắt app): có đơn mời thì dậy ngay. Trả về số phút đã ngủ và có bị đơn đánh thức không.
  nap(minutes) {
    if (this.om.order || this.om.state === S.OFFERED) return null;
    const start = this.clockMin;
    this.advance(minutes, 'nap', { indoor: true, waiting: false, quiet: true, stopOnOffer: true });
    if (this.state !== 'play') return null;
    const slept = Math.round(this.clockMin - start);
    this.gs.napWake(this.clockMin, slept);
    return { slept, byOrder: this.om.state === S.OFFERED };
  }

  // Cho thời gian trôi nhanh (chờ quán, leo cầu thang, ngủ…), tính đủ hao mòn & món hàng
  // stopOnOffer: có đơn mời thì dừng ngay (ngồi chờ đơn, chợp mắt)
  // ---- PHÀ (interactions.js → Đi phà): chờ phà cập bến này, gắn người (+ xe) lên boong, tới bờ bên kia thì cho xuống ----
  startFerry(pair, side, withBike) {
    const nb = nextBoat(side, this.clockMin);
    if (nb.wait > 0) this.advance(nb.wait, 'idle', { waiting: true, quiet: true });
    // chiếc đang đậu ở bến này (lệch vài giây do làm tròn thì chờ thêm chút)
    let i = -1;
    for (let k = 0; k < 20 && i < 0; k++) {
      i = this.ferries.boats.findIndex((b) => b.pair === pair && this.ferries.pose(pair, b.i, this.clockMin).at === side);
      if (i < 0) this.advance(0.1, 'idle', { waiting: true, quiet: true });
    }
    if (i < 0) return false;
    const boat = this.ferries.boats[i];
    if (withBike && this.mode === 'foot') {
      this.gs.parked = null;
      this.mode = 'bike';
      this.walker.sitOn(this.bike);
    }
    if (!withBike && this.mode === 'bike') return false; // đi bộ thì phải xuống xe trước
    this.ferryRide = { pair, i: boat.i, to: side === 'a' ? 'b' : 'a', withBike, off: [-1.6, -4.2] };
    this.bike.speed = 0;
    this.bike.vel.set(0, 0);
    this.ferryTick(0);
    this.hud.toast(fmt('toast.ferryBoard', { other: pair[this.ferryRide.to].name }), 'info', 4000);
    return true;
  }
  ferryTick() {
    const R = this.ferryRide, p = this.ferries.pose(R.pair, R.i, this.clockMin);
    if (p.at === R.to) return this.landFerry();
    const c = Math.cos(p.heading), sn = Math.sin(p.heading), [lx, lz] = R.off;
    const x = p.x + lx * c + lz * sn, z = p.z - lx * sn + lz * c, y = BOAT_DECK + 0.08;
    if (R.withBike) {
      const b = this.bike;
      b.pos.set(x, 0, z);
      b._ex = x;
      b._ez = z;
      b.heading = p.heading;
      b.speed = 0;
      b.vel.set(0, 0);
      b.mesh.position.set(x, y, z);
      b.mesh.rotation.set(0, p.heading, 0, 'YXZ');
    } else {
      const w = this.walker;
      w.pos.set(x, 0, z);
      w._ex = x;
      w._ez = z;
      w.mesh.position.set(x, y, z);
      w.mesh.rotation.set(0, p.heading + Math.PI / 2, 0);
    }
  }
  landFerry() {
    const R = this.ferryRide, pier = R.pair[R.to];
    this.ferryRide = null;
    const d = pier.door, head = Math.atan2(-pier.n[0], -pier.n[1]); // quay mặt vào bờ
    const body = R.withBike ? this.bike : this.walker;
    body.pos.set(d.x, 0, d.z);
    body._ex = d.x;
    body._ez = d.z;
    body.deckY = null;
    body.heading = head;
    if (R.withBike) this.bike.speed = 0;
    this.hud.toast(fmt('toast.ferryArrive', { other: pier.name, time: fmtTime(this.clockMin) }), 'good', 5000);
  }

  advance(min, activity = 'idle', { indoor = false, waiting = true, quiet = false, stopOnOffer = false } = {}) {
    const n = Math.max(1, Math.round(min));
    const start = this.clockMin;
    this.skipping = true; // đang tua giờ (ngủ, chợp mắt, phím T…): không phát tiếng sấm (cơn mưa có thể bắt đầu rồi tạnh ngay trong lúc tua)
    for (let i = 0; i < n; i++) {
      this.clockMin += 1;
      const now = this.clockMin;
      this.rollDay();
      this.gs.drain(activity, 1, { harshSun: this.hz.isHarshSun(now), raining: this.hz.isRaining(now), outdoor: !indoor, inJam: false, waiting, now });
      this.om.tickItems(this.itemEnv(0, indoor), 1);
      this.om.update(1, 0, now, this.playerPos);
      for (const e of this.hz.poll(now)) this.onHazard(e);
      this.parkTick();
      this.fineTick();
      this.ticketTick();
      this.airportTick();
      if (this.gs.checkEnd(now)) break;
      if (this.gs.collapsed && activity !== 'rest') break; // kiệt sức giữa chừng → xử lý ngay
      if (stopOnOffer && this.om.state === S.OFFERED) break; // điện thoại reo có đơn
    }
    this.skipping = false;
    if (!quiet) this.hud.toast(fmt('toast.timeSkip', { min: Math.round(this.clockMin - start), time: fmtTime(this.clockMin) }), 'info', 2200);
    this.checkEnd();
  }

}

mixParts(Game, [EventsPart, RoadRulesPart, NavigationPart, StoryPart, VisualsPart, PhoneDataPart]);
