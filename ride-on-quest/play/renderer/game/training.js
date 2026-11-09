/* トレーニングのまとめの計算。1秒ごとの記録（パワー・回転数・心拍・場面）から、
   平均パワー、NP、IF、TSS、仕事量、最大パワー、ゾーン別の時間を出す。画面に触らない。 */
(function (root) {
  // パワーのゾーン（FTP 比。Coggan の7区分。2026-10-24 に Z7 を足した）
  const ZONES = [
    { n: 'Z1 回復', lo: 0, hi: 0.55 },
    { n: 'Z2 持久', lo: 0.55, hi: 0.75 },
    { n: 'Z3 テンポ', lo: 0.75, hi: 0.90 },
    { n: 'Z4 閾値', lo: 0.90, hi: 1.05 },
    { n: 'Z5 VO2max', lo: 1.05, hi: 1.20 },
    { n: 'Z6 無酸素', lo: 1.20, hi: 1.50 },
    { n: 'Z7 神経筋', lo: 1.50, hi: Infinity },
  ];
  // 心拍のゾーン（最大心拍数の比。5区分。2026-10-24）：心拍ベルトなどで心拍があるときだけ数える
  const HR_ZONES = [
    { n: 'Z1', lo: 0, hi: 0.60 },
    { n: 'Z2', lo: 0.60, hi: 0.70 },
    { n: 'Z3', lo: 0.70, hi: 0.80 },
    { n: 'Z4', lo: 0.80, hi: 0.90 },
    { n: 'Z5', lo: 0.90, hi: Infinity },
  ];

  function rollingBest(ps, n) {
    if (ps.length < n) return null;
    let sum = 0, best = 0;
    for (let i = 0; i < ps.length; i++) { sum += ps[i]; if (i >= n) sum -= ps[i - n]; if (i >= n - 1) best = Math.max(best, sum / n); }
    return Math.round(best);
  }

  // NP：30秒移動平均の4乗の平均の4乗根
  function normalizedPower(ps) {
    if (ps.length < 30) return ps.length ? Math.round(ps.reduce((a, x) => a + x, 0) / ps.length) : 0;
    let sum = 0, acc = 0, n = 0;
    for (let i = 0; i < ps.length; i++) {
      sum += ps[i]; if (i >= 30) sum -= ps[i - 30];
      if (i >= 29) { acc += Math.pow(sum / 30, 4); n++; }
    }
    return Math.round(Math.pow(acc / n, 0.25));
  }

  // samples：[{ p: W, c: rpm, hr: bpm|null, k: 'field'|'battle' }]（1秒ごと）
  // hrMax：最大心拍数（心拍のゾーンに使う。無ければ心拍のゾーンは出さない）
  function summarize(samples, ftp, hrMax = null) {
    const ps = samples.map(s => s.p), sec = samples.length;
    const avgP = sec ? Math.round(ps.reduce((a, x) => a + x, 0) / sec) : 0;
    const np = normalizedPower(ps), IF = ftp ? np / ftp : 0;
    const moving = samples.filter(s => s.c > 0);
    const hrs = samples.map(s => s.hr).filter(Boolean);
    const zones = ZONES.map(z => ({ ...z, loW: Math.round(z.lo * ftp), hiW: z.hi === Infinity ? null : Math.round(z.hi * ftp), sec: 0 }));
    for (const p of ps) { const r = p / ftp; const z = zones.find(z => r >= z.lo && r < z.hi) || zones[0]; z.sec++; }
    return {
      sec, ftp, avgP, np, IF: Math.round(IF * 100) / 100,
      tss: Math.round(sec * np * IF / (ftp * 3600) * 100),
      kj: Math.round(ps.reduce((a, x) => a + x, 0) / 1000),
      avgCad: moving.length ? Math.round(moving.reduce((a, s) => a + s.c, 0) / moving.length) : 0,
      max5s: rollingBest(ps, 5), max1m: rollingBest(ps, 60), max5m: rollingBest(ps, 300),
      avgHr: hrs.length ? Math.round(hrs.reduce((a, x) => a + x, 0) / hrs.length) : null,
      maxHr: hrs.length ? Math.max(...hrs) : null,
      battleSec: samples.filter(s => s.k === 'battle').length,
      zones,
      hrZones: hrMax && hrs.length ? HR_ZONES.map(z => ({ ...z, loB: Math.round(z.lo * hrMax), hiB: z.hi === Infinity ? null : Math.round(z.hi * hrMax), sec: hrs.filter(h => h / hrMax >= z.lo && h / hrMax < z.hi).length })) : null,
    };
  }

  const api = { ZONES, HR_ZONES, summarize, normalizedPower, rollingBest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).training = api;
})(typeof window !== 'undefined' ? window : globalThis);
