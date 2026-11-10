/* 3D の主人公・主人公候補の共通の決まり（案。docs/3d-canon/canon.md。ユーザーの OK が出るまで、ゲームの見た目は変えない＝ opt.canon を付けたときだけ使う）。
   骨組みの数字（戦士が基準）と、頭（顔の箱・目・鼻・口・首・耳）を作る共通のコード、背（足の裏〜顔の上端）で全体の倍率を決める関数を持つ。
   使い方：RQ.lowpoly.canon.buildHead(T, head, { mat, COL, female, Q })、RQ.lowpoly.canon.fit(T, group, parts)。前提：hero3d.js を先に読む。 */
(function (root) {
  const RQ = root.RQ = root.RQ || {};
  const L = () => RQ.lowpoly;
  const C = {
    BACK: 1.65,               // 背（足の裏〜顔の上端）。全員同じ（世界の長さ u。heroH 1.8 のとき）
    LEG: 0.74 + 0.74 * 0.4,   // 股の高さ（足の裏の厚みを除く）＝戦士の案 B（脚 1.4 倍）
    KN: (0.74 + 0.74 * 0.4) / 2, SH: (0.74 + 0.74 * 0.4) / 2,
    baseY: 0.74 + 0.74 * 0.4 + 0.03,
    legX: 0.145, shX: 0.29, shY: 0.44,   // 腰の関節の x、肩の関節の x（男性）・高さ。2026-10-29 ユーザー判断（案C）：肩の関節を内・下へ（0.335・0.46 → 0.29・0.44。腕の開き 0.26 のまま腕と胴がつながる）
    UA: 0.4125, EYECUT: 0.35,   // 顔の前の向きとカメラの向きの内積が、これ以下なら目・鼻・口を消す（0.35＝約 70°）
    HANDY: -0.3275,           // 肩〜ひじ、ひじ〜手の中心（戦士と同じ）
    headY: 0.515, HS: 0.9 * 1.3 * 0.81, NK: -0.03, NECKV: 0.0458,   // 頭の関節の高さ、頭の倍率、首。NECKV：首の見える長さ（正面。neckGap）をそろえる値
    SIZE: { warrior: 1, priest: 0.93, monk: 0.93, valkyrie: 0.93, elf: 0.93 }, TOPW: 1.9103, TIPK: 1.027,   // 体の大きさの順（2026-10-26 ユーザー判断 v2）：戦士 1 ＞ 僧侶＝武闘家＝ワルキューレ 0.93（戦士と魔法使いの真ん中）＞ 魔法使い（帽子の先 TOPW ＝戦士の兜のてっぺんに合わせる。計算で 0.864）
    GRIPMAX: 40 * Math.PI / 180,           // 持ち物（剣・槍・杖・メイス）の前後の倒れの上限：垂直から前後とも 40°（ユーザー判断 b。30〜45° の中で、見て自然な 40°）
    GRIPROLL: 0.1,                         // 小型武器（剣・メイス）の左右の傾きの上限（腕の振りの前後の角度に比例）＝0.1 rad（5.7°。ユーザー判断 2026-10-27：左右の傾きは小さく。僧侶の担当の調べ：メイス 5.7° は 1 巡り 240 コマで顔の箱に入らず余裕 0.025、11.5° は 34 コマ入る。剣は 22° 以下で入らない）
    GRIPARMZ: 0.26, GRIPFACE: 0.25,         // 武器を持つ腕（2026-10-29 ユーザー判断「案1。」「武器を持っている手は0.26、顔に当たる時は肘から先を0.25向ける」）：上うでの開きは空いている腕と同じ 0.26、ひじから先はまっすぐ前。持ち物が顔に当たる人だけ、ひじから先を外へ 0.25（holdGrip の face）
    SMALLLEN: 0.84,                        // 小型武器（剣・メイス）の、拳（にぎる位置）から先までの長さ
    SKINK: 1.03,                           // 素肌の腕・脚・手は、顔の箱の前面より暗く見えるので、顔と同じに見えるよう色を少し明るく（正面の平均色で合わせる）
    FHIP: 0.05,   // 女性は腰を高く：股の高さを 0.05 長く（そのぶん、胴は短く。頭・肩の高さは同じ）
    MNECK: 1.4,   // 男性の首の太さの倍率（首の円柱の横・前後。2026-10-29 ユーザー判断「女性が細いのはいいけど、戦士が細く見えるのは問題」「男性の首は1.4倍くらいでいいな」。正面 128 ドットで首の幅 6→10 ドット）
    FHEAD: 1, FNECKD: 0.02,   // 女性の頭の倍率：男性と同じ 1（2026-10-29 ユーザー判断で書き換え。いったん 0.83＝FTHIN にしたが 128 ドットで顔が崩れた。大きさの差は髪で付ける。canon.md §「女性」）と、首を NECKV にそろえたあと、さらに頭を下げる量（武闘家で決めた「首は0.02」＝正面で見える首の面積を少なく。武闘家は正面 12 ドット・2 行）
    FTHIN: 0.83,                           // 女性は腕・脚・手の太さを男性のこの倍率（2026-10-26 ユーザー判断：0.8〜0.85 倍）
    FEMALE: 0.9,                           // 女性は肩の幅・手・靴をこの倍率
    FOOT: 0.292 / 0.858, FOOTW: 0.194 / 0.858, FOOTH: 0.138 / 0.858, HAND: 0.085,   // 靴の長さ・幅・高さ（戦士の今の 0.292・0.194・0.138 u ÷ 戦士の倍率）、手の半径（戦士のこぶし）
  };
  const FW0 = 0.4, FW = FW0, FH = 0.31, FD = 0.34, FR0 = 0.06, FR = FR0, FZ = 0.02, FY = 0.205, FH_ = FH, FY_ = FY;   // 顔の箱
  // 頭の部品：顔（角を丸めた箱 1 つの曲面）、首、鼻、目（黒い縦長の四角 1 つ）、口（小さな笑い）、耳。女性は、目の上の外側にまつ毛、口は赤み。男性の口は暗い色
  // o.face の顔（武闘家の顔の直しの試し。2026-10-29）：目（上の色・下の色の 2 段）・白い点（大・小）・まつ毛（目の上の線）・鼻（無しも可）・口・ほおの赤み。数は顔の箱の座標
  function faceParts(F, fb, COL, eyeColor) {
    const E = F.eye, top = eyeColor != null ? eyeColor : COL.eye, r = E.round || 0;   // round：目の下の角を落とす幅、roundTop：上の角（まつ毛と重なると 128 ドットで形がくずれるので、ふつうは 0）
    const blk = (w, h, c, x, y, ord, rb = r, rt = r) => { fb(w, h - rb - rt, c, x, y + (rb - rt) / 2, ord); if (rb) fb(w - 2 * rb, rb, c, x, y - h / 2 + rb / 2, ord); if (rt) fb(w - 2 * rt, rt, c, x, y + h / 2 - rt / 2, ord); };   // 角を落とした四角（round：角を落とす幅。128 ドットで角が 1 ドット欠けて丸く見える）
    for (const sx of [-1, 1]) {
      const x = sx * E.x;
      blk(E.w, E.h, top, x, E.y, 1, r, E.roundTop || 0);   // 黒目（上は平ら＝まつ毛の線につながる。丸めるのは下だけ）
      if (E.lo) { const hl = E.h * E.loK; blk(E.w, hl, E.lo, x, E.y - E.h / 2 + hl / 2, 1.5, r, 0); }   // 黒目の下を明るい色に（つや）
      for (const g of F.glint || []) fb(g.w, g.h, 0xffffff, x + g.dx, E.y + g.dy, 2);   // 白い点は両目とも画面の右（決まりのまま）
      for (const l of [].concat(F.lash || [])) fb(l.w, l.h, COL.eye, x + sx * l.dx, E.y + E.h / 2 - l.h / 2 + l.dy, 2);   // まつ毛（目の上の外側。上のふちを目の上のふちにそろえ、dy で上げる。2 つ並べて外へ斜めに跳ねる＝平らな線だと 128 ドットで眉に見えて怒り顔になった）
      if (F.blush) fb(F.blush.w, F.blush.h, F.blush.c, sx * F.blush.x, F.blush.y, 1);   // ほおの赤み
    }
    if (F.nose) fb(F.nose.w, F.nose.h, F.nose.c || 0xe3a08c, 0, F.nose.y);
    const M = F.mouth; fb(M.w, M.h, M.c, 0, M.y); if (M.corner) for (const sx of [-1, 1]) fb(M.corner, M.corner, M.c, sx * (M.w / 2 - M.corner / 4), M.y + M.corner * 0.8);   // 口（小さな笑い）
  }
  function buildHead(T, head, o) {
    const { mat, COL } = o, Q = o.Q || 1, fem = !!o.female, HS = head.scale.x;
    const add = (m, x, y, z) => { m.position.set(x, y, z); head.add(m); return m; };
    const box = (w, h, d, c, x, y, z) => add(new T.Mesh(new T.BoxGeometry(w, h, d), mat(c)), x, y, z);
    const F = o.face, FR = F && F.FR || FR0, FW = F && F.FW || FW0, XT = F && F.ext || 0, FH = FH_ + XT, FY = FY_ + XT / 2;   // ext：顔の箱の上の端を、まっすぐ上へのばす（かぶりものの人：額がまっすぐ帽子の中に入る。2026-10-29 ユーザー「顔が円筒ではなく、球体なのが問題だ」）。あご・目鼻口の高さは同じ
      // FW：顔の箱の幅（武闘家の試し）   // o.face：顔の目鼻口を人ごとに変える試し（2026-10-29 武闘家の顔の直し。無ければ全員同じ今の顔）
    const fg = new T.BoxGeometry(FW, FH, FD, 8, 8, 8), fa = fg.attributes.position, v = new T.Vector3(), c = new T.Vector3(), cl = (x, h) => Math.max(-h, Math.min(h, x));
    const FRt = F && F.FRt != null ? F.FRt : FR, rAt = (yl, zl = FD / 2) => FRt === FR ? FR : FR + (FRt - FR) * Math.max(0, Math.min(1, yl / (FH * 0.25))) * Math.max(0, Math.min(1, (zl - FD * 0.15) / (FD * 0.2)));   // 横と上の丸み（x・y）だけ小さく、前後の丸み（z）は FR のまま。うしろ半分は今の丸み（z まで・うしろまで角ばらせると、斜めうしろから角が髪の外へ出た）   // FRt：顔の箱の上半分の角の丸み（2026-10-29 ユーザー「前髪下までは顔の側面を平らにする（いまは目の途中から曲線）」の試し）。下半分（あご）は FR のまま、真ん中から上へなめらかに切りかえる
    for (let i = 0; i < fa.count; i++) { v.fromBufferAttribute(fa, i); const r = rAt(v.y, v.z); c.set(cl(v.x, FW / 2 - r), cl(v.y, FH / 2 - r), cl(v.z, FD / 2 - FR)); v.sub(c); const n = Math.hypot(v.x / r, v.y / r, v.z / FR) || 1; v.divideScalar(n).add(c); fa.setXYZ(i, v.x, v.y, v.z); }   // 角は楕円の丸み（横・上 r、前後 FR）。r＝FR なら今と同じ
    const J = F && F.jaw; if (J) { const y0 = J.y0, yb = -FH / 2; for (let i = 0; i < fa.count; i++) { const y = fa.getY(i); if (y >= y0) continue; const t = (y0 - y) / (y0 - yb); fa.setX(i, fa.getX(i) * (1 - (1 - J.k) * Math.pow(t, J.p || 1.5))); fa.setY(i, y - J.drop * t); } }   // jaw：あごのラインを削る（y0＝削り始める高さ（顔の箱の中心から）、k＝下の端の幅の倍率、drop＝あごの先を下げる量。2026-10-29 ユーザー「顎のラインを削って、前から見て顔が真四角に見えないように」「首が長く見える」）
    fg.computeVertexNormals(); add(new T.Mesh(fg, mat(COL.face)), 0, FY, FZ).userData.ext = XT;   // ext：背を合わせる fit は、のばす前の顔の上の端で測る
    const NX = 0.04;   // 首の円柱の上の端を、顔の箱の中まで 0.04 のばす（2026-10-29。前は 6 人のファイルが別々に同じ直しをしていた＝あごの下にうしろの髪が 1 行見えて首が見えなかった。共通にまとめた）
    if (o.neckBackColor != null) {   // 首の後ろ半分を髪の色に（うなじの髪に隠れて見える。前から見て首の肌を出しつつ、うしろ・斜め後ろの首の肌を出さない。2026-10-27）
      const nn = (ts, tl, c, k = 1) => { const m = add(new T.Mesh(new T.CylinderGeometry(0.07 * k, 0.085 * k, 0.17 + C.NK / HS + NX, Math.round(10 * Q), 1, false, ts, tl), mat(c)), 0, -0.06 - C.NK / (2 * HS) + NX / 2, 0); if (!fem) m.scale.set(C.MNECK, 1, C.MNECK); return m; };   // 男性は首を C.MNECK 倍の太さに
      const ex = 0.35; nn(-Math.PI / 2 - ex, Math.PI + 2 * ex, COL.neck); nn(Math.PI / 2 + ex, Math.PI - 2 * ex, o.neckBackColor, 1);   // 前の肌を少し広く（歩きの首のひねりで、後ろ半分のふちが前から見えない）
    } else
    { const m = add(new T.Mesh(new T.CylinderGeometry(0.07, 0.085, 0.17 + C.NK / HS + NX, Math.round(10 * Q)), mat(COL.neck)), 0, -0.06 - C.NK / (2 * HS) + NX / 2, 0); if (!fem) m.scale.set(C.MNECK, 1, C.MNECK); }   // 首（男性は C.MNECK 倍の太さ）
    const zf = FZ + FD / 2 + 0.002;
    const S = FZ + FD / 2, surf = y => { const dy = Math.abs(y - FY) - (FH / 2 - FR); return FZ + FD / 2 - FR + (dy > 0 ? Math.sqrt(Math.max(0, FR * FR - dy * dy)) : FR); };   // 顔の前の面の奥行き（上下のふちは丸みで引っこむ）
    const surf2 = (x, y) => { if (J) { let yl = y - FY; if (yl < J.y0) { const yo = J.y0 + (yl - J.y0) / (1 + J.drop / (J.y0 + FH / 2)), t = (J.y0 - yo) / (J.y0 + FH / 2); x /= 1 - (1 - J.k) * Math.pow(t, J.p || 1.5); y = yo + FY; } }   // あごを削ったぶん、元の顔の箱の点へ戻して奥行きを求める（口があごの面に埋もれた）
      const r = rAt(y - FY), ax = Math.max(0, Math.abs(x) - (FW / 2 - r)), ay = Math.max(0, Math.abs(y - FY) - (FH / 2 - r)); return FZ + FD / 2 - FR + FR * Math.sqrt(Math.max(0, 1 - (ax / r) ** 2 - (ay / r) ** 2)); };   // o.face のとき：左右の丸みにも沿わせる（顔を細く丸くすると、目・まつ毛が丸い角の上にかかり、斜め前から浮いて見えた）
    const feats = [];   // 顔の前の面に貼る目・鼻・口・白い点
    head.userData.faceFx = () => { head.updateWorldMatrix(true, false); const nz = new T.Vector3(0, 0, 1).transformDirection(head.matrixWorld).z; for (const m of feats) m.visible = nz > C.EYECUT; };   // 顔の前がカメラから 70° 以上そっぽを向く（ほぼ真横・頭を振ったコマ）では、目・鼻・口を出さない：輪郭の列に目の黒が出る（別の目のレビュー 2 回目・ワルキューレの担当）。draw のたびに hero3d.js が呼ぶ
    const fb = (w, h, c, x, y, ord = 1) => { const dz = 0.0003 + 0.0003 * ord;   // 面から出す高さは最小限（0.0015 以下。0.003〜0.006 だと、横向き・頭を振るコマで 1 画素、顔の輪郭の外に出た＝別の目のレビュー）。ord が大きいほど手前（白い点・まつ毛は目の上）
      const g = new T.BoxGeometry(w, h, 0.02, F ? 4 : 1, 6, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, (F ? surf2(x + p.getX(i), y + p.getY(i)) : surf(y + p.getY(i))) + dz - (p.getZ(i) > 0 ? 0 : 0.02)); g.computeVertexNormals(); const m = new T.Mesh(g, mat(c)); m.position.set(x, y, 0); head.add(m); feats.push(m); return m; };   // 面に沿わせる（目の上のふちが、顔の丸みの上で浮いて、横から見て輪郭から出ない。2026-10-27 レビュー）   // v5.7（ユーザー判断 2026-10-26）：目・鼻・口・まつ毛・白い点は、顔の前の面にうめて、色だけが見える（前へ出る量 0.003〜0.006）。横から見て顔の輪郭から出ない
    if (F) faceParts(F, fb, COL, o.eyeColor); else {   // 共通の今の顔
    fb(0.034, 0.04, 0xe3a08c, 0, 0.2);                                   // 鼻（小さな四角。すこしピンク）
    for (const sx of [-1, 1]) {   // 目（黒い縦長の四角）。女性は、大きさだけ 1.3 × 1.15 倍にして、内がわ上に白いハイライトを 1 つ（2026-10-26 ユーザー判断 b）。位置・形は全員同じ
      fb(fem ? 0.065 : (o.eyeW || 0.05), fem ? 0.16 : 0.14, o.eyeColor != null ? o.eyeColor : COL.eye, sx * 0.1, 0.265);   // o.eyeColor：黒目の色（既定は COL.eye＝黒。エルフは緑。2026-10-27）   // 奥行き 0.03 → 0.05（v5：横から見て、顔の前の縁に 2 ドットの黒い出っぱりとして見える。以前は 0.03）//、横から見ても目が 1 ドットの縁として見える（v4 追加）
      if (fem) fb(0.045, 0.045, 0xffffff, sx * 0.1 + 0.012, 0.29, 2);   // 白い点は、両目とも目の右側（画面の右。ユーザー判断 2026-10-26。内側にすると、つり目に見える）   // 目の内がわ・上から 1/3（斜め前でも、帽子・髪に隠れない高さ）
    }
    const mc = fem ? 0xd8584c : 0x9a5a4a;                                           // 口（小さな笑い）：女性は赤み、男性は暗い色
    fb(0.08, 0.024, mc, 0, 0.12); for (const sx of [-1, 1]) fb(0.016, 0.016, mc, sx * 0.046, 0.136);   // 口（小さな笑い。小さい体でも 1 本の線に見える太さ）
    if (fem) for (const sx of [-1, 1]) fb(0.045, 0.02, COL.eye, sx * 0.13, 0.352, 2);   // まつ毛（目の上の外側に 1 つ）
    }
    if (o.sideHair != null) for (const sx of [-1, 1]) box(0.07, 0.31, 0.2, o.sideHair, sx * (F ? FW / 2 + 0.01 : 0.21), 0.205, -0.065);   // face のとき、顔の幅に合わせて寄せる（顔のふちから 0.01 外。今の顔は 0.21）
    if (o.napeHair != null) { const n = new T.Mesh(new T.SphereGeometry(0.1, Math.round(10 * Q), Math.round(8 * Q)), mat(o.napeHair)); n.scale.set(o.napeW || 1.55, 1.0, 1.05); add(n, 0, -0.045, -0.115); }   // うしろ髪が首のうしろ・よこをおおう（正面の首は見える。ユーザー指摘「後ろ姿：首が丸見え」）
    if (o.sideHair != null && o.plate) { const pl = new T.Mesh(new T.SphereGeometry(0.1, Math.round(10 * Q), Math.round(8 * Q)), mat(o.sideHair)); pl.scale.set(2.2, 0.7, 1.35); add(pl, 0, 0.085, -0.115); }   // あごのうしろ・下：髪（うしろの下すみ・横の下の肌色が出ないように）   // 耳のうしろの横：髪（うしろ・斜めうしろから、顔の横の肌色が髪のすき間から見えないように。再発チェック R1）
    for (const sx of [-1, 1]) { const e = new T.Mesh(new T.SphereGeometry(0.05, Math.round(8 * Q), Math.round(6 * Q)), mat(COL.face)); e.scale.set(0.6, 1, 0.9); add(e, sx * (FW / 2 + 0.005), 0.2, 0); }   // 耳
  }
  // 背（足の裏〜顔の上端）が、人ごとの段（C.SIZE）× C.BACK になるよう、全体の倍率を決める。魔法使いだけ、帽子の先（頭の部品のいちばん上）を戦士の兜のてっぺん C.TOPW に合わせる。立ちの姿で測る
  function fit(T, group, parts, id) {
    group.scale.setScalar(1); group.updateMatrixWorld(true);
    let face = null; parts.head.traverse(o => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.widthSegments === 8) face = o; });
    const top = new T.Box3().setFromObject(face).max.y - (face.userData.ext || 0) * face.getWorldScale(new T.Vector3()).y, sole = Math.min(new T.Box3().setFromObject(parts.footL).min.y, new T.Box3().setFromObject(parts.footR).min.y);
    if (id === 'wizard') group.scale.setScalar(C.TOPW * C.TIPK / (new T.Box3().setFromObject(parts.head).max.y - sole));   // TIPK：とんがり帽子の先は細く、128 ドットの書き出しでは 3 ドットほど低く出る（戦士の兜と同じ高さに見える補正。測って決めた）
    else group.scale.setScalar(C.BACK * (C.SIZE[id] || 1) / (top - sole));
  }
  // 足（靴）の長さ・幅・高さを、戦士と同じ（女性は 0.9 倍）にそろえる。足首を中心に拡大し、足の裏は足首の 0.11 下に保つ。fit の前（倍率 1 のとき）に呼ぶ
  function fitFoot(T, group, parts, female) {
    group.updateMatrixWorld(true);
    const f9 = female ? C.FEMALE : 1;
    for (const n of ['L', 'R']) {
      const f = parts['foot' + n], b = new T.Box3().setFromObject(f), sz = b.getSize(new T.Vector3()); if (!(sz.z > 0)) continue;
      const kx = C.FOOTW * f9 / sz.x, ky = C.FOOTH * f9 / sz.y, kz = C.FOOT * f9 / sz.z, ank = new T.Vector3(); f.getWorldPosition(ank); const lo = b.min.y - ank.y;
      f.scale.set(kx, ky, kz); f.position.y += -0.11 - lo * ky;
    }
  }
  // 走りの蹴り上げ（2026-10-27 ユーザー判断：武闘家から全員へ）。共通の膝は前へ振り出すときだけ曲がり、後ろへ出た脚が棒のように伸びていた。
  // kick：後ろへいちばん出た少しあと（0.6 rad）を山に膝を深く曲げ、かかとをお尻のほうへ上げる。共通の膝より深いときだけ使う。K は人ごと（KICK。裾・マントを脚が抜けない上限）。
  // footAlong：膝が深く曲がるほど足をすねの向きに合わせ、すねに対してつま先を少し伸ばす（足首を地面と平らに保つと、かかとが後ろ・つま先が前のままで、すねと合わない）。歩き・立ちは使わない
  const KICK = { monk: 1.7, warrior: 1.2, mercenary: 1.7, wizard: 1.7, priest: 1.7, elf: 0.9, valkyrie: 1.0, samurai: 1.7 };   // 上限は 10〜60 km/h の歩幅で、すね・足と服・マントの面が交わらない深さ（戦士はマントで 1.4 から、傭兵は裾で 2.0、エルフは 1.0・ワルキューレは 1.15 からマントの裾に当たる。魔法使い・僧侶は蹴った脚の側の後ろの裾を跳ね上げ、kickPush で押し出して、魔法使いは 2.0 で裾に当たる。エルフ・ワルキューレのマントは戦士と同じ丈）
  const kick = (kn, ph, sg, K) => K ? Math.max(kn, K * Math.pow(Math.max(0, sg * Math.sin(ph - 0.6)), 1.2)) : kn;
  const footAlong = (th, kn, ex) => { const w = Math.max(0, Math.min(1, ex != null ? ex / 0.5 : (kn - 0.5) / 0.9)), w2 = w * w * (3 - 2 * w); return -(th + kn) * 0.75 * (1 - w2) + 0.35 * w2; };   // ex：蹴り上げで深くしたぶん（あれば、それで合わせ具合を決める）
  // 靴の裏（2026-10-27 ユーザー「足の裏を別の色にすると走っている感じがより出る」）：足（foot）の中の靴の部品の、下を向いた面だけを写して、0.0005 外へ出した皮を重ねる（靴の形を問わない）
  // 'shoe'：その靴の色（少し暗く。2026-11-09 試走・判断 64：ユーザー「3D のエルフの足の裏が白いと目立つから、茶色にして」「靴の色に合わせる」。
  // 白い SOLE だった 4 人＝エルフ・戦士・武闘家・ワルキューレを、靴の色に。傭兵・魔法使い・僧侶・侍は 2026-10-28 に決めた明るい革の色のまま）
  const SOLE = 0xe8e0c8, SOLES = { mercenary: 0xcdb88e, wizard: 0xcdb88e, priest: 0xcdb88e, samurai: 0xcdb88e, elf: 'shoe', warrior: 'shoe', monk: 'shoe', valkyrie: 'shoe' }, SHOE_K = 0.82;   // 人ごとの靴の裏（無ければ SOLE）。傭兵は土色の服・長靴に白い底が浮いたので、明るい革の色。魔法使い・僧侶も茶色の長靴に白い底が四角く目立ったので同じ色（2026-10-28 ユーザー判断）
  function addSoles(T, parts, id) {
    const color = SOLES[id] != null ? SOLES[id] : SOLE;
    for (const n of ['L', 'R']) {
      const ft = parts['foot' + n]; if (!ft) continue; ft.updateMatrixWorld(true); const inv = new T.Matrix4().copy(ft.matrixWorld).invert(), meshes = [];
      ft.traverse(o => { if (o.isMesh && o.name !== 'shoe_sole') meshes.push(o); });
      const grp = parts['sole' + n] = new T.Group(); grp.name = 'sole' + n; ft.add(grp);   // 部品の数の記録（tests/hero3d.test.js）に載せる
      for (const o of meshes) {
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(), M = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(M);
        const pa = g.attributes.position, out = [], a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), nn = new T.Vector3();
        for (let i = 0; i < pa.count; i += 3) { a.fromBufferAttribute(pa, i); b.fromBufferAttribute(pa, i + 1); c.fromBufferAttribute(pa, i + 2); nn.subVectors(c, b).cross(new T.Vector3().subVectors(a, b)).normalize();
          if (nn.y > -0.6) continue; for (const v of [a, b, c]) out.push(v.x + nn.x * 0.0005, v.y + nn.y * 0.0005, v.z + nn.z * 0.0005); }
        g.dispose(); if (!out.length) continue;
        const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(out, 3)); sg.computeVertexNormals();
        const mt = o.material.clone(); mt.color = color === 'shoe' ? o.material.color.clone().multiplyScalar(SHOE_K) : new T.Color(color).multiplyScalar(mt.isMeshToonMaterial ? 0.74 : 1);
        const so = new T.Mesh(sg, mt); so.name = 'shoe_sole'; grp.add(so);
      }
    }
  }
  // マント（戦士 v6 と同じ作り。2026-10-28 ユーザー判断「マントがあるのは戦士に合わせる」：エルフ・ワルキューレ）：肩から背中に沿う 1 枚の曲面。毎コマ、当たる所だけ外へ押し出す。
  // o：Y0（肩かけの上端）・HC（肩かけの高さ）・Y1（裾）・ZC・rxT/rxS/rxH（襟・肩・裾の左右の半径）・rzT/rzS/rzH（前後の半径）・thT/th（背中の真ん中から回り込む角度。上・肩から下）・col(ft, fv, c)（色。ft＝肩から裾 0〜1、fv＝ひだ）・mat・matIn（表・裏）
  // deform(mode, t, caps)：caps は [p, q, R, wrap]（胴の座標の線分と太さ）。wrap の線分（脚）は、マントの外まで出ていても外側へ押し出す（長いマントで、後ろへ振った脚が外へ抜けない。戦士の押し出しは中に入った点だけ）
  function capeSheet(T, par, o) {
    const NA = o.NA || 22, NC = o.NC || 4, NY = o.NY || 22, n = (NA + 1) * (NY + 1), ZC = o.ZC, FA = o.foldA != null ? o.foldA : 0.07, RP = o.rip != null ? o.rip : 0.02, SX = o.swayX != null ? o.swayX : 0.03;   // FA：ひだの深さ、RP：ひだの上下の波、SX：左右の揺れ（戦士は 0.08・0.025・0.035）
    const row = j => { if (j <= NC) { const q = j / NC * Math.PI / 2; return { y: o.Y0 - o.HC * (1 - Math.cos(q)), rx: o.rxT + (o.rxS - o.rxT) * Math.sin(q), rz: o.rzT + (o.rzS - o.rzT) * Math.sin(q), th: o.thT + (o.th - o.thT) * j / NC, u: 0 }; }
      const u = (j - NC) / (NY - NC); return { y: o.Y0 - o.HC - (o.Y0 - o.HC - o.Y1) * u, rx: o.rxS + (o.rxH - o.rxS) * u, rz: o.rzS + (o.rzH - o.rzS) * u, th: o.th, u }; };
    const pos = new Float32Array(n * 3), rest = new Float32Array(n * 3), dir = new Float32Array(n * 2), tOf = new Float32Array(n), col = [], idx = [], cc = new T.Color();
    for (let j = 0; j <= NY; j++) { const R = row(j), ft = R.u;
      for (let i = 0; i <= NA; i++) { const ph = R.th * (2 * i / NA - 1), fv = Math.cos(ph * 6), fold = 1 + FA * Math.min(1, ft * 1.6 + 0.15) * fv, k = j * (NA + 1) + i;   // 裾へ深くなる縦のひだ
        rest[k * 3] = R.rx * fold * Math.sin(ph); rest[k * 3 + 1] = R.y + RP * ft * ft * fv; rest[k * 3 + 2] = ZC - R.rz * fold * Math.cos(ph); tOf[k] = ft;
        const dx = Math.sin(ph) / R.rx, dz = -Math.cos(ph) / R.rz, dl = Math.hypot(dx, dz); dir[k * 2] = dx / dl; dir[k * 2 + 1] = dz / dl;
        o.col(ft, fv, cc); col.push(cc.r, cc.g, cc.b); } }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    pos.set(rest); const cg = new T.BufferGeometry(); cg.setAttribute('position', new T.BufferAttribute(pos, 3)); cg.setAttribute('color', new T.Float32BufferAttribute(col, 3)); cg.setIndex(idx); cg.computeVertexNormals();
    const cm = new T.Mesh(cg, o.mat); cm.name = 'cape'; cm.frustumCulled = false; par.add(cm);
    const ci = new T.Mesh(cg, o.matIn); ci.name = 'cape_in'; ci.frustumCulled = false; par.add(ci);
    const off = new Float32Array(n), offB = new Float32Array(n), tmp = new Float32Array(n), sw = new Float32Array(n * 3), YH = o.Y0 - o.HC, sm = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
    const spread = a => { for (let it = 0; it < 3; it++) { tmp.set(a); for (let j = 0; j <= NY; j++) for (let i = 0; i <= NA; i++) { const k = j * (NA + 1) + i; let m = 0; if (i > 0) m = Math.max(m, tmp[k - 1]); if (i < NA) m = Math.max(m, tmp[k + 1]); if (j > 0) m = Math.max(m, tmp[k - NA - 1]); if (j < NY) m = Math.max(m, tmp[k + NA + 1]); a[k] = Math.max(tmp[k], m * 0.6); } } };
    const deform = (mode, t, caps) => {   // ①なびき ②押し出し ③なだらかに ④もう一度押し出し（戦士と同じ）
      const run = mode === 'run', walk = mode === 'walk', moving = run || walk, ph = t * Math.PI * 2 * (run ? 1.55 : 1.05), s = Math.sin(ph), base = run ? 0.15 : walk ? 0.07 : 0.02;
      for (let j = 0; j <= NY; j++) for (let i = 0; i <= NA; i++) { const k = j * (NA + 1) + i, x = rest[k * 3], y = rest[k * 3 + 1], z = rest[k * 3 + 2], tt = tOf[k], w = sm((YH - y) / 0.3);
        const q = w * (base + (moving ? Math.sin(ph * 2 + 0.6 + i * 0.45) * (run ? 0.05 : 0.03) * tt : Math.sin(t * 1.3 + i * 0.3) * 0.01)), dy = y - YH, dz = z - ZC;
        sw[k * 3] = x + (moving ? s * SX * tt : 0); sw[k * 3 + 1] = YH + dy * Math.cos(q) - dz * Math.sin(q); sw[k * 3 + 2] = ZC + dy * Math.sin(q) + dz * Math.cos(q); off[k] = 0; offB[k] = 0; }
      // 押し出し：体・腕・持ち物は、中に入った点を楕円の外向きへ（戦士と同じ）。脚（wrap）は、後ろ（−z）へ押し出し、マントの外まで出ていても、その後ろへ回す（脚の幅はマントより広いので、脇の向きへ押すと端が脚を抜ける）。
      // 脚は 0.06 太く、縦には 1/0.35 倍に長い楕円として測る（点の行の間・裾の行の下を靴が通るとき、となりの行も後ろへ回して、行の間の面が靴を抜けない）
      const push = () => { for (let k = 0; k < n; k++) { const ux = dir[k * 2], uz = dir[k * 2 + 1];
        for (let pass = 0; pass < 2; pass++) for (const [p, q, R, wrap] of caps) {
          const px = sw[k * 3] + ux * off[k], py = sw[k * 3 + 1], pz = sw[k * 3 + 2] + uz * off[k] - offB[k], ab0 = q[0] - p[0], ab1 = q[1] - p[1], ab2 = q[2] - p[2], l2 = ab0 * ab0 + ab1 * ab1 + ab2 * ab2 || 1e-9, u = Math.max(0, Math.min(1, ((px - p[0]) * ab0 + (py - p[1]) * ab1 + (pz - p[2]) * ab2) / l2));
          const d0 = px - p[0] - ab0 * u, d1 = py - p[1] - ab1 * u, d2 = pz - p[2] - ab2 * u, dl2 = d0 * d0 + d1 * d1 + d2 * d2;
          if (!wrap) { if (dl2 < R * R) { const du = d0 * ux + d2 * uz; off[k] += -du + Math.sqrt(du * du - dl2 + R * R); } continue; }
          const RM = R + 0.06, dl2y = d0 * d0 + d1 * d1 * 0.35 * 0.35 + d2 * d2, du = -d2, disc = du * du - dl2y + RM * RM; if (dl2y < RM * RM || (du < 0 && disc > 0)) offB[k] += -du + Math.sqrt(Math.max(0, disc)); } } };
      push(); spread(off); spread(offB); push();
      for (let k = 0; k < n; k++) { pos[k * 3] = sw[k * 3] + dir[k * 2] * off[k]; pos[k * 3 + 1] = sw[k * 3 + 1]; pos[k * 3 + 2] = sw[k * 3 + 2] + dir[k * 2 + 1] * off[k] - offB[k]; }
      cg.attributes.position.needsUpdate = true; cg.computeVertexNormals(); cg.computeBoundingSphere(); };
    return { mesh: cm, inner: ci, deform, pos, rzAt: y => { const j = Math.max(0, Math.min(NY, Math.round(NC + (o.Y0 - o.HC - y) / (o.Y0 - o.HC - o.Y1) * (NY - NC)))); return row(j).rz; } };
  }
  function footBox(T, ft) {   // 足（foot）の中の靴の部品の箱（足の座標）→ 中心の x・y、かかと・つま先の z（端の丸みのぶん内へ）、太さ（胴の座標の長さ）。一度だけ測る
    if (ft.userData.box) return ft.userData.box;
    const b = new T.Box3(), inv = new T.Matrix4(); ft.updateMatrixWorld(true); inv.copy(ft.matrixWorld).invert();
    ft.traverse(o => { if (o.isMesh && o.name !== 'shoe_sole') { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
    const sx = ft.scale.x, sy = ft.scale.y, sz = ft.scale.z, r = Math.max((b.max.x - b.min.x) * sx, (b.max.y - b.min.y) * sy) / 2, rz = r / sz;
    return (ft.userData.box = { cx: (b.min.x + b.max.x) / 2, cy: (b.min.y + b.max.y) / 2, z0: Math.min(b.min.z + rz, (b.min.z + b.max.z) / 2), z1: Math.max(b.max.z - rz, (b.min.z + b.max.z) / 2), r });
  }
  // マントを押し出す、脚・足・腕の線分（胴の座標）。脚は wrap（外まで出ても押し出す）。r：太さ（もも・すね・足・上うで・前腕）
  // 戦士と同じ設計のマントの形（2026-10-28 ユーザー判断「マントについても戦士に合わせる（共通の設計）」）：上端は肩の関節 +0.05、裾は膝 −0.032（膝の少し下）、
  // 幅・奥行きは戦士の数（hero3d.js）のまま（女性の肩の関節 0.302 より内側。縮めると、脚の間隔は男女同じなので、蹴り上げた靴がマントの脇の外へ出て端を抜けた）。ひだ・揺れ・点の数も戦士と同じ
  function capeLikeWarrior(T, P) {
    P.body.parent && P.body.parent.updateMatrixWorld(true); const knee = P.torso.worldToLocal(P.shinL.getWorldPosition(new T.Vector3())).y, k = 1, Y0 = P.armL.position.y + 0.05;
    return { NA: 26, NC: 5, NY: 23, Y0, HC: 0.1, Y1: knee - 0.032, ZC: -0.02, rxT: 0.17 * k, rxS: 0.28 * k, rxH: 0.3 * k, rzT: 0.15 * k, rzS: 0.25 * k, rzH: 0.32 * k, thT: 2.3, th: 1.35, foldA: 0.08, rip: 0.025, swayX: 0.035, k };
  }
  function capeLimbs(T, P, r, wrap = false) {
    const v = new T.Vector3(), Pt = (o, x, y, z) => { v.set(x, y, z); o.localToWorld(v); P.torso.worldToLocal(v); return [v.x, v.y, v.z]; }, caps = [];
    for (const k of ['L', 'R']) {
      caps.push([Pt(P['leg' + k], 0, 0, 0), Pt(P['shin' + k], 0, 0, 0), r.thigh, wrap], [Pt(P['shin' + k], 0, 0, 0), Pt(P['foot' + k], 0, 0, 0), r.shin, wrap]);
      const fb = footBox(T, P['foot' + k]);   // 足：靴の箱（足の座標）から、かかと〜つま先の線分と太さを決める（靴の大きさは人ごと。蹴り上げで足がすねに沿う）
      caps.push([Pt(P['foot' + k], fb.cx, fb.cy, fb.z0), Pt(P['foot' + k], fb.cx, fb.cy, fb.z1), fb.r + (r.footPad != null ? r.footPad : 0.01), wrap]);
      caps.push([Pt(P['arm' + k], 0, 0.03, 0), Pt(P['fore' + k], 0, 0, 0), r.arm, false], [Pt(P['fore' + k], 0, 0, 0), Pt(P['fore' + k], 0, C.HANDY, 0.01), r.fore, false]); }
    return { caps, Pt };
  }
  // kickPush（2026-10-28 ユーザー指示：ローブの人の蹴り上げ）：裾の点を、蹴り上げたすね・足に当たる所だけ、決まった向き（D。板の外向き）に押し出す。戦士のマントの deformCape と同じ考え（筒を抜けるまで押し、となりへなだらかに広げて、もう一度押す）。
  // root：P・D の座標の親（裾の pivot）。P・D：点と向き（n×3）。nb：となりの点の番号（n×4、無ければ -1）。off：押す量を書く（n）。裾全体は持ち上げない（当たらない所は 0）
  const KPR = { shin: 0.125, foot: 0.11 };   // 長靴の筒（半径 0.1）・足（つま先の球を平たく）に、すき間を足した太さ
  // 髪の房のしなり（2026-10-28 ユーザー判断：魔法使いの走りの後ろ髪が、根元から 1 つの塊で回って、横から板・塊に見えた。エルフの髪も、のちにこの作りにそろえる）
  // hairStrand(T, material, r0, r1, l, seg, sz)：根元を原点に、下（-y）へ長さ l の房（太さ r0→r1、奥行きは sz 倍。縦に 8 分割して曲げられる）。房ごとの pivot に add する
  // bendStrand(m, A)：根元からの距離 s の所の向きを A·(s/l)^1.6 だけ後ろ（-z、+ で後ろ）へ傾け、その線に沿って曲げる＝根元はほぼ頭に沿い、毛先ほど大きくしなる。A＝0 で、まっすぐ（元の形）
  function hairStrand(T, material, r0, r1, l, seg, sz) {
    const g0 = new T.CylinderGeometry(r0, r1, l, seg); g0.translate(0, -l / 2, 0); g0.scale(1, 1, sz);   // まっすぐのときの形（縦に分けない＝前の房と同じ。立ち・歩きの絵を変えない）
    const g = new T.CylinderGeometry(r0, r1, l, seg, 8); g.translate(0, -l / 2, 0); g.scale(1, 1, sz);   // 曲げるときの形
    const m = new T.Mesh(g0, material); m.userData.strand = { l, g0, g, rest: Float32Array.from(g.attributes.position.array), A: 0, cy: new Float64Array(25), cz: new Float64Array(25) }; return m;
  }
  function bendStrand(m, A) {
    const u = m.userData.strand; if (Math.abs(A - u.A) < 1e-6) return; u.A = A; m.geometry = A ? u.g : u.g0; if (!A) return;
    const pa = m.geometry.attributes.position, a = pa.array, r = u.rest, l = u.l, N = 24, cy = u.cy, cz = u.cz, P = 1.6;
    for (let i = 1; i <= N; i++) { const q = A * Math.pow((i - 0.5) / N, P); cy[i] = cy[i - 1] - Math.cos(q) * l / N; cz[i] = cz[i - 1] - Math.sin(q) * l / N; }   // 房の芯の線
    for (let v = 0; v < pa.count; v++) {
      const s = Math.max(0, Math.min(l, -r[v * 3 + 1])), f = s / l * N, i = Math.min(N - 1, Math.floor(f)), t = f - i, q = A * Math.pow(s / l, P), oz = r[v * 3 + 2];
      a[v * 3] = r[v * 3]; a[v * 3 + 1] = cy[i] + (cy[i + 1] - cy[i]) * t - oz * Math.sin(q); a[v * 3 + 2] = cz[i] + (cz[i + 1] - cz[i]) * t + oz * Math.cos(q);
    }
    pa.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
  }
  // layStrand(m, cz)：房の芯を、根元から下へ s の所で z＝cz[i]（i＝s/l·N、N＝cz.length−1。根元の座標）に置いて曲げる（bendStrand と同じ作り。房の向きは芯の傾きに合わせる）。
  // エルフの長い髪（2026-10-28）：マント・フードの面の外に、房を沿わせる（毎コマ、面の位置から cz を決める）。cz がすべて 0 なら、まっすぐ（縦に分けない元の筒）
  function layStrand(m, cz) {
    const u = m.userData.strand, N = cz.length - 1; let flat = true; for (let i = 0; i <= N; i++) if (Math.abs(cz[i]) > 1e-6) { flat = false; break; }
    if (flat) { m.geometry = u.g0; return; } m.geometry = u.g;
    const pa = m.geometry.attributes.position, a = pa.array, r = u.rest, l = u.l;
    for (let v = 0; v < pa.count; v++) {
      const s = Math.max(0, Math.min(l, -r[v * 3 + 1])), f = s / l * N, i = Math.min(N - 1, Math.floor(f)), t = f - i, z = cz[i] + (cz[i + 1] - cz[i]) * t, q = Math.atan2(-(cz[i + 1] - cz[i]), l / N), oz = r[v * 3 + 2];
      a[v * 3] = r[v * 3]; a[v * 3 + 1] = -s - oz * Math.sin(q); a[v * 3 + 2] = z + oz * Math.cos(q);
    }
    pa.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
  }
  function kickPush(T, root, parts, P, D, nb, off, pad = 0) {   // pad：太さに足す量（侍は袴の中の紺の筒が太いので、すき間を足す）
    const n = off.length, caps = [], v = new T.Vector3(), at = (o, x, y, z) => { v.set(x, y, z); o.localToWorld(v); root.worldToLocal(v); return [v.x, v.y, v.z]; };
    parts.body.updateMatrixWorld(true);
    for (const k of ['L', 'R']) { const sh = parts['shin' + k], ft = parts['foot' + k];
      caps.push([...at(sh, 0, 0, 0), ...at(ft, 0, -0.02, 0), KPR.shin + pad], [...at(ft, 0, -0.06, -0.08), ...at(ft, 0, -0.06, 0.2), KPR.foot * Math.max(1, ft.scale.x, ft.scale.y) + pad]); }   // 足は fitFoot の倍率だけ太く（男性は足が大きい）
    const push = () => { for (let i = 0; i < n; i++) { const ux = D[i * 3], uy = D[i * 3 + 1], uz = D[i * 3 + 2];
      for (let pass = 0; pass < 2; pass++) for (const [a0, a1, a2, b0, b1, b2, R] of caps) {
        const px = P[i * 3] + ux * off[i], py = P[i * 3 + 1] + uy * off[i], pz = P[i * 3 + 2] + uz * off[i], ab0 = b0 - a0, ab1 = b1 - a1, ab2 = b2 - a2, l2 = ab0 * ab0 + ab1 * ab1 + ab2 * ab2 || 1e-9, u = Math.max(0, Math.min(1, ((px - a0) * ab0 + (py - a1) * ab1 + (pz - a2) * ab2) / l2));
        const d0 = px - a0 - ab0 * u, d1 = py - a1 - ab1 * u, d2 = pz - a2 - ab2 * u, dl2 = d0 * d0 + d1 * d1 + d2 * d2; if (dl2 >= R * R) continue;
        const du = d0 * ux + d1 * uy + d2 * uz; off[i] += -du + Math.sqrt(du * du - dl2 + R * R); } } };
    off.fill(0); push();
    const tmp = new Float64Array(n);
    for (let it = 0; it < 4; it++) { tmp.set(off); for (let i = 0; i < n; i++) { let m = 0; for (let j = 0; j < 4; j++) { const q = nb[i * 4 + j]; if (q >= 0 && tmp[q] > m) m = tmp[q]; } off[i] = Math.max(tmp[i], m * 0.6); } }   // なだらかに（当たった所だけがとがらない）
    push();
  }
  // 持ち物の持ち方（ユーザー判断 2026-10-26：持つ手は外へ広げず、腕をまっすぐ下ろして、ひじを 90 度曲げ、前腕は前へ水平。武器は地面と垂直。歩き・走りは腕の振りと一緒に、垂直のまま前後に動く）
  // 使い方：const upd = canon.holdGrip(T, group, parts, { side: 'R', prop, out }); を作り、pose の最後（腕を決めたあと）で upd() を呼ぶ。prop は Group（原点＝にぎる位置。中の部品は原点から上下に作る）。
  // v5.7（ユーザー判断 2026-10-26）：持ち物は手（前腕）の子にして、前腕に対する角度は変えない。立ち（上うで真下・ひじ90度・前腕が前へ水平）で地面と垂直になる角度に固定し、歩き・走りで垂直に保つ補正はしない。
  //   腕を後ろへ振ると拳と一緒に倒れて地面と平行に近づき、前へ振ると垂直に戻る。
  //   武器を持つ腕は共通（2026-10-29 ユーザー判断）：上うでを外へ C.GRIPARMZ 0.26（空いている腕と同じ）・ひじから先はまっすぐ前。o.face：持ち物が顔に当たる人だけ、ひじから先を外へ C.GRIPFACE 0.25（前は既定で外へ 0.5・腕の開きは人ごと 0〜0.1 だった）
  function holdGrip(T, G, P, o) {
    const arm = P['arm' + o.side], fore = P['fore' + o.side], qG = new T.Quaternion(), qF = new T.Quaternion(), qd = new T.Quaternion(), qa = new T.Quaternion(), qr = new T.Quaternion(), hz = new T.Vector3(0, 0, 1), d = new T.Vector3(), h = new T.Vector3(), ax = new T.Vector3(-1, 0, 0);
    const setFore = () => { arm.rotation.z = (arm.position.x < 0 ? -1 : 1) * (window.__GRIPARMZ != null ? window.__GRIPARMZ : C.GRIPARMZ); fore.rotation.order = 'YXZ'; fore.rotation.set(-Math.PI / 2, (arm.position.x < 0 ? -1 : 1) * (window.__GRIPOUT != null ? window.__GRIPOUT : o.face ? C.GRIPFACE : 0), 0); };
    // 向きは「進む向きと平行な縦の面の中の、前後の角度 1 つ」だけ（ユーザー指摘 2026-10-26：後ろから見て持ち物が左右に傾く・ねじれるのは、体を貫くもと）。
    // 前後の角度 α＝ひじから手へのむき（前腕の下向き）を、進む向きの面に写したときの角度（立ち＝前向き水平＝0）。持ち物は、立ちで垂直、α だけ前後に倒れる。胴のひねり・腕の開き・前腕の回りは受けない
    // 腕を振らない持ち方（o.fixed：杖・槍。ユーザー判断 2026-10-27「杖と槍は体のひねりに合わせるとダイナミックすぎる。腕を固定して振らず、体の前後の傾きに合わせるだけ。ダッシュは体が前に傾くので、同じだけ傾くが、振らない」）：
    //   持つ側の腕は立ちの形（上うで真下・ひじ 90°・持ち物は垂直）で固定。持ち物の前後の傾き＝胴の前後の傾き（歩き 3°・走り 16° 前へ）。左右の傾き・腕の振りによる倒れはかけない。剣・メイスは従来の振り（o.fixed を付けない）
    if (o.fixed || (window.__GRIPFIXED && window.__GRIPFIXED.some(n => P[n] === o.prop))) {   // window.__GRIPFIXED＝['staff', 'spear']：確かめ用（各担当のファイルが fixed: true を付ける前に試す）
      const qt = new T.Quaternion(), u = new T.Vector3();
      const updateFixed = () => {
        arm.rotation.set(0, 0, 0); setFore(); G.updateMatrixWorld(true);
        G.getWorldQuaternion(qG); h.set(0, 0, 1).applyQuaternion(qG); h.y = 0; h.normalize();
        P.torso.getWorldQuaternion(qt); u.set(0, 1, 0).applyQuaternion(qt);
        const beta = Math.atan2(u.dot(h), u.y) * (o.tiltK != null ? o.tiltK() : 1);   // 胴の前傾（前へ＋）。tiltK：持ち物の前後の傾きを胴の前傾の何倍にするか（人ごと。既定 1）
        qa.setFromAxisAngle(ax, -beta); qd.copy(qG).multiply(qa);
        fore.getWorldQuaternion(qF); o.prop.quaternion.copy(qF.invert()).multiply(qd);
      };
      o.prop.position.set(0, C.HANDY, 0.01); fore.add(o.prop); P.gripFixed = true; updateFixed();
      return updateFixed;
    }
    const update = () => {
      setFore(); G.updateMatrixWorld(true);
      G.getWorldQuaternion(qG); h.set(0, 0, 1).applyQuaternion(qG); h.y = 0; h.normalize();
      d.set(0, -1, 0).transformDirection(fore.matrixWorld);
      const lim = window.__GRIPMAX != null ? window.__GRIPMAX : (o.max != null ? o.max : C.GRIPMAX), alpha = Math.max(-lim, Math.min(lim, Math.atan2(d.y, d.dot(h))));   // 前後の倒れの上限（ユーザー判断 b 2026-10-26：垂直から前後とも C.GRIPMAX）
      // 左右の傾き（ユーザー判断 2026-10-26「腕の振りに合わせた」図）：真後ろから見て、腕が前（α>0）のとき持ち物の拳から上が体の内がわへ、腕が後ろ（α<0）のとき拳から下が内がわへ（＝上は外へ）。α に比例（上限 C.GRIPROLL）。内がわ＝持つ手から体の中心へ向く向き
      const roll = (window.__GRIPROLL != null ? window.__GRIPROLL : (o.roll != null ? o.roll : C.GRIPROLL)) * Math.max(-1, Math.min(1, alpha / lim)) * (arm.position.x < 0 ? -1 : 1);
      qa.setFromAxisAngle(ax, alpha); qr.setFromAxisAngle(hz, roll); qd.copy(qG).multiply(qr).multiply(qa);
      fore.getWorldQuaternion(qF); o.prop.quaternion.copy(qF.invert()).multiply(qd);
    };
    o.prop.position.set(0, C.HANDY, 0.01); fore.add(o.prop);
    const keep = arm.rotation.clone(); arm.rotation.set(0, 0, 0); update(); arm.rotation.copy(keep);
    return update;
  }
  // 盾を持つ腕（2026-10-29 ユーザー「盾を持つ手としてのルールを作って良い」。戦士の盾の腕の形を、盾を持つ人の共通の作りに＝戦士・ワルキューレ）：
  //   上うでを外へ 0.26 開き・前へ 0.1 かたむけ、ひじを 0.6 曲げてかまえて止める（腕を振らない。走りでも盾・手がマントに入らない＝腕を振ると戦士の R5cape 0→78）。
  //   盾は、その腕のひじから先に、面を外へ向けて付ける（ひじから先と平行）。holdShield は毎コマ pose のあとで呼ぶ。mountShield は盾の部品（中心が原点・面が +z）を付ける
  const SHIELD = { arm: [-0.1, 0.26], fore: -0.6, at: [0.11, -0.15, 0.03] };
  function holdShield(P, side = 'L') { P.shieldSide = side; const sx = P['arm' + side].position.x < 0 ? -1 : 1; P['arm' + side].rotation.set(SHIELD.arm[0], 0, sx * SHIELD.arm[1]); P['fore' + side].rotation.set(SHIELD.fore, 0, 0); }
  function mountShield(P, sd, side = 'L') { const sx = P['arm' + side].position.x < 0 ? -1 : 1; P['fore' + side].add(sd); sd.position.set(sx * SHIELD.at[0], SHIELD.at[1], SHIELD.at[2]); sd.rotation.set(0, sx * Math.PI / 2, 0); }
  // 胴の上の端を肩の関節の高さに（2026-10-29 ユーザー「全員、胴の上の端を肩の関節（0.44）に合わせる」）：胴の部品（腕・頭・持ち物・なで肩の円すい台・肩から作るマント capeSheet を除く）を、
  //   胴の座標で y0（胸の中ほど）から上だけ縮め、胴の上の端 top を肩の関節（armL の高さ。女性は腰の分を含めた高さ）へ下ろす。top より上の部品（襟・肩かけ・肩当て）は同じだけ下へずらす（形は同じ）。
  //   胴の下の部品（帯・裾）は動かない。胴の子の組（マントの軸など）は位置だけずらす。襟・服ができたあと、首をそろえる（fitNeck・femaleHead）前に呼ぶ。下げた量を返す
  const TORSOY0 = 0.2;
  function fitTorsoTop(T, P, top, o = {}) {
    const tor = P.torso, y1 = P.armL.position.y, d = top - y1; if (Math.abs(d) < 1e-4) return 0;
    const y0 = o.y0 != null ? o.y0 : TORSOY0, sh = y => y <= y0 ? 0 : y >= top ? d : d * (y - y0) / (top - y0);
    const skip = new Set([P.armL, P.armR, P.head, P.spear, P.staff, P.sword, P.shield, P.capeShield, P.bow, P.bowCarry, P.mace].filter(Boolean));
    tor.updateMatrixWorld(true); const v = new T.Vector3();
    for (const c of tor.children.slice()) {
      if (skip.has(c) || c.name === 'shoulder_cone' || c.name === 'shoulder_cap' || c.name === 'cape' || c.name === 'cape_in') continue;
      if (!c.isMesh) { c.position.y -= sh(c.position.y); continue; }
      const g = c.geometry.clone(), pa = g.attributes.position, M = c.matrix, Mi = new T.Matrix4().copy(M).invert();
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(M); v.y -= sh(v.y); v.applyMatrix4(Mi); pa.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); c.geometry = g;
    }
    tor.updateMatrixWorld(true); return d;
  }
  // 前髪を額に沿わせる（2026-10-29 ユーザー「横から見ると前髪と頭の間に隙間が見える」。前髪のある人全員の決まり）：頭の丸い髪（球の部品 g。頭の座標で中心 cy・cz、倍率 ky・kz）の前の面を、顔の箱の額の丸み（角の丸み FR）の続きより前へ出さない。
  // y はそのまま z だけ下げるので、正面から見た前髪のふちの高さ・形は変わらない。ふちの上は、つばの下（top）へ向かって元の球へなだらかに戻す
  function browHug(g, { cy, cz, ky, kz, FR, gap = 0.008, top = 0.43 }) {
    const p = g.attributes.position, zc = FZ + FD / 2 - FR, yc = FY + FH / 2 - FR, r = FR + gap, yt = yc + r;   // 額の丸みの中心（z・y）と、丸みの上の端
    let y0 = Infinity; for (let i = 0; i < p.count; i++) y0 = Math.min(y0, cy + p.getY(i) * ky);
    const yF = FY + FH / 2 - 0.005;   // 額の丸みより後ろ（顔の上の平らな面の上）は、髪のふちを顔の上の端まで下ろす（横から、ふちと顔の上の端のあいだに細い帯のすき間が見えた）。正面からは、そこは前から髪の色（奥の髪の内がわ）なので変わらない
    if (y0 > yF) for (let i = 0; i < p.count; i++) { const y = cy + p.getY(i) * ky, z = cz + p.getZ(i) * kz, w = Math.min(1, Math.max(0, (zc + 0.03 - z) / 0.03)); if (!w || y >= top) continue; p.setY(i, (y - (y0 - yF) * w * (1 - (y - y0) / (top - y0)) - cy) / ky); }
    for (let i = 0; i < p.count; i++) {
      const y = cy + p.getY(i) * ky, z = cz + p.getZ(i) * kz; if (z <= zc) continue;
      const zm = y < yt ? zc + Math.sqrt(Math.max(0, r * r - (y - yc) ** 2)) : zc + gap + (z - zc - gap) * Math.min(1, Math.max(0, (y - yt) / (top - yt))) ** 2;
      if (z > zm) p.setZ(i, (zm - cz) / kz);
    }
    return g;   // 面の向き（明るさ）は元の丸い髪のまま（向きを計算し直すと、前髪に暗い帯が出て、正面の印象が変わった）
  }
  // 頭蓋骨の形（2026-10-29。武闘家 M6a の HAIRFIT.dome を共通に。僧侶の帽子と同じ作り）：半径 R の球の上半分を、側面は赤道の太さのまま w×R の高さまでまっすぐ立ち上げ、その上は高さ h×R の丸み（h を省くと てっぺんの高さが同じ 1−w）。
  // tw：まっすぐな所と丸い所の境目の、球の上からの角。geo(g)：球の形の geometry の上半分を写す。k(d)：向き d の点を面に置くときの横の倍率。map(th)：球の上からの角 th → [横の半径, 高さ]
  function dome(R, DM) {
    const map = th => { const tw = DM.tw, w = DM.w; if (th >= tw) return [R, R * w * (Math.PI / 2 - th) / (Math.PI / 2 - tw)]; const ph = th / tw * Math.PI / 2; return [R * Math.sin(ph), R * w + R * (DM.h != null ? DM.h : 1 - w) * Math.cos(ph)]; };
    const geo = g => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, y, z), h = Math.hypot(x, z); if (y <= 0 || r < 1e-6) continue; const [nh, ny] = map(Math.acos(Math.min(1, y / r))), k = r / R; if (h > 1e-6) { p.setX(i, x / h * nh * k); p.setZ(i, z / h * nh * k); } p.setY(i, ny * k); } g.computeVertexNormals(); return g; };
    const k = d => { const th = Math.acos(Math.max(-1, Math.min(1, d.y))), s = Math.sin(th); return th > Math.PI / 2 || s < 1e-6 ? 1 : map(th)[0] / (R * s); };
    return { map, geo, k };
  }
  // 頭をおおうボブの髪（2026-10-29 ユーザー判断「帽子がないので武闘家と共通の作りにするのが正解」。武闘家 M6a の髪の作りをそのまま移した）：頭の丸い髪（dome＝頭蓋骨の形・cyl）・うしろ髪・前髪の房（tufts）・頬を囲む横髪（lock・lockY）・うなじ・あごのうしろ。
  // HF：武闘家の HAIRFIT の形（cz・k・bang・tufts・tuft・bangs2・lock・lockY・nape・dome・cyl）。HAIR：髪の色。put(geo, 色, x, y, z, 親, 名前, 両面)：部品を足す関数（人ごとの材質）。side(sx, 寸法)：横髪のあとに人ごとの飾りを足す（武闘家のお団子）
  const BOB = {cz: -0.01, k: [0.88, 0.88, 0.86], bang: null, lock: [0.2, 0.05, 0.36, 1.4], nape: [-0.11, 1.16, 0.7], dome: {w: 0.15, tw: 1.43, h: 0.85}, lockY: [0.235, 2.0], tuft: 1.15, tufts: [[-0.12, 0.8], [-0.06, 0.95], [0, 1.05], [0.06, 0.9], [0.12, 0.8]]};   // 武闘家 M6a の髪の数（2026-10-29 ユーザー判断：案 B5〜M6a。hero3d_monk.js の HAIRFIT から移した）
  // なで肩（共通。2026-10-29 ユーザー「肩のなだらかさも大事なポイントだ」で、僧侶 v10.7 の作りを全員の共通に）：首の付け根（肩の関節の高さ yS の 0.03 上、半径 0.13）から、肩の関節の 0.11 下（半径 0.4。女性は横 0.9 倍＝C.FEMALE）へ下がる円すい台を胴に置く（前後 0.45 倍）。袖の上の端は、この面より下に下げる（人ごと）
  function shoulderCone(T, torso, mat, o) {
    const k = o.female ? C.FEMALE : 1, m = new T.Mesh(new T.CylinderGeometry(0.13, 0.4 * k, 0.14, Math.round(18 * (o.Q || 1))), mat);
    m.position.set(0, o.yS - 0.04, 0); m.scale.set(1, 1, 0.45); m.name = 'shoulder_cone'; torso.add(m);
    const D = o.drop != null ? o.drop : 0; if (D > 0) { const c = new T.Mesh(new T.CylinderGeometry(0.4 * k, 0.4 * k, D, Math.round(18 * (o.Q || 1))), mat); c.position.set(0, o.yS - 0.11 - D / 2, 0); c.scale.set(1, 1, 0.45); c.name = 'shoulder_cap'; torso.add(c); }   // 肩先（使わない＝既定 0。案C で外した。2026-10-29 ユーザー「腕と胴がほとんど点でつながっているようになっている」）：円すい台のすその下を、同じ太さのまま drop だけまっすぐ下ろす。腕の付け根の上を胴の色でおおい、腕と胴が線でつながる
    return m;
  }
  // 外形（HF.shell {r, h, y, z, front, lo}）：y より上は僧侶 P1 の帽子（横・前後の半径 r・高さ h の丸み、中心の前後 z）、y より下は細くせず、すその太さ r から今のうしろ髪の下半分の式（r×(1−lo×(下がった高さ÷r)²)）で首の上まで下ろす。前は front（顔の前の面）より前へ出さない。
  // at(p)：頭の座標の点 p を、頭の丸い髪の中心（0, cy, cz）からの向きのまま外形の上へ（中心より下の点は高さを保って横だけ）。dir(d, f)：向き d の外形の点の f 倍の所（お団子の付け根）
  function shellOf(S, cy, cz) {
    const rad = Y => Y >= S.y + S.h ? 0 : Y >= S.y ? S.r * Math.sqrt(1 - ((Y - S.y) / S.h) ** 2) : Math.max(0, S.r * (1 - S.lo * ((S.y - Y) / S.r) ** 2));
    const hit = (dx, dy, dz) => { let a = 0, b = 1; for (let k = 0; k < 40; k++) { const t = (a + b) / 2, Y = cy + dy * t, Z = cz + dz * t; if (Math.hypot(dx * t, Z - S.z) < rad(Y)) a = t; else b = t; } return a; };
    const cut = (x, y, z) => ({ x, y, z: Math.min(z, S.front) });
    return {
      at: p => { const dx = p.x, dy = p.y - cy, dz = p.z - cz; if (dy <= 0) { const h = Math.hypot(dx, dz - (S.z - cz)), r = rad(p.y); if (h < 1e-6) return p; const ux = dx / h, uz = (dz - (S.z - cz)) / h; return cut(ux * r, p.y, S.z + uz * r); } const n = Math.hypot(dx, dy, dz), t = hit(dx / n, dy / n, dz / n); return cut(dx / n * t, cy + dy / n * t, cz + dz / n * t); },
      dir: (d, f) => { const t = hit(d.x, d.y, d.z) * f; return { x: d.x * t, y: cy + d.y * t, z: Math.min(cz + d.z * t, S.front) }; } };
  }
  // 短髪の人の頭の髪の外形（2026-10-29 ユーザー判断：侍・傭兵「頭の形は良くなった」）：頭を包む丸い髪（名前 hair・半径 1 の球を伸ばした部品）を、僧侶 P1 の帽子をかぶった頭の外形（武闘家 R1・エルフと同じ shellOf）へ当てる。
  //   o.shell：外形の数を変える（傭兵は小さく）。o.line(x, z)：前の生え際の高さ（おでこを出す）。頭の上の小さな髪の部品（房・髷の組）は新しい外形の上へ移す（tuftUp：上向きに寄せる、tuftK：外形の何倍の所＝1 より小さいと頭の中）
  function shellHead(T, head, o = {}) {
    const S = Object.assign({ r: 0.2875, h: 0.285, y: 0.335, z: -0.03, front: 0.2, lo: 0.35 }, o.shell || {}), cy = 0.255, cz = -0.01, sp = shellOf(S, cy, cz), v = new T.Vector3();
    let main = null; head.children.forEach(m => { if (m.isMesh && m.name === 'hair' && m.geometry.type === 'SphereGeometry' && m.geometry.parameters.radius === 1 && !main) main = m; });
    if (main) { const pa = main.geometry.attributes.position, M = main.matrix, Mi = new T.Matrix4().copy(M).invert();
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(M); if (v.y < 0.2) continue; const q = sp.at(v); v.set(q.x, q.y, q.z); if (o.line) { const L = o.line(v.x, v.z); if (L != null && v.y < L) v.y = L; } v.applyMatrix4(Mi); pa.setXYZ(i, v.x, v.y, v.z); } main.geometry.computeVertexNormals(); }
    head.children.forEach(m => { if (m === main || !(m.name === 'hair' || m.name === '')) return; if (m.position.y < 0.36) return; const d = new T.Vector3(m.position.x, m.position.y - cy, m.position.z - cz); if (o.tuftUp && m.isMesh) d.set(d.x, o.tuftUp, d.z * 0.3); d.normalize(); const q = sp.dir(d, m.isMesh ? (o.tuftK || 0.97) : 1.0); m.position.set(q.x, q.y, q.z); });
    return main;
  }
  function bobHair(T, head, o) {
    const { HF, HAIR, put, Q = 1 } = o;
    { const hp = head, cy = 0.255, cz = HF.cz, R = 0.255, [kx, ky, kz] = HF.k;
      const sup = g => { if (!HF.cyl) return g; const n = HF.cyl, p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, y, z); if (y <= 0 || r < 1e-6) continue; const dh = Math.hypot(x, z) / r, dy = y / r, k = Math.pow(Math.pow(dh, n) + Math.pow(dy, n), -1 / n); p.setXYZ(i, x * k, y * k, z * k); } g.computeVertexNormals(); return g; };   // cyl（n）：頭の上半分を筒に（2026-10-29 ユーザー「武闘家の頭も円筒にしてみたい」の試し）。球の上半分の点を、同じ向きのまま |横|^n＋|上|^n＝1 の面（n が大きいほど、横はまっすぐ・上は平ら・角は小さく丸い）へ押し出す。下半分（ボブの形）は同じ
      const DMf = HF.dome ? dome(R, HF.dome) : null, domeG = g => DMf ? DMf.geo(g) : g, domeK = d => DMf ? DMf.k(d) : 1;   // dome：僧侶の帽子と同じ作り（頭蓋骨の形）＝側面は赤道の太さのまま w×R の高さまでまっすぐ立ち上げ、その上は丸い（てっぺんの高さは同じ）。共通の canon.dome（エルフも使う）。domeK：お団子の付け根（横だけ合わせる）
      const supK = d => HF.cyl ? Math.pow(Math.pow(Math.hypot(d.x, d.z), HF.cyl) + Math.pow(Math.max(0, d.y), HF.cyl), -1 / HF.cyl) : 1;   // お団子の付け根を、筒の面の上に置く
      const crown = put(domeG(sup(new T.SphereGeometry(R, Math.round(18 * Q), Math.round(10 * Q), 0, Math.PI * 2, 0, 1.17))), HAIR, 0, cy, cz, hp, 'hair_crown'); crown.scale.set(kx, ky, kz);
      const back = put(new T.SphereGeometry(R * 1.01, Math.round(18 * Q), Math.round(14 * Q), Math.PI * 0.95, Math.PI * 1.1, 0, 2.95), HAIR, 0, cy, cz, hp, 'hair_back', true); back.scale.set(kx, ky, kz);   // うしろ半分は、上から首の上まで（うなじとの境目に段を作らない） 1 枚（継ぎ目を作らない）
      sup(back.geometry); domeG(back.geometry); { const pa = back.geometry.attributes.position, Rb = R * 1.01; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), h = Math.hypot(x, z); if (y >= 0 || h < 1e-6) continue; const want = Rb * (1 - 0.35 * (y / Rb) ** 2); if (h < want) { pa.setX(i, x * want / h); pa.setZ(i, z * want / h); } } back.geometry.computeVertexNormals(); }   // うしろ髪の下半分は、すぼめずに首の上まで下ろす（ボブの形。うなじの球が下からはみ出して、後ろ頭に段ができていた）
      const shellPt = HF.shell ? shellOf(HF.shell, cy, cz) : null;   // shell（2026-10-29 ユーザー判断：武闘家 R1）：頭の丸い髪とうしろ髪を、僧侶 P1 の帽子をかぶった頭の外形に当てる（顔の大きさでそろえた縮尺 1.00）。渡さなければ dome・cyl の形
      if (shellPt) for (const m of [crown, back]) { const pa = m.geometry.attributes.position, v = new T.Vector3(); for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).multiply(m.scale).add(m.position); const q = shellPt.at(v); pa.setXYZ(i, (q.x - m.position.x) / m.scale.x, (q.y - m.position.y) / m.scale.y, (q.z - m.position.z) / m.scale.z); } m.geometry.computeVertexNormals(); }
      if (HF.bang) { const bang = put(new T.BoxGeometry(HF.bang[0], 0.06, HF.bang[1]), HAIR, 0, 0.375, HF.bang[2], hp, 'hair_bangs'); bang.rotation.x = HF.bang[3]; }   // bang が null：前髪の板を付けない（丸い髪のふちが前髪になる）
      for (const [x, s] of (HF.tufts || [[-0.035, 1], [0.035, 0.85]])) { const tk = HF.tuft || 1, c = put(new T.ConeGeometry(0.045 * tk, 0.075 * s * tk, Math.round(8 * Q)), HAIR, x * tk, 0.345 + 0.0375 * s * (tk - 1), 0.2, hp, 'hair_bang'); c.rotation.x = Math.PI; c.scale.set(1, 1, 0.45 * tk); }   // tuft：房の大きさの倍率（下の先の高さは同じ）。tufts：房の並び [x, 長さの倍率]（前髪のボリューム。2026-10-29 ユーザー「前髪のボリュームを増やして」）
      if (HF.bangs2) { const [bw, bh, bd, by, bz] = HF.bangs2, b = put(new T.SphereGeometry(1, Math.round(16 * Q), Math.round(8 * Q)), HAIR, 0, by, bz, hp, 'hair_bangs'); b.scale.set(bw, bh, bd); }   // bangs2 [半幅, 半高さ, 半奥行き, 高さ, 前後]：前髪のふくらみ（2026-10-29 ユーザー「前髪のボリュームを増やして」）。下の端は今の前髪のふちより下げない   // 前髪の房は目の間だけ（目の上にかけると白い点を隠す）
      for (const sx of [-1, 1]) {   // 頬を囲む横髪（耳の前を通って、あごの上まで）
        const lk = put(new T.SphereGeometry(0.1, Math.round(10 * Q), Math.round(8 * Q)), HAIR, sx * HF.lock[0], HF.lockY ? HF.lockY[0] : 0.2, HF.lock[1], hp, 'hair_lock'); lk.scale.set(HF.lock[2], HF.lockY ? HF.lockY[1] : 1.65, HF.lock[3]);   // lockY [中心の高さ, 縦の倍率]：上の端を頭の丸い髪の中に埋める（2026-10-29 ユーザー「顔の横の髪が楕円形なので，斜め後ろから見ると反りこみが入っているように見える」）
        if (o.side) o.side(sx, { R, cy, cz, kx, ky, kz, supK, domeK, shellPt });   // 人ごとの飾り（武闘家のお団子）
      }
      // うなじ・あごのうしろ：あごの高さ（頭の座標 0.05）より上は髪の色、下は胴着の濃い赤（襟の内側に見える色）。前から見て あごの下の顔の幅に出る所が髪の色だと、ひげに見えた（魔法使いの担当の調べ）。うしろから見て首の肌が見えない（R6）
      { const split = (r, sy, cy0, cut) => Math.acos(Math.max(-1, Math.min(1, (cut - cy0) / (r * sy))));   // 球の中心 cy0・縦の半径 r×sy のとき、高さ cut で上下に分ける角
        const tn = split(0.2, 0.82, 0.06, 0.05), tj = split(0.085, 1.3, 0.065, 0.05);
        for (const [th0, th1, c, nm] of [[0, tn, HAIR, 'hair_nape']]) put(new T.SphereGeometry(0.2, Math.round(12 * Q), Math.round(8 * Q), 0, Math.PI * 2, th0, th1), c, 0, 0.06, HF.nape[0], hp, nm).scale.set(HF.nape[1], 0.82, HF.nape[2]);
        for (const sx of [-1, 1]) for (const [th0, th1, c, nm] of [[0, tj, HAIR, 'hair_jaw']]) put(new T.SphereGeometry(0.085, Math.round(10 * Q), Math.round(8 * Q), 0, Math.PI * 2, th0, th1), c, sx * 0.19, 0.065, -0.095, hp, nm).scale.set(0.6, 1.3, 1.2); } }   // あごのうしろの角（斜め後ろから、あごの横の肌が見えない）
  }
  // 首の見える長さ（2026-10-29 ユーザー「武闘家と同じルールを適用するなら下げるが、隙間が武闘家と同じくなるか」「なるべく共通ルールを使うこと」）：
  // 立ちの姿で、あごの下（顔の箱の下の端）から、首の前の面（頭の座標で半径 0.075、yaw＝0 正面・0.7 斜め前）をまっすぐ下へたどって、最初に当たる服・体（頭の部品・腕・持ち物を除く）までの高さ（全体の座標）
  function neckGap(T, group, P, yaw = 0) {
    group.updateMatrixWorld(true);
    let fm = null; P.head.traverse(o => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.widthSegments === 8) fm = o; }); if (!fm) return null;
    const chin = new T.Box3().setFromObject(fm).min.y, skip = [P.head, P.armL, P.armR, P.spear, P.staff, P.sword, P.shield, P.bow, P.bowCarry].filter(Boolean);
    const under = o => { for (let q = o; q; q = q.parent) if (skip.includes(q)) return true; return false; }, ms = []; group.traverse(o => { if (o.isMesh && o.visible && !under(o)) ms.push(o); });
    const p = P.head.localToWorld(new T.Vector3(Math.sin(yaw) * 0.075, 0.05, Math.cos(yaw) * 0.075)); p.y = chin - 0.001;
    const rc = new T.Raycaster(p, new T.Vector3(0, -1, 0)), dbl = []; for (const o of ms) if (o.material && o.material.side !== T.DoubleSide) { dbl.push([o, o.material.side]); o.material.side = T.DoubleSide; }
    const h = rc.intersectObjects(ms, false)[0]; for (const [o, sd] of dbl) o.material.side = sd;
    return h ? chin - h.point.y : null;
  }
  // 首の見える長さを、正面で C.NECKV（ゲームの武闘家 M6a の値）にそろえる：長い分だけ頭を下げる（max まで。背は合わせ直さない）。下げた量（胴の座標）を返す
  function fitNeck(T, group, P, max = 0.05) {
    const g = neckGap(T, group, P, 0); if (g == null) return 0;
    const d = Math.max(0, Math.min(max, (g - C.NECKV) / group.scale.y)); P.head.position.y -= d; group.updateMatrixWorld(true); return d;
  }
  // 女性の頭（2026-10-29 ユーザー判断：女性全員の共通ルール）：頭を C.FHEAD 倍（今は 1＝男性と同じ）にし、首の見える長さを C.NECKV にそろえてから、さらに C.FNECKD 下げる（武闘家で決めた手順。背は合わせ直さない）。組み立ての最後（襟・服ができたあと）に呼ぶ。pose：その人の pose
  function femaleHead(T, group, P, pose, extra = C.FNECKD, k = C.FHEAD) { P.head.scale.multiplyScalar(k); pose('stand', 0); fitNeck(T, group, P, 0.1); P.head.position.y -= (typeof window !== 'undefined' && window.__FNECKD != null) ? window.__FNECKD : extra; pose('stand', 0); }   // k：頭の倍率（既定 C.FHEAD＝1）。extra：さらに下げる量（人ごと。正面で見える首の面積を武闘家とそろえる。既定は武闘家の 0.02）。window.__FNECKD は確かめ用
  // 頭の外形の断面（頭の座標、高さ y）：頭の部品（顔・髪・耳。兜・帽子＝userData.helm と、名前が wing の部品は除く）の外側の面を、まわりから水平にたどって当たった所の範囲 { x0, x1, z0, z1 }。かぶりものの大きさの決まり（頭の外形の +30% 前後）を測る
  function headSection(T, head, y) {
    head.updateMatrixWorld(true); const ms = [], skip = o => { for (let q = o; q && q !== head; q = q.parent) if (q.userData.helm || /wing/.test(q.name)) return true; return false; };
    head.traverse(o => { if (o.isMesh && !skip(o)) ms.push(o); });
    const inv = new T.Matrix4().copy(head.matrixWorld).invert(), rc = new T.Raycaster(), r = [9, -9, 9, -9];
    for (let a = 0; a < 360; a += 3) { const d = new T.Vector3(Math.sin(a * Math.PI / 180), 0, Math.cos(a * Math.PI / 180)), o = d.clone().multiplyScalar(2).setY(y);
      rc.set(o.applyMatrix4(head.matrixWorld), d.negate().transformDirection(head.matrixWorld)); const h = rc.intersectObjects(ms, false)[0]; if (!h) continue;
      const p = h.point.clone().applyMatrix4(inv); r[0] = Math.min(r[0], p.x); r[1] = Math.max(r[1], p.x); r[2] = Math.min(r[2], p.z); r[3] = Math.max(r[3], p.z); }
    return { x0: r[0], x1: r[1], z0: r[2], z1: r[3] };
  }
  // 金属の兜の本体（2026-10-29 ユーザー「兜の丸みは戦士と共通？」「なるべく共通ルールを使うこと」）：戦士の兜（hero3d.js の canon v6・Z1）と同じ作り。
  // 半球（帯の高さが赤道）＋真ん中を上ほど持ち上げるしのぎ＋しのぎの明るい線（半円の輪）＋すその帯（鉄の厚み th。下へのばす。底でふさがる）＋帯の上の張り出しの輪。
  // 大きさだけ人ごと：rx・rz＝すその帯の横・前後の半径、hk＝本体の高さ÷本体の横の半径（既定は戦士と同じ HELMK≒0.894）、y＝帯の上の端より 0.0175 下（本体の赤道）、z＝中心の前後。色は iron・ridge・band
  const HELMK = 0.285 / (0.3 * 1.0625);   // 戦士の兜（Z1）の丸み：本体の高さ 0.285 ÷ 横の半径 0.3×1.0625（≒0.894）
  function helm(T, head, o) {
    if (o.k) { const th = o.th || 0.065, sc = headSection(T, head, o.y + 0.0175 - th - 0.01); o = { ...o, rx: o.k * (sc.x1 - sc.x0) / 2, rz: o.k * (sc.z1 - sc.z0) / 2, z: (sc.z0 + sc.z1) / 2 }; }   // k：すその帯の下の端のすぐ下の頭の外形に対する倍率（金属の兜は 1.3 前後）
    const { mat, Q = 1 } = o, g = new T.Group(), gx = o.scale ? o.scale[0] : o.rx / 0.315, gz = o.scale ? o.scale[2] : o.rz / 0.315, gy = o.scale ? o.scale[1] : (o.hk || HELMK) * 0.3 * gx / 0.285;   // scale：倍率を直接（戦士 [1.0625, 1, 0.9125]）
    const dome = new T.Mesh(new T.SphereGeometry(0.3, Math.round(16 * Q), Math.round(8 * Q), 0, Math.PI * 2, 0, Math.PI / 2), mat(o.iron)); dome.scale.set(1.0, 0.95, 1.02);
    { const hp = dome.geometry.attributes.position; for (let i = 0; i < hp.count; i++) { const x = hp.getX(i), y = hp.getY(i); hp.setY(i, y + 0.045 * Math.max(0, 1 - Math.abs(x) / 0.11) * Math.pow(Math.max(0, y) / 0.3, 1.5)); } dome.geometry.computeVertexNormals(); }   // しのぎ
    const rid = new T.Mesh(new T.TorusGeometry(0.3, 0.02, 5, Math.round(24 * Q), Math.PI), mat(o.ridge)); rid.rotation.y = Math.PI / 2; rid.scale.set(1, 1.1, 1); rid.scale.multiply(new T.Vector3(1.02, 0.95, 1.0));
    const TH = (o.th || 0.065) / gy, band = new T.Mesh(new T.CylinderGeometry(0.315, 0.315, TH, Math.round(16 * Q)), mat(o.band)); band.position.y = (0.035 - TH) / 2;
    const bd = new T.Mesh(new T.TorusGeometry(0.31, 0.022, 6, 20), mat(o.band)); bd.rotation.x = Math.PI / 2; bd.position.y = 0.025;
    for (const m of [dome, rid, band, bd]) { m.userData.helm = true; g.add(m); }
    g.position.set(0, o.y, o.z || 0); g.scale.set(gx, gy, gz); g.name = 'helm'; head.add(g);
    return { group: g, rx: 0.315 * gx, rz: 0.315 * gz, z: o.z || 0, top: o.y + gy * (0.3 * 0.95 + 0.045), surf: (u, v) => [u * 0.3 * gx, o.y + v * 0.285 * gy] };   // surf：本体の面の点（u＝横の向きの割合・v＝高さの割合）
  }
  // 男性の共通の正面の顔（2026-10-29 ユーザー判断：戦士 H1・僧侶 P1 で決めた顔。侍・傭兵も同じ＝「腕以外も含めて全キャラクターについて共通化を進めて」）。buildHead の face に渡す。人ごとに足すのは ext（かぶりものの額）など
  const FACEM = { eye: { x: 0.093, y: 0.25, w: 0.07, h: 0.17, round: 0.016 }, glint: [{ w: 0.046, h: 0.05, dx: 0.008, dy: 0.042 }], nose: { w: 0.02, h: 0.018, y: 0.185 }, mouth: { w: 0.055, h: 0.02, c: 0x9a5a4a, y: 0.125, corner: 0.014 }, FW: 0.37, FR: 0.08 };
  // 女性の共通の正面の顔（2026-10-29 ユーザー判断：武闘家・魔法使い・ワルキューレ・エルフで決めた顔）。まつ毛は 2 つ（かぶりもので額が見えない人は LASH1 の 1 つ）。
  //   人ごとに残すのは決めた例外だけ（武闘家の小さい白い点・ワルキューレと魔法使いの目の x・魔法使いの顔の横の丸み）と ext（額）。face(base, over)：目（eye）は中身ごと重ねる
  const LASH1 = [{ w: 0.026, h: 0.024, dx: 0.05, dy: 0 }];
  const FACEF = { eye: { x: 0.093, y: 0.25, w: 0.075, h: 0.175, round: 0.018 }, glint: [{ w: 0.046, h: 0.05, dx: 0.01, dy: 0.045 }], lash: [LASH1[0], { w: 0.026, h: 0.024, dx: 0.071, dy: 0.02 }], nose: { w: 0.02, h: 0.018, y: 0.185 }, mouth: { w: 0.055, h: 0.02, c: 0xd8584c, y: 0.125, corner: 0.014 }, blush: { w: 0.065, h: 0.03, c: 0xf77c8b, x: 0.143, y: 0.168 }, FW: 0.37, FR: 0.095, FRt: 0.02 };
  const face = (base, over) => over ? Object.assign({}, base, over, over.eye ? { eye: Object.assign({}, base.eye, over.eye) } : {}, over.lash === 'one' ? { lash: LASH1 } : {}) : base;
  L().canon = { shellHead, C, FACEM, FACEF, LASH1, face, buildHead, browHug, fit, fitFoot, holdGrip, SHIELD, holdShield, mountShield, fitTorsoTop, TORSOY0, KICK, kick, footAlong, addSoles, kickPush, hairStrand, bendStrand, layStrand, SOLE, SOLES, capeSheet, capeLimbs, capeLikeWarrior, dome, bobHair, BOB, neckGap, fitNeck, femaleHead, headSection, helm, shoulderCone, FACE: { FW, FH, FD, FR, FZ, FY } };
  if (typeof module !== 'undefined' && module.exports) module.exports = L().canon;
})(typeof window !== 'undefined' ? window : globalThis);
