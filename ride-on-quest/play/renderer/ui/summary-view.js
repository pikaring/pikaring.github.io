/* 旅のまとめの画面：トレーニングの数値、パワーの推移、ゾーン別の時間、ゲームの結果。スクリーンショットを保存できる。
   o = { title, sub, samples, ftp, dist, game: [[見出し, 値]], king, onBack } */
(function (root) {
  const TG = root.RQ.training, U = root.RQ.ui, TR = root.RQ.trainer, t = root.RQ.i18n.t;
  // ゾーンの色：青の段階（暗い面で Z1 が暗く、強いほど明るい。dataviz の検証済み）
  const ZONE_COLORS = ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb', '#f2f7fe'];
  const LINE = '#3987e5', BATTLE_BAND = 'rgba(224, 82, 74, 0.14)';

  function summaryView(screen, o) {
    const r = TG.summarize(o.samples, o.ftp, o.hrMax);
    const mm = s => U.mmss(s);
    const tiles = [
      [t('sum.time'), mm(r.sec), ''], [t('sum.dist'), RQ.units.distV(o.dist / 1000), RQ.units.distU()], [t('sum.avgP'), r.avgP, 'W'], ['NP', r.np, 'W'],
      ['IF', r.IF.toFixed(2), ''], ['TSS', r.tss, ''], [t('sum.work'), r.kj, 'kJ'], [t('sum.avgCad'), r.avgCad, 'rpm'],
      ...(o.rider ? [[t('sum.wkg'), (r.avgP / o.rider).toFixed(2), 'W/kg']] : []),   // 平均パワーの W/kg（人の体重。2026-10-24）
    ];
    const peaks = [[t('sum.max5s'), r.max5s], [t('sum.max1m'), r.max1m], [t('sum.max5m'), r.max5m]].map(([k, v]) => `${k} <b>${v == null ? '—' : v + ' W'}</b>`).join('　');
    const hr = r.avgHr ? '　' + t('sum.hr', { avg: r.avgHr, max: r.maxHr }) : '';
    U.setBg(null);
    screen.innerHTML = `
      <div class="report">
        <div class="report-head"><div class="brand"><img class="logo-sm" src="${U.A}ui/logo.webp" alt="Ride on Quest"><div class="subtitle-sm">${t('sum.subtitle')}</div></div><div class="grow"><h2>${o.title}</h2><div class="sub">${o.sub}</div></div>
          <div class="report-buttons"><button class="shot">${t('sum.shot')}</button><button class="back">${t('practice.select')}</button></div></div>
        <div class="tiles">${tiles.map(([k, v, u]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}<small>${u}</small></div></div>`).join('')}</div>
        <div class="peaks">${peaks}${hr}　FTP <b>${o.ftp} W</b>${o.rider ? `（${(o.ftp / o.rider).toFixed(2)} W/kg）` : ''}</div>
        <div class="charts">
          <div class="chart-box"><div class="chart-title">${t('sum.powerChart')}<span class="key"><i class="band"></i>${t('sum.inBattle')}</span><span class="key"><i class="ftp"></i>FTP</span></div>
            <div class="chart"><canvas></canvas><div class="tip" hidden></div></div></div>
          <div class="chart-box zones-box"><div class="chart-title">${t('sum.zones')}</div><div class="zones"></div>${r.hrZones ? `<div class="chart-title sm">${t('sum.hrZones', { max: o.hrMax })}</div><div class="hrz-bar"></div><div class="hrz-key"></div>` : ''}</div>
          ${o.fitness ? `<div class="chart-box fit-box"><div class="chart-title">${t('sum.fitness')}<span class="key"><i class="ctl"></i>${t('sum.ctl')}</span><span class="key"><i class="atl"></i>${t('sum.atl')}</span></div>
            <div class="fit-now"></div><svg class="fit-line" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true"></svg>
            <div class="chart-title sm">${t('sum.weekTss')}</div><div class="fit-weeks"></div></div>` : ''}
        </div>
        <div class="game-row">${o.game.map(([k, v]) => `<span>${k} <b>${v}</b></span>`).join('')}</div>
        ${o.king ? `<div class="king">${t('sum.king', { who: root.RQ.i18n.cap(root.RQ.data.WORLD.queen), text: o.king })}</div>` : ''}
        <div class="saved hint" hidden></div>
        <div class="fit-row" hidden><span class="fit-msg"></span></div>
        <div class="photo-row hint" hidden></div>
        <div class="affil" hidden></div>
      </div>`;
    const q = s => screen.querySelector(s);
    if (root.RQ.monetize) root.RQ.monetize.fillAmazon(q('.affil'));   // ブラウザ版の本番だけ（webonly/monetize.js。アプリ版には入らない）

    // ゾーン：横棒（値は棒の先に。色は段階、文字は文字の色）
    const maxZ = Math.max(1, ...r.zones.map(z => z.sec));
    q('.zones').innerHTML = r.zones.map((z, i) => {
      const range = z.hiW == null ? `${z.loW} W〜` : `${z.loW}〜${z.hiW} W`;
      const pct = r.sec ? Math.round(z.sec / r.sec * 100) : 0;
      return `<div class="zrow"><div class="zname">${t(`sum.zone${i + 1}`)}<small>${range}</small></div>
        <div class="zbar"><i data-w="${z.sec / maxZ * 100}" data-c="${ZONE_COLORS[i]}"></i><span>${mm(z.sec)}（${pct}%）</span></div></div>`;
    }).join('');
    screen.querySelectorAll('.zbar i').forEach(i => { i.style.width = `max(${i.dataset.w}%, 2px)`; i.style.background = i.dataset.c; });
    // 心拍のゾーン（心拍があるときだけ）：1本の帯をゾーンの時間で分け、下に各ゾーンの時間
    if (r.hrZones) {
      const all = Math.max(1, r.hrZones.reduce((a, z) => a + z.sec, 0)), HRC = ['#4f5b6b', '#3f8f5a', '#c9a227', '#d9792b', '#d0473f'];
      q('.hrz-bar').innerHTML = r.hrZones.map(() => '<i></i>').join('');
      q('.hrz-bar').querySelectorAll('i').forEach((el, i) => { el.style.width = `${r.hrZones[i].sec / all * 100}%`; el.style.background = HRC[i]; });
      q('.hrz-key').innerHTML = r.hrZones.map((z, i) => `<span><i></i>${z.n} <b>${mm(z.sec)}</b></span>`).join('');
      q('.hrz-key').querySelectorAll('i').forEach((el, i) => { el.style.background = HRC[i]; });
    }

    // 体力の推移（2026-10-24 ユーザー判断。renderer/game/fitness.js）：体力（CTL）と疲れ（ATL）の線、今の値と調子（TSB）、週ごとの TSS の棒
    if (o.fitness) {
      const f = o.fitness, S = f.series, top = Math.max(10, ...S.map(d => Math.max(d.ctl, d.atl))) * 1.1;
      const pts = k => S.map((d, i) => `${(S.length < 2 ? 0 : i / (S.length - 1) * 300).toFixed(1)},${(80 - d[k] / top * 76).toFixed(1)}`).join(' ');
      q('.fit-line').innerHTML = `<polyline class="ctl" points="${pts('ctl')}"></polyline><polyline class="atl" points="${pts('atl')}"></polyline>`;
      q('.fit-now').innerHTML = f.now ? t('sum.fitNow', { ctl: `<b>${f.now.ctl}</b>`, atl: `<b>${f.now.atl}</b>`, tsb: `<b>${f.now.tsb > 0 ? '+' : ''}${f.now.tsb}</b>` }) : '';
      const wmax = Math.max(1, ...f.weekly.map(w => w.tss));
      q('.fit-weeks').innerHTML = f.weekly.map((w, i) => `<div class="wk"><span>${w.tss}</span><i></i><small>${i === f.weekly.length - 1 ? t('sum.thisWeek') : +w.from.slice(5, 7) + '/' + +w.from.slice(8)}</small></div>`).join('');
      screen.querySelectorAll('.fit-weeks .wk i').forEach((el, i) => { el.style.height = `${Math.max(2, f.weekly[i].tss / wmax * 100)}%`; });
    }

    // パワーの推移
    const canvas = q('canvas'), box = q('.chart'), tip = q('.tip');
    const sm = o.samples.map((_, i, a) => { const s = a.slice(Math.max(0, i - 9), i + 1); return s.reduce((x, y) => x + y.p, 0) / s.length; });
    let geo = null;
    function draw() {
      const dpr = devicePixelRatio || 1, W = box.clientWidth, H = box.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      const g = canvas.getContext('2d'); g.scale(dpr, dpr);
      const L = 44, R = 10, T = 10, B = 24, w = W - L - R, h = H - T - B;
      const n = Math.max(2, sm.length), top = Math.ceil(Math.max(o.ftp * 1.4, ...sm, 1) / 50) * 50;
      const x = i => L + i / (n - 1) * w, y = p => T + h - p / top * h;
      geo = { L, w, n, x, y };
      const css = getComputedStyle(document.documentElement);
      const grid = css.getPropertyValue('--line').trim(), muted = css.getPropertyValue('--dim').trim();
      g.font = '11px system-ui, sans-serif'; g.fillStyle = muted; g.strokeStyle = grid; g.lineWidth = 1;
      // 戦闘中の帯
      g.fillStyle = BATTLE_BAND;
      let s0 = null;
      o.samples.forEach((s, i) => { if (s.k === 'battle' && s0 == null) s0 = i; if ((s.k !== 'battle' || i === o.samples.length - 1) && s0 != null) { g.fillRect(x(s0), T, x(i) - x(s0), h); s0 = null; } });
      // 横の目盛り
      g.fillStyle = muted;
      for (let v = 0; v <= top; v += top > 400 ? 100 : 50) { g.beginPath(); g.moveTo(L, y(v) + 0.5); g.lineTo(L + w, y(v) + 0.5); g.stroke(); g.fillText(v, 6, y(v) + 4); }
      // 時間の目盛り（分）
      const mins = o.samples.length / 60, stepM = mins > 60 ? 15 : mins > 20 ? 10 : 5;
      for (let m = 0; m <= mins; m += stepM) g.fillText(t('sel.min', { m }), x(m * 60) - 8, H - 6);
      // FTP の線
      g.strokeStyle = muted; g.beginPath(); g.moveTo(L, y(o.ftp) + 0.5); g.lineTo(L + w, y(o.ftp) + 0.5); g.stroke();
      g.fillText(`FTP ${o.ftp} W`, L + w - 70, y(o.ftp) - 4);
      // パワー（面は薄く、線は2px）
      if (sm.length > 1) {
        g.beginPath(); sm.forEach((p, i) => i ? g.lineTo(x(i), y(p)) : g.moveTo(x(i), y(p)));
        g.lineWidth = 2; g.lineJoin = g.lineCap = 'round'; g.strokeStyle = LINE; g.stroke();
        g.lineTo(x(sm.length - 1), y(0)); g.lineTo(x(0), y(0)); g.closePath(); g.globalAlpha = 0.1; g.fillStyle = LINE; g.fill(); g.globalAlpha = 1;
      }
    }
    // マウスを乗せると、その時刻のパワー
    box.onmousemove = e => {
      if (!geo || sm.length < 2) return;
      const rect = box.getBoundingClientRect(), px = e.clientX - rect.left;
      const i = Math.round((px - geo.L) / geo.w * (geo.n - 1));
      if (i < 0 || i >= sm.length) { tip.hidden = true; return; }
      tip.hidden = false; tip.textContent = `${U.mmss(i)}　${Math.round(sm[i])} W${o.samples[i].k === 'battle' ? t('sum.inBattleP') : ''}`;
      tip.style.left = `${Math.min(rect.width - 150, Math.max(0, geo.x(i) - 60))}px`; tip.style.top = `${Math.max(0, geo.y(sm[i]) - 34)}px`;
    };
    box.onmouseleave = () => { tip.hidden = true; };
    // 枠の大きさが変わったら描き直す（ウィンドウの大きさのほか、FIT の行が出て枠が縮むときも）
    const ro = new ResizeObserver(() => draw());
    ro.observe(box);

    // スクリーンショット（Electron は「ピクチャ」に保存、ブラウザ版はダウンロード。RQ.platform）
    const P = RQ.platform, web = P.kind === 'web', savedWord = web ? t('sum.downloaded') : t('sum.saved');
    const shot = q('.shot');
    if (!P.saveScreenshot) shot.hidden = true;
    shot.onclick = async () => {
      const saved = q('.saved');
      try {
        const file = await RQ.platform.saveScreenshot();
        saved.hidden = false; saved.textContent = t('sum.savedFile', { word: savedWord, file }) + '　';
        if (root.RQ.sfx) root.RQ.sfx.play('shutter');
        if (P.canShowFile) { const open = U.el('button'); open.textContent = t('sum.openFolder'); open.onclick = () => P.showFile(file); saved.appendChild(open); }
      } catch (e) { saved.hidden = false; saved.textContent = t('sum.saveFailed', { msg: e.message }); }
    };
    q('.back').onclick = () => { ro.disconnect(); o.onBack(); };
    // Strava の種類（2026-10-22 ユーザーの経験：「室内トレーニング」にすると地図が出ない。FIT はバーチャルライド）
    const KIND_NOTE = t('sum.kindNote');
    const descNow = () => (o.stravaText || '').split('\n').slice(2).join('\n');   // 説明（1行目のタイトルと空行のあと）
    // タイトルと説明は別々の欄に貼るので、コピーも分ける
    // text は文字列か、押したときに文字列を返す関数（説明は、冒険記が届いたら差し替わるので、押したときの中身を使う）
    const copyBtn = (label, text) => { const b = U.el('button'); b.textContent = label; b.onclick = () => { RQ.platform.copyText(typeof text === 'function' ? text() : text); b.textContent = label + ' ✓'; setTimeout(() => { b.textContent = label; }, 1500); }; return b; };
    // ブラウザ版：FIT・道中の写真・まとめの画像を1つの zip でダウンロードした結果（app.js が呼ぶ。2026-10-22 ユーザー要望）
    function setBundle(r) {
      const row = q('.fit-row'), msg = q('.fit-msg'); if (!row || !msg) return; row.hidden = false;   // 保存が終わる前に、まとめの画面を閉じていた
      if (!r || r.error) { msg.textContent = t('sum.dlFailed') + (r && r.error ? ': ' + r.error : ''); return; }
      const parts = [r.fit ? 'FIT' : null, r.count ? t('sum.photosN', { n: r.count }) : null, t('sum.reportImg')].filter(Boolean).join(t('sum.sep'));
      const said = t('sum.zipDone', { parts, name: r.name }) + '　';
      msg.textContent = said;
      const again = U.el('button'); again.textContent = t('sum.again'); again.onclick = () => r.again();
      const [title] = (o.stravaText || '').split('\n');
      const copyTitle = copyBtn(t('sum.copyTitle'), title), copyDesc = copyBtn(t('sum.copyDesc'), descNow);
      const btns = [again];
      if (r.fit) {
        const up = U.el('button', 'strava'); up.textContent = t('sum.strava');
        up.onclick = async () => {
          await RQ.platform.stravaUpload(r.name, o.stravaText);
          msg.textContent = t('sum.stravaZip', { name: r.name, fit: r.fit, kind: KIND_NOTE, photos: r.count ? t('sum.zipPhotos') : t('sum.zipReport') }) + '　';
          [again, up, copyTitle, copyDesc].forEach(b => row.appendChild(b));   // ボタンは文の下に1列（2026-10-26）
        };
        btns.push(up, copyTitle, copyDesc);
      }
      btns.forEach(b => row.appendChild(b));
    }
    // FIT の保存の結果（app.js が保存を終えてから呼ぶ。アプリ版）。Strava へは手で上げる
    function setFit(r) {
      const row = q('.fit-row'), msg = q('.fit-msg'); if (!row || !msg) return; row.hidden = false;   // 保存が終わる前に、まとめの画面を閉じていた
      if (r.download) {   // ブラウザ版：押してダウンロード（勝手にダウンロードすると止められることがある）
        msg.textContent = '';
        const dl = U.el('button', 'strava'); dl.textContent = t('sum.fitDl');
        dl.onclick = () => { dl.disabled = true; r.download().then(file => { dl.remove(); setFit({ file }); }, e => { dl.remove(); setFit({ error: e.message }); }); };
        row.appendChild(dl); return;
      }
      if (!r.file) { msg.textContent = t('sum.fitFailed', { msg: r.error }); return; }
      msg.textContent = t('sum.fitSaved', { word: savedWord, file: r.file }) + '　';
      const up = U.el('button', 'strava'); up.textContent = t('sum.strava');
      up.onclick = async () => {
        const png = await RQ.platform.stravaUpload(r.file, o.stravaText);
        const photoNote = photos && photos.count
          ? (web ? t('sum.photoNoteWeb', { n: photos.count, name: photos.name }) : t('sum.photoNoteApp', { n: photos.count }))
          : png ? (web ? t('sum.pngNoteWeb', { png }) : t('sum.pngNoteApp')) : '';
        msg.textContent = (web ? t('sum.stravaWeb', { file: r.file, kind: KIND_NOTE, photo: photoNote }) : t('sum.stravaApp', { kind: KIND_NOTE, photo: photoNote })) + '　';
        row.appendChild(up); if (P.canShowFile) row.appendChild(open); row.appendChild(copyTitle); row.appendChild(copyDesc);   // ボタンは文の下に1列（2026-10-26）
      };
      const open = U.el('button'); open.textContent = t('sum.openFolder'); open.onclick = () => RQ.platform.showFile(r.file);
      const [title] = (o.stravaText || '').split('\n');
      const copyTitle = copyBtn(t('sum.copyTitle'), title), copyDesc = copyBtn(t('sum.copyDesc'), descNow);
      row.appendChild(up); if (P.canShowFile) row.appendChild(open); row.appendChild(copyTitle); row.appendChild(copyDesc);
    }
    // 道中の写真の保存の結果（app.js が呼ぶ）
    let photos = null;   // 道中の写真の保存の結果（Strava の案内で使う）
    function setPhotos(r) {
      photos = r && !r.error ? r : null;
      const row = q('.photo-row'); if (!row) return; row.hidden = false; row.textContent = '';
      if (!r || r.error) { row.textContent = t('sum.photoFailed') + (r && r.error ? ': ' + r.error : ''); return; }
      if (web) {
        row.textContent = t('sum.photoZip', { n: r.count, name: r.name }) + '　';
        const again = U.el('button'); again.textContent = t('sum.again'); again.onclick = () => r.again(); row.appendChild(again);
      } else {
        row.textContent = t('sum.photoDir', { n: r.count, dir: r.dir }) + '　';
        if (P.canShowFile && r.files && r.files[0]) { const open = U.el('button'); open.textContent = t('sum.openFolder'); open.onclick = () => P.showFile(r.files[0]); row.appendChild(open); }
      }
    }
    // Strava の説明文の差し替え（冒険記が届いたとき。app.js が呼ぶ）。「説明をコピー」は押したときの中身を使う
    function setStravaText(text) { if (typeof text === 'string' && text) o.stravaText = text; }
    return { kind: 'summary', tick() { TR.setGrade(0); }, setFit, setPhotos, setBundle, setStravaText, stravaText: () => o.stravaText };
  }

  root.RQ.views.summary = summaryView;
})(window);
