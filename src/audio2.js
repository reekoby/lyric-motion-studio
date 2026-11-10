/* Effect catalogue phase 4 — offline audio analysis for audio-reactive motion (§10 AU-01〜20, TM-05/06/22/23).
 * Everything is computed once when a song is loaded, on a fixed 86 fps grid, so preview and export read the very
 * same numbers (nothing depends on real-time playback):
 *  - loudness (RMS) and band levels: bass / mid / high, plus a "vocal" level taken from the centre of the stereo
 *    image (mid minus side, 250 Hz–4 kHz) as a light stand-in for vocal separation
 *  - per-band onsets: kick (35–120 Hz), snare (body + crack), hi-hat (7 kHz+), and all-band; adaptive threshold
 *    and peak picking, each with a strength
 *  - a 64-band log spectrum with tilt compensation, attack / release smoothing and falling peak caps (AU-06/07/20)
 *  - stereo pan and width, an "ambience" level (reverb-ish wash), spectral brightness
 *  - sung pitch (YIN on the centre channel, octave-corrected and median-filtered) for AU-12/13
 *  - chroma → key (Krumhansl profiles) and a major / minor mood curve (AU-18), an arousal curve (AU-19)
 *  - dynamic-programming beat tracking that follows tempo drift (TM-06), re-derived downbeat
 *  - song structure from a self-similarity matrix (repetition + loudness + vocal presence) → intro / verses /
 *    pre-chorus / chorus / interlude / bridge / outro (TM-23), and breath points between sung phrases (TM-22)
 * The renderer reads it through LM.audio.frame(t, smooth) / lastOnset / scope / waveLR. */
'use strict';
(() => {
  const A = LM.audio, fft = A.fft;
  const FPS = 86, NB = 64;
  let F = null;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const tick = () => new Promise((r) => setTimeout(r, 0));

  function pct(arr, q, step = 1, mask) {
    const a = [];
    for (let i = 0; i < arr.length; i += step) { const v = arr[i]; if (Number.isFinite(v) && (!mask || mask[i])) a.push(v); }
    if (!a.length) return 0;
    a.sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))];
  }
  function norm(arr, lo = 0.1, hi = 0.985) { const a = pct(arr, lo, 3), b = pct(arr, hi, 3), d = Math.max(1e-6, b - a); for (let i = 0; i < arr.length; i++) arr[i] = clamp((arr[i] - a) / d); return arr; }
  // envelope follower with separate attack / release (seconds) — AU-20
  function env(x, att, rel) {
    const o = new Float32Array(x.length), ka = 1 - Math.exp(-1 / (FPS * Math.max(1e-3, att))), kr = 1 - Math.exp(-1 / (FPS * Math.max(1e-3, rel)));
    let e = x[0] || 0; for (let i = 0; i < x.length; i++) { const v = x[i]; e += (v - e) * (v > e ? ka : kr); o[i] = e; } return o;
  }
  function box(x, r) {
    r = Math.max(1, Math.round(r)); const n = x.length, P = new Float64Array(n + 1), o = new Float32Array(n);
    for (let i = 0; i < n; i++) P[i + 1] = P[i] + x[i];
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - r), b = Math.min(n, i + r + 1); o[i] = (P[b] - P[a]) / (b - a); }
    return o;
  }
  const db = (p) => 10 * Math.log10(p + 1e-12);

  // adaptive-threshold peak picking on a novelty curve → {t: Float32Array, s: Float32Array}
  function pick(flux, minGap, k) {
    const n = flux.length, sc = pct(flux, 0.98, 2) || 1, x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = flux[i] / sc;
    const r = Math.round(FPS * 0.3), m = box(x, r), sq = new Float32Array(n); for (let i = 0; i < n; i++) sq[i] = x[i] * x[i];
    const m2 = box(sq, r), T = [], S = []; let last = -1e9; const gap = Math.round(minGap * FPS);
    for (let i = 2; i < n - 2; i++) {
      const v = x[i], sd = Math.sqrt(Math.max(0, m2[i] - m[i] * m[i])), th = m[i] + k * sd + 0.07;
      if (v <= th || v < x[i - 1] || v < x[i + 1] || v < x[i - 2] || v < x[i + 2]) continue;
      if (i - last < gap) { if (S.length && v > S[S.length - 1] * 1.4) { /* stronger hit right after: replace */ T.pop(); S.pop(); } else continue; }
      const a = x[i - 1], b = x[i + 1], den = a - 2 * v + b, dl = den < 0 ? clamp(0.5 * (a - b) / den, -0.5, 0.5) : 0;
      T.push((i + dl) / FPS); S.push(clamp((v - th) / Math.max(0.2, 1 - th) * 0.8 + 0.25)); last = i;
    }
    return { t: Float32Array.from(T), s: Float32Array.from(S) };
  }

  /* ---------- YIN pitch on the centre channel (AU-12/13) ---------- */
  async function pitchTrack(buf, vocal, onP) {
    const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
    const dec = Math.max(1, Math.round(sr / 11025)), rs = sr / dec, N = Math.floor(buf.length / dec), x = new Float32Array(N);
    for (let i = 0; i < N; i++) { let s = 0; const o = i * dec; for (let k = 0; k < dec; k++) s += (L[o + k] || 0) + (R[o + k] || 0); x[i] = s / (2 * dec); }
    // high-pass 110 Hz (keeps bass lines out) + low-pass 1.6 kHz, RBJ biquads
    const biq = (f0, hp) => { const w = 2 * Math.PI * f0 / rs, al = Math.sin(w) / (2 * 0.707), c = Math.cos(w), a0 = 1 + al;
      const b0 = hp ? (1 + c) / 2 : (1 - c) / 2, b1 = hp ? -(1 + c) : 1 - c; return [b0 / a0, b1 / a0, b0 / a0, -2 * c / a0, (1 - al) / a0]; };
    for (const [b0, b1, b2, a1, a2] of [biq(110, true), biq(1600, false)]) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < N; i++) { const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; } }
    const W = Math.round(rs * 0.036), tMin = Math.floor(rs / 1000), tMax = Math.ceil(rs / 85), PF = FPS / 2, n = Math.ceil(buf.duration * PF);
    const d = new Float32Array(tMax + 2), midi = new Float32Array(n).fill(NaN), conf = new Float32Array(n);
    for (let f = 0; f < n; f++) {
      if (f % 400 === 0) { onP && onP(f / n); await tick(); }
      const vi = Math.min(vocal.length - 1, f * 2); if (vocal[vi] < 0.18) continue;
      const s0 = Math.round(f / PF * rs) - (W >> 1); if (s0 < 0 || s0 + W + tMax >= N) continue;
      let run = 0; d[0] = 1;
      for (let tau = 1; tau <= tMax; tau++) {
        let s = 0; for (let j = 0; j < W; j++) { const q = x[s0 + j] - x[s0 + j + tau]; s += q * q; }
        run += s; d[tau] = run > 0 ? s * tau / run : 1;
      }
      let best = -1;
      for (let tau = tMin; tau < tMax; tau++) if (d[tau] < 0.16) { while (tau + 1 < tMax && d[tau + 1] < d[tau]) tau++; best = tau; break; }
      let cf = 0;
      if (best < 0) { let mv = 1; for (let tau = tMin; tau < tMax; tau++) if (d[tau] < mv) { mv = d[tau]; best = tau; } if (mv > 0.4) continue; }
      const a = d[best - 1], b = d[best], c = d[best + 1], den = a - 2 * b + c, tt = den > 0 ? best + 0.5 * (a - c) / den : best;
      cf = 1 - b; if (cf < 0.55) continue;
      midi[f] = 69 + 12 * Math.log2(rs / tt / 440); conf[f] = cf;
    }
    // octave correction against a running median, then a 5-tap median filter and short-gap fill
    const med = (arr, i, r) => { const a = []; for (let k = i - r; k <= i + r; k++) if (k >= 0 && k < arr.length && Number.isFinite(arr[k])) a.push(arr[k]); if (!a.length) return NaN; a.sort((p, q) => p - q); return a[a.length >> 1]; };
    const m1 = midi.slice();
    for (let i = 0; i < n; i++) if (Number.isFinite(midi[i])) { const md = med(midi, i, 22); if (Number.isFinite(md) && Math.abs(midi[i] - md) > 8) m1[i] = midi[i] - 12 * Math.round((midi[i] - md) / 12); }
    const m2 = new Float32Array(n).fill(NaN); for (let i = 0; i < n; i++) if (Number.isFinite(m1[i])) m2[i] = med(m1, i, 2);
    let lastV = -1; for (let i = 0; i < n; i++) if (Number.isFinite(m2[i])) { if (lastV >= 0 && i - lastV > 1 && i - lastV <= PF * 0.12) for (let k = lastV + 1; k < i; k++) { const u = (k - lastV) / (i - lastV); m2[k] = m2[lastV] + (m2[i] - m2[lastV]) * u; conf[k] = Math.min(conf[lastV], conf[i]); } lastV = i; }
    // gap-filled, gently smoothed contour for motion (holds the last sung note through consonants and breaths)
    const fill = new Float32Array(n); let lv = NaN; for (let i = 0; i < n; i++) { if (Number.isFinite(m2[i])) lv = m2[i]; fill[i] = lv; }
    let fv = NaN; for (let i = 0; i < n; i++) { if (Number.isFinite(fill[i])) { fv = fill[i]; break; } } for (let i = 0; i < n && !Number.isFinite(fill[i]); i++) fill[i] = Number.isFinite(fv) ? fv : 60;
    const ka = 1 - Math.exp(-1 / (PF * 0.07)); let e = fill[0]; for (let i = 0; i < n; i++) { e += (fill[i] - e) * ka; fill[i] = e; }
    return { midi: m2, conf, pf: PF, fill };
  }

  /* ---------- dynamic-programming beat tracker (Ellis 2007) — follows tempo drift ---------- */
  function trackBeats(O, bpm) {
    const n = O.length, P = (60 * FPS) / bpm; if (!(P > 8) || n < P * 8) return null;
    const C = new Float32Array(n), back = new Int32Array(n).fill(-1), alpha = 120;
    for (let t = 0; t < n; t++) {
      let bv = -1e9, bi = -1; const a = Math.max(0, Math.round(t - 2 * P)), b = Math.round(t - P / 2);
      for (let tau = a; tau <= b; tau++) { const r = Math.log((t - tau) / P), v = C[tau] - alpha * r * r; if (v > bv) { bv = v; bi = tau; } }
      C[t] = O[t] + (bi >= 0 ? Math.max(0, bv) : 0); back[t] = bv > 0 ? bi : -1;
    }
    let t = n - 1, bv = -1e9; for (let k = Math.max(0, Math.round(n - P)); k < n; k++) if (C[k] > bv) { bv = C[k]; t = k; }
    const out = []; while (t >= 0) { out.push(t); t = back[t]; }
    out.reverse();
    return out.map((i) => { const a = O[i - 1] || 0, b = O[i], c = O[i + 1] || 0, den = a - 2 * b + c; return (i + (den < 0 ? clamp(0.5 * (a - c) / den, -0.5, 0.5) : 0)) / FPS; });
  }

  /* ---------- key / mood from chroma (AU-18) ---------- */
  const KMAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], KMIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  function corr(a, b, sh) { let ma = 0, mb = 0; for (let i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; } ma /= 12; mb /= 12; let s = 0, sa = 0, sb = 0; for (let i = 0; i < 12; i++) { const x = a[(i + sh) % 12] - ma, y = b[i] - mb; s += x * y; sa += x * x; sb += y * y; } return s / Math.sqrt(sa * sb + 1e-12); }

  /* ---------- structure from a self-similarity matrix (TM-23) ---------- */
  function structure(blk, loud, voc, dur, beats, downbeat) {
    const B = blk.length; if (B < 24) return null;
    const dim = blk[0].length, sim = (i, j) => { let s = 0; const a = blk[i], b = blk[j]; for (let k = 0; k < dim; k++) s += a[k] * b[k]; return s; };
    // Foote novelty with a Gaussian-tapered checkerboard kernel (±8 blocks = ±8 s)
    const K = 8, nov = new Float32Array(B);
    for (let i = K; i < B - K; i++) {
      let s = 0;
      for (let a = -K; a < K; a++) for (let b = -K; b < K; b++) { const g = Math.exp(-((a + 0.5) ** 2 + (b + 0.5) ** 2) / (2 * (K * 0.5) ** 2)), sg = (a < 0) === (b < 0) ? 1 : -1; s += sg * g * sim(i + a, i + b); }
      nov[i] = Math.max(0, s);
    }
    // loudness jumps help where harmony repeats but the arrangement changes
    for (let i = 4; i < B - 4; i++) { let l = 0, r = 0; for (let k = 1; k <= 4; k++) { l += loud[i - k]; r += loud[i + k - 1]; } nov[i] += Math.abs(r - l) * 0.9; }
    const mx = Math.max(...nov) || 1; for (let i = 0; i < B; i++) nov[i] /= mx;
    const cand = []; for (let i = 2; i < B - 2; i++) if (nov[i] > 0.18 && nov[i] >= nov[i - 1] && nov[i] >= nov[i + 1]) cand.push([nov[i], i]);
    cand.sort((a, b) => b[0] - a[0]);
    const cuts = [0]; for (const [, i] of cand) if (cuts.every((c) => Math.abs(c - i) >= 7)) cuts.push(i);
    cuts.sort((a, b) => a - b);
    // snap boundaries to the nearest bar line
    const barT = []; if (beats && beats.length > 8) for (let k = downbeat || 0; k < beats.length; k += 4) barT.push(beats[k]);
    const snap = (t) => { if (!barT.length || t <= 0) return t; let b = barT[0]; for (const x of barT) if (Math.abs(x - t) < Math.abs(b - t)) b = x; return Math.abs(b - t) < 1.6 ? b : t; };
    const segs = cuts.map((c, k) => { const e = k < cuts.length - 1 ? cuts[k + 1] : B; let l = 0, v = 0; for (let i = c; i < e; i++) { l += loud[i]; v += voc[i]; } const mv = new Float32Array(dim); for (let i = c; i < e; i++) for (let d = 0; d < dim; d++) mv[d] += blk[i][d]; let nn = 0; for (let d = 0; d < dim; d++) nn += mv[d] * mv[d]; nn = Math.sqrt(nn) || 1; for (let d = 0; d < dim; d++) mv[d] /= nn; return { a: c, b: e, t0: c === 0 ? 0 : snap(c), t1: e >= B ? dur : snap(e), loud: l / (e - c), voc: v / (e - c), mv }; });
    // group segments that repeat (cosine of mean vectors + block-diagonal similarity)
    const g = new Array(segs.length).fill(-1); let ng = 0;
    for (let i = 0; i < segs.length; i++) {
      if (g[i] >= 0) continue; g[i] = ng;
      for (let j = i + 1; j < segs.length; j++) {
        if (g[j] >= 0) continue;
        // compare the two sections bar by bar along the diagonal (chord order matters, not just the chord set)
        const li = segs[i].b - segs[i].a, lj = segs[j].b - segs[j].a, m = Math.min(li, lj); let s = 0;
        for (let k = 0; k < m; k++) s += sim(segs[i].a + k, segs[j].a + k); s /= Math.max(1, m);
        if (s > 0.9 && Math.abs(segs[i].loud - segs[j].loud) < 0.14 && m / Math.max(li, lj) > 0.4) g[j] = ng;
      }
      ng++;
    }
    const L = segs.map((s) => s.loud).sort((a, b) => a - b), hiL = L[Math.floor(L.length * 0.6)] || 0, loL = L[Math.floor(L.length * 0.25)] || 0;
    // chorus = the loud, sung group that repeats most
    let best = -1, bestS = -1e9;
    for (let q = 0; q < ng; q++) {
      const m = segs.filter((_, i) => g[i] === q); const ml = m.reduce((s, x) => s + x.loud, 0) / m.length, mv = m.reduce((s, x) => s + x.voc, 0) / m.length;
      const sc = ml * 2 + (m.length - 1) * 0.35 + (mv > 0.3 ? 0.4 : -0.6) + (m[0].a > B * 0.15 ? 0.2 : -0.3); if (sc > bestS) { bestS = sc; best = q; }
    }
    const types = segs.map((s, i) => {
      if (s.voc < 0.25) return i === 0 ? 'intro' : i === segs.length - 1 ? 'outro' : 'inter';
      if (g[i] === best && s.loud >= loL) return 'chorus';
      return '';
    });
    let seenC = false; const verseG = (segs.find((s, i) => !types[i]) || {}).a != null ? g[types.findIndex((x) => !x)] : -1;
    const cLen = Math.max(8, ...segs.filter((_, i) => types[i] === 'chorus').map((s) => s.b - s.a));
    segs.forEach((s, i) => {
      if (types[i]) { if (types[i] === 'chorus') seenC = true; return; }
      const nextC = types[i + 1] === 'chorus', len = s.b - s.a, uniq = segs.filter((_, j) => g[j] === g[i]).length === 1;
      if (i === segs.length - 1 && s.loud <= hiL && seenC) types[i] = 'outro';
      else if (g[i] === verseG) types[i] = 'A';
      else if (nextC && len <= Math.max(20, cLen * 0.75)) types[i] = 'B';
      else if (seenC && uniq && i > segs.length * 0.5) types[i] = s.loud < loL ? 'bridge' : 'C';
      else types[i] = seenC ? 'B' : 'A';
    });
    const out = []; segs.forEach((s, i) => { const ty = types[i]; if (out.length && out[out.length - 1].type === ty && ty !== 'chorus') { out[out.length - 1].t1 = s.t1; return; } out.push({ t0: s.t0, t1: s.t1, type: ty, loud: s.loud }); });
    return out;
  }

  /* ---------- main analysis ---------- */
  async function features(onP) {
    const buf = A.buffer; if (!buf) return null;
    const sr = buf.sampleRate, dur = buf.duration, L = buf.getChannelData(0), Rc = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    const win = sr > 64000 ? 4096 : 2048, half = win / 2, NF = Math.ceil(dur * FPS) + 1, binHz = sr / win;
    const hann = new Float32Array(win); for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));
    const mr = new Float32Array(win), mi = new Float32Array(win), mag = new Float32Array(half), smag = new Float32Array(half), prev = new Float32Array(half), lg = new Float32Array(half);
    const fHi = Math.min(16000, sr * 0.45), fLo = 30, edge = (b) => fLo * Math.pow(fHi / fLo, b / NB);
    const bandK = []; for (let b = 0; b < NB; b++) { const e0 = edge(b), e1 = edge(b + 1); bandK.push([e0 / binHz, e1 / binHz, Math.sqrt(e0 * e1) / binHz, Math.max(-14, Math.min(12, 3 * Math.log2(Math.sqrt(e0 * e1) / 1000)))]); }
    const rng = (f0, f1) => [Math.max(1, Math.round(f0 / binHz)), Math.min(half - 1, Math.round(f1 / binHz))];
    const kB = rng(35, 120), bB = rng(40, 250), mB = rng(250, 4000), hB = rng(5000, 16000), s1 = rng(180, 350), s2 = rng(1800, 6000), hh = rng(7000, 16000), cB = rng(60, 10000);
    const pc = new Int8Array(half).fill(-1); for (let k = 1; k < half; k++) { const f = k * binHz; if (f >= 55 && f <= 2000) pc[k] = ((Math.round(12 * Math.log2(f / 440)) + 69) % 12 + 12) % 12; }
    const spec = new Float32Array(NF * NB), rms = new Float32Array(NF), eb = new Float32Array(NF), em = new Float32Array(NF), eh = new Float32Array(NF), ev = new Float32Array(NF);
    const fk = new Float32Array(NF), fs = new Float32Array(NF), fh = new Float32Array(NF), fa = new Float32Array(NF), cent = new Float32Array(NF), pan = new Float32Array(NF), wid = new Float32Array(NF);
    const NC = Math.ceil(NF / 4), chroma = new Float32Array(NC * 12);
    for (let f = 0; f < NF; f++) {
      const st = Math.round((f * sr) / FPS) - half; let ll = 0, rr = 0, mm = 0, ss = 0;
      for (let i = 0; i < win; i++) {
        const j = st + i, l = j >= 0 && j < L.length ? L[j] : 0, r = Rc ? (j >= 0 && j < Rc.length ? Rc[j] : 0) : l, m = (l + r) * 0.5, s = (l - r) * 0.5;
        ll += l * l; rr += r * r; mm += m * m; ss += s * s; mr[i] = m * hann[i]; mi[i] = s * hann[i];
      }
      // one complex FFT carries both real signals (mid in re, side in im); split with conjugate symmetry
      fft(mr, mi);
      const g = 2 / win;
      for (let k = 0; k < half; k++) {
        const j = k ? win - k : 0, ar = mr[k], ai = mi[k], br = mr[j], bi = mi[j];
        const xr = ar + br, xi = ai - bi, yr = ai + bi, yi = br - ar;
        mag[k] = Math.sqrt(xr * xr + xi * xi) * g; smag[k] = Rc ? Math.sqrt(yr * yr + yi * yi) * g : 0; lg[k] = Math.log(1 + mag[k] * 1000);
      }
      rms[f] = db(mm / win); pan[f] = (Math.sqrt(rr) - Math.sqrt(ll)) / (Math.sqrt(rr) + Math.sqrt(ll) + 1e-9); wid[f] = ss / (mm + ss + 1e-12);
      const P = (a, b) => { let s = 0; for (let k = a[0]; k <= a[1]; k++) s += mag[k] * mag[k]; return s; };
      const Fx = (a, w = 1) => { let s = 0; for (let k = a[0]; k <= a[1]; k++) { const d = lg[k] - prev[k]; if (d > 0) s += d * w; } return s; };
      eb[f] = db(P(bB)); em[f] = db(P(mB)); eh[f] = db(P(hB));
      let vs = 0; for (let k = mB[0]; k <= mB[1]; k++) { const v = Math.max(0, mag[k] - 1.15 * smag[k]); vs += v * v; } ev[f] = db(vs);
      fk[f] = Fx(kB); { // snare: broadband crack in 1.8–6 kHz that is not just the top of a hi-hat (hats lean to 7 kHz+), plus some body
        const cr = Fx(s2) / Math.max(1, (s2[1] - s2[0]) / 12), hp = Fx(hh) / Math.max(1, (hh[1] - hh[0]) / 12), bo = Fx(s1);
        fs[f] = Math.max(0, cr - 0.7 * hp) * (0.6 + 0.4 * Math.min(1, bo)); fh[f] = hp * 0.4; }
      let fa_ = 0, cs = 0, cw = 0; for (let k = 1; k < half; k++) { const d = lg[k] - prev[k]; if (d > 0) fa_ += d * (k < 12 ? 2 : 1); prev[k] = lg[k]; }
      for (let k = cB[0]; k <= cB[1]; k++) { cs += k * mag[k]; cw += mag[k]; }
      fa[f] = fa_; cent[f] = cw > 0 ? Math.log2(Math.max(1, (cs / cw) * binHz) / 250) / Math.log2(32) : 0;
      const cb = (f >> 2) * 12; for (let k = 1; k < half; k++) if (pc[k] >= 0) chroma[cb + pc[k]] += mag[k];
      for (let b = 0; b < NB; b++) {
        const [k0, k1, kc, tilt] = bandK[b]; let v;
        if (k1 - k0 < 1.5) { const i = Math.floor(kc), u = kc - i; v = (mag[i] || 0) * (1 - u) + (mag[i + 1] || 0) * u; }
        else { let s = 0, c = 0; for (let k = Math.floor(k0); k <= Math.ceil(k1) && k < half; k++) { s += mag[k]; c++; } v = s / Math.max(1, c); }
        spec[f * NB + b] = 20 * Math.log10(v + 1e-7) + tilt;
      }
      if (f % 1200 === 0) { onP && onP((f / NF) * 0.55); await tick(); }
    }
    // ---- normalise (percentiles, so a quiet master and a loud master behave the same) ----
    const sLo = pct(spec, 0.25, 7), sHi = pct(spec, 0.997, 7), sD = Math.max(1, sHi - sLo);
    for (let i = 0; i < spec.length; i++) { const v = clamp((spec[i] - sLo) / sD); spec[i] = Math.pow(v, 1.25); }
    const rmsN = norm(rms, 0.06, 0.99), bN = norm(eb), mN = norm(em), hN = norm(eh), vN = norm(ev, 0.15, 0.985);
    const C = (x, a, r) => [env(x, a, r * 0.45), env(x, a * 3, r * 1.6)];
    const lev = { rms: C(rmsN, 0.01, 0.16), bass: C(bN, 0.008, 0.14), mid: C(mN, 0.012, 0.18), high: C(hN, 0.004, 0.09), vocal: C(vN, 0.015, 0.2) };
    onP && onP(0.6); await tick();
    // ---- onsets ----
    const on = { kick: pick(fk, 0.1, 1.3), snare: pick(fs, 0.1, 1.45), hat: pick(fh, 0.055, 1.25), all: pick(fa, 0.07, 1.35) };
    // ---- smoothed spectrum + falling peak caps ----
    const specS = new Uint8Array(NF * NB), peak = new Uint8Array(NF * NB), ka = 1 - Math.exp(-1 / (FPS * 0.012)), kr = 1 - Math.exp(-1 / (FPS * 0.15)), hold = Math.round(FPS * 0.22), acc = 5.5 / FPS;
    for (let b = 0; b < NB; b++) {
      let e = 0, p = 0, h = 0, vel = 0;
      for (let f = 0; f < NF; f++) {
        const v = spec[f * NB + b]; e += (v - e) * (v > e ? ka : kr);
        if (e >= p) { p = e; h = hold; vel = 0; } else if (h > 0) h--; else { vel += acc; p = Math.max(e, p - vel / FPS); }
        specS[f * NB + b] = Math.round(e * 255); peak[f * NB + b] = Math.round(p * 255);
      }
    }
    onP && onP(0.66); await tick();
    // ---- stereo, brightness, ambience, arousal ----
    const panS = env(pan, 0.08, 0.08), widS = box(wid, FPS * 0.25), centS = box(cent, FPS * 0.12);
    for (let i = 0; i < NF; i++) centS[i] = clamp(centS[i]);
    const faN = norm(Float32Array.from(fa), 0.1, 0.99), dens = new Float32Array(NF); for (const t of on.all.t) { const i = Math.round(t * FPS); if (i >= 0 && i < NF) dens[i] = 1; }
    const spaceRaw = new Float32Array(NF), wB = box(wid, FPS * 0.8), rB = box(rmsN, FPS * 0.8), fB = box(faN, FPS * 0.8);
    for (let i = 0; i < NF; i++) spaceRaw[i] = wB[i] * 0.65 + rB[i] * (1 - fB[i]) * 0.35;
    const space = norm(spaceRaw, 0.08, 0.98), dB2 = box(dens, FPS * 2), lB2 = box(rmsN, FPS * 2), aro = new Float32Array(NF);
    for (let i = 0; i < NF; i++) aro[i] = lB2[i] * 0.5 + dB2[i] * FPS * 0.06 + centS[i] * 0.2;
    norm(aro, 0.05, 0.98);
    onP && onP(0.7); await tick();
    // ---- pitch ----
    const pt = await pitchTrack(buf, lev.vocal[0], (p) => onP && onP(0.7 + p * 0.2));
    const voiced = pt.midi.map((v) => (Number.isFinite(v) ? 1 : 0)), pLo = pct(pt.midi, 0.05, 1, voiced), pHi = pct(pt.midi, 0.95, 1, voiced);
    // ---- chroma → key + mood ----
    const tot = new Float32Array(12), blkC = [];
    for (let c = 0; c < NC; c++) { let m = 0; for (let k = 0; k < 12; k++) m = Math.max(m, chroma[c * 12 + k]); const w = rmsN[Math.min(NF - 1, c * 4)]; for (let k = 0; k < 12; k++) { const v = m > 0 ? chroma[c * 12 + k] / m : 0; chroma[c * 12 + k] = v; tot[k] += v * w; } }
    let key = { root: 0, mode: 'major', r: -2 };
    for (let s = 0; s < 12; s++) { const a = corr(tot, KMAJ, s), b = corr(tot, KMIN, s); if (a > key.r) key = { root: s, mode: 'major', r: a }; if (b > key.r) key = { root: s, mode: 'minor', r: b }; }
    key.name = NOTE[key.root] + (key.mode === 'minor' ? 'm' : '');
    const val = new Float32Array(NC), CR = 6;
    for (let c = 0; c < NC; c++) {
      const v = new Float32Array(12); for (let d = -CR; d <= CR; d++) { const q = Math.min(NC - 1, Math.max(0, c + d)); for (let k = 0; k < 12; k++) v[k] += chroma[q * 12 + k]; }
      let bM = 0, bm = 0; for (let r = 0; r < 12; r++) { const M3 = v[r] + v[(r + 4) % 12] + v[(r + 7) % 12] - v[(r + 3) % 12] * 0.6, m3 = v[r] + v[(r + 3) % 12] + v[(r + 7) % 12] - v[(r + 4) % 12] * 0.6; if (M3 > bM) bM = M3; if (m3 > bm) bm = m3; }
      val[c] = (bM - bm) / (bM + bm + 1e-6);
    }
    const valS = box(val, FPS / 4 * 3), mood = new Float32Array(NC); for (let c = 0; c < NC; c++) mood[c] = clamp(Math.tanh(valS[c] * 6) * 0.6 + (key.mode === 'major' ? 0.4 : -0.4), -1, 1);
    // ---- breaths between sung phrases (TM-22) ----
    const vf = lev.vocal[0], vmax = box(vf, FPS * 1.5), breaths = [];
    for (let i = 1, s = -1; i < NF; i++) {
      const low = vf[i] < vmax[i] * 0.28 || vf[i] < 0.08;
      if (low && s < 0) s = i;
      if (!low && s >= 0) { const len = (i - s) / FPS; if (len >= 0.12 && len <= 0.8) { let pre = 0, post = 0; for (let k = 1; k <= FPS * 0.4; k++) { if (vf[s - k] > 0.2) pre++; if (vf[i + k] > 0.2) post++; } if (pre > FPS * 0.25 && post > FPS * 0.25) breaths.push((s + i) / 2 / FPS); } s = -1; }
    }
    onP && onP(0.94); await tick();
    // ---- structure blocks (1 s): chroma + 8 coarse spectral bands + loudness ----
    const BS = FPS, NBk = Math.floor(NF / BS), blk = [], bl = [], bv = [];
    for (let b = 0; b < NBk; b++) {
      const v = new Float32Array(20); let l = 0, vv = 0;
      let vc = 0; for (let q = Math.floor(b * pt.pf); q < Math.floor((b + 1) * pt.pf); q++) if (Number.isFinite(pt.midi[q])) vc++;
      for (let f = b * BS; f < (b + 1) * BS; f++) { const c = f >> 2; for (let k = 0; k < 12; k++) v[k] += chroma[c * 12 + k] / BS; for (let q = 0; q < 8; q++) { let s = 0; for (let j = 0; j < 8; j++) s += spec[f * NB + q * 8 + j]; v[12 + q] += s / 8 / BS; } l += rmsN[f]; vv += lev.vocal[1][f]; }
      for (let q = 12; q < 20; q++) v[q] *= 1.6;
      let nn = 0; for (let k = 0; k < 20; k++) nn += v[k] * v[k]; nn = Math.sqrt(nn) || 1; for (let k = 0; k < 20; k++) v[k] /= nn;
      blk.push(v); bl.push(l / BS); bv.push(Math.min(1, vc / pt.pf * 1.3) * 0.7 + (vv / BS) * 0.3);
    }
    F = { fps: FPS, NF, NB, dur, lev, on, specS, peak, pan: panS, width: widS, cent: centS, space, aro, pitch: pt, pLo, pHi, mood, key, breaths, chroma, blk, bl, bv, fa: faN };
    onP && onP(1);
    return F;
  }

  /* refine the base analysis once features exist: DP beats, downbeat, structure */
  function refine(an) {
    if (!F || !an) return;
    const O = new Float32Array(F.NF), m = box(F.fa, FPS * 0.25);
    for (let i = 0; i < F.NF; i++) O[i] = Math.max(0, F.fa[i] - m[i]);
    const kick = F.on.kick; for (let k = 0; k < kick.t.length; k++) { const i = Math.round(kick.t[k] * FPS); if (i >= 0 && i < F.NF) O[i] += kick.s[k] * 0.6; }
    const sd = Math.sqrt(O.reduce((s, v) => s + v * v, 0) / O.length) || 1; for (let i = 0; i < O.length; i++) O[i] /= sd;
    if (an.bpm > 40) {
      const bt = trackBeats(O, an.bpm);
      if (bt && bt.length > (an.beats || []).length * 0.7) {
        an.beatsGrid = an.beats; an.beats = bt.filter((t) => t >= 0 && t < F.dur);
        // downbeat: the beat slot (mod 4) with the strongest kick + bass accents
        const acc = [0, 0, 0, 0], cnt = [0, 0, 0, 0];
        an.beats.forEach((t, i) => { acc[i % 4] += onEnvAt(F.on.kick, t + 0.02, 0.05) + lvl(F.lev.bass[0], t) * 0.5; cnt[i % 4]++; });
        let d = 0; for (let k = 1; k < 4; k++) if (acc[k] / Math.max(1, cnt[k]) > acc[d] / Math.max(1, cnt[d])) d = k; an.downbeat = d;
      }
    }
    F.sections = structure(F.blk, F.bl, F.bv, F.dur, an.beats, an.downbeat);
    an.key = F.key.name; an.sections = F.sections; an.breaths = F.breaths;
  }

  /* ---------- lookups ---------- */
  function lvl(arr, t) { const x = t * FPS, i = Math.floor(x); if (i < 0) return arr[0] || 0; if (i >= arr.length - 1) return arr[arr.length - 1] || 0; const u = x - i; return arr[i] * (1 - u) + arr[i + 1] * u; }
  function lastIdx(ts, t) { let lo = 0, hi = ts.length - 1; if (hi < 0 || ts[0] > t) return -1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ts[m] <= t) lo = m; else hi = m - 1; } return lo; }
  function onEnvAt(o, t, tau) { const i = lastIdx(o.t, t); if (i < 0) return 0; let v = o.s[i] * Math.exp(-(t - o.t[i]) / tau); if (i > 0) v = Math.max(v, o.s[i - 1] * Math.exp(-(t - o.t[i - 1]) / tau)); return v; }
  const SP = new Float32Array(NB), PK = new Float32Array(NB), S32 = new Float32Array(32);
  const FR = { rms: 0, bass: 0, mid: 0, high: 0, vocal: 0, kick: 0, snare: 0, hat: 0, onset: 0, pan: 0, width: 0, space: 0, pitch: null, pitchS: 0.5, midi: null, pconf: 0, cent: 0, mood: 0, arousal: 0, spec: SP, peak: PK, real: true, sec: null, t: 0 };
  function frame(t, smooth = 0.5) {
    if (!F) return null;
    const s = clamp(smooth), mix = (p) => lvl(p[0], t) * (1 - s) + lvl(p[1], t) * s;
    FR.t = t; FR.rms = mix(F.lev.rms); FR.bass = mix(F.lev.bass); FR.mid = mix(F.lev.mid); FR.high = mix(F.lev.high); FR.vocal = mix(F.lev.vocal);
    const tk = 0.6 + s * 0.8;
    FR.kick = onEnvAt(F.on.kick, t, 0.11 * tk); FR.snare = onEnvAt(F.on.snare, t, 0.14 * tk); FR.hat = onEnvAt(F.on.hat, t, 0.06 * tk); FR.onset = onEnvAt(F.on.all, t, 0.1 * tk);
    FR.pan = lvl(F.pan, t); FR.width = lvl(F.width, t); FR.space = lvl(F.space, t); FR.cent = lvl(F.cent, t); FR.arousal = lvl(F.aro, t);
    const pf = F.pitch.pf, pi = t * pf, i0 = Math.floor(pi), m0 = F.pitch.midi[i0], m1 = F.pitch.midi[i0 + 1];
    FR.midi = Number.isFinite(m0) ? (Number.isFinite(m1) ? m0 + (m1 - m0) * (pi - i0) : m0) : Number.isFinite(m1) ? m1 : null;
    FR.pitch = FR.midi == null ? null : clamp((FR.midi - F.pLo) / Math.max(3, F.pHi - F.pLo), -0.2, 1.2); FR.pconf = F.pitch.conf[i0] || 0; FR.pitchS = pitchAt(t);
    const mc = Math.min(F.mood.length - 1, Math.max(0, Math.floor(t * FPS / 4))); FR.mood = F.mood[mc] || 0;
    const x = t * FPS, f0 = Math.max(0, Math.min(F.NF - 1, Math.floor(x))), f1 = Math.min(F.NF - 1, f0 + 1), u = clamp(x - f0);
    for (let b = 0; b < NB; b++) { SP[b] = (F.specS[f0 * NB + b] * (1 - u) + F.specS[f1 * NB + b] * u) / 255; PK[b] = (F.peak[f0 * NB + b] * (1 - u) + F.peak[f1 * NB + b] * u) / 255; }
    FR.sec = null; if (F.sections) for (const q of F.sections) if (t >= q.t0 && t < q.t1) { FR.sec = q.type; break; }
    return FR;
  }
  // normalised sung pitch at t: raw → null when unvoiced, otherwise the gap-filled smooth contour
  function pitchAt(t, raw) {
    if (!F) return null; const P = F.pitch, x = t * P.pf, i = Math.max(0, Math.min(P.fill.length - 2, Math.floor(x))), u = clamp(x - i);
    if (raw && !Number.isFinite(P.midi[i]) && !Number.isFinite(P.midi[i + 1])) return null;
    const a = P.fill[i], b = P.fill[i + 1], m = a + (b - a) * u;
    return (m - F.pLo) / Math.max(3, F.pHi - F.pLo);
  }
  function lastOnset(t, band = 'all', minS = 0.2) { if (!F) return null; const o = F.on[band] || F.on.all; let i = lastIdx(o.t, t); while (i >= 0 && o.s[i] < minS) i--; return i >= 0 ? o.t[i] : null; }
  function onsets(band, t0, t1) { if (!F) return []; const o = F.on[band] || F.on.all, out = []; let i = Math.max(0, lastIdx(o.t, t0)); for (; i < o.t.length && o.t[i] <= t1; i++) if (o.t[i] >= t0) out.push([o.t[i], o.s[i]]); return out; }
  function spec32(t) { if (!frame(t, 0.4)) return null; for (let i = 0; i < 32; i++) S32[i] = Math.min(1, (SP[i * 2] + SP[i * 2 + 1]) * 0.55); return S32; }
  // trigger-stabilised oscilloscope trace (rising zero crossing), centre channel
  function scope(t, n = 256, span = 0.03) {
    const buf = A.buffer; if (!buf) return null;
    const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, m = (j) => ((L[j] || 0) + (R[j] || 0)) * 0.5;
    const len = Math.round(span * sr), c = Math.round(t * sr) - (len >> 1); let tr = c, best = -1;
    for (let j = c - 900; j < c; j++) { const a = m(j - 3) + m(j - 2) + m(j - 1), b = m(j) + m(j + 1) + m(j + 2); if (a < 0 && b >= 0) { const sl = b - a; if (sl > best) { best = sl; tr = j; } } }
    const out = new Float32Array(n), st = len / n;
    for (let i = 0; i < n; i++) { let s = 0; const j0 = tr + Math.floor(i * st), k = Math.max(1, Math.floor(st)); for (let q = 0; q < k; q++) s += m(j0 + q); out[i] = s / k; }
    return out;
  }
  function waveLR(t, n = 512, span = 0.04) {
    const buf = A.buffer; if (!buf) return null;
    const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, len = Math.round(span * sr), c = Math.round(t * sr) - len;
    const l = new Float32Array(n), r = new Float32Array(n); for (let i = 0; i < n; i++) { const j = c + Math.floor((i / n) * len); l[i] = L[j] || 0; r[i] = R[j] || 0; }
    return { l, r };
  }
  /* sections in the project's marker format, using lyric presence for the sung / instrumental split */
  const MAP = { intro: 'intro', A: 'A', B: 'B', chorus: 'chorus', inter: 'inter', C: 'C', bridge: 'bridge', outro: 'outro' };
  function sectionsFor(p) {
    if (!F || !F.sections || !F.sections.length) return null;
    const hasCue = (a, b) => (p.cues || []).some((c) => c.kind !== 'title' && c.start < b - 0.3 && c.end > a + 0.3);
    const out = [];
    F.sections.forEach((s, i) => {
      let ty = MAP[s.type] || 'A';
      if ((p.cues || []).length) { if (!hasCue(s.t0, s.t1) && ty !== 'intro' && ty !== 'outro') ty = 'inter'; else if (hasCue(s.t0, s.t1) && (ty === 'inter' || (ty === 'intro' && i > 0))) ty = 'A'; }
      if (out.length && out[out.length - 1].type === ty && ty !== 'chorus') return;
      out.push({ t: Math.round(s.t0 * 1000) / 1000, type: ty, est: true });
    });
    return out;
  }

  const an0 = A.analyze, sp0 = A.spectrum, cl0 = A.clear;
  A.analyze = async (onP) => {
    F = null;
    const an = await an0((p) => onP && onP(p * 0.3));
    try { await features((p) => onP && onP(0.3 + p * 0.7)); refine(an); } catch (e) { console.warn('feature analysis failed', e); F = null; }
    return an;
  };
  A.spectrum = (t) => (F ? spec32(t) : sp0(t));
  A.clear = () => { F = null; cl0(); };
  Object.assign(A, { features, frame, pitchAt, lastOnset, onsets, scope, waveLR, sectionsFor, FPS, NB });
  Object.defineProperty(A, 'feat', { get: () => F, configurable: true });
})();
