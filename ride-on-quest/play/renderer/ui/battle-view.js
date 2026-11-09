/* スロット戦闘の画面。RQ.views.battle(screen, setup, opts) で作り、返り値の tick(dt) を時計から呼ぶ。
   横から見る形（2026-10-22 ユーザー判断。前は敵を正面から見る形）：ドラムの上で、左に右向きの主人公、右に左向きの敵が向かい合う。
   間合いのある戦い（2026-10-22 ユーザー判断。前はつばぜり合い）：主人公と敵は離れて立つ。ドラムが回っている間は、主人公と敵が交互に
   近づいて通常攻撃する（battle.js の attack。見せるだけで、判定には効かない）。合致率が90%以上なら、主人公の攻撃は当たり（敵が震える）、
   敵の攻撃は主人公が弾き返す（火花・敵がのけぞって戻る）。届かなければ、主人公の攻撃は弾かれ（火花・主人公がのけぞって戻る）、敵の攻撃は当たる（主人公がよろける）。
   ドラムが止まると、90%以上なら主人公が必殺技の名前を叫び、職業ごとの演出（戦士＝剣の閃き、魔法使い＝炎、武闘家＝連打の拳、僧侶＝光の槌。
   名前は data.js の SKILLS）。95%以上の会心は上位の技の名前で、演出が大きく金色になる。90%未満なら敵の反撃で主人公がよろける（受けた数字は出すが、HP は持たない）。
   主人公の戦闘ポーズの絵（RQ.sprites.get(id, 'battle', 0〜3)＝構え・踏み込み・振り抜き・よろけ）が manifest にあれば使い、無ければ右向きの立ち・歩き。
   小さな雑魚3体は右に並び、今のドラムの相手が前に出る。その下に枠のない大きな文字、下いっぱいにスロットのドラム3つ。走行中に読めるよう、説明は出さない。
   ドラムは合致率の数字（2026-10-20 ユーザー判断）：十の位はそのドラムの合致率（判定と同じ値。battle.js の matchNow）。一の位は、90%以上ならその値が回り
   （2026-10-21）、届かなければ数字が流れ続ける。時間が来たら本当の値で止まる。最初の数秒は判定しないので「--」。
   会心（95%以上）は紋章が回り続ける。
   ドラムが止まるたびにダメージを与え、合致率が倒す線を超えたドラムには星（会心なら金の星）が付く。
   ウェーブ（連戦）は間を空けずに続く。敵が1体ならドラム3つで、小さな雑魚3体なら1つずつで攻める。
   倒せなかった敵は、最後に攻撃してきて逃げていく。
   setup：{ heroId, waves, kind, tolBonus, buffs, bg }。opts.onEnd({ sec, defeated, dealt, taken, stars }) は終わったあと。
   opts.endButtons：終わったあとに出すボタン [[文字, 押したとき]]。無ければ数秒で自動的に onEnd。 */
(function (root) {
  const D = root.RQ.data, BT = root.RQ.battle, TR = root.RQ.trainer, S = TR.state, U = root.RQ.ui, t = root.RQ.i18n.t;
  const UNIT = 1.25, UNIT_SMALL = 0.75, HERO_UNIT = 1.15;   // 絵の1ドットの高さ（画面の高さの %）。敵が3体並ぶときは小さく。主人公は右向き
  const SPIN = { wait: 6, ok: 3, ng: 14 };     // 一の位の回る速さ（数字/秒）：待っている、合っている、外れている
  const NEXT_MS = 2200;                        // ダメージを見せてから、次のドラムの「まわせ！」を出すまで
  // 必殺技の前の「ため」（2026-10-23 ユーザー指摘：必殺技が普通の攻撃に見える）。ドラムが止まってから、この ms のあいだ主人公が構えて止まり、
  // 足もとから職業の色の光が集まり、体が光って小さく震え、画面が少し暗くなる。そのあと技の名前を叫んで踏み込む。会心は長めで金色。
  // 見せるだけ（戦闘とドラムの時間は進み続ける）。効果音（audio/sfx.js）もこの長さだけ当たりを遅らせる
  const CHARGE_MS = 1000, CHARGE_CRIT_MS = 1400, GOLD3_MS = 1900;   // GOLD3_MS：金の星3つの特別な攻撃のため（2026-10-27）
  const CHARGE_COLOR = { slash: '#8fd8ff', fire: '#ff8a30', fists: '#ffc040', hammer: '#fff3b0' };

  function battleView(screen, setup, opts = {}) {
    const b = BT.createBattle({ ...setup, ftp: U.ftp(), difficulty: U.difficulty() });
    root.__rq.battle = b;   // テスト用
    const name = i => b.foes[i].def.n;
    U.setBg('islandMap');   // 旅では 3D の島に隠れる。3D の無い「1戦だけ」（テスト用）では島の地図（2026-10-23：トリスケリオンの戦闘の背景をやめた）
    // 一の位の帯：0〜9 と、つなぎ目の 0。位置 p（数字いくつぶん下がったか）で上下に動かす
    const ones = [...'01234567890'].map(d => `<span>${d}</span>`).join('');
    screen.innerHTML = `
      <div class="battle side">
        <div class="arena"><div class="hero-side"><img alt=""></div><div class="foes"></div><div class="skill-name"></div><div class="win boss-say" hidden></div></div>
        <div class="dim"></div><div class="flash"></div>
        <div class="say win"></div>
        <div class="slots">${[0, 1, 2].map(i => `<div class="reel" id="reel${i}">
          <i class="pace"></i><div class="num"><span class="d10">-</span><span class="d1"><span class="strip">${ones}</span><span class="same"><span>0</span><span>0</span></span><span class="dash">-</span></span><small>%</small></div>
          <img class="crit" alt="" src="${U.ICON.e}">
          <b class="left"></b><i class="star">★</i></div>`).join('')}</div>
      </div>`;
    const q = s => screen.querySelector(s);
    // 一の位の窓を、数字の高さだけに切る（帯は1字1em だが、数字はその7割ほど。窓が1em だと、回る途中の上下の数字が十の位の上下にはみ出して見える）。
    // 数字の上下の位置は文字の種類（OS）で変わるので、その場で測る
    (function fitOnes() {
      const n = q('.reel .num'); if (!n) return;
      const cs = getComputedStyle(n), g = document.createElement('canvas').getContext('2d');
      g.font = `${cs.fontStyle} ${cs.fontWeight} 100px ${cs.fontFamily}`;
      let up = 0, dn = 0; for (const c of '0123456789') { const m = g.measureText(c); up = Math.max(up, m.actualBoundingBoxAscent); dn = Math.max(dn, m.actualBoundingBoxDescent); }
      const m0 = g.measureText('0'), base = (100 - m0.fontBoundingBoxAscent - m0.fontBoundingBoxDescent) / 2 + m0.fontBoundingBoxAscent;   // 1行（line-height 1）の上から基準線まで
      if (!up || !m0.fontBoundingBoxAscent) return;
      const top = Math.max(0, (base - up) / 100 - 0.03), bot = Math.max(0, 1 - (base + dn) / 100 - 0.03);
      screen.querySelectorAll('.d1').forEach(d => { d.style.clipPath = `inset(${top.toFixed(3)}em 0 ${bot.toFixed(3)}em 0)`; });
    })();
    const line = q('.say'), foesBox = q('.foes'), arena = q('.arena'), heroBox = q('.hero-side'), heroImg = q('.hero-side img');
    // 主人公のポーズ：ready（構え）・step（踏み込み）・swing（振り抜き）・hurt（よろけ）。戦闘ポーズの絵が無ければ、右向きの立ち（0）と歩き（1）
    const heroArt = root.RQ.heroArt && root.RQ.heroArt[setup.heroId], hasBattle = !!(heroArt && heroArt.battle);
    const POSE = hasBattle ? { ready: ['battle', 0], step: ['battle', 1], swing: ['battle', 2], hurt: ['battle', 3] } : { ready: ['side', 0], step: ['side', 1], swing: ['side', 1], hurt: ['side', 0] };
    // 守り（敵の攻撃を弾き返す）：防御のコマ（heroArt の guard。2026-10-25 窓口：あとで Gemini で描く）があればそれ、無ければ構え
    POSE.guard = heroArt && heroArt.guard ? ['guard', 0] : POSE.ready;
    let heroPose = '';
    const setHero = k => { if (k !== heroPose) { heroPose = k; U.setSprite(heroImg, setup.heroId, POSE[k][0], POSE[k][1], HERO_UNIT); } };
    setHero('ready');
    Object.values(POSE).forEach(([v, f]) => { const u = RQ.sprites.get(setup.heroId, v, f).url; if (u) new Image().src = u; });   // ほかのコマの絵も先に読んでおく（初めて出すコマで、絵が届くまで前のコマのまま見えて、射る・突きのコマが抜けた。2026-10-27）
    const skill = D.SKILLS[setup.heroId] || D.SKILLS.warrior;
    let busyUntil = 0;   // 必殺技・反撃を見せている間は、通常攻撃を出さない（ms）
    let foeEls = [];   // 今のウェーブの敵（b.foes の番号 → 要素）
    // revealAt：敵が黒い影から色づいて現れるまでの ms（エンカウントの演出の間は影のまま。雑魚3体は少しずつずらす）
    function showWave(w, revealAt = 0, K = 1) {
      foesBox.innerHTML = ''; foeEls = [];
      const ids = b.waves[w].foes, small = ids.length === 3;
      foesBox.className = 'foes' + (small ? ' trio' : '');
      const base = b.foes.findIndex(f => f.wave === w);
      ids.forEach((id, k) => {
        const el = U.el('div', 'foe shadow'), img = U.el('img'); img.alt = ''; el.appendChild(img); foesBox.appendChild(el);
        el.dataset.id = id;   // 飛び道具（D.ENEMIES の shot）を引くため
        U.setSprite(img, id, 'left', 0, small ? UNIT_SMALL : UNIT);   // 左向き（絵が届くまでは正面の絵）
        foeEls[base + k] = el;
        later(() => { el.classList.remove('shadow'); el.classList.add('reveal'); }, revealAt + k * 160 * K);
        // 色づき終わったら印を外す（2026-10-26：付けたままだと、震える動きが終わるたびに色づく動きが最初からやり直され、敵が一瞬黒い影に戻っていた。本気の赤い光も効かなかった）
        later(() => { el.classList.remove('reveal'); if (!FLASHES.some(c => el.classList.contains(c))) kick(el); }, revealAt + k * 160 * K + 600 * K);
      });
      for (let i = 0; i < 3; i++) { const r = q('#reel' + i); r.className = 'reel'; }
      done.fill(null);
    }
    let stopType = null;
    // 鬼王のセリフ（2026-10-25 ユーザー要望）：鬼王の上の吹き出しに1字ずつ。ms たったら消す。どれを使うかはキャラクターのレベルで順に替える（setup.lv）
    const bossLine = (kind, n) => t(`boss.${kind}${((setup.lv || 1) - 1) % n + 1}`);
    const bossDur = (text, least) => Math.max(least, [...text].length * 34 + 1600);   // 出しておく長さ（ms）：打ち終わって、読める間（英語は長い）
    let bossStop = null;
    function bossSay(text, ms) {
      const w = q('.boss-say'); if (!w) return;
      if (bossStop) bossStop();
      w.hidden = false; bossStop = U.typeText(w, t('boss.say', { who: D.WORLD.boss, text }), 30);
      later(() => { w.hidden = true; }, bossDur(text, ms));
    }
    // 「○○RPMで まわせ！」を出したら、そのドラムが止まるまで、ほかの文字で窓を上書きしない（2026-10-29 試走 No.16 ユーザー判断：メッセージのせいで回転数が見えなかった）
    let goShown = false;
    const say = (text, cls = '') => { if (goShown && cls !== 'go') return; if (stopType) stopType(); line.className = 'say win ' + cls; stopType = U.typeText(line, text, 30); };
    const waveName = w => { const ids = b.waves[w].foes; return ids.length === 3 ? (new Set(ids).size === 1 ? t('bt.pack', { foe: D.ENEMIES[ids[0]].n }) : t('bt.monsters')) : D.ENEMIES[ids[0]].n; };

    let sec = 0, endT = null, ended = false, waveWait = 0;
    // 3・2・1 の前に終わっていてほしい演出の終わり（Date.now の ms）：前のドラムの必殺技・反撃（fxEnd）と、次のウェーブの敵が出るの（waveAt）。
    // 次のドラムの「3」（ドラムの始めから2秒）より遅ければ、3・2・1 と判定の始まりをそのぶん遅らせる（battle.js の delayCount。2026-10-29 試走 No.16 A案）
    let fxEnd = 0, waveAt = 0, goText = '';
    const COUNT3_MS = (D.TUNE.graceSec - D.TUNE.countSec) * 1000;   // ドラムの始めから「3」まで
    // 技ごとの動き（skillMove）の長さ（ms）
    const moveMs = crit => {
      const K = skill.fx;
      if (samurai && crit) return 1500;
      if (K === 'fists') return crit ? 200 + 12 * 60 + 650 : 200 + 6 * 95 + 400;
      if (K === 'hammer') return crit ? 1400 : 1100;
      if (K === 'slash') return crit ? 1300 : 900;
      return crit ? 1500 : 1000;   // 魔法使い・エルフ
    };
    let fxUntil = 0;   // 必殺技の「ため」が終わる時刻（Date.now の ms）。倒れて消える・勝ちの言葉・場面の切り替えをそのぶん遅らせる
    const fxLeft = () => Math.max(0, fxUntil - Date.now());
    const pos = [0, 3.3, 6.6], done = [null, null, null], roll = [0, 0, 0];   // roll：90%以上のとき、同じ数字の帯の流れ（0〜1）   // ドラムごとの一の位の位置（ずらして始める）と、止まった合致率
    // 演出は少し遅れて動くので、そのときにはもう次の画面になっていることがある
    const alive = () => screen.contains(foesBox);
    const later = (fn, ms) => setTimeout(() => { if (alive()) fn(); }, ms);
    // 光らせる・震わせる印を付け、ms たったら外す。外したら、中の絵の動きを一度やり直す（kick）
    // （2026-11-08 試走 指摘 12：iPhone の Bluefy〔WebKit〕で、光った敵が白・灰色のまましばらく戻らなかった。印を外して動きが
    //   ふだんの揺れ〔foe-idle〕に戻っても、WebKit が光の filter を描いたまま残すことがあるため。動きを none にして読み直させると、描き直される）
    const FLASHES = ['struck', 'struck-big', 'struck-crit', 'hit', 'hit-s', 'hurt-s', 'stagger', 'charging', 'reveal', 'vanish', 'shadow'];   // 絵の色を変える印（残っていれば、やり直さない）
    const kick = node => { for (const img of node.querySelectorAll ? node.querySelectorAll('img') : []) { img.style.animation = 'none'; void img.offsetWidth; img.style.animation = ''; } };
    const flash = (node, cls, ms) => {
      node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
      const tok = (node._flashTok = (node._flashTok || 0) + 1);
      // 画面が変わっていても（alive でなくても）印は必ず外す
      setTimeout(() => { node.classList.remove(cls); if (node._flashTok === tok && !FLASHES.some(c => node.classList.contains(c))) kick(node); }, ms);
    };
    // 敵へのダメージは、敵の真上に出す（2026-10-29 試走 No.15 ユーザー判断：牙イノシシで右に出てケイデンスの文字に重なった。
    // 敵の絵（img）は、震える・のけぞる・金の星3つで吹き飛ぶ動きで右へずれる。その途中の位置で出していたので、動かない敵の箱（.foe）の上で決める）。
    // 主人公が受けた数字は、今までどおり体の上の方
    function bounceDmg(target, n, big, hurt, small = false) {   // small：通常攻撃の打ち合いの小さな数字
      const foe = target.closest('.foe'), r = (foe || target).getBoundingClientRect(), sr = screen.getBoundingClientRect();
      const d = U.el('div', 'dmg-bounce' + (big ? ' crit' : '') + (hurt ? ' hurt' : '') + (small ? ' small' : '')); d.textContent = n;
      d.style.left = `${r.left - sr.left + r.width / 2}px`;
      d.style.top = foe ? `${Math.max(sr.height * 0.14, r.top - sr.top)}px` : `${r.top - sr.top + r.height * 0.45}px`;   // 敵：数字の下を頭の上に（画面の上に切れないよう、上から 14% より下）
      screen.appendChild(d); later(() => d.remove(), 1800);
    }
    const result = () => ({ sec, defeated: b.defeated, wins: b.wins, fled: b.fled, dealt: b.dealt, taken: b.taken, stars: b.stars, crits: b.crits || 0, drums: Math.min(b.reel, b.drums.length), skipped: !!b.skipped });   // crits・drums：勲章（会心の数・回したドラムの数）
    const finish = () => { if (ended) return; ended = true; opts.onEnd && opts.onEnd(result()); };
    const pct = m => Math.min(99, Math.floor(m * 100));

    // 近づいて攻撃して戻る（CSS の atk。--gap は相手までの距離 px）。who：'hero' | 'foe'。big：必殺技・反撃（大きく踏み込む）
    function frontFoe(i) { return foeEls[i] || foeEls.find(Boolean); }
    function gapTo(fe) {
      const h = heroImg.getBoundingClientRect(), f = fe.querySelector('img').getBoundingClientRect();
      return Math.max(0, f.left - h.right + Math.min(h.width, f.width) * 0.25);
    }
    // 魔法使い（2026-10-22 ユーザー要望「魔法使いはあんまり前に出ないで、火の玉が相手に飛んでいく」）：少しだけ前に出て杖を振り、
    // 火の玉が敵へ飛んでいく。size：火の玉の大きさ（cqh）、burst：敵の前ではじけて散る（弾かれる）。届く時刻は近づいて当てる職業と同じ（効果音に合わせる）
    // エルフ（2026-10-27 ユーザー指示「魔法使いのような動きで攻撃する。敵の方まで大きく進まず、矢を打って攻撃」）：魔法使いと同じく少しだけ前に出て、
    // 引き絞り（step）→ 射る（swing）。火の玉の代わりに矢が飛ぶ（arrowShot）。技の演出・守りの光は、今の技（fx）のまま
    const archer = setup.heroId === 'elf';
    const caster = skill.fx === 'fire' || archer;
    // 矢：細い柄・銀の矢じり・羽根の小さな絵（CSS の .arrow-shot）。from・to：[x, y]（arena の中の px）。向きは飛ぶ向き
    function arrowShot(from, to, launch, flight, gold, onHit, ease = 'linear', k = 1) {   // k：大きさ（敵の矢は少し大きく）
      later(() => {
        const cq = arena.getBoundingClientRect().height / 52, a = U.el('div', 'arrow-shot' + (gold === 'foe' ? ' foe-arrow' : gold ? ' gold' : '')), ang = Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI;
        a.style.width = `${7 * k * cq}px`; a.style.height = `${0.9 * k * cq}px`; a.style.left = `${from[0]}px`; a.style.top = `${from[1]}px`; arena.appendChild(a);
        a.animate([{ transform: `translate(-100%, -50%) rotate(${ang}deg)` }, { transform: `translate(calc(-100% + ${to[0] - from[0]}px), calc(-50% + ${to[1] - from[1]}px)) rotate(${ang}deg)` }], { duration: flight, easing: ease, fill: 'forwards' });
        later(() => { a.remove(); onHit(); }, flight);
      }, launch);
    }
    const bowAt = () => { const box = arena.getBoundingClientRect(), h = heroImg.getBoundingClientRect(); return [h.right - box.left - h.width * 0.1, h.top - box.top + h.height * 0.38]; };   // 弓の高さ（引き絞るコマの矢の位置）
    const foeAt = (fe, kx = 0.35, ky = 0.5) => { const box = arena.getBoundingClientRect(), f = fe.querySelector('img').getBoundingClientRect(); return [f.left - box.left + f.width * kx, f.top - box.top + f.height * ky]; };
    // 敵の飛び道具（2026-10-28 ユーザー判断：飛び道具を持つ敵は前に出ず、その場から飛ばす。どの敵かは data.js の ENEMIES の shot）。
    // (敵の要素, 放つ ms, 飛ぶ ms, 弾き返される＝主人公の手前で止まる, 当たった時)。新しい飛び道具は、ここに1つ足す
    const foeHand = fe => { const box = arena.getBoundingClientRect(), f = fe.querySelector('img').getBoundingClientRect(); return [f.left - box.left + f.width * 0.18, f.top - box.top + f.height * 0.36]; };
    const heroAt = blocked => { const box = arena.getBoundingClientRect(), h = heroImg.getBoundingClientRect(); return [h.left - box.left + h.width * (blocked ? 1.05 : 0.6), h.top - box.top + h.height * 0.45]; };
    // 矢のほかは、形と色を CSS（.foe-shot.shot-<種類>）で描き、ここでは大きさ（cqh）・回り（度）・山なり（距離の割合）・大きさの変わり・動きの緩急を決める
    const SHOT_LOOK = {
      stone: { w: 6, h: 5.2, spin: 900, arc: 0.15, grow: [1, 1], ease: 'linear' },        // 石つぶて（小鬼）：灰色の石が回りながら山なりに
      fire: { w: 10, h: 10, spin: 0, arc: 0, grow: [0.5, 1], ease: 'ease-in' },           // 火の玉（鬼火）：赤い火の玉
      flame: { w: 15, h: 6.4, spin: 0, arc: 0, grow: [0.35, 1.15], ease: 'ease-out' },       // 炎（火の粉ガエル）：口から吹く、黄色い炎の舌
      ash: { w: 10, h: 8.4, spin: 140, arc: -0.04, grow: [0.4, 1.45], ease: 'ease-out' },   // 灰のけむり（けむり玉）：ふくらみながら漂う灰色の煙
      hex: { w: 9.5, h: 9.5, spin: 540, arc: 0.06, grow: [0.6, 1.1], ease: 'ease-in' },          // 妖術の光（青鬼）：紫の光の玉と輪
    };
    function orbShot(kind, fe, launch, flight, blocked, onHit) {
      const L = SHOT_LOOK[kind];
      later(() => {
        const [x0, y0] = foeHand(fe), [x1, y1] = heroAt(blocked), cq = arena.getBoundingClientRect().height / 52, o = U.el('div', `foe-shot shot-${kind}`);
        const dx = x1 - x0, dy = y1 - y0, ang = Math.atan2(dy, dx) * 180 / Math.PI, up = Math.hypot(dx, dy) * L.arc, turn = kind === 'flame' ? ang : 0;   // 炎は飛ぶ向きに向ける（絵は右が先）
        o.style.width = `${L.w * cq}px`; o.style.height = `${L.h * cq}px`; o.style.left = `${x0}px`; o.style.top = `${y0}px`; arena.appendChild(o);
        const k = (t, x, y, r, sc) => ({ offset: t, transform: `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) rotate(${(turn + r).toFixed(0)}deg) scale(${sc.toFixed(2)})` });
        o.animate([k(0, 0, 0, 0, L.grow[0]), k(0.5, dx / 2, dy / 2 - up, L.spin / 2, (L.grow[0] + L.grow[1]) / 2), k(1, dx, dy, L.spin, L.grow[1])], { duration: flight, easing: L.ease, fill: 'forwards' });
        later(() => {
          o.remove();
          const pop = U.el('div', `shot-pop shot-${kind}`); pop.style.left = `${x1}px`; pop.style.top = `${y1}px`; pop.style.width = pop.style.height = `${L.h * 1.6 * cq}px`;   // 当たった所で、その色で小さくはじける
          arena.appendChild(pop); later(() => pop.remove(), 450);
          onHit();
        }, flight);
      }, launch);
    }
    const FOE_SHOT = {
      arrow: (fe, launch, flight, blocked, onHit) => arrowShot(foeHand(fe), heroAt(blocked), launch, flight, 'foe', onHit, 'linear', 2),
      ...Object.fromEntries(Object.keys(SHOT_LOOK).map(kind => [kind, (fe, launch, flight, blocked, onHit) => orbShot(kind, fe, launch, flight, blocked, onHit)])),
    };
    function fireball(fe, launch, flight, size, gold, burst, onHit, fx = false) {   // fx：必殺技の中から（コマは技の動きが決める）
      if (archer) {   // エルフ：火の玉の代わりに矢。弾かれる（burst）ときは敵の手前で止まり、火花
        later(() => { setHero('swing'); arrowShot(bowAt(), foeAt(fe, burst ? 0.02 : 0.35), 0, flight, gold || size > 10, () => { if (burst) clang(); onHit(); if (!fx) later(() => setHero('ready'), 250); }); }, launch);   // 矢が離れる時は、射るコマ（矢が飛ぶ間そのまま）
        return;
      }
      later(() => {
        const box = arena.getBoundingClientRect(), h = heroImg.getBoundingClientRect(), f = fe.querySelector('img').getBoundingClientRect(), cq = box.height / 52;
        const x0 = h.right - box.left - h.width * 0.15, y0 = h.top - box.top + h.height * 0.4, x1 = f.left - box.left + f.width * (burst ? 0.02 : 0.35), y1 = f.top - box.top + f.height * 0.5;
        const ball = U.el('div', 'fireball' + (gold ? ' gold' : '')); ball.style.width = ball.style.height = `${size * cq}px`;
        ball.style.left = `${x0}px`; ball.style.top = `${y0}px`; arena.appendChild(ball);
        ball.animate([{ transform: 'translate(-50%, -50%) scale(.4)' }, { transform: `translate(calc(-50% + ${x1 - x0}px), calc(-50% + ${y1 - y0}px)) scale(1)` }], { duration: flight, easing: 'ease-in', fill: 'forwards' });
        later(() => {
          ball.remove();
          if (burst) {   // 敵の前で、はじけて散る
            const b = U.el('div', 'fire-burst'); b.style.left = `${x1}px`; b.style.top = `${y1}px`;
            for (let k = 0; k < 6; k++) { const i = U.el('i'); i.style.setProperty('--a', `${k * 60 + 15}deg`); b.appendChild(i); }
            arena.appendChild(b); later(() => b.remove(), 700);
          }
          onHit();
        }, flight);
      }, launch);
    }
    // bounce：弾かれる（当たった所から、のけぞって戻る）
    function charge(who, fe, ms, onHit, bounce) {
      if (!fe) return;
      if (who === 'hero' && caster) {   // 魔法使い：少し前に出て、火の玉を飛ばす（のけぞらない）
        heroBox.style.setProperty('--gap', `${Math.min(gapTo(fe), heroImg.getBoundingClientRect().height * 0.12)}px`); heroBox.style.setProperty('--atk-ms', `${ms}ms`);
        heroBox.classList.remove('bounce'); flash(heroBox, 'atk', ms);
        setHero('step'); if (!archer) { later(() => setHero('swing'), ms * 0.15); later(() => setHero('ready'), ms * 0.6); }   // エルフ：引き絞り → 射る（矢が離れる時）→ 構え（矢が当たったあと）。順は fireball の中で決める（時刻で決めると、描くのが遅い機械で順が入れ替わり、構えのまま矢が飛んだ）
        const big = ms > 1000;
        fireball(fe, ms * 0.17, ms * 0.24, big ? 12 : 5.5, big && bounce === 'gold', bounce === true, onHit);
        return;
      }
      const shot = who === 'foe' && FOE_SHOT[(D.ENEMIES[fe.dataset.id] || {}).shot];
      if (shot) {   // 飛び道具を持つ敵：前に出ず、少しだけ身を乗り出して、その場から飛ばす（弾き返すときは主人公の手前で止まる）
        fe.style.setProperty('--gap', `${-Math.min(gapTo(fe), fe.querySelector('img').getBoundingClientRect().height * 0.08)}px`); fe.style.setProperty('--atk-ms', `${ms}ms`);
        fe.classList.remove('bounce'); flash(fe, 'atk', ms);
        shot(fe, ms * 0.1, ms * 0.3, bounce === true, () => { if (bounce === true) clang(heroAt(true)); onHit(); });
        return;
      }
      const g = gapTo(fe), el = who === 'hero' ? heroBox : fe;
      el.style.setProperty('--gap', `${who === 'hero' ? g : -g}px`); el.style.setProperty('--atk-ms', `${ms}ms`);
      el.classList.toggle('bounce', !!bounce); flash(el, 'atk', ms);
      if (who === 'hero') { setHero('step'); later(() => setHero('swing'), ms * 0.35); later(() => setHero('ready'), ms * 0.75); }
      later(onHit, ms * 0.4);
    }
    // 弾いたときの火花（金属が当たったような、白と青の光）。主人公と敵の間（ぶつかった所）に
    function clang(at = null) {   // at：[x, y]（arena の中の px）。敵の飛び道具を弾いたときは、止まった所に
      const box = arena.getBoundingClientRect(), h = heroImg.getBoundingClientRect(), fe = frontFoe(BT.current(b).foe), f = fe && fe.querySelector('img').getBoundingClientRect();
      if (!f) return;
      const c = U.el('div', 'clang'); c.textContent = '✦';
      c.style.left = `${at ? at[0] : (Math.min(h.right, f.left) + Math.max(h.right, f.left)) / 2 - box.left}px`; c.style.top = `${at ? at[1] : h.top + h.height * 0.45 - box.top}px`;
      arena.appendChild(c); later(() => c.remove(), 800);
    }
    // 通常攻撃（e.result：hit＝当たる、parried＝弾かれる）
    // 武闘家の打撃（2026-10-22 ユーザー要望：魔法陣ではなく、拳が当たる所に）：敵の体の、拳の高さに、衝撃の輪と飛び散る火花。
    // n：当たりの数（連打は何発か、少しずつ場所をずらして）、big：大きく（必殺技）、gold：会心
    const striker = skill.fx === 'fists';
    function punchFx(fe, { n = 1, big = false, gold = false, every = 110 } = {}) {
      const box = arena.getBoundingClientRect(), f = fe.querySelector('img').getBoundingClientRect(), h = heroImg.getBoundingClientRect();
      const y0 = Math.max(f.top + f.height * 0.3, Math.min(f.top + f.height * 0.6, h.top + h.height * 0.42)) - box.top;   // 拳の高さ（主人公の胸のあたり）。小さな敵には、その体の中に収める
      for (let k = 0; k < n; k++) later(() => {
        const p = U.el('div', 'punch' + (big ? ' big' : '') + (gold ? ' gold' : ''));
        const dx = n > 1 ? ((k * 37) % 5 - 2) * f.width * 0.07 : 0, dy = n > 1 ? ((k * 53) % 5 - 2) * f.height * 0.06 : 0;
        p.style.left = `${f.left - box.left + f.width * 0.4 + dx}px`; p.style.top = `${y0 + dy}px`;
        p.innerHTML = '<b></b>' + '<i></i>'.repeat(6);
        p.querySelectorAll('i').forEach((i, j) => i.style.setProperty('--a', `${j * 60 + k * 17}deg`));
        arena.appendChild(p); later(() => p.remove(), 600);
        if (n > 1) flash(fe, 'struck', 200);
      }, k * every);
    }
    // 通常攻撃の打ち合いの小さなダメージ（2026-10-29 試走 No.18 ユーザー判断：見せるだけ。お互いに少しずつ。主人公が守ったときは 0）。
    // 主人公から：そのドラムの基礎点の1割ほど、敵から：敵の格の攻撃（KIND）の4分の1ほど。数を少しばらつかせる
    const jab = n => Math.max(1, Math.round(n * (0.8 + Math.random() * 0.4)));
    const heroJab = () => jab(BT.basePoint(b, Math.min(b.reel, b.drums.length - 1)) * 0.1), foeJab = () => jab(b.k.dmg / 4);
    function normalAttack(e) {
      if (Date.now() < busyUntil) return;
      const fe = frontFoe(e.foe); if (!fe) return;
      if (e.who === 'hero') {
        if (e.result === 'hit') charge('hero', fe, 900, () => { flash(fe, 'struck', 380); hitFx(fe); bounceDmg(fe.querySelector('img'), heroJab(), false, false, true); });   // 当たる：敵が白く光って震え、少しのけぞる（2026-10-25 ユーザー要望）
        else charge('hero', fe, 900, () => { clang(); setHero('hurt'); later(() => setHero('ready'), 400); }, true);   // 弾かれる：主人公がのけぞって戻る。敵は震えない
      } else if (e.result === 'hit') charge('foe', fe, 900, () => { flash(heroBox, 'hurt-s', 450); setHero('hurt'); later(() => setHero('ready'), 450); bounceDmg(heroImg, foeJab(), false, true, true); });   // 当たる：主人公が震えて少しよろける
      // 弾き返す（2026-10-25 ユーザー要望：攻撃を返しているように見えた）：主人公は構えたまま（防御のコマがあればそれ）、前に守りの光（職業ごと）と火花。敵がのけぞって戻る
      else charge('foe', fe, 900, () => { clang(merc ? guardAt() : null); guardFx(); setHero('guard'); later(() => setHero('ready'), 450); bounceDmg(heroImg, 0, false, true, true); }, true);
    }
    // 必殺技の動き（2026-10-25 ユーザー要望「技ごとに専用の動き」）：今の戦闘の4コマ（構え・踏み込み・突き・よろけ）の並べ方・速さ・位置の動き・残像・画面の揺れで作る。
    // 長さは今の技の演出（踏み込み 1.2 秒）の前後に収める。onHit：当たった時（技の演出・ダメージ）。会心の紋章・星はそのまま重なる
    function afterImg(alpha = 0.5, ms = 260) {   // 残像：今の主人公の絵を、その場に薄く残して消す
      const box = arena.getBoundingClientRect(), r = heroImg.getBoundingClientRect(), c = heroImg.cloneNode();
      c.className = 'after-img pixel'; c.style.left = `${r.left - box.left}px`; c.style.top = `${r.top - box.top}px`; c.style.width = `${r.width}px`; c.style.height = `${r.height}px`;
      arena.appendChild(c); c.animate([{ opacity: alpha }, { opacity: 0 }], { duration: ms, easing: 'linear' }); later(() => c.remove(), ms);
    }
    const quake = (big = false) => { if (U.light() && big) big = false; flash(q('.battle'), big ? 'quake-big' : 'quake', big ? 600 : 400); };   // 「軽い」では強い揺れにしない
    // 位置の動き：keys＝[[時刻 0〜1, x（敵までの距離の割合）, y（主人公の背の高さの割合。上が＋）, 傾き（度）], …]
    function move(keys, ms, g, hh) {
      heroBox.animate(keys.map(([o, x, y = 0, r = 0]) => ({ offset: o, transform: `translate(${(x * g).toFixed(1)}px, ${(-y * hh).toFixed(1)}px) rotate(${r}deg)` })), { duration: ms, easing: 'linear' });
    }
    // 時刻（ms）ごとに：コマ・残像・揺れ・当たり
    const at = (ms, fn) => later(fn, ms);
    // 侍の会心「火の島一文字」（2026-10-28 ユーザー判断。前は跳んで斬り×印）：低く構え → 敵の右側（向こう側）まで、まっすぐ高速で駆け抜け（残像）、
    // 通り抜けた所に横一文字の光（.fx-ichi）。向こうで一瞬止まって振り返り、元の場所へ駆け戻る
    const samurai = setup.heroId === 'samurai';
    function ichimonji(fe, g, hh, onHit) {
      const box = q('.battle').getBoundingClientRect(), h = heroImg.getBoundingClientRect(), f = fe.querySelector('img').getBoundingClientRect();
      const far = Math.min(box.right - h.right, f.right - h.left - h.width * 0.12), ms = 1500;   // 主人公が敵の右の端を越えた所まで（戦闘の画面の外には出ない。arena の右の端では敵に重なって見えなかった）
      const T = (o, x, flip = false) => ({ offset: o, transform: `translateX(${x.toFixed(1)}px)${flip ? ' scaleX(-1)' : ''}` });
      heroBox.animate([T(0, 0), T(0.16, -g * 0.06), T(0.26, far), T(0.5, far), T(0.53, far, true), T(0.8, 0, true), T(0.83, 0), T(1, 0)], { duration: ms, easing: 'linear' });
      setHero('step'); at(240, () => setHero('swing'));
      for (let t = 250; t <= 390; t += 28) at(t, () => afterImg(0.5, 260));
      at(330, () => { onHit(); quake(true); });
      at(760, () => setHero('step')); at(1220, () => setHero('ready'));
    }
    function skillMove(fe, crit, onHit) {
      if (!fe) return;
      const g = gapTo(fe), hh = heroImg.getBoundingClientRect().height, K = skill.fx;
      const trail = (from, to, every = 45) => { for (let t = from; t <= to; t += every) at(t, () => afterImg(0.45, 240)); };
      if (K === 'slash' && !crit) {   // 潮風斬り：素早く踏み込んで斬る。残像
        move([[0, 0], [0.3, 1.02], [0.36, 1.04, 0, 3], [0.62, 1], [1, 0]], 900, g, hh);
        setHero('step'); at(250, () => setHero('swing')); at(680, () => setHero('ready')); trail(40, 280); at(320, onHit);
      } else if (samurai && crit) { ichimonji(fe, g, hh, onHit);   // 火の島一文字：敵の向こうまで駆け抜け、「一」の字
      } else if (K === 'slash') {   // 火の山両断：高く跳んで、落ちながら縦に斬る。着地で画面が揺れる
        move([[0, 0], [0.08, 0.05, -0.04], [0.38, 0.7, 0.55, -6], [0.5, 0.95, 0.45, 4], [0.6, 1.02, 0, 10], [0.78, 1], [1, 0]], 1300, g, hh);
        setHero('step'); at(500, () => setHero('swing')); at(1050, () => setHero('ready')); trail(560, 780, 40); at(780, () => { onHit(); quake(true); });
      } else if (archer && !crit) {   // 火の粉の矢：引き絞って、続けて 3 本放つ（少しずつ高さを変える）。反動で少し下がる
        move([[0, 0], [0.15, 0.08], [0.55, -0.05, 0, -2], [1, 0]], 1000, g, hh);
        setHero('step'); at(200, () => setHero('swing'));
        [[220, 0.45], [330, 0.3], [440, 0.6]].forEach(([t, ky], k) => { at(t - 40, () => setHero(k % 2 ? 'step' : 'swing')); arrowShot(bowAt(), foeAt(fe, 0.4, ky), t, 230, false, k === 0 ? onHit : () => flash(fe, 'struck', 200)); });
        at(760, () => setHero('ready'));
      } else if (archer) {   // 流星の矢雨：空へ 1 本放ち、敵の上から金の矢が雨のように降る。最後に画面が揺れる
        move([[0, 0], [0.12, 0.06, 0, -3], [0.3, -0.02, 0, 2], [1, 0]], 1500, g, hh);
        setHero('step'); at(220, () => setHero('swing'));
        { const p = bowAt(); arrowShot(p, [p[0] + hh * 0.6, p[1] - hh * 1.6], 260, 300, true, () => {}, 'ease-out'); }
        const box = arena.getBoundingClientRect(), f = fe.querySelector('img').getBoundingClientRect();
        for (let k = 0; k < 7; k++) {
          const tx = f.left - box.left + f.width * (0.15 + 0.7 * ((k * 3) % 7) / 6), ty = f.top - box.top + f.height * (0.35 + 0.3 * ((k * 5) % 7) / 6);
          arrowShot([tx - hh * 0.35, ty - hh * 1.4], [tx, ty], 620 + k * 75, 220, true, k === 0 ? onHit : () => flash(fe, 'struck', 200), 'ease-in');
        }
        at(620 + 6 * 75 + 230, () => quake(true));
        at(1250, () => setHero('ready'));
      } else if (K === 'fire' && !crit) {   // 溶岩の矢：杖を突き出して放ち、反動で少し下がる
        move([[0, 0], [0.2, 0.1], [0.3, 0.12], [0.45, -0.06, 0, -4], [0.7, -0.03], [1, 0]], 1000, g, hh);
        setHero('step'); at(180, () => setHero('swing')); at(700, () => setHero('ready'));
        fireball(fe, 230, 260, 9, false, false, onHit);
      } else if (K === 'fire') {   // 火口の嵐：少し浮かび、続けて何度も放つ
        move([[0, 0], [0.15, 0.05, 0.12], [0.85, 0.08, 0.14], [1, 0]], 1500, g, hh);
        setHero('step');
        [220, 380, 540, 700, 860].forEach((t, k) => { at(t - 60, () => setHero(k % 2 ? 'step' : 'swing')); fireball(fe, t, 240, k === 4 ? 13 : 8, true, false, k === 0 ? onHit : () => flash(fe, 'struck', 220)); });
        at(1250, () => setHero('ready'));
      } else if (K === 'fists') {   // 潮騒連打（6発）・大噴火連打（12発、最後に跳び上がる一撃）：踏み込みと突きを素早く交互に。残像。少しずつ前へ
        const n = crit ? 12 : 6, every = crit ? 60 : 95, t0 = 200, end = t0 + n * every, ms = crit ? end + 650 : end + 400;
        const keys = [[0, 0], [t0 / ms, 0.82]];
        for (let i = 1; i <= n; i++) keys.push([(t0 + i * every) / ms, 0.82 + 0.2 * i / n, 0, i % 2 ? 2 : -1]);
        if (crit) keys.push([(end + 180) / ms, 1.05, 0.4, -8], [(end + 320) / ms, 1.08, 0, 6], [(end + 450) / ms, 1.02]);
        keys.push([1, 0]);
        move(keys, ms, g, hh);
        setHero('step');
        for (let i = 0; i < n; i++) at(t0 + i * every, () => { setHero(i % 2 ? 'step' : 'swing'); afterImg(0.4, 200); });
        at(t0 + 20, onHit);
        if (crit) { at(end + 60, () => setHero('step')); at(end + 300, () => { setHero('swing'); quake(true); flash(fe, 'struck-crit', 700); }); }
        at(ms - 250, () => setHero('ready'));
      } else {   // 灯台の槌・夜明けの大槌：振りかぶって振り下ろし、地面が揺れる（会心は跳んで大きく。強い揺れ）
        const ms = crit ? 1400 : 1100, hit = crit ? 760 : 520;
        move(crit ? [[0, 0], [0.1, 0.1, -0.03, -6], [0.42, 0.6, 0.5, -14], [0.54, 0.72, 0.05, 10], [0.58, 0.72, 0, 6], [0.8, 0.7], [1, 0]]
          : [[0, 0], [0.3, 0.55, 0, -12], [0.45, 0.62, 0, 9], [0.52, 0.62, 0, 4], [0.78, 0.6], [1, 0]], ms, g, hh);
        setHero('step'); at(hit - 80, () => setHero('swing')); at(ms - 280, () => setHero('ready'));
        if (crit) trail(hit - 200, hit, 50);
        at(hit, () => { onHit(); quake(crit); });
      }
    }
    // 守りの光（2026-10-25 ユーザー要望）：主人公の前に。戦士＝青い盾、魔法使い＝紫の光の壁、武闘家＝赤い衝撃、僧侶＝金の光の輪
    const GUARD = { slash: 'g-shield', fire: 'g-wall', fists: 'g-burst', hammer: 'g-halo' };
    // 傭兵・侍は盾を持たないので、守りの光（浮かぶ盾）は出さず、弾いた火花を主人公のすぐ前に出す（2026-10-29 試走 No.19 ユーザー判断。侍も同じ日に「盾のエフェクトを無しに」）
    const merc = setup.heroId === 'mercenary' || setup.heroId === 'samurai';
    const guardAt = () => { const box = arena.getBoundingClientRect(), h = heroImg.getBoundingClientRect(); return [h.left - box.left + h.width * 0.85, h.top - box.top + h.height * 0.45]; };   // 火花は構えた刀・剣のあたり（絵の右の端より少し内側）
    function guardFx() {
      if (merc) return;
      const box = arena.getBoundingClientRect(), h = heroImg.getBoundingClientRect();
      const g = U.el('div', 'guard-fx ' + (GUARD[skill.fx] || 'g-shield'));
      g.style.left = `${h.right - box.left - h.width * 0.05}px`; g.style.top = `${h.top - box.top + h.height * 0.48}px`;
      arena.appendChild(g); later(() => g.remove(), 650);
    }
    // 必殺技の演出（職業ごと）：敵の上に、閃き・炎・拳・光の槌。会心は大きく金色
    // 演出は、狙った敵の絵の体のまん中に出す（2026-10-22 ユーザー指摘：足もとに出ていた。敵ごとに絵の大きさが違うので、その絵の箱で決める）。
    // feet：体のまん中から足もとまで（px。僧侶の地面の割れに使う）
    function fxBox(fe, cls) {
      const box = arena.getBoundingClientRect(), r = fe.querySelector('img').getBoundingClientRect();
      const fx = U.el('div', cls);
      fx.style.left = `${r.left - box.left + r.width / 2}px`; fx.style.top = `${r.top - box.top + r.height * 0.5}px`;
      fx.style.setProperty('--feet', `${r.height * 0.5}px`); fx.style.setProperty('--b', `${Math.max(0.45, Math.min(1.3, r.height / (box.height * 0.42)))}`);   // 敵の絵の大きさに合わせる
      return fx;
    }
    // 僧侶の槌（2026-10-22 ユーザー要望：斬る線ではなく、上から叩きつける重い打撃）：頭の上から光の槌が落ち、当たった所に衝撃の輪、足もとの地面が割れ、聖なる光の柱が立つ
    function maceParts(fx) { fx.innerHTML = '<i class="mace"><i class="mace-head"></i><i class="mace-shaft"></i></i><b class="m-ring"></b><b class="m-pillar"></b><b class="m-crack"></b>'; }
    function skillFx(fe, crit) {
      if (striker) { punchFx(fe, { n: crit ? 8 : 5, big: true, gold: crit, every: crit ? 90 : 110 }); return; }   // 武闘家：連打の当たり（会心は数が多く、大きく金色）
      const fx = fxBox(fe, samurai && crit ? 'skill-fx fx-ichi crit' : `skill-fx fx-${skill.fx}${crit ? ' crit' : ''}`);   // 侍の会心は横一文字（×印にしない）
      if (skill.fx === 'hammer') maceParts(fx);
      arena.appendChild(fx); later(() => fx.remove(), 1400);
    }
    // 通常攻撃が当たったとき（職業ごとに小さく）：戦士＝剣の閃き、魔法使い＝火のはじけ、武闘家＝拳の当たり、僧侶＝槌の当たり。敵の体のまん中に
    function hitFx(fe) {
      if (striker) return punchFx(fe);
      const fx = fxBox(fe, `skill-fx mini fx-${skill.fx}`);
      // 僧侶の通常攻撃は、杖で打った所の衝撃の輪だけ（2026-10-24 ユーザー判断：上から降る光の槌・光の柱は必殺技の時だけ）
      if (skill.fx === 'hammer') fx.innerHTML = '<b class="m-ring"></b>';
      arena.appendChild(fx); later(() => fx.remove(), 900);
    }
    // 技の名前：主人公の頭の上に大きく（左の列に寄りすぎないよう、文字の半分の幅より左には出さない）
    function shout(text, crit) {
      const n = q('.skill-name'); n.textContent = text; n.classList.toggle('crit', !!crit);
      const box = arena.getBoundingClientRect(), h = heroImg.getBoundingClientRect();
      n.style.left = '0px'; const half = n.getBoundingClientRect().width / 2;
      n.style.left = `${Math.max(half, h.left + h.width / 2 - box.left)}px`; n.style.bottom = `${box.bottom - h.top + box.height * 0.02}px`;
      flash(n, 'on', 1600);
    }

    // ため：足もとに光の柱と、下から上へ集まる光の粒。体が光って震える。画面が少し暗くなる
    function chargeUp(crit, ms) {
      const box = arena.getBoundingClientRect(), h = heroImg.getBoundingClientRect();
      const au = U.el('div', 'charge-aura' + (crit ? ' gold' : ''));
      au.style.setProperty('--cc', crit ? '#ffd84a' : CHARGE_COLOR[skill.fx] || '#fff');
      au.style.setProperty('--ms', `${ms}ms`);
      au.style.left = `${h.left - box.left + h.width / 2}px`; au.style.top = `${h.top - box.top}px`; au.style.height = `${h.height}px`;   // 主人公の絵と同じ高さの箱。光は足もと（箱の下）から上へ
      au.innerHTML = '<b></b>' + '<i></i>'.repeat(crit ? 14 : 9);
      au.querySelectorAll('i').forEach((p, k) => { p.style.setProperty('--x', `${((k * 37) % 11 - 5) * 0.11 * h.width}px`); p.style.animationDelay = `${(k * 97) % Math.max(1, ms - 400)}ms`; });
      arena.appendChild(au); later(() => au.remove(), ms + 200);
      heroBox.style.setProperty('--cc', crit ? '#ffd84a' : CHARGE_COLOR[skill.fx] || '#fff');
      setHero('ready'); flash(heroBox, 'charging', ms);
      const dim = q('.dim'); dim.style.setProperty('--ms', `${ms}ms`); flash(dim, 'on', ms + 300);
    }

    // 金の星3つの特別な攻撃（2026-10-27 ユーザー判断）。goldGlow：ためている間、画面のふちから金色の光が満ちる。
    // goldBurst：当たった瞬間、敵のところから金色の光が画面いっぱいに広がり（光の筋つき）、強く揺れ、敵が大きく吹き飛ぶ。倒れた敵はそのまま画面の外へ、まだ倒れない敵（鬼王の前半など）は吹き飛んで戻る
    function goldGlow(ms) {
      const g = U.el('div', 'gold-glow'); g.style.setProperty('--ms', `${ms}ms`);
      q('.battle').appendChild(g); later(() => g.remove(), ms + 400);
    }
    function goldBurst(fe, foeIdx) {
      if (!fe) return;
      const bt = q('.battle'), box = bt.getBoundingClientRect(), img = fe.querySelector('img'), r = (img || fe).getBoundingClientRect();
      const g = U.el('div', 'gold-burst'); g.style.setProperty('--x', `${r.left - box.left + r.width / 2}px`); g.style.setProperty('--y', `${r.top - box.top + r.height / 2}px`);
      bt.appendChild(g); later(() => g.remove(), 1700);
      quake(true); later(() => quake(true), 450);
      later(() => flash(q('.flash'), 'gold', 400), 300);
      const f = b.foes[foeIdx], gone = !!(f && f.done && f.defeated), dx = box.right - r.left + r.width, k = U.light() ? 0.6 : 1;
      if (img) img.animate(gone
        ? [{ transform: 'none', opacity: 1, filter: 'brightness(3) sepia(1)' }, { offset: 0.15, transform: `translate(${-r.width * 0.05}px, 0) rotate(-6deg)`, opacity: 1, filter: 'brightness(3) sepia(1)' },
          { transform: `translate(${dx}px, ${-box.height * 0.45}px) rotate(${720 * k}deg) scale(.4)`, opacity: 0, filter: 'brightness(2) sepia(1)' }]
        : [{ transform: 'none', filter: 'brightness(3) sepia(1)' }, { offset: 0.3, transform: `translate(${box.width * 0.18}px, ${-box.height * 0.12}px) rotate(${40 * k}deg)`, filter: 'brightness(2) sepia(1)' },
          { offset: 0.55, transform: `translate(${box.width * 0.2}px, 0) rotate(${20 * k}deg)`, filter: 'none' }, { transform: 'none', filter: 'none' }],
        { duration: gone ? 1100 : 1300, easing: 'cubic-bezier(.2,.7,.3,1)', fill: gone ? 'forwards' : 'none' });
    }

    function onEvents(evs) {
      for (const e of evs) {
        if (e.type === 'wave') {   // 次のウェーブ（連戦）。間を空けずに次の敵が出る
          // 前のウェーブの最後の敵を倒したときは、その敵が倒れて消えてから（foeEnd の out の少しあと）次の敵を出す（2026-10-26 ユーザー指摘：3体目が倒れないまま次の3体が出た）。
          // ドラムの判定しない最初の5秒の中に収まる
          const prevLast = b.foes.filter(f => f.wave === e.wave - 1).pop(), wait = prevLast && prevLast.defeated ? 2900 + fxLeft() : 700;
          later(() => { showWave(e.wave); say(t('bt.next', { foe: waveName(e.wave) })); }, wait);
          waveWait = wait;
          waveAt = Date.now() + wait + 900;   // 敵が出て、名前を読めてから 3・2・1
        } else if (e.type === 'reel') {
          const st = e.steps, text = e.finish ? t('bt.finish', { cad: e.cad }) : st && st.length > 1 ? t('bt.spinSteps', { cad: e.cad, hi: st[0][0], lo: st[1][0] }) : t('bt.spin', { cad: e.cad });
          // 「まわせ」は 3・2・1 の「3」と同時に出す（count の 3）。演出が「3」より長いときは、3・2・1 と判定の始まりを遅らせる
          goText = text;
          { const need = Math.max(fxEnd, waveAt) - Date.now(); if (need > COUNT3_MS) BT.delayCount(b, (need - COUNT3_MS) / 1000); }
          waveWait = 0; waveAt = 0;
          // 1体の敵にドラムが4つ以上あるとき（オーバーアンダーの6区間。2026-10-23）：画面のドラムは3つなので、3つ回したら空にして次の3つ
          if (e.slot > 0 && e.slot % 3 === 0) later(() => { for (let i = 0; i < 3; i++) q('#reel' + i).className = 'reel'; done.fill(null); }, Math.max(NEXT_MS, fxLeft() + 300));
        } else if (e.type === 'rage') {   // 鬼王が本気を出す（2026-10-26 ユーザー判断：前半3本をクリアしたら、後半3本）。赤く光って揺れ、ひとこと
          later(() => {
            bossSay(bossLine('rage', 2), 3600);
            foeEls.forEach(fe => { if (fe) fe.classList.add('enraged'); });
            quake(true);
          }, 600 + fxLeft());
        } else if (e.type === 'count') {   // 3・2・1（2026-10-24 ユーザー判断）：判定が始まる前に、回すドラムの右上に小さく。0 で負荷が切り替わり、判定が始まる
          if (e.n === D.TUNE.countSec && goText) { say(goText, 'go'); goShown = true; goText = ''; }   // 「3」と同時に「○○RPMで まわせ！」（2026-10-29 試走 No.16）
          const r = q('#reel' + (BT.current(b).slot % 3)), c = U.el('b', 'count'); c.textContent = e.n;
          r.appendChild(c); later(() => c.remove(), 900);
        } else if (e.type === 'stop') {
          goShown = false;
          done[e.slot % 3] = e.match;
          const r = q('#reel' + (e.slot % 3)), fe = foeEls[e.foe], img = fe && fe.querySelector('img');
          r.classList.add('stopped'); flash(r, 'land', 300);
          if (e.crit) r.classList.add('is-crit');
          if (e.star) r.classList.add('got', ...(e.crit ? ['gold'] : []));
          // 並んだドラム3つとも金の星（会心）なら、3つ目で特別な攻撃（2026-10-27 ユーザー判断）：ためが長く、画面が金色に光り、敵が大きく吹き飛ぶ。
          // ダメージは基礎点の5倍（2026-10-28 ユーザー判断。決めるのは battle.js）
          const gold3 = !!e.gold3;
          busyUntil = Date.now() + NEXT_MS;
          if (e.match >= D.TUNE.winLine) {
            // ため（CHARGE_MS。会心は長め・金色）→ 必殺技：主人公が名前を叫んで踏み込み、職業ごとの演出。画面が閃く（会心は上位の技で、金色）。敵は震えて点滅し、ダメージの数字が敵の上で弾む
            const nm = e.skill ? e.skill.name : e.crit ? skill.crit : skill.skill, wait = gold3 ? GOLD3_MS : e.crit ? CHARGE_CRIT_MS : CHARGE_MS;
            fxUntil = Date.now() + wait + (gold3 ? 1200 : 0); busyUntil += wait + (gold3 ? 1200 : 0);   // 吹き飛ぶのを見せてから、次へ
            fxEnd = Date.now() + wait + moveMs(e.crit) + (gold3 ? 1200 : 0) + 300;   // 技が終わって、ダメージの数字を見てから 3・2・1
            chargeUp(e.crit, wait);
            if (gold3) goldGlow(wait);
            say(gold3 ? t('bt.gold3') : t('bt.charge', { hero: D.HEROES[setup.heroId] ? D.HEROES[setup.heroId].n : '' }), e.crit ? 'crit' : 'skill');
            later(() => {
              shout(t('bt.shout', { skill: nm }), e.crit);
              say(e.crit ? t('bt.crit', { dmg: e.dmg }) : t('bt.dmg', { dmg: e.dmg }), e.crit ? 'crit' : 'skill');   // 技の名前は主人公の上に大きく出すので、窓の行は短く（2026-10-22 ユーザー指摘：行が切れていた）
              skillMove(fe, e.crit, () => {   // 技ごとの動き（skillMove）。当たったら技の演出・閃き・ダメージ
                skillFx(fe, e.crit); flash(q('.flash'), e.crit ? 'gold' : 'on', 400);
                if (gold3) goldBurst(fe, e.foe);
                later(() => { if (img) bounceDmg(img, e.dmg, e.crit); if (!gold3) flash(fe, e.crit ? 'struck-crit' : 'struck-big', e.crit ? 750 : 600); }, 250);   // 大きく震えて、のけぞる
              });
            }, wait);
          } else {
            // 届かなかった：少しのダメージのあと、敵の反撃で主人公がよろける（受けた数字は出すが、HP は持たない）
            say(t('bt.weak', { pct: pct(e.match), dmg: e.dmg }));
            fxEnd = Date.now() + 450 + 1000 + 300;   // 敵の反撃が終わってから 3・2・1
            if (img) { bounceDmg(img, e.dmg, false); flash(fe, 'struck', 380); }
            later(() => { if (fe) charge('foe', fe, 1000, () => { flash(heroBox, 'stagger', 700); setHero('hurt'); later(() => setHero('ready'), 700); bounceDmg(heroImg, Math.max(1, Math.round((1 - e.match) * 100)), false, true); }); }, 450);
          }
        } else if (e.type === 'attack') {
          normalAttack(e);
        } else if (e.type === 'foeEnd') {
          const fe = foeEls[e.foe];
          // 倒した敵は、必殺技を見せてから倒れて消える。倒せなかった敵は最後に攻撃してくる。
          // 雑魚3体（2026-10-23 ユーザー判断）：ドラムごとに左の敵から1体ずつ相手にし、星（倒せた）ならその敵が消えて、残りの敵だけが並ぶ
          // 消え方はどこでも同じ1つ（震えて白く光り、薄くなって消える。CSS の vanish。2026-10-23 ユーザー判断）。最後の敵は、勝ちの言葉と一緒に消える（result）
          // 最後の敵は、全部倒したときだけ勝ちの言葉と一緒に消える（result）。逃げた敵がいるときは、最後に倒した敵もここで消す（2026-10-25 ユーザー指摘：最後の1体を倒したのに残っていた）
          if (fe && e.defeated && (!b.foes.every(f => f.done) || !b.defeated)) { later(() => { fe.classList.add('vanish'); }, 1700 + fxLeft()); later(() => { fe.classList.add('out'); }, 2800 + fxLeft()); }
        } else if (e.type === 'result') {
          goShown = false;
          // 勝った：勝ちの言葉と一緒に、まだ並んでいる敵（倒れて消えていない敵）が震えて薄くなり、消える（2026-10-23 ユーザー指摘：敵が並んだまま次の場面へ切り替わっていた）
          const boss = b.kind === 'boss', outLine = boss ? bossLine('out', 3) : '', bossWait = boss ? bossDur(outLine, 2600) : 0;   // 鬼王は、言い訳をしてから消える（真のラスボスではない。2026-10-25 ユーザー要望）
          if (e.defeated && boss) later(() => bossSay(outLine, 2900), 1300 + fxLeft());
          if (e.defeated) later(() => {
            say(b.foes.length > 1 ? t('bt.allDown') : t('bt.down', { foe: name(0) }));
            foeEls.forEach(fe => { if (fe && !fe.classList.contains('out')) fe.classList.add('vanish'); });
          }, 1500 + fxLeft() + bossWait);
        } else if (e.type === 'end') {
          goShown = false;
          q('.slots').hidden = true;
          const left = foeEls.map((fe, i) => fe && !b.foes[i].defeated ? fe : null).filter(Boolean);
          if (e.skipped) {
            // 戦闘をとばした（2026-10-23 ユーザー要望）：残っている敵は、攻撃せずにすぐ逃げていく
            const shown = b.foes.filter((f, i) => foeEls[i] && !f.defeated), who = (shown[0] || b.foes.find(f => !f.defeated) || b.foes[0]).def.n;
            say(left.length > 1 ? t('bt.allFled') : t('bt.fled', { foe: who }));
            left.forEach(fe => fe.classList.add('flee'));
          } else if (!e.defeated) {
            // 倒せなかった敵が攻撃してきて、逃げていく
            const shown = b.foes.filter((f, i) => foeEls[i] && !f.defeated), who = (shown[0] || [...b.foes].reverse().find(f => !f.defeated)).def.n;   // 名前は、いま見えている敵（連戦では、前のウェーブの敵ではなく）
            say(t('bt.foeAttack', { foe: who, dmg: e.dmg }), 'hurt');
            left.forEach(fe => flash(fe, 'lunge', 300));
            later(() => { flash(screen.querySelector('.battle'), 'quake', 400); flash(heroBox, 'stagger', 700); bounceDmg(heroImg, e.dmg, false, true); }, 150);
            const winLine = b.kind === 'boss' ? bossLine('win', 2) : '';
            if (winLine) later(() => bossSay(winLine, 2700), 1900);   // 鬼王は、笑ってから去る
            later(() => { say(left.length > 1 ? t('bt.allFled') : t('bt.fled', { foe: who })); left.forEach(fe => fe.classList.add('flee')); }, winLine ? 1900 + bossDur(winLine, 2600) : 2200);
          }
          const buttons = opts.endButtons || null;
          if (buttons) {
            const box = U.el('div', 'buttons');
            for (const [label, fn] of buttons) { const bt = U.el('button'); bt.textContent = label; bt.onclick = () => { ended = true; fn(result()); }; box.appendChild(bt); }
            q('.battle').appendChild(box);
          } else endT = e.skipped ? 1.8 : (e.defeated ? Math.max(3, 2.9 + fxLeft() / 1000) : 5) + (b.kind === 'boss' ? bossDur(bossLine(e.defeated ? 'out' : 'win', e.defeated ? 3 : 2), 2600) / 1000 : 0);   // 鬼王はセリフのぶん長く   // ボタンが無ければ、少し見せてから先へ（勝ったときは、敵が消えきってから）
        }
      }
    }

    // ドラム：十の位はそのドラムの合致率（判定と同じ値）、一の位は回り続ける。止まったら本当の値（会心は紋章）
    function draw(dt) {
      const pr = BT.progress(b);
      const cur = BT.current(b);
      foeEls.forEach((fe, i) => fe && fe.classList.toggle('front', b.phase === 'reel' && i === cur.foe));   // 3体のときは、今の相手が前に出る
      for (let i = 0; i < 3; i++) {
        const r = q('#reel' + i), now = b.phase === 'reel' && i === cur.slot % 3, m = done[i];
        let tens = '-', judging = false, locked = false;
        if (m != null) { tens = String(Math.floor(pct(m) / 10)); pos[i] = pct(m) % 10; }
        else {
          const live = now ? BT.matchNow(b) : null;
          judging = live != null;
          if (judging) tens = String(Math.floor(pct(live) / 10));
          // 合致率が倒す線（90%）以上なら、一の位はその時点の値を出して回る（2026-10-21 ユーザー判断：狙って近づける方がトレーニングになる）。
          // 届かなければ、数字が流れ続ける
          locked = judging && live >= D.TUNE.winLine;
          if (locked) { pos[i] = pct(live) % 10; roll[i] = (roll[i] + dt * SPIN.ok) % 1; }   // 90%以上：その値の数字が、同じ向き（下から上）に縦に流れ続ける（2026-10-25 ユーザー要望：ドラムだから縦に回る）
          else pos[i] = (pos[i] + dt * (!now ? SPIN.wait : !judging ? SPIN.ng : b.inCond ? SPIN.ok : SPIN.ng)) % 10;
        }
        r.classList.toggle('locked', locked);
        r.classList.toggle('waiting', m == null && !judging);   // 判定の前は「--」
        // ふちと十の位の色は、今の回転が目標より遅い（青）・合う（緑）・速い（橙）。合致率が倒す線（90%）以上なら、ふちが太く光る（2026-10-22 ユーザー判断）
        const pc = now && b.phase === 'reel' ? b.pace : null;
        r.classList.toggle('now', now); r.classList.toggle('win', now && b.inCond);
        r.classList.toggle('slow', pc === -1); r.classList.toggle('on', pc === 0); r.classList.toggle('fast', pc === 1);
        const cd = now && b.phase === 'reel' && b.cadDir != null ? b.cadDir : null;   // 印は色とは別に、目標より低い＝▲（青）・±1 回転以内＝●（緑）・高い＝▼（赤）（2026-10-25 ユーザー判断：青の間も出す。2026-10-27：● と印の色）
        const pe = r.querySelector('.pace'); pe.textContent = cd == null ? '' : cd < 0 ? '▲' : cd > 0 ? '▼' : '●';
        pe.classList.toggle('lo', cd === -1); pe.classList.toggle('ok', cd === 0); pe.classList.toggle('hi', cd === 1);
        r.querySelector('.d10').textContent = tens;
        const st = r.querySelector('.strip');
        st.style.transform = `translateY(${(-pos[i]).toFixed(3)}em)`;
        if (locked) {   // 同じ数字を2つ並べた帯を流す（つなぎ目が見えない）
          const sm = r.querySelector('.same'), dg = String(pos[i]);
          if (sm.firstChild.textContent !== dg) sm.childNodes.forEach(c => { c.textContent = dg; });
          sm.style.transform = `translateY(${(-roll[i]).toFixed(3)}em)`;
        }
        r.querySelector('.left').textContent = now ? Math.ceil(pr.left) : '';
      }
    }

    // エンカウントの演出（2026-10-24 ユーザー要望「敵が現れる時の演出も欲しい」）：
    // ① 前ぶれ：画面が2〜3回ちらつく（効果音 encounter・boss と同時）② 黒い横の帯が左右から交互に閉じて、開くと戦闘の画面
    // ③ 敵が黒い影から色づいて現れる（雑魚3体はずらす）④「○○が あらわれた！」。全体で約2秒、ボス・中ボスは赤くゆれて少し長い。
    // 戦闘の始め（BATTLE.introSec＝5秒）の中に収めるので、ドラムの始まり（トレーニングの区間）は変わらない。
    // 「軽い」では、ちらつきを1回・弱く、ゆれなし（点滅が苦手な人も考えて、ふだんも強くしすぎない）
    const big = b.kind === 'boss' || b.kind === 'elite', soft = U.light();
    const battleEl = q('.battle'), enc = U.el('div', 'enc' + (big ? ' big' : '') + (soft ? ' soft' : ''));
    enc.innerHTML = '<div class="enc-flash"></div><div class="enc-bars">' + Array.from({ length: 8 }, (_, i) => `<i class="${i % 2 ? 'r' : 'l'}"></i>`).join('') + '</div>';
    battleEl.appendChild(enc); battleEl.classList.add('pre');
    const K = root.__rq && root.__rq.encSlow || 1;   // テスト用：演出をゆっくりにして1コマずつ撮る（window.__rq.encSlow = 10 など）
    battleEl.style.setProperty('--enc-k', K);
    const FLASH = (soft ? 450 : big ? 1200 : 900) * K, CLOSE = 450 * K, OPEN = 350 * K;
    enc.classList.add('go');
    if (big && !soft) later(() => flash(battleEl, 'quake', 400 * K), 250 * K);
    later(() => enc.classList.add('close'), FLASH);
    later(() => { battleEl.classList.remove('pre'); enc.classList.remove('close'); enc.classList.add('open'); }, FLASH + CLOSE);
    later(() => enc.remove(), FLASH + CLOSE + OPEN + 50);
    showWave(0, FLASH + CLOSE + 100 * K, K);
    const sayAt = FLASH + CLOSE + (100 + 500 + (b.waves[0].foes.length === 3 ? 320 : 0)) * K;
    if (b.kind === 'boss') { later(() => say(t('bt.appear', { foe: waveName(0) })), sayAt); later(() => bossSay(bossLine('in', 3), 5200), sayAt + 500 * K); }   // 鬼王は、現れたら名乗りのセリフ（ドラムの判定しない5秒の中まで残す。ドラムの時間は食わない）
    else later(() => say(t('bt.appear', { foe: waveName(0) })), sayAt);
    draw(0);
    return {
      kind: 'battle',
      elapsed: () => sec,   // 旅の残り時間の計算に使う
      length: () => BT.lengthOf(b.waves),
      // 戦闘をとばす（左上のボタン。旅の戦闘の間だけ）。とばせたら true
      canSkip: () => !ended && b.phase !== 'end',
      skip() {
        if (ended || b.phase === 'end') return false;
        const evs = BT.skip(b);
        onEvents(evs);
        if (root.RQ.sfx) root.RQ.sfx.battle(b, evs, null, 0, root.RQ.music);
        return true;
      },
      tick(dt) {
        if (ended) return;
        sec += dt;
        b.ftp = U.ftp();   // FTP は戦闘の途中でも変えられる
        const evs = BT.step(b, dt, { power: S.power, cad: S.cad, erg: S.erg });
        onEvents(evs);
        if (root.RQ.sfx) root.RQ.sfx.battle(b, evs, BT.matchNow(b), dt, root.RQ.music);   // 効果音と、曲のテンポ＝目標の回転数（renderer/audio/sfx.js）
        U.load(BT.loadOf(b), dt);   // いつも ERG（決まったパワーで、言われた回転数で回す）
        if (endT != null && (endT -= dt) <= 0) { endT = null; finish(); }
        if (!ended && alive()) draw(dt);   // 終わって次の画面に移ったら描かない
      },
    };
  }

  (root.RQ.views = root.RQ.views || {}).battle = battleView;
})(window);
