/* Quality pass on hand-made / liquid transitions and accents: drip, splash, colour burst, ink, marker scribble,
 * torn paper, melt, paint splat and the script swash. Same ids, so existing projects pick up the new look. */
'use strict';
(() => {
  const { clamp, lerp, hash, mix, rgba, noise1 } = LM.U;
  const E = LM.E, TR = LM.trans.lib, G = LM.gfx.lib;
  const PI = Math.PI, TAU = PI * 2;
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const inOut = (u) => (u < 0.5 ? E.inOutCubic(u * 2) : 1 - E.inOutCubic((u - 0.5) * 2));
  const setF = (lib, id, f) => { if (lib[id]) lib[id].f = f; };

  /* organic blob outline: base radius with low + high frequency wobble and optional spikes ending in droplets */
  function blobPath(ctx, cx, cy, r, seed, o) {
    o = o || {}; const n = 96, spikes = o.spikes || 0, sx = o.sx || 1, sy = o.sy || 1;
    const sp = []; for (let k = 0; k < spikes; k++) sp.push({ a: hash(seed, k, 31) * TAU, w: 0.05 + hash(seed, k, 32) * 0.07, l: 0.25 + hash(seed, k, 33) * 0.6 });
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      let rr = r * (0.86 + 0.09 * noise1(a * 1.6 + seed, seed) + 0.05 * noise1(a * 6.3 + seed * 3, seed + 1));
      for (const s of sp) { let d = Math.abs(((a - s.a + PI) % TAU + TAU) % TAU - PI); if (d < s.w * 2.2) rr += r * s.l * Math.pow(Math.max(0, 1 - d / (s.w * 2.2)), 2.4) * (o.grow == null ? 1 : o.grow); }
      const x = cx + Math.cos(a) * rr * sx, y = cy + Math.sin(a) * rr * sy;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    return sp;
  }
  // wet paint shading for a filled path already set as the current path: darker rim, light sheen from the upper left
  function paintShade(ctx, cx, cy, r, col) {
    ctx.save(); ctx.clip();
    let g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r * 1.3);
    g.addColorStop(0, 'rgba(255,255,255,0.32)'); g.addColorStop(0.3, 'rgba(255,255,255,0.08)'); g.addColorStop(0.8, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = g; ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
    ctx.restore();
    ctx.strokeStyle = mix(col, '#000000', 0.18); ctx.globalAlpha *= 0.4; ctx.lineWidth = Math.max(1, r * 0.012); ctx.stroke(); ctx.globalAlpha /= 0.55;
  }

  /* ---------- liquid drip: thick paint slides down with long drips and heavy bulbous tips, then drains off ---------- */
  setF(TR, 'liquidDrip', (ctx, u, R) => {
    const W = R.W, H = R.H, a = clamp(u * 2.05), b = clamp((u - 0.5) * 2.05);
    const layers = [{ col: mix(R.pal.accent, '#000000', 0.22), lag: 0.0, seed: 3 }, { col: R.pal.accent, lag: 0.07, seed: 7 }];
    for (const Ly of layers) {
      const pa = E.inOutCubic(clamp((a - Ly.lag) / (1 - Ly.lag))), pb = E.inCubic(clamp((b - Ly.lag * 0.5) / (1 - Ly.lag * 0.5)));
      if (pa <= 0 || pb >= 1) continue;
      const base = lerp(-0.25, 1.08, pa) * H, top = pb * H * 1.5 - H * 0.02, n = 14, cw = W / n;
      const edgeY = (x) => base + Math.sin(x / W * 9 + Ly.seed) * H * 0.012 + Math.sin(x / W * 23 + Ly.seed * 2) * H * 0.005;
      ctx.fillStyle = Ly.col; ctx.beginPath(); ctx.moveTo(-2, top); ctx.lineTo(W + 2, top);
      for (let x = W; x >= -2; x -= W / 80) ctx.lineTo(x, Math.max(top, edgeY(x)));
      ctx.closePath(); ctx.fill();
      // drips hang from the edge: neck with fillets, heavy rounded tip; length grows with a staggered delay
      const drips = [];
      for (let i = 0; i < n; i++) {
        if (hash(i, Ly.seed, 1) < 0.25) continue;
        const x = (i + 0.2 + hash(i, Ly.seed, 2) * 0.6) * cw, w = cw * (0.28 + hash(i, Ly.seed, 3) * 0.32), d = hash(i, Ly.seed, 4) * 0.3;
        const grow = E.outCubic(clamp((pa - d) / 0.7)), len = H * (0.06 + 0.32 * Math.pow(hash(i, Ly.seed, 5), 1.6)) * grow, ey = edgeY(x);
        if (len < 2) continue;
        const tip = ey + len, nr = w * 0.3, br = w * 0.42;
        ctx.beginPath(); ctx.moveTo(x - w, ey - 1); ctx.quadraticCurveTo(x - nr, ey, x - nr, ey + w * 0.8); ctx.lineTo(x - nr * 0.9, tip - br);
        ctx.arc(x, tip, br, PI + 0.6, -0.6 + TAU, true); ctx.lineTo(x + nr, ey + w * 0.8); ctx.quadraticCurveTo(x + nr, ey, x + w, ey - 1); ctx.closePath();
        ctx.save(); ctx.translate(0, 0); ctx.fill(); ctx.restore(); ctx.beginPath(); ctx.arc(x, tip, br, 0, TAU); ctx.fill();
        drips.push({ x, ey, tip, nr, br });
      }
      // gloss: sheen band along the edge, highlight streak down each drip and a specular dot on the tip
      ctx.save(); ctx.globalCompositeOperation = 'source-atop';
      const sg = ctx.createLinearGradient(0, base - H * 0.08, 0, base + H * 0.02); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.7, 'rgba(255,255,255,0.16)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, base - H * 0.08, W, H * 0.1);
      ctx.restore();
      ctx.save(); ctx.lineCap = 'round';
      for (const d of drips) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, d.nr * 0.35); ctx.beginPath(); ctx.moveTo(d.x - d.nr * 0.45, d.ey + d.nr * 2); ctx.lineTo(d.x - d.nr * 0.45, d.tip - d.br * 0.6); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(d.x - d.br * 0.35, d.tip - d.br * 0.3, d.br * 0.22, d.br * 0.15, -0.6, 0, TAU); ctx.fill();
        ctx.strokeStyle = mix(Ly.col, '#000000', 0.3); ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(1, d.br * 0.08); ctx.beginPath(); ctx.arc(d.x, d.tip, d.br, 0.2, PI - 0.2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  });

  /* ---------- splash: paint splats burst open with spikes and droplets until they cover, then contract ---------- */
  setF(TR, 'splashFill', (ctx, u, R) => {
    const D = Math.hypot(R.W, R.H), cols = [R.pal.accent, mix(R.pal.accent, '#ffffff', 0.22), mix(R.pal.accent, R.pal.sub, 0.25)];
    const k = u < 0.5 ? E.outCubic(clamp(u * 2.1)) : 1 - E.inCubic(clamp((u - 0.5) * 2.1));
    if (k <= 0.001) return;
    if (k > 0.985) { ctx.fillStyle = R.pal.accent; ctx.fillRect(0, 0, R.W, R.H); }
    for (let i = 0; i < 8; i++) {
      const d = hash(i, 1, 11) * 0.35, s = clamp((k - d * (u < 0.5 ? 1 : 0.4)) / (1 - d * 0.5)); if (s <= 0) continue;
      const cx = (0.1 + hash(i, 2, 11) * 0.8) * R.W, cy = (0.1 + hash(i, 3, 11) * 0.8) * R.H, r = D * (0.2 + hash(i, 4, 11) * 0.22) * E.outBack(s) * (i < 3 ? 1.25 : 1), col = cols[i % 3];
      ctx.fillStyle = col; const sp = blobPath(ctx, cx, cy, r, i * 7 + 1, { spikes: 7, grow: s }); ctx.fill(); paintShade(ctx, cx, cy, r, col);
      // droplets thrown past the spikes
      ctx.fillStyle = col;
      sp.forEach((p, j) => { const dd = r * (1 + p.l * 1.15 + 0.12), rr = r * (0.025 + hash(i, j, 12) * 0.035) * s; ctx.beginPath(); ctx.ellipse(cx + Math.cos(p.a) * dd, cy + Math.sin(p.a) * dd, rr * 1.3, rr, p.a, 0, TAU); ctx.fill(); });
      for (let j = 0; j < 10; j++) { const a2 = hash(i, j, 13) * TAU, dd = r * (1.15 + hash(i, j, 14) * 0.6) * s, rr = r * 0.012 * (1 + hash(i, j, 15) * 2); ctx.beginPath(); ctx.arc(cx + Math.cos(a2) * dd, cy + Math.sin(a2) * dd, rr, 0, TAU); ctx.fill(); }
    }
  });

  /* ---------- colour burst: a powder-paint explosion — streaking particles and soft colour clouds that fill the frame ---------- */
  setF(TR, 'colorBurst', (ctx, u, R) => {
    const cols = [R.pal.accent, R.pal.sub, mix(R.pal.accent, '#ffffff', 0.35), '#ffd23f', '#ff5fa2', '#23c4ff', '#2ed47a'];
    const D = Math.hypot(R.W, R.H), cx = R.W / 2, cy = R.H / 2, k = inOut(u), out = u < 0.5 ? clamp(u * 2) : 1, fade = u < 0.5 ? 1 : 1 - clamp((u - 0.5) * 2);
    ctx.save();
    // soft clouds (layered radial gradients) expand from the centre
    for (let i = 0; i < 26; i++) {
      const d = hash(i, 1, 21) * 0.25, s = E.outCubic(clamp((out - d) / 0.75)); if (s <= 0) continue;
      const ang = hash(i, 2, 21) * TAU, dist = D * 0.42 * hash(i, 3, 21) * s, x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist + (1 - fade) * R.H * 0.15 * hash(i, 4, 21);
      const r = D * (0.14 + hash(i, 5, 21) * 0.2) * (0.3 + s * 0.9), c = cols[i % cols.length];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(c, 0.95 * fade)); g.addColorStop(0.55, rgba(c, 0.7 * fade)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // the cut itself is hidden behind a full veil of mixed colour at the peak
    if (k > 0.6) { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, D * 0.6); g.addColorStop(0, mix(R.pal.accent, '#ffffff', 0.15)); g.addColorStop(0.5, R.pal.accent); g.addColorStop(1, R.pal.sub); ctx.globalAlpha = sm(0.6, 0.97, k); ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H); ctx.globalAlpha = 1; }
    // particles with motion streaks
    ctx.lineCap = 'round';
    for (let i = 0; i < 160; i++) {
      const d = hash(i, 1, 22) * 0.15, s = E.outExpo(clamp((out - d) / 0.6)); if (s <= 0) continue;
      const ang = hash(i, 2, 22) * TAU, sp = 0.25 + hash(i, 3, 22) * 0.6, dist = D * 0.55 * sp * s, x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist + (1 - fade) * R.H * 0.2 * sp;
      const tail = D * 0.05 * sp * (1 - s * 0.7), c = cols[(i * 3) % cols.length];
      ctx.strokeStyle = c; ctx.globalAlpha = fade * (0.55 + 0.45 * hash(i, 4, 22)); ctx.lineWidth = R.S * (2 + hash(i, 5, 22) * 6);
      ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * tail, y - Math.sin(ang) * tail); ctx.lineTo(x, y); ctx.stroke();
    }
    ctx.restore();
  });

  /* ---------- ink blob: crisp ink with a feathered bleed edge, tendrils and density variation ---------- */
  (() => {
    let cv = null, cx2 = null, img = null;
    setF(TR, 'inkBlob', (ctx, u, R) => {
      const k = inOut(u), ph = u < 0.5 ? clamp(u * 2.1) : clamp((1 - u) * 2.1), ink = LM.U.lum(R.pal.text) < LM.U.lum(R.pal.bg) ? mix(R.pal.text, '#000000', 0.35) : mix(R.pal.bg, '#000000', 0.55), ic = LM.U.hex2rgb(ink), w = Math.min(420, Math.round(R.W / 3)), h = Math.max(8, Math.round((w * R.H) / R.W)), asp = R.W / R.H;
      if (k <= 0.002) return;
      if (!cv || cv.width !== w || cv.height !== h) { cv = document.createElement('canvas'); cv.width = w; cv.height = h; cx2 = cv.getContext('2d'); img = cx2.createImageData(w, h); }
      const d = img.data, fb = LM.bgm.fbm || ((x, y) => 0.5 + 0.5 * noise1(x * 3 + y * 7, 1)), ox = u < 0.5 ? 0.2 : 0.8, oy = u < 0.5 ? 0.25 : 0.75;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const x = i / w, y = j / h, wx = x * asp * 2.2, wy = y * 2.2;
        const q = fb(wx + u * 0.6, wy - u * 0.4, 4), q2 = fb(wx * 2.4 + q * 1.6, wy * 2.4 - q, 3);
        const dist = Math.hypot((x - ox) * asp, y - oy) / Math.hypot(asp, 1);
        const v = ph * 1.3 - dist - (q - 0.5) * 0.7 - (q2 - 0.5) * 0.18;
        const core = sm(0, 0.012, v), bleed = sm(-0.06, 0.0, v) * (1 - core) * 0.35, dens = 0.86 + 0.14 * q2;
        const o = (j * w + i) * 4; d[o] = ic[0] * dens; d[o + 1] = ic[1] * dens; d[o + 2] = ic[2] * dens; d[o + 3] = 255 * clamp(core + bleed);
      }
      cx2.putImageData(img, 0, 0);
      if (ph > 0.97) { ctx.fillStyle = ink; ctx.fillRect(0, 0, R.W, R.H); }
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(cv, 0, 0, R.W, R.H); ctx.restore();
    });
  })();

  /* ---------- marker scribble: real marker hatching — streaky ink, darker overlaps, pooled ends ---------- */
  setF(TR, 'scribbleFill', (ctx, u, R) => {
    const a = clamp(u * 2.05), b = clamp((u - 0.5) * 2.05), lw = R.minD * 0.15, col = R.pal.accent;
    // zig-zag hatching across the frame, bottom-left to top-right, with hand jitter
    const rows = Math.ceil((R.W + R.H) / (lw * 0.62)), pts = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, d = t * (R.W + R.H) - R.H * 0.1, jit = (s) => (hash(r, s, 41) - 0.5) * lw * 0.5;
      const p0 = [Math.max(-lw, d - R.H) + jit(1), Math.min(R.H + lw, d) + jit(2)], p1 = [Math.min(R.W + lw, d) + jit(3), Math.max(-lw, d - R.W) + jit(4)];
      if (r % 2) pts.push(p1, p0); else pts.push(p0, p1);
    }
    const N = pts.length - 1, i0 = b * N, i1 = a * N; if (i1 - i0 <= 0.01) return;
    const P = (f) => { const i = Math.min(N - 1, Math.floor(f)), t = f - i; return [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)]; };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pass = (lwk, alpha, off, c) => {
      ctx.strokeStyle = c; ctx.globalAlpha = alpha; ctx.lineWidth = lw * lwk; ctx.beginPath();
      const s0 = P(i0); ctx.moveTo(s0[0] + off, s0[1] + off);
      for (let i = Math.ceil(i0); i <= Math.floor(i1); i++) ctx.lineTo(pts[i][0] + off, pts[i][1] + off);
      const e = P(i1); ctx.lineTo(e[0] + off, e[1] + off); ctx.stroke();
    };
    pass(1, 1, 0, col);
    pass(0.32, 0.25, lw * 0.22, mix(col, '#000000', 0.35));
    pass(0.18, 0.22, -lw * 0.3, mix(col, '#ffffff', 0.4));
    // darker ink where a stroke turns (marker pools at the corners)
    ctx.fillStyle = mix(col, '#000000', 0.25); ctx.globalAlpha = 0.45;
    for (let i = Math.ceil(i0); i <= Math.floor(i1); i++) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], lw * 0.42, 0, TAU); ctx.fill(); }
    if (a >= 1 && b <= 0) { ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.fillRect(0, 0, R.W, R.H); pass(0.18, 0.18, 0, mix(col, '#000000', 0.3)); }
    ctx.restore();
  });

  /* ---------- torn paper: a fibrous rip with a white torn core, paper grain, curl shadow ---------- */
  setF(TR, 'tornPaper', (ctx, u, R) => {
    const W = R.W, H = R.H, a = E.inOutCubic(clamp(u * 2)), b = E.inOutCubic(clamp((u - 0.5) * 2));
    const lead = lerp(-0.3, 1.2, a) * W, trail = lerp(-0.3, 1.2, b) * W; if (lead <= trail) return;
    const rip = (x0, seed) => { const pts = [], n = 140; for (let i = 0; i <= n; i++) { const y = (i / n) * H; pts.push([x0 + (y / H - 0.5) * W * 0.1 + noise1(i * 0.09, seed) * W * 0.035 + noise1(i * 0.6, seed + 4) * W * 0.008 + (hash(i, seed) - 0.5) * W * 0.004, y]); } return pts; };
    const Lp = rip(lead, 3), Tp = rip(trail, 11), paper = mix(R.pal.bg === '#000000' ? '#efe8dc' : mix(R.pal.accent, '#f2ece2', 0.55), '#ffffff', 0.05);
    const sheet = () => { ctx.beginPath(); Tp.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); for (let i = Lp.length - 1; i >= 0; i--) ctx.lineTo(Lp[i][0], Lp[i][1]); ctx.closePath(); };
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = R.minD * 0.035; ctx.shadowOffsetX = R.minD * 0.01; sheet(); ctx.fillStyle = paper; ctx.fill(); ctx.restore();
    ctx.save(); sheet(); ctx.clip();
    // grain and fibres
    for (let i = 0; i < 220; i++) { const x = trail + hash(i, 1, 51) * (lead - trail), y = hash(i, 2, 51) * H; ctx.fillStyle = hash(i, 3, 51) > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, R.S * (1 + hash(i, 4, 51) * 3), R.S); }
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = R.S; for (let i = 0; i < 40; i++) { const x = trail + hash(i, 5, 51) * (lead - trail), y = hash(i, 6, 51) * H; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + R.S * 8, y + R.S * 4, x + R.S * 16, y + R.S * (hash(i, 7, 51) - 0.5) * 10); ctx.stroke(); }
    // curl: soft shading near the leading tear
    const cg = ctx.createLinearGradient(lead - W * 0.12, 0, lead, 0); cg.addColorStop(0, 'rgba(0,0,0,0)'); cg.addColorStop(0.75, 'rgba(0,0,0,0.06)'); cg.addColorStop(1, 'rgba(255,255,255,0.35)');
    ctx.fillStyle = cg; ctx.fillRect(lead - W * 0.15, 0, W * 0.2, H);
    ctx.restore();
    // white torn core along both rips (paper fibres exposed), slightly irregular width
    const core = (pts, dir, seed) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); for (let i = pts.length - 1; i >= 0; i--) { const [x, y] = pts[i]; ctx.lineTo(x - dir * R.minD * (0.006 + 0.01 * Math.abs(noise1(i * 0.3, seed))), y); } ctx.closePath(); ctx.fillStyle = '#fbfaf7'; ctx.fill(); };
    core(Lp, 1, 21); if (b > 0) core(Tp, -1, 23);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = R.S * 0.8;
    for (let i = 0; i < Lp.length; i += 3) { const [x, y] = Lp[i]; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + R.minD * 0.006 * hash(i, 61), y + (hash(i, 62) - 0.5) * R.S * 6); ctx.stroke(); }
  });

  /* ---------- melt: the frame sags and drips down in columns (post shader), with a slight warp ---------- */
  if (TR.meltCut) TR.meltCut.f = (u) => { const k = inOut(u); return { melt: k * 0.85, blur: k * 0.35 }; };

  /* ---------- paint splat accent behind the words ---------- */
  setF(G, 'splat', (ctx, R) => {
    const b = R.bb, s = E.outExpo(clamp((R.e || 0) * 1.6)), fade = 1 - E.inQuad(R.x || 0), seed = (R.seed || 0) % 97;
    const r = Math.max(b.w * 0.44, b.h * 0.8) * s, col = R.pal.accent;
    if (r < 1) return;
    ctx.save(); ctx.globalAlpha = 0.92 * fade;
    ctx.fillStyle = mix(R.pal.sub, R.pal.accent, 0.4); blobPath(ctx, b.cx + r * 0.25, b.cy + r * 0.12, r * 0.62, seed + 5, { spikes: 4, grow: s, sx: 1.25, sy: 0.85 }); ctx.globalAlpha = 0.55 * fade; ctx.fill();
    ctx.globalAlpha = 0.95 * fade; ctx.fillStyle = col;
    const sp = blobPath(ctx, b.cx, b.cy, r, seed + 1, { spikes: 8, grow: s, sx: 1.3, sy: 0.8 }); ctx.fill(); paintShade(ctx, b.cx, b.cy, r, col);
    ctx.fillStyle = col;
    sp.forEach((p, j) => { const dd = r * (1 + p.l * 1.1 + 0.15), rr = r * (0.03 + hash(seed, j, 12) * 0.04) * s; ctx.beginPath(); ctx.ellipse(b.cx + Math.cos(p.a) * dd * 1.3, b.cy + Math.sin(p.a) * dd * 0.8, rr * 1.3, rr, p.a, 0, TAU); ctx.fill(); });
    for (let j = 0; j < 12; j++) { const a2 = hash(seed, j, 13) * TAU, dd = r * (1.2 + hash(seed, j, 14) * 0.6) * s, rr = r * 0.014 * (1 + hash(seed, j, 15) * 2); ctx.beginPath(); ctx.arc(b.cx + Math.cos(a2) * dd * 1.3, b.cy + Math.sin(a2) * dd * 0.8, rr, 0, TAU); ctx.fill(); }
    ctx.restore();
  });

  /* ---------- script swash: a calligraphic ribbon (broad-nib thick/thin) with an entry curl and an end loop ---------- */
  setF(G, 'swashUnder', (ctx, R) => {
    const b = R.bb, e = E.inOutCubic(clamp((R.e || 0) / 0.95)), fade = 1 - E.inQuad(R.x || 0); if (e <= 0.01) return;
    const y0 = b.y + b.h * 1.1, x0 = b.x - b.h * 0.25, x1 = b.x + b.w + b.h * 0.15, Wd = x1 - x0, h = b.h;
    // centreline: small entry hook, long gently waving sweep, then a loop that curls back up at the end
    const C = (t) => {
      if (t < 0.08) { const q = t / 0.08; return [x0 + Wd * 0.02 * q, y0 - h * 0.12 * (1 - q) * (1 - q) + h * 0.02 * q]; }
      if (t < 0.78) { const q = (t - 0.08) / 0.7; return [x0 + Wd * (0.02 + 0.86 * q), y0 + h * 0.02 + Math.sin(q * PI) * h * 0.07 - q * h * 0.02]; }
      const q = (t - 0.78) / 0.22, cxl = x0 + Wd * 0.9, cyl = y0 - h * 0.24, rl = h * 0.32, ang = PI / 2 - q * TAU * 0.92;
      return [cxl + Math.cos(ang) * rl * (1 + q * 0.3) - (1 - q) * Wd * 0.02, cyl + Math.sin(ang) * rl * 0.9];
    };
    const n = 140, m = Math.max(2, Math.floor(e * n)), w0 = Math.max(2.5, h * 0.18), nib = -0.75, L = [], Rr = [];
    for (let i = 0; i <= m; i++) {
      const t = i / n, p = C(t), q = C(Math.min(1, t + 1 / n)), dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
      const taper = Math.min(1, t / 0.06) * Math.min(1, (1 - t) / 0.06 + 0.15), wd = w0 * (0.18 + 0.82 * Math.abs(Math.sin(ang - nib))) * taper;
      L.push([p[0] - (dy / l) * wd / 2, p[1] + (dx / l) * wd / 2]); Rr.push([p[0] + (dy / l) * wd / 2, p[1] - (dx / l) * wd / 2]);
    }
    ctx.save(); ctx.globalAlpha = fade; ctx.fillStyle = R.pal.accent; ctx.beginPath();
    L.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]); ctx.closePath(); ctx.fill();
    if (e > 0.98) { const p = C(1); ctx.beginPath(); ctx.arc(p[0], p[1], w0 * 0.22, 0, TAU); ctx.fill(); }
    ctx.restore();
  });
})();
