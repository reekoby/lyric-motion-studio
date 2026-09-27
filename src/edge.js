/* Edge pack: transitions (torn paper, slice bands, pixel-sort / liquid / thermal cuts),
 * op-art & typographic backgrounds, palettes and three new themes */
'use strict';
(() => {
  const { clamp, lerp, hash, rgba, mix } = LM.U;
  const E = LM.E, PI = Math.PI, TAU = PI * 2;
  const TR = LM.trans.lib, BG = LM.bgm.lib, D = LM.data;
  const inOut = (u) => (u < 0.5 ? E.inOutCubic(u * 2) : 1 - E.inOutCubic((u - 0.5) * 2));
  const wrap = (v, m) => ((v % m) + m) % m;

  /* ---------------- transitions ---------------- */
  // torn paper: a sheet with a ragged edge rips across, shadowed, then tears away the other side
  TR.tornPaper = { n: '紙を破る（ギザギザの紙が横切る）', c: 'カバー', kind: 'cover', f(ctx, u, R) {
    const W = R.W, H = R.H, a = E.inOutCubic(clamp(u * 2)), b = E.inOutCubic(clamp((u - 0.5) * 2));
    const lead = lerp(-0.25, 1.15, a) * W, trail = lerp(-0.25, 1.15, b) * W;
    if (lead <= trail) return;
    const edge = (x0, seed) => { const pts = []; const n = 34; for (let i = 0; i <= n; i++) { const y = (i / n) * H; pts.push([x0 + (hash(i, seed) - 0.5) * W * 0.05 + Math.sin(i * 0.9 + seed) * W * 0.012 + (y / H - 0.5) * W * 0.12, y]); } return pts; };
    const L = edge(lead, 3), T = edge(trail, 11);
    const paper = mix(R.pal.bg === '#000000' ? '#f1ebe0' : R.pal.accent, '#ffffff', 0.05);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = R.minD * 0.03; ctx.shadowOffsetX = R.minD * 0.008;
    ctx.beginPath(); T.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); for (let i = L.length - 1; i >= 0; i--) ctx.lineTo(L[i][0], L[i][1]); ctx.closePath();
    ctx.fillStyle = paper; ctx.fill(); ctx.restore();
    // fibrous white rim on the leading tear + black scribbles on the sheet
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = R.minD * 0.008; ctx.beginPath(); L.forEach(([x, y], i) => (i ? ctx.lineTo(x - R.minD * 0.004, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = R.pal.text; ctx.lineWidth = R.minD * 0.006; ctx.lineCap = 'round'; ctx.globalAlpha = 0.8;
    for (let i = 0; i < 4; i++) { const cx = (lead + trail) / 2 + (hash(i, 5) - 0.5) * (lead - trail) * 0.6, cy = H * (0.2 + hash(i, 6) * 0.6), s = R.minD * 0.03; ctx.beginPath(); ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s); ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s); ctx.stroke(); }
    ctx.restore();
  } };
  // slice bands: horizontal strips race in from alternate sides, then leave the other way
  TR.sliceBands = { n: 'スライス帯（交互に切り裂く）', c: 'カバー', kind: 'cover', f(ctx, u, R) {
    const n = 9, h = R.H / n;
    for (let i = 0; i < n; i++) {
      const d = ((i * 5) % n) * 0.018, a = E.inOutExpo ? E.inOutExpo(clamp((u - d) * 2.4)) : E.inOutCubic(clamp((u - d) * 2.4)), b = E.inOutCubic(clamp((u - 0.5 - d) * 2.4));
      const dir = i % 2 ? 1 : -1, x0 = dir > 0 ? b * R.W : R.W - a * R.W, x1 = dir > 0 ? a * R.W : R.W - b * R.W;
      ctx.fillStyle = i % 2 ? R.pal.accent : R.pal.text; ctx.fillRect(Math.min(x0, x1), i * h, Math.abs(x1 - x0), h + 1);
    }
  } };
  TR.pixelSortCut = { n: 'ピクセルソートカット（横に流れて切替）', c: 'カメラ', kind: 'cam', f: (u) => { const k = inOut(u); return { psort: k * 1.8, rgb: k * 6, tx: (u < 0.5 ? -1 : 1) * k * 0.02 }; } };
  TR.sliceCut = { n: 'スライスカット（横ずれで切替）', c: 'カメラ', kind: 'cam', f: (u) => { const k = inOut(u); return { slice: k * 2.2, flash: k > 0.95 ? 0.3 : 0 }; } };
  TR.meltCut = { n: 'メルト（溶けて切替）', c: 'カメラ', kind: 'cam', f: (u) => { const k = inOut(u); return { liquid: k * 3, blur: k * 0.6, sc: 1 + k * 0.05 }; } };
  TR.thermalCut = { n: 'サーマルフラッシュ', c: 'カメラ', kind: 'cam', f: (u) => { const k = inOut(u); return { thermal: Math.min(1, k * 1.6), zblur: k * 1.4, sc: 1 + k * 0.08 }; } };

  /* ---------------- backgrounds ---------------- */
  const def = (id, n, c, f, full) => (BG[id] = { n, c, f, full: !!full });
  // bold concentric rings from two drifting centres → strong moiré (op art)
  def('opRings', 'オプアート：同心円モアレ', '模様', (ctx, R) => {
    const D = Math.hypot(R.W, R.H), w = R.minD * 0.028 * (1 + R.beat * 0.1);
    ctx.fillStyle = R.pal.bg; ctx.fillRect(0, 0, R.W, R.H);
    ctx.fillStyle = mix(R.pal.accent, R.pal.bg, 0.45);
    for (let k = 0; k < 2; k++) {
      const cx = R.W / 2 + Math.cos(R.t * 0.35 + k * PI) * R.minD * 0.14, cy = R.H / 2 + Math.sin(R.t * 0.27 + k * PI) * R.minD * 0.1;
      ctx.globalAlpha = (k ? 0.35 : 0.6) * Math.min(1, R.amt); ctx.beginPath();
      for (let r = wrap(R.t * R.S * 30, w * 2); r < D; r += w * 2) { ctx.moveTo(cx + r + w, cy); ctx.arc(cx, cy, r + w, 0, TAU); ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU, true); }
      ctx.fill('evenodd');
    }
  }, true);
  def('opRays', 'オプアート：回転ストライプ放射', '模様', (ctx, R) => {
    const D = Math.hypot(R.W, R.H), n = 48;
    ctx.fillStyle = R.pal.bg; ctx.fillRect(0, 0, R.W, R.H);
    for (let k = 0; k < 2; k++) {
      const cx = R.W / 2 + (k ? R.minD * 0.08 * Math.sin(R.t * 0.4) : 0), cy = R.H / 2;
      ctx.fillStyle = k ? R.pal.sub : mix(R.pal.accent, R.pal.bg, 0.35); ctx.globalAlpha = (k ? 0.3 : 0.6) * Math.min(1, R.amt);
      const rot = R.t * (k ? -0.07 : 0.05);
      ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; ctx.moveTo(cx, cy); ctx.arc(cx, cy, D, a, a + PI / n); ctx.closePath(); } ctx.fill();
    }
  }, true);
  def('opWaves', 'オプアート：うねる太縞', '模様', (ctx, R) => {
    const n = 16, h = R.H / n;
    ctx.fillStyle = R.pal.bg; ctx.fillRect(0, 0, R.W, R.H); ctx.fillStyle = mix(R.pal.accent, R.pal.bg, 0.4); ctx.globalAlpha = 0.75 * Math.min(1, R.amt);
    for (let i = -1; i < n + 1; i += 2) {
      ctx.beginPath();
      for (let x = 0; x <= R.W; x += R.W / 60) ctx.lineTo(x, i * h + Math.sin(x / R.W * 7 + R.t * 1.6 + i * 0.25) * h * 0.9 + Math.sin(x / R.W * 13 - R.t) * h * 0.2);
      for (let x = R.W; x >= 0; x -= R.W / 60) ctx.lineTo(x, (i + 1) * h + Math.sin(x / R.W * 7 + R.t * 1.6 + (i + 1) * 0.25) * h * 0.9 + Math.sin(x / R.W * 13 - R.t) * h * 0.2);
      ctx.closePath(); ctx.fill();
    }
  }, true);
  def('polkaPulse', 'ポルカドット（中心から脈動）', '模様', (ctx, R) => {
    const s = R.minD / 11, cx = R.W / 2, cy = R.H / 2;
    ctx.fillStyle = R.pal.bg; ctx.fillRect(0, 0, R.W, R.H); ctx.fillStyle = mix(R.pal.accent, R.pal.bg, 0.4); ctx.globalAlpha = 0.8 * Math.min(1, R.amt);
    for (let y = -s + wrap(R.t * R.S * 12, s); y < R.H + s; y += s) for (let x = -s + (Math.round(y / s) % 2) * s * 0.5; x < R.W + s; x += s) {
      const d = Math.hypot(x - cx, y - cy) / R.minD, r = s * (0.18 + 0.2 * (0.5 + 0.5 * Math.sin(d * 9 - R.t * 3))) * (1 + R.beat * 0.25);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }, true);
  def('halftoneFlow', 'ハーフトーン・グラデーション流れ', '模様', (ctx, R) => {
    const s = R.minD / 34;
    ctx.fillStyle = R.pal.bg; ctx.fillRect(0, 0, R.W, R.H); ctx.fillStyle = mix(R.pal.text, R.pal.bg, 0.35); ctx.globalAlpha = 0.7 * Math.min(1, R.amt);
    for (let y = 0; y < R.H + s; y += s) for (let x = 0; x < R.W + s; x += s) {
      const v = 0.5 + 0.5 * Math.sin(x / R.W * 3.2 + R.t * 0.8) * Math.cos(y / R.H * 2.4 - R.t * 0.6);
      const r = s * 0.5 * Math.pow(v, 1.4); if (r < 0.5) continue;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }, true);
  def('typoMarquee', 'タイポ・マーキー（巨大文字が流れる）', '模様', (ctx, R) => {
    const txt = (R.text || R.title || 'LYRIC MOTION').replace(/\s+/g, ' ').trim() || 'LYRIC';
    const rows = 4, h = R.H / rows;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineWidth = Math.max(1, h * 0.012);
    for (let i = 0; i < rows; i++) {
      ctx.font = `900 ${(h * 0.82).toFixed(1)}px "Anton","Archivo Black","Noto Sans JP",sans-serif`;
      const unit = txt + ' — ', uw = Math.max(1, ctx.measureText(unit).width), off = wrap(R.t * R.S * (60 + i * 25) * (i % 2 ? 1 : -1), uw);
      ctx.globalAlpha = i % 2 ? 0.14 : 0.22;
      for (let x = -off; x < R.W; x += uw) { if (i % 2) { ctx.strokeStyle = R.pal.text; ctx.strokeText(unit, x, h * (i + 0.5)); } else { ctx.fillStyle = R.pal.accent; ctx.fillText(unit, x, h * (i + 0.5)); } }
    }
  });
  def('riso', 'リソグラフの粒子と版ずれ', '質感', (ctx, R) => {
    const n = Math.round(1600 * R.amt), step = Math.floor(R.t * 12);
    for (let i = 0; i < n; i++) { ctx.fillStyle = i % 3 ? R.pal.text : R.pal.accent; ctx.globalAlpha = 0.2 + hash(i, 2) * 0.3; ctx.fillRect(hash(i, 1, step) * R.W, hash(i, 3, step) * R.H, R.S * (1 + hash(i, 4) * 2), R.S * (1 + hash(i, 5) * 2)); }
    ctx.globalAlpha = 0.12; ctx.fillStyle = R.pal.sub; ctx.fillRect(R.W * 0.03 * Math.sin(R.t * 0.7), 0, R.W, R.H * 0.012);
  });

  /* ---------------- palettes ---------------- */
  const P = (id, n, c) => ({ id, n, cat: 'edge', c });
  const NP = [
    P('brutal', 'ブルータル', ['#0e0e0e', '#f2f2f2', '#ff2a1f', '#d9ff3f']),
    P('grunge', 'グランジ・オレンジ', ['#141414', '#f4ede2', '#ff5a1f', '#3a3a3a']),
    P('psyche', 'サイケ・リソ', ['#ff5a3c', '#ffe14d', '#b36bff', '#1fa3ff']),
    P('opred', 'オプアート赤', ['#fff1ec', '#1a0f0f', '#ff3b3b', '#ffb3a8']),
    P('thermo', 'サーマル', ['#0b0716', '#fff4d6', '#ff4f1f', '#a01cff']),
    P('limepunch', 'ライムパンチ', ['#161616', '#ffffff', '#c6ff00', '#ff3fa4']),
    P('xerox', 'コピー機', ['#e9e7e1', '#111111', '#ff2e2e', '#9a9a94']),
    P('acidgreen', 'アシッドグリーン', ['#58c22e', '#101010', '#f7f7f7', '#1b5e0e']),
  ];
  D.palCats.edge = 'エッジ';
  NP.forEach((p) => { if (!D.palById[p.id]) { D.palettes.push(p); D.palById[p.id] = p; } });

  /* ---------------- themes ---------------- */
  const common = { post: [], bg: ['solid'], fx: 0.7, maxFx: 2, keyColor: true, beat: true };
  const NT = [
    Object.assign({}, common, { id: 'edge', n: 'エッジ / ブルータル', d: '破れた紙・手描き・かすれ・巨大積層。グランジで攻める', emoji: '✕', pals: ['grunge', 'brutal', 'limepunch', 'xerox', 'blackout'], fonts: ['anton', 'bebas', 'archivo', 'impact'],
      layouts: { fullStack: 2.5, metaPoster: 2, bigCrop: 2, poster: 2, stack: 1.5, wordFlash: 2, tileWall: 1, cameraTrack: 1 },
      enter: { stutterIn: 2.5, stripIn: 2, trackStomp: 2, erodeIn: 1.5, slam: 2, wordSlam: 2, stamp: 1 }, hold: { stutterHold: 2, stripHold: 1.5, erodeHold: 1.5, pulse: 1, none: 1.5, quake: 0.5 },
      exit: { stripOut: 2, stutterOut: 2, erodeOut: 1.5, cut: 2, rubberOut: 1 },
      filters: { erodeText: 2, misprint: 1, knockout: 1, noise: 1, sliceShift: 1.5, pixelSort: 1 }, post: ['noise'], camera: { punch: 2.5, shake: 1, still: 1 }, speed: 1.2, amp: 1.25,
      tr: { tornPaper: 3, sliceBands: 2, sliceCut: 2, shakeCut: 1.5, pixelSortCut: 1.5, flashWhite: 1, whipLeft: 1 }, trRate: 0.8,
      gx: { scribbleMarks: 3, strikeOut: 1.5, stickerTag: 2, metaHud: 1.5, splat: 1, boxSlam: 1 }, gxRate: 0.6,
      bgm: { typoMarquee: 2, riso: 2, glitchBlocks: 1, scanNoise: 1, stripesScroll: 1, gl_grainGrad: 1 } }),
    Object.assign({}, common, { id: 'psyche', n: 'サイケ / リソ・ポップ', d: '多色押し出し・円環テキスト・うねる文字。ループ系の中毒性', emoji: '◎', pals: ['psyche', 'opred', 'riso', 'acidgreen', 'candy'], fonts: ['bebas', 'anton', 'rampart', 'rocknroll'],
      layouts: { textRings: 2.5, cardDeck: 2.5, tileWall: 2, diamondTunnel: 1.5, stack: 1.5, center: 1, mirror: 1 },
      enter: { liquidIn: 2.5, rubberBend: 2.5, bendSwing: 2, stretch: 1, popcorn: 1, jumpIn: 1 }, hold: { liquidHold: 2.5, rubberHold: 2, ringSpin: 1.5, wave: 1, jelly: 1 },
      exit: { liquidOut: 2.5, rubberOut: 1.5, flowOut: 1, shrinkOut: 1 },
      filters: { rainbowStack: 3, misprint: 1.5, liquidWarp: 1, halftone: 0.5 }, camera: { drift: 1.5, still: 1.5, punch: 1 }, speed: 1.05, amp: 1.15,
      tr: { meltCut: 2.5, liquid: 2, iris: 1.5, tornPaper: 1, gridPop: 1.5, colorBlocks: 1 }, trRate: 0.7,
      gx: { circleBadge: 2, scribbleMarks: 1.5, stickerTag: 1.5, sparks: 1, halftoneDisc: 1.5 }, gxRate: 0.45,
      bgm: { opRings: 2, opWaves: 2, polkaPulse: 2, halftoneFlow: 1.5, riso: 2, gl_kaleido: 1 } }),
    Object.assign({}, common, { id: 'thermalvj', n: 'サーマル / データモッシュ', d: 'ピクセルソート・熱画像・スライス・角トンネル。尖ったクラブ映像', emoji: '▤', pals: ['thermo', 'brutal', 'cyber', 'toxic', 'laser'], fonts: ['unbounded', 'anton', 'syne', 'mono'],
      layouts: { diamondTunnel: 2.5, fullStack: 2, wordFlash: 2.5, metaPoster: 1.5, poster: 1.5, cameraTrack: 1.5, textRings: 1 },
      enter: { stripIn: 2.5, erodeIn: 2, liquidIn: 1.5, glitchZoom: 1.5, wordGlitch: 1.5, trackStomp: 1.5 }, hold: { stripHold: 2, erodeHold: 1.5, liquidHold: 1, pulse: 1.5, ringSpin: 1, glitchHold: 1 },
      exit: { stripOut: 2, erodeOut: 2, liquidOut: 1, glitchOut: 1.5, cut: 1.5 },
      filters: { pixelSort: 2.5, thermal: 2, sliceShift: 2, liquidWarp: 1, rgb: 1, erodeText: 1, bloom: 1 }, post: ['noise'], camera: { punch: 2.5, shake: 1.5 }, speed: 1.25, amp: 1.3,
      tr: { pixelSortCut: 3, thermalCut: 2.5, sliceCut: 2, glitchCut: 1.5, meltCut: 1, sliceBands: 1.5 }, trRate: 0.85,
      gx: { metaHud: 2, strikeOut: 1, hudScan: 1.5, stickerTag: 1 }, gxRate: 0.45,
      bgm: { opRays: 1.5, typoMarquee: 1.5, gl_glitchBars: 2, gl_tunnel: 1.5, gl_voronoi: 1, scanNoise: 1, dataRain: 1 } }),
  ];
  NT.forEach((t) => { D.themes.unshift(t); D.themeById[t.id] = t; });
  // sprinkle the new vocabulary into existing tones where it fits
  const add = (id, k, o) => { const t = D.themeById[id]; if (t) t[k] = Object.assign({}, t[k] || {}, o); };
  add('hiphop', 'layouts', { fullStack: 1, metaPoster: 1 }); add('hiphop', 'enter', { stutterIn: 1.5, trackStomp: 1 }); add('hiphop', 'tr', { tornPaper: 1.5, sliceBands: 1 }); add('hiphop', 'gx', { scribbleMarks: 1.5, stickerTag: 1 });
  add('rock', 'enter', { stutterIn: 1, erodeIn: 1 }); add('rock', 'tr', { tornPaper: 1.5 }); add('rock', 'filters', { erodeText: 1 }); add('rock', 'gx', { scribbleMarks: 1 });
  add('vocaloid', 'layouts', { diamondTunnel: 1, textRings: 1 }); add('vocaloid', 'tr', { pixelSortCut: 1.5, sliceCut: 1.5 }); add('vocaloid', 'filters', { pixelSort: 1, sliceShift: 1 });
  add('edm', 'layouts', { diamondTunnel: 1.5 }); add('edm', 'tr', { pixelSortCut: 1, thermalCut: 1 });
  add('jpop', 'layouts', { cardDeck: 1, textRings: 0.8 }); add('jpop', 'enter', { rubberBend: 1, bendSwing: 0.8 });
  add('showreel', 'layouts', { cardDeck: 1.5, metaPoster: 1.5, fullStack: 1 }); add('showreel', 'tr', { sliceBands: 1.5, tornPaper: 1 });
  add('vj', 'layouts', { diamondTunnel: 1.5, fullStack: 1 }); add('vj', 'tr', { pixelSortCut: 1.5, thermalCut: 1.5, sliceCut: 1 });
})();
