/* 走り終わったあと（2026-10-22 ユーザー判断。design.md §4.14）。画面の部品だけで、流れは app.js が決める。
   RQ.ui.pickWin(host, { title, note, buttons: [[文字, 押したとき], …] }) → { remove() }：画面のまん中の黒地の窓にボタンを並べる（走るのは止めない）。
   RQ.ui.endChoice(host, { title, note, onEnd, onGo })：［これで終わる］［続けて走る ▶］。
   RQ.ui.heroPick(host, { minutes, heroes, hero, title, go, onGo(heroId, minutes), onBack })：B（キャラクターを選んで旅に出る）・女王の試練の挑戦者。主人公のカードと今日の時間（15分刻み）。
   RQ.views.extra(layer, o, opts)：旅の3D の世界の上で、続けて走る間の画面。o.mode：'wait'（窓を選んでいる間。クールダウンの ERG）・'erg'・'grade'。
   'erg' は FTP の o.pct %（◀ ▶ と ← → で 5% ずつ）、'grade' は世界の坂 × o.effect をトレーナーに送る（ギアを変える）。戦闘はなく、分かれ道の矢印は世界の側が出す。
   右上の「終える ▶」で opts.onEnd。記録は切らない（まとめ・保存は終えたときに1回。app.js）。 */
(function (root) {
  const U = root.RQ.ui, D = root.RQ.data, TR = root.RQ.trainer, t = root.RQ.i18n.t;
  const ERG_MIN = 40, ERG_MAX = 120, ERG_STEP = 5, PER = 4;   // PER：主人公を選ぶ窓の1ページの人数

  function pickWin(host, { title = '', note = '', buttons = [], cls = '' } = {}) {
    const box = U.el('div', 'win end-choice' + (cls ? ' ' + cls : ''));
    box.innerHTML = `<div class="ec-title"></div><div class="ec-note"></div><div class="buttons"></div>`;
    box.querySelector('.ec-title').textContent = title;
    box.querySelector('.ec-note').textContent = note; box.querySelector('.ec-note').hidden = !note;
    let done = false;
    for (const [label, fn, c] of buttons) {
      const b = U.el('button', c || ''); b.textContent = label;
      b.onclick = () => { if (done) return; done = true; box.remove(); fn && fn(); };
      box.querySelector('.buttons').appendChild(b);
    }
    host.appendChild(box);
    return { remove() { done = true; box.remove(); }, el: box };
  }
  const endChoice = (host, { title = t('more.wellDone'), note = '', onEnd, onGo } = {}) =>
    pickWin(host, { title, note, buttons: [[t('more.end'), onEnd, 'ec-end'], [t('more.go'), onGo, 'ec-go']] });

  // B：キャラクターと今日の時間を選ぶ。heroes：[{ id, lv（"Lv 3・基礎"）, boss（ボスまでの分）}]
  // 選ぶ窓（.end-choice：これで終わる／続けて走る・A／B・キャラと時間）が出ている間は、スペースを分かれ道の切り替え（app.js）に渡さない。
  // フォーカスしたボタン（キャラのカードなど）をスペースで押せるようにする（2026-10-24 窓口：B で選んだキャラにならなかった件の対策）。
  // capture で先に受け、ボタンのふつうの働き（スペースで押す）は止めない
  addEventListener('keydown', e => { if (e.code === 'Space' && document.querySelector('.end-choice')) e.stopImmediatePropagation(); }, true);

  // hero：最初に選んでおくキャラクター（今走っているキャラ。無ければ1枚目）
  // title・go：窓の題とボタン（女王の試練の前に挑戦者を選ぶとき。2026-10-28）。minuteList が空なら時間の列は出さない
  function heroPick(host, { minutes = 60, heroes = [], hero: first = null, minuteList = [15, 30, 45, 60], title = t('more.who'), go = t('more.setOut'), onGo, onBack } = {}) {
    const box = U.el('div', 'win end-choice hero-pick');
    box.innerHTML = `<div class="ec-title"></div><div class="hp-pages"></div><div class="hp-cards"></div><div class="hp-min"><span>${t('sel.today')}</span></div><div class="buttons"><button class="hp-back">${t('more.back')}</button><button class="hp-go"></button></div>`;
    box.querySelector('.ec-title').textContent = title; box.querySelector('.hp-go').textContent = go;
    box.querySelector('.hp-min').hidden = !minuteList.length;
    let hero = heroes.some(h => h.id === first) ? first : heroes[0] && heroes[0].id, min = minutes, done = false;
    const cards = box.querySelector('.hp-cards'), mrow = box.querySelector('.hp-min'), prow = box.querySelector('.hp-pages');
    // 4人ずつ「1 2」のページ（2026-10-28：8人を1列に並べると窓からはみ出した。タイトルの主人公選びと同じ 4 人ずつ。rq-trip）。最初は選んでいる人のページ
    const pages = Math.ceil(heroes.length / PER);
    let page = Math.max(0, Math.floor(heroes.findIndex(h => h.id === hero) / PER));
    for (let i = 0; i < pages; i++) { const b = U.el('button', 'min'); b.textContent = String(i + 1); b.onclick = () => { page = i; sync(); }; prow.appendChild(b); }
    prow.hidden = pages < 2;
    for (const h of heroes) {
      const c = U.el('button', 'hp-card'); c.dataset.id = h.id;
      c.innerHTML = `<img alt=""><b></b><small></small>`;
      U.setSprite(c.querySelector('img'), h.id, 'front', 0, 0.55);
      c.querySelector('b').textContent = D.HEROES[h.id].n; c.querySelector('small').textContent = h.lv;
      c.onclick = () => { hero = h.id; sync(); };
      cards.appendChild(c);
    }
    for (const m of minuteList) { const b = U.el('button', 'min'); b.textContent = t('sel.min', { m }); b.dataset.m = m; b.onclick = () => { min = m; sync(); }; mrow.appendChild(b); }
    const sync = () => {
      cards.querySelectorAll('.hp-card').forEach((c, i) => { c.classList.toggle('on', c.dataset.id === hero); c.hidden = Math.floor(i / PER) !== page; });
      prow.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === page));
      mrow.querySelectorAll('button.min').forEach(b => b.classList.toggle('on', +b.dataset.m === min));
    };
    sync();
    box.querySelector('.hp-go').onclick = () => { if (done || !hero) return; done = true; box.remove(); onGo && onGo(hero, min); };
    box.querySelector('.hp-back').onclick = () => { if (done) return; done = true; box.remove(); onBack && onBack(); };
    host.appendChild(box);
    return { remove() { done = true; box.remove(); }, el: box };
  }

  function extraView(layer, o = {}, opts = {}) {
    const wrap = U.el('div', 'extra');
    wrap.innerHTML = `<div class="win plate xplate" hidden><div class="xinfo"></div><button class="skip">${t('more.finish')}</button></div>
      <div class="win ergbox" hidden><button class="erg-dn">◀</button><div class="erg-v"><span class="k">ERG</span><b class="ep"></b><small>%</small><b class="ew"></b><small>W</small></div><button class="erg-up">▶</button></div>`;
    layer.appendChild(wrap);
    const q = s => wrap.querySelector(s);
    let pct = Math.max(ERG_MIN, Math.min(ERG_MAX, o.pct || 50)), mode = o.mode || 'wait', sec = 0, ended = false;
    const restPct = Math.round(D.ERG_REST * 100);
    const showErg = () => { q('.erg-v .ep').textContent = pct; q('.erg-v .ew').textContent = Math.round(U.ftp() * pct / 100); };   // 見た目は HUD の項目と同じ（2026-10-24 ユーザー判断「ERG は HUD に合わせる」）
    const stepErg = d => { if (mode !== 'erg') return; pct = Math.max(ERG_MIN, Math.min(ERG_MAX, pct + d * ERG_STEP)); showErg(); };
    q('.erg-dn').onclick = () => stepErg(-1); q('.erg-up').onclick = () => stepErg(1);
    q('.skip').onclick = () => { if (ended) return; ended = true; opts.onEnd && opts.onEnd({ sec }); };
    function setMode(m) {
      mode = m;
      q('.xplate').hidden = m === 'wait';
      q('.ergbox').hidden = m !== 'erg';
      if (m === 'erg') showErg();
    }
    setMode(mode);
    return {
      kind: 'extra',
      lapKind: () => 'ride',   // 記録のラップの区切り（フリーライドと同じ）
      mode: () => mode, setMode,
      seconds: () => sec,
      pct: () => pct,   // テスト用
      tick(dt) {
        if (ended) return;
        if (mode === 'grade') TR.setGrade((o.grade ? o.grade() : 0) * (o.effect == null ? 0.5 : o.effect));   // 勾配：ギアを変える（フリーライドと同じ）
        else U.load({ erg: Math.round(U.ftp() * (mode === 'erg' ? pct : restPct) / 100) }, dt);   // ERG（選んでいる間はクールダウンの強さ）
        if (mode === 'wait') return;
        sec += dt;
        q('.xinfo').textContent = `${t('more.freeMode', { mode: mode === 'erg' ? 'ERG' : t('more.grade') })}　+${U.mmss(sec)}${o.km ? `　${RQ.units.dist(o.km(), 2)}` : ''}`;
        if (mode === 'erg') showErg();
      },
      key(e) { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') stepErg(1); else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') stepErg(-1); else return; e.preventDefault(); },
      dispose() { ended = true; wrap.remove(); },
    };
  }

  Object.assign(U, { pickWin, endChoice, heroPick });
  (root.RQ.views = root.RQ.views || {}).extra = extraView;
})(window);
