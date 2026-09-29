/* 背景画像・動画を主役にする: pick background motions that leave the picture visible and apply a look
 * that keeps the image readable. Background motions are classified automatically by measuring how much
 * of the frame each one covers (mean alpha over a few sample frames, cached). */
'use strict';
LM.imgFirst = (() => {
  const U = LM.U;
  const cache = {};
  let cv = null, cx = null;
  const PAL = { bg: '#101018', text: '#ffffff', accent: '#ff4477', sub: '#66ccff' };
  // screen / decoration effects that repaint or hide the picture
  const BAD_FX = new Set(['thermal', 'duotone', 'dither', 'posterize', 'halftone', 'monoBeat', 'lineArt', 'invert', 'quadMirror', 'mosaicBeat', 'pixelSort', 'sepia', 'bleach', 'knockout', 'stripes', 'dots', 'paper', 'gridPaper', 'warningTape', 'hueCycle', 'scanlines', 'crt', 'letterbox', 'vhs', 'vignette']);
  // layouts that fill the whole frame with text
  const WALL = new Set(['fullStack', 'tileWall', 'wordwall', 'marquee', 'diamondTunnel', 'metaPoster', 'grid', 'textRings']);
  const DEFAULTS = { particles: 2, bokehDrift: 2, lightSweep: 1.5, lightTrails: 1, floatShapes: 1, fireflies: 1, anamorphic: 1 };
  const LIMIT = 0.22;

  // mean alpha coverage of a background motion (0 = invisible, 1 = paints the whole frame)
  function coverage(id) {
    const B = LM.bgm.lib[id]; if (!B) return 1;
    if (B.full) return 1;
    if (cache[id] != null) return cache[id];
    if (typeof document === 'undefined') return 0.5;
    const W = 128, H = 72;
    if (!cv) { cv = document.createElement('canvas'); cv.width = W; cv.height = H; cx = cv.getContext('2d', { willReadFrequently: true }); }
    let tot = 0; const ts = [1.3, 4.7, 9.1];
    for (const t of ts) {
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; cx.clearRect(0, 0, W, H);
      const R = { W, H, S: Math.min(W, H) / 1080, minD: Math.min(W, H), t, pal: PAL, beat: 0.5, amt: 1, bass: 0.5, mid: 0.5, high: 0.5, spec: null, wave: null, bpm: 120, title: 'TITLE', text: '歌詞 LYRIC' };
      try { LM.bgm.draw(id, cx, R, { amt: 1, speed: 1 }); } catch (e) {}
      const d = cx.getImageData(0, 0, W, H).data; let s = 0, a = 0;
      for (let i = 3; i < d.length; i += 4) { s += d[i]; if (d[i] > 20) a++; }
      tot += Math.max(s / (255 * W * H) * 2.5, a / (W * H) * 0.6);
    }
    // score: the larger of (mean alpha ×2.5) and (share of the frame touched ×0.6)
    return (cache[id] = tot / ts.length);
  }
  const friendly = (id) => !!LM.bgm.lib[id] && coverage(id) < LIMIT;
  // is the project in image-first mode with at least one active picture?
  const active = (p) => !!(p && p.imgFirst && p.imgMode !== 'off' && Array.isArray(p.images) && p.images.some((x) => x && x.on !== false));
  const filterW = (w, ok) => { const o = {}; for (const [k, v] of Object.entries(w || {})) if (ok(k)) o[k] = v; return o; };
  function pool(w) { const o = filterW(w, friendly); return Object.keys(o).length ? o : filterW(DEFAULTS, (k) => !!LM.bgm.lib[k]); }
  // theme copy restricted to image-friendly vocabulary (used by おまかせ)
  function adaptTheme(th) {
    const t = Object.assign({}, th);
    t.bgm = pool(th.bgm);
    const f = filterW(th.filters, (k) => !BAD_FX.has(k)); t.filters = Object.keys(f).length ? f : { glowText: 1, dropShadow: 1 };
    const l = filterW(th.layouts, (k) => !WALL.has(k)); t.layouts = Object.keys(l).length ? l : { center: 1 };
    t.post = (th.post || []).filter((k) => !BAD_FX.has(k));
    return t;
  }
  // settings that keep the picture clearly visible under the lyrics
  function applyLook(p) {
    p.bgmOpacity = 0.5; p.bgmBlend = 'screen'; p.bgmMixSet = true;
    p.imgOpacity = 1; p.imgBlend = 'normal';
    p.imgDim = 0.15; p.imgBlur = 0; p.imgLook = 'natural'; p.imgBgmFull = false;
    p.bgmDim = 0; p.pattern = 'none';
    p.gapOpacity = 0.4; p.gapBlend = 'screen';
    p.filters = (p.filters || []).filter((k) => !BAD_FX.has(k));
    if (!p.filters.includes('dropShadow') && !p.filters.includes('glowText')) p.filters.push('dropShadow');
  }
  // swap covering background motions already placed on phrases for image-friendly ones (same swap per id)
  function fitCues(p) {
    const th = (LM.data.themeById[p.theme] || {}), w = pool(th.bgm), keys = Object.keys(w);
    const swap = {}; let n = 0;
    const pick = (id) => { if (!swap[id]) swap[id] = keys.length ? keys[(U.strHash ? U.strHash(id) : id.length) % keys.length] : null; return swap[id]; };
    const fix = (list) => { const out = []; (list || []).forEach((id) => { if (friendly(id)) { if (!out.includes(id)) out.push(id); } else { n++; const r = pick(id); if (r && !out.includes(r)) out.push(r); } }); return out; };
    (p.cues || []).forEach((c) => { if (c.scene && Array.isArray(c.scene.bgm)) c.scene.bgm = fix(c.scene.bgm); c.filters = (c.filters || []).filter((k) => !BAD_FX.has(k)); if (c.scene && WALL.has(c.scene.layout) && !c.locked) c.scene.layout = 'center'; });
    if (Array.isArray(p.bgm)) p.bgm = fix(p.bgm);
    if (Array.isArray(p.gapBgm)) p.gapBgm = p.gapBgm.filter(friendly);
    return n;
  }
  return { coverage, friendly, active, pool, adaptTheme, applyLook, fitCues, BAD_FX, WALL };
})();
