/* 決まった場所の会話と道すがらの会話（renderer/game/talks.js の TALKS）の英語。文だけを持ち、話し手・効果の数値は talks.js のまま。
   lines は talks.js と同じ数・同じ順（tests/i18n.test.js が確かめる）。text・okText・ngText は効果を伝える一文、mission は頼まれごとの名前。
   英語のときだけ、talks.js を読んだすぐあとに入れ替える（apply）。 */
(function (root) {
  const NEXT = 'Next battle: cadence judged more kindly';
  const TRIP = 'Cadence judged 1 rpm more kindly (until the journey ends)';
  const EN = {
    guide: { lines: [
      'Ah, a traveler. Welcome to our isle.',
      'This is the Isle of Fire. By the crater the Ogre King hath raised his castle, and the Ogres serve him.',
      'Against the beasts thou fightest with the turning of thy legs. Match the cadence called, and thy blow shall strike true.',
      'When the drum\'s count passes ninety, thy art shall strike. Miss early, keep matching, and thou canst win it back.',
      'I understand. I\'m on my way.',
      'Take this — the village charm. …Though it holds only until the next battle.',
    ], text: NEXT },
    camp: { lines: [
      'By the roadside lies an old campsite, the ashes of a fire still there.',
      'Let me rest my legs a moment.',
      'You drink some water, chew some dried meat, and set off again.',
    ], text: 'Your body feels lighter. ' + NEXT },
    gate: { lines: [
      'Beyond lies the Ogre King\'s castle. Here my company was thrice thrown back.',
      'The longer the fight, the stronger the Ogre King grows. Make it swift.',
      'Understood. I\'ll go all in.',
      'Take this — the knights\' cordial. …May fortune favor thy arms.',
    ], text: NEXT },
    finale: { lines: [
      'You have driven back the Ogre King. The isle\'s folk breathe easier now.',
      'Come, let us ride home slowly. Your legs need only turn lightly now.',
      'The Queen awaits with the record of today\'s training.',
      'Thank you. A little more pedaling, then I\'ll go and report.',
    ] },
    homeward: { lines: [
      'That will do for today. Well spun.',
      'The road to the Ogre King\'s castle is but half-trodden. Go on with it on thy next journey.',
      'Thank you. I\'ll ride home slowly.',
    ] },
    alchemist: { lines: [
      'Perfect timing! Want to try my new potion?',
      '…What kind of potion?',
      'One that gives you energy! Probably!',
      'Before you can refuse, a vial is pushed into your mouth.',
    ], okText: 'It actually worked. ' + NEXT, ngText: 'It just tasted awful' },
    fairy: { lines: [
      'Traveler, you look a little pale.',
      'Have a sip of spring water. It does weary legs much good.',
      'So cold, and so good.',
    ], text: NEXT },
    imp: { lines: [
      'Oi, you there, human! This is the Ogre King\'s isle!',
      'I\'ll be waiting in the clearing ahead. Don\'t run away!',
      '…You\'ll come anyway even if I say no.',
      'Now you\'re getting it! I\'ll bring my friends, too!',
    ], text: 'Next battle: Goblin' },
    rogue: { lines: [
      'Toll… is what I\'d say, but I\'m in a good mood today.',
      'That lot ahead wait for your breathing to go ragged.',
      'Keep your form and they won\'t land many hits.',
      'Why are you telling me this?',
      'They owe me one.',
    ], text: NEXT },
    bard: { lines: [
      'Hey, your stride has a great rhythm!',
      'Join me for a song? Spin along to it. It gets faster and faster!',
      'With the beat, faster and faster. I\'ll try.',
    ], mission: 'Spin to the song', okText: 'Great rhythm! ' + NEXT, ngText: 'You lost the beat…' },
    seer: { lines: [
      'Wait. A good card has appeared on your path.',
      'In the next battle, your legs will flow well.',
      'Really?',
      'It is fortune-telling. Believe it or not, as you please.',
    ], text: NEXT },
    astro: { lines: [
      'Even by day, the stars are in the sky. You simply cannot see them.',
      'Your star is… hm, a little lucky today, it seems.',
      'Only a little?',
      'Only a little. But that little decides the fight.',
    ], okText: NEXT, ngText: '…Nothing happened. A whim of the stars' },
    smith: { lines: [
      'A traveler, on an isle like this? Rare. Let\'s see that weapon.',
      'Hmph, it\'s chipped all over. Wait there.',
      'Clang, clang, clang. The smith swiftly re-forges your weapon.',
      'There. That\'s a bit better.',
    ], text: TRIP },
    merchant: { lines: [
      'Ho there, traveler! My cart\'s stuck on the hill.',
      'Could you push from behind? It gets heavier near the top, so push harder as you go.',
      'Leave it to me.',
    ], mission: 'Push the cart', okText: 'You saved me! A whetstone in thanks: ' + TRIP.charAt(0).toLowerCase() + TRIP.slice(1), ngText: 'The cart rolled back down the hill…' },
    fisher: { lines: [
      'Come up from the beach? Good. Help me haul this net.',
      'The more fish, the heavier the net. The trick is to keep pulling at the same pace.',
      'Got it.',
    ], mission: 'Haul the net', okText: 'A big catch! ' + NEXT, ngText: 'The fish got away…' },
    child: { lines: [
      'Hi! Are you a traveler? Hey, let\'s race!',
      'Race you to that tree. Ready, set, go!',
    ], mission: 'Footrace', okText: 'So fast! ' + NEXT, ngText: 'You lost. The child looks very pleased' },
    cat: { lines: [
      'Mew.',
      '…It\'s following me.',
      'Mrrow.',
      'The cat rubs against your legs.',
    ], okText: 'Somehow you feel soothed. ' + NEXT, ngText: 'You just got covered in fur' },
    hunter: { lines: [
      '…So you are the traveler bound for the Ogre King\'s castle.',
      'Before you reach it, this bow will pierce you. I wait on the next cliff path.',
      'At least you\'re coming at me head-on.',
    ], text: 'Next battle: Ogre Hunter' },
  };

  // T：talks.js の TALKS。行の数が同じものだけ、話し手を残して文を入れ替える
  function apply(T) {
    for (const [id, e] of Object.entries(EN)) {
      const x = T[id]; if (!x) continue;
      if (e.lines && e.lines.length === x.lines.length) x.lines = x.lines.map(([who], i) => [who, e.lines[i]]);
      const fx = x.effect; if (!fx) continue;
      if (e.text && fx.text != null) fx.text = e.text;
      const tgt = fx.mission || fx;
      if (e.okText && tgt.okText != null) tgt.okText = e.okText;
      if (e.ngText && tgt.ngText != null) tgt.ngText = e.ngText;
      if (e.mission && fx.mission) fx.mission.n = e.mission;
    }
    return T;
  }

  const api = { EN, apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.RQ && root.RQ.i18n && root.RQ.i18n.lang === 'en' && root.RQ.talks) apply(root.RQ.talks.TALKS);
})(typeof window !== 'undefined' ? window : globalThis);
