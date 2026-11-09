/* 言語（2026-10-23 ユーザー判断：日本語と英語。docs/i18n-plan.md）。画面に触らない部分は node のテストで確かめる。
   - 文字の表は言語ごと：renderer/i18n/ja.js・en.js が RQ.i18n.add(言語, { キー: 文 }) で入れる。あとから言語を足すときは表を1つ足すだけ。
   - t('キー', { 名前: 値 }) で引く。文の中の {名前} を差し込む（語順は言語ごとに文の側で決める。文を切り貼りしない）。
     今の言語の表に無ければ日本語、日本語にも無ければキーそのもの（訳しそこねても画面は空にならない）。
   - HTML：data-i18n="キー"（中の文字）・data-i18n-ph="キー"（placeholder）・data-i18n-title="キー"。HTML には日本語をそのまま書いておき、
     日本語以外のときだけ apply(要素) が表の文に入れ替える。
   - 言語は localStorage の rq.lang（記録の書き出しにも入る）。最初の起動で1回だけ選ぶ（app.js の言語の窓。既定は OS の言語）。 */
(function (root) {
  const LANGS = [{ id: 'ja', n: '日本語' }, { id: 'en', n: 'English' }];
  const KEY = 'rq.lang';
  const tables = { ja: {}, en: {} };
  let lang = 'ja';

  const add = (l, obj) => { Object.assign(tables[l] || (tables[l] = {}), obj); };
  // 名前（地名・道・コース・職業・敵・NPC・装備・必殺技など）：日本語の名前 → その言語の名前（docs/i18n-names.md）。データの ID は日本語のまま、表示だけをここから引く
  // 日本語の表示名（道の名前を変えたとき。道の名前は ID＝道の網の版・ゴーストの記録・サーバーが名前で道を引くので、ID は変えず、画面に出す名前だけ変える）
  // 学校坂 → 胸突き坂（2026-10-25 ユーザー判断：北風泊から給水塔の辻への平均10%の激坂で、学校の名前は合わない）
  // ヒョウタン岩の下り → ヒョウタン岩の坂（2026-10-26 ユーザー判断：登っても「下り」と出るため。ID は変えない）
  // トリカラスノ浜道 → 南の浜道（2026-10-28 試走の指摘 11：トリカラスノ浜（町の北の浜）と、町の南へ延びるこの道で、町の両側が同じ名前になっていた。ID は変えない）
  // パーキング道 → 三つ橋の坂（2026-10-29 試走の指摘 20：地名としておかしい。湯の川を板の橋で 3 回わたる。ID は変えない）
  const names = { ja: { '学校坂': '胸突き坂', 'ヒョウタン岩の下り': 'ヒョウタン岩の坂', 'トリカラスノ浜道': '南の浜道', 'パーキング道': '三つ橋の坂' } }, descs = { ja: {} };
  const addNames = (l, obj) => { Object.assign(names[l] || (names[l] = {}), obj); };
  const addDesc = (l, obj) => { const d = descs[l] || (descs[l] = {}); for (const [k, v] of Object.entries(obj)) d[k] = Object.assign(d[k] || {}, v); };
  const n = ja => (ja != null && names[lang] && names[lang][ja] != null ? names[lang][ja] : ja);
  // 分かれ道の名前の表示（矢印・コースの出発点）。町の南の入口の分かれ道（ID は トリカラスノ浜）は、町の中なので「城下町」と出す（2026-10-24 ユーザー判断。北の浜の地名 トリカラスノ浜 とは別の所）
  const NODE_LABEL = { 'トリカラスノ浜': '城下町' };
  const node = id => n(NODE_LABEL[id] || id);
  const desc = (kind, id, ja) => (descs[lang] && descs[lang][kind] && descs[lang][kind][id] != null ? descs[lang][kind][id] : ja);
  // 英語：差し込んだ名前が「the 〜」のとき、文の頭（文が {名前} で始まるとき）なら大文字に、「The the」は1つに。
  // 文そのものが小文字の the で始まるもの（「the {foe}」のような文の切れはし）は、そのまま
  const tidy = (s, head) => (lang === 'en' ? (head ? s.replace(/^the\b/, 'The') : s).replace(/\b([Tt])he the\b/g, '$1he') : s);
  // 数で単数・複数が変わる語：{n|lap|laps} → 「1 lap」「5 laps」（数と語。英語の表で使う。2026-10-23）
  const plural = (s, vars) => s.replace(/\{(\w+)\|([^|{}]*)\|([^|{}]*)\}/g, (m, k, one, many) => (vars[k] != null ? `${vars[k]} ${Number(vars[k]) === 1 ? one : many}` : m));
  const fill = (s, vars) => (vars ? tidy(plural(String(s), vars).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)), /^\{/.test(String(s))) : String(s));
  // 名前を1つだけ出すとき（話す人の名前の欄など）：英語の「the Queen of the Isle」の頭を大文字に
  const cap = s => (lang === 'en' && typeof s === 'string' ? s.replace(/^the\b/, 'The') : s);
  function t(key, vars) {
    const s = tables[lang] && tables[lang][key] != null ? tables[lang][key] : tables.ja[key] != null ? tables.ja[key] : key;
    return fill(s, vars);
  }
  // 順位（英語は 1st・2nd・3rd・11th…。日本語は表の race.place＝「{n}位」）
  const ordinal = n => lang === 'en' ? `${n}${(n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}` : t('race.place', { n });
  const has = (key, l = lang) => !!(tables[l] && tables[l][key] != null);
  // 選ばれている言語（保存したものが無ければ null＝まだ選んでいない）
  const saved = storage => { try { const v = storage.getItem(KEY); return LANGS.some(x => x.id === v) ? v : null; } catch (_) { return null; } };
  // OS（ブラウザ）の言語から、最初の窓で選んでおく方
  const guess = (nav = root.navigator) => (/^ja\b/i.test((nav && (nav.language || (nav.languages || [])[0])) || '') ? 'ja' : 'en');
  function set(l) { if (LANGS.some(x => x.id === l)) lang = l; return lang; }
  function save(storage, l) { set(l); try { storage.setItem(KEY, lang); } catch (_) {} }

  // HTML の data-i18n を今の言語に。日本語のときは、最初に書いてある日本語に戻す
  function apply(el) {
    if (!el || !el.querySelectorAll) return;
    const each = (attr, fn) => el.querySelectorAll(`[${attr}]`).forEach(n => fn(n, n.getAttribute(attr)));
    each('data-i18n', (n, k) => { if (n.dataset.ja == null) n.dataset.ja = n.textContent; n.textContent = lang === 'ja' || !has(k) ? n.dataset.ja : t(k); });
    each('data-i18n-ph', (n, k) => { if (n.dataset.jaPh == null) n.dataset.jaPh = n.getAttribute('placeholder') || ''; n.setAttribute('placeholder', lang === 'ja' || !has(k) ? n.dataset.jaPh : t(k)); });
    each('data-i18n-title', (n, k) => { if (n.dataset.jaTitle == null) n.dataset.jaTitle = n.getAttribute('title') || ''; n.setAttribute('title', lang === 'ja' || !has(k) ? n.dataset.jaTitle : t(k)); });
    if (el.documentElement) el.documentElement.lang = lang;
  }
  // テスト用：表にあるキーの一覧と、ja にあって ほかの言語に無いキー
  const keys = l => Object.keys(tables[l] || {});
  const missing = l => keys('ja').filter(k => !has(k, l));

  const api = { LANGS, KEY, add, addNames, addDesc, n, node, desc, cap, t, ordinal, has, saved, guess, set, save, apply, keys, missing, get lang() { return lang; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    (root.RQ = root.RQ || {}).i18n = api;
    try { set(saved(root.localStorage) || guess()); } catch (_) {}   // ほかの画面の部品が読まれる前に、言語を決めておく
  }
})(typeof window !== 'undefined' ? window : globalThis);
