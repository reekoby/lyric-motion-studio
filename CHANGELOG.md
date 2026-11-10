# Changelog

## 1.13.0 — 2026-11-10
- Screen filters rebuilt: film grain (luminance-weighted, two-scale, mostly monochrome — replaces flat colour noise), bloom with a soft threshold so only highlights glow, VHS (chroma bleed, softened luma, rolling tracking band, head-switch noise), CRT (RGB shadow mask, phosphor glow, rounded bezel) and a spectral 7-tap chromatic aberration / フィルム粒子・光のにじみ・VHS・ブラウン管・色収差を作り直し
- 40 new filters in four new groups / 新しいフィルター40種（4グループ）:
  - Looks: teal & orange, cross process, infrared, night vision, Game Boy, split tone, keep one colour, gradient map, film look (grain + halation + gate weave + flicker + scratches), solarize, bit crush / ルック
  - Art media & print: risograph, photocopy, CMYK halftone, oil paint, watercolour, pencil sketch, cross-hatching, cel shading, manga screentone, LED wall, LCD subpixels, e-paper / 画材・印刷
  - Lens & optics: halation, anamorphic streaks, barrel distortion, dirty lens, spin blur, rolling shutter / レンズ・光学
  - Digital breakage: feedback trails, datamosh, kaleidoscope, Voronoi mosaic, hexagon pixels, edge glow, analogue signal jam / デジタル崩し
- Auto direction uses the new filters in the styles they suit (e.g. cinematic → teal & orange / anamorphic, punk → photocopy / risograph, chiptune → Game Boy / LED wall, psychedelic → kaleidoscope / feedback) / おまかせが各スタイルに合うフィルターを使用

## 1.12.0 — 2026-11-10
- Realistic GPU rebuild of the graphics that looked cheap / 安っぽかったグラフィックをGPUで作り直し:
  - Club: a large mirror ball whose facets reflect a lit room (with grout, tilt jitter and glints), fine volumetric beams and drifting light spots; light-up dance floor and moving-head beams / ミラーボール・ダンスフロア・ムービングライト
  - Horizon: synthwave scene (slit sun, ridge silhouettes with rim light, anti-aliased perspective grid, sun reflection, haze) for Sunset (80s) / Retro grid / Retro sun; a physically lit sea at sunset and at dusk — camera over a wave field, reflected sky with Fresnel, a sun-glitter column on the water and clouds lit from below / 地平線（シンセウェーブ）と、夕日に照らされた海（波に映る空・太陽の光の道・下から照らされた雲）
  - Liquids: glossy liquid flow, liquid chrome and polished marble share one smooth heightfield with a studio light environment (soft boxes, strip light, Fresnel); metaballs and the lava lamp have sphere-true normals and gloss; ink in water is a subtractive dye cloud; the liquid, paint-pour, ink and splash transitions are thick and glossy and keep the palette colour / 液体・クローム・マーブル・メタボール・ラバランプ・水中のインク、液体系トランジションを光沢のある質感に
  - Paint: oil-paint strokes with bristle grooves, impasto ridges, smeared two-colour paint, dry-brush breakup and wet gloss (background strokes, dry brush and marker transitions); glossy paint splat accent / 油絵の具の筆跡（ブラシの溝・盛り上がり・かすれ・濡れたつや）

## 1.11.0 — 2026-11-10
- 12 new auto-direction styles: K-POP, Hyperpop / Y2K, 8-bit / Chiptune, Jazz / Swing, Funk / Disco, Punk / Garage, Trap / Drill, Classical / Orchestral, Horror / Dark, Kids / Nursery songs, Latin / Reggaeton, Techno / Industrial — each with its own palettes, fonts, layouts, entrances / exits, cameras, cuts, accent graphics, backgrounds and emphasis vocabulary / おまかせのスタイルを12種追加
- Auto direction now uses everything added in 1.10 and 1.11 (split-flap, light scan, shards, dust, burn, strike-through, new cameras, cuts, karaoke holds and accents) in the themes where they fit, and gives each section a motion grammar: one timing curve and stagger order (radial, diagonal, line by line, any angle …) chosen from the style's own vocabulary, repeated in matching sections such as every chorus / おまかせが新しい演出を各スタイルに合わせて使い、区間ごとにタイミングカーブとスタッガーの順番をスタイルらしく統一
- Transitions: solid colour wipes are motion-blurred and cast a soft shadow on the picture; whip / roll / zoom cuts mirror-extend the frame so no empty edge is revealed; “Glass shards” rebuilt as a real faceted pane that shatters and falls; new page turn, cube turn, halftone wipe, star zoom, swirl, ripple, kaleidoscope, datamosh and snap-zoom cuts / トランジションを作り直し・追加
- Cameras: handheld (layered natural shake), Dutch angle, crash zoom, Ken Burns, crane, 2.5D orbit, spiral and beat tilt / カメラワークを8種追加
- Karaoke: the wipe now has a soft glowing edge (also correct in vertical text); new holds — glowing karaoke, sung letter pops, sung text sinks back, progress underline / カラオケの塗り境界をやわらかく、歌詞向けの保持モーションを追加
- Emphasis accents: pop, drop, skew snap, glow, wobble, spread / 強調アクセントを追加
- GPU backgrounds: Julia-set fractal, dusk-to-night sky / GPU背景を追加

## 1.10.0 — 2026-11-10
- Motion blur for text: moving letters are smeared only along their own motion (a 180° shutter by default, adjustable or off under Motion → “Text motion blur”). Motions that used a round blur to fake speed now rely on it / 文字のモーションブラー（動いた方向だけにぶれる・180°シャッター相当、調整・オフ可）
- Soft wipe edges: every mask / wipe reveal is feathered like a production matte (toggle under Motion) / ワイプ・マスクの境目をやわらかく
- Easing library: 34 new timing curves — the full sine / quad / cubic / quart / quint / expo / circ / back / elastic / bounce families, production curves (Material standard / decelerate / accelerate, After Effects easy ease and 80% ease, snappy, swift, glide), slow-mo, stepped 4 / 8 / 12 and a hand-keyed “rough” curve, plus a custom cubic-bezier field / タイミングカーブを34種追加（カスタムのベジェ曲線も入力可）
- Stagger order and spacing per phrase: left → right across lines, right → left, top → bottom, bottom → top, radial out / in, diagonal, any angle, one line at a time; the spacing can tighten, open up, bunch at the start or rush through the middle / スタッガーの順番（空間的な順番・角度指定）と間隔の変化
- Quality pass on entrances / exits that looked cheap: word, line and phrase motions now scale and rotate around the word / line / phrase centre instead of piling letters on top of each other (scale punch, zoom out, word slam, word sequence, weight punch, step zoom, heavy landing, rush out …); slides arrive in an order that never drives one letter through another (slide, smear, skew, magnet, slide out); drops start above the frame and no longer hover over the line above before they begin (bounce, zipper, elastic drop); split / strip motions use glyph-sized offsets; the line-drawing write-on traces each outline cleanly with an accent glow; decode and slot reels use random glyphs of the same script (kana stay kana, Latin stays Latin) and lock in with a flash; “Shatter” now really breaks each letter into triangular shards that crack, fly and fall / チープだった登場・退場を作り直し（単語単位の拡大・回転、すり抜けないスライド、落下前の表示、線画の描き順、同じ文字種のデコード、本物の破片に割れるシャッター）
- New entrances: split-flap display, liquid fill, light scan, shards assemble, clockwise wipe, checkerboard, curtain. New exits: crumble to dust, burn away, strike through, select all → delete, colour drains to an outline, clockwise wipe, curtain / 登場・退場を追加（パタパタ・リキッドフィル・ライトスキャン・破片の組み上げ・時計回り・チェッカー・カーテン／灰化・燃え尽き・取り消し線・全選択して削除・色抜け）

## 1.9.0 — 2026-10-12
- Type exact values: click the number next to any slider to type a value (Enter applies, Esc cancels, ↑↓ step by 1, Shift by 10). Values are typed in the unit shown (%, seconds, degrees, em…) and converted to the slider automatically; the inspector waits for you to finish before it refreshes / スライダーの数値をクリックして直接入力できるように（表示の単位のまま入力）

## 1.8.6 — 2026-10-12
- The right-hand panel no longer jumps while you change settings: after each rebuild the control you touched stays at the same place on screen (or the panel keeps its scroll offset), the page itself never scrolls, and browser scroll anchoring is turned off for the panel / 右パネルの設定を変えても画面が勝手にスクロールしないように

## 1.8.5 — 2026-10-11
- Rebuilt hand-made / liquid effects: liquid drip (two-layer paint with long drips, heavy glossy tips and a sheen), splash (paint splats with spikes and thrown droplets), colour burst (powder-paint explosion with streaking particles and soft clouds), ink blob (dark ink with a feathered bleed edge and density variation), marker scribble (streaky hatching with pooled corners), torn paper (fibrous rip with a white torn core, paper grain and curl shading), melt (the frame sags and drips down in columns — new post-shader effect), paint splat accent (spiky splat with droplets and wet shading) and the script swash (broad-nib calligraphic ribbon with an entry hook and end loop) / リキッド・ドリップ・スプラッシュ・カラーバースト・インク・手描きスクリブル・紙を破る・メルト・ペイントの飛沫・筆記体のスワッシュを作り直し

## 1.8.4 — 2026-10-11
- Readability check now also sees what the layout and accent graphics draw on the lyric layer (cards, pills, plates), and the accent colour used by motions (colour wave, colour flash, karaoke-style highlights) is checked against the real background too / 文字の後ろに描かれるカード・ピル等のグラフィックや、色が流れる動き等で使う強調色も、実際の背景に対して読める色に
- Marker and underline are drawn as one thin, continuous, smoothed line per run that follows the glyphs — it bends around ring / arc layouts and wavy motions instead of scattering a rotated block under every letter, and runs down the right side of vertical text / マーカー・下線を文字に沿った1本の帯で描画（円環・弧・縦書きでも崩れない）

## 1.8.3 — 2026-10-11
- Lyrics stay readable on whatever is actually behind them: the renderer samples the finished background (image, background motion, shapes) under the phrase each frame and, when the emphasis or body colour would blend in, switches to a readable colour — one colour per group so a word never changes colour letter by letter, and emphasis keeps a colour distinct from the body text / 強調文字・本文が背景の色と重なって読めなくなる場合に自動で読める色へ切り替え
- Layout decorations (ring text, marquees, shapes) get the same treatment / レイアウトの飾り文字（円環の文字など）も背景と同化しない色に

## 1.8.2 — 2026-10-10
- Synthwave backgrounds rebuilt: Sunset (80s), Retro grid and Retro sun + grid now share one scene — starry gradient sky, slit sun with glow, ridge silhouettes with glowing rims, a glowing perspective grid with depth fade, sun reflection and horizon haze / サンセット（80s）・レトログリッド・レトロサンを作り直し
- Wireframe mountains: proper height-field raymarch (no more stair artifacts), valley road, neon grid with fog; Checker floor: anti-aliased glossy tiles with reflection, slit sun and horizon glow; Gradient tubes: lit 3D tubes with specular highlight, soft shadows and continuous colour / ワイヤーフレーム山脈・チェッカー床・グラデーションチューブを作り直し

## 1.8.1 — 2026-10-10
- Quality pass on background motions that looked flat: silk (per-pixel shaded satin folds with a sharp sheen), brush strokes (paint body with bristle streaks and dry-brush tails), record (turntable with platter, grooves and track gaps, printed label, fixed light reflection and tonearm), rising liquid (meniscus, depth, bubbles, caustics), train-window view (sky, hills, town, poles and wires, bevelled frame), lava lamp (lit metaballs with glow), morphing blob (glossy, layered), ocean (shaded swells, foam crests, glints), petals and leaves (real shapes tumbling in 3D), bubbles (rim, film tint, highlight) / チープだった背景モーションを作り直し（シルク・筆のストローク・レコード・液体・車窓・ラバランプ・ブロブ・波・花びら・葉・泡）

## 1.8.0 — 2026-10-07
- New genre themes: R&B / Soul (silk slide, velvet rise, glow bloom, groove sway, sheen, smoke-out; silk waves, light through blinds, candlelight bokeh, spinning record; gold dust, script swash underline, silk wipe, groove camera) and House / Dance (pumping pop-in, strobe in / out, filter sweep, sidechain pump, four-on-the-floor bounce; mirror ball, light-up dance floor, moving-head beams, piano-house keys; strobe, equalizer underline, strobe cut, sidechain camera) / ジャンルに「R&B / ソウル」「ハウス / ダンス」を追加
- Realistic rain on glass: new screen effect “Rain on the window” that refracts the actual background through every drop (inverted lens view, rim, caustic, highlight), stick-slip sliding drops with wiped trails and residual beads, and a fogged pane; the Water drops / Rain glass shader / Rain backgrounds were rebuilt / 雨の窓ガラスをリアルに作り直し（水滴の屈折・流れる雫と跡・曇り）

## 1.7.0 — 2026-10-07
- Edit word (bunsetsu) breaks inside a phrase: “✂ Edit word breaks” in Word timing lets you click between characters to split a word or join it to the previous one; `^` in the lyric marks a manual break (a phrase with `^` is split only at `^`, spaces and line breaks). Stamped word times follow the word that starts on the same character; `^` is removed from subtitle exports / フレーズ内の単語（文節）の区切りを手動で調整（「✂ 区切りを編集」・`^` 記法）

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
