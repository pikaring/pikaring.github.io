/* 組み立て指示（ui/hero3d_specs.js の部品の表）から、主人公4人と同じ骨組みの 3D キャラクターを作る（2026-10-26 ユーザー判断：形は他の AI が作る指示書で決め、こちらは骨組みと動きだけ持つ）。
   骨組みは固定（腰・ひざ・足首・肩・ひじ・頭。座標の決まりは docs/3d-spec-prompts/ の指示書と同じ）：+y 上、+z キャラの前、+x ＝ 正面の絵で画面の右 ＝ キャラ自身の左（L の関節は +x、R は -x）。
   使い方：RQ.lowpoly.buildFromSpec(T, id, { toon, steps, q, eye, scaleLike }) → { group, parts, pose(mode, t, opt) }。parts は関節（body・torso・head・armL/R・foreL/R・legL/R・shinL/R・footL/R）と、部品の名前。
   顔（角丸の箱・目・鼻・口・首）は骨組みの側が作る。eye：目の形と色（既定は武闘家）。前提：hero3d.js・hero3d_specs.js を先に読む。 */
(function (root) {
  const RQ = root.RQ = root.RQ || {};
  const L = () => RQ.lowpoly;
  // 骨組みの足の裏は足首の 0.105 下。指示書の靴の底がそれより上なら、opt.footDrop だけ下げる

  function buildFromSpec(T, id, opt = {}) {
    const toon = opt.toon !== false, ST = opt.steps || 5, Q = opt.q || 1, spec = (L().specs || {})[id] || [];
    const eye = Object.assign({ w: 0.07, hi: 0.06, lo: 0.04, y: 0.26, top: 0x1a1216, bot: 0x7a6a72, glint: 0xffffff, lash: 0x1a1216 }, opt.eye || {});
    const CAN = opt.canon && L().canon ? L().canon : null, FEM = CAN && opt.female ? CAN.C.FEMALE : 1;   // CAN：共通の決まり（案。docs/3d-canon/canon.md）。女性は肩・手・靴が 0.9 倍
    const TX = CAN ? 0 : opt.torsoExtra || 0, ARM = CAN ? CAN.C.UA : opt.arm || 0.45;   // TX：胴を長くする分（そのぶん脚が短くなり、頭の高さは変わらない）
    const FH = CAN && opt.female ? CAN.C.FHIP : 0, LEG = CAN ? CAN.C.LEG + FH : 0.74 + 0.74 * 0.5 - TX, KN = LEG * 0.5, SH = LEG - KN, baseY = LEG + 0.03;   // 脚 1.5 倍の骨組み（武闘家・魔法使いと同じ）から、胴を長くしたぶんだけ短く
    const COL = L().COL;
    let grad = null;
    if (toon) { const lv = Array.from({ length: ST }, (_, i) => Math.round(95 + 160 * i / (ST - 1))); grad = new T.DataTexture(new Uint8Array(lv.flatMap(v => [v, v, v, 255])), ST, 1, T.RGBAFormat); grad.minFilter = grad.magFilter = T.NearestFilter; grad.needsUpdate = true; }
    const mat = c => toon ? new T.MeshToonMaterial({ color: new T.Color(c).multiplyScalar(0.74), gradientMap: grad }) : new T.MeshLambertMaterial({ color: c, flatShading: true });
    const group = new T.Group(), parts = {};
    const pivot = (x, y, z, p) => { const g = new T.Group(); g.position.set(x, y, z); (p || group).add(g); return g; };
    const body = parts.body = pivot(0, baseY, 0);
    for (const [n, sx] of [['L', 1], ['R', -1]]) {   // L ＝ +x（キャラ自身の左）
      const leg = parts['leg' + n] = pivot(sx * (CAN ? CAN.C.legX : 0.13), 0, 0, body), shin = parts['shin' + n] = pivot(0, -KN, 0, leg), foot = parts['foot' + n] = pivot(0, -(SH - 0.08), 0, shin);
    }
    const torso = parts.torso = pivot(0, 0, 0, body);
    for (const [n, sx] of [['L', 1], ['R', -1]]) { const arm = parts['arm' + n] = pivot(sx * (CAN ? CAN.C.shX * FEM : 0.285), CAN ? CAN.C.shY - FH : 0.38 + TX, 0, torso); parts['fore' + n] = pivot(0, -ARM, 0, arm); }
    const HS = CAN ? CAN.C.HS : opt.headScale || 0.9 * 1.3, NK = CAN ? 0 : opt.neck || 0;   // NK：首を長く見せる分（頭を上へ上げる）
    const head = parts.head = pivot(0, CAN ? CAN.C.headY - FH : 0.485 + TX + NK, 0, torso); head.scale.setScalar(HS);   // 頭の大きさ（既定は主人公4人と同じ。キャラごとに直せる）
    const add = (m, x, y, z, p) => { m.position.set(x, y, z); p.add(m); return m; };
    const box = (w, h, d, c, x, y, z, p) => add(new T.Mesh(new T.BoxGeometry(w, h, d), mat(c)), x, y, z, p);
    if (CAN) CAN.buildHead(T, head, { mat, COL, Q, female: !!opt.female, sideHair: opt.sideHair, napeHair: opt.napeHair, eyeColor: opt.eyeColor, face: opt.face });
    if (CAN && opt.hairCap != null) {   // v5.7：髪が頭の上と前（ひたい）をおおう（ユーザー判断。横から見て、顔の箱が髪の塊に貼りついて見えない）。髪の下の縁：前は目の上、よこは耳の上、うしろは低く
      const g = new T.SphereGeometry(1, Math.round(28 * Q), Math.round(16 * Q)), pa = g.attributes.position, sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i) * 0.225, z = pa.getZ(i) * 0.215; let y = pa.getY(i) * 0.285 + 0.2; const ymin = 0.12 + 0.14 * sm((z + 0.12) / 0.12) + 0.075 * sm((z - 0.02) / 0.12); if (y < ymin) y = ymin; pa.setXYZ(i, x, y, z); }
      g.computeVertexNormals(); const cap = new T.Mesh(g, mat(opt.hairCap)); cap.material.side = T.DoubleSide; head.add(cap);
    }
    else if (!CAN) {   // v5.7：canon は共通の buildHead だけ（以前は hairCap の無い canon でも、この古い顔が重なっていた）
    // 顔：戦士と同じ、角を丸めた箱の 1 曲面。首と耳つき
    const FW = 0.4, FH = 0.31, FD = 0.34, FR = 0.06, FZ = 0.02, FY = 0.205;
    { const fg = new T.BoxGeometry(FW, FH, FD, 8, 8, 8), fa = fg.attributes.position, v = new T.Vector3(), c = new T.Vector3(), cl = (x, h) => Math.max(-h, Math.min(h, x));
      for (let i = 0; i < fa.count; i++) { v.fromBufferAttribute(fa, i); c.set(cl(v.x, FW / 2 - FR), cl(v.y, FH / 2 - FR), cl(v.z, FD / 2 - FR)); v.sub(c).normalize().multiplyScalar(FR).add(c); fa.setXYZ(i, v.x, v.y, v.z); }
      fg.computeVertexNormals(); add(new T.Mesh(fg, mat(COL.face)), 0, FY, FZ, head); }
    add(new T.Mesh(new T.CylinderGeometry(0.07, 0.085, 0.1 + NK / HS, Math.round(10 * Q)), mat(COL.neck)), 0, -0.035 - NK / (2 * HS), 0, head);   // 首
    { const zf = FZ + FD / 2 + 0.002;
      for (const sx of [-1, 1]) {
        box(eye.w, eye.hi, 0.02, eye.top, sx * 0.1, eye.y + 0.025, zf, head); box(eye.w, eye.lo, 0.02, eye.bot, sx * 0.1, eye.y - 0.025, zf, head);
        box(0.022, 0.028, 0.024, eye.glint, sx * 0.1 - sx * 0.014, eye.y + 0.035, zf + 0.002, head); box(eye.w + 0.005, 0.016, 0.022, eye.lash, sx * 0.1 + sx * 0.002, eye.y + 0.058, zf + 0.001, head);
      }
      box(0.026, 0.03, 0.03, 0xe3a08c, 0, 0.19, zf, head); box(0.05, 0.014, 0.02, 0xd8584c, 0, 0.14, zf, head); }
    for (const sx of [-1, 1]) { const e = new T.Mesh(new T.SphereGeometry(0.05, Math.round(8 * Q), Math.round(6 * Q)), mat(COL.face)); e.scale.set(0.6, 1, 0.9); add(e, sx * 0.205, 0.2, 0.0, head); }   // 耳
    }
    // 土台（素肌の腕・手・脚・胴。指示書の服・防具が上から重なる。服が無い所は肌が見える）
    { const skin = CAN ? new T.Color(COL.face).multiplyScalar(CAN.C.SKINK) : COL.face, FT = CAN && opt.female ? CAN.C.FTHIN : 1, cyl = (r0, r1, h, c, x, y, z, p, sz = 1) => { const m = new T.Mesh(new T.CylinderGeometry(r0 * (p === torso ? 1 : FT), r1 * (p === torso ? 1 : FT), h, Math.round(12 * Q)), mat(c)); m.scale.set(1, 1, sz); return add(m, x, y, z, p); };
      for (const n of ['L', 'R']) {
        if (CAN) cyl(0.07, 0.063, ARM - 0.01, skin, 0, -ARM / 2 - 0.005, 0, parts['arm' + n]); else cyl(0.07, 0.063, ARM, skin, 0, -ARM / 2, 0, parts['arm' + n]); if (CAN) cyl(0.063, 0.055, -CAN.C.HANDY, skin, 0, CAN.C.HANDY / 2, 0, parts['fore' + n]); else cyl(0.063, 0.055, 0.2, skin, 0, -0.1, 0, parts['fore' + n]);   // 上の端を関節（袖の上の端と同じ高さ）より 0.01 下げる＝同じ高さの面が重なって肌色がちらつかない（エルフの担当の指摘）
        const h = new T.Mesh(new T.SphereGeometry(CAN ? CAN.C.HAND * (opt.female ? CAN.C.FTHIN : 1) : 0.06, Math.round(10 * Q), Math.round(8 * Q)), mat(skin)); h.scale.set(0.95, 1.05, 0.95); add(h, 0, CAN ? CAN.C.HANDY : -0.26, 0.01, parts['fore' + n]); parts['hand' + n] = h;
        cyl(0.09, 0.075, KN, skin, 0, -KN / 2, 0, parts['leg' + n]); cyl(0.075, 0.06, SH - 0.08, skin, 0, -(SH - 0.08) / 2, 0, parts['shin' + n]);
      }
      cyl(0.22, 0.15, 0.46 + TX, skin, 0, 0.23 + TX / 2, 0, torso, 0.7); }
    // 部品
    for (const p0 of spec) {
      let p = p0;
      const par = parts[p.parent]; if (!par) { console.warn('hero3d_spec: 関節がない', p.parent, p.name); continue; }
      const FT2 = CAN && opt.female && /^(arm|fore|leg|shin)/.test(p.parent) ? CAN.C.FTHIN : 1, KA = CAN && /^arm/.test(p.parent) ? CAN.C.UA / 0.3525 : 1;   // v5.7：女性の腕・脚は細く、肩の関節を上げたぶん上うでの部品は縮める
      if (KA !== 1 && p.shape !== 'sphere') { p = { ...p, size: p.size.slice(), pos: p.pos.slice() }; if (p.shape === 'cyl') p.size[2] *= KA; else p.size[1] *= KA; }
      if (KA !== 1) { p = { ...p, pos: [p.pos[0], p.pos[1] * KA, p.pos[2]] }; }
      if (CAN && String(p.color).toLowerCase() === '#fda172') p = { ...p, color: '#' + new T.Color(COL.face).multiplyScalar(CAN.C.SKINK).getHexString() };   // 武闘家の素肌の腕・手：顔と同じ色
      let geo; const s = p.size;
      if (p.shape === 'box') geo = new T.BoxGeometry(s[0], s[1], s[2]);
      else if (p.shape === 'cyl') geo = new T.CylinderGeometry(s[0], s[1], s[2], p.seg || Math.round(16 * Q));   // seg：辺の数（4 にすると四角すいだい。マント用）
      else if (p.shape === 'sphere') geo = new T.SphereGeometry(s[0], Math.round(12 * Q), Math.round(8 * Q));
      else if (p.shape === 'cone') geo = new T.ConeGeometry(s[0], s[1], Math.round(10 * Q));
      else { console.warn('hero3d_spec: 形が分からない', p.shape, p.name); continue; }
      const m = new T.Mesh(geo, mat(new T.Color(p.color))); if (FT2 !== 1) m.scale.set(FT2, 1, FT2); if (p.scale) m.scale.set(p.scale[0] * FT2, p.scale[1], p.scale[2] * FT2);
      const isFoot = /^foot/.test(p.parent), fs = 1;
      m.position.set(p.pos[0] * fs * FT2, p.pos[1] * fs - (isFoot ? (opt.footDrop || 0) : 0), p.pos[2] * fs * FT2); if (p.rot) m.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
      m.name = p.name; par.add(m); parts[p.name] = m;
    }
    // 動き：戦士と同じ（腰・膝・肩・ひじ）
    let ampS = null; const KK = CAN && CAN.KICK[id.replace(/_canon$/, '')];
    function pose(mode, t, o) {
      const run = mode === 'run', walk = mode === 'walk', moving = run || walk;
      const f = run ? 1.55 : 1.05, ph = t * Math.PI * 2 * f, s = Math.sin(ph), c = Math.cos(ph);
      let A = run ? 0.75 : 0.5;
      if (moving && o && o.stride > 0) { const want = Math.asin(Math.min(1, o.stride / (4 * LEG * (run ? 0.95 : 0.97)) * (run ? 0.65 : 1))); const tgt = Math.min(run ? 0.9 : 0.45, Math.max(run ? 0.45 : 0.2, want)); ampS = ampS == null ? tgt : ampS + (tgt - ampS) * 0.15; A = ampS; }
      const armA = run ? 0.95 : 0.5;
      const knee = sg => { if (!moving) return 0.02; const cs = sg * c, ss = sg * s, swing = Math.max(0, -cs), load = Math.max(0, cs) * Math.max(0, -ss); return CAN ? (run ? (window.__KNEE != null ? window.__KNEE : 1.4) * Math.pow(swing, 0.8) + 0.35 * load : 0.7 * Math.pow(swing, 0.9) + 0.15 * load) : run ? 1.9 * Math.pow(swing, 0.8) + 0.5 * load : 0.85 * Math.pow(swing, 0.9) + 0.18 * load; };
      let lowest = 0;
      for (const [leg, shin, foot, sg] of [[parts.legL, parts.shinL, parts.footL, 1], [parts.legR, parts.shinR, parts.footR, -1]]) {
        const th0v = moving ? sg * s * A + (run ? 0 : 0.04) : 0, th = CAN && run ? Math.min(Math.max(th0v, -0.32), opt.runBack || 9) : th0v, kb = knee(sg), kn = run && KK ? CAN.kick(kb, ph, sg, KK) : kb;   // canon は、走りで脚を前へ 0.32 より上げない（ももが上着・スカートの前へ出ない。戦士と同じ）。opt.runBack：走りで後ろへ出す上限（マントが戦士と同じ丈の人は戦士と同じ 0.6。後ろへ出すぎると、蹴り上げた足が裾に当たる）。KK：走りの蹴り上げ（hero3d_canon.js）
        leg.rotation.x = th; shin.rotation.x = kn; foot.rotation.x = run && KK ? (opt.footKickOnly ? CAN.footAlong(th, kn, kn - kb) : CAN.footAlong(th, kn)) : -(th + kn) * (run ? 0.75 : 1);   // footKickOnly：足をすねに合わせるのは、蹴り上げで共通の膝より深く曲げたぶんだけ（マントが戦士と同じ丈の人。前へ振り出すときの膝 1.4 で足を合わせると、靴が裾に当たる）
        lowest = Math.max(lowest, KN * Math.cos(th) + (SH - 0.08) * Math.cos(th + kn) + 0.11);
      }
      body.position.y = moving ? baseY + (lowest - baseY) * (run ? 0.5 : 0.8) : baseY + Math.sin(t * 2.0) * 0.008;
      for (const [arm, fore, sg] of [[parts.armL, parts.foreL, 1], [parts.armR, parts.foreR, -1]]) {
        const ar = moving ? -sg * s * armA : 0.02 * sg * Math.sin(t * 1.7); arm.rotation.x = ar;
        const fw = Math.max(0, -ar) / armA; fore.rotation.x = run ? -1.25 - 0.4 * fw : walk ? -0.2 - 0.35 * fw : -0.1;
      }
      parts.armL.rotation.z = 0.26; parts.armR.rotation.z = -0.26;
      torso.rotation.x = run ? 0.28 : walk ? 0.05 : 0; torso.rotation.y = moving ? s * (run ? 0.2 : 0.1) : 0; body.rotation.x = 0;
      head.rotation.x = run ? -0.22 : 0; head.rotation.y = moving ? -s * (run ? 0.1 : 0.05) : 0;
    }
    pose('stand', 0);
    if (CAN) { CAN.fitFoot(T, group, parts, !!opt.female); }   // 共通の決まり：靴の長さをそろえ、足の裏は足首の 0.11 下
    if (CAN) { CAN.fit(T, group, parts, String(id).replace('_canon', '')); if (KK) CAN.addSoles(T, parts, String(id).replace('_canon', '')); return { group, parts, pose }; }   // 走りで蹴り上げる人は、靴の裏を白っぽく（背を合わせたあとに足す：靴より 0.0005 下へ出るので、先に足すと全体の倍率がわずかに変わる）
    group.scale.setScalar(opt.scale || (L().buildWizard ? L().buildWizard(T, { toon: false }).group.scale.x : 0.7343));   // 大きさ・顔の位置は魔法使いに合わせる（武闘家と同じ）
    return { group, parts, pose };
  }
  L().buildFromSpec = buildFromSpec;
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildFromSpec };
})(typeof window !== 'undefined' ? window : globalThis);
