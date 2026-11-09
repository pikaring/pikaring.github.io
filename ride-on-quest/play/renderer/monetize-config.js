/* ブラウザ版の広告とアフィリエイトの設定（1 か所。docs/monetize-browser.md・docs/impl-web.md §11・§12）。
   ここに置くのは公開の値だけ（Amazon のトラッキング ID・商品の URL・AdSense のパブリッシャー ID と広告ユニット ID）。
   アプリ版（Electron）には入らない（このフォルダ webonly/ は Electron の配るものに入れない。tools/build_web.js が本番のブラウザ版にだけ写す）。
   空のものは出さない：tag が空なら Amazon のリンクは 1 つも出ない、url が空の商品は出ない、slot が空なら AdSense の帯は出ない。
   2026-11-06 ユーザー判断 49：並べる商品はスマートトレーナー・心拍ベルト・トレーナー用のマット・扇風機。URL とタグはアソシエイトの承認後にユーザーが入れる。
   2026-11-06 ユーザー判断 48b：Amazon のリンクと開示の一文は日本語の画面だけ（英語の画面では出さない）。 */
(function (root) {
  const cfg = {
    // 本番は検索に出す（2026-11-07 ユーザー判断 29-3。前の 57b「ベータの間は出さない」の publicSearch はやめた。tools/build_web.js の prod）
    amazon: {
      tag: '',   // アソシエイトのトラッキング ID（例：xxxxx-22）。承認後に入れる
      // url：Amazon（amazon.co.jp）の商品のページの URL。tag はゲームが付ける（URL に入れなくてよい）
      items: [
        { id: 'trainer', name: 'スマートトレーナー', url: '' },
        { id: 'hr', name: '心拍ベルト', url: '' },
        { id: 'mat', name: 'トレーナー用のマット', url: '' },
        { id: 'fan', name: '扇風機', url: '' },
      ],
      heading: 'この島で使う道具（Amazon）',
      disclosure: 'Amazonのアソシエイトとして、Ride on Quest は適格販売により収入を得ています。',
    },
    // 有料版（広告なし。2026-11-07 ユーザー判断 28a）：itch.io でログインし、アプリ版（GAME_ID 5226429）を買っていれば広告を出さない（webonly/itch.js）。
    // clients：置き場所のページ（redirect_uri）ごとの OAuth アプリの client_id（公開の値。秘密ではない）。itch の https://itch.io/user/settings/oauth-apps で
    // ユーザーが登録して入れる（docs/monetize-browser.md「itch.io の OAuth アプリの登録」）。空のあいだは、ログインのボタンを出さない（みんな広告あり）
    itch: {
      gameId: 5226429,
      price: '$9.99',
      page: 'https://pikaring.itch.io/ride-on-quest',
      clients: {
        'https://ride-on-quest.pages.dev/renderer/index.html': '',
        'https://pikaring.github.io/ride-on-quest/play/renderer/index.html': '',
      },
    },
    // Google アナリティクス（GA4。2026-11-09 ユーザー判断 53a・54a）：ride-on-qc・作ったもの一覧と同じ測定 ID。本番のゲームの画面にだけ入る（webonly/ga.js）。空なら入れない
    analytics: { id: 'G-3FCFQY4W85' },
    adsense: {
      client: 'ca-pub-6156358253198578',   // パブリッシャー ID（2026-11-06 ユーザーからもらった）
      // 広告ユニット（ディスプレイ広告。2026-11-06 ユーザーが作った。51b：帯用と隅用の 2 つ）
      band: { slot: '5257458778', w: 728, h: 90 },     // 「RoQウォーミングアップ」：ゲームの画面の外の帯（本番はこれだけ。45a）
      corner: { slot: '1126642070', w: 300, h: 250 },  // 「RoQ隅」：お試し版の ?ad=corner の比べ用だけ。本番では使わない
      // スマホの帯（2026-11-08）：レスポンシブのディスプレイ広告ユニット 1 つを、縦 320×50・横 468×60（背が低い横は 320×50）の枠に入れて出す（webonly/adsize.js）。
      // ユーザーが AdSense の管理画面で作って slot を入れる（docs/monetize-browser.md「スマホの帯の広告ユニット」）。空のあいだは、スマホでは帯を出さない
      bandPhone: { slot: '6083293583' },   // 「rideonquest-mobile」（レスポンシブ。2026-11-08 ユーザーが作った）
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = cfg;
  else (root.RQ = root.RQ || {}).monetizeCfg = cfg;
})(typeof window !== 'undefined' ? window : globalThis);
