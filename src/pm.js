/* Motion pack inspired by techniques described on prompt-motion.com (prompts only; no code copied):
 * typing with a caret, accordion squeeze into a period, scroll-settle with vertical smear, a heavy word landing
 * so the line below bends, count-up numbers, zoom smear, melt into a droplet, text turning into a UI pill,
 * frosted-glass text, pixel / ASCII screens, morphing UI card, orbit-lock squares, grid unfold, 3D carousel,
 * window parallax, paint strokes, rising liquid, self-drawing chart, dot ripples, ring escape, beat bounce,
 * dot → pill accent, cursor actor, frame break, iris blades, stepped zoom / floating one-take cameras. */
'use strict';
(() => {
  const { clamp, lerp, hash, mix, rgba } = LM.U;
  const E = LM.E, M = LM.motion, BG = LM.bgm.lib, FX = LM.fx, G = LM.gfx.lib, TR = LM.trans.lib, D = LM.data, MS = LM.MS;
  const PI = Math.PI, TAU = PI * 2;
  const A = (p, k = 3) => Math.min(1, Math.max(0, p) * k);
  const wrap = (v, m) => ((v % m) + m) % m;
  const lastG = (c) => (c.gl && c.gl.length ? c.gl[c.gl.length - 1] : { x: c.cx, y: c.cy });
  const heavy = (g, c) => { const gl = c.gl || []; const any = gl.some((q) => q.emph || q.key); return any ? !!(g.emph || g.key) : (g.line || 0) === 0 && gl.some((q) => (q.line || 0) > 0); };
  const spr = MS ? MS.spring(240, 16, 1) : E.outBack;
  const isDigit = (ch) => /[0-9０-９]/.test(ch);

  /* ================= text motions ================= */
  Object.assign(M.enter, {
    typeHuman: { n: 'タイプ入力（カーソル付き）', c: '文字送り', d: 0.2, wt: 'char', st: 0, f: (p) => ({ vis: p > 0, caret: p > 0 && p < 1 ? 1 : 0, sy: p > 0 && p < 0.3 ? 1.12 : 1 }) },
    accordionIn: { n: 'アコーディオン（ピリオドから広がる）', c: 'ウェイト', d: 0.75, st: 0, u: 'a', f: (p, g, c) => { const q = spr(p), L = lastG(c); return { x: (L.x - g.x) * (1 - q), sx: Math.max(0.02, q), a: g === L ? 1 : A(p, 4) }; } },
    scrollSettle: { n: 'スクロールして減速しながら止まる', c: 'スライド', d: 0.75, st: 0, u: 'a', f: (p, g, c) => { const k = 1 - E.outExpo(p); return { y: c.H * 0.75 * k, sy: 1 + k * 1.8, a: A(p, 3) }; } },
    heavyLand: { n: '重い言葉が落ちて下の行がたわむ', c: '重力', d: 1.1, st: 0, u: 'a', f: (p, g, c) => {
      const land = 0.5;
      if (heavy(g, c)) { if (p < land) { const q = E.inCubic(p / land); return { y: -(1 - q) * c.H * 0.6, rot: (1 - q) * (g.r1 > 0.5 ? 1 : -1) * PI / 2, a: A(p, 6) }; } return {}; }
      const dt = clamp((p - land) / (1 - land)), k = p < land ? 0 : Math.exp(-5 * dt) * Math.cos(dt * 13) * (1 - dt);
      return { sy: 1 - 0.22 * k, sx: 1 + 0.1 * k, y: g.size * 0.12 * k, a: A(p, 6) };
    } },
    countUp: { n: '数字がカウントアップ', c: 'デジタル', d: 1.0, st: 0, u: 'a', f: (p, g) => {
      if (isDigit(g.ch)) { if (p >= 0.92) return {}; const k = Math.floor(p * 26 + Math.pow(p, 3) * 10); return { ch: String(Math.floor(hash(g.i, k, 3) * 10)), a: A(p, 8) }; }
      return { a: A(p, 2), y: (1 - E.outCubic(p)) * g.size * 0.3 };
    } },
    zoomSmearIn: { n: 'ズームスミアで登場', c: 'ズーム', d: 0.55, st: 0, u: 'a', f: (p, g, c) => { const q = E.outExpo(p); const T = M.gsc({}, g, c, lerp(1.7, 1, q)); T.zsm = (1 - q); T.a = A(p, 4); return T; } },
  });
  Object.assign(M.exit, {
    accordionOut: { n: 'アコーディオン（ピリオドへ吸い込まれる）', c: 'ウェイト', d: 0.6, st: 0, u: 'a', f: (p, g, c) => { const q = E.inCubic(p), L = lastG(c); return g === L ? { a: 1 - clamp((p - 0.85) / 0.15) } : { x: (L.x - g.x) * q, sx: Math.max(0.02, 1 - q), a: 1 - clamp((p - 0.7) / 0.3) }; } },
    scrollAway: { n: 'スクロールして流れ去る', c: 'スライド', d: 0.55, st: 0, u: 'a', f: (p, g, c) => { const k = E.inExpo(p); return { y: -c.H * 0.8 * k, sy: 1 + k * 1.8, a: 1 - clamp((p - 0.6) / 0.4) }; } },
    meltDot: { n: 'しずくのように丸く溶ける', c: '変形', d: 0.8, st: 0, u: 'a', f: (p, g, c) => { const q = E.inOutCubic(p); return { x: (c.cx - g.x) * q, y: (c.cy - g.y) * q, sx: lerp(1, 0.25, q), sy: lerp(1, 0.25, q), blur: q * g.size * 0.25, dot: clamp((p - 0.35) / 0.4), a: 1 - clamp((p - 0.85) / 0.15) }; } },
    zoomSmearOut: { n: 'ズームスミアで抜ける', c: 'ズーム', d: 0.5, st: 0, u: 'a', f: (p, g, c) => { const q = E.inExpo(p); const T = M.gsc({}, g, c, lerp(1, 2.2, q)); T.zsm = q; T.a = 1 - E.inQuad(p); return T; } },
    pillOut: { n: '帯（ピル）に変形して消える', c: '変形', d: 0.75, st: 0, u: 'a', f: (p, g, c) => {
      if (p < 0.45) { const q = E.outCubic(p / 0.45); return { pillH: q, fillA: 1 - q, textA: 1 - q }; }
      const q = E.inCubic((p - 0.45) / 0.55); return { pillH: 1, textA: 0, x: (c.cx - g.x) * q, sx: Math.max(0.02, 1 - q * 0.97), a: 1 - clamp((q - 0.85) / 0.15) };
    } },
  });
  Object.assign(M.hold, {
    caretBlink: { n: '最後の文字の後でカーソルが点滅', c: '文字送り', f: (ht, g, c) => (g === lastG(c) && Math.floor((c.tAbs || ht) * 2) % 2 === 0 ? { caret: 1 } : {}) },
  });

  /* ================= text decoration & screen effects ================= */
  Object.assign(FX.list, {
    glassText: { n: 'ガラス文字（すりガラス風）', c: 'text', k: 'glyph' },
    pixelArt: { n: 'ドット絵化（低解像度）', c: 'screen', k: 'post' },
    asciiArt: { n: 'ASCIIアート化', c: 'screen', k: 'post' },
  });

  /* ================= background motions ================= */
  const def = (id, n, c, f, full) => (BG[id] = { n, c, f, full: !!full });
  const rrect = (ctx, x, y, w, h, r) => { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const beatPos = (R) => R.t * ((R.bpm || 120) / 60);
  def('morphCard', '形を変えるカード（ビートで角丸・大きさ・色が変形）', '図形', (ctx, R) => {
    const b = beatPos(R), k = Math.floor(b), f = b - k, q = spr(clamp(f / 0.6));
    const st = (i) => ({ w: 0.25 + hash(i, 1) * 0.5, h: 0.18 + hash(i, 2) * 0.45, r: hash(i, 3), c: i % 3 });
    const A2 = st(k - 1), B2 = st(k), w = lerp(A2.w, B2.w, q) * R.W, h = lerp(A2.h, B2.h, q) * R.H, r = lerp(A2.r, B2.r, q) * Math.min(w, h) * 0.5;
    const cols = [R.pal.accent, R.pal.sub, mix(R.pal.accent, R.pal.sub, 0.5)];
    ctx.globalAlpha = 0.5 * Math.min(1, R.amt); ctx.fillStyle = mix(cols[A2.c], cols[B2.c], q); rrect(ctx, (R.W - w) / 2, (R.H - h) / 2, w, h, r); ctx.fill();
  });
  def('orbitLock', '四角が回り込んで十字にロック', '図形', (ctx, R) => {
    const cyc = (R.t % 4) / 4, q = 1 - Math.exp(-6 * Math.min(cyc, 0.75) / 0.75), rel = clamp((cyc - 0.85) / 0.15);
    const cx = R.W / 2, cy = R.H / 2, r0 = R.minD * 0.42, r1 = R.minD * 0.16, s = R.minD * 0.07;
    for (let i = 0; i < 4; i++) {
      const a = i * PI / 2 - (1 - q) * PI * 3, r = lerp(r0, r1, q) + rel * R.minD * 0.5;
      ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.rotate(a + (1 - q) * PI); ctx.globalAlpha = 0.6 * (1 - rel) * Math.min(1, R.amt);
      ctx.fillStyle = i % 2 ? R.pal.accent : R.pal.sub; ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore();
    }
  });
  def('gridUnfold', 'グリッドが地図のように展開して畳まれる', '図形', (ctx, R) => {
    const cols = R.W > R.H ? 8 : 5, rows = R.W > R.H ? 5 : 8, cw = R.W / cols, ch = R.H / rows, cyc = (R.t % 4) / 4;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const d = (Math.abs(x - (cols - 1) / 2) + Math.abs(y - (rows - 1) / 2)) / (cols + rows) * 0.8;
      const open = E.outCubic(clamp((cyc - d * 0.5) / 0.25)), close = E.inCubic(clamp((cyc - 0.6 - d * 0.4) / 0.25)), k = open * (1 - close);
      if (k <= 0.01) continue;
      ctx.globalAlpha = 0.28 * Math.min(1, R.amt) * (0.6 + 0.4 * hash(x, y)); ctx.fillStyle = (x + y) % 2 ? R.pal.sub : R.pal.accent;
      ctx.fillRect(x * cw + cw * 0.06, y * ch + ch * (0.5 - k / 2) + ch * 0.06, cw * 0.88, ch * 0.88 * k);
    }
  });
  def('cardCarousel', '3Dカルーセル（床に反射するカード）', '図形', (ctx, R) => {
    const n = 8, cx = R.W / 2, cy = R.H * 0.46, rad = R.W * 0.36, cw = R.minD * 0.24, chh = cw * 1.3, rot = R.t * 0.5;
    const items = []; for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; items.push({ i, z: Math.cos(a), x: Math.sin(a) }); }
    items.sort((p, q) => p.z - q.z).forEach(({ i, z, x }) => {
      const s = 0.55 + 0.45 * (z + 1) / 2, w = cw * s * Math.max(0.15, Math.abs(Math.cos(Math.asin(clamp(x, -1, 1)) * 0.6))), h = chh * s, px = cx + x * rad, a = (0.15 + 0.4 * (z + 1) / 2) * Math.min(1, R.amt);
      ctx.globalAlpha = a; ctx.fillStyle = i % 2 ? R.pal.accent : R.pal.sub; rrect(ctx, px - w / 2, cy - h / 2, w, h, w * 0.1); ctx.fill();
      const g = ctx.createLinearGradient(0, cy + h / 2, 0, cy + h); g.addColorStop(0, rgba(i % 2 ? R.pal.accent : R.pal.sub, 0.5)); g.addColorStop(1, rgba(R.pal.bg, 0));
      ctx.globalAlpha = a * 0.6; ctx.fillStyle = g; rrect(ctx, px - w / 2, cy + h / 2 + R.S * 6, w, h * 0.5, w * 0.1); ctx.fill();
    });
  });
  def('windowParallax', '窓の外を流れる景色（パララックス）', '自然', (ctx, R) => {
    const g = ctx.createLinearGradient(0, 0, 0, R.H); g.addColorStop(0, mix(R.pal.sub, '#ffffff', 0.35)); g.addColorStop(1, mix(R.pal.bg, R.pal.accent, 0.25)); ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H);
    const layers = [[0.55, 0.12, 0.25], [0.65, 0.3, 0.45], [0.78, 0.7, 0.7]];
    layers.forEach(([base, sp, a], li) => {
      ctx.globalAlpha = a; ctx.fillStyle = mix(R.pal.accent, R.pal.bg, 0.25 + li * 0.25);
      ctx.beginPath(); ctx.moveTo(0, R.H);
      for (let x = 0; x <= R.W; x += R.W / 60) { const u = (x + R.t * R.W * sp * 0.3) / R.W; ctx.lineTo(x, R.H * (base - 0.08 * Math.sin(u * 5 + li) - 0.05 * Math.sin(u * 13 + li * 3))); }
      ctx.lineTo(R.W, R.H); ctx.fill();
    });
    ctx.globalAlpha = 0.85; ctx.fillStyle = mix(R.pal.bg, '#000000', 0.3); const m = R.minD * 0.06, br = R.minD * 0.05;
    ctx.beginPath(); ctx.rect(0, 0, R.W, R.H); rrect(ctx, m, m, R.W - m * 2, R.H - m * 2, br); ctx.fill('evenodd');
  }, true);
  def('paintStrokes', '筆のストロークが描かれていく', '模様', (ctx, R) => {
    const cyc = Math.floor(R.t / 3), f = (R.t % 3) / 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 5; i++) {
      const y0 = R.H * (0.15 + hash(cyc, i, 1) * 0.7), w = R.minD * (0.04 + hash(cyc, i, 2) * 0.08), pts = 7, L = R.W * 1.3, prog = E.outCubic(clamp((f - i * 0.08) / 0.5));
      ctx.beginPath(); for (let k = 0; k <= pts; k++) { const x = -R.W * 0.15 + (L * k) / pts, y = y0 + Math.sin(k * 1.3 + i) * R.H * 0.06; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.setLineDash([L * 1.4, L * 1.4]); ctx.lineDashOffset = L * 1.4 * (1 - prog); ctx.lineWidth = w; ctx.strokeStyle = i % 2 ? R.pal.accent : R.pal.sub;
      ctx.globalAlpha = 0.35 * Math.min(1, R.amt) * (1 - clamp((f - 0.85) / 0.15)); ctx.stroke();
    }
    ctx.setLineDash([]);
  });
  def('liquidRise', '液体が拍ごとに満ちていく', '水', (ctx, R) => {
    const steps = 8, b = beatPos(R), k = Math.floor(b) % steps, f = spr(clamp((b - Math.floor(b)) / 0.5)), lvl = (k + f) / steps;
    for (let i = 0; i <= k; i++) {
      const top = R.H * (1 - Math.min(lvl, (i + 1) / steps)), bot = R.H * (1 - i / steps);
      ctx.globalAlpha = 0.25 * Math.min(1, R.amt); ctx.fillStyle = i % 2 ? R.pal.accent : R.pal.sub;
      ctx.beginPath(); ctx.moveTo(0, bot); for (let x = 0; x <= R.W; x += R.W / 40) ctx.lineTo(x, top + Math.sin(x / R.W * 8 + R.t * 3 + i) * R.S * 6); ctx.lineTo(R.W, bot); ctx.fill();
    }
  });
  def('lineChart', '折れ線グラフが描かれていく', 'デジタル', (ctx, R) => {
    const cyc = Math.floor(R.t / 4), f = (R.t % 4) / 4, n = 14, x0 = R.W * 0.08, x1 = R.W * 0.92, yb = R.H * 0.82, yt = R.H * 0.18;
    ctx.globalAlpha = 0.18; ctx.strokeStyle = R.pal.text; ctx.lineWidth = R.S; for (let i = 0; i <= 4; i++) { const y = lerp(yb, yt, i / 4); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
    const P = []; let v = 0.2; for (let i = 0; i < n; i++) { v = clamp(v + (hash(cyc, i) - 0.38) * 0.25, 0.05, 0.98); P.push([lerp(x0, x1, i / (n - 1)), lerp(yb, yt, v)]); }
    const prog = E.inOutCubic(clamp(f / 0.7)) * (n - 1), m = Math.floor(prog);
    ctx.globalAlpha = 0.7 * Math.min(1, R.amt); ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 4; ctx.lineJoin = 'round'; ctx.beginPath();
    for (let i = 0; i <= m && i < n; i++) i ? ctx.lineTo(P[i][0], P[i][1]) : ctx.moveTo(P[i][0], P[i][1]);
    if (m < n - 1) { const fr = prog - m; ctx.lineTo(lerp(P[m][0], P[m + 1][0], fr), lerp(P[m][1], P[m + 1][1], fr)); }
    ctx.stroke(); ctx.fillStyle = R.pal.accent; for (let i = 0; i <= m && i < n; i++) { ctx.beginPath(); ctx.arc(P[i][0], P[i][1], R.S * 5, 0, TAU); ctx.fill(); }
  });
  def('dotRipple', 'ドットの波紋（ビートで広がる）', '模様', (ctx, R) => {
    const g = R.minD / 16, b = beatPos(R), k = Math.floor(b), f = b - k, ox = R.W * (0.2 + hash(k, 1) * 0.6), oy = R.H * (0.2 + hash(k, 2) * 0.6), wave = f * Math.hypot(R.W, R.H) * 0.8;
    ctx.fillStyle = R.pal.sub;
    for (let y = g / 2; y < R.H; y += g) for (let x = g / 2; x < R.W; x += g) {
      const d = Math.hypot(x - ox, y - oy), e = Math.exp(-Math.pow((d - wave) / (g * 2.5), 2)) * (1 - f);
      ctx.globalAlpha = (0.12 + e * 0.6) * Math.min(1, R.amt); ctx.beginPath(); ctx.arc(x, y, R.S * (2 + e * 6), 0, TAU); ctx.fill();
    }
  });
  def('ringEscape', '回転する輪と跳ねるボール', '図形', (ctx, R) => {
    const cx = R.W / 2, cy = R.H / 2, n = 7, gap = 0.7;
    for (let i = 0; i < n; i++) {
      const r = R.minD * (0.1 + i * 0.055), a = R.t * (0.6 + i * 0.15) * (i % 2 ? 1 : -1);
      ctx.globalAlpha = 0.45 * Math.min(1, R.amt); ctx.strokeStyle = i % 2 ? R.pal.accent : R.pal.sub; ctx.lineWidth = R.S * 4; ctx.beginPath(); ctx.arc(cx, cy, r, a + gap / 2, a + TAU - gap / 2); ctx.stroke();
    }
    const bt = beatPos(R), ph = bt - Math.floor(bt), ang = Math.floor(bt) * 2.4, rr = R.minD * 0.1 * (1 - 4 * (ph - 0.5) * (ph - 0.5)) + R.S * 10;
    ctx.globalAlpha = 0.9; ctx.fillStyle = R.pal.text; ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, R.S * 10, 0, TAU); ctx.fill();
  });
  def('beatBounce', 'ビートで跳ねて、当たったブロックが光る', '図形', (ctx, R) => {
    const n = 6, bw = R.W / n, by = R.H * 0.78, b = beatPos(R), k = Math.floor(b), f = b - k, i0 = k % n, i1 = (k + 1) % n;
    for (let i = 0; i < n; i++) { const lit = i === i0 ? Math.exp(-f * 5) : 0; ctx.globalAlpha = (0.2 + lit * 0.7) * Math.min(1, R.amt); ctx.fillStyle = lit > 0.05 ? R.pal.accent : R.pal.sub; rrect(ctx, i * bw + bw * 0.12, by, bw * 0.76, R.H * 0.05, R.S * 6); ctx.fill(); }
    const x = lerp(i0 * bw + bw / 2, i1 * bw + bw / 2, f), y = by - R.S * 14 - Math.sin(f * PI) * R.H * 0.35, sq = f < 0.06 ? 0.7 : 1;
    ctx.globalAlpha = 0.9; ctx.fillStyle = R.pal.text; ctx.save(); ctx.translate(x, y); ctx.scale(1 / sq, sq); ctx.beginPath(); ctx.arc(0, 0, R.S * 14, 0, TAU); ctx.fill(); ctx.restore();
  });

  /* ================= accent graphics ================= */
  const gdef = (id, n, c, f, top) => (G[id] = { n, c, f, top: !!top });
  const fadeX = (R) => 1 - E.inQuad(R.x || 0);
  gdef('dotPill', 'ドットが伸びてピルになる（背面）', 'シェイプ', (ctx, R) => {
    const b = R.bb, e = R.e || 0, a = fadeX(R), h = b.h * 1.25, wFull = b.w + b.h * 0.9;
    const s1 = E.outBack(clamp(e / 0.25)), s2 = spr(clamp((e - 0.2) / 0.5)), w = lerp(h * s1, wFull, s2);
    ctx.globalAlpha = 0.9 * a; ctx.fillStyle = R.pal.accent; rrect(ctx, b.cx - w / 2, b.cy - (h * s1) / 2, w, h * s1, (h * s1) / 2); ctx.fill();
  });
  gdef('cursorClick', 'カーソルが来てクリックする', 'UI', (ctx, R) => {
    const b = R.bb, e = R.e || 0, a = fadeX(R), q = E.inOutCubic(clamp(e / 0.55)), tx = b.x + b.w * 0.82, ty = b.y + b.h * 0.85;
    const x = lerp(R.W * 0.95, tx, q), y = lerp(R.H * 1.05, ty, q), click = clamp((e - 0.55) / 0.2), s = R.S * 1.6 * (click > 0 && click < 1 ? 1 - Math.sin(click * PI) * 0.18 : 1);
    if (click > 0) { ctx.globalAlpha = (1 - click) * 0.6 * a; ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 3; ctx.beginPath(); ctx.arc(tx, ty, R.S * (8 + click * 40), 0, TAU); ctx.stroke(); }
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = a; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#111111'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.lineTo(6, 17); ctx.lineTo(10, 26); ctx.lineTo(14, 24); ctx.lineTo(10, 15); ctx.lineTo(17, 15); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }, true);
  gdef('frameBreak', '枠を突き破る', 'フレーム', (ctx, R) => {
    const b = R.bb, e = R.e || 0, a = fadeX(R), pad = b.h * 0.25, brk = clamp((e - 0.45) / 0.4);
    const x0 = b.x - pad, y0 = b.y - pad, w = b.w + pad * 2, h = b.h + pad * 2, draw = E.outCubic(clamp(e / 0.4));
    ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 5; ctx.lineCap = 'square';
    const sides = [[x0, y0, x0 + w, y0], [x0 + w, y0, x0 + w, y0 + h], [x0 + w, y0 + h, x0, y0 + h], [x0, y0 + h, x0, y0]];
    sides.forEach(([ax, ay, bx, by], i) => {
      for (let k = 0; k < 3; k++) {
        const t0 = k / 3, t1 = (k + 1) / 3, mx = lerp(ax, bx, (t0 + t1) / 2), my = lerp(ay, by, (t0 + t1) / 2), dx = (mx - b.cx) * brk * 0.9, dy = (my - b.cy) * brk * 0.9 + brk * brk * R.H * 0.3;
        ctx.save(); ctx.globalAlpha = a * (1 - brk * 0.9); ctx.translate(mx + dx, my + dy); ctx.rotate(brk * (hash(i, k) - 0.5) * 3);
        const lx = (bx - ax) * (t1 - t0) / 2 * Math.min(1, draw * 3 - i * 0.5), ly = (by - ay) * (t1 - t0) / 2 * Math.min(1, draw * 3 - i * 0.5);
        if (draw * 3 - i * 0.5 > 0) { ctx.beginPath(); ctx.moveTo(-lx, -ly); ctx.lineTo(lx, ly); ctx.stroke(); }
        ctx.restore();
      }
    });
  }, true);

  /* ================= transitions ================= */
  TR.irisBlades = { n: '絞り羽根（6枚の羽根が閉じて開く）', c: 'カバー', kind: 'cover', f(ctx, u, R) {
    const k = u < 0.5 ? E.inOutCubic(u * 2) : 1 - E.inOutCubic((u - 0.5) * 2); if (k <= 0.001) return;
    const cx = R.W / 2, cy = R.H / 2, D = Math.hypot(R.W, R.H), n = 6, open = (1 - k) * D * 0.55;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + k * 0.9; ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      ctx.fillStyle = i % 2 ? (R.pal.accent) : mix(R.pal.accent, R.pal.bg, 0.25);
      ctx.beginPath(); ctx.moveTo(open, -D); ctx.lineTo(open + D * 2, -D); ctx.lineTo(open + D * 2, D); ctx.lineTo(open - Math.tan(PI / n) * D * 0.2, D * 0.2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
  } };

  /* ================= cameras ================= */
  D.cameras.zoomStep = '拍ごとに段階ズーム';
  D.cameras.float = 'ふわっと漂う（ワンテイク）';

  /* ================= theme pools ================= */
  const add = (id, k, o) => { const t = D.themeById[id]; if (t) t[k] = Object.assign({}, t[k] || {}, o); };
  add('minimal', 'enter', { typeHuman: 1, accordionIn: 1.2, scrollSettle: 1 }); add('minimal', 'exit', { accordionOut: 1.2, pillOut: 0.8 }); add('minimal', 'hold', { caretBlink: 0.6 }); add('minimal', 'bgm', { morphCard: 1, lineChart: 0.8 });
  add('showreel', 'enter', { scrollSettle: 1.2, zoomSmearIn: 1, heavyLand: 1, accordionIn: 1 }); add('showreel', 'exit', { zoomSmearOut: 1, pillOut: 1, scrollAway: 1 }); add('showreel', 'bgm', { morphCard: 1.5, orbitLock: 1.2, gridUnfold: 1, cardCarousel: 1 }); add('showreel', 'gx', { dotPill: 1.2, cursorClick: 0.8, frameBreak: 0.8 }); add('showreel', 'tr', { irisBlades: 1 });
  add('edm', 'enter', { zoomSmearIn: 1.2 }); add('edm', 'exit', { zoomSmearOut: 1.2 }); add('edm', 'bgm', { dotRipple: 1, ringEscape: 1, beatBounce: 0.8 }); add('edm', 'filters', { pixelArt: 0.5 });
  add('hiphop', 'enter', { heavyLand: 1.2, countUp: 0.6 }); add('hiphop', 'gx', { frameBreak: 1 });
  add('jpop', 'bgm', { beatBounce: 1, dotRipple: 0.8, liquidRise: 0.8 }); add('jpop', 'gx', { dotPill: 1 }); add('jpop', 'exit', { meltDot: 0.8 });
  add('citypop', 'bgm', { windowParallax: 1.2, cardCarousel: 0.8 }); add('citypop', 'enter', { scrollSettle: 1 }); add('citypop', 'tr', { irisBlades: 1 });
  add('lofi', 'bgm', { windowParallax: 1.2, paintStrokes: 1 }); add('lofi', 'enter', { typeHuman: 1 }); add('lofi', 'hold', { caretBlink: 0.8 }); add('lofi', 'filters', { pixelArt: 0.6 });
  add('acoustic', 'bgm', { paintStrokes: 1, windowParallax: 0.8 }); add('ballad', 'bgm', { paintStrokes: 0.8 }); add('ballad', 'exit', { meltDot: 0.8 });
  add('vocaloid', 'filters', { asciiArt: 0.6 }); add('vocaloid', 'enter', { countUp: 0.8 }); add('vocaloid', 'bgm', { ringEscape: 1 });
  add('edge', 'filters', { asciiArt: 0.8 }); add('edge', 'bgm', { gridUnfold: 1, lineChart: 0.8 }); add('thermalvj', 'filters', { asciiArt: 0.6 });
  add('cinematic', 'enter', { scrollSettle: 0.8 }); add('dream', 'exit', { meltDot: 1 }); add('dream', 'filters', { glassText: 1 }); add('ambient', 'filters', { glassText: 0.8 });
  add('anison', 'enter', { heavyLand: 1 }); add('anison', 'gx', { frameBreak: 1 }); add('rock', 'enter', { heavyLand: 0.8 }); add('metal', 'gx', { frameBreak: 1 });
})();
