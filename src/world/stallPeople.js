// KHÁCH NGỒI QUÁN CÓC (chỉ để nhìn): một nhóm người dùng lại (POOL), ngồi trên ghế nhựa quán cóc quanh người chơi.
// - Ghế nào "có khách" cố định theo ghế (OCCUPIED ≈ 55% số ghế) → đi qua đi lại không thấy người nhảy chỗ.
// - Mỗi 0,5 giây: lấy các ghế có khách gần người chơi nhất (trong NEAR m); người đang ngồi ghế vẫn còn gần thì giữ nguyên,
//   ghế ra xa thì người đó đứng lên chuyển sang ghế mới vào tầm.
// - Ghế đang có khách được đánh dấu seat.npc = true → người chơi không ngồi vào được (interactions.js).
import { makePerson, randomPersonOpts, setSitting, sitY } from './models.js';
import { makeRng } from '../sim/rng.js';

const POOL = 12; // số người dựng sẵn (mỗi người ~10 khối vẽ)
const NEAR = 40; // m
const OCCUPIED = 0.55;

export function makeStallPeople(scene, seats) {
  const list = seats.filter((s) => s.stall);
  const rng = makeRng(77);
  const people = Array.from({ length: POOL }, () => {
    const m = makePerson(randomPersonOpts(rng, null, { sitting: true }));
    setSitting(m, true, true);
    m.visible = false;
    scene.add(m);
    return { m, seat: null };
  });
  // ghế có khách hay không: cố định theo thứ tự ghế
  const hasGuest = list.map((_, k) => ((Math.imul(k + 7, 2654435761) >>> 0) % 1000) / 1000 < OCCUPIED);
  let wait = 0;
  return {
    // px, pz: người chơi · mySeat: ghế người chơi đang ngồi (bỏ qua)
    update(dt, px, pz, mySeat = null) {
      if ((wait -= dt) > 0) return;
      wait = 0.5;
      const near = [];
      list.forEach((s, k) => {
        if (!hasGuest[k] || s === mySeat) return;
        const d = Math.hypot(s.x - px, s.z - pz);
        if (d < NEAR) near.push([d, s]);
      });
      near.sort((a, b) => a[0] - b[0]);
      const want = new Set(near.slice(0, POOL).map(([, s]) => s));
      // thả người ở ghế không còn trong tầm
      for (const p of people) {
        if (p.seat && !want.has(p.seat)) {
          p.seat.npc = false;
          p.seat = null;
          p.m.visible = false;
        }
      }
      // ghế mới vào tầm → người rảnh ngồi vào
      const seated = new Set(people.map((p) => p.seat).filter(Boolean));
      const free = people.filter((p) => !p.seat);
      for (const s of want) {
        if (seated.has(s) || !free.length) continue;
        const p = free.pop();
        p.seat = s;
        s.npc = true;
        const b = 0.08; // lùi về phía lưng ghế chút (như người chơi ngồi)
        p.m.position.set(s.x - Math.sin(s.ry) * b, sitY(p.m.scale.x, s.y), s.z - Math.cos(s.ry) * b);
        p.m.rotation.set(0, s.ry, 0);
        p.m.visible = true;
      }
    },
  };
}
