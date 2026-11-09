/* 海の生き物（2026-10-23 ユーザー要望）：水面の下を泳ぐ魚影（ときどき現れて消える）と、たまに跳ねて小さなしぶきを上げる魚。
   数は控えめ（設定の「軽い」では少なく）で、カメラから遠い所には出さない（110 m まで）。夜は影をうすく。ドット絵の板（Nearest で拡大）。
   RQ.sealife.create(T, scene, { light, seaAt }) → { update(camera, dt, S) }。seaAt(x, z)：岸からの距離（m。陸は 0、海は大きい）。 */
(function (root) {
  const RANGE = 110, DROP = 150;
  function pixelTex(T, w, h, draw) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); draw(c);
    const t = new T.CanvasTexture(cv); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; return t;
  }
  function create(T, scene, { light = false, seaAt }) {
    // 魚影：頭を右に向けた、細長い影（尾びれつき）
    const shadowTex = pixelTex(T, 16, 8, c => {
      c.fillStyle = '#ffffff';
      for (const [x, y, w, h] of [[3, 2, 9, 4], [5, 1, 5, 6], [1, 3, 3, 2], [0, 2, 2, 1], [0, 5, 2, 1], [12, 3, 3, 2]]) c.fillRect(x, y, w, h);
    });
    // 跳ねる魚：銀色のからだ、青い背、白い腹
    const fishTex = pixelTex(T, 16, 8, c => {
      const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
      px(4, 2, 9, 3, '#5f8fc0'); px(4, 5, 9, 1, '#e8f0f8'); px(3, 3, 1, 2, '#9fb8d8'); px(13, 3, 1, 1, '#233a60'); px(1, 1, 3, 2, '#9fb8d8'); px(1, 5, 3, 2, '#9fb8d8'); px(2, 3, 2, 2, '#9fb8d8'); px(11, 3, 1, 1, '#ffffff');
    });
    const splashTex = pixelTex(T, 12, 8, c => {
      c.fillStyle = '#ffffff';
      for (const [x, y] of [[1, 5], [3, 3], [5, 1], [6, 1], [8, 3], [10, 5], [2, 6], [9, 6], [5, 5], [6, 5], [4, 6], [7, 6]]) c.fillRect(x, y, 1, 1);
    });
    const N = light ? 5 : 12, rnd = Math.random;
    const shMat = new T.MeshBasicMaterial({ map: shadowTex, color: 0x0e3558, transparent: true, opacity: 0, depthWrite: false, fog: true });
    const flat = new T.PlaneGeometry(1, 0.5); flat.rotateX(-Math.PI / 2);
    const fish = [];
    for (let i = 0; i < N; i++) {
      const m = new T.Mesh(flat, shMat.clone()); m.visible = false; m.renderOrder = 1; scene.add(m);
      fish.push({ m, alive: false, x: 0, z: 0, a: 0, v: 0, age: 0, life: 0, size: 1 });
    }
    const jumpS = new T.Sprite(new T.SpriteMaterial({ map: fishTex, transparent: true, fog: true, depthWrite: false })); jumpS.visible = false; scene.add(jumpS);
    const splashes = [0, 1].map(() => { const s = new T.Sprite(new T.SpriteMaterial({ map: splashTex, transparent: true, fog: true, depthWrite: false })); s.visible = false; s.center.set(0.5, 0); scene.add(s); return { s, t: 9 }; });
    let jump = null, nextJump = 3 + rnd() * 3, splashAt = 0;
    const ok = (x, z) => seaAt(x, z) >= 9;   // 岸から 9 m より沖
    function spawn(f, cam) {
      for (let k = 0; k < 8; k++) {
        const a = rnd() * Math.PI * 2, d = 18 + rnd() * (RANGE - 20), x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
        if (!ok(x, z)) continue;
        Object.assign(f, { alive: true, x, z, a: rnd() * Math.PI * 2, v: 0.5 + rnd() * 1.2, age: 0, life: 9 + rnd() * 12, size: 3 + rnd() * 3 }); return;
      }
    }
    function splash(i, x, z) { const sp = splashes[i]; sp.t = 0; sp.s.position.set(x, 0.1, z); sp.s.visible = true; }
    function update(camera, dt, S) {
      const cam = camera.position, dark = 1 - 0.65 * (S ? S.night : 0);
      for (const f of fish) {
        if (!f.alive) { if (rnd() < dt * 1.5) spawn(f, cam); else continue; if (!f.alive) continue; }
        f.age += dt; f.x += Math.cos(f.a) * f.v * dt; f.z += Math.sin(f.a) * f.v * dt; f.a += Math.sin(f.age * 0.7 + f.size) * dt * 0.35;
        const d = Math.hypot(f.x - cam.x, f.z - cam.z);
        if (f.age > f.life || d > DROP || !ok(f.x, f.z)) { f.alive = false; f.m.visible = false; continue; }
        const fade = Math.min(1, f.age / 1.5, (f.life - f.age) / 1.5) * (1 - Math.max(0, (d - 70) / 40));
        f.m.visible = true; f.m.position.set(f.x, 0.04, f.z); f.m.rotation.y = -f.a; f.m.scale.set(f.size, 1, f.size); f.m.material.opacity = 0.5 * fade * dark;
      }
      // 跳ねる魚：ときどき、近くの魚が 1.1 秒の弧で跳ね、飛び出しと着水でしぶき
      nextJump -= dt;
      if (!jump && nextJump <= 0) {
        const fw = camera.getWorldDirection(new T.Vector3()), fl = Math.hypot(fw.x, fw.z) || 1;
        const c = fish.filter(f => { const d = Math.hypot(f.x - cam.x, f.z - cam.z); return f.alive && f.age > 1.5 && d > 22 && d < 85 && ((f.x - cam.x) * fw.x + (f.z - cam.z) * fw.z) / (d * fl) > 0.6; });   // 画面の中の魚だけ
        if (c.length) { const f = c[Math.floor(rnd() * c.length)]; jump = { x: f.x, z: f.z, a: f.a, t: 0, dur: 1.0 + rnd() * 0.3 }; splash(0, f.x, f.z); }
        nextJump = 5 + rnd() * 5;
      }
      if (jump) {
        jump.t += dt; const u = jump.t / jump.dur;
        if (u >= 1) { splash(1, jump.x + Math.cos(jump.a) * 3.2, jump.z + Math.sin(jump.a) * 3.2); jump = null; jumpS.visible = false; }
        else {
          const x = jump.x + Math.cos(jump.a) * 3.2 * u, z = jump.z + Math.sin(jump.a) * 3.2 * u;
          jumpS.visible = true; jumpS.position.set(x, 0.3 + 1.7 * 4 * u * (1 - u), z); jumpS.scale.set(2.6, 1.3, 1);
          // 絵は右向き：カメラから見て、進む向きが左なら左右を反転（板の向きは画面に正対）
          const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), mv = new T.Vector3(Math.cos(jump.a), 0, Math.sin(jump.a));
          jumpS.scale.x = (mv.dot(right) >= 0 ? 1 : -1) * 2.6; jumpS.material.rotation = -0.6 * (1 - 2 * u) * (mv.dot(right) >= 0 ? 1 : -1) * 0.5;
          jumpS.material.opacity = 1;
        }
      }
      for (const sp of splashes) {
        if (sp.t > 1) { sp.s.visible = false; continue; }
        sp.t += dt; const u = Math.min(1, sp.t / 0.6); sp.s.scale.set(2 + 3 * u, 1.4 + 1.0 * u, 1); sp.s.material.opacity = 1 - u; if (u >= 1) sp.t = 9;
      }
    }
    return { update, forceJump: () => { nextJump = 0; }, state: () => ({ fish: fish.filter(f => f.alive).length, jumping: !!jump }) };   // forceJump：テスト用（すぐ跳ねさせる）
  }
  (root.RQ = root.RQ || {}).sealife = { create };
})(window);
