/* 名前を今の言語に（docs/i18n-names.md）。日本語以外のとき、起動のはじめに、画面に出す名前だけをデータに入れ替える（ID とデータの形は変えない）。
   入れ替えるもの：職業・プラン・時期・難易度・属性・敵・必殺技・装備（名前と説明）・火の島の名前・NPC の名前・コース（名前・説明・難しさ）・旅の場面の名前。
   地名・道の名前は ID なので入れ替えず、画面に出す所で RQ.i18n.n(名前) を通す（world・view3d・turn-view・ride-view・app）。
   game/ と mapData を読んだあと、ui/ より前に読む。 */
(function (root) {
  const I = root.RQ.i18n;
  if (I.lang === 'ja') return;
  const D = root.RQ.data, TK = root.RQ.talks, C = root.RQ.course, M = root.RQ.mapData, n = I.n;
  for (const h of Object.values(D.HEROES)) h.n = n(h.n);
  for (const p of Object.values(D.PLANS)) p.n = n(p.n);
  D.PHASES.forEach((ph, i) => { D.PHASES[i] = n(ph); });
  for (const d of Object.values(D.DIFFICULTY)) d.n = n(d.n);
  for (const k of Object.keys(D.ATTR)) D.ATTR[k] = n(D.ATTR[k]);
  for (const e of Object.values(D.ENEMIES)) e.n = n(e.n);
  for (const s of Object.values(D.SKILLS)) { s.skill = n(s.skill); s.crit = n(s.crit); if (s.gold3) s.gold3 = n(s.gold3); }
  for (const list of Object.values(D.ITEMS)) for (const it of list) { it.d = I.desc('item', it.id, it.d); it.n = n(it.n); }
  for (const k of Object.keys(D.WORLD)) D.WORLD[k] = n(D.WORLD[k]);
  for (const p of Object.values(TK.NPCS)) p.n = n(p.n);
  if (C) C.STAGE_NAME = n(C.STAGE_NAME);
  if (M && M.courses) for (const c of M.courses) { c.desc = I.desc('course', c.id, c.desc); c.name = n(c.name); c.level = n(c.level); }
})(window);
