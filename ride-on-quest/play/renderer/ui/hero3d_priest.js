/* 僧侶のローポリ 3D（2026-10-26 ユーザー依頼。まだゲームに入れない＝ index.html には入れていない）。
   戦士・魔法使いと同じ作り。背の高さは戦士と同じ（2026-10-26 ユーザー判断：僧侶は剣士と同じ背の高さでよい）。ローブの裾は魔法使いと同じ仕組み（ふくらはぎ・長靴に押し上げられる）。
   今のドット絵に合わせた：茶色の短い髪、青い丸い帽子（ぼうし）、白に近い水色のふちの青い長いローブ（前の水色の帯・すその水色のふち）、茶色の長靴、左手に持つ灰色の頭の杖。
   使い方：RQ.lowpoly.buildPriest(T, { toon, steps, q }) → { group, parts, pose(mode, t, opt) }。RQ.hero3d.create(T, { builder: RQ.lowpoly.buildPriest }) で、戦士と同じ板にできる。
   前提：hero3d.js を先に読む。 */
(function (root) {
  const RQ = root.RQ = root.RQ || {};
  const L = () => RQ.lowpoly;
  // 2D に寄せる（2026-11-02 ユーザー判断「ベレー帽はok」・「縁取りの色を直す」・「縁取りクリームにするなら襟もでは？」）：trim＝ローブの縁取り（前の合わせ・すそ・襟・袖口）を 2D のクリーム色、capRim＝帽子のふちは今の水色のまま、collar＝首の襟のクリーム色の範囲（前から ±0.5π＝横まで。あごの両わきの襟に見せている殻の内がわもクリーム色）、beret＝ベレー帽 [ふくらみの横・高さ・前後の半径, 中心の高さ, 中心の前後]（ふちの上で、正面でも横でも横へふくらむ）。ローブの形は今のまま（同日「僧侶のローブは今のままでいい」）
  const PS = { trim: 0xf7e8c5, capRim: 0xc8dcf2, shape: null, collar: 0.5, beret: [0.35, 0.17, 0.33, 0.44, -0.06] };
  const PAL = { robe: 0x3a70c4, robeD: 0x2a528f, gold: 0xc8dcf2, hair: 0x7a4a2a, hairD: 0x5a3320, boot: 0x6b4424, bootD: 0x4d301a, cap: 0x2f62b8, staff: 0x6a4126, metal: 0x9aa3b0, metalD: 0x6e7683, eye: 0x3a2a30, nose: 0xe3a08c, mouth: 0xd8584c };
  // 正面の顔・髪と帽子の合わせ方（2026-10-29 顔の直し。docs/3d-canon/canon.md「正面の顔」）。null は今の形。比べ用に window.__PRIESTFACE・__PRIESTHAIR・__PRIESTHAT（tools/lowpoly_hero/face_monk.js）
  // 2026-10-29 ユーザー判断：案 P1＝戦士と同じ男性の顔（B の目・白い点・顔の幅 0.37）、頭の上半分は筒（額は face.ext 0.05 で帽子の中へ・うしろ髪の上半分をまっすぐ帽子の中へ・前髪なし＝帽子に隠れる）、帽子と水色のふちを 1.15 倍（頭にいちばん近い所でもすき間がある。高さは同じ）
  const PRI = { FACE: {glint: [{w: 0.046, h: 0.05, dx: 0.012, dy: 0.042}], ext: 0.05},   /* 顔は男性の共通の顔（canon.FACEM）。白い点だけ dx 0.012（0.008 だと歩きの正面で「目の右側でない」が 1 コマ出た）、額を帽子の中へ（ext） */ HAIR: {cyl: true}, HAT: {k: 1.15} };
  const P3 = k => (typeof window !== 'undefined' && window['__PRIEST' + k]) || PRI[k];   // gold＝ローブの水色のふち（魔法使いの金のふちと同じ使い方）

  function buildPriest(T, opt = {}) {
    const toon = opt.toon !== false, ST = opt.steps || 5, Q = opt.q || 1, CAN = opt.canon && L().canon ? L().canon : null;   // CAN：共通の決まり（案。docs/3d-canon/canon.md）。付けたときだけ使う（ゲームの見た目は、まだ変えない）
    const FA = CAN ? 0.0675 : 0;   // 共通の決まりでは、ひじ〜手の中心が戦士と同じ（0.3275）。そのぶん袖を伸ばす
    const sh = { leg: 1.4, arm: 1.35, head: 0.9 * 1.3 };   // 戦士の案 B と同じ
    const LX = 0.74 * (sh.leg - 1), AX = 0.3 * (sh.arm - 1), KN = (0.74 + LX) * 0.5, SH = 0.74 + LX - KN, baseY = 0.74 + LX + 0.03;
    const COL = L().COL;
    let grad = null;
    if (toon) { const lv = Array.from({ length: ST }, (_, i) => Math.round(95 + 160 * i / (ST - 1))); grad = new T.DataTexture(new Uint8Array(lv.flatMap(v => [v, v, v, 255])), ST, 1, T.RGBAFormat); grad.minFilter = grad.magFilter = T.NearestFilter; grad.needsUpdate = true; }
    const mat = c => toon ? new T.MeshToonMaterial({ color: new T.Color(c).multiplyScalar(0.74), gradientMap: grad }) : new T.MeshLambertMaterial({ color: c, flatShading: true });
    const group = new T.Group(), parts = {};
    const add = (m, x, y, z, p) => { m.position.set(x, y, z); (p || group).add(m); return m; };
    const box = (w, h, d, c, x, y, z, p) => add(new T.Mesh(new T.BoxGeometry(w, h, d), mat(c)), x, y, z, p);
    const cyl = (r0, r1, h, seg, c, x, y, z, p) => add(new T.Mesh(new T.CylinderGeometry(r0, r1, h, Math.round(seg * Q)), mat(c)), x, y, z, p);
    const ell = (r0, r1, h, seg, sx, sz, c, x, y, z, p) => { const m = cyl(r0, r1, h, seg, c, x, y, z, p); m.scale.set(sx, 1, sz); return m; };
    const sph = (r, sx, sy, sz, c, x, y, z, p, ws = 10, hs = 7) => { const m = add(new T.Mesh(new T.SphereGeometry(r, Math.round(ws * Q), Math.round(hs * Q)), mat(c)), x, y, z, p); m.scale.set(sx, sy, sz); return m; };
    const pivot = (x, y, z, p) => { const g = new T.Group(); g.position.set(x, y, z); (p || group).add(g); return g; };

    const body = parts.body = pivot(0, baseY, 0);
    // 左右の名前は全員と同じ L ＝ +x（キャラ自身の左。canon.md §1-10。2026-10-29 ユーザー「左右の名前は統一した方がいい」）。前は手組みで L ＝ −x だった。見た目は同じ（杖は今と同じ −x の手＝R）
    // 脚：ローブの下から長靴が見える
    for (const sx of [-1, 1]) {
      const leg = parts[sx < 0 ? 'legR' : 'legL'] = pivot(sx * (CAN ? CAN.C.legX : 0.12), 0, 0, body);
      ell(0.085, 0.07, KN + 0.02, 10, 1, 1, PAL.robeD, 0, -KN / 2, 0, leg);
      const shin = parts[sx < 0 ? 'shinR' : 'shinL'] = pivot(0, -KN, 0, leg);
      ell(0.075, 0.07, 0.13, 10, 1, 1, PAL.robeD, 0, -0.065, 0, shin);
      if (CAN) {   // v10.1（魔法使いの v6.9 と同じ。2026-10-27 ユーザー指摘「靴の内部が見えて、足のパーツがないことが分かってしまう。長靴を長くすると解決するのでは」）：長靴をひざのすぐ下（0.02）まで伸ばし、ひざに長靴の色の平たい球で口をふさぐ
        cyl(0.1, 0.085, SH - 0.01, 14, PAL.boot, 0, -(SH + 0.03) / 2, 0.005, shin);
        cyl(0.103, 0.103, 0.03, 14, PAL.bootD, 0, -0.035, 0.005, shin);                         // 長靴の上のふち（v10.8：長靴の濃い色。水色だと、走りで後ろの裾が上がったとき、両足のあいだに白・灰の小さな四角に見えた＝別の目のレビュー 2 回目。ふだんは裾の中で見えない）
        sph(0.098, 1, 0.8, 1, PAL.boot, 0, -0.02, 0.005, shin, 12, 8);                           // 長靴の口をふさぐ
      } else {
      cyl(0.1, 0.085, SH - 0.1, 14, PAL.boot, 0, -(SH + 0.12) / 2 - 0.005, 0.005, shin);   // 長靴（ふくらはぎまで。裾がこの上に乗る。今のドット絵のとおり）
      cyl(0.103, 0.103, 0.03, 14, PAL.gold, 0, -0.13, 0.005, shin);                          // 長靴の上の金のふち
      }
      const foot = parts[sx < 0 ? 'footR' : 'footL'] = pivot(0, -(SH - 0.08), 0, shin);
      sph(0.1, 1, 0.7, 1.4, PAL.bootD, 0, -0.03, 0.09, foot);                              // つま先
      box(0.17, 0.035, 0.26, PAL.bootD, 0, -0.085, 0.06, foot);                            // 靴底
    }
    // ローブ：腰から裾へ広がる。金のふちと、前の金の線
    const len = baseY - 0.02 - (CAN ? 0.24 : 0.13);   // 共通の決まり（案 v5）：ローブの丈をふくらはぎの中ほどまで（脚に押される量を減らす）
    const skirt = parts.skirt = pivot(0, 0.02, 0, body);
    if (CAN && PS.trim) PAL.gold = PS.trim;
    // ローブの裾は 1 枚の曲面（頂点の色で、裾の金のふちと前の金の線を塗る）。歩き・走りで、脚の動きに合わせて裾が跳ね上がり、脚がつき抜けないように毎コマ形を変える（2026-10-26 ユーザー指摘）
    const sm01 = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    const RT = 0.18, ZT = 0.66 / 0.9, ZL = 0.5;   // 0.2（胴の下の端と同じ）だと走りの裾に角が 4 つ増える（R14）。0.18 で段は 1 ドット未満   // v6：ローブの腰の半径を胴の下の端と同じに（腰の段をなくす。立ちは肩から裾へ 1 枚の台形）
    const SK_SEG = CAN ? 144 : 44, SK_H = CAN ? 24 : 16, SKZ = 0.9;   // 裾は今のドット絵のようにせまく（ふくらはぎが当たって押し上げられる）
    const skg = new T.CylinderGeometry(CAN ? RT : 0.2, CAN ? 0.32 : 0.31, len, SK_SEG, SK_H, true).toNonIndexed(), skp = skg.attributes.position, sk0 = Float32Array.from(skp.array), skc = new Float32Array(skp.count * 3);   // 三角形ごとに色を塗る（金のふちをくっきり）
    if (CAN) for (let i = 0; i < skp.count; i++) { const t = (len / 2 - sk0[i * 3 + 1]) / len, k = ZT + (1 - ZT) * sm01(t / ZL); sk0[i * 3 + 2] *= k; skp.array[i * 3 + 2] *= k; }
    if (CAN && PS.shape) { const [fF, fB] = PS.shape; for (let i = 0; i < skp.count; i++) { const t = (len / 2 - sk0[i * 3 + 1]) / len, r = RT + (0.32 - RT) * t, z = sk0[i * 3 + 2]; const nz = z > 0 ? z * (RT + (r - RT) * fF) / r : z * (1 + fB * t); sk0[i * 3 + 2] = nz; skp.array[i * 3 + 2] = nz; } }   // shape：前は平ら・うしろは下ほど広がる形（null＝使わない。2026-11-02 は今の形のまま）   // v6：腰では、ローブの奥行きを胴と同じに（横から見て、腰に段が出ない）。下へ行くほど元の奥行きへ
    { const cr = new T.Color(PAL.robe), cg = new T.Color(PAL.gold);
      for (let f = 0; f < skp.count; f += 3) {
        let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += sk0[(f + k) * 3] / 3; cy += sk0[(f + k) * 3 + 1] / 3; cz += sk0[(f + k) * 3 + 2] / 3; }
        const t = (len / 2 - cy) / len, front = cz > 0 && Math.abs(cx) < 0.045 * (0.6 + 0.4 * t), c = t > 0.945 || (front && t < 0.99) ? cg : cr;   // 裾の金のふち、前の金の線
        for (let k = 0; k < 3; k++) { skc[(f + k) * 3] = c.r; skc[(f + k) * 3 + 1] = c.g; skc[(f + k) * 3 + 2] = c.b; } } }
    skg.setAttribute('color', new T.BufferAttribute(skc, 3));
    const BW = 0.045;   // v6：前の帯の半分の幅。胴の帯（0.09）と同じで、腰から裾まで一定（2〜3 ドットで行ごとに幅が変わると、はしごに見えた。ユーザー指摘）
    const BAND = CAN ? (() => { const nt = skp.count / 3, b = { t: new Float32Array(nt), fr: new Uint8Array(nt), g: new Uint8Array(nt), r: new Uint8Array(nt), c: Array.from({ length: 9 }, (_, k) => new T.Color(PAL.robe).lerp(new T.Color(PAL.gold), k / 8)) };   // 三角形ごとの高さ（0 腰〜1 裾）・前がわか・今の色
      for (let q = 0; q < nt; q++) { let cx = 0, cy = 0, cz = 0; const q0 = q & ~1; for (let k = 0; k < 6; k++) { cx += sk0[(q0 * 3 + k) * 3] / 6; cy += sk0[(q0 * 3 + k) * 3 + 1] / 6; cz += sk0[(q0 * 3 + k) * 3 + 2] / 6; }   /* 四角（三角形 2 枚の組）ごとに決める：帯のふちが三角形のぎざぎざ（はしご）にならない */ const t = (len / 2 - cy) / len; b.t[q] = t; b.fr[q] = cz > 0 ? 1 : 0; b.r[q] = !(t > 0.945) && cz > 0 && Math.abs(cx) < BW && t < 0.99 ? 1 : 0; b.g[q] = 255; }   /* 255＝まだ塗っていない（最初の形で必ず塗り直す） */
      return b; })() : null;
    if (BAND) { const col = skg.attributes.color.array; for (let q = 0; q < BAND.t.length; q++) { const c = BAND.t[q] > 0.945 || BAND.r[q] ? BAND.c[8] : BAND.c[0]; for (let k = 0; k < 3; k++) { col[(q * 3 + k) * 3] = c.r; col[(q * 3 + k) * 3 + 1] = c.g; col[(q * 3 + k) * 3 + 2] = c.b; } } skg.attributes.color.needsUpdate = true; }   // v9：裾の縁と前の帯は、最初の形で塗る（四角ごと・一定の幅）。筒を曲げても布と一緒に動く
    if (BAND) parts.recolor = f => { const a = f(BAND.c[0].clone()), b = f(BAND.c[8].clone()); BAND.c.forEach((c, k) => c.copy(a).lerp(b, k / 8)); };   // 色違い（hero3d.js の recolor）：毎コマ塗り直す前の帯の色（ローブ〜ふち）も替える
    const skm = new T.Mesh(skg, toon ? new T.MeshToonMaterial({ color: new T.Color(0xffffff).multiplyScalar(0.74), gradientMap: grad, vertexColors: true, side: T.FrontSide }) : new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: T.FrontSide }));
    skm.position.set(0, -len / 2, 0); skm.scale.set(1, 1, SKZ); skirt.add(skm);
    const skin = new T.Mesh(skg, mat(CAN ? 0x33609f : 0x14284a).clone()); skin.material.side = T.BackSide; if (CAN && skin.material.emissive) skin.material.emissive = new T.Color(PAL.robe).multiplyScalar(0.5); skin.position.copy(skm.position); skin.scale.copy(skm.scale); skirt.add(skin);   // ローブの内側は暗い色（2026-10-26 ユーザー依頼）   // v10.2：魔法使い v7.1 とそろえる。内がわは光の裏で暗くなり、走りで裾が上がると門の奥が暗い穴に見えた（別の目のレビュー）。ローブの色を半分だけ自分で光らせて布の色に見せる（形は変えない）
    const fillers = [];   // v10：スリットの裏の脇の布（魔法使いの v6.7 と同じ。裾を持ち上げるとき、同じ割合で縮める）
    const SLIT = 68 * Math.PI / 180, FILW = 28 * Math.PI / 180;   // ひざより下の前・後ろの板の幅（正面・真後ろから ±68°）、スリットの裏の脇の布の半幅（魔法使いと同じ）
    if (CAN) {   // 脇の布 4 本（まっすぐ下がる。半径は裾の 0.96 倍＝前・後ろの板の内がわ。ローブの青だけ）。形は僧侶のローブの上の半径・奥行きの細りに合わせる
      const rAt = t => RT + (0.32 - RT) * t, zkA = t => (ZT + (1 - ZT) * sm01(t / ZL)) * SKZ, yK = -0.02 - KN, NA = 6, NY = 8, cR = new T.Color(PAL.robe);
      for (const [c0, hw, rk] of [[SLIT, FILW, 0.96], [-SLIT, FILW, 0.96], [Math.PI - SLIT, FILW, 0.96], [-(Math.PI - SLIT), FILW, 0.96], [Math.PI, 0.28, 0.7]]) {   // 最後の 1 枚（v10.3。魔法使い v7.2 と同じ）：両足のあいだの後ろの布（真後ろ ±0.28 rad、半径 0.7 倍、ひざから裾まで）。走りで後ろの裾が門の形に上がったとき、中が見えてズボンに見えた（別の目のレビュー・窓口の判断 案 C）。脚（±0.145）は通らない
        const pos = [], col = [], idx = [];
        const ys = []; for (let j = 0; j <= NY; j++) ys.push([yK + (-len - yK) * j / NY, cR]);   // v10.9：v10.8 で付けた裾の水色のふちは外した（布をひざから縮めるので、ふちが裾より上に上がり、ローブの中に白い横線に見えた）
        for (const [y, cc] of ys) { const t = -y / len, r = rAt(t) * rk;
          for (let i = 0; i <= NA; i++) { const a = c0 - hw + 2 * hw * i / NA; { let z = r * Math.cos(a) * zkA(t); if (PS.shape) { const r0 = rAt(t); z = z > 0 ? z * (RT + (r0 - RT) * PS.shape[0]) / r0 : z * (1 + PS.shape[1] * t); } pos.push(r * Math.sin(a), y, z); } col.push(cc.r, cc.g, cc.b); } }
        for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
        const m = new T.Mesh(g, toon ? new T.MeshToonMaterial({ color: new T.Color(0xffffff).multiplyScalar(0.74), gradientMap: grad, vertexColors: true, side: T.DoubleSide }) : new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: T.DoubleSide }));
        if (m.material.emissive) m.material.emissive = new T.Color(PAL.robe).multiplyScalar(0.3);   // v10.8：ローブの内がわ（v10.2）と同じく、少し自分で光らせる（光の裏で暗い青に見えた）
        m.userData.back = Math.cos(c0) < 0; skirt.add(m); fillers.push(m);
      }
    }
    const flaps = [], WRAP = 0.3;   // v10.7（魔法使い v7.5 と同じ）：前・後ろの板の左右の端から内がわへ巻き込む細い布（4 枚。板の端から、真ん中へ向かって半径の WRAP 倍まで）。板が脚と一緒に回ると、脇とのあいだのくさび形のすき間から奥の長靴が縦の線に見えた（窓口 2026-10-27）
    if (CAN) for (const [rg, sg] of [[1, -1], [1, 1], [2, -1], [2, 1]]) { const m = new T.Mesh(new T.BufferGeometry(), toon ? new T.MeshToonMaterial({ color: new T.Color(PAL.robe).multiplyScalar(0.74), gradientMap: grad, side: T.DoubleSide }) : new T.MeshLambertMaterial({ color: PAL.robe, flatShading: true, side: T.DoubleSide })); m.material.polygonOffset = true; m.material.polygonOffsetFactor = 1; m.material.polygonOffsetUnits = 1; m.position.copy(skm.position); m.scale.copy(skm.scale); m.userData.rg = rg; m.userData.sg = sg; skirt.add(m); flaps.push(m); }   // v10.8：巻き込みの布は奥行きを少し奥へずらして描く（外の縁が板の端と同じ位置なので面が重なり、立ちの横でローブに暗い 1 ドットが出た＝別の目のレビュー 2 回目。外の縁を内がわへ寄せると、走りでスリットの端に暗い点が増えた）
    const smooth = t => t * t * (3 - 2 * t);
    // 裾は、ふくらはぎに押し上げられる（今のドット絵のとおり。2026-10-26 ユーザー指摘：足がローブの中で動くのは不自然）。
    // ふくらはぎがローブの外へ出ると、その向きの裾が、ふくらはぎの上に乗る形でそこまで引き上げられる。ふくらはぎから下は、すねと長靴が見える。ももは、ローブの中でつき抜けないよう押し出す
    let SKU = null;   // v5.5：同じ位置の頂点（三角形ごとに別）を 1 つにまとめる。いまのゲームの見た目（canon なし）の裾も、1 つずつ計算して、全部に書き写す（結果は同じ）
    function skirtUniq() {
      const map = new Map(), id = new Uint32Array(skp.count), bx = [], by = [], bz = [];
      for (let i = 0; i < skp.count; i++) { const x = sk0[i * 3], y = sk0[i * 3 + 1], z = sk0[i * 3 + 2], key = x + ',' + y + ',' + z; let u = map.get(key); if (u === undefined) { u = bx.length; map.set(key, u); bx.push(x); by.push(y); bz.push(z); } id[i] = u; }
      return { n: bx.length, id, bx, by, bz, ox: new Float64Array(bx.length), oy: new Float64Array(bx.length), oz: new Float64Array(bx.length), prev: new Float64Array(bx.length * 3).fill(NaN), chg: new Uint8Array(bx.length) };
    }
    function deformSkirt(legs, run) {   // v5.5：配列を作らず、数だけで計算する（式・順序は元のまま。結果は同じ）
      const calf = new Float64Array(6), caps = new Float64Array(28), boots = new Float64Array(14);   // calf: 2 脚 × (x,y,z)。caps: 4 本 × (a(3), b(3), R)。boots: 2 本 × (a(3), b(3), R)
      for (let li = 0; li < 2; li++) {
        const [sx, th, kn] = legs[li];
        const hx = sx * (CAN ? CAN.C.legX : 0.12), hy = -0.02, hz = 0, kx = hx, ky = hy - KN * Math.cos(th), kz = hz - KN * Math.sin(th), a2 = th + kn, ax = kx, ay = ky - (SH + 0.02) * Math.cos(a2), az = kz - (SH + 0.02) * Math.sin(a2);
        const cx = kx + (ax - kx) * 0.4, cy = ky + (ay - ky) * 0.4, cz = kz + (az - kz) * 0.4;   // ふくらはぎ
        calf[li * 3] = cx; calf[li * 3 + 1] = cy; calf[li * 3 + 2] = cz;
        caps.set([hx, hy, hz, kx, ky, kz, 0.125, kx, ky, kz, cx, cy, cz, 0.115], li * 14);
        boots.set([kx, ky, kz, ax, ay, az, 0.105], li * 7);
      }
      const RC = 0.105, bkMax = Math.max(0, legs[0][1], legs[1][1]), fwMax = Math.max(0, -legs[0][1], -legs[1][1]), LIFTB = (run ? 0.3 : 0.1) * bkMax, LIFTF = (run ? 0.12 : 0.04) * fwMax;
      const KC = CAN ? 1.8 : 0.9, KB = CAN ? 0.16 : 0.05, KT = CAN ? 0.07 : 0.012, KL = CAN ? 0.03 : 0.12;
      const capB = new Float64Array(24), bootB = new Float64Array(8);   // 当たり判定の外側の箱（箱の外の点は、どちらの計算でも何も変わらない。速くするためだけ）
      for (let c = 0; c < 4; c++) { const o = c * 7, R = caps[o + 6]; capB[c * 6] = Math.min(caps[o], caps[o + 3]) - R; capB[c * 6 + 1] = Math.max(caps[o], caps[o + 3]) + R; capB[c * 6 + 2] = Math.min(caps[o + 1], caps[o + 4]) - R; capB[c * 6 + 3] = Math.max(caps[o + 1], caps[o + 4]) + R; capB[c * 6 + 4] = Math.min(caps[o + 2], caps[o + 5]) - R; capB[c * 6 + 5] = Math.max(caps[o + 2], caps[o + 5]) + R; }
      for (let c = 0; c < 2; c++) { const o = c * 7, M = boots[o + 6] + KB; bootB[c * 4] = Math.min(boots[o], boots[o + 3]) - M; bootB[c * 4 + 1] = Math.max(boots[o], boots[o + 3]) + M; bootB[c * 4 + 2] = Math.min(boots[o + 2], boots[o + 5]) - M; bootB[c * 4 + 3] = Math.max(boots[o + 2], boots[o + 5]) + M; }
      const bootLong = [Math.hypot(boots[3] - boots[0], boots[5] - boots[2]) > KL, Math.hypot(boots[10] - boots[7], boots[12] - boots[9]) > KL];   // 長靴が真下でない脚（1 回だけ求める）
      const SU = SKU || (SKU = skirtUniq());
      if (!SU.rr) {   // 元の位置だけで決まる量（向き・高さの重み・うしろの浮き）は、1 回だけ求める
        SU.rr = new Float64Array(SU.n); SU.ux = new Float64Array(SU.n); SU.uz = new Float64Array(SU.n); SU.hw = new Float64Array(SU.n); SU.t = new Float64Array(SU.n); SU.back = new Float64Array(SU.n); SU.frontL = new Float64Array(SU.n);
        for (let u = 0; u < SU.n; u++) {
          const x = SU.bx[u], z = SU.bz[u] * SKZ, t = (len / 2 - SU.by[u]) / len, rr = Math.hypot(x, z) || 1;
          SU.rr[u] = rr; SU.ux[u] = x / rr; SU.uz[u] = z / rr; SU.t[u] = t; SU.hw[u] = Math.pow(smooth(Math.max(0, (t - 0.3) / 0.7)), 1.3);
          const cf = z / rr; SU.back[u] = Math.max(0, Math.min(1, (-cf + 0.3) / 1.3)); SU.frontL[u] = Math.max(0, Math.min(1, (cf + 0.1) / 1.1));
        }
      }
      for (let u = 0; u < SU.n; u++) {
        const by = SU.by[u], bz = SU.bz[u], rr = SU.rr[u], ux = SU.ux[u], uz = SU.uz[u], t = SU.t[u], hw = SU.hw[u];
        let x = SU.bx[u], y = by - len / 2, z = bz * SKZ; const px = -uz, pz = ux;
        y += hw * (SU.back[u] * LIFTB + SU.frontL[u] * LIFTF);
        const ox = x, oy = y, oz = z;
        for (let li = 0; li < 2; li++) {
          const C0 = calf[li * 3], C1 = calf[li * 3 + 1], C2 = calf[li * 3 + 2], sC = C0 * ux + C2 * uz, lC = C0 * px + C2 * pz, over = sC - rr * 0.8;
          if (over <= 0 || Math.abs(lC) > 0.2) continue;
          const m = Math.min(1, over / 0.08) * (1 - Math.abs(lC) / 0.2) * hw;      // ふくらはぎがこの向きの裾を押す強さ
          const tx = C0 + ux * RC, ty = C1 + 0.01, tz = C2 + uz * RC;           // ふくらはぎの上に乗る位置
          x += (tx - ox) * m; y += (ty - oy) * m; z += (tz - oz) * m;
        }
        { let r2 = Math.sqrt(x * x + z * z) || 1; const vx = x / r2, vz = z / r2, wx = -vz, wz = vx;   // ももの向きにローブを張り出して、ももをおおう（ふくらはぎから下は、おおわない）
          for (let c = 0; c < 28; c += 7) {
            const a0 = caps[c], a1 = caps[c + 1], a2 = caps[c + 2], b0 = caps[c + 3], b1 = caps[c + 4], b2 = caps[c + 5], R = caps[c + 6];
            const dy = b1 - a1; if (Math.abs(dy) < 0.03) continue; const tt = (y - a1) / dy; if (tt < 0 || tt > 1) continue;
            const sa = a0 * vx + a2 * vz, sb = b0 * vx + b2 * vz, la = a0 * wx + a2 * wz, lb = b0 * wx + b2 * wz, sS = sa + (sb - sa) * tt, lL = la + (lb - la) * tt;
            if (Math.abs(lL) < R * 1.5 && sS + R * KC > r2) r2 = sS + R * KC;
          }
          x = vx * r2; z = vz * r2; }
        for (let c = 0; c < 14; c += 7) {                                                           // 足の下にローブはない：長靴の下がわにある布は、長靴の上へ引き上げる
          { const bb = (c / 7) * 4; if (x < bootB[bb] || x > bootB[bb + 1] || z < bootB[bb + 2] || z > bootB[bb + 3]) continue; }
          const a0 = boots[c], a1 = boots[c + 1], a2 = boots[c + 2], b0 = boots[c + 3], b1 = boots[c + 4], b2 = boots[c + 5], R = boots[c + 6];
          const abx = b0 - a0, abz = b2 - a2, l2 = abx * abx + abz * abz;
          const uu = l2 < 1e-5 ? 0.5 : Math.max(0, Math.min(1, ((x - a0) * abx + (z - a2) * abz) / l2)), qx = a0 + abx * uu, qz = a2 + abz * uu, qy = a1 + (b1 - a1) * uu, d2 = Math.sqrt((x - qx) * (x - qx) + (z - qz) * (z - qz));
          if (d2 < R + KB && -len < qy + 0.02 && bootLong[c / 7] ) { const top = qy + Math.sqrt(Math.max(R * R - Math.min(d2, R) * Math.min(d2, R), 0)) + KT; const yb = y - (by - len / 2 + len), dd = Math.max(0, top - yb); y += dd * Math.pow(smooth(Math.max(0, (t - 0.2) / 0.8)), 0.7); }
        }
        for (let c = 0; c < 28; c += 7) {                                                            // ももは、ローブの中で、つき抜けないように
          { const cb = (c / 7) * 6; if (x < capB[cb] || x > capB[cb + 1] || y < capB[cb + 2] || y > capB[cb + 3] || z < capB[cb + 4] || z > capB[cb + 5]) continue; }
          const a0 = caps[c], a1 = caps[c + 1], a2 = caps[c + 2], R = caps[c + 6], ab0 = caps[c + 3] - a0, ab1 = caps[c + 4] - a1, ab2 = caps[c + 5] - a2, ap0 = x - a0, ap1 = y - a1, ap2 = z - a2;
          const l2 = ab0 * ab0 + ab1 * ab1 + ab2 * ab2, uu = Math.max(0, Math.min(1, (ap0 * ab0 + ap1 * ab1 + ap2 * ab2) / l2));
          const d0 = x - (a0 + ab0 * uu), d1 = y - (a1 + ab1 * uu), d2 = z - (a2 + ab2 * uu), dl = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
          if (dl < R) { const k = (R - dl) / (dl || 1); if (dl < 1e-4) z += R; else { x += d0 * k; y += d1 * k; z += d2 * k; } }
        }
        SU.ox[u] = x; SU.oy[u] = y + len / 2; SU.oz[u] = z / SKZ;
      }
      const arr = skp.array, ids = SU.id, n = skp.count, chg = SU.chg, prev = SU.prev;
      for (let u = 0; u < SU.n; u++) { chg[u] = (SU.ox[u] !== prev[u * 3] || SU.oy[u] !== prev[u * 3 + 1] || SU.oz[u] !== prev[u * 3 + 2]) ? 1 : 0; prev[u * 3] = SU.ox[u]; prev[u * 3 + 1] = SU.oy[u]; prev[u * 3 + 2] = SU.oz[u]; }   // 前のコマと同じ頂点は書き直さない（結果は同じ）
      for (let i = 0; i < n; i++) { const u = ids[i]; if (!chg[u]) continue; arr[i * 3] = SU.ox[u]; arr[i * 3 + 1] = SU.oy[u]; arr[i * 3 + 2] = SU.oz[u]; }
      skp.needsUpdate = true;
      const nr = skg.attributes.normal.array;   // 三角形ごとの面の法線（computeVertexNormals と同じ式。非インデックスなので 1 頂点 = 1 面）
      for (let f = 0; f < n; f += 3) {
        if (!chg[ids[f]] && !chg[ids[f + 1]] && !chg[ids[f + 2]]) continue;
        const a = f * 3, b = a + 3, c = a + 6, cbx = arr[c] - arr[b], cby = arr[c + 1] - arr[b + 1], cbz = arr[c + 2] - arr[b + 2], abx = arr[a] - arr[b], aby = arr[a + 1] - arr[b + 1], abz = arr[a + 2] - arr[b + 2];
        let nx = cby * abz - cbz * aby, ny = cbz * abx - cbx * abz, nz = cbx * aby - cby * abx; const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1); nx *= l; ny *= l; nz *= l;
        nr[a] = nr[a + 3] = nr[a + 6] = nx; nr[a + 1] = nr[a + 4] = nr[a + 7] = ny; nr[a + 2] = nr[a + 5] = nr[a + 8] = nz;
      }
      skg.attributes.normal.needsUpdate = true;
    }
    // 共通の決まり（案 v3）：ローブは裂けない 1 枚の布。(1) 脚（ももとふくらはぎ）がローブの外へ出る向きの裾を、なめらかに（向きだけで決まる量で）ふくらはぎの上まで引き上げる＝裾の金・水色のふちは 1 本の連続した線のまま。(2) 引き上げた裾より上は、脚の向きへ張り出して、ももとひざをおおう。ふくらはぎから下は、すねと長靴が裾の下に見える
    function deformSkirt2(legs) {
      const segs = [], MV = Math.min(1, Math.max(Math.abs(legs[0][1]), Math.abs(legs[1][1])) / 0.3);   // v5.1：脚の振りが小さい（立ち）ほど、裾の押し出しを小さく（箱形にならない）
      for (const [sxs, th, kn] of legs) {
        const sx = sxs < 0 ? -1 : 1, hx = sx * CAN.C.legX, hy = -0.02, ky = hy - KN * Math.cos(th), kz = -KN * Math.sin(th), a2 = th + kn;
        const ay = ky - (SH + 0.02) * Math.cos(a2), az = kz - (SH + 0.02) * Math.sin(a2);
        const ex = -(SH + 0.02) * 0.45, edl = Math.hypot(ay - ky, az - kz) || 1, eey = ay + (ay - ky) / edl * ex, eez = az + (az - kz) / edl * ex;
        segs.push([[hx, hy, 0], [hx, ky, kz], 0.125], [[hx, ky, kz], [hx, eey, eez], 0.115]);   // 脚ぜんぶ（足の先まで）を、布が包む
      }
      const sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      const S = SK2 || (SK2 = initSk2());   // v5.4：毎コマの計算を軽く。同じ位置の頂点（三角形ごとに別）は 1 回だけ計算し、向き・高さ・輪（同じ高さ）ごとの量は先に求める（見た目は同じ）
      const U = S.n, rr = S.rr, NS = segs.length, ringN = S.ringY.length;
      const sa = S.sa, act = S.act, rcx = S.rcx, rcz = S.rcz, rwy = S.rwy, rrf = S.rrf; act.fill(0);   // 作業用の配列は 1 回だけ作る（毎コマ作らない）
      for (let q = 0; q < NS; q++) { const a = segs[q][0], b = segs[q][1]; sa[q * 8] = b[1] - a[1]; sa[q * 8 + 1] = segs[q][2]; }
      for (let g = 0; g < ringN; g++) {
        const y = S.ringY[g];
        for (let q = 0; q < NS; q++) {
          const a = segs[q][0], b = segs[q][1], dy = sa[q * 8]; if (Math.abs(dy) < 0.02) continue; const tt = (y - a[1]) / dy; if (tt < -0.12 || tt > 1.12) continue;
          const k = g * NS + q; act[k] = 1; rcx[k] = a[0] + (b[0] - a[0]) * tt; rcz[k] = a[2] + (b[2] - a[2]) * tt;
          rwy[k] = sm((tt + 0.12) / 0.12) * sm((1.12 - tt) / 0.12); rrf[k] = sa[q * 8 + 1] * (0.7 + 1.0 * MV * sm(-y / 0.4));
        }
      }
      const uxA = S.ux, uzA = S.uz, ringA = S.ring, r0A = S.r0, lim = S.lim; for (let q = 0; q < NS; q++) lim[q] = sa[q * 8 + 1] * 2.8;
      for (let u = 0; u < U; u++) {
        const ux = uxA[u], uz = uzA[u], base = ringA[u] * NS; let r = r0A[u];
        for (let q = 0; q < NS; q++) {
          const k = base + q; if (act[k] === 0) continue;
          const cx = rcx[k], cz2 = rcz[k], lat = -cx * uz + cz2 * ux, a = lat < 0 ? -lat : lat, L = lim[q]; if (a >= L) continue;   // 横に遠い（重みが 0）ものは、半径が変わらない
          const wt = 1 - a / L, wl = wt >= 1 ? 1 : wt * wt * (3 - 2 * wt), tgt = cx * ux + cz2 * uz + rrf[k];
          if (tgt > r) r += (tgt - r) * rwy[k] * wl;
        }
        rr[u] = r;
      }
      const arr = skp.array, ids = S.id, n = skp.count, chg = S.chg, prev = S.prev;
      for (let u = 0; u < U; u++) { chg[u] = rr[u] !== prev[u] ? 1 : 0; prev[u] = rr[u]; }   // 前のコマと半径が同じ頂点は、位置も法線もそのまま（書き直さない。結果は同じ）
      for (let i = 0; i < n; i++) { const u = ids[i]; if (!chg[u]) continue; const r = rr[u]; arr[i * 3] = S.ux[u] * r; arr[i * 3 + 1] = S.y[u] + len / 2; arr[i * 3 + 2] = S.uz[u] * r / SKZ; }
      skp.needsUpdate = true;
      const nr = skg.attributes.normal.array;   // 三角形ごとの面の法線（computeVertexNormals と同じ向き・同じ式。非インデックスなので 1 頂点 = 1 面）
      for (let f = 0; f < n; f += 3) {
        if (!chg[ids[f]] && !chg[ids[f + 1]] && !chg[ids[f + 2]]) continue;
        const a = f * 3, b = a + 3, c = a + 6, cbx = arr[c] - arr[b], cby = arr[c + 1] - arr[b + 1], cbz = arr[c + 2] - arr[b + 2], abx = arr[a] - arr[b], aby = arr[a + 1] - arr[b + 1], abz = arr[a + 2] - arr[b + 2];
        let nx = cby * abz - cbz * aby, ny = cbz * abx - cbx * abz, nz = cbx * aby - cby * abx; const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1); nx *= l; ny *= l; nz *= l;
        nr[a] = nr[a + 3] = nr[a + 6] = nx; nr[a + 1] = nr[a + 4] = nr[a + 7] = ny; nr[a + 2] = nr[a + 5] = nr[a + 8] = nz;
      }
      skg.attributes.normal.needsUpdate = true;
      if (BAND) {   // v6：前の水色の線は、今の形の x で幅を決める（布が脚の前へ張り出しても、線が広がらない）。横を向いた面（脚のあいだの折り目）では、線をローブの色へ寄せる（白い三角に見えない。線は途切れない）
        const col = skg.attributes.color.array, NA = 0.45, NB = 0.4, NMIN = 2; let cc = false;
        for (let f = 0; f < n; f += 3) {
          { const p0 = f - (f % 6); let any = 0; for (let k = 0; k < 6; k++) any |= chg[ids[p0 + k]]; if (!any) continue; }   // 四角（2 枚の組）のどこかが動いたら塗り直す
          const q = f / 3, t = BAND.t[q], f0 = (q & ~1) * 3, cx = (arr[f0 * 3] + arr[f0 * 3 + 3] + arr[f0 * 3 + 6] + arr[f0 * 3 + 9] + arr[f0 * 3 + 12] + arr[f0 * 3 + 15]) / 6, nxq = (nr[f0 * 3] + nr[f0 * 3 + 9]) / 2;   // 四角ごと
          const g = t > 0.945 ? 8 : BAND.r[q] && Math.abs(cx) < BW * 1.6 ? Math.max(NMIN, Math.round(8 * (1 - MV * sm01((Math.abs(nxq) - NA) / NB)))) : 0;   // 8＝水色、0＝ローブの色
          if (g === BAND.g[q]) continue; BAND.g[q] = g; cc = true; const c = BAND.c[g];
          for (let k = 0; k < 3; k++) { col[(f + k) * 3] = c.r; col[(f + k) * 3 + 1] = c.g; col[(f + k) * 3 + 2] = c.b; }
        }
        if (cc) skg.attributes.color.needsUpdate = true;
      }
    }
    // v10（2026-10-27 ユーザー判断「6.8 がいちばん自然に見える」）：ローブは魔法使いの v6.8 と同じ作り（hero3d_wizard.js の deformSkirt3・initLower・脇の布。式・値は同じ）。以下、魔法使いの説明のまま
    // v6.6（canon。2026-10-27 ユーザー指摘「裾が動かず、ちょこちょこ走りになっている。前後のパーツにしてみたら」）：ローブの裾を、武闘家・ワルキューレと同じ「前後 2 枚」の動きに。
    // 筒は 1 枚のまま（前と後ろのあいだにすき間を作らない）、裾の上の端（腰）を軸に、前の半分を「いちばん前へ出た脚」、後ろの半分を「いちばん後ろへ出た脚」の角度（腰から足首への線）だけ回す。
    // 回す量の重み：真前・真後ろで 1、脇で 0（脇は動かない）。脚の付け根は真ん中から横にあるので、正面から WC rad の範囲は 1 のまま
    // v6.7（2026-10-27 ユーザー判断 a・僧侶とそろえる）：腰からひざまでは 1 枚の布のまま（前・後ろの半分を重みで曲げる）、ひざから下だけを前・後ろ・脇に分ける（スリットの入ったローブ）。
    // ひざの輪（立ちのひざの関節の高さに一番近い輪）より下の三角形を、向きで 前（正面から ±SLIT）・後ろ・脇 に分け、前は前の脚、後ろは後ろの脚の「股〜足首の線の角度」×KF／KB で、ひざの輪を軸に回す。脇は、ひざより上の曲がりのまま下ろす。
    // 三角形ごとに頂点が別なので、分かれ目がスリットになる。スリットの裏に、まっすぐ下がる細い脇の布（fillers）を足す（ユーザー「サイドにも布を増やせない？」）。前の金の線・裾の縁は三角形の色なので、板と一緒に動く
    function deformSkirt3(legs, run) {
      const S = SK2 || (SK2 = initSk2()), U = S.n, WC = 0.6, RC3 = 0.115, KF = 0.8, KB = 0.75;   // 前・後ろを回す量（股→足首の線の角度に対して。僧侶と同じ値。1.0 だと裾がつりがね形に開いた）
      if (!S.lowTri) initLower(S);
      const KP = run && KK ? (S.kp || (S.kp = initKick(S))) : null;
      let F = 0, B = 0; const caps = [], shins = [], KE = [], KG = 1, KW = 0.32;   // KG：蹴った脚の側の跳ね上げ（その脚の股〜足首の線まで。1.3 では横から裾が大きく広がった）。KW：跳ね上げる幅（脚の真ん中から。反対の脚の所でほぼ 0）
      for (const [sxs, th, kn, kn0] of legs) {
        const hx = (sxs < 0 ? -1 : 1) * CAN.C.legX, hy = -0.02, ky = hy - KN * Math.cos(th), kz = -KN * Math.sin(th), a2 = th + kn, ay = ky - (SH + 0.02) * Math.cos(a2), az = kz - (SH + 0.02) * Math.sin(a2);
        const ang = b => -Math.atan2(kz - (SH + 0.02) * Math.sin(th + b), hy - (ky - (SH + 0.02) * Math.cos(th + b))), q = ang(kn0);   // 股から足首への線の角度（+ は後ろ）。2026-10-28：走りの蹴り上げ（KICK）の分は、下の KE（蹴った脚の側だけ）で入れる
        if (kn > kn0) KE.push([hx, ang(kn) * KB * KG]);   // 蹴った脚の側の、後ろの裾の跳ね上げの角度（2026-10-28 ユーザー「ローブを跳ね上げて足の裏が見えるように」）
        F = Math.min(F, q * KF); B = Math.max(B, q * KB);
        shins.push([hx, ky, kz, hx, ay, az]); caps.push([hx, hy, 0, hx, ky, kz, RC3]); caps.push([hx, ky, kz, hx, ay, az, 0.12]);   // もも（ひざより上の布は、この中に入った点を外へ押し出す）
      }
      const B0 = B; for (const e of KE) { e[1] = Math.max(0, e[1] - B0); B = Math.max(B, B0 + e[1]); }   // 後ろの裾：ふだんは B0（両脚の股〜足首の線のうち後ろのほう）。蹴った脚の側だけ、その脚の線まで跳ね上げる（全体を一枚の板で持ち上げない。脇へなだらかに戻る）
      const Bx = x => { let q = B0; for (const [hx, e] of KE) { const d = 1 - Math.abs(x - hx) / KW; if (d > 0) q += e * d * d * (3 - 2 * d); } return q; };
      const LIFT = Math.max(0, baseY - body.position.y), LS = 1 - LIFT / len;   // v6.8（2026-10-27 ユーザー指摘「脚を開いたとき、脇の裾が地面に触れている」）：歩き・走りで体が沈んだ分だけ、裾を腰から下へ縮めて持ち上げる（裾の下の端が立ちの高さより下がらない。前後の曲げとふくらみはそのまま）
      for (const m of fillers) m.scale.y = LS;
      for (const m of fillers) {   // v10.8：巻き込みの布（v10.7）に重ねて、もう一度入れた（ひざのすぐ下で、脇の布より外に出た長靴が、板の分かれ目から茶色の点・1 ドットの縦線に見えた＝別の目のレビュー 2 回目）。v10.5：脇の布を、すね（長靴）の筒の外へ押し出す。ひざより下の板は形を変えずに回るだけなので、後ろへ振った脚の長靴が板の分かれ目から外へ出て、横・斜め後ろから 1 ドットの茶色の線に見えた（窓口の判断）。脇の布が長靴の外にあれば、分かれ目の奥は布の色になる
        const g = m.geometry, pa = g.attributes.position, o = g.userData.o || (g.userData.o = Float32Array.from(pa.array)), RB = 0.12, M = 0.03, yK0 = o[1], csh = Math.cos(m.userData.back ? B : F) * 0.85; let ch = false;
        for (let i = 0; i < pa.count; i++) {
          let px = o[i * 3], py = (yK0 + (o[i * 3 + 1] - yK0) * csh) * LS, pz = o[i * 3 + 2];
          const hl = Math.hypot(px, pz) || 1, nx = px / hl, nz = pz / hl;   // 押し出す向き：体の真ん中から外へ（布はすねの軸より内がわにあることが多いので、すねから離す向きだと体の中へ入ってしまう）
          for (const [a0, a1, a2, b0, b1, b2] of shins) for (let it = 0; it < 4; it++) {
            const abx = b0 - a0, aby = b1 - a1, abz = b2 - a2, l2 = abx * abx + aby * aby + abz * abz, tt = Math.max(0, Math.min(1, ((px - a0) * abx + (py - a1) * aby + (pz - a2) * abz) / l2));
            const dx = px - (a0 + abx * tt), dy = py - (a1 + aby * tt), dz = pz - (a2 + abz * tt), dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dl >= RB + M) break; const d2 = dl > RB - M ? dl + (RB + M - dl) * (RB + M - dl) / (4 * M) : RB; px += nx * (d2 - dl); pz += nz * (d2 - dl);   // なめらかに（境目で折れない）
          }
          const ny = py / LS; if (pa.array[i * 3] !== px || pa.array[i * 3 + 1] !== ny || pa.array[i * 3 + 2] !== pz) { pa.array[i * 3] = px; pa.array[i * 3 + 1] = ny; pa.array[i * 3 + 2] = pz; ch = true; }
        }
        if (ch) { pa.needsUpdate = true; g.computeVertexNormals(); }
      }
      const key = F + ',' + B + ',' + KE.join() + ',' + LIFT.toFixed(5) + ',' + caps.map(c => c[4].toFixed(4) + c[5].toFixed(4)).join() + shins.map(c => c[4].toFixed(4) + c[5].toFixed(4)).join();
      if (S.k3 === key) return; S.k3 = key;
      const sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      const ox = S.ox3 || (S.ox3 = new Float64Array(U)), oy = S.oy3 || (S.oy3 = new Float64Array(U)), oz = S.oz3 || (S.oz3 = new Float64Array(U)), qa = S.qa3 || (S.qa3 = new Float64Array(U));
      for (let u = 0; u < U; u++) {   // ひざより上（とひざの輪）：1 枚の筒を、前・後ろの半分で曲げる
        const r = S.r0[u], x = S.ux[u] * r, z = S.uz[u] * r, y = S.y[u] * LS, ang = Math.acos(Math.max(-1, Math.min(1, Math.abs(S.uz[u]))));
        const w = sm(1 - Math.max(0, ang - WC) / (Math.PI / 2 - WC)), front = S.uz[u] > 0, q = (front ? F : KE.length ? Bx(x) : B) * w, c = Math.cos(q), sn = Math.sin(q);
        let px = x, py = y * c - z * sn, pz = y * sn + z * c;
        if (S.y[u] >= S.yK - 1e-6) for (const [a0, a1, a2, b0, b1, b2, R] of caps) {
          const abx = b0 - a0, aby = b1 - a1, abz = b2 - a2, l2 = abx * abx + aby * aby + abz * abz, tt = Math.max(0, Math.min(1, ((px - a0) * abx + (py - a1) * aby + (pz - a2) * abz) / l2));
          const dx = px - (a0 + abx * tt), dy = py - (a1 + aby * tt), dz = pz - (a2 + abz * tt), dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const M = 0.04; if (dl < R + M && dl > 1e-5) { const d2 = dl > R - M ? dl + (R + M - dl) * (R + M - dl) / (4 * M) : R, k = (d2 - dl) / dl; px += dx * k; py += dy * k; pz += dz * k; }   // 境目で折れないよう、なめらかに押し出す
        }
        ox[u] = px; oy[u] = py; oz[u] = pz; qa[u] = q;
      }
      const arr = skp.array, ids = S.id, n = skp.count, low = S.lowTri, reg = S.regTri, kv = S.kneeOf;
      for (let i = 0; i < n; i++) {
        const u = ids[i], t = (i / 3) | 0;
        if (!low[t]) { arr[i * 3] = ox[u]; arr[i * 3 + 1] = oy[u] + len / 2; arr[i * 3 + 2] = oz[u] / SKZ; continue; }
        const k = kv[u], q = reg[t] === 1 ? F : reg[t] === 2 ? (KE.length ? Bx(S.ux[u] * S.r0[u]) : B) : qa[k], c = Math.cos(q), sn = Math.sin(q);   // ひざの輪の点から下を、その板の角度で回す（ひざのつなぎ目に段を作らない）
        const dx = S.ux[u] * S.r0[u] - S.ux[k] * S.r0[k], dy = (S.y[u] - S.y[k]) * LS, dz = S.uz[u] * S.r0[u] - S.uz[k] * S.r0[k];
        let px = ox[k] + dx, py = oy[k] + dy * c - dz * sn, pz = oz[k] + dy * sn + dz * c;
        if (reg[t] && u !== k) for (const [a0, a1, a2, b0, b1, b2] of shins) { const RB = 0.12, M = 0.03;   /* v10.10（魔法使い v7.7 と同じ）：ひざの輪の点は押さない（上の押し出しの位置を下の板も使う。2 回押すと、つなぎ目にすき間ができた） */
          const abx = b0 - a0, aby = b1 - a1, abz = b2 - a2, l2 = abx * abx + aby * aby + abz * abz, tt = Math.max(0, Math.min(1, ((px - a0) * abx + (py - a1) * aby + (pz - a2) * abz) / l2));
          const ddx = px - (a0 + abx * tt), ddy = py - (a1 + aby * tt), ddz = pz - (a2 + abz * tt), dl = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
          if (dl < RB + M) { const d2 = dl > RB - M ? dl + (RB + M - dl) * (RB + M - dl) / (4 * M) : RB, hl = Math.hypot(px, pz) || 1; px += px / hl * (d2 - dl); pz += pz / hl * (d2 - dl); } }   // v10.9（魔法使い v7.6 と同じ）：前・後ろの板を、すね（長靴）の筒（半径 0.12）の外へ押し出す。板は回るだけなので、後ろへ振った脚の長靴が裾の手前に出たように見え、後ろが門（ズボン）の形になった（別の目のレビュー 2・窓口の判断 案 A）。押す向きは体の真ん中から外へ
        arr[i * 3] = px; arr[i * 3 + 1] = py + len / 2; arr[i * 3 + 2] = pz / SKZ;
        if (KP && reg[t] === 2 && u !== k) { const j = KP.of[u]; KP.P[j * 3] = px; KP.P[j * 3 + 1] = py; KP.P[j * 3 + 2] = pz; KP.q[j] = q; }
      }
      if (KP) {   // 2026-10-28（ユーザー指示「ローブの人も蹴り上げを」）：ローブの後ろ半分（ひざより上と、ひざより下の後ろの板）を、蹴り上げたすね・足に当たる所だけ、布の外向きに押し出す（かかとがお尻の高さまで上がり、後ろの面を内から外へ抜けた）。板全体は持ち上げない。走りで蹴り上げる人（KICK）だけ
        for (const j of KP.up) { const u = KP.us[j]; KP.P[j * 3] = ox[u]; KP.P[j * 3 + 1] = oy[u]; KP.P[j * 3 + 2] = oz[u]; KP.q[j] = qa[u]; }
        for (let j = 0; j < KP.n; j++) { const u = KP.us[j], q = KP.q[j], dx = S.ux[u], dy = -S.uz[u] * Math.sin(q), dz = S.uz[u] * Math.cos(q), l = Math.hypot(dx, dy, dz) || 1; KP.D[j * 3] = dx / l; KP.D[j * 3 + 1] = dy / l; KP.D[j * 3 + 2] = dz / l; }
        CAN.kickPush(T, skirt, parts, KP.P, KP.D, KP.nb, KP.off);
        for (let i = 0; i < n; i++) { const t = (i / 3) | 0, u = ids[i], j = KP.of[!low[t] || reg[t] === 2 ? u : kv[u]]; if (j < 0) continue; const o = KP.off[j]; if (!o) continue;   // ひざより下の脇の板は、ひざの輪の点と一緒に動かす（つなぎ目にすき間を作らない）
          arr[i * 3] += KP.D[j * 3] * o; arr[i * 3 + 1] += KP.D[j * 3 + 1] * o; arr[i * 3 + 2] += KP.D[j * 3 + 2] * o / SKZ; }
        for (const j of KP.up) { const u = KP.us[j], o = KP.off[j]; ox[u] += KP.D[j * 3] * o; oy[u] += KP.D[j * 3 + 1] * o; oz[u] += KP.D[j * 3 + 2] * o; }   // 巻き込みの布の上の端（ひざの輪の点）も合わせる
      }
      skp.needsUpdate = true;
      for (const m of flaps) {   // 巻き込みの布：外の縁＝板の端（ひざの輪の点から裾まで）、内の縁＝同じ高さで、真ん中へ半径の WRAP 倍だけ寄せた点
        const E = S.edge[m.userData.rg + '' + m.userData.sg], ku = S.kneeOf[S.id[E[0]]], g = m.geometry; let pa = g.attributes.position;
        if (!pa) { pa = new T.Float32BufferAttribute(new Float32Array((E.length + 1) * 6), 3); g.setAttribute('position', pa); const idx = []; for (let j = 0; j < E.length; j++) { const a = j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } g.setIndex(idx); }
        const pp = pa.array; for (let j = 0; j <= E.length; j++) { const i = E[j - 1], x = j ? arr[i * 3] : ox[ku], y = j ? arr[i * 3 + 1] : oy[ku] + len / 2, z = j ? arr[i * 3 + 2] : oz[ku] / SKZ; const D = WRAP; pp.set([x, y, z, x * (1 - D), y, z * (1 - D)], j * 6); }
        pa.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
      }
      const nr = skg.attributes.normal.array, vn = S.vn3 || (S.vn3 = new Float64Array(U * 3)); vn.fill(0);   // 面の向き：ひざより上は同じ位置の点ごとに平均（格子模様にちらつかない）、ひざより下は板ごとの面の向き
      for (let f = 0; f < n; f += 3) {
        const a = f * 3, b = a + 3, c = a + 6, cbx = arr[c] - arr[b], cby = arr[c + 1] - arr[b + 1], cbz = arr[c + 2] - arr[b + 2], abx = arr[a] - arr[b], aby = arr[a + 1] - arr[b + 1], abz = arr[a + 2] - arr[b + 2];
        const nx = cby * abz - cbz * aby, ny = cbz * abx - cbx * abz, nz = cbx * aby - cby * abx;
        if (low[f / 3]) { const l = 1 / (Math.hypot(nx, ny, nz) || 1); for (let k = 0; k < 3; k++) { nr[a + k * 3] = nx * l; nr[a + k * 3 + 1] = ny * l; nr[a + k * 3 + 2] = nz * l; } continue; }
        for (let k = 0; k < 3; k++) { const u = ids[f + k] * 3; vn[u] += nx; vn[u + 1] += ny; vn[u + 2] += nz; }
      }
      for (let i = 0; i < n; i++) { if (low[(i / 3) | 0]) continue; const u = ids[i] * 3, l = 1 / (Math.hypot(vn[u], vn[u + 1], vn[u + 2]) || 1); nr[i * 3] = vn[u] * l; nr[i * 3 + 1] = vn[u + 1] * l; nr[i * 3 + 2] = vn[u + 2] * l; }
      skg.attributes.normal.needsUpdate = true; skg.computeBoundingSphere();
    }
    function initKick(S) {   // kickPush で押す点：ローブの後ろ半分のひざより上（ひざの輪を含む）と、ひざより下の後ろの板。となりの点（輪の上下・円周の左右）も 1 回だけ求める
      const T3 = skp.count / 3, of = new Int32Array(S.n).fill(-1), us = [], up = [];
      for (let u = 0; u < S.n; u++) if (S.y[u] >= S.yK - 1e-6 && S.uz[u] < 0.2) { of[u] = us.length; up.push(us.length); us.push(u); }
      for (let t = 0; t < T3; t++) if (S.lowTri[t] && S.regTri[t] === 2) for (let k = 0; k < 3; k++) { const u = S.id[t * 3 + k]; if (of[u] < 0) { of[u] = us.length; us.push(u); } }
      const rk = new Map([...new Set(us.map(u => S.y[u]))].sort((a, b) => b - a).map((y, i) => [y, i])), sg = u => ((Math.round(Math.atan2(S.ux[u], S.uz[u]) / (2 * Math.PI / SK_SEG)) % SK_SEG) + SK_SEG) % SK_SEG, at = new Map();
      for (let j = 0; j < us.length; j++) at.set(rk.get(S.y[us[j]]) * 1000 + sg(us[j]), j);
      const n = us.length, nb = new Int32Array(n * 4);
      for (let j = 0; j < n; j++) { const r = rk.get(S.y[us[j]]), g = sg(us[j]); [[r - 1, g], [r + 1, g], [r, (g + 1) % SK_SEG], [r, (g + SK_SEG - 1) % SK_SEG]].forEach(([a, b], q) => { const x = at.get(a * 1000 + b); nb[j * 4 + q] = x == null ? -1 : x; }); }
      return { n, us, up, of, nb, P: new Float64Array(n * 3), D: new Float64Array(n * 3), q: new Float64Array(n), off: new Float64Array(n) };
    }
    function initLower(S) {   // ひざの輪・各点の列のひざの点・三角形ごとの「ひざより下か」と向き（1 前・2 後ろ・0 脇）を、1 回だけ求める
      const yK0 = -0.02 - KN; let g = 0; for (let i = 1; i < S.ringY.length; i++) if (Math.abs(S.ringY[i] - yK0) < Math.abs(S.ringY[g] - yK0)) g = i;
      S.yK = S.ringY[g];
      const col = new Map(), ck = u => Math.round(Math.atan2(S.ux[u], S.uz[u]) * 1e5);
      for (let u = 0; u < S.n; u++) if (S.y[u] === S.yK) col.set(ck(u), u);
      S.kneeOf = new Uint32Array(S.n); for (let u = 0; u < S.n; u++) S.kneeOf[u] = col.get(ck(u)) ?? u;
      const T3 = skp.count / 3; S.lowTri = new Uint8Array(T3); S.regTri = new Uint8Array(T3);
      for (let t = 0; t < T3; t++) {
        let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { const i = t * 3 + k; cx += sk0[i * 3]; cy += sk0[i * 3 + 1] - len / 2; cz += sk0[i * 3 + 2]; }
        if (cy / 3 >= S.yK) continue; S.lowTri[t] = 1;
        const th = Math.abs(Math.atan2(cx, cz * SKZ)); S.regTri[t] = th < SLIT ? 1 : th > Math.PI - SLIT ? 2 : 0;
      }
      const ed = { '1-1': new Map(), '11': new Map(), '2-1': new Map(), '21': new Map() };   // v10.7：前・後ろの板の左右の端の点（輪ごとに、正面・真後ろからいちばん離れた点）。巻き込みの布の外の縁
      for (let t = 0; t < T3; t++) if (S.lowTri[t] && S.regTri[t]) for (let k = 0; k < 3; k++) { const rg = S.regTri[t], i = t * 3 + k, u = S.id[i], th = Math.atan2(S.ux[u], S.uz[u]), mp = ed[rg + '' + (th < 0 ? -1 : 1)], g = S.ring[u], cur = mp.get(g), sc = rg === 1 ? Math.abs(th) : -Math.abs(th); if (!cur || sc > cur[1]) mp.set(g, [i, sc]); }
      S.edge = {}; for (const k in ed) S.edge[k] = [...ed[k].entries()].sort((p, q) => S.ringY[q[0]] - S.ringY[p[0]]).map(e => e[1][0]);   // ひざから裾へ
    }
    let SK2 = null;
    function initSk2() {   // 同じ位置の頂点をまとめ、向き（ux, uz）・高さ・元の半径を、1 回だけ求める
      const map = new Map(), id = new Uint32Array(skp.count), ux = [], uz = [], yy = [], r0a = [], ringOf = [], ringMap = new Map(), ringY = [];
      for (let i = 0; i < skp.count; i++) {
        const bx = sk0[i * 3], by = sk0[i * 3 + 1], bz = sk0[i * 3 + 2], key = bx + ',' + by + ',' + bz; let u = map.get(key);
        if (u === undefined) { u = ux.length; map.set(key, u); const z0 = bz * SKZ, r0 = Math.hypot(bx, z0) || 1; ux.push(bx / r0); uz.push(z0 / r0); const yv = by - len / 2; yy.push(yv); r0a.push(r0); let g = ringMap.get(yv); if (g === undefined) { g = ringY.length; ringMap.set(yv, g); ringY.push(yv); } ringOf.push(g); }
        id[i] = u;
      }
      return { n: ux.length, id, ux: Float64Array.from(ux), uz: Float64Array.from(uz), y: Float64Array.from(yy), r0: Float64Array.from(r0a), ring: Uint16Array.from(ringOf), ringY, rr: new Float64Array(ux.length), chg: new Uint8Array(ux.length), lim: new Float64Array(4), sa: new Float64Array(32), act: new Uint8Array(ringY.length * 4), rcx: new Float64Array(ringY.length * 4), rcz: new Float64Array(ringY.length * 4), rwy: new Float64Array(ringY.length * 4), rrf: new Float64Array(ringY.length * 4), prev: new Float64Array(ux.length).fill(NaN) };
    }
    parts.deformSkirt = deformSkirt;
    // 胴：青いローブ、前に水色の帯、水色の襟
    const torso = parts.torso = pivot(0, 0, 0, body);
    ell(CAN ? 0.27 : 0.245, 0.2, CAN ? 0.40 : 0.46, 18, 1, 0.66, PAL.robe, 0, CAN ? 0.20 : 0.23, 0, torso);
    sph(0.15, 1.15, 0.7, 0.75, PAL.robe, 0, 0.35, 0.02, torso, 12, 8);
    if (CAN) CAN.shoulderCone(T, torso, mat(PAL.robe), { yS: CAN.C.shY, Q });   // v10.7 なで肩（2026-10-27 ユーザー「僧侶も同様に肩がなだらかじゃないところが気になる」）：首の付け根（0.49）から肩（0.35）へ下がる円すい台。v6 の肩のつなぎ（平たい楕円 上端 0.51）は、首の付け根と同じ高さで外まで平らに続き、怒り肩に見えた   // v6：肩のつなぎ＝胴の上の端から肩の関節（共通の shY 0.46）までをおおう平たい楕円（ユーザー指摘「体と腕のジョイントがおかしい」：袖の山が胴から離れた箱に見え、わきの下に段があった）。胴の上の半径も 0.245→0.27
    if (!CAN) box(0.09, 0.46, 0.02, PAL.gold, 0, 0.22, 0.156, torso);                                   // 前の水色の帯
    else { const bd = box(0.09, 0.47, 0.02, PAL.gold, 0, 0.225, 0.158, torso); bd.rotation.x = Math.atan(0.66 * 0.07 / 0.46); }   // v6：胴の上の半径を 0.27 にしたので、帯も胴の前の面に沿わせて上を前へ傾ける（胸の上で帯が胴に隠れて切れ込みにならない）
    if (!CAN) ell(0.15, 0.2, 0.05, 14, 1, 0.8, PAL.gold, 0, 0.45, 0, torso);                           // 襟の水色
    else for (const CLA of [PS.trim && PS.collar ? PS.collar : 0.4]) for (const [t0, tl, c] of [[-CLA * Math.PI, 2 * CLA * Math.PI, PAL.gold], [CLA * Math.PI, (2 - 2 * CLA) * Math.PI, PAL.robe]]) { const m = new T.Mesh(new T.CylinderGeometry(0.16, 0.2, 0.05, Math.round(14 * Q), 1, false, t0, tl), mat(c)); m.position.set(0, 0.47, 0); m.scale.set(1, 1, 0.82); m.rotation.x = 0.25;   /* 2026-11-02 ユーザー判断「僧侶は案1」：襟は低いまま、半径を絞って（0.17・0.25 → 0.16・0.20）前へ 0.25 rad 傾ける（横から見て、水平の輪が首のうしろで服より外へ棚のように出て、服との一体感がなかった） */   /* 襟は胴（上の半径 0.27）と肩のつなぎより外へ出す（僧侶の目印。窓口の指摘） */ torso.add(m); }   // v6：襟の水色は前だけ（±72°）。うしろはローブの色（髪の下の端と襟のあいだに、水色が白い点に見えない。窓口の指摘）
    // 腕：広いそでと水色のそでぐち、素手
    for (const sx of [-1, 1]) {
      const arm = parts[sx < 0 ? 'armR' : 'armL'] = pivot(sx * (CAN ? CAN.C.shX : 0.275), CAN ? CAN.C.shY : 0.38, 0, torso);
      if (!CAN) sph(0.085, 1, 0.9, 1, PAL.robe, 0, 0, 0, arm, 10, 7);   // 肩の丸（canon は付けない。2026-10-29 ユーザー判断：腕の上を武闘家と同じ作りに＝肩の丸なし・袖は関節から・袖の上の端の外側を 0.07 下げる。前の v10.7 は袖を 0.12 下げていて、腕と胴の接点が細かった）
      { const sl = ell(0.085, 0.075, (CAN ? CAN.C.UA : 0.3 + AX / 2) + 0.02, 12, 1, 1, PAL.robe, 0, -((CAN ? CAN.C.UA : 0.3 + AX / 2)) / 2, 0, arm);
        if (CAN) { const pa = sl.geometry.attributes.position; let yt = -Infinity, r = 0; for (let i = 0; i < pa.count; i++) { yt = Math.max(yt, pa.getY(i)); r = Math.max(r, Math.abs(pa.getX(i))); } for (let i = 0; i < pa.count; i++) if (pa.getY(i) > yt - 1e-4) pa.setY(i, pa.getY(i) - 0.07 * Math.max(0, Math.min(1, (sx * pa.getX(i) + r) / (2 * r)))); pa.needsUpdate = true; sl.geometry.computeVertexNormals(); } }   // 袖の上の端の外側を 0.07 下げる（武闘家の slope と同じ。腕を 0.26 開くぶん外側の角が上へ出て怒り肩に見えない）
      const fore = parts[sx < 0 ? 'foreR' : 'foreL'] = pivot(0, -(CAN ? CAN.C.UA : 0.3 + AX / 2), 0, arm);
      sph(0.07, 1, 1, 1, PAL.robe, 0, 0, 0, fore, 10, 7);
      ell(0.075, 0.1, 0.2 + FA, 14, 1, 1, PAL.robe, 0, -0.1 - FA / 2, 0, fore);
      cyl(0.103, 0.103, 0.04, 14, PAL.gold, 0, -0.21 - FA, 0, fore);                                 // そでぐちの水色
      sph(CAN ? CAN.C.HAND : 0.065, 1, 1.05, 1, CAN ? new T.Color(COL.face).multiplyScalar(CAN.C.SKINK).getHex() : COL.face, 0, -0.26 - FA, 0.01, fore, 10, 8);   /* 素手は顔より暗く見えるので C.SKINK で明るく（共通の決まり。2026-10-29 ユーザー「少し明るくするを共通ルールに」） */                           // 手
    }
    // 頭：戦士と同じ顔（角を丸めた箱の 1 曲面）
    const HSC = CAN ? CAN.C.HS : sh.head * 0.81, NK = CAN ? 0 : 0.015;   // 頭は 1 まわり小さく、首が見えるように頭を上へ（2026-10-26 ユーザー指摘）
    const head = parts.head = pivot(0, CAN ? CAN.C.headY : 0.485 + NK, 0, torso); head.scale.setScalar(HSC);
    const HF = (CAN && P3('HAIR')) || {}, HK = (CAN && P3('HAT') || {}).k || 1;   // HF.cyl：頭の上半分を筒（うしろ髪は上半分をまっすぐ帽子の中へ・前髪なし＝帽子に隠れる）。HK：帽子と水色のふちの横・前後の倍率（高さは同じ。頭の断面より大きく）
    if (CAN) CAN.buildHead(T, head, { mat, COL, Q, female: false, eyeW: 0.044, face: Object.assign({}, CAN.FACEM, P3('FACE')) });
    // （この直しは共通の buildHead に移した。2026-10-29）v10.6：共通の首の円柱（buildHead）の上の端を、顔の箱の中まで 0.04 のばす（上のふたのふちが、あごの下で明るい点に出た。魔法使い v7.4・エルフ・ワルキューレと同じ）
    else {
    const FW = 0.4, FH = 0.31, FD = 0.34, FR = 0.06, FZ = 0.02, FY = 0.205;
    { const fg = new T.BoxGeometry(FW, FH, FD, 8, 8, 8), fa = fg.attributes.position, v = new T.Vector3(), c = new T.Vector3(), cl = (x, h) => Math.max(-h, Math.min(h, x));
      for (let i = 0; i < fa.count; i++) { v.fromBufferAttribute(fa, i); c.set(cl(v.x, FW / 2 - FR), cl(v.y, FH / 2 - FR), cl(v.z, FD / 2 - FR)); v.sub(c).normalize().multiplyScalar(FR).add(c); fa.setXYZ(i, v.x, v.y, v.z); }
      fg.computeVertexNormals(); add(new T.Mesh(fg, mat(COL.face)), 0, FY, FZ, head); }
    cyl(0.07, 0.085, 0.1 + NK / HSC, 10, COL.neck, 0, -0.035 - NK / (2 * HSC), 0, head);
    { const zf = FZ + FD / 2 + 0.002;
      for (const sx of [-1, 1]) { box(0.06, 0.1, 0.02, PAL.eye, sx * 0.1, 0.25, zf, head); box(0.064, 0.022, 0.022, 0x1a1216, sx * 0.1, 0.3, zf + 0.001, head); box(0.02, 0.022, 0.024, 0xffffff, sx * 0.1 + 0.012, 0.268, zf + 0.002, head); }
      box(0.03, 0.036, 0.03, PAL.nose, 0, 0.19, zf, head);
      box(0.055, 0.013, 0.02, PAL.mouth, 0, 0.135, zf, head); }
    }
    // 髪：茶色の短い髪（前髪・横・うしろ）と、青い丸い帽子
    const cylUp = (g, Rg, top) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = Math.hypot(x, z); if (y <= 0 || h < 1e-6) continue; p.setX(i, x * Rg / h); p.setZ(i, z * Rg / h); p.setY(i, Math.min(y, top)); } };   // 球の上半分を、赤道の太さのまま、まっすぐ帽子の中（top）まで立ち上げる（頭の上半分を筒に。2026-10-29 かぶりものの決まり）
    if (!CAN) sph(0.215, 1.0, 0.92, 1.0, PAL.hair, 0, 0.28, -0.08, head, 16, 10);
    if (!HF.cyl) for (const [x, w, h] of [[-0.12, 0.09, 0.08], [-0.04, 0.07, 0.06], [0.05, 0.08, 0.07], [0.13, 0.08, 0.085]]) box(w, h, 0.045, PAL.hair, x, 0.335 - h / 2 + 0.02, 0.165, head);   // 前髪
    for (const sx of [-1, 1]) { ell(0.045, 0.035, 0.22, 8, 1, 1.3, PAL.hair, sx * 0.215, 0.22, 0.05, head);  }
    if (CAN) { const SXA = 0.08, SXB = 0.06, YS = -0.15;   /* v6：毛の流れの筋（立体の房・面に塗った筋）はやめた。背面で黒い点・文字（「EIMN」）や顔の模様に見えた（窓口の意見） */   /* v6：うしろ髪は、首のうしろ（|x| < 0.08）だけ首の下まで下ろし、横（|x| > 0.14）はあごの高さで切る。正面であごの下に髪が出ない（ひげに見えない）・うしろから首が見えない・首のうしろに房（しっぽ）を下げない */ const hb = new T.Mesh((() => { const g = new T.SphereGeometry(0.245, 28, 14, Math.PI * 0.86, Math.PI * 1.28, 0, Math.PI), pa = g.attributes.position, smz = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); for (let i = 0; i < pa.count; i++) { const wf = smz((pa.getZ(i) + 0.02) / 0.1), ws = smz((Math.abs(pa.getX(i)) - SXA) / SXB), ymin = Math.max(-1 + wf * (-0.095 + 1), -1 + ws * (YS + 1)); if (pa.getY(i) < ymin) pa.setY(i, ymin); } if (HF.cyl) cylUp(g, 0.245, (0.44 - 0.2) / 1.12); g.computeVertexNormals(); return g; })(), mat(PAL.hair)); hb.material.side = T.FrontSide;   /* v5.5：髪の殻の下は、前（あごの下）だけ切る。うしろ・斜めうしろは首の下まで残す */ hb.position.set(0, 0.2, -0.03); hb.scale.set(1.0, 1.12, 1.0); head.add(hb); { const hi = new T.Mesh(hb.geometry, mat(PS.trim && PS.collar ? PS.trim : PAL.robeD)); hi.material.side = T.BackSide; hi.position.copy(hb.position); hi.scale.copy(hb.scale); head.add(hi); }   /* v10.6：殻の内がわはローブの濃い色（襟に見せる。魔法使い v7.3 と同じ直し方）。v6 の首の陰の色 0xb07a5a でも、正面で、あごの下に顔の幅いっぱいの茶色の帯が出て、ひげに見えた（窓口の指摘） */    // 毛の流れ：明るい茶の房（数本）。   // 共通の決まり（案 v4）：うしろ髪は、頭のうしろ半分をおおう 1 つの丸い面（横じまの陰・桶に見えない。横から、顔の前半分の頬が見える）
      { const cr = sph(0.215, 1.0, 0.8, 1.0, PAL.hair, 0, 0.3, -0.05, head, 16, 10); if (HF.cyl) { cylUp(cr.geometry, 0.215, (0.44 - 0.3) / 0.8); cr.geometry.computeVertexNormals(); } } } else ell(0.19, 0.16, 0.2, 14, 1, 0.5, PAL.hair, 0, 0.14, -0.19, head);   // 共通の決まり（案 v3）：後ろ髪を丸く（板・箱に見えない）。うしろの下は、共通の頭の髪（耳のうしろ・あごのうしろ・首のうしろ）がおおう
    if (CAN && PS.beret) { const [rx, ry, rz, yc, zc] = PS.beret; const bd = new T.Mesh(new T.CylinderGeometry(0.25 * HK, 0.25 * HK, yc - 0.335, 20), mat(PAL.cap)); bd.position.set(0, (0.335 + yc) / 2, -0.03); head.add(bd); const pf = new T.Mesh(new T.SphereGeometry(1, 24, 12), mat(PAL.cap)); pf.scale.set(rx, ry, rz); pf.position.set(0, yc, zc); head.add(pf); }   /* ベレー帽（2026-11-02）：ふちから上は短い筒、その上に横・うしろへふくらむ平たい楕円体 */
    else if (CAN) { const cp = new T.Mesh(new T.SphereGeometry(0.25, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(PAL.cap)); cp.scale.set(HK, 1.14, HK); cp.position.set(0, 0.335, -0.03); head.add(cp); } else sph(0.25, 1.0, 0.62, 1.0, PAL.cap, 0, 0.38, -0.03, head, 16, 8);   /* v5.1：canon は半球（ふちの下に、帽子の青い面が出ない） */                        // 青い丸い帽子
    ell(CAN ? 0.253 * HK : 0.245, CAN ? 0.253 * HK : 0.245, 0.03, 16, 1, 1.0, PS.capRim || PAL.gold, 0, CAN ? 0.335 : 0.375, -0.03, head);   // 帽子の水色のふち（案 v4：ふちが帽子の面の中に入って、白い点がちらつかないよう、外へ）                    // 帽子の水色のふち
    // 杖：−x がわの手（R＝キャラ自身の右。画面では左）に持つ。灰色の頭。手の位置は、立ちの形から決める
    const staff = parts.staff = pivot(0, 0, 0, torso);

    // 動き：戦士と同じ（腰・膝・肩・ひじ）。ローブは、脚が前に出るとき前へ広がる。髪は走ると後ろへなびく
    // 2026-10-27 試走の指摘（No.2・4）「走っているときだけ、後ろから見ると足が動いているように見えない」：走りの遊脚の膝を深く曲げて、かかとを後ろへ大きく跳ね上げる（0.5 → RUNKICK）。深く曲げるのは、ももが後ろにある間だけ（前へ振り出すときに深く曲げると、ひざがローブの前を突き抜ける）。歩きは今のまま
    const RUNKICK = 1.6;
    let ampS = null, skirtMoved = true; const KK = CAN && CAN.KICK.priest;   // KK：走りの蹴り上げ（hero3d_canon.js。裾は deformSkirt3 が脚に合わせて持ち上げ・押し出す）
    function pose(mode, t, o) {
      const run = mode === 'run', walk = mode === 'walk', moving = run || walk;
      const RK = 1;   // 歩幅・脚の速さはほかの人と同じ（v6 の判断 D の 0.72 はやめた。v9 の筒の前後曲げでテントが出ない）   // v6（窓口の判断 D・ローブの人の決まり）：走りは歩幅を 0.72 倍・脚の回転を 1/0.72 倍（1 巡りで脚は 1/0.72 回まわり、1 回に進む距離は 0.72 倍。0.7 だと裾の角 R14 が 1 増える。足の振り幅はその距離に合わせるので、足は滑らない）。大股で裾が三角の扇・テントに見えないように
      const f = run ? 1.55 : 1.05, ph = t * Math.PI * 2 * f / RK, s = Math.sin(ph), c = Math.cos(ph);
      let A = (run ? 0.75 : 0.5) * RK;
      if (moving && o && o.stride > 0) { const want = Math.asin(Math.min(1, o.stride * RK / (4 * (0.74 + LX) * (run ? 0.95 : 0.97)) * (run ? 0.65 : 1))); const tgt = Math.min((run ? 0.9 : 0.45) * RK, Math.max((run ? 0.45 : 0.2) * RK, want)); ampS = ampS == null ? tgt : ampS + (tgt - ampS) * 0.15; A = ampS; }
      const armA = run ? 0.95 : 0.5;
      const knee = sg => { if (!moving) return 0.02;   /* 共通の決まり（案 v3）：ローブの人は、かかとを高く蹴り上げない（裾が脚を包めるように） */ const cs = sg * c, ss = sg * s, swing = Math.max(0, -cs), load = Math.max(0, cs) * Math.max(0, -ss); return CAN ? (run ? (0.5 + (RUNKICK - 0.5) * Math.sqrt(Math.max(0, ss))) * Math.pow(swing, 0.8) + 0.25 * load : 0.45 * Math.pow(swing, 0.9) + 0.1 * load) : run ? 1.9 * Math.pow(swing, 0.8) + 0.5 * load : 0.85 * Math.pow(swing, 0.9) + 0.18 * load; };
      let lowest = 0, fwd = 0; const lg = [];
      for (const [leg, shin, sg] of [[parts.legR, parts.shinR, 1], [parts.legL, parts.shinL, -1]]) {
        const th = moving ? sg * s * A + (run ? 0 : 0.04) : 0, kn0 = knee(sg), kn = run && KK ? CAN.kick(kn0, ph, sg, KK) : kn0;
        leg.rotation.x = th; shin.rotation.x = kn; fwd = Math.max(fwd, -th); lg.push([-sg * 0.12, th, kn, kn0]);
        const foot = sg > 0 ? parts.footR : parts.footL; foot.rotation.x = run && KK ? CAN.footAlong(th, kn) : -(th + kn) * (run ? 0.75 : 1);
        lowest = Math.max(lowest, KN * Math.cos(th) + (SH - 0.08) * Math.cos(th + kn) + 0.11);
      }
      body.position.y = moving ? baseY + (lowest - baseY) * (run ? 0.5 : 0.8) : baseY + Math.sin(t * 2.0) * 0.008;
      if (moving || skirtMoved) { (CAN ? deformSkirt3 : deformSkirt)(lg, run); skirtMoved = moving; }   // 立っているときは、いちど元に戻したら、形を計算しない（軽くする）
      for (const [arm, fore, sg] of [[parts.armR, parts.foreR, 1], [parts.armL, parts.foreL, -1]]) {
        const ar = moving ? -sg * s * armA : 0.02 * sg * Math.sin(t * 1.7); arm.rotation.x = ar;
        const fw = Math.max(0, -ar) / armA; fore.rotation.x = run ? -1.25 - 0.4 * fw : walk ? -0.2 - 0.35 * fw : -0.1;
      }
      parts.armR.rotation.z = -0.26; parts.armL.rotation.z = 0.26;
      if (!CAN) { parts.armR.rotation.x = -0.4; parts.foreR.rotation.x = -0.75; parts.armR.rotation.z = -0.12; }   // 杖を持つ手（R）は（ふらない）。canon は、腕の振りと一緒に動く（holdGrip）
      torso.rotation.x = run ? 0.28 : walk ? 0.05 : 0; torso.rotation.y = moving ? s * (run ? 0.2 : 0.1) : 0; body.rotation.x = 0;
      head.rotation.x = run ? -0.22 : 0; head.rotation.y = moving ? -s * (run ? 0.1 : 0.05) : 0;
      if (CAN && grip) grip();   // 持ち方は共通の holdGrip のまま（v6 で走りだけ前腕を外へ 1.0 rad に上書きしていたのをやめた。ユーザー指摘「僧侶だけ、ひじから先が体の外側に向いている」）
    }
    let grip = null;
    pose('stand', 0);
    group.updateMatrixWorld(true);
    if (CAN) {   // 杖：−x がわの手（R）に、地面と垂直に持つ（ひじ 90 度。腕の振りと一緒に前後に動く）。頭の高さまで
      parts.armR.rotation.z = 0; parts.foreR.rotation.set(-Math.PI / 2, 0, 0); group.updateMatrixWorld(true);
      const hv = new T.Vector3(0, CAN.C.HANDY, 0.01); parts.foreR.localToWorld(hv); torso.worldToLocal(hv);
      const HR = 0.12, yBut = -0.14, yTop = CAN.C.SMALLLEN - HR * 1.02 - 0.035;   // v9（ユーザー判断：案 A）：小型武器の長さ（拳から、てっぺんの小さな丸の上の端まで C.SMALLLEN 0.84＝戦士の剣と同じ）。左右の傾きは共通の既定（小型武器 5.7°）    staff.position.copy(hv);   /* v6：メイス（ユーザー指摘「槍に見える。拳から下を小さく、灰色の部分を大きく」）。柄の下の端は拳のすぐ下、上は灰色の大きな頭（鉄球と縦のひれ）。先のとがりはやめた */
      cyl(0.032, 0.036, yTop - yBut, 8, PAL.staff, 0, (yTop + yBut) / 2, 0, staff);
      cyl(0.045, 0.045, 0.05, 8, PAL.metalD, 0, yBut + 0.025, 0, staff);                                   // 柄の下の端の金具
      cyl(0.055, 0.055, 0.06, 10, PAL.metalD, 0, yTop - HR * 0.95, 0, staff);                              // 頭の下の金具
      sph(HR, 1, 1.05, 1, PAL.metal, 0, yTop, 0, staff, 12, 9);                                            // 灰色の頭（鉄球）
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, fl = new T.Mesh(new T.BoxGeometry(0.016, HR * 0.9, HR * 0.45), mat(PAL.metalD)); fl.position.set(Math.cos(a) * HR, yTop, Math.sin(a) * HR); fl.rotation.y = -a; staff.add(fl); }   // 縦のひれ（フランジ）6 枚。薄く・低く（太いと 128 ドットで頭が四角いハンマーに見えた。窓口の指摘）
      sph(0.035, 1, 1, 1, PAL.metal, 0, yTop + HR * 1.02, 0, staff, 8, 6);                                // てっぺんの小さな丸
      grip = CAN.holdGrip(T, group, parts, { side: 'R', prop: staff, buttY: yBut, face: true });   // face：メイスが顔に当たるので、ひじから先を外へ 0.25（共通の武器を持つ腕の決まり。2026-10-29 ユーザー判断「c」）
    } else     { const hand = new T.Vector3(0, -0.26 - FA, 0.03); parts.foreR.localToWorld(hand); torso.worldToLocal(hand); staff.position.copy(hand); if (CAN) staff.rotation.z = 0.15;   // 杖の先を外へ（斜め前で顔に重ならない）
      
      const DYS = 0;
      cyl(0.032, 0.032, 1.6 + DYS, 8, PAL.staff, 0, 0.12 + DYS / 2, 0, staff);
      cyl(0.045, 0.045, 0.06, 8, PAL.metalD, 0, 0.9 + DYS, 0, staff);
      sph(0.075, 1, 1.2, 1, PAL.metal, 0, 1.0 + DYS, 0, staff, 10, 8);                              // 杖の灰色の頭
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, sp = new T.Mesh(new T.ConeGeometry(0.025, 0.1, 5), mat(PAL.metalD)); sp.position.set(Math.cos(a) * 0.075, 1.0 + DYS, Math.sin(a) * 0.075); sp.rotation.z = -Math.cos(a) * 1.2; sp.rotation.x = Math.sin(a) * 1.2; staff.add(sp); }
      const tip = new T.Mesh(new T.ConeGeometry(0.03, 0.14, 6), mat(PAL.metal)); tip.position.set(0, 1.12 + DYS, 0); staff.add(tip); }
    // 高さ：戦士と同じにそろえる（帽子の先まで）
    const hOf = g => { g.updateMatrixWorld(true); return new T.Box3().setFromObject(g).max.y; };
    if (CAN) { pose('stand', 0); CAN.fitFoot(T, group, parts, false); CAN.fitTorsoTop(T, parts, 0.46);   /* 胴の上の端を肩の関節に（canon.fitTorsoTop。2026-10-29 ユーザー「全員、胴の上の端を肩の関節（0.44）に合わせる」）。TOP：今の胴の上の端 */ CAN.fit(T, group, parts, 'priest'); CAN.fitNeck(T, group, parts);   /* 首の見える長さを共通の値（C.NECKV）にそろえる（2026-10-29 ユーザー「僧侶の首の長さは共通ルールに合わせないとね」。背は合わせ直さない） */ if (KK) CAN.addSoles(T, parts, 'priest'); } else group.scale.setScalar(hOf(L().build(T, { toon: false }).group) / hOf(group));
    return { group, parts, pose };
  }
  L().buildPriest = buildPriest;
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildPriest };
})(typeof window !== 'undefined' ? window : globalThis);
