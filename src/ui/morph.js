// Cập nhật giao diện TẠI CHỖ: so cây HTML mới với cái đang hiện, chỉ sửa chữ / thuộc tính đổi, chỉ thay phần tử khác loại.
// Nhờ vậy nút bấm không bị xóa rồi dựng lại mỗi khung hình (bấm chuột = nhấn + nhả trên CÙNG một nút; nút bị thay giữa chừng → mất cú bấm),
// chỗ đang cuộn và trạng thái rê chuột cũng giữ nguyên.
// Phần tử có thuộc tính data-keep: giữ nguyên con bên trong (vd khung bản đồ do code khác tự vẽ).
export function morph(el, html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  patch(el, t.content);
}

function patch(a, b) {
  const an = [...a.childNodes], bn = [...b.childNodes];
  for (let i = 0; i < bn.length; i++) {
    const x = an[i], y = bn[i];
    if (!x) { a.appendChild(y); continue; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y, x); continue; }
    if (x.nodeType !== 1) {
      if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue;
      continue;
    }
    for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
    for (const at of [...y.attributes]) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    if (!x.hasAttribute('data-keep')) patch(x, y);
  }
  for (let i = an.length - 1; i >= bn.length; i--) a.removeChild(an[i]);
}
