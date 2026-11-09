/* 道端の NPC の話の選び方（2026-10-22 ユーザー判断。docs/npc-talks.md §2）。画面に触らない純粋な関数。
   話は3種類（セリフは npclines.js）：island＝島の話（今いる所に合うもの）、tips＝トレーニングのひとこと（キャラのプラン）、story＝物語（聞いた所の次）。
   くり返さない：同じ旅（続けて走るも含めて1回）の中では同じセリフを出さない（log.seen）。旅をまたいでも直近 RECENT 本は選ばない（log.recent）。
   直前の CHARS 人は続けて出さない（log.chars。直前の1人は、合う話が無くても出さない。次の戦いを予告する人＝course.js も同じ記録に入れる。2026-10-29）。同じ人は1回の旅で PER_OUTING 回まで（2026-10-23）。物語は log.story の話から進む（1回の旅に1つ。最後まで聞いたら最初から）。
   log は保存する（app.js が rq.talkLog に。seen は旅のたびに空にする）。
   フリーライド：島と物語だけを、FREE.first 秒から FREE.every 秒ごとに交互に（物語は1回に1つまで。freeKind）。
   地域（2026-10-28 ユーザー判断）：村人は敵と同じく、今いる所の地域（RQ.ride.areaAt の coast・forest・summit）に住む人（talks.js の NPCS の area）だけが立つ。
   地域に合う話が無ければ、ほかの地域から借りずに話さない（敵と同じ）。area が分からなければ（null）地域で絞らない。 */
(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const L = isNode ? require('./npclines.js') : root.RQ.npcLines;
  const T = isNode ? require('./talks.js') : root.RQ.talks;
  const areaOf = char => (T.NPCS[char] || {}).area || null;   // 住む地域（長老は無し）
  const RECENT = 80, CHARS = 2;
  // 2026-10-23 ユーザー指摘（ワルキューレが次々に出て加護を与える）：同じ人は1回の旅（続けて走るも含めて）で PER_OUTING 回まで。
  // tips の加護は1回の旅で BUFF_MAX 回まで（course.js）
  const PER_OUTING = 2, BUFF_MAX = 2;
  const FREE = { first: 180, every: 300 };   // フリーライド：最初の1人は3分ほど、そのあと5分に1人（2026-10-22 ユーザー判断）
  const NEAR_PLACE = 400, NEAR_LANDMARK = 300;   // 今いる所の札：地名はこの m 以内、ランドマークはこの m 以内
  const TERRAIN = ['坂', '下り', '海辺'];

  // すべてのセリフ：{ id, char, kind, at（札の配列）| ch | plan, lines（[[話し手, 文], …]）}
  const toLines = rows => rows.map(t => t.startsWith('→') ? ['hero', t.slice(1)] : t.startsWith('＃') ? ['sys', t.slice(1)] : ['npc', t]);
  const ALL = [];
  for (const [char, d] of Object.entries(L.LINES)) {
    if (!T.NPCS[char]) continue;   // 村人でない人（主人公になった傭兵・ワルキューレ・エルフなど）のセリフは選ばない
    (d.island || []).forEach(([at, ...rows], i) => ALL.push({ id: `${char}:island:${i}`, char, kind: 'island', at: [].concat(at), lines: toLines(rows) }));
    (d.story || []).forEach(([ch, ...rows], i) => ALL.push({ id: `${char}:story:${i}`, char, kind: 'story', ch, lines: toLines(rows) }));
    (d.tips || []).forEach(([plan, ...rows], i) => ALL.push({ id: `${char}:tips:${i}`, char, kind: 'tips', plan, lines: toLines(rows) }));
  }
  const STORY_MAX = Math.max(...ALL.filter(x => x.kind === 'story').map(x => x.ch));

  const newLog = () => ({ recent: [], seen: [], chars: [], story: 1 });
  // 保存した記録を読む（壊れていたら作り直す）。seen は旅のたびに空にする
  function loadLog(o) {
    const l = newLog();
    if (o && typeof o === 'object') {
      if (Array.isArray(o.recent)) l.recent = o.recent.filter(x => typeof x === 'string').slice(-RECENT);
      if (Number.isInteger(o.story) && o.story >= 1 && o.story <= STORY_MAX) l.story = o.story;
      if (Array.isArray(o.chars)) l.chars = o.chars.slice(-CHARS);
    }
    return l;
  }

  // 今いる所の札（合うものから順に）：近い地名・ランドマーク（近い順）→ 坂・下り・海辺 → どこでも。
  // pos：{ lat, lon, ele, grade（%）}。net：道の網（isl・cell）。places：mapData.places（{ 名前: [r, c] }）。landmarks：mapData.landmarks（{ name, r, c }）
  function whereTags(pos, net, places = {}, landmarks = []) {
    const tags = [], isl = net.isl, cell = net.cell;
    const r = (pos.lat - isl.lat0) / (isl.lat1 - isl.lat0) * (isl.rows - 1), c = (pos.lon - isl.lon0) / (isl.lon1 - isl.lon0) * (isl.cols - 1);
    const near = [];
    for (const [name, [pr, pc]] of Object.entries(places)) { const d = Math.hypot(pr - r, pc - c) * cell; if (d <= NEAR_PLACE) near.push([d, name]); }
    for (const lm of landmarks) { if (!lm.name || lm.r == null) continue; const d = Math.hypot(lm.r - r, lm.c - c) * cell; if (d <= NEAR_LANDMARK) near.push([d, lm.name]); }
    near.sort((a, b) => a[0] - b[0]).forEach(([, n]) => { if (!tags.includes(n)) tags.push(n); });
    if (pos.grade >= 4) tags.push('坂'); else if (pos.grade <= -4) tags.push('下り');
    if (pos.ele != null && pos.ele < 25) tags.push('海辺');
    tags.push('どこでも');
    return tags;
  }

  // 選ぶ。kind：'island' | 'tips' | 'story'。ctx：{ plan, tags, log, rng }。合うものが無ければ null
  // 道中には出さない人（2026-10-24 ユーザー判断「長老は道中で出ない」）：長老は旅の始め（今日の話）と終わり（帰り道）のあいさつだけ。
  // 長老のセリフ（npclines.js の elder）は残してあるが、道端の話（旅の回復・フリーライド）には選ばない
  const NEVER = ['elder'];
  // exclude：ほかに選ばない人。area：今いる所の地域（その地域に住む人だけ。null なら絞らない）
  // 自分のひとことがまだ無いプランは、近いプランのものを借りる（2026-10-27：ワルキューレ・エルフを主人公にしたとき。専用のセリフを足したら外す）
  const TIPS_OF = { vo2: 'allround', sprint: 'allround', sweetspot: 'endure', climb: 'endure' };   // 侍（スイートスポット）・傭兵（登坂）は、長めの閾値に近い持続力のものを借りる
  const tipsPlan = plan => TIPS_OF[plan] || plan;
  function pick(kind, { plan = null, tags = ['どこでも'], log = newLog(), rng = Math.random, exclude = [], area = null } = {}) {
    let groups;   // 合うものの組（先の組ほど合う）
    if (kind === 'island') groups = tags.map(t => ALL.filter(x => x.kind === 'island' && x.at.includes(t)));
    else if (kind === 'tips') groups = [ALL.filter(x => x.kind === 'tips' && (x.plan === tipsPlan(plan) || x.plan === '*'))];
    else if (kind === 'story') {   // 聞いた所の話。その話を持つ人がいなければ、次の話へ
      groups = [];
      for (let k = 0; k < STORY_MAX; k++) { const ch = (log.story - 1 + k) % STORY_MAX + 1; groups.push(ALL.filter(x => x.kind === 'story' && x.ch === ch)); }
    } else return null;
    // ゆるめる順：直近の人も直近のセリフも避ける → 直近のセリフだけ避ける → 同じ旅で出たものだけ避ける
    // 同じ旅で PER_OUTING 回出た人は、どのゆるめ方でも選ばない（合う話が無ければ話さない）
    const times = c => log.seen.filter(id => id.startsWith(c + ':')).length;
    const last = log.chars[log.chars.length - 1];   // 直前に話した人は、どのゆるめ方でも続けて出さない（2026-10-29 試走 No.24。合う話が無ければ話さない）
    const rules = [x => !log.recent.includes(x.id) && !log.chars.includes(x.char), x => !log.chars.includes(x.char), x => x.char !== last]
      .map(r => x => !NEVER.includes(x.char) && !exclude.includes(x.char) && (!area || areaOf(x.char) === area) && times(x.char) < PER_OUTING && r(x));
    for (const ok of rules) {
      for (const g of groups) {
        const c = g.filter(x => !log.seen.includes(x.id) && ok(x));
        if (!c.length) continue;
        // 旅をまたいでくり返すときは、いちばん前に出たものから
        const fresh = c.filter(x => !log.recent.includes(x.id)), list = fresh.length ? fresh : [c.reduce((a, b) => (log.recent.indexOf(a.id) <= log.recent.indexOf(b.id) ? a : b))];
        return list[Math.floor(rng() * list.length) % list.length];
      }
    }
    return null;
  }

  // 話したことを覚える（物語なら次の話へ）
  function remember(log, x) {
    if (!x) return;
    log.seen.push(x.id);
    log.recent = log.recent.filter(id => id !== x.id).concat(x.id).slice(-RECENT);
    log.chars = log.chars.filter(c => c !== x.char).concat(x.char).slice(-CHARS);
    if (x.kind === 'story') log.story = x.ch % STORY_MAX + 1;
  }

  // 回復の長さで、話す種類を決める（予告は最後に1つ。'preview' は course.js が作る）。docs/npc-talks.md §2.1
  function fieldKinds(sec, rng = Math.random) {
    if (sec >= 300) return ['story', 'island', 'tips', 'preview'];
    if (sec >= 180) return ['island', 'tips', 'preview'];
    if (sec >= 90) return [rng() < 0.5 ? 'island' : 'tips', 'preview'];
    return ['preview'];
  }
  // フリーライドの n 人目（0 から）の種類と時刻（走り始めてからの秒）。島と物語を交互に、物語は1回に1つまで
  const freeAt = n => FREE.first + n * FREE.every;
  const freeKind = (n, storyDone) => (n % 2 === 1 && !storyDone ? 'story' : 'island');

  const api = { areaOf, NEVER, RECENT, CHARS, PER_OUTING, BUFF_MAX, FREE, ALL, STORY_MAX, TERRAIN, tipsPlan, newLog, loadLog, whereTags, pick, remember, fieldKinds, freeAt, freeKind };
  if (isNode) module.exports = api;
  else (root.RQ = root.RQ || {}).npcTalk = api;
})(typeof window !== 'undefined' ? window : globalThis);
