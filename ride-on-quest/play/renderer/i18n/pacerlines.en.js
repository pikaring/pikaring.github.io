/* 試練のペースメーカーのひとこと（renderer/game/pacerlines.js）の英語。人柄は npclines.en.js に合わせる。{W} はそのときの目標のワット。
   英語のときだけ、pacerlines.js を読んだすぐあとに入れ替える（apply）。 */
(function (root) {
  const EN = {   // 仮（2026-10-26：ペースメーカーは主人公の職業だけ）
    warrior: ['{W} W. Let\'s ride together!', 'Don\'t fall behind. Follow me!'],
    wizard: ['{W} W, is it? Let us ride together.', 'Right on pace. I\'ll keep you company.'],
    monk: ['{W} W — let\'s go! Ride alongside!', 'Match your breath. Good legs!'],
    valkyrie: ['Go beyond {W} W. I shall ride beside you.', 'Fall behind and I leave you. Follow me.'],
    elf: ['…{W} W. I ride beside you.', 'Listen to the wind. I will match you.'],
    priest: ['Shall we go at {W} W? I\'m with you.', 'No rush. I\'ll ride beside you.'],
    samurai: ['{W} W. I am with you. Let us ride.', 'Keep your breath steady. I am at your side.'],
    mercenary: ['{W} W, eh? I\'ll stay with you, even uphill.', 'Don\'t get dropped. It cuts into my pay.'],
  };
  // L：pacerlines.js の LINES（人ごとの配列をそのまま入れ替える）
  function apply(L) { for (const [id, a] of Object.entries(EN)) if (L[id]) L[id] = a.slice(); return L; }
  const api = { EN, apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.RQ && root.RQ.i18n && root.RQ.i18n.lang === 'en' && root.RQ.pacerLines) apply(root.RQ.pacerLines.LINES);
})(typeof window !== 'undefined' ? window : globalThis);
