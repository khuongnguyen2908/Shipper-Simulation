// =============================================================
// node scripts/kiem-ten.js [file.js…]  (chạy kèm npm test; không ghi file = dò hết src/) — dò tên dùng mà chưa khai báo / chưa import (vd tách file quên import → lỗi lúc chơi)
// Thô: gom MỌI tên khai báo trong file (mọi phạm vi) + import + biến có sẵn của trình duyệt; tên dùng mà không có trong đó thì báo.
// Không báo = gần như chắc không thiếu import (không bắt được lỗi dùng sai phạm vi).
// =============================================================
import fs from 'node:fs';
import { parseAst } from 'rolldown/parseAst';

const GLOBALS = new Set(('window document globalThis self Math JSON Object Array String Number Boolean Date Symbol RegExp Error TypeError Promise Set Map WeakMap WeakSet ' +
  'Infinity NaN undefined parseInt parseFloat isFinite isNaN console performance requestAnimationFrame cancelAnimationFrame setTimeout clearTimeout setInterval clearInterval ' +
  'localStorage sessionStorage location navigator history fetch URL URLSearchParams Blob File FileReader Image Audio AudioContext OfflineAudioContext Event KeyboardEvent MouseEvent PointerEvent CustomEvent ' +
  'addEventListener removeEventListener dispatchEvent innerWidth innerHeight devicePixelRatio getComputedStyle matchMedia confirm alert prompt structuredClone queueMicrotask ' +
  'encodeURIComponent decodeURIComponent btoa atob Uint8Array Uint16Array Uint32Array Int32Array Float32Array Float64Array ArrayBuffer DataView TextEncoder TextDecoder ' +
  'getSelection HTMLInputElement HTMLTextAreaElement HTMLSelectElement HTMLElement HTMLCanvasElement Node NodeList DOMParser ResizeObserver IntersectionObserver MutationObserver Intl BigInt Reflect Proxy arguments process import').split(/\s+/));

function check(file) {
  const src = fs.readFileSync(file, 'utf8');
  const ast = parseAst(src, { sourceType: 'module' });
  const declared = new Set(), used = new Map();
  const declPattern = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') declared.add(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach((q) => declPattern(q.type === 'RestElement' ? q.argument : q.value));
    else if (p.type === 'ArrayPattern') p.elements.forEach(declPattern);
    else if (p.type === 'AssignmentPattern') declPattern(p.left);
    else if (p.type === 'RestElement') declPattern(p.argument);
  };
  const walk = (n, parent, key) => {
    if (!n || typeof n.type !== 'string') return;
    switch (n.type) {
      case 'ImportSpecifier': case 'ImportDefaultSpecifier': case 'ImportNamespaceSpecifier': declared.add(n.local.name); return;
      case 'VariableDeclarator': declPattern(n.id); walk(n.init, n, 'init'); return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
        if (n.id) declared.add(n.id.name);
        n.params.forEach(declPattern);
        n.params.forEach((p) => walkDefaults(p));
        walk(n.body, n, 'body');
        return;
      case 'ClassDeclaration': case 'ClassExpression': if (n.id) declared.add(n.id.name); break;
      case 'CatchClause': declPattern(n.param); break;
      case 'Identifier': {
        if (parent && ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed)
          || ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && key === 'key' && !parent.computed)
          || parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement'
          || parent.type === 'ExportSpecifier' || parent.type === 'MetaProperty' || parent.type === 'ImportAttribute')) return;
        if (!used.has(n.name)) used.set(n.name, n.start);
        return;
      }
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'range' || k === 'loc') continue;
      if (Array.isArray(v)) v.forEach((c) => walk(c, n, k));
      else if (v && typeof v === 'object') walk(v, n, k);
    }
  };
  const walkDefaults = (p) => { if (p?.type === 'AssignmentPattern') walk(p.right, p, 'right'); };
  walk(ast, null, null);
  const missing = [...used.keys()].filter((k) => !declared.has(k) && !GLOBALS.has(k));
  const line = (pos) => src.slice(0, pos).split('\n').length;
  return missing.map((k) => `${file}:${line(used.get(k))}  ${k}`);
}

// không ghi file nào → dò hết src/ (trừ thư mục âm thanh)
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'sounds' ? [] : walk(`${d}/${e.name}`)) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []));
const files = process.argv.length > 2 ? process.argv.slice(2) : walk('src');
let bad = 0;
for (const f of files) {
  const r = check(f);
  bad += r.length;
  for (const x of r) console.log('❌ chưa khai báo / chưa import:', x);
}
console.log(bad ? `${bad} tên cần xem lại.` : `✔ Không thiếu tên nào (${files.length} file).`);
process.exit(bad ? 1 : 0);
