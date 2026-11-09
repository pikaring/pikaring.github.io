/* 体力の推移（2026-10-24 ユーザー判断）：旅ごとの TSS から、体力（CTL・42日）・疲れ（ATL・7日）・調子（TSB）と、週ごとの TSS を出す。画面に触らない。
   記録（rq.records の1件：{ day: 'YYYY-MM-DD', tss }）を日ごとに足し、毎日 CTL ← CTL + (その日の TSS − CTL) / 42、ATL ← ATL + (TSS − ATL) / 7。
   調子（TSB）は、前の日の CTL − ATL（その日の朝の調子。TrainingPeaks と同じ考え方）。記録の無い日は TSS 0 として進める。 */
(function (root) {
  const CTL_DAYS = 42, ATL_DAYS = 7;
  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  // 日ごとの TSS（{ 'YYYY-MM-DD': 合計 }）
  function dailyTss(recs) {
    const by = {};
    for (const r of recs || []) {
      const k = r.day || (/^(\d{4})\D(\d{1,2})\D(\d{1,2})/.exec(r.date || '') || []).slice(1).map((x, i) => (i ? pad(+x) : x)).join('-');
      if (!k || !(r.tss > 0)) continue;
      by[k] = (by[k] || 0) + r.tss;
    }
    return by;
  }
  // 今日（now）までの毎日の { day, tss, ctl, atl, tsb }。いちばん古い記録の日から始める（記録が無ければ空）。show：返す日数（終わりから）
  function series(recs, now = new Date(), show = CTL_DAYS) {
    const by = dailyTss(recs), keys = Object.keys(by).sort();
    if (!keys.length) return [];
    let d = parse(keys[0]); const end = parse(keyOf(now)), out = [];
    let ctl = 0, atl = 0;
    for (let guard = 0; d <= end && guard < 4000; guard++, d = addDays(d, 1)) {
      const k = keyOf(d), tss = by[k] || 0, tsb = ctl - atl;
      ctl += (tss - ctl) / CTL_DAYS; atl += (tss - atl) / ATL_DAYS;
      out.push({ day: k, tss, ctl, atl, tsb });
    }
    return out.slice(-show);
  }
  // 週ごとの TSS（月曜はじまり。今週を最後に n 週）。[{ from: 'YYYY-MM-DD', tss }]
  function weekly(recs, now = new Date(), n = 6) {
    const by = dailyTss(recs), mon = addDays(now, -((now.getDay() + 6) % 7)), out = [];
    for (let w = n - 1; w >= 0; w--) {
      const s = addDays(mon, -7 * w); let sum = 0;
      for (let i = 0; i < 7; i++) sum += by[keyOf(addDays(s, i))] || 0;
      out.push({ from: keyOf(s), tss: Math.round(sum) });
    }
    return out;
  }
  // 今の値（丸めたもの）。記録が無ければ null
  function now(recs, at = new Date()) {
    const s = series(recs, at, 1)[0];
    return s ? { ctl: Math.round(s.ctl), atl: Math.round(s.atl), tsb: Math.round(s.ctl - s.atl) } : null;
  }

  const api = { CTL_DAYS, ATL_DAYS, dailyTss, series, weekly, now };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).fitness = api;
})(typeof window !== 'undefined' ? window : globalThis);
