// =============================================================
// GAME — điều phối: vòng lặp, nối mô phỏng (src/sim) với thế giới 3D (src/world) và giao diện (src/ui)
// =============================================================
import * as THREE from 'three';
import { TIME, ECONOMY, ENERGY, HAZARD, DIST, VEHICLES, NIGHT, PARKING, AIRPORT, RIDE_EVENTS, ORDER, LIGHTS, NPC_FLAVOR } from './data/balance.js';
import { recentThieves } from './sim/dogThief.js';
import { parkingRoll, helmetRoll, parkingLotAt, nearestStation, towTarget, safeSpot } from './sim/parking.js';
import { garageSpots, inGarage, parkSlots } from './sim/garage.js';
import { airportAt, airportParkAt, airportNoStopAt, noStopStep } from './sim/airport.js';
import { roadSegAt, tierOf, tierLabel, speedLimitOf, curbSpot } from './sim/roads.js';
import { busHint, busPlan, inService } from './sim/bus.js';
// tên tuyến ngắn: "Tuyến 1 · Trung tâm – Sân bay…" → "Tuyến 1"
const routeShort = (r) => String(r?.name || '').split(' · ')[0];
import { outfitLook, startOutfit, GOODS } from './data/goods.js';
import { lookOf } from './data/looks.js';
import { APP, RIDER_TYPES } from './data/apps.js';
import { ITEMS } from './data/items.js';
import { unlocked, openDayOf } from './sim/placeRules.js';
import { dayOf, dayStartAt, tod, isDark, fmtClock } from './sim/clock.js';
import { inHours } from './sim/hours.js';
import { CITY, buildLayout, segmentRect, roadPos, districtAtPoint, traitAt, routeDist, streetAt, segmentName, intersectionName, nodePos } from './sim/cityLayout.js';
import { buildFeed } from './sim/feed.js';
import { lightMap, lightColor, ticketChance, turnOf } from './sim/lights.js';
import { buildTrafficLights } from './world/trafficLights.js';
import { fmtDist } from './sim/nav.js';
import { makeRng } from './sim/rng.js';
import { GameState, START_VEHICLE, uniformOf } from './sim/GameState.js';
import { OrderManager, S, scamHotspot } from './sim/OrderManager.js';
import { HazardManager } from './sim/hazards.js';
import { depthAtPoint, floodBand, floodSpeedCap, floodNum, floodCancelOk, nearestSegId } from './sim/flood.js';
import { objectives } from './sim/objectives.js';
import { STORY, HUD_PARTS, stepOf, chapterOf, storyTick, beginChapter, finishChapter, brandHelmet, storyEvent, actorsPresent, storyPick } from './sim/story.js';
import { buildCity } from './world/city.js';
import { Bike, Walker, CameraRig, lerpAngle } from './world/controllers.js';
import { Traffic } from './world/traffic.js';
import { buildFerries } from './world/ferry.js';
import { makeStallPeople } from './world/stallPeople.js';
import { BgTraffic } from './world/bgTraffic.js';
import { pushCircle, resolveCircle } from './world/physics.js';
import { nextBoat, BOAT_DECK } from './sim/ferry.js';
import { Sky } from './world/sky.js';
import { makePerson, makeBeacon, makeZoneRing, setSitting, pedalPerson, randomPersonOpts, npcLook, sitY, makeBike, applyPose, updatePeopleLod, setPeopleMode, animatePerson } from './world/models.js';
import { jetjetLook, seatRider } from './world/npcVehicles.js';
import { riderStyle, suitcaseOnBike } from './world/npcStyles.js';
import { personOf, pronouns, profileLook } from './sim/people.js';
import { makeLabelTexture, makeQuestTexture } from './world/textures.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import { Phone } from './ui/phone.js';
import { Modal, splitPages } from './ui/modal.js';
import { Spotlight } from './ui/spotlight.js';
import { Screens } from './ui/screens.js';
import * as act from './interactions.js';
import { roundMapData } from './roundMap.js';
import { sound, setEngine, setRain, unlockAudio, setMuted, setVolumes, setMusic, cityAmbience } from './audio.js';
import { loadSettings, saveSettings, normSettings } from './settings.js';
import { fmt, has, pick, pickFor } from './content/index.js';
import { ChatChannel } from './sim/chat.js';
import { ChatBox } from './ui/chatBox.js';
import { Bubbles, headOf } from './ui/bubbles.js';
import { fmtK } from './sim/economy.js';

const SAVE_KEY = 'shipper-sim-save-v1';
const PHOTO_KEY = 'shipper-sim-photos-v1'; // app Máy ảnh: 3 ô ảnh = 3 bản lưu { save, img, day, time, where }
export const PHOTO_SLOTS = 3;
// Tin nhóm Hội shipper (dự báo, quảng cáo, mẹo, kẹt xe…): TẮT theo yêu cầu chủ game (liên quan cốt truyện) — khi nào chủ game bảo thì bật lại
const GROUP_CHAT_ON = false;
const GARAGE_CAM = { dist: 3.2, pitch: 0.28 }; // camera khi đứng / chạy xe trong hầm xe phòng trọ
const SW_H = 0.15;
const NO_MOVE = { forward: false, back: false, left: false, right: false, run: false, brake: false }; // đứng yên (đang nói chuyện)
const TALK_CAM_GROUP = { dist: 7.5, pitch: 0.36 }; // nói chuyện với 2 người cùng lúc
const TALK_CAM = { dist: 5.5, pitch: 0.3 }; // camera lúc nói chuyện với người lạ (cốt truyện)
export const fmtTime = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const NORMAL = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inRect = (r, p) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;

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
    this.questTex = { '!': makeQuestTexture('!'), '?': makeQuestTexture('?') }; // dấu trên đầu NPC: ! có việc mới · ? quay lại nói chuyện
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
    // nhạc nền: màn hình chính → music.menu · đang chơi → music.day / music.night theo giờ trong game
    setMusic(this.state === 'play' ? (isDark(this.clockMin) ? 'music.night' : 'music.day') : 'music.menu');
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
      const moved = bike.update(dt, mounted ? inp.state : {}, { mounted, fuel: this.stalled ? 0 : pedal ? 1 : gs.fuel, hp: gs.bikeHp, wet: !!rain, speedCap: Number.isFinite(speedCap) ? speedCap : 0, grid: this.city.grid, elev: this.city.elev, potholes: this.potholes, emit });
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
        activity = this.walker.update(dt, this.storyTalkActor() ? NO_MOVE : inp.state, this.rig.yaw, { grid: this.city.grid, elev: this.city.elev, phys: gs.phys, speedMul: floodBand(water) >= 2 ? floodNum('walkMul') : 1 });
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
    if (inp.was('KeyF') && !this.storyTalkActor()) {
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
    this.bubbles.show(e.id, () => headOf(e.obj.mesh, up), pick(key, Math.floor(Math.random() * 1000)));
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
    else if (e.type === 'completed') storyEvent(this.gs.story, 'delivered'); // cốt truyện: giao xong 1 đơn
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
    this.bubbles.show(`ped:${p.id}`, () => headOf(p.mesh, 1.95), pickFor('bubble.ped', p.who, Math.floor(Math.random() * 1000), pronouns(p.who || personOf(p.name), this.gs.profile?.gender))); // câu hợp vai người nói (vé số…)
    sound('chat.bubble');
  }

  // Tin nhắn từ người / nhóm không có trong danh bạ cốt truyện (nhóm tài xế, phường, chủ tiệm…): mỗi tên 1 cuộc trò chuyện
  addChat(from, text) {
    this.gs.addMessage(`x:${from}`, { text }, this.clockMin, { name: from, icon: '💬' });
    this.onNewMessage(`x:${from}`, from, text);
  }
  // Tin nhắn cốt truyện: người gửi trong danh bạ story.json (Mẹ, Cô Hai…). m: { key, loc }
  storyMessage(id, m) {
    this.gs.addMessage(id, m, this.clockMin);
    const c = STORY.contacts[id];
    this.onNewMessage(id, c ? fmt(c.name) : id, fmt(m.key, { name: this.gs.profile.name }));
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
    if (!safe && !quiet) this.toastOnce('parkHint', fmt('toast.parkHint', { min: PARKING.graceMin }), 'info', 600);
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
  noFines() {
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

  // ======================== MỤC TIÊU / CHỈ ĐƯỜNG ========================
  // Chỗ đã bấm "Chỉ đường": mã địa điểm, hoặc 'stop:<mã trạm>' (trạm xe buýt) → { id, name, door, kind } | null
  waypointPlace() {
    const w = this.waypoint;
    if (!w) return null;
    if (w.startsWith('stop:')) {
      const st = this.bus?.byId?.[w.slice(5)];
      return st ? { id: w, name: st.name, door: st.wait, kind: 'busStop' } : null;
    }
    return this.layout.placeById[w] || null;
  }
  // Xe đang bị giữ ở đồn công an → không có xe để chạy
  bikeAtPolice() {
    const t = this.gs.towed;
    return !!t && this.layout.placeById[t.placeId]?.kind === 'police';
  }
  // Kế hoạch đi xe buýt từ chỗ mình tới điểm (đi bộ + 1 tuyến), null nếu đi bộ thẳng nhanh hơn (src/sim/bus.js → busPlan)
  busPlanTo(to) {
    if (!this.bus) return null;
    const plan = busPlan(this.bus, this.playerPos, to, this.clockMin, routeDist, 3.4, this.busPrefer);
    this.busPrefer = plan ? plan.from.id : null; // giữ trạm đã gợi ý (mũi tên không nhảy qua lại giữa 2 trạm)
    return plan;
  }
  // Dòng gợi ý đi xe buýt cho điện thoại (app CSGT, thẻ địa điểm / trạm trên app Bản đồ): null nếu đi bộ thẳng nhanh hơn
  planText(pl) {
    const plan = pl?.door && this.busPlanTo(pl.door);
    if (!plan) return null;
    const p = { walk1: fmtDist(plan.walk1), from: plan.from.name, route: routeShort(plan.route), to: plan.to.name, walk2: fmtDist(plan.walk2), min: Math.round(plan.minutes) };
    const x = plan.legs[1]; // đổi tuyến 1 lần
    return x ? fmt('map.busPlan2', { ...p, route2: routeShort(x.route), to2: x.to.name }) : fmt('map.busPlan', p);
  }

  // ======================== CỐT TRUYỆN (src/sim/story.js · src/data/story.json) ========================
  // Bắt đầu chương đang chờ (chơi mới: sau màn "tới thành phố")
  storyBegin() {
    const s = this.gs?.story;
    if (s?.ch && s.step < 0) {
      beginChapter(s);
      this.saveGame(true); // lưu lúc bắt đầu chương
    }
  }
  // Mỗi khung hình (không chạy lúc đang mở hộp thoại): dMin = phút game vừa trôi
  storyUpdate(dMin) {
    const s = this.gs.story;
    const st = s?.ch ? stepOf(s) : null;
    this.om.hold = !!st?.hold; // bước đang chờ hướng dẫn / cuốc cốt truyện: app chưa phát đơn thường
    // bước có cuốc cốt truyện mà cuốc chưa có (vừa mở lại game / lúc mời đang bận) → mời lại
    const offerAct = st && s.fired && (st.on || []).find((a) => a.do === 'offer');
    if (offerAct && !this.om.order && this.om.state !== S.OFFERED && !s.ev.delivered && performance.now() - (this.storyOfferAt || 0) > 1500) this.storyOffer(offerAct);
    if (!s?.ch || s.step < 0 || this.modal.open) return;
    this.storyLeash(st);
    const om = this.om;
    const orderStage = om.state === S.OFFERED ? 'offer' : !om.order ? null : om.state === S.TO_PICKUP || om.state === S.WAITING_FOOD || om.state === S.OUT_OF_STOCK || om.state === S.PACKING ? 'accept' : 'pickup';
    const acts = storyTick(this.gs, dMin, {
      orderStage,
      near: (id, r) => { const pl = this.layout.placeById[id]; return !!pl && dist2(this.playerPos, pl.door) < r; },
      mounted: this.mode === 'bike',
      threadOpen: (who) => this.phone.open && this.phone.app === 'chat' && this.phone.thread === who,
      routed: (place) => this.storyRouted({ place }),
      actorNear: (who, r) => { const a = this.storyActors?.[who]; return !a || a.leaving || dist2(this.playerPos, a.mesh.position) < r; }, // người lạ không còn (mở lại game giữa cảnh) → coi như xong
      actorBoarded: (who) => !!this.storyActors?.[who]?.seated, // người lạ đang ngồi sau xe người chơi
      now: this.clockMin, // giờ chung (điều kiện "trong khung giờ")
      switchOn: (w) => this.om.state !== S.OFFLINE && !this.gs.flags[w === 'food' ? 'noFood' : 'noRide'] && (w !== 'ride' || this.gs.effect('passengerSeat')),
    });
    if (acts.length) this.runStoryActions(acts);
  }
  // Bước có "leash": chưa xong thì không cho đi xa địa điểm quá r m — giữ người chơi lại ở mép vùng + nhắc (mỗi ~4 giây một lần)
  storyLeash(st) {
    const L = st?.leash, c = L && this.layout.placeById[L.place]?.door;
    if (!c || !this.gs.story.fired) return;
    const P = this.playerPos, dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz), r = L.r || 30;
    if (d <= r) return;
    P.x = c.x + (dx / d) * r;
    P.z = c.z + (dz / d) * r;
    if (this.mode === 'bike') { this.bike.speed = 0; this.bike.vel.set(0, 0); }
    const now = performance.now();
    if (now - (this.leashAt || 0) > 4000) {
      this.leashAt = now;
      this.hud.toast(fmt(L.text, { name: this.gs.profile.name }), 'big', 3500);
    }
  }
  // Làm các việc của bước (story.json → on)
  runStoryActions(acts) {
    const gs = this.gs, ch = chapterOf(gs.story), name = gs.profile.name;
    for (const a of acts) {
      if (a.do === 'title') this.chapterCard(fmt(ch.title), fmt(ch.name), true); // tự mờ dần sau ~5 giây (bước sau chờ "wait" cho mờ hết)
      else if (a.do === 'openPhone') {
        this.phone.toggle(true);
        this.phone.openApp(a.app || 'chat');
        if ((a.app || 'chat') === 'chat' && a.who) {
          this.phone.thread = a.who;
          gs.readThread(a.who);
          this.phone.redraw();
        }
      } else if (a.do === 'closePhone') this.phone.toggle(false);
      else if (a.do === 'actor') this.storyActorSpawn(a);
      else if (a.do === 'approach') { const ac = this.storyActors?.[a.who]; if (ac) ac.mode = 'approach'; }
      else if (a.do === 'leave') this.storyActorLeave(a.who);
      else if (a.do === 'remove') this.storyActorRemove(a.who);
      else if (a.do === 'board') this.storyActorBoard(a.who);
      else if (a.do === 'alight') this.storyActorAlight(a.who);
      else if (a.do === 'drop') { const ids = [].concat(a.id || []); gs.story.carry = [].concat(gs.story.carry || []).filter((x) => !ids.includes(x)); }
      // tuần tự: đang có câu chờ bấm E → câu mới / bảng chọn câu xếp hàng, người chơi bấm E mới hiện (không đè nhau)
      else if (a.do === 'choose') { if (a.ask) this.storyChooseShow(a); else this.storyEnqueue(() => this.storyChooseShow(a)); }
      else if (a.do === 'bubble') this.storyEnqueue(() => this.storyBubble(a.who, a.text, a.hold));
      else if (a.do === 'say') {
        // hội thoại bằng bong bóng trên đầu người nói: người lạ đang có mặt / NPC ở địa điểm của người trong danh bạ (không có thì trên đầu người chơi)
        const who = STORY.people?.[a.who] || STORY.contacts[a.who] || {};
        const mesh = this.storyActors?.[a.who]?.mesh || (who.place && this.npcs[who.place]) || null;
        this.storyConverse({ mesh, name: fmt(who.name || ''), pages: splitPages(fmt(a.text, { name })) });
      } else if (a.do === 'msg') this.storyMessage(a.from, { key: a.text, loc: a.loc });
      else if (a.do === 'replies') gs.setReplies(a.who, a.texts || [], a.gains);
      else if (a.do === 'item') { if (!gs.story.items.includes(a.id)) gs.story.items.push(a.id); }
      else if (a.do === 'bike') {
        gs.flags.story = Math.max(1, gs.flags.story ?? 0);
        this.placeAtHomeBike();
        sound('place.gotBike');
        this.hud.toast(fmt('toast.gotBike'), 'big', 6000);
      } else if (a.do === 'give' && GOODS[a.goods]) gs.consumables[a.goods] = (gs.consumables[a.goods] || 0) + 1;
      else if (a.do === 'toast') this.hud.toast(fmt(a.text, { name }), 'big', 6000);
      else if (a.do === 'offer') this.storyOffer(a);
      else if (a.do === 'fuel' && gs.power !== 'pedal') gs.fuel = gs.vehicleSpec.tank * Math.max(0, Math.min(100, a.pct ?? 20)) / 100;
      else if (a.do === 'end') {
        this.chapterCard(fmt('story.chapterDone', { title: fmt(ch.title), name: fmt(ch.name) }), '');
        finishChapter(gs.story);
        this.saveGame(true); // lưu lúc kết thúc chương (= bắt đầu chương sau), kèm chỗ đứng
      }
    }
  }
  // ---------- NGƯỜI LẠ TRONG CẢNH (story.json → people; việc actor / approach / leave / remove / board / alight / bubble) ----------
  // Chỉ để nhìn, chỉ máy của người chơi này vẽ (cốt truyện riêng). Chỗ đứng cố định (xeOm / place) thì mở lại game dựng lại được.
  // Dáng người lạ (ACTOR_LOOKS): look + dress (đồ đi kèm)
  storyActorLook(kind, rng) {
    if (kind === 'jetjet') return jetjetLook(rng);
    if (kind === 'girl') return { look: { ...randomPersonOpts(rng, 'f', { casual: true }), gender: 'f', hat: null } };
    if (kind === 'gentleman') return { look: { ...randomPersonOpts(rng, 'm', { casual: false }), gender: 'm', hat: null, shirt: 0xf4f4f4, pants: 0x1c2833, shoe: 0x2b1d14, shoeStyle: 'oxford', sleeves: 'long', shorts: false, hair: 0x1b1b1b } };
    return { look: randomPersonOpts(rng, 'm', { casual: true }) };
  }
  storyActorSpawn(a) {
    this.storyActors ||= {};
    const had = this.storyActors[a.who];
    if (had && (a.spot === 'xeOm' || a.spot === 'place') && had.def?.spot === a.spot && had.def.place === a.place && !had.leaving) { had.def = a; return; } // đã đứng sẵn đúng chỗ (dựng lúc mở game) → giữ nguyên
    this.storyActorRemove(a.who);
    const rng = makeRng([...a.who].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) + this.gs.day); // cố định theo người lạ + ngày
    const { look, dress = null } = this.storyActorLook(a.look, rng);
    const mesh = makePerson({ ...look, face: null });
    dress?.(mesh);
    const ac = { mesh, look, dress, mode: 'idle', phase: 0, t: 0, def: a, callT: 0 };
    const spot = a.spot === 'xeOm' ? this.storyActorSpot(a.place) : a.spot === 'place' ? this.storyPlaceSpot(a) : null;
    if (spot) {
      mesh.position.set(spot.x, SW_H, spot.z);
      mesh.rotation.y = spot.heading;
    } else {
      const cam = this.camera.position, p = this.walker.mesh.position;
      const fx = (p.x - cam.x), fz = (p.z - cam.z), fl = Math.hypot(fx, fz) || 1; // hướng camera nhìn (trên mặt đất)
      const d = a.dist ?? 8;
      // chỗ đứng: ưu tiên ngang hông người chơi (dọc vỉa hè), phải thấy trên màn hình, không nằm trong nhà / vật cản, đường đi tới người chơi thông
      const clear = (x, z) => !this.city.grid.inside(x, 0.5, z);
      const at = (deg) => { const r = (deg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r); return [p.x + ((fx * c + fz * sn) / fl) * d, p.z + ((fz * c - fx * sn) / fl) * d]; };
      const ok = (deg) => { const [x, z] = at(deg); for (let k = 1; k <= 8; k++) if (!clear(p.x + ((x - p.x) * k) / 8, p.z + ((z - p.z) * k) / 8)) return false; return true; };
      const seen = (deg) => { const [x, z] = at(deg), v = new THREE.Vector3(x, p.y + 1.7, z).project(this.camera); return v.z < 1 && Math.abs(v.x) < 0.55 && Math.abs(v.y) < 0.9; };
      const DEG = [70, -70, 55, -55, 40, -40, 25, -25, 0, 110, -110, 180];
      const [x, z] = at(DEG.find((g) => ok(g) && seen(g)) ?? DEG.find(ok) ?? 40);
      mesh.position.set(x, p.y, z);
      mesh.rotation.y = Math.atan2(p.x - mesh.position.x, p.z - mesh.position.z);
    }
    this.scene.add(mesh);
    // xe đi kèm (mô tô xịn): dựng sát lề phía đường, dọc theo đường
    if (a.vehicle === 'moto' && spot?.tx != null) {
      const bike = makeBike(0x15171c, 'sport');
      bike.userData.bagMesh.visible = false;
      // chỗ đứng bên kia đường (dist lớn) thì lòng đường nằm về phía cửa tiệm (-n); đứng ngay trước cửa thì lòng đường ở phía +n
      const toRoad = (a.dist ?? 1.5) > 8 ? -1 : 1;
      bike.position.set(spot.x + spot.nx * 1.7 * toRoad + spot.tx * 1.4, 0.02, spot.z + spot.nz * 1.7 * toRoad + spot.tz * 1.4);
      bike.rotation.y = Math.atan2(spot.tx, spot.tz);
      this.scene.add(bike);
      ac.vehicle = bike;
      ac.street = [spot.tx, spot.tz];
    }
    this.storyActors[a.who] = ac;
  }
  // Chỗ đứng "trước cửa địa điểm": từ cửa đi ra phía đường dist m (≈16,5 m = vỉa hè bên kia đường), lệch dọc đường lat m.
  // Quay mặt về phía cửa. Trả kèm hướng ra đường (nx, nz) và hướng dọc đường (tx, tz)
  storyPlaceSpot(a) {
    const pl = this.layout.placeById[a.place];
    if (!pl?.door) return null;
    const [nx, nz] = NORMAL[pl.face] || [0, 1], tx = -nz, tz = nx, d = a.dist ?? 1.5, lat = a.lat ?? 0;
    const x = pl.door.x + nx * d + tx * lat, z = pl.door.z + nz * d + tz * lat;
    return { x, z, heading: Math.atan2(-nx, -nz), nx, nz, tx, tz };
  }
  // Chỗ đứng "cạnh gốc cây kế chú xe ôm" ở địa điểm placeId: chú xe ôm gần cửa nhất → gốc cây gần chú nhất →
  // điểm sát gốc cây (không vướng vật cản, không đè lên xe chú), quay mặt ra phía cửa địa điểm. Cố định theo bản đồ (mở lại game vẫn đúng chỗ)
  storyActorSpot(placeId) {
    const pl = this.layout.placeById[placeId], door = pl?.door;
    if (!door) return null;
    const near = (list, p, f) => list.reduce((b, o) => { const d = Math.hypot(f(o)[0] - p.x, f(o)[1] - p.z); return !b || d < b.d ? { o, d } : b; }, null);
    const xe = near(this.traffic.xeOm || [], door, (o) => [o.g.position.x, o.g.position.z]);
    if (!xe || xe.d > 12) return null;
    const xp = xe.o.g.position;
    const tree = near(this.city.trees || [], xp, (t) => t);
    if (!tree || tree.d > 10) return null;
    const [tx, tz] = tree.o;
    let best = null;
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2, x = tx + Math.sin(ang) * 0.75, z = tz + Math.cos(ang) * 0.75;
      const dx = Math.hypot(x - xp.x, z - xp.z);
      if (this.city.grid.inside(x, 0.5, z) || dx < 1.9) continue; // xe chú dài ~1,9 m: đứng cách tâm xe đủ xa cho khỏi đè lên xe
      if (!best || dx < best.dx) best = { x, z, dx };
    }
    if (!best) return null;
    return { x: best.x, z: best.z, heading: Math.atan2(door.x - best.x, door.z - best.z) };
  }
  // Mở game / chơi mới: xóa người lạ của ván trước, dựng lại người đang có mặt (chỉ kiểu đứng cố định)
  storyActorsRestore() {
    for (const who of Object.keys(this.storyActors || {})) this.storyActorRemove(who);
    this.storyChoiceClose();
    this.storyTalkWith = null;
    this.storyAsk = null;
    this.pendingReply = null;
    this.storyQueue = [];
    for (const a of Object.values(actorsPresent(this.gs.story))) if (a.spot === 'xeOm' || a.spot === 'place') this.storyActorSpawn(a);
    // mở lại game lúc đang chờ chọn câu trả lời → hiện lại bảng lựa chọn (kiểu "bấm E mới hiện" thì chờ bấm E)
    const s = this.gs.story, st = s?.ch ? stepOf(s) : null;
    const ch = s?.fired && (st?.on || []).find((a) => a.do === 'choose');
    if (ch && s.picks?.[ch.id] == null) this.storyChooseShow(ch);
  }
  // Người nói: 'player' · mã người lạ · 'place:<mã địa điểm>' (NPC đứng ở địa điểm) → { mesh, name, up (độ cao đỉnh đầu) }
  speakerOf(who) {
    if (who === 'player') return { mesh: this.walker.mesh, name: this.gs.profile.name, up: 2.05 };
    if (String(who).startsWith('place:')) {
      const id = who.slice(6), m = this.npcs[id];
      return m ? { mesh: m, name: this.layout.placeById[id]?.npc?.name || '', up: 1.95 } : null;
    }
    const ac = this.storyActors?.[who];
    return ac ? { mesh: ac.seated || ac.mesh, name: fmt(STORY.people?.[who]?.name || ''), up: ac.seated ? 1.6 : 1.95, ac } : null;
  }
  // Bong bóng kiểu cốt truyện: viền vàng, tên người nói, chữ hiện dần kèm tiếng; hold thì hiện xong có dấu [E] nhấp nháy (giữ tới câu sau)
  storyBubble(who, text, hold = false) {
    const sp = this.speakerOf(who);
    if (!sp || !text) return;
    if (who !== 'player') this.lastSpeaker = who; // camera nhìn theo người đang nói
    this.bubbles.show(`story:${who}`, () => headOf(sp.mesh, sp.up), fmt(text, { name: this.gs.profile.name }), 'story', hold ? Infinity : undefined, { name: sp.name, type: true, wait: hold });
  }
  // Hiện 2–3 câu trả lời trên đầu người chơi (story.json → choose) · chọn bằng phím 1/2/3 hoặc bấm vào
  // a.ask: người chơi mở lời — chờ bấm E cạnh người nói (a.who) mới hiện các câu
  storyChooseShow(a, now = false) {
    if (a.ask && !now) { this.storyAsk = a; return; }
    this.storyAsk = null;
    const opts = (a.options || []).map((k) => fmt(k, { name: this.gs.profile.name }));
    if (!opts.length) return;
    this.storyChoice = { ...a, options: opts };
    if (this.speakerOf(a.who)) this.storyTalkWith = a.who; // đang nói chuyện với người này: đứng yên, camera nhìn 2 người
    this.bubbles.remove('story:player');
    this.bubbles.choices('story:choices', () => headOf(this.walker.mesh), opts, (i) => this.storyChoose(i));
  }
  // Vừa cộng điểm tính cách → thông báo nhỏ "😇 Gương mẫu ↑" (không hiện con số)
  storyGainToast(gain) {
    if (gain?.trait && gain.pts > 0) this.hud.toast(fmt(`story.trait.up.${gain.trait}`), 'info', 2500);
  }
  storyChoiceClose() {
    this.storyChoice = null;
    this.bubbles?.remove('story:choices');
  }
  // Người chơi chọn câu i: lưu lại (chương sau dùng) → người chơi nói câu đó → (dấu ? giật mình trên đầu c.react) →
  // ~1 giây sau người nói đáp câu tương ứng (giữ tới khi bấm E)
  storyChoose(i) {
    const c = this.storyChoice;
    if (!c || i >= c.options.length) return;
    this.storyChoiceClose();
    sound('ui.click');
    const gain = c.gains?.[i];
    storyPick(this.gs.story, c.id, i, gain);
    this.storyGainToast(gain);
    // câu người chơi vừa chọn: giữ tới khi bấm E, rồi người kia mới đáp (tuần tự, không đè nhau)
    this.bubbles.show('story:player', () => headOf(this.walker.mesh), c.options[i], 'story', Infinity, { name: this.gs.profile.name, type: true, wait: true });
    if (c.react?.length) this.reactAt = { list: c.react, t: 0.6 };
    if (c.answers?.[i] && this.speakerOf(c.who)) this.pendingReply = { who: c.who, text: c.answers[i] };
  }
  // ---------- THOẠI TUẦN TỰ: mỗi lúc một câu chờ E ----------
  // Câu đang giữ chờ bấm E (bong bóng cốt truyện có dấu E), trừ bảng chọn câu
  storyHeldId() {
    for (const [id, b] of this.bubbles.map) if (id.startsWith('story:') && id !== 'story:choices' && b.t === Infinity) return id;
    return null;
  }
  // Có câu đang chờ E → xếp hàng; không thì hiện luôn
  storyEnqueue(fn) {
    this.storyQueue ||= [];
    if (this.storyHeldId() || this.pendingReply) this.storyQueue.push(fn);
    else fn();
  }
  // Đang chờ người chơi bấm E để hiện câu kế (câu đáp / câu xếp hàng)
  storyWaitE() {
    return !!this.pendingReply || !!this.storyQueue?.length;
  }
  // Bấm E: chữ đang chạy → hiện hết · câu người chơi vừa chọn → người kia đáp · câu đang giữ → tắt, hiện câu kế trong hàng
  storyContinue() {
    const held = this.storyHeldId();
    if (held && this.bubbles.typing(held)) return this.bubbles.finish(held);
    if (this.pendingReply) {
      const r = this.pendingReply;
      this.pendingReply = null;
      this.bubbles.remove('story:player');
      return this.storyBubble(r.who, r.text, true);
    }
    if (held) this.bubbles.remove(held);
    const next = this.storyQueue?.shift();
    next?.();
  }
  // Dấu ? nhảy trên đầu (giật mình) ~1,8 giây
  storyReact(list) {
    this.reacts ||= [];
    for (const who of list) {
      const sp = this.speakerOf(who);
      if (!sp) continue;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.questTex['?'], depthTest: false, transparent: true }));
      s.renderOrder = 10;
      s.scale.set(0.6, 0.6, 1);
      sp.mesh.add(s);
      this.reacts.push({ s, t: 0, up: sp.up + 0.55 });
    }
  }
  reactsTick(dt) {
    if (this.reactAt && (this.reactAt.t -= dt) <= 0) { this.storyReact(this.reactAt.list); this.reactAt = null; }
    for (const r of this.reacts || []) {
      r.t += dt;
      r.s.position.y = r.up + Math.abs(Math.sin(r.t * 9)) * 0.15 * Math.max(0, 1 - r.t / 1.8);
      r.s.scale.setScalar(0.6 * Math.min(1, r.t / 0.18)); // bật lên
      if (r.t > 1.8) r.s.parent?.remove(r.s);
    }
    this.reacts = (this.reacts || []).filter((r) => r.t <= 1.8);
  }
  // Độ rõ của bảng tên / biển nổi (0..1): camera càng sát càng mờ (dưới near m: mờ hẳn, mờ dần trong span m);
  // bảng nằm giữa camera và người chơi (gần camera hơn, che hướng nhìn) → mờ còn tối đa 0,15
  labelFade(pos, near, span) {
    const cp = this.camera.position, pp = this.playerPos;
    const dc = Math.hypot(pos.x - cp.x, pos.z - cp.z);
    let a = Math.max(0, Math.min(1, (dc - near) / span));
    const vx = pp.x - cp.x, vz = pp.z - cp.z, L = Math.hypot(vx, vz) || 1;
    const along = ((pos.x - cp.x) * vx + (pos.z - cp.z) * vz) / L, side = Math.abs(((pos.x - cp.x) * vz - (pos.z - cp.z) * vx) / L);
    if (along > 0 && along < L - 0.5 && side < 2.5) a = Math.min(a, 0.15);
    return a;
  }
  // Khoảng cách tới mục tiêu theo đường đi thật (giống chỉ đường / bản đồ). Gần (< 25 m) thì đường chim bay.
  // Tính lại khi người chơi đi thêm > 4 m hoặc mục tiêu đổi chỗ (không tính mỗi khung hình)
  goalRouteDist(pp, tgt, straight) {
    if (straight < 25) return straight;
    const c = this.goalDistCache;
    if (c && Math.hypot(c.x - pp.x, c.z - pp.z) < 4 && c.tx === tgt.x && c.tz === tgt.z) return c.d;
    const d = Math.max(straight, routeDist(pp, tgt) || straight);
    this.goalDistCache = { x: pp.x, z: pp.z, tx: tgt.x, tz: tgt.z, d };
    return d;
  }
  // ---------- HỘI THOẠI BẰNG BONG BÓNG (mọi lời thoại cốt truyện: nói chuyện ở địa điểm, việc "say") ----------
  // mesh: người đang nói (NPC địa điểm / người lạ) · name: tên hiện trên bong bóng · pages: các câu (bấm E sang câu sau)
  // onDone: chạy khi nói xong (xếp hàng, tặng đồ, báo cốt truyện…). Không tự cho người chơi nói câu nào (người chơi chỉ nói khi tự chọn câu)
  // Trong lúc nói: người chơi đứng yên, quay mặt, camera xích lại (storyTalkActor); đồng hồ chung vẫn chạy (không dừng giờ).
  storyConverse({ mesh, name, pages, onDone = null }) {
    const list = (pages || []).map((t) => String(t).replace(/<[^>]+>/g, '').trim()).filter(Boolean); // bong bóng chỉ có chữ thường
    if (!list.length) return onDone?.();
    if (mesh?.userData?.label) mesh.userData.label.visible = false; // bảng tên trên đầu NPC: tạm ẩn cho khỏi chồng lên bong bóng
    this.talk = { mesh, name, pages: list, i: 0, onDone };
    this.talkLine();
    this.chatCh?.local('npc', name, list[0].length > 160 ? list[0].slice(0, 157) + '…' : list[0], { time: fmtClock(this.clockMin) }); // log chat bên trái
  }
  talkLine() {
    const t = this.talk;
    const head = t.mesh ? () => headOf(t.mesh, 1.95) : () => headOf(this.walker.mesh);
    this.bubbles.show('story:talk', head, t.pages[t.i], 'story', Infinity, { name: t.name, type: true, wait: true });
  }
  // Bấm E trong lúc nói chuyện: chữ đang chạy → hiện hết · không thì câu sau · hết câu → xong
  talkNext() {
    const t = this.talk;
    if (!t) return;
    if (this.bubbles.typing('story:talk')) return this.bubbles.finish('story:talk');
    if (++t.i < t.pages.length) return this.talkLine();
    this.talkEnd();
    t.onDone?.();
  }
  talkEnd() {
    const t = this.talk;
    if (!t) return;
    this.talk = null;
    this.bubbles.remove('story:talk');
    if (t.mesh?.userData?.label) t.mesh.userData.label.visible = true;
  }
  // Đang nói chuyện (để quay mặt + khóa camera): NPC địa điểm (storyConverse) · hoặc người chơi đã bấm E bắt chuyện, còn đứng gần,
  // bước đang chờ nói tiếp / chọn câu / sắp có câu đáp. Camera nhìn theo người vừa nói (lastSpeaker). Hết chuyện → camera trả lại như cũ
  storyTalkActor() {
    if (this.talk) return this.talk.mesh ? this.talk : null; // đang nói chuyện bằng bong bóng với NPC địa điểm
    const who = this.storyTalkWith;
    if (!who || this.mode !== 'foot') return null;
    const s = this.gs.story, st = s?.ch ? stepOf(s) : null, u = st?.until;
    const on = u?.type === 'talkActor' || u?.type === 'chosen' || this.storyWaitE() || !!this.storyChoice;
    const focus = (this.lastSpeaker && this.bubbles.map.has(`story:${this.lastSpeaker}`) && this.speakerOf(this.lastSpeaker)) || this.speakerOf(who);
    if (!on || !focus || focus.ac?.leaving || dist2(this.walker.pos, focus.mesh.position) > 5) {
      if (!on && s?.fired) this.storyTalkWith = null;
      return null;
    }
    return focus;
  }
  // Người chơi bấm E cạnh người nói (người lạ / NPC địa điểm): chờ mở lời → hiện các câu · chữ đang chạy → hiện hết ·
  // bước đang chờ nói chuyện với người này → sang câu tiếp theo · không thì người lạ nói câu "idle"
  storyActorTalk(who) {
    const s = this.gs.story, st = stepOf(s);
    if (this.storyChoice) return;
    if (this.storyAsk?.who === who) { this.storyTalkWith = who; return this.storyChooseShow(this.storyAsk, true); }
    if (this.storyTyping(who)) return this.bubbles.finish(`story:${who}`); // chữ đang chạy → bấm E hiện hết câu
    if (st && s.fired && st.until?.type === 'talkActor' && st.until.who === who) {
      this.storyTalkWith = who;
      this.bubbles.remove(`story:${who}`);
      storyEvent(s, `actor:${who}`);
      return;
    }
    const ac = this.storyActors?.[who];
    if (ac?.def?.idle && !this.storyActorPending(who)) this.storyBubble(who, ac.def.idle);
  }
  // Câu đang giữ (chờ bấm E) của người nói còn đang hiện dần chữ (câu gọi "Ê nhóc!" không tính: bấm E là bắt chuyện luôn)
  storyTyping(who) {
    const id = `story:${who}`;
    return this.bubbles.typing(id) && this.bubbles.map.get(id).t === Infinity;
  }
  // Còn chuyện để nói với người này không (để hiện nút E)
  storyActorTalkable(who) {
    const s = this.gs.story, st = stepOf(s), ac = this.storyActors?.[who];
    if (this.storyChoice || this.storyWaitE() || ac?.leaving || ac?.seated) return false;
    if (this.storyAsk?.who === who || this.storyTyping(who) || (st && s.fired && st.until?.type === 'talkActor' && st.until.who === who)) return true;
    return !!ac?.def?.idle && !this.storyActorPending(who);
  }
  // Chữ trên nút E khi đứng cạnh người nói
  storyTalkLabel(who) {
    const st = stepOf(this.gs.story);
    if (st?.talkLabel && (this.storyAsk?.who === who || st.until?.who === who)) return fmt(st.talkLabel);
    if (this.storyTalkWith && this.storyTalkWith !== null && (st?.until?.type === 'talkActor' || this.storyAsk)) return fmt('act.talkNext');
    return fmt('act.talkPed', { name: this.speakerOf(who)?.name || '' });
  }
  // Những người đang có thể bấm E nói chuyện: người lạ + NPC địa điểm mà bước đang chờ (mở lời / bấm E)
  storyTalkTargets() {
    const out = Object.keys(this.storyActors || {});
    const st = stepOf(this.gs.story), w = [this.storyAsk?.who, st?.until?.type === 'talkActor' ? st.until.who : null];
    for (const x of w) if (x && String(x).startsWith('place:') && !out.includes(x)) out.push(x);
    return out;
  }
  // Còn bước nào phía trước (kể cả bước đang chạy) chờ nói chuyện với người này không → chưa nói chuyện xong thì chưa có câu "idle"
  storyActorPending(who) {
    const s = this.gs.story, ch = s?.ch && chapterOf(s);
    return !!ch && ch.steps.slice(Math.max(0, s.step)).some((x) => x.until?.type === 'talkActor' && x.until.who === who);
  }
  storyActorLeave(who) {
    const ac = this.storyActors?.[who];
    if (!ac) return;
    this.bubbles.remove(`story:${who}`); // nói xong rồi mới đi
    // có xe đi kèm: đội nón full-face, lên xe, chạy dọc đường rồi biến mất
    if (ac.vehicle) {
      this.scene.remove(ac.mesh);
      ac.rider = seatRider(ac.vehicle, { ...ac.look, face: null, hat: 'helmet', helmetStyle: 'full', hatColor: 0x111111 }, 'sport');
      Object.assign(ac, { mode: 'ride', leaving: true, t: 0, speed: 0 });
      return;
    }
    const p = this.walker.mesh.position, m = ac.mesh.position;
    const dx = m.x - p.x, dz = m.z - p.z, l = Math.hypot(dx, dz) || 1;
    // chạy ra xa người chơi: chọn hướng gần "thẳng ra xa" nhất mà 15 m phía trước không vướng nhà / vật cản
    const dirAt = (deg) => { const r = (deg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r); return [(dx * c + dz * sn) / l, (dz * c - dx * sn) / l]; };
    const free = ([ux, uz]) => { for (let k = 1; k <= 15; k++) if (this.city.grid.inside(m.x + ux * k, 0.5, m.z + uz * k)) return false; return true; };
    const dir = [0, 30, -30, 60, -60, 90, -90, 120, -120].map(dirAt).find(free) || dirAt(0);
    Object.assign(ac, { mode: 'leave', leaving: true, dir, t: 0 });
  }
  // Người lạ lên xe người chơi (ngồi sau, tự đội mũ — chuyến chở theo cốt truyện, không qua app): người chơi đang đi bộ thì đi theo,
  // người chơi ngồi trên xe, tới sát xe thì leo lên
  storyActorBoard(who) {
    const ac = this.storyActors?.[who];
    if (ac && !ac.seated) ac.mode = 'board';
  }
  storyActorSeat(ac) {
    const m = makePerson({ ...ac.look, face: null, hat: 'helmet', hatColor: 0xff8fb1 }); // mũ bảo hiểm của mình
    this.scene.remove(ac.mesh);
    this.bike.mesh.add(m);
    setSitting(m, true);
    for (const s of ['L', 'R']) { m.userData.parts['arm' + s].rotation.x = -0.55; m.userData.parts['elbow' + s].rotation.x = -0.9; } // ôm hờ eo người lái
    m.position.set(0, sitY(m.scale.x, 1.02), -0.62);
    ac.seated = m;
    ac.mode = 'ride-with';
    this.bike.mesh.userData.bagMesh.visible = false;
  }
  storyActorAlight(who) {
    const ac = this.storyActors?.[who];
    if (!ac?.seated) return;
    ac.seated.parent?.remove(ac.seated);
    ac.seated = null;
    const h = this.bike.heading, b = this.bike.mesh.position; // xuống bên phải xe, đứng nhìn người chơi
    ac.mesh.position.set(b.x + Math.cos(h) * 1.1, b.y, b.z - Math.sin(h) * 1.1);
    this.scene.add(ac.mesh);
    ac.mode = 'idle';
  }
  storyActorRemove(who) {
    const ac = this.storyActors?.[who];
    if (!ac) return;
    this.scene.remove(ac.mesh);
    ac.seated?.parent?.remove(ac.seated);
    if (ac.vehicle) this.scene.remove(ac.vehicle);
    this.bubbles.remove(`story:${who}`);
    delete this.storyActors[who];
    if (this.lastSpeaker === who) this.lastSpeaker = null;
  }
  // Mỗi khung hình: đi tới chỗ người chơi, đứng nhìn người chơi / người cùng nói chuyện (def.faceTo), chạy đi, lên xe đi mất, theo người chơi lên xe
  storyActorsTick(dt) {
    this.reactsTick(dt);
    // câu đáp lại câu người chơi vừa chọn (người lạ / NPC địa điểm)
    // câu đang giữ đã tắt (vd đi xa) mà còn câu xếp hàng → hiện câu kế
    if (this.storyQueue?.length && !this.storyHeldId() && !this.pendingReply) this.storyQueue.shift()();
    for (const [who, ac] of Object.entries(this.storyActors || {})) {
      if (ac.seated) continue; // đang ngồi sau xe người chơi: đi theo xe
      if (ac.mode === 'ride') { // lên mô tô chạy dọc đường, 6 giây sau biến mất
        ac.t += dt;
        ac.speed = Math.min(11, ac.speed + dt * 5);
        ac.vehicle.position.x += ac.street[0] * ac.speed * dt;
        ac.vehicle.position.z += ac.street[1] * ac.speed * dt;
        if (ac.t > 6) this.storyActorRemove(who);
        continue;
      }
      const m = ac.mesh.position, p = this.walker.mesh.position;
      const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
      let speed = 0, amount = 0;
      if (ac.mode === 'approach' && d > 1.2) [speed, amount] = [1.5, 0.55];
      if (ac.mode === 'leave') [speed, amount] = [5, 1];
      if (ac.mode === 'board') {
        const b = this.bike.mesh.position, db = Math.hypot(b.x - m.x, b.z - m.z);
        if (this.mode === 'bike' && db < 3.5 && Math.abs(this.bike.speed) < 1.5) { this.storyActorSeat(ac); continue; }
        if (d > 2.2) [speed, amount] = [Math.min(4, 1.4 + d * 0.3), 0.6]; // đi theo người chơi
      }
      const [ux, uz] = ac.mode === 'leave' ? ac.dir : [dx / (d || 1), dz / (d || 1)];
      m.x += ux * speed * dt;
      m.z += uz * speed * dt;
      if (speed) resolveCircle(m, 0.35, this.city.grid); // né nhà, cột, xe buýt đậu… (trượt dọc theo)
      if (ac.mode === 'board' || ac.mode === 'approach' || (ac.def?.spot !== 'xeOm' && ac.def?.spot !== 'place')) m.y = p.y; // đứng cố định trên vỉa hè thì giữ nguyên độ cao
      if (speed) ac.mesh.rotation.y = Math.atan2(ux, uz);
      else {
        // đứng yên: người chơi tới gần (12 m) → quay về phía người chơi; không thì nhìn người cùng nói chuyện (faceTo)
        const other = ac.def?.faceTo && this.storyActors[ac.def.faceTo]?.mesh;
        const tgt = d < 12 ? p : other?.parent ? other.position : null;
        if (tgt) {
          const want = Math.atan2(tgt.x - m.x, tgt.z - m.z), cur = ac.mesh.rotation.y;
          ac.mesh.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 4);
        }
      }
      // đang có dấu ! trên đầu (chờ người chơi lại nói chuyện) → cứ ~6 giây gọi một câu
      const s = this.gs.story, st = s?.ch ? stepOf(s) : null, bid = `story:${who}`;
      const marked = [].concat(st?.mark || []).some((k) => k.actor === who && k.icon === '!');
      if (ac.def?.call && s.fired && marked && d < 25 && !this.bubbles.map.has(bid) && (ac.callT -= dt) <= 0) {
        this.storyBubble(who, ac.def.call);
        ac.callT = 6;
      }
      if (d > 10 && this.bubbles.map.get(bid)?.t === Infinity) this.bubbles.remove(bid); // đi xa: tắt câu đang giữ
      ac.phase += dt * (amount ? 5 + speed : 0);
      animatePerson(ac.mesh, ac.phase, amount);
      if (ac.mode === 'leave' && (ac.t += dt) > 5) this.storyActorRemove(who);
    }
  }

  // Mời cuốc chở khách cốt truyện (gần mình, không hết hạn, không bỏ qua được). Đang bận thì storyUpdate mời lại sau
  // a.kind: 'ride' (mặc định) = cuốc chở khách hướng dẫn · 'food' = đơn giao đồ ăn ở quán a.place (vd Bún Mọc Cô Yến)
  storyOffer(a = {}) {
    this.storyOfferAt = performance.now();
    if (this.om.order || this.om.state === S.OFFERED) return false;
    const o = a.kind === 'food' ? this.om.storyFood(a.place, this.playerPos, this.clockMin) : this.om.storyRide(this.playerPos, this.clockMin, a.customer || null);
    return this.om.forceOffer(o);
  }
  // Chữ cốt truyện: có bản riêng theo loại xe (khóa + ".gas" / ".electric") thì dùng bản đó; tham số chung: tên, luật tài khoản
  storyText(key) {
    if (!key) return '';
    const p = this.gs.power, k = has(`${key}.${p}`) ? `${key}.${p}` : key;
    return fmt(k, { name: this.gs.profile.name, lockBelow: Number(APP.account.lockBelow).toFixed(1), maxLate: ECONOMY.maxLate ?? 2 });
  }
  // Chỗ nạp năng lượng cho xe đang dùng: cây xăng (xe xăng) · trụ sạc (xe điện)
  fuelStop() {
    const kind = this.gs.power === 'electric' ? 'charger' : this.gs.power === 'gas' ? 'gas' : null;
    return kind ? this.nearestPlace((p) => p.kind === kind) : null;
  }
  // Chữ tên chương to giữa màn hình, tự mờ dần (~5 giây). dim: cảnh game phía sau tối hẳn rồi sáng lại cùng lúc
  chapterCard(title, sub, dim = false) {
    for (const id of ['chapterCard', 'chapterDim']) document.getElementById(id)?.remove();
    if (dim) {
      const bg = document.createElement('div');
      bg.id = 'chapterDim';
      document.body.appendChild(bg);
      setTimeout(() => bg.remove(), 5200);
    }
    const el = document.createElement('div');
    el.id = 'chapterCard';
    el.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5200);
  }
  // Mục tiêu trên màn hình của bước đang chạy (mũi tên tới target). Bước "bấm 📍 Chỉ đường": chưa bấm thì chưa có mũi tên
  storyGoal() {
    const st = stepOf(this.gs.story);
    if (!st?.goal || !this.gs.story.fired) return null; // tin nhắn của bước chưa tới → chưa hiện mục tiêu
    const g = { text: this.storyText(st.goal), sub: this.storyText(st.hint), color: '#f4d03f' };
    const rg = st.guide?.type === 'route' ? st.guide : st.guide?.type === 'fuel' ? { place: 'fuel' } : null; // bước phải bấm 📍 Chỉ đường
    if (rg && this.storyRouted(rg)) this.gs.story.ev.routed = true; // đã bấm 📍 → nhớ (tới nơi game xóa chỉ đường)
    if (rg && !this.gs.story.ev.routed) return g;
    let at = null;
    if (st.target === 'bike') at = this.bike.pos;
    else if (st.target === 'fuel') {
      const w = this.waypointPlace();
      at = (w && ['gas', 'charger', 'swap'].includes(w.kind) ? w : this.fuelStop())?.door;
    }
    else if (st.target === 'office') {
      const w = this.waypointPlace();
      at = (w?.kind === 'office' ? w : this.nearestPlace((pl) => pl.kind === 'office'))?.door;
    } else if (st.target?.startsWith('actor:')) at = this.storyActors?.[st.target.slice(6)]?.mesh.position;
    else if (st.target) at = this.layout.placeById[st.target]?.door;
    return at ? { ...g, x: at.x, z: at.z } : g;
  }
  // Đã bấm 📍 Chỉ đường tới đúng chỗ của bước chưa ('office' = văn phòng hãng nào cũng được ·
  // 'fuel' = cây xăng / trụ sạc / trạm đổi pin nào cũng được, xe đã đầy thì coi như xong)
  storyRouted(gd) {
    const w = this.waypointPlace();
    if (gd.place === 'fuel') return ['gas', 'charger', 'swap'].includes(w?.kind) || this.gs.power === 'pedal' || this.gs.fuel >= this.gs.vehicleSpec.tank * 0.9;
    return gd.place === 'office' ? w?.kind === 'office' : this.waypoint === gd.place;
  }
  // Hướng dẫn màn xếp túi lúc nhận đồ theo cốt truyện (interactions.storyPack → this.storyPacking = màn xếp túi)
  packGuide() {
    const node = this.storyPacking;
    if (!node?.isConnected) return null;
    const { items, selected, placed, upright } = node.packState();
    const G = (id, sel, tk, params = {}) => ({ id, sel: [sel], title: fmt(`story.guide.${tk}`, params), hint: fmt(`story.guide.${tk}Hint`, params), top: true });
    const i = items.findIndex((it, k) => placed[k] < 0 || (it.has('liquid') && !upright[k]));
    if (i < 0) return G('pack-done', '.packing [data-act="done"]', 'packDone');
    if (selected !== i || !node.picked?.has(i)) return G(`pack-item-${i}`, `.packing [data-item="${i}"]`, 'packItem', { item: items[i].name });
    if (placed[i] < 0) return G(`pack-cell-${i}`, '.packing .pk-cell:not(.full)', 'packCell');
    return { ...G(`pack-rot-${i}`, '.packing [data-act="rotate"]', 'packRotate'), also: ['.packing .pk-cell.sel'] }; // sáng cả ô món đang xoay trong túi (không khung)
  }

  // Món cần mặc tiếp (bước "wear"): đồng phục hãng → mũ hãng
  storyWearNeed() {
    const gs = this.gs, u = uniformOf(gs.brand);
    if (u && !gs.wearingUniform()) return u;
    const h = brandHelmet(gs.brand);
    return h && gs.wornIds().helmet !== h.id ? h : null;
  }
  // Nút cần làm sáng trên điện thoại cho bước đang chạy → { id, sel, title, hint, app } (Spotlight) · null = không hướng dẫn
  storyGuide() {
    const st = stepOf(this.gs.story), gd = st?.guide, ph = this.phone;
    if (!gd || !this.gs.story.fired) return null;
    const btn = gd.btn ? fmt(gd.btn === 'ok' ? 'story.guide.btnOk' : 'story.guide.btnNext') : null; // nút Tiếp ▸ / Đã rõ (bấm mới sang bước sau)
    const offered = this.om.state === S.OFFERED;
    // làm sáng một phần màn hình (bản đồ tròn, dòng phím, thanh thể lực, màn hình điện thoại…) + bong bóng chữ có nút
    if ((gd.type === 'hud' && gd.part !== 'phone') || gd.type === 'minimap') {
      const part = HUD_PARTS[gd.type === 'minimap' ? 'minimap' : gd.part];
      return part ? { id: `hud-${st.id}`, sel: [part[1]], title: this.storyText(gd.title), hint: this.storyText(gd.hint), btn } : null;
    }
    // máy đang cất: làm sáng hình điện thoại cạnh bản đồ (bấm vào hoặc Tab; mặc đồ / dùng đồ thì I mở thẳng Túi đồ)
    if (!ph.open) {
      if ((gd.type === 'route' || gd.type === 'fuel') && this.gs.story.ev.routed) return null;
      if (gd.type === 'use' && !(this.gs.consumables[gd.goods] > 0)) return null;
      if (gd.type === 'wear' && !this.storyWearNeed()) return null;
      if (gd.type === 'order' && !offered) return null;
      if (!st.goal && gd.type !== 'order' && gd.type !== 'hud') return null;
      const bag = gd.type === 'wear' || gd.type === 'use';
      const title = gd.type === 'order' ? fmt('story.guide.offerIcon') : st.goal ? this.storyText(st.goal) : this.storyText(gd.title);
      return { id: `phone-${st.id}`, sel: ['#phoneIcon'], title, hint: fmt(bag ? 'story.guide.tabBagHint' : 'story.guide.tabHint'), keys: bag ? ['KeyI', 'Tab'] : ['Tab'] };
    }
    // màn hình điện thoại (vd app CSGT vừa tự mở): sáng cả màn hình máy + nút Đã rõ
    if (gd.type === 'hud') return { id: `hud-${st.id}`, sel: [HUD_PARTS.phone[1]], title: this.storyText(gd.title), hint: this.storyText(gd.hint), btn };
    const G = (id, sel, tk, params = {}, app = null) => ({ id, sel: [sel], title: fmt(`story.guide.${tk}`, params), hint: fmt(`story.guide.${tk}Hint`, params), app });
    const back = () => G('back', '.ph-appbar [data-home]', 'back');
    const openApp = (app, tk, params) => (ph.app ? back() : G(`app-${app}`, `.ph-apps button[data-app="${app}"]`, tk, params, app));
    if (gd.type === 'thread' || gd.type === 'reply' || gd.type === 'route') {
      if (gd.type === 'route' && this.storyRouted(gd)) return null;
      if (ph.app !== 'chat') return openApp('chat', 'chatApp');
      if (ph.thread !== gd.who) return ph.thread ? back() : G(`thread-${gd.who}`, `[data-thread="${gd.who}"]`, 'thread', { name: fmt(STORY.contacts[gd.who]?.name || '') });
      if (gd.type === 'thread') return null;
      if (gd.type === 'reply') return G('reply', '.msg-replies', 'reply');
      // chọn hãng: sáng cả tin nhắn có 2 nút 📍 (người chơi tự chọn hãng)
      const offices = this.layout.places.filter((p) => p.kind === 'office').map((p) => `.msg-loc[data-id="${p.id}"]`).join(', ');
      return G('loc', gd.place === 'office' ? `.bub:has(${offices})` : `.msg-loc[data-id="${gd.place}"]`, 'loc');
    }
    if (gd.type === 'use') {
      const g = GOODS[gd.goods];
      if (!g || !(this.gs.consumables[gd.goods] > 0)) return null;
      if (ph.app !== 'bag') return openApp('bag', 'bagApp');
      if (ph.bagSel !== `g:${g.id}`) return G(`cell-${g.id}`, `.bag-grid [data-bag="g:${g.id}"]`, 'bagCell', { item: g.name });
      return G(`use-${g.id}`, '.bag-detail [data-act="bagUse"]', 'bagUse');
    }
    if (gd.type === 'wear') {
      const need = this.storyWearNeed();
      if (!need) return null;
      if (ph.app !== 'bag') return openApp('bag', 'bagApp');
      if (ph.bagSel !== `g:${need.id}`) return G(`cell-${need.id}`, `.bag-grid [data-bag="g:${need.id}"]`, 'bagCell', { item: need.name });
      return G(`wear-${need.id}`, '.bag-detail [data-act="bagWear"]', 'bagWear');
    }
    const jobApp = () => openApp('goship', 'jobApp', { app: this.gs.brandSpec?.name || '' });
    if (gd.type === 'switch') {
      if (ph.app !== 'goship') return jobApp();
      if (ph.profile) return G('back', '.ph-appbar [data-home]', 'back');
      return { id: `sw-${gd.which}`, sel: [`.sw[data-act="${gd.which === 'food' ? 'wantFood' : 'wantRide'}"]`], title: this.storyText(st.goal), hint: this.storyText(st.hint) };
    }
    // app Xe → 📍 Chỉ đường tới cây xăng / trụ sạc gần nhất
    if (gd.type === 'fuel') {
      const stop = this.fuelStop();
      if (!stop || this.storyRouted({ place: 'fuel' })) return null;
      if (ph.app !== 'bike') return openApp('bike', 'bikeApp');
      return G('fuel-route', `.ph-body [data-act="waypoint"][data-id="${stop.id}"]`, 'fuelRoute');
    }
    // có đơn mời: app nhận đơn → nút Nhận
    if (gd.type === 'order') {
      if (!offered) return null;
      if (ph.app !== 'goship') return jobApp();
      if (ph.profile) return G('back', '.ph-appbar [data-home]', 'back');
      return G('accept', '.offer [data-act="accept"]', 'accept');
    }
    // app nhận đơn → 👤 Hồ sơ → sáng cả trang hồ sơ + luật tài khoản, nút Đã rõ
    if (gd.type === 'profile') {
      if (ph.app !== 'goship') return jobApp();
      if (!ph.profile) return G('prof', '.prof-btn', 'profileBtn');
      return { id: 'profile-info', sel: [HUD_PARTS.phone[1]], title: this.storyText(gd.title), hint: this.storyText(gd.hint), btn };
    }
    return null;
  }

  currentTarget() {
    const { om, gs } = this;
    const o = om.order;
    if (gs.towed && this.mode === 'foot') {
      const lot = this.layout.placeById[gs.towed.placeId];
      const fee = gs.towed.fee + (lot?.kind === 'police' ? gs.finesTotal : 0); // ở đồn: đóng cả phạt nguội
      // xa thì gợi ý đi xe buýt (trạm gần mình → trạm gần nơi giữ xe, cùng tuyến)
      const pp = this.playerPos, far = lot && Math.hypot(lot.door.x - pp.x, lot.door.z - pp.z) > 200;
      // xe đang ở đồn công an (không có xe để chạy): chỉ đường đi bộ ra trạm → xe buýt tuyến nào → xuống trạm nào
      const plan = lot?.kind === 'police' && this.busPlanTo(lot.door);
      if (plan) {
        const x = plan.legs[1]; // có đổi tuyến: xuống trạm đổi rồi đón tuyến thứ 2
        return { ...plan.from.wait, text: fmt('goal.busPlan', { from: plan.from.name, route: routeShort(plan.route), to: plan.to.name }),
          sub: x ? fmt('goal.busPlanHintX', { route2: routeShort(x.route), to: x.to.name, place: lot.name, fee }) : fmt('goal.busPlanHint', { place: lot.name, fee }), color: '#16a085' };
      }
      const h = far && inService(this.clockMin) && busHint(this.bus, pp.x, pp.z, lot.door.x, lot.door.z);
      const sub = h ? fmt('goal.towedBus', { from: h.from.name, route: h.route.name, to: h.to.name }) : fmt('goal.towedHint');
      return { x: this.bike.pos.x, z: this.bike.pos.z, text: fmt('goal.towed', { place: lot?.name || '', fee }), sub, color: '#e74c3c' };
    }
    // app Xe → 📍 Định vị xe: chỉ đường tới chỗ xe đang dựng (tới nơi / lên xe thì thôi)
    if (this.findBike) {
      if (this.mode === 'bike' || dist2(this.playerPos, this.bike.pos) < 3) this.findBike = false;
      else return { x: this.bike.pos.x, z: this.bike.pos.z, text: fmt('goal.findBike', { bike: gs.vehicleSpec.name }), sub: fmt('goal.findBikeHint'), color: '#5dade2' };
    }
    if (o) {
      if ([S.TO_PICKUP, S.WAITING_FOOD, S.OUT_OF_STOCK, S.PACKING].includes(om.state)) {
        const wait = om.state === S.WAITING_FOOD ? Math.ceil(om.minutesUntilReady(this.clockMin)) : 0;
        const k = o.kind === 'ride' ? 'Ride' : o.kind === 'parcel' ? 'Parcel' : 'Food';
        return { ...o.pickup.door, text: fmt(`goal.pickup${k}`, { customer: o.customer, place: o.pickup.name }), sub: wait ? fmt('goal.pickupWait', { min: wait }) : fmt(`goal.pickup${k}Hint`), color: '#f39c12' };
      }
      // bị bom: mang hàng về trả shop
      if (om.state === S.RETURNING) return { ...o.pickup.door, text: fmt('goal.returnParcel', { place: o.pickup.name }), sub: fmt('goal.returnParcelHint'), color: '#e67e22' };
      if (!o.revealed && o.zone) return { x: o.zone.x, z: o.zone.z, zone: o.zone, text: fmt('goal.vague', { customer: o.customer }), sub: fmt('goal.vagueHint'), color: '#9b59b6' };
      return { ...o.dropoff.door, text: fmt(o.kind === 'ride' ? 'goal.dropRide' : 'goal.dropFood', { address: o.dropoff.address }), sub: o.kind === 'ride' ? fmt('goal.dropRideHint', { kmh: act.comfortKmh(this, o) }) : fmt('goal.dropFoodHint'), color: '#2ecc71' };
    }
    const P = this.layout.placeById;
    // cốt truyện đang chạy: mục tiêu của bước hiện tại
    const sg = om.state !== S.OFFERED && this.storyGoal();
    if (sg) return sg;
    if (gs.story?.ch && !gs.brand) return null; // giữa 2 bước cốt truyện (chưa vào hãng): chưa có gì để nhắc
    // địa điểm tự chọn trên bản đồ điện thoại (Chỉ đường) — ưu tiên hơn gợi ý mục tiêu
    const wp = this.waypointPlace();
    if (wp && om.state !== S.OFFERED) {
      // người mới đang đi tới văn phòng hãng: nhắc cất máy, tới nơi bấm E đăng ký
      if (wp.kind === 'office' && !gs.brand) return { ...wp.door, text: fmt('goal.toOffice', { place: wp.name }), sub: fmt(this.phone.open ? 'goal.toOfficeClose' : 'goal.toOfficeHint'), color: '#1e90ff' };
      return { ...wp.door, text: fmt('goal.waypoint', { place: wp.name }), sub: fmt('goal.waypointHint'), color: '#1e90ff' };
    }
    // buồn ngủ / app nghỉ ban đêm → nhắc về phòng trọ ngủ (ưu tiên hơn mua đồ)
    const tired = gs.tiredLevel(this.clockMin);
    if (tired && om.state !== S.OFFERED) return { ...P.home.door, text: fmt(tired > 1 ? 'goal.veryTired' : 'goal.tired', { h: Math.floor(gs.awakeHours(this.clockMin)) }), sub: fmt('goal.sleepHint'), color: '#8e7cc3' };
    if (!inHours(APP.hours, this.clockMin) && om.state !== S.OFFERED) return { ...P.home.door, text: fmt('goal.appClosed'), sub: fmt('goal.sleepHint'), color: '#8e7cc3' };
    for (const ob of objectives(gs)) {
      if (ob.done) continue;
      // mở đầu: tìm nhà trọ (tới gần thì nhắc nói chuyện với Cô Hai) → leo lên xe đạp trong hầm
      if (ob.id === 'findHome') {
        const h = P.home, near = dist2(this.playerPos, h.door) < 8;
        return { ...h.door, text: fmt(near ? 'goal.talkLandlord' : 'goal.findHome', { place: h.name }), sub: fmt(near ? 'goal.talkLandlordHint' : 'goal.findHomeHint'), color: '#f4d03f' };
      }
      if (ob.id === 'mountBike') return { x: this.bike.pos.x, z: this.bike.pos.z, text: fmt('goal.mountBike'), sub: fmt('goal.mountBikeHint'), color: '#5dade2' };
      if (ob.id === 'mount') return { x: this.bike.pos.x, z: this.bike.pos.z, text: fmt('goal.mount'), sub: fmt('goal.mountHint'), color: '#5dade2' };
      if (ob.id === 'brand') {
        const st = this.tutorialStep();
        if (['phone', 'map', 'office', 'route'].includes(st)) return { text: fmt(`goal.tut.${st}`), sub: fmt(`goal.tut.${st}Hint`) };
        const at = this.nearOffice();
        if (at) return { ...at.door, text: fmt('goal.atOffice', { place: at.name }), sub: fmt(this.phone.open ? 'goal.atOfficeClose' : 'goal.atOfficeHint'), color: '#1e90ff' };
        const off = this.nearestPlace((p) => p.kind === 'office');
        return off ? { ...off.door, text: fmt('goal.brand'), sub: fmt('goal.brandHint', { place: off.name }), color: '#5dade2' } : { text: fmt('goal.brand'), sub: '' };
      }
      if (ob.id === 'fuel') {
        if (gs.power === 'electric') {
          const ch = this.nearestPlace((p) => p.kind === 'charger');
          if (ch) return { ...(ch.chargeSpot || ch.door), text: fmt('goal.charge'), sub: fmt('goal.chargeHint'), color: '#5dade2' };
        } else if (gs.power === 'gas') return { ...P.gas.door, text: fmt('goal.fuel'), sub: fmt('goal.fuelHint'), color: '#5dade2' };
      }
      if (ob.id === 'online') return { text: fmt('goal.online'), sub: '' };
      // nhắc về trả tiền nhà chỉ vào NGÀY hạn trả (đủ tiền từ sớm thì cứ chạy đơn, không bị kéo về nhà sau khi đổ xăng / sạc)
      if (ob.id === 'rent' && gs.money >= gs.rent && gs.day >= gs.rentDueDay) return { ...P.home.door, text: fmt('goal.rent', { rent: gs.rent, day: gs.rentDueDay }), sub: fmt('goal.rentHint'), color: '#e74c3c' };
    }
    if (gs.fines.length && gs.money >= gs.finesTotal && (gs.hasOverdueFines || gs.finesDueAt - this.clockMin < 1440)) {
      const st = this.nearestStation();
      if (st) return { ...st.door, text: fmt('goal.fines', { fine: gs.finesTotal, place: st.name }), sub: fmt('goal.finesHint'), color: '#e67e22' };
    }
    // đã vào hãng nhưng đang đi xe không đúng loại (xe đạp / xe xăng ↔ xe điện) → nhắc đổi xe
    if (gs.workBlock() === 'noUniform') return { text: fmt('goal.noUniform', { brand: gs.brandSpec.name }), sub: fmt('goal.noUniformHint') };
    if (gs.workBlock() === 'wrongVehicle') return { text: fmt('goal.wrongVehicle', { brand: gs.brandSpec.name, kind: fmt(`power.${gs.brandSpec.power}`) }), sub: fmt('goal.wrongVehicleHint') };
    if (om.state === S.OFFLINE) return { text: fmt('goal.online'), sub: '' };
    if (!gs.rentPaid && gs.money < gs.rent) return { text: fmt('goal.waiting', { k: Math.ceil(gs.rent - gs.money), day: gs.rentDueDay }), sub: fmt('goal.waitingHint') };
    return null;
  }

  // ======================== HIỂN THỊ ========================
  updateCamera(dt) {
    // độ nhạy chuột + đảo trục dọc (màn hình Cài đặt)
    const k = this.settings.sens, ky = k * (this.settings.invertY ? -1 : 1);
    const locked = !!this.storyTalkActor(); // đang nói chuyện (cốt truyện): khóa camera ở góc nhìn 2 người, không xoay / phóng
    if (!locked && (this.input.drag.dx || this.input.drag.dy)) this.rig.drag(this.input.drag.dx * k, this.input.drag.dy * ky);
    // chuột (khi khóa con trỏ): xoay tự do; ngưng di chuột ~2 giây thì camera tự quay về sau xe
    if (!locked && (this.input.look.dx || this.input.look.dy)) this.rig.drag(this.input.look.dx * 0.6 * k, this.input.look.dy * 0.6 * ky);
    if (!locked && this.input.wheel) this.rig.zoom(this.input.wheel);
    if (locked) this.rig.manualTimer = 0; // vừa xoay trước lúc bắt chuyện → camera về ngay góc nói chuyện
    const mounted = this.mode === 'bike';
    const focus = mounted ? this.bike.mesh.position : this.walker.mesh.position;
    // trong hầm xe: camera kéo gần + hạ thấp để không xuyên trần (sàn lầu 1)
    const inG = inGarage(this.layout.placeById.home, focus.x, focus.z, 0);
    const talk = !mounted && this.storyTalkActor();
    if (talk) {
      // nói chuyện với người lạ: camera xích lại, nhìn chéo qua vai người chơi, giữa khung là 2 người (không khóa điều khiển, không dừng giờ)
      // cả nhóm đang nói chuyện: người nói + người đứng cùng (def.faceTo, vd chị Linh với người đàn ông) → canh giữa cả nhóm
      const mates = [talk.mesh.position];
      const mateId = talk.ac?.def?.faceTo || Object.entries(this.storyActors || {}).find(([, x]) => x !== talk.ac && x.def?.faceTo && this.speakerOf(x.def.faceTo)?.mesh === talk.mesh)?.[0];
      const mate = mateId && this.storyActors?.[mateId];
      if (mate && !mate.leaving && mate.mesh.parent) mates.push(mate.mesh.position);
      this.talkGroup = mates.length;
      const m = { x: mates.reduce((a, p) => a + p.x, 0) / mates.length, z: mates.reduce((a, p) => a + p.z, 0) / mates.length };
      const lx = m.x - focus.x, lz = m.z - focus.z, l = Math.hypot(lx, lz) || 1;
      const ux = lx / l, uz = lz / l;
      const side = Math.sin(this.rig.yaw) * -uz + Math.cos(this.rig.yaw) * ux >= 0 ? 1 : -1; // giữ bên camera đang đứng (không vòng qua)
      const want = Math.atan2(-ux * 0.8 - uz * side * 0.6, -uz * 0.8 + ux * side * 0.6);
      if (this.rig.manualTimer <= 0) this.rig.yaw = lerpAngle(this.rig.yaw, want, 1 - Math.exp(-2.5 * dt));
      this.talkFocus = (this.talkFocus || new THREE.Vector3()).set((focus.x + m.x) / 2, focus.y, (focus.z + m.z) / 2);
    }
    // đứng yên quá 0,6 giây → camera né cả cột điện / biển / cây (đang chạy thì chỉ né nhà, khỏi giật camera liên tục)
    const moving = mounted ? Math.abs(this.bike.speed) > 0.5 : this.walker.mesh.position.distanceTo(this.lastFocus || focus) > 0.01;
    this.lastFocus = (this.lastFocus || new THREE.Vector3()).copy(focus);
    this.stillT = moving ? 0 : (this.stillT || 0) + dt;
    // đang nói chuyện: chỉ né nhà (né cây / cột lúc này kéo camera sát quá, mất khung cả nhóm) · nhóm 3 người → lùi xa hơn
    this.rig.update(dt, talk ? this.talkFocus : focus, mounted && Math.abs(this.bike.speed) > 1 ? this.bike.heading : null, this.city.grid, inG ? GARAGE_CAM : talk ? (this.talkGroup > 1 ? TALK_CAM_GROUP : TALK_CAM) : null, !talk && this.stillT > 0.6);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2);
    }
  }

  clearTempNpcs() {
    for (const k of ['customerMesh', 'passengerMesh', 'passengerCargo']) {
      const m = this[k];
      if (m) m.parent && m.parent.remove(m);
      this[k] = null;
    }
    this.customerFor = null;
    this.passengerStyle = null;
  }
  // Khách xe ôm theo loại khách (world/npcStyles.js riderStyle): quần áo + đồ đi kèm + tư thế; ride = đang ngồi sau xe
  makePassenger(o, ride) {
    const rng = makeRng(o.id * 31), who = personOf(o.customer);
    const st = (this.passengerStyle ??= { s: riderStyle(o.rider, who, makeRng(o.id * 17)) }).s;
    const look = { ...randomPersonOpts(rng, who.gender, { sitting: true, casual: !st?.look }), ...(st?.look || {}), hat: 'helmet', hatColor: 0xffffff };
    // đặt xe dùm cho cụ già / em bé: tóc bạc, dáng nhỏ
    if (who.age === 'elder') look.hair = 0xc8c8c8;
    else if (look.hair === 0x8d8d8d && (who.age === 'kid' || who.age === 'young')) look.hair = 0x1b1b1b; // người trẻ không tóc bạc
    if (/^Bé\s/.test(o.customer)) look.scale = 0.72;
    const m = makePerson(look);
    st?.dress?.(m, ride);
    return m;
  }

  // Khách đứng chờ ở cửa / khách xe ôm ngồi sau xe
  updateTempNpcs() {
    const { om } = this;
    const o = om.order;
    if (!o) {
      if (this.customerMesh || this.passengerMesh) this.clearTempNpcs();
      return;
    }
    const pp = this.playerPos;
    const rng = makeRng(o.id * 31);
    if (o.kind === 'ride') {
      if (!this.passengerMesh) {
        this.passengerMesh = this.makePassenger(o, false);
        this.scene.add(this.passengerMesh);
      }
      let m = this.passengerMesh;
      const st = this.passengerStyle?.s;
      if (om.state === S.TO_PICKUP) {
        if (m.parent !== this.scene) this.scene.add(m);
        m.position.set(o.pickup.door.x, SW_H, o.pickup.door.z);
        m.rotation.y = Math.atan2(pp.x - m.position.x, pp.z - m.position.z);
        if (st?.wave !== false) m.userData.parts.armR.rotation.x = Math.abs(Math.sin(performance.now() / 300)) * -2.5; // vẫy tay
      } else if (m.parent !== this.bike.mesh) {
        // lên xe: dựng lại khách ở dáng ngồi (bỏ đồ cầm tay: vali, chai bia, cặp…); vali đặt lên xe
        if (st) {
          m.parent?.remove(m);
          m = this.passengerMesh = this.makePassenger(o, true);
          if (st.suitcase && !this.passengerCargo) this.passengerCargo = suitcaseOnBike(this.bike.mesh, this.gs.vehicleSpec.model, st.suitcase);
        }
        this.bike.mesh.add(m);
        setSitting(m, true);
        // khách ôm hờ eo người lái: tay đưa ra trước vừa phải, gập khuỷu
        for (const s of ['L', 'R']) {
          m.userData.parts['arm' + s].rotation.x = -0.55;
          m.userData.parts['elbow' + s].rotation.x = -0.9;
        }
        m.position.set(0, sitY(m.scale.x, 1.02), -0.62);
        m.rotation.set(0, 0, 0);
        this.bike.mesh.userData.bagMesh.visible = false;
      }
      // tư thế riêng (khách say lắc lư, khách vội xem đồng hồ…): tính lại mỗi khung hình
      if (m.userData.parts.pose) {
        m.userData.parts.body.position.y = 0;
        applyPose(m.userData.parts);
      }
      return;
    }
    if ([S.DELIVERING, S.AT_DROPOFF, S.NO_ANSWER, S.STAIRS].includes(om.state) && o.revealed) {
      const key = `${o.id}:${o.dropoff.door.x}`;
      const near = dist2(pp, o.dropoff.door) < 45;
      const hideCustomer = o.flags.noAnswer && !o.noAnswerResolved; // khách vắng nhà
      if (near && !hideCustomer && this.customerFor !== key && !o.dropoff.apartment) {
        this.clearTempNpcs();
        const m = makePerson(randomPersonOpts(rng, personOf(o.customer).gender, { casual: true }));
        m.position.set(o.dropoff.door.x, SW_H, o.dropoff.door.z);
        this.scene.add(m);
        this.customerMesh = m;
        this.customerFor = key;
      }
      if (this.customerMesh) this.customerMesh.rotation.y = Math.atan2(pp.x - this.customerMesh.position.x, pp.z - this.customerMesh.position.z);
    }
  }

  // Phím I: mở điện thoại vào app Túi đồ (đang mở đúng app đó thì cất máy)
  // ======================== BIỂN TRẠM XE BUÝT ========================
  // Tới gần trạm (≤ 25 m): biển "🚏 Trạm xe buýt" nổi trên trạm · đứng trong tầm bấm E (đi bộ, 3 m): biển xanh
  // "Bấm E · Đi xe buýt" + vòng xanh dưới chân · đang ngồi xe: "Xuống xe để đi xe buýt" (tầm như interactions.js)
  updateBusSigns() {
    const stops = this.bus?.stops || [];
    if (!stops.length) return;
    if (!this.busSigns) {
      const tex = (k, bg) => makeLabelTexture(fmt(k), bg);
      this.busSignTex = { near: tex('busSign.near'), press: tex('busSign.press', 'rgba(0,140,60,0.92)'), bike: tex('busSign.bike', 'rgba(160,105,20,0.92)') };
      this.busSigns = stops.map((st) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.busSignTex.near, depthWrite: false, transparent: true }));
        s.scale.set(3.6, 0.68, 1);
        s.position.set(st.wait.x, 3.2, st.wait.z);
        s.visible = false;
        this.scene.add(s);
        return s;
      });
      this.busRing = makeZoneRing(0x2ecc71);
      this.busRing.visible = false;
      this.scene.add(this.busRing);
    }
    const p = this.playerPos, foot = this.mode === 'foot';
    const eStop = this.prompts?.find((x) => x.key === 'E')?.busStop; // phím E lúc này đúng là "đi xe buýt" ở trạm nào
    let ring = null;
    stops.forEach((st, i) => {
      const s = this.busSigns[i], d = Math.hypot(st.wait.x - p.x, st.wait.z - p.z);
      s.visible = this.state === 'play' && !this.ferryRide && d < 25;
      if (!s.visible) return;
      const near = eStop === st.id;
      const t = near ? (foot ? this.busSignTex.press : this.busSignTex.bike) : this.busSignTex.near;
      if (s.material.map !== t) {
        s.material.map = t;
        s.material.needsUpdate = true;
      }
      if (near && foot) ring = st.wait;
      s.material.opacity = this.labelFade(s.position, 5, 4); // camera sát / biển chắn trước người chơi → mờ
    });
    this.busRing.visible = !!ring;
    if (ring) {
      this.busRing.position.set(ring.x, 0.2, ring.z);
      this.busRing.scale.setScalar(3); // đúng tầm bấm E
    }
  }

  // ======================== BIỂN BÃI GIỮ XE ========================
  // Tới gần bãi giữ xe (≤ 30 m): biển "🅿️ Bãi giữ xe · 5k" nổi trên cổng · trong tầm bấm E: biển xanh "Bấm E · Xem bảng giữ xe"
  updateParkSigns() {
    if (!this.parkSigns) {
      const tex = (k, bg) => makeLabelTexture(fmt(k, { fee: PARKING.fee ?? 5 }), bg);
      this.parkSignTex = { near: tex('parkSign.near', 'rgba(31,97,141,0.92)'), press: tex('parkSign.press', 'rgba(0,140,60,0.92)') };
      this.parkSigns = this.layout.places.filter((pl) => pl.kind === 'scenery' && pl.door && lookOf(pl) === 'parkingLot').map((pl) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.parkSignTex.near, depthWrite: false, transparent: true }));
        s.scale.set(3.6, 0.68, 1);
        s.position.set(pl.door.x, 3.6, pl.door.z);
        s.visible = false;
        this.scene.add(s);
        return { s, pl };
      });
    }
    const p = this.playerPos;
    const eLot = this.prompts?.find((x) => x.key === 'E')?.parkLot; // phím E lúc này đúng là "xem bảng" ở bãi nào
    for (const { s, pl } of this.parkSigns) {
      s.visible = this.state === 'play' && !this.ferryRide && Math.hypot(pl.door.x - p.x, pl.door.z - p.z) < 30;
      if (!s.visible) continue;
      const t = eLot === pl.id ? this.parkSignTex.press : this.parkSignTex.near;
      if (s.material.map !== t) {
        s.material.map = t;
        s.material.needsUpdate = true;
      }
    }
  }

  // Đang mở popup nào đó (Esc dùng để đóng popup, không tạm dừng game)
  popupOpen() {
    return !!(this.modal?.open || this.phone?.open || this.chatBox?.typing || this.cheatOpen);
  }
  // Lần Esc vừa bấm (trong 0,5 giây) là để đóng popup
  escForPopup() {
    return performance.now() - (this.escPopupAt || 0) < 500;
  }

  // Tab / bấm hình điện thoại cạnh bản đồ: bật / cất máy. Có đơn đang mời mà máy đang ở màn hình chính → vào thẳng app nhận đơn
  togglePhone() {
    if (this.state !== 'play' || this.paused || this.modal.open || this.screens.open) return;
    const opening = !this.phone.open;
    if (opening && this.om.state === S.OFFERED) this.phone.openApp('goship');
    this.phone.toggle();
    sound(this.phone.open ? 'phone.open' : 'phone.close');
  }

  toggleBag() {
    if (this.phone.open && this.phone.app === 'bag') return this.phone.toggle(false);
    this.phone.openApp('bag');
    if (!this.phone.open) this.phone.toggle(true);
  }

  // Ngoại hình shipper: trang phục đang mặc (phụ kiện: áo mưa / áo khoác người chơi tự gắn trong túi đồ)
  applyLook() {
    const look = { ...outfitLook(this.gs.wornGoods()), ...profileLook(this.gs.profile) }; // dáng, kiểu tóc, màu tóc, màu da theo hồ sơ
    const key = JSON.stringify(look);
    if (key === this.lookKey) return;
    this.lookKey = key;
    this.walker.setLook(look);
  }

  // Xe để dành dựng trong hầm nhà trọ (mọi xe đang có trừ xe đang dùng) — chỉ dựng lại khi danh sách đổi
  syncGarage() {
    const home = this.layout.placeById.home, slots = parkSlots(home);
    const ids = this.gs.parkedVehicles.slice(0, slots.length), key = ids.join(',');
    if (key === this.garageKey) return;
    this.garageKey = key;
    if (this.garageFleet) this.scene.remove(this.garageFleet);
    this.garageFleet = new THREE.Group();
    ids.forEach((id, i) => {
      const v = VEHICLES[id], m = makeBike(v.color, v.model || 'underbone'), s = slots[i];
      if (m.userData.bagMesh) m.userData.bagMesh.visible = false; // túi đồ đi theo xe đang dùng
      m.position.set(s.x, 0, s.z);
      m.rotation.y = s.heading;
      this.garageFleet.add(m);
    });
    this.scene.add(this.garageFleet);
  }

  // Tiếng theo chuyển động: bước chân / đạp xe theo quãng đi, phanh gấp, xe vừa cạn xăng / pin
  moveSounds() {
    const gs = this.gs, p = this.playerPos, mounted = this.mode === 'bike';
    const last = this.soundPos || p, d = Math.hypot(p.x - last.x, p.z - last.z);
    this.soundPos = { x: p.x, z: p.z };
    if (d < 3) { // nhảy chỗ (ngủ, đi xe buýt, phà…) thì không tính
      this.strideM = (this.strideM || 0) + d;
      const stride = mounted ? (gs.power === 'pedal' ? 2.2 : Infinity) : this.input.state.run ? 1.1 : 0.8;
      if (this.strideM >= stride) {
        this.strideM = 0;
        sound(mounted ? 'drive.pedal' : 'walk.step');
      }
    }
    const brake = mounted && this.input.state.brake && Math.abs(this.bike.speed) > 6;
    if (brake && !this.braking) sound('drive.brake');
    this.braking = brake;
    const has = gs.power === 'pedal' || gs.fuel > 0;
    if (mounted && this.hadFuel && !has) sound('drive.noFuel');
    this.hadFuel = has;
    // hướng dẫn sang bước mới (chỗ sáng đổi chỗ)
    const tut = this.spotlight.step;
    if (tut && tut !== this.lastTut) sound('ui.tutorial');
    this.lastTut = tut;
  }

  updateVisuals(dt) {
    const { gs, om, hz } = this;
    const now = this.clockMin;
    this.syncGarage();
    this.moveSounds();
    this.chatBox.update();
    this.bubbles.update(dt);
    this.pedChatter(dt);
    this.updateBusSigns();
    this.updateParkSigns();
    this.city.parked?.update(this.playerPos.x, this.playerPos.z); // xe máy đậu: hiện các ô gần người chơi
    this.stallPeople?.update(dt, this.playerPos.x, this.playerPos.z, this.walker.seat); // khách ngồi quán cóc quanh người chơi
    const rain = hz.rainAt(now);
    const pp = this.playerPos;
    this.applyLook();
    const { night, wet } = this.sky.update(dt, tod(now), rain, pp, this.camera);
    this.nightLevel = night; // bản đồ tròn tối lại ban đêm
    this.city.update?.(dt, this.traffic.loopCars); // barie sân bay nâng khi ô tô tới
    // xe buýt chạy theo lịch; bị chắn trước đầu thì đứng chờ, chắn lâu thì bóp còi
    for (const e of this.traffic.updateBuses(now, pp.x, pp.z, dt)) {
      if (e.type === 'busHonk') { sound('city.honk'); this.toastOnce('busHonk', fmt('toast.busHonk'), 'warn', 8); }
      if (e.type === 'driverYell') this.driverYell(e);
    }
    this.city.setNight(night);
    this.city.setWet(wet);
    this.city.setFlood(hz.floodState(now)); // nước trên các đoạn đường đang ngập
    this.traffic.setFlood(hz.floodedSegs(now).filter((s) => floodBand(s.depth) >= 2).map((s) => s.id)); // xe NPC né đoạn ngập sâu
    this.bike.setNight(night, this.mode === 'bike');
    this.npcs.minh.visible = gs.flags.wallet === 4;
    // tiệm chưa tới chương mở cửa (places.json → openChapter): NPC không đứng ở cửa (vd chị Linh ở Tiệm Trà A Di Đà tới hết chương 2)
    const prog = gs.progress;
    for (const [id, n] of Object.entries(this.npcs)) { const pl = this.layout.placeById[id]; if (pl) n.visible = unlocked(pl, prog); }
    // mở đầu: chấm than nhún trên đầu Cô Hai tới khi nói chuyện; xe đạp chỉ hiện khi Cô Hai đã cho
    // dấu trên đầu NPC: cốt truyện → theo bước (story.json → mark), không theo cốt truyện → "!" ở Cô Hai lúc mở đầu
    const sst = gs.story?.ch ? stepOf(gs.story) : null, prev = sst && !gs.story.fired ? chapterOf(gs.story).steps[gs.story.step - 1] : null;
    const mk = gs.story?.ch ? (prev ? prev.mark : sst?.mark) : gs.flags.story === 0 ? { place: 'home', icon: '!' } : null;
    // một hoặc nhiều dấu (story.json → mark: { … } hoặc [{ … }, …]): dấu đầu dùng questMark, các dấu sau dùng thêm sprite
    const marks = [].concat(mk || []);
    this.extraMarks ||= [];
    while (this.extraMarks.length < marks.length - 1) this.extraMarks.push(new THREE.Sprite(new THREE.SpriteMaterial({ map: this.questTex['!'], depthWrite: false, transparent: true })));
    const talkingMesh = this.talk?.mesh || (this.storyTalkWith && this.speakerOf(this.storyTalkWith)?.mesh); // đang nói chuyện với người này → ẩn dấu
    [this.questMark, ...this.extraMarks].forEach((sprite, i) => {
      const k = marks[i];
      const host = k && (k.actor ? this.storyActors?.[k.actor]?.seated || this.storyActors?.[k.actor]?.mesh : this.npcs[k.place]);
      sprite.visible = !!host && talkingMesh !== host; // đang nói chuyện với chính người đó → tạm ẩn dấu
      if (!sprite.visible) return;
      if (sprite.parent !== host) host.add(sprite);
      sprite.scale.set(0.75, 0.75, 1);
      const tex = this.questTex[k.icon] || this.questTex['!'];
      if (sprite.material.map !== tex) { sprite.material.map = tex; sprite.material.needsUpdate = true; }
      // người lạ đang nói (bong bóng trên đầu) → nhấc dấu lên trên bong bóng cho khỏi bị che
      let y = 2.75;
      sprite.material.depthTest = !k.actor; // dấu của người lạ: luôn vẽ đè (đứng dưới mái che vẫn thấy)
      sprite.renderOrder = k.actor ? 10 : 0;
      const bub = this.bubbles.map.get(`story:${k.actor || `place:${k.place}`}`);
      if (bub && bub.el.style.display !== 'none') {
        const perPx = (2 * host.position.distanceTo(this.camera.position) * Math.tan((this.camera.fov * Math.PI) / 360)) / innerHeight; // mét / điểm ảnh ở chỗ người nói
        y = Math.max(y, 1.95 + (bub.el.offsetHeight + 4) * perPx + 0.3);
      }
      sprite.position.y = y + Math.abs(Math.sin(performance.now() / 260 + i)) * 0.28;
    });
    // vòng tròn tím quanh địa điểm (story.json → zone): vùng tìm kiếm, không có mũi tên
    const zn = gs.story?.ch && gs.story.fired && sst?.zone && this.layout.placeById[sst.zone.place];
    if (zn && !this.storyZone) { this.storyZone = makeZoneRing(); this.scene.add(this.storyZone); }
    if (this.storyZone) {
      this.storyZone.visible = !!zn;
      if (zn) {
        const r = sst.zone.r || Math.hypot(zn.x1 - zn.x0, zn.z1 - zn.z0) / 2 + 8;
        this.storyZone.position.set(zn.cx ?? zn.door.x, 0.3, zn.cz ?? zn.door.z);
        this.storyZone.scale.setScalar(r);
      }
    }
    this.bike.mesh.visible = true; // xe đạp dựng sẵn trong hầm từ đầu (leo lên được sau khi Cô Hai cho — bikeReady)
    // bảng tên NPC mờ dần khi camera sát lại (dưới ~6 m), nằm giữa camera và người chơi thì mờ hẳn — khỏi che màn hình
    for (const n of Object.values(this.npcs)) {
      const l = n.userData.label;
      const talking = this.bubbles.map.has(`story:place:${n.userData.placeId}`) || this.storyTalkWith === `place:${n.userData.placeId}` || this.talk?.mesh === n;
      if (l) l.material.opacity = talking ? 0 : this.labelFade(n.position, 3, 3); // đang nói chuyện với NPC này → ẩn bảng tên
    }
    const storyRider = Object.values(this.storyActors || {}).some((ac) => ac.seated); // người lạ ngồi sau (cốt truyện): túi giao hàng tạm ẩn
    if (!storyRider && !(this.om.order && this.om.order.kind === 'ride' && this.passengerMesh && this.passengerMesh.parent === this.bike.mesh)) this.bike.showBag(true);
    // xe đạp: chân đạp vòng theo tốc độ (đứng yên thì ngồi bình thường)
    if (this.mode === 'bike' && this.gs.power === 'pedal' && this.walker.mesh.userData.parts) {
      const v = Math.abs(this.bike.speed);
      this.pedalPhase = (this.pedalPhase || 0) + dt * v * 2.2;
      pedalPerson(this.walker.mesh, this.pedalPhase, Math.min(1, v / 1.5));
    }
    this.updateTempNpcs();

    // có biên bản phạt nguội mới → chấm đỏ + thông báo ở app CSGT
    if (this.fineSeen != null && gs.fines.length > this.fineSeen) {
      const f = gs.fines[gs.fines.length - 1];
      this.phone.notify('police', { title: fmt('csgt.newTitle'), text: fmt('csgt.newText', { k: f.amount }) });
    }
    this.fineSeen = gs.fines.length;
    // tới địa điểm đã chọn chỉ đường → bỏ chỉ đường
    const wp = this.waypointPlace();
    if (wp && dist2(pp, wp.door) < 5) {
      this.waypoint = null;
      this.hud.toast(fmt('toast.waypointArrived', { place: wp.name }), 'good', 3000);
    }
    // điểm đến
    const tgt = this.state === 'play' ? this.currentTarget() : null;
    const hasPos = tgt && tgt.x != null;
    this.beacon.visible = !!hasPos && !tgt.zone;
    this.zoneRing.visible = !!(tgt && tgt.zone);
    if (hasPos) {
      this.beacon.position.set(tgt.x, 0, tgt.z);
      // đứng gần thì cột sáng mờ đi để không che tầm nhìn
      this.beacon.userData.m.opacity = Math.max(0.04, Math.min(0.28, (dist2(pp, tgt) - 3) / 40));
      const c = new THREE.Color(tgt.color || '#f39c12');
      this.beacon.userData.m.color.copy(c);
      this.beacon.userData.ringM.color.copy(c);
      this.beacon.userData.ring.scale.setScalar(1 + 0.15 * Math.sin(performance.now() / 250));
    }
    if (tgt && tgt.zone) {
      this.zoneRing.position.set(tgt.zone.x, 0.25, tgt.zone.z);
      this.zoneRing.scale.setScalar(tgt.zone.r);
    }
    let goal = null;
    if (tgt) {
      goal = { text: tgt.text, sub: tgt.sub, color: tgt.color };
      if (hasPos) {
        const d = dist2(pp, tgt);
        const fx = -Math.sin(this.rig.yaw), fz = -Math.cos(this.rig.yaw);
        const tx = (tgt.x - pp.x) / (d || 1), tz = (tgt.z - pp.z) / (d || 1);
        goal.angle = Math.atan2(tx * -fz + tz * fx, tx * fx + tz * fz);
        goal.sub = fmt('goal.distance', { dist: fmtDist(this.goalRouteDist(pp, tgt, d)), hint: goal.sub || '' });
      }
    }

    const mounted = this.mode === 'bike';
    const o = om.order;
    const cargo = om.hasCargo ? o.items.map((it) => ({ icon: it.icon, name: it.name, status: it.statusText(), cond: it.condition })) : null;
    const left = o ? Math.round(o.allowedMin - (now - o.acceptedAt)) : 0;
    const objs = objectives(gs);
    const firstOpen = objs.find((x) => !x.done && !x.optional);
    // mục tiêu vừa xong (đã tick, hoặc biến khỏi danh sách vì xong — vd đổ xăng xong đổi sang "giao đơn đầu tiên") → tiếng
    const open = new Set(objs.filter((x) => !x.done).map((x) => x.id));
    if (this.objOpen && this.objDay === gs.day && [...this.objOpen].some((id) => !open.has(id))) sound('progress.objective');
    this.objOpen = open;
    this.objDay = gs.day;
    const amb = hz.ambient(now);
    const weather = (rain ? (rain.heavy ? '⛈️' : '🌦️') : hz.isHarshSun(now) ? '☀️🔥' : night > 0.5 ? '🌙' : '⛅') + (hz.floodedSegs(now).length ? '🌊' : '');
    // khu phố đang đứng (map.json → districts); đổi khu phố thì báo
    const dist = districtAtPoint(this.playerPos.x, this.playerPos.z);
    if (dist && dist.id !== this.lastDistrict) {
      if (this.lastDistrict !== undefined) this.hud.toast(fmt('toast.enterDistrict', { name: dist.name }), 'info', 2500);
      this.lastDistrict = dist.id;
    }
    this.hud.update({
      time: fmtTime(now),
      day: gs.day,
      district: [dist?.name, fmt('hud.road', { road: tierLabel(this.roadTier || 'normal'), limit: this.speedLimitKmh() }), mounted && gs.noHelmet ? fmt('hud.noHelmet') : ''].filter(Boolean).join(' · '),
      weather: `${weather} ${amb}°C`,
      money: gs.money,
      rating: gs.brand ? gs.rating : null, // chưa vào hãng: chưa có điểm đánh giá
      phys: gs.phys,
      mental: gs.mental,
      fuel: gs.fuel,
      tank: gs.vehicleSpec.tank,
      power: gs.power,
      hp: gs.bikeHp,
      // bảng "Mục tiêu hôm nay": không lặp mục tiêu cốt truyện (đã ở dòng mục tiêu góc trái), không ghi mục trả tiền nhà (chủ game bỏ)
      objectives: objs.filter((x) => x.id !== 'story' && x.id !== 'rent').map((x) => ({ ...x, current: x === firstOpen })),
      goal,
      prompts: this.prompts || [],
      speedo: mounted
        ? fmt('hud.speed', { kmh: Math.round(Math.abs(this.bike.speed) * 3.6) }) + (Math.abs(this.bike.speed) > this.speedLimit() ? fmt('hud.overSpeed', { limit: this.speedLimitKmh() }) : '') + (this.inJam ? fmt('hud.inJam') : '') + (this.floodBandNow ? fmt('hud.flood', { kmh: Math.round(floodSpeedCap(this.floodHere()) * 3.6) }) : '') + (this.stalled ? fmt('hud.stalled') : '') + (gs.power !== 'pedal' && gs.fuel <= 0 ? fmt(gs.power === 'electric' ? 'hud.noBattery' : 'hud.noFuel') : '')
        : fmt('hud.walking'),
      cargo,
      timeLeft: left >= 0 ? fmt('hud.minutes', { min: left }) : fmt('hud.late', { min: -left }),
      vignette: Math.max(0, (25 - Math.min(gs.phys, gs.mental)) / 25) * 0.8,
      round: roundMapData(this, tgt, dt), // bản đồ tròn góc màn hình
    });
    if (this.phone.open || this.om.state === S.OFFERED) this.renderPhone(tgt);
    this.updatePhoneIcon();
    this.spotlight.update(this.modal.open ? this.packGuide() : this.tutorialStep());
  }

  // Hình điện thoại cạnh bản đồ: đơn đang mời (đổ chuông, lặp lại tiếng mỗi 3 giây) · tin chưa đọc (chấm đỏ) · yên
  updatePhoneIcon() {
    const gs = this.gs, om = this.om, ph = this.phone;
    const offer = om.state === S.OFFERED ? om.offer : null;
    if (offer && !ph.open && performance.now() - (this.ringAt || 0) > 3000) {
      this.ringAt = performance.now();
      sound('phone.offer');
    }
    const unread = gs.unreadMessages + (ph.unread.police || 0);
    // còn tin chưa đọc mà máy đang cất → hình điện thoại nhỏ rung lại mỗi ~4 giây (vừa cất máy thì rung ngay, chỉ rung hình, không kêu) tới khi đọc
    if (ph.open) this.msgBuzzAt = 0;
    else if (!offer && unread && performance.now() - (this.msgBuzzAt || 0) > 4000) {
      this.msgBuzzAt = performance.now();
      this.hud.buzzPhone();
    }
    let from = '';
    if (!offer && unread) {
      const th = gs.inbox.threads, ids = Object.keys(th).filter((id) => th[id].unread).sort((a, b) => (th[b].last ?? 0) - (th[a].last ?? 0));
      const id = ids[0];
      from = id ? (STORY.contacts[id] ? fmt(STORY.contacts[id].name) : th[id].name || id) : fmt('phone.appPolice');
    }
    this.hud.phoneIcon({
      hidden: ph.open,
      st: offer ? (offer.forced ? 'story' : 'offer') : unread ? 'msg' : 'idle',
      time: fmtTime(this.clockMin),
      unread,
      from,
      kind: offer?.kind,
      pay: offer ? '~' + fmtK(offer.estPay) : '',
      left: offer && !offer.forced ? om.offerTimeLeft / ORDER.offerTimeoutSec : null,
    });
  }

  mapData(tgt) {
    const gs = this.gs;
    const places = this.layout.places
      .filter((p) => !p.hidden || (p.id === 'taphoa' && (gs.flags.wallet >= 2 || gs.flags.wallet === -1)) || (p.id === 'gate' && gs.flags.wallet >= 3))
      .map((p) => (unlocked(p, gs.progress) ? p : { ...p, soon: true })); // chưa tới chương mở cửa → biểu tượng mờ
    const police = this.hz.activePolice(this.clockMin).filter((p) => this.knownPolice.has(p.id)).map((p) => ({ x: roadPos(p.node[0]), z: roadPos(p.node[1]) }));
    const pp = this.playerPos;
    return {
      player: { x: pp.x, z: pp.z, heading: this.mode === 'bike' ? this.bike.heading : this.walker.heading },
      bus: this.bus, // tuyến + trạm xe buýt
      planFor: this.mode === 'foot' && this.bikeAtPolice() ? (pl) => this.planText(pl) : null, // xe đang ở đồn: gợi ý đi xe buýt
      bike: this.mode === 'foot' && this.bikeReady() ? { x: this.bike.pos.x, z: this.bike.pos.z } : null,
      quest: this.gs.flags.story === 0 ? this.layout.placeById.home?.door : null, // ❗ chỗ Cô Hai trên bản đồ
      places,
      alleyBlocks: this.layout.alleyBlocks,
      target: tgt && tgt.x != null && !tgt.zone ? { x: tgt.x, z: tgt.z, color: tgt.color } : null,
      zone: tgt && tgt.zone,
      police,
      jams: this.hz.activeJams(this.clockMin),
      floods: this.hz.floodedSegs(this.clockMin), // đoạn đang ngập (tô xanh, đậm theo mực nước)
      raining: this.hz.isRaining(this.clockMin),
    };
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

  // ======================== APP TÍCH TẮC (chỉ để vui) ========================
  // Chuyện đang xảy ra trong game lúc này → tin nóng (sim/feed.js). Danh sách đổi mỗi giờ trong game.
  feedNow() {
    const now = this.clockMin, hz = this.hz, gs = this.gs;
    const key = `${gs.day}:${Math.floor(tod(now) / 60)}`;
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
    const feed = buildFeed({ facts, places: this.layout.places, seed: gs.day * 97 + Math.floor(tod(now) / 60) });
    this.feedCache = { key, feed };
    return feed;
  }
  // Chụp ảnh cho tin "photo" của app Tích Tắc: camera đặt bên kia đường nhìn vào mặt tiền địa điểm (hoặc nhìn dọc đoạn đường),
  // vẽ 1 khung vào canvas chính rồi cắt khung dọc 9:16, vẽ lại khung game ngay sau đó (không bị chớp). Trả về canvas 270×480.
  snapPhoto(post) {
    const at = post.media.at;
    if (!at) return null;
    let eye, look;
    if (at.placeId) {
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
