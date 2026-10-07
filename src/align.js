/* 歌声に合わせた自動タイミング（オフライン・ブラウザー内）
 * 1) ボーカル推定：ステレオの中央成分（Mid − Side）からボーカル帯域（250〜4000Hz）を取り出し、
 *    HPSS（時間方向/周波数方向のメディアン）で打楽器を抑えて「歌っている強さ」a(t) と音の立ち上がり o(t) を得る
 * 2) 行の配置：各行の長さ（モーラ／音節数）× 歌う速さ を事前分布に、a(t) が高い区間をなるべく行で覆い、
 *    行頭が立ち上がり＆直前の静けさに来るよう動的計画法で全行を同時に最適化（順序は保つ）
 * 3) 単語：行内を音節数で配分し、近くの立ち上がりへ吸着 */
'use strict';
LM.align = (() => {
  const U = LM.U;
  /* ---------- FFT (radix-2, in place) ---------- */
  function fftFactory(n) {
    const rev = new Uint32Array(n), lg = Math.log2(n) | 0;
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < lg; b++) r |= ((i >> b) & 1) << (lg - 1 - b); rev[i] = r; }
    const cs = new Float64Array(n / 2), sn = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos((-2 * Math.PI * i) / n); sn[i] = Math.sin((-2 * Math.PI * i) / n); }
    return (re, im) => {
      for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half, tr = re[b] * cs[k] - im[b] * sn[k], ti = re[b] * sn[k] + im[b] * cs[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const scr = new Float32Array(64);
  function median9(buf, n) { // insertion sort on a scratch buffer (n ≤ 64)
    for (let i = 0; i < n; i++) { const v = buf[i]; let j = i - 1; while (j >= 0 && scr[j] > v) { scr[j + 1] = scr[j]; j--; } scr[j + 1] = v; }
    return scr[n >> 1];
  }
  const pct = (arr, q) => { const s = Array.from(arr).sort((x, y) => x - y); return s[Math.floor((s.length - 1) * q)] || 0; };

  /* ---------- 1) vocal activity & onsets ---------- */
  async function features(buffer, onProg) {
    const sr0 = buffer.sampleRate, dec = Math.max(1, Math.round(sr0 / 22050)), sr = sr0 / dec;
    const chL = buffer.getChannelData(0), chR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
    const len = Math.floor(chL.length / dec);
    const M = new Float32Array(len), Sd = chR ? new Float32Array(len) : null;
    for (let i = 0; i < len; i++) {
      let l = 0, r = 0; for (let k = 0; k < dec; k++) { l += chL[i * dec + k]; if (chR) r += chR[i * dec + k]; }
      l /= dec; r /= dec;
      if (chR) { M[i] = (l + r) * 0.5; Sd[i] = (l - r) * 0.5; } else M[i] = l;
    }
    const N = 1024, hop = Math.round(sr / 86), fps = sr / hop, fft = fftFactory(N);
    const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const b0 = Math.floor((250 * N) / sr), b1 = Math.ceil((4000 * N) / sr), nb = b1 - b0;
    const T = Math.max(1, Math.floor((len - N) / hop));
    const X = new Float32Array(T * nb); // log vocal-ish magnitude
    const re = new Float64Array(N), im = new Float64Array(N), re2 = new Float64Array(N), im2 = new Float64Array(N);
    let stereoSide = 0, stereoMid = 0;
    // pitch tracking on the centre channel (harmonic sum over a 1/8-semitone grid, 90–900 Hz)
    const pb1 = Math.ceil((4200 * N) / sr), Vl = new Float32Array(pb1 + 2);
    const NC = Math.round(12 * 8 * Math.log2(900 / 90)), cand = new Float32Array(NC); for (let c = 0; c < NC; c++) cand[c] = 90 * Math.pow(2, c / 96);
    const pitch = new Float32Array(T), sal = new Float32Array(T), hs = new Float32Array(NC);
    const mag = (f) => { const x = (f * N) / sr, i = Math.floor(x), fr = x - i; return i + 1 < Vl.length ? Vl[i] * (1 - fr) + Vl[i + 1] * fr : 0; };
    for (let t = 0; t < T; t++) {
      const o = t * hop;
      for (let i = 0; i < N; i++) { re[i] = M[o + i] * win[i]; im[i] = 0; }
      fft(re, im);
      if (Sd) { for (let i = 0; i < N; i++) { re2[i] = Sd[o + i] * win[i]; im2[i] = 0; } fft(re2, im2); }
      for (let k = 1; k <= pb1 && k < N / 2; k++) { const m = Math.hypot(re[k], im[k]); Vl[k] = Sd ? Math.max(0, m - 1.1 * Math.hypot(re2[k], im2[k])) : m; }
      { let best = 0, bc = -1, tot = 0; for (let k = 3; k <= pb1; k++) tot += Vl[k];
        for (let c = 0; c < NC; c++) { const f0 = cand[c]; let h = 0; for (let n = 1; n <= 8; n++) { const f = f0 * n; if (f > 4000) break; h += mag(f) * (n === 1 ? 0.8 : 1) / Math.sqrt(n); } hs[c] = h; if (h > best) { best = h; bc = c; } }
        // prefer the lower octave when it explains the spectrum nearly as well (avoids octave-up errors)
        if (bc >= 96 && hs[bc - 96] > best * 0.85) bc -= 96;
        let pc = bc; if (bc > 0 && bc < NC - 1) { const a = hs[bc - 1], m0 = hs[bc], c2 = hs[bc + 1], den = a - 2 * m0 + c2; if (den < 0) pc = bc + U.clamp((0.5 * (a - c2)) / den, -0.5, 0.5); }
        pitch[t] = bc >= 0 ? 1200 * Math.log2(90 / 55) + pc * 12.5 : 0; sal[t] = tot > 1e-6 ? best / tot : 0; }
      for (let b = 0; b < nb; b++) {
        const k = b0 + b, m = Math.hypot(re[k], im[k]);
        let v = m;
        if (Sd) { const s = Math.hypot(re2[k], im2[k]); stereoMid += m; stereoSide += s; v = Math.max(0, m - 1.1 * s); }
        X[t * nb + b] = Math.log1p(v * 20);
      }
      if (t % 2000 === 1999) { onProg && onProg(0.05 + 0.4 * (t / T)); await tick(); }
    }
    // HPSS masks: harmonic = median over time, percussive = median over frequency
    const H = new Float32Array(T * nb), P = new Float32Array(T * nb), tmp = new Float32Array(33);
    const wt = 13, wf = 5;
    for (let b = 0; b < nb; b++) {
      for (let t = 0; t < T; t++) { let n = 0; for (let d = -wt; d <= wt; d++) { const tt = t + d; if (tt >= 0 && tt < T) tmp[n++] = X[tt * nb + b]; } H[t * nb + b] = median9(tmp, n); }
      if (b % 40 === 39) { onProg && onProg(0.45 + 0.3 * (b / nb)); await tick(); }
    }
    for (let t = 0; t < T; t++) for (let b = 0; b < nb; b++) { let n = 0; for (let d = -wf; d <= wf; d++) { const bb = b + d; if (bb >= 0 && bb < nb) tmp[n++] = X[t * nb + bb]; } P[t * nb + b] = median9(tmp, n); }
    const act = new Float32Array(T), ons = new Float32Array(T);
    const prev = new Float32Array(nb);
    for (let t = 0; t < T; t++) {
      let a = 0, o = 0;
      for (let b = 0; b < nb; b++) {
        const h = H[t * nb + b], p = P[t * nb + b], m = (h * h) / (h * h + p * p + 1e-9), v = X[t * nb + b] * m;
        // weight the formant region a little more (vowels live in 300–3000 Hz)
        const f = ((b0 + b) * sr) / N, w = f < 350 ? 0.6 : f > 3200 ? 0.7 : 1;
        a += v * w;
        if (t >= 2) o += Math.max(0, v - prev[b]) * w;
        prev[b] = t >= 1 ? X[(t - 1) * nb + b] * m : v;
      }
      act[t] = a / nb; ons[t] = o / nb;
    }
    // vocal-likeness: sung pitch is never perfectly still (vibrato, scoops, drift) — synths / keys are.
    // median deviation (cents) from a 0.25 s running median, ignoring note jumps
    const W2 = Math.round(fps * 0.125), dev = new Float32Array(T), tmp2 = [];
    for (let t = 0; t < T; t++) { tmp2.length = 0; for (let k = -W2; k <= W2; k++) { const j = t + k; if (j >= 0 && j < T) tmp2.push(pitch[j]); } tmp2.sort((x, y) => x - y); dev[t] = Math.min(60, Math.abs(pitch[t] - tmp2[tmp2.length >> 1])); }
    // only trust frames with a clear harmonic pitch; elsewhere stay neutral
    const salT = Math.max(pct(sal, 0.55), 0.02), W3 = Math.round(fps * 0.18), voc = new Float32Array(T);
    for (let t = 0; t < T; t++) {
      tmp2.length = 0; let rel = 0, n = 0;
      for (let k = -W3; k <= W3; k++) { const j = t + k; if (j < 0 || j >= T) continue; n++; if (sal[j] >= salT && dev[j] < 55) { tmp2.push(dev[j]); rel++; } }
      if (rel < n * 0.35) { voc[t] = 0.35; continue; }
      tmp2.sort((x, y) => x - y); const m = tmp2[tmp2.length >> 1];
      voc[t] = U.clamp((m - 2) / 6, 0, 1);
    }
    return { act, ons, voc, pitch, fps, T, stereo: Sd ? stereoSide / (stereoMid + 1e-9) : 1, dur: len / sr };
  }
  // robust normalize to 0..1 (p lo → 0, p hi → 1)
  function norm(a, lo, hi) {
    const s = Array.from(a).sort((x, y) => x - y), L = s[Math.floor(s.length * lo)] || 0, H = s[Math.floor(s.length * hi)] || 1;
    const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = U.clamp((a[i] - L) / (H - L + 1e-9), 0, 1.3); return o;
  }
  function resample(a, fps, step) {
    const n = Math.floor(a.length / fps / step), o = new Float32Array(n);
    for (let i = 0; i < n; i++) { const s = Math.floor(i * step * fps), e = Math.max(s + 1, Math.floor((i + 1) * step * fps)); let v = 0; for (let k = s; k < e && k < a.length; k++) v += a[k]; o[i] = v / (e - s); }
    return o;
  }
  function smooth(a, r) { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const j = i + k; if (j >= 0 && j < a.length) { s += a[j]; n++; } } o[i] = s / n; } return o; }

  /* ---------- lyric weights: morae / syllables ---------- */
  const SMALL = new Set(Array.from('ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ'));
  function unitsOf(text) {
    let s = String(text || '');
    // ruby: use the reading
    s = s.replace(/[|｜]?([^|｜《》]+)《([^》]*)》/g, (m, base, rd) => rd || base).replace(/\^/g, '').replace(/[*/]/g, ' ');
    let u = 0;
    for (const w of s.split(/\s+/)) {
      if (!w) continue;
      const lat = w.match(/[A-Za-zÀ-ɏ']+/g);
      if (lat) lat.forEach((x) => { const v = x.toLowerCase().replace(/e$/, '').match(/[aeiouyàáâäèéêëìíîïòóôöùúûü]+/g); u += Math.max(1, v ? v.length : 1); });
      for (const ch of Array.from(w)) {
        if (/[぀-ヿ]/.test(ch)) u += SMALL.has(ch) ? 0 : 1;
        else if (/[一-鿿㐀-䶿々]/.test(ch)) u += 1.7;
        else if (/[가-힯]/.test(ch)) u += 1;
        else if (/[0-9０-９]/.test(ch)) u += 1.3;
      }
    }
    return Math.max(1, u);
  }

  /* ---------- 2) DP alignment of lines ---------- */
  function alignLines(A, O, step, units, rate, opt, anchors) {
    const T = A.length, N = units.length, th = opt.th;
    const cum = new Float64Array(T + 1); for (let i = 0; i < T; i++) cum[i + 1] = cum[i] + (A[i] - th);
    const quietBefore = (s) => { let m = 0, n = 0; for (let k = 1; k <= 6; k++) if (s - k >= 0) { m += A[s - k]; n++; } return n ? 1 - U.clamp(m / n, 0, 1) : 1; };
    const startBonus = new Float32Array(T); for (let s = 0; s < T; s++) { let o = 0; for (let k = -1; k <= 2; k++) if (s + k >= 0 && s + k < T) o = Math.max(o, O[s + k]); startBonus[s] = opt.bo * o + opt.bq * quietBefore(s) * (A[s] > th ? 1 : 0.3); }
    const quietAfter = (e) => { let m = 0, n = 0; for (let k = 0; k < 6; k++) if (e + k < T) { m += A[e + k]; n++; } return n ? 1 - U.clamp(m / n, 0, 1) : 1; };
    const NEG = -1e18;
    let F = new Float64Array(T + 1).fill(NEG);
    const back = [];
    // G[s] = best score of previous lines ending at or before s; start: before line 0 everything is free
    let G = new Float64Array(T + 1).fill(0), Gi = new Int32Array(T + 1).map((_, i) => i);
    for (let li = 0; li < N; li++) {
      const D = Math.max(0.35, units[li] * rate + 0.15) / step;
      const dmin = Math.max(2, Math.floor(D * 0.45)), dmax = Math.min(T, Math.ceil(D * 2.1 + 0.8 / step));
      F = new Float64Array(T + 1).fill(NEG);
      const bk = new Int32Array(T + 1).fill(-1);
      for (let e = dmin; e <= T; e++) {
        let best = NEG, bs = -1;
        let lo = Math.max(0, e - dmax), hi = e - dmin;
        const an = anchors && anchors[li]; if (an != null) { lo = Math.max(lo, an - 2); hi = Math.min(hi, an + 2); if (lo > hi) continue; }
        for (let s = lo; s <= hi; s++) {
          const g = G[s]; if (g <= NEG / 2) continue;
          const d = e - s, lr = Math.log(d / D);
          const v = g + (cum[e] - cum[s]) + startBonus[s] - opt.gd * lr * lr;
          if (v > best) { best = v; bs = s; }
        }
        if (bs >= 0) { F[e] = best + opt.be * quietAfter(e); bk[e] = bs; }
      }
      back.push({ bk, Gi: Gi.slice() });
      // prefix max for the next line
      const G2 = new Float64Array(T + 1).fill(NEG), Gi2 = new Int32Array(T + 1).fill(-1);
      let m = NEG, mi = -1; for (let e = 0; e <= T; e++) { if (F[e] > m) { m = F[e]; mi = e; } G2[e] = m; Gi2[e] = mi; }
      G = G2; Gi = Gi2;
    }
    // backtrack
    let e = -1, m = NEG; for (let k = 0; k <= T; k++) if (F[k] > m) { m = F[k]; e = k; }
    if (e < 0) return null;
    const out = new Array(N); out.score = m;
    for (let li = N - 1; li >= 0; li--) {
      const s = back[li].bk[e]; out[li] = { s, e };
      if (li > 0) e = back[li].Gi[s];
    }
    return out;
  }

  /* ---------- 3) words inside a line ---------- */
  function wordTimes(text, t0, t1, O, step) {
    const W = LM.typo.words(text).list; if (W.length < 2) return null;
    const wu = W.map((w) => unitsOf(w.text)), tot = wu.reduce((a, b) => a + b, 0);
    const out = [t0]; let acc = 0; const span = t1 - t0, avg = span / W.length;
    for (let k = 1; k < W.length; k++) {
      acc += wu[k - 1]; const exp = t0 + (span * acc) / tot;
      let best = exp, bv = 0;
      const r = Math.max(0.12, avg * 0.35);
      for (let x = exp - r; x <= exp + r; x += step) { const i = Math.round(x / step); if (i < 0 || i >= O.length) continue; const v = O[i] * (1 - (0.6 * Math.abs(x - exp)) / r); if (v > bv) { bv = v; best = x; } }
      const prevT = out[out.length - 1];
      out.push(Math.max(prevT + 0.08, Math.min(t1 - 0.08 * (W.length - k), bv > 0.25 ? best : exp)));
    }
    return out;
  }

  /* ---------- public ---------- */
  const cache = { buffer: null, F: null };
  async function run(buffer, lines, o = {}) {
    const onProg = o.onProgress || null;
    onProg && onProg(0.02, 'analyse');
    let F = cache.buffer === buffer ? cache.F : null;
    const tA = performance.now();
    if (!F) { F = await features(buffer, (p) => onProg && onProg(p, 'analyse')); cache.buffer = buffer; cache.F = F; }
    const step = 0.04;
    const vs = smooth(F.voc, Math.round(F.fps * 0.3));
    const act0 = norm(F.act, 0.2, 0.96), act = new Float32Array(act0.length);
    for (let i = 0; i < act.length; i++) act[i] = act0[i] * (0.25 + 0.75 * vs[i]);
    smooth(act, 2).forEach((v, i) => (act[i] = v));
    const ons0 = norm(F.ons, 0.5, 0.995), ons = new Float32Array(ons0.length); for (let i = 0; i < ons.length; i++) ons[i] = ons0[i] * (0.3 + 0.7 * vs[i]);
    const A0 = resample(act, F.fps, step), Or = resample(ons, F.fps, step);
    // slow AGC: quiet verses should count as singing too (relative to the loudness around them, ±6 s)
    const A = new Float32Array(A0.length), hw = Math.round(6 / step);
    { const gl = pct(A0, 0.9) || 1; for (let i = 0; i < A0.length; i++) { const a = Math.max(0, i - hw), b = Math.min(A0.length, i + hw); const loc = pct(A0.subarray(a, b), 0.9); const ref = Math.max(loc, gl * 0.35); A[i] = U.clamp(A0[i] / (ref + 1e-6), 0, 1.3); } }
    // local peaks only for onsets
    const O = new Float32Array(Or.length); for (let i = 1; i < Or.length - 1; i++) if (Or[i] >= Or[i - 1] && Or[i] >= Or[i + 1]) O[i] = Or[i];
    const tB = performance.now();
    if (o.debug) LM.align._last = { A: Array.from(A), O: Array.from(O), step, voc: Array.from(resample(vs, F.fps, step)), act0: Array.from(resample(act0, F.fps, step)), pitch: Array.from(resample(F.pitch, F.fps, step)) };
    onProg && onProg(0.8, 'align');
    await tick();
    const units = lines.map(unitsOf), totU = units.reduce((a, b) => a + b, 0);
    // time range to use: optional [from, to] (e.g. re-align after a locked line)
    // no-vocal zones (intro / interlude / outro markers): singing there is very unlikely
    (o.quiet || []).forEach(([a, b, w]) => { for (let i = Math.max(0, Math.floor(a / step)); i < Math.min(A.length, Math.ceil(b / step)); i++) { A[i] *= w == null ? 0.12 : w; O[i] *= w == null ? 0.2 : w; } });
    const i0 = Math.max(0, Math.floor((o.from || 0) / step)), i1 = Math.min(A.length, Math.ceil((o.to || F.dur) / step));
    const As = A.subarray(i0, i1), Os = O.subarray(i0, i1);
    const activeT = As.reduce((a, v) => a + (v > 0.45 ? step : 0), 0);
    // optional anchors: fixed starts for some lines (e.g. locked / tapped lines) → index into the local grid
    const anchors = (o.anchors || []).map((t) => (t == null ? null : Math.round(t / step) - i0));
    const opt = { th: 0.3, bo: 0.9, bq: 0.9, be: 0.5, gd: 1.6 };
    // singing speed is unknown: try a range of seconds-per-mora and keep the best-scoring alignment
    const r0 = U.clamp((activeT * 0.9) / totU, 0.1, 0.7);
    let res = null, rate = r0, bestSc = -Infinity;
    const rates = [0.5, 0.63, 0.8, 1, 1.25, 1.6, 2].map((k) => U.clamp(r0 * k, 0.08, 0.9));
    for (const rt of rates) {
      const r = alignLines(As, Os, step, units, rt, opt, anchors);
      if (r && r.score > bestSc) { bestSc = r.score; res = r; rate = rt; }
      await tick();
    }
    if (!res) return null;
    if (o.debug) LM.align._last.ms = { feat: tB - tA, dp: performance.now() - tB };
    onProg && onProg(0.95, 'words');
    const off = i0 * step;
    const cues = res.map((r, i) => {
      const s = off + r.s * step, e = off + r.e * step;
      // confidence: activity inside vs. just outside, and onset at the head
      let inA = 0; for (let k = r.s; k < r.e; k++) inA += As[k]; inA /= Math.max(1, r.e - r.s);
      let pre = 0; for (let k = 1; k <= 8; k++) pre += As[Math.max(0, r.s - k)] || 0; pre /= 8;
      const conf = U.clamp((inA - pre * 0.6) * 1.4 + Os[r.s] * 0.3, 0, 1);
      return { text: lines[i], start: +s.toFixed(3), end: +e.toFixed(3), conf: +conf.toFixed(2) };
    });
    // display end: hold the line until shortly before the next one when the gap is short
    cues.forEach((c, i) => {
      const nx = cues[i + 1];
      const tail = c.end + 0.25;
      c.end = nx ? (nx.start - tail < 0.9 ? Math.max(c.start + 0.3, nx.start - 0.03) : Math.min(tail, nx.start - 0.03)) : Math.min(F.dur, tail + 0.4);
      c.words = wordTimes(c.text, c.start, Math.min(c.end, c.start + ((res[i].e - res[i].s) * step)), O, step);
    });
    onProg && onProg(1, 'done');
    return { cues, rate, stereo: F.stereo, mono: F.stereo < 0.02 };
  }
  return { run, unitsOf, _features: features, _last: null };
})();
