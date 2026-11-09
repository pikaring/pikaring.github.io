/* 旅人（G2）：記録がなくても出る、生成された架空のライダー（docs/impl-ghost.md）。画面に触らない純粋な関数。
   種から作るので、同じ種なら同じ旅人になる（テストで再現できる）。網の上を、本物と同じ物理（phys.physStep）で進む：
   FTP の 60〜80% のパワー（旅人ごとに決める。基準の FTP は 200 W ± 40 W。プレイヤーの FTP には依存しない）、体重＋バイク 80 kg、
   勾配は本物の勾配（高さ0.2倍）、下りは最大 100 km/h（安全の上限。RD.MAX_SPEED）。分かれ道は、本物と同じ「まだ通っていない道を優先、同じなら種で選ぶ」で進む。 */
(function (root) {
  const RN = typeof require !== 'undefined' ? require('./roadnet.js') : root.RQ.roadnet;
  const RD = typeof require !== 'undefined' ? require('./ride.js') : root.RQ.ride;
  const PH = typeof require !== 'undefined' ? require('../trainer/phys.js') : root.RQ.phys;
  const GH = typeof require !== 'undefined' ? require('./ghost.js') : root.RQ.ghost;
  const TK = typeof require !== 'undefined' ? require('./talks.js') : root.RQ.talks;
  const DT = typeof require !== 'undefined' ? require('./data.js') : root.RQ.data;
  const HEROES = ['warrior', 'wizard', 'monk', 'priest'];
  const MASS = 80, HOURS = 4, N = 6, LEAD_MIN = 20, LEAD_MAX = 90, SELF_MAX = 3, IMPORTED_MAX = 3, REAL_MAX = 4, SHARE_MAX = 10, RIDE_MAX = 11, SLOT = 18;   // SHARE_MAX・RIDE_MAX：ゲーム（dummies: false）で一緒に走るほかの人の記録・自分と合わせた上限（2026-10-28 ユーザー判断「戦闘中は見えないので人数が増えても問題ない」）。SLOT：出発をずらす席の間（秒）   // 自分の記録は3人まで、ほかの人の記録も3人まで、合わせて4人まで（旅人が2人以上は出る）

  // 種から乱数（mulberry32）
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const intIn = (r, a, b) => a + Math.floor(r() * (b - a + 1));

  // 旅人の見た目と名前（2026-10-23 ユーザー判断：主人公の見た目のゴーストは、FIT から作った記録（自分 G1・共有 G3）だけ。旅人（ダミー G2）は全部 NPC の後ろ姿）。
  // RQ.npcArt[ID].back がある NPC だけ（妖精・猫など後ろ姿の無い人は出さない）。名前は NPC の名前（talks.js の NPCS。女王は「火の島の女王」。女王は道端には立たず、旅人として走る）。
  // used：いま出ている名前（重ならないように）。実行のときに npcArt を読む（絵の一覧は index.html の後ろで読み込まれる）。→ { hero（絵の ID）, name }。
  // 絵の一覧がまだ読めていないとき（node のテストなど）は null（旅人は出さない）。fallbackHero：レースの相手の人数を埋めるときだけ、絵が無ければ主人公の絵にする
  function npcIds() { const art = (root.RQ && root.RQ.npcArt) || {}; return Object.keys(art).filter(id => art[id] && art[id].back).sort(); }
  const npcName = id => (TK.NPCS[id] && TK.NPCS[id].n) || (id === 'queen' ? capName(DT.WORLD.queen) : id);
  const capName = s => (root.RQ && root.RQ.i18n ? root.RQ.i18n.cap(s) : s);   // 頭の上の名前：英語の「the Queen」を大文字に
  const NOT_TRAVELLER = new Set(['elder']);
  // 旅人の見た目と名前（2026-10-26 ユーザー判断：旅人も主人公4人の 3D モデルのゴーストにする。NPC の後ろ姿の板は出さない）。主人公は種で決め、名前は GH.NAMES から（used にある名前は避ける）。
  // allow は使わない（呼び出しとの互換のため残す）。fallbackHero も同じ（いつでも主人公の見た目）
  function pickLook(r, used = new Set(), fallbackHero = false, allow = null) {
    const pool = GH.NAMES.filter(x => !used.has(x)), list = pool.length ? pool : GH.NAMES;
    return { hero: HEROES[Math.floor(r() * 4)], name: list[Math.floor(r() * list.length)] };
  }

  // 旅人1人：start（{ road, dir, s }）から sec 秒ぶんを走らせて、ゴーストにする。opts：{ seed, id, name, hero, lead, born, power（決めたパワー W。省けば FTP の60〜80%）, v0（走り出しの速さ m/s。省けば止まった所から）}
  // force：分かれ道で、なるべくこの道（道の id の Set）へ進む（RD.createRide の force。出会う旅人を、プレイヤーの道へ向かわせるとき）
  function makeTraveller(net, start, { seed = 1, sec = HOURS * 3600, id, name, hero, lead, born, power, v0 = 0, force = null } = {}) {
    const r = rng(seed), ftp = 200 + (r() - 0.5) * 80, pct = 0.6 + r() * 0.2, base = power != null ? power : ftp * pct, period = 60 + r() * 120, phase = r() * 6.28;
    const tieRng = rng(seed ^ 0x9e3779b9);
    const ride = RD.createRide({ net, start, minutes: 10000, quiet: true, force, tie: () => (tieRng() < 0.5 ? 'left' : 'right') });
    let v = v0; const samples = [];
    for (let t = 0; t < sec; t++) {
      const power = base * (1 + 0.12 * Math.sin(t / period * 6.28 + phase));   // ゆっくり強弱をつける
      const g = RD.gradeAt(net.roads[ride.road], ride.s, ride.dir);
      for (let k = 0; k < 4; k++) v = Math.min(RD.MAX_SPEED, PH.physStep(v, power, g, MASS, 0.25));
      RD.step(ride, 1, v);
      const i = RD.info(ride); samples.push({ rd: i.road, rs: Math.round(i.s), rdir: i.dir });
    }
    const nm = name || GH.NAMES[intIn(r, 0, GH.NAMES.length - 1)], hr = hero || HEROES[intIn(r, 0, 3)];
    return GH.fromSamples(net, samples, { id: id || `t${seed}`, name: nm, hero: hr, kind: 'traveller', lead, born });
  }

  // 旅の開始のとき、一緒に走るゴースト n 人（既定 6）を選ぶ。
  //   self：自分の記録（G1）。同じコースのものを新しい順に最大3人（向きは問わない。右回りと左回りは出発地が逆なのですれ違う）
//   imported：ほかの人の記録（G3。サーバーから取ってきたもの。RQ.ghost.fromServer を通したもの）。同じコースのものを最大3人。自分の記録と合わせて4人まで
  //   旅人（G2）で残りを埋める（dummies: false なら埋めない。旅では出会う形で出すので false）。会えるように出す：2人はプレイヤーと同じ出発点・向きで、20〜90秒先を走る（追いつく）。
  //   2人はコースの向かい側（片道は反対の端、周回は半周先）から対向で出す。残りは網の上のランダムな分かれ道と向きから。
  // { net, course, side, start, self = [], seed, n = N, sec } → [ゴースト]
  function pickGhosts({ net, course, side, start, self = [], imported = [], seed = 1, n = N, sec = HOURS * 3600, dummies = true }) {
    const out = [], r = rng(seed ^ 0x5bd1e995);
    const capImp = dummies ? IMPORTED_MAX : SHARE_MAX, capReal = dummies ? REAL_MAX : RIDE_MAX, room = dummies ? n : capReal;
    const mine = self.filter(g => g && GH.valid(net, g) && g.course === course.id).sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, Math.min(SELF_MAX, room));
    const others = imported.filter(g => g && GH.valid(net, g) && g.course === course.id).sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, Math.max(0, Math.min(capImp, capReal - mine.length, room - mine.length)));
    // 自分の記録・ほかの人の記録は、旅を始めてからの経過でそろえるので、そのままだとスタート地点に重なって止まって見える。
    // 出発の時刻をずらす（2026-10-22 ユーザー判断）：何人かは先に出発していて道の先に、何人かはあとから来る。lead が＋なら先（その秒数ぶん進んだ所から）、−ならあとから現れる。席は ±18 秒おき（同時に出る人はいない）。レースの相手（race.js）はずらさない
    // 席の決め方（2026-10-28 ユーザー判断：人数が増えてもスタート直後に団子にならない・タイムの近い人を近くに）：記録の平均の速さを、自分の速さ（自分の記録の平均。無ければ全員のまんなか）と比べ、
    //   遅い人は先（＋の席）・速い人はあと（−の席）に置き、速さが近い人ほど自分に近い席にする（速さが近い人は長く近くを走り、遅い人は追いつき、速い人は追いついてくる）。ほぼ同じ速さ（±2%）の人は、空いている側の近い席へ
    out.push(...mine.map(g => ({ ...g, kind: 'self' })), ...others.map(g => ({ ...g, kind: 'imported' })));
    const speed = g => { const p = GH.progressAt(net, g, g.sec); return g.sec > 0 ? p / g.sec : 0; };
    const vs = out.map(speed), mid = arr => { const a = arr.filter(v => v > 0).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0; };
    const ref = (mine.length ? vs.slice(0, mine.length).reduce((a, v) => a + v, 0) / mine.length : 0) || mid(vs) || 1;
    const tie = out.map(() => r());
    const ord = out.map((g, i) => ({ i, rel: vs[i] / ref - 1 })).sort((a, b) => Math.abs(a.rel) - Math.abs(b.rel) || tie[a.i] - tie[b.i]);
    const taken = { 1: 0, '-1': 0 };   // 席は側ごとに近い順（11 人が片側でも ±198 秒まで）
    for (const o of ord) {
      let side = o.rel < -0.02 ? 1 : o.rel > 0.02 ? -1 : (taken[1] <= taken[-1] ? 1 : -1);
      taken[side]++; out[o.i].lead = side * SLOT * taken[side];
    }
    const real = out.length;
    if (!dummies) return out;   // 旅人は出さない（旅人は旅の途中で、見える範囲に出会う形で出す：renderer/game/encounters.js）
    const make = (st, extra) => makeTraveller(net, st, { seed: Math.floor(r() * 2 ** 31), sec, ...extra });
    const other = RN.courseOpposite(net, course, side);   // 向かい側（片道は反対の端、周回は半周先）から、反対向きに出す
    const plan = [
      () => make(start, { lead: intIn(r, LEAD_MIN, LEAD_MAX) }), () => make(start, { lead: intIn(r, LEAD_MIN, LEAD_MAX) }),
      () => make(other, {}), () => make(other, {}),
    ];
    while (out.length < n) {
      const k = out.length - real;
      if (k < plan.length) out.push(plan[k]());
      else { const rd = net.roads[Math.floor(r() * net.roads.length)], dir = r() < 0.5 ? 1 : -1; out.push(make({ road: rd.id, dir, s: dir > 0 ? 0 : rd.len }, {})); }
    }
    // 名前は重ならないように（同じ旅で同じ名前が並ばない）
    const used = new Set(out.map(g => g.name)), pool = GH.NAMES.filter(x => !used.has(x));
    const seen = new Set();
    for (const g of out) { if (seen.has(g.name) && g.kind === 'traveller' && pool.length) g.name = pool.shift(); seen.add(g.name); }   // 人の記録の名前は変えない（旅人のほうを変える）
    return out.map((g, i) => ({ ...g, id: g.kind === 'traveller' ? `t${i}-${g.id}` : g.id }));
  }

  const api = { N, HOURS, SHARE_MAX, RIDE_MAX, SLOT, makeTraveller, pickGhosts, pickLook, npcIds, npcName, rng, NOT_TRAVELLER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).travellers = api;
})(typeof window !== 'undefined' ? window : globalThis);
