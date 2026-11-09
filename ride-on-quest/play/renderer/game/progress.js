/* プレイヤーのレベル（2026-10-21 ユーザー判断）。画面にも保存にも触らない純粋な関数。
   走った負荷（TSS）を経験値にためる。旅・フリーライド・女王の試練のどれでもたまる。
   レベルが上がるたびに FTP を 5 W 上げる（手で下げてもよい）。ゲームの進み方と体の育ち方は必ずしも比例しないので、ゆるくてよい。 */
(function (root) {
  const XP_PER_LEVEL = 300;   // 60分の旅を5回くらい（TSS 60 × 5）で1つ上がる
  const FTP_UP = 5;           // レベルが1つ上がるごとに上げる FTP（W）

  const levelOf = xp => 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
  // 次のレベルまでの残り
  const toNext = xp => XP_PER_LEVEL - (Math.max(0, xp) % XP_PER_LEVEL);
  // 経験値を足す。返り値：{ xp, level, from, ups（上がった数）, ftpUp（上げる FTP の合計 W） }
  function addXp(xp0, gain) {
    const xp = Math.max(0, xp0) + Math.max(0, Math.round(gain || 0)), from = levelOf(xp0), level = levelOf(xp), ups = level - from;
    return { xp, level, from, ups, ftpUp: ups * FTP_UP };
  }

  const api = { XP_PER_LEVEL, FTP_UP, levelOf, toNext, addXp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).progress = api;
})(typeof window !== 'undefined' ? window : globalThis);
