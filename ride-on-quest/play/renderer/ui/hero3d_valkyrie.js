/* ワルキューレ（女）の 3D（2026-10-26。主人公候補の4人の1人目。主人公としては選べない＝試練のペースメーカーで走る姿だけ）。
   形は組み立て指示（tools/lowpoly_hero/specs/valkyrie.json → ui/hero3d_specs.js。8方向の絵 art_src/valkyrie_8dir.jpg を見て作った）。骨組み・動き・顔は ui/hero3d_spec.js（武闘家と同じ骨組み）。
   持ち物（槍・盾）は、手の位置が要るのでここで足す：槍は右手＝ -x（正面の絵で画面の左）、盾は左うで＝ +x（画面の右）。そのぶん、その腕は振らずにかまえる。
   使い方：RQ.lowpoly.buildValkyrie(T, { toon, steps, q }) → { group, parts, pose }。前提：hero3d.js・hero3d_specs.js・hero3d_spec.js を先に読む。 */
(function (root) {
  const RQ = root.RQ = root.RQ || {};
  const L = () => RQ.lowpoly;
  const EYE = { w: 0.06, hi: 0.05, lo: 0.05, y: 0.26, top: 0x2a1a14, bot: 0x6b3a2a, glint: 0xffffff, lash: 0x2a1a14 };   // 茶色い目、上にこいまつげ
  // スカート（帯＝ひじ、裾＝ひじ〜拳。高さは指示書の skirt の上下の端のまま）：武闘家の胴着の裾と同じ作り（2026-10-26 ユーザー指摘「スカートの中はポリゴンで埋めない。武闘家を参考に」）。
  // 前と後ろの 2 枚の布（ふたの無い回転面。内がわも描く）。帯から曲線でなめらかに広がり、脇は少し重ねる（スリット。横の銀の板がおおう）。中は空いている。
  // 歩き・走りで、前へ出たももに合わせて前の 1 枚、後ろへ出たももで後ろの 1 枚を、帯の所を支点に持ち上げる（持ち上げた 1 枚は、そのぶん長く）
  // 2026-10-27 ユーザー指摘「ワルキューレと武闘家も裾が短すぎてミニスカ状態なので少し裾を伸ばして」：裾を拳の下から SKLEN だけ長く（ももの 3/4 ほど）。
  // 前後の厚みは張り出させない（canon.md：戦士・傭兵と同じ）＝指示書の奥行きの SKZ 倍（前後 ±0.26 → ±0.19 ほど。武闘家と同じくらい）
  // スカートと盾の水色（2026-10-27 ユーザー指示「スカートと盾の色をドット絵の水色に合わせる」。ドット絵の明るい #6bbaf7・中 #3f7ab3・陰 #26457c。canon のみ）
  const SKY = 0x5aa8e8;
  const SKLEN = 0.08, SKZ = 0.72, PLATE_T = 0.75, PLATE_TOP = 0.01;
  function skirtPanels(T, group, parts, mat) {
    const sk = parts.skirt, hm = parts.skirt_hem; if (!sk || !hm) return null;
    group.updateMatrixWorld(true);   // 丈は武闘家と同じ決め方（ユーザー指摘「武闘家と比べるとまだスカートが短すぎる」）：裾＝下ろした腕の拳（手の中心）の 0.01 下。帯（上の端）は指示書のまま（＝ひじ）
    const yE = parts.torso.worldToLocal(parts.foreL.getWorldPosition(new T.Vector3())).y, yH = yE + L().canon.C.HANDY * Math.cos(0.1);   // 拳：骨組みの立ち（ひじから先 -0.1 rad）で下ろした手の中心
    const gp = sk.geometry.parameters, WX = sk.scale.x, WZ = sk.scale.z * SKZ, top = sk.position.y + gp.height / 2, len = Math.max(gp.height, top - (yH - 0.01)) + SKLEN, r0 = gp.radiusTop * 0.8, r1 = Math.min(gp.radiusBottom, 0.28);   // 上の端は 0.8 倍に細くして胸当ての下へ入れる（ユーザー「スカートが胸当ての前から出ていない？」→ 2026-11-03「これでいいよ」）。裾の広がりは武闘家くらいに（広げすぎると、かさのように開いて中の面が大きく見える）
    const blue = SKY, gold = 0xe0b445;   // スカートは水色（SKY）・裾は指示書の skirt_hem の金
    sk.parent.remove(sk); hm.parent.remove(hm);
    const prof = k => { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new T.Vector2((r0 + (r1 - r0) * Math.sin(Math.min(1, t / 0.55) * Math.PI / 2)) * k, -len * t)); } return pts; };
    const PL = VAL.PLEAT, SEG = Math.round(PL[0] * 4 * (Math.PI + 0.44) / (2 * Math.PI)), OV = 0.22, pv = {};
    const pleat = (geo, hem) => { const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), y = pa.getY(i), ph = Math.atan2(x, z), u = ((ph / (2 * Math.PI)) * PL[0] % 1 + 1) % 1, tri = 1 - 4 * Math.abs(u - 0.5), t = hem ? 1 : Math.max(0, Math.min(1, (-y / len - PL[2]) / (1 - PL[2]))), f = 1 + PL[1] * tri * t; pa.setX(i, x * f); pa.setZ(i, z * f); } geo.computeVertexNormals(); };   // プリーツ（2026-11-02 ユーザー「スカートにプリーツをつけたい」→「かなり良くなった」）：半径を、ひだの向きでジグザグに（すそほど深い）。裾の金の帯も同じだけ
    for (const [n, ph0, k] of [['F', -Math.PI / 2 - OV, 1], ['B', Math.PI / 2 - OV, 0.985]]) {
      const g = new T.Group(); g.position.set(0, top, 0); g.scale.set(WX, 1, WZ); parts.torso.add(g); parts['skirt' + n] = pv[n] = g;
      const a = new T.Mesh((g0 => (pleat(g0, false), g0))(new T.LatheGeometry(prof(k).reverse(), SEG, ph0, Math.PI + 2 * OV)), mat(blue)); a.material.side = T.DoubleSide; a.name = 'skirt'; g.add(a);
      const b = new T.Mesh((g0 => (pleat(g0, true), g0))(new T.LatheGeometry([new T.Vector2(r1 * k + 0.008, -len - 0.003), new T.Vector2(r1 * k + 0.006, -len + 0.03)], SEG, ph0, Math.PI + 2 * OV)), mat(gold)); b.material.side = T.DoubleSide; b.name = 'skirt_hem'; g.add(b);
    }
    parts.skirt = pv.F.children[0]; parts.skirt_hem = pv.F.children[1];
    // 腰の両わきの銀の板（指示書の side_plate・side_plate_trim）：スカートに合わせて下げる（2026-10-27 ユーザー指摘「スカートを伸ばしたり下に下げたのに、両サイドの灰色の飾りが下がっていない」）。
    // 2026-10-27 ユーザー指摘「スカートのサイドの部品が、胴体の半ばから生えている。これは鎧の下から生えるものなので、胴の付け根まで下げる」：
    // 板の上の端は、胸当て（鎧）の下の端＝スカートの付け根（胸当ての金のふちの中）。下の端は スカートの丈の PLATE_T の所。スカートの面からの浮きは指示書の板と同じ。金のふちは板の下の端
    const rAt = t => (r0 + (r1 - r0) * Math.sin(Math.min(1, t / 0.55) * Math.PI / 2)) * WX;   // スカートの脇（x）の半径。t＝帯からの丈の割合
    for (const sd of ['L', 'R']) { const pl = parts['side_plate_' + sd], tr = parts['side_plate_trim_' + sd]; if (!pl) continue;
      const sx = sd === 'L' ? 1 : -1, h0 = pl.geometry.parameters.height / 2, th = pl.rotation.z;
            const xb = pl.position.x + h0 * Math.sin(th), yb = pl.position.y - h0 * Math.cos(th), off = Math.abs(xb) - rAt(Math.max(0, (top - yb) / gp.height));   // 元の下の端と、元のスカートの面からの浮き
      const x1 = sx * (rAt(0) + off), y1 = top + PLATE_TOP;   // 板の上の端（鎧の下）
      const y2 = top - len * PLATE_T, x2 = sx * (rAt(PLATE_T) + off), L2 = Math.hypot(x2 - x1, y2 - y1), th2 = Math.atan2(x2 - x1, y1 - y2);
      pl.position.set((x1 + x2) / 2, (y1 + y2) / 2, pl.position.z); pl.rotation.z = th2; pl.scale.y = L2 / (2 * h0);
      if (tr) { tr.position.set(x2 + sx * 0.002, y2 + 0.005, tr.position.z); tr.rotation.z = th2; } }
    // 持ち上げは、布の前（うしろ）の真ん中ほど大きく、脇ほど小さく（重み＝向きの cos）。2 枚を丸ごと回すと、脇の縁も前後へ動いて脇のすき間が開き、
    // 左斜め後ろから、ももがすき間から裾の手前に見えた（窓口のレビュー 2026-10-27）。持ち上げたぶん、その所の布を長く（武闘家と同じ 1/cos、上限 1.15）
    const list = []; for (const n of ['F', 'B']) for (const o of pv[n].children) { o.frustumCulled = false; list.push({ o, n, base: Float32Array.from(o.geometry.attributes.position.array) }); }
    const KF = 1.0, KB = 0.55;
    return function update() {
      const tr = parts.torso.rotation.x, a = parts.legL.rotation.x - tr, b = parts.legR.rotation.x - tr;   // 胴に対するももの角度（負＝前）
      const ang = { F: Math.min(0, a, b) * KF, B: Math.max(0, a, b) * KB };
      for (const { o, n, base } of list) { const A = ang[n], pa = o.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) { const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2], r = Math.hypot(x, z), w = r > 1e-6 ? Math.abs(z) / r : 0, t = A * w;
          if (t === 0) { pa.setXYZ(i, x, y, z); continue; }
          const ys = y * Math.min(1.15, 1 / Math.cos(t)), zs = z * WZ, c = Math.cos(t), s = Math.sin(t);
          pa.setXYZ(i, x, ys * c - zs * s, (ys * s + zs * c) / WZ); }
        pa.needsUpdate = true; o.geometry.computeVertexNormals(); }
    };
  }
  // 首の見え方（canon.md「首の見え方」：正面・斜め前で、あごの下に首の肌が 2 行・8 画素以上。うしろの首は髪で隠す）。
  // あごの下の暗い帯は顔の箱の下の丸み（影）で、髪ではない。首を出すには、胸当ての上の端を下げ、その上に「肩口」（胸当てから首の付け根へ細くなる銀の台）を置く。
  // 素肌の胴は、上の端を肩口の中まで下げ、細くする（首の円柱の手前をふさがない・肩の幅の肌の帯が出ない）。襟は肩口の上の端に
  const NK = { cuTop: 0.37, yokeTop: 0.43, yokeR: 0.11, skinTopR: 0.1 };
  function neckOpen(T, P, mat) {
    const cu = P.cuirass; if (!cu) return;
    const g = cu.geometry.parameters, bot = cu.position.y - g.height / 2, h = NK.cuTop - bot; cu.scale.y = h / g.height; cu.position.y = bot + h / 2;
    if (P.cuirass_seam) { const sp = P.cuirass_seam.geometry.parameters, top0 = P.cuirass_seam.position.y + sp.height / 2, d = top0 - NK.cuTop; if (d > 0) { P.cuirass_seam.scale.y = (sp.height - d) / sp.height; P.cuirass_seam.position.y -= d / 2; } }
    const yk = new T.Mesh(new T.CylinderGeometry(NK.yokeR, g.radiusTop, NK.yokeTop - NK.cuTop, 16), mat(0xd4d8de)); yk.scale.set(1, 1, cu.scale.z); yk.position.set(0, (NK.cuTop + NK.yokeTop) / 2, 0); yk.name = 'cuirass_yoke'; P.torso.add(yk); P.cuirass_yoke = yk;
    // （この直しは共通の buildHead に移した。2026-10-29）共通の首の円柱（buildHead）の上の端を、顔の箱の中まで 0.04 のばす（上の端のふたが、あごの下の丸みとのすき間から明るい 1 画素として見えていた。走りで頭が上を向くとき）
    P.head.children.forEach(o => { const q = o.isMesh && o.geometry.type === 'SphereGeometry' && o.geometry.parameters; if (q && Math.abs(q.radius - 0.05) < 1e-6 && Math.abs(Math.abs(o.position.x) - 0.205) < 1e-6) o.position.z -= 0.015; });   // 共通の耳（buildHead）を 0.015 うしろへ：耳の前の端が横髪の前の端より 0.01 前に出て、走りの正面で顔のふちに明るい 1 画素として見えた
    if (P.collar) { const cp = P.collar.geometry.parameters; P.collar.position.y = NK.yokeTop - cp.height / 2 + 0.015; }
    P.torso.children.forEach(o => { const q = o.isMesh && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters; if (q && Math.abs(q.radiusTop - 0.22) < 1e-6 && Math.abs(q.radiusBottom - 0.15) < 1e-6) { const b0 = o.position.y - q.height / 2, hh = NK.yokeTop - 0.01 - b0, n = new T.CylinderGeometry(NK.skinTopR, q.radiusBottom, hh, q.radialSegments); o.geometry.dispose(); o.geometry = n; o.position.y = b0 + hh / 2; } });   // 共通の素肌の胴（buildFromSpec の円柱）：上の端を肩口の下へ（首の円柱の手前をふさがない）
  }
  // 肩（窓口 2026-10-27：首の付け根から肩先へ「下がる」線に。肩当ての上の端は首の付け根より高くしない。肩幅は武闘家・エルフくらい）。
  // 指示書の丸い肩当て（球）を、肩の関節の上にかぶせる平たい楕円にして、外へ下がるように傾け、少し内へ寄せる。下の段も同じだけ下げて内へ
  const SH = { x: 0.26, y: 0.345, r: 0.11, sy: 0.42, sz: 1.05, tilt: 0.45, x2: 0.26, y2: 0.31, sy2: 0.5 };
  function shoulderFlat(T, P, mat) {
    for (const n of ['L', 'R']) { const c = new T.Mesh(new T.SphereGeometry(0.078, 12, 8), mat(0xd4d8de)); c.scale.set(1.0, 1.25, 1.1); c.position.set(0, -0.065, 0); c.name = 'shoulder_cap_' + n; P['arm' + n].add(c); P['shoulder_cap_' + n] = c; }   // 上うでの上の端（素肌の円柱の切り口）を、腕といっしょに動く銀の丸い当てでおおう（肩の角に肌色の点が出ない。上の端は首の付け根と同じ高さ）
    for (const [n, sx] of [['L', 1], ['R', -1]]) {
      const a = P['pauldron_' + n], b = P['pauldron2_' + n];
      if (a) { a.position.set(sx * SH.x, SH.y, 0); a.scale.set(SH.r / a.geometry.parameters.radius, SH.sy * SH.r / a.geometry.parameters.radius, SH.sz * SH.r / a.geometry.parameters.radius); a.rotation.set(0, 0, -sx * SH.tilt); }
      if (b) { b.position.set(sx * SH.x2, SH.y2, 0); b.scale.y = SH.sy2; b.rotation.set(0, 0, -sx * SH.tilt); }
    }
  }
  // 白いマント（2026-10-27 ユーザー指示「今ならワルキューレに白いマントを装備しても大丈夫な気がする」。canon のみ）。
  // 作りは戦士のマント（hero3d.js の v6・deformCape）を写した：肩のうしろから背中に沿う 1 枚の曲面（板にしない）。毎コマ、脚・腕・肩当て・スカートの後ろの布を
  // 太さのある線（カプセル）として、その中に入った点を背中から離れる向きへ押し出す（体・脚が突き抜けない）。押し出した量はとなりへなだらかに広げる。
  // ワルキューレの違い：肩当て（銀）と盾は前に出したまま（マントは肩のうしろから。脇の回り込みは CAPE.th まで＝盾の面より内がわ。盾は押し出しに入れない：入れるとマントが盾の外をおおう）。
  // 色はドット絵の白（#eff7fd）と、ひだの谷・裏の灰色（#bfc7d7）。裾に金のふちは付けない（ドット絵に無い）。後ろの金髪は頭に付いていて、マントの外に出る
  // マント：戦士と同じ設計（hero3d_canon.js の capeSheet・capeLikeWarrior。2026-10-28 ユーザー判断「マントについても戦士に合わせる（共通の設計）」）：幅・丈（膝の少し下）・ひだ・脚のよけ方は戦士と同じ。白・灰色の裏・金髪がマントの外に出るのはそのまま
  const CAPE = { white: 0xeff7fd, shade: 0xbfc7d7 };
  function whiteCape(T, group, P, toon, grad, floorY) {
    const CN = L().canon, cW = new T.Color(CAPE.white), cS = new T.Color(CAPE.shade);
    const sheet = CN.capeSheet(T, P.torso, { ...CN.capeLikeWarrior(T, P), col: (ft, fv, c) => c.copy(cW).lerp(cS, 0.8 * Math.min(1, ft * 2 + 0.2) * (1 - fv) / 2),
      mat: toon ? new T.MeshToonMaterial({ color: new T.Color(0xffffff).multiplyScalar(0.74), gradientMap: grad, vertexColors: true, side: T.FrontSide }) : new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: T.FrontSide }),
      matIn: toon ? new T.MeshToonMaterial({ color: new T.Color(CAPE.shade).multiplyScalar(0.74), gradientMap: grad, side: T.BackSide }) : new T.MeshLambertMaterial({ color: CAPE.shade, side: T.BackSide }) });
    if (sheet.inner.material.emissive) sheet.inner.material.emissive = new T.Color(CAPE.shade).multiplyScalar(0.25);   // 裏は灰色（裏が黒い穴に見えない）
    P.cape = sheet.mesh;
    const skB = P.skirtB && P.skirtB.children[0], skIdx = []; if (skB) { const pa = skB.geometry.attributes.position; for (let i = 0; i < pa.count; i += 3) skIdx.push(i); }
    return function deform(mode, t) {
      group.updateMatrixWorld(true);
      const { caps, Pt } = CN.capeLimbs(T, P, { thigh: 0.115, shin: 0.13, foot: 0.09, arm: 0.1, fore: 0.09, footPad: 0.03 });   // もも・すね（長靴）・足・腕（戦士の太さを女性の細さに）
      for (const k of ['L', 'R']) { const pd = P['pauldron_' + k]; if (pd) caps.push([Pt(pd, -0.06, 0, 0), Pt(pd, 0.06, 0, 0), 0.11]); }   // 肩当て（銀）がマントの上から出ない
      if (skB) for (const i of skIdx) { const pa = skB.geometry.attributes.position; const p = Pt(skB, pa.getX(i), pa.getY(i), pa.getZ(i)); caps.push([p, p, 0.035]); }   // スカートの後ろの布（脚に合わせて持ち上がる）
      sheet.deform(mode, t, caps); };
  }
  // 正面の顔の直し（2026-10-29。docs/handoff-face.md・canon.md「正面の顔」の決まりを最初から当てた案。比べは window.__VALKYRIEFACE・__VALKYRIEHAIR・__VALKYRIEHELM・__VALKYRIEHEAD）
  //  HAIR：nape [x, y, z の倍率]・cyl（うなじ・頭のうしろの髪の上半分を、まっすぐ立ち上がる筒に＝兜の中へ）・side（横髪の x）・back（長い髪の横の倍率）
  //  HELM：k [横, 前後の倍率]（兜の本体・帯・しのぎ。翼は兜の面に付いたまま外へ）・bot（帯の下の端の高さ）・thick（帯の高さ＝鉄の厚み）
  const VAL = {   // 2026-10-29 ユーザー判断「ワルキューレは N で ok」（見比べ：art_src/canon3d/v6/face_valkyrie/compare_common_*）
    FACE: {eye: {x: 0.09}, lash: 'one', ext: 0.06},   // 女性の共通の顔（canon.FACEF）に重ねる例外（lash 'one'＝canon.LASH1）   // 目の x 0.090（0.093 だと 128 ドットの正面で右目の白い点が横にのびた）・まつ毛 1 つ（兜で額が見えない）
    HAIR: {nape: [0.88, 1, 0.82], napeZ: 0.01, cyl: 6, side: 0.2, back: 0.9},
    PLEAT: [20, 0.1, 0.1],   // スカートのプリーツ [ひだの数（1 周）, 深さ（半径の割合）, ひだが始まる丈の割合]（2026-11-02）
    HELM: {common: true, k: 1.18, bot: 0.36, thick: 0.03},   /* 2026-11-02 ユーザー判断「ワルキューレの兜は戦士の案に合わせる」：戦士の案 A と同じくらいの縮め方（前は k 1.3・帯 0.065） */   // 戦士と同じ作りの兜（canon.helm）。大きさは頭の外形の 1.3 倍
    HEAD: {neck: true}, SPEAR: {turn: Math.PI / 2, gap: 0.06} };   // SPEAR（2026-10-29 ユーザー判断）：turn＝穂先を柄のまわりに 90 度（正面から薄い刃。剣と同じ）、gap＝歩き・走りで槍の下の端を地面から浮かせる（魔法使いの杖と同じ）   // 首の見える長さを武闘家にそろえる（canon.fitNeck。頭を 0.010 下げる）
  const V3 = k => (typeof window !== 'undefined' && window['__VALKYRIE' + k]) || (VAL && VAL[k]) || null;
  function headFit(T, P, FW) {
    const HR = V3('HAIR'), HL = V3('HELM'), hp = P.head;
    P.head.children.forEach(o => { const q = o.isMesh && o.geometry.type === 'SphereGeometry' && o.geometry.parameters; if (q && Math.abs(FW / 2 + 0.005 - 0.205) > 1e-6 && Math.abs(q.radius - 0.05) < 1e-6 && Math.abs(Math.abs(o.position.x) - (FW / 2 + 0.005)) < 1e-6) o.position.z -= 0.015; });   // 共通の耳（buildHead。x＝顔の幅/2＋0.005）を 0.015 うしろへ（neckOpen の直しと同じ。顔の幅で見分ける）
    if (HR) {
      const n = P.hair_nape; if (n && HR.nape) { n.scale.set(n.scale.x * HR.nape[0], n.scale.y * HR.nape[1], n.scale.z * HR.nape[2]); if (HR.napeZ) n.position.z += HR.napeZ; }
      if (n && HR.cyl) { const g = n.geometry.clone(), p = g.attributes.position, N = HR.cyl; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, y, z); if (y <= 0 || r < 1e-6) continue; const k = Math.pow(Math.pow(Math.hypot(x, z) / r, N) + Math.pow(y / r, N), -1 / N); p.setXYZ(i, x * k, y * k, z * k); } g.computeVertexNormals(); n.geometry = g; }   // 上半分を |横|^N＋|上|^N＝1 の面へ（横はまっすぐ立ち上がる。武闘家の cyl と同じ）
      for (const s of ['L', 'R']) { const h = P['hair_side_' + s]; if (h && HR.side != null) h.position.x = Math.sign(h.position.x) * HR.side; }
      if (P.hair_back && HR.back) P.hair_back.scale.x *= HR.back;
    }
    if (HL && HL.common) {   // 戦士と同じ作りの兜（canon.helm）。指示書の兜（球・帯・しのぎの箱）を外し、大きさは頭の外形の HL.k 倍（帯の下の端は HL.bot）。翼は形・色を変えず、新しい兜の面の同じ所（元の兜の面での横・高さの割合）へ
      const CN = L().canon, dome0 = P.helmet, TH = HL.thick || 0.065, bot = HL.bot != null ? HL.bot : 0.36, mat = c => { const k = dome0.material.clone(); k.color = new T.Color(c).multiplyScalar(k.isMeshToonMaterial ? 0.74 : 1); return k; };
      const c0 = dome0.position.y, rx0 = dome0.geometry.parameters.radius * dome0.scale.x, ry0 = dome0.geometry.parameters.radius * dome0.scale.y, z0 = dome0.position.z;
      for (const nm of ['helmet', 'helmet_band', 'helmet_ridge']) if (P[nm]) { P[nm].parent.remove(P[nm]); delete P[nm]; }
      const h = CN.helm(T, hp, { mat, y: bot + TH - 0.0175, k: HL.k || 1.3, th: TH, hk: HL.hk, iron: 0xd4d8de, ridge: 0xeef1f5, band: 0xa0a6af });   // 色はワルキューレの銀（兜 #d4d8de・しのぎ #eef1f5・帯 #a0a6af）のまま
      P.helmet = h.group;
      for (const nm of ['wing_L', 'wing2_L', 'wing_R', 'wing2_R']) { const w = P[nm]; if (!w) continue; const [x, y] = h.surf(w.position.x / rx0, (w.position.y - c0) / ry0); w.position.set(x, y, h.z + (w.position.z - z0)); w.userData.helm = true; }
      return;
    }
    if (HL) {
      const band = P.helmet_band, dome = P.helmet; if (!band || !dome) return;
      const b0 = band.position.y - band.geometry.parameters.height / 2, bot = HL.bot != null ? HL.bot : b0, TH = HL.thick || band.geometry.parameters.height, dy = bot - b0;
      const bp = band.geometry.parameters; band.geometry = new T.CylinderGeometry(bp.radiusTop, bp.radiusBottom, TH, bp.radialSegments); band.position.y = bot + TH / 2;   // 帯は底でふさがる（頭とのあいだは閉じる）
      { const dp = dome.geometry.parameters, cy = dome.position.y, ky = dome.scale.y, c = Math.max(-1, Math.min(1, (bot + TH - 0.005 - cy) / (dp.radius * ky))); dome.geometry = new T.SphereGeometry(dp.radius, dp.widthSegments, dp.heightSegments + 4, 0, Math.PI * 2, 0, Math.acos(c)); }   // 兜の本体は帯の上だけ（帯より下へ出た球の下半分が、広げると帯の下から銀色に見える）
      const cx = 0, cz = band.position.z, k = HL.k || [1, 1];
      for (const o of [dome, band, P.helmet_ridge].filter(Boolean)) { o.position.x = cx + (o.position.x - cx) * k[0]; o.position.z = cz + (o.position.z - cz) * k[1]; o.scale.x *= k[0]; o.scale.z *= k[1]; }
      for (const nm of ['wing_L', 'wing2_L', 'wing_R', 'wing2_R']) { const w = P[nm]; if (w) { w.position.x *= k[0]; w.position.z = cz + (w.position.z - cz) * k[1]; } }   // 翼は形を変えず、兜の面に付いたまま外へ
      if (HL.hk) {   // hk：兜の本体の丸み（帯の上〜てっぺんの高さ÷横の半径）。戦士の兜は 0.89（2026-10-29 ユーザー「兜の丸みは戦士と共通？」「てっぺんを高くしていい」）。帯の位置は保ち、てっぺんが上がる。しのぎ・翼は兜の面の同じ角の所に付いたまま上へ
        const c0 = dome.position.y, ry0 = dome.geometry.parameters.radius * dome.scale.y, c1 = bot + TH, ry1 = HL.hk * dome.geometry.parameters.radius * dome.scale.x, mv = y => c1 + (y - c0) * ry1 / ry0;
        const dp = dome.geometry.parameters; dome.geometry = new T.SphereGeometry(dp.radius, dp.widthSegments, dp.heightSegments, 0, Math.PI * 2, 0, Math.PI / 2 + 0.02);
        dome.position.y = c1; dome.scale.y = ry1 / dp.radius;
        for (const o of [P.helmet_ridge, P.wing_L, P.wing2_L, P.wing_R, P.wing2_R].filter(Boolean)) o.position.y = mv(o.position.y);
      }
      for (const o of [dome, band, P.helmet_ridge, P.wing_L, P.wing2_L, P.wing_R, P.wing2_R].filter(Boolean)) o.userData.helm = true;
    }
  }
  function buildValkyrie(T, opt = {}) {
    const toon = opt.toon !== false, ST = opt.steps || 5;
    const CAN = opt.canon && L().canon ? L().canon : null;   // 共通の決まり（案）のときだけ
    const FACE = CAN ? CAN.face(CAN.FACEF, V3('FACE')) : null;   // 女性の共通の顔に、この人の例外を重ねる
    const m = L().buildFromSpec(T, CAN ? 'valkyrie_canon' : 'valkyrie', { female: true, sideHair: CAN ? 0xe8bb4c : undefined, runBack: CAN ? 0.6 : undefined, footKickOnly: !!CAN, ...opt, eye: EYE, footDrop: 0, torsoExtra: 0.08, headScale: 0.92, neck: 0.06, face: FACE || undefined }), { group, parts } = m;   // headScale：頭（兜・髪ふくむ）は小さく、首が見えるように（2026-10-26 ユーザー指摘「顔がデカすぎて首がない」）
    let grad = null;
    if (toon) { const lv = Array.from({ length: ST }, (_, i) => Math.round(95 + 160 * i / (ST - 1))); grad = new T.DataTexture(new Uint8Array(lv.flatMap(v => [v, v, v, 255])), ST, 1, T.RGBAFormat); grad.minFilter = grad.magFilter = T.NearestFilter; grad.needsUpdate = true; }
    const mat = c => toon ? new T.MeshToonMaterial({ color: new T.Color(c).multiplyScalar(0.74), gradientMap: grad }) : new T.MeshLambertMaterial({ color: c, flatShading: true });
    const cyl = (r0, r1, h, c, x, y, z, p) => { const o = new T.Mesh(new T.CylinderGeometry(r0, r1, h, 16), mat(c)); o.position.set(x, y, z); p.add(o); return o; };
    const hold = () => {   // 盾のうで（左＝ +x）は、かまえた形で止める。槍の手（右＝ -x）は、canon では holdGrip（腕を振らない持ち方）
      if (!CAN) parts.armR.rotation.set(-0.3, 0, -0.3), parts.foreR.rotation.set(-0.55, 0, 0);
      if (CAN) CAN.holdShield(parts, 'L'); else parts.armL.rotation.set(-0.1, 0, 0.12), parts.foreL.rotation.set(-0.6, 0, 0);   // canon：盾を持つ腕の共通の作り（戦士と同じ。2026-10-29 ユーザー「盾を持つ手としてのルールを作って良い」。前はひじ -0.2 の浅いかまえ）
    };
    const basePose = m.pose; let grip = null, slideSpear = null, flare = null, capeDeform = null;
    m.pose = (mode, t, o) => { basePose(mode, t, o); hold(); if (CAN && grip) { grip(); if (slideSpear) slideSpear(mode === 'walk' || mode === 'run'); } if (flare) flare(); if (capeDeform) capeDeform(mode, t); };   // マントは、腕・脚・スカートを決めたあとで
    if (CAN) neckOpen(T, parts, mat);
    if (CAN && FACE) { headFit(T, parts, FACE.FW || 0.4); const HD = V3('HEAD'); if (HD && HD.down) parts.head.position.y -= HD.down; if (HD && HD.neck) L().canon.fitNeck(T, group, parts); }   // neck：首の見える長さを共通の値（canon の C.NECKV＝武闘家）にそろえる   // 頭を下げる（背は合わせ直さない）
    if (CAN) shoulderFlat(T, parts, mat);   // 肩当てを平たく・外へ下げる   // 首の見え方（正面で首の肌 2 行・8 画素以上）
    if (CAN) flare = skirtPanels(T, group, parts, mat);   // スカートは前後の 2 枚。足を出すと、ももに合わせて持ち上がる（裾から脚が突き抜けない）
    m.pose('stand', 0); group.updateMatrixWorld(true);
    const handAt = (fore, dx = 0, dy = 0, dz = 0) => { const v = new T.Vector3(dx, (CAN ? CAN.C.HANDY : -0.26) + dy, 0.01 + dz); fore.localToWorld(v); parts.torso.worldToLocal(v); return v; };
    const floorY = -parts.body.position.y;   // 胴の原点から見た床の高さ
    // 槍：右手（正面の絵の画面の左）のこぶしを通る、床から兜のはるか上までの垂直の長い柄（絵と同じ。手はこしの高さ）。手は柄をにぎる形（こぶしの円柱が柄をくるむ）
    { const spG = new T.Group(); parts.torso.add(spG); parts.spear = spG; if (CAN) { parts.armR.rotation.z = 0; parts.foreR.rotation.set(-Math.PI / 2, 0, 0); group.updateMatrixWorld(true); } const h = handAt(parts.foreR), top = CAN ? 1.17 - 0.31 : 1.17 /* canon：柄の上を 0.31 短く（穂先の形・大きさはそのまま）。描く枠（高さ 1.0 まで）に、立ち・歩き・走りの全コマで穂先が入る（ユーザー判断 2026-10-27「はみ出すなら短くしてよい」） */, BH = CAN ? 0.14 : 0, SD = BH, len = top - floorY - BH, cy = (top + floorY + BH) / 2;   /* BH：槍の下の端を床から少し上げる（足首の高さまで届かない）。SD：槍全体（長さは同じ）を下げて、立ちで下の端（石突き）を地面に着ける（2026-10-29 ユーザー「ワルキューレの杖も後端が地面につくように槍を下げて」。魔法使いの杖と同じ） */
      spG.position.set(h.x, h.y, h.z);
      const o = (r0, r1, hh, c, y) => cyl(r0, r1, hh, c, 0, y - h.y - SD, 0, spG);
      o(0.035, 0.035, len, 0x7a5232, cy); o(0.045, 0.045, 0.05, 0xe0b445, top - 0.06);
      const hd = new T.Mesh(new T.ConeGeometry(0.075, 0.62, 4), mat(0xeef1f5)); hd.position.set(0, top + 0.31 - h.y - SD, 0); hd.scale.set(1, 1, 0.35); { const SP = CAN && V3('SPEAR'); if (SP && SP.turn) { hd.geometry.scale(1, 1, 0.35); hd.geometry.rotateY(SP.turn); hd.scale.set(1, 1, 1); } } spG.add(hd);   /* SPEAR.turn：穂先を柄のまわりに回す（比べ用。既定は今のまま） */
      o(0.04, 0.03, 0.08, 0xa0a6af, floorY + BH + 0.04);
      const fist = cyl(0.058, 0.058, 0.12, 0xffc49b, 0, 0, 0, spG); parts.fist = fist; parts.handR.visible = false;
      if (CAN) { const yBut = floorY + BH - h.y - SD; grip = CAN.holdGrip(T, group, parts, { side: 'R', prop: spG, buttY: yBut, fixed: true });
        const base = spG.position.clone(), v = new T.Vector3(), w = new T.Vector3();   // 歩き・走りで槍の下の端が地面（全体の y＝0）より下に出るコマは、槍を手の中で上へすべらせて地面で止める（魔法使いの杖と同じ。決まり「持ち物は地面より下に出ない」）
        slideSpear = (moving) => { spG.position.copy(base); const gap = moving ? ((V3('SPEAR') || {}).gap || 0) : 0;   /* gap：歩き・走りのあいだは、下の端を地面からこれだけ浮かせる（魔法使いの杖と同じ） */ group.updateMatrixWorld(true); let lo = Infinity; for (let k = 0; k < 8; k++) { const dx = 0.035 * Math.cos(k * Math.PI / 4), dz = 0.035 * Math.sin(k * Math.PI / 4); group.worldToLocal(spG.localToWorld(w.set(dx, yBut, dz))); lo = Math.min(lo, w.y); } if (lo >= gap) return;   /* 柄の下の端の円の縁（柄の半径 0.035）までふくめて、いちばん低い所 */ group.worldToLocal(spG.localToWorld(v.set(0, yBut, 0))); group.worldToLocal(spG.localToWorld(w.set(0, yBut + 1, 0))); const a = w.y - v.y; if (a > 1e-6) { spG.translateY((gap - lo) / a); spG.updateMatrixWorld(true); } }; } }   // fixed：腕を振らず、槍の前後の傾き＝胴の前後の傾き（ユーザー判断 2026-10-27）
    // 盾：左手（正面の絵の画面の右）のひじから先に取りつける。面は真横（ +x ）に向け、ひじから先と盾が平行（左がわから見ると丸く見える）。ひじから先といっしょに動く
    { const sd = new T.Group(); if (CAN) CAN.mountShield(parts, sd, 'L'); else { sd.position.set(0.11, -0.12, 0.03); sd.rotation.y = Math.PI / 2; parts.foreL.add(sd); } parts.shield = sd;
      const LAY = CAN ? [[0.36, 0.04, 0xe0b445, -0.004], [0.335, 0.08, SKY, 0], [0.115, 0.08, 0xe0b445, 0.035], [0.06, 0.1, SKY, 0.045]]   // canon：重なる面どうしを 0.016 u 以上はなす（前は金のふちと青い面の裏が同じ平面、表も 0.012 u しか離れておらず、斜めから金の点・筋がまだらにちらついた）
        : [[0.36, 0.05, 0xe0b445, -0.006], [0.335, 0.062, 0x2c5cb4, 0], [0.115, 0.08, 0xe0b445, 0.03], [0.06, 0.09, 0x2c5cb4, 0.034]];
      for (const [r, h2, c, z] of LAY) cyl(r, r, h2, c, 0, 0, z, sd).rotation.x = Math.PI / 2; }
    if (CAN) { capeDeform = whiteCape(T, group, parts, toon, grad, floorY); m.pose('stand', 0); }
    if (CAN) L().canon.fitTorsoTop(T, parts, 0.42);   /* 胴の上の端を肩の関節に（canon.fitTorsoTop。2026-10-29 ユーザー「全員、胴の上の端を肩の関節（0.44）に合わせる」）。TOP：今の胴の上の端 */
    if (CAN) { const AR = { pauld: 1, lames: [0.13, 0.08, 0.03], chest: 1, silver: 0xb9c0cc, dark: 0x7d8494 };   // 模様のある胸当てと丸い肩当て（ユーザー判断：2026-11-02「模様のある胸当てと丸い肩当ても入れる」、2026-11-03 案の絵に「これでいいよ」）
      const tor = parts.torso, cu = tor.getObjectByName('cuirass'); group.updateMatrixWorld(true); const mk = (geo, c) => { const m = new T.Mesh(geo, mat(c)); return m; };
      if (cu) { const pa = cu.geometry.attributes.position, v = new T.Vector3(), rAt = (() => { let y0 = Infinity, y1 = -Infinity; const P = []; for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(cu.matrix); P.push(v.clone()); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); } const band = yy => { let rx = 0, rz = 0; for (const q of P) if (Math.abs(q.y - yy) < 0.005) { rx = Math.max(rx, Math.abs(q.x)); rz = Math.max(rz, Math.abs(q.z)); } return [rx, rz]; }; const b0 = band(y0), b1 = band(y1); return y => { const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0))); return [b0[0] + (b1[0] - b0[0]) * t, b0[1] + (b1[1] - b0[1]) * t]; }; })();
        for (const y of AR.lames || []) { const [rx, rz] = rAt(y); if (!rx) continue; const m = mk(new T.CylinderGeometry(1, 1, 0.014, 24), AR.dark); m.scale.set(rx + 0.006, 1, rz + 0.006); m.position.set(0, y, 0); m.name = 'cuirass_lame'; tor.add(m); }   // 腹の横の段（板の重なり）
        if (AR.chest) { const yc = 0.24, [rx, rz] = rAt(yc); for (const sx of [-1, 1]) { const g = new T.TorusGeometry(0.075, 0.007, 4, 16, Math.PI); const m = mk(g, AR.dark); m.position.set(sx * 0.07, yc + 0.02, rz + 0.004); m.rotation.z = Math.PI; m.name = 'cuirass_chest'; tor.add(m); } } }   // 胸の 2 枚の丸い板の下の線
      if (AR.pauld) for (const n of ['L', 'R']) { const p = tor.getObjectByName('pauldron_' + n); if (!p) continue; p.visible = false; const d = mk(new T.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), AR.silver); d.position.copy(p.position); d.position.y -= 0.02; d.scale.set(1, 0.85, 1.1); d.rotation.z = -Math.sign(p.position.x) * 0.35; d.name = 'pauldron_dome'; tor.add(d);
        const r = mk(new T.TorusGeometry(0.128, 0.012, 4, 20), AR.dark); r.rotation.x = Math.PI / 2; r.scale.set(1, 1.1, 1); const g = new T.Group(); g.position.copy(d.position); g.rotation.z = d.rotation.z; g.add(r); r.position.y = 0.135 * 0.85 * Math.cos(Math.PI * 0.55) ; tor.add(g); } }   // 丸い肩当て（おわん形・すそに暗い銀のふち）
    if (CAN) L().canon.femaleHead(T, group, parts, m.pose, 0.005, 1);   // 頭は 1 倍（2026-10-29 ユーザー「ワルキューレは兜を被っているから髪の毛を減らす必要がない」）。0.005：首をそろえたあと下げる量   // 女性の頭（共通。C.FHEAD 0.83 倍・首を C.NECKV にそろえて C.FNECKD 下げる。2026-10-29 ユーザー判断）
    return m;
  }
  L().buildValkyrie = buildValkyrie;
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildValkyrie };
})(typeof window !== 'undefined' ? window : globalThis);
