/* 女王の試練のペースメーカー（2026-10-23 ユーザー要望。docs/impl-ghost.md）。その時の目標パワー（trial.target）で走ったときの速さで進む 3D のキャラクター（主人公の職業。村人・女王は出ない）が、
   主人公の横を走る。主人公と同じ物理（phys.physStep、同じ体重）と同じ道（試練の周回路）。主人公のパワーが目標より低いと前に出ていき、高いと下がる
   （横に並んでいれば目標どおり、と見て分かる）。目標が上がるたび（1分ごと。ウォームアップは0段目）に、違う NPC が横に並ぶ：新しい人は少し後ろから速く走ってきて
   横に並び、前の人は前へ走り去って（速く走り、薄れて）消える。見た目だけ（試練の判定・FTP・FIT は変えない）。画面にも時計にも触らない。
   create({ net, seed }) → { tick(dt, ride, v, feed, mass), frames(ride, me)：ゴーストの frame() と同じ形の配列 }。
   feed：{ target（W）, level（0＝ウォームアップ、1〜＝ランプの段）, done }。ride：主人公の旅の状態（RQ.ride）。v：主人公の速さ（m/s）。 */
(function (root) {
  const RD = typeof require !== 'undefined' ? require('./ride.js') : root.RQ.ride;
  const GH = typeof require !== 'undefined' ? require('./ghost.js') : root.RQ.ghost;
  const PL = typeof require !== 'undefined' ? require('./pacerlines.js') : root.RQ.pacerLines;
  const PH = typeof require !== 'undefined' ? require('../trainer/phys.js') : root.RQ.phys;
  // 加わる位置（主人公から後ろへ m）、追いつく間の力の倍率、去る人：道の外（右）へよけて止まり（ブレーキ m/s²・よける幅 m・秒）、そのまま後ろへ消える（止まってから薄れ始める秒・薄れる秒）。
  // 除く職業（自分の職業は、create の self で除く）
  const CFG = { behind: 30, boost: 2.2, enterMax: 25, brake: 3.5, sideM: 3.2, sideSec: 2, fadeAt: 4, fadeSec: 3, exclude: [], showM: 250, tagM: 120 };
  // ならぶのは、主人公の 3D のキャラクターだけ（2026-10-26 ユーザー判断：村人（NPC の板）も女王も出さない。理由「村人に負けることがないから」）。
  // 目標が上がるたび（1分ごと）に、自分と違う職業が順に入れ替わる。明日以降に増える「主人公候補の4人」は、CAST に足せば顔ぶれに入る（入れ替えの順は、足すときに決める）。
  // 目標の強さでは決めない（村人の表 LINEUP はやめた）。420 W 以上でも並び続ける
  const CAST = ['warrior', 'wizard', 'monk', 'priest', 'valkyrie', 'elf', 'samurai', 'mercenary'];   // 主人公4人のあとに、主人公候補（ワルキューレ・エルフ・侍・傭兵）を、3D ができた順に足した
  // 次に並ぶ職業：自分（self）と、いま並んでいる人（cur）を除いて、CAST の順に回す。i：何人目か
  function nextHero(i, self, cur, exclude = []) {
    const ok = CAST.filter(h => h !== self && !exclude.includes(h)); if (!ok.length) return null;
    const pick = ok[i % ok.length]; return pick === cur && ok.length > 1 ? ok[(i + 1) % ok.length] : pick;
  }

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function create({ net, seed = 1, cfg = {}, self = null }) {   // self：主人公の職業（これとは違う職業が並ぶ）
    const C = { ...CFG, ...cfg }, r = rng(seed ^ 0x3c6ef372);
    const names = GH.NAMES.slice().sort(() => r() - 0.5);   // 頭の上の名前（並ぶたびに違う人）
    const runners = [];   // { id, name, hero, ride, v, phase: 'enter' | 'pace' | 'exit', t, alpha, level }
    let cur = null, n = 0, events = [], doneLevel = null;

    function spawn(ride, level, first, pv, target) {
      if (!first && pv >= RD.MAX_SPEED * 0.9) first = true;   // 主人公が速さの上限に近いと、後ろから追いつけない（上限は同じ）ので、横から加わる
      const hero = nextHero(n, self, cur && cur.hero, C.exclude); if (!hero) return null;
      const name = names[n % names.length];
      const st = first ? { road: ride.road, dir: ride.dir, s: ride.s } : RD.stateAt(ride, -C.behind);
      const rr = RD.createRide({ net, start: st, minutes: 24 * 60, force: ride.force, quiet: true });
      rr.ridden = ride.ridden - (first ? 0 : C.behind);
      const run = { id: `pacer-${n++}`, name, hero, ride: rr, v: first ? (pv >= RD.MAX_SPEED * 0.9 ? pv : 0) : Math.max(6, pv * 1.3), phase: first ? 'pace' : 'enter', t: 0, alpha: 1, side: 0, level, target, line: PL.line(hero, target, r()) };
      runners.push(run); events.push({ type: 'arrive', id: run.id, name: run.name, hero, target, line: run.line }); return run;
    }

    function tick(dt, ride, v, feed, mass = 84) {
      events = []; if (!(dt > 0)) return events;
      if (feed && !feed.done && feed.level !== doneLevel) {   // 段が変わった：前の人は去り、新しい人が加わる（420 W 以上はだれも加わらない）
        doneLevel = feed.level;
        const had = !!cur; if (cur) { cur.phase = 'exit'; cur.t = 0; }
        cur = spawn(ride, feed.level, !had, v, feed.target);
      } else if ((!feed || feed.done) && cur) { cur.phase = 'exit'; cur.t = 0; cur = null; }
      for (let i = runners.length - 1; i >= 0; i--) {
        const p = runners[i]; p.t += dt;
        const rd = p.ride;
        if (p.phase === 'exit') p.v = Math.max(0, p.v - C.brake * dt);   // 道の外へよけて止まる（力は出さない）
        else {
          const target = feed && feed.target || p.target || 100, power = target * (p.phase === 'enter' ? C.boost : 1);
          for (let k = Math.ceil(dt / 0.05), h = dt / k; k > 0; k--) p.v = Math.min(RD.MAX_SPEED, PH.physStep(p.v, power, RD.gradeAt(net.roads[rd.road], rd.s, rd.dir), mass, h));
        }
        RD.step(rd, dt, p.v);
        if (p.phase === 'enter' && (rd.ridden >= ride.ridden || p.t > C.enterMax)) { p.phase = 'pace'; p.v = Math.min(p.v, Math.max(v, 1)); }   // 横に並んだ：速さを主人公に合わせて、行きすぎない
        if (p.phase === 'exit') {   // 右へよけて止まる → 後ろへ置いていかれ、薄れて消える
          p.side = Math.min(C.sideM, C.sideM * p.t / C.sideSec);
          p.alpha = Math.max(0, 1 - Math.max(0, p.t - C.fadeAt) / C.fadeSec);
          if (p.t >= C.fadeAt + C.fadeSec) runners.splice(i, 1);
        }
      }
      return events;
    }

    // 画面に渡す形：ゴーストの frame() の1人ぶんと同じ（pacer: true と alpha を足す）。me：主人公の位置 { lat, lon }
    function frames(me) {
      const out = [];
      for (const p of runners) {
        const rd = p.ride, road = net.roads[rd.road], q = RD.pointAt(road, rd.s), q2 = RD.pointAt(road, Math.max(0, Math.min(road.len, rd.s + rd.dir * 3)));
        const hd = (q2.lat !== q.lat || q2.lon !== q.lon) ? [(q2.lon - q.lon) * 111320 * Math.cos(q.lat * Math.PI / 180), (q2.lat - q.lat) * 111320] : null;
        const m = GH.meters(me, q);
        out.push({ id: p.id, name: p.name, hero: p.hero, kind: 'pacer', lat: q.lat, lon: q.lon, face: 'back', show: m <= C.showM, tag: m <= C.tagM, m, map: true, hd, pacer: true, alpha: p.alpha, side: p.side, phase: p.phase, d: rd.ridden });
      }
      return out;
    }
    return { tick, frames, active: () => cur, runners: () => runners.slice() };
  }

  const api = { CFG, CAST, nextHero, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).pacemaker = api;
})(typeof window !== 'undefined' ? window : globalThis);
