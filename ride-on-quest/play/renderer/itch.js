/* ブラウザ版（本番）の「itch.io でログイン」（2026-11-07 ユーザー判断 28a。docs/monetize-browser.md「有料版（広告なし）」）。
   ユーザー「Cloudflareではできない？　無料版は広告を出す。有料版は出ない。アプリ版と同じ値段で同じ仕組み。」
   「「ブラウザ版は無料で広告あり、$9.99 を買えば広告なし」に変える。Itchでログインの仕組みが動けばそれで」
   - itch.io の OAuth（認可コード＋PKCE。client secret は無い。https://itch.io/docs/api/oauth）。scope は game:view:ownership と profile:me。
     redirect_uri はこのページ（renderer/index.html）。置き場所ごとに itch に OAuth アプリを登録し、client_id を monetize-config.js の itch.clients に入れる（公開の値）。
   - トークンの受け取り（POST https://api.itch.io/oauth/token）はページから直接（itch は登録した redirect の置き場所からの fetch を許す）。
   - 買ったかは、ゴースト共有サーバー（server/ の POST /itch/owns）が itch の GET /games/5226429/ownership に問い合わせて返す
     （api.itch.io の CORS は文書に書かれていないので、ページから直接は呼ばない）。
   - 買っていれば adFree() が true になり、monetize.js は AdSense の帯を作らず、Amazon のリンクも出さない。
     ログインしていない・買っていない・itch やサーバーに届かない・確かめている最中は、広告あり（守りすぎない：書き換えれば外せるのは承知の上。広告を消すだけ）。
   - トークンは localStorage（rq.itch）。ログアウトで消し、itch にも取り消しを頼む。
   純粋な部分（authorizeUrl・clientFor・parseCallback・ownsFromReply）は node のテストで確かめる（tests/itch.test.js）。 */
(function (root) {
  const SCOPE = 'game:view:ownership profile:me';
  const AUTH = 'https://itch.io/user/oauth', TOKEN = 'https://api.itch.io/oauth/token', REVOKE = 'https://api.itch.io/oauth/revoke';
  // このページの redirect_uri（? と # を外したもの）に合う client_id（無ければ null＝ログインを出さない）
  function clientFor(cfg, redirect) {
    const c = cfg && cfg.itch && cfg.itch.clients;
    const id = c && c[redirect];
    return id && /^[\w-]{4,128}$/.test(String(id).trim()) ? String(id).trim() : null;
  }
  function authorizeUrl(clientId, redirect, challenge, state) {
    return AUTH + '?' + new URLSearchParams({ client_id: clientId, scope: SCOPE, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state }).toString();
  }
  // itch から戻ってきたときの ?code=…&state=…（エラーなら error）。無ければ null
  function parseCallback(search) {
    const q = new URLSearchParams(search || '');
    if (q.get('error')) return { error: q.get('error') };
    const code = q.get('code'), state = q.get('state');
    return code && state ? { code, state } : null;
  }
  // サーバーの返事 → 買ったか（true だけが広告なし。ほかは全部 false）
  const ownsFromReply = j => !!(j && j.owns === true);
  const api = { SCOPE, clientFor, authorizeUrl, parseCallback, ownsFromReply };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  const RQ = root.RQ, doc = root.document, cfg = RQ.monetizeCfg || {}, KEY = 'rq.itch', PK = 'rq.itchPkce';
  const t = (k, v) => RQ.i18n.t(k, v);
  const redirect = root.location.origin + root.location.pathname;
  const clientId = clientFor(cfg, redirect);
  const load = () => { try { return JSON.parse(root.localStorage.getItem(KEY)) || null; } catch (_) { return null; } };
  const save = v => { try { if (v) root.localStorage.setItem(KEY, JSON.stringify(v)); else root.localStorage.removeItem(KEY); } catch (_) {} };
  // st：{ phase: 'out' | 'checking' | 'owner' | 'notOwner' | 'error', user }。owner のときだけ広告なし
  const st = { phase: 'out', user: '' };
  api.adFree = () => st.phase === 'owner';

  const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function login() {
    const v = new Uint8Array(32); root.crypto.getRandomValues(v);
    const verifier = b64url(v), s = new Uint8Array(16); root.crypto.getRandomValues(s);
    const state = b64url(s), challenge = b64url(new Uint8Array(await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    try { root.sessionStorage.setItem(PK, JSON.stringify({ verifier, state })); } catch (_) {}
    root.location.href = authorizeUrl(clientId, redirect, challenge, state);
  }
  async function logout() {
    const s = load(); save(null); st.phase = 'out'; st.user = ''; draw();
    if (s && s.token) root.fetch(REVOKE, { method: 'POST', body: new URLSearchParams({ token: s.token, client_id: clientId }) }).catch(() => {});   // 取り消しは届かなくてもよい
  }
  // サーバーに、買ったかを聞く（共有サーバーの URL。設定の「サーバーの URL」と同じもの）
  const server = () => { try { const s = JSON.parse(root.localStorage.getItem('rq.settings') || '{}'); return (s.shareUrl || RQ.shareCfg.DEFAULT_URL || '').replace(/\/+$/, ''); } catch (_) { return RQ.shareCfg.DEFAULT_URL; } };
  async function check() {
    const s = load(); if (!s || !s.token) { st.phase = 'out'; draw(); return; }
    st.phase = 'checking'; st.user = s.user || ''; draw();
    try {
      const r = await root.fetch(server() + '/itch/owns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: s.token }) });
      const j = await r.json().catch(() => null);
      if (r.status === 401) { save(null); st.phase = 'out'; st.user = ''; draw(); return; }   // トークンが取り消された
      if (!r.ok) throw new Error((j && j.message) || r.status);
      if (j && j.user) { st.user = j.user; save({ ...s, user: j.user }); }
      st.phase = ownsFromReply(j) ? 'owner' : 'notOwner';
    } catch (e) { console.warn('itch の購入を確かめられなかった', e); st.phase = 'error'; }
    draw();
  }
  // itch から戻ってきた：コードをトークンに替え、URL から ?code を消す
  async function finishLogin(cb) {
    root.history.replaceState(null, '', redirect + root.location.hash);
    let pk = null; try { pk = JSON.parse(root.sessionStorage.getItem(PK)); root.sessionStorage.removeItem(PK); } catch (_) {}
    if (cb.error || !pk || pk.state !== cb.state) { st.phase = 'error'; draw(); return; }
    try {
      const r = await root.fetch(TOKEN, { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code: cb.code, code_verifier: pk.verifier, redirect_uri: redirect, client_id: clientId }) });
      const j = await r.json();
      if (!j || !j.access_token) throw new Error('no token');
      save({ token: j.access_token });
    } catch (e) { console.warn('itch のログインに失敗', e); st.phase = 'error'; draw(); return; }
    await check();
    const set = doc.querySelector('#settings'); if (set) set.hidden = false;   // 結果が見えるように、設定の窓を開く
  }

  // 設定の窓の「itch.io でログイン」
  let box = null;
  function draw() {
    if (!box) return;
    const msg = box.querySelector('.itch-msg'), inB = box.querySelector('.itch-in'), outB = box.querySelector('.itch-out'), buy = box.querySelector('.itch-buy');
    const p = st.phase, logged = p !== 'out';
    msg.textContent = p === 'out' ? t('itch.out', { price: cfg.itch.price }) : p === 'checking' ? t('itch.checking', { user: st.user })
      : p === 'owner' ? t('itch.owner', { user: st.user }) : p === 'notOwner' ? t('itch.notOwner', { user: st.user, price: cfg.itch.price }) : t('itch.error');
    inB.hidden = logged; outB.hidden = !logged;
    buy.hidden = p === 'owner'; buy.textContent = t('itch.buy', { price: cfg.itch.price });
  }
  function mount() {
    const set = doc.querySelector('#settings .box'); if (!set || !clientId) return;
    box = doc.createElement('div'); box.className = 'itch-box';
    const h = doc.createElement('h2'); h.textContent = t('itch.title'); box.appendChild(h);
    const m = doc.createElement('p'); m.className = 'hint itch-msg'; box.appendChild(m);
    const inB = doc.createElement('button'); inB.className = 'itch-in'; inB.textContent = t('itch.login'); inB.onclick = () => login(); box.appendChild(inB);
    const outB = doc.createElement('button'); outB.className = 'itch-out'; outB.textContent = t('itch.logout'); outB.onclick = () => logout(); box.appendChild(outB);
    const buy = doc.createElement('a'); buy.className = 'itch-buy'; buy.href = cfg.itch.page; buy.target = '_blank'; buy.rel = 'noopener'; box.appendChild(buy);
    set.insertBefore(box, set.querySelector('h2') ? set.querySelector('h2').nextSibling : set.firstChild);
    draw();
  }
  if (clientId && root.crypto && root.crypto.subtle) {
    const cb = parseCallback(root.location.search);
    const go = () => { mount(); if (cb) finishLogin(cb); else check(); };
    if (doc.readyState === 'loading') root.addEventListener('DOMContentLoaded', go); else go();
  }
  api.state = st;
  RQ.itchAuth = api;
})(typeof window !== 'undefined' ? window : globalThis);
