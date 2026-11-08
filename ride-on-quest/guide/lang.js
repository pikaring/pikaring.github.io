// 言語：保存した選択 → ブラウザの言語（日本語以外は英語）。紹介ページと同じ roq.lang
(function () {
  var root = document.documentElement, saved = null;
  try { saved = localStorage.getItem('roq.lang'); } catch (e) {}
  var lang = saved || ((navigator.language || 'ja').toLowerCase().indexOf('ja') === 0 ? 'ja' : 'en');
  function set(l) { root.setAttribute('data-lang', l); root.setAttribute('lang', l); document.querySelectorAll('[data-set-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === l)); }); }
  document.querySelectorAll('[data-set-lang]').forEach(function (b) { b.addEventListener('click', function () { var l = b.getAttribute('data-set-lang'); try { localStorage.setItem('roq.lang', l); } catch (e) {} set(l); }); });
  set(lang);
})();
