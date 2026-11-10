/* ゲームのデータ。数値はすべて仮決め（docs/design.md §2・§3）。調整はここでする。
   2026-10-19 から王道ファンタジー（ドット絵の懐かしい RPG）に書き換えた。敵は火の島の生き物と鬼（ユーザー案）。 */
(function (root) {
  // 属性はトレーニングの種類（2026-10-20 ユーザー判断）：格闘＝低回転のパワー系、剣術＝中回転のテンポ系、魔法＝高回転（TUNE.attrCad）
  const ATTR = { g: '格闘', c: '剣術', p: '魔法' };

  // 島と物語の名前（指輪物語のように、島の名前はシンプルに「火の島」。ユーザー判断）
  const WORLD = { island: '火の島', queen: '火の島の女王', boss: '鬼王', castle: '鬼王の城' };

  // 戦闘の流れ（2026-10-19 ユーザー判断。HP は持たない）：敵が現れる → ドラムが3つ並ぶ →「○○RPMで回せ！」を3回
  // → 合致率の平均が90%以上なら倒す。届かなければ攻撃を受け、敵は逃げていく（3〜4分。3セットでは長くて飽きるので1セットにした）
  const BATTLE = { introSec: 5, resultSec: 6 };

  // 職業ごとのトレーニングプラン（2026-10-20 ユーザー判断：職業はその日やりたいワークアウト。代表的な1日を出す。
  // うまくいけば、週と日を覚えて進む続き物にする）。名前はゲームの中のもの、like は近い Zwift のプラン。
  // 1日の流れ：ウォームアップ（warm）→ 本番（sets をくり返す。間は回復 rest）→ ボス（boss。終了の5分前）→ 帰り道のクールダウン。
  // 本番の1セットは waves（1〜3）。ウェーブは間を空けずに続く（連戦）。1つのウェーブはドラム3つで、
  // 敵が1体なら3つで攻め、3体（小さな雑魚）なら1つずつで1体を攻める（2026-10-20 ユーザー案）。
  // reels：ドラムごとの { sec：長さ, frac：目標パワー（FTP 比。ERG で送る）, cad：回転数,
  // steps：ドラムの中で目標が変わるとき [秒, FTP 比] のくり返し }。トレーニング中はギアを一切変えなくてよい（いつも ERG）。
  // 3つとも同じ回転数はつまらないので、ドラムごとに回転数を変える（低回転は70台まで）。ドラムの長さは30〜90秒
  const R = (sec, frac, cad, steps) => ({ sec, frac, cad, steps });
  const on = (sec, hi, lo, cad, hiSec = sec / 2) => R(sec, (hi * hiSec + lo * (sec - hiSec)) / sec, cad, [[hiSec, hi], [sec - hiSec, lo]]);   // 強弱
  const one = reels => ({ foes: 1, reels });     // 1体を3つのドラムで攻める
  const trio = reels => ({ foes: 3, reels });    // 小さな雑魚3体を1つずつで攻める
  // 30秒ずつ強く・軽くをくり返すメニュー（30/30）（2026-10-23 ユーザー判断：ドラムの中で負荷が切り替わると分かりにくい）：
  // ドラム1つ＝30秒の1区間にし、強い区間のドラムと軽い区間のドラムを交互に並べる（ドラムが変わる＝負荷が変わる）。雑魚3体を30秒のドラムごとに1体ずつ倒し、
  // 6区間（3分）は2つのウェーブの連戦で続ける。cads：6つのドラムの回転数（強・軽・強 ／ 軽・強・軽）
  // オーバーアンダー（2026-10-23 ユーザー判断）：ドラム1つ＝45秒の1区間にし、アンダー（lo）とオーバー（hi）を交互に回す（ドラムの途中で負荷を変えない）。
  // 敵は1体のまま、ドラムの数は区間の数（cads の数）。基礎の時期の日は、ドラムごとに縮む（30秒）
  const overUnder = (lo, hi, cads) => [{ ...one(cads.map((c, k) => R(45, k % 2 ? hi : lo, c))), ou: true }];   // ou：オーバーアンダーの印（短い旅でドラムを減らしても、概要でオーバーアンダーと言えるように）
  const thirty = (hi, lo, cads) => [0, 1].map(w => trio([0, 1, 2].map(j => { const k = w * 3 + j; return R(30, k % 2 ? lo : hi, cads[k]); })));
  const PLANS = {
    // 基礎づくり：持久（Z2）とテンポ、15秒スプリントで筋力（2026-11-09 判断 65。前は 10 秒）、後半に閾値
    build: { n: '基礎づくり', like: 'FTP Builder', warm: { sec: 480, frac: 0.55 }, rest: { sec: 180, frac: 0.62 },
      sets: [
        { waves: [one([R(90, 0.85, 88), R(90, 0.88, 95), R(90, 0.85, 102)])] },
        { waves: [trio([on(60, 1.6, 0.6, 75, 15), on(60, 1.6, 0.6, 80, 15), on(60, 1.6, 0.6, 85, 15)])] },   // 15秒つよく 45秒かるく（2026-11-09 判断 65：つよくは最低 15 秒。前は 10 秒）
        { waves: [one([R(90, 0.85, 92), R(90, 0.88, 85), R(90, 0.88, 100)]), one([R(90, 0.9, 95), R(90, 0.88, 88), R(90, 0.9, 105)])] },
      ],
      boss: { waves: [one([R(90, 0.95, 92), R(90, 1.0, 98), R(90, 0.97, 104)])] } },
    // 総合強化：スイートスポット、VO2max、30/30、オーバーアンダー
    allround: { n: '総合強化', like: 'Build Me Up', warm: { sec: 480, frac: 0.55 }, rest: { sec: 180, frac: 0.6 },
      sets: [
        { waves: [one([R(90, 0.88, 90), R(90, 0.92, 95), R(90, 0.9, 100)]), one([R(90, 0.92, 92), R(90, 0.94, 98), R(90, 0.9, 105)])] },
        { waves: [one([R(60, 1.1, 100), R(60, 1.12, 105), R(60, 1.15, 98)])] },
        { waves: thirty(1.2, 0.5, [100, 88, 105, 92, 110, 95]) },   // 30/30（120%・50%）
        { waves: overUnder(0.95, 1.05, [92, 96, 98, 94, 95, 100]) },   // オーバーアンダー（95%・105% を45秒ずつ、6区間＝4.5分）
      ],
      boss: { waves: [one([R(60, 1.05, 95), R(60, 1.15, 102), R(60, 1.2, 108)])] } },
    // 持続力：クルーズインターバル（92%・97%）の長い連戦と、30/30（150%）
    endure: { n: '持続力', like: 'TT TuneUp', warm: { sec: 480, frac: 0.55 }, rest: { sec: 240, frac: 0.6 },
      sets: [
        { waves: [one([R(90, 0.92, 90), R(90, 0.97, 95), R(90, 0.92, 100)]), one([R(90, 0.97, 92), R(90, 0.92, 98), R(90, 0.97, 104)]),
          one([R(90, 0.92, 95), R(90, 0.97, 100), R(90, 0.92, 106)])] },
        { waves: thirty(1.5, 0.5, [100, 88, 105, 92, 110, 95]) },   // 30/30（150%・50%）
      ],
      boss: { waves: [one([R(90, 0.92, 95), R(90, 0.95, 100), R(90, 0.97, 105)])] } },
    // 長距離：テンポの長い連戦と Z2、ところどころに VO2max
    fondo: { n: '長距離', like: 'Gran Fondo', warm: { sec: 480, frac: 0.55 }, rest: { sec: 180, frac: 0.65 },
      sets: [
        { waves: [one([R(90, 0.8, 88), R(90, 0.85, 95), R(90, 0.82, 100)]), one([R(90, 0.85, 92), R(90, 0.88, 98), R(90, 0.85, 104)])] },
        { waves: [one([R(90, 1.05, 98), R(90, 1.08, 102), R(90, 1.05, 95)])] },
        { waves: [one([R(90, 0.85, 90), R(90, 0.88, 95), R(90, 0.85, 100)])] },
      ],
      boss: { waves: [one([R(90, 0.88, 92), R(90, 1.05, 100), R(90, 1.1, 105)])] } },
    // VO2max（ワルキューレ。2026-10-27 ユーザー判断）：短く強い 110〜120% が多い。1分の連続・30/30・45秒の連戦
    vo2: { n: 'VO2max', like: 'Crit Crusher', warm: { sec: 480, frac: 0.55 }, rest: { sec: 180, frac: 0.6 },
      sets: [
        { waves: [one([R(60, 1.1, 98), R(60, 1.15, 104), R(60, 1.1, 95)])] },
        { waves: thirty(1.2, 0.5, [100, 88, 105, 92, 110, 95]) },   // 30/30（120%・50%）
        { waves: [one([R(60, 1.12, 96), R(60, 1.15, 102), R(60, 1.2, 108)])] },
        { waves: [one([R(45, 1.15, 100), R(45, 1.2, 94), R(45, 1.15, 106)]), one([R(45, 1.2, 98), R(45, 1.15, 104), R(45, 1.2, 110)])] },   // 45秒の連戦
      ],
      boss: { waves: [one([R(60, 1.1, 98), R(60, 1.15, 104), R(60, 1.2, 110)])] } },
    // スプリント（エルフ。2026-10-27 ユーザー判断）：ごく短い全力（15〜30秒。2026-11-09 判断 65 で 10 秒をやめた）と高回転。全力のあとは軽く回す（on の強弱）
    sprint: { n: 'スプリント', like: 'Crit Crusher（スプリントのワークアウト）', warm: { sec: 480, frac: 0.55 }, rest: { sec: 180, frac: 0.6 },
      sets: [
        { waves: [trio([on(60, 1.6, 0.6, 100, 15), on(60, 1.6, 0.6, 105, 15), on(60, 1.6, 0.6, 110, 15)])] },   // 15秒全力 ×3（2026-11-09 判断 65：前は 10 秒）
        { waves: [trio([on(60, 1.4, 0.55, 100, 20), on(60, 1.4, 0.55, 108, 20), on(60, 1.4, 0.55, 95, 20)])] },   // 20秒（強弱のあるドラムは小さな雑魚に。中ボスの ×1.05 は強弱の無いドラムだけで確かめている）
        { waves: [one([R(90, 0.75, 105), R(60, 0.8, 115), R(60, 0.75, 110)])] },   // 高回転（スピン）
        { waves: [trio([on(60, 1.3, 0.55, 100, 30), on(60, 1.3, 0.55, 106, 30), on(60, 1.3, 0.55, 96, 30)])] },   // 30秒
      ],
      boss: { waves: [one([R(60, 1.1, 100), R(45, 1.15, 108), R(30, 1.2, 115)])] } },   // ボスのドラムは強弱なし（鬼王の後半は、この3本を強める。course.js の toughen）
    // スイートスポット（侍。2026-10-27 ユーザー判断）：FTP の 88〜94% を長めに。ドラムは 90 秒までなので、長さは連戦（ウェーブを続ける）で出す。回転数は中くらい（85〜102）
    sweetspot: { n: 'スイートスポット', like: 'Sweet Spot 系のワークアウト', warm: { sec: 480, frac: 0.55 }, rest: { sec: 180, frac: 0.6 },
      sets: [
        { waves: [one([R(90, 0.88, 88), R(90, 0.9, 94), R(90, 0.88, 100)]), one([R(90, 0.9, 90), R(90, 0.92, 96), R(90, 0.9, 102)])] },   // 9分
        { waves: [one([R(90, 0.9, 86), R(90, 0.92, 92), R(90, 0.94, 98)]), one([R(90, 0.92, 90), R(90, 0.94, 96), R(90, 0.92, 100)]),
          one([R(90, 0.9, 88), R(90, 0.94, 95), R(90, 0.92, 102)])] },   // 13.5分
        { waves: [one([R(90, 0.92, 85), R(90, 0.94, 92), R(90, 0.9, 98)]), one([R(90, 0.94, 88), R(90, 0.92, 95), R(90, 0.94, 100)])] },   // 9分
      ],
      boss: { waves: [one([R(90, 0.9, 90), R(90, 0.92, 96), R(90, 0.94, 102)])] } },
    // 登坂（傭兵。2026-10-27 ユーザー判断）：長めの閾値（95〜105%）を低回転（70台〜80台前半）で。坂を上るときの重いギアの踏み方
    climb: { n: '登坂', like: 'Climbing 系のワークアウト', warm: { sec: 480, frac: 0.55 }, rest: { sec: 240, frac: 0.6 },
      sets: [
        { waves: [one([R(90, 0.95, 78), R(90, 0.98, 74), R(90, 0.95, 82)]), one([R(90, 0.98, 76), R(90, 1.0, 72), R(90, 0.97, 80)])] },   // 9分
        { waves: overUnder(0.95, 1.05, [80, 75, 82, 74, 84, 76]) },   // 坂の上りで踏み増す（95%・105% を45秒ずつ、6区間＝4.5分。オーバーは低回転）
        { waves: [one([R(90, 1.0, 76), R(90, 1.03, 72), R(90, 1.0, 80)]), one([R(90, 1.02, 74), R(90, 1.05, 70), R(90, 1.0, 78)])] },   // 9分
      ],
      boss: { waves: [one([R(90, 0.97, 80), R(90, 1.0, 75), R(90, 1.05, 72)])] } },
  };
  // キャラクターのレベル（2026-10-21 ユーザー判断）：プランの進み具合。レベル1つが「1日」で、そのキャラクターで合わせて60分走ると
  // ボス（55分の時点）が出てレベルが上がる。15分ずつなら4回で1日。1日ごとにレシピ（本番のセットとボス）が変わる。
  // 流れは 基礎 ×3 → 回復 → 強化 ×3 → 回復 → 仕上げ ×3 → 試練の日（Zwift のプランのように、4つごとに軽い日）。12 を終えると称号と2周目
  const PHASES = ['基礎', '基礎', '基礎', '回復', '強化', '強化', '強化', '回復', '仕上げ', '仕上げ', '仕上げ', '試練の日'];
  const T3 = (sec, f, cads) => cads.map((c, i) => R(sec, Array.isArray(f) ? f[i] : f, c));   // 3つのドラム
  const sprint = cad => on(60, 1.6, 0.6, cad, 15);   // 15秒スプリント（160%）と45秒の軽い回し（2026-11-09 判断 65：つよくは最低 15 秒。前は 10 秒）
  const RECOVER = { sets: [{ waves: [one(T3(60, 0.78, [90, 96, 102]))] }], rest: { sec: 300, frac: 0.6 },
    boss: { waves: [one(T3(60, [0.85, 0.85, 0.88], [92, 98, 104]))] } };
  // 武闘家・基礎づくり（2026-10-21 ユーザーが表を確かめた）
  const BUILD_DAYS = [
    { sets: [{ waves: [one(T3(60, 0.85, [88, 95, 102]))] }], boss: { waves: [one(T3(60, [0.88, 0.9, 0.92], [92, 98, 104]))] } },
    { sets: [{ waves: [one(T3(75, [0.85, 0.88, 0.85], [90, 96, 102]))] }], boss: { waves: [one(T3(75, [0.9, 0.92, 0.95], [92, 98, 104]))] } },
    { sets: [{ waves: [one(T3(90, 0.88, [88, 95, 102]))] }, { waves: [trio([sprint(75), sprint(80), sprint(85)])] }], boss: { waves: [one(T3(90, [0.9, 0.93, 0.95], [92, 98, 104]))] } },
    RECOVER,
    { sets: [{ waves: [one(T3(90, [0.88, 0.9, 0.88], [90, 96, 102])), one(T3(90, [0.9, 0.88, 0.9], [92, 85, 100]))] }], boss: { waves: [one(T3(90, [0.95, 0.97, 1.0], [92, 98, 104]))] } },
    { sets: [{ waves: [trio([sprint(75), sprint(80), sprint(85)])] }, { waves: [one(T3(90, 0.88, [90, 96, 102]))] }, { waves: [trio([sprint(78), sprint(82), sprint(88)])] }], boss: { waves: [one(T3(90, [0.95, 0.97, 1.0], [92, 98, 104]))] } },
    { sets: [{ waves: [one(T3(90, 0.9, [88, 95, 100])), one(T3(90, 0.9, [92, 98, 104]))] }], boss: { waves: [one(T3(90, [0.95, 1.0, 1.02], [92, 98, 104]))] } },
    RECOVER,
    { sets: [{ waves: [one(T3(90, 0.95, [90, 95, 100]))] }], boss: { waves: [one(T3(90, [1.0, 1.02, 1.05], [92, 98, 104]))] } },
    { sets: [{ waves: [one(T3(90, [0.95, 0.97, 1.0], [90, 95, 100])), one(T3(90, [0.97, 1.0, 0.97], [92, 98, 104]))] }], boss: { waves: [one(T3(90, [1.0, 1.03, 1.05], [92, 98, 104]))] } },
    { sets: [{ waves: [one(T3(90, 0.95, [90, 95, 100])), one(T3(90, 0.97, [92, 98, 104])), one(T3(90, 1.0, [88, 95, 102]))] }], boss: { waves: [one(T3(90, [1.02, 1.05, 1.08], [92, 98, 104]))] } },
    { sets: [{ waves: [one(T3(60, 0.85, [90, 96, 102]))] }], boss: { waves: [one(T3(60, [0.9, 0.95, 1.0], [92, 98, 104]))] } },
  ];
  // ほかのプランは、プランのセットを時期に合わせて伸び縮みさせて作る（基礎＝少し軽く短く、強化＝そのまま、仕上げ＝少し強く）
  const scaleSet = (set, fm, sm = 1) => ({ waves: set.waves.map(w => ({ ...w, reels: w.reels.map(r => ({ ...r, sec: Math.max(30, Math.round(r.sec * sm / 15) * 15),
    frac: +(r.frac * fm).toFixed(3), steps: r.steps && r.steps.map(([sec, f]) => [sec, +(f * fm).toFixed(3)]) })) })) });
  function daysOf(plan) {
    return PHASES.map((ph, i) => {
      if (ph === '回復') return RECOVER;
      const k = i % 4;   // その時期の何日目か（0〜2）
      const [fm, sm] = ph === '基礎' ? [0.94 + 0.02 * k, [0.67, 0.83, 1][k]] : ph === '強化' ? [1 + 0.01 * k, 1] : ph === '仕上げ' ? [1.03 + 0.01 * k, 1] : [0.92, 0.67];
      const sets = ph === '試練の日' ? [scaleSet(plan.sets[plan.sets.length - 1], fm, sm)] : plan.sets.map(st => scaleSet(st, fm, sm));
      return { sets, boss: scaleSet(plan.boss, fm, Math.min(1, sm)) };
    });
  }
  const LEVELS = { build: BUILD_DAYS, allround: daysOf(PLANS.allround), endure: daysOf(PLANS.endure), fondo: daysOf(PLANS.fondo), vo2: daysOf(PLANS.vo2), sprint: daysOf(PLANS.sprint), sweetspot: daysOf(PLANS.sweetspot), climb: daysOf(PLANS.climb) };
  // planId のレベル lv（1〜12）の1日。rest・warm は、その日に書いていなければプランのもの
  const dayOf = (planId, lv) => { const p = PLANS[planId], d = LEVELS[planId][(lv - 1) % PHASES.length]; return { phase: PHASES[(lv - 1) % PHASES.length], warm: p.warm, rest: d.rest || p.rest, sets: d.sets, boss: d.boss }; };
  const MAX_LEVEL = PHASES.length;

  // 装備（2026-10-21 ユーザー判断：絵はとりあえずコレクションとして見られるだけ。着せない・強さにも効かない）。
  // キャラクターのレベルが lv に上がると手に入る（一度手に入れたら2周目もそのまま）。絵は assets/items/<ID>.png（届くまでは仮の枠）
  const ITEMS = {
    warrior: [
      { id: 'w_sword1', lv: 2, n: '旅人の剣', d: '北風泊の鍛冶屋が打った、まっすぐな片手剣。' },
      { id: 'w_shield', lv: 4, n: '皮の盾', d: '海ヘビの皮を張った、軽い丸盾。' },
      { id: 'w_sword2', lv: 6, n: '鋼の剣', d: '火口の熱で鍛えた、刃こぼれしない剣。' },
      { id: 'w_mail', lv: 8, n: '鎖かたびら', d: '細い鉄の輪を編んだ鎧。走っても音がしない。' },
      { id: 'w_helm', lv: 10, n: '騎士の兜', d: '老騎士の隊に伝わる兜。' },
      { id: 'w_legend', lv: 12, n: '火の島の剣', d: '鬼王の城の奥に眠っていた、伝説の剣。' },
    ],
    wizard: [
      { id: 'z_staff1', lv: 2, n: '樫の杖', d: '島の森の樫から削った、素直な杖。' },
      { id: 'z_robe', lv: 4, n: '旅人のローブ', d: '潮風に強い、厚手のローブ。' },
      { id: 'z_staff2', lv: 6, n: '星の杖', d: '星読みがくれた、先に星の宿る杖。' },
      { id: 'z_book', lv: 8, n: '炎の魔導書', d: '火の島の古い呪文がつづられた本。' },
      { id: 'z_hat', lv: 10, n: '月のとんがり帽子', d: '夜になると、つばがかすかに光る帽子。' },
      { id: 'z_legend', lv: 12, n: '火の島の杖', d: '火口の炎を封じた、伝説の杖。' },
    ],
    monk: [
      { id: 'm_belt', lv: 2, n: '布の帯', d: '道場で最初に締める、木綿の帯。' },
      { id: 'm_gauntlet', lv: 4, n: '革の手甲', d: '岩ガニの甲羅で補強した手甲。' },
      { id: 'm_claw', lv: 6, n: '鉄の爪', d: '溶岩の魔人の岩も砕く、鉄の爪。' },
      { id: 'm_gi', lv: 8, n: '疾風の道着', d: '風を切って動ける、薄く強い道着。' },
      { id: 'm_band', lv: 10, n: '赤いはちまき', d: '締めると、脚がもうひと回り回る。' },
      { id: 'm_legend', lv: 12, n: '火の島の拳当て', d: '鬼王の拳を受け止めた、伝説の拳当て。' },
    ],
    priest: [
      { id: 'p_mace1', lv: 2, n: '木のメイス', d: '村の祠に奉納されていた、樫のメイス。' },
      { id: 'p_beads', lv: 4, n: '祈りの数珠', d: '泉の妖精が清めた数珠。' },
      { id: 'p_mace2', lv: 6, n: '聖なる鎚', d: '鬼火を払う、銀の鎚。' },
      { id: 'p_robe', lv: 8, n: '白の法衣', d: '汚れのつかない、白い法衣。' },
      { id: 'p_crown', lv: 10, n: '光の冠', d: '祈ると、まわりがほんのり明るくなる冠。' },
      { id: 'p_legend', lv: 12, n: '火の島の聖杖', d: '島を守ってきた、伝説の聖杖。' },
    ],
    valkyrie: [
      { id: 'v_spear1', lv: 2, n: '見習いの槍', d: '北風泊の兵が最初に握る、樫の柄の槍。' },
      { id: 'v_shield', lv: 4, n: '翼の盾', d: '翼の紋を描いた、青い丸盾。' },
      { id: 'v_wing', lv: 6, n: '白い羽根飾り', d: '大鷲の羽根を挿した兜の飾り。' },
      { id: 'v_spear2', lv: 8, n: '雷の槍', d: '嵐の夜、穂先に稲妻が宿った槍。' },
      { id: 'v_armor', lv: 10, n: '銀の胸当て', d: '潮風にさびない、銀の胸当て。' },
      { id: 'v_legend', lv: 12, n: '火の島の神槍', d: '女王の宮殿に伝わる、伝説の槍。' },
    ],
    elf: [
      { id: 'e_bow1', lv: 2, n: '狩人の弓', d: '島の森の竹で作った、軽い弓。' },
      { id: 'e_quiver', lv: 4, n: '革の矢筒', d: '矢が三十本入る、鹿革の矢筒。' },
      { id: 'e_cloak', lv: 6, n: '森のマント', d: '木の葉にまぎれる、緑のマント。' },
      { id: 'e_bow2', lv: 8, n: '風切りの弓', d: '放った矢が、風より速く飛ぶ弓。' },
      { id: 'e_boots', lv: 10, n: '疾風の長靴', d: '履くと、脚がひと息で回りきる長靴。' },
      { id: 'e_legend', lv: 12, n: '火の島の霊弓', d: '泉の妖精が守ってきた、伝説の弓。' },
    ],
    samurai: [   // 2026-10-27（ID と名前は窓口が決めた。docs/gemini-items-new-heroes.md）
      { id: 's_bokken', lv: 2, n: '木刀', d: '道場で毎朝振る、樫の木刀。' },
      { id: 's_hachigane', lv: 4, n: '鉢金', d: '額を守る鉄の板を縫いつけた、白い鉢巻。' },
      { id: 's_katana', lv: 6, n: '打刀', d: '北風泊の刀鍛冶が打った、黒鞘の刀。' },
      { id: 's_do', lv: 8, n: 'えんじの胴', d: '漆を重ねた、えんじ色の胴。' },
      { id: 's_kote', lv: 10, n: '籠手', d: '紺の布に小さな鉄の板を綴じた籠手。' },
      { id: 's_legend', lv: 12, n: '火の島の名刀', d: '刃に炎の紋が浮かぶ、伝説の刀。' },
    ],
    mercenary: [   // 2026-10-27（ID と名前は窓口が決めた。docs/gemini-items-new-heroes.md）
      { id: 'c_dagger', lv: 2, n: '傭兵の短剣', d: '革を巻いた柄の、頑丈な短剣。' },
      { id: 'c_pauldron', lv: 4, n: '革の肩当て', d: '三枚の革を重ねて留めた肩当て。' },
      { id: 'c_greatsword', lv: 6, n: '大剣', d: '両手で振る、幅の広い鋼の大剣。' },
      { id: 'c_bracer', lv: 8, n: '鉄の腕当て', d: '鉄の鋲と帯で補強した、革の腕当て。' },
      { id: 'c_armor', lv: 10, n: '古強者の革鎧', d: '傷だらけの、歴戦の革の胴着。' },
      { id: 'c_legend', lv: 12, n: '火の島の大剣', d: '冷えた溶岩のように刃が光る、伝説の大剣。' },
    ],
  };
  // 手に入れた装備（best：そのキャラクターで上がったいちばん高いレベル）
  const itemsOf = (heroId, best) => (ITEMS[heroId] || []).filter(it => it.lv <= best);

  // ドラムの目標パワー（FTP 比）。t はそのドラムを回し始めてからの秒
  const reelFrac = (r, t) => {
    if (!r.steps) return r.frac;
    let x = t % r.steps.reduce((a, s) => a + s[0], 0);
    for (const [sec, f] of r.steps) { if (x < sec) return f; x -= sec; }
    return r.frac;
  };
  // 星（2026-10-20 ユーザー判断）：うまくできると星がもらえ、まとめで星の数に応じて点数が入る。
  // 戦闘はドラムごとに、ミッションは出来ばえで1〜3個
  const STARS = {
    reel: 0.9,                    // ドラム：合致率がこれ以上なら星1つ（会心なら金の星。数は同じ1つ）
    mission: [0.7, 0.85, 0.95],   // ミッション：この割合を超えるごとに星1つ（1つ目が成功の線）
    point: 100,                   // 星1つの点数
  };
  const ERG_REST = 0.5;   // クールダウン（フィールドと敵の番）の目標パワー（FTP 比）

  // 難易度：必要なパワー（FTP 比）に掛ける
  const DIFFICULTY = { easy: { n: 'やさしい', mul: 0.9 }, normal: { n: 'ふつう', mul: 1 }, hard: { n: 'きびしい', mul: 1.1 } };

  // 主人公（2026-10-27 から8人：男4・女4。ワルキューレ・エルフを足し、そのあと侍・傭兵を足した）。職業はその日のトレーニングプラン（plan。2026-10-20 ユーザー判断）。sp は見た目の色だけ
  const HEROES = {
    warrior: { n: '戦士',     sex: 'm', sp: 'c', plan: 'allround' },
    wizard:  { n: '魔法使い', sex: 'f', sp: 'p', plan: 'endure' },
    monk:    { n: '武闘家',   sex: 'f', sp: 'g', plan: 'build' },
    priest:  { n: '僧侶',     sex: 'm', sp: 'p', plan: 'fondo' },
    valkyrie: { n: 'ワルキューレ', sex: 'f', sp: 'c', plan: 'vo2' },
    elf:     { n: 'エルフ',   sex: 'f', sp: 'g', plan: 'sprint' },
    samurai: { n: '侍',       sex: 'm', sp: 'c', plan: 'sweetspot' },
    mercenary: { n: '傭兵',   sex: 'm', sp: 'g', plan: 'climb' },
  };
  const HERO_ORDER = ['warrior', 'wizard', 'monk', 'priest', 'valkyrie', 'elf', 'samurai', 'mercenary'];

  // 敵（ユーザー案：舞台は火の島）。area：出る場所（coast＝海岸・崖、forest＝山腹・森、summit＝火口・山頂）。
  // 敵は見た目と格（雑魚・中ボス・ボス）だけで、メニューは職業のプランから出す（2026-10-20 ユーザー判断）。
  // small：3体並んで出られる小さな雑魚。sp（属性）は演出の色だけ。
  // shot：飛び道具を持つ敵（'arrow'＝矢・'stone'＝石つぶて・'fire'＝火の玉・'flame'＝炎・'ash'＝灰のけむり・'hex'＝妖術の光）。攻撃のとき前に出ず、その場から飛ばす（2026-10-28 ユーザー判断。敵を足すときは、ここに書くだけ）
  const ENEMIES = {
    crab:      { n: '岩ガニ',       sp: 'g', area: 'coast', small: true },
    seasnake:  { n: '海ヘビ',       sp: 'c', area: 'coast' },
    lizard:    { n: '岩トカゲ',     sp: 'c', area: 'coast', small: true },
    crow:      { n: '大ガラス',     sp: 'p', area: 'forest', small: true },
    mushroom:  { n: '毒キノコ',     sp: 'p', area: 'forest', small: true },
    imp:       { n: '小鬼',         sp: 'c', area: 'forest', small: true, shot: 'stone' },
    hunter:    { n: '鬼の狩人',     sp: 'c', area: 'forest', shot: 'arrow' },   // shot：飛び道具（攻撃のとき前に出ず、その場から飛ばす。battle-view.js の FOE_SHOT。2026-10-28）
    onibi:     { n: '鬼火',         sp: 'g', area: 'summit', small: true, shot: 'fire' },
    golem:     { n: '溶岩の魔人',   sp: 'g', area: 'summit' },
    redoni:    { n: '赤鬼',         sp: 'g', area: 'summit' },
    blueoni:   { n: '青鬼',         sp: 'p', area: 'summit', shot: 'hex' },
    // 雑魚戦用の小さな敵（2026-10-24 窓口・絵の担当。docs/gemini-night-20261024b.md）。wait：絵が届くまで戦闘に出さない（取り込んだら外す）
    hermit:    { n: '軽石ヤドカリ', sp: 'g', area: 'coast', small: true },
    octo:      { n: 'ちびダコ',     sp: 'p', area: 'coast', small: true },
    bat:       { n: '洞窟コウモリ', sp: 'c', area: 'forest', small: true },
    acorn:     { n: 'どんぐり兵',   sp: 'c', area: 'forest', small: true },
    embertoad: { n: '火の粉ガエル', sp: 'p', area: 'summit', small: true, shot: 'flame' },
    ashpuff:   { n: 'けむり玉',     sp: 'g', area: 'summit', small: true, shot: 'ash' },   // 前は「灰ダマ」（2026-10-25 ユーザー判断で改名。ID はそのまま）
    // 地域ごとに足りない敵（2026-10-25 ユーザー了承。docs/gemini-enemies-20261025.md）。絵が届くまで wait
    turtle:    { n: '大ウミガメ',   sp: 'g', area: 'coast' },
    sealion:   { n: '荒くれトド',   sp: 'g', area: 'coast' },
    boar:      { n: '牙イノシシ',   sp: 'c', area: 'forest' },
    mossman:   { n: '苔むした木人', sp: 'p', area: 'forest' },
    // 中ボスも、現れたときの地形の地域から選ぶ（その地域の中ボスがまだいなければ、ほかの地域から）
    eagle:     { n: '大鷲',         sp: 'c', kind: 'elite', area: 'coast' },
    bear:      { n: '森の大熊',     sp: 'g', kind: 'elite', area: 'forest' },
    gatekeeper:{ n: '番人の大鬼',   sp: 'g', kind: 'elite', area: 'summit' },
    oniking:   { n: '鬼王',         sp: 'g', kind: 'boss' },
  };
  const AREAS = ['coast', 'forest', 'summit'];
  const MOBS = Object.keys(ENEMIES).filter(id => !ENEMIES[id].kind && !ENEMIES[id].wait);   // wait（絵が届くまで）は出さない
  const SMALL = MOBS.filter(id => ENEMIES[id].small);
  const ELITES = Object.keys(ENEMIES).filter(id => ENEMIES[id].kind === 'elite' && !ENEMIES[id].wait);

  // 敵の格ごとの、攻撃のダメージ（見せるだけ）
  const KIND = { mob: { dmg: 12 }, elite: { dmg: 16 }, boss: { dmg: 24 } };

  // 戦闘の判定（2026-10-20 ユーザー判断）。合致率は回転数の近さ：1 −（ずれ − ゆるさ）÷ 目標の回転数
  const TUNE = {
    tol: 1,                 // ゆるさ（rpm）：このずれまでは、ずれていないことにする
    tolBonusMax: 3,         // ミッションの報酬で足せるゆるさの上限（rpm。旅の終わりまで）
    attrCad: { g: 85, c: 99 },   // ドラムの属性（演出の色）：85rpm 以下は格闘、99rpm 以下は剣術、それより上は魔法
    matchTau: 10,           // ドラムの合致率は、最近の回転を重く数える平均（指数移動平均）。この秒の時定数（2026-10-22 ユーザー判断：前半に外れても、合わせ続ければ取り戻せる）
    paceRpm: 2,             // 回転の色（遅い＝青・合う＝緑・速い＝橙）：ゆるさにこれを足したずれまでは「合う」（回転数の表示は細かく揺れるので）
    winLine: 0.9,           // 3つの合致率の平均がこれ以上なら倒す
    crit: 0.95,             // 会心（金の星）：ドラムの合致率がこれ以上（2026-10-21 ユーザー判断：99%は狙って出せない。真面目に漕いで95%がよい）
    critMul: 3,             // 会心のダメージ：基礎点のこの倍
    gold3Mul: 5,            // 金の星3つ（並んだドラム3つとも会心）の3つ目＝特別な攻撃のダメージ：基礎点のこの倍（2026-10-28 ユーザー判断）
    graceSec: 5,            // ドラムの最初のこの秒は判定しない（回転数を合わせ直し、負荷が変わるまでの遅れ）
    countSec: 3,            // 判定が始まる前の 3・2・1 の合図（秒。判定しない最初の5秒の中。2026-10-24 ユーザー判断）
    powerSlack: 0.85,       // パワーが目標のこの割合より低いと、合致を下げる（ERG の追従の遅れのぶん）
    powerGraceSec: 3,       // ドラムの中で強弱が変わった直後のこの秒は、パワーを見ない
    // 間合いのある戦い（2026-10-22 ユーザー判断）：ドラムが回っている間、主人公と敵が交互に（主人公から）、everySec ごとに近づいて通常攻撃する（見せるだけ）。
    // 合致率が倒す線以上なら、主人公の攻撃は当たり、敵の攻撃は主人公が弾き返す。届かなければ、主人公の攻撃は弾かれ、敵の攻撃は当たる。
    // ドラムの始まりは、3・2・1 が終わって判定が始まる時（graceSec）から（2026-10-29 試走 No.16 ユーザー判断。前は 2.5 秒から）
    duel: { everySec: 3 },
    // ペダルからパワーが伝わっている間（パワー > 0）の最低の速さ（km/h）。急な坂でも 0 にしない（2026-10-25 ユーザー判断。表示も距離・FIT も同じ値）
    minKmh: 1,
    // ERG のスパイラル対策（ergguard.js）：回転が lowRpm を下回って lowSec 続いたら負荷を抜き、戻ったら少しずつ目標へ。
    // softRpm を下回ったら、目標 × 回転数 / softRpm に下げる（落ちている間は、leadSec でならした回転より下がったぶん＝最大 leadMax rpm、先に下げる）
    // stopRpm・stopSec：足が止まったら（30 rpm 未満が2秒）負荷を 0 に。こぎ出したら restartSec（2秒）で戻す（2026-10-26 ユーザー判断）
    // resumeRpm：抜いた負荷を戻す回転数。前は 60 で、急な坂で 55〜59 rpm で回し続けると抜いたまま戻らなかった（2026-10-25 試走：回復の 100 W が 40 W に張りついた）。
    // 55 rpm 以上を2秒続ければ戻す（60 rpm 未満のぶんは、回転に合わせて下げる決まりで軽くなる）
    ergGuard: { stopRpm: 30, stopSec: 2, restartSec: 2, lowRpm: 50, lowSec: 3, resumeRpm: 55, resumeSec: 2, cutFrac: 0.4, recoverSec: 5, softRpm: 60, leadSec: 1, leadMax: 8 },
  };

  // 必殺技の名前（2026-10-22 ユーザー要望。ほかのゲームの技名をまねしない、火の島にちなんだオリジナル。ユーザーに確認する案）。
  // ドラムが倒す線以上で止まったら skill、会心なら crit、金の星3つの特別な攻撃なら gold3 を叫ぶ（gold3 は 2026-10-29 試走 No.4 ユーザー判断：前は会心と同じ名前だった）。fx は演出の種類（battle-view.js・style.css）
  const SKILLS = {
    warrior: { fx: 'slash',  skill: '潮風斬り',   crit: '火の山両断', gold3: '三ツ星両断' },
    wizard:  { fx: 'fire',   skill: '溶岩の矢',   crit: '火口の嵐', gold3: '星降る火口' },
    monk:    { fx: 'fists',  skill: '潮騒連打',   crit: '大噴火連打', gold3: '黄金の千波連打' },
    priest:  { fx: 'hammer', skill: '灯台の槌',   crit: '夜明けの大槌', gold3: '黄金の日輪槌' },
    valkyrie: { fx: 'slash', skill: '岬風の突き', crit: '天翔ける火柱', gold3: '金翼の神槍' },   // 2026-10-27 案（演出は戦士の剣の閃きを借りる）
    elf:     { fx: 'fire',   skill: '火の粉の矢', crit: '流星の矢雨', gold3: '黄金の彗星矢' },     // 2026-10-27 案（演出は魔法使いの炎を借りる）
    samurai: { fx: 'slash',  skill: '波切り',     crit: '火の島一文字', gold3: '金波一閃' },   // 2026-10-27 案（刀で踏み込んで斬る。演出は戦士の剣の閃きを借りる）
    mercenary: { fx: 'slash', skill: '岩砕き',    crit: '大地割り', gold3: '黄金の山崩し' },       // 2026-10-27 案（大剣を両手で振る。演出は戦士の剣の閃きを借りる）
  };

  const api = { WORLD, BATTLE, STARS, ATTR, PLANS, PHASES, LEVELS, MAX_LEVEL, dayOf, ITEMS, itemsOf, reelFrac, ERG_REST, DIFFICULTY, HEROES, HERO_ORDER, ENEMIES, AREAS, MOBS, SMALL, ELITES, KIND, TUNE, SKILLS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).data = api;
})(typeof window !== 'undefined' ? window : globalThis);
