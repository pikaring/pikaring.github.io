/* スロット戦闘の進み方。画面にもトレーナーにも触らない純粋な状態機械。
   流れ（2026-10-19 ユーザー判断。HP は持たない）：敵が現れる（intro）→ ドラムを1つずつ回す（reel）→ 結果を見せる（result）→ 終わり（end）。
   1回の戦闘は1〜3のウェーブで、ウェーブは間を空けずに続く（連戦。2026-10-20 ユーザー判断）。ウェーブはドラム3つで、
   敵が1体なら3つで攻め（3つの合致率の平均が倒す線以上なら倒す）、小さな雑魚3体なら1つずつで1体を攻める。
   ドラムが止まるたびに、その合致率（最近の回転を重く数える平均）でダメージを与える。倒せなかった敵は、最後に攻撃してきて逃げていく。
   step(b, dt, {power, cad}) を時計から呼ぶと、起きたこと（events）を返す。loadOf(b) がトレーナーに送る負荷を返す。 */
(function (root) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.RQ.data;
  const { BATTLE, STARS, reelFrac, ERG_REST, DIFFICULTY, HEROES, ENEMIES, KIND, TUNE } = D;
  const clamp01 = x => Math.max(0, Math.min(1, x));

  // waves：[{ foes: [敵の ID（1つか3つ）], reels: [ドラム3つ] }]。kind：mob | elite | boss（敵の攻撃の強さ）
  // tolBonus：旅の終わりまでの判定の加護（rpm）。buffs：この戦闘だけの加護 { tol: rpm }
  // ftp と difficulty（DIFFICULTY のキー）で、目標パワーが決まる
  function createBattle({ heroId, waves, kind = 'mob', ftp = 150, difficulty = 'normal', tolBonus = 0, buffs = {} }) {
    const drums = [];   // すべてのドラムを順に。foe：攻める敵（foes の番号）
    const foes = [];
    waves.forEach((w, wi) => {
      const base = foes.length;
      w.foes.forEach(id => foes.push({ id, def: ENEMIES[id], wave: wi, matches: [], defeated: false, done: false }));
      w.reels.forEach((r, j) => drums.push({ ...r, wave: wi, slot: j, foe: base + (w.foes.length === 3 ? j : 0), rage: w.rage === j }));   // rage：鬼王が本気を出して、後半が始まるドラム
    });
    return {
      hero: { id: heroId, def: HEROES[heroId] }, kind, k: KIND[kind],
      tolBonus: Math.min(TUNE.tolBonusMax, tolBonus), buffs: { tol: buffs.tol || 0 },
      waves, foes, drums, ftp, mul: (DIFFICULTY[difficulty] || DIFFICULTY.normal).mul,
      phase: 'intro',        // intro | reel | result | end
      t: 0,                  // 今の段の経過秒
      reel: 0,               // 今のドラム（drums の番号）
      match: 0, sum: 0, judged: 0,   // 今のドラム：最近の回転を重く数える平均（EMA）、合致 × 秒の和（単純な平均のため）、判定した秒
      now: 0, inCond: false, // now：今この瞬間の合致（0〜1）。inCond：合致率が倒す線を超えているか（判定の前は、今この瞬間の合致で）
      pace: 0,               // 今の回転が目標より：-1＝遅い、0＝合う、1＝速い（画面の色）
      duel: { next: 'hero', t: 0 },   // 間合いのある戦い：次に攻める側（'hero' | 'foe'。交互）と、次の攻撃までの時計
      stars: 0, crits: 0, dealt: 0, taken: 0, wins: 0, fled: 0,   // まとめ用
      golds: [false, false, false],   // 並んだドラム3つ（画面のドラムの並び＝slot を3で割った余り）が会心だったか
      defeated: false,       // すべての敵を倒したか
    };
  }

  // 間合いのある戦い（2026-10-22 ユーザー判断「交互に攻めて、90％以上だったら敵の攻撃を弾き返す。90以下だったらこちらの攻撃が弾かれる」。
  // 見せるだけで、判定には効かない）：主人公と敵が交互に、everySec ごとに通常攻撃する。結果は、その時の合致率が倒す線以上（inCond）か：
  // 以上なら 主人公の攻撃＝hit（当たる）・敵の攻撃＝parried（主人公が弾き返す）、未満なら 主人公の攻撃＝parried（弾かれる）・敵の攻撃＝hit（当たる）。
  // 出来事：{ type: 'attack', who: 'hero' | 'foe', result: 'hit' | 'parried', foe }
  const attackResult = (who, inCond) => (who === 'hero') === !!inCond ? 'hit' : 'parried';
  function duelStep(b, dt, r, ev) {
    const d = b.duel, T = TUNE.duel;
    if (b.t < b.grace) return;   // 殴り合いは 3・2・1 が終わってから（2026-10-29 試走 No.16 ユーザー判断。前は 2.5 秒から）
    d.t += dt;
    if (d.t >= T.everySec && b.t < r.sec - 1) {   // ドラムが止まる直前は攻めない（必殺技・反撃に重ねない）
      d.t = 0; const who = d.next; d.next = who === 'hero' ? 'foe' : 'hero';
      ev.push({ type: 'attack', who, result: attackResult(who, b.inCond), foe: r.foe });
    }
  }

  // 戦闘全体の長さ（秒）。旅の組み立てに使う
  const lengthOf = waves => BATTLE.introSec + waves.reduce((a, w) => a + w.reels.reduce((b, r) => b + r.sec, 0), 0) + BATTLE.resultSec;

  // 今のドラム（回していないときは次に回すドラム）
  const reelOf = b => b.drums[Math.min(b.drums.length - 1, b.reel)];
  // ドラムの属性（演出の色だけ）：低回転＝格闘、中回転＝剣術、高回転＝魔法
  const attrOf = r => r.cad <= TUNE.attrCad.g ? 'g' : r.cad <= TUNE.attrCad.c ? 'c' : 'p';
  // ドラムを回す間の目標パワー（W）。マイクロバーストのように、ドラムの中で変わるものもある
  const targetPower = b => Math.round(b.ftp * reelFrac(reelOf(b), b.phase === 'reel' ? b.t : 0) * b.mul);
  // 今のドラムの回転数
  const bandCenter = b => reelOf(b).cad;
  // 判定のゆるさ（rpm）：ここまでのずれは、ずれていないことにする。加護で広がる
  const tolOf = b => TUNE.tol + b.tolBonus + b.buffs.tol;

  // トレーナーに送る負荷（いつも ERG。トレーニング中はギアを一切変えなくてよい）。ドラムの外はクールダウン
  function loadOf(b) {
    if (b.phase !== 'reel') return { erg: Math.round(b.ftp * ERG_REST) };
    return { erg: targetPower(b) };
  }

  // 合致（0〜1）：回転数の近さ。100rpm を言われて 90rpm なら、ゆるさのぶんを引いて約0.9。
  // パワーが目標の powerSlack より低ければ、その分だけ下げる（ERG なので、ふつうは目標に合う）
  // 目標が 0 W（足を止めて ERG を 0 にした間。ergguard.js）や、値が数でないときは、パワーを見ない・0 とする
  // （2026-11-07 試走：0 ÷ 0 で合致率が NaN になり、そのドラムが最後まで NaN のまま 0% で終わった）
  function closeness(cad, target, tol, power, watts, checkPower) {
    if (!Number.isFinite(cad) || !(target > 0)) return 0;
    const c = clamp01(1 - Math.max(0, Math.abs(cad - target) - tol) / target);
    if (!checkPower || !(watts > 0)) return c;
    const k = clamp01((Number.isFinite(power) ? power : 0) / (watts * TUNE.powerSlack));
    return c * k;
  }
  // ドラムの中で強さが変わってから何秒か（変わらないドラムは、ドラムの始めから）
  function sinceChange(r, t) {
    if (!r.steps) return t;
    let x = t % r.steps.reduce((a, s) => a + s[0], 0);
    for (const [sec] of r.steps) { if (x < sec) return x; x -= sec; }
    return x;
  }

  // ドラムの中で実際に走る強弱（[秒, FTP 比] を、ドラムの長さ sec で切る）。短い旅で縮めたドラム（course.js の fitSet）は、強弱の並びがそのままなので、
  // 60 秒の「10秒つよく 50秒かるく」を 40 秒に縮めると、かるくは 30 秒（2026-10-27 試走：メッセージが 50 秒のままだった）。ドラムが並びより長ければ、並び1回ぶんのまま
  function stepsIn(steps, sec) {
    if (!steps) return null;
    const out = []; let left = sec;
    for (const [s, f] of steps) { if (left <= 0) break; const k = Math.min(s, left); out.push([k, f]); left -= k; }
    return out;
  }

  // ダメージ（2026-10-20 ユーザー判断）：ドラムが止まるたびに、基礎点 ×（1 ＋ 合致率）。会心（合致率95%以上）は基礎点の3倍、金の星3つの3つ目は5倍。
  // 基礎点はそのドラムの目標パワーが FTP の何%か（強弱が変わるドラムは秒数で重みを付けた平均。難易度も掛ける）
  const reelAvg = r => r.steps ? r.steps.reduce((a, s) => a + s[0] * s[1], 0) / r.steps.reduce((a, s) => a + s[0], 0) : r.frac;
  const basePoint = (b, i = b.reel) => Math.round(100 * reelAvg(b.drums[i]) * b.mul);
  const isCrit = match => match >= TUNE.crit;
  // gold3：並んだドラム3つとも会心（金の星3つ）の3つ目。特別な攻撃で、基礎点の TUNE.gold3Mul 倍（2026-10-28 ユーザー判断：3倍では弱く見えた）
  const damageOf = (base, match, gold3 = false) => gold3 ? base * TUNE.gold3Mul : isCrit(match) ? base * TUNE.critMul : Math.round(base * (1 + clamp01(match)));

  // 今のドラムの合致率（判定を始める前は null）＝「判定を始めてからの単純な平均」と「最近の回転を重く数える平均（EMA。時定数 TUNE.matchTau 秒）」の平均
  // （2026-10-22 ユーザー判断。前は高いほう）。最後に大きく落としても倒せるが会心は出ない。前半に外しても、あとで合わせれば取り戻せる
  const matchAvg = b => b.judged > 0 ? b.sum / b.judged : null;
  const matchNow = b => b.judged > 0 ? (b.match + b.sum / b.judged) / 2 : null;
  function addMatch(b, now, dt) {
    if (!Number.isFinite(now)) now = 0;   // NaN を足すと、そのドラムの合致率が最後まで NaN になる
    if (!(dt > 0)) return;
    b.match = b.judged > 0 ? b.match + (now - b.match) * (1 - Math.exp(-dt / TUNE.matchTau)) : now;   // EMA：判定の始まりは、その時点の合致から
    b.sum += now * dt; b.judged += dt;
  }
  // 今の回転が目標より遅いか速いか（ゆるさ ＋ paceRpm の内は合う）
  const paceOf = (cad, target, tol) => cad < target - tol - TUNE.paceRpm ? -1 : cad > target + tol + TUNE.paceRpm ? 1 : 0;

  function enter(b, phase, ev, extra = {}) { b.phase = phase; b.t = 0; ev.push({ type: phase, ...extra }); }
  function startReel(b, ev) {
    b.match = 0; b.sum = 0; b.judged = 0;
    b.count = null;   // 3・2・1 の出した数
    b.grace = TUNE.graceSec;   // このドラムの判定の始まり（秒）。前のドラムの演出が長いときは、画面が delayCount で遅らせる
    b.duel.t = TUNE.duel.everySec; b.duel.next = 'hero';   // 最初の攻撃は、判定が始まる時（3・2・1 が終わった時）に、主人公から
    const r = reelOf(b);
    if (r.slot === 0 && r.wave > 0) ev.push({ type: 'wave', wave: r.wave, foes: b.waves[r.wave].foes });   // 次のウェーブ（間を空けない）
    if (r.rage) ev.push({ type: 'rage' });   // 鬼王が本気を出す（後半の始まり）
    enter(b, 'reel', ev, { reel: b.reel, wave: r.wave, slot: r.slot, cad: r.cad, watts: targetPower(b), sec: r.sec, steps: stepsIn(r.steps, r.sec), finish: !!r.finish });   // finish：大ボスのとどめの1本
  }

  function step(b, dt, inp) {
    const ev = [];
    if (b.phase === 'end') return ev;
    if (!(dt >= 0) || !Number.isFinite(dt)) dt = 0;
    inp = { power: Number.isFinite(inp.power) ? inp.power : 0, cad: Number.isFinite(inp.cad) ? inp.cad : 0, erg: Number.isFinite(inp.erg) ? inp.erg : null };
    b.t += dt;
    if (b.phase === 'intro') {
      if (b.t >= BATTLE.introSec) startReel(b, ev);
    } else if (b.phase === 'reel') {
      const r = reelOf(b);
      // 回転数を合わせ直し、負荷が変わるまでに時間がかかるので、ドラムの最初の数秒は判定しない。
      // 強弱が変わるドラムでは、変わった直後のパワーも見ない
      // inp.erg：実際に送っている目標（スパイラル対策で抜いた・戻している間は目標より低い）。そのぶんパワーを低く見ない
      const watts = inp.erg != null ? Math.min(targetPower(b), inp.erg) : targetPower(b);
      b.now = closeness(inp.cad, r.cad, tolOf(b), inp.power, watts, sinceChange(r, b.t) >= TUNE.powerGraceSec);
      // 区間の始まりの合図（2026-10-24 ユーザー判断）：ERG はドラムの始め（0秒）で切り替え、判定しない最初の5秒の中で 3・2・1（2・3・4秒）。5秒で判定が始まる（delayCount で遅らせたら、そのぶんあと）
      const cn = Math.ceil(b.grace - b.t - 1e-9);
      if (cn >= 1 && cn <= TUNE.countSec && cn !== b.count) { b.count = cn; ev.push({ type: 'count', n: cn }); }
      b.pace = paceOf(inp.cad, r.cad, tolOf(b));
      // 印（2026-10-25 ユーザー判断。2026-10-27 に ±1 回転を「合う」に）：色とは別に、今の回転（四捨五入）が目標より 2 以上低い＝-1（▲）・±1 以内＝0（●）・2 以上高い＝1（▼）。判定しない最初の5秒も
      { const d = Math.round(inp.cad) - r.cad; b.cadDir = Math.abs(d) <= 1 ? 0 : Math.sign(d); }
      if (b.t > b.grace) addMatch(b, b.now, dt);
      b.inCond = (b.judged > 0 ? matchNow(b) : b.now) >= TUNE.winLine;
      duelStep(b, dt, r, ev);
      if (b.t >= r.sec) {
        const match = matchNow(b) || 0, crit = isCrit(match), star = match >= STARS.reel;
        // 金の星3つ（2026-10-27 の特別な攻撃）：画面に並んだドラム3つ（slot 0〜2、3〜5）とも会心なら、3つ目
        if (r.slot % 3 === 0) b.golds.fill(false);
        b.golds[r.slot % 3] = crit;
        const gold3 = crit && r.slot % 3 === 2 && b.golds.every(Boolean);
        const base = basePoint(b), dmg = damageOf(base, match, gold3), foe = b.foes[r.foe];
        foe.matches.push(match); b.dealt += dmg;
        if (star) b.stars++;
        if (crit) b.crits++;
        // skill：倒す線以上なら必殺技（名前と演出の種類。会心は上位の技）。届かなければ null（敵の反撃）
        const sk = D.SKILLS[b.hero.id] || D.SKILLS.warrior, skill = match >= TUNE.winLine ? { name: gold3 && sk.gold3 ? sk.gold3 : crit ? sk.crit : sk.skill, fx: sk.fx, crit } : null;   // 金の星3つは gold3 の名前（2026-10-29）
        ev.push({ type: 'stop', reel: b.reel, wave: r.wave, slot: r.slot, foe: r.foe, match, crit, gold3, star, base, dmg, skill });
        // その敵のドラムが終わったら、倒したかを決める
        let left = b.drums.slice(b.reel + 1).some(d => d.foe === r.foe);
        // 鬼王は、1本でも 90% 未満なら、その時点で逃げる（残りのドラムは回さない。2026-10-26 ユーザー判断）
        if (left && b.kind === 'boss' && match < TUNE.winLine) { left = false; b.drums = b.drums.slice(0, b.reel + 1); }
        if (!left) {
          foe.done = true;
          foe.defeated = foe.matches.every(x => x >= TUNE.winLine);   // そのドラムが全部 90% 以上（星）で倒す。1本でも届かなければ、敵は最後に逃げる（2026-10-26 ユーザー判断：平均で倒すのをやめた）
          if (foe.defeated) b.wins++; else b.fled++;
          ev.push({ type: 'foeEnd', foe: r.foe, id: foe.id, defeated: foe.defeated });
        }
        b.reel++;
        if (b.reel < b.drums.length) startReel(b, ev);
        else {
          b.defeated = b.fled === 0;
          enter(b, 'result', ev, { defeated: b.defeated, wins: b.wins, fled: b.fled, dealt: b.dealt });
        }
      }
    } else if (b.phase === 'result') {
      if (b.t >= BATTLE.resultSec) {
        // 倒せなかった敵は攻撃してきて、逃げていく
        b.taken = b.fled ? b.k.dmg : 0;
        enter(b, 'end', ev, { defeated: b.defeated, dmg: b.taken, fled: b.foes.filter(f => !f.defeated).map(f => f.id) });
      }
    }
    return ev;
  }

  // 3・2・1 と判定の始まりを sec 秒遅らせる（2026-10-29 試走 No.16 ユーザー判断 A案）：前のドラムの必殺技・金の星3つの演出や、次のウェーブの敵が出るのが長いとき、
  // 演出が終わってから 3・2・1 を始める（「3」と同時に「○○RPMで まわせ！」）。ドラムの長さと ERG の切り替え（ドラムの始め）は変えないので、判定する秒がそのぶん減る。
  // 3・2・1 が始まる前だけ効く。判定の始まりはドラムの半分まで。遅らせたら true
  function delayCount(b, sec) {
    if (b.phase !== 'reel' || b.count != null || !(sec > 0)) return false;
    b.grace = Math.max(b.grace, Math.min(TUNE.graceSec + sec, reelOf(b).sec / 2));
    return true;
  }

  // 戦闘をとばす（2026-10-23 ユーザー要望）：今のウェーブを含む連戦の残りを終わらせ、残っている敵は逃げていく。
  // 星・ダメージ・点数は数えない（course.js の finishBattle が skipped を見て入れない）。終わっていれば何もしない
  function skip(b) {
    const ev = [];
    if (b.phase === 'end' || b.skipped) return ev;
    b.skipped = true; b.defeated = false; b.taken = 0;
    const fled = b.foes.filter(f => !f.defeated).map(f => { f.done = true; return f.id; });
    enter(b, 'end', ev, { defeated: false, skipped: true, dmg: 0, fled });
    return ev;
  }

  // 今の段の進み具合（0〜1）と残り秒。画面用
  function progress(b) {
    const len = { intro: BATTLE.introSec, reel: reelOf(b).sec, result: BATTLE.resultSec }[b.phase] || 1;
    return { p: clamp01(b.t / len), left: Math.max(0, len - b.t) };
  }

  const api = { createBattle, step, skip, delayCount, loadOf, targetPower, bandCenter, current: reelOf, attrOf, tolOf, closeness, matchNow, matchAvg, paceOf, duelStep, attackResult, progress, lengthOf, basePoint, damageOf, isCrit, stepsIn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RQ.battle = api;
})(typeof window !== 'undefined' ? window : globalThis);
