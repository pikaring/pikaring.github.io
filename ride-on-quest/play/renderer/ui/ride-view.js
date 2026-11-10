/* フリーライドの画面：簡易3D と、勾配・標高・ミニマップ・高低図・地名。
   速さは本物の勾配で計算する。負荷は2通りから選ぶ（2026-10-20 ユーザー判断）：
   勾配＝トレーナーに「勾配 × 効き」を送り、坂に合わせてギアを変える（Zwift の「トレーナーの難易度」と同じ考え方）。
   ERG＝FTP の何%かを目標パワーにする（旅と同じく無限のギアが自動で変わる扱い）。何%かは走行中もいつでも変えられる。
   o = { net, start（{ road, dir, s }）, name（コースの名前）, ghosts（一緒に走るゴースト。省けば出ない）, heroId, minutes, effect（0〜1）, mode（'grade' | 'erg'）, ergPct, dots（3D を描く高さ。0 ならそのまま） }、
   o.race（レース。docs/impl-race.md）= { su（RQ.race.setup の結果）, ghosts（相手の9人）, laps, countdown（秒） }：道はコースの2本に固定・矢印なし・距離で終わる・勾配のモード、
   5秒のカウントダウンのあいだは走らず（opts.onGo で記録を始める）、走っている間は順位だけを出す。opts.onEnd({ ridden, time })
   o.talkLog：道端の NPC の話の記録（npctalk.js。あれば NPC を立てる。レースでは立てない）。opts.onEnd({ ridden })、opts.onErg(pct)（変えた%を覚える）。島の道の網を走り、分かれ道ではスペースキーで曲がる向きを切り替える */
(function (root) {
  const D = root.RQ.data, RD = root.RQ.ride, TR = root.RQ.trainer, S = TR.state, U = root.RQ.ui, t = root.RQ.i18n.t, nm = root.RQ.i18n.n;
  const ERG_MIN = 40, ERG_MAX = 120, ERG_STEP = 5;   // ERG の強さ（FTP の%）

  function rideView(screen, o, opts = {}) {
    const net = o.net;
    const race = o.race, RC = root.RQ.race, ranks = race ? race.ghosts.length + 1 : 0;
    const ride = race ? RD.createRide({ net, start: race.su.start, minutes: 180, force: race.su.force, quiet: true, goal: race.su.goal }) : RD.createRide({ net, start: o.start, minutes: o.minutes, plan: o.plan });
    root.__rq.ride = ride;   // テスト用
    U.setBg(null);
    screen.innerHTML = `
      <div class="ride">
        <div class="ride3d"></div>
        <div class="win plate rplate">
          <div class="name"><span>${o.name}</span><span class="sub">${D.WORLD.island}・${race ? t('ride.raceLaps', { laps: race.laps }) : t('out.ride')}</span></div>
          <div class="sub r-dist"></div><div class="r-togo" hidden></div><div class="progress"><i></i></div>
        </div>
        <canvas class="minimap"></canvas>
        <canvas class="profile"></canvas>
        <div class="place"></div>
        <div class="win ergbox" hidden><button class="erg-dn">◀</button><div class="erg-v"><span class="k">ERG</span><b class="ep"></b><small>%</small><b class="ew"></b><small>W</small></div><button class="erg-up">▶</button></div>
        <div class="countdown" hidden></div>
        <div class="idle" hidden>ペダルを回すと進みます</div>
        <div class="win talk" hidden><img class="talk-face" alt=""><img class="talk-hero" alt="" hidden><div class="who"></div><div class="text"></div></div>
      </div>`;
    const q = s => screen.querySelector(s);
    let v3 = null;
    try { v3 = root.RQ.view3d.create(q('.ride3d'), { net, heroId: o.heroId, dots: o.dots }); }
    catch (e) { console.warn('3D を作れなかった', e); q('.ride3d').classList.add('no3d'); U.setBg('islandMap'); }

    let gframe = [];
    // 道端の NPC（2026-10-22 ユーザー判断：フリーライドでも立てる。島と物語の話だけ、5分に1人。docs/npc-talks.md §2.2）。
    // 話す NPC_LEAD_SEC 秒前に道の先に立ち、横を通ったら（通らなければ NPC_WAIT_SEC 秒後に）黒い窓で話す。1行 TALK_LINE_SEC 秒、Enter で次へ。o.talkLog が無ければ出さない
    RD.setTunnels(ride, net);   // トンネルの中では矢印を出さない（view3d が net.placed を置いたあと）
    const NT = root.RQ.npcTalk, TK = root.RQ.talks, side = !race && o.talkLog && root.RQ.roadside ? root.RQ.roadside.create({ net, ride, v3 }) : null;
    let freeN = 0, storyDone = false, soon = null, talk = null, stopType = null;
    const face = q('.talk-face'), heroFace = q('.talk-hero');
    if (o.heroId) U.setSprite(heroFace, o.heroId, 'front', 0, 0.9);
    function showLine() {
      const [who, text] = talk.x.lines[talk.line], name = who === 'npc' ? root.RQ.i18n.cap((TK.NPCS[talk.x.char] || { n: '' }).n) : who === 'hero' && o.heroId ? D.HEROES[o.heroId].n : '';
      q('.talk .who').textContent = name; q('.talk .who').hidden = !name;
      if (stopType) stopType();
      // スマホの縦では話の窓を 3 行までずつ、次の窓に送る（2026-11-09 試走 指摘 7・判断 67A。U.talkPages。窓 1 つにつき TALK_LINE_SEC 秒）
      talk.pages = U.talkPages(q('.talk .text'), who === 'sys' ? text : t('talk.quote', { text }));
      stopType = U.typeText(q('.talk .text'), talk.pages[Math.min(talk.page || 0, talk.pages.length - 1)]);
      q('.talk').className = 'win talk by-' + who;
      heroFace.hidden = who !== 'hero'; face.classList.toggle('quiet', who !== 'npc');
    }
    function nextLine() {
      if (!talk) return;
      if ((talk.page || 0) < (talk.pages || [0]).length - 1) { talk.page = (talk.page || 0) + 1; talk.t = 0; showLine(); return; }
      talk.page = 0;
      if (talk.line < talk.x.lines.length - 1) { talk.line++; talk.t = 0; showLine(); return; }
      talk = null; q('.talk').hidden = true; heroFace.hidden = true;
    }
    function talkTick(dt) {
      if (!side) return;
      side.tick(v);
      const t = ride.clock;
      if (talk) { if ((talk.t += dt) >= TK.TALK_LINE_SEC) nextLine(); return; }
      if (!soon && t >= NT.freeAt(freeN) - TK.NPC_LEAD_SEC) {
        const kind = NT.freeKind(freeN, storyDone), at = NT.freeAt(freeN), ctx = { tags: side.where(), log: o.talkLog, area: RD.areaAt(net, ride) };   // 今いる所の地域の村人だけ（2026-10-28 ユーザー判断）
        const x = NT.pick(kind, ctx) || (kind === 'story' ? NT.pick('island', ctx) : null);
        freeN++;
        if (x) { NT.remember(o.talkLog, x); if (x.kind === 'story') storyDone = true; soon = { x, at }; side.place(x.char, Math.max(1, at - t), v); }
      }
      if (soon && (side.reached() || t >= soon.at + TK.NPC_WAIT_SEC)) {
        talk = { x: soon.x, line: 0, t: 0 }; soon = null;
        q('.talk').hidden = false; face.hidden = false; U.setSprite(face, talk.x.char, 'front', 0, 0.9);
        showLine();
      }
    }
    const drawMini = U.minimap(q('.minimap'), net, () => { const i = RD.info(ride); const ra = race ? null : RD.routeAhead(ride); return ra ? { lat: i.lat, lon: i.lon, route: ra.now, route2: ra.next, ghosts: gframe.filter(g => g.map) } : { lat: i.lat, lon: i.lon, route: RD.preview(ride, 1500, 40).map(p => [p[0], p[1]]), ghosts: gframe.filter(g => g.map) }; }, race ? { crop: [...race.su.force] } : {});   // レースは、コースの輪がいっぱいに入る範囲へ拡大（旅・フリーライドは島の全体）
    const turn = U.turnArrows(q('.ride'));
    // 高低図：これから走る道（何もしなかった場合）の2 km ぶんの標高。左の端が今の位置
    const pf = q('.profile'), AHEAD = 2000;
    function drawProfile() {
      const w = pf.clientWidth, h = pf.clientHeight; if (!w) return;
      if (pf.width !== w) { pf.width = w; pf.height = h; }
      const g = pf.getContext('2d'), pts = RD.preview(ride, AHEAD, 20), zs = pts.map(p => p[2]);
      const lo = Math.min(...zs), hi = Math.max(...zs), span = Math.max(30, hi - lo);   // 低い所を下に、30 m 以上の幅で
      const x = d => d / AHEAD * w, y = e => h - 4 - (e - lo) / span * (h - 14);
      g.clearRect(0, 0, w, h);
      g.beginPath(); g.moveTo(0, h);
      pts.forEach(p => g.lineTo(x(p[3]), y(p[2]))); g.lineTo(x(pts[pts.length - 1][3]), h); g.closePath();
      g.fillStyle = 'rgba(192,138,80,0.55)'; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(2, 0); g.lineTo(2, h); g.stroke();
    }

    // ERG の強さ（FTP の%）。画面の ◀ ▶ か、キーの ← → で 5% ずつ変える
    let erg = o.mode === 'erg';
    let pct = Math.max(ERG_MIN, Math.min(ERG_MAX, o.ergPct || 65));
    const showErg = () => { q('.erg-v .ep').textContent = pct; q('.erg-v .ew').textContent = Math.round(U.ftp() * pct / 100); };   // 見た目は HUD の項目と同じ（2026-10-24 ユーザー判断「ERG は HUD に合わせる」）
    const stepErg = d => { const n = Math.max(ERG_MIN, Math.min(ERG_MAX, pct + d * ERG_STEP)); if (n === pct) return; pct = n; showErg(); opts.onErg && opts.onErg(pct); };
    if (erg) { q('.ergbox').hidden = false; showErg(); q('.erg-dn').onclick = () => stepErg(-1); q('.erg-up').onclick = () => stepErg(1); }

    let rank = ranks, v = 0, still = 0, placeT = 0, mapT = 0, ended = false, hold = race ? race.countdown : 0, shownN = -1, overtime = 0;   // overtime：時間を走りきったあと、続けている（元の時間の秒）
    if (race) { q('.rplate .progress').hidden = true; q('.r-dist').classList.add('r-rank'); q('.r-togo').hidden = false; }
    // レース：残りの周回と距離（最後の1周は「最終周」）。周は、1周の長さ（su.loopLen）で数える
    const togo = () => { const left = Math.max(0, race.su.goal - ride.ridden), n = Math.min(race.laps, Math.max(1, Math.ceil(left / race.su.loopLen - 1e-9))), km = RQ.units.dist(left / 1000); q('.r-togo').textContent = t(n <= 1 ? 'race.final' : 'race.togo', { n, km }); };
    const place = name => { q('.place').textContent = `〜 ${name === '江良岳' ? `${nm('江良岳')} ── ${D.WORLD.castle}` : root.RQ.i18n.cap(nm(name))} 〜`; q('.place').classList.add('on'); placeT = 4; };
    if (!race) place(net.roads[ride.road].name);

    // レース：スタートの前の数え（走らない。ゴーストも動かない）
    function countdown(dt) {
      const before = hold; hold = Math.max(0, hold - dt);
      const n = Math.ceil(hold), cd = q('.countdown');
      if (n !== shownN) { shownN = n; cd.hidden = false; cd.textContent = n > 0 ? String(n) : 'スタート！'; cd.classList.remove('pop'); void cd.offsetWidth; cd.classList.add('pop'); }
      if (before > 0 && hold === 0) { opts.onGo && opts.onGo(); setTimeout(() => { cd.hidden = true; }, 900); }
    }

    function tick(dt) {
      if (ended) return;
      if (race && hold > 0) {
        countdown(dt); TR.setGrade(0); v = 0;
        gframe = root.RQ.ghost.frame(net, race.ghosts, 0, RD.info(ride), RD.ahead(ride, 15));
        if (v3) { v3.update(ride, 0, false, S.cad); if (v3.updateGhosts) v3.updateGhosts(gframe, 0, { spread: 20 }); }
        q('.r-dist').textContent = t('ride.beforeStart', { n: ranks }); togo();
        return;
      }
      const info = RD.info(ride), mass = U.massKg();
      // 速さは本物の勾配で（1回で大きく進む早送りのときは細かく分ける）
      for (let k = Math.ceil(dt / 0.05), h = dt / k; k > 0; k--) v = Math.min(RD.MAX_SPEED, root.RQ.phys.physStep(v, S.power, info.grade, mass, h));
      if (S.power > 0) v = Math.max(v, root.RQ.data.TUNE.minKmh / 3.6);   // 漕いでいる間は、急な坂でも最低 1 km/h（data.js の TUNE.minKmh）
      if (erg) U.load({ erg: Math.round(U.ftp() * pct / 100) }, dt); else TR.setGrade(info.grade * o.effect);
      const moving = S.power >= 10 || S.cad >= 20;
      for (const e of RD.step(ride, dt, v)) {
        if (e.type === 'place' || (e.type === 'road' && e.show !== false)) { if (!race) place(e.name); }
        else if (e.type === 'finish') {
          // フリーライドで時間を走りきった：止めずに走り続け、「これで終わる／続けて走る」を選んでもらう（opts.onTimeUp。2026-10-22 ユーザー要望）
          if (!race && opts.onTimeUp && !overtime) { overtime = ride.total; ride.total = Infinity; ride.done = false; opts.onTimeUp(); continue; }
          ended = true; TR.setGrade(0); opts.onEnd && opts.onEnd({ ridden: ride.ridden, time: e.time }); return;
        }
      }
      if (v3) v3.update(ride, dt, moving, S.cad, v);   // v：速さ（m/s。主人公の歩き・走りの切り替え）
      talkTick(dt);
      if (race) {   // レースの相手（同じ時計で）。順位だけを出す
        const me = RD.info(ride);
        gframe = root.RQ.ghost.frame(net, race.ghosts, ride.clock, me, RD.ahead(ride, 15));
        if (v3 && v3.updateGhosts) v3.updateGhosts(gframe, ride.clock, { spread: 20 });   // スタートは9人を道幅の中でずらして並べ、20秒かけて左側通行の位置へ（見た目だけ）
        rank = RC.rankNow(net, race.ghosts, ride.clock, ride.ridden, race.su.goal);
      } else if (o.ghosts) {   // 旅人は出会う形で出す（encounters）。それ以外は記録どおり
        if (o.encounters) o.encounters.tick(ride.clock, ride, S.power);   // ゴースト：同じ時計（走り始めてからの経過。ride.clock）で、全員の位置を出す
        const me = RD.info(ride), ah = RD.ahead(ride, 15);
        gframe = root.RQ.ghost.frame(net, o.ghosts, ride.clock, me, ah);
        if (v3 && v3.updateGhosts) v3.updateGhosts(gframe, ride.clock);
      }
      // 表示（勾配・標高・速さは走行データの表示に出す）
      if (race) { q('.r-dist').textContent = t('race.rankOf', { rank, total: ranks }); togo(); }
      else {
        q('.r-dist').textContent = `${t('ride.ridden', { km: RQ.units.dist(ride.ridden / 1000, 2) })}　${nm(net.roads[ride.road].name)}　${overtime ? t('ride.over', { t: U.mmss(ride.clock - overtime) }) : t('ride.left', { t: U.mmss(ride.total - ride.clock) })}`;
        q('.rplate .progress > i').style.width = `${overtime ? 100 : ride.clock / ride.total * 100}%`;
      }
      turn.update(!race && ride.approached && !RD.inTunnel(ride) ? RD.choice(ride) : null);
      still = moving ? 0 : still + dt; q('.idle').hidden = still < 3;
      if (placeT > 0 && (placeT -= dt) <= 0) q('.place').classList.remove('on');
      if ((mapT -= dt) <= 0) { mapT = 0.25; drawMini(); drawProfile(); }
    }

    return {
      kind: 'ride',
      tick,
      holding: () => hold > 0,   // レースのカウントダウン中（記録は始めない）
      rankNow: () => (race ? rank : null),   // テスト用
      raceGoal: () => (race ? race.su.goal : null),
      key(e) {
        if (e.key === 'Enter' && talk) { if (!(stopType && stopType())) nextLine(); e.preventDefault(); return; }   // 会話：出している途中なら全部出し、出しきっていれば次の行へ
        if (!erg) return; if (e.key === 'ArrowRight' || e.key === 'ArrowUp') stepErg(1); else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') stepErg(-1); else return; e.preventDefault(); },
      ergPct: () => (erg ? pct : null),   // テスト用
      // 走りきったあと続けるとき（2026-10-22）：ERG／勾配を選び直す
      setMode(m, p) { erg = m === 'erg'; if (p) pct = Math.max(ERG_MIN, Math.min(ERG_MAX, p)); q('.ergbox').hidden = !erg; if (erg) { showErg(); q('.erg-dn').onclick = () => stepErg(-1); q('.erg-up').onclick = () => stepErg(1); } },
      // 走っている途中でコースを替える（2026-11-07）：新しいコースの始めへ。走った距離・時間・ERG はそのまま。前のコースのゴーストは外す
      jump(start, plan, name) {
        if (race) return false;
        RD.relocate(ride, start, plan); if (side) side.clear();
        if (o.ghosts && o.ghosts.length) { o.ghosts = []; gframe = []; if (v3 && v3.updateGhosts) v3.updateGhosts([], ride.clock); }
        if (v3 && v3.jump) v3.jump();
        if (name) q('.rplate .name span').textContent = name;
        place(net.roads[ride.road].name);
        return true;
      },
      position() { const i = RD.info(ride); return { road: i.road, s: i.s, dir: i.dir }; },   // 今いる所と向き（B：その場から旅に出る）
      // 1秒ごとの記録に足すもの（位置・標高・速さ、ラップの区切り）
      hudInfo() { const i = RD.info(ride); return { ele: i.ele, grade: i.grade, v }; },
      halt() { v = 0; },   // 自動の一時停止：止まったら速さ 0   // 走行データの表示
      toggleTurn: () => { if (!race) RD.toggle(ride); },
      // 今来た道を引き返す（レースは不可）。world.js と同じ
      canReverse: () => RD.canReverse(ride), reverseWait: () => RD.reverseWait(ride),
      reverse: () => { if (!RD.reverse(ride)) return false; v = RD.speedAfterReverse(v); if (side) side.clear(); if (v3 && v3.uturn) v3.uturn(); return true; },
      ghostsNow: () => gframe, ghostList: race ? race.ghosts : o.ghosts,   // テスト用
      extras() { const i = RD.info(ride); return { lat: i.lat, lon: i.lon, alt: Math.round(i.ele * 10) / 10, v, lapKey: 'ride', road: i.road, s: Math.round(i.s), dir: i.dir }; },
      dispose() { ended = true; turn.dispose(); if (v3) v3.dispose(); },
    };
  }

  root.RQ.views.ride = rideView;
})(window);
