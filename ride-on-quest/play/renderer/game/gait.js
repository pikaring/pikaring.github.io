/* 主人公の足の運び（2026-10-24 ユーザー判断：走る後ろ姿）。画面に触らない純粋な関数。
   速さで歩きと走りを切り替える：時速 RUN_ON km 以上で走り、RUN_OFF km 未満に落ちたら歩きに戻る（境目でちらつかない）。
   走りのコマ送り（1巡り＝走る4コマ＝2歩）は速さに合わせて上げる：runRate(km/h) 巡り/秒。歩きは今のまま（ペダル1回転で1巡り）。
   走れるのは、走る後ろ姿の絵（2D）がある人か、3D で描く人（3D は8人とも走りの動きを持つ）。どちらも無ければ、いつも歩き。 */
(function (root) {
  const RUN_ON = 20, RUN_OFF = 17;
  // 走りの弾み（walkPose）の大きさ。歩きの何倍か。絵の4コマに上下の動きがあるので小さく（2026-10-25 ユーザー指摘「ぴょんぴょんしすぎ」。
  // 弾みなし・0.4・歩きと同じ を見比べて 0.4）。弾むのは歩きと同じく1歩に1回
  const RUN_BOUNCE = 0.4;
  // 走りの1巡り（4コマ）の速さ：20 km/h で 1.6、30 km/h で 1.95、上限 2.6（巡り/秒。1巡り＝2歩）
  const runRate = kmh => Math.min(2.6, Math.max(1.4, 0.9 + 0.035 * kmh));
  // 走るか（前の状態 running から、今の速さで決める）
  const running = (prev, kmh, canRun = true) => !!canRun && (prev ? kmh >= RUN_OFF : kmh >= RUN_ON);
  // 走れるか（2026-10-28 試走の指摘 No.7・25：ワルキューレのペースメーカーが時速 30 km、侍が時速 36 km でも歩いていた）。
  // 前は 2D の走る絵だけを見ていたので、走る絵の無い新しい4人（ワルキューレ・エルフ・侍・傭兵）は 3D でもずっと歩いていた。
  // run2d：走る後ろ姿の絵があるか（sprites.js の canRun）。use3d：3D で描く人か（hero3d.available。8人とも）。板で描くときに走る絵が無ければ、板は歩きのコマ
  const canRunAs = ({ run2d = false, use3d = false } = {}) => !!run2d || !!use3d;
  const RUN = [0, 1, 2, 3];   // 走る4コマの順（絵の担当：A 左足 → B そろう → C 右足 → B'）

  const api = { RUN_ON, RUN_OFF, RUN_BOUNCE, RUN, runRate, running, canRunAs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).gait = api;
})(typeof window !== 'undefined' ? window : globalThis);
