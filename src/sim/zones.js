// =============================================================
// BẢN ĐỒ RIÊNG (cốt truyện): mã bản đồ + chỗ đứng có tên — dùng chung cho game (world/shipMap.js), bộ kiểm tra, ?editor.
// Bản đồ đặt thật xa thành phố (gốc origin), toạ độ chỗ đứng tính theo gốc đó.
// =============================================================
export const ZONES = {
  ship: {
    name: '🚢 Trên tàu HẢI LONG (đậu ở bến Kho 7, ban đêm)',
    origin: [0, -2400],
    // chỗ đứng có tên (toạ độ tàu: mũi về +z, mạn trái -x sát bến)
    points: {
      captive: { at: [-6.5, 37.6], name: 'Trong container nhốt người' },
      captiveDoor: { at: [5.4, 37.6], name: 'Ngay cửa container' },
      deckMid: { at: [-9.6, 0], name: 'Lối đi mạn trái, giữa tàu' },
      bridgeDoor: { at: [0, -43.5], name: 'Trước cửa lầu chỉ huy' },
      bridgeIn: { at: [0, -50], name: 'Trong lầu chỉ huy (tầng trệt)' },
      captainLocker: { at: [7.3, -54.9], name: 'Trước tủ thuyền trưởng (lầu chỉ huy, vách phải)' },
      bow: { at: [0, 50], name: 'Sàn mũi tàu' },
      gangTop: { at: [-11.6, -34.8], name: 'Bục đầu cầu thang mạn' },
      gangFoot: { at: [-15.5, -20.9], name: 'Chân cầu thang mạn (trên bến)' },
      quay: { at: [-30, -10], name: 'Giữa bến Kho 7' },
    },
    spawn: 'captive',
    // lưới đường đi cho địch / anh Đạt (đi vòng qua dãy container): điểm [x, z] + đoạn nối [i, j]
    nav: {
      nodes: [[-9.75, -44], [-9.75, -30], [-9.75, -12.6], [-9.75, 0], [-9.75, 13.4], [-9.75, 34], [9.75, -44], [9.75, -30], [9.75, -12.6], [9.75, 0], [9.75, 13.4], [9.75, 34],
        [0, -12.6], [0, 13.4], [0, 34], [-9.75, -52], [9.75, -52], [0, -59], [0, -43.6], [0, -50], [-11.9, -34.8], [-11.75, -21.6], [-16, -20.9], [-9.75, -34],
        [-9.75, 42], [9.75, 42], [0, 42]], // 24–26: mũi tàu sau container nhốt (lối mạn trái cạnh container chỉ rộng ~1 m)
      edges: [[0, 23], [23, 1], [1, 2], [2, 3], [3, 4], [4, 5], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [2, 12], [12, 8], [4, 13], [13, 10], [5, 14], [14, 11],
        [0, 15], [15, 17], [17, 16], [16, 6], [0, 18], [6, 18], [18, 19], [23, 20], [20, 21], [21, 22], [5, 24], [11, 25], [24, 26], [26, 25]],
    },
  },
};
// Màn đua thoát thân (chương 6): đường dài tự dựng theo story.json → races (sim/race.js) — gốc đường ở origin
ZONES.race = { name: '🏍️ Đường đua thoát thân (sau bến Kho 7)', origin: [9000, 0], points: { start: { at: [0, 6], name: 'Đầu đường đua' } }, spawn: 'start' };
export const ZONE_LIST = Object.keys(ZONES);
export const ZONE_POINTS = [...new Set(Object.values(ZONES).flatMap((z) => Object.keys(z.points)))];
// Toạ độ thế giới của chỗ đứng có tên
export function zonePoint(id, key) {
  const z = ZONES[id], p = z?.points[key];
  return p ? [p.at[0] + z.origin[0], p.at[1] + z.origin[1]] : null;
}
