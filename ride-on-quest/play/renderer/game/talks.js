/* フィールドで出会う人たちとの会話。会話は自動で進む（1行 TALK_LINE_SEC 秒。Enter で早送り）。
   char：話す人（NPCS のキー。敵が話しかけてくることもあり、そのときは ENEMIES のキー）。
   lines の話し手：'npc'＝そのキャラ、'hero'＝主人公、'sys'＝地の文。
   effect：buff（次の戦闘だけの加護。HP は無いので、回復の代わりに加護にした。tol＝判定のゆるさ rpm）、tol（判定のゆるさ rpm。旅の終わりまで、3まで）、
           rival（次の戦闘の相手）、chance（確率で ok か ng）。text は効果を伝える一文。
           mission：NPC から頼まれごと（スロットにならない）。sec 秒のあいだ、回転数を cad ±half に保つ（ERG は FTP の frac 倍）。
           cad・frac は [始め, 終わり] にすると、時間とともにまっすぐ変わる（2026-10-20 ユーザー判断）。
           7割以上できれば ok の効果と星（出来ばえで1〜3つ）。n は名前、okText・ngText は結果を伝える一文。 */
(function (root) {
  const TALK_LINE_SEC = 5;
  // 道端の NPC（2026-10-22 ユーザー要望）：話す時刻のこの秒前から、話す人が道の先に立つ（近づくと見えてくる）。
  // 横を通り過ぎたら話し始める。通らなかったら（別の道へ曲がったなど）、話す時刻からこの秒たったら話し始める
  const NPC_LEAD_SEC = 12, NPC_WAIT_SEC = 30;   // NPC_WAIT_SEC：横を通らなくても（別の道へ曲がった）話し始めるまで。坂でゆっくり走るときに遠くから話さないよう 15 → 30（2026-10-26）

  // 島で出会う人たち（絵は assets/npc。tools/build_object_art.py）。area：道端に立つ地域（敵と同じ区分＝RQ.ride.areaAt の coast・forest・summit。1 地域 6 人）。
  // 主人公として走る傭兵・ワルキューレ・エルフは村人として出さない（2026-10-28 ユーザー判断）。長老は道中に出ない（決まった会話だけ）ので地域なし
  const NPCS = {
    elder: { n: '村の長老' },
    fisher: { n: '漁師', area: 'coast' }, merchant: { n: '行商人', area: 'coast' }, child: { n: '村の子ども', area: 'coast' },
    bard: { n: '吟遊詩人', area: 'coast' }, ama: { n: '海女', area: 'coast' }, keeper: { n: '灯台守', area: 'coast' },
    fairy: { n: '泉の妖精', area: 'forest' }, alchemist: { n: '錬金術師', area: 'forest' }, rogue: { n: '盗賊', area: 'forest' },
    cat: { n: '迷いネコ', area: 'forest' }, herbalist: { n: '薬草摘み', area: 'forest' }, beekeeper: { n: '養蜂家', area: 'forest' },
    astro: { n: '星読み', area: 'summit' }, smith: { n: 'ドワーフの鍛冶屋', area: 'summit' }, seer: { n: '占い師', area: 'summit' },
    oldknight: { n: '老騎士', area: 'summit' }, miko: { n: '火の山の巫女', area: 'summit' }, miner: { n: '硫黄掘り', area: 'summit' },
  };

  const TALKS = {
    // ---- 決まった場所で出る会話 ----
    guide: { char: 'elder', lines: [
      ['npc', 'おお、旅の方。よくぞこの島へ。'],
      ['npc', 'この島は火の島。火口のそばに鬼王が城を構え、鬼どもを従えておる。'],
      ['npc', '魔物とは、脚の回し方で戦うのじゃ。言われた回転数にぴたりと合わせれば、会心の一撃になろう。'],
      ['npc', 'ドラムの数字が九割を超えれば技が出る。はじめに外しても、合わせ続ければ取り戻せるのじゃ。'],   // 2026-10-24：得意属性の話（もう無い仕組み）を、今の決まりに
      ['hero', 'わかりました。行ってきます。'],
      ['npc', 'これを持っていきなされ。村の守り札じゃ。……効くのは次の戦いまでじゃがの。'],
    ], effect: { buff: { tol: 1 }, text: '次の戦い：回転数の判定がゆるい' } },

    camp: { char: null, lines: [
      // 2026-10-24 ユーザー指摘（どの時刻でも出るのに日暮れ・眠ったのに走り続ける）：短い休みの話に
      ['sys', '道ばたに、焚き火の跡が残る野営地があった。'],
      ['hero', '少しだけ脚を休めていこう。'],
      ['sys', '水を飲み、干し肉をかじって、また歩き出した。'],
    ], effect: { buff: { tol: 1 }, text: '体が軽くなった。次の戦い：回転数の判定がゆるい' } },

    gate: { char: 'oldknight', lines: [
      ['npc', 'この先が鬼王の城だ。わしの隊は、ここで三度押し返された。'],
      ['npc', '鬼王は、戦いが長引くほど力を増す。早く決めることだ。'],
      ['hero', 'わかった。一気に行く。'],
      ['npc', 'これを持っていけ。騎士団の気付け薬だ。……武運を祈る。'],   // HP は無いので、傷薬ではなく気付け薬（判定がゆるくなる）
    ], effect: { buff: { tol: 1 }, text: '次の戦い：回転数の判定がゆるい' } },

    finale: { char: 'fairy', lines: [
      ['npc', '鬼王を退けたのですね。島の者たちも、ほっとしています。'],
      ['npc', 'さあ、ゆっくり帰りましょう。脚はもう、軽く回すだけで十分。'],
      ['npc', '女王が、今日の鍛錬のまとめを用意して待っていますよ。'],
      ['hero', 'ありがとう。もうひと漕ぎしたら、報告に行くよ。'],
    ] },

    homeward: { char: 'elder', lines: [
      ['npc', '今日はここまでじゃな。よう回した。'],
      ['npc', '鬼王の城へは、まだ道半ば。続きは、また次の旅で進むがよい。'],
      ['hero', 'ありがとう。ゆっくり帰るよ。'],
    ] },

    // ---- 道すがら、順に出会う会話 ----
    alchemist: { char: 'alchemist', lines: [
      ['npc', 'ちょうどいいところに！ 新作の薬、試してみないか？'],
      ['hero', '……何の薬？'],
      ['npc', '元気が出る薬だ！ たぶん！'],
      ['sys', '断る間もなく、小瓶を口に押し込まれた。'],
    ], effect: { chance: 0.6, ok: { buff: { tol: 1 } }, okText: '意外と効いた。次の戦い：回転数の判定がゆるい', ngText: 'ひどい味がするだけだった' } },

    fairy: { char: 'fairy', lines: [
      ['npc', '旅の方、少し顔色が悪いですね。'],
      ['npc', '泉の水をひと口どうぞ。この水は、疲れた脚によく効くのです。'],
      ['hero', '冷たくて、おいしい。'],
    ], effect: { buff: { tol: 1 }, text: '次の戦い：回転数の判定がゆるい' } },

    imp: { char: 'imp', lines: [
      ['npc', 'やい、そこのニンゲン！ ここは鬼王さまの島だぞ！'],
      ['npc', 'この先の広場で待ってる。逃げるなよ！'],
      ['hero', '……断っても来るんでしょ。'],
      ['npc', 'よくわかってるな！ 仲間も呼んでやる！'],
    ], effect: { rival: 'imp', text: '次の戦い：小鬼' } },

    rogue: { char: 'rogue', lines: [
      ['npc', '通行料……と言いたいとこだが、今日は機嫌がいいんだ。'],
      ['npc', 'この先の連中は、こっちの息が乱れたところを狙ってくる。'],
      ['npc', '自分の型を崩さなきゃ、そうそう殴られねえよ。'],
      ['hero', 'どうしてそんなことを教えてくれるの？'],
      ['npc', 'あいつらに貸しがあるのさ。'],
    ], effect: { buff: { tol: 1 }, text: '次の戦い：回転数の判定がゆるい' } },


    bard: { char: 'bard', lines: [
      ['npc', 'やあ、きみの歩き方、リズムがいいね！'],
      ['npc', '一曲つきあってくれないか。ぼくの歌に合わせて回すんだ。だんだん速くなるよ！'],
      ['hero', '拍に合わせて、だんだん速く。やってみる。'],
    ], effect: { mission: { n: '歌に合わせて回せ', cad: [85, 108], half: 5, sec: 60, frac: 0.6,
      ok: { buff: { tol: 1 } }, okText: 'いい拍だった！ 次の戦い：回転数の判定がゆるい', ngText: '拍がずれてしまった……' } } },

    seer: { char: 'seer', lines: [
      ['npc', 'お待ちなさい。あなたの行く手に、良い札が出ています。'],
      ['npc', '次の戦い、脚の巡りがよいでしょう。'],
      ['hero', '本当に？'],
      ['npc', '占いですから。信じるかどうかは、あなたしだい。'],
    ], effect: { buff: { tol: 1 }, text: '次の戦い：回転数の判定がゆるい' } },

    astro: { char: 'astro', lines: [
      ['npc', '昼間でも、星は空にあるのです。見えないだけで。'],
      ['npc', 'あなたの星は……ふむ、今日は少しだけ運がいいようだ。'],
      ['hero', '少しだけ？'],
      ['npc', '少しだけ。だが、その少しが勝負を分ける。'],
    ], effect: { chance: 0.5, ok: { buff: { tol: 1 } }, okText: '次の戦い：回転数の判定がゆるい', ngText: '……何も起きなかった。星の気まぐれだ' } },

    smith: { char: 'smith', lines: [
      ['npc', 'こんな島で旅人とは珍しい。その得物、ちょっと見せてみな。'],
      ['npc', 'ふん、刃こぼれだらけじゃねえか。待ってな。'],
      ['sys', 'カン、カン、カン。鍛冶屋は手早く得物を打ち直してくれた。'],
      ['npc', 'よし。これで少しはましになった。'],
    ], effect: { tol: 1, text: '回転数の判定が1rpm ゆるくなる（旅の終わりまで）' } },

    merchant: { char: 'merchant', lines: [
      ['npc', 'へい、旅の人！ 荷車が坂で動かなくてね。'],
      ['npc', '後ろから押してくれないか。坂の上ほど重くなるから、だんだん力強く頼むよ。'],
      ['hero', '任せて。'],
    ], effect: { mission: { n: '荷車を押せ', cad: [92, 75], half: 6, sec: 60, frac: [0.65, 0.85],
      ok: { tol: 1 }, okText: '助かった！ お礼の砥石：回転数の判定が1rpm ゆるくなる（旅の終わりまで）', ngText: '荷車は坂の下まで戻ってしまった……' } } },

    fisher: { char: 'fisher', lines: [
      ['npc', '浜から上がってきたのかい。ちょうどいい、網を引くのを手伝ってくれ。'],
      ['npc', '魚が入るほど網は重くなる。それでも同じ調子で引き続けるのがこつだ。'],
      ['hero', 'わかった。'],
    ], effect: { mission: { n: '網を引け', cad: 90, half: 6, sec: 60, frac: [0.6, 0.85],
      ok: { buff: { tol: 1 } }, okText: '大漁だ！ 次の戦い：回転数の判定がゆるい', ngText: '魚に逃げられてしまった……' } } },

    child: { char: 'child', lines: [
      ['npc', 'こんにちは！ 旅の人？ ねえ、かけっこしよう！'],
      ['npc', 'あの木まで競争ね。よーい、どん！'],
    ], effect: { mission: { n: 'かけっこ', cad: [95, 120], half: 7, sec: 30, frac: 0.55,
      ok: { buff: { tol: 1 } }, okText: 'はやーい！ 次の戦い：回転数の判定がゆるい', ngText: '負けちゃった。子どもは得意げだ' } } },

    cat: { char: 'cat', lines: [
      ['npc', 'にゃあ。'],
      ['hero', '……ついてくる。'],
      ['npc', 'にゃーん。'],
      ['sys', 'ネコが脚にすり寄ってきた。'],
    ], effect: { chance: 0.6, ok: { buff: { tol: 1 } }, okText: 'なんだか癒やされた。次の戦い：回転数の判定がゆるい', ngText: '毛だらけになっただけだった' } },

    hunter: { char: 'hunter', lines: [
      ['npc', '……鬼王さまの城に向かう旅人とは、おまえか。'],
      ['npc', '城に着く前に、この弓で射ぬいてやる。次の崖道で待っているぞ。'],
      ['hero', '正面から来てくれるだけ、ましか。'],
    ], effect: { rival: 'hunter', text: '次の戦い：鬼の狩人' } },
  };

  // 道すがらの会話（決まった場所の会話を除く）。ミッションの会話は今は出さない（2026-10-20 ユーザー判断：
  // 回復の間は休む。仕組みは残しておく）
  const TALK_POOL = Object.keys(TALKS).filter(k => !['guide', 'camp', 'gate', 'finale', 'homeward'].includes(k) && !(TALKS[k].effect && TALKS[k].effect.mission));

  const api = { TALK_LINE_SEC, NPC_LEAD_SEC, NPC_WAIT_SEC, NPCS, TALKS, TALK_POOL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).talks = api;
})(typeof window !== 'undefined' ? window : globalThis);
