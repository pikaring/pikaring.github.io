/* ERG のスパイラル対策（2026-10-21 ユーザー判断。docs/compare-apps.md の1）。
   ERG では、回転が落ちると同じパワーのために負荷が重くなり、さらに回せなくなる。回転数が lowRpm を下回って lowSec 続いたら
   負荷を抜き（目標の cutFrac）、resumeRpm 以上で resumeSec 回せたら、recoverSec かけて目標まで戻す。
   ERG の一時停止（勾配を送っていた間）から戻るときも、抜いた所から戻す。画面にもトレーナーにも触らない純粋な関数。
   抜く前から：回転が softRpm を下回ったら、目標 × 回転数 / softRpm に下げる（2026-10-22 ユーザー判断。回転を落とすと急に重くなるのを打ち消す。
   ERG はパワー一定なので、回転が落ちるほどトルクが重くなる）。トレーナーが目標を変えてから軽くなるまでの遅れのぶん、
   回転が落ちている間は少し先の回転で早めに下げる。下げたぶんは、回転が戻ったら recoverSec かけて戻す（抜いたときと同じ）。 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.RQ.data;
  const G = () => D.TUNE.ergGuard;

  const create = () => ({ out: null, low: 0, ok: 0, cut: false, recovering: false, avg: null, still: 0, stop: false, restart: false });

  // 勾配（ERG でない負荷）を送っていた間のあと：抜いた所から始める（次の step で回転を見て戻す）
  function resume(st) { st.out = null; st.low = 0; st.ok = 0; st.cut = true; st.recovering = true; }

  // target：頼まれた目標（W）、cad：回転数、dt：秒、rate：ふだん目標が変わるときに寄せる速さ（W/秒）。送る値（W）を返す
  function step(st, target, cad, dt, rate) {
    // 数でない値は「止まっている」とみる（NaN の目標をトレーナーに送らない。2026-11-07）
    if (!Number.isFinite(target) || target < 0) target = 0;
    if (!Number.isFinite(cad)) cad = 0;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    if (st.out != null && !Number.isFinite(st.out)) st.out = null;
    if (st.avg != null && !Number.isFinite(st.avg)) st.avg = null;
    const g = G(), cutW = Math.round(target * g.cutFrac);
    // 足が止まった（stopRpm 未満が stopSec 続いた）：負荷を 0 にする。こぎ出したら（stopRpm 以上）、restartSec かけて戻す（2026-10-26 ユーザー判断）
    st.still = cad < g.stopRpm ? (st.still || 0) + dt : 0;
    if (!st.stop && st.still >= g.stopSec) st.stop = true;
    if (st.stop) {
      if (cad < g.stopRpm) { st.out = 0; return 0; }
      st.stop = false; st.restart = true; st.cut = false; st.low = 0; st.recovering = false; st.out = 0;
    }
    st.low = cad < g.lowRpm ? st.low + dt : 0;
    st.ok = cad >= g.resumeRpm ? st.ok + dt : 0;
    if (!st.cut && st.low >= g.lowSec) { st.cut = true; st.recovering = true; }
    if (st.cut && st.ok >= g.resumeSec) st.cut = false;
    // 落ちている間は、少し先の回転を見る：ならした回転（leadSec でならす）より下がっているぶんを、もう少し下がるとみる（leadMax rpm まで）
    st.avg = st.avg == null ? cad : st.avg + (cad - st.avg) * Math.min(1, dt / g.leadSec);
    const ahead = cad - Math.min(g.leadMax, Math.max(0, st.avg - cad));
    const soft = Math.round(target * Math.max(g.cutFrac, Math.min(1, ahead / g.softRpm)));
    if (soft < target) st.recovering = true;
    if (st.out == null) st.out = st.cut ? cutW : soft;
    const aim = st.cut ? cutW : soft;
    if (aim < st.out) st.out = st.cut || aim < target ? aim : Math.max(aim, st.out - rate * dt);   // 抜く・回転に合わせて下げるときはすぐ
    else {
      const up = st.restart ? Math.max(1, target / g.restartSec) : st.recovering ? Math.max(1, target * (1 - g.cutFrac) / g.recoverSec) : rate;
      st.out = Math.min(aim, st.out + up * dt);
      if (st.out >= aim) st.restart = false;
      if (st.out >= target) st.recovering = false;
    }
    return Math.round(st.out);
  }

  const api = { create, resume, step };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).ergGuard = api;
})(typeof window !== 'undefined' ? window : globalThis);
