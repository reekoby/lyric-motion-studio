# Changelog

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
