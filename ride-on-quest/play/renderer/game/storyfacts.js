/* Strava の説明文を「冒険記」にするための、その日の旅の情報を集める（試作。2026-11-03）。画面に触らない。
   集めたものはゴースト共有サーバーの POST /story（server/src/story.js）へ送り、Claude Haiku 5.5 が文にする。
   送るのは、ゲームの中のこと（主人公・倒した敵・ボス・通った道と地名・レベル）と、トレーニングの数値（時間・距離・獲得標高・NP・IF・TSS・kJ）だけ。
   心拍は送らない（けがや体調の診断をしないため）。名前（ゴーストの名前）・日時・本当の位置も送らない。
   形は server/src/story.js の checkFacts と同じ（サーバーでも同じ長さの上限で確かめ直す）。 */
(function (root) {
  const V = 1;
  const LIMIT = { str: 40, battles: 20, foes: 4, route: 15, places: 15, items: 6 };
  const KINDS = ['quest', 'ride', 'trial', 'race', 'outing'];

  const str = (s, n = LIMIT.str) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);
  const num = (x, d = 0) => (Number.isFinite(+x) && x !== null && x !== '' ? Math.round(+x * 10 ** d) / 10 ** d : null);
  const strs = (a, n) => (Array.isArray(a) ? a.map(s => str(s)).filter(Boolean).slice(0, n) : []);

  // 1秒ごとの記録（rd：道の添え字）から、通った道を通った順に（同じ道が続くところは1つ）。
  // 1つの道に minSec 秒より短くしかいなかったもの（分かれ道をかすめただけ）は入れない。roadName(i) → 画面の名前
  function routeOf(samples, roadName, minSec = 20) {
    const runs = [];
    for (const s of samples || []) {
      if (s.rd == null) continue;
      const last = runs[runs.length - 1];
      if (last && last.rd === s.rd) last.n++; else runs.push({ rd: s.rd, n: 1 });
    }
    const out = [];
    for (const r of runs) {
      if (r.n < minSec) continue;
      const nm = roadName(r.rd);
      if (nm && out[out.length - 1] !== nm) out.push(nm);
    }
    return out;
  }

  // 通った地名を、通った順に（同じ名前は1回）。roads：道の網の roads（各 places：{ name, s0, s1, hidden }）。placeName(ja) → 画面の名前
  function placesOf(samples, roads, placeName = n => n) {
    const out = [];
    for (const s of samples || []) {
      const rd = s.rd != null && roads && roads[s.rd]; if (!rd || !rd.places) continue;
      for (const p of rd.places) {
        if (p.hidden || s.rs < p.s0 || s.rs > p.s1) continue;
        const nm = placeName(p.name);
        if (nm && !out.includes(nm)) out.push(nm);
      }
    }
    return out;
  }

  // 旅（course.js の run）の戦いを、名前の形に。enemyName(id) → 画面の名前
  function battlesOf(stats, enemyName) {
    return ((stats && stats.battles) || []).map(b => ({
      foes: [...new Set((b.foes || []).map(enemyName).filter(Boolean))],
      boss: b.kind === 'boss',
      won: !!b.defeated, skipped: !!b.skipped,   // 戦いごとの星は送らない（2026-11-03：Claude が別の戦いの星と取り違えた。合計の stars だけ送る）
    }));
  }

  // まとめる。o の項目はどれも省ける（その種類の旅に無いものは null / 空）。
  //   kind：quest（旅）・ride（フリーライド）・trial（女王の試練）・race（レース）・outing（続けて走った合算）
  //   lang・island・hero { name, sex, plan }・min・diff・cleared・level { from, to }・items・battles・wins・fled・stars・crits・score・
  //   course・route・places・km・gain・np・avgW・IF・tss・kj・trial { ftp, prev }・race { rank, total, laps, time }
  function collect(o = {}) {
    const hero = o.hero && str(o.hero.name) ? { name: str(o.hero.name), sex: o.hero.sex === 'f' ? 'f' : 'm', plan: str(o.hero.plan) } : null;
    const lv = o.level && Number.isFinite(+o.level.from) ? { from: num(o.level.from), to: num(o.level.to) } : null;
    return {
      v: V, lang: o.lang === 'en' ? 'en' : 'ja', kind: KINDS.includes(o.kind) ? o.kind : 'quest',
      island: str(o.island), hero, min: num(o.min), diff: str(o.diff), cleared: o.cleared == null ? null : !!o.cleared,
      level: lv, items: strs(o.items, LIMIT.items),
      battles: (o.battles || []).slice(0, LIMIT.battles).map(b => ({ foes: strs(b.foes, LIMIT.foes), boss: !!b.boss, won: !!b.won, skipped: !!b.skipped })),
      wins: num(o.wins), fled: num(o.fled), stars: num(o.stars), crits: num(o.crits), score: num(o.score),
      course: str(o.course), route: strs(o.route, LIMIT.route), places: strs(o.places, LIMIT.places),
      km: num(o.km, 1), gain: num(o.gain), np: num(o.np), avgW: num(o.avgW), IF: num(o.IF, 2), tss: num(o.tss), kj: num(o.kj),
      trial: o.trial && Number.isFinite(+o.trial.ftp) ? { ftp: num(o.trial.ftp), prev: num(o.trial.prev) } : null,
      race: o.race && Number.isFinite(+o.race.rank) ? { rank: num(o.race.rank), total: num(o.race.total), laps: num(o.race.laps), time: str(o.race.time, 12) } : null,
    };
  }

  // Strava の文（1行目がタイトル、空行、そのあとが説明）に冒険記を入れる：説明の一番上に冒険記、今の数値の行とリンクはその下
  // （2026-11-03 ユーザー判断「a」）。冒険記が無ければそのまま
  function withStory(text, story) {
    const st = typeof story === 'string' ? story.trim() : '';
    if (!st) return text;
    const [title = '', , ...rest] = String(text || '').split('\n');
    return [title, '', st, '', ...rest].join('\n');
  }

  const api = { V, LIMIT, KINDS, collect, routeOf, placesOf, battlesOf, withStory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).storyFacts = api;
})(typeof window !== 'undefined' ? window : globalThis);
