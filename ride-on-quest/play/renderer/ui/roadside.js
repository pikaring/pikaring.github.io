/* 道端の NPC（2026-10-22 ユーザー要望。docs/npc-talks.md §1）：会話の相手を、道の先のふちに立たせ、横を通ったかを見る。旅（world.js）とフリーライド（ride-view.js）で使う。
   RQ.roadside.create({ net, ride, v3 }) → { place(char, sec, v), clear(), reached(), tick(), where(), now() }
   place：今の速さ v（m/s）で sec 秒ぶん先（35〜140 m）のふちに立たせる。左右は交互。char が無ければ片づけるだけ。
   reached：横を通る REACH_SEC 秒前（今の速さで。2026-10-26：坂でゆっくり走ると、遠くから話しかけてきた）まで来たら true。立たせていなければ undefined（会話は決まった時刻に始まる）。通り過ぎて 80 m 離れたら片づける（tick）。
   where：今いる所の札（npctalk.js の whereTags。島の話を選ぶのに使う） */
(function (root) {
  const RD = root.RQ.ride, NT = root.RQ.npcTalk;
  const NEAR = 3, REACH_SEC = 1.2, MIN_AHEAD = 12, GONE = 80;   // NEAR：これより近ければ速さによらず着いたとする。MIN_AHEAD：立たせるいちばん近い距離（m）
  const meters = (a, b) => Math.hypot((a.lon - b.lon) * 111320 * Math.cos(a.lat * Math.PI / 180), (a.lat - b.lat) * 110540);

  function create({ net, ride, v3 }) {
    let npc = null, side = 1;
    function clear() { npc = null; root.__rq.npcDist = null; if (v3 && v3.setNpc) v3.setNpc(null); }
    function place(char, sec, v) {
      clear();
      if (!char) return;
      const d = Math.max(MIN_AHEAD, Math.min(140, v * sec)),   // 今の速さで sec 秒先（前は 35 m より近くに立たせず、坂でゆっくり走ると着く前に話し始めていた）
         st = RD.stateAt(ride, d), r = net.roads[st.road];
      const at = s => RD.pointAt(r, Math.max(0, Math.min(r.len, s)));
      const p = at(st.s), p2 = at(st.s + st.dir * 5), p0 = at(st.s - st.dir * 5);
      const hd = [(p2.lon - p0.lon) * Math.cos(p.lat * Math.PI / 180), p2.lat - p0.lat];
      npc = { char, lat: p.lat, lon: p.lon, reached: false, min: Infinity };
      side = -side;
      if (v3 && v3.setNpc) v3.setNpc({ char, lat: p.lat, lon: p.lon, hd, side });
    }
    function tick(v = 0) {
      if (!npc) return;
      const d = meters(RD.info(ride), npc);
      root.__rq.npcDist = d; root.__rq.npcObj = npc;   // テスト用
      if (d < NEAR || d / Math.max(v, 0.3) <= REACH_SEC || (npc.min < 30 && d > npc.min + 2)) npc.reached = true;   // すぐ手前まで来た。コマが飛んで横を通り過ぎたとき（いちばん近づいてから離れ始めた）も
      npc.min = Math.min(npc.min, d);
      if (npc.reached && d > GONE) clear();
    }
    function where() {
      const i = RD.info(ride), M = root.RQ.mapData || {};
      return NT.whereTags({ lat: i.lat, lon: i.lon, ele: i.ele, grade: i.grade * 100 }, net, M.places, M.landmarks);
    }
    return { place, clear, tick, where, reached: () => (npc ? npc.reached : undefined), now: () => npc };
  }

  root.RQ.roadside = { create };
})(window);
