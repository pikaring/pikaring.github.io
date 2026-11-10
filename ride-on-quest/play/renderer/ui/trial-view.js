/* 女王の試練（FTP テスト）の画面。女王のドット絵とせりふを出す。opts.onWorld なら島の3D の上の層に重ねる
   （2026-10-21 から試練も島一周を走る。それより前は玉座の間の背景だった）。
   トレーナーには平らな道（勾配0%）を送り、目標パワーには自分でギアと回転で合わせる（2026-10-21 ユーザー判断：
   FTP テストはギアを使わないと正しく測れない。簡易なテストなのでランプのまま）。
   Enter（タッチでは窓の「ここまで」）：ランプ中ならここまでで終える。opts.onDone(ftp|null, trial)。 */
(function (root) {
  const TL = root.RQ.trial, TR = root.RQ.trainer, S = TR.state, U = root.RQ.ui, t = root.RQ.i18n.t;
  // 女王のせりふ（trial.js の INTRO・CHEERS は日本語）を、今の言語の表の文に
  const loc = s => { let i = TL.INTRO.indexOf(s); if (i >= 0) return t('trial.intro.' + i); i = (TL.CHEERS || []).indexOf(s); return i >= 0 ? t('trial.cheer.' + i) : s; };
  const LINE_SEC = 5;

  function trialView(screen, opts) {
    const tr = TL.createTrial({ guess: U.ftp() });
    if (!opts.onWorld) U.setBg('islandMap');
    screen.innerHTML = `
      <div class="trial${opts.onWorld ? ' on-world' : ''}">
        <div class="queen"><img alt=""></div>
        <div class="win trial-panel">
          <div class="phase"></div>
          <div class="target"><b></b><small>W</small></div>
          <div class="info"></div>
          <button class="giveup" hidden>${t('trial.giveup')}</button>
        </div>
        <div class="win talk by-npc"><div class="who">${root.RQ.i18n.cap(root.RQ.data.WORLD.queen)}</div><div class="text"></div><div class="effect"></div></div>
      </div>`;
    const q = s => screen.querySelector(s);
    let lines = TL.INTRO.slice(), lineT = 0, ended = false, poseT = 0;
    q('.giveup').onclick = () => { if (!ended) onEvents(TL.giveUp(tr)); };   // タッチの画面（Enter の代わり）
    const queen = q('.queen img');
    // 女王のポーズ（仮のドット絵には1つしかないので、今は向きを変えない）。sec 秒たったら stand に戻す（0 なら戻さない）
    const setPose = (p, sec = 0) => { U.setSprite(queen, 'queen', 'front', 0, 1.2); poseT = sec; };
    let stopType = null;
    // スマホの縦では話の窓を 3 行までずつ。超える分は、次に話す行として前に入れる（2026-11-09 試走 指摘 7・判断 67A。U.talkPages）
    const say = text => {
      if (stopType) stopType();
      const pages = text && text.raw != null ? [text.raw] : U.talkPages(q('.talk .text'), t('talk.quote', { text: loc(text) }));
      if (pages.length > 1) lines.unshift(...pages.slice(1).map(raw => ({ raw })));
      stopType = U.typeText(q('.talk .text'), pages[0]); lineT = 0;
    };
    setPose('talk');
    say(lines.shift());

    function onEvents(evs) {
      for (const e of evs) {
        if (e.type === 'rampStart') { lines = []; setPose('talk', 4); say(t('trial.start')); setTimeout(() => { if (!ended) q('.trial').classList.add('queen-gone'); }, 4000); }   // 試練が始まったら、上の女王（絵と窓）は消える（2026-10-26 ユーザー判断。開始のひとことが読めるよう 4 秒あとに）
        else if (e.type === 'level' && e.cheer) { setPose('cheer', 3); say(e.cheer); }
        else if (e.type === 'done') done(e);
      }
    }
    function done(e) {
      ended = true; q('.trial').classList.remove('queen-gone');   // 試練が終わったら、女王が出てくる
      TR.setGrade(0);
      const prev = U.ftp();
      if (!e.ftp) setPose('stern');
      else if (e.ftp > prev) { setPose('surprised'); setTimeout(() => { if (screen.contains(queen)) setPose('praise'); }, 2500); }
      else setPose('praise');
      if (e.ftp) say(t('trial.done', { ftp: e.ftp, more: e.ftp > prev ? t('trial.stronger', { d: e.ftp - prev }) : '' }));
      else say(t('trial.noFtp'));
      const box = U.el('div', 'buttons');
      if (e.ftp) { const ok = U.el('button'); ok.textContent = t('trial.setFtp', { ftp: e.ftp }); ok.onclick = () => opts.onDone(e.ftp, tr); box.appendChild(ok); }
      const no = U.el('button'); no.textContent = e.ftp ? t('trial.noSave') : t('ui.back'); no.onclick = () => opts.onDone(null, tr); box.appendChild(no);
      q('.talk .effect').textContent = e.ftp ? '✦ ' + t('trial.calc', { best1: e.best1, ftp: e.ftp }) + (tr.phase !== 'warmup' && tr.target ? '　' + t('trial.with', { w: tr.target }) : '') : '';   // どこまで並んで走ったか：ワット数で（名前ではなく）
      q('.talk').appendChild(box);
    }

    function draw() {
      const ramp = tr.phase === 'ramp';
      q('.phase').textContent = tr.phase === 'done' ? t('trial.end') : ramp ? t('trialRep.stepN', { n: tr.level }) : t('trial.warm');
      q('.target b').textContent = tr.target;
      const left = ramp ? TL.STEP_SEC - (tr.t % TL.STEP_SEC) : TL.WARM_SEC - tr.t;
      q('.giveup').hidden = !ramp || ended;
      q('.info').textContent = tr.phase === 'done' ? '' : ramp
        ? t('trial.nextStep', { left: U.mmss(left), ftp: tr.best1 ? Math.round(tr.best1 * 0.75) + ' W' : '—' })
        : t('trial.toRamp', { left: U.mmss(left) });
    }

    draw();
    return {
      kind: 'trial',
      pace: () => ({ target: tr.target, level: tr.phase === 'warmup' ? 0 : tr.level, done: tr.phase === 'done' }),   // ペースメーカー（pacemaker.js）に渡す。見た目だけ
      lapKind: () => tr.phase === 'warmup' ? 'field' : 'trial',   // 記録のラップ：ウォームアップと、ランプ
      left: () => tr.phase === 'ramp' ? TL.STEP_SEC - (tr.t % TL.STEP_SEC) : tr.phase === 'warmup' ? TL.WARM_SEC - tr.t : null,   // 走行データの残り時間（つぎの段まで）
      tick(dt) {
        if (ended) return;
        TR.setGrade(0);   // 試練だけはギアで合わせる（ERG にしない）
        onEvents(TL.step(tr, dt, { power: S.power, cad: S.cad }));
        if (!ended && (lineT += dt) >= LINE_SEC && lines.length) say(lines.shift());
        if (!ended && tr.phase === 'warmup' && !lines.length && poseT <= 0) setPose('stand');
        if (!ended && tr.phase === 'ramp' && tr.low > 2) setPose('cheer', 1);   // 苦しそうなら励ます
        if (!ended && poseT > 0 && (poseT -= dt) <= 0) setPose('stand');
        if (!ended) draw();
      },
      key(e) { if (e.key === 'Enter' && !ended) onEvents(TL.giveUp(tr)); },
    };
  }

  root.RQ.views.trial = trialView;
})(window);
