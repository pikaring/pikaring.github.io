/* 分かれ道の矢印（2026-10-21 ユーザー判断）。分かれ道の手前で、左右の矢印を出す。何もしないで曲がる向きの矢印を点灯し、
   反対側を点滅させる。スペースキーで入れ替わる（切り替えは RQ.ride.toggle）。矢印の下に、進む先の分かれ道の名前を小さく添える（左右が同じ分かれ道へ着くときは、道の名前）。
   RQ.ui.turnArrows(host) → { update(choice | null), dispose() }。choice は RQ.ride.choice(ride)。null なら隠す。 */
(function (root) {
  // 分かれ道の名前の表示の置き換え（2026-10-24 ユーザー判断）：東の町の入口の分かれ道（中の名前は トリカラスノ浜）は、町の中なので「城下町」と出す。道の網の中の名前（版・コース・記録）は変えない
  function turnArrows(host) {
    const box = document.createElement('div');
    box.className = 'turn'; box.hidden = true;
    box.innerHTML = '<div class="win turn-side l"><b>◀</b><small></small></div><div class="win turn-side r"><b>▶</b><small></small></div>';
    host.appendChild(box);
    const l = box.querySelector('.l'), r = box.querySelector('.r');
    let last = '';
    return {
      update(ch) {
        if (!ch) { if (!box.hidden) box.hidden = true; last = ''; return; }
        const key = `${ch.left.to}|${ch.right.to}|${ch.turn}`;
        box.hidden = false;
        if (key === last) return;
        last = key;
        // 左右とも同じ分かれ道へ着くとき（寛保岳の内まわり・外まわりなど）は、行き先の代わりに道の名前を出す（2026-10-22 ユーザー指摘：どちらも「寛保岳北」になっていた）
        const same = ch.left.to === ch.right.to;
        const n = root.RQ.i18n.n;   // 道・分かれ道の名前は ID のまま、表示だけ今の言語に
        const lab = root.RQ.i18n.node;
        l.querySelector('small').textContent = same ? n(ch.left.name) : lab(ch.left.to); r.querySelector('small').textContent = same ? n(ch.right.name) : lab(ch.right.to);
        for (const [side, el] of [['left', l], ['right', r]]) { el.classList.toggle('lit', ch.turn === side); el.classList.toggle('blink', ch.turn !== side); }
      },
      dispose() { box.remove(); },
    };
  }
  root.RQ.ui.turnArrows = turnArrows;
})(window);
