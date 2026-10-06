// Giao thông & người đi đường:
//  - Ô tô, xe máy NPC chạy làn bên phải, rẽ ngẫu nhiên ở ngã tư, dừng + bóp còi khi bị chắn
//  - Người đi bộ đi vòng quanh vỉa hè, dừng lại khi được hỏi chuyện
//  - Chó lang thang, thỉnh thoảng lao qua đường trước mũi xe
//  - Chốt CSGT, đoàn xe kẹt giờ cao điểm
import * as THREE from 'three';
import { CITY, roadPos, blockBounds, segmentRect } from '../sim/cityLayout.js';
import { HAZARD } from '../data/balance.js';
import { makeCar, makeNpcMoto, makePerson, makeDog, makeCone, animatePerson, randomPersonOpts } from './models.js';
import { guessGender } from '../sim/people.js';
import { pushCircle } from './physics.js';
import { list } from '../content/index.js';

const SW_H = 0.15;
const CAR_COLORS = [0xecf0f1, 0x2c3e50, 0xc0392b, 0x2980b9, 0x95a5a6, 0xf1c40f, 0x16a085, 0x7f8c8d];
const MOTO_COLORS = [0xc0392b, 0x2c3e50, 0xecf0f1, 0x8e44ad, 0x2980b9, 0xd35400, 0x1abc9c];

const segKeyOf = (a, b) => (a[0] === b[0] ? `x${a[0]}:${Math.min(a[1], b[1])}` : `z${a[1]}:${Math.min(a[0], b[0])}`);
export const segKey = (s) => `${s.axis}${s.line}:${s.from}`;

// Vị trí trên vòng vỉa hè quanh khối (bx,bz); t = mét dọc theo vòng
export function ringPos(bx, bz, t, inset) {
  const b = blockBounds(bx, bz);
  const L = CITY.BLOCK - 2 * inset;
  const per = 4 * L;
  t = ((t % per) + per) % per;
  const side = Math.floor(t / L), u = t - side * L;
  if (side === 0) return { x: b.x0 + inset + u, z: b.z0 + inset };
  if (side === 1) return { x: b.x1 - inset, z: b.z0 + inset + u };
  if (side === 2) return { x: b.x1 - inset - u, z: b.z1 - inset };
  return { x: b.x0 + inset, z: b.z1 - inset - u };
}

// Điểm bất kỳ → khối gần nhất và tham số t trên vòng vỉa hè
function projectToRing(x, z, inset) {
  const off = CITY.ORIGIN + CITY.ROAD / 2;
  const bx = Math.max(0, Math.min(CITY.N - 1, Math.round((x - off - CITY.BLOCK / 2) / CITY.PITCH)));
  const bz = Math.max(0, Math.min(CITY.N - 1, Math.round((z - off - CITY.BLOCK / 2) / CITY.PITCH)));
  const b = blockBounds(bx, bz);
  const L = CITY.BLOCK - 2 * inset;
  const cx = Math.max(b.x0 + inset, Math.min(b.x1 - inset, x));
  const cz = Math.max(b.z0 + inset, Math.min(b.z1 - inset, z));
  const d = [Math.abs(cz - (b.z0 + inset)), Math.abs(cx - (b.x1 - inset)), Math.abs(cz - (b.z1 - inset)), Math.abs(cx - (b.x0 + inset))];
  const side = d.indexOf(Math.min(...d));
  let u;
  if (side === 0) u = cx - (b.x0 + inset);
  else if (side === 1) u = cz - (b.z0 + inset);
  else if (side === 2) u = b.x1 - inset - cx;
  else u = b.z1 - inset - cz;
  return { bx, bz, t: side * L + u };
}

export class Traffic {
  constructor(scene, rng, opts = {}) {
    this.scene = scene;
    this.rng = rng;
    this.agents = [];
    this.peds = [];
    this.dogs = [];
    this.police = new Map();
    this.jamCircles = [];
    this.jamKeys = new Set();
    this.honkCd = 0;
    const nCars = opts.cars ?? 22, nMotos = opts.motos ?? 30, nPeds = opts.peds ?? 36, nDogs = opts.dogs ?? 6;
    for (let i = 0; i < nCars + nMotos; i++) this.spawnAgent(i < nCars ? 'car' : 'moto');
    for (let i = 0; i < nPeds; i++) this.spawnPed(i);
    for (let i = 0; i < nDogs; i++) this.spawnDog();
    this.buildJamMeshes();
  }

  // ---------------- xe NPC ----------------
  spawnAgent(kind) {
    const rng = this.rng;
    const from = [rng.int(0, CITY.N), rng.int(0, CITY.N)];
    const to = this.pickNext(from, null);
    const mesh = kind === 'car' ? makeCar(rng.pick(CAR_COLORS)) : makeNpcMoto(rng.pick(MOTO_COLORS), rng);
    this.scene.add(mesh);
    const maxSpeed = kind === 'car' ? rng.range(7, 10) : rng.range(8, 11.5);
    this.agents.push({ kind, mesh, from, to, t: rng.range(5, CITY.PITCH - 5), speed: maxSpeed * 0.5, maxSpeed, lane: kind === 'car' ? 2.8 : 4.4, stop: 0, x: 0, z: 0, dx: 0, dz: 0, heading: 0, honk: 0 });
  }

  pickNext(node, prev) {
    const [i, j] = node;
    const opts = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a <= CITY.N && b <= CITY.N);
    let c = opts.filter((n) => !prev || n[0] !== prev[0] || n[1] !== prev[1]);
    if (!c.length) c = opts;
    // ưu tiên đi thẳng
    if (prev) {
      const straight = [i + (i - prev[0]), j + (j - prev[1])];
      const s = c.find((n) => n[0] === straight[0] && n[1] === straight[1]);
      if (s && this.rng.chance(0.55)) return s;
    }
    return this.rng.pick(c);
  }

  // ---------------- người đi bộ ----------------
  spawnPed(i) {
    const rng = this.rng;
    const name = rng.pick(list('ped.names'));
    const mesh = makePerson(randomPersonOpts(rng, guessGender(name)));
    this.scene.add(mesh);
    this.peds.push({ id: i, mesh, bx: rng.int(0, CITY.N - 1), bz: rng.int(0, CITY.N - 1), t: rng.range(0, 140), speed: rng.range(0.9, 1.4), dir: rng.chance(0.5) ? 1 : -1, pause: 0, talk: 0, knock: 0, phase: rng.range(0, 6), name, x: 0, z: 0, asked: false });
  }

  spawnDog() {
    const rng = this.rng;
    const mesh = makeDog(rng.pick([0xb5651d, 0x3b2a1a, 0xe0c9a6, 0x7b5e3b]));
    this.scene.add(mesh);
    this.dogs.push({ mesh, bx: rng.int(0, CITY.N - 1), bz: rng.int(0, CITY.N - 1), t: rng.range(0, 140), speed: 0.8, dir: 1, state: 'wander', vx: 0, vz: 0, timer: 0, armed: true, x: 0, z: 0, phase: 0, pause: 0 });
  }

  // ---------------- kẹt xe ----------------
  buildJamMeshes() {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    this.jamCarMesh = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 }), 220);
    this.jamCarMesh.count = 0;
    this.jamCarMesh.castShadow = true;
    this.jamMotoMesh = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 260);
    this.jamMotoMesh.count = 0;
    this.jamMotoMesh.castShadow = true;
    this.scene.add(this.jamCarMesh, this.jamMotoMesh);
  }

  setJams(segments) {
    const keys = new Set(segments.map(segKey));
    if (keys.size === this.jamKeys.size && [...keys].every((k) => this.jamKeys.has(k))) return;
    this.jamKeys = keys;
    this.jamCircles = [];
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let nc = 0, nm = 0;
    for (const s of segments) {
      const r = segmentRect(s);
      const alongX = s.axis === 'z';
      const a0 = alongX ? r.x0 : r.z0, a1 = alongX ? r.x1 : r.z1;
      const mid = alongX ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
      for (const side of [-1, 1]) {
        for (let a = a0 + 3; a < a1 - 3 && nc < 220; a += 5.6 + this.rng.next() * 1.5) {
          const lat = mid + side * (2.9 + this.rng.range(-0.25, 0.25));
          const x = alongX ? a : lat, z = alongX ? lat : a;
          dummy.position.set(x, 0.8, z);
          dummy.rotation.set(0, alongX ? Math.PI / 2 : 0, 0);
          dummy.scale.set(1.8, 1.3, 4);
          dummy.updateMatrix();
          this.jamCarMesh.setMatrixAt(nc, dummy.matrix);
          this.jamCarMesh.setColorAt(nc, col.setHex(this.rng.pick(CAR_COLORS)));
          nc++;
          this.jamCircles.push({ x: x + (alongX ? 1.1 : 0), z: z + (alongX ? 0 : 1.1), r: 1.05 }, { x: x - (alongX ? 1.1 : 0), z: z - (alongX ? 0 : 1.1), r: 1.05 });
        }
        for (let a = a0 + 2; a < a1 - 2 && nm < 260; a += 2.2 + this.rng.next()) {
          const lat = mid + side * (4.9 + this.rng.range(-0.3, 0.3));
          const x = alongX ? a : lat, z = alongX ? lat : a;
          dummy.position.set(x, 0.75, z);
          dummy.rotation.set(0, alongX ? Math.PI / 2 : 0, 0);
          dummy.scale.set(0.5, 1.5, 1.6);
          dummy.updateMatrix();
          this.jamMotoMesh.setMatrixAt(nm, dummy.matrix);
          this.jamMotoMesh.setColorAt(nm, col.setHex(this.rng.pick(MOTO_COLORS)));
          nm++;
        }
      }
    }
    this.jamCarMesh.count = nc;
    this.jamMotoMesh.count = nm;
    this.jamCarMesh.instanceMatrix.needsUpdate = this.jamMotoMesh.instanceMatrix.needsUpdate = true;
    if (this.jamCarMesh.instanceColor) this.jamCarMesh.instanceColor.needsUpdate = true;
    if (this.jamMotoMesh.instanceColor) this.jamMotoMesh.instanceColor.needsUpdate = true;
  }

  // ---------------- CSGT ----------------
  setPolice(list) {
    const ids = new Set(list.map((p) => p.id));
    for (const [id, g] of this.police) {
      if (!ids.has(id)) {
        this.scene.remove(g);
        this.police.delete(id);
      }
    }
    for (const p of list) {
      if (this.police.has(p.id)) continue;
      const g = new THREE.Group();
      const x = roadPos(p.node[0]), z = roadPos(p.node[1]);
      g.position.set(x, 0, z);
      for (const [ox, oz, ry] of [[2.5, 2.5, -2.3], [-2.5, -2.2, 0.8]]) {
        const o = makePerson({ shirt: 0xd8c25a, pants: 0x2e5d3a, hat: 'police' });
        o.position.set(ox, 0, oz);
        o.rotation.y = ry;
        o.userData.parts.armR.rotation.x = -1.2;
        g.add(o);
      }
      for (let k = 0; k < 6; k++) {
        const c = makeCone();
        const a = (k / 6) * Math.PI * 2;
        c.position.set(Math.cos(a) * 5.2, 0, Math.sin(a) * 5.2);
        g.add(c);
      }
      this.scene.add(g);
      this.police.set(p.id, g);
    }
  }

  // ---------------- cập nhật mỗi khung hình ----------------
  // ctx: { px, pz, onBike, speed, fx, fz, night }
  update(dt, ctx) {
    const events = [];
    this.honkCd -= dt;
    // xe NPC
    for (const a of this.agents) {
      const dx = a.to[0] - a.from[0], dz = a.to[1] - a.from[1];
      let v = a.maxSpeed;
      if (this.jamKeys.has(segKeyOf(a.from, a.to))) v = 0.9;
      for (const b of this.agents) {
        if (b === a || b.from[0] !== a.from[0] || b.from[1] !== a.from[1] || b.to[0] !== a.to[0] || b.to[1] !== a.to[1]) continue;
        const gap = b.t - a.t;
        if (gap > 0 && gap < 10) v = Math.min(v, Math.max(0, (gap - 5) * 1.5));
      }
      // người chơi hoặc chó chắn trước mặt → dừng, bóp còi
      const rx = -dz, rz = dx;
      const blockers = [{ x: ctx.px, z: ctx.pz, player: true }, ...this.dogs.filter((d) => d.state !== 'wander')];
      for (const p of blockers) {
        const ox = p.x - a.x, oz = p.z - a.z;
        const along = ox * dx + oz * dz, lat = ox * rx + oz * rz;
        if (along > 0 && along < (a.kind === 'car' ? 7 : 5) && Math.abs(lat - 0) < 1.8) {
          v = 0;
          if (p.player && a.honk <= 0 && a.speed < 1) {
            a.honk = 4 + this.rng.next() * 4;
            if (this.honkCd <= 0 && Math.hypot(ox, oz) < 14) {
              events.push({ type: 'honk', kind: a.kind });
              this.honkCd = 1.5;
            }
          }
        }
      }
      a.honk -= dt;
      if (a.stop > 0) {
        a.stop -= dt;
        v = 0;
      }
      a.speed += Math.max(-8 * dt, Math.min(3 * dt, v - a.speed));
      a.t += a.speed * dt;
      if (a.t >= CITY.PITCH) {
        a.t -= CITY.PITCH;
        const nx = this.pickNext(a.to, a.from);
        a.from = a.to;
        a.to = nx;
      }
      const ndx = a.to[0] - a.from[0], ndz = a.to[1] - a.from[1];
      a.dx = ndx;
      a.dz = ndz;
      a.x = roadPos(a.from[0]) + ndx * a.t + -ndz * a.lane;
      a.z = roadPos(a.from[1]) + ndz * a.t + ndx * a.lane;
      const hd = Math.atan2(ndx, ndz);
      let d = hd - a.heading;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      a.heading += d * Math.min(1, dt * 8);
      a.mesh.position.set(a.x, 0, a.z);
      a.mesh.rotation.y = a.heading;
      if (a.kind === 'moto') {
        const w = a.mesh.userData.bike.userData;
        w.wheelF.rotation.x += (a.speed * dt) / 0.32;
        w.wheelR.rotation.x += (a.speed * dt) / 0.32;
      }
    }

    // người đi bộ
    for (const p of this.peds) {
      p.phase += dt * 4;
      let moving = false;
      if (p.knock > 0) {
        p.knock -= dt;
        p.mesh.rotation.x = p.knock > 0.4 ? -1.3 : 0;
      } else if (p.talk > 0) {
        p.talk -= dt;
        p.mesh.rotation.y = Math.atan2(ctx.px - p.x, ctx.pz - p.z);
      } else if (p.pause > 0) p.pause -= dt;
      else {
        p.t += p.speed * p.dir * dt;
        moving = true;
        if (this.rng.next() < dt * 0.05) p.pause = this.rng.range(2, 5);
        if (this.rng.next() < dt * 0.015) p.dir *= -1;
      }
      const pos = ringPos(p.bx, p.bz, p.t, 1.3);
      if (moving) {
        const nxt = ringPos(p.bx, p.bz, p.t + p.dir * 0.2, 1.3);
        p.mesh.rotation.y = Math.atan2(nxt.x - pos.x, nxt.z - pos.z);
      }
      p.x = pos.x;
      p.z = pos.z;
      p.mesh.position.set(pos.x, SW_H, pos.z);
      animatePerson(p.mesh, p.phase, moving ? 0.6 : 0);
    }

    // chó
    for (const d of this.dogs) {
      d.phase += dt * 10;
      if (d.state === 'wander') {
        if (d.pause > 0) d.pause -= dt;
        else {
          d.t += d.speed * d.dir * dt;
          if (this.rng.next() < dt * 0.1) d.pause = this.rng.range(1, 4);
          if (this.rng.next() < dt * 0.05) d.dir *= -1;
        }
        const pos = ringPos(d.bx, d.bz, d.t, 0.7);
        const nxt = ringPos(d.bx, d.bz, d.t + d.dir * 0.2, 0.7);
        d.mesh.rotation.y = Math.atan2(nxt.x - pos.x, nxt.z - pos.z);
        d.x = pos.x;
        d.z = pos.z;
        // lao qua đường trước mũi xe
        const ox = d.x - ctx.px, oz = d.z - ctx.pz;
        const dist = Math.hypot(ox, oz);
        if (dist > 40) d.armed = true;
        if (d.armed && ctx.onBike && ctx.speed > 6 && dist > 10 && dist < 26) {
          const ahead = (ox * ctx.fx + oz * ctx.fz) / dist;
          if (ahead > 0.8) {
            d.armed = false;
            if (this.rng.chance(HAZARD.dogDartChance)) {
              const along = ox * ctx.fx + oz * ctx.fz;
              const tx = ctx.px + ctx.fx * along, tz = ctx.pz + ctx.fz * along;
              const L = Math.hypot(tx - d.x, tz - d.z) || 1;
              d.vx = ((tx - d.x) / L) * 6.5;
              d.vz = ((tz - d.z) / L) * 6.5;
              d.timer = (L + 7) / 6.5;
              d.state = 'dart';
              events.push({ type: 'dogDart' });
            }
          }
        }
      } else {
        d.x += d.vx * dt;
        d.z += d.vz * dt;
        d.timer -= dt;
        d.mesh.rotation.y = Math.atan2(d.vx, d.vz);
        if (d.timer <= 0) {
          const r = projectToRing(d.x, d.z, 0.7);
          Object.assign(d, r, { state: 'wander' });
        }
      }
      d.mesh.position.set(d.x, d.state === 'wander' ? SW_H : 0, d.z);
      const legs = d.mesh.userData.legs;
      const amp = d.state === 'wander' ? (d.pause > 0 ? 0 : 0.4) : 0.9;
      legs.forEach((l, k) => (l.rotation.x = Math.sin(d.phase + (k % 2) * Math.PI) * amp));
    }
    return events;
  }

  // Va chạm giữa người chơi (xe hoặc đi bộ) với xe NPC, người, chó, xe kẹt
  collidePlayer(pos, r, vel, onBike) {
    const hits = [];
    const speed = Math.hypot(vel.x, vel.y);
    const test = (cx, cz, cr, avx, avz, what, obj) => {
      const n = pushCircle(pos, r, cx, cz, cr);
      if (!n) return;
      const into = -((vel.x - avx) * n.x + (vel.y - avz) * n.z);
      hits.push({ what, n, into, obj });
    };
    for (const a of this.agents) {
      const avx = a.dx * a.speed, avz = a.dz * a.speed;
      if (a.kind === 'car') {
        test(a.x + a.dx * 1.1, a.z + a.dz * 1.1, 1.05, avx, avz, 'car', a);
        test(a.x - a.dx * 1.1, a.z - a.dz * 1.1, 1.05, avx, avz, 'car', a);
      } else test(a.x, a.z, 0.55, avx, avz, 'moto', a);
    }
    for (const c of this.jamCircles) test(c.x, c.z, c.r, 0, 0, 'car', null);
    for (const p of this.peds) {
      if (p.knock > 0) continue;
      test(p.x, p.z, 0.32, 0, 0, 'ped', p);
    }
    for (const d of this.dogs) test(d.x, d.z, 0.42, d.state === 'wander' ? 0 : d.vx, d.state === 'wander' ? 0 : d.vz, 'dog', d);
    // phản ứng của NPC bị đâm
    for (const h of hits) {
      if (h.obj && (h.what === 'car' || h.what === 'moto') && h.into > 1) h.obj.stop = 2.5;
      if (h.what === 'ped' && onBike && speed > 2) h.obj.knock = 1.4;
      if (h.what === 'dog' && speed > 1.5) {
        const d = h.obj;
        d.state = 'flee';
        d.vx = -h.n.x * 7;
        d.vz = -h.n.z * 7;
        d.timer = 2;
      }
    }
    return hits;
  }

  nearestPed(x, z, maxD) {
    let best = null, bd = maxD;
    for (const p of this.peds) {
      if (p.knock > 0) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }
}
