/* 表示の単位（2026-10-24 ユーザー判断）：メートル法（km/h・km・m・kg）か、ヤード・ポンド法（mph・mi・ft・lb）を設定で選ぶ。
   既定は言語で決める（日本語＝メートル法、英語＝ヤード・ポンド法）。あとから設定で替えられる。
   変えるのは画面に出す数字と単位だけ。FIT・記録・物理・道の網など、中の値はいつも SI（m・m/s・kg）のまま。
   RQ.units.set('metric' | 'imperial')。dist(km)・elev(m)・speed(km/h) は単位つきの文字、…V は数字だけ、…U は単位だけ。 */
(function (root) {
  const KM_MI = 1.609344, M_FT = 0.3048, KG_LB = 0.45359237;
  const SYSTEMS = ['metric', 'imperial'];
  const defaultFor = lang => (lang === 'ja' ? 'metric' : 'imperial');
  let sys = 'metric';
  const imp = () => sys === 'imperial';

  const set = s => { sys = SYSTEMS.includes(s) ? s : 'metric'; return sys; };
  const get = () => sys;
  // 距離（中の値は km）
  const distV = (km, d = 1) => +((imp() ? km / KM_MI : km).toFixed(d));
  const distU = () => (imp() ? 'mi' : 'km');
  const dist = (km, d = 1) => `${(imp() ? km / KM_MI : km).toFixed(d)} ${distU()}`;
  // 高さ（中の値は m。整数に丸める）
  const elevV = m => Math.round(imp() ? m / M_FT : m);
  const elevU = () => (imp() ? 'ft' : 'm');
  const elev = m => `${elevV(m)} ${elevU()}`;
  // 速さ（中の値は km/h）
  const speedV = kmh => (imp() ? kmh / KM_MI : kmh);
  const speedU = () => (imp() ? 'mph' : 'km/h');
  // 体重（中の値は kg）。設定の欄に出す値と、欄の値から kg に戻す
  const massV = kg => Math.round(imp() ? kg / KG_LB : kg);
  const massU = () => (imp() ? 'lb' : 'kg');
  const massKg = v => (imp() ? v * KG_LB : v);

  const api = { SYSTEMS, defaultFor, set, get, dist, distV, distU, elev, elevV, elevU, speedV, speedU, massV, massU, massKg, KM_MI, M_FT, KG_LB };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).units = api;
})(typeof window !== 'undefined' ? window : globalThis);
