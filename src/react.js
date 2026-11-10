/* Effect catalogue phase 4 — audio-reactive vocabulary (§10 AU-01〜20).
 * Reads the per-frame features from LM.audio.frame (see audio2.js) through the renderer (C.au for glyph motions,
 * R.au for backgrounds / overlays, ctx.au for the post shader). Without an analysed song a BPM-locked synthetic
 * frame stands in, so every effect still moves in the preview.
 *  - text holds: kick pump, loudness, vocal tremor, hi-hat sparkle, ride the waveform, spectrum stretch,
 *    sung pitch, melody contour, stereo pan, reverb echo, drum kit
 *  - emphasis triggers: kick / snare / hi-hat / any onset (instead of the beat grid)
 *  - backgrounds (オーディオ): mirrored spectrum bars with peak caps and floor reflection, smooth spectrum ring,
 *    spectrum silhouette, phase-locked oscilloscope, stereo Lissajous, ridgeline history, scrolling spectrogram,
 *    kick shock rings, hi-hat sparks, melody line, level meters
 *  - screen filters (音に反応): kick zoom, bass shockwave, loudness bloom, snare flash, chord colour,
 *    reverb trails, stereo RGB split, song-driven intensity, hi-hat glints over the lyric */
'use strict';
(() => {
  const U = LM.U, { clamp, lerp, hash, rgba, mix } = U;
  const M = LM.motion, FX = LM.fx, PI = Math.PI, TAU = PI * 2;
  const sm = (x) => x * x * (3 - 2 * x);

  /* ================= synthetic frame (no song analysed) ================= */
  const SP = new Float32Array(64), PK = new Float32Array(64);
  const SYN = { rms: 0, bass: 0, mid: 0, high: 0, vocal: 0, kick: 0, snare: 0, hat: 0, onset: 0, pan: 0, width: 0.3, space: 0.3, pitch: 0.5, pitchS: 0.5, midi: null, pconf: 0, cent: 0.5, mood: 0.2, arousal: 0.5, spec: SP, peak: PK, real: false, sec: null, t: 0 };
  LM.auSynth = (t, beat, bpm, tb) => {
    const per = 60 / (bpm || 120), k = Math.round(((tb == null ? t : tb) / per)), dt = Math.max(0, t - (tb == null ? t : tb)), h8 = (t / per * 2) % 1;
    const S = SYN; S.t = t;
    S.kick = beat; S.snare = k % 2 ? Math.exp(-dt / 0.14) * 0.9 : 0; S.hat = Math.exp(-(h8 * per / 2) / 0.05) * 0.7; S.onset = Math.max(S.kick, S.snare * 0.8);
    S.bass = 0.35 + beat * 0.55; S.rms = 0.45 + beat * 0.3 + 0.08 * Math.sin(t * 0.7); S.mid = 0.5 + 0.2 * Math.sin(t * 1.3); S.high = 0.35 + S.hat * 0.4;
    S.vocal = 0.45 + 0.35 * Math.sin(t * 2.1) * Math.sin(t * 0.37); S.pitch = 0.5 + 0.3 * Math.sin(t * 1.7) + 0.12 * Math.sin(t * 4.3); S.pitchS = S.pitch;
    S.pan = 0.45 * Math.sin(t * 0.55); S.width = 0.35 + 0.2 * Math.sin(t * 0.23); S.space = 0.35 + 0.25 * Math.sin(t * 0.19); S.arousal = 0.5 + 0.3 * Math.sin(t * 0.11); S.mood = 0.3 * Math.sin(t * 0.07);
    for (let b = 0; b < 64; b++) { const u = b / 63, base = 0.75 * Math.exp(-u * 2.2) + 0.12, w = 0.5 + 0.5 * Math.sin(t * (3 + b * 0.37) + b * 1.7) * Math.sin(t * 1.3 + b * 0.21); SP[b] = clamp(base * (0.45 + 0.55 * w) + (u < 0.15 ? beat * 0.35 : 0) + (u > 0.75 ? S.hat * 0.25 : 0)); PK[b] = clamp(SP[b] + 0.06); }
    return S;
  };
  // spectrum at another time without touching the shared frame (ridgeline / spectrogram history)
  const HS = new Float32Array(64);
  function specAt(au, t) {
    const F = LM.audio && LM.audio.feat;
    if (F && au.real !== false) { const x = t * F.fps, f0 = Math.max(0, Math.min(F.NF - 1, Math.floor(x))), f1 = Math.min(F.NF - 1, f0 + 1), u = clamp(x - f0); for (let b = 0; b < 64; b++) HS[b] = (F.specS[f0 * 64 + b] * (1 - u) + F.specS[f1 * 64 + b] * u) / 255; return HS; }
    for (let b = 0; b < 64; b++) { const q = b / 63; HS[b] = clamp((0.7 * Math.exp(-q * 2.2) + 0.12) * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * (3 + b * 0.37) + b * 1.7)))); }
    return HS;
  }
  function pitchAt(au, t) { const A = LM.audio; if (A && A.pitchAt && au.real !== false) { const v = A.pitchAt(t); if (v != null) return v; } return 0.5 + 0.3 * Math.sin(t * 1.7) + 0.12 * Math.sin(t * 4.3); }
  LM.react = { specAt, pitchAt };

  /* ================= glyph holds (音に反応) ================= */
  const AU = (c) => c.au || SYN;
  const gsc = (T, g, c, sx, sy = sx) => { T.x = (T.x || 0) + (g.x - c.cx) * (sx - 1); T.y = (T.y || 0) + (g.y - c.cy) * (sy - 1); T.sx = (T.sx == null ? 1 : T.sx) * sx; T.sy = (T.sy == null ? 1 : T.sy) * sy; return T; };
  const relX = (g, c) => (c.bb && c.bb.w > 1 ? clamp((g.x - c.bb.x) / c.bb.w) : 0.5);
  const cat = '音に反応';
  Object.assign(M.hold, {
    auPump: { n: 'キックと低音で脈打つ', c: cat, f: (ht, g, c) => { const a = AU(c), k = c.amp || 1, s = 1 + (a.kick * 0.075 + a.bass * 0.018) * k; return gsc({ bright: a.kick * 0.28 * k }, g, c, s, s * (1 + a.kick * 0.02 * k)); } },
    auLoud: { n: '音量で大きさと明るさが変わる', c: cat, f: (ht, g, c) => { const a = AU(c), k = c.amp || 1, s = 0.965 + a.rms * 0.07 * k; return gsc({ bright: Math.max(0, a.rms - 0.45) * 0.55 * k, dark: Math.max(0, 0.35 - a.rms) * 0.4 }, g, c, s); } },
    auVocal: { n: '歌声の強さで文字が震える', c: cat, f: (ht, g, c) => {
      const a = AU(c), k = (c.amp || 1) * sm(clamp((a.vocal - 0.15) / 0.75)), A = g.size * 0.045 * k, ph = (g.k || 0) * 1.73, t = c.tAbs;
      return { x: (Math.sin(t * 21 + ph) * 0.6 + Math.sin(t * 37 + ph * 2.1) * 0.4) * A, y: (Math.cos(t * 17 + ph * 1.3) * 0.6 + Math.sin(t * 31 + ph) * 0.4) * A, rot: Math.sin(t * 13 + ph) * 0.05 * k, bright: k * 0.18 };
    } },
    auHat: { n: 'ハイハットで一文字ずつきらめく', c: cat, f: (ht, g, c) => {
      const a = AU(c), q = Math.floor(c.tAbs * 16), on = hash(g.k || 0, q, 41) > 0.62, v = a.hat * (on ? 1 : 0.2) * (c.amp || 1);
      return { bright: v * 0.9, y: -v * g.size * 0.05, sx: 1 + v * 0.05, sy: 1 + v * 0.05 };
    } },
    auWave: { n: '波形に乗って揺れる', c: cat, f: (ht, g, c) => {
      const w = c.scope, k = (c.amp || 1); if (!w) { const a = AU(c); return { y: Math.sin(c.tAbs * 9 - relX(g, c) * 9) * g.size * 0.12 * a.rms * k }; }
      const u = relX(g, c) * (w.length - 1), i = Math.floor(u), f = u - i, v = (w[i] || 0) * (1 - f) + (w[i + 1] || 0) * f;
      return { y: -v * g.size * 0.7 * k, rot: ((w[Math.min(w.length - 1, i + 2)] || 0) - (w[Math.max(0, i - 2)] || 0)) * 1.4 * k };
    } },
    auSpec: { n: 'スペクトラムで縦に伸び縮み', c: cat, f: (ht, g, c) => {
      const a = AU(c), sp = a.spec, b = Math.min(63, Math.floor(Math.pow(relX(g, c), 1.35) * 52) + 2), v = sp ? (sp[b] * 0.6 + sp[Math.min(63, b + 1)] * 0.4) : 0.3, k = c.amp || 1;
      const sy = 1 + (v - 0.25) * 0.9 * k; return { sy, y: -(sy - 1) * g.size * 0.42, bright: Math.max(0, v - 0.6) * 0.6 };
    } },
    auPitch: { n: '歌のピッチで上下する', c: cat, f: (ht, g, c) => { const a = AU(c), p = a.pitchS == null ? 0.5 : a.pitchS; return { y: -(p - 0.5) * g.size * 1.5 * (c.amp || 1), rot: 0 }; } },
    auMelody: { n: 'メロディの形に文字が並ぶ', c: cat, f: (ht, g, c) => {
      const a = AU(c), ct = c.ct, ts = ct && ct.cs && ct.cs[g.k] != null ? ct.cs[g.k] : null, tg = ts != null ? ts : c.tAbs - c.lt + (g.k || 0) / Math.max(1, c.N) * c.dur * 0.8;
      const p = pitchAt(a, tg + 0.06), y = -(clamp(p, -0.1, 1.1) - 0.5) * g.size * 0.85 * (c.amp || 1), q = clamp((c.tAbs - tg) / 0.25);
      return { y, bright: q > 0 && q < 1 ? Math.sin(PI * q) * 0.45 : 0, dark: c.tAbs < tg ? 0.18 : 0 };
    } },
    auPan: { n: '左右の定位で寄っていく', c: cat, f: (ht, g, c) => { const a = AU(c), k = c.amp || 1; return { x: a.pan * c.W * 0.09 * k, skx: -a.pan * 0.12 * k, sx: 1 - Math.abs(a.pan) * 0.06 }; } },
    auEcho: { n: '残響の量で文字が尾を引く', c: cat, f: (ht, g, c) => { const a = AU(c), v = clamp(a.space * 1.15) * (c.amp || 1); return { stut: v * 3.2, stutD: g.size * (0.05 + v * 0.05), stutA: 0.14 + v * 0.12, blur: v * g.size * 0.012 }; } },
    auDrums: { n: 'ドラムに合わせて動く（キック・スネア・ハイハット）', c: cat, f: (ht, g, c) => {
      const a = AU(c), k = c.amp || 1, sd = (Math.floor(c.tAbs * 4) % 2 ? 1 : -1), T = gsc({}, g, c, 1 + a.kick * 0.06 * k);
      T.x += sd * a.snare * g.size * 0.08 * k; T.skx = sd * a.snare * 0.18 * k; T.y = (T.y || 0) - a.hat * g.size * 0.025 * k * (hash(g.k || 0, 3) > 0.5 ? 1 : -1); T.bright = a.snare * 0.3 * k; return T;
    } },
  });

  /* emphasis triggers on detected onsets (AU-05) */
  if (LM.MS && LM.MS.TRIG) Object.assign(LM.MS.TRIG, { kick: 'キック（バスドラム）', snare: 'スネア', hat: 'ハイハット', onset: '音の立ち上がり（すべて）' });

  /* ================= painters shared by backgrounds and overlays ================= */
  const grad = (ctx, x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  function rbar(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, Math.abs(h) / 2); ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h); ctx.closePath(); }
  // mirrored bars (low band in the centre), rounded tops, falling peak caps, floor reflection + glow
  function bars(ctx, R, o) {
    const a = R.au || SYN, sp = a.spec, pk = a.peak, n = o.n || 40, W = o.w, x0 = o.x, base = o.y, H = o.h, half = n / 2, bw = W / n, gap = bw * 0.28, pal = R.pal;
    const val = (i) => { const q = Math.abs(i - (half - 0.5)) / half, b = Math.min(63, Math.floor(Math.pow(q, 1.25) * 58) + 1); return [sp[b] * 0.65 + sp[Math.min(63, b + 1)] * 0.35, pk[b]]; };
    const fill = grad(ctx, 0, base - H, 0, base, [[0, pal.text], [0.35, pal.accent], [1, mix(pal.sub || pal.accent, pal.bg, 0.25)]]);
    ctx.save();
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over'; ctx.globalAlpha = (pass ? 0.22 : 0.92) * o.a;
      for (let i = 0; i < n; i++) {
        const [v] = val(i), h = Math.max(R.S * 3, sm(clamp(v)) * H), x = x0 + i * bw + gap / 2, w = bw - gap;
        ctx.fillStyle = pass ? pal.accent : fill; if (pass) { rbar(ctx, x - w * 0.35, base - h - w * 0.3, w * 1.7, h + w * 0.3, w); ctx.fill(); continue; }
        rbar(ctx, x, base - h, w, h, w * 0.5); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (o.peaks !== false) { ctx.globalAlpha = 0.95 * o.a; ctx.fillStyle = pal.text; for (let i = 0; i < n; i++) { const [, p] = val(i), w = bw - gap, x = x0 + i * bw + gap / 2, y = base - Math.max(R.S * 3, sm(clamp(p)) * H) - R.S * 5; ctx.fillRect(x, y, w, Math.max(1.5, R.S * 2.2)); } }
    if (o.refl) {
      ctx.globalAlpha = 0.28 * o.a;
      for (let i = 0; i < n; i++) { const [v] = val(i), h = Math.max(R.S * 3, sm(clamp(v)) * H) * 0.45, x = x0 + i * bw + gap / 2, w = bw - gap; ctx.fillStyle = grad(ctx, 0, base + R.S * 3, 0, base + R.S * 3 + h, [[0, rgba(pal.accent, 0.9)], [1, rgba(pal.accent, 0)]]); ctx.fillRect(x, base + R.S * 3, w, h); }
    }
    ctx.restore();
  }
  // smooth closed spectrum ring (left / right mirrored) with layered gains
  function ring(ctx, R, cx, cy, r0, amp, a0) {
    const a = R.au || SYN, sp = a.spec, N = 96, pal = R.pal, rot = (R.au ? R.au.t : R.t) * 0.08;
    const pts = (gain, phase) => { const out = []; for (let i = 0; i < N; i++) { const q = i / N, m = q < 0.5 ? q * 2 : (1 - q) * 2, b = Math.min(63, Math.floor(Math.pow(m, 1.2) * 56) + 1), v = sm(clamp(sp[b] * 0.7 + sp[Math.min(63, b + 2)] * 0.3)); const ang = q * TAU - PI / 2 + rot + phase, r = r0 + v * amp * gain; out.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]); } return out; };
    const curve = (P) => { ctx.beginPath(); for (let i = 0; i <= N; i++) { const p = P[i % N], q = P[(i + 1) % N], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; i ? ctx.quadraticCurveTo(p[0], p[1], mx, my) : ctx.moveTo(mx, my); } ctx.closePath(); };
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, r0 * 0.6, cx, cy, r0 + amp * 1.2); g.addColorStop(0, rgba(pal.accent, 0)); g.addColorStop(0.45, rgba(pal.accent, 0.16 * a0)); g.addColorStop(1, rgba(pal.sub || pal.accent, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r0 + amp * 1.2, 0, TAU); ctx.fill();
    [[1.15, 0.11, pal.sub || pal.accent, 0.35], [0.85, -0.07, pal.accent, 0.55], [0.55, 0, pal.text, 0.9]].forEach(([gn, ph, col, al]) => {
      const P = pts(gn, ph); curve(P);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * 0.25 * a0; ctx.strokeStyle = col; ctx.lineWidth = R.S * 9; ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al * a0; ctx.lineWidth = R.S * 2.2; ctx.stroke();
    });
    ctx.globalAlpha = 0.5 * a0; ctx.strokeStyle = pal.text; ctx.lineCap = 'round'; ctx.lineWidth = R.S * 1.6;
    for (let i = 0; i < 72; i++) { const q = i / 72, m = q < 0.5 ? q * 2 : (1 - q) * 2, b = Math.min(63, Math.floor(Math.pow(m, 1.2) * 56) + 1), v = sm(clamp(sp[b])), ang = q * TAU - PI / 2 - rot * 0.5, r1 = r0 * 0.88, r2 = r1 - v * r0 * 0.22 - R.S * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2); ctx.stroke(); }
    ctx.restore();
  }
  // phosphor trace with a soft glow
  function trace(ctx, R, P, col, w, al) { ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = col; const path = () => { ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
    path(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * 0.12; ctx.lineWidth = w * 7; ctx.stroke(); ctx.globalAlpha = al * 0.3; ctx.lineWidth = w * 3; ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al; ctx.lineWidth = w; ctx.stroke(); ctx.restore(); }
  const scopeAt = (R, t, n, span) => { const A = LM.audio; if (A && A.scope && A.buffer && (R.au && R.au.real !== false)) { const w = A.scope(t, n, span); let m = 0; for (let i = 0; i < w.length; i++) m = Math.max(m, Math.abs(w[i])); const g = (0.25 + 0.75 * (R.au.rms || 0)) / Math.max(0.04, m); for (let i = 0; i < w.length; i++) w[i] *= g; return w; } const o = new Float32Array(n); for (let i = 0; i < n; i++) { const u = i / n; o[i] = (Math.sin(u * TAU * 3) * 0.5 + Math.sin(u * TAU * 7 + t * 3) * 0.2) * (0.3 + (R.au || SYN).rms * 0.6); } return o; };
  function scopeLine(ctx, R, y0, amp, x0, x1, al) {
    const t = R.au ? R.au.t : R.t, pal = R.pal;
    [[2 / 60, 0.18], [1 / 60, 0.38], [0, 1]].forEach(([dt, k]) => {
      const w = scopeAt(R, t - dt, 220, 0.026), P = []; for (let i = 0; i < w.length; i++) { const u = i / (w.length - 1), e = Math.sin(PI * u); P.push([lerp(x0, x1, u), y0 - w[i] * amp * (0.35 + 0.65 * e)]); }
      trace(ctx, R, P, k < 1 ? pal.accent : pal.text, R.S * (k < 1 ? 1.6 : 2.2), al * k);
    });
  }

  /* ================= backgrounds (オーディオ) ================= */
  const BG = LM.bgm.lib, def = (id, n, f, o) => (BG[id] = Object.assign({ n, c: 'オーディオ', f, full: false, spec: true, au: true }, o || {}));
  if (!LM.bgm.cats.includes('オーディオ')) LM.bgm.cats.push('オーディオ');
  def('eqBars', 'スペクトラムバー（左右対称・ピーク表示）', (ctx, R) => bars(ctx, R, { n: 48, x: R.W * 0.06, w: R.W * 0.88, y: R.H * 0.86, h: R.H * 0.34, a: 0.9 * (R.amt || 1), refl: true }));
  def('circleSpectrum', '円形スペクトラム（なめらかなリング）', (ctx, R) => { const a = R.au || SYN; ring(ctx, R, R.W / 2, R.H / 2, R.minD * (0.3 + a.kick * 0.014), R.minD * 0.19, 0.95); });
  def('specLine', 'スペクトラムの稜線（重なる山並み）', (ctx, R) => {
    const a = R.au || SYN, pal = R.pal, base = R.H * 0.86, H = R.H * 0.38, N = 64;
    [[a.peak, pal.sub || pal.accent, 0.25, 1.06], [a.spec, pal.accent, 0.5, 1], [a.spec, pal.text, 0.9, 0.82]].forEach(([arr, col, al, gn], L) => {
      ctx.save(); ctx.beginPath(); ctx.moveTo(0, base);
      const pts = []; for (let i = 0; i <= N; i++) { const q = i / N, m = Math.abs(q - 0.5) * 2, b = Math.min(63, Math.floor(Math.pow(m, 1.15) * 60) + 1); pts.push([q * R.W, base - sm(clamp(arr[b])) * H * gn]); }
      for (let i = 0; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
      ctx.lineTo(R.W, base); ctx.closePath();
      ctx.globalAlpha = al * 0.55; ctx.fillStyle = grad(ctx, 0, base - H, 0, base, [[0, rgba(col, 0.9)], [1, rgba(col, 0)]]); ctx.fill();
      ctx.globalAlpha = al; ctx.strokeStyle = col; ctx.lineWidth = R.S * (L === 2 ? 2.2 : 1.4); ctx.stroke(); ctx.restore();
    });
  });
  def('oscilloscope', 'オシロスコープ（位相を揃えた波形）', (ctx, R) => {
    const pal = R.pal; ctx.save(); ctx.globalAlpha = 0.1; ctx.strokeStyle = pal.text; ctx.lineWidth = R.S; const gs = R.minD / 10; ctx.beginPath();
    for (let x = R.W / 2 % gs; x < R.W; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, R.H); } for (let y = R.H / 2 % gs; y < R.H; y += gs) { ctx.moveTo(0, y); ctx.lineTo(R.W, y); } ctx.stroke(); ctx.restore();
    scopeLine(ctx, R, R.H / 2, R.H * 0.36, R.W * 0.04, R.W * 0.96, 0.95);
  }, { wave: true });
  def('lissajous', 'リサージュ（ステレオと位相のXY図形）', (ctx, R) => {
    const A = LM.audio, a = R.au || SYN, t = a.t || R.t, cx = R.W / 2, cy = R.H / 2, sc = R.minD * 0.62, pal = R.pal;
    ctx.save(); ctx.globalAlpha = 0.12; ctx.strokeStyle = pal.text; ctx.lineWidth = R.S; ctx.beginPath(); ctx.arc(cx, cy, sc * 0.5, 0, TAU); ctx.moveTo(cx - sc * 0.55, cy); ctx.lineTo(cx + sc * 0.55, cy); ctx.moveTo(cx, cy - sc * 0.55); ctx.lineTo(cx, cy + sc * 0.55); ctx.stroke(); ctx.restore();
    [[0.05, 0.25, pal.accent], [0.025, 0.5, pal.accent], [0, 1, pal.text]].forEach(([dt, al, col]) => {
      let l, r; const w = A && A.waveLR && A.buffer && a.real !== false ? A.waveLR(t - dt, 700, 0.03) : null;
      if (w) { l = w.l; r = w.r; } else { l = new Float32Array(700); r = new Float32Array(700); for (let i = 0; i < 700; i++) { const u = i / 700 * TAU * 4 + t; l[i] = Math.sin(u * 3) * 0.4 * (0.4 + a.rms); r[i] = Math.sin(u * 2 + t * 0.7) * 0.4 * (0.4 + a.rms); } }
      // side (L−R) widens it, the centre signal against itself 1/4 cycle later (delay embedding) keeps a centred mix drawing loops
      let mx = 0; for (let i = 0; i < l.length; i++) mx = Math.max(mx, Math.abs(l[i] + r[i]));
      const g = (0.3 + 0.7 * (a.rms || 0)) / Math.max(0.05, mx * 0.5), lag = 9, P = [];
      for (let i = lag; i < l.length; i++) { const m0 = (l[i] + r[i]) * 0.5, m1 = (l[i - lag] + r[i - lag]) * 0.5, sd = (l[i] - r[i]) * 0.5; P.push([cx + (m1 + sd * 1.6) * g * sc * 0.5, cy - (m0 - sd * 0.6) * g * sc * 0.5]); }
      trace(ctx, R, P, col, R.S * 1.3, al * 0.9);
    });
  }, { wave: true });
  def('ridgeline', '音の山脈（スペクトラムの履歴）', (ctx, R) => {
    const a = R.au || SYN, t = a.t || R.t, pal = R.pal, L = 26, N = 56, x0 = R.W * 0.14, x1 = R.W * 0.86, top = R.H * 0.22, step = R.H * 0.022;
    ctx.save(); ctx.lineJoin = 'round';
    for (let k = L - 1; k >= 0; k--) {
      const sp = specAt(a, t - k * 0.09), y = top + (L - 1 - k) * step, H = R.H * 0.2, P = [];
      for (let i = 0; i <= N; i++) { const q = i / N, m = Math.abs(q - 0.5) * 2, b = Math.min(63, Math.floor(Math.pow(m, 1.1) * 58) + 1), env = Math.pow(Math.sin(PI * q), 1.6); P.push([lerp(x0, x1, q), y - sm(clamp(sp[b])) * H * env]); }
      ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.lineTo(x1, y + R.S * 2); ctx.lineTo(x0, y + R.S * 2); ctx.closePath();
      ctx.globalAlpha = 1; ctx.fillStyle = pal.bg; ctx.fill();
      ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
      const f = 1 - k / L; ctx.globalAlpha = 0.4 + 0.6 * f; ctx.strokeStyle = k === 0 ? pal.accent : pal.text; ctx.lineWidth = R.S * (k === 0 ? 2.4 : 1.3); ctx.stroke();
    }
    ctx.restore();
  }, { full: false });
  const SG = document.createElement('canvas'), sgx = SG.getContext('2d');
  def('spectrogram', 'スペクトログラム（流れる周波数）', (ctx, R) => {
    const a = R.au || SYN, t = a.t || R.t, C = 150; if (SG.width !== C || SG.height !== 64) { SG.width = C; SG.height = 64; }
    const pal = R.pal, cs = [U.hex2rgb(pal.bg), U.hex2rgb(pal.sub || pal.accent), U.hex2rgb(pal.accent), U.hex2rgb(pal.text)], img = sgx.createImageData(C, 64), d = img.data;
    for (let x = 0; x < C; x++) { const sp = specAt(a, t - (C - 1 - x) / 30); for (let b = 0; b < 64; b++) { const v = sm(clamp(sp[b])) * 3, k = Math.min(2, Math.floor(v)), f = v - k, A2 = cs[k], B2 = cs[k + 1], i = ((63 - b) * C + x) * 4; d[i] = A2[0] + (B2[0] - A2[0]) * f; d[i + 1] = A2[1] + (B2[1] - A2[1]) * f; d[i + 2] = A2[2] + (B2[2] - A2[2]) * f; d[i + 3] = 255; } }
    sgx.putImageData(img, 0, 0);
    ctx.save(); ctx.globalAlpha = 0.85 * (R.amt || 1); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(SG, 0, 0, R.W, R.H);
    ctx.globalAlpha = 0.9; ctx.fillStyle = grad(ctx, R.W * 0.9, 0, R.W, 0, [[0, rgba(pal.text, 0)], [1, rgba(pal.text, 0.25)]]); ctx.fillRect(R.W * 0.9, 0, R.W * 0.1, R.H); ctx.restore();
  }, { full: true });
  // onset-spawned rings / sparks: deterministic, rebuilt from the onset list every frame
  const recent = (R, band, win) => { const A = LM.audio, a = R.au || SYN, t = a.t || R.t; if (A && A.onsets && A.feat && a.real !== false) return A.onsets(band, t - win, t).map(([x, s]) => [t - x, s, x]); const per = 60 / (R.bpm || 120) / (band === 'hat' ? 2 : 1), out = []; for (let k = Math.floor(t / per); k * per > t - win; k--) out.push([t - k * per, band === 'snare' && k % 2 === 0 ? 0 : 0.9, k * per]); return out; };
  def('kickRings', 'キックで広がるリング', (ctx, R) => {
    const pal = R.pal, cx = R.W / 2, cy = R.H / 2, md = R.minD; ctx.save();
    recent(R, 'kick', 1.4).forEach(([age, s, at]) => {
      if (s < 0.3) return; const u = clamp(age / 1.4), e = 1 - Math.pow(1 - u, 3), r = md * (0.12 + e * 0.75), al = (1 - u) * (1 - u) * s;
      ctx.globalAlpha = al * 0.9; ctx.strokeStyle = hash(Math.round(at * 100), 3) > 0.5 ? pal.accent : pal.sub || pal.accent; ctx.lineWidth = R.S * (1 + 9 * (1 - u)); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = al * 0.12; ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    });
    ctx.restore();
  });
  function star(ctx, x, y, r, col, al) { const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r * 0.22, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r * 0.22, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - r * 0.7, y); ctx.quadraticCurveTo(x, y, x, y - r * 0.16); ctx.quadraticCurveTo(x, y, x + r * 0.7, y); ctx.quadraticCurveTo(x, y, x, y + r * 0.16); ctx.quadraticCurveTo(x, y, x - r * 0.7, y); ctx.fill(); ctx.globalCompositeOperation = op; ctx.globalAlpha = al * 0.3; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fill(); }
  def('hatSparks', 'ハイハットで散る光の粒', (ctx, R) => {
    const pal = R.pal; ctx.save(); ctx.globalCompositeOperation = 'lighter';
    recent(R, 'hat', 0.7).forEach(([age, s, at]) => { const id = Math.round(at * 1000), u = clamp(age / 0.7); for (let j = 0; j < 5; j++) { const x = hash(id, j, 1) * R.W, y = hash(id, j, 2) * R.H, r = R.minD * (0.02 + hash(id, j, 3) * 0.03) * (1 - u * 0.5); star(ctx, x, y - u * R.minD * 0.03, r, j % 2 ? pal.text : pal.accent, (1 - u) * (1 - u) * s); } });
    ctx.restore();
  });
  def('melodyLine', 'メロディライン（歌のピッチを描く）', (ctx, R) => {
    const a = R.au || SYN, t = a.t || R.t, pal = R.pal, px = R.W * 0.68, span = 5.5, y0 = R.H * 0.82, y1 = R.H * 0.22, X = (tt) => px + (tt - t) / span * R.W;
    ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = pal.text; ctx.lineWidth = R.S; ctx.beginPath(); for (let k = 0; k <= 12; k++) { const y = lerp(y0, y1, k / 12); ctx.moveTo(0, y); ctx.lineTo(R.W, y); } ctx.stroke();
    const seg = []; let run = []; const A = LM.audio, real = A && A.pitchAt && a.real !== false;
    for (let tt = t - span * 0.68; tt <= t + span * 0.32; tt += 1 / 40) { const p = real ? A.pitchAt(tt, true) : pitchAt(a, tt); if (p == null) { if (run.length > 1) seg.push(run); run = []; continue; } run.push([X(tt), lerp(y0, y1, clamp(p, -0.1, 1.1)), tt]); }
    if (run.length > 1) seg.push(run);
    seg.forEach((P) => { const past = P.filter((q) => q[2] <= t), fut = P.filter((q) => q[2] >= t); if (past.length > 1) trace(ctx, R, past, pal.accent, R.S * 3.2, 0.95); if (fut.length > 1) { ctx.setLineDash([R.S * 4, R.S * 6]); trace(ctx, R, fut, pal.text, R.S * 1.6, 0.35); ctx.setLineDash([]); } });
    ctx.globalAlpha = 0.25; ctx.fillStyle = pal.text; ctx.fillRect(px - R.S * 0.75, 0, R.S * 1.5, R.H);
    const pn = real ? A.pitchAt(t, true) : pitchAt(a, t); if (pn != null) { const y = lerp(y0, y1, clamp(pn, -0.1, 1.1)); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.arc(px, y, R.S * 14, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = pal.text; ctx.beginPath(); ctx.arc(px, y, R.S * 4.5, 0, TAU); ctx.fill(); }
    ctx.restore();
  });
  def('levelMeters', 'レベルメーター（左右の音量）', (ctx, R) => {
    const a = R.au || SYN, pal = R.pal, segs = 22, h = R.H * 0.62, y0 = R.H * 0.81, sh = h / segs;
    [[R.W * 0.055, clamp(a.rms * (1 - Math.max(0, a.pan) * 0.6) * 1.12)], [R.W * 0.945, clamp(a.rms * (1 + Math.min(0, a.pan) * 0.6) * 1.12)]].forEach(([x, v], si) => {
      const on = Math.round(v * segs), pk = Math.min(segs - 1, Math.round(clamp(v + (a.peak ? a.peak[2] - a.spec[2] : 0.05)) * segs)), w = R.minD * 0.045;
      for (let k = 0; k < segs; k++) { const col = k > segs * 0.85 ? '#ff4a4a' : k > segs * 0.65 ? pal.accent : pal.text, lit = k < on || k === pk; ctx.globalAlpha = lit ? 0.95 : 0.1; ctx.fillStyle = col; ctx.fillRect(x - w / 2, y0 - (k + 1) * sh + sh * 0.18, w, sh * 0.64); }
      void si;
    });
  });

  /* ================= overlays (音に反応) ================= */
  FX.cats.audio = '音に反応';
  const FO = FX.O, FL = FX.list, F = (n, k) => ({ n, c: 'audio', k });
  Object.assign(FL, {
    audioBars: F('オーディオバー（下に並ぶスペクトラム）', 'under'), audioWave: F('オーディオ波形（オシロスコープの線）', 'under'),
    hatGlint: F('ハイハットで歌詞にきらめき', 'over'),
    kickZoom: F('キックで画面が脈打つ', 'post'), bassShock: F('低音の衝撃波（画面が波打つ）', 'post'), rmsGlow: F('音量で光る（ブルーム連動）', 'post'),
    snareFlash: F('スネアで露出フラッシュ', 'post'), chordColor: F('コードで色温度が変わる（長調＝暖色）', 'post'), reverbTrail: F('残響で残像が伸びる', 'post'),
    stereoSplit: F('ステレオの広がりでRGBがずれる', 'post'), autoIntensity: F('曲の盛り上がりでエフェクトの強さが変わる', 'post'),
  });
  FO.audioBars = (ctx, R) => bars(ctx, R, { n: 64, x: R.W * 0.04, w: R.W * 0.92, y: R.H * 0.965, h: R.H * 0.16, a: 0.75 * clamp(R.amt, 0, 1.5), peaks: true });
  FO.audioWave = (ctx, R) => scopeLine(ctx, R, R.H * 0.86, R.H * 0.09, R.W * 0.05, R.W * 0.95, 0.85 * clamp(R.amt, 0, 1.5));
  FO.hatGlint = (ctx, R) => {
    const b = R.bbox, pal = R.pal; if (!b) return; ctx.save(); ctx.globalCompositeOperation = 'lighter';
    recent(R, 'hat', 0.45).forEach(([age, s, at]) => { const id = Math.round(at * 1000), u = clamp(age / 0.45); for (let j = 0; j < 3; j++) { const x = b.x + hash(id, j, 5) * b.w, y = b.y + hash(id, j, 6) * b.h, r = R.minD * (0.018 + hash(id, j, 7) * 0.025) * (1 - u * 0.4); star(ctx, x, y, r, j ? pal.text : pal.accent, (1 - u) * (1 - u) * s * clamp(R.amt, 0, 1.5)); } });
    ctx.restore();
  };

  /* ================= post shader (extends LM.POSTX from pro3) ================= */
  const PX = LM.POSTX;
  if (PX) {
    const UN = ['auZ', 'auShk', 'auShT', 'auFl', 'auMood', 'auCol'];
    PX.uni = PX.uni.concat(UN);
    PX.decl += `\nuniform float ${UN.join(',')};\n`;
    PX.uv = `
 if(auZ>0.0){vec2 c=u-.5;u=.5+c*(1.-auZ*.06);}
 if(auShk>0.0){float ar=R.x/R.y;vec2 c=(u-.5)*vec2(ar,1.);float r=length(c),rr=.06+auShT*1.25,w=.05+auShT*.08,q=(r-rr)/w;float k=q*exp(-q*q)*auShk*pow(1.-auShT,1.5);u-=normalize(c+1e-5)/vec2(ar,1.)*k*.014;}
` + PX.uv;
    PX.col += `
 if(auFl>0.0){vec3 e=1.-exp(-c*(1.+auFl*1.6)*1.25);e/=1.-exp(-(1.+auFl*1.6)*1.25);c=mix(c,e+vec3(.035)*auFl,clamp(auFl,0.,1.));}
 if(auCol>0.0){float L=Lm(c);vec3 w=c*vec3(1.09,1.0,.86)+vec3(.02,.005,-.02),cl=c*vec3(.88,.98,1.12)+vec3(-.015,.0,.03);c=mix(c,mix(cl,w,clamp(auMood*.5+.5,0.,1.)),auCol*(.55+.45*smoothstep(.1,.7,L)));}
`;
    const p0 = PX.params;
    PX.params = function (g, u, ctx) {
      p0.call(this, g, u, ctx);
      UN.forEach((n) => (u[n] = 0));
      const a = ctx.au || SYN, has = ctx.has, S = ctx.S || 1;
      if (has('kickZoom')) u.auZ = g('kickZoom') * (a.kick * 0.9 + a.bass * 0.15);
      if (has('bassShock')) {
        const A = LM.audio, t = a.t, tk = A && A.lastOnset && A.feat && a.real !== false ? A.lastOnset(t, 'kick', 0.45) : null, dt = tk != null ? t - tk : a.kick > 0.01 ? -Math.log(a.kick) * 0.11 : 9;
        if (dt < 0.9) { u.auShT = clamp(dt / 0.9); u.auShk = g('bassShock') * (0.6 + a.bass * 0.6); }
      }
      if (has('rmsGlow')) { u.bloom = Math.max(u.bloom || 0, g('rmsGlow') * (0.1 + Math.pow(a.rms, 1.6) * 1.1 + a.kick * 0.25)); u.needBlur = true; }
      if (has('snareFlash')) u.auFl = clamp(g('snareFlash') * a.snare);
      if (has('chordColor')) { u.auCol = clamp(g('chordColor')); u.auMood = a.mood; }
      if (has('reverbTrail')) { u.fb = Math.max(u.fb || 0, clamp(g('reverbTrail') * (0.2 + a.space * 0.85), 0, 1.2)); u.needFB = true; }
      if (has('stereoSplit')) u.rgb = Math.max(u.rgb || 0, g('stereoSplit') * S * (1.5 + a.width * 18 + a.kick * 5));
      if (has('autoIntensity')) {
        const k = 0.3 + clamp(a.arousal) * 1.15 * g('autoIntensity');
        ['bloom', 'glitch', 'block', 'rgb', 'noise', 'grainS', 'vhs', 'zblur', 'fb', 'ana', 'spin', 'rshut', 'jam', 'mosh', 'halo', 'auZ', 'auShk'].forEach((n) => { if (u[n]) u[n] *= k; });
      }
    };
  }

  /* ================= cameras (音に反応) ================= */
  Object.assign(LM.data.cameras, { auBass: '低音でカメラが押し込まれる', auSway: 'ステレオの定位でカメラが振れる', auShake: 'スネアでカメラが揺れる' });
  Object.assign(LM.cam2 = LM.cam2 || {}, {
    auBass: (lx, k) => { const a = k.au || SYN, z = 1.02 + (a.kick * 0.045 + a.bass * 0.012) * k.amp; lx.scale(z, z); },
    auSway: (lx, k) => { const a = k.au || SYN; lx.translate(-a.pan * k.W * 0.035 * k.amp, 0); lx.rotate(a.pan * 0.02 * k.amp); const z = 1.04; lx.scale(z, z); },
    auShake: (lx, k) => { const a = k.au || SYN, s = a.snare * k.amp * k.S, t = k.t; lx.translate(Math.sin(t * 61) * 9 * s, Math.cos(t * 53) * 7 * s); lx.rotate(Math.sin(t * 47) * 0.012 * a.snare * k.amp); const z = 1.03 + a.kick * 0.015 * k.amp; lx.scale(z, z); },
  });

  /* director metadata: energy (0..1) and feel tags */
  LM.director_OVR = {
    hold: { auPump: [0.72, 'snap bounce'], auLoud: [0.4, 'smooth cinema'], auVocal: [0.45, 'organic'], auHat: [0.6, 'bounce glitch'], auWave: [0.55, 'organic glitch'], auSpec: [0.65, 'glitch kinetic'], auPitch: [0.35, 'smooth organic'], auMelody: [0.3, 'smooth kinetic'], auPan: [0.4, 'smooth'], auEcho: [0.3, 'cinema smooth'], auDrums: [0.78, 'snap bounce'] },
    cam: { auBass: [0.7, 'snap bounce'], auSway: [0.35, 'smooth organic'], auShake: [0.85, 'snap glitch'] },
  };

  /* ================= themes & auto direction ================= */
  const D = LM.data, addTo = (id, key, o) => { const t = D.themeById[id]; if (t) t[key] = Object.assign({}, t[key] || {}, o); }, setR = (id, v) => { const t = D.themeById[id]; if (t) t.react = v; };
  const HOT = ['edm', 'house', 'techno', 'trap', 'hyperpop', 'kpop', 'dubstep', 'club', 'psyche', 'vj', 'rock', 'metal', 'punk', 'hiphop', 'vocaloid', 'chiptune', 'funk', 'latin', 'anison'];
  HOT.forEach((id) => setR(id, ['edm', 'house', 'techno', 'trap', 'hyperpop', 'dubstep', 'club'].includes(id) ? 60 : 42));
  ['ballad', 'acoustic', 'jazz', 'classical', 'ambient', 'dream', 'lofi', 'wa', 'minimal', 'cinematic'].forEach((id) => setR(id, 16));
  [['edm', { auPump: 2, auDrums: 1 }, { eqBars: 1.5, circleSpectrum: 1.5, kickRings: 1.5, specLine: 1 }, { kickZoom: 1.5, bassShock: 1, rmsGlow: 1, autoIntensity: 0.8 }],
    ['house', { auPump: 2 }, { eqBars: 1.2, kickRings: 1.2, specLine: 1 }, { kickZoom: 1.2, rmsGlow: 1 }],
    ['techno', { auPump: 1.5, auDrums: 1.5 }, { oscilloscope: 1.2, spectrogram: 1, kickRings: 1.2, ridgeline: 1 }, { kickZoom: 1.2, bassShock: 1.2, stereoSplit: 0.8 }],
    ['trap', { auPump: 1.5, auDrums: 1 }, { circleSpectrum: 1.2, kickRings: 1 }, { bassShock: 1.5, kickZoom: 1, snareFlash: 0.8 }],
    ['hyperpop', { auHat: 1.5, auPump: 1 }, { hatSparks: 1.5, circleSpectrum: 1 }, { kickZoom: 1, stereoSplit: 1, snareFlash: 1, hatGlint: 1 }],
    ['kpop', { auPump: 1, auHat: 1 }, { hatSparks: 1, eqBars: 0.8 }, { kickZoom: 0.8, hatGlint: 1, rmsGlow: 0.8 }],
    ['vocaloid', { auWave: 1.5, auSpec: 1.2 }, { oscilloscope: 1.5, lissajous: 1, spectrogram: 0.8 }, { stereoSplit: 1, audioWave: 0.8 }],
    ['chiptune', { auSpec: 1.5, auHat: 1 }, { eqBars: 1.5, levelMeters: 1, oscilloscope: 1 }, { audioBars: 1, kickZoom: 0.8 }],
    ['rock', { auDrums: 1.5, auLoud: 1 }, { levelMeters: 0.8, kickRings: 0.6 }, { snareFlash: 1, kickZoom: 0.8, autoIntensity: 1 }],
    ['metal', { auDrums: 1.5 }, { kickRings: 0.8 }, { bassShock: 1, snareFlash: 1.2, autoIntensity: 1 }],
    ['punk', { auDrums: 1.5 }, {}, { snareFlash: 1.2, kickZoom: 1 }],
    ['hiphop', { auPump: 1.5, auDrums: 1 }, { circleSpectrum: 0.8, levelMeters: 0.6 }, { bassShock: 1, kickZoom: 1 }],
    ['funk', { auDrums: 1.5, auPan: 1 }, { eqBars: 0.8 }, { kickZoom: 0.8, snareFlash: 0.8 }],
    ['latin', { auDrums: 1.2, auPan: 1 }, { hatSparks: 0.8 }, { kickZoom: 0.8 }],
    ['anison', { auPump: 1, auHat: 1 }, { hatSparks: 0.8 }, { kickZoom: 0.8, hatGlint: 0.8 }],
    ['ballad', { auVocal: 1.2, auMelody: 0.8 }, { melodyLine: 0.8 }, { chordColor: 1.2, rmsGlow: 0.8, reverbTrail: 0.6 }],
    ['acoustic', { auVocal: 1, auMelody: 1 }, { melodyLine: 0.8 }, { chordColor: 1 }],
    ['jazz', { auPitch: 1, auVocal: 1 }, { melodyLine: 1 }, { chordColor: 1.2 }],
    ['classical', { auPitch: 1, auMelody: 1 }, { ridgeline: 0.8, melodyLine: 0.8 }, { chordColor: 1.2, reverbTrail: 0.6 }],
    ['ambient', { auEcho: 1.5, auVocal: 0.8 }, { ridgeline: 1.2, spectrogram: 0.8 }, { reverbTrail: 1.5, chordColor: 0.8 }],
    ['dream', { auEcho: 1.2, auPitch: 0.8 }, { ridgeline: 1, circleSpectrum: 0.6 }, { reverbTrail: 1.2, rmsGlow: 1, chordColor: 1 }],
    ['lofi', { auVocal: 0.8, auPan: 0.6 }, { specLine: 0.8, levelMeters: 0.6 }, { chordColor: 1, audioBars: 0.6 }],
    ['cinematic', { auLoud: 1, auEcho: 0.8 }, { ridgeline: 1 }, { rmsGlow: 1, chordColor: 1, autoIntensity: 1 }],
    ['vj', { auSpec: 1, auPump: 1 }, { spectrogram: 1.2, ridgeline: 1.2, lissajous: 1, circleSpectrum: 1 }, { kickZoom: 1, bassShock: 1, stereoSplit: 1, autoIntensity: 1 }],
    ['psyche', { auPitch: 1, auEcho: 1 }, { lissajous: 1, circleSpectrum: 1 }, { reverbTrail: 1, kickZoom: 0.8, stereoSplit: 0.8 }],
    ['citypop', { auPan: 1, auLoud: 0.8 }, { specLine: 0.8, eqBars: 0.6 }, { chordColor: 1, rmsGlow: 0.8 }],
    ['jpop', { auHat: 0.8, auPump: 0.8 }, { hatSparks: 0.6 }, { hatGlint: 0.8, kickZoom: 0.6 }],
  ].forEach(([id, hold, bgm, fil]) => { addTo(id, 'hold', hold); addTo(id, 'bgm', bgm); addTo(id, 'filters', fil); });
  [['edm', { auBass: 1.2 }], ['house', { auBass: 1 }], ['techno', { auBass: 1, auShake: 0.6 }], ['trap', { auBass: 1.2 }], ['hiphop', { auBass: 1 }], ['rock', { auShake: 1 }], ['metal', { auShake: 1.2 }], ['punk', { auShake: 1 }], ['funk', { auSway: 1 }], ['latin', { auSway: 1 }], ['citypop', { auSway: 0.8 }], ['psyche', { auSway: 0.8 }]].forEach(([id, o]) => addTo(id, 'camera', o));
})();
