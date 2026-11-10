/* トレーナーの接続と、つながずに試すモード。tanken-ride（MIT）の connect・gattOpen・sendGrade を移植。
   ゲーム側は RQ.trainer.state の power・cad を読み、setGrade() で負荷を頼むだけにする。 */
(function (root) {
  const P = root.RQ.protocol, U = P.UUID, t = (k, v) => (root.RQ.i18n ? root.RQ.i18n.t(k, v) : k);
  const S = {
    src: 'none',            // 'none' | 'ble' | 'sim'
    power: 0, cad: 0, hr: null,
    grade: 0,               // 送りたい勾配（0.05 = 5%）
    erg: null,              // 目標パワー（W）。null なら勾配を送る
    sent: null,             // 最後に送れた値（勾配は 'g:0.01%単位'、ERG は 'p:W'）
    sentAt: 0,
    device: '', proto: '', canLoad: false,
    hrDevice: '', hrNote: '',   // 心拍ベルトの名前と、つなげなかったときの理由
    pmDevice: '', pmNote: '',   // パワーメーターの名前と、つなげなかったときの理由（2026-10-24）
    pmK: 1,                 // トレーナー ÷ パワーメーターのパワーの比（ならしたもの）。ERG の目標に掛けて送る
    re: { trainer: false, hr: false, pm: false },
    speed: 0,               // トレーナーが送る速さ（km/h。補正の案内に使う）
    // 補正（スピンダウン。2026-10-24）：can＝ゲームの中からできる機種か（null＝まだ分からない）、phase＝'idle'|'start'|'speedUp'|'stop'|'success'|'error'、lo・hi＝上げる速さ（km/h）
    cal: { can: null, phase: 'idle', lo: 0, hi: 0, msg: '' },   // つなぎ直している最中か（2026-10-24。切れたら自動でつなぎ直す）
    loadNote: '',           // 負荷を送れないとき、または制御権の返事がおかしいときの理由（接続の表示に出す）
    conn: { msg: t('bar.conn'), cls: '' },
    sim: { power: 120, cad: 85, sprint: false },
  };
  let ftmsCP = null, fecSend = null, gatt = null, cpNeedControl = true, trDev = null;
  let hrStrap = null, hrDev = null, pmDev = null;   // 別につないだ心拍ベルト（gatt）。つながっている間は、トレーナーの心拍より優先する
  // パワーメーター（Cycling Power 0x1818。トレーナーとは別に1台。2026-10-24 ユーザー判断）。つながっている間は、パワーと回転数をこちらから取る
  // （回転数を送らない機種なら、回転数はトレーナーから）。tr：トレーナーの値、pm：パワーメーターの値
  let pmStrap = null; const tr = { power: 0, cad: 0 }; let pm = null;
  /* 回転数をならす（2026-11-08 試走 指摘 6・判断 33b。ユーザー「魔物の群れと戦うときに、パワーの要求が大きく変化するときに、ケイデンスが暴れるときがある。
     同じ回転数で回してても、取得が乱高下するので、取得するタイミングが悪いのかもしれない。」）：トレーナー（・パワーメーター）から届いた回転数の、
     直近 CAD_MS の真ん中の値（中央値）を使う。HUD・戦闘の判定・ERG の見張りのどれもこの値。ならす前の値は S.cadRaw と Bluetooth の記録に残す。
     0 も値の 1 つとして数える（一瞬だけ 0 が届いても飛ばない。足を止めたら、1 秒ほどで 0 になる）。値が数でなければ 0 */
  const CAD_MS = 2000;
  let cadHist = [];
  function smoothCad(raw, now = performance.now()) {
    if (!Number.isFinite(raw) || raw < 0) raw = 0;
    cadHist.push([now, raw]);
    while (cadHist.length && now - cadHist[0][0] > CAD_MS) cadHist.shift();
    const v = cadHist.map(x => x[1]).sort((a, b) => a - b), n = v.length;
    return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  }
  function mix() {
    const raw = pm && pm.cad != null ? pm.cad : tr.cad;
    S.cadRaw = raw; S.cad = smoothCad(raw);
    S.power = P.pedalPower(pm ? pm.power : tr.power, S.cad);   // 足が止まっていればパワーは 0（表示・物理・記録とも。protocol.js の pedalPower）
  }
  // FTMS の Control Point に1つ書き、その返事（indication。[0x80, 命令, 結果]）を待つ（2026-11-07：アウターとインナーでパワーが変わる＝ERG が効いていない件）。
  // 書くのは1度に1つ（前の返事を待ってから次を書く。FTMS の決まり）。書いたバイト列と返事は Bluetooth の記録に入れる。
  // 返り値：返事（protocol.js の parseCPResponse。ok が成功）。返事が CP_REPLY_MS 来なければ null（書き込み自体の失敗は例外）
  const CP_REPLY_MS = 2500;
  let cpChain = Promise.resolve(), cpWait = null;
  function cpWrite(bytes, what) {
    const run = async () => {
      const cp = ftmsCP; if (!cp) throw new Error(t('tr.noCpShort'));
      const op = bytes[0];
      const reply = new Promise(res => { cpWait = { op, res }; });
      blogPush([Math.round(performance.now()), 'cpWrite', hex(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)), S.cad, S.power]);
      try { await within(cp.writeValueWithResponse(bytes), 3000, what); }
      catch (e) { cpWait = null; blogEvent('cpWriteFailed', e.message); throw e; }
      const r = await Promise.race([reply, sleep(CP_REPLY_MS).then(() => null)]);
      if (cpWait && cpWait.op === op) cpWait = null;
      if (!r) blogEvent('cpNoReply', '0x' + op.toString(16));
      return r;
    };
    const p = cpChain.then(run, run);
    cpChain = p.catch(() => {});
    return p;
  }
  // FTMS の制御権を取る（0x00）。返事が成功（0x01）でなければ、3回まで取り直す。
  // 「開始」（0x07）は送らない：ELITE SUITO では返事が来ないまま止まり、そのあとの Bluetooth のやり取りも止まった（2026-10-20）
  async function requestControl() {
    for (let k = 0; k < 3 && ftmsCP; k++) {
      try {
        const r = await cpWrite(new Uint8Array([0x00]), t('tr.controlReply'));
        // 返事が来ない機種もあるので、来なければ取れたとみる（そのあと目標の返事で確かめる）。失敗の返事なら取り直す
        if (!r || r.ok) { cpNeedControl = false; return true; }
        S.loadNote = t('tr.replyNote', { reply: t('tr.reply'), op: r.opName, text: r.text }); emit();
      } catch (e) { S.loadNote = t('tr.noControl', { msg: e.message }); console.warn(e); }
      await sleep(1000);
    }
    return false;
  }
  const listeners = [];
  const emit = () => listeners.forEach(f => f(S));
  const setConn = (msg, cls = '') => { S.conn = { msg, cls }; try { blogEvent('conn', msg); } catch (_) {} emit(); };

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // 切れたら自動でつなぎ直す（2026-10-24 ユーザー判断）：RETRY 秒ずつ間をあけて、何度か試す。kind：'trainer' | 'hr' | 'pm'。open：つなぎ直す手順。
  // つなぎ直す間は S.re[kind] が true（画面に「つなぎ直しています」を小さく出す）。あきらめたら false に戻し、onGiveUp を呼ぶ
  const RETRY = [1, 2, 4, 8, 15, 30];
  async function reconnect(kind, open, onGiveUp) {
    if (S.re[kind]) return;
    S.re[kind] = true; emit();
    for (const sec of RETRY) {
      await sleep(sec * 1000);
      if (!S.re[kind]) return;   // 別の機器をつないだ・つながずに試すへ替えた
      try { await open(); S.re[kind] = false; emit(); return; } catch (e) { console.warn(`つなぎ直せなかった（${kind}）`, e); }
    }
    S.re[kind] = false; onGiveUp && onGiveUp(); emit();
  }
  // Bluetooth の生の記録（2026-11-07：Elite Suito でフロントを落とすと回転数が乱高下する件を、届いた値から調べる）。
  // 届いたパケット（特性の名前・16進・受け取った時刻）と、読んだあとの回転数・パワー、接続の出来事と送った負荷を、メモリにためる。
  // 設定の「Bluetooth の記録を保存」（app.js）で JSON に書き出す。いつもためる（1時間で約 2 万行。BLOG_MAX 行を超えたら古い方から捨てる）
  const BLOG_MAX = 200000, blog = { t0: Date.now(), rows: [] };
  const hex = dv => { let s = ''; for (let i = 0; i < dv.byteLength; i++) s += dv.getUint8(i).toString(16).padStart(2, '0'); return s; };
  function blogPush(row) { blog.rows.push(row); if (blog.rows.length > BLOG_MAX) blog.rows.splice(0, blog.rows.length - BLOG_MAX); }
  const blogEvent = (what, info) => blogPush([Math.round(performance.now()), 'ev', what, info == null ? '' : String(info)]);
  // 特性に聞き手を付ける。つなぎ直しで同じ特性が返っても、聞き手は1つだけ。name：記録に残す特性の名前
  let dataAt = 0;   // トレーナー（またはパワーメーター）から最後にパワー・回転数が届いた時刻（performance.now）
  function listen(ch, fn, name = '?') {
    if (ch.__rqFn) ch.removeEventListener('characteristicvaluechanged', ch.__rqFn);
    const h = e => {
      const at = performance.now();
      try { fn(e); } catch (err) { console.warn('受け取った値を読めなかった', name, err); blogEvent('parseError', name + ' ' + err.message); }
      if (name === 'ibd' || name === 'fec' || name === 'cpm' || name === 'pm') dataAt = at;
      try { blogPush([Math.round(at), name, hex(e.target.value), S.cad, S.power, S.cadRaw]); } catch (_) {}
    };
    ch.__rqFn = h; ch.addEventListener('characteristicvaluechanged', h);
  }
  // 返らない Bluetooth のやり取りで止まらないように（接続の表示は変えない）
  const within = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(t('tr.timeout', { what, s: ms / 1000 })); })]);
  const T = (p, ms, what) => { setConn(t('tr.connecting', { what })); return Promise.race([p, sleep(ms).then(() => { throw new Error(t('tr.timeout', { what, s: ms / 1000 })); })]); };

  async function gattOpen(dev) {
    let err;
    for (let k = 0; k < 4; k++) {
      try {
        const g = await T(dev.gatt.connect(), 10000, t('tr.connectTry', { name: dev.name || '', n: k + 1 }));
        const svs = [], why = [];
        for (const [u, nm] of [[U.FTMS, 'FTMS'], [U.TFEC, 'Tacx FE-C'], [U.CPS, 'Cycling Power'], [U.HRS, t('tr.hrService')]]) {
          try { await T(g.getPrimaryService(u), svs.length || why.length ? 6000 : 15000, t('tr.find', { nm })); svs.push(BluetoothUUID.getService(u)); }
          catch (e) { why.push(nm + ': ' + (e.name || '') + ' ' + e.message); }
        }
        if (!svs.length) throw new Error(g.connected ? t('tr.noService', { why: why.join(' / ') }) : t('tr.droppedAtOnce'));
        return { g, svs };
      } catch (e) { err = e; console.warn(e); try { dev.gatt.disconnect(); } catch (_) {} await sleep(800 * (k + 1)); }
    }
    throw err;
  }

  // 機器の種類ごとの探し方（requestDevice の条件）
  const FIND = {
    // iPhone・iPad（Bluefy）では名前の条件（namePrefix）を付けない（2026-11-07：Bluefy が条件を読めずに止まった。読めないものを減らす）
    // platform/web.js は trainer.js より後に読むので、探すときに見る（get）
    get trainer() { const ios = !!(root.RQ && root.RQ.platform && root.RQ.platform.env && root.RQ.platform.env.ios); return { filters: [{ services: [U.FTMS] }, { services: [U.CPS] }].concat(ios ? [] : [{ namePrefix: 'Tacx' }, { namePrefix: 'FLUX' }]), optionalServices: [U.FTMS, U.CPS, U.HRS, U.TFEC] }; },
    hr: { filters: [{ services: [U.HRS] }] },
    pm: { filters: [{ services: [U.CPS] }] },
  };
  // 機器を1台もらう。want（機器の id）があれば、選ぶ窓を出さずにその機器を返してもらう（Electron の main。見つからなければ WANT_MS でやめる）
  const WANT_MS = 15000;
  async function request(opts, want) {
    const PF = root.RQ.platform;
    if (!want || !PF || !PF.wantBt) return navigator.bluetooth.requestDevice(opts);
    PF.btStart(); PF.wantBt(want); S.btWant = true;   // btWant：この間に届いた一覧は画面に出さない（app.js）
    const stop = setTimeout(() => PF.chooseBt(''), WANT_MS);
    try { return await navigator.bluetooth.requestDevice(opts); } finally { clearTimeout(stop); S.btWant = false; }
  }
  // kind（'trainer' | 'hr' | 'pm'）の機器を ms ミリ秒探す（Electron だけ。見つかった一覧は platform.onBtDevices に届く）。終わったら選ばずにやめる
  // （2026-10-29 試走 No.8：「つなぐ」1つで、トレーナー・心拍ベルト・パワーメーターを探して並べ、選んだものを全部つなぐ）
  let scanCut = null;
  async function scan(kind, ms) {
    const PF = root.RQ.platform;
    if (!navigator.bluetooth || !PF || !PF.ownPicker) return;
    PF.btStart();
    const p = navigator.bluetooth.requestDevice(FIND[kind]).catch(() => null);
    await Promise.race([sleep(ms), new Promise(r => { scanCut = r; })]); scanCut = null;
    PF.chooseBt(''); await p;
  }
  const stopScan = () => { if (scanCut) scanCut(); };   // 探している途中でやめる（scan はすぐに終わる）

  async function connect(want = null) {   // want：つなぐ機器の id（「つなぐ」の窓で選んだもの）。無ければ選ぶ窓を出す
    if (!navigator.bluetooth) { setConn(t('tr.noBluetooth'), 'ng'); return; }
    // つながっている間に「つなぐ」をもう一度押して、選ぶ窓を閉じた・つなげなかったときは、つながっている知らせのまま
    // （2026-11-10 試走：iPhone の縦で心拍ベルトのボタンが見えず「つなぐ」を押し直すと「つなげませんでした」になり、横にすると、つながっているのにその知らせが見えた）
    const was = S.conn, wasDev = trDev, still = () => S.src === 'ble' && trDev === wasDev && !!(wasDev && wasDev.gatt && wasDev.gatt.connected);
    try {
      const opts = FIND.trainer;
      let dev = null;
      for (let tries = 0; !dev; tries++) {
        const t0 = Date.now();
        try { dev = await request(opts, want); }
        catch (e) {
          console.warn('requestDevice', e);
          if (!P.retryConnect(e, Date.now() - t0, tries)) throw e;
          setConn(t('tr.waitBt')); await sleep(1000);
        }
      }
      trDev = dev; S.re.trainer = false;
      dev.addEventListener('gattserverdisconnected', () => {
        if (trDev !== dev) return;
        ftmsCP = null; fecSend = null; S.canLoad = false;
        if (S.src !== 'ble') return;   // つながずに試すへ切り替えたときは、そのまま
        S.src = 'none'; tr.power = 0; tr.cad = 0; mix(); setConn(t('tr.reconnecting'), 'ng');
        reconnect('trainer', () => openTrainer(dev), () => setConn(t('tr.lost'), 'ng'));
      });
      await openTrainer(dev);
    } catch (e) {
      if (wasDev && still()) { setConn(was.msg, was.cls); return; }
      setConn(t('tr.failed', { msg: e.message }), 'ng');
    }
  }
  // トレーナーを開く（最初につなぐときと、切れてつなぎ直すとき）
  async function openTrainer(dev) {
    setConn(t('tr.connecting', { what: dev.name || '' }));
    const { g, svs } = await gattOpen(dev); gatt = g;
    const has = u => svs.includes(BluetoothUUID.getService(u));
    ftmsCP = null; fecSend = null; S.canLoad = false; cpNeedControl = true; cpWait = null; cpChain = Promise.resolve();
    if (has(U.FTMS)) {
      const sv = await T(g.getPrimaryService(U.FTMS), 5000, t('tr.open', { nm: 'FTMS' })), ibd = await T(sv.getCharacteristic(U.IBD), 5000, t('tr.open', { nm: 'Indoor Bike Data' }));
      listen(ibd, e => { const r = P.parseIBD(e.target.value); if (r.speed != null) S.speed = r.speed; if (r.power != null) tr.power = Math.max(0, r.power); if (r.cad != null) tr.cad = r.cad; if (r.hr && !hrStrap) S.hr = r.hr; mix(); emit(); }, 'ibd');
      await T(ibd.startNotifications(), 8000, t('tr.powerNotify')); S.proto = 'FTMS';
      // 負荷の口（Control Point）。どこで失敗したかを残し、口さえ開ければ負荷は送ってみる（制御権は送るときに取り直す）
      let cp = null;
      try { cp = await T(sv.getCharacteristic(U.CP), 5000, t('tr.cpOpen')); }
      catch (e) { S.loadNote = t('tr.noCp', { msg: e.message }); console.warn(e); }
      if (cp) {
        listen(cp, e => {
          const r = P.parseCPResponse(e.target.value); if (!r) return;
          if (cpWait && cpWait.op === r.op) { const w = cpWait; cpWait = null; w.res(r); }
          console.log('FTMS の返事', r);
          if (r.op === 0x07) return;   // 「開始」は要らない機種があり、失敗と返ってきても負荷は送れる（ELITE SUITO など）
          if (r.op === 0x13) { blogEvent('cal', 'reply ' + (r.ok ? `speedUp ${r.lo}-${r.hi}` : r.text)); S.cal = r.ok ? { ...S.cal, phase: 'speedUp', lo: r.lo || 0, hi: r.hi || 0 } : { ...S.cal, phase: 'error', msg: r.text }; emit(); return; }   // 補正の返事
          if (!r.ok) { S.loadNote = t('tr.replyNote', { reply: t('tr.reply'), op: r.opName, text: r.text }); if (r.result === 5) cpNeedControl = true; emit(); }
          else { if (r.op === 0x00) cpNeedControl = false; if (S.loadNote.startsWith(t('tr.reply'))) S.loadNote = ''; emit(); }
        }, 'cp');
        try { await T(cp.startNotifications(), 5000, t('tr.cpNotify')); } catch (e) { console.warn('CP indications', e); }
        ftmsCP = cp; S.canLoad = true;
        await requestControl();
      }
      // 補正（スピンダウン）ができる機種か（Feature の bit13）と、補正の様子（Status）。無くてもつなぐのは続ける
      S.cal = { can: false, phase: 'idle', lo: 0, hi: 0, msg: '' };
      try { const f = await T(sv.getCharacteristic(U.FEAT), 4000, t('tr.open', { nm: 'Feature' })); const fv = await within(f.readValue(), 4000, 'Feature'); blogEvent('feature', hex(fv)); S.cal.can = !!cp && P.parseFeatures(fv).spinDown; } catch (e) { console.warn('Feature', e); }
      try {
        const st = await T(sv.getCharacteristic(U.STATUS), 4000, t('tr.open', { nm: 'Status' }));
        listen(st, e => { const r = P.parseStatus(e.target.value); if (!r || !r.spin || S.cal.phase === 'idle') return; if (r.spin !== 'requested') { S.cal = { ...S.cal, phase: r.spin }; blogEvent('cal', r.spin); emit(); } }, 'status');
        await within(st.startNotifications(), 5000, 'Status');
      } catch (e) { console.warn('Status', e); }
    } else if (has(U.TFEC)) {
      S.cal = { can: false, phase: 'idle', lo: 0, hi: 0, msg: '' };   // FE-C・Cycling Power は、ゲームの中から補正しない（メーカーのアプリで）
      const sv = await T(g.getPrimaryService(U.TFEC), 6000, t('tr.open', { nm: 'Tacx FE-C' })), rx = await T(sv.getCharacteristic(U.TFEC_RX), 6000, t('tr.fecRx'));
      listen(rx, e => { const r = P.parseFEC(e.target.value); if (r.power != null) tr.power = r.power; if (r.cad != null) tr.cad = r.cad; mix(); emit(); }, 'fec');
      await T(rx.startNotifications(), 8000, t('tr.fecNotify')); S.proto = 'Tacx FE-C';
      try { const tx = await T(sv.getCharacteristic(U.TFEC_TX), 6000, t('tr.fecTx')); fecSend = pg => tx.writeValueWithoutResponse(P.fecFrame(pg, 5)); S.canLoad = true; } catch (e) {}
    } else if (has(U.CPS)) {
      S.cal = { can: false, phase: 'idle', lo: 0, hi: 0, msg: '' };
      const parseCPM = P.makeCPMParser(() => performance.now());
      const ch = await (await g.getPrimaryService(U.CPS)).getCharacteristic(U.CPM);
      listen(ch, e => { const r = parseCPM(e.target.value); tr.power = Math.max(0, r.power); if (r.cad != null) tr.cad = r.cad; mix(); emit(); }, 'cpm');
      await ch.startNotifications(); S.proto = 'Cycling Power';
    } else throw new Error(t('tr.noUsable', { svs: svs.join(',') }));
    if (has(U.HRS)) try {   // 心拍は無くてもよいので、返らなければあきらめる
      const h = await T((await T(g.getPrimaryService(U.HRS), 5000, t('tr.hrOpen'))).getCharacteristic(U.HRM), 5000, t('tr.hrOpen'));
      listen(h, e => { const hr = P.parseHRM(e.target.value); if (hr && !hrStrap) S.hr = hr; emit(); }, 'hrTrainer');
      await T(h.startNotifications(), 5000, t('tr.hrNotify'));
    } catch (e) { console.warn('心拍', e); }
    S.src = 'ble'; S.device = dev.name || t('tr.trainer'); S.sent = null; dataAt = performance.now(); simAt = 0;
    setConn(`✔ ${S.device} · ${S.proto}${S.canLoad ? t('tr.canLoad') : t('tr.noLoad', { note: S.loadNote ? ': ' + S.loadNote : '' })}`, 'ok');
  }

  // 心拍ベルト（Heart Rate Service 0x180D）を、トレーナーとは別に1台つなぐ（2026-10-21 ユーザー判断）。心拍は表示と記録だけ
  async function connectHr(want = null) {
    if (!navigator.bluetooth) { S.hrNote = t('tr.noBluetoothShort'); emit(); return; }
    try {
      let dev = null;
      for (let tries = 0; !dev; tries++) {
        const t0 = Date.now();
        try { dev = await request(FIND.hr, want); }
        catch (e) { if (!P.retryConnect(e, Date.now() - t0, tries)) throw e; await sleep(1000); }
      }
      S.hrNote = t('tr.hrConnecting', { name: dev.name || '' }); blogEvent('hrPicked', dev.name || ''); emit();
      try { hrStrap && hrStrap.disconnect(); } catch (_) {}
      hrDev = dev; S.re.hr = false;
      // 切れたら、つなぎ直す（あきらめたら「心拍ベルトが切れました」）
      dev.addEventListener('gattserverdisconnected', () => { if (hrDev !== dev) return; hrStrap = null; S.hr = null; emit(); reconnect('hr', () => openHr(dev), () => { if (hrDev === dev) { S.hrDevice = ''; S.hrNote = t('tr.hrLost'); } }); });
      await openHr(dev);
    } catch (e) {
      blogEvent('hrError', `${e.name || ''} ${e.message || ''}`);   // 2026-11-08 試走：iPhone（Bluefy）で心拍ベルトがつながらなかった。理由を記録に残す
      S.hrNote = /cancel/i.test(e.message || '') ? '' : t('tr.hrFailed', { msg: e.message }) + ' ' + t('tr.strapHint'); emit();
    }
  }

  async function openHr(dev) {
    const g = await within(dev.gatt.connect(), 10000, t('tr.hrConnect'));
    const ch = await within((await within(g.getPrimaryService(U.HRS), 8000, t('tr.hrFind'))).getCharacteristic(U.HRM), 5000, t('tr.hrOpen'));
    listen(ch, e => { const hr = P.parseHRM(e.target.value); if (hr) { S.hr = hr; emit(); } }, 'hr');
    await within(ch.startNotifications(), 8000, t('tr.hrNotify'));
    hrStrap = g; S.hrDevice = dev.name || t('tr.hrStrap'); S.hrNote = '';
    emit();
  }

  // パワーメーターを1台つなぐ（心拍ベルトと同じ流れ）
  async function connectPm(want = null) {
    if (!navigator.bluetooth) { S.pmNote = t('tr.noBluetoothShort'); emit(); return; }
    try {
      let dev = null;
      for (let tries = 0; !dev; tries++) {
        const t0 = Date.now();
        try { dev = await request(FIND.pm, want); }
        catch (e) { if (!P.retryConnect(e, Date.now() - t0, tries)) throw e; await sleep(1000); }
      }
      S.pmNote = t('tr.hrConnecting', { name: dev.name || '' }); emit();
      try { pmStrap && pmStrap.disconnect(); } catch (_) {}
      pmDev = dev; S.re.pm = false;
      dev.addEventListener('gattserverdisconnected', () => {
        if (pmDev !== dev) return;
        pmStrap = null; pm = null; S.pmK = 1; if (S.src !== 'sim') mix(); emit();   // つなぎ直す間は、トレーナーのパワーで続ける
        reconnect('pm', () => openPm(dev), () => { if (pmDev === dev) { S.pmDevice = ''; S.pmNote = t('tr.pmLost'); } });
      });
      await openPm(dev);
    } catch (e) {
      blogEvent('pmError', `${e.name || ''} ${e.message || ''}`);
      S.pmNote = /cancel/i.test(e.message || '') ? '' : t('tr.pmFailed', { msg: e.message }) + ' ' + t('tr.strapHint'); emit();
    }
  }
  async function openPm(dev) {
    const g = await within(dev.gatt.connect(), 10000, t('tr.pmConnect'));
    const ch = await within((await within(g.getPrimaryService(U.CPS), 8000, t('tr.pmFind'))).getCharacteristic(U.CPM), 5000, t('tr.pmOpen'));
    const parseCPM = P.makeCPMParser(() => performance.now());
    let at = 0;
    listen(ch, e => {
      const r = parseCPM(e.target.value), now = performance.now();
      pm = { power: Math.max(0, r.power), cad: r.cad != null ? r.cad : (pm ? pm.cad : null) };
      if (S.src === 'ble') S.pmK = P.powerMatch(S.pmK, tr.power, pm.power, at ? (now - at) / 1000 : 0);   // トレーナーとの比をならす
      at = now; if (S.src !== 'sim') mix(); emit();
    }, 'pm');
    await within(ch.startNotifications(), 8000, t('tr.pmNotify'));
    pmStrap = g; S.pmDevice = dev.name || t('tr.pm'); S.pmNote = ''; S.pmK = 1;
    emit();
  }

  function disconnect() { try { gatt && gatt.disconnect(); } catch (_) {} }

  function startSim() {
    blogEvent('startSim');
    cadHist = [];
    S.re.trainer = false; disconnect(); S.src = 'sim'; S.device = ''; S.proto = ''; S.canLoad = false; simAt = 0;
    setConn(t('tr.sim'));
  }

  // 負荷の頼み方は2つ。勾配（ふだん）か、目標パワー（ERG。女王の試練で使う）
  // reqAt：画面が最後に負荷を頼んだ時刻。頼みが REQ_MS 来なくなったら（画面の処理が止まった・負荷を頼まない画面）、tick が負荷を安全な軽さに下げる
  let reqAt = 0;
  function setGrade(g) { S.grade = Number.isFinite(g) ? g : 0; S.erg = null; reqAt = performance.now(); }
  function setTargetPower(w) { S.erg = Number.isFinite(w) ? Math.max(0, w) : 0; S.grade = 0; reqAt = performance.now(); }

  // 補正（スピンダウン）を始める。案内は S.cal の phase を見て画面が出す。できない機種・つながっていないときは false
  async function spinDown() {
    if (!ftmsCP || !S.cal.can) return false;
    S.cal = { ...S.cal, phase: 'start', msg: '' }; blogEvent('cal', 'start'); emit();
    try {
      if (cpNeedControl && !(await requestControl())) throw new Error(t('tr.calNoControl'));
      const r = await cpWrite(P.spinDownFrame(), t('tr.calReply'));
      if (!r) throw new Error(t('tr.calNoReply'));   // 返事が来ない（失敗の返事は、聞き手が error にする）
    } catch (e) { S.cal = { ...S.cal, phase: 'error', msg: e.message }; blogEvent('cal', 'error ' + e.message); emit(); return false; }
    return true;
  }
  const calEnd = () => { if (S.cal.phase !== 'idle') blogEvent('cal', 'end ' + S.cal.phase); S.cal = { ...S.cal, phase: 'idle' }; S.sent = null; emit(); };   // 案内を閉じた（負荷はもう一度送る）

  // 1秒に1回まで、変わったときだけ送る（tanken-ride と同じ）
  let sending = false;   // 送っている最中（返事を待つ間）は、次を重ねない
  async function sendLoad(now) {
    if (!ftmsCP && !fecSend) return;
    if (sending) return;
    if (S.cal.phase !== 'idle') return;   // 補正の間は、負荷を送らない
    const erg = S.erg != null;
    const ergW = P.ergWatts(pmStrap ? P.matchedErg(S.erg, S.pmK) : S.erg);   // パワーメーターをつないでいれば、比で補正した目標を送る
    const key = erg ? 'p:' + ergW : 'g:' + P.gradeUnits(S.grade);
    if (S.sent === key || now - S.sentAt < 1000) return;
    S.sent = key; S.sentAt = now; blogEvent('send', key);
    sending = true;
    try { await sendLoadNow(key, erg, ergW); } finally { sending = false; }
  }
  async function sendLoadNow(key, erg, ergW) {
    if (ftmsCP && cpNeedControl && !(await requestControl())) { S.sent = null; return; }   // 制御権を失っていたら取り直す
    try {
      let r = null;
      if (erg) {
        if (fecSend) await fecSend(P.fecPowerPage(ergW));
        else r = await cpWrite(P.ftmsPowerFrame(ergW), t('tr.powerReply'));
      } else {
        const u = P.gradeUnits(S.grade);
        if (fecSend) await fecSend(P.fecGradePage(u));
        else r = await cpWrite(P.ftmsGradeFrame(u), t('tr.gradeReply'));
      }
      // 失敗の返事・返事なし：送れていないので、1秒後にもう一度送る（前は送れたことにしていて、同じ目標のままだと二度と送らなかった）。
      // 制御権がない（5）なら取り直してから
      if (r && !r.ok) { if (S.sent === key) S.sent = null; if (r.result === 5) cpNeedControl = true; }
      else if (ftmsCP && !fecSend && !r) { if (S.sent === key) S.sent = null; }
      else if (!S.loadNote.startsWith(t('tr.reply'))) S.loadNote = '';
    } catch (e) { if (S.sent === key) S.sent = null; S.loadNote = t('tr.sendFailed', { msg: e.message }); cpNeedControl = true; }
  }

  // 画面の時計から呼ぶ。つながずに試すときはスライダーの値を使う。
  // ERG のときは本物のトレーナーのように、回している間はパワーが目標に1秒ほど遅れて合う（パワーのスライダーは回すかどうかだけ）
  let simAt = 0;
  // 見張り（2026-11-07 試走「画面表示が変わらないのに ERG が強いまま」）：
  // ・トレーナーから値が DATA_MS 届かない：回転数とパワーを 0 にする（古い値のまま固まらない。0 になれば ergguard が負荷を抜く）
  // ・画面からの負荷の頼みが REQ_MS 来ない：ERG をやめて平らな勾配（0%）にする（最後に送った強い目標が残り続けない）
  const DATA_MS = 3000, REQ_MS = 2500;
  let staleOn = false, reqOff = false;
  function tick(now) {
    if (S.src === 'ble') {
      const stale = dataAt > 0 && now - dataAt > DATA_MS;
      if (stale) { tr.power = 0; tr.cad = 0; pm = null; mix(); }
      if (stale !== staleOn) { staleOn = stale; blogEvent(stale ? 'dataStale' : 'dataBack'); S.stale = stale; emit(); }
    } else if (staleOn) { staleOn = false; S.stale = false; }
    const idle = now - reqAt > REQ_MS;
    if (idle && (S.erg != null || S.grade !== 0)) { S.erg = null; S.grade = 0; }
    if (idle !== reqOff) { reqOff = idle; blogEvent(idle ? 'loadIdle' : 'loadBack'); }
    if (S.src === 'sim') {
      const dt = Math.min(0.5, (now - (simAt || now)) / 1000); simAt = now;
      if (S.sim.sprint) { S.power = 300; S.cad = 110; }
      else if (S.erg != null && S.sim.power > 0) { S.power += (S.erg - S.power) * Math.min(1, dt * 1.5); S.cad = S.sim.cad; }
      else { S.power = S.sim.power; S.cad = S.sim.power > 0 ? S.sim.cad : 0; }
      S.power = P.pedalPower(S.power, S.cad);   // 本物のトレーナーと同じく、足が止まっていればパワーは 0
    }
    sendLoad(now).catch(e => { console.warn('負荷を送れなかった', e); S.sent = null; });
  }

  // 起動したときに Bluetooth の準備を始めておく（macOS では、ここで初めて許可を聞くことがある。1回目の「つなぐ」が失敗しないように）
  try { if (navigator.bluetooth && navigator.bluetooth.getAvailability) navigator.bluetooth.getAvailability().catch(() => {}); } catch (_) {}

  // 記録を JSON の文字列に（設定の「Bluetooth の記録を保存」）
  const btlogText = () => JSON.stringify({ v: 1, app: 'ride-on-quest', build: root.RQ.build || null, ua: navigator.userAgent, start: new Date(blog.t0).toISOString(), perfAtStart: 0,
    cols: ['ms（ページを開いてから）', '特性（ibd＝FTMS Indoor Bike Data・cp・status・fec・cpm・hr・pm、ev＝出来事）', '16進（ev は出来事の名前）', '読んだあとの回転数（ev は中身）', '読んだあとのパワー', 'ならす前の回転数（2026-11-08 から）'],
    device: S.device, proto: S.proto, rows: blog.rows });
  root.RQ.trainer = { state: S, smoothCad, btlogText, btlogCount: () => blog.rows.length, note: blogEvent, spinDown, calEnd, scan, stopScan, connect, connectHr, connectPm, disconnect, startSim, setGrade, setTargetPower, tick, onChange: f => listeners.push(f) };
})(window);
