/* 試練のペースメーカーが、横に並ぶときのひとこと（2026-10-23 ユーザー要望。docs/impl-ghost.md）。人柄は npclines.js の言い方に合わせる。
   走りながら読める短さ（1行。{W} は、そのとき並ぶ目標のワット）。人ごとに2〜3本から、並ぶたびに1つ選ぶ（pacemaker.js）。 */
(function (root) {
  // 仮のひとこと（2026-10-26：ペースメーカーは主人公の 3D のキャラクターだけ。言い方は、あした主人公たちの話し方が決まってから直す）
  const LINES = {
    warrior: ['{W}Wだ。並んで走ろう！', '遅れるなよ。ついてこい！'],
    wizard: ['{W}Wですね。並んで走りましょう。', '計算どおりのペースです。お供します。'],
    monk: ['{W}W、いくぞ。並んで走る！', '呼吸を合わせろ。いい脚だ！'],
    valkyrie: ['{W}Wを越えてみなさい。並んであげるわ。', '遅れたら置いていくわよ。ついていらっしゃい。'],
    elf: ['……{W}W。並ぶ。', '風の音を聞け。合わせる。'],
    priest: ['{W}Wで参りましょう。ご一緒します。', '焦らず、お付き合いしますね。'],
    samurai: ['{W}W、参る。並んで走ろう。', '息を乱すな。拙者が隣におる。'],
    mercenary: ['{W}Wだな。坂でも並んでやる。', '置いていかれるなよ。稼ぎが減る。'],
  };
  // line(id, w, r)：r は 0〜1 の乱数。{W} は w に置きかえる
  const line = (id, w, r = Math.random()) => { const a = LINES[id] || ['{W}Wで並んで走るよ。']; return a[Math.floor(r * a.length) % a.length].replace(/\{W\}/g, String(w)); };
  const api = { LINES, line };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).pacerLines = api;
})(typeof window !== 'undefined' ? window : globalThis);
