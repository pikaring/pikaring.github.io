/* 画面で共通に使う小物（素材の場所、ドット絵、1字ずつ出す文字、ポップ数字、演出、設定の読み出し）。 */
(function (root) {
  const A = '../assets/';
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const ICON = { e: A + 'icon/ui_emblem.webp' };   // 会心の紋章（戦闘のドラム）
  // 'islandMap'：タイトル（挑戦者を選ぶ画面）の背景。Gemini のドット絵の島の地図（assets/title/island_map.jpg。2026-10-23 ユーザー判断）。
  // 見せ方は CSS の #screen.title-map（画面いっぱい・島が真ん中）
  const setBg = name => {
    const s = $('#screen'), map = name === 'islandMap';
    s.classList.toggle('title-map', map);
    s.style.backgroundImage = map ? '' : 'none';   // ほかの名前は黒地（トリスケリオンの背景の絵は 2026-10-23 に消した）
  };
  const ftp = () => Math.max(50, +$('#ftp').value || 150);
  // 画面の重さ（設定）。「軽い」は、タブレットなどで 3D を軽くする（docs/impl-web.md §5。view3d.js が読む）
  const light = () => !!$('#gfx') && $('#gfx').value === 'light';
  const difficulty = () => $('#difficulty').value || 'normal';
  // トレーナーに負荷を頼む（旅では、いつも ERG。トレーニング中はギアを一切変えなくてよい）。want：{ erg: 目標パワー W }。
  // 急に変わらないよう、1秒に ERG_RATE W まで寄せる（マイクロバーストの15秒の切り替えにも追いつく速さ）
  // 回転が落ちて止まりかけたら負荷を抜き、戻ったら数秒かけて目標へ（スパイラル対策。renderer/game/ergguard.js）。勾配のときは効かせない
  const ERG_RATE = 80;
  const guard = root.RQ.ergGuard.create();
  let wasErg = false;
  // ERG のオン・オフ（2026-11-07 ユーザー判断「ギアを使いたい人もいるからERGのオンオフを切り替えできるようにしたい」）：
  // オフの間は、ERG を頼まれても、フリーライドの勾配と同じに、地形の勾配 ×「効き」を送る（パワーはギアと回転で出す）。ergguard は通さない。
  // 戻したら、抜いた所から ERG へ戻す（ergguard の resume）。mode は app.js が setLoadMode で渡す（on・grade・effect の関数）
  let mode = { on: () => true, grade: () => 0, effect: () => 0.5 };
  const setLoadMode = m => { mode = { ...mode, ...m }; };
  const ergOn = () => !!mode.on();
  function load(want, dt) {
    const TR = root.RQ.trainer;
    if (want.erg != null && !ergOn()) {
      wasErg = true; TR.state.ergWant = null;   // 戻したときに resume する（下）。HUD は勾配を出す
      const g = Number(mode.grade()) || 0, k = Number(mode.effect());
      TR.setGrade(g * (Number.isFinite(k) ? k : 0.5));
      return;
    }
    if (want.erg != null) {
      if (TR.state.erg == null && wasErg) root.RQ.ergGuard.resume(guard);   // 一時停止・ERG オフなどで勾配を送っていたら、抜いた所から戻す
      wasErg = true; TR.state.ergWant = want.erg;   // 頼まれた目標（HUD で、下げている・抜いているのを見分ける）
      TR.setTargetPower(root.RQ.ergGuard.step(guard, want.erg, TR.state.cad, dt, ERG_RATE));
    } else { wasErg = false; TR.state.ergWant = null; TR.setGrade(want.grade || 0); }
  }
  const mmss = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  // ドット絵を img に出す（renderer/ui/sprites.js）。unit：絵の1ドットの高さ（画面の高さの %、cqh）。大きな敵は scale で大きく
  function setSprite(img, id, view = 'front', frame = 0, unit) {
    const s = root.RQ.sprites.get(id, view, frame);
    if (img.getAttribute('src') !== s.url) img.src = s.url;
    img.classList.add('pixel');
    if (unit) img.style.height = `${(s.h * unit * s.scale).toFixed(2)}cqh`;
    return s;
  }

  // 島の地図のドット絵（assets/map/island_map.png、2476×2052。tools/build_map_code.py が島の標高・features・landmarks から作る。道は描かず、道の網の線を画面で引く）。
  // 格子 (r, c) → 地図の px は x = c×8＋4、y = r×8＋4（assets/map/island_map.json の k・off）
  const MAP_IMG = A + 'map/island_map.png', MAP_K = 8, MAP_OFF = 4, MAP_W = 2476, MAP_H = 2052;
  let mapImg = null;
  let mapT0 = 0, mapTries = 0;
  // 読み込みが 10 秒たっても終わらない（止まったまま）ときは、読み込み直す（2 回まで。大きな絵をくり返し読み直さない）
  const mapImage = () => {
    if (mapImg && !(mapImg.complete && mapImg.naturalWidth) && mapT0 && mapTries < 2 && Date.now() - mapT0 > 10000) { mapImg = null; mapTries++; }
    if (!mapImg) { mapImg = new Image(); mapT0 = Date.now(); mapImg.src = MAP_IMG; }
    return mapImg;
  };
  // 緯度・経度 → 地図の px
  function mapXY(lat, lon) {
    const isl = root.RQ.mapData.island;
    const c = (lon - isl.lon0) / (isl.lon1 - isl.lon0) * (isl.cols - 1), r = (isl.lat0 - lat) / (isl.lat0 - isl.lat1) * (isl.rows - 1);
    return [c * MAP_K + MAP_OFF, r * MAP_K + MAP_OFF];
  }
  // 地図を canvas いっぱいに描き、道の網の線を重ねる（w・h は描く大きさ。省けば画面での大きさ）。
  // hi：目立たせる道の添え字の列（選んだコース）。地図がまだ読めていなければ、読めたら描き直して onLoad を呼ぶ。返り値は描けたか。
  // view：{ x, y, w, h }（地図の px）。あれば、その範囲だけを canvas いっぱいに切り出す（ミニマップのレース用。拡大するのでドットをぼかさない）。
  // bold：ミニマップ用。道の網の線を、黒いふちつきの濃い白にして、小さくてもはっきり見えるようにする
  function drawMap(cv, net, { hi = null, w = cv.clientWidth, h = cv.clientHeight, lineW = 3, view = null, bold = false, onLoad } = {}) {
    if (!w) return false;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const g = cv.getContext('2d'), im = mapImage(), v = view || { x: 0, y: 0, w: MAP_W, h: MAP_H }, sc = view ? Math.min(w / v.w, h / v.h) : Math.min(w / MAP_W, h / MAP_H);
    g.clearRect(0, 0, w, h);
    if (!im.complete || !im.naturalWidth) { im.addEventListener('load', () => { drawMap(cv, net, { hi, w, h, lineW, view, bold }); if (onLoad) onLoad(); }, { once: true }); return false; }
    // 縮めて描くときは、細かい点がちらつかないようにならす。拡大に近いときは、ドットをぼかさない
    g.imageSmoothingEnabled = sc < 0.8; g.imageSmoothingQuality = 'high';
    g.drawImage(im, v.x, v.y, v.w, v.h, 0, 0, v.w * sc, v.h * sc);
    if (net) {
      const pt = p => { const [x, y] = mapXY(p[0], p[1]); return [(x - v.x) * sc, (y - v.y) * sc]; };
      const line = (road, color, lw) => {
        g.strokeStyle = color; g.lineWidth = lw; g.lineJoin = 'round'; g.beginPath();
        road.points.forEach((p, i) => { const [x, y] = pt(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke();
      };
      const set = hi ? new Set(hi) : null;
      if (bold) { for (const r of net.roads) line(r, 'rgba(0,0,0,0.55)', lineW * 1.3 + 2); for (const r of net.roads) line(r, 'rgba(255,255,255,0.95)', lineW * 1.3); }
      else for (const r of net.roads) if (!set || !set.has(r.id)) line(r, set ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.6)', Math.max(1, lineW * 0.5));
      g.shadowColor = '#000'; g.shadowBlur = 3;
      // 選んだ道：黒いふちを付けた赤で、海岸の黄色い道と見分けやすく
      if (set) { for (const id of set) line(net.roads[id], '#000', lineW + 4); g.shadowBlur = 0; for (const id of set) line(net.roads[id], '#ff4a3a', lineW); }
      g.shadowBlur = 0;
    }
    return true;
  }

  // 島のミニマップ。島の地図のドット絵に道の網を重ね、呼ぶたびに今の位置の点と、これから走る道（何もしなかった場合）を描く。
  // here()：{ lat, lon, route: [[緯度, 経度], ...]（省けます）, ghosts: [{ lat, lon, kind }]（省けます） }
  // opts.crop：道の添え字の列。あれば、その道の範囲（と少しの余白）を、ミニマップいっぱいに拡大して出す（レース。範囲は決まった物で、主人公を追わない）
  function minimap(mm, net, here, opts = {}) {
    const base = document.createElement('canvas');
    let bw = 0, view = null;   // 地図を描いたときの幅と、切り出す範囲
    const cropView = (w, h) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const id of opts.crop) for (const p of net.roads[id].points) { const [x, y] = mapXY(p[0], p[1]); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ar = w / h;
      let vw = Math.max(x1 - x0, (y1 - y0) * ar) * 1.18 + 44, vh = vw / ar;   // 余白つき。ミニマップと同じ縦横比
      vw = Math.min(vw, MAP_W); vh = vw / ar; if (vh > MAP_H) { vh = MAP_H; vw = vh * ar; }
      return { x: Math.max(0, Math.min(MAP_W - vw, cx - vw / 2)), y: Math.max(0, Math.min(MAP_H - vh, cy - vh / 2)), w: vw, h: vh };
    };
    return function draw() {
      const w = mm.clientWidth, h = mm.clientHeight; if (!w) return;
      if (opts.crop && (!view || bw !== w)) view = cropView(w, h);
      if (bw !== w && drawMap(base, net, { w, h, lineW: Math.max(1.5, w / 120), view, bold: true })) bw = w;   // 地図と線は大きさが変わったときだけ描き直す
      if (mm.width !== w) { mm.width = w; mm.height = h; }
      const c = mm.getContext('2d'), sc = view ? Math.min(w / view.w, h / view.h) : Math.min(w / MAP_W, h / MAP_H), vx = view ? view.x : 0, vy = view ? view.y : 0, p = here();
      const at = (lat, lon) => { const [x, y] = mapXY(lat, lon); return [(x - vx) * sc, (y - vy) * sc]; };
      c.clearRect(0, 0, w, h); c.drawImage(base, 0, 0);
      if (p.route && p.route.length > 1) {
        c.strokeStyle = '#6fe0ff'; c.lineWidth = Math.max(2, w / 90); c.lineJoin = 'round'; c.shadowColor = '#000'; c.shadowBlur = 3; c.beginPath();
        p.route.forEach((q, i) => { const [x, y] = at(q[0], q[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); });
        c.stroke(); c.shadowBlur = 0;
      }
      if (p.route2 && p.route2.length > 1) {   // 選んでいる側の、次の道（進む道の色。スペースですぐ入れ替わる）
        c.strokeStyle = '#ffc531'; c.lineWidth = Math.max(2.6, w / 70); c.lineJoin = 'round'; c.shadowColor = '#000'; c.shadowBlur = 3; c.beginPath();
        p.route2.forEach((q, i) => { const [x, y] = at(q[0], q[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); });
        c.stroke(); c.shadowBlur = 0;
      }
      for (const g of p.ghosts || []) {   // ゴースト：自分の記録は明るい色、旅人は薄い色
        const [gx, gy] = at(g.lat, g.lon);
        c.fillStyle = g.kind === 'self' ? '#ffd84a' : 'rgba(255,255,255,0.55)'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(gx, gy, Math.max(2.5, w / 70), 0, Math.PI * 2); c.fill(); c.stroke();
      }
      const [x, y] = at(p.lat, p.lon);
      c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, Math.max(4, w / 40), 0, Math.PI * 2); c.fill(); c.stroke();
    };
  }

  // 文字を1字ずつ出す（会話の窓）。返り値の関数を呼ぶと残りを一度に出し、まだ出している途中だったら true を返す
  function typeText(node, text, cps = 28) {
    const start = performance.now();   // 時計が遅れても追いつくよう、経った時間から字数を決める
    let timer = null;
    const done = () => { const busy = !!timer; if (timer) clearInterval(timer); timer = null; node.textContent = text; return busy; };
    node.textContent = '';
    timer = setInterval(() => {
      if (!node.isConnected) return done();
      const i = Math.floor((performance.now() - start) / 1000 * cps);
      if (i > node.textContent.length && /\S/.test(text.slice(node.textContent.length, i)) && root.RQ.sfx) root.RQ.sfx.play('type');   // 1字ずつの音（設定で止められる）
      node.textContent = text.slice(0, i);
      if (i >= text.length) done();
    }, 1000 / cps);
    return done;
  }

  function popAt(screen, target, text, cls) {
    const r = target.getBoundingClientRect(), sr = screen.getBoundingClientRect();
    const p = el('div', 'pop ' + (cls || '')); p.textContent = text;
    p.style.left = `${r.left - sr.left + r.width / 2 - 20}px`; p.style.top = `${r.top - sr.top + r.height * 0.25}px`;
    screen.appendChild(p); setTimeout(() => p.remove(), 1000);
  }

  // 文の中の名前を外のページへのリンクにして入れる（2026-11-08 ユーザー「あとはブルーファイへのリンクも足しといて。」）。
  // Bluefy は App Store のページ（2026-11-08 に開いて確かめた：PNN SOFT の「Bluefy – Web BLE Browser」）。新しいタブで開く。
  // 同じ文なら作り直さない（押している間に作り直してリンクが消えないように）
  const LINKS = { Bluefy: 'https://apps.apple.com/app/id1492822055' };
  const LINK_RE = new RegExp('(' + Object.keys(LINKS).join('|') + ')');
  const setLinkedText = (node, text) => {
    if (!node || node._linkedText === text) return;
    node._linkedText = text; node.textContent = '';
    for (const part of String(text).split(LINK_RE)) {
      if (!part) continue;
      if (LINKS[part]) { const a = document.createElement('a'); a.href = LINKS[part]; a.target = '_blank'; a.rel = 'noopener'; a.textContent = part; node.appendChild(a); }
      else node.appendChild(document.createTextNode(part));
    }
  };
  root.RQ.ui = { LINKS, setLinkedText, mapImage, A, $, el, pick, ICON, setSprite, typeText, minimap, drawMap, mapXY, setBg, ftp, light, difficulty, load, setLoadMode, ergOn, mmss, popAt };
})(window);
