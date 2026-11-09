/* 月のレポート（試作。2026-11-03）の数値を作る。画面に触らない。
   1回の走りごとに、1秒ごとの記録（パワー・心拍・回転数・距離）から「走りの数値」（rideMetrics）を作って残し、
   月ごとにまとめ（month）、前の月と並べて Claude に渡す形（reportFacts）にする。Claude に渡すのは、まとめた数値だけ（1秒ごとの記録は渡さない）。
   試すのは2通り（設定の「月のレポート」で切り替える）：
     A（local）：走りの数値は、このパソコン（ブラウザ）の中だけに残す。Electron 版は「書類/Ride on Quest」の FIT からも作り直せる。
     B（server）：走りの数値をゴースト共有サーバーにも残す（別のパソコン・ブラウザ版でも同じレポートが作れる）。
   どちらも、1秒ごとの記録そのものはサーバーへ送らない。 */
(function (root) {
  const V = 1;
  const ZONES = [0.55, 0.75, 0.90, 1.05, 1.20, 1.50];      // パワーのゾーンの境目（FTP 比。training.js と同じ7区分）
  const HR_ZONES = [0.60, 0.70, 0.80, 0.90];               // 心拍のゾーンの境目（最大心拍数の比。training.js と同じ5区分）
  const STEADY = { lo: 0.60, hi: 0.75, minSec: 300 };      // 「同じパワーでの心拍」に使うパワーの帯（FTP の 60〜75%＝持久走）と、要る秒数
  const DRIFT = { minSec: 45 * 60, skipSec: 10 * 60 };     // 後半の心拍の上がり方：45分以上の走りで、最初の10分（アップ）を除いて前半・後半を比べる
  const PEAKS = { s5: 5, m1: 60, m5: 300, m20: 1200 };     // パワーの最高値（5秒・1分・5分・20分の平均）

  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const r1 = x => Math.round(x * 10) / 10;
  const pad = n => String(n).padStart(2, '0');
  const dayOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  function best(ps, n) {
    if (ps.length < n) return null;
    let sum = 0, b = 0;
    for (let i = 0; i < ps.length; i++) { sum += ps[i]; if (i >= n) sum -= ps[i - n]; if (i >= n - 1) b = Math.max(b, sum / n); }
    return Math.round(b);
  }
  function np(ps) {
    if (ps.length < 30) return Math.round(avg(ps));
    let sum = 0; const r = [];
    for (let i = 0; i < ps.length; i++) { sum += ps[i]; if (i >= 30) sum -= ps[i - 30]; if (i >= 29) r.push((sum / 30) ** 4); }
    return Math.round(avg(r) ** 0.25);
  }
  const zoneOf = (x, edges) => { let i = 0; while (i < edges.length && x >= edges[i]) i++; return i; };

  // 1回の走りの数値。samples：[{ p: W, c: rpm, hr: bpm|null, d: 積算距離 m }]（1秒ごと。app.js の rec.samples や FIT の記録）
  // o：{ ftp, hrMax, start（走り始めのミリ秒）, kind（quest・ride・trial・race・outing・fit） }
  function rideMetrics(samples, { ftp = 200, hrMax = 185, start = Date.now(), kind = null } = {}) {
    const ps = samples.map(s => Math.max(0, +s.p || 0)), sec = ps.length;
    const hrs = samples.map(s => (s.hr > 30 && s.hr < 250 ? s.hr : null));
    const withHr = hrs.filter(Boolean);
    const n = np(ps), IF = ftp ? n / ftp : 0;
    const last = samples.length ? samples[samples.length - 1] : null;
    const zones = Array(7).fill(0); for (const p of ps) zones[zoneOf(p / ftp, ZONES)]++;
    let hrZones = null;
    if (withHr.length >= 60 && hrMax) { hrZones = Array(5).fill(0); for (const h of withHr) hrZones[zoneOf(h / hrMax, HR_ZONES)]++; }
    // 同じパワーでの心拍：パワーが FTP の 60〜75% で、こいでいて、心拍がある秒だけ
    let steady = null;
    { const sp = [], sh = [];
      samples.forEach((s, i) => { const r = ps[i] / ftp; if (hrs[i] && r >= STEADY.lo && r < STEADY.hi && (s.c == null || s.c > 0)) { sp.push(ps[i]); sh.push(hrs[i]); } });
      if (sp.length >= STEADY.minSec) { const p = avg(sp), h = avg(sh); steady = { sec: sp.length, p: Math.round(p), hr: Math.round(h), ef: Math.round(p / h * 100) / 100 }; } }
    // 長い走りの後半の心拍の上がり方：（前半のパワー÷心拍）と（後半のパワー÷心拍）の差。プラスなら後半に心拍が上がった（同じ心拍で出るパワーが減った）
    let drift = null;
    if (sec >= DRIFT.minSec && withHr.length >= sec * 0.8) {
      const from = DRIFT.skipSec, mid = from + Math.floor((sec - from) / 2);
      const half = (a, b) => { const p = [], h = []; for (let i = a; i < b; i++) if (hrs[i]) { p.push(ps[i]); h.push(hrs[i]); } return { p: Math.round(avg(p)), hr: Math.round(avg(h)) }; };
      const f = half(from, mid), s = half(mid, sec);
      if (f.hr && s.hr && f.p > 0) drift = { min: Math.round(sec / 60), first: f, second: s, pct: r1(((f.p / f.hr) - (s.p / s.hr)) / (f.p / f.hr) * 100) };
    }
    const peaks = {}; for (const [k, w] of Object.entries(PEAKS)) peaks[k] = best(ps, w);
    return {
      v: V, start, day: dayOf(start), kind, ftp, hrMax, sec,
      km: last && Number.isFinite(+last.d) ? r1(last.d / 1000) : null,
      avgP: Math.round(avg(ps)), np: n, IF: Math.round(IF * 100) / 100, tss: Math.round(sec * n * IF / (ftp * 3600) * 100), kj: Math.round(ps.reduce((a, x) => a + x, 0) / 1000),
      peaks, zones, hrZones,
      hr: withHr.length >= 60 ? { avg: Math.round(avg(withHr)), max: Math.max(...withHr) } : null,
      steady, drift,
    };
  }

  // 走りの数値の一覧に足す（同じ走り始めは入れ替え）。新しい順に keep 個まで
  function add(list, ride, keep = 300) {
    const out = (Array.isArray(list) ? list : []).filter(r => r && r.start !== ride.start);
    out.push(ride); out.sort((a, b) => b.start - a.start);
    return out.slice(0, keep);
  }

  // '2026-11' の前の月
  const prevMonth = ym => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`; };
  const monthOfMs = ms => dayOf(ms).slice(0, 7);
  const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };

  // 月のまとめ。rides：走りの数値の一覧（ほかの月が混ざっていてよい）
  function month(rides, ym) {
    const rs = (rides || []).filter(r => r && r.day && r.day.slice(0, 7) === ym).sort((a, b) => a.start - b.start);
    if (!rs.length) return { ym, rides: 0 };
    const sum = k => rs.reduce((a, r) => a + (+r[k] || 0), 0);
    const peaks = {}; for (const k of Object.keys(PEAKS)) { const v = rs.map(r => r.peaks && r.peaks[k]).filter(x => x != null); peaks[k] = v.length ? Math.max(...v) : null; }
    const zones = Array(7).fill(0); rs.forEach(r => (r.zones || []).forEach((s, i) => { zones[i] += s; }));
    const hrRides = rs.filter(r => r.hrZones);
    const hrZones = hrRides.length ? Array(5).fill(0) : null; hrRides.forEach(r => r.hrZones.forEach((s, i) => { hrZones[i] += s; }));
    // 同じパワーでの心拍：月の前半・後半それぞれ、秒数で重みを付けた平均
    const steadyOf = list => { const s = list.filter(r => r.steady); const t = s.reduce((a, r) => a + r.steady.sec, 0); if (!t) return null;
      const p = s.reduce((a, r) => a + r.steady.p * r.steady.sec, 0) / t, h = s.reduce((a, r) => a + r.steady.hr * r.steady.sec, 0) / t;
      return { rides: s.length, min: Math.round(t / 60), p: Math.round(p), hr: Math.round(h), ef: Math.round(p / h * 100) / 100 }; };
    const midDay = Math.ceil(daysIn(ym) / 2), early = rs.filter(r => +r.day.slice(8) <= midDay), late = rs.filter(r => +r.day.slice(8) > midDay);
    const drifts = rs.filter(r => r.drift).map(r => ({ day: r.day, min: r.drift.min, pct: r.drift.pct }));
    const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : r1((s[s.length / 2 - 1] + s[s.length / 2]) / 2); };
    const weeks = [0, 0, 0, 0, 0]; rs.forEach(r => { weeks[Math.min(4, Math.floor((+r.day.slice(8) - 1) / 7))] += r.tss || 0; });
    return {
      ym, rides: rs.length, days: new Set(rs.map(r => r.day)).size,
      min: Math.round(sum('sec') / 60), km: r1(sum('km')), kj: Math.round(sum('kj')), tss: Math.round(sum('tss')),
      longestMin: Math.round(Math.max(...rs.map(r => r.sec)) / 60),
      ftp: { first: rs[0].ftp, last: rs[rs.length - 1].ftp },
      peaks, zoneMin: zones.map(s => Math.round(s / 60)), hrZoneMin: hrZones ? hrZones.map(s => Math.round(s / 60)) : null, hrRides: hrRides.length,
      steady: steadyOf(rs), steadyEarly: steadyOf(early), steadyLate: steadyOf(late),
      drift: drifts.length ? { rides: drifts.length, median: med(drifts.map(d => d.pct)), list: drifts.slice(-8) } : null,
      weekTss: weeks.map(Math.round),
    };
  }

  // Claude に渡す形：今月と前の月のまとめと、比べた差。o：{ lang, ym, now（月の途中なら、何日までか）, hrMax }
  function reportFacts(rides, { lang = 'ja', ym, today = null, hrMax = null } = {}) {
    const cur = month(rides, ym), prev = month(rides, prevMonth(ym));
    const diff = {};
    if (cur.rides && prev.rides) {
      for (const k of Object.keys(PEAKS)) if (cur.peaks[k] != null && prev.peaks[k] != null) diff[k] = { w: cur.peaks[k] - prev.peaks[k], pct: r1((cur.peaks[k] - prev.peaks[k]) / prev.peaks[k] * 100) };
      if (cur.steady && prev.steady) diff.steady = { p: cur.steady.p - prev.steady.p, hr: cur.steady.hr - prev.steady.hr, ef: Math.round((cur.steady.ef - prev.steady.ef) * 100) / 100 };
      if (cur.drift && prev.drift) diff.drift = r1(cur.drift.median - prev.drift.median);
      diff.min = cur.min - prev.min; diff.tss = cur.tss - prev.tss;
    }
    return { v: V, lang: lang === 'en' ? 'en' : 'ja', ym, through: today, daysInMonth: daysIn(ym), hrMax, powerZoneEdgesFtp: ZONES, hrZoneEdgesMax: HR_ZONES,
      steadyBandFtp: [STEADY.lo, STEADY.hi], cur, prev: prev.rides ? prev : null, diff };
  }

  const api = { V, ZONES, HR_ZONES, STEADY, DRIFT, PEAKS, rideMetrics, add, month, reportFacts, prevMonth, monthOfMs, dayOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).monthly = api;
})(typeof window !== 'undefined' ? window : globalThis);
