/* トレーナーとのやり取りの形（読み書きするバイト列）。画面にも Bluetooth にも触らない純粋な関数だけを置く。
   matsuo-koya/tanken-ride（MIT）の parseIBD・parseFEC・fecFrame・parseCPM・sendGrade を移植。 */
(function (root) {
  // 2026-11-07：iPhone の Bluefy が 0x1826 のような数の UUID を読めず「Request payload could not be parsed」になったので、どのブラウザでも 128 ビットの文字で書く（Chrome でも同じ意味）
  const UUID = {
    FTMS: '00001826-0000-1000-8000-00805f9b34fb', IBD: '00002ad2-0000-1000-8000-00805f9b34fb', CP: '00002ad9-0000-1000-8000-00805f9b34fb',          // Fitness Machine: Indoor Bike Data / Control Point
    FEAT: '00002acc-0000-1000-8000-00805f9b34fb', STATUS: '00002ada-0000-1000-8000-00805f9b34fb',                    // Fitness Machine Feature / Status（補正＝スピンダウンに使う）
    CPS: '00001818-0000-1000-8000-00805f9b34fb', CPM: '00002a63-0000-1000-8000-00805f9b34fb',                        // Cycling Power: Measurement
    HRS: '0000180d-0000-1000-8000-00805f9b34fb', HRM: '00002a37-0000-1000-8000-00805f9b34fb',                        // 心拍（表示だけ。ゲームの操作には使わない）
    TFEC: '6e40fec1-b5a3-f393-e0a9-e50e24dcca9e',    // Tacx FE-C over BLE
    TFEC_RX: '6e40fec2-b5a3-f393-e0a9-e50e24dcca9e',
    TFEC_TX: '6e40fec3-b5a3-f393-e0a9-e50e24dcca9e',
  };
  const CRR = 0.004, CW = 0.51;                      // 負荷に添える転がり抵抗と風の係数（tanken-ride と同じ）
  const GRADE_MIN = -0.10, GRADE_MAX = 0.15;

  // FTMS Indoor Bike Data（0x2AD2）
  function parseIBD(dv) {
    let o = 0; const fl = dv.getUint16(o, true); o += 2; const r = {};
    if (!(fl & 1)) { r.speed = dv.getUint16(o, true) / 100; o += 2; }
    if (fl & 2) o += 2;
    if (fl & 4) { r.cad = dv.getUint16(o, true) / 2; o += 2; }
    if (fl & 8) o += 2; if (fl & 16) o += 3; if (fl & 32) o += 2;
    if (fl & 64) { r.power = dv.getInt16(o, true); o += 2; }
    if (fl & 128) o += 2; if (fl & 256) o += 5;
    if (fl & 512) { r.hr = dv.getUint8(o); o += 1; }
    return r;
  }

  // ANT+ FE-C（Tacx の BLE 版と ANT+ スティックで共通）。page 0x19 からパワーと回転
  function parseFEC(dv) {
    const r = {}; if (dv.byteLength < 12 || dv.getUint8(0) !== 0xA4) return r;
    if (dv.getUint8(4) === 0x19) { const c = dv.getUint8(6); if (c !== 0xFF) r.cad = c; r.power = dv.getUint8(9) | ((dv.getUint8(10) & 0x0F) << 8); }
    return r;
  }
  function fecFrame(page, ch = 5) {
    const b = new Uint8Array(13); b.set([0xA4, 9, 0x4F, ch]); b.set(page, 4);
    let x = 0; for (let i = 0; i < 12; i++) x ^= b[i]; b[12] = x; return b;
  }

  // Cycling Power Measurement（0x2A63）。回転はクランクの回数と時刻の差から出すので、前回の値を持つ
  function makeCPMParser(now = () => Date.now()) {
    let crank = null;
    return function parseCPM(dv) {
      let o = 0; const fl = dv.getUint16(o, true); o += 2; const r = { power: dv.getInt16(o, true) }; o += 2;
      if (fl & 1) o += 1; if (fl & 4) o += 2; if (fl & 16) o += 6;
      if (fl & 32) {
        const n = dv.getUint16(o, true), t = dv.getUint16(o + 2, true);
        if (crank) { const dn = (n - crank.n + 65536) % 65536, dt = ((t - crank.t + 65536) % 65536) / 1024; if (dt > 0) r.cad = dn / dt * 60; else if (now() - crank.at > 3000) r.cad = 0; }
        if (!crank || n !== crank.n) crank = { n, t, at: now() };
      }
      return r;
    };
  }

  // 勾配（0.05 = 5%）を 0.01% 単位の整数に。送れる範囲に収める
  const gradeUnits = g => Math.round(Math.min(GRADE_MAX, Math.max(GRADE_MIN, g)) * 10000);
  // FTMS Control Point 0x11（シミュレーション）
  function ftmsGradeFrame(units) {
    const b = new DataView(new ArrayBuffer(7));
    b.setUint8(0, 0x11); b.setInt16(1, 0, true); b.setInt16(3, units, true);
    b.setUint8(5, Math.round(CRR * 10000)); b.setUint8(6, Math.round(CW * 100));
    return new Uint8Array(b.buffer);
  }
  // FE-C page 0x33（Track Resistance）。勾配は 0.01% 単位で +200% のずらし
  function fecGradePage(units) {
    const gv = Math.round((units / 100 + 200) / 0.01);
    return [0x33, 0xFF, 0xFF, 0xFF, 0xFF, gv & 0xFF, gv >> 8, Math.round(CRR / 5e-5)];
  }

  // 目標パワー（ERG）。FTMS Control Point 0x05（W）、FE-C page 0x31（0.25W 単位）
  const ergWatts = w => Math.round(Math.max(0, Math.min(2000, w)));
  function ftmsPowerFrame(w) {
    const b = new DataView(new ArrayBuffer(3));
    b.setUint8(0, 0x05); b.setInt16(1, ergWatts(w), true);
    return new Uint8Array(b.buffer);
  }
  function fecPowerPage(w) {
    const q = ergWatts(w) * 4;
    return [0x31, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, q & 0xFF, q >> 8];
  }

  // FTMS Control Point の返事（indication）：[0x80, 頼んだ命令, 結果]。結果 1＝成功、2＝未対応、3＝値が不正、4＝失敗、5＝制御権がない
  const CP_RESULT = { 1: '成功', 2: '対応していない命令', 3: '値が範囲外', 4: '失敗', 5: '制御権がない（ほかのアプリが負荷を握っている）' };
  const CP_OP = { 0x00: '制御権', 0x05: '目標パワー（ERG）', 0x07: '開始', 0x11: '勾配', 0x13: '補正（スピンダウン）' };
  function parseCPResponse(dv) {
    if (dv.byteLength < 3 || dv.getUint8(0) !== 0x80) return null;
    const op = dv.getUint8(1), result = dv.getUint8(2);
    const r = { op, result, ok: result === 1, opName: CP_OP[op] || `命令 0x${op.toString(16)}`, text: CP_RESULT[result] || `不明な結果 ${result}` };
    if (op === 0x13 && r.ok && dv.byteLength >= 7) { r.lo = dv.getUint16(3, true) / 100; r.hi = dv.getUint16(5, true) / 100; }   // 補正：この速さ（km/h）の間まで上げる
    return r;
  }

  // 補正（スピンダウン。2026-10-24 ユーザー判断）。FTMS の Spin Down Control（Control Point 0x13、0x01＝始める）
  const spinDownFrame = () => new Uint8Array([0x13, 0x01]);
  // Fitness Machine Feature（0x2ACC）：Target Setting Features の bit 13 が Spin Down Control
  function parseFeatures(dv) {
    if (!dv || dv.byteLength < 8) return { spinDown: false };
    const target = dv.getUint32(4, true);
    return { spinDown: !!(target & (1 << 13)), power: !!(target & (1 << 3)) };   // power：目標パワー（ERG）に対応（bit 3）
  }
  // Fitness Machine Status（0x2ADA）：0x14＝補正の様子（1＝始めてほしい、2＝できた、3＝失敗、4＝漕ぐのをやめて）
  const SPIN = { 1: 'requested', 2: 'success', 3: 'error', 4: 'stop' };
  function parseStatus(dv) {
    if (!dv || dv.byteLength < 1) return null;
    const op = dv.getUint8(0);
    if (op === 0x14 && dv.byteLength >= 2) return { op, spin: SPIN[dv.getUint8(1)] || 'unknown' };
    return { op };
  }

  // つなぐの失敗のうち、押してすぐ（3秒以内）に返った最初の1回は、1秒おいてもう一度だけ試す。
  // macOS で Bluetooth の許可を初めて聞く間などに、1回目だけ失敗する（2026-10-21 ユーザーの報告：2回目で選ぶ窓が出る）。やめた（cancel）ときは試さない
  function retryConnect(err, ms, tries) {
    const m = `${(err && err.name) || ''} ${(err && err.message) || ''}`;
    return tries < 1 && ms < 3000 && !/cancel/i.test(m);
  }

  // Heart Rate Measurement（0x2A37）：フラグの bit0 が 1 なら心拍は 16bit、0 なら 8bit。0 は「測れていない」として null
  function parseHRM(dv) {
    if (!dv || dv.byteLength < 2) return null;
    const wide = dv.getUint8(0) & 1;
    if (wide && dv.byteLength < 3) return null;
    const hr = wide ? dv.getUint16(1, true) : dv.getUint8(1);
    return hr > 0 ? hr : null;
  }

  // パワーメーターに合わせる（2026-10-24 ユーザー判断。Zwift の PowerMatch のように）：トレーナーのパワー ÷ パワーメーターのパワーの比 k を、
  // 時定数 tau 秒でならす（両方 floor W 以上の時だけ。比は min〜max に収める）。ERG の目標は w × k をトレーナーに送る
  // （トレーナーが 5% 多めに出すなら、目標も 5% 多めに頼めば、パワーメーターでちょうど目標になる）
  const PM_MATCH = { tau: 20, min: 0.8, max: 1.25, floor: 50 };
  function powerMatch(k, trW, pmW, dt) {
    if (!(trW >= PM_MATCH.floor && pmW >= PM_MATCH.floor) || !(dt > 0)) return k;
    const r = Math.min(PM_MATCH.max, Math.max(PM_MATCH.min, trW / pmW));
    return k + (r - k) * Math.min(1, dt / PM_MATCH.tau);
  }
  const matchedErg = (w, k) => w * (k || 1);

  // 足が止まっているとき（回転数が STILL_RPM 未満）は、パワーを 0 とみなす（2026-10-26 ユーザー判断「回している力がパワー」）。
  // 足を止めても、フライホイールが惰性で回る間は、ERG のブレーキのぶんをトレーナーがパワーとして送ってくる（試走：0 rpm で 108 W・31 km/h）
  const STILL_RPM = 10;
  const pedalPower = (power, cad) => (cad == null || cad < STILL_RPM ? 0 : Math.max(0, power || 0));
  const api = { STILL_RPM, pedalPower, spinDownFrame, parseFeatures, parseStatus, PM_MATCH, powerMatch, matchedErg, UUID, retryConnect, parseHRM, GRADE_MIN, GRADE_MAX, parseCPResponse, parseIBD, parseFEC, fecFrame, makeCPMParser, gradeUnits, ftmsGradeFrame, fecGradePage, ergWatts, ftmsPowerFrame, fecPowerPage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RQ = root.RQ || {}).protocol = api;
})(typeof window !== 'undefined' ? window : globalThis);
