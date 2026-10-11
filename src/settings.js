// Cài đặt của người chơi (màn hình ⚙️ Cài đặt): âm lượng, tắt tiếng, độ nhạy chuột, đảo trục dọc, đồ họa.
// Lưu trong trình duyệt (localStorage) — không nằm trong bản lưu game, không cần ?editor.
const KEY = 'shipper-settings-v1';
export const DEFAULTS = { volume: 0.8, muted: false, sens: 1, invertY: false, quality: 'high' };
export const SENS_RANGE = [0.3, 2.5];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Đọc + sửa giá trị hỏng (sửa tay localStorage, bản cũ…) về mặc định
export function normSettings(s) {
  const o = { ...DEFAULTS, ...(s && typeof s === 'object' ? s : {}) };
  return {
    volume: Number.isFinite(+o.volume) ? clamp(+o.volume, 0, 1) : DEFAULTS.volume,
    muted: !!o.muted,
    sens: Number.isFinite(+o.sens) ? clamp(+o.sens, ...SENS_RANGE) : DEFAULTS.sens,
    invertY: !!o.invertY,
    quality: o.quality === 'low' ? 'low' : 'high',
  };
}

export function loadSettings() {
  try {
    return normSettings(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return normSettings(null);
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normSettings(s)));
  } catch {
    /* chế độ riêng tư: chỉ giữ trong lần chơi này */
  }
}
