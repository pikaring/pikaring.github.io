/* 島の道の網を走る（旅もフリーライドも共通）。画面にもトレーナーにも触らない。
   いまの道（net.roads の添え字）・進む向き（+1＝a→b、−1＝b→a）・道の上の距離 s（a から、m）で位置を持つ。
   道の端（分かれ道）に着くと、来た道を除く2本（左・右）のどちらかへ進む。何もしないときの向きは決まりで選ぶ（下の defaultTurn）。
   手前では「approach」を知らせ、スペースキー（toggle）で反対側へ切り替えられる。道の網は renderer/game/roadnet.js。 */
(function (root) {
  const RN = typeof require !== 'undefined' ? require('./roadnet.js') : root.RQ.roadnet;
  const GRADE_SPAN = 20;   // 勾配はこの距離（m）の前後の標高差から出す
  const MAX_SPEED = 100 / 3.6;   // 物理と関係のない安全の上限（データの乱れ・暴走よけ）。以前は 50 km/h（細い道なのでブレーキ）だったが、実際の下りの速さ（−15% で 80〜90 km/h）を出すため外した（2026-10-25 ユーザー判断）
  const APPROACH_SEC = 15, APPROACH_MIN = 120, APPROACH_MAX = 300;   // 矢印を出す手前：いまの速さで約15秒（120〜300 m）
  const REVERSE_WAIT = 5;   // 引き返したあと、この秒数は引き返せない（間違って2回押して元に戻らないように）
  const QUIET_SEC = 3;     // 曲がった直後（道が短いとき）は、3秒たってから次の矢印を出す
  const WARM_SEC = 600, STEEP = 12;   // 旅のはじめの10分は、きつい道（最大12%超）を避ける

  const pointAt = RN.pointAt;
  // 進む向きの勾配（0.05 = 5%）
  function gradeAt(road, s, dir) {
    const span = Math.min(GRADE_SPAN, road.len / 2);
    const a = pointAt(road, s - span), b = pointAt(road, s + span);
    return dir * (b.ele - a.ele) / ((b.s - a.s) || 1);
  }

  // start：{ road, dir, s }（roadnet.courseStart か positionNear の結果）。force：道の添え字の集まり。あれば、分かれ道ではその道だけを進む
  // （女王の試練は、島一周の道だけを走る）。quiet：true なら矢印（approach）を出さない
  // tie：同じ回数の道が2本のとき、左右を決める関数 (ride) → 'left' | 'right'（省けば交互。旅人が別々の道を選ぶのに使う）
  // goal：走った距離（m）がこれに達したら終わる（レース。時間ではなく距離で終わる。finish の time はゴールした時刻（秒。1歩の中を補間））
  function createRide({ net, start, minutes = 60, force = null, quiet = false, tie = null, goal = null, plan = null }) {
    const road = net.roads[start.road], dir = start.dir || 1;
    const ride = { net, road: start.road, dir, s: start.s != null ? start.s : (dir > 0 ? 0 : road.len), total: minutes * 60, clock: 0, ridden: 0, done: false,
      visits: new Array(net.roads.length).fill(0), lastTurn: 'right', tie, flip: false, approached: false, sinceTurn: 99, sinceReverse: 99, force, quiet, goal, finishTime: null, turns: 0, cache: new Map(),
      plan: plan && plan.seq.length ? { seq: plan.seq, loop: !!plan.loop, idx: new Map(plan.seq.map((x, i) => [skey(x.road, x.dir), i])) } : null };
    ride.visits[start.road] = 1;
    return ride;
  }

  const skey = (road, dir) => road * 2 + (dir > 0 ? 1 : 0);
  const outsAt = (ride, road, dir) => { const k = road * 2 + (dir > 0 ? 1 : 0); let o = ride.cache.get(k); if (!o) ride.cache.set(k, o = RN.outgoing(ride.net, road, dir)); return o; };
  // コースの道に戻るまでの距離（m）。道を向きごとに状態にして、分かれ道ごとの左右へたどる（コースの道に着いたら 0）
  function distToPlan(ride, st) {
    const key = skey(st.road, st.dir), memo = ride.cache.get('d' + key);
    if (memo != null) return memo;
    const net = ride.net, best = new Map([[key, 0]]), todo = [st];
    let found = Infinity;
    if (ride.plan.idx.has(key)) found = 0;
    for (let g = 0; found === Infinity && todo.length && g < 200; g++) {
      todo.sort((a, b) => best.get(skey(a.road, a.dir)) - best.get(skey(b.road, b.dir)));
      const cur = todo.shift(), c = best.get(skey(cur.road, cur.dir)) + net.roads[cur.road].len, o = RN.outgoing(net, cur.road, cur.dir);
      for (const nx of [o.left, o.right]) {
        const k = skey(nx.road, nx.dir);
        if (ride.plan.idx.has(k)) { found = Math.min(found, c); continue; }
        if (!best.has(k) || best.get(k) > c) { best.set(k, c); todo.push(nx); }
      }
    }
    ride.cache.set('d' + key, found);
    return found;
  }
  // コースが決まっているとき（ride.plan）の向き：コースの道の上なら、コースのつぎの道。外れたら、コースの道へ早く戻れるほう。
  // 決められなければ null
  function planTurn(ride, outs) {
    const P = ride.plan, iL = P.idx.get(skey(outs.left.road, outs.left.dir)), iR = P.idx.get(skey(outs.right.road, outs.right.dir)), iIn = P.idx.get(skey(outs.inRoad, outs.inDir));
    if (iIn != null) {
      const nx = iIn + 1 < P.seq.length ? iIn + 1 : (P.loop ? 0 : -1);
      return nx >= 0 && iL === nx ? 'left' : nx >= 0 && iR === nx ? 'right' : null;
    }
    const dl = distToPlan(ride, outs.left), dr = distToPlan(ride, outs.right);
    return dl === dr ? null : dl < dr ? 'left' : 'right';
  }
  // 何もしないときの向き：コースがあれば、コースどおり（planTurn）。なければ（旅の続き・自由に走る）：
  // まだ通っていない道（通った回数が少ない道）を優先。同じなら左右を交互に（同じ入力なら同じ結果）。
  // 旅のはじめの10分は、きつい道（最大12%超）を避ける
  function defaultTurn(ride, outs) {
    if (ride.plan) { const t = planTurn(ride, outs); if (t) return t; }
    const L = outs.left, R = outs.right, gl = ride.net.roads[L.road].maxGrade, gr = ride.net.roads[R.road].maxGrade;
    if (ride.clock < WARM_SEC && (gl > STEEP) !== (gr > STEEP)) return gl > STEEP ? 'right' : 'left';
    const vl = ride.visits[L.road], vr = ride.visits[R.road];
    if (vl !== vr) return vl < vr ? 'left' : 'right';
    return ride.tie ? ride.tie(ride) : (ride.lastTurn === 'left' ? 'right' : 'left');
  }
  // 次の分かれ道で曲がる向き（切り替えを含む）
  function turnNow(ride, outs = outsAt(ride, ride.road, ride.dir)) {
    if (ride.force) {
      const l = ride.force.has(outs.left.road), r = ride.force.has(outs.right.road);
      if (l !== r) return l ? 'left' : 'right';
    }
    const d = defaultTurn(ride, outs);
    return ride.flip ? (d === 'left' ? 'right' : 'left') : d;
  }
  // 矢印に出すこと：{ left, right, def（何もしないときの向き）, turn（いまの向き）, remain（分かれ道までの m） }
  function choice(ride) {
    const outs = outsAt(ride, ride.road, ride.dir), road = ride.net.roads[ride.road];
    return { left: outs.left, right: outs.right, def: defaultTurn(ride, outs), turn: turnNow(ride, outs), remain: ride.dir > 0 ? road.len - ride.s : ride.s };
  }
  // 今来た道を引き返す（2026-10-23 ユーザー要望）：その場で向きを反対にする。位置・距離はそのまま（速さは speedAfterReverse で落とす。下）。コースが決まっている走り（force・goal）と、直後（REVERSE_WAIT 秒）は引き返せない（false）。
  // 引き返したあとの矢印は、今の向きでふつうに出る（3 秒たってから）。何もしない向きは defaultTurn（コースの道に戻れるほう）
  const canReverse = ride => !ride.done && !ride.force && !ride.goal;
  const reverseWait = ride => Math.max(0, REVERSE_WAIT - ride.sinceReverse);
  function reverse(ride) {
    if (!canReverse(ride) || ride.sinceReverse < REVERSE_WAIT) return false;
    ride.dir = -ride.dir; ride.flip = false; ride.approached = false; ride.sinceTurn = QUIET_SEC; ride.sinceReverse = 0;   // 矢印は、分かれ道の手前の窓に入っていれば、すぐ出す（引き返した所が分かれ道の近くでも、矢印を飛ばさない）
    return true;
  }
  // 引き返したあとの速さ（2026-10-28 ユーザー指示：下り坂で押すと、下りの速さのまま向きだけ変わり、猛スピードで坂を登った）。
  // その場で止まって向きを変え、漕ぎ出す感じ：時速 REVERSE_KMH（今の速さがそれより遅ければそのまま）に落とし、そこから今の物理（パワーと勾配）で加速する。
  // 速さを持っているのは画面の側（world.js・ride-view.js の v）なので、reverse が true を返したら、そこで v = speedAfterReverse(v)
  const REVERSE_KMH = 8;
  const speedAfterReverse = v => Math.min(v, REVERSE_KMH / 3.6);
  const toggle = ride => { if (!ride.force) ride.flip = !ride.flip; return ride.flip; };

  // トンネルの中では矢印を出さない（2026-10-23 ユーザー判断：トンネルに入ってから分かれ道になるように見えるため）。出口で出る（出口は分かれ道の約 110〜130 m 手前）。
  // spans：ランドマークのトンネルの区間 [{ road, sa, sb }]（net.placed の span。view3d が置いたあとに setTunnels で渡す）
  const inTunnel = ride => (ride.quietSpans || []).some(sp => sp.road === ride.road && ride.s >= sp.sa && ride.s <= sp.sb);
  // この道の、これから通る（または中にいる）トンネルの区間が、分かれ道までの間にあるか（2026-10-24：入り口でも矢印が出て、中で消えて、出口で出る、をやめる。トンネルを出るまで矢印は出さない）
  const tunnelBlock = ride => (ride.quietSpans || []).some(sp => sp.road === ride.road && (ride.dir > 0 ? ride.s <= sp.sb : ride.s >= sp.sa));
  const setTunnels = (ride, net) => { ride.quietSpans = (net.placed || []).filter(p => p.kind === 'tunnel' && p.span).map(p => p.span); };

  // 地名の範囲（roadnet の places の s0〜s1）。いまの位置がどの地名の中か（重なれば、道の上でいちばん近い点 at が、いまの位置に近いほう）
  // いまいる地名の範囲がまだ続くなら、それを保つ（重なった所で、2 つの地名が交互に出ないように）
  const zoneAt = (road, s, cur) => { let best = null; for (const p of road.places) if (!p.hidden && p.s0 != null && s >= p.s0 && s <= p.s1) { if (p.name === cur) return cur; if (!best || Math.abs(s - p.at) < Math.abs(s - best.at)) best = p; } return best ? best.name : null; };
  // 境を越えたら、これから入る場所の名前を出す（進む向きで決まる）。地名の範囲を出た時は、まだ出していない道の名前を出す（place として）。
  // 'road' の知らせは道が変わるたびに必ず出す。名前を画面に出すのは show が false でない時だけ（分かれ道が地名の範囲の中なら、範囲を出た時に出す）
  function zoneStep(ride, ev) {
    const z = zoneAt(ride.net.roads[ride.road], ride.s, ride.zone);
    if (!z && ride.zone) ride.zoneLeft = { name: ride.zone, at: ride.ridden };
    const back = z && ride.zoneLeft && ride.zoneLeft.name === z && ride.ridden - ride.zoneLeft.at < 200;   // 出てすぐ同じ地名に戻った（分かれ道のそば）は出し直さない
    if (z && z !== ride.zone && !back) ev.push({ type: 'place', name: z });
    else if (!z && ride.pendingRoad) ev.push({ type: 'place', name: ride.pendingRoad, road: true });
    if (!z) ride.pendingRoad = null;
    ride.zone = z;
  }

  // dt 秒、速さ v（m/s）で進める。起きたことを返す：place・road（道が変わった）・junction・approach・finish
  function step(ride, dt, v) {
    const ev = [], net = ride.net;
    if (ride.done) return ev;
    ride.clock += dt; ride.sinceTurn += dt; ride.sinceReverse += dt;
    let ds = Math.min(MAX_SPEED, Math.max(0, v)) * dt; const step0 = ds, ridden0 = ride.ridden; ride.ridden += ds;
    for (let guard = 0; ds > 1e-9 && guard < 60; guard++) {
      const road = net.roads[ride.road], remain = ride.dir > 0 ? road.len - ride.s : ride.s, move = Math.min(ds, remain);
      const to = ride.s + ride.dir * move;
      ds -= move;
      if (move < remain - 1e-9) { ride.s = to; zoneStep(ride, ev); break; }
      ride.s = ride.dir > 0 ? road.len : 0; zoneStep(ride, ev);
      // 分かれ道に着いた
      const outs = outsAt(ride, ride.road, ride.dir), turn = turnNow(ride, outs), nx = outs[turn];
      ev.push({ type: 'junction', turn, from: ride.road, to: nx.road, node: nx.from, name: nx.name });
      ride.road = nx.road; ride.dir = nx.dir; ride.s = nx.dir > 0 ? 0 : net.roads[nx.road].len;
      ride.visits[nx.road]++; ride.lastTurn = turn; ride.flip = false; ride.approached = false; ride.sinceTurn = 0; ride.turns++;
      // 道の名前は、地名の範囲の外で出す。分かれ道が町の中なら、町を出た時に出す（2026-10-28 試走の指摘 9：町に入る直前に「海岸」、出る時に町の名が出ていた）
      const ze = []; ride.pendingRoad = nx.name; zoneStep(ride, ze);
      ev.push({ type: 'road', name: nx.name, show: !ride.zone }); for (const e of ze) if (e.name !== nx.name) ev.push(e);
    }
    if (!ride.approached && !ride.quiet && ride.sinceTurn >= QUIET_SEC && !tunnelBlock(ride)) {
      const road = net.roads[ride.road], remain = ride.dir > 0 ? road.len - ride.s : ride.s;
      if (remain <= Math.max(APPROACH_MIN, Math.min(APPROACH_MAX, Math.max(v, 3) * APPROACH_SEC))) { ride.approached = true; ev.push({ type: 'approach', ...choice(ride) }); }
    }
    if (ride.goal && ride.ridden >= ride.goal) {   // ゴール：その歩の中で、距離が goal に達した時刻
      const f = step0 > 0 ? Math.max(0, Math.min(1, (ride.goal - ridden0) / step0)) : 1;
      ride.done = true; ride.finishTime = ride.clock - dt + f * dt; ev.push({ type: 'finish', time: ride.finishTime, goal: true });
    } else if (ride.clock >= ride.total) { ride.done = true; ev.push({ type: 'finish' }); }
    return ev;
  }

  function info(ride) {
    const road = ride.net.roads[ride.road], p = pointAt(road, ride.s);
    return { ...p, grade: gradeAt(road, ride.s, ride.dir), s: ride.s, dir: ride.dir, road: ride.road, roadName: road.name };
  }

  // いまいる所の「敵の出る場所」：'coast'（海に近い低い所）・'forest'（森・山腹）・'summit'（火口・鬼王の城の近く、高い所）。data.js の AREAS と同じ名前（2026-10-25 ユーザー判断）。
  // ride：createRide の結果、または { road, s }。ctx：{ isl（island.json。標高の格子）, places（地名の格子の位置）}。省けば、画面では RQ.mapData から取る。
  // どちらも無いとき（標高の格子がない）は、道の点の高さ（0.2 倍に縮めたもの）を 5 倍して本物の標高にして、標高だけで決める。決め方は game/area.js の enemyAreaOf
  function areaAt(net, ride, ctx = {}) {
    const AR = typeof require !== 'undefined' ? require('./area.js') : root.RQ.area, md = root.RQ && root.RQ.mapData;
    const isl = ctx.isl || (md && md.island) || null, places = ctx.places || (md && md.places) || null;
    const road = net.roads[ride.road], p = pointAt(road, ride.s);
    return isl && isl.elev ? AR.enemyAreaAt(isl, p.lat, p.lon, places) : AR.enemyAreaOf(p.ele / 0.2);
  }

  // 進む道の上の、いまから d m 先の位置（分かれ道では、いまの向きで曲がる。そのあとは、何もしないときの向き）
  function walk(ride, d, fn) {
    const net = ride.net; let road = ride.road, dir = ride.dir, s = ride.s, first = true, walked = 0;
    for (let guard = 0; guard < 40; guard++) {
      const r = net.roads[road], remain = dir > 0 ? r.len - s : s;
      if (fn && fn(r, s, dir, walked, Math.min(d - walked, remain)) === false) return;
      if (d - walked <= remain) return pointAt(r, s + dir * (d - walked));
      walked += remain;
      const outs = first ? outsAt(ride, road, dir) : RN.outgoing(net, road, dir);
      const turn = first ? turnNow(ride, outs) : defaultTurn(ride, outs), nx = outs[turn]; first = false;
      road = nx.road; dir = nx.dir; s = dir > 0 ? 0 : net.roads[road].len;
    }
    const r = net.roads[road]; return pointAt(r, s);
  }
  const ahead = (ride, d) => walk(ride, d);
  // いまから d m 先（d < 0 なら後ろ）の道の上の位置 { road, dir, s }（dir は、いまと同じ向きで走るときの向き）。
  // 分かれ道は、先ならいまの向きで曲がり、そのあとと後ろは何もしないときの向き（旅人の出し方に使う）
  function stateAt(ride, d) {
    const net = ride.net, back = d < 0, want = Math.abs(d);
    let road = ride.road, dir = back ? -ride.dir : ride.dir, s = ride.s, first = !back, walked = 0;
    for (let guard = 0; guard < 60; guard++) {
      const r = net.roads[road], remain = dir > 0 ? r.len - s : s;
      if (want - walked <= remain) { s += dir * (want - walked); break; }
      walked += remain;
      const outs = first ? outsAt(ride, road, dir) : RN.outgoing(net, road, dir);
      const turn = first ? turnNow(ride, outs) : defaultTurn(ride, outs), nx = outs[turn]; first = false;
      road = nx.road; dir = nx.dir; s = dir > 0 ? 0 : net.roads[road].len;
    }
    return { road, dir: back ? -dir : dir, s };
  }
  // これから走る道（何もしなかった場合）の点 [緯度, 経度, 標高 m, 距離 m]。高低図に使う
  function preview(ride, dist = 2000, stepM = 20) {
    const pts = [], net = ride.net;
    walk(ride, dist, (r, s, dir, walked, len) => {
      for (let t = 0; t <= len + 1e-6; t += stepM) { const p = pointAt(r, s + dir * Math.min(t, len)); pts.push([p.lat, p.lon, p.ele, walked + Math.min(t, len)]); }
    });
    return pts;
  }

  // ミニマップに塗る道（2026-10-24 ユーザー要望：矢印が出るずっと前から、進む向きが見える）：now＝いる所から今の道の終わり（次の分かれ道）まで、next＝いま選んでいる側の道を、その次の分かれ道まで。
  // 選ばない側は含めない。スペース（toggle）で next がすぐ入れ替わる。点は [緯度, 経度]、stepM ごと
  function routeAhead(ride, stepM = 20) {
    const net = ride.net, road = net.roads[ride.road], now = [], next = [];
    const line = (r, from, to, out) => { const n = Math.max(1, Math.ceil(Math.abs(to - from) / stepM)); for (let k = 0; k <= n; k++) { const p = pointAt(r, from + (to - from) * k / n); out.push([p.lat, p.lon]); } };
    line(road, ride.s, ride.dir > 0 ? road.len : 0, now);
    const outs = outsAt(ride, ride.road, ride.dir), nx = outs[turnNow(ride, outs)], nr = net.roads[nx.road];
    line(nr, nx.dir > 0 ? 0 : nr.len, nx.dir > 0 ? nr.len : 0, next);
    return { now, next, turn: turnNow(ride, outs) };
  }

  // 走っている途中でコースを替える（2026-11-07 ユーザー「コース選択は右上のマップをタップしたらいつでも切り替えられるようにして」）：
  // 新しいコースの始めの場所と道順（plan）へ移す。時計・走った距離・時間・終わりの印・レースの決まり（force・goal）・トンネルの印は、そのまま
  function relocate(ride, start, plan = null) {
    const fresh = createRide({ net: ride.net, start, plan });
    for (const k of ['road', 'dir', 's', 'visits', 'lastTurn', 'flip', 'approached', 'sinceTurn', 'sinceReverse', 'plan']) ride[k] = fresh[k];
    ride.pendingRoad = null; ride.zone = null; ride.zoneLeft = null;   // 地名の出し方は、新しい場所から
    return ride;
  }

  const api = { MAX_SPEED, areaAt, pointAt, gradeAt, createRide, relocate, step, info, choice, toggle, reverse, canReverse, reverseWait, REVERSE_KMH, speedAfterReverse, setTunnels, inTunnel, tunnelBlock, routeAhead, ahead, stateAt, preview, defaultTurn, turnNow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).ride = api;
})(typeof window !== 'undefined' ? window : globalThis);
