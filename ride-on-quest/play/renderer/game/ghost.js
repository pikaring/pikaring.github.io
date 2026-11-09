/* ゴースト：道の網の上の位置の時系列（docs/impl-ghost.md）。画面にも時計にも触らない純粋な関数で、node のテストで確かめる。
   ゴースト1人 = { v: 1, net（道の網の版）, id, name, hero, kind: 'self' | 'traveller' | 'imported', course, side, sec（長さ・秒）,
                   route: [ [道の名前, 向き(+1＝a→b, -1＝b→a)], ... ],
                   pts: [ [t, i, s], ... ]（経過 t 秒に route[i] の道を進む向きに s m。道が変わる所は同じ t の2点）,
                   lead（あれば：プレイヤーより何秒先を走っているか。旅人の出し方）, born（あれば：何秒たってから現れるか） }
   時計は「旅を始めてからの経過（走っていた秒。一時停止は含まない）」でそろえる。ゴーストは触れ合わない（風よけも衝突もない）。
   パワー・心拍は持たない。 */
(function (root) {
  const RN = typeof require !== 'undefined' ? require('./roadnet.js') : root.RQ.roadnet;
  const VERSION = 1, STEP = 5;                  // pts は5秒ごと（と、道が変わる所）
  const SHOW_M = 250, NAME_M = 100;             // 絵を出す距離、名前を出す距離（緯度・経度の直線距離。ユーザー確認済み）
  const NAMES = ['ミナ', 'トール', 'リュカ', 'ノエ', 'カイ', 'ソラ', 'ハル', 'ユウ', 'レン', 'ミオ', 'タロ', 'サキ', 'ジン', 'アカリ', 'ロク', 'ヒナ', 'ダン', 'セナ', 'コウ', 'ナギ', 'テツ', 'リオ', 'モモ', 'ゴロー'];

  // 1秒ごとの記録 [{ rd（道の添え字）, rs（道の上の距離 m、a から）, rdir（向き）}, ...] から、ゴーストを作る。
  // 道が変わる所は、前の道の終わりと次の道の始まりを、同じ時刻（境目の半秒前）の2点にする
  function fromSamples(net, samples, meta = {}) {
    const route = [], pts = [], idx = new Map(), travel = (rd, rs, dir) => (dir > 0 ? rs : net.roads[rd].len - rs);
    let cur = null, last = null, sec = 0;
    samples.forEach((smp, k) => {
      if (smp.rd == null) return;
      const t = k, key = `${smp.rd}|${smp.rdir}`;
      if (key !== cur) {
        const first = !route.length;
        // 引き返し（同じ道で向きだけ変わった）：前の道の終わり・次の道の始まりは、道の端ではなく、いまの位置（同じ場所を、前の向き・新しい向きで言うだけ）。
        // 前は端（長さ・0）にしていたので、位置が飛び、共有サーバーが「速すぎる動き」（422）で断った（2026-10-24）
        const uturn = !first && last && last.rd === smp.rd;
        if (!first && last) { const lenL = net.roads[last.rd].len, tb = Math.max(0, t - 0.5); pts.push([tb, route.length - 1, +(uturn ? travel(last.rd, last.rs, last.rdir) : lenL).toFixed(1)]); }   // 前の道の終わり
        route.push([net.roads[smp.rd].name, smp.rdir]); cur = key;
        pts.push([first ? t : Math.max(0, t - 0.5), route.length - 1, first || uturn ? +travel(smp.rd, smp.rs, smp.rdir).toFixed(1) : 0]);   // 次の道の始まり
      } else if (t % STEP === 0) pts.push([t, route.length - 1, +travel(smp.rd, smp.rs, smp.rdir).toFixed(1)]);
      last = smp; sec = t;
    });
    if (last && pts.length && pts[pts.length - 1][0] < sec) pts.push([sec, route.length - 1, +travel(last.rd, last.rs, last.rdir).toFixed(1)]);
    return { v: VERSION, net: net.version, id: meta.id || `g${Date.now().toString(36)}`, name: meta.name || '旅人', hero: meta.hero || 'warrior', kind: meta.kind || 'self',
      course: meta.course || null, side: meta.side || null, sec, route, pts, born: meta.born, lead: meta.lead, date: meta.date };
  }

  // 保存した記録が、今の道の網と合うか（版が違う・道が無い記録は捨てる）
  function valid(net, g) {
    if (!g || g.v !== VERSION || g.net !== net.version || !Array.isArray(g.route) || !Array.isArray(g.pts) || g.pts.length < 2) return false;
    return g.route.every(([nm]) => net.byName.has(nm)) && g.pts.every(p => p[1] >= 0 && p[1] < g.route.length);
  }

  // サーバーから取ってきたゴースト（ほかの人の記録。docs/impl-ghost-share.md）を、使える形にする。使えなければ null。
  // 受け取ったものは信用しない：形と道の網の版を確かめ直し、名前は8文字までに切り、決まった項目だけ写し、kind は 'imported' にする
  const HEROES = ['warrior', 'wizard', 'monk', 'priest', 'valkyrie', 'elf', 'samurai', 'mercenary'];
  function fromServer(net, g) {
    if (!valid(net, g) || g.pts.length > 8000 || g.route.length > 600 || !HEROES.includes(g.hero)) return null;
    if (!g.pts.every(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) || !g.route.every(r => Array.isArray(r) && (r[1] === 1 || r[1] === -1))) return null;
    const name = [...String(g.name == null ? '' : g.name).normalize('NFKC').replace(/[\u0000-\u001f<>]/g, '').trim()].slice(0, 8).join('') || '旅人';
    return { v: VERSION, net: g.net, id: `x${String(g.id || '').slice(0, 24)}`, name, hero: g.hero, kind: 'imported', course: typeof g.course === 'string' ? g.course.slice(0, 24) : null,
      side: g.side === 'left' ? 'left' : 'right', race: g.race && Number.isInteger(g.race.laps) && Number.isFinite(g.race.time) ? { laps: g.race.laps, time: g.race.time } : undefined, sec: Number.isFinite(g.sec) ? g.sec : g.pts[g.pts.length - 1][0], route: g.route.map(r => [String(r[0]), r[1]]), pts: g.pts.map(p => [p[0], p[1], p[2]]), date: Number.isFinite(g.created) ? g.created * 1000 : undefined };
  }

  // 経過 t 秒の位置。{ road, dir, s（道の上の距離。a から）, lat, lon, ele, i（route の添え字）, done, hidden }
  // 前後の2点が同じ道の上のとき、s を直線で補間する。t が最後を超えたら done、現れる前（born）は hidden
  function positionAt(net, g, t) {
    t += g.lead || 0;
    if (g.born != null && t < g.born) return { done: false, hidden: true };
    const p = g.pts; if (t > g.sec + 1e-9 || t > p[p.length - 1][0] + 1e-9) return { done: true };
    let lo = 0, hi = p.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p[mid][0] <= t) lo = mid; else hi = mid; }
    if (t < p[0][0]) return { done: false, hidden: true };
    const a = p[lo], b = p[hi], same = a[1] === b[1], f = same && b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : (t >= b[0] ? 1 : 0);
    const pick = same || t < b[0] ? a : b, sT = same ? a[2] + (b[2] - a[2]) * f : pick[2];
    const [nm, dir] = g.route[pick[1]], road = net.roads[net.byName.get(nm)], s = dir > 0 ? sT : road.len - sT, q = RN.pointAt(road, s);
    return { done: false, hidden: false, road: road.id, dir, s: q.s, lat: q.lat, lon: q.lon, ele: q.ele, i: pick[1] };
  }

  // ゴーストが経過 t 秒までに走った距離（m）。道の列の累計 ＋ いまの道の上の距離（レースの順位に使う）。ゴール（最後の点）を過ぎたら、その距離のまま
  function progressAt(net, g, t) {
    const p = g.pts; if (!p.length) return 0;
    const cum = g._cum || (g._cum = (() => { const c = [0]; for (const [nm] of g.route) c.push(c[c.length - 1] + net.roads[net.byName.get(nm)].len); return c; })());
    t += g.lead || 0;
    if (t <= p[0][0]) return cum[p[0][1]] + p[0][2];
    if (t >= p[p.length - 1][0]) return cum[p[p.length - 1][1]] + p[p.length - 1][2];
    let lo = 0, hi = p.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p[mid][0] <= t) lo = mid; else hi = mid; }
    const a = p[lo], b = p[hi], same = a[1] === b[1], f = same && b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : (t >= b[0] ? 1 : 0);
    return same ? cum[a[1]] + a[2] + (b[2] - a[2]) * f : (t >= b[0] ? cum[b[1]] + b[2] : cum[a[1]] + a[2]);
  }

  const meters = (a, b) => Math.hypot((b.lat - a.lat) * 111320, (b.lon - a.lon) * 111320 * Math.cos(a.lat * Math.PI / 180));
  // プレイヤーとの関係：{ m（直線距離）, show, name, same（同じ道かどうか）, along（同じ道の上で前か後ろか。＋は先、道の上の距離差 m）, face（'back'＝同じ向き・'front'＝対向）}
  function relation(me, gp) {
    const m = meters(me, gp), same = me.road === gp.road;
    const along = same ? (gp.s - me.s) * (me.dir > 0 ? 1 : -1) : null;   // 私の進む向きに先なら＋
    // 同じ向きなら後ろ姿、対向なら正面。別の道のときは、向きのベクトルの内積（faceOf）で決める
    return { m, show: m <= SHOW_M, name: m <= NAME_M, same, along, face: same ? (me.dir === gp.dir ? 'back' : 'front') : null };
  }
  // 向き（進む方角）のベクトルの内積から、同じ向きか対向かを決める（別の道のとき）。ahead：ゴーストの少し先の位置
  function faceOf(me, meAhead, gp, gpAhead) {
    const v1 = [(meAhead.lon - me.lon) * Math.cos(me.lat * Math.PI / 180), meAhead.lat - me.lat], v2 = [(gpAhead.lon - gp.lon) * Math.cos(gp.lat * Math.PI / 180), gpAhead.lat - gp.lat];
    return v1[0] * v2[0] + v1[1] * v2[1] >= 0 ? 'back' : 'front';
  }

  // 画面に渡す形：経過 t 秒のゴースト全員。me：プレイヤーの位置 { lat, lon, road, dir, s }、meAhead：プレイヤーの少し先 { lat, lon }。
  // 返り値は [ { id, name, hero, kind, lat, lon, face（'back' | 'front'）, show（絵を出す）, tag（名前を出す）, m（直線距離）, map（ミニマップに点を出す） } ]
  function frame(net, ghosts, t, me, meAhead) {
    const out = [];
    for (const g of ghosts) {
      const p = positionAt(net, g, t);
      if (p.done || p.hidden) { out.push({ id: g.id, name: g.name, hero: g.hero, kind: g.kind, show: false, tag: false, map: false }); continue; }
      const rel = relation(me, p);
      const face = rel.face || faceOf(me, meAhead, p, positionAt(net, g, t + 2).lat != null ? positionAt(net, g, t + 2) : p);
      const q = positionAt(net, g, t + 1.5), hd = q.lat != null && (q.lat !== p.lat || q.lon !== p.lon) ? [(q.lon - p.lon) * 111320 * Math.cos(p.lat * Math.PI / 180), (q.lat - p.lat) * 111320] : null;   // hd：進む向き（東・北の m）。見た目の左側通行のずらしに使う
      out.push({ id: g.id, name: g.name, hero: g.hero, kind: g.kind, lat: p.lat, lon: p.lon, road: p.road, s: p.s, face, show: rel.show, tag: rel.name, m: rel.m, map: true, hd, ...(g.fade != null ? { fade: g.fade } : {}) });   // fade：出会う旅人が消える前に薄くなる（encounters.js。1 → 0）
    }
    return out;
  }

  // 3D の枠の渡し方（画面 view3d.js の assign3 が使う。2026-10-28 ユーザー判断：たくさんのゴーストとすれ違っても、近くの人だけ 3D にして負荷を低く保つ）。
  // items：[{ id, has（いま 3D を持つ）, shown（見えている）, vis3（3D にできる職業で 3D がオン）, dd（カメラからの m）, pri（先に入れる人：女王の試練のペースメーカー）}]、o：{ cap, inD, outD（inD より少し遠く）, steal }
  // pri の人は、近さより先に、ほかの人（pri でない）の枠を取ってでも入れ、枠が無ければ上限を超えて入れる（2026-11-05 ユーザー判断「1a」の差し戻し：
  // 後ろ姿の 2D の絵が無いペースメーカーは板にできず、枠から外れると消えてしまう。ペースメーカーは決して消さない）
  // → { release: [手放す id], take: 今回 3D をもらう id か null（1 回に 1 人まで） }。近い順。outD より遠い・見えない人は手放す。埋まっていたら、いちばん遠い持ち主より steal m 以上近い人に回す
  function slots3d(items, { cap, inD, outD, steal }) {
    const release = items.filter(o => o.has && (!o.shown || !o.vis3 || o.dd > outD)).map(o => o.id), rel = new Set(release);
    const want = items.filter(o => o.shown && o.vis3 && !o.has && (o.pri || o.dd < inD)).sort((a, b) => (b.pri ? 1 : 0) - (a.pri ? 1 : 0) || a.dd - b.dd)[0];
    if (!want) return { release, take: null };
    const holders = items.filter(o => o.has && !rel.has(o.id));
    if (holders.length >= cap) {
      const far = holders.filter(o => !o.pri).sort((a, b) => b.dd - a.dd)[0];   // 先に入れる人（pri）からは取らない
      if (far && (want.pri || far.dd > want.dd + steal)) release.push(far.id);
      else if (!want.pri) return { release, take: null };   // 先に入れる人は、ほかに回せる枠が無くても上限を超えて入れる（決して消さない）
    }
    return { release, take: want.id };
  }

  // 主人公を隠しているか（2026-10-28 ユーザー判断：旅のゴースト・旅人はふだん不透明。カメラと主人公のあいだに入って主人公を隠すときだけ半透明）。
  // cam・hero・g：{ x, y, z }（hero・g は体のまん中の高さ）。hw・hh：体の幅・高さの半分（m）。→ 0（隠していない）〜 1（重なっている）。
  // 画面の上で、カメラから見た左右の角度と上下の角度がどちらも重なり、主人公よりカメラ寄りにいるとき。soft：重なりの縁でなめらかに（rad）
  const BLOCK_ALPHA = 0.4;   // 隠しているときの濃さ
  function blockK(cam, hero, g, { hw = 0.45, hh = 0.9, soft = 0.06 } = {}) {
    const ramp = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    const hx = hero.x - cam.x, hz = hero.z - cam.z, gx = g.x - cam.x, gz = g.z - cam.z, Dh = Math.hypot(hx, hz), Dg = Math.hypot(gx, gz);
    if (Dh < 0.1 || Dg < 0.1) return 0;
    const kd = 1 - ramp(Dg, Dh - 0.6, Dh - 0.2);   // 主人公より手前（カメラ寄り）にいるときだけ
    if (kd <= 0) return 0;
    let dyaw = Math.atan2(gx, gz) - Math.atan2(hx, hz); dyaw = Math.abs(Math.atan2(Math.sin(dyaw), Math.cos(dyaw)));
    const dpit = Math.abs(Math.atan2(g.y - cam.y, Dg) - Math.atan2(hero.y - cam.y, Dh));
    const ly = Math.atan(hw / Dh) + Math.atan(hw / Dg), lp = Math.atan(hh / Dh) + Math.atan(hh / Dg);
    return kd * (1 - ramp(dyaw, ly, ly + soft)) * (1 - ramp(dpit, lp, lp + soft));
  }

  const api = { VERSION, SHOW_M, NAME_M, NAMES, BLOCK_ALPHA, blockK, slots3d, fromSamples, valid, fromServer, positionAt, progressAt, relation, faceOf, frame, meters };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).ghost = api;
})(typeof window !== 'undefined' ? window : globalThis);
