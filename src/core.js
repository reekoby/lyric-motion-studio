/* Lyric Motion Studio — core utilities */
'use strict';
const LM = (window.LM = window.LM || {});

LM.U = (() => {
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a)));
  const smooth = (t) => t * t * (3 - 2 * t);
  // integer hash -> [0,1)
  const hash = (...args) => {
    let h = 2166136261 >>> 0;
    for (const a of args) {
      let v = typeof a === 'number' ? Math.floor(a * 1000) | 0 : strHash(String(a));
      h ^= v;
      h = Math.imul(h, 16777619);
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
      h ^= h >>> 15;
    }
    return (h >>> 0) / 4294967296;
  };
  const strHash = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h | 0;
  };
  const rng = (seed) => {
    let a = (seed >>> 0) || 1;
    const f = () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (n) => Math.floor(f() * n);
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.range = (a, b) => a + (b - a) * f();
    f.chance = (p) => f() < p;
    f.weighted = (obj, exclude) => {
      const ents = Object.entries(obj).filter(([k, w]) => w > 0 && !(exclude && exclude.includes(k)));
      const list = ents.length ? ents : Object.entries(obj).filter(([, w]) => w > 0);
      let tot = 0;
      for (const [, w] of list) tot += w;
      let r = f() * tot;
      for (const [k, w] of list) {
        r -= w;
        if (r <= 0) return k;
      }
      return list[list.length - 1][0];
    };
    return f;
  };
  // smooth value noise 1D
  const noise1 = (x, seed = 0) => {
    const i = Math.floor(x), f = x - i;
    const a = hash(i, seed) * 2 - 1, b = hash(i + 1, seed) * 2 - 1;
    return lerp(a, b, smooth(f));
  };
  // colors
  const hex2rgb = (h) => {
    h = String(h || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgb2hex = (r, g, b) =>
    '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => {
    const A = hex2rgb(a), B = hex2rgb(b);
    return rgb2hex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
  };
  const rgba = (h, a) => {
    const [r, g, b] = hex2rgb(h);
    return `rgba(${r},${g},${b},${a})`;
  };
  const lum = (h) => {
    const c = hex2rgb(h).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  // pick the candidate with best contrast against bg (first that passes min)
  const readable = (bg, cands, min = 3) => {
    for (const c of cands) if (c && contrast(c, bg) >= min) return c;
    let best = cands[0], bc = 0;
    for (const c of [...cands, '#ffffff', '#111111']) {
      const k = contrast(c, bg);
      if (k > bc) (bc = k), (best = c);
    }
    return best;
  };
  const hsl2hex = (h, s, l) => {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return rgb2hex(f(0) * 255, f(8) * 255, f(4) * 255);
  };
  const isHex = (s) => /^#[0-9a-fA-F]{6}$/.test(s || '');
  const fmtTime = (t, ms = true) => {
    t = Math.max(0, t || 0);
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${(ms ? s.toFixed(2) : Math.floor(s).toString()).padStart(ms ? 5 : 2, '0')}`;
  };
  const parseTime = (str) => {
    str = String(str).trim();
    if (!str) return NaN;
    if (str.includes(':')) {
      const [m, s] = str.split(':');
      return parseFloat(m) * 60 + parseFloat(s);
    }
    return parseFloat(str);
  };
  const uid = () => 'c' + Math.random().toString(36).slice(2, 9);
  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
  const DL_OK = /\.(gif|png|jpe?g|webp|mp4|webm|txt|json|md|zip|csv|svg|pdf|html)$/i;
  const inArtifact = () => !!(window.claude && typeof window.claude.use === 'function');
  let dlNs;
  const download = async (blob, name) => {
    if (inArtifact()) {
      if (dlNs === undefined) { try { dlNs = await window.claude.use('downloads'); } catch (e) { dlNs = null; } }
      if (dlNs) {
        if (!DL_OK.test(name)) name = /\.lmz$/i.test(name) ? name.replace(/\.lmz$/i, '.lmz.zip') : name + '.txt';
        try { await dlNs.save({ filename: name, data: blob }); return 'saved'; }
        catch (e) { if (e && e.code === 'declined') return 'declined'; throw new Error('保存できませんでした（' + ((e && e.code) || 'error') + '）'); }
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return 'saved';
  };
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch (e) {
        return false;
      }
    },
  };
  return { clamp, lerp, inv, smooth, hash, strHash, rng, noise1, hex2rgb, rgb2hex, mix, rgba, lum, contrast, readable, hsl2hex, isHex, fmtTime, parseTime, uid, debounce, download, store, inArtifact };
})();

LM.E = (() => {
  const c1 = 1.70158, c3 = c1 + 1, c4 = (2 * Math.PI) / 3;
  const E = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    inQuart: (t) => t * t * t * t,
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inQuint: (t) => t ** 5,
    inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
    outBack: (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
    inBack: (t) => c3 * t * t * t - c1 * t * t,
    outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1),
    outBounce: (t) => {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    },
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    outCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
    // spring-ish overshoot with damping
    spring: (t) => 1 - Math.exp(-6 * t) * Math.cos(12 * t),
  };
  return E;
})();

/* Grapheme / word segmentation */
LM.seg = (() => {
  const hasSeg = typeof Intl !== 'undefined' && Intl.Segmenter;
  const gs = hasSeg ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;
  const ws = hasSeg ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
  const graphemes = (s) => (gs ? Array.from(gs.segment(s), (x) => x.segment) : Array.from(s));
  const words = (s) => (ws ? Array.from(ws.segment(s), (x) => x.segment) : s.split(/(\s+)/).filter(Boolean));
  return { graphemes, words };
})();
