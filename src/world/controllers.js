// Bộ điều khiển xe máy, đi bộ và camera góc nhìn thứ ba.
// Xe phát ra sự kiện vật lý (bump/brake/swerve/collision) để món hàng xử lý.
import * as THREE from 'three';
import { blockAt } from '../sim/cityLayout.js';
import { resolveCircle } from './physics.js';
import { makeBike, makePerson, animatePerson, setSitting, setBikeColor } from './models.js';

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
    this.mesh = makeBike(spec.color);
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0; // tốc độ dọc thân xe (m/s, âm = lùi)
    this.vel = new THREE.Vector2(); // vận tốc thật (trượt khi đường ướt)
    this.yawRate = 0;
    this.lean = 0;
    this.raised = false;
    this.potholeCd = new Map();
    this.headlight = new THREE.SpotLight(0xfff1c8, 0, 28, 0.55, 0.5, 1.2);
    this.headlight.position.set(0, 1, 0.7);
    this.headlight.target.position.set(0, 0, 8);
    this.mesh.add(this.headlight, this.headlight.target);
  }

  setSpec(spec) {
    this.spec = spec;
    setBikeColor(this.mesh, spec.color);
  }

  setBag(bagSpec) {
    const b = this.mesh.userData.bagMesh;
    b.material = b.material.clone();
    b.material.color.setHex(bagSpec.color);
    const s = bagSpec.id === 'box' ? 1.25 : bagSpec.id === 'thermal' ? 1.05 : 0.8;
    b.scale.setScalar(s);
    b.position.y = 1.22 + (s - 1) * 0.2;
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

    // đâm tường / cột
    const normals = resolveCircle(this.pos, 0.7, ctx.grid);
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
    // lề đường
    const raised = !!blockAt(this.pos.x, this.pos.z);
    if (raised !== this.raised && sp > 2.5) emit('bump', 0.3 * (sp / 12.5), { what: 'curb' });
    this.raised = raised;

    // hình ảnh: nghiêng khi cua, bánh xe quay
    const targetLean = Math.max(-0.4, Math.min(0.4, -this.yawRate * this.speed * 0.045));
    this.lean += (targetLean - this.lean) * (1 - Math.exp(-8 * dt));
    this.mesh.position.set(this.pos.x, raised ? SW_H : 0, this.pos.z);
    this.mesh.rotation.set(0, this.heading, this.lean);
    const ud = this.mesh.userData;
    ud.wheelF.rotation.x += (this.speed * dt) / 0.32;
    ud.wheelR.rotation.x += (this.speed * dt) / 0.32;
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
    this.mesh = makePerson({ shirt: 0x27ae60, pants: 0x1f2d3d, hat: 'helmet', hatColor: 0x27ae60, bag: false });
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.phase = 0;
    this.speed = 0;
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
    resolveCircle(this.pos, 0.35, ctx.grid);
    this.phase += dt * this.speed * 2.6;
    animatePerson(this.mesh, this.phase, Math.min(1, this.speed / 4));
    const raised = !!blockAt(this.pos.x, this.pos.z);
    this.mesh.position.set(this.pos.x, raised ? SW_H : 0, this.pos.z);
    this.mesh.rotation.set(0, this.heading, 0);
    return activity;
  }

  sitOn(bike) {
    setSitting(this.mesh, true);
    bike.mesh.add(this.mesh);
    this.mesh.position.set(0, 0.28, -0.05);
    this.mesh.rotation.set(0, 0, 0);
  }

  standUp(scene, bike) {
    setSitting(this.mesh, false);
    bike.mesh.remove(this.mesh);
    scene.add(this.mesh);
    // xuống xe bên trái
    const f = bike.forward();
    this.pos.set(bike.pos.x + f.z * 0.9, 0, bike.pos.z - f.x * 0.9);
    this.heading = bike.heading;
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
