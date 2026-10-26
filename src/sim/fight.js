// =============================================================
// ĐÁNH NHAU (cốt truyện chương 6 — trên tàu): luật thuần, không Three.js / DOM.
// Vũ khí (story.json → weapons), kiểu địch (story.json → foes), trận (story.json → fights) sửa ở ?editor thẻ 📖 Cốt truyện.
// Người / địch là object thường { x, z, heading, hp, … }; game/fight.js lo hình, phím, âm thanh, giao diện.
// Người chơi là shipper không có võ: vung chậm, đánh nhẹ; anh Đạt (máy điều khiển) đánh mạnh, đi trước mở đường.
// =============================================================
import storyData from '../data/story.json' with { type: 'json' };

// Số mặc định (dữ liệu thiếu ô nào thì lấy ô đó ở đây)
export const WEAPON_DEFAULT = { dmg: 4, cd: 0.9, reach: 1.4, dur: 0, stun: 0, block: 3 };
export const FOE_DEFAULT = { hp: 30, dmg: 8, windup: 0.6, cd: 1.4, speed: 3.6, reach: 1.6 };
export const PLAYER = { hp: 100, blockCut: 0.8, pipRegen: 3, dodgeCd: 0.8, dodgeTime: 0.28, dodgeDist: 3, backMul: 2, sight: 11, fov: 1.2, hear: 1.0, hearRun: 4, level: 2.2 }; // hear: đi bộ sát sau lưng mới bị nghe (đập lén được) · chạy thì nghe xa
// level: chênh cao quá … m thì không thấy (lính dưới bến không thấy lên boong; lính trên boong không thấy nửa dưới cầu thang mạn)
// Tầm nhìn của 1 tên (màn lẻn: vùng sáng vẽ ra đúng bằng này): xa sight m (dữ liệu ghi đè được), nửa góc nhìn (radian)
export const sightOf = (foe) => ({ r: foe.sight ?? PLAYER.sight, half: PLAYER.fov / 2 + 0.35 });
export const ALLY = { hp: 120, dmg: 16, cd: 2.1, speed: 4.4, reach: 1.7, takeMul: 0.6, bossMul: 0.3 };

export const weaponOf = (id, data = storyData) => ({ ...WEAPON_DEFAULT, ...(data.weapons?.fists || {}), ...(data.weapons?.[id] || {}), id: data.weapons?.[id] ? id : 'fists' });
export const foeOf = (kind, data = storyData) => ({ ...FOE_DEFAULT, ...(data.foes?.[kind] || {}), kind });
export const fightOf = (id, data = storyData) => data.fights?.[id] || null;

const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const headingTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Đứng sau lưng người kia? (góc giữa hướng mặt của nó và hướng từ nó tới mình > ~110°)
export const behind = (foe, p) => angDiff(foe.heading, headingTo(foe, p)) > 1.9;

// Tạo địch lúc bắt đầu trận (def: 1 dòng trong fights.<id>.foes)
// cd lệch nhau theo thứ tự (khỏi cả đám cùng vung một lúc)
export function makeFoe(def, pos, data = storyData, idx = 0) {
  const f = foeOf(def.foe || 'thug', data);
  // patrol: [[x, z, dừng (giây), hướng nhìn lúc dừng (độ)], …] · sweep: quét đèn qua lại ±… độ (chu kỳ sweepT giây) lúc đứng gác / dừng ở điểm tuần
  return { who: def.who, kind: f.kind, f, x: pos.x, z: pos.z, heading: pos.heading ?? 0, hp: f.hp, max: f.hp, state: def.join != null ? 'wait' : def.patrol?.length ? 'patrol' : 'idle', t: 0, cd: 0.5 + (idx % 3) * 0.35, alert: !def.patrol?.length && !def.sneak, join: def.join ?? null, patrol: def.patrol || null, pi: 0, target: null, engagedBy: null, combo: 0, chargeCd: 2, rage: false, throwT: 0, stun: 0, trap: 0,
    sweep: def.sweep ? (def.sweep * Math.PI) / 180 : 0, sweepT: def.sweepT || 6, base: pos.heading ?? 0, st: (idx * 1.7) % 6, sight: def.sight ?? null };
}

// Lệch nhịp (dữ liệu "phase" giây): người đi tuần coi như đã đi trước … giây lúc trận bắt đầu (màn lẻn: các nhịp tuần chồng lên nhau, không có khe đi thẳng)
export function prewarm(foe, sec) {
  const far = { x: 1e9, z: 1e9 };
  for (let t = 0; t < sec; t += 0.1) foeTick(foe, { player: far, dt: 0.1 });
}

// Vung trúng ai: địch còn đứng trong tầm + trong góc trước mặt người đánh (gần tâm nhất trước)
export function meleeTargets(att, foes, reach, arc = 0.62) {
  const out = [];
  for (const f of foes) {
    if (f.state === 'ko' || f.state === 'wait') continue;
    const d = dist(att, f);
    if (d > reach + 0.45) continue;
    const a = angDiff(att.heading, headingTo(att, f));
    if (a > arc && d > 0.8) continue;
    out.push({ f, d, a });
  }
  return out.sort((p, q) => p.a + p.d * 0.2 - (q.a + q.d * 0.2)).map((x) => x.f);
}

// Đòn trúng địch. by: 'player' | 'ally' · wpn: vũ khí · att: chỗ người đánh. Trả { dmg, blocked, ko }
export function hitFoe(foe, wpn, att, by = 'player') {
  if (foe.state === 'ko') return { dmg: 0, blocked: false, ko: false };
  const back = behind(foe, att);
  // boss tự đỡ: đánh trước mặt lúc nó không sơ hở (đang vung / vừa vung hụt / choáng / bị trùm phao) → đỡ hết
  const open = foe.state === 'windup' || foe.state === 'recover' || foe.state === 'dazed' || foe.stun > 0 || foe.trap > 0;
  if (foe.f.guard && !back && !open && by === 'player') {
    if (wpn.stun > 0) { foe.stun = wpn.stun; foe.state = 'recover'; foe.t = 0; } // chảo / gạch phá thế đỡ
    return { dmg: 0, blocked: true, ko: false };
  }
  let dmg = by === 'ally' ? ALLY.dmg * (foe.f.boss ? ALLY.bossMul : 1) : wpn.dmg;
  if (by === 'player' && (back || foe.engagedBy === 'ally')) dmg *= PLAYER.backMul; // đánh lén sau lưng / lúc nó đang đánh anh Đạt
  if (foe.state === 'dazed') dmg *= 1.5;
  if (foe.trap > 0) dmg *= 1.5;
  dmg = Math.round(dmg);
  foe.hp = Math.max(0, foe.hp - dmg);
  foe.alert = true;
  if (wpn.stun > 0 && by === 'player') foe.stun = Math.max(foe.stun, wpn.stun);
  if (foe.hp <= 0) { foe.state = 'ko'; foe.t = 0; return { dmg, blocked: false, ko: true }; }
  // khựng lại (không khựng khi boss đang lao tới)
  if (foe.state !== 'charge') { foe.state = 'stagger'; foe.t = 0; }
  return { dmg, blocked: false, ko: false };
}

// Đập lén: địch chưa phát hiện, mình ở sau lưng, sát bên → gục ngay (boss không đập lén được)
export const canTakedown = (foe, p) => foe.state !== 'ko' && foe.state !== 'wait' && !foe.alert && !foe.f.boss && dist(foe, p) < 1.8 && behind(foe, p);

// Địch có thấy người chơi không (trong tầm nhìn + góc nhìn, hoặc sát bên) — khác tầng (chênh cao > PLAYER.level) thì không
export function sees(foe, p) {
  if (foe.y != null && p.y != null && Math.abs(foe.y - p.y) > PLAYER.level) return false;
  const d = dist(foe, p), S = sightOf(foe);
  if (d < (p.loud ? PLAYER.hearRun : PLAYER.hear)) return true;
  return d < S.r && angDiff(foe.heading, headingTo(foe, p)) < S.half;
}

// Đòn của địch trúng người (người chơi / anh Đạt): đỡ (chuột phải) giảm phần lớn, mất 1 nấc đỡ; đang né → trượt
export function hitPlayer(pl, dmg, opts = {}) {
  if (pl.dodgeT > 0) return { dmg: 0, dodged: true };
  if (pl.blocking && pl.pips > 0 && !opts.unblockable) {
    pl.pips -= opts.breakGuard ? pl.pips : 1;
    pl.pipT = 0;
    const d = Math.round(dmg * (1 - PLAYER.blockCut));
    pl.hp = Math.max(0, pl.hp - d);
    return { dmg: d, blocked: true };
  }
  pl.hp = Math.max(0, pl.hp - dmg);
  return { dmg, blocked: false };
}

// Mỗi khung hình: AI 1 tên địch. ctx: { player, ally, dt, blocked(x,z) → đụng vật cản lúc lao, rage(foe) }
// Trả danh sách việc cho game làm: { type: 'move', … } không có — địch tự đổi x, z; các sự kiện: strike / charge / throw / alert / rage / dazed
export function foeTick(foe, ctx) {
  const { player: P, ally: A, dt } = ctx, ev = [];
  foe.moving = false;
  if (foe.state === 'ko' || foe.state === 'wait') return ev;
  foe.t += dt;
  foe.cd = Math.max(0, foe.cd - dt);
  foe.chargeCd = Math.max(0, foe.chargeCd - dt);
  if (foe.stun > 0) foe.stun = Math.max(0, foe.stun - dt);
  if (foe.trap > 0) { foe.trap = Math.max(0, foe.trap - dt); return ev; } // bị phao cứu sinh trùm: đứng giãy
  if (foe.stun > 0 && foe.state !== 'dazed') return ev;
  // chưa phát hiện: đi tuần / đứng gác, nhìn thấy người chơi thì la lên
  if (!foe.alert) {
    // ctx.los(foe, P): game kiểm tra có vật che giữa 2 người không (container, vách) — sát bên (nghe thấy) thì không cần
    const heard = dist(foe, P) < (P.loud ? PLAYER.hearRun : PLAYER.hear) && (foe.y == null || P.y == null || Math.abs(foe.y - P.y) <= PLAYER.level);
    if (sees(foe, P) && (heard || !ctx.los || ctx.los(foe, P))) { foe.alert = true; ev.push({ type: 'alert', foe }); }
    else if (foe.patrol?.length) {
      const g = foe.patrol[foe.pi % foe.patrol.length], d = Math.hypot(g[0] - foe.x, g[1] - foe.z);
      if (foe.state === 'look') { // đứng ở điểm tuần: (quay nhìn hướng đã định) + quét đèn, hết giờ dừng thì đi tiếp
        const at = foe.patrol[(foe.pi - 1 + foe.patrol.length) % foe.patrol.length];
        if (at?.[3] != null) foe.base = (at[3] * Math.PI) / 180;
        sweepTick(foe, dt, foe.t < 0.6 ? 3 : 0);
        if (foe.t > (at?.[2] ?? 2.2)) foe.state = 'patrol';
      } else if (d < 0.4) { foe.pi += 1; foe.t = 0; foe.state = 'look'; foe.base = foe.heading; foe.st = 0; }
      else { foe.state = 'patrol'; step(foe, g[0], g[1], foe.f.walk ?? 1.3, dt); }
      return ev;
    } else { if (foe.sweep) sweepTick(foe, dt, 0); return ev; } // đứng gác: quét đèn qua lại
  }
  // chọn người để đánh: thường là người chơi, anh Đạt đang đánh mình thì quay sang anh Đạt
  const tgt = A && A.hp > 0 && foe.engagedBy === 'ally' && !foe.f.boss && dist(foe, A) < dist(foe, P) + 1.5 ? A : P;
  foe.target = tgt === A ? 'ally' : 'player';
  const d = dist(foe, tgt), want = headingTo(foe, tgt);
  switch (foe.state) {
    case 'stagger': if (foe.t > 0.35) setState(foe, 'chase'); return ev;
    case 'recover': if (foe.t > (foe.f.recover ?? 1.0)) setState(foe, 'chase'); return ev;
    case 'dazed': if (foe.t > (foe.f.charge?.stun ?? 3)) setState(foe, 'chase'); return ev;
    case 'windup':
      turn(foe, want, dt, 4);
      if (foe.t >= foe.f.windup) {
        const hit = d <= foe.f.reach + 0.35 && angDiff(foe.heading, want) < 0.9;
        ev.push({ type: 'strike', foe, who: foe.target, hit, dmg: foe.f.dmg });
        foe.combo += 1;
        if (foe.f.combo && foe.combo < foe.f.combo) { foe.state = 'windup'; foe.t = foe.f.windup - 0.32; } // đánh liền 2 cú
        else { foe.combo = 0; setState(foe, 'recover'); foe.cd = foe.f.cd; }
      }
      return ev;
    case 'chargeWind': // boss lấy đà: đứng dậm chân, mặt nhìn người chơi
      turn(foe, headingTo(foe, P), dt, 6);
      if (foe.t >= (foe.f.charge?.wind ?? 1)) { setState(foe, 'charge'); foe.chargeLeft = foe.f.charge?.dist ?? 14; ev.push({ type: 'charge', foe }); }
      return ev;
    case 'charge': {
      const sp = foe.f.charge?.speed ?? 10, sx = Math.sin(foe.heading) * sp * dt, sz = Math.cos(foe.heading) * sp * dt;
      foe.x += sx; foe.z += sz; foe.chargeLeft -= sp * dt;
      if (dist(foe, P) < 1.1 && !foe.hitThisCharge) { foe.hitThisCharge = true; ev.push({ type: 'strike', foe, who: 'player', hit: true, dmg: foe.f.charge?.dmg ?? 25, breakGuard: true, knock: 3 }); }
      if (ctx.blocked?.(foe.x + sx * 2, foe.z + sz * 2)) { setState(foe, 'dazed'); foe.hitThisCharge = false; foe.chargeCd = foe.f.charge?.cd ?? 5; ev.push({ type: 'dazed', foe }); }
      else if (foe.chargeLeft <= 0) { setState(foe, 'recover'); foe.hitThisCharge = false; foe.chargeCd = foe.f.charge?.cd ?? 5; }
      return ev;
    }
    case 'throwWind':
      turn(foe, headingTo(foe, P), dt, 6);
      if (foe.t >= 0.7) { ev.push({ type: 'throw', foe, to: { x: P.x, z: P.z }, dmg: foe.f.throw?.dmg ?? 10 }); setState(foe, 'chase'); foe.throwT = 0; }
      return ev;
    default: break;
  }
  // nổi điên (boss còn nửa máu): gọi đàn em, bắt đầu ném đồ
  if (foe.f.rage && !foe.rage && foe.hp <= foe.max * foe.f.rage) { foe.rage = true; ev.push({ type: 'rage', foe }); }
  if (foe.rage && foe.f.throw) {
    foe.throwT += dt;
    if (foe.throwT > (foe.f.throw.every ?? 4) && d > 3) { setState(foe, 'throwWind'); return ev; }
  }
  // boss lao húc: đứng xa vừa phải, hết thời gian chờ → lấy đà
  if (foe.f.charge && foe.chargeCd <= 0 && d > 4 && d < 13) { setState(foe, 'chargeWind'); return ev; }
  if (d > foe.f.reach) {
    foe.state = 'chase';
    const g = ctx.route ? ctx.route(foe, tgt) : tgt;
    step(foe, g.x, g.z, foe.f.speed, dt, g === tgt ? d - foe.f.reach * 0.8 : Infinity);
  } else {
    turn(foe, want, dt, 5);
    if (foe.cd <= 0) setState(foe, 'windup');
    else foe.state = 'guard';
  }
  return ev;
}

// Anh Đạt (máy điều khiển): không có địch → đi theo người chơi; có → xông vào tên gần nhất, đánh mỗi ~1,3 giây
export function allyTick(A, foes, P, dt, route = null) {
  const ev = [];
  A.moving = false;
  if (A.hp <= 0) return ev;
  A.cd = Math.max(0, A.cd - dt);
  A.t = (A.t || 0) + dt;
  const live = foes.filter((f) => f.state !== 'ko' && f.state !== 'wait' && f.alert);
  // đánh tên đàn em trước, boss để sau (anh Đạt chỉ cầm chân boss)
  live.sort((a, b) => (a.f.boss ? 1 : 0) - (b.f.boss ? 1 : 0) || dist(A, a) - dist(A, b));
  const tgt = live[0];
  for (const f of foes) if (f.engagedBy === 'ally' && f !== tgt) f.engagedBy = null;
  if (!tgt) {
    A.state = 'follow';
    const d = dist(A, P);
    const g = route ? route(A, P) : P;
    if (d > 2.4) step(A, g.x, g.z, Math.min(ALLY.speed, 1.5 + d * 0.6), dt, g === P ? d - 2 : Infinity);
    return ev;
  }
  tgt.engagedBy = 'ally';
  const d = dist(A, tgt), want = headingTo(A, tgt);
  if (A.state === 'swing') {
    turn(A, want, dt, 6);
    if (A.t > 0.35) { A.state = 'fight'; if (d <= ALLY.reach + 0.5) ev.push({ type: 'allyHit', foe: tgt }); }
    return ev;
  }
  if (d > ALLY.reach) { A.state = 'run'; const g = route ? route(A, tgt) : tgt; step(A, g.x, g.z, ALLY.speed, dt, g === tgt ? d - ALLY.reach * 0.8 : Infinity); }
  else { A.state = 'fight'; turn(A, want, dt, 6); if (A.cd <= 0) { A.state = 'swing'; A.t = 0; A.cd = ALLY.cd; } }
  return ev;
}

// Người chơi mỗi khung hình: hồi nấc đỡ, đếm thời gian chờ vung / né
export function playerTick(pl, dt) {
  pl.cd = Math.max(0, pl.cd - dt);
  pl.dodgeT = Math.max(0, pl.dodgeT - dt);
  pl.dodgeCd = Math.max(0, pl.dodgeCd - dt);
  pl.pipT = (pl.pipT || 0) + dt;
  if (pl.pips < pl.maxPips && pl.pipT > PLAYER.pipRegen && !pl.blocking) { pl.pips += 1; pl.pipT = PLAYER.pipRegen - 1; } // ngừng đỡ ~3 giây: hồi từng nấc
}

// Đường đi vòng (lưới nav của bản đồ, toạ độ thế giới): đi thẳng được thì đi thẳng; không thì tìm đường ngắn nhất qua các điểm.
// clear(a, b): đoạn a → b không vướng vật cản. Trả điểm kế tiếp cần đi tới
export function navNext(nav, from, to, clear) {
  if (!nav || clear(from, to)) return to;
  const N = nav.nodes, n = N.length, P = (i) => ({ x: N[i][0], z: N[i][1] });
  const adj = Array.from({ length: n }, () => []);
  for (const [i, j] of nav.edges) { const d = dist(P(i), P(j)); adj[i].push([j, d]); adj[j].push([i, d]); }
  // điểm vào / ra: gần nhất mà nhìn thẳng tới được
  const pick = (p) => { let b = -1, bd = Infinity; for (let i = 0; i < n; i++) { const d = dist(p, P(i)); if (d < bd && clear(p, P(i))) { bd = d; b = i; } } return b; };
  const s = pick(from), t = pick(to);
  if (s < 0 || t < 0) return to;
  const D = Array(n).fill(Infinity), prev = Array(n).fill(-1), done = Array(n).fill(false);
  D[s] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || D[i] < D[u])) u = i;
    if (u < 0 || D[u] === Infinity || u === t) break;
    done[u] = true;
    for (const [v, w] of adj[u]) if (D[u] + w < D[v]) { D[v] = D[u] + w; prev[v] = u; }
  }
  if (D[t] === Infinity) return to;
  // đi theo đường: bỏ qua các điểm đầu đã nhìn thẳng tới được điểm sau
  const path = [];
  for (let u = t; u >= 0; u = prev[u]) path.unshift(u);
  let k = 0;
  while (k + 1 < path.length && clear(from, P(path[k + 1]))) k += 1;
  const p = P(path[k]);
  return dist(from, p) < 0.5 && k + 1 < path.length ? P(path[k + 1]) : p;
}

function setState(o, s) { o.state = s; o.t = 0; }
// Quét đèn: hướng nhìn lắc qua lại quanh hướng gốc (base) ±sweep, chu kỳ sweepT giây · turnFirst: đang quay về hướng gốc (vừa tới điểm tuần)
function sweepTick(o, dt, turnFirst = 0) {
  o.st = (o.st || 0) + dt;
  const want = o.base + (o.sweep ? Math.sin((o.st / o.sweepT) * Math.PI * 2) * o.sweep : 0);
  turn(o, want, dt, turnFirst || 4);
}
function turn(o, want, dt, rate) { o.heading += Math.atan2(Math.sin(want - o.heading), Math.cos(want - o.heading)) * Math.min(1, dt * rate); }
// đi tới (x, z) với tốc độ sp, dừng khi còn cách `stopAt`
function step(o, x, z, sp, dt, left = Infinity) {
  const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz) || 1, m = Math.min(sp * dt, Math.max(0, left));
  o.x += (dx / d) * m;
  o.z += (dz / d) * m;
  turn(o, Math.atan2(dx, dz), dt, 8);
  o.moving = m > 0.001;
}
