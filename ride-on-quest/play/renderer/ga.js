/* Google アナリティクス（GA4）の設定。本番のブラウザ版のゲームの画面（renderer/index.html）にだけ、tools/build_web.js --prod が入れる。
   2026-11-09 ユーザー「ブラウザ版にアナリティクスのコードを貼ることは可能？」「ride-on-qcや作ったもの一覧には全部入ってる？　なら同様に同じコードで入れる。５４A」
   （判断 53a：測定 ID は ride-on-qc・作ったもの一覧と同じ。54a：紹介ページとゲームの画面の両方）。
   ゲームの CSP では書き込みの script が動かないので、Google の案内のコード（dataLayer と gtag('config')）を、この同じ置き場所のファイルに置く。
   測定 ID は <script src="ga.js" data-id="G-…"> の data-id（webonly/monetize-config.js の analytics.id から build_web.js が入れる）。
   送るのは、GA4 がふつうに集めるもの（ページの表示など）だけ。ゲームの中の数（パワー・心拍・回転数・走った記録）は送らない（gtag('event') を呼ばない）。
   itch.io で買って広告なしの人にも入れる（広告とは別。窓口）。アプリ版（Electron）・試す人の版・広告の試しの版には入らない。 */
(function (root) {
  const s = root.document && root.document.currentScript, id = s && s.dataset && s.dataset.id;
  if (!id || !/^G-[A-Z0-9]{4,20}$/.test(id)) return;
  root.dataLayer = root.dataLayer || [];
  function gtag() { root.dataLayer.push(arguments); }
  root.gtag = gtag;
  gtag('js', new Date());
  gtag('config', id);
})(window);
