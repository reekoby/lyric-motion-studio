/* Project model: defaults, import/migration, timing operations, subtitles */
'use strict';
LM.model = (() => {
  const U = LM.U, D = LM.data, M = LM.motion;
  const FR = 1 / 30, EPS = 1e-4;

  function newProject() {
    return {
      version: 2, title: '', artist: '', showCredits: false, creditPos: 'bl',
      duration: 30, aspect: '16:9', theme: 'jpop', seed: 1234,
      palette: 'popart', autoColors: true, autoFilters: true, colors: null,
      font: null, fontWeight: null, textScale: 1, tracking: 0, intensity: 1, speed: 1,
      filters: [], filterAmt: {}, filterIntensity: 0.6,
      bg: { type: 'gradient', image: null, dim: 0.45, blur: 0 }, pattern: 'none', camera: null,
      beatSync: true, bpm: null, beatOffset: 0, tapLatency: 0.12, tempoSync: true, autoBgm: true, autoTrans: true, autoGfx: true, transOff: false, bgmDim: 0.22, bgm: [], bgmAmt: 1, bgmSpeed: 1, qGrid: 1, qStrength: 1, qEnd: false, autoQuantize: false, keyColor: true, bgCrossfade: true, ruby: true, mblur: 0, sections: [], images: [], imgMode: 'auto', imgChange: 'auto', imgEvery: 2, imgOrder: 'order', imgTrans: 'auto', imgTransDur: 0, imgKB: true, imgLook: 'natural', imgBeat: true, imgBgmFull: false, bgmOpacity: 1, bgmBlend: 'normal', imgFirst: false, imgOpacity: 1, imgBlend: 'normal', imgDim: null, imgBlur: null, bgmMixSet: false, gapOpacity: null, gapBlend: null, gapAmt: 1.2, gapSpeed: 1.12, gapCam: 1, gapEvery: 'auto', gapFlash: 1, gapVisAmt: 1, gapProgress: true, gapOv: {}, drive: null, feel: 'auto', variety: null, latinFont: 'auto', koreanFont: 'auto', latinTrack: 0, wordSpace: 1, wakanGap: 25, yakuAmt: 1, latinScale: 1, wakan: true, yakumono: true, gapFill: 'auto', gapVisual: true, gapLabel: true, gapVisStyle: 'auto', gapCountdown: false, gapMin: 1.2, gapBgm: [],
      cues: [], audioName: null,
    };
  }

  /* ---- untrusted input hygiene (project .json / .lmz / localStorage) ---- */
  const BAD_KEY = new Set(['__proto__', 'constructor', 'prototype']);
  // deep copy through JSON, dropping prototype-polluting keys and absurdly deep / large structures
  function safeClone(v, depth = 0) {
    if (v == null || typeof v !== 'object') return typeof v === 'string' ? v.slice(0, 200000) : typeof v === 'number' ? (isFinite(v) ? v : 0) : v;
    if (depth > 12) return null;
    if (Array.isArray(v)) return v.slice(0, 5000).map((x) => safeClone(x, depth + 1));
    const o = {};
    for (const k of Object.keys(v).slice(0, 400)) if (!BAD_KEY.has(k)) o[k] = safeClone(v[k], depth + 1);
    return o;
  }
  const ID_RE = /^[\w-]{1,40}$/;
  const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && isFinite(v) ? U.clamp(v, lo, hi) : d);
  const strIn = (v, ok, d) => (typeof v === 'string' && ok(v) ? v : d);
  const strArr = (v, ok, max = 12) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && ok(x)).slice(0, max) : []);
  // instrumental-section settings (global p.gap* fields when !full, or one section's override object when full)
  const GAP_VIS = ['auto', 'spectrum', 'marquee', 'title', 'none'], GAP_EVERY = ['auto', '0', '1', '2', '4', '8'];
  function sanitizeGap(src, full) {
    const o = {}, g = src && typeof src === 'object' ? src : {};
    const get = (k) => (full ? g[k] : g['gap' + k[0].toUpperCase() + k.slice(1)]);
    const B = (LM.Renderer && LM.Renderer.BLEND) || {};
    const op = get('opacity'); if (typeof op === 'number' && isFinite(op)) o.opacity = U.clamp(op, 0, 1);
    const bl = get('blend'); if (typeof bl === 'string' && B[bl]) o.blend = bl;
    [['amt', 0, 3], ['speed', 0.25, 3], ['cam', 0, 3], ['flash', 0, 2], ['visAmt', 0, 1]].forEach(([k, lo, hi]) => { const v = get(k); if (typeof v === 'number' && isFinite(v)) o[k] = U.clamp(v, lo, hi); });
    const ev = get('every'); if (ev != null && GAP_EVERY.includes(String(ev))) o.every = String(ev);
    if (full) {
      if (['auto', 'continue', 'off'].includes(g.fill)) o.fill = g.fill;
      if (Array.isArray(g.bgm)) o.bgm = strArr(g.bgm, (x) => !!(LM.bgm && LM.bgm.lib[x]), 6);
      if (GAP_VIS.includes(g.vis)) o.vis = g.vis;
      ['label', 'countdown', 'progress'].forEach((k) => { if (typeof g[k] === 'boolean') o[k] = g[k]; });
      if (typeof g.labelText === 'string' && g.labelText.trim()) o.labelText = g.labelText.slice(0, 40);
    }
    return o;
  }
  function normalize(raw) {
    raw = safeClone(raw || {});
    const base = newProject();
    // keep only values whose type matches the defaults (unknown keys are dropped)
    const p = Object.assign({}, base);
    for (const k of Object.keys(raw)) {
      if (!(k in base) && !['title', 'artist', 'showCredits', 'creditPos', 'series', 'font', 'fontWeight', 'palette', 'colors', 'bg', 'filters', 'filterAmt', 'intensity', 'speed', 'seed', 'textScale', 'tracking', 'pattern', 'camera', 'filterIntensity', 'autoColors', 'autoFilters', 'version', 'style', 'tone', 'duration'].includes(k)) continue;
      const d = base[k], v = raw[k];
      if (d != null && v != null && (Array.isArray(d) ? !Array.isArray(v) : typeof d !== typeof v)) continue;
      p[k] = v;
    }
    if (!raw || !raw.version || raw.version < 2) {
      // v1 migration
      if (raw && raw.style && !raw.theme) p.theme = D.styleMap[raw.style] || 'jpop';
      if (raw && raw.tone && D.seriesMap[raw.tone]) p.series = D.seriesMap[raw.tone];
      if (raw && raw.showHud != null) delete p.showHud;
    }
    p.version = 2;
    if (!D.aspects[p.aspect]) p.aspect = '16:9';
    if (!D.themeById[p.theme]) p.theme = 'jpop';
    if (!D.palById[p.palette]) p.palette = (D.themeById[p.theme].pals || ['ink'])[0];
    if (p.colors && !(Array.isArray(p.colors) && p.colors.length >= 3 && p.colors.every(U.isHex))) p.colors = null;
    if (!p.bg || typeof p.bg !== 'object' || Array.isArray(p.bg)) p.bg = { type: 'solid' };
    // background image: only an embedded data URL (never a remote URL a file could make the browser fetch)
    p.bg = { type: strIn(p.bg.type, (x) => !!D.bgTypes[x], 'solid'), image: typeof p.bg.image === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(p.bg.image) ? p.bg.image : undefined, dim: num(p.bg.dim, undefined, 0, 1), blur: num(p.bg.blur, undefined, 0, 60) };
    if (p.bg.type === 'image' && !p.bg.image) p.bg.type = 'solid';
    p.filters = strArr(p.filters, (f) => !!LM.fx.list[f], 6);
    p.filterAmt = p.filterAmt && typeof p.filterAmt === 'object' && !Array.isArray(p.filterAmt) ? Object.fromEntries(Object.entries(p.filterAmt).filter(([k, v]) => LM.fx.list[k] && typeof v === 'number' && isFinite(v)).map(([k, v]) => [k, U.clamp(v, 0, 3)])) : {};
    p.audioName = typeof p.audioName === 'string' ? p.audioName.slice(0, 200) : null;
    p.title = typeof p.title === 'string' ? p.title.slice(0, 100) : ''; p.artist = typeof p.artist === 'string' ? p.artist.slice(0, 100) : '';
    p.font = typeof p.font === 'string' && (D.fontById[p.font] || /^user\d+$/.test(p.font)) ? p.font : null;
    p.series = typeof p.series === 'string' && D.palCats[p.series] ? p.series : null;
    ['intensity', 'speed', 'textScale', 'tracking', 'filterIntensity', 'seed', 'fontWeight'].forEach((k) => { if (p[k] != null && !(typeof p[k] === 'number' && isFinite(p[k]))) p[k] = base[k] ?? null; });
    p.bgm = strArr(p.bgm, (x) => !!(LM.bgm && LM.bgm.lib[x]), 4); p.gapBgm = strArr(p.gapBgm, (x) => !!(LM.bgm && LM.bgm.lib[x]), 4);
    if (!(typeof p.latinFont === 'string' && (p.latinFont === 'auto' || p.latinFont === 'same' || D.fontById[p.latinFont]))) p.latinFont = 'auto';
    if (!(typeof p.koreanFont === 'string' && (p.koreanFont === 'auto' || D.fontById[p.koreanFont]))) p.koreanFont = 'auto';
    p.bgmOpacity = num(p.bgmOpacity, 1, 0, 1); if (!(LM.Renderer && LM.Renderer.BLEND && LM.Renderer.BLEND[p.bgmBlend])) p.bgmBlend = 'normal';
    p.imgFirst = p.imgFirst === true; p.imgDim = num(p.imgDim, null, 0, 1); p.imgBlur = num(p.imgBlur, null, 0, 60); p.imgOpacity = num(p.imgOpacity, 1, 0, 1); if (!(LM.Renderer && LM.Renderer.BLEND && LM.Renderer.BLEND[p.imgBlend])) p.imgBlend = 'normal';
    const G = sanitizeGap(p); Object.assign(p, { gapOpacity: G.opacity ?? null, gapBlend: G.blend ?? null, gapAmt: G.amt ?? 1.2, gapSpeed: G.speed ?? 1.12, gapCam: G.cam ?? 1, gapEvery: G.every ?? 'auto', gapFlash: G.flash ?? 1, gapVisAmt: G.visAmt ?? 1, gapProgress: p.gapProgress !== false });
    const ov = {};
    if (p.gapOv && typeof p.gapOv === 'object' && !Array.isArray(p.gapOv)) for (const k of Object.keys(p.gapOv).slice(0, 200)) if (/^(n:[\w-]{1,40}|end)$/.test(k)) { const o = sanitizeGap(p.gapOv[k], true); if (Object.keys(o).length) ov[k] = o; }
    p.gapOv = ov;
    p.latinTrack = num(p.latinTrack, 0, -0.2, 0.5); p.wordSpace = num(p.wordSpace, 1, 0.3, 3); p.wakanGap = num(p.wakanGap, 25, 0, 80); p.yakuAmt = num(p.yakuAmt, 1, 0, 1);
    p.drive = p.drive == null ? null : num(p.drive, null, 0, 1); p.variety = p.variety == null ? null : num(p.variety, null, 0, 1);
    p.cues = (p.cues || []).map((c, i) => normalizeCue(c, i)).sort((a, b) => a.start - b.start);
    const ids = new Set();
    p.cues.forEach((c) => { while (ids.has(c.id)) c.id = U.uid(); ids.add(c.id); });
    p.duration = Math.max(1, Math.min(1200, +p.duration || 30));
    p.images = (Array.isArray(p.images) ? p.images : []).filter((x) => x && typeof x.id === 'string' && ID_RE.test(x.id)).slice(0, 60).map((x) => {
      const o = { id: x.id, name: String(x.name || '画像').slice(0, 60), on: x.on !== false, fx: num(x.fx, undefined, 0, 1), fy: num(x.fy, undefined, 0, 1) };
      // framing: position offset (fraction of the frame), size, rotation, flip, fit, and per-picture pan
      const PAN = ['auto', 'none', 'left', 'right', 'up', 'down', 'zoomIn', 'zoomOut', 'spin'];
      const fr = { ox: num(x.ox, undefined, -1, 1), oy: num(x.oy, undefined, -1, 1), zoom: num(x.zoom, undefined, 0.1, 5), rot: num(x.rot, undefined, -180, 180), panAmt: num(x.panAmt, undefined, 0, 100) };
      Object.keys(fr).forEach((k) => { if (fr[k] != null) o[k] = fr[k]; });
      if (x.flip === true) o.flip = true; if (x.fit === 'contain') o.fit = 'contain'; if (PAN.includes(x.pan) && x.pan !== 'auto') o.pan = x.pan;
      if (x.type === 'video') Object.assign(o, { type: 'video', dur: num(x.dur, 0, 0, 36000), vin: num(x.vin, 0, 0, 36000), vout: num(x.vout, 0, 0, 36000), speed: num(x.speed, 1, 0.25, 4), sync: x.sync === 'song' ? 'song' : 'slot', loop: x.loop !== false, kb: x.kb !== false });
      return o;
    });
    p.sections = (Array.isArray(p.sections) ? p.sections : []).filter((x) => x && SEC[x.type] && isFinite(+x.t)).map((x) => ({ t: Math.max(0, +x.t), type: x.type, est: !!x.est })).sort((a, b) => a.t - b.t);
    return p;
  }
  function normalizeCue(c, i) {
    c = safeClone(c && typeof c === 'object' ? c : {});
    c.id = typeof c.id === 'string' && ID_RE.test(c.id) ? c.id : U.uid();
    c.text = String(c.text || '').slice(0, 300);
    c.start = Math.max(0, +c.start || 0);
    c.end = Math.max(c.start + FR, +c.end || c.start + 2);
    if (c.motion && !c.enter) { const lg = M.legacy(c.motion); Object.assign(c, lg); }
    delete c.motion;
    if (c.colors && !(Array.isArray(c.colors) && c.colors.length >= 3 && c.colors.every(U.isHex))) c.colors = null;
    c.filters = (c.filters || []).filter((f) => LM.fx.list[f]);
    if (c.words && !(Array.isArray(c.words) && c.words.every((x) => x == null || isFinite(+x)))) delete c.words;
    if (c.tf && (typeof c.tf !== 'object' || Array.isArray(c.tf))) delete c.tf;
    if (c.tf) c.tf = Object.fromEntries(Object.entries(c.tf).filter(([, v]) => typeof v === 'number' && isFinite(v)));
    ['enter', 'hold', 'exit', 'emph'].forEach((k) => { if (c[k] != null && !(typeof c[k] === 'string' && M[k] && M[k][c[k]])) delete c[k]; });
    // Motion System parameters: only known keys, numbers clamped, strings from fixed vocabularies
    if (c.mp != null) {
      const src = c.mp && typeof c.mp === 'object' && !Array.isArray(c.mp) ? c.mp : {}, out = {};
      const EZ = ['auto', 'linear', 'easeIn', 'easeOut', 'easeInOut', 'cubic', 'expo', 'back', 'elastic', 'spring'], TR = ['beat', 'half', 'quarter', 'eighth', 'two', 'bar', 'word', 'phrase'], TG = ['auto', 'all', 'emph', 'word'];
      ['e', 'h', 'm', 'x'].forEach((k) => {
        const o = src[k]; if (!o || typeof o !== 'object' || Array.isArray(o)) return; const r = {};
        [['i', 0, 100], ['v', 0, 100], ['st', 0, 100], ['beats', 0, 8], ['delay', 0, 5], ['k', 10, 1000], ['dm', 1, 200], ['ms', 0.1, 10], ['s', 0, 5]].forEach(([n, lo, hi]) => { const v = num(o[n], null, lo, hi); if (v != null) r[n] = v; });
        if (EZ.includes(o.ease)) r.ease = o.ease; if (TR.includes(o.trig)) r.trig = o.trig; if (TG.includes(o.tgt)) r.tgt = o.tgt;
        if (Object.keys(r).length) out[k] = r;
      });
      const sd = num(src.seed, null, 0, 1e6); if (sd != null) out.seed = Math.round(sd);
      if (Object.keys(out).length) c.mp = out; else delete c.mp;
    }
    c.gfx = strArr(c.gfx, (x) => !!(LM.gfx && LM.gfx.lib ? LM.gfx.lib[x] : /^[\w-]{1,40}$/.test(x)), 4);
    if (c.bgm != null) { if (Array.isArray(c.bgm)) c.bgm = strArr(c.bgm, (x) => !!(LM.bgm && LM.bgm.lib[x]), 4); else delete c.bgm; }
    if (c.trans != null && !(typeof c.trans === 'string' && (c.trans === 'none' || (LM.trans && LM.trans.lib[c.trans])))) delete c.trans;
    if (c.font != null && !(typeof c.font === 'string' && (D.fontById[c.font] || /^user\d+$/.test(c.font)))) delete c.font;
    if (c.img != null && !(typeof c.img === 'string' && ID_RE.test(c.img))) delete c.img;
    if (c.kind != null && c.kind !== 'title') delete c.kind;
    c.locked = c.locked === true;
    ['textScale', 'filterAmt', 'ed', 'xd'].forEach((k) => { if (c[k] != null && !(typeof c[k] === 'number' && isFinite(c[k]))) delete c[k]; });
    if (c.bgmOpacity != null) { c.bgmOpacity = num(c.bgmOpacity, null, 0, 1); if (c.bgmOpacity == null) delete c.bgmOpacity; }
    if (c.bgmBlend != null && !(LM.Renderer && LM.Renderer.BLEND && LM.Renderer.BLEND[c.bgmBlend])) delete c.bgmBlend;
    if (c.trackAdj != null) { c.trackAdj = num(c.trackAdj, 0, -0.2, 0.5); if (!c.trackAdj) delete c.trackAdj; }
    if (c.wordSpaceAdj != null) { c.wordSpaceAdj = num(c.wordSpaceAdj, 1, 0.3, 3); if (c.wordSpaceAdj === 1) delete c.wordSpaceAdj; }
    const sc = c.scene && typeof c.scene === 'object' ? c.scene : {};
    c.scene = { layout: sc.layout, decoration: typeof sc.decoration === 'string' && D.patterns[sc.decoration] ? sc.decoration : undefined, camera: typeof sc.camera === 'string' && D.cameras && D.cameras[sc.camera] ? sc.camera : undefined, font: typeof sc.font === 'string' && D.fontById[sc.font] ? sc.font : undefined, invert: sc.invert === true, variant: num(sc.variant, 0, 0, 1e9), pal: typeof sc.pal === 'string' && D.palById[sc.pal] ? sc.pal : undefined, bgm: Array.isArray(sc.bgm) ? strArr(sc.bgm, (x) => !!(LM.bgm && LM.bgm.lib[x]), 4) : undefined };
    if (!LM.layout.lib[c.scene.layout]) c.scene.layout = 'center';
    return c;
  }

  // shift a cue in time, carrying its absolute word stamps along
  function moveCue(c, d) { c.start += d; c.end += d; if (Array.isArray(c.words)) c.words = c.words.map((x) => (x == null ? x : x + d)); }
  // drop word stamps that fall outside the cue after a trim
  function clipWords(c) { if (Array.isArray(c.words)) c.words = c.words.map((x) => (x == null || x < c.start - 1e-3 || x >= c.end ? null : x)); }

  /* song structure */
  const SEC = {
    intro: { n: 'イントロ', e: 0.3, col: '#8a8f98' }, A: { n: 'Aメロ', e: 0.42, col: '#4f8cff' }, B: { n: 'Bメロ', e: 0.6, col: '#a26bff' },
    chorus: { n: 'サビ', e: 0.95, col: '#ff4d6d' }, inter: { n: '間奏', e: 0.5, col: '#20b8a6' }, C: { n: 'Cメロ', e: 0.55, col: '#f0a020' },
    bridge: { n: 'ブリッジ', e: 0.4, col: '#6fb04a' }, outro: { n: 'アウトロ', e: 0.25, col: '#666c78' },
  };
  const SEC_ORDER = ['intro', 'A', 'B', 'chorus', 'inter', 'C', 'bridge', 'outro'];
  function sectionAt(p, t) { let s = null; for (const x of p.sections || []) { if (x.t <= t + 1e-3) s = x; else break; } return s; }
  /* estimate structure from energy novelty on a bar grid. Marked est:true so the UI can show it as a guess */
  function estimateSections(p, an) {
    if (!an || !an.energy || !an.energy.length) return null;
    const E = an.energy, dur = an.duration || p.duration;
    const bpm = p.bpm > 0 ? p.bpm : an.bpm > 40 ? an.bpm : 120;
    let bar = (60 / bpm) * 4; while (bar < 1.6) bar *= 2;
    const b0 = an.beats && an.beats.length ? an.beats[Math.min(an.beats.length - 1, an.downbeat || 0)] % bar : 0;
    const bars = []; for (let t = b0; t < dur; t += bar) bars.push(t);
    const eb = bars.map((t) => { const a = Math.floor(t * 30), b = Math.min(E.length, Math.ceil((t + bar) * 30)); let s = 0, c = 0; for (let i = a; i < b; i++) (s += E[i]), c++; return c ? s / c : 0; });
    const W = 4, nov = eb.map((_, i) => { if (i < 2 || i > eb.length - 2) return 0; let l = 0, r = 0, lc = 0, rc = 0; for (let k = 1; k <= W; k++) { if (i - k >= 0) (l += eb[i - k]), lc++; if (i + k - 1 < eb.length) (r += eb[i + k - 1]), rc++; } return Math.abs(r / rc - l / lc) * (i % 4 === 0 ? 1.35 : i % 2 === 0 ? 1.1 : 0.85); });
    const cuts = [0]; const minBars = 4;
    const cand = nov.map((v, i) => [v, i]).filter((x) => x[0] > 0.06).sort((a, b) => b[0] - a[0]);
    for (const [, i] of cand) if (cuts.every((c) => Math.abs(c - i) >= minBars)) cuts.push(i);
    cuts.sort((a, b) => a - b);
    const segs = cuts.map((c, k) => { const e2 = k < cuts.length - 1 ? cuts[k + 1] : eb.length; let s = 0; for (let i = c; i < e2; i++) s += eb[i]; return { i: c, t: bars[c] || 0, t1: bars[e2] || dur, e: s / Math.max(1, e2 - c) }; });
    const es = segs.map((s) => s.e).sort((a, b) => a - b), hiE = es[Math.floor(es.length * 0.7)] || 0, loE = es[Math.floor(es.length * 0.25)] || 0;
    const hasCue = (a, b) => p.cues.some((c) => c.start < b - 0.2 && c.end > a + 0.2);
    let verse = 0, seenChorus = false;
    const out = segs.map((s, k) => {
      let type;
      if (k === 0 && (!hasCue(s.t, s.t1) || s.e <= loE)) type = 'intro';
      else if (k === segs.length - 1 && (s.e <= loE || !hasCue(s.t, s.t1)) && segs.length > 2) type = 'outro';
      else if (!hasCue(s.t, s.t1)) type = 'inter';
      else if (s.e >= hiE && k > 0) { type = 'chorus'; seenChorus = true; verse = 0; }
      else if (seenChorus && s.e < loE * 1.1 && k > segs.length * 0.6) type = 'C';
      else { type = verse === 0 ? 'A' : 'B'; verse++; }
      return { t: Math.round(s.t * 1000) / 1000, type, est: true };
    });
    return out.filter((x, i) => i === 0 || x.type !== out[i - 1].type || x.type === 'chorus');
  }

  function linesFrom(text) {
    return String(text || '').replace(/\r/g, '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 500).map((s) => s.slice(0, 300));
  }

  /* character-weighted provisional timing within active music region */
  function autoTime(lines, duration, an, opts = {}) {
    const n = lines.length;
    if (!n) return [];
    let a = 0.4, b = Math.max(a + n * 0.3, duration - 0.4);
    if (an && an.activeEnd > an.activeStart + n * 0.5) { a = Math.max(0, an.activeStart + 0.2); b = Math.min(duration, an.activeEnd); }
    const w = lines.map((s) => (LM.typo.parse(s).units ?? LM.typo.parse(s).count) * 0.22 + 0.9);
    const tot = w.reduce((x, y) => x + y, 0);
    const span = b - a;
    const gap = Math.min(0.12, span / n * 0.08);
    let t = a;
    const beats = opts.snap && an && an.beats && an.beats.length ? an.beats : null;
    const snap = (x) => {
      if (!beats) return x;
      let best = x, bd = 0.2;
      for (const bb of beats) { const d = Math.abs(bb - x); if (d < bd) (bd = d), (best = bb); if (bb > x + 0.2) break; }
      return best;
    };
    const out = lines.map((text, i) => {
      const d = (w[i] / tot) * span;
      let s = snap(t);
      const e = i === n - 1 ? b : snap(t + d) - gap;
      t += d;
      return { text, start: s, end: Math.max(s + FR * 3, e) };
    });
    for (let i = 0; i < out.length - 1; i++) if (out[i].end > out[i + 1].start) out[i].end = Math.max(out[i].start + FR, out[i + 1].start - 0.02);
    return out;
  }

  /* validation */
  function validate(p) {
    const iss = [];
    const cs = p.cues;
    cs.forEach((c, i) => {
      if (c.end - c.start < FR - EPS) iss.push({ i, type: 'short', msg: `${i + 1}行目：長さが1フレーム未満です` });
      if (c.end <= c.start) iss.push({ i, type: 'reverse', msg: `${i + 1}行目：終了が開始より前です` });
      if (c.end > p.duration + EPS) iss.push({ i, type: 'over', msg: `${i + 1}行目：曲の終わりをはみ出しています（補正を続けると収まります。この部分は書き出しに含まれません）` });
      if (i < cs.length - 1 && c.end > cs[i + 1].start + EPS) iss.push({ i, type: 'overlap', msg: `${i + 1}行目：次の行と重なっています` });
    });
    return iss;
  }
  function repairEnds(p) {
    const cs = p.cues; const errs = [];
    cs.sort((a, b) => a.start - b.start);
    cs.forEach((c, i) => {
      const lim = i < cs.length - 1 ? cs[i + 1].start : p.duration;
      if (c.end <= c.start || c.end > lim + EPS) c.end = lim;
      if (c.end - c.start < FR - EPS) errs.push(`${i + 1}行目：次の行の開始が近すぎて修復できません`);
      if (c.start > p.duration) errs.push(`${i + 1}行目：開始が曲の長さを超えています`);
    });
    return errs;
  }
  // ⌖ set start at t: connect previous end, keep duration, push following cues
  function stampStart(p, i, t) {
    const cs = p.cues, c = cs[i];
    if (!c) return 'フレーズがありません';
    const prev = cs[i - 1];
    if (prev && t < prev.start + FR - EPS) return '前の行の開始より前には設定できません';
    const d = Math.max(FR, c.end - c.start);
    if (t + d > p.duration + EPS) {
      if (t + FR > p.duration) return '曲の終わりに収まりません';
    }
    if (prev && prev.end > t) prev.end = t;
    moveCue(c, t - c.start); c.end = Math.min(p.duration, t + d);
    // push following
    for (let k = i + 1; k < cs.length; k++) {
      const a = cs[k - 1], b = cs[k];
      if (b.start < a.end - EPS) {
        const dd = b.end - b.start; moveCue(b, a.end - b.start); b.end = b.start + dd;
        if (b.end > p.duration) { b.end = p.duration; if (b.end - b.start < FR) return `${k + 1}行目以降が曲末に収まりません`; }
      } else break;
    }
    return null;
  }
  // ripple: move cue i to start at t and shift every later cue by the same delta (durations & gaps kept)
  function rippleStart(p, i, t) {
    const cs = p.cues, c = cs[i];
    if (!c) return { err: 'フレーズがありません' };
    const prev = cs[i - 1];
    if (prev && t < prev.start + FR - EPS) return { err: `${i}行目の開始より前には移動できません（前の行を先に補正してください）` };
    if (t > p.duration - FR) return { err: '曲の終わりに収まりません' };
    const d = t - c.start;
    // later cues may run past the song end for now; they come back in as the user keeps correcting
    for (let k = i; k < cs.length; k++) moveCue(cs[k], d);
    if (prev && prev.end > t) prev.end = Math.max(prev.start + FR, t);
    return { d };
  }
  /* beat grid: manual BPM wins, else analyzed beats; sub = subdivisions per beat (1, 2, 4) */
  function beatGrid(p, an, sub = 1) {
    let beats = null;
    if (p.bpm > 0) { beats = []; const per = 60 / p.bpm; let b = (p.beatOffset || 0) % per; if (b < 0) b += per; for (; b < p.duration + 30; b += per) beats.push(b); }
    else if (an && an.beats && an.beats.length > 1) beats = an.beats.slice();
    if (!beats || beats.length < 2) return null;
    if (sub < 1) { const db = p.bpm > 0 ? 0 : (an && an.downbeat) || 0; return beats.filter((_, i) => (i - db) % 4 === 0); } // 小節頭
    if (sub <= 1) return beats;
    const g = [];
    for (let k = 0; k < beats.length - 1; k++) for (let j = 0; j < sub; j++) g.push(beats[k] + ((beats[k + 1] - beats[k]) * j) / sub);
    g.push(beats[beats.length - 1]);
    return g;
  }
  function nearest(grid, t) {
    let lo = 0, hi = grid.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (grid[m] <= t) lo = m; else hi = m; }
    return Math.abs(grid[lo] - t) <= Math.abs(grid[hi] - t) ? grid[lo] : grid[hi];
  }
  /* quantize cue starts (and optionally ends) toward the grid. o = {from, to, strength, ends} */
  function quantize(p, grid, o = {}) {
    const cs = p.cues, st = o.strength == null ? 1 : o.strength;
    let moved = 0, skipped = 0;
    for (let i = o.from || 0; i <= Math.min(cs.length - 1, o.to == null ? cs.length - 1 : o.to); i++) {
      const c = cs[i], prev = cs[i - 1], next = cs[i + 1];
      const len = c.end - c.start;
      let s = c.start + (nearest(grid, c.start) - c.start) * st;
      if (prev && s < prev.start + FR) { skipped++; continue; }
      if (prev && prev.end > s) prev.end = Math.max(prev.start + FR, s);
      let e = s + len;
      if (o.ends) e = e + (nearest(grid, e) - e) * st;
      const lim = next ? next.start : Infinity;
      e = Math.min(e, Math.max(lim, s + FR));
      if (e - s < FR) e = s + FR;
      if (Math.abs(s - c.start) > 1e-4 || Math.abs(e - c.end) > 1e-4) moved++;
      const ds = s - c.start; if (Array.isArray(c.words)) c.words = c.words.map((x) => (x == null ? x : x + ds));
      c.start = s; c.end = e;
    }
    // resolve any overlap created with following cues (keep order)
    for (let i = 1; i < cs.length; i++) if (cs[i - 1].end > cs[i].start) cs[i - 1].end = Math.max(cs[i - 1].start + FR, cs[i].start);
    return { moved, skipped };
  }
  function shiftFrom(p, from, d) {
    const cs = p.cues;
    if (!cs[from]) return 'フレーズがありません';
    const prev = cs[from - 1];
    const minStart = prev ? prev.start + FR : 0;
    if (cs[from].start + d < minStart) d = minStart - cs[from].start;
    for (let k = from; k < cs.length; k++) moveCue(cs[k], d);
    if (prev && prev.end > cs[from].start) prev.end = Math.max(prev.start + FR, cs[from].start);
    return null;
  }
  function stampEnd(p, i, t) {
    const cs = p.cues, c = cs[i];
    if (!c) return 'フレーズがありません';
    if (t < c.start + FR) return '開始より前には設定できません';
    const next = cs[i + 1];
    c.end = Math.min(t, p.duration);
    if (next && c.end > next.start) { const dd = next.end - next.start; next.start = c.end; next.end = Math.min(p.duration, next.start + Math.max(FR, dd)); }
    return null;
  }

  /* subtitles */
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const ts = (t, sep = ',') => { t = Math.max(0, t); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000) % 1000; return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms, 3)}`; };
  const lyr = (p) => p.cues.filter((c) => c.kind !== 'title');
  const clean = (s) => String(s).replace(/[|｜]([^《|｜]+)《[^》]*》/g, '$1').replace(/《[^》]*》/g, '').replace(/[*^]/g, '').replace(/\//g, ' ');
  function toSRT(p) { return lyr(p).map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${clean(c.text)}\n`).join('\n'); }
  function toVTT(p) { return 'WEBVTT\n\n' + lyr(p).map((c) => `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${clean(c.text)}\n`).join('\n'); }
  const lts = (t) => { t = Math.max(0, t); const cs = Math.round(t * 100); return `${pad(Math.floor(cs / 6000))}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`; };
  /* LRC; enhanced=true writes A2 word stamps <mm:ss.xx> for cues that have word timing */
  function toLRC(p, enhanced = true) {
    const head = [p.title ? `[ti:${p.title}]` : '', p.artist ? `[ar:${p.artist}]` : ''].filter(Boolean).join('\n');
    const body = lyr(p).map((c) => {
      if (enhanced && c.words && c.words.some((x) => x != null)) {
        const W = LM.typo.words(c.text).list;
        if (W.length) return `[${lts(c.start)}]` + W.map((w, k) => (c.words[k] != null ? `<${lts(c.words[k])}>` : '') + w.text).join(' ') + ` <${lts(c.end)}>`;
      }
      return `[${lts(c.start)}]${clean(c.text)}`;
    });
    return (head ? head + '\n' : '') + body.join('\n') + '\n';
  }
  function fromLRC(txt) {
    const out = [];
    txt.split(/\r?\n/).forEach((ln) => {
      const m = ln.match(/^\s*((?:\[\d+:\d+(?:[.:]\d+)?\])+)(.*)$/);
      if (!m) return;
      const tt = (x) => { const q = x.match(/(\d+):(\d+)(?:[.:](\d+))?/); return +q[1] * 60 + +q[2] + (q[3] ? +('0.' + q[3]) : 0); };
      const stamps = m[1].match(/\[[^\]]+\]/g).map(tt);
      let raw = m[2];
      let words = null, endT = null;
      if (/<\d+:\d+/.test(raw)) {
        const parts = raw.split(/(<\d+:\d+(?:[.:]\d+)?>)/).filter((x) => x !== '');
        const ws = []; let cur = null, txt2 = '';
        for (const pt of parts) {
          if (pt[0] === '<') { cur = tt(pt); continue; }
          const w = pt.trim(); if (!w) { endT = cur; continue; }
          ws.push({ t: cur, w }); txt2 += (txt2 ? ' ' : '') + w; cur = null;
        }
        if (cur != null) endT = cur;
        raw = txt2; words = ws.map((x) => x.t);
      }
      const text = raw.trim(); if (!text) return;
      stamps.forEach((t) => { const c = { start: t, text }; if (words) { const W = LM.typo.words(text).list; if (W.length === words.length) c.words = words; } if (endT) c._end = endT; out.push(c); });
    });
    out.sort((a, b) => a.start - b.start);
    out.forEach((c, i) => { const nx = out[i + 1] ? out[i + 1].start - 0.05 : c.start + 3; c.end = c._end && c._end > c.start ? Math.min(c._end, nx + 0.05) : nx; delete c._end; });
    return out;
  }
  function fromSRT(txt) {
    const out = [];
    txt.replace(/\r/g, '').split(/\n\n+/).forEach((b) => {
      const m = b.match(/(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)\s*\n([\s\S]*)/);
      if (!m) return;
      const tt = (s) => { const [h, mi, r] = s.replace(',', '.').split(':'); return +h * 3600 + +mi * 60 + +r; };
      out.push({ start: tt(m[1]), end: tt(m[2]), text: m[3].trim().replace(/\n/g, '/') });
    });
    return out;
  }

  return { moveCue, clipWords, SEC, SEC_ORDER, sectionAt, estimateSections, newProject, normalize, normalizeCue, linesFrom, autoTime, validate, repairEnds, stampStart, stampEnd, rippleStart, beatGrid, nearest, quantize, shiftFrom, toSRT, toVTT, toLRC, fromLRC, fromSRT, FR };
})();
