/* Extended motion library: active / flowing / kinetic motions */
'use strict';
(() => {
  const { clamp, lerp, hash } = LM.U;
  const E = LM.E, M = LM.motion, gsc = M.gsc, grot = M.grot;
  const PI = Math.PI;
  const A = (p, k = 3) => Math.min(1, p * k);
  const arc = (q, h) => -4 * h * q * (1 - q); // parabola 0→peak→0

  Object.assign(M.enter, {
    flowIn: { n: 'ウェーブで流れ込む', c: 'フロー', d: 0.9, st: 0.55, f: (p, g, c) => { const q = E.outCubic(p); const r = 1 - q; return { x: r * c.W * 0.45, y: Math.sin(r * PI * 2.5 + g.i * 0.5) * g.size * 0.9 * r, rot: Math.sin(r * PI * 2) * 0.35 * r, a: A(p, 2.5) }; } },
    conveyor: { n: 'コンベア（連なって流入）', c: 'フロー', d: 1.0, st: 0.7, f: (p, g, c) => { const q = E.outQuart(p); return { x: (1 - q) * c.W * 0.7, sx: 1 + (1 - q) * 0.4, a: A(p, 4) }; } },
    ribbonIn: { n: 'リボン軌道で登場', c: 'フロー', d: 1.0, st: 0.5, f: (p, g, c) => { const q = E.inOutCubic(p); const r = 1 - q; const a = r * PI * 1.4; return { x: -Math.cos(a) * r * c.W * 0.35, y: Math.sin(a) * r * c.H * 0.35, rot: r * 1.2, a: A(p, 3) }; } },
    windIn: { n: '風に乗って舞い込む', c: 'フロー', d: 1.1, st: 0.5, o: 'random', f: (p, g, c) => { const q = E.outCubic(p); const r = 1 - q; return { x: -r * c.W * (0.4 + g.r1 * 0.4), y: Math.sin(r * 9 + g.r2 * 6) * g.size * 0.8 * r - r * g.size * (g.r3 - 0.5) * 3, rot: r * (g.r1 - 0.5) * 6, a: A(p, 2) }; } },
    waveIn: { n: '波が立ち上がる', c: 'フロー', d: 0.9, st: 0.6, f: (p, g) => { const q = E.outBack(p); return { y: (1 - q) * g.size * 1.2, sy: Math.max(0.05, q), a: A(p, 3) }; } },
    boomerang: { n: 'ブーメラン', c: 'フロー', d: 0.9, st: 0.35, f: (p, g, c) => { const x = Math.sin(p * PI) * (1 - p) * c.W * 0.35 + (1 - p) * (1 - p) * -c.W * 0.1; return { x, rot: (1 - p) * 0.6, a: A(p, 4) }; } },
    jumpIn: { n: 'ジャンプで着地', c: 'はずむ', d: 0.8, st: 0.55, f: (p, g) => { const q = clamp(p / 0.85); const land = p > 0.85 ? (p - 0.85) / 0.15 : 0; const sq = land ? Math.sin(land * PI) * 0.25 : 0; return { x: (1 - q) * -g.size * 2.2, y: arc(q, g.size * 1.6) + (1 - q) * g.size * 0.4, sy: 1 - sq, sx: 1 + sq, py: g.size * 0.5, a: A(p, 5) }; } },
    trampoline: { n: 'トランポリン', c: 'はずむ', d: 1.0, st: 0.45, f: (p, g, c) => { const b = Math.abs(Math.sin(p * PI * 2.5)) * (1 - p); return { y: -b * c.H * 0.25, sy: 1 + (p < 1 ? Math.cos(p * PI * 5) * 0.12 * (1 - p) : 0), a: A(p, 5) }; } },
    elasticDrop: { n: '落下して潰れる', c: 'はずむ', d: 0.8, st: 0.5, f: (p, g, c) => { if (p < 0.55) { const q = E.inQuad(p / 0.55); return { y: -(1 - q) * c.H * 0.5, sy: 1 + q * 0.3, sx: 1 - q * 0.15 }; } const k = (p - 0.55) / 0.45; const w = Math.exp(-5 * k) * Math.cos(k * 14); return { sy: 1 - 0.35 * w, sx: 1 + 0.3 * w, py: g.size * 0.5 }; } },
    stackDrop: { n: '積み上げ落下（行）', c: '重力', d: 0.8, st: 0.6, u: 'l', o: 'rev', f: (p, g, c) => ({ y: -(1 - E.outBounce(p)) * c.H * 0.7 }) },
    whirl: { n: '旋回して登場', c: '回転', d: 0.8, st: 0.45, f: (p) => { const q = E.outCubic(p); return { rot: (1 - q) * PI * 4, sx: q, sy: q, a: A(p, 3) }; } },
    vortexIn: { n: '渦から出現', c: '回転', d: 1.0, st: 0.3, f: (p, g, c) => { const q = E.outQuart(p); const r = 1 - q; const a = r * PI * 5 + g.i; const rad = r * Math.hypot(c.W, c.H) * 0.4; return { x: c.cx - g.x + Math.cos(a) * rad + (g.x - c.cx) * q, y: c.cy - g.y + Math.sin(a) * rad + (g.y - c.cy) * q, rot: r * 5, sx: lerp(0.2, 1, q), sy: lerp(0.2, 1, q), a: A(p, 3) }; } },
    zoomRush: { n: '手前から突っ込む', c: 'ズーム', d: 0.6, st: 0.55, f: (p, g) => { const q = E.outExpo(p); const s = lerp(6, 1, q); return { sx: s, sy: s, a: A(p, 3), blur: (1 - q) * g.size * 0.2 }; } },
    sparkPop: { n: 'スパークポップ', c: 'はずむ', d: 0.6, st: 0.6, o: 'random', f: (p, g) => { const s = Math.max(0, E.outBack(p) * (1 + Math.sin(p * PI) * 0.25)); return { sx: s, sy: s, rot: (1 - p) * (g.r1 - 0.5) * 2, accent: p < 0.6, bright: p < 0.35 ? 0.8 : 0 }; } },
    swipeUp: { n: '縦スワイプ', c: 'スライド', d: 0.5, st: 0.25, f: (p, g, c) => { const q = E.outExpo(p); return { y: (1 - q) * c.H * 0.6, sy: 1 + (1 - q) * 1.5, blur: (1 - q) * g.size * 0.12, a: A(p, 3) }; } },
    rubberBand: { n: 'ゴムバンド（行）', c: 'はずむ', d: 0.9, st: 0.3, u: 'l', f: (p, g, c) => { const q = E.outElastic(p); return gsc({ x: (1 - q) * -c.W * 0.4 }, g, c, lerp(1.6, 1, clamp(q)), lerp(0.6, 1, clamp(q))); } },
    glitchZoom: { n: 'グリッチズーム', c: 'デジタル', d: 0.55, st: 0.2, f: (p, g) => { const k = Math.floor(p * 16); const q = E.outExpo(p); const s = lerp(2.2, 1, q); return { sx: s, sy: s * (1 + (hash(g.i, k) - 0.5) * 0.3 * (1 - p)), x: (hash(g.i, k, 1) - 0.5) * g.size * (1 - p), slice: (1 - p) * 0.8, a: A(p, 4) }; } },
    flickerType: { n: 'フリッカータイプ', c: '文字送り', d: 0.07, per: true, st: 0.95, f: (p, g) => (p <= 0 ? { a: 0 } : { a: p < 0.6 ? (hash(g.i, Math.floor(p * 12)) > 0.4 ? 1 : 0.2) : 1, sx: 1 + (1 - p) * 0.4, sy: 1 + (1 - p) * 0.4 }) },
    pendulumLine: { n: '行が振り子で着地', c: '回転', d: 1.1, st: 0.3, u: 'l', f: (p, g, c) => grot({ a: A(p, 4) }, g, c, Math.exp(-4 * p) * Math.cos(p * 11) * 0.5) },
    unfoldX: { n: 'めくれて展開', c: '3D', d: 0.7, st: 0.55, f: (p, g) => { const q = E.outBack(p); return { sx: Math.max(0.001, Math.sin(clamp(q) * PI / 2)), px: -g.w / 2, dark: (1 - q) * 0.5, a: A(p, 4) }; } },
    popcorn: { n: 'ポップコーン', c: 'はずむ', d: 0.8, st: 0.8, o: 'random', f: (p, g) => { const q = clamp(p / 0.7); return { y: arc(q, g.size * 0.9) , sx: E.outBack(Math.min(1, p * 2)), sy: E.outBack(Math.min(1, p * 2)), rot: (1 - q) * (g.r1 - 0.5) * 3 }; } },
  });

  Object.assign(M.hold, {
    bounceLoop: { n: '跳ね続ける', c: 'エネルギー', f: (ht, g, c) => { const ph = (ht * 2.2 * c.tempo - g.i * 0.12) % 1; const b = Math.abs(Math.sin(ph * PI)); return { y: -b * g.size * 0.14 * c.amp, sy: 1 - (1 - b) * 0.06, py: g.size * 0.5 }; } },
    rollingWave: { n: '大きなうねり', c: 'ゆらぎ', f: (ht, g, c) => ({ y: Math.sin(ht * 2.2 * c.tempo - g.xn * 6) * g.size * 0.16 * c.amp, rot: Math.cos(ht * 2.2 * c.tempo - g.xn * 6) * 0.12 * c.amp }) },
    orbitHold: { n: '小さく周回', c: 'ゆらぎ', f: (ht, g, c) => { const a = ht * 2.5 * c.tempo + g.i * 0.8; return { x: Math.cos(a) * g.size * 0.05 * c.amp, y: Math.sin(a) * g.size * 0.05 * c.amp }; } },
    scrollFlow: { n: '流れ続ける（横スクロール）', c: 'フロー', f: (ht, g, c) => ({ x: -(ht / Math.max(0.5, c.dur || 3) - 0.35) * c.W * 0.08 * c.amp }) },
    riseFlow: { n: '昇り続ける', c: 'フロー', f: (ht, g, c) => ({ y: -(ht / Math.max(0.5, c.dur || 3) - 0.35) * c.H * 0.06 * c.amp }) },
    swayFlow: { n: '揺れながら流れる', c: 'フロー', f: (ht, g, c) => ({ x: -(ht / Math.max(0.5, c.dur || 3) - 0.35) * c.W * 0.05 * c.amp + Math.sin(ht * 1.6 + g.i * 0.4) * g.size * 0.05, y: Math.sin(ht * 2 + g.i * 0.6) * g.size * 0.08 }) },
    quake: { n: '激震', c: 'エネルギー', f: (ht, g, c) => { const k = Math.floor(ht * 24); const a = (0.5 + c.beat) * c.amp; return { x: (hash(g.i, k) - 0.5) * g.size * 0.12 * a, y: (hash(g.i, k, 3) - 0.5) * g.size * 0.12 * a, rot: (hash(g.i, k, 5) - 0.5) * 0.12 * a }; } },
    spinLetters: { n: '文字が回転し続ける', c: 'エネルギー', f: (ht, g, c) => ({ sx: Math.cos(ht * 2.4 * c.tempo + g.i * 0.5), dark: (1 - Math.abs(Math.cos(ht * 2.4 * c.tempo + g.i * 0.5))) * 0.4 }) },
    heartbeat: { n: 'ハートビート', c: 'エネルギー', f: (ht, g, c) => { const ph = (ht * c.tempo) % 1; const k = Math.exp(-ph * 14) + 0.6 * Math.exp(-Math.max(0, ph - 0.22) * 14) * (ph > 0.22 ? 1 : 0); return gsc({}, g, c, 1 + 0.07 * k * c.amp); } },
    stretchBeat: { n: 'ビートで縦伸び', c: 'エネルギー', f: (ht, g, c) => ({ sy: 1 + c.beat * 0.25 * c.amp, sx: 1 - c.beat * 0.08 * c.amp, py: g.size * 0.5 }) },
    colorWave: { n: '色が流れる', c: '歌詞', f: (ht, g, c) => { const ph = ((ht * 0.8 * c.tempo) % 1.4) - 0.2; return Math.abs(g.xn - ph) < 0.12 ? { accent: true } : {}; } },
    marchStep: { n: '行進（交互に跳ねる）', c: 'エネルギー', f: (ht, g, c) => { const s = Math.floor(ht * 4 * c.tempo) % 2; return { y: (g.i % 2 === s ? -1 : 0) * g.size * 0.08 * c.amp, rot: (g.i % 2 === s ? -0.06 : 0.04) * c.amp }; } },
  });

  Object.assign(M.exit, {
    flowOut: { n: 'ウェーブで流れ去る', c: 'フロー', d: 0.7, st: 0.55, f: (p, g, c) => { const q = E.inCubic(p); return { x: -q * c.W * 0.5, y: Math.sin(q * PI * 2.5 + g.i * 0.5) * g.size * 0.9 * q, a: 1 - E.inQuad(p) }; } },
    conveyorOut: { n: 'コンベアで流出', c: 'フロー', d: 0.7, st: 0.65, f: (p, g, c) => { const q = E.inQuart(p); return { x: -q * c.W * 0.7, sx: 1 + q * 0.4, a: 1 - E.inQuart(p) }; } },
    windOut: { n: '風に飛ばされる', c: 'フロー', d: 0.8, st: 0.5, o: 'random', f: (p, g, c) => { const q = E.inQuad(p); return { x: q * c.W * (0.5 + g.r1 * 0.4), y: -q * g.size * (1 + g.r2 * 3) + Math.sin(q * 8 + g.r3 * 6) * g.size * 0.5 * q, rot: q * (g.r1 - 0.3) * 6, a: 1 - E.inQuad(p) }; } },
    jumpOut: { n: 'ジャンプして退場', c: 'はずむ', d: 0.6, st: 0.5, f: (p, g, c) => ({ x: p * g.size * 2, y: arc(p, g.size * 1.2) + E.inQuad(p) * c.H * 0.4, a: 1 - E.inQuart(p) }) },
    rushOut: { n: '手前へ飛び去る', c: 'ズーム', d: 0.5, st: 0.5, f: (p, g) => { const s = 1 + E.inExpo(p) * 6; return { sx: s, sy: s, a: 1 - E.inQuad(p), blur: p * g.size * 0.2 }; } },
    sinkWave: { n: '波に沈む', c: 'フロー', d: 0.6, st: 0.6, f: (p, g) => ({ y: E.inBack(p) * g.size * 1.3, sy: Math.max(0.02, 1 - E.inCubic(p)), lineMask: true }) },
    whirlOut: { n: '旋回して消える', c: '回転', d: 0.6, st: 0.45, f: (p) => { const q = E.inCubic(p); return { rot: q * PI * 4, sx: 1 - q, sy: 1 - q }; } },
    popOut: { n: 'はじけて消える', c: 'はずむ', d: 0.4, st: 0.6, o: 'random', f: (p) => { const s = p < 0.4 ? 1 + E.outQuad(p / 0.4) * 0.35 : Math.max(0, 1.35 * (1 - E.inBack((p - 0.4) / 0.6))); return { sx: s, sy: s, bright: p > 0.3 ? 0.6 : 0 }; } },
    bubbleUp: { n: '泡のように昇る', c: 'フロー', d: 0.9, st: 0.5, o: 'random', f: (p, g, c) => { const q = E.inQuad(p); return { y: -q * c.H * 0.6, x: Math.sin(p * 10 + g.r1 * 6) * g.size * 0.3 * p, sx: 1 - q * 0.4, sy: 1 - q * 0.4, a: 1 - E.inQuad(p) }; } },
    swipeOut: { n: '縦スワイプで消える', c: 'スライド', d: 0.4, st: 0.2, f: (p, g, c) => { const q = E.inExpo(p); return { y: -q * c.H * 0.6, sy: 1 + q * 1.5, blur: q * g.size * 0.12, a: 1 - E.inQuart(p) }; } },
    shatter: { n: '砕けて落ちる', c: '重力', d: 0.7, st: 0.2, o: 'random', f: (p, g, c) => ({ slice: Math.min(1, p * 3), y: E.inQuad(clamp((p - 0.2) / 0.8)) * c.H * 0.7 * (0.6 + g.r1), rot: (g.r2 - 0.5) * p * 2, a: 1 - E.inQuart(p) }) },
    stretchOut: { n: '縦に伸びて消える', c: 'ズーム', d: 0.45, st: 0.3, f: (p) => { const q = E.inCubic(p); return { sy: 1 + q * 3, sx: Math.max(0.02, 1 - q), a: 1 - E.inQuad(p) }; } },
  });
})();
