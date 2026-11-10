/* Effect catalogue phase 5a — physics & animation principles for lyrics (§9 PH-01〜25) and particles made from the
 * lyric itself (§16 PT-11/13/14/15).
 * Everything stays deterministic: simulations run once per layout on a fixed step and are looked up by time, so a
 * frame renders the same whether it is previewed, scrubbed or exported.
 *  - enters: anticipation → arc → stretch → squash → follow-through (all principles at once), rigid letters dropped
 *    on the baseline (gravity, collision, friction, tumble, settle), a flock that flies in (boids), particles that
 *    gather into the letters, particles that morph from the previous line
 *  - holds: flag / cloth, letters hanging on ropes (pendulums kicked by the beat), spring chain (overlapping action),
 *    floating on water, Brownian drift, magnetic field, IK arm reaching for a moving target, sparks off the outline
 *  - exits: rigid fall with bounces, domino knock-over, wind through a curl-noise field, vortex, burst into particles
 * Glyph painters use the renderer's T.paint hook (see render.js drawGlyph). */
'use strict';
(() => {
  const U = LM.U, { clamp, lerp, hash, mix, rgba } = U, M = LM.motion, E = LM.E, PI = Math.PI, TAU = PI * 2;
  const N1 = U.noise1, n2 = (x, y, s) => (LM.bgm.noise2(x, y, s) * 2 - 1);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const cat = '物理';

  /* ---------- simulation cache: keyed by the layout's glyph array (stable while the layout is cached) ---------- */
  const SIM = new WeakMap();
  function simOf(C, key, build) {
    let m = SIM.get(C.gl); if (!m) SIM.set(C.gl, (m = {}));
    const k = key + '|' + C.W + 'x' + C.H + '|' + Math.round((C.dur || 0) * 100);
    return m[k] || (m[k] = build());
  }
  // per-glyph track [x, y, rot] sampled at SR Hz
  const SR = 120;
  const look = (tr, t) => { const n = tr.length / 3, x = clamp(t * SR, 0, n - 1), i = Math.min(n - 2, Math.floor(x)), u = x - i; if (n < 2) return [tr[0] || 0, tr[1] || 0, tr[2] || 0]; return [lerp(tr[i * 3], tr[i * 3 + 3], u), lerp(tr[i * 3 + 1], tr[i * 3 + 4], u), lerp(tr[i * 3 + 2], tr[i * 3 + 5], u)]; };
  const rank = (g, C) => (C.N > 1 ? (g.k || 0) / (C.N - 1) : 0);

  /* ---------- 2D rigid box against a floor (impulse solver, restitution + Coulomb friction) ---------- */
  function rigid(o) {
    const { w, h, D, G, e, mu, floor } = o; let { x, y, vx, vy, th, om } = o;
    const I = (w * w + h * h) / 12, dt = 1 / 480, sub = 480 / SR, n = Math.ceil(D * SR) + 1, out = new Float32Array(n * 3);
    const cs = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    for (let f = 0; f < n; f++) {
      out[f * 3] = x; out[f * 3 + 1] = y; out[f * 3 + 2] = th;
      for (let s = 0; s < sub; s++) {
        vy += G * dt; x += vx * dt; y += vy * dt; th += om * dt; om *= 0.9995;
        const c = Math.cos(th), sn = Math.sin(th);
        let best = -1e9, rx = 0, ry = 0; for (const [lx, ly] of cs) { const ax = lx * c - ly * sn, ay = lx * sn + ly * c; if (y + ay > best) { best = y + ay; rx = ax; ry = ay; } }
        const pen = best - floor; if (pen <= 0) continue;
        const vcx = vx - om * ry, vcy = vy + om * rx;
        if (vcy > 0) {
          const j = (1 + e) * vcy / (1 + (rx * rx) / I); vy -= j; om -= (rx * j) / I;
          const vt = vx - om * ry, jt0 = -vt / (1 + (ry * ry) / I), jt = clamp(jt0, -mu * j, mu * j); vx += jt; om -= (ry * jt) / I;
        }
        y -= pen * 0.85;
      }
    }
    return out;
  }

  /* ---------- painters (T.paint) ---------- */
  // points sampled from a glyph's shape (cached per character / font / size)
  const PC = new Map(), pcv = document.createElement('canvas'), pcx = pcv.getContext('2d', { willReadFrequently: true });
  function glyphPts(ch, font, size) {
    const key = ch + '|' + font; let P = PC.get(key); if (P) return P;
    const s = Math.ceil(size * 1.7); pcv.width = s; pcv.height = s; pcx.clearRect(0, 0, s, s); pcx.font = font; pcx.textAlign = 'center'; pcx.textBaseline = 'middle'; pcx.fillStyle = '#000'; pcx.fillText(ch, s / 2, s / 2);
    const d = pcx.getImageData(0, 0, s, s).data, st = Math.max(1, size / 24), pts = [], edge = [];
    const A = (x, y) => (x < 0 || y < 0 || x >= s || y >= s ? 0 : d[(Math.floor(y) * s + Math.floor(x)) * 4 + 3]);
    for (let y = 0; y < s; y += st) for (let x = 0; x < s; x += st) { const jx = x + (hash(x, y, 3) - 0.5) * st * 0.8, jy = y + (hash(x, y, 4) - 0.5) * st * 0.8; if (A(jx, jy) > 110) { pts.push(jx - s / 2, jy - s / 2); if (A(jx + st, jy) < 60 || A(jx - st, jy) < 60 || A(jx, jy + st) < 60 || A(jx, jy - st) < 60) edge.push(jx - s / 2, jy - s / 2); } }
    P = { p: Float32Array.from(pts), e: Float32Array.from(edge.length ? edge : pts) };
    if (PC.size > 600) PC.clear(); PC.set(key, P); return P;
  }
  const fontAt = (font, size) => font.replace(/(\d+(?:\.\d+)?)px/, Math.max(4, Math.round(size)) + 'px');
  function dots(ctx, P, fn, r) { const n = P.length / 2; for (let i = 0; i < n; i++) { const o = fn(P[i * 2], P[i * 2 + 1], i); if (!o) continue; ctx.globalAlpha = o[2]; ctx.fillRect(o[0] - r, o[1] - r, r * 2, r * 2); } }

  const PAINT = {
    // particles gather into the letter (PT-14)
    form(ctx, X) {
      const { g, T, size, col, draw } = X, q = clamp(T.pd.q), a0 = ctx.globalAlpha, P = glyphPts(X.ch, ctx.font, size).p, r = Math.max(0.7, size * 0.022);
      if (q < 0.999) {
        ctx.save(); ctx.filter = 'none'; ctx.fillStyle = col; const sd = (g.i || 0) * 13.7;
        dots(ctx, P, (x, y, i) => { const h1 = hash(i, sd, 1), qi = E.inOutCubic(clamp((q - h1 * 0.4) / 0.6)), ang = h1 * TAU + (1 - qi) * 3.2, rad = size * (2.2 + hash(i, sd, 2) * 4.5) * (1 - qi); return [x + Math.cos(ang) * rad, y + Math.sin(ang) * rad * 0.7, a0 * (0.35 + 0.65 * qi) * (1 - sstep(0.82, 1, q))]; }, r);
        ctx.restore();
      }
      if (q > 0.7) { ctx.globalAlpha = a0 * sstep(0.7, 1, q); draw(); ctx.globalAlpha = a0; }
    },
    // the letter breaks into particles carried by a curl wind (PT-11/16)
    burst(ctx, X) {
      const { g, T, size, col, draw } = X, q = clamp(T.pd.q), a0 = ctx.globalAlpha, P = glyphPts(X.ch, ctx.font, size).p, r = Math.max(0.7, size * 0.022), sd = (g.i || 0) * 7.3, wd = T.pd.dir || 1;
      if (q < 0.25) { ctx.globalAlpha = a0 * (1 - sstep(0, 0.25, q)); draw(); ctx.globalAlpha = a0; }
      ctx.save(); ctx.filter = 'none'; ctx.fillStyle = col;
      dots(ctx, P, (x, y, i) => { const h1 = hash(i, sd, 5), qi = clamp((q - h1 * 0.3) / 0.7); if (qi <= 0) return [x, y, a0 * sstep(0.05, 0.2, q)]; const e = qi * qi, cx = x / size, cy = y / size;
        const sw = n2(cx * 1.3 + e * 2, cy * 1.3, 9) * size * 1.4 * e; return [x + wd * e * size * (3 + h1 * 6) + sw, y - e * size * (1.5 + hash(i, sd, 6) * 3.5) + n2(cx, cy + e * 2, 4) * size * e, a0 * Math.pow(1 - qi, 1.3)]; }, r);
      ctx.restore();
    },
    // morph from the previous line's letters (PT-15)
    morph(ctx, X) {
      const { g, T, size, col, draw } = X, q = clamp(T.pd.q), a0 = ctx.globalAlpha, P = glyphPts(X.ch, ctx.font, size).p, src = T.pd.src;
      if (!src || q >= 0.999) { if (q > 0.6 || !src) { ctx.globalAlpha = a0 * (src ? sstep(0.6, 1, q) : 1); draw(); ctx.globalAlpha = a0; } return; }
      const S2 = glyphPts(src.ch, fontAt(ctx.font, src.size), src.size).p, ns = S2.length / 2, r = Math.max(0.7, size * 0.022), sd = (g.i || 0) * 3.1;
      ctx.save(); ctx.filter = 'none'; ctx.fillStyle = col;
      dots(ctx, P, (x, y, i) => { const j = Math.floor(hash(i, sd, 7) * ns), sx = src.dx + S2[j * 2], sy = src.dy + S2[j * 2 + 1], qi = E.inOutCubic(clamp((q - hash(i, sd, 8) * 0.3) / 0.7)), arc = Math.sin(PI * qi) * size * (0.6 + hash(i, sd, 9)); return [lerp(sx, x, qi), lerp(sy, y, qi) - arc, a0 * (1 - sstep(0.85, 1, q))]; }, r);
      ctx.restore();
      if (q > 0.6) { ctx.globalAlpha = a0 * sstep(0.6, 1, q); draw(); ctx.globalAlpha = a0; }
    },
    // sparks shed from the outline (PT-13)
    emit(ctx, X) {
      const { g, size, draw, cc } = X, a0 = ctx.globalAlpha, P = glyphPts(X.ch, ctx.font, size).e, n = P.length / 2, t = X.r.curT || 0, r = Math.max(0.6, size * 0.018), sd = (g.i || 0) * 5.7;
      draw(); ctx.save(); ctx.filter = 'none'; ctx.fillStyle = cc.acc;
      for (let k = 0; k < 30; k++) { const j = Math.floor(hash(k, sd, 1) * n), ph = (t * (0.7 + hash(k, sd, 2) * 0.6) + hash(k, sd, 3)) % 1, x = P[j * 2] + Math.sin(ph * 6 + k) * size * 0.1, y = P[j * 2 + 1] - ph * size * 1.1; ctx.globalAlpha = a0 * Math.min(1, Math.sin(PI * ph) * 1.6); const rr = r * (2.1 - ph * 1.4); ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      ctx.restore();
    },
    // flag / cloth: vertical strips displaced by a travelling wave, shaded by the slope (PH-14)
    cloth(ctx, X) {
      const { g, T, size, draw } = X, d = T.pd, n = 10, w = g.w + size * 0.3, x0 = -w / 2, sw = w / n;
      for (let k = 0; k < n; k++) {
        const xa = d.ax + (x0 + (k + 0.5) * sw), amp = d.A * Math.min(1, Math.max(0, xa) / d.span + 0.08), ph = xa * d.kx - d.t * d.w;
        const dy = Math.sin(ph) * amp, sl = Math.cos(ph) * amp * d.kx;
        ctx.save(); ctx.beginPath(); ctx.rect(x0 + k * sw - 0.4, -size * 0.8, sw + 0.8, size * 1.6); ctx.clip(); ctx.translate(0, dy);
        if (Math.abs(sl) > 0.02) ctx.filter = `brightness(${clamp(1 - sl * 0.9, 0.55, 1.45).toFixed(3)})`; draw(); ctx.restore();
      }
    },
    // rope from the glyph up to its anchor (PH-15)
    rope(ctx, X) {
      const { T, size, draw, cc } = X, L = T.pd.L, a0 = ctx.globalAlpha;
      ctx.save(); ctx.filter = 'none'; ctx.strokeStyle = rgba(cc.fill, 0.75); ctx.lineWidth = Math.max(1, size * 0.025); ctx.globalAlpha = a0 * 0.9;
      ctx.beginPath(); ctx.moveTo(0, -size * 0.52); ctx.lineTo(0, -L); ctx.stroke();
      ctx.fillStyle = cc.acc; ctx.beginPath(); ctx.arc(0, -size * 0.55, Math.max(1.5, size * 0.045), 0, TAU); ctx.fill(); ctx.restore();
      draw();
    },
  };
  LM.glyphPaint = PAINT;

  /* ================= enters ================= */
  Object.assign(M.enter, {
    // PH-01〜06/08: anticipation, arc, stretch along velocity, lean, squash on landing, follow-through and overlap
    principlesIn: { n: 'アニメの原則（溜め→弧→伸び→着地で潰れ→余韻）', c: cat, d: 1.2, st: 0.45, f: (p, g, C) => {
      if (p <= 0) return { a: 0 };
      const dir = hash(g.k || 0, 21) > 0.5 ? 1 : -1, sx0 = -dir * C.W * 0.18, sy0 = g.size * 1.6, P = (u) => { const cx = sx0 * 0.4, cy = -g.size * 2.2, m = 1 - u; return [m * m * sx0 + 2 * m * u * cx, m * m * sy0 + 2 * m * u * cy]; };
      if (p < 0.2) { const q = E.outCubic(p / 0.2); return { x: sx0, y: sy0 + q * g.size * 0.08, sx: 1 + q * 0.16, sy: 1 - q * 0.22, rot: -dir * q * 0.12, a: clamp(p / 0.08) }; }
      if (p < 0.68) {
        const u = E.inOutCubic((p - 0.2) / 0.48), [x, y] = P(u), [x2, y2] = P(Math.min(1, u + 0.02)), vx = (x2 - x) / g.size, vy = (y2 - y) / g.size, sp = Math.min(1, Math.hypot(vx, vy) * 4);
        const ax = Math.abs(vx) / (Math.abs(vx) + Math.abs(vy) + 1e-6);
        return { x, y, sx: 1 + sp * 0.3 * ax - sp * 0.12 * (1 - ax), sy: 1 + sp * 0.3 * (1 - ax) - sp * 0.12 * ax, rot: Math.atan2(vy, Math.abs(vx) + 0.3) * 0.25 * Math.sign(vx || 1), skx: -vx * 0.6 };
      }
      const q = (p - 0.68) / 0.32, e = Math.exp(-q * 5.5), o = Math.cos(q * 15);
      return { sx: 1 + 0.2 * e * o, sy: 1 - 0.24 * e * o, y: 0.08 * g.size * e * Math.max(0, o), rot: dir * 0.09 * e * Math.sin(q * 13), skx: dir * 0.18 * e * Math.sin(q * 11 + 0.6) };
    } },
    // PH-10/11/12: rigid letters dropped onto the baseline
    physDrop: { n: '重力で落ちて跳ね、転がって止まる（剛体）', c: cat, d: 1.7, st: 0.35, f: (p, g, C) => {
      if (p <= 0) return { a: 0 };
      const tr = simOf(C, 'drop', () => C.gl.map((q, i) => rigid({ w: q.w * 0.92 + q.size * 0.08, h: q.size * 0.86, D: 1.4, G: C.H * 3.4, e: 0.26, mu: 0.8, floor: q.size * 0.43, x: (hash(i, 1) - 0.5) * q.size * 0.8, y: -C.H * (0.5 + hash(i, 2) * 0.2), vx: (hash(i, 3) - 0.5) * q.size * 1.2, vy: 0, th: (hash(i, 4) - 0.5) * 0.7, om: (hash(i, 5) - 0.5) * 4 })))[g.k || 0];
      const s = look(tr, p * 1.4), b = sstep(0.72, 1, p);
      return { x: s[0] * (1 - b), y: s[1] * (1 - b), rot: s[2] * (1 - b), a: clamp(p / 0.05) };
    } },
    // PH-18: a flock flies in from the side and lands in formation
    flockIn: { n: '群れで飛んできて並ぶ（ボイド）', c: cat, d: 1.8, st: 0, f: (p, g, C) => {
      const sim = simOf(C, 'flock', () => {
        const gl = C.gl, N = gl.length, D = 1.6, n = Math.ceil(D * SR) + 1, out = gl.map(() => new Float32Array(n * 3));
        const P = gl.map((q, i) => ({ x: -C.W * 0.75 - hash(i, 7) * C.W * 0.25 - (q.x - C.cx) * 0.2, y: (hash(i, 8) - 0.5) * C.H * 0.5 - (q.y - C.cy), vx: C.W * 0.9, vy: (hash(i, 9) - 0.5) * C.H * 0.4 }));
        const dt = 1 / SR, sep = Math.max(...gl.map((q) => q.size)) * 0.9;
        for (let f = 0; f < n; f++) {
          const u = f / (n - 1), seek = 6 + 46 * u * u;
          let mx = 0, my = 0, mvx = 0, mvy = 0; for (const a of P) { mx += a.x; my += a.y; mvx += a.vx; mvy += a.vy; } mx /= N; my /= N; mvx /= N; mvy /= N;
          P.forEach((a, i) => {
            out[i][f * 3] = a.x; out[i][f * 3 + 1] = a.y; out[i][f * 3 + 2] = Math.atan2(a.vy, a.vx) * (1 - u) * 0.6;
            const damp = 2.2 + 9 * u, fl = 1 - u;
            let ax = -a.x * seek - a.vx * damp + ((mvx - a.vx) * 0.8 + (mx - a.x) * 0.6) * fl, ay = -a.y * seek - a.vy * damp + ((mvy - a.vy) * 0.8 + (my - a.y) * 0.6) * fl;
            const X = gl[i].x + a.x, Y = gl[i].y + a.y;
            for (let j = 0; j < N; j++) { if (j === i) continue; const dx = X - (gl[j].x + P[j].x), dy = Y - (gl[j].y + P[j].y), d2 = dx * dx + dy * dy; if (d2 < sep * sep && d2 > 1) { const d = Math.sqrt(d2), k = ((sep - d) / sep) * C.W * 6 * fl; ax += (dx / d) * k; ay += (dy / d) * k; } }
            ax += n2(X / C.W * 3, Y / C.H * 3 + u * 2, 3) * C.W * 2 * fl; ay += n2(X / C.W * 3 + 5, Y / C.H * 3, 4) * C.H * 2 * fl;
            a.vx += ax * dt; a.vy += ay * dt; a.x += a.vx * dt; a.y += a.vy * dt;
          });
        }
        return out;
      });
      const s = look(sim[g.k || 0], p * 1.6), b = sstep(0.8, 1, p);
      return { x: s[0] * (1 - b), y: s[1] * (1 - b), rot: s[2] * (1 - b), sx: 1 - 0.25 * (1 - b) * Math.abs(Math.sin(p * 40 + (g.k || 0))), a: clamp(p / 0.06) };
    } },
    particleForm: { n: '粒子が集まって文字になる', c: cat, d: 1.5, st: 0.2, f: (p) => (p <= 0 ? { a: 0 } : { paint: PAINT.form, pd: { q: p } }) },
    particleMorph: { n: '前の歌詞が粒子になって次の文字へ', c: cat, d: 1.3, st: 0.1, morph: true, f: (p, g, C) => {
      const pv = C.prevL && C.prevL.glyphs; if (!pv || !pv.length) return p <= 0 ? { a: 0 } : { paint: PAINT.form, pd: { q: p } };
      const q = pv[Math.min(pv.length - 1, Math.floor(((g.k || 0) / Math.max(1, C.N)) * pv.length))];
      return { paint: PAINT.morph, pd: { q: Math.max(0.001, p), src: { ch: q.ch, size: q.size, dx: q.x - g.x, dy: q.y - g.y } } };
    } },
  });

  /* ================= holds ================= */
  Object.assign(M.hold, {
    flagWave: { n: '旗のようにはためく（布）', c: cat, f: (ht, g, C) => { const k = C.amp || 1, bx = C.bb ? C.bb.x : C.cx - C.W * 0.3; return { paint: PAINT.cloth, pd: { ax: g.x - bx, span: Math.max(1, C.bb ? C.bb.w : C.W * 0.6), A: g.size * 0.24 * k, kx: 5.2 / Math.max(g.size * 6, 1), w: 5.5, t: C.tAbs } }; } },
    hangRope: { n: 'ロープでぶら下がって揺れる（振り子）', c: cat, f: (ht, g, C) => {
      const tr = simOf(C, 'rope', () => {
        const D = (C.dur || 6) + 1, per = 60 / (C.bpm || 120), n = Math.ceil(D * SR) + 1, dt = 1 / SR;
        return C.gl.map((q, i) => { const L = C.H * (0.3 + hash(i, 31) * 0.12), out = new Float32Array(n * 3), w0 = Math.sqrt(C.H * 3 / L); let th = (hash(i, 32) - 0.5) * 0.18, om = 0, nb = 0;
          for (let f = 0; f < n; f++) { const t = f * dt; out[f * 3] = L; out[f * 3 + 1] = 0; out[f * 3 + 2] = th;
            if (t >= nb * per) { om += (hash(i, nb, 33) - 0.5) * 0.45 + (nb % 2 ? 0.12 : -0.12); nb++; }
            om += (-w0 * w0 * Math.sin(th) - 1.6 * om + N1(t * 0.7, i + 40) * 0.9) * dt; th += om * dt; }
          return out; });
      })[g.k || 0];
      const s = look(tr, ht), L = s[0], th = s[2] * (C.amp || 1);
      return { x: -L * Math.sin(th), y: -L * (1 - Math.cos(th)), rot: th, paint: PAINT.rope, pd: { L } };
    } },
    springChain: { n: 'ばねでつながって遅れて揺れる', c: cat, f: (ht, g, C) => {
      const sim = simOf(C, 'chain', () => {
        const D = (C.dur || 6) + 1, n = Math.ceil(D * SR) + 1, dt = 1 / SR, N = C.gl.length, per = 60 / (C.bpm || 120), out = C.gl.map(() => new Float32Array(n * 3)), y = new Float64Array(N), v = new Float64Array(N), sz = C.gl[0] ? C.gl[0].size : 40;
        for (let f = 0; f < n; f++) { const t = f * dt, ph = (t % per) / per, drive = Math.sin(t * TAU / (per * 2)) * sz * 0.28 - Math.exp(-ph * 9) * sz * 0.18;
          for (let i = 0; i < N; i++) { const tgt = i === 0 ? drive : y[i - 1]; v[i] += ((tgt - y[i]) * 260 - v[i] * 24) * dt; y[i] += v[i] * dt; }
          for (let i = 0; i < N; i++) { out[i][f * 3 + 1] = y[i]; out[i][f * 3 + 2] = Math.atan2((y[Math.min(N - 1, i + 1)] - y[Math.max(0, i - 1)]) * 0.5, sz) * 0.8; } }
        return out;
      });
      const s = look(sim[g.k || 0], ht), k = C.amp || 1; return { y: s[1] * k, rot: s[2] * k };
    } },
    floatWater: { n: '水面に浮かんで上下に揺れる', c: cat, f: (ht, g, C) => { const k = C.amp || 1, t = C.tAbs, x = g.x / g.size, w = (u) => Math.sin(u * 0.55 - t * 1.6) * 0.6 + Math.sin(u * 1.3 + t * 2.3) * 0.25, h = w(x), sl = (w(x + 0.3) - w(x - 0.3)) / 0.6; return { y: h * g.size * 0.22 * k + Math.max(0, C.beat) * g.size * 0.05 * k, rot: Math.atan(sl * 0.4) * k }; } },
    brownian: { n: 'ブラウン運動（ふらふら漂う）', c: cat, f: (ht, g, C) => { const k = (C.amp || 1) * g.size, t = C.tAbs, i = (g.k || 0) * 3.7, f = (s, o) => N1(t * s, i + o) * 0.6 + N1(t * s * 2.3, i + o + 9) * 0.3 + N1(t * s * 5.1, i + o + 17) * 0.1; return { x: f(0.9, 1) * 0.1 * k, y: f(0.8, 4) * 0.2 * k, rot: f(0.7, 7) * 0.1 }; } },
    magnetField: { n: '磁石に引き寄せられて反発する', c: cat, f: (ht, g, C) => {
      const t = C.tAbs, bb = C.bb || { cx: C.cx, cy: C.cy, w: C.W * 0.5, h: C.H * 0.2 }, mx = bb.cx + Math.sin(t * 0.9) * bb.w * 0.55, my = bb.cy + Math.sin(t * 1.37) * bb.h * 1.1, pol = Math.sin(t * 0.45) > 0 ? 1 : -1;
      const dx = g.x - mx, dy = g.y - my, d = Math.hypot(dx, dy) + g.size * 0.6, f = Math.min(1, (g.size * 2.2) / d) ** 2 * (C.amp || 1), m = f * g.size * 0.55 * pol;
      return { x: (dx / d) * m, y: (dy / d) * m, rot: Math.atan2(dy, dx) * 0 + pol * f * 0.25 * Math.sign(dx), sx: 1 + f * 0.08, sy: 1 + f * 0.08 };
    } },
    ikArm: { n: '腕のように伸びて目標を追う（IK）', c: cat, f: (ht, g, C) => {
      let m = SIM.get(C.gl); if (!m) SIM.set(C.gl, (m = {})); const t = C.tAbs;
      if (!m.ik || m.ik.t !== t) {
        // one chain per text line: the first letter is the shoulder, FABRIK reaches the last letter for a moving target
        const gl = C.gl, P = gl.map((q) => [q.x, q.y]), R = gl.map(() => 0), lines = {};
        gl.forEach((q, i) => (lines[q.line || 0] = lines[q.line || 0] || []).push(i));
        Object.keys(lines).forEach((ln, li) => {
          const ix = lines[ln], N = ix.length; if (N < 2) return;
          const Ls = []; for (let k = 1; k < N; k++) Ls.push(Math.hypot(gl[ix[k]].x - gl[ix[k - 1]].x, gl[ix[k]].y - gl[ix[k - 1]].y));
          const root = P[ix[0]].slice(), tot = Ls.reduce((a, b) => a + b, 0), sz = gl[ix[0]].size, ph = li * 1.7;
          const tg = [root[0] + tot * (0.9 + 0.06 * Math.sin(t * 0.8 + ph)), root[1] + Math.sin(t * 1.3 + ph) * tot * 0.28 + Math.cos(t * 0.6 + ph) * sz * 0.5];
          const Q = ix.map((i) => P[i].slice());
          for (let it = 0; it < 10; it++) { Q[N - 1] = tg.slice(); for (let k = N - 2; k >= 0; k--) { const dx = Q[k][0] - Q[k + 1][0], dy = Q[k][1] - Q[k + 1][1], d = Math.hypot(dx, dy) || 1; Q[k] = [Q[k + 1][0] + dx / d * Ls[k], Q[k + 1][1] + dy / d * Ls[k]]; } Q[0] = root.slice(); for (let k = 1; k < N; k++) { const dx = Q[k][0] - Q[k - 1][0], dy = Q[k][1] - Q[k - 1][1], d = Math.hypot(dx, dy) || 1; Q[k] = [Q[k - 1][0] + dx / d * Ls[k - 1], Q[k - 1][1] + dy / d * Ls[k - 1]]; } }
          ix.forEach((i, k) => { P[i] = Q[k]; const a = Q[Math.max(0, k - 1)], b = Q[Math.min(N - 1, k + 1)]; R[i] = Math.atan2(b[1] - a[1], b[0] - a[0]); });
        });
        m.ik = { t, P, R };
      }
      const k = clamp(0.75 * (C.amp || 1)), i = g.k || 0, q = m.ik.P[i]; if (!q) return {};
      return { x: (q[0] - g.x) * k, y: (q[1] - g.y) * k, rot: m.ik.R[i] * k };
    } },
    sparkEmit: { n: '文字の輪郭から火の粉が出る', c: cat, f: () => ({ paint: PAINT.emit }) },
  });

  /* ================= exits ================= */
  Object.assign(M.exit, {
    physFall: { n: '支えを失って落ち、跳ねて転がる（剛体）', c: cat, d: 1.6, st: 0.4, f: (p, g, C) => {
      const tr = simOf(C, 'fall', () => C.gl.map((q, i) => rigid({ w: q.w * 0.92 + q.size * 0.08, h: q.size * 0.86, D: 1.6, G: C.H * 3.4, e: 0.42, mu: 0.4, floor: C.H * 0.97 - q.y, x: 0, y: 0, vx: (hash(i, 11) - 0.5) * q.size * 3, vy: -q.size * (1 + hash(i, 12) * 3), th: 0, om: (hash(i, 13) - 0.5) * 7 })))[g.k || 0];
      const s = look(tr, p * 1.6); return { x: s[0], y: s[1], rot: s[2], a: 1 - sstep(0.75, 1, p) };
    } },
    physKnock: { n: 'ドミノのように押し倒されて落ちる', c: cat, d: 1.5, st: 0.55, o: 'ltr', f: (p, g, C) => {
      const tr = simOf(C, 'knock', () => C.gl.map((q, i) => rigid({ w: q.w * 0.92 + q.size * 0.08, h: q.size * 0.86, D: 1.5, G: C.H * 3.4, e: 0.3, mu: 0.7, floor: C.H * 0.97 - q.y, x: 0, y: 0, vx: q.size * 3.2, vy: -q.size * 0.6, th: 0, om: 6 + hash(i, 14) * 3 })))[g.k || 0];
      const s = look(tr, p * 1.5); return { x: s[0], y: s[1], rot: s[2], a: 1 - sstep(0.78, 1, p) };
    } },
    windBlow: { n: '風に吹かれて舞い散る（カールノイズ）', c: cat, d: 1.5, st: 0.45, o: 'ltr', f: (p, g, C) => {
      const tr = simOf(C, 'wind', () => C.gl.map((q, i) => { const n = Math.ceil(1.5 * SR) + 1, out = new Float32Array(n * 3), dt = 1 / SR; let x = 0, y = 0, r = 0;
        for (let f = 0; f < n; f++) { const u = f / (n - 1), px = (q.x + x) / C.H * 2.2, py = (q.y + y) / C.H * 2.2 + u, e = 1e-3, cu = (n2(px, py + e, 2) - n2(px, py - e, 2)) / (2 * e), cv = -(n2(px + e, py, 2) - n2(px - e, py, 2)) / (2 * e);
          out[f * 3] = x; out[f * 3 + 1] = y; out[f * 3 + 2] = r; const sp = C.H * (0.4 + 2.6 * u * u); x += (0.75 + hash(i, 15) * 0.7 + cu * 0.35) * sp * dt; y += (-0.3 + (hash(i, 16) - 0.5) * 1.1 + cv * 0.45) * sp * dt; r += (cu - cv) * 2.4 * dt * (1 + u * 3); }
        return out; }))[g.k || 0];
      const s = look(tr, p * 1.5); return { x: s[0], y: s[1], rot: s[2], sx: 1 - 0.3 * p * Math.abs(Math.sin(p * 9 + (g.k || 0))), a: 1 - sstep(0.55, 1, p), blur: p * p * g.size * 0.05 };
    } },
    vortexOut: { n: '渦に吸い込まれる', c: cat, d: 1.4, st: 0.3, f: (p, g, C) => { const dx = g.x - C.cx, dy = g.y - C.cy, r0 = Math.hypot(dx, dy), a0 = Math.atan2(dy, dx), q = E.inCubic(p), a = a0 + q * (4 + 900 / (r0 + 60)), r = r0 * (1 - q); return { x: C.cx + Math.cos(a) * r - g.x, y: C.cy + Math.sin(a) * r - g.y, rot: q * 5, sx: 1 - q * 0.85, sy: 1 - q * 0.85, a: 1 - sstep(0.7, 1, p), blur: q * g.size * 0.04 }; } },
    particleBurst: { n: '粒子になって風に散る', c: cat, d: 1.4, st: 0.3, o: 'ltr', f: (p) => ({ paint: PAINT.burst, pd: { q: p, dir: 1 } }) },
  });

  /* director meta + theme pools */
  LM.director_OVR = LM.director_OVR || {};
  const OV = (k, o) => (LM.director_OVR[k] = Object.assign(LM.director_OVR[k] || {}, o));
  OV('enter', { principlesIn: [0.65, 'bounce'], physDrop: [0.75, 'bounce snap'], flockIn: [0.6, 'organic kinetic'], particleForm: [0.45, 'cinema organic'], particleMorph: [0.45, 'cinema smooth'] });
  OV('hold', { flagWave: [0.4, 'organic'], hangRope: [0.5, 'bounce organic'], springChain: [0.55, 'bounce'], floatWater: [0.25, 'smooth organic'], brownian: [0.2, 'organic smooth'], magnetField: [0.45, 'organic'], ikArm: [0.6, 'kinetic organic'], sparkEmit: [0.4, 'cinema'] });
  OV('exit', { physFall: [0.7, 'bounce snap'], physKnock: [0.75, 'snap bounce'], windBlow: [0.45, 'organic smooth'], vortexOut: [0.6, 'snap'], particleBurst: [0.45, 'cinema organic'] });
  const D = LM.data, addTo = (id, key, o) => { const t = D.themeById[id]; if (t) t[key] = Object.assign({}, t[key] || {}, o); };
  [['kids', { principlesIn: 1.5, physDrop: 1.2 }, { hangRope: 1, springChain: 1, floatWater: 0.8 }, { physFall: 1.2, physKnock: 1 }],
    ['anison', { principlesIn: 1.2, physDrop: 0.8 }, { springChain: 0.8 }, { physKnock: 0.8, particleBurst: 0.8 }],
    ['jpop', { principlesIn: 1, particleForm: 0.6 }, { floatWater: 0.6, springChain: 0.6 }, { particleBurst: 0.8, windBlow: 0.6 }],
    ['ballad', { particleForm: 1.2, particleMorph: 1 }, { floatWater: 0.8, sparkEmit: 0.6, brownian: 0.6 }, { particleBurst: 1.2, windBlow: 1 }],
    ['cinematic', { particleForm: 1.2, particleMorph: 1.2 }, { sparkEmit: 0.8, flagWave: 0.6 }, { particleBurst: 1.2, windBlow: 0.8 }],
    ['dream', { particleForm: 1.2, flockIn: 0.8 }, { floatWater: 1, brownian: 1 }, { windBlow: 1.2, particleBurst: 1 }],
    ['ambient', { particleForm: 1 }, { brownian: 1, floatWater: 1 }, { windBlow: 1, particleBurst: 1 }],
    ['acoustic', { flockIn: 0.6 }, { flagWave: 0.8, floatWater: 0.6 }, { windBlow: 1.2 }],
    ['wa', { particleForm: 0.6 }, { flagWave: 1, floatWater: 0.8 }, { windBlow: 1.2 }],
    ['funk', { principlesIn: 1, physDrop: 0.8 }, { springChain: 1, hangRope: 0.8 }, { physKnock: 1 }],
    ['latin', { principlesIn: 0.8 }, { springChain: 0.8, flagWave: 0.8 }, { physKnock: 0.6 }],
    ['rock', { physDrop: 1 }, { hangRope: 0.6 }, { physFall: 1, physKnock: 0.8 }], ['punk', { physDrop: 1.2 }, {}, { physFall: 1.2, physKnock: 1 }],
    ['hiphop', { physDrop: 0.8 }, { hangRope: 0.6 }, { physKnock: 0.8 }], ['vj', { flockIn: 1, particleMorph: 1 }, { magnetField: 1, ikArm: 1 }, { vortexOut: 1.2, particleBurst: 1 }],
    ['psyche', { flockIn: 0.8, particleMorph: 0.8 }, { magnetField: 1, ikArm: 0.8 }, { vortexOut: 1.5 }], ['edm', { particleForm: 0.8, particleMorph: 0.8 }, { magnetField: 0.6 }, { vortexOut: 1, particleBurst: 0.8 }],
    ['techno', { flockIn: 0.6 }, { ikArm: 0.8, magnetField: 0.6 }, { vortexOut: 0.8, particleBurst: 0.6 }], ['horror', { particleForm: 0.6 }, { hangRope: 1, brownian: 0.8 }, { particleBurst: 1, vortexOut: 0.8 }],
    ['showreel', { principlesIn: 0.8, flockIn: 0.6 }, { springChain: 0.6 }, { physKnock: 0.6, vortexOut: 0.6 }], ['experimental', { flockIn: 1, particleMorph: 1 }, { ikArm: 1, magnetField: 1 }, { vortexOut: 1, particleBurst: 1 }],
  ].forEach(([id, e, h, x]) => { addTo(id, 'enter', e); addTo(id, 'hold', h); addTo(id, 'exit', x); });
})();
