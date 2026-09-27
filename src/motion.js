/* Motion library: enter / hold / exit (independent tracks) */
'use strict';
LM.motion = (() => {
  const { clamp, lerp, hash } = LM.U;
  const E = LM.E;
  const PI = Math.PI;
  const SCR = Array.from('アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン01#%&@$?!<>/=+*ABCDEFGHJKLMNPQRSTUVWXYZ');
  const rch = (a, b) => SCR[Math.floor(hash(a, b, 7) * SCR.length)];
  // group scale helper (scale positions around group center)
  const gsc = (T, g, c, sx, sy = sx) => {
    T.x = (T.x || 0) + (g.x - c.cx) * (sx - 1);
    T.y = (T.y || 0) + (g.y - c.cy) * (sy - 1);
    T.sx = (T.sx == null ? 1 : T.sx) * sx;
    T.sy = (T.sy == null ? 1 : T.sy) * sy;
    return T;
  };
  const grot = (T, g, c, a) => {
    const dx = g.x - c.cx, dy = g.y - c.cy;
    const cs = Math.cos(a), sn = Math.sin(a);
    T.x = (T.x || 0) + (dx * cs - dy * sn - dx);
    T.y = (T.y || 0) + (dx * sn + dy * cs - dy);
    T.rot = (T.rot || 0) + a;
    return T;
  };
  const A = (p, k = 3) => Math.min(1, p * k);

  /* ---------------- ENTER ---------------- */
  // fields: n=name, c=category, d=duration(s), st=stagger fraction, u=unit(g|w|l|a), o=order, f=fn(p,g,c)->T, clip(ctx,p,B,c)
  const enter = {
    none: { n: 'なし（即表示）', c: '基本', d: 0.01, st: 0, u: 'a', f: () => ({}) },
    fade: { n: 'フェード', c: '基本', d: 0.55, st: 0.3, f: (p) => ({ a: E.outQuad(p) }) },
    rise: { n: '浮かび上がる', c: '基本', d: 0.6, st: 0.35, f: (p, g, c) => ({ y: (1 - E.outCubic(p)) * g.size * 0.6 * c.amp, a: A(p, 2.2) }) },
    riseLine: { n: '行ごとに上昇', c: '基本', d: 0.6, st: 0.45, u: 'l', f: (p, g, c) => ({ y: (1 - E.outExpo(p)) * g.size * 1.4 * c.amp, a: A(p, 2) }) },
    pop: { n: 'ポップ', c: 'はずむ', d: 0.5, st: 0.4, f: (p) => { const s = Math.max(0, E.outBack(p)); return { sx: s, sy: s, a: A(p, 3) }; } },
    wordPop: { n: '単語ごとにポップ', c: 'はずむ', d: 0.7, st: 0.8, u: 'w', f: (p, g) => { const s = Math.max(0, E.outBack(p)); return { sx: s, sy: s, y: (1 - s) * g.size * 0.2, a: A(p, 4) }; } },
    typewriter: { n: 'タイプライター', c: '文字送り', d: 0.05, per: true, st: 0.98, f: (p) => ({ vis: p > 0 }) },
    slide: { n: 'スライド', c: 'スライド', d: 0.55, st: 0.2, f: (p, g, c) => ({ x: -(1 - E.outExpo(p)) * c.W * 0.35 * c.amp, a: A(p, 3) }) },
    glitch: { n: 'グリッチ', c: 'デジタル', d: 0.5, st: 0.5, o: 'random', f: (p, g) => {
      if (p >= 1) return {};
      const k = Math.floor(p * 14);
      return { x: (hash(g.i, k) - 0.5) * g.size * 0.9 * (1 - p), a: p < 0.12 ? 0 : hash(g.i, k, 3) > 0.25 ? 1 : 0.25, accent: hash(g.i, k, 5) > 0.6 };
    } },
    tracking: { n: '文字間ズーム', c: 'ズーム', d: 0.8, st: 0, u: 'a', f: (p, g, c) => { const q = E.outExpo(p); return { x: (g.x - c.cx) * (1 - q) * 1.2 * c.amp, a: A(p, 1.6), blur: (1 - q) * g.size * 0.12 }; } },
    kernIn: { n: '字間を詰めて着地', c: 'ズーム', d: 0.7, st: 0, u: 'a', f: (p, g, c) => { const q = E.outExpo(p); return { x: (c.cx - g.x) * (1 - q) * 0.85, sx: lerp(0.5, 1, q), a: A(p, 2) }; } },
    mask: { n: 'マスク出現（行）', c: 'マスク', d: 0.6, st: 0.25, u: 'l', f: (p, g) => ({ y: (1 - E.outQuart(p)) * g.size * 1.3, lineMask: true }) },
    lineReveal: { n: 'ラインマスク（文字順）', c: 'マスク', d: 0.7, st: 0.55, f: (p, g) => ({ y: (1 - E.outQuint(p)) * g.size * 1.25, lineMask: true }) },
    stretch: { n: '伸縮バウンス', c: 'はずむ', d: 0.7, st: 0.3, f: (p) => { const q = E.outElastic(p); return { sy: lerp(2.2, 1, q), sx: lerp(0.4, 1, q), a: A(p, 4) }; } },
    spin: { n: '回転着地', c: '回転', d: 0.7, st: 0.4, f: (p) => { const q = E.outBack(p); return { rot: (1 - q) * PI * 1.2, sx: Math.max(0, q), sy: Math.max(0, q), a: A(p, 3) }; } },
    stagger: { n: '一文字ずつ', c: '文字送り', d: 0.9, st: 0.75, f: (p, g) => ({ y: (1 - E.outBack(p)) * g.size * 0.45, a: A(p, 3) }) },
    whip: { n: '高速スライド', c: 'スライド', d: 0.4, st: 0.1, f: (p, g, c) => ({ x: (1 - E.outExpo(p)) * c.W * 0.6, blur: (1 - p) * g.size * 0.4, skx: (1 - p) * 0.5, a: A(p, 4) }) },
    smear: { n: 'スミア（流し撮り）', c: 'スライド', d: 0.55, st: 0.3, f: (p, g) => { const q = E.outExpo(p); return { x: -(1 - q) * g.size * 5, sx: 1 + (1 - q) * 2.5, blur: (1 - q) * g.size * 0.15, a: A(p, 3) }; } },
    magnet: { n: '左右から吸着', c: 'スライド', d: 0.6, st: 0.2, o: 'edges', f: (p, g, c) => ({ x: (g.x < c.cx ? -1 : 1) * c.W * 0.55 * (1 - E.outExpo(p)), a: A(p, 3) }) },
    flipX: { n: '縦フリップ', c: '3D', d: 0.6, st: 0.5, f: (p) => { const q = E.outBack(p); return { sy: Math.cos((1 - q) * PI / 2), a: A(p, 2), dark: (1 - q) * 0.6 }; } },
    flipY: { n: '横フリップ', c: '3D', d: 0.6, st: 0.5, f: (p) => { const q = E.outBack(p); return { sx: Math.cos((1 - q) * PI / 2), a: A(p, 2), dark: (1 - q) * 0.6 }; } },
    cubeIn: { n: 'キューブ回転（行）', c: '3D', d: 0.65, st: 0.35, u: 'l', f: (p, g) => { const q = E.outCubic(p); return { sy: Math.max(0.001, Math.sin(q * PI / 2)), y: (1 - q) * g.size * 0.55, dark: (1 - q) * 0.7, a: A(p, 2) }; } },
    fold: { n: '折り畳み展開', c: '3D', d: 0.6, st: 0.4, u: 'l', f: (p, g) => { const q = E.outBack(p); return { sy: Math.max(0.001, Math.cos((1 - q) * PI / 2)), py: -g.size * 0.55, dark: (1 - q) * 0.5 }; } },
    charFlip: { n: '一文字ずつ反転', c: '3D', d: 0.8, st: 0.7, f: (p) => { const q = E.outBack(p); return { sx: Math.cos((1 - q) * PI), a: A(p, 4) }; } },
    bounce: { n: 'バウンド', c: 'はずむ', d: 0.8, st: 0.4, f: (p, g, c) => ({ y: -(1 - E.outBounce(p)) * c.H * 0.5 * c.amp }) },
    drop: { n: '落下', c: '重力', d: 0.6, st: 0.5, f: (p, g) => { const q = E.outCubic(p); return { y: -(1 - q) * g.size * 2, rot: (1 - q) * (g.r1 - 0.5) * 0.8, a: A(p, 3) }; } },
    cascade: { n: '順番に落下', c: '重力', d: 0.9, st: 0.6, f: (p, g) => ({ y: -(1 - E.outBounce(p)) * g.size * 3 }) },
    rainIn: { n: '文字の雨', c: '重力', d: 0.9, st: 0.8, o: 'random', f: (p, g, c) => { const q = E.outCubic(p); return { y: -(1 - q) * c.H * 0.9, sy: 1 + (1 - q) * 0.8, a: A(p, 5) }; } },
    swing: { n: '振り子', c: '回転', d: 0.9, st: 0.4, f: (p, g) => ({ rot: 0.9 * Math.exp(-5 * p) * Math.cos(p * 14), py: -g.size * 0.6, a: A(p, 4) }) },
    elastic: { n: 'ゴム伸縮', c: 'はずむ', d: 0.8, st: 0.35, f: (p) => { const s = E.outElastic(p); return { sx: s, sy: s }; } },
    squash: { n: '押しつぶし', c: 'はずむ', d: 0.7, st: 0.35, f: (p, g) => { const q = E.outElastic(p); return { sx: lerp(1.8, 1, q), sy: lerp(0.2, 1, q), py: g.size * 0.5, a: A(p, 4) }; } },
    zoomOut: { n: 'ズームアウト', c: 'ズーム', d: 0.55, st: 0.1, f: (p, g) => { const q = E.outExpo(p); const s = lerp(3, 1, q); return { sx: s, sy: s, a: A(p, 2), blur: (1 - q) * g.size * 0.15 }; } },
    slam: { n: 'スラム（叩きつけ）', c: 'ズーム', d: 0.45, st: 0, u: 'a', impact: 0.5, f: (p, g, c) => { const q = E.outExpo(p); const T = gsc({}, g, c, lerp(4, 1, q)); T.a = A(p, 5); T.blur = (1 - q) * g.size * 0.1; return T; } },
    blurIn: { n: 'ピント出現', c: 'ぼかし', d: 0.7, st: 0.3, f: (p, g) => { const q = E.outCubic(p); return { blur: (1 - q) * g.size * 0.35, a: E.outQuad(p), sx: lerp(1.08, 1, q), sy: lerp(1.08, 1, q) }; } },
    focusPull: { n: 'ピント送り', c: 'ぼかし', d: 0.9, st: 0, u: 'a', f: (p, g, c) => { const q = E.outCubic(p); const T = gsc({}, g, c, lerp(1.25, 1, q)); T.blur = g.size * (0.45 * (1 - q) + 0.05 * Math.sin(q * PI)); T.a = E.outQuad(p); return T; } },
    scatter: { n: '飛散から集合', c: '集合', d: 0.8, st: 0.3, o: 'random', f: (p, g, c) => { const q = E.outExpo(p); return { x: (g.r1 - 0.5) * c.W * (1 - q), y: (g.r2 - 0.5) * c.H * (1 - q), rot: (g.r3 - 0.5) * 4 * (1 - q), a: A(p, 2) }; } },
    shuffle: { n: 'シャッフル', c: '集合', d: 0.7, st: 0.1, f: (p, g, c) => { const q = E.outCubic(p); const o = c.gl[(g.i + 3) % c.gl.length] || g; return { x: (o.x - g.x) * (1 - q), y: (o.y - g.y) * (1 - q), a: A(p, 3) }; } },
    zipper: { n: 'ジッパー集合', c: '集合', d: 0.6, st: 0.3, f: (p, g, c) => ({ y: (g.i % 2 ? -1 : 1) * (1 - E.outExpo(p)) * c.H * 0.6 }) },
    orbitChars: { n: '文字の周回集合', c: '集合', d: 0.9, st: 0.3, f: (p, g) => { const q = E.outCubic(p); const a = (1 - q) * PI * 2 + g.i; const r = (1 - q) * g.size * 4; return { x: Math.cos(a) * r, y: Math.sin(a) * r, a: A(p, 3) }; } },
    spiral: { n: 'らせん登場', c: '回転', d: 0.9, st: 0.4, f: (p, g, c) => { const q = E.outCubic(p); const a = (1 - q) * PI * 3 + g.r1 * 6; const r = (1 - q) * Math.min(c.W, c.H) * 0.5; return { x: Math.cos(a) * r, y: Math.sin(a) * r, rot: (1 - q) * PI * 2, sx: lerp(0.2, 1, q), sy: lerp(0.2, 1, q), a: A(p, 3) }; } },
    tunnel: { n: '奥から迫る', c: 'ズーム', d: 0.7, st: 0.3, f: (p, g, c) => { const q = E.outExpo(p); return { x: (c.cx - g.x) * (1 - q), y: (c.cy - g.y) * (1 - q), sx: lerp(0.05, 1, q), sy: lerp(0.05, 1, q), a: A(p, 1.5) }; } },
    hinge: { n: 'ヒンジ回転', c: '回転', d: 0.7, st: 0.4, f: (p, g) => ({ rot: -(1 - E.outBack(p)) * PI / 2, px: -g.w / 2, py: g.size * 0.45, a: A(p, 3) }) },
    domino: { n: 'ドミノ起立', c: '回転', d: 0.9, st: 0.6, f: (p, g) => ({ rot: -(1 - E.outBounce(p)) * PI / 2, px: -g.w / 2, py: g.size * 0.45, a: A(p, 6) }) },
    roll: { n: '転がり', c: '回転', d: 0.7, st: 0.5, f: (p, g) => { const q = E.outCubic(p); return { x: -(1 - q) * g.size * 3, rot: -(1 - q) * PI * 2, a: A(p, 3) }; } },
    stamp: { n: 'スタンプ', c: 'ズーム', d: 0.5, st: 0.5, o: 'random', f: (p, g) => {
      const q = p < 0.7 ? E.inQuad(p / 0.7) : 1; const s = lerp(2.4, 1, q);
      const sh = p > 0.7 ? (hash(g.i, Math.floor(p * 30)) - 0.5) * g.size * 0.06 * (1 - (p - 0.7) / 0.3) : 0;
      return { sx: s, sy: s, x: sh, a: A(p, 3) };
    } },
    skew: { n: '斜体スライド', c: 'スライド', d: 0.55, st: 0.25, f: (p, g) => { const q = E.outCubic(p); return { skx: -(1 - q) * 0.8, x: -(1 - E.outExpo(p)) * g.size * 2, a: A(p, 3) }; } },
    pendulumChars: { n: '文字の吊り下げ', c: '回転', d: 1, st: 0.5, f: (p, g) => ({ rot: Math.exp(-4 * p) * Math.cos(p * 12) * 0.9, py: -g.size * 1.2, y: -(1 - E.outCubic(Math.min(1, p * 2))) * g.size * 2, a: A(p, 4) }) },
    rubberChars: { n: '文字のゴム着地', c: 'はずむ', d: 0.8, st: 0.5, f: (p, g) => { const q = E.outElastic(p); return { x: (1 - q) * g.size * 2, sx: lerp(2, 1, q), a: A(p, 4) }; } },
    slingshot: { n: 'パチンコ', c: 'はずむ', d: 0.8, st: 0.3, f: (p, g) => { const q = E.outElastic(p); return { x: -g.size * 3 * (1 - q), sx: 1 + Math.abs(1 - q) * 0.8, a: A(p, 4) }; } },
    stopMotion: { n: 'コマ撮り登場', c: '手作り', d: 0.7, st: 0.5, f: (p, g) => { const q = Math.floor(p * 6) / 6; return { sx: q, sy: q, rot: (g.r1 - 0.5) * 0.35 * (1 - q), a: q > 0 ? 1 : 0 }; } },
    strokeDraw: { n: '線画→塗り', c: '手作り', d: 1.1, st: 0.5, f: (p) => ({ stroke: Math.min(1, p / 0.7), fillA: clamp((p - 0.55) / 0.45) }) },
    scramble: { n: 'デコード（文字化け→確定）', c: 'デジタル', d: 0.9, st: 0.6, f: (p, g) => (p >= 0.92 ? { a: 1 } : { ch: g.space ? ' ' : rch(g.i, Math.floor(p * 22)), a: p > 0 ? 1 : 0, accent: true }) },
    slot: { n: 'スロット回転', c: 'デジタル', d: 0.9, st: 0.5, f: (p, g) => {
      if (p <= 0) return { a: 0 };
      if (p < 0.8) { const ph = (p * 9) % 1; return { ch: rch(g.i, Math.floor(p * 9)), y: (ph - 0.5) * g.size * 1.3, lineMask: true, blur: g.size * 0.04 }; }
      return { y: -(1 - E.outBack((p - 0.8) / 0.2)) * g.size * 0.6, lineMask: true };
    } },
    blinkIn: { n: '点滅出現', c: 'デジタル', d: 0.6, st: 0.5, o: 'random', f: (p, g) => ({ a: p >= 1 ? 1 : hash(g.i, Math.floor(p * 10)) > 0.45 + 0.4 * (1 - p) ? 1 : 0 }) },
    glitchSlice: { n: 'スライスずれ', c: 'デジタル', d: 0.55, st: 0.4, o: 'random', f: (p) => ({ slice: 1 - E.outCubic(p), a: A(p, 4) }) },
    splitJoin: { n: '上下分割→合体', c: 'マスク', d: 0.7, st: 0.15, f: (p, g, c) => ({ split: (1 - E.outExpo(p)) * c.W * 0.4 }) },
    crtOn: { n: 'CRT電源オン', c: 'デジタル', d: 0.6, st: 0, u: 'a', f: (p, g, c) => {
      const sx = p < 0.4 ? E.outExpo(p / 0.4) : 1, sy = p < 0.4 ? 0.02 : lerp(0.02, 1, E.outExpo((p - 0.4) / 0.6));
      const T = gsc({}, g, c, Math.max(0.001, sx), sy); T.bright = 1 - p; T.a = A(p, 5); return T;
    } },
    expand: { n: '中央から展開', c: 'マスク', d: 0.6, st: 0, u: 'a', f: (p, g, c) => gsc({}, g, c, lerp(1.25, 1, E.outCubic(p)), 1),
      clip: (ctx, p, B) => { const q = E.outCubic(p); const w = B.w * q; ctx.rect(B.cx - w / 2, B.y, w, B.h); } },
    iris: { n: '円形出現', c: 'マスク', d: 0.7, st: 0, u: 'a', f: () => ({}), clip: (ctx, p, B) => { const r = Math.hypot(B.w, B.h) * 0.55 * E.outCubic(p); ctx.arc(B.cx, B.cy, Math.max(0.1, r), 0, PI * 2); } },
    wipeUp: { n: '下からワイプ', c: 'マスク', d: 0.6, st: 0, u: 'a', f: () => ({}), clip: (ctx, p, B) => { const h = B.h * E.outCubic(p); ctx.rect(B.x, B.y + B.h - h, B.w, h); } },
    wipeDown: { n: '上からワイプ', c: 'マスク', d: 0.6, st: 0, u: 'a', f: () => ({}), clip: (ctx, p, B) => { ctx.rect(B.x, B.y, B.w, B.h * E.outCubic(p)); } },
    wipeRight: { n: '左からワイプ', c: 'マスク', d: 0.6, st: 0, u: 'a', f: () => ({}), clip: (ctx, p, B) => { ctx.rect(B.x, B.y, B.w * E.inOutCubic(p), B.h); } },
    wipeDiagonal: { n: '斜めワイプ', c: 'マスク', d: 0.7, st: 0, u: 'a', f: () => ({}), clip: (ctx, p, B) => {
      const q = E.inOutCubic(p) * 2; const x0 = B.x, y0 = B.y, w = B.w, h = B.h, L = w + h;
      ctx.moveTo(x0 - h, y0 + h); ctx.lineTo(x0 - h + L * q, y0 + h); ctx.lineTo(x0 + L * q, y0); ctx.lineTo(x0 - h, y0); ctx.closePath();
    } },
    shutter: { n: 'シャッター', c: 'マスク', d: 0.7, st: 0, u: 'a', f: () => ({}), clip: (ctx, p, B) => {
      const n = 7, sh = B.h / n;
      for (let i = 0; i < n; i++) { const q = E.outCubic(clamp(p * 1.6 - i * 0.08)); ctx.rect(B.x, B.y + i * sh, B.w, sh * q + 0.5); }
    } },
  };

  /* ---------------- HOLD ---------------- */
  // f(ht, g, c, hp) — ht: seconds since cue start, hp: cue progress 0..1
  const hold = {
    none: { n: '静止', c: '基本', f: () => ({}) },
    drift: { n: 'ゆっくりドリフト', c: '基本', f: (ht, g, c) => ({ x: ht * c.S * 10 * c.amp }) },
    zoomSlow: { n: 'じわズーム', c: '基本', f: (ht, g, c) => gsc({}, g, c, 1 + ht * 0.022 * c.amp) },
    breathe: { n: '呼吸', c: '基本', f: (ht, g, c) => gsc({}, g, c, 1 + 0.03 * Math.sin(ht * 2) * c.amp) },
    float: { n: '浮遊', c: 'ゆらぎ', f: (ht, g) => ({ y: Math.sin(ht * 1.3 + g.r1 * 6) * g.size * 0.06, rot: Math.sin(ht * 0.9 + g.r2 * 6) * 0.03 }) },
    wave: { n: '文字ウェーブ', c: 'ゆらぎ', f: (ht, g, c) => ({ y: Math.sin(ht * 4 - g.i * 0.6) * g.size * 0.08 * c.amp }) },
    pendulum: { n: 'ゆるい振り子', c: 'ゆらぎ', f: (ht, g, c) => grot({}, g, c, Math.sin(ht * 1.8) * 0.045 * c.amp) },
    rotateSlow: { n: 'ゆっくり回転', c: 'ゆらぎ', f: (ht, g, c) => grot({}, g, c, ht * 0.035 * c.amp) },
    jelly: { n: 'ゼリー', c: 'ゆらぎ', f: (ht, g, c) => ({ sx: 1 + 0.05 * c.amp * Math.sin(ht * 6 + g.i), sy: 1 - 0.05 * c.amp * Math.sin(ht * 6 + g.i) }) },
    wobble3d: { n: '3Dゆらぎ', c: 'ゆらぎ', f: (ht, g) => ({ sx: 0.86 + 0.14 * Math.cos(ht * 2 + g.i * 0.35) }) },
    trackBreathe: { n: '字間の呼吸', c: 'ゆらぎ', f: (ht, g, c) => ({ x: (g.x - c.cx) * 0.04 * Math.sin(ht * 1.5) * c.amp }) },
    jitter: { n: '文字の震え', c: 'エネルギー', f: (ht, g, c) => { const k = Math.floor(ht * 12); return { x: (hash(g.i, k) - 0.5) * g.size * 0.05 * c.amp, y: (hash(g.i, k, 2) - 0.5) * g.size * 0.05 * c.amp }; } },
    pulse: { n: '鼓動（ビート）', c: 'エネルギー', f: (ht, g, c) => gsc({}, g, c, 1 + 0.06 * c.amp * c.beat) },
    beatPump: { n: 'ビートでバウンド', c: 'エネルギー', f: (ht, g, c) => { const b = c.beat; return { y: -b * g.size * 0.12 * c.amp * (g.tok % 2 ? 1 : 0.4), sx: 1 + b * 0.08 * c.amp, sy: 1 + b * 0.08 * c.amp }; } },
    glitchHold: { n: '時々グリッチ', c: 'エネルギー', f: (ht, g, c) => { const k = Math.floor(ht * 9); if (hash(k, c.seed) < 0.82) return {}; return { x: (hash(g.i, k) - 0.5) * g.size * 0.4, slice: 0.6, accent: hash(g.i, k, 2) > 0.5 }; } },
    flicker: { n: 'ネオン明滅', c: 'エネルギー', f: (ht, g) => { const k = Math.floor(ht * 16); const h = hash(g.i, k); return { a: h > 0.94 ? 0.25 : h > 0.9 ? 0.6 : 1 }; } },
    karaoke: { n: 'カラオケ塗り', c: '歌詞', f: (ht, g, c, hp) => {
      if (c.ct) { const a = c.ct.cs[g.k], b = c.ct.ce[g.k]; return { fill: clamp((c.tAbs - a) / Math.max(0.03, b - a)) }; }
      return { fill: clamp(clamp((hp - 0.04) / 0.9) * c.N - g.k) };
    } },
    wordHighlight: { n: '単語を順に強調', c: '歌詞', f: (ht, g, c, hp) => {
      if (c.ct) { const w = c.ct.wOf[g.k]; const on = c.tAbs >= c.ct.ws[g.k] && (w === c.ct.nw - 1 || c.tAbs < c.ct.wsByW[w + 1]); return on ? { accent: true, sx: 1.06, sy: 1.06 } : {}; }
      const cur = Math.floor(clamp(hp * 1.05) * c.W_); return g.wordIdx === Math.min(cur, c.W_ - 1) ? { accent: true, sx: 1.06, sy: 1.06 } : {};
    } },
    shimmer: { n: '光沢が走る', c: '歌詞', f: (ht, g, c) => { const ph = ((ht / 2.2) % 1) * 1.6 - 0.3; return { bright: Math.max(0, 1 - Math.abs(ph - g.xn) * 7) * 0.8 }; } },
  };

  /* ---------------- EXIT ---------------- */
  const exit = {
    cut: { n: 'カット（即消え）', c: '基本', d: 0, st: 0, u: 'a', f: () => ({}) },
    fadeOut: { n: 'フェードアウト', c: '基本', d: 0.35, st: 0.2, f: (p) => ({ a: 1 - p }) },
    riseOut: { n: '上へ抜ける', c: '基本', d: 0.4, st: 0.3, f: (p, g) => ({ y: -E.inCubic(p) * g.size * 0.8, a: 1 - p }) },
    lineMaskOut: { n: 'マスクへ沈む', c: 'マスク', d: 0.45, st: 0.3, f: (p, g) => ({ y: -E.inQuint(p) * g.size * 1.3, lineMask: true }) },
    wipeOut: { n: 'ワイプで消える', c: 'マスク', d: 0.45, st: 0, u: 'a', f: () => ({}), clip: (ctx, p, B) => { const q = E.inOutCubic(p); ctx.rect(B.x + B.w * q, B.y, B.w * (1 - q), B.h); } },
    irisOut: { n: '円形に閉じる', c: 'マスク', d: 0.5, st: 0, u: 'a', f: () => ({}), clip: (ctx, p, B) => { const r = Math.hypot(B.w, B.h) * 0.55 * (1 - E.inCubic(p)); ctx.arc(B.cx, B.cy, Math.max(0.1, r), 0, PI * 2); } },
    splitOut: { n: '上下に裂ける', c: 'マスク', d: 0.5, st: 0.15, f: (p, g, c) => ({ split: -E.inExpo(p) * c.W * 0.4 }) },
    dropOut: { n: '下へ落ちる', c: '重力', d: 0.55, st: 0.4, o: 'random', f: (p, g, c) => ({ y: E.inQuad(p) * c.H * 0.6, rot: (g.r1 - 0.5) * p, a: 1 - E.inQuart(p) }) },
    collapseOut: { n: '崩落', c: '重力', d: 0.7, st: 0.5, o: 'random', f: (p, g, c) => ({ y: E.inQuad(p) * c.H * 0.8 * (0.5 + g.r1), rot: (g.r2 - 0.5) * 2 * p, a: 1 - E.inQuart(p) }) },
    slideOut: { n: 'スライドアウト', c: 'スライド', d: 0.4, st: 0.15, f: (p, g, c) => ({ x: E.inExpo(p) * c.W * 0.6, blur: p * g.size * 0.3, a: 1 - E.inQuart(p) }) },
    blurOut: { n: 'ぼけて消える', c: 'ぼかし', d: 0.45, st: 0.3, f: (p, g) => ({ blur: p * g.size * 0.4, a: 1 - E.inQuad(p), sx: 1 + p * 0.15, sy: 1 + p * 0.15 }) },
    trackingOut: { n: '字間拡散', c: 'ズーム', d: 0.5, st: 0, u: 'a', f: (p, g, c) => ({ x: (g.x - c.cx) * E.inExpo(p) * 1.5, a: 1 - p, blur: p * g.size * 0.2 }) },
    zoomThrough: { n: '手前へ抜ける', c: 'ズーム', d: 0.45, st: 0, u: 'a', f: (p, g, c) => { const T = gsc({}, g, c, 1 + E.inExpo(p) * 5); T.a = 1 - E.inQuad(p); T.blur = p * g.size * 0.2; return T; } },
    shrinkOut: { n: '吸い込み', c: 'ズーム', d: 0.5, st: 0.2, f: (p, g, c) => { const q = E.inCubic(p); const s = Math.max(0, 1 - E.inBack(p)); return { sx: s, sy: s, x: (c.cx - g.x) * q, y: (c.cy - g.y) * q }; } },
    flipOut: { n: 'フリップで消える', c: '3D', d: 0.45, st: 0.4, f: (p) => ({ sy: Math.max(0.001, Math.cos(E.inCubic(p) * PI / 2)), dark: p * 0.6, a: p > 0.98 ? 0 : 1 }) },
    scrambleOut: { n: '文字化けして消える', c: 'デジタル', d: 0.5, st: 0.5, f: (p, g) => ({ ch: p > 0.1 && !g.space ? rch(g.i, Math.floor(p * 20) + 99) : undefined, a: 1 - E.inQuad(p), accent: p > 0.1 }) },
    glitchOut: { n: 'グリッチで消える', c: 'デジタル', d: 0.45, st: 0.5, o: 'random', f: (p, g) => { const k = Math.floor(p * 14); return { x: (hash(g.i, k) - 0.5) * g.size * p, a: hash(g.i, k, 4) > p ? 1 : 0, slice: p }; } },
    tvOff: { n: 'TVオフ', c: 'デジタル', d: 0.45, st: 0, u: 'a', f: (p, g, c) => { const sy = p < 0.55 ? Math.max(0.015, 1 - E.inExpo(p / 0.55)) : 0.015; const sx = p < 0.55 ? 1 : Math.max(0.001, 1 - E.inCubic((p - 0.55) / 0.45)); const T = gsc({}, g, c, sx, sy); T.bright = p; return T; } },
    backspaceOut: { n: 'バックスペース', c: '文字送り', d: 0.035, per: true, st: 0.98, o: 'rev', f: (p) => ({ vis: p <= 0 }) },
    dissolve: { n: 'ランダムに消える', c: '文字送り', d: 0.5, st: 0, u: 'a', f: (p, g) => ({ a: g.r1 * 0.9 + 0.05 > p ? 1 : 0 }) },
    explodeOut: { n: '爆散', c: '飛散', d: 0.6, st: 0.1, f: (p, g, c) => { const q = E.outCubic(p); return { x: ((g.x - c.cx) * 1.5 + (g.r1 - 0.5) * c.W * 0.6) * q, y: ((g.y - c.cy) * 1.5 + (g.r2 - 0.5) * c.H * 0.6) * q, rot: (g.r3 - 0.5) * 6 * p, a: 1 - E.inQuad(p) }; } },
    spiralOut: { n: '渦に消える', c: '飛散', d: 0.7, st: 0.3, f: (p, g, c) => { const q = E.inCubic(p); const a = q * PI * 3 + g.r1 * 6; const r = q * Math.min(c.W, c.H) * 0.5; return { x: Math.cos(a) * r, y: Math.sin(a) * r, sx: 1 - p, sy: 1 - p, rot: q * 4 }; } },
  };

  /* legacy single-motion IDs → tracks */
  const legacy = (id) => {
    if (enter[id]) return { enter: id };
    if (hold[id]) return { enter: 'fade', hold: id };
    if (exit[id]) return { enter: 'fade', exit: id };
    return { enter: 'fade' };
  };

  // stagger rank
  function ranks(glyphs, unit, order, seedKey) {
    const keyOf = (g) => (unit === 'w' ? g.wordIdx : unit === 'l' ? g.line : unit === 'a' ? 0 : g.k);
    const keys = [...new Set(glyphs.map(keyOf))].sort((a, b) => a - b);
    const M = keys.length;
    const pos = new Map();
    let order2 = keys.slice();
    if (order === 'rev') order2.reverse();
    else if (order === 'random') order2.sort((a, b) => hash(a, seedKey) - hash(b, seedKey));
    else if (order === 'center' || order === 'edges') {
      const mid = (M - 1) / 2;
      order2.sort((a, b) => {
        const da = Math.abs(keys.indexOf(a) - mid), db = Math.abs(keys.indexOf(b) - mid);
        return order === 'center' ? da - db : db - da;
      });
    }
    // per-glyph timing: a Latin letter / punctuation mark is "lighter" than a kana or kanji,
    // so an English word does not take five times as long to appear as a Japanese one
    if (unit !== 'w' && unit !== 'l' && unit !== 'a' && (order == null || order === 'fwd' || order === 'seq' || order === 'rev') && glyphs.some((g) => g.cls === 'L' || g.cls === 'P')) {
      const wt = new Map(); glyphs.forEach((g) => { const k = keyOf(g); if (!wt.has(k)) wt.set(k, g.cls === 'L' ? 0.45 : g.cls === 'P' ? 0.3 : g.cls === 'S' ? 0.25 : 1); });
      const seq = order === 'rev' ? keys.slice().reverse() : keys; let acc = 0; const at = new Map();
      seq.forEach((k) => { const w = wt.get(k); at.set(k, acc + w / 2); acc += w; });
      const a0 = at.get(seq[0]), a1 = at.get(seq[seq.length - 1]);
      seq.forEach((k) => pos.set(k, a1 > a0 ? (at.get(k) - a0) / (a1 - a0) : 0));
      return glyphs.map((g) => pos.get(keyOf(g)));
    }
    order2.forEach((k, i) => pos.set(k, M > 1 ? i / (M - 1) : 0));
    return glyphs.map((g) => pos.get(keyOf(g)));
  }

  return { enter, hold, exit, legacy, ranks, gsc, grot };
})();
