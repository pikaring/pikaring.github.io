/* 地面の分け方（草・森・岩・灰・砂・焼け石）。3D の地面（ui/view3d.js）と、地図の絵（絵の担当が作る）が同じ分け方を使うための、画面に触らない純粋な関数。
   入力は、島の格子（island.json の elev。海は負）の標高 e（m）と、斜面の急さ sl（となりのマスとの標高差 ÷ 距離。slope() で出す）。
   classify(e, sl) → { color（頂点の色 0xRRGGBB。3D はこれに色のむらを掛ける）, mat: [草, 岩, 灰, 砂]（模様の出し分けの重み 0〜1。残りは土）, name }
   name：sea（海のマス）／beach（標高 8 m 未満の浜）／lava（620 m より上の黒い溶岩）／ash（470 m より上の焼け石）／cliff（斜面 0.85 より急）／rock（0.65 より急）／grass（150 m 未満）／forest（400 m 未満）／upland（それより上）。
   2026-10-23 ユーザー判断：地図の絵はデータからコードで作り、3D と同じ分け方にする。 */
(function (root) {
  const clamp01 = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));
  // 格子 (r, c) の斜面の急さ（となりのマスとの標高差 ÷ 距離。海は 0 m として数える）
  function slope(isl, r, c) {
    const R = isl.rows, C = isl.cols, cell = isl.cell || 111320 * (isl.lat0 - isl.lat1) / (R - 1);
    const E = (rr, cc) => Math.max(0, isl.elev[Math.max(0, Math.min(R - 1, rr))][Math.max(0, Math.min(C - 1, cc))]);
    return Math.max(Math.abs(E(r, c + 1) - E(r, c - 1)), Math.abs(E(r + 1, c) - E(r - 1, c))) / (2 * cell);
  }
  function classify(e, sl) {
    let color, name;
    if (e < 0) { color = 0xc9b98f; name = 'sea'; }
    else if (e < 8) { color = 0xd8c9a0; name = 'beach'; }
    else if (e > 620) { color = 0x3a302c; name = 'lava'; }
    else if (e > 470) { color = 0x6e5a4a; name = 'ash'; }
    else if (sl > 0.85) { color = 0x857e72; name = 'cliff'; }
    else if (sl > 0.65) { color = 0x76784e; name = 'rock'; }
    else if (e < 150) { color = 0x6fa848; name = 'grass'; }
    else if (e < 400) { color = 0x4f7f36; name = 'forest'; }
    else { color = 0x6f7046; name = 'upland'; }
    const mat = [e < 470 && e >= 8 ? Math.max(0, 1 - sl / 0.7) : 0, clamp01(sl, 0.45, 0.85), clamp01(e, 440, 560), e < 9 ? 1 : 0];
    return { color, mat, name };
  }
  const api = { slope, classify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).groundclass = api;
})(typeof window !== 'undefined' ? window : globalThis);
