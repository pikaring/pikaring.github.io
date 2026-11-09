/* 空（2026-10-23 ユーザー要望）：上から下へ色が変わる空（ドットの段 7 つ）、太陽、ゆっくり流れる雲、夜は月と星。
   時刻ごとの色と向きは RQ.tod.sky（renderer/game/tod.js）。three.js の物を scene に足し、update(camera, S, dt) でカメラについて動かす。
   雲はドット絵の板（Nearest で拡大）。数は控えめ（設定の「軽い」では半分）。霧の色（地平線の色）は S.horizon。
   RQ.sky.create(T, scene, { light }) → { update(camera, S, dt, visible) } */
(function (root) {
  const R_DOME = 6000, R_BODY = 5000, R_STAR = 5500, R_CLOUD = 4500, BANDS = 7;
  // 小さな絵を canvas に描いて、ぼかさずに拡大する板の材質にする
  function pixelTex(T, w, h, draw) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); draw(c);
    const t = new T.CanvasTexture(cv); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; return t;
  }
  const disc = (c, cx, cy, r, col) => { c.fillStyle = col; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) c.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1); };

  function create(T, scene, { light = false } = {}) {
    const g = new T.Group(); scene.add(g);
    // 空のドーム：天頂 → 地平線を 7 段で（ドット絵の空の段）。太陽のほうの地平線が、夜明け・夕方に染まる
    const dome = new T.Mesh(new T.SphereGeometry(R_DOME, 24, 14), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { uZ: { value: new T.Color() }, uH: { value: new T.Color() }, uSunDir: { value: new T.Vector3(1, 0, 0) }, uSunCol: { value: new T.Color() }, uGlow: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uZ; uniform vec3 uH; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uGlow; varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir); float t = clamp(d.y / 0.7, 0.0, 1.0); t = pow(t, 0.75); t = floor(t * ${BANDS}.0 + 0.5) / ${BANDS}.0;
          vec3 col = mix(uH, uZ, t);
          float s = max(dot(d, normalize(uSunDir)), 0.0); float gl = floor(pow(s, 5.0) * 4.0) / 4.0 * (1.0 - t);   // 太陽のまわりを段でほんのり明るく
          col = mix(col, uSunCol, gl * (0.25 + 0.45 * uGlow));
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    dome.renderOrder = -10; dome.frustumCulled = false; g.add(dome);
    // 太陽・月（ドット絵の円）
    const sunTex = pixelTex(T, 20, 20, c => { disc(c, 9.5, 9.5, 9, '#ffd060'); disc(c, 9.5, 9.5, 7, '#fff2b0'); disc(c, 9.5, 9.5, 5, '#fffbe0'); });
    const moonTex = pixelTex(T, 16, 16, c => { disc(c, 7.5, 7.5, 7, '#dfe6ff'); disc(c, 5, 5, 1, '#aab4d8'); disc(c, 10, 9, 2, '#aab4d8'); disc(c, 6, 11, 1, '#aab4d8'); });
    const body = (tex, size) => { const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false })); s.scale.set(size, size, 1); g.add(s); return s; };
    const sun = body(sunTex, 560), moon = body(moonTex, 380);
    // 星：夜だけ（上の半球に決まった並びで）
    const sp = [], sr = (() => { let a = 7; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    for (let i = 0; i < (light ? 90 : 180); i++) { const az = sr() * Math.PI * 2, el = Math.asin(0.04 + sr() * 0.96), c = Math.cos(el); sp.push(Math.cos(az) * c * R_STAR, Math.sin(el) * R_STAR, Math.sin(az) * c * R_STAR); }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
    const stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    stars.frustumCulled = false; g.add(stars);
    // 雲：ドット絵の雲の板を、遠く・大きめに少しだけ。ゆっくり流れる（まわりの輪ごと回す）
    const cloudTex = [0, 1, 2].map(k => pixelTex(T, 44, 16, c => {
      const blobs = [[[10, 11, 6], [18, 8, 7], [27, 9, 7], [34, 11, 5]], [[8, 11, 5], [16, 9, 6], [25, 7, 7], [33, 10, 6], [38, 12, 3]], [[12, 10, 7], [22, 8, 8], [32, 11, 6]]][k];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 44; x++) {
        let inside = false, top = false;
        for (const [cx, cy, r] of blobs) { const d = (x - cx) ** 2 + ((y - cy) * 1.25) ** 2; if (d <= r * r) { inside = true; if (y < cy) top = true; } }
        if (!inside || y > 13) continue;
        c.fillStyle = y >= 11 ? '#c3ccdc' : top || y < 8 ? '#ffffff' : '#e4eaf4'; c.fillRect(x, y, 1, 1);   // 下ほど青みのある影
      }
    }));
    const ring = new T.Group(); g.add(ring);
    const clouds = [], N = light ? 7 : 14;
    for (let i = 0; i < N; i++) {
      const az = (i / N + sr() * 0.05) * Math.PI * 2, el = (6 + sr() * 24) * Math.PI / 180, w = 1000 + sr() * 900;
      const m = new T.SpriteMaterial({ map: cloudTex[i % 3], transparent: true, fog: false, depthWrite: false, opacity: 0.95 }), s = new T.Sprite(m);
      s.position.set(Math.cos(az) * Math.cos(el) * R_CLOUD, Math.sin(el) * R_CLOUD, Math.sin(az) * Math.cos(el) * R_CLOUD); s.scale.set(w, w * 16 / 44, 1); ring.add(s); clouds.push(m);
    }
    const tint = new T.Color(), warm = new T.Color(0xffc8a0), dark = new T.Color(0x3a4468), v = new T.Vector3();
    function update(camera, S, dt, visible = true) {
      g.visible = visible; if (!visible) return;
      g.position.copy(camera.position); ring.rotation.y += dt * 0.004;   // 雲は 1 周に 26 分ほど
      dome.material.uniforms.uZ.value.setRGB(...S.zenith); dome.material.uniforms.uH.value.setRGB(...S.horizon);
      const lead = S.night > 0.5 ? S.moonDir : S.sunDir;
      dome.material.uniforms.uSunDir.value.set(...S.sunDir); dome.material.uniforms.uSunCol.value.setRGB(...S.sunCol); dome.material.uniforms.uGlow.value = S.glow;
      sun.visible = S.sun > 0 && S.sunDir[1] > -0.02; sun.position.set(S.sunDir[0], S.sunDir[1], S.sunDir[2]).multiplyScalar(R_BODY); sun.material.opacity = Math.min(1, S.sun * 1.4);
      moon.visible = S.moon > 0 && S.moonDir[1] > -0.02; moon.position.set(S.moonDir[0], S.moonDir[1], S.moonDir[2]).multiplyScalar(R_BODY); moon.material.opacity = Math.min(1, S.moon * 1.4);
      stars.material.opacity = Math.max(0, (S.night - 0.3) / 0.7);
      tint.set(0xffffff).lerp(warm, Math.min(1, S.glow * 0.7)).lerp(dark, S.night * 0.78);
      for (const m of clouds) { m.color.copy(tint); m.opacity = 0.95 - 0.2 * S.night; }
      return lead;
    }
    return { update };
  }
  (root.RQ = root.RQ || {}).sky = { create };
})(window);
