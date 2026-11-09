/* 旅（クエスト）と女王の試練の3D の世界。島の道の網を、その時のパワーで決まる速さで進み続ける。
   フィールドでも戦闘中でも動き続け、画面（フィールド・戦闘）はこの上の層（layer）に重ねる。
   分かれ道の手前には左右の矢印が出る（RQ.ride の approach）。スペースキーで曲がる向きが入れ替わる（toggleTurn）。
   RQ.world.create(screen, { net, start, heroId, dots, force, quiet, ghosts, plan }) → { layer, tick(dt), grade(), extras(kind), toggleTurn(), dispose() }。
   start：{ road, dir, s }（RQ.roadnet.courseStart / positionNear）。force・quiet：試練（島一周の道だけを走り、矢印は出さない）。
   道端の NPC：placeNpc(char, sec)・npcReached()・clearNpc()・whereTags()（フィールドの会話の相手を道のふちに立たせる。field-view.js が使う）。
   ghosts：一緒に走るゴースト（RQ.travellers.pickGhosts。省けば出ない）。時計は旅を始めてからの経過（tick の dt を足す。一時停止中は進まない）。 */
(function (root) {
  const RD = root.RQ.ride, TR = root.RQ.trainer, S = TR.state, U = root.RQ.ui;

  function create(screen, { net, start, heroId, dots = 0, force = null, quiet = false, ghosts = [], encounters = null, pace = null, plan = null }) {
    let ghostsNow = ghosts;   // 一緒に走るゴースト（コースを替えたら外す：前のコースの記録なので）
    screen.innerHTML = `
      <div class="world3d"></div>
      <div class="world-place"></div>
      <canvas class="minimap world-map"></canvas>
      <div class="win pacer-talk" hidden><img class="pt-face" alt=""><div><div class="pt-who"></div><div class="pt-text"></div></div></div>
      <div class="layer"></div>`;
    const q = s => screen.querySelector(s);
    const ride = RD.createRide({ net, start, minutes: 24 * 60, force, quiet, plan });   // 旅の終わりは旅の側で決める。道は走り続けられる
    root.__rq.worldRide = ride;   // テスト用
    let v3 = null;
    try { v3 = root.RQ.view3d.create(q('.world3d'), { net, heroId, dots }); }
    catch (e) { console.warn('3D を作れなかった', e); }
    root.__rq.worldV3 = v3;   // テスト用
    RD.setTunnels(ride, net);   // トンネルの中では矢印を出さない（view3d が net.placed を置いたあと）
    const pm = pace && root.RQ.pacemaker ? root.RQ.pacemaker.create({ net, seed: (Date.now() % 2147483647) | 0, self: heroId }) : null;   // 女王の試練のペースメーカー（pace() が { target, level, done } を返す）
    // ペースメーカーが並ぶときのひとこと：黒い窓・顔・1字ずつ。走りながら読める短さで、数秒で自動で閉じる
    let ptStop = null, ptT = 0;
    function pacerSay(e) {
      const box = q('.pacer-talk'); box.hidden = false;
      U.setSprite(q('.pt-face'), e.hero, 'front', 0, 0.9); q('.pt-who').textContent = e.name;
      if (ptStop) ptStop(); ptStop = U.typeText(q('.pt-text'), root.RQ.i18n.t('talk.quote', { text: e.line })); ptT = 7;
    }
    const turn = U.turnArrows(screen);
    let v = 0, placeT = 0, mapT = 0, inBattle = false, clock = 0, gframe = [];
    // 旅はいつも ERG。坂は本当の勾配のまま、そのパワーで進む（2026-10-20 ユーザー判断：無限にあるギアが自動で変わり、
    // そのパワーと回転数で坂を登っていることにする。回転数は速さに関係しない）
    const gradeNow = () => RD.info(ride).grade;
    // 右上に島の現在地と、これから走る道（何もしなかった場合）
    const drawMini = U.minimap(q('.world-map'), net, () => { const i = RD.info(ride); const ra = ride.force ? null : RD.routeAhead(ride); return ra ? { lat: i.lat, lon: i.lon, route: ra.now, route2: ra.next, ghosts: gframe.filter(g => g.map) } : { lat: i.lat, lon: i.lon, route: RD.preview(ride, 1500, 40).map(p => [p[0], p[1]]), ghosts: gframe.filter(g => g.map) }; });
    // 戦闘中は場所の名前を出さない（敵の絵に重なるため）
    const place = name => { if (inBattle) return; q('.world-place').textContent = `〜 ${root.RQ.i18n.cap(root.RQ.i18n.n(name))} 〜`; q('.world-place').classList.add('on'); placeT = 4; };
    place(net.roads[ride.road].name);

    // 道端の NPC（2026-10-22 ユーザー要望。roadside.js）：会話の少し前に、道の先のふちに立たせる
    const side = root.RQ.roadside.create({ net, ride, v3 });
    root.__rq.placeNpc = (char, sec) => side.place(char, sec, 5);   // テスト用：道端に立たせる（'camp' で野営地のテント）

    function tick(dt) {
      const g = gradeNow(), mass = U.massKg();
      // 速さはパワーと坂から（1回で大きく進む早送りのときは細かく分ける）
      for (let k = Math.ceil(dt / 0.05), h = dt / k; k > 0; k--) v = Math.min(RD.MAX_SPEED, root.RQ.phys.physStep(v, S.power, g, mass, h));
      if (S.power > 0) v = Math.max(v, root.RQ.data.TUNE.minKmh / 3.6);   // 漕いでいる間は、急な坂でも最低 1 km/h（data.js の TUNE.minKmh）
      for (const e of RD.step(ride, dt, v)) if (e.type === 'place' || (e.type === 'road' && e.show !== false)) place(e.name);
      const moving = S.power >= 10 || S.cad >= 20;
      if (v3) v3.update(ride, dt, moving, S.cad, v);   // v：速さ（m/s。主人公の歩き・走りの切り替え）
      clock += dt;
      if (encounters) encounters.tick(clock, ride, S.power, { hold: inBattle });   // 旅人は、見える範囲で出会うように出す
      if (pm) { for (const e of pm.tick(dt, ride, v, pace(), mass)) if (e.type === 'arrive') pacerSay(e); }   // 女王が降りてきて並ぶあいだは、試練の画面の上の女王（絵と窓）を消す
      if (ghostsNow.length || pm) {   // ゴースト：同じ時計（旅を始めてからの経過）で、全員の位置を出す。試練のペースメーカーは、ゴーストの形で足す
        const me = RD.info(ride), ah = RD.ahead(ride, 15);
        gframe = ghostsNow.length ? root.RQ.ghost.frame(net, ghostsNow, clock, me, ah) : [];
        if (pm) gframe = gframe.concat(pm.frames(me));
        if (v3 && v3.updateGhosts) v3.updateGhosts(inBattle ? gframe.map(g => ({ ...g, show: false })) : gframe, clock);
      }
      side.tick(v);   // 道端の NPC：横を通ったか。通り過ぎて離れたら片づける
      turn.update(ride.approached && !RD.inTunnel(ride) ? RD.choice(ride) : null);
      if (ptT > 0 && (ptT -= dt) <= 0) q('.pacer-talk').hidden = true;
      if (placeT > 0 && (placeT -= dt) <= 0) q('.world-place').classList.remove('on');
      if ((mapT -= dt) <= 0) { mapT = 0.25; drawMini(); }
    }

    return {
      layer: q('.layer'),
      tick,
      grade: gradeNow,   // 勾配で送るときに使う
      toggleTurn: () => RD.toggle(ride),
      // 今来た道を引き返す（2026-10-23 ユーザー要望）。canReverse：引き返せる走りか（試練・レースは不可）。reverseWait：押せるまでの秒数。道端の NPC は片づけ、カメラはなめらかに回る
      canReverse: () => RD.canReverse(ride), reverseWait: () => RD.reverseWait(ride),
      reverse: () => { if (!RD.reverse(ride)) return false; v = RD.speedAfterReverse(v); side.clear(); if (v3 && v3.uturn) v3.uturn(); return true; },
      ghostsNow: () => gframe, ghostList: ghosts,   // テスト用
      // 道端の NPC：placeNpc(話す人, 何秒先か)・npcReached()（立たせていなければ undefined＝会話は決まった時刻に）・clearNpc()
      placeNpc: (char, sec) => { if (!inBattle) side.place(char, sec, v); else side.clear(); }, clearNpc: side.clear, npcReached: side.reached, npcNow: side.now, whereTags: side.where,
      setBattle: on => {   // 戦闘中は主人公を隠して前に寄り、場所の名前をすぐ消す。道端の NPC も片づける
        inBattle = on; if (v3) v3.setBattle(on); if (on) side.clear();
        q('.world-place').classList.toggle('hide', on); if (on) { q('.world-place').classList.remove('on'); placeT = 0; }
      },
      hudInfo() { const i = RD.info(ride); return { ele: i.ele, grade: gradeNow(), v }; },
      // 走っている途中でコースを替える（2026-11-07。右上の地図を押す。app.js の openCourseSwitch）：新しいコースの始めへ移る。時計・速さはそのまま。
      // 前のコースのゴーストは外し、道端の NPC は片づけ、カメラはすぐ新しい場所へ
      jump(start, plan) {
        RD.relocate(ride, start, plan); side.clear();
        if (ghostsNow.length) { ghostsNow = []; gframe = []; if (v3 && v3.updateGhosts) v3.updateGhosts([], clock); }
        if (v3 && v3.jump) v3.jump();
        place(net.roads[ride.road].name); mapT = 0;
      },
      halt() { v = 0; },   // 自動の一時停止：止まったら速さ 0   // 走行データの表示
      // 1秒ごとの記録に足すもの（位置・標高・速さ、ラップの区切り）
      extras(kind) { const i = RD.info(ride); return { lat: i.lat, lon: i.lon, alt: Math.round(i.ele * 10) / 10, v, lapKey: kind || 'field', road: i.road, s: Math.round(i.s), dir: i.dir }; },
      dispose() { turn.dispose(); if (v3) v3.dispose(); v3 = null; },
    };
  }

  root.RQ.world = { create };
})(window);
