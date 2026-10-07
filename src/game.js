// =============================================================
// GAME — điều phối: vòng lặp, nối mô phỏng (src/sim) với thế giới 3D (src/world) và giao diện (src/ui)
// =============================================================
import * as THREE from 'three';
import { TIME, ECONOMY, ENERGY, HAZARD, DIST, VEHICLES, BAGS } from './data/balance.js';
import { GOODS, outfitLook } from './data/goods.js';
import { APP, RIDER_TYPES } from './data/apps.js';
import { ITEMS } from './data/items.js';
import { unlocked, openDayOf } from './sim/placeRules.js';
import { dayOf, dayStartAt, tod } from './sim/clock.js';
import { inHours } from './sim/hours.js';
import { buildLayout, segmentRect, roadPos } from './sim/cityLayout.js';
import { makeRng } from './sim/rng.js';
import { GameState } from './sim/GameState.js';
import { OrderManager, S } from './sim/OrderManager.js';
import { HazardManager } from './sim/hazards.js';
import { objectives } from './sim/objectives.js';
import { buildCity } from './world/city.js';
import { Bike, Walker, CameraRig } from './world/controllers.js';
import { Traffic } from './world/traffic.js';
import { Sky } from './world/sky.js';
import { makePerson, makeBeacon, makeZoneRing, setSitting, randomPersonOpts, npcLook } from './world/models.js';
import { guessGender } from './sim/people.js';
import { makeLabelTexture } from './world/textures.js';
import { Input } from './input.js';
import { Hud } from './ui/hud.js';
import { Phone } from './ui/phone.js';
import { Modal } from './ui/modal.js';
import { Screens } from './ui/screens.js';
import * as act from './interactions.js';
import { sfx, setEngine, setRain, unlockAudio, toggleMute } from './audio.js';
import { fmt } from './content/index.js';
import { fmtK } from './sim/economy.js';

const SAVE_KEY = 'shipper-sim-save-v1';
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
    this.bike = new Bike(this.scene, VEHICLES.cub);
    this.walker = new Walker(this.scene);
    this.beacon = makeBeacon();
    this.zoneRing = makeZoneRing();
    this.scene.add(this.beacon, this.zoneRing);
    this.npcs = this.spawnPlaceNpcs();

    // ---- giao diện ----
    this.input = new Input(canvas);
    this.hud = new Hud(uiRoot);
    this.modal = new Modal(uiRoot);
    this.phone = new Phone(uiRoot, {
      refresh: () => this.renderPhone(),
      action: (a, ds) => act.phoneAction(this, a, ds),
    });
    this.screens = new Screens(uiRoot);

    this.state = 'title';
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
      this.scene.add(m);
      out[id] = m;
      return m;
    };
    // quán trong hẻm: cửa sát mặt nhà (0,7 m) → NPC đứng lùi ít hơn để không lọt vào tường
    for (const p of this.layout.places) if (p.npc) add(p.id, p.npc, p.door, p.face, p.npc.name, p.inAlley ? 0.3 : 1.0);
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

  showTitle() {
    this.state = 'title';
    this.hud.show(false);
    this.phone.toggle(false);
    this.modal.hide();
    const save = this.normSave(this.loadSave());
    this.screens.title({
      save: save && { ...save, day: dayOf(save.clock), time: fmtTime(save.clock) },
      webgl2: this.webgl2,
      onNew: () => this.newGame(),
      onContinue: () => this.startGame(save),
    });
  }

  // Bản lưu: { v: 2, clock (phút tuyệt đối), carry, seed }. Bản cũ { day, carry, seed } → 06:00 của ngày đó.
  normSave(s) {
    if (!s) return null;
    if (s.v === 2 && Number.isFinite(s.clock)) return s;
    if (Number.isInteger(s.day)) return { v: 2, clock: dayStartAt(s.day), carry: s.carry || null, seed: s.seed ?? 1 };
    return null;
  }
  newGame() {
    this.startGame({ clock: TIME.dayStart, carry: null, seed: Math.floor(Math.random() * 1e6) });
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
    this.knownPolice = new Set();
    this.policeChecked = new Set();
    this.cooldowns.clear();
    this.collapsing = false;
    this.saveGame();

    this.placeAtHome();
    this.bike.setSpec(this.gs.vehicleSpec);
    this.bike.setBag(this.gs.bagSpec);
    this.lookKey = null; // dựng lại ngoại hình shipper theo đồ đang mặc
    this.bike.update(0.016, {}, { mounted: false, fuel: 1, hp: 100, wet: false, grid: this.city.grid, potholes: [], emit: () => {} });
    this.walker.update(0.016, {}, 0, { grid: this.city.grid, phys: 100 });
    this.rig.yaw = -0.75 * Math.PI; // camera đứng giữa đường phía tây-bắc, nhìn về nhà trọ và xe
    this.rig.init = false;
    this.clearTempNpcs();
    this.traffic.setPolice([]);
    this.traffic.setJams([]);

    this.addChat(fmt('chat.group'), fmt('chat.forecast', { forecast: this.hz.forecastText() }));
    this.addChat(fmt('chat.shopOwner'), fmt('chat.shopAd'));
    this.addChat(fmt('chat.admin'), fmt('chat.tips'));
    this.state = 'play';
    this.paused = false;
    this.hud.show(true);
    this.hud.toast(fmt(day === 1 && clock === TIME.dayStart ? 'toast.dayStart' : 'toast.welcomeBack', { day, rent: this.gs.rent, dueDay: this.gs.rentDueDay, time: fmtTime(clock) }), 'big', 7000);
    this.announceOpenings(day);
  }

  // đặt người chơi trước phòng trọ, xe đậu sát lề
  placeAtHome() {
    const home = this.layout.placeById.home;
    const [nx, nz] = NORMAL[home.face];
    if (this.mode === 'bike') this.walker.standUp(this.scene, this.bike);
    this.mode = 'foot';
    this.walker.pos.set(home.door.x + nx * 0.6, 0, home.door.z + nz * 0.6);
    this.walker.heading = Math.atan2(nx, nz);
    this.bike.pos.set(home.door.x + 1.8, 0, home.door.z + nz * 2.4);
    this.bike.heading = Math.PI / 2;
    this.bike.speed = 0;
    this.bike.vel.set(0, 0);
  }

  // 06:00: sang ngày mới (không dừng game): số liệu theo ngày, thời tiết / CSGT mới, khai trương, tự lưu
  beginDay(day) {
    this.gs.startDay(day);
    this.hz = new HazardManager(makeRng(this.seed + day * 101), day);
    this.knownPolice = new Set();
    this.policeChecked = new Set();
    this.addChat(fmt('chat.group'), fmt('chat.forecast', { forecast: this.hz.forecastText() }));
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
      this.addChat(fmt('chat.admin'), fmt('chat.grandOpening', { names: opening.join(', ') }));
      this.hud.toast(fmt('toast.grandOpening', { names: opening.join(', ') }), 'good', 7000);
    }
    if (newItems.length) this.addChat(fmt('chat.admin'), fmt('chat.newItems', { names: newItems.join(', ') }));
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
      onNew: () => this.newGame(),
      onTitle: () => this.showTitle(),
    });
  }

  pauseGame() {
    this.paused = true;
    setEngine(false, 0);
    this.screens.pause({
      muted: this.muted,
      onResume: () => this.resume(),
      onRestart: () => this.startGame(this.lastSave),
      onTitle: () => this.showTitle(),
      onMute: () => {
        this.muted = toggleMute();
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
    else this.titleCam(t);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  titleCam(t) {
    const a = t / 20000;
    this.camera.position.set(Math.cos(a) * 140, 70, Math.sin(a) * 140); // bay vòng quanh trung tâm (thành phố cũ)
    this.camera.lookAt(0, 0, 0);
    this.sky.update(0.016, 9 * 60, null, { x: 0, z: 0 }, this.camera);
    this.city.setNight(0);
  }

  update(dt) {
    const inp = this.input;
    if (inp.was('Escape') && !this.modal.open) {
      if (this.paused) this.resume();
      else if (this.phone.open) this.phone.toggle(false);
      else this.pauseGame();
    }
    if (this.paused) return;
    const frozen = this.modal.open || this.screens.open;
    if (!frozen) {
      if (inp.was('Tab')) this.phone.toggle();
      if (inp.was('KeyM')) this.muted = toggleMute();
      if (inp.was('KeyI')) act.openInventory(this);
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
    const moved = bike.update(dt, mounted ? inp.state : {}, { mounted, fuel: gs.fuel, hp: gs.bikeHp, wet: !!rain, speedCap: this.inJam ? HAZARD.jamSpeedCap : 0, grid: this.city.grid, potholes: this.potholes, emit });
    if (mounted) {
      if (gs.fuel > 0) {
        const liters = ((moved * DIST.displayPerUnit) / 1000) * (gs.vehicleSpec.fuelPer100km / 100) * Math.max(0.1, 1 + gs.effect('fuelUsePct') / 100);
        gs.fuel = Math.max(0, gs.fuel - liters);
        om.addFuel(liters);
        if (gs.fuel <= 0) this.toastOnce('nofuel', fmt('toast.noFuel'), 'bad', 30);
        else if (gs.fuel < 0.25) this.toastOnce('lowfuel', fmt('toast.lowFuel'), 'warn', 40);
      }
      activity = speed > 0.5 ? (gs.fuel <= 0 ? 'push' : 'drive') : 'idle';
      for (const h of this.traffic.collidePlayer(bike.pos, 0.75, bike.vel, true)) this.onTrafficHit(h, env);
    } else {
      activity = this.walker.update(dt, inp.state, this.rig.yaw, { grid: this.city.grid, phys: gs.phys });
      this.traffic.collidePlayer(this.walker.pos, 0.35, { x: 0, y: 0 }, false);
      this.walker.mesh.position.set(this.walker.pos.x, this.walker.mesh.position.y, this.walker.pos.z);
      // bước chân ra lề / vào nhà không tính, chỉ cập nhật vị trí
    }

    // ---- thời gian & năng lượng ----
    const dMin = dt * TIME.gameMinPerRealSec * this.timeScale;
    this.clockMin += dMin;
    gs.drain(activity, dMin, { harshSun: hz.isHarshSun(now), raining: !!rain, outdoor: true, inJam: this.inJam, waiting: false, now: this.clockMin });
    this.rollDay();

    // ---- giao thông ----
    const f = bike.forward();
    const pp = this.playerPos;
    for (const e of this.traffic.update(dt, { px: pp.x, pz: pp.z, onBike: mounted, speed, fx: f.x, fz: f.z })) {
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

    setEngine(mounted && gs.fuel > 0, Math.min(1, speed / gs.vehicleSpec.maxSpeed));
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

  // Cho thời gian trôi nhanh (chờ quán, leo cầu thang, ngủ…), tính đủ hao mòn & món hàng
  advance(min, activity = 'idle', { indoor = false, waiting = true, quiet = false } = {}) {
    const n = Math.max(1, Math.round(min));
    for (let i = 0; i < n; i++) {
      this.clockMin += 1;
      const now = this.clockMin;
      this.rollDay();
      this.gs.drain(activity, 1, { harshSun: this.hz.isHarshSun(now), raining: this.hz.isRaining(now), outdoor: !indoor, inJam: false, waiting, now });
      this.om.tickItems(this.itemEnv(0, indoor), 1);
      this.om.update(1, 0, now, this.playerPos);
      for (const e of this.hz.poll(now)) this.onHazard(e);
      if (this.gs.checkEnd(now)) break;
      if (this.gs.collapsed && activity !== 'rest') break; // kiệt sức giữa chừng → xử lý ngay
    }
    if (!quiet) this.hud.toast(fmt('toast.timeSkip', { min: n, time: fmtTime(this.clockMin) }), 'info', 2200);
    this.checkEnd();
  }

  // ======================== SỰ KIỆN ========================
  onBikeEvent(type, mag, info, env) {
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
      this.addChat(fmt('chat.group'), fmt('chat.rain', { time: t }));
    } else if (e.type === 'rainEnd') this.hud.toast(fmt('toast.rainEnd'), 'info');
    else if (e.type === 'policeStart') {
      if (e.police.reported) {
        this.knownPolice.add(e.police.id);
        this.addChat(fmt('chat.tuan'), fmt('chat.police', { place: e.police.name }));
      }
    } else if (e.type === 'policeEnd') this.knownPolice.delete(e.police.id);
    else if (e.type === 'jamStart') {
      this.addChat(fmt('chat.group'), fmt('chat.jam', { roads: e.names.join(', ') }));
      this.hud.toast(fmt('toast.jam', { roads: e.names.join(', ') }), 'warn');
    } else if (e.type === 'jamEnd') this.addChat(fmt('chat.group'), fmt('chat.jamEnd'));
  }

  onOrderEvent(e) {
    if (e.type === 'offer') {
      sfx.ping();
      this.phone.notify('order');
      this.phone.tab = 'order';
      this.phone.toggle(true);
      this.hud.toast(fmt('toast.offer'), 'good', 3500);
    } else if (e.type === 'offerExpired') this.hud.toast(fmt('toast.offerExpired'), 'info');
    else if (e.type === 'cancelled') {
      const r = this.gs.applyCancel(e, this.clockMin);
      this.clearTempNpcs();
      this.bike.mesh.userData.bagMesh.visible = true;
      this.hud.toast(fmt('toast.cancelled', { reason: e.reason }) + (e.comp ? fmt('toast.cancelComp', { k: e.comp }) : '') + (e.byDriver ? fmt('toast.cancelDriver', { stars: APP.account.cancelStars }) : ''), 'bad', 5000);
      if (r.locked) this.hud.toast(fmt('toast.accountLocked', { n: APP.account.cancelLimitPerDay, time: fmtTime(r.until) }), 'bad', 7000);
      sfx.bad();
    } else if (e.type === 'returning') this.hud.toast(fmt('toast.returning', { place: e.order.pickup.name }), 'warn', 5000);
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
    this.phone.notify('chat');
  }

  toastOnce(key, html, kind, cdSec) {
    const now = performance.now();
    if ((this.cooldowns.get(key) || 0) > now) return;
    this.cooldowns.set(key, now + cdSec * 1000);
    this.hud.toast(html, kind, 3500);
  }

  // ======================== MỤC TIÊU / CHỈ ĐƯỜNG ========================
  currentTarget() {
    const { om, gs } = this;
    const o = om.order;
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
    // buồn ngủ / app nghỉ ban đêm → nhắc về phòng trọ ngủ (ưu tiên hơn mua đồ)
    const tired = gs.tiredLevel(this.clockMin);
    if (tired && om.state !== S.OFFERED) return { ...P.home.door, text: fmt(tired > 1 ? 'goal.veryTired' : 'goal.tired', { h: Math.floor(gs.awakeHours(this.clockMin)) }), sub: fmt('goal.sleepHint'), color: '#8e7cc3' };
    if (!inHours(APP.hours, this.clockMin) && om.state !== S.OFFERED) return { ...P.home.door, text: fmt('goal.appClosed'), sub: fmt('goal.sleepHint'), color: '#8e7cc3' };
    for (const ob of objectives(gs)) {
      if (ob.done) continue;
      if (ob.id === 'mount') return { x: this.bike.pos.x, z: this.bike.pos.z, text: fmt('goal.mount'), sub: fmt('goal.mountHint'), color: '#5dade2' };
      if (ob.id === 'fuel') return { ...P.gas.door, text: fmt('goal.fuel'), sub: fmt('goal.fuelHint'), color: '#5dade2' };
      if (ob.id === 'online') return { text: fmt('goal.online'), sub: '' };
      const thermal = cheapestInsulatedBag();
      if (ob.id === 'thermal' && thermal && gs.money >= thermal.price && om.state !== S.OFFERED) return { ...P.gear.door, text: fmt('goal.thermal', { price: thermal.price }), sub: fmt('goal.thermalHint'), color: '#5dade2' };
      const seat = cheapestSeatGoods();
      if (ob.id === 'helmet' && seat && gs.money >= seat.price && gs.bagSpec.insulation >= 0.5 && om.state !== S.OFFERED) return { ...P.gear.door, text: fmt('goal.helmet', { price: seat.price }), sub: fmt('goal.helmetHint'), color: '#5dade2' };
      if (ob.id === 'wallet' && ob.target) return { ...P[ob.target].door, text: fmt('goal.wallet', { text: ob.text }), sub: fmt('goal.walletHint'), color: '#bb8fce' };
      if (ob.id === 'wallet') return { text: fmt('goal.wallet', { text: ob.text }), sub: fmt('goal.walletHint') };
      if (ob.id === 'rent' && gs.money >= gs.rent) return { ...P.home.door, text: fmt('goal.rent', { rent: gs.rent, day: gs.rentDueDay }), sub: fmt('goal.rentHint'), color: '#e74c3c' };
    }
    if (om.state === S.OFFLINE) return { text: fmt('goal.online'), sub: '' };
    if (!gs.rentPaid && gs.money < gs.rent) return { text: fmt('goal.waiting', { k: Math.ceil(gs.rent - gs.money), day: gs.rentDueDay }), sub: fmt('goal.waitingHint') };
    return null;
  }

  // ======================== HIỂN THỊ ========================
  updateCamera(dt) {
    if (this.input.drag.dx || this.input.drag.dy) this.rig.drag(this.input.drag.dx, this.input.drag.dy);
    if (this.input.wheel) this.rig.zoom(this.input.wheel);
    const mounted = this.mode === 'bike';
    const focus = mounted ? this.bike.mesh.position : this.walker.mesh.position;
    this.rig.update(dt, focus, mounted && Math.abs(this.bike.speed) > 1 ? this.bike.heading : null, this.city.grid);
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
        m.userData.parts.armR.rotation.x = -1;
        m.position.set(0, 0.32, -0.62);
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

  // Ngoại hình shipper: trang phục đang mặc + áo mưa khi mưa / áo khoác khi nắng gắt (nếu có)
  applyLook() {
    const { gs, hz } = this;
    const now = this.clockMin;
    const overlay = hz.isRaining(now) && gs.effect('rainProtect') ? 'raincoat' : hz.isHarshSun(now) && gs.effect('sunProtect') ? 'jacket' : null;
    const look = { ...outfitLook(gs.wornGoods()), overlay };
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
    this.city.setNight(night);
    this.city.setWet(wet);
    this.bike.setNight(night, this.mode === 'bike');
    this.npcs.minh.visible = gs.flags.wallet === 4;
    if (!(this.om.order && this.om.order.kind === 'ride' && this.passengerMesh && this.passengerMesh.parent === this.bike.mesh)) this.bike.mesh.userData.bagMesh.visible = true;
    this.updateTempNpcs();

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
    this.hud.update({
      time: fmtTime(now),
      day: gs.day,
      weather: `${weather} ${amb}°C`,
      money: gs.money,
      rating: gs.rating,
      phys: gs.phys,
      mental: gs.mental,
      fuel: gs.fuel,
      tank: gs.vehicleSpec.tank,
      hp: gs.bikeHp,
      objectives: objs.map((x) => ({ ...x, current: x === firstOpen })),
      goal,
      prompts: this.prompts || [],
      speedo: mounted
        ? fmt('hud.speed', { kmh: Math.round(Math.abs(this.bike.speed) * 3.6) }) + (Math.abs(this.bike.speed) > ECONOMY.speedLimit ? fmt('hud.overSpeed') : '') + (this.inJam ? fmt('hud.inJam') : '') + (gs.fuel <= 0 ? fmt('hud.noFuel') : '')
        : fmt('hud.walking'),
      cargo,
      timeLeft: left >= 0 ? fmt('hud.minutes', { min: left }) : fmt('hud.late', { min: -left }),
      vignette: Math.max(0, (25 - Math.min(gs.phys, gs.mental)) / 25) * 0.8,
      map: this.mapData(tgt),
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
      bike: this.mode === 'foot' ? { x: this.bike.pos.x, z: this.bike.pos.z } : null,
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
    if (gs.bagSpec.insulation < 0.5) locked.push(fmt('phone.lockCold'));
    if (!gs.effect('passengerSeat')) locked.push(fmt('phone.lockRide'));
    this.phone.render({
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
      mapData: this.mapData(tgt === undefined ? this.currentTarget() : tgt),
    });
  }
}
