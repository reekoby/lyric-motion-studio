# Third-party notices / サードパーティ ライセンス

Lyric Motion Studio (MIT License, © 2026 ΛNTRΞC) bundles the following open-source software **unmodified** into `index.html`.
Lyric Motion Studio は、以下のオープンソースソフトウェアを**改変せずに** `index.html` に同梱しています。

| Component | Version | License | Source |
|---|---|---|---|
| Mediabunny | 1.60.0 | Mozilla Public License 2.0 | https://github.com/Vanilagy/mediabunny ・ https://www.npmjs.com/package/mediabunny |
| gifenc | 1.0.3 | MIT | https://github.com/mattdesl/gifenc |
| TensorFlow.js (tfjs-core, tfjs-backend-webgl, tfjs-converter) | 4.22.0 | Apache License 2.0 | https://github.com/tensorflow/tfjs |

The optional ML pack `lms-ml-pack.lmsml` (distributed separately, data only) contains TensorFlow.js graph models taken from the npm package `@vladmandic/human-models` 3.0.4 (MIT, © Vladimir Mandic): selfie segmentation (MediaPipe / PINTO model zoo, Apache-2.0), BlazeFace (MediaPipe, Apache-2.0) and MoveNet Lightning (Google, Apache-2.0). It is built with `tools/build-mlpack.mjs`; the models are unmodified.
任意の ML パック `lms-ml-pack.lmsml`（別配布・データのみ）には、npm パッケージ `@vladmandic/human-models` 3.0.4（MIT）の TensorFlow.js グラフモデル（人物セグメンテーション・BlazeFace・MoveNet Lightning、いずれも Apache-2.0）を未改変で収めています。

## Mediabunny — MPL-2.0

Copyright (c) 2026-present, Vanilagy and contributors.

This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

The bundled file is the unmodified `dist/bundles/mediabunny.min.cjs` from the npm package `mediabunny@1.60.0`. Its Source Code Form is available at the links above. The MPL-2.0 applies only to the Mediabunny files; the rest of Lyric Motion Studio is under the MIT License.
同梱しているのは npm パッケージ `mediabunny@1.60.0` の `dist/bundles/mediabunny.min.cjs`（未改変）です。ソースコードは上記リンクから入手できます。MPL-2.0 が適用されるのは Mediabunny のファイルのみです。

## gifenc — MIT

The GIF quantizer in gifenc is ported from PnnQuant.js by mcychan.

```
The MIT License (MIT)
Copyright (c) 2017 Matt DesLauriers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
OR OTHER DEALINGS IN THE SOFTWARE.

```

## Fonts / 書体

Fonts are **not bundled**. When the app runs, typefaces are loaded from Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`) under their own licenses, mostly the SIL Open Font License 1.1 (for example Noto Sans JP / KR, Noto Serif JP / KR, Inter, Montserrat and the other families listed in the app) and in a few cases the Apache License 2.0. See each family's page on https://fonts.google.com for details. Videos you export contain rendered text only, which these licenses permit for any purpose.
書体は同梱していません。実行時に Google Fonts から各書体のライセンス（主に SIL Open Font License 1.1、一部 Apache License 2.0）に基づいて読み込みます。書き出した動画には文字が画像として含まれるだけで、これらのライセンス上、用途の制限はありません。

## Build-time tools (not distributed)

`playwright-core` (Apache-2.0) is used only for local testing and is not part of the published app.


## TensorFlow.js — Apache-2.0

Copyright 2018 Google LLC. Licensed under the Apache License, Version 2.0; see `licenses/Apache-2.0.txt`.
The bundled files are the unmodified `dist/tf-core.min.js`, `dist/tf-backend-webgl.min.js` and `dist/tf-converter.min.js` from the npm packages `@tensorflow/tfjs-core@4.22.0`, `@tensorflow/tfjs-backend-webgl@4.22.0` and `@tensorflow/tfjs-converter@4.22.0`.

## ML pack models

- Model conversions: `@vladmandic/human-models` — MIT License, see `licenses/human-models-MIT.txt`.
- Selfie segmentation, BlazeFace, MoveNet Lightning — Apache License 2.0 (Google LLC / MediaPipe authors), see `licenses/Apache-2.0.txt`.
