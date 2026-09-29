/* Motion System: primitives → presets → variation → combination → style.
 *  - easing library (linear … spring with stiffness / damping / mass)
 *  - declarative presets compiled from primitives (translate, scale, rotate, skew, blur, opacity, clip/mask,
 *    tracking, line spread, baseline, weight) into the enter / hold / emphasis / exit tracks
 *  - per-phrase parameters (intensity 0-100, variation 0-100, seed, easing, stagger, delay, beat length,
 *    emphasis trigger / target) applied to every motion, old and new, by the renderer
 *  - metadata + style tags for every motion (category, target, energy, readability, genres …)
 *  - special typography: pen writing, handwriting, water wash, morph into the next phrase, 原稿用紙タイピング */
'use strict';
LM.MS = (() => {
  const { clamp, lerp, hash } = LM.U;
  const E = LM.E, M = LM.motion, PI = Math.PI;
  const A = (p, k = 3) => Math.min(1, Math.max(0, p) * k);

  /* ================= easing ================= */
  function spring(stiffness = 170, damping = 22, mass = 1) {
    const k = clamp(+stiffness || 170, 10, 1000), m = clamp(+mass || 1, 0.1, 10), d = clamp(+damping || 22, 1, 200);
    const w0 = Math.sqrt(k / m), z = d / (2 * Math.sqrt(k * m));
    const ts = clamp(z < 1 ? 6 / (z * w0) : 9 / w0, 0.15, 4); // time until settled (≈0.25%)
    if (z < 1) { const wd = w0 * Math.sqrt(1 - z * z); return (p) => (p >= 1 ? 1 : p <= 0 ? 0 : 1 - Math.exp(-z * w0 * p * ts) * (Math.cos(wd * p * ts) + (z * w0 / wd) * Math.sin(wd * p * ts))); }
    return (p) => (p >= 1 ? 1 : p <= 0 ? 0 : 1 - Math.exp(-w0 * p * ts) * (1 + w0 * p * ts));
  }
  const back = (s = 1.70158) => (p) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
  const EASE = {
    linear: () => E.linear, easeIn: () => E.inQuad, easeOut: () => E.outQuad, easeInOut: () => E.inOutQuad,
    cubic: () => E.outCubic, cubicInOut: () => E.inOutCubic, expo: () => E.outExpo, expoIn: () => E.inExpo,
    back: (o) => back(o && o.s != null ? o.s : 1.70158), elastic: () => E.outElastic,
    spring: (o) => spring(o && o.k, o && o.dm, o && o.ms),
  };
  const EASE_N = { auto: '自動（モーションの標準）', linear: 'リニア（一定）', easeIn: 'イーズイン（加速）', easeOut: 'イーズアウト（減速）', easeInOut: 'イーズインアウト', cubic: 'キュービック', expo: 'エクスポ（鋭く止まる）', back: 'バック（行き過ぎて戻る）', elastic: 'エラスティック（ゴム）', spring: 'スプリング（ばね）' };
  const ease = (name, o) => (EASE[name] ? EASE[name](o) : E.outCubic);
  // time warp for motions that already contain their own easing (monotonic curves only)
  const WARP = { linear: (p) => p, easeIn: (p) => p * p, easeOut: (p) => 1 - (1 - p) * (1 - p), easeInOut: E.inOutQuad, cubic: E.outCubic, expo: E.outExpo };

  /* ================= primitive compiler ================= */
  const unitVal = (v, g, c) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v * g.size;
    const m = /^(-?[\d.]+)(W|H|s)$/.exec(String(v)); if (!m) return 0;
    return +m[1] * (m[2] === 'W' ? c.W : m[2] === 'H' ? c.H : g.size);
  };
  // apply primitive deviations scaled by k (1 = full offset, 0 = rest)
  function prim(P, k, g, c) {
    const T = {};
    if (P.x != null) T.x = unitVal(P.x, g, c) * k;
    if (P.y != null) T.y = unitVal(P.y, g, c) * k;
    if (P.s != null) { T.sx = 1 + (P.s - 1) * k; T.sy = T.sx; }
    if (P.sx != null) T.sx = (T.sx || 1) * (1 + (P.sx - 1) * k);
    if (P.sy != null) T.sy = (T.sy || 1) * (1 + (P.sy - 1) * k);
    if (P.rot != null) T.rot = P.rot * k;
    if (P.skx != null) T.skx = P.skx * k;
    if (P.blur != null) T.blur = Math.max(0, P.blur * g.size * k);
    if (P.track != null) T.x = (T.x || 0) + (g.x - c.cx) * P.track * k;
    if (P.spread != null) T.y = (T.y || 0) + (g.y - c.cy) * P.spread * k;
    if (P.base != null) T.y = (T.y || 0) + (g.i % 2 ? 1 : -1) * P.base * g.size * k;
    if (P.wt != null) T.wt = P.wt * k;
    if (P.rgb != null) T.rgb = P.rgb * g.size * Math.abs(k);
    if (P.mask) T.lineMask = true;
    return T;
  }
  const META = {};
  function define(kind, id, def) {
    const lib = M[kind];
    const ez = def.ease ? ease(def.ease, def.eo) : kind === 'exit' ? E.inCubic : E.outExpo;
    let f = def.f;
    if (!f && kind === 'enter') f = (p, g, c) => { const q = ez(p); const T = prim(def.from, 1 - q, g, c); if (def.from.a != null) T.a = lerp(def.from.a, 1, A(p, def.aK || 3)); return T; };
    if (!f && kind === 'exit') f = (p, g, c) => { const q = ez(p); const T = prim(def.to, q, g, c); if (def.to.a != null) { const a0 = def.aStart == null ? 0.35 : def.aStart; T.a = lerp(1, def.to.a, clamp((p - a0) / (1 - a0))); } return T; };
    lib[id] = Object.assign({ n: def.n, c: def.c, d: def.d || 0.6, st: def.st == null ? 0.3 : def.st, u: def.u, o: def.o, f }, def.x || {});
    if (def.meta) META[kind + ':' + id] = def.meta;
    return lib[id];
  }

  /* ================= new presets (checked against the existing library: only ones with a clearly
     different timing, spatial behaviour, typography behaviour or rhythm) ================= */
  const en = (id, d) => define('enter', id, d), ex = (id, d) => define('exit', id, d);
  // --- entrance
  en('slideDownIn', { n: '上からスライド', c: '基本', d: 0.55, st: 0.3, u: 'w', from: { y: -0.9, a: 0 }, meta: { tags: ['Clean', 'Commercial'], energy: 30 } });
  en('slideRightIn', { n: '右からスライド', c: 'スライド', d: 0.55, st: 0.25, u: 'w', from: { x: '0.28W', a: 0 }, meta: { tags: ['Clean', 'Commercial'], energy: 40 } });
  en('scalePunchIn', { n: 'スケールパンチ（大きく叩いて着地）', c: 'はずむ', d: 0.4, st: 0.35, u: 'w', ease: 'back', eo: { s: 2.4 }, from: { s: 1.9, a: 0 }, aK: 6, meta: { tags: ['Energetic', 'Commercial'], energy: 78 } });
  en('overshootIn', { n: 'オーバーシュート（行き過ぎて戻る）', c: 'スライド', d: 0.6, st: 0.3, u: 'w', ease: 'back', eo: { s: 2.8 }, from: { y: 1.3, a: 0 }, meta: { tags: ['Playful', 'Energetic'], energy: 60 } });
  en('springRise', { n: 'ばねで跳ね上がる（スプリング）', c: 'はずむ', d: 0.9, st: 0.25, u: 'g', ease: 'spring', eo: { k: 240, dm: 12, ms: 1 }, from: { y: 1.1, sy: 0.6, a: 0 }, aK: 6, meta: { tags: ['Playful', 'Cute'], energy: 62 } });
  en('compressIn', { n: '押しつぶしから展開（コンプレス）', c: 'ズーム', d: 0.55, st: 0, u: 'a', from: { sy: 0.04, sx: 1.5, a: 0 }, aK: 5, meta: { tags: ['Swiss', 'Editorial', 'Mechanical'], energy: 55 } });
  en('condensedIn', { n: 'コンデンス→エクステンド（字幅が広がる）', c: 'ウェイト', d: 0.7, st: 0, u: 'a', from: { sx: 0.35, track: -0.55, wt: 0.8, a: 0 }, meta: { tags: ['Swiss', 'Editorial'], energy: 40 } });
  en('skewIn', { n: 'スキューで滑り込む', c: 'スライド', d: 0.5, st: 0.25, u: 'w', from: { x: -1.6, skx: -0.7, a: 0 }, meta: { tags: ['Energetic', 'Commercial'], energy: 58 } });
  en('rotateWordIn', { n: '単語ごとに回転して着地', c: '回転', d: 0.6, st: 0.45, u: 'w', from: { rot: -0.9, s: 0.4, a: 0 }, meta: { tags: ['Playful', 'Energetic'], energy: 55 } });
  en('lineSpreadIn', { n: '行間が開いて整う（ラインハイト）', c: 'マスク', d: 0.8, st: 0, u: 'a', from: { spread: -0.85, a: 0 }, meta: { tags: ['Editorial', 'Elegant', 'Clean'], energy: 25, target: ['line'] } });
  en('lineSplitIn', { n: '行が左右から交互に入る', c: 'スライド', d: 0.6, st: 0.2, u: 'l', f: (p, g, c) => { const q = E.outExpo(p); return { x: (g.line % 2 ? 1 : -1) * c.W * 0.4 * (1 - q), a: A(p, 4) }; }, meta: { tags: ['Editorial', 'Swiss'], energy: 50, target: ['line'] } });
  en('randomReveal', { n: 'ランダムに一文字ずつ点灯', c: 'デジタル', d: 0.12, st: 0.85, u: 'g', o: 'random', f: (p) => ({ a: p > 0.5 ? 1 : 0, bright: p < 1 ? 0.4 : 0 }), meta: { tags: ['Digital', 'Minimal'], energy: 45 } });
  en('wordReorder', { n: '単語が入れ替わって正しい順に並ぶ', c: '集合', d: 0.85, st: 0, u: 'a', f: (p, g, c) => {
    const q = E.inOutCubic(p), gl = c.gl || [], n = Math.max(1, c.W_), w = g.wordIdx, tw = (w * 7 + 3) % n;
    let sx = 0, cnt = 0, tx = 0, tc = 0; for (const h of gl) { if (h.wordIdx === w) { sx += h.x; cnt++; } if (h.wordIdx === tw) { tx += h.x; tc++; } }
    const d = cnt && tc ? tx / tc - sx / cnt : 0; return { x: d * (1 - q), y: Math.sin(q * PI) * g.size * 0.35 * (w % 2 ? 1 : -1), a: A(p, 5) };
  }, meta: { tags: ['Editorial', 'Experimental', 'Playful'], energy: 55, target: ['word'] } });
  en('wordPush', { n: '単語が押し込まれて並ぶ（ワードプッシュ）', c: 'スライド', d: 0.9, st: 0, u: 'a', f: (p, g, c) => {
    const n = Math.max(1, c.W_), w = g.wordIdx || 0, arr = clamp(p * n * 1.15 - w), nx = clamp(p * n * 1.15 - (w + 1));
    const recoil = -Math.sin(PI * clamp(nx * 1.6)) * g.size * 0.28;
    return { x: (1 - E.outExpo(arr)) * c.W * 0.3 + recoil, a: arr > 0 ? A(arr, 6) : 0 };
  }, meta: { tags: ['Commercial', 'Editorial'], energy: 50, target: ['word'] } });
  // --- exit
  ex('flyAway', { n: '回転しながら飛び去る（フライアウェイ）', c: 'スライド', d: 0.55, st: 0.35, u: 'w', ease: 'expoIn', to: { x: '0.3W', y: -2.2, rot: 0.8, blur: 0.12, a: 0 }, meta: { tags: ['Energetic', 'Playful'], energy: 65 } });
  ex('slideBlurOut', { n: 'ブラーを残してスライドアウト', c: 'スライド', d: 0.45, st: 0.15, u: 'w', ease: 'expoIn', to: { x: '-0.35W', blur: 0.25, sx: 1.4, a: 0 }, aStart: 0.2, meta: { tags: ['Cinematic', 'Commercial'], energy: 55 } });
  ex('squashOut', { n: 'つぶれて消える（スカッシュ）', c: 'はずむ', d: 0.4, st: 0.2, u: 'g', ease: 'back', eo: { s: 3 }, f: (p, g) => { const q = E.inBack(p); return { sy: Math.max(0.02, 1 - q), sx: 1 + q * 0.5, y: q * g.size * 0.4, a: 1 - E.inQuint(p) }; }, meta: { tags: ['Playful', 'Cute'], energy: 55 } });
  ex('trackCollapseOut', { n: '字間が詰まって消える', c: 'ウェイト', d: 0.55, st: 0, u: 'a', to: { track: -0.9, sx: 0.5, a: 0 }, meta: { tags: ['Swiss', 'Minimal', 'Editorial'], energy: 35 } });
  ex('lineSpreadOut', { n: '行間が開いて散る', c: 'マスク', d: 0.6, st: 0, u: 'a', to: { spread: 1.4, blur: 0.08, a: 0 }, meta: { tags: ['Elegant', 'Cinematic'], energy: 30, target: ['line'] } });

  /* ================= continuous (hold) ================= */
  Object.assign(M.hold, {
    parallaxDrift: { n: '行ごとに視差でただよう（パララックス）', c: 'ゆらぎ', f: (ht, g, c) => { const k = (g.line || 0) % 3 + 1; return { x: Math.sin(ht * 0.35 + k) * g.size * 0.12 * k * c.amp, y: Math.cos(ht * 0.28 + k * 2) * g.size * 0.05 * c.amp }; } },
    charFloat: { n: '一文字ずつ別々にただよう', c: 'ゆらぎ', f: (ht, g, c) => ({ y: Math.sin(ht * (1.1 + g.r1 * 0.8) + g.r2 * 6) * g.size * 0.06 * c.amp, rot: Math.sin(ht * (0.7 + g.r3) + g.r1 * 5) * 0.03 * c.amp }) },
    baselineStep: { n: 'ビートでベースラインが段違いに', c: 'ウェイト', f: (ht, g, c) => { const k = Math.floor((c.tAbs || ht) * 2 * (c.tempo || 1)); return { y: ((g.i + k) % 2 ? 1 : -1) * g.size * 0.07 * c.amp }; } },
    waterHold: { n: '水面のようにゆらめく', c: '水', f: (ht) => ({ wash: 0.06 + 0.04 * Math.sin(ht * 1.3) }) },
  });

  /* ================= emphasis (new track) ================= */
  const ENV = {
    hit: (q) => (q < 0.14 ? E.outCubic(q / 0.14) : 1 - E.outCubic((q - 0.14) / 0.86)),
    pulse: (q) => Math.sin(PI * q),
    shake: (q) => Math.sin(q * PI * 9) * (1 - q),
    elastic: (q) => Math.exp(-5 * q) * Math.cos(q * PI * 5) * (1 - q * q),
    step: (q) => (q < 0.5 ? 1 : 0),
  };
  const emph = { none: { n: 'なし', c: '基本', env: 'hit', dur: 0.3, peak: {} } };
  const em = (id, n, c, env, dur, peak, meta) => { emph[id] = { n, c, env, dur, peak }; META['emph:' + id] = meta; };
  em('scalePunch', 'スケールパンチ', 'インパクト', 'hit', 0.32, { s: 0.28 }, { tags: ['Energetic', 'Commercial'], energy: 75 });
  em('bounce', 'バウンス（跳ねる）', 'はずむ', 'pulse', 0.3, { y: -0.35 }, { tags: ['Playful', 'Cute'], energy: 60 });
  em('pulse', 'パルス（ふくらむ）', '基本', 'pulse', 0.4, { s: 0.12 }, { tags: ['Clean', 'Minimal'], energy: 35 });
  em('shake', 'シェイク（揺れ）', 'インパクト', 'shake', 0.35, { x: 0.18 }, { tags: ['Aggressive', 'Energetic'], energy: 80 });
  em('impact', 'インパクト（沈んで光る）', 'インパクト', 'hit', 0.28, { s: 0.18, y: 0.12, bright: 0.55 }, { tags: ['Aggressive', 'Energetic'], energy: 88 });
  em('stretchHit', 'ストレッチ（縦に伸びる）', 'はずむ', 'hit', 0.3, { sy: 0.4, sx: -0.12 }, { tags: ['Playful', 'Energetic'], energy: 65 });
  em('squashHit', 'スカッシュ（つぶれる）', 'はずむ', 'hit', 0.3, { sy: -0.3, sx: 0.22 }, { tags: ['Playful', 'Cute'], energy: 60 });
  em('rotateAccent', 'ローテート（くるっと傾く）', '回転', 'elastic', 0.5, { rot: 0.28 }, { tags: ['Playful'], energy: 55 });
  em('tiltHit', 'チルト（斜めに傾く）', '回転', 'hit', 0.35, { skx: 0.35 }, { tags: ['Editorial', 'Energetic'], energy: 50 });
  em('jitterHit', 'ジッター（細かく震える）', 'デジタル', 'shake', 0.3, { x: 0.06, y: 0.06, jit: 1 }, { tags: ['Glitch', 'Digital'], energy: 70 });
  em('trackExpand', 'トラッキング拡張（字間が開く）', 'ウェイト', 'hit', 0.4, { track: 0.18 }, { tags: ['Swiss', 'Editorial'], energy: 45 });
  em('trackCompress', 'トラッキング圧縮（字間が詰まる）', 'ウェイト', 'hit', 0.35, { track: -0.12 }, { tags: ['Swiss', 'Minimal'], energy: 40 });
  em('weightHit', 'ウェイト変化（太くなる）', 'ウェイト', 'hit', 0.35, { wt: 1.1 }, { tags: ['Swiss', 'Editorial'], energy: 50 });
  em('colorFlash', 'カラーフラッシュ（色が光る）', '基本', 'step', 0.22, { accent: 1, bright: 0.35 }, { tags: ['Energetic', 'Commercial'], energy: 60 });
  em('blurPulse', 'ブラーパルス（一瞬ぼける）', 'ぼかし', 'hit', 0.3, { blur: 0.12, s: 0.05 }, { tags: ['Cinematic', 'Elegant'], energy: 40 });
  em('waveHit', 'ウェーブ（波が走る）', 'ゆらぎ', 'wave', 0.5, { y: -0.3 }, { tags: ['Organic', 'Playful'], energy: 45 });
  em('elasticHit', 'エラスティック（ゴムで弾む）', 'はずむ', 'elastic', 0.6, { s: 0.22 }, { tags: ['Playful', 'Energetic'], energy: 70 });
  em('rgbHit', 'RGBずれ（ヒット）', 'デジタル', 'hit', 0.25, { rgb: 0.2 }, { tags: ['Glitch', 'Digital'], energy: 75 });
  M.emph = emph;
  const TRIG = { beat: '毎拍', half: '8分音符ごと', quarter: '16分音符ごと', eighth: '32分音符ごと', bar: '小節ごと（4拍）', two: '2拍ごと', word: '単語の歌い出し', phrase: 'フレーズの頭（1回）' };
  const TGT = { auto: '強調語（*語句*）があればそこ、なければ全体', all: '全体', emph: '強調語だけ', word: '歌っている単語' };
  // emphasis transform for one glyph at q (0..1 since trigger)
  function emphT(id, q, g, c, k) {
    const e = emph[id]; if (!e || id === 'none' || q < 0 || q >= 1) return null;
    const P = e.peak;
    const v = e.env === 'wave' ? Math.max(0, Math.sin(PI * clamp(q * 2.2 - (g.xn || 0) * 1.2))) : ENV[e.env](q);
    const T = {};
    if (P.s) { T.sx = 1 + P.s * v * k; T.sy = T.sx; }
    if (P.sx) T.sx = (T.sx || 1) * (1 + P.sx * v * k);
    if (P.sy) T.sy = (T.sy || 1) * (1 + P.sy * v * k);
    if (P.x) T.x = P.x * g.size * v * k * (P.jit ? hash(g.i, Math.floor(q * 30)) * 2 - 1 : 1);
    if (P.y) T.y = P.y * g.size * v * k * (P.jit ? hash(g.i, Math.floor(q * 30), 3) * 2 - 1 : 1);
    if (P.rot) T.rot = P.rot * v * k * (g.i % 2 ? 1 : -1) * (P.x ? 1 : 1);
    if (P.skx) T.skx = P.skx * v * k;
    if (P.blur) T.blur = P.blur * g.size * Math.abs(v) * k;
    if (P.track) T.x = (T.x || 0) + (g.x - c.cx) * P.track * v * k;
    if (P.wt) T.wt = P.wt * Math.max(0, v) * k;
    if (P.rgb) T.rgb = P.rgb * g.size * Math.abs(v) * k;
    // scale around the phrase centre so letters grow as a block instead of overlapping
    if (T.sx != null && T.sx !== 1) T.x = (T.x || 0) + (g.x - c.cx) * (T.sx - 1);
    if (T.sy != null && T.sy !== 1) T.y = (T.y || 0) + (g.y - c.cy) * (T.sy - 1);
    if (P.bright) T.bright = P.bright * Math.max(0, v);
    if (P.accent && v > 0.3) T.accent = true;
    return T;
  }

  /* ================= special typography ================= */
  const HAND = ['kurenaido', 'yomogi', 'klee', 'hachimaru', 'yusei', 'caveat'];
  Object.assign(M.enter, {
    penWrite: { n: 'ペンで書く（線を描いてから塗る）', c: '手書き', d: 0.5, wt: 'char', st: 0, font: ['klee', 'kurenaido', 'yomogi', 'caveat'], f: (p) => ({ stroke: clamp(p / 0.8), fillA: clamp((p - 0.6) / 0.4), pen: p > 0 && p < 1 ? p : 0, vis: p > 0 }) },
    handWrite: { n: '手書きでつづる（筆跡が走る）', c: '手書き', d: 0.38, wt: 'char', st: 0, font: HAND, f: (p, g) => ({ hand: p, vis: p > 0, rot: (1 - E.outCubic(p)) * (g.r1 - 0.5) * 0.14, blur: (1 - p) * g.size * 0.025 }) },
    genkoType: { n: '原稿用紙にタイピング', c: '手書き', d: 0.12, wt: 'char', st: 0, genko: true, font: ['mincho', 'klee', 'serif'], f: (p) => (p <= 0 ? { a: 0, cellA: 1 } : p < 1 ? { sx: lerp(1.35, 1, E.outCubic(p)), sy: lerp(1.35, 1, E.outCubic(p)), caret: 1, cellA: 1 } : {}) },
    waterIn: { n: '水の中から浮かび上がる', c: '水', d: 1.0, st: 0.3, u: 'g', f: (p) => ({ wash: 1 - E.outCubic(p), a: A(p, 2) }) },
    morphFrom: { n: '前のフレーズから変形して次の言葉になる', c: '変形', d: 0.9, st: 0.12, u: 'g', morph: true, f: (p, g, c) => {
      const L0 = c.prevL, q = E.inOutCubic(p), w = Math.sin(PI * q);
      let sx0, sy0, s0 = 0.3, ch0 = null;
      if (L0 && L0.glyphs && L0.glyphs.length) { const n0 = L0.glyphs.length, src = L0.glyphs[Math.min(n0 - 1, Math.floor((g.k / Math.max(1, c.N)) * n0))]; sx0 = src.x; sy0 = src.y; s0 = src.size / Math.max(1, g.size); ch0 = src.ch; }
      else { sx0 = c.cx; sy0 = c.cy; }
      const T = { x: (sx0 - g.x) * (1 - q), y: (sy0 - g.y) * (1 - q) - w * g.size * 0.35 * (g.r1 - 0.5) * 2 };
      const sc = lerp(s0, 1, q); T.sx = sc * (1 + w * 0.4 * Math.sin(g.i * 1.7 + p * 9)); T.sy = sc * (1 - w * 0.3 * Math.cos(g.i * 1.3 + p * 7));
      T.skx = w * 0.5 * (g.r2 - 0.5); T.rot = w * 0.6 * (g.r3 - 0.5); T.blur = w * g.size * 0.14;
      if (ch0 && q < 0.5) T.ch = ch0;
      return T;
    } },
  });
  Object.assign(M.exit, {
    waterOut: { n: '水に流されて消える', c: '水', d: 1.1, st: 0.3, u: 'g', f: (p) => ({ wash: E.inOutCubic(p), a: 1 - E.inQuad(clamp((p - 0.35) / 0.65)) }) },
  });

  if (LM.fx && LM.fx.list) LM.fx.list.genkoGrid = { n: '原稿用紙のマス目', c: 'text', k: 'glyph' };

  /* ================= per-phrase parameters ================= */
  // c.mp = { seed, e:{i,v,ease,st,beats,delay,k,dm,ms}, h:{i,v}, m:{i,v,trig,tgt}, x:{i,v,ease,st,beats} }
  const TRK = { enter: 'e', hold: 'h', emph: 'm', exit: 'x' };
  const par = (c, kind) => (c && c.mp && c.mp[TRK[kind]]) || null;
  // intensity 0..100 → how strongly each primitive reacts (not a single linear factor)
  function ik(i) { if (i == null) return null; i = clamp(+i, 0, 100) / 100; const d = i < 0.5 ? lerp(0.2, 1, i * 2) : lerp(1, 1.9, (i - 0.5) * 2); return { d, s: Math.sqrt(d), r: Math.pow(d, 0.8), b: Math.pow(d, 0.7), st: lerp(0.85, 1.2, i) }; }
  function scaleT(A, K) {
    if (!A || !K) return A;
    const B = Object.assign({}, A);
    if (B.x) B.x *= K.d; if (B.y) B.y *= K.d;
    if (B.rot) B.rot *= K.r; if (B.skx) B.skx *= K.r;
    if (B.blur) B.blur *= K.b;
    if (B.sx != null) B.sx = 1 + (B.sx - 1) * K.s; if (B.sy != null) B.sy = 1 + (B.sy - 1) * K.s;
    if (B.wt) B.wt *= K.s; if (B.rgb) B.rgb *= K.d; if (B.stripOff) B.stripOff *= K.d; if (B.split) B.split *= K.d;
    return B;
  }
  // deterministic variation per word: direction / distance / rotation / timing
  function vary(A, v, seed, g, dev) {
    if (!A || !v) return A;
    const w = g.wordIdx || 0, r1 = hash(seed, w, 1), r2 = hash(seed, w, 2), r3 = hash(seed, w, 3), r4 = hash(seed, w, 4);
    const B = Object.assign({}, A), m = 1 + (r3 - 0.5) * v * 0.8;
    if (B.x) B.x *= (r1 < v * 0.5 ? -1 : 1) * m;
    if (B.y) B.y *= (r2 < v * 0.3 ? -1 : 1) * m;
    if (dev > 0.001) B.rot = (B.rot || 0) + (r4 - 0.5) * v * 0.5 * dev;
    return B;
  }
  const timeShift = (v, seed, g) => (v ? hash(seed, g.wordIdx || 0, 5) * v * 0.3 : 0);

  /* ================= metadata & style tags ================= */
  const STYLE = ['Minimal', 'Clean', 'Editorial', 'Swiss', 'Commercial', 'Cinematic', 'Energetic', 'Aggressive', 'Playful', 'Cute', 'Elegant', 'Luxury', 'Experimental', 'Digital', 'Retro', 'Glitch', 'Organic', 'Mechanical', 'Futuristic'];
  const STYLE_JA = { Minimal: 'ミニマル', Clean: 'クリーン', Editorial: 'エディトリアル', Swiss: 'スイス', Commercial: 'コマーシャル', Cinematic: 'シネマ', Energetic: 'エネルギッシュ', Aggressive: 'アグレッシブ', Playful: 'ポップ', Cute: 'キュート', Elegant: 'エレガント', Luxury: 'ラグジュアリー', Experimental: '実験的', Digital: 'デジタル', Retro: 'レトロ', Glitch: 'グリッチ', Organic: 'オーガニック', Mechanical: 'メカニカル', Futuristic: 'フューチャー' };
  const CAT_TAGS = {
    '基本': ['Minimal', 'Clean'], 'はずむ': ['Playful', 'Cute'], '文字送り': ['Editorial', 'Retro', 'Mechanical'], 'スライド': ['Clean', 'Commercial'], 'デジタル': ['Digital', 'Glitch', 'Futuristic'],
    'ズーム': ['Energetic', 'Commercial'], 'マスク': ['Editorial', 'Swiss', 'Clean'], '回転': ['Playful', 'Energetic'], '3D': ['Cinematic', 'Futuristic'], '重力': ['Playful', 'Organic'],
    'ぼかし': ['Cinematic', 'Elegant', 'Luxury'], '集合': ['Experimental', 'Energetic'], '手作り': ['Organic', 'Retro', 'Cute'], 'フロー': ['Organic', 'Elegant'], '単語打ち': ['Editorial', 'Energetic', 'Aggressive'],
    'エッジ': ['Experimental', 'Aggressive'], 'ゆらぎ': ['Organic', 'Minimal'], 'エネルギー': ['Energetic', 'Aggressive'], '歌詞': ['Editorial', 'Clean'], '3D配置': ['Futuristic', 'Experimental'], '飛散': ['Aggressive', 'Energetic'],
    'ウェイト': ['Swiss', 'Editorial', 'Minimal'], 'パス': ['Organic', 'Playful', 'Experimental'], 'ボカロ': ['Digital', 'Glitch', 'Aggressive'], 'インパクト': ['Energetic', 'Aggressive'],
    '手書き': ['Organic', 'Retro', 'Elegant'], '水': ['Organic', 'Cinematic', 'Elegant'], '変形': ['Experimental', 'Organic', 'Futuristic'],
  };
  const FEEL_TAG = { glitch: 'Glitch', cinema: 'Cinematic', bounce: 'Playful', snap: 'Energetic', organic: 'Organic', smooth: 'Clean', kinetic: 'Editorial' };
  const READ = { '飛散': 55, '3D配置': 60, 'エッジ': 65, 'ボカロ': 68, 'デジタル': 72, '集合': 70, '3D': 75, '変形': 70, '水': 75 };
  const CATEGORY = { enter: 'entrance', exit: 'exit', hold: 'continuous', emph: 'emphasis' };
  const SUBCAT = { 'マスク': 'mask', 'ウェイト': 'typography', 'パス': 'typography', '3D': 'transform', '3D配置': 'transform', '回転': 'transform', '単語打ち': 'word', '手書き': 'typography', '変形': 'transition', '水': 'typography' };
  const TARGET = { g: ['character'], w: ['word'], l: ['line'], a: ['phrase'] };
  const metaCache = {};
  function meta(kind, id) {
    const key = kind + ':' + id; if (metaCache[key]) return metaCache[key];
    const lib = M[kind] || {}, m = lib[id]; if (!m) return null;
    const ex2 = META[key] || {};
    const dm = LM.director && LM.director.meta ? LM.director.meta(kind === 'emph' ? 'hold' : kind, id) : { e: 0.45, f: [] };
    const energy = ex2.energy != null ? ex2.energy : Math.round((dm.e || 0.45) * 100);
    const tags = new Set(ex2.tags || []);
    (CAT_TAGS[m.c] || []).forEach((t) => tags.add(t));
    (dm.f || []).forEach((f) => FEEL_TAG[f] && tags.add(FEEL_TAG[f]));
    if (energy <= 20) tags.add('Minimal'); if (energy >= 82) tags.add('Aggressive');
    const genres = (LM.data.themes || []).filter((th) => th[kind] && th[kind][id]).map((th) => th.id);
    const unit = m.wt ? (m.wt === 'char' ? 'g' : 'w') : m.per ? 'g' : m.u || 'g';
    const d = m.per ? (m.d || 0.05) * 8 : m.d || (m.dur || 0.4);
    const read = ex2.readability != null ? ex2.readability : clamp((READ[m.c] || 88) - (energy > 80 ? 8 : 0), 40, 98);
    const cat = [CATEGORY[kind]]; if (SUBCAT[m.c]) cat.push(SUBCAT[m.c]); if (unit === 'g' && (m.st || 0) > 0.3) cat.push('character'); if (unit === 'w') cat.push('word');
    return (metaCache[key] = {
      id, name: m.n, kind, category: cat, tags: [...tags].slice(0, 5), target: ex2.target || TARGET[unit] || ['character'],
      intensityRange: energy > 70 ? [30, 100] : energy < 30 ? [0, 70] : [10, 90], recommendedDuration: [Math.round(d * 600), Math.round(d * 1600)],
      recommendedGenres: genres, energy, readability: read,
    });
  }
  const search = (kind, q, tags) => Object.keys(M[kind] || {}).map((id) => meta(kind, id)).filter((x) => x && (!tags || !tags.length || tags.every((t) => x.tags.includes(t))) && (!q || x.name.includes(q) || x.id.toLowerCase().includes(String(q).toLowerCase())));

  /* ================= theme pools ================= */
  const D = LM.data, addW = (id, k, o) => { const t = D && D.themeById[id]; if (t) t[k] = Object.assign({}, t[k] || {}, o); };
  addW('ballad', 'enter', { penWrite: 1, handWrite: 1.2, waterIn: 0.8, morphFrom: 0.5 }); addW('ballad', 'exit', { waterOut: 1 }); addW('ballad', 'hold', { charFloat: 0.8, parallaxDrift: 0.8 });
  addW('acoustic', 'enter', { handWrite: 1.5, penWrite: 1, genkoType: 0.8 });
  addW('lofi', 'enter', { handWrite: 1, genkoType: 1, penWrite: 0.8 });
  addW('wa', 'enter', { genkoType: 1.5, handWrite: 1.2, penWrite: 1 });
  addW('ambient', 'enter', { waterIn: 1, morphFrom: 0.8 }); addW('ambient', 'exit', { waterOut: 1.2, lineSpreadOut: 0.8 }); addW('ambient', 'hold', { parallaxDrift: 1.2 });
  addW('dream', 'enter', { morphFrom: 1.2, waterIn: 0.8 }); addW('dream', 'exit', { waterOut: 1 }); addW('dream', 'hold', { charFloat: 1, waterHold: 0.8 });
  addW('cinematic', 'enter', { morphFrom: 0.8, lineSpreadIn: 1.2 }); addW('cinematic', 'exit', { lineSpreadOut: 1, slideBlurOut: 1 }); addW('cinematic', 'hold', { parallaxDrift: 1 });
  addW('minimal', 'enter', { condensedIn: 1.2, compressIn: 1 }); addW('minimal', 'exit', { trackCollapseOut: 1.2 }); addW('minimal', 'hold', { baselineStep: 0.8 });
  addW('jpop', 'enter', { scalePunchIn: 1.2, springRise: 1.2, overshootIn: 1 }); addW('jpop', 'exit', { squashOut: 1, flyAway: 0.8 });
  addW('anison', 'enter', { scalePunchIn: 1.2, overshootIn: 1, wordPush: 0.8 }); addW('anison', 'exit', { flyAway: 1 });
  addW('edm', 'enter', { scalePunchIn: 1.2, compressIn: 1 }); addW('edm', 'exit', { slideBlurOut: 1 });
  addW('hiphop', 'enter', { wordPush: 1.2, skewIn: 1, slideRightIn: 1 }); addW('hiphop', 'exit', { slideBlurOut: 1 });
  addW('citypop', 'enter', { slideRightIn: 1, skewIn: 1, lineSplitIn: 1 });
  addW('showreel', 'enter', { lineSplitIn: 1.2, wordReorder: 1, compressIn: 1 });
  addW('edge', 'enter', { wordReorder: 1, randomReveal: 1 }); addW('vocaloid', 'enter', { randomReveal: 1.2 });
  addW('rock', 'enter', { scalePunchIn: 1 }); addW('metal', 'enter', { scalePunchIn: 1 }); addW('psyche', 'enter', { morphFrom: 1 });

  return { spring, ease, EASE_N, WARP, define, prim, emphT, ENV, TRIG, TGT, par, ik, scaleT, vary, timeShift, meta, search, STYLE, STYLE_JA, HAND };
})();
