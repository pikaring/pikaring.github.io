/* シーン → 曲の切り替えの規則。画面にも AudioContext にも触らない純粋な関数（node のテストで確かめる）。
   シーン：{ kind, area }。kind は title（タイトル・挑戦者を選ぶ画面）・trial（女王の試練）・field（旅のフィールド）・
   battle（雑魚）・boss（鬼王）・cooldown（帰り道）・summary（旅のまとめ）。area は景色（coast＝海岸・forest＝森・crater＝火口）で、field のときだけ使う。
   曲の ID は kind と同じ名前。景色で曲を変えるときは「field_coast」のように後ろに景色を付ける（まだ無い曲は、景色の付かない曲に、それも無ければ無音になる）。 */
(function (root) {
  const BASE = { title: 'title', trial: 'trial', field: 'field', battle: 'battle', boss: 'boss', cooldown: 'cooldown', summary: 'summary', race: 'race', raceEnd: 'raceEnd' };   // race：レース（カウントダウンは raceWait で無音）、raceEnd：レースの結果（variant が win・lose）
  const AREAS = ['coast', 'forest', 'crater'];

  const has = (have, id) => !!have && (have instanceof Set ? have.has(id) : Object.prototype.hasOwnProperty.call(have, id));

  // シーンに合う曲の ID（無ければ null＝曲を止める）。have：作ってある曲の ID の集まり（Set か、ID を鍵にしたオブジェクト）
  function songFor(scene, have) {
    if (!scene || !BASE[scene.kind]) return null;
    const base = BASE[scene.kind];
    const cands = scene.area && AREAS.includes(scene.area) ? [`${base}_${scene.area}`, base] : scene.variant ? [`${base}_${scene.variant}`, base] : [base];
    return cands.find(id => has(have, id)) || null;
  }

  // BGM の音量（0〜100）→ 音の大きさ（0〜1）。耳には2乗くらいがちょうどよい。ミュートなら 0
  const volumeGain = (v, mute) => (mute ? 0 : Math.pow(Math.max(0, Math.min(100, +v || 0)) / 100, 2));

  // 保存済みの音の設定を読み替える（2026-10-21：ミュートをやめ、BGM と効果音のオン・オフにした）。前にミュートしていた人は両方オフ。
  // 戦闘の曲の選択（battleTrack）は、騎兵戦に決めて設定から外したので捨てる（2026-10-21 ユーザー判断）
  function soundSettings(saved) {
    const s = { ...saved };
    if (s.bgmOn == null) s.bgmOn = !s.mute;
    if (s.sfxOn == null) s.sfxOn = !s.mute;
    delete s.mute;
    delete s.battleTrack;
    return s;
  }

  const api = { BASE, AREAS, songFor, volumeGain, soundSettings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).scenes = api;
})(typeof window !== 'undefined' ? window : globalThis);
