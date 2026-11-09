/* 女王の試練（FTP テスト）。ランプテスト：ウォームアップのあと、1分ごとに目標パワーを上げ、
   続かなくなったところで終わる。FTP＝いちばん高かった1分平均パワー×0.75。画面にもトレーナーにも触らない。 */
(function (root) {
  const WARM_SEC = 300;       // ウォームアップ
  const STEP_SEC = 60, STEP_W = 20;
  const FAIL_RATIO = 0.85;    // 目標のこの割合を下回り（3秒平均）……
  const FAIL_SEC = 8;         // ……この秒数続いたら終わり
  const FAIL_RPM = 40, FAIL_RPM_SEC = 5;   // 回転数がこれを下回って続いたら終わり（踏めなくなったとき）
  const round10 = w => Math.max(50, Math.round(w / 10) * 10);
  // ランプの始めは 100 W がいちばん下で、見込みの FTP の 4 割のほうが高ければそちら（10 W 単位）：FTP 250 W 以下は 100 W、300→120 W、400→160 W
  // （2026-10-28 ユーザー判断。前は見込みの FTP×0.5 で 60〜70 W になり、ランプがとても長くなった）。ウォームアップは始めの 8 割（100 W なら 80 W）
  const START_W = 100, START_K = 0.4, WARM_K = 0.8;
  const startOf = guess => Math.max(START_W, Math.round(guess * START_K / 10) * 10);
  const warmOf = guess => round10(startOf(guess) * WARM_K);

  const INTRO = [
    '挑戦者よ、よくぞ参った。',
    'この火の島の旅は長く険しい。まずはそなたの脚の力を見せてもらおう。',
    '体を温めたのち、一分ごとに求める力を上げていく。ギアと回転で合わせ、届かなくなるまで続けるがよい。',
    '回すのをやめた時点で試練は終わる。悔いのないよう、出し切るのだ。',
  ];
  const CHEERS = ['よいぞ、その調子だ。', 'まだまだ行けるはずだ！', '息を吐け、脚を回せ！', 'ほう、なかなかやるな。', 'ここからが本番だ！', '踏ん張れ、挑戦者よ！'];

  // guess：今の FTP の見積もり（初回は設定の値）
  function createTrial({ guess = 150 } = {}) {
    return {
      phase: 'warmup', t: 0, guess,
      warmW: warmOf(guess), startW: startOf(guess),
      target: warmOf(guess), level: 0,
      secs: [], acc: 0, accN: 0,       // 1秒ごとの平均パワー（ランプの間）
      p3: [], low: 0, slow: 0,
      best1: 0, ftp: null, rampSec: 0,
    };
  }

  function bestAvg(secs, n) {
    if (secs.length < n) return 0;
    let sum = 0, best = 0;
    for (let i = 0; i < secs.length; i++) { sum += secs[i]; if (i >= n) sum -= secs[i - n]; if (i >= n - 1) best = Math.max(best, sum / n); }
    return best;
  }

  function finish(tr, ev) {
    tr.phase = 'done';
    tr.best1 = Math.round(bestAvg(tr.secs, 60));
    tr.ftp = tr.best1 ? Math.round(tr.best1 * 0.75) : null;   // ランプが1分に届かなければ測れない
    ev.push({ type: 'done', ftp: tr.ftp, best1: tr.best1 });
  }

  // inp = { power, cad }。起きたことを返す
  function step(tr, dt, inp) {
    const ev = [];
    if (tr.phase === 'done') return ev;
    tr.t += dt;
    if (tr.phase === 'warmup') {
      tr.target = tr.warmW;
      if (tr.t >= WARM_SEC) { tr.phase = 'ramp'; tr.t = 0; tr.level = 1; tr.target = tr.startW; ev.push({ type: 'rampStart', target: tr.target }); }
      return ev;
    }
    // ランプ
    tr.rampSec += dt;
    const level = 1 + Math.floor(tr.t / STEP_SEC);
    if (level !== tr.level) { tr.level = level; tr.target = tr.startW + STEP_W * (level - 1); ev.push({ type: 'level', level, target: tr.target, cheer: CHEERS[(level - 2) % CHEERS.length] }); }
    tr.acc += inp.power * dt; tr.accN += dt;
    while (tr.accN >= 1) { const p = tr.acc / tr.accN; tr.secs.push(p); tr.accN -= 1; tr.acc = p * tr.accN; }   // 早送りで1回に数秒進んでも、1秒ずつ残す
    tr.best1 = Math.round(bestAvg(tr.secs, 60));
    // 続かなくなったか
    tr.p3.push([tr.t, inp.power]); while (tr.p3.length && tr.t - tr.p3[0][0] > 3) tr.p3.shift();
    const p3 = tr.p3.reduce((a, x) => a + x[1], 0) / tr.p3.length;
    tr.low = p3 < tr.target * FAIL_RATIO ? tr.low + dt : 0;
    tr.slow = inp.cad < FAIL_RPM ? tr.slow + dt : 0;
    if (tr.t > 10 && (tr.low >= FAIL_SEC || tr.slow >= FAIL_RPM_SEC)) finish(tr, ev);
    return ev;
  }

  // 自分でやめる（Enter）。ウォームアップ中なら測れずに終わる
  function giveUp(tr) { const ev = []; if (tr.phase !== 'done') finish(tr, ev); return ev; }

  const api = { START_W, startOf, WARM_SEC, STEP_SEC, STEP_W, INTRO, CHEERS, createTrial, step, giveUp, bestAvg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).trial = api;
})(typeof window !== 'undefined' ? window : globalThis);
