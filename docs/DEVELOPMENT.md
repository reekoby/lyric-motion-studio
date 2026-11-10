# 開発メモ（Lyric Motion Studio）

最終更新：2026-11-11

## 実装済み（2026-11-11）— フェーズ4（音声連動）— `src/audio2.js` / `src/react.js`
- `audio2.js`：`LM.audio.analyze` を包み、基本解析（BPM・ビート）のあとに86fps固定グリッドで特徴量を事前計算（`LM.audio.feat`）。プレビューも書き出しも同じ数値を読むので決定論的
  - 2048点FFT（中央=re・サイド=im を1回のFFTに詰めて分離）→ 64帯域の対数スペクトル（+3dB/oct の傾き補正、パーセンタイル正規化）、アタック/リリースの平滑化と落下するピークキャップを Uint8 で保持
  - レベル：rms / bass / mid / high / vocal（中央成分−サイド成分の250Hz〜4kHz）。各々 fast / slow の2系統の包絡線を持ち、`frame(t, smooth)` で混ぜる
  - オンセット：kick（35–120Hz）、snare（1.8–6kHz のクラック − ハイハット帯 × 0.7、胴鳴りで重み）、hat（7kHz+）、all。移動平均+k·σ の適応しきい値でピーク検出、強さ付き
  - ステレオ（pan / width）、明るさ（重心）、ambience（space）、arousal（音量+オンセット密度+明るさ）
  - 音程：中央チャンネルを11kHzへ間引き、HP110Hz+LP1.6kHz の後 YIN。オクターブ補正・メディアン・短い隙間の補間、`pitchAt(t, raw)` は隙間を埋めた平滑な輪郭
  - キー（Krumhansl）とコードの長短から mood（−1..1）
  - DPビートトラッキング（Ellis 2007、テンポのゆれに追従）で `analysis.beats` を置き換え（元は `beatsGrid`）、ダウンビート再推定
  - 曲構成：1秒ブロック（クロマ12+粗いスペクトル8）の自己類似行列 → チェッカーボード核のノベルティ+音量差で境界 → 小節線に吸着 → 区間を対角方向の類似度+音量差でグループ化 → 繰り返す大きいグループ＝サビ。歌の有無は音程の有声率で判定。`sectionsFor(p)` が歌詞の有無も加味してマーカー形式で返す（`MD.estimateSections` が優先して使う）。息継ぎ（`breaths`）も検出
  - 参照API：`frame(t, smooth)`（共有オブジェクトを返す）、`pitchAt`、`lastOnset(t, band, minS)`、`onsets(band, t0, t1)`、`scope(t, n, span)`（立ち上がりゼロ交差でトリガー）、`waveLR`、`spectrum(t)`（32帯域、平滑済み）
- レンダラー：`auf(t)` が特徴量（無ければ `LM.auSynth` のBPM同期の合成値）を返し、`C.au`（グリフ）、`R.au`（背景・装飾）、カメラの `k.au`、`POSTX.params` の `ctx.au` に渡す。`bands()` も特徴量から。強調のきっかけに kick / snare / hat / onset。`p.react`（null=テーマの `react` 値）で全体のキック脈動・音量の明るさ、`p.reactSmooth` で平滑度
- `react.js`：保持11種（`au*`）、背景11種（カテゴリ「オーディオ」、`eqBars` `circleSpectrum` は作り直し）、フィルター11種（カテゴリ `audio`。ポストは `LM.POSTX` に uv/col を追記し params をラップ）、カメラ3種、テーマ別の配分と `react` 値、`LM.director_OVR` で演出のメタ情報
- おまかせ：解析済みなら区間マーカー未設定でも推定構成を使う、エネルギーに arousal を混ぜる、強調のきっかけをキック/スネアに、サビの背景に音の可視化を優先

## 実装済み（2026-11-10）— フェーズ3（画面フィルター）— `src/pro3.js`
- `LM.POSTX = { uni, v3, decl, uv, smp, col, fin, params }` をレンダラーの後処理シェーダーの差し込み口（`/*X_DECL*/` `/*X_UV*/` `/*X_SMP*/` `/*X_COL*/` `/*X_FIN*/`）に展開。`params(g, u, ctx)` が `postParams` の最後に呼ばれる
- `u.needBlur` で縮小ぼかしテクスチャ（T1）を作る、`u.needFB` で前フレームの出力を T4 に保持（フィードバック・データモッシュ。時間が飛んだフレームでは無効化）
- フィルターのカテゴリーを追加：look / media / lens / digital（`FX.cats`）

## 実装済み（2026-11-10）— リアル化 — `src/glfx.js` / `src/glfx2.js`
- `LM.glfx.full(ctx, progId, R, o)` が全画面のGPUレイヤーを描く（失敗時は従来の2D描画に戻る）。`LM.glfx.PROG[id] = [prelude, main]`、遅延コンパイル
- glfx2 の共通GLSL：五次補間のグラディエントノイズ `gn/sfbm`（法線にブロックが出ない）、スタジオ環境 `envS`、光沢マテリアル `glossy(n, base, metal, rough)`、色を保つトーンマップ `tmK`
- 置き換え：liqflow（OPT.x 0 液体 / 1 クローム / 2 マーブル）、blobs・lava、ink（背景・カバー）、paint・brushCover、liqCover、dripCover、splashCover、splat、sea、disco

## 実装済み（2026-11-10）— フェーズ2 — `src/pro2.js`
- トランジション：`LM.trans.lib[id].mb = true` のカバー系は `applyTrans` が作業キャンバス2枚でシャッター区間を平均（N=10）し、接地影付きで合成。カメラ系は変形時に鏡像タイルで周囲を埋める。ポスト側に `swirl`（渦）を追加、`o.quad/o.hue/o.bzoom` も受け付け
- カメラ：`D.cameras` にキー追加、実装は `LM.cam2[id](lx, k)`（`drawCue` から呼ぶ）
- カラオケ：`T.fill` はグラデーションで柔らかい境界（縦書き対応）。`T.uline`（下線の進捗）
- おまかせ：`LM.MS.GRAMMAR[themeId] = { p, ease:{}, so:{} }` → `MS.grammar()` が区間ごとに `mp.e` の ease / so / sa / se を決め、同じ区間タイプ（サビ等）では再利用。新テーマは `NT` に定義（存在しない語彙は自動で除外）。強調の語彙は `LM.director_EMPH`

## 実装済み（2026-11-10）— エフェクト・カタログ フェーズ1 — `src/pro.js`
- イージング：Penner 全系統・cubic-bezier（ニュートン法）・業務用カーブ・コマ打ち・ラフ → `MS.EASE_N` / `MS.WARP`（単調なものは時間ワープにも使用）
- スタッガー：`mp.e|x.so`（順番）・`sa`（角度）・`se`（間隔カーブ）→ `MS.rank2`。レンダラーのランクキャッシュはパラメーター込みのキー
- 単位ピボット：`MS.uc(g, 'w'|'l'|'a', c)` と `MS.pivotT`。`MS.define` のプリセットは u≠g のとき単位中心で拡大・回転（`track` を使うものは除外）
- 文字のモーションブラー：`Renderer.drawGlyphMB` — シャッター区間前の変形と現在の変形を補間した N サンプルを `lighter`・重み 1/N で作業キャンバスに積算して合成。`p.glyphMB`（0–1、既定 0.5）。書き出しのサブフレームMB使用時は無効（`r.subMB`）
- マスクのフェザー：clip 系モーションは作業キャンバスに描いてから、ぼかしたクリップ形状で `destination-in`（`p.softMask`）
- 新しい変形フィールド：`shard`/`shardIn`（三角片）・`flap`（パタパタ）・`liq`・`scanX`/`scanW`・`dust`・`burn`・`strike`・`drain`・`strokeAcc`

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
