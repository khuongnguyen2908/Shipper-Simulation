// =============================================================
// MINI GAME "BÀY TRẬN" (cốt truyện chương 5 — việc "ambush" trong story.json): người chơi đặt vài chốt anh em shipper chặn ngã tư
// để người bị vây (Tí Sún) chỉ còn đường chạy vào chỗ bẫy (đường cụt ngập ven kênh).
// Thuần dữ liệu: không Three.js, không DOM — chạy được trong Node (bộ thử) và trong công cụ ?editor.
//
// def: { region: [i0, i1, j0, j1] (khung ngã tư trên bản đồ), start: [i, j] (chỗ người bị vây), trap: [i, j] (ngã tư dẫn vào chỗ bẫy),
//        trapTo: [i, j] (hướng đường cụt — chỉ để vẽ), exits: [[i, j]…] (ngã tư thoát được: qua cầu / ra khỏi khu), fixed: [[i, j]…]
//        (chốt anh em đã giữ sẵn), blocks: số chốt người chơi được đặt }
// Người bị vây chạy đường ngắn nhất tới lối thoát gần nhất (né chốt). Hết lối thoát → chạy vào chỗ bẫy (thắng).
// Không tới được cả chỗ bẫy (vây kín quá) → quay đầu tông chốt chạy mất (thua).
// =============================================================
const key = (n) => `${n[0]},${n[1]}`;

// Ngã tư thuộc khung bày trận (hoặc là lối thoát) · nb(i, j) = các ngã tư nối thẳng (cityLayout.neighbors)
export function ambushNodes(def) {
  const [i0, i1, j0, j1] = def.region;
  const out = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j]);
  return out;
}
const inRegion = (def, n) => n[0] >= def.region[0] && n[0] <= def.region[1] && n[1] >= def.region[2] && n[1] <= def.region[3];
const isExit = (def, n) => (def.exits || []).some((e) => key(e) === key(n));

// Đường đi theo luật trên với các ngã tư bị chặn blocked (Set "i,j") → { result: 'trap' | 'escape' | 'boxed', path: [[i, j]…] }
export function ambushRun(def, blocked, nb) {
  const S = def.start;
  const step = (n) => nb(n[0], n[1]).filter((m) => (inRegion(def, m) || isExit(def, m)) && !blocked.has(key(m)));
  const bfs = (goal) => {
    const prev = new Map([[key(S), null]]), q = [S];
    while (q.length) {
      const n = q.shift();
      if (goal(n)) {
        const path = [];
        for (let k = key(n), cur = n; cur; cur = prev.get(k), k = cur && key(cur)) path.unshift(cur);
        return path;
      }
      if (isExit(def, n) && key(n) !== key(S)) continue; // tới lối thoát là thoát, không đi xuyên qua
      for (const m of step(n)) if (!prev.has(key(m))) { prev.set(key(m), n); q.push(m); }
    }
    return null;
  };
  const esc = bfs((n) => isExit(def, n));
  if (esc) return { result: 'escape', path: esc };
  const trap = bfs((n) => key(n) === key(def.trap));
  if (trap) return { result: 'trap', path: [...trap, ...(def.trapTo ? [def.trapTo] : [])] };
  return { result: 'boxed', path: [S] };
}

// Chỗ người chơi được đặt chốt: ngã tư trong khung + lối thoát, trừ chỗ người bị vây, chỗ bẫy, chốt giữ sẵn
export function ambushCandidates(def) {
  const no = new Set([def.start, def.trap, ...(def.fixed || [])].map(key));
  return [...ambushNodes(def), ...(def.exits || [])].filter((n) => !no.has(key(n)));
}
// Mọi cách đặt đúng k chốt mà thắng (cho công cụ / bộ thử kiểm tra màn chơi có lời giải, không quá dễ)
export function ambushSolutions(def, nb, k = def.blocks ?? 3) {
  const cand = ambushCandidates(def), fixed = (def.fixed || []).map(key), out = [];
  const rec = (start, cur) => {
    if (cur.length === k) {
      if (ambushRun(def, new Set([...fixed, ...cur.map(key)]), nb).result === 'trap') out.push(cur.map((n) => [...n]));
      return;
    }
    for (let i = start; i < cand.length; i++) rec(i + 1, [...cur, cand[i]]);
  };
  rec(0, []);
  return out;
}
