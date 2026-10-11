// =============================================================
// GAME — điều phối: vòng lặp, nối mô phỏng (src/sim) với thế giới 3D (src/world) và giao diện (src/ui)
// =============================================================
import * as THREE from 'three';
import { TIME, ECONOMY, ENERGY, HAZARD, DIST, VEHICLES, BAGS, NIGHT, PARKING, AIRPORT, RIDE_EVENTS } from './data/balance.js';
import { parkingRoll, parkingLotAt, nearestStation, towTarget, safeSpot } from './sim/parking.js';
import { garageSpots, inGarage } from './sim/garage.js';
import { airportAt, airportParkAt, airportNoStopAt, noStopStep } from './sim/airport.js';
import { roadSegAt, tierOf, tierLabel, speedLimitOf } from './sim/roads.js';
import { busHint, inService } from './sim/bus.js';
import { GOODS, outfitLook } from './data/goods.js';
import { lookOf } from './data/looks.js';
import { APP, RIDER_TYPES } from './data/apps.js';
import { ITEMS } from './data/items.js';
import { unlocked, openDayOf } from './sim/placeRules.js';
import { dayOf, dayStartAt, tod, isDark } from './sim/clock.js';
import { inHours } from './sim/hours.js';
import { buildLayout, segmentRect, roadPos, districtAtPoint, traitAt, routeDist, streetAt } from './sim/cityLayout.js';
import { fmtDist } from './sim/nav.js';
import { makeRng } from './sim/rng.js';
import { GameState, START_VEHICLE } from './sim/GameState.js';
import { OrderManager, S } from './sim/OrderManager.js';
import { HazardManager } from './sim/hazards.js';
import { objectives } from './sim/objectives.js';
import { buildCity } from './world/city.js';
import { Bike, Walker, CameraRig } from './world/controllers.js';
import { Traffic } from './world/traffic.js';
import { buildFerries } from './world/ferry.js';
import { nextBoat, BOAT_DECK } from './sim/ferry.js';
import { Sky } from './world/sky.js';
import { makePerson, makeBeacon, makeZoneRing, setSitting, pedalPerson, randomPersonOpts, npcLook, sitY } from './world/models.js';
import { guessGender } from './sim/people.js';
import { makeLabelTexture, makeQuestTexture } from './world/textures.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import { Phone } from './ui/phone.js';
import { Modal } from './ui/modal.js';
import { Screens } from './ui/screens.js';
import * as act from './interactions.js';
import { roundMapData } from './roundMap.js';
import { sfx, setEngine, setRain, unlockAudio, setMuted, setVolume } from './audio.js';
import { loadSettings, saveSettings, normSettings } from './settings.js';
import { fmt } from './content/index.js';
import { fmtK } from './sim/economy.js';

const SAVE_KEY = 'shipper-sim-save-v1';
const GARAGE_CAM = { dist: 3.2, pitch: 0.28 }; // camera khi đứng / chạy xe trong hầm xe phòng trọ
const SW_H = 0.15;
export const fmtTime = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const NORMAL = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inRect = (r, p) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;
// Túi giữ nhiệt rẻ nhất (mở khóa đơn lạnh) — dùng cho gợi ý mục tiêu
const cheapestInsulatedBag = () => Object.values(BAGS).filter((b) => b.insulation >= 0.5).sort((a, b) => a.price - b.price)[0];
// Trang bị chở khách rẻ nhất (mở khóa đơn xe ôm)
const cheapestSeatGoods = () => Object.values(GOODS).filter((x) => x.type === 'equipment' && x.effects?.passengerSeat).sort((a, b) => a.price - b.price)[0];

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
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
    this.input.onUnlock = () => { if (this.state === 'play' && !this.paused) this.pauseGame(); }; // Esc thả con trỏ → tạm dừng
    this.hud = new Hud(uiRoot);
    this.modal = new Modal(uiRoot);
    this.phone = new Phone(uiRoot, {
      refresh: () => this.renderPhone(),
      action: (a, ds) => act.phoneAction(this, a, ds),
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
    if (this.debug) {
      window.game = this;
      import('./devtools/autopilot.js').then((m) => (window.autopilot = m));
    }
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
    setVolume(st.volume);
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
  newGame(profile = null) {
    this.startGame({ clock: TIME.dayStart, carry: { ...(profile ? { profile } : {}), flags: { story: 0 } }, seed: Math.floor(Math.random() * 1e6) });
  }
  // Lưu tự động (06:00 mỗi ngày, mỗi lần ngủ dậy). Mở lại → đứng trước phòng trọ đúng giờ đã lưu.
  saveGame() {
    this.lastSave = { v: 2, clock: Math.floor(this.clockMin), carry: JSON.parse(JSON.stringify(this.gs.carryOver())), seed: this.seed };
    this.writeSave(this.lastSave);
  }

  startGame({ clock, carry, seed }) {
    this.screens.hide();
    this.modal.hide();
    this.seed = seed;
    const day = dayOf(clock);
    this.gs = new GameState({ day, carry });
    if (!carry || carry.awakeSince == null) this.gs.wake(clock); // bản lưu cũ chưa có giờ thức dậy
    this.hz = new HazardManager(makeRng(seed + day * 101), day);
    this.om = new OrderManager({ rng: makeRng(seed * 7 + day), layout: this.layout, gs: this.gs, isRaining: (m) => this.hz.isRaining(m) });
    this.om.on((e) => this.onOrderEvent(e));
    this.clockMin = clock;
    this.chat = [];
    this.waypoint = null; // mã địa điểm người chơi bấm "Chỉ đường" trên bản đồ điện thoại
    this.findBike = false; // đang chỉ đường tới xe (app Xe → Định vị xe)
    this.knownPolice = new Set();
    this.policeChecked = new Set();
    this.cooldowns.clear();
    this.collapsing = false;
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
  arriveInCity() {
    const home = this.layout.placeById.home;
    this.modal.show({
      title: fmt('dlg.arriveTitle'),
      text: fmt('dlg.arriveText', { name: this.gs.profile.name, place: this.arrivedAt || '', home: home?.name || '', address: home?.address || '' }),
      choices: [{ label: fmt('dlg.arriveGo'), primary: true }],
      dismissible: false,
    });
  }
  // Xe đang dựng trong hầm xe phòng trọ (không ngồi trên xe) — điều kiện để đi ngủ
  bikeInGarage() {
    return this.mode === 'foot' && inGarage(this.layout.placeById.home, this.bike.pos.x, this.bike.pos.z);
  }

  // 06:00: sang ngày mới (không dừng game): số liệu theo ngày, thời tiết / CSGT mới, khai trương, tự lưu
  beginDay(day) {
    this.gs.startDay(day);
    this.hz = new HazardManager(makeRng(this.seed + day * 101), day);
    this.knownPolice = new Set();
    this.policeChecked = new Set();
    this.groupChat(fmt('chat.group'), fmt('chat.forecast', { forecast: this.hz.forecastText() }));
    this.hud.toast(fmt('toast.newDay', { day, rent: this.gs.rent, dueDay: this.gs.rentDueDay, paid: this.gs.rentPaid ? fmt('toast.rentPaidNote') : '' }), 'big', 6000);
    this.announceOpenings(day);
    this.saveGame();
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
    sfx.lose();
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

  // ======================== VÒNG LẶP ========================
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
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
    inp.setLock(this.state === 'play' && !this.paused && !this.phone.open && !this.modal.open && !this.screens.open);
    // Esc vừa thả con trỏ (trình duyệt) → onUnlock đã tạm dừng; bỏ qua phím Esc đó để không bật tắt 2 lần
    if (inp.was('Escape') && performance.now() - (inp.unlockedAt || 0) < 400) inp.pressed.delete('Escape');
    if (inp.was('Escape') && !this.modal.open) {
      if (this.paused) this.resume();
      else if (this.phone.open) this.phone.back(); // trong app → về màn hình chính, rồi mới cất máy
      else this.pauseGame();
    }
    if (this.paused) return;
    const frozen = this.modal.open || this.screens.open;
    if (!frozen) {
      if (inp.was('Tab')) this.phone.toggle();
      if (this.phone.open) this.phone.visibleApps(this.gs).forEach(([id], i) => inp.was(`Digit${i + 1}`) && this.phone.openApp(id)); // phím 1–9 mở app (thứ tự ở phone.json; chưa vào hãng thì không có app hãng)
      if (inp.was('KeyM')) this.setMute(!this.muted);
      if (inp.was('KeyI')) this.toggleBag();
      if (inp.was('KeyY')) act.acceptOffer(this);
      if (inp.was('KeyN')) act.declineOffer(this);
      if (inp.was('KeyH') && this.mode === 'bike') sfx.horn();
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

    // ---- di chuyển ----
    let activity = 'idle';
    const env = this.itemEnv(speed);
    const emit = (type, mag, info) => this.onBikeEvent(type, mag, info, env);
    // chở khách mang vali: xe nặng, chạy chậm hơn (balance.json → rideEvents.luggageSpeedMul)
    const lug = om.hasCargo && RIDER_TYPES[om.order?.rider]?.luggage ? gs.vehicleSpec.maxSpeed * (RIDE_EVENTS.luggageSpeedMul ?? 0.8) : 0;
    const speedCap = [this.inJam ? HAZARD.jamSpeedCap : 0, lug].filter((v) => v > 0).reduce((a, b) => Math.min(a, b), Infinity);
    if (this.ferryRide) this.ferryTick(dt); // đang trên phà: người + xe đứng yên trên boong, phà chở qua sông
    else {
      const pedal = gs.power === 'pedal', ev = gs.power === 'electric';
      const moved = bike.update(dt, mounted ? inp.state : {}, { mounted, fuel: pedal ? 1 : gs.fuel, hp: gs.bikeHp, wet: !!rain, speedCap: Number.isFinite(speedCap) ? speedCap : 0, grid: this.city.grid, elev: this.city.elev, potholes: this.potholes, emit });
      if (mounted) {
        const km = (moved * DIST.displayPerUnit) / 1000;
        if (pedal) gs.addKm(km); // xe đạp: không xăng, không bảo dưỡng — chỉ cộng đồng hồ km
        else if (gs.fuel > 0) {
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
        activity = speed > 0.5 ? (pedal ? 'pedal' : gs.fuel <= 0 ? 'push' : 'drive') : 'idle';
        for (const h of this.traffic.collidePlayer(bike.pos, 0.75, bike.vel, true, bike.mesh.position.y)) this.onTrafficHit(h, env);
      } else {
        activity = this.walker.update(dt, inp.state, this.rig.yaw, { grid: this.city.grid, elev: this.city.elev, phys: gs.phys });
        this.traffic.collidePlayer(this.walker.pos, 0.35, { x: 0, y: 0 }, false, this.walker.mesh.position.y);
        this.walker.mesh.position.set(this.walker.pos.x, this.walker.mesh.position.y, this.walker.pos.z);
        // bước chân ra lề / vào nhà không tính, chỉ cập nhật vị trí
      }
    }

    // ---- thời gian & năng lượng ----
    const dMin = dt * TIME.gameMinPerRealSec * this.timeScale;
    this.clockMin += dMin;
    this.parkTick();
    this.fineTick();
    this.airportTick(mounted ? speed : 0);
    this.roadTick(mounted);
    gs.drain(activity, dMin, { harshSun: hz.isHarshSun(now), raining: !!rain, outdoor: true, inJam: this.inJam, waiting: false, now: this.clockMin });
    this.rollDay();

    // ---- giao thông ----
    const f = bike.forward();
    const pp = this.playerPos;
    const py = (mounted ? bike.mesh : this.walker.mesh).position.y;
    this.ferries.update(this.clockMin, performance.now() / 1000);
    for (const e of this.traffic.update(dt, { px: pp.x, pz: pp.z, py, onBike: mounted, speed, fx: f.x, fz: f.z })) {
      if (e.type === 'honk' && Math.random() < 0.5) {
        sfx.horn();
        this.toastOnce('honk', fmt('toast.honk'), 'info', 15);
      }
      if (e.type === 'dogDart') {
        sfx.bark();
        this.hud.toast(fmt('toast.dogDart'), 'warn', 2500);
      }
    }

    // ---- chướng ngại ----
    for (const e of hz.poll(this.clockMin)) this.onHazard(e);
    if (mounted) {
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
        sfx.click();
        p.run();
      }
    }
    if (inp.was('KeyF')) {
      const p = this.prompts.find((x) => x.key === 'F' && !x.disabled);
      if (p) p.run();
    }

    setEngine(mounted && gs.power !== 'pedal' && gs.fuel > 0, Math.min(1, speed / gs.vehicleSpec.maxSpeed) * (gs.power === 'electric' ? 0.35 : 1)); // xe điện chạy êm, xe đạp không tiếng máy
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
      sfx.bad();
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
    sfx.bad();
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
      this.airportTick();
      if (this.gs.checkEnd(now)) break;
      if (this.gs.collapsed && activity !== 'rest') break; // kiệt sức giữa chừng → xử lý ngay
      if (stopOnOffer && this.om.state === S.OFFERED) break; // điện thoại reo có đơn
    }
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
        sfx.bump();
        this.shake = Math.max(this.shake, mag * 0.25);
        if (info && info.what === 'pothole') this.toastOnce('pothole', fmt(liquid ? 'toast.potholeCargo' : 'toast.pothole'), 'warn', 4);
      }
    } else if (type === 'collision') {
      mag > 0.4 ? sfx.crash() : sfx.bump();
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

  onTrafficHit(h, env) {
    if (this.cooldowns.get('hit') > performance.now()) return;
    const speed = Math.abs(this.bike.speed);
    const gs = this.gs;
    let mag = 0, msg = '';
    if ((h.what === 'car' || h.what === 'moto') && h.into > 1.5) {
      mag = h.into / 5;
      gs.addEnergy(-mag * 6, -ENERGY.mental.carCrash);
      gs.bikeHp = Math.max(0, gs.bikeHp - mag * 10);
      msg = fmt(h.what === 'car' ? 'toast.hitCar' : 'toast.hitMoto');
      sfx.crash();
    } else if (h.what === 'ped' && speed > 2) {
      mag = speed / 8;
      gs.addEnergy(-2, -ENERGY.mental.pedHit);
      msg = fmt('toast.hitPed');
      sfx.crash();
    } else if (h.what === 'dog' && speed > 1.5) {
      mag = speed / 6;
      gs.addEnergy(-2, -ENERGY.mental.dogHit);
      msg = fmt('toast.hitDog');
      sfx.bark();
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
  }

  onOrderEvent(e) {
    if (e.type === 'offer') {
      sfx.ping();
      this.phone.openApp('goship'); // đơn mời có hạn giây → mở thẳng app GoShip
      this.phone.toggle(true);
      this.hud.toast(fmt('toast.offer'), 'good', 3500);
    } else if (e.type === 'offerExpired') this.hud.toast(fmt('toast.offerExpired'), 'info');
    else if (e.type === 'cancelled') {
      const r = this.gs.applyCancel(e, this.clockMin);
      this.clearTempNpcs();
      this.bike.showBag(true);
      this.hud.toast(fmt('toast.cancelled', { reason: e.reason }) + (e.comp ? fmt('toast.cancelComp', { k: e.comp }) : '') + (e.byDriver ? fmt('toast.cancelDriver', { stars: APP.account.cancelStars }) : ''), 'bad', 5000);
      if (r.locked) this.hud.toast(fmt('toast.accountLocked', { n: APP.account.cancelLimitPerDay, time: fmtTime(r.until) }), 'bad', 7000);
      sfx.bad();
    } else if (e.type === 'returning') this.hud.toast(fmt('toast.returning', { place: e.order.pickup.name }), 'warn', 5000);
    else if (e.type === 'rideEvent') act.rideEventDialog(this, e.event); // khách đổi điểm đến / khách lừa đảo
    else if (e.type === 'vomit') {
      sfx.bad();
      this.shake = Math.max(this.shake, 0.3);
      this.hud.toast(fmt('toast.vomit', { mental: e.mental, cost: e.cost }), 'bad', 4500);
    } else if (e.type === 'redirect') {
      this.clearTempNpcs();
      this.hud.toast(fmt('toast.redirect', { address: e.order.dropoff.address }), 'warn', 5000);
    } else if (e.type === 'revealed') this.hud.toast(fmt('toast.revealed', { address: e.order.dropoff.address }), 'good', 5000);
    else if (e.type === 'state') this.renderPhone();
  }

  addChat(from, text) {
    this.chat.push({ from, text, time: fmtTime(this.clockMin) });
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
    gs.parked = { since: this.clockMin, safe, ticketed: false, robbed: false, checked: Math.floor(this.clockMin) };
    if (!safe && !quiet) this.toastOnce('parkHint', fmt('toast.parkHint', { min: PARKING.graceMin }), 'info', 600);
    if (safe && !lot && !quiet) this.toastOnce('parkGarage', fmt('toast.parkGarage'), 'good', 60); // dựng xe trong hầm phòng trọ
  }
  // Gửi bảo vệ (chung cư…) → xe được trông tới khi lấy
  markParkedSafe() {
    if (this.gs.parked) this.gs.parked.safe = true;
  }
  // Mỗi phút xe đứng ngoài đường (người chơi đang đi bộ): xét rủi ro dán phạt / cẩu / trộm
  parkTick() {
    const p = this.gs.parked;
    if (!p || p.safe || this.mode !== 'foot' || !this.parkRng) return;
    const to = Math.floor(this.clockMin);
    for (let m = p.checked + 1; m <= to && this.gs.parked === p; m++) {
      p.checked = m;
      const canTow = !!towTarget(this.layout.places, this.bike.pos.x, this.bike.pos.z);
      const bx = this.bike.pos.x, bz = this.bike.pos.z;
      const ev = parkingRoll(this.parkRng, m, p, { canTow, hasCargo: this.om.hasCargo, towMul: traitAt(bx, bz, 'tow'), theftMul: traitAt(bx, bz, 'theft') });
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
    sfx.bad();
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
      sfx.whistle();
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
      sfx.whistle();
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
    if (!this.gs || this.gs.brand || (this.gs.flags.story ?? 2) < 2) return null; // chỉ sau khi đã leo lên xe đạp Cô Hai cho
    const wp = this.waypoint && this.layout.placeById[this.waypoint];
    if (wp?.kind === 'office') return this.phone.open ? 'close' : 'go';
    if (!this.phone.open) return 'phone';
    if (this.phone.app !== 'map') return 'map';
    const cm = this.phone.cityMap;
    return cm.type === 'office' || cm.sel?.kind === 'office' ? 'route' : 'office';
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
  currentTarget() {
    const { om, gs } = this;
    const o = om.order;
    if (gs.towed && this.mode === 'foot') {
      const lot = this.layout.placeById[gs.towed.placeId];
      const fee = gs.towed.fee + (lot?.kind === 'police' ? gs.finesTotal : 0); // ở đồn: đóng cả phạt nguội
      // xa thì gợi ý đi xe buýt (trạm gần mình → trạm gần nơi giữ xe, cùng tuyến)
      const pp = this.playerPos, far = lot && Math.hypot(lot.door.x - pp.x, lot.door.z - pp.z) > 200;
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
    const wp = this.waypoint && P[this.waypoint];
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
        const off = this.nearestPlace((p) => p.kind === 'office');
        return off ? { ...off.door, text: fmt('goal.brand'), sub: fmt('goal.brandHint', { place: off.name }), color: '#5dade2' } : { text: fmt('goal.brand'), sub: '' };
      }
      if (ob.id === 'fuel') {
        if (gs.power === 'electric') {
          const ch = this.nearestPlace((p) => p.kind === 'charger');
          if (ch) return { ...ch.door, text: fmt('goal.charge'), sub: fmt('goal.chargeHint'), color: '#5dade2' };
        } else if (gs.power === 'gas') return { ...P.gas.door, text: fmt('goal.fuel'), sub: fmt('goal.fuelHint'), color: '#5dade2' };
      }
      if (ob.id === 'online') return { text: fmt('goal.online'), sub: '' };
      const thermal = cheapestInsulatedBag();
      if (ob.id === 'thermal' && thermal && gs.money >= thermal.price && om.state !== S.OFFERED) return { ...P.gear.door, text: fmt('goal.thermal', { price: thermal.price }), sub: fmt('goal.thermalHint'), color: '#5dade2' };
      const seat = cheapestSeatGoods();
      if (ob.id === 'helmet' && seat && gs.money >= seat.price && gs.bagSpec.insulation >= 0.5 && om.state !== S.OFFERED) return { ...P.gear.door, text: fmt('goal.helmet', { price: seat.price }), sub: fmt('goal.helmetHint'), color: '#5dade2' };
      if (ob.id === 'wallet' && ob.target) return { ...P[ob.target].door, text: fmt('goal.wallet', { text: ob.text }), sub: fmt('goal.walletHint'), color: '#bb8fce' };
      if (ob.id === 'wallet') return { text: fmt('goal.wallet', { text: ob.text }), sub: fmt('goal.walletHint') };
      if (ob.id === 'rent' && gs.money >= gs.rent) return { ...P.home.door, text: fmt('goal.rent', { rent: gs.rent, day: gs.rentDueDay }), sub: fmt('goal.rentHint'), color: '#e74c3c' };
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
    for (const k of ['customerMesh', 'passengerMesh']) {
      const m = this[k];
      if (m) m.parent && m.parent.remove(m);
      this[k] = null;
    }
    this.customerFor = null;
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
        // đặt xe dùm cho cụ già / em bé: tóc bạc, dáng nhỏ
        const look = { ...randomPersonOpts(rng, guessGender(o.customer), { sitting: true }), hat: 'helmet', hatColor: 0xffffff };
        if (/^(Bà|Ông|Cụ)\s/.test(o.customer)) look.hair = 0xc8c8c8;
        if (/^Bé\s/.test(o.customer)) look.scale = 0.72;
        this.passengerMesh = makePerson(look);
        this.scene.add(this.passengerMesh);
      }
      const m = this.passengerMesh;
      if (om.state === S.TO_PICKUP) {
        if (m.parent !== this.scene) this.scene.add(m);
        m.position.set(o.pickup.door.x, SW_H, o.pickup.door.z);
        m.rotation.y = Math.atan2(pp.x - m.position.x, pp.z - m.position.z);
        m.userData.parts.armR.rotation.x = Math.abs(Math.sin(performance.now() / 300)) * -2.5; // vẫy tay
      } else if (m.parent !== this.bike.mesh) {
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
      return;
    }
    if ([S.DELIVERING, S.AT_DROPOFF, S.NO_ANSWER, S.STAIRS].includes(om.state) && o.revealed) {
      const key = `${o.id}:${o.dropoff.door.x}`;
      const near = dist2(pp, o.dropoff.door) < 45;
      const hideCustomer = o.flags.noAnswer && !o.noAnswerResolved; // khách vắng nhà
      if (near && !hideCustomer && this.customerFor !== key && !o.dropoff.apartment) {
        this.clearTempNpcs();
        const m = makePerson(randomPersonOpts(rng, guessGender(o.customer)));
        m.position.set(o.dropoff.door.x, SW_H, o.dropoff.door.z);
        this.scene.add(m);
        this.customerMesh = m;
        this.customerFor = key;
      }
      if (this.customerMesh) this.customerMesh.rotation.y = Math.atan2(pp.x - this.customerMesh.position.x, pp.z - this.customerMesh.position.z);
    }
  }

  // Phím I: mở điện thoại vào app Túi đồ (đang mở đúng app đó thì cất máy)
  toggleBag() {
    if (this.phone.open && this.phone.app === 'bag') return this.phone.toggle(false);
    this.phone.openApp('bag');
    if (!this.phone.open) this.phone.toggle(true);
  }

  // Ngoại hình shipper: trang phục đang mặc (phụ kiện: áo mưa / áo khoác người chơi tự gắn trong túi đồ)
  applyLook() {
    const look = { ...outfitLook(this.gs.wornGoods()), gender: this.gs.profile.gender }; // nữ: dáng nữ, tóc dài
    const key = JSON.stringify(look);
    if (key === this.lookKey) return;
    this.lookKey = key;
    this.walker.setLook(look);
  }

  updateVisuals(dt) {
    const { gs, om, hz } = this;
    const now = this.clockMin;
    const rain = hz.rainAt(now);
    const pp = this.playerPos;
    this.applyLook();
    const { night, wet } = this.sky.update(dt, tod(now), rain, pp, this.camera);
    this.nightLevel = night; // bản đồ tròn tối lại ban đêm
    this.city.update?.(dt, this.traffic.loopCars); // barie sân bay nâng khi ô tô tới
    this.traffic.updateBuses(now, pp.x, pp.z, dt); // xe buýt chạy theo lịch
    this.city.setNight(night);
    this.city.setWet(wet);
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
    const wp = this.waypoint && this.layout.placeById[this.waypoint];
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
    const amb = hz.ambient(now);
    const weather = rain ? (rain.heavy ? '⛈️' : '🌦️') : hz.isHarshSun(now) ? '☀️🔥' : night > 0.5 ? '🌙' : '⛅';
    // khu phố đang đứng (map.json → districts); đổi khu phố thì báo
    const dist = districtAtPoint(this.playerPos.x, this.playerPos.z);
    if (dist && dist.id !== this.lastDistrict) {
      if (this.lastDistrict !== undefined) this.hud.toast(fmt('toast.enterDistrict', { name: dist.name }), 'info', 2500);
      this.lastDistrict = dist.id;
    }
    this.hud.update({
      time: fmtTime(now),
      day: gs.day,
      district: [dist?.name, fmt('hud.road', { road: tierLabel(this.roadTier || 'normal'), limit: this.speedLimitKmh() })].filter(Boolean).join(' · '),
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
        ? fmt('hud.speed', { kmh: Math.round(Math.abs(this.bike.speed) * 3.6) }) + (Math.abs(this.bike.speed) > this.speedLimit() ? fmt('hud.overSpeed', { limit: this.speedLimitKmh() }) : '') + (this.inJam ? fmt('hud.inJam') : '') + (gs.power !== 'pedal' && gs.fuel <= 0 ? fmt(gs.power === 'electric' ? 'hud.noBattery' : 'hud.noFuel') : '')
        : fmt('hud.walking'),
      cargo,
      timeLeft: left >= 0 ? fmt('hud.minutes', { min: left }) : fmt('hud.late', { min: -left }),
      vignette: Math.max(0, (25 - Math.min(gs.phys, gs.mental)) / 25) * 0.8,
      round: roundMapData(this, tgt, dt), // bản đồ tròn góc màn hình
    });
    if (this.phone.open || this.om.state === S.OFFERED) this.renderPhone(tgt);
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
      bike: this.mode === 'foot' && this.bikeReady() ? { x: this.bike.pos.x, z: this.bike.pos.z } : null,
      quest: this.gs.flags.story === 0 ? this.layout.placeById.home?.door : null, // ❗ chỗ Cô Hai trên bản đồ
      places,
      alleyBlocks: this.layout.alleyBlocks,
      target: tgt && tgt.x != null && !tgt.zone ? { x: tgt.x, z: tgt.z, color: tgt.color } : null,
      zone: tgt && tgt.zone,
      police,
      jams: this.hz.activeJams(this.clockMin),
      raining: this.hz.isRaining(this.clockMin),
    };
  }

  renderPhone(tgt) {
    if (!this.gs) return;
    const gs = this.gs;
    const locked = [];
    if (gs.workBlock() === 'noUniform') locked.push(fmt('phone.lockUniform', { brand: gs.brandSpec.name }));
    if (gs.workBlock() === 'wrongVehicle') locked.push(fmt('phone.lockVehicle', { brand: gs.brandSpec.name, kind: fmt(`power.${gs.brandSpec.power}`) }));
    if (gs.bagSpec.insulation < 0.5) locked.push(fmt('phone.lockCold'));
    if (!gs.effect('passengerSeat')) locked.push(fmt('phone.lockRide'));
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
      garage: near(gar),
      fuelStop: near(stop),
      offices,
      now: this.clockMin,
      timeStr: fmtTime(this.clockMin),
      appClosed: !inHours(APP.hours, this.clockMin),
      state: this.om.state,
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
      checkpoints: this.hz.activePolice(this.clockMin).filter((p) => this.knownPolice.has(p.id)).map((p) => ({
        name: p.name, until: fmtTime(this.clockMin - this.hz.rel(this.clockMin) + p.end), dist: fmtDist(Math.hypot(roadPos(p.node[0]) - pp.x, roadPos(p.node[1]) - pp.z)),
      })),
      mapData: { ...this.mapData(tgt === undefined ? this.currentTarget() : tgt), route: this.navPath, ferries: this.ferries?.pairs, waypoint: this.waypoint ? { id: this.waypoint } : null },
    });
  }
}
