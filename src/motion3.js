/* 3D perspective motions, word-sequenced motions, kinetic type */
'use strict';
(() => {
  const { clamp, lerp, hash } = LM.U;
  const E = LM.E, M = LM.motion;
  const PI = Math.PI, TAU = PI * 2;
  const A = (p, k = 3) => Math.min(1, p * k);

  // project a glyph of a flat text block rotated in 3D (rx: around X, ry: around Y, rz: roll) and pushed dz along depth
  function proj(g, c, rx, ry, rz = 0, dz = 0, ox = 0, oy = 0) {
    const f = c.W * 1.1;
    let X = g.x - c.cx - ox, Y = g.y - c.cy - oy, Z = 0;
    if (rz) { const cs = Math.cos(rz), sn = Math.sin(rz); [X, Y] = [X * cs - Y * sn, X * sn + Y * cs]; }
    const cy = Math.cos(ry), sy = Math.sin(ry); [X, Z] = [X * cy + Z * sy, -X * sy + Z * cy];
    const cx = Math.cos(rx), sx = Math.sin(rx); [Y, Z] = [Y * cx - Z * sx, Y * sx + Z * cx];
    Z += dz;
    const k = f / Math.max(f * 0.05, f + Z);
    return { x: c.cx + ox + X * k - g.x, y: c.cy + oy + Y * k - g.y, sx: k * Math.max(0.02, Math.abs(cy)), sy: k * Math.max(0.02, Math.abs(cx)), rot: rz, face: cy * cx, depth: Z, k };
  }
  const P3 = (g, c, rx, ry, rz, dz, a = 1, ox, oy) => { const p = proj(g, c, rx, ry, rz, dz, ox, oy); return { x: p.x, y: p.y, sx: p.sx * (p.face < 0 ? -1 : 1), sy: p.sy, rot: p.rot, a: a * (p.face < 0 ? 0.35 : 1), dark: p.face < 0.3 ? (0.3 - Math.max(0, p.face)) * 1.2 : 0 }; };

  Object.assign(M.enter, {
    flip3DY: { n: '3D：縦軸で振り向く', c: '3D', d: 0.8, st: 0, u: 'a', f: (p, g, c) => P3(g, c, 0, (1 - E.outBack(p)) * PI * 0.5, 0, 0, A(p, 4)) },
    flip3DX: { n: '3D：横軸で起き上がる', c: '3D', d: 0.8, st: 0, u: 'a', f: (p, g, c) => P3(g, c, -(1 - E.outBack(p)) * PI * 0.5, 0, 0, 0, A(p, 4), 0, 0) },
    swing3D: { n: '3D：扉のように開く', c: '3D', d: 0.9, st: 0, u: 'a', f: (p, g, c) => { const bw = (c.bb ? c.bb.w : c.W * 0.5) / 2; return P3(g, c, 0, (1 - E.outElastic(p)) * PI * 0.48, 0, 0, A(p, 5), -bw, 0); } },
    tumble3D: { n: '3D：回転しながら飛来', c: '3D', d: 1.0, st: 0, u: 'a', f: (p, g, c) => { const q = E.outCubic(p), r = 1 - q; return P3(g, c, r * PI * 1.2, r * PI * 0.8, r * 0.6, r * c.W * 3, A(p, 2.5)); } },
    zoom3D: { n: '3D：奥から迫る面', c: '3D', d: 0.8, st: 0, u: 'a', f: (p, g, c) => { const q = E.outExpo(p), r = 1 - q; return P3(g, c, r * 0.9, -r * 0.5, 0, r * c.W * 6, A(p, 2)); } },
    fly3D: { n: '3D：文字が奥から集結', c: '3D', d: 1.0, st: 0.45, o: 'random', f: (p, g, c) => { const q = E.outCubic(p), r = 1 - q; const f = c.W * 1.1, z = r * c.W * (2 + g.r1 * 4); const k = f / (f + z); const tx = (g.r2 - 0.5) * c.W * 1.6 * r, ty = (g.r3 - 0.5) * c.H * 1.6 * r; return { x: (g.x - c.cx + tx) * k + c.cx - g.x, y: (g.y - c.cy + ty) * k + c.cy - g.y, sx: k, sy: k, rot: r * (g.r1 - 0.5) * 4, a: A(p, 2), blur: r * g.size * 0.15 }; } },
    cardFlip: { n: '3D：一文字ずつカード反転', c: '3D', d: 0.9, st: 0.65, f: (p, g, c) => { const q = E.outBack(p); const a = (1 - q) * PI; const k = Math.cos(a); return { sx: k, dark: (1 - Math.abs(k)) * 0.6, accent: k < 0, a: A(p, 6) }; } },
    // word-sequenced (timed across the whole phrase — vocaloid style)
    wordSeq: { n: '単語を順番に打ち込む', c: '単語打ち', d: 0.18, wt: true, f: (p, g) => { if (p <= 0) return { vis: false }; const s = lerp(1.6, 1, E.outExpo(p)); return { sx: s, sy: s, bright: (1 - p) * 0.7 }; } },
    wordSlam: { n: '単語を叩き込む（衝撃）', c: '単語打ち', d: 0.14, wt: true, f: (p, g) => { if (p <= 0) return { vis: false }; const s = lerp(3.2, 1, E.outExpo(p)); const sh = p < 1 ? (hash(g.i, Math.floor(p * 20)) - 0.5) * g.size * 0.08 : 0; return { sx: s, sy: s, x: sh, blur: (1 - p) * g.size * 0.1 }; } },
    wordDrop: { n: '単語が上から落ちる', c: '単語打ち', d: 0.3, wt: true, f: (p, g, c) => { if (p <= 0) return { vis: false }; return { y: -(1 - E.outBounce(p)) * g.size * 2.2 }; } },
    wordSlide: { n: '単語が交互にスライド', c: '単語打ち', d: 0.22, wt: true, f: (p, g, c) => { if (p <= 0) return { vis: false }; const d = g.wordIdx % 2 ? 1 : -1; return { x: d * (1 - E.outExpo(p)) * c.W * 0.4, skx: d * (1 - p) * 0.4 }; } },
    wordFlip: { n: '単語ごとに3D反転', c: '単語打ち', d: 0.3, wt: true, f: (p, g) => { if (p <= 0) return { vis: false }; const q = E.outBack(p); return { sy: Math.max(0.02, Math.sin(clamp(q) * PI / 2)), dark: (1 - q) * 0.5, py: -g.size * 0.5 }; } },
    wordGlitch: { n: '単語ごとにグリッチ出現', c: '単語打ち', d: 0.2, wt: true, f: (p, g) => { if (p <= 0) return { vis: false }; const k = Math.floor(p * 10); return p >= 1 ? {} : { x: (hash(g.i, k) - 0.5) * g.size * 0.6, slice: 1 - p, accent: hash(g.i, k, 2) > 0.5 }; } },
    charBeat: { n: '一文字ずつ拍で打つ', c: '単語打ち', d: 0.1, wt: 'char', f: (p, g) => { if (p <= 0) return { vis: false }; const s = lerp(1.8, 1, E.outExpo(p)); return { sx: s, sy: s }; } },
  });

  Object.assign(M.hold, {
    tilt3D: { n: '3D：浮遊するカード', c: '3D', f: (ht, g, c) => P3(g, c, Math.sin(ht * 0.9 * c.tempo) * 0.28 * c.amp, Math.cos(ht * 0.7 * c.tempo) * 0.35 * c.amp, 0, 0) },
    orbitCam: { n: '3D：カメラが回り込む', c: '3D', f: (ht, g, c) => P3(g, c, 0.12 * c.amp, Math.sin(ht * 0.8 * c.tempo) * 0.55 * c.amp, 0, 0) },
    spinY3D: { n: '3D：ゆっくり一回転', c: '3D', f: (ht, g, c) => P3(g, c, 0.08, (ht * 0.9 * c.tempo) % TAU, 0, 0) },
    flag3D: { n: '3D：旗のようになびく', c: '3D', f: (ht, g, c) => { const z = Math.sin(g.xn * 5 - ht * 3 * c.tempo) * c.W * 0.06 * c.amp; const f = c.W * 1.1, k = f / (f + z); return { x: (g.x - c.cx) * (k - 1), y: (g.y - c.cy) * (k - 1) + Math.sin(g.xn * 5 - ht * 3 * c.tempo) * g.size * 0.08, sx: k, sy: k, dark: Math.max(0, z / (c.W * 0.06)) * 0.25 }; } },
    carousel: { n: '3D：回転木馬（リング）', c: '3D配置', f: (ht, g, c) => {
      const n = c.N, a = (g.i / n) * TAU - ht * 0.6 * c.tempo, R = Math.min(c.W * 0.36, g.size * n * 0.24 + c.W * 0.08);
      const X = Math.sin(a) * R, Z = Math.cos(a) * R, Y = -Math.cos(a) * R * 0.22, f = c.W * 1.1, k = f / (f - Z * 0.8 + R);
      const front = Math.cos(a);
      return { x: c.cx + X * k - g.x, y: c.cy + Y * k - g.y, sx: k * 1.1, sy: k * 1.1, a: front < -0.1 ? 0.3 + 0.2 * (front + 1) : 1, dark: front < 0 ? 0.45 : 0 };
    } },
    helix: { n: '3D：らせん（DNA）', c: '3D配置', f: (ht, g, c) => {
      const n = c.N, a = (g.i / n) * TAU * 1.3 + ht * 1.2 * c.tempo, R = c.W * 0.16;
      const X = Math.sin(a) * R, Z = Math.cos(a) * R, f = c.W * 1.1, k = f / (f + Z);
      const Y = ((g.i / Math.max(1, n - 1)) - 0.5) * c.H * 0.7;
      return { x: c.cx + X * k - g.x, y: c.cy + Y * k - g.y, sx: k, sy: k, a: Math.cos(a) < -0.3 ? 0.3 : 1, dark: Math.cos(a) < 0 ? 0.35 : 0 };
    } },
    sphere: { n: '3D：球面を回る文字', c: '3D配置', f: (ht, g, c) => {
      const n = c.N, gold = PI * (3 - Math.sqrt(5)), yv = 1 - (g.i / Math.max(1, n - 1)) * 2, r = Math.sqrt(1 - yv * yv), th = gold * g.i + ht * 0.6 * c.tempo;
      const R = Math.min(c.W, c.H) * 0.34, X = Math.cos(th) * r * R, Z = Math.sin(th) * r * R, Y = yv * R, f = c.W * 1.1, k = f / (f + Z);
      return { x: c.cx + X * k - g.x, y: c.cy + Y * k - g.y, sx: k, sy: k, a: Z > R * 0.3 ? 0.35 : 1, dark: Z > 0 ? 0.35 : 0 };
    } },
    crawl3D: { n: '3D：奥へ流れる（スクロール）', c: '3D', f: (ht, g, c) => P3(g, c, 0.95, 0, 0, 0, 1, 0, -ht * c.S * 60 * c.amp) },
    wave3D: { n: '3D：文字が波打つ奥行き', c: '3D', f: (ht, g, c) => { const z = Math.sin(g.i * 0.7 - ht * 4 * c.tempo) * c.W * 0.1 * c.amp; const f = c.W * 1.1, k = f / (f + z); return { x: (g.x - c.cx) * (k - 1), y: (g.y - c.cy) * (k - 1), sx: k, sy: k, dark: Math.max(0, z / (c.W * 0.1)) * 0.3 }; } },
  });

  Object.assign(M.exit, {
    flip3DOut: { n: '3D：振り向いて消える', c: '3D', d: 0.6, st: 0, u: 'a', f: (p, g, c) => P3(g, c, 0, -E.inBack(p) * PI * 0.5, 0, 0, 1 - E.inQuart(p)) },
    fly3DOut: { n: '3D：奥へ散る', c: '3D', d: 0.8, st: 0.3, o: 'random', f: (p, g, c) => { const q = E.inCubic(p); const f = c.W * 1.1, z = q * c.W * (3 + g.r1 * 5); const k = f / (f + z); const tx = (g.r2 - 0.5) * c.W * q, ty = (g.r3 - 0.5) * c.H * q; return { x: (g.x - c.cx + tx) * k + c.cx - g.x, y: (g.y - c.cy + ty) * k + c.cy - g.y, sx: k, sy: k, rot: q * (g.r1 - 0.5) * 3, a: 1 - E.inQuad(p) }; } },
    passCam: { n: '3D：カメラを通り抜ける', c: '3D', d: 0.55, st: 0, u: 'a', f: (p, g, c) => { const q = E.inExpo(p); return Object.assign(P3(g, c, q * 0.4, 0, 0, -q * c.W * 1.05), { a: 1 - E.inQuad(clamp(p * 1.2)), blur: q * g.size * 0.3 }); } },
    tumble3DOut: { n: '3D：回転しながら飛び去る', c: '3D', d: 0.8, st: 0, u: 'a', f: (p, g, c) => { const q = E.inCubic(p); return P3(g, c, -q * PI, q * PI * 0.7, -q * 0.5, q * c.W * 3, 1 - E.inQuad(p)); } },
    wordUnseq: { n: '単語ごとに消える', c: '単語打ち', d: 0.4, st: 0.9, u: 'w', o: 'rev', f: (p) => ({ vis: p < 0.5, sx: 1 + p * 0.3, sy: 1 + p * 0.3 }) },
  });

  M.proj = proj;
})();
