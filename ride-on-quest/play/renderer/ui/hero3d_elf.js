/* エルフ（女）の 3D（2026-10-26。主人公候補の4人の2人目。主人公としては選べない＝試練のペースメーカーで走る姿だけ）。
   形は組み立て指示（tools/lowpoly_hero/specs/elf.json → ui/hero3d_specs.js。今の NPC のドット絵 assets/npc/elf*.png の前・後ろから）。骨組み・動き・顔は ui/hero3d_spec.js（武闘家・ワルキューレと同じ）。
   持ち物の弓は、手の位置が要るのでここで足す：左手＝ +x（正面の絵の画面の右）。そのうでは弓を持つかまえで止める。
   使い方：RQ.lowpoly.buildElf(T, { toon, steps, q }) → { group, parts, pose }。前提：hero3d.js・hero3d_specs.js・hero3d_spec.js を先に読む。 */
(function (root) {
  const RQ = root.RQ = root.RQ || {};
  const L = () => RQ.lowpoly;
  const EYE = { w: 0.065, hi: 0.05, lo: 0.05, y: 0.26, top: 0x1d2a1a, bot: 0x3f8f4a, glint: 0xffffff, lash: 0x1d2a1a };   // 緑の目
  function buildElf(T, opt = {}) {
    const toon = opt.toon !== false, ST = opt.steps || 5;
    const m = L().buildFromSpec(T, 'elf', { ...opt, eye: EYE, footDrop: 0, torsoExtra: 0.08 }), { group, parts } = m;
    let grad = null;
    if (toon) { const lv = Array.from({ length: ST }, (_, i) => Math.round(95 + 160 * i / (ST - 1))); grad = new T.DataTexture(new Uint8Array(lv.flatMap(v => [v, v, v, 255])), ST, 1, T.RGBAFormat); grad.minFilter = grad.magFilter = T.NearestFilter; grad.needsUpdate = true; }
    const mat = c => toon ? new T.MeshToonMaterial({ color: new T.Color(c).multiplyScalar(0.74), gradientMap: grad }) : new T.MeshLambertMaterial({ color: c, flatShading: true });
    const hold = () => { parts.armL.rotation.set(-0.3, 0, 0.32); parts.foreL.rotation.set(-0.55, 0, 0); };   // 左うでは弓をかまえる
    const basePose = m.pose; m.pose = (mode, t, o) => { basePose(mode, t, o); hold(); };
    m.pose('stand', 0); group.updateMatrixWorld(true);
    // 弓：左手のこぶしを通る、縦の弓（弧が外＝ +x へふくらむ）。弦は体がわ。手は弓をにぎる
    { const v = new T.Vector3(0, -0.26, 0.01); parts.foreL.localToWorld(v); parts.torso.worldToLocal(v);
      const bow = new T.Group(); bow.position.copy(v); parts.torso.add(bow); parts.bow = bow;
      const R = 0.5, arc = 1.9, b = new T.Mesh(new T.TorusGeometry(R, 0.022, 6, 18, arc), mat(0x8a5a30)); b.rotation.z = -arc / 2; b.position.x = -R; bow.add(b);   // 弧の一番ふくらんだ所が手
      const h = 2 * R * Math.sin(arc / 2), str = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, h, 4), mat(0xe9dfc6)); str.position.x = -R + R * Math.cos(arc / 2); bow.add(str);   // 弦
      const grip = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.14, 8), mat(0x4d301a)); bow.add(grip); }
    return m;
  }
  // ---- canon（共通の決まり。docs/3d-canon/canon.md・parts/elf.md。見本 art_src/canon3d/user_feedback/elf_reference_20261027.jpg） ----
  // 袖・籠手・ズボン・ブーツは指示書（specs/elf_canon.json）。上着（上・帯・裾）・髪・とがった耳・フード・マント・矢筒・弓は、関節の位置から決める形なのでここで組む（武闘家と同じやり方）
  const EYEG = 0x2e9b4a, EARK = 0.85,   /* 耳の板の色＝顔の色 × EARK（光を正面から受ける板のふちが、明るい 1〜3 画素の点に出るのを抑える） */ GREEN = 0x2e5531, GREEND = 0x2d5a2a, CLOAK = 0x3b7a34, CLOAKD = 0x2c5e28, BROWN = 0x6b4424, BROWND = 0x4d301a, HAIR = 0xecd06a, HAIRD = 0xd8b850, SILVER = 0xc9ced6;
  // 正面の顔の直し（2026-10-29。docs/handoff-face.md・canon.md「正面の顔」の決まりを最初から当てる案。ユーザーの OK まではゲームに入れない＝ELF は null。比べは window.__ELFFACE・__ELFHAIR・__ELFHEAD）
  //  HAIR：k [横, 縦, 前後の倍率]（頭を包む髪 hair_helm）・cz（その中心の前後のずらし）・side（もみあげの x）・bangZ（前髪の前後のずらし）　HEAD：neck（canon.fitNeck：首の見える長さを武闘家にそろえる）
  const ELF = {   // 2026-10-29 ユーザー判断「エルフは案で、耳を長くする」（見比べ：art_src/canon3d/v6/face_elf/elf_common.png）：頭 1 倍・髪の外形は武闘家 R1（僧侶 P1 の帽子をかぶった頭の外形。減らさない）・女性の共通の顔（まつ毛 2 つ）
    FACE: {ext: 0.1},   // ext 0.10：真ん中分けで額を出す（PART）   // 女性の共通の顔（canon.FACEF）   // 武闘家と同じ女性の顔。白い点だけ共通の 0.046×0.05（武闘家だけの小さい点にしない）
    HAIR: {bob: {shell: {r: 0.2875, h: 0.285, y: 0.335, z: -0.03, front: 0.2, lo: 0.35}, tufts: [[-0.12, 0.8], [-0.06, 0.95], [0.06, 0.9], [0.12, 0.8]]}},   // canon.bobHair＋武闘家 R1 の外形（d51e0fc。武闘家の案2 で減らした分は入れない）
    PART: {c: 0.48, s: 0.41, w: 0.26, pz: 0.05, bw: 0.035, bl: 0.2, bx: 0.105, by: 0.44, bz: 0.19, ba: 1.0, fw: 0.06, fl: 0.42, fx: 0.23, fy: 0.05, fz: 0.17},   // 前髪を 2D に（2026-10-29 ユーザー判断「案2でいい」。hairstyle_elf_2.png）：真ん中分け（生え際を真ん中 c・脇 s の山形に上げる。幅 w）・分け目から外へ流れる房（b*）・顔の両横の長い髪（f*。胸の上まで）。前の 4 本の前髪の房は外す
    EAR: {k: 1.3, w: 1.3} };   // 2026-10-29 ユーザー「耳が長すぎ。少し短くして」：先までの長さ 1.5→1.3 倍   // k：耳の先までの長さの倍率（R1 の髪が横に張り出し、元の長さでは付け根が隠れて短く見えた）。w：付け根の幅の倍率（2026-10-29 ユーザー「エルフの耳は、幅を少し広げて」。0.131→0.170）
  const E3 = k => (typeof window !== 'undefined' && window['__ELF' + k]) || (ELF && ELF[k]) || null;
  function buildCanon(T, opt) {
    const FACE = L().canon.face(L().canon.FACEF, E3('FACE')), HR = E3('HAIR') || {}, HD0 = E3('HEAD');
    const m = L().buildFromSpec(T, 'elf_canon', { ...opt, female: true, eyeColor: EYEG, runBack: 0.6, footKickOnly: true, face: FACE || undefined });   // runBack：マントが戦士と同じ丈なので、走りで後ろへ出す上限も戦士と同じ   // 目は緑（2026-10-27 ユーザー判断：見本どおり）。大きさ・白い点は共通の女性の目のまま
    const { group, parts: P } = m, Q = opt.q || 1, C = L().canon.C;
    const CO = (typeof window !== 'undefined' && window.__ELFCAPE) || {};   // マントの案の比べ用（'A' 体に沿うマント・'B' 短いケープ・'C' なし。ゲームでは未設定＝A）
    const CAPE = CO.kind || 'A';
    let proto = null; P.torso.traverse(o => { if (!proto && o.isMesh) proto = o.material; });
    const toon = proto.isMeshToonMaterial;
    const mat = (c, side) => { const k = proto.clone(); k.color = new T.Color(c).multiplyScalar(toon ? 0.74 : 1); if (side) k.side = T.DoubleSide; return k; };
    const put = (geo, c, x, y, z, par, name, side) => { const o = new T.Mesh(geo, mat(c, side)); o.position.set(x, y, z); if (name) { o.name = name; P[name] = o; } par.add(o); return o; };
    // 共通の素肌の胴は、上着が全部おおうので外す（武闘家と同じ）
    // 形で見分ける（色は SKINK で少し明るくしてあり、顔の色と一致しない＝前は外れていなかった）：胴の直下の円柱で、上の半径 0.22・下 0.15
    for (const o of [...P.torso.children]) if (o.isMesh && o.geometry.type === 'CylinderGeometry' && Math.abs(o.geometry.parameters.radiusTop - 0.22) < 1e-6 && Math.abs(o.geometry.parameters.radiusBottom - 0.15) < 1e-6) P.torso.remove(o);
    group.updateMatrixWorld(true);
    const inTorso = o => P.torso.worldToLocal(o.getWorldPosition(new T.Vector3()));
    const yE = (inTorso(P.foreL).y + inTorso(P.foreR).y) / 2, yH = (inTorso(P.handL).y + inTorso(P.handR).y) / 2, yS = P.armL.position.y, yB = yE, yN = yS;
    // 上着（帯〜肩）：武闘家と同じ形（胸が背中より少し前へ。腰は細く、肩へ広がる）
    const WX = 1.12, WZ = 0.74, rW = 0.19, rS = 0.235;
    // 肩の上は、首の穴のあいた襟ぐり（2026-10-27 ユーザー指摘「前から見ると首がない」・canon「首の見え方」：正面で首の肌 2 行・8 画素以上）。
    // 外がわ（肩の線）は肩の関節の高さのまま、首のまわりだけ低い（NL：襟ぐりの深さ）
    const NL = 0.0;
    { const h = yN - NL - yB; put(new T.CylinderGeometry(rS, rW, h, Math.round(16 * Q)), GREEN, 0, yB + h / 2, 0.01, P.torso, 'tunic_top').scale.set(WX, 1, WZ);
      put(new T.SphereGeometry(0.16, Math.round(12 * Q), Math.round(8 * Q)), GREEN, 0, yS - 0.12 - NL, 0.05, P.torso, 'tunic_chest').scale.set(1.25, 0.75, 0.8);
      const pr = [[0.095, yN - NL - 0.005], [0.12, yN - 0.03], [0.17, yN - 0.008], [0.215, yN - 0.006], [rS, yN - 0.02], [rS, yN - NL - 0.01]].map(([r, y]) => new T.Vector2(r, y));
      put(new T.LatheGeometry(pr, Math.round(16 * Q)), GREEN, 0, 0, 0.01, P.torso, 'tunic_shoulder', true).scale.set(WX, 1, WZ); }
    // 帯（茶色の革）と銀のバックル
    put(new T.CylinderGeometry(rW + 0.016, rW + 0.02, 0.06, Math.round(16 * Q)), BROWN, 0, yB, 0.01, P.torso, 'belt').scale.set(WX, 1, WZ);
    put(new T.BoxGeometry(0.06, 0.05, 0.025), SILVER, 0, yB, (rW + 0.02) * WZ + 0.018, P.torso, 'buckle');
    // 肩からのたすき（右肩 → 左の腰。胸の面に沿わせる）
    { const rc = new T.Raycaster(), body = [P.tunic_top, P.tunic_chest]; group.updateMatrixWorld(true);
      const front = (x, y) => { const o = P.torso.localToWorld(new T.Vector3(x, y, 1)), d = P.torso.localToWorld(new T.Vector3(x, y, 0)).sub(o).normalize(); rc.set(o, d); const h = rc.intersectObjects(body)[0]; return h ? P.torso.worldToLocal(h.point.clone()).z : 0.15; };
      const a = [-0.2, yN - 0.02], b = [0.17, yB + 0.035], N = 6;
      for (let i = 0; i < N; i++) { const t0 = i / N, t1 = (i + 1) / N, p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        const z0 = front(...p0) + 0.008, z1 = front(...p1) + 0.008, len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], z1 - z0);
        const s = put(new T.BoxGeometry(0.045, len + 0.01, 0.015), BROWN, (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (z0 + z1) / 2, P.torso, 'strap');
        s.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(p1[0] - p0[0], p1[1] - p0[1], z1 - z0).normalize()); } }
    // 上着の裾（帯の下〜拳）：前と後ろの 2 枚（武闘家・ワルキューレと同じ作り。canon.md 手順 5）
    const top = yB - 0.03, len = Math.max(0.2, top - (yH - 0.02)), r0 = 0.225, r1 = 0.275;
    const prof = k => { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new T.Vector2((r0 + (r1 - r0) * Math.sin(Math.min(1, t / 0.55) * Math.PI / 2)) * k, -len * t)); } return pts; };
    const SEG = Math.round(24 * Q), OV = 0.3, cloth = [];
    const round = (g, ph0) => { const pa = g.attributes.position, c = ph0 + Math.PI / 2 + OV, half = Math.PI / 2 + OV, W = 0.4, LIFT = 0.06;
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), y = pa.getY(i); let d = Math.atan2(x, z) - c; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); const e = Math.max(0, Math.min(1, (d - (half - W)) / W)); pa.setY(i, y + LIFT * e * e * Math.min(1, -y / len)); }
      g.computeVertexNormals(); return g; };
    for (const [n, k] of [['F', 1], ['B', 0.985]]) {
      const ph0 = (n === 'F' ? -Math.PI / 2 : Math.PI / 2) - OV, sg = n === 'F' ? 1 : -1;
      const pv = new T.Group(); pv.position.set(0, top, 0.01); pv.scale.set(WX, 1, WZ * 1.05); P.torso.add(pv); P['skirt' + n] = pv;
      for (const [g, c, nm] of [[new T.LatheGeometry(prof(k).reverse(), SEG, ph0, Math.PI + 2 * OV), GREEN, 'tunic_skirt'], [new T.LatheGeometry([new T.Vector2(r1 * k + 0.008, -len - 0.003), new T.Vector2(r1 * k + 0.006, -len + 0.03)], SEG, ph0, Math.PI + 2 * OV), GREEND, 'tunic_hem']]) {
        const o = put(round(g, ph0), c, 0, 0, 0, pv, nm, true), pa = o.geometry.attributes.position, w = new Float32Array(pa.count);
        for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i); w[i] = Math.pow(Math.max(0, sg * z / Math.hypot(x, z)), 0.8); }
        cloth.push({ n, g: o.geometry, p0: Float32Array.from(pa.array), w });
      } }
    const bend = (F, B) => { for (const c of cloth) { const th = c.n === 'F' ? F : B; if (c.th === th) continue; c.th = th; const pa = c.g.attributes.position, a = pa.array, p0 = c.p0;
      for (let i = 0; i < pa.count; i++) { const q = th * c.w[i], cs = Math.cos(q), sn = Math.sin(q), y = p0[i * 3 + 1], z = p0[i * 3 + 2]; a[i * 3 + 1] = y * cs - z * sn; a[i * 3 + 2] = y * sn + z * cs; }
      pa.needsUpdate = true; c.g.computeVertexNormals(); c.g.computeBoundingSphere(); } };
    // 髪：金のまっすぐな髪。ヘルメットのように頭を包む 1 つの丸い面（2026-10-27 ユーザー指摘「元絵に比べて頭が平ら。ヘルメットのつもりで髪を足して」）。
    // 頭のてっぺんを高く丸く・顔の箱の上の角をおおい、横は顔の幅より外にふくらんで、耳より後ろでは あごの高さまで下りる（正面から顔の両わきに髪が見える）。
    // 下の縁：前（ひたい）は顔の上の端（目にかけない）、耳の位置から後ろは あごの高さ、うしろは首の上。顔の前の面より前へ出さない。地肌を出さない
    const hp = P.head;
    // （この直しは共通の buildHead に移した。2026-10-29）共通の首の円柱（buildHead）の上の端を、顔の箱の中まで 0.04 のばす（上のふたと顔の箱の下面が重なり、あごの下に明るい点が出ていた。ワルキューレと同じ直し）
    if (HR.bob) {   // 武闘家 M6a と共通の作り（2026-10-29 ユーザー判断「帽子がないので武闘家と共通の作りにするのが正解」）：頭の髪・前髪の房・横髪・うなじは canon.bobHair と武闘家と同じ数（canon.BOB）。違うのは色・尖った耳・長い髪・マントの側
      L().canon.bobHair(T, hp, { HF: { ...L().canon.BOB, ...(HR.bob === true ? {} : HR.bob) }, HAIR, put, Q });  const E2 = E3('PART'); if (E2) {   // 真ん中分け・額・前髪の房・顔の両横の長い髪（PART）
        const v = new T.Vector3(), Lp = (x, z) => z > E2.pz ? E2.s + (E2.c - E2.s) * Math.max(0, 1 - Math.abs(x) / E2.w) : null;
        for (const m of hp.children.slice()) { if (!m.isMesh) continue;
          if (m.name === 'hair_bang' || m.name === 'hair_bangs') { hp.remove(m); continue; }
          if (m.name === 'hair_crown' || m.name === 'hair_back') { m.updateMatrix(); const pa = m.geometry.attributes.position, M = m.matrix, Mi = new T.Matrix4().copy(M).invert();
            for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(M); const L2 = Lp(v.x, v.z); if (L2 != null && v.y < L2) { v.y = L2; v.applyMatrix4(Mi); pa.setXYZ(i, v.x, v.y, v.z); } } m.geometry.computeVertexNormals(); } }
        for (const sx of [-1, 1]) {
          const b = put(new T.CylinderGeometry(E2.bw, E2.bw * 0.6, E2.bl, Math.round(8 * Q)), HAIR, sx * E2.bx, E2.by, E2.bz, hp, 'hair_bang2'); b.rotation.z = sx * E2.ba; b.scale.set(1, 1, 0.45);   // 分け目から外・下へ流れる前髪の房
          const f = put(new T.CylinderGeometry(E2.fw, E2.fw * 0.8, E2.fl, Math.round(10 * Q)), HAIR, sx * E2.fx, E2.fy, E2.fz, hp, 'hair_front'); f.scale.set(1, 1, 0.55); }   // 顔の両横の長い髪
      } }
    else
    { const HK = HR.k || [1, 1, 1], HX = 0.29 * HK[0], HY = 0.345 * HK[1], HZ = 0.255 * HK[2], HCY = 0.27, HCZ = -0.065 + (HR.cz || 0)   /* てっぺん：顔の上端から 0.82 H（武闘家のお団子のてっぺんと同じ。2026-10-27 ユーザー「武闘家に比べると、まだ頭の上が平ら」） */, sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      const g = new T.SphereGeometry(1, Math.round(28 * Q), Math.round(18 * Q)), pa = g.attributes.position;
      if (HR.dome) L().canon.dome(1, HR.dome).geo(g);   // dome：武闘家 M6a と同じ頭蓋骨の形（共通の canon.dome。横は赤道の太さのまま立ち上げ、上は丸い）
      const ZF = HR.front != null ? HR.front : null, FY0 = 0.42, FY1 = 0.52;   // front：前髪の前の面の z（顔の前の面にそろえる。横から見て額より奥にへこまない）。FY0 の高さまでそろえ、FY1 までになだらかに元の丸みへ
      for (let i = 0; i < pa.count; i++) { const yn = pa.getY(i), x = pa.getX(i) * HX; let z = pa.getZ(i) * HZ + HCZ, y = (HR.dome ? yn : yn > 0 ? Math.pow(yn, 0.75) : yn) * HY + HCY;   // 上半分は少しふくらませる（てっぺんがとがらず、丸い）。dome のときは dome の形のまま
        if (ZF != null && z > HCZ) { const zf = HCZ + (ZF - HCZ) * Math.sqrt(Math.max(0, 1 - (x / HX) ** 2)), wv = (1 - sm((y - FY0) / (FY1 - FY0))) * sm((y - 0.3) / 0.05); if (zf > z) z += (zf - z) * wv; }
        const ymin = 0.0 + 0.03 * sm((z + 0.2) / 0.12) + 0.33 * sm((z + 0.005) / 0.05);   // うしろ 0（首の上）→ 耳の後ろ 0.03（あごの下の角まで）→ 耳より前 0.36（ひたい＝顔の上の端）
        if (y < ymin) y = ymin; pa.setXYZ(i, x, y, z); }
      g.computeVertexNormals(); put(g, HAIR, 0, 0, 0, hp, 'hair_helm', true);
      for (const sx of [-1, 1]) put(new T.BoxGeometry(0.055, 0.32, 0.1), HAIR, sx * (HR.side || 0.218), 0.2, 0.03, hp, 'hair_side');   // もみあげ：耳の前（z 0〜0.08）。斜め後ろから頬のふちを隠す（2026-10-27 窓口）。顔の前の面より後ろ
      put(new T.SphereGeometry(0.2, Math.round(12 * Q), Math.round(8 * Q)), HAIRD, 0, 0.0, -0.19, hp, 'hair_nape').scale.set(0.55, 1.05, 0.7);   // 首のうしろをおおう（正面の首は見える）
      // 前髪：まん中で分けて、こめかみへ流れる 2 房（顔の前の面より前へ出さない・目にかけない）
      for (const sx of [-1, 1]) { const b = put(new T.BoxGeometry(0.17, 0.05, 0.05), HAIR, sx * 0.09, 0.365, 0.16 + (HR.bangZ || 0), hp, 'hair_bang'); b.rotation.z = -sx * 0.32; b.rotation.x = 0.15; }
    }
    {   // とがった耳：共通の耳（球）から、外・上・少し後ろへ（ふくらんだ髪の外へ出る）
      for (const sx of [-1, 1]) {   // とがった耳：平たい三角の板（厚み 0.03）。外・後ろ・上へ大きくとがる（2026-10-27 レビュー「横では髪の中の線 1 本、斜め後ろでは 1〜2 画素。見本はどの向きでも大きな耳」）。面は外・前を向き、正面・横・後ろから三角に見える
        const sh = new T.Shape(); const EA = E3('EAR') || {}, EK = EA.k || 1, EW = EA.w || 1, bx = 0.01, by = 0.005; sh.moveTo(bx + (0 - bx) * EW, by + (-0.06 - by) * EW); sh.lineTo(0.38 * EK, 0.16 * EK); sh.lineTo(bx + (0.02 - bx) * EW, by + (0.07 - by) * EW);   /* EW：付け根の幅（2 つの付け根の点を、その真ん中から広げる。長さは EK のまま） */ sh.closePath();
        const g = new T.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }); g.translate(0, 0, -0.015);
        const e = put(g, new T.Color(L().COL.face).multiplyScalar(EARK).getHex(), sx * 0.2, 0.2, -0.02, hp, 'ear_tip'); e.rotation.y = sx > 0 ? 1.15 : Math.PI - 1.15; if (FACE && FACE.FW) e.position.x = sx * (FACE.FW / 2); } }   // 顔の幅を変えたら、共通の耳（FW/2＋0.005）に合わせて寄せる（元は 0.4/2）
    // フード（首のうしろに下ろした、肩の上の布の輪）
    if (CAPE !== 'none') { const hd = put(new T.TorusGeometry(0.15, 0.05, Math.round(6 * Q), Math.round(16 * Q), Math.PI * 1.3).rotateZ(Math.PI * 0.85), CLOAK, 0, yN + 0.05, -0.035, P.torso, 'hood_ring'); hd.rotation.x = Math.PI / 2; hd.scale.set(1.3, 1.0, 1.0);   // 前は開ける（正面の首が見える。canon §1-5）
      put(new T.SphereGeometry(0.13, Math.round(10 * Q), Math.round(8 * Q)), CLOAKD, 0, yN + 0.02, -0.19, P.torso, 'hood').scale.set(1.45, 0.75, 0.6); }
    if (HD0 && HD0.down) P.head.position.y -= HD0.down; if (!HD0 || HD0.neck !== false) L().canon.fitNeck(T, group, P, 0.1);   /* 0.1：下げ幅の上限（既定 0.05 では 0.060 までしか縮まなかった）。2026-10-29：顔の直し（ELF）の有無にかかわらず、首の見える長さを共通の C.NECKV にそろえる（案C で肩の関節を下げて 0.084→0.100 に長くなった） */   // 首の見える長さを武闘家にそろえる（共通の決まり。背は合わせ直さない）
    // マント：戦士と同じ設計（hero3d_canon.js の capeSheet・capeLikeWarrior。2026-10-28 ユーザー判断「マントについても戦士に合わせる（共通の設計）」）：幅・丈（膝の少し下）・ひだ・脚のよけ方は戦士と同じ。
    // 試走 No.30（後ろから寸胴に見えるので魔法使いくらいまで長く）は、この判断で上書き（丈は戦士と同じ）。色（服より濃い緑、ひだの谷と裾はさらに濃い緑）・フードはそのまま
    let sheet = null;
    if (CAPE === 'A' || CAPE === 'B') {
      const cL = new T.Color(CLOAK), cD = new T.Color(CLOAKD), W = L().canon.capeLikeWarrior(T, P);
      sheet = L().canon.capeSheet(T, P.torso, { ...W, ...(CAPE === 'B' ? { Y1: yB - 0.08 } : {}),
        col: (ft, fv, c) => ft > 0.955 ? c.copy(cD) : c.copy(cL).lerp(cD, 0.8 * Math.min(1, ft * 2 + 0.2) * (1 - fv) / 2), mat: (() => { const k = mat(0xffffff); k.vertexColors = true; return k; })(), matIn: mat(CLOAKD) });
      sheet.inner.material.side = T.BackSide; sheet.mesh.name = 'cloak'; P.cloak = sheet.mesh; P.cloakG = sheet.mesh;   // 名前 cloak：check_overlap.js がマント（おおい）として数える
    }
    // うしろの長い髪（背中の中ほどまで。2026-10-27 窓口「見本どおり長い髪に。魔法使い・ワルキューレと同じく背中へ下ろす」）：7 本の房を胴に付け、マント・フードの外を下ろす。上の端は頭の髪の中（つなぎ目は見えない）。下の端はなだらかな弧（まん中が長い）。
    // 2026-10-28 ユーザー判断（マントを戦士と同じ設計にしたあと、髪がマント・フードを抜けていた）：短くせず、長さはそのまま。房は魔法使いと同じ曲げられる筒（hero3d_canon.js の hairStrand）にして、
    // 毎コマ、マントとフードの面の外（すき間 0.012）に沿わせる（layStrand。いったん外へ出たら、その下はまっすぐ垂れる）。走りでは毛先ほど後ろへなびく（魔法使いと同じ A·(s/l)^1.6）
    const strands = [], HD = 0.026, GAP = 0.012, NS = 24;
    { const zc = (x, rr) => -(0.23 * Math.sqrt(Math.max(0, 1 - (x / 0.29) ** 2)) + rr);
      [-0.18, -0.12, -0.06, 0, 0.06, 0.12, 0.18].forEach((x, n) => { const k = (x / 0.18) ** 2, yTop = yN + 0.14, yBot = yB + 0.13 + 0.06 * k; let l = yTop - yBot;
        const pv = new T.Group(); pv.position.set(x, yTop, zc(x, 0.045)); P.torso.add(pv);
        const BR = [0.22, 0.075, 0.035, 0.08], br = x === 0; if (!br) l = l * BR[0];   // 三つ編み（2026-11-03 ユーザー判断「案b三つ編み」）：真ん中の房 1 本を三つ編み（太さ BR[1]・BR[2]、編み目の間隔 BR[3]）、外側の房は頭のうしろだけに短く（長さ BR[0] 倍）
        const m = L().canon.hairStrand(T, mat(k > 0.9 ? HAIRD : HAIR), br ? BR[1] : 0.048, br ? BR[2] : 0.03, l, 10, br ? 0.75 : HD / 0.048); m.name = 'hair_long'; pv.add(m); P.hair_long = m;
        if (br) { const u = m.userData.strand, P0 = BR[3]; for (const g of [u.g0, u.g]) { const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) { const y = pa.getY(i), ph = (-y / P0) * Math.PI, f = 1 + 0.22 * Math.abs(Math.sin(ph)); pa.setX(i, pa.getX(i) * f + 0.012 * Math.sign(Math.sin(ph)) * (-y > 0.03 ? 1 : 0)); pa.setZ(i, pa.getZ(i) * f); } pa.needsUpdate = true; g.computeVertexNormals(); } u.rest = Float32Array.from(u.g.attributes.position.array); }   // 編み目：丈に沿ってふくらみを交互に
        strands.push({ m, pv, x, l, ph: n * 0.9, cz: new Float64Array(NS + 1) }); }); }
    const hoodPts = []; group.updateMatrixWorld(true);
    for (const o of [P.hood, P.hood_ring]) if (o) { const pa = o.geometry.attributes.position, v = new T.Vector3(); for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); o.localToWorld(v); P.torso.worldToLocal(v); hoodPts.push(v.x, v.y, v.z); } }   // フード（胴に付いていて動かない）
    const layHair = (mode, t) => {   // マント・フードの面より外へ（面の点のうち、房の近く ±0.05 の最も後ろの z から、房の厚み＋すき間だけ外）
      const cp = sheet ? sheet.pos : null, run = mode === 'run', ph = t * Math.PI * 2 * 1.55;
      const laySt = (extra) => { for (const st of strands) { const { pv, x, l, cz } = st; let lim = Infinity;
        const A = run ? 0.5 * (1 + 0.2 * Math.sin(ph * 2 + st.ph)) : 0; let zw = 0;
        for (let i = 0; i <= NS; i++) { const s = l * i / NS, y = pv.position.y - s, z0 = pv.position.z; let surf = Infinity;
          const near = (arr) => { for (let k = 0; k < arr.length; k += 3) if (Math.abs(arr[k] - x) < 0.05 && Math.abs(arr[k + 1] - y) < 0.06 && arr[k + 2] < surf) surf = arr[k + 2]; };
          if (cp) near(cp); near(hoodPts); if (extra) near(extra);
          if (surf < Infinity) lim = Math.min(lim, surf - HD - GAP - z0);   // いったん外へ出たら、その下はまっすぐ垂れる（いちばん外の値を持ち越す）
          if (i > 0) zw -= Math.sin(A * Math.pow((i - 0.5) / NS, 1.6)) * l / NS;   // 走りのなびき（毛先ほど後ろへ）
          cz[i] = Math.min(0, zw, lim); }
        L().canon.layStrand(st.m, cz); } }; laySt(null);
      // 矢筒：マントの背中に寄せる（2026-11-03 ユーザー判断）。傾きを -0.4〜0.8 で振り、軸の点（肩より上は除く）とマントの面のすき間がいちばんそろう傾きで、厚み hz＋すき間 0.012 の所まで寄せて SK 沈める。そのあと髪の房を矢筒のうしろの面の外へ並べ直す（髪が矢筒の上にかかる）
      const qv = P.quiver; if (!qv) return; qv.position.z = qv.userData.z0; group.updateMatrixWorld(true);
      const pts = [], v = new T.Vector3();   // 寄せる相手はマントの面だけ（髪は見ない。髪はあとで矢筒の外へ並べ直す）
      if (cp) for (let k = 0; k < cp.length; k++) pts.push(cp[k]);
      const SK = 0.02;
      if (qv.userData.rx0 == null) qv.userData.rx0 = qv.rotation.x;
      const need = () => { group.updateMatrixWorld(true); const ds = []; for (let q = -2; q <= 2; q += 0.5) { v.set(0, q * 0.13, 0); qv.localToWorld(v); P.torso.worldToLocal(v); if (v.y > yS - 0.06) continue; let surf = Infinity;   /* 肩より上（空中）の点は寄せる相手にしない */
          for (let k = 0; k < pts.length; k += 3) if (Math.abs(pts[k] - v.x) < 0.08 && Math.abs(pts[k + 1] - v.y) < 0.08 && pts[k + 2] < surf) surf = pts[k + 2];
          if (surf < Infinity) ds.push(surf - qv.userData.hz - 0.012 - v.z); } return ds; };
      { let best = null; for (let a = -0.4; a <= 0.801; a += 0.05) { qv.rotation.x = qv.userData.rx0 + a; qv.position.z = qv.userData.z0; const ds = need(); if (ds.length < 3) continue; const m = Math.min(...ds), gap = ds.reduce((t, d) => t + d - m, 0) + 0.02 * Math.abs(a); if (!best || gap < best.gap) best = { a, m, gap }; }
        qv.rotation.x = qv.userData.rx0 + (best ? best.a : 0); qv.position.z = qv.userData.z0 + (best ? best.m + SK : 0); }   // 2026-11-03 ユーザー判断「矢筒を体に密着させて」：傾きを振って、マントの背中の線にいちばん沿う傾きで寄せ、SK だけ沈める
      { group.updateMatrixWorld(true); const qp = [], w = new T.Vector3(); for (let yy = -0.3; yy <= 0.3001; yy += 0.03) for (const xx of [-0.07, -0.035, 0, 0.035, 0.07]) { w.set(xx, yy, -qv.userData.hz); qv.localToWorld(w); P.torso.worldToLocal(w); qp.push(w.x, w.y, w.z); } laySt(qp); } };   // 2026-11-03 ユーザー判断「外側に髪の毛が来るのが普通では？」：矢筒はマントの面に寄せ（髪は見ない・前へも寄せる）、そのあと髪の房を矢筒のうしろの面の外へ並べ直す（髪が矢筒の上にかかる）
    // 矢筒（背中。右肩から左の腰へ斜め。矢の羽根が右肩の上に出る）：マントの外がわ
    { const zb = sheet ? sheet.rzAt(yS - 0.26) + 0.01 : rS * WZ, qv = new T.Group(); const QP = [-0.08, -0.08, 0.5];   /* x・肩からの高さ・傾き（口は右肩の上） */ qv.position.set(QP[0], yS + QP[1], -(zb + 0.135)); qv.rotation.z = QP[2]; qv.rotation.x = -0.12; P.torso.add(qv); P.quiver = qv; qv.userData.z0 = qv.position.z; const QF = 0.55; qv.userData.hz = 0.075 * QF;   /* 2026-11-03 ユーザー判断「円柱では無く、厚みを減らすともっと自然」：前後の厚みを QF 倍の平たい筒 */   // 長い髪の外がわ。上の口は右肩の外（頭の横）：斜め後ろから矢羽根が頭に重ならない（2026-10-27 レビュー）
      put(new T.CylinderGeometry(0.075, 0.065, 0.56, Math.round(10 * Q)).scale(1, 1, QF), BROWN, 0, 0, 0, qv, 'quiver_body');
      for (const y of [0.24, -0.22]) put(new T.CylinderGeometry(0.081, 0.081, 0.04, Math.round(10 * Q)).scale(1, 1, Math.min(1, (0.075 * QF + 0.006) / 0.081)), BROWND, 0, y, 0, qv, 'quiver_band');
      for (const [x, z, h] of [[-0.03, 0.015, 0.16], [0.025, -0.015, 0.18], [0.0, 0.03, 0.14]]) { put(new T.CylinderGeometry(0.014, 0.014, h, 5), 0x8a5a30, x, 0.28 + h / 2, z * QF, qv, 'arrow');
        put(new T.BoxGeometry(0.06, 0.08, 0.03), 0xdcd6c8, x, 0.28 + h - 0.03, z * QF, qv, 'fletch'); } }   // 矢羽根は太く（細いと 128 ドットで形が毎コマ変わってちらつく）
    // 弓（左手）：2026-10-27 試走の指摘（No.29）「弧を進む向きに向けるのではなく、下に向けて、手を下ろして持って歩く形に」。
    // 左うでは下ろして止め（腕を振らない）、手で弓の真ん中をにぎる。弓は前後に寝かせ（弦の向き＝進む向き）、弧のふくらみは下、弦は上。前の先を少し下げ（BOWTILT）、少し外へ向ける（BOWOUT）。
    const bow = new T.Group(); P.bow = bow; P.bowCarry = true; const BOWTILT = 0.15, BOWOUT = 0.35, HANG = { z: L().canon.C.GRIPARMZ, fore: -0.12 };   /* z：弓を持つ腕の開きは、武器を持つ腕の共通の 0.26（2026-10-29 ユーザー判断） */
    { const bi = new T.Group(); bow.add(bi);
      bi.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0, -1, 0), new T.Vector3(0, 0, 1), new T.Vector3(-1, 0, 0)));   // 中の +x（ふくらむ向き）→ 下、中の +y（弦の向き）→ 前
      const Rb = 1.5, chord = 1.12, arc = 2 * Math.asin(chord / 2 / Rb), b = put(new T.TorusGeometry(Rb, 0.022, 5, Math.round(20 * Q), arc), 0x8a5a30, -Rb, 0, 0, bi, 'bow_limb'); b.rotation.z = -arc / 2;
      const sag = Rb * (1 - Math.cos(arc / 2)); put(new T.CylinderGeometry(0.013, 0.013, chord, 4), 0xd8ccb0, -sag, 0, 0, bi, 'bow_string');   // 弦は 1 画素より太く（細いと、うしろからコマごとに灰・消える・黄とちらつく）
      put(new T.CylinderGeometry(0.034, 0.034, 0.13, 8), BROWND, 0, 0, 0, bi, 'bow_grip');
      for (const s of [-1, 1]) put(new T.SphereGeometry(0.03, 6, 4), BROWND, -sag, s * chord / 2, 0, bi, 'bow_tip'); }
    bow.position.set(0, C.HANDY, 0.01); P.foreL.add(bow);
    const qt = new T.Quaternion(), qf = new T.Quaternion(), qx = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), BOWOUT).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), BOWTILT));   // 前の先を少し外へ（BOWOUT。真前後だと正面・後ろから弓が点になる）
    const grip = () => {   // 腕を下ろして止める。弓の向きは胴に合わせる（前腕の傾きは受けない）
      P.armL.rotation.set(0, 0, HANG.z); P.foreL.rotation.set(HANG.fore, 0, 0); group.updateMatrixWorld(true);
      P.torso.getWorldQuaternion(qt); P.foreL.getWorldQuaternion(qf); bow.quaternion.copy(qf.invert()).multiply(qt).multiply(qx); };
    // 動き：骨組みの動きのあと、上着の裾を ももに合わせ、マントの下を いちばん後ろの脚に合わせて持ち上げる
    const pose0 = m.pose, KF = 0.8, KB = 0.75, v = new T.Vector3();   // canon.md 手順 5 の前 0.8・後ろ 0.75
    const bowTips = []; P.bow.traverse(o => { if (o.isMesh && o.name === 'bow_tip') bowTips.push(o); });
    const tunB = P.skirtB && P.skirtB.children.find(o => o.name === 'tunic_skirt'), tunIdx = []; if (tunB) { const pa = tunB.geometry.attributes.position; for (let i = 0; i < pa.count; i += 3) tunIdx.push(i); }
    const capeDeform = (mode, t) => {   // マント：脚・腕・弓・上着の後ろの裾を押し出す（戦士と同じ）
      if (!sheet) return; group.updateMatrixWorld(true);
      const { caps, Pt } = L().canon.capeLimbs(T, P, { thigh: 0.115, shin: 0.13, foot: 0.09, arm: 0.1, fore: 0.09, footPad: 0.03 });   // 戦士の太さを女性の細さに
      for (const sx of [-1, 1]) caps.push([[sx * 0.27, yS - 0.075, 0], [sx * 0.3, yS - 0.03, 0], 0.126]);   // 肩（戦士の肩の押し出しを 0.9 倍。上着の肩の丸みがマントの上から出ない）
      if (bowTips.length === 2) caps.push([Pt(bowTips[0], 0, 0, 0), Pt(bowTips[1], 0, 0, 0), 0.05]);   // 弓（左手。脇に下ろして持つ）
      if (tunB) { const pa = tunB.geometry.attributes.position; for (const i of tunIdx) { const p = Pt(tunB, pa.getX(i), pa.getY(i), pa.getZ(i)); caps.push([p, p, 0.035]); } }   // 上着の後ろの裾（脚に合わせて持ち上がる）
      sheet.deform(mode, t, caps); };
    m.pose = (mode, t, o) => {
      pose0(mode, t, o); grip();
      const tr = P.torso.rotation.x, a = P.legL.rotation.x - tr, b = P.legR.rotation.x - tr;
      bend(Math.min(0, a, b) * KF, Math.max(0, a, b) * KB); capeDeform(mode, t); layHair(mode, t);
    };
    L().canon.fitTorsoTop(T, P, 0.39);   /* 胴の上の端を肩の関節に（canon.fitTorsoTop。2026-10-29 ユーザー「全員、胴の上の端を肩の関節（0.44）に合わせる」）。TOP：今の胴の上の端 */
    L().canon.femaleHead(T, group, P, m.pose, 0, 1);   // 1：頭は 1 倍（2026-10-29 ユーザー判断。女性の頭は男性と同じ）   // 0：縮めて首をそろえるだけで正面の首 12 ドット・2 行（武闘家と同じ）。0.015 以上下げると Rneck を割る   // 女性の頭（共通。C.FHEAD 0.83 倍・首を C.NECKV にそろえて C.FNECKD 下げる。2026-10-29 ユーザー判断）
    if (CO.hide) group.traverse(o => { if (CO.hide.includes(o.name)) o.visible = false; });   // 確かめ用（__ELFCAPE.hide：名前の部品を隠して、どの部品の画素か見る）
    m.pose('stand', 0);
    return m;
  }

  L().buildElf = (T, opt = {}) => opt.canon ? buildCanon(T, opt) : buildElf(T, opt);
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildElf: L().buildElf };
})(typeof window !== 'undefined' ? window : globalThis);
