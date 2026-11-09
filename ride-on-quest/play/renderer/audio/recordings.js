/* 録音の曲（甘茶の音楽工房 https://amachamusic.chagasi.com/。2026-10-21 ユーザー判断）の、場面 → 曲の表と、鳴らし方の規則。画面にも AudioContext にも触らない純粋な関数（node のテストで確かめる）。
   曲のファイルは assets/audio/<ID>.webm（Opus。元の mp3 は art_src/audio）、長さ・音量・ループ点は assets/audio/manifest.js（RQ.audioTracks。tools/build_audio.py が作る）。
   録音の無い場面（と、ファイルが読めなかった曲）は、手作りの曲（songs.js）で鳴らす。
   ループ：loopEnd まで来たら loopStart へ戻る（前奏は最初だけ）。2つの <audio> を使い、戻る少し前から次の方を音を消して鳴らし始め、
   位置を合わせ直してから短く重ねて切り替える（synth.js の recVoice が loopStep の指示どおりに動く）。 */
(function (root) {
  // 場面 → 曲（ユーザーが入れ替えやすいよう、ここ1か所）。
  // 戦闘は騎兵戦に決めた（2026-10-21 ユーザー判断。テンポ＝回転数はやめた）。戦闘Ⅱ（回転数に合わせる）は試し聞き用に一覧に残し、music.setOptions({ battleTrack }) でだけ選べる（ゲームの画面からは選ばない）
  const SCENES = {
    title: 'keijokyoku',               // 軽序曲
    // フィールド（旅の回復の間とフリーライド）は、主人公がいる所の地面で替える（2026-10-22。区分は renderer/game/area.js）
    field: {
      coast: 'umioiku',                // 海岸（浜・港・海辺）：海を行く
      forest: 'borghesenokaze',        // 草地・森（山腹）：ボルゲーゼの風
      crater: 'hateshinaimichi',       // 火山（焼け石・火口のまわり）：果てしない道（短調）
    },
    battle: ['kiheisen', 'sento2'],    // 騎兵戦（テンポは元のまま。決定）・戦闘Ⅱ（回転数に合わせる。使わない）
    boss: 'maounoshiro',               // 魔王の城
    cooldown: 'yuuhinihabatakukokoro', // 夕日に羽ばたく心
    summary: 'orchestrajingle',        // オーケストラジングル（1回鳴らして止める）
    trial: 'sevillanotoride',          // セビーリャの砦
    race: 'ryuukihei',                 // レース：竜騎兵（2026-10-22。最後の周は少し速く＝FINAL_RATE。カウントダウンの間は無音）
    raceEnd: { win: 'orchestrajingle', lose: null },   // レースの結果：3位以内はオーケストラジングル、それ以外は手作りの短いジングル（songs.js の raceEnd_lose）
  };
  const RATE = [0.7, 1.35];
  const FINAL_RATE = 1.06;      // レースの最後の周：曲を少し速くして盛り上げる（音の高さは保つ）     // 回転数に合わせるときの再生の速さの範囲（音の高さは保つ）
  const XF = 0.12;              // ループのつなぎ目で重ねる長さ（秒）
  const LEAD = 0.6, FIX = 0.25; // 次の方を鳴らし始める（音は消したまま）のは、つなぎ目の何秒前か。位置を合わせ直すのは何秒前か（曲の中の秒）

  // シーンに合う録音の曲の ID（無ければ null＝手作りの曲）。tracks：RQ.audioTracks。opt：{ battleTrack, failed: Set }
  function trackFor(scene, tracks, opt = {}) {
    if (!scene || !tracks) return null;
    const ok = id => id && id !== 'synth' && tracks[id] && !(opt.failed && opt.failed.has(id));
    const e = SCENES[scene.kind];
    if (Array.isArray(e)) {
      if (opt.battleTrack === 'synth') return null;
      return [opt.battleTrack, ...e].find(ok) || null;
    }
    if (e && typeof e === 'object') return [e[scene.area || scene.variant], e.coast].find(ok) || null;   // 地面（area）や結果（variant）で替える場面。フィールドは区分が分からなければ海岸の曲
    return ok(e) ? e : null;
  }

  // 目標の回転数 → 再生の速さ（1回転＝1拍）
  const rateFor = (rpm, bpm) => (rpm > 0 && bpm > 0 ? Math.max(RATE[0], Math.min(RATE[1], rpm / bpm)) : 1);

  /* ループの1歩。st：{ pre（次の方を鳴らし始めた）, fixed（位置を合わせ直した） }、t：いま鳴っている方の位置（秒）、tr：曲、rate：再生の速さ。
     返り値：{ act: null | 'prestart' | 'fix' | 'swap' | 'jump', offset（次の方の位置。jump はいま鳴っている方の位置）, st }。
     offset は「つなぎ目でちょうど loopStart になる」位置（いまの位置から、つなぎ目までの残りを引く） */
  function loopStep(st, t, tr, rate = 1) {
    if (!tr || !tr.loop || !(tr.loopEnd > tr.loopStart)) return { act: null, st };
    const left = tr.loopEnd - t, offset = tr.loopStart - left;
    if (left < -0.2) return { act: 'jump', offset, st: { pre: false, fixed: false } };   // つなぎ目を過ぎてしまった（画面が止まっていたなど）
    if (!st.pre && left <= LEAD * rate) return { act: 'prestart', offset, st: { pre: true, fixed: false } };
    if (st.pre && !st.fixed && left <= FIX * rate) return { act: 'fix', offset, st: { pre: true, fixed: true } };
    if (st.pre && left <= XF / 2) return { act: 'swap', offset, st: { pre: false, fixed: false } };
    return { act: null, st };
  }

  const api = { SCENES, RATE, FINAL_RATE, XF, LEAD, FIX, trackFor, rateFor, loopStep };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).recordings = api;
})(typeof window !== 'undefined' ? window : globalThis);
