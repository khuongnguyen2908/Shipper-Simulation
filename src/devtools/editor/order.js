// Đổi thứ tự dữ liệu khi kéo thả trong công cụ (thuần, không DOM — bộ thử gọi được)
// from = vị trí cũ, to = vị trí mới sau khi dời (đếm từ 0)

// Dời một phần tử trong mảng (sửa luôn mảng đó)
export function moveInArray(arr, from, to) {
  if (from === to || from < 0 || from >= arr.length) return arr;
  const [x] = arr.splice(from, 1);
  arr.splice(Math.max(0, Math.min(to, arr.length)), 0, x);
  return arr;
}

// Dời một khóa trong bảng { mã: dữ liệu } (giữ nguyên đối tượng, chỉ đổi thứ tự khóa)
export function moveKey(obj, from, to) {
  const entries = moveInArray(Object.entries(obj), from, to);
  for (const k of Object.keys(obj)) delete obj[k];
  for (const [k, v] of entries) obj[k] = v;
  return obj;
}
