// =============================================================
// NGƯỜI CHƠI KHÁC (Online): người + xe + bảng tên trên đầu. Chỉ để nhìn — mỗi máy tự vẽ, không va chạm.
// Vị trí từ máy chủ chỉ là "đích": mỗi khung hình trượt dần tới đó cho mượt; cách quá xa (dịch chuyển, đi phà) thì nhảy luôn.
// =============================================================
import * as THREE from 'three';
import { makePerson, makeBike, setSitting, sitY, bikeSeatZ, gripBar, animatePerson, setBikeColor } from './models.js';
import { makePlayerTagTexture } from './textures.js';
import { lerpAngle } from './controllers.js';
import { BRANDS } from '../data/apps.js';

const SNAP = 15; // lệch quá 15 m thì nhảy thẳng tới
const FOLLOW = 12; // trượt tới đích nhanh cỡ nào (mỗi giây)

export class RemotePlayers {
  constructor(scene, cfg = {}) {
    this.scene = scene;
    this.cfg = cfg; // { tagNearM, tagFarM }
    this.map = new Map(); // id → người chơi khác
  }
  get list() {
    return [...this.map.values()];
  }
  // p: thông tin công khai từ máy chủ { id, name, plate, look, veh, bag, brand, rating, st }
  upsert(p) {
    let r = this.map.get(p.id);
    if (!r) {
      r = { id: p.id, root: new THREE.Group(), x: 0, z: 0, y: 0, h: 0, tx: 0, tz: 0, ty: 0, th: 0, m: 0, s: 0, a: 'idle', phase: 0, fresh: true };
      r.bike = new THREE.Group(); // xe: luôn ở đúng chỗ xe của họ (đang chạy hoặc đang dựng)
      this.scene.add(r.root, r.bike);
      r.tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, transparent: true }));
      r.tag.renderOrder = 5;
      this.scene.add(r.tag);
      this.map.set(p.id, r);
    }
    Object.assign(r, { name: p.name, plate: p.plate, brand: p.brand, rating: p.rating, vehName: p.veh?.name || '' });
    const lookKey = JSON.stringify(p.look || {});
    if (lookKey !== r.lookKey) {
      r.lookKey = lookKey;
      if (r.person) r.person.parent?.remove(r.person);
      r.person = makePerson({ ...(p.look || { shirt: 0x27ae60, hat: 'helmet', hatColor: 0x27ae60 }), bag: false });
      r.root.add(r.person);
      r.seated = null;
    }
    const vkey = `${p.veh?.model}|${p.veh?.color}|${p.bag}`;
    if (vkey !== r.vkey) {
      r.vkey = vkey;
      r.pedal = !!p.veh?.pedal;
      if (r.body && r.body.userData.model === (p.veh?.model || 'underbone')) setBikeColor(r.body, p.veh?.color ?? 0x3a6fb0);
      else {
        if (r.body) r.bike.remove(r.body);
        r.body = makeBike(p.veh?.color ?? 0x3a6fb0, p.veh?.model || 'underbone');
        r.bike.add(r.body);
        r.seated = null; // dựng xe mới: ngồi lại cho đúng tay lái
      }
      const bag = r.body.userData.bagMesh;
      if (bag) {
        bag.visible = !r.body.userData.noBag && p.bag != null;
        if (p.bag != null) {
          bag.material = bag.material.clone();
          bag.material.color.setHex(p.bag);
        }
      }
    }
    r.tagKey = null; // vẽ lại bảng tên (đổi tên / xe / hãng)
    if (p.st) this.setState(p.id, p.st);
    return r;
  }
  // st: { x, z, y, h, m, s, bx, bz, bh, a }
  setState(id, st) {
    const r = this.map.get(id);
    if (!r) return;
    Object.assign(r, { tx: st.x, tz: st.z, ty: st.y, th: st.h, m: st.m, s: st.s, a: st.a, bx: st.bx, bz: st.bz, bh: st.bh });
    if (r.fresh || Math.hypot(r.tx - r.x, r.tz - r.z) > SNAP) {
      Object.assign(r, { x: r.tx, z: r.tz, y: r.ty, h: r.th, fresh: false });
    }
  }
  // gói 'pos' của máy chủ: [[id, x, z, y, h, m, s, bx, bz, bh, a], …]
  applyPos(list) {
    for (const [id, x, z, y, h, m, s, bx, bz, bh, a] of list) this.setState(id, { x, z, y, h, m, s, bx, bz, bh, a });
  }
  remove(id) {
    const r = this.map.get(id);
    if (!r) return;
    this.scene.remove(r.root, r.bike, r.tag);
    r.tag.material.map?.dispose();
    r.tag.material.dispose();
    this.map.delete(id);
  }
  clear() {
    for (const id of [...this.map.keys()]) this.remove(id);
  }

  // Mỗi khung hình: trượt tới đích, ngồi / đứng, đi bộ nhún chân, bảng tên theo khoảng cách camera
  update(dt, cam) {
    const k = 1 - Math.exp(-FOLLOW * dt);
    const near = this.cfg.tagNearM ?? 60, far = this.cfg.tagFarM ?? 160;
    for (const r of this.map.values()) {
      r.x += (r.tx - r.x) * k;
      r.z += (r.tz - r.z) * k;
      r.y += (r.ty - r.y) * k;
      r.h = lerpAngle(r.h, r.th, k);
      const onBike = !!r.m;
      // xe: đang chạy thì theo người, đang dựng thì ở chỗ dựng
      if (onBike) {
        r.bike.position.set(r.x, r.y, r.z);
        r.bike.rotation.set(0, r.h, 0);
      } else {
        r.bike.position.set(r.bx, 0, r.bz);
        r.bike.rotation.set(0, r.bh, 0);
      }
      r.bike.visible = !!r.body && (onBike || Math.hypot(r.bx, r.bz) > 0.01);
      if (r.seated !== onBike) {
        r.seated = onBike;
        setSitting(r.person, onBike);
        if (onBike) {
          r.bike.add(r.person);
          r.person.position.set(0, sitY(), bikeSeatZ(r.body?.userData.model));
          r.person.rotation.set(0, 0, 0);
          gripBar(r.person, r.body?.userData.model);
        } else r.root.add(r.person);
      }
      if (!onBike) {
        r.person.position.set(r.x, r.y, r.z);
        r.person.rotation.set(0, r.h, 0);
        const sp = Math.abs(r.s);
        r.phase += dt * sp * 2.6;
        animatePerson(r.person, r.phase, Math.min(1, sp / 4));
      }
      // bảng tên: gần thì tên + biển số (khi đi xe máy), xa thì tên nhỏ, quá xa thì ẩn
      const d = cam ? Math.hypot(cam.x - r.x, cam.z - r.z) : 0;
      const showPlate = onBike && !r.pedal && d < near;
      const key = `${r.name}|${showPlate ? r.plate : ''}|${r.brand}`;
      if (key !== r.tagKey) {
        r.tagKey = key;
        r.tag.material.map?.dispose();
        r.tag.material.map = makePlayerTagTexture(r.name, showPlate ? r.plate : '', BRANDS[r.brand]?.color || null);
        r.tag.material.needsUpdate = true;
      }
      const s = d < near ? 1 : 0.75;
      r.tag.scale.set(2.6 * s, 0.81 * s, 1);
      r.tag.position.set(r.x, r.y + (onBike ? 2.35 : 2.25) + (showPlate ? 0 : -0.2), r.z);
      r.tag.visible = d < far;
    }
  }
}
