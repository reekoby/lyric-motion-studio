# 開発メモ（Lyric Motion Studio）

最終更新：2026-09-27

## 実装済み（2026-09-27）
### 背景動画（MP4 / WebM / MOV）— `src/video.js` + `src/imgbg.js`
- 背景ライブラリの項目に `type: 'video'`（`vin`/`vout` 使用範囲・`speed`・`sync: 'slot'|'song'`・`loop`・`kb`）
- プレビュー：ミュートの `<video>` を曲の時計に同期（再生中は 0.3 秒以上ずれたらシーク、停止中は都度シーク）
- 書き出し：`LM.video.forExport()` が Mediabunny の `CanvasSink` でフレーム単位デコード（順方向カーソル、逆行・1.5 秒超のジャンプで再開）。`Renderer.prepareVideos(t)` を各フレーム（モーションブラーのサブフレームも）の前に await。デコード不可時は `<video>` シークにフォールバック
- 保存：IndexedDB に元の動画 Blob、.lmz に `images/<id>.mp4|webm|mov`
### 歌声に合わせた自動タイミング — `src/align.js`
- ボーカル推定：Mid−Side（中央成分）のボーカル帯域 250–4000Hz → HPSS（時間 ±13 / 周波数 ±5 のメディアン）→ ピッチ揺らぎ（ビブラート等）で「歌らしさ」を重み付け → 周辺 ±6 秒の AGC
- 行配置：モーラ/音節数 × 歌唱速度（7 段階を探索して最良スコアを採用）を事前分布に、動的計画法で全行を順序を保って同時最適化。🔒行・「以降を合わせ直す」の起点はアンカー、イントロ/間奏/アウトロのセクションは抑制
- 単語：音節数で配分 → 近傍の立ち上がりに吸着。確信度の低い行は一覧で黄色表示
- 合成テスト（ボーカルを合成したテスト曲）：行頭の中央値誤差 0.02–0.04 秒、12 行中 10 行が 0.15 秒以内。モノラル音源と、中央定位のリード楽器があるイントロは苦手（後者はアンカー 1 つで解消）
- 次の改善候補：Whisper 系の音声認識（WebGPU）で音素レベルの強制アライメント（ローカル版限定、モデル配布方法の検討が必要）、モノラル音源向けのボーカル分離

## 現状の構成メモ
- 単一HTMLにビルド（`node build.mjs` → `dist/lyric-motion-studio.html` / `dist/artifact.html`）
- 主要モジュール：typo（組版）/ motion1-4 / layout1-3 / render（描画・後処理シェーダー）/ imgbg（背景画像）/ bgmotion・bgshader・bgfx・edge（背景・トランジション）/ director（おまかせ）/ export / app / manual / i18n
- テスト：描画・UIの自動テスト（Playwright）は手元で実行しており、リポジトリには含めていません

## 多言語対応（実装済み・メンテナンス方法）
- UI 翻訳: `src/i18n.js`。日本語の原文をキーに、DOM を MutationObserver でその場翻訳（テキスト・title/placeholder/aria-label/label）。`{0}` 付きパターン、`A：B` などの合成ラベルも階層的に訳す。canvas 描画文字は `LM.i18n.tx()` を通す。
- 辞書: `i18n/{en,es,it,ko}.json`、説明書: `i18n/manual_{lang}.json`（`build.mjs` が `LM.I18N_DATA` として埋め込み）。`i18n/check.py <lang>` で欠落・プレースホルダ不一致を検査。
- 文言を追加したら: 4言語の JSON にキーを足す（少数なら `i18n.js` の EXTRA2 でも可）。ユーザー入力（歌詞など）を表示する要素には `data-noi18n` を付ける。
- 歌詞組版: `typo.js` の文字クラス J/L/P/JP/K/S。ハングル(K)は `fontOf().korean`（ハングル書体・`KOR_PAIR` でおまかせ）で組む。`¿ ¡ «` は次語、`» ? !` は前語と分離しない。`parse().units` は欧文を読む長さで重み付け（自動配置・演出の長さ判定に使用）。
