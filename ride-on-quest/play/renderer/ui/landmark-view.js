/* ランドマークを3D の島に置く（docs/landmarks.md）。view3d.js から呼ばれる。配置は RQ.landmarks.place の結果（renderer/game/landmarks.js）。
   コードで作る立体：ヘリポート・堤防・桟橋・トンネルの入口・出入口の看板・休み処・港町の家並み・フェリー（絵が無いとき）。
   今の島の家・灯台・城と同じ、低ポリ（flatShading）の作り。急な斜面の所は、足元に平らな台（土の円柱）を敷いて、平らに見せる。
   ドット絵の板：観測所・給水塔・学校・海鳥・フェリーは、RQ.landmarkArt（assets/landmark/manifest.js。tools/build_object_art.py が作る。
   { 絵のID: { w, h, m（島の中での高さ m）} }）に絵があれば、assets/landmark/<ID>.png をビルボードで出す。絵が無ければ何も出さない。
   トンネル（2026-10-22 ユーザー要望：もっと長く、中は暗く、流れ出た溶岩で光る）：道のほぼ全部を、石のアーチの筒でおおう（上の山は view3d.js の tunnelHill が地形の材質で作り、外からは両端の石の門だけが見える）。
   中の壁は明かりに左右されない色（頂点の色）で、暗い岩に、壁を伝って流れ落ちる溶岩の筋と、両わきの溶岩の溝が光る（ゆらめく）。
   中にいるときに空・霧・明かりを暗くするのは view3d.js（insideTunnel）。
   RQ.landmarkView.create(T, scene, { placed, groundY, art }) → { count, update(dt), insideTunnel(x, z) }。物は scene に足すだけ（片付けは view3d の dispose が scene ごと行う）。 */
(function (root) {
  // 種類 → 絵の ID。ドット絵の板の小物（2026-10-23。docs/gemini-landmarks.md）は、種類＝絵の ID。manifest に絵が載ったものだけ出る
  const PROPS = ['fishhut', 'netboat', 'wreck', 'pierlamp', 'windmill', 'well', 'smithy', 'cart', 'signpost', 'shrine', 'camp', 'watchtower', 'deadtree', 'ruinpillar', 'fumarole', 'lavarock', 'onifort', 'palace'];
  const ART_OF = { observatory: 'observatory', watertower: 'watertower', school: 'school', colony: 'shearwater', ferryport: 'ferry', ...Object.fromEntries(PROPS.map(k => [k, k])) };
  const PAD = new Set(['observatory', 'watertower', 'school', 'fishhut', 'windmill', 'smithy', 'watchtower', 'onifort', 'palace']);   // 足もとに小さな台（草色）を敷く大きめの物
  const STONE = 0xb4ada0, DARK = 0x3b3835, BASALT = 0x4a3f39, WOOD = 0x7a5a3a, EARTH = 0x7d6c52, PAD_COLOR = 0x68853f, ROCK = 0x7a6f66;

  function create(T, scene, { placed, groundY, groundNat = null, windowMat = null, light = false, art = {} }) {
    const isl0 = root.RQ && root.RQ.mapData && root.RQ.mapData.island, cell0 = isl0 && isl0.cell;
    const houseOk = (x, z) => !isl0 || !root.RQ.area || root.RQ.area.houseOk(isl0, z / cell0, x / cell0);   // 家を建ててよい所（海から離れて、低すぎない）
    const mats = new Map(), tex = new Map();
    const M = c => { let m = mats.get(c); if (!m) mats.set(c, m = new T.MeshLambertMaterial({ color: c, flatShading: true })); return m; };
    const add = (geo, color, x, y, z, ry = 0, parent = scene) => { const m = new T.Mesh(geo, M(color)); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; };
    const box = (w, h, d, color, x, y, z, ry, parent) => add(new T.BoxGeometry(w, h, d), color, x, y, z, ry, parent);
    let count = 0;

    // 平らな台：足元の高さ（5点の中央値）にそろえ、下へ深く伸ばして、斜面との隙間を埋める。返り値は台の上の高さ
    function terrace(x, z, r, depth = 10, color = EARTH, flare = 1.4) {
      const hs = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dz]) => groundY(x + dx, z + dz)).sort((a, b) => a - b), top = hs[2] + 0.15;
      add(new T.CylinderGeometry(r, r + flare, depth, 14), color, x, top - depth / 2, z); count++;
      return top;
    }
    // ドット絵の板（下端を地面に）。h：高さ m。絵が読み込めるまでは見えない
    function sprite(id, x, y, z, h) {
      const a = art[id]; if (!a) return null;
      let t = tex.get(id);
      if (!t) { t = new T.TextureLoader().load(`../assets/landmark/${id}.png`); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; tex.set(id, t); }
      const sp = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthTest: true, fog: true }));
      sp.center.set(0.5, 0); sp.scale.set(h * a.w / a.h, h, 1); sp.position.set(x, y, z); scene.add(sp); count++;
      return sp;
    }

    // トンネルの中の溶岩（ゆらめかせる）と、中にいるかを決めるための道の点
    const lavaMats = [], tubes = [], exits = [];
    const exitMat = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, fog: false, transparent: true, opacity: 0, depthWrite: false });
    let clock = 0;
    const TUBE = [[-5, -3], [-5, 4], [-4.2, 5.9], [-2.4, 7.2], [0, 7.7], [2.4, 7.2], [4.2, 5.9], [5, 4], [5, -3]];   // 中の筒の断面（横 m, 高さ m）
    const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
    // 道の点の並び path に沿って、断面 prof を伸ばした面。color(i, j, u, v) → [r, g, b] があれば頂点の色。上の高さは道の中心の地面
    function sweep(path, prof, color) {
      const pos = [], col = [], idx = [], n = path.length, m = prof.length;
      for (let i = 0; i < n; i++) {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], tl = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / tl, nz = (b.x - a.x) / tl;
        const y0 = groundY(path[i].x, path[i].z);
        prof.forEach(([u, v], j) => {
          const x = path[i].x + nx * u, z = path[i].z + nz * u;
          // 筒の上（高さ 3 m より上）は、地面の下におさめる（地形の高さ − 0.4 m まで。地形が低くて収まらない口のそばは、そのまま外へ出る）。地面の下をくぐるトンネル用（2026-10-24）
          let y = y0 + v; if (groundNat && v > 3) y = Math.max(y0 + 3, Math.min(y, groundNat(x, z) - 0.4));
          pos.push(x, y, z); if (color) col.push(...color(i, j, u, v));
        });
        if (i) for (let j = 0; j < m - 1; j++) { const k0 = (i - 1) * m + j, k1 = i * m + j; idx.push(k0, k1, k0 + 1, k0 + 1, k1, k1 + 1); }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      if (color) g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      g.computeVertexNormals(); return g;
    }
    function tunnel(p) {
      const path = p.path, n = path.length; if (!path || n < 2) return;
      // 溶岩の筋：だいたい 14 m ごとに、左右どちらかの壁を流れ落ちる（決まった乱数）
      const streaks = [];
      for (let i = 2; i < n - 2; i++) if (hash(i * 3.1 + p.x) < 0.2) streaks.push({ i, side: hash(i * 7.7 + p.z) < 0.5 ? -1 : 1, top: 4.5 + hash(i * 1.3) * 2.5, w: 0.25 + hash(i * 9.1) * 0.35 });
      // 中の壁：暗い岩。溶岩の筋と溝の近くは赤く照らされる
      const glowAt = (i, u, v) => {
        let g = Math.max(0, 1 - (v + 0.5) / 1.6) * 0.3;   // 足もとの溝の照り返し
        for (const st of streaks) { const di = Math.abs(st.i - i); if (di > 1 || Math.sign(u) !== st.side) continue; g += (di ? 0.12 : 0.3) * (v < st.top + 0.5 ? 1 : 0.4); }
        return Math.min(0.6, g);
      };
      const inner = sweep(path, TUBE, (i, j, u, v) => {
        const k = 0.05 + hash(i * 13 + j * 5) * 0.05, g = glowAt(i, u, v);
        return [k + g * 0.75, k * 0.85 + g * 0.22, k * 0.8 + g * 0.04];
      });
      scene.add(new T.Mesh(inner, new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, fog: true }))); count++;
      // 床：筒の壁から壁まで（道の両わきに地面がなく、下の空が見えた。2026-10-27 ユーザー指摘）。道の帯（+0.25〜0.35 m）と溝（+0.12 m）より下
      const floorCol = (i, j, u, v) => { const k = 0.06 + hash(i * 17 + j * 3) * 0.04, g = glowAt(i, u, 0.1) * 0.8; return [k + g * 0.75, k * 0.85 + g * 0.22, k * 0.8 + g * 0.04]; };
      scene.add(new T.Mesh(sweep(path, [[-5, 0.1], [-2.5, 0.1], [0, 0.1], [2.5, 0.1], [5, 0.1]], floorCol), new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, fog: true, polygonOffset: true, polygonOffsetFactor: -1 })));
      // 出口の明かり：筒の両端に、外の明るさの板（中から見て、出口が真っ暗な行き止まりに見えないように。2026-10-27 ユーザー指摘）。中にいるときだけ（setCave）
      for (const [e, f] of [[path[0], path[1]], [path[n - 1], path[n - 2]]]) {
        const tl = Math.hypot(f.x - e.x, f.z - e.z) || 1, nx = -(f.z - e.z) / tl, nz = (f.x - e.x) / tl, y0 = groundY(e.x, e.z), pos = [], idx = [];
        const ARCH = TUBE.slice(1, -1);   // 壁の上（高さ 4 m）からアーチ
        pos.push(e.x, y0 + 0.1, e.z);   // 真ん中の下から扇形に
        const rim = [[-5, 0.1], ...ARCH, [5, 0.1]];
        for (const [u, v] of rim) pos.push(e.x + nx * u, y0 + v, e.z + nz * u);
        for (let k = 1; k < rim.length; k++) idx.push(0, k, k + 1);
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
        const m = new T.Mesh(g, exitMat); m.visible = false; m.renderOrder = -1; scene.add(m); exits.push(m);
      }
      // 上の山は、地形と同じ材質で view3d.js（tunnelHill）が作る
      // 光る溶岩：両わきの溝（細い帯）と、壁の筋（縦の帯）。明かりに左右されない色で、時間でゆらめく
      const lava = new T.MeshBasicMaterial({ color: 0xff6a1a, side: T.DoubleSide, fog: true }), hot = new T.MeshBasicMaterial({ color: 0xffc040, side: T.DoubleSide, fog: true });
      lavaMats.push({ m: lava, base: new T.Color(0xff6a1a), ph: p.x }, { m: hot, base: new T.Color(0xffc040), ph: p.z });
      for (const side of [-1, 1]) scene.add(new T.Mesh(sweep(path, [[side * 4.95, -0.1], [side * 4.95, 0.12], [side * 4.3, 0.12]]), lava));
      for (const side of [-1, 1]) scene.add(new T.Mesh(sweep(path, [[side * 4.7, 0.14], [side * 4.5, 0.14]]), hot));
      const pos = [], idx = [];
      for (const st of streaks) {
        const q = path[st.i], a = path[st.i - 1], b = path[st.i + 1], tl = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / tl, tz = (b.z - a.z) / tl, nx = -tz, nz = tx;
        const y0 = groundY(q.x, q.z), u = st.side * 4.92;
        // 上から下へ、少しくねって流れる（5つの区切り）
        for (let k = 0; k <= 5; k++) {
          const v = st.top * (1 - k / 5), wig = (hash(st.i + k * 3.3) - 0.5) * 0.9, w = st.w * (1 + k * 0.12), cx = q.x + nx * u + tx * wig, cz = q.z + nz * u + tz * wig;
          const uu = Math.abs(u) > 4.5 ? -st.side * 0.02 : 0;   // 壁から少しだけ内へ（ちらつかないように）
          pos.push(cx - tx * w + nx * uu, y0 + v, cz - tz * w + nz * uu, cx + tx * w + nx * uu, y0 + v, cz + tz * w + nz * uu);
          if (k) { const o = pos.length / 3 - 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
        }
      }
      if (pos.length) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); scene.add(new T.Mesh(g, lava)); }
      count += 3;
      // 入口：岩の面に、口をあけた石の門（ローカルの +z がトンネルの外）
      for (const q of p.portals) {
        const g = new T.Group(); g.position.set(q.x, groundY(q.x, q.z), q.z); g.rotation.y = q.yaw; scene.add(g);
        for (const s2 of [-1, 1]) box(11.5, 22, 7, BASALT, s2 * 11.2, 2, -3.2, 0, g);   // 口の左右の岩（足もとを地面の下まで）
        box(34, 8, 7, BASALT, 0, 11.6, -3.2, 0, g);                                        // 口の上の岩
        // 角ばった面を、ごろごろした溶岩の岩でくずす
        [[-14, 13, 4.5], [-7, 15.5, 4], [1, 16.5, 5], [9, 15, 4.2], [15, 12, 4.6], [-16, 5, 3.8], [16.5, 4, 4]].forEach(([bx, by, br], k) => {
          const m = add(new T.DodecahedronGeometry(br, 0), BASALT, bx, by, -2.5 + hash(k + q.x) * 2, hash(k * 3 + q.z) * 6, g); m.scale.set(1.2, 0.85, 1);
        });
        for (const s2 of [-1, 1]) box(1.4, 8.4, 1.4, STONE, s2 * 5.7, 3.6, 0.3, 0, g);  // 石の柱
        box(13, 1.6, 1.6, STONE, 0, 8.3, 0.3, 0, g);                                     // まぐさ
        count++;
      }
      tubes.push({ path, step: p.length / (n - 1) });
    }
    // (x, z) がトンネルの中か：0（外）〜1（入口から 14 m 以上入った所）。カメラの位置で、空・霧・明かりを暗くする（view3d.js）
    function insideTunnel(x, z) {
      let f = 0;
      for (const t of tubes) {
        let bi = -1, bd = 25;   // 道の中心から 5 m より遠ければ外
        for (let i = 0; i < t.path.length; i++) { const d = (t.path[i].x - x) ** 2 + (t.path[i].z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
        if (bi < 0) continue;
        const depth = Math.min(bi, t.path.length - 1 - bi) * t.step;
        f = Math.max(f, Math.min(1, Math.max(0, (depth - 10) / 12)));   // 筒は口の外へ 10 m のびているので、口からの深さは depth − 10。口で明るく、12 m 入ると暗くなりきる（2026-10-26 ユーザー指摘：出口で外が暗く見える）
      }
      return f;
    }
    function update(dt) {
      clock += dt;
      for (const b of beacons) { const on = nightNow > 0.25 && (light || (clock % 1.5) < 0.55); b.material.color.setHex(on ? 0xff2a1a : 0x802020); b.scale.setScalar(on ? 1.5 : 1); }
      for (const m of mills) m.rotation.z += dt * 0.35;   // 風車の羽根（ゆっくり回る。「軽い」でも回す＝1 枚の回転だけ）
      for (const L of lavaMats) { const k = 0.82 + 0.12 * Math.sin(clock * 2.3 + L.ph) + 0.06 * Math.sin(clock * 5.1 + L.ph * 0.7); L.m.color.copy(L.base).multiplyScalar(k); }
    }

    // 火山観測所（2026-10-24 ユーザー要望：灯台・鬼の城と同じ 3D の形）：白い壁の四角い建物（2 階）、屋上の銀色の観測ドーム（切れ目つき）、細い鉄塔のアンテナ（先に赤い灯。夜は点滅）、風向計つきの小屋。
    // 入口の扉と窓（窓は夜に光る。windowMat）。ローカルの +z が道のほう。1 棟なので普通のメッシュ（窓・枠だけ InstancedMesh）。「軽い」では、アンテナの点滅だけ省く（常に点灯）
    const beacons = [], mills = []; let nightNow = 0;
    // 風車（2026-10-26 ユーザー指摘：絵の板だと地面から浮いて見える→ 3D で作る）：石の太い塔（足もとを地面に埋める）、赤い屋根、前（道のほう＝ローカルの +z）に 4 枚の羽根
    function windmill(p) {
      const top = terrace(p.x, p.z, 6.5, 8, PAD_COLOR, 0.8), g = new T.Group(); g.position.set(p.x, top, p.z); g.rotation.y = p.yaw; scene.add(g); g.name = 'windmill';
      const mesh = (geo, col, x, y, z, parent = g) => { const m = new T.Mesh(geo, new T.MeshLambertMaterial({ color: col, flatShading: true })); m.position.set(x, y, z); parent.add(m); return m; };
      mesh(new T.CylinderGeometry(2.6, 3.4, 10.5, 10), 0xeee9da, 0, 3.75, 0);                                  // 塔（下を 1.5 m 地面に埋める）
      mesh(new T.CylinderGeometry(3.5, 3.6, 1.2, 10), 0xb4ada0, 0, 0.3, 0);                                     // 石の土台
      mesh(new T.ConeGeometry(3.1, 3.4, 10), 0xa8442e, 0, 10.7, 0);                                              // 屋根
      mesh(new T.BoxGeometry(1.4, 2.4, 0.4), 0x6a4a2e, 0, 1.6, 3.0);                                              // 戸
      for (const [wy, ang] of [[5.2, 0.5], [5.2, -0.5], [7.4, 0]]) { const w = mesh(new T.BoxGeometry(0.9, 1.2, 0.3), 0x3a3a44, Math.sin(ang) * 2.9, wy, Math.cos(ang) * 2.9); w.rotation.y = ang; }   // 窓
      const rotor = new T.Group(); rotor.position.set(0, 8.6, 2.9); g.add(rotor);
      mesh(new T.CylinderGeometry(0.45, 0.45, 1.2, 8), 0x5a4230, 0, 0, -0.2, rotor).rotation.x = Math.PI / 2;     // 軸
      for (let k = 0; k < 4; k++) {
        const arm = new T.Group(); arm.rotation.z = k * Math.PI / 2; rotor.add(arm);
        mesh(new T.BoxGeometry(0.3, 6.8, 0.2), 0x5a4230, 0, 3.4, 0.1, arm);                                       // 羽根の骨
        mesh(new T.BoxGeometry(1.3, 4.4, 0.08), 0xf6f1e4, 0.75, 4.1, 0.2, arm);                                   // 帆
        for (let j = 0; j < 4; j++) mesh(new T.BoxGeometry(1.3, 0.08, 0.1), 0x8a6a46, 0.75, 2.2 + j * 1.2, 0.26, arm);   // 帆の横木
      }
      mills.push(rotor); count += 1;
    }
    function observatory(p) {
      const top = terrace(p.x, p.z, 11, 8, PAD_COLOR, 0.8), g = new T.Group(); g.position.set(p.x, top, p.z); g.rotation.y = p.yaw; scene.add(g);
      const bx = (w, h, d, c, x, y, z, ry = 0) => box(w, h, d, c, x, y, z, ry, g);
      bx(10.6, 0.7, 7.6, 0xb4ada0, 0, 0.35, 0);   // 土台（石）
      bx(10, 6.2, 7, 0xf4f1e8, 0, 3.4, 0);   // 壁（白）
      bx(10.6, 0.5, 7.6, 0xa8442e, 0, 6.75, 0);   // 屋根の縁（島の家の屋根の色）
      bx(10, 0.15, 0.4, 0xd8c8b0, 0, 3.4, 3.55);   // 1 階と 2 階のあいだの帯
      // 観測ドーム：ドラム（円柱）と銀色の半球。切れ目（暗い細い箱）は道のほう（+z）に少し傾けて
      const dx = -2.2, dz = -0.4;
      const drum = new T.Mesh(new T.CylinderGeometry(2.7, 2.9, 1.1, 14), M(0xd8dce0)); drum.position.set(dx, 7.55, dz); g.add(drum);
      const dome = new T.Mesh(new T.SphereGeometry(2.7, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0xc9d2da)); dome.position.set(dx, 8.1, dz); g.add(dome);
      const slit = new T.Mesh(new T.BoxGeometry(0.55, 2.7, 0.35), M(0x25303a)); slit.position.set(dx, 9.5, dz + 1.45); slit.rotation.x = 0.55; g.add(slit);
      // 扉
      bx(1.5, 2.5, 0.25, 0x5a3a24, 0, 1.95, 3.55);
      // アンテナ：4 本の細い脚（先がすぼまる）と横の桟。先に赤い灯
      const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]], H = 15;
      for (const [sx, sz] of legs) { const l = new T.Mesh(new T.CylinderGeometry(0.07, 0.13, H, 5), M(0x8a909a)); l.position.set(8.6 + sx * 0.5 * 0.55, H / 2 + 0.2, -0.5 + sz * 0.27); l.rotation.z = -sx * 0.03; l.rotation.x = sz * 0.03; g.add(l); }
      for (const hy of [3, 6.5, 10, 13]) { const w = 0.55 * (1 - hy / (H * 1.3)) + 0.25; bx(w * 2, 0.1, 0.1, 0x8a909a, 8.6, hy, -0.5); bx(0.1, 0.1, w, 0x8a909a, 8.6, hy, -0.5); }
      const lamp = new T.Mesh(new T.SphereGeometry(0.42, 8, 6), new T.MeshBasicMaterial({ color: 0x802020 })); lamp.position.set(8.6, H + 0.5, -0.5); g.add(lamp); beacons.push(lamp);
      // 風向計・計器の小屋（白い箱と赤茶の屋根）。屋根に風向計の細い柱と矢
      bx(3, 2.8, 3, 0xf4f1e8, 8.6, 1.6, 4.4); const hr = new T.Mesh(new T.ConeGeometry(2.5, 1.3, 4), M(0xa8442e)); hr.rotation.y = Math.PI / 4; hr.position.set(8.6, 3.65, 4.4); g.add(hr);
      bx(0.1, 2, 0.1, 0x6a707a, 8.6, 5, 4.4); bx(1.2, 0.12, 0.25, 0xe8c040, 8.9, 5.8, 4.4, 0.6);
      bx(0.9, 1.6, 0.15, 0x5a3a24, 8.6, 1.0, 5.95);
      // 窓（前：1 階 2・2 階 3、両わき：各階 1 つずつ、小屋 1）。枠は鎧戸の色。窓は夜に光る
      const spots = [];
      for (const x of [-3, 3]) spots.push([x, 2.1, 3.55, 0]); for (const x of [-3, 0, 3]) spots.push([x, 5.0, 3.55, 0]);
      for (const sg of [-1, 1]) for (const y of [2.1, 5.0]) spots.push([sg * 5.05, y, 0, sg * Math.PI / 2]);
      spots.push([8.6 - 1.5 - 0.05, 1.8, 4.4, -Math.PI / 2]);
      const wg = new T.BoxGeometry(0.95, 1.4, 0.16), lampA = new Float32Array(spots.length); spots.forEach((_, i) => { lampA[i] = 0.06 + (i % 4) * 0.03; });   // 観測所は夕方のうちから点く
      wg.setAttribute('aLamp', new T.InstancedBufferAttribute(lampA, 1));
      const wins = new T.InstancedMesh(wg, windowMat ? windowMat(0x3a2c28) : new T.MeshLambertMaterial({ color: 0x3a2c28 }), spots.length), frames = new T.InstancedMesh(new T.BoxGeometry(1.5, 1.95, 0.1), new T.MeshLambertMaterial({ flatShading: true }), spots.length);
      const mm = new T.Matrix4(), one = new T.Vector3(1, 1, 1), upv = new T.Vector3(0, 1, 0), cc = new T.Color();
      spots.forEach(([x, y, z, ang], i) => { const q = new T.Quaternion().setFromAxisAngle(upv, ang), nx = Math.sin(ang), nz = Math.cos(ang);
        mm.compose(new T.Vector3(x + nx * 0.08, y, z + nz * 0.08), q, one); wins.setMatrixAt(i, mm); mm.compose(new T.Vector3(x + nx * 0.03, y, z + nz * 0.03), q, one); frames.setMatrixAt(i, mm); frames.setColorAt(i, cc.set(i < 5 ? 0x4a6a9a : 0x4f7f62)); });
      g.add(wins, frames); count += 1;
    }
    const houses = [];   // 港町の家（まとめて1つの InstancedMesh にする）
    for (const p of placed) {
      const f = [Math.sin(p.yaw), Math.cos(p.yaw)];
      switch (p.kind) {
        case 'observatory': observatory(p); break;   // 火山観測所は 3D の形（2026-10-24 ユーザー要望）。板は出さない
        case 'windmill': windmill(p); break;   // 風車は 3D の形（2026-10-26）。板は出さない
        case 'watertower': case 'school': case 'fishhut': case 'netboat': case 'wreck': case 'pierlamp': case 'well': case 'smithy': case 'cart': case 'signpost':
        case 'shrine': case 'camp': case 'watchtower': case 'deadtree': case 'ruinpillar': case 'fumarole': case 'lavarock': case 'onifort': case 'palace': {   // ドット絵の板。絵が無ければ出さない（台も敷かない）
          let a = art[ART_OF[p.kind]]; if (!a) break;
          if (p.kind === 'palace') a = { ...a, m: a.m * 1.5 };   // 白妙城は街でいちばん目立つように大きく（2026-10-23）
          if (p.deck) { sprite(ART_OF[p.kind], p.x, 1.65, p.z, a.m); break; }   // 桟橋の灯り：桟橋の板の上
          // 大きめの物は、台は絵の幅（m × w / h）に合わせた小さな円にし、まわりの草の色になじませる（岩の台座に見えない）。小物は、足もとの低い所に立たせる
          if (p.kind === 'fishhut' && !houseOk(p.x, p.z)) break;   // 漁師小屋も、家と同じく海から離す（2026-10-28 試走の指摘 12）
          if (PAD.has(p.kind)) { const top = terrace(p.x, p.z, Math.max(2, a.m * a.w / a.h * 0.62), 8, PAD_COLOR, 0.8); sprite(ART_OF[p.kind], p.x, top, p.z, a.m); }
          else sprite(ART_OF[p.kind], p.x, Math.min(groundY(p.x, p.z), groundY(p.x + 1.2, p.z), groundY(p.x - 1.2, p.z), groundY(p.x, p.z + 1.2), groundY(p.x, p.z - 1.2)) - 0.05, p.z, a.m);
          break;
        }
        case 'colony': {   // 海鳥：絵があれば、繁殖地にちらす
          const a = art.shearwater; if (!a) break;
          p.items.forEach((b, i) => sprite('shearwater', b.x, groundY(b.x, b.z), b.z, a.m * (0.9 + (i % 4) * 0.1)));
          break;
        }
        case 'heliport': {
          const top = terrace(p.x, p.z, p.radius + 1.6, 8);
          add(new T.CylinderGeometry(p.radius, p.radius, 0.4, 20), 0xb9b5aa, p.x, top + 0.2, p.z); count++;
          const ring = new T.Mesh(new T.RingGeometry(p.radius - 1.3, p.radius - 0.7, 24), new T.MeshBasicMaterial({ color: 0xe0b23a })); ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, top + 0.45, p.z); scene.add(ring);
          for (const [bw, bd, bx] of [[0.9, 5, -1.6], [0.9, 5, 1.6], [3.4, 0.9, 0]]) box(bw, 0.1, bd, 0xf2f2ee, p.x + bx, top + 0.45, p.z); count++;   // H の印
          break;
        }
        case 'breakwater': {   // 岸から海へ伸びる、石の堤。先に赤い灯り
          const L = p.length + 8, cx = p.x + f[0] * (L / 2 - 8), cz = p.z + f[1] * (L / 2 - 8);
          box(4.5, 4, L, STONE, cx, 0.6, cz, p.yaw); count++;
          const ex = p.x + f[0] * (p.length - 2), ez = p.z + f[1] * (p.length - 2);
          add(new T.CylinderGeometry(0.3, 0.3, 4, 6), DARK, ex, 4.4, ez); box(1.1, 1, 1.1, 0xc0392b, ex, 6.5, ez, p.yaw); count++;
          break;
        }
        case 'pier': case 'ferryport': {   // 木の桟橋：板と、5 m ごとの杭
          const L = p.length;
          box(3, 0.5, L, WOOD, p.x + f[0] * (L / 2 - 4), 1.4, p.z + f[1] * (L / 2 - 4), p.yaw); count++;
          const post = new T.CylinderGeometry(0.3, 0.3, 3.2, 6);
          for (let d = -3; d <= L - 4; d += 5) for (const s of [-1.4, 1.4]) add(post, 0x5a4230, p.x + f[0] * d + -f[1] * s, 0.4, p.z + f[1] * d + f[0] * s);
          if (p.kind === 'ferryport' && p.boat) {
            const b = p.boat, a = art.ferry;
            if (a) sprite('ferry', b.x, 0.2, b.z, a.m);
            else {   // 絵が届くまでの、低ポリのフェリー
              const g = new T.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = b.yaw; scene.add(g);
              box(4.2, 2.2, 12, 0xf2f2ee, 0, 1.1, 0, 0, g); box(4.3, 0.5, 12.1, 0x2f5fa8, 0, 0.7, 0, 0, g);
              box(3.4, 2.2, 6, 0xdad8d0, 0, 3.3, -0.5, 0, g); add(new T.CylinderGeometry(0.7, 0.8, 2.4, 8), 0xc0392b, 0, 5.2, -1, 0, g); count++;
            }
          }
          break;
        }
        case 'tunnel': tunnel(p); break;
        case 'interchange': {   // 道ばたの看板（青い板。文字は入れない）
          const g = new T.Group(); g.position.set(p.x, groundY(p.x, p.z), p.z); g.rotation.y = p.yaw; scene.add(g);
          add(new T.CylinderGeometry(0.25, 0.3, 6.1, 6), DARK, 0, 1.55, 0, 0, g);   // 柱は地面の下 1.5 m まで box(3.6, 1.9, 0.25, 0x2f5fa8, 0, 4.6, 0.2, 0, g); box(3.1, 0.35, 0.28, 0xf2f2ee, 0, 4.9, 0.22, 0, g); box(3.1, 0.35, 0.28, 0xf2f2ee, 0, 4.3, 0.22, 0, g); count++;
          break;
        }
        case 'parking': {   // 道ばたの休み処：平らな地面に、白線と青い柱の札
          const top = terrace(p.x, p.z, 14, 9), g = new T.Group(); g.position.set(p.x, top, p.z); g.rotation.y = p.yaw; scene.add(g);
          box(p.size[1], 0.3, p.size[0], 0x8f8a80, 0, 0.1, 0, 0, g);
          for (let i = -2; i <= 2; i++) box(0.2, 0.05, 4.5, 0xf2f2ee, p.size[1] / 2 - 2.5, 0.3, i * 4.4, 0, g);
          add(new T.CylinderGeometry(0.2, 0.2, 3.6, 6), DARK, -p.size[1] / 2 + 0.6, 1.9, -p.size[0] / 2 + 1, 0, g); box(1.2, 1.2, 0.2, 0x2f5fa8, -p.size[1] / 2 + 0.6, 3.8, -p.size[0] / 2 + 1, 0, g); count++;
          break;
        }
        case 'town': if (p.id !== 'town1') houses.push(...p.items); break;   // town1（浜の里）は東の街（features-view.js）が家を建てる
      }
    }
    // 港町の家：壁を地面の下へ 1.5 m 伸ばして、斜面でも浮かないようにする
    let nSeaH = 0;
    // 海ぎわの家（足もとの地面が海面に近い 1 m 未満）は建てない（2026-10-26 ユーザー指摘：海岸ぞいの家が海に沈んで見える）
    // 2026-10-28 試走の指摘 12（まだ海の手前に建っていた）：地面の高さだけでは、低い浜の上の家が残った。海からの距離と標高も見る（game/area.js の houseOk。港の村・漁師小屋と同じ決まり）
    for (let i = houses.length - 1; i >= 0; i--) { const h = houses[i], y = Math.min(groundY(h.x, h.z), groundY(h.x + 4, h.z), groundY(h.x - 4, h.z), groundY(h.x, h.z + 4), groundY(h.x, h.z - 4)); if (y < 1.0 || !houseOk(h.x, h.z)) { houses.splice(i, 1); nSeaH++; } }
    if (typeof window !== 'undefined' && window.__rq) window.__rq.housesDropped = nSeaH;   // テスト用
    if (houses.length) {
      const wall = new T.BoxGeometry(5, 4.7, 4); wall.translate(0, 0.85, 0);
      const roof = new T.ConeGeometry(4.2, 2.6, 4); roof.rotateY(Math.PI / 4); roof.translate(0, 4.5, 0);
      const walls = new T.InstancedMesh(wall, new T.MeshLambertMaterial({ flatShading: true }), houses.length), roofs = new T.InstancedMesh(roof, new T.MeshLambertMaterial({ flatShading: true }), houses.length);
      const WC = [0xe8dcc0, 0xd8c8a8, 0xc8b8a0], RC = [0xa8442e, 0x3e5f8a, 0x7a5232, 0x5a6e3a], m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), c = new T.Color(), up = new T.Vector3(0, 1, 0);
      houses.forEach((h, i) => {
        const s = 1.2 + (i % 3) * 0.15, y = Math.min(groundY(h.x, h.z), groundY(h.x + 3, h.z), groundY(h.x - 3, h.z), groundY(h.x, h.z + 3), groundY(h.x, h.z - 3)) - 0.1;
        q.setFromAxisAngle(up, h.yaw); sc.set(s, s, s); m4.compose(new T.Vector3(h.x, y, h.z), q, sc);
        walls.setMatrixAt(i, m4); roofs.setMatrixAt(i, m4); walls.setColorAt(i, c.set(WC[h.variant % 3])); roofs.setColorAt(i, c.set(RC[(h.variant + i) % 4]));
      });
      scene.add(walls, roofs); count += houses.length;
      // 窓（2026-10-24：夜に光る）：家の壁（5×4.7×4。拡大 s）の、道のほう（前）に 2 つ、横に 1 つ。窓の材質は view3d.js の windowMat（夜は暖かく光る。約 78% の家だけ）
      const wg = new T.BoxGeometry(0.9, 1.3, 0.16), nW = houses.length * 3, lampH = new Float32Array(nW).fill(2); wg.setAttribute('aLamp', new T.InstancedBufferAttribute(lampH, 1));
      const winsH = new T.InstancedMesh(wg, windowMat ? windowMat(0x3a2c28) : new T.MeshLambertMaterial({ color: 0x3a2c28 }), nW);
      houses.forEach((h, i) => {
        const s = 1.2 + (i % 3) * 0.15, y = Math.min(groundY(h.x, h.z), groundY(h.x + 3, h.z), groundY(h.x - 3, h.z), groundY(h.x, h.z + 3), groundY(h.x, h.z - 3)) - 0.1;
        const hh = Math.abs(Math.sin(i * 53.9 + h.x * 0.013)) * 1000 % 1, h2 = Math.abs(Math.sin(i * 7.7 + h.z * 0.017)) * 1000 % 1, thr = hh < 0.78 ? 0.1 + h2 * 0.5 : 2;
        const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), rx = fz, rz = -fx;   // 前の向きと、横の向き
        const put = (k, lx, lz, ang, ly) => { const qq = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), ang); m4.compose(new T.Vector3(h.x + rx * lx * s + fx * lz * s, y + ly * s, h.z + rz * lx * s + fz * lz * s), qq, new T.Vector3(s, s, s)); winsH.setMatrixAt(i * 3 + k, m4); lampH[i * 3 + k] = thr < 2 ? Math.min(0.95, thr + k * 0.04) : 2; };
        put(0, -1.2, 2.04, h.yaw, 1.9); put(1, 1.2, 2.04, h.yaw, 1.9); put(2, 2.54, 0, h.yaw + Math.PI / 2, 1.9);
      });
      wg.attributes.aLamp.needsUpdate = true; scene.add(winsH);
      // 扉（道のほうの壁に 1 つ）と、窓の枠（鎧戸の色）
      const dgH = new T.BoxGeometry(1.2, 2.2, 0.2), fgH = new T.BoxGeometry(1.4, 1.75, 0.1);
      const doorsH = new T.InstancedMesh(dgH, new T.MeshLambertMaterial({ flatShading: true }), houses.length), framesH = new T.InstancedMesh(fgH, new T.MeshLambertMaterial({ flatShading: true }), nW);
      const DRC = [0x5a3a24, 0x2f4f7a, 0x3a6a4a, 0x7a2f2a], SHC = [0x4f7f62, 0x4a6a9a, 0x8a5a3a, 0xb87a3a, 0x6a4a7a, 0xa84a3a], c2 = new T.Color();
      houses.forEach((h, i) => {
        const s = 1.2 + (i % 3) * 0.15, y = Math.min(groundY(h.x, h.z), groundY(h.x + 3, h.z), groundY(h.x - 3, h.z), groundY(h.x, h.z + 3), groundY(h.x, h.z - 3)) - 0.1;
        const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), rx = fz, rz = -fx, sv = new T.Vector3(s, s, s), up2 = new T.Vector3(0, 1, 0);
        const dq = new T.Quaternion().setFromAxisAngle(up2, h.yaw); m4.compose(new T.Vector3(h.x + fx * 2.06 * s, y + 1.1 * s, h.z + fz * 2.06 * s), dq, sv); doorsH.setMatrixAt(i, m4); doorsH.setColorAt(i, c2.set(DRC[i % DRC.length]));
        for (let k = 0; k < 3; k++) { winsH.getMatrixAt(i * 3 + k, m4); m4.elements[12] -= (k === 2 ? rx : fx) * 0.05 * s; m4.elements[14] -= (k === 2 ? rz : fz) * 0.05 * s; framesH.setMatrixAt(i * 3 + k, m4); framesH.setColorAt(i * 3 + k, c2.set(SHC[i % SHC.length])); }
      });
      scene.add(doorsH, framesH);
    }
    // トンネルの中の暗さ f（0〜1）と外の空の色 col：出口の明かりの板を、外の明るさで出す（外にいるときは出さない）
    function setCave(f, col) {
      exitMat.color.copy(col); exitMat.opacity = Math.min(1, f * 1.5);
      for (const m of exits) m.visible = f > 0.01;
    }
    return { count, update, insideTunnel, setCave, setNight: n => { nightNow = n; } };
  }

  root.RQ.landmarkView = { create };
})(window);
