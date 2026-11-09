/* 外とのやり取りの差し替えの層（docs/impl-web.md）：Electron 版。preload が出す window.rq を、そのまま RQ.platform として渡すだけ。
   renderer は window.rq ではなく RQ.platform を呼ぶ。ブラウザ版は renderer/platform/web.js（こちらが無いときだけ入る）。 */
(function (root) {
  const rq = root.rq;
  if (!rq || !rq.isElectron) return;
  (root.RQ = root.RQ || {}).platform = {
    kind: 'electron',
    monetize: false,       // アプリ版には広告もリンクも出さない（2026-11-06 ユーザー判断 38a。Amazon の規約でインストールするアプリには置けない）
    ownPicker: true,       // 機器の選ぶ窓を自分で出す（Electron には Chrome の選ぶ窓が無い）
    canShowFile: true,     // 保存したファイルをフォルダで見せられる
    onBtDevices: rq.onBtDevices, chooseBt: rq.chooseBt, btStart: rq.btStart, wantBt: rq.wantBt,
    saveScreenshot: () => rq.saveScreenshot(),
    quit: () => rq.quitApp(),   // ゲームを終わる（タイトルの「終わる」。ブラウザ版には無い＝ボタンを出さない）
    showFile: rq.showFile,
    saveFit: rq.saveFit,
    saveGhost: rq.saveGhost, listGhosts: rq.listGhosts,
    shareUpload: rq.shareUpload, shareFetch: rq.shareFetch, shareFetchRace: rq.shareFetchRace, shareRevoke: rq.shareRevoke,
    writeStory: rq.storyWrite,
    // 月のレポート（試作）：{ url, facts } → 手紙 | null。B は走りの数値の上げ下げ。fitMonths：{ months: ['2026-10', …] } → [{ start, samples }]（FIT から）
    writeReport: rq.reportWrite, ridesUpload: rq.ridesUpload, ridesFetch: rq.ridesFetch, ridesDelete: rq.ridesDelete, fitMonths: rq.fitMonths,   // { url, facts } → 文 | null（Strava の説明文の「冒険記」。試作）
    copyText: rq.copyText,
    backupGet: rq.backupGet, backupSet: rq.backupSet,
    saveBackup: (text, name) => rq.saveBackup(text, name, { title: RQ.i18n.t('set.backupExport'), filter: RQ.i18n.t('backup.filter') }),   // 記録の書き出しと読み込み（backup.js）
    stravaUpload: (file, text) => rq.stravaUpload(file, text),
    // 道中の写真：main の capturePage（画面そのまま）を JPEG に。まとめのときに、まとめの画像と一緒に「ピクチャ/Ride on Quest」へ
    capturePhoto: async () => {   // 遊ぶ所（#stage：3D・走行データ・窓）だけを切り取る（上の帯とつながずに試すの帯は入れない）
      const r = document.querySelector('#stage').getBoundingClientRect();
      return new Blob([await rq.capturePhoto({ x: r.left, y: r.top, width: r.width, height: r.height })], { type: 'image/jpeg' });
    },
    savePhotos: async ({ photos = [], startMs, label } = {}) => rq.savePhotos({ startMs, label, summary: RQ.i18n.t('photo.summary'), photos: await Promise.all(photos.map(async b => new Uint8Array(await b.arrayBuffer()))) }),
  };
})(window);
