/* 画面の一部を PNG にする（ブラウザ版のスクリーンショット。Electron は main の capturePage を使う）。docs/impl-web.md。
   ブラウザには「画面を撮る」機能が無いので、要素を上から順に canvas に描き直す：背景の色・ふち・文字（1字ずつ、その位置に）・canvas・img。
   まとめの画面（.report）で使う形だけに対応する（影・角の丸み・グラデーションは描かない）。スクロールで隠れた所も含めて全部描く。 */
(function (root) {
  const RQ = root.RQ = root.RQ || {};
  const visible = cs => cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0;
  const solid = c => c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c);

  // 1字の箱。折り返した行の頭の字は、iPhone（WebKit）で前の行の終わりの空の箱と合わせた 2 行ぶんの箱が返ることがあり、
  // その字が行の間（左の端の、半行上）に描かれていた（2026-11-08 試走：まとめの写真の村の長老の話で、行の頭の字が ＊ の下に縦に落ちた）。
  // 箱を 1 つずつ見て、幅のある最後の箱（字そのもの。字は後ろの行にある）を使う。それでも 1 行より高ければ、下の行（字のある行）に寄せる
  function charBox(rg, lh) {
    let r = null;
    for (const x of rg.getClientRects()) if (x.width > 0 && x.height > 0) r = x;
    if (!r) { const b = rg.getBoundingClientRect(); if (!b.width) return null; r = b; }
    if (r.height > lh * 1.5) return { left: r.left, top: r.bottom - lh, width: r.width, height: lh };
    return r;
  }
  // その場で（同じ処理の中で）描く。3D の canvas（WebGL）は、描いた直後の同じ処理の中でなら読める（道中の写真。app.js の時計の終わりで呼ぶ）
  // opts.buttons：ボタンも描くか（まとめの画像では描かない、道中の写真では描く）
  function drawSync(el, scale = 1, opts = {}) {
    const box = el.getBoundingClientRect(), W = Math.ceil(el.scrollWidth), H = Math.ceil(el.scrollHeight);
    const ox = box.left - el.scrollLeft, oy = box.top - el.scrollTop;   // 要素の左上（スクロールのぶんを戻す）
    const cv = document.createElement('canvas'); cv.width = W * scale; cv.height = H * scale;
    const g = cv.getContext('2d'); g.scale(scale, scale);
    const bg = getComputedStyle(el).backgroundColor;
    g.fillStyle = solid(bg) ? bg : getComputedStyle(document.body).backgroundColor || '#000'; g.fillRect(0, 0, W, H);

    const walk = node => {
      if (node.nodeType === 3) return text(node);
      if (node.nodeType !== 1) return;
      if (node.tagName === 'BUTTON' && !opts.buttons) return;   // まとめの画像にはボタンを入れない
      if (node.dataset && node.dataset.noshot != null) return;   // まとめの画像に入れないもの（ブラウザ版の Amazon のリンク）
      const cs = getComputedStyle(node); if (!visible(cs)) return;
      const r = node.getBoundingClientRect(), x = r.left - ox, y = r.top - oy;
      if (node.tagName === 'svg') return svg(node, cs, r, x, y);
      if (node !== el) {
        let fill = solid(cs.backgroundColor) ? cs.backgroundColor : null;
        if (!fill && /gradient/.test(cs.backgroundImage)) { const cols = cs.backgroundImage.match(/rgba?\([^)]+\)/g); if (cols) fill = cols[Math.floor(cols.length / 2)]; }   // グラデーションは、まん中の色で
        if (fill) { g.fillStyle = fill; g.fillRect(x, y, r.width, r.height); }
      }
      for (const [side, w, c] of [['top', cs.borderTopWidth, cs.borderTopColor], ['right', cs.borderRightWidth, cs.borderRightColor], ['bottom', cs.borderBottomWidth, cs.borderBottomColor], ['left', cs.borderLeftWidth, cs.borderLeftColor]]) {
        const bw = parseFloat(w); if (!bw || !solid(c) || cs[`border${side[0].toUpperCase() + side.slice(1)}Style`] === 'none') continue;
        g.fillStyle = c;
        if (side === 'top') g.fillRect(x, y, r.width, bw); else if (side === 'bottom') g.fillRect(x, y + r.height - bw, r.width, bw);
        else if (side === 'left') g.fillRect(x, y, bw, r.height); else g.fillRect(x + r.width - bw, y, bw, r.height);
      }
      if (node.tagName === 'CANVAS') { try { g.drawImage(node, x, y, r.width, r.height); } catch (_) {} return; }
      if (node.tagName === 'IMG' && node.complete) { try { g.drawImage(node, x, y, r.width, r.height); } catch (_) {} return; }
      // はみ出しを隠す要素（ドラムの数字の窓など）は、その中だけに描く。clip-path の inset も
      const clip = node !== el && (cs.overflow !== 'visible' || /^inset\(/.test(cs.clipPath));
      if (clip) {
        let [t, rr, b, l] = [0, 0, 0, 0];
        const m = /^inset\(([^)]*)\)/.exec(cs.clipPath || '');
        if (m) { const v = m[1].split(/\s+/).map(parseFloat).map(n => n || 0); [t, rr, b, l] = [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]]; }
        g.save(); g.beginPath(); g.rect(x + l, y + t, Math.max(0, r.width - l - rr), Math.max(0, r.height - t - b)); g.clip();
      }
      for (const c of node.childNodes) walk(c);
      if (clip) g.restore();
    };
    // SVG（走行データの速度のメーターなど）：path と polygon を、線と塗りで描く
    function svg(node, cs, r, x, y) {
      const vb = node.viewBox && node.viewBox.baseVal, sx = vb && vb.width ? r.width / vb.width : 1, sy = vb && vb.height ? r.height / vb.height : 1;
      g.save(); g.translate(x - (vb ? vb.x * sx : 0), y - (vb ? vb.y * sy : 0)); g.scale(sx, sy);
      for (const s of node.querySelectorAll('path, polygon')) {
        const c = getComputedStyle(s); if (!visible(c)) continue;
        const d = s.tagName === 'path' ? s.getAttribute('d') : 'M' + (s.getAttribute('points') || '').trim().split(/\s+/).join(' L') + ' Z';
        if (!d || d === 'M Z') continue;
        let path; try { path = new Path2D(d); } catch (_) { continue; }
        if (solid(c.fill) && c.fill !== 'none') { g.fillStyle = c.fill; g.fill(path); }
        const sw = parseFloat(c.strokeWidth); if (sw && solid(c.stroke) && c.stroke !== 'none') { g.strokeStyle = c.stroke; g.lineWidth = sw; g.lineCap = c.strokeLinecap || 'butt'; g.stroke(path); }
      }
      g.restore();
    }
    const range = document.createRange();
    function text(node) {
      const s = node.textContent; if (!s.trim()) return;
      const cs = getComputedStyle(node.parentElement);
      g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; g.fillStyle = cs.color; g.textBaseline = 'alphabetic';
      const size = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight) || size * 1.4;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === ' ' || s[i] === '\n') continue;
        range.setStart(node, i); range.setEnd(node, i + 1);
        const r = charBox(range, lh); if (!r) continue;
        // 1字の箱の下から、字の下がり（だいたい文字の大きさの2割）だけ上を基準線にする
        g.fillText(s[i], r.left - ox, r.top - oy + (r.height + size) / 2 - size * 0.12);
      }
    }
    walk(el);
    return cv;
  }
  async function toBlob(el, scale = 1, type = 'image/png', quality) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const cv = drawSync(el, scale);
    return new Promise(ok => cv.toBlob(ok, type, quality));
  }

  RQ.snapshot = { drawSync, toBlob, charBox };
})(window);
