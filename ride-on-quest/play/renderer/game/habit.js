/* 続ける仕組み（2026-10-21 ユーザー判断。docs/compare-apps.md の4）：走った記録（rq.records）から、今週の回数と分、続けた日数を数える。
   週は月曜始まり、日付は手元の時刻。旅・フリーライド・試練・レースのどれも1回に数える（1分未満は数えない）。画面に触らない純粋な関数。 */
(function (root) {
  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;   // 手元の時刻の日付
  // 記録の日付：day（YYYY-MM-DD）か、前の形の date（toLocaleDateString('ja-JP') の YYYY/M/D）
  function dayOfRec(r) {
    if (r.day) return r.day;
    const m = /^(\d{4})\D(\d{1,2})\D(\d{1,2})/.exec(r.date || '');
    return m ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null;
  }
  const counted = recs => (recs || []).filter(r => (r.min || 0) >= 1 && dayOfRec(r));
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const monday = d => addDays(d, -((d.getDay() + 6) % 7));

  // 今週（月曜〜今日）の回数と分
  function week(recs, now = new Date()) {
    const from = dayKey(monday(now)), to = dayKey(now);
    const rs = counted(recs).filter(r => { const k = dayOfRec(r); return k >= from && k <= to; });
    return { n: rs.length, min: rs.reduce((a, r) => a + r.min, 0) };
  }
  // 続けた日数：今日（まだ走っていなければ昨日）からさかのぼって、毎日走った日数
  function streak(recs, now = new Date()) {
    const days = new Set(counted(recs).map(dayOfRec));
    let d = days.has(dayKey(now)) ? now : addDays(now, -1), n = 0;
    while (days.has(dayKey(d))) { n++; d = addDays(d, -1); }
    return n;
  }
  // 週の目標：'c4'＝週4回、'm240'＝週240分、''＝なし
  function goalOf(s) {
    const m = /^([cm])(\d+)$/.exec(s || '');
    return m ? { kind: m[1], n: +m[2] } : null;
  }
  // 「今週 3回・135分／目標 4回」。目標に届いたら「（達成）」。tr：言語の表の t（無ければ日本語。node のテスト）
  const JA = { 'habit.week': '今週 {n}回・{min}分', 'habit.goalC': '／目標 {n}回', 'habit.goalM': '／目標 {n}分', 'habit.done': '（達成）', 'habit.streak': '{n}日つづけた' };
  const jaT = (k, v) => JA[k].replace(/\{(\w+)\}/g, (m, x) => v[x]);
  function weekText(w, goal, tr = jaT) {
    let s = tr('habit.week', { n: w.n, min: w.min });
    if (goal) s += tr(goal.kind === 'c' ? 'habit.goalC' : 'habit.goalM', { n: goal.n }) + ((goal.kind === 'c' ? w.n : w.min) >= goal.n ? tr('habit.done', {}) : '');
    return s;
  }
  const streakText = (n, tr = jaT) => n >= 2 ? tr('habit.streak', { n }) : '';   // 1日だけでは出さない

  const api = { JA, dayKey, dayOfRec, week, streak, goalOf, weekText, streakText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).habit = api;
})(typeof window !== 'undefined' ? window : globalThis);
