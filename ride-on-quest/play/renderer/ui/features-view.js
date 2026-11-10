/* 島の新しいものを3D に置く（docs/features.md。位置は RQ.mapData.features = assets/map/features.json）。view3d.js から呼ばれる。
   湖（水面の円。底は view3d.js が地形をならして作る）、川（地面に沿った青い筋。掘らない）、橋（川と道が交わる所：板と手すり）、温泉（湯だまり・小屋・湯気）。
   RQ.featuresView.create(T, scene, { F, groundY, cell, vs, water, net, at3, light }) → { update(dt) }
   water(color, flow)：view3d.js の水の材質（ちらちらするドットの水面）。flow が 0 でなければ、川のように流れる筋。 */
(function (root) {
  const WOOD = 0x8a6a48, DARK = 0x5a4030, ROOF = 0xb0392b, STONE = 0x9a948a;
  function create(T, scene, { F, groundY, cell, vs, water, net, at3, windowMat = null, light = false, roadPts = [], bridges = [] }) {
    if (!F) return { near: () => 0, update() {} };
    const M = c => new T.MeshLambertMaterial({ color: c, flatShading: true });
    const xz = p => [p[1] * cell, p[0] * cell];
    const steam = [];
    // ドット絵の板（assets/landmark/<ID>.png。manifest = RQ.landmarkArt に載ったものだけ）。下端を地面に（sink：高さの割合ぶん地面の下へ）
    const ART = root.RQ.landmarkArt || {}, texs = {};
    const sprite = (id, x, y, z, h, sink = 0) => {
      const a = ART[id]; if (!a) return null;
      let t = texs[id]; if (!t) { t = texs[id] = new T.TextureLoader().load(`../assets/landmark/${id}.png`); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; }
      const sp = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthTest: true, fog: true }));
      sp.center.set(0.5, 0); sp.scale.set(h * a.w / a.h, h, 1); sp.position.set(x, y - h * sink, z); scene.add(sp); return sp;
    };
    // 湖：盆地の等高線（outline）の形の水面。岸ぎわは浅い緑がかった明るい青、中ほどは落ち着いた青（海と同じ「浅いほど明るい」の考え方）
    if (F.lake) {
      const y = F.lake.level_m * vs, O = F.lake.outline.map(xz), cx = O.reduce((a, p) => a + p[0], 0) / O.length, cz = O.reduce((a, p) => a + p[1], 0) / O.length;
      const poly = (k, col, dy) => {
        const sh = new T.Shape(); O.forEach((p, i) => { const x = cx + (p[0] - cx) * k, z = cz + (p[1] - cz) * k; i ? sh.lineTo(x, -z) : sh.moveTo(x, -z); });
        const m = new T.Mesh(new T.ShapeGeometry(sh), water(col, 0)); m.rotation.x = -Math.PI / 2; m.position.y = y + dy; m.renderOrder = 1; scene.add(m);
      };
      poly(1.015, 0x4d8480, 0); poly(0.9, 0x3a707e, 0.06); poly(0.55, 0x2c5870, 0.12);
    }
    // 川：3 m ごとに刻んだ帯。左右の端は、それぞれの地面の高さに（斜面を流れ落ちる）
    for (const rv of F.rivers || []) {
      const P = rv.pts.map(xz), S = [P[0]];
      for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3)); for (let k = 1; k <= n; k++) S.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
      const pos = [], idx = [], WS = [], Wp = rv.widths || rv.pts.map(() => rv.width_m);
      P.slice(0, -1).forEach((_, j) => { const a = P[j], b = P[j + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3)); for (let k = 1; k <= n; k++) WS.push(Wp[j] + (Wp[j + 1] - Wp[j]) * k / n); }); WS.unshift(Wp[0]);
      for (let i = 0; i < S.length; i++) {
        const hw = (WS[i] != null ? WS[i] : rv.width_m) / 2;
        const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l * hw, nz = (b[0] - a[0]) / l * hw;
        const x1 = S[i][0] + nx, z1 = S[i][1] + nz, x2 = S[i][0] - nx, z2 = S[i][1] - nz;
        pos.push(x1, groundY(x1, z1) + 0.22, z1, x2, groundY(x2, z2) + 0.22, z2);
        if (i) { const k = pos.length / 3 - 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new T.Mesh(g, water(0x3a7a90, 1)); m.material.side = T.DoubleSide; m.material.polygonOffset = true; m.material.polygonOffsetFactor = -1; scene.add(m);
    }
    // 道（net の道。格子の点）と川（features の rivers）の交点のうち、(x, z) にいちばん近いもの → { x, z, tx, tz（その道の線分の向き）}。20 m より遠ければ null
    const RIV = (F.rivers || []).map(rv => rv.pts.map(xz));
    function crossAt(rd, x, z) {
      if (!rd || !rd.grid) return null;
      const R = rd.grid.map(xz); let best = null, bd = 20;
      for (let i = 1; i < R.length; i++) for (const V of RIV) for (let j = 1; j < V.length; j++) {
        const p1 = R[i - 1], p2 = R[i], p3 = V[j - 1], p4 = V[j], d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]); if (Math.abs(d) < 1e-9) continue;
        const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d, u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const cx = p1[0] + t * (p2[0] - p1[0]), cz = p1[1] + t * (p2[1] - p1[1]), dd = Math.hypot(cx - x, cz - z);
        if (dd < bd) { const l = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1; bd = dd; best = { x: cx, z: cz, tx: (p2[0] - p1[0]) / l, tz: (p2[1] - p1[1]) / l }; }
      }
      return best;
    }
    // 橋：川と道が交わる所。道の向きに、板と両側の手すり
    for (const b of F.bridges || []) {
      // 川と道が交わる点（features.json の at）に、道の向き（dir。格子の (行, 列) の向き）で置く（2026-10-24：前は、いちばん近い 10 m ごとの道の点に置いていたので、川からずれて、角度も変だった）
      const [bx, bz] = xz(b.at);
      let dv = b.dir || [0, 1];
      { // 橋の向きは、その道の、橋のまん中のいちばん近い所の向きに合わせる（2026-10-26 ユーザー指摘：トンネルを出て北へ下るところの橋の向きがおかしい。features.json の dir は、道の向きから最大 23° ずれていた）
        const rd = net && net.byName && net.roads[net.byName.get(b.road)];
        if (rd && rd.grid && rd.grid.length > 3) { let bi = 0, bd = 1e9; rd.grid.forEach((q, i) => { const d = (q[0] - b.at[0]) ** 2 + (q[1] - b.at[1]) ** 2; if (d < bd) { bd = d; bi = i; } });
          const q0 = rd.grid[Math.max(0, bi - 1)], q1 = rd.grid[Math.min(rd.grid.length - 1, bi + 1)], tr = [q1[0] - q0[0], q1[1] - q0[1]], tl = Math.hypot(tr[0], tr[1]);
          if (tl > 1e-6 && bd < 4) dv = [tr[0] / tl * (dv[0] * tr[0] + dv[1] * tr[1] < 0 ? -1 : 1), tr[1] / tl * (dv[0] * tr[0] + dv[1] * tr[1] < 0 ? -1 : 1)]; }
      }
      const dl = Math.hypot(dv[0], dv[1]) || 1;
      const near = { x: bx, z: bz, tx: dv[1] / dl, tz: dv[0] / dl };
      // 橋は、その道と川の本当の交点に置き、向きは交点での道の向き（2026-11-09 試走・判断 76A：ユーザー「候補1だ！」。堤防の辻のすぐ南の橋で、
      // features.json の at が交点から 2 m ずれ、板が道の横へはみ出し、川が板の端をかすめていた）。交点が at から 20 m 以内に無ければ、前の決め方のまま
      { const rd = net && net.byName && net.roads[net.byName.get(b.road)], X = crossAt(rd, bx, bz); if (X) { near.x = X.x; near.z = X.z; near.tx = X.tx; near.tz = X.tz; } }
      // 橋の長さは、そこの川幅＋両岸の溝のふち（川幅 + 4.6 m）。features.json の length_m（14 m）は長すぎて、曲がった道で欄干が道の中へはみ出した（2026-10-27 ユーザー指摘）
      let L = b.length_m || 14;
      { let bd = 1e9, wv = null; for (const rv of F.rivers || []) rv.pts.forEach((q, i) => { const d = (q[0] - b.at[0]) ** 2 + (q[1] - b.at[1]) ** 2; if (d < bd) { bd = d; wv = (rv.widths || [])[i] || rv.width_m; } });
        if (wv && bd < 9) L = Math.min(L, wv + 4.6); }
      const g = new T.Group(); g.position.set(near.x, groundY(near.x, near.z), near.z); g.rotation.y = Math.atan2(near.tx, near.tz) + Math.PI / 2; g.name = 'bridge'; scene.add(g);   // ローカルの +x が道の向き
      { // 橋の板を、道の坂に合わせて傾ける（水平のままだと、坂の道から浮いたり、めり込んだりして、向きがおかしく見える。2026-10-26）。ローカルの +x（＝ (-tx, -tz)）の両はしの道の高さから
        const hl = L / 2, ex = -near.tx, ez = -near.tz, y1 = groundY(near.x + ex * hl, near.z + ez * hl), y0 = groundY(near.x - ex * hl, near.z - ez * hl);
        g.rotation.z = Math.atan2(y1 - y0, 2 * hl); g.position.y = (y1 + y0) / 2; }
      const box = (w, h, d, c, x, y, z) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), M(c)); o.position.set(x, y, z); g.add(o); return o; };
      box(L, 0.22, 4.4, WOOD, 0, 0.46, 0);
      // 手すりの柱は、橋の長さの中だけ（前は橋の倍の長さに並び、道の中へはみ出した。2026-10-27）
      for (const s of [-1, 1]) { box(L, 0.16, 0.18, DARK, 0, 1.25, s * 2.1); box(L, 0.12, 0.14, DARK, 0, 0.8, s * 2.1); for (let k = -Math.floor(L / 4.8); k <= Math.floor(L / 4.8); k++) box(0.2, 1.0, 0.2, DARK, k * 2.4, 0.9, s * 2.1); }
    }
    // 温泉：湯だまり（水の円と、まわりの石）、小屋、立ちのぼる湯気
    if (F.onsen) {
      const [ox, oz] = xz(F.onsen.center), oy = groundY(ox, oz), g = new T.Group(); g.position.set(ox, oy, oz); scene.add(g);
      // 2026-10-23 ユーザー判断：温泉の板・湯だまり・小屋は出さない（唐突に見えるため）。湖のほとりのこの場所から、湯気だけが立ちのぼる
      const onsenArt = null;
      const cv = document.createElement('canvas'); cv.width = 12; cv.height = 12; const c = cv.getContext('2d'); c.fillStyle = '#fff';
      for (const [x, y, w] of [[3, 6, 6], [2, 4, 8], [4, 2, 4], [1, 7, 9], [3, 9, 6]]) c.fillRect(x, y, w, 2);
      const tex = new T.CanvasTexture(cv); tex.magFilter = T.NearestFilter; tex.minFilter = T.NearestFilter;
      for (let k = 0, n = light ? 8 : 18; k < n; k++) { const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, fog: true })); const a = k * 2.399, rr = 1.5 + 7.5 * Math.sqrt((k + 0.5) / n); s.userData = { k, x: Math.cos(a) * rr, z: Math.sin(a) * rr }; g.add(s); steam.push(s); }   // 数か所から少しずつ。夜でも見える白（光の影響を受けない Sprite）
    }
    // 石像の丘：巨大な鬼の石像（2026-10-26 ユーザー判断：モアイそのままをやめて、鬼にする。ローポリの 3D。台座なし。下を少し地面に埋めて、地面から生えて立つ）。
    // positions は features.json の stones.items（格子 (r, c)・形 a＝ 2 本角／b＝ 1 本角で口を開ける・高さ m）。海（北）を向いて並ぶ
    // 作りは、大きくて単純な形だけ（2026-10-26 ユーザー指摘「ちょっと酷い。もっとシンプルに」：細かい飾り・こけ・小さなきばをやめた）。肩の台形・四角い頭・太いまゆ・つり上がった目・大きな口と 2 本のきば・大きな角
    const oniBust = (kind, H) => {
      const g = new T.Group(), st = 0x9a9ca2, stD = 0x6a6c74, dark = 0x24242a, bone = 0xefe8d2;
      const add = (geo, col, x, y, z, parent = g) => { const m = new T.Mesh(geo, M(col)); m.position.set(x * H, y * H, z * H); parent.add(m); return m; };
      const B = (w, h, d) => new T.BoxGeometry(w * H, h * H, d * H);
      add(new T.CylinderGeometry(0.36 * H, 0.52 * H, 0.42 * H, 6), st, 0, 0.21, 0).rotation.y = Math.PI / 6;       // 肩（台形）
      const head = new T.Group(); head.position.y = 0.42 * H; g.add(head);
      const hh = (geo, col, x, y, z) => add(geo, col, x, y, z, head);
      hh(B(0.62, 0.5, 0.52), st, 0, 0.25, 0);                                                                  // 頭（四角）
      hh(B(0.68, 0.1, 0.2), stD, 0, 0.38, 0.22);                                                                // 太いまゆ
      for (const sx of [-1, 1]) { const e = hh(B(0.16, 0.07, 0.06), dark, sx * 0.14, 0.31, 0.27); e.rotation.z = -sx * 0.3; }   // 目（つり上がる）
      hh(B(0.1, 0.14, 0.1), stD, 0, 0.21, 0.28);                                                                // 鼻
      hh(B(0.38, kind === 'b' ? 0.14 : 0.09, 0.06), dark, 0, 0.09, 0.27);                                       // 口
      for (const sx of [-1, 1]) { const f = new T.Mesh(new T.ConeGeometry(0.045 * H, 0.14 * H, 5), M(bone)); f.position.set(sx * 0.12 * H, 0.15 * H, 0.275 * H); head.add(f); }   // 下から上へのきば
      for (const sx of kind === 'b' ? [0] : [-1, 1]) { const h = new T.Mesh(new T.ConeGeometry(0.1 * H, 0.46 * H, 6), M(bone)); h.position.set(sx * 0.2 * H, 0.72 * H, 0.0); h.rotation.z = -sx * 0.22; head.add(h); }   // 角（a＝2 本、b＝1 本）
      return g;
    };
    for (const it of (F.stones || {}).items || []) {
      const [sx, sz] = xz(it.at), sy = Math.min(groundY(sx, sz), groundY(sx + 2, sz), groundY(sx - 2, sz), groundY(sx, sz + 2), groundY(sx, sz - 2));
      const o = oniBust(it.kind, it.m); o.position.set(sx, sy - it.m * 0.07, sz); o.rotation.y = Math.PI + (it.kind === 'b' ? 0.08 : -0.06); o.name = 'oni'; scene.add(o);
    }
    // 岩のランドマーク（features.json の rocks。2026-10-28 試走の指摘 1・8）：弁天洞窟の入り口（岩の壁と暗い口・小さな赤い鳥居。face の点＝道のほうを向く）と、ヒョウタン岩（ひょうたん形の大岩。くびれにしめ縄）。
    // 鬼の石像と同じ、大きくて単純なローポリ。足もとは、まわりのいちばん低い地面から少し埋める
    const ROCK = 0x857a6e, ROCK_D = 0x6a6058, ROCK_L = 0x9c9184;
    const lowest = (x, z, r) => { let y = groundY(x, z); for (let k = 0; k < 8; k++) y = Math.min(y, groundY(x + Math.cos(k * Math.PI / 4) * r, z + Math.sin(k * Math.PI / 4) * r)); return y; };
    const boulder = (g, r, col, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new T.Mesh(new T.DodecahedronGeometry(r, 0), M(col)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };   // 回さない（横に伸ばした岩が回ると、前へふくらんで口をふさぐ）
    const cave = H => {   // H：岩の壁の高さ m。ローカルの +z が口の向き
      const g = new T.Group();
      boulder(g, H * 0.62, ROCK, 0, H * 0.32, -H * 0.42, 1.25, 0.95, 0.8);                           // 壁の大きな塊
      boulder(g, H * 0.42, ROCK_D, -H * 0.62, H * 0.2, -H * 0.18, 1, 0.9, 0.9); boulder(g, H * 0.4, ROCK_L, H * 0.64, H * 0.18, -H * 0.2, 1, 0.85, 0.9);   // 両わき
      boulder(g, H * 0.34, ROCK_L, H * 0.05, H * 0.86, -H * 0.3, 1.3, 0.7, 1);                         // 上
      // 口：上が丸いアーチの暗い穴（奥へ向かって少しずつ暗く）
      const w = H * 0.26, h = H * 0.42;
      for (const [k, col, dz] of [[1.18, 0x3a3430, 0.02], [1, 0x141216, 0.04], [0.7, 0x050506, 0.06]]) {
        const sh = new T.Shape(), ww = w * k, hh = h * k;
        sh.moveTo(-ww, 0); sh.lineTo(-ww, hh - ww); sh.absarc(0, hh - ww, ww, Math.PI, 0, true); sh.lineTo(ww, 0); sh.lineTo(-ww, 0);
        const m = new T.Mesh(new T.ShapeGeometry(sh, 8), new T.MeshBasicMaterial({ color: col, fog: true, side: T.DoubleSide })); m.position.set(0, -0.2, H * 0.09 + dz); g.add(m);
      }
      // 口のまわりの縁石と、手前の転がった岩
      for (const [x, s] of [[-w * 1.35, 0.22], [w * 1.4, 0.2], [-w * 2.2, 0.14], [w * 2.4, 0.16]]) boulder(g, H * s, ROCK_D, x, H * s * 0.4, H * 0.18, 1, 0.8, 1);
      // 小さな赤い鳥居（弁天さまの洞窟）。口の前 H×0.55
      const red = 0xc0392b, tz = H * 0.62, th = H * 0.36, tw = H * 0.3;
      for (const sx of [-1, 1]) { const p = new T.Mesh(new T.CylinderGeometry(H * 0.022, H * 0.026, th, 6), M(red)); p.position.set(sx * tw / 2, th / 2 - 0.3, tz); g.add(p); }
      const kasagi = new T.Mesh(new T.BoxGeometry(tw * 1.45, H * 0.035, H * 0.05), M(0x2a2420)); kasagi.position.set(0, th - 0.3 + H * 0.02, tz); g.add(kasagi);
      const nuki = new T.Mesh(new T.BoxGeometry(tw * 1.15, H * 0.025, H * 0.035), M(red)); nuki.position.set(0, th * 0.78 - 0.3, tz); g.add(nuki);
      return g;
    };
    const gourd = H => {   // H：高さ m。下のふくらみ・くびれ・上のふくらみ。くびれにしめ縄と紙垂
      const g = new T.Group(), ball = (r, y, col, s = 1) => { const m = new T.Mesh(new T.IcosahedronGeometry(r, 1), M(col)); m.position.y = y; m.scale.set(s, 1, s); g.add(m); return m; };
      ball(H * 0.33, H * 0.3, ROCK, 1.05); ball(H * 0.17, H * 0.6, ROCK_D, 1); ball(H * 0.24, H * 0.8, ROCK_L, 0.95);
      const top = new T.Mesh(new T.IcosahedronGeometry(H * 0.12, 0), M(0x4f7a3a)); top.position.y = H * 1.0; top.scale.set(1.3, 0.45, 1.3); g.add(top);   // てっぺんの草
      const rope = new T.Mesh(new T.TorusGeometry(H * 0.18, H * 0.028, 5, 14), M(0xd8c9a0)); rope.rotation.x = Math.PI / 2; rope.position.y = H * 0.6; g.add(rope);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4, p = new T.Mesh(new T.BoxGeometry(H * 0.035, H * 0.08, H * 0.005), new T.MeshLambertMaterial({ color: 0xf4f1e8 })); p.position.set(Math.sin(a) * H * 0.2, H * 0.55, Math.cos(a) * H * 0.2); p.rotation.y = a; g.add(p); }
      return g;
    };
    for (const it of F.rocks || []) {
      const [x, z] = xz(it.at), o = it.kind === 'cave' ? cave(it.m) : gourd(it.m);
      if (it.face) { const [fx, fz] = xz(it.face); o.rotation.y = Math.atan2(fx - x, fz - z); }
      o.position.set(x, lowest(x, z, it.m * 0.4) - it.m * 0.06, z); o.name = it.kind; scene.add(o);
    }
    // 東の街（城下町）：リスボン風の坂の町（2026-10-23 ユーザー判断。ベネチア風は取りやめ）。急な斜面に段々に広がる。
    // 家：道の両側に壁をすき間なく（道のふちから 1.5 m。間口 6〜10 m、2〜4 階）。家は1軒ずつ地面に合わせて段違いに建ち、軒の高さがずれる。壁は白・淡い黄・淡いピンク・淡い青、ところどころタイル（青い模様）の壁、屋根はテラコッタ。
    // 飾り：石段の路地、海を見下ろす展望台（白黒の敷石の波模様）、坂を上る黄色い路面電車、坂の途中の教会の塔。奥の丘に白妙城。座標は街の中心からの m（x＝東、z＝南）
    const east = (F.towns || []).find(t => t.style === 'lisbon');
    const trams = []; let houseNear = () => 0;
    if (east) {
      const [cx, cz] = xz(east.center), rm = east.rect_m;
      const pal = (net.placed || []).find(p => p.kind === 'palace'), px = pal ? pal.x : cx - 125, pz = pal ? pal.z : cz;
      const root3 = new T.Group(); scene.add(root3);
      const gmin = (x, z, hw, hd) => Math.min(groundY(x, z), groundY(x + hw, z + hd), groundY(x - hw, z + hd), groundY(x + hw, z - hd), groundY(x - hw, z - hd));
      const gmax = (x, z, hw, hd) => Math.max(groundY(x, z), groundY(x + hw, z + hd), groundY(x - hw, z + hd), groundY(x + hw, z - hd), groundY(x - hw, z - hd));
      const solid = (w, h, d, col, x, y, z, parent = root3) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), M(col)); o.position.set(x, y, z); parent.add(o); return o; };
      // 坂の途中の教会：塔（淡い壁・テラコッタの帽子）と、となりの身廊
      const bt = east.bell_tower_m, btX = cx + bt[0], btZ = cz + bt[1];
      { const b0 = gmin(btX, btZ, 3.4, 3.4) - 1.2, hh = 30;
        solid(6.4, hh, 6.4, 0xf1ead8, btX, b0 + hh / 2, btZ);
        solid(5.4, 5, 5.4, 0xf6f1e4, btX, b0 + hh + 2.5, btZ);
        for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) solid(0.9, 5.2, 0.9, 0xfffaf0, btX + dx, b0 + hh + 2.5, btZ + dz);
        const roof = new T.Mesh(new T.ConeGeometry(4.2, 8, 4), M(0xb5502f)); roof.rotation.y = Math.PI / 4; roof.position.set(btX, b0 + hh + 9, btZ); root3.add(roof);
        const tip = new T.Mesh(new T.CylinderGeometry(0.08, 0.2, 3, 6), M(0xd4b24a)); tip.position.set(btX, b0 + hh + 14.5, btZ); root3.add(tip);
        const nx = btX + 11, nb = gmin(nx, btZ, 5.5, 4.5) - 1.0;
        solid(11, 9, 9, 0xf6f1e4, nx, nb + 4.5, btZ);
        const nr = new T.Mesh(new T.ConeGeometry(8, 4, 4), M(0xb5502f)); nr.rotation.y = Math.PI / 4; nr.scale.set(1.15, 1, 0.95); nr.position.set(nx, nb + 11, btZ); root3.add(nr);
      }
      // タイル（アズレージョ風）の壁の絵：白地に青の模様、4×4 枚
      const azTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d'); c.fillStyle = '#f4f1e6'; c.fillRect(0, 0, 32, 32);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = i * 8, y = j * 8; c.fillStyle = '#5f8fc8'; c.fillRect(x, y, 8, 1); c.fillRect(x, y + 7, 8, 1); c.fillRect(x, y, 1, 8); c.fillRect(x + 7, y, 1, 8); c.fillStyle = '#e8eef4'; c.fillRect(x + 1, y + 1, 6, 6); c.fillStyle = '#9db9dc'; c.fillRect(x + 3, y + 3, 2, 2); }   // 縁取りの四角のタイル（真ん中に小さな点。十字には見えない）
        const t = new T.CanvasTexture(cv); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; return t; })();
      // 家の置き場：向きつきの長方形の重なりと、道・鐘楼・展望台・石段・電車の線とのよけ。決まった乱数
      let seed = 4242; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
      const WC = [0xf6f2e8, 0xf6f2e8, 0xf0e2a8, 0xeec4c0, 0xc4d8e8, 0xf2e8d0, 0xe8e0c0], RC = [0xb5502f, 0xa8442e, 0xc0603a, 0xb85a3a];
      const lots = [];
      const inX0 = cx + rm[0] + 3, inX1 = cx + 60, inZ0 = cz + rm[1] + 3, inZ1 = cz + rm[3] - 3;
      const ov = east.overlook_m, ovR = [cx + ov[0], cz + ov[1], cx + ov[2], cz + ov[3]];
      const runs = [];
      for (const road of net.roads) {
        let run = [];
        for (const pt of road.points) { const v = at3(pt[0], pt[1]); if (v.x > inX0 - 12 && v.x < inX1 + 12 && v.z > inZ0 - 12 && v.z < inZ1 + 12) run.push([v.x, v.z]); else { if (run.length > 1) runs.push(run); run = []; } }
        if (run.length > 1) runs.push(run);
      }
      const dense = [];
      for (const run of runs) for (let k = 0; k < run.length - 1; k++) {
        const a = run[k], b = run[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-3) continue;
        for (let t = 0; t < l; t += 1) dense.push({ x: a[0] + (b[0] - a[0]) * t / l, z: a[1] + (b[1] - a[1]) * t / l, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l });
      }
      const CLEAR = 2.9;
      const corners = l => { const ux = l.fz, uz = -l.fx; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [l.x + ux * a * l.w / 2 + l.fx * b * l.d / 2, l.z + uz * a * l.w / 2 + l.fz * b * l.d / 2]); };
      const sat = (A, B, shrink) => {
        for (const P of [A, B]) for (let k = 0; k < 4; k++) {
          const a = P[k], b = P[(k + 1) % 4], nx = b[1] - a[1], nz = -(b[0] - a[0]), nl = Math.hypot(nx, nz) || 1;
          let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
          for (const q2 of A) { const d = (q2[0] * nx + q2[1] * nz) / nl; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
          for (const q2 of B) { const d = (q2[0] * nx + q2[1] * nz) / nl; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
          if (a1 - shrink <= b0 || b1 - shrink <= a0) return false;
        }
        return true;
      };
      const bin = new Map();
      const binAdd = (l, c) => { const e = { l, c }, r = Math.hypot(l.w, l.d) / 2; for (let bx = Math.floor((l.x - r) / 12); bx <= Math.floor((l.x + r) / 12); bx++) for (let bz = Math.floor((l.z - r) / 12); bz <= Math.floor((l.z + r) / 12); bz++) { const k = bx + ',' + bz; (bin.get(k) || bin.set(k, []).get(k)).push(e); } };
      const reserve = (x, z, w, d) => { const l = { x, z, w, d, fx: 0, fz: 1 }; binAdd(l, corners(l)); };   // 家を置かない所（石段・電車の線・教会の身廊・展望台）
      reserve(btX + 11, btZ, 14, 12); reserve((ovR[0] + ovR[2]) / 2, (ovR[1] + ovR[3]) / 2, ovR[2] - ovR[0] + 4, ovR[3] - ovR[1] + 4);
      const tr = east.tram; if (tr) reserve(cx + (tr.x0 + tr.x1) / 2, cz + tr.z, tr.x1 - tr.x0 + 6, 6);
      // 白妙城への見通し（2026-10-24 ユーザー判断 A）：町の入口（s≈99）と s≈190・430・490 から、城の方へ幅 12 m の筋に家を置かない（家並みの上に城が見えるように）
      {
        const hid = net.roads.find(r => r.name === '日方泊の海岸');
        if (hid) for (const sv of [99, 190, 430, 490]) {
          const q = root.RQ.roadnet.pointAt(hid, sv), v = at3(q.lat, q.lon), dx = px - v.x, dz = pz - v.z, L = Math.hypot(dx, dz) || 1;
          for (let t = 4; t < Math.min(L - 25, 150); t += 5) reserve(v.x + dx / L * t, v.z + dz / L * t, 12, 12);
        }
      }
      const free = l => {
        if (l.x - l.w < inX0 || l.x + l.w > inX1 || l.z - l.w < inZ0 || l.z + l.w > inZ1) return false;
        const c = corners(l), r = Math.hypot(l.w, l.d) / 2;
        for (const q2 of c) { if (q2[0] < inX0 || q2[0] > inX1 || q2[1] < inZ0 || q2[1] > inZ1) return false; if (Math.hypot(q2[0] - btX, q2[1] - btZ) < 6) return false; }
        const ux = l.fz, uz = -l.fx;
        for (const dp of dense) {
          const dx = dp.x - l.x, dz = dp.z - l.z; if (dx * dx + dz * dz > (r + CLEAR) * (r + CLEAR)) continue;
          const lx = dx * ux + dz * uz, lz = dx * l.fx + dz * l.fz;
          if (Math.hypot(Math.max(Math.abs(lx) - l.w / 2, 0), Math.max(Math.abs(lz) - l.d / 2, 0)) < CLEAR) return false;
        }
        for (let bx = Math.floor((l.x - r) / 12); bx <= Math.floor((l.x + r) / 12); bx++) for (let bz = Math.floor((l.z - r) / 12); bz <= Math.floor((l.z + r) / 12); bz++)
          for (const o of bin.get(bx + ',' + bz) || []) if (Math.hypot(o.l.x - l.x, o.l.z - l.z) < r + Math.hypot(o.l.w, o.l.d) / 2 && sat(c, o.c, 0.15)) return false;
        return true;
      };
      const put = l => { if (!free(l)) return false; binAdd(l, corners(l)); lots.push(l); return true; };
      const mk = (x, z, w, d, fx, fz, fl) => ({ x, z, w, d, floors: fl, hv: rnd() * 1.4, fx, fz, col: WC[Math.floor(rnd() * WC.length)], rc: RC[Math.floor(rnd() * RC.length)], az: rnd() < 0.06 });
      // 石段の路地（飾り）：道から離れた所に、東西（坂の向き）の細い路地を 3 本。家はここに建てない
      const stairs = [];
      for (let z = inZ0 + 8, n = 0; z < inZ1 - 8 && n < (east.stairs || 3); z += 7) for (let x = inX0 + 12; x < inX1 - 30; x += 9) {
        const l = { x: x + 8, z, w: 18, d: 3.4, fx: 0, fz: 1 };
        if (Math.abs(z - (cz + (tr ? tr.z : -36))) < 8) break;
        if (dense.some(dp => Math.hypot(dp.x - l.x, dp.z - l.z) < 13) || corners(l).some(q2 => q2[0] < inX0 || q2[0] > inX1)) continue;
        let ok = true; for (const st of stairs) if (Math.hypot(st.x - l.x, st.z - l.z) < 30) ok = false;
        if (Math.hypot(px - l.x, pz - l.z) < 95) ok = false;   // 白妙城の丘の台（+20 m）の裾には置かない（急な斜面で段が浮く。2026-10-24）
        if (!ok || !free({ ...l, d: 5 })) continue;
        binAdd(l, corners(l)); stairs.push(l); n++; z += 30; break;
      }
      // 1 道ぞい：道の両側に壁をすき間なく
      for (const run of runs) {
        const pts = []; for (let k = 0; k < run.length - 1; k++) { const a = run[k], b = run[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t < l; t += 1) pts.push({ x: a[0] + (b[0] - a[0]) * t / l, z: a[1] + (b[1] - a[1]) * t / l, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l }); }
        for (const side of [-1, 1]) {
          let t = 0;
          while (t < pts.length - 2) {
            const w = 6 + Math.floor(rnd() * 5), d = 7 + Math.floor(rnd() * 4), fl = 2 + Math.floor(rnd() * 3), q2 = pts[Math.min(pts.length - 1, Math.floor(t + w / 2))];
            const nx = -q2.tz * side, nz = q2.tx * side, off = 4.0 + d / 2;
            if (put(mk(q2.x + nx * off, q2.z + nz * off, w, d, -nx, -nz, fl))) t += w + 0.2; else t += 2;
          }
        }
      }
      // 2 のこりの街区：2 周、格子で並べる（向きは近い道に合わせる）
      for (const step of [9, 7]) for (let x = inX0; x < inX1; x += step) for (let z = inZ0; z < inZ1; z += step) {
        let best = null, bd = 1e9; for (let k = 0; k < dense.length; k += 3) { const dd = (dense[k].x - x) ** 2 + (dense[k].z - z) ** 2; if (dd < bd) { bd = dd; best = dense[k]; } }
        if (!best || bd > 60 * 60) continue;
        const sgn = ((x - best.x) * -best.tz + (z - best.z) * best.tx) >= 0 ? 1 : -1;
        put(mk(x + rnd() * 1.5, z + rnd() * 1.5, step - 1 + Math.floor(rnd() * 2), step - 1, best.tz * sgn, -best.tx * sgn, 2 + Math.floor(rnd() * 3)));
      }
      // 斜面の山側（町の西）：家並みが段々に上がる。海（東）のほうを向く
      for (let gx = -112; gx <= -66; gx += 12) for (let gz = -66; gz <= 66; gz += 13) {
        const wx = cx + gx + rnd() * 3, wz = cz + gz + rnd() * 3;
        if (Math.abs(gz) < 9 || groundY(wx, wz) < 0.5 || dense.some(dp => Math.hypot(dp.x - wx, dp.z - wz) < 9)) continue;
        if (roadPts.some(p => Math.hypot(p.x - wx, p.z - wz) < 9)) continue;
        const l = mk(wx, wz, 9, 8, 1, 0, 2); const c = corners(l), r = Math.hypot(l.w, l.d) / 2;
        let hit = false; for (const o of bin.get(Math.floor(wx / 12) + ',' + Math.floor(wz / 12)) || []) if (Math.hypot(o.l.x - wx, o.l.z - wz) < r + Math.hypot(o.l.w, o.l.d) / 2 && sat(c, o.c, 0.15)) hit = true;
        if (!hit) { binAdd(l, c); lots.push(l); }
      }
      // 海ぎわの家：足もとの地面が、海面（高さ 0）に近い（1 m 未満）家は建てない（2026-10-26 ユーザー指摘：海岸ぞいの家が海に沈んで見える。家は陸がわだけ）
      let nSea = 0;
      for (let i = lots.length - 1; i >= 0; i--) { const l = lots[i]; if (gmin(l.x, l.z, l.w / 2 * 0.9, l.d / 2 * 0.9) < 1.0) { lots.splice(i, 1); nSea++; } }
      if (typeof window !== 'undefined' && window.__rq) window.__rq.lotsDropped = nSea;   // テスト用
      // 家の描画：壁（地面に合わせた底。下り側の足もとを埋める）・屋根・窓。タイル壁は別の InstancedMesh
      const wall = new T.BoxGeometry(1, 1, 1); wall.translate(0, 0.5, 0);
      const roofG = new T.ConeGeometry(0.7071, 1, 4); roofG.rotateY(Math.PI / 4); roofG.translate(0, 0.5, 0);
      const winG = new T.BoxGeometry(0.9, 1.5, 0.16), frameG = new T.BoxGeometry(1.5, 1.95, 0.1), doorG = new T.BoxGeometry(1.4, 2.4, 0.22);
      // 窓と扉（2026-10-23 ユーザー要望：すべての家に）：道に面した壁に扉1つ（1階）と、階ごとの窓。両わきの壁にも窓。窓は鎧戸（色つきの枠）つき。InstancedMesh のまま
      let nWin = 0; for (const l of lots) nWin += l.floors * (Math.max(2, Math.floor(l.w / 3)) + 2 * Math.max(1, Math.floor(l.d / 4)));
      const plain = lots.filter(l => !l.az), tiled = lots.filter(l => l.az);
      const walls = new T.InstancedMesh(wall, new T.MeshLambertMaterial({ flatShading: true }), Math.max(1, plain.length)), wallsT = new T.InstancedMesh(wall, new T.MeshLambertMaterial({ map: azTex }), Math.max(1, tiled.length));
      const roofs = new T.InstancedMesh(roofG, new T.MeshLambertMaterial({ flatShading: true }), lots.length);
      const lampA = new Float32Array(Math.max(1, nWin)).fill(2); winG.setAttribute('aLamp', new T.InstancedBufferAttribute(lampA, 1));   // 窓ごとの点く時刻のしきい値（2＝消えたまま）
      const wins = new T.InstancedMesh(winG, windowMat ? windowMat(0x3a2c28) : new T.MeshLambertMaterial({ color: 0x3a2c28 }), Math.max(1, nWin));
      const frames = new T.InstancedMesh(frameG, new T.MeshLambertMaterial({ flatShading: true }), Math.max(1, nWin)), doors = new T.InstancedMesh(doorG, new T.MeshLambertMaterial({ flatShading: true }), lots.length);
      const SH = [0x4f7f62, 0x4a6a9a, 0x8a5a3a, 0xb87a3a, 0x6a4a7a, 0xa84a3a], DR = [0x5a3a24, 0x2f4f7a, 0x3a6a4a, 0x7a2f2a];
      const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), c = new T.Color(), up = new T.Vector3(0, 1, 0); let wi = 0, pi = 0, ti = 0, di = 0;
      // 家ごとの灯り：全体の約 78% が点く。点く家は、夕方〜夜の早い時刻（0.1〜0.6）にずれて点く（同じ家の窓は同じ時刻に点く。部屋ごとに少しずらす）
      let curLamp = 2; const lampFor = i => { const h = Math.abs(Math.sin(i * 91.7 + 3.1)) * 1000 % 1, h2 = Math.abs(Math.sin(i * 17.3 + 5.9)) * 1000 % 1; return h < 0.78 ? 0.1 + h2 * 0.5 : 2; };
      lots.forEach((l, i) => {
        curLamp = lampFor(i);
        const yaw = Math.atan2(l.fx, l.fz); q.setFromAxisAngle(up, yaw);
        const hw = l.w / 2 * 0.9, hd = l.d / 2 * 0.9, base = gmin(l.x, l.z, hw, hd) - 0.5, top = gmax(l.x, l.z, hw, hd) + l.floors * 3.2 + 0.6 + l.hv, hh = top - base;
        sc.set(l.w, hh, l.d); m4.compose(new T.Vector3(l.x, base, l.z), q, sc);
        if (l.az) { wallsT.setMatrixAt(ti, m4); wallsT.setColorAt(ti++, c.set(0xffffff)); } else { walls.setMatrixAt(pi, m4); walls.setColorAt(pi++, c.set(l.col)); }
        sc.set(l.w * 1.1, 2.0 + (l.floors > 3 ? 0.4 : 0), l.d * 1.1); m4.compose(new T.Vector3(l.x, top, l.z), q, sc); roofs.setMatrixAt(i, m4); roofs.setColorAt(i, c.set(l.rc));
        const nw = Math.max(2, Math.floor(l.w / 3)), fxv = Math.sin(yaw), fzv = Math.cos(yaw), rxv = Math.cos(yaw), rzv = -Math.sin(yaw);
        const gf = groundY(l.x + fxv * l.d / 2, l.z + fzv * l.d / 2), shc = SH[(i * 7 + Math.floor(l.hv * 5)) % SH.length], doorK = Math.floor(nw / 2);
        const win = (x, y, z, ang, col) => {   // x,y,z：壁の面の中心。ang：壁の向き（前＝yaw）。枠（鎧戸の色）を奥に、ガラスを手前に
          const qq = new T.Quaternion().setFromAxisAngle(up, ang), nx = Math.sin(ang), nz = Math.cos(ang);
          sc.set(1, 1, 1); m4.compose(new T.Vector3(x + nx * 0.03, y, z + nz * 0.03), qq, sc); frames.setMatrixAt(wi, m4); frames.setColorAt(wi, c.set(col));
          m4.compose(new T.Vector3(x + nx * 0.08, y, z + nz * 0.08), qq, sc); lampA[wi] = curLamp < 2 ? Math.min(0.95, curLamp + (wi % 3) * 0.04) : 2; wins.setMatrixAt(wi++, m4);
        };
        // 道に面した壁（前）：扉は真ん中（1階）。窓は階ごと
        for (let f = 0; f < l.floors; f++) for (let k = 0; k < nw; k++) {
          const off = (k - (nw - 1) / 2) * (l.w / nw), y = gf + 1.9 + f * 3.2; if (y + 0.8 > top) continue;
          if (f === 0 && k === doorK) continue;
          win(l.x + fxv * (l.d / 2) + rxv * off, y, l.z + fzv * (l.d / 2) + rzv * off, yaw, shc);
        }
        { const off = ((doorK) - (nw - 1) / 2) * (l.w / nw), dq = new T.Quaternion().setFromAxisAngle(up, yaw);
          sc.set(1, 1, 1); m4.compose(new T.Vector3(l.x + fxv * (l.d / 2 + 0.06) + rxv * off, gf + 1.25, l.z + fzv * (l.d / 2 + 0.06) + rzv * off), dq, sc); doors.setMatrixAt(di, m4); doors.setColorAt(di++, c.set(DR[(i * 3) % DR.length])); }
        // 両わきの壁：窓だけ（壁の向きは前から ±90°）
        const nd = Math.max(1, Math.floor(l.d / 4));
        for (const sg of [-1, 1]) for (let f = 0; f < l.floors; f++) for (let k = 0; k < nd; k++) {
          const offd = (k - (nd - 1) / 2) * (l.d / nd), y = gf + 1.9 + f * 3.2 + 0.2; if (y + 0.8 > top) continue;
          win(l.x + rxv * sg * (l.w / 2) - fxv * offd, y, l.z + rzv * sg * (l.w / 2) - fzv * offd, yaw + sg * Math.PI / 2, shc);
        }
      });
      // カメラ用の問い合わせ：(x, z) から m 以内に家があるか（家の長方形までの距離。狭い路地で、カメラを家にめり込ませない・近め高めにするため）
      const hb = new Map(); lots.forEach(l => { const r = Math.hypot(l.w, l.d) / 2; for (let bx = Math.floor((l.x - r) / 12); bx <= Math.floor((l.x + r) / 12); bx++) for (let bz = Math.floor((l.z - r) / 12); bz <= Math.floor((l.z + r) / 12); bz++) { const k = bx + ',' + bz; (hb.get(k) || hb.set(k, []).get(k)).push(l); } });
      houseNear = (x, z, m) => { let best = 1e9; for (const l of hb.get(Math.floor(x / 12) + ',' + Math.floor(z / 12)) || []) { const dx = x - l.x, dz = z - l.z, lx = dx * l.fz - dz * l.fx, lz = dx * l.fx + dz * l.fz; const d = Math.hypot(Math.max(Math.abs(lx) - l.w / 2, 0), Math.max(Math.abs(lz) - l.d / 2, 0)); if (d < best) best = d; } return best < m ? best : 0; };
      walls.count = pi; wallsT.count = ti; wins.count = wi; winG.attributes.aLamp.needsUpdate = true; frames.count = wi; doors.count = di; scene.add(walls, wallsT, roofs, wins, frames, doors);
      // 石段の路地：坂を上る段（地面に合わせた石の段。両わきは家の壁）
      if (root.__rq) root.__rq.stairs = stairs;   // テスト用
      for (const st of stairs) {
        const n = Math.round(st.w / 1.1);
        for (let k = 0; k < n; k++) { const x = st.x - st.w / 2 + (k + 0.5) * st.w / n, y = groundY(x, st.z) + 0.1, yl = groundY(x, st.z - 1.7), yr = groundY(x, st.z + 1.7); const lo = Math.min(y, yl, yr) - 0.6;
          solid(st.w / n + 0.04, y - lo, 3.0, k % 2 ? 0xd4cbb6 : 0xc9c0aa, x, (y + lo) / 2, st.z); }
      }
      // 海を見下ろす展望台：石の小さな広場（白黒の敷石の波模様）と、手すり。海（東）側と、南北の縁に
      { const [ox0, oz0, ox1, oz1] = ovR, ow = ox1 - ox0, od = oz1 - oz0, ocx = (ox0 + ox1) / 2, ocz = (oz0 + oz1) / 2;
        const top = gmax(ocx, ocz, ow / 2, od / 2) + 0.15, low = gmin(ocx, ocz, ow / 2, od / 2) - 1;
        const cv = document.createElement('canvas'); cv.width = cv.height = 32; const cc = cv.getContext('2d'); cc.fillStyle = '#efe9dc'; cc.fillRect(0, 0, 32, 32); cc.fillStyle = '#26252a';
        for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x++) { const yy = y + 3 + Math.round(2.2 * Math.sin(x / 32 * Math.PI * 4)); cc.fillRect(x, yy, 1, 3); }
        const pt = new T.CanvasTexture(cv); pt.wrapS = pt.wrapT = T.RepeatWrapping; pt.magFilter = T.NearestFilter; pt.minFilter = T.NearestFilter; pt.repeat.set(ow / 4, od / 4);
        const pad = new T.Mesh(new T.BoxGeometry(ow, top - low, od), [M(0xd8cfba), M(0xd8cfba), new T.MeshLambertMaterial({ map: pt }), M(0xd8cfba), M(0xd8cfba), M(0xd8cfba)]); pad.position.set(ocx, (top + low) / 2, ocz); root3.add(pad);
        const rail = (x, z, w, d) => { solid(w, 0.16, d, 0x4a4650, x, top + 1.05, z); solid(w, 0.12, d, 0x4a4650, x, top + 0.55, z); };
        rail(ox1 - 0.3, ocz, 0.2, od); rail(ocx, oz0 + 0.3, ow, 0.2); rail(ocx, oz1 - 0.3, ow, 0.2);
        for (let k = 0; k <= 6; k++) solid(0.22, 1.2, 0.22, 0x4a4650, ox1 - 0.3, top + 0.6, oz0 + k * od / 6);
        for (let k = 1; k <= 3; k++) { solid(0.22, 1.2, 0.22, 0x4a4650, ox0 + k * ow / 3.2, top + 0.6, oz0 + 0.3); solid(0.22, 1.2, 0.22, 0x4a4650, ox0 + k * ow / 3.2, top + 0.6, oz1 - 0.3); }
        solid(2.4, 0.5, 0.7, 0x7a5a3a, ocx - 1.5, top + 0.4, ocz); }
      // 坂を上る黄色い路面電車（飾り）：レールの線を、坂のまま行き来する
      if (tr) {
        const zt = cz + tr.z, xa = cx + tr.x0, xb = cx + tr.x1;
        for (let x = xa; x < xb; x += 3) for (const dz of [-0.75, 0.75]) { const y0 = groundY(x, zt + dz), y1 = groundY(x + 3, zt + dz); const m = new T.Mesh(new T.BoxGeometry(3.1, 0.1, 0.12), M(0x3a3a40)); m.position.set(x + 1.5, (y0 + y1) / 2 + 0.12, zt + dz); m.rotation.z = Math.atan2(y1 - y0, 3); root3.add(m); }
        const car = new T.Group(); const body = new T.Mesh(new T.BoxGeometry(7.5, 2.4, 2.5), M(0xf2c230)); body.position.y = 1.5; car.add(body);
        const strip = new T.Mesh(new T.BoxGeometry(7.6, 0.7, 2.55), M(0xfaf6ea)); strip.position.y = 1.1; car.add(strip);
        const win = new T.Mesh(new T.BoxGeometry(7.0, 0.8, 2.6), M(0x2a3a4a)); win.position.y = 2.0; car.add(win);
        const roofT = new T.Mesh(new T.BoxGeometry(7.2, 0.25, 2.3), M(0xe8e2d0)); roofT.position.y = 2.8; car.add(roofT);
        car.userData = { x: xa + 8, dir: 1, v: 2.6, x0: xa + 5, x1: xb - 5 }; scene.add(car); trams.push({ car, zt });
      }
      // 白妙城のまわり：白い城壁（胸壁つき）と、東（海・大通り）側の門。広場から城までの大通り（飾り）は、斜面に沿う石の帯
      if (pal) {
        const wg = new T.Group(); wg.position.set(px, groundY(px, pz), pz); scene.add(wg);
        const W = M(0xf0ebe0), WD = M(0xd8d2c4), hw = 26, hd = 19, hgt = 5.5;
        const wallBox = (w, d, x, z) => { const m = new T.Mesh(new T.BoxGeometry(w, hgt + 3, d), W); m.position.set(x, hgt / 2 - 1.5 + 0.3, z); wg.add(m); for (let k = -Math.floor(w / 5.2); k <= Math.floor(w / 5.2); k++) if (w > d) { const b = new T.Mesh(new T.BoxGeometry(1.2, 1.2, d + 0.2), WD); b.position.set(x + k * 2.6, hgt + 0.9 + 0.3, z); wg.add(b); } };
        wallBox(2 * hw, 2.2, 0, -hd); wallBox(2 * hw, 2.2, 0, hd); wallBox(2.2, 2 * hd, -hw, 0);
        wallBox(2.2, hd - 4.5, hw, -hd / 2 - 2.25); wallBox(2.2, hd - 4.5, hw, hd / 2 + 2.25);
        for (const sz of [-1, 1]) { const t = new T.Mesh(new T.CylinderGeometry(2.0, 2.2, hgt + 5, 10), W); t.position.set(hw, (hgt + 5) / 2 - 1.5, sz * 4.8); wg.add(t); const cap = new T.Mesh(new T.ConeGeometry(2.7, 3, 10), M(0xb8623a)); cap.position.set(hw, hgt + 5 + 0.2, sz * 4.8); wg.add(cap); }
        const x0 = px + hw + 2, pos2 = [], idx2 = [];
        // 大通りの帯は、城の門から東へ、道の網の道路のふちで止める（2026-10-28 試走の指摘 10：前は街の西のふち＋12 m までのばしていて、道路の中ほどまで入りこんで中途半端に交わった。
        // その前は道とつながっていなかった＝2026-10-26）。帯の中心の線が、いちばん近い道の中心から ROAD_EDGE m（道の帯＋ふち）に来た所で止める。見つからなければ街の西のふちまで
        // view3d.js が帯の下の地形を水平に切り盛りしている（道と同じ）ので、その面の上（+0.2 m）に敷く。帯の横（±4 m）の高い側に合わせる
        const ROAD_EDGE = 2.6, zAt = x => pz + (cz - pz) * (x - x0) / ((cx + rm[0] + 12) - x0 || 1), segs = [];
        for (const rd of net.roads) { const Q = rd.points.map(q => at3(q[0], q[1])); for (let i = 1; i < Q.length; i++) segs.push([Q[i - 1].x, Q[i - 1].z, Q[i].x, Q[i].z]); }
        const dRoad = (x, z) => { let b = 1e9; for (const [ax, az, bx, bz] of segs) { if (Math.min(ax, bx) > x + 30 || Math.max(ax, bx) < x - 30) continue; const vx = bx - ax, vz = bz - az, L = vx * vx + vz * vz, t = L ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L)) : 0; b = Math.min(b, Math.hypot(x - ax - vx * t, z - az - vz * t)); } return b; };
        let x1 = cx + rm[0] + 12;
        for (let x = x0; x < x1; x += 0.25) if (dRoad(x, zAt(x)) <= ROAD_EDGE) { x1 = x; break; }
        const nn = Math.max(2, Math.ceil(Math.abs(x1 - x0) / 3));
        for (let i = 0; i <= nn; i++) { const x = x0 + (x1 - x0) * i / nn, z = zAt(x); const y = Math.max(groundY(x, z - 4), groundY(x, z), groundY(x, z + 4)) + 0.2; for (const sg of [-4, 4]) pos2.push(x, y, z + sg); if (i) { const k = pos2.length / 3 - 2; idx2.push(k - 2, k - 1, k, k - 1, k + 1, k); } }
        const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pos2, 3)); bg.setIndex(idx2); bg.computeVertexNormals(); const bm = new T.Mesh(bg, new T.MeshLambertMaterial({ color: 0xd6cdb8, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 })); scene.add(bm);
      }
    }
    // 高架の石橋（立体交差。net.overpasses）：輪が自分の入口を越える所。上の道の下に、下の道がくぐる口（幅 14 m、高さ lift−1.3）をあける。前後はなだらかな石の坂（view3d.js の liftS と同じ形）
    for (const o of net.overpasses || []) {
      const rd = net.roads[o.road]; let bi = 0, bd = 1e9; rd.points.forEach((p, i) => { const d = Math.abs(p[3] - o.s); if (d < bd) { bd = d; bi = i; } });
      const q = rd.points[bi], a = rd.points[Math.max(0, bi - 2)], c = rd.points[Math.min(rd.points.length - 1, bi + 2)], P = at3(q[0], q[1]), A = at3(a[0], a[1]), C = at3(c[0], c[1]);
      const tx = C.x - A.x, tz = C.z - A.z, l = Math.hypot(tx, tz) || 1, half = o.half, L = o.lift;
      const top = x => { const ds = Math.abs(x); if (ds >= half) return 0; const u = ds <= 9 ? 0 : (ds - 9) / (half - 9); return L * (1 - u * u * (3 - 2 * u)); };
      const sh = new T.Shape(); sh.moveTo(-half, -0.5);
      for (let k = 0; k <= 24; k++) { const x = -half + 2 * half * k / 24; sh.lineTo(x, top(x) - 0.02); }
      sh.lineTo(half, -0.5); sh.lineTo(7, -0.5); sh.lineTo(7, L - 1.3); sh.lineTo(-7, L - 1.3); sh.lineTo(-7, -0.5); sh.lineTo(-half, -0.5);
      const g = new T.Group(); g.position.set(P.x, P.y, P.z); g.rotation.y = Math.atan2(-tz / l, tx / l); scene.add(g);
      const geo = new T.ExtrudeGeometry(sh, { depth: 5.6, bevelEnabled: false }); geo.translate(0, 0, -2.8); const body = new T.Mesh(geo, M(0xb7ad99)); g.add(body);
      for (const sg of [-1, 1]) { const pr = new T.Shape(); pr.moveTo(-half, top(-half)); for (let k = 0; k <= 24; k++) { const x = -half + 2 * half * k / 24; pr.lineTo(x, top(x) + 0.9); } for (let k = 24; k >= 0; k--) { const x = -half + 2 * half * k / 24; pr.lineTo(x, top(x) - 0.02); }
        const pg = new T.ExtrudeGeometry(pr, { depth: 0.5, bevelEnabled: false }); pg.translate(0, 0, sg * 2.55 - 0.25); g.add(new T.Mesh(pg, M(0xe2d9c4))); }
    }
    let t = 0;
    return { near: (x, z, m) => houseNear(x, z, m), update(dt) {
      for (const T2 of trams) { const u = T2.car.userData; u.x += u.dir * u.v * dt; if (u.x > u.x1 || u.x < u.x0) { u.dir *= -1; u.x = Math.max(u.x0, Math.min(u.x1, u.x)); } const y0 = groundY(u.x - 3, T2.zt), y1 = groundY(u.x + 3, T2.zt); T2.car.position.set(u.x, (y0 + y1) / 2 + 0.1, T2.zt); T2.car.rotation.set(0, 0, Math.atan2(y1 - y0, 6)); }
      // 湯気：ゆっくり立ちのぼり、広がって消える（約 5 秒でひと巡り）
      t += dt;
      for (const s of steam) { const u = ((t / 5) + s.userData.k / steam.length) % 1; s.position.set(s.userData.x + Math.sin(u * 6 + s.userData.k) * 0.8, 0.8 + u * 7, s.userData.z); const sz = 2 + u * 4; s.scale.set(sz, sz, 1); s.material.opacity = 0.55 * Math.sin(u * Math.PI); }
    } };
  }
  (root.RQ = root.RQ || {}).featuresView = { create };
})(window);
