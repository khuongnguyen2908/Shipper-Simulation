// Bộ điều khiển xe máy, đi bộ và camera góc nhìn thứ ba.
// Xe phát ra sự kiện vật lý (bump/brake/swerve/collision) để món hàng xử lý.
import * as THREE from 'three';
import { blockAt } from '../sim/cityLayout.js';
import { resolveCircle } from './physics.js';
import { makeBike, makePerson, animatePerson, setSitting, setBikeColor, sitY } from './models.js';

const SW_H = 0.15;
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

// ======================== XE MÁY ========================
export class Bike {
  constructor(scene, spec) {
    this.spec = spec;
    // mesh: khung ngoài cố định (giữ đèn pha, người lái, khách); thân xe bên trong đổi theo kiểu dáng
    this.mesh = new THREE.Group();
    this.setModel(spec);
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0; // tốc độ dọc thân xe (m/s, âm = lùi)
    this.vel = new THREE.Vector2(); // vận tốc thật (trượt khi đường ướt)
    this.yawRate = 0;
    this.lean = 0;
    this.raised = false;
    this.deckY = null; // đang chạy trên mặt cao (dốc / sàn ga sân bay): cao độ mặt; null = dưới đất
    this.potholeCd = new Map();
    this.headlight = new THREE.SpotLight(0xfff1c8, 0, 28, 0.55, 0.5, 1.2);
    this.headlight.position.set(0, 1, 0.7);
    this.headlight.target.position.set(0, 0, 8);
    this.mesh.add(this.headlight, this.headlight.target);
  }

  // Dựng thân xe theo kiểu dáng (gear.json → model); cùng kiểu thì chỉ đổi màu
  setModel(spec) {
    const model = spec.model || 'underbone';
    if (this.body && this.body.userData.model === model) return setBikeColor(this.body, spec.color);
    const bagVisible = this.body ? this.body.userData.bagMesh.visible : true;
    if (this.body) this.mesh.remove(this.body);
    this.body = makeBike(spec.color, model);
    this.mesh.add(this.body);
    this.mesh.userData = this.body.userData;
    this.body.userData.bagMesh.visible = bagVisible;
    if (this.bagSpec) this.setBag(this.bagSpec);
  }

  setSpec(spec) {
    this.spec = spec;
    this.setModel(spec);
  }

  setBag(bagSpec) {
    this.bagSpec = bagSpec;
    const ud = this.mesh.userData;
    const b = ud.bagMesh;
    b.material = b.material.clone();
    b.material.color.setHex(bagSpec.color);
    const s = bagSpec.id === 'box' ? 1.25 : bagSpec.id === 'thermal' ? 1.05 : 0.8;
    b.scale.setScalar(s);
    b.position.y = ud.bagY + (s - 1) * 0.2;
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // input: {forward, back, left, right, brake}; ctx: {fuel, hp, wet, speedCap, grid, potholes, emit}
  update(dt, input, ctx) {
    const s = this.spec;
    const emit = ctx.emit;
    let maxSpeed = s.maxSpeed * (0.6 + 0.4 * (ctx.hp / 100));
    const noFuel = ctx.fuel <= 0;
    if (noFuel) maxSpeed = 1.8; // hết xăng: chỉ dắt bộ được
    if (ctx.speedCap) maxSpeed = Math.min(maxSpeed, ctx.speedCap);
    if (!ctx.mounted) maxSpeed = 0;

    const prev = this.speed;
    const wetK = ctx.wet ? 0.6 : 1;
    let a = 0;
    if (ctx.mounted && input.forward) a = (noFuel ? 1.5 : s.accel) * Math.max(0, 1 - Math.max(0, this.speed) / Math.max(0.1, maxSpeed));
    if (ctx.mounted && input.back) a = this.speed > 0.3 ? -s.brake * wetK : -2;
    if (ctx.mounted && input.brake && this.speed > 0) a = -s.brake * 1.15 * wetK;
    if (!input.forward && !input.back && !input.brake) a = -1.3 * Math.sign(this.speed);
    if (!ctx.mounted) a = -6 * Math.sign(this.speed);
    this.speed += a * dt;
    if (!input.forward && !input.back && Math.abs(this.speed) < 0.15) this.speed = 0;
    if (this.speed > maxSpeed) this.speed = Math.max(maxSpeed, this.speed - 10 * dt); // bị giới hạn (kẹt xe…)
    this.speed = Math.max(-2, this.speed);

    // lái
    const steerIn = ctx.mounted ? (input.left ? 1 : 0) - (input.right ? 1 : 0) : 0;
    const sf = Math.min(1, Math.abs(this.speed) / 3);
    const rate = s.steer * (1 - 0.45 * Math.min(1, Math.abs(this.speed) / 16)) * (ctx.wet ? 0.85 : 1);
    this.yawRate = steerIn * rate * sf * (this.speed < 0 ? -1 : 1);
    this.heading += this.yawRate * dt;

    // bám đường: khô bám chắc, ướt thì trượt
    const f = this.forward();
    const grip = ctx.wet ? 2.8 : 10;
    const k = 1 - Math.exp(-grip * dt);
    this.vel.x += (f.x * this.speed - this.vel.x) * k;
    this.vel.y += (f.z * this.speed - this.vel.y) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    // sự kiện cho món hàng: phanh gấp, ôm cua gắt
    const decel = (prev - this.speed) / dt;
    if (decel > 6.5 && prev > 3) emit('brake', ((decel - 6) / 6) * dt * 1.5);
    const lat = Math.abs(this.speed * this.yawRate);
    if (lat > 6) emit('swerve', ((lat - 6) / 6) * dt * 1.5);

    // mặt đi trên cao (src/world/elevated.js): lên dốc, giữ trong lan can; rồi đâm tường / cột (bỏ qua vật thấp hơn mặt cầu)
    const floorY = blockAt(this.pos.x, this.pos.z) ? SW_H : 0;
    const el = ctx.elev ? ctx.elev.settle(this, 0.7, floorY, 2.4) : { y: floorY, normals: [] };
    const normals = [...el.normals, ...resolveCircle(this.pos, 0.7, ctx.grid, el.y)];
    for (const n of normals) {
      const into = -(this.vel.x * n.x + this.vel.y * n.z);
      if (into > 1.5) {
        emit('collision', into / 5, { what: 'wall' });
        this.speed *= 0.25;
        this.vel.multiplyScalar(0.25);
      } else {
        // trượt dọc tường
        const vn = this.vel.x * n.x + this.vel.y * n.z;
        if (vn < 0) {
          this.vel.x -= vn * n.x;
          this.vel.y -= vn * n.z;
        }
      }
    }

    // ổ gà
    const sp = Math.abs(this.speed);
    for (const [p, t] of this.potholeCd) if (t - dt <= 0) this.potholeCd.delete(p); else this.potholeCd.set(p, t - dt);
    if (sp > 2) {
      for (const p of ctx.potholes) {
        const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
        if (dx * dx + dz * dz < (p.r + 0.3) ** 2 && !this.potholeCd.has(p)) {
          this.potholeCd.set(p, 1.5);
          emit('bump', (sp / 12.5) * p.depth, { what: 'pothole' });
        }
      }
    }
    // lề đường (trên cầu thì không có)
    const raised = this.deckY == null && !!blockAt(this.pos.x, this.pos.z);
    if (this.deckY == null && raised !== this.raised && sp > 2.5) emit('bump', 0.3 * (sp / 12.5), { what: 'curb' });
    this.raised = raised;
    // ngóc đầu / chúi xuống theo dốc
    let pitch = 0;
    if (this.deckY != null && ctx.elev) {
      const hf = ctx.elev.heightAt(this.pos.x + f.x * 0.8, this.pos.z + f.z * 0.8, this.deckY) ?? this.deckY;
      const hb = ctx.elev.heightAt(this.pos.x - f.x * 0.8, this.pos.z - f.z * 0.8, this.deckY) ?? this.deckY;
      pitch = Math.atan2(hf - hb, 1.6);
    }

    // hình ảnh: nghiêng khi cua, bánh xe quay
    const targetLean = Math.max(-0.4, Math.min(0.4, -this.yawRate * this.speed * 0.045));
    this.lean += (targetLean - this.lean) * (1 - Math.exp(-8 * dt));
    this.mesh.position.set(this.pos.x, el.y, this.pos.z);
    this.mesh.rotation.set(-pitch, this.heading, this.lean, 'YXZ');
    const ud = this.mesh.userData;
    ud.wheelF.rotation.x += (this.speed * dt) / ud.wheelRadius;
    ud.wheelR.rotation.x += (this.speed * dt) / ud.wheelRadius;
    return Math.abs(this.speed) * dt; // quãng đường đã đi (tính xăng)
  }

  setNight(n, mounted) {
    this.headlight.intensity = mounted ? 40 * n : 0;
    this.mesh.userData.lamp.material.emissiveIntensity = mounted ? 0.4 + 2 * n : 0.1;
  }
}

// ======================== ĐI BỘ ========================
export class Walker {
  constructor(scene) {
    this.scene = scene;
    this.sitting = false;
    this.mesh = makePerson({ shirt: 0x27ae60, pants: 0x1f2d3d, hat: 'helmet', hatColor: 0x27ae60, bag: false });
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.phase = 0;
    this.speed = 0;
    this.deckY = null; // như xe: đang đứng trên mặt cao
  }

  // camYaw: hướng camera; trả về hoạt động ('idle' | 'walk' | 'run')
  update(dt, input, camYaw, ctx) {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let mx = 0, mz = 0;
    if (input.forward) { mx += fx; mz += fz; }
    if (input.back) { mx -= fx; mz -= fz; }
    if (input.right) { mx += rx; mz += rz; }
    if (input.left) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    let activity = 'idle';
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      const run = input.run && ctx.phys > 8;
      let v = run ? 6.2 : 3.4;
      if (ctx.phys < 15) v *= 0.7;
      this.pos.x += mx * v * dt;
      this.pos.z += mz * v * dt;
      this.heading = lerpAngle(this.heading, Math.atan2(mx, mz), 1 - Math.exp(-14 * dt));
      this.speed = v;
      activity = run ? 'run' : 'walk';
    } else this.speed = 0;
    const floorY = blockAt(this.pos.x, this.pos.z) ? SW_H : 0;
    const el = ctx.elev ? ctx.elev.settle(this, 0.35, floorY, 2.0) : { y: floorY };
    resolveCircle(this.pos, 0.35, ctx.grid, el.y);
    this.phase += dt * this.speed * 2.6;
    animatePerson(this.mesh, this.phase, Math.min(1, this.speed / 4));
    this.mesh.position.set(this.pos.x, el.y, this.pos.z);
    this.mesh.rotation.set(0, this.heading, 0);
    return activity;
  }

  // Thay ngoại hình (trang phục, áo mưa…): dựng lại người, giữ nguyên chỗ đứng/ngồi
  setLook(opts) {
    const old = this.mesh;
    const m = makePerson({ ...opts, bag: false });
    m.position.copy(old.position);
    m.rotation.copy(old.rotation);
    const parent = old.parent;
    if (parent) {
      parent.remove(old);
      parent.add(m);
    }
    if (this.sitting) setSitting(m, true);
    this.mesh = m;
  }

  sitOn(bike) {
    this.sitting = true;
    setSitting(this.mesh, true);
    bike.mesh.add(this.mesh);
    this.mesh.position.set(0, sitY(), -0.05);
    this.mesh.rotation.set(0, 0, 0);
  }

  standUp(scene, bike) {
    this.sitting = false;
    setSitting(this.mesh, false);
    bike.mesh.remove(this.mesh);
    scene.add(this.mesh);
    // xuống xe bên trái
    const f = bike.forward();
    this.pos.set(bike.pos.x + f.z * 0.9, 0, bike.pos.z - f.x * 0.9);
    this.heading = bike.heading;
    this.deckY = bike.deckY; // xuống xe trên cầu thì đứng trên cầu
    this._ex = this.pos.x;
    this._ez = this.pos.z;
  }
}

// ======================== CAMERA ========================
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.42;
    this.dist = 9;
    this.target = new THREE.Vector3();
    this.manualTimer = 0;
    this.init = false;
  }
  drag(dx, dy) {
    this.yaw -= dx * 0.005;
    this.pitch = Math.max(0.1, Math.min(1.25, this.pitch + dy * 0.004));
    this.manualTimer = 2;
  }
  zoom(d) {
    this.dist = Math.max(4, Math.min(24, this.dist + d * 0.01));
  }
  // followHeading: hướng xe (camera tự quay ra sau xe), null khi đi bộ
  update(dt, focus, followHeading, grid) {
    if (followHeading != null && this.manualTimer <= 0) this.yaw = lerpAngle(this.yaw, followHeading + Math.PI, 1 - Math.exp(-2.2 * dt));
    this.manualTimer -= dt;
    const fy = focus.y + 1.5;
    if (!this.init) {
      this.target.set(focus.x, fy, focus.z);
      this.init = true;
    }
    const k = 1 - Math.exp(-12 * dt);
    this.target.x += (focus.x - this.target.x) * k;
    this.target.y += (fy - this.target.y) * k;
    this.target.z += (focus.z - this.target.z) * k;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // không cho camera chui vào trong nhà
    let d = this.dist;
    for (let s = 1; s <= this.dist; s += 0.5) {
      const p = this.target.clone().addScaledVector(dir, s);
      if (grid.inside(p.x, p.y, p.z)) {
        d = Math.max(2, s - 0.8);
        break;
      }
    }
    this.camera.position.copy(this.target).addScaledVector(dir, d);
    this.camera.lookAt(this.target);
  }
}
