/* 外とのやり取りの差し替えの層（docs/impl-web.md）：ブラウザ版（Chrome・Edge・Android の Chrome・iPad の Bluefy）。
   Electron 版（renderer/platform/electron.js）が入っていなければ、こちらが RQ.platform になる。関数の名前と形は Electron 版と同じ。
   - 機器の選ぶ窓：ブラウザが自分で出す（自前の窓は出さない）
   - FIT・スクリーンショット：ダウンロード（ファイル名を返す）
   - ゴースト：IndexedDB（新しい30個）。共有：ブラウザからサーバーへ直接（サーバーの CORS。server/src/handler.js）。合言葉は localStorage
   - Strava：アップロードのページを開き、タイトルをクリップボードへ */
(function (root) {
  const RQ = root.RQ = root.RQ || {};
  if (RQ.platform) return;
  const z = n => String(n).padStart(2, '0');
  const stamp = (d, sec) => `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${sec ? z(d.getSeconds()) : ''}`;

  // どのブラウザか（機能の有無で分ける。2026-11-07 ユーザー判断 25a：iPad はまず Bluefy で試す）。
  //   bt：Web Bluetooth がある（パソコンの Chrome・Edge、Android の Chrome、iPad・iPhone の Bluefy）。無ければ、つなげない案内を出す
  //   ios：iPad・iPhone（iPadOS の Safari は Mac のふりをするので、指で触れる Mac も iPad とみなす）。どのブラウザも中身は WebKit
  //   bluefy：iOS で Web Bluetooth がある（＝Bluefy など）。名前（User-Agent）に Bluefy と入るかは確認できないので、機能で見る
  //   storage：localStorage が使える（設定と記録はここ。使えないと続きが残らない）
  const nav = root.navigator || {}, ua = nav.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  const storageOk = (() => { try { const k = 'rq.__probe'; root.localStorage.setItem(k, '1'); root.localStorage.removeItem(k); return true; } catch (_) { return false; } })();
  const env = { bt: !!nav.bluetooth, ios, bluefy: ios && (!!nav.bluetooth || /Bluefy/i.test(ua)), storage: storageOk, wakeLock: !!(nav.wakeLock && nav.wakeLock.request), share: !!(nav.share && nav.canShare) };

  // ファイルを渡す：ふだんはダウンロード。iPad・iPhone はダウンロードの仕組みが弱い（Bluefy で保存できるかは確認できない）ので、
  // 共有（navigator.share。「ファイルに保存」を選べる）を先に試し、使えない・断られたとき（押した直後でないと断られる）はダウンロードにする
  function download(blob, name) {
    if (env.ios && env.share) {
      let file = null; try { file = new File([blob], name, { type: blob.type || 'application/octet-stream' }); } catch (_) {}
      if (file && nav.canShare({ files: [file] })) { nav.share({ files: [file] }).catch(e => { if (!e || e.name !== 'AbortError') anchor(blob, name); }); return name; }
    }
    return anchor(blob, name);
  }
  function anchor(blob, name) {
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; a.hidden = true; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
    return name;
  }

  // ゴースト（IndexedDB）。形と上限は main/ghosts.js と同じ（3分未満・形が違うものは保存しない、400 KB まで、新しい30個）
  const KEEP = 30, MAX_BYTES = 400 * 1024;
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, ng) => {
    const r = indexedDB.open('ride-on-quest', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('ghosts', { keyPath: 'key', autoIncrement: true });
    r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error);
  }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((ok, ng) => { const t = d.transaction('ghosts', mode), st = t.objectStore('ghosts'); const out = fn(st); t.oncomplete = () => ok(out && out.result !== undefined ? out.result : out); t.onerror = () => ng(t.error); }); };
  async function saveGhost(ghost) {
    if (!ghost || ghost.v !== 1 || !Array.isArray(ghost.pts) || !Array.isArray(ghost.route) || !(ghost.sec >= 180)) return null;
    const g = { ...ghost, date: Date.now() };
    if (new Blob([JSON.stringify(g)]).size > MAX_BYTES) return null;
    await tx('readwrite', st => st.add(g));
    const all = await tx('readonly', st => st.getAll());
    const old = all.sort((a, b) => b.date - a.date).slice(KEEP);
    if (old.length) await tx('readwrite', st => old.forEach(o => st.delete(o.key)));
    return 'ghost';
  }
  async function listGhosts(netVersion) {
    const all = await tx('readonly', st => st.getAll());
    return all.sort((a, b) => b.date - a.date).slice(0, KEEP)
      .filter(g => g && g.v === 1 && g.net === String(netVersion) && Array.isArray(g.pts) && Array.isArray(g.route))
      .map(({ key, ...g }) => g);
  }

  // 共有：本体は renderer/platform/sharecore.js（Electron と同じ）。合言葉は localStorage
  const SHARE_KEYS = 'rq.shareKeys';
  let sharer = null;
  const share = () => sharer || (sharer = RQ.shareCore.create({
    store: { load: () => JSON.parse(localStorage.getItem(SHARE_KEYS)), save: o => localStorage.setItem(SHARE_KEYS, JSON.stringify(o)) },
    fetch: (...a) => root.fetch(...a),
  }));

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return; } catch (_) { /* 古いやり方で */ }
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch (_) {} t.remove();
  }

  // まとめの画面を PNG にしてダウンロード（renderer/platform/snapshot.js）
  async function saveScreenshot() {
    const el = document.querySelector('#screen .report') || document.querySelector('#screen');
    return download(await RQ.snapshot.toBlob(el), `ride-on-quest-${stamp(new Date(), true)}.png`);
  }

  // 道中の写真（2026-10-22 ユーザー要望）：今の画面（#stage：3D・走行データ・上に重なった窓）を、その場で JPEG に。
  // 3D の canvas は描いた直後でないと読めないので、app.js が時計の処理の終わりで呼ぶ（drawSync は同じ処理の中で描き終える）
  function capturePhoto() {
    // 長い辺 1920（小さい画面でも 1600 まで大きく描く。Strava のアクティビティに付ける用）
    const st = document.querySelector('#stage'), long = Math.max(1, st.scrollWidth, st.scrollHeight), to = Math.min(1920, Math.max(1600, long));
    const cv = RQ.snapshot.drawSync(st, to / long, { buttons: true });
    return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.85));
  }
  // まとめの画像（PNG）と道中の写真を、1つの zip にしてダウンロード（続けてのダウンロードを止められないように）
  const sumName = () => (RQ.i18n ? RQ.i18n.t('photo.summary') : 'まとめ');   // まとめの画像の名前（今の言語。node のテストでは表が無いので日本語）
  const safeName = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '').slice(0, 40);
  // 名前は FIT と同じ日時＋コース名（どの旅のものか分かるように）
  async function savePhotos({ photos = [], startMs, label } = {}) {
    const now = new Date(), tag = safeName(label), base = `ride-on-quest-${stamp(new Date(Number.isFinite(startMs) ? startMs : now))}${tag ? '-' + tag : ''}`;
    const files = [];
    const report = document.querySelector('#screen .report');
    if (report) files.push({ name: `${base}-${sumName()}.png`, data: new Uint8Array(await (await RQ.snapshot.toBlob(report)).arrayBuffer()) });
    for (let i = 0; i < photos.length; i++) files.push({ name: `${base}-${i + 1}.jpg`, data: new Uint8Array(await photos[i].arrayBuffer()) });
    // zip そのものの名前は英数字だけ（日本語の名前は、ブラウザによってはダウンロードの名前にならない）。中の写真には、コース名も入る
    const zip = new Blob([RQ.zip.makeZip(files, now)], { type: 'application/zip' }), name = `ride-on-quest-${stamp(new Date(Number.isFinite(startMs) ? startMs : now))}-photos.zip`;
    download(zip, name);
    return { name, count: photos.length, again: () => download(zip, name) };
  }
  // FIT・道中の写真・まとめの画像を、1つの zip にしてダウンロード（2026-10-22 ユーザー要望：「FIT とスクリーンショットは同じ ZIP に。その方が上げやすい」）。
  // fit：{ samples, ftp, name, description }（1分未満の記録なら null）。中の名前は今のまま（FIT は ride-on-quest-日時.fit、写真はコース名入り）。
  // zip の名前は英数字だけ（ride-on-quest-日時.zip）。返り値：{ name, fit（中の FIT の名前 | null）, count（写真の枚数）, again() }
  async function saveBundle({ fit = null, photos = [], startMs, label } = {}) {
    const now = new Date(), d = new Date(Number.isFinite(startMs) ? startMs : now), tag = safeName(label), base = `ride-on-quest-${stamp(d)}${tag ? '-' + tag : ''}`;
    const files = [];
    let fitName = null;
    if (fit) { fitName = `ride-on-quest-${stamp(d)}.fit`; files.push({ name: fitName, data: await RQ.fitFile.buildActivityFit(fit) }); }
    const report = document.querySelector('#screen .report');
    if (report) files.push({ name: `${base}-${sumName()}.png`, data: new Uint8Array(await (await RQ.snapshot.toBlob(report)).arrayBuffer()) });
    for (let i = 0; i < photos.length; i++) files.push({ name: `${base}-${i + 1}.jpg`, data: new Uint8Array(await photos[i].arrayBuffer()) });
    const zip = new Blob([RQ.zip.makeZip(files, now)], { type: 'application/zip' }), name = `ride-on-quest-${stamp(d)}.zip`;
    download(zip, name);
    return { name, fit: fitName, count: photos.length, files: files.map(f => f.name), again: () => download(zip, name) };
  }

  // 記録の書き出しと読み込み（renderer/platform/backup.js）：ゴースト（IndexedDB）と共有の合言葉（localStorage の rq.shareKeys）
  async function backupGet() {
    const all = await tx('readonly', st => st.getAll());
    let shareKeys = null; try { shareKeys = JSON.parse(localStorage.getItem(SHARE_KEYS)); } catch (_) {}
    return { ghosts: all.sort((a, b) => b.date - a.date).slice(0, KEEP).map(({ key, ...g }) => g), shareKeys };
  }
  async function backupSet({ ghosts = [], shareKeys = null } = {}) {
    await tx('readwrite', st => st.clear());
    const ok = ghosts.filter(g => g && g.v === 1 && Array.isArray(g.pts) && Array.isArray(g.route)).slice(0, KEEP);
    if (ok.length) await tx('readwrite', st => ok.forEach(g => st.add(g)));
    if (shareKeys && typeof shareKeys === 'object') localStorage.setItem(SHARE_KEYS, JSON.stringify(shareKeys)); else localStorage.removeItem(SHARE_KEYS);
    sharer = null;
    return true;
  }
  const saveBackup = (text, name) => download(new Blob([text], { type: 'application/json' }), name);

  RQ.platform = {
    backupGet, backupSet, saveBackup,
    kind: 'web',
    env,   // どのブラウザか（上の説明。bt・ios・bluefy・storage・wakeLock・share）
    // 広告とアフィリエイトを出してよい版か（本番のブラウザ版だけ。tools/build_web.js --prod が build-info.js に monetize: true を書く。試す人の版・手元では false）
    get monetize() { return !!(RQ.build && RQ.build.monetize); },
    capturePhoto, savePhotos, saveBundle,
    ownPicker: false, canShowFile: false,
    onBtDevices() {}, chooseBt() {}, btStart() {}, wantBt() {},
    saveScreenshot,
    showFile() {},
    async saveFit({ samples, ftp, startMs, name, description }) {
      const bytes = await RQ.fitFile.buildActivityFit({ samples, ftp, name, description });
      return download(new Blob([bytes], { type: 'application/octet-stream' }), `ride-on-quest-${stamp(new Date(startMs))}.fit`);
    },
    saveGhost, listGhosts,
    shareUpload: ({ url, ghost } = {}) => share().upload(url, ghost),
    shareFetch: ({ url, course, net, side, limit } = {}) => share().fetchGhosts(url, { course, net, side, limit: Math.max(1, Math.min(20, Number(limit) || 10)) }),
    shareFetchRace: ({ url, course, net, laps, near } = {}) => share().fetchRaces(url, { course, net, laps, near }),
    shareRevoke: ({ url } = {}) => share().revokeAll(url),
    writeStory: ({ url, facts } = {}) => share().writeStory(url, facts),
    // 月のレポート（試作）。ブラウザ版は FIT を手元に残さないので fitMonths は無い（走りの数値は localStorage か、B ならサーバー）
    writeReport: ({ url, facts } = {}) => share().writeReport(url, facts),
    ridesUpload: ({ url, owner, ride } = {}) => share().ridesUpload(url, owner, ride),
    ridesFetch: ({ url, owner, from, to } = {}) => share().ridesFetch(url, owner, from, to),
    ridesDelete: ({ url, owner } = {}) => share().ridesDelete(url, owner),   // Strava の説明文の「冒険記」（試作）。失敗は null
    copyText,
    // Strava：まずタイトルをクリップボードへ（説明は画面のボタンで）、アップロードのページを開き、まとめの画像もダウンロードする
    async stravaUpload(file, text) {
      if (typeof text === 'string') await copyText(text.split('\n')[0]);
      root.open('https://www.strava.com/upload/select', '_blank', 'noopener');
      return null;   // まとめの画像と道中の写真は、まとめを出したときの zip に入っている
    },
  };

  // 走っている間（走行データ #hud が出ている間）は画面を暗くしない（Screen Wake Lock。使えないブラウザでは何もしない。2026-11-07 25a）。
  // 画面を切り替えたり隠したりすると放されるので、見えている間に取り直す
  if (env.wakeLock) {
    let lock = null, asking = false;
    const want = () => document.visibilityState === 'visible' && !!document.querySelector('#hud:not([hidden])');
    const sync = async () => {
      if (want() && !lock && !asking) {
        asking = true;
        try { lock = await nav.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch (_) { lock = null; }
        asking = false;
      } else if (!want() && lock) { const l = lock; lock = null; l.release().catch(() => {}); }
    };
    root.setInterval(sync, 2000);
    document.addEventListener('visibilitychange', sync);
  }

  // つなげないブラウザの案内（index.html の #web-note。閉じたら、その間は出さない）
  // iOS（Safari・Bluefy の WebKit）は viewport の user-scalable を無視することがあるので、ピンチの拡大（gesturestart）と 2 回押しの拡大（dblclick）も止める（2026-11-07）
  if (env.ios && document.addEventListener) {
    document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  }
  // スマホは縦でも横でも遊べる（2026-11-07 ユーザー「縦画面でもだいたい遊べるね。好きに選択させたほうがいいかも。」。前の「横にしてください」の案内はやめた）
  if (document.addEventListener) document.addEventListener('DOMContentLoaded', () => {
    const note = document.getElementById('web-note');
    if (!note || env.bt) return;
    let closed = false; try { closed = root.sessionStorage.getItem('rq.webNoteClosed') === '1'; } catch (_) {}
    if (closed) return;
    note.hidden = false;
    // 文の中の Bluefy を App Store へのリンクに（2026-11-08 ユーザー「あとはブルーファイへのリンクも足しといて。」。RQ.ui.setLinkedText）
    const txt = document.getElementById('web-note-text'), R = root.RQ || {};
    if (txt && R.i18n && R.ui && R.ui.setLinkedText) R.ui.setLinkedText(txt, R.i18n.t('web.noBt'));
    const x = document.getElementById('web-note-x');
    if (x) x.onclick = () => { note.hidden = true; try { root.sessionStorage.setItem('rq.webNoteClosed', '1'); } catch (_) {} };
  });
})(window);
