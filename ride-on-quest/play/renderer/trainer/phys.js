/* パワー → 速度。tanken-ride（MIT）の physStep を移植（StreetSpinner と同じ係数）。
   移動中の速さの表示と、将来の地形の勾配に使う。 */
(function (root) {
  // 2026-10-24 ユーザー判断：実際の路上の感覚に寄せた（平地が 1〜3 km/h 速すぎた）。CdA 0.32→0.36、Crr 0.004→0.005、駆動のロス 3%（脚のパワーの 97% が進む力になる）
  const PHY = { rho: 1.2, CdA: 0.36, Crr: 0.005, eff: 0.97, g: 9.81 };
  // v: m/s、power: W、grade: 0.05 = 5%、mass: kg（人と自転車）、dt: 秒。新しい速度を返す
  function physStep(v, power, grade, mass, dt) {
    const th = Math.atan(grade);
    const F = PHY.rho * PHY.CdA * v * v / 2 + PHY.Crr * mass * PHY.g * Math.cos(th) + mass * PHY.g * Math.sin(th);
    // 駆動力＝パワー÷速さ。速さが小さい所で割り算が暴れないよう下限を置く。以前は 1.0 m/s だったが、急坂＋低パワー（例：80 W・10%、120 W・15%）で、釣り合う速さ（パワー÷抵抗）が 1 m/s より遅いと、駆動力が足りず 0 に張りつき、そこから動き出さなかった（2026-10-25 林の中で止まった）。下限を 0.3 m/s にして、遅くても釣り合う速さまで進む
    const drive = power * PHY.eff / Math.max(v, 0.3);
    v = Math.max(0, v + (drive - F) / mass * dt);
    if (power === 0 && v < 0.3) v = 0;
    return v;
  }
  const api = { PHY, physStep };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).phys = api;
})(typeof window !== 'undefined' ? window : globalThis);
