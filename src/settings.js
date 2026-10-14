// Cài đặt của người chơi (màn hình ⚙️ Cài đặt): âm thanh (bật / tắt, âm lượng Nhạc, âm lượng Hiệu ứng),
// độ nhạy chuột, đảo trục dọc, đồ họa. Lưu trong trình duyệt (localStorage) — không nằm trong bản lưu game, không cần ?editor.
const KEY = 'shipper-settings-v1';
// people: 'auto' (người gần chi tiết, người xa vẽ đơn giản) | 'simple' (mọi người vẽ đơn giản — máy yếu)
export const DEFAULTS = { music: 0.6, sfx: 0.8, muted: false, sens: 1, invertY: false, quality: 'high', people: 'auto' };
export const SENS_RANGE = [0.3, 2.5];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Đọc + sửa giá trị hỏng (sửa tay localStorage, bản cũ…) về mặc định
export function normSettings(s) {
  const raw = s && typeof s === 'object' ? s : {};
  const o = { ...DEFAULTS, ...raw };
  // cài đặt cũ chỉ có 1 thanh "Âm lượng" → dùng cho Hiệu ứng (Nhạc giữ mặc định)
  if (raw.sfx == null && Number.isFinite(+raw.volume)) o.sfx = +raw.volume;
  const v01 = (v, d) => (Number.isFinite(+v) ? clamp(+v, 0, 1) : d);
  return {
    music: v01(o.music, DEFAULTS.music),
    sfx: v01(o.sfx, DEFAULTS.sfx),
    muted: !!o.muted,
    sens: Number.isFinite(+o.sens) ? clamp(+o.sens, ...SENS_RANGE) : DEFAULTS.sens,
    invertY: !!o.invertY,
    quality: o.quality === 'low' ? 'low' : 'high',
    people: o.people === 'simple' ? 'simple' : 'auto',
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
