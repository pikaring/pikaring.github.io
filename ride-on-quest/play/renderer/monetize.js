/* ブラウザ版（本番）の広告とアフィリエイト。tools/build_web.js --prod の版にだけ入る（Electron・試す人の版 tester-…・手元の web:serve には入らない）。
   docs/monetize-browser.md の決まり（2026-11-06 ユーザー判断）：
   - Amazon アソシエイト（39a）：まとめの画面に文字のリンクだけ（価格・商品の絵は出さない）。すぐそばに開示の一文。重ねる・ポップアップにしない（参加要件 第5条(o)）。
     日本語の画面だけ（48b）。設定の tag が空、または url の入った商品が無ければ、何も出さない。まとめの画像（snapshot）には入れない（data-noshot）。
   - AdSense（44a・45a・46a）：旅のウォームアップの間だけ、ゲームの画面（#stage）の外の下に帯を足し、ゲームの画面をその分縮める。
     帯の大きさと置き方は画面で選ぶ（webonly/adsize.js：パソコン・タブレット 728×90 を下、スマホの縦 320×50 を下、横 120×240 を右。2026-11-08）。
     スマホの大きさは広告ユニット bandPhone（レスポンシブ）を使い、その slot が空なら、スマホでは帯を出さない（728×90 は入らないため）。
     戦闘・クールダウン・女王の試練（ウォームアップも）・まとめでは出さない。広告は別のページ（adframe.html）に入れて iframe で出す（ゲームの CSP は 'self' のまま＋frame-src 'self'）。
     slot が空なら出さない。広告が来なかった（no fill）・読めなかったときは帯を畳む（その回はもう出さない）。
   - 有料版（2026-11-07 ユーザー判断 28a）：itch.io でログインしてアプリ版を買った人（webonly/itch.js の adFree）には、帯の iframe を作らず（最初から読まない）、Amazon のリンクも出さない。
   純粋な部分（amazonLinks・adframeSrc）は node のテストで確かめる（tests/monetize.test.js）。 */
(function (root) {
  // Amazon の商品の URL に tag を付けた、出すリンクの一覧（出さないときは []）
  function amazonLinks(cfg, lang) {
    const a = cfg && cfg.amazon;
    if (lang !== 'ja' || !a || !String(a.tag || '').trim()) return [];
    const tag = String(a.tag).trim();
    return (a.items || []).map(it => {
      let u; try { u = new URL(String(it.url || '').trim()); } catch (_) { return null; }
      if (u.protocol !== 'https:' || !/(^|\.)amazon\.co\.jp$/.test(u.hostname)) return null;   // amazon.co.jp のアソシエイトなので、co.jp の URL だけ
      u.searchParams.set('tag', tag);
      return { id: it.id, text: it.name, href: u.toString() };
    }).filter(Boolean);
  }
  // 帯の iframe の URL（出さないときは null）。size：webonly/adsize.js の bandSize（無ければパソコンの 728×90）
  function adframeSrc(cfg, base = '../adframe.html', size = { w: 728, h: 90, unit: 'band' }) {
    const s = cfg && cfg.adsense, b = s && s[size.unit];   // 本番は帯の広告ユニットだけ（隅の corner は使わない。45a）。スマホは bandPhone
    if (!s || !b || !/^ca-pub-\d{10,20}$/.test(String(s.client || '')) || !/^\d{6,20}$/.test(String(b.slot || ''))) return null;
    // r=1：レスポンシブの広告ユニット（bandPhone）。adframe.html が ins を display:block で、決めた大きさにして出す（data-ad-format・data-full-width-responsive は付けない）
    return base + '?' + new URLSearchParams({ client: s.client, slot: b.slot, w: size.w, h: size.h, ...(size.unit === 'bandPhone' ? { r: '1' } : {}) }).toString();
  }
  const api = { amazonLinks, adframeSrc };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  const RQ = root.RQ, doc = root.document, cfg = RQ.monetizeCfg;
  // 買った人（itch.io でログインして、アプリ版を買っている。webonly/itch.js）には、広告もアフィリエイトも出さない（2026-11-07 ユーザー判断 28a）
  const paid = () => !!(RQ.itchAuth && RQ.itchAuth.adFree && RQ.itchAuth.adFree());
  const on = () => !!(RQ.platform && RQ.platform.monetize) && !paid();

  // まとめの画面の下に、Amazon のリンクと開示の一文（summary-view.js が呼ぶ）
  api.fillAmazon = el => {
    if (!el || !on()) return;
    const links = amazonLinks(cfg, RQ.i18n.lang);
    if (!links.length) return;
    el.textContent = '';
    el.dataset.noshot = '';
    const h = doc.createElement('div'); h.className = 'affil-head'; h.textContent = cfg.amazon.heading; el.appendChild(h);
    const ul = doc.createElement('div'); ul.className = 'affil-links';
    for (const l of links) { const a = doc.createElement('a'); a.href = l.href; a.textContent = l.text; a.target = '_blank'; a.rel = 'sponsored noopener'; ul.appendChild(a); }
    el.appendChild(ul);
    const p = doc.createElement('div'); p.className = 'affil-note'; p.textContent = cfg.amazon.disclosure; el.appendChild(p);
    el.hidden = false;
  };

  // ウォームアップの間だけの AdSense の帯（大きさはウォームアップが始まるときの画面で選ぶ。向きを変えて大きさが変わったら作り直す）
  const sizeNow = () => RQ.adSize.bandSize(root.innerWidth, root.innerHeight);
  if (adframeSrc(cfg) || adframeSrc(cfg, undefined, { w: 320, h: 50, unit: 'bandPhone' })) {
    let band = null, bandKey = '', bandSz = null, warm = false, empty = false;
    // 広告が来なかった（no fill）・読めなかった（広告ブロックなど）ときは、帯を畳んで黒い帯を残さない（adframe.html が知らせる）
    root.addEventListener('message', e => {
      if (e.origin !== root.location.origin || !e.data || !/^(unfilled|blocked)$/.test(e.data.adStatus || '')) return;
      empty = true;
      if (band && !band.hidden) { band.hidden = true; RQ.adSize.place(doc, band, bandSz, false); root.dispatchEvent(new Event('resize')); }
    });
    root.setInterval(() => {
      const sz = sizeNow(), src = adframeSrc(cfg, undefined, sz), key = src ? `${sz.w}x${sz.h}` : '';
      const now = on() && !empty && !!src && !!doc.querySelector('#screen .field[data-phase="warmup"]');
      if (now === warm && (!now || key === bandKey)) return;
      warm = now;
      if (now && band && key !== bandKey) { band.remove(); band = null; }   // 向きを変えて大きさが変わった
      if (now && !band) {
        band = doc.createElement('div'); band.className = 'ad-band'; bandKey = key; bandSz = sz;
        const f = doc.createElement('iframe'); f.src = src; f.width = sz.w; f.height = sz.h; f.title = 'ad'; f.setAttribute('scrolling', 'no'); f.style.border = '0';
        band.appendChild(f); doc.body.appendChild(band);   // body は縦の flex。#stage の下に入り、ゲームの画面がその分だけ縮む
      }
      if (band) { band.hidden = !now; RQ.adSize.place(doc, band, bandSz, now); }
      root.dispatchEvent(new Event('resize'));   // 3D の描く大きさを合わせ直す
    }, 500);
  }
  RQ.monetize = api;
})(typeof window !== 'undefined' ? window : globalThis);
