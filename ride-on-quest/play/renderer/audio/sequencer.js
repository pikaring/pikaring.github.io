/* チップチューンのシーケンサー。画面にも AudioContext にも触らない純粋な関数だけ（node のテストで確かめる）。
   曲は「音符の並びのデータ」（songs.js）。ここでは、
   ・音符の文字列 "G4:1 B4:0.5 r:1 ..." を [{ b（拍）, d（長さ・拍）, n（MIDI 番号） }] にする（parseSeq）
   ・曲を作る（compile）
   ・「どの音を、いつ鳴らすか」を、時計の先読みぶんだけ取り出す（start・step）。テンポは実行中に変えられる（setTempo。拍の頭で切り替えもできる）
   鳴らすのは synth.js、曲の切り替えの規則は scenes.js、全体をつなぐのは music.js。 */
(function (root) {
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const DRUM = { k: 36, s: 38, h: 42, o: 46, c: 49 };   // ノイズの声部の「音」：キック・スネア・ハイハット（閉）・ハイハット（開）・シンバル
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // 'C4'・'F#3'・'Bb2' → MIDI 番号（C4 = 60）
  function noteNum(name) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    if (!m) throw new Error(`音名が正しくありません: ${name}`);
    return (+m[3] + 1) * 12 + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  const noteName = n => NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  const midiToHz = n => 440 * Math.pow(2, (n - 69) / 12);

  // "G4:1 B4:0.5 r:1" → { notes: [{ b, d, n }], beats }。長さ（拍）は省けば1。r は休み。k・s・h・o・c はドラム
  function parseSeq(text) {
    const notes = []; let b = 0;
    for (const tok of String(text).trim().split(/\s+/)) {
      if (!tok || tok === '|') continue;
      const [nm, ds] = tok.split(':'), d = ds === undefined ? 1 : +ds;
      if (!(d > 0)) throw new Error(`長さが正しくありません: ${tok}`);
      if (nm !== 'r') notes.push({ b, d, n: DRUM[nm] !== undefined ? DRUM[nm] : noteNum(nm) });
      b += d;
    }
    return { notes, beats: b };
  }

  // 曲の定義（songs.js）→ 鳴らせる形。どの声部も曲の長さ（bars × beats 拍）ちょうどでなければならない
  function compile(def) {
    const beats = def.beats || 4, length = def.bars * beats;
    const tracks = def.tracks.map((t, i) => {
      const p = parseSeq(t.seq);
      if (Math.abs(p.beats - length) > 1e-9) throw new Error(`${def.id} の ${i + 1} 番目の声部が ${p.beats} 拍です（曲は ${length} 拍）`);
      return { ch: t.ch, vol: t.vol == null ? 1 : t.vol, duty: t.duty || 0.5, notes: p.notes };
    });
    return { id: def.id, name: def.name, bpm: def.bpm, beats, length, loop: def.loop !== false, tracks };
  }

  // 鳴らし始める状態。time：曲の頭（0拍目）が鳴る時刻（秒）
  const start = (song, time, bpm) => ({ beat: 0, time, bpm: bpm || song.bpm, pending: null, loops: 0, done: false });

  // テンポを変える。quantize なら次の拍の頭で切り替える（途中の拍で急に速さが変わらない）
  function setTempo(st, bpm, quantize = true) {
    return quantize ? { ...st, pending: bpm } : { ...st, bpm, pending: null };
  }

  // st.beat は「次に取り出す拍」で、st.time はその拍が鳴る時刻。until（秒）より前に鳴る音を取り出し、新しい状態を返す。
  // events：[{ time, ch, n, d（秒）, v, duty, tr（声部の番号） }]（時刻順）
  function step(st0, song, until) {
    const st = { ...st0 }, events = [];
    while (!st.done && st.time < until) {
      if (st.pending != null && Math.abs(st.beat - Math.round(st.beat)) < 1e-9) { st.bpm = st.pending; st.pending = null; }
      const room = st.beat + (until - st.time) * st.bpm / 60;
      const limit = st.pending != null ? Math.floor(st.beat + 1e-9) + 1 : Infinity;   // 切り替えを待つあいだは、次の拍の頭まで
      const stop = Math.min(room, song.length, limit);
      song.tracks.forEach((t, tr) => {
        for (const n of t.notes) {
          if (n.b >= st.beat && n.b < stop) events.push({ time: st.time + (n.b - st.beat) * 60 / st.bpm, ch: t.ch, n: n.n, d: n.d * 60 / st.bpm, v: t.vol, duty: t.duty, tr });
        }
      });
      st.time = stop === room ? until : st.time + (stop - st.beat) * 60 / st.bpm;
      st.beat = stop;
      if (st.beat >= song.length - 1e-9) { if (song.loop) { st.beat = 0; st.loops++; } else st.done = true; }
    }
    events.sort((a, b) => a.time - b.time);
    return { events, state: st };
  }

  // 時刻 t に鳴っている拍（曲の頭からの拍数。st の先読みより前の時刻でもよい）。ループする曲は 0〜length に戻す
  function beatAt(st, song, t) {
    const b = st.beat + (t - st.time) * st.bpm / 60;
    return song.loop ? ((b % song.length) + song.length) % song.length : Math.max(0, Math.min(song.length, b));
  }

  const api = { noteNum, noteName, midiToHz, parseSeq, compile, start, setTempo, step, beatAt, DRUM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).sequencer = api;
})(typeof window !== 'undefined' ? window : globalThis);
