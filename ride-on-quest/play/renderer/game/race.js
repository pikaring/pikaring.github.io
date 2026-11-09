/* レース（docs/impl-race.md）：寛保岳めぐりを、決めた周回数、ゴースト9人と同じ時刻に走り出して競う。リアルタイム同期は要らない
   （相手はゴースト。走り始めてからの時間でそろえる）。画面にも時計にも触らない純粋な関数で、node のテストで確かめる。
   周回数は RACE.laps の1か所だけ（2026-10-21 ユーザー判断：5周。変えるならここだけ。サーバーは周回数ごとに分けて持つので、変えると別のレースになる）。 */
(function (root) {
  const RN = typeof require !== 'undefined' ? require('./roadnet.js') : root.RQ.roadnet;
  const RD = typeof require !== 'undefined' ? require('./ride.js') : root.RQ.ride;
  const GH = typeof require !== 'undefined' ? require('./ghost.js') : root.RQ.ghost;
  const TV = typeof require !== 'undefined' ? require('./travellers.js') : root.RQ.travellers;
  const PH = typeof require !== 'undefined' ? require('../trainer/phys.js') : root.RQ.phys;
  const HEROES = ['warrior', 'wizard', 'monk', 'priest'];

  // laps：周回数（5周）。side：右回り（時計回り）に固定。opponents：相手の人数（自分を入れて10人）。countdown：スタートまでの秒
  // ftpPct：FTP からの見込みのタイムに使うパワー（FTP の何割で走るか）。spread：旅人のタイムを、自分のタイムの ±この割合にばらけさせる
  const RACE = { courseId: 'ring', side: 'right', laps: 5, opponents: 9, countdown: 5, ftpPct: 0.85, spread: 0.12 };
  const MASS = 80, MAX_SEC = 3 * 3600;

  // コースの道（ring の外まわり・内まわり）と、走り出し、1周の長さ、ゴールまでの距離
  function setup(net, course, laps = RACE.laps) {
    const start = RN.courseStart(net, course, RACE.side), ids = course.roads.map(n => net.byName.get(n));
    const loopLen = ids.reduce((s, id) => s + net.roads[id].len, 0);
    const dirs = RN.followDirs(net, course.roads, course.start);
    return { start, force: new Set(ids), loopLen, goal: loopLen * laps, laps, lap: course.roads.map(n => [n, dirs.get(net.byName.get(n))]) };
  }

  // 最後の点をゴールの位置にそろえ、レースの記録にする（time：ゴールの時刻。秒）
  function finishGhost(net, g, time) {
    const i = g.route.length - 1, len = net.roads[net.byName.get(g.route[i][0])].len;
    g.pts.push([Math.max(time, g.pts[g.pts.length - 1][0]), i, +len.toFixed(1)]);
    g.sec = time; g.race = { laps: g.race && g.race.laps || 0, time };
    return g;
  }

  // 自分の走りの記録（走り始めてからの1秒ごとの samples。GH.fromSamples と同じ形）を、レースの記録にする
  function raceGhost(net, samples, time, laps, meta = {}) {
    const g = GH.fromSamples(net, samples.slice(0, Math.floor(time) + 1), { ...meta, kind: 'self', course: RACE.courseId, side: RACE.side });   // ゴールのあとの数えは捨てる
    g.race = { laps, time }; return finishGhost(net, g, time);
  }

  // 旅人1人（決めたパワーで周回を走る）：{ ghost（レースの記録）, time }。powerFn(t)：t 秒のパワー（W）
  function runner(net, course, laps, powerFn, meta = {}) {
    const su = setup(net, course, laps), ride = RD.createRide({ net, start: su.start, minutes: MAX_SEC / 60, force: su.force, quiet: true, goal: su.goal });
    let v = 0; const samples = [], snap = () => { const i = RD.info(ride); samples.push({ rd: i.road, rs: Math.round(i.s), rdir: i.dir }); };
    snap();
    for (let t = 0; t < MAX_SEC; t++) {
      const power = powerFn(t), g = RD.gradeAt(net.roads[ride.road], ride.s, ride.dir);
      for (let k = 0; k < 4; k++) v = Math.min(RD.MAX_SPEED, PH.physStep(v, power, g, meta.mass || MASS, 0.25));
      const ev = RD.step(ride, 1, v), fin = ev.find(e => e.type === 'finish' && e.goal);
      if (fin) {
        const g2 = GH.fromSamples(net, samples, { ...meta, kind: 'traveller', course: RACE.courseId, side: RACE.side });
        g2.race = { laps, time: fin.time };
        return { ghost: finishGhost(net, g2, fin.time), time: fin.time };
      }
      snap();
    }
    return null;
  }

  const constant = w => () => w;
  // FTP からの見込みのタイム（FTP の ftpPct のパワーで走ったとき）
  function estimateTime(net, course, ftp, laps = RACE.laps, mass = 84) {
    const r = runner(net, course, laps, constant(ftp * RACE.ftpPct), { mass }); return r ? r.time : null;
  }
  // 決めたタイムで走るパワー（二分探索。タイムはパワーが大きいほど短い）→ { power, ghost, time }
  function runToTime(net, course, laps, target, meta = {}) {
    let lo = 40, hi = 700, best = null;
    for (let k = 0; k < 9; k++) {
      const mid = (lo + hi) / 2, r = runner(net, course, laps, constant(mid), meta);
      if (!r) { lo = mid; continue; }
      best = { power: mid, ...r };
      if (r.time > target) lo = mid; else hi = mid;
    }
    return best;
  }

  // 旅人の乱数
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // 相手を選ぶ。mineTime：自分のタイム（前回、無ければ見込み）。own：ローカルに保存した自分のレースの記録、imported：サーバーから取ってきた人の記録（fromServer を通したもの）。
  // 1) 前回の自分（あれば1人） 2) ほかの人の記録をタイムの近い順に（同じ人は1つ） 3) 足りない分は旅人（タイムが mineTime の ±spread にばらける）
  function pickField({ net, course, laps = RACE.laps, mineTime, own = [], imported = [], seed = 1, n = RACE.opponents }) {
    const ok = g => g && g.race && g.race.laps === laps && g.course === course.id && GH.valid(net, g);
    const out = [], r = rng(seed ^ 0x2545f491);
    const mine = own.filter(ok).sort((a, b) => (b.date || 0) - (a.date || 0))[0];
    if (mine) out.push({ ...mine, kind: 'self' });
    const seen = new Set(out.map(g => `${g.name}|${g.hero}`));
    for (const g of imported.filter(ok).sort((a, b) => Math.abs(a.race.time - mineTime) - Math.abs(b.race.time - mineTime))) {
      if (out.length >= n) break;
      const key = `${g.name}|${g.hero}`; if (seen.has(key)) continue; seen.add(key);
      out.push({ ...g, kind: 'imported' });
    }
    const m = n - out.length;
    if (m > 0) {   // 旅人：タイムを mineTime の ±spread に等間隔に。名前・主人公は種で決める（重ならない）
      const used = new Set(out.map(g => g.name)), order = Array.from({ length: m }, (_, i) => i);
      for (let i = m - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (let i = 0; i < m; i++) {
        const target = mineTime * (1 - RACE.spread + 2 * RACE.spread * (order[i] + 0.5) / m);
        const look = TV.pickLook(r, used, true); used.add(look.name);   // 旅人は NPC の見た目（絵の一覧が読めないときだけ主人公の絵）
        const res = runToTime(net, course, laps, target, { name: look.name, hero: look.hero });
        if (res) out.push({ ...res.ghost, id: `rt${i}-${seed}` });
      }
    }
    return out.slice(0, n).map((g, i) => ({ ...g, id: g.kind === 'traveller' ? g.id : `r${i}-${g.id}` }));
  }

  // 走っている間の順位（自分より先に進んでいる人の数 ＋ 1）。clock：走り始めてからの秒、myRidden：自分の走った距離、su.goal：ゴールの距離
  function rankNow(net, ghosts, clock, myRidden, goal) {
    let ahead = 0;
    for (const g of ghosts) {
      const prog = clock >= g.race.time ? goal : Math.min(goal, GH.progressAt(net, g, clock));
      if (prog > myRidden + 1e-6) ahead++;
    }
    return 1 + ahead;
  }
  // ゴールしたときの順位（自分よりタイムが短い人の数 ＋ 1。同じタイムなら自分が上）
  const finalRank = (ghosts, time) => 1 + ghosts.filter(g => g.race.time < time).length;
  // 結果の一覧：タイムの短い順（自分を含む）。[{ name, time, hero, me, kind }]
  function results(ghosts, me) {
    const all = ghosts.map(g => ({ name: g.name, time: g.race.time, hero: g.hero, me: false, kind: g.kind }));
    all.push({ name: me.name, time: me.time, hero: me.hero, me: true, kind: 'self' });
    return all.sort((a, b) => a.time - b.time || (a.me ? -1 : 1));
  }
  const mmss = t => { const s = Math.round(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  const api = { RACE, setup, raceGhost, finishGhost, runner, estimateTime, runToTime, pickField, rankNow, finalRank, results, mmss };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).race = api;
})(typeof window !== 'undefined' ? window : globalThis);
