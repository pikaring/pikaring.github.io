/* ランドマークの配置の計算（docs/landmarks.md）。画面にも three.js にも触らない純粋な関数で、node のテストで確かめる。
   入力：道の網 net（RQ.roadnet.build の結果）、島 isl（RQ.mapData.island）、ランドマークの一覧 list（assets/map/landmarks.json の landmarks。
   画面では RQ.mapData.landmarks）。出力：3D に置くための座標と向き。描く側（view3d.js）は、これを読んで立体やドット絵の板を置くだけでよい。

   RQ.landmarks.place(net, isl, list) → [ 配置 ]。1つの配置：
     { id, kind, name, how（'sprite' ＝ドット絵の板、'code' ＝コードで作る立体、'sprite+code'）,
       x, z（3D の水平の座標 m。x＝東、z＝南。格子の (行, 列) は z＝行×cell、x＝列×cell。view3d.js と同じ）,
       y（地面の高さ。参考値：本物の標高 × vScale × VIEW_UP。描く側が自分の groundY(x, z) で置くほうがよい）,
       yaw（向き。three.js の object.rotation.y に入れると、その物のローカルの +z が (sin yaw, cos yaw) ＝ 下の「向く方向」を向く）,
       lat, lon, ele（本物の標高 m）, slope（斜面の急さ）,
       road: { id, name, s（道の上の距離 m。a から）, off（道の中心から m）, side（'left' | 'right'。a→b に進んで見て）},
       moved（元の位置から動かした m）, ...種類ごとの項目 }
   種類ごとの向きと項目（向く方向）：
     observatory・watertower・school：道のほうを向く。道の中心から 14 m 以上離す。
     heliport：丸い広場。半径 radius = 8 m。道から 20 m 以上。
     breakwater・pier：岸から海へ伸びる。yaw は海のほうの向き。length = 堤防 120 m・桟橋 40 m。岸（標高 0〜6 m で海に接する所）に置く。
     ferryport：桟橋（length 40 m）＋フェリー boat: { x, z, yaw }（海に46 m 出た所。桟橋と直角）。
     tunnel：道の上に置く。トンネルは、その道（分かれ道から分かれ道まで）のほぼ全部（両端の分かれ道から TUNNEL_EDGE m は外。2026-10-22 ユーザー要望：もっと長く）。
       portals: [ { x, z, yaw }, { x, z, yaw } ]（道の上の2つの入口。yaw は入口が向く方向＝トンネルの外へ）、length（入口の間の道のり m）、
       span: { road, sa, sb }（道の上のトンネルの区間。sa < sb、a から m。中にいるかを決めるのに使う）、path: [ { x, z }, … ]（sa から sb まで、PATH_STEP m ごとの道の点）。
     interchange：道の脇 9 m の看板。道のほうを向く。
     parking：道の脇の長方形。yaw は道に沿う。size = [24, 10]（m。長さ×幅）。
     town：家並み。items: [ { x, z, yaw, variant（0〜2） } ]（8軒。道の中心から 12 m 以上、家どうし 12 m 以上、陸の上、道のほうを向く）。
     colony：海鳥の繁殖地。items: [ { x, z, yaw } ]（14羽。半径150 m の陸の上、決まった乱数）。
   y は参考値。決まった乱数を使うので、同じ入力なら同じ配置になる。 */
(function (root) {
  const VIEW_UP = 2.2;
  const CLEAR = { observatory: 14, watertower: 14, school: 14, heliport: 20, interchange: 9, parking: 8,
    // ドット絵の板の小物（2026-10-23。docs/gemini-landmarks.md。位置は tools/place_landmarks_extra.py が landmarks.json に足す）
    fishhut: 14, netboat: 12, wreck: 0, windmill: 14, well: 9, smithy: 13, cart: 6, signpost: 6, shrine: 7, camp: 8, watchtower: 12, deadtree: 6, ruinpillar: 10, fumarole: 8, lavarock: 8, onifort: 14, palace: 30 };   // 道の中心から離す m（pierlamp は桟橋の上）
  const TOWN_N = 8, TOWN_R = 70, TOWN_ROAD = 12, TOWN_GAP = 12, BIRD_N = 14, BIRD_R = 150, BIRD_GAP = 6;
  const TUNNEL_EDGE = 130, PATH_STEP = 4, PIER_LEN = 40, WALL_LEN = 120, BOAT_OUT = 46;

  function rng(seed) {   // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hash = str => { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const yawOf = (fx, fz) => Math.atan2(fx, fz);   // 向く方向 (fx, fz) → rotation.y

  function place(net, isl, list) {
    const R = isl.rows, C = isl.cols, cell = isl.cell, vs = (isl.vScale || 0.2) * VIEW_UP;
    const elevCell = (r, c) => { r = Math.round(r); c = Math.round(c); return r < 0 || c < 0 || r >= R || c >= C ? -1 : isl.elev[r][c]; };
    const eleAt = (x, z) => {   // 本物の標高（双一次補間。海は0）
      const c = Math.max(0, Math.min(C - 1.001, x / cell)), r = Math.max(0, Math.min(R - 1.001, z / cell)), c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, v = (rr, cc) => Math.max(0, isl.elev[rr][cc]);
      return v(r0, c0) * (1 - fr) * (1 - fc) + v(r0, c0 + 1) * (1 - fr) * fc + v(r0 + 1, c0) * fr * (1 - fc) + v(r0 + 1, c0 + 1) * fr * fc;
    };
    const slopeAt = (x, z) => { const e = (a, b) => eleAt(a, b), d = cell; return Math.max(Math.abs(e(x + d, z) - e(x - d, z)), Math.abs(e(x, z + d) - e(x, z - d))) / (2 * d); };
    const isLand = (x, z) => elevCell(z / cell, x / cell) >= 2;
    const lat = z => isl.lat0 + (isl.lat1 - isl.lat0) * (z / cell) / (R - 1), lon = x => isl.lon0 + (isl.lon1 - isl.lon0) * (x / cell) / (C - 1);

    // 道の点（3D の座標）。10 m ごと。いちばん近い道の点と、そこでの道の向き・左右を求める
    const pts = [];
    for (const rd of net.roads) rd.grid.forEach(([r, c], i) => pts.push({ x: c * cell, z: r * cell, road: rd.id, i, s: rd.points[i][3] }));
    function nearestRoad(x, z) {
      let best = null, bd = Infinity;
      for (const p of pts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
      const rd = net.roads[best.road], a = rd.grid[Math.max(0, best.i - 1)], b = rd.grid[Math.min(rd.grid.length - 1, best.i + 1)];
      let tx = (b[1] - a[1]) * cell, tz = (b[0] - a[0]) * cell; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;   // a→b の向き
      const dx = x - best.x, dz = z - best.z, off = Math.hypot(dx, dz);
      // a→b に進んで見て、右はどちらか：北が上（z が小さい）の地図で、東（x＋）へ進むとき右は南（z＋）。右の法線 = (−tz, tx)
      const side = dx * -tz + dz * tx >= 0 ? 'right' : 'left';
      return { ...best, tx, tz, off, side, name: rd.name, px: best.x, pz: best.z };
    }
    // 道の中心の線（格子の点を結んだ折れ線）までの距離 m（nearestRoad の off は、いちばん近い格子の点まで＝約 20 m おきなので粗い）
    function roadDist(x, z) {
      let bd = Infinity;
      for (const rd of net.roads) for (let i = 1; i < rd.grid.length; i++) {
        const ax = rd.grid[i - 1][1] * cell, az = rd.grid[i - 1][0] * cell, vx = rd.grid[i][1] * cell - ax, vz = rd.grid[i][0] * cell - az, l2 = vx * vx + vz * vz || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)), d = Math.hypot(x - ax - vx * t, z - az - vz * t); if (d < bd) bd = d;
      }
      return bd;
    }
    // 道の中心から n m 離れた、道の脇（side の側）
    const beside = (nr, n, side) => { const k = side === 'right' ? 1 : -1; return { x: nr.px + -nr.tz * k * n, z: nr.pz + nr.tx * k * n }; };
    // 岸：標高 0〜6 m で海に接する、いちばん近い格子の点。海のほうの向き（海のセルが多い向き）
    function shoreNear(x, z) {
      let best = null, bd = Infinity;
      const r0 = Math.round(z / cell), c0 = Math.round(x / cell);
      for (let r = Math.max(1, r0 - 40); r < Math.min(R - 1, r0 + 40); r++) for (let c = Math.max(1, c0 - 40); c < Math.min(C - 1, c0 + 40); c++) {
        const e = isl.elev[r][c]; if (e < 0 || e > 6) continue;
        if (!(isl.elev[r - 1][c] < 0 || isl.elev[r + 1][c] < 0 || isl.elev[r][c - 1] < 0 || isl.elev[r][c + 1] < 0)) continue;
        const d = (r - r0) ** 2 + (c - c0) ** 2; if (d < bd) { bd = d; best = [r, c]; }
      }
      if (!best) return null;
      const sx = best[1] * cell, sz = best[0] * cell; let bx = 0, bz = 1, bn = -1;
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, fx = Math.sin(a), fz = Math.cos(a); let n = 0;
        for (let d = 20; d <= 120; d += 20) if (elevCell((sz + fz * d) / cell, (sx + fx * d) / cell) < 0) n++;
        if (n > bn) { bn = n; bx = fx; bz = fz; }
      }
      return { x: sx, z: sz, fx: bx, fz: bz };
    }

    const placed = list.map(lm => {
      const x0 = lm.c * cell, z0 = lm.r * cell, r = rng(hash(lm.id));
      let x = x0, z = z0, yaw = 0, extra = {}, nr = nearestRoad(x, z);
      const faceRoad = () => { const fx = nr.px - x, fz = nr.pz - z; return Math.hypot(fx, fz) > 0.1 ? yawOf(fx, fz) : yawOf(-nr.tz, nr.tx); };
      switch (lm.kind) {
        case 'observatory': case 'watertower': case 'school': case 'heliport': case 'fishhut': case 'netboat': case 'windmill': case 'well': case 'smithy': case 'cart': case 'signpost':
        case 'shrine': case 'camp': case 'watchtower': case 'deadtree': case 'ruinpillar': case 'fumarole': case 'lavarock': case 'onifort': case 'palace': {
          const need = CLEAR[lm.kind];
          if (lm.kind === 'signpost') {   // 道しるべ：分かれ道の、道と道のあいだ。どの道からも 3.4〜4.6 m（道の切り盛りで平らな所。2026-10-27 ユーザー指摘：急な斜面に立てると、坂が板にめり込んで見えた）
            let best = null;
            for (let d = 4; d <= 14 && !best; d += 1) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, px = x0 + Math.cos(a) * d, pz = z0 + Math.sin(a) * d, o = roadDist(px, pz); if (o >= 3.4 && o <= 4.6) { best = { x: px, z: pz }; break; } }
            if (best) { x = best.x; z = best.z; nr = nearestRoad(x, z); yaw = faceRoad(); break; }
          }
          if (nr.off < need) { const p = beside(nr, need, nr.off > 0.5 ? nr.side : (lm.road.side || 'right')); x = p.x; z = p.z; nr = nearestRoad(x, z); }
          yaw = faceRoad(); if (lm.kind === 'heliport') extra = { radius: 8 }; break;
        }
        case 'wreck': { yaw = faceRoad(); break; }   // 海辺に、そのまま（道から離す必要はない）
        case 'pierlamp': break;   // 桟橋の上（下の2周目で、桟橋の位置から決める）
        case 'interchange': { const p = beside(nr, CLEAR.interchange, nr.off > 0.5 ? nr.side : (lm.road.side || 'right')); x = p.x; z = p.z; yaw = faceRoad(); break; }
        case 'parking': { const p = beside(nr, CLEAR.parking + 5, nr.off > 0.5 ? nr.side : (lm.road.side || 'right')); x = p.x; z = p.z; yaw = yawOf(nr.tx, nr.tz); extra = { size: [24, 10] }; break; }
        case 'tunnel': {
          x = nr.px; z = nr.pz; yaw = yawOf(nr.tx, nr.tz);
          const rd = net.roads[nr.road], at = s => pointOnGrid(rd, s);
          const tsp = (net.tunnels || []).find(t => t.road === rd.name), sa = tsp ? tsp.sa : Math.min(TUNNEL_EDGE, rd.len / 4), sb = tsp ? tsp.sb : rd.len - sa, A = at(sa), B = at(sb);   // 区間は roads.json の tunnels（標高もそれに合わせる）。無ければ両端から TUNNEL_EDGE m 外
          // 筒（path）は、口の外にも MOUTH_EXT m 長く伸ばす（2026-10-24：口の切り通しは地形が屋根のようにせり上がるので、口の手前の数 m でカメラが地形の下に入り、裏が見えず暗くなった）。区間 sa・sb と道の標高はそのまま
          const MOUTH_EXT = 10, pa = Math.max(0, sa - MOUTH_EXT), pb = Math.min(rd.len, sb + MOUTH_EXT);
          const path = []; for (let k = 0, n = Math.max(2, Math.ceil((pb - pa) / PATH_STEP)); k <= n; k++) path.push(at(pa + (pb - pa) * k / n));
          // 入口の向き：入口の点から、トンネルの外のほうへ（道の向き）
          const dirAt = (s0, s1) => { const p = at(s0), q = at(s1); return yawOf(q.x - p.x, q.z - p.z); };
          extra = { length: Math.round(sb - sa), span: { road: nr.road, sa, sb }, path,
            portals: [{ x: A.x, z: A.z, yaw: dirAt(sa + 6, Math.max(0, sa - 6)) }, { x: B.x, z: B.z, yaw: dirAt(sb - 6, Math.min(rd.len, sb + 6)) }] };
          break;
        }
        case 'breakwater': case 'pier': case 'ferryport': {
          const sh = shoreNear(x0, z0) || { x: x0, z: z0, fx: 0, fz: 1 };
          x = sh.x; z = sh.z; yaw = yawOf(sh.fx, sh.fz); nr = nearestRoad(x, z);
          extra = { length: lm.kind === 'breakwater' ? WALL_LEN : PIER_LEN };
          if (lm.kind === 'ferryport') extra.boat = { x: x + sh.fx * BOAT_OUT + -sh.fz * 14, z: z + sh.fz * BOAT_OUT + sh.fx * 14, yaw: yawOf(-sh.fz, sh.fx) };   // 桟橋の脇に、桟橋と直角に
          break;
        }
        case 'town': {
          const items = []; let tries = 0;
          while (items.length < TOWN_N && tries++ < 400) {
            const a = r() * Math.PI * 2, d = 10 + r() * TOWN_R, hx = x0 + Math.cos(a) * d, hz = z0 + Math.sin(a) * d;
            if (!isLand(hx, hz) || eleAt(hx, hz) < 3 || slopeAt(hx, hz) > 0.6) continue;
            const q = nearestRoad(hx, hz); if (q.off < TOWN_ROAD) continue;
            if (items.some(h => Math.hypot(h.x - hx, h.z - hz) < TOWN_GAP)) continue;
            items.push({ x: hx, z: hz, yaw: yawOf(q.px - hx, q.pz - hz), variant: Math.floor(r() * 3) });
          }
          extra = { items, radius: TOWN_R }; yaw = faceRoad(); break;
        }
        case 'colony': {
          const items = []; let tries = 0;
          while (items.length < BIRD_N && tries++ < 600) {
            const a = r() * Math.PI * 2, d = r() * BIRD_R, bx = x0 + Math.cos(a) * d, bz = z0 + Math.sin(a) * d;
            if (!isLand(bx, bz) || items.some(b => Math.hypot(b.x - bx, b.z - bz) < BIRD_GAP)) continue;
            items.push({ x: bx, z: bz, yaw: r() * Math.PI * 2 });
          }
          extra = { items, radius: BIRD_R }; break;
        }
        default: yaw = faceRoad();
      }
      const e = eleAt(x, z);
      return { id: lm.id, kind: lm.kind, name: lm.name, how: lm.how, x, z, y: e * vs, yaw, lat: lat(z), lon: lon(x), ele: +e.toFixed(1), slope: +slopeAt(x, z).toFixed(2),
        road: { id: nr.road, name: nr.name, s: Math.round(nr.s), off: Math.round(Math.hypot(x - nr.px, z - nr.pz)), side: nr.side }, moved: Math.round(Math.hypot(x - x0, z - z0)), ...(lm.on ? { on: lm.on, at: lm.at } : {}), ...extra };
    });
    // 桟橋の灯り：桟橋（on）の上、根もとから at m の所、板の端（1.4 m）。高さは板の上（deck）。向きは桟橋と同じ
    for (const q of placed) {
      if (q.kind !== 'pierlamp') continue;
      const pier = placed.find(o => o.id === q.on); if (!pier) continue;
      const fx = Math.sin(pier.yaw), fz = Math.cos(pier.yaw), a = (q.at || 12) - 4;   // 桟橋の板は、根もとの 4 m 手前から（landmark-view.js と同じ）
      q.x = pier.x + fx * a + -fz * 1.4; q.z = pier.z + fz * a + fx * 1.4; q.yaw = pier.yaw + Math.PI / 2; q.deck = true; q.lat = lat(q.z); q.lon = lon(q.x);
    }
    return placed;
    function pointOnGrid(rd, s) {   // 道の上の距離 s の点（3D の座標）
      const p = rd.points; let lo = 0, hi = p.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p[mid][3] <= s) lo = mid; else hi = mid; }
      const t = p[hi][3] > p[lo][3] ? (s - p[lo][3]) / (p[hi][3] - p[lo][3]) : 0, a = rd.grid[lo], b = rd.grid[hi];
      return { x: (a[1] + (b[1] - a[1]) * t) * cell, z: (a[0] + (b[0] - a[0]) * t) * cell };
    }
  }

  const api = { VIEW_UP, CLEAR, place };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).landmarks = api;
})(typeof window !== 'undefined' ? window : globalThis);
