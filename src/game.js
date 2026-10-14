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
import { dayOf, dayStartAt, tod, isDark } from './sim/clock.js';
import { inHours } from './sim/hours.js';
import { CITY, buildLayout, segmentRect, roadPos, districtAtPoint, traitAt, routeDist, streetAt, segmentName, intersectionName, nodePos } from './sim/cityLayout.js';
import { buildFeed } from './sim/feed.js';
import { lightMap, lightColor, ticketChance, turnOf } from './sim/lights.js';
import { buildTrafficLights } from './world/trafficLights.js';
import { fmtDist } from './sim/nav.js';
import { makeRng } from './sim/rng.js';
import { GameState, START_VEHICLE } from './sim/GameState.js';
import { OrderManager, S, scamHotspot } from './sim/OrderManager.js';
import { HazardManager } from './sim/hazards.js';
import { depthAtPoint, floodBand, floodSpeedCap, floodNum, floodCancelOk, nearestSegId } from './sim/flood.js';
import { objectives } from './sim/objectives.js';
import { buildCity } from './world/city.js';
import { Bike, Walker, CameraRig } from './world/controllers.js';
import { Traffic } from './world/traffic.js';
import { buildFerries } from './world/ferry.js';
import { makeStallPeople } from './world/stallPeople.js';
import { BgTraffic } from './world/bgTraffic.js';
import { pushCircle } from './world/physics.js';
import { nextBoat, BOAT_DECK } from './sim/ferry.js';
import { Sky } from './world/sky.js';
import { makePerson, makeBeacon, makeZoneRing, setSitting, pedalPerson, randomPersonOpts, npcLook, sitY, makeBike, applyPose } from './world/models.js';
import { riderStyle, suitcaseOnBike } from './world/npcStyles.js';
import { personOf, pronouns, profileLook } from './sim/people.js';
import { makeLabelTexture, makeQuestTexture } from './world/textures.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import { Phone } from './ui/phone.js';
import { Modal } from './ui/modal.js';
import { Spotlight } from './ui/spotlight.js';
import { Screens } from './ui/screens.js';
import * as act from './interactions.js';
import { roundMapData } from './roundMap.js';
import { sound, setEngine, setRain, unlockAudio, setMuted, setVolumes, setMusic, cityAmbience } from './audio.js';
import { loadSettings, saveSettings, normSettings } from './settings.js';
import { fmt, pick, pickFor } from './content/index.js';
import { ChatChannel } from './sim/chat.js';
import { ChatBox } from './ui/chatBox.js';
import { Bubbles, headOf } from './ui/bubbles.js';
import { fmtK } from './sim/economy.js';

const SAVE_KEY = 'shipper-sim-save-v1';
const GARAGE_CAM = { dist: 3.2, pitch: 0.28 }; // camera khi đứng / chạy xe trong hầm xe phòng trọ
const SW_H = 0.15;
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
    this.questMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeQuestTexture(), depthWrite: false, transparent: true }));
    this.questMark.scale.set(0.75, 0.75, 1);
    this.questMark.visible = false;
    this.npcs.home?.add(this.questMark);

    // ---- giao diện ----
    this.input = new Input(canvas);
    // Esc thả con trỏ → tạm dừng (trừ khi Esc đó dùng để đóng popup)
    this.input.onUnlock = () => { if (this.state === 'play' && !this.paused && !this.escForPopup() && !this.popupOpen()) this.pauseGame(); };
    this.hud = new Hud(uiRoot);
    this.modal = new Modal(uiRoot);
    this.spotlight = new Spotlight(uiRoot, () => { if (this.gs) this.gs.flags.tutSkip = true; }); // hướng dẫn người mới: làm tối xung quanh nút cần bấm
    // chat: log bên trái + bong bóng trên đầu (tin người chơi đi qua ChatChannel — sau này nối mạng để chơi nhiều người)
    this.chatCh = new ChatChannel({ me: { id: 'me', name: '' } });
    this.chatBox = new ChatBox(uiRoot, this.chatCh, (t) => this.sendChat(t));
    this.bubbles = new Bubbles(uiRoot, this.camera);
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
  // Lưu: tự động lúc 06:00 mỗi ngày, mỗi lần ngủ dậy; tự lưu ở nhà trọ (nói chuyện Cô Hai → 💾 Lưu game).
  // Mở lại → đứng trước phòng trọ đúng giờ đã lưu (xe trong hầm). Đơn đang chạy không lưu (đang chạy đơn thì không cho lưu tay).
  saveGame() {
    this.lastSave = { v: 2, clock: Math.floor(this.clockMin), carry: JSON.parse(JSON.stringify(this.gs.carryOver())), seed: this.seed };
    this.writeSave(this.lastSave);
  }

  startGame({ clock, carry, seed }) {
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
    this.chat = [];
    this.waypoint = null; // mã địa điểm người chơi bấm "Chỉ đường" trên bản đồ điện thoại
    this.findBike = false; // đang chỉ đường tới xe (app Xe → Định vị xe)
    this.knownPolice = new Set();
    this.policeChecked = new Set();
    this.cooldowns.clear();
    this.collapsing = false;
    this.stalled = false; // xe chết máy vì lội nước sâu (dắt ra chỗ cạn mới đề lại được)
    this.floodBandNow = 0;
    this.saveGame();

    this.placeAtHome(); // xe trong hầm xe phòng trọ (mở đầu: xe đạp đặt sẵn nhưng ẩn tới khi Cô Hai cho)
    if (this.gs.flags.story === 0) this.placeAtBusStation();
    this.bike.setSpec(this.gs.vehicleSpec);
    this.bike.setBag(this.gs.bagSpec);
    this.parkRng = makeRng(this.seed * 13 + day);
    this.lastDistrict = undefined; // lần đầu vào game không báo "Vào khu phố…"
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
    if (this.gs.flags.story === 0) this.arriveInCity(); // mở đầu: vừa xuống bến xe buýt
    else this.hud.toast(fmt(day === 1 && clock === TIME.dayStart ? 'toast.dayStart' : 'toast.welcomeBack', { day, rent: this.gs.rent, dueDay: this.gs.rentDueDay, time: fmtTime(clock) }), 'big', 7000);
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
  // Mở đầu: người chơi vừa xuống Bến Xe Buýt Trung Tâm (kiểu nhà "Bến xe buýt"), đứng trên vỉa hè nhìn ra đường
  placeAtBusStation() {
    const st = this.layout.places.find((p) => lookOf(p) === 'busStation' && p.door) || this.layout.placeById.home;
    const [nx, nz] = NORMAL[st.face] || [0, 1];
    this.walker.pos.set(st.door.x + nx * 0.8, 0, st.door.z + nz * 0.8);
    this.walker.heading = Math.atan2(nx, nz);
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
    this.modal.show({
      title: fmt('dlg.arriveTitle'),
      text: fmt('dlg.arriveText', { name: this.gs.profile.name, place: this.arrivedAt || '', home: home?.name || '', address: home?.address || '' }),
      choices: [{ label: fmt('dlg.arriveGo'), primary: true, onSelect: () => { cityAmbience(false); this.fadeFromBlack(); } }],
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

  // 06:00: sang ngày mới (không dừng game): số liệu theo ngày, thời tiết / CSGT mới, khai trương, tự lưu
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
    this.saveGame();
    this.hud.toast(fmt('toast.autoSaved'), 'info', 2500);
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
    this.lastT = t;
    if (this.state === 'play') this.update(dt);
    else {
      this.input.setLock(false); // màn hình tiêu đề / kết thúc: hiện con trỏ
      this.titleTick(dt);
    }
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
    inp.setLock(this.state === 'play' && !this.paused && !this.phone.open && !this.modal.open && !this.screens.open && !this.chatBox.typing && !this.cheatOpen);
    // Esc vừa thả con trỏ (trình duyệt) → onUnlock đã tạm dừng; bỏ qua phím Esc đó để không bật tắt 2 lần
    if (inp.was('Escape') && performance.now() - (inp.unlockedAt || 0) < 400) inp.pressed.delete('Escape');
    // đang hướng dẫn (màn hình tối, chỉ sáng nút cần bấm): chặn mọi phím trừ Esc (tạm dừng) và phím số của app Bản đồ
    const tut = !this.modal.open && !this.paused && this.spotlight.step;
    if (tut) {
      const mapKey = tut === 'map' ? `Digit${this.phone.visibleApps(this.gs).findIndex(([id]) => id === 'map') + 1}` : null;
      for (const c of [...inp.pressed]) if (c !== 'Escape' && c !== mapKey) inp.pressed.delete(c);
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
      if (inp.was('Tab')) {
        this.phone.toggle();
        sound(this.phone.open ? 'phone.open' : 'phone.close');
      }
      // Enter: mở ô chat (thả hết phím đang giữ để nhân vật đứng lại trong lúc gõ)
      if (inp.was('Enter') || inp.was('NumpadEnter')) {
        for (const k of Object.keys(inp.state)) inp.state[k] = false;
        if (!this.chatBox.typing) sound('chat.open');
        this.chatBox.open();
      }
      if (this.phone.open) this.phone.visibleApps(this.gs).forEach(([id], i) => inp.was(`Digit${i + 1}`) && this.phone.openApp(id)); // phím 1–9 mở app (thứ tự ở phone.json; chưa vào hãng thì không có app hãng)
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
        activity = this.walker.update(dt, inp.state, this.rig.yaw, { grid: this.city.grid, elev: this.city.elev, phys: gs.phys, speedMul: floodBand(water) >= 2 ? floodNum('walkMul') : 1 });
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
    if (inp.was('KeyF')) {
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
    this.saveGame();
    sound('progress.collapse');
    this.modal.show({
      speaker: fmt('npc.home.name'),
      portrait: '🏥',
      text: fmt(kind === 'faint' ? 'dlg.faint' : 'dlg.burnout', { hours: ENERGY.collapse.hours, fee: fmtK(r.fee), time: fmtTime(this.clockMin) }),
      choices: [{ label: fmt('dlg.ok'), primary: true }],
    });
  }

  // Ngủ ở phòng trọ: tắt app, tua nhanh, hồi thể lực / tinh thần, tự lưu khi dậy
  sleep(minutes) {
    this.om.goOffline();
    this.advance(minutes, 'sleep', { indoor: true, waiting: false, quiet: true });
    if (this.state !== 'play') return null;
    this.gs.wake(this.clockMin);
    this.saveGame();
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
    this.saveGame();
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
      // đơn mời có hạn giây: máy đang cất / ở màn hình chính → mở thẳng app GoShip;
      // đang xem app khác thì chỉ trượt thông báo xuống (bấm vào để mở; Y / N nhận / bỏ qua ở app nào cũng được)
      if (!this.phone.open || !this.phone.app) {
        this.phone.openApp('goship');
        this.phone.toggle(true);
      } else if (this.phone.app !== 'goship') this.phone.notify('goship', { title: fmt('phone.offerNoteTitle'), text: fmt('phone.offerNoteText'), ms: ORDER.offerTimeoutSec * 1000 });
      this.hud.toast(fmt('toast.offer'), 'good', 3500);
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

  addChat(from, text) {
    this.chat.push({ from, text, time: fmtTime(this.clockMin) });
    this.chatCh.local('phone', from, text, { time: fmtTime(this.clockMin) }); // tin điện thoại cũng ghi vào log bên trái
    sound('phone.message');
    this.phone.notify('chat', { title: from, text });
  }
  // Tin nhắn nhóm Hội shipper (thời tiết, kẹt xe, chốt CSGT, mẹo, khai trương): chỉ người đã vào hãng mới thấy
  groupChat(from, text) {
    if (this.gs?.brand) this.addChat(from, text);
  }
  // Vào nhóm (bắt đầu ngày khi đã ở hãng / vừa đăng ký hãng): dự báo thời tiết, quảng cáo đồ nghề, mẹo
  joinGroupChat() {
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
  onParkingEvent(ev) {
    const { gs } = this;
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
      act.blockTicket(this);
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
      if (!test(pl) || !pl.door || !unlocked(pl, this.gs.day)) continue;
      const d = routeDist(p, pl.door);
      if (d < bestD) [best, bestD] = [pl, d];
    }
    return best;
  }
  // Hướng dẫn người mới (chưa vào hãng): Tab mở điện thoại → app Bản đồ → nút "Văn phòng hãng" → chọn 1 hãng, Chỉ đường
  // → cất máy, đi theo mũi tên → bấm E ở văn phòng để đăng ký. Bước tính lại theo trạng thái lúc này (đóng máy giữa chừng thì quay lại bước 1).
  tutorialStep() {
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
    if (this.input.drag.dx || this.input.drag.dy) this.rig.drag(this.input.drag.dx * k, this.input.drag.dy * ky);
    // chuột (khi khóa con trỏ): xoay tự do; ngưng di chuột ~2 giây thì camera tự quay về sau xe
    if (this.input.look.dx || this.input.look.dy) this.rig.drag(this.input.look.dx * 0.6 * k, this.input.look.dy * 0.6 * ky);
    if (this.input.wheel) this.rig.zoom(this.input.wheel);
    const mounted = this.mode === 'bike';
    const focus = mounted ? this.bike.mesh.position : this.walker.mesh.position;
    // trong hầm xe: camera kéo gần + hạ thấp để không xuyên trần (sàn lầu 1)
    const inG = inGarage(this.layout.placeById.home, focus.x, focus.z, 0);
    this.rig.update(dt, focus, mounted && Math.abs(this.bike.speed) > 1 ? this.bike.heading : null, this.city.grid, inG ? GARAGE_CAM : null);
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
    // mở đầu: chấm than nhún trên đầu Cô Hai tới khi nói chuyện; xe đạp chỉ hiện khi Cô Hai đã cho
    this.questMark.visible = gs.flags.story === 0;
    if (this.questMark.visible) this.questMark.position.y = 2.75 + Math.abs(Math.sin(performance.now() / 260)) * 0.28;
    this.bike.mesh.visible = this.bikeReady();
    // bảng tên NPC mờ dần khi camera sát lại (dưới ~4 m), khỏi che màn hình
    const cp = this.camera.position;
    for (const n of Object.values(this.npcs)) {
      const l = n.userData.label;
      if (l) l.material.opacity = Math.max(0, Math.min(1, (Math.hypot(n.position.x - cp.x, n.position.z - cp.z) - 2.5) / 1.5));
    }
    if (!(this.om.order && this.om.order.kind === 'ride' && this.passengerMesh && this.passengerMesh.parent === this.bike.mesh)) this.bike.showBag(true);
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
        goal.sub = fmt('goal.distance', { km: (d * DIST.displayPerUnit / 1000).toFixed(2), hint: goal.sub || '' });
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
      objectives: objs.map((x) => ({ ...x, current: x === firstOpen })),
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
    this.spotlight.update(this.modal.open ? null : this.tutorialStep());
  }

  mapData(tgt) {
    const gs = this.gs;
    const places = this.layout.places
      .filter((p) => !p.hidden || (p.id === 'taphoa' && (gs.flags.wallet >= 2 || gs.flags.wallet === -1)) || (p.id === 'gate' && gs.flags.wallet >= 3))
      .map((p) => (unlocked(p, gs.day) ? p : { ...p, soon: true })); // chưa khai trương → biểu tượng mờ
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
      chat: this.chat,
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
      mapData: { ...this.mapData(tgt === undefined ? this.currentTarget() : tgt), route: this.navPath, ferries: this.ferries?.pairs, waypoint: this.waypoint ? { id: this.waypoint } : null },
    });
  }
}
