/* 出会う旅人（2026-10-22 ユーザー判断：「ダミーなら見えている範囲で適当に会えばいい」。docs/impl-ghost.md）。
   旅人（G2。架空のライダー）は、決まった道のりを最初から走らせず、プレイヤーの見えている範囲に、ときどき出す：
     pass（追い越す）     ：道の先（同じ向き）に出す。自分より遅い。追いついて抜く
     overtaken（追い越される）：道の後ろ（同じ向き）に出す。自分より速い。抜かれて先へ行く
     oncoming（対向）     ：道の先に、反対向きで出す。すれちがう
   見えなくなったら（遠くへ行った・長く居すぎた）消して、少し間をあけて次の人を出す。速さは今の旅人の物理（phys.physStep、体重＋バイク 80 kg）で、
   パワーは「そのときの自分のパワー」のおよその割合（pass 0.45〜0.6、overtaken 1.3〜1.6）か、FTP の60〜80%（oncoming）。
   記録（自分・ほかの人・レースのゴースト）は今のまま。ここが出し入れするのは、渡された ghosts の配列の中の、旅人だけ（id が d で始まる）。
   画面にも時計にも触らない。create({ net, ghosts, seed }) → { tick(clock, ride, power, opts), active() }。
   tick：clock＝旅を始めてからの経過（秒）、ride＝RQ.ride の旅の状態、power＝いまのパワー（W）、opts.hold＝true のとき（戦闘中など）は新しく出さない（戦闘が終わって戻ったら、5〜12 秒後に出す。戦闘中はゴーストを隠すので、フィールドで会えるように） */
(function (root) {
  const RD = typeof require !== 'undefined' ? require('./ride.js') : root.RQ.ride;
  const GH = typeof require !== 'undefined' ? require('./ghost.js') : root.RQ.ghost;
  const TV = typeof require !== 'undefined' ? require('./travellers.js') : root.RQ.travellers;
  // first：最初に出すまでの秒、gap：次までの間（秒）、maxActive：同時に出している旅人の数の上限、
  // ahead・behind・oncoming：出す位置（プレイヤーから m。先は霧の内側で名前の札（100 m）より遠く）、
  // goneM・goneSec：これより遠くに居続けたら消す、lifeMax：最長の秒、sec：1人の道のりの長さ（秒）、minPower：これより低いと（止まっていると）出さない
  // 前後が入れ替わったら早めに消す（2026-10-28 ユーザー指示：抜いたあと差がゆっくりしか開かず 2〜3 分も視界に残り、速さも合わないまま並んで見えた）：
  //   swapM：この距離より近い間だけ、自分の進む向きで前か後ろかを見る（遠いと曲がった道で前後を読み違える）。最初に見た前後と逆になったら「入れ替わった」（すれ違った・抜いた・抜かれた）
  //   passFadeM：入れ替わったあと、この距離より離れたら fadeSec 秒かけて薄くして消す（g.fade 1 → 0。view3d が半透明に掛ける。急にパッと消さない）
  //   nearM・nearMax：nearM より近くに nearMax 秒続けていたら（並走して抜けない・抜きつ抜かれつ）、passMax：出てから passMax 秒たったら、同じく薄くして消す
  const CFG = { first: [12, 25], gap: [60, 120], maxActive: 3, ahead: [110, 190], behind: [70, 120], oncoming: [170, 235], goneM: 330, goneSec: 6, lifeMax: 420, swapM: 60, passFadeM: 50, fadeSec: 3, nearM: 30, nearMax: 45, passMax: 200, sec: 300, minPower: 30, afterHold: [5, 12],
    mix: [['pass', 0.4], ['overtaken', 0.25], ['oncoming', 0.35]], ratio: { pass: [0.45, 0.6], overtaken: [1.3, 1.6] },
    // 反対向きの記録（共有のゴースト G3 のうち、同じコースを反対向きに走ったもの。2026-10-28 ユーザー判断）を、対向ですれ違うように出す：
    // 道の先 onAhead m に、その記録が反対向きに通る時刻を探し、そこから再生する（lead＝その時刻 − いまの時計）。onFirst 秒後から onGap 秒おき、同時に onMax 人まで。すれ違ったら旅人と同じく薄くして消す
    onFirst: [15, 35], onGap: [25, 60], onMax: 2, onAhead: [150, 260], onTol: 25, onRest: 60, onReuse: 600,   // onReuse：同じ記録（同じ人）をもう一度出すまでの秒
    // 戦闘と戦闘のあいだ（hold が明けたフィールド）には、必ず最低 1 人の旅人に会う（2026-10-29 試走の指摘 11、ユーザー「最低誰か一人」）：
    // 戦闘が終わって owe.at 秒たっても、まだ旅人と meetM m 以内に来ていなければ、これから走る道の先（いま選んでいる向き）に、対向の旅人を 1 人出す
    // （同時の人数の上限・止まっている間の決まりは見ない）。その人は、分かれ道でプレイヤーの道へ進む（force）ので、プレイヤーが別の道を選ばない限り必ず会う。
    // 会う前に離れはじめた（分かれ道で別の道を選んだ・引き返した）ら awaySec 秒で見切り、retry 秒たっても会えなければ、もう一度出す
    owe: { at: [4, 8], meetM: 25, ahead: [120, 200], awaySec: 3, retry: 60 } };   // overtaken は NPC の上限（CAP）で頭打ち

  // NPC ごとに出せるパワーの上限（W。絶対の値。2026-10-23 ユーザー判断：500 W で走っているのに長老に抜かれた）。女王の試練のペースメーカーの並び（pacemaker.js の LINEUP）と同じ順で、強そうな人ほど高い。
  // 追い越される役（overtaken）は、自分のパワーより上限が高い人だけ（パワーは自分 × 1.3〜1.6 と上限の小さいほう）。女王は上限が高いが、まれにしか出さない
  const CAP = { child: 130, merchant: 150, bard: 190, seer: 210, astro: 230, alchemist: 260, fisher: 280, rogue: 300, elf: 330, smith: 370, mercenary: 410, oldknight: 450, valkyrie: 520, queen: 700 };
  const QUEEN_RATE = 0.15;
  const RECENT = 5;   // 直近に出た人を何人まで除くか
  const capOf = id => CAP[id] != null ? CAP[id] : 250;

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const meters = GH.meters;
  // 記録 g の、道ごとの通る点：Map(道の id → [{ t, s（道の a からの m）, dir }])（pts の順＝時刻の順）
  function roadIndex(net, g) {
    const m = new Map();
    for (const [t, i, sT] of g.pts) { const rt = g.route[i]; if (!rt) continue; const id = net.byName.get(rt[0]); if (id == null) continue; const len = net.roads[id].len, dir = rt[1];
      (m.get(id) || m.set(id, []).get(id)).push({ t, s: dir > 0 ? sT : len - sT, dir }); }
    return m;
  }
  // 記録が、道の上の点 st（{ road, dir（自分の進む向き）, s }）を反対向き（-st.dir）に通る時刻。同じ道の上の続く 2 点のあいだで s を補間する。tol m 以内で一番近いもの。tMax より後は使わない（すぐ終わる）
  function meetTime(net, P, st, tol, tMax) {
    const L = P.idx.get(st.road); if (!L) return null;
    let best = null, bd = tol;
    for (let k = 0; k < L.length; k++) {
      const a = L[k]; if (a.dir !== -st.dir || a.t > tMax) continue;
      const b = L[k + 1];
      if (b && b.dir === a.dir && b.t > a.t && (st.s - a.s) * (st.s - b.s) <= 0 && Math.abs(b.s - a.s) > 1e-6) { const f = (st.s - a.s) / (b.s - a.s); return a.t + (b.t - a.t) * f; }
      const d = Math.abs(a.s - st.s); if (d < bd) { bd = d; best = a.t; }
    }
    return best;
  }
  // 旅人 p が自分（me、5 m 先 ah）の前（+1）か後ろ（-1）か。進む向きのベクトルとの内積。近すぎる（1 m 以内）と 0
  function sideOf(me, ah, p) {
    const k = Math.cos(me.lat * Math.PI / 180), hx = (ah.lon - me.lon) * k, hy = ah.lat - me.lat, dx = (p.lon - me.lon) * k, dy = p.lat - me.lat;
    const d = (hx * dx + hy * dy) / (Math.hypot(hx, hy) || 1) * 111320;
    return d > 1 ? 1 : d < -1 ? -1 : 0;
  }

  function create({ net, ghosts, seed = 1, cfg = {}, oncoming = [] }) {
    const C = { ...CFG, ...cfg }, r = rng(seed ^ 0x7f4a7c15), between = ([a, b]) => a + (b - a) * r();
    const live = [];   // { g, born（clock）, far（遠くに居続けた秒）, side0（最初に見た前後 ±1）, swapped, near（近くで並んだ秒）, fading }
    let nextAt = null, pEma = null, last = null, n = 0, wasHold = false, onAt = null, onN = 0;
    let owed = false, oweAt = 0, sure = null;   // owed：この戦闘のあとのフィールドで、まだ旅人に会っていない。sure：会うために出した対向の旅人（live の 1 つ）
    const onPool = oncoming.filter(g => g && g.pts && g.pts.length > 2).map(g => ({ g, idx: roadIndex(net, g), used: 0, at: -1e9 }));   // 反対向きの記録（道ごとの通る時刻の索引つき）
    const recent = [];   // 直近に出た NPC（新しい順に最大 RECENT 人）。同じ旅の中で、同じ人が続けて出ないように（2026-10-25 ユーザー指摘：ワルキューレに2回続けて追い越された）

    function kindNow() { let x = r(), acc = 0; for (const [k, p] of C.mix) { acc += p; if (x < acc) return k; } return C.mix[0][0]; }
    function spawn(clock, ride, pw, forced = null) {   // forced：{ kind, st, roads }（会うために出すとき。種類と位置と、分かれ道で進ませる道を決めて出す）
      let kind = forced ? forced.kind : kindNow();
      // 見た目は主人公4人の 3D ゴースト（2026-10-26）。追い越される人は、上限（CAP の既定）がいまのパワーより高いときだけ。そうでなければ追い越す（pass）か対向にする
      if (kind === 'overtaken' && capOf('') <= pw * 1.1) kind = r() < 0.5 ? 'pass' : 'oncoming';
      let st, power, v0 = 6;
      if (forced) { st = forced.st; power = (200 + (r() - 0.5) * 80) * (0.6 + r() * 0.2); }
      else if (kind === 'pass') { st = RD.stateAt(ride, between(C.ahead)); power = pw * between(C.ratio.pass); }
      else if (kind === 'overtaken') { st = RD.stateAt(ride, -between(C.behind)); power = pw * between(C.ratio.overtaken); v0 = 8; }   // 上限は、見た目（NPC）が決まったあとで掛ける
      else { const a = RD.stateAt(ride, between(C.oncoming)); st = { road: a.road, dir: -a.dir, s: a.s }; power = (200 + (r() - 0.5) * 80) * (0.6 + r() * 0.2); }
      const look = TV.pickLook(r, new Set([...ghosts.map(x => x.name), ...recent]));   // 見た目は主人公4人。名前は直近に出た人と重ならないように
      if (!look) return null;   // 絵の一覧がまだ読めていない：出さない
      if (kind === 'overtaken') power = Math.min(power, capOf(look.hero)); if (kind === 'overtaken' && power <= pw * 1.02) return null;   // 抜いていけない人は出さない
      const g = TV.makeTraveller(net, st, { seed: Math.floor(r() * 2 ** 31), sec: C.sec, id: `d${n++}`, name: look.name, hero: look.hero, power: Math.max(40, power), v0, force: forced ? forced.roads : null });
      g.lead = -clock;   // この旅人は、clock の時刻に現れる（ghost.positionAt は clock + lead が道のりの時刻）
      g.encounter = kind;
      recent.unshift(look.name); if (recent.length > RECENT) recent.length = RECENT;
      const L = { g, born: clock, far: 0 };
      ghosts.push(g); live.push(L);
      return L;
    }

    function tick(clock, ride, power, opts = {}) {
      const dt = last == null ? 0 : Math.max(0, clock - last); last = clock;
      pEma = pEma == null ? power : pEma + (power - pEma) * Math.min(1, dt / 20);
      if (nextAt == null) nextAt = clock + between(C.first);
      if (wasHold && !opts.hold) { nextAt = Math.min(nextAt, clock + between(C.afterHold)); owed = true; oweAt = clock + between(C.owe.at); sure = null; }   // 戦闘が終わってフィールドに戻ったら、早めに1人目に会えるようにする。このフィールドで必ず 1 人に会う
      wasHold = !!opts.hold;
      const me = RD.info(ride), ah = live.length ? RD.info({ ...ride, ...RD.stateAt(ride, 5) }) : null;   // ah：自分の 5 m 先（進む向き）
      for (let i = live.length - 1; i >= 0; i--) {   // 見えなくなった旅人を消す
        const L = live[i], p = GH.positionAt(net, L.g, clock);
        let gone = !!p.done || clock - L.born > C.lifeMax;
        if (!gone && !p.hidden) {
          const m = meters(me, p); L.far = m > C.goneM ? L.far + dt : 0; if (L.far > C.goneSec && clock - L.born > 15) gone = true;
          if (!L.fading) {
            if (m < C.swapM) { const side = sideOf(me, ah, p); if (side) { if (!L.side0) L.side0 = side; else if (side !== L.side0) L.swapped = true; } }
            if (owed && !opts.hold && !L.on && m < C.owe.meetM) owed = false;   // 旅人に会えた
            if (L === sure && owed) { L.away = L.m0 != null && m > L.m0 + 0.3 ? (L.away || 0) + dt : 0; L.m0 = m; }   // 会うために出した人が、会う前に離れていく秒
            L.near = m < C.nearM ? (L.near || 0) + dt : 0;   // 近くで並んでいる秒（抜いたり抜かれたりをくり返しても数える）
            const why = L.swapped && m > C.passFadeM ? 'swap' : L.near > C.nearMax ? 'near' : clock - L.born > C.passMax ? 'time' : null;
            if (why) { L.fading = true; L.g.fadeWhy = why; }   // fadeWhy：なぜ消えるか（テスト・確かめ用）
          }
        }
        if (L.fading && !gone) { L.g.fade = Math.max(0, (L.g.fade == null ? 1 : L.g.fade) - dt / C.fadeSec); if (L.g.fade <= 0) gone = true; }
        if (gone) { const k = ghosts.indexOf(L.g); if (k >= 0) ghosts.splice(k, 1); live.splice(i, 1); }
      }
      if (owed && !opts.hold && clock >= oweAt && !(sure && live.includes(sure) && !sure.fading && (sure.away || 0) < C.owe.awaySec && clock - sure.born < C.owe.retry)) {   // まだ会っていない：道の先に対向の旅人を出す
        const d = between(C.owe.ahead), a = RD.stateAt(ride, d), roads = new Set();
        for (let x = 0; x <= d; x += 10) roads.add(RD.stateAt(ride, x).road);   // プレイヤーがこれから通る道（分かれ道で、こちらへ進ませる）
        sure = spawn(clock, ride, pEma, { kind: 'oncoming', st: { road: a.road, dir: -a.dir, s: a.s }, roads }); oweAt = clock + (sure ? 0 : 1);
      }
      if (clock >= nextAt && !opts.hold && live.length < C.maxActive && pEma >= C.minPower) { spawn(clock, ride, pEma); nextAt = clock + between(C.gap); }
      else if (clock >= nextAt && (opts.hold || live.length >= C.maxActive || pEma < C.minPower)) nextAt = clock + 5;   // 出せない間は、5秒ごとに見直す
    }
    // 反対向きの記録を 1 人、道の先で向かい合うように出す。出せたら true
    function spawnOn(clock, ride) {
      const order = onPool.slice().sort((a, b) => a.used - b.used || r() - 0.5);   // まだ出していない記録から
      const busy = new Set(live.filter(L => L.on).map(L => L.src));
      for (let tries = 0; tries < 4; tries++) {
        const d = between(C.onAhead), st = RD.stateAt(ride, d);
        for (const P of order) {
          if (busy.has(P.g.id) || clock - P.at < C.onReuse) continue;
          const tau = meetTime(net, P, st, C.onTol, P.g.sec - C.onRest);
          if (tau == null) continue;
          const g = { ...P.g, id: `o${onN++}-${P.g.id}`, lead: tau - clock, encounter: 'oncoming' }; delete g.born;
          P.used++; P.at = clock; ghosts.push(g); live.push({ g, born: clock, far: 0, on: true, src: P.g.id });
          return true;
        }
      }
      return false;
    }
    function tickOn(clock, ride, opts) {
      if (!onPool.length) return;
      if (onAt == null) onAt = clock + between(C.onFirst);
      if (clock < onAt) return;
      if (opts.hold || pEma < C.minPower || live.filter(L => L.on).length >= C.onMax) { onAt = clock + 5; return; }
      onAt = clock + (spawnOn(clock, ride) ? between(C.onGap) : 5);   // 道の先を通る記録がなければ、5 秒後にもう一度
    }
    return { tick: (clock, ride, power, opts = {}) => { tick(clock, ride, power, opts); tickOn(clock, ride, opts); }, active: () => live.map(L => L.g) };
  }

  const api = { CFG, CAP, capOf, create, sideOf, roadIndex, meetTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).encounters = api;
})(typeof window !== 'undefined' ? window : globalThis);
