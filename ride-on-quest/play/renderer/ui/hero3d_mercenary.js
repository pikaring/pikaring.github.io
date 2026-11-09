/* 傭兵（男）の 3D（2026-10-27。主人公候補。錬金術師から替えた＝rq-people。主人公としては、まだ選べない＝CAST・ゲームには入れていない）。
   見本：art_src/canon3d/user_feedback/mercenary_reference_20261027.jpg（ユーザーの絵。9 方向）。決定と経緯：docs/3d-canon/parts/mercenary.md。
   ユーザーの言葉「戦士のモデルを元に作ると完成が早い」：骨組み・脚・腕・動き（pose）は戦士（hero3d.js の build0 の canon・fine の道筋）を写し、体の大きさの段も戦士と同じ（C.SIZE に無い id は 1）。
   顔・首・耳は共通の canon.buildHead だけ。服（革の胴着・肩当て・X の帯・腕当て・腰帯と小袋）・黒い短髪とひげ・背中の剣・右腰の短剣を足す。
   左右：L ＝ +x（キャラ自身の左。canon §1-10）。戦士の手組みは armL が -x（名前が逆）だが、ここは canon に合わせた。
   使い方：RQ.lowpoly.buildMercenary(T, { toon, steps, q }) → { group, parts, pose }。いつも canon（ゲームの今の見た目は無い）。前提：hero3d.js・hero3d_canon.js を先に読む。 */
(function (root) {
  const RQ = root.RQ = root.RQ || {};
  const L = () => RQ.lowpoly;
  const M2D = { face: 0xe8a380, neck: 0xd9906f, noSkirt: 1, pants: 0x765948, pk: 1.12, hip: [0.25, 0.23, 0.16, -0.07, 0.7], crotch: -0.50, reach: 0.17 };   // 2D に寄せる（ユーザー判断 2026-11-02〜03：日焼けした肌・服のすそを外す・茶のズボン・腰回り「裾を無くしたら…人間らしく修正」、股の高さ「c」＝帯→股 18 ドット・股下 38（背 102）。見比べ art_src/canon3d/v6/sync2d_20261101/mercenary_crotch_bc.png）
  const COL = { face: 0xffc49b, neck: 0xf2b189, eye: 0x241812, leather: 0x7b4b2e, leatherL: 0x93593a, leatherD: 0x58361f, strap: 0x2b2627, pants: 0x564d36, boot: 0x6b4226, bootD: 0x4d301a, sole: 0x3d2a18, hair: 0x1f1b1d, sleeve: 0x77706a, steel: 0xc9ced8, steelD: 0x8e95a3, grip: 0x4a2e1a, sheath: 0x6a3622 };
  // 顔と髪（2026-10-29 ユーザー判断「OKです。これで入れてください。」＝案 6。hairstyle_mercenary_6.png）：
  //   「おじさん」ルール（傭兵だけ。ユーザー「目の高さを上半分だけにする(可愛いすぎるから)」「白目もなしに」「白い点は小さく」）：目は上の端のまま高さを半分・白目なし・白い点は小さく（2×2 の決まりより小さい）。
  //   頭の外形は canon.shellHead（ボリュームを減らした shell）・おでこ（line・ext）・前髪の房は頭の中（tuftK）・耳の上を削って耳を出す（ear）。2D の顔に寄せた眉・傷・ひげ（BOX：[幅, 高さ, x, y, 傾き, 色, 左右対称, 名前]）
  const MERC = { ext: 0.1, eye: { y: 0.2925, h: 0.085 }, glint: { w: 0.026, h: 0.026, dx: 0.016, dy: 0.012 }, shell: { r: 0.252, h: 0.235 }, line: { c: 0.465, s: 0.44, w: 0.4, z: 0.06 }, tuftUp: 0.6, tuftK: 0.85, ear: { x: 0.13, z: -0.12, y: 0.3 },
    BOX: [[0.1, 0.03, 0.093, 0.35, 0.22, null, true, 'brow'], [0.3, 0.075, 0, 0.125, 0, null, false, 'beard'], [0.13, 0.03, 0, 0.165, 0, null, false, 'beard'], [0.07, 0.13, 0.155, 0.12, 0, null, true, 'beard'],
      [0.022, 0.09, -0.115, 0.405, -0.4, 0x9a5a3a, false, 'scar'], [0.022, 0.07, -0.135, 0.215, -0.4, 0x9a5a3a, false, 'scar']] };   // 眉（太く黒く、内側が下がる）・口ひげ〜あごの間・鼻の下の口ひげ・あごの両横・傷（画面の左の目のまわり、額から頬へ斜め。目の上と下）
  function buildMercenary(T, opt = {}) {
    const CAN = L().canon, C = CAN.C, toon = opt.toon !== false, ST = opt.steps || 3, Q = opt.q || 1;
    const LX = 0.74 * 0.4, AX = 0.3 * 0.35, KN = C.KN, SH = C.SH;   // 骨組みは共通の C（戦士の案 B：脚 1.4・腕 1.35）。LX・AX は長靴・手の位置の目安（戦士と同じ）
    if (M2D.face) { COL.face = M2D.face; COL.neck = M2D.neck; } if (M2D.pants) COL.pants = M2D.pants;
    const SKIN = new T.Color(COL.face).multiplyScalar(C.SKINK).getHex(), DX = C.shX - 0.335;   // SKIN：素肌の腕・手は共通の C.SKINK で顔と同じに見せる。DX：肩の関節を共通の C.shX へ寄せたぶん（肩当ても一緒に寄せる）
    let grad = null;
    if (toon) { const lv = ST === 3 ? [105, 185, 255] : Array.from({ length: ST }, (_, i) => Math.round(95 + 160 * i / (ST - 1))); grad = new T.DataTexture(new Uint8Array(lv.flatMap(v => [v, v, v, 255])), ST, 1, T.RGBAFormat); grad.minFilter = grad.magFilter = T.NearestFilter; grad.needsUpdate = true; }
    const mat = c => toon ? new T.MeshToonMaterial({ color: new T.Color(c).multiplyScalar(0.74), gradientMap: grad }) : new T.MeshLambertMaterial({ color: c, flatShading: true });
    const group = new T.Group(), parts = {};
    const nm = (m, name) => { if (name) { m.name = name; } return m; };
    const box = (w, h, d, c, x, y, z, p, name) => { const m = nm(new T.Mesh(new T.BoxGeometry(w, h, d), mat(c)), name); m.position.set(x, y, z); p.add(m); return m; };
    const cyl = (r0, r1, h, seg, c, x, y, z, p, name) => { const m = nm(new T.Mesh(new T.CylinderGeometry(r0, r1, h, Math.round(seg * Q)), mat(c)), name); m.position.set(x, y, z); p.add(m); return m; };
    const sph = (r, sx, sy, sz, c, x, y, z, p, ws = 10, hs = 7, name) => { const m = nm(new T.Mesh(new T.SphereGeometry(r, Math.round(ws * Q), Math.round(hs * Q)), mat(c)), name); m.scale.set(sx, sy, sz); m.position.set(x, y, z); p.add(m); return m; };
    const ell = (rt, rb, h, seg, sx, sz, c, x, y, z, p, name) => { const m = cyl(rt, rb, h, seg, c, x, y, z, p, name); m.scale.set(sx, 1, sz); return m; };
    const pivot = (x, y, z, p) => { const g = new T.Group(); g.position.set(x, y, z); p.add(g); return g; };

    const baseY = C.baseY;
    const body = parts.body = pivot(0, baseY, 0, group);
    // 脚：深緑がかった茶のズボンと、茶の長靴（戦士と同じ形。膝当て・金の留め金は無し）
    for (const sx of [1, -1]) {
      const S = sx > 0 ? 'L' : 'R';
      const leg = parts['leg' + S] = pivot(sx * C.legX, 0, 0, body);
      ell(0.116 * M2D.pk, 0.09 * M2D.pk, KN + 0.02, 12, 1, 1.05, COL.pants, 0, -KN / 2, 0, leg, 'pants'); sph(0.104 * M2D.pk, 1, 0.85, 1.05, COL.pants, 0, 0, 0, leg, 10, 7, 'pants');   // ズボンは少しゆったり
      const shin = parts['shin' + S] = pivot(0, -KN, 0, leg);
      if (M2D.crotch) { const yc = M2D.crotch, y0 = 0.01, pk = M2D.pk, rb = y => (0.09 + (0.116 - 0.09) * (y + KN + 0.01) / (KN + 0.02)) * pk, a = M2D.reach - rb(y0), N = 12;   // 股を下げる（2026-11-03 ユーザー「足の内側が違和感ある」→ 平らな板をやめた形）。ももを上ほど太く丸く、内がわへふくらませ、左右のももが股で自然につながる形に（外がわの輪郭は今のまま）。下の端 yc（腰の関節から）で元のももの太さに戻る。ももに付くので脚といっしょに動く。骨組みは同じ
        const g = new T.CylinderGeometry(1, 1, 1, 16, N, true), pa = g.attributes.position;
        for (let i = 0; i < pa.count; i++) { const t = 0.5 - pa.getY(i), y = y0 + (yc - y0) * t, k = Math.cos(t * Math.PI / 2), r = rb(y) + a * k / 2; pa.setXYZ(i, pa.getX(i) * r - sx * a * k / 2, y, pa.getZ(i) * r * 1.05); }
        g.computeVertexNormals(); leg.add(nm(new T.Mesh(g, mat(COL.pants)), 'pants')); }
      sph(0.097 * M2D.pk, 1, 0.9, 1, COL.pants, 0, 0, 0, shin, 10, 7, 'pants');
      ell(0.094 * M2D.pk, 0.08 * M2D.pk, 0.44 + LX - KN + 0.03, 12, 1, 1.05, COL.pants, 0, -(0.44 + LX - KN) / 2, 0, shin, 'pants');
      cyl(0.115, 0.095, 0.32, 12, COL.boot, 0, -0.58 - LX + KN, 0.01, shin, 'boot');
      cyl(0.128, 0.122, 0.07, 10, COL.bootD, 0, -0.43 - LX + KN, 0.01, shin, 'boot');   // 長靴の口の折り返し（見本：口に巻いた革）
      box(0.035, 0.035, 0.02, COL.bootD, 0, -0.52 - LX + KN, 0.118, shin, 'boot');      // 留めの革
      const foot = parts['foot' + S] = pivot(0, -(SH - 0.08), 0, shin);
      sph(0.115, 1.0, 0.7, 1.45, COL.bootD, 0, -0.03, 0.1, foot, 10, 7, 'boot');
      box(0.2, 0.035, 0.3, COL.sole, 0, -0.085, 0.07, foot, 'boot');
    }
    // 胴：茶色の革の胴着（戦士の胴の形のまま色を替える）
    const torso = parts.torso = pivot(0, 0, 0, body);
    ell(0.31, 0.235, 0.46, 16, 1, 0.64, COL.leather, 0, 0.23, 0, torso, 'tunic');
    sph(0.2, 1.1, 0.75, 0.75, COL.leatherL, 0, 0.34, 0.03, torso, 12, 8, 'chest');      // 胸当て（明るい革）
    ell(0.17, 0.2, 0.04, 14, 1, 0.8, COL.leatherD, 0, 0.45, 0.0, torso, 'neckline');   // えりぐり（低い。首を隠さない）
    ell(0.25, 0.25, 0.08, 16, 1, 0.66, COL.leatherD, 0, 0.03, 0, torso, 'belt');       // 腰帯
    if (M2D.hip) { const [rt, rb, hh, yy, zk] = M2D.hip, hp = new T.Mesh(new T.CylinderGeometry(rt, rb, hh, 18), mat(COL.pants)); hp.scale.set(1, 1, zk); hp.position.set(0, yy, 0); hp.name = 'pants_hip'; torso.add(hp); }   // 腰回り（おしりと股。すそを外すと、胴から脚が直接生えて見えた）
    box(0.08, 0.07, 0.03, COL.steelD, 0, 0.03, 0.16, torso, 'buckle'); box(0.04, 0.035, 0.035, COL.leatherD, 0, 0.03, 0.17, torso, 'buckle');
    // 胴着の裾（2026-10-27 ユーザー指摘「胴から下の服の形がおかしい。前後を腰の幅に合わせて裾を長く」）：前後の厚みは腰帯と同じ（WZ）、ももの中ほどまで。
    // 前と後ろの 2 枚（canon 手順 5。武闘家・ワルキューレ・エルフと同じ作り）。歩き・走りで、前へ出たももに前の 1 枚、後ろへ出たももに後ろの 1 枚を、帯の下を支点に持ち上げる
    const HEM = { top: -0.005, len: 0.36, r0: 0.25, r1: 0.3, WZ: 0.72, OV: 0.3, KF: 1.1, KB: 1.1 }, hemList = [];
    { const SEG = Math.round(16 * Q), prof = (k, a, b) => { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new T.Vector2((HEM.r0 + (HEM.r1 - HEM.r0) * Math.sin(Math.min(1, t / 0.6) * Math.PI / 2)) * k, -HEM.len * (a + (b - a) * t))); } return pts.reverse(); };
      for (const [n, ph0, k] of [['F', -Math.PI / 2 - HEM.OV, 1], ['B', Math.PI / 2 - HEM.OV, 0.985]]) {
        const g = pivot(0, HEM.top, 0, torso); parts['skirt' + n] = g;
        for (const [pts, c] of [[prof(k, 0, 1), COL.leather], [prof(k * 1.02, 0.9, 1.0), COL.leatherD]]) {
          const o = nm(new T.Mesh(new T.LatheGeometry(pts, SEG, ph0, Math.PI + 2 * HEM.OV), mat(c)), 'hem'); o.material.side = T.DoubleSide; o.frustumCulled = false; if (M2D.noSkirt) continue; g.add(o);
          const pa = o.geometry.attributes.position; for (let i = 0; i < pa.count; i++) pa.setZ(i, pa.getZ(i) * HEM.WZ);
          hemList.push({ o, n, base: Float32Array.from(pa.array) }); } } }
    const bendHem = () => {   // 前後の真ん中ほど大きく、脇ほど小さく持ち上げる（重み＝|z|/r を 0.55 で割って 1 まで）。持ち上げたぶん長く（上限 1.15）
      const tr = torso.rotation.x, a = parts.legL.rotation.x - tr, b = parts.legR.rotation.x - tr, ang = { F: Math.min(0, a, b) * HEM.KF, B: Math.max(0, a, b) * HEM.KB };
      for (const { o, n, base } of hemList) { const A = ang[n], pa = o.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) { const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2], zr = z / HEM.WZ, r = Math.hypot(x, zr), w = r > 1e-6 ? Math.min(1, Math.abs(zr) / r / 0.55) : 0, t = A * w;   // ももは前後の真ん中より脇寄り（x ±0.145）なので、真ん中から ±56° までは同じだけ持ち上げる
          if (t === 0) { pa.setXYZ(i, x, y, z); continue; }
          const ys = y * Math.min(1.15, 1 / Math.cos(t)), c = Math.cos(t), sn = Math.sin(t); pa.setXYZ(i, x, ys * c - z * sn, ys * sn + z * c); }
        pa.needsUpdate = true; o.geometry.computeVertexNormals(); } };
    // 肩当て：2 枚重ねの革（見本：大きく、上に重なる）
    for (const sx of [1, -1]) {
      sph(0.125, 1.05, 0.8, 1.05, COL.leather, sx * (0.31 + DX), 0.385, 0, torso, 12, 8, 'pauldron');   // 肩の関節（C.shX）といっしょに内へ寄せる（形は同じ）
      sph(0.165, 1.05, 0.5, 1.1, COL.leatherL, sx * (0.33 + DX), 0.43, 0, torso, 12, 6, 'pauldron');
      sph(0.15, 1.05, 0.4, 1.05, COL.leatherD, sx * (0.35 + DX), 0.37, 0, torso, 12, 5, 'pauldron');
    }
    // 胸と背中で X に交わる黒い帯（肩 → 反対の腰）。胴の面に沿わせる（エルフのたすきと同じ作り）
    group.updateMatrixWorld(true);
    { const rc = new T.Raycaster(), shell = [];
      torso.children.forEach(o => { if (o.isMesh && (o.name === 'tunic' || o.name === 'chest')) shell.push(o); });
      const surf = (x, y, zs) => { const o = torso.localToWorld(new T.Vector3(x, y, zs)), d = torso.localToWorld(new T.Vector3(x, y, 0)).sub(o).normalize(); rc.set(o, d); const h = rc.intersectObjects(shell)[0]; return h ? torso.worldToLocal(h.point.clone()).z : 0; };
      for (const zs of [1, -1]) for (const sx of [1, -1]) {
        const a = [sx * 0.22, 0.45], b = [-sx * 0.2, 0.07], N = 6;
        for (let i = 0; i < N; i++) { const t0 = i / N, t1 = (i + 1) / N, p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
          const z0 = surf(...p0, zs) + zs * 0.01, z1 = surf(...p1, zs) + zs * 0.01, len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], z1 - z0);
          const s = box(0.05, len + 0.012, 0.016, COL.strap, (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (z0 + z1) / 2, torso, 'strap');
          s.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(p1[0] - p0[0], p1[1] - p0[1], z1 - z0).normalize()); } } }
    // 左腰の小袋（+x）
    { const pg = pivot(0.29, -0.05, 0.05, torso); pg.rotation.y = 1.2; parts.pouch = pg;
      box(0.11, 0.12, 0.06, COL.leatherD, 0, 0, 0, pg, 'pouch'); box(0.115, 0.04, 0.065, COL.leather, 0, 0.045, 0.004, pg, 'pouch'); }
    // 背中の剣：右肩の上に柄、左腰の下に刃先（見本）。鞘は茶、刃先と鍔・柄頭は鋼（戦士の前の背負い方と同じ傾き）
    const sword = parts.sword = pivot(0.06, 0.2, -0.265, torso); sword.rotation.z = 0.78;
    // 2026-10-29 ユーザー判断「肩紐とクロスする部分だけ茶色にして、そこで支えていることにしてあとは剥き身にする」「いいね」：鞘なしのむき身（2D と同じ）。鋼の刃と真ん中の暗い筋、肩紐が交わる所（刃の付け根の少し下）だけ茶色の留め具
    box(0.075, 0.98, 0.018, COL.steel, 0, -0.09, 0, sword, 'blade'); box(0.012, 0.9, 0.022, COL.steelD, 0, -0.1, 0, sword, 'blade'); box(0.085, 0.05, 0.03, COL.steel, 0, 0.38, 0, sword, 'blade');
    box(0.1, 0.16, 0.034, COL.leatherD, 0, 0.02, 0, sword, 'sheath');
    { const tg = new T.ConeGeometry(0.05, 0.2, 4); const tp = nm(new T.Mesh(tg, mat(COL.steel)), 'blade'); tp.rotation.set(Math.PI, Math.PI / 4, 0); tp.scale.set(1, 1, 0.45); tp.position.set(0, -0.66, 0); sword.add(tp); }   // 鞘から出た刃先
    box(0.24, 0.04, 0.05, COL.steel, 0, 0.43, 0, sword, 'guard');
    box(0.045, 0.17, 0.045, COL.grip, 0, 0.535, 0, sword, 'hilt');
    sph(0.04, 1, 1, 1, COL.steel, 0, 0.64, 0, sword, 6, 4, 'pommel');
    // 右腰（-x）の短剣：腰帯から下へ、少し前・外へ傾けて下げる
    { const dg = parts.dagger = pivot(-0.3, -0.01, 0.05, torso); dg.rotation.set(0.25, 0, -0.18);
      box(0.045, 0.1, 0.045, COL.grip, 0, -0.05, 0, dg, 'dagger'); box(0.11, 0.025, 0.04, COL.steelD, 0, -0.11, 0, dg, 'dagger');
      box(0.06, 0.2, 0.016, COL.steel, 0, -0.22, 0, dg, 'dagger');
      { const tp = nm(new T.Mesh(new T.ConeGeometry(0.042, 0.08, 4), mat(COL.steel)), 'dagger'); tp.rotation.set(Math.PI, Math.PI / 4, 0); tp.scale.set(1, 1, 0.27); tp.position.set(0, -0.36, 0); dg.add(tp); } }
    // 腕：肩当ての下に灰色の短い袖、上腕は素肌、前腕は革の腕当て、手は素手
    for (const sx of [1, -1]) {
      const S = sx > 0 ? 'L' : 'R';
      const arm = parts['arm' + S] = pivot(sx * C.shX, C.shY, 0, torso);   // 肩の関節は共通の C.shX（2026-10-29：戦士と同じ）
      { const SL = 0.4 * C.UA, sl = ell(0.092, 0.086, SL + 0.01, 12, 1, 1.05, COL.sleeve, 0, -SL / 2 + 0.005, 0, arm, 'sleeve'), pa = sl.geometry.attributes.position; let yt = -Infinity, r = 0;   // 袖の付け方は戦士と同じ（上うでの 4 割・上の端を外へ 0.07 下げる＝なで肩の円すい台・肩当ての下に入る）
        for (let i = 0; i < pa.count; i++) { yt = Math.max(yt, pa.getY(i)); r = Math.max(r, Math.abs(pa.getX(i))); } for (let i = 0; i < pa.count; i++) if (pa.getY(i) > yt - 1e-4) pa.setY(i, pa.getY(i) - 0.07 * Math.max(0, Math.min(1, (sx * pa.getX(i) + r) / (2 * r)))); pa.needsUpdate = true; sl.geometry.computeVertexNormals();
        cyl(0.07, 0.066, C.UA - SL + 0.01, 12, SKIN, 0, -(C.UA + SL) / 2, 0, arm, 'skin'); }   // 上うでの素肌（戦士と同じ太さ）
      const fore = parts['fore' + S] = pivot(0, -C.UA, 0, arm);
      sph(0.075, 1, 1, 1, SKIN, 0, 0, 0, fore, 10, 7, 'skin');   // ひじ（戦士と同じ）
      cyl(0.088, 0.082, 0.21, 10, COL.leather, 0, -0.025 - 0.105, 0, fore, 'bracer');   // 腕当て（ひじの下〜手首）
      cyl(0.092, 0.092, 0.03, 10, COL.leatherD, 0, -0.04, 0, fore, 'bracer'); cyl(0.087, 0.087, 0.03, 10, COL.leatherD, 0, -0.225, 0, fore, 'bracer');
      parts['hand' + S] = sph(C.HAND, 1, 1.05, 1, SKIN, 0, C.HANDY, 0.01, fore, 10, 7, 'hand');
      box(0.04, 0.07, 0.05, SKIN, 0, -0.27 - AX / 2, 0.08, fore, 'hand');
    }
    // 頭：顔・首・目・鼻・口・耳は共通のコード。髪とひげは黒
    const head = parts.head = pivot(0, C.headY, 0, torso); head.scale.setScalar(C.HS);
    CAN.buildHead(T, head, { mat, COL, Q, female: false, neckBackColor: COL.hair, face: Object.assign({}, CAN.FACEM, { ext: MERC.ext, eye: { ...CAN.FACEM.eye, ...MERC.eye }, glint: [MERC.glint] }) });   // 正面の顔は男性の共通の顔（canon.FACEM）に「おじさん」ルールの目（MERC）   // 首のうしろ半分は髪の色（うしろ・斜め後ろから首の肌を出さない）
    { // 髪：頭を包む 1 つの丸い面。前は顔の前の面より後ろ・ひたいの線（目の上）より上。上は少し高く（見本：てっぺんに量がある）
      const hg = new T.SphereGeometry(1, Math.round(24 * Q), Math.round(16 * Q)), hp = hg.attributes.position, CX = 0.228, CY = 0.19, CYL = 0.25, CZ = 0.232, OY = 0.29, OZ = -0.025;
      for (let i = 0; i < hp.count; i++) { const u = Math.max(0, -hp.getY(i)), rk = hp.getY(i) < 0 ? Math.sqrt(1 - Math.pow(u, 3)) / Math.max(1e-6, Math.sqrt(1 - u * u)) : 1;   // 下半分は深く・横に張る（後ろ頭の下の端まで、顔の箱の横・後ろのふちを包む）
        let x = hp.getX(i) * CX * (u > 0.999 ? 0 : rk), y = OY + hp.getY(i) * (hp.getY(i) < 0 ? CYL : CY), z = OZ + hp.getZ(i) * CZ * (u > 0.999 ? 0 : rk);
        if (z > 0.18) z = 0.18;
        const fr = Math.max(0, Math.min(1, (z - 0.04) / 0.06)), sd = Math.max(0, Math.min(1, (Math.abs(x) - 0.15) / 0.05)) * Math.max(0, Math.min(1, (z + 0.1) / 0.08));
        const lo = Math.max(0.345 * fr, 0.27 * sd);   // 前はひたい（目の上）、横は耳の上より下へ下ろさない（短い横髪）。うしろは首の上まで
        if (y < lo) y = lo;
        hp.setXYZ(i, x, y, z); }
      hg.computeVertexNormals(); const hr = nm(new T.Mesh(hg, mat(COL.hair)), 'hair'); head.add(hr);
      for (const [x, y, z, r] of [[-0.07, 0.43, 0.08, 0.07], [0.06, 0.435, 0.095, 0.065]]) sph(r, 1.3, 0.75, 1.1, COL.hair, x, y, z, head, 8, 6, 'hair');   // てっぺんの量（少し乱れた短髪）
      // うなじ：首のうしろ・よこの肌を髪で（戦士の nh・n2 と同じ）
      sph(0.1, 2.0, 0.55, 1.6, COL.hair, 0, 0.12, -0.12, head, 10, 8, 'hair'); sph(0.1, 0.9, 0.9, 1.0, COL.hair, 0, -0.05, -0.13, head, 10, 8, 'hair'); sph(0.1, 1.95, 0.5, 1.3, COL.hair, 0, 0.06, -0.13, head, 10, 8, 'hair');   // 後ろ頭の下の端（顔の箱の下まで）
      for (const sx of [1, -1]) sph(0.1, 1.25, 0.8, 1.0, COL.hair, sx * 0.15, 0.17, -0.1, head, 10, 8, 'hair');   // 耳のうしろ（うしろから耳・頬のふちを出さない。横からは耳が見える）
      // もみあげ（耳の前でひげにつながる）
      for (const sx of [1, -1]) box(0.03, 0.15, 0.07, COL.hair, sx * 0.197, 0.255, 0.06, head, 'hair');
    }
    { // ひげ：あご・頬（耳の前〜口のわき）・口ひげ。口は出す。顔の前の面から少しだけ前へ（0.012）
      const F = CAN.FACE, zf = F.FZ + F.FD / 2;
      box(0.39, 0.06, 0.24, COL.hair, 0, 0.075, zf - 0.11, head, 'beard');           // あご（口の下）
      box(0.28, 0.03, 0.08, COL.hair, 0, 0.042, zf - 0.03, head, 'beard');           // あごの先の下がり
      for (const sx of [1, -1]) {
        box(0.1, 0.06, 0.2, COL.hair, sx * 0.152, 0.128, zf - 0.094, head, 'beard');    // 口のわきの頬
        box(0.03, 0.17, 0.2, COL.hair, sx * 0.192, 0.16, zf - 0.13, head, 'beard');     // あごの線（耳の前までつながる）
        box(0.055, 0.025, 0.02, COL.hair, sx * 0.05, 0.158, zf + 0.004, head, 'beard'); // 口ひげ（鼻の下・口の上）
        if (sx > 0) for (const [w, h, x, y, rz, c, mir, n] of MERC.BOX) for (const m of mir ? [1, -1] : [1]) box(w, h, 0.02, c != null ? c : COL.hair, m * x, y, zf + (n === 'scar' ? 0.006 : 0.004), head, n).rotation.z = m * rz;   // 案 6 の眉・ひげ・傷
      }
    }
    // 動き：戦士（hero3d.js の pose の canon の道筋）と同じ。持ち物は手に持たないので、両腕とも振る
    let ampS = null; const KK = CAN.KICK.mercenary;
    function pose(mode, t, o) {
      const run = mode === 'run', walk = mode === 'walk', moving = run || walk;
      const f = run ? 1.55 : 1.05, ph = t * Math.PI * 2 * f, s = Math.sin(ph), c = Math.cos(ph);
      let A = run ? 0.75 : 0.5;
      if (moving && o && o.stride > 0) {
        const want = Math.asin(Math.min(1, o.stride / (4 * (0.74 + LX) * (run ? 0.95 : 0.97)) * (run ? 0.65 : 1)));
        const tgt = Math.min(run ? 0.9 : 0.45, Math.max(run ? 0.45 : 0.2, want)); ampS = ampS == null ? tgt : ampS + (tgt - ampS) * 0.15; A = ampS;
      }
      const armA = run ? 0.95 : 0.5;
      const knee = sg => { if (!moving) return 0.02; const cs = sg * c, ss = sg * s, swing = Math.max(0, -cs), load = Math.max(0, cs) * Math.max(0, -ss); return run ? 0.9 * Math.pow(swing, 0.8) + 0.35 * load : 0.7 * Math.pow(swing, 0.9) + 0.15 * load; };
      let lowest = 0;
      for (const [leg, shin, foot, sg] of [[parts.legR, parts.shinR, parts.footR, 1], [parts.legL, parts.shinL, parts.footL, -1]]) {   // 戦士の legL（-x）と同じ位相
        const th0 = moving ? sg * s * A + (run ? 0 : 0.04) : 0, th = run ? Math.min(Math.max(th0, -0.45), 0.6) : th0, kn = run && KK ? CAN.kick(knee(sg), ph, sg, KK) : knee(sg);
        leg.rotation.x = th; shin.rotation.x = kn; foot.rotation.x = run && KK ? CAN.footAlong(th, kn) : -(th + kn) * (run ? 0.75 : 1);   // KK：走りの蹴り上げ（hero3d_canon.js）
        lowest = Math.max(lowest, KN * Math.cos(th) + (SH - 0.08) * Math.cos(th + kn) + 0.11);
      }
      body.position.y = moving ? baseY + (lowest - baseY) * (run ? 0.5 : 0.8) : baseY + Math.sin(t * 2.0) * 0.008;
      for (const [arm, fore, sg] of [[parts.armR, parts.foreR, 1], [parts.armL, parts.foreL, -1]]) {
        const ar = moving ? -sg * s * armA : 0.02 * sg * Math.sin(t * 1.7);
        arm.rotation.x = ar; const fwd = Math.max(0, -ar) / armA;
        fore.rotation.x = run ? -1.25 - 0.4 * fwd : walk ? -0.2 - 0.35 * fwd : -0.1;
      }
      parts.armL.rotation.z = 0.26; parts.armR.rotation.z = -0.26;   // 手を体から離す（canon §1-8）
      torso.rotation.x = run ? 0.28 : walk ? 0.05 : 0; torso.rotation.y = moving ? s * (run ? 0.2 : 0.1) : 0; body.rotation.x = 0;
      head.rotation.x = run ? -0.22 : 0; head.rotation.y = moving ? -s * (run ? 0.1 : 0.05) : 0;
      bendHem();
    }
    group.userData.parts = parts;
    pose('stand', 0);
    { const Ln = MERC.line; CAN.shellHead(T, parts.head, { shell: MERC.shell, tuftUp: MERC.tuftUp, tuftK: MERC.tuftK, line: (x, z) => z > Ln.z ? Ln.s + (Ln.c - Ln.s) * Math.max(0, 1 - Math.pow(Math.abs(x) / Ln.w, 2)) : null });   // 頭の外形・おでこ・前髪の房
      const E = MERC.ear; parts.head.children.forEach(o => { if (!(o.isMesh && o.name === 'hair' && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius === 1)) return; const pa = o.geometry.attributes.position, v = new T.Vector3(); o.updateMatrix(); const M = o.matrix, Mi = new T.Matrix4().copy(M).invert();   // 耳の上で髪の下を削って耳を出す（侍と同じ）
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(M); if (Math.abs(v.x) > E.x && v.z > E.z && v.y < E.y) { v.y = E.y; v.applyMatrix4(Mi); pa.setXYZ(i, v.x, v.y, v.z); } } o.geometry.computeVertexNormals(); });
      for (const o of parts.head.children.slice()) if (o.isMesh && o.name === 'hair' && Math.abs(Math.abs(o.position.x) - 0.15) < 1e-6 && Math.abs(o.position.y - 0.17) < 1e-6) parts.head.remove(o); }   // 耳のうしろの髪の球を外す
    CAN.fitFoot(T, group, parts, false);   // 足（靴）の大きさは共通（戦士と同じ）
    CAN.fitTorsoTop(T, parts, 0.49);   /* 胴の上の端を肩の関節に（canon.fitTorsoTop。2026-10-29 ユーザー「全員、胴の上の端を肩の関節（0.44）に合わせる」）。TOP：今の胴の上の端 */
    CAN.fit(T, group, parts, 'mercenary'); CAN.fitNeck(T, group, parts, 0.1);   // 首の見える長さを共通の値（C.NECKV）にそろえる（長いぶんだけ頭を下げる。0.1：下げ幅の上限＝エルフ・女性と同じ）   // 体の大きさの段：男・戦闘職＝戦士と同じ（C.SIZE に無い id は 1）
    if (KK) CAN.addSoles(T, parts, 'mercenary');   // 走りで蹴り上げる人は、靴の裏を白っぽく（背を合わせたあと）
    return { group, parts, pose };
  }
  L().buildMercenary = buildMercenary;
})(typeof window !== 'undefined' ? window : globalThis);
