// =============================================================
// VẬT LÝ MÓN HÀNG (ItemPhysics)
// Mỗi món là một DeliveryItem gồm nhiều "đặc tính" (Trait) ghép lại,
// ví dụ Phở = Nóng + Nước, Trà sữa = Lạnh + Nước, Bánh kem = Dễ vỡ + Hộp giấy.
//
// Hai loại tác động:
//  1) tick(env, dt): theo thời gian (dt = phút game) — nguội, tan, ướt mưa, khách sợ
//  2) sự kiện từ bộ điều khiển xe (mag ≈ 0..2):
//     bump (ổ gà, lề đường, cầu thang) · brake (phanh gấp) · swerve (ôm cua gắt) · collision (đâm)
//
// env = {
//   ambient: nhiệt độ ngoài trời °C, sun: 0..1 (nắng chiếu), raining, exposed (đang ở ngoài trời),
//   speed: m/s, comfortSpeed: m/s, suspension: 0..1 (giảm xóc của xe),
//   bag: { insulation 0..1, waterproof 0..1, padding 0..1 }, passengerRaincoat
// }
// =============================================================

import { fmt } from '../content/index.js';

export class Trait {
  constructor(item, def) {
    this.item = item;
    this.def = def;
  }
  tick() {}
  onBump() {}
  onBrake() {}
  onSwerve() {}
  onCollision() {}
}

// 🔥 Món nóng: nguội dần về nhiệt độ ngoài trời; dưới 60°C bắt đầu mất điểm.
export class HotTrait extends Trait {
  constructor(item, def) {
    super(item, def);
    if (item.temp == null) item.temp = def.startTemp ?? 80;
  }
  tick(env, dt) {
    const it = this.item;
    const k = 0.035 * (1 - env.bag.insulation * 0.8) * (it.mods.heatNeighbor ? 1.6 : 1);
    it.temp += (env.ambient - it.temp) * (1 - Math.exp(-k * dt));
    if (it.temp < 60) it.damage((60 - it.temp) * 0.025 * dt, 'cooled');
  }
}

// ❄️ Món lạnh: ấm dần theo nhiệt độ + nắng; vượt ngưỡng meltAt là tan.
export class ColdTrait extends Trait {
  constructor(item, def) {
    super(item, def);
    item.temp = def.startTemp ?? 4;
  }
  tick(env, dt) {
    const it = this.item;
    const target = env.ambient + (env.exposed ? env.sun * 8 : 0);
    const k = 0.03 * (1 - env.bag.insulation) * (it.mods.heatNeighbor ? 1.8 : 1);
    it.temp += (target - it.temp) * (1 - Math.exp(-k * dt));
    if (it.temp > this.def.meltAt) it.damage((it.temp - this.def.meltAt) * this.def.meltRate * dt, 'melted');
  }
}

// 💧 Món nước (canh, trà sữa): đổ khi xóc, phanh gấp, ôm cua, va chạm.
// Giảm xóc của xe và đệm của túi giúp giảm; để nằm nghiêng thì đổ gấp 2,5 lần.
export class LiquidTrait extends Trait {
  factor(env) {
    return (this.item.mods.upright ? 1 : 2.5) * (1 - env.bag.padding * 0.4);
  }
  onBump(mag, env) {
    this.item.damage(mag * 12 * (1 - env.suspension * 0.7) * this.factor(env), 'spillBump');
  }
  onBrake(mag, env) {
    this.item.damage(mag * 8 * this.factor(env), 'spillBrake');
  }
  onSwerve(mag, env) {
    this.item.damage(mag * 5 * this.factor(env), 'spillSwerve');
  }
  onCollision(mag, env) {
    this.item.damage(mag * 15 * this.factor(env), 'spillCrash');
  }
}

// ⚠️ Đồ dễ vỡ: hỏng nặng khi va chạm, hơi hỏng khi xóc/phanh. Đệm túi giảm 60%.
export class FragileTrait extends Trait {
  pad(env) {
    return 1 - env.bag.padding * 0.6;
  }
  onCollision(mag, env) {
    this.item.damage(mag * 28 * this.pad(env), 'dented');
  }
  onBump(mag, env) {
    this.item.damage(mag * 5 * (1 - env.suspension * 0.7) * this.pad(env), 'shifted');
  }
  onBrake(mag, env) {
    this.item.damage(mag * 4 * this.pad(env), 'shifted');
  }
}

// 📦 Hộp giấy: ướt mưa là hỏng (túi chống nước bảo vệ).
export class PaperTrait extends Trait {
  tick(env, dt) {
    if (env.raining && env.exposed) this.item.damage(0.5 * (1 - env.bag.waterproof) * dt, 'wet');
  }
}

// 🧍 Khách xe ôm: "tình trạng" = mức thoải mái. Chạy quá nhanh, phanh gấp,
// ôm cua gắt, xóc, đâm xe đều làm khách hoảng. item.comfortDelta (m/s): loại khách chịu nhanh/chậm hơn bình thường.
export class PassengerTrait extends Trait {
  tick(env, dt) {
    const comfort = env.comfortSpeed + (this.item.comfortDelta || 0);
    if (env.speed > comfort) this.item.damage((env.speed - comfort) * 0.6 * dt, 'scaredSpeed');
    if (env.raining && env.exposed && !env.passengerRaincoat) this.item.damage(0.3 * dt, 'passengerWet');
  }
  onBrake(mag) {
    this.item.damage(mag * 10, 'hardBrake');
  }
  onSwerve(mag) {
    this.item.damage(mag * 6, 'sharpTurn');
  }
  onBump(mag, env) {
    this.item.damage(mag * 5 * (1 - env.suspension * 0.7), 'bumpy');
  }
  onCollision(mag) {
    this.item.damage(mag * 30, 'crash');
  }
}

export const TRAITS = {
  hot: HotTrait,
  cold: ColdTrait,
  liquid: LiquidTrait,
  fragile: FragileTrait,
  paper: PaperTrait,
  passenger: PassengerTrait,
};

const EVENT_FN = { bump: 'onBump', brake: 'onBrake', swerve: 'onSwerve', collision: 'onCollision' };

export class DeliveryItem {
  constructor(def, uid = 0) {
    this.def = def;
    this.id = def.id;
    this.uid = uid;
    this.name = def.name;
    this.icon = def.icon;
    this.condition = 100;
    this.temp = null;
    // Kết quả xếp túi: để đứng? sát món nóng/lạnh ngược tính? bị đè?
    this.mods = { upright: true, heatNeighbor: false, crushed: false };
    this.reasons = {}; // mã lý do mất điểm (xem dmg.* trong kho chữ) → tổng % đã mất
    this.traits = def.traits.map((t) => new TRAITS[t](this, def));
  }

  has(trait) {
    return this.def.traits.includes(trait);
  }

  damage(amount, reason) {
    if (!(amount > 0) || this.condition <= 0) return;
    const v = Math.min(this.condition, amount);
    this.condition -= v;
    this.reasons[reason] = (this.reasons[reason] || 0) + v;
  }

  tick(env, dt) {
    for (const t of this.traits) t.tick(env, dt);
  }

  event(type, mag, env) {
    const fn = EVENT_FN[type];
    if (!fn || !(mag > 0)) return;
    for (const t of this.traits) t[fn](mag, env);
  }

  // Áp kết quả mini-game xếp túi
  applyPacking(mods) {
    Object.assign(this.mods, mods);
    if (this.mods.crushed && this.has('fragile')) this.damage(30, 'crushed');
    if (!this.mods.upright && this.has('liquid')) this.damage(5, 'tilted');
  }

  statusText() {
    if (this.has('passenger')) {
      if (this.condition > 80) return fmt('status.calm');
      if (this.condition > 50) return fmt('status.nervous');
      return fmt('status.panic');
    }
    if (this.temp != null) return `${Math.round(this.temp)}°C`;
    return '';
  }
}
