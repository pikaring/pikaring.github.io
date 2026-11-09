/* 魔法使い（女性）のローポリ 3D（2026-10-26 ユーザー依頼。まだゲームに入れない＝ index.html には入れていない）。
   戦士（hero3d.js）と同じ作り：three.js の円柱・球・箱を組み合わせ、部品の回転で 立ち・歩き・走り（腰・膝・肩・ひじの関節）。体のつり合いは戦士の案 B と同じ（脚 ×1.4・腕 ×1.35・頭 ×0.9×1.3）。
   今のドット絵に合わせた：金髪の長い髪、金のふちの紫の円すいの帽子（先が曲がる）、金のふちの紫のローブ、斜めがけの茶色の帯、背中にななめに背負った杖（ピンクの玉）、茶色の長靴。
   使い方：RQ.lowpoly.buildWizard(T, { toon, steps, q }) → { group, parts, pose(mode, t, opt) }。RQ.hero3d.create(T, { builder: RQ.lowpoly.buildWizard }) で、戦士と同じ板にできる。
   前提：hero3d.js を先に読む（色 COL と、高さをそろえる基準に戦士の build を使う）。 */
(function (root) {
  const RQ = root.RQ = root.RQ || {};
  const L = () => RQ.lowpoly;
  const PAL = { robe: 0x7a3fb8, robeD: 0x5a2c90, gold: 0xe2b341, hair: 0xf0b21f, hairIn: 0xcf9618, boot: 0x6b4424, bootD: 0x4d301a, strap: 0x7a4f2a, staff: 0x80512a, gem: 0xe84c93, eye: 0x241812, nose: 0xe3a08c, mouth: 0xd8584c };
  // 正面の顔・髪と帽子の合わせ方・頭の下げ方（2026-10-29 顔の直し。docs/3d-canon/canon.md「正面の顔」）。null は今の形。比べ用に window.__WIZARDFACE・__WIZARDHAIR・__WIZARDHAT・__WIZARDHEAD（tools/lowpoly_hero/face_monk.js）
  // 2026-10-29 ユーザー判断：案 E2＝武闘家と同じ女性の顔（まつ毛は目の上の外側に 1 つ：額が見えると 2 つでは怒った眉に見えた。目の左右の位置 0.088：0.093 だと歩き・走りで目の幅・白い点の RULE が 1 コマ出た）・顔の幅 0.37。頭の上半分は筒（額は顔の箱の ext でまっすぐ帽子の中へ・うしろ髪も全周まっすぐ・前髪なし・こめかみの髪）。帽子の帯といちばん下の円すいのすそは 1.08 倍（どの向きでも、こめかみ・髪より大きい。0.91 倍ではこめかみが帯の外へはみ出した）、つば・帯を 0.05 下げる（先の高さは同じ）。帯の色は朱（金だと金髪と、紫だと帽子と色がかぶる。2026-10-29 ユーザー判断）。頭を 0.015 下げる（背・帽子の先は合わせ直さない）
  const WIZ = { FACE: {eye: {x: 0.088}, lash: 'one', FRt: 0.095, ext: 0.09},   /* 女性の共通の顔（canon.FACEF）に重ねる例外（lash 'one'＝canon.LASH1、FRt＝FR＝顔の上の角は丸いまま） */ HAIR: {k: [0.88, 1.0, 0.94], cz: -0.018, side: 0.215, back: 0.03, flat: true, cyl: true}, HAT: { band: 1.08, drop: 0.05, color: 0xe8642a, tilt: 0.15 }, STAFF: { gap: 0.06 }, HEAD: { down: 0.015 } };
  const W3 = k => (typeof window !== 'undefined' && window['__WIZARD' + k]) || WIZ[k];

  function buildWizard(T, opt = {}) {
    const toon = opt.toon !== false, ST = opt.steps || 5, Q = opt.q || 1, CAN = opt.canon && L().canon ? L().canon : null;   // CAN：共通の決まり（案。docs/3d-canon/canon.md）。付けたときだけ使う（ゲームの見た目は、まだ変えない）
    const WF = CAN ? CAN.face(CAN.FACEF, W3('FACE')) : null;   // 女性の共通の顔（canon.FACEF）に、魔法使いの例外を重ねる
    const FA = CAN ? 0.0675 : 0;   // 共通の決まりでは、ひじ〜手の中心が戦士と同じ（0.3275）。そのぶん袖を伸ばす
    const sh = { leg: 1.4, arm: 1.35, head: 0.9 * 1.3 };   // 戦士の案 B と同じ
    const FHP = CAN ? CAN.C.FHIP : 0, LX = 0.74 * (sh.leg - 1) + FHP, AX = 0.3 * (sh.arm - 1), KN = (0.74 + LX) * 0.5, SH = 0.74 + LX - KN, baseY = 0.74 + LX + 0.03;
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
    // 脚：ローブの下から長靴が見える
    for (const sx of [-1, 1]) {
      const leg = parts[sx < 0 ? 'legL' : 'legR'] = pivot(sx * (CAN ? CAN.C.legX : 0.12), 0, 0, body);
      ell(0.085, 0.07, KN + 0.02, 10, 1, 1, PAL.robeD, 0, -KN / 2, 0, leg);
      const shin = parts[sx < 0 ? 'shinL' : 'shinR'] = pivot(0, -KN, 0, leg);
      ell(0.075, 0.07, 0.13, 10, 1, 1, PAL.robeD, 0, -0.065, 0, shin);
      if (CAN) {   // v6.9（2026-10-27 ユーザー指摘「靴の内部が見えて、足のパーツがないことが分かってしまう。長靴を長くすると解決するのでは」）：長靴をひざのすぐ下（0.02）まで伸ばす。走りで裾が上がっても、長靴の口と、その上の細いすねの部品が見えない
        cyl(0.1, 0.085, SH - 0.01, 14, PAL.boot, 0, -(SH + 0.03) / 2, 0.005, shin);
        cyl(0.103, 0.103, 0.03, 14, PAL.gold, 0, -0.035, 0.005, shin);                         // 長靴の上の金のふち
        sph(0.098, 1, 0.8, 1, PAL.boot, 0, -0.02, 0.005, shin, 12, 8);                           // 長靴の口をふさぐ（後ろへ蹴ったとき、ひざの所に口と中の暗い色が見えた）
      } else {
      cyl(0.1, 0.085, SH - 0.1, 14, PAL.boot, 0, -(SH + 0.12) / 2 - 0.005, 0.005, shin);   // 長靴（ふくらはぎまで。裾がこの上に乗る。今のドット絵のとおり）
      cyl(0.103, 0.103, 0.03, 14, PAL.gold, 0, -0.13, 0.005, shin);                          // 長靴の上の金のふち
      }
      const foot = parts[sx < 0 ? 'footL' : 'footR'] = pivot(0, -(SH - 0.08), 0, shin);
      sph(0.1, 1, 0.7, 1.4, PAL.bootD, 0, -0.03, 0.09, foot);                              // つま先
      box(0.17, 0.035, 0.26, PAL.bootD, 0, -0.085, 0.06, foot);                            // 靴底
    }
    // ローブ：腰から裾へ広がる。金のふちと、前の金の線
    const len = baseY - 0.02 - (CAN ? 0.24 : 0.13);   // 共通の決まり（案 v5）：ローブの丈をふくらはぎの中ほどまで（脚に押される量を減らす）
    const skirt = parts.skirt = pivot(0, 0.02, 0, body);
    // ローブの裾は 1 枚の曲面（頂点の色で、裾の金のふちと前の金の線を塗る）。歩き・走りで、脚の動きに合わせて裾が跳ね上がり、脚がつき抜けないように毎コマ形を変える（2026-10-26 ユーザー指摘）
    const SK_SEG = CAN ? 144 : 44, SK_H = CAN ? 24 : 16, SKZ = 0.9;   // 裾は今のドット絵のようにせまく（ふくらはぎが当たって押し上げられる）
    const skg = new T.CylinderGeometry(CAN ? 0.15 : 0.2, CAN ? 0.32 : 0.31, len, SK_SEG, SK_H, true).toNonIndexed(), skp = skg.attributes.position, sk0 = Float32Array.from(skp.array), skc = new Float32Array(skp.count * 3);   // 三角形ごとに色を塗る（金のふちをくっきり）
    // 共通の決まり（v6）：前の金の線は、向き（正面から ±0.3 rad）で決め、裾の円周に沿った幅（0.016 u）で塗る。三角形が細かい（144 分割）ので、x のずれで塗ると 1 列おきに抜けて、ぎざぎざ・途切れた線になっていた（v5.1 の 2030cfc から）。裾の形を変えても頂点は向きを保つので、線はつながったまま
    const frontLine = (x, z, t) => { if (z <= 0) return false; const r = Math.hypot(x, z), a = Math.abs(Math.atan2(x, z)); return Math.abs(a - 0.3) * r < 0.016; };
    { const cr = new T.Color(PAL.robe), cg = new T.Color(PAL.gold);
      for (let f = 0; f < skp.count; f += 3) {
        let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += sk0[(f + k) * 3] / 3; cy += sk0[(f + k) * 3 + 1] / 3; cz += sk0[(f + k) * 3 + 2] / 3; }
        const t = (len / 2 - cy) / len, front = CAN ? frontLine(cx, cz * SKZ, t) : cz > 0 && Math.abs(Math.abs(cx) - 0.085 * (0.45 + 0.55 * t)) < 0.014 * (0.5 + t), c = t > 0.945 || (front && t < 0.99) ? cg : cr;   // 裾の金のふち、前の金の線
        for (let k = 0; k < 3; k++) { skc[(f + k) * 3] = c.r; skc[(f + k) * 3 + 1] = c.g; skc[(f + k) * 3 + 2] = c.b; } } }
    skg.setAttribute('color', new T.BufferAttribute(skc, 3));
    const skm = new T.Mesh(skg, toon ? new T.MeshToonMaterial({ color: new T.Color(0xffffff).multiplyScalar(0.74), gradientMap: grad, vertexColors: true, side: T.FrontSide }) : new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: T.FrontSide }));
    skm.position.set(0, -len / 2, 0); skm.scale.set(1, 1, SKZ); skirt.add(skm);
    const skin = new T.Mesh(skg, mat(CAN ? 0x6a38a8 : 0x2c1650).clone()); skin.material.side = T.BackSide; if (CAN && skin.material.emissive) skin.material.emissive = new T.Color(PAL.robe).multiplyScalar(0.5); skin.position.copy(skm.position); skin.scale.copy(skm.scale); skirt.add(skin);   // ローブの内側は暗い色（2026-10-26 ユーザー依頼）   // v7.1：ローブの内がわは光の裏で暗くなり、走りで後ろの裾が上がると、門の奥が暗い穴（ズボン）に見えた（別の目のレビュー）。ローブの色を半分だけ自分で光らせて、布の色に見せる（形は変えない）
    const fillers = [];   // スリットの裏の脇の布（裾を持ち上げるとき、同じ割合で縮める）
    const SLIT = 68 * Math.PI / 180, FILW = 14 * Math.PI / 180;   // v6.7：ひざより下の前・後ろの板の幅（正面・真後ろから ±68°。裾で長靴は ±50° の中にあるので、スリットと脇の布が長靴にかからない。±50° では長靴がスリットからのぞいた）、スリットの裏の脇の布の半幅
    if (CAN) {   // v6.7：スリットの裏の脇の布（4 本。まっすぐ下がる。半径は裾の 0.96 倍＝前・後ろの板の内がわ）。スリットが開いても、脚・布の裏でなく、ローブの紫が見える
      const rAt = t => 0.15 + (0.32 - 0.15) * t, yK = -0.02 - KN, NA = 6, NY = 8, cR = new T.Color(PAL.robe);
      for (const [c0, hw, rk] of [[SLIT, FILW, 0.96], [-SLIT, FILW, 0.96], [Math.PI - SLIT, FILW, 0.96], [-(Math.PI - SLIT), FILW, 0.96], [Math.PI, 0.28, 0.7]]) {   // 最後の 1 枚（v7.2）：両足のあいだの後ろの布（真後ろ ±0.28 rad、半径 0.7 倍、ひざから裾まで）。走りで後ろの裾が門の形に上がったとき、中が見えてズボンに見えた（別の目のレビュー・窓口の判断 案 C）。脚（±0.145）は通らない
        const pos = [], col = [], idx = [];
        for (let j = 0; j <= NY; j++) { const y = yK + (-len - yK) * j / NY, t = -y / len, r = rAt(t) * rk;
          for (let i = 0; i <= NA; i++) { const a = c0 - hw + 2 * hw * i / NA; pos.push(r * Math.sin(a), y, r * Math.cos(a) * SKZ); col.push(cR.r, cR.g, cR.b); } }   // 縁は金にしない（スリットのすき間から金が 1〜2 ドットの点でのぞき、汚れに見えた）
        for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
        const m = new T.Mesh(g, toon ? new T.MeshToonMaterial({ color: new T.Color(0xffffff).multiplyScalar(0.74), gradientMap: grad, vertexColors: true, side: T.DoubleSide }) : new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: T.DoubleSide }));
        m.userData.back = Math.cos(c0) < 0; skirt.add(m); fillers.push(m);
      }
    }
    const flaps = [], WRAP = 0.3;   // v7.5：前・後ろの板の左右の端から内がわへ巻き込む細い布（4 枚。板の端から、真ん中へ向かって半径の WRAP 倍まで）。板が脚と一緒に回ると、脇とのあいだのすき間から奥の長靴が縦の線に見えた（窓口 2026-10-27。横・斜め前）
    if (CAN) for (const [rg, sg] of [[1, -1], [1, 1], [2, -1], [2, 1]]) { const m = new T.Mesh(new T.BufferGeometry(), toon ? new T.MeshToonMaterial({ color: new T.Color(PAL.robe).multiplyScalar(0.74), gradientMap: grad, side: T.DoubleSide }) : new T.MeshLambertMaterial({ color: PAL.robe, flatShading: true, side: T.DoubleSide })); m.position.copy(skm.position); m.scale.copy(skm.scale); m.userData.rg = rg; m.userData.sg = sg; skirt.add(m); flaps.push(m); }
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
    // v6.6（canon。2026-10-27 ユーザー指摘「裾が動かず、ちょこちょこ走りになっている。前後のパーツにしてみたら」）：ローブの裾を、武闘家・ワルキューレと同じ「前後 2 枚」の動きに。
    // 筒は 1 枚のまま（前と後ろのあいだにすき間を作らない）、裾の上の端（腰）を軸に、前の半分を「いちばん前へ出た脚」、後ろの半分を「いちばん後ろへ出た脚」の角度（腰から足首への線）だけ回す。
    // 回す量の重み：真前・真後ろで 1、脇で 0（脇は動かない）。脚の付け根は真ん中から横にあるので、正面から WC rad の範囲は 1 のまま
    // v6.7（2026-10-27 ユーザー判断 a・僧侶とそろえる）：腰からひざまでは 1 枚の布のまま（前・後ろの半分を重みで曲げる）、ひざから下だけを前・後ろ・脇に分ける（スリットの入ったローブ）。
    // ひざの輪（立ちのひざの関節の高さに一番近い輪）より下の三角形を、向きで 前（正面から ±SLIT）・後ろ・脇 に分け、前は前の脚、後ろは後ろの脚の「股〜足首の線の角度」×KF／KB で、ひざの輪を軸に回す。脇は、ひざより上の曲がりのまま下ろす。
    // 三角形ごとに頂点が別なので、分かれ目がスリットになる。スリットの裏に、まっすぐ下がる細い脇の布（fillers）を足す（ユーザー「サイドにも布を増やせない？」）。前の金の線・裾の縁は三角形の色なので、板と一緒に動く
    function deformSkirt3(legs, run) {
      const S = SK2 || (SK2 = initSk2()), U = S.n, WC = 0.6, RT = 0.115, KF = 0.8, KB = 0.75;   // 前・後ろを回す量（股→足首の線の角度に対して。僧侶と同じ値。1.0 だと裾がつりがね形に開いた）
      if (!S.lowTri) initLower(S);
      const KP = run && KK ? (S.kp || (S.kp = initKick(S))) : null;
      let F = 0, B = 0; const caps = [], shins = [], KE = [], KG = 1, KW = 0.32;   // KG：蹴った脚の側の跳ね上げ（その脚の股〜足首の線まで。1.3 では横から裾が大きく広がった）。KW：跳ね上げる幅（脚の真ん中から。反対の脚の所でほぼ 0）
      for (const [sxs, th, kn, kn0] of legs) {
        const hx = (sxs < 0 ? -1 : 1) * CAN.C.legX, hy = -0.02, ky = hy - KN * Math.cos(th), kz = -KN * Math.sin(th), a2 = th + kn, ay = ky - (SH + 0.02) * Math.cos(a2), az = kz - (SH + 0.02) * Math.sin(a2);
        const ang = b => -Math.atan2(kz - (SH + 0.02) * Math.sin(th + b), hy - (ky - (SH + 0.02) * Math.cos(th + b))), q = ang(kn0);   // 股から足首への線の角度（+ は後ろ）。2026-10-28：走りの蹴り上げ（KICK）の分は、下の KE（蹴った脚の側だけ）で入れる
        if (kn > kn0) KE.push([hx, ang(kn) * KB * KG]);   // 蹴った脚の側の、後ろの裾の跳ね上げの角度（2026-10-28 ユーザー「ローブを跳ね上げて足の裏が見えるように」）
        F = Math.min(F, q * KF); B = Math.max(B, q * KB);
        caps.push([hx, hy, 0, hx, ky, kz, RT]); shins.push([hx, ky, kz, hx, ay, az]); caps.push([hx, ky, kz, hx, ay, az, 0.12]);   /* v7.6：すねも、ひざの輪と、そのすぐ上の布を押し出す（ひざより下だけ押すと、ひざの輪のつなぎ目から長靴の上の端が点線でのぞいた）。ひざの輪の点は、ここで押した位置を下の板も使う（下の板で 2 回押すと、つなぎ目にすき間ができた） */   // もも（ひざより上の布は、この中に入った点を外へ押し出す）
      }
      const B0 = B; for (const e of KE) { e[1] = Math.max(0, e[1] - B0); B = Math.max(B, B0 + e[1]); }   // 後ろの裾：ふだんは B0（両脚の股〜足首の線のうち後ろのほう）。蹴った脚の側だけ、その脚の線まで跳ね上げる（全体を一枚の板で持ち上げない。脇へなだらかに戻る）
      const Bx = x => { let q = B0; for (const [hx, e] of KE) { const d = 1 - Math.abs(x - hx) / KW; if (d > 0) q += e * d * d * (3 - 2 * d); } return q; };
      const LIFT = Math.max(0, baseY - body.position.y), LS = 1 - LIFT / len;   // v6.8（2026-10-27 ユーザー指摘「脚を開いたとき、脇の裾が地面に触れている」）：歩き・走りで体が沈んだ分だけ、裾を腰から下へ縮めて持ち上げる（裾の下の端が立ちの高さより下がらない。前後の曲げとふくらみはそのまま）
      for (const m of fillers) m.scale.y = LS;
      for (const m of fillers) { const g = m.geometry, pa = g.attributes.position, o = g.userData.o || (g.userData.o = Float32Array.from(pa.array)), yK0 = o[1], c = Math.cos(m.userData.back ? B : F) * 0.85;   // v7.6：脇の布・後ろの布の、ひざから下の長さを、となりの板が回って上がった分（cos）より短く（0.85 倍）。まっすぐ下がったままだと、後ろの裾が上がったとき、縁のない布が裾の下に出た（別の目のレビュー 2）
        for (let i = 0; i < pa.count; i++) pa.array[i * 3 + 1] = yK0 + (o[i * 3 + 1] - yK0) * c; pa.needsUpdate = true; g.computeBoundingSphere(); }
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
        if (reg[t] && u !== k) for (const [a0, a1, a2, b0, b1, b2] of shins) { const RB = 0.12, M = 0.03;   // v7.6：前・後ろの板を、すね（長靴）の筒（半径 0.12）の外へ押し出す。板は回るだけなので、後ろへ振った脚の長靴の上の端が裾の縁の手前に出た（別の目のレビュー 2）
          const abx = b0 - a0, aby = b1 - a1, abz = b2 - a2, l2 = abx * abx + aby * aby + abz * abz, tt = Math.max(0, Math.min(1, ((px - a0) * abx + (py - a1) * aby + (pz - a2) * abz) / l2));
          const ddx = px - (a0 + abx * tt), ddy = py - (a1 + aby * tt), ddz = pz - (a2 + abz * tt), dl = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
          if (dl < RB + M) { const d2 = dl > RB - M ? dl + (RB + M - dl) * (RB + M - dl) / (4 * M) : RB, hl = Math.hypot(px, pz) || 1; px += px / hl * (d2 - dl); pz += pz / hl * (d2 - dl); } }   // 押す向きは体の真ん中から外へ（すねから離す向きだと、両脚のあいだの点が、もう一方の脚の中へ押された。僧侶 v10.5 と同じ）
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
        const pp = pa.array; for (let j = 0; j <= E.length; j++) { const i = E[j - 1], x = j ? arr[i * 3] : ox[ku], y = j ? arr[i * 3 + 1] : oy[ku] + len / 2, z = j ? arr[i * 3 + 2] : oz[ku] / SKZ; const D = WRAP * Math.min(1, (E.length - j) / (E.length * 0.5));   /* v7.6：下の半分で、裾へ向かって細くする（後ろの裾が上がると、裾の下から縁の無い布がのぞいた） */ pp.set([x, y, z, x * (1 - D), y, z * (1 - D)], j * 6); }
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
      const ed = { '1-1': new Map(), '11': new Map(), '2-1': new Map(), '21': new Map() };   // v7.5：前・後ろの板の左右の端の点（輪ごとに、正面・真後ろからいちばん離れた点）。巻き込みの布の外の縁
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
    // 胴
    const torso = parts.torso = pivot(0, -FHP, 0, body);
    ell(0.245, 0.2, 0.46, 18, 1, 0.66, PAL.robe, 0, 0.23, 0, torso);
    sph(0.15, 1.15, 0.7, 0.75, PAL.robe, 0, 0.35, 0.02, torso, 12, 8);                        // 胸のふくらみ
    ell(0.205, 0.205, 0.07, 18, 1, 0.68, PAL.strap, 0, 0.03, 0, torso);                        // 帯
    ell(0.12, 0.17, 0.05, 14, 1, 0.8, CAN ? PAL.robeD : PAL.gold, 0, 0.45, 0, torso);         // 襟のふち（共通の決まり v6：あごの真下の金の輪が、顔の幅いっぱいの金のひげに見えるので、暗い紫の縁取りに。canon §5）
    if (CAN) for (const sx of [-1, 1]) {   // 前の金の線（今のドット絵の、襟から裾まで通る 2 本の金の線）。胴の上は襟から帯まで。裾の線（±0.3 rad）へ続く
      const rAt = y => 0.2 + 0.045 * y / 0.46, zAt = (x, y) => 0.66 * Math.sqrt(rAt(y) ** 2 - x * x) + 0.004;
      const p0 = new T.Vector3(sx * 0.055, 0.065, 0), p1 = new T.Vector3(sx * 0.04, 0.43, 0); p0.z = zAt(p0.x, p0.y); p1.z = zAt(p1.x, p1.y);
      const d = p1.clone().sub(p0), m = new T.Mesh(new T.BoxGeometry(0.03, d.length(), 0.012), mat(PAL.gold));
      m.position.copy(p0).add(p1).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); torso.add(m);
    }
    if (!CAN) { const sp = box(0.05, 0.66, 0.02, PAL.strap, 0, 0.2, 0.165, torso); sp.rotation.z = 0.5; }   // 斜めがけの帯（前）。canon はなし（2026-10-26 ユーザー判断「斜めがけの帯はいらない」）
    if (!CAN) { const sp = box(0.05, 0.66, 0.02, PAL.strap, 0, 0.2, -0.165, torso); sp.rotation.z = 0.5; }  // 斜めがけの帯（うしろ）
    // 背中の杖：ななめ。うしろから見て、玉は右上・先は左下
    const staff = parts.staff = CAN ? pivot(0, 0, 0, torso) : pivot(0, 0.15, -0.36, torso);   // canon：手に持つ（下の holdGrip）。ゲームの見た目は、背中に斜め
    if (!CAN) { staff.rotation.z = 0.55;
    cyl(0.03, 0.03, 1.5, 8, PAL.staff, 0, 0, 0, staff);
    cyl(0.04, 0.04, 0.05, 8, PAL.gold, 0, -0.72, 0, staff);
    sph(0.075, 1, 1, 1, PAL.gem, 0, 0.8, 0, staff, 12, 9);
    { const r = add(new T.Mesh(new T.TorusGeometry(0.075, 0.014, 6, 14), mat(PAL.gold)), 0, 0.74, 0, staff); r.rotation.x = Math.PI / 2; }
    }
    // 腕：広い紫の袖と金の袖口、素手。左右の名前は全員と同じ L ＝ +x（キャラ自身の左。canon §1-10。2026-10-29：前は L ＝ −x だった。見た目・杖の手（−x＝R）は同じ）
    for (const sx of [-1, 1]) {
      const arm = parts[sx < 0 ? 'armR' : 'armL'] = pivot(sx * (CAN ? CAN.C.shX * CAN.C.FEMALE : 0.275), CAN ? CAN.C.shY : 0.38, 0, torso);
      const FT = CAN ? CAN.C.FTHIN : 1;   // 女性は腕・手を細く
      sph(0.085 * FT, 1, 0.9, 1, PAL.robe, 0, 0, 0, arm, 10, 7);
      ell(0.085 * FT, 0.075 * FT, (CAN ? CAN.C.UA : 0.3 + AX / 2) + 0.02, 12, 1, 1, PAL.robe, 0, -((CAN ? CAN.C.UA : 0.3 + AX / 2)) / 2, 0, arm);
      const fore = parts[sx < 0 ? 'foreR' : 'foreL'] = pivot(0, -(CAN ? CAN.C.UA : 0.3 + AX / 2), 0, arm);
      sph(0.07 * FT, 1, 1, 1, PAL.robe, 0, 0, 0, fore, 10, 7);
      ell(0.075 * FT, 0.105, 0.2 + FA, 14, 1, 1, PAL.robe, 0, -0.1 - FA / 2, 0, fore);                              // 袖（先が広がる）
      cyl(0.108, 0.108, 0.035, 14, PAL.gold, 0, -0.21 - FA, 0, fore);                                  // 袖口の金
      sph(CAN ? CAN.C.HAND * CAN.C.FTHIN : 0.065, 1, 1.05, 1, CAN ? new T.Color(COL.face).multiplyScalar(CAN.C.SKINK).getHex() : COL.face, 0, -0.26 - FA, 0.01, fore, 10, 8);   // 手（素肌は共通の C.SKINK で顔と同じに見せる。2026-10-29）
    }
    // 頭：戦士と同じ、角を丸めた箱の 1 曲面の顔（明るい肌色、黒い縦長の四角の目、小さな鼻と口）
    const head = parts.head = pivot(0, CAN ? CAN.C.headY : 0.485, 0, torso); if (CAN) head.scale.setScalar(CAN.C.HS);   // 首は短く（2026-10-26 ユーザー指摘） head.scale.setScalar(sh.head);
    if (CAN) CAN.buildHead(T, head, { mat, COL, Q, female: true, sideHair: PAL.hair, napeHair: CAN ? PAL.robeD : PAL.hairIn, noPlate: true, face: WF });   // v7.3：うなじの玉はローブの濃い色（襟に見せる。v6 の暗い髪の色でも、正面であごの下の帯と首のわきの髪がひげに見えた。うしろは房がおおう）
    // （この直しは共通の buildHead に移した。2026-10-29）v7.4：共通の首の円柱（buildHead）の上の端を、顔の箱の中まで 0.04 のばす（上のふたのふちが、あごの下で明るい 1〜3 画素の点に出た。エルフ・ワルキューレと同じ直し）
    else {
    const FW = 0.4, FH = 0.31, FD = 0.34, FR = 0.06, FZ = 0.02, FY = 0.205;
    { const fg = new T.BoxGeometry(FW, FH, FD, 8, 8, 8), fa = fg.attributes.position, v = new T.Vector3(), c = new T.Vector3(), cl = (x, h) => Math.max(-h, Math.min(h, x));
      for (let i = 0; i < fa.count; i++) { v.fromBufferAttribute(fa, i); c.set(cl(v.x, FW / 2 - FR), cl(v.y, FH / 2 - FR), cl(v.z, FD / 2 - FR)); v.sub(c).normalize().multiplyScalar(FR).add(c); fa.setXYZ(i, v.x, v.y, v.z); }
      fg.computeVertexNormals(); add(new T.Mesh(fg, mat(COL.face)), 0, FY, FZ, head); }
    cyl(0.07, 0.082, 0.1, 10, COL.neck, 0, -0.035, 0, head);
    { const zf = FZ + FD / 2 + 0.002;
      for (const sx of [-1, 1]) box(0.05, 0.12, 0.02, PAL.eye, sx * 0.1, 0.26, zf, head);
      box(0.034, 0.04, 0.03, PAL.nose, 0, 0.2, zf, head);
      box(0.075, 0.014, 0.02, PAL.mouth, 0, 0.12, zf, head); for (const sx of [-1, 1]) box(0.014, 0.014, 0.02, PAL.mouth, sx * 0.04, 0.131, zf, head); }
    }
    // 髪：金髪。頭の上（帽子の下）、うしろに長く、顔の両がわにたれる
    const HT = CAN && W3('HAT') || {}, HK = HT.k || 1, HB = HT.band || 1, HD0 = HT.drop || 0;   // color：帯の色、k：つば・帯・いちばん下の円すいの太さ、band：帯といちばん下の円すいのすその太さだけ（頭の断面より少し大きく）、drop：つば・帯を下げる量（いちばん下の円すいをそのぶん長く＝帽子の先の高さは同じ）   // 帽子のつば・金の帯・いちばん下の円すいの太さの倍率（高さ・先は変えない）
    let hairB;
    if (!CAN) {
      sph(0.235, 1.0, 0.95, 1.0, PAL.hair, 0, 0.27, -0.06, head, 14, 10);
      hairB = parts.hairB = pivot(0, 0.3, -0.18, head);
      sph(0.13, 1.45, 1.0, 0.7, PAL.hairIn, 0, 0.0, -0.13, head, 10, 7);   // 首のうしろにある髪の部分は少し暗く（2026-10-26 ユーザー依頼。背中がわの房ではない）
      parts.hairS = [];   // 5 本の房（走ると、少しずつずれてなびく）
      [[-0.16, 0.72], [-0.08, 0.8], [0, 0.86], [0.08, 0.8], [0.16, 0.72]].forEach(([x, l]) => { const st = pivot(x, 0, 0, hairB); ell(0.075, 0.05, l, 10, 1, 1.5, PAL.hair, 0, -l / 2, 0, st); parts.hairS.push(st); });
      for (const sx of [-1, 1]) {
        ell(0.05, 0.04, 0.6, 8, 1, 1.1, PAL.hair, sx * 0.235, 0.0, 0.05, head);
        box(0.06, 0.1, 0.12, PAL.hair, sx * 0.215, 0.32, 0.09, head);
      }
    } else {
      // 共通の決まり（v6。ユーザー指摘「後頭部が盛り上がってるのは変」・窓口「横から顔の箱が髪から飛び出す」）：頭の上・うしろ・横を 1 つの丸い面で包み（武闘家と同じ作り）、
      // うしろ髪の房は、その丸い面の下の端から背中へ下ろす（帽子の下に丸い山を作らない）。顔の両わきに、耳の前を通る横髪（横から見て、顔は前の面だけ）
      const HF = W3('HAIR') || {}, [kx, ky, kz] = HF.k || [1, 1, 1.04];   // HF：髪を顔の輪郭に合わせる（k＝丸い髪の x・y・z の倍率、cz＝中心の前後、side＝横髪の x、back＝うしろ髪の房の付け根を前へずらす量、flat＝側頭部を平らに帽子の下まで、brow＝前髪を額に沿わせる、cyl＝頭の上半分を筒に：うしろ髪は全周まっすぐ帽子の中まで立ち上げ、頭の上の丸い髪（前髪）は付けない＝帽子に隠れる。額は顔の箱の ext でまっすぐ上へ）
      const cy = 0.255, cz = HF.cz != null ? HF.cz : -0.035, R = 0.255, hm = () => { const m = mat(PAL.hair); m.side = T.DoubleSide; return m; };
      const flat = g => { if (!HF.flat && !HF.cyl) return g; const p = g.attributes.position, Rg = g.parameters.radius; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = Math.hypot(x, z); if (y <= 0 || h < 1e-6) continue; const nh = h + (Rg - h) * (HF.cyl ? 1 : (x / h) ** 2); p.setX(i, x * nh / h); p.setZ(i, z * nh / h); if (HF.cyl) p.setY(i, Math.min(y, (0.48 - HD0 - cy) / ky)); } g.computeVertexNormals(); return g; };   // flat：側頭部は平ら（2026-10-29 ユーザー「被り物をしている人全部の共通ポイント」）。上半分は、横（真横ほど強く）だけ赤道の太さのまま帽子の下まで立ち上げる（上へ絞り込まない）。うしろ・前は丸いまま。戦士の兜の下の髪と同じ   // cyl：筒の上の端は帽子のつばの 0.04 上（帽子の円すいの中）で止める（上まで立ち上げると、うしろで円すいの外へ出た）
      const brow = g => HF.brow ? CAN.browHug(g, { cy, cz, ky, kz, FR: (WF || {}).FR || CAN.FACE.FR }) : g;   // brow：前髪を額に沿わせる（横から前髪と額のすき間を見せない。正面の前髪のふちは同じ）
      if (!HF.cyl) add(new T.Mesh(brow(flat(new T.SphereGeometry(R, Math.round(18 * Q), Math.round(10 * Q), 0, Math.PI * 2, 0, 1.05))), hm()), 0, cy, cz, head).scale.set(kx, ky, kz);   // 頭の上（v6.4：前の縁を目の上の端より上へ。1.2 rad では前髪が目にかかって眠そうに見えた）
      add(new T.Mesh(flat(new T.SphereGeometry(R * 1.01, Math.round(18 * Q), Math.round(14 * Q), Math.PI * 0.95, Math.PI * 1.1, 0, 2.4)), hm()), 0, cy, cz, head).scale.set(kx, ky, kz);   // うしろ半分（上から耳の下まで 1 枚。継ぎ目なし）
      for (const sx of [-1, 1]) box(0.085, 0.16, 0.1, PAL.robeD, sx * 0.13, -0.03, -0.03, head);   // あごの下・首の両わき：ローブの濃い色の襟（v7.3。髪の色だと、暗くしても正面であごの下にひげが生えて見えた）
      for (const sx of [-1, 1]) sph(0.1, 0.45, 2.0, 0.6, PAL.hair, sx * (HF.side || 0.24), 0.15, -0.01, head);
      if (HF.cyl) { const FWc = (WF || {}).FW || CAN.FACE.FW, yT = 0.48 - HD0, y0 = 0.335, z0 = -0.06, z1 = 0.17; for (const sx of [-1, 1]) box(0.05, yT - y0, z1 - z0, PAL.hair, sx * (FWc / 2 + 0.01), (yT + y0) / 2, (z0 + z1) / 2, head); }   // cyl：こめかみの髪（顔の箱を上へのばした横の肌を、帽子の下までおおう。横・斜め後ろから肌が見えた＝R1）   // 横髪（耳の上を通って、肩の上まで。今のドット絵の、顔の両わきにたれる髪）。横から顔の前の面と目が見えるよう、顔の前の端（z 0.19）より 0.14 うしろまで。正面で、あごの下の顔の幅に入らない（x 0.195 より外）
      hairB = parts.hairB = pivot(0, 0.15, -0.2 + (HF.back || 0), head);
      parts.hairS = [];   // 7 本の細い房（1 枚の板に見えない）。下の端は、なだらかな弧（段々・ぎざぎざにしない）。わきの房は頭の丸みに合わせて前へ
      [-0.195, -0.13, -0.065, 0, 0.065, 0.13, 0.195].forEach(x => { const k = (x / 0.195) ** 2, l = (0.72 - 0.08 * k) * 0.75, st = pivot(x, 0, 0.05 * k, hairB); st.userData.m = CAN.hairStrand(T, mat(PAL.hair), 0.05, 0.04, l, Math.round(10 * Q), 1.3); st.add(st.userData.m); parts.hairS.push(st); });   // 房は曲げられる筒（CAN.hairStrand。走りで毛先ほどしなる）   // 2026-10-28（ユーザー判断）：房の長さを 0.75 倍に（3D だけ）。長いまま（毛先が腰）だと、跳ね上がる後ろの裾・ローブの腰と面が交わった。ロングヘアに見える長さはできるだけ残す（0.8 倍は歩きで交わらないが、走りで交わらないようにするには、なびきを 0.6 にして横から板に見えた）
    }
    // 帽子：金のふちの紫の円すい。先が曲がる
    const hat = parts.hat = pivot(0, (CAN ? 0.44 : 0.4) - HD0, 0, head);   // v6.4（canon）：つばを 0.04 上げて、目の上にひたいを見せる（つば・前髪が目の上の端にのって、眠そうに見えた）
    ell(0.47 * HK, 0.47 * HK, 0.035, 26, 1, 1, PAL.robe, 0, 0, -0.02, hat).rotation.x = -(HT.tilt || 0);         // つば（tilt：前を上げる角。帽子の真ん中を軸に、うしろは同じだけ下がる）
    const band = ell(0.285 * HK * HB, 0.285 * HK * HB, 0.05, 20, 1, 1, HT.color != null ? HT.color : PAL.gold, 0, 0.045, -0.02, hat);                              // 金の帯
    const cone0 = CAN ? cyl(0.2, 0.28 * HK * HB, 0.18 + HD0, 20, PAL.robe, 0, 0.12 + HD0 / 2, -0.02, hat) : cyl(0.2, 0.28, 0.22, 20, PAL.robe, 0, 0.14, -0.02, hat);
    if (CAN && HT.tilt) {   // 2026-11-02 ユーザー「帽子のツバを傾けたのに帽子の長さを合わせてないから隙間空いてる」：つばが下がるうしろ半分では、帯と、いちばん下の円すいの下の端を、つばの面まで下へのばす（前半分・つばの傾き・帽子の先の高さはそのまま）
      const sl = Math.tan(HT.tilt), dn = z => Math.min(0, sl * z);   // z：帽子の真ん中（つばの軸）からの前後。つばの面は y＝z・tan(tilt)
      { const p = band.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + dn(p.getZ(i) * band.scale.z)); band.geometry.computeVertexNormals(); }   // 帯はまるごと下げる（高さは同じ）
      { const p = cone0.geometry.attributes.position, h = cone0.geometry.parameters.height; for (let i = 0; i < p.count; i++) { const w = 0.5 - p.getY(i) / h; p.setY(i, p.getY(i) + dn(p.getZ(i) * cone0.scale.z) * w); } cone0.geometry.computeVertexNormals(); }   // 円すいは下の端ほど下げ、上の端（帽子の先）は動かさない
    }   // canon：つばを 0.04 上げたぶん、いちばん下の円すいを 0.04 短く（帽子の先の高さ＝体の大きさの基準を変えない）
    const h2 = pivot(0, (CAN ? 0.21 : 0.25) + HD0, -0.02, hat); h2.rotation.z = -0.3;
    cyl(0.12, 0.2, 0.2, 18, PAL.robe, 0, 0.1, 0, h2);
    const h3 = pivot(0, 0.2, 0, h2); h3.rotation.z = -0.55;
    cyl(0.02, 0.12, 0.18, 16, PAL.robe, 0, 0.09, 0, h3);
    if (CAN) { sph(0.2, 1, 0.3, 1, PAL.robe, 0, 0, 0, h2, 20, 8); sph(0.12, 1, 0.3, 1, PAL.robe, 0, 0, 0, h3, 18, 8); }   // v6.4（canon）：円すいの継ぎ目を平たい球でうめる（折れの段が、後ろから黒い折れ線＝汚れに見えた）。帽子の先の高さ（体の大きさの基準）は変えない

    // 動き：戦士と同じ（腰・膝・肩・ひじ）。ローブは、脚が前に出るとき前へ広がる。髪は走ると後ろへなびく
    // 2026-10-27 試走の指摘（No.2・4）「走っているときだけ、後ろから見ると足が動いているように見えない」：走りの遊脚の膝を深く曲げて、かかとを後ろへ大きく跳ね上げる（0.5 → RUNKICK）。深く曲げるのは、ももが後ろにある間だけ（前へ振り出すときに深く曲げると、ひざがローブの前を突き抜ける）。歩きは今のまま
    const RUNKICK = 1.6;
    let ampS = null, skirtMoved = true; const KK = CAN && CAN.KICK.wizard;   // KK：走りの蹴り上げ（hero3d_canon.js。裾は deformSkirt3 が脚に合わせて持ち上げ・押し出す）
    const HRB = 0.12, HBEND = 1.0;   // 走りの髪（2026-10-28）：根元の傾き・房のしなり（毛先の向き、rad）。0.12・1.0 で、立ち・歩き・走り（10〜60 km/h）とも髪とローブの面の交わり 0（しなり 0.8 では 30 km/h から当たる）
    function pose(mode, t, o) {
      const run = mode === 'run', walk = mode === 'walk', moving = run || walk;
      const RK = 1;   // v6.6：ローブを前後 2 枚の動きにしたのでテントが出ない。歩幅・脚の速さはほかの人と同じに戻した（v6.5 の判断 D の 0.72 はやめた。僧侶と同じ）
      const f = run ? 1.55 : 1.05, ph = t * Math.PI * 2 * f / RK, s = Math.sin(ph), c = Math.cos(ph);
      let A = (run ? 0.75 : 0.5) * RK;
      if (moving && o && o.stride > 0) { const want = Math.asin(Math.min(1, o.stride * RK / (4 * (0.74 + LX) * (run ? 0.95 : 0.97)) * (run ? 0.65 : 1))); const tgt = Math.min((run ? 0.9 : 0.45) * RK, Math.max((run ? 0.45 : 0.2) * RK, want)); ampS = ampS == null ? tgt : ampS + (tgt - ampS) * 0.15; A = ampS; }
      const armA = run ? 0.95 : 0.5;
      const knee = sg => { if (!moving) return 0.02;   /* 共通の決まり（案 v3）：ローブの人は、かかとを高く蹴り上げない（裾が脚を包めるように） */ const cs = sg * c, ss = sg * s, swing = Math.max(0, -cs), load = Math.max(0, cs) * Math.max(0, -ss); return CAN ? (run ? (0.5 + (RUNKICK - 0.5) * Math.sqrt(Math.max(0, ss))) * Math.pow(swing, 0.8) + 0.25 * load : 0.45 * Math.pow(swing, 0.9) + 0.1 * load) : run ? 1.9 * Math.pow(swing, 0.8) + 0.5 * load : 0.85 * Math.pow(swing, 0.9) + 0.18 * load; };
      let lowest = 0, fwd = 0; const lg = [];
      for (const [leg, shin, sg] of [[parts.legL, parts.shinL, 1], [parts.legR, parts.shinR, -1]]) {
        const th = moving ? sg * s * A + (run ? 0 : 0.04) : 0, kn0 = knee(sg), kn = run && KK ? CAN.kick(kn0, ph, sg, KK) : kn0;
        leg.rotation.x = th; shin.rotation.x = kn; fwd = Math.max(fwd, -th); lg.push([-sg * 0.12, th, kn, kn0]);
        const foot = sg > 0 ? parts.footL : parts.footR; foot.rotation.x = run && KK ? CAN.footAlong(th, kn) : -(th + kn) * (run ? 0.75 : 1);
        lowest = Math.max(lowest, KN * Math.cos(th) + (SH - 0.08) * Math.cos(th + kn) + 0.11);
      }
      body.position.y = moving ? baseY + (lowest - baseY) * (run ? 0.5 : 0.8) : baseY + Math.sin(t * 2.0) * 0.008;
      if (moving || skirtMoved) { (CAN ? deformSkirt3 : deformSkirt)(lg, run); skirtMoved = moving; }   // 立っているときは、いちど元に戻したら、形を計算しない（軽くする）
      for (const [arm, fore, sg] of [[parts.armR, parts.foreR, 1], [parts.armL, parts.foreL, -1]]) {
        const ar = moving ? -sg * s * armA : 0.02 * sg * Math.sin(t * 1.7); arm.rotation.x = ar;
        const fw = Math.max(0, -ar) / armA; fore.rotation.x = run ? -1.25 - 0.4 * fw : walk ? -0.2 - 0.35 * fw : -0.1;
      }
      parts.armR.rotation.z = -0.26; parts.armL.rotation.z = 0.26;
      torso.rotation.x = run ? 0.28 : walk ? 0.05 : 0; torso.rotation.y = moving ? s * (run ? 0.2 : 0.1) : 0; body.rotation.x = 0;
      head.rotation.x = run ? -0.22 : 0; head.rotation.y = moving ? -s * (run ? 0.1 : 0.05) : 0;
      hairB.rotation.x = CAN ? (run ? HRB : walk ? 0.04 : 0.02) : (run ? 0.3 : walk ? 0.1 : 0.03);   // 走りの根元は少しだけ（2026-10-28：0.45 で 7 本をまとめて回すと、横から 1 つの塊・板に見えた。なびきは房ごとのしなり＝下の HBEND）
      parts.hairS.forEach((st, i) => { st.rotation.x = moving ? Math.sin(ph * 2 + 0.6 + i * 0.7) * (run ? (CAN ? 0.09 : 0.22) : 0.06) + (run && !CAN ? 0.12 * i % 3 * 0.1 : 0) : Math.sin(t * 1.3 + i) * 0.02; st.rotation.z = (i - (CAN ? 3 : 2)) * (run ? (CAN ? 0.015 : 0.06) : 0.02); });
      if (CAN) parts.hairS.forEach((st, i) => CAN.bendStrand(st.userData.m, run ? HBEND * (1 + 0.2 * Math.sin(ph * 2 + 0.3 + i * 0.9)) : 0));   // 走り：房ごとに毛先ほど後ろへしなり、揺れの位相を房ごとにずらす（毛先が腰のローブ・跳ね上がる裾に当たらない）。歩き・立ちはまっすぐ（今のまま）
      hat.rotation.z = moving ? s * 0.03 : 0;
      if (CAN && grip) { if (setMoving) setMoving(moving); grip(); if (slideStaff) slideStaff(); }
    }
    let grip = null, slideStaff = null, setMoving = null;
    pose('stand', 0);
    if (CAN) {   // 杖：右手（-x がわ）に持つ（ひじ 90 度）。腕は振らず、杖の前後の傾き＝胴の前後の傾き（2026-10-27 ユーザー判断）。ローブを貫いてよい。下の端は立ちで地面から 0.58（v7.6：0.52 では左斜め後ろの走りで、裾の下に杖の下の端の金が 1 点見えた。v7.3：0.5 では走りの正面で、杖が手の上の明るい縁を 1 画素だけ切り離し、明るい点が 1 つ増えた。0.14 では走りで地面より 0.07 下に出た。0.26 では走りで裾の下に杖の下の端が出て、3 本目の足に見えた＝別の目のレビュー 2026-10-27）
      parts.armR.rotation.z = 0; parts.foreR.rotation.set(-Math.PI / 2, 0, 0); group.updateMatrixWorld(true);
      const hv = new T.Vector3(0, CAN.C.HANDY, 0.01); parts.foreR.localToWorld(hv); torso.worldToLocal(hv);
      const floorY = -body.position.y, BH = 0.58, SD = BH - 0.028, yBut = floorY + BH - hv.y - SD, yTop = 0.95 - hv.y - SD;   // SD：杖全体（長さは同じ）を下げて、立ちで下の端を地面に着ける（−0.028：あとの fitFoot で足の裏が動くぶん。立ちで下の端＝足の裏。2026-10-29 ユーザー「杖の後端が地面についてないので、直立状態の杖全体を下に移動」） staff.position.copy(hv);
      cyl(0.03, 0.03, yTop - yBut, 8, PAL.staff, 0, (yTop + yBut) / 2, 0, staff);
      cyl(0.04, 0.04, 0.05, 8, PAL.gold, 0, yBut + 0.04, 0, staff);
      sph(0.075, 1, 1, 1, PAL.gem, 0, yTop, 0, staff, 12, 9);
      { const r = add(new T.Mesh(new T.TorusGeometry(0.075, 0.014, 6, 14), mat(PAL.gold)), 0, yTop - 0.06, 0, staff); r.rotation.x = Math.PI / 2; }
      const ST = () => W3('STAFF') || {}; let moving = false; grip = CAN.holdGrip(T, group, parts, { side: 'R', prop: staff, buttY: yBut, fixed: true, tiltK: () => moving && ST().tiltK != null ? ST().tiltK : 1 });   // 杖を持つ腕は共通の武器を持つ腕（C.GRIPARMZ 0.26・ひじから先まっすぐ。2026-10-29 ユーザー判断）
      { const base = staff.position.clone(), v = new T.Vector3(), w = new T.Vector3();   // 歩き・走りで杖の下の端が地面（全体の y＝0）より下に出るコマは、杖を手の中で上へすべらせて地面で止める（立ちは下の端が地面。決まり「持ち物は地面より下に出ない」）
        setMoving = mv => { moving = mv; }; slideStaff = () => { staff.position.copy(base); group.updateMatrixWorld(true); let lo = Infinity; for (const [dx, dz] of [[0, 0], [0.04, 0], [-0.04, 0], [0, 0.04], [0, -0.04]]) { group.worldToLocal(staff.localToWorld(w.set(dx, yBut, dz))); lo = Math.min(lo, w.y); } group.worldToLocal(staff.localToWorld(v.set(0, yBut, 0))); const gap = moving ? (ST().gap || 0) : 0; v.y = lo - gap; if (lo >= gap) return;   /* gap：歩き・走りのあいだは、下の端を地面からこれだけ浮かせる */   /* 下の端の円の縁（金のふちの半径 0.04）までふくめて、いちばん低い所 */ group.worldToLocal(staff.localToWorld(w.set(0, yBut + 1, 0))); const a = w.y - v.y; if (a > 1e-6) { staff.translateY(-v.y / a); staff.updateMatrixWorld(true); } }; }
    }

    // 高さ：戦士と同じにそろえる（帽子の先まで）
    const hOf = g => { g.updateMatrixWorld(true); return new T.Box3().setFromObject(g).max.y; };
    if (CAN) { pose('stand', 0); CAN.fitFoot(T, group, parts, true); CAN.fitTorsoTop(T, parts, 0.46);   /* 胴の上の端を肩の関節に（canon.fitTorsoTop。2026-10-29 ユーザー「全員、胴の上の端を肩の関節（0.44）に合わせる」）。TOP：今の胴の上の端 */ CAN.fit(T, group, parts, 'wizard'); { const HD = W3('HEAD'); if (HD && HD.down) parts.head.position.y -= HD.down; /* 頭を下げる（背・帽子の先は合わせ直さない。武闘家・戦士と同じ 2026-10-29） */ } CAN.femaleHead(T, group, parts, pose, 0.01, 1); /* 頭は 1 倍（2026-10-29 ユーザー「頭は1倍髪も変化せず」。帽子なので髪は変えない）。0.01：首をそろえたあと下げる量（正面 12 ドット・2 行） */   /* 女性の頭（共通。C.FHEAD 0.83 倍・首を C.NECKV にそろえて C.FNECKD 下げる。帽子の先は合わせ直さない。2026-10-29 ユーザー判断） */ if (KK) CAN.addSoles(T, parts, 'wizard'); } else group.scale.setScalar(hOf(L().build(T, { toon: false }).group) / hOf(group));
    return { group, parts, pose };
  }
  L().buildWizard = buildWizard;
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildWizard };
})(typeof window !== 'undefined' ? window : globalThis);
