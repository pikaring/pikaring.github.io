# 第三者のソフトウェアと素材

ゲームの中では、設定（⚙）の画面のいちばん下「出典・クレジット」に、ここと同じ中身を短くまとめて出している。

## tanken-ride（探犬∞ Ride）

https://github.com/matsuo-koya/tanken-ride

`renderer/trainer/` の接続（connect・gattOpen）、負荷の送信（sendGrade）、データの読み取り（parseIBD・parseFEC・fecFrame・parseCPM）、物理（physStep）、つながずに試すモードは、tanken-ride の `index.html` から移植した。

```
MIT License

Copyright (c) 2026 Koya Matsuo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## fit-file-parser（FIT の書き出し）

https://github.com/jimmykane/fit-parser （npm の `fit-file-parser` 6.2.3）

旅の記録を FIT ファイルに書き出すのに、`FitEncoder`（`fit-file-parser/encoder`。プロファイルを持たず、決まった形でバイト列を書く部品）だけを使う（`main/fit.js`）。どのメッセージのどの欄に何を書くかは `main/fit.js` に自分で書いた。配るアプリには、この部品だけを入れる（読み込み側とプロファイルの表は入れない。`package.json` の `build.files`）。

```
The MIT License (MIT)

Copyright (c) 2015 Pierre Jacquier
http://pierrejacquier.com | @pierremtb

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Garmin の FIT SDK（`@garmin/fitsdk`）は、開発のときのテスト（書いた FIT を読み戻して確かめる）だけに使い、配るアプリには入れない（2026-10-21 ユーザー判断。SDK の規約が第三者への配布を制限しているため。`docs/release.md`）。

## three.js

https://threejs.org/ （MIT License、Copyright 2010-2023 Three.js Authors）

島の簡易3D に使う（`renderer/vendor/three.min.js`、版 0.149.0）。ライセンスの全文は `renderer/vendor/three.LICENSE`。

## 国土地理院 標高タイル

https://maps.gsi.go.jp/development/ichiran.html

島（渡島大島）の地形（`assets/map/island.json`・`map-data.js`）は、国土地理院の標高タイル（DEM10B）を加工して作成した。国土地理院コンテンツ利用規約に従い、出典は設定画面の「出典・クレジット」の欄に出す（2026-10-21 ユーザー判断。走る画面には出さない）。

## DotGothic16（SIL Open Font License 1.1）

画面の文字に使う（`renderer/fonts/DotGothic16-Regular.ttf`）。Copyright 2020 The DotGothic16 Project Authors (https://github.com/fontworks-fonts/DotGothic16)。ライセンスの全文は `renderer/fonts/OFL.txt`。

## 甘茶の音楽工房 / Music Atelier Amacha（音楽素材）

https://amachamusic.chagasi.com/ （作曲：甘茶 / Amacha）

BGM の録音の曲（`assets/audio/*.webm`。元の mp3 を Opus に変えたもの。元は `art_src/audio/*.mp3`。一覧は `tools/audio_tracks.json`）。利用規約（https://amachamusic.chagasi.com/terms.html）に従う：ゲームの BGM として無料で使える。テンポの変更・つなぎ目でのくり返しなどの加工はしてよい。音楽だけを販売・2次配布しない、作曲者を偽らない、JASRAC などの著作権管理団体や YouTube の Content ID に登録しない、直リンクしない。著作権は甘茶にある。クレジットは設定の画面に出している（2026-10-21 ユーザー判断：設定の画面だけ）。リポジトリを公開するときの扱いは `docs/impl-audio.md`。

## 絵（生成 AI）

絵（`assets/` のタイトルの島の地図・タイトルロゴ・会心の紋章、主人公・敵・NPC・装備・ランドマークのドット絵）は、生成 AI（Grok・Gemini）で作成した。トリスケリオン由来の絵で今も残るのは、タイトルロゴ（`assets/ui/logo.webp`）と会心の紋章（`assets/icon/ui_emblem.webp`）の2つだけで、どちらもいずれ差し替える（ほかの背景・アイコン・演出は 2026-10-23 に消した。`docs/trisk-audit.md`）。これも同じく生成 AI で作ったもの。Gemini はユーザーの有料プラン（Google AI Pro）で作り、商用でも使える。Grok（xAI）は、Grok で作ったことを表示すれば商用でも使える。どちらも設定の画面に表示している（2026-10-21 ユーザー確認。`docs/design.md` §7）。道の網（`assets/map/roads.json`）は、Gemini で作った架空の地図の道のつながり方を写したもの。地名（`trails.json`）はユーザーの地図から写した。
