/* 島の簡易3D（three.js 0.149、vendor/three.min.js）。
   地形は標高データ（RQ.mapData.island、高さは vScale 倍）、道は道の網（RQ.net）の点、主人公はドット絵の板（後ろ姿）。
   カメラは主人公の少し後ろから、進む向きを見る。dots を渡すと、その高さ（px）で描いて拡大し、ドット風にする。 */
(function (root) {
  const D = root.RQ.data, SPR = root.RQ.sprites, RD = root.RQ.ride, GC = root.RQ.groundclass;
  const SKY = 0x9cc8ea, SEA = 0x2f6d9c;
  const VIEW_UP = 2.2;   // 見た目の高さの倍率

  // 主人公の背の高さ（3D の単位＝m）。身長 180 cm（2026-10-25 ユーザー判断：1.8 がちょうどよく、スピード感も出る。前は 2.8＝会話の窓の左上の人と同じくらい、2026-10-21 ユーザー要望）。
  // カメラの高さ・距離など主人公を基準にした値は、2.8 のときの値（HERO_BASE）を書いたまま、HS＝HERO_H / HERO_BASE を掛けて縮める
  const HERO_H0 = 1.8, HERO_BASE = 2.8;

  function create(host, { net, heroId, dots = 0 }) {
    const T = root.THREE, isl = root.RQ.mapData.island;
    // テスト用：window.__rq.heroH（例 2.8＝前の大きさ）を、3D を作る前に入れると、主人公の背の高さがその値になる。
    // カメラの高さ・後ろの距離・見る先の高さ、主人公を基準にした物（旅人・影・名前の札・足もとの光・道端の NPC）も同じ割合（HS）で縮め、画面の中の主人公の大きさと位置は変えない。既定は HERO_H0（1.8）
    const HERO_H = root.__rq && root.__rq.heroH > 0 ? root.__rq.heroH : HERO_H0, HS = HERO_H / HERO_BASE;
    // 見た目の坂はオーバーに（2026-10-20 ユーザー判断）：地形の高さを VIEW_UP 倍にして描く。速さと記録にはコースの標高を使う
    const R = isl.rows, C = isl.cols, cell = isl.cell, vs = isl.vScale * VIEW_UP;
    const mPerLon = 111320 * Math.cos(isl.lat0 * Math.PI / 180);
    // 緯度経度 → 3D の座標（x＝東、z＝南、y＝高さ）
    const toX = lon => (lon - isl.lon0) * mPerLon, toZ = lat => (isl.lat0 - lat) * 111320;
    // 地形の高さ。地形の面（格子の頂点を b–d の対角で2つの三角形に割ったもの）の上の高さをそのまま返す（面とずれない。道や家が浮いたり埋まったりしない）。
    // 道の高さは均してあり尾根で地面より低くなるので、見た目は地形の高さに合わせる。海のマスは 0（地形の面は -4 まで沈める）
    // 面の上の高さ。vf(行, 列) が格子の頂点の高さ
    function surf(x, z, vf) {
      const c = Math.max(0, Math.min(C - 1.001, x / cell)), r = Math.max(0, Math.min(R - 1.001, z / cell));
      const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0;
      const a = vf(r0, c0), b = vf(r0, c0 + 1), d = vf(r0 + 1, c0), e = vf(r0 + 1, c0 + 1);
      return fc + fr <= 1 ? a + (b - a) * fc + (d - a) * fr : e + (d - e) * (1 - fc) + (b - e) * (1 - fr);
    }
    const gridG = (rr, cc) => Math.max(0, isl.elev[rr][cc]) * vs;       // 物を置く高さ（海は 0）
    // 海岸線をなめらかにする（2026-10-25 ユーザー指摘：海岸線がギザギザで機械的）。標高の格子（14 m）の陸・海の境目が階段・まっすぐな線のまま出るので、
    // 陸の分布をぼかした値（mb）に、ゆるい波（波長 60〜100 m）を足して、岸の近くの海のマスの高さを持ち上げ、岸の線を曲げる。陸のマスは下げない（岸が陸の側へは動かない）。
    // 描く面（地形の頂点）の高さ SM。海のマスは -4、岸のそばだけ SM で浅く持ち上がる。陸の高さ・道・物を置く高さ（gridG）は変えない
    const SM = (() => {
      const N = R * C, m0 = new Float32Array(N), eh = new Float32Array(N), out = new Float32Array(N);
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const e = isl.elev[r][c], i = r * C + c; m0[i] = e >= 0 ? 1 : 0; eh[i] = e >= 0 ? e * vs : 0; out[i] = e < 0 ? -4 : e * vs; }
      const K = [], SG = 1.1; for (let d = -3; d <= 3; d++) K.push(Math.exp(-d * d / (2 * SG * SG)));
      const blur = src => { const t = new Float32Array(N), o = new Float32Array(N);
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { let sw = 0, sv = 0; for (let d = -3; d <= 3; d++) { const cc = c + d; if (cc < 0 || cc >= C) continue; const w = K[d + 3]; sw += w; sv += w * src[r * C + cc]; } t[r * C + c] = sv / sw; }
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { let sw = 0, sv = 0; for (let d = -3; d <= 3; d++) { const rr = r + d; if (rr < 0 || rr >= R) continue; const w = K[d + 3]; sw += w; sv += w * t[rr * C + c]; } o[r * C + c] = sv / sw; }
        return o; };
      const mb = blur(m0), hb = blur(eh);
      const hv = (x, y) => { let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
      const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
        return (hv(xi, yi) * (1 - u) + hv(xi + 1, yi) * u) * (1 - v) + (hv(xi, yi + 1) * (1 - u) + hv(xi + 1, yi + 1) * u) * v; };
      const ss = (a0, a1, x) => { const t = Math.max(0, Math.min(1, (x - a0) / (a1 - a0))); return t * t * (3 - 2 * t); };
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const i = r * C + c; let band = false;
        for (let dr = -2; dr <= 2 && !band; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= R || cc >= C) continue; if (m0[rr * C + cc] !== m0[i]) { band = true; break; } }
        if (!band) continue;
        const wob = (vn(c / 13, r / 13 + 9) - 0.5) * 0.8 + (vn(c / 5.5, r / 5.5) - 0.5) * 0.7 + (vn(c / 2.3 + 40, r / 2.3 + 17) - 0.5) * 0.25;   // 岸の線をゆらす
        const sv = ss(0.22, 0.52, mb[i] + wob);
        const yl = mb[i] > 0.02 ? hb[i] / mb[i] : 0, yL = m0[i] ? Math.max(isl.elev[r][c] * vs, 0.35) : Math.max(yl, 0.35);
        const y = -4 + (yL + 4) * sv;
        out[i] = m0[i] ? Math.max(y, Math.min(isl.elev[r][c] * vs, 0.5)) : y;
      }
      return out;
    })();
    const gridM = (rr, cc) => SM[rr * C + cc];   // 描く面（海は -4。岸のそばは、海岸線をなめらかにするため SM）
    const groundBase = (x, z) => surf(x, z, gridG);
    // 道の横断面を水平にするため、道のそばの格子のマスは NSUB×NSUB に刻み、道の高さへ切り盛りする（2026-10-23 ユーザー要望）。
    // 刻んだマスの高さは carve.h に持つ（行ごとに NSUB+1 個ずつ）。ここにあるマスの上の高さは、描く面と同じ三角形で求める
    let NSUB = 4;   // 画面が「軽い」ときは 3（下の light の宣言のあとで決める）
    const carve = { idx: null, h: null };
    // 地形の高さ。描く面の上の高さをそのまま返す（面とずれない。道や家が浮いたり埋まったりしない）。海のマスは 0（描く面は -4 まで沈める）
    const TUNH = new Map();   // 地面の下をくぐるトンネルの道の点（6 m ごとの箱に入れる）：{ x, z, y }。そのそば 5.5 m では、groundY が道の面（地面の下）の高さを返す（2026-10-24）
    const BRZ = [];   // 運河を渡る石のアーチ橋の区間（東の街）：{ x, z, tx, tz（道の向き）, half（半分の長さ m）, deck, hump }。橋の上では、道・主人公・ゴーストの高さが橋の面になる
    function groundY(x, z) {
      for (let i = 0; i < BRZ.length; i++) { const b = BRZ[i], dx = x - b.x, dz = z - b.z, al = dx * b.tx + dz * b.tz; if (al > -b.half && al < b.half && Math.abs(-dx * b.tz + dz * b.tx) < 5) { const u = al / b.half; return b.deck + b.hump * (1 - u * u); } }
      if (TUNH.size) {
        const bx = Math.floor(x / 6), bz = Math.floor(z / 6); let b1 = null, d1 = 30.25, b2 = null, d2 = 1e9;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = TUNH.get((bx + i) + ',' + (bz + j)); if (!l) continue; for (const q of l) { const dd = (q.x - x) ** 2 + (q.z - z) ** 2; if (dd < d1) { b2 = b1; d2 = d1; b1 = q; d1 = dd; } else if (dd < d2) { b2 = q; d2 = dd; } } }
        if (b1) {
          const yt = b2 && d2 < 30.25 ? (b1.y * Math.sqrt(d2) + b2.y * Math.sqrt(d1)) / ((Math.sqrt(d1) + Math.sqrt(d2)) || 1) : b1.y, r1 = Math.sqrt(d1);
          if (r1 <= 3.5) return yt;
          const t = (r1 - 3.5) / 2, w = 1 - t * t * (3 - 2 * t);   // 3.5〜5.5 m で、描く地形の面へなめらかに（口で主人公が跳ねないように。2026-10-27 ユーザー指摘）
          return yt * w + groundMesh(x, z) * (1 - w);
        }
      }
      return groundMesh(x, z);
    }
    // 描く地形の面の高さ（道の面の置き換え TUNH・橋を除く）。テスト用 __rq.tunnelClear もこれを使う
    function groundMesh(x, z) {
      if (carve.idx) {
        const c = Math.max(0, Math.min(C - 1.001, x / cell)), r = Math.max(0, Math.min(R - 1.001, z / cell));
        const c0 = Math.floor(c), r0 = Math.floor(r), o = carve.idx[r0 * C + c0];
        if (o >= 0) {
          const fc = (c - c0) * NSUB, fr = (r - r0) * NSUB, j = Math.floor(fc), i = Math.floor(fr), u = fc - j, v = fr - i, W = NSUB + 1, h = carve.h, q = o + i * W + j;
          const a = h[q], b = h[q + 1], d = h[q + W], e = h[q + W + 1];
          return u + v <= 1 ? a + (b - a) * u + (d - a) * v : e + (d - e) * (1 - u) + (b - e) * (1 - v);
        }
      }
      return groundBase(x, z);
    }
    // 道と主人公は地形の上に置く（道の標高は速さと記録に使い、見た目には使わない）
    const at3 = (lat, lon) => { const x = toX(lon), z = toZ(lat); return new T.Vector3(x, groundY(x, z), z); };
    // 左側通行（2026-10-22 ユーザー判断）：主人公もゴーストも、進む向きの左へ、道の幅の 1/4（3.2 m の 1/4 ＝ 0.8 m）だけずらして描く。見た目だけで、記録や座標は変えない。
    // 向きが急に変わる所（分かれ道）でずらしが飛ばないよう、ずらす量はなめらかに追いかける
    const LANE = 0.8;
    const laneVec = (hx, hz) => { const l = Math.hypot(hx, hz); return l < 1e-6 ? null : [hz / l * LANE, -hx / l * LANE]; };   // x＝東・z＝南。向き (hx, hz) の左
    const lane = (p, off) => { const x = p.x + off[0], z = p.z + off[1]; return new T.Vector3(x, groundY(x, z), z); };
    const follow = (cur, want, k) => { if (!want) return cur; if (!cur) return [want[0], want[1]]; cur[0] += (want[0] - cur[0]) * k; cur[1] += (want[1] - cur[1]) * k; return cur; };

    // 画面の重さが「軽い」（設定。タブレット向け）なら、描く細かさ・木と岩の数・霧の距離・地面の模様の届く距離を減らす（docs/impl-web.md §5）
    const light = !!(root.RQ.ui && root.RQ.ui.light && root.RQ.ui.light());
    NSUB = light ? 3 : 4;
    const renderer = new T.WebGLRenderer({ antialias: !dots });
    renderer.setPixelRatio(Math.min(light ? 1 : 2, devicePixelRatio || 1));
    if (dots) renderer.domElement.classList.add('pixel');
    host.appendChild(renderer.domElement);
    const scene = new T.Scene();
    scene.background = new T.Color(SKY);
    scene.fog = new T.Fog(SKY, 250, light ? 1400 : 2400);
    const camera = new T.PerspectiveCamera(65, 1, 0.3 * HS, 8000);
    // 決まった並びの乱数（木の位置や色のむらを毎回同じにする）
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    // 地面のにぎやかさ（2026-10-22 ユーザーが案 C を選んだ。比べの画像・動画は art_src/ground_trial/）：色のむら、浜の波打ちぎわ、道のふち、
    // 0.8 m の格子のドット模様（草・岩の縞・灰・砂・土）、火口のまわりの溶岩のひび、遠く（35〜110 m）で模様が消える。
    // 模様は世界の座標で決まる（メッシュの細かさによらず、地面に張り付いて動く）。uTime は波打ちぎわの動き
    const TUN_N = 48;   // トンネルの筒の中心の線の点の数（地形の材質へ渡す。下の uTunP）
    const GU = { uTunP: { value: Array.from({ length: TUN_N }, () => new T.Vector4(0, 0, 0, 0)) }, uCliff: { value: Array.from({ length: 24 }, () => new T.Vector3(0, 0, 0)) }, uTime: { value: 0 }, uFld: { value: Array.from({ length: 16 }, () => new T.Vector4(0, 0, 0, 0)) }, uFldA: { value: Array.from({ length: 16 }, () => new T.Vector4(1, 0, 0, 0)) } };
    { const cl = ((root.RQ.mapData.features || {}).cliffs || [])[0]; if (cl) cl.pts.slice(0, 24).forEach((p, i) => GU.uCliff.value[i].set(p[1] * cell + cl.inland_m * 0.35, p[0] * cell, cl.inland_m)); }   // 白い断崖：海岸の点から少し内陸の円（x・z・半径 m）
    ((root.RQ.mapData.features || {}).fields || []).slice(0, 16).forEach((f, i) => {   // 田畑：中心 x・z（m）、半分の大きさ（長さ・幅）、向き
      const a = f.yaw_deg * Math.PI / 180; GU.uFld.value[i].set(f.center[1] * cell, f.center[0] * cell, f.size_m[0] / 2, f.size_m[1] / 2); GU.uFldA.value[i].set(Math.cos(a), Math.sin(a), f.kind === 'paddy' ? 0 : 1, f.wobble || 0);
    });
    const NOISE_GLSL = `
      float rq_h(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
      float rq_n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(rq_h(i), rq_h(i + vec2(1.0, 0.0)), f.x), mix(rq_h(i + vec2(0.0, 1.0)), rq_h(i + vec2(1.0, 1.0)), f.x), f.y); }`;
    // 地形の材質に、世界の座標で決まるドット風の模様を足す（メッシュの細かさによらない。1.5 m の格子に量子化して、角のあるドットにする）
    function patchLand(mat) {
      mat.onBeforeCompile = sh => {
        sh.uniforms.uTime = GU.uTime; sh.uniforms.uCity = CITYU; sh.uniforms.uFld = GU.uFld; sh.uniforms.uFldA = GU.uFldA; sh.uniforms.uCliff = GU.uCliff; sh.uniforms.uTunP = GU.uTunP;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aMat;\nvarying vec4 vMat;\nvarying vec3 vWPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vWPos = transformed;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec4 uCity;\nuniform vec4 uFld[16];\nuniform vec4 uFldA[16];\nuniform vec3 uCliff[24];\nuniform vec4 uTunP[' + TUN_N + '];\nvarying vec4 vMat;\nvarying vec3 vWPos;' + NOISE_GLSL)
          .replace('#include <color_fragment>', `#include <color_fragment>
          // トンネルの筒の中（口の外へのばした所も）の地形を抜く（2026-10-27 ユーザー指摘：中に岩肌がはみ出す・口の上に空の色の四角い穴）。
          // 筒の中心の線（uTunP：x, z, 道の面の高さ, 1＝次の点へつながる）から横に 5 m まで、道の面 + 0.25 m 〜 筒の天井（真ん中 7.7 m・壁で 4 m のアーチ）+ 0.5 m の間だけ。天井より上の山は残す
          for (int ti = 0; ti < ${TUN_N - 1}; ti++) {
            vec4 A = uTunP[ti]; if (A.w < 0.5) continue;
            vec4 B = uTunP[ti + 1]; vec2 ab = B.xy - A.xy, ap = vWPos.xz - A.xy; float L2 = dot(ab, ab);
            float t = dot(ap, ab) / L2; if (t < -0.02 || t > 1.02) continue;
            float la = abs(ap.x * ab.y - ap.y * ab.x) / sqrt(L2); if (la > 5.0) continue;
            float yr = mix(A.z, B.z, clamp(t, 0.0, 1.0)), q = la / 5.0;
            if (vWPos.y > yr + 0.25 && vWPos.y < yr + 4.5 + 3.7 * sqrt(max(0.0, 1.0 - q * q))) discard;
          }
          vec3 rqGlow = vec3(0.0);
          {
            float dist = length(vViewPosition), fade = 1.0 - smoothstep(${light ? '20.0, 60.0' : '35.0, 110.0'}, dist);
            vec2 w = vWPos.xz, q = floor(w / 1.5) * 1.5;
            // 大きなむら（38 m と 9 m）：同じ緑の一面にしない
            float big = rq_n(q / 38.0), mid = rq_n(q / 9.0);
            diffuseColor.rgb *= 1.0 + (big - 0.5) * 0.34 + (mid - 0.5) * 0.18;
            vec4 m = vMat; m /= max(m.x + m.y + m.z + m.w, 1.0);
            float g = m.x, r = m.y, a = m.z, sd = m.w, d = max(0.0, 1.0 - g - r - a - sd);
            // 浜：海に近い低いところは濡れた砂、波打ちぎわに白い泡の帯（ゆっくり寄せては引く）
            float wet = 1.0 - smoothstep(0.2, 1.8, vWPos.y);
            diffuseColor.rgb *= 1.0 - 0.2 * wet;
            float wave = 0.3 + 0.28 * sin(uTime * 0.9 + q.x * 0.04 + q.y * 0.03);
            float foam = step(vWPos.y, wave) * step(-0.8, vWPos.y);
            foam = max(foam, step(wave + 0.4, vWPos.y) * step(vWPos.y, wave + 0.58) * step(0.4, rq_n(q / 3.0 + uTime * 0.2)));   // 2 本目の波の線（ところどころ切れる）
            {
              vec2 c1 = floor(w / 0.8);
              float h1 = rq_h(c1), h2 = rq_h(c1 + 17.0), h3 = rq_h(c1 + 53.0);
              vec3 col = diffuseColor.rgb;
              vec3 grass = col * (0.88 + 0.24 * h1);
              grass = mix(grass, vec3(0.96, 0.86, 0.26), step(0.993, h2) * step(0.5, big));
              grass = mix(grass, vec3(0.96, 0.96, 0.92), step(0.994, h3));
              float layer = floor(vWPos.y / 2.4);
              vec3 rock = col * (0.86 + 0.18 * rq_h(vec2(layer, 3.0))) * (0.93 + 0.12 * h1);
              vec2 qc = floor(w / 0.6) * 0.6;
              float crack = 1.0 - smoothstep(0.0, 0.02, abs(rq_n(qc / 4.0) - 0.5));
              vec3 ash = col * (0.8 + 0.3 * h1);
              rqGlow = vec3(0.9, 0.34, 0.07) * crack * step(0.5, a) * step(0.35, rq_n(q / 60.0));
              vec3 sand = col * (0.94 + 0.1 * h1);
              vec3 dirt = col * (0.86 + 0.2 * h1) * (0.96 + 0.08 * h2);
              vec3 detail = grass * g + rock * r + ash * a + sand * sd + dirt * d;
              diffuseColor.rgb = mix(diffuseColor.rgb, detail, fade);
              // 白い断崖（features.json の cliffs。乙部町のシラフラのような、切り立った白〜クリーム色の壁）：縦の雨の溝とひだ、上の縁は草の緑、すその浜は茶色がかった砂
              { float cz = 0.0; for (int ci = 0; ci < 24; ci++) { vec3 cq = uCliff[ci]; if (cq.z <= 0.0) continue; cz = max(cz, 1.0 - smoothstep(cq.z * 0.55, cq.z, length(w - cq.xy))); }
                vec3 gn = normalize(cross(dFdx(vWPos), dFdy(vWPos)));   // 面の向き（頂点の材質の補間に頼らず、面の急さで壁を決める）
                float cw = cz * smoothstep(0.16, 0.5, 1.0 - abs(gn.y));   // 急なところだけ白い壁（ゆるい上の面は草のまま＝縁が緑になる）
                float al = w.y * 0.55 + w.x * 0.2;   // 壁に沿った位置（縦の筋は高さによらない）
                if (cw > 0.0) {
                  float flute = smoothstep(0.3, 0.8, rq_n(vec2(al / 3.0, 9.0)));   // 深い縦のひだ
                  float line = rq_h(vec2(floor(al / 0.7), 11.0));   // 細い雨の溝
                  vec3 cc = mix(vec3(0.98, 0.95, 0.85), vec3(0.72, 0.66, 0.52), flute * 0.9);
                  cc *= (0.84 + 0.22 * line) * 3.6;   // 垂直の壁は光が弱いので明るめに
                  cc *= 0.95 + 0.07 * rq_h(floor(vec2(al, vWPos.y) / 0.8));
                  cc = mix(cc, vec3(0.82, 0.72, 0.52), smoothstep(14.0, 1.0, vWPos.y) * 0.22);   // すそは少し茶色く
                  vec3 rim = mix(vec3(0.36, 0.52, 0.22), cc, smoothstep(0.12, 0.6, cw));   // 上の縁：草の緑にふちどる
                  diffuseColor.rgb = mix(diffuseColor.rgb, rim, smoothstep(0.05, 0.22, cw));
                }
                float bch = cz * (1.0 - smoothstep(0.8, 2.6, vWPos.y)) * step(0.0, vWPos.y);   // 崖のすその砂浜：茶色がかった砂
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.55, 1.3, 0.9) * (0.94 + 0.1 * h1), bch * 0.8);
              }
              // 城下町の地面は石畳（灰〜クリーム色の小さな敷石。家の足もとや路地の地面。町の矩形の内側。ふちはなめらかに）
              { float ci = smoothstep(0.0, 8.0, min(min(w.x - uCity.x, uCity.z - w.x), min(w.y - uCity.y, uCity.w - w.y)));
                if (ci > 0.0) {
                  vec2 u2 = vec2(w.x / 0.8 + 0.5 * mod(floor(w.y / 0.8), 2.0), w.y / 0.8); vec2 c2 = floor(u2), f2 = fract(u2);
                  float jn = step(f2.x, 0.1) + step(f2.y, 0.1);
                  vec3 st = mix(vec3(0.60, 0.58, 0.54), vec3(0.76, 0.73, 0.66), rq_h(c2)) * (0.94 + 0.1 * rq_h(c2 + 5.0));
                  st = mix(st, st * 0.6, min(1.0, jn));
                  diffuseColor.rgb = mix(diffuseColor.rgb, st, ci * 0.95);
                } }
              // 田畑（features.json の fields）：四角の中に、田んぼ（水を張った段・稲の列）か畑（うね）の模様。近くは筋、遠くは地の色だけ
              for (int fi = 0; fi < 16; fi++) {
                vec4 fd = uFld[fi]; if (fd.z <= 0.0) continue;
                vec4 fa = uFldA[fi]; vec2 dq = w - fd.xy; vec2 lq = vec2(dq.x * fa.x + dq.y * fa.y, -dq.x * fa.y + dq.y * fa.x);
                vec2 ed = fd.zw - abs(lq) + (vec2(rq_n(w / 7.0 + float(fi)), rq_n(w / 7.0 + float(fi) + 9.0)) - 0.5) * fa.w;   // ふちを少し崩す if (ed.x < 0.0 || ed.y < 0.0) continue;
                float rim = step(min(ed.x, ed.y), 1.0);   // あぜ（ふちの細い草の筋）
                float row = floor(lq.y / 1.5);
                if (fa.z < 0.5) {   // 田んぼ：水の面、稲の列
                  vec3 pc = mix(vec3(0.46, 0.7, 0.72), vec3(0.4, 0.66, 0.34), step(0.5, rq_h(vec2(row, 3.0))) * 0.7);
                  float sheen = step(0.9, rq_h(floor(w / 0.8) + floor(uTime * 0.6)));
                  pc = mix(pc, vec3(0.9, 0.97, 1.0), sheen * 0.5 * fade);
                  pc = mix(pc, vec3(0.36, 0.62, 0.28), step(0.5, fract(lq.x / 1.2)) * step(0.55, fract(lq.y / 1.5)) * fade);
                  diffuseColor.rgb = mix(pc, diffuseColor.rgb * 0.85, rim);
                } else {   // 畑：うねと、作物の緑
                  vec3 cc = mix(vec3(0.52, 0.36, 0.22), vec3(0.42, 0.62, 0.22), step(0.45, fract(lq.y / 2.0)));
                  cc = mix(cc, vec3(0.62, 0.78, 0.28), step(0.8, rq_h(floor(w / 1.0))) * step(0.45, fract(lq.y / 2.0)) * fade);
                  diffuseColor.rgb = mix(cc, diffuseColor.rgb * 0.85, rim);
                }
              }
              rqGlow *= fade;
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.98, 1.0), foam * 0.95);
          }`)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += rqGlow;');
      };
      return mat;
    }
    // 道の材質：土のつぶ（遠くでは消す）
    // 東の街（城下町）の台の中は、石畳の道（灰色がかった石の模様。ふちは縁石）。台の外は土の道（2026-10-23）。台の矩形（世界の m）は uCity
    const CITYU = { value: new T.Vector4(0, 0, 0, 0) };
    { const c = ((root.RQ.mapData.features || {}).towns || []).find(t => t.id === 'east'); if (c) { const cx = c.center[1] * cell, cz = c.center[0] * cell; CITYU.value.set(cx + c.rect_m[0] - 4, cz + c.rect_m[1] - 4, cx + c.rect_m[2] + 4, cz + c.rect_m[3] + 4); } }
    function patchRoad(mat, edge = false) {
      mat.onBeforeCompile = sh => {
        sh.uniforms.uCity = CITYU;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uCity;\nvarying vec3 vWPos;' + NOISE_GLSL)
          .replace('#include <color_fragment>', `#include <color_fragment>
          { float fade = 1.0 - smoothstep(30.0, 90.0, length(vViewPosition)); vec2 c1 = floor(vWPos.xz / 0.5);
            diffuseColor.rgb *= 1.0 + fade * ((rq_h(c1) - 0.5) * 0.3 + step(0.93, rq_h(c1 + 9.0)) * 0.18);
            float inCity = step(uCity.x, vWPos.x) * step(vWPos.x, uCity.z) * step(uCity.y, vWPos.z) * step(vWPos.z, uCity.w);
            if (inCity > 0.5) {
              ${edge ? 'diffuseColor.rgb = vec3(0.74, 0.72, 0.68) * (0.92 + 0.1 * rq_h(floor(vWPos.xz / 0.7)));   // 縁石' : `vec2 q = vWPos.xz / 0.7; float row = floor(q.y); vec2 u = vec2(q.x + 0.5 * mod(row, 2.0), q.y); vec2 cell2 = floor(u); vec2 fr = fract(u);
              float joint = step(fr.x, 0.09) + step(fr.y, 0.09);
              vec3 stone = mix(vec3(0.36, 0.36, 0.38), vec3(0.50, 0.49, 0.48), rq_h(cell2)) * (0.9 + 0.12 * rq_h(cell2 + 5.0));
              diffuseColor.rgb = mix(stone, stone * 0.55, min(1.0, joint));`}
            } }`);
      };
      return mat;
    }
    // 水の材質（湖・川・温泉）：色に、ちらちら光るドットと、ゆっくり動く波の筋。flow が 0 でなければ、川のように筋が流れる
    // 夜の窓の灯り（2026-10-24 ユーザー要望）：窓の材質だけが時刻で光る（光源は増やさない）。uLamp＝夜の度合い（0〜1。sky() が更新）。窓ごとの aLamp（0〜1）が uLamp 以下なら点く（2 以上は消えたまま）。
    // 夕方から家ごとにずれて点き、朝にずれて消える。暖かい色（黄〜橙）。InstancedMesh の geometry に aLamp（InstancedBufferAttribute）を足して使う
    const LAMPU = { value: 0 };
    function windowMat(base) {
      const m = new T.MeshLambertMaterial({ color: base });
      m.onBeforeCompile = sh => {
        sh.uniforms.uLamp = LAMPU;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLamp;\nvarying float vLamp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLamp = aLamp;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLamp;\nvarying float vLamp;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  { float lit = step(vLamp, uLamp); totalEmissiveRadiance += lit * mix(vec3(1.0, 0.72, 0.28), vec3(1.0, 0.86, 0.5), fract(vLamp * 7.0)); }');
      };
      return m;
    }
    const SEAU_PROXY = { value: new T.Color(1, 1, 1) };   // 水（湖・川）の時刻の色合い（sky() が更新。海の uSeaMul と同じ）
    function water(color, flow) {
      const mat = new T.MeshLambertMaterial({ color, side: T.DoubleSide });
      mat.onBeforeCompile = sh => {
        sh.uniforms.uTime = GU.uTime; sh.uniforms.uWmul = SEAU_PROXY;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uWmul;\nvarying vec3 vWPos;' + NOISE_GLSL)
          .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= uWmul;
          { vec2 w = vWPos.xz; float fade = 1.0 - smoothstep(60.0, 220.0, length(vViewPosition));
            vec2 c1 = floor(w / 0.9); float tw = floor(uTime * 0.9 + rq_h(c1) * 7.0);
            float spark = step(0.94, rq_h(c1 + tw * 1.3)) * fade;
            vec2 q = floor(w / 1.2) * 1.2; float band = step(0.62, rq_n(q * 0.3 + vec2(${flow ? '0.0, uTime * 0.7' : 'uTime * 0.15, uTime * 0.1'})));
            diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.1 * band * fade), vec3(0.93, 0.98, 1.0), spark * 0.55); }`);
      };
      return mat;
    }
    const hemi = new T.HemisphereLight(0xdfefff, 0x4a5a3a, 0.85); scene.add(hemi);
    const sun = new T.DirectionalLight(0xffffff, 0.75); sun.position.set(-1, 1.6, 0.6); scene.add(sun);
    // 空（RQ.tod の時刻で、空の色・太陽・月・雲・霧・光の色が変わる。ui/sky.js）。hemiBase・sunBase：外（トンネルの外）での光の強さ
    const SK = root.RQ.sky && root.RQ.tod ? root.RQ.sky.create(T, scene, { light }) : null;
    let hemiBase = 0.85, sunBase = 0.75;
    // トンネルの中の、溶岩の照り返し（主人公のまわりを赤く照らす）。外では 0。はじめから置いておく（あとで足すと、材質の作り直しで止まる）
    const lavaLight = new T.PointLight(0xff6020, 0, 16, 1); scene.add(lavaLight);

    // 本物の標高での斜面の急さ（となりのマスとの差 ÷ 距離）
    const E = (r, c) => Math.max(0, isl.elev[Math.max(0, Math.min(R - 1, r))][Math.max(0, Math.min(C - 1, c))]);
    const slope = (r, c) => Math.max(Math.abs(E(r, c + 1) - E(r, c - 1)), Math.abs(E(r + 1, c) - E(r - 1, c))) / (2 * cell);
    // 地形：格子の頂点に高さと色。海のマスは少し沈めて浜が水に入るようにする
    let landMat = null, landCol = null, landMats = null;   // 地形の材質と、頂点の色・材質の重み（トンネルの山も同じ材質・同じ色で作る）
    {
      const pos = new Float32Array(R * C * 3), col = new Float32Array(R * C * 3), idx = [];
      const color = new T.Color();
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const e = isl.elev[r][c], i = r * C + c;
        pos[i * 3] = c * cell; pos[i * 3 + 1] = SM[i]; pos[i * 3 + 2] = r * cell;
        // 地面の色：浜は砂、低いところは草、山腹は森、急な斜面は岩、高いところは火山の焼け石、火口のまわりは黒い溶岩（分け方は game/groundclass.js。地図の絵と同じ）
        const sl = slope(r, c);
        color.set(GC.classify(e, sl).color);
        const j = 0.88 + rnd() * (sl > 0.65 || e > 470 ? 0.3 : 0.18);   // 色のむら（岩場は強め）
        col[i * 3] = color.r * j; col[i * 3 + 1] = color.g * j; col[i * 3 + 2] = color.b * j;
      }
      for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) {
        const a = r * C + c, b = a + 1, d = a + C, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      const mats = new Float32Array(R * C * 4);   // 材質の重み（草・岩・灰・砂。残りは土）。模様の出し分けに使う
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const e = isl.elev[r][c], m = GC.classify(e, slope(r, c)).mat, i = (r * C + c) * 4;
        mats[i] = m[0]; mats[i + 1] = m[1]; mats[i + 2] = m[2]; mats[i + 3] = m[3];
      }
      // 道の中心の点（3 m ごと）と、その高さ（中心の地形の高さを、前後 ±9 m でならしたもの。坂の上り下りはそのまま）
      const SAMP = [], ENDS = [];   // { x, z, y }。ENDS：道の両端の点（SAMP の中の同じもの）
      const smoothS0 = t => t * t * (3 - 2 * t);
      const CLIFFP = []; for (const cl of ((root.RQ.mapData.features || {}).cliffs || [])) for (const p of cl.pts) CLIFFP.push([p[1] * cell, p[0] * cell, (cl.inland_m || 80) + 60]);   // 断崖の点（x, z, 影響する半径 m）
      const nearCliff = (x, z) => { for (const q of CLIFFP) if (Math.hypot(x - q[0], z - q[1]) < q[2]) return true; return false; };
      let clampN = 0; const CL = {};   // 上の「データの標高から 2 m 以上はなれない」で、しぼった点の数（テスト用。道ごと）
      const TUNS = new Map((net.tunnels || []).map(t => [t.road, t]));
      const eleAtRoad = (road, sv) => { const P = road.points; let k = 0; while (k < P.length - 2 && P[k + 1][3] < sv) k++; const t = Math.max(0, Math.min(1, (sv - P[k][3]) / ((P[k + 1][3] - P[k][3]) || 1))); return P[k][2] * (1 - t) + P[k + 1][2] * t; };   // 道の標高（実標高×0.2）を、道の上の距離 sv m で
      {
        for (const road of net.roads) {
          const Q = road.points.map(p => [toX(p[1]), toZ(p[0])]), S = [Q[0]], sS = [road.points[0][3]];   // sS：S の各点の、道の上の距離 s（道の点の s。トンネルの区間 sa・sb と同じ物差し。横の長さの足し算だと標高ぶん短く、口が 9 m ずれた）
          for (let i = 1; i < Q.length; i++) {
            const p0 = Q[i - 1], q = Q[i], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p0[0], q[1] - p0[1]) / 3));
            for (let k = 1; k <= n; k++) { S.push([p0[0] + (q[0] - p0[0]) * k / n, p0[1] + (q[1] - p0[1]) * k / n]); sS.push(road.points[i - 1][3] + (road.points[i][3] - road.points[i - 1][3]) * k / n); }
          }
          const y0 = S.map(p => groundBase(p[0], p[1]));
          const YY = [], TUN = [], IN = [];   // IN：トンネルの区間の中（道の切り盛りの点にしない。屋根は TUNH）。YY・TUN は S と同じ並び（2026-10-27：区間の中を抜かして並びがずれ、区間のあとの道の高さが 200 m 先の値や NaN になっていた）
          const eD0 = sS.map(sv => eleAtRoad(road, sv) * VIEW_UP), eDs = eD0.map((_, i) => { let sw = 0, sy = 0; for (let k = -6; k <= 6; k++) { const j = i + k; if (j < 0 || j >= eD0.length) continue; const w = 7 - Math.abs(k); sw += w; sy += w * eD0[j]; } return sy / sw; });   // 道のデータの標高（前後 ±18 m でならしたもの）
          for (let i = 0; i < S.length; i++) {
            let sw = 0, sy = 0;
            for (let k = -3; k <= 3; k++) { const j = i + k; if (j < 0 || j >= S.length) continue; const w = 4 - Math.abs(k); sw += w; sy += w * y0[j]; }
            let yy = sy / sw;
            // 道の高さが、地形（断崖などで持ち上がったもの）につられて、道のデータの標高（roads.json の ele × VIEW_UP。前後 ±18 m でならしたもの）から大きくはなれる所は、データの標高へ寄せる（2026-10-26 ユーザー指摘：西の白い断崖のあたりで、ものすごく急なアップダウン）。はなれが 1 m まではそのまま、3 m 以上は完全にデータの標高。あとで前後 ±9 m でならす
            // 断崖のまわりだけ（ほかの道は、今までどおり地形の高さ）
            { const eD = eDs[i], dv = yy - eD, w = nearCliff(S[i][0], S[i][1]) ? Math.max(0, Math.min(1, (Math.abs(dv) - 1) / 2)) : 0; if (w > 0) { yy = yy * (1 - w) + eD * w; clampN++; (CL[road.name] = CL[road.name] || { n: 0, mx: 0 }).n++; CL[road.name].mx = Math.max(CL[road.name].mx, Math.abs(dv)); } }
            // トンネル（net.tunnels）：区間の中は、道の面を、道の標高（両端を結ぶ線）にする。地面の下に深く入る所（地形が 4 m 以上高い）は切り盛りせず、尾根はそのまま。口のそばは、これまでどおり切り通し
            const tn = TUNS.get(road.name); let inTun = false;
            if (tn) {
              const sI = sS[i];
              if (sI > tn.sa - 40 && sI < tn.sb + 40) {
                inTun = true; yy = eleAtRoad(road, sI) * VIEW_UP;
                if (sI >= tn.sa && sI <= tn.sb) { const k = Math.floor(S[i][0] / 6) + ',' + Math.floor(S[i][1] / 6); (TUNH.get(k) || TUNH.set(k, []).get(k)).push({ x: S[i][0], z: S[i][1], y: yy, e: Math.min(sI - tn.sa, tn.sb - sI) }); YY.push(yy); TUN.push(true); IN.push(true); continue; }
              }
            }
            YY.push(yy); TUN.push(inTun); IN.push(false);
          }
          for (let i = 0; i < S.length; i++) {   // 道の高さを、前後 ±9 m でならす（トンネルの区間は、そのまま）
            if (IN[i]) continue;
            let y2 = YY[i];
            if (!TUN[i]) { let sw = 0, sy = 0; for (let k = -3; k <= 3; k++) { const j = i + k; if (j < 0 || j >= S.length || TUN[j]) continue; const w = 4 - Math.abs(k); sw += w; sy += w * YY[j]; } if (sw) y2 = sy / sw; }
            SAMP.push({ x: S[i][0], z: S[i][1], y: y2 });
            if (i === 0 || i === S.length - 1) ENDS.push(SAMP[SAMP.length - 1]);
          }
        }
      }
      // 分かれ道：集まる道ごとに高さが違うと、切り盛りの面が道の横で傾き、道の片側が地面から浮いた（2026-10-27 ユーザー指摘：カブト岩の坂で 2.6 m）。
      // 道の端の点を 10 m 以内でまとめ、その平均の高さへ、6 m までは全部、24 m でもとの高さへ寄せる
      { const NODES = [];
        for (const e of ENDS) { let nd = NODES.find(q => Math.hypot(q.x - e.x, q.z - e.z) < 10); if (!nd) NODES.push(nd = { x: e.x, z: e.z, sy: 0, n: 0 }); nd.sy += e.y; nd.n++; }
        for (const nd of NODES) { if (nd.n < 2) continue; const y = nd.sy / nd.n;
          for (const p of SAMP) { const d = Math.hypot(p.x - nd.x, p.z - nd.z); if (d >= 24) continue; const w = d <= 6 ? 1 : 1 - smoothS0((d - 6) / 18); p.y = p.y * (1 - w) + y * w; } } }
      if (root.__rq) { root.__rq.roadClamp = clampN; root.__rq.roadClampBy = CL; }
      const CORE = 3, REACH = 11;   // 道の中心から 3 m までは水平な道の面、11 m で元の地形にもどる
      const kern = d => { if (d <= CORE) return 1; if (d >= REACH) return 0; const t = (d - CORE) / (REACH - CORE); return 1 - t * t * (3 - 2 * t); };
      const bucket = new Map(), BK = REACH;
      SAMP.forEach((p, i) => { const key = Math.floor(p.x / BK) + ',' + Math.floor(p.z / BK); let l = bucket.get(key); if (!l) bucket.set(key, l = []); l.push(i); });
      // 切り盛りの量：その場所で、近い道の点の高さの重み平均へ寄せる強さ（いちばん近い点の重み）。つなぎ目なく変わる
      // 平らにならす所（2026-10-23：湖の底、のちに街の台）：中心から r m までは高さ y（3D の単位）、そこから fall m でもとの地形へ
      const F = root.RQ.mapData.features || {}, FLATS = [];
      if (F.onsen) FLATS.push({ x: F.onsen.center[1] * cell, z: F.onsen.center[0] * cell, r: 16, fall: 55, y: Math.max(0, isl.elev[Math.round(F.onsen.center[0])][Math.round(F.onsen.center[1])]) * vs });
      // 東の街（城下町。ベネチア風）：海べりの低い台（甲板の高さ deck_y）。矩形（街の中心からの m）と、そのまわり fall_m でもとの地形へ。奥の丘の白妙城にも小さな台
      const CITY = (F.towns || []).find(t => t.style === 'venice'), CANALS = [];
      if (CITY) {
        const cx = CITY.center[1] * cell, cz = CITY.center[0] * cell, rm = CITY.rect_m;
        FLATS.push({ rect: [cx + rm[0], cz + rm[1], cx + rm[2], cz + rm[3]], fall: CITY.fall_m, y: CITY.deck_y, city: true });
        for (const c of CITY.canals) CANALS.push([cx + c[0], cz + c[1], cx + c[2], cz + c[3]]);
      }
      const smoothS = t => t * t * (3 - 2 * t);
      { const pl = (root.RQ.mapData.landmarks || []).find(l => l.id === 'palace1'); if (pl) FLATS.push({ x: pl.c * cell, z: pl.r * cell, r: 30, fall: 36, y: Math.max(0, isl.elev[Math.round(pl.r)][Math.round(pl.c)]) * vs + 20 }); }   // 白妙城の台（2026-10-24 ユーザー判断 B：20 m 高くして、家並みの上に塔が見えるように）
      const flatW = (f, x, z) => {   // 平らにならす所の強さ（円 {x,z,r,fall} か 矩形 {rect,fall}）
        const d = f.rect ? Math.hypot(Math.max(f.rect[0] - x, 0, x - f.rect[2]), Math.max(f.rect[1] - z, 0, z - f.rect[3])) : Math.max(0, Math.hypot(x - f.x, z - f.z) - f.r);
        return d <= 0 ? 1 : d >= f.fall ? 0 : 1 - smoothS(d / f.fall);
      };
      let LAKEP = null;   // 二見湖（features.json）：輪郭の多角形と、底の高さ
      if (F.lake && F.lake.outline) { const pp = F.lake.outline.map(q => [q[1] * cell, q[0] * cell]); LAKEP = { p: pp, y: (F.lake.level_m - 7) * vs, x0: Math.min(...pp.map(q => q[0])) - 50, x1: Math.max(...pp.map(q => q[0])) + 50, z0: Math.min(...pp.map(q => q[1])) - 50, z1: Math.max(...pp.map(q => q[1])) + 50 }; }
      // 東の街の台の中の道は、台の高さに合わせる（街の中で道が地面に埋もれたり浮いたりしない。走る標高は本物の地形のまま）
      for (const f of FLATS) { if (!f.city) continue; for (const p of SAMP) { const w = flatW(f, p.x, p.z); if (w > 0) p.y = p.y * (1 - w) + f.y * w; } }   // 台の中の道は台の高さ（deck_y）に
      // 白妙城の大通り（門から城下町の入口まで。features-view.js が白い石の帯を敷く）：道と同じに、帯の下の地形を切り盛りして水平にならす（山の肌が帯を突き抜けないように。2026-10-25 ユーザー指摘）。帯の高さは、両はしの高さを結ぶ線（中の起伏は、前後 ±9 m の平均でならす）
      { const PF = FLATS.find(f => f.x != null && f.r === 30 && f.fall === 36), pl = (root.RQ.mapData.landmarks || []).find(l => l.id === 'palace1'), tw = (((root.RQ.mapData.features || {}).towns || []).find(t => t.id === 'east'));
        if (pl && tw) {
          const px = pl.c * cell, pz = pl.r * cell, x0 = px + 28, x1 = tw.center[1] * cell + tw.rect_m[0], z1 = tw.center[0] * cell, n = Math.max(2, Math.ceil(Math.abs(x1 - x0) / 3)), BL = [];
          for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = pz + (z1 - pz) * t; let m = -1e9; for (let o = -6; o <= 6; o += 3) m = Math.max(m, groundBase(x, z + o)); const w = PF ? flatW(PF, x, z) : 0; BL.push({ x, z, y: m * (1 - w) + (PF ? PF.y : 0) * w }); }   // 帯の高さ＝横断面の高い側（掘り込まず、低い側を盛って面を作る。山の肌が帯を突き抜けない）
          BL.forEach((q, i) => { let sw = 0, sy = 0; for (let k = -3; k <= 3; k++) { const j = i + k; if (j < 0 || j >= BL.length) continue; const w = 4 - Math.abs(k); sw += w; sy += w * BL[j].y; } for (const off of [0, -5, 5]) SAMP.push({ x: q.x, z: q.z + off, y: sy / sw }); });   // 帯の両側（±5・±9 m）にも同じ高さの点を並べ、水平な面を幅 13 m ほどに広げる
        } }
      // トンネルの屋根（2026-10-24）：区間の中は、地形を、筒の天井（道の面 + 7.7 m）の 1.2 m 上まで持ち上げる（足りない所だけ。尾根が低い・平らな峠でも、筒の中に地面が入りこまず、天井もつぶれない）。道の中心から 6 m までは全量、14 m でもとの地形へ
      const ROOF_UP = 8.9, ROOF_FULL = 6, ROOF_FALL = 14;
      const tunnelRoof = (x, z) => {
        if (!TUNH.size) return null;
        const bx = Math.floor(x / 6), bz = Math.floor(z / 6); let best = null, bd = ROOF_FALL * ROOF_FALL;
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const l = TUNH.get((bx + i) + ',' + (bz + j)); if (!l) continue; for (const q of l) { const dd = (q.x - x) ** 2 + (q.z - z) ** 2; if (dd < bd) { bd = dd; best = q; } } }
        if (!best) return null;
        const roofY = best.y + ROOF_UP, nat = groundBase(x, z); if (nat >= roofY) return null;
        const d = Math.sqrt(bd), w = (d <= ROOF_FULL ? 1 : 1 - smoothS((d - ROOF_FULL) / (ROOF_FALL - ROOF_FULL))) * smoothS(Math.min(1, best.e / 4));   // 口から 4 m は持ち上げを弱める（口の外の道の面が屋根につられて持ち上がり、出口で主人公が跳ねた。2026-10-27。口の中の地形は、地形の材質で抜く＝uTunP）
        return [roofY, w];
      };
      // 川筋（2026-10-24 ユーザー指摘：川が斜面にぶつかって消える）：川の線のまわりを、川の幅の半分＋0.8 m まで、もとの地形より 1.1 m 掘り下げる（そこから 3.5 m でもとにもどす）。斜面でも川が地面に埋もれず、谷を流れ下りる
      const RIV = new Map(), RIV_CUT = 1.1, RIV_EDGE = 3.5;
      for (const rv of (F.rivers || [])) {
        const P = rv.pts.map(q => [q[1] * cell, q[0] * cell]), Wp = rv.widths || rv.pts.map(() => rv.width_m);
        for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
          for (let k = 0; k <= n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, key = Math.floor(x / 6) + ',' + Math.floor(z / 6); (RIV.get(key) || RIV.set(key, []).get(key)).push([x, z, (Wp[i] + (Wp[i + 1] - Wp[i]) * t) / 2 + 0.8]); } }
      }
      const riverCut = (x, z) => {
        if (!RIV.size) return null;
        const bx = Math.floor(x / 6), bz = Math.floor(z / 6); let bd = 1e9, hw = 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = RIV.get((bx + i) + ',' + (bz + j)); if (!l) continue; for (const q of l) { const d = Math.hypot(q[0] - x, q[1] - z) - q[2]; if (d < bd) { bd = d; hw = q[2]; } } }
        if (bd >= RIV_EDGE) return null;
        const w = bd <= 0 ? 1 : 1 - smoothS(bd / RIV_EDGE); return [groundBase(x, z) - RIV_CUT, w];
      };
      const target = (x, z) => {
        const bx = Math.floor(x / BK), bz = Math.floor(z / BK);
        let wmax = 0, sw = 0, sy = 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const l = bucket.get((bx + i) + ',' + (bz + j)); if (!l) continue;
          for (const n of l) { const p = SAMP[n], k = kern(Math.hypot(p.x - x, p.z - z)); if (k <= 0) continue; if (k > wmax) wmax = k; const w = k * k * k * k; sw += w; sy += w * p.y; }
        }
        let res = wmax > 0 ? [sy / sw, wmax] : null;
        if (LAKEP && x > LAKEP.x0 && x < LAKEP.x1 && z > LAKEP.z0 && z < LAKEP.z1) {
          const P = LAKEP.p; let inside = false, dmin = 1e9;
          for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
            const ax = P[j][0], az = P[j][1], bx2 = P[i][0], bz2 = P[i][1];
            if ((az > z) !== (bz2 > z) && x < (bx2 - ax) * (z - az) / (bz2 - az) + ax) inside = !inside;
            const vx = bx2 - ax, vz = bz2 - az, l2 = vx * vx + vz * vz || 1e-9, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)); dmin = Math.min(dmin, Math.hypot(x - ax - vx * t, z - az - vz * t));
          }
          // 湖の底：輪郭の中は水面より 7 m 低く、外は 20 m でもとの地形へ（2026-10-27：湖を地形の高さに合わせて下げたので、高い側は岸の崖になる。外の削りは道の切り盛りの中には入れない＝湖畔の道が細い土手の上に乗らない）
          const w = inside ? 1 : dmin >= 20 ? 0 : 1 - smoothS(dmin / 20);
          if (w > 0 && (inside || !res || res[1] < 0.3) && (!res || w > res[1])) res = [LAKEP.y, w];
        }
        for (const f of FLATS) { const w = flatW(f, x, z); if (w > 0 && (!res || w > res[1])) res = [f.y, w]; }
        for (const c of CANALS) {   // 運河：幅 8 m の溝（底は水面より 1.4 下）。岸は 2.5 m でもとの高さへ
          const dd = Math.hypot(Math.max(c[0] - x, 0, x - c[2]), Math.max(c[1] - z, 0, z - c[3])); if (dd >= 2.5) continue;
          res = [-1.4, dd <= 0 ? 1 : 1 - smoothS(dd / 2.5)];
        }
        { const tr = tunnelRoof(x, z); if (tr && (!res || tr[1] > res[1])) res = tr; }
        if (!res || res[1] < 0.2) { const rc = riverCut(x, z); if (rc && (!res || rc[1] > res[1])) res = rc; }
        return res;
      };
      // 切り盛りするマス：道の点から REACH 以内にかかるマス
      const cellSet = new Set();
      for (const p of SAMP) {
        const c0 = Math.max(0, Math.floor((p.x - REACH) / cell)), c1 = Math.min(C - 2, Math.floor((p.x + REACH) / cell));
        const r0 = Math.max(0, Math.floor((p.z - REACH) / cell)), r1 = Math.min(R - 2, Math.floor((p.z + REACH) / cell));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cellSet.add(r * C + c);
      }
      for (const l of RIV.values()) for (const q of l) {   // 川筋のまわりのマスも刻む
        const c0 = Math.max(0, Math.floor((q[0] - 8) / cell)), c1 = Math.min(C - 2, Math.floor((q[0] + 8) / cell)), r0 = Math.max(0, Math.floor((q[1] - 8) / cell)), r1 = Math.min(R - 2, Math.floor((q[1] + 8) / cell));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cellSet.add(r * C + c);
      }
      for (const l of TUNH.values()) for (const q of l) {   // トンネルの屋根のまわりのマスも刻む
        const c0 = Math.max(0, Math.floor((q.x - ROOF_FALL) / cell)), c1 = Math.min(C - 2, Math.floor((q.x + ROOF_FALL) / cell)), r0 = Math.max(0, Math.floor((q.z - ROOF_FALL) / cell)), r1 = Math.min(R - 2, Math.floor((q.z + ROOF_FALL) / cell));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cellSet.add(r * C + c);
      }
      if (LAKEP) for (let r = Math.max(0, Math.floor(LAKEP.z0 / cell)); r <= Math.min(R - 2, Math.floor(LAKEP.z1 / cell)); r++) for (let c = Math.max(0, Math.floor(LAKEP.x0 / cell)); c <= Math.min(C - 2, Math.floor(LAKEP.x1 / cell)); c++) cellSet.add(r * C + c);
      for (const f of FLATS) {   // 平らにならす所のまわりのマスも刻む
        const bb = f.rect ? [f.rect[0] - f.fall - 4, f.rect[1] - f.fall - 4, f.rect[2] + f.fall + 4, f.rect[3] + f.fall + 4] : [f.x - f.r - f.fall - 4, f.z - f.r - f.fall - 4, f.x + f.r + f.fall + 4, f.z + f.r + f.fall + 4];
        const c0 = Math.max(0, Math.floor(bb[0] / cell)), c1 = Math.min(C - 2, Math.floor(bb[2] / cell)), r0 = Math.max(0, Math.floor(bb[1] / cell)), r1 = Math.min(R - 2, Math.floor(bb[3] / cell));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cellSet.add(r * C + c);
      }
      {
        const W = NSUB + 1, cells = [...cellSet].sort((a, b) => a - b), cidx = new Int32Array(R * C).fill(-1), hg = new Float32Array(cells.length * W * W);
        const sp = [], sc = [], sm = [];   // 刻んだマスの三角形（位置・色・材質）
        const col4 = (arr, n, r, c, fc, fr) => {   // 格子の頂点の値を、マスの中で内挿する（a,b,d,e と同じ三角形の割り方）
          const i = (r * C + c) * n, ib = i + n, id = i + C * n, ie = id + n, o = [];
          for (let k = 0; k < n; k++) o.push(fc + fr <= 1 ? arr[i + k] + (arr[ib + k] - arr[i + k]) * fc + (arr[id + k] - arr[i + k]) * fr
            : arr[ie + k] + (arr[id + k] - arr[ie + k]) * (1 - fc) + (arr[ib + k] - arr[ie + k]) * (1 - fr));
          return o;
        };
        cells.forEach((cc, n) => {
          const r = Math.floor(cc / C), c = cc % C, base = n * W * W, vm = new Float32Array(W * W), cvx = [], mvx = [];
          cidx[cc] = base;
          for (let i = 0; i < W; i++) for (let j = 0; j < W; j++) {
            const x = (c + j / NSUB) * cell, z = (r + i / NSUB) * cell, fc = j / NSUB, fr = i / NSUB;
            const gm = surf(x, z, gridM), gg = surf(x, z, gridG);
            const tg = target(x, z);   // [道の高さ, 寄せる強さ]。道から遠ければ null（元の面のまま）
            hg[base + i * W + j] = tg ? gg + (tg[0] - gg) * tg[1] : gg;
            vm[i * W + j] = tg ? gm + (tg[0] - gm) * tg[1] : gm;
            cvx.push(col4(col, 3, r, c, fc, fr)); mvx.push(col4(mats, 4, r, c, fc, fr));
          }
          for (let i = 0; i < NSUB; i++) for (let j = 0; j < NSUB; j++) {
            const q = i * W + j;
            for (const t of [[q, q + W, q + 1], [q + 1, q + W, q + W + 1]]) for (const v of t) {
              const ii = Math.floor(v / W), jj = v % W;
              sp.push((c + jj / NSUB) * cell, vm[v], (r + ii / NSUB) * cell);
              sc.push(...cvx[v]); sm.push(...mvx[v]);
            }
          }
        });
        carve.idx = cidx; carve.h = hg;
        // 刻んだマスは、元の三角形をやめる
        const keep = [];
        for (let k = 0; k < idx.length; k += 6) { const cc = Math.floor(idx[k] / C) * C + idx[k] % C; if (!cellSet.has(cc)) keep.push(idx[k], idx[k + 1], idx[k + 2], idx[k + 3], idx[k + 4], idx[k + 5]); }
        idx.length = 0; for (const v of keep) idx.push(v);
        carve.geo = { pos: new Float32Array(sp), col: new Float32Array(sc), mats: new Float32Array(sm) };
      }
      g.setAttribute('aMat', new T.BufferAttribute(mats, 4));
      g.setIndex(idx);
      landCol = col; landMats = mats;
      landMat = new T.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const land = new T.Mesh(g.toNonIndexed(), patchLand(landMat));
      land.geometry.computeVertexNormals();
      if (carve.geo) {
        const cg = new T.BufferGeometry();
        cg.setAttribute('position', new T.BufferAttribute(carve.geo.pos, 3)); cg.setAttribute('color', new T.BufferAttribute(carve.geo.col, 3)); cg.setAttribute('aMat', new T.BufferAttribute(carve.geo.mats, 4));
        cg.computeVertexNormals();
        scene.add(new T.Mesh(cg, landMat));
        carve.geo = null;
      }
      // 格子の (0,0) が lat0/lon0。3D の原点も lat0/lon0 にそろえる
      scene.add(land);
    }
    // 海（2026-10-23 ユーザー要望）：岸からの距離（深さの目安）で色を段にする（浅い所は明るく、沖は濃く）、沖にちらちら動く白い波頭のドット、
    // 岸に寄せる白い波の線、時刻の色（夜は暗い海に月の光の筋）。魚の影と跳ねる魚は ui/sealife.js。岸からの距離は、格子の海のマスの 8 ビットの絵（uDepth。0〜160 m）
    const seaDepth = new Uint8Array(R * C), seaM = new Float32Array(R * C);   // seaM：海のマスから陸までの距離（m）
    {
      const INF = 1e9, d = new Float32Array(R * C);
      for (let i = 0; i < R * C; i++) d[i] = SM[i] > 0 ? 0 : INF;   // 陸＝なめらかにした岸の内側
      const rel = (r, c, v) => { if (r < 0 || c < 0 || r >= R || c >= C) return; const k = r * C + c; if (v < d[k]) d[k] = v; };
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const k = r * C + c; if (d[k] === 0) continue; rel(r, c, Math.min(d[k], (r ? d[k - C] + 1 : INF), (c ? d[k - 1] + 1 : INF), (r && c ? d[k - C - 1] + 1.414 : INF), (r && c < C - 1 ? d[k - C + 1] + 1.414 : INF))); }
      for (let r = R - 1; r >= 0; r--) for (let c = C - 1; c >= 0; c--) { const k = r * C + c; if (d[k] === 0) continue; rel(r, c, Math.min(d[k], (r < R - 1 ? d[k + C] + 1 : INF), (c < C - 1 ? d[k + 1] + 1 : INF), (r < R - 1 && c < C - 1 ? d[k + C + 1] + 1.414 : INF), (r < R - 1 && c ? d[k + C - 1] + 1.414 : INF))); }
      for (let pass = 0; pass < 2; pass++) { const t = Float32Array.from(d); for (let r = 1; r < R - 1; r++) for (let c = 1; c < C - 1; c++) { const k = r * C + c; if (d[k] === 0 || d[k] >= INF) continue; let sv = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) sv += Math.min(d[k + dr * C + dc], 9999); t[k] = Math.max(0.5, sv / 9); } d.set(t); }   // 距離の階段を 3×3 でならす
      for (let i = 0; i < R * C; i++) { const m = Math.min(d[i], 9999) * cell; seaM[i] = m; seaDepth[i] = Math.min(255, Math.round(m / 160 * 255)); }
    }
    const seaTex = new T.DataTexture(seaDepth, C, R, T.RedFormat, T.UnsignedByteType);
    seaTex.minFilter = seaTex.magFilter = T.LinearFilter; seaTex.unpackAlignment = 1; seaTex.needsUpdate = true;
    const SEAU = { uTime: GU.uTime, uDepth: { value: seaTex }, uGrid: { value: new T.Vector3(cell, C, R) }, uSeaMul: { value: new T.Color(1, 1, 1) },
      uGlintDir: { value: new T.Vector3(1, 0, 0) }, uGlintCol: { value: new T.Color(1, 1, 1) }, uGlint: { value: 0 } };
    {
      const mat = new T.MeshLambertMaterial({ color: SEA });
      mat.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, SEAU);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform sampler2D uDepth; uniform vec3 uGrid; uniform vec3 uSeaMul; uniform vec3 uGlintDir; uniform vec3 uGlintCol; uniform float uGlint;\nvarying vec3 vW;' + NOISE_GLSL)
          .replace('#include <color_fragment>', `#include <color_fragment>
          float rqGlint = 0.0;
          {
            vec2 w = vW.xz, tuv = vec2((w.x / uGrid.x + 0.5) / uGrid.y, (w.y / uGrid.x + 0.5) / uGrid.z);
            float dm = (tuv.x < 0.0 || tuv.x > 1.0 || tuv.y < 0.0 || tuv.y > 1.0) ? 160.0 : texture2D(uDepth, tuv).r * 160.0;
            float dist = length(vViewPosition);
            // 深さの段（浅い所は明るい水色、沖は濃い青。段のさかいは少しゆらす）
            float bd = dm + (rq_h(floor(w / 2.5)) - 0.5) * 9.0;
            vec3 col = bd < 14.0 ? vec3(0.42, 0.78, 0.84) : bd < 42.0 ? vec3(0.27, 0.6, 0.78) : bd < 95.0 ? vec3(0.18, 0.44, 0.66) : vec3(0.12, 0.31, 0.53);
            diffuseColor.rgb = col * uSeaMul;
            // 沖の白い波頭：ちらちら現れては消えるドット（近くは細かく、遠くは大きなドットで少し）
            vec2 c1 = floor(w / 2.2); float tw = floor(uTime * 0.8 + rq_h(c1) * 9.0);
            float on = step(0.972, rq_h(c1 + tw * 1.7)) * (1.0 - smoothstep(30.0, ${light ? '70.0' : '120.0'}, dist));
            vec2 c2 = floor(w / 7.0); float tw2 = floor(uTime * 0.5 + rq_h(c2) * 9.0);
            float on2 = step(0.972, rq_h(c2 + tw2 * 3.1 + 11.0)) * smoothstep(60.0, 160.0, dist) * (1.0 - smoothstep(300.0, 900.0, dist));
            vec3 vd0 = normalize(vW - cameraPosition);
            float graze = smoothstep(0.03, 0.2, -vd0.y);   // 水面を見る角度：浅い（低い所から遠くを見る）ほど 0。高い所から見下ろすほど 1
            // 低い視点で遠くを見ると、白いドットが水平線に向かって詰まり、海が全部白く見える。角度が浅いほど・遠いほど間引き、暗くする（2026-10-24 ユーザー判断。高い所の見え方は今のまま）
            float thin = mix(0.12 + 0.88 * (1.0 - smoothstep(40.0, 260.0, dist)), 1.0, graze);
            float crest = max(on, on2) * (0.55 + 0.45 * smoothstep(6.0, 40.0, dm)) * step(rq_h(floor(w / 3.1) + 5.0), thin) * mix(0.55 + 0.45 * thin, 1.0, graze);
            // 岸に寄せる白い波の線：岸へ向かって動く線を、ところどころ切れた形で（岸から 34 m まで）
            float ph = dm / 4.2 + uTime * 0.3, line = step(fract(ph), 0.09) * (1.0 - smoothstep(8.0, 26.0, dm)) * step(0.5, rq_n(floor(w / 3.0) * 0.5 + floor(ph) * 7.0)) * step(1.5, dm);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.99, 1.0) * mix(vec3(1.0), uSeaMul, 0.6), max(crest * 0.9, line * 0.9));
            // 太陽・月の光の筋：光のほうを見ると、水面がちらちら光る
            vec3 vd = normalize(vW - cameraPosition); vec2 hz = normalize(vd.xz + vec2(1e-5)), lz = normalize(uGlintDir.xz + vec2(1e-5));
            float al = dot(hz, lz), g = smoothstep(mix(0.985, 0.955, graze), 1.0, al) * (0.35 + 0.65 * smoothstep(25.0, 140.0, dist)) * (1.0 - smoothstep(600.0, 2500.0, dist));
            vec2 c3 = floor(w / 1.2);
            rqGlint = g * mix(0.45, 1.0, graze) * step(0.5, rq_h(c3 + floor(uTime * 1.3 + rq_h(c3) * 5.0) * 2.3)) * uGlint;
          }`)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uGlintCol * rqGlint;');
      };
      const sea = new T.Mesh(new T.PlaneGeometry(30000, 30000), mat);
      sea.rotation.x = -Math.PI / 2; sea.position.set(C * cell / 2, 0, R * cell / 2); scene.add(sea);
    }
    // 海の生き物（魚影・跳ねる魚）。岸からの距離は、海のマスの距離の絵（seaM）から
    const seaAt = (x, z) => { const c = Math.round(x / cell), r = Math.round(z / cell); return c < 0 || r < 0 || c >= C || r >= R ? 160 : seaM[r * C + c]; };
    const SL = root.RQ.sealife ? root.RQ.sealife.create(T, scene, { light, seaAt }) : null;
    // テスト用：トンネルの中（口から 20 m 以上入った所）の、筒の天井（道の面 + 7.7 m）から地形の面までの余り（m）の最小値。0 以上なら、地面が筒の中に入りこんでいない
    root.__rq.tunnelClear = () => { let worst = 1e9; const TB = [[-5, 4], [-4.2, 5.9], [-2.4, 7.2], [0, 7.7], [2.4, 7.2], [4.2, 5.9], [5, 4]];
      for (const l of TUNH.values()) for (const q of l) if (q.e > 20) for (const [u, v] of TB) { worst = Math.min(worst, groundMesh(q.x + u, q.z) - (q.y + v), groundMesh(q.x, q.z + u) - (q.y + v)); } return worst; };
    root.__rq.seaJump = () => { if (SL) SL.forceJump(); }; root.__rq.seaState = () => (SL ? SL.state() : null);   // テスト用
    // 運河を渡る道の橋の区間（東の街）：道が運河（矩形）を横切る所ごとに、橋の中心・向き・長さ。groundY がここで橋の面の高さ（deck＋hump）を返す
    const BRIDGES = [];
    {
      const CITYB = ((root.RQ.mapData.features || {}).towns || []).find(t => t.style === 'venice');
      if (CITYB) {
        const cx = CITYB.center[1] * cell, cz = CITYB.center[0] * cell;
        for (const road of net.roads) {
          const W = road.points.map(p => [toX(p[1]), toZ(p[0])]);
          for (const cn of CITYB.canals) {
            const x0 = cx + cn[0], z0 = cz + cn[1], x1 = cx + cn[2], z1 = cz + cn[3];
            let enter = null;
            for (let i = 1; i < W.length; i++) {
              const a = W[i - 1], b = W[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
              for (let k = 0; k <= n; k++) {
                const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n, inside = x > x0 && x < x1 && z > z0 && z < z1;
                if (inside && !enter) enter = [x, z, a, b];
                if (!inside && enter) {
                  const mx = (enter[0] + x) / 2, mz = (enter[1] + z) / 2, tx = x - enter[0], tz = z - enter[1], l = Math.hypot(tx, tz) || 1;
                  BRIDGES.push({ x: mx, z: mz, tx: tx / l, tz: tz / l, half: l / 2 + 5, len: l, deck: CITYB.deck_y, hump: 1.1 }); enter = null;
                }
              }
            }
          }
        }
        BRZ.push(...BRIDGES); root.__rq.bridges = BRIDGES;   // テスト用
      }
    }
    // 道：幅 3.2 m の帯を、地形より少し上に。道の網ぜんぶ（道ごとに点を並べて、1つの形にまとめる）。
    // 帯は 3 m ごとに細かく刻み、高さは中心の地面（道に合わせて切り盛りした面）に合わせる。左右は同じ高さ（横断面は水平）
    const P = [];   // 道の点（3D の座標）。物を置かない所の判定にも使う
    // 高架（立体交差。net.overpasses）：その前後で道の高さを持ち上げる量（3D の単位）。橋の上は一定、ふもとはなめらかに（見た目と、主人公・ゴーストの高さ）
    const liftS = (roadId, s) => {
      for (const o of net.overpasses || []) { if (o.road !== roadId) continue; const ds = Math.abs(s - o.s); if (ds >= o.half) continue; const t = ds <= 9 ? 0 : (ds - 9) / (o.half - 9); return o.lift * (1 - t * t * (3 - 2 * t)); }
      return 0;
    };
    root.__rq.liftS = liftS;
    const roadRibbon = (halfW, lift, out) => {
      for (const road of net.roads) {
        const Q = road.points.map(p => at3(p[0], p[1])), S = [[Q[0].x, Q[0].z]];   // S：刻み直した中心の点
        for (let i = 1; i < Q.length; i++) {
          const p0 = Q[i - 1], q = Q[i], n = Math.max(1, Math.ceil(Math.hypot(q.x - p0.x, q.z - p0.z) / 3));
          for (let k = 1; k <= n; k++) S.push([p0.x + (q.x - p0.x) * k / n, p0.z + (q.z - p0.z) * k / n]);
        }
        let sAcc = 0;
        for (let i = 0; i < S.length; i++) {
          if (i) sAcc += Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]);
          const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
          const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * halfW, nz = dx / l * halfW;
          const x1 = S[i][0] + nx, z1 = S[i][1] + nz, x2 = S[i][0] - nx, z2 = S[i][1] - nz;
          const yc = groundY(S[i][0], S[i][1]) + lift + liftS(road.id, sAcc);   // 横断面は水平：左右とも中心の高さ（高架の上は持ち上げる）
          if (out.skirt) {   // 土手：道のふちから外へ下りる帯（左右）。地面が道より低い所で、道が浮いて見えないように
            const sk = out.skirt, f = (halfW + sk.w) / halfW, X1 = S[i][0] + nx * f, Z1 = S[i][1] + nz * f, X2 = S[i][0] - nx * f, Z2 = S[i][1] - nz * f;
            out.pos.push(X1, yc - sk.drop, Z1, x1, yc, z1, x2, yc, z2, X2, yc - sk.drop, Z2);
            if (i) { const k = out.pos.length / 3 - 4, j = k - 4; out.idx.push(j, j + 1, k, j + 1, k + 1, k, j + 2, j + 3, k + 2, j + 3, k + 3, k + 2); }
          } else {
            out.pos.push(x1, yc, z1, x2, yc, z2);
            if (i) { const k = out.pos.length / 3 - 2; out.idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
          }
        }
      }
    };
    {
      const W = 1.6, main = { pos: [], idx: [] };
      for (const road of net.roads) P.push(...road.points.map(p => at3(p[0], p[1]).add(new T.Vector3(0, 0.6, 0))));
      roadRibbon(W, 0.35, main);
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(main.pos, 3)); g.setIndex(main.idx); g.computeVertexNormals();
      const m = new T.MeshLambertMaterial({ color: 0x8a6a48, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
      {   // 道のふち：ひと回り広い、濃い土の帯（踏みならされた土のふち）
        const edge = { pos: [], idx: [] };
        roadRibbon(W + 0.9, 0.25, edge);
        const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.Float32BufferAttribute(edge.pos, 3)); eg.setIndex(edge.idx); eg.computeVertexNormals();
        scene.add(new T.Mesh(eg, patchRoad(new T.MeshLambertMaterial({ color: 0x6b5238, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }), true)));
        // 土手（2026-10-27 ユーザー指摘：坂の途中や分かれ道で、道が地形から浮く）：ふちから外へ 1.8 m、下へ 2.4 m の斜めの土の帯。地面が高い所は地面の下に隠れる
        const bank = { pos: [], idx: [], skirt: { w: 1.8, drop: 2.4 } };
        roadRibbon(W + 0.9, 0.2, bank);
        const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(bank.pos, 3)); bg.setIndex(bank.idx); bg.computeVertexNormals();
        scene.add(new T.Mesh(bg, new T.MeshLambertMaterial({ color: 0x5e4a34, side: T.DoubleSide })));
        patchRoad(m);
      }
      scene.add(new T.Mesh(g, m));
    }
    // 道から 6m 以内と、ランドマークのまわりには、木や岩を置かない（ランドマークの配置は RQ.landmarks.place。ui/landmark-view.js が描く）
    const near = new Set(); P.forEach(p => near.add(Math.round(p.x / 6) + ',' + Math.round(p.z / 6)));
    const lmZone = (zx, zz, r) => {   // 半径 r m のまわりを、道と同じ「置かない」目印（6 m の格子）に入れる
      const n = Math.ceil(r / 6);
      for (let dx = -n; dx <= n; dx++) for (let dz = -n; dz <= n; dz++) { const cx = Math.round(zx / 6) + dx, cz = Math.round(zz / 6) + dz; if (Math.hypot(cx * 6 - zx, cz * 6 - zz) <= r) near.add(cx + ',' + cz); }
    };
    // トンネルの上の山（2026-10-23 ユーザー要望：筒が地形から飛び出さず、山の中に埋まった形に）。道の上を、道から +9.5 m の高さの平らな頂と、なだらかな両すそで、
    // 地形と同じ材質（岩の色）でおおう。すその高さは地形（切り盛り後）より低くならない（地形の高いところはそのまま地形が山になる）。
    // 入口と出口は、石の門（landmark-view.js）が口をあけている。中の道・主人公の足元は、地形（groundY）のまま
    function tunnelHill(p) {
      const path = p.path, n = path.length; if (!path || n < 2) return;
      const S = [[path[0].x, path[0].z]];   // 3 m ごとに刻み直す
      for (let i = 1; i < n; i++) { const a = path[i - 1], b = path[i], k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3)); for (let j = 1; j <= k; j++) S.push([a.x + (b.x - a.x) * j / k, a.z + (b.z - a.z) * j / k]); }
      const US = []; for (let u = -18; u <= 18.01; u += 2.4) US.push(+u.toFixed(2));
      const TOP = 9.5, FLAT = 6.5, SKIRT = 18, sm = t => t * t * (3 - 2 * t);
      const pos = [], col = [], mat = [], idx = [];
      for (let i = 0; i < S.length; i++) {
        const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l, yr = groundY(S[i][0], S[i][1]);
        for (const u of US) {
          const x = S[i][0] + nx * u, z = S[i][1] + nz * u, au = Math.abs(u), w = au <= FLAT ? 1 : 1 - sm((au - FLAT) / (SKIRT - FLAT));
          pos.push(x, Math.max(groundY(x, z), yr + TOP * w) + 0.04, z);
          // 色と材質は、まわりの地形のものをそのまま（山だけ浮かない）。頂ほど少し岩っぽく、暗く
          const gr = Math.max(0, Math.min(R - 1, Math.round(z / cell))), gc = Math.max(0, Math.min(C - 1, Math.round(x / cell))), vi = gr * C + gc, j = (0.9 + 0.2 * Math.abs(Math.sin(i * 12.9 + u * 7.3))) * (1 - 0.12 * w);
          col.push(landCol[vi * 3] * j, landCol[vi * 3 + 1] * j, landCol[vi * 3 + 2] * j);
          mat.push(landMats[vi * 4], Math.min(1, landMats[vi * 4 + 1] + 0.5 * w), landMats[vi * 4 + 2], landMats[vi * 4 + 3]);
        }
        if (i) for (let j = 0; j < US.length - 1; j++) { const k0 = (i - 1) * US.length + j, k1 = i * US.length + j; idx.push(k0, k0 + 1, k1, k0 + 1, k1 + 1, k1); }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('aMat', new T.Float32BufferAttribute(mat, 4));
      g.setIndex(idx); const ng = g.toNonIndexed(); ng.computeVertexNormals();
      const m = new T.Mesh(ng, landMat); m.material = landMat; scene.add(m);
    }
    try {
      const LM = root.RQ.landmarks;
      if (LM) {
        net.placed = net.placed || LM.place(net, isl, root.RQ.mapData.landmarks || []);
        let tunN = 0;
        for (const p of net.placed) {
          const r = { heliport: p.radius + 5, parking: 17, interchange: 5, observatory: 9, watertower: 8, school: 9, ferryport: 8 }[p.kind];
          if (r) lmZone(p.x, p.z, r);
          for (const q of p.portals || []) lmZone(q.x, q.z, 14);
          if (p.kind === 'tunnel') for (const q of p.path) lmZone(q.x, q.z, 18);   // トンネルの上の岩の尾根に、木や岩を生やさない
          if (p.kind === 'tunnel') {   // 筒の中心の線を、地形の材質へ（筒の中の地形を抜く。上の patchLand の uTunP）。14 m ごと、両端（口の外へのばした所の端）を含める
            const P2 = p.path, k = Math.max(1, Math.round(14 / ((p.length / Math.max(1, P2.length - 1)) || 4))), pick = [];
            for (let i = 0; i < P2.length - 1; i += k) pick.push(P2[i]); pick.push(P2[P2.length - 1]);
            pick.forEach((q, i) => { if (tunN >= TUN_N) return; GU.uTunP.value[tunN++].set(q.x, q.z, groundY(q.x, q.z), i < pick.length - 1 && tunN < TUN_N ? 1 : 0); });
          }
          // トンネルの上の山（tunnelHill）は、やめた（2026-10-24：本当に地面の下をくぐる。道の面は groundY の TUNH、地形は切り盛りしない）
          if (p.kind === 'town') for (const h of p.items) lmZone(h.x, h.z, 8);
          if (p.kind === 'breakwater' || p.kind === 'pier' || p.kind === 'ferryport') for (let d = 0; d <= p.length; d += 10) lmZone(p.x + Math.sin(p.yaw) * d, p.z + Math.cos(p.yaw) * d, 6);
        }
      }
    } catch (e) { console.warn('ランドマークの場所を決められなかった', e); }
    // 木や岩を置かない所：田畑・湖・川・温泉・橋のまわり（features.json）
    const FEAT_NO = [];
    { const F = root.RQ.mapData.features || {};
      for (const f of F.fields || []) FEAT_NO.push([f.center[1] * cell, f.center[0] * cell, Math.hypot(f.size_m[0], f.size_m[1]) / 2 + 3]);
      if (F.lake) for (const q of F.lake.outline) FEAT_NO.push([q[1] * cell, q[0] * cell, 22]);
      if (F.onsen) FEAT_NO.push([F.onsen.center[1] * cell, F.onsen.center[0] * cell, 26]);
      for (const rv of F.rivers || []) for (let i = 0; i < rv.pts.length; i++) FEAT_NO.push([rv.pts[i][1] * cell, rv.pts[i][0] * cell, 7]);
      for (const b of F.bridges || []) FEAT_NO.push([b.at[1] * cell, b.at[0] * cell, 12]);
      for (const it of (F.stones || {}).items || []) FEAT_NO.push([it.at[1] * cell, it.at[0] * cell, 9]);
      for (const it of F.rocks || []) FEAT_NO.push([it.at[1] * cell, it.at[0] * cell, it.m * 1.6]);   // 洞窟・ヒョウタン岩のまわりに木・岩・家を置かない
      for (const cl of F.cliffs || []) for (const p of cl.pts) FEAT_NO.push([p[1] * cell + 20, p[0] * cell, 34]); }
    const onFeature = (x, z) => { for (const q of FEAT_NO) if (Math.abs(x - q[0]) < q[2] && Math.abs(z - q[1]) < q[2] && Math.hypot(x - q[0], z - q[1]) < q[2]) return true; return false; };
    const onRoad = (x, z, k = 1) => { if (onFeature(x, z)) return true; for (let dx = -k; dx <= k; dx++) for (let dz = -k; dz <= k; dz++) if (near.has((Math.round(x / 6) + dx) + ',' + (Math.round(z / 6) + dz))) return true; return false; };
    const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    // 木：森の高さの帯（本物の標高 60〜450m）に植える。岩場には植えない。低いところは丸い広葉樹、高いところは針葉樹
    let forestNear = () => 0;   // 森の道のカメラ用（下で作る）
    {
      const spots = [], round = [], dead = [];
      // 枯れ木（2026-10-29 試走の指摘 9「地面が茶色くなっているところは、枯れ木にして」→「普通の木より生えている数を減らす。うじゃうじゃ生やさない。全体の1割くらいで、地面が緑に近いあたりは三角の木にする」）：
      // 地面が茶色い所（groundclass の upland＝森より上の高地 400〜470 m）の木は、葉のない枝だけの枯れ木にし、そのうち DEAD_KEEP の割合だけ残す（間をあけて少なく。島の木の約 1 割）。岩まじりの斜面（rock）など緑に近い所は今までの木
      const DEAD_GROUND = new Set(['upland']), DEAD_KEEP = 0.7, hash01 = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
      for (let r = 1; r < R - 1; r++) for (let c = 1; c < C - 1; c++) {
        const e = isl.elev[r][c]; if (e < 25 || e > 470 || slope(r, c) > 0.8) continue;
        const n = e < 60 ? 0.12 : e < 150 ? 0.35 : 1.1;   // 低いところはまばら
        for (let k = 0; k < 3; k++) if (rnd() < n / 3 * (light ? 0.5 : 1)) {
          const x = (c + rnd() - 0.5) * cell, z = (r + rnd() - 0.5) * cell;
          if (!onRoad(x, z)) { const kind = e < 200 && rnd() < 0.6 ? round : spots; const isDead = DEAD_GROUND.has(GC.classify(e, slope(r, c)).name), sz = 0.7 + rnd() * 0.8; if (!isDead) kind.push([x, groundY(x, z), z, sz]); else if (hash01(x, z) < DEAD_KEEP) dead.push([x, groundY(x, z), z, sz]); }   // 乱数の使い方は前と同じ（ほかの物の置き場所を変えない）
        }
      }
      // 丸い広葉樹
      const ball = new T.IcosahedronGeometry(2.6, 0); ball.translate(0, 4.2, 0);
      const stem = new T.CylinderGeometry(0.35, 0.45, 2.2, 5); stem.translate(0, 1.1, 0);
      const balls = new T.InstancedMesh(ball, new T.MeshLambertMaterial({ color: 0x4f8a35, flatShading: true }), round.length);
      const stems = new T.InstancedMesh(stem, new T.MeshLambertMaterial({ color: 0x6a4a30 }), round.length);
      round.forEach(([x, y, z, s], i) => { sc.set(s, s, s); q.setFromAxisAngle(up, rnd() * 6); m4.compose(new T.Vector3(x, y - 0.3, z), q, sc); balls.setMatrixAt(i, m4); stems.setMatrixAt(i, m4); });
      q.identity();
      scene.add(balls, stems);
      // 針葉樹（もみの木）：3 段の円錐。段ごとに張り出しが不ぞろいで、ねじれ、頂点が少し傾いている（回り込むと形が変わって見える。2026-10-23 ユーザー要望）。
      // 大きさは前の円錐（半径 2.2・高さ 7）と同じ。1 つの形を InstancedMesh で使い回し、1 本ごとの向きだけ変える
      const cone = (() => {
        const P = [], tiers = [[1.0, 3.7, 2.2, 0.0, 0.05, 0.1], [3.0, 3.3, 1.75, 0.9, -0.25, 0.2], [4.9, 3.1, 1.2, 1.9, 0.2, -0.3]];   // [底の高さ, 段の高さ, 底の半径, ねじれ, 頂点のずれ x・z]
        const N = 7, hsh = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
        tiers.forEach(([y0, h, r, tw, ax, az], t) => {
          const ring = [];
          for (let i = 0; i < N; i++) {
            const a = tw + i / N * Math.PI * 2 + (hsh(t, i) - 0.5) * 0.35, rr = r * (0.68 + 0.55 * hsh(i, t + 3));   // 張り出しの不ぞろい
            ring.push([Math.cos(a) * rr, y0 + (hsh(t + 7, i) - 0.5) * 0.5, Math.sin(a) * rr]);
          }
          const apex = [ax, y0 + h, az];
          for (let i = 0; i < N; i++) { const a = ring[i], b = ring[(i + 1) % N]; P.push(...a, ...apex, ...b); }   // 側面
          const mid = [0, y0 - 0.1, 0]; for (let i = 0; i < N; i++) { const a = ring[i], b = ring[(i + 1) % N]; P.push(...a, ...b, ...mid); }   // 底
        });
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
      })();
      const trunk = new T.CylinderGeometry(0.35, 0.45, 1.6, 5); trunk.translate(0, 0.8, 0);
      const crowns = new T.InstancedMesh(cone, new T.MeshLambertMaterial({ color: 0x2f5a2a, flatShading: true }), spots.length);
      const trunks = new T.InstancedMesh(trunk, new T.MeshLambertMaterial({ color: 0x5a4030 }), spots.length);
      spots.forEach(([x, y, z, s], i) => { sc.set(s, s, s); q.setFromAxisAngle(up, (i * 2.399963) % (Math.PI * 2)); m4.compose(new T.Vector3(x, y - 0.3, z), q, sc); crowns.setMatrixAt(i, m4); trunks.setMatrixAt(i, m4); });   // 向きは本ごとにばらす（乱数の列は変えない）
      q.identity();
      scene.add(crowns, trunks);
      // 枯れ木：葉のない、枝だけの木（灰色がかった茶色の幹から、ねじれた枝が 5 本、その先に小枝）。1 つの形を InstancedMesh で使い回し、本ごとに向きと大きさを変える。高さは針葉樹と同じくらい（約 7 m）
      if (dead.length) {
        const parts = [], mm = new T.Matrix4(), qq = new T.Quaternion(), e3 = new T.Euler();
        const limb = (r0, r1, len, x, y, z, tilt, yaw, roll = 0) => { const g = new T.CylinderGeometry(r1, r0, len, 5); g.translate(0, len / 2, 0); qq.setFromEuler(e3.set(tilt, yaw, roll, 'YXZ')); g.applyMatrix4(mm.compose(new T.Vector3(x, y, z), qq, new T.Vector3(1, 1, 1))); parts.push(g); const d = new T.Vector3(0, len, 0).applyQuaternion(qq); return [x + d.x, y + d.y, z + d.z]; };
        limb(0.42, 0.2, 4.2, 0, -0.3, 0, 0.06, 0.4);   // 幹（少し傾く）
        const top = limb(0.2, 0.08, 2.2, 0.25, 3.8, 0.05, -0.25, 1.9);   // 幹の先（もう一度折れて上へ）
        limb(0.08, 0.03, 1.2, top[0], top[1], top[2], 0.7, 0.3);
        [[2.0, 0.0, 1.0, 2.6], [2.7, 2.1, 0.95, 2.2], [3.3, 4.0, 0.85, 1.9], [3.9, 5.3, 0.7, 1.6], [1.5, 3.2, 1.15, 1.8]].forEach(([h, yaw, tilt, len], i) => {   // 枝：[付け根の高さ, 向き, 傾き, 長さ]
          const tip = limb(0.13, 0.05, len, 0, h, 0, tilt, yaw);
          limb(0.05, 0.02, len * 0.55, tip[0], tip[1], tip[2], tilt * 0.4, yaw + 0.6);   // 先の小枝（上向きに折れる）
          limb(0.04, 0.02, len * 0.4, tip[0] * 0.6, h + (tip[1] - h) * 0.6, tip[2] * 0.6, tilt + 0.35, yaw - 0.8);   // 途中から出る小枝
        });
        const P = []; for (const g of parts) { const n = g.toNonIndexed(); P.push(...n.attributes.position.array); n.dispose(); g.dispose(); }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(P, 3)); geo.computeVertexNormals();
        const snags = new T.InstancedMesh(geo, new T.MeshLambertMaterial({ color: 0x6b5a4c, flatShading: true }), dead.length);
        dead.forEach(([x, y, z, s], i) => { sc.set(s, s * (0.85 + 0.3 * ((i * 0.618) % 1)), s); q.setFromAxisAngle(up, (i * 2.399963) % (Math.PI * 2)); m4.compose(new T.Vector3(x, y - 0.3, z), q, sc); snags.setMatrixAt(i, m4); });
        q.identity();
        scene.add(snags);
      }
      root.__rq.trees = { dead: dead.length, all: dead.length + spots.length + round.length };   // テスト用：枯れ木の本数と、木の全部
      // 森の道（2026-10-24 ユーザー要望：ヒルクライムする山の中に、大きな木に囲まれて走るところ）：features.json の forests（道の名前と、道の上の距離 s0〜s1 m）の区間で、道の両側に大きな木（太い幹・高さ 15〜25 m 級）をすき間なく並べる。
      // 手前の列（道の中心から 5.8〜7 m）は、丸い広葉樹と針葉樹を交互に（広葉樹の葉は道の上へ少し張り出し、上を覆う）。奥の列（11〜15 m）は針葉樹。InstancedMesh で、「軽い」では奥の列を出さず間隔をあける
            const FZ = ((root.RQ.mapData.features || {}).forests || []).filter(f => !f.off && net.byName && net.byName.has(f.road));
        if (FZ.length) {
          const bigFir = [], bigOak = [], trunks = [], hit = new Map();
        // 道の細かい点（2 m ごと）：木が、ほかの道（九十九折りのほかの折り返し）の上や脇に立たないように
        const dn = new Map(); for (const rd of net.roads) for (let s = 0; s <= rd.len; s += 2) { const pp = RD.pointAt(rd, s), v = at3(pp.lat, pp.lon), k = Math.floor(v.x / 6) + ',' + Math.floor(v.z / 6); (dn.get(k) || dn.set(k, []).get(k)).push([v.x, v.z]); }
        const roadD = (x, z) => { let m = 1e9; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q2 of dn.get((Math.floor(x / 6) + i) + ',' + (Math.floor(z / 6) + j)) || []) m = Math.min(m, Math.hypot(q2[0] - x, q2[1] - z)); return m; };
          const addHit = (x, z) => { const k = Math.floor(x / 12) + ',' + Math.floor(z / 12); (hit.get(k) || hit.set(k, []).get(k)).push([x, z]); };
          let sd = 777; const fr = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 2 ** 32; };
          for (const f of FZ) {
            const rd = net.roads[net.byName.get(f.road)], step = light ? 9 : 5.5;
            for (let s = f.s0; s <= f.s1; s += step) {
              const pa = RD.pointAt(rd, Math.max(0, s - 2)), pb = RD.pointAt(rd, Math.min(rd.len, s + 2)), pc = RD.pointAt(rd, s);
              const a = at3(pa.lat, pa.lon), b = at3(pb.lat, pb.lon), c0 = at3(pc.lat, pc.lon), tl = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / tl, nz = (b.x - a.x) / tl;
              const fade = Math.min(1, (s - f.s0) / 25, (f.s1 - s) / 25);   // 区間のはしは、木をまばらに（急に壁にならない）
              for (const side of [-1, 1]) {
                if (fr() > 0.35 + 0.65 * fade) continue;
                const rows = light ? [[6.3, 1.0]] : [[6.3, 1.0], [12, 3.5]];
                rows.forEach(([u0, uj], ri) => {
                  const u = (u0 + fr() * uj) * side, x = c0.x + nx * u + (fr() - 0.5) * 1.5, z = c0.z + nz * u + (fr() - 0.5) * 1.5;
                  if (onFeature(x, z)) return;
                  const y = groundY(x, z), oak = ri === 0 && ((Math.floor(s / step) + (side > 0 ? 1 : 0)) % 2 === 0), sz = (oak ? 2.2 + fr() * 0.6 : 2.4 + fr() * 0.7) * (ri ? 1.05 : 1);
                  (oak ? bigOak : bigFir).push([x, y, z, sz, fr() * 6.28]); trunks.push([x, y, z, sz]); addHit(x, z);
                });
              }
            }
          }
          // 太い幹の木：幹の半径は 0.6 m 前後（高さ 15〜25 m 級に対して太め）。形は針葉樹の cone と同じ作りを使い回し、丸い広葉樹は大きな塊（上が道へ張り出す）
          const oakBall = new T.IcosahedronGeometry(2.2, 1); oakBall.translate(0, 5.0, 0);
          const bigTrunk = new T.CylinderGeometry(0.28, 0.42, 1, 6); bigTrunk.translate(0, 0.5, 0);
          const firCrowns = new T.InstancedMesh(cone, new T.MeshLambertMaterial({ color: 0x27502a, flatShading: true }), Math.max(1, bigFir.length));
          const oakCrowns = new T.InstancedMesh(oakBall, new T.MeshLambertMaterial({ color: 0x4a8a34, flatShading: true }), Math.max(1, bigOak.length));
          const trunkM = new T.InstancedMesh(bigTrunk, new T.MeshLambertMaterial({ color: 0x5a4030, flatShading: true }), Math.max(1, trunks.length));
          const up2 = new T.Vector3(0, 1, 0), m5 = new T.Matrix4(), q5 = new T.Quaternion(), s5 = new T.Vector3();
          bigFir.forEach(([x, y, z, k, a], i) => { s5.set(k, k, k); q5.setFromAxisAngle(up2, a); m5.compose(new T.Vector3(x, y - 0.3 + 1.4 * k, z), q5, s5); firCrowns.setMatrixAt(i, m5); });   // 針葉樹の葉は 1.4 k だけ持ち上げる（カメラの高さに枝が来ない）
          bigOak.forEach(([x, y, z, k, a], i) => { s5.set(k, k, k); q5.setFromAxisAngle(up2, a); m5.compose(new T.Vector3(x, y - 0.3, z), q5, s5); oakCrowns.setMatrixAt(i, m5); });
          trunks.forEach(([x, y, z, k], i) => { s5.set(k * 0.55, k * 3.0, k * 0.55); q5.identity(); m5.compose(new T.Vector3(x, y - 0.5, z), q5, s5); trunkM.setMatrixAt(i, m5); });
          firCrowns.count = bigFir.length; oakCrowns.count = bigOak.length; trunkM.count = trunks.length; scene.add(firCrowns, oakCrowns, trunkM);
          // カメラ用：(x, z) から m 以内に森の木があるか（森の中では、路地と同じに近め・高めのカメラ。幹にめり込まない）
          forestNear = (x, z, m) => { for (let bx = Math.floor((x - m) / 12); bx <= Math.floor((x + m) / 12); bx++) for (let bz = Math.floor((z - m) / 12); bz <= Math.floor((z + m) / 12); bz++) for (const t of hit.get(bx + ',' + bz) || []) if (Math.hypot(t[0] - x, t[1] - z) < m) return Math.hypot(t[0] - x, t[1] - z) || 0.01; return 0; };
        }
    }
    // 岩：急な斜面と高いところ、海辺に転がす
    {
      const spots = [];
      for (let r = 1; r < R - 1; r++) for (let c = 1; c < C - 1; c++) {
        const e = isl.elev[r][c]; if (e < 2) continue;
        const sl = slope(r, c), n = e > 470 ? 0.5 : sl > 0.85 ? 0.5 : sl > 0.6 ? 0.2 : e < 40 ? 0.18 : 0.04;
        if (rnd() < n * (light ? 0.5 : 1)) {
          const x = (c + rnd() - 0.5) * cell, z = (r + rnd() - 0.5) * cell;
          if (!onRoad(x, z)) spots.push([x, groundY(x, z), z, 0.6 + rnd() * rnd() * 3.2]);
        }
      }
      const rock = new T.DodecahedronGeometry(1.2, 0); rock.scale(1, 0.7, 1.1);
      const rocks = new T.InstancedMesh(rock, new T.MeshLambertMaterial({ color: 0x8b847a, flatShading: true }), spots.length);
      const tint = new T.Color();
      spots.forEach(([x, y, z, s], i) => {
        sc.set(s * (0.8 + rnd() * 0.5), s, s); q.setFromAxisAngle(new T.Vector3(rnd(), 1, rnd()).normalize(), rnd() * 6);
        m4.compose(new T.Vector3(x, y + s * 0.3, z), q, sc); rocks.setMatrixAt(i, m4);
        tint.setHSL(0.07, 0.08 + rnd() * 0.1, 0.32 + rnd() * 0.18); rocks.setColorAt(i, tint);
      });
      q.identity();
      scene.add(rocks);
    }
    // 村：港（〜泊）のまわりに家を建てる。灯台と、江良岳の頂に鬼王の城
    // 足もと：円の上の地面の低いほう・高いほう。建物の底はいちばん低いところまで埋め（浮かせない）、斜面がきつい所には建てない
    const reach = (x, z, r) => { let lo = groundY(x, z), hi = lo; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, y = groundY(x + Math.cos(a) * r, z + Math.sin(a) * r); lo = Math.min(lo, y); hi = Math.max(hi, y); } return [lo, hi]; };
    const houseDet = [];   // 港の村の家（窓・扉を付けるための位置と向き）
    const built = [];   // 建てた物の場所（テスト用に __rq.built で見せる。足もとが斜面に合っているか確かめる）
    let featView = null;   // 湖・川・橋・温泉（湯気の動き）
    let lighthouse = null, castleLight = null, volcFx = null, lastNight = 0;   // 灯台の灯と光の筋（update(dt, S)）
    const placeAt = name => { const p = (root.RQ.mapData.places || {})[name]; return p && { x: p[1] * cell, z: p[0] * cell }; };
    {
      const wall = new T.BoxGeometry(5, 7.2, 4); wall.translate(0, -0.4, 0);   // 壁は地面の下へ4m伸ばして、斜面でも底が浮かないように
      const roof = new T.ConeGeometry(4.2, 2.6, 4); roof.rotateY(Math.PI / 4); roof.translate(0, 4.5, 0);
      const walls = [0xe8dcc0, 0xd8c8a8, 0xc8b8a0].map(c => new T.MeshLambertMaterial({ color: c, flatShading: true }));
      const roofs = [0xa8442e, 0x3e5f8a, 0x7a5232, 0x5a6e3a].map(c => new T.MeshLambertMaterial({ color: c, flatShading: true }));
      for (const name of ['北風泊', '東風泊', '日方泊']) {
        const p = placeAt(name); if (!p) continue;
        let n = 0;
        for (let k = 0; k < 400 && n < 10; k++) {
          const a = rnd() * Math.PI * 2, d = 20 + rnd() * 160, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
          const r = Math.round(z / cell), c = Math.round(x / cell);
          if (r < 1 || c < 1 || r >= R - 1 || c >= C - 1) continue;
          const e = isl.elev[r][c]; if (!root.RQ.area.houseOk(isl, z / cell, x / cell) || e > 150 || slope(r, c) > 0.7 || onRoad(x, z, 2)) continue;   // 海から離す（game/area.js の houseOk。2026-10-28 試走の指摘 12：前は、いちばん近い格子の標高 3 m 以上だけを見ていて、岸のすぐ手前にも建った）
          const turn = rnd() * Math.PI, s = 1.2 + rnd() * 0.6, [lo, hi] = reach(x, z, 3.6 * s);
          if (hi - lo > 1.8) continue;   // 家の足もとの高さの差が大きい所には建てない
          const y = lo + 0.2;
          const w = new T.Mesh(wall, walls[n % walls.length]), h = new T.Mesh(roof, roofs[(n + k) % roofs.length]);
          for (const o of [w, h]) { o.position.set(x, y - 0.2, z); o.rotation.y = turn; o.scale.setScalar(s); scene.add(o); }
          built.push({ kind: 'house', x, y, z, r: 5.5 * s, base: y - 0.2 - 4 }); houseDet.push({ x, y, z, turn, s, i: houseDet.length }); n++;
        }
      }
      // 港（〜泊）の村の家の窓と扉（2026-10-24 ユーザー要望：どの家にも窓、村の家は扉も）。前（local +z）に扉 1 つと窓 2 つ、両わきに窓 1 つずつ。窓は夜に光る（約 78% の家。windowMat）。InstancedMesh
      if (houseDet.length) {
        const nW = houseDet.length * 4, lampH = new Float32Array(nW).fill(2), wg = new T.BoxGeometry(0.9, 1.3, 0.16); wg.setAttribute('aLamp', new T.InstancedBufferAttribute(lampH, 1));
        const fg = new T.BoxGeometry(1.4, 1.75, 0.1), dg = new T.BoxGeometry(1.2, 2.2, 0.2);
        const winsV = new T.InstancedMesh(wg, windowMat(0x3a2c28), nW), framesV = new T.InstancedMesh(fg, new T.MeshLambertMaterial({ flatShading: true }), nW), doorsV = new T.InstancedMesh(dg, new T.MeshLambertMaterial({ flatShading: true }), houseDet.length);
        const SHC = [0x4f7f62, 0x4a6a9a, 0x8a5a3a, 0xb87a3a, 0x6a4a7a, 0xa84a3a], DRC = [0x5a3a24, 0x2f4f7a, 0x3a6a4a, 0x7a2f2a], mm = new T.Matrix4(), cc = new T.Color(), upv = new T.Vector3(0, 1, 0);
        houseDet.forEach(h => {
          const hh = Math.abs(Math.sin(h.i * 53.9 + h.x * 0.013)) * 1000 % 1, h2 = Math.abs(Math.sin(h.i * 7.7 + h.z * 0.017)) * 1000 % 1, thr = hh < 0.78 ? 0.1 + h2 * 0.5 : 2, shc = SHC[h.i % SHC.length];
          const fx = Math.sin(h.turn), fz = Math.cos(h.turn), rx = fz, rz = -fx, sv = new T.Vector3(h.s, h.s, h.s);
          const put = (k, lx, lz, ang, ly) => { const qq = new T.Quaternion().setFromAxisAngle(upv, ang), pos = new T.Vector3(h.x + (rx * lx + fx * lz) * h.s, h.y - 0.2 + ly * h.s, h.z + (rz * lx + fz * lz) * h.s);
            mm.compose(pos, qq, sv); winsV.setMatrixAt(h.i * 4 + k, mm); mm.compose(pos.clone().addScaledVector(new T.Vector3(Math.sin(ang), 0, Math.cos(ang)), -0.05 * h.s), qq, sv); framesV.setMatrixAt(h.i * 4 + k, mm); framesV.setColorAt(h.i * 4 + k, cc.set(shc)); lampH[h.i * 4 + k] = thr < 2 ? Math.min(0.95, thr + k * 0.04) : 2; };
          put(0, -1.7, 2.04, h.turn, 1.5); put(1, 1.7, 2.04, h.turn, 1.5); put(2, 2.54, 0, h.turn + Math.PI / 2, 1.5); put(3, -2.54, 0, h.turn - Math.PI / 2, 1.5);
          const dq = new T.Quaternion().setFromAxisAngle(upv, h.turn); mm.compose(new T.Vector3(h.x + fx * 2.06 * h.s, h.y - 0.2 + 1.1 * h.s, h.z + fz * 2.06 * h.s), dq, sv); doorsV.setMatrixAt(h.i, mm); doorsV.setColorAt(h.i, cc.set(DRC[h.i % DRC.length]));
        });
        wg.attributes.aLamp.needsUpdate = true; scene.add(winsV, framesV, doorsV);
      }
      const lh = placeAt('灯台');
      if (lh) {
        // 灯台（2026-10-23 ユーザー要望：木の 3 倍ほど、約 20 m。白と赤の縞、てっぺんの灯室と手すり、足もとの小さな建物。夕方〜夜は灯がともり、光の筋が回る）
        const y = groundY(lh.x, lh.z), lo = reach(lh.x, lh.z, 4)[0] - 1;
        const g = new T.Group(); g.position.set(lh.x, y, lh.z); scene.add(g);
        const mat = c => new T.MeshLambertMaterial({ color: c, flatShading: true }), WHITE = 0xf4f1ea, RED = 0xc0392b, DARKM = 0x3a3a40;
        const add = (geo, m, px, py, pz) => { const o = new T.Mesh(geo, m); o.position.set(px, py, pz); g.add(o); return o; };
        // 土台（地面の下の低いところまで）と、縞の塔（6 段。下ほど太い）
        add(new T.CylinderGeometry(3.4, 3.8, y - lo + 1.2, 10), mat(0x9a948a), 0, (lo - y + 1.2) / 2, 0);
        const bands = 6, H = 17, r0 = 2.7, r1 = 1.7;
        for (let i = 0; i < bands; i++) {
          const ra = r0 + (r1 - r0) * i / bands, rb = r0 + (r1 - r0) * (i + 1) / bands, h = H / bands;
          add(new T.CylinderGeometry(rb, ra, h, 10), mat(i % 2 ? RED : WHITE), 0, 1.2 + h * (i + 0.5), 0);
        }
        const gy = 1.2 + H;   // 手すりの床の高さ
        add(new T.CylinderGeometry(2.6, 2.1, 0.5, 10), mat(DARKM), 0, gy + 0.25, 0);
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; add(new T.BoxGeometry(0.12, 1.1, 0.12), mat(DARKM), Math.cos(a) * 2.5, gy + 1.05, Math.sin(a) * 2.5); }
        const rail = add(new T.TorusGeometry(2.5, 0.07, 4, 16), mat(DARKM), 0, gy + 1.6, 0); rail.rotation.x = Math.PI / 2;
        // 灯室：ガラス（夜は光る）、細い柱、赤い屋根と先の飾り
        const glass = new T.MeshBasicMaterial({ color: 0x9fc8d8 });
        add(new T.CylinderGeometry(1.25, 1.25, 2.3, 10), glass, 0, gy + 0.5 + 1.15, 0);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(new T.BoxGeometry(0.12, 2.4, 0.12), mat(DARKM), Math.cos(a) * 1.28, gy + 1.7, Math.sin(a) * 1.28); }
        add(new T.CylinderGeometry(1.45, 1.45, 0.25, 10), mat(DARKM), 0, gy + 2.95, 0);
        add(new T.ConeGeometry(1.7, 1.5, 10), mat(RED), 0, gy + 3.8, 0);
        add(new T.SphereGeometry(0.22, 6, 4), mat(DARKM), 0, gy + 4.7, 0);
        // 足もとの小さな建物（灯台守の小屋）：白い壁・赤い屋根・扉・窓
        const hx = 5.2, hz = 1.2, hh = 3.2 + (y - lo);
        add(new T.BoxGeometry(5, hh, 3.6), mat(WHITE), hx, (3.2 + lo - y) / 2, hz);
        const roof2 = add(new T.ConeGeometry(3.6, 1.8, 4), mat(RED), hx, 3.4 + 0.3, hz); roof2.rotation.y = Math.PI / 4;
        add(new T.BoxGeometry(0.9, 1.7, 0.1), mat(0x6a4a30), hx - 1.0, 0.85, hz + 1.85);
        add(new T.BoxGeometry(0.8, 0.8, 0.1), glass, hx + 1.0, 1.9, hz + 1.85);
        // 光の筋：先が広がる、細長い円すい。光る時だけ見え、ぐるっと回る（海の上にもかかる）。両方向（「軽い」では 1 本）
        const beams = new T.Group(); beams.position.y = gy + 1.65; g.add(beams);
        const BL = 420, bg = new T.CylinderGeometry(18, 0.5, BL, light ? 8 : 14, 1, true); bg.translate(0, BL / 2, 0); bg.rotateZ(-Math.PI / 2);
        const gradTex = (() => { const cv = document.createElement('canvas'); cv.width = 2; cv.height = 64; const c = cv.getContext('2d'), gr = c.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); c.fillStyle = gr; c.fillRect(0, 0, 2, 64); return new T.CanvasTexture(cv); })();
        const beamMat = new T.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0, alphaMap: gradTex, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
        for (let i = 0; i < (light ? 1 : 2); i++) { const m = new T.Mesh(bg, beamMat); m.rotation.y = i * Math.PI; beams.add(m); }
        const lampGlow = new T.Color(), glassDay = new T.Color(0x9fc8d8), glassNight = new T.Color(0xfff0a0);
        lighthouse = { update(dt, S) {
          const on = S ? Math.max(0, Math.min(1, (S.night - 0.04) / 0.5)) : 0;
          glass.color.copy(lampGlow.copy(glassDay).lerp(glassNight, on)); beamMat.opacity = 0.2 * on; beams.visible = on > 0.01;
          beams.rotation.y += dt * 0.7;   // 1 周およそ 9 秒
        } };
        built.push({ kind: 'lighthouse', x: lh.x, y, z: lh.z, r: 4, base: lo });
      }
      const cs = placeAt('江良岳');
      if (cs) {
        const y = groundY(cs.x, cs.z), stone = new T.MeshLambertMaterial({ color: 0x3b3438, flatShading: true }), red = new T.MeshLambertMaterial({ color: 0x8a2420, flatShading: true });
        const klo = reach(cs.x, cs.z, 13)[0] - 1, keep = new T.Mesh(new T.BoxGeometry(18, y + 22 - klo, 18), stone); keep.position.set(cs.x, (y + 22 + klo) / 2, cs.z); scene.add(keep);
        built.push({ kind: 'castle', x: cs.x, y, z: cs.z, r: 9, base: klo }); for (const [dx, dz] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) built.push({ kind: 'tower', x: cs.x + dx, y, z: cs.z + dz, r: 4, base: reach(cs.x + dx, cs.z + dz, 4)[0] - 1 });
        const crown = new T.Mesh(new T.ConeGeometry(14, 12, 4), red); crown.rotation.y = Math.PI / 4; crown.position.set(cs.x, y + 28, cs.z); scene.add(crown);
        for (const [dx, dz] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) {
          const [tlo, thi] = reach(cs.x + dx, cs.z + dz, 4), top = Math.max(y, thi) + 26;   // 塔の底は地面の低いほうまで、てっぺんは高いほうの地面から26m
          const t = new T.Mesh(new T.CylinderGeometry(3.5, 4, top - tlo + 1, 6), stone); t.position.set(cs.x + dx, (top + tlo - 1) / 2, cs.z + dz);
          const cap = new T.Mesh(new T.ConeGeometry(5, 7, 6), red); cap.position.set(cs.x + dx, top + 3.5, cs.z + dz);
          scene.add(t, cap);
        }
        // 夜の鬼の城（2026-10-24 ユーザー要望）：細い窓（矢狭間）と、塔のてっぺんのかがり火。夜は赤〜橙の不気味な色に光る（家の窓の暖かい色とは違う）。光源は増やさず、材質と板（スプライト）で表す。夜の度合いは灯台と同じ S.night
        {
          const slitMat = new T.MeshBasicMaterial({ color: 0x1a1214, fog: true }), slitG = new T.BoxGeometry(0.55, 2.4, 0.5), slits = [], dark = new T.Color(0x1a1214), lit = new T.Color(0xff3c14);
          const addSlit = (x, yy, z, ang) => slits.push([x, yy, z, ang]);
          for (const f of [0, 1, 2, 3]) {   // 天守（18 m 四方。高さは y+22 まで）：4 面に、3 列 × 2 段
            const ang = f * Math.PI / 2, nx = Math.sin(ang), nz = Math.cos(ang), rx = nz, rz = -nx;
            for (const lv of [6, 13]) for (const k of [-5, 0, 5]) addSlit(cs.x + nx * 9.05 + rx * k, y + lv, cs.z + nz * 9.05 + rz * k, ang);
          }
          for (const [dx, dz] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) {   // 塔：4 方向に、2 段
            const [tlo, thi] = reach(cs.x + dx, cs.z + dz, 4), top = Math.max(y, thi) + 26;
            for (let a4 = 0; a4 < 4; a4++) { const ang = a4 * Math.PI / 2 + Math.PI / 4; for (const lv of [top - 8, top - 15]) addSlit(cs.x + dx + Math.sin(ang) * 3.45, lv, cs.z + dz + Math.cos(ang) * 3.45, ang); }
          }
          const slitMesh = new T.InstancedMesh(slitG, slitMat, slits.length), m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1);
          slits.forEach(([x, yy, z, ang], i) => { q.setFromAxisAngle(up, ang); m4.compose(new T.Vector3(x, yy, z), q, one); slitMesh.setMatrixAt(i, m4); }); scene.add(slitMesh);
          // かがり火：塔の笠の先（4 本）と天守の頂（1 本）。炎のドット絵 2 コマをゆらめかせる。昼は小さく、夜は大きく明るく
          const flameTex = [0, 1].map(fr => { const cv = document.createElement('canvas'); cv.width = 10; cv.height = 14; const c = cv.getContext('2d');
            const rows = fr ? ['....rr....', '...rooo...', '..roooo...', '..rooyoo..', '.rooyyoor.', '.rooyyyor.', 'rooyyyyoor', 'rooyyyyoor', '.rooyyyor.', '.rrooyoor.', '..rrooor..', '...rrrr...', '..........', '..........'] : ['..........', '....r.....', '...rro....', '..rrooo...', '.rroooor..', '.rooyyoor.', '.rooyyyor.', 'rooyyyyoor', 'rooyyyyoor', '.rooyyyor.', '.rrooyoor.', '..rrooor..', '...rrrr...', '..........'];
            rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '.') return; c.fillStyle = ch === 'r' ? '#c8281a' : ch === 'o' ? '#ff7a1c' : '#ffd860'; c.fillRect(i, j, 1, 1); }));
            const t = new T.CanvasTexture(cv); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; return t; });
          const flames = [];
          const tops = [[cs.x, y + 34]]; for (const [dx, dz] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) { const [tlo, thi] = reach(cs.x + dx, cs.z + dz, 4), top = Math.max(y, thi) + 26; tops.push([cs.x + dx, top + 7.2, cs.z + dz]); }
          tops[0] = [cs.x, y + 34.5, cs.z];
          for (const [fx, fy, fz] of tops) { const sp = new T.Sprite(new T.SpriteMaterial({ map: flameTex[0], transparent: true, depthWrite: false, fog: false })); sp.center.set(0.5, 0); sp.position.set(fx, fy, fz); scene.add(sp); flames.push(sp); }
          // 赤いもや：城のまわりを、赤く照らされたように見せる大きな円形のぼかし板（加算。遠くから頂が赤く見える）。鬼王の板のうしろにも小さく
          const haloTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,90,40,0.9)'); g.addColorStop(0.45, 'rgba(255,60,30,0.35)'); g.addColorStop(1, 'rgba(255,40,20,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); return new T.CanvasTexture(cv); })();
          const halo = new T.Sprite(new T.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0, fog: false })); halo.position.set(cs.x, y + 22, cs.z); halo.scale.set(150, 110, 1); scene.add(halo);
          let tt = 0;
          castleLight = { halo, flames, update(dt, S) {
            tt += dt; const on = S ? Math.max(0, Math.min(1, (S.night - 0.04) / 0.5)) : 0;
            slitMat.color.copy(dark).lerp(lit, on * (0.85 + 0.15 * Math.sin(tt * 2.3)));
            const fi = Math.floor(tt * 7) % 2;
            flames.forEach((sp, i) => { const k = (0.85 + 0.15 * Math.sin(tt * 9 + i * 1.7)); sp.material.map = flameTex[(fi + i) % 2]; const h = (2.6 + 5.2 * on) * k; sp.scale.set(h * 0.72, h, 1); });
            halo.material.opacity = 0.42 * on;
          } };
        }
      }
    }
    // ランドマーク（docs/landmarks.md）：配置は RQ.landmarks.place、描くのは ui/landmark-view.js。失敗しても島は描く
    let lmView = null;
    try {
      const LM = root.RQ.landmarks, LV = root.RQ.landmarkView;
      if (LM && LV && net.placed) lmView = LV.create(T, scene, { placed: net.placed, groundY, groundNat: null, windowMat, light, art: root.RQ.landmarkArt || {} });
      if (root.RQ.featuresView) featView = root.RQ.featuresView.create(T, scene, { F: root.RQ.mapData.features, groundY, cell, vs, water, net, at3, light, windowMat, roadPts: P, bridges: BRIDGES });   // 湖・川・橋・温泉
    } catch (e) { console.warn('ランドマークを置けなかった', e); }
    // トンネルの中（2026-10-22 ユーザー要望：暗くて、流れ出た溶岩で光っている）：カメラが中に入るほど、空と霧を暗い赤黒に、日の光を消し、
    // 主人公のまわりを溶岩の照り返しで照らし、主人公の絵も赤みを帯びる。f：0（外）〜1（中）
    const SKY_C = new T.Color(SKY), CAVE_C = new T.Color(0x140805), FOG_FAR = scene.fog.far, heroTint = new T.Color();
    // 時刻の空を、空・光・霧に反映する。時刻は走り始めからの経過（RQ.tod.sec に dt を足す。旅のはじめに app.js が 0 にする）。
    // テスト用：window.__rq.hour（0〜24）を入れると、その時刻に固定する
    const skyHorizon = new T.Color(), hemiSkyC = new T.Color(), hemiGroundC = new T.Color(), sunColC = new T.Color();
    function sky(dt, camAt) {
      const TD = root.RQ.tod; if (!TD) return;
      TD.sec += dt;
      const S = TD.sky(root.__rq.hour != null ? root.__rq.hour : TD.hourAt(TD.sec)); LAMPU.value = S.night;
      skyHorizon.setRGB(...S.horizon); SKY_C.copy(skyHorizon);
      hemi.color.copy(hemiSkyC.setRGB(...S.hemiSky)); hemi.groundColor.copy(hemiGroundC.setRGB(...S.hemiGround)); hemiBase = S.hemiI;
      const lead = S.night > 0.5 ? S.moonDir : S.sunDir; sun.color.copy(sunColC.setRGB(...S.sunCol)); sun.position.set(lead[0], lead[1] + 0.25, lead[2]); sunBase = S.sunI;
      // 海の色合いと光の筋（夜は暗い海に月の筋。昼は太陽のちらちら。夕方は少し染まる）
      { const warm = S.glow * 0.5, nm = S.night; SEAU.uSeaMul.value.setRGB((1 + 0.1 * warm) * (1 - 0.62 * nm), (1 - 0.1 * warm) * (1 - 0.55 * nm), (1 - 0.22 * warm) * (1 - 0.22 * nm)); SEAU_PROXY.value.copy(SEAU.uSeaMul.value);
        SEAU.uGlintDir.value.set(lead[0], lead[1], lead[2]); SEAU.uGlintCol.value.setRGB(...(nm > 0.5 ? [0.75, 0.85, 1.0] : [1.0, 0.92 - 0.2 * warm, 0.75 - 0.3 * warm]));
        SEAU.uGlint.value = nm > 0.5 ? S.moon * 1.0 : S.sun * (0.3 + 0.4 * Math.max(0, 1 - lead[1] * 1.5)); }
      return S;
    }
    let tunF = 0;   // トンネルの暗さ（なめらかにした値）
    function cave(dt, camAt, heroAt) {
      if (lmView) lmView.update(dt);
      // トンネルの暗さ：出口では、主人公が外へ出たら（カメラはまだ数 m 中にいても）明るくする。時間でなめらかに（2026-10-26 ユーザー指摘：トンネルから出るとき、外が暗く見える）
      const S = sky(dt, camAt), f0 = lmView ? Math.min(lmView.insideTunnel(camAt.x, camAt.z), heroAt ? lmView.insideTunnel(heroAt.x, heroAt.z) : 1) : 0;
      tunF += (f0 - tunF) * (1 - Math.exp(-dt * (f0 < tunF ? 6 : 3.5))); const f = Math.abs(tunF - f0) < 0.004 ? f0 : tunF; if (root.__rq) { root.__rq.tunF = f; root.__rq.tunF0 = f0; }   // テスト用
      if (SK && S) SK.update(camera, S, dt, f < 0.98);   // トンネルの中では空を出さない
      if (SL && f < 0.5) SL.update(camera, dt, S);
      if (lighthouse) lighthouse.update(dt, S);
      if (castleLight) castleLight.update(dt, S);
      if (volcFx) volcFx.update(dt, S);
      lastNight = S ? +S.night.toFixed(3) : null;
      if (lmView && lmView.setNight) lmView.setNight(S.night);
      glowK = Math.max(Math.min(1, Math.max(0, (S.night - 0.04) / 0.5)), f);
      if (heroAt) placeGlow(heroGlow, heroAt.x, heroAt.y, heroAt.z, 9 * HS, hero.visible ? 0.6 * glowK : 0); else heroGlow.visible = false;
      if (npcGlow) { const d = camera.position.distanceTo(npcGlow.userData.at); placeGlow(npcGlow, npcGlow.userData.at.x, npcGlow.userData.at.y, npcGlow.userData.at.z, 5.5 * HS, light || d > 70 ? 0 : 0.42 * glowK * (1 - Math.max(0, (d - 45) / 25))); }
      if (featView) featView.update(dt);
      if (lmView && lmView.setCave) lmView.setCave(f, SKY_C);   // 中から見た出口は、外の空の明るさ（2026-10-27 ユーザー指摘：出口が真っ暗）
      scene.background.copy(SKY_C).lerp(CAVE_C, f); scene.fog.color.copy(scene.background);
      scene.fog.near = 250 - 242 * f; scene.fog.far = FOG_FAR - (FOG_FAR - 140) * f;
      hemi.intensity = hemiBase * (1 - 0.92 * f); sun.intensity = sunBase * (1 - f);
      lavaLight.intensity = 0.9 * f; if (heroAt) lavaLight.position.copy(heroAt).add(new T.Vector3(0, 2.5, 0));
      hero.material.color.copy(heroTint.setRGB(1, 1 - 0.3 * f, 1 - 0.5 * f));
      return f;
    }
    // 地名の看板
    const sprites = [];
    let signsOn = true;   // 戦闘中は看板を隠す（敵の絵に重なるため）
    function label(text, road, at, h = 18) {
      const cv = document.createElement('canvas'), ctx = cv.getContext('2d'), fs = 44;
      const font = `${fs}px DotGothic16, "Hiragino Sans", "Yu Gothic UI", sans-serif`;
      ctx.font = font;
      const w = Math.ceil(ctx.measureText(text).width) + 40; cv.width = w; cv.height = fs + 30;
      ctx.font = font;
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, w, cv.height);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.strokeRect(4, 4, w - 8, cv.height - 8);
      ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 20, cv.height / 2);
      const tex = new T.CanvasTexture(cv);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: true, fog: true }));
      const p = RD.pointAt(net.roads[road], at);
      sp.position.copy(at3(p.lat, p.lon)).add(new T.Vector3(0, h, 0)); sp.scale.set(w / cv.height * 9, 9, 1);
      sp.visible = signsOn; scene.add(sp); sprites.push(sp);
    }
    // 名前はドット文字で書くので、文字が読み込まれてから看板を作る
    const places = () => net.spots.forEach(p => label(p.name === '江良岳' ? `${root.RQ.i18n.n('江良岳')} ── ${D.WORLD.castle}` : root.RQ.i18n.cap(root.RQ.i18n.n(p.name)), p.road, p.at));   // 看板の文字は今の言語の名前（ID の p.name は変えない）   // 地名ごとに、いちばん近い道のそばに1つ
    let gone = false;
    // 3D の島の上の地名の札は出さない（2026-10-24 ユーザー判断：地名は、着いた時に出る表示だけでよい）。places() は残す（試す用）
    const PLACE_SIGNS = false;
    if (PLACE_SIGNS) (document.fonts ? document.fonts.load('44px DotGothic16') : Promise.resolve()).catch(() => {}).then(() => { if (!gone) places(); });
    // ドット絵の板（下端を地面に）。frames：[view, frame] の並び。ぼかさずに拡大する
    // mip：遠くで小さく出る板（旅人・ゴースト・道端の NPC）は、縮めて見るときだけミップマップでならす（細かい絵を最近傍で縮めるとちらつくため。近くで大きく出るときは今まで通りぼかさない。2026-10-24 主人公・NPC を 64 ドットにしたとき）
    function billboard(id, frames, height, mip) {
      const tex = frames.map(([view, f]) => {
        const s = SPR.get(id, view, f), t = s.canvas ? new T.CanvasTexture(s.canvas) : new T.TextureLoader().load(s.url);   // 本番の絵はファイルから読む
        t.magFilter = T.NearestFilter; t.minFilter = mip ? T.LinearMipmapLinearFilter : T.NearestFilter; return t;
      });
      const s0 = SPR.get(id, frames[0][0], frames[0][1]);
      const mat = new T.SpriteMaterial({ map: tex[0], transparent: true, depthTest: true, fog: true });
      const sp = new T.Sprite(mat); sp.center.set(0.5, 0); sp.scale.set(height * s0.w / s0.h, height, 1);
      sp.userData.base = [sp.scale.x, sp.scale.y];
      // コマごとの大きさ（走る絵は、後ろ姿と幅・高さが違う。1コマ目の高さを height にそろえ、ほかのコマはその比で）
      const u0 = s0.h * (s0.scale || 1), dims = frames.map(([view, f]) => { const s = SPR.get(id, view, f); return [height * s.w * (s.scale || 1) / u0, height * s.h * (s.scale || 1) / u0]; });
      sp.userData.set = i => { if (mat.map !== tex[i]) { mat.map = tex[i]; mat.needsUpdate = true; sp.userData.base = dims[i]; } };
      scene.add(sp);
      return sp;
    }
    // 主人公の板：後ろ姿の歩き（0〜2）と、走る後ろ姿（3〜6。絵がある主人公だけ。2026-10-24 ユーザー判断）。速さで切り替える（renderer/game/gait.js）
    const GT = root.RQ.gait, RUN_FRAMES = [['run', 0], ['run', 1], ['run', 2], ['run', 3]];
    const heroRun2d = SPR.canRun(heroId);   // 板の走るコマがあるか。走るかどうかは 3D も見る（下の heroRun。gait.js の canRunAs）
    const hero = billboard(heroId, [['back', 0], ['back', 1], ['back', 2], ...(heroRun2d ? RUN_FRAMES : [])], HERO_H), WALK = [0, 1, 0, 2];
    let heroRunning = false;
    // 戦士・魔法使いのフィールドの姿は、ピクセル化したローポリ（2026-10-26 ユーザー判断。ui/hero3d.js・hero3d_wizard.js）。戦闘・ゴースト・旅人などは 2D の板のまま。一時停止の窓のボタンで板に戻せる（RQ.hero3d.enabled）
    const H3 = root.RQ.hero3d && root.RQ.hero3d.available(heroId) ? root.RQ.hero3d.create(T, { heroH: HERO_H, heroId }) : null;
    let h3Was = false;
    // 後ろ姿の 2D の絵が無い主人公（SPR.hasBack。エルフ・ワルキューレ・侍・傭兵）は、3D を切っても 3D のまま走らせる（コードの仮の絵の板を出さない。2026-11-05 ユーザー判断「1a」）。
    // 一時停止の窓の 3D のボタンの表示と設定は変えない（RQ.hero3d.enabled はそのまま。ここで見るだけ）。絵が足されたら、ほかの 4 人と同じく板に戻る
    const heroForce3 = !!H3 && !SPR.hasBack(heroId);
    hero.renderOrder = 4;   // 主人公はゴーストより手前に描く（重なっても主人公が上。ゴーストは深さを書かない）
    // 歩きの動き（sprites.js の walkPose）：弾み・つぶれ・傾きを毎フレーム連続で。板の位置と大きさを動かすだけで、絵は拡大でにじませない
    // amp：弾みの大きさ（走りは GT.RUN_BOUNCE 倍。見比べ用に window.__rq.runBounce で変えられる）
    const runAmp = () => (root.__rq.runBounce != null ? root.__rq.runBounce : GT.RUN_BOUNCE);
    function pose(sp, at, cyc, on, amp = 1) {
      const w = on ? SPR.walkPose(cyc) : { h: 1, sx: 1, sy: 1, roll: 0 }, b = sp.userData.base;
      sp.position.copy(at).add(new T.Vector3(0, (0.6 + (on ? (0.14 * w.h - 0.07) * amp : 0)) * HS, 0));
      sp.scale.set(b[0] * (1 + (w.sx - 1) * amp), b[1] * (1 + (w.sy - 1) * amp), 1); sp.material.rotation = w.roll * amp;
    }
    // 夜の足もとの明かり（2026-10-24 ユーザー要望）：夜は、主人公・旅人・ゴースト・道端の NPC・ペースメーカーの足もとの地面に、ぼんやりした暖かい白〜薄い黄の円（手に持つ灯りで照らした感じ）を出す。光源は増やさない：
    // 地面に置く板（加算で重ねる丸い光。ふちはぼかす）で、地面の傾きに沿わせる。明るさは夜の度合い（灯台と同じ S.night。トンネルの中は昼でも出す）。主人公は大きく明るめ、ほかは小さめ。遠い人は見える範囲（70 m）だけ。「軽い」では主人公だけ
    let glowK = 0;
    const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,236,176,1)'); g.addColorStop(0.5, 'rgba(255,214,140,0.45)'); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); const t = new T.CanvasTexture(cv); return t; })();
    const glowGeo = new T.PlaneGeometry(1, 1); glowGeo.rotateX(-Math.PI / 2);
    const makeGlow = () => { const m = new T.Mesh(glowGeo, new T.MeshBasicMaterial({ map: glowTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0, fog: false, polygonOffset: true, polygonOffsetFactor: -3 })); m.renderOrder = 1; m.visible = false; scene.add(m); return m; };
    const _gn = new T.Vector3(), _gu = new T.Vector3(0, 1, 0);
    function placeGlow(m, x, y, z, size, k) {
      if (k < 0.01) { m.visible = false; return; }
      const gx = groundY(x + 0.8, z) - groundY(x - 0.8, z), gz = groundY(x, z + 0.8) - groundY(x, z - 0.8);
      _gn.set(-gx / 1.6, 1, -gz / 1.6).normalize(); m.quaternion.setFromUnitVectors(_gu, _gn);
      // 道の帯（地面 +0.35 m）より上に置く（2026-10-28 試走の指摘 26：+0.16 m では道の下に隠れ、道のわきの地面だけが明るかった）
      m.position.set(x, Math.max(y, groundY(x, z)) + 0.45, z); m.scale.set(size, 1, size); m.material.opacity = k; m.visible = true;
    }
    const heroGlow = makeGlow(); let npcGlow = null;
    // 夜に足もとを照らすときは、主人公も明るくする（2026-10-29 試走の指摘 10）：3D の主人公を描くときに渡す半球光を、足もとの明かり（glowK）に合わせて、
    // 強く・暖かい色に（下からの色＝足もとの灯りの照り返しを特に暖かく）。島の光は変えない。hero3d は渡された光を使う（下限 MIN_HEMI はそのまま）。見比べ用 window.__rq.noHeroLamp
    const LAMP_SKY = new T.Color(0xfff0d0), LAMP_GND = new T.Color(0xffd890), heroHemi = { color: new T.Color(), groundColor: new T.Color(), intensity: 0 };
    function heroLamp() {
      const k = root.__rq.noHeroLamp ? 0 : glowK;
      if (k < 0.01) return hemi;
      heroHemi.color.copy(hemi.color).lerp(LAMP_SKY, 0.5 * k); heroHemi.groundColor.copy(hemi.groundColor).lerp(LAMP_GND, 0.8 * k);
      heroHemi.intensity = Math.max(hemi.intensity, 0.8) + 0.55 * k;
      return heroHemi;
    }
    const heroShadow = (() => {   // 足もとの影（弾むと縮んで薄くなる）
      const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d');
      const g = c.createRadialGradient(16, 16, 2, 16, 16, 16); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false, fog: true })); sp.center.set(0.5, 0.5); scene.add(sp); return sp;
    })();
    // 鬼王の大きな板（頂の城のそば）は出さない（2026-10-24 ユーザー判断：ずっと見えているのは変。代わりに火口から噴煙と溶岩。絵は戦闘で使う）

    // 火口の噴煙と溶岩（2026-10-24 ユーザー判断。鬼王の板の代わり）：寛保岳の火口（行 101・列 115。標高の窪み）と、江良岳の頂（城の東 26 m）。
    // 噴煙＝灰〜白のドットの塊が、もくもく上がって風で流れ、ふくらんで薄れる。溶岩＝火口のふちから赤〜橙の粒がときどき噴き上がって落ちる。夜は溶岩が強く光り、噴煙の下側が赤く照らされる。板だけ（光源は増やさない）
    {
      const mkTex = (draw) => { const cv = document.createElement('canvas'); cv.width = cv.height = 16; draw(cv.getContext('2d')); const t = new T.CanvasTexture(cv); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; return t; };
      const puffTex = mkTex(c => { c.fillStyle = '#fff';
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy) + (((x * 7 + y * 13) % 5) - 2) * 0.35; if (d < 7.2) { c.globalAlpha = d < 4.5 ? 1 : 0.75; c.fillRect(x, y, 1, 1); } } });
      const lavaTex = mkTex(c => { c.fillStyle = '#ffd070'; c.fillRect(5, 5, 6, 6); c.fillStyle = '#ff7a20'; c.fillRect(4, 6, 8, 4); c.fillRect(6, 4, 4, 8); });
      const VENTS = [{ r: 101, c: 115, k: 1.0 }, { x: 'castle', k: 0.7 }];
      const cs0 = placeAt('江良岳');
      const vents = VENTS.map(v => { const x = v.x === 'castle' ? (cs0 ? cs0.x + 26 : null) : v.c * cell, z = v.x === 'castle' ? (cs0 ? cs0.z : null) : v.r * cell; return x == null ? null : { x, z, y: groundY(x, z), k: v.k }; }).filter(Boolean);
      const NS = light ? 12 : 30, NL = light ? 5 : 14, WIND = [0.8, 0.35];   // 風：東へ流れる（x, z の向き）
      const smoke = [], lava = [];
      let seedV = 777; const rv = () => { seedV = (seedV * 1664525 + 1013904223) >>> 0; return seedV / 2 ** 32; };
      vents.forEach((v, vi) => {
        for (let i = 0; i < NS; i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, fog: true, opacity: 0 })); sp.renderOrder = 1; scene.add(sp); smoke.push({ sp, v, ph: i / NS, life: 11 + rv() * 3, jx: (rv() - 0.5) * 16, jz: (rv() - 0.5) * 16 }); }
        for (let i = 0; i < NL; i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: lavaTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, opacity: 0 })); sp.renderOrder = 2; scene.add(sp); lava.push({ sp, v, ph: rv(), per: 2.4 + rv() * 2.0, a: rv() * 6.28, sp0: 12 + rv() * 10 }); }
      });
      const glows = vents.map(v => { const g = new T.Sprite(new T.SpriteMaterial({ map: castleLight ? castleLight.halo.material.map : null, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, opacity: 0, color: 0xff6a28 })); g.position.set(v.x, v.y + 8, v.z); g.scale.set(70 * v.k + 20, 50 * v.k + 14, 1); scene.add(g); return g; });
      let tv = 0;
      volcFx = { update(dt, S) {
        tv += dt; const night = S ? Math.max(0, Math.min(1, (S.night - 0.04) / 0.5)) : 0;
        for (const m of smoke) {
          const a = (tv / m.life + m.ph) % 1, v = m.v, h = a * 260 * v.k + 4, g = (0.35 + 0.65 * a) * 60 * v.k + 14;   // 上へ・ふくらむ
          m.sp.position.set(v.x + m.jx * a + WIND[0] * a * a * 70 * v.k, v.y + 6 + h, v.z + m.jz * a + WIND[1] * a * a * 70 * v.k); m.sp.scale.set(g, g, 1);
          const al = (a < 0.08 ? a / 0.08 : 1) * Math.pow(1 - a, 1.1) * 0.95, c = m.sp.material.color, lo = Math.max(0, 1 - a * 3.2);
          const gr = 0.52 + 0.4 * a; c.setRGB(gr, gr, gr * 1.02);   // 下は濃い灰、上へ行くほど白っぽく
          if (night > 0) c.lerp(new T.Color(1.0, 0.42, 0.22), night * lo * 0.85);   // 夜：噴煙の下側が溶岩の光で赤く
          if (night > 0) c.multiplyScalar(1 - 0.45 * night * (1 - lo));
          m.sp.material.opacity = al;
        }
        glows.forEach(g => { g.material.opacity = (0.28 + 0.5 * night) * (0.85 + 0.15 * Math.sin(tv * 3.1)); });
        for (const m of lava) {
          const a = ((tv / m.per + m.ph) % 1), v = m.v, t = a * 2.4, vy = 30 * v.k + m.sp0, up = vy * t - 9.8 * t * t * 0.9;
          const on = a < 0.55 && up > -2 ? 1 : 0, rr = (6 + 5 * a) * v.k;
          m.sp.position.set(v.x + Math.cos(m.a) * rr * t * 0.6, v.y + 3 + Math.max(0, up), v.z + Math.sin(m.a) * rr * t * 0.6);
          const sz = 6 + night * 2.5; m.sp.scale.set(sz, sz, 1); m.sp.material.opacity = on * (0.75 + 0.25 * night);
        }
      } };
    }

    function resize() {
      const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
      if (dots) renderer.setPixelRatio(Math.min(1, dots / h));
      renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize); ro.observe(host); resize();

    const camPos = new T.Vector3(), camLook = new T.Vector3(), camGood = new T.Vector3(0, 30, 0), lookGood = new T.Vector3(0, 30, 30), fin3 = v => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
    // 線 a→b が地面の上をどれだけ離れて通るか（m。負なら地面をくぐる＝隠れる）。両端の近く（主人公の足もとの道）は見ない
    const OCC_CLR = 0.5, occFix = new T.Vector3();
    function occClear(a, b) {
      let m = Infinity;
      for (let i = 1; i < 16; i++) { const t = i / 16 * 0.92, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, gy = groundY(x, z); if (Number.isFinite(gy)) m = Math.min(m, a.y + (b.y - a.y) * t - gy); }
      return m;
    }
    const SLOPE_PULL = 2.5;   // 坂のカメラ：勾配 10% で後ろへ引く距離（m×HS。2026-10-28 試走 No.28：角度を上げるのはよいが、そのぶん少し遠くに。見比べ用に window.__rq.slopePull で変えられる）
    let first = true, crank = 0, zoom = 0, zoomTo = 0, heroOff = null, lookD = 30, alley = 0, uturnP = 1, slopeCam = 0; const heroAt = new T.Vector3();
    // 戦闘中は主人公と地名の看板を隠し、前（敵のいるほう）に寄って見る
    const setBattle = on => { zoomTo = on ? 1 : 0; signsOn = !on; sprites.forEach(sp => { sp.visible = signsOn; }); };
    // ride：RQ.ride.createRide() の結果。moving：漕いでいるか
    function update(ride, dt, moving, cad, speed = 0) {   // speed：速さ（m/s）
      // テスト用：window.__rq.cam = { x, y, z, lx, ly, lz } を入れると、そのカメラで描く（ランドマークなどを近くから確かめる）。groundY も渡す
      root.__rq.groundY = groundY; root.__rq.built = built; root.__rq.scene = scene; root.__rq.camera = camera; root.__rq.tunh = TUNH;
      // テスト用：火山の演出（噴煙・溶岩の粒・赤い光の板・城のかがり火・赤いもや）の今の状態。消えたときに呼んで、中身を見る（2026-10-24）
      root.__rq.fxState = () => { let add = 0, addOn = 0, spr = 0; scene.traverse(o => { if (o.isSprite) { spr++; if (o.material.blending === T.AdditiveBlending) { add++; if (o.visible && o.material.opacity > 0.01) addOn++; } } });
        const gl = renderer.getContext(); return { castleLight: !!castleLight, volcFx: !!volcFx, haloOpacity: castleLight ? +castleLight.halo.material.opacity.toFixed(3) : null, flames: castleLight && castleLight.flames ? castleLight.flames.length : null, flameVisible: castleLight && castleLight.flames ? castleLight.flames.filter(f => f.visible).length : null, sprites: spr, additive: add, additiveOn: addOn, programs: renderer.info.programs ? renderer.info.programs.length : null, glError: gl.getError(), contextLost: gl.isContextLost(), night: lastNight }; };
      if (root.__rq.hold3d) return;   // テスト用：3D を描き直さない（前のコマのまま）。描画の重いクラウドで、戦闘の動きを撮るときに使う
      const dbg = root.__rq.cam;
      if (dbg) {
        GU.uTime.value += dt;
        if (dbg.hx != null) { hero.visible = true; hero.position.set(dbg.hx, dbg.hy + 0.6, dbg.hz); hero.userData.set(WALK[Math.floor((dbg.cyc != null ? dbg.cyc * 4 : dbg.f) || 0) % 4]); if (dbg.cyc != null) { pose(hero, hero.position.clone().setY(dbg.hy), dbg.cyc, true); heroShadow.visible = true; heroShadow.position.set(dbg.hx, dbg.hy + 0.12, dbg.hz); const wp = SPR.walkPose(dbg.cyc); heroShadow.scale.set(HERO_H * (0.5 - 0.1 * wp.h), HERO_H * 0.12, 1); heroShadow.material.opacity = 0.45 - 0.2 * wp.h; } }   // 主人公も出す（動いているところを撮る用）
        const fov = dbg.fov || 65; if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
        camera.position.set(dbg.x, dbg.y, dbg.z); camera.lookAt(dbg.lx, dbg.ly, dbg.lz); cave(dt, camera.position, hero.visible ? hero.position : null); renderer.render(scene, camera); return;
      }
      zoom += (zoomTo - zoom) * Math.min(1, dt * 2);
      hero.visible = zoom < 0.3; heroShadow.visible = hero.visible;
      const fov = 65 - 25 * zoom;
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
      // 体の向き（と左側通行のずらし）は、いまいる道の向き（すぐ先 4 m）。カメラが見る先は、まっすぐな道では 30 m 先、
      // 九十九折りなど急なカーブでは近く（12 m 先）にして、道が画面に映るようにする。カメラの位置は、道の上の少し後ろ（折り返しでも道の上）
      const inf = RD.info(ride), here0 = at3(inf.lat, inf.lon), pn = RD.ahead(ride, 4), near0 = at3(pn.lat, pn.lon);   // 先は、分かれ道ではいまの向きで曲がった道
      const fx = near0.x - here0.x, fz = near0.z - here0.z, fl = Math.hypot(fx, fz) || 1;   // 進む向き
      const far30 = RD.ahead(ride, 30), f30 = at3(far30.lat, far30.lon), gx = f30.x - here0.x, gz = f30.z - here0.z;
      const turn = Math.acos(Math.max(-1, Math.min(1, (fx * gx + fz * gz) / (fl * (Math.hypot(gx, gz) || 1)))));   // 30 m 先までの曲がり（rad）
      const wantD = 30 - 18 * Math.max(0, Math.min(1, (turn - 0.17) / 0.88));   // 10°までは 30 m、60°以上で 12 m
      lookD += (wantD * HS - lookD) * Math.min(1, dt * 2);   // 急に切り替えない
      const pa = RD.ahead(ride, lookD), ahead0 = at3(pa.lat, pa.lon);
      heroOff = follow(heroOff, laneVec(fx, fz), Math.min(1, dt * 4)) || [0, 0];   // 左側通行：進む向きの左へ
      const here = lane(here0, heroOff), ahead = lane(ahead0, heroOff);
      { const stA = RD.stateAt(ride, lookD); here.y += liftS(inf.road, inf.s); ahead.y += liftS(stA.road, stA.s); }   // 高架の上では、主人公・カメラの先も持ち上げる
      heroAt.copy(here);
      // 狭い路地（家が 6 m 以内）：カメラを近め・高めに寄せる（家の壁にめり込まず、路地の先が画面の真ん中に見える）。なめらかに切り替える
      const inAlley = (featView && featView.near(here.x, here.z, 6)) || forestNear(here.x, here.z, 7.5) ? 1 : 0; alley += (inAlley - alley) * Math.min(1, dt * 2.5);
      const pull = (root.__rq.slopePull != null ? root.__rq.slopePull : SLOPE_PULL) * slopeCam * (1 - zoom) * HS;   // 坂でカメラを上げたぶん、少し後ろへ引く（2026-10-28 試走 No.28。角度はそのまま。下の wantPos）
      const bk = ((9 - 4 * alley) - 7 * zoom) * HS + pull; let bx = here.x - fx / fl * bk, bz = here.z - fz / fl * bk;
      {   // カメラは、いまの道の上の bk m 後ろ（道の始めに近いときは、まっすぐ後ろ）。折り返しでも道の外（斜面の中）に出ない。トンネルの中も同じ（曲がった筒の壁の外に出ないように）
        const rd = net.roads[ride.road], sb = ride.s - ride.dir * bk;
        if (sb > 0 && sb < rd.len) { const pb = RD.pointAt(rd, sb), v = at3(pb.lat, pb.lon); bx = v.x + heroOff[0]; bz = v.z + heroOff[1]; }
      }
      const back = new T.Vector3(bx, groundY(bx, bz) + liftS(ride.road, ride.s - ride.dir * bk), bz);
      GU.uTime.value += dt;
      // 歩きと走り（2026-10-24 ユーザー判断）：時速 20 km 以上で走る4コマ、17 km 未満で歩きに戻る。走りのコマ送りは速さに合わせて（GT.runRate）
      const kmh = Math.abs(speed || 0) * 3.6;
      const heroRun = GT.canRunAs({ run2d: heroRun2d, use3d: !!H3 && (root.RQ.hero3d.enabled || heroForce3) });   // 3D なら8人とも走る（2026-10-28 試走 No.7・25）
      heroRunning = moving && GT.running(heroRunning, kmh, heroRun);
      if (moving) crank += (heroRunning ? GT.runRate(kmh) : Math.max(cad, 40) / 60) * dt;
      // 歩くときは1歩ごとに弾み、左右に少し揺れる（足踏みしている感じ）。止まると立つ。
      // 走りも1歩に1回（1巡り＝4コマ＝2歩で、walkPose も1巡りに2回弾む）。弾みは小さく（絵の4コマに上下の動きがあるので。2026-10-25 ユーザー指摘「ぴょんぴょんしすぎ」）
      const amp = heroRunning ? runAmp() : 1;
      pose(hero, here, moving ? crank : 0, moving, amp);
      const use3 = !!H3 && (root.RQ.hero3d.enabled || heroForce3);
      if (use3) {   // ピクセル化したローポリ：板の位置を足もとに、大きさと向きは 3D の戦士（体の弾みは戦士の動きに入っている）
        const C = Math.atan2(camera.position.x - here.x, camera.position.z - here.z);   // 戦士から見たカメラの向き
        const cr = heroRunning ? GT.runRate(kmh) : Math.max(cad, 40) / 60;   // 1 巡り（2 歩）の速さ
        H3.draw(!moving ? 'stand' : heroRunning ? 'run' : 'walk', crank, Math.atan2(fx, fz) - C, { hemi: heroLamp(), sun, C }, kmh / 3.6 / cr);   // 最後＝1 巡りで進む距離 m（足の振り幅を合わせる）
        hero.material.map = H3.tex; hero.material.rotation = 0;
        hero.center.set(0.5, H3.pad); hero.scale.set(H3.w, H3.h, 1); hero.position.copy(here).add(new T.Vector3(0, 0.6 * HS, 0));   // 足の裏は、今の板の足もとと同じ高さ（板は here + 0.6·HS。2026-10-26 ユーザー指摘：地面に埋まって見える）
      } else if (h3Was) { hero.center.set(0.5, 0); }
      h3Was = use3;
      const sh = heroShadow, wp = moving ? SPR.walkPose(crank) : { h: 1 }, wh = 0.5 + (wp.h - 0.5) * amp;   // 影も弾みに合わせる
      sh.position.copy(here).add(new T.Vector3(0, 0.12, 0)); sh.scale.set(HERO_H * (0.5 - 0.1 * wh), HERO_H * 0.12, 1); sh.material.opacity = 0.45 - 0.2 * wh;
      root.__rq.heroGait = { running: heroRunning, kmh, canRun: heroRun };   // テスト用
      if (!use3) hero.userData.set(!moving ? 0 : heroRunning && heroRun2d ? 3 + GT.RUN[Math.floor(crank * 4) % 4] : WALK[Math.floor(crank * 4) % 4]);   // 歩きは 立ち → 足 → 立ち → もう片足（ペダル1回転で1巡り）。走りは4コマ
      // 坂のカメラ（2026-10-27 ユーザー判断 B）：勾配がきついほどカメラを高くして上から見る（坂に角度がついて見える）。勾配 2% から上げはじめ、10% で 3 m（×HS）高く。平らに戻ればもとの真後ろ。
      // 酔わないよう、ゆっくり（約 3 秒で追う）。トンネルの中は上げない
      { const g = Math.abs(inf.grade || 0), want = Math.max(0, Math.min(1, (g - 0.02) / 0.08)) * (1 - tunF); slopeCam += (want - slopeCam) * Math.min(1, dt * 0.35); root.__rq.slopeCam = slopeCam; }   // テスト用
      const wantPos = back.add(new T.Vector3(0, (2.8 + 1.4 * alley - 1.2 * zoom + 3.0 * slopeCam * (1 - zoom)) * HS, 0)), wantLook = ahead.add(new T.Vector3(0, (1.4 + 1.2 * zoom) * HS, 0));
      wantPos.y = Math.max(wantPos.y, here.y + 2.2 * HS);
      if (slopeCam > 0.001) { wantLook.lerp(here, 0.65 * slopeCam * (1 - zoom)); wantLook.y = Math.min(wantLook.y, here.y + (1.4 - 0.3 * slopeCam) * HS); }   // 坂で上げたカメラは、見る先を主人公寄り・主人公の高さまでにして、主人公が画面の下から外れないように（登りは先が高い）
      if (pull > 0.001) { const hz = Math.hypot(wantPos.x - wantLook.x, wantPos.z - wantLook.z); wantPos.y += pull * (wantPos.y - wantLook.y) / Math.max(1, hz - pull); }   // 後ろへ引いたぶん高くして、見下ろす角度は引く前と同じに
      for (let t = 0; t < 8 && ((featView && featView.near(wantPos.x, wantPos.z, 1.2)) || forestNear(wantPos.x, wantPos.z, 1.3)); t++) { wantPos.x += (here.x - wantPos.x) * 0.3; wantPos.z += (here.z - wantPos.z) * 0.3; wantPos.y += 0.3; }   // 家の中に入りそうなら、主人公のほうへ寄せて少し上げる
      // 地形の高さが NaN の所（2026-10-27 試走：トンネルのある道の切り盛りで NaN が出ていた）を通っても、カメラに NaN を入れない。
      // 一度 NaN になると、なめらかに追う計算で NaN のまま戻らず、空の色だけの画面（白い画面）になる。高さが分からないときは今のカメラの高さのまま
      if (!Number.isFinite(wantPos.y)) wantPos.y = Number.isFinite(camPos.y) && !first ? camPos.y : 30;
      if (!Number.isFinite(wantLook.y)) wantLook.y = Number.isFinite(camLook.y) && !first ? camLook.y : 30;
      if (first) { camPos.copy(wantPos); camLook.copy(wantLook); first = false; }
      const k = Math.min(1, dt * 3);
      if (uturnP < 1) {   // 引き返し：カメラは主人公のまわりを半周して、新しい後ろへ回る（0.9 秒）。見る先は、主人公から新しい先へ
        uturnP = Math.min(1, uturnP + dt / 0.9); const e = uturnP * uturnP * (3 - 2 * uturnP);
        const rx = wantPos.x - here.x, rz = wantPos.z - here.z, ang = Math.atan2(rz, rx) + Math.PI * (1 - e), rr = Math.hypot(rx, rz);
        camPos.set(here.x + Math.cos(ang) * rr, wantPos.y, here.z + Math.sin(ang) * rr);
        camLook.set(here.x + (wantLook.x - here.x) * e, here.y + 1.4 * HS + (wantLook.y - here.y - 1.4 * HS) * e, here.z + (wantLook.z - here.z) * e);
      } else { camPos.lerp(wantPos, k); camLook.lerp(wantLook, k); }
      // 家の中に入らない（2026-10-26 ユーザー指摘：城に近い町の曲がり角で、カメラが家の中にめり込む）。カメラは目標の位置へなめらかに近づくので、曲がり角では内がわの家をななめに横切る。壁から 1 m 以内に入ったら、目標の位置（家をよけてある）→ 主人公のほうへ、家から出るまで押し戻す
      if (featView && featView.near(camPos.x, camPos.z, 1.0)) for (let t = 0; t < 12 && featView.near(camPos.x, camPos.z, 1.0); t++) { const tx = t < 6 ? wantPos.x : here.x, tz = t < 6 ? wantPos.z : here.z; camPos.x += (tx - camPos.x) * 0.45; camPos.z += (tz - camPos.z) * 0.45; camPos.y += 0.15; }
      // 地形にめり込みそうなら（トンネルの口のまわりなど）、主人公のほうへ寄せて上げる（2026-10-24。家の中に入りそうなときと同じ）。トンネルの中は道の面（groundY）が基準
      for (let t = 0; t < 10 && !root.__rq.noCamFix; t++) { const gy = groundY(camPos.x, camPos.z); if (!Number.isFinite(gy) || camPos.y >= gy + 1.0 * HS) break; camPos.x += (here.x - camPos.x) * 0.25; camPos.z += (here.z - camPos.z) * 0.25; camPos.y = Math.max(camPos.y, gy + (1.0 + 0.2 * t) * HS); }
      root.__rq.camClear = camPos.y - groundY(camPos.x, camPos.z);   // テスト用：カメラの地形からの高さ
      if (fin3(camPos) && fin3(camLook)) { camGood.copy(camPos); lookGood.copy(camLook); } else { camPos.copy(camGood); camLook.copy(lookGood); root.__rq.camNaN = (root.__rq.camNaN || 0) + 1; }   // それでも NaN なら、前のコマのカメラに戻す（テスト用に数える）
      {   // 主人公を地面に隠さない（2026-10-28 試走：九十九折りの折り返しで、カメラが斜面の向こうに回り、主人公が見えないコマがあった）。
        // カメラから主人公の胸への線が地面をくぐる（地面との差が OCC_CLR m より小さい）なら、隠れない所まで上げる・主人公のほうへ寄せる（いちばん動きの少ない形）。
        // 急にガクッとしないよう、ずらし occFix はなめらかに（よけるのは速く、戻すのはゆっくり）。カメラの元の位置 camPos は変えない（戻ったら元のカメラ）
        const chest = here.clone(); chest.y += 0.6 * HS + 0.55 * HERO_H;
        const need = new T.Vector3(), base = camPos.clone(); if (root.__rq.camDrop) base.y -= root.__rq.camDrop;   // camDrop：テスト用。カメラを下げて、隠れる形をわざと作る
        if (hero.visible && !root.__rq.noOccFix && occClear(base, chest) < OCC_CLR) {
          // 候補は、上げる量 u と寄せる割合 f の組み。上げるほうを先に（寄せすぎると主人公が大きくなり頭が切れる）：寄せた距離の 2 倍を上げる量と同じ重さに数え、軽い順に試す
          const dh = Math.hypot(here.x - base.x, here.z - base.z), cand = [];
          for (let u = 0; u <= 12 * HS + 1e-6; u += 0.4 * HS) for (const f of [0, 0.15, 0.3, 0.45, 0.6]) cand.push([u + 2 * f * dh, u, f]);
          cand.sort((a, b) => a[0] - b[0]);
          for (const [, u, f] of cand) { const c = new T.Vector3(base.x + (here.x - base.x) * f, base.y + u, base.z + (here.z - base.z) * f); if (occClear(c, chest) >= OCC_CLR) { need.copy(c.sub(base)); break; } }
        }
        occFix.lerp(need, Math.min(1, dt * (need.lengthSq() > occFix.lengthSq() ? 10 : 2)));
        const camAt = base.add(occFix);
        if (hero.visible) { const hid = occClear(camAt, chest) < 0; root.__rq.heroHidden = (root.__rq.heroHidden || 0) + (hid ? 1 : 0); root.__rq.heroFrames = (root.__rq.heroFrames || 0) + 1; }   // テスト用：主人公の胸が地面に隠れたコマの数
        root.__rq.occFix = occFix.length();
        camera.position.copy(camAt); camera.lookAt(camLook);
      }
      root.__rq.camInHouse = featView ? featView.near(camPos.x, camPos.z, 0.5) : 0;   // テスト用：カメラが家（の壁から 0.5 m 以内）にあるか
      cave(dt, camPos, here);
      renderer.render(scene, camera);
    }
    function dispose() {
      gone = true; ro.disconnect();
      // 材質は配列のこともある（面ごとに違う材質の箱。features-view.js の城下町）。配列の .map は Array の関数なので、1つずつ片付ける
      const free = m => { if (!m) return; if (m.map && m.map.isTexture) m.map.dispose(); m.dispose(); };
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach(free); else free(o.material); });
      if (H3) H3.dispose();
      for (const o of ghostObj.values()) if (o.h3) o.h3.dispose(); for (const p of pool3) p.h3.dispose(); pool3.length = 0;
      // WebGL の文脈もすぐ手放す（2026-11-09 試走・判断 63A：ユーザー「2人目を始めた時から動作が少し重い」。dispose だけでは文脈がガベージコレクトまで残り、
      // 旅のたびに 2 つずつ増えていた。iPhone では文脈の数と GPU のメモリが少ない）
      try { renderer.forceContextLoss(); } catch (_) {}
      renderer.dispose(); renderer.domElement.remove();
    }
    // ゴースト（他のライダー）：主人公と同じドット絵の板（同じ向き＝後ろ姿、対向＝正面）を半透明で、近くにいる間だけ出す。
    // 頭の上に名前の札（近くにいる間だけ。遠いほど大きくして読めるようにする）。list は RQ.ghost.frame() の結果。戦闘中は隠す（setBattle）
    const HERO4 = ['warrior', 'wizard', 'monk', 'priest', 'valkyrie', 'elf', 'samurai', 'mercenary'], ghostObj = new Map(), GHOST_FRAMES = [['back', 0], ['back', 1], ['back', 2], ['front', 0]];
    function nameTag(text) {
      const cv = document.createElement('canvas'), ctx = cv.getContext('2d'), fs = 40, font = `${fs}px DotGothic16, "Hiragino Sans", "Yu Gothic UI", sans-serif`;
      ctx.font = font; const w = Math.ceil(ctx.measureText(text).width) + 28; cv.width = w; cv.height = fs + 20; ctx.font = font;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, w, cv.height); ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 14, cv.height / 2 + 1);
      // 深さは書かない（2026-10-28 試走 No.32：つづら折りの坂で侍の頭だけ消えた。カメラと主人公のあいだのゴーストの札は、近いと見えないくらい薄いが、
      // 四角ぜんぶの深さを書くので、あとから描く主人公（renderOrder 4）の頭が札のうしろで深さに負けて抜けた。坂でカメラを上げると、札が主人公の頭に重なりやすい）
      const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), depthTest: true, depthWrite: false, fog: false })); sp.userData.ar = w / cv.height; scene.add(sp); return sp;
    }
    // ゴーストが主人公に重なって見失わないように（2026-10-22 ユーザー判断）：主人公の近く（前後左右 8〜14 m）・カメラと主人公の間（カメラから 6〜12 m）のゴーストは半透明（30〜40%）にして、名前の札も薄くする。
    // opt.spread（秒）：レースのスタート。9人が1か所に重ならないよう、道幅の中で横に少しずつずらして並べ、その秒数かけて左側通行の位置へ戻す（見た目だけ。タイムと順位は変えない）
    const ramp = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    // 旅人の絵の高さ：主人公の絵を基準（HERO_H）に、NPC の後ろ姿は rows（体の高さの基準）と body から決める（子どもは小さく、絵が体より高い NPC は絵の高さぶん）
    const ghostH = id => { const a = SPR.get(id, 'back', 0), r = SPR.get('warrior', 'back', 0); return a.scale && r.scale && a.h ? HERO_H * (a.h * a.scale) / (r.h * r.scale) : HERO_H; };
    // 3D の枠（2026-10-28 ユーザー判断：共有のゴーストをたくさん走らせ、近くだけ 3D にして負荷を低く保つ）。上限（CAP3＝5 人、軽い画面は 2 人）を、カメラに近い順に渡す。
    // IN3 m より近い人がもらい、OUT3 m（IN3 より少し遠く＝行ったり来たりでちらつかない）より離れた人・見えなくなった人は手放す。枠が埋まっていても、いちばん遠い持ち主より STEAL m 以上近い人が来たら、その持ち主から回す。
    // 作り直し（組み立て＋色違い）は重いので、作るのは 1 回の更新で 1 人・0.4 秒に 1 人まで。手放した 3D は、同じ見た目（職業と色違い）の人のために POOL3 個まで取っておく（同じ人が出たり入ったりしても作り直さない）
    const CAP3 = light ? 2 : 5, IN3 = light ? 40 : 90, OUT3 = IN3 + (light ? 10 : 20), STEAL = 25, POOL3 = 4, pool3 = [], MAKE_GAP = 400; let made3At = -1e9;   // MAKE_GAP：新しく作るのは 0.4 秒に 1 人まで（作るのに 13〜90 ms。続けて作ってカクつかない）
    const key3 = o => o.look + '|' + (o.variant || 0);
    function release3(o) {
      if (!o.h3) return;
      if (o.on3) { o.sp.center.set(0.5, 0); o.on3 = false; o.sp.userData.set(0); }   // 板の絵に戻す（手放した 3D の絵を貼ったままにしない）
      pool3.push({ key: key3(o), h3: o.h3 }); if (pool3.length > POOL3) pool3.shift().h3.dispose();
      o.h3 = undefined; o.h3Drawn = false;
      const st = root.__rq.ghost3d || (root.__rq.ghost3d = { made: 0, reused: 0, released: 0, ms: [] }); st.released++;
    }
    function assign3() {
      const plan = root.RQ.ghost.slots3d([...ghostObj].map(([id, o]) => ({ id, has: !!o.h3, shown: !!o.shown, vis3: !!o.vis3, dd: o.dd == null ? 1e9 : o.dd, pri: !!o.pri })), { cap: CAP3, inD: IN3, outD: OUT3, steal: STEAL });   // pri：試練のペースメーカーは先に（決して消さない）
      for (const id of plan.release) release3(ghostObj.get(id));
      const want = plan.take != null ? ghostObj.get(plan.take) : null; if (!want) return;
      const st = root.__rq.ghost3d || (root.__rq.ghost3d = { made: 0, reused: 0, released: 0, ms: [] }), k = pool3.findIndex(p => p.key === key3(want));
      if (k >= 0) { want.h3 = pool3.splice(k, 1)[0].h3; st.reused++; return; }
      const t0 = performance.now(); if (t0 - made3At < MAKE_GAP) return; made3At = t0;
      want.h3 = root.RQ.hero3d.create(T, { heroH: HERO_H, heroId: want.look, shared: true, px: 96, variant: want.variant });
      st.made++; st.ms.push(Math.round(performance.now() - t0)); if (st.ms.length > 50) st.ms.shift();   // テスト用：作った数・使い回した数・作るのにかかった ms
    }
    function updateGhosts(list, t, opt = {}) {
      const nSlot = list.length;
      list.forEach((g, gi) => {
        let o = ghostObj.get(g.id);
        const on = g.show && zoomTo < 0.5;
        if (!on) { if (o) { o.shown = false; o.sp.visible = false; o.tag.visible = false; if (o.glow) o.glow.visible = false; } return; }
        if (!o) {
          const look = HERO4.includes(g.hero) || (g.pacer && root.RQ.hero3d && root.RQ.hero3d.available(g.hero)) ? g.hero : HERO4[[...String(g.id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 4], run2d = SPR.canRun(look);   // 走る絵（板の 4〜7）があるか。走るかどうかは、3D で描く主人公（8人とも）も（下の o.canRun。2026-10-28 試走 No.7・25）
          const sp = billboard(look, [...GHOST_FRAMES, ...(run2d ? RUN_FRAMES : [])], ghostH(look), true); sp.material.opacity = 0.7; sp.material.depthWrite = false; sp.renderOrder = 2;
          const tag = nameTag(g.name); tag.renderOrder = 3; o = { sp, tag, canRun: run2d, run2d, run: false, cyc: 0, look, variant: root.RQ.heroColors ? root.RQ.heroColors.pick({ name: g.name, hero: look }) : 0 }; ghostObj.set(g.id, o);   // 色違い（2026-10-28 ユーザー指示。game/herocolors.js）：旅人・ゴースト・ペースメーカーは名前と職業で 1〜3、自分の主人公は元の色
        }
        const now = performance.now() / 1000, dtr = o.at != null ? Math.min(0.5, now - o.at) : 1; o.at = now;
        const lv = g.hd ? laneVec(g.hd[0], -g.hd[1]) : null;   // 左側通行：進む向き（東・北 → x・z）の左へ。向きが分からない間は前のまま
        let want = lv;
        if (lv && opt.spread && t < opt.spread) {   // レースのスタート：道幅 3 m の中に、横に少しずつずらして並べる（左が＋）
          const w = 1 - t / opt.spread, x = (((gi * 4) % nSlot) + 0.5) / nSlot - 0.5, k = x * 3.0 / LANE;
          want = [lv[0] * (1 - w) + lv[0] * k * w, lv[1] * (1 - w) + lv[1] * k * w];
        }
        if (g.pacer && lv) { const k = 1 + (g.side || 0) / LANE; want = [-lv[0] * k, -lv[1] * k]; }   // 試練のペースメーカーは、主人公（左側通行の位置）の右側を走る。去る人は、さらに道の外（右）へよける
        o.off = follow(o.off, want, Math.min(1, dtr * 4));
        const p = lane(at3(g.lat, g.lon), o.off || [0, 0]); if (g.road != null) p.y += liftS(g.road, g.s);
        // ゴーストの速さ（旅の時計 t で。2026-10-24）：主人公と同じく、時速 20 km 以上で走り、17 km 未満で歩く。歩きは前のとおり 0.55 巡り/秒
        const dtg = o.tg != null ? Math.max(0, t - o.tg) : 0; o.tg = t;
        if (dtg > 0 && dtg < 2 && o.pp) { const inst = Math.min(80, Math.hypot(p.x - o.pp.x, p.z - o.pp.z) / dtg * 3.6); o.kmh = o.kmh == null ? inst : o.kmh + (inst - o.kmh) * Math.min(1, dtg * 2); }
        o.pp = { x: p.x, z: p.z };
        // 3D で描けるか：3D がオンのとき。後ろ姿の 2D の絵が無い見た目（SPR.hasBack）は、3D を切っても 3D の枠に入れる（板にできないので。2026-11-05 ユーザー判断「1a」）
        o.ok3 = !!(root.RQ.hero3d && root.RQ.hero3d.available(o.look) && (root.RQ.hero3d.enabled || !SPR.hasBack(o.look))); o.pri = !!g.pacer;
        o.canRun = GT.canRunAs({ run2d: o.run2d, use3d: o.ok3 });   // 3D を切ったら、板の走る絵がある人と、3D のままの人だけ
        o.run = GT.running(o.run, o.kmh || 0, o.canRun);
        o.cyc += (o.run ? GT.runRate(o.kmh) : 2.2 / 4) * dtg;
        o.sp.visible = true; pose(o.sp, p, g.face === 'front' ? 0 : o.cyc, g.face !== 'front', o.run ? runAmp() : 1);   // 主人公と同じ（走りも1歩に1回、小さく）
        if (!o.on3) o.sp.userData.set(g.face === 'front' ? 3 : o.run && o.run2d ? 4 + GT.RUN[Math.floor(o.cyc * 4) % 4] : WALK[Math.floor(o.cyc * 4) % 4]);
        // 3D のゴースト（2026-10-26 ユーザー判断）：主人公4人のローポリで走る（記録の職業のモデル）。描く道具は全員で共有。近くのぶんだけ毎フレーム描き、遠くは間引く。人数の上限（軽い画面は 2 人）を超えたぶんは 2D の板
        { const vis3 = o.ok3, dd = camera.position.distanceTo(o.sp.position);
          o.shown = true; o.dd = dd; o.vis3 = vis3;   // 3D の枠は、下の assign3（近い順）が渡したり手放したりする
          const dv = o.dir || [0, 1]; if (g.hd) { o.dir = [g.hd[0], -g.hd[1]]; } else if (o.ppx != null && Math.hypot(p.x - o.ppx, p.z - o.ppz) > 0.01) o.dir = [p.x - o.ppx, p.z - o.ppz]; o.ppx = p.x; o.ppz = p.z;
          if (vis3 && o.h3 && dd < OUT3) {
            o.fr = (o.fr || 0) + 1; if (dd < 30 || o.fr % 3 === 0 || !o.h3Drawn) {
              const d2 = o.dir || dv, C = Math.atan2(camera.position.x - p.x, camera.position.z - p.z), kk = o.kmh || 0, cr = o.run ? GT.runRate(kk) : 2.2 / 4;
              o.h3.draw(kk < 1 ? 'stand' : o.run ? 'run' : 'walk', o.cyc, Math.atan2(d2[0], d2[1]) - C, { hemi, sun, C }, kk / 3.6 / cr); o.h3Drawn = true;
            }
            o.sp.material.map = o.h3.tex; o.sp.material.rotation = 0; o.sp.center.set(0.5, o.h3.pad); o.sp.scale.set(o.h3.w, o.h3.h, 1); o.sp.position.copy(p).add(new T.Vector3(0, 0.6 * HS, 0)); o.on3 = true;
          } else if (o.on3) { o.sp.center.set(0.5, 0); o.on3 = false; o.sp.userData.set(g.face === 'front' ? 3 : 0); }
        }
        (root.__rq.ghostGait || (root.__rq.ghostGait = {}))[g.id] = { run: o.run, kmh: o.kmh, canRun: o.canRun, h3: !!o.h3, on3: !!o.on3, look: o.look, variant: o.h3 ? o.h3.variant : 0 };   // テスト用
        if (!light) { if (!o.glow) o.glow = makeGlow(); const dc = camera.position.distanceTo(o.sp.position); placeGlow(o.glow, p.x, p.y - 0.2 * HS, p.z, 5.5 * HS, dc > 70 ? 0 : (g.pacer ? 0.5 * g.alpha : 0.4) * glowK * (1 - Math.max(0, (dc - 45) / 25))); }
        const dh = Math.hypot(p.x - heroAt.x, p.z - heroAt.z), near = Math.min(ramp(dh, 8, 14), ramp(camera.position.distanceTo(o.sp.position), 6, 12));   // 主人公・カメラに近いほど薄く
        const dcam = camera.position.distanceTo(o.sp.position);
        if (g.pacer) { o.sp.material.opacity = 0.9 * g.alpha; o.tag.material.opacity = 0.85 * g.alpha; }   // ペースメーカーは薄くしすぎない（横に並ぶので、近くても薄くしない。主人公より手前には描かない）。去る人は薄れる
        else {   // 旅のゴースト・旅人はふだん不透明。カメラと主人公のあいだに入って主人公を隠すときだけ半透明（2026-10-28 ユーザー判断。前は全員 35〜70% の半透明。ghost.js の blockK）
          const mid = new T.Vector3(0, 0.5 * HERO_H + 0.6 * HS, 0), bk = hero.visible ? root.RQ.ghost.blockK(camera.position, heroAt.clone().add(mid), p.clone().add(mid), { hw: 0.25 * HERO_H, hh: 0.5 * HERO_H }) : 0;
          o.blk = (o.blk || 0) + (bk - (o.blk || 0)) * Math.min(1, dtr * 8);   // 約 0.1 秒でなめらかに
          o.sp.material.opacity = 1 - (1 - root.RQ.ghost.BLOCK_ALPHA) * o.blk;
          o.tag.material.opacity = 0.15 + 0.35 * near;   // 札はふだんから薄く（約50%）、主人公に近い人は 15%
        }
        // 名前の札は近づいてから（2026-10-24 ユーザー判断：25 m 以内でふわっと出て、30 m でふわっと消える。遠い人は姿だけ）
        const tagK = 1 - ramp(dcam, 25, 30); if (!g.pacer) o.tag.material.opacity *= tagK;
        // カメラのすぐそば（数 m）を通る人は描かない（2026-10-24：レースで、ゴーストがカメラの横を抜けると半透明の大きな姿が画面いっぱいに重なる）。3.5〜7.5 m でふわっと出し、札はさらに遠く（6〜10 m）から
        { const nk = ramp(dcam, 3.5 * HS, 7.5 * HS); o.sp.material.opacity *= nk; o.sp.visible = nk > 0.03; o.tag.material.opacity *= ramp(dcam, 6 * HS, 10 * HS); if (o.glow && nk < 0.03) o.glow.visible = false; }
        if (g.fade != null && g.fade < 1) { o.sp.material.opacity *= g.fade; o.tag.material.opacity *= g.fade; if (o.glow) o.glow.material.opacity *= g.fade; o.sp.visible = o.sp.visible && g.fade > 0.02; }   // 出会う旅人が前後を入れ替えて離れたあと、数秒かけて薄くして消す（encounters.js。2026-10-28 ユーザー指示）
        o.tag.visible = !!g.tag && o.tag.material.opacity > 0.01;
        // 後ろ姿の 2D の絵が無い見た目（SPR.hasBack。エルフ・ワルキューレ・侍・傭兵）のゴーストは、3D を切っても 3D の枠に入れ（上の ok3）、3D で描いていない間
        // （3D の人数の上限を超えた・3D を作っている途中）は板を出さずに消す（コードの仮の絵を出さない。2026-11-05 ユーザー判断「1a」）。名前の札・足もとの明かりも一緒に消す。
        // 試練のペースメーカーは先に枠に入れる（ghost.js の slots3d の pri）ので消えない
        o.noBoard = !o.on3 && !SPR.hasBack(o.look);
        if (o.noBoard) { o.sp.visible = false; o.tag.visible = false; if (o.glow) o.glow.visible = false; }
        { const gg = root.__rq.ghostGait && root.__rq.ghostGait[g.id]; if (gg) { gg.hidden = !!o.noBoard; gg.alpha = +o.sp.material.opacity.toFixed(2); gg.blk = +(o.blk || 0).toFixed(2); gg.dh = +dh.toFixed(1); gg.dcam = +dcam.toFixed(1); } }   // テスト用：濃さと、主人公を隠している度合い
        if (g.tag) { const d = Math.max(1, camera.position.distanceTo(o.sp.position)), sz = Math.min(Math.max(0.9 * HS, d * 0.04), d * 0.09); o.tag.position.copy(o.sp.position).add(new T.Vector3(0, HERO_H + sz * 0.6, 0)); o.tag.scale.set(sz * o.tag.userData.ar, sz, 1); }
      });
      if (ghostObj.size > list.length) {   // 一覧から消えた旅人（出会って離れた人）の板と札を片づける
        const keep = new Set(list.map(g => g.id));
        for (const [id, o] of ghostObj) if (!keep.has(id)) { scene.remove(o.sp); scene.remove(o.tag); if (o.h3) release3(o); if (o.glow) { scene.remove(o.glow); o.glow.material.dispose(); } o.sp.material.dispose(); o.tag.material.map.dispose(); o.tag.material.dispose(); ghostObj.delete(id); }   // 絵（主人公と共有）は片づけない
      }
      assign3();
    }
    // 道端の NPC（2026-10-22 ユーザー要望）：会話の相手が、道の左か右のふち（道の外）に正面を向いて立つ。霧の中から近づくと見えてくる。
    // o：{ char, lat, lon, hd：[東, 北]（道の向き）, side：1＝左・-1＝右 }。null で片づける。戦闘中は隠す（世界の側が片づける）
    let npcSp = null;
    // 道のまん中から（2026-11-09 試走・判断 62A：ユーザー「道に立ってる村人が道の中に半分沈み込んでる場合がある。もう少し道から離れたところに立たせて」→「道の端から 1 m ほど外」）。
    // 見える道の端は、ふちの濃い土の帯（まん中から 2.5 m）。その 1 m 外＝3.5 m。前は 2.6 m で、ふちの帯・土手の面より足が下になることがあった
    const NPC_OFF = 3.5, ROAD_EDGE = 2.5;
    const CAMP_OFF = 7;   // 野営地のテントは、村人より道から遠く（道のまん中から m）
    function setNpc(o) {
      if (npcSp) { scene.remove(npcSp); npcSp.material.map.dispose(); npcSp.material.dispose(); npcSp = null; }
      if (!o) { if (npcGlow) { scene.remove(npcGlow); npcGlow.material.dispose(); npcGlow = null; } return; }
      // 板の透明な所は描かない（alphaTest）：透明な所も奥行きを書くと、あとから描く足もとの明かり（加算の板）がその四角の中だけ消え、夜に人のまわりが黒く見えた（2026-10-29 試走の指摘 23：野草を摘むおばさん）
      const cutout = () => { npcSp.material.alphaTest = 0.5; npcSp.material.needsUpdate = true; };
      if (o.char === 'camp') {   // 野営地（2026-10-27 ユーザー判断）：テントと焚き火の板（assets/landmark/camp.png）を、村人より道から遠く（CAMP_OFF）に。会話は村人と同じく、横を通ると始まる
        const a = (root.RQ.landmarkArt || {}).camp || { w: 118, h: 80, m: 3 }, t = new T.TextureLoader().load('../assets/landmark/camp.png'); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter;
        npcSp = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthTest: true, fog: true })); npcSp.center.set(0.5, 0); npcSp.scale.set(a.m * a.w / a.h, a.m, 1); scene.add(npcSp);
        const l = Math.hypot(o.hd[0], o.hd[1]) || 1, ox = -o.hd[1] / l * CAMP_OFF * o.side, oz = -o.hd[0] / l * CAMP_OFF * o.side, q = at3(o.lat, o.lon), x = q.x + ox, z = q.z + oz;
        const y = Math.min(groundY(x, z), groundY(x + 1.5, z), groundY(x - 1.5, z), groundY(x, z + 1.5), groundY(x, z - 1.5));   // 斜面では低いほうに（板の下が浮かない）
        npcSp.position.set(x, y - 0.05, z); cutout();
        if (!npcGlow) npcGlow = makeGlow(); npcGlow.userData.at = npcSp.position.clone();
        return;
      }
      { const a = SPR.get(o.char, 'front', 0), r = SPR.get('elder', 'front', 0); npcSp = billboard(o.char, [['front', 0]], a.scale && r.scale ? HERO_H * (a.h * a.scale) / (r.h * r.scale) : HERO_H, true); }   // 高さは絵の行数の比（大人 26 行＝主人公の背。子ども 18 行・猫 14 行は小さく。2026-10-27 試走の指摘 No.9「子供はもうちょっと小さく」。前は全員 HERO_H で、子どもも猫も大人と同じ高さだった）
      const l = Math.hypot(o.hd[0], o.hd[1]) || 1, ox = -o.hd[1] / l * NPC_OFF * o.side, oz = -o.hd[0] / l * NPC_OFF * o.side;   // 東・北 → x・z。向きの左（side＝1）か右
      const c = at3(o.lat, o.lon), p = lane(c, [ox, oz]);
      // 足の高さ：その場所の地面と、道の土手の面（道のまん中の地面＋0.2 から、ふちの外 1.8 m で 2.4 m 下がる。roadRibbon の bank）の高いほう。
      // 坂・段差・切り盛りの所でも、地面にも土手にも沈まない（足もとが見えるように 0.03 上げる）
      const bankY = groundY(c.x, c.z) + 0.2 - 2.4 * Math.max(0, NPC_OFF - ROAD_EDGE) / 1.8;   // 土手の面（roadRibbon(W + 0.9, 0.2, bank)）
      p.y = Math.max(p.y, bankY);
      npcSp.position.copy(p).add(new T.Vector3(0, 0.03, 0)); cutout();
      root.__rq.npcFoot = { y: p.y, ground: groundY(p.x, p.z), bank: bankY, off: NPC_OFF };   // テスト用
      if (!npcGlow) npcGlow = makeGlow(); npcGlow.userData.at = p.clone();
    }
    root.__rq.setNpc3d = setNpc; root.__rq.npcSprite = () => npcSp;   // テスト用：道端の NPC をじかに立たせる（フリーライドでも）・いま立っている NPC の板
    // jump：コースを替えて別の場所へ移った（2026-11-07）。次のコマでカメラを新しい場所へすぐ置く（島を横切って流れない）
    return { update, updateGhosts, setBattle, setNpc, uturn: () => { uturnP = 0; }, jump: () => { first = true; uturnP = 1; }, dispose };
  }

  root.RQ.view3d = { create, VIEW_UP };
})(window);
