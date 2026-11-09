/* 走行データの表示（アクションカメラの走行データの重ね表示のように、遊んでいる間はいつも出す）。
   左に残り時間・高度・勾配・総距離・心拍、右にケイデンス・パワー（とその下に ERG の目標）、右下に速度のメーター。画面（#screen）とは別の層。
   RQ.hud.show(bool)、RQ.hud.update({ left, ele, grade, target, km, cad, power, hr, kmh, note })。note：小さな知らせ（つなぎ直している・自動の一時停止）。left（秒）が無ければ残り時間は出さない。
   target：右の列のパワーの下に、黄色い小さな知らせと同じ字で1行（2026-10-29 試走 No.1 ユーザー判断：開発中しかいらないので左の列から外した。左の列が下にはみ出して心拍が消えていた。ケイデンスとパワーの位置は変えない）。{ kind: 'erg', v: W }＝ERG の目標パワー、{ kind: 'grade', v: %, off }＝トレーナーへ送る勾配（off＝ERG をオフにしている）、null＝出さない */
(function (root) {
  const MAX_KMH = 100;   // メーターの目盛りの上限（下りは 80〜90 km/h まで出る。2026-10-25）
  const el = document.getElementById('hud'), t = root.RQ.i18n.t;
  el.innerHTML = `
    <div class="hud-col left">
      <div class="hud-item left-t"><div class="k">${t('hud.left')}</div><div class="v"><b class="remain">0:00</b></div></div>
      <div class="hud-item"><div class="k">${t('hud.ele')}</div><div class="v"><b class="ele">0</b><small class="u-ele">M</small></div></div>
      <div class="hud-item"><div class="k">${t('hud.grade')}</div><div class="v"><b class="grade">0</b><small>%</small></div></div>
      <div class="hud-item"><div class="k">${t('hud.dist')}</div><div class="v"><b class="km">0.00</b><small class="u-km">KM</small></div></div>
      <div class="hud-item hr"><div class="k">${t('hud.hr')}</div><div class="v"><b class="hrv">0</b><small>BPM</small></div></div>
    </div>
    <div class="hud-col right">
      <div class="hud-item"><div class="k">${t('hud.cad')}</div><div class="v"><b class="cad">0</b><small>RPM</small></div></div>
      <div class="hud-item"><div class="k">${t('hud.power')}</div><div class="v"><b class="power">0</b><small>W</small></div></div>
      <div class="hud-tgt" hidden></div>
    </div>
    <div class="hud-speed">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <g class="ticks"></g>
        <path class="track" d=""></path>
        <path class="fill" d=""></path>
        <polygon class="needle" points="0,0 0,0 0,0"></polygon>
      </svg>
      <b class="kmh">0</b><small class="u-kmh">KM/H</small>
    </div>
    <div class="hud-note" hidden></div>`;
  const q = s => el.querySelector(s);

  // 速度のメーター：左下から右下まで 270° の弧。0〜60 km/h を緑 → 黄 → 橙 → 赤の目盛りで
  const C = 100, R = 78, A0 = 135, SPAN = 270;
  const pt = (deg, r) => { const a = deg * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
  const arc = (d0, d1, r) => { const [x0, y0] = pt(d0, r), [x1, y1] = pt(d1, r); return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`; };
  q('.track').setAttribute('d', arc(A0, A0 + SPAN, R));
  {
    const colors = ['#3ec46d', '#3ec46d', '#9ad04a', '#f2c14e', '#f39c3d', '#ee5a3a'], n = colors.length, g = q('.ticks');
    for (let i = 0; i < n; i++) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', arc(A0 + SPAN * i / n + 2, A0 + SPAN * (i + 1) / n - 2, R + 12));
      p.setAttribute('class', 'seg'); p.style.stroke = colors[i];
      g.appendChild(p);
    }
  }

  let shown = false;
  function show(on) { if (on !== shown) { shown = on; el.hidden = !on; } }
  function update(d) {
    if (!shown) return;
    q('.left-t').hidden = d.left == null;
    if (d.left != null) q('.remain').textContent = root.RQ.ui.mmss(d.left);
    q('.ele').textContent = root.RQ.units.elevV(d.ele || 0); q('.u-ele').textContent = root.RQ.units.elevU().toUpperCase();
    q('.grade').textContent = ((d.grade || 0) * 100).toFixed(1);
    // 小さな知らせ（つなぎ直している・自動の一時停止）。速度のメーターのすぐ上
    { const n = q('.hud-note'), m = d.note || ''; if (n.textContent !== m) n.textContent = m; n.hidden = !m; }
    const tg = d.target;
    q('.hud-tgt').hidden = !tg;
    if (tg) {
      const erg = tg.kind === 'erg', down = !!(erg && tg.down);   // down：回転が低くて下げている・負荷を抜いている（↓。数字は今送っている目標そのまま）
      // off：ERG をオフにして勾配を送っている（2026-11-07。旅・フリーライドで E キーか一時停止の窓で切り替え）
      const m = `${down ? '↓' : ''}${tg.off ? t('hud.ergOffShort') + ' · ' : ''}${t(erg ? 'hud.erg' : 'hud.load')} ${erg ? Math.round(tg.v) + 'W' : tg.v.toFixed(1) + '%'}`;
      if (q('.hud-tgt').textContent !== m) q('.hud-tgt').textContent = m;
      q('.hud-tgt').classList.toggle('down', down);   // 下げている間は橙（2026-10-25 ユーザー要望）
    }
    const Un = root.RQ.units;   // 表示の単位（中の値は km・m・km/h のまま）
    { const dv = Un.distV(d.km || 0, 2); q('.km').textContent = dv >= 10 ? Un.distV(d.km || 0, 1).toFixed(1) : dv.toFixed(2); }   // 10 以上は小数点以下1桁（2026-10-26：KM がドラムに重なった） q('.u-km').textContent = Un.distU().toUpperCase();
    q('.cad').textContent = Math.round(d.cad || 0);
    q('.power').textContent = Math.round(d.power || 0);
    q('.hr').hidden = !d.hr;
    if (d.hr) q('.hrv').textContent = Math.round(d.hr);
    const kmh = Math.max(0, d.kmh || 0), deg = A0 + SPAN * Math.min(1, kmh / MAX_KMH);
    q('.kmh').textContent = Math.round(Un.speedV(kmh)); q('.u-kmh').textContent = Un.speedU().toUpperCase();
    q('.fill').setAttribute('d', kmh > 0.3 ? arc(A0, deg, R) : '');
    const [tx, ty] = pt(deg, R + 22), [lx, ly] = pt(deg - 4, R + 6), [rx, ry] = pt(deg + 4, R + 6);
    q('.needle').setAttribute('points', `${tx.toFixed(1)},${ty.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)} ${rx.toFixed(1)},${ry.toFixed(1)}`);
  }

  root.RQ.hud = { show, update };
})(window);
