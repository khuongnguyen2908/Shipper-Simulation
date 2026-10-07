// Nhóm vật phẩm — CHỈ để sắp xếp trong công cụ ?editor (thẻ Vật phẩm), game không dùng.
// items.json → "group". Món chưa đặt nhóm thì đoán theo đặc tính / tên.
export const ITEM_GROUPS = [
  ['food', '🍜 Đồ ăn'],
  ['drink', '🥤 Nước uống'],
  ['rider', '🧍 Khách'],
  ['parcel', '📦 Hàng giao'],
];
export const ITEM_GROUP_IDS = ITEM_GROUPS.map(([id]) => id);

const DRINK_RE = /trà|cà phê|cafe|coffee|nước|sữa|sinh tố|bia|soda|smoothie|milk|tea/i;

export function guessGroup(it) {
  const traits = it.traits || [];
  if (traits.includes('passenger')) return 'rider';
  if (it.parcel) return 'parcel';
  if (DRINK_RE.test(it.name || '')) return 'drink';
  return 'food';
}

export const groupOf = (it) => (ITEM_GROUP_IDS.includes(it.group) ? it.group : guessGroup(it));
