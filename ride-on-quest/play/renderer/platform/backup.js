/* 記録の書き出しと読み込み（2026-10-23 ユーザー要望：ブラウザ版でサイトのデータを消すと、進み具合が全部消えるため）。形をそろえるだけの純粋な関数（node のテストで確かめる）。
   1つのファイル（JSON。名前は ride-on-quest-記録-日時.json）に、次のものをまとめる：
     ls       ：localStorage の rq.* のすべて（設定・キャラのレベルとプランの進み・プレイヤーのレベルと経験値・FTP・週の記録・旅の記録・
                物語の進みとくり返さない記録 rq.talkLog・レースの記録 など。キーごとの文字列のまま）
     ghosts   ：自分のゴースト（アプリ版は「書類/Ride on Quest/ghosts」、ブラウザ版は IndexedDB。新しい30個）
     shareKeys：ゴーストの共有の合言葉（アプリ版は userData の share-keys.json、ブラウザ版は localStorage の rq.shareKeys）
   アプリ版とブラウザ版で同じ形なので、どちらからどちらへも移せる。形や版が違うファイルは読み込まない（parse が Error を投げる）。
   置き場所とのやり取り（集める・戻す・保存の窓）は RQ.platform の backupGet・backupSet・saveBackup（electron.js・web.js）。 */
(function (root) {
  const FORMAT = 'ride-on-quest-backup', V = 1;
  const PREFIX = 'rq.', SHARE_LS = 'rq.shareKeys';
  const MAX_BYTES = 30 * 1024 * 1024;   // これより大きいファイルは読まない（ゴースト30個でも 1 MB ほど）

  const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  const goodGhost = g => isObj(g) && g.v === 1 && Array.isArray(g.pts) && Array.isArray(g.route);

  // localStorage（または同じ形のもの：length・key(i)・getItem(k)）から rq.* を集める。合言葉は別に持つので除く。
  // 走っている途中の控え（rq.resume*。renderer/game/resume.js）も除く（大きく、ほかの機械で続きを走るものではない）
  function collectLs(storage) {
    const out = {};
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX) && k !== SHARE_LS && !k.startsWith('rq.resume')) out[k] = storage.getItem(k);
    }
    return out;
  }

  // 書き出す中身。from：'electron' | 'web'（どちらで作ったか。読み込みには使わない）
  function build({ ls = {}, ghosts = [], shareKeys = null, from = '', now = new Date() } = {}) {
    return { format: FORMAT, v: V, created: now.toISOString(), from, data: { ls, ghosts: ghosts.filter(goodGhost).map(({ key, ...g }) => g), shareKeys: isObj(shareKeys) ? shareKeys : null } };
  }
  const toText = o => JSON.stringify(o);

  // ファイルの文字を読む。違う形・版なら、遊ぶ人に見せる理由つきの Error
  function parse(text) {
    if (typeof text !== 'string' || !text.length) throw new Error('ファイルが空です');
    if (text.length > MAX_BYTES) throw new Error('ファイルが大きすぎます');
    let o;
    try { o = JSON.parse(text); } catch (_) { throw new Error('Ride on Quest の記録のファイルではありません'); }
    if (!isObj(o) || o.format !== FORMAT) throw new Error('Ride on Quest の記録のファイルではありません');
    if (o.v !== V) throw new Error(`記録の版が違います（ファイル：${o.v}、このゲーム：${V}）`);
    const d = o.data;
    if (!isObj(d) || !isObj(d.ls) || !Array.isArray(d.ghosts)) throw new Error('記録のファイルが壊れています');
    const ls = {};
    for (const [k, v] of Object.entries(d.ls)) {
      if (!k.startsWith(PREFIX) || typeof v !== 'string') throw new Error('記録のファイルが壊れています');
      if (k !== SHARE_LS) ls[k] = v;
    }
    return { ls, ghosts: d.ghosts.filter(goodGhost), shareKeys: isObj(d.shareKeys) ? d.shareKeys : null, created: o.created || '', from: o.from || '' };
  }

  // localStorage の rq.* を、読み込んだものに入れ替える（合言葉は除く。置き場所が違うので backupSet が戻す）
  function restoreLs(storage, ls) {
    const old = [];
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(PREFIX) && k !== SHARE_LS) old.push(k); }
    old.forEach(k => storage.removeItem(k));
    for (const [k, v] of Object.entries(ls)) storage.setItem(k, v);
  }

  // ファイルの名前（英数字と日時。ブラウザによっては日本語の名前がダウンロードの名前にならないため）
  const fileName = (now = new Date()) => { const z = n => String(n).padStart(2, '0'); return `ride-on-quest-save-${now.getFullYear()}${z(now.getMonth() + 1)}${z(now.getDate())}-${z(now.getHours())}${z(now.getMinutes())}.json`; };

  // 見せる短い説明（読み込む前の確かめに使う）
  function summary(p) {
    let s = {}; try { s = JSON.parse(p.ls['rq.settings'] || '{}') || {}; } catch (_) {}
    const runs = (() => { try { return (JSON.parse(p.ls['rq.records'] || '[]') || []).length; } catch (_) { return 0; } })();
    return { created: p.created, name: s.playerName || '', runs, ghosts: p.ghosts.length };
  }

  const api = { FORMAT, V, PREFIX, SHARE_LS, collectLs, build, toText, parse, restoreLs, fileName, summary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).backup = api;
})(typeof window !== 'undefined' ? window : globalThis);
