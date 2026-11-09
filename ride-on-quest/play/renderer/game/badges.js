/* 勲章（2026-10-24 ユーザー判断：案の24個。絵は、まず文字と小さな記号だけ）。画面に触らない純粋な関数。
   距離・時間は前の記録（rq.records）からさかのぼって数え、会心・星・鬼王・獲得標高・走った道などは、作った日から数える（state.c）。
   state（localStorage の rq.badges）：{ got: { 勲章の ID: 'YYYY-MM-DD' }, c: { crits, stars, bossWins, eliteWins, heroes: [], roads: [], gain } }
   facts（その回のまとめで分かったこと）：{ day, quest（旅を含む）, questDone（旅を走りきった）, heroes, crits, stars, bossWins, eliteWins, perfect,
   legend（Lv 12 を終えた）, trial（試練で FTP を測った）, ftpUp（FTP が上がった）, sec（その回の秒）, gain（m）, roads（通った道の番号）, islandLoop, raceRank } */
(function (root) {
  const H = typeof module !== 'undefined' && module.exports ? require('./habit.js') : root.RQ.habit;
  // g：まとまり（続ける・旅と物語・戦い・トレーニング・島とレース）、sym：小さな記号、need：数で決まる勲章の数
  const BADGES = [
    { id: 'streak3', g: 'keep', sym: '◆', need: 3 },
    { id: 'streak7', g: 'keep', sym: '◆', need: 7 },
    { id: 'streak30', g: 'keep', sym: '◆', need: 30 },
    { id: 'goal1', g: 'keep', sym: '✓' },
    { id: 'goal4', g: 'keep', sym: '✓', need: 4 },
    { id: 'quest1', g: 'story', sym: '⚑' },
    { id: 'boss1', g: 'story', sym: '♛' },
    { id: 'boss10', g: 'story', sym: '♛', need: 10 },
    { id: 'heroes4', g: 'story', sym: '☗', need: 4 },
    { id: 'legend', g: 'story', sym: '✦' },
    { id: 'crit100', g: 'battle', sym: '★', need: 100 },
    { id: 'crit1000', g: 'battle', sym: '★', need: 1000 },
    { id: 'star1000', g: 'battle', sym: '☆', need: 1000 },
    { id: 'perfect', g: 'battle', sym: '✪' },
    { id: 'elite', g: 'battle', sym: '⚔' },
    { id: 'trial', g: 'train', sym: '♕' },
    { id: 'ftpUp', g: 'train', sym: '↑' },
    { id: 'ride2h', g: 'train', sym: '◷', need: 120 },
    { id: 'km100', g: 'train', sym: '∞', need: 100 },
    { id: 'km1000', g: 'train', sym: '∞', need: 1000 },
    { id: 'gain10k', g: 'train', sym: '▲', need: 10000 },
    { id: 'island', g: 'isle', sym: '◎' },
    { id: 'allRoads', g: 'isle', sym: '✣' },
    { id: 'race3', g: 'isle', sym: '⚐', need: 3 },
  ];
  const GROUPS = ['keep', 'story', 'battle', 'train', 'isle'];
  const newState = () => ({ got: {}, c: { crits: 0, stars: 0, bossWins: 0, eliteWins: 0, heroes: [], roads: [], gain: 0 } });
  const load = st => { const s = newState(); if (st) { Object.assign(s.got, st.got || {}); Object.assign(s.c, st.c || {}); } return s; };

  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  // 週の目標：met[k]＝k 週前（0＝今週）に達成したか（さかのぼって 104 週）。
  // any＝どこかの週で達成した、run＝続けて達成した週の数（今週まで。今週がまだなら先週まで）。目標が無ければ両方なし
  function goalWeeks(recs, goal, now) {
    if (!goal) return { any: false, run: 0 };
    const sunday = d => addDays(d, 6 - ((d.getDay() + 6) % 7));   // その週の日曜（週全体を数える）
    const met = [];
    for (let k = 0; k < 104; k++) { const w = H.week(recs, k === 0 ? now : sunday(addDays(now, -7 * k))); met.push((goal.kind === 'c' ? w.n : w.min) >= goal.n); }
    const runFrom = i => { let n = 0; while (i + n < met.length && met[i + n]) n++; return n; };
    return { any: met.some(Boolean), run: Math.max(runFrom(0), runFrom(1)) };
  }
  // 記録（rq.records）から：走った距離の合計（km）・いちばん長い回（分）
  function fromRecs(recs) {
    let km = 0, maxMin = 0;
    for (const r of recs || []) { km += +r.km || 0; maxMin = Math.max(maxMin, r.min || 0); }
    return { km, maxMin };
  }

  // 今の数（一覧の「あと○」に使う）。facts を足したあとの state で数える
  function progress(st, recs, { goal = null, roadsTotal = Infinity, now = new Date() } = {}) {
    const r = fromRecs(recs), gw = goalWeeks(recs, goal, now), c = st.c;
    return {
      streak3: H.streak(recs, now), streak7: H.streak(recs, now), streak30: H.streak(recs, now), goal4: gw.run, goal1: gw.any ? 1 : 0,
      boss10: c.bossWins, boss1: c.bossWins, heroes4: c.heroes.length, crit100: c.crits, crit1000: c.crits, star1000: c.stars, elite: c.eliteWins,
      ride2h: r.maxMin, km100: r.km, km1000: r.km, gain10k: c.gain, allRoads: c.roads.length,
    };
  }

  // まとめのたびに呼ぶ。facts を数に足し、新しく取れた勲章の ID を返す（取った日も state に入れる）
  function update(st0, facts, recs, { goal = null, roadsTotal = Infinity, now = new Date() } = {}) {
    const st = load(st0), c = st.c, f = facts || {};
    c.crits += f.crits || 0; c.stars += f.stars || 0; c.bossWins += f.bossWins || 0; c.eliteWins += f.eliteWins || 0; c.gain += f.gain || 0;
    for (const h of f.heroes || []) if (!c.heroes.includes(h)) c.heroes.push(h);
    if (f.roads && f.roads.length) { const set = new Set(c.roads); for (const x of f.roads) set.add(x); c.roads = [...set].sort((a, b) => a - b); }
    const p = progress(st, recs, { goal, roadsTotal, now });
    const ok = {
      streak3: p.streak3 >= 3, streak7: p.streak7 >= 7, streak30: p.streak30 >= 30, goal1: p.goal1 > 0, goal4: p.goal4 >= 4,
      quest1: !!f.questDone, boss1: c.bossWins >= 1, boss10: c.bossWins >= 10, heroes4: c.heroes.length >= 4, legend: !!f.legend,
      crit100: c.crits >= 100, crit1000: c.crits >= 1000, star1000: c.stars >= 1000, perfect: !!f.perfect, elite: c.eliteWins >= 1,
      trial: !!f.trial, ftpUp: !!f.ftpUp, ride2h: p.ride2h >= 120 || (f.sec || 0) >= 7200, km100: p.km100 >= 100, km1000: p.km1000 >= 1000,
      gain10k: c.gain >= 10000, island: !!f.islandLoop, allRoads: c.roads.length >= roadsTotal, race3: f.raceRank != null && f.raceRank <= 3,
    };
    const day = f.day || H.dayKey(now), fresh = [];
    for (const b of BADGES) if (ok[b.id] && !st.got[b.id]) { st.got[b.id] = day; fresh.push(b.id); }
    return { state: st, fresh };
  }

  const api = { BADGES, GROUPS, newState, load, update, progress, goalWeeks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).badges = api;
})(typeof window !== 'undefined' ? window : globalThis);
