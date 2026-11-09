/* ゴーストの共有の本体（docs/impl-ghost-share.md）。Electron（main/share.js が包む）とブラウザ版（renderer/platform/web.js）で同じものを使う。
   サーバーは server/（Cloudflare Workers + D1）。URL は設定（空なら共有しない）。
     upload：走り終えたゴーストを上げる。返ってきた「消すための合言葉」は、この機械にだけ残す（store）。
     fetchGhosts：同じコースのゴーストを新しい順に取ってくる（自分が上げたものは除く）。つながらなければ []。
     revokeAll：自分が上げたものを全部、合言葉で消す。
     writeReport・ridesUpload・ridesFetch・ridesDelete：月のレポート（試作。renderer/game/monthly.js。server の POST /report・/rides）。失敗は null。
     writeStory：その日の旅の情報（renderer/game/storyfacts.js）から、Strava の説明文の「冒険記」を作ってもらう（試作。server の POST /story）。失敗は null。
   送るのは、決まった項目だけ（パワー・心拍・本当の位置は送らない）。fetch は差し替えられる（テスト用）。 */
(function (root) {
  const STORY_TIMEOUT_MS = 25000;
  const REPORT_TIMEOUT_MS = 100000;   // 月のレポートは長い手紙なので、さらに長く待つ（サーバー側は 90 秒で切る）   // 説明文は Claude が書くので、ゴーストより長く待つ（サーバー側は 20 秒で切る）
  const TIMEOUT_MS = 3000, KEEP_KEYS = 100, SEND_FIELDS = ['v', 'net', 'name', 'hero', 'course', 'side', 'sec', 'route', 'pts'];

  // サーバーの URL：https か、手元の開発用（http://localhost・127.0.0.1）だけ。それ以外は null
  function baseUrl(raw) {
    try {
      const u = new URL(String(raw || '').trim());
      const local = u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
      if (u.protocol !== 'https:' && !local) return null;
      return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
    } catch (_) { return null; }
  }

  // store：合言葉の置き場所 { load() → {}, save(o) }（Electron は userData のファイル、ブラウザは localStorage）
  function create({ store, fetch = globalThis.fetch } = {}) {
    const load = () => { try { return store.load() || {}; } catch (_) { return {}; } };
    const save = o => { try { store.save(o); } catch (_) { /* 書けなくても遊べる */ } };
    const call = (url, init = {}, ms = TIMEOUT_MS) => fetch(url, { ...init, signal: AbortSignal.timeout(ms) });

    // 上げる → { id } | null
    async function upload(rawUrl, ghost) {
      const base = baseUrl(rawUrl); if (!base || !ghost) return null;
      const body = {}; for (const k of SEND_FIELDS) body[k] = ghost[k];
      try {
        if (ghost.race) {   // レースの記録：古いサーバー（race を知らない）には上げない（ふつうのゴーストとして混ざってしまうので）
          body.race = { laps: ghost.race.laps, time: ghost.race.time };
          const h = await call(`${base}/health`); const hj = h.status === 200 ? await h.json() : null;
          if (!hj || !hj.races) return null;
        }
        const r = await call(`${base}/ghosts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        if (r.status !== 201) { let why = ''; try { why = JSON.stringify(await r.json()); } catch (_) { /* 読めなくてよい */ } console.warn('ゴーストを上げられなかった', r.status, why); return null; }
        const j = await r.json(); if (!j || !j.id || !j.key) return null;
        const all = load(), mine = all[base] || {};
        mine[j.id] = { key: j.key, at: Date.now() };
        const keep = Object.entries(mine).sort((a, b) => b[1].at - a[1].at).slice(0, KEEP_KEYS);   // 合言葉は新しい100個だけ覚える
        all[base] = Object.fromEntries(keep); save(all);
        return { id: j.id };
      } catch (_) { return null; }
    }

    // 取ってくる → [ゴースト]（形は server の GET /ghosts の ghosts。自分が上げたものは除く）。query：{ course, net, side?, limit? }
    async function fetchGhosts(rawUrl, { course, net, side, limit = 10 } = {}) {
      const base = baseUrl(rawUrl); if (!base || !course || !net) return [];
      const q = new URLSearchParams({ course, net, limit: String(limit) }); if (side) q.set('dir', side);
      try {
        const r = await call(`${base}/ghosts?${q}`);
        if (r.status !== 200) return [];
        const j = await r.json(), own = load()[base] || {};
        return (Array.isArray(j.ghosts) ? j.ghosts : []).filter(g => g && !own[g.id]).slice(0, 20);
      } catch (_) { return []; }
    }

    // レースの記録を、タイム（near）に近い順に取ってくる → [ゴースト（race つき）]。自分が上げたものは除く。query：{ course, net, laps, near, limit? }
    async function fetchRaces(rawUrl, { course, net, laps, near, limit = 12 } = {}) {
      const base = baseUrl(rawUrl); if (!base || !course || !net || !laps || !Number.isFinite(near)) return [];
      const q = new URLSearchParams({ course, net, laps: String(laps), near: String(Math.round(near)), limit: String(limit) });
      try {
        const r = await call(`${base}/races?${q}`);
        if (r.status !== 200) return [];
        const j = await r.json(), own = load()[base] || {};
        return (Array.isArray(j.ghosts) ? j.ghosts : []).filter(g => g && g.race && !own[g.id]).slice(0, 30);
      } catch (_) { return []; }
    }

    // 自分が上げたものを全部消す → { deleted, failed }
    async function revokeAll(rawUrl) {
      const base = baseUrl(rawUrl); if (!base) return { deleted: 0, failed: 0 };
      const all = load(), mine = all[base] || {}; let deleted = 0, failed = 0;
      for (const [id, { key }] of Object.entries(mine)) {
        try {
          const r = await call(`${base}/ghosts/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-delete-key': key } });
          if (r.status === 204 || r.status === 404) { deleted++; delete mine[id]; } else failed++;   // 404 は、もう無い（管理用の鍵で消された、など）
        } catch (_) { failed++; }
      }
      if (Object.keys(mine).length) all[base] = mine; else delete all[base];
      save(all);
      return { deleted, failed };
    }

    // 説明文の「冒険記」を作ってもらう → 文 | null（つながらない・失敗・形が違うときは null。呼んだ側は今の説明文のまま）
    async function writeStory(rawUrl, facts) {
      const base = baseUrl(rawUrl); if (!base || !facts || typeof facts !== 'object') return null;
      try {
        const r = await call(`${base}/story`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(facts) }, STORY_TIMEOUT_MS);
        if (r.status !== 200) return null;
        const j = await r.json();
        return j && typeof j.text === 'string' && j.text.trim() ? j.text.trim() : null;
      } catch (_) { return null; }
    }

    // 月のレポート（試作）：月のまとめ（monthly.js の reportFacts）→ 手紙 | { limit: true }（月に 50 回を超えた。サーバーの 429）| null（それ以外の失敗）
    async function writeReport(rawUrl, facts) {
      const base = baseUrl(rawUrl); if (!base || !facts || typeof facts !== 'object') return null;
      try {
        const r = await call(`${base}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(facts) }, REPORT_TIMEOUT_MS);
        if (r.status === 429) return { limit: true };
        if (r.status !== 200) return null;
        const j = await r.json();
        return j && typeof j.text === 'string' && j.text.trim() ? j.text.trim() : null;
      } catch (_) { return null; }
    }
    // 月のレポートの B（試作）：走りの数値をサーバーに残す・取り出す・全部消す。owner：持ち主の合言葉（ゲームが作る16進）
    const ownerOk = k => typeof k === 'string' && /^[0-9a-f]{32,64}$/.test(k);
    async function ridesUpload(rawUrl, owner, ride) {
      const base = baseUrl(rawUrl); if (!base || !ownerOk(owner) || !ride) return false;
      try { const r = await call(`${base}/rides`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-key': owner }, body: JSON.stringify(ride) }); return r.status === 201; } catch (_) { return false; }
    }
    async function ridesFetch(rawUrl, owner, from, to) {
      const base = baseUrl(rawUrl); if (!base || !ownerOk(owner)) return null;
      try {
        const r = await call(`${base}/rides?${new URLSearchParams({ from, to })}`, { headers: { 'x-owner-key': owner } });
        if (r.status !== 200) return null;
        const j = await r.json(); return Array.isArray(j.rides) ? j.rides : null;
      } catch (_) { return null; }
    }
    async function ridesDelete(rawUrl, owner) {
      const base = baseUrl(rawUrl); if (!base || !ownerOk(owner)) return null;
      try { const r = await call(`${base}/rides`, { method: 'DELETE', headers: { 'x-owner-key': owner } }); return r.status === 200 ? (await r.json()).deleted : null; } catch (_) { return null; }
    }

    return { upload, fetchGhosts, fetchRaces, revokeAll, writeStory, writeReport, ridesUpload, ridesFetch, ridesDelete, ownIds: rawUrl => { const b = baseUrl(rawUrl); return b ? Object.keys(load()[b] || {}) : []; } };
  }

  const api = { create, baseUrl, SEND_FIELDS, TIMEOUT_MS, STORY_TIMEOUT_MS, REPORT_TIMEOUT_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).shareCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
