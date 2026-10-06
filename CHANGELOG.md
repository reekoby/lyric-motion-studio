# Changelog

## 1.6.0 — 2026-10-07
- UI-motion pack (techniques inspired by prompt-motion.com — no code copied): typed in with a blinking cursor, accordion from / into a period, scroll in with ease / scroll away, heavy word lands and the line below bends, numbers count up, zoom smear in / out, melt into droplets, morph into a pill and vanish / UIモーション風の文字モーションを追加
- New effects: glass text (frosted), pixel art, ASCII art / ガラス文字・ドット絵化・ASCIIアート化
- 11 background motions (morphing card, orbit-and-lock squares, unfolding grid, 3D carousel, window parallax, brush strokes, rising liquid, line chart, dot ripples, ring escape, beat bounce), decorations (dot → pill, cursor click, frame break), the iris-blades transition and stepped-zoom / floating cameras / 背景モーション11種・装飾・絞り羽根トランジション・カメラ2種
- Auto direction mixes them into matching themes / おまかせのテーマに組み込み

## 1.5.0 — 2026-09-29
- Per-picture framing for background images and videos: fit (fill / show all), size, horizontal and vertical position, rotation, horizontal flip, and pan (follow global, none, left / right / up / down, zoom in / out, slow rotation) with amount; drag / Shift+drag / wheel directly on the preview / 背景画像・動画ごとに位置・大きさ・回転・反転・パンを調整（プレビュー上で直接操作も可）

## 1.4.0 — 2026-09-29
- Motion System: every motion is composed in layers (layout → enter → hold → emphasis → camera) and takes per-phrase parameters — intensity 0–100, variation 0–100 with a reproducible seed, stagger, easing (linear, ease, cubic, expo, back, elastic, spring with stiffness / damping / mass), length in beats (1/8 beat – 1 bar) and delay / モーションシステム：レイヤー合成と、強さ・ばらつき（シード）・スタッガー・イージング（スプリング含む）・拍単位の長さ・遅延の行ごとの調整
- New emphasis track: 18 accents (scale punch, bounce, shake, impact, stretch / squash, tracking, weight, color flash, blur pulse, elastic, RGB…) triggered on beats, subdivisions, bars, word onsets or the phrase onset / 強調（アクセント）トラックを追加
- Primitive-based presets that fill gaps in the library (slide down / right, scale punch, overshoot, spring, compress, condensed → extended, skew, line height, line split, random reveal, word reorder, word push, fly away, slide-blur, squash, tracking collapse…) / プリミティブから組み立てた新プリセット
- Pen writing, handwritten spelling, typing on manuscript paper (原稿用紙), washed away by / rising out of water, and morphing the previous phrase into the next one / ペンで書く・手書きでつづる・原稿用紙にタイピング・水に流れる・次のフレーズへ変形
- Motion library: metadata for every motion (category, target, energy, readability, recommended length, genres), 19 style tags, MOTION / TYPE samples, sorting / モーションライブラリ（メタデータ・スタイルタグ・サンプル文字・並び替え）
- Auto direction keeps a motion language: ~70% section motif, ~20% variation, ~10% accent / おまかせはモチーフ70%・バリエーション20%・アクセント10%で選択
- Fix: hexagon-pulse background shader failed to compile / ヘキサゴン・パルス背景の不具合を修正

## 1.3.0 — 2026-09-29
- "Make background images / videos the star": auto direction only picks background motions that leave the picture visible (coverage is measured automatically), avoids effects and layouts that hide the image, and applies a look that keeps it clear (Screen 50%, light blend-in, soft text shadow). Turns on automatically with the first image; "Re-apply" swaps covering motions in the current direction / 「背景画像・動画を主役にする」を追加。画像を覆わない背景モーションを自動で選び、画像がよく見える設定に自動調整

## 1.2.0 — 2026-09-29
- Reset settings to defaults (File menu), choosing whether lyrics, lyric timing, the song, song structure & BPM, background images, screen size, title & artist and saved looks are reset too / 「設定を初期状態にリセット」を追加。歌詞・タイミング・曲・曲構成とBPM・背景画像・画面サイズ・タイトル・ルックもあわせて消すかを選べる
- Typographic motions: weight transitions (faux variable weight that also works with Japanese fonts), text on a path / arc, per-character and per-word mask reveals, per-character focus pull, spring / ウェイト変化・カーブや円弧に沿う動き・一文字／単語マスク・一文字ずつピント・スプリング
- Vocaloid-PV style pack: 18 motions (90° roll, stepped zoom, invert flash, RGB split, sweeping bars, TV-static resolve, choppy shake, caption bars…), 8 background motions (HUD rings, speed lines, glyph tiles, shape bursts, oscilloscope, hazard stripes, TV static, rotating split), 5 decorations (grid paper, garbled glyphs, beat shapes, HUD frame, warning tape) and 6 screen effects (two-tone negative flip, quad mirror, beat mosaic, dropped frames, beat zoom, line art) / ボカロPV風のモーション・背景モーション・装飾・画面効果を追加

## 1.1.0 — 2026-09-28
- Background images / videos get their own opacity and blend mode over the plain background; image "Blend" and "Blur" are now stored separately from the Background section / 背景画像・動画そのものの不透明度と描画モードを追加。画像の「なじませ」「ぼかし」を「背景」欄の設定と分離
- "Override" badges on per-phrase / per-section values, and a notice with a one-click reset on the global background-motion blending controls / 個別設定中の印と、全体設定欄の「個別設定を解除」
- Per-phrase background-motion opacity / blend mode / 行ごとの不透明度・描画モード
- Intro / interlude / outro settings for all sections or each section: background strength & speed, opacity & blend, camera motion, scene-change interval, flash, foreground style & opacity, custom section name, progress bar, countdown / イントロ・間奏・アウトロを全体または区間ごとに設定
- Background motion opacity and blend modes (screen, add, multiply, overlay, luminosity, …) so background images stay visible / 背景モーションの不透明度と描画モード（スクリーン・加算・乗算・オーバーレイ・輝度など）を追加。背景画像が見えるように

## 1.0.0 — 2026-09-27
First public release / 初公開

- Auto-timing from vocals, tap timing, beat snapping, quantize / 歌声からの自動タイミング、タップ打刻、ビート吸着
- Auto direction with 22 themes and motion-character controls / 22テーマのおまかせ演出と動きの調整
- Mixed Japanese/Latin typesetting, vertical text, ruby, manual spacing / 和欧混植・縦組み・ルビ・字間調整
- Background images and videos with transitions / 背景画像・動画とトランジション
- UI and manual in Japanese, English, Spanish, Italian, Korean / 5言語対応
- Export to MP4 / MOV / WebM / transparent WebM / PNG sequence / GIF, subtitles and chapters / 各種書き出し
