// =============================================================
// TƯƠNG TÁC & HỘI THOẠI — mọi thao tác của người chơi đi qua đây
// (lấy hàng, xếp túi, giao hàng, sự cố, cửa hàng, nhiệm vụ chiếc ví, CSGT…)
// Mọi chữ lấy từ kho chữ qua fmt() — sửa bằng công cụ ?editor.
// =============================================================
// Code nằm ở src/interactions/ (chia theo nhóm); file này chỉ gom lại để chỗ khác vẫn `import * as act from './interactions.js'`.
export { gatherInteractions, mountBike } from './interactions/nearby.js';
export { acceptOffer, declineOffer, phoneAction, comfortKmh } from './interactions/phone.js';
export { pickup, dropoff, passengerQuit, viewWallet } from './interactions/delivery.js';
export { placeAction } from './interactions/places.js';
export { rideEventDialog, blockTicket, policeStop, patrolStop } from './interactions/road.js';
