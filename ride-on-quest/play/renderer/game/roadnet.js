/* 道の網（分かれ道でつながった道）。画面にも時計にも触らない純粋なモデルで、node のテストで確かめる。
   assets/map/roads.json（tools/trace_roads.py が作る。分かれ道14・道21本、どの分かれ道も三つまた）と島の標高から、
   道ごとに点 [緯度, 経度, 標高 m, 距離 m]（10 m ごと）を作る。標高は本物の 0.2 倍（島全体でひとつの縮め方。2026-10-21 ユーザー判断）で、
   前後50 m で均し、同じ分かれ道に来る3本の道の端は同じ標高（3本の平均）にそろえて、端から50 m かけてなだらかに合わせる。
   道の向き：dir ＝ +1 は a → b、−1 は b → a。道の上の距離 s は a から測る。 */
(function (root) {
  const ZONE_PAD = 80, ZONE_MIN = 150, ZONE_MAX = 250;   // 地名の範囲（下の「地名」）
  const V_SCALE = 0.2, STEP = 10, SMOOTH = 5, SPAN = 3, TAPER = 50;   // SPAN：向きを測る長さ（点の数。30 m）

  function build(rd, isl, places = {}) {
    const R = isl.rows, C = isl.cols, cellM = isl.cell || 111320 * (isl.lat0 - isl.lat1) / (R - 1);
    const lat = r => isl.lat0 + (isl.lat1 - isl.lat0) * r / (R - 1), lon = c => isl.lon0 + (isl.lon1 - isl.lon0) * c / (C - 1);
    const elevAt = (r, c) => {   // 双一次補間。海は0
      const r0 = Math.max(0, Math.min(R - 2, Math.floor(r))), c0 = Math.max(0, Math.min(C - 2, Math.floor(c))), fr = r - r0, fc = c - c0;
      const v = (rr, cc) => Math.max(0, isl.elev[rr][cc]);
      return (v(r0, c0) * (1 - fr) * (1 - fc) + v(r0, c0 + 1) * (1 - fr) * fc + v(r0 + 1, c0) * fr * (1 - fc) + v(r0 + 1, c0 + 1) * fr * fc) * V_SCALE;
    };
    const byName0 = nm => rd.edges.findIndex(e => e.name === nm);
    const roads = rd.edges.map((e, id) => {
      // 道の端は分かれ道の位置にそろえる（三つの道の端が1点で会う）。10 m ごとの点（格子の [行, 列]）
      const pts = e.pts.map(p => p.slice()); pts[0] = rd.nodes[e.a].slice(); pts[pts.length - 1] = rd.nodes[e.b].slice();
      const g = [pts[0].slice()], step = STEP / cellM; let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ar, ac] = pts[i], [br, bc] = pts[i + 1], len = Math.hypot(br - ar, bc - ac);
        let t = step - acc;
        for (; t <= len; t += step) g.push([ar + (br - ar) * t / len, ac + (bc - ac) * t / len]);
        acc = len - (t - step);
      }
      const last = pts[pts.length - 1], tail = g[g.length - 1];
      if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) * cellM > 1) g.push(last.slice());
      const raw = g.map(([r, c]) => elevAt(r, c)), n = raw.length;
      // 前後50 m で均す（道の端では、あるぶんだけで平均する）
      const sm = raw.map((_, i) => { let t = 0, k = 0; for (let j = Math.max(0, i - SMOOTH); j <= Math.min(n - 1, i + SMOOTH); j++) { t += raw[j]; k++; } return t / k; });
      const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]) * cellM);
      return { id, name: e.name, a: e.a, b: e.b, len: cum[n - 1], grid: g, sm, cum, places: [] };
    });
    const nodes = {};
    for (const [name, [r, c]] of Object.entries(rd.nodes)) nodes[name] = { name, r, c, lat: lat(r), lon: lon(c), ends: [] };
    for (const rdd of roads) { nodes[rdd.a].ends.push({ road: rdd.id, end: 'a' }); nodes[rdd.b].ends.push({ road: rdd.id, end: 'b' }); }
    // 同じ分かれ道に来る道の端の標高は、3本の平均にそろえる。端から TAPER m かけて、なだらかに合わせる（段差も崖も作らない）
    for (const nd of Object.values(nodes)) nd.ele = nd.ends.reduce((t, e) => { const r = roads[e.road]; return t + r.sm[e.end === 'a' ? 0 : r.sm.length - 1]; }, 0) / nd.ends.length;
    for (const rdd of roads) {
      const n = rdd.sm.length, da = nodes[rdd.a].ele - rdd.sm[0], db = nodes[rdd.b].ele - rdd.sm[n - 1], taper = x => Math.max(0, 1 - x / TAPER);
      const ele = rdd.sm.map((z, i) => z + da * taper(rdd.cum[i]) + db * taper(rdd.len - rdd.cum[i]));
      // 平らな台（街の台。rd.flats）の中は、道の標高も台の高さにする。台のまわり fall_m でなめらかにつなぐ（見た目の台と、走る標高・勾配を合わせる。2026-10-23）
      for (const f of rd.flats || []) {
        const cm = [f.center[0] * cellM, f.center[1] * cellM], tgt = f.ele_m * V_SCALE, sm_ = t => t * t * (3 - 2 * t);
        for (let i = 0; i < n; i++) {
          const x = rdd.grid[i][1] * cellM - cm[1], z = rdd.grid[i][0] * cellM - cm[0];
          const d = Math.hypot(Math.max(f.rect_m[0] - x, 0, x - f.rect_m[2]), Math.max(f.rect_m[1] - z, 0, z - f.rect_m[3])), w = d <= 0 ? 1 : d >= f.fall_m ? 0 : 1 - sm_(d / f.fall_m);
          if (w > 0) ele[i] = ele[i] * (1 - w) + tgt * w;
        }
      }
      // 高架（rd.overpasses）：橋の前後で標高も持ち上げる（見た目＝走り。lift は 3D の単位なので 2.2 で割って標高にする。プロフィールは画面の liftS と同じ：橋の上 ±9 m は一定、前後は half_m までなめらか）
      for (const o of rd.overpasses || []) {
        if (rd.edges[rdd.id].name !== o.road) continue;
        let bi = -1, bd = 1e9;
        rdd.grid.forEach(([r, c], i) => {
          const j = Math.min(n - 1, i + 1), k = Math.max(0, i - 1), dc = rdd.grid[j][1] - rdd.grid[k][1], dr = rdd.grid[j][0] - rdd.grid[k][0], l = Math.hypot(dc, dr) || 1, east = dc / l, d = Math.hypot(r - o.at[0], c - o.at[1]) * cellM;
          if ((o.over_heading === 'east' ? east > 0.6 : east < -0.6) && d < bd) { bd = d; bi = i; }
        });
        if (bi < 0 || bd > 30) continue;
        const so = rdd.cum[bi];
        for (let i = 0; i < n; i++) { const ds = Math.abs(rdd.cum[i] - so); if (ds >= o.half_m) continue; const t = ds <= 9 ? 0 : (ds - 9) / (o.half_m - 9); ele[i] += o.lift / 2.2 * (1 - t * t * (3 - 2 * t)); }
      }
      // トンネル（rd.tunnels：道の名前と、道の上の距離 sa〜sb m）：区間の中は地面の下をくぐる。標高は、両端（sa・sb）の標高を結ぶ線（なめらかな弦）にする。
      // 区間の外へ 40 m かけてなめらかにもとの標高へつなぐ（見た目＝走り。画面は区間の中の地形を切り盛りせず、道の面を地面の下に置く。2026-10-24 ユーザー判断）
      for (const tn of rd.tunnels || []) {
        if (rd.edges[rdd.id].name !== tn.road) continue;
        const at = c => { let k = 0; while (k < n - 2 && rdd.cum[k + 1] < c) k++; const t = (c - rdd.cum[k]) / ((rdd.cum[k + 1] - rdd.cum[k]) || 1); return ele[k] * (1 - t) + ele[k + 1] * t; };
        const ea = at(tn.sa), eb = at(tn.sb), sm_ = t => t * t * (3 - 2 * t);
        for (let i = 0; i < n; i++) {
          const c = rdd.cum[i], d = c < tn.sa ? tn.sa - c : c > tn.sb ? c - tn.sb : 0, w = d >= 40 ? 0 : 1 - sm_(d / 40);
          if (w > 0) ele[i] = ele[i] * (1 - w) + (ea + (eb - ea) * (c - tn.sa) / (tn.sb - tn.sa)) * w;
        }
      }
      let up = 0, down = 0, maxG = 0;
      for (let i = 1; i < n; i++) { const dz = ele[i] - ele[i - 1]; if (dz > 0) up += dz; else down -= dz; }
      for (let i = 10; i < n; i++) maxG = Math.max(maxG, Math.abs(ele[i] - ele[i - 10]) / (rdd.cum[i] - rdd.cum[i - 10]));
      rdd.points = rdd.grid.map(([r, c], i) => [+lat(r).toFixed(6), +lon(c).toFixed(6), +ele[i].toFixed(1), +rdd.cum[i].toFixed(1)]);
      rdd.maxGrade = +(maxG * 100).toFixed(1); rdd.up = Math.round(up); rdd.down = Math.round(down); rdd.len = rdd.points[n - 1][3];
      delete rdd.sm; delete rdd.cum;
    }
    // 高架（立体交差。rd.overpasses：輪が自分の入口を橋で越える所）：上を通るほうの道の上の位置 s（m）を出す。画面は、その前後で道の高さを持ち上げる
    const overpasses = [];
    for (const o of rd.overpasses || []) {
      const road = roads[byName0(o.road)]; if (!road) continue;
      let best = null;
      road.grid.forEach(([r, c], i) => {
        const j = Math.min(road.grid.length - 1, i + 1), k = Math.max(0, i - 1), dc = road.grid[j][1] - road.grid[k][1], dr = road.grid[j][0] - road.grid[k][0], l = Math.hypot(dc, dr) || 1;
        const east = dc / l, d = Math.hypot(r - o.at[0], c - o.at[1]) * cellM;
        if ((o.over_heading === 'east' ? east > 0.6 : east < -0.6) && (!best || d < best.d)) best = { d, s: road.points[i][3] };
      });
      if (best && best.d < 30) overpasses.push({ road: road.id, s: best.s, lift: o.lift, half: o.half_m, at: o.at });
    }
    // 地名：道から 300 m 以内のものを、いちばん近い点の距離で。看板を置く場所は、いちばん近い道の点
    // 表示しない地名（2026-10-24 ユーザー判断：オオミズナギドリ繁殖地）：看板・通過の表示には出さない。NPC の話の札（whereTags）には使えるよう、地名の点は残す
    const HIDDEN = new Set(['オオミズナギドリ繁殖地']);
    const spots = [];
    for (const [pn, [pr, pc]] of Object.entries(places)) {
      let best = null;
      for (const rdd of roads) {
        let bi = 0, bd = Infinity;
        const dist = rdd.grid.map(([r, c]) => Math.hypot(r - pr, c - pc) * cellM);
        dist.forEach((dd, i) => { if (dd < bd) { bd = dd; bi = i; } });
        if (bd <= 300) {
          // 地名の範囲（s0〜s1 m）：いちばん近い点の前後で、近さ + ZONE_PAD m（ZONE_MIN m 以上）以内の続いた区間（片側 ZONE_MAX m まで）。走る向きで、この範囲に入った時に名前を出す（2026-10-28 試走の指摘 9）
          const lim = Math.max(bd + ZONE_PAD, ZONE_MIN), at = rdd.points[bi][3]; let i0 = bi, i1 = bi;
          while (i0 > 0 && dist[i0 - 1] <= lim && at - rdd.points[i0 - 1][3] <= ZONE_MAX) i0--;
          while (i1 < dist.length - 1 && dist[i1 + 1] <= lim && rdd.points[i1 + 1][3] - at <= ZONE_MAX) i1++;
          rdd.places.push({ name: pn, at: Math.round(at), d: Math.round(bd), s0: i0 === 0 ? -1 : rdd.points[i0][3], s1: i1 === dist.length - 1 ? rdd.len + 1 : rdd.points[i1][3], hidden: HIDDEN.has(pn) }); if (!best || bd < best.d) best = { name: pn, road: rdd.id, at: Math.round(rdd.points[bi][3]), d: Math.round(bd) }; }
      }
      if (best && !HIDDEN.has(pn)) spots.push(best);
    }
    for (const rdd of roads) rdd.places.sort((a, b) => a.at - b.at);
    const byName = new Map(roads.map(r => [r.name, r.id]));
    // 道の網の版：道の名前と長さ（10 m 単位）の短いハッシュ。ゴーストの記録が今の網に合うかを見る（docs/impl-ghost.md）
    let h = 2166136261;
    for (const ch of roads.map(r => `${r.name}:${Math.round(r.len / 10)}`).join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const version = h.toString(36);
    return { roads, nodes, byName, spots, overpasses, tunnels: rd.tunnels || [], version, cell: cellM, isl: { lat0: isl.lat0, lon0: isl.lon0, lat1: isl.lat1, lon1: isl.lon1, rows: R, cols: C } };
  }

  // 道の上の距離 s（m）の位置。点の間は直線でつなぐ。s は道の長さの内側に寄せる（返す s は寄せた値）
  function pointAt(road, s) {
    const p = road.points, n = p.length;
    s = Math.max(0, Math.min(road.len, s));
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p[mid][3] <= s) lo = mid; else hi = mid; }
    const a = p[lo], b = p[hi], t = b[3] > a[3] ? (s - a[3]) / (b[3] - a[3]) : 0;
    return { lat: a[0] + (b[0] - a[0]) * t, lon: a[1] + (b[1] - a[1]) * t, ele: a[2] + (b[2] - a[2]) * t, i: lo, t, s };
  }

  // 進む向きのベクトル（x＝東、y＝北）。道の端のそば SPAN 点ぶん
  const vec = (a, b) => [(b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), b[0] - a[0]];
  function headingIn(road, dir) {   // 道を dir の向きに進んで着く端での向き
    const p = road.points, k = Math.min(SPAN, p.length - 1);
    return dir > 0 ? vec(p[p.length - 1 - k], p[p.length - 1]) : vec(p[k], p[0]);
  }
  function headingOut(road, dir) {   // 道を dir の向きに進み出す端での向き
    const p = road.points, k = Math.min(SPAN, p.length - 1);
    return dir > 0 ? vec(p[0], p[k]) : vec(p[p.length - 1], p[p.length - 1 - k]);
  }

  // 道 roadIdx を dir の向きに進んで分かれ道に着いたとき、出ていける道（来た道を除く2本）：{ left, right }
  // 各 { road, dir, name（道の名前）, to（進む先の分かれ道の名前）, from（この分かれ道の名前） }
  function outgoing(net, roadIdx, dir) {
    const road = net.roads[roadIdx], node = net.nodes[dir > 0 ? road.b : road.a], end = dir > 0 ? 'b' : 'a';
    const vin = headingIn(road, dir);
    const outs = node.ends.filter(e => !(e.road === roadIdx && e.end === end)).map(e => {
      const r = net.roads[e.road], d = e.end === 'a' ? 1 : -1, v = headingOut(r, d);
      // 進む向きから見て、左へ曲がるほど角度が大きい（北が上、反時計回りが正）
      const ang = Math.atan2(vin[0] * v[1] - vin[1] * v[0], vin[0] * v[0] + vin[1] * v[1]);
      return { road: e.road, dir: d, name: r.name, from: node.name, to: d > 0 ? r.b : r.a, ang };
    }).sort((x, y) => y.ang - x.ang);
    return { left: outs[0], right: outs[outs.length - 1], inRoad: roadIdx, inDir: dir };   // inRoad・inDir：来た道と向き
  }

  // 格子の点 (r, c) にいちばん近い道の上の位置。only：道の添え字の集まり（あれば、その道だけ）
  function positionNear(net, r, c, only) {
    let best = null;
    for (const rd of net.roads) {
      if (only && !only.has(rd.id)) continue;
      rd.grid.forEach(([gr, gc], i) => { const d = Math.hypot(gr - r, gc - c); if (!best || d < best.d) best = { d, road: rd.id, s: rd.points[i][3] }; });
    }
    return best && { road: best.road, s: best.s, dir: 1, meters: best.d * net.cell };
  }

  // 道の名前の並びを、分かれ道 startNode からたどったときの向き（道の添え字 → +1／−1）
  function followDirs(net, names, startNode) {
    const dirs = new Map(); let here = startNode;
    for (const nm of names) {
      const r = net.roads[net.byName.get(nm)];
      if (r.a !== here && r.b !== here) throw new Error(`道がつながっていない：${nm}（${here}）`);
      dirs.set(r.id, r.a === here ? 1 : -1); here = r.a === here ? r.b : r.a;
    }
    return dirs;
  }

  // コースの走り出し。side：'right'（右回り＝始点から。周回は時計回り）か 'left'（左回り＝終点から＝逆向き。周回は反時計回り）
  // → { road, dir, s }
  function courseStart(net, course, side) {
    let names = course.roads, from = course.start;
    const reversed = course.loop ? ((side === 'right') !== !!course.cw) : side === 'left';   // 周回は右回り＝時計回り
    if (reversed) { names = course.roads.slice().reverse(); from = course.loop ? course.start : course.end; }
    const r = net.roads[net.byName.get(names[0])];
    if (r.a !== from && r.b !== from) throw new Error(`コースの出だしがつながっていない：${course.id}`);
    const dir = r.a === from ? 1 : -1;
    return { road: r.id, dir, s: dir > 0 ? 0 : r.len };
  }

  // コースの道の並び（走る向きどおり）：{ seq: [{ road, dir }…], loop }。分かれ道の「何もしないとき」の向きを、コースどおりにするのに使う（ride.js の defaultTurn）
  function coursePlan(net, course, side) {
    const reversed = course.loop ? ((side === 'right') !== !!course.cw) : side === 'left';
    const names = reversed ? course.roads.slice().reverse() : course.roads, from = reversed ? (course.loop ? course.start : course.end) : course.start;
    const dirs = followDirs(net, names, from);
    return { seq: names.map(n => { const id = net.byName.get(n); return { road: id, dir: dirs.get(id) }; }), loop: !!course.loop };
  }

  // コースの「向かい側」：プレイヤーと反対向きに走り出すと、道の途中でちょうどすれ違う位置。
  // 片道のコースは反対の端（courseStart の反対側）、周回のコースは半周先（反対向き）。ゴーストの出し方に使う → { road, dir, s }
  function courseOpposite(net, course, side) {
    if (!course.loop) return courseStart(net, course, side === 'right' ? 'left' : 'right');
    const me = courseStart(net, course, side), reversed = (side === 'right') !== !!course.cw;
    const names = reversed ? course.roads.slice().reverse() : course.roads, dirs = followDirs(net, names, course.start);
    const lens = names.map(n => net.roads[net.byName.get(n)].len), half = lens.reduce((a, b) => a + b, 0) / 2;
    let acc = 0;
    for (let i = 0; i < names.length; i++) {
      if (acc + lens[i] >= half) {
        const r = net.roads[net.byName.get(names[i])], d = dirs.get(r.id), along = half - acc;   // この道を、プレイヤーの向きに along m 進んだ所
        return { road: r.id, dir: -d, s: d > 0 ? along : r.len - along, from: me };
      }
      acc += lens[i];
    }
    return me;
  }

  const api = { V_SCALE, build, courseOpposite, pointAt, outgoing, positionNear, followDirs, courseStart, coursePlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).roadnet = api;
})(typeof window !== 'undefined' ? window : globalThis);
