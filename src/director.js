/* おまかせ演出: genre-theme driven, section-aware, seed-reproducible */
'use strict';
LM.director = (() => {
  const U = LM.U, D = LM.data, M = LM.motion, FX = LM.fx;
  const LONG_OK = ['center', 'poster', 'subtitle', 'editorial', 'stack', 'labels', 'columns', 'split', 'echo', 'mirror', 'spotlight', 'frame', 'ribbon', 'wordwall', 'depth', 'diagonal', 'burst', 'outline', 'ladder', 'stairs', 'vertical'];
  const SHORT_GOOD = { poster: 1.5, grid: 1.6, orbit: 1.5, bigsmall: 1.3, stack: 1.2, outline: 1.2 };
  const INTENSE = new Set(['slam', 'stamp', 'whip', 'glitch', 'zoomOut', 'smear', 'tunnel', 'scatter', 'spin', 'magnet', 'splitJoin', 'wordPop', 'pop', 'bounce', 'scramble', 'crtOn', 'slot']);
  const SLOW_ENTER = new Set(['charMask', 'blurChars', 'pathIn', 'springIn', 'typewriter', 'strokeDraw', 'cascade', 'rainIn', 'domino', 'pendulumChars', 'scramble', 'slot', 'stagger', 'charFlip', 'focusPull', 'spiral']);

  /* ---- motion character: 激しさ (drive) / 動きの付け方 (feel) / 変化の多さ (variety) ---- */
  const CAT = {
    '基本': [0.15, 'smooth cinema'], 'はずむ': [0.6, 'bounce'], '文字送り': [0.35, 'kinetic smooth'], 'スライド': [0.5, 'snap smooth'], 'デジタル': [0.82, 'glitch'],
    'ズーム': [0.6, 'snap cinema'], 'マスク': [0.3, 'smooth cinema'], '回転': [0.55, 'bounce organic'], '3D': [0.5, 'cinema smooth'], '重力': [0.55, 'bounce'],
    'ぼかし': [0.18, 'cinema smooth'], '集合': [0.65, 'snap kinetic'], '手作り': [0.4, 'organic'], 'フロー': [0.4, 'organic smooth'], '単語打ち': [0.6, 'kinetic snap'],
    'エッジ': [0.88, 'glitch snap'], 'ゆらぎ': [0.3, 'organic smooth'], 'エネルギー': [0.72, 'snap bounce'], '歌詞': [0.3, 'kinetic'], '3D配置': [0.55, 'kinetic cinema'], '飛散': [0.78, 'snap'], 'ウェイト': [0.3, 'cinema smooth kinetic'], 'ボカロ': [0.82, 'glitch snap kinetic'], 'パス': [0.45, 'organic smooth kinetic'],
  };
  const OVR = {
    enter: { weightPunch: [0.78, 'snap kinetic'], springIn: [0.6, 'bounce'], charMask: [0.35, 'cinema smooth kinetic'], wordMask: [0.4, 'cinema kinetic'], none: [0, 'snap'], fade: [0.08, 'smooth cinema'], rise: [0.2, 'smooth'], whip: [0.8, 'snap'], smear: [0.75, 'snap'], slam: [0.92, 'snap'], stamp: [0.88, 'snap'], zoomRush: [0.85, 'snap'], tracking: [0.3, 'cinema smooth'], kernIn: [0.3, 'cinema'], focusPull: [0.15, 'cinema'], typewriter: [0.3, 'kinetic'], glitch: [0.9, 'glitch'], glitchSlice: [0.9, 'glitch'], glitchZoom: [0.92, 'glitch snap'], scramble: [0.7, 'glitch kinetic'], wordGlitch: [0.82, 'glitch kinetic'], tunnel: [0.8, 'snap'], spin: [0.75, 'snap bounce'], stutterIn: [0.9, 'glitch snap'], strokeDraw: [0.3, 'organic'], stopMotion: [0.5, 'organic'] },
    hold: { weightBeat: [0.7, 'snap kinetic'], weightWave: [0.35, 'organic smooth'], none: [0.05, 'smooth cinema snap'], drift: [0.1, 'cinema smooth'], zoomSlow: [0.15, 'cinema'], breathe: [0.2, 'smooth'], jitter: [0.8, 'glitch'], glitchHold: [0.9, 'glitch'], flicker: [0.75, 'glitch'], quake: [0.92, 'snap'], beatPump: [0.72, 'snap'], heartbeat: [0.65, 'bounce'], bounceLoop: [0.7, 'bounce'], jelly: [0.5, 'bounce organic'], pulse: [0.55, 'snap bounce'], spinLetters: [0.8, 'snap'], marchStep: [0.6, 'bounce kinetic'], karaoke: [0.3, 'kinetic'], wordHighlight: [0.35, 'kinetic'] },
    exit: { cut: [0.4, 'snap kinetic'], fadeOut: [0.08, 'smooth cinema'], blurOut: [0.15, 'cinema'], glitchOut: [0.85, 'glitch'], tvOff: [0.7, 'glitch'], scrambleOut: [0.7, 'glitch kinetic'], explodeOut: [0.8, 'snap'], shatter: [0.8, 'snap'], rushOut: [0.75, 'snap'], zoomThrough: [0.7, 'snap cinema'], popOut: [0.55, 'bounce'], jumpOut: [0.6, 'bounce'], riseOut: [0.2, 'smooth'] },
    cam: { still: [0.05, 'smooth cinema kinetic'], drift: [0.25, 'cinema smooth organic'], push: [0.45, 'cinema snap'], pull: [0.45, 'cinema smooth'], tilt: [0.35, 'organic'], shake: [0.85, 'snap glitch'], punch: [0.9, 'snap bounce'] },
  };
  const TRM = [[0.8, 'glitch', 'glitchCut rgbCut pixelCut pixelSortCut sliceCut thermalCut invertCut meltCut'], [0.75, 'snap', 'whipLeft whipRight whipUp whipDown zoomThrough zoomOutIn shakeCut collageSlam shards spin zoomTwist flashWhite'],
    [0.6, 'bounce', 'gridPop colorBlocks hexFlip tileScatter splashFill colorBurst zigzag'], [0.3, 'cinema', 'blurCut dolly filmBurnCut leakBurn flashAccent iris prismFlash filmRoll roll'],
    [0.4, 'smooth', 'liquid ink gradientDiscs ribbonSweep doorsH fan barsH stripesDiag diamond splitClose'], [0.45, 'organic', 'inkBlob scribbleFill dryBrush tornPaper liquidDrip sliceBands'], [0.55, 'kinetic', 'colorBlocks barsH gridPop sliceBands']];
  const TR_META = {}; TRM.forEach(([e, f, ids]) => ids.split(' ').forEach((id) => { const m = TR_META[id] || (TR_META[id] = [e, []]); m[1].push(f); m[0] = Math.max(m[0], e); }));
  const NO_EXTEND = { enter: new Set(['none']), hold: new Set(['carousel', 'helix', 'sphere', 'crawl3D', 'karaoke', 'wordHighlight', 'weightSing']), exit: new Set(['cut']), cam: new Set(), tr: new Set() };
  // emphasis vocabulary per theme (weights); '_' is the fallback
  const EMPH_POOL = {
    _: { pulse: 2, scalePunch: 1.5, colorFlash: 1, weightHit: 1 },
    jpop: { bounce: 2, elasticHit: 1.5, scalePunch: 1.5, colorFlash: 1 }, rock: { impact: 2, shake: 1.5, scalePunch: 1.5 }, metal: { impact: 2, shake: 2, rgbHit: 1 },
    edm: { scalePunch: 2, colorFlash: 1.5, rgbHit: 1, pulse: 1 }, hiphop: { impact: 2, trackCompress: 1.2, weightHit: 1.2, shake: 1 }, ballad: { pulse: 2, blurPulse: 1.5, weightHit: 1 },
    lofi: { pulse: 2, waveHit: 1.5, blurPulse: 1 }, citypop: { colorFlash: 1.5, pulse: 1.5, tiltHit: 1 }, vocaloid: { rgbHit: 2, jitterHit: 1.5, colorFlash: 1.5, scalePunch: 1 },
    anison: { scalePunch: 2, elasticHit: 1.5, impact: 1.2 }, cinematic: { blurPulse: 2, pulse: 1.5, trackExpand: 1.5 }, wa: { weightHit: 2, pulse: 1.5 },
    acoustic: { pulse: 2, waveHit: 1.5 }, ambient: { blurPulse: 2, pulse: 1.5 }, minimal: { weightHit: 2, trackExpand: 1.5, trackCompress: 1.5 }, dream: { blurPulse: 2, waveHit: 1.5 },
    edge: { impact: 1.5, rgbHit: 1.5, trackExpand: 1.2, scalePunch: 1 }, psyche: { rgbHit: 1.5, waveHit: 1.5, elasticHit: 1 }, thermalvj: { rgbHit: 2, impact: 1 }, vj: { scalePunch: 1.5, rgbHit: 1.5, colorFlash: 1 },
    showreel: { trackExpand: 1.5, scalePunch: 1.5, tiltHit: 1 }, artistmv: { pulse: 1.5, weightHit: 1.5, blurPulse: 1 },
  };
  const CALM = new Set(['ballad', 'ambient', 'acoustic', 'minimal', 'cinematic', 'wa', 'dream', 'lofi']);
  function meta(kind, id) {
    if (kind === 'tr') { const m = TR_META[id]; return m ? { e: m[0], f: m[1] } : { e: 0.5, f: [] }; }
    const o = OVR[kind] && OVR[kind][id];
    if (o) return { e: o[0], f: o[1].split(' ') };
    const lib = kind === 'cam' ? null : M[kind], c = lib && lib[id] && lib[id].c, d = CAT[c] || [0.45, ''];
    return { e: d[0], f: d[1].split(' ').filter(Boolean) };
  }
  const libOf = (kind) => (kind === 'tr' ? LM.trans.lib : kind === 'cam' ? OVR.cam : M[kind]);
  // theme default drive: derived from the theme's motion amplitude
  const themeDrive = (th) => U.clamp(((th && th.amp) || 1) - 0.6, 0, 0.8) / 0.8;
  function styleOf(p) {
    const drive = p.drive == null ? null : U.clamp(+p.drive, 0, 1), feel = p.feel && p.feel !== 'auto' ? p.feel : null, variety = p.variety == null ? null : U.clamp(+p.variety, 0, 1);
    return { drive, feel, variety, on: drive != null || !!feel };
  }
  // reshape a theme pool toward the requested drive / feel; borrows matching entries from the whole library
  function tune(pool, kind, st, target) {
    if (!pool || !st.on) return pool;
    const out = Object.assign({}, pool), vals = Object.values(pool), mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length) || 1;
    const lib = libOf(kind) || {};
    for (const id of Object.keys(lib)) {
      if (out[id] != null || NO_EXTEND[kind].has(id)) continue;
      const m = meta(kind, id);
      if ((st.feel && m.f.includes(st.feel)) || (!st.feel && target != null && Math.abs(m.e - target) < 0.14)) out[id] = mean * (st.feel ? 0.45 : 0.25);
    }
    for (const id of Object.keys(out)) {
      const m = meta(kind, id);
      let w = out[id];
      if (target != null) w *= 0.02 + Math.exp(-((m.e - target) ** 2) / (2 * 0.18 * 0.18));
      if (st.feel) w *= m.f.includes(st.feel) ? 4 : 0.2;
      out[id] = w;
    }
    return out;
  }
  // amplitude / speed follow the drive slider (relative to the theme's own default)
  function applyDrive(p) {
    const th = D.themeById[p.theme]; if (!th) return;
    const d0 = themeDrive(th), d = p.drive == null ? d0 : p.drive;
    p.intensity = Math.round(U.clamp((th.amp || 1) * (1 + (d - d0) * 0.9), 0.35, 2) * 100) / 100;
    p.speed = Math.round(U.clamp((th.speed || 1) * (1 + (d - d0) * 0.3), 0.6, 1.6) * 100) / 100;
  }

  function applyTheme(p, themeId) {
    const th = D.themeById[themeId]; if (!th) return;
    p.theme = themeId;
    p.palette = th.pals[0];
    p.bg = Object.assign({}, p.bg || {}, { type: th.bg[0] });
    p.filters = th.post.slice();
    p.speed = th.speed;
    p.keyColor = th.keyColor;
    p.beatSync = th.beat;
    p.font = null;
    p.intensity = th.amp || 1;
    p.autoBgm = true; p.bgm = [];
    if (p.drive != null) applyDrive(p);
  }

  // generate scene/motion/filters for cues. returns new cue array (does not mutate)
  function generate(p, opts = {}) {
    const th0 = D.themeById[p.theme] || D.themes[0];
    // 背景画像・動画が主役: only vocabulary that keeps the picture visible
    const th = LM.imgFirst && LM.imgFirst.active(p) ? LM.imgFirst.adaptTheme(th0) : th0;
    const seed = (opts.seed ?? p.seed ?? 1) >>> 0;
    const rng = U.rng(seed * 7919 + 17);
    const ST = styleOf(p), V = ST.variety;
    const keepP = (base) => (V == null ? base : U.clamp(base + 0.3 - V * 0.6, 0.15, 0.95)); // probability of staying on the section's main choice
    const dMul = ST.drive == null ? 1 : 0.35 + ST.drive * 1.3;
    const an = LM.audio.analysis;
    const cues = p.cues.map((c) => JSON.parse(JSON.stringify(c)));
    const n = cues.length;
    if (!n) return cues;
    // energy per cue (0..1 ranked)
    const en = cues.map((c) => LM.audio.energyAt(c.start, c.end));
    const sorted = en.slice().sort((a, b) => a - b);
    const rank = en.map((e) => (n > 1 ? sorted.indexOf(e) / (n - 1) : 0.5));
    const energy = an ? rank : cues.map((c, i) => 0.35 + 0.3 * Math.sin((i / Math.max(1, n - 1)) * Math.PI * 2.2 - 0.6) + 0.1);
    // song-structure markers (user or estimated): pull energy toward each section's role
    const SM = LM.model.SEC, marks = (p.sections || []).filter((x) => SM[x.type]);
    const secOf = cues.map((c) => { let m = null; for (const x of marks) if (x.t <= c.start + 0.15) m = x; return m; });
    if (marks.length) secOf.forEach((m, i) => { if (m) energy[i] = energy[i] * 0.35 + SM[m.type].e * 0.65; });
    // sections: follow markers when present; otherwise split on energy jumps / length / long gaps
    const sections = [];
    let cur = [];
    cues.forEach((c, i) => {
      const prev = cues[i - 1];
      let brk;
      if (marks.length) brk = cur.length && (secOf[i] !== secOf[i - 1] || cur.length >= (secOf[i] && secOf[i].type === 'chorus' ? 8 : 6));
      else {
        const jump = i > 0 && Math.abs(energy[i] - energy[i - 1]) > 0.35;
        const gap = prev && c.start - prev.end > 2.5;
        brk = cur.length && (cur.length >= 4 + (rng() < 0.4 ? 1 : 0) || jump || gap);
      }
      if (brk) { sections.push(cur); cur = []; }
      cur.push(i);
    });
    if (cur.length) sections.push(cur);
    // repeated choruses share their look (same seed stream per section type)
    const typeLook = {};
    const pals = th.pals.filter((id) => D.palById[id]);
    const series = p.series && D.palCats[p.series] ? D.palettes.filter((x) => x.cat === p.series).map((x) => x.id) : null;
    const palPool = series && series.length ? series : pals;
    let prevLayout = null, prevPrimary = null, prevBgm = null;
    sections.forEach((sec, si) => {
      const secE = sec.reduce((a, i) => a + energy[i], 0) / sec.length;
      const stype = secOf[sec[0]] && secOf[sec[0]].type;
      const isChorus = stype === 'chorus';
      const remembered = stype && typeLook[stype];
      const primary = remembered ? remembered.primary : rng.weighted(th.layouts, prevPrimary ? [prevPrimary] : null);
      prevPrimary = primary;
      // the section's own intensity rides on top of the chosen drive (verse calmer, chorus harder)
      const tgt = ST.drive == null ? null : U.clamp(ST.drive + (secE - 0.5) * 0.35, 0, 1);
      const pools = { enter: tune(th.enter, 'enter', ST, tgt), hold: tune(th.hold, 'hold', ST, tgt), exit: tune(th.exit, 'exit', ST, tgt) };
      const boost = (pool) => {
        const o = {};
        for (const [k, w] of Object.entries(pool)) o[k] = w * (INTENSE.has(k) ? 0.6 + secE * 1.2 : 1);
        return o;
      };
      const ePrim = remembered ? remembered.e : rng.weighted(boost(pools.enter));
      const hPrim = remembered ? remembered.h : rng.weighted(pools.hold);
      const xPrim = remembered ? remembered.x : rng.weighted(pools.exit);
      const emPool = EMPH_POOL[th.id] || EMPH_POOL._;
      const mPrim = remembered && remembered.m ? remembered.m : rng.weighted(emPool);
      const palId = remembered ? remembered.pal : palPool[(si + (seed % palPool.length)) % palPool.length];
      const cam = rng.weighted(tune(th.camera, 'cam', ST, tgt));
      const trPool = th.tr ? tune(th.tr, 'tr', ST, tgt) : null;
      // background motion for this section (tone-matched, 0-2 layers)
      let secBgm = [];
      if (th.bgm && rng() < 0.85) {
        const a = rng.weighted(th.bgm, prevBgm);
        secBgm.push(a);
        if (secE > 0.6 && rng() < 0.35) { const b2 = rng.weighted(th.bgm, [a]); const B = LM.bgm.lib; if (b2 !== a && !(B[a] && B[a].full && B[b2] && B[b2].full)) secBgm.push(b2); }
      }
      if (remembered) secBgm = remembered.bgm.slice();
      else if (isChorus && th.bgm && secBgm.length < 2) { const b3 = rng.weighted(th.bgm, secBgm); const B = LM.bgm.lib; if (b3 && !secBgm.includes(b3) && !(secBgm[0] && B[secBgm[0]] && B[secBgm[0]].full && B[b3] && B[b3].full)) secBgm.push(b3); }
      prevBgm = secBgm.slice();
      const secFont = remembered ? remembered.font : th.fonts[(isChorus || secE > 0.72) && th.fonts.length > 1 && rng() < (isChorus ? 0.6 : 0.35) ? 1 : 0];
      const invertSec = remembered ? remembered.inv : secE > 0.7 && rng() < (isChorus ? 0.45 : 0.3);
      if (stype && !remembered) typeLook[stype] = { primary, e: ePrim, h: hPrim, x: xPrim, m: mPrim, bgm: secBgm.slice(), font: secFont, inv: invertSec, pal: palId };
      sec.forEach((ci, k) => {
        const c = cues[ci];
        if ((c.locked || c.kind === 'title') && !opts.force) return;
        const cnt = Math.round(LM.typo.parse(c.text).units);
        const dur = c.end - c.start;
        // layout
        let lw = Object.assign({}, th.layouts);
        // mostly-Latin (or Hangul) lines read badly set vertically — keep 縦組み for Japanese
        const PP = LM.typo.parse(c.text); let nJ = 0, nL = 0; PP.segments.forEach((sg) => sg.forEach((tk) => tk.gs.forEach((g) => { if (g.cls === 'J' || g.cls === 'JP') nJ++; else if (g.cls === 'L' || g.cls === 'K') nL += g.cls === 'K' ? 1 : 0.5; })));
        const latHeavy = nL > nJ;
        if (latHeavy) lw.vertical = 0;
        if (ST.feel === 'kinetic') { lw.wordFlash = (lw.wordFlash || 0.4) * 3; lw.cameraTrack = (lw.cameraTrack || 0.4) * 3; }
        if (cnt > 22) for (const key of Object.keys(lw)) if (!LONG_OK.includes(key)) lw[key] *= 0.05;
        if (cnt <= 5) for (const [key, m] of Object.entries(SHORT_GOOD)) if (lw[key]) lw[key] *= m;
        let lay = rng() < keepP(0.62) && (cnt <= 22 || LONG_OK.includes(primary)) ? primary : rng.weighted(lw, prevLayout ? [prevLayout] : null);
        const KIN = ['wordFlash', 'cameraTrack'];
        const kinOK = cnt >= 5 && cnt <= 40 && dur >= 1.6;
        if (!kinOK) { KIN.forEach((k2) => (lw[k2] = 0)); }
        if (cnt > 14) lw.bigCrop = 0;
        if ((KIN.includes(lay) && !kinOK) || (lay === 'bigCrop' && cnt > 14) || !lw[lay] && lw[lay] === 0) lay = rng.weighted(lw, prevLayout ? [prevLayout] : null);
        if (lay === prevLayout && rng() < 0.5) lay = rng.weighted(lw, [prevLayout]);
        if (latHeavy && lay === 'vertical') lay = rng.weighted(lw, ['vertical']);
        prevLayout = lay;
        const isKin = KIN.includes(lay);
        // motion tracks
        // motion language: ~70% the section's motif, ~20% a variation of it, ~10% an accent / surprise
        const motifP = keepP(0.7), varP = Math.min(0.97, motifP + 0.2);
        let ent, mpE = null; const rE0 = rng();
        if (rE0 < motifP) ent = ePrim;
        else if (rE0 < varP) { ent = ePrim; mpE = { v: 35 + Math.round(rng() * 40), i: Math.round(U.clamp(50 + (rng() - 0.5) * 40, 0, 100)) }; }
        else { ent = rng.weighted(boost(pools.enter), [ePrim]) || ePrim; mpE = { i: 60 + Math.round(rng() * 25) }; }
        if (dur < 1.3 && SLOW_ENTER.has(ent)) ent = rng.pick(['fade', 'pop', 'slam', 'rise', 'mask'].filter((x) => M.enter[x]));
        if (cnt > 26 && M.enter[ent].per) ent = 'fade';
        let hol = rng() < keepP(0.7) ? hPrim : rng.weighted(pools.hold);
        let ext, mpX = null; const rX0 = rng();
        if (rX0 < motifP) ext = xPrim;
        else if (rX0 < varP) { ext = xPrim; mpX = { v: 30 + Math.round(rng() * 40) }; }
        else ext = rng.weighted(pools.exit, [xPrim]) || xPrim;
        const next = cues[ci + 1];
        if (next && next.start - c.end < 0.05 && dur < 1.2 && M.exit[ext].d > 0.4) ext = rng() < 0.5 ? 'cut' : 'fadeOut';
        if (M.enter[ent] && M.enter[ent].wt && (dur < 1.2 || cnt > 30)) ent = 'pop';
        if (M.hold[hol] && M.hold[hol].c === '3D配置' && (cnt > 18 || isKin)) hol = 'none';
        if (isKin) { ent = 'none'; hol = rng() < 0.5 ? 'none' : 'pulse'; ext = 'cut'; }
        c.enter = M.enter[ent] ? ent : 'fade';
        c.hold = M.hold[hol] ? hol : 'none';
        c.exit = M.exit[ext] ? ext : 'fadeOut';
        if (c.enter === 'morphFrom' && ci === 0) c.enter = 'fade';
        // emphasis accents (beat / word onsets), with the section's motif most of the time
        let em = 'none', mpM = null;
        if (M.emph && !isKin && dur >= 1.2) {
          const calm = CALM.has(th.id), prob = (0.2 + energy[ci] * 0.45) * dMul * (calm ? 0.6 : 1);
          if (rng() < prob) {
            em = rng() < 0.75 ? mPrim : rng.weighted(emPool, [mPrim]) || mPrim;
            const hasEm = /\*[^*]+\*/.test(c.text || '');
            mpM = hasEm ? { trig: 'beat', tgt: 'emph', i: 55 } : calm ? { trig: rng() < 0.5 ? 'word' : 'phrase', tgt: rng() < 0.5 ? 'word' : 'all', i: 40 } : energy[ci] > 0.65 ? { trig: rng() < 0.7 ? 'beat' : 'two', tgt: 'all', i: 40 + Math.round(energy[ci] * 25) } : { trig: 'word', tgt: 'word', i: 45 };
          }
        }
        if (M.emph && M.emph[em] && em !== 'none') c.emph = em; else delete c.emph;
        { const mp = {}; if (mpE) mp.e = mpE; if (mpX) mp.x = mpX; if (em !== 'none' && mpM) mp.m = mpM; const sd = c.mp && c.mp.seed; if (sd) mp.seed = sd; if (Object.keys(mp).length) c.mp = mp; else delete c.mp; }
        // designed cut into this phrase
        if (p.autoTrans !== false) {
          const rate = Math.min(0.9, (th.trRate == null ? 0.25 : th.trRate) * dMul);
          const hit = ci > 0 && th.tr && (k === 0 ? (marks.length && secOf[ci] !== secOf[ci - 1] ? true : rng() < Math.min(1, rate + 0.35)) : rng() < rate * (0.55 + energy[ci] * 0.6));
          c.trans = hit ? rng.weighted(trPool) : 'none';
        }
        // accent graphics landing with the lyric
        if (p.autoGfx !== false) c.gfx = th.gx && !isKin && rng() < (th.gxRate || 0) * dMul * (0.45 + energy[ci]) ? [rng.weighted(th.gx)] : [];
        delete c.motion;
        const prevScene = c.scene || {};
        c.scene = {
          layout: LM.layout.lib[lay] ? lay : 'center',
          decoration: 'none',
          camera: cam,
          font: secFont,
          invert: invertSec && k % 2 === 1,
          variant: rng.int(1000000),
          pal: p.autoColors ? palId : prevScene.pal,
          bgm: p.autoBgm ? secBgm.filter((id) => LM.bgm.lib[id]) : prevScene.bgm,
        };
        const fh = M.enter[c.enter] && M.enter[c.enter].font;
        if (fh && fh.length) { const f2 = latHeavy ? (fh.includes('caveat') ? 'caveat' : fh[0]) : fh.find((id) => id !== 'caveat') || fh[0]; if (D.fontById[f2]) c.scene.font = f2; }
        // filters
        if (p.autoFilters) {
          const prob = th.fx * (ST.drive == null ? 1 : 0.5 + ST.drive) * (0.55 + energy[ci] * 0.7);
          const fs = [];
          if (rng() < prob) {
            fs.push(rng.weighted(th.filters));
            if (th.maxFx > 1 && rng() < 0.3 + energy[ci] * 0.25) {
              const f2 = rng.weighted(th.filters, fs);
              if (!fs.includes(f2)) fs.push(f2);
            }
          }
          const KO_OK = ['poster', 'bigCrop', 'wordFlash', 'center', 'stack', 'bigsmall', 'outline', 'cameraTrack'];
          c.filters = fs.filter((f) => FX.list[f] && !(f === 'knockout' && (!KO_OK.includes(c.scene.layout) || !(c.scene.bgm && c.scene.bgm.length) || cnt > 16)));
        }
      });
    });
    return cues;
  }

  function rerollOne(p, i, seed) {
    const tmp = Object.assign({}, p, { cues: p.cues.map((c, k) => (k === i ? Object.assign({}, c, { locked: false }) : Object.assign({}, c, { locked: true }))) });
    const out = generate(tmp, { seed });
    return out[i];
  }

  return { generate, applyTheme, rerollOne, applyDrive, themeDrive, meta, FEELS: ['auto', 'smooth', 'bounce', 'snap', 'glitch', 'cinema', 'organic', 'kinetic'] };
})();
