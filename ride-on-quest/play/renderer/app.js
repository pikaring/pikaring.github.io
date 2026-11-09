/* 画面の組み立て：上の帯（接続・パワー・回転数）、挑戦者と時間を選ぶ、女王の試練（FTP テスト）、
   その日の旅（フィールドと戦闘）、島のフリーライド、まとめ、設定。 */
(function () {
  const TR = RQ.trainer, S = TR.state, D = RQ.data, C = RQ.course, U = RQ.ui, $ = U.$, el = U.el;
  window.__rq = { timeScale: 1 };   // テスト用（timeScale で時計を速める）
  // 島の道の網（分かれ道でつながった道。renderer/game/roadnet.js）。旅・フリーライド・試練はこの上を走る
  const net = RQ.net = RQ.roadnet.build(RQ.mapData.roads, RQ.mapData.island, RQ.mapData.places);

  /* ---------- 設定と記録（このPCだけに覚える。読めなくても既定値で動く） ---------- */
  // 言語（renderer/i18n。2026-10-23 ユーザー判断）：保存した言語で画面の文字を入れ替える。まだ選んでいなければ、最初の起動で1回だけ言語の窓を出す
  // （選んでおくのは OS の言語。選んだら保存して、画面を読み込み直す）
  const I18N = RQ.i18n, t = I18N.t;
  I18N.apply(document); document.title = t('app.title'); if (!I18N.saved(localStorage)) langPick();
  function langPick() {
    const box = document.querySelector('#lang-pick'), bs = [...box.querySelectorAll('[data-lang]')];
    let pick = I18N.lang;
    const sync = () => bs.forEach(b => b.classList.toggle('on', b.dataset.lang === pick));
    bs.forEach(b => { b.onclick = () => { pick = b.dataset.lang; sync(); }; });
    sync(); box.hidden = false;
    document.querySelector('#lang-ok').onclick = () => { I18N.save(localStorage, pick); location.reload(); };
  }
  const BADGE_KEY = 'rq.badges', SETTINGS_KEY = 'rq.settings', RECORD_KEY = 'rq.records', FTP_KEY = 'rq.ftp', PLAYER_KEY = 'rq.player', HEROES_KEY = 'rq.heroes';
  // キャラクター（職業）ごとの進み具合（レベル・その日に走った分など。course.js の prog）
  const heroProg = id => ({ ...C.newProg(), ...(loadJSON(HEROES_KEY, {})[id] || {}) });
  const saveHeroProg = (id, p) => { const all = loadJSON(HEROES_KEY, {}); all[id] = p; saveJSON(HEROES_KEY, all); };
  // 3D のドット感：画面の重さが「軽い」なら、いつも「強め」（高さ360ドットで描いて拡大。描く点が少なくて軽い）
  const dotsNow = () => settings.gfx === 'light' ? 360 : settings.dots;
  const toBoss = p => Math.max(0, Math.ceil((C.DAY_SEC - C.BOSS_BEFORE) / 60 - p.min));   // 次のボスまでの分
  const loadJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (_) { return d; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const settings = Object.assign({ hero3d: true, minutes: 60, difficulty: 'normal', effect: 50, dots: 540, rideHero: 'warrior', rideMode: 'grade', ergPct: 65, ergOn: true, courseId: 'around', playerName: '', weekGoal: 'c4', photos: true, gfx: (RQ.platform.kind === 'web' && matchMedia('(pointer: coarse)').matches) ? 'light' : 'normal', shareUrl: RQ.shareCfg.DEFAULT_URL, shareAuto: true, reportMode: 'local', bgmVol: 70, sfxVol: 80, sfxType: true, sfxCue: true }, RQ.scenes.soundSettings(loadJSON(SETTINGS_KEY, {})));   // 音：前のミュートは BGM・効果音のオフに読み替える
  if (RQ.shareCfg.migrate(settings)) saveJSON(SETTINGS_KEY, settings);   // ゴースト共有の既定値（最初の起動で1回だけ。docs/impl-ghost-share.md）
  // 単位（2026-10-24 ユーザー判断）：設定で選んでいなければ言語で決める（日本語＝km、英語＝mi）。中の値は SI のまま。体重も中では kg
  // 体重（2026-10-24 ユーザー判断：本人の体重だけを入れてもらい、速さの計算には自転車と装備の分 BIKE_KG を足す。W/kg は本人の体重で割る）。
  // 前の settings.mass（人と自転車の合計）は BIKE_KG を引いて読み替える。同じ日に一度あった「自転車の重さ」（settings.bike）は捨てる
  const BIKE_KG = 10;
  if (settings.rider == null) settings.rider = settings.mass ? Math.max(25, Math.round((settings.mass - BIKE_KG) * 10) / 10) : 75;
  delete settings.mass; delete settings.bike;
  const unitsNow = () => RQ.units.set(settings.units || RQ.units.defaultFor(RQ.i18n.lang));
  function showUnits() {
    const imp = RQ.units.get() === 'imperial', m = $('#mass');
    m.min = imp ? 55 : 25; m.max = imp ? 330 : 150; m.value = RQ.units.massV(settings.rider);
    $('#mass-u').textContent = RQ.units.massU(); $('#m-speed-u').textContent = RQ.units.speedU(); $('#units').value = RQ.units.get();
  }
  unitsNow(); showUnits();
  RQ.ui.massKg = () => (settings.rider || 75) + BIKE_KG;   // 人と自転車の重さ（kg）。物理の計算に使う
  RQ.ui.riderKg = () => settings.rider || 75;   // 人の体重（kg）。W/kg に使う
  if (settings.ftp) $('#ftp').value = settings.ftp;
  $('#hr-max').value = settings.hrMax || 185;   // 最大心拍数（心拍のゾーン。2026-10-24）
  $('#difficulty').value = settings.difficulty;
  $('#week-goal').value = settings.weekGoal;
  $('#gfx').value = settings.gfx;
  $('#photos').checked = settings.photos !== false;
  $('#player-name').value = settings.playerName;
  $('#share-url').value = settings.shareUrl; $('#share-auto').checked = settings.shareAuto !== false;
  $('#effect').value = settings.effect; $('#effect-v').textContent = settings.effect + ' %';
  $('#erg-on').checked = settings.ergOn !== false;
  $('#dots').value = settings.dots;
  $('#bgm-vol').value = settings.bgmVol; $('#bgm-vol-v').textContent = settings.bgmVol + ' %';
  $('#sfx-vol').value = settings.sfxVol; $('#sfx-vol-v').textContent = settings.sfxVol + ' %';
  $('#bgm-on').checked = settings.bgmOn; $('#sfx-on').checked = settings.sfxOn; $('#bgm-vol').disabled = !settings.bgmOn; $('#sfx-vol').disabled = !settings.sfxOn;
  $('#sfx-type').checked = !!settings.sfxType; $('#sfx-cue').checked = !!settings.sfxCue;
  RQ.music.setVolumes(settings); RQ.sfx.setOptions(settings);   // 音（renderer/audio/）：BGM と効果音の音量は別々。会話の音と合図は別に止められる。保存は rq.settings
  if (!D.HEROES[settings.rideHero]) settings.rideHero = D.HERO_ORDER[0];   // 職業を変える前の設定
  function saveSettings() {
    Object.assign(settings, { ftp: +$('#ftp').value, hrMax: +$('#hr-max').value || 185, difficulty: $('#difficulty').value, weekGoal: $('#week-goal').value, gfx: $('#gfx').value, photos: $('#photos').checked, effect: +$('#effect').value, dots: +$('#dots').value, playerName: $('#player-name').value.trim().slice(0, 8), shareUrl: $('#share-url').value.trim(), shareAuto: $('#share-auto').checked, reportMode: $('#report-mode').value === 'server' ? 'server' : 'local',
      bgmVol: +$('#bgm-vol').value, sfxVol: +$('#sfx-vol').value, bgmOn: $('#bgm-on').checked, sfxOn: $('#sfx-on').checked, sfxType: $('#sfx-type').checked, sfxCue: $('#sfx-cue').checked, ergOn: $('#erg-on').checked });
    saveJSON(SETTINGS_KEY, settings);
    RQ.music.setVolumes(settings); RQ.sfx.setOptions(settings);
  }
  $('#report-mode').value = settings.reportMode === 'server' ? 'server' : 'local';
  $('#report-mode').onchange = $('#share-url').onchange = $('#share-auto').onchange = $('#player-name').onchange = $('#week-goal').onchange = $('#gfx').onchange = $('#photos').onchange = $('#hr-max').onchange = $('#ftp').onchange = $('#difficulty').onchange = $('#effect').onchange = $('#dots').onchange = $('#bgm-vol').onchange = $('#sfx-vol').onchange = $('#bgm-on').onchange = $('#sfx-on').onchange = $('#sfx-type').onchange = $('#sfx-cue').onchange = saveSettings;
  $('#erg-on').onchange = () => { saveSettings(); TR.note('ergMode', settings.ergOn ? 'on' : 'off'); showErgBtn(); };
  $('#mass').onchange = () => { const v = +$('#mass').value; if (v > 0) settings.rider = Math.round(RQ.units.massKg(v) * 10) / 10; saveSettings(); };
  $('#units').onchange = () => { settings.units = $('#units').value; unitsNow(); showUnits(); saveSettings(); };
  $('#effect').oninput = e => { $('#effect-v').textContent = e.target.value + ' %'; };
  $('#bgm-on').addEventListener('change', e => { $('#bgm-vol').disabled = !e.target.checked; });   // オフの間は音量を動かせない（値は覚えている）
  $('#sfx-on').addEventListener('change', e => { $('#sfx-vol').disabled = !e.target.checked; });
  $('#bgm-vol').oninput = e => { $('#bgm-vol-v').textContent = e.target.value + ' %'; RQ.music.setVolumes({ bgmVol: +e.target.value }); };   // 動かしているあいだも、聞きながら決められる
  $('#sfx-vol').oninput = e => { $('#sfx-vol-v').textContent = e.target.value + ' %'; RQ.music.setVolumes({ sfxVol: +e.target.value }); };
  $('#share-revoke').onclick = async () => {   // 自分が上げたゴーストを全部消す（合言葉で。このパソコンから上げたものだけ）
    const note = $('#share-note'); note.textContent = t('share.revoking');
    try { const r = await RQ.platform.shareRevoke({ url: $('#share-url').value.trim() }); note.textContent = r.deleted || r.failed ? t('share.revoked', { n: r.deleted }) + (r.failed ? t('share.revokeFailedSome', { n: r.failed }) : '') : t('share.nothing'); }
    catch (_) { note.textContent = t('share.revokeFailed'); }
  };
  // 月のレポート（試作。renderer/game/monthly.js）：A は手元の走りの数値（rq.rides。アプリ版は FIT からも作り直す）、B はサーバーに残した数値から、
  // 今月か先月のまとめを作り、サーバー（Claude）に手紙にしてもらう
  $('#report-make').onclick = async () => {
    const note = $('#report-note'), out = $('#report-out'), url = $('#share-url').value.trim(), P = RQ.platform, M = RQ.monthly;
    if (!url) { note.textContent = t('report.noUrl'); return; }
    const now = new Date(), thisYm = M.monthOfMs(now.getTime()), ym = $('#report-month').value === 'last' ? M.prevMonth(thisYm) : thisYm, months = [M.prevMonth(ym), ym];
    note.textContent = t('report.making'); out.hidden = true;
    let rides;
    if (settings.reportMode === 'server') {
      rides = P.ridesFetch ? await P.ridesFetch({ url, owner: reportOwner(), from: months[0], to: months[1] }) : null;
      if (!rides) { note.textContent = t('report.fetchFailed'); return; }
    } else rides = await localRides(months);
    const facts = M.reportFacts(rides, { lang: I18N.lang, ym, today: ym === thisYm ? now.getDate() : null, hrMax: settings.hrMax || 185 });
    console.info('月のレポートに渡す数値', facts);   // 試作：何を送ったかを開発者ツールで見られるように
    if (!facts.cur.rides && !(facts.prev && facts.prev.rides)) { note.textContent = t('report.none'); return; }
    const text = P.writeReport ? await P.writeReport({ url, facts }) : null;
    if (text && text.limit) { note.textContent = t('report.limit'); return; }   // 月に 50 回を超えた（2026-11-03 ユーザー判断：この文を出す）
    if (typeof text !== 'string' || !text) { note.textContent = t('report.failed'); return; }
    note.textContent = t('report.count', { ym, n: facts.cur.rides }); out.textContent = text; out.hidden = false;
  };
  $('#report-forget').onclick = async () => {
    const note = $('#report-note'), url = $('#share-url').value.trim();
    if (!url) { note.textContent = t('report.noUrl'); return; }
    const n = RQ.platform.ridesDelete ? await RQ.platform.ridesDelete({ url, owner: reportOwner() }) : null;
    note.textContent = n == null ? t('report.forgetFailed') : t('report.forgot', { n });
  };
  $('#b-settings').onclick = () => { $('#settings').hidden = false; };
  // 設定の言語：変えたら保存して読み込み直す（走っている間は変えない）
  $('#lang').value = I18N.lang;
  $('#lang').onchange = () => {
    if (run || rideS || trialOn) { $('#lang').value = I18N.lang; return; }
    I18N.save(localStorage, $('#lang').value); location.reload();
  };
  // 記録の書き出しと読み込み（renderer/platform/backup.js。2026-10-23 ユーザー要望）。読み込みは、今の記録を消す前に確かめ、終わったら画面を読み込み直す
  const backupNote = t => { $('#backup-note').textContent = t; };
  $('#backup-export').onclick = async () => {
    try {
      saveSettings();
      const p = await RQ.platform.backupGet(), BK = RQ.backup;
      const name = await RQ.platform.saveBackup(BK.toText(BK.build({ ls: BK.collectLs(localStorage), ghosts: p.ghosts, shareKeys: p.shareKeys, from: RQ.platform.kind })), BK.fileName());
      backupNote(name ? t('backup.saved', { name: String(name).split(/[\\/]/).pop() }) : t('backup.canceled'));
    } catch (e) { backupNote(t('backup.saveFailed', { msg: e.message })); }
  };
  // Bluetooth の生の記録を保存（trainer.js の btlogText。2026-11-07：Elite Suito の回転数の乱高下を調べる）
  $('#btlog-save').onclick = async () => {
    try {
      const d = new Date(), p2 = n => String(n).padStart(2, '0');
      const name = await RQ.platform.saveBackup(TR.btlogText(), `ride-on-quest-btlog-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`);
      $('#btlog-note').textContent = name ? t('set.btlogSaved', { n: TR.btlogCount(), name: String(name).split(/[\\/]/).pop() }) : t('backup.canceled');
    } catch (e) { $('#btlog-note').textContent = t('backup.saveFailed', { msg: e.message }); }
  };
  $('#backup-import').onclick = () => {
    if (run || rideS || trialOn) { backupNote(t('backup.notWhileRiding')); return; }
    $('#backup-file').value = ''; $('#backup-file').click();
  };
  $('#backup-file').onchange = async () => {
    const f = $('#backup-file').files[0]; if (!f) return;
    let p;
    try { p = RQ.backup.parse(await f.text()); } catch (e) { backupNote(t('backup.bad', { msg: e.message })); return; }
    const s = RQ.backup.summary(p), when = s.created ? new Date(s.created).toLocaleString(I18N.lang === 'ja' ? 'ja-JP' : 'en-GB') : t('backup.noDate');
    if (!confirm(t('backup.confirm', { when, name: s.name ? t('backup.confirmName', { name: s.name }) : '', runs: s.runs, ghosts: s.ghosts }))) { backupNote(t('backup.canceled')); return; }
    try {
      RQ.backup.restoreLs(localStorage, p.ls);
      await RQ.platform.backupSet({ ghosts: p.ghosts, shareKeys: p.shareKeys });
      backupNote(t('backup.loaded'));
      setTimeout(() => location.reload(), 600);
    } catch (e) { backupNote(t('backup.loadFailed', { msg: e.message })); }
  };
  $('#settings-close').onclick = () => { $('#settings').hidden = true; if (!run && !trialOn && !rideS) showSelect(); };
  // FTP は旅の途中でも変えられる（2026-10-20 ユーザー要望）。左上の窓の ◀ ▶ か、キーの ← → で5 W ずつ。
  // 変えた値は設定に覚え、次からの既定値になる（フリーライドの ← → は ERG の強さに使う）
  const FTP_STEP = 5;
  const ftpBox = el('div', 'win ftpbox');
  ftpBox.hidden = true;
  ftpBox.innerHTML = '<button class="ftp-dn">◀</button><div class="ftp-v"><small>FTP</small><b></b></div><button class="ftp-up">▶</button>';
  // 左上の並び（2026-10-23 ユーザー判断）：FTP の ◀ ▶ の右に、走行中のボタン（.ride-acts）を並べる。
  // 戦闘をスキップ。HUD の左の列（時間・高度など）より上に収める（引き返すは 2026-10-29 から Esc の一時停止の窓）
  const topLeft = el('div', 'topleft'), rideActs = el('div', 'ride-acts');
  rideActs.id = 'topbtns';
  topLeft.append(ftpBox, rideActs);
  $('#stage').appendChild(topLeft);
  // 戦闘をスキップ（2026-10-23 ユーザー要望）：旅の戦闘の間だけ。残りの連戦ごと終わらせ、敵は逃げていく（星・点数は入らない。course.js の finishBattle）
  const skipBtn = el('button', 'win topbtn skip-battle');
  skipBtn.hidden = true; skipBtn.dataset.i18n = 'bt.skip'; skipBtn.textContent = t('bt.skip');
  skipBtn.onclick = () => { if (run && view && view.kind === 'battle' && view.skip) view.skip(); skipBtn.blur(); };
  rideActs.appendChild(skipBtn);
  function stepFtp(d) {
    const el = $('#ftp'), n = Math.max(+el.min || 50, Math.min(+el.max || 500, U.ftp() + d * FTP_STEP));
    if (n === U.ftp()) return;
    el.value = n; saveSettings();
  }
  ftpBox.querySelector('.ftp-dn').onclick = () => stepFtp(-1);
  ftpBox.querySelector('.ftp-up').onclick = () => stepFtp(1);
  // 今来た道を引き返す：旅（戦闘中以外）と島のフリーライド。試練・レースでは出さない。押したあと数秒は押せない。
  // 画面のボタンはやめ、Esc の一時停止の窓に出す（2026-10-29 試走 No.13 ユーザー判断）。押すと再開して引き返す
  const uturnBtn = el('button'); uturnBtn.id = 'b-uturn'; uturnBtn.hidden = true; uturnBtn.textContent = t('ride.uturn'); uturnBtn.setAttribute('data-i18n', 'ride.uturn');
  $('#b-resume').after(uturnBtn);
  const reverser = () => (world && world.reverse ? world : view && view.reverse ? view : null);   // 旅・続けて走る＝world、フリーライド＝view（ride-view.js）
  uturnBtn.onclick = () => { const r = reverser(); if (!r || uturnBtn.disabled) return; setPaused(false); if (r.reverse()) RQ.sfx.play('turn'); uturnBtn.blur(); };
  window.__rq.uturnOk = () => uturnOk();   // テスト用
  const uturnOk = () => !!(reverser() && reverser().canReverse() && ((run && !run.done) || (rideS && !rideS.race)) && !trialOn && !(view && view.kind === 'battle'));
  const ftpAdjustable = () => !!((run && !run.done) || (view && view.kind === 'battle'));   // 続けて走る間は、◀ ▶ は ERG の強さ
  let testGrade = 0;
  $('#grade').oninput = e => { const g = +e.target.value; testGrade = g / 100; $('#grade-v').textContent = g.toFixed(1) + ' %'; };

  /* ---------- 接続 ---------- */
  // 「つなぐ」1つで全部（2026-10-29 試走 No.8 ユーザー判断）。Electron（選ぶ窓が自前）：押すと、トレーナー → 心拍ベルト → パワーメーターの順に探して、
  // 種類ごとに見つかった機器を窓に並べる。見つかったら1台目を選んだ状態に（2台以上でも同じ。押すと選び直せる・もう一度押すと外す）。
  // 「つなぐ」で選んだものを全部つなぐ。パワーメーター・心拍ベルトの一覧からは、トレーナー自身を外す（トレーナーもパワーの電波を出していて、2回つながる）。
  // 心拍ベルト・パワーメーターのボタンは消した（ユーザー「消す」）。
  // ブラウザ版（Chrome）：クリック1回で選ぶ窓は1つだけ（Chrome の決まり）なので、「つなぐ」はトレーナー。つないだあと「心拍ベルトもつなぐ」「パワーメーターもつなぐ」を出す
  const KINDS = ['trainer', 'hr', 'pm'], SCAN_MS = 4000;
  let pickAll = null;   // { found: { kind: [{ id, name }] }, sel: { kind: id }, kind: 今探している種類, busy }
  $('#b-connect').onclick = async () => {
    if (!RQ.platform.ownPicker) { await TR.connect(); return; }
    if (pickAll) return;
    pickAll = { found: { trainer: [], hr: [], pm: [] }, sel: {}, kind: null, busy: false, done: false };
    $('#picker-title').textContent = t('picker.all'); $('#picker-hint').textContent = t('picker.allHint');
    $('#picker').hidden = false;
    scanAll();
  };
  function scanAll() {
    const pa = pickAll; if (!pa) return null;
    pa.done = false; drawPickAll();
    return pa.scanP = (async () => {
      for (const k of KINDS) { if (pickAll !== pa) break; pa.kind = k; drawPickAll(); await TR.scan(k, SCAN_MS); }
      pa.kind = null; pa.done = true; if (pickAll === pa) drawPickAll();
    })();
  }
  function onFound(devs) {   // 今探している種類の一覧（見つかるたびに届く）
    const pa = pickAll; if (!pa || !pa.kind) return;
    const k = pa.kind, tr = new Set(pa.found.trainer.map(d => d.id)), list = pa.found[k];
    for (const d of devs) if (!list.some(x => x.id === d.id) && (k === 'trainer' || !tr.has(d.id))) list.push(d);
    if (!pa.sel[k] && list.length && pa.sel[k] !== null) pa.sel[k] = list[0].id;   // 1台目を選んだ状態に（null＝自分で外した）
    drawPickAll();
  }
  function drawPickAll() {
    const pa = pickAll, list = $('#picker-list'); if (!pa) return;
    list.innerHTML = '';
    for (const k of KINDS) {
      list.appendChild(el('li', 'kind', t('picker.kind.' + k)));
      const found = pa.found[k];
      if (!found.length) list.appendChild(el('li', 'none', pa.kind === k || (!pa.done && KINDS.indexOf(k) > KINDS.indexOf(pa.kind)) ? t('picker.searching') : t('picker.notFound')));
      for (const d of found) {
        const li = el('li'), b = el('button'); b.textContent = d.name || t('picker.noName'); b.classList.toggle('sel', pa.sel[k] === d.id); b.disabled = pa.busy;
        b.onclick = () => { pa.sel[k] = pa.sel[k] === d.id ? null : d.id; drawPickAll(); };
        li.appendChild(b); list.appendChild(li);
      }
    }
    const any = KINDS.some(k => pa.sel[k]);
    $('#picker-go').hidden = false; $('#picker-go').disabled = pa.busy || !any; $('#picker-go').textContent = pa.busy ? t('picker.connecting') : t('picker.go');
    $('#picker-rescan').hidden = !pa.done || pa.busy;
  }
  $('#picker-go').onclick = async () => {
    const pa = pickAll; if (!pa || pa.busy) return;
    pa.busy = true; drawPickAll();
    pickAll = null; TR.stopScan(); await pa.scanP;   // 探している途中なら、やめてから（同時に2つ探さない）
    pickAll = pa; drawPickAll(); pickAll = null;
    const { trainer, hr, pm } = pa.sel;
    if (trainer) await TR.connect(trainer);
    if (hr) await TR.connectHr(hr);
    if (pm) await TR.connectPm(pm);
    $('#picker').hidden = true; resetPicker();
  };
  $('#picker-rescan').onclick = () => { if (pickAll && pickAll.done) scanAll(); };
  function resetPicker() { $('#picker-go').hidden = true; $('#picker-rescan').hidden = true; }
  // ブラウザ版：トレーナーとは別に1台ずつ（心拍ベルトは、つながっている間はトレーナーの心拍より優先。パワーメーターは、パワーと回転数をこちらから取り、ERG の目標を補正する。2026-10-24）
  $('#b-hr').onclick = () => TR.connectHr();
  $('#b-pm').onclick = () => TR.connectPm();
  const moreBtns = () => { const on = !RQ.platform.ownPicker && S.src === 'ble'; $('#b-hr').hidden = !on; $('#b-pm').hidden = !on; };
  $('#b-hr').textContent = t('bar.hrMore'); $('#b-hr').dataset.i18n = 'bar.hrMore'; $('#b-pm').textContent = t('bar.pmMore'); $('#b-pm').dataset.i18n = 'bar.pmMore';
  moreBtns(); TR.onChange(moreBtns);
  $('#b-sim').onclick = () => TR.startSim();
  /* ---------- トレーナーの補正（スピンダウン。2026-10-24 ユーザー判断） ----------
     FTMS の Spin Down Control に対応する機種なら、ゲームの中で案内して行う（trainer.js の spinDown。S.cal の phase を見て窓を描き替える）。
     対応しない機種は、メーカーのアプリで行うよう案内だけ出す。初めてつないだトレーナーと、CAL_DAYS 日していないトレーナーには、
     つないだときに一度すすめる（「あとで」なら ASK_DAYS 日はすすめない）。記録は rq.cal（{ 機種の名前: { cal: 補正した時刻, asked: すすめた時刻 } }） */
  const CAL_KEY = 'rq.cal', CAL_DAYS = 30, ASK_DAYS = 7, DAY = 86400000;
  const calLog = () => loadJSON(CAL_KEY, {});
  const calSave = k => { if (!S.device) return; const l = calLog(), e = l[S.device] || {}; e[k] = Date.now(); l[S.device] = e; saveJSON(CAL_KEY, l); };
  const spd = kmh => `${RQ.units.speedV(kmh).toFixed(1)} ${RQ.units.speedU()}`;
  let calSuggest = false;
  // 旅の途中でも校正できる（2026-11-07 ユーザー判断「一回繋いだ後も校正できるようにしないとダメだな」）：走っている間に開いたら一時停止にし（ERG を外して勾配 0%）、
  // 校正の窓を閉じたら一時停止の窓に戻る。「再開する」で ERG は抜いた所から戻る（common.js の load → ergguard の resume）
  function showCal(suggest) {
    calSuggest = suggest;
    if (run || rideS || trialOn) { setPaused(true); $('#pause').hidden = true; }
    $('#cal').hidden = false; TR.note('calOpen', suggest ? 'suggest' : 'button'); drawCal();
  }
  function drawCal() {
    if ($('#cal').hidden) return;
    const c = S.cal, msg = $('#cal-msg'), sp = $('#cal-speed'), go = $('#cal-go');
    sp.hidden = true; go.hidden = true; $('#cal-close').textContent = t('cal.close');
    if (S.src !== 'ble') msg.textContent = t('cal.noTrainer');
    else if (!c.can) msg.textContent = t('cal.cannot');
    else if (c.phase === 'idle') {
      const first = !(calLog()[S.device] || {}).cal;
      msg.textContent = (calSuggest ? t(first ? 'cal.suggestFirst' : 'cal.suggest') + ' ' : '') + t('cal.ready') + (paused ? ' ' + t('cal.inRun') : '');
      go.hidden = false; if (calSuggest) $('#cal-close').textContent = t('cal.later');
    }
    else if (c.phase === 'start') msg.textContent = t('cal.start');
    else if (c.phase === 'speedUp') { msg.textContent = t('cal.speedUp', { lo: spd(c.lo), hi: spd(c.hi) }); sp.hidden = false; sp.textContent = t('cal.now', { v: spd(S.speed) }); }
    else if (c.phase === 'stop') msg.textContent = t('cal.stop');
    else if (c.phase === 'success') msg.textContent = t('cal.success');
    else if (c.phase === 'error') { msg.textContent = t('cal.error', { msg: c.msg ? `（${c.msg}）` : '' }); go.hidden = false; }
  }
  $('#b-cal').onclick = () => { $('#settings').hidden = true; showCal(false); };
  $('#cal-go').onclick = () => TR.spinDown();
  $('#b-pause-cal').onclick = () => showCal(false);
  $('#cal-close').onclick = () => { $('#cal').hidden = true; if (calSuggest) calSave('asked'); calSuggest = false; TR.calEnd(); if (paused) $('#pause').hidden = false; };
  let wasBle = false, calDone = false;
  TR.onChange(() => {
    if (S.cal.phase === 'success' && !calDone) { calDone = true; calSave('cal'); } else if (S.cal.phase !== 'success') calDone = false;
    // つないだときに一度すすめる（走っている間はすすめない）
    if (S.src === 'ble' && !wasBle && S.cal.can != null && !(run || rideS || trialOn)) {
      const e = calLog()[S.device] || {}, now = Date.now();
      if ((!e.cal || now - e.cal > CAL_DAYS * DAY) && (!e.asked || now - e.asked > ASK_DAYS * DAY)) showCal(true);
    }
    wasBle = S.src === 'ble';
    drawCal();
  });
  TR.onChange(() => {
    const c = $('#conn'); RQ.ui.setLinkedText(c, S.conn.msg + (S.canLoad && S.loadNote ? ` ⚠ ${S.loadNote}` : '') + (S.hrDevice ? ` · ♥ ${S.hrDevice}` : '') + (S.hrNote ? ` · ${S.hrNote}` : '') + (S.pmDevice ? ` · ⚡ ${S.pmDevice}` : '') + (S.pmNote ? ` · ${S.pmNote}` : '')); c.className = 'conn ' + S.conn.cls;   // 負荷の問題もここに出す
    $('#sim').classList.toggle('on', S.src === 'sim');
  });
  // Electron では機器の選択画面を自前で出す（Chrome で開いたときは Chrome の画面が出る）
  if (RQ.platform.ownPicker) {
    RQ.platform.onBtDevices(devs => (pickAll ? onFound(devs) : S.btWant ? null : showPicker(devs)));   // 「つなぐ」の窓が開いていれば、探している種類の一覧へ。選んでおいた機器をつないでいる間は出さない
    $('#picker-cancel').onclick = () => { $('#picker').hidden = true; const pa = pickAll; pickAll = null; resetPicker(); if (pa) TR.stopScan(); else RQ.platform.chooseBt(''); };
  }
  function showPicker(devs) {
    const list = $('#picker-list');
    $('#picker').hidden = false; list.innerHTML = '';
    if (!devs.length) list.appendChild(el('li', 'hint', t('picker.searching')));
    for (const d of devs) {
      const li = el('li'), b = el('button'); b.textContent = d.name || t('picker.noName');
      b.onclick = () => { $('#picker').hidden = true; RQ.platform.chooseBt(d.id); };
      li.appendChild(b); list.appendChild(li);
    }
  }
  $('#sim-p').oninput = e => { S.sim.power = +e.target.value; $('#sim-pv').textContent = S.sim.power + ' W'; };
  $('#sim-c').oninput = e => { S.sim.cad = +e.target.value; $('#sim-cv').textContent = S.sim.cad + ' rpm'; };

  /* ---------- キー操作と一時停止 ---------- */
  const screen = $('#screen');
  let view = null, run = null, rec = null, paused = false, trialOn = false, rideS = null;
  // 画面を替える。3D のように後片付けが要る画面は dispose する
  // 片付けで例外が出ても、次の画面へ進む（2026-10-24：3D の片付けで落ちて、まとめが出ずに走り続けたため）
  function swap(v) { const old = view; view = v; if (old && old !== v && old.dispose) { try { old.dispose(); } catch (e) { console.error('画面を片付けられなかった', e); } } }
  // 旅の3D の世界（RQ.world）。旅のあいだだけあり、フィールドと戦闘はその上の層に重ねる
  let world = null;
  function endWorld() { const w = world; world = null; if (w) { try { w.dispose(); } catch (e) { console.error('3D の世界を片付けられなかった', e); } } }   // 先に外す（片付けで落ちても、走り続けない）
  // 新しい走り（旅・フリーライド・レース・試練）を始める前に、前の走りを片付ける。ふだんは選ぶ画面を通るので何も残っていないが、
  // テスト用の入口（__rq.startRide など）から続けて入ると、前の 3D の世界が残り、無くなった画面の要素をさわって落ちていた（撮影で見つかった）
  function leaveRun() { run = null; rideS = null; trialOn = false; feeling = false; swap(null); endWorld(); }
  function setPaused(p) {
    paused = p && !!(run || trialOn || rideS);
    $('#pause').hidden = !paused;
    $('#b-quit').textContent = trialOn ? t('pause.quitTrial') : t('pause.quit');
    if (paused) TR.setGrade(0);
    showErgBtn(); showCourseBtn();
    RQ.music.pause(paused);   // 一時停止のあいだは、曲も止める
  }
  $('#b-resume').onclick = () => setPaused(false);
  /* ---------- ERG のオン・オフ（2026-11-07 ユーザー判断「ギアを使いたい人もいるからERGのオンオフを切り替えできるようにしたい」） ----------
     旅（戦闘・フィールド・ミッション・続けて走る）でもフリーライドでも、走っている途中にいつでも切り替える。入口は一時停止の窓・設定の窓・E キー。
     オフの間は、フリーライドの勾配と同じに、地形の勾配 ×「効き」を送る（common.js の load）。選んだ方は設定に残す（旅＝ergOn、フリーライド＝rideMode）。女王の試練は今のまま（勾配 0%） */
  const rideErg = () => !!(rideS && view && view.ergPct && view.ergPct() != null);   // フリーライドで、今 ERG か
  const ergNow = () => (rideS ? rideErg() : settings.ergOn !== false);
  const ergSwitchable = () => !!((run && !run.done) || (rideS && !rideS.race && view && view.setMode)) && !trialOn && !(run && run.trial);
  const terrainGrade = () => (world && world.grade ? world.grade() : view && view.hudInfo ? (view.hudInfo() || {}).grade || 0 : 0);   // 今いる所の地形の勾配
  U.setLoadMode({ on: () => (rideS ? true : settings.ergOn !== false), grade: terrainGrade, effect: () => settings.effect / 100 });
  window.__rq.terrainGrade = terrainGrade;   // テスト用
  function toggleErg() {
    if (!ergSwitchable()) return false;
    if (rideS) { const on = !rideErg(); view.setMode(on ? 'erg' : 'grade', settings.ergPct); settings.rideMode = on ? 'erg' : 'grade'; }
    else { settings.ergOn = settings.ergOn === false; $('#erg-on').checked = settings.ergOn; }
    saveJSON(SETTINGS_KEY, settings); TR.note('ergMode', ergNow() ? 'on' : 'off'); showErgBtn();
    return true;
  }
  function showErgBtn() { const b = $('#b-erg'); b.hidden = !ergSwitchable(); b.textContent = t(ergNow() ? 'pause.ergOn' : 'pause.ergOff'); }
  $('#b-erg').onclick = () => toggleErg();
  window.__rq.toggleErg = toggleErg; window.__rq.ergNow = ergNow;   // テスト用
  // 仮（試走用。2026-10-24）：時間帯を変えるボタン（一時停止の窓）。押すたびに 自動 → 朝 → 昼 → 夕方 → 夜 → 自動。
  // window.__rq.hour（view3d.js が読む）に時刻を固定する。自動は固定を外す。旅・フリーライド・試練・レースを始めるたびに自動に戻す（hourReset）。
  // あとで消すか、設定に移す
  const HOURS = [[null, 'pause.hourAuto'], [7, 'pause.hourMorning'], [12, 'pause.hourNoon'], [18, 'pause.hourEvening'], [22, 'pause.hourNight']];
  let hourIdx = 0;
  const showHour = () => { $('#b-hour').textContent = t('pause.hour', { when: t(HOURS[hourIdx][1]) }); };
  const hourReset = () => { hourIdx = 0; window.__rq.hour = null; showHour(); };
  $('#b-hour').onclick = () => { hourIdx = (hourIdx + 1) % HOURS.length; window.__rq.hour = HOURS[hourIdx][0]; showHour(); };
  showHour();
  // 試し（2026-10-26 ユーザー判断）：戦士のフィールドの姿を、ピクセル化したローポリ（3D）にするか、今のドット絵の板にするか。既定は 3D。戦士以外は、どちらでも板
  RQ.hero3d.enabled = settings.hero3d !== false;
  const showHero3d = () => { $('#b-hero3d').textContent = t('pause.hero3d', { v: t(RQ.hero3d.enabled ? 'pause.hero3dOn' : 'pause.hero3dOff') }); };
  $('#b-hero3d').onclick = () => { RQ.hero3d.enabled = !RQ.hero3d.enabled; settings.hero3d = RQ.hero3d.enabled; saveJSON(SETTINGS_KEY, settings); showHero3d(); };
  showHero3d();
  // タッチの画面（ブラウザ版の iPad など）：Esc の代わりの一時停止のボタン（走っている間だけ出す）と、分かれ道の矢印を押して曲がる向きを選ぶ（Space の代わり）
  $('#b-pause').onclick = () => setPaused(true);
  screen.addEventListener('click', e => {
    const side = e.target.closest && e.target.closest('.turn-side');
    if (side && (run || rideS) && !paused && !side.classList.contains('lit')) toggleTurn();
  });
  // 一時停止の「終わる」：まとめへ。途中で例外が出ても、3D を止めてタイトルへ（走り続けない。2026-10-24 ユーザー指摘）
  $('#b-quit').onclick = () => {
    setPaused(false);
    try {
      if (trialOn || (run && run.trial && !run.closed)) finishTrial(); else if (rideS && rideS.race) finishRace(false);
      else finishOuting(run ? !!run.done : rideS ? !!rideS.timeUp : true);
    } catch (e) {
      console.error('まとめを出せなかった', e);
      run = null; rec = null; rideS = null; outing = null; freeSeg = null; trialOn = false; endWorld(); showSelect();
    }
  };
  // 分かれ道の矢印：スペースで曲がる向きが入れ替わる。つながずに試すモードはキーを使わない（指定したパワーとケイデンスのまま走る。2026-10-21 ユーザー判断）
  const toggleTurn = () => { const t = (world && world.toggleTurn) || (view && view.toggleTurn); if (t) { t(); RQ.sfx.play('turn'); } };
  addEventListener('keydown', e => {
    if (e.code === 'Space' && (run || rideS) && !paused) { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); toggleTurn(); return; }
    if (e.key === 'Escape' && switchBox) { const b = switchBox.querySelector('.course-foot button'); if (b) b.click(); return; }   // コース替えの窓：Esc は「戻る」
    if (e.key === 'Escape' && (run || trialOn || rideS) && $('#cal').hidden) setPaused(!paused);
    if ((e.key === 'e' || e.key === 'E') && !e.repeat && !(e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) && toggleErg()) { e.preventDefault(); return; }   // ERG のオン・オフ   // 校正の窓が出ている間は、Esc で再開しない
    if (!paused && ftpAdjustable() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { stepFtp(e.key === 'ArrowRight' ? 1 : -1); e.preventDefault(); return; }
    if (!paused && view && view.key) view.key(e);
  });

  // どの版か（ブラウザ版だけ。renderer/build-info.js）：タイトルの右下の隅と、設定の出典の欄に小さく
  const buildText = () => { const b = RQ.build; if (!b || !b.commit) return ''; const d = new Date(b.at), z = n => String(n).padStart(2, '0');
    return t('sel.build', { commit: b.commit + (b.dirty ? '+' : ''), when: `${d.getMonth() + 1}/${d.getDate()} ${z(d.getHours())}:${z(d.getMinutes())}` }); };
  if (buildText()) { $('#build-tag').textContent = buildText(); $('#build-tag').hidden = false; }

  /* ---------- 挑戦者と時間を選ぶ ---------- */
  function showSelect() {
    run = null; rec = null; trialOn = false; rideS = null; outing = null; freeSeg = null; swap(null); endWorld(); U.setBg('islandMap');
    screen.innerHTML = '';
    const wrap = el('div', 'select');
    const logo = el('img', 'logo'); logo.src = U.A + 'ui/logo.webp'; logo.alt = 'Ride on Quest';
    wrap.appendChild(logo);
    wrap.appendChild(el('div', 'subtitle', t('sel.subtitle')));
    // 脚力（FTP）と女王の試練
    const hist = loadJSON(FTP_KEY, []);
    const ftpRow = el('div', 'ftp-row' + (hist.length ? '' : ' first'));
    ftpRow.innerHTML = hist.length
      ? `<span>${t('sel.player', { lv: RQ.progress.levelOf(loadJSON(PLAYER_KEY, { xp: 0 }).xp), ftp: U.ftp(), when: hist[0].ftp === U.ftp() ? t('sel.ftpFromTrial', { date: hist[0].date }) : t('sel.ftpChanged', { date: hist[0].date, ftp: hist[0].ftp }), diff: t('diff.' + U.difficulty()) })}</span>`
      : `<span>${t('sel.noFtp', { ftp: U.ftp() })}</span>`;
    const tb = el('button', 'trial-btn'); tb.textContent = t('sel.trial'); tb.onclick = pickTrialHero;
    ftpRow.appendChild(tb);
    wrap.appendChild(ftpRow);
    // 続ける仕組み：今週の回数と分、続けた日数（文字だけ。ゲージは出さない）
    const habitText = habitLine();
    if (habitText) wrap.appendChild(el('div', 'habit', habitText));
    // 今日の時間と、フリーライド
    const mrow = minutesRow();
    const fr = el('button', 'free-btn'); fr.textContent = t('sel.free', { island: D.WORLD.island }); fr.onclick = () => showCourses({ mode: 'free' });
    mrow.appendChild(fr);
    const rb = el('button', 'free-btn race-btn'); rb.textContent = t('sel.race'); rb.onclick = showRace;
    mrow.appendChild(rb);
    const cb = el('button', 'free-btn'); cb.textContent = t('sel.gear'); cb.onclick = showCollection;
    mrow.appendChild(cb);
    const bb = el('button', 'free-btn'); bb.textContent = t('badge.btn'); bb.onclick = showBadges;   // 勲章の一覧（2026-10-24）
    mrow.appendChild(bb);
    // ゲームを終わる（2026-10-22 ユーザー要望）：タイトルにだけ置く（走っている最中は、まとめと保存を通らずに消えるので置かない）。
    // ブラウザ版はタブを閉じられないことが多いので出さない（RQ.platform.quit が無い）
    if (RQ.platform.quit) { const qb = el('button', 'free-btn quit-btn'); qb.textContent = t('sel.quit'); qb.onclick = () => RQ.platform.quit(); mrow.appendChild(qb); }
    wrap.appendChild(mrow);
    // 挑戦者：4人ずつ「1 2」のページで切り替える（2026-10-27 ユーザー判断。コースを選ぶ画面と同じ形）。2ページ目の残りの枠は、まだ選べない主人公（Coming soon。村人の正面の絵を暗くして出す）
    const pageRow = el('div', 'minutes hero-pages'), row = el('div', 'heroes');
    const slots = [...D.HERO_ORDER, ...HERO_SOON.map(id => ({ soon: id }))], pages = Math.ceil(slots.length / HERO_PER);
    function heroPageShow(n) {
      heroPage = n; row.innerHTML = '';
      pageRow.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === n));
      for (const s of slots.slice(n * HERO_PER, (n + 1) * HERO_PER)) {
        if (s.soon) {
          const card = el('div', 'win hero-card soon');
          card.innerHTML = `<img alt=""><div class="name">${(RQ.talks.NPCS[s.soon] || { n: '' }).n}</div><div class="plan">Coming soon</div>`;
          U.setSprite(card.querySelector('img'), s.soon, 'front', 0, 0.85);
          row.appendChild(card); continue;
        }
        const id = s, h = D.HEROES[id];
        const card = el('div', 'win hero-card ' + h.sp);
        const hp = heroProg(id);
        const pn = D.PLANS[h.plan].n;
        card.innerHTML = `<img alt=""><div class="name">${h.n}</div><div class="plan">${pn.length >= 7 && !(RQ.i18n && RQ.i18n.lang === 'en') ? `<span class="long">${pn}</span>` : pn}</div>`
          + `<div class="lv">${hp.round > 1 ? t('sel.legend') : ''}Lv ${hp.level}・${D.PHASES[hp.level - 1]}<br>${t('sel.toBoss', { m: toBoss(hp) })}</div>`
          + `<div class="card-buttons"><button class="go">${t('sel.go')}</button></div>`;
        U.setSprite(card.querySelector('img'), id, 'front', 0, 0.85);
        card.onclick = () => showCourses({ mode: 'quest', hero: id });   // カードのどこを押しても、コースを選ぶ画面へ（2026-10-22 ユーザー判断。［旅に出る］はキーで選ぶとき用に残す）
        row.appendChild(card);
      }
    }
    for (let i = 0; i < pages; i++) { const b = el('button', 'min page-btn'); b.textContent = String(i + 1); b.onclick = () => heroPageShow(i); pageRow.appendChild(b); }
    if (pages < 2) pageRow.hidden = true;
    heroPageShow(Math.min(heroPage, pages - 1));
    wrap.appendChild(pageRow);
    wrap.appendChild(row);
    wrap.appendChild(el('p', 'hint', t('sel.hint')));
    const recs = loadJSON(RECORD_KEY, []);
    if (recs.length) { const r0 = recs[0]; wrap.appendChild(el('p', 'hint', t('sel.last', { date: r0.date, hero: (D.HEROES[r0.hero] || { n: '' }).n, min: r0.min, km: RQ.units.dist(+r0.km), w: r0.avgW }) + (r0.tss != null ? `・TSS ${r0.tss}` : ''))); }
    screen.appendChild(wrap);
    if (buildText()) screen.appendChild(el('div', 'build-tag', buildText()));
    view = { tick() { TR.setGrade(testGrade); } };
  }

  // 主人公選びのページ（2026-10-27 ユーザー判断）：1ページ 4 人。HERO_SOON はまだ選べない枠（村人の絵 assets/npc/*.png を暗くして「Coming soon」）
  const HERO_PER = 4, HERO_SOON = [];   // 2026-10-27：侍・傭兵を選べるようにしたので、Coming soon の枠は無い（盗賊の枠はやめた）
  let heroPage = 0;
  // 今日の時間（15分刻み）を選ぶ列
  function minutesRow() {
    const mrow = el('div', 'minutes');
    mrow.appendChild(el('span', null, t('sel.today')));
    for (const m of C.MINUTES) {
      const b = el('button', 'min' + (m === settings.minutes ? ' on' : '')); b.textContent = t('sel.min', { m });
      b.onclick = () => { settings.minutes = m; saveJSON(SETTINGS_KEY, settings); mrow.querySelectorAll('button.min').forEach(x => x.classList.toggle('on', x === b)); };
      mrow.appendChild(b);
    }
    return mrow;
  }

  /* ---------- 装備のコレクション（2026-10-21 ユーザー判断：見られるだけ。着せない） ---------- */
  function showCollection() {
    swap(null); endWorld(); U.setBg('islandMap');
    screen.innerHTML = '';
    const wrap = el('div', 'select collection');
    wrap.appendChild(el('h2', null, t('gear.title')));
    const art = window.RQ.itemArt || {};   // 絵が届いた装備（assets/items/manifest.js）
    for (const id of D.HERO_ORDER) {
      const hp = heroProg(id), got = new Set(D.itemsOf(id, hp.best || 1).map(it => it.id));
      const sec = el('div', 'win col-hero');
      sec.appendChild(el('div', 'col-name', `${D.HEROES[id].n}（${D.PLANS[D.HEROES[id].plan].n}）　${got.size} / ${D.ITEMS[id].length}`));
      const row = el('div', 'col-items');
      for (const it of D.ITEMS[id]) {
        const has = got.has(it.id), card = el('div', 'col-item' + (has ? '' : ' locked'));
        const pic = el('div', 'col-pic');
        if (has && art[it.id]) { const im = el('img', 'pixel'); im.src = `../assets/items/${it.id}.png`; im.alt = ''; pic.appendChild(im); }
        else pic.textContent = has ? it.n[0] : '？';   // 絵が届くまでは名前の1字目
        card.appendChild(pic);
        card.appendChild(el('div', 'col-n', has ? it.n : '？？？'));
        card.appendChild(el('div', 'col-d', has ? it.d : t('gear.at', { lv: it.lv })));
        row.appendChild(card);
      }
      sec.appendChild(row); wrap.appendChild(sec);
    }
    const back = el('button'); back.textContent = t('ui.back'); back.onclick = showSelect; wrap.appendChild(back);
    screen.appendChild(wrap);
    view = { tick() { TR.setGrade(0); } };
  }

  // 勲章の一覧（2026-10-24 ユーザー判断：絵は、まず文字と小さな記号だけ）。まとまりごとに、取った日か「あと ○」
  function showBadges() {
    swap(null); endWorld(); U.setBg('islandMap');
    screen.innerHTML = '';
    const BG = RQ.badges, st = BG.load(loadJSON(BADGE_KEY, null)), recs = loadJSON(RECORD_KEY, []);
    const p = BG.progress(st, recs, { goal: RQ.habit.goalOf(settings.weekGoal), roadsTotal: net.roads.length });
    const wrap = el('div', 'select collection badges');
    wrap.appendChild(el('h2', null, `${t('badge.title')}　${t('badge.count', { got: Object.keys(st.got).length, all: BG.BADGES.length })}`));
    for (const g of BG.GROUPS) {
      const sec = el('div', 'win col-hero'), row = el('div', 'col-items');
      sec.appendChild(el('div', 'col-name', t('badge.g.' + g)));
      for (const b of BG.BADGES.filter(x => x.g === g)) {
        const got = st.got[b.id], card = el('div', 'col-item' + (got ? '' : ' locked'));
        card.appendChild(el('div', 'col-pic', b.sym));
        card.appendChild(el('div', 'col-n', t('badge.' + b.id)));
        const left = b.need && p[b.id] != null ? Math.max(0, Math.ceil(b.need - p[b.id])) : null;
        card.appendChild(el('div', 'col-d', got ? t('badge.got', { date: got }) : t('badge.' + b.id + '.d') + (left ? '（' + t('badge.left', { n: left }) + '）' : '')));
        row.appendChild(card);
      }
      sec.appendChild(row); wrap.appendChild(sec);
    }
    wrap.appendChild(el('p', 'hint', t('badge.since')));
    const back = el('button'); back.textContent = t('ui.back'); back.onclick = showSelect; wrap.appendChild(back);
    screen.appendChild(wrap);
    view = { tick() { TR.setGrade(0); } };
  }

  /* ---------- コースを選ぶ（旅もフリーライドも） ---------- */
  // 2026-10-21 ユーザー判断：キャラ → コース → 右回り／左回り。コースは走り出す場所と向きだけを決める（走り出したあとは分かれ道を自由に選ぶ）。
  // 右回り＝コースの始点から（周回は時計回り）、左回り＝終点から（逆向き。周回は反時計回り）
  const courseOf = id => RQ.mapData.courses.find(c => c.id === id) || RQ.mapData.courses[0];
  const startLabel = (c, side) => side === 'right' ? t('course.from', { place: I18N.node(c.start) }) + (c.loop ? t('course.cw') : '') : t('course.from', { place: I18N.node(c.loop ? c.start : c.end) }) + (c.loop ? t('course.ccw') : '');
  // o.host：走っている途中にコースを替える窓（openCourseSwitch）。画面は替えず、host に同じカード・回り方・ページを出し、o.onPick(courseId, side)・o.onBack()
  function showCourses(o = {}) {
    const quest = o.mode === 'quest', hero = quest ? D.HEROES[o.hero] : null, inWin = !!o.host;
    if (!inWin) { swap(null); endWorld(); U.setBg('islandMap'); screen.innerHTML = ''; }
    const wrap = el('div', 'select courses' + (inWin ? ' course-switch-in' : ''));
    wrap.appendChild(el('h2', null, inWin ? t('course.switchTitle') : quest ? t('course.titleQuest', { hero: hero.n }) : t('course.titleFree', { island: D.WORLD.island })));
    if (!inWin) wrap.appendChild(minutesRow());
    if (!quest && !inWin) {
      // 走るキャラ
      const hrow = el('div', 'minutes');
      hrow.appendChild(el('span', null, t('course.rider')));
      for (const id of D.HERO_ORDER) {
        const b = el('button', 'min' + (id === settings.rideHero ? ' on' : '')); b.textContent = D.HEROES[id].n;
        b.onclick = () => { settings.rideHero = id; saveJSON(SETTINGS_KEY, settings); hrow.querySelectorAll('button.who').forEach(x => x.classList.toggle('on', x === b)); };
        b.classList.add('who');
        hrow.appendChild(b);
      }
      // 負荷：勾配（坂に合わせてギアを変える）か ERG（FTP の何%か。無限のギアが自動で変わる扱い）。走るキャラと同じ行に（スクロールさせない）
      const lrow = hrow;
      lrow.appendChild(el('span', 'sep', t('course.load')));
      for (const [id, name] of [['grade', t('course.grade')], ['erg', t('course.erg')]]) {
        const b = el('button', 'min' + (id === settings.rideMode ? ' on' : '')); b.textContent = name;
        b.onclick = () => { settings.rideMode = id; saveJSON(SETTINGS_KEY, settings); lrow.querySelectorAll('button.load').forEach(x => x.classList.toggle('on', x === b)); };
        b.classList.add('load'); lrow.appendChild(b);
      }
      wrap.appendChild(hrow);
    }
    // 右回り／左回り：向きを選ぶだけ（始めるのは、選んだカードの中の「スタート」。2026-10-21 ユーザー要望）
    let side = settings.courseSide === 'left' ? 'left' : 'right';
    const sideRow = el('div', 'minutes course-start');
    for (const [id, cls] of [['right', 'r'], ['left', 'l']]) {
      const b = el('button', 'min side-btn ' + cls + (id === side ? ' on' : ''));
      b.onclick = () => { side = id; settings.courseSide = id; saveJSON(SETTINGS_KEY, settings); sideRow.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
      sideRow.appendChild(b);
    }
    wrap.appendChild(sideRow);
    // 左に島の地図（ドット絵）。選んだコースの道を重ねる。右に「1 2 3」のページと、そのページのコースのカード（スクロールさせない）
    const body = el('div', 'course-body'), mapCv = el('canvas', 'win course-map pixel'), sideCol = el('div', 'course-side');
    const pageRow = el('div', 'minutes course-pages'), row = el('div', 'course-cards');
    sideCol.appendChild(pageRow); sideCol.appendChild(row);
    body.appendChild(mapCv); body.appendChild(sideCol);
    const all = RQ.mapData.courses, PER = 6, pages = Math.ceil(all.length / PER);
    let sel = courseOf(settings.courseId), page = Math.floor(Math.max(0, all.indexOf(sel)) / PER);
    const cards = new Map();
    const go = () => (inWin ? o.onPick(sel.id, side) : quest ? startRun(o.hero, sel.id, side) : startRide(sel.id, side));
    const startBtn = el('button', 'go-btn'); startBtn.textContent = t(inWin ? 'course.switchGo' : 'course.start');
    startBtn.onclick = e => { e.stopPropagation(); go(); };
    const showOnMap = () => U.drawMap(mapCv, net, { hi: sel.roads.map(n => net.byName.get(n)), lineW: 4 });
    const pickCourse = c => {
      sel = c; settings.courseId = c.id; saveJSON(SETTINGS_KEY, settings);
      cards.forEach((card, id) => card.classList.toggle('on', id === c.id));
      if (cards.has(c.id)) cards.get(c.id).appendChild(startBtn);
      fitSel();
      showOnMap();
      sideRow.querySelector('.r').textContent = t('course.right', { from: startLabel(c, 'right') }); sideRow.querySelector('.l').textContent = t('course.left', { from: startLabel(c, 'left') });
    };
    // 選んだカードは名前・数字・スタートを優先する：入りきらなければ説明（1行）を隠し、さらに数字を1行にする（重ならないように）
    function fitSel() {
      requestAnimationFrame(() => {
        const card = cards.get(sel.id); if (!card || !card.isConnected) return;
        const over = () => card.scrollHeight > card.clientHeight + 1;
        card.classList.remove('tight', 'tight2');
        if (over()) card.classList.add('tight');     // 説明を隠す
        if (over()) card.classList.add('tight2');    // それでも入らなければ、数字も1行で「…」
      });
    }
    if (!window.__rqFitCourses) { window.__rqFitCourses = true; addEventListener('resize', () => { if (window.__rqFitSel) window.__rqFitSel(); }); }
    window.__rqFitSel = fitSel;
    function showPage(n) {
      page = n; row.innerHTML = ''; cards.clear();
      pageRow.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === n));
      for (const c of all.slice(n * PER, n * PER + PER)) {
        const card = el('div', 'win course-card' + (c === sel ? ' on' : ''));
        // 選んだカードだけ、いちばん下に「スタート」。高さが足りないときは、高低図から縮める
        card.innerHTML = `<div class="name">${c.name}</div>`
          + `<div class="stat">${t('course.stat', { level: c.level, km: RQ.units.dist(c.dist / 1000), up: RQ.units.elev(c.up), max: c.maxGrade, kind: c.loop ? t('course.loop') : t('course.oneWay') })}</div>`
          + `<div class="how">${c.desc}</div><canvas></canvas>`;
        card.onclick = () => pickCourse(c);
        cards.set(c.id, card); row.appendChild(card);
        if (c === sel) { card.appendChild(startBtn); fitSel(); }
        requestAnimationFrame(() => {   // 高低図：コースの道を始点から終点まで並べる
          const cv = card.querySelector('canvas'), w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return; cv.width = w; cv.height = h;
          let here = c.start, zs = [], d = 0;
          for (const nm of c.roads) {
            const r = net.roads[net.byName.get(nm)], fwd = r.a === here;
            for (const p of (fwd ? r.points : r.points.slice().reverse())) zs.push([d + (fwd ? p[3] : r.len - p[3]), p[2]]);
            d += r.len; here = fwd ? r.b : r.a;
          }
          const lo = Math.min(...zs.map(z => z[1])), hi = Math.max(...zs.map(z => z[1])), span = Math.max(30, hi - lo), g = cv.getContext('2d');
          g.beginPath(); g.moveTo(0, h); zs.forEach(z => g.lineTo(z[0] / d * w, h - 3 - (z[1] - lo) / span * (h - 8))); g.lineTo(w, h); g.closePath();
          g.fillStyle = 'rgba(192,138,80,0.7)'; g.fill();
        });
      }
    }
    for (let i = 0; i < pages; i++) {
      const b = el('button', 'min page-btn'); b.textContent = String(i + 1); b.onclick = () => showPage(i);
      pageRow.appendChild(b);
    }
    if (pages < 2) pageRow.hidden = true;
    showPage(page);
    wrap.appendChild(body);
    requestAnimationFrame(() => pickCourse(sel));
    const foot = el('div', 'course-foot');
    // 指で押す画面（タブレット・スマホ）では「矢印を押すと」（2026-11-07。パソコンはスペースキーのまま）
    const touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    if (!inWin) foot.appendChild(el('p', 'hint', quest
      ? t(touch ? 'course.hintQuestTouch' : 'course.hintQuest', { m: settings.minutes })
      : t(touch ? 'course.hintFreeTouch' : 'course.hintFree', { effect: settings.effect })));
    const back = el('button'); back.textContent = t('ui.back'); back.onclick = inWin ? () => o.onBack() : showSelect; foot.appendChild(back);
    wrap.appendChild(foot);
    (inWin ? o.host : screen).appendChild(wrap);
    if (!inWin) view = { tick() { TR.setGrade(0); } };
  }
  /* ---------- 走っている途中のコース替え（2026-11-07 ユーザー「コース選択は右上のマップをタップしたらいつでも切り替えられるようにして」） ----------
     旅（フィールド・ミッション・続けて走る）とフリーライドで、一時停止の窓の「コースを替える」で（2026-11-08 判断 32a。前は右上の地図を押して）、コースを選ぶ窓（showCourses と同じカード・回り方・ページ）を出す。
     選んだら、そのコースの始めの場所から続ける（world.jump・ride-view の jump）。残り時間・戦闘の予定・星・総距離・記録（FIT）はそのまま。
     「戻る」なら一時停止の窓へ。戦闘の最中はボタンを押せない（「コースは戦闘のあとで」）、試練・レースでは出さない。
     ゴースト（自分の記録）は、コースを替えたあとの記録だけで作る（rec.ghostFrom。位置が飛ぶと共有サーバーが断る）。前のコースのゴーストは外す */
  const switchHost = () => (rideS ? screen.querySelector('.ride') : world ? world.layer.parentNode : null);
  function canSwitchCourse() {
    if (trialOn || (run && run.trial)) return 'trial';
    if (rideS && rideS.race) return 'race';
    if (view && view.kind === 'battle') return 'battle';
    if (rideS && view && view.jump) return 'ok';
    if (run && world && world.jump) return 'ok';
    return 'no';
  }
  let switchBox = null;
  function openCourseSwitch() {
    const why = canSwitchCourse();
    if (why !== 'ok' || switchBox) return;
    setPaused(true); $('#pause').hidden = true;
    switchBox = el('div', 'course-switch'); screen.appendChild(switchBox);
    const close = () => { if (switchBox) switchBox.remove(); switchBox = null; };
    showCourses({ host: switchBox, onBack: () => { close(); $('#pause').hidden = false; }, onPick: (id, side) => { close(); switchCourse(id, side); setPaused(false); } });
  }
  function switchCourse(id, side) {
    const course = courseOf(id), start = RQ.roadnet.courseStart(net, course, side), plan = RQ.roadnet.coursePlan(net, course, side);
    if (rideS) { if (!view.jump(start, plan, course.name)) return; rideS.course = course; rideS.side = side; }
    else if (world) world.jump(start, plan);
    const g = outing && outing.ghost; if (g) { g.course = course.id; g.side = side; }   // ゴーストは、替えたあとのコースと向きで
    if (outing) outing.course = course.id;
    if (rec) rec.ghostFrom = rec.samples.length;   // ゴーストは、ここから先の記録で作る（FIT は全部のまま）
    TR.note('course', `${course.id} ${side}`);
    window.__rq.courseSwitched = (window.__rq.courseSwitched || 0) + 1;   // テスト用
  }
  window.__rq.openCourseSwitch = openCourseSwitch; window.__rq.switchCourse = switchCourse;   // テスト用
  // 右上の地図を押す（クリック・タップ）＝次の分かれ道で曲がる向きを替える（スペースキー・画面の矢印と同じ。2026-11-08 試走 指摘 5・判断 32a：
  // ユーザー「マップをタップした時の挙動はコースを変えるんじゃなくて、行き先の切り替えだけ」）。コースを替える窓は、一時停止の窓の「コースを替える」から
  screen.addEventListener('click', e => { if (e.target && e.target.closest && e.target.closest('.world-map, .ride .minimap') && (run || rideS) && !paused) { e.stopPropagation(); toggleTurn(); } });
  function showCourseBtn() { const b = $('#b-course'), why = canSwitchCourse(); b.hidden = !(why === 'ok' || why === 'battle'); b.disabled = why === 'battle'; b.textContent = t(why === 'battle' ? 'pause.courseAfterBattle' : 'pause.course'); }
  $('#b-course').onclick = () => openCourseSwitch();
  // ゴースト（docs/impl-ghost.md）：自分の記録（G1。保存したもの）と旅人（G2）を6人。旅を始めるときに選ぶ。
  // 記録は Electron のときだけ読める（Chrome で開いたときは旅人だけ）。sec：旅人を走らせる長さ（選んだ時間＋先を走る分）
  const playerName = () => settings.playerName || t('set.namePh');
  // ほかの人のゴースト（G3。docs/impl-ghost-share.md）：設定にサーバーの URL があれば、同じコースのものを取ってくる（3秒待っても来なければ、旅人だけ）。
  // 通信は main プロセス（RQ.platform.shareFetch）。来たものは信用せず、RQ.ghost.fromServer で確かめ直す
  // 2026-10-28 ユーザー判断：同じ向きと反対向きを、それぞれサーバーの上限の 20 人まで取る（GET /ghosts の dir。サーバーは今のまま）。
  // 同じ向き → 今までどおり pickGhosts（旅を始めてからの経過でそろえる）。反対向き → encounters の oncoming（道の先で向かい合うように出し、すれ違ったら消す）
  async function fetchImported(course, side) {
    if (!settings.shareUrl || !RQ.platform.shareFetch) return { same: [], opp: [] };
    const one = async dir => {
      try {
        const wait = new Promise(res => setTimeout(() => res([]), 3500));
        const list = await Promise.race([RQ.platform.shareFetch({ url: settings.shareUrl, course: course.id, net: net.version, side: dir, limit: 20 }), wait]);
        return (Array.isArray(list) ? list : []).map(g => RQ.ghost.fromServer(net, g)).filter(g => g && g.side === dir);
      } catch (_) { return []; }
    };
    const [same, opp] = await Promise.all([one(side), one(side === 'left' ? 'right' : 'left')]);
    return { same, opp };
  }
  // → { ghosts（一緒に走る記録）, oncoming（反対向きの共有の記録。encounters.create に渡す） }
  async function pickGhosts(course, side, start, minutes) {
    let self = [];
    try { if (RQ.platform.listGhosts) self = await RQ.platform.listGhosts(net.version); } catch (_) { self = []; }
    const { same, opp } = await fetchImported(course, side);
    try { return { ghosts: RQ.travellers.pickGhosts({ net, course, side, start, self, imported: same, seed: (Date.now() % 2147483647) | 0, sec: minutes * 60 + 300, dummies: false }), oncoming: opp }; }
    catch (e) { console.warn('ゴーストを作れなかった', e); return { ghosts: [], oncoming: [] }; }
  }
  // 終わったとき、自分の走りをゴーストとして保存する（コースを選んだ旅・フリーライドだけ。試練は保存しない）
  function saveGhost(o) {
    if (!o.ghost || !RQ.platform.saveGhost || !rec || rec.samples.length - (rec.ghostFrom || 0) < 180) return;
    try {
      const g = RQ.ghost.fromSamples(net, rec.ghostFrom ? rec.samples.slice(rec.ghostFrom) : rec.samples, { name: playerName(), hero: o.hero, kind: 'self', course: o.ghost.course, side: o.ghost.side });   // コースを替えたら、替えたあとだけ
      window.__rq.lastGhost = g;   // テスト用
      RQ.platform.saveGhost(g).catch(() => {});
      // 共有：設定にサーバーの URL があり、自動で上げる設定なら、走り終えたら上げる（失敗しても何も起きない）
      if (settings.shareUrl && settings.shareAuto !== false && RQ.platform.shareUpload) RQ.platform.shareUpload({ url: settings.shareUrl, ghost: g }).catch(() => {});
    } catch (e) { console.warn('ゴーストを保存できなかった', e); }
  }
  /* ---------- レース（docs/impl-race.md）：寛保岳めぐりを決めた周回数、ゴースト9人と同じ時刻にスタートして競う ---------- */
  // 道端の NPC の話の記録（npctalk.js。くり返さないため・物語の進み）。旅（続けて走るも含めて1回）のたびに seen を空にする。10秒ごとに保存
  const TALKLOG_KEY = 'rq.talkLog';
  const talkLog = RQ.npcTalk.loadLog(loadJSON(TALKLOG_KEY, null));
  const newOutingTalks = () => { talkLog.seen = []; };
  const saveTalkLog = () => saveJSON(TALKLOG_KEY, { recent: talkLog.recent, chars: talkLog.chars, story: talkLog.story });
  let talkSaveT = 10;
  const RACES_KEY = 'rq.races';   // { 周回数: { best（最短タイム）, last（前回のタイム） } }
  const raceStat = laps => (loadJSON(RACES_KEY, {})[laps]) || {};
  const ordinal = I18N.ordinal;
  const dateStr = () => new Date().toLocaleDateString(I18N.lang === 'ja' ? 'ja-JP' : 'en-GB');   // まとめの日付（言語に合わせる）
  const raceCourse = () => courseOf(RQ.race.RACE.courseId);
  function showRace() {
    const RC = RQ.race, course = raceCourse(), laps = RC.RACE.laps, st = raceStat(laps);
    swap(null); endWorld(); U.setBg('islandMap');
    screen.innerHTML = '';
    const wrap = el('div', 'select courses');
    wrap.appendChild(el('h2', null, t('race.title', { course: course.name, laps })));
    const info = el('div', 'race-info');
    info.innerHTML = t('race.info', { km: RQ.units.dist(course.dist * laps / 1000), lap: RQ.units.dist(course.dist / 1000), up: RQ.units.elev(course.up) }) + '<br>'
      + t('race.info2', { n: RC.RACE.opponents }) + '<br>'
      + (st.best ? t('race.best', { best: RC.mmss(st.best), last: RC.mmss(st.last) }) : t('race.never'));
    wrap.appendChild(info);
    const hrow = el('div', 'minutes');
    hrow.appendChild(el('span', null, t('course.rider')));
    for (const id of D.HERO_ORDER) {
      const b = el('button', 'min who' + (id === settings.rideHero ? ' on' : '')); b.textContent = D.HEROES[id].n;
      b.onclick = () => { settings.rideHero = id; saveJSON(SETTINGS_KEY, settings); hrow.querySelectorAll('button.who').forEach(x => x.classList.toggle('on', x === b)); };
      hrow.appendChild(b);
    }
    wrap.appendChild(hrow);
    const foot = el('div', 'course-foot');
    const go = el('button', 'go-btn'); go.textContent = t('course.start'); go.onclick = () => { go.disabled = true; info.textContent = t('race.gathering'); startRace(); };
    const back = el('button'); back.textContent = t('ui.back'); back.onclick = showSelect;
    foot.appendChild(go); foot.appendChild(back);
    wrap.appendChild(foot);
    screen.appendChild(wrap);
    view = { tick() { TR.setGrade(0); } };
  }
  async function fetchRaceImported(course, laps, near) {
    if (!settings.shareUrl || !RQ.platform.shareFetchRace) return [];
    try {
      const wait = new Promise(res => setTimeout(() => res([]), 3500));
      const list = await Promise.race([RQ.platform.shareFetchRace({ url: settings.shareUrl, course: course.id, net: net.version, laps, near }), wait]);
      return (Array.isArray(list) ? list : []).map(g => RQ.ghost.fromServer(net, g)).filter(Boolean);
    } catch (_) { return []; }
  }
  async function startRace() {
    const RC = RQ.race, course = raceCourse(), laps = RC.RACE.laps, su = RC.setup(net, course, laps), st = raceStat(laps);
    const mass = RQ.ui.massKg();
    const mineTime = st.last || RC.estimateTime(net, course, U.ftp(), laps, mass);   // 自分のタイム：前回、無ければ FTP からの見込み
    let own = [];
    try { own = (await RQ.platform.listGhosts(net.version)).filter(g => g.race); } catch (_) { own = []; }
    const imported = await fetchRaceImported(course, laps, mineTime);
    await new Promise(res => setTimeout(res, 30));   // 「集めています」を描かせてから、旅人を計算する
    let field = [];
    try { field = RC.pickField({ net, course, laps, mineTime, own, imported, seed: (Date.now() % 2147483647) | 0 }); }
    catch (e) { console.warn('レースの相手を作れなかった', e); }
    if (field.length < 1) return showSelect();
    leaveRun();
    rideS = { race: { course, laps, su, field, hero: settings.rideHero, mineTime }, course, side: 'right', heroId: settings.rideHero, minutes: 180 };
    rec = newRec(); RQ.tod.sec = 0; hourReset();
    swap(RQ.views.ride(screen, { net, name: course.name, heroId: rideS.heroId, effect: settings.effect / 100, mode: 'grade', dots: dotsNow(),
      race: { su, ghosts: field, laps, countdown: RC.RACE.countdown } },
      { onGo: () => { rec = newRec(); photo = newPhoto('race', t('race.photo', { course: course.name })); }, onEnd: r => finishRace(true, r) }));
  }
  function finishRace(done, r) {
    const rs = rideS; if (!rs || !rs.race || !rec) return showSelect();
    const RC = RQ.race, { course, laps, su, field } = rs.race, hero = D.HEROES[rs.heroId], rc = rec;
    rec = null; rideS = null; run = null; swap(null); endWorld();
    const toReport = (extra = {}) => { rec = rc;
      let gain = 0; rc.samples.forEach((s, i) => { if (i && s.alt != null) gain += Math.max(0, s.alt - rc.samples[i - 1].alt); });
      const km = RQ.units.dist(rc.dist / 1000, 2), gainS = RQ.units.elev(gain);   // 表示の単位（RQ.units）
      showReport({
        hero: rs.heroId, cleared: done, course: course.id, facts: { raceRank: extra.rank },
        story: { kind: 'race', hero: heroFacts(rs.heroId), cleared: !!done, course: course.name, race: extra.race || null },
        title: done ? t('race.report') : t('race.reportQuit'),
        sub: () => t('race.reportSub', { date: dateStr(), island: D.WORLD.island, course: course.name, laps, hero: hero.n }),
        king: tr => extra.king || t('race.king', { km, gain: gainS, tss: tr.tss }),
        game: [[t('race.race'), t('race.courseLaps', { course: course.name, laps })], ...(extra.game || []), [t('rep.gain'), gainS]],
        stravaText: tr => [t('race.stravaTitle', { course: course.name, laps }), '', `${t('sel.subtitle')}　${D.WORLD.island}・${hero.n}`,
          ...(extra.strava ? [extra.strava] : []), t('rep.kmGain', { km, gain: gainS }), `NP ${tr.np} W・IF ${tr.IF.toFixed(2)}・TSS ${tr.tss}・${tr.kj} kJ`].join('\n'),
      });
    };
    if (!done || !r || !(r.time > 0)) return toReport();
    const time = r.time, rank = RC.finalRank(field, time), total = field.length + 1, st = raceStat(laps);
    const diff = st.best ? time - st.best : null, newBest = !st.best || time < st.best;
    const stats = loadJSON(RACES_KEY, {}); stats[laps] = { best: newBest ? time : st.best, last: time }; saveJSON(RACES_KEY, stats);
    // 自分のレースの記録：ローカルに残し、次の相手になる。共有が有効なら上げる（ほかの人の相手になる）
    try {
      const g = RC.raceGhost(net, rc.samples, time, laps, { name: playerName(), hero: rs.heroId });
      window.__rq.lastGhost = g;
      if (RQ.platform.saveGhost) RQ.platform.saveGhost(g).catch(() => {});
      if (settings.shareUrl && settings.shareAuto !== false && RQ.platform.shareUpload) RQ.platform.shareUpload({ url: settings.shareUrl, ghost: g }).catch(() => {});
    } catch (e) { console.warn('レースの記録を保存できなかった', e); }
    const list = RC.results(field, { name: playerName(), time, hero: rs.heroId });
    const king = rank === 1 ? t('race.king1') : rank <= 3 ? t('race.kingPodium', { place: ordinal(rank) }) : t('race.kingRest', { place: ordinal(rank) });
    screen.innerHTML = '';
    U.setBg('islandMap');
    const wrap = el('div', 'select race-result');
    wrap.appendChild(el('h2', null, t('race.result', { course: course.name, laps })));
    const big = el('div', 'race-info');
    big.innerHTML = `<span class="r-rank">${t('race.rankOf', { rank, total })}</span>　${t('race.time')} <b>${RC.mmss(time)}</b>`
      + (newBest ? (diff == null ? '' : `　<b>${t('race.newBest')}</b>`) : '　' + t('race.behindBest', { d: RC.mmss(time - st.best) }))
      + '<br>' + t('ui.says', { who: D.WORLD.queen, text: king });
    wrap.appendChild(big);
    const ul = el('div', 'race-list');
    list.forEach((x, i) => { const cls = x.me ? 'me' : ''; for (const s of [ordinal(i + 1), x.name + (x.me ? t('race.you') : ''), RC.mmss(x.time)]) { const d = el('span', cls); d.textContent = s; ul.appendChild(d); } });
    wrap.appendChild(ul);
    const foot = el('div', 'course-foot');
    const nx = el('button', 'go-btn'); nx.textContent = t('ui.toReport');
    nx.onclick = () => toReport({ rank, king, race: { rank, total, laps, time: RC.mmss(time) }, strava: `${t('race.rankOf', { rank, total })}・${t('race.time')} ${RC.mmss(time)}`, game: [[t('race.rank'), t('race.rankOf', { rank, total })], [t('race.time'), RC.mmss(time)]] });
    foot.appendChild(nx); wrap.appendChild(foot);
    screen.appendChild(wrap);
    view = { kind: 'raceResult', win: rank <= 3, tick() { TR.setGrade(0); } };   // 結果のジングル：3位以内とそれ以外（renderer/audio/recordings.js の SCENES.raceEnd）
  }

  async function startRide(courseId, side = 'right') {
    RQ.tod.sec = 0; hourReset();   // 空の時刻は、走り始めからの経過（朝から）
    const course = courseOf(courseId), start = RQ.roadnet.courseStart(net, course, side), { ghosts, oncoming } = await pickGhosts(course, side, start, settings.minutes);
    leaveRun();
    rideS = { course, side, heroId: settings.rideHero, minutes: settings.minutes };
    rec = newRec(); photo = newPhoto('ride', course.name); rideS.mark = mark();
    outing = { parts: [], ghost: { course: course.id, side }, hero: settings.rideHero, course: course.id }; newOutingTalks();
    swap(RQ.views.ride(screen, { net, start, plan: RQ.roadnet.coursePlan(net, course, side), ghosts, encounters: RQ.encounters.create({ net, ghosts, oncoming, seed: (Date.now() % 2147483647) | 0 }), talkLog, name: course.name, heroId: rideS.heroId, minutes: rideS.minutes, effect: settings.effect / 100, mode: settings.rideMode, ergPct: settings.ergPct, dots: dotsNow() },
      { onEnd: r => finishRide(true, r), onErg: pct => { settings.ergPct = pct; saveJSON(SETTINGS_KEY, settings); },
        // 選んだ時間を走りきった：止めずに「これで終わる／続けて走る（A 自由に走る／B 旅に出る）」を選ぶ（2026-10-22 ユーザー判断。design.md §4.14）
        onTimeUp: () => { const rs = rideS; if (!rs) return; rs.timeUp = true;
          askMoreWin(screen.querySelector('.ride') || screen, t('more.rideDone', { m: rs.minutes }), {
            onA: mode => { closeRide(); freeSeg = { mode, m: mark() }; if (view && view.setMode) view.setMode(mode, settings.ergPct); },
            onB: (heroId, minutes) => { const pos = view && view.position ? view.position() : null; closeRide(); swap(null); rideS = null; startQuestHere(heroId, minutes, pos); } }); } }));
  }
  function finishRide(done) {
    const rs = rideS; if (!rs || !rec) return showSelect();
    const hero = D.HEROES[rs.heroId], c = rs.course, side = startLabel(c, rs.side);
    let gain = 0; rec.samples.forEach((s, i) => { if (i && s.alt != null) gain += Math.max(0, s.alt - rec.samples[i - 1].alt); });
    const km = RQ.units.dist(rec.dist / 1000, 2), gainS = RQ.units.elev(gain);   // 表示の単位（RQ.units）
    showReport({
      hero: rs.heroId, cleared: done, course: c.id, ghost: { course: c.id, side: rs.side }, facts: { islandLoop: c.id === 'around' && rec.dist >= c.dist },
      story: { kind: 'ride', hero: heroFacts(rs.heroId), cleared: !!done, course: c.name },
      title: done ? t('ride.report') : t('ride.reportPart'),
      sub: () => t('ride.reportSub', { date: dateStr(), island: D.WORLD.island, course: c.name, side, m: rs.minutes, hero: hero.n }),
      king: tr => t('ride.king', { island: D.WORLD.island, km, gain: gainS, tss: tr.tss }),
      game: [[t('rep.course'), t('ride.courseSide', { course: c.name, side: rs.side === 'right' ? t('ride.cw') : t('ride.ccw') })], [t('rep.dist'), km], [t('rep.gain'), gainS]],
      stravaText: tr => [t('ride.stravaTitle', { course: c.name }), '',
        t('ride.stravaSub', { sub: t('sel.subtitle'), island: D.WORLD.island, m: rs.minutes, side }),
        t('ride.stravaKm', { km, gain: gainS, v: RQ.mapData.island.vScale }),
        `NP ${tr.np} W・IF ${tr.IF.toFixed(2)}・TSS ${tr.tss}・${tr.kj} kJ`].join('\n'),
    });
  }

  /* ---------- 女王の試練 ---------- */
  // 2026-10-21 ユーザー要望：試練も島のコース（既定は島一周）を走り、終わったらまとめを出して FIT を保存する
  // コースは今は島一周だけ（2026-10-21 ユーザー判断。コースは後で増やす）。スタート地点は港と浜からその都度選ぶ。
  // 道の網の上では、海岸の道（島一周）だけを走る：分かれ道では選ばせず、海岸に沿って進む（矢印は出さない）
  const TRIAL_NAME = '島一周', TRIAL_STARTS = ['北風泊', '東風泊', '日方泊', 'トリカラスノ浜'];
  const TRIAL_RING = ['弁天岬の道', 'トリカラスノ浜道', '日方泊の海岸', '堤防の海岸', '東風泊の海岸'];
  let trialInfo = null, trialStart = null, trialHero = null;   // 試練の結果（まとめに出す）と、スタート地点と、挑む主人公
  // 試練の前に挑む主人公を選ぶ（2026-10-28 ユーザー判断。前は選ぶ画面がなく、走る主人公が設定の rideHero のままだった）。
  // 選んだ主人公で走り、ペースメーカーにはその職業を並べず、試練のあとの1戦と、続けて走る旅の最初の候補もその主人公
  function pickTrialHero() {
    if (screen.querySelector('.hero-pick')) return;
    U.heroPick(screen, { hero: settings.trialHero || D.HERO_ORDER[0], minuteList: [], title: t('trial.who'), go: t('trial.go'),
      heroes: D.HERO_ORDER.map(id => { const hp = heroProg(id); return { id, lv: `Lv ${hp.level}・${D.PLANS[D.HEROES[id].plan].n}` }; }),
      onGo: id => { settings.trialHero = id; saveJSON(SETTINGS_KEY, settings); showTrial(id); }, onBack: () => {} });
  }
  function showTrial(heroId = settings.trialHero) {
    leaveRun(); RQ.tod.sec = 0; hourReset();
    trialHero = D.HEROES[heroId] ? heroId : D.HERO_ORDER[0];
    trialOn = true; trialInfo = null; rec = newRec();
    outing = { parts: [], hero: trialHero, course: 'trial' }; newOutingTalks();   // 試練のあと続けて走っても、記録・FIT・まとめは1つ（2026-10-28 ユーザー判断）
    const want = U.pick(TRIAL_STARTS), ring = new Set(TRIAL_RING.map(n => net.byName.get(n))), dirs = RQ.roadnet.followDirs(net, TRIAL_RING, '北風泊');
    const [pr, pc] = RQ.mapData.places[want], near = RQ.roadnet.positionNear(net, pr, pc, ring);
    trialStart = { name: want, road: near.road, dir: dirs.get(near.road), s: near.s };
    world = RQ.world.create(screen, { net, start: trialStart, heroId: trialHero, dots: dotsNow(), force: ring, quiet: true, pace: () => view && view.pace && view.pace() });   // 試練のペースメーカー（NPC が横を走る。見た目だけ）
    view = RQ.views.trial(world.layer, {
      onWorld: true,
      onDone(ftp, tr) {
        const prevFtp = U.ftp();
        if (ftp) {
          $('#ftp').value = ftp; saveSettings();
          const hist = loadJSON(FTP_KEY, []);
          hist.unshift({ date: new Date().toLocaleDateString('ja-JP'), ftp });
          saveJSON(FTP_KEY, hist.slice(0, 50));
        }
        trialInfo = { ftp, prevFtp, best1: tr && tr.best1, level: tr && tr.level };
        if (ftp) trialBattle(); else finishTrial();   // 新しい FTP にしたら、そのまま1戦（「記録しないで戻る」・測れなかったときは戦わずにまとめへ）

      },
    });
  }
  // 試練のあとの1戦（2026-10-26 ユーザー判断。course.js の createTrialRun）：同じ島・同じ記録のまま、クールダウン → 女王のひとこと → 雑魚1体（ドラム3本）
  // → 帰り道1分。戦闘からはいつもの ERG（試練の勾配0%・ギアは試練の間だけ）。終わったら「これで終わる／続けて走る」（旅と同じ。2026-10-28 ユーザー判断）。
  // 終えたら試練のまとめ（戦いの行を足す）、続けて走ったら合算のまとめ（試練の行＋旅の行）。FIT と Strava は1つ
  function trialBattle() {
    trialOn = false; swap(null);
    const ex = world && world.extras(), at = ex ? { road: ex.road, s: ex.s, dir: ex.dir } : trialStart;
    run = C.createTrialRun({ heroId: trialHero, prog: heroProg(trialHero), areaNow: areaNow(at) }); run.mark = { at: 0, dist0: 0 };
    if (world) world.layer.innerHTML = '';
    nextSegment();
  }
  // 試練のあとの戦いの行（まとめ・合算のまとめ・Strava の説明）
  function trialBattleRows() {
    const bt = run && run.trial ? run.stats.battles[0] : null, foeN = bt ? D.ENEMIES[bt.foes[0]].n : '';
    return bt ? [[t('trialRep.battle'), bt.skipped ? t('trialRep.battleSkip') : t(bt.defeated ? 'trialRep.battleWin' : 'trialRep.battleFled', { foe: foeN, stars: bt.stars })]] : [];
  }
  // 試練の区切りを、その日の走り（outing）に入れる（続けて走ったときの合算のまとめ用）
  function closeTrial() {
    if (!run || !run.trial || run.closed || !outing) return; run.closed = true;
    const info = trialInfo || {};
    outing.parts.push({ kind: 'trial', heroId: run.heroId, ftp: info.ftp, prevFtp: info.prevFtp, best1: info.best1, level: info.level, battle: trialBattleRows(),
      facts: { trial: !!info.ftp, ftpUp: !!info.ftp && info.ftp > (info.prevFtp || 0) }, ...span(run.mark) });
  }
  function finishTrial() {
    trialOn = false; TR.setGrade(0);
    const info = trialInfo || {}, course = { name: I18N.n(TRIAL_NAME) };
    const btRow = trialBattleRows();
    if (!rec || rec.samples.length < 1) { rec = null; endWorld(); return showSelect(); }
    showReport({
      hero: trialHero, cleared: !!info.ftp, course: 'trial', facts: { trial: !!info.ftp, ftpUp: !!info.ftp && info.ftp > (info.prevFtp || 0) },
      story: { kind: 'trial', hero: heroFacts(trialHero), cleared: !!info.ftp, course: course.name, trial: info.ftp ? { ftp: info.ftp, prev: info.prevFtp } : null },
      title: t('trialRep.title'),
      sub: () => t('trialRep.sub', { date: dateStr(), island: D.WORLD.island, course: course.name, from: I18N.n(trialStart.name) }),
      king: tr => info.ftp ? t('trialRep.king', { ftp: info.ftp }) : t('trialRep.kingQuit', { tss: tr.tss }),
      game: [['FTP', info.ftp ? `${info.ftp} W` : '—'], [t('trialRep.best1'), info.best1 ? `${info.best1} W` : '—'], [t('trialRep.step'), info.level ? t('trialRep.stepN', { n: info.level }) : '—'], ...btRow],
      stravaText: tr => [t('trialRep.stravaTitle', { queen: D.WORLD.queen }), '',
        t('trialRep.stravaSub', { sub: t('sel.subtitle'), island: D.WORLD.island, course: course.name, from: I18N.n(trialStart.name) }),
        info.ftp ? t('trialRep.stravaFtp', { ftp: info.ftp, best1: info.best1 }) : t('trialRep.noFtp'),
        ...btRow.map(r => `${r[0]}: ${r[1]}`),
        `NP ${tr.np} W・IF ${tr.IF.toFixed(2)}・TSS ${tr.tss}・${tr.kj} kJ`].join('\n'),
    });
  }

  /* ---------- 1戦だけ（練習）。選ぶ画面のボタンはなくした（2026-10-22 ユーザー判断）。テストとスクショ用に __rq.practice で残す ---------- */
  function practice(heroId, foe, setNo) {   // foe・setNo：相手とプランのセットを決めて試すとき（テスト用）
    const setup = C.practiceSetup(heroId, Math.random, setNo);
    if (foe) setup.waves.forEach(w => { if (w.foes.length === 1) w.foes = [foe]; });
    leaveRun(); practiceDist = 0;
    view = RQ.views.battle(screen, { ...setup, bg: U.pick(['s1_battle', 's1_battle2', 's1_battle3', 's1_battle4']) }, {
      endButtons: [[t('practice.again'), () => practice(heroId)], [t('practice.select'), showSelect]],
    });
  }

  /* ---------- その日の旅 ---------- */
  let questGhost = null;   // 旅で走っているコースと向き（ゴーストの保存に使う）
  async function startRun(heroId, courseId = settings.courseId, side = 'right') {
    RQ.tod.sec = 0; hourReset();   // 空の時刻は、走り始めからの経過（朝から）
    const course = courseOf(courseId), start = RQ.roadnet.courseStart(net, course, side), { ghosts, oncoming } = await pickGhosts(course, side, start, settings.minutes);
    leaveRun();
    questGhost = { course: course.id, side };
    newOutingTalks();
    run = C.createRun({ heroId, minutes: settings.minutes, prog: heroProg(heroId), talkLog, areaNow: areaNow(start) });
    rec = newRec(); photo = newPhoto('quest', `${course.name}-${D.HEROES[heroId].n}`); run.mark = mark();
    outing = { parts: [], ghost: questGhost, hero: heroId, course: course.id };
    world = RQ.world.create(screen, { net, start, plan: RQ.roadnet.coursePlan(net, course, side), heroId, dots: dotsNow(), ghosts, encounters: RQ.encounters.create({ net, ghosts, oncoming, seed: (Date.now() % 2147483647) | 0 }) });
    nextSegment();
  }
  // 敵の出る地域：いま走っている所の地形（RQ.ride.areaAt。2026-10-25 ユーザー判断）。3D の世界がまだ無ければ、走り出す所（start）
  const areaNow = start => () => { const e = world && world.extras(); const at = e || start; return at ? RQ.ride.areaAt(net, at) : null; };
  const newRec = () => ({ samples: [], acc: { p: 0, c: 0, hr: 0, s: 0, n: 0 }, dist: 0, date: new Date(), t0: Date.now(), pauseMs: 0 });
  function nextSegment() {
    if (!run) return;
    if (run.done) return askMore();   // 試練のあとの1戦も、旅と同じく「これで終わる／続けて走る」（2026-10-28 ユーザー判断）
    const s = C.seg(run);
    const layer = world ? world.layer : screen;
    if (world) world.setBattle(s.type === 'battle');
    if (s.type === 'field') view = RQ.views.field(layer, run, { onEnd: () => nextSegment(), world });
    else {
      view = RQ.views.battle(layer, C.battleSetup(run), {
        onEnd: r => { C.finishBattle(run, r); nextSegment(); },
      });
    }
  }
  /* ---------- 走り終わったあと（2026-10-22 ユーザー判断。design.md §4.14） ----------
     旅（とフリーライド）を走りきったら「これで終わる／続けて走る」。続けるなら A 自由に走る（ERG か勾配。戦闘なし）か、B キャラクターを選んで旅に出る
     （今いる所と向きのまま、ふつうの旅をはじめから）。記録は切らず、最後に1回だけまとめ（合算1枚に、旅ごとの行を並べる）・FIT・写真・ゴースト・共有。
     その日の走り（outing）は区切り（parts）を持つ：quest（旅。終わった時点でキャラの進み具合を保存）・ride（フリーライド）・free（A）。 */
  let outing = null, freeSeg = null;
  const mark = () => ({ at: rec ? rec.samples.length : 0, dist0: rec ? rec.dist : 0 });
  const span = m => ({ sec: rec && m ? rec.samples.length - m.at : 0, km: rec && m ? (rec.dist - m.dist0) / 1000 : 0 });
  // 勲章（2026-10-24）に使う、旅1つぶんのこと
  function questFacts(st, ups, cleared, heroId) {
    const bt = st.battles || [];
    return { quest: true, questDone: !!cleared, heroes: [heroId], crits: st.crits || 0, stars: st.battleStars || 0,
      bossWins: bt.filter(b => b.kind === 'boss' && b.defeated).length, eliteWins: bt.filter(b => b.kind === 'elite' && b.defeated).length,
      perfect: !!cleared && (st.drums || 0) > 0 && (st.battleStars || 0) >= st.drums && !st.skipped, legend: (ups || []).some(u => u.legend) };
  }
  function mergeFacts(list) {
    const f = { heroes: [] };
    for (const x of list) for (const [k, v] of Object.entries(x)) {
      if (k === 'heroes') f.heroes.push(...v); else if (typeof v === 'number') f[k] = (f[k] || 0) + v; else f[k] = f[k] || v;
    }
    return f;
  }
  function closeQuest() {
    if (run && run.trial) return closeTrial();
    if (!run || run.closed || !outing) return; run.closed = true;
    const prog = C.progressOf(run); saveHeroProg(run.heroId, prog);   // 旅が終わった時点で保存（あとで閉じても走ったぶんは残る）
    outing.parts.push({ kind: 'quest', heroId: run.heroId, minutes: Math.round(run.total / 60), cleared: !!run.done, score: C.score(run), stars: run.stats.stars, wins: run.stats.wins, fled: run.stats.fled, skipped: run.stats.skipped || 0,
      battleSec: run.stats.battleSec, battles: run.stats.battles, prog, ups: run.levelUps, facts: questFacts(run.stats, run.levelUps, !!run.done, run.heroId), ...span(run.mark) });
  }
  function closeRide() { if (!rideS || rideS.closed || !outing) return; rideS.closed = true; outing.parts.push({ kind: 'ride', course: rideS.course, side: rideS.side, minutes: rideS.minutes, ...span(rideS.mark) }); }
  function closeFree() { if (!freeSeg || !outing) return; outing.parts.push({ kind: 'free', mode: freeSeg.mode, ...span(freeSeg.m) }); freeSeg = null; }
  // 「これで終わる／続けて走る」→「A 自由に走る／B 旅に出る」→（A）「ERG／勾配」・（B）キャラと時間。もどるで1つ前へ
  function askMoreWin(host, title, { onA, onB }) {
    const top = () => U.endChoice(host, { title, note: t('more.note'), onEnd: () => finishOuting(true), onGo: more });
    const more = () => U.pickWin(host, { title: t('more.how'), buttons: [[t('more.a'), freeWin], [t('more.b'), heroWin], [t('more.back'), top]] });
    const freeWin = () => U.pickWin(host, { title: t('more.free'), note: t('more.freeNote'),
      buttons: [['ERG', () => onA('erg')], [t('more.grade'), () => onA('grade')], [t('more.back'), more]] });
    const heroWin = () => U.heroPick(host, { minutes: settings.minutes, minuteList: C.MINUTES, hero: run ? run.heroId : rideS ? rideS.heroId : null,   // 最初は今走っているキャラ
      heroes: D.HERO_ORDER.map(id => { const hp = heroProg(id); return { id, lv: `Lv ${hp.level}・${t('sel.toBoss', { m: toBoss(hp) })}` }; }),
      onGo: (heroId, minutes) => { settings.minutes = minutes; saveJSON(SETTINGS_KEY, settings); onB(heroId, minutes); }, onBack: more });
    top();
  }
  // 旅を走りきった（クールダウンを終えた・右上のボタンで早く終えた）。選ぶ間も止まらず、クールダウンの負荷のまま走れる
  function askMore() {
    closeQuest();
    const layer = world ? world.layer : screen;
    layer.innerHTML = '';
    view = RQ.views.extra(layer, { mode: 'wait', pct: Math.round(D.ERG_REST * 100), grade: () => (world ? world.grade() : 0), effect: settings.effect / 100,
      km: () => (freeSeg ? span(freeSeg.m).km : 0) }, { onEnd: () => finishOuting(true) });
    askMoreWin(layer, t(run && run.trial ? 'more.trialDone' : 'more.questDone'), {
      onA: mode => { freeSeg = { mode, m: mark() }; view.setMode(mode); },
      onB: (heroId, minutes) => { const ex = world && world.extras(), pos = ex ? { road: ex.road, s: ex.s, dir: ex.dir } : null; startQuestHere(heroId, minutes, pos); },
    });
  }
  // B：今いる所と向きのまま、新しい旅をはじめから（コース選び・右回り／左回りは出さない）。記録・写真・その日の走りはそのまま続ける
  function startQuestHere(heroId, minutes, start) {
    run = C.createRun({ heroId, minutes, prog: heroProg(heroId), talkLog, cont: true, areaNow: areaNow(start) }); run.mark = mark();   // 続けて走る旅：話の記録は同じもの（同じセリフをくり返さない）
    const st = start || (world && (e => ({ road: e.road, s: e.s, dir: e.dir }))(world.extras())) || RQ.roadnet.courseStart(net, courseOf(settings.courseId), 'right');
    swap(null); endWorld();
    world = RQ.world.create(screen, { net, start: st, heroId, dots: dotsNow(), ghosts: [], encounters: RQ.encounters.create({ net, ghosts: [], seed: (Date.now() % 2147483647) | 0 }) });
    nextSegment();
  }
  // 最後のまとめ：区切りが1つだけなら今までのまとめ（旅・フリーライド）、2つ以上なら合算のまとめ
  function finishOuting(cleared = true) {
    if (!outing) return run ? showSummary(cleared) : rideS ? finishRide(cleared) : showSelect();
    const single = !outing.parts.length && !freeSeg;
    if (single) return run && run.trial ? finishTrial() : run ? showSummary(cleared) : rideS ? finishRide(cleared) : showSelect();
    if (run) closeQuest();
    closeRide(); closeFree();
    const P = outing.parts;
    if (P.length === 1 && P[0].kind === 'trial') return finishTrial();   // 試練だけ（続けて走らなかった）：今までどおり試練のまとめ
    if (P.length === 1 && P[0].kind === 'quest' && run) return showSummary(P[0].cleared);
    if (P.length === 1 && P[0].kind === 'ride' && rideS) return finishRide(true);
    showOutingReport(cleared);
  }
  function showOutingReport(cleared) {
    const P = outing.parts, quests = P.filter(p => p.kind === 'quest'), lastQ = quests[quests.length - 1], trialP = P.find(p => p.kind === 'trial');
    let qi = 0;
    const label = p => p.kind === 'quest' ? t('out.quest', { hero: D.HEROES[p.heroId].n }) : p.kind === 'trial' ? t('out.trial') : p.kind === 'ride' ? t('out.ride') : t('out.free');
    const rows = P.flatMap(p => p.kind === 'trial' ? [[t('out.trial'), p.ftp ? t('out.trialRow', { ftp: p.ftp, best1: p.best1, n: p.level }) : t('trialRep.noFtp')], ...p.battle] : [p.kind === 'quest'
      ? [t('out.questN', { n: ++qi, hero: D.HEROES[p.heroId].n }), t('out.questRow', { m: p.minutes, part: p.cleared ? '' : t('out.part'), score: p.score, stars: p.stars, wins: p.wins, fled: p.fled, lv: p.prog.level, boss: toBoss(p.prog) }) + (p.skipped ? t('out.skipped', { n: p.skipped }) : '')]
      : p.kind === 'ride' ? [t('out.ride'), `${p.course.name} ${U.mmss(p.sec)}・${RQ.units.dist(p.km, 2)}`]
      : [t('out.freeDone'), `${p.mode === 'erg' ? 'ERG' : t('more.grade')} ${U.mmss(p.sec)}・${RQ.units.dist(p.km, 2)}`]]);
    const upText = quests.map(p => {
      if (!p.ups.length) return '';
      const items = p.ups.flatMap(u => u.items), last = p.ups[p.ups.length - 1].to;
      return (p.ups.some(u => u.legend) ? t('up.legend') : '') + t('up.level', { hero: D.HEROES[p.heroId].n, lv: last, phase: D.PHASES[last - 1] }) + (items.length ? t('up.items', { items: items.map(it => it.n).join(t('ui.and')) }) : '');
    }).join('');
    const min = rec ? Math.round(rec.samples.length / 60) : 0, names = P.map(label).join('・');
    showReport({
      hero: (lastQ || {}).heroId || outing.hero, cleared, course: outing.course, ghost: outing.ghost, levelUp: quests.some(p => p.ups.length), feel: quests.length > 0,
      facts: mergeFacts([...quests.map(p => p.facts || {}), ...P.filter(p => p.kind === 'trial').map(p => p.facts), ...P.filter(p => p.kind === 'ride').map(p => ({ islandLoop: p.course.id === 'around' && p.km * 1000 >= p.course.dist }))]),
      story: { kind: 'outing', hero: lastQ ? heroFacts(lastQ.heroId) : null, cleared: !!cleared, ...questStory({ battles: quests.flatMap(p => p.battles || []), wins: quests.reduce((a, p) => a + p.wins, 0), fled: quests.reduce((a, p) => a + p.fled, 0), stars: quests.reduce((a, p) => a + p.stars, 0) }, quests.flatMap(p => p.ups)), score: quests.length ? quests.reduce((a, p) => a + p.score, 0) : null,
        trial: trialP && trialP.ftp ? { ftp: trialP.ftp, prev: trialP.prevFtp } : null },
      title: t('out.title', { names }),
      sub: () => t('out.sub', { date: dateStr(), island: D.WORLD.island, m: min, diff: t('diff.' + U.difficulty()) }),
      king: tr => (trialP && trialP.ftp ? t('out.kingTrial', { ftp: trialP.ftp }) : '') + (lastQ ? t('out.kingHero', { hero: D.HEROES[lastQ.heroId].n }) : t('out.kingIsland', { island: D.WORLD.island })) + t('out.kingTss', { tss: tr.tss }) + upText,
      game: rows,
      stravaText: tr => [`Ride on Quest: ${names}`, '', t('out.stravaSub', { sub: t('sel.subtitle'), island: D.WORLD.island, m: min }),
        ...rows.map(r => `${r[0]}: ${r[1]}`), `NP ${tr.np} W・IF ${tr.IF.toFixed(2)}・TSS ${tr.tss}・${tr.kj} kJ`].join('\n'),
    });
  }

  // 1秒ごとの記録（まとめに使う）
  function record(dt, v) {
    // フリーライドと旅は、位置と標高も
    const a = rec.acc, ex = world ? world.extras(view && (view.lapKind ? view.lapKind() : view.kind)) : view && view.extras ? view.extras() : null;
    if (ex) v = ex.v;
    a.p += S.power * dt; a.c += S.cad * dt; a.hr += (S.hr || 0) * dt; a.s += v * dt; a.n += dt;
    while (a.n >= 1) {   // 早送りのときは1回で数秒ぶん進むので、平均を残りの時間にも持ち越す
      const p = a.p / a.n, c = a.c / a.n, hr = a.hr / a.n, sp = a.s / a.n;
      rec.dist += sp;
      // t：その秒の時刻（一時停止のぶんだけ後ろにずれる。FIT ではすき間がタイマーの停止になる）
      const smp = { t: rec.t0 + rec.samples.length * 1000 + rec.pauseMs, p: Math.round(p), c: Math.round(c), hr: S.hr ? Math.round(hr) : null,
        s: Math.round(sp * 100) / 100, d: Math.round(rec.dist * 10) / 10, k: ex ? ex.lapKey : view && view.kind === 'battle' ? 'battle' : 'field' };
      if (ex) { smp.lat = ex.lat; smp.lon = ex.lon; smp.alt = ex.alt; smp.rd = ex.road; smp.rs = ex.s; smp.rdir = ex.dir; }   // rd・rs・rdir：道の網の上の位置（道の添え字・道の上の距離・向き）。ゴースト（docs/impl-ghost.md）の元
      rec.samples.push(smp);
      a.n -= 1; a.p = p * a.n; a.c = c * a.n; a.hr = hr * a.n; a.s = sp * a.n;
    }
  }

  function showSummary(cleared) {
    const r = run; if (!r || !rec) return showSelect();
    const hero = D.HEROES[r.heroId], prog = C.progressOf(r), ups = r.levelUps;
    saveHeroProg(r.heroId, prog);   // 途中でやめても、走ったぶんは進む
    const lvText = ups.length
      ? (ups.some(u => u.legend) ? t('up.legendFull') : '') + t('up.level', { hero: hero.n, lv: ups[ups.length - 1].to, phase: D.PHASES[ups[ups.length - 1].to - 1] })
        + (ups.flatMap(u => u.items).length ? t('up.itemsSee', { items: ups.flatMap(u => u.items).map(it => it.n).join(t('ui.and')) }) : '')
      : t('up.nextBoss', { m: toBoss(prog) });
    showReport({
      hero: r.heroId, cleared, ghost: questGhost, levelUp: ups.length > 0, feel: true, facts: questFacts(r.stats, ups, cleared, r.heroId),
      story: { kind: 'quest', hero: heroFacts(r.heroId), diff: t('diff.' + U.difficulty()), cleared: !!cleared, score: C.score(r), ...questStory(r.stats, ups) },
      title: cleared ? t('quest.reportDone') : t('quest.report'),
      sub: () => t('quest.reportSub', { date: dateStr(), hero: hero.n, stage: C.STAGE_NAME, m: Math.round(r.clock / 60),   // 走った長さ（短い旅は選んだ時間の前後3分。2026-10-25）
      diff: t('diff.' + U.difficulty()) }),
      king: tr => (cleared ? t('quest.king', { hero: hero.n, tss: tr.tss }) : t('quest.kingQuit', { tss: tr.tss })) + lvText,
      game: [[t('rep.score'), `${C.score(r)}`], [t('rep.stars'), `★ ${r.stats.stars}`], [t('rep.wins'), `${r.stats.wins}`], [t('rep.fled'), `${r.stats.fled}`], ...(r.stats.skipped ? [[t('rep.skipped'), `${r.stats.skipped}`]] : []), [t('rep.battleTime'), U.mmss(r.stats.battleSec)],
        [hero.n, t('quest.heroRow', { lv: prog.level, phase: D.PHASES[prog.level - 1], boss: toBoss(prog) })]],
      stravaText: tr => [
        t('quest.stravaTitle', { stage: C.STAGE_NAME, hero: hero.n }), '',
        t('quest.stravaSub', { sub: t('sel.subtitle'), m: Math.round(r.clock / 60), hero: hero.n, lv: prog.level }) + (ups.length ? t('quest.stravaBoss', { lv: ups[0].from }) : ''),
        `NP ${tr.np} W・IF ${tr.IF.toFixed(2)}・TSS ${tr.tss}・${tr.kj} kJ`,
        t('quest.stravaScore', { score: C.score(r), stars: r.stats.stars, wins: r.stats.wins, diff: t('diff.' + U.difficulty()) }),
      ].join('\n'),
    });
  }

  // 今週の回数と分（目標つき）と、続けた日数（renderer/game/habit.js）。まだ走った記録が無ければ空
  function habitLine() {
    const recs = loadJSON(RECORD_KEY, []), w = RQ.habit.week(recs), n = RQ.habit.streak(recs);
    if (!w.n && !n) return '';
    return [RQ.habit.weekText(w, RQ.habit.goalOf(settings.weekGoal), t), RQ.habit.streakText(n, t)].filter(Boolean).join(t('habit.sep'));
  }

  // Strava の説明文の「冒険記」（2026-11-03 ユーザー判断：まとめを出したら裏で頼み、届いたら説明の一番上に入れる。FIT の説明にも入れる）
  const heroFacts = id => { const h = D.HEROES[id]; return h ? { name: I18N.n(h.n), sex: h.sex, plan: D.PLANS[h.plan] ? I18N.n(D.PLANS[h.plan].n) : null } : null; };
  function questStory(stats, ups) {   // 旅の戦いとレベル（stats：course.js の run.stats の形。ups：run.levelUps）
    const items = (ups || []).flatMap(u => u.items || []).map(it => I18N.n(it.n));
    return {
      level: ups && ups.length ? { from: ups[0].from, to: ups[ups.length - 1].to } : null, items,
      battles: RQ.storyFacts.battlesOf(stats, id => (D.ENEMIES[id] ? I18N.n(D.ENEMIES[id].n) : null)),
      wins: stats.wins, fled: stats.fled, stars: stats.stars, crits: stats.crits || 0,
    };
  }
  // 冒険記を頼む → 文 | null。ゴーストの共有の URL が空・1分未満・失敗なら null（今の説明文のまま）
  function askStory(o, tr, samples, dist) {
    if (!o.story || !settings.shareUrl || !RQ.platform.writeStory || samples.length < 60) return Promise.resolve(null);
    try {
      let gain = 0; samples.forEach((x, i) => { if (i && x.alt != null && samples[i - 1].alt != null) gain += Math.max(0, x.alt - samples[i - 1].alt); });
      const roadName = i => (net.roads[i] ? I18N.n(net.roads[i].name) : null);
      const facts = RQ.storyFacts.collect({ ...o.story, lang: I18N.lang, island: D.WORLD.island, min: Math.round(tr.sec / 60),
        route: RQ.storyFacts.routeOf(samples, roadName), places: RQ.storyFacts.placesOf(samples, net.roads, I18N.n),
        km: dist / 1000, gain, np: tr.np, avgW: tr.avgP, IF: tr.IF, tss: tr.tss, kj: tr.kj });
      return RQ.platform.writeStory({ url: settings.shareUrl, facts }).catch(() => null);
    } catch (e) { console.error('冒険記を頼めなかった', e); return Promise.resolve(null); }
  }

  // 月のレポート（試作）：走りごとの数値（monthly.js の rideMetrics）を手元に残し、B ならサーバーにも上げる
  const RIDES_KEY = 'rq.rides', OWNER_KEY = 'rq.reportOwner';
  function reportOwner() {   // B の持ち主の合言葉（このパソコンで作る。記録の書き出しに入るので、別のパソコンへも持っていける）
    let k = null; try { k = localStorage.getItem(OWNER_KEY); } catch (_) {}
    if (!/^[0-9a-f]{64}$/.test(k || '')) { k = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join(''); try { localStorage.setItem(OWNER_KEY, k); } catch (_) {} }
    return k;
  }
  function saveRideMetrics(samples, startMs, ftp, kind) {
    try {
      if (samples.length < 60) return;
      const ride = RQ.monthly.rideMetrics(samples, { ftp, hrMax: settings.hrMax || 185, start: startMs, kind });
      saveJSON(RIDES_KEY, RQ.monthly.add(loadJSON(RIDES_KEY, []), ride));
      if (settings.reportMode === 'server' && settings.shareUrl && RQ.platform.ridesUpload) RQ.platform.ridesUpload({ url: settings.shareUrl, owner: reportOwner(), ride }).catch(() => {});
    } catch (e) { console.error('走りの数値を残せなかった', e); }
  }
  // A：手元の走りの数値。アプリ版は「書類/Ride on Quest」の FIT からも作る（手元に無い走りだけ。走り始めが2分以内なら同じ走り）
  async function localRides(months) {
    let rides = loadJSON(RIDES_KEY, []);
    if (RQ.platform.fitMonths) {
      try {
        const fits = await RQ.platform.fitMonths({ months });
        for (const f of fits || []) {
          if (rides.some(r => Math.abs(r.start - f.start) < 120000)) continue;
          rides = RQ.monthly.add(rides, RQ.monthly.rideMetrics(f.samples, { ftp: f.ftp || U.ftp(), hrMax: settings.hrMax || 185, start: f.start, kind: 'fit' }));
        }
      } catch (e) { console.error('FIT を読めなかった', e); }
    }
    return rides;
  }

  // まとめの画面（旅・フリーライド共通）：記録を保存し、まとめを出し、FIT を保存する。
  // o.sub・o.king・o.stravaText はトレーニングの計算結果 t を受け取る関数
  // 勲章（2026-10-24 ユーザー判断。renderer/game/badges.js）：まとめのたびに、その回のことを足して数え、新しく取った勲章の ID を返す。
  // その回のこと：o.facts（旅・試練・レース・島一周）と、記録から分かること（秒・獲得標高・通った道）
  function badgesAfter(o, tr, recs, up) {
    try {
      const smp = rec.samples, roads = {};
      let gain = 0; smp.forEach((x, i) => { if (i && x.alt != null && smp[i - 1].alt != null) gain += Math.max(0, x.alt - smp[i - 1].alt); });
      for (const x of smp) if (x.rd != null) { const r = roads[x.rd] || (roads[x.rd] = { lo: Infinity, hi: -Infinity }); r.lo = Math.min(r.lo, x.rs); r.hi = Math.max(r.hi, x.rs); }
      const done = Object.entries(roads).filter(([i, r]) => net.roads[i] && r.hi - r.lo >= net.roads[i].len * 0.6).map(([i]) => +i);   // 道の6割以上を通った道
      const facts = { ...(o.facts || {}), sec: tr.sec, gain, roads: done, ftpUp: !!((o.facts || {}).ftpUp || up.ups) };
      const r = RQ.badges.update(loadJSON(BADGE_KEY, null), facts, recs, { goal: RQ.habit.goalOf(settings.weekGoal), roadsTotal: net.roads.length });
      saveJSON(BADGE_KEY, r.state);
      return r.fresh;
    } catch (e) { console.error('勲章を数えられなかった', e); return []; }
  }

  // 旅のあとの「きつさ」（2026-10-24 ユーザー判断）：まとめの前に 楽・ちょうど・きつい・無理 を1つ選んでもらい（選ばなくてもよい）、
  // FTP を ◀ ▶ と同じ 5 W 刻みで上げ下げする（範囲も同じ。変えた値が次の既定値）。まとめに「FTP を ○ W にしました」と出す。旅を含むまとめだけ
  const FEEL = [['easy', 1], ['ok', 0], ['hard', -1], ['max', -2]];   // FTP_STEP の何倍か
  let feeling = false;   // 選んでいる間は、時計と記録を止める
  function askFeel(o) {
    feeling = true;
    const host = (world && world.layer) || screen, go = d => { feeling = false; showReport({ ...o, feel: false, feltD: d }); };
    U.pickWin(host, { title: t('feel.title'), note: t('feel.note'), cls: 'feel',
      buttons: [...FEEL.map(([k, d]) => [t('feel.' + k), () => go(d)]), [t('feel.skip'), () => go(null), 'feel-skip']] });
  }
  function showReport(o) {
    if (o.feel) return askFeel(o);
    const ftp = U.ftp(), tr = RQ.training.summarize(rec.samples, ftp);
    const recs = loadJSON(RECORD_KEY, []);
    recs.unshift({ date: rec.date.toLocaleDateString('ja-JP'), day: RQ.habit.dayKey(rec.date), hero: o.hero, course: o.course, min: Math.round(tr.sec / 60), km: (rec.dist / 1000).toFixed(1), avgW: tr.avgP, np: tr.np, tss: tr.tss, kj: tr.kj, cleared: o.cleared });
    saveJSON(RECORD_KEY, recs.slice(0, 400));   // 続けた日数を数えるので、多めに残す
    // プレイヤーの経験値（TSS）。レベルが上がったら FTP を上げる（次の旅から効く。まとめの計算は今の FTP のまま）
    const pl = loadJSON(PLAYER_KEY, { xp: 0 }), up = RQ.progress.addXp(pl.xp, tr.tss);
    saveJSON(PLAYER_KEY, { xp: up.xp });
    let king = o.king(tr);
    if (o.feltD != null) {   // きつさで FTP を変える（まとめの計算は、走ったときの FTP のまま）
      const el = $('#ftp'), n = Math.max(+el.min || 50, Math.min(+el.max || 500, U.ftp() + o.feltD * FTP_STEP));
      if (n !== U.ftp()) { el.value = n; saveSettings(); king += t('feel.ftp', { ftp: n }); } else king += t('feel.ftpSame', { ftp: n });
    }
    if (up.ups || o.levelUp) RQ.sfx.play('levelup', 0.6);   // キャラクターかプレイヤーのレベルが上がった
    if (up.ups) { $('#ftp').value = U.ftp() + up.ftpUp; saveSettings(); king += t('up.player', { lv: up.level, up: up.ftpUp, ftp: U.ftp() }); }
    const game = [...o.game, [t('rep.player'), t('rep.playerRow', { lv: up.level, xp: Math.round(tr.tss), next: RQ.progress.toNext(up.xp) })]];
    const hl = habitLine(); if (hl) game.push(['', hl]);   // 今週の回数と分、続けた日数
    { const nb = badgesAfter(o, tr, recs, up); if (nb.length) game.push([t('badge.new'), nb.map(id => `${RQ.badges.BADGES.find(b => b.id === id).sym} ${t('badge.' + id)}`).join('　')]); }   // 新しく取った勲章
    saveGhost(o);
    saveRideMetrics(rec.samples, rec.t0, ftp, o.kind || null);   // 月のレポート（試作）の走りの数値
    const samples = rec.samples, dist = rec.dist, startMs = rec.t0, stravaText = o.stravaText(tr) + '\n' + t('sum.stravaLink');   // 説明の終わりに紹介ページ（2026-10-25 ユーザー要望）
    const storyP = askStory(o, tr, samples, dist).then(story => (story ? RQ.storyFacts.withStory(stravaText, story) : null));   // 冒険記入りの文（届かなければ null）
    const fitDesc = text => text.split('\n').slice(2).filter(Boolean).join(' / ');
    run = null; rec = null; rideS = null; outing = null; freeSeg = null; swap(null); endWorld();
    const fitness = { series: RQ.fitness.series(recs), weekly: RQ.fitness.weekly(recs), now: RQ.fitness.now(recs) };   // 体力の推移（今日の旅も入れて）
    swap(RQ.views.summary(screen, { stravaText, title: o.title, sub: o.sub(tr), samples, ftp, hrMax: settings.hrMax || 185, rider: RQ.ui.riderKg(), dist, king, game, fitness, onBack: showSelect }));
    { const sv = view; storyP.then(text => { if (text && sv.setStravaText) { sv.setStravaText(text); window.__rq.storyText = text; } }); }   // 届いたら「説明をコピー」の中身を差し替える
    const ph = photo; photo = null;
    // ブラウザ版：FIT・道中の写真・まとめの画像を1つの zip でダウンロード（2026-10-22 ユーザー要望）。グラフが描き終わるのを待ってから
    if (RQ.platform.saveBundle) {
      // FIT の説明にも冒険記を入れるので、冒険記を待ってから zip にする（届かなければ、待つのは最大 25 秒＝sharecore の STORY_TIMEOUT_MS）
      const sv = view, [name] = stravaText.split('\n'), shots = ph && settings.photos !== false ? ph.shots : [];
      const wait = new Promise(res => setTimeout(res, 1500));
      if (samples.length >= 60 || shots.length) Promise.all([storyP, wait]).then(([text]) => {
        const fit = samples.length >= 60 ? { samples, ftp, name, description: fitDesc(text || stravaText) } : null;
        return RQ.platform.saveBundle({ fit, photos: shots, startMs, label: ph ? ph.label : '' });
      }).then(r => sv.setBundle(r), e => sv.setBundle({ error: e.message }));
      return;
    }
    // 道中の写真：まとめの画像と一緒に保存（Electron は FIT と同じフォルダ）。グラフが描き終わるのを待ってから
    if (ph && ph.shots.length && settings.photos !== false && RQ.platform.savePhotos) {
      const sv = view;
      setTimeout(() => RQ.platform.savePhotos({ photos: ph.shots, startMs, label: ph.label }).then(r => sv.setPhotos && sv.setPhotos(r), e => sv.setPhotos && sv.setPhotos({ error: e.message })), 1500);
    }
    // FIT を保存する（1分未満の記録は保存しない）。Electron はすぐ「書類」に保存（ブラウザ版は上の zip に入る）
    if (RQ.platform.saveFit && samples.length >= 60) {
      const sv = view;
      const [name] = stravaText.split('\n');
      const fitP = RQ.platform.saveFit({ samples, ftp, startMs, name, description: fitDesc(stravaText) });
      fitP.then(file => sv.setFit({ file }), e => sv.setFit({ error: e.message }));
      // 冒険記が届いたら、同じ名前の FIT を、冒険記入りの説明で書き直す（名前は走り始めの日時なので同じファイルになる）
      Promise.all([fitP, storyP]).then(([, text]) => text && RQ.platform.saveFit({ samples, ftp, startMs, name, description: fitDesc(text) })).catch(e => console.error('冒険記入りの FIT を書けなかった', e));
    }
  }

  // 今の場面（音楽が曲を選ぶのに使う。場面 → 曲の表は renderer/audio/recordings.js、手作りの曲の規則は scenes.js）。フリーライドはフィールドと同じ曲
  const sceneOf = () => (rideS && rideS.race ? raceScene() : view && view.kind === 'raceResult' ? { kind: 'raceEnd', variant: view.win ? 'win' : 'lose' } : { kind: view && view.kind === 'battle' ? (window.__rq.battle && window.__rq.battle.kind === 'boss' ? 'boss' : 'battle')
    : view && view.kind === 'summary' ? 'summary' : trialOn ? 'trial' : run ? (run.seg && run.seg.home ? 'cooldown' : 'field') : rideS ? 'field' : 'title', area: fieldArea() });
  // レース（2026-10-22）：カウントダウンの間は無音（raceWait）、走り出したらレースの曲、最後の周は final（少し速く）
  const raceScene = () => { const r = window.__rq.ride, laps = rideS.race.laps; return { kind: r && r.clock > 0 ? 'race' : 'raceWait', final: !!(r && r.goal && r.ridden / r.goal * laps >= laps - 1) }; };
  // フィールドの曲を地面で替える（2026-10-22）：主人公がいる所の区分（海岸・草地と森・火山。renderer/game/area.js）
  const fieldArea = () => { const p = world ? world.extras() : view && view.extras ? view.extras() : null; return p && p.lat != null ? RQ.area.areaAt(RQ.mapData.island, p.lat, p.lon) : null; };

  // 1秒ごとのコマ数（重さを測る。window.__rq.fps。docs/impl-web.md §5）
  { let n = 0, t0 = performance.now(); const f = now => { n++; if (now - t0 >= 1000) { window.__rq.fps = Math.round(n * 1000 / (now - t0)); n = 0; t0 = now; } requestAnimationFrame(f); }; requestAnimationFrame(f); }

  /* ---------- 道中の写真（2026-10-22 ユーザー要望）：走っている間に3枚、見栄えのよい場面で自動で撮り、まとめのときに保存する ---------- */
  // 撮るのは今の画面そのまま（RQ.platform.capturePhoto。3D が描かれた直後の、時計の処理の終わりで呼ぶ）。女王の試練では撮らない。
  // 旅：①フィールド（会話の窓が出ているとよい）②戦闘の最中（ドラムが回っている）③ボスか帰り道。フリーライド：走る時間の 1/4・1/2・3/4（分かれ道の矢印が出ていればそこで）。
  // レース：周回で（1周目・3周目・最後の周のそれぞれ途中。速い人でも3枚そろう）。続けて撮らないよう、45秒（走った時間）あける（レースは20秒）
  let photo = null;
  // label：写真の名前に入れる（コース名など。どの旅のものか分かるように）
  const newPhoto = (kind, label) => settings.photos === false ? null : { kind, label, shots: [], done: [false, false, false], lastAt: -1e9, busy: false };
  const visible = sel => { const e = screen.querySelector(sel); return !!e && !e.hidden && e.offsetParent !== null; };
  function photoSlot(p, el) {
    if (view !== p.view) { p.view = view; p.viewAt = el; }   // 場面が変わってから8秒は撮らない（前の場面が消えきっていない）
    const settled = el - p.viewAt >= 8, b = window.__rq.battle, reel = view && view.kind === 'battle' && b && b.phase === 'reel' && b.t > 8;
    const talkText = (screen.querySelector('.talk .text') || {}).textContent || '', talking = visible('.talk');
    if (talkText !== p.talkText) { p.talkText = talkText; p.talkAt = el; }
    if (talking && (talkText.length < 14 || el - p.talkAt < 2)) return -1;   // 会話の窓は、字が出そろって2秒たってから（次の行に変わる途中を撮らない）
    const field = settled && view && view.kind === 'field';
    const ready = p.kind === 'quest' && run ? [
      field && el >= 60 && (talking || el >= run.total * 0.3),
      reel && b.kind !== 'boss',
      (reel && b.kind === 'boss') || (field && el >= run.total * 0.85),
    ] : p.kind === 'ride' && rideS ? [0.25, 0.5, 0.75].map(f => el >= rideS.minutes * 60 * f && (visible('.turn') || el >= rideS.minutes * 60 * f + 30))
      : p.kind === 'race' && window.__rq.ride && window.__rq.ride.goal ? (lapsDone => [0.5, 2.5, -0.5].map(at => lapsDone >= (at < 0 ? rideS.race.laps + at : at)))(window.__rq.ride.ridden / window.__rq.ride.goal * rideS.race.laps) : [];   // レース：周回で（1周目の途中・3周目の途中・最後の周の途中）
    return ready.findIndex((r, i) => r && !p.done[i]);
  }
  function photoTick() {
    const p = photo; if (!p || p.busy || paused || !rec || !RQ.platform.capturePhoto) return;
    const el = rec.samples.length; if (el - p.lastAt < (p.kind === 'race' ? 20 : 45)) return;
    const i = photoSlot(p, el); if (i < 0) return;
    p.done[i] = true; p.lastAt = el; p.busy = true;
    RQ.platform.capturePhoto().then(blob => { if (blob) p.shots.push(blob); }, e => console.warn('道中の写真を撮れなかった', e)).finally(() => { p.busy = false; });
  }

  /* ---------- 時計（50ms ごと） ---------- */
  let v = 0, last = performance.now(), practiceDist = 0;
  // 自動の一時停止（2026-10-24 ユーザー判断）：旅・フリーライド・女王の試練の間、パワーが0のまま AUTO_PAUSE 秒たったら、時計と記録を止める
  // （戦闘のドラム・3D の世界も止まる。記録の時刻は一時停止と同じく pauseMs でずらすので、FIT は1つのまま）。漕ぎ出したら続ける。レースは止めない
  const AUTO_PAUSE = 2;
  let still = 0, autoPaused = false;
  const ERG_OFF_SEC = 20; let ergOff = 0;   // ERG の目標とパワーが離れている秒数
  // 時計の中の例外で、毎コマの処理（HUD・戦闘・負荷の頼み）が止まらないようにする（2026-11-07 試走「画面表示が変わらないのに ERG が強いまま」）。
  // 部分ごとに捕まえて記録し（window.__rq.errors と Bluetooth の記録）、次のコマも続ける。負荷の頼みが止まったら、trainer.js の見張りが ERG を下げる
  window.__rq.errors = [];
  const guard = (what, fn) => {
    try { return fn(); } catch (e) {
      const key = what + ': ' + (e && e.message);
      const hit = window.__rq.errors.find(x => x.key === key);
      if (hit) hit.n++;
      else { if (window.__rq.errors.length < 30) window.__rq.errors.push({ key, n: 1, stack: String(e && e.stack || e).slice(0, 800) }); console.error('時計の中で例外（' + what + '）', e); try { TR.note('error', key); } catch (_) {} }
    }
  };
  setInterval(() => {
    const now = performance.now(), real = Math.min(0.5, (now - last) / 1000); last = now;
    guard('trainer', () => TR.tick(now));
    guard('clock', () => clockTick(now, real));
  }, 50);
  function clockTick(now, real) {
    const dt = real * (window.__rq.timeScale || 1);
    v = RQ.phys.physStep(v, S.power, S.grade, RQ.ui.massKg(), real);
    if (S.power > 0) v = Math.max(v, D.TUNE.minKmh / 3.6);   // 漕いでいる間は最低 1 km/h
    if ((run || rideS || trialOn) && !(rideS && rideS.race) && !paused) {
      // 下り坂を惰性で進んでいる間（パワー 0 でも重力で進む）は止めない。止めたら速さも 0 にする（2026-10-26 ユーザー判断：「止まっています」なのに 3 km/h と出ていた）
      const hi = (world && world.hudInfo()) || (view && view.hudInfo && view.hudInfo()) || null, coasting = !!(hi && hi.grade < -0.01 && hi.v > 1.4);
      still = S.power > 0 || coasting ? 0 : still + real;
      const was = autoPaused; autoPaused = still >= AUTO_PAUSE;
      if (autoPaused && !was) { v = 0; for (const o of [world, view]) if (o && o.halt) o.halt(); }
    }
    else { still = 0; autoPaused = false; }
    const halt = paused || autoPaused || feeling;
    // ERG が効いていない：回しているのに、パワーが目標より長く低い（トレーナーが ERG を受けていない・回転が低すぎるなど）。HUD に小さく知らせる。
    // 目標より高いときは出さない（2026-10-27 ユーザー判断：戦闘中、強い区間に入った直後などに頻繁に出ていた）
    ergOff = S.erg != null && !halt && S.cad >= 40 && S.erg - S.power > Math.max(25, S.erg * 0.25) ? ergOff + real : 0;
    if (halt && rec) rec.pauseMs += dt * 1000;
    if (autoPaused && !paused && S.ergWant != null && S.erg != null) U.load({ erg: S.ergWant }, real);   // 自動の一時停止の間も、足が止まったかを見て ERG を 0 にする（画面の時計は止まっているので、ここで回す）
    if (!rec && view && view.kind === 'battle' && !paused) practiceDist += v * dt;   // 1戦だけ：記録はしないが、走った距離は出す（速さと食い違わないように）
    if (!halt) {
      if (world) guard('world', () => world.tick(dt));
      if ((run || rideS || trialOn) && rec && !(view && view.holding && view.holding())) guard('record', () => record(dt, v));
      if (view) guard('view', () => view.tick(dt, now));
      if ((run || rideS) && (talkSaveT -= real) <= 0) { talkSaveT = 10; saveTalkLog(); }
    }
    // 走行データの表示：旅・フリーライド・1戦だけの間はいつも出す
    RQ.hud.show(!!(run || rideS || trialOn || (view && view.kind === 'battle')));
    const pb = !(run || rideS || trialOn) || paused; if ($('#b-pause').hidden !== pb) $('#b-pause').hidden = pb;
    RQ.music.scene(sceneOf());
    { const ok = uturnOk(); if (uturnBtn.hidden === ok) uturnBtn.hidden = !ok; if (ok) { const w = reverser().reverseWait() > 0; if (uturnBtn.disabled !== w) uturnBtn.disabled = w; } }
    ftpBox.hidden = !ftpAdjustable();
    skipBtn.hidden = !(run && !run.done && !paused && view && view.kind === 'battle' && view.canSkip && view.canSkip());
    if (!ftpBox.hidden) ftpBox.querySelector('b').textContent = `${U.ftp()} W`;
    const h = (world && world.hudInfo()) || (view && view.hudInfo && view.hudInfo()) || { ele: 0, grade: S.grade, v };   // 3D の中では、その速さ
    {
      // 残り時間：旅は旅の終わりまで（戦闘中はその経過も引く）、フリーライドは選んだ時間まで、1戦だけはその戦闘の終わりまで
      const left = run ? (run.done ? null : Math.min(run.total, run.endPlan || Infinity) - run.clock - (view && view.elapsed ? view.elapsed() : 0))   // 組んだ長さ（見通し）まで
        : rideS && rideS.race ? null
        : rideS && window.__rq.ride ? (isFinite(window.__rq.ride.total) ? window.__rq.ride.total - window.__rq.ride.clock : null)   // 時間を走りきって続けている間は出さない
        : view && view.kind === 'battle' ? view.length() - view.elapsed()
        : view && view.left ? view.left() : null;
      RQ.hud.update({ left: left != null ? Math.max(0, left) : null, ele: h.ele, grade: h.grade, kmh: h.v * 3.6, km: rec ? rec.dist / 1000 : practiceDist / 1000, cad: S.cad, power: S.power, hr: S.hr,
        // 右の列の3本目：ERG の目標パワー、勾配のモード（フリーライドの勾配・試練・レース）ならトレーナーへ送っている勾配。どちらでもなければ出さない
        target: S.erg != null ? { kind: 'erg', v: S.erg, down: S.ergWant != null && S.erg < S.ergWant - 1 } : (rideS || trialOn) ? { kind: 'grade', v: S.grade * 100, off: !!(rideS && !rideS.race && view && view.setMode) } : run && !run.done && settings.ergOn === false ? { kind: 'grade', v: S.grade * 100, off: true } : null,
        note: S.stale ? t('hud.noData') : S.re.trainer || S.re.hr || S.re.pm ? t('hud.reconnect') : autoPaused ? t('hud.autoPause') : ergOff >= ERG_OFF_SEC ? t('hud.ergOff') : '' });
    }
    $('#m-power').textContent = Math.round(S.power);
    $('#m-cad').textContent = Math.round(S.cad);
    $('#m-grade').textContent = S.erg != null ? Math.round(S.erg) : (S.grade * 100).toFixed(1);
    $('#m-grade').classList.toggle('down', S.erg != null && S.ergWant != null && S.erg < S.ergWant - 1);
    $('#m-grade-u').textContent = S.erg != null ? t('bar.wTarget') : '%';
    $('#m-speed').textContent = RQ.units.speedV(h.v * 3.6).toFixed(1);
    $('#m-hr').textContent = S.hr ? S.hr : '--';
    $('#grade-note').textContent = S.canLoad
      ? (S.sent == null ? t('load.waiting') : S.sent[0] === 'p' ? t('load.sentPower', { w: S.sent.slice(2) }) : t('load.sentGrade', { g: (+S.sent.slice(2) / 100).toFixed(1) }))
      : t('load.hint');
    if (photo && (run || rideS)) photoTick();   // 道中の写真（3D を描いた直後の、同じ処理の中で撮る）
  }

  Object.assign(window.__rq, { trialHero: () => trialHero, showSelect, startRun, practice, showTrial, showSummary, showCourses, startRide, showCollection, showBadges, showRace, startRace });
  window.__rq.runHero = () => (run ? run.heroId : null);
  window.__rq.autoPaused = () => autoPaused;   // テスト用   // テスト用：今の旅のキャラクター（続けて走る B で替わるか）
  Object.defineProperty(window.__rq, 'run', { get: () => run });
  Object.defineProperty(window.__rq, 'ghostList', { get: () => (world && world.ghostList) || (view && view.ghostList) || null });   // テスト用：ゴーストの配列（足すと出る）
  Object.defineProperty(window.__rq, 'ghosts', { get: () => (world && world.ghostsNow && world.ghostsNow()) || (view && view.ghostsNow && view.ghostsNow()) || [] });   // テスト用：いまのゴーストの出方
  showSelect();
})();
