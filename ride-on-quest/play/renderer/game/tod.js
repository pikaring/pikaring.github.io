/* 空の時刻（2026-10-23 ユーザー判断）：走り始めてからの経過時間で進める。走り始めは朝（7 時）、60 分かけて 朝 → 昼 → 夕方（19 時）、
   夜は短く 30 分で（19 時 → 翌 7 時）、また朝が来る（1 周 90 分）。夜明け・夕暮れの色の移り変わりは数分かけてなめらかに。
   旅・フリーライド・続けて走る（記録は切らないので同じ時計）・女王の試練・レースとも同じ。画面にも物にも触らない純粋な関数。
   RQ.tod.hourAt(秒) → 時刻 0〜24。RQ.tod.sky(時刻) → { zenith, horizon, sunCol, sunI, hemiSky, hemiGround, hemiI, sunDir, moonDir, night, glow, sun, moon }
   色は [r, g, b]（0〜1）、方向は [x（東）, y（上）, z（南）]。RQ.tod.sec は経過秒（view3d.js が dt を足し、旅のはじめに app.js が 0 にする）。 */
(function (root) {
  const DAY_MIN = 60, NIGHT_MIN = 30, START_HOUR = 7;   // 昼の部（7 → 19 時）と夜（19 → 31 時）の長さ（分）
  const CYCLE = (DAY_MIN + NIGHT_MIN) * 60;
  // 走り始めからの秒 → 時刻（0〜24）。昼の部は 12 時間を 60 分で、夜は 12 時間を 30 分で進む
  function hourAt(sec) {
    const p = ((sec % CYCLE) + CYCLE) % CYCLE / 60;   // 1 周の中の分
    const h = p < DAY_MIN ? START_HOUR + p / DAY_MIN * 12 : START_HOUR + 12 + (p - DAY_MIN) / NIGHT_MIN * 12;
    return h % 24;
  }
  const hex = c => [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255];
  // 時刻（5〜29 時。0〜5 時は +24）ごとの空。zenith＝天頂、horizon＝地平線（霧の色）、sun＝太陽（月）の光の色と強さ、hemi＝空と地面の照り返し
  const KEYS = [
    { h: 5,    zenith: 0x0b1030, horizon: 0x1c2548, sun: 0x8fa0d8, sunI: 0.30, hemiSky: 0x7080c0, hemiGround: 0x2c3448, hemiI: 0.60 },   // 夜
    { h: 6.5,  zenith: 0x3a5a9a, horizon: 0xf0a070, sun: 0xffb070, sunI: 0.45, hemiSky: 0xc8c0d8, hemiGround: 0x5a5040, hemiI: 0.70 },   // 夜明け
    { h: 8,    zenith: 0x5a9ade, horizon: 0xc4e0f2, sun: 0xfff0d8, sunI: 0.72, hemiSky: 0xdfefff, hemiGround: 0x4a5a3a, hemiI: 0.85 },   // 朝
    { h: 12,   zenith: 0x3c86d8, horizon: 0xaed8f2, sun: 0xffffff, sunI: 0.80, hemiSky: 0xdfefff, hemiGround: 0x4a5a3a, hemiI: 0.85 },   // 昼
    { h: 16,   zenith: 0x4a8ad8, horizon: 0xcce0ee, sun: 0xfff2d0, sunI: 0.74, hemiSky: 0xe6eef8, hemiGround: 0x4a5a3a, hemiI: 0.85 },   // 午後
    { h: 18,   zenith: 0x4a5ca8, horizon: 0xf0a060, sun: 0xff9050, sunI: 0.60, hemiSky: 0xf0d0b8, hemiGround: 0x54443a, hemiI: 0.76 },   // 夕方
    { h: 19.5, zenith: 0x1e2858, horizon: 0x7a4a70, sun: 0x805060, sunI: 0.20, hemiSky: 0x8a80b8, hemiGround: 0x3a3a50, hemiI: 0.64 },   // 夕暮れ
    { h: 21,   zenith: 0x0b1030, horizon: 0x1c2548, sun: 0x8fa0d8, sunI: 0.30, hemiSky: 0x7080c0, hemiGround: 0x2c3448, hemiI: 0.60 },   // 夜
    { h: 29,   zenith: 0x0b1030, horizon: 0x1c2548, sun: 0x8fa0d8, sunI: 0.30, hemiSky: 0x7080c0, hemiGround: 0x2c3448, hemiI: 0.60 },   // 夜（= 5 時）
  ].map(k => ({ ...k, zenith: hex(k.zenith), horizon: hex(k.horizon), sun: hex(k.sun), hemiSky: hex(k.hemiSky), hemiGround: hex(k.hemiGround) }));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), lerp = (a, b, t) => a + (b - a) * t, ss = t => t * t * (3 - 2 * t);
  const unit = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  function sky(hour) {
    const h = hour < 5 ? hour + 24 : hour;
    let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
    const a = KEYS[i], b = KEYS[i + 1], t = ss(Math.max(0, Math.min(1, (h - a.h) / (b.h - a.h))));
    // 昼は 6.5〜18.5 時、太陽は東から南を通って西へ（高さ sin）。夜は 18.5〜30.5 時の月が同じ道すじ
    const arc = (x, k) => { const th = Math.PI * Math.max(0, Math.min(1, (x - k) / 12)); return unit([Math.cos(th), Math.sin(th) * 0.95 + 0.02, 0.45]); };
    const sunDir = arc(h, 6.5), moonDir = arc(h < 6.5 ? h + 24 : h, 18.5);
    const night = h < 5.5 ? 1 : h < 7 ? 1 - ss((h - 5.5) / 1.5) : h < 18.5 ? 0 : h < 20 ? ss((h - 18.5) / 1.5) : 1;   // 0＝昼 … 1＝夜
    const day = 1 - night;
    return { hour: h % 24, zenith: mix(a.zenith, b.zenith, t), horizon: mix(a.horizon, b.horizon, t), sunCol: mix(a.sun, b.sun, t), sunI: lerp(a.sunI, b.sunI, t),
      hemiSky: mix(a.hemiSky, b.hemiSky, t), hemiGround: mix(a.hemiGround, b.hemiGround, t), hemiI: lerp(a.hemiI, b.hemiI, t),
      sunDir, moonDir, night, sun: day > 0.02 ? day : 0, moon: night > 0.02 ? night : 0,
      glow: Math.max(0, 1 - Math.abs(h - 6.5) / 1.6, 1 - Math.abs(h - 18.3) / 2.2) };   // 夜明け・夕方の空の染まり（0〜1）
  }
  const api = { DAY_MIN, NIGHT_MIN, START_HOUR, CYCLE, hourAt, sky, sec: 0 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).tod = api;
})(typeof window !== 'undefined' ? window : globalThis);
