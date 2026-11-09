/* 曲のデータ。すべてオリジナル（特定のゲームの旋律・和音進行に似せない）。
   2026-10-21 ユーザー要望「ドラクエ風にクラシックっぽく」：弦・トランペット・ホルン・ティンパニの声（synth.js）で、行進曲やバロック風の進行にした。
   1つの曲は、声部ごとの音符の文字列。書き方は sequencer.js の parseSeq：
     "G4:1 B4:0.5 r:1" … 音名:長さ（拍。省くと1）。r は休み。ノイズの声部は k＝大太鼓・s＝小太鼓・h＝ハイハット・o＝開いたハイハット・c＝シンバル。
   声：pulse・tri（ファミコン風）、str（弦）・brass（トランペット）・horn（ホルン）・timp（ティンパニ）、noise（打楽器）。
   どの声部も、曲の長さ（bars × beats 拍）ちょうどにする（tests/songs.test.js が確かめる）。 */
(function (root) {
  const bars = (...b) => b.join(' ');
  const rep = (s, n) => Array(n).fill(s).join(' ');

  /* 伴奏を和声から組み立てる小物（文字列を組み立てるだけ）。和声は半小節（2拍）ごとの和音名の並び。
     和音の表：b＝低音（根音）、f＝低音の5度、t＝中音域の3音（低い順）、h＝ホルンが持つ音、k＝ティンパニ */
  const OC = {
    Bb: { b: 'Bb2', f: 'F2', t: ['D4', 'F4', 'Bb4'], h: 'D4', k: 'Bb2' },
    Eb: { b: 'Eb3', f: 'Bb2', t: ['Eb4', 'G4', 'Bb4'], h: 'Eb4', k: 'Bb2' },
    Gm: { b: 'G2', f: 'D3', t: ['D4', 'G4', 'Bb4'], h: 'D4', k: 'D3' },
    Cm: { b: 'C3', f: 'G2', t: ['Eb4', 'G4', 'C5'], h: 'Eb4', k: 'C3' },
    F: { b: 'F2', f: 'C3', t: ['C4', 'F4', 'A4'], h: 'C4', k: 'F2' },
    F7: { b: 'F2', f: 'C3', t: ['C4', 'Eb4', 'A4'], h: 'Eb4', k: 'F2' },
    D: { b: 'D3', f: 'A2', t: ['D4', 'F#4', 'A4'], h: 'D4', k: 'D3' },
    Dm: { b: 'D3', f: 'A2', t: ['D4', 'F4', 'A4'], h: 'F4', k: 'D3' },
    A: { b: 'A2', f: 'E3', t: ['C#4', 'E4', 'A4'], h: 'E4', k: 'A2' },
    C: { b: 'C3', f: 'G2', t: ['C4', 'E4', 'G4'], h: 'G4', k: 'C3' },
    Edim: { b: 'E2', f: 'Bb2', t: ['E4', 'G4', 'Bb4'], h: 'E4', k: 'E2' },
    G: { b: 'G2', f: 'D3', t: ['D4', 'G4', 'B4'], h: 'D4', k: 'G2' },
    Bm: { b: 'B2', f: 'F#2', t: ['D4', 'F#4', 'B4'], h: 'D4', k: 'B2' },
    Em: { b: 'E2', f: 'B2', t: ['E4', 'G4', 'B4'], h: 'E4', k: 'E2' },
    'F#m': { b: 'F#2', f: 'C#3', t: ['C#4', 'F#4', 'A4'], h: 'C#4', k: 'F#2' },
  };
  const H = s => s.trim().split(/\s+/).map(c => { if (!OC[c]) throw new Error(`和音の表にありません: ${c}`); return OC[c]; });
  // 同じ音が続けば1つにつなぐ（弦やホルンの持続音）
  const legato = list => {
    const out = [];
    for (const [n, d] of list) { const last = out[out.length - 1]; if (last && last[0] === n) last[1] += d; else out.push([n, d]); }
    return out.map(([n, d]) => `${n}:${d}`).join(' ');
  };
  const oom = hs => hs.map((c, i) => `${i % 2 && hs[i - 1] === c ? c.f : c.b}:0.75 r:1.25`).join(' ');   // 行進曲の低音（1・3拍目）
  const pah = (hs, i) => hs.map(c => `r:1 ${c.t[i]}:0.5 r:0.5`).join(' ');                                 // 裏拍のきざみ（2・4拍目）
  const pad = (hs, i) => legato(hs.map(c => [c.t[i], 2]));                                                // 和音を持つ
  const longBass = hs => legato(hs.map(c => [c.b, 2]));
  const hold = hs => legato(hs.map(c => [c.h, 2]));                                                       // ホルンの持続音
  const osti = (hs, pat) => hs.map(c => pat.map(i => `${c.t[i]}:0.5`).join(' ')).join(' ');                // 弦の8分のきざみ
  const drive = hs => hs.map(c => `${c.b}:0.5 ${c.b}:0.5 ${c.f}:0.5 ${c.b}:0.5`).join(' ');                // 低音の8分のきざみ
  const roll = (k, beats) => rep(`${k}:0.25`, beats * 4);                                                 // ティンパニのロール
  const osti16 = (hs, pat) => hs.map(c => pat.map(i => `${c.t[i]}:0.25`).join(' ')).join(' ');            // 弦の16分のきざみ
  const call = hs => hs.map(c => `${c.h}:0.75 ${c.h}:0.25 ${c.h}:1`).join(' ');                           // ホルンの付点のリズム（勇ましく）
  const oct = (seq, n) => seq.replace(/([A-G][#b]?)(-?\d)/g, (_, nm, o) => nm + (+o + n));                 // 音符の文字列をオクターブ上げ下げする
  const driveOct = hs => hs.map(c => { const hi = oct(c.b, 1); return `${c.b}:0.5 ${hi}:0.5 ${c.b}:0.5 ${hi}:0.5`; }).join(' ');   // 低音をオクターブで動かす
  const stab = hs => hs.map((c, i) => { const x = oct(c.t[2], 1); return i % 2 ? `r:0.5 ${x}:0.5 r:0.5 ${x}:0.5` : `${x}:0.5 r:1 ${x}:0.5`; }).join(' ');   // 弦の高い和音を、休符をはさんで打つ（シンコペーション）

  /* ---- 1. タイトル／挑戦者を選ぶ画面：序曲風の行進曲（B♭ メジャー、112 BPM、24 小節＝約51秒）。
     前奏（ファンファーレ）→ A（トランペットの旋律、弦の裏拍）→ B（G マイナーから、弦が歌う）→ 結び（4 小節） ---- */
  const tIntro = 'Bb Bb  Eb Eb  Cm F  F F';
  const tA = 'Bb Bb  Eb Cm  Bb F  Gm F  Bb Bb  Eb Eb  Cm F7  Bb Bb';
  const tB = 'Gm Gm  Eb Eb  Cm Cm  D D  Gm Gm  Eb Eb  Cm F  F7 F7';
  const tCoda = 'Bb Bb  Eb Cm  Bb F7  Bb Bb';
  const [hI, hA, hB, hC] = [tIntro, tA, tB, tCoda].map(H);
  const tpIntro = bars('F4:0.5 Bb4:0.5 D5:1.5 Bb4:0.25 D5:0.25 F5:1', 'G5:1.5 F5:0.5 Eb5:1 G5:1', 'Eb5:0.75 D5:0.25 C5:0.75 Bb4:0.25 A4:1 C5:1', 'C5:0.5 F5:1.5 r:1 F4:0.5 F4:0.5');
  const tpA = bars('Bb4:1.5 C5:0.5 D5:1 Bb4:1', 'Eb5:1.5 D5:0.5 C5:1 Eb5:1', 'F5:1 D5:0.5 Bb4:0.5 C5:1 A4:1', 'Bb4:1 G4:0.5 Bb4:0.5 A4:1 C5:1',
    'D5:1.5 Eb5:0.5 F5:1 D5:1', 'G5:1 Bb5:1 G5:1 Eb5:1', 'Eb5:1 C5:0.5 Eb5:0.5 A4:1 C5:1', 'Bb4:2 r:2');
  const vlnB = bars('G5:2 Bb5:1 A5:0.5 G5:0.5', 'G5:1.5 F5:0.5 Eb5:2', 'Eb5:1 G5:1 C6:1.5 Bb5:0.5', 'A5:2 F#5:1 D5:1',
    'D5:1 G5:1 Bb5:1.5 A5:0.5', 'G5:1 Eb6:2 D6:0.5 C6:0.5', 'C6:1.5 Bb5:0.5 A5:1 C6:1', 'A5:1 F5:1 Eb5:1 C5:1');
  const tpCoda = bars('Bb4:1 D5:1 F5:1 Bb5:1', 'G5:1.5 F5:0.5 Eb5:1 C5:1', 'D5:1 F5:1 Eb5:1 C5:1', 'Bb4:3 r:1');
  const title = {
    id: 'title', name: 'ライド・オン・クエスト（序曲）', bpm: 112, bars: 24, beats: 4, loop: true,
    tracks: [
      { ch: 'brass', vol: 1, seq: bars(tpIntro, tpA, rep('r:4', 8), tpCoda) },                                              // トランペット（旋律）
      { ch: 'str', vol: 0.9, seq: bars(pah(hI, 2), pah(hA.slice(0, 14), 2), 'r:3 D5:1', vlnB, pah(hC, 2)) },   // 第1バイオリン（B で旋律。A の終わりの D5 は B への弱起）
      { ch: 'str', vol: 0.7, seq: bars(pah(hI, 1), pah(hA, 1), pad(hB, 1), pah(hC, 1)) },                                     // 第2バイオリン・ビオラ
      { ch: 'horn', vol: 0.8, seq: bars(hold(hI), hold(hA), hold(hB), hold(hC)) },                                            // ホルン（和声を持つ）
      { ch: 'str', vol: 1, seq: bars(oom(hI), oom(hA), longBass(hB), oom(hC)) },                                              // チェロ・コントラバス
      { ch: 'timp', vol: 1, seq: bars('Bb2:1 r:3', 'Bb2:1 r:3', 'C3:1 r:1 F2:1 r:1', 'F2:2 ' + roll('F2', 2),
        rep('Bb2:1 r:1 F2:1 r:1', 7), 'Bb2:2 ' + roll('F2', 2), rep('r:4', 7), roll('F2', 4),
        'Bb2:1 r:3', 'Bb2:1 r:3', 'Bb2:1 r:1 F2:1 r:1', 'Bb2:1 r:1 F2:0.5 F2:0.5 Bb2:1') },                                      // ティンパニ
      { ch: 'noise', vol: 0.5, seq: bars('c:1 s:0.5 s:0.5 k:1 s:0.5 s:0.5', rep('k:1 s:0.5 s:0.5 k:1 s:0.5 s:0.5', 2), 'k:1 s:1 s:0.25 s:0.25 s:0.25 s:0.25 s:0.5 s:0.5',
        'c:1 s:0.5 s:0.5 k:1 s:0.5 s:0.5', rep('k:1 s:0.5 s:0.5 k:1 s:0.25 s:0.25 s:0.5', 7), 'c:4', rep('r:4', 6), 'k:4',
        'c:1 s:0.5 s:0.5 k:1 s:0.5 s:0.5', rep('k:1 s:0.5 s:0.5 k:1 s:0.5 s:0.5', 2), 'k:1 r:1 k:1 c:1') },                       // 大太鼓・小太鼓・シンバル
    ],
  };

  /* ---- 2. 戦闘：勢いがあって明るく強い（D メジャー、100 BPM、16 小節＝100 BPM で約38秒）。2026-10-21 ユーザー要望で新しく作った。
     テンポは目標の回転数に合わせる（1回転＝1拍。sfx.js の battleCues が music.setTempo を呼ぶ）。ティンパニ（1・3拍目）と小太鼓（2・4拍目）で毎拍を打つ。
     ユーザーが聞いて「まだ大人しい。もっと勇ましく」（2026-10-21）：トランペットをオクターブ下で重ね、低音はオクターブで動かし、
     弦は16分のきざみと、休符をはさんだ高い和音の打ち込み、ホルンは付点のリズム。シンバルは2小節ごと、ティンパニは区切りでロール。
     B♭ → C → D（♭6 → ♭7 → 1）の勇ましい進み方を A と B の山に使う。
     A（トランペットの旋律、8 小節）→ B（高いところで歌い、属和音 A で止めてティンパニのロールで頭へ） ---- */
  const bA = 'D D  G A  Bm G  Em A  D D  Bb C  D G  A A';
  const bB = 'G A  F#m Bm  Em A  D D  Bb C  D Bm  G A  A A';
  const hBt = [...H(bA), ...H(bB)];
  const tpBA = bars('D5:1.5 A4:0.5 D5:0.5 F#5:0.5 A5:1', 'B5:1.5 A5:0.5 G5:0.5 F#5:0.5 E5:1', 'F#5:1 D5:0.5 F#5:0.5 G5:1 B5:1', 'B5:1 G5:0.5 E5:0.5 A5:1 E5:0.5 C#5:0.5',
    'D5:0.5 E5:0.5 F#5:0.5 A5:0.5 D6:2', 'D6:1 Bb5:0.5 F5:0.5 E5:1 G5:0.5 C6:0.5', 'A5:1.5 F#5:0.5 G5:1 B5:1', 'A5:2 E5:1 C#5:0.5 E5:0.5');
  const tpBB = bars('D6:1.5 B5:0.5 C#6:1 A5:1', 'A5:1 F#5:0.5 A5:0.5 B5:1 F#5:1', 'G5:1 E5:0.5 G5:0.5 A5:1 C#6:1', 'D6:3 A5:0.5 F#5:0.5',
    'F5:1 Bb5:1 G5:1 C6:1', 'D6:1.5 A5:0.5 B5:1 F#5:1', 'G5:1 B5:0.5 D6:0.5 C#6:1 E5:0.5 A5:0.5', 'A5:1 E5:0.5 C#5:0.5 A4:1 A4:0.5 C#5:0.5');
  const battle = {
    id: 'battle', name: '戦闘（テンポ＝回転数）', bpm: 100, bars: 16, beats: 4, loop: true,
    tracks: [
      { ch: 'brass', vol: 1.25, seq: bars(tpBA, tpBB) },                                                                        // 第1トランペット（旋律）
      { ch: 'brass', vol: 0.95, seq: oct(bars(tpBA, tpBB), -1) },                                                             // 第2トランペット（オクターブ下で重ねる）
      { ch: 'str', vol: 0.6, seq: osti16(hBt, [0, 2, 1, 2, 0, 2, 1, 2]) },                                                    // バイオリン（16分のきざみ）
      { ch: 'str', vol: 0.55, seq: stab(hBt) },                                                                               // バイオリンの高い和音（休符をはさんで打つ）
      { ch: 'horn', vol: 0.8, seq: call(hBt) },                                                                                // ホルン（付点のリズム）
      { ch: 'str', vol: 0.95, seq: driveOct(hBt) },                                                                            // チェロ・コントラバス（オクターブで動く8分）
      { ch: 'timp', vol: 1.1, seq: bars(...hBt.slice(0, 14).map(c => `${c.k}:1 r:1`), 'A2:1 r:1 ' + roll('A2', 2), ...hBt.slice(16, 30).map(c => `${c.k}:1 r:1`), roll('A2', 4)) },   // ティンパニ（1・3拍目。8・16 小節目はロール）
      { ch: 'noise', vol: 0.7, seq: bars(rep('c:1 s:1 k:0.5 s:0.5 s:1 r:1 s:1 k:0.5 s:0.5 s:0.5 s:0.5', 3), 'c:1 s:1 k:0.5 s:0.5 s:1 k:1 s:0.5 s:0.5 s:0.5 s:0.5 s:0.25 s:0.25 s:0.25 s:0.25',
        rep('c:1 s:1 k:0.5 s:0.5 s:1 r:1 s:1 k:0.5 s:0.5 s:0.5 s:0.5', 3), 'c:1 s:1 k:0.5 s:0.5 s:1 s:0.5 s:0.5 s:0.5 s:0.5 s:0.25 s:0.25 s:0.25 s:0.25 c:1') },   // 小太鼓（2・4拍目と裏）・大太鼓・シンバル（2小節ごと）
    ],
  };

  /* ---- 3. 旅のフィールド（回復の間）：バロック風の短調（D マイナー、92 BPM、16 小節＝約42秒）。
     はじめは戦闘の試作だったが、ユーザーが聞いて「大人しくて寂しくて、どちらかというとフィールド向き」（2026-10-21）なので、ここに回した。
     A（トランペットの旋律）→ B（5度ずつ下がる進行で、旋律をくり返しながら下りる）→ 属和音で止めて頭へ ---- */
  const fA = 'Dm Dm  Gm A  Dm Dm  Bb A  Dm Dm  Gm C  F Bb  Edim A';
  const fB = 'Dm Dm  Gm C  F Bb  Edim A  Bb Bb  Gm Gm  A A  A A';
  const hFA = H(fA), hFB = H(fB), hF = [...hFA, ...hFB];
  const tpFA = bars('D5:1.5 A4:0.5 D5:0.5 E5:0.5 F5:1', 'G5:1.5 F5:0.5 E5:1 C#5:1', 'D5:0.5 E5:0.5 F5:0.5 G5:0.5 A5:2', 'Bb5:1 A5:0.5 G5:0.5 A5:1 E5:1',
    'F5:1.5 E5:0.5 D5:1 A4:1', 'Bb4:1 D5:1 C5:1 E5:1', 'F5:1 A5:1 D5:1 F5:1', 'E5:1 G5:0.5 Bb5:0.5 A5:2');
  const tpFB = bars('A5:1 F5:0.5 D5:0.5 A5:1 D6:1', 'D6:1 Bb5:0.5 G5:0.5 C6:1 G5:0.5 E5:0.5', 'C6:1 A5:0.5 F5:0.5 Bb5:1 F5:0.5 D5:0.5', 'Bb5:1 G5:0.5 E5:0.5 C#5:1 E5:1',
    'F5:1.5 G5:0.5 F5:1 D5:1', 'D5:1.5 Eb5:0.5 D5:1 Bb4:1', 'C#5:1 E5:1 A5:1 C#6:1', 'A5:2 r:1 A4:1');
  const field = {
    id: 'field', name: 'フィールド（回復の間）', bpm: 92, bars: 16, beats: 4, loop: true,
    tracks: [
      { ch: 'brass', vol: 1, seq: bars(tpFA, tpFB) },                                                                        // トランペット（旋律）
      { ch: 'str', vol: 0.75, seq: osti(hF, [0, 2, 1, 2]) },                                                                // バイオリン（8分のきざみ）
      { ch: 'horn', vol: 0.8, seq: hold(hF) },                                                                              // ホルン（和声を持つ）
      { ch: 'str', vol: 0.9, seq: drive(hF) },                                                                              // チェロ・コントラバス（8分）
      { ch: 'timp', vol: 1, seq: bars(...hF.slice(0, 30).map(c => `${c.k}:1 r:1`), roll('A2', 4)) },                        // ティンパニ（1・3拍目。最後はロール）
      { ch: 'noise', vol: 0.5, seq: bars('c:1 s:1 r:1 s:1', rep('r:1 s:1 r:1 s:0.5 s:0.5', 7), 'c:1 s:1 r:1 s:1', rep('r:1 s:1 r:1 s:0.5 s:0.5', 6),
        's:0.5 s:0.5 s:0.5 s:0.5 s:0.25 s:0.25 s:0.25 s:0.25 s:0.5 s:0.5') },                                                 // 小太鼓（2・4拍目）・シンバル
    ],
  };

  /* ---- 4. レースの結果（4位以下）：惜しかった、の短いジングル（D マイナー → F メジャー、96 BPM、2 小節。1回鳴らして止める）。3位以内は録音のオーケストラジングル ---- */
  const raceEnd_lose = {
    id: 'raceEnd_lose', name: 'レースの結果（また挑もう）', bpm: 96, bars: 2, beats: 4, loop: false,
    tracks: [
      { ch: 'brass', vol: 0.9, seq: bars('A4:1 F4:1 G4:1 E4:1', 'F4:3 r:1') },
      { ch: 'horn', vol: 0.8, seq: bars('F4:2 C4:2', 'A3:3 r:1') },
      { ch: 'str', vol: 0.9, seq: bars('D3:2 C3:2', 'F2:3 r:1') },
      { ch: 'timp', vol: 0.9, seq: bars('D3:1 r:3', 'F2:1 r:3') },
    ],
  };

  const api = { title, battle, field, raceEnd_lose };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).songs = api;
})(typeof window !== 'undefined' ? window : globalThis);
