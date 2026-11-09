/* その日の旅の組み立てと進み方。画面にもトレーナーにも触らない。
   職業のトレーニングプラン（data.js の PLANS）に合わせて、ウォームアップ → 本番（戦闘）と回復（フィールド）のくり返し
   → ボス → 帰り道のクールダウン、を組み立てる（2026-10-20 ユーザー判断）。
   キャラクターのレベル（2026-10-21 ユーザー判断）：レベル1つが60分の「1日」（data.js の dayOf）。そのキャラクターで合わせて55分走ったところで
   ボスが出て、倒しても倒せなくてもボスのあとにレベルが上がる。15分の旅ならボスは出ず、続きは次の旅で走る（prog に覚える）。
   60分より長い旅では、ボスのあと次のレベルのレシピを走る。
   フィールドでは景色が変わり、NPC と会話する。回復の間は、村人が次の戦いを教えてくれる。 */
(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? require('./data.js') : root.RQ.data;
  const T = isNode ? require('./talks.js') : root.RQ.talks;
  const B = isNode ? require('./battle.js') : root.RQ.battle;
  const NT = isNode ? require('./npctalk.js') : root.RQ.npcTalk;
  const I = isNode ? (() => { const i = require('../i18n/i18n.js'); require('../i18n/ja.js'); return i; })() : root.RQ.i18n;   // 次の戦いの予告の文（previewTalk）

  // 場面の ID と、もとの場所の名前（今は画面に出さない。背景の絵は 2026-10-23 に消した。ID は旅の組み立てとテストが使う）
  const SCENES = {
    s1_battle: '風車の村', s1_battle3: '花の川辺', ev_well: '霧の湧き水', s1_battle4: '竹林の道',
    ev_oldman: '紅葉の祠', ev_idol: '苔むした祭壇', s1_battle2: '森の遺跡', ev_road: '夕暮れの林道',
    rest: '星空の野営地', elite: '竜の火口', title: '天空の塔を望む丘', ev_spring: '妖精の泉', event: '霧の森の道しるべ',
    s2_battle2: '灯籠の参道', s2_battle: '夕焼けの峡谷', s2_battle3: '岩山の城門', boss_oni: '鬼王の城',
  };
  // 道のり。旅の進み（0〜1）に合わせて、この順に景色が変わる。最後は鬼王の城
  const ROUTE = ['s1_battle', 's1_battle3', 'ev_well', 's1_battle4', 'ev_oldman', 's1_battle2', 'ev_road', 'rest',
    'ev_spring', 'event', 'ev_idol', 's2_battle2', 's2_battle', 's2_battle3', 'boss_oni'];
  const STAGE_NAME = '鬼王の城への道';
  const HOME = ['s2_battle3', 'title'];   // 帰り道

  const MINUTES = [15, 30, 45, 60, 75, 90, 105, 120];   // 選べる時間
  const BOSS_BEFORE = 300;   // 1日（60分）の終わりのこの秒数前にボスが出る。旅の終わりの5分前までに出せなければ、その旅には出さない
  const DAY_SEC = 3600;      // 1日（キャラクターのレベル1つ）の長さ
  const HOME_SEC = 180;      // ボスの出ない旅の、終わりのクールダウン
  const REWARM_SEC = 240;    // 1日の途中から始めるときのウォームアップ
  const MIN_FIELD = 60;      // いちばん短いフィールド（次の戦いの予告が入る長さ）
  // 短い旅（2026-10-24 ユーザー判断：15分でも戦闘3回）。終わり方（2026-10-25 ユーザー判断。前の「選んだ時間を超えない」を置き換え）：
  // 選んだ時間は目安。旅を始めるときに ウォームアップ → 戦闘と回復 → （ボス）→ 帰り道（home＝1分）を組み、終わりが選んだ時間の ±SHORT_WIN 秒に
  // 収まる戦闘の数と回復の長さ（MIN_FIELD〜プランの回復）を選ぶ（最後の戦いのあとは帰り道だけ。敵の出ない長い空き時間を作らない）。
  // 入らないときだけ fitSet で縮める。組んだ終わりの時刻を旅の長さ（run.total）にする。n＝少なくともこの数の戦闘（ボスも1つと数える）。60分以上はこれを使わない
  const SHORT = { 15: { n: 3, warm: 120, home: 60 }, 30: { n: 4, warm: 240, home: 60 }, 45: { n: 5, warm: null, home: 60 } };
  const SHORT_WIN = 180;
  const MIN_BATTLE = B.lengthOf([]) + 3 * 30;   // いちばん短い戦闘（30秒のドラム3つ）
  const MOVING_W = 10, MOVING_RPM = 20;   // これ以上なら「進んでいる」
  const MISSION_NEED = D.STARS.mission[0];   // ミッションは、この割合の時間できていれば成功
  const CAMP_SPOT = '野営の跡';   // 野営の話を出すランドマーク（assets/map/landmarks.json の name）
  // 次の戦いを教えてくれる人：次の敵の出る地域（castFoes の area）に住む村人から（2026-10-28 ユーザー判断：村人は敵と同じく地域ごと。
  // 話しかけてきた人と、予告した敵の地域がそろう）。ネコ・子ども・妖精など、予告の口調（「〜おる」）に合わない人は入れない
  const PREVIEW_BY = {
    coast: ['fisher', 'merchant', 'keeper', 'ama'],
    forest: ['rogue', 'herbalist', 'beekeeper', 'alchemist'],
    summit: ['smith', 'seer', 'miner', 'oldknight', 'miko'],
  };

  // prog：キャラクターの進み具合 { level（1〜12）, min（その日に走った分）, setNo（その日のセットの何番目まで）, elite（その日の中ボスを出したか）, round（何周目）, best }
  const newProg = () => ({ level: 1, min: 0, setNo: 0, elite: false, round: 1, best: 1 });   // best：上がったいちばん高いレベル（装備）
  // talkLog：道端の NPC の話の記録（npctalk.js。くり返さないため・物語の進み。続けて走る旅では同じものを渡す）
  // cont：続けて走る旅（design.md §4.14 の B）。旅の始めだけの案内（長老の guide）を出さない（2026-10-23 ユーザー指摘）
  // brief：最初に会う人が今日の旅の概要を話す（outline の見通しを作る写しでは false）
  function createRun({ heroId, minutes = 60, rng = Math.random, prog = newProg(), talkLog = NT.newLog(), cont = false, brief = true, areaNow = null }) {   // areaNow：いる所の地形の地域を返す関数（敵の出る地域。省けば1日の進みで）
    const total = minutes * 60, planId = D.HEROES[heroId].plan, plan = D.PLANS[planId], p = { ...newProg(), ...prog };
    const run = {
      heroId, planId, plan, minutes, rng, total, areaNow, prog: p, day: D.dayOf(planId, p.level), setNo: p.setNo, next: null, talkDefs: {},
      dayStart: -p.min * 60,  // 今の1日が始まった時刻（旅の時計。前の旅の続きなら負）
      levelUps: [],          // この旅で上がったレベル
      clock: 0,              // 旅が始まってからの秒数（一時停止は除く）
      tolBonus: 0, buffs: {}, rival: null,
      seg: null, segNo: 0, field: null, done: false,
      usedTalks: [], usedMobs: [], pending: null, talkLog, cont, brief, prog0: { ...p },
      stats: { fieldSec: 0, battleSec: 0, wins: 0, fled: 0, talks: 0, missions: 0, missionsTried: 0, stars: 0, dealt: 0, taken: 0, skipped: 0, battles: [] },
    };
    run.short = minutes < 60 ? SHORT[minutes] || SHORT[minutes < 30 ? 15 : minutes < 45 ? 30 : 45] : null;
    const fresh = p.min <= 0, sw = run.short && run.short.warm;
    const warm = Math.min(fresh ? (sw || plan.warm.sec) : REWARM_SEC, sw || Infinity);   // 短い旅は、続きの日でも長くしない
    if (run.short) buildShort(run, warm);
    else setBoss(run, warm + B.lengthOf(run.day.sets[run.setNo % run.day.sets.length].waves) + MIN_FIELD);   // ボスは、ウォームアップと少なくとも1回の戦闘のあと
    planField(run, fresh ? 'ウォームアップ' : 'ウォームアップ（続きから）', warm, plan.warm.frac);
    return run;
  }
  // 今の1日のボスの時刻を決める（1日の55分目。notBefore より前にはしない）。
  // 55分目が旅の終わりの5分前より後でも、旅の長さの中に入るなら、終わりの5分前に出す（2026-10-25 ユーザー判断：残りが旅の長さ以下なら、その旅に出す）
  function setBoss(run, notBefore = 0) {
    const due = run.dayStart + DAY_SEC - BOSS_BEFORE, at = Math.max(notBefore, due);
    run.bossAt = at <= run.total - BOSS_BEFORE ? at : due <= run.total && notBefore <= run.total - BOSS_BEFORE ? run.total - BOSS_BEFORE : null;
  }
  // 短い旅を組む（SHORT の説明）。ボスまでの残りが選んだ時間以下なら、最後（帰り道の前）にボス（ウォームアップと少なくとも1回の戦闘のあと）。
  // run.shortPlan＝[{ field（その前の回復の長さの見込み）, set, boss }]、run.total＝組んだ終わりの時刻、run.bossAt＝ボスの始まり
  function buildShort(run, warm) {
    const T = run.minutes * 60, H = run.short.home, R = Math.max(MIN_FIELD, run.day.rest.sec), sets = run.day.sets;
    const bossDue = run.dayStart + DAY_SEC - BOSS_BEFORE <= T;
    let boss = bossDue ? run.day.boss : null;
    const bossLen = b => B.lengthOf(toughen(b.waves.map(w => ({ ...w, foes: ['oniking'] })), 'boss'));
    const need = Math.max(1, run.short.n - (bossDue ? 1 : 0));
    const setAt = i => sets[(run.setNo + i) % sets.length];
    const make = (k, cap) => {   // 本番 k 回（cap：1戦の長さの上限）で組んだときの終わりと回復の長さ
      const list = Array.from({ length: k }, (_, i) => (cap ? fitSet(setAt(i), cap) : setAt(i)));
      const fixed = warm + list.reduce((a, s) => a + B.lengthOf(s.waves), 0) + (boss ? bossLen(boss) : 0) + H, c = boss ? k : k - 1;
      const r = c ? Math.round(Math.max(MIN_FIELD, Math.min(R, (T - fixed) / c))) : 0;
      return { list, r, total: fixed + c * r, k, boss };
    };
    // 候補：本番 k 回（縮めない／縮める）。選んだ時間 ±SHORT_WIN に入るものから、縮めないもの → 回復がプランの回復に近いもの（詰めこみすぎない）→ 時間に近いもの の順に選ぶ。
    // どれも入らなければ、いちばん近いもの。ボスも入らないほど短いときだけ、ボスも縮める
    const cands = [];
    for (let k = need; k <= need + 8; k++) {
      const m = make(k); cands.push(m);
      const c = boss ? k : k - 1, cap = Math.floor((T - warm - H - (boss ? bossLen(boss) : 0) - c * MIN_FIELD) / k);
      if (m.total > T + SHORT_WIN && cap >= MIN_BATTLE) cands.push({ ...make(k, cap), fit: true });
      if (m.total > T + SHORT_WIN && cap < MIN_BATTLE) break;
    }
    if (boss && !cands.some(m => m.total <= T + SHORT_WIN)) {   // ボスも縮める
      const c = need, room = T - warm - H - c * MIN_FIELD - need * MIN_BATTLE;
      boss = fitSet(boss, Math.max(MIN_BATTLE, Math.floor((room + B.lengthOf([])) / 2)));   // 鬼王は前半と後半で、ドラムがプランの2倍
      cands.push({ ...make(need, MIN_BATTLE), fit: true });
    }
    const off = m => Math.abs(m.total - T), inWin = m => off(m) <= SHORT_WIN;
    const best = cands.reduce((x, m) => {
      if (!x) return m;
      if (inWin(m) !== inWin(x)) return inWin(m) ? m : x;
      if (inWin(m) && !!m.fit !== !!x.fit) return m.fit ? x : m;
      if (inWin(m)) { const dm = Math.abs(m.r - R), dx = Math.abs(x.r - R); if (Math.abs(dm - dx) > 15) return dm < dx ? m : x; }
      return off(m) < off(x) ? m : x;
    }, null);
    run.shortPlan = best.list.map((set, i) => ({ field: i ? best.r : warm, set }));
    if (best.boss) run.shortPlan.push({ field: best.r, set: best.boss, boss: true });
    run.total = best.total;
    run.bossAt = best.boss ? best.total - H - bossLen(best.boss) : null;
  }
  // 今の1日の何分目か（at：旅の時計。省けば今）
  const dayMin = (run, at = run.clock) => (at - run.dayStart) / 60;
  // 旅の終わりに覚えておく進み具合
  const progressOf = run => ({ ...run.prog, min: Math.max(0, Math.round(dayMin(run) * 10) / 10), setNo: run.setNo });

  const seg = run => run.seg;

  // 旅の進み p0〜p1 に当たる景色（最大3つ）
  function scenesFor(p0, p1, final) {
    const n = ROUTE.length - 1;
    const i0 = Math.min(n - 1, Math.round(Math.max(0, p0) * n));
    const i1 = final ? n : Math.max(i0, Math.min(n - 1, Math.round(p1 * n)));
    const all = ROUTE.slice(i0, i1 + 1);
    if (all.length <= 3) return all;
    return [all[0], all[Math.floor(all.length / 2)], all[all.length - 1]];
  }

  // 敵の出る地域：いま走っている所の地形（2026-10-25 ユーザー判断。画面では app.js が run.areaNow に RQ.ride.areaAt を渡す）。
  // 渡されていなければ（node のテスト）、1日の進みで 海岸 → 森 → 火口
  const progressArea = (run, at) => D.AREAS[Math.min(2, Math.floor(dayMin(run, at) / (DAY_SEC - BOSS_BEFORE) * 60 * 3))];
  function areaFor(run, at) {
    if (run.areaNow) { try { const a = run.areaNow(); if (D.AREAS.includes(a)) return a; } catch (_) { /* 位置が分からなければ進みで */ } }
    return progressArea(run, at);
  }
  // 次の戦い（プランのセット）の敵を決める。敵は、決めるとき（その前の回復の始め）にいる所の地形の生き物（予告の会話で名前を言うので、回復の始めに決める）
  // 中ボス・大ボスの歯ごたえ（2026-10-25 ユーザー判断）：目標パワーを中ボス ×1.05（3本目は ×1.10。2026-10-29）（FTP の 120% まで。もとが上なら下げない。3分以上の長い区間には足さない）。
  // 鬼王は後半の3本を強く（BOSS_UP。2026-10-26 ユーザー判断。前の「とどめの1本（30秒・120%）」はやめた）
  const TOUGH = { elite: 1.05, boss: 1.1 },
    BOSS_UP = [1.05, 1.05, 1.1],   // 後半の4・5・6本目（前半の1・2・3本目に掛ける）
    ELITE_LAST = 1.1,   // 中ボスの最後のドラム（3本目・オーバーアンダーの日は6本目。2026-10-29）
    TOUGH_CAP = 1.2, TOUGH_LONG = 180;
  const toughFrac = (f, mul) => Math.max(f, Math.min(TOUGH_CAP, +(f * mul).toFixed(3)));
  function toughen(waves, kind) {
    if (!TOUGH[kind]) return waves;
    const up = (r, mul) => {   // 目標パワーを mul 倍（FTP の 120% まで。3分以上の区間には足さない）
      if (r.sec >= TOUGH_LONG) return r;
      if (!r.steps) return { ...r, frac: toughFrac(r.frac, mul) };
      const steps = r.steps.map(([s, f]) => [s, toughFrac(f, mul)]);
      return { ...r, steps, frac: +(steps.reduce((a, [s, f]) => a + s * f, 0) / r.sec).toFixed(3) };
    };
    if (kind === 'boss') {
      // 鬼王（2026-10-26 ユーザー判断「3本クリア後に本気を出してもう3本。そこが5%・10%強くなる」）：前半はプランのボスの3本をそのまま。
      // 3本とも 90% 以上なら鬼王が本気を出し（rage：後半の始まりのドラムの番号）、後半の3本＝前半の1・2・3本目を ×1.05・×1.05・×1.10（2026-10-26 ユーザーの直し）。
      // 1本でも 90% 未満なら、その時点で逃げる（battle.js）
      return waves.map((w, i) => {
        if (i !== waves.length - 1) return w;
        const r = w.reels, n = r.length, second = BOSS_UP.map((mul, k) => up(r[Math.min(k, n - 1)], mul));
        return { ...w, reels: [...r, ...second], rage: n };
      });
    }
    // 中ボス（2026-10-29 試走 No.17 ユーザー判断「中ボスも鬼王と同じく3つ目が強くて、3つで倒す」）：いちばん最後のドラムだけ ×ELITE_LAST（1.10）、ほかは ×1.05。
    // ドラムが6本（オーバーアンダーの日）は、6本目だけ ×1.10（ユーザー「6本目だけ」）
    const out = waves.map(w => { const mul = TOUGH[(D.ENEMIES[w.foes[0]] || {}).kind]; return !mul ? w : { ...w, reels: w.reels.map((r, j) => up(r, j === w.reels.length - 1 ? ELITE_LAST : mul)) }; });   // 中ボス・大ボスのウェーブだけ（連戦のほかの敵はそのまま）
    return out;
  }
  function castFoes(run, set, at, final) {
    if (final) return { kind: 'boss', bg: 'boss_oni', waves: toughen(set.waves.map(w => ({ ...w, foes: ['oniking'] })), 'boss') };
    const area = areaFor(run, at);
    const inSet = [];   // 同じセット（連戦）の中では、同じ敵を続けない（2026-10-20 ユーザー判断：見た目に飽きる）
    const take = (pool, n) => {   // 最近出ていない敵から。足りなければくり返す
      const out = [];
      for (let i = 0; i < n; i++) {
        let free = pool.filter(id => !run.usedMobs.slice(-6).includes(id) && !out.includes(id) && !inSet.includes(id));
        if (!free.length) free = pool.filter(id => !out.includes(id) && !inSet.includes(id));
        if (!free.length) free = pool.filter(id => !out.includes(id));
        if (!free.length) free = pool;
        const id = free[Math.floor(run.rng() * free.length)]; out.push(id); run.usedMobs.push(id);
      }
      inSet.push(...out);
      return out;
    };
    let kind = 'mob';
    const elite = !run.prog.elite && dayMin(run, at) >= 25;   // 1日の半ばに中ボス（1日に1回）
    const waves = set.waves.map(w => {
      if (w.foes === 3) {   // 小さな雑魚3体
        // その場所の小さな雑魚だけから選ぶ。種類が足りなければ、ほかの場所から借りずに同じ敵を2〜3体出す（2026-10-25 ユーザー判断）。
        // 連戦の2つ目からは、なるべく前のウェーブと違う敵にする（2026-10-23 ユーザー判断）
        const here = D.SMALL.filter(id => D.ENEMIES[id].area === area), pool = here.length ? here : D.SMALL;
        return { ...w, foes: take(pool, 3) };
      }
      if (elite && kind === 'mob') {   // 中ボスも、その場所の中ボスから（まだいなければ、ほかの場所から）
        kind = 'elite'; run.prog.elite = true;
        const here = D.ELITES.filter(id => D.ENEMIES[id].area === area), pool = here.length ? here : D.ELITES;
        return { ...w, foes: [pool[Math.floor(run.rng() * pool.length)]] };
      }
      return { ...w, foes: take(D.MOBS.filter(id => D.ENEMIES[id].area === area), 1) };
    });
    return { kind, area, waves: toughen(waves, kind), bg: kind === 'elite' ? 'elite' : null };   // area：予告する村人もこの地域の人
  }

  // 回復の間に、村人が次の戦いを教えてくれる（2026-10-20 ユーザー案）
  // この戦い（next）のあとの回復が、ボスの前の最後（城の前の 'gate' の人が話す）になるか（planField・planShort と同じ見積もり）
  function gateNext(run, sec, next) {
    if (run.short) return !!(run.shortPlan && run.shortPlan[0] && run.shortPlan[0].boss);
    if (run.bossAt == null) return false;
    const want = run.day.rest.sec, rem = run.bossAt - (run.clock + sec + B.lengthOf(next.waves));
    return !run.day.sets.some(set => Math.min(want, rem - B.lengthOf(set.waves) - MIN_FIELD) >= Math.min(want, MIN_FIELD));
  }
  function previewTalk(run, next, sec = 0) {
    const t = I.t, n = id => D.ENEMIES[id].n, w = next.waves, first = w[0];
    const list = xs => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(t('pv.sep')) + t('pv.last') + xs[xs.length - 1];   // 「AとBとC」・「A, B and C」
    const lines = [];
    if (first.foes.length === 3) {
      const [a, b, c] = first.foes;
      lines.push(['npc', a === b && b === c ? t('pv.trioSame', { foe: n(a) }) : t('pv.trioMix', { list: list([...new Set([a, b, c])].map(n)) })]);
      lines.push(['npc', t('pv.trioTip')]);
    } else if (next.kind === 'elite') {
      lines.push(['npc', t('pv.elite', { foe: n(first.foes[0]) })]);
    } else {
      lines.push(['npc', t('pv.mob', { foe: n(first.foes[0]) })]);
    }
    if (w.length > 1) {
      const rest = w.slice(1).map(x => t(x.foes.length === 3 ? 'pv.pack' : 'pv.one', { foe: n(x.foes[0]) }));
      lines.push(['npc', t('pv.waves', { rest: rest.join(t('pv.then')) })]);
    }
    lines.push(['npc', t('pv.cad', { cad: first.reels[0].cad })]);
    lines.push(['hero', t('pv.hero')]);
    const id = `preview${run.segNo}`;
    const by = PREVIEW_BY[next.area] || PREVIEW_BY[areaFor(run, run.clock)] || PREVIEW_BY.coast;
    // 直前に話した人（道端の話・前の予告）は続けて出さない（2026-10-29 試走 No.24：野草摘みのおばさんが2回続けて出た。予告の人は話した人の記録 talkLog.chars に入っていなかった）。
    // 記録は話し始めたときに入れる（stepField の talkStart）。この回復の道端の話は、この予告の人を選ばない（pickTalk）
    const recent = run.talkLog.chars || [], last = recent[recent.length - 1], gate = gateNext(run, sec, next) ? T.TALKS.gate.char : null;   // 次の回復で城の前の人（老騎士）が話すなら、その人も予告に出さない
    const pool = [by.filter(c => !recent.includes(c) && c !== gate), by.filter(c => c !== last && c !== gate), by.filter(c => c !== last), by].find(xs => xs.length);
    run.talkDefs[id] = { char: pool[Math.floor(run.rng() * pool.length)], lines };   // 予告に長老は出さない（道中には出ない）
    return id;
  }
  const talkOf = (run, id) => run.talkDefs[id] || T.TALKS[id];

  // 今日の旅の見通し（2026-10-24 ユーザー要望：最初に会う人が概要を話す）。同じ条件の写しを、漕ぎも会話もなしで、
  // 回復は決まった長さ・戦闘は決まった長さで最後まで進めて数える。sets：本番（ボス以外）の戦闘ごとの waves、boss：ボスの時刻（分）か null
  function outline(run) {
    let s = 7; const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
    const sim = createRun({ heroId: run.heroId, minutes: run.minutes, prog: run.prog0, rng, cont: true, brief: false });
    const sets = []; let boss = null;
    for (let guard = 0; !sim.done && guard < 500; guard++) {
      const sg = sim.seg;
      if (sg.type === 'field') { sim.clock += sg.sec; if (sg.home) break; enterBattle(sim); }   // （帰り道を走りきった時刻が、旅の終わりの見通し）
      else { if (sg.kind === 'boss') { if (boss == null) boss = sim.clock / 60; } else sets.push(sg.waves); finishBattle(sim, { sec: B.lengthOf(sg.waves) }); }
    }
    return { sets, boss, end: sim.clock, toBoss: Math.max(0, Math.round(DAY_SEC / 60 - BOSS_BEFORE / 60 - (run.prog0.min || 0))) };   // end：旅の終わりの見通し（秒）
  }
  // 本番のセットの種類（区間の長さと強さから）：'3030' | 'ou'（オーバーアンダー） | 'vo2' | 'thr'（閾値） | 'ss'（スイートスポット） | 'tempo' | 'endu'
  function setKind(waves) {
    const rs = waves.flatMap(w => w.reels), work = rs.filter(r => r.frac >= 0.6), easy = rs.some(r => r.frac < 0.6);
    const avg = work.reduce((a, r) => a + r.frac, 0) / Math.max(1, work.length);
    const kind = easy && rs.every(r => r.sec <= 30) ? '3030' : waves.some(w => w.ou) ? 'ou'
      : avg >= 1.05 ? 'vo2' : avg >= 0.95 ? 'thr' : avg >= 0.84 ? 'ss' : avg >= 0.76 ? 'tempo' : 'endu';
    const pct = work.map(r => Math.round(r.frac * 100));
    return { kind, lo: Math.min(...pct), hi: Math.max(...pct), min: Math.round(work.reduce((a, r) => a + r.sec, 0) / 60) };
  }
  // 旅の最初に会う長老の、今日の旅の話と概要（2026-10-24 ユーザー要望「最初に長老が出て、旅の話とかトレーニングの話をすればいい」）。3つの窓：
  // ① あいさつ（続けて走る B の2回目は「また来たか」）＋今日どこを進むか ② 時間・プラン・本番の戦いの数と中身・強さ ③ ボスの時刻（出なければあと何分）・クールダウン。
  // 初めてのキャラクターなら、そのあとに長老の案内（guide）の行を続け、案内の効果（加護）もつける
  function briefTalk(run, guide = false) {
    const t = I.t, o = outline(run);
    run.endPlan = o.end;   // 旅の終わりの見通し（HUD の残り時間。60分以上の旅は、ボスの前・帰り道の余りを足さないので、選んだ時間より早く終わることがある）
    const groups = [];   // 同じ種類のセットはまとめる（例：スイートスポット×2）
    for (const w of o.sets) { const k = setKind(w), g = groups.find(x => x.kind === k.kind); if (g) { g.n++; g.lo = Math.min(g.lo, k.lo); g.hi = Math.max(g.hi, k.hi); } else groups.push({ ...k, n: 1 }); }
    const menu = groups.map(g => t('brief.set', { name: t('brief.kind.' + g.kind), n: g.n })).join(t('brief.sep'));
    const lo = Math.min(...groups.map(g => g.lo)), hi = Math.max(...groups.map(g => g.hi)), pct = lo === hi ? `${lo}` : t('brief.range', { lo, hi });
    // 今いる土地（敵は、走っている所の地形の生き物が出る。2026-10-25 ユーザー判断）
    const land = t('brief.land.' + areaFor(run, run.clock));   // 今いる土地のひとこと（2026-10-26 ユーザーが選んだ言い方）
    const lines = [
      ['npc', t(run.cont ? 'brief.helloAgain' : 'brief.hello') + land + (o.boss != null ? t('brief.bossDay') : '')],
      ['npc', t('brief.today', { m: Math.round(o.end / 60), plan: D.PLANS[run.planId].n }) + (o.sets.length ? t('brief.menu', { n: o.sets.length, menu, pct }) : t('brief.noBattle'))],
      ['npc', (o.boss != null ? t('brief.boss', { boss: D.WORLD.boss, m: Math.round(o.boss) }) : t('brief.noBoss', { boss: D.WORLD.boss, m: o.toBoss })) + t('brief.cool')],
    ];
    const g = guide ? T.TALKS.guide : null;
    const id = `brief${run.segNo}`;
    run.talkDefs[id] = { char: 'elder', lines: g ? [...lines, ...g.lines.slice(1)] : lines, ...(g ? { effect: g.effect } : {}) };   // 案内の1行目（あいさつ）は重なるので省く
    run.briefOutline = o;   // テスト用
    return id;
  }

  // final：ボスの前のフィールド。home：ボスを倒したあとの帰り道（終わるとまとめ）。frac：ERG の強さ（FTP 比）
  function enterField(run, sec, label, final, home, frac = run.day.rest.frac) {
    const span = (DAY_SEC - BOSS_BEFORE) / 60, p0 = dayMin(run) / span, p1 = dayMin(run, run.clock + sec + (run.next ? B.lengthOf(run.next.waves) : 0)) / span;
    const scenes = home ? HOME : scenesFor(p0, p1, final);
    // 話す種類は回復の長さで決める（2026-10-22 ユーザー判断。docs/npc-talks.md §2.1）：'npc:島・tips・物語' と、最後に予告（null の所に入る）。
    // 60秒より短い回復では話さない（話しきれずに回復が延びるため）
    const talks = sec < 60 ? [] : NT.fieldKinds(sec, run.rng).map(k => (k === 'preview' ? null : `npc:${k}`));
    // 旅の最初の会話：初めてのキャラクターなら長老の案内。続きの日・続けて走る旅では、ふつうの道端の話のまま
    // （前は null にしていて、前からの道すがらの会話＝加護つきが出ていた。2026-10-23 に直した）
    if (run.segNo === 0 && talks.length && run.prog.min === 0 && !run.cont) talks[0] = 'guide';
    if (!final && !home && dayMin(run) >= 22 && !run.campDone && talks.length) { talks.unshift('camp'); talks.length = Math.max(2, talks.length - 1); run.campDone = true; }   // 1日の半ばで野営
    // 旅の最初に会うのは、いつも長老（2026-10-24 ユーザー要望。続けて走る B も）。今日の旅の話と概要を話す。
    // 初めてのキャラクターの案内（guide）は、長老の同じ話の続きにする。野営（camp）はその次に
    if (run.segNo === 0 && run.brief && sec >= 60) {
      const guide = talks[0] === 'guide', camp = talks[0] === 'camp';
      if (guide || camp || talks.length >= 3) talks.shift();   // ふつうの話を1つ減らす（予告は最後に残す）
      talks.unshift(briefTalk(run, guide), ...(camp ? ['camp'] : []));
      run.briefed = true;
    }
    if (final) { if (talks.length) talks[talks.length - 1] = 'gate'; else talks.push('gate'); }
    else if (!home && run.next && talks.length && !run.trial) talks[talks.length - 1] = previewTalk(run, run.next, sec);   // 最後の会話で、次の戦いを教えてもらう
    if (home) { talks.length = 0; talks.push(run.levelUps.length ? 'finale' : 'homeward'); }
    if (run.trial) { talks.length = 0; talks.push(home ? 'trialHome' : 'trialGo'); }   // 試練のあとの1戦：女王のひとことだけ（村人の予告なし）。戦いの前のひとことは、クールダウンの始めに（2026-10-28 ユーザー判断）
    run.seg = { type: 'field', label, sec, scenes, talks, final, home, frac: home ? D.ERG_REST : frac };
    run.segNo++;
    // 話す時刻：会話の長さ（1行 TALK_LINE_SEC 秒）を見て、回復の長さの中で話し終えるように置く（2026-10-25：会話が回復の終わりを越えて、旅が延びていた）。
    // 最後の会話（次の戦いの予告など）は回復の終わりに話し終える所、ほかは前から順に。入りきらなければ、まん中の道端の話を減らす
    const durOf = id => { const d = run.talkDefs[id] || T.TALKS[id]; return (d && d.lines ? d.lines.length : 3) * T.TALK_LINE_SEC + 2; };
    while (talks.length > 2 && talks.reduce((a, id) => a + durOf(id), 0) > sec * 0.9) {
      const k = talks.findIndex((id, i) => i > 0 && i < talks.length - 1 && String(id).startsWith('npc:'));
      talks.splice(k > 0 ? k : talks.length - 2, 1);
    }
    const n = talks.length, lastAt = n ? Math.max(0, sec - durOf(talks[n - 1]) - 2) : 0, firstAt = Math.min(sec * 0.06, lastAt);
    run.field = { t: 0, scene: 0, talk: null, talkIdx: 0, soon: null,
      talkAt: talks.map((_, k) => (n === 1 ? (run.trial && !home ? Math.min(TRIAL_GO_AT, lastAt) : Math.min(sec * 0.3, lastAt)) : firstAt + (lastAt - firstAt) * k / (n - 1))) };
  }

  function enterBattle(run) {
    const prev = run.seg, next = run.next;
    // 会話で次の相手を指名されたら、最初の敵をその相手にする
    if (run.rival && next.kind === 'mob') { const w = next.waves[0]; w.foes = [run.rival, ...w.foes.slice(1)]; }
    run.seg = { type: 'battle', kind: next.kind, waves: next.waves, bg: next.bg || prev.scenes[prev.scenes.length - 1] };
    run.next = null;
    run.segNo++;
    run.field = null;
  }

  // 次のフィールド（回復）と、その次の戦い（その日のセット）を、ボス（なければ旅の終わりのクールダウン）までの残りから決める。
  // 本番がもう入らなければ、ボスの前の最後のフィールドか、帰り道にする
  function planField(run, label, want = run.day.rest.sec, frac = run.day.rest.frac) {
    if (run.short) return planShort(run, label, want, frac);
    const until = run.bossAt != null ? run.bossAt : run.total - HOME_SEC, rem = until - run.clock, sets = run.day.sets;
    for (let k = 0; k < sets.length; k++) {   // その日の順に。入らなければ、次に短いものを試す
      const set = sets[(run.setNo + k) % sets.length], len = B.lengthOf(set.waves);
      const field = Math.min(want, rem - len - MIN_FIELD);
      if (field >= Math.min(want, MIN_FIELD)) {
        run.setNo += k + 1;
        run.next = castFoes(run, set, run.clock + field);
        return enterField(run, field, label, false, false, frac);
      }
    }
    if (run.bossAt != null) {
      // ボスの前の回復も、ふつうの回復の長さ（2026-10-25 ユーザー判断：余った時間を回復に足さず、トレーニングを短くする。本番も足さない）。
      // そのぶんボスを早め、旅の終わり（run.total）も同じだけ早める（選んだ時間は目安。1日の分は、実際にボスが出た時刻から数え直す）
      const field = Math.max(30, Math.min(rem, Math.max(MIN_FIELD, want))), early = rem - field;
      if (early > 0) { run.bossAt -= early; run.total -= early; }
      run.next = castFoes(run, run.day.boss, run.bossAt, true);
      return enterField(run, field, 'ボスの前', true, false, frac);
    }
    run.next = null;
    goHome(run);
  }
  // 帰り道：ふつうの長さ（短い旅は1分、60分以上は HOME_SEC）。余った時間は帰り道に足さず、旅の終わり（run.total）を早める
  // （2026-10-25 ユーザー判断「余った時間を回復に足さず、トレーニングを短くする」と同じ考え方。前は残りを全部帰り道にして、6〜15分になることがあった）
  function goHome(run) {
    const left = run.total - run.clock, sec = Math.max(30, Math.min(left, run.short ? run.short.home : HOME_SEC));
    if (left > sec) run.total -= left - sec;
    return enterField(run, sec, '帰り道', false, true);
  }

  // 短い旅（SHORT）の planField：組んだ順（run.shortPlan）に、次の戦いと、その前の回復を出す。回復の長さは、旅の終わり（run.total）が
  // 組んだときのままになるよう、今の時刻から決める（戦闘をとばして浮いた時間は、次の回復に回る）。組んだ戦いを出しきったら帰り道
  function planShort(run, label, want, frac) {
    const plan = run.shortPlan || [], item = plan.shift();
    if (!item) return goHome(run);
    const len = s => B.lengthOf(s.boss ? toughen(s.set.waves.map(w => ({ ...w, foes: ['oniking'] })), 'boss') : s.set.waves);
    const after = plan.reduce((a, x) => a + x.field + len(x), 0) + run.short.home;
    const field = Math.max(item.boss || run.segNo > 0 ? MIN_FIELD : 30, Math.round(run.total - run.clock - len(item) - after));
    if (item.boss) {
      if (run.bossAt == null) return planShort(run, label, want, frac);   // ボスをとばした（この旅ではもう出さない）
      run.bossAt = run.clock + field;
      run.next = castFoes(run, item.set, run.bossAt, true);
      return enterField(run, field, 'ボスの前', true, false, frac);
    }
    run.setNo++;
    run.next = castFoes(run, item.set, run.clock + field);
    return enterField(run, field, label, false, false, frac);
  }
  // セット（waves）を、戦闘の長さ cap（秒）に収める。収まればそのまま。収まらなければ ① 連戦のうしろのウェーブを外す
  // ② ドラムの多いウェーブ（オーバーアンダー）はうしろのドラムを3つずつ外す（3つまで） ③ ドラムを同じ割合で短くする（15秒刻み、30秒まで）。
  // 目標パワー・回転数・強弱（steps）はそのまま（プランの性格を残す）
  function fitSet(set, cap) {
    const fits = ws => B.lengthOf(ws) <= cap;
    if (fits(set.waves)) return set;
    let waves = set.waves;
    while (!fits(waves) && waves.length > 1) waves = waves.slice(0, -1);
    let w = waves[0];
    while (!fits([w]) && w.reels.length > 3) w = { ...w, reels: w.reels.slice(0, (Math.ceil(w.reels.length / 3) - 1) * 3) };   // 3つずつ外す（6→3）。敵を倒すドラムはいつも3の倍数（2026-10-29 試走 No.17 ユーザー判断。前は1つずつ外して4・5本が出た）
    if (!fits([w])) {
      const room = cap - B.lengthOf([]), sum = w.reels.reduce((a, r) => a + r.sec, 0);
      w = { ...w, reels: w.reels.map(r => ({ ...r, sec: Math.max(30, Math.floor(r.sec * room / sum / 15) * 15) })) };
    }
    return { ...set, waves: [w], short: true };
  }

  // 次の会話を決める。'npc:種類' は道端の NPC の話（npctalk.js。where：今いる所の札）。合うものが無ければ、前からの会話から選ぶ
  function pickTalk(run, id, where) {
    if (id && id.startsWith('npc:')) {
      // 今いる所の地域に住む村人だけ（2026-10-28 ユーザー判断。敵の出る地域と同じ areaFor）。長老は道中に出ない（npctalk.js の NEVER）
      const exclude = ((run.seg && run.seg.talks) || []).slice(run.field ? run.field.talkIdx + 1 : 0).map(k => typeof k === 'string' && !k.startsWith('npc:') && talkOf(run, k)).filter(Boolean).map(d => d.char).filter(Boolean).slice(0, 1);   // この回復で次に話す決まった人（予告の村人・城の前の老騎士）は、その前の話に出さない（続けて出ないように）
      const kind = id.slice(4), x = NT.pick(kind, { plan: run.planId, tags: where || ['どこでも'], log: run.talkLog, rng: run.rng, area: areaFor(run, run.clock), exclude });
      if (!x) return null;   // 合う話が無ければ話さない（前は道すがらの会話から選んでいたが、加護が多くなりすぎた。2026-10-23 ユーザー指摘）
      NT.remember(run.talkLog, x);
      const nid = `npc${run.segNo}_${run.field.talkIdx}`;
      // tips は、次の戦いの加護（判定のゆるさ）つき。会話の効果は判定のゆるさ（CLAUDE.md の決定事項）。
      // ただし加護は1回の旅で NT.BUFF_MAX 回まで（2026-10-23 ユーザー指摘：加護が多すぎる）。それより後の tips は話すだけ
      const buff = kind === 'tips' && (run.talkBuffs || 0) < NT.BUFF_MAX;
      if (buff) run.talkBuffs = (run.talkBuffs || 0) + 1;
      run.talkDefs[nid] = { char: x.char, lines: x.lines, line: x.id, effect: buff ? { buff: { tol: 1 }, text: I.t('talk.buffNext') } : undefined };
      return nid;
    }
    if (id) return id;
    const free = T.TALK_POOL.filter(k => !run.usedTalks.includes(k));
    const list = free.length ? free : T.TALK_POOL;   // 長い旅では、ひととおり会ったら2周目
    return list[Math.floor(run.rng() * list.length)];
  }

  // 効果を当てて、伝える文を返す
  function applyEffect(run, e) {
    if (!e) return null;
    if (e.chance != null) {
      const ok = run.rng() < e.chance;
      if (ok) applyEffect(run, e.ok);
      return ok ? e.okText : e.ngText;
    }
    if (e.buff) {
      const b = run.buffs;
      if (e.buff.tol) b.tol = (b.tol || 0) + e.buff.tol;
    }
    if (e.tol) run.tolBonus = Math.min(D.TUNE.tolBonusMax, run.tolBonus + e.tol);
    if (e.rival) run.rival = e.rival;
    if (e.mission && run.field) { run.field.mission = { ...e.mission, t: 0, okT: 0 }; run.stats.missionsTried++; return `ミッション：${e.mission.n}`; }
    return e.text || null;
  }

  // フィールドを dt 秒進める。inp = { power, cad }。起きたことを返す
  function stepField(run, dt, inp) {
    const ev = [], f = run.field, s = run.seg;
    if (!f) return ev;
    run.clock += dt;
    const moving = inp.power >= MOVING_W || inp.cad >= MOVING_RPM;
    if (moving && f.t < s.sec) {
      f.t = Math.min(s.sec, f.t + dt); run.stats.fieldSec += dt;
    }
    const scene = Math.min(s.scenes.length - 1, Math.floor(f.t / (s.sec / s.scenes.length)));
    if (scene !== f.scene) { f.scene = scene; ev.push({ type: 'scene', id: s.scenes[scene] }); }
    // ミッション：決まった秒数、言われた回転数を保つ。回転数と強さは時間とともにまっすぐ変わる。
    // 7割以上できれば成功で、出来ばえで星が1〜3つ
    const m = f.mission;
    if (m && !f.talk) {
      m.t += dt; m.inCond = Math.abs(inp.cad - missionCad(m)) <= m.half;
      if (m.inCond) m.okT += dt;
      if (m.t >= m.sec) {
        const acc = m.okT / m.sec, stars = D.STARS.mission.filter(x => acc >= x).length, ok = stars > 0;
        if (ok) { applyEffect(run, m.ok); run.stats.missions++; run.stats.stars += stars; }
        f.mission = null;
        ev.push({ type: 'missionEnd', ok, stars, text: ok ? m.okText : m.ngText });
      }
    }
    // 会話（漕いでいなくても時間で進む）。ミッション中は話しかけられない。
    // 道端の NPC（2026-10-22 ユーザー要望）：話す NPC_LEAD_SEC 秒前に talkSoon を出し（3D の世界がその人を道端に立たせる）、
    // inp.npc が true（横を通り過ぎた・すぐ手前まで来た）になったら話し始める。別の道へ曲がったときなどは NPC_WAIT_SEC 秒過ぎたら話し始める。
    // inp.npc が無ければ（3D の無いとき・話す人のいない会話）、前のとおり決まった時刻に話し始める
    // 野営（camp）の話は、野営の跡（ランドマーク）の板のそばを通るときに出す（2026-10-24 窓口）：今いる所の札（inp.where。約300 m 以内）に
    // 「野営の跡」があれば、まだ話していない camp をすぐ次に回して話す。そばを通らなければ、決まった時刻のまま
    if (!f.talk && !f.mission && !f.soon && inp.where && inp.where.includes(CAMP_SPOT)) {
      const k = s.talks.indexOf('camp', f.talkIdx);
      if (k > f.talkIdx) { s.talks.splice(k, 1); s.talks.splice(f.talkIdx, 0, 'camp'); }
      if (k >= 0) f.talkAt[f.talkIdx] = Math.min(f.talkAt[f.talkIdx], f.t);
    }
    const idx = f.talkIdx;
    if (!f.talk && !f.mission && idx < s.talks.length) {
      const at = f.talkAt[idx];
      if (!f.soon && f.t >= at - T.NPC_LEAD_SEC) {
        const id = pickTalk(run, s.talks[idx], inp.where);
        if (id) { f.soon = { id }; ev.push({ type: 'talkSoon', id, talk: talkOf(run, id), sec: Math.max(0, at - f.t) }); }
        else f.talkIdx++;   // 話す人がいない：この会話は飛ばす
      }
      const due = inp.npc == null ? f.t >= at : inp.npc || f.t >= Math.min(s.sec, at + T.NPC_WAIT_SEC);
      if (f.soon && due) {
        const id = f.soon.id; f.soon = null; f.talkIdx++;
        run.usedTalks.push(id); run.stats.talks++;
        f.talk = { id, line: 0, lineT: 0, result: undefined };
        { const ch = (talkOf(run, id) || {}).char; if (ch) run.talkLog.chars = (run.talkLog.chars || []).filter(c => c !== ch).concat(ch).slice(-NT.CHARS); }   // 話した人（直前の人は続けて出さない）
        ev.push({ type: 'talkStart', id, talk: talkOf(run, id) });
      }
    } else if (f.talk) {
      f.talk.lineT += dt;
      // 早送り（1回に何秒も進む）でも、経った時間のぶんだけ行を進める
      for (let left = f.talk.lineT; f.talk && left >= T.TALK_LINE_SEC; left -= T.TALK_LINE_SEC) { nextLine(run, ev); if (f.talk) f.talk.lineT = left - T.TALK_LINE_SEC; }
    }
    // 回復の時間が来た：まだ話していない途中の会話は飛ばし、最後の会話（次の戦いの予告など）だけ話す
    if (f.t >= s.sec && !f.talk && !f.mission && f.talkIdx < s.talks.length - 1) { f.talkIdx = s.talks.length - 1; f.soon = null; }
    if (f.t >= s.sec && !f.talk && !f.mission && f.talkIdx >= s.talks.length) {
      ev.push({ type: 'fieldEnd', home: !!s.home });
      if (s.home) { run.done = true; run.seg = null; run.field = null; } else enterBattle(run);
    }
    return ev;
  }

  // クールダウンを早く終える（右上のボタン）。残りの会話は飛ばして、次の戦闘へ
  function skipField(run) {
    const f = run.field, s = run.seg;
    if (!f || s.home) return endHome(run);
    f.t = s.sec; f.talk = null; f.mission = null; f.soon = null; f.talkIdx = s.talks.length;
    return [{ type: 'talkEnd' }, ...stepField(run, 0, { power: 0, cad: 0 })];
  }

  // 帰り道を途中で終える（Enter）。会話中は会話を進める
  function endHome(run) {
    if (!run.seg || !run.seg.home) return [];
    if (run.field.talk) return nextLine(run);
    run.done = true; run.seg = null; run.field = null;
    return [{ type: 'fieldEnd', home: true }];
  }

  // 会話を1行進める（Enter でも呼ぶ）
  function nextLine(run, ev = []) {
    const t = run.field && run.field.talk; if (!t) return ev;
    const talk = talkOf(run, t.id);
    t.lineT = 0;
    if (t.line < talk.lines.length - 1) { t.line++; ev.push({ type: 'talkLine', line: t.line }); return ev; }
    if (t.result === undefined && talk.effect) {   // 最後の行のあとに効果を見せる
      t.result = applyEffect(run, talk.effect);
      ev.push({ type: 'talkEffect', text: t.result });
      return ev;
    }
    run.field.talk = null;
    ev.push({ type: 'talkEnd' });
    return ev;
  }

  // ミッションの今の目標。[始め, 終わり] なら時間とともにまっすぐ変わる（2026-10-20 ユーザー判断）
  const ramp = (v, m) => Array.isArray(v) ? v[0] + (v[1] - v[0]) * Math.min(1, m.t / m.sec) : v;
  const missionCad = m => Math.round(ramp(m.cad, m));
  // フィールドの ERG の目標（FTP 比）：ミッション中はミッションの強さ、ふだんはプランの回復（ウォームアップ）の強さ
  const fieldFrac = run => run.field && run.field.mission ? ramp(run.field.mission.frac, run.field.mission) : run.seg && run.seg.frac != null ? run.seg.frac : D.ERG_REST;

  // 次の戦闘の相手と条件
  function battleSetup(run) {
    if (run.pending) return run.pending;
    const s = run.seg;
    run.pending = { heroId: run.heroId, lv: run.prog.level, waves: s.waves, kind: s.kind, tolBonus: run.tolBonus, buffs: { ...run.buffs }, bg: s.bg };
    return run.pending;
  }

  // 戦闘が終わったら呼ぶ（HP は無いので、負けて終わることはない）。wins・fled：倒した・逃げられた敵の数。
  // dealt・taken：与えた・受けたダメージ。stars：合致率が倒す線を超えたドラムの数（星）
  // skipped：戦闘をとばした（2026-10-23 ユーザー要望。左上のボタン）。星・ダメージ・点数・倒した数は入れず、まとめの行に「スキップ」と出す。
  // 浮いた時間（その戦闘の長さの残り）は次の回復に回す。ボスをとばしたら、倒していないのでレベルは上がらず、この旅ではもうボスを出さない
  // （1日の分は数え続けるので、次の旅でまたボスが出る）
  function finishBattle(run, { sec = 0, defeated = true, wins = defeated ? 1 : 0, fled = defeated ? 0 : 1, dealt = 0, taken = 0, stars = 0, crits = 0, drums = null, skipped = false } = {}) {
    if (skipped) { defeated = false; wins = 0; fled = 0; dealt = 0; taken = 0; stars = 0; crits = 0; }
    if (drums == null) drums = skipped ? 0 : run.seg.waves.reduce((a, w) => a + w.reels.length, 0);   // 回したドラムの数（勲章の「完璧な旅」）
    const saved = skipped ? Math.max(0, B.lengthOf(run.seg.waves) - sec) : 0;
    run.clock += sec; run.stats.battleSec += sec; run.stats.stars += stars; run.stats.crits = (run.stats.crits || 0) + crits; run.stats.drums = (run.stats.drums || 0) + drums; run.stats.battleStars = (run.stats.battleStars || 0) + stars;
    if (skipped) run.stats.skipped = (run.stats.skipped || 0) + 1;
    run.stats.battles.push({ foes: run.seg.waves.flatMap(w => w.foes), kind: run.seg.kind, defeated, wins, fled, dealt, taken, stars, sec: Math.round(sec), ...(skipped ? { skipped: true } : {}) });
    run.stats.wins += wins; run.stats.fled += fled;
    run.stats.dealt += dealt; run.stats.taken += taken;
    run.buffs = {}; run.rival = null; run.pending = null;
    if (skipped) {
      if (run.seg.kind === 'boss') run.bossAt = null;
      return planField(run, 'クールダウン', run.day.rest.sec + saved);
    }
    if (run.seg.kind === 'boss') {
      // ボスのあとにレベルが上がる（倒しても倒せなくても）。12 を終えたら称号を出して2周目へ
      const p = run.prog, from = p.level;
      p.level = from >= D.MAX_LEVEL ? 1 : from + 1; if (from >= D.MAX_LEVEL) p.round++;
      p.elite = false; run.setNo = 0;
      const best0 = p.best || 1; p.best = Math.max(best0, from >= D.MAX_LEVEL ? D.MAX_LEVEL : p.level);
      run.levelUps.push({ from, to: p.level, legend: from >= D.MAX_LEVEL, items: D.itemsOf(run.heroId, p.best).filter(it => it.lv > best0) });
      run.day = D.dayOf(run.planId, p.level); run.dayStart = run.clock; setBoss(run);
      // 次の1日の本番が入るほど時間が残っていれば続けて走る。残っていなければ帰り道
      const left = run.total - run.clock;
      const home = run.short ? run.short.home : HOME_SEC, least = run.short ? MIN_BATTLE : Math.min(...run.day.sets.map(st => B.lengthOf(st.waves)));
      if (left < home + MIN_FIELD + least) return goHome(run);
      return planField(run, 'クールダウン');
    }
    planField(run, 'クールダウン');
  }

  // 1戦だけ（練習）：職業のプランから1セットを選び（setNo で決めることもできる。テスト用）、海岸の敵を出す
  function practiceSetup(heroId, rng = Math.random, setNo = null) {
    const run = createRun({ heroId, minutes: 60, rng }), sets = run.plan.sets;
    const c = castFoes(run, sets[setNo != null ? setNo : Math.floor(rng() * sets.length)], 0);
    return { heroId, waves: c.waves, kind: c.kind, bg: null };
  }

  // 女王の試練のあとの1戦（2026-10-26 ユーザー判断。無料版ではこれが唯一の戦闘）：試練のあとのクールダウン（TRIAL_COOL 秒）の始め（TRIAL_GO_AT 秒）に
  // 女王が「3分 脚を休めたら、新しい FTP で敵と戦ってみせよ」と言い（2026-10-28 ユーザー判断。前は終わりに言い、何のために走っているのか分からなかった）、走っている所の地域の雑魚1体とドラム3本（TRIAL_SET）で戦い、帰り道1分で終える。
  // 村人の予告は出さない。キャラクターの進み具合（レベル・ボス・中ボス）には数えない（prog は返さない。elite を立てて中ボスを出さない）
  const TRIAL_COOL = 180, TRIAL_GO_AT = 2;
  const TRIAL_SET = { waves: [{ foes: 1, reels: [{ sec: 60, frac: 0.85, cad: 88 }, { sec: 60, frac: 0.9, cad: 95 }, { sec: 60, frac: 0.95, cad: 102 }] }] };
  function createTrialRun({ heroId, rng = Math.random, prog = newProg(), areaNow = null }) {
    const run = createRun({ heroId, minutes: 15, rng, prog: { ...prog, elite: true }, cont: true, brief: false, areaNow });
    Object.assign(run, { trial: true, short: { n: 1, warm: TRIAL_COOL, home: 60 }, shortPlan: [{ field: TRIAL_COOL, set: TRIAL_SET }], bossAt: null, segNo: 0, next: null, seg: null, field: null });
    run.total = TRIAL_COOL + B.lengthOf(TRIAL_SET.waves) + run.short.home;
    const queen = { face: 'queen', name: D.WORLD.queen };   // 女王は道端には立たない（会話の窓に顔と名前だけ）
    run.talkDefs.trialGo = { ...queen, lines: [['npc', I.t('trial.toBattle', { m: Math.round(TRIAL_COOL / 60) })]] };
    run.talkDefs.trialHome = { ...queen, lines: [['npc', I.t('trial.afterBattle')]] };
    planShort(run, 'クールダウン', TRIAL_COOL, D.ERG_REST);
    return run;
  }

  const score = run => run.stats.stars * D.STARS.point;   // まとめの点数

  const api = { TRIAL_COOL, TRIAL_SET, createTrialRun, outline, setKind, fitSet, SHORT, MIN_BATTLE, SCENES, score, missionCad, ROUTE, STAGE_NAME, MINUTES, BOSS_BEFORE, DAY_SEC, MISSION_NEED, newProg, progressOf, dayMin, fieldFrac, talkOf, castFoes, practiceSetup, createRun, stepField, nextLine, endHome, skipField, battleSetup, finishBattle, seg, applyEffect };
  if (isNode) module.exports = api;
  else root.RQ.course = api;
})(typeof window !== 'undefined' ? window : globalThis);
