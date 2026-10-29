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
// Đòn đánh (chỉ khác dáng ra đòn — sát thương / thời gian như nhau): kiểu địch đánh lần lượt theo danh sách "moves" trong dữ liệu
// (không có: cầm đồ → bổ / quét · tay không → đấm thẳng / đấm móc). Anh Đạt: ALLY.moves
export const MOVES = ['jab', 'cross', 'hook', 'upper', 'over', 'side'];
export const movesOf = (f) => (f.moves?.length ? f.moves : f.weapon ? ['over', 'side'] : ['jab', 'cross', 'hook']);
const nextMove = (o, list) => (o.move = list[(o.n = (o.n ?? -1) + 1) % list.length]);
// ---------- ĐỒ SHIPPER (chương 6: túi giao hàng = kho đạn, không còn tay không đánh) ----------
// Túi (gs.story.kit): { n: { mã: số còn }, order: [mã theo thứ tự ô 1–0], sel: mã đang cầm }. Món "keep" (nón, kèn) không mất khi dùng.
// Tác dụng lên địch (dữ liệu weapons.<mã>, giây): stun choáng · trap trùm đầu (bao ni lông) · blind lóa mắt (trà sữa) · spicy cay chạy vòng (tương ớt)
// · fall ngã (gói COD) · slip { r, t } vũng trơn chỗ rơi (đá viên, trân châu) · horn { r, startle, cd } bóp kèn: địch quanh r m đang lấy đà thì giật mình khựng.
// Kiểu địch có ccMul (boss: tác dụng ngắn hơn). Cùng dữ liệu + cùng thao tác → cùng kết quả.
export const CC_KEYS = ['trap', 'blind', 'spicy', 'fall'];
// Đang lóe đỏ / lấy đà / ra đòn (boss bật foe.tele; đàn em đang giơ tay) → ném trúng lúc này = "ĐÚNG LÚC!": sát thương + tác dụng ×2
const TELE_STATES = ['windup', 'chargeWind', 'charge', 'throwWind', 'superWind', 'fly', 'clinchWind', 'slam', 'teep', 'stomp'];
export const telegraphing = (foe) => foe.state !== 'ko' && foe.state !== 'roar' && (!!foe.tele || TELE_STATES.includes(foe.state));
export function timedItem(w) {
  const o = { ...w, dmg: (w.dmg || 0) * 2 };
  for (const k of [...CC_KEYS, 'stun']) if (w[k]) o[k] = w[k] * 2;
  return o;
}
export const kitNew = () => ({ n: {}, order: [], sel: null });
export function kitGive(kit, items) {
  for (const [id, c] of Object.entries(items || {})) {
    kit.n[id] = (kit.n[id] || 0) + c;
    if (!kit.order.includes(id)) kit.order.push(id);
  }
  if (!kitHas(kit, kit.sel)) kit.sel = kit.order.find((id) => kitHas(kit, id)) || null;
  return kit;
}
export const kitHas = (kit, id) => !!id && (kit?.n?.[id] || 0) > 0;
// dùng 1 món (ném / ăn): trả true nếu có · hết món đang cầm → tự cầm món kế (theo thứ tự ô)
export function kitTake(kit, id) {
  if (!kitHas(kit, id)) return false;
  kit.n[id] -= 1;
  if (!kitHas(kit, kit.sel)) kitNext(kit, 1);
  return true;
}
// đổi món: dir = +1 / -1 (lăn chuột) · bỏ qua ô đã hết
export function kitNext(kit, dir = 1) {
  const L = kit.order.filter((id) => kitHas(kit, id));
  if (!L.length) { kit.sel = null; return null; }
  const i = L.indexOf(kit.sel);
  kit.sel = L[(i < 0 ? 0 : i + dir + L.length) % L.length];
  return kit.sel;
}
// Món trúng địch (không bị đỡ): gắn tác dụng (nhân ccMul của kiểu địch) · boss đang ra đòn thì bỏ đòn đó. Trả mã tác dụng đã gắn (để game vẽ)
export function applyItem(foe, wpn) {
  if (foe.state === 'ko' || foe.state === 'roar') return [];
  const k = foe.f.ccMul ?? 1, out = [];
  for (const c of CC_KEYS) if (wpn[c] > 0) { foe[c] = Math.max(foe[c] || 0, wpn[c] * k); out.push(c); }
  if (out.length) {
    foe.alert = true;
    if (foe.state === 'charge' || foe.state === 'fly') foe.hitThisCharge = true; // đang lao / bay: không trúng mình nữa
    if (foe.f.phases?.length) { setState(foe, 'recover'); foe.recT = 0.2; foe.li += 1; foe.combo = 0; } // boss: bỏ đòn đang ra
    else if (foe.state !== 'ko') setState(foe, 'chase');
  }
  return out;
}
// Bóp kèn: địch trong r m đang lấy đà / ra đòn → giật mình khựng (bỏ đòn đó). Trả danh sách tên bị giật mình
const STARTLE = ['windup', 'chargeWind', 'charge', 'teep', 'slam', 'stomp', 'superWind', 'fly', 'throwWind', 'clinchWind'];
export function hornBlast(foes, at, H) {
  const out = [];
  for (const f of foes) {
    if (f.state === 'ko' || f.state === 'wait' || f.state === 'roar' || dist(f, at) > (H.r ?? 4)) continue;
    f.alert = true;
    if (!STARTLE.includes(f.state)) continue;
    out.push(f);
    f.hitThisCharge = true;
    if (f.f.phases?.length) { setState(f, 'recover'); f.recT = (H.startle ?? 1) * (f.f.ccMul ?? 1); f.li += 1; f.combo = 0; }
    else { setState(f, 'stagger'); f.t = 0.35 - (H.startle ?? 1); f.combo = 0; } // khựng (stagger hết sau 0,35 giây → đếm lùi)
  }
  return out; // những tên bị giật mình
}
// Đạp lên vũng trơn (đá viên / trân châu): đang lao húc / bay → ngã sấp lâu · đang chạy → trượt khựng. Mỗi vũng 1 lần / tên
export function slipFoe(foe, puddle) {
  if (foe.state === 'ko' || foe.state === 'wait' || foe.state === 'roar' || (foe.fall || 0) > 0) return null;
  puddle.hit ||= new Set();
  if (puddle.hit.has(foe)) return null;
  const k = foe.f.ccMul ?? 1;
  if (foe.state === 'charge' || foe.state === 'fly') { puddle.hit.add(foe); foe.hitThisCharge = true; foe.fall = (puddle.fall ?? 2.5) * Math.max(k, 0.8); if (foe.f.phases?.length) { setState(foe, 'recover'); foe.recT = 0.2; foe.li += 1; } else setState(foe, 'chase'); return 'fall'; }
  if (foe.moving) { puddle.hit.add(foe); foe.fall = 0.6; return 'slip'; }
  return null;
}
// Đang dính tác dụng (trùm / lóa / cay / ngã): đứng giãy, không đánh — game vẽ dáng theo foe.cc. Trả true = bỏ qua AI khung này
function ccTick(foe, dt) {
  foe.cc = null;
  for (const c of CC_KEYS) if (foe[c] > 0) { foe[c] = Math.max(0, foe[c] - dt); if (!foe.cc) foe.cc = c; }
  if (foe.cc === 'spicy') { foe.heading += dt * 5; const sp = 1.6 * dt; foe.x += Math.sin(foe.heading) * sp; foe.z += Math.cos(foe.heading) * sp; foe.moving = true; } // cay: ôm mặt chạy vòng
  return !!foe.cc;
}
export const ALLY = { hp: 120, dmg: 16, cd: 2.1, speed: 4.4, reach: 1.7, takeMul: 0.6, bossMul: 0.3, moves: ['jab', 'cross', 'hook', 'upper'] };

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
    sweep: def.sweep ? (def.sweep * Math.PI) / 180 : 0, sweepT: def.sweepT || 6, base: pos.heading ?? 0, st: (idx * 1.7) % 6, sight: def.sight ?? null,
    watch: !!def.watch, // chờ vào trận mà vẫn đứng xem (hò hét) — không ẩn
    ph: 0, li: 0, recT: 0, spam: 0, spamT: 0, farT: 0, cl: null, second: false }; // boss nhiều giai đoạn: giai đoạn · bước trong vòng đòn · …
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
  const PH = phaseOf(foe);
  if (PH && foe.state === 'roar') return { dmg: 0, blocked: false, ko: false }; // đang gầm đổi giai đoạn: không trúng
  const back = behind(foe, att);
  // boss tự đỡ: đánh trước mặt lúc nó không sơ hở (đang vung / vừa vung hụt / choáng / bị trùm phao) → đỡ hết
  // (boss nhiều giai đoạn: đỡ hay không theo từng giai đoạn; chỉ đỡ lúc đang đi / thủ — đang ra đòn, khựng là sơ hở)
  const open = PH ? bossOpen(foe) : foe.state === 'windup' || foe.state === 'recover' || foe.state === 'dazed' || foe.stun > 0 || !!foe.cc;
  if ((PH ? PH.guard : foe.f.guard) && !back && !open && by === 'player') {
    if (PH) { foe.spam += 1; foe.spamT = 0; } // đấm liền vào thế đỡ (giai đoạn có "ôm cổ": đủ số cú thì bị ôm)
    if (wpn.stun > 0) { foe.stun = wpn.stun; foe.state = 'recover'; foe.t = 0; foe.recT = wpn.stun; } // chảo / gạch phá thế đỡ
    return { dmg: 0, blocked: true, ko: false };
  }
  let dmg = by === 'ally' ? ALLY.dmg * (foe.f.boss ? ALLY.bossMul : 1) : wpn.dmg;
  if (by === 'player' && (back || foe.engagedBy === 'ally')) dmg *= PLAYER.backMul; // đánh lén sau lưng / lúc nó đang đánh anh Đạt
  if (foe.state === 'dazed') dmg *= 1.5;
  if (foe.state === 'parried') dmg *= 2; // vừa bị gạt superman: loạng choạng
  if (foe.cc) dmg *= 1.5; // đang bị trùm / lóa / cay / ngã: trúng đau hơn
  const before = foe.hp;
  foe.hp = Math.max(0, foe.hp - Math.round(dmg));
  if (PH) { const a = nextAt(foe); if (a != null) foe.hp = Math.max(foe.hp, a); } // dừng ở mốc giai đoạn sau — không đánh vọt qua giai đoạn
  dmg = before - foe.hp;
  foe.alert = true;
  if (wpn.stun > 0 && by === 'player') foe.stun = Math.max(foe.stun, wpn.stun);
  if (foe.hp <= 0) { foe.state = 'ko'; foe.t = 0; return { dmg, blocked: false, ko: true }; }
  if (PH) return { dmg, blocked: false, ko: false }; // boss nhiều giai đoạn không khựng khi trúng đòn: vòng đòn chạy đúng nhịp
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
  if (foe.f.phases?.length && foe.state !== 'wait') return bossTick(foe, ctx);
  const { player: P, ally: A, dt } = ctx, ev = [];
  foe.moving = false;
  if (foe.state === 'ko' || foe.state === 'wait') return ev;
  foe.t += dt;
  if (foe.state === 'flee') { // đàn em bỏ chạy (boss vào giai đoạn cuối, đánh tay đôi): chạy ra xa người chơi rồi biến mất
    const a = headingTo(P, foe);
    step(foe, foe.x + Math.sin(a) * 5, foe.z + Math.cos(a) * 5, foe.f.speed, dt);
    if (foe.t > 3) { foe.state = 'ko'; foe.gone = true; }
    return ev;
  }
  foe.cd = Math.max(0, foe.cd - dt);
  foe.chargeCd = Math.max(0, foe.chargeCd - dt);
  if (foe.stun > 0) foe.stun = Math.max(0, foe.stun - dt);
  if (ccTick(foe, dt)) return ev; // trùm bao / lóa mắt / cay / ngã: đứng giãy, không đánh
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
        ev.push({ type: 'strike', foe, who: foe.target, hit, dmg: foe.f.dmg, move: foe.move });
        foe.combo += 1;
        if (foe.f.combo && foe.combo < foe.f.combo) { foe.state = 'windup'; foe.t = foe.f.windup - 0.32; nextMove(foe, movesOf(foe.f)); } // đánh liền 2 cú (đòn kế tiếp)
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
    if (foe.cd <= 0) { setState(foe, 'windup'); nextMove(foe, movesOf(foe.f)); }
    else foe.state = 'guard';
  }
  return ev;
}

// =============================================================
// BOSS NHIỀU GIAI ĐOẠN (Tí Đô — dữ liệu foes.<id>.phases): mỗi giai đoạn 1 VÒNG ĐÒN CỐ ĐỊNH (loop), lặp đúng thứ tự, không bốc ngẫu nhiên
// → chơi vài lần là thuộc. Cùng dữ liệu + cùng thao tác thì ra cùng kết quả (chơi nhiều người: máy chủ chạy y hệt để kiểm tra).
// Đòn nào lấy đà cũng bật foe.tele → game vẽ lóe đỏ (1 màu cho mọi cảnh báo); đòn nào thì nhìn DÁNG.
// Máu chạm mốc giai đoạn sau → dừng ở mốc (không đánh vọt qua), gầm lên (không trúng đòn) rồi chạy vòng đòn mới từ bước 1.
// Đòn theo điều kiện (không nằm trong vòng): ném gạch (đứng xa quá lâu) · ôm cổ (đấm liền vào thế đỡ) — chỉ phạt lối chơi sai.
// =============================================================
export const BOSS_STEPS = ['combo', 'teep', 'charge', 'charge2', 'slam', 'stompSuper', 'stompFeint'];
// số mặc định từng đòn (dữ liệu foes.<id>.skills.<đòn> ghi đè; húc dùng foes.<id>.charge, ném gạch dùng foes.<id>.throw)
export const SKILL_DEFAULT = {
  combo: { wind: 0.8, hits: 2, rec: 1.5 }, // lấy đà → đấm liền "hits" cú (dáng theo moves) → khựng rec giây
  teep: { wind: 0.6, range: 2, dmg: 8, push: 2, wallStun: 1, miss: 1 }, // đạp đẩy: chỉ khi đứng gần ≤ range m · đập lưng vật cản: choáng wallStun · né: nó khựng miss
  charge2: { wind: 0.6 }, // húc lần 2 (ngay sau lần 1): lấy đà ngắn hơn
  slam: { wind: 0.8, dmg: 30, reach: 2.2, rec: 1.2 }, // bổ 2 tay qua đầu: không đỡ được, phải né
  stomp: { wind: 0.6, r: 3, dmg: 12, push: 2.5, wave: 0.4 }, // dậm đất: vòng sóng loang ra r m trong wave giây, không đỡ được
  superman: { wind: 0.6, dist: 6, speed: 14, dmg: 20, parry: 0.35, stagger: 1.5, land: 0.8, feint: 0.5 }, // bay đấm · đỡ đúng lúc (bấm đỡ ≤ parry giây trước khi trúng) → loạng choạng
  clinch: { hits: 4, mash: 6, time: 2, dmg: 8, knees: 3, rec: 1.5 }, // đấm liền "hits" cú vào thế đỡ → ôm cổ · bấm "mash" lần trong "time" giây để thoát
  throw: { far: 7, after: 2, dmg: 10 }, // đứng xa > far m quá after giây → ném gạch
  roar: { t: 1.6 }, // gầm lúc đổi giai đoạn
};
export const skillOf = (f, id) => ({ ...SKILL_DEFAULT[id], ...(id === 'throw' ? f.throw : f.skills?.[id]) });
export const phaseOf = (foe) => (foe.f.phases?.length ? foe.f.phases[foe.ph] || null : null);
export const bossStep = (foe) => { const L = phaseOf(foe)?.loop || []; return L.length ? L[foe.li % L.length] : null; };
// boss nhiều giai đoạn: chỉ đỡ được lúc đang đi / thủ; đang ra đòn, khựng, choáng = sơ hở
export const bossOpen = (foe) => !['chase', 'guard', 'roar'].includes(foe.state) || foe.stun > 0 || !!foe.cc;
// máu ở mốc giai đoạn kế (null: đang giai đoạn cuối)
const nextAt = (foe) => { const n = foe.f.phases?.[foe.ph + 1]; return n ? Math.ceil(foe.max * n.at) : null; };

// Thua giữa trận → chơi lại từ giai đoạn n: máu ở đầu giai đoạn đó, vòng đòn từ bước 1
export function bossPhaseSet(foe, n) {
  foe.ph = Math.max(0, Math.min(n, foe.f.phases.length - 1));
  foe.li = 0;
  foe.hp = Math.min(foe.max, Math.ceil(foe.max * foe.f.phases[foe.ph].at));
  setState(foe, 'chase');
}
// Đang bị ôm cổ: người chơi bấm 1 lần để giãy. Trả số lần đã bấm (null: không bị ôm / đã bắt đầu lên gối)
export function bossMash(foe) {
  if (foe.state !== 'clinch' || foe.cl.knee > 0) return null;
  foe.cl.n += 1;
  return foe.cl.n;
}

export function bossTick(foe, ctx) {
  const { player: P, dt } = ctx, ev = [], f = foe.f, C = f.charge || {};
  foe.moving = false;
  foe.tele = false;
  if (foe.state === 'ko') return ev;
  foe.t += dt;
  foe.alert = true;
  if (foe.stun > 0) foe.stun = Math.max(0, foe.stun - dt);
  if (ccTick(foe, dt)) return ev; // trùm bao / lóa mắt / cay / ngã
  if ((foe.spamT += dt) > 3) foe.spam = 0; // 3 giây không đấm vào thế đỡ: đếm lại
  // chạm mốc → sang giai đoạn sau
  const at = nextAt(foe);
  if (at != null && foe.hp <= at && foe.state !== 'roar') {
    if (foe.state === 'clinch') ev.push({ type: 'clinch', foe, on: false });
    foe.ph += 1;
    foe.li = 0;
    foe.second = false;
    foe.spam = 0;
    setState(foe, 'roar');
    ev.push({ type: 'phase', foe, n: foe.ph });
    return ev;
  }
  if (foe.stun > 0 && foe.state !== 'dazed') return ev; // chảo / gạch: khựng
  const ph = phaseOf(foe), d = dist(foe, P), want = headingTo(foe, P);
  // xong 1 bước của vòng đòn: khựng rec giây (đây là cửa đánh) rồi sang bước kế
  const done = (rec, s = 'recover') => { setState(foe, s); foe.recT = rec; foe.li += 1; foe.second = false; };
  const strike = (o) => ev.push({ type: 'strike', foe, who: 'player', hit: true, ...o });
  switch (foe.state) {
    case 'roar': if (foe.t >= skillOf(f, 'roar').t) setState(foe, 'chase'); return ev;
    case 'recover': case 'dazed': case 'parried': if (foe.t >= (foe.recT ?? 1)) setState(foe, 'chase'); return ev;
    case 'windup': { // combo: đấm liền hits cú
      const S = skillOf(f, 'combo');
      turn(foe, want, dt, 4);
      if (foe.t >= S.wind) {
        strike({ hit: d <= f.reach + 0.35 && angDiff(foe.heading, want) < 0.9, dmg: f.dmg, move: foe.move });
        if ((foe.combo += 1) < S.hits) { foe.t = S.wind - 0.32; nextMove(foe, movesOf(f)); } // cú kế ngay sau
        else { foe.combo = 0; done(S.rec); }
      }
      return ev;
    }
    case 'teep': { // nhấc gối lấy đà → đạp thẳng bụng
      const S = skillOf(f, 'teep');
      if (foe.t < S.wind) { foe.tele = true; turn(foe, want, dt, 6); return ev; }
      if (!foe.kicked) {
        foe.kicked = true;
        foe.missed = !(d <= S.range + 0.6 && angDiff(foe.heading, want) < 0.9 && !(P.dodgeT > 0));
        if (!foe.missed) strike({ dmg: S.dmg, move: 'teep', knock: S.push, wallStun: S.wallStun });
      }
      if (foe.t >= S.wind + 0.3) { const miss = foe.missed; foe.kicked = foe.missed = false; done(miss ? S.miss : 0.4); }
      return ev;
    }
    case 'chargeWind': // dậm chân lấy đà (game vẽ vệt đỏ đường húc)
      foe.tele = true;
      turn(foe, want, dt, 6);
      if (foe.t >= (foe.second ? skillOf(f, 'charge2').wind : C.wind ?? 1)) { setState(foe, 'charge'); foe.chargeLeft = C.dist ?? 14; foe.hitThisCharge = false; ev.push({ type: 'charge', foe }); }
      return ev;
    case 'charge': {
      const sp = C.speed ?? 10, sx = Math.sin(foe.heading) * sp * dt, sz = Math.cos(foe.heading) * sp * dt;
      foe.x += sx; foe.z += sz; foe.chargeLeft -= sp * dt; foe.moving = true;
      if (dist(foe, P) < 1.1 && !foe.hitThisCharge) { foe.hitThisCharge = true; strike({ dmg: C.dmg ?? 25, breakGuard: true, knock: 3, move: 'charge' }); }
      if (ctx.blocked?.(foe.x + sx * 2, foe.z + sz * 2)) { done(C.stun ?? 3, 'dazed'); ev.push({ type: 'dazed', foe }); } // đâm container: choáng
      else if (foe.chargeLeft <= 0) {
        if (bossStep(foe) === 'charge2' && !foe.second) { setState(foe, 'chargeWind'); foe.second = true; } // quay lại húc lần 2 ngay
        else done(1.0);
      }
      return ev;
    }
    case 'slam': { // giơ 2 tay qua đầu → bổ xuống
      const S = skillOf(f, 'slam');
      if (foe.t < S.wind) { foe.tele = true; turn(foe, want, dt, 3); return ev; }
      strike({ hit: d <= S.reach + 0.3 && angDiff(foe.heading, want) < 1.0, dmg: S.dmg, unblockable: true, move: 'slam' });
      done(S.rec);
      return ev;
    }
    case 'stomp': { // nhấc chân → dậm xuống: vòng sóng
      if (foe.t < skillOf(f, 'stomp').wind) { foe.tele = true; turn(foe, want, dt, 4); return ev; }
      setState(foe, 'wave');
      foe.waveHit = false;
      ev.push({ type: 'stomp', foe, r: skillOf(f, 'stomp').r });
      return ev;
    }
    case 'wave': { // sóng loang dần ra: tới chỗ mình đứng (trong vòng) mới trúng
      const S = skillOf(f, 'stomp'), R = S.r * Math.min(1, foe.t / S.wave);
      if (!foe.waveHit && d < S.r && d <= R + 0.3) { foe.waveHit = true; if (!(P.dodgeT > 0)) strike({ dmg: S.dmg, unblockable: true, knock: S.push, from: { x: foe.x, z: foe.z }, move: 'stomp' }); }
      if (foe.t >= S.wave) setState(foe, 'superWind');
      return ev;
    }
    case 'superWind': { // nhún lùi kéo tay ra sau (bước "Nhử": lấy đà xong khựng thêm feint giây rồi mới bay)
      const S = skillOf(f, 'superman'), feint = bossStep(foe) === 'stompFeint';
      foe.tele = foe.t < S.wind;
      foe.feint = feint && foe.t >= S.wind;
      turn(foe, want, dt, 7);
      if (foe.t >= S.wind + (feint ? S.feint : 0)) { setState(foe, 'fly'); foe.flyLeft = S.dist; foe.hitThisCharge = false; foe.feint = false; ev.push({ type: 'leap', foe }); }
      return ev;
    }
    case 'fly': { // bay tới đấm thẳng
      const S = skillOf(f, 'superman'), sx = Math.sin(foe.heading) * S.speed * dt, sz = Math.cos(foe.heading) * S.speed * dt;
      foe.moving = true;
      if (dist(foe, P) < 1.2) {
        // đỡ đúng lúc (mới bấm đỡ ≤ parry giây) → gạt được, nó loạng choạng · đỡ sớm: đỡ được nhưng mất hết nấc đỡ · né: trượt
        if (P.blocking && P.pips > 0 && (P.blockT ?? 99) <= S.parry && !(P.dodgeT > 0)) { done(S.stagger, 'parried'); ev.push({ type: 'parried', foe }); }
        else { strike({ dmg: S.dmg, breakGuard: true, move: 'superman' }); done(S.land); }
        return ev;
      }
      if (ctx.blocked?.(foe.x + sx * 2, foe.z + sz * 2) || (foe.flyLeft -= S.speed * dt) <= 0) { done(S.land); return ev; }
      foe.x += sx; foe.z += sz;
      return ev;
    }
    case 'clinchWind': // lóe đỏ → chụp cổ
      foe.tele = true;
      turn(foe, want, dt, 8);
      if (foe.t >= 0.3) {
        if (d < 1.8) { setState(foe, 'clinch'); foe.cl = { n: 0, knee: 0 }; ev.push({ type: 'clinch', foe, on: true }); }
        else { setState(foe, 'recover'); foe.recT = 0.6; }
      }
      return ev;
    case 'clinch': { // ôm cổ: bấm đủ số lần thì thoát (nó khựng) · hết giờ: lên gối từng cú rồi buông
      const S = skillOf(f, 'clinch'), cl = foe.cl;
      if (cl.n >= S.mash) { ev.push({ type: 'clinch', foe, on: false, free: true }); setState(foe, 'recover'); foe.recT = S.rec; return ev; }
      if (foe.t >= S.time + 0.4 * S.knees) { ev.push({ type: 'clinch', foe, on: false }); setState(foe, 'recover'); foe.recT = 1; }
      else if (foe.t >= S.time + 0.4 * cl.knee) { cl.knee += 1; strike({ dmg: S.dmg, unblockable: true, move: 'knee' }); }
      return ev;
    }
    case 'throwWind': // vác gạch
      foe.tele = true;
      turn(foe, want, dt, 6);
      if (foe.t >= 0.7) { ev.push({ type: 'throw', foe, to: { x: P.x, z: P.z }, dmg: skillOf(f, 'throw').dmg }); setState(foe, 'chase'); }
      return ev;
    default: break;
  }
  // ---- đòn theo điều kiện (giai đoạn có bật) ----
  if (ph.throw) {
    const S = skillOf(f, 'throw');
    foe.farT = d > S.far ? foe.farT + dt : 0;
    if (foe.farT >= S.after) { foe.farT = 0; setState(foe, 'throwWind'); return ev; }
  }
  if (ph.clinch && foe.spam >= skillOf(f, 'clinch').hits && d < 1.8) { foe.spam = 0; setState(foe, 'clinchWind'); return ev; }
  // ---- bước kế trong vòng đòn ----
  const near = (r) => { // tới gần trong r m (chưa tới: đuổi theo)
    if (d <= r) { turn(foe, want, dt, 5); foe.state = 'guard'; return true; }
    foe.state = 'chase';
    const g = ctx.route ? ctx.route(foe, P) : P;
    step(foe, g.x, g.z, f.speed, dt, g === P ? d - r * 0.8 : Infinity);
    return false;
  };
  switch (bossStep(foe)) {
    case 'combo': if (near(f.reach)) { setState(foe, 'windup'); foe.combo = 0; foe.n = -1; nextMove(foe, movesOf(f)); } break; // combo nào cũng bắt đầu từ đòn đầu danh sách
    case 'teep': if (d > skillOf(f, 'teep').range + 0.3) foe.li += 1; else setState(foe, 'teep'); break; // đứng xa: bỏ qua bước này
    case 'charge': case 'charge2': foe.second = false; setState(foe, 'chargeWind'); break;
    case 'slam': if (near(skillOf(f, 'slam').reach - 0.4)) setState(foe, 'slam'); break;
    case 'stompSuper': case 'stompFeint': if (near(2)) setState(foe, 'stomp'); break;
    default: foe.li += 1;
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
    if (d > 2.4) step(A, g.x, g.z, d > 8 ? ALLY.speed * 1.6 : Math.min(ALLY.speed, 1.5 + d * 0.6), dt, g === P ? d - 2 : Infinity); // bị bỏ xa > 8 m: chạy nhanh đuổi kịp
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
  else { A.state = 'fight'; turn(A, want, dt, 6); if (A.cd <= 0) { A.state = 'swing'; A.t = 0; A.cd = ALLY.cd; nextMove(A, ALLY.moves); } }
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
