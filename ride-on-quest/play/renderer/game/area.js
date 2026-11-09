/* 主人公がいる所の地面の区分（2026-10-22 ユーザー要望「フィールドの曲、地面ごとに何種類か」）。画面に触らない純粋な関数（node のテストで確かめる）。
   区分は敵の出る順（海岸・崖 → 山腹・森 → 火口・山頂）と同じ名前：coast（海岸）・forest（草地・森）・crater（火山）。
   決め方は本物の標高（island.json の elev。縮める前の m）で、地面の色分け（view3d.js：8 m 未満が砂、470 m を超えると焼け石、440〜560 m で灰）にそろえる：
     100 m 未満＝海岸（海岸の道はほとんど 10〜90 m）、470 m 以上＝火山（寛保岳・観測所・江良岳のまわり）、そのあいだ＝草地・森。
   境目で行ったり来たりしないよう、settle で「新しい区分が HOLD 秒続いたら替える」。 */
(function (root) {
  const COAST_BELOW = 100, CRATER_FROM = 470, HOLD = 18;

  // 標高（m）→ 区分
  const areaOfElev = e => (e < COAST_BELOW ? 'coast' : e >= CRATER_FROM ? 'crater' : 'forest');

  // 緯度・経度の所の標高（island.json の格子で、いちばん近いマス。海は 0 以下）
  function elevAt(isl, lat, lon) {
    const R = isl.elev.length, C = isl.elev[0].length;
    const r = Math.round((lat - isl.lat0) / (isl.lat1 - isl.lat0) * (R - 1)), c = Math.round((lon - isl.lon0) / (isl.lon1 - isl.lon0) * (C - 1));
    return isl.elev[Math.max(0, Math.min(R - 1, r))][Math.max(0, Math.min(C - 1, c))];
  }
  const areaAt = (isl, lat, lon) => areaOfElev(elevAt(isl, lat, lon));

  /* 敵の出る場所（2026-10-25 ユーザー判断：旅の進み具合ではなく、敵が現れたときの地形で決める）。区分の名前は data.js の AREAS（coast・forest・summit）。
     coast＝海に近い低い所（標高 100 m 未満、または海から 120 m 以内で標高 160 m 未満）／summit＝火口・鬼王の城の近くと高い所（標高 470 m 以上＝地面が焼け石になる高さ、
     または江良岳・寛保岳の頂から 200 m 以内）／forest＝そのあいだ（森・山腹）。標高は本物の m（island.json の elev）。
     enemyAreaOf(標高 m, 海からの距離 m, 頂からの距離 m) は純粋な関数。enemyAreaAt(isl, lat, lon, places) は位置から出す。 */
  const ENEMY = { COAST_BELOW: 100, COAST_NEAR_M: 120, COAST_NEAR_BELOW: 160, SUMMIT_FROM: 470, SUMMIT_NEAR_M: 200 };
  function enemyAreaOf(e, seaM = 1e9, peakM = 1e9) {
    if (e >= ENEMY.SUMMIT_FROM || peakM <= ENEMY.SUMMIT_NEAR_M) return 'summit';
    if (e < ENEMY.COAST_BELOW || (seaM <= ENEMY.COAST_NEAR_M && e < ENEMY.COAST_NEAR_BELOW)) return 'coast';
    return 'forest';
  }
  // 島の格子の、海（標高 0 未満のマス）までの距離（m）。格子の距離変換（斜めは √2）。島ごとに 1 度だけ作って覚える
  const seaCache = new WeakMap();
  function seaDist(isl) {
    let m = seaCache.get(isl.elev); if (m) return m;
    const R = isl.elev.length, C = isl.elev[0].length, cell = isl.cell || 111320 * (isl.lat0 - isl.lat1) / (R - 1), INF = 1e9, d = new Float32Array(R * C);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) d[r * C + c] = isl.elev[r][c] < 0 ? 0 : INF;
    const rel = (k, v) => { if (v < d[k]) d[k] = v; };
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const k = r * C + c; if (d[k] === 0) continue; if (r) rel(k, d[k - C] + 1); if (c) rel(k, d[k - 1] + 1); if (r && c) rel(k, d[k - C - 1] + 1.414); if (r && c < C - 1) rel(k, d[k - C + 1] + 1.414); }
    for (let r = R - 1; r >= 0; r--) for (let c = C - 1; c >= 0; c--) { const k = r * C + c; if (d[k] === 0) continue; if (r < R - 1) rel(k, d[k + C] + 1); if (c < C - 1) rel(k, d[k + 1] + 1); if (r < R - 1 && c < C - 1) rel(k, d[k + C + 1] + 1.414); if (r < R - 1 && c) rel(k, d[k + C - 1] + 1.414); }
    for (let i = 0; i < d.length; i++) d[i] *= cell; seaCache.set(isl.elev, d); return d;
  }
  const PEAKS = ['江良岳', '寛保岳'];   // 鬼王の城のある山と、火口の山（places の名前。緯度経度ではなく格子の行・列）
  function enemyAreaAt(isl, lat, lon, places = null) {
    const R = isl.elev.length, C = isl.elev[0].length, cell = isl.cell || 111320 * (isl.lat0 - isl.lat1) / (R - 1);
    const rf = (lat - isl.lat0) / (isl.lat1 - isl.lat0) * (R - 1), cf = (lon - isl.lon0) / (isl.lon1 - isl.lon0) * (C - 1);
    const r = Math.max(0, Math.min(R - 1, Math.round(rf))), c = Math.max(0, Math.min(C - 1, Math.round(cf)));
    let peakM = 1e9; if (places) for (const nm of PEAKS) { const p = places[nm]; if (p) peakM = Math.min(peakM, Math.hypot(p[0] - rf, p[1] - cf) * cell); }
    return enemyAreaOf(isl.elev[r][c], seaDist(isl)[r * C + c], peakM);
  }

  /* 区分を落ち着かせる。st：{ area（いま使っている区分）, cand（替わりそうな区分）, t（cand が続いた秒） }、raw：いまの場所の区分、dt：経った秒。
     返り値：新しい st（st.area が使う区分）。最初の1回は、そのまま raw を使う */
  function settle(st, raw, dt, hold = HOLD) {
    if (!raw) return st || { area: null, cand: null, t: 0 };
    if (!st || !st.area) return { area: raw, cand: null, t: 0 };
    if (raw === st.area) return { area: st.area, cand: null, t: 0 };
    const t = raw === st.cand ? st.t + dt : dt;
    return t >= hold ? { area: raw, cand: null, t: 0 } : { area: st.area, cand: raw, t };
  }

  // 家を建ててよい所か（2026-10-28 試走の指摘 12：浜の村の家が海のすぐ手前に建っていた）。海（の格子）から HOUSE_SEA_M m 以上離れ、本物の標高が HOUSE_ELEV_M m 以上。
  // r, c は格子の行・列（小数で可。距離と標高は双一次補間）。港の村（view3d.js）・家並みと漁師小屋（landmark-view.js）が同じ決まりで使う
  const HOUSE_SEA_M = 35, HOUSE_ELEV_M = 4;
  function houseOk(isl, r, c) {
    const R = isl.elev.length, C = isl.elev[0].length, d = seaDist(isl);
    if (!(r >= 0 && c >= 0 && r <= R - 1 && c <= C - 1)) return false;
    const r0 = Math.min(R - 2, Math.floor(r)), c0 = Math.min(C - 2, Math.floor(c)), fr = r - r0, fc = c - c0;
    const bi = f => f(r0, c0) * (1 - fr) * (1 - fc) + f(r0, c0 + 1) * (1 - fr) * fc + f(r0 + 1, c0) * fr * (1 - fc) + f(r0 + 1, c0 + 1) * fr * fc;
    return bi((a, b) => d[a * C + b]) >= HOUSE_SEA_M && bi((a, b) => isl.elev[a][b]) >= HOUSE_ELEV_M;
  }
  const api = { HOUSE_SEA_M, HOUSE_ELEV_M, houseOk, COAST_BELOW, CRATER_FROM, HOLD, areaOfElev, elevAt, areaAt, settle, ENEMY, enemyAreaOf, enemyAreaAt, seaDist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).area = api;
})(typeof window !== 'undefined' ? window : globalThis);
