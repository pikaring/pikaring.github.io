/* 効果音。音声ファイルは使わず、短い音符の並び（sequencer.js の書き方）を合成器（synth.js）の効果音のバスで鳴らす。
   ・DEFS：効果音の定義（データ）。1つの効果音は1〜3声部。bpm は「1拍の長さ」を決めるだけ（短い音を書きやすいように速くしてある）
   ・battleCues：戦闘の出来事（battle.js の step が返す events）と戦闘の状態から、鳴らす効果音と曲のテンポを決める（純粋。node のテストで確かめる）
   ・createSfx：鳴らす係。合成器は引数で受け取る（AudioContext に触るのは synth.js だけ）
   会話の1字ずつの音（type）と、合致率が90%を越えた／割れたときの合図（ok・ng）は、設定で別々に止められる（2026-10-21 ユーザー要望：うるさければ減らす）。 */
(function (root) {
  const DEFS = {
    // メニュー
    decide: { bpm: 900, tracks: [{ ch: 'pulse', duty: 0.25, seq: 'C6:1 G6:1.5' }] },
    cancel: { bpm: 900, tracks: [{ ch: 'pulse', duty: 0.25, seq: 'G5:1 C5:1.5' }] },
    cursor: { bpm: 1200, tracks: [{ ch: 'pulse', duty: 0.125, vol: 0.5, seq: 'A5:1' }] },
    type: { bpm: 3000, tracks: [{ ch: 'pulse', duty: 0.5, vol: 0.3, seq: 'A5:1' }] },                         // 会話の1字ずつ
    turn: { bpm: 1400, tracks: [{ ch: 'pulse', duty: 0.5, vol: 0.7, seq: 'E5:1 A5:1.5' }] },                    // 分かれ道の向きの切り替え
    shutter: { bpm: 900, tracks: [{ ch: 'noise', vol: 1, seq: 'h:1 r:1 o:1' }, { ch: 'pulse', duty: 0.125, vol: 0.4, seq: 'C7:0.5' }] },   // スクリーンショット
    // 戦闘
    encounter: { bpm: 1500, tracks: [{ ch: 'pulse', duty: 0.25, seq: 'C5:1 E5:1 G5:1 C6:1 E6:1 G6:1 C7:3' }, { ch: 'pulse', duty: 0.125, vol: 0.6, seq: 'r:1 C4:1 E4:1 G4:1 C5:1 E5:1 G5:3' }, { ch: 'noise', vol: 0.8, seq: 'r:4 c:5' }] },
    boss: { bpm: 240, tracks: [{ ch: 'brass', seq: 'D3:1 D3:0.5 D3:0.5 Bb3:3' }, { ch: 'horn', seq: 'A2:2 F3:3' }, { ch: 'timp', seq: 'D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:3' }] },
    wave: { bpm: 600, tracks: [{ ch: 'brass', vol: 0.9, seq: 'G4:1 C5:1 G5:2' }, { ch: 'horn', vol: 0.8, seq: 'E4:1 E4:1 E4:2' }] },   // つぎは ○○だ！
    count: { bpm: 900, tracks: [{ ch: 'pulse', duty: 0.5, vol: 0.5, seq: 'A5:1' }] },                          // 3・2・1（判定が始まる前の合図。2026-10-24 プログラム担当が足した）
    judge: { bpm: 900, tracks: [{ ch: 'pulse', duty: 0.5, vol: 0.6, seq: 'A5:1 r:0.5 E6:1.5' }] },             // 判定が始まる（ドラムの最初の5秒のあと）
    ok: { bpm: 1000, tracks: [{ ch: 'pulse', duty: 0.125, vol: 0.55, seq: 'E6:1 A6:1.5' }] },                   // 合致が90%を越えた
    ng: { bpm: 1000, tracks: [{ ch: 'pulse', duty: 0.125, vol: 0.55, seq: 'A5:1 E5:1.5' }] },                   // 合致が90%を割った
    stop: { bpm: 800, tracks: [{ ch: 'noise', vol: 0.8, seq: 'h:1' }, { ch: 'pulse', duty: 0.5, vol: 0.6, seq: 'G4:0.5' }] },   // ドラムが止まる
    damage: { bpm: 900, tracks: [{ ch: 'noise', vol: 1, seq: 's:1 s:1.5' }, { ch: 'pulse', duty: 0.5, vol: 0.7, seq: 'C4:0.5 G3:0.5 C3:1.5' }] },
    star: { bpm: 900, tracks: [{ ch: 'pulse', duty: 0.25, vol: 0.8, seq: 'E6:0.5 G6:0.5 C7:2' }, { ch: 'pulse', duty: 0.125, vol: 0.4, seq: 'r:1 E6:0.5 G6:0.5 C7:2' }] },
    crit: { bpm: 900, tracks: [{ ch: 'pulse', duty: 0.25, seq: 'G5:0.5 C6:0.5 E6:0.5 G6:0.5 C7:3' }, { ch: 'pulse', duty: 0.125, vol: 0.5, seq: 'r:1 G5:0.5 C6:0.5 E6:0.5 G6:0.5 C7:2' }, { ch: 'noise', vol: 0.9, seq: 'r:2 c:3' }] },
    defeat: { bpm: 1500, tracks: [{ ch: 'pulse', duty: 0.5, seq: 'C6:1 G5:1 E5:1 C5:1 G4:1 E4:1 C4:3' }, { ch: 'noise', vol: 0.8, seq: 'o:2 s:1 s:1 s:3' }] },   // 敵を倒す
    victory: { bpm: 480, tracks: [{ ch: 'brass', seq: 'G4:0.5 C5:0.5 E5:0.5 G5:1.5 E5:0.5 G5:3' }, { ch: 'horn', vol: 0.8, seq: 'E4:0.5 E4:0.5 G4:0.5 C5:1.5 C5:0.5 B4:3' }, { ch: 'timp', seq: 'C3:1.5 G2:1.5 C3:3' }] },   // まものを ぜんぶ たおした
    // 間合いのある戦い（2026-10-22）：通常攻撃は数秒おきに鳴るので、小さく短く
    swing: { bpm: 1400, tracks: [{ ch: 'noise', vol: 0.45, seq: 'h:1' }, { ch: 'pulse', duty: 0.125, vol: 0.22, seq: 'E6:0.5' }] },          // 主人公の通常攻撃（当たる瞬間）
    bump: { bpm: 1000, tracks: [{ ch: 'noise', vol: 0.5, seq: 'k:1' }, { ch: 'pulse', duty: 0.5, vol: 0.25, seq: 'D4:0.5' }] },              // 敵の通常攻撃（主人公に当たる）
    parry: { bpm: 900, tracks: [{ ch: 'pulse', duty: 0.125, vol: 0.4, seq: 'A6:1.5' }, { ch: 'pulse', duty: 0.25, vol: 0.25, seq: 'D#7:1.5' }, { ch: 'noise', vol: 0.35, seq: 'h:1' }] },   // 弾く「キン」（2つの高い音をずらして重ね、金属っぽく）
    counter: { bpm: 700, tracks: [{ ch: 'noise', vol: 0.8, seq: 's:1' }, { ch: 'pulse', duty: 0.5, vol: 0.6, seq: 'G3:0.5 E3:1' }] },         // 届かなかったドラムのあとの敵の反撃（主人公がよろける）
    // 必殺技（data.js の SKILLS の fx ごと）。当たる瞬間に鳴らす。会心はこれに critHit（シンバルと低いティンパニ）を重ねる
    skill_slash: { bpm: 1500, tracks: [{ ch: 'noise', vol: 0.8, seq: 'o:1 r:1 s:2' }, { ch: 'pulse', duty: 0.25, vol: 0.8, seq: 'C7:0.25 G6:0.25 D6:0.25 A5:0.25 E5:2' }] },   // 閃き（戦士）
    skill_fire: { bpm: 1200, tracks: [{ ch: 'noise', vol: 0.8, seq: 's:0.5 s:0.5 o:2' }, { ch: 'pulse', duty: 0.5, vol: 0.7, seq: 'C4:0.25 G4:0.25 C5:0.25 G5:0.25 C6:2' }] },   // 炎（魔法使い）
    // 連打（武闘家）。画面の当たり（battle-view.js の punchFx）と同じ数・間隔：必殺技は 0.11 秒ごとに5つ、会心は 0.09 秒ごとに8つ
    skill_fists: { bpm: 273, tracks: [{ ch: 'noise', vol: 0.8, seq: 'k:0.5 s:0.5 k:0.5 s:0.5 o:1' }, { ch: 'pulse', duty: 0.25, vol: 0.6, seq: 'C5:0.5 D5:0.5 E5:0.5 F5:0.5 G5:1' }] },
    skill_fists_crit: { bpm: 333.3, tracks: [{ ch: 'noise', vol: 0.8, seq: 'k:0.5 s:0.5 k:0.5 s:0.5 k:0.5 s:0.5 k:0.5 o:1' }, { ch: 'pulse', duty: 0.25, vol: 0.6, seq: 'C5:0.5 D5:0.5 E5:0.5 F5:0.5 G5:0.5 A5:0.5 B5:0.5 C6:1' }] },
    // 光の槌（僧侶）：上から落ちて叩きつける（2026-10-22 387adfc）。会心は金色で大きいので、低く重く
    skill_hammer: { bpm: 600, tracks: [{ ch: 'timp', seq: 'C2:2' }, { ch: 'noise', vol: 0.8, seq: 'k:0.5 s:0.5 o:1' }, { ch: 'brass', vol: 0.7, seq: 'C4:0.5 G4:1.5' }] },
    skill_hammer_crit: { bpm: 500, tracks: [{ ch: 'timp', vol: 1.2, seq: 'G1:2.5' }, { ch: 'timp', vol: 0.8, seq: 'r:0.25 C2:2.25' }, { ch: 'noise', vol: 1, seq: 'k:0.5 k:0.5 o:1.5' }, { ch: 'brass', vol: 0.85, seq: 'C3:0.5 G3:0.5 C4:1.5' }] },
    // 必殺技の前の「ため」（2026-10-23）：stop から、ふつう 1.0 秒・会心 1.4 秒。上がっていく分散和音（波のように何度も上る）と、下で上がっていくうなり、
    // 後半から増えるきらめき。技の名前を叫ぶ瞬間に向けて盛り上がり、そこで切れる。会心は高く明るい音色で、さらに上まで上る。ほかの音とぶつからないよう小さめ
    charge: { bpm: 600, tracks: [
      { ch: 'pulse', duty: 0.125, vol: 0.3, seq: 'C4:0.5 D4:0.5 E4:0.5 G4:0.5 D4:0.5 E4:0.5 G4:0.5 A4:0.5 E4:0.5 G4:0.5 A4:0.5 C5:0.5 G4:0.5 A4:0.5 C5:0.5 D5:0.5 A4:0.5 C5:0.5 D5:0.5 E5:0.5' },
      { ch: 'tri', vol: 0.45, seq: 'C3:2 D3:2 E3:2 G3:2 A3:2' },
      { ch: 'noise', vol: 0.25, seq: 'r:5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5' }] },
    charge_crit: { bpm: 600, tracks: [
      { ch: 'pulse', duty: 0.25, vol: 0.3, seq: 'G4:0.5 A4:0.5 C5:0.5 D5:0.5 A4:0.5 C5:0.5 D5:0.5 E5:0.5 C5:0.5 D5:0.5 E5:0.5 G5:0.5 D5:0.5 E5:0.5 G5:0.5 A5:0.5 E5:0.5 G5:0.5 A5:0.5 C6:0.5 G5:0.5 A5:0.5 C6:0.5 D6:0.5 A5:0.5 C6:0.5 D6:0.5 E6:0.5' },
      { ch: 'tri', vol: 0.45, seq: 'G3:2 A3:2 C4:2 D4:2 E4:2 G4:2 A4:2' },
      { ch: 'noise', vol: 0.3, seq: 'r:6 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5 h:0.5' }] },
    critHit: { bpm: 600, tracks: [{ ch: 'noise', vol: 0.9, seq: 'c:2' }, { ch: 'timp', seq: 'G2:0.5 C2:1.5' }] },
    attack: { bpm: 600, tracks: [{ ch: 'noise', vol: 1, seq: 'k:1 s:2' }, { ch: 'pulse', duty: 0.5, vol: 0.8, seq: 'E3:1 C3:2' }] },   // 倒せなかった敵の攻撃
    flee: { bpm: 1200, tracks: [{ ch: 'pulse', duty: 0.25, vol: 0.7, seq: 'C5:0.5 E5:0.5 G5:0.5 C6:0.5 r:1 C6:0.5 G5:0.5 E5:0.5 C5:0.5' }] },   // 逃げていく
    levelup: { bpm: 400, tracks: [{ ch: 'brass', seq: 'C5:1 E5:1 G5:1 C6:3' }, { ch: 'horn', vol: 0.8, seq: 'G4:1 C5:1 E5:1 E5:3' }, { ch: 'str', vol: 0.8, seq: 'C4:1 G4:1 C5:1 G5:3' }, { ch: 'timp', seq: 'C3:1 G2:1 C3:1 C3:3' }] },
  };
  const QUIET = { type: 'typeOn', ok: 'cueOn', ng: 'cueOn', judge: 'cueOn', count: 'cueOn' };   // 設定で止められる効果音 → 設定の名前
  const TYPE_GAP = 0.045, CUE_HOLD = 1.0;   // 文字の音の最短の間（秒）。合図は、越えた／割れたまま1秒続いたら鳴らす（行ったり来たりで鳴り続けない）

  /* 戦闘の合図を決める（純粋）。mem：戦闘ごとの覚え（最初は {}）。b：戦闘の状態（battle.js の createBattle）。evs：その回の step の出来事。
     live：いまの合致率（判定の前は null）。dt：経過（秒）。fx：主人公の必殺技の演出（data.js の SKILLS の fx。slash・fire・fists・hammer）。
     鳴らす時刻は、戦闘の画面（battle-view.js）の演出に合わせる：通常攻撃は近づいて 0.36 秒で当たる、必殺技は 0.48 秒で当たる、
     届かなかったときの敵の反撃は 0.85 秒ごろ。ドラムが止まってから 1.5 秒（必殺技を見せる間）は、通常攻撃を鳴らさない（画面も攻撃を出さない）
     返り値：{ cues: [{ id, delay（秒） }], tempo（曲の BPM。変えないときは null） } */
  const ATK_HIT = 0.36, SKILL_HIT = 0.5, COUNTER_HIT = 0.85, BUSY = 1.5;
  const FX_LAND = { hammer: 0.32 };
  const CHARGE = 1.0, CHARGE_CRIT = 1.4;   // 必殺技の前の「ため」の長さ（秒。battle-view.js の CHARGE_MS・CHARGE_CRIT_MS と同じ。2026-10-23）。ためを始めるのはドラムが止まった瞬間   // 演出が始まってから当たるまで（秒）。僧侶の槌は上から落ちてくるので遅い（battle-view.js の maceParts・style.css の mace-drop）
  function battleCues(mem, b, evs, live, dt, fx) {
    const cues = [], at = (id, delay = 0) => cues.push({ id, delay });
    let tempo = null;
    if (!mem.started) {   // 戦闘の始まり：敵が現れる。曲は最初のドラムの回転数で始める
      mem.started = true; mem.ok = null; mem.cand = null; mem.hold = 0; mem.judging = false;
      at(b.kind === 'boss' ? 'boss' : 'encounter');
      if (b.drums && b.drums[0]) tempo = b.drums[0].cad;
    }
    mem.busy = Math.max(0, (mem.busy || 0) - dt);
    let shift = 0;   // この中の stop で必殺技の「ため」が入ったら、その秒（倒す・勝つの音もそのぶん遅らせる）
    for (const e of evs) {
      if (e.type === 'wave') at('wave', 0.7);
      // 通常攻撃（交互に3秒ごと）：当たる（hit）なら主人公は swing・敵は bump、弾く・弾かれる（parried）は「キン」
      else if (e.type === 'attack') { if (!mem.busy) at(e.result === 'parried' ? 'parry' : e.who === 'hero' ? 'swing' : 'bump', ATK_HIT); }
      else if (e.type === 'count') at('count');   // 3・2・1（判定の始まりの judge が「0」）
      else if (e.type === 'reel') { tempo = e.cad; mem.ok = null; mem.cand = null; mem.hold = 0; mem.judging = false; }
      else if (e.type === 'stop') {
        at('stop'); mem.busy = BUSY; mem.judging = false; mem.ok = null;
        const sk = e.skill !== undefined ? e.skill : e.star ? { fx, crit: e.crit } : null;   // battle.js の stop の skill（合致率90%以上で必殺技。無ければ星で決める）
        if (sk) {   // 必殺技：当たる瞬間に職業の音（会心は重ねて大きく）、そのあとに星（会心は金の星の音）
          const f = sk.fx || fx;
          const id = e.crit && DEFS['skill_' + f + '_crit'] ? 'skill_' + f + '_crit' : DEFS['skill_' + f] ? 'skill_' + f : 'skill_slash';   // 会心で当たりの数が変わる技は、会心用の音
          shift = e.crit ? CHARGE_CRIT : CHARGE;
          at(e.crit ? 'charge_crit' : 'charge');   // ため：stop と同時に始まり、技の名前を叫ぶ瞬間（shift 秒）で切れる
          const land = shift + SKILL_HIT + (FX_LAND[f] || 0);   // 必殺技の前の「ため」のぶん遅らせる（battle-view.js の CHARGE_MS）
          at(id, land);
          if (e.crit) at('critHit', land);
          at(e.crit ? 'crit' : 'star', land + 0.6);
        } else { at('damage', 0.12); at('counter', COUNTER_HIT); }   // 届かなかった：少しのダメージのあと、敵の反撃
      }
      else if (e.type === 'foeEnd' && e.defeated) at('defeat', 0.9 + shift);
      else if (e.type === 'result' && e.defeated) at('victory', 1.5 + shift);
      else if (e.type === 'end' && e.skipped) at('flee', 0.2);   // 戦闘をとばした：敵はすぐ逃げる
      else if (e.type === 'end' && !e.defeated) { at('attack'); at('flee', 2.2); }
    }
    if (b.phase === 'reel' && live != null) {
      if (!mem.judging) { mem.judging = true; at('judge'); }
      // 90%を越えた／割れた：ドラムのふちが太く光るのと同じ（b.inCond。合致率で）。同じ側に1秒いたら鳴らす。判定の始まりの側は鳴らさない
      const now = !!b.inCond;
      if (mem.ok == null) { mem.ok = now; mem.cand = null; }
      else if (now !== mem.ok) {
        if (mem.cand !== now) { mem.cand = now; mem.hold = 0; }
        mem.hold += dt;
        if (mem.hold >= CUE_HOLD) { mem.ok = now; mem.cand = null; at(now ? 'ok' : 'ng'); }
      } else mem.cand = null;
    }
    if (tempo != null && !(tempo >= 40 && tempo <= 240)) tempo = null;
    return { cues, tempo };
  }

  // 効果音を「いつ、どの音」に直す（純粋）。返り値：[{ time（秒。t0 から）, ch, n, d, v, duty }]
  function notesOf(def, seq, t0 = 0) {
    const out = [], sec = 60 / def.bpm;
    for (const tr of def.tracks) {
      for (const n of seq.parseSeq(tr.seq).notes) out.push({ time: t0 + n.b * sec, ch: tr.ch, n: n.n, d: n.d * sec, v: tr.vol == null ? 1 : tr.vol, duty: tr.duty || 0.5 });
    }
    return out.sort((a, b) => a.time - b.time);
  }

  function createSfx({ synth, seq }) {
    let out = null, lastType = -1;
    const opt = { typeOn: true, cueOn: true };
    function play(id, delay = 0) {
      const def = DEFS[id];
      if (!def || !synth.ready() || (QUIET[id] && !opt[QUIET[id]])) return false;
      const t = synth.now();
      if (id === 'type') { if (t - lastType < TYPE_GAP) return false; lastType = t; }
      if (!out) out = synth.makeGain('sfx', 1);
      for (const ev of notesOf(def, seq, t + 0.01 + delay)) synth.note(ev, out);
      return true;
    }
    return {
      DEFS, play,
      // 設定（rq.settings）の sfxType・sfxCue（false で止める）
      setOptions(o) { if (o.sfxType != null) opt.typeOn = !!o.sfxType; if (o.sfxCue != null) opt.cueOn = !!o.sfxCue; },
      options: () => ({ ...opt }),
      // 戦闘の画面から、step のたびに呼ぶ。効果音を鳴らし、曲のテンポを目標の回転数に合わせる（1回転＝1拍）
      battle(b, evs, live, dt, music) {
        if (!b.__sfx) Object.defineProperty(b, '__sfx', { value: {}, enumerable: false });
        const sk = root.RQ && root.RQ.data && root.RQ.data.SKILLS && b.hero ? root.RQ.data.SKILLS[b.hero.id] : null;
        const r = battleCues(b.__sfx, b, evs, live, dt, sk && sk.fx);
        for (const c of r.cues) play(c.id, c.delay);
        if (r.tempo != null && music) music.setTempo(r.tempo, 'battle');
        return r;
      },
    };
  }

  const api = { DEFS, QUIET, battleCues, notesOf, createSfx, CUE_HOLD };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  const RQ = root.RQ = root.RQ || {};
  RQ.sfx = Object.assign(createSfx({ synth: RQ.synth, seq: RQ.sequencer }), api);
  // ボタンを押したら決定の音（戻る・閉じる・やめるは取り消しの音）。ボタンに乗ったらカーソルの音
  const CANCEL = /戻る|閉じる|やめる|キャンセル/;
  addEventListener('click', e => { const bt = e.target.closest && e.target.closest('button'); if (bt && !bt.disabled) RQ.sfx.play(CANCEL.test(bt.textContent) ? 'cancel' : 'decide'); }, true);
  addEventListener('mouseover', e => {
    const bt = e.target.closest && e.target.closest('button');
    if (bt && !bt.disabled && !(e.relatedTarget && bt.contains(e.relatedTarget))) RQ.sfx.play('cursor');
  }, true);
})(typeof window !== 'undefined' ? window : globalThis);
