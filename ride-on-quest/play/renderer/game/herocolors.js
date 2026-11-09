/* 主人公の色違い（2026-10-28 ユーザー指示「主人公 8 人の色違いを作ってゴーストとして走らせる」）。
   旅人・ゴーストは主人公 8 人の 3D で走るので、主人公と同じ色の人が何人も走ると、自分や同じ職業の人と見分けがつかない。そこで、1 人 3 色の色違いを作る。
   色違い 0 は元の色（canon）。1〜3 は、服・マント・髪など目立つ所の色だけを替える（肌・顔・目・形は変えない）。
   VARIANTS[職業][n−1] は [元の色, 替える色, 範囲] の並び。範囲 'm'＝部品の色だけ・'v'＝頂点の色（マント・ローブの曲面）だけ・無し＝両方。
   色の当て方は ui/hero3d.js の recolor（部品の色・頂点の色・自分で光る色を、どの明るさでも「いちばん近い元の色」に合わせて替える。影の段・光の強さで暗くしてあっても同じ色として当たる）。
   KEEP と各職業の keep は、替えない色（肌・顔・目・口・靴など。似た色の服に引っぱられないよう、近い色として先に当てる）。
   pick(g)：走る人（view3d.js の updateGhosts に渡す 1 人ぶん）の色違い。自分の主人公（プレイヤー）は元の色のまま（ここを通さない）。
     旅人・ゴースト（自分の記録 G1・共有 G3）・レースの相手・試練のペースメーカーは、名前と職業から 1〜3（同じ名前・同じ職業の人はいつも同じ色）。
   サーバーに送る情報は増やさない（名前と職業は今も送っている）。純粋（画面に触らない。node のテスト tests/herocolors.test.js）。 */
(function (root) {
  const N = 3;   // 1 人の色違いの数（元の色を除く）
  // 替えない色（どの職業も）：顔・首・肌・鼻・口・耳・目・白目・歯・まつげ
  const KEEP = [0xffc49b, 0xffc99f, 0xf2b189, 0xf1b089, 0xe9b48a, 0xe3a08c, 0xd8584c, 0xd7574c, 0x9a594a, 0x241812, 0xffffff, 0xe8e0c7, 0xcdb88e, 0x151515, 0x444444, 0x1a1216, 0x2a1a14, 0x1d2a1a];
  const P = {
    // 戦士：赤い服（red・redD）・青いマント（blue・blueD）・茶色の髪。金のふち・ズボン・長靴・兜は替えない
    warrior: {
      keep: [0x5d4a38, 0x6b4424, 0x4d301a, 0x3d2a18, 0xe2b341, 0x6f7a86, 0x9aa8b2, 0x4e5964, 0xc9ced8, 0x8e95a3, 0x835637, 0x5f3428, 0xb8c4cc, 0x4e2e25],   // 0x835637 からうしろ：2D に寄せたズボン・帯・銀の輪と留め具・すその合わせ目（2026-11-02）
      v: [
        [[0xc23b30, 0x2f8a3c], [0x9a2c25, 0x226a2d], [0x2e5fb4, 0x8a5a2e], [0x234a8e, 0x5e3a1c], [0x6a3f20, 0x2a2730]],   // 1：緑の服・茶色のマント・黒い髪
        [[0xc23b30, 0x3460c4], [0x9a2c25, 0x24489a], [0x2e5fb4, 0xb82c2c], [0x234a8e, 0x861e22], [0x6a3f20, 0xd09a30]],   // 2：青い服・赤いマント・金髪
        [[0xc23b30, 0x6e3aa4], [0x9a2c25, 0x50287c], [0x2e5fb4, 0x3c3c48], [0x234a8e, 0x26262e], [0x6a3f20, 0xb8401e]],   // 3：紫の服・黒いマント・赤い髪
      ] },
    // 魔法使い：紫のローブ（robe・robeD・内がわ 0x6a38a8）・金髪（hair・hairIn）。金のふち・杖・宝石は替えない
    wizard: {
      keep: [0xe2b341, 0x6b4424, 0x4d301a, 0x7a4f2a, 0x80512a, 0xe84c93],
      v: [
        [[0x7a3fb8, 0xb8323a], [0x5a2c90, 0x8a2230], [0x6a38a8, 0xa02c34], [0xf0b21f, 0x7a4424], [0xcf9618, 0x5c3018], [0xe8642a, 0xd8dde6]],   // 1：赤いローブ・茶色の髪（帽子の朱の帯は、赤いローブとかぶるので白銀）
        [[0x7a3fb8, 0x3f8f48], [0x5a2c90, 0x2c6a34], [0x6a38a8, 0x387e40], [0xf0b21f, 0xc8ccd8], [0xcf9618, 0xa4a8b6]],   // 2：緑のローブ・銀の髪
        [[0x7a3fb8, 0x2e52b4], [0x5a2c90, 0x203c8a], [0x6a38a8, 0x284aa2], [0xf0b21f, 0xd04a2a], [0xcf9618, 0xa8381e], [0xe8642a, 0xd8dde6]],   // 3：青いローブ・赤い髪（帽子の朱の帯は、赤い髪とかぶるので白銀）
      ] },
    // 武闘家：ピンクの髪（HAIR・HAIRD）・赤い服（RED・REDD・裏地 LINING・リボン RIBBON）。金の帯・黒いズボンは替えない
    monk: {
      keep: [0xfbca19, 0xe0b010, 0x34343b, 0xeaeaea],
      v: [
        [[0xf85397, 0x2c2a34], [0xe0407f, 0x1e1c26], [0xbe1e2d, 0x1e8a8c], [0x8a1622, 0x146466], [0x5c0e18, 0x0c3a3c], [0xd0202a, 0x1e9a9c]],   // 1：黒い髪・青緑の服
        [[0xf85397, 0xf0c040], [0xe0407f, 0xd0a020], [0xbe1e2d, 0x2e8a3a], [0x8a1622, 0x1f6428], [0x5c0e18, 0x0e3a16], [0xd0202a, 0x2e9a3a]],   // 2：金髪・緑の服
        [[0xf85397, 0x4aa0e8], [0xe0407f, 0x3a80c8], [0xbe1e2d, 0x7a2eb0], [0x8a1622, 0x561e86], [0x5c0e18, 0x2e0c48], [0xd0202a, 0x8a30c0]],   // 3：水色の髪・紫の服
      ] },
    // 僧侶：青いローブ（robe・robeD・内がわ 0x33609f・帽子 cap）・水色のふち（gold 0xc8dcf2）・茶色の髪。杖・金具・靴は替えない
    priest: {
      keep: [0x6b4424, 0x4d301a, 0x6a4126, 0x9aa3b0, 0x6e7683, 0x3a2a30],
      v: [
        [[0x3a70c4, 0x3a9a5a], [0x2a528f, 0x2a7442], [0x33609f, 0x2e7a48], [0x2f62b8, 0x34905a], [0xc8dcf2, 0xf2e2a8], [0xf7e8c5, 0xf2e2a8], [0x7a4a2a, 0x2a2730], [0x5a3320, 0x1e1c24]],   // 1：緑のローブ・金のふち・黒い髪
        [[0x3a70c4, 0xa8303c], [0x2a528f, 0x7e222c], [0x33609f, 0x8e2834], [0x2f62b8, 0xa02c38], [0xc8dcf2, 0xf2d8a0], [0xf7e8c5, 0xf2d8a0], [0x7a4a2a, 0xe0b040], [0x5a3320, 0xb88a28]],   // 2：赤いローブ・金のふち・金髪
        [[0x3a70c4, 0x7040b0], [0x2a528f, 0x522e86], [0x33609f, 0x5e3498], [0x2f62b8, 0x6a3aa8], [0xc8dcf2, 0xe8d0f4], [0xf7e8c5, 0xe8d0f4], [0x7a4a2a, 0xc84a28], [0x5a3320, 0x9a3418]],   // 3：紫のローブ・薄紫のふち・赤い髪
      ] },
    // ワルキューレ：金髪（0xe8bb4c）・水色のスカート（SKY）・白いマント（頂点の色だけ。白と影 0xbfc7d7 は鎧にも使うので、マントは 'v'）。銀の鎧・金の飾りは替えない
    valkyrie: {
      keep: [0xd4d8de, 0xbfc7d7, 0xa0a6ae, 0xc99a34, 0xe0b445, 0x6b4424, 0x795231, 0xf3f3f3, 0xaab1bf, 0xedf0f4],
      v: [
        [[0xe8bb4c, 0x6a3a20], [0x5aa8e8, 0x4ab05a], [0xeff7fd, 0xd84848, 'v'], [0xbfc7d7, 0xa83030, 'v']],   // 1：茶色の髪・緑のスカート・赤いマント
        [[0xe8bb4c, 0x2c2a34], [0x5aa8e8, 0xa060d8], [0xeff7fd, 0x3a5ac8, 'v'], [0xbfc7d7, 0x2a40a0, 'v']],   // 2：黒い髪・紫のスカート・青いマント
        [[0xe8bb4c, 0xc83c2c], [0x5aa8e8, 0xe8902a], [0xeff7fd, 0x44444e, 'v'], [0xbfc7d7, 0x2a2a32, 'v']],   // 3：赤い髪・橙のスカート・黒いマント
      ] },
    // エルフ：金髪（0xecd06a・0xd7b850）・緑の服（GREEN・GREEND）・緑のマント（CLOAK・CLOAKD）。弓・矢筒・革・目の緑は替えない
    elf: {
      keep: [0x593a20, 0x9a7950, 0x4d301a, 0x6b4424, 0x8a5a30, 0x795030, 0x2e9b4a, 0xdcd6c8, 0xd7cbaf, 0xd7a683, 0xe9dfc6, 0xc9ced8],
      v: [
        [[0xecd06a, 0xd8dce8], [0xd7b850, 0xb4b8c6], [0x2e5531, 0x2e3e78], [0x2d5a2a, 0x284a8e], [0x3b7a34, 0x3a5ab0], [0x2c5e28, 0x2a4488]],   // 1：銀の髪・青い服とマント
        [[0xecd06a, 0x2c2a34], [0xd7b850, 0x1e1c26], [0x2e5531, 0x6e2230], [0x2d5a2a, 0x8a2a2a], [0x3b7a34, 0xa83a34], [0x2c5e28, 0x7e2a28]],   // 2：黒い髪・赤い服とマント
        [[0xecd06a, 0xc8582a], [0xd7b850, 0xa8461e], [0x2e5531, 0x4a3070], [0x2d5a2a, 0x5a3a8a], [0x3b7a34, 0x6e48a8], [0x2c5e28, 0x50347e]],   // 3：赤い髪・紫の服とマント
      ] },
    // 侍：紺の袴（hakama・hakamaD）・えんじの胸当て（armor・armorD・cord）・白い着物。黒い髪・刀・草履は替えない
    samurai: {
      keep: [0x1b1a1f, 0xf4f4f6, 0xf0f0f0, 0xd2a744, 0xc8a467, 0x8f6f3e, 0x2b2627, 0x1d1d22, 0x2a2a33, 0xd8d8e0],
      v: [
        [[0x2f3570, 0x5a5a64], [0x232856, 0x42424c], [0x8f2534, 0x2a3a7a], [0x66192a, 0x1e2a5a], [0x4a121c, 0x141c3a]],   // 1：灰の袴・紺の胸当て
        [[0x2f3570, 0x2e5a34], [0x232856, 0x224428], [0x8f2534, 0x34343c], [0x66192a, 0x24242a], [0x4a121c, 0x101014]],   // 2：緑の袴・黒の胸当て
        [[0x2f3570, 0x6a4630], [0x232856, 0x523424], [0x8f2534, 0x2e6a3a], [0x66192a, 0x1f4e2a], [0x4a121c, 0x0e2a14], [0xeceef3, 0xd8e4f4], [0xc4c8d4, 0xaab8d0]],   // 3：茶の袴・緑の胸当て・水色の着物
      ] },
    // 傭兵：革の上着（leather・leatherL・leatherD）・黒い髪。ズボン・長靴・帯・袖・鋼は替えない
    mercenary: {
      keep: [0x564d36, 0x6b4226, 0x4d301a, 0x3d2a18, 0x2b2627, 0x77706a, 0xc9ced8, 0x8e95a3, 0x4a2e1a, 0x6a3522],
      v: [
        [[0x7b4b2e, 0x3e5a34], [0x93593a, 0x4a6e3e], [0x58361f, 0x2c4226], [0x1f1b1d, 0x6a3f20]],   // 1：緑の上着・茶色の髪
        [[0x7b4b2e, 0x7e2a2a], [0x93593a, 0x94343a], [0x58361f, 0x5a1c1e], [0x1f1b1d, 0xc8a040]],   // 2：赤の上着・金髪
        [[0x7b4b2e, 0x34406e], [0x93593a, 0x404e84], [0x58361f, 0x242e52], [0x1f1b1d, 0x9a9aa6]],   // 3：紺の上着・灰色の髪
      ] },
  };
  const HEROES = Object.keys(P);
  // 色違い n（1〜3）の当て方：[元, 替え, 範囲] の並び。替えない色（KEEP・keep）は [色, 色] で先に入れる。n＝0・職業が無いときは null（元の色）
  function pairs(hero, n) {
    const h = P[hero]; if (!h || !(n >= 1 && n <= N)) return null;
    return [...KEEP.map(c => [c, c]), ...h.keep.map(c => [c, c]), ...h.v[n - 1]];
  }
  // 文字列から 32 ビットの数（FNV-1a）。同じ文字列はいつも同じ数
  function hash(s) { let x = 0x811c9dc5; for (const ch of String(s)) { x ^= ch.codePointAt(0); x = Math.imul(x, 0x01000193) >>> 0; } return x; }
  // 名前と職業 → 1〜3。同じ名前・同じ職業の人はいつも同じ色
  const variantOf = (name, hero) => 1 + hash((name || '旅人') + '|' + (hero || '')) % N;
  // 走る人 1 人（ghost.frame() の 1 人ぶん・ペースメーカー）の色違い。ペースメーカーも名前で決める（2026-10-28 ユーザー判断：自分と違う職業が並ぶので、元の色にしない）
  function pick(g) {
    if (!g) return 0;
    return variantOf(g.name, g.hero);
  }
  const api = { N, KEEP, P, HEROES, pairs, hash, variantOf, pick };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).heroColors = api;
})(typeof window !== 'undefined' ? window : globalThis);
