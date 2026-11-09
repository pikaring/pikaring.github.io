/* 合成器。AudioContext に触るのはこのファイルだけ。音声ファイルは使わず、ファミコン風の声を作る：
   矩形波（pulse。デューティ比 12.5%・25%・50%）、三角波（tri）、ノイズ（noise。ドラム：キック・スネア・ハイハット・シンバル）。
   クラシック風の声（2026-10-21 ユーザー要望）：弦（str）・トランペット（brass）・ホルン（horn）・ティンパニ（timp）。
   録音の曲（recVoice。甘茶の音楽工房の mp3）も、<audio> を BGM のバスに通して鳴らす（音量・オン・オフ・フェードが効く）。
   音は2つのバス（bgm・sfx）に流し、音量を別々に持つ。AudioContext は最初の操作で作って再開する（Electron も最初の操作までは音が出ない）。 */
(function (root) {
  let ctx = null, master = null, noiseBuf = null;
  const bus = {}, waves = {}, busLevel = { bgm: 0.5, sfx: 0.5 }, directs = new Set();
  const LEVEL = { pulse: 0.16, tri: 0.3, noise: 0.14, timp: 0.32 };   // 声ごとの基本の大きさ（合わせたときに音が割れない程度）

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();   // 重なっても割れないように
    master.connect(comp); comp.connect(ctx.destination);
    for (const name of ['bgm', 'sfx']) { bus[name] = ctx.createGain(); bus[name].gain.value = 0.5; bus[name].connect(master); }
    return ctx;
  }
  // 最初の操作の中で呼ぶ。返り値は再開が終わったら解ける Promise
  function resume() {
    const c = ensure();
    if (!c) return Promise.resolve(false);
    return c.state === 'running' ? Promise.resolve(true) : c.resume().then(() => c.state === 'running', () => false);
  }
  const state = () => (ctx ? ctx.state : 'none');
  const ready = () => !!ctx && ctx.state === 'running';
  const now = () => (ctx ? ctx.currentTime : 0);

  // 音量。bus：'bgm' か 'sfx'。g：0〜1
  function setBus(name, g) {
    ensure();
    if (!bus[name]) return;
    bus[name].gain.cancelScheduledValues(ctx.currentTime);
    bus[name].gain.setTargetAtTime(g, ctx.currentTime, 0.02);
    busLevel[name] = g;
    if (name === 'bgm') directs.forEach(h => h.apply());   // バスを通せない録音（下の recVoice）は、<audio> の音量で合わせる
  }
  // バスにつながる音量の節（曲ごと・効果音ごとに作り、フェードや停止に使う）
  function makeGain(name, v = 1) {
    ensure();
    const g = ctx.createGain(); g.gain.value = v; g.connect(bus[name]);
    return g;
  }
  function fade(g, to, sec) {
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(to, t + Math.max(0.005, sec));
  }
  // フェードアウトして切り離す。先に鳴らす予定にした音も、いっしょに消える
  function kill(g, sec = 0.3) {
    fade(g, 0, sec);
    setTimeout(() => { try { g.disconnect(); } catch (_) {} }, sec * 1000 + 100);
  }

  // デューティ比 d の矩形波（PeriodicWave）。ファミコンの 12.5%・25%・50%
  function pulseWave(d) {
    if (waves[d]) return waves[d];
    const N = 48, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
    for (let k = 1; k <= N; k++) { re[k] = Math.sin(2 * Math.PI * k * d) / (Math.PI * k); im[k] = (1 - Math.cos(2 * Math.PI * k * d)) / (Math.PI * k); }
    return (waves[d] = ctx.createPeriodicWave(re, im));
  }
  function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const a = noiseBuf.getChannelData(0);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // 音の大きさの形：すぐ立ち上がり、少し落ちて、音の長さの終わりで止める
  function env(g, t, dur, peak, sus, rel = 0.025) {
    const decay = Math.min(dur, 0.12), end = t + dur;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.linearRampToValueAtTime(peak * sus, t + 0.004 + decay);
    if (end > t + 0.004 + decay) g.gain.linearRampToValueAtTime(peak * sus, end);
    g.gain.linearRampToValueAtTime(0, end + rel);
  }

  // 1音を鳴らす。ev：{ time, ch（pulse・tri・noise）, n（MIDI 番号。noise は 36 キック・38 スネア・42 / 46 ハイハット）, d（秒）, v, duty }。out：つなぐ先の節
  function note(ev, out) {
    if (!ctx) return;
    const t = Math.max(ev.time, ctx.currentTime);
    if (ev.ch === 'noise') return drum(ev, t, out);
    if (ev.ch === 'timp') return timp(ev, t, out);
    if (ORCH[ev.ch]) return orch(ev, t, out);
    const o = ctx.createOscillator(), g = ctx.createGain(), dur = Math.max(0.03, ev.d * 0.92);   // 少し短く切って、音をはっきりさせる
    if (ev.ch === 'tri') o.type = 'triangle'; else o.setPeriodicWave(pulseWave(ev.duty || 0.5));
    o.frequency.value = root.RQ.sequencer.midiToHz(ev.n);
    env(g, t, dur, LEVEL[ev.ch === 'tri' ? 'tri' : 'pulse'] * (ev.v == null ? 1 : ev.v), ev.ch === 'tri' ? 1 : 0.7);
    o.connect(g); g.connect(out);
    o.onended = () => { try { g.disconnect(); } catch (_) {} };
    o.start(t); o.stop(t + dur + 0.06);
  }
  /* クラシック風の声。のこぎり波を2つ少しずらして重ね（合奏の厚み）、ローパスで丸め、遅れてかかるビブラートを付ける。
     lvl：大きさ、det：ずらし（セント）、cut → top：ローパスの周波数（音の高さの何倍か。立ち上がりで開く＝金管の「パッ」）、
     atk・rel：立ち上がりと消え（秒）、vib：ビブラートの深さ（セント） */
  const ORCH = {
    str: { lvl: 0.055, det: 9, cut: 5, top: 6, atk: 0.05, sus: 0.85, rel: 0.14, vib: 12 },
    brass: { lvl: 0.075, det: 4, cut: 1.6, top: 7, atk: 0.03, sus: 0.8, rel: 0.06, vib: 7 },
    horn: { lvl: 0.07, det: 5, cut: 1.2, top: 3.2, atk: 0.05, sus: 0.85, rel: 0.1, vib: 4 },
  };
  function orch(ev, t, out) {
    const P = ORCH[ev.ch], hz = root.RQ.sequencer.midiToHz(ev.n), dur = Math.max(0.05, ev.d * 0.95), end = t + dur;
    const peak = P.lvl * (ev.v == null ? 1 : ev.v), cap = f => Math.min(10000, f);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(cap(hz * P.cut), t);
    f.frequency.linearRampToValueAtTime(cap(hz * P.top), t + P.atk * 1.5);
    f.frequency.setTargetAtTime(cap(hz * (P.cut + P.top) / 2), t + P.atk * 1.5, 0.12);
    const g = ctx.createGain(), atk = Math.min(P.atk, dur * 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.linearRampToValueAtTime(peak * P.sus, t + atk + Math.min(0.1, dur * 0.3));
    g.gain.setValueAtTime(peak * P.sus, end);
    g.gain.linearRampToValueAtTime(0, end + P.rel);
    const lfo = ctx.createOscillator(), depth = ctx.createGain();   // ビブラート（長い音ほど効く）
    lfo.frequency.value = 5.3;
    depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(P.vib, t + 0.35);
    lfo.connect(depth);
    let last;
    for (const d of [-P.det, P.det]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = d;
      depth.connect(o.detune); o.connect(f); o.start(t); o.stop(end + P.rel + 0.02); last = o;
    }
    lfo.start(t); lfo.stop(end + P.rel + 0.02);
    f.connect(g); g.connect(out);
    last.onended = () => { try { g.disconnect(); depth.disconnect(); } catch (_) {} };
  }
  // ティンパニ：音程のある低い「ドーン」。少し高めから落ち着き、ゆっくり消える。打った瞬間の革の音にノイズを少し
  function timp(ev, t, out) {
    const hz = root.RQ.sequencer.midiToHz(ev.n), v = LEVEL.timp * (ev.v == null ? 1 : ev.v), g = ctx.createGain();
    g.connect(out);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(hz * 1.05, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.08);
    o2.type = 'sine'; o2.frequency.value = hz * 1.5; g2.gain.value = 0.35;   // 胴鳴りの上の音
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.connect(g); o2.connect(g2); g2.connect(g);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), gn = ctx.createGain();
    src.buffer = noise(); f.type = 'lowpass'; f.frequency.value = 500;
    gn.gain.setValueAtTime(v * 0.8, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(f); f.connect(gn); gn.connect(g);
    o.start(t); o2.start(t); src.start(t, Math.random() * 0.5);
    o.stop(t + 0.95); o2.stop(t + 0.95); src.stop(t + 0.08);
    o.onended = () => { try { g.disconnect(); } catch (_) {} };
  }
  function drum(ev, t, out) {
    const v = LEVEL.noise * (ev.v == null ? 1 : ev.v), g = ctx.createGain();
    g.connect(out);
    if (ev.n === 36) {   // キック：三角波の音程が急に落ちる
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      g.gain.setValueAtTime(v * 3.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); o.start(t); o.stop(t + 0.2); o.onended = () => { try { g.disconnect(); } catch (_) {} };
      return;
    }
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    src.buffer = noise(); src.loop = true;
    const len = ev.n === 38 ? 0.13 : ev.n === 46 ? 0.16 : ev.n === 49 ? 1.2 : 0.045;   // スネア・開いたハイハット・シンバル・閉じたハイハット
    f.type = ev.n === 38 ? 'bandpass' : 'highpass'; f.frequency.value = ev.n === 38 ? 1800 : ev.n === 49 ? 4500 : 7000;
    g.gain.setValueAtTime(v * (ev.n === 38 ? 2.4 : ev.n === 49 ? 1.1 : 1.4), t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f); f.connect(g);
    src.start(t, Math.random() * 0.5); src.stop(t + len + 0.02);
    src.onended = () => { try { g.disconnect(); } catch (_) {} };
  }

  /* 録音の曲を鳴らす。url：曲のファイル（Opus の webm）、tr：曲（assets/audio/manifest.js の1曲。gain・loop・loopStart・loopEnd）。onError：読めなかったとき。
     2つの <audio> を使い、ループのつなぎ目は RQ.recordings.loopStep の指示で、次の方を音を消して先に鳴らし、位置を合わせ直してから短く重ねる。
     再生の速さを変えても音の高さは保つ（preservesPitch）。Electron と https では BGM のバスに通す。
     Chrome で file:// を開いたとき（試し聞きのページ）はバスに通すと無音になるので、<audio> の音量で鳴らす（direct）。
     返り値：{ start(offset), fade(to, sec), kill(sec), pause(), resume(), setRate(r), position(), seek(t), ended(), tick() }。tick は 25ms ごとに呼ぶ */
  /* 曲ごとの <audio> 2 つ（つなぎ目で交互に使う）と、BGM のバスへの道（MediaElementSource → 音量）を「組」にして、捨てずに使い回す
     （2026-11-07 ユーザー「戦闘が終わるとしばらく無音だね」：前は曲を替えるたびに <audio> を作り直して曲のファイルを読み直し、
     読み終わるまで無音だった。iOS（WebKit）では、操作の外で新しく作った <audio> の play() は断られやすく、画面に触るまで鳴らなかった見込み）。
     - 組は曲（URL）ごとに 1 つ。鳴らし終えたら止めて位置を戻すだけで、src は外さない（次はすぐ鳴る）。
     - 最初の操作の中で、読んである組をすべて一度だけ音を出さずに鳴らして止める（unlockAll。iOS では、操作の中で一度鳴らした <audio> は、
       あとで操作の外でも鳴らせることが多い）。音はバスの手前の音量 0 で消すので、聞こえない。
     - preload(url)：先に読んでおく（最初の操作の前のタイトルの曲・戦闘の間に戻る先のフィールドの曲。music.js）。 */
  const slots = new Map();
  let made = 0;   // 作った <audio> の数（テスト用。場面を行き来しても増えないこと）
  const audioEls = url => [0, 1].map(() => { const a = new root.Audio(url); made++; a.preload = 'auto'; a.preservesPitch = true; return a; });
  const isDirect = () => root.location && root.location.protocol === 'file:' && !(root.rq && root.rq.isElectron);
  function makeSlot(url) {
    const els = audioEls(url), direct = isDirect();
    // バスへの道は、AudioContext があれば先に作っておく（MediaElementSource は 1 つの <audio> に 1 回しか作れないので、組と一緒に持つ）
    const slot = { url, els, direct, gains: null, busy: false, unlocked: false };
    if (!direct && ensure()) slot.gains = els.map(a => { const s = ctx.createMediaElementSource(a), g = ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(bus.bgm); return g; });
    return slot;
  }
  function slotFor(url) {
    let s = slots.get(url);
    if (s && !s.busy) return s;
    if (s) return makeSlot(url);   // 同じ曲が、まだ前の分のフェードアウト中（すぐ戻った）：その間だけ別の組（使い終えたら捨てる）
    s = makeSlot(url); slots.set(url, s); return s;
  }
  function preload(url) { if (bufferMode()) { bytesOf(url); return; } if (!slots.has(url)) slots.set(url, makeSlot(url)); }
  /* ブラウザの自動再生の決まりで、最初の操作の前の play() は断られることがある（AudioContext は動いていても）。
     断られた <audio> は覚えておき、次の操作の中で鳴らし直す（そのままだと、場面が変わるまで鳴らない） */
  const blocked = new Set();
  const play = a => { const p = a.play(); if (p && p.catch) p.catch(e => { if (e && e.name === 'NotAllowedError') blocked.add(a); }); };
  // 操作の中で、まだ鳴らしていない組を、音を出さずに一度鳴らして止める（iOS の自動再生の決まりのため。上）
  function unlockAll() {
    if (bufferMode()) return;   // WebAudio で鳴らすときは要らない（AudioContext を動かせば鳴る）
    slots.forEach(s => {
      if (s.unlocked || s.busy || s.direct || !s.gains) return;
      s.unlocked = true;
      // muted で鳴らす（2026-11-08 試走「ゲーム始まったらいろんな音楽が一斉になっている」：iOS ではバスの手前の音量 0 が効かずに聞こえた）。止めたら muted を戻す
      s.els.forEach(a => { if (a.__want) return; a.muted = true; const p = a.play(); const off = () => { if (!a.__want) { a.pause(); try { a.currentTime = 0; } catch (_) {} } a.muted = false; }; if (p && p.then) p.then(off, () => { a.muted = false; s.unlocked = false; }); else off(); });
    });
  }
  const retry = () => { blocked.forEach(a => { if (a.__want) play(a); }); blocked.clear(); unlockAll(); };
  // WebKit で再生の操作と数えるのは touchend・click・keydown（pointerdown は数えない。https://webkit.org/blog/6784/new-video-policies-for-ios/）。どれでも呼ぶ
  if (root.addEventListener) for (const k of ['pointerdown', 'touchend', 'click', 'keydown']) root.addEventListener(k, retry, true);

  function elVoice(url, tr, { onError } = {}) {
    ensure();
    const R = root.RQ.recordings, XF = R.XF;
    const clock = () => performance.now() / 1000;
    const slot = slotFor(url), els = slot.els, direct = slot.direct;
    slot.busy = true;
    if (!direct && !slot.gains) slot.gains = els.map(a => { const s = ctx.createMediaElementSource(a), g = ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(bus.bgm); return g; });
    els.forEach(a => { a.playbackRate = 1; });
    els.forEach(a => { a.onerror = () => onError && onError(); if (a.error) setTimeout(() => onError && onError(), 0); });
    const go = a => { a.__want = true; play(a); }, stop = a => { a.__want = false; blocked.delete(a); a.pause(); };
    const gains = direct ? null : slot.gains;
    if (gains) gains.forEach(g => { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.value = 0; });
    let cur = 0, st = { pre: false, fixed: false }, rate = 1, paused = false, dead = false;
    let lv = { from: 0, to: 0, t0: 0, sec: 0 }, xf = null;   // 曲全体のフェード、つなぎ目の重ね（{ t0, from, to }）
    const level = () => { const k = lv.sec > 0 ? Math.min(1, (clock() - lv.t0) / lv.sec) : 1; return lv.from + (lv.to - lv.from) * k; };
    const mix = i => {
      if (!xf) return i === cur ? 1 : 0;
      const k = Math.min(1, (clock() - xf.t0) / XF);
      return i === xf.to ? k : i === xf.from ? 1 - k : 0;
    };
    const h = {
      apply() {   // いまの大きさを、それぞれの <audio> に渡す
        const L = level() * (tr.gain || 1);
        els.forEach((a, i) => {
          const v = L * mix(i);
          if (direct) a.volume = Math.max(0, Math.min(1, v * busLevel.bgm));
          else gains[i].gain.setTargetAtTime(v, ctx.currentTime, 0.012);
        });
      },
      start(offset = 0) { try { els[cur].currentTime = offset; } catch (_) {} go(els[cur]); h.apply(); },
      fade(to, sec) { lv = { from: level(), to, t0: clock(), sec }; h.apply(); },
      kill(sec = 0.3) {
        h.fade(0, sec); dead = true;
        // 止めて位置を戻すだけ（src は外さない。組は次に同じ曲を鳴らすときに使う）。使い回さない組（slotFor の一時の組）は捨てる
        setTimeout(() => {
          els.forEach(a => { stop(a); try { a.currentTime = 0; } catch (_) {} });
          if (gains) gains.forEach(g => { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.value = 0; });
          directs.delete(h);
          if (slots.get(url) === slot) slot.busy = false;
          else { els.forEach(a => { a.removeAttribute('src'); a.load(); }); if (gains) gains.forEach(g => { try { g.disconnect(); } catch (_) {} }); }
        }, sec * 1000 + 100);
      },
      pause() { paused = true; els.forEach(stop); if (xf) { cur = xf.to; xf = null; } st = { pre: false, fixed: false }; },
      resume() { if (dead) return; paused = false; go(els[cur]); h.apply(); },
      setRate(r) { rate = r; els.forEach(a => { a.preservesPitch = true; a.playbackRate = r; }); },
      position: () => els[cur].currentTime,
      seek(t) { if (xf) { stop(els[xf.from]); cur = xf.to; xf = null; } stop(els[1 - cur]); st = { pre: false, fixed: false }; try { els[cur].currentTime = t; } catch (_) {} },
      ended: () => !tr.loop && els[cur].ended,
      tick() {
        if (dead || paused) return;
        if (xf && clock() - xf.t0 >= XF) { stop(els[xf.from]); cur = xf.to; xf = null; }
        if (!xf) {
          const r = R.loopStep(st, els[cur].currentTime, tr, rate), b = els[1 - cur];
          st = r.st;
          if (r.act === 'prestart') { try { b.currentTime = Math.max(0, r.offset); } catch (_) {} b.playbackRate = rate; go(b); }
          else if (r.act === 'fix') { if (Math.abs(b.currentTime - r.offset) > 0.03) try { b.currentTime = r.offset; } catch (_) {} }
          else if (r.act === 'swap') xf = { t0: clock(), from: cur, to: 1 - cur };
          else if (r.act === 'jump') { try { els[cur].currentTime = r.offset; } catch (_) {} }   // 時計が止まっていて、つなぎ目を過ぎてしまった
        }
        h.apply();
      },
    };
    if (direct) directs.add(h);
    return h;
  }


  /* iOS（WebKit）では、録音の曲を <audio> ではなく WebAudio（decodeAudioData した AudioBuffer を AudioBufferSourceNode で）鳴らす
     （2026-11-08 試走、iPhone の Bluefy：「戦闘の BGM はちゃんと出るんだけど、フィールドは…一瞬なってまた止まったり、途中で一音だけ鳴ったり」
     「ゲーム始まったらいろんな音楽が一斉になっている」。効果音（WebAudio の合成音）は戦闘のあとも鳴っていた＝WebAudio は操作の外でも鳴る）。
     - ループは AudioBufferSourceNode の loop・loopStart・loopEnd（前奏は最初だけ。つなぎ目は重ねずにそのまま続く）。
     - 曲のファイルは先に取っておき（preload。圧縮のまま、全部で約 12 MB）、鳴らすときに PCM にする（1 曲 50〜60 MB なので、PCM は 3 曲まで覚える）。
       次に鳴りそうな 1 曲（フィールドの間は戦闘、戦闘の間は戻る先のフィールド）は先に PCM にしておく（prepare。music.js）。
     - 再生の速さを変えると音の高さも変わるので、この道では速さは変えない（レースの最後の周の 1.06 倍・回転数に合わせる曲は、元の速さのまま）。
     - PCM にできなかったら（その曲が decode できないブラウザ）、<audio> の道で鳴らす。
     どの道で鳴らすか：iPhone・iPad（と ?bgm=buffer・RQ_BGM_MODE='buffer'）は WebAudio、ほかは <audio>（?bgm=element で戻せる） */
  const isIOS = () => { const n = root.navigator || {}; return /iPhone|iPad|iPod/.test(n.userAgent || '') || (/Macintosh/.test(n.userAgent || '') && (n.maxTouchPoints || 0) > 1); };
  const bgmQuery = () => { try { return new URLSearchParams(root.location.search).get('bgm'); } catch (_) { return null; } };
  const bufferMode = () => { const q = root.RQ_BGM_MODE || bgmQuery(); return q === 'buffer' ? true : q === 'element' ? false : isIOS(); };
  const bytes = new Map(), pcm = new Map(), PCM_KEEP = 3, noDecode = new Set();   // PCM は 今の曲・前の曲・次の曲 の 3 つまで
  const fetchFn = () => root.fetch;
  function bytesOf(url) {
    if (!bytes.has(url)) bytes.set(url, fetchFn()(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).catch(e => { bytes.delete(url); throw e; }));
    return bytes.get(url);
  }
  function pcmOf(url) {
    if (pcm.has(url)) { const p = pcm.get(url); pcm.delete(url); pcm.set(url, p); return p; }   // 使ったものを新しい側へ
    const p = bytesOf(url).then(b => new Promise((ok, ng) => { const r = ctx.decodeAudioData(b.slice(0), ok, ng); if (r && r.then) r.then(ok, ng); }));
    p.catch(() => { pcm.delete(url); noDecode.add(url); });
    pcm.set(url, p);
    while (pcm.size > PCM_KEEP) pcm.delete(pcm.keys().next().value);
    return p;
  }
  function bufVoice(url, tr, { onError } = {}) {
    ensure();
    const out = ctx.createGain(); out.gain.value = 0; out.connect(bus.bgm);
    const clock = () => ctx.currentTime;
    let buf = null, src = null, t0 = 0, off0 = 0, want = null, paused = false, dead = false, fell = null, lv = { from: 0, to: 0, t0: 0, sec: 0 };
    const level = () => { const k = lv.sec > 0 ? Math.min(1, (clock() - lv.t0) / lv.sec) : 1; return lv.from + (lv.to - lv.from) * k; };
    const loopOn = () => !!(tr.loop && tr.loopEnd > tr.loopStart);
    const pos = () => {
      if (!src) return off0;
      let p = off0 + (clock() - t0);
      if (loopOn() && p > tr.loopEnd) p = tr.loopStart + (p - tr.loopStart) % (tr.loopEnd - tr.loopStart);
      return p;
    };
    const stopSrc = () => { if (src) { const s = src; src = null; try { s.onended = null; s.stop(); } catch (_) {} try { s.disconnect(); } catch (_) {} } };
    function play(offset) {
      stopSrc();
      if (!buf || dead || paused) { want = offset; return; }
      const s = ctx.createBufferSource(); s.buffer = buf;
      if (loopOn()) { s.loop = true; s.loopStart = tr.loopStart; s.loopEnd = Math.min(tr.loopEnd, buf.duration); }
      s.connect(out); s.start(0, Math.max(0, Math.min(offset, buf.duration - 0.05)));
      src = s; t0 = clock(); off0 = offset; want = null;
    }
    const h = {
      mode: 'buffer',
      apply() { if (fell) return fell.apply(); out.gain.setTargetAtTime(level() * (tr.gain || 1), ctx.currentTime, 0.012); },
      start(offset = 0) { if (fell) return fell.start(offset); want = offset; play(offset); h.apply(); },
      fade(to, sec) { if (fell) return fell.fade(to, sec); lv = { from: level(), to, t0: clock(), sec }; h.apply(); },
      kill(sec = 0.3) {
        if (fell) return fell.kill(sec);
        h.fade(0, sec); dead = true;
        setTimeout(() => { stopSrc(); try { out.disconnect(); } catch (_) {} }, sec * 1000 + 100);
      },
      pause() { if (fell) return fell.pause(); if (paused) return; const p = pos(); paused = true; stopSrc(); off0 = p; },
      resume() { if (fell) return fell.resume(); if (dead || !paused) return; paused = false; play(off0); h.apply(); },
      setRate() { if (fell) return fell.setRate(...arguments); },   // この道では速さを変えない（音の高さが変わるため。上）
      position: () => (fell ? fell.position() : pos()),
      seek(t) { if (fell) return fell.seek(t); off0 = t; if (src) play(t); },
      ended: () => (fell ? fell.ended() : !tr.loop && !!buf && pos() >= buf.duration - 0.05),
      tick() { if (fell) return fell.tick(); if (!dead) h.apply(); },
    };
    pcmOf(url).then(b => { buf = b; if (!dead && !paused && want != null) { play(want); h.apply(); } }, e => {
      console.warn('曲を PCM にできない。<audio> で鳴らす', url, e && e.message);
      if (dead) return;
      // <audio> の道に替える（今の大きさ・位置から）
      try { out.disconnect(); } catch (_) {}
      fell = elVoice(url, tr, { onError });
      const L = level(); fell.fade(L, 0); if (lv.sec > 0 && lv.to !== L) fell.fade(lv.to, Math.max(0.05, lv.sec - (clock() - lv.t0)));
      if (!paused) fell.start(want != null ? want : 0); else { fell.start(off0); fell.pause(); }
    });
    return h;
  }
  // 次に鳴りそうな曲を先に PCM にしておく（WebAudio の道だけ。<audio> の道では preload と同じ）
  function prepare(url) { if (bufferMode() && ctx && ctx.decodeAudioData && !noDecode.has(url)) pcmOf(url).catch(() => {}); else preload(url); }
  function recVoice(url, tr, o = {}) {
    if (bufferMode() && !noDecode.has(url) && ensure() && ctx.decodeAudioData) return bufVoice(url, tr, o);
    return elVoice(url, tr, o);
  }

  /* ほかのアプリの音楽と混ぜるか（2026-11-08 ユーザー「BGMのオンオフもできたっけ。好きな音楽を聴きたい時もあるんだよね」）。
     W3C の Audio Session（https://w3c.github.io/audio-session/）：ambient は「ほかの音と混ぜられる」。auto のとき、AudioContext だけなら ambient、
     <audio> が鳴っていれば playback（ほかを止めることがある）になる。WebKit は Safari 16.4 から一部に対応（Bluefy＝WKWebView で使えるかは文書に無い）。
     BGM がオフなら ambient にする（効果音だけ鳴らし、ほかのアプリの音楽は止めない）。オンなら auto に戻す。navigator.audioSession が無ければ何もしない */
  function setMix({ bgm }) {
    const as = root.navigator && root.navigator.audioSession;
    if (!as) return false;
    try { const want = bgm ? 'auto' : 'ambient'; if (as.type !== want) as.type = want; return true; } catch (_) { return false; }
  }
  (root.RQ = root.RQ || {}).synth = { resume, state, ready, now, setBus, makeGain, fade, kill, note, recVoice, preload, prepare, unlockAll, bufferMode, setMix, made: () => made, slots: () => slots.size, pcmCount: () => pcm.size };
})(window);
