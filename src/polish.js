/* Quality pass on background motions that looked flat or cheap. Same ids and names, so existing projects
 * pick up the new look. Smooth surfaces (silk, lava) are shaded per pixel at low resolution and upscaled. */
'use strict';
(() => {
  const { clamp, lerp, hash, mix, rgba, hex2rgb, noise1 } = LM.U;
  const E = LM.E, BG = LM.bgm.lib;
  const PI = Math.PI, TAU = PI * 2;
  const wrap = (v, m) => ((v % m) + m) % m;
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const re = (id, f) => { if (BG[id]) BG[id].f = f; };
  const beatPos = (R) => R.t * ((R.bpm || 120) / 60);

  // per-pixel shader on a small canvas, drawn smoothly over the frame
  const bufs = {};
  function shade(ctx, R, key, maxW, fn, alpha) {
    const w = Math.max(16, Math.min(maxW, Math.round(R.W / 4))), h = Math.max(9, Math.round((w * R.H) / R.W));
    let b = bufs[key]; if (!b || b.w !== w || b.h !== h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); b = bufs[key] = { c, x, w, h, img: x.createImageData(w, h) }; }
    const d = b.img.data, o = [0, 0, 0, 0];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      fn((i + 0.5) / w, (j + 0.5) / h, o); const k = (j * w + i) * 4;
      d[k] = o[0]; d[k + 1] = o[1]; d[k + 2] = o[2]; d[k + 3] = o[3];
    }
    b.x.putImageData(b.img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; if (alpha != null) ctx.globalAlpha *= alpha; ctx.drawImage(b.c, 0, 0, R.W, R.H); ctx.restore();
  }

  /* ---------- silk: a draped satin surface lit from the upper left, with a sharp anisotropic sheen ---------- */
  re('silkWaves', (ctx, R) => {
    const t = R.t * 0.5, asp = R.W / R.H, th = 0.55, cs = Math.cos(th), sn = Math.sin(th);
    const base = hex2rgb(mix(R.pal.sub, R.pal.bg, 0.3)), deep = hex2rgb(mix(R.pal.bg, '#000000', 0.6)), hi = hex2rgb(mix(R.pal.sub, '#ffffff', 0.75)), tint = hex2rgb(mix(R.pal.accent, '#ffffff', 0.3));
    const L = [-0.35, -0.6, 0.72], Ln = Math.hypot(...L); L[0] /= Ln; L[1] /= Ln; L[2] /= Ln;
    const Hv = [L[0], L[1], L[2] + 1], Hn = Math.hypot(...Hv); Hv[0] /= Hn; Hv[1] /= Hn; Hv[2] /= Hn;
    shade(ctx, R, 'silk', 220, (u, v, o) => {
      // folds run along 'a'; height varies across 's' (analytic derivative, one pass)
      const X = u * asp, S2 = X * cs + v * sn, A2 = -X * sn + v * cs;
      const w1 = A2 * 1.6 + t * 0.4, p1 = S2 * 8.5 + 1.2 * Math.sin(w1) + t * 0.5;
      const w2 = A2 * 2.3 - t * 0.3, p2 = S2 * 13 + 2 * Math.sin(w2) - t * 0.4;
      const p3 = S2 * 3.5 + A2 * 0.8 + t * 0.3;
      const h = 0.5 * Math.sin(p1) + 0.22 * Math.sin(p2) + 0.25 * Math.sin(p3);
      const dS = 0.5 * Math.cos(p1) * 8.5 + 0.22 * Math.cos(p2) * 13 + 0.25 * Math.cos(p3) * 3.5;
      const dA = 0.5 * Math.cos(p1) * 1.2 * Math.cos(w1) * 1.6 + 0.22 * Math.cos(p2) * 2 * Math.cos(w2) * 2.3 + 0.25 * Math.cos(p3) * 0.8;
      const dx = (dS * cs - dA * sn) / asp, dy = dS * sn + dA * cs;
      let nx = -dx * 0.07 * asp, ny = -dy * 0.07, nz = 1; const nn = Math.hypot(nx, ny, nz); nx /= nn; ny /= nn; nz /= nn;
      const dif = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]), nh = Math.max(0, nx * Hv[0] + ny * Hv[1] + nz * Hv[2]);
      const spec = Math.pow(nh, 48), sheen = Math.pow(nh, 7) * 0.5, cav = sm(-0.95, 0.5, h), k = (0.12 + 0.88 * dif * dif) * (0.45 + 0.55 * cav);
      for (let c = 0; c < 3; c++) o[c] = clamp(lerp(deep[c], base[c], k) + hi[c] * spec * 0.9 + tint[c] * sheen * 0.45, 0, 255);
      o[3] = 255;
    }, Math.min(1, R.amt));
    const vg = ctx.createRadialGradient(R.W / 2, R.H / 2, R.minD * 0.3, R.W / 2, R.H / 2, Math.hypot(R.W, R.H) * 0.6); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.save(); ctx.globalAlpha *= Math.min(1, R.amt); ctx.fillStyle = vg; ctx.fillRect(0, 0, R.W, R.H); ctx.restore();
  });

  /* ---------- paint strokes: real bristle brush strokes that are laid down one after another ---------- */
  re('paintStrokes', (ctx, R) => {
    const period = 2.4, life = 11, cols = [R.pal.accent, R.pal.sub, mix(R.pal.accent, R.pal.text, 0.35), mix(R.pal.sub, R.pal.bg, 0.3)];
    const k1 = Math.floor(R.t / period), k0 = Math.max(0, Math.floor((R.t - life) / period));
    ctx.save(); ctx.lineJoin = 'round';
    for (let k = k0; k <= k1; k++) {
      const age = R.t - k * period; if (age < 0) continue;
      const prog = E.inOutCubic(clamp(age / 1.3)), fade = (1 - clamp((age - life + 1.2) / 1.2)) * Math.min(1, R.amt); if (prog <= 0.01 || fade <= 0) continue;
      const dir = hash(k, 1, 7) > 0.5 ? 1 : -1, y0 = R.H * (0.12 + hash(k, 2, 7) * 0.76), y3 = y0 + (hash(k, 3, 7) - 0.5) * R.H * 0.5;
      const xa = dir > 0 ? -R.W * 0.08 + hash(k, 4, 7) * R.W * 0.3 : R.W * 1.08 - hash(k, 4, 7) * R.W * 0.3, xb = dir > 0 ? xa + R.W * (0.55 + hash(k, 5, 7) * 0.6) : xa - R.W * (0.55 + hash(k, 5, 7) * 0.6);
      const c1 = [lerp(xa, xb, 0.33), y0 + (hash(k, 6, 7) - 0.5) * R.H * 0.45], c2 = [lerp(xa, xb, 0.66), y3 + (hash(k, 8, 7) - 0.5) * R.H * 0.45];
      const P = (u) => { const a = 1 - u; return [a * a * a * xa + 3 * a * a * u * c1[0] + 3 * a * u * u * c2[0] + u * u * u * xb, a * a * a * y0 + 3 * a * a * u * c1[1] + 3 * a * u * u * c2[1] + u * u * u * y3]; };
      const segs = 60, W0 = R.minD * (0.09 + hash(k, 9, 7) * 0.08), col = cols[k % cols.length], lite = mix(col, '#ffffff', 0.35), dark = mix(col, '#000000', 0.3);
      const pts = [], nrm = [];
      for (let i = 0; i <= segs; i++) pts.push(P((i / segs) * prog));
      for (let i = 0; i <= segs; i++) { const q = pts[Math.min(segs, i + 1)], r = pts[Math.max(0, i - 1)], dx = q[0] - r[0], dy = q[1] - r[1], l = Math.hypot(dx, dy) || 1; nrm.push([-dy / l, dx / l]); }
      const press = (i) => { const s = (i / segs) * prog; return (0.55 + 0.45 * Math.sin(clamp(s / 0.05) * PI / 2)) * (0.8 + 0.2 * noise1(s * 6, k)) * (1 - sm(0.85, 1, s) * 0.25); };
      const at = (i, off) => { const w = W0 * press(i); return [pts[i][0] + nrm[i][0] * off * w, pts[i][1] + nrm[i][1] * off * w]; };
      // paint body (slightly ragged edges), then bristle streaks on top
      ctx.globalAlpha = fade * 0.62; ctx.fillStyle = col; ctx.beginPath();
      for (let i = 0; i <= segs; i++) { const p = at(i, 0.5 - 0.06 * Math.abs(noise1(i * 0.7, k * 3))); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      for (let i = segs; i >= 0; i--) { const p = at(i, -0.5 + 0.06 * Math.abs(noise1(i * 0.7, k * 3 + 1))); ctx.lineTo(p[0], p[1]); }
      ctx.closePath(); ctx.fill();
      ctx.lineCap = 'butt'; const nb = 26;
      for (let b = 0; b < nb; b++) {
        const off = b / (nb - 1) - 0.5, endS = 0.8 + 0.2 * hash(k, b, 12); ctx.lineWidth = Math.max(0.6, (W0 / nb) * (0.6 + hash(k, b, 13) * 1.2));
        ctx.strokeStyle = hash(k, b, 14) > 0.55 ? lite : dark; ctx.globalAlpha = fade * (0.18 + 0.3 * hash(k, b, 11));
        ctx.beginPath(); let pen = false;
        for (let i = 0; i <= segs; i++) {
          const s = (i / segs) * prog; if (s > endS) break;
          const dry = s > endS * 0.55 && noise1(s * 30 + b * 2.7, k + 5) > 0.35 - ((s - endS * 0.55) / (endS * 0.45)) * 0.9;
          if (dry) { pen = false; continue; }
          const p = at(i, off * 0.96); pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true;
        }
        ctx.stroke();
      }
      // dry-brush flecks at the tail
      if (prog > 0.85) { ctx.fillStyle = col; for (let j = 0; j < 14; j++) { const i = Math.floor(segs * (0.8 + 0.2 * hash(k, j, 21))), p = at(Math.min(segs, i), hash(k, j, 22) - 0.5); ctx.globalAlpha = fade * 0.4 * hash(k, j, 23); ctx.fillRect(p[0], p[1], W0 * 0.08 * hash(k, j, 24) + 1, W0 * 0.02 + 1); } }
    }
    ctx.restore();
  });

  /* ---------- vinyl: a record on a turntable seen from above — grooves, track gaps, label, tonearm ---------- */
  re('vinylSpin', (ctx, R) => {
    const r = R.minD * 0.44, cx = R.W * 0.6, cy = R.H * 0.56, a = R.t * TAU * 0.555, A0 = Math.min(1, R.amt);
    ctx.save(); ctx.globalAlpha = A0;
    // platter with strobe dots
    const pr = r * 1.06; let g = ctx.createRadialGradient(cx - pr * 0.3, cy - pr * 0.4, pr * 0.2, cx, cy, pr);
    g.addColorStop(0, '#9aa0aa'); g.addColorStop(1, '#3b3f47'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, pr, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 90; i++) { const q = a * 0.999 + (i / 90) * TAU; ctx.fillRect(cx + Math.cos(q) * pr * 0.975 - 1, cy + Math.sin(q) * pr * 0.975 - 1, 2, 2); }
    // record body
    g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r); g.addColorStop(0, '#141416'); g.addColorStop(1, '#0a0a0b');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = Math.max(1, r * 0.008); ctx.beginPath(); ctx.arc(cx, cy, r * 0.995, 0, TAU); ctx.stroke();
    // grooves with track gaps
    const gaps = [0.47, 0.58, 0.7, 0.83], lw = Math.max(0.5, r * 0.003);
    for (let k = 0.39; k < 0.975; k += 0.0075) {
      const gap = gaps.some((x) => Math.abs(k - x) < 0.008); ctx.lineWidth = gap ? lw * 2.2 : lw;
      ctx.strokeStyle = gap ? 'rgba(0,0,0,0.7)' : `rgba(255,255,255,${0.035 + 0.035 * hash(Math.round(k * 1000), 4)})`; ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, TAU); ctx.stroke();
    }
    // fixed light reflection: two opposite fans (the light does not turn with the record)
    const fan = (s, w, al) => { const gg = ctx.createRadialGradient(cx, cy, r * 0.38, cx, cy, r); gg.addColorStop(0, `rgba(255,255,255,${al * 0.4})`); gg.addColorStop(0.6, `rgba(255,255,255,${al})`); gg.addColorStop(1, `rgba(255,255,255,${al * 0.3})`); ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r * 0.975, s - w, s + w); ctx.closePath(); ctx.fill(); };
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r * 0.975, 0, TAU); ctx.arc(cx, cy, r * 0.38, 0, TAU, true); ctx.clip();
    fan(-2.3, 0.22, 0.1); fan(-2.3, 0.05, 0.12); fan(PI - 2.3, 0.22, 0.07); fan(PI - 2.3, 0.05, 0.09); ctx.restore();
    // label (turns with the record)
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); const lr = r * 0.34;
    g = ctx.createRadialGradient(-lr * 0.3, -lr * 0.3, lr * 0.1, 0, 0, lr); g.addColorStop(0, mix(R.pal.accent, '#ffffff', 0.15)); g.addColorStop(1, mix(R.pal.accent, '#000000', 0.25));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, lr, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(R.pal.bg, 0.55); ctx.lineWidth = Math.max(1, lr * 0.02); ctx.beginPath(); ctx.arc(0, 0, lr * 0.9, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, lr * 0.28, 0, TAU); ctx.stroke();
    ctx.fillStyle = rgba(R.pal.bg, 0.85); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(lr * 0.2)}px system-ui, sans-serif`; ctx.fillText('SIDE A', 0, -lr * 0.52);
    ctx.font = `500 ${Math.round(lr * 0.11)}px system-ui, sans-serif`; ctx.fillText('33⅓ RPM  ·  STEREO', 0, lr * 0.5);
    ctx.fillRect(-lr * 0.5, lr * 0.66, lr, Math.max(1, lr * 0.025));
    ctx.restore();
    // spindle
    g = ctx.createRadialGradient(cx - r * 0.008, cy - r * 0.008, 0, cx, cy, r * 0.03); g.addColorStop(0, '#f2f2f2'); g.addColorStop(1, '#6d7079'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 0.028, 0, TAU); ctx.fill();
    // tonearm resting in the grooves
    const px = cx + r * 1.12, py = cy - r * 0.88, ang = Math.atan2(cy + r * 0.12 - py, cx + r * 0.66 - px) + Math.sin(R.t * 0.4) * 0.004, len = r * 1.18;
    ctx.fillStyle = '#2c2f36'; ctx.beginPath(); ctx.arc(px, py, r * 0.11, 0, TAU); ctx.fill();
    g = ctx.createRadialGradient(px - r * 0.03, py - r * 0.03, 0, px, py, r * 0.08); g.addColorStop(0, '#d9dce2'); g.addColorStop(1, '#6b6f78'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r * 0.075, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
    ctx.fillStyle = '#4a4e57'; ctx.fillRect(-r * 0.3, -r * 0.05, r * 0.16, r * 0.1);
    ctx.strokeStyle = '#c9ccd3'; ctx.lineCap = 'round'; ctx.lineWidth = r * 0.03; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.86, 0); ctx.quadraticCurveTo(len * 0.95, 0, len, r * 0.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = r * 0.008; ctx.beginPath(); ctx.moveTo(r * 0.05, -r * 0.008); ctx.lineTo(len * 0.84, -r * 0.008); ctx.stroke();
    ctx.translate(len, r * 0.05); ctx.rotate(0.5); ctx.fillStyle = '#2b2d33'; ctx.fillRect(-r * 0.04, -r * 0.05, r * 0.16, r * 0.1); ctx.fillStyle = '#b8bcc4'; ctx.fillRect(r * 0.08, -r * 0.05, r * 0.03, r * 0.1);
    ctx.restore(); ctx.restore();
  });

  /* ---------- liquid that fills up on the beat: meniscus, depth, bubbles, caustics ---------- */
  re('liquidRise', (ctx, R) => {
    const steps = 8, b = beatPos(R), k = Math.floor(b) % steps, f = E.outBack(clamp((b - Math.floor(b)) / 0.45)), lvl = 0.12 + ((k + f) / steps) * 0.78;
    const top = R.H * (1 - lvl), A0 = Math.min(1, R.amt), slosh = Math.exp(-(b - Math.floor(b)) * 3) * R.S * 22;
    const Y = (x) => top + Math.sin(x / R.W * 7 + R.t * 2.2) * R.S * 7 + Math.sin(x / R.W * 3 - R.t * 1.3) * slosh;
    ctx.save(); ctx.globalAlpha = A0;
    const g = ctx.createLinearGradient(0, top, 0, R.H); g.addColorStop(0, rgba(mix(R.pal.sub, '#ffffff', 0.15), 0.62)); g.addColorStop(1, rgba(mix(R.pal.sub, R.pal.bg, 0.6), 0.9));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, R.H); for (let x = 0; x <= R.W + 1; x += R.W / 80) ctx.lineTo(x, Y(x)); ctx.lineTo(R.W, R.H); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = R.S * 2;
    for (let i = 0; i < 7; i++) { ctx.strokeStyle = rgba(mix(R.pal.sub, '#ffffff', 0.5), 0.06); ctx.beginPath(); for (let x = 0; x <= R.W; x += R.W / 40) { const y = top + (R.H - top) * ((i + 0.5) / 7) + Math.sin(x / R.W * 9 + R.t * 1.4 + i * 2) * R.S * 18; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 40; i++) { const sp = 0.4 + hash(i, 2, 5) * 0.8, y = R.H - wrap(R.t * R.S * 90 * sp + hash(i, 3, 5) * R.H, R.H - top + R.S * 20), x = hash(i, 1, 5) * R.W + Math.sin(R.t * 2 + i) * R.S * 6, r = R.S * (2 + hash(i, 4, 5) * 6);
      if (y < top) continue; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = R.S * 1.2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, TAU); ctx.fill(); }
    ctx.restore();
    // surface: bright meniscus line and a lighter band just below it
    ctx.lineWidth = R.S * 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); for (let x = 0; x <= R.W + 1; x += R.W / 80) { const y = Y(x); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.lineWidth = R.S * 14; ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); for (let x = 0; x <= R.W + 1; x += R.W / 80) { const y = Y(x) + R.S * 9; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.restore();
  });

  /* ---------- the view from a train window: sky, far hills, town, poles and wires rushing past ---------- */
  re('windowParallax', (ctx, R) => {
    const W = R.W, H = R.H, t = R.t;
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, mix(R.pal.sub, '#ffffff', 0.25)); sky.addColorStop(0.65, mix(R.pal.accent, '#ffffff', 0.35)); sky.addColorStop(1, mix(R.pal.bg, R.pal.accent, 0.3));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(W * 0.72, H * 0.42, 0, W * 0.72, H * 0.42, R.minD * 0.35); sun.addColorStop(0, 'rgba(255,245,220,0.75)'); sun.addColorStop(1, 'rgba(255,245,220,0)'); ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    const ridge = (base, amp, sc, sp, col, al) => { ctx.globalAlpha = al; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W + 2; x += W / 90) { const u = (x + t * W * sp) / W; ctx.lineTo(x, H * base - H * amp * (0.6 * Math.abs(noise1(u * sc, 3)) + 0.4 * noise1(u * sc * 3.1, 9))); } ctx.lineTo(W, H); ctx.fill(); ctx.globalAlpha = 1; };
    ridge(0.62, 0.16, 2, 0.01, mix(R.pal.sub, R.pal.bg, 0.25), 0.55);
    ridge(0.7, 0.12, 3, 0.03, mix(R.pal.sub, R.pal.bg, 0.5), 0.75);
    // town blocks
    const bw = R.minD * 0.05, off = (t * W * 0.09) % bw;
    ctx.fillStyle = mix(R.pal.bg, R.pal.sub, 0.25);
    for (let x = -bw - off, i = Math.floor(t * W * 0.09 / bw); x < W + bw; x += bw, i++) { const h = H * (0.05 + 0.1 * hash(i, 3)); ctx.fillRect(x, H * 0.78 - h, bw * 0.92, h + H * 0.3); if (hash(i, 4) > 0.5) { ctx.fillStyle = 'rgba(255,230,170,0.5)'; ctx.fillRect(x + bw * 0.3, H * 0.78 - h * 0.7, bw * 0.15, bw * 0.12); ctx.fillStyle = mix(R.pal.bg, R.pal.sub, 0.25); } }
    ctx.fillStyle = mix(R.pal.bg, '#000000', 0.2); ctx.fillRect(0, H * 0.86, W, H * 0.2);
    // telephone poles and sagging wires flying by
    const gap = W * 0.55, po = (t * W * 1.6) % gap;
    ctx.strokeStyle = 'rgba(20,20,26,0.75)'; ctx.lineWidth = R.S * 1.5;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); for (let x = 0; x <= W; x += W / 60) { const s = ((x + po) % gap) / gap; ctx.lineTo(x, H * (0.2 + k * 0.035) + Math.sin(s * PI) * H * 0.05); } ctx.stroke(); }
    for (let x = -po; x < W + gap; x += gap) { ctx.fillStyle = 'rgba(15,15,20,0.85)'; ctx.fillRect(x - R.minD * 0.012, H * 0.12, R.minD * 0.024, H); ctx.fillRect(x - R.minD * 0.06, H * 0.19, R.minD * 0.12, R.minD * 0.012); }
    // window frame with bevel and a faint reflection on the glass
    const m = R.minD * 0.07, br = R.minD * 0.07;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.moveTo(m + br, m); ctx.arcTo(m, m, m, m + br, br); ctx.lineTo(m, H - m - br); ctx.arcTo(m, H - m, m + br, H - m, br); ctx.lineTo(W - m - br, H - m); ctx.arcTo(W - m, H - m, W - m, H - m - br, br); ctx.lineTo(W - m, m + br); ctx.arcTo(W - m, m, W - m - br, m, br); ctx.closePath();
    const fr = ctx.createLinearGradient(0, 0, 0, H); fr.addColorStop(0, mix(R.pal.bg, '#ffffff', 0.12)); fr.addColorStop(1, mix(R.pal.bg, '#000000', 0.35)); ctx.fillStyle = fr; ctx.fill('evenodd'); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = R.S * 2; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(m, m, W - m * 2, H - m * 2, br) : ctx.rect(m, m, W - m * 2, H - m * 2); ctx.stroke();
    const rf = ctx.createLinearGradient(m, m, W * 0.6, H); rf.addColorStop(0, 'rgba(255,255,255,0.12)'); rf.addColorStop(0.35, 'rgba(255,255,255,0)'); rf.addColorStop(0.55, 'rgba(255,255,255,0.06)'); rf.addColorStop(0.6, 'rgba(255,255,255,0)'); ctx.fillStyle = rf; ctx.fillRect(m, m, W - m * 2, H - m * 2);
  });

  /* ---------- lava lamp: shaded metaballs with a glowing rim ---------- */
  re('lavaLamp', (ctx, R) => {
    const asp = R.W / R.H, balls = [0, 1, 2, 3, 4, 5, 6].map((i) => [0.5 + 0.34 * Math.sin(R.t * (0.09 + i * 0.022) + i * 2), 0.5 + 0.44 * Math.sin(R.t * (0.08 + i * 0.018) + i * 1.7), 0.01 + 0.009 * hash(i, 1)]);
    const c1 = hex2rgb(mix(R.pal.accent, '#ffffff', 0.1)), c2 = hex2rgb(mix(R.pal.accent, R.pal.bg, 0.55)), hiC = [255, 255, 255], glowC = hex2rgb(R.pal.accent);
    const Lx = -0.4, Ly = -0.55, Lz = 0.73, Hx = Lx, Hy = Ly, Hz = Lz + 1, Hn = Math.hypot(Hx, Hy, Hz);
    shade(ctx, R, 'lava', 300, (u, v, o) => {
      let f = 0, gx = 0, gy = 0;
      for (const b of balls) { const dx = (u - b[0]) * asp, dy = v - b[1], d2 = dx * dx + dy * dy + 1e-4, q = b[2] / d2; f += q; gx -= 2 * q * dx / d2; gy -= 2 * q * dy / d2; }
      const inside = sm(0.92, 1.04, f), glow = sm(0.3, 0.95, f) * (1 - inside);
      // height = 1 - 1/f (0 on the surface, rising inside): normal from its gradient, flat at the centre
      const k = 0.09 / (f * f + 1e-3); let nx = gx * k, ny = gy * k, nz = 1; const nn = Math.hypot(nx, ny, nz); nx /= nn; ny /= nn; nz /= nn;
      const dif = Math.max(0, nx * Lx + ny * Ly + nz * Lz), spec = Math.pow(Math.max(0, (nx * Hx + ny * Hy + nz * Hz) / Hn), 40);
      for (let c = 0; c < 3; c++) o[c] = clamp(lerp(c2[c], c1[c], dif) + hiC[c] * spec * 0.75 * inside + glowC[c] * glow * 0.7, 0, 255);
      o[3] = Math.round(255 * clamp(inside + glow * 0.4));
    }, Math.min(1, R.amt));
  });

  /* ---------- morphing blob: glossy layered shape with depth ---------- */
  re('morphBlob', (ctx, R) => {
    const cx = R.W / 2, cy = R.H / 2, rad = R.minD * 0.26 * (1 + (R.beat || 0) * 0.06), A0 = Math.min(1, R.amt);
    const path = (rs, ph) => { ctx.beginPath(); for (let i = 0; i <= 96; i++) { const a = (i / 96) * TAU, r = rs * (1 + 0.16 * Math.sin(a * 3 + R.t * 0.9 + ph) + 0.09 * Math.sin(a * 5 - R.t * 1.3 + ph) + 0.05 * Math.sin(a * 2 + R.t * 0.5)); const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
    ctx.save(); ctx.globalAlpha = A0 * 0.35; ctx.fillStyle = R.pal.sub; path(rad * 1.25, 2.1); ctx.fill();
    ctx.globalAlpha = A0; const g = ctx.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.05, cx, cy, rad * 1.25);
    g.addColorStop(0, mix(R.pal.accent, '#ffffff', 0.55)); g.addColorStop(0.45, R.pal.accent); g.addColorStop(1, mix(R.pal.accent, R.pal.bg, 0.65)); ctx.fillStyle = g; path(rad, 0); ctx.fill();
    ctx.save(); ctx.clip(); const rimG = ctx.createRadialGradient(cx + rad * 0.3, cy + rad * 0.45, rad * 0.4, cx, cy, rad * 1.3); rimG.addColorStop(0, 'rgba(255,255,255,0)'); rimG.addColorStop(1, rgba(R.pal.sub, 0.55)); ctx.fillStyle = rimG; ctx.fillRect(cx - rad * 2, cy - rad * 2, rad * 4, rad * 4); ctx.restore();
    const hx = cx - rad * 0.38, hy = cy - rad * 0.45, hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, rad * 0.35); hg.addColorStop(0, 'rgba(255,255,255,0.75)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(hx, hy, rad * 0.35, rad * 0.22, -0.6, 0, TAU); ctx.fill();
    ctx.restore();
  });

  /* ---------- ocean: shaded swells with foam crests and sun glints ---------- */
  re('ocean', (ctx, R) => {
    const A0 = Math.min(1, R.amt);
    for (let j = 0; j < 6; j++) {
      const base = R.H * (0.5 + j * 0.09), amp = R.S * (30 - j * 3) * (1 + (R.beat || 0) * 0.35), k = (0.0035 + j * 0.0011) / R.S, sp = 0.6 + j * 0.25;
      const Y = (x) => base + Math.sin(x * k + R.t * sp + j) * amp + Math.sin(x * k * 2.3 - R.t * 0.7 * sp + j * 2) * amp * 0.35;
      const col = mix(mix(R.pal.sub, R.pal.accent, j / 8), R.pal.bg, 0.15 + j * 0.05);
      const g = ctx.createLinearGradient(0, base - amp, 0, base + R.H * 0.2); g.addColorStop(0, mix(col, '#ffffff', 0.25)); g.addColorStop(1, mix(col, R.pal.bg, 0.5));
      ctx.globalAlpha = A0 * (0.55 + j * 0.08); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, R.H); for (let x = 0; x <= R.W + 1; x += R.S * 8) ctx.lineTo(x, Y(x)); ctx.lineTo(R.W, R.H); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = A0 * 0.5; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = R.S * (1 + j * 0.3); ctx.beginPath(); for (let x = 0; x <= R.W + 1; x += R.S * 8) { const y = Y(x), crest = Y(x) - Y(x + R.S * 8) < -amp * 0.02 ? 0 : 1; crest || x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
    }
    ctx.globalAlpha = A0; ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) { const x = hash(i, 1, 3) * R.W, y = R.H * (0.5 + hash(i, 2, 3) * 0.45), tw = Math.pow(Math.max(0, Math.sin(R.t * (2 + hash(i, 3, 3) * 3) + i * 1.7)), 14); if (tw < 0.1) continue; ctx.globalAlpha = A0 * tw * 0.8; ctx.fillRect(x - R.S * 4, y, R.S * 8, R.S * 1.2); }
  });

  /* ---------- petals and leaves: real shapes that tumble in 3D ---------- */
  const flutter = (ctx, R, n, draw, seed) => {
    for (let i = 0; i < n; i++) {
      const z = 0.4 + hash(i, 1, seed) * 0.6, sz = R.minD * (0.016 + 0.024 * z), sp = 0.05 + 0.08 * z;
      const x = wrap(hash(i, 2, seed) * R.W + R.t * R.W * sp * 0.5 + Math.sin(R.t * 0.8 + i) * R.S * 40, R.W + sz * 4) - sz * 2, y = wrap(hash(i, 3, seed) * R.H + R.t * R.H * sp, R.H + sz * 4) - sz * 2;
      ctx.save(); ctx.translate(x, y); ctx.rotate(R.t * (0.6 + hash(i, 4, seed)) + i); ctx.scale(Math.cos(R.t * (1.5 + hash(i, 5, seed) * 2) + i), 1); ctx.globalAlpha = 0.55 + 0.45 * z; draw(sz, i); ctx.restore();
    }
  };
  re('petals', (ctx, R) => {
    const c0 = mix(R.pal.accent, '#ffd6e4', 0.55), c1 = mix(R.pal.accent, '#ffffff', 0.8);
    flutter(ctx, R, Math.round(34 * R.amt), (s) => {
      const g = ctx.createLinearGradient(0, -s, 0, s); g.addColorStop(0, c1); g.addColorStop(1, c0); ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, s); ctx.bezierCurveTo(s * 0.9, s * 0.3, s * 0.7, -s * 0.8, s * 0.12, -s); ctx.lineTo(0, -s * 0.78); ctx.lineTo(-s * 0.12, -s); ctx.bezierCurveTo(-s * 0.7, -s * 0.8, -s * 0.9, s * 0.3, 0, s); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = s * 0.05; ctx.beginPath(); ctx.moveTo(0, s * 0.9); ctx.lineTo(0, -s * 0.5); ctx.stroke();
    }, 21);
  });
  re('leaves', (ctx, R) => {
    const cs = [mix(R.pal.accent, '#c8682a', 0.5), mix(R.pal.sub, '#7a9a3a', 0.5), mix(R.pal.accent, '#e2b04a', 0.5)];
    flutter(ctx, R, Math.round(26 * R.amt), (s, i) => {
      const s2 = s * 1.4; ctx.fillStyle = cs[i % 3];
      ctx.beginPath(); ctx.moveTo(0, s2); ctx.quadraticCurveTo(s2 * 0.75, 0, 0, -s2); ctx.quadraticCurveTo(-s2 * 0.75, 0, 0, s2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.moveTo(0, s2 * 1.15); ctx.lineTo(0, -s2 * 0.9);
      for (let k = -2; k <= 2; k++) { ctx.moveTo(0, k * s2 * 0.3); ctx.lineTo(s2 * 0.35, k * s2 * 0.3 - s2 * 0.25); ctx.moveTo(0, k * s2 * 0.3); ctx.lineTo(-s2 * 0.35, k * s2 * 0.3 - s2 * 0.25); }
      ctx.stroke();
    }, 23);
  });

  /* ---------- bubbles: thin-film spheres with rim, iridescence and highlight ---------- */
  re('bubbles', (ctx, R) => {
    const n = Math.round(30 * R.amt);
    for (let i = 0; i < n; i++) {
      const z = 0.35 + hash(i, 1, 41) * 0.65, r = R.minD * (0.012 + 0.04 * z * hash(i, 5, 41) + 0.008), sp = 0.04 + 0.08 * z;
      const y = R.H + r - wrap(hash(i, 2, 41) * R.H + R.t * R.H * sp, R.H + r * 2), x = hash(i, 3, 41) * R.W + Math.sin(R.t * 1.3 + i) * r * 0.8;
      ctx.globalAlpha = 0.5 + 0.5 * z;
      let g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.82, rgba(R.pal.sub, 0.18)); g.addColorStop(0.93, rgba(mix(R.pal.accent, '#ffffff', 0.4), 0.5)); g.addColorStop(1, 'rgba(255,255,255,0.15)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(0.8, r * 0.04); ctx.beginPath(); ctx.arc(x, y, r * 0.98, PI * 0.15, PI * 0.55); ctx.stroke();
      g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, 0, x - r * 0.4, y - r * 0.45, r * 0.3); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.3, r * 0.18, -0.7, 0, TAU); ctx.fill();
    }
  });
})();
