/* Audio decode + lightweight local analysis (energy, onset, tempo, beats) */
'use strict';
LM.audio = (() => {
  let buffer = null, mono = null, sr = 44100, analysis = null;

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const a = i + j, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }

  async function decode(arrayBuffer) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    try {
      const buf = await ac.decodeAudioData(arrayBuffer.slice(0));
      return buf;
    } finally { try { ac.close(); } catch (e) {} }
  }

  function setBuffer(buf) {
    buffer = buf; sr = buf.sampleRate;
    const n = buf.length, ch = buf.numberOfChannels;
    mono = new Float32Array(n);
    for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
    analysis = null;
  }

  // waveform peaks: per bucket min/max at `pps` points per second
  function peaks(pps = 60) {
    if (!mono) return null;
    const step = Math.max(1, Math.floor(sr / pps)), m = Math.ceil(mono.length / step);
    const mn = new Float32Array(m), mx = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      let a = 0, b = 0;
      const s = i * step, e = Math.min(mono.length, s + step);
      for (let j = s; j < e; j += 4) { const v = mono[j]; if (v < a) a = v; if (v > b) b = v; }
      mn[i] = a; mx[i] = b;
    }
    return { mn, mx, pps };
  }

  async function analyze(onProgress) {
    if (!mono) return null;
    const dsr = 11025, dec = Math.max(1, Math.round(sr / dsr)), rate = sr / dec;
    const N = Math.floor(mono.length / dec);
    const x = new Float32Array(N);
    for (let i = 0; i < N; i++) { let s = 0; for (let k = 0; k < dec; k++) s += mono[i * dec + k] || 0; x[i] = s / dec; }
    const hop = 128, win = 512, frames = Math.max(0, Math.floor((N - win) / hop));
    const onset = new Float32Array(frames), energy = new Float32Array(frames);
    let prev = new Float32Array(win / 2);
    const re = new Float32Array(win), im = new Float32Array(win);
    const hann = new Float32Array(win).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1)));
    for (let f = 0; f < frames; f++) {
      const o = f * hop; let en = 0;
      for (let i = 0; i < win; i++) { const v = x[o + i]; re[i] = v * hann[i]; im[i] = 0; en += v * v; }
      fft(re, im);
      let flux = 0;
      for (let k = 1; k < win / 2; k++) {
        const mag = Math.log1p(Math.hypot(re[k], im[k]) * 10);
        const d = mag - prev[k]; if (d > 0) flux += d * (k < 40 ? 1.6 : 1);
        prev[k] = mag;
      }
      onset[f] = flux; energy[f] = Math.sqrt(en / win);
      if (f % 4000 === 0 && onProgress) { onProgress(f / frames * 0.8); await new Promise((r) => setTimeout(r, 0)); }
    }
    const fps = rate / hop;
    // normalize onset
    const w = Math.round(fps * 0.5), on2 = new Float32Array(frames);
    let acc = 0;
    for (let i = 0; i < frames; i++) {
      acc += onset[i]; if (i >= w) acc -= onset[i - w];
      const avg = acc / Math.min(i + 1, w);
      on2[i] = Math.max(0, onset[i] - avg);
    }
    // tempo via autocorrelation
    const minL = Math.round((fps * 60) / 190), maxL = Math.round((fps * 60) / 65);
    let bestL = 0, bestV = -1;
    const scores = [];
    const lim = Math.min(frames, Math.round(fps * 120));
    for (let L = minL; L <= maxL; L++) {
      let s = 0; for (let i = L; i < lim; i++) s += on2[i] * on2[i - L];
      const bpm = (60 * fps) / L;
      const wgt = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 118) / 0.9, 2));
      s *= wgt; scores.push([L, s]);
      if (s > bestV) (bestV = s), (bestL = L);
    }
    // refine lag fractionally with parabolic interp
    let L = bestL;
    const sc = Object.fromEntries(scores);
    if (sc[bestL - 1] != null && sc[bestL + 1] != null) {
      const a = sc[bestL - 1], b = sc[bestL], c = sc[bestL + 1];
      const den = a - 2 * b + c; if (den !== 0) L = bestL + 0.5 * (a - c) / den;
    }
    const bpm = L > 0 ? (60 * fps) / L : 0;
    // phase
    let bestP = 0, bestPS = -1;
    for (let ph = 0; ph < L; ph += 0.5) {
      let s = 0; for (let k = ph; k < frames; k += L) s += on2[Math.round(k)] || 0;
      if (s > bestPS) (bestPS = s), (bestP = ph);
    }
    const beats = [];
    for (let k = bestP; k < frames; k += L) {
      // snap within ±2 frames to local onset max
      let bi = Math.round(k), bv = on2[bi] || 0;
      for (let d = -2; d <= 2; d++) { const v = on2[Math.round(k) + d] || 0; if (v > bv) (bv = v), (bi = Math.round(k) + d); }
      beats.push((bi * hop + win / 2) / rate);
    }
    // energy per 1/30 s
    const dur = buffer.duration, E30 = new Float32Array(Math.ceil(dur * 30));
    for (let i = 0; i < E30.length; i++) { const f = Math.floor((i / 30) * fps); E30[i] = energy[Math.min(frames - 1, Math.max(0, f))] || 0; }
    let mxE = 0; for (const v of E30) mxE = Math.max(mxE, v);
    const En = E30.map((v) => (mxE ? v / mxE : 0));
    // smooth energy
    const Es = new Float32Array(En.length); const sw = 15;
    for (let i = 0; i < En.length; i++) { let s = 0, c = 0; for (let j = i - sw; j <= i + sw; j++) if (j >= 0 && j < En.length) (s += En[j]), c++; Es[i] = s / c; }
    // active region (music start/end)
    const th = 0.12;
    let st = 0; while (st < Es.length && Es[st] < th) st++;
    let en = Es.length - 1; while (en > st && Es[en] < th) en--;
    // downbeat (bar "1") phase: the beat slot (mod 4) with the strongest accents
    const bz = beats.filter((b) => b < dur), dacc = [0, 0, 0, 0], cnt = [0, 0, 0, 0];
    bz.forEach((b, i) => { const f = Math.round((b * rate - win / 2) / hop); let v = 0; for (let d = -2; d <= 2; d++) v = Math.max(v, onset[f + d] || 0); const e = Es[Math.min(Es.length - 1, Math.round(b * 30))] || 0; dacc[i % 4] += v * (0.6 + e); cnt[i % 4]++; });
    let downbeat = 0; for (let k = 1; k < 4; k++) if (dacc[k] / Math.max(1, cnt[k]) > dacc[downbeat] / Math.max(1, cnt[downbeat])) downbeat = k;
    analysis = { bpm: Math.round(bpm * 10) / 10, beats: bz, downbeat, energy: Es, activeStart: st / 30, activeEnd: (en + 1) / 30, duration: dur };
    if (onProgress) onProgress(1);
    return analysis;
  }

  function energyAt(t0, t1) {
    if (!analysis) return 0.5;
    const e = analysis.energy; const a = Math.max(0, Math.floor(t0 * 30)), b = Math.min(e.length, Math.ceil(t1 * 30));
    let s = 0, c = 0; for (let i = a; i < b; i++) (s += e[i]), c++;
    return c ? s / c : 0.5;
  }

  const specRe = new Float32Array(1024), specIm = new Float32Array(1024), bands = new Float32Array(32);
  function spectrum(t) {
    if (!mono) return null;
    const c = Math.floor(t * sr), n = 1024;
    for (let i = 0; i < n; i++) { const v = mono[c - n / 2 + i] || 0; specRe[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))); specIm[i] = 0; }
    fft(specRe, specIm);
    const B = bands.length;
    for (let b = 0; b < B; b++) {
      const lo = Math.floor(Math.pow(2, (b / B) * 8.5) + 1), hi = Math.max(lo + 1, Math.floor(Math.pow(2, ((b + 1) / B) * 8.5) + 1));
      let s = 0; for (let k = lo; k < hi && k < n / 2; k++) s += Math.hypot(specRe[k], specIm[k]);
      bands[b] = Math.min(1, Math.log1p((s / (hi - lo)) * 2) / 2.2);
    }
    return bands;
  }
  function waveAt(t, n = 128) {
    if (!mono) return null;
    const out = new Float32Array(n), c = Math.floor(t * sr), span = Math.floor(sr * 0.05);
    for (let i = 0; i < n; i++) out[i] = mono[c + Math.floor((i / n) * span)] || 0;
    return out;
  }
  function slice(t0, t1) {
    if (!buffer) return null;
    const a = Math.max(0, Math.floor(t0 * buffer.sampleRate)), b = Math.min(buffer.length, Math.ceil(t1 * buffer.sampleRate));
    const len = Math.max(1, b - a);
    const out = new AudioBuffer({ length: len, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
    for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).subarray(a, b), c);
    return out;
  }

  return {
    decode, setBuffer, peaks, analyze, energyAt, spectrum, waveAt, slice,
    get buffer() { return buffer; }, get analysis() { return analysis; }, set analysis(a) { analysis = a; },
    clear() { buffer = null; mono = null; analysis = null; },
  };
})();
