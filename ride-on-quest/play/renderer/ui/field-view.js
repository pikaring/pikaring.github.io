/* フィールド（クールダウン）の画面。景色がゆっくり流れ、場所が変わり、NPC と会話する。
   漕いでいる間だけ進む。会話は時間で進み、Enter で早送りできる。右上のボタンでクールダウンを早く終えられる。
   opts.world（旅の3D の世界）があれば、景色の絵と歩く主人公は出さず、3D の上に重ねる。会話の相手は道端に立ち、横を通り過ぎたら話し始める（world.placeNpc）。 */
(function (root) {
  const D = root.RQ.data, C = root.RQ.course, TK = root.RQ.talks, TR = root.RQ.trainer, S = TR.state, U = root.RQ.ui, t = root.RQ.i18n.t;

  function fieldView(screen, run, opts = {}) {
    const hero = D.HEROES[run.heroId], seg = C.seg(run);
    const W = opts.world;
    if (!W) U.setBg(null);   // 3D が作れないときの代わりの画面は黒地（主人公と会話が見やすい。2026-10-23：トリスケリオンの場面の絵と古い場所の名前をやめた）
    screen.innerHTML = `
      <div class="field${W ? ' on-world' : ''}">
        <div class="scene"></div><div class="scene"></div>
        <div class="walker"><img alt=""></div>
        <div class="place"></div>
        <div class="win plate fnext"><div class="next"></div><div class="stars"></div><div class="mission" hidden></div><button class="skip"></button></div>
        <div class="win talk" hidden><img class="talk-face" alt=""><img class="talk-hero" alt="" hidden><div class="who"></div><div class="text"></div><div class="effect"></div><div class="hint">${t('talk.next')}</div></div>
        <div class="mcall" hidden></div>
        <div class="idle" hidden>${t('field.idle')}</div>
      </div>`;
    const q = s => screen.querySelector(s);
    const layers = [...screen.querySelectorAll('.scene')];
    let front = 0, crank = 0, still = 0, placeT = 0, ended = false, shownEnd = null;
    const walker = q('.walker'), face = q('.talk-face'), heroFace = q('.talk-hero');
    U.setSprite(heroFace, run.heroId, 'front', 0, 0.9);
    const UNIT = 1.25;   // 絵の1ドットの高さ（画面の高さの %）
    if (!W) U.setSprite(walker.firstChild, run.heroId, 'side', 0, UNIT);

    // 場面の絵は出さない（3D のときは、場所の名前は世界の側が出す。3D が無いときは島の地図のまま）
    function showScene() {}

    // 次の区間までの時間（draw で書く）。ウォームアップ・クールダウン（戦闘の前の回復、試練のあとの3分）は、その名前と残り（2026-10-28 試走：
    // 試練のあと最初の戦闘まで 2:40 ある理由が分からなかった）。ボスの前・帰り道は行き先まで
    const phaseKey = seg.home || seg.final ? null : /^ウォームアップ/.test(seg.label || '') ? 'field.warmLeft' : 'field.coolLeft';
    if (phaseKey === 'field.warmLeft') q('.field').dataset.phase = 'warmup';   // ウォームアップの印（ブラウザ版の広告の試し〔adtest〕が見る。ほかでは使わない）
    const nextName = seg.home ? t('field.toGoal') : seg.final ? t('field.toBoss', { boss: D.WORLD.boss }) : t('field.toBattle');
    const nextText = left => phaseKey ? t(phaseKey, { t: U.mmss(left) }) : `${nextName} ${U.mmss(left)}`;
    // クールダウンを早く終える（帰り道なら、まとめへ）
    q('.skip').textContent = seg.home ? t('field.report') : t('field.fight');
    q('.skip').onclick = () => { if (!ended) onEvents(seg.home ? C.endHome(run) : C.skipField(run)); };

    function speaker(talk, who) {
      if (who === 'npc') return talk.char ? root.RQ.i18n.cap((TK.NPCS[talk.char] || D.ENEMIES[talk.char]).n) : talk.name ? root.RQ.i18n.cap(talk.name) : '';   // name：道端に立たない人（女王）
      if (who === 'hero') return hero.n;
      return '';
    }
    // せりふは「＊「……」」の形で、1字ずつ出す。スマホの縦では 3 行までずつ、次の窓に送る（U.talkPages。窓の数は course.js が run.talkPages で聞く）
    let stopType = null;
    const quoted = (who, text) => (who === 'sys' ? text : t('talk.quote', { text }));
    run.talkPages = (who, text) => {
      // 話の窓が隠れている間（話す時刻を決めるとき）は幅を測れないので、見えないまま一度出して測る。
      // 次の道の区間は、戦闘の画面が出ている間（戦闘の終わり。course.js の finishBattle）に組むので、そのときこの画面の窓はもう無い。
      // 同じ形の見えない窓を一度だけ置いて測る（2026-11-10 試走 指摘 3・4：消えた窓を読んで例外になり、逃げられた戦闘のあと旅に戻らず時計が止まっていた）
      let box = q('.field .talk'), tmp = null;
      if (!box) {
        tmp = U.el('div', 'field' + (W ? ' on-world' : ''));
        tmp.style.visibility = 'hidden'; tmp.style.pointerEvents = 'none'; tmp.style.background = 'transparent';
        tmp.innerHTML = '<div class="win talk"><div class="who"></div><div class="text"></div></div>';
        screen.appendChild(tmp); box = tmp.querySelector('.talk');
      }
      const was = box.hidden;
      if (was) { box.style.visibility = 'hidden'; box.hidden = false; }
      try { return U.talkPages(box.querySelector('.text'), quoted(who, text)).length; }
      finally { if (tmp) tmp.remove(); else if (was) { box.hidden = true; box.style.visibility = ''; } }
    };
    function showLine() {
      const ft = run.field && run.field.talk; if (!ft) return;   // 早送りでは、同じ回の中で回復が終わっていることがある
      const talk = C.talkOf(run, ft.id), [who, text] = talk.lines[ft.line];
      q('.talk .who').textContent = speaker(talk, who);
      q('.talk .who').hidden = !speaker(talk, who);
      if (stopType) stopType();
      const pages = U.talkPages(q('.talk .text'), quoted(who, text));
      stopType = U.typeText(q('.talk .text'), pages[Math.min(ft.page || 0, pages.length - 1)]);
      q('.talk').className = 'win talk by-' + who;
      // 話している人が分かるように（2026-10-22 ユーザー要望）：主人公が話す行は、会話の窓の右上に主人公の正面の絵。NPC の絵（左上）はそのあいだ暗くする
      heroFace.hidden = who !== 'hero';
      face.classList.toggle('quiet', who !== 'npc');
    }
    function onEvents(evs) {
      for (const e of evs) {
        if (e.type === 'scene') showScene(e.id);
        else if (e.type === 'talkSoon') { if (W && W.placeNpc) W.placeNpc(e.talk.char || (e.id === 'camp' ? 'camp' : null), e.sec); }   // 野営地（話す人なし）は、道端にテントの板（view3d の setNpc）   // 道端の NPC：話す人を道の先に立たせる（話す人のいない会話は片づけるだけ）
        else if (e.type === 'talkStart') {
          q('.talk').hidden = false; q('.talk .effect').textContent = '';
          // 話しかけてくる人は、会話の窓の左上からこちらを向いて話す
          const fc = e.talk.char || e.talk.face;   // face：道端に立たない人（女王）の顔
          face.hidden = !fc;
          if (fc) U.setSprite(face, fc, 'front', 0, 0.9);
          showLine();
        } else if (e.type === 'talkLine') showLine();
        else if (e.type === 'talkEffect') { q('.talk .effect').textContent = e.text ? `✦ ${e.text}` : ''; }
        else if (e.type === 'talkEnd') { q('.talk').hidden = true; heroFace.hidden = true; }
        else if (e.type === 'missionEnd') {
          // 3D のときは場所の名前の欄が無いので、結果は窓のミッションの欄に少し残す
          const text = e.ok ? `${'★'.repeat(e.stars)} ${e.text}` : e.text;
          q('.place').textContent = text; q('.place').className = 'place on ' + (e.ok ? 'ok' : 'ng'); placeT = 5;
          shownEnd = { text, ok: e.ok, t: 5 };
        }
        else if (e.type === 'fieldEnd' && !ended) { ended = true; opts.onEnd && opts.onEnd(e); }
      }
    }

    function draw(dt, moving) {
      const f = run.field; if (!f) return;
      q('.next').textContent = nextText(seg.home ? run.total - run.clock : seg.sec - f.t);
      // 金の星（会心）と銀の星（それ以外の星。ミッションの星も）を分けて（2026-10-29 試走 No.22 ユーザー判断「金13、銀2 のように」）
      { const g = run.stats.crits || 0, sv = Math.max(0, run.stats.stars - g), k = g + ',' + sv, el = q('.stars');
        if (el.dataset.k !== k) { el.dataset.k = k; el.innerHTML = `<span class="gold">${t('field.gold', { n: g })}</span> <span class="silver">${t('field.silver', { n: sv })}</span>`; } }
      // ミッション中は、今の目標の回転数（だんだん変わる）を画面のまん中に大きく。窓には行き先（「→」）と残り秒。
      // できていれば緑、外れていれば赤
      const m = f.mission, mm = q('.mission'), mc = q('.mcall');
      if (shownEnd && (shownEnd.t -= dt) <= 0) shownEnd = null;
      mm.hidden = !((m && !f.talk) || shownEnd);
      mc.hidden = !(m && !f.talk);
      if (m && !f.talk) {
        const to = Array.isArray(m.cad) ? m.cad[1] : null, now = C.missionCad(m), cls = m.inCond ? 'ok' : 'ng';
        const arrow = to == null || to === now ? '' : `　→ ${to}`;
        mc.textContent = `${now} RPM`; mc.className = 'mcall ' + cls;
        mm.textContent = `${m.n}${arrow}　${t('field.secLeft', { s: Math.ceil(m.sec - m.t) })}`; mm.className = 'mission ' + cls;
      } else if (shownEnd) { mm.textContent = shownEnd.text; mm.className = 'mission ' + (shownEnd.ok ? 'ok' : 'ng'); }
      still = moving ? 0 : still + dt;
      q('.idle').hidden = still < 3;
      if (W) return;
      // 景色は、漕いだぶんだけ少しずつ流れる
      const per = seg.sec / seg.scenes.length, p = (f.t - f.scene * per) / per;
      layers[front].style.transform = `scale(1.14) translateX(${(3 - p * 6).toFixed(2)}%)`;
      if (moving) crank += S.cad / 60 * dt;
      // 回転数に合わせて歩く。会話中と止まっているときは立つ
      const walk = !f.talk && moving;
      U.setSprite(walker.firstChild, run.heroId, 'side', walk ? 1 + Math.floor(crank * 2) % 2 : 0, UNIT);
      if (walk) { const w = root.RQ.sprites.walkPose(crank); walker.style.transform = `translateY(${(-1.5 * w.h).toFixed(2)}cqh) rotate(${w.roll.toFixed(3)}rad) scale(${w.sx.toFixed(3)}, ${w.sy.toFixed(3)})`; walker.style.transformOrigin = '50% 100%'; } else walker.style.transform = '';   // 1歩ごとに弾み、つぶれ、傾く（sprites.js の walkPose）
      if (placeT > 0 && (placeT -= dt) <= 0) q('.place').classList.remove('on');
    }

    draw(0, false);
    return {
      kind: 'field',
      tick(dt) {
        // クールダウン（ミッション中はミッションの強さ）。いつも ERG
        U.load({ erg: Math.round(U.ftp() * C.fieldFrac(run)) }, dt);
        const moving = S.power >= 10 || S.cad >= 20;
        onEvents(C.stepField(run, dt, { power: S.power, cad: S.cad, npc: W && W.npcReached ? W.npcReached() : undefined, where: W && W.whereTags ? W.whereTags() : undefined }));
        if (!ended) draw(dt, moving);
      },
      key(e) {
        if (e.key !== 'Enter' || !run.field) return;
        if (run.field.talk && stopType && stopType()) return;   // 出している途中なら、まず全部出す
        if (seg.home) onEvents(C.endHome(run)); else if (run.field.talk) onEvents(C.nextLine(run));
      },
    };
  }

  root.RQ.views.field = fieldView;
})(window);
