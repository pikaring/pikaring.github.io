/* 武闘家（女性）の 3D（2026-10-26：作り直し）。形は、他の AI が絵（assets/hero/monk_front_0・side_0・back_0）から作った組み立て指示（tools/lowpoly_hero/specs/monk.json → ui/hero3d_specs.js）。
   骨組み・動き・顔は ui/hero3d_spec.js（主人公4人と同じ）。前の作り（手で組んだもの）は、前・横が人の形にならなかったのでやめた。
   canon（共通の決まり。docs/3d-canon/parts/monk.md）：袖・腕・ズボン・靴は指示書（specs/monk_canon.json）。胴着（上・帯・裾）と髪は、関節の位置から決める形と、指示書の箱・球では作れない形（なめらかに広がる裾・頭をおおう髪）なので、ここで組む。
   使い方：RQ.lowpoly.buildMonk(T, { toon, steps, q }) → { group, parts, pose }。前提：hero3d.js・hero3d_specs.js・hero3d_spec.js を先に読む。 */
(function (root) {
  const RQ = root.RQ = root.RQ || {};
  const L = () => RQ.lowpoly;
  const EYE = { w: 0.08, hi: 0.06, lo: 0.05, y: 0.26, top: 0x151515, bot: 0x444444, glint: 0xffffff, lash: 0x151515 };   // 大きな目：上がこい黒、下がうすい灰色、うちがわ上に白い光
  const FACE = {glint: [{w: 0.036, h: 0.042, dx: 0.012, dy: 0.047}], ext: 0.05};   // 女性の共通の顔（canon.FACEF）に重ねる例外   // 武闘家の顔（2026-10-29 ユーザー判断：案 B5、のち M6a、R1。ext：前髪を真ん中で分けて額の肌を髪の生え際まで見せる（僧侶と同じ 0.05）。顔の箱の上半分の前の側の横と上の角を FRt 0.02 に＝顔の横が前髪の下までまっすぐ。白目（白い点）は M3b の 0.036×0.042＝約 35% 小さく）。数は hero3d_canon.js の faceParts
  // SYNC2D（2026-11-02 ユーザー判断）：face＝顔の前半分で下を向いた面の明るさを前の面と同じに（あごの下の丸みが暗い茶色の帯＝ひげ・汚れに見えた）、bun＝お団子を頭の上の左右へ [向き x, y, z, 大きさ, 頭への埋め方]（2D の大きな丸いお団子 2 つ。前の 0.8 倍・うしろ斜め上から変えた）、tail＝垂れるリボンの長さの倍率、gi＝合わせ目を 2D の向き（首の真ん中から本人の右のわきへ。金のボタン 3 つと金のふち）、pants＝ズボンのすね・ひざの太さ（ももは下ほど太く）、ankle＝すそを上げて素足に靴（足首の金の帯は外す）
  const SYNC2D = { face: 1, bun: [0.75, 0.6, -0.25, 1.4, 0.78], tail: 1.5, gi: 1, pants: 1.3, ankle: 1 };
  const BODY = { slim: { x: 0.88, z: 0.92 } };   // 胴（胴着・帯）を細く（2026-10-29 ユーザー判断「胴体が太って見える」「武闘家の体を細くしてみて」→ 案 A。武闘家だけの数）。腕（肩の関節）は細くしたぶん内へ寄せて、腕と胴のすき間を前と同じに（「Aで腕を寄せる」）
  const HEAD = { down: 0.015, refit: false };   // 頭の下げ方（2026-10-29 ユーザー判断：N1。胴の座標で 0.015 下げる）。頭の大きさと首は、女性の共通ルール canon.femaleHead（C.FHEAD 0.83 倍・首 C.NECKVF。2026-10-29 ユーザー判断「腕の太さに合わせて顔を小さく」「首は0.02」から女性全員へ）
  // 髪を顔の輪郭に合わせる数（2026-10-29 ユーザー判断：案 B5。「頭が大きくて着ぐるみのよう。横から見て髪の毛が顔の輪郭に合うように」）。cz・k：頭の丸い髪の中心の奥行きと倍率（x・y・z）、bang：前髪の板（null＝付けない。丸い髪のふちが前髪）、lock：横髪の x・z・幅・奥行きの倍率、nape：うなじの髪の z・幅・奥行きの倍率。
  // 前の形は { cz: -0.035, k: [1, 1, 1.04], bang: [0.42, 0.11, 0.14, 0.15], lock: [0.228, 0.045, 0.4, 0.9], nape: [-0.11, 1.16, 0.7] }
  const HAIRFIT = { ...L().canon.BOB, slope: [0.07, 0.05], shell: {r: 0.255, h: 0.235, y: 0.335, z: -0.03, front: 0.2, lo: 0.35}, bun: 0.8, tufts: [[-0.12, 0.8], [-0.06, 0.95], [0.06, 0.9], [0.12, 0.8]] };   // 頭の髪の数は共通の canon.BOB（エルフも同じ。2026-10-29 ユーザー判断「帽子がないので武闘家と共通の作りにするのが正解」）。slope は胴着の肩
  // 2026-10-29 案2（ユーザー「武闘家は案2で」）：頭は 1 倍のまま、髪の外形を半径 0.2875→0.255・高さ 0.285→0.235、お団子 0.8 倍（bun）に小さくした（髪のボリュームを減らす）。
  // shell・tufts（2026-10-29 ユーザー判断：案 R1「僧侶の帽子をかぶった頭の形が人間の頭の形だから，それに準拠させる」）：髪の外形＝僧侶 P1 の帽子をかぶった頭の外形（帽子の丸み 半径 0.25×1.15・高さ 0.25×1.14・ふちの高さ 0.335・前後 −0.03。顔の大きさでそろえた縮尺 1.00）。すその下は細くせず今のうしろ髪の式（0.35）で首の上まで（案A）。前は 0.20 より前へ出さない。前髪は真ん中の房を外して真ん中分け
  const HAIR = 0xf85397, HAIRD = 0xe0407f,   /* 髪は 2D と同じピンク（2026-10-27 ユーザー判断：3D だけ茶色を試してやめた） */ RED = 0xbe1e2d, REDD = 0x8a1622, LINING = 0x5c0e18, GOLD = 0xfbca19, RIBBON = 0xd0202a;

  // canon の武闘家：胴着（帯＝ひじの高さ、裾＝ひじから拳まで。帯から裾へなめらかに広がる）と、丸い頭をおおう髪
  function buildCanon(T, opt) {
    const m = L().buildFromSpec(T, 'monk_canon', { ...opt, female: true, face: L().canon.face(L().canon.FACEF, (typeof window !== 'undefined' && window.__MONKFACE) || FACE) });   // window.__MONKFACE：顔の案の比べ用（tools/lowpoly_hero/face_monk.js）
    const { group, parts: P } = m, Q = opt.q || 1;
    let proto = null; P.torso.traverse(o => { if (!proto && o.isMesh) proto = o.material; });
    const toon = proto.isMeshToonMaterial;
    const mat = (c, side) => { const k = proto.clone(); k.color = new T.Color(c).multiplyScalar(toon ? 0.74 : 1); if (side) k.side = T.DoubleSide; return k; };
    const put = (geo, c, x, y, z, par, name, side) => { const o = new T.Mesh(geo, mat(c, side)); o.position.set(x, y, z); if (name) { o.name = name; P[name] = o; } par.add(o); return o; };
    // 共通の素肌の胴（円柱）は、胴着が全部おおうので外す（肩の上端が胴着より上にあり、走りで前へかたむくと背中の上に肌が出ていた）
    for (const o of [...P.torso.children]) if (o.isMesh && !o.name && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop === 0.22 && o.geometry.parameters.radiusBottom === 0.15) P.torso.remove(o);   // 色でなく形で見分ける（共通の直しで素肌の色が変わり、色で見分けると外れずに、胴着の肩より上へ肌色の円柱が出ていた）
    // （この直しは共通の buildHead に移した。2026-10-29）共通の首の円柱（buildHead）の上の端を、顔の箱の中まで 0.04 のばす（上のふたが、あごの下の丸みとのすき間から明るい 1 画素として見えていた。ワルキューレと同じ直し）
    const HD = (typeof window !== 'undefined' && window.__MONKHEAD) || HEAD;   // 頭を下げる（2026-10-29 ユーザー「B5 でもう少し首を下げてみて」）。down：胴の座標で下げる量、refit：背（足の裏〜顔の上端）を合わせ直す（体が少し大きくなる）。window.__MONKHEAD は比べ用
    if (HD && HD.down) { P.head.position.y -= HD.down; if (HD.refit) L().canon.fit(T, group, P, 'monk'); }
    // 関節の高さ（胴の座標。立ちの姿）：ひじ・拳（手の中心）・肩
    group.updateMatrixWorld(true);
    const inTorso = o => P.torso.worldToLocal(o.getWorldPosition(new T.Vector3()));
    const yE = (inTorso(P.foreL).y + inTorso(P.foreR).y) / 2, yH = (inTorso(P.handL).y + inTorso(P.handR).y) / 2, yS = P.armL.position.y;
    const yB = yE, yN = yS;   // 帯の中心、胴着の肩の上端＝肩の関節（共通 v5.7b：肩の関節＝胴の上端。ユーザー指摘「肩は胴体の上部と同じ高さに」）
    // 上着（帯〜肩）：胸が背中より少し前へ出る。腰は細く、肩へ広がる
    const WX = 1.12, WZ = 0.74, rW = 0.19, rS = 0.235;
    { const h = yN - yB, g = new T.CylinderGeometry(rS, rW, h, Math.round(16 * Q)); const o = put(g, RED, 0, yB + h / 2, 0.01, P.torso, 'gi_top'); o.scale.set(WX, 1, WZ);
      const ch = put(new T.SphereGeometry(0.16, Math.round(12 * Q), Math.round(8 * Q)), RED, 0, yS - 0.12, 0.05, P.torso, 'gi_chest'); ch.scale.set(1.25, 0.75, 0.8);
      const sh = put(new T.SphereGeometry(rS, Math.round(16 * Q), Math.round(6 * Q), 0, Math.PI * 2, 0, Math.PI / 2), RED, 0, yN - 0.01, 0.01, P.torso, 'gi_shoulder'); sh.scale.set(WX, (typeof window !== 'undefined' && window.__MONKHAIR && window.__MONKHAIR.shoulder) || HAIRFIT.shoulder || 0.16, WZ); }   // shoulder：肩の丸い面の高さの倍率（なで肩の試し。2026-10-29 ユーザー「肩をなだらかにするといいね」。既定 0.16）
    // 立ち襟（金の縁）と、斜めの合わせ・金ボタン
    L().canon.shoulderCone(T, P.torso, mat(RED), { yS: yN, female: true, Q });   // なで肩（共通。僧侶と同じ円すい台。2026-10-29 ユーザー「肩のなだらかさも大事なポイントだ」）
    put(new T.CylinderGeometry(0.1, 0.11, 0.03, Math.round(14 * Q)), RED, 0, yN + 0.005, 0.0, P.torso, 'gi_collar').scale.set(1, 1, 0.9);   // 低い立ち襟（首は埋めない）
    { const yC = P.head.position.y + 0.05 * P.head.scale.y, hC = yC - yN; put(new T.CylinderGeometry(0.1, 0.11, hC, Math.round(14 * Q), 1, true, Math.PI / 2, Math.PI), RED, 0, yN + hC / 2, 0.0, P.torso, 'gi_collar_back', true).scale.set(1, 1, 0.9); }   // 立ち襟のうしろ半分だけ あごの高さまで高く：うしろの首を隠し、うしろ髪の下に自然につながる（前の首は出す）
    put(new T.CylinderGeometry(0.108, 0.108, 0.016, Math.round(14 * Q)), GOLD, 0, yN + 0.022, 0.0, P.torso, 'gi_collar_gold').scale.set(1, 1, 0.9);
    { const YK = (typeof window !== 'undefined' && window.__MONKHAIR && window.__MONKHAIR.yoke) || HAIRFIT.yoke; if (YK) { const [rt, rb, h] = YK; put(new T.CylinderGeometry(rt, rb, h, Math.round(20 * Q)), RED, 0, yN + 0.005 - h / 2, 0.01, P.torso, 'gi_yoke').scale.set(WX, 1, WZ); } }   // yoke [上の半径, 下の半径, 高さ]：首の付け根から肩先へなだらかに下がる肩の布（2026-10-29 ユーザー「首の横は鎖骨の部分で，その先が肩。肩が鎖骨より上に出っ張っているのをなだらかにしたい」）。袖の上の端は、この布の下に隠れる
    { const rc = new T.Raycaster(), body = [P.gi_top, P.gi_chest]; group.updateMatrixWorld(true);
      const front = (x, y) => { const o = P.torso.localToWorld(new T.Vector3(x, y, 1)), d = P.torso.localToWorld(new T.Vector3(x, y, 0)).sub(o).normalize(); rc.set(o, d); const h = rc.intersectObjects(body)[0]; return h ? P.torso.worldToLocal(h.point.clone()).z : 0.15; };   // 胴着の前の面の z
      for (const [x, y] of [[0.035, yN - 0.005], [0.075, yN - 0.06], [0.11, yN - 0.115]]) put(new T.BoxGeometry(0.04, 0.035, 0.03), GOLD, x, y, front(x, y) + 0.004, P.torso, 'gi_button'); }   // 斜めの合わせに金ボタン 3 つ（面から少し出す）
    // 帯（前で結ぶ。背中に肌が出ない）
    { const b = put(new T.CylinderGeometry(rW + 0.016, rW + 0.022, 0.075, Math.round(16 * Q)), GOLD, 0, yB, 0.01, P.torso, 'sash_belt'); b.scale.set(WX, 1, WZ);
      put(new T.BoxGeometry(0.075, 0.065, 0.05), GOLD, 0.05, yB, (rW + 0.012) * WZ + 0.02, P.torso, 'sash_knot').rotation.z = 0.15; }
    // 2026-10-27 ユーザー指摘「ワルキューレと武闘家も裾が短すぎてミニスカ状態なので少し裾を伸ばして」：拳の下から 0.08 長く（ももの 3/4 ほど。前後の厚みは今のまま＝張り出させない）
    // 裾（帯の下〜拳）：前と後ろの 2 枚。帯から曲線でなめらかに広がる（段・台にしない）。脇は 0.3 rad ずつ重ね、左右の角は丸める。
    // 歩き・走りでは、前へ出たももに合わせて前の 1 枚、後ろへ出たももで後ろの 1 枚を曲げる。布全体を回さず、真前（真後ろ）ほど大きく・脇ほど小さく曲げる
    // （脇は動かないので、脇の角が垂れたり、前と後ろのあいだにすき間が開いたりしない。以前は 1 枚ごと回していて、走りで角がつららに見え、横から脚がすき間に見えた）
    const top = yB - 0.035, len = Math.max(0.2, top - (yH - 0.02)) + 0.08, r0 = 0.225, r1 = 0.275;
    const prof = k => { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new T.Vector2((r0 + (r1 - r0) * Math.sin(Math.min(1, t / 0.55) * Math.PI / 2)) * k, -len * t)); } return pts; };
    const SEG = Math.round(24 * Q), OV = 0.3, sk = {}, cloth = [];
    const round = (g, ph0) => {   // 布の左右の角を丸める：端に近いほど裾を持ち上げる（角が切れ端に見えない）
      const pa = g.attributes.position, c = ph0 + Math.PI / 2 + OV, half = Math.PI / 2 + OV, W = 0.4, LIFT = 0.06;
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), y = pa.getY(i); let d = Math.atan2(x, z) - c; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); const e = Math.max(0, Math.min(1, (d - (half - W)) / W)); pa.setY(i, y + LIFT * e * e * Math.min(1, -y / len)); }
      g.computeVertexNormals(); return g; };
    for (const [n, k] of [['F', 1], ['B', 0.985]]) {
      const ph0 = (n === 'F' ? -Math.PI / 2 : Math.PI / 2) - OV, sg = n === 'F' ? 1 : -1;   // sg：その 1 枚が向く側（+z 前・-z 後ろ）
      const pv = new T.Group(); pv.position.set(0, top, 0.01); pv.scale.set(WX, 1, WZ * 1.05); P.torso.add(pv); P['skirt' + n] = sk[n] = pv;
      for (const [g, c, nm] of [[new T.LatheGeometry(prof(k).reverse(), SEG, ph0, Math.PI + 2 * OV), RED, 'jacket_skirt_hem'], [new T.LatheGeometry([new T.Vector2(r1 * k + 0.008, -len - 0.003), new T.Vector2(r1 * k + 0.006, -len + 0.03)], SEG, ph0, Math.PI + 2 * OV), GOLD, 'gold_hem']]) {
        const o = put(round(g, ph0), c, 0, 0, 0, pv, nm, true), pa = o.geometry.attributes.position, w = new Float32Array(pa.count);
        if (nm === 'jacket_skirt_hem') { o.material.side = T.FrontSide; const ln = new T.Mesh(o.geometry, mat(LINING)); ln.material.side = T.BackSide; ln.name = 'skirt_lining'; pv.add(ln); }   // 裾の内側は影の濃い赤（外は胴着の赤）。後ろの布が上がった所から見える前の布の内側が、明るい赤だと脚のあいだの しっぽに見えた
        for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i); w[i] = Math.pow(Math.max(0, sg * z / Math.hypot(x, z)), 0.8); }   // 曲げの重み：真前（真後ろ）1、脇 0
        cloth.push({ n, g: o.geometry, p0: Float32Array.from(pa.array), w });
      } }
    const tails = new T.Group(); tails.position.set(0, top, 0.01); tails.scale.set(WX, 1, WZ * 1.05); P.torso.add(tails);
    { const z = r0 * 1.0 + 0.012;   // 帯の前のたれ（前の裾の真ん中と同じだけ曲げる）
      put(new T.BoxGeometry(0.045 / WX, 0.2, 0.02), GOLD, 0.035 / WX, -0.1, z + 0.02, tails, 'sash_tail1').rotation.set(-0.1, 0, -0.04);
      put(new T.BoxGeometry(0.04 / WX, 0.15, 0.02), 0xe0b010, 0.085 / WX, -0.075, z + 0.018, tails, 'sash_tail2').rotation.set(-0.1, 0, 0.08); }
    const bend = (F, B) => {   // F・B：前・後ろの 1 枚の曲げ（rad。帯の下を軸に、+ は裾が後ろへ）
      for (const c of cloth) { const th = c.n === 'F' ? F : B; if (c.th === th) continue; c.th = th; const pa = c.g.attributes.position, a = pa.array, p0 = c.p0;
        for (let i = 0; i < pa.count; i++) { const q = th * c.w[i], cs = Math.cos(q), sn = Math.sin(q), y = p0[i * 3 + 1], z = p0[i * 3 + 2]; a[i * 3 + 1] = y * cs - z * sn; a[i * 3 + 2] = y * sn + z * cs; }
        pa.needsUpdate = true; c.g.computeVertexNormals(); c.g.computeBoundingSphere(); }
      tails.rotation.x = F; };
    // 髪：頭の上・うしろ・横を 1 つの丸い面で包む（横から見て丸い頭）。ひたいは前髪でおおう。顔の前の面は出す
    const HF = { ...HAIRFIT, ...((typeof window !== 'undefined' && window.__MONKHAIR) || {}) };   // window.__MONKHAIR：髪の合わせ方の比べ用（tools/lowpoly_hero/face_monk.js）
    L().canon.bobHair(T, P.head, { HF, HAIR, put, Q, side: (sx, { R, cy, cz, kx, ky, kz, supK, domeK, shellPt }) => { const hp = P.head;   // 髪は共通の canon.bobHair（エルフも同じ作り）。ここはお団子だけ
        // お団子：頭の後ろ斜め上の左右（2026-10-27 ユーザー「侍の丁髷のような角度で、武道家の場合はそれが頭の両サイドに」）。付け根は頭の面に置き、後ろ・外へ傾ける
        // 付け根に金の輪（ドット絵の金の帯）と小さな赤いリボン（結び目と短い輪 2 つ。顔の横へ垂らさない：v6 の指摘 7「顔の横の赤い縦線を出さない」）
        { const d = new T.Vector3(sx * 0.5, 0.62, -0.6).normalize(), bp = new T.Group(); if (shellPt) { const q = shellPt.dir(d, 0.93); bp.position.set(q.x, q.y, q.z); } else { const sk = supK(d) * domeK(d); bp.position.set(d.x * R * kx * 0.93 * sk, cy + d.y * R * ky * 0.93, cz + d.z * R * kz * 0.93 * sk); }   /* shellPt：頭の外形（canon.bobHair の HF.shell。R1）の上に同じ埋め方（0.93）で載せる（ユーザー「お団子はその上に載せる」） */ hp.add(bp);   // 高さは変えない（上へ押し出すと頭のてっぺんが 0.02 上がった）
          bp.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d); if (HF.bun) bp.scale.setScalar(HF.bun);   // bun：お団子（付け根・輪・結び目ごと）の大きさ（案2 で 0.8。垂れるリボンは頭に付くので変わらない）
          put(new T.CylinderGeometry(0.062, 0.075, 0.05, Math.round(10 * Q)), HAIR, 0, 0.01, 0, bp, 'hair_bun_base');
          put(new T.SphereGeometry(0.108, Math.round(12 * Q), Math.round(8 * Q)), HAIR, 0, 0.1, 0, bp, 'hair_bun').scale.set(1, 0.92, 1);
          put(new T.CylinderGeometry(0.082, 0.082, 0.022, Math.round(10 * Q)), GOLD, 0, 0.035, 0, bp, 'hair_bun_ring');
          const rb = new T.Group(); rb.position.set(0, 0.035, -0.085); bp.add(rb);   // リボン：付け根の後ろがわ（頭の後ろ・下を向く側）
          put(new T.BoxGeometry(0.04, 0.04, 0.035), RIBBON, 0, 0, 0, rb, 'bun_ribbon_knot');
          for (const s of [-1, 1]) put(new T.BoxGeometry(0.065, 0.04, 0.025), RIBBON, s * 0.05, 0, -0.004, rb, 'bun_ribbon_loop').rotation.z = s * 0.35;
          { const tg = new T.Group(); tg.position.set(bp.position.x + sx * 0.07, bp.position.y - 0.03, bp.position.z + 0.02); hp.add(tg);   // 垂れるリボン 2 本（2026-10-29 試走のあとユーザー判断「2D の絵だと、お団子に赤いリボンがついてる…追加」「リボンはまっすぐ」）：お団子の付け根の外側から、頭の外へ真下に垂らし、少し外へ開く。帯の先はまっすぐ。走り・歩きでなびく（下の pose）
            for (const s of [-1, 1]) { const t = new T.Group(); t.position.z = s * 0.025; t.rotation.z = sx * (0.22 + s * 0.08); t.userData.rz = t.rotation.z; t.userData.k = s; tg.add(t); (P.ribbonTails = P.ribbonTails || []).push(t); put(new T.BoxGeometry(0.05, 0.2, 0.015), RIBBON, 0, -0.1, 0, t, 'bun_ribbon_tail'); } } }
    } });
    { const SL = (typeof window !== 'undefined' && window.__MONKHAIR && window.__MONKHAIR.slope) || HAIRFIT.slope; if (SL) { const [drop, d] = SL;   // slope [袖の外側を下げる量, 袖の中の上うでの肌の筒の上を下げる量]：肩先が鎖骨の線より上に出っ張らない（2026-10-29 ユーザー「首の横は鎖骨の部分で，その先が肩。肩が鎖骨より上に出っ張っているのをなだらかにしたい」）。袖の上の端を、内側（胴の側）はそのまま、外へ向かって斜めに下げる。腕を外へ 0.26 rad 開いているので、そのぶん外側は高くなっていた
      for (const [n, sx] of [['L', 1], ['R', -1]]) { const arm = P['arm' + n], sl = P['jacket_sleeve' + n];
        if (sl) { const pa = sl.geometry.attributes.position; let yt = -Infinity, r = 0; for (let i = 0; i < pa.count; i++) { yt = Math.max(yt, pa.getY(i)); r = Math.max(r, Math.abs(pa.getX(i))); } for (let i = 0; i < pa.count; i++) if (pa.getY(i) > yt - 1e-4) pa.setY(i, pa.getY(i) - drop * Math.max(0, Math.min(1, (sx * pa.getX(i) + r) / (2 * r)))); pa.needsUpdate = true; sl.geometry.computeVertexNormals(); }
        for (const o of arm.children) { const q = o.isMesh && !o.name && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters; if (!q || q.height < 0.3) continue; const ng = new T.CylinderGeometry(q.radiusTop, q.radiusBottom, q.height - d, q.radialSegments); o.geometry.dispose(); o.geometry = ng; o.position.y -= d / 2; } } } }
    // 動き：骨組みの動きのあとに、裾を ももに合わせて持ち上げる（走りの蹴り上げ・足首・靴の裏は共通：hero3d_canon.js の KICK）
    const pose0 = m.pose, KF = 1.0, KB = 0.9;
    m.pose = (mode, t, o) => {
      pose0(mode, t, o);
      const tr = P.torso.rotation.x, a = P.legL.rotation.x - tr, b = P.legR.rotation.x - tr;
      bend(Math.min(0, a, b) * KF, Math.max(0, a, b) * KB);
      { const run = mode === 'run', walk = mode === 'walk', ph = t * Math.PI * 2 * (run ? 1.55 : 1.05);   // リボンのなびき（ユーザー「リボンはこれで入れて」＝monk_ribbon_run.gif）：走りは後ろへ 0.55 rad、足の運びの 2 倍の速さで前後 ±0.25・左右 ±0.12、歩きは 0.15・±0.1・±0.05、立ちは止める。2 本は少しずらす
        for (const r of P.ribbonTails || []) { r.rotation.x = run ? 0.55 + 0.25 * Math.sin(ph * 2 + r.userData.k * 0.6) : walk ? 0.15 + 0.1 * Math.sin(ph * 2 + r.userData.k * 0.6) : 0; r.rotation.z = r.userData.rz + (run ? 0.12 : walk ? 0.05 : 0) * Math.sin(ph * 2 + 1 + r.userData.k); } }
    };
    L().canon.fitTorsoTop(T, P, 0.39);   /* 胴の上の端を肩の関節に（canon.fitTorsoTop。2026-10-29 ユーザー「全員、胴の上の端を肩の関節（0.44）に合わせる」）。TOP：今の胴の上の端 */
    { group.updateMatrixWorld(true); const SL = BODY.slim, yA = P.armL.position.y - 0.14, rc = new T.Raycaster(P.torso.localToWorld(new T.Vector3(1, yA, 0)), P.torso.localToWorld(new T.Vector3(-1, yA, 0)).sub(P.torso.localToWorld(new T.Vector3(1, yA, 0))).normalize()), hit = rc.intersectObjects(['gi_top', 'gi_chest'].map(n => P.torso.getObjectByName(n)), false)[0], half = hit ? P.torso.worldToLocal(hit.point.clone()).x : 0;   // 脇の下の高さ（肩の関節の 0.14 下）で、胴の外側の x（横から光線を当てて測る）
      const dx = half * (1 - SL.x);   // 胴を細くしたぶん（脇の下の高さで）、肩の関節を内へ寄せる＝腕と胴のすき間は前と同じ
      const names = new Set(['gi_top', 'gi_chest', 'gi_shoulder', 'sash_belt', 'sash_knot', 'gi_button']);
      P.torso.children.forEach(o => { if (o.isMesh && names.has(o.name)) { o.scale.x *= SL.x; o.scale.z *= SL.z; o.position.x *= SL.x; o.position.z *= SL.z; } });   // すそ（前後 2 枚）は細くしない：脚の幅は同じなので、細くすると歩き・走りで脚がすそを抜けた（R3 back walk 0→39 など）
      for (const n of ['L', 'R']) P['arm' + n].position.x -= Math.sign(P['arm' + n].position.x) * dx; P.slimDX = dx; }

    { const MS = SYNC2D;   // 2D に寄せる（2026-11-02 ユーザー判断「武闘家はかなり良くなったのでこれにする」。案 monk_2d_plan）
      const hp = P.head;
      if (MS.face) hp.traverse(o => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.widthSegments === 8 && o.parent === hp) { const n = o.geometry.attributes.normal, pa = o.geometry.attributes.position, v = new T.Vector3(); for (let i = 0; i < n.count; i++) { v.fromBufferAttribute(n, i); if (pa.getZ(i) > 0 && v.y < 0) { v.y *= 1 - MS.face; v.z = Math.max(v.z, 0.6 * MS.face); v.normalize(); n.setXYZ(i, v.x, v.y, v.z); } } n.needsUpdate = true; } });   // 顔の前の面の丸み（下の角）の明るさを、前の面と同じに
      if (MS.bun) { const [bx, by, bz, bk, emb] = MS.bun, sh = HAIRFIT.shell; const bps = []; hp.traverse(o => { if (o.name === 'hair_bun_base') bps.push(o.parent); });
        for (const bp of bps) { const sx = Math.sign(bp.position.x), d = new T.Vector3(sx * bx, by, bz).normalize(), t = 1 / Math.hypot(d.x / sh.r, d.y / sh.h, d.z / sh.r), old = bp.position.clone();
          bp.position.set(d.x * t * emb, sh.y + d.y * t * emb, sh.z + d.z * t * emb); bp.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d); bp.scale.setScalar(bk);
          for (const tg of hp.children) if (tg.isGroup && tg !== bp && tg.children.some(c => (P.ribbonTails || []).includes(c)) && Math.sign(tg.position.x) === sx) tg.position.add(bp.position.clone().sub(old)); } }
      if (MS.tail !== 1) for (const t of P.ribbonTails || []) for (const c of t.children) { c.scale.y = MS.tail; c.position.y *= MS.tail; }
      if (MS.gi) { P.torso.children.forEach(o => { if (o.name === 'gi_button') o.position.x = -o.position.x; });   // 合わせ目を 2D と同じ向き（首の真ん中から、本人の右＝絵の左のわきへ）
        group.updateMatrixWorld(true); const rc = new T.Raycaster(), body = ['gi_top', 'gi_chest'].map(n => P.torso.getObjectByName(n)), inv = new T.Matrix4().copy(P.torso.matrixWorld).invert();
        const hit = (x, y) => { rc.set(new T.Vector3(x, y, 2).applyMatrix4(P.torso.matrixWorld), new T.Vector3(0, 0, -1).transformDirection(P.torso.matrixWorld)); const h = rc.intersectObjects(body, false)[0]; return h ? h.point.applyMatrix4(inv).z : 0.12; };
        const yN0 = P.armL.position.y, x0 = 0, y0 = yN0 + 0.0, x1 = -0.15, y1 = yN0 - 0.15, w = 0.022, L2 = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L2, uy = (y1 - y0) / L2, g = new T.BoxGeometry(1, 1, 1, 1, 10, 1), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const tt = p.getY(i) + 0.5, s2 = p.getX(i) * w, x = x0 + ux * L2 * tt + uy * s2, y = y0 + uy * L2 * tt - ux * s2; p.setXYZ(i, x, y, hit(x, y) + (p.getZ(i) > 0 ? 0.004 : -0.01)); }
        g.computeVertexNormals(); put(g, GOLD, 0, 0, 0, P.torso, 'gi_edge'); }
      if (MS.pants !== 1) for (const n of ['L', 'R']) for (const nm of ['pants_thigh', 'pants_knee', 'pants_shin']) { const o = P[nm + n] || group.getObjectByName(nm + n); if (!o) continue; if (nm === 'pants_thigh') { const pa = o.geometry.attributes.position, hh = o.geometry.parameters.height; for (let i = 0; i < pa.count; i++) { const k = 1 + (MS.pants - 1) * Math.max(0, Math.min(1, 0.5 - pa.getY(i) / hh)); pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * k); } pa.needsUpdate = true; o.geometry.computeVertexNormals(); } else { o.scale.x *= MS.pants; o.scale.z *= MS.pants; } }   // ももは上（腰）を細いまま、下ほど太く
      if (MS.ankle) for (const n of ['L', 'R']) { const sh2 = group.getObjectByName('pants_shin' + n), cf = group.getObjectByName('pants_cuff' + n), ag = group.getObjectByName('ankle_gold' + n);   // 素足に靴（2D：すその下に足首の肌）。すそを上げる
        const up = MS.ankle === 1 ? 0.06 : MS.ankle; if (cf) cf.position.y += up; if (ag) ag.visible = false; if (sh2) { const b = sh2.geometry.parameters.height, k = (b - up) / b; sh2.scale.y *= k; sh2.position.y += up / 2; } }
    }
    L().canon.femaleHead(T, group, P, m.pose, L().canon.C.FNECKD, 1);   // 頭は 1 倍（武闘家は女性の頭 0.83 倍の例外。2026-10-29 ユーザー判断「頭の大きさを変えずに、武闘家の髪の毛のボリュームを減らすのがいいかも」「武闘家は案2で」）。首は femaleHead の手順（正面 12 ドット・2 行）   // 女性の頭（共通。C.FHEAD 0.83 倍・首を C.NECKV にそろえて C.FNECKD 下げる）
    return m;
  }

  L().buildMonk = (T, opt = {}) => opt.canon ? buildCanon(T, opt) : L().buildFromSpec(T, 'monk', { ...opt, eye: EYE, footDrop: 0.025, torsoExtra: 0.08, headScale: 0.95, neck: 0.03 });
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildMonk: L().buildMonk };
})(typeof window !== 'undefined' ? window : globalThis);
