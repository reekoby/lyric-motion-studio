/* Tone & manner v2: transitions, accent graphics, kinetic layouts, GPU backgrounds per theme + new themes */
'use strict';
(() => {
  const D = LM.data;
  const X = {
    jpop: { tr: { colorBlocks: 2, iris: 1.5, gridPop: 2, liquid: 1.5, zoomThrough: 1, flashWhite: 1, diamond: 1 }, trRate: 0.5, gx: { sparks: 2.5, ringBurst: 2, confettiPop: 1.5, scribble: 1.5, halo: 1, underlineSwipe: 1 }, gxRate: 0.5,
      layouts: { wordFlash: 1, cameraTrack: 1 }, enter: { wordSeq: 1.5, wordDrop: 1.5, cardFlip: 1 }, hold: { carousel: 0.5 }, bgm: { gl_mesh: 1.5, gl_holo: 1, gl_dotwave: 1, gl_grainGrad: 1.5, gl_blobs: 1 }, filters: { stackColor: 1 } },
    rock: { tr: { whipLeft: 1.5, whipRight: 1.5, shakeCut: 2.5, glitchCut: 1.5, flashWhite: 2, zoomThrough: 1.5, filmBurnCut: 1 }, trRate: 0.6, gx: { lineBurst: 2, slashes: 2, boxSlam: 1.5, speedBars: 1.5 }, gxRate: 0.45,
      layouts: { bigCrop: 1, wordFlash: 1.5 }, enter: { wordSlam: 2.5, zoom3D: 1 }, bgm: { gl_fire: 1.5, gl_glitchBars: 1 }, filters: { misprint: 1, knockout: 1 } },
    edm: { tr: { zoomThrough: 2.5, glitchCut: 2, whipLeft: 1.5, whipRight: 1.5, spin: 1.5, rgbCut: 1.5, flashAccent: 2, stripesDiag: 1, iris: 1 }, trRate: 0.75, gx: { ringBurst: 2, lineBurst: 2, halo: 2, glowPulse: 2, hudScan: 1 }, gxRate: 0.55,
      layouts: { wordFlash: 2, cameraTrack: 1.5 }, enter: { wordSlam: 2, tumble3D: 1.5, fly3D: 1.5, zoom3D: 1.5 }, hold: { orbitCam: 1.5, tilt3D: 1.5, carousel: 1, sphere: 1 }, exit: { passCam: 2, fly3DOut: 1.5, tumble3DOut: 1 },
      bgm: { gl_tunnel: 2.5, gl_hyperspace: 2, gl_kaleido: 2, gl_cubes: 2, gl_spheres: 1.5, gl_laserGrid: 2, gl_hypno: 1.5, gl_spiral: 1.5 }, filters: { knockout: 1 } },
    hiphop: { tr: { whipLeft: 2, whipRight: 2, colorBlocks: 2, barsH: 2, shakeCut: 1.5, splitClose: 1 }, trRate: 0.55, gx: { boxSlam: 2.5, bracketSnap: 2, underlineSwipe: 2, tagCorner: 1.5, splat: 1.5, chevrons: 1 }, gxRate: 0.55,
      layouts: { wordFlash: 2, bigCrop: 1 }, enter: { wordSlam: 2, wordSlide: 2, wordDrop: 1 }, bgm: { gl_dotwave: 1, gl_opart: 1 }, filters: { misprint: 2, stackColor: 1.5 } },
    ballad: { tr: { flashWhite: 1, blurCut: 2.5, filmBurnCut: 1.5, ink: 1, iris: 0.5 }, trRate: 0.3, gx: { glowPulse: 1.5, halo: 0.5, waveUnder: 1 }, gxRate: 0.2, hold: { tilt3D: 1 }, bgm: { gl_mesh: 1.5, gl_water: 1.5, gl_curtain: 1, gl_grainGrad: 1.5, gl_galaxy: 1 } },
    lofi: { tr: { blurCut: 2, pixelCut: 1.5, filmBurnCut: 1.5, flashWhite: 0.5 }, trRate: 0.3, gx: { scribble: 2, waveUnder: 1.5, tagCorner: 1, halftoneDisc: 1 }, gxRate: 0.35, enter: { wordDrop: 1 }, bgm: { gl_rainGlass: 2.5, gl_grainGrad: 1.5, gl_ripplesGL: 1 }, filters: { misprint: 1 } },
    citypop: { tr: { whipLeft: 2, whipRight: 2, barsH: 2, stripesDiag: 2, colorBlocks: 1.5, iris: 1 }, trRate: 0.5, gx: { underlineSwipe: 2, speedBars: 2, frameDraw: 1.5, halftoneDisc: 1 }, gxRate: 0.4,
      layouts: { cameraTrack: 1 }, enter: { wordSlide: 1.5, cardFlip: 1 }, bgm: { gl_terrain: 3, gl_checker: 2, gl_holo: 1, gl_mesh: 1.5, gl_grainGrad: 1.5 }, filters: { stackColor: 1.5 } },
    vocaloid: { tr: { glitchCut: 3, rgbCut: 2, pixelCut: 2, gridPop: 2, shards: 1.5, invertCut: 1.5, whipLeft: 1, zoomThrough: 1 }, trRate: 0.8, gx: { hudScan: 2.5, bracketSnap: 2, crossSweep: 2, slashes: 1.5, squareSpin: 1.5, tagCorner: 1.5 }, gxRate: 0.6,
      layouts: { wordFlash: 3.5, cameraTrack: 2 }, enter: { wordGlitch: 3, wordSlam: 2, charBeat: 2, wordFlip: 1.5 }, hold: { spinY3D: 1 }, exit: { wordUnseq: 1.5 },
      bgm: { gl_glitchBars: 2.5, gl_voronoi: 1.5, gl_truchet: 1.5, gl_hexglow: 2, gl_kaleido: 1 }, filters: { knockout: 1.5, misprint: 1 } },
    anison: { tr: { zoomThrough: 2.5, whipLeft: 2, whipRight: 2, spin: 2, flashWhite: 2, stripesDiag: 1.5, shards: 1 }, trRate: 0.7, gx: { lineBurst: 2.5, sparks: 2, ringBurst: 2, slashes: 1.5, speedBars: 1.5 }, gxRate: 0.6,
      layouts: { wordFlash: 1.5, cameraTrack: 1.5 }, enter: { wordSlam: 2, tumble3D: 1.5, zoom3D: 1.5 }, hold: { orbitCam: 1, flag3D: 1 }, exit: { passCam: 1.5 }, bgm: { gl_spiral: 2, gl_hyperspace: 1.5, gl_tunnel: 1.5 }, filters: { stackColor: 1.5 } },
    cinematic: { tr: { blurCut: 2, flashWhite: 1, filmBurnCut: 1.5, dolly: 1.5 }, trRate: 0.35, gx: { frameDraw: 1, tagCorner: 0.5 }, gxRate: 0.15, layouts: { bigCrop: 1.5 }, hold: { tilt3D: 1.5, crawl3D: 1 }, bgm: { gl_curtain: 1, gl_warp: 1.5, gl_water: 1, gl_galaxy: 1 }, filters: { knockout: 0.5 } },
    wa: { tr: { ink: 2.5, blurCut: 1.5, flashWhite: 0.5, fan: 1 }, trRate: 0.35, gx: { scribble: 1.5, halo: 1, splat: 1 }, gxRate: 0.25, bgm: { gl_warp: 1.5, gl_water: 1.5, gl_ripplesGL: 1.5 } },
    metal: { tr: { shakeCut: 3, glitchCut: 2, flashWhite: 2.5, zoomThrough: 1.5, invertCut: 1.5, rgbCut: 1 }, trRate: 0.7, gx: { lineBurst: 2, slashes: 2.5, crossSweep: 1.5, boxSlam: 1 }, gxRate: 0.5,
      layouts: { bigCrop: 1.5, wordFlash: 1.5 }, enter: { wordSlam: 3 }, bgm: { gl_fire: 2.5, gl_glitchBars: 1, gl_voronoi: 1 }, filters: { misprint: 1 } },
    acoustic: { tr: { blurCut: 2, ink: 1, flashWhite: 0.5, iris: 0.5 }, trRate: 0.3, gx: { scribble: 2, waveUnder: 2, sparks: 0.5, splat: 1 }, gxRate: 0.35, enter: { wordDrop: 1 }, bgm: { gl_mesh: 1.5, gl_grainGrad: 2, gl_water: 1 } },
    ambient: { tr: { blurCut: 2.5, dolly: 1, flashWhite: 0.5 }, trRate: 0.3, gx: { halo: 1, glowPulse: 1.5 }, gxRate: 0.2, hold: { tilt3D: 2, sphere: 1, helix: 1, crawl3D: 1 }, bgm: { gl_warp: 2.5, gl_curtain: 2, gl_galaxy: 1.5, gl_water: 1.5, gl_blobs: 1, gl_mesh: 1.5 } },
    minimal: { tr: { colorBlocks: 1.5, splitClose: 1.5, barsH: 1, whipLeft: 1 }, trRate: 0.4, gx: { underlineSwipe: 2, frameDraw: 1.5, tagCorner: 1.5, bracketSnap: 1 }, gxRate: 0.35, layouts: { bigCrop: 1.5, cameraTrack: 1 }, enter: { wordSeq: 1.5 }, bgm: { gl_grainGrad: 1, gl_opart: 0.5 } },
    dream: { tr: { blurCut: 2, iris: 1.5, liquid: 1.5, flashWhite: 1, dolly: 1 }, trRate: 0.45, gx: { halo: 2, sparks: 1.5, glowPulse: 2 }, gxRate: 0.4, hold: { carousel: 1, sphere: 1, helix: 1, tilt3D: 1.5 }, enter: { fly3D: 1.5 }, bgm: { gl_holo: 2, gl_blobs: 2, gl_mesh: 2, gl_warp: 1.5, gl_chrome: 1 } },
  };
  D.themes.forEach((t) => {
    const x = X[t.id]; if (!x) return;
    ['layouts', 'enter', 'hold', 'exit', 'filters', 'bgm'].forEach((k) => { if (x[k]) t[k] = Object.assign({}, t[k] || {}, x[k]); });
    t.tr = x.tr; t.trRate = x.trRate; t.gx = x.gx; t.gxRate = x.gxRate;
  });
  const NT = [
    { id: 'vj', n: 'VJ / クラブ', d: 'シェーダー背景とビートで畳み掛ける', emoji: '◈', pals: ['cyber', 'acid', 'laser', 'synth', 'toxic', 'vapor'], fonts: ['impact', 'unbounded', 'mono'],
      layouts: { wordFlash: 4, poster: 2, cameraTrack: 2, center: 1, depth: 1.5, bigCrop: 1 }, enter: { wordSlam: 3, zoomRush: 2, glitchZoom: 2, tumble3D: 1.5, fly3D: 1.5, zoom3D: 1.5 },
      hold: { pulse: 2, stretchBeat: 2, orbitCam: 1.5, tilt3D: 1.5, quake: 1, carousel: 1 }, exit: { rushOut: 2, passCam: 2, glitchOut: 1.5, cut: 1.5 },
      filters: { bloom: 2, rgb: 2, neonText: 1.5, knockout: 1.5, glowText: 1, glitch: 1 }, post: ['bloom'], bg: ['solid'], camera: { punch: 3, shake: 1 }, fx: 0.8, maxFx: 2, speed: 1.3, keyColor: true, beat: true, amp: 1.35,
      tr: { zoomThrough: 2.5, glitchCut: 2.5, flashAccent: 2, rgbCut: 2, whipLeft: 1.5, whipRight: 1.5, spin: 1.5, invertCut: 1.5, pixelCut: 1 }, trRate: 0.9,
      gx: { ringBurst: 2, lineBurst: 2, hudScan: 2, halo: 1.5, glowPulse: 1.5, squareSpin: 1.5 }, gxRate: 0.6,
      bgm: { gl_tunnel: 2, gl_kaleido: 2, gl_hyperspace: 2, gl_cubes: 2, gl_spheres: 2, gl_laserGrid: 2, gl_hypno: 1.5, gl_spiral: 1.5, gl_voronoi: 1, gl_glitchBars: 1.5, gl_hexglow: 1.5 } },
    { id: 'showreel', n: 'ショーリール / モーションデザイン', d: 'カラーブロックとカメラワークで魅せる', emoji: '▦', pals: ['eblue', 'tomato', 'lime', 'popart', 'blackout', 'mondrian'], fonts: ['archivo', 'gothic', 'bebas', 'anton'],
      layouts: { cameraTrack: 3, stack: 2.5, bigsmall: 2, labels: 1.5, wordFlash: 2, bigCrop: 1.5, split: 1.5, editorial: 1 }, enter: { wordSeq: 2, slam: 1.5, lineReveal: 2, mask: 2, swipeUp: 1.5, flip3DX: 1.5, swing3D: 1.5, conveyor: 1 },
      hold: { none: 2, orbitCam: 1, tilt3D: 1, scrollFlow: 1 }, exit: { swipeOut: 1.5, lineMaskOut: 2, conveyorOut: 1.5, cut: 1.5, flip3DOut: 1 },
      filters: { stackColor: 1.5, misprint: 1, knockout: 1 }, post: [], bg: ['solid'], camera: { still: 2, punch: 1.5 }, fx: 0.5, maxFx: 1, speed: 1.15, keyColor: true, beat: true, amp: 1.1,
      tr: { colorBlocks: 3, barsH: 2, stripesDiag: 2, iris: 1.5, diamond: 1.5, gridPop: 2, splitClose: 2, fan: 1.5, whipLeft: 2, whipRight: 2, whipUp: 1.5 }, trRate: 0.85,
      gx: { underlineSwipe: 2, bracketSnap: 2, boxSlam: 2, tagCorner: 1.5, frameDraw: 1.5, chevrons: 1.5, halftoneDisc: 1.5 }, gxRate: 0.55,
      bgm: { gl_grainGrad: 1, gl_mesh: 1, gl_truchet: 1, gl_opart: 1, splitPanels: 1.5, diagonalSplit: 1.5, splitSlide: 1.5, floatShapes: 1.5, dotWave: 1 } },
    { id: 'artistmv', n: 'アーティストMV（ハイセンス）', d: '巨大文字・文字抜き・粒子。誌面の余白', emoji: '◧', pals: ['monofilm', 'bleach', 'neonoir', 'blackout', 'whiteout', 'dusk', 'golden'], fonts: ['serif', 'zenold', 'mincho', 'playfair', 'syne'],
      layouts: { bigCrop: 3, center: 2, vertical: 1.5, corner: 1.5, subtitle: 1, editorial: 1.5, cameraTrack: 1 }, enter: { blurIn: 2, tracking: 2, lineReveal: 2, focusPull: 1.5, flip3DY: 1.5, zoom3D: 1, wordSeq: 1 },
      hold: { zoomSlow: 2, tilt3D: 2, drift: 1.5, trackBreathe: 1, crawl3D: 0.5 }, exit: { blurOut: 2, trackingOut: 1.5, fadeOut: 2, passCam: 1 },
      filters: { knockout: 2, dust: 1.5, letterbox: 1, bloom: 1 }, post: ['noise', 'vignette'], bg: ['solid', 'radial'], camera: { push: 2, drift: 1.5, still: 1 }, fx: 0.55, maxFx: 1, speed: 0.9, keyColor: false, beat: false, amp: 0.85,
      tr: { blurCut: 2, flashWhite: 1.5, filmBurnCut: 1.5, dolly: 1.5, whipLeft: 1, iris: 0.5 }, trRate: 0.45,
      gx: { frameDraw: 1, tagCorner: 1, glowPulse: 1 }, gxRate: 0.2,
      bgm: { gl_warp: 2, gl_curtain: 1, gl_chrome: 1.5, gl_grainGrad: 1.5, smoke: 2, bokehDrift: 1.5, particles: 1.5, godRays: 1 } },
  ];
  NT.forEach((t) => { D.themes.unshift(t); D.themeById[t.id] = t; });
})();
