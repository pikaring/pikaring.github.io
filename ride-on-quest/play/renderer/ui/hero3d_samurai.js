/* 侍（男）の 3D（2026-10-27。主人公候補。盗賊から替えた＝rq-people。主人公としては、まだ選べない＝CAST・ゲームには入れていない）。
   見本：art_src/canon3d/user_feedback/samurai_reference_20261027.jpg（ユーザーの絵。9 方向）・art_src/npc/samurai_frontback.png（ドット絵）。決定と経緯：docs/3d-canon/parts/samurai.md。
   傭兵（hero3d_mercenary.js）と同じく、骨組み・脚・腕・動き（pose）は戦士（hero3d.js の build0 の canon・fine の道筋）を写し、体の大きさの段も戦士と同じ（C.SIZE に無い id は 1）。
   顔・首・耳は共通の canon.buildHead だけ。服（白い着物・手首の近くまでの広い袖・えんじの胴と肩当て・白い帯・紺の袴）・黒髪の髷・白い足袋と草履・左腰の刀と脇差を足す。
   袴は腰から足首の上まで両脚を包むひと続きの裾で、魔法使いの長いローブ（deformSkirt3）の作りを写した（v2。2026-10-27 ユーザー「魔法使いや僧侶の形に似せる」）。走りも魔法使い・僧侶と同じ。
   左右：L ＝ +x（キャラ自身の左。canon §1-10）。刀は左腰（+x）。
   使い方：RQ.lowpoly.buildSamurai(T, { toon, steps, q }) → { group, parts, pose }。いつも canon。前提：hero3d.js・hero3d_canon.js を先に読む。 */
(function (root) {
  const RQ = root.RQ = root.RQ || {};
  const L = () => RQ.lowpoly;
  const COL = { face: 0xffc49b, neck: 0xf2b189, eye: 0x241812, kimono: 0xeceef3, kimonoD: 0xc4c8d4, hakama: 0x2f3570, hakamaD: 0x232856, armor: 0x8f2534, armorD: 0x66192a, cord: 0x4a121c, belt: 0xf4f4f6, hair: 0x1b1a1f, tie: 0xf0f0f0,
    tabi: 0xf4f4f6, zori: 0xc8a467, zoriD: 0x8f6f3e, strap: 0x2b2627, sheath: 0x1d1d22, grip: 0x2a2a33, gripW: 0xd8d8e0, gold: 0xd2a744 };
  const SLEEVEK = 0.85;
  // 髪型（2026-10-29 ユーザー判断「侍も傭兵と同じように対処」「侍は耳が見えているから髪の毛の下を削って耳を出す」「水滴型にして右に傾ける」「侍はB」。hairstyle_samurai_3.png の B）：
  //   頭の外形は僧侶 P1 の帽子をかぶった頭（canon.shellHead）・おでこを出す（生え際 line・顔の箱を上へ ext）・耳の上で髪の下を削る（ear）・髷は頭のてっぺんに水滴型で、正面から見て右へ傾ける（drop）
  const SAM = { kat: [0, 0.36, 1], katP: [0.30, 0.04, 0.12], waki: [0, 0.36, 1], wakiP: [0.27, 0.10, 0.10], kote: [-0.1, 0.085, 0.078], line: [0.5, 0.38], bang: { peak: [0.42, 0.045], top: 0.52, w: 0.3, brow: [0.1, 0.03, 0.095, 0.36, 0.25] } };   // 2D に寄せる（ユーザー判断 2026-11-02〜03：「侍の前髪は子供っぽいので元絵をよく見て」→ 額を出し真ん中の房と太い眉、「籠手を直して。刀は進行方向と並行。横から見える」→「このままでok」。見比べ art_src/canon3d/v6/sync2d_20261101/samurai_kote_sword_plan.png）
  const HAIR = { ext: 0.14, line: { c: 0.5, s: 0.38, w: 0.2, z: 0.06 }, knot: { y: 0.6, z: -0.1, rx: -0.35, k: 1.25 }, drop: { r: 0.07, l: 0.24, y: 0.03, rz: -0.7, sz: 0.8 }, ear: { x: 0.13, z: -0.12, y: 0.3 } };   // 袖の太さ（横・前後）の倍率
  function buildSamurai(T, opt = {}) {
    const CAN = L().canon, C = CAN.C, toon = opt.toon !== false, ST = opt.steps || 3, Q = opt.q || 1;
    const LX = 0.74 * 0.4, AX = 0.3 * 0.35, KN = C.KN, SH = C.SH;   // 骨組みは共通の C（戦士の案 B：脚 1.4・腕 1.35）
    const SKIN = new T.Color(COL.face).multiplyScalar(C.SKINK).getHex();   // 素肌の手・手首は共通の C.SKINK で顔と同じに見せる
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
    // 脚：袴の中の紺（裾が上がっても、袴の内に見える）・白い足袋・草履。袴（ひと続きの裾）は下の skirt
    for (const sx of [1, -1]) {
      const S = sx > 0 ? 'L' : 'R';
      const leg = parts['leg' + S] = pivot(sx * C.legX, 0, 0, body);
      ell(0.11, 0.095, KN + 0.02, 12, 1, 1, COL.hakamaD, 0, -KN / 2, 0, leg, 'hakama_in');
      const shin = parts['shin' + S] = pivot(0, -KN, 0, leg);
      sph(0.098, 1, 0.8, 1, COL.hakamaD, 0, 0, 0, shin, 10, 7, 'hakama_in');
      ell(0.1, 0.11, SH - 0.13, 12, 1, 1, COL.hakamaD, 0, -(SH - 0.13) / 2, 0, shin, 'hakama_in');
      cyl(0.075, 0.07, 0.12, 10, COL.tabi, 0, -SH + 0.1, 0.0, shin, 'tabi');                       // 足首（足袋）
      const foot = parts['foot' + S] = pivot(0, -(SH - 0.08), 0, shin);
      sph(0.1, 0.95, 0.62, 1.45, COL.tabi, 0, -0.035, 0.09, foot, 10, 7, 'tabi');
      box(0.18, 0.03, 0.3, COL.zori, 0, -0.085, 0.07, foot, 'zori'); box(0.185, 0.012, 0.305, COL.zoriD, 0, -0.105, 0.07, foot, 'zori');
      for (const k of [1, -1]) { const st = box(0.02, 0.02, 0.13, COL.strap, k * 0.045, -0.035, 0.13, foot, 'zori'); st.rotation.y = -k * 0.45; }   // 鼻緒（つま先から左右へ）
    }
    // 袴：腰から足首の上まで、両脚を包むひと続きの裾（2026-10-27 ユーザー「魔法使いや僧侶の形に似せる」）。作りは魔法使い v6.8〜v7.6（hero3d_wizard.js の deformSkirt3。canon 手順 5 の長いローブの共通の作り）を写した：
    // 腰からひざまでは 1 枚の筒を前・後ろの半分で曲げ、ひざより下は前・後ろ・脇に分け、スリットの裏に脇の布（fillers）、板の端に巻き込みの布（flaps）。前後の厚みは帯に合わせる（SKZ）
    const SK_R0 = 0.25, SK_R1 = 0.33, len = baseY - 0.02 - 0.13;   // 裾は足首の少し上（地面から約 0.15）
    const skirt = parts.skirt = pivot(0, 0.02, 0, body);
    const SK_SEG = 144, SK_H = 24, SKZ = 0.72;
    const skg = new T.CylinderGeometry(SK_R0, SK_R1, len, SK_SEG, SK_H, true).toNonIndexed(), skp = skg.attributes.position, sk0 = Float32Array.from(skp.array), skc = new Float32Array(skp.count * 3);
    const pleat = (x, z) => { if (z <= 0) return false; const r = Math.hypot(x, z), a = Math.abs(Math.atan2(x, z)); return Math.abs(a - 0.32) * r < 0.012; };   // 前のひだの線（2 本）
    { const cr = new T.Color(COL.hakama), cd = new T.Color(COL.hakamaD);
      for (let f = 0; f < skp.count; f += 3) {
        let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += sk0[(f + k) * 3] / 3; cy += sk0[(f + k) * 3 + 1] / 3; cz += sk0[(f + k) * 3 + 2] / 3; }
        const t = (len / 2 - cy) / len, c = t > 0.96 || (pleat(cx, cz * SKZ) && t > 0.08 && t < 0.99) ? cd : cr;   // 裾の暗いふち・前のひだ
        for (let k = 0; k < 3; k++) { skc[(f + k) * 3] = c.r; skc[(f + k) * 3 + 1] = c.g; skc[(f + k) * 3 + 2] = c.b; } } }
    skg.setAttribute('color', new T.BufferAttribute(skc, 3));
    const skm = nm(new T.Mesh(skg, toon ? new T.MeshToonMaterial({ color: new T.Color(0xffffff).multiplyScalar(0.74), gradientMap: grad, vertexColors: true, side: T.FrontSide }) : new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: T.FrontSide })), 'hakama');
    skm.position.set(0, -len / 2, 0); skm.scale.set(1, 1, SKZ); skirt.add(skm);
    const skin = nm(new T.Mesh(skg, mat(COL.hakamaD).clone()), 'hakama'); skin.material.side = T.BackSide; if (skin.material.emissive) skin.material.emissive = new T.Color(COL.hakama).multiplyScalar(0.5); skin.position.copy(skm.position); skin.scale.copy(skm.scale); skirt.add(skin);   // 袴の内側（魔法使いと同じく、半分だけ自分で光らせて布の色に見せる）
    const fillers = [];
    const SLIT = 68 * Math.PI / 180, FILW = 22 * Math.PI / 180;   // 脇の布の半幅（魔法使いは 14°。2026-10-27 ユーザー「足と足の間の布を幅広にして隙間が見えなくなるように」で広げた）
    { const rAt = t => SK_R0 + (SK_R1 - SK_R0) * t, yK = -0.02 - KN, NA = 6, NY = 8, cR = new T.Color(COL.hakama);
      for (const [c0, hw, rk] of [[SLIT, FILW, 0.96], [-SLIT, FILW, 0.96], [Math.PI - SLIT, FILW, 0.96], [-(Math.PI - SLIT), FILW, 0.96], [Math.PI, 0.28, 0.7]]) {
        const pos = [], col = [], idx = [];
        for (let j = 0; j <= NY; j++) { const y = yK + (-len - yK) * j / NY, t = -y / len, r = rAt(t) * rk;
          for (let i = 0; i <= NA; i++) { const a = c0 - hw + 2 * hw * i / NA; pos.push(r * Math.sin(a), y, r * Math.cos(a) * SKZ); col.push(cR.r, cR.g, cR.b); } }
        for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
        const m = nm(new T.Mesh(g, toon ? new T.MeshToonMaterial({ color: new T.Color(0xffffff).multiplyScalar(0.74), gradientMap: grad, vertexColors: true, side: T.DoubleSide }) : new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: T.DoubleSide })), 'hakama');
        m.userData.back = Math.cos(c0) < 0; skirt.add(m); fillers.push(m);
      } }
    // 股のまち（2026-10-27 ユーザー「足と足の間の布を幅広にして隙間が見えなくなるように」）：両脚のあいだ（x＝0）に、ひざの輪から裾まで、前の板の真ん中の線と後ろの板の真ん中の線をつなぐ縦の布。
    // 毎コマ、前・後ろの板の真ん中の点（ひざの輪より下の輪ごと）に合わせて形を変える（updateMachi）。板が脚と一緒に開いても、両脚のあいだにすき間（向こうの景色）が見えず、裾の線は前の板の裾から後ろの板の裾へまっすぐつながる。脚（x ±0.145）は通らない
    const MZ = 10, machi = nm(new T.Mesh(new T.BufferGeometry(), toon ? new T.MeshToonMaterial({ color: new T.Color(COL.hakama).multiplyScalar(0.74), gradientMap: grad, side: T.DoubleSide }) : new T.MeshLambertMaterial({ color: COL.hakama, flatShading: true, side: T.DoubleSide })), 'hakama');
    machi.frustumCulled = false; skirt.add(machi); parts.machi = machi;
    let machiIdx = null;
    function updateMachi() {
      const S = SK2; if (!S || !S.lowTri) return;
      if (!machiIdx) {   // ひざの輪から裾までの輪ごとに、前の板・後ろの板の真ん中の点（頂点の番号）を 1 回だけ探す
        const best = new Map();
        for (let i = 0; i < skp.count; i++) { const t = (i / 3) | 0, rg = S.lowTri[t] ? S.regTri[t] : 0; if (!rg && !(S.y[S.id[i]] === S.yK)) continue; const u = S.id[i], g = S.ring[u], th = Math.abs(Math.atan2(S.ux[u], S.uz[u]));
          for (const [side, sc] of [['F', -th], ['B', th]]) { if (S.y[u] !== S.yK && rg !== (side === 'F' ? 1 : 2)) continue; const k = side + g, cur = best.get(k); if (!cur || sc > cur[1]) best.set(k, [i, sc]); } }
        const rings = [...new Set([...best.keys()].map(k => +k.slice(1)))].filter(g => best.has('F' + g) && best.has('B' + g)).sort((p, q) => S.ringY[q] - S.ringY[p]);
        machiIdx = rings.map(g => [best.get('F' + g)[0], best.get('B' + g)[0]]);
        const idx = []; for (let j = 0; j < machiIdx.length - 1; j++) for (let i = 0; i < MZ; i++) { const a2 = j * (MZ + 1) + i, b2 = a2 + 1, c2 = a2 + MZ + 1, d2 = c2 + 1; idx.push(a2, c2, b2, b2, c2, d2); }
        machi.geometry.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(machiIdx.length * (MZ + 1) * 3), 3)); machi.geometry.setIndex(idx);
      }
      const arr = skp.array, pa = machi.geometry.attributes.position, pp = pa.array, IN = 0.96, NJ = machiIdx.length - 1;   // 板の少し内がわ（板の面と重ならない）
      const yHem = -len * (1 - Math.max(0, baseY - body.position.y) / len) + 0.01;   // 立ちの裾の高さ（体が沈んだ分は、ローブと同じく縮める）
      machiIdx.forEach(([iF, iB], j) => { const yF = arr[iF * 3 + 1] - len / 2, zF = arr[iF * 3 + 2] * SKZ * IN, yB = arr[iB * 3 + 1] - len / 2, zB = arr[iB * 3 + 2] * SKZ * IN, dj = Math.pow(j / NJ, 1.5);
        for (let i = 0; i <= MZ; i++) { const w = i / MZ, y0 = yF + (yB - yF) * w, sag = Math.sin(Math.PI * w) * dj;   // 前・後ろの板が上がった分、真ん中を立ちの裾の高さへ垂らす（両脚のあいだの裾が上がって、すき間のアーチにならない）
          pp.set([0, y0 + Math.min(0, yHem - y0) * sag, zF + (zB - zF) * w], (j * (MZ + 1) + i) * 3); } });
      pa.needsUpdate = true; machi.geometry.computeVertexNormals(); machi.geometry.computeBoundingSphere();
    }
    const flaps = [], WRAP = 0.3;
    for (const [rg, sg] of [[1, -1], [1, 1], [2, -1], [2, 1]]) { const m = nm(new T.Mesh(new T.BufferGeometry(), toon ? new T.MeshToonMaterial({ color: new T.Color(COL.hakama).multiplyScalar(0.74), gradientMap: grad, side: T.DoubleSide }) : new T.MeshLambertMaterial({ color: COL.hakama, flatShading: true, side: T.DoubleSide })), 'hakama'); m.position.copy(skm.position); m.scale.copy(skm.scale); m.userData.rg = rg; m.userData.sg = sg; skirt.add(m); flaps.push(m); }
    // 魔法使い（hero3d_wizard.js）の deformSkirt3・initLower・initSk2 をそのまま写した（脚の左右：legs の [左右の向き, もも, ひざ]。+ が L ＝ +x）
    function deformSkirt3(legs, run) {
      const S = SK2 || (SK2 = initSk2()), U = S.n, WC = 0.6, RT = 0.115, KF = 0.8, KB = 0.75;   // 前・後ろを回す量（股→足首の線の角度に対して。僧侶と同じ値。1.0 だと裾がつりがね形に開いた）
      if (!S.lowTri) initLower(S);
      const KP = run && KK ? (S.kp || (S.kp = initKick(S))) : null;
      let F = 0, B = 0; const caps = [], shins = [], KE = [], KG = 1, KW = 0.32;   // 走りの蹴り上げ（2026-10-28 ユーザー指示、魔法使い・僧侶と同じ）。KG：蹴った脚の側の跳ね上げ（その脚の股〜足首の線まで）。KW：跳ね上げる幅（脚の真ん中から。反対の脚の所でほぼ 0）
      for (const [sxs, th, kn, kn0] of legs) {
        const hx = (sxs < 0 ? -1 : 1) * C.legX, hy = -0.02, ky = hy - KN * Math.cos(th), kz = -KN * Math.sin(th), a2 = th + kn, ay = ky - (SH + 0.02) * Math.cos(a2), az = kz - (SH + 0.02) * Math.sin(a2);
        const ang = b => -Math.atan2(kz - (SH + 0.02) * Math.sin(th + b), hy - (ky - (SH + 0.02) * Math.cos(th + b))), q = ang(kn0);   // 股から足首への線の角度（+ は後ろ）。走りの蹴り上げ（KICK）の分は、下の KE（蹴った脚の側だけ）で入れる
        if (kn > kn0) KE.push([hx, ang(kn) * KB * KG]);   // 蹴った脚の側の、後ろの裾の跳ね上げの角度（魔法使い・僧侶と同じ。2026-10-28）
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
      if (KP) {   // 2026-10-28（ユーザー指示「袴の人も蹴り上げを」）：袴の後ろ半分（ひざより上と、ひざより下の後ろの板）を、蹴り上げたすね・足に当たる所だけ、布の外向きに押し出す（かかとがお尻の高さまで上がり、後ろの面を内から外へ抜けた）。板全体は持ち上げない。走りで蹴り上げる人（KICK）だけ
        for (const j of KP.up) { const u = KP.us[j]; KP.P[j * 3] = ox[u]; KP.P[j * 3 + 1] = oy[u]; KP.P[j * 3 + 2] = oz[u]; KP.q[j] = qa[u]; }
        for (let j = 0; j < KP.n; j++) { const u = KP.us[j], q = KP.q[j], dx = S.ux[u], dy = -S.uz[u] * Math.sin(q), dz = S.uz[u] * Math.cos(q), l = Math.hypot(dx, dy, dz) || 1; KP.D[j * 3] = dx / l; KP.D[j * 3 + 1] = dy / l; KP.D[j * 3 + 2] = dz / l; }
        CAN.kickPush(T, skirt, parts, KP.P, KP.D, KP.nb, KP.off, 0.03);   // 0.03：すねの袴の中の紺の筒（半径 0.11）が魔法使いの長靴より太く、押し出しの太さ 0.125 のままでは三角形の間でかすった
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
    // 胴：白い着物（戦士の胴の形のまま色を替える）・えんじの胴（胸当て）・白い帯
    const torso = parts.torso = pivot(0, 0, 0, body);
    ell(0.31, 0.235, 0.37, 16, 1, 0.64, COL.kimono, 0, 0.185, 0, torso, 'kimono');
    ell(0.14, 0.31, 0.12, 16, 1, 0.64, COL.armor, 0, 0.43, 0, torso, 'armor');   // なで肩（v5。2026-10-27 ユーザー「怒り肩になっている。元絵を参考になだらかに」）：首の付け根（0.49）から肩（0.37）へ下がる
    // v6 の肩（2026-10-27 ユーザー「侍の肩は図のようになだらかにする」：art_src/canon3d/user_feedback/samurai_shoulder_20261027.jpg の赤い線）：首の付け根（襟の横）から上腕の付け根の外まで、外へふくらむ弧。
    // 左右に上半分の楕円体（中心 x ±0.15・高さ 0.34、横 0.27・縦 0.15・奥行き 0.19）を置き（v7：えんじ。ユーザー「侍の肩の上の部分も赤いパーツで覆って」。上の円すい台も同じ色）、首の横の平らな所と、肩当てと首のあいだのへこみを埋める。肩当て（下の腕の中の丸い板）は、この弧の外の半分に沿わせる
    for (const sx of [1, -1]) { const g = new T.SphereGeometry(1, Math.round(18 * Q), Math.round(8 * Q), 0, Math.PI * 2, 0, Math.PI / 2), m = nm(new T.Mesh(g, mat(COL.armor)), 'armor'); m.scale.set(0.27, 0.15, 0.19); m.position.set(sx * 0.15, 0.34, 0); torso.add(m); }
    ell(0.295, 0.262, 0.33, 16, 1, 0.7, COL.armor, 0, 0.24, 0, torso, 'armor');            // 胴（前・後ろ・脇を包む）
    ell(0.298, 0.298, 0.03, 16, 1, 0.7, COL.armorD, 0, 0.395, 0, torso, 'armor');          // 胴の上のふち
    for (const zs of [1, -1]) for (const y of [0.17, 0.11]) box(0.36, 0.012, 0.01, COL.armorD, 0, y, zs * 0.19, torso, 'armor');   // 前後の板の段（下の 2 枚）
    for (const sx of [1, -1]) for (const zs of [1, -1]) box(0.05, 0.08, 0.03, COL.armorD, sx * 0.17, 0.40, zs * 0.145, torso, 'armor');   // 肩ひも（胴を吊る。肩の線より上に出さない）
    sph(0.035, 1.3, 0.9, 0.6, COL.cord, 0, 0.2, -0.205, torso, 8, 6, 'armor');             // 背中の結び目（見本の後ろ姿）
    for (const k of [1, -1]) { const t = box(0.022, 0.07, 0.012, COL.cord, k * 0.02, 0.15, -0.203, torso, 'armor'); t.rotation.z = k * 0.35; }
    ell(0.15, 0.2, 0.05, 14, 1, 0.8, COL.kimono, 0, 0.47, -0.01, torso, 'collar');     // 襟（低い。首を隠さない。v5：なで肩で下がった首の付け根を包む。v7：えんじの肩の上に白く見えるよう、少し外へ。上へ上げると首が隠れた＝Rneck）
    for (const k of [1, -1]) { const v = box(0.045, 0.13, 0.02, COL.kimonoD, k * 0.045, 0.4, 0.163, torso, 'collar'); v.rotation.z = k * 0.55; }   // 襟の合わせ（V。胴の上から見える）
    ell(0.252, 0.252, 0.09, 16, 1, 0.67, COL.belt, 0, 0.03, 0, torso, 'belt');            // 白い帯
    box(0.11, 0.08, 0.05, COL.belt, 0, 0.03, 0.18, torso, 'belt');                         // 帯の結び目（前）
    for (const k of [1, -1]) { const t = box(0.055, 0.12, 0.03, COL.belt, k * 0.032, -0.04, 0.19, torso, 'belt'); t.rotation.z = k * 0.15; }   // 結び目から下がる端
    // 左腰（+x）の刀と脇差：帯に差し、柄は前・上（体の真ん中寄り）、鞘の先は後ろ・下へ斜めに出る（見本）。黒い鞘・金の鍔・黒い柄（白い菱の巻き）
    const blade = (p, sheathLen, hiltLen, name) => {   // p の +y が柄の向き。鞘は −y へ
      box(0.05, sheathLen, 0.035, COL.sheath, 0, -sheathLen / 2, 0, p, name);
      box(0.054, 0.03, 0.04, COL.gold, 0, -sheathLen + 0.015, 0, p, name);                  // 鞘の先（こじり）
      cyl(0.05, 0.05, 0.018, 10, COL.gold, 0, 0.01, 0, p, name);                              // 鍔（金の丸）
      box(0.04, hiltLen, 0.034, COL.grip, 0, 0.02 + hiltLen / 2, 0, p, name);
      for (let i = 1; i < 4; i++) box(0.042, 0.012, 0.036, COL.gripW, 0, 0.02 + hiltLen * i / 4, 0, p, name);   // 柄巻き
      box(0.044, 0.02, 0.038, COL.gold, 0, 0.02 + hiltLen, 0, p, name); };                   // 柄頭
    const katana = parts.sword = pivot(...SAM.katP, torso);   // 刀 2 本は進行方向と平行（柄は前・上、鞘はうしろ・下。左右の傾きなし）。腕を振ると柄と鍔が袖・籠手に入るコマがあるのは気にしない（2026-11-03 ユーザー判断「このままでok」）
    katana.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...SAM.kat).normalize());
    { const k = pivot(0, 0, 0, katana); k.position.set(0, -0.02, 0); blade(k, 0.92, 0.26, 'katana'); }
    const waki = parts.wakizashi = pivot(...SAM.wakiP, torso);
    waki.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...SAM.waki).normalize());
    { const k = pivot(0, 0, 0, waki); k.position.set(0, -0.01, 0); blade(k, 0.66, 0.19, 'wakizashi'); }
    // 腕：肘までの広い白い袖（下へ少し広がる）・小さな肩当て（えんじの板を 3 枚重ねる。腕といっしょに振る）・前腕は赤い籠手・手は素肌
    for (const sx of [1, -1]) {
      const S = sx > 0 ? 'L' : 'R';
      const arm = parts['arm' + S] = pivot(sx * C.shX, C.shY, 0, torso);   // 肩の関節は共通の C.shX（2026-10-29：戦士と同じ）
      sph(0.1, 1, 0.6, 1.05, COL.kimono, 0, -0.13, 0, arm, 10, 7, 'sleeve');   // 袖の肩（なで肩：上の端を、胴の肩の線の高さまで下げる）
      ell(0.1, 0.135, C.UA - 0.1, 12, 1, 1.1, COL.kimono, 0, -0.13 - (C.UA - 0.1) / 2 + 0.01, 0, arm, 'sleeve');
      // 肩当て（2026-10-27 ユーザー指摘「肩の位置が変」：前は板を腕の外へ箱で並べ、肩の上の角から外へ浮いて見えた）。肩の上にかぶせる丸い板と、
      // 上腕の外がわを包む 3 段の板（腕の外の面だけを巻く筒の一部＝外へ ±57°。v8：ユーザー「赤いパーツがあるのは肩の方、外側だけで、腋の方、内側にはない」で ±100°から狭めた。下の段ほど少し広い）。腕の子＝腕といっしょに振る
      { const half = (r, h, y, c) => { const g = new T.CylinderGeometry(r, r * 1.04, h, Math.round(14 * Q), 1, true, sx > 0 ? Math.PI / 2 - 1.0 : -Math.PI / 2 - 1.0, 2.0), m = nm(new T.Mesh(g, mat(c)), 'sode'); m.material.side = T.DoubleSide; m.position.set(0, y, 0); m.scale.set(1, 1, 1.15); arm.add(m); return m; };
        { const d = nm(new T.Mesh(new T.SphereGeometry(1, Math.round(14 * Q), Math.round(6 * Q), 0, Math.PI * 2, 0, Math.PI / 2), mat(COL.armor)), 'sode'); d.scale.set(0.135, 0.125, 0.2); d.position.set(-sx * 0.065, -0.107, 0); d.rotation.z = -sx * 0.26; arm.add(d); }   // 肩の上の丸い板（v6：立ちで胴の x ±0.30・高さ 0.34 を中心に、肩の弧の外の半分にかぶせる。腕の開き 0.26 を打ち消して胴にそろえる。腕の子＝腕といっしょに振る。v8：上半分だけ＝腋の側へ垂れない）
        for (let i = 0; i < 3; i++) half(0.118 + i * 0.01, 0.07, -0.14 - i * 0.06, i % 2 ? COL.armorD : COL.armor);
        box(0.022, 0.18, 0.012, COL.cord, sx * 0.11, -0.2, 0.1, arm, 'sode'); }   // 板をつなぐ紐（前）
      const fore = parts['fore' + S] = pivot(0, -C.UA, 0, arm);
      // 袖（前腕）：ひじの少し下まで（前は 2026-10-27 ユーザー「袖を手首近くまで伸ばして」で手首の手前まで。2026-11-03 籠手を前腕に付けて短くした）。ひじの球で上の袖とつなぐ
      sph(0.128, 1, 0.9, 1.1, COL.kimono, 0, 0, 0, fore, 12, 8, 'sleeve');
      { const [y0, r0, r1] = SAM.kote, yH = C.HANDY + C.HAND * 0.9;   // 前腕を覆う赤い籠手（2D：袖はひじまで、前腕は手首まで籠手。色は胴と同じ赤。2026-11-03 ユーザー判断）
        ell(0.135, 0.14, -y0, 12, 1, 1.1, COL.kimono, 0, y0 / 2, 0, fore, 'sleeve');
        ell(0.142, 0.142, 0.025, 12, 1, 1.1, COL.kimonoD, 0, y0, 0, fore, 'sleeve');   // 袖口（肘の下）
        cyl(r0, r1, y0 - yH, 10, COL.armor, 0, (y0 + yH) / 2, 0, fore, 'kote'); }
      parts['hand' + S] = sph(C.HAND, 1, 1.05, 1, SKIN, 0, C.HANDY, 0.01, fore, 10, 7, 'hand');
      box(0.04, 0.07, 0.05, SKIN, 0, -0.27 - AX / 2, 0.08, fore, 'hand');
    }
    // 頭：顔・首・目・鼻・口・耳は共通のコード。黒髪（うしろへなでつけ）と髷
    const head = parts.head = pivot(0, C.headY, 0, torso); head.scale.setScalar(C.HS);
    CAN.buildHead(T, head, { mat, COL, Q, female: false, neckBackColor: null, face: Object.assign({}, CAN.FACEM, { ext: HAIR.ext }) });   // 正面の顔は男性の共通の顔（canon.FACEM。戦士・僧侶と同じ。2026-10-29）。ext：おでこを出す   // 首のうしろ半分は髪の色
    { // 髪：傭兵と同じ、頭を包む 1 つの丸い面（前はひたいより上・横は耳の上・うしろは首の上まで）
      const hg = new T.SphereGeometry(1, Math.round(24 * Q), Math.round(16 * Q)), hp = hg.attributes.position, CX = 0.226, CY = 0.18, CYL = 0.25, CZ = 0.23, OY = 0.29, OZ = -0.025;
      for (let i = 0; i < hp.count; i++) { const u = Math.max(0, -hp.getY(i)), rk = hp.getY(i) < 0 ? Math.sqrt(1 - Math.pow(u, 3)) / Math.max(1e-6, Math.sqrt(1 - u * u)) : 1;
        let x = hp.getX(i) * CX * (u > 0.999 ? 0 : rk), y = OY + hp.getY(i) * (hp.getY(i) < 0 ? CYL : CY), z = OZ + hp.getZ(i) * CZ * (u > 0.999 ? 0 : rk);
        if (z > 0.18) z = 0.18;
        const fr = Math.max(0, Math.min(1, (z - 0.04) / 0.06)), sd = Math.max(0, Math.min(1, (Math.abs(x) - 0.15) / 0.05)) * Math.max(0, Math.min(1, (z + 0.1) / 0.08));
        const lo = Math.max(0.355 * fr, 0.27 * sd);
        if (y < lo) y = lo;
        hp.setXYZ(i, x, y, z); }
      hg.computeVertexNormals(); const hr = nm(new T.Mesh(hg, mat(COL.hair)), 'hair'); head.add(hr);
      // 髷：頭の後ろ斜め上（2026-10-27 ユーザー「頭の上ではなく、頭の後ろ斜め上に」）。白い元結で結び、後ろへ少し傾ける
      { const mg = pivot(0, 0.4, -0.2, head); mg.rotation.x = -1.0;
        cyl(0.042, 0.048, 0.05, 10, COL.tie, 0, 0.02, 0, mg, 'hair');
        sph(0.068, 1.0, 0.9, 1.0, COL.hair, 0, 0.085, 0, mg, 10, 7, 'hair'); }
      // うなじ・耳のうしろ・もみあげ（傭兵と同じ）
      sph(0.1, 2.0, 0.55, 1.6, COL.hair, 0, 0.12, -0.12, head, 10, 8, 'hair');   // うしろ髪（うなじから下へ垂れる 2 つの球）は外した（2D に合わせる。2026-11-03 ユーザー判断）
      for (const sx of [1, -1]) sph(0.1, 1.25, 0.8, 1.0, COL.hair, sx * 0.15, 0.17, -0.1, head, 10, 8, 'hair');
      for (const sx of [1, -1]) box(0.03, 0.12, 0.07, COL.hair, sx * 0.197, 0.27, 0.06, head, 'hair');
    }
    // 動き：戦士（hero3d.js の pose の canon の道筋）と同じ。手に持つ物は無いので、両腕とも振る
    const RUNKICK = 1.6;   // 魔法使いと同じ
    let ampS = null, skirtMoved = true; const KK = CAN.KICK.samurai;   // KK：走りの蹴り上げ（hero3d_canon.js。袴は deformSkirt3 が蹴った脚の側の後ろの裾を跳ね上げ、kickPush で当たる所だけ押し出す）
    function pose(mode, t, o) {
      const run = mode === 'run', walk = mode === 'walk', moving = run || walk;
      const f = run ? 1.55 : 1.05, ph = t * Math.PI * 2 * f, s = Math.sin(ph), c = Math.cos(ph);
      let A = run ? 0.75 : 0.5;
      if (moving && o && o.stride > 0) {
        const want = Math.asin(Math.min(1, o.stride / (4 * (0.74 + LX) * (run ? 0.95 : 0.97)) * (run ? 0.65 : 1)));
        const tgt = Math.min(run ? 0.9 : 0.45, Math.max(run ? 0.45 : 0.2, want)); ampS = ampS == null ? tgt : ampS + (tgt - ampS) * 0.15; A = ampS;
      }
      const armA = run ? 0.95 : 0.5;
      // 走り：魔法使い・僧侶と同じ（2026-10-27 試走 No.2・4）。ももが後ろにある間だけ、遊脚のひざを深く曲げて、かかとを後ろへ大きく跳ね上げる（後ろの布の縁から見える）。歩きはローブの人の歩き
      const knee = sg => { if (!moving) return 0.02; const cs = sg * c, ss = sg * s, swing = Math.max(0, -cs), load = Math.max(0, cs) * Math.max(0, -ss); return run ? (0.5 + (RUNKICK - 0.5) * Math.sqrt(Math.max(0, ss))) * Math.pow(swing, 0.8) + 0.25 * load : 0.45 * Math.pow(swing, 0.9) + 0.1 * load; };
      let lowest = 0; const lg = [];
      for (const [leg, shin, foot, sg] of [[parts.legR, parts.shinR, parts.footR, 1], [parts.legL, parts.shinL, parts.footL, -1]]) {
        const th = moving ? sg * s * A + (run ? 0 : 0.04) : 0, kn0 = knee(sg), kn = run && KK ? CAN.kick(kn0, ph, sg, KK) : kn0;
        leg.rotation.x = th; shin.rotation.x = kn; foot.rotation.x = run && KK ? CAN.footAlong(th, kn) : -(th + kn) * (run ? 0.75 : 1); lg.push([leg === parts.legL ? 1 : -1, th, kn, kn0]);
        lowest = Math.max(lowest, KN * Math.cos(th) + (SH - 0.08) * Math.cos(th + kn) + 0.11);
      }
      body.position.y = moving ? baseY + (lowest - baseY) * (run ? 0.5 : 0.8) : baseY + Math.sin(t * 2.0) * 0.008;
      if (moving || skirtMoved) { deformSkirt3(lg, run); updateMachi(); skirtMoved = moving; }   // 立っているときは、いちど元に戻したら、形を計算しない
      for (const [arm, fore, sg] of [[parts.armR, parts.foreR, 1], [parts.armL, parts.foreL, -1]]) {
        const ar = moving ? -sg * s * armA : 0.02 * sg * Math.sin(t * 1.7);
        arm.rotation.x = ar; const fwd = Math.max(0, -ar) / armA;
        fore.rotation.x = run ? -1.25 - 0.4 * fwd : walk ? -0.2 - 0.35 * fwd : -0.1;
      }
      parts.armL.rotation.z = 0.26; parts.armR.rotation.z = -0.26;   // 手を体から離す（canon §1-8）
      torso.rotation.x = run ? 0.28 : walk ? 0.05 : 0; torso.rotation.y = moving ? s * (run ? 0.2 : 0.1) : 0; body.rotation.x = 0;
      head.rotation.x = run ? -0.22 : 0; head.rotation.y = moving ? -s * (run ? 0.1 : 0.05) : 0;
    }
    group.userData.parts = parts;
    pose('stand', 0);
    { const H = HAIR, Ln = { ...H.line, c: SAM.line[0], s: SAM.line[1] }; CAN.shellHead(T, parts.head, { line: (x, z) => z > Ln.z ? Ln.s + (Ln.c - Ln.s) * Math.max(0, 1 - Math.pow(Math.abs(x) / Ln.w, 2)) : null });   // 髪型（HAIR）
      parts.head.children.forEach(o => { if (o.isMesh || !o.children.some(c => c.name === 'hair')) return; o.position.set(0, H.knot.y, H.knot.z); o.rotation.x = H.knot.rx; o.scale.setScalar(H.knot.k);   // 髷：頭のてっぺん
        o.children.forEach(c => { if (c.isMesh && c.geometry.type === 'SphereGeometry') c.visible = false; });   // まん丸の髷をやめて水滴型（元結の上がふくらみ、先が細くなる回転体）
        const D = H.drop, pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new T.Vector2(Math.max(0.001, D.r * Math.sin(t * Math.PI) * Math.pow(1 - t, 0.6) * 1.6), D.l * t)); }
        const g = new T.Group(); g.position.set(0, D.y, 0); g.rotation.z = D.rz; o.add(g); const m = nm(new T.Mesh(new T.LatheGeometry(pts, Math.round(12 * Q)), mat(COL.hair)), 'hair'); m.scale.set(1, 1, D.sz); g.add(m); });
      parts.head.children.forEach(o => { if (!(o.isMesh && o.name === 'hair' && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius === 1)) return; const pa = o.geometry.attributes.position, v = new T.Vector3(); o.updateMatrix(); const M = o.matrix, Mi = new T.Matrix4().copy(M).invert();   // 耳の上で髪の下を削って耳を出す
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(M); if (Math.abs(v.x) > H.ear.x && v.z > H.ear.z && v.y < H.ear.y) { v.y = H.ear.y; v.applyMatrix4(Mi); pa.setXYZ(i, v.x, v.y, v.z); } } o.geometry.computeVertexNormals(); });
      for (const o of parts.head.children.slice()) if (o.isMesh && o.name === 'hair' && Math.abs(Math.abs(o.position.x) - 0.15) < 1e-6 && Math.abs(o.position.y - 0.17) < 1e-6) parts.head.remove(o); }   // 耳のうしろの髪の球を外す
    { const head = parts.head, F = Object.assign({}, CAN.FACEM, { ext: HAIR.ext }), FRr = F.FR, FWw = F.FW, XT = F.ext, FHh = 0.31 + XT, FYy = 0.205 + XT / 2, FZz = 0.02, FDd = 0.34, B = Object.assign({ n: 5, tip: 0.35, notch: 0.4, top: 0.47, w: 0.36, d: 0.014 }, SAM.bang);   // 前髪（2D：生え際から額へ、ぎざぎざの房）。顔の前の面に沿わせる
      const surf = (x, y) => { const ax = Math.max(0, Math.abs(x) - (FWw / 2 - FRr)), ay = Math.max(0, Math.abs(y - FYy) - (FHh / 2 - FRr)); return FZz + FDd / 2 - FRr + FRr * Math.sqrt(Math.max(0, 1 - (ax / FRr) ** 2 - (ay / FRr) ** 2)); };
      const yb = B.peak ? (x => { const a = Math.abs(x); return a < B.peak[1] ? B.peak[0] + (B.top - 0.02 - B.peak[0]) * a / B.peak[1] : B.top - 0.02; }) : (x => { const u = ((x + B.w / 2) / (B.w / B.n)) % 1; return B.tip + Math.abs(u - 0.5) * 2 * (B.notch - B.tip); });
      const bg = new T.BoxGeometry(B.w, 1, 0.02, B.n * 4, 5, 1), bp = bg.attributes.position;
      for (let i = 0; i < bp.count; i++) { const x = Math.max(-B.w / 2 + 1e-6, Math.min(B.w / 2 - 1e-6, bp.getX(i))), t = bp.getY(i) + 0.5, y0 = yb(x), y = y0 + t * (B.top - y0); bp.setXYZ(i, bp.getX(i), y, surf(x, y) + (bp.getZ(i) > 0 ? B.d : -0.01)); }
      bg.computeVertexNormals(); const bm = nm(new T.Mesh(bg, mat(COL.hair)), 'hair_bang'); head.add(bm);
      if (B.brow) for (const sx of [-1, 1]) { const [bw, bh, bx, by, ba] = B.brow, g = new T.BoxGeometry(bw, bh, 0.02), m = nm(new T.Mesh(g, mat(COL.hair)), 'brow'); m.position.set(sx * bx, by, surf(sx * bx, by) + 0.004); m.rotation.z = sx * ba; head.add(m); } }   // 太い眉（内がわが下がる＝きりっとした顔）
    for (const n of ['L', 'R']) for (const pr of [parts['arm' + n], parts['fore' + n]]) pr.children.forEach(o => { if (o.isMesh && (o.name === 'sleeve' || o.name === 'sode')) { o.scale.x *= SLEEVEK; o.scale.z *= SLEEVEK; if (o.name === 'sode') o.position.x *= SLEEVEK; } });   // 着物の袖と袖の上のえんじの板を細く（2026-10-29 ユーザー判断「侍の腕はいいけど、少し細くして」「袖は0.85」。腕の開き 0.26 は同じ）
    CAN.fitFoot(T, group, parts, false);   // 足（足袋と草履）の大きさは共通（戦士と同じ）
    CAN.fitTorsoTop(T, parts, 0.49);   /* 胴の上の端を肩の関節に（canon.fitTorsoTop。2026-10-29 ユーザー「全員、胴の上の端を肩の関節（0.44）に合わせる」）。TOP：今の胴の上の端 */
    CAN.fit(T, group, parts, 'samurai'); CAN.fitNeck(T, group, parts, 0.1); if (KK) CAN.addSoles(T, parts, 'samurai');   // 首の見える長さを共通の値（C.NECKV）にそろえる（長いぶんだけ頭を下げる。0.1：下げ幅の上限＝エルフ・女性と同じ）。   // 走りで蹴り上げる人は、靴の裏の色（背を合わせたあと）   // 体の大きさの段：男・戦闘職＝戦士と同じ（C.SIZE に無い id は 1）
    return { group, parts, pose };
  }
  L().buildSamurai = buildSamurai;
})(typeof window !== 'undefined' ? window : globalThis);
