/* Edge kinetic type (ref: Motion Array kinetic typography packs):
 * liquid warp, rubber bend, letter stutter repeat, grain erosion, strip slicing, wide-track stomp, ring spin */
'use strict';
(() => {
  const { clamp, lerp, hash } = LM.U;
  const E = LM.E, M = LM.motion;
  const PI = Math.PI, TAU = PI * 2;
  const A = (p, k = 3) => Math.min(1, p * k);
  const half = (c) => Math.max(1, (c.bb ? c.bb.w : c.W * 0.5) / 2);
  // liquid: travelling sine through the word — baseline, shear and stretch all wobble together
  const liquid = (g, c, ph, k) => {
    const s = g.x / Math.max(1, g.size) * 0.9 - ph;
    return { y: Math.sin(s) * g.size * 0.11 * k, skx: Math.cos(s) * 0.22 * k, sy: 1 + Math.sin(s * 1.3 + 1) * 0.1 * k, sx: 1 - Math.sin(s * 1.3 + 1) * 0.05 * k, py: 0 };
  };
  // rubber bend: the whole word bows along a parabola (k<0 smiles, k>0 frowns)
  const bend = (g, c, k) => {
    const hw = half(c), rx = clamp((g.x - c.cx) / hw, -1.4, 1.4);
    return { y: k * (rx * rx - 0.35) * hw * 0.32, rot: Math.atan(k * rx * 0.64) };
  };
  // target glyph for letter-repeat (first emphasised / key glyph, else ~1/4 in)
  const stutIdx = (c) => {
    const gl = c.gl || []; if (c._stut && c._stut.gl === gl) return c._stut.i;
    let i = gl.findIndex((q) => q.emph || q.key); if (i < 0) i = Math.floor(gl.length * 0.25);
    const w = gl[i] ? gl[i].wordIdx : -1, ws = gl.filter((q) => q.wordIdx === w);
    if (ws.length > 1) i = gl.indexOf(ws[Math.min(ws.length - 1, Math.floor(ws.length / 2))]);
    c._stut = { gl, i }; return i;
  };
  // rotate glyph positions around the text centre
  const spinAround = (g, c, a) => {
    const dx = g.x - c.cx, dy = g.y - c.cy, cs = Math.cos(a), sn = Math.sin(a);
    return { x: c.cx + dx * cs - dy * sn - g.x, y: c.cy + dx * sn + dy * cs - g.y, rot: a };
  };

  Object.assign(M.enter, {
    liquidIn: { n: 'リキッド：溶けて形になる', c: 'エッジ', d: 0.9, st: 0.15, u: 'a', f: (p, g, c) => { const q = E.outCubic(p); const T = liquid(g, c, p * 6, (1 - q) * 2.6); T.a = A(p, 4); T.blur = (1 - q) * g.size * 0.08; return T; } },
    rubberBend: { n: 'ラバー：しなって着地', c: 'エッジ', d: 0.85, st: 0, u: 'a', f: (p, g, c) => { const q = E.outElastic(p); const k = (1 - q) * 1.6; const T = bend(g, c, k); T.y += (1 - E.outExpo(p)) * c.H * 0.35; T.sx = lerp(0.3, 1, E.outBack(p)); T.a = A(p, 5); return T; } },
    stutterIn: { n: 'スタッター：連打の残像で飛び込む', c: 'エッジ', d: 0.55, st: 0.4, u: 'g', f: (p, g) => { const q = E.outExpo(p); return { x: -(1 - q) * g.size * 2.2, stut: (1 - q) * 5, stutD: g.w * 0.5, a: A(p, 6) }; } },
    erodeIn: { n: 'かすれ：粒子が集まって刷られる', c: 'エッジ', d: 0.8, st: 0.2, u: 'w', f: (p, g, c) => { const q = E.outCubic(p); return { erode: 1 - q, a: A(p, 6), x: (hash(g.i, 3, Math.floor(p * 12)) - 0.5) * g.size * 0.06 * (1 - q) }; } },
    stripIn: { n: 'ストリップ：横縞が左右から合体', c: 'エッジ', d: 0.6, st: 0.12, u: 'l', f: (p, g, c) => { const q = E.outExpo(p); return { strips: 6, stripOff: (1 - q) * c.W * 0.5, a: A(p, 8) }; } },
    trackStomp: { n: 'ワイド着地：散らばった字間が詰まる', c: 'エッジ', d: 0.7, st: 0, u: 'a', f: (p, g, c) => { const q = E.outExpo(p); return { x: (g.x - c.cx) * (1 - q) * 1.6, sx: lerp(1.6, 1, q), sy: lerp(0.4, 1, q), a: A(p, 4), blur: (1 - q) * g.size * 0.06 }; } },
    bendSwing: { n: 'ベンド：大きく反って戻る', c: 'エッジ', d: 1.0, st: 0, u: 'a', f: (p, g, c) => { const q = E.outElastic(p); const T = bend(g, c, (1 - q) * -2.2); const r = spinAround(g, c, (1 - E.outCubic(p)) * -0.6); T.x = r.x; T.y += r.y; T.rot += r.rot; T.a = A(p, 5); return T; } },
  });
  Object.assign(M.hold, {
    liquidHold: { n: 'リキッド：うねり続ける', c: 'エッジ', f: (ht, g, c) => liquid(g, c, ht * 3.2 * (c.tempo || 1), 0.55 * c.amp) },
    rubberHold: { n: 'ラバー：ビートでしなる', c: 'エッジ', f: (ht, g, c) => bend(g, c, (Math.sin(ht * 2.4 * (c.tempo || 1)) * 0.35 + c.beat * 0.5) * c.amp) },
    // FEEEEEL: one letter repeats and pushes the rest of its line apart (line stays centred)
    stutterHold: { n: 'スタッター：一文字が連打される', c: 'エッジ', f: (ht, g, c) => {
      const ti = stutIdx(c), tg = c.gl[ti]; if (!tg || (tg.line != null && g.line !== tg.line)) return null;
      const n = Math.max(0, 1.5 + c.beat * 2.5 + Math.sin(ht * 4 * (c.tempo || 1)) * 1.2) * c.amp, d = tg.w * 0.72, sh = n * d;
      const T = { x: (g.x >= tg.x - 0.5 ? sh : 0) - sh / 2 };
      if (g === tg || g.i === ti) { T.stut = n; T.stutD = d; T.stutA = 1; }
      return T;
    } },
    erodeHold: { n: 'かすれ：インクが揺らぐ', c: 'エッジ', f: (ht, g, c) => ({ erode: 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(ht * 7 + g.i)) + c.beat * 0.15 }) },
    stripHold: { n: 'ストリップ：ビートで横ずれ', c: 'エッジ', f: (ht, g, c) => ({ strips: 6, stripOff: c.beat * c.beat * g.size * 0.9 * c.amp }) },
    ringSpin: { n: '全体が大きく揺れ回る', c: 'エッジ', f: (ht, g, c) => spinAround(g, c, Math.sin(ht * 0.9 * (c.tempo || 1)) * 0.32 * c.amp + c.beat * 0.04) },
  });
  Object.assign(M.exit, {
    liquidOut: { n: 'リキッド：溶けて流れる', c: 'エッジ', d: 0.7, st: 0.15, u: 'a', f: (p, g, c) => { const q = E.inCubic(p); const T = liquid(g, c, p * 6, q * 2.6); T.y += q * g.size * 1.2; T.sy *= 1 + q * 1.5; T.a = 1 - E.inQuad(p); T.blur = q * g.size * 0.1; return T; } },
    rubberOut: { n: 'ラバー：横に伸びて消える', c: 'エッジ', d: 0.5, st: 0.2, u: 'a', f: (p, g, c) => { const q = E.inExpo(p); return { sx: 1 + q * 5, sy: Math.max(0.03, 1 - q), x: (g.x - c.cx) * q * 2, a: 1 - E.inQuad(p) }; } },
    stutterOut: { n: 'スタッター：残像を残して抜ける', c: 'エッジ', d: 0.45, st: 0.4, u: 'g', f: (p, g) => { const q = E.inExpo(p); return { x: q * g.size * 3, stut: q * 6, stutD: -g.w * 0.5, a: 1 - E.inQuad(p) }; } },
    erodeOut: { n: 'かすれ：擦れて消える', c: 'エッジ', d: 0.8, st: 0.25, u: 'w', f: (p) => ({ erode: E.inCubic(p) * 1.05, a: 1 - E.inQuint(p) }) },
    stripOut: { n: 'ストリップ：横縞に裂けて飛ぶ', c: 'エッジ', d: 0.5, st: 0.1, u: 'l', f: (p, g, c) => { const q = E.inExpo(p); return { strips: 6, stripOff: q * c.W * 0.6, a: 1 - E.inQuad(p) }; } },
  });
})();
