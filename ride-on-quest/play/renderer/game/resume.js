/* 走っている途中の控え（2026-11-10 試走の指摘「間違ってリロードを押してしまったら、それまでの走りはどうなるのか」→ ユーザー判断 85B）。
   旅・女王の試練の間、数秒ごとに、記録（1 秒ごとの点）と旅の進みを localStorage に書いておく。読み直して開いたら
   「続きから走る／ここまでを保存する（FIT とまとめ）／捨てる」を選ぶ（app.js）。
   置き場所：localStorage（Electron 版もブラウザ版も。Electron の localStorage はディスクに残り、ほかの記録 rq.* と同じ所）。
   - rq.resume      … 控えの本体（旅の進み・位置・その日の走りの区切りなど。記録の点は入れない）
   - rq.resume.c<i> … 記録の点を CHUNK 個ずつ、列に分けて（埋まった塊は 1 回だけ書く。書くのは最後の塊だけなので、長い旅でも軽い）
   1 時間で 200〜300 KB ほど（スマホの Bluefy〔WebKit〕の localStorage の上限 5 MB に入る）。書けなかったら（上限）その回はあきらめ、走りは止めない。
   画面に触らない（storage を渡す）。node のテストで確かめる（tests/resume.test.js）。 */
(function (root) {
  const KEY = 'rq.resume', CHUNK = 600, V = 1;
  const MAX_AGE_MS = 24 * 3600 * 1000;   // これより古い控えは出さない（次の日まで残っていたら捨てる）
  const MIN_SAMPLES = 30;                // 30 秒より短い走りは、聞かずに捨てる
  const COLS = ['t', 'p', 'c', 'hr', 's', 'd', 'k', 'lat', 'lon', 'alt', 'rd', 'rs', 'rdir'];

  // 記録の点 → 列（t は t0 からの ms）
  function packSamples(samples, t0, from = 0, to = samples.length) {
    const o = {};
    for (const c of COLS) o[c] = [];
    for (let i = from; i < to; i++) { const s = samples[i]; for (const c of COLS) o[c].push(c === 't' ? s.t - t0 : s[c] === undefined ? null : s[c]); }
    return o;
  }
  function unpackSamples(cols, t0, into = []) {
    const n = (cols && cols.t || []).length;
    for (let i = 0; i < n; i++) {
      const s = { t: t0 + cols.t[i], p: cols.p[i], c: cols.c[i], hr: cols.hr[i], s: cols.s[i], d: cols.d[i], k: cols.k[i] };
      if (cols.lat && cols.lat[i] != null) { s.lat = cols.lat[i]; s.lon = cols.lon[i]; s.alt = cols.alt[i]; s.rd = cols.rd[i]; s.rs = cols.rs[i]; s.rdir = cols.rdir[i]; }
      into.push(s);
    }
    return into;
  }

  // 旅の状態（course.js の run）を JSON にできる形へ：関数（rng・areaNow・talkPages）と、別に持つ話の記録（talkLog）を除く
  const SKIP = new Set(['rng', 'areaNow', 'talkPages', 'talkLog']);
  function packRun(run) {
    if (!run) return null;
    return JSON.parse(JSON.stringify(run, (k, v) => (typeof v === 'function' || (SKIP.has(k)) ? undefined : v)));
  }
  // 戻す：関数を入れ直す。戦闘の途中だったら、その戦闘ははじめから（戦闘の中の進みは控えない）
  function unpackRun(o, { rng = Math.random, areaNow = null, talkLog = null } = {}) {
    if (!o) return null;
    const run = { ...o, rng, areaNow, talkLog };
    if (run.endPlan == null) delete run.endPlan;   // Infinity は JSON で null になる（app.js は endPlan || Infinity で読む）
    return run;
  }

  // 書く。st：{ kind: 'quest'|'trial', rec, run, ... }。書いた塊の数を覚えておく（w.chunks）ので、同じ塊は書き直さない。返り値：書けたか
  function save(storage, st, w = {}) {
    const rec = st.rec; if (!rec || !rec.samples) return false;
    const n = rec.samples.length, full = Math.floor(n / CHUNK);
    try {
      w.chunks = w.chunks || 0;
      if (w.t0 !== rec.t0) { w.chunks = 0; w.t0 = rec.t0; clear(storage, true); }
      for (let i = w.chunks; i < full; i++) storage.setItem(`${KEY}.c${i}`, JSON.stringify(packSamples(rec.samples, rec.t0, i * CHUNK, (i + 1) * CHUNK)));
      w.chunks = full;
      storage.setItem(`${KEY}.c${full}`, JSON.stringify(packSamples(rec.samples, rec.t0, full * CHUNK, n)));
      const { rec: _r, run, ...rest } = st;
      storage.setItem(KEY, JSON.stringify({ v: V, at: st.at || Date.now(), n, chunks: full + 1,
        rec: { t0: rec.t0, pauseMs: rec.pauseMs, dist: rec.dist, date: +rec.date, acc: rec.acc }, run: packRun(run), ...rest }));
      return true;
    } catch (e) { return false; }   // 上限（QuotaExceededError）など。走りは止めない
  }

  // 読む。無い・壊れた・古いときは null。samples を戻した rec を付けて返す
  function load(storage, now = Date.now()) {
    let o = null;
    try { o = JSON.parse(storage.getItem(KEY) || 'null'); } catch (e) { o = null; }
    if (!o || o.v !== V || !o.rec) return null;
    if (!(now - o.at < MAX_AGE_MS)) return null;
    const samples = [];
    try { for (let i = 0; i < o.chunks; i++) unpackSamples(JSON.parse(storage.getItem(`${KEY}.c${i}`) || 'null'), o.rec.t0, samples); } catch (e) { return null; }
    if (samples.length < Math.min(o.n, MIN_SAMPLES)) return null;   // 塊が欠けている
    const rec = { samples: samples.slice(0, o.n), acc: o.rec.acc || { p: 0, c: 0, hr: 0, s: 0, n: 0 }, dist: o.rec.dist, date: new Date(o.rec.date), t0: o.rec.t0, pauseMs: o.rec.pauseMs || 0 };
    return { ...o, rec };
  }
  // 聞く値うちがあるか（短すぎる走りは聞かずに捨てる）
  const worthAsking = snap => !!snap && snap.rec.samples.length >= MIN_SAMPLES;
  // 続きから走れるか：旅の途中（試練・試練のあとの 1 戦・走りきったあとは、ここまでを保存するか捨てるだけ）
  const canContinue = snap => !!snap && snap.kind === 'quest' && !!snap.run && !snap.run.done && !snap.run.trial && !!snap.run.seg;

  // 消す（onlyChunks：記録の点の塊だけ消す）
  function clear(storage, onlyChunks = false) {
    try {
      const ks = [];
      for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(KEY + '.c')) ks.push(k); }
      ks.forEach(k => storage.removeItem(k));
      if (!onlyChunks) storage.removeItem(KEY);
    } catch (e) { /* 読めない localStorage（プライベートなど）は何もしない */ }
  }

  // 読み直すまでの時間を、一時停止と同じく記録の時刻のすき間にする（FIT ではタイマーの停止。1 つの FIT のまま）
  function bridgeGap(rec, now = Date.now()) {
    const nextT = rec.t0 + rec.samples.length * 1000 + rec.pauseMs;
    if (now > nextT) rec.pauseMs += now - nextT;
    return rec;
  }

  const api = { KEY, CHUNK, MAX_AGE_MS, MIN_SAMPLES, packSamples, unpackSamples, packRun, unpackRun, save, load, clear, worthAsking, canContinue, bridgeGap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).resume = api;
})(typeof window !== 'undefined' ? window : globalThis);
