/* Typography-in-motion pack (ideas from iart-ai/kinetic-typography-skills, MIT — no code copied):
 * variable-weight transitions (faux weight: ink stroke / erase), text on a path (arc, curve, wavy baseline),
 * split-text mask reveals by character / word / from above, per-character focus pull, damped spring. */
'use strict';
(() => {
  const { clamp, lerp } = LM.U;
  const E = LM.E, M = LM.motion;
  const PI = Math.PI;
  const A = (p, k = 3) => Math.min(1, p * k);
  const half = (c) => Math.max(1, (c.bb ? c.bb.w : c.W * 0.5) / 2);
  // lay the line on a circular arc (k = bend amount, 0 = straight; >0 rainbow, <0 smile)
  const arc = (g, c, k) => {
    if (Math.abs(k) < 1e-3) return { x: 0, y: 0, rot: 0 };
    const hw = half(c), R = hw / (k * PI * 0.5), dx = g.x - c.cx, th = dx / R;
    return { x: R * Math.sin(th) - dx, y: R * (1 - Math.cos(th)), rot: th };
  };
  // travel along a curved path toward the rest position: s = remaining distance (0..1), dir = ±1
  const path = (g, c, s, dir) => {
    const L = c.W * 0.6, h = c.H * 0.3, dx = dir * s * L, dy = -Math.sin(s * PI) * h;
    const slope = (-Math.cos(s * PI) * PI * h) / L; // d(dy)/d(dx)
    return { x: dx, y: dy, rot: Math.atan(slope * dir) * 0.8 };
  };
  // damped spring 1 → 0 (exactly 0 at p = 1)
  const spring = (p) => Math.exp(-5 * p) * Math.cos(p * PI * 4.5) * (1 - p * p * p * p);

  Object.assign(M.enter, {
    weightIn: { n: 'ウェイト：細字から太って着地', c: 'ウェイト', d: 0.85, st: 0.35, u: 'g', f: (p, g, c) => { const q = E.outExpo(p); return { wt: -0.95 * (1 - q) + 0.55 * Math.sin(Math.min(1, p * 1.15) * PI) * (1 - p), x: (g.x - c.cx) * (1 - q) * 0.14, a: A(p, 3) }; } },
    weightPunch: { n: 'ウェイト：極太で叩き込む', c: 'ウェイト', d: 0.6, st: 0.3, u: 'w', f: (p) => { const q = E.outCubic(p); return { wt: (1 - q) * 1.25, sx: lerp(1.28, 1, E.outBack(p)), sy: lerp(1.28, 1, E.outBack(p)), a: A(p, 6) }; } },
    charMask: { n: '一文字ずつマスクから出現', c: 'マスク', d: 0.55, st: 0.55, u: 'g', f: (p, g) => ({ y: (1 - E.outExpo(p)) * g.size * 1.25, lineMask: true }) },
    wordMask: { n: '単語ごとにマスクから出現', c: 'マスク', d: 0.65, st: 0.55, u: 'w', f: (p, g) => { const q = E.outExpo(p); return { y: (1 - q) * g.size * 1.3, rot: (1 - q) * 0.14, lineMask: true }; } },
    maskDown: { n: 'マスク出現（上から）', c: 'マスク', d: 0.6, st: 0.25, u: 'l', f: (p, g) => ({ y: -(1 - E.outQuart(p)) * g.size * 1.3, lineMask: true }) },
    blurChars: { n: '一文字ずつピントが合う', c: 'ぼかし', d: 0.65, st: 0.6, u: 'g', f: (p, g) => { const q = E.outExpo(p); return { blur: (1 - q) * g.size * 0.3, y: (1 - q) * g.size * 0.3, a: E.outQuad(p) }; } },
    pathIn: { n: 'カーブに沿って流れ込む', c: 'パス', d: 0.95, st: 0.45, u: 'g', f: (p, g, c) => { const T = path(g, c, 1 - E.outCubic(p), 1); T.a = A(p, 4); return T; } },
    arcIn: { n: '円弧から伸びて着地', c: 'パス', d: 0.9, st: 0, u: 'a', f: (p, g, c) => { const q = E.outCubic(p); const T = arc(g, c, (1 - q) * 1.1); T.y -= (1 - q) * g.size * 0.6; T.sx = T.sy = lerp(0.82, 1, q); T.a = A(p, 3); return T; } },
    springIn: { n: 'スプリング：弾んで定位置へ', c: 'はずむ', d: 0.95, st: 0.35, u: 'g', f: (p, g) => { const v = spring(p); return { y: v * g.size * 0.9, sy: 1 + v * 0.28, sx: 1 - v * 0.14, a: A(p, 6) }; } },
  });

  Object.assign(M.hold, {
    weightWave: { n: 'ウェイト：太さが波打つ', c: 'ウェイト', f: (ht, g, c) => ({ wt: Math.sin(ht * 3 * (c.tempo || 1) - g.i * 0.55) * 0.55 * c.amp }) },
    weightBeat: { n: 'ウェイト：ビートで太る', c: 'ウェイト', f: (ht, g, c) => ({ wt: c.beat * 0.95 * c.amp }) },
    weightSing: { n: '歌った文字が太くなる', c: '歌詞', f: (ht, g, c, hp) => {
      let q;
      if (c.ct) { const a = c.ct.cs[g.k], b = c.ct.ce[g.k]; q = clamp((c.tAbs - a) / Math.max(0.03, b - a)); }
      else q = clamp(clamp((hp - 0.04) / 0.9) * c.N - g.k);
      return { wt: -0.45 + q * 1.0 };
    } },
    arcHold: { n: '弧を描いてゆれる', c: 'パス', f: (ht, g, c) => arc(g, c, (0.32 + Math.sin(ht * 1.5 * (c.tempo || 1)) * 0.16) * c.amp) },
    pathFlow: { n: '波打つ線に沿って進む', c: 'パス', f: (ht, g, c) => {
      const s = (g.x - c.cx) / Math.max(1, g.size) * 0.55 - ht * 2.2 * (c.tempo || 1), h = g.size * 0.32 * c.amp;
      return { y: Math.sin(s) * h, rot: Math.atan(Math.cos(s) * h * 0.55 / Math.max(1, g.size)) };
    } },
  });

  Object.assign(M.exit, {
    weightOut: { n: 'ウェイト：細くなって消える', c: 'ウェイト', d: 0.6, st: 0.3, u: 'g', f: (p, g, c) => { const q = E.inCubic(p); return { wt: -q * 1.1, x: (g.x - c.cx) * q * 0.12, a: 1 - E.inQuad(p) }; } },
    charMaskOut: { n: '一文字ずつマスクへ沈む', c: 'マスク', d: 0.5, st: 0.55, u: 'g', f: (p, g) => ({ y: E.inQuint(p) * g.size * 1.3, lineMask: true }) },
    wordMaskOut: { n: '単語ごとにマスクへ抜ける', c: 'マスク', d: 0.5, st: 0.5, u: 'w', f: (p, g) => ({ y: -E.inQuint(p) * g.size * 1.3, lineMask: true }) },
    blurCharsOut: { n: '一文字ずつぼけて消える', c: 'ぼかし', d: 0.55, st: 0.6, u: 'g', f: (p, g) => { const q = E.inCubic(p); return { blur: q * g.size * 0.3, y: -q * g.size * 0.3, a: 1 - E.inQuad(p) }; } },
    pathOut: { n: 'カーブに沿って流れ去る', c: 'パス', d: 0.85, st: 0.45, u: 'g', f: (p, g, c) => { const T = path(g, c, E.inCubic(p), -1); T.a = 1 - E.inQuart(p); return T; } },
    arcOut: { n: '円弧に丸まって消える', c: 'パス', d: 0.75, st: 0, u: 'a', f: (p, g, c) => { const q = E.inCubic(p); const T = arc(g, c, q * 1.1); T.y -= q * g.size * 0.5; T.sx = T.sy = lerp(1, 0.82, q); T.a = 1 - E.inQuad(p); return T; } },
  });

  // sprinkle into genre themes (runs after data / tone packs are loaded)
  const D = LM.data;
  const add = (id, k, o) => { const t = D && D.themeById[id]; if (t) t[k] = Object.assign({}, t[k] || {}, o); };
  add('ballad', 'enter', { blurChars: 1.5, wordMask: 1 }); add('ballad', 'hold', { weightSing: 1 }); add('ballad', 'exit', { blurCharsOut: 1 });
  add('cinematic', 'enter', { charMask: 2, maskDown: 1.5, wordMask: 1.5, weightIn: 1 }); add('cinematic', 'exit', { charMaskOut: 1.5, weightOut: 1 });
  add('minimal', 'enter', { weightIn: 2, charMask: 1.5 }); add('minimal', 'hold', { weightWave: 1 }); add('minimal', 'exit', { weightOut: 1.5 });
  add('jpop', 'enter', { springIn: 2, pathIn: 1 }); add('jpop', 'hold', { pathFlow: 1 });
  add('anison', 'enter', { springIn: 1.5, weightPunch: 1.5, pathIn: 1 });
  add('hiphop', 'enter', { weightPunch: 2 }); add('hiphop', 'hold', { weightBeat: 2 });
  add('edm', 'enter', { weightPunch: 1.5 }); add('edm', 'hold', { weightBeat: 1.5 });
  add('rock', 'hold', { weightBeat: 1 });
  add('dream', 'enter', { arcIn: 1.5, blurChars: 1.5 }); add('dream', 'hold', { arcHold: 1, pathFlow: 1 }); add('dream', 'exit', { arcOut: 1, pathOut: 1 });
  add('lofi', 'enter', { weightIn: 1, arcIn: 1 }); add('lofi', 'hold', { weightWave: 1 });
  add('citypop', 'enter', { wordMask: 1.5, pathIn: 1.5 }); add('citypop', 'exit', { pathOut: 1 });
  add('acoustic', 'enter', { blurChars: 1 }); add('acoustic', 'hold', { weightSing: 1 });
  add('showreel', 'enter', { charMask: 2, wordMask: 1.5, weightIn: 1.5 }); add('showreel', 'exit', { charMaskOut: 1.5, wordMaskOut: 1 });
  add('wa', 'enter', { maskDown: 1.5 });
  add('ambient', 'enter', { blurChars: 1 }); add('ambient', 'hold', { arcHold: 0.8 });
})();
