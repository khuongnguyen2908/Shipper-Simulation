// =============================================================
// QUẢN LÝ CHƯỚNG NGẠI MÔI TRƯỜNG (HazardManager)
// Lập lịch theo seed cho cả ngày: mưa, chốt CSGT, kẹt xe giờ cao điểm, ổ gà.
// Chó băng qua đường do phần thế giới 3D kích hoạt (cần vị trí xe).
// =============================================================
import { HAZARD, TIME } from '../data/balance.js';
import { MAIN_ROADS } from '../data/places.js';
import { CITY, roadPos, intersectionName, segmentName, neighbors, isWaterSeg } from './cityLayout.js';
import { fmt } from '../content/index.js';

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

export class HazardManager {
  constructor(rng) {
    this.rng = rng;
    // Mưa: chiều nào cũng có cơn giông, sáng có thể mưa phùn
    this.rain = [];
    if (rng.chance(HAZARD.drizzleChance)) {
      const s = rng.range(...HAZARD.drizzleStart);
      this.rain.push({ start: s, end: s + rng.range(...HAZARD.drizzleLen), heavy: false });
    }
    const st = rng.range(...HAZARD.stormStart);
    this.rain.push({ start: st, end: st + rng.range(...HAZARD.stormLen), heavy: true });

    // Chốt CSGT ở các ngã tư bên trong
    this.police = [];
    let t = HAZARD.policeFirst + rng.range(-30, 30);
    let id = 0;
    while (t < TIME.dayEnd - 40) {
      const len = rng.range(...HAZARD.policeLen);
      // chốt ở ngã tư bên trong có ≥ 3 ngả đường (không đặt trên cầu, mặt sông, đường cụt)
      let node = [rng.int(1, CITY.N - 1), rng.int(1, CITY.N - 1)];
      for (let k = 0; k < 40 && neighbors(...node).length < 3; k++) node = [rng.int(1, CITY.N - 1), rng.int(1, CITY.N - 1)];
      this.police.push({ id: `p${id++}`, start: t, end: t + len, node, reported: rng.chance(HAZARD.policeReportChance), name: intersectionName(...node) });
      t += len + rng.range(...HAZARD.policeGap);
    }

    // Kẹt xe giờ cao điểm trên đường chính
    const allSegs = [];
    for (const r of MAIN_ROADS) for (let f = 0; f < CITY.N; f++) if (!isWaterSeg(r.axis, r.line, f)) allSegs.push({ axis: r.axis, line: r.line, from: f });
    this.jams = HAZARD.rush.map(([s, e], k) => ({
      id: `j${k}`,
      start: s + rng.range(-15, 15),
      end: e + rng.range(-15, 15),
      segments: rng.shuffle(allSegs).slice(0, HAZARD.jamSegments),
    }));

    this.potholes = makePotholes(rng);
    this._active = new Set();
  }

  rainAt(min) {
    return this.rain.find((r) => min >= r.start && min < r.end) || null;
  }
  isRaining(min) {
    return !!this.rainAt(min);
  }
  activePolice(min) {
    return this.police.filter((p) => min >= p.start && min < p.end);
  }
  activeJams(min) {
    return this.jams.filter((j) => min >= j.start && min < j.end).flatMap((j) => j.segments);
  }
  isHarshSun(min) {
    return min >= TIME.sunHarsh[0] && min < TIME.sunHarsh[1] && !this.isRaining(min);
  }
  // Độ nắng 0..1
  sun(min) {
    if (this.isRaining(min)) return 0;
    if (this.isHarshSun(min)) return 1;
    const h = min / 60;
    return h >= 7 && h < 17.5 ? 0.5 : 0;
  }
  ambient(min) {
    const A = HAZARD.ambient;
    if (this.isRaining(min)) return A.rain;
    if (this.isHarshSun(min)) return A.harsh;
    const h = min / 60;
    return h < 9 || h > 19 ? A.night : A.morning;
  }

  forecastText() {
    const parts = this.rain.map((r) => fmt(r.heavy ? 'forecast.heavy' : 'forecast.light', { from: hhmm(r.start), to: hhmm(r.end) }));
    return fmt('forecast.text', { rains: parts.join(', ') });
  }

  // Gọi mỗi khung hình: trả về các sự kiện bắt đầu/kết thúc để báo cho người chơi
  poll(min) {
    const events = [];
    const now = new Set();
    const r = this.rainAt(min);
    if (r) now.add('rain');
    for (const p of this.activePolice(min)) now.add(p.id);
    for (const j of this.jams) if (min >= j.start && min < j.end) now.add(j.id);
    for (const k of now) {
      if (this._active.has(k)) continue;
      if (k === 'rain') events.push({ type: 'rainStart', heavy: r.heavy });
      else if (k.startsWith('p')) events.push({ type: 'policeStart', police: this.police.find((p) => p.id === k) });
      else if (k.startsWith('j')) {
        const j = this.jams.find((x) => x.id === k);
        events.push({ type: 'jamStart', jam: j, names: [...new Set(j.segments.map(segmentName))] });
      }
    }
    for (const k of this._active) {
      if (now.has(k)) continue;
      if (k === 'rain') events.push({ type: 'rainEnd' });
      else if (k.startsWith('p')) events.push({ type: 'policeEnd', police: this.police.find((p) => p.id === k) });
      else events.push({ type: 'jamEnd' });
    }
    this._active = now;
    return events;
  }
}

function makePotholes(rng) {
  const out = [];
  const lim = -CITY.ORIGIN - 6;
  let guard = 0;
  while (out.length < HAZARD.potholes && guard++ < 2000) {
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const line = rng.int(0, CITY.N);
    const along = rng.range(-lim, lim);
    let nearCross = false;
    for (let k = 0; k <= CITY.N; k++) if (Math.abs(along - roadPos(k)) < 8) nearCross = true;
    if (nearCross) continue;
    if (isWaterSeg(axis, line, Math.floor((along - CITY.ORIGIN) / CITY.PITCH))) continue; // không đặt ổ gà trên mặt sông
    const lat = rng.range(-4.6, 4.6);
    const x = axis === 'x' ? roadPos(line) + lat : along;
    const z = axis === 'x' ? along : roadPos(line) + lat;
    out.push({ x, z, r: rng.range(0.5, 0.85), depth: rng.range(0.7, 1.2) });
  }
  return out;
}
