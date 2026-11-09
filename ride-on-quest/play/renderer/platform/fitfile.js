/* 旅の記録を FIT（Activity ファイル）にする。Strava などに上げる用。Electron（main/fit.js が包む）とブラウザ版（renderer/platform/web.js）で同じものを使う。
   書き出しは fit-file-parser（MIT）の FitEncoder（プロファイルを持たない、決まった形でバイト列を書くだけの部品）を使い、
   どのメッセージのどの欄に何を書くかは、下の MSG に自分で決めて書く（Garmin の FIT SDK は配るものに入れない。
   規約で SDK の配布が制限されているため。2026-10-21 ユーザー判断。docs/release.md）。
   node では fit-file-parser/encoder を、ブラウザでは renderer/vendor/fit-encoder.js（同じ部品の写し。window.FitEncoderLib）を使う。
   メッセージの並びは「Encoding Activity Files」に合わせる：File Id → Device Info → Sport → Workout → タイマー開始 → Record …
   （場面ごとに Lap）→ タイマー停止 → Session → Activity。一時停止のすき間はタイマーの停止と再開で表す。
   書いたものが正しいかは、tests/fit.test.js が Garmin の SDK（開発のときだけ使う）で読み戻して確かめる。 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const { FitEncoder, FitBaseType: B } = node ? require('fit-file-parser/encoder') : root.FitEncoderLib;
  const TG = node ? require('../game/training.js') : root.RQ.training;

  const GAP_MS = 1500;          // 記録の間がこれより空いたら一時停止とみなす
  const PRODUCT_NAME = 'Ride on Quest';

  // FIT の CRC-16（ヘッダーの CRC を確かめるのに使う）
  const CRC_TABLE = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
  function crc16(bytes, from, to) {
    let crc = 0;
    for (let i = from; i < to; i++) {
      const b = bytes[i];
      let tmp = CRC_TABLE[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ CRC_TABLE[b & 0xF];
      tmp = CRC_TABLE[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xF];
    }
    return crc;
  }

  // 使うメッセージと欄：[欄の番号, 型, 倍率, ずらし]。値は「（本当の値 ＋ ずらし）× 倍率」を整数にして書く
  const MSG = {
    fileId: { num: 0, f: { type: [0, B.Enum], manufacturer: [1, B.Uint16], product: [2, B.Uint16], serialNumber: [3, B.Uint32z], timeCreated: [4, B.Uint32], productName: [8, B.String] } },
    deviceInfo: { num: 23, f: { timestamp: [253, B.Uint32], deviceIndex: [0, B.Uint8], manufacturer: [2, B.Uint16], serialNumber: [3, B.Uint32z], product: [4, B.Uint16], softwareVersion: [5, B.Uint16, 100], productName: [27, B.String] } },
    sport: { num: 12, f: { sport: [0, B.Enum], subSport: [1, B.Enum], name: [3, B.String] } },
    workout: { num: 26, f: { sport: [4, B.Enum], numValidSteps: [6, B.Uint16], wktName: [8, B.String], subSport: [11, B.Enum], wktDescription: [17, B.String] } },
    event: { num: 21, f: { timestamp: [253, B.Uint32], event: [0, B.Enum], eventType: [1, B.Enum] } },
    record: { num: 20, f: { timestamp: [253, B.Uint32], positionLat: [0, B.Sint32], positionLong: [1, B.Sint32], altitude: [2, B.Uint16, 5, 500], heartRate: [3, B.Uint8], cadence: [4, B.Uint8],
      distance: [5, B.Uint32, 100], speed: [6, B.Uint16, 1000], power: [7, B.Uint16], enhancedSpeed: [73, B.Uint32, 1000], enhancedAltitude: [78, B.Uint32, 5, 500] } },
    lap: { num: 19, f: { messageIndex: [254, B.Uint16], timestamp: [253, B.Uint32], event: [0, B.Enum], eventType: [1, B.Enum], startTime: [2, B.Uint32], startPositionLat: [3, B.Sint32], startPositionLong: [4, B.Sint32],
      totalElapsedTime: [7, B.Uint32, 1000], totalTimerTime: [8, B.Uint32, 1000], totalDistance: [9, B.Uint32, 100], avgSpeed: [13, B.Uint16, 1000], maxSpeed: [14, B.Uint16, 1000],
      avgHeartRate: [15, B.Uint8], maxHeartRate: [16, B.Uint8], avgCadence: [17, B.Uint8], maxCadence: [18, B.Uint8], avgPower: [19, B.Uint16], maxPower: [20, B.Uint16],
      totalAscent: [21, B.Uint16], totalDescent: [22, B.Uint16], intensity: [23, B.Enum], lapTrigger: [24, B.Enum], sport: [25, B.Enum], subSport: [39, B.Enum], totalWork: [41, B.Uint32] } },
    session: { num: 18, f: { messageIndex: [254, B.Uint16], timestamp: [253, B.Uint32], event: [0, B.Enum], eventType: [1, B.Enum], startTime: [2, B.Uint32], startPositionLat: [3, B.Sint32], startPositionLong: [4, B.Sint32],
      sport: [5, B.Enum], subSport: [6, B.Enum], totalElapsedTime: [7, B.Uint32, 1000], totalTimerTime: [8, B.Uint32, 1000], totalDistance: [9, B.Uint32, 100],
      avgSpeed: [14, B.Uint16, 1000], maxSpeed: [15, B.Uint16, 1000], avgHeartRate: [16, B.Uint8], maxHeartRate: [17, B.Uint8], avgCadence: [18, B.Uint8], maxCadence: [19, B.Uint8],
      avgPower: [20, B.Uint16], maxPower: [21, B.Uint16], totalAscent: [22, B.Uint16], totalDescent: [23, B.Uint16], firstLapIndex: [25, B.Uint16], numLaps: [26, B.Uint16], trigger: [28, B.Enum],
      normalizedPower: [34, B.Uint16], trainingStressScore: [35, B.Uint16, 10], intensityFactor: [36, B.Uint16, 1000], thresholdPower: [45, B.Uint16], totalWork: [48, B.Uint32], sportProfileName: [110, B.String] } },
    activity: { num: 34, f: { timestamp: [253, B.Uint32], totalTimerTime: [0, B.Uint32, 1000], numSessions: [1, B.Uint16], type: [2, B.Enum], event: [3, B.Enum], eventType: [4, B.Enum], localTimestamp: [5, B.Uint32] } },
  };
  // 列挙の値（FIT の決まった番号）
  const E = {
    file: { activity: 4 }, manufacturer: { development: 255 }, device: { creator: 0 },
    sport: { cycling: 2 }, subSport: { indoorCycling: 6, virtualActivity: 58 },
    event: { timer: 0, lap: 9, session: 8, activity: 26 }, eventType: { start: 0, stop: 1, stopAll: 4 },
    intensity: { active: 0, recovery: 4 }, lapTrigger: { manual: 0 }, sessionTrigger: { activityEnd: 0 }, activity: { manual: 0 },
  };
  const SIZE = { [B.Enum]: 1, [B.Uint8]: 1, [B.Uint16]: 2, [B.Uint32]: 4, [B.Uint32z]: 4, [B.Sint32]: 4 };
  const INT_MAX = { [B.Enum]: 0xFE, [B.Uint8]: 0xFE, [B.Uint16]: 0xFFFE, [B.Uint32]: 0xFFFFFFFE, [B.Uint32z]: 0xFFFFFFFF, [B.Sint32]: 0x7FFFFFFF };
  const time = d => FitEncoder.toFitTimestamp(d instanceof Date ? d : new Date(d));

  // FIT の文字の欄は UTF-8 で 254 バイトまで。長ければ、字の途中で切らないように縮めて「…」を付ける（旅を重ねたときの説明など）
  const utf8Len = t => new TextEncoder().encode(t).length;
  function fitText(t) {
    if (utf8Len(t) <= 254) return t;
    const ch = Array.from(t); while (ch.length && utf8Len(ch.join('') + '…') > 254) ch.pop();
    return ch.join('') + '…';
  }
  // 1つのメッセージを書く。null・undefined の欄は書かない。数は倍率とずらしを掛けて整数にし、型の範囲に収める
  function write(enc, name, values) {
    const m = MSG[name], fields = [];
    for (const [key, v] of Object.entries(values)) {
      if (v == null) continue;
      const def = m.f[key]; if (!def) throw new Error(`FIT：${name}.${key} は決めていない欄`);
      const [number, baseType, scale = 1, offset = 0] = def;
      if (baseType === B.String) { const bytes = FitEncoder.string(fitText(String(v))); fields.push({ number, size: bytes.length, baseType, value: bytes }); continue; }
      const lo = baseType === B.Sint32 ? -0x7FFFFFFF : 0;
      const raw = Math.min(INT_MAX[baseType], Math.max(lo, Math.round((v + offset) * scale)));
      fields.push({ number, size: SIZE[baseType], baseType, value: raw });
    }
    enc.writeMessage(m.num, fields);
  }

  const avg = (a, f) => a.length ? a.reduce((x, s) => x + f(s), 0) / a.length : 0;
  const max = (a, f) => a.reduce((m, s) => Math.max(m, f(s)), 0);

  // 同じ場面（フィールド／戦闘）が続く区切りを Lap にする
  function splitLaps(samples) {
    const laps = [];
    for (const s of samples) {
      const last = laps[laps.length - 1];
      if (last && last.k === s.k) last.items.push(s); else laps.push({ k: s.k, items: [s] });
    }
    return laps;
  }

  const semi = deg => Math.round(deg * 2 ** 31 / 180);   // 度 → FIT の semicircle

  function summaryFields(items, timerSec, subSport) {
    const first = items[0], last = items[items.length - 1];
    const at = items.find(s => s.lat != null);   // 始めの位置：座標のある最初の記録（はじめの1秒に座標が無くても、地図が出るように）
    const hr = items.filter(s => s.hr);
    let up = 0, down = 0;
    for (let i = 1; i < items.length; i++) { if (items[i].alt == null || items[i - 1].alt == null) continue; const d = items[i].alt - items[i - 1].alt; if (d > 0) up += d; else down -= d; }
    return {
      ...(at ? { startPositionLat: semi(at.lat), startPositionLong: semi(at.lon), totalAscent: Math.round(up), totalDescent: Math.round(down) } : {}),
      startTime: time(first.t), timestamp: time(last.t),
      totalElapsedTime: (last.t - first.t) / 1000 + 1, totalTimerTime: timerSec,
      totalDistance: Math.max(0, last.d - first.d + (first.s || 0)),
      avgSpeed: avg(items, s => s.s), maxSpeed: max(items, s => s.s),
      avgPower: Math.round(avg(items, s => s.p)), maxPower: max(items, s => s.p),
      avgCadence: Math.round(avg(items.filter(s => s.c > 0), s => s.c)), maxCadence: max(items, s => s.c),
      totalWork: Math.round(items.reduce((x, s) => x + s.p, 0)),   // J（1秒ごとの W の合計）
      ...(hr.length ? { avgHeartRate: Math.round(avg(hr, s => s.hr)), maxHeartRate: max(hr, s => s.hr) } : {}),
      sport: E.sport.cycling, subSport,
    };
  }

  // samples：[{ t: ミリ秒の時刻, p: W, c: rpm, hr: bpm|null, s: m/s, d: 積算距離 m, k: 場面（'field'|'battle' など）,
  //            lat, lon, alt（島のコースを走ったときだけ。あれば種目をバーチャルにする） }]（1秒ごと）
  // name：ワークアウト名（Workout の wktName と Session の sportProfileName に入れる）。description：Workout の説明
  // 返り値：FIT ファイルのバイト列（Uint8Array）
  async function buildActivityFit({ samples, ftp, name = PRODUCT_NAME, description, tzOffsetMin = -new Date().getTimezoneOffset() }) {
    if (!samples || samples.length < 2) throw new Error('記録が短すぎます');
    // プロトコル 2.0（ヘッダーの版は上位4ビットが整数部＝0x20）、プロファイル 21.17
    const enc = new FitEncoder({ protocolVersion: 0x20, profileVersion: 2117 });
    // 座標があれば Strava の「バーチャルライド」になる（2026-10-19 に確かめた）。無ければ屋内ライド。
    // どこかに座標があればバーチャル（前は最初の1秒だけを見ていて、そこに座標が無いと屋内ライド・始めの位置なしになっていた。2026-10-22）
    const subSport = samples.some(s => s.lat != null) ? E.subSport.virtualActivity : E.subSport.indoorCycling;
    const start = time(samples[0].t), end = time(samples[samples.length - 1].t);

    write(enc, 'fileId', { type: E.file.activity, manufacturer: E.manufacturer.development, product: 1, serialNumber: 1, timeCreated: start, productName: PRODUCT_NAME });
    write(enc, 'deviceInfo', { timestamp: start, deviceIndex: E.device.creator, manufacturer: E.manufacturer.development, product: 1, productName: PRODUCT_NAME, serialNumber: 1, softwareVersion: 0.1 });
    // 名前：Strava が使うかは確かめていない（Garmin Connect などはワークアウト名を使うことがある）
    write(enc, 'sport', { sport: E.sport.cycling, subSport, name: PRODUCT_NAME });
    write(enc, 'workout', { sport: E.sport.cycling, subSport, wktName: name, numValidSteps: 0, wktDescription: description || null });
    write(enc, 'event', { timestamp: start, event: E.event.timer, eventType: E.eventType.start });

    let prev = null, lapIndex = 0;
    for (const lap of splitLaps(samples)) {
      for (const s of lap.items) {
        if (prev && s.t - prev.t > GAP_MS) {   // 一時停止
          write(enc, 'event', { timestamp: time(prev.t), event: E.event.timer, eventType: E.eventType.stopAll });
          write(enc, 'event', { timestamp: time(s.t), event: E.event.timer, eventType: E.eventType.start });
        }
        const rec = { timestamp: time(s.t), power: Math.round(s.p), cadence: Math.round(s.c), speed: s.s, distance: s.d };
        if (s.hr) rec.heartRate = Math.round(s.hr);
        if (s.lat != null) { rec.positionLat = semi(s.lat); rec.positionLong = semi(s.lon); rec.enhancedAltitude = s.alt; rec.altitude = s.alt; }
        write(enc, 'record', rec);
        prev = s;
      }
      write(enc, 'lap', { messageIndex: lapIndex++, event: E.event.lap, eventType: E.eventType.stop, lapTrigger: E.lapTrigger.manual,
        intensity: lap.k === 'field' ? E.intensity.recovery : E.intensity.active, ...summaryFields(lap.items, lap.items.length, subSport) });
    }
    write(enc, 'event', { timestamp: end, event: E.event.timer, eventType: E.eventType.stopAll });

    const t = TG.summarize(samples, ftp);
    write(enc, 'session', { messageIndex: 0, event: E.event.session, eventType: E.eventType.stop, firstLapIndex: 0, numLaps: lapIndex, trigger: E.sessionTrigger.activityEnd,
      ...summaryFields(samples, samples.length, subSport), sportProfileName: name,
      normalizedPower: t.np, trainingStressScore: t.tss, intensityFactor: t.IF, thresholdPower: ftp });
    write(enc, 'activity', { timestamp: end, numSessions: 1, totalTimerTime: samples.length, type: E.activity.manual, event: E.event.activity, eventType: E.eventType.stop,
      localTimestamp: end + tzOffsetMin * 60 });
    return enc.close();
  }

  const api = { buildActivityFit, splitLaps, crc16 };
  if (node) module.exports = api;
  else (root.RQ = root.RQ || {}).fitFile = api;
})(typeof window !== 'undefined' ? window : globalThis);
