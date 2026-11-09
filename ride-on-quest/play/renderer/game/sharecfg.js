/* ゴースト共有の設定の既定値（docs/impl-ghost-share.md）。2026-10-21 ユーザー判断：「最初から入れる」。
   サーバーは server/（Cloudflare Workers + D1。ユーザーがデプロイしたもの）。設定で URL を空にすれば共有しない、
   自動で上げるのを止められる、は今のまま。
   既に保存された設定（共有を入れる前から遊んでいる人、設定を開いて空のまま保存された人）にも、最初の起動で1回だけ既定値を入れる
   （shareDefaultApplied。そのあとで自分で空にしたものは、そのまま空） */
(function (root) {
  const DEFAULT_URL = 'https://ride-on-quest-ghosts.pikaring-0e1.workers.dev';

  // settings を直す。直したら true（呼ぶ側が保存する）
  function migrate(settings) {
    if (settings.shareDefaultApplied) return false;
    if (!settings.shareUrl) settings.shareUrl = DEFAULT_URL;
    if (settings.shareAuto == null) settings.shareAuto = true;
    settings.shareDefaultApplied = true;
    return true;
  }

  const api = { DEFAULT_URL, migrate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).shareCfg = api;
})(typeof window !== 'undefined' ? window : globalThis);
