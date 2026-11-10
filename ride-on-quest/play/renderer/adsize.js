/* ウォームアップの AdSense の帯の大きさと置き方（ブラウザ版の本番と、広告の試し adtest の両方が使う。docs/impl-web.md §11・§12・docs/monetize-browser.md）。
   2026-11-08 窓口（ユーザー「次のiPhone版の試走では広告が入ったらどんな感じか見てみたい」）：帯の 728×90 は iPhone の縦（390 幅）にも横にも入らないので、
   画面の大きさで AdSense の決まった大きさから選ぶ：
     パソコン・タブレット（下の 2 つ以外）  → 728×90（リーダーボード）を、ゲームの画面の外の下に。広告ユニット band
     スマホの縦（幅 600px 以下）            → 320×50（モバイル バナー）を、ゲームの画面の外の下に。広告ユニット bandPhone
     スマホの横（高さ 500px 以下）          → 120×240（縦長のバナー）を、ゲームの画面の外の右に。広告ユニット bandPhone
       横で下に帯を足すと、ゲームの画面が低くなりすぎる（Bluefy の横 844×300 で 159px になり、走行データが画面からはみ出した）。横は幅に余裕があるので右に置く（2026-11-08 ユーザー判断 43a：右の列のまま）
   スマホの 2 つの大きさは、レスポンシブの広告ユニット 1 つ（bandPhone）を、この大きさの枠に入れて出す（ins の幅と高さを決めて出す）。
   phone.css と同じ境目（幅 600px 以下か、高さ 500px 以下）。bandSize は純粋な関数なので node のテストで確かめる（tests/monetize.test.js）。 */
(function (root) {
  const PAD = 4;   // 帯の余白（px）
  // ゲームの画面と広告の間の空き（px。帯の外の何もない黒）。押す所のすぐ隣に広告を置かない（AdSense の誤クリックの決まり。2026-11-10 窓口）。
  // 30px あけると、広告から押せる物まで：スマホの横の地図（タップで U ターン）46px〜・縦のスライダー（つながずに試す）41px・ボタンは 140px 以上
  const GAP = 30;
  function bandSize(vw, vh) {
    if (vw <= 600) return { w: 320, h: 50, unit: 'bandPhone', side: false };
    if (vh <= 500) return { w: 120, h: 240, unit: 'bandPhone', side: true };
    return { w: 728, h: 90, unit: 'band', side: false };
  }
  // 帯の箱（body の最後に入れた div）を置く。下：body の縦の flex の最後（ゲームの画面がその分縮む）。
  // 右：上の帯（#bar）の下から画面の下までの列にし、ゲームの画面・案内・スライダーの帯の右をその分あける
  function place(doc, box, size, show) {
    const side = !!size.side, W = size.w + PAD * 2, s = box.style;
    if (side) {
      const bar = doc.getElementById('bar');
      s.position = 'fixed'; s.right = '0'; s.bottom = '0'; s.top = `${bar ? Math.round(bar.getBoundingClientRect().bottom) : 0}px`;
      s.width = `${W}px`; s.height = 'auto'; s.borderTop = '0'; s.borderLeft = '1px solid #333'; s.marginTop = '';
    } else {
      s.position = s.right = s.bottom = s.top = s.width = s.borderTop = s.borderLeft = '';
      s.height = `${size.h + PAD * 2}px`; s.marginTop = `${GAP}px`;
    }
    for (const el of [doc.getElementById('stage'), doc.getElementById('web-note'), doc.querySelector('.sim')]) if (el) el.style.marginRight = show && side ? `${W + 1 + GAP}px` : '';
    doc.documentElement.classList.toggle('ad-side', show && side);   // スライダーの帯を 1 段のまま細く（monetize.css・adtest.css）
  }
  // 帯を出す画面：旅のウォームアップ（フィールドの .field[data-phase="warmup"]）と、女王の試練の間ずっと（.trial。2026-11-10 ユーザー判断 84B
  // 「むしろ画面に余裕があるので常時出していてもいいが、他のアプリに切り替わった時にフリーズされるのは困る。」）
  const SHOW = '#screen .field[data-phase="warmup"], #screen .trial';
  const showing = doc => !!doc.querySelector(SHOW);
  const api = { bandSize, place, showing, SHOW, PAD, GAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).adSize = api;
})(typeof window !== 'undefined' ? window : globalThis);
