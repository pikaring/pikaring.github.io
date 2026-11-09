/* 戦士のフィールドの姿：ピクセル化したローポリ（試し。2026-10-26 ユーザー判断）。
   three.js の箱・球・円柱を組み合わせた、約 2.8 頭身（高さ 1.8 m）の戦士を、別の小さな画面（高さ 64 ドット＝今のドット絵と同じ）に描き、最近傍で拡大した板（Sprite）にして、
   今の主人公の板（view3d.js の hero）の代わりに出す。3D にするのは、フィールド（旅・フリーライド・試練・レース）の中の戦士だけ。
   戦闘（横から見る形）・ゴースト・旅人・ペースメーカー・村人・ほかの 3 人は、今までどおり 2D の板。
   色は平らで、影は 3 段（MeshToonMaterial）。骨は使わず、部品の回転で 立ち・歩き・走り。光は、島の光（view3d.js の hemi・sun）を毎コマ写す（時刻で変わる）。
   RQ.lowpoly.build(T, { toon }) → { group, parts, pose(mode, t) }（試作の道具 tools/lowpoly_hero も使う）。RQ.hero3d.create(T, { heroH }) → 板に貼る画面。 */
(function (root) {
  const HELM = { iron: 0x6f7a86, ridge: 0x9aa8b2, band: 0x4e5964 };
  // 戦士の正面の顔・兜と髪の合わせ方・頭の下げ方（2026-10-29 ユーザー判断：案 H1＝WB＋兜を頭に合わせる。同日「頭を円筒にしたのに，兜が頭の直径より小さいから横から見ると変」：兜の横・前後を元の 1.25 倍（Z1。ユーザー「兜はまだ小さい。鉄の厚みがない」「後頭部も同じように直す」：うしろ頭も筒＝cyl、すその帯の高さ 0.065＝thick）、額を兜の中へ ext 0.03。docs/3d-canon/canon.md「正面の顔」）。比べ用に window.__WARRIORFACE・__WARRIORHELM・__WARRIORHEAD（tools/lowpoly_hero/face_monk.js）
  //   FACE：たて長の目・白い点 1 つ（男性も。2026-10-29）・ごく小さい鼻・口角の上がった小さな口（男性の暗い色）、まつ毛・ほおの赤みなし。顔の幅 0.37・あごの丸み 0.08（0.095 だと、うしろの髪があごの下に出た）
  //   HELM：helm・hair＝兜・髪の [x, y, z の倍率, z のずらし]（つばの直径が、髪を含む頭より約 6% 大きい。高さ 1.0＝兜のてっぺんは今のまま 1.935：魔法使いの帽子の決まり canon §1）、flat＝側頭部を平らに兜の下まで立ち上げる（ユーザー「側頭部は平らなので兜に向かって絞り込まない」）
  //   HEAD：頭は下げない（0.015 下げると Rneck 14→28。戦士は今でも首が基準ぎりぎり）
  const WAR = { BANG: { spikes: [[0, 0.24, 0.045]], base: 0.335, top: 0.41, w: 0.38, d: 0.012 }, EAR: { x: 0.13, z: -0.12, y: 0.3 }, SB: { x: 0.185, y0: 0.195, y1: 0.33, z0: 0.035, z1: 0.075, w: 0.035 },
    CLOTH: { pants: 0x835637, belt: 0x5f3428, buckle: 0xb8c4cc, strap: 0x6b4424, under: 0x4e2e25, slit: [0.045, 0.075], strapPts: [[-0.15, 0.36], [0, 0.22], [0.17, 0.075]], strapW: 0.06, lineW: 0.028, lineEnd: 0.065 },   // 2D に寄せた前髪・耳・もみあげ・服（2026-11-02 ユーザー判断。docs/3d-canon/canon.md）
    FACE: {ext: 0.03},   /* 顔は男性の共通の顔（canon.FACEM）に、額を兜の中へ（ext）だけ足す */ HELM: {helm: [0.96, 0.95, 0.88, -0.017], hair: [0.92, 1.0, 0.86, 0.02], flat: 0.9, cyl: true, thick: 0.03}   /* 2026-11-02 ユーザー判断「戦士は案A」：兜の厚みを、僧侶のベレー帽にする前の帽子くらいに（前は [1.0625, 1.0, 0.9125]・すその帯 0.065＝頭の外形の約 1.3 倍） */, HEAD: null };
  const W3 = k => (typeof window !== 'undefined' && window['__WARRIOR' + k]) || WAR[k];   // canon v6 の兜（ドット絵の鉄の色：中 #677781・明るい #96a7b0・暗い #3e4a54。光と影の段で暗く出る分、少し明るく置く）
  const COL = { face: 0xffc49b, neck: 0xf2b189, skin: 0xe9b48a, hair: 0x6a3f20, steel: 0xc9ced8, steelD: 0x8e95a3, red: 0xc23b30, redD: 0x9a2c25, gold: 0xe2b341, blue: 0x2e5fb4, blueD: 0x234a8e, brown: 0x6b4424, brownD: 0x4d301a, pants: 0x5d4a38, belt: 0x3d2a18, white: 0xe8e8e8, eye: 0x241812 };

  // 体のつり合い（試し。ユーザーが選んだ案に、この 1 か所の SHAPE を替える）。leg＝脚の長さ、arm＝腕の長さ、head＝頭の大きさの倍率。
  // どの案も、全体の高さは A（今）と同じ 1.8 m にそろえる（build が最後に全体を拡大・縮小する）
  const SHAPES = { A: { leg: 1, arm: 1, head: 1 }, B: { leg: 1.4, arm: 1.35, head: 0.9 }, C: { leg: 1.9, arm: 1.8, head: 0.78 }, D: { leg: 1.7, arm: 1, head: 1 }, R: { leg: 1.1, arm: 1.05, head: 1.2 } };   // R＝参考絵に近いつり合い（顔が大きく、脚が短め。比べ用）
  const SHAPE = 'B';   // 2026-10-26 ユーザー判断：案 B（R は不可）
  // 形の細かさと描くドット数（2026-10-26 ユーザー判断：細かい形・96 ドット）。戻すなら FINE = false・PX = 64
  const FINE = true, PX = 128, STEPS = 5, OUTLINE = false;   // 2026-10-29 ユーザー判断：縁なしに決まった（試走で「縁取りなしがスッキリしててよかった」）。前は試走で縁なしを試す（小さいキャラが縁取りでガタついて見えた）。戻すなら OUTLINE = true。   // 2026-10-26 ユーザー判断：128 ドット・影 5 段・縁つき（後ろ姿は 128 で十分）。戻すなら PX = 96・STEPS = 3・OUTLINE = false。   // STEPS＝影の段の数、OUTLINE＝まわりに暗い縁を付ける

  function chestDeco(T, out) {   // 胸（2026-11-02 ユーザー「服も2dに寄せて」）：真ん中の銀の輪・輪からベルトへ金の縦線・右肩から輪を通って左の腰へ茶のひも。胴の上の端を合わせたあと、赤い胴の前の面に raycast で沿わせる
    const P = out.parts, mat = P._mat, torso = P.torso, CL = WAR.CLOTH;
    out.group.updateMatrixWorld(true);
    const red = []; for (const m of torso.children) if (m.isMesh && m.material && m.material.color && m.material.color.getHex() === mat(COL.red).color.getHex()) red.push(m);
    const rc = new T.Raycaster(), inv = new T.Matrix4().copy(torso.matrixWorld).invert();
    const hit = (x, y) => { const o = new T.Vector3(x, y, 2).applyMatrix4(torso.matrixWorld), d = new T.Vector3(0, 0, -1).transformDirection(torso.matrixWorld); rc.set(o, d); const h = rc.intersectObjects(red, false)[0]; return h ? h.point.applyMatrix4(inv).z : 0.2; };
    const seg = (x0, y0, x1, y1, w, c, dz) => { const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, g = new T.BoxGeometry(1, 1, 1, 1, Math.max(2, Math.ceil(L / 0.02)), 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const t = p.getY(i) + 0.5, s = p.getX(i) * w, x = x0 + ux * L * t + uy * s, y = y0 + uy * L * t - ux * s; p.setXYZ(i, x, y, hit(x, y) + (p.getZ(i) > 0 ? dz : -0.01)); }   // 面の向きが裏返らないよう、幅の向きは (uy, −ux)
      g.computeVertexNormals(); const m = new T.Mesh(g, mat(c)); m.name = 'chest'; torso.add(m); return m; };
    const S = CL.strapPts;
    seg(S[1][0], S[1][1] - 0.01, S[1][0], CL.lineEnd, CL.lineW, COL.gold, 0.006);
    seg(S[0][0], S[0][1], S[1][0], S[1][1], CL.strapW, CL.strap, 0.008); seg(S[1][0], S[1][1], S[2][0], S[2][1], CL.strapW, CL.strap, 0.008);
    const r = new T.Mesh(new T.TorusGeometry(0.026, 0.009, 5, 12), mat(CL.buckle)); r.position.set(S[1][0], S[1][1], hit(S[1][0], S[1][1]) + 0.012); r.name = 'chest'; torso.add(r);
  }
  function build(T, opt = {}) {
    const sh = Object.assign({ leg: 1, arm: 1, head: 1 }, typeof opt.shape === 'string' ? SHAPES[opt.shape] : opt.shape);
    const out = build0(T, opt.toon !== false, sh, opt);
    if (sh.leg !== 1 || sh.arm !== 1 || sh.head !== 1) {   // 高さを A（今）と同じにそろえる
      const hOf = g => { g.updateMatrixWorld(true); const b = new T.Box3().setFromObject(g); return b.max.y; };
      const ref = build0(T, opt.toon !== false, { leg: 1, arm: 1, head: 1 }, {});
      out.group.scale.setScalar(hOf(ref.group) / hOf(out.group));
    }
    if (opt.canon && root.RQ.lowpoly.canon) { const CN = root.RQ.lowpoly.canon; out.pose('stand', 0); out.group.scale.setScalar(1); CN.fitFoot(T, out.group, out.parts, false); CN.fitTorsoTop(T, out.parts, 0.46); chestDeco(T, out);   /* 胴の上の端を肩の関節に（canon.fitTorsoTop。2026-10-29 ユーザー「全員、胴の上の端を肩の関節（0.44）に合わせる」）。TOP：今の胴の上の端 */   /* 足は共通（2026-10-29 ユーザー「戦士の足は共通にする」）。形の倍率を 1 に戻してから（fitFoot は世界の長さで測る） */ CN.fit(T, out.group, out.parts, 'warrior'); { const HD = W3('HEAD'); if (HD && HD.down) out.parts.head.position.y -= HD.down; /* 頭を下げる（背は合わせ直さない。武闘家と同じ 2026-10-29） */ } CN.fitNeck(T, out.group, out.parts);   /* 胴の上の端を下げて首が長くなったぶん、首の見える長さを共通の値（C.NECKV）にそろえる */ if (CN.KICK.warrior) CN.addSoles(T, out.parts, 'warrior'); }   // 走りで蹴り上げる人は、靴の裏を白っぽく（背を合わせたあと）   // 背（足の裏〜顔の上端）を全員同じに
    return out;
  }

  function build0(T, toon, shp, opt0 = {}) {
    const CAN = opt0.canon && root.RQ.lowpoly && root.RQ.lowpoly.canon;
    const LX = CAN ? CAN.C.LEG - 0.74 : 0.74 * (shp.leg - 1), AX = 0.3 * (shp.arm - 1), KN = CAN ? CAN.C.KN : (0.74 + LX) * 0.5, SH = CAN ? CAN.C.SH : 0.74 + LX - KN;   // KN＝腰から膝まで、SH＝膝から足の裏まで   // 脚・腕の足す長さ（m）。canon は共通の C（脚の長さ C.LEG・C.KN・C.SH）   // 共通の決まり：顔・首・目・鼻・口・耳は共通のコードで作る（docs/3d-canon/canon.md）。ゲームは canon（RQ.hero3d.create の既定。2026-10-27）
    const N2 = (typeof window !== 'undefined' && window.__N2) || { sx: 0.9, sy: 0.9, sz: 1.0, y: -0.05, z: -0.13 };
    const CPO = (typeof window !== 'undefined' && window.__CAPEOPT) || {};   // マントの長さ・走りの角度を上書き（比べ絵用。ゲームでは未設定）
    let grad = null; const ST = opt0.steps || 3, Q = opt0.q || 1;   // ST＝影の段の数、Q＝丸みの分け方の細かさ（ドット数を上げたとき、角ばって見えないように）
    if (toon) { const lv = ST === 3 ? [105, 185, 255] : Array.from({ length: ST }, (_, i) => Math.round(95 + 160 * i / (ST - 1))), d = new Uint8Array(lv.flatMap(v => [v, v, v, 255])); grad = new T.DataTexture(d, ST, 1, T.RGBAFormat); grad.minFilter = grad.magFilter = T.NearestFilter; grad.needsUpdate = true; }   // 3 段の影
    const EXPO = toon ? 0.74 : 1;   // 明るい島の光（半球 0.85＋太陽 0.75）で白飛びしないよう、色を少し落とす
    const mat = c => toon ? new T.MeshToonMaterial({ color: new T.Color(c).multiplyScalar(EXPO), gradientMap: grad }) : new T.MeshLambertMaterial({ color: c, flatShading: true });
    const CL = WAR.CLOTH, group = new T.Group(), parts = {}; parts._mat = mat;   // _mat：組み立てのあとで胴に足す部品（chestDeco）の材質
    const box = (w, h, d, c, x, y, z, p) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); (p || group).add(m); return m; };
    const cyl = (r0, r1, h, seg, c, x, y, z, p) => { const m = new T.Mesh(new T.CylinderGeometry(r0, r1, h, Math.round(seg * Q)), mat(c)); m.position.set(x, y, z); (p || group).add(m); return m; };
    const fine = !!opt0.fine;   // 細かい形（2026-10-26 比べ用）：先細りの手足・胴、手・つま先・膝当て・肩当て・顔の鼻と眉・兜のふちと頬あて・マントのすその波など、部品を足す
    const tbox = (wt, wb, h, dt, db, c, x, y, z, p) => { const g = new T.BoxGeometry(1, h, 1), a = g.attributes.position; for (let i = 0; i < a.count; i++) { const up = a.getY(i) > 0; a.setX(i, a.getX(i) * (up ? wt : wb)); a.setZ(i, a.getZ(i) * (up ? dt : db)); } g.computeVertexNormals(); const m = new T.Mesh(g, mat(c)); m.position.set(x, y, z); (p || group).add(m); return m; };
    const sph = (r, sx, sy, sz, c, x, y, z, p, ws = 10, hs = 7) => { const m = new T.Mesh(new T.SphereGeometry(r, Math.round(ws * Q), Math.round(hs * Q)), mat(c)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); (p || group).add(m); return m; };
    const ell = (rt, rb, h, seg, sx, sz, c, x, y, z, p) => { const m = cyl(rt, rb, h, seg, c, x, y, z, p); m.scale.set(sx, 1, sz); return m; };   // 断面が楕円の柱（丸みのある胴・手足）
    const pivot = (x, y, z, p) => { const g = new T.Group(); g.position.set(x, y, z); (p || group).add(g); return g; };

    // 腰（回る中心）。体全体の弾み・前かがみはここで
    const baseY = CAN ? CAN.C.baseY : 0.74 + LX + 0.03;   // 長靴の底の厚み（0.03）の分だけ上げて、足の裏を y=0 にする
    const body = parts.body = pivot(0, baseY, 0);
    // 脚：ズボンと長靴（つま先は少し前）
    for (const sx of [-1, 1]) {
      const leg = parts[sx < 0 ? 'legR' : 'legL'] = pivot(sx * (fine ? (CAN ? CAN.C.legX : 0.145) : 0.125), 0, 0, body);   // 腰の関節
      if (!fine) box(0.2, KN, 0.23, COL.pants, 0, -KN / 2, 0, leg);                                // 太もも
      else { ell(0.112, 0.086, KN + 0.02, 12, 1, 1.05, (CAN ? CL.pants : COL.pants), 0, -KN / 2, 0, leg); sph(0.1, 1, 0.85, 1.05, (CAN ? CL.pants : COL.pants), 0, 0, 0, leg); }   // 脚の間に隙間ができるように、少し細く・はなす   // 先細りの太もも、腰の丸み
      const shin = parts[sx < 0 ? 'shinR' : 'shinL'] = pivot(0, -KN, 0, leg);          // 膝の関節
      if (!fine) {
        box(0.2, 0.44 + LX - KN + 0.02, 0.23, COL.pants, 0, -(0.44 + LX - KN) / 2, 0, shin);   // すね（ズボンの下がわ）
        box(0.235, 0.32, 0.26, COL.brown, 0, -0.58 - LX + KN, 0.01, shin);
        box(0.235, 0.12, 0.13, COL.brownD, 0, -0.68 - LX + KN, 0.17, shin);   // つま先
        box(0.25, 0.05, 0.28, COL.steelD, 0, -0.43 - LX + KN, 0.01, shin);     // 長靴の折り返し
      } else {
        sph(0.095, 1, 0.9, 1, (CAN ? CL.pants : COL.pants), 0, 0, 0, shin);   // 膝
        if (!CAN) sph(0.085, 1, 0.9, 0.8, COL.steelD, 0, -0.01, 0.1, shin);   // 膝当て（共通の決まり（案 v3）：小さく、脚に近く。斜め後ろでマントの横から出て見えない）
        ell(0.092, 0.078, 0.44 + LX - KN + 0.03, 12, 1, 1.05, (CAN ? CL.pants : COL.pants), 0, -(0.44 + LX - KN) / 2, 0, shin);
        cyl(0.115, 0.095, 0.32, 12, COL.brown, 0, -0.58 - LX + KN, 0.01, shin);   // 長靴（上が太い）
        const foot = parts[sx < 0 ? 'footR' : 'footL'] = pivot(0, -(SH - 0.08), 0, shin);   // 足首：足の裏を地面と平らに保つ（足が地面にめり込まない）
        sph(0.115, 1.0, 0.7, 1.45, COL.brownD, 0, -0.03, 0.1, foot);   // つま先
        box(0.2, 0.035, 0.3, COL.belt, 0, -0.085, 0.07, foot);        // 靴底
        cyl(0.13, 0.13, 0.05, 10, CAN ? COL.brownD : COL.steelD, 0, -0.43 - LX + KN, 0.01, shin);   // 折り返し
        box(0.045, 0.045, 0.02, COL.gold, 0, -0.5 - LX + KN, 0.125, shin);        // 留め金
      }
    }
    // 胴：赤い服、金のふち、帯
    const torso = parts.torso = pivot(0, 0, 0, body);
    const HEM = { top: -0.005, len: 0.36, r0: 0.25, r1: 0.3, WZ: 0.72, OV: 0.3, KF: 1.1, KB: 1.1 }, hemList = [];   // canon の裾（前後 2 枚）
    if (!fine) {
      box(0.5, 0.44, 0.31, COL.red, 0, 0.23, 0, torso);
      box(0.52, 0.045, 0.33, COL.gold, 0, 0.44, 0, torso);         // 裾（金）
      box(0.52, 0.075, 0.33, COL.belt, 0, 0.03, 0, torso);         // 帯
      box(0.085, 0.07, 0.03, COL.gold, 0, 0.03, 0.17, torso);      // バックル
      box(0.5, 0.17, 0.31, COL.redD, 0, -0.085 + 0.0, 0, torso);   // 服の裾
    } else {
      ell(0.31, 0.235, 0.46, 16, 1, 0.64, COL.red, 0, 0.23, 0, torso);   // 胸から腰へ細くなる丸い胴
      sph(0.2, 1.1, 0.75, 0.75, COL.red, 0, 0.36, 0.02, torso, 12, 8);      // 胸のふくらみ
      box(0.4, 0.14, 0.04, COL.redD, 0, 0.34, 0.16, torso);              // 胸の布の重なり
      ell(0.2, 0.22, 0.04, 14, 1, 0.8, COL.gold, 0, 0.45, 0.01, torso);   // えりぐりの金
      ell(0.25, 0.25, 0.08, 16, 1, 0.66, CAN ? CL.belt : COL.belt, 0, 0.03, 0, torso);   // 帯（canon：2D の茶と銀の留め具。2026-11-02）
      box(0.1, 0.085, 0.03, CAN ? CL.buckle : COL.gold, 0, 0.03, 0.16, torso); box(0.05, 0.045, 0.035, CAN ? CL.belt : COL.belt, 0, 0.03, 0.17, torso);   // 金具
      if (!CAN) { ell(0.25, 0.33, 0.2, 16, 1, 0.74, COL.redD, 0, -0.1, 0, torso); ell(0.335, 0.335, 0.03, 16, 1, 0.75, COL.gold, 0, -0.205, 0, torso); }   // 服の裾（広がる）と裾の金
      else {   // 2026-10-27 ユーザー指摘「戦士も傭兵も胴から下の服の形がおかしい。前後を腰の幅に合わせて裾を長く」：前後の厚みは帯と同じ（WZ）、ももの中ほどまで。前と後ろの 2 枚（canon 手順 5。傭兵 hero3d_mercenary.js と同じ作り）。pose で脚に合わせて持ち上げる（bendHem）
        const SEG = Math.round(16 * Q), prof = (k, a, b) => { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new T.Vector2((HEM.r0 + (HEM.r1 - HEM.r0) * Math.sin(Math.min(1, t / 0.6) * Math.PI / 2)) * k, -HEM.len * (a + (b - a) * t))); } return pts.reverse(); };
        for (const [n, ph0, k] of [['F', -Math.PI / 2 - HEM.OV, 1], ['B', Math.PI / 2 - HEM.OV, 0.985]]) {
          const g = pivot(0, HEM.top, 0, torso); parts['skirt' + n] = g;
          for (const [pts, c] of [[prof(k, 0, 1), COL.redD], [prof(k * 1.02, 0.9, 1.0), COL.gold]]) {
            const o = new T.Mesh(new T.LatheGeometry(pts, SEG, ph0, Math.PI + 2 * HEM.OV), mat(c)); o.name = 'hem'; o.material.side = T.DoubleSide; o.frustumCulled = false; g.add(o);
            const pa = o.geometry.attributes.position; for (let i = 0; i < pa.count; i++) pa.setZ(i, pa.getZ(i) * HEM.WZ);
            hemList.push({ o, n, base: Float32Array.from(pa.array) }); }
          if (n === 'F') {   // すその前の合わせ目（2D：金のふち 2 本のあいだに茶色の下着。2026-11-02 ユーザー判断）。前の真ん中の細い帯を、同じ形で少し外へ（bendHem で一緒に曲がる）
            const R = 0.28, ph = x => Math.asin(x / R), SW = CL.slit;
            for (const [a, b, c, kk] of [[-SW[0], SW[0], CL.under, 1.012], [-SW[1], -SW[0], COL.gold, 1.014], [SW[0], SW[1], COL.gold, 1.014]]) {
              const o = new T.Mesh(new T.LatheGeometry(prof(k * kk, 0, 0.9), SEG, ph(a), ph(b) - ph(a)), mat(c)); o.name = 'hem'; o.material.side = T.DoubleSide; o.frustumCulled = false; g.add(o);
              const pa = o.geometry.attributes.position; for (let i = 0; i < pa.count; i++) pa.setZ(i, pa.getZ(i) * HEM.WZ);
              hemList.push({ o, n, base: Float32Array.from(pa.array) }); } } } }
      for (const sx of [-1, 1]) { if (!CAN) sph(0.125, 1.05, 0.8, 1.05, COL.red, sx * 0.31, 0.385, 0, torso, 12, 8); if (!CAN) { sph(0.128, 1.05, 0.28, 1.05, COL.gold, sx * 0.31, 0.44, 0, torso, 12, 5); sph(0.05, 1, 1, 1, COL.gold, sx * 0.31, 0.46, 0, torso, 6, 4); } }   // 肩当て（金のふちと飾り）。共通の決まり（案 v3）：うしろから、マントの上に服の金のふちが見えない（ユーザー指摘）ので、金はなし
    }
    // マント：肩から長く。後ろへ流れる。襟（青）つき
    const cape = parts.cape = pivot(0, CAN ? 0.465 : 0.44, -0.165, torso);   // 共通の決まり（案）：マントの上を少し上げて、肩のうしろの服の金のふち（襟まわり）をおおう
    if (!fine) {
      box(0.62, 0.9 + LX, 0.05, COL.blue, 0, -(0.9 + LX) / 2, -0.02, cape);   // 脚が長い案では、マントも同じだけ長く（足もとからの裾の高さを A と同じに）
      box(0.64, 0.05, 0.055, COL.gold, 0, -0.9 - LX, -0.02, cape);      // 裾の金のふち
    } else if (!CAN) {   // 5 枚の帯に分けて、すそを波に（長さと向きを少しずつ替える）。v5.7：canon の戦士はマントをやめた（ユーザー判断：巨大な青い板に見える・何度直しても板／突き抜け／赤い半円が出た）。v6（2026-10-27 ユーザー判断「実装に挑戦」）で、1 枚の曲面のマントとして戻した（下の else と deformCape。canon.md「戦士の兜とマント」）。この帯の作りは、canon でないとき（比べ用）だけ
      const CAPEK = CPO.k || 0.7;   /* __CAPEOPT：マントの長さの比べ絵用（ゲームでは使わない）*/   // v5.1：canon のマントの長さ（足の後ろ振りで、長靴がマントより手前に出ない）
      const ln = [0.9, 0.95, 0.99, 1.0, 0.97, 0.93, 0.88], tw = CAN ? [0.3, 0.2, 0.08, 0, -0.08, -0.2, -0.3] : [0.16, 0.1, 0.04, 0, -0.04, -0.1, -0.16];   // canon：両はしの帯を、肩のよこへ回り込ませる（横から見て細い棒にならない）
      for (let i = 0; i < 7; i++) { const L = (ln[i] + LX) * (CAN ? CAPEK : 1), st = pivot((i - 3) * (CAN ? 0.104 : 0.094), 0, 0, cape); st.rotation.y = tw[i]; st.rotation.z = (i - 3) * 0.012;
        if (CAN) {   // 共通の決まり（案 v4）：布として、下半分が風でなびく（板・棒に見えない）。各帯は 2 つの部品（上・下）。下は、走りでうしろへ曲がり、帯ごとに少しずつずれる
          const U = L * 0.42, cc = i % 2 ? COL.blue : COL.blueD, low = pivot(0, -U, 0, st); (parts.capeLow = parts.capeLow || []).push(low);
          box(0.118, U + 0.04, 0.085, cc, 0, -U / 2 + 0.02, -0.02, st); box(0.118, L - U, 0.085, cc, 0, -(L - U) / 2, -0.02, low); box(0.12, 0.05, 0.09, COL.gold, 0, -(L - U), -0.02, low);   // v5.1：横から見て細い板に見えないよう、厚み 0.05 → 0.085
        } else { box(0.108, L, 0.05, i % 2 ? COL.blue : COL.blueD, 0, -L / 2, -0.02, st); box(0.11, 0.05, 0.055, COL.gold, 0, -L, -0.02, st); } }
    } else {   // v6（2026-10-27 ユーザー判断「マントの実装に挑戦」。魔法使いのローブの後ろの作りを流用）：肩から背中に沿う 1 枚の曲面。毎コマ、脚・腕・盾・剣・チュニックの後ろの裾を、外（背中から離れる向き）へ押し出して、突き抜けないように形を変える（deformCape）
      const CW = (typeof window !== 'undefined' && window.__CAPEW) || { rx0: 0.11, rx1: 0.02, th: 1.35 };   // 2026-10-27 ユーザー指示：幅は胴の幅（肩の関節の内側まで）。後ろから腕の振りが見える（前は rx0 0.28・rx1 0.03・th 1.65＝肩幅いっぱい）。__CAPEW は確かめ用
      // 形：上の NC 行は、襟のまわり（半径 0.17）から肩の上へ丸くかぶさる「肩かけ」（4 分の 1 の楕円で、肩の高さ Y0−HC で肩幅に）。その下は、背中に沿ってまっすぐ裾へ（少し広がる）。th＝背中の真ん中から左右へ回り込む角度（上は前へ少し回り込み、ドット絵の正面の肩の青になる）
      // 作りは共通（hero3d_canon.js の capeSheet。2026-10-28 ユーザー判断「マントは戦士に合わせる（共通の設計）」：エルフ・ワルキューレも同じ関数）。cm（メッシュ）の座標＝胴の座標（cape の位置を打ち消す）
      const cB = new T.Color(COL.blue), cD = new T.Color(COL.blueD), cG = new T.Color(COL.gold);
      const sheet = root.RQ.lowpoly.canon.capeSheet(T, cape, { NA: Math.round(26 * Q), NC: 5, NY: 23, Y0: 0.51, HC: 0.1, Y1: -0.55, ZC: -0.02, rxT: 0.17, rxS: 0.17 + CW.rx0, rxH: 0.17 + CW.rx0 + CW.rx1, rzT: 0.15, rzS: 0.25, rzH: 0.32, thT: 2.3, th: CW.th, foldA: 0.08, rip: 0.025, swayX: 0.035,
        col: (ft, fv, c) => ft > 0.955 ? c.copy(cG) : c.copy(cB).lerp(cD, 0.85 * Math.min(1, ft * 2 + 0.2) * (1 - fv) / 2),   // 裾の金のふち。ひだの谷は暗い青（ドット絵の後ろ姿のひだの筋）
        mat: toon ? new T.MeshToonMaterial({ color: new T.Color(0xffffff).multiplyScalar(EXPO), gradientMap: grad, vertexColors: true, side: T.FrontSide }) : new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: T.FrontSide }), matIn: mat(COL.blueD) });
      const ci = sheet.inner; ci.material.side = T.BackSide; if (ci.material.emissive) ci.material.emissive = new T.Color(COL.blueD).multiplyScalar(0.35);   // 裏は暗い青（魔法使いのローブの裏と同じ作り。裏が黒い穴・赤に見えない）
      sheet.mesh.position.set(0, -0.465, 0.165); ci.position.copy(sheet.mesh.position);
      parts.capeMesh = sheet;
    }
    if (!fine) box(0.5, 0.06, 0.34, COL.blueD, 0, 0.0, 0.17, torso).position.set(0, 0.46, 0.0);   // 襟
    else ell(CAN ? 0.1 : 0.15, 0.2, CAN ? 0.13 : 0.05, 14, 1, 0.8, COL.blueD, 0, CAN ? 0.47 - 0.008 : 0.445, CAN ? -0.02 : 0.0, torso);   // 2026-10-29：襟を 0.008 下げる（首の見える長さ 0.039 → C.NECKV 0.0458。決まり「首が短い人は頭を上げず襟を下げる」）   // 襟（首の付け根を縁取る。首は隠さない）。canon v6：マントを戻したので、ドット絵どおり青（v5.8 はマントが無く、上着と同じ赤だった）
    // 背中の丸い盾（青・金のふち）と、肩越しの剣
    const shield = parts.capeShield = CAN ? pivot(0, 0, 0, torso) : pivot(0, -0.18, -0.07, cape);   // v5.8：canon の盾は、左の前腕に付ける（腕を作ったあとで付け替える。ワルキューレと同じ）   // v5.7：canon の盾は、マントでなく背中（胴）に、少し浮かせて付ける（独立した立体）。   // 共通の決まり（案）：盾の上の縁がマントの上の縁より上へ出ないよう、下げる（ユーザー指摘「マントから服の黄色い縁取りがはみ出している」）
    const SR = 1;   // 盾の飾りの大きさ（共通の決まり（案）：マントの幅の内側に収める。縁の金がマントの外へはみ出さない）
    const ZS = 1;   // 盾の飾り（ふち・中央・輪・びょう）の向き：canon は +z が外（前腕に付けて +x へ向ける）
    if (CAN) {   // v5.8b（窓口の指摘：盾の裏が模様も縁もない黄色の円盤）：表（+z＝外）は青の板・金のふち・びょう・輪・中央の金。裏（-z＝腕がわ）も金のふち・青の板目・持ち手の革帯
      const sh = cyl(0.29, 0.29, 0.05, 16, COL.blue, 0, 0, 0, shield); sh.rotation.x = Math.PI / 2;
      const rim = new T.Mesh(new T.TorusGeometry(0.285, 0.024, 6, 28), mat(COL.gold)); shield.add(rim);   // ふち（両面から見える輪）
      for (const sgn of [1, -1]) {   // 表・裏の飾り
        const ring = new T.Mesh(new T.TorusGeometry(0.2, 0.014, 6, 24), mat(COL.gold)); ring.position.z = 0.03 * sgn; shield.add(ring);
        if (sgn > 0) { for (let i = 0; i < 6; i++) { const a2 = i / 6 * Math.PI * 2; sph(0.022, 1, 1, 1, COL.gold, Math.cos(a2) * 0.235, Math.sin(a2) * 0.235, 0.03, shield, 6, 4); }
          const boss = cyl(0.07, 0.07, 0.05, 10, COL.gold, 0, 0, 0.045, shield); boss.rotation.x = Math.PI / 2; sph(0.075, 1, 1, 0.6, COL.gold, 0, 0, 0.06, shield, 8, 5); }
        else { for (const x of [-0.14, 0, 0.14]) box(0.018, 0.5 - Math.abs(x) * 1.6, 0.012, COL.blueD, x, 0, -0.027, shield);   // 板目（青より暗い縦の線）
          box(0.07, 0.3, 0.03, COL.brown, 0, 0, -0.05, shield); box(0.09, 0.04, 0.035, COL.brownD, 0, 0.17, -0.05, shield); box(0.09, 0.04, 0.035, COL.brownD, 0, -0.17, -0.05, shield);   // 持ち手の革帯（腕に沿う縦）と留め具
          cyl(0.07, 0.07, 0.03, 10, COL.gold, 0, 0, -0.04, shield).rotation.x = Math.PI / 2; }   // 裏の中心の金
      }
    } else {
    const sh = cyl(0.265 * SR, 0.265 * SR, 0.05, 14, COL.blue, 0, 0, 0, shield); sh.rotation.x = Math.PI / 2;
    const rim = cyl(0.295 * SR, 0.295 * SR, 0.04, 14, COL.gold, 0, 0, 0.012 * ZS, shield); rim.rotation.x = Math.PI / 2;
    const boss = cyl(0.07, 0.07, 0.07, 8, COL.gold, 0, 0, -0.035 * ZS, shield); boss.rotation.x = Math.PI / 2;
    if (fine) {
      const ring = new T.Mesh(new T.TorusGeometry(0.2 * SR, 0.014, 6, 24), mat(COL.gold)); ring.position.z = -0.03 * ZS; shield.add(ring);   // 盾の内側の輪
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; sph(0.022, 1, 1, 1, COL.gold, Math.cos(a) * 0.235 * SR, Math.sin(a) * 0.235 * SR, -0.03 * ZS, shield, 6, 4); }   // びょう
      sph(0.075, 1, 1, 0.6, COL.gold, 0, 0, -0.065 * ZS, shield, 8, 5);
    }
    }
    // 剣：背中の盾のうしろを斜めに通す。うしろから見て、右上に柄、盾をはさんで左下に鞘（2026-10-26 ユーザー指摘：背負い方が逆だった）
    const sword = parts.sword = CAN ? pivot(0, 0, 0, torso) : pivot(0.07, 0.22, -0.225, torso);   // v5.8：canon の剣は、右手（-x がわ）に持つ（刃は上、地面と垂直。下の holdGrip）。ゲームの見た目は、背中に斜め
    if (CAN) {
      const sg = pivot(0, 0, 0, sword); sg.rotation.y = Math.PI / 2;   // 2026-10-26 ユーザー判断：刃の向きを 90°回す（横から見ると平らな面、後ろ・前から見ると細い縁）
      box(0.05, 0.2, 0.05, COL.brownD, 0, 0, 0, sg);                    // 柄（にぎる所）
      sph(0.045, 1, 1, 1, COL.gold, 0, -0.12, 0, sword, 8, 6);             // 頭金
      box(0.27, 0.04, 0.07, COL.gold, 0, 0.115, 0, sg);               // つば
      box(0.14, 0.56, 0.026, COL.steel, 0, 0.41, 0, sg);                // 刃（v5.8b：片手剣らしく、幅広く・短く。細長い槍・刀に見えるという指摘）
      box(0.04, 0.54, 0.034, COL.steelD, 0, 0.41, 0, sg);                 // 刃の中の筋
      { const tg = new T.ConeGeometry(0.099, 0.15, 4); tg.rotateY(Math.PI / 4); const tp = new T.Mesh(tg, mat(COL.steel)); tp.scale.set(1, 1, 0.26); tp.position.set(0, 0.765, 0); sg.add(tp); }   // 切っ先：断面は幅 0.14・厚さ 0.026 の長方形で、刃と同じ向き（以前は拡大の前に回していて、斜めの菱形＝切っ先だけ正面を向いた）   // 切っ先
    } else {
    sword.rotation.z = 0.8;   // 柄は頭のうしろに隠れない位置まで、右上へ
    box(0.075, 0.72, 0.035, COL.brown, 0, 0.0, 0, sword);        // 鞘
    box(0.09, 0.07, 0.04, COL.gold, 0, -0.34, 0, sword);          // 鞘の先の金具
    box(0.085, 0.035, 0.04, COL.gold, 0, 0.3, 0, sword);          // 鞘の口の金具
    box(0.2, 0.035, 0.05, COL.gold, 0, 0.43, 0, sword);          // つば
    box(0.045, 0.16, 0.045, COL.brownD, 0, 0.53, 0, sword);      // 柄
    const pom = new T.Mesh(new T.SphereGeometry(0.04, 6, 4), mat(COL.gold)); pom.position.set(0, 0.63, 0); sword.add(pom);
    if (fine) {
      for (const sx of [-1, 1]) sph(0.03, 1, 1, 1, COL.gold, sx * 0.1, 0.43, 0, sword, 6, 4);
      for (const y of [0.5, 0.56]) cyl(0.026, 0.026, 0.012, 8, COL.gold, 0, y, 0, sword);   // 柄の巻き
      box(0.04, 0.5, 0.012, COL.belt, 0, -0.02, 0.022, sword);    // 鞘の線
    }
    }
    // 腕：赤い袖、白い手首の巻き布、茶色の手。左右の名前は全員と同じ L ＝ +x（キャラ自身の左。canon.md §1-10。2026-10-29 ユーザー「左右の名前は統一した方がいい」）。前は L ＝ −x だった。見た目・剣（−x の手＝R）と盾（+x の前腕＝L）の持ち手は同じ
    for (const sx of [-1, 1]) {
      const arm = parts[sx < 0 ? 'armR' : 'armL'] = pivot(sx * (CAN ? CAN.C.shX : 0.335), CAN ? CAN.C.shY : 0.4, 0, torso);
      if (!fine) box(0.16, (CAN ? CAN.C.UA : 0.3 + AX / 2), 0.19, COL.red, 0, -((CAN ? CAN.C.UA : 0.3 + AX / 2)) / 2, 0, arm);
      else if (!CAN) { ell(0.092, 0.075, 0.3 + AX / 2 + 0.02, 12, 1, 1.05, COL.red, 0, -(0.3 + AX / 2) / 2, 0, arm); } else { const SL = 0.4 * CAN.C.UA, sl = ell(0.092, 0.086, SL + 0.01, 12, 1, 1.05, COL.red, 0, -SL / 2 + 0.005, 0, arm); { const pa = sl.geometry.attributes.position; let yt = -Infinity, r = 0; for (let i = 0; i < pa.count; i++) { yt = Math.max(yt, pa.getY(i)); r = Math.max(r, Math.abs(pa.getX(i))); } for (let i = 0; i < pa.count; i++) if (pa.getY(i) > yt - 1e-4) pa.setY(i, pa.getY(i) - 0.07 * Math.max(0, Math.min(1, (sx * pa.getX(i) + r) / (2 * r)))); pa.needsUpdate = true; sl.geometry.computeVertexNormals(); } cyl(0.094, 0.094, 0.03, 12, COL.gold, 0, -SL + 0.01, 0, arm); cyl(0.07, 0.066, CAN.C.UA - SL + 0.01, 12, new T.Color(COL.face).multiplyScalar(CAN.C.SKINK).getHex(), 0, -(CAN.C.UA + SL) / 2, 0, arm); if (sx > 0) { CAN.shoulderCone(T, torso, mat(COL.red), { yS: CAN.C.shY, Q }); /* 2026-10-29 ユーザー判断「戦士はok」（見比べ art_src/canon3d/v6/face_warrior/warrior_shoulder_plan.png）：肩当ての球はやめ、2D と同じく青い肩かけが肩の上と首の前をおおう（前の下の端は胸の上へ U の形に下げる）。袖は上うでの 4 割で金のふち（2D に合わせる）、その下は肌（C.SKINK） */ const mg = new T.SphereGeometry(1, Math.round(28 * Q), Math.round(8 * Q), 0, 2 * Math.PI, 0, Math.PI / 2); { const pa = mg.attributes.position; for (let i = 0; i < pa.count; i++) { const y = pa.getY(i), z = pa.getZ(i); if (y < 0.05 && z > 0) pa.setY(i, y - 0.8 * z * z); } mg.computeVertexNormals(); } const mm = new T.Mesh(mg, mat(COL.blue)); mm.material.side = T.DoubleSide; mm.scale.set(0.41, 0.11, 0.25); mm.position.set(0, CAN.C.shY - 0.05, 0); torso.add(mm); } }
      const fore = parts[sx < 0 ? 'foreR' : 'foreL'] = pivot(0, -(CAN ? CAN.C.UA : 0.3 + AX / 2), 0, arm);
      if (fine) sph(0.075, 1, 1, 1, CAN ? new T.Color(COL.face).multiplyScalar(CAN.C.SKINK).getHex() : COL.red, 0, 0, 0, fore);   // ひじ
      if (!fine) {
        box(0.145, 0.07, 0.165, COL.white, 0, -0.04, 0, fore);
        box(0.13, 0.17 + AX / 2, 0.15, (CAN ? COL.face : COL.skin), 0, -0.075 - (0.17 + AX / 2) / 2, 0, fore);
        box(0.145, 0.1, 0.16, COL.brown, 0, -0.27 - AX / 2, 0, fore);        // 手袋
      } else {
        if (CAN) { /* 前腕も 2D に合わせる（2026-10-29 ユーザー「前腕も2dに合わせる。肌の色も共通ルールに」）：茶色の革の腕当て（色は 2D の腕当て #9a5b37）・肌の手 */ cyl(0.07, 0.066, 0.08, 10, new T.Color(COL.face).multiplyScalar(CAN.C.SKINK).getHex(), 0, -0.04, 0, fore); cyl(0.08, 0.074, 0.21, 10, 0x9a5b37, 0, -0.175, 0, fore); sph(CAN.C.HAND, 1, 1.05, 1, new T.Color(COL.face).multiplyScalar(CAN.C.SKINK).getHex(), 0, CAN.C.HANDY, 0.01, fore); box(0.04, 0.07, 0.05, new T.Color(COL.face).multiplyScalar(CAN.C.SKINK).getHex(), 0, -0.27 - AX / 2, 0.08, fore); } else {
        cyl(0.075, 0.07, 0.08, 10, COL.red, 0, -0.04, 0, fore);               // 袖口
        cyl(0.07, 0.06, 0.17 + AX / 2, 9, (CAN ? COL.face : COL.skin), 0, -0.075 - (0.17 + AX / 2) / 2 - 0.02, 0, fore);   // 前腕（細く）
        cyl(0.078, 0.078, 0.06, 10, COL.white, 0, -0.17 - AX / 2, 0, fore);    // 手首の巻き布
        sph(CAN ? CAN.C.HAND : 0.085, 1, 1.05, 1, COL.brown, 0, CAN ? CAN.C.HANDY : -0.275 - AX / 2, 0.01, fore);     // こぶし
        box(0.04, 0.07, 0.05, COL.brownD, sx * 0.0, -0.27 - AX / 2, 0.08, fore); }   // 親指
      }
    }
    if (CAN) CAN.mountShield(parts, shield, 'L');   // v5.8：盾は左（+x）の前腕に。面は外（+x）へ、ひじから先と平行（ワルキューレと同じ）
    // 頭：首のうえ。顔・目・髪・兜（銀の丸い兜、ひさし、鼻当て、てっぺんの飾り）
    const FW = 0.42, FH = 0.31, FD = 0.34, FR = 0.06, FZ = 0.02, FY = 0.205, faceZ = () => FZ + FD / 2;   // 顔：角を丸めた箱を 1 つの曲面で（参考画像。2026-10-26 ユーザー判断）。faceZ＝顔の前の面の高さ
    const HY = fine ? 0.045 : 0;   // 細かい形は、兜を少し上げて、おでこと目を見せる
    const HSC = CAN ? CAN.C.HS : shp.head * (fine ? 1.3 * 0.81 : 1), NK = CAN ? CAN.C.NK : fine ? -0.03 : 0;   // 頭は 1 まわり小さく、首が見えるように頭を上へ（2026-10-26 ユーザー指摘「顔がデカすぎて首がない」）
    const head = parts.head = pivot(0, CAN ? CAN.C.headY : (fine ? 0.545 : 0.46) + NK, 0, torso); head.scale.setScalar(HSC);   // 細かい形は頭を大きく（2026-10-26 ユーザーの参考絵：顔を大きく見せる）。細かい形は、首が見えるように少し上
    if (CAN) CAN.buildHead(T, head, { mat, COL, Q, female: false, face: Object.assign({}, CAN.FACEM, W3('FACE')) });
    // （この直しは共通の buildHead に移した。2026-10-29）2026-10-29：共通の首の円柱（buildHead）の上の端を、顔の箱の中まで 0.04 のばす（僧侶・武闘家・魔法使い・エルフ・ワルキューレと同じ直し。戦士だけ無く、あごの下にうしろの髪が 1 行見えて首が見えなかった）
    { const WF = CAN && W3('FACE'); if (WF && WF.temple) { const y0 = 0.335, yT = 0.36 + WF.ext, z0 = -0.06, z1 = 0.17; for (const sx of [-1, 1]) box(0.05, yT - y0, z1 - z0, COL.hair, sx * (WF.FW / 2 + 0.01), (yT + y0) / 2, (z0 + z1) / 2, head); } }   // こめかみの髪（2026-10-29：額を兜の中へまっすぐのばした横の肌を、兜の下までおおう。無いと正面で額の上の角が髪の横から出て、斜めうしろの R1edge も増えた）
    const nHair0 = head.children.length;
    if (CAN) { const nh = new T.Mesh(new T.SphereGeometry(0.1, Math.round(10 * Q), Math.round(8 * Q)), mat(COL.hair)); nh.scale.set(2.0, 0.55, 1.6); nh.position.set(0, 0.12, -0.12); head.add(nh); { const n2 = new T.Mesh(new T.SphereGeometry(0.1, Math.round(10 * Q), Math.round(8 * Q)), mat(COL.hair)); n2.scale.set(N2.sx, N2.sy, N2.sz); n2.position.set(0, N2.y, N2.z); head.add(n2); } }   // v5.4：うなじの左右の肌（数画素）を髪でうめる（あごより上。正面に出ない）   // v5：うなじの肌の帯（背面で、髪の下とマントの上のあいだ）を髪でうめる
    else {
    if (!fine) box(0.4, 0.4, 0.4, COL.skin, 0, 0.2, 0.0, head);
    else {   // 顔は、角を丸めた箱を 1 つの曲面で（継ぎ目なし）。前の面は平ら
      const fg = new T.BoxGeometry(FW, FH, FD, 8, 8, 8), fa = fg.attributes.position, v = new T.Vector3(), c = new T.Vector3(), cl = (x, h) => Math.max(-h, Math.min(h, x));
      for (let i = 0; i < fa.count; i++) { v.fromBufferAttribute(fa, i); c.set(cl(v.x, FW / 2 - FR), cl(v.y, FH / 2 - FR), cl(v.z, FD / 2 - FR)); v.sub(c).normalize().multiplyScalar(FR).add(c); fa.setXYZ(i, v.x, v.y, v.z); }
      fg.computeVertexNormals(); const face = new T.Mesh(fg, mat(COL.face)); face.position.set(0, FY, FZ); head.add(face);
    }
    if (fine) {
      cyl(0.07, 0.085, 0.17 + NK / HSC, 10, COL.neck, 0, -0.06 - NK / (2 * HSC), 0, head);   // 首（頭の幅の 1/3 くらい。兜の下・肩の上に見える）
      const zf = faceZ() + 0.002;
      box(0.034, 0.04, 0.03, 0xe3a08c, 0, 0.2, zf, head);               // 鼻（小さな四角。すこしピンク）
      for (const sx of [-1, 1]) box(0.05, 0.14, 0.02, COL.eye, sx * 0.1, 0.265, zf, head);   // 目（黒い縦長の四角。兜のふちのすぐ下から。参考画像）
      box(0.075, 0.014, 0.02, 0xd8584c, 0, 0.12, zf, head); for (const sx of [-1, 1]) box(0.014, 0.014, 0.02, 0xd8584c, sx * 0.04, 0.131, zf, head);   // 口（小さな笑い）
    }
    }   // CAN でないとき、ここまで
    if (!fine) { for (const sx of [-1, 1]) box(0.06, 0.075, 0.02, COL.eye, sx * 0.1, 0.2, 0.205, head);   // 目
      box(0.07, 0.03, 0.02, 0xc7826a, 0, 0.1, 0.205, head); }        // 口
    if (!fine) {
      box(0.46, 0.34, 0.2, COL.hair, 0, 0.28, -0.14, head);          // 髪（うしろ・横）
      for (const sx of [-1, 1]) box(0.06, 0.18, 0.3, COL.hair, sx * 0.23, 0.22, -0.02, head);   // もみあげ
    } else if (CAN) {   // 共通の決まり（案 v3）：錣は、頭のうしろ・よこをおおう丸い 1 枚の帯（角ばった箱・板の継ぎ目をやめる。後ろ髪が「茶色の四角い箱」に見えるという指摘）
      const th0 = 105 * Math.PI / 180, thL = 150 * Math.PI / 180;   // 男性は髪を短く（耳の下まで）。うしろ・よこを、丸い面で（円筒の「バケツ」にしない）
      { const hg = new T.SphereGeometry(1, Math.round(24 * Q), Math.round(16 * Q)), hp = hg.attributes.position, ZC = -0.05, SZ = 0.26, SX = 0.275; for (let i = 0; i < hp.count; i++) { let z = ZC + hp.getZ(i) * SZ, x = hp.getX(i) * SX; if (z > 0.06) { z = 0.06; x = Math.max(-0.25, Math.min(0.25, x)); } hp.setX(i, x / SX); hp.setZ(i, (z - ZC) / SZ); } { const WH = W3('HELM'); if (WH && WH.flat) { const W = Math.round(24 * Q) + 1, NR = Math.round(16 * Q), eq = Math.floor(NR / 2); for (let r = 0; r <= NR; r++) for (let c = 0; c < W; c++) { const i = r * W + c, j = eq * W + c, xe = hp.getX(j), ze = hp.getZ(j), t = (r - eq) / (NR - eq), w = r < eq ? (WH.cyl ? 1 : Math.pow(Math.abs(Math.sin(Math.atan2(xe, ze))), 2)) : WH.cyl && r > eq ? Math.max(0, Math.min(1, (1 - t) / 0.3)) * Math.pow(Math.max(0, -ze) / (Math.hypot(xe, ze) || 1), 2) : 0; if (!w) continue; hp.setX(i, hp.getX(i) + (xe - hp.getX(i)) * w); hp.setZ(i, hp.getZ(i) + (ze - hp.getZ(i)) * w); if (r < eq) hp.setY(i, Math.min(hp.getY(i), WH.flat)); } } }   // cyl：うしろ頭も筒（2026-10-29 ユーザー「後頭部も同じように直す必要がある」）：上半分は全周、赤道の太さのまま兜の中まで、下半分もうしろ側だけ（真後ろほど強く）下の 3 割までまっすぐ下ろし、いちばん下だけ丸める（兜のふちの下で丸くふくらまない。横・前も下ろすと、歩きの正面であごの下に髪が出た）   // 側頭部は平ら（2026-10-29 ユーザー「側頭部は平らなので兜に向かって絞り込まない」）：上半分は、横（真横ほど強く）だけ赤道の太さのまま兜の下まで立ち上げる。うしろは丸いまま（後ろ頭がバケツに見える、の再発を防ぐ）。flat：上の端の高さ（単位球の y）
      hg.computeVertexNormals();   // 前半分は顔の箱の中へ平らにつぶす（髪が顔の前面・頬の外へ出ない。ユーザー指摘「顔の真ん中に茶色の丸」）
      const hr = new T.Mesh(hg, mat(COL.hair)); hr.scale.set(0.275, 0.19, 0.26); hr.position.set(0, 0.228, -0.05); head.add(hr); for (const sx of [-1, 1]) { const pc = new T.Mesh(new T.SphereGeometry(0.1, Math.round(10 * Q), Math.round(8 * Q)), mat(COL.hair)); pc.scale.set(1.3, 0.8, 1.7); pc.position.set(sx * 0.14, 0.15, -0.06); head.add(pc); } }   // v5.8b（窓口の指摘：後ろ頭が箱・バケツ、横線・突起）：後ろ頭は、兜の下の 1 つの丸い髪（楕円体）。錣の帯・横の箱・突起は使わない
    } else {   // 錣（しころ）：兜のうしろとよこに垂れる平らな板。髪ではない（2026-10-26 ユーザー指摘）。平らな板をぐるっと並べる
      for (const a of (CAN ? [110, 145, 180, 215, 250] : [75, 110, 145, 180, 215, 250, 285])) {   // 共通の決まり（案）：横から頬・目が見えるよう、顔のよこの 2 枚を除く（canon #3・#4）
       
        const r = 0.25, rad = a * Math.PI / 180, out = pivot(Math.sin(rad) * r, 0.34 + HY, -0.02 + Math.cos(rad) * r, head); out.rotation.y = rad;
        const tilt = pivot(0, 0, 0, out); tilt.rotation.x = -0.14;   // 下がすこし外へ開く
        const PL = CAN ? 0.36 : 0.3; box(0.2, PL, 0.03, COL.hair, 0, -PL / 2, 0, tilt); box(0.2, 0.025, 0.035, COL.gold, 0, -PL + 0.005, 0, tilt);   // 共通の決まり（案）：うしろから、頭の下に肌色が見えないよう、板を少し長く   // 板と、すその金のふち
      }
    }
    const nHelm0 = head.children.length;
    if (CAN) {   // v6（2026-10-27 ユーザー指示：ドット絵に近づける）：兜は暗めの灰色の鉄（ドット絵の #677781 あたり。白っぽい銀・金のふちはやめ、暗い鉄の帯に）。頭頂を前後に走る盛り上がり（しのぎ）と明るい線。鼻当ては付けない（v3）
      // 2026-10-29（ユーザー判断「戦士にも共通の仕組みを入れる」）：形は共通の canon.helm（金属の兜は全員これで作る）。戦士の値は Z1 のまま：横・前後を元の 1.25 倍＝scale [1.0625, 1, 0.9125]・z −0.017、すその帯の厚み 0.065（WAR.HELM）。見た目は前と画素まで同じ
      const WH = W3('HELM') || {}, k = WH.helm || [1, 1, 1, 0];
      root.RQ.lowpoly.canon.helm(T, head, { mat, Q, y: 0.33 + HY, z: -0.01 + (k[3] || 0), scale: k, th: WH.thick || 0.035, iron: HELM.iron, ridge: HELM.ridge, band: HELM.band });
    } else {
      const helm = new T.Mesh(new T.SphereGeometry(0.3, Math.round((fine ? 16 : 9) * Q), Math.round((fine ? 8 : 5) * Q), 0, Math.PI * 2, 0, Math.PI / 2), mat(COL.steel)); helm.position.set(0, 0.33 + HY, -0.01); helm.scale.set(1.0, 0.95, 1.02); head.add(helm);
      cyl(0.315, 0.315, fine ? 0.035 : 0.05, fine ? 16 : 10, fine ? COL.gold : COL.steelD, 0, 0.33 + HY, -0.01, head);   // ひさし（兜のふち）
      if (fine && !CAN) {
        const rim2 = new T.Mesh(new T.TorusGeometry(0.31, 0.022, 6, 20), mat(COL.gold)); rim2.rotation.x = Math.PI / 2; rim2.position.set(0, 0.355 + HY, -0.01); head.add(rim2);   // 兜のふちの金
        for (let i = 0; i < 3; i++) { const a = -0.8 + i * 0.8; box(0.025, 0.012, 0.012, COL.gold, Math.sin(a) * 0.3, 0.37 + HY, Math.cos(a) * 0.3 - 0.01, head); }
        box(0.05, 0.14, 0.24, COL.steelD, 0, 0.56, -0.01, head);   // てっぺんの飾りの下の段
      }
    }
    { const WH = CAN && W3('HELM'); if (WH && WH.hair) {   // 兜の下の髪を、顔の輪郭に合わせて縮める（武闘家の「着ぐるみに見えない」と同じ。2026-10-29）。hair：[x, y, z の倍率, z のずらし]、中心は頭の中ほど
      const wrap = (from, to, cy, cz, k) => { const g = new T.Group(); g.position.set(0, cy, cz); for (const o of head.children.slice(from, to)) { o.position.sub(g.position); g.add(o); } head.add(g); g.scale.set(k[0], k[1], k[2]); g.position.z += k[3] || 0; };
      wrap(nHair0, nHelm0, 0.2, -0.05, WH.hair); } }
    if (CAN) {   // 耳を出す（2026-11-02 ユーザー「戦士も耳を出して」：侍・傭兵と同じ＝耳の上で髪の下を削る）。髪は兜の下の包み（wrap）の中にあるので、頭の座標で削る
      const E = WAR.EAR; head.updateMatrixWorld(true); const Hi = new T.Matrix4().copy(head.matrixWorld).invert(), v = new T.Vector3();
      head.traverse(o => { if (!o.isMesh || o.name === 'helm' || o.parent.name === 'helm' || o.material.color.getHex() !== mat(COL.hair).color.getHex()) return; const M = new T.Matrix4().multiplyMatrices(Hi, o.matrixWorld), Mi = new T.Matrix4().copy(M).invert(), pa = o.geometry.attributes.position; let ch = 0;
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(M); if (Math.abs(v.x) > E.x && v.z > E.z && v.y < E.y) { v.y = E.y; v.applyMatrix4(Mi); pa.setXYZ(i, v.x, v.y, v.z); ch++; } } if (ch) o.geometry.computeVertexNormals(); });
      const SB = WAR.SB;   // もみあげ（同日「もみあげは2Dに合わせて」）：2D は耳の前を 1 ドットの細さで、目の下の高さまで下りる
      for (const sx of [-1, 1]) { const m = new T.Mesh(new T.BoxGeometry(SB.w, SB.y1 - SB.y0, SB.z1 - SB.z0), mat(COL.hair)); m.position.set(sx * SB.x, (SB.y0 + SB.y1) / 2, (SB.z0 + SB.z1) / 2); m.name = 'sideburn'; head.add(m); }
    }
    if (CAN) {   // 前髪（2026-11-02 ユーザー「前髪は中央1本」）：兜の下から額の前を通り、目と目の間に房を 1 本下ろす。顔の前の面に沿わせる。兜のふちが目のすぐ上にあり、額は見えない（カメラが少し上から）ので、見えるのは房だけ
      const F = Object.assign({}, CAN.FACEM, W3('FACE')), FRr = F.FR, FWw = F.FW, XT = F.ext || 0, FHh = 0.31 + XT, FYy = 0.205 + XT / 2, FZz = 0.02, FDd = 0.34;
      const surf = (x, y) => { const ax = Math.max(0, Math.abs(x) - (FWw / 2 - FRr)), ay = Math.max(0, Math.abs(y - FYy) - (FHh / 2 - FRr)); return FZz + FDd / 2 - FRr + FRr * Math.sqrt(Math.max(0, 1 - (ax / FRr) ** 2 - (ay / FRr) ** 2)); };
      const BG = WAR.BANG, BW = BG.w, TOP = BG.top, D1 = BG.d;
      const yb = x => { let y = BG.base; for (const [cx, ty, hw] of BG.spikes) if (Math.abs(x - cx) < hw) y = Math.min(y, ty + (BG.base - ty) * Math.abs(x - cx) / hw); return y; };   // 房の下の端（spikes：[x, 先の高さ, 半分の幅]）
      const bg = new T.BoxGeometry(BW, 1, 0.02, 76, 5, 1) /* 高さの分け方 5：顔の目鼻（fb は 6）と見分ける（check_bright） */, bp = bg.attributes.position;
      for (let i = 0; i < bp.count; i++) { const x = Math.max(-BW / 2 + 1e-6, Math.min(BW / 2 - 1e-6, bp.getX(i))), t = bp.getY(i) + 0.5, y0 = yb(x), y = y0 + t * (TOP - y0); bp.setXYZ(i, bp.getX(i), y, surf(x, y) + (bp.getZ(i) > 0 ? D1 : -0.01)); }
      bg.computeVertexNormals(); const bm = new T.Mesh(bg, mat(COL.hair)); bm.name = 'bangs'; head.add(bm);
    }
    if (!fine) box(0.055, 0.2, 0.035, COL.steelD, 0, 0.23, 0.21, head);       // 鼻当て（細かい形では付けない。2026-10-26 ユーザー指摘：灰色のパーツは不要）
    if (!CAN) box(0.05, 0.1, 0.3, COL.steelD, 0, 0.63, -0.01, head);   // てっぺんの飾り（canon v6 は、しのぎに置き換え）
    // 影の向き：すべての部品が影を受ける材質（toon）。シーンの光は呼ぶ側で用意する
    group.userData.parts = parts;

    // 動き：立ち・歩き・走り。t は秒。腰・膝（脚）と肩・ひじ（腕）の関節で曲げる（骨なし。部品の親子の回転）。回転の向きは、脚も腕も「＋＝うしろ」、膝は＋で足がうしろへ曲がる、ひじは－で手が前へ曲がる
    // 1 歩：接地（膝を少し曲げて沈む）→ 蹴り出し（脚がうしろへ）→ 脚をたたんで前へ運ぶ（膝を大きく曲げる）→ 次の接地。走りは両足が浮く。体の上下は、足の裏が地面に着くように脚の長さから決める（弾みは控えめ）
    // opt.stride：歩き・走りの 1 巡り（2 歩）で進む距離 m。あれば、足の振り幅を進む距離に合わせる（足が地面を滑らないように）
    const bendHem = () => {   // 前後の真ん中ほど大きく、脇ほど小さく持ち上げる（重み＝|z|/r を 0.55 で割って 1 まで。ももは脇寄り）。持ち上げたぶん長く（上限 1.15）
      const tr = torso.rotation.x, a = parts.legR.rotation.x - tr, b = parts.legL.rotation.x - tr, ang = { F: Math.min(0, a, b) * HEM.KF, B: Math.max(0, a, b) * HEM.KB };
      for (const { o, n, base } of hemList) { const A = ang[n], pa = o.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) { const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2], zr = z / HEM.WZ, r = Math.hypot(x, zr), w = r > 1e-6 ? Math.min(1, Math.abs(zr) / r / 0.55) : 0, t = A * w;
          if (t === 0) { pa.setXYZ(i, x, y, z); continue; }
          const ys = y * Math.min(1.15, 1 / Math.cos(t)), c = Math.cos(t), sn = Math.sin(t); pa.setXYZ(i, x, ys * c - z * sn, ys * sn + z * c); }
        pa.needsUpdate = true; o.geometry.computeVertexNormals(); } };
    // v6：canon のマント（1 枚の曲面）の形。①肩の高さを軸に、裾をうしろへなびかせる（走り・歩きで大きく、帯ごとに少しずつずらして揺らす）②脚・腕・盾・剣・チュニックの後ろの裾を、
    // 太さのある線（カプセル）として、その中に入った点を、背中から離れる向き（楕円の外向き）へ押し出す ③押し出した量を、となりの点へなだらかに広げる（とがった角にしない）④もう一度押し出す
    const deformCape = (run, walk, moving, ph, s, t) => {
      group.updateMatrixWorld(true);
      const v = new T.Vector3(), P = (o, x, y, z) => { v.set(x, y, z); o.localToWorld(v); torso.worldToLocal(v); return [v.x, v.y, v.z]; }, caps = [], cap = (p, q, R) => caps.push([p, q, R]);
      for (const k of ['L', 'R']) {
        cap(P(parts['leg' + k], 0, 0, 0), P(parts['shin' + k], 0, 0, 0), 0.125); cap(P(parts['shin' + k], 0, 0, 0), P(parts['foot' + k], 0, 0, 0), 0.14);   // もも・すね（長靴の折り返し 0.13）
        cap(P(parts['foot' + k], 0, -0.04, -0.03), P(parts['foot' + k], 0, -0.04, 0.23), 0.1);   // 足
        cap(P(parts['arm' + k], 0, 0.03, 0), P(parts['fore' + k], 0, 0, 0), 0.115); cap(P(parts['fore' + k], 0, 0, 0), P(parts['fore' + k], 0, -0.275 - AX / 2, 0.01), 0.1);   // 上うで・ひじから先と手
      }
      for (const k of [-1, 1]) cap([k * 0.3, 0.385, 0], [k * 0.33, 0.43, 0], 0.14);   // 肩（赤い肩の丸みがマントの上から出ない）
      for (const x of [-0.17, 0, 0.17]) { const h = Math.sqrt(0.29 * 0.29 - x * x) - 0.07; cap(P(parts.capeShield, x, -h, 0), P(parts.capeShield, x, h, 0), 0.09); }   // 盾（円盤を縦の 3 本で）
      cap(P(sword, 0, -0.15, 0), P(sword, 0, 0.84, 0), 0.08); cap(P(sword, 0, 0.115, -0.15), P(sword, 0, 0.115, 0.15), 0.05);   // 剣と、つば（金）
      { const tr = torso.rotation.x, A = Math.max(0, parts.legR.rotation.x - tr, parts.legL.rotation.x - tr) * HEM.KB;   // チュニックの後ろの裾（bendHem と同じ曲げ）
        const hp = (f, yf) => { const r = HEM.r0 + (HEM.r1 - HEM.r0) * Math.sin(Math.min(1, yf / 0.6) * Math.PI / 2), x = r * Math.sin(f), zr = -r * Math.cos(f), z = zr * HEM.WZ * 0.985, w = Math.min(1, Math.abs(zr) / r / 0.55), q = A * w, y = -HEM.len * yf * Math.min(1.15, 1 / Math.cos(q)); return [x, y * Math.cos(q) - z * Math.sin(q) + HEM.top, y * Math.sin(q) + z * Math.cos(q)]; };
        for (const yf of [0.5, 1]) for (let i = 0; i < 4; i++) cap(hp(-1.2 + i * 0.8, yf), hp(-0.4 + i * 0.8, yf), 0.04); }
      parts.capeMesh.deform(run ? 'run' : walk ? 'walk' : 'stand', t, caps);   // ①なびき ②押し出し ③なだらかに ④もう一度押し出し（hero3d_canon.js の capeSheet）
    };
    let ampS = null; const KK = CAN && CAN.KICK.warrior;
    function pose(mode, t, opt) {
      const run = mode === 'run', walk = mode === 'walk', moving = run || walk;
      const f = run ? 1.55 : 1.05, ph = t * Math.PI * 2 * f, s = Math.sin(ph), c = Math.cos(ph);
      let A = run ? 0.75 : 0.5;
      if (moving && opt && opt.stride > 0) {   // 1 歩の長さ（stride/2）＝ 2·脚の長さ·sin A（走りは宙に浮く分、振り幅を 65% に）
        const want = Math.asin(Math.min(1, opt.stride / (4 * (0.74 + LX) * (run ? 0.95 : 0.97)) * (run ? 0.65 : 1)));
        const tgt = Math.min(run ? 0.9 : 0.45, Math.max(run ? 0.45 : 0.2, want)); ampS = ampS == null ? tgt : ampS + (tgt - ampS) * 0.15; A = ampS;
      }
      const armA = run ? 0.95 : 0.5;
      const knee = (sg) => {   // 膝の曲がり：遊脚で大きく（折りたたむ）、接地後は少し（衝撃を受ける）
        if (!moving) return 0.02;
        const cs = sg * c, ss = sg * s;
        const swing = Math.max(0, -cs), load = Math.max(0, cs) * Math.max(0, -ss);
        return CAN ? (run ? (window.__WKN != null ? window.__WKN : 0.9) * Math.pow(swing, 0.8) + 0.35 * load : 0.7 * Math.pow(swing, 0.9) + 0.15 * load) : run ? 1.9 * Math.pow(swing, 0.8) + 0.5 * load : 0.85 * Math.pow(swing, 0.9) + 0.18 * load;
      };
      let lowest = 0; const hipRef = 0.74 + LX;   // lowest＝足の裏が腰から下がる長さの、長いほう（地面に着いているほうの足）
      for (const [leg, shin, sg] of [[parts.legR, parts.shinR, 1], [parts.legL, parts.shinL, -1]]) {
        const th0v = moving ? sg * s * A + (run ? 0 : 0.04) : 0, th = CAN && run ? Math.min(Math.max(th0v, -0.45), window.__THB != null ? window.__THB : 0.6) : th0v, kn = run && KK ? CAN.kick(knee(sg), ph, sg, KK) : knee(sg);   /* v5.2：canon は、走りで脚を前へ 0.55 より上げない（ももがチュニックの前へ出ない） */
        leg.rotation.x = th; shin.rotation.x = kn;
        const foot = sg > 0 ? parts.footR : parts.footL; if (foot) foot.rotation.x = run && KK ? CAN.footAlong(th, kn) : -(th + kn) * (run ? 0.75 : 1);   // KK：走りの蹴り上げ（hero3d_canon.js）
        const reach = KN * Math.cos(th) + (SH - 0.08) * Math.cos(th + kn) + 0.11;   // 足の裏の、腰からの下がり（足の裏は平ら）
        lowest = Math.max(lowest, reach);
      }
      // 体の高さ：足の裏が着くように（弾みは控えめに ＝ 差の半分だけ従う）。止まっているときは 0
      const nominal = baseY, kk = run ? 0.5 : 0.8;   // 着いているほうの足の裏が地面より下に入らない（浮くのは、走りの両足が浮くときと、歩きの小さな弾みだけ。2026-10-26 ユーザー指摘：地面に埋まって見える）
      body.position.y = moving ? baseY + (lowest - nominal) * kk : baseY + Math.sin(t * 2.0) * 0.008;
      // 腕：脚と逆に振る。ひじは、腕が前にあるとき深く曲がる（走りは深く、歩きは浅く）
      for (const [arm, fore, sg] of [[parts.armR, parts.foreR, 1], [parts.armL, parts.foreL, -1]]) {
        const ar = moving ? -sg * s * armA : 0.02 * sg * Math.sin(t * 1.7);
        arm.rotation.x = ar;
        const fwd = Math.max(0, -ar) / armA;
        fore.rotation.x = run ? -1.25 - 0.4 * fwd : walk ? -0.2 - 0.35 * fwd : -0.1;
      }
      if (CAN) CAN.holdShield(parts, 'L');   // 盾の腕（左）はかまえて止める（共通の盾を持つ腕 canon.holdShield）。剣の腕（右）は、腕の振りと一緒に、剣を垂直に持つ（holdGrip）
      else { parts.armR.rotation.z = -0.26; parts.armL.rotation.z = 0.26; }   // 手を体から離す（2026-10-26 ユーザー指摘）
      torso.rotation.x = run ? 0.28 : walk ? 0.05 : 0; torso.rotation.y = moving ? s * (run ? 0.2 : 0.1) : 0; body.rotation.x = 0;
      head.rotation.x = run ? -0.22 : 0; head.rotation.y = moving ? -s * (run ? 0.1 : 0.05) : 0;
      if (!CAN) { cape.rotation.x = (run ? 0.5 : walk ? 0.18 : 0.04) + (moving ? Math.sin(ph * 2 + 0.6) * (run ? 0.12 : 0.05) : Math.sin(t * 1.3) * 0.02); cape.rotation.z = moving ? s * 0.06 : 0; }
      if (hemList.length) bendHem();
      if (CAN && grip) grip();   // 胴のひねり・頭・マントを決めたあと（持ち物の向きは、最後の姿勢から決める）
      if (CAN && parts.capeMesh) deformCape(run, walk, moving, ph, s, t);   // 持ち物・腕を決めたあとで、マントの形を決める
    }
    // 前の動き（関節なし。比べ用。opt.joints === false）
    function poseOld(mode, t) {
      const run = mode === 'run', walk = mode === 'walk', moving = run || walk;
      const f = run ? 1.55 : 1.05, ph = t * Math.PI * 2 * f, s = Math.sin(ph), c = Math.cos(ph);
      const A = run ? 1.0 : 0.55, armA = run ? 1.05 : 0.5;
      parts.legR.rotation.x = moving ? s * A : 0; parts.legL.rotation.x = moving ? -s * A : 0; parts.shinR.rotation.x = parts.shinL.rotation.x = 0;
      for (const [leg, sg] of [[parts.legR, 1], [parts.legL, -1]]) leg.position.y = moving ? Math.max(0, -sg * s) * (run ? 0.12 : 0.05) : 0;
      parts.armR.rotation.x = moving ? -s * armA : 0.02 * Math.sin(t * 1.7); parts.armL.rotation.x = moving ? s * armA : -0.02 * Math.sin(t * 1.7);
      parts.armR.rotation.z = 0.08; parts.armL.rotation.z = -0.08;
      parts.foreR.rotation.x = run ? -1.15 - Math.max(0, -s) * 0.3 : walk ? -0.25 : -0.1; parts.foreL.rotation.x = run ? -1.15 - Math.max(0, s) * 0.3 : walk ? -0.25 : -0.1;
      body.position.y = baseY + (moving ? Math.abs(c) * (run ? 0.09 : 0.045) : Math.sin(t * 2.0) * 0.008);
      torso.rotation.x = 0; body.rotation.x = run ? 0.3 : walk ? 0.05 : 0; torso.rotation.y = moving ? s * (run ? 0.2 : 0.1) : 0;
      head.rotation.x = run ? -0.22 : 0; head.rotation.y = moving ? -s * (run ? 0.1 : 0.05) : 0;
      cape.rotation.x = (run ? 0.75 : walk ? 0.18 : 0.04) + (moving ? Math.sin(ph * 2 + 0.6) * (run ? 0.12 : 0.05) : Math.sin(t * 1.3) * 0.02);
      cape.rotation.z = moving ? s * 0.06 : 0;
    }
    let grip = null;
    const posef = opt0.joints === false ? poseOld : pose;
    posef('stand', 0);
    if (CAN) { grip = CAN.holdGrip(T, group, parts, { side: 'R', prop: sword, buttY: null }); posef('stand', 0); }   // v5.8：剣を右手に
    return { group, parts, pose: posef };
  }


  // ---- 小さな画面に描いて、板に貼る ----
  const PXH = PX, PXW = Math.round(PX * 52 / 64), FRUST = 2.2;   // 画面の大きさ（ドット）と、画面に入る高さ（m。戦士 1.8 m の足の下に 0.1 m・頭の上に 0.3 m の余白）
  const MIN_HEMI = 0.8, MIN_SUN = 0.3;
  const builderOf = id => RQ.lowpoly && ({ wizard: RQ.lowpoly.buildWizard, monk: RQ.lowpoly.buildMonk, priest: RQ.lowpoly.buildPriest, valkyrie: RQ.lowpoly.buildValkyrie, elf: RQ.lowpoly.buildElf, samurai: RQ.lowpoly.buildSamurai, mercenary: RQ.lowpoly.buildMercenary })[id];   // 職業ごとの 3D の組み立て（読み込まれているものだけ）
  const sharedTools = {};   // ゴースト用に共有する描く道具（描く高さ px ごと）
  // 色違い（2026-10-28 ユーザー指示。色の表は game/herocolors.js）：組み立てたあとに、部品の色・頂点の色・自分で光る色を替える（形は変えない）。
  // pr：[元の色, 替える色, 範囲（'m' 部品・'v' 頂点。無し＝両方）] の並び。色ごとに、どの明るさ（EXPO・影・光る色の倍率）でも「元の色の k 倍＋ずれ」として、ずれのいちばん小さい元の色に当て、「替える色の k 倍＋同じずれ」にする（マントの青〜暗い青のような間の色も、元の色に近い向きで替わる）。
  // 当たらない（ずれが TOL より大きい）色はそのまま。同じ材質・同じ形（頂点の色）は 1 回だけ替える。描くときの手間は増えない（作るときに 1 回）
  function recolor(T, hero, pr) {
    const TOL = 0.08, P = pr.map(([s, d, sc]) => ({ s: new T.Color(s), d: new T.Color(d), sc, same: s === d })), n2 = c => c.r * c.r + c.g * c.g + c.b * c.b;
    const f = (c, sc) => {
      const cn = Math.sqrt(n2(c)); if (cn < 1e-4) return c;
      let best = null, br = TOL;
      for (const p of P) {
        if (p.sc && p.sc !== sc) continue;
        if (best && best.p.sc && !p.sc) continue;
        const k = (c.r * p.s.r + c.g * p.s.g + c.b * p.s.b) / n2(p.s); if (!(k > 0.1 && k < 1.6)) continue;
        const rx = c.r - k * p.s.r, ry = c.g - k * p.s.g, rz = c.b - k * p.s.b, r = Math.sqrt(rx * rx + ry * ry + rz * rz) / cn;
        if (r < br || (best && !best.p.sc && p.sc && r < TOL)) { br = r; best = { p, k, rx, ry, rz }; }   // 範囲つきの色（'v' のマントなど）が当たるなら、範囲なしの色（鎧の灰色を替えない keep など）より先に（白〜灰色の間の色が鎧の灰色に当たって白い筋が残った）
      }
      if (best && !best.p.same) { const { p, k, rx, ry, rz } = best, cl = v => Math.min(1, Math.max(0, v)); c.setRGB(cl(k * p.d.r + rx), cl(k * p.d.g + ry), cl(k * p.d.b + rz)); }
      return c;
    };
    const seenM = new Set(), seenG = new Set(), tc = new T.Color();
    hero.group.traverse(o => {
      if (!o.isMesh) return;
      const sc = o.geometry && o.geometry.attributes.color ? 'v' : 'm';   // 頂点の色を持つ形（マント・ローブの曲面）の裏の材質も 'v'（ワルキューレのマントの裏の灰色は、鎧の灰色と同じ色なので）
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || seenM.has(m)) continue; seenM.add(m);
        if (m.color && !m.vertexColors) f(m.color, sc);
        if (m.emissive) f(m.emissive, sc);
      }
      const g = o.geometry, ca = g && g.attributes.color;
      if (ca && !seenG.has(g)) { seenG.add(g); const a = ca.array, memo = new Map();   // 頂点の色は同じ色がくり返すので、色ごとに 1 回だけ計算（魔法使いのローブで 94 → 数 ms）
        for (let i = 0; i < a.length; i += 3) { const key = a[i] + ',' + a[i + 1] + ',' + a[i + 2]; let q = memo.get(key); if (!q) { tc.setRGB(a[i], a[i + 1], a[i + 2]); f(tc, 'v'); memo.set(key, q = [tc.r, tc.g, tc.b]); } a[i] = q[0]; a[i + 1] = q[1]; a[i + 2] = q[2]; }
        ca.needsUpdate = true; }
    });
    if (hero.parts.recolor) hero.parts.recolor(c => f(c, 'v'));   // 毎コマ塗り直す頂点の色（僧侶のローブの前の帯）
  }
  const enabled = { on: true };
  const api3 = {
    get enabled() { return enabled.on; }, set enabled(v) { enabled.on = !!v; },
    available: heroId => heroId === 'warrior' || !!builderOf(heroId),   // 3D にする職業（2026-10-26 ユーザー判断：4 人とも）
    PXH, PXW,
    // heroH：主人公の背の高さ（view3d.js の HERO_H）。返り値の tex を板の材質の map に、w・h（板の大きさ m）・pad（足の下の余白の割合。Sprite の center.y）を使う
    create(T, { heroH = 1.8, shape, joints, fine = FINE, px = PX, steps = STEPS, outline = OUTLINE, q, builder, heroId, shared = false, canon = true, variant = 0 } = {}) {   // canon：共通の決まり（docs/3d-canon/canon.md）で組み立てる。2026-10-27 からゲームの既定（ユーザー指示）。false で前の見た目（比べ用）   // shared：ゴースト用。描く道具（WebGL の文脈・縁取りの絵）を全員で1つ共有し、できた絵は人ごとの 2D の canvas に写す（人数が増えても文脈は増えない）   // builder：別の職業の組み立て関数（魔法使いなど）。無ければ戦士   // px：描く高さ（ドット。比べ用に 96・128 も）。fine：細かい形（比べ用）
      const PXH = px, PXW = Math.round(px * 52 / 64);
      const SHD = shared ? (sharedTools[px] = sharedTools[px] || { n: 0 }) : null;
      const pr = SHD && SHD.pr || new T.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true }); if (!SHD || !SHD.pr) { pr.setSize(PXW, PXH, false); pr.setClearColor(0x000000, 0); }
      if (SHD) { SHD.pr = pr; SHD.n++; }
      const ps = new T.Scene(), hemi = new T.HemisphereLight(0xdfefff, 0x4a5a3a, 0.85), sun = new T.DirectionalLight(0xffffff, 0.75); ps.add(hemi, sun);
      const pcam = new T.OrthographicCamera(-FRUST / 2 * PXW / PXH, FRUST / 2 * PXW / PXH, 1.0, -1.2, 0.1, 20); pcam.position.set(0, 0, 6); pcam.lookAt(0, 0, 0);   // 高さ -1.2〜1.0 → 戦士は足が y=-1.1（余白 0.1 m）
      const hero = (builder || builderOf(heroId) || build)(T, { toon: true, canon, shape: shape || SHAPE, joints, fine, steps, q: q || (px >= 160 ? 1.7 : px >= 128 ? 1.35 : 1) }); hero.group.position.y = -1.1; ps.add(hero.group);
      const pal = variant && root.RQ.heroColors && root.RQ.heroColors.pairs(heroId || 'warrior', variant); if (pal) recolor(T, hero, pal);   // variant：色違い 1〜3（旅人・ゴースト。0＝元の色＝自分の主人公）
      // まわりの縁：別の絵（RT）に描いてから、1 ドット外がわに暗い縁を付けて canvas に写す（GPU のみ。読み戻さない）
      let rt = null, qs = null, qc = null;
      if (outline && SHD && SHD.rt) { rt = SHD.rt; qs = SHD.qs; qc = SHD.qc; }
      else if (outline) {
        rt = new T.WebGLRenderTarget(PXW, PXH, { minFilter: T.NearestFilter, magFilter: T.NearestFilter, format: T.RGBAFormat }); qc = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1); qs = new T.Scene();
        qs.add(new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: { t: { value: rt.texture }, px: { value: new T.Vector2(1 / PXW, 1 / PXH) } },
          vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 0., 1.); }',
          fragmentShader: 'uniform sampler2D t; uniform vec2 px; varying vec2 v; void main(){ vec4 c = texture2D(t, v); float n = max(max(texture2D(t, v + vec2(px.x, 0.)).a, texture2D(t, v - vec2(px.x, 0.)).a), max(texture2D(t, v + vec2(0., px.y)).a, texture2D(t, v - vec2(0., px.y)).a)); if (c.a > 0.4) gl_FragColor = vec4(c.rgb, 1.); else if (n > 0.4) gl_FragColor = vec4(0.11, 0.08, 0.14, 1.); else gl_FragColor = vec4(0.); }' })));
      }
      if (SHD && rt && !SHD.rt) { SHD.rt = rt; SHD.qs = qs; SHD.qc = qc; }
      let cv2 = null, cx2 = null; if (SHD) { cv2 = document.createElement('canvas'); cv2.width = PXW; cv2.height = PXH; cx2 = cv2.getContext('2d'); }
      const tex = new T.CanvasTexture(cv2 || pr.domElement); tex.magFilter = T.NearestFilter; tex.minFilter = T.NearestFilter; tex.generateMipmaps = false;
      const k = heroH / 1.8, up = new T.Vector3(0, 1, 0), v = new T.Vector3();
      let tris = 0; hero.group.traverse(o => { if (o.geometry) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
      return {
        tris, px, hero, variant: pal ? variant : 0,   // hero：確かめの道具（tools/lowpoly_hero/check_bright.js）が部品を見る
        tex, w: FRUST * PXW / PXH * k, h: FRUST * k, pad: 0.1 / FRUST,
        // mode：'stand' | 'walk' | 'run'、gait：歩き・走りの 1 巡り（2 歩）を 1 とした進み、relYaw：戦士の向き H −（戦士から見たカメラの向き C）、L：島の光 { hemi, sun, C }
        draw(mode, gait, relYaw, L, stride) {
          const f = mode === 'run' ? 1.55 : 1.05;   // pose の 1 巡りの速さ（pose は t 秒で ph = t·2π·f）。gait は 1 巡り＝1 なので t = gait / f
          hero.pose(mode, gait / f, { stride }); hero.group.rotation.y = relYaw; { const hd = hero.parts.head, fx = hd && hd.userData && hd.userData.faceFx; if (fx) fx(); }   // canon：顔がそっぽを向くコマでは目・鼻・口を出さない（buildHead）
         
          if (L) {
            // 夜でも見えるように、光の強さに下限を置く（2D の板は光を受けないので、夜も同じ明るさで見える。決まり：夜でも道・主人公が見える明るさ）
            hemi.color.copy(L.hemi.color); hemi.groundColor.copy(L.hemi.groundColor); hemi.intensity = Math.max(L.hemi.intensity, MIN_HEMI);
            sun.color.copy(L.sun.color); sun.intensity = Math.max(L.sun.intensity, MIN_SUN); v.copy(L.sun.position).applyAxisAngle(up, -L.C); sun.position.copy(v);   // 光の向きも、カメラから見た向きに回す
          }
          if (rt) { pr.setRenderTarget(rt); pr.render(ps, pcam); pr.setRenderTarget(null); pr.render(qs, qc); } else pr.render(ps, pcam);
          if (cx2) { cx2.clearRect(0, 0, PXW, PXH); cx2.drawImage(pr.domElement, 0, 0); }
          tex.needsUpdate = true;
        },
        dispose() { tex.dispose(); if (SHD) { if (--SHD.n <= 0) { if (SHD.rt) SHD.rt.dispose(); SHD.pr.dispose(); delete sharedTools[px]; } } else { if (rt) rt.dispose(); pr.dispose(); } ps.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.gradientMap) o.material.gradientMap.dispose(); o.material.dispose(); } }); },
      };
    },
  };
  const RQ = root.RQ = root.RQ || {};
  RQ.lowpoly = { build, COL, SHAPES };
  api3.recolor = recolor;
  RQ.hero3d = api3;
  if (typeof module !== 'undefined' && module.exports) module.exports = { build, COL };
})(typeof window !== 'undefined' ? window : globalThis);
