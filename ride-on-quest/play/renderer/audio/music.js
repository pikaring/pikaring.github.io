/* BGM の操作盤。シーン → 曲（scenes.js）を決め、シーケンサー（sequencer.js）が取り出した音を合成器（synth.js）に鳴らさせる。
   合成器は引数で受け取るので、node のテストでは偽の合成器で確かめられる（AudioContext に触るのは synth.js だけ）。
   ・曲の切り替えは短いフェード（いまの曲を消しながら、次の曲を立ち上げる）
   ・一時停止のときは曲を止め、再開すると止めた拍から続ける
   ・AudioContext が動いていない間（最初の操作の前）は、鳴らしたい曲だけ覚えておき（録音の曲は先に読んでおく）、動き出したら鳴らす
   ・録音の曲（recordings.js。ID は 'rec:<曲の ID>'）がある場面はそれを鳴らし、無い場面と読めなかった曲は手作りの曲（songs.js） */
(function (root) {
  const LOOKAHEAD = 0.15, FADE = 0.35, AREA_FADE = 3, START_DELAY = 0.05;   // AREA_FADE：フィールドで地面が替わったときの、ゆっくりのクロスフェード（秒）
  // 今の曲名を画面（上の帯の右）に出すか。2026-10-21 ユーザー要望：デモプレイ中は何の曲か分かるように。曲が完全に決まったら false にする
  const SHOW_TITLE = true;

  // recs：{ rules（recordings.js）, tracks（RQ.audioTracks）, base（mp3 のフォルダ） }。無ければ手作りの曲だけ
  // area：renderer/game/area.js（地面の区分を落ち着かせる settle）。無ければ地面で替えない
  function createMusic({ synth, seq, scenes, songs, recs, area }) {
    const compiled = {};
    for (const id of Object.keys(songs)) compiled[id] = seq.compile(songs[id]);
    const tracks = (recs && recs.tracks) || {}, failed = new Set();
    let opt = { battleTrack: recs && recs.rules ? recs.rules.SCENES.battle[0] : null };
    let want = null, wantKind = null, cur = null, paused = false, slow = false;
    let areaSt = null, areaT = null, finalLap = false;   // フィールドの地面の区分（settle の状態）と、前に見た時刻   // want：鳴らしたい曲の ID。cur：鳴らしている曲 { id, kind, song, st, gain } か、録音なら { id, kind, rec, tr, h }
    let lastArea = null, preWant = null;   // 最後にいたフィールドの区分（戦闘のあとに戻る曲を先に読む）、先読みを済ませた曲
    let tempoFor = null;   // { id, bpm }：その曲を鳴らし始めるときのテンポ（戦闘の曲は目標の回転数。曲が切り替わる前に決まることがある）
    let vol = { bgm: 70, sfx: 80, bgmOn: true, sfxOn: true, mute: false };

    // BGM がオフの間は、曲を作らず・読まず・鳴らさない（2026-11-08 ユーザー「BGMのオンオフもできたっけ。好きな音楽を聴きたい時もあるんだよね」：
    // iPhone で、ほかのアプリの音楽を流しながら遊べるように。iOS では、ページが音を鳴らすとほかのアプリの音楽が止まることがある）。オンにしたら、そのときから鳴る
    const bgmOff = () => vol.mute || !vol.bgmOn;
    function applyVolume() {
      synth.setBus('bgm', scenes.volumeGain(vol.bgm, bgmOff()));
      synth.setBus('sfx', scenes.volumeGain(vol.sfx, vol.mute || !vol.sfxOn));
      if (synth.setMix) synth.setMix({ bgm: !bgmOff(), sfx: !(vol.mute || !vol.sfxOn) });   // iOS の音の出し方（ほかのアプリの音楽と混ぜるか。synth.js）
      if (bgmOff() && cur) drop(0.2);
    }
    const isRec = id => !!id && id.startsWith('rec:');
    const tempoOf = (id, kind) => (tempoFor && (tempoFor.id === id || tempoFor.id === kind) ? tempoFor.bpm : undefined);
    function begin(id, t, fade = FADE) {
      if (isRec(id)) {
        const rid = id.slice(4), tr = tracks[rid];
        const h = synth.recVoice(recs.base + tr.file, tr, { onError: () => { failed.add(rid); if (want === id) want = null; } });
        cur = { id, kind: wantKind, rec: true, tr, h };
        const bpm = tempoOf(id, wantKind);
        if (tr.sync && bpm) { cur.rate = recs.rules.rateFor(bpm, tr.bpm); h.setRate(cur.rate); }
        h.start(0); h.fade(1, fade);
        return;
      }
      const song = compiled[id], gain = synth.makeGain('bgm', 0);
      synth.fade(gain, 1, fade);
      cur = { id, kind: wantKind, song, st: seq.start(song, t, tempoOf(id, wantKind)), gain };
    }
    function drop(sec) { if (cur && cur.rec) cur.h.kill(sec); else if (cur && cur.gain) synth.kill(cur.gain, sec); cur = null; }
    // シーン → 曲の ID（録音が先、無ければ手作り）
    function pick(sc) {
      const rid = recs && recs.rules ? recs.rules.trackFor(sc, tracks, { battleTrack: opt.battleTrack, failed }) : null;
      return rid ? 'rec:' + rid : scenes.songFor(sc, compiled);
    }

    // 次に鳴りそうな曲を先に読んでおく（2026-11-07 ユーザー「戦闘が終わるとしばらく無音だね」）：戦闘・ボスの間は戻る先のフィールドの曲、
    // フィールドの間は戦闘・ボス・帰り道の曲。synth.js が <audio> を曲ごとに使い回すので、一度読めば次からはすぐ鳴る
    const NEXT = { title: ['field'], field: ['battle', 'boss', 'cooldown'], battle: ['field', 'cooldown'], boss: ['field', 'cooldown'], cooldown: ['summary'], trial: ['cooldown', 'battle'] };
    function preloadNext(sc) {
      if (!synth.preload || !recs || !recs.rules || !sc || bgmOff()) return;
      (NEXT[sc.kind] || []).forEach((kind, i) => {
        const id = pick({ kind, area: kind === 'field' ? lastArea : undefined });
        if (!isRec(id) || !tracks[id.slice(4)]) return;
        const u = recs.base + tracks[id.slice(4)].file;
        if (i === 0 && synth.prepare && synth.ready()) synth.prepare(u); else synth.preload(u);   // いちばん次に鳴りそうな 1 曲は、すぐ鳴らせる形に（WebAudio の道では PCM に）
      });
    }

    // 25ms ごとに呼ぶ。先読みのぶんだけ音を取り出して鳴らす
    function pump() {
      if (!synth.ready() || paused) return;
      const t = synth.now();
      const w = bgmOff() ? null : want;   // BGM がオフなら鳴らさない（want は覚えておき、オンにしたらそこから）
      if (w !== (cur ? cur.id : null)) { const f = slow ? AREA_FADE : FADE; slow = false; drop(f); if (w) begin(w, t + START_DELAY, f); }
      if (!cur) return;
      if (cur.rec) { cur.h.tick(); return; }
      if (!cur.gain) { cur.gain = synth.makeGain('bgm', 0); synth.fade(cur.gain, 1, 0.1); cur.st = { ...cur.st, time: t + START_DELAY }; }   // 一時停止から戻った
      if (cur.st.time < t) cur.st = { ...cur.st, time: t + START_DELAY };   // 時計が遅れたら、いまから続ける（過去の時刻の音が一度に鳴らないように）
      const r = seq.step(cur.st, cur.song, t + LOOKAHEAD);
      cur.st = r.state;
      for (const ev of r.events) synth.note(ev, cur.gain);
    }

    return {
      songs: compiled,
      // シーンを知らせる。曲が変わるときだけ切り替わる
      // フィールドは地面の区分（sc.area）で曲を替える。区分は、新しい区分が続いてから替え（area.settle）、ゆっくりクロスフェードする
      scene(sc) {
        if (sc && sc.kind === 'field' && area) {
          const t = synth.now();
          areaSt = area.settle(areaSt, sc.area, areaT == null ? 0 : Math.max(0, t - areaT)); areaT = t;
          sc = { ...sc, area: areaSt.area };
        } else { areaSt = null; areaT = null; }
        if (sc && sc.kind === 'field' && sc.area) lastArea = sc.area;
        const next = pick(sc);
        if (next !== want && cur && cur.kind === 'field' && sc && sc.kind === 'field') slow = true;   // フィールドの中で地面が替わった
        want = next; wantKind = sc ? sc.kind : null; finalLap = !!(sc && sc.final);
        if (isRec(want) && !synth.ready() && synth.preload && !bgmOff()) synth.preload(recs.base + tracks[want.slice(4)].file);   // 最初の操作の前：曲を先に読んでおき、操作ですぐ鳴らす
        if (want !== preWant) { preWant = want; preloadNext(sc); }
        pump();
        if (cur && cur.rec && cur.kind === 'race') { const r = finalLap ? recs.rules.FINAL_RATE : 1; if ((cur.rate || 1) !== r) { cur.rate = r; cur.h.setRate(r); } }   // レースの最後の周
      },
      area: () => (areaSt ? areaSt.area : null),
      // 曲を直接指定する（試し聞き用。録音は 'rec:<ID>'）。null で止める
      play(id) { want = id && (compiled[id] || (isRec(id) && tracks[id.slice(4)])) ? id : null; wantKind = null; pump(); },
      // 録音の曲の選び方。{ battleTrack: 'kiheisen' | 'sento2' | 'synth' }（設定の保存と同じ名前）
      setOptions(o) { if (o.battleTrack != null) opt = { ...opt, battleTrack: o.battleTrack }; },
      tracks, failed,
      pause(p) {
        if (p === paused) return;
        paused = p;
        if (cur && cur.rec) { if (p) cur.h.pause(); else cur.h.resume(); }
        else if (p && cur && cur.gain) {   // いま鳴っているところの拍を覚え、先に鳴らす予定にした音ごと消す
          const b = seq.beatAt(cur.st, cur.song, synth.now());
          cur.st = { ...cur.st, beat: b, time: synth.now(), done: false };
          synth.kill(cur.gain, 0.04); cur.gain = null;
        }
        if (!p) pump();
      },
      bgmOff,
      // 音量（0〜100）とオン・オフ。{ bgmVol, sfxVol, bgmOn, sfxOn }（設定の保存と同じ名前）。オフにしても音量の値は覚えている。
      // mute（両方止める）は試し聞きのページ用に残している（設定の画面からは外した）
      setVolumes(o) {
        const pick = (k, d) => (o[k] != null ? o[k] : d);
        vol = { bgm: pick('bgmVol', vol.bgm), sfx: pick('sfxVol', vol.sfx), bgmOn: !!pick('bgmOn', vol.bgmOn), sfxOn: !!pick('sfxOn', vol.sfxOn), mute: !!pick('mute', vol.mute) };
        applyVolume();
      },
      // テンポを変える（拍の頭で切り替わる）。null で曲の元のテンポに戻す。
      // id を付けると、その曲にだけ効く（まだ鳴っていなければ、鳴らし始めるときのテンポとして覚える）
      // 録音の曲は、回転数に合わせる曲（sync）だけ、再生の速さを変える（音の高さは保つ。1回転＝1拍）
      setTempo(bpm, id) {
        if (id != null) { tempoFor = bpm == null ? null : { id, bpm }; if (!cur || (cur.id !== id && cur.kind !== id)) return; }
        if (!cur) return;
        if (cur.rec) { if (cur.tr.sync) { cur.rate = bpm == null ? 1 : recs.rules.rateFor(bpm, cur.tr.bpm); cur.h.setRate(cur.rate); } return; }
        cur.st = seq.setTempo(cur.st, bpm == null ? cur.song.bpm : bpm, true);
      },
      // 場面の曲をすべて先に読む（最初の操作の中で呼ぶ。iOS では <audio> ごとに、操作の中で一度鳴らしたものしか、あとで操作の外で鳴らせないため。synth.unlockAll）
      preloadAll() {
        if (!synth.preload || !recs || !recs.rules || bgmOff()) return;
        const ids = new Set();
        for (const [kind, e] of Object.entries(recs.rules.SCENES)) {
          if (Array.isArray(e)) ids.add(pick({ kind }));
          else if (e && typeof e === 'object') Object.keys(e).forEach(k => ids.add(pick({ kind, area: k, variant: k })));
          else ids.add(pick({ kind }));
        }
        ids.forEach(id => { if (isRec(id) && tracks[id.slice(4)]) synth.preload(recs.base + tracks[id.slice(4)].file); });
      },
      pump,
      // 裏から戻って AudioContext を再開したあと：録音の曲を今の位置から鳴らし直す（止まったままの音源を作り直す。一時停止の間はそのまま）
      revive() { if (!paused && cur && cur.rec) { cur.h.pause(); cur.h.resume(); } pump(); },
      current: () => (cur ? cur.id : null),
      wanted: () => want,
      // 今の曲名（画面に出す。SHOW_TITLE）。鳴っていなければ ''
      title: () => (!cur ? '' : `♪ ${cur.rec ? cur.tr.name : cur.song.name || cur.id}`),
      bpm: () => (!cur ? null : cur.rec ? (cur.tr.bpm ? Math.round(cur.tr.bpm * (cur.rate || 1)) : null) : cur.st.bpm),
      rate: () => (cur && cur.rec ? cur.rate || 1 : null),
      position: () => (cur && cur.rec ? cur.h.position() : null),
      seek(t) { if (cur && cur.rec) cur.h.seek(t); },   // 試し聞き用（つなぎ目を聞く）
      track: () => (cur && cur.rec ? cur.tr : null),
      beat: () => (cur && !cur.rec && cur.gain ? seq.beatAt(cur.st, cur.song, synth.now()) : null),
      isPaused: () => paused,
    };
  }

  const api = { createMusic, LOOKAHEAD, FADE, SHOW_TITLE };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  const RQ = root.RQ = root.RQ || {};
  RQ.music = Object.assign(createMusic({ synth: RQ.synth, seq: RQ.sequencer, scenes: RQ.scenes, songs: RQ.songs,
    recs: RQ.recordings && RQ.audioTracks ? { rules: RQ.recordings, tracks: RQ.audioTracks, base: root.RQ_AUDIO_BASE || '../assets/audio/' } : null, area: RQ.area }), { createMusic, SHOW_TITLE });
  // 時計と、最初の操作での再開（Electron でも、操作の前は音が出ない）
  setInterval(() => RQ.music.pump(), 25);
  // 今の曲名（#now-playing があるページだけ。ゲームの上の帯）
  setInterval(() => {
    const el = root.document && root.document.getElementById('now-playing');
    if (!el) return;
    const t = RQ.music.SHOW_TITLE ? RQ.music.title() : '';
    if (el.textContent !== t) el.textContent = t;
    el.hidden = !t;
  }, 250);
  // 最初の操作：AudioContext を動かし、場面の曲をすべて読んで、音を出さずに一度鳴らしておく（iOS で、戦闘のあとなど操作の外でも曲が鳴るように。2026-11-07）。
  // WebKit で再生の操作と数えるのは touchend・click・keydown（pointerdown は数えない）ので、どれでも呼ぶ
  // 2026-11-10：裏に回ったあと（iOS は AudioContext が止まる）も、操作のたびに、止まっていれば再開する（前は最初に動いたら外していた。synth.js の revive）
  const UNLOCK = ['pointerdown', 'touchend', 'click', 'keydown'];
  let first = true;
  const unlock = () => {
    if (!first && RQ.synth.ready()) return;
    if (first) { RQ.music.preloadAll(); if (RQ.synth.unlockAll) RQ.synth.unlockAll(); }   // 操作の中で（同期で）
    const was = first; first = false;
    (was ? RQ.synth.resume() : RQ.synth.revive()).then(ok => { if (ok) { if (was) RQ.music.pump(); else RQ.music.revive(); } else if (was) first = true; });
  };
  UNLOCK.forEach(k => addEventListener(k, unlock, true));
  // 画面に戻ったとき（ほかのアプリ・タブから）：AudioContext を再開して、曲を鳴らし直す。操作の外で断られたら、次に画面に触ったとき（上の unlock）
  const wake = () => {
    if (first || (root.document && root.document.visibilityState === 'hidden')) return;
    const was = RQ.synth.ready();
    RQ.synth.revive().then(ok => { if (ok && !was) RQ.music.revive(); });
  };
  if (root.document && root.document.addEventListener) root.document.addEventListener('visibilitychange', wake);
  addEventListener('pageshow', wake); addEventListener('focus', wake);
  setInterval(() => { if (!first && !RQ.synth.ready()) wake(); }, 2000);   // 戻ったのに知らせが来ない・再開が遅れたときの見回り
})(typeof window !== 'undefined' ? window : globalThis);
