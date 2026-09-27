/* Tone & manner extensions per theme: energy, new motion pools, background motion pools */
'use strict';
(() => {
  const X = {
    jpop: { amp: 1.1, enter: { jumpIn: 2.5, popcorn: 2, sparkPop: 2, trampoline: 1.5, flowIn: 1.5, waveIn: 1.5 }, hold: { bounceLoop: 2.5, marchStep: 1.5, colorWave: 1.5, heartbeat: 1 }, exit: { popOut: 2, jumpOut: 1.5, bubbleUp: 1.5 },
      bgm: { confetti: 2, bouncingBalls: 2, floatShapes: 2.5, dotWave: 1.5, stripesScroll: 1.5, bokehDrift: 1.5, beatCircle: 1.5, morphBlob: 1.5, checkerScroll: 1 } },
    rock: { amp: 1.3, enter: { zoomRush: 2.5, glitchZoom: 1.5, elasticDrop: 1.5, swipeUp: 1.5, rubberBand: 1 }, hold: { quake: 2.5, stretchBeat: 2, marchStep: 1 }, exit: { rushOut: 2, shatter: 2, swipeOut: 1.5, stretchOut: 1 },
      bgm: { spotlights: 2.5, smoke: 2, embers: 2, storm: 1.5, glitchBlocks: 1, speedStreaks: 1.5, fire: 1.5, strobe: 1 } },
    edm: { amp: 1.2, enter: { zoomRush: 2.5, vortexIn: 2, whirl: 1.5, glitchZoom: 2, conveyor: 1.5, flowIn: 1.5 }, hold: { stretchBeat: 2.5, heartbeat: 2, spinLetters: 1.5, orbitHold: 1, scrollFlow: 1 }, exit: { rushOut: 2.5, whirlOut: 1.5, stretchOut: 1.5, conveyorOut: 1 },
      bgm: { lasers: 2.5, warp: 2, pulseRings: 2, squareTunnel: 2, triTunnel: 1.5, eqBars: 2, circleSpectrum: 2, strobe: 1, plasma: 1, neonTubes: 1.5, hexPulse: 1.5 } },
    hiphop: { amp: 1.15, enter: { jumpIn: 1.5, swipeUp: 2, elasticDrop: 1.5, stackDrop: 2, sparkPop: 1.5 }, hold: { marchStep: 2.5, stretchBeat: 2, bounceLoop: 1.5 }, exit: { swipeOut: 2, jumpOut: 1.5, shatter: 1 },
      bgm: { halftoneWave: 2, splitPanels: 2, stripesScroll: 2, zigzag: 1.5, eqBars: 2, checkerScroll: 1.5, diagonalSplit: 1.5, smoke: 1 } },
    ballad: { amp: 0.7, enter: { flowIn: 1.5, waveIn: 1.5, windIn: 1 }, hold: { swayFlow: 2, riseFlow: 1.5 }, exit: { bubbleUp: 1.5, flowOut: 1.5, sinkWave: 1 },
      bgm: { bokehDrift: 2.5, godRays: 2, particles: 2, snow: 1, rain: 1.5, petals: 1, stars: 1.5, caustics: 1, clouds: 1, smoke: 1 } },
    lofi: { amp: 0.8, enter: { flickerType: 2, waveIn: 1, flowIn: 1 }, hold: { swayFlow: 1.5, orbitHold: 1 }, exit: { sinkWave: 1, bubbleUp: 1 },
      bgm: { rain: 2.5, waterDrops: 2.5, scanNoise: 1.5, particles: 1.5, snow: 1, clouds: 1, stars: 1 } },
    citypop: { amp: 0.95, enter: { conveyor: 2, flowIn: 2, ribbonIn: 2, boomerang: 1 }, hold: { scrollFlow: 2, swayFlow: 1.5, colorWave: 1.5 }, exit: { conveyorOut: 2, flowOut: 2 },
      bgm: { retroSun: 3, stars: 1.5, lightSweep: 1.5, stripesScroll: 1.5, sineLines: 1.5, gradientShift: 1.5, ocean: 1.5, meteors: 1 } },
    vocaloid: { amp: 1.3, enter: { glitchZoom: 2.5, flickerType: 2, popcorn: 1.5, zoomRush: 1.5, sparkPop: 1 }, hold: { quake: 1.5, spinLetters: 1.5, colorWave: 2, stretchBeat: 1.5 }, exit: { shatter: 2, rushOut: 1.5, popOut: 1.5 },
      bgm: { dataRain: 2.5, glitchBlocks: 2.5, pixelField: 2, hexPulse: 1.5, circleSpectrum: 1.5, mosaicFlip: 1.5, scanNoise: 1.5, squareTunnel: 1 } },
    anison: { amp: 1.25, enter: { zoomRush: 2.5, vortexIn: 1.5, whirl: 1.5, boomerang: 1.5, jumpIn: 1, ribbonIn: 1 }, hold: { heartbeat: 1.5, stretchBeat: 1.5, rollingWave: 1 }, exit: { rushOut: 2, windOut: 1.5, whirlOut: 1.5 },
      bgm: { speedStreaks: 2.5, sunburst: 2, warp: 1.5, meteors: 1.5, pulseRings: 1.5, diagonalSplit: 1.5, lightSweep: 1.5, fire: 1 } },
    cinematic: { amp: 0.75, enter: { waveIn: 1, flowIn: 1 }, hold: { riseFlow: 1.5, swayFlow: 1 }, exit: { flowOut: 1, sinkWave: 1 },
      bgm: { smoke: 2, godRays: 2, clouds: 1.5, lightSweep: 1.5, rain: 1.5, bokehDrift: 1.5, storm: 1, snow: 1 } },
    wa: { amp: 0.8, enter: { windIn: 2, waveIn: 1.5, flowIn: 1 }, hold: { swayFlow: 2, riseFlow: 1 }, exit: { windOut: 2, sinkWave: 1 },
      bgm: { petals: 3, leaves: 2, snow: 1.5, ripples: 2, smoke: 1.5, fireflies: 1.5, rain: 1, moire: 0.5 } },
    metal: { amp: 1.4, enter: { zoomRush: 2, elasticDrop: 1.5, glitchZoom: 1.5, swipeUp: 1.5 }, hold: { quake: 3, stretchBeat: 1.5 }, exit: { shatter: 2.5, rushOut: 2, stretchOut: 1 },
      bgm: { fire: 2.5, embers: 2.5, storm: 2, smoke: 1.5, strobe: 1.5, glitchBlocks: 1, spotlights: 1 } },
    acoustic: { amp: 0.85, enter: { waveIn: 1.5, windIn: 1.5, jumpIn: 1 }, hold: { swayFlow: 1.5, bounceLoop: 1 }, exit: { bubbleUp: 1, windOut: 1.5 },
      bgm: { leaves: 2, fireflies: 2, bokehDrift: 1.5, petals: 1, godRays: 1.5, particles: 1.5, clouds: 1 } },
    ambient: { amp: 0.6, enter: { flowIn: 1.5, waveIn: 1 }, hold: { riseFlow: 2, swayFlow: 2, scrollFlow: 1 }, exit: { flowOut: 1.5, bubbleUp: 1 },
      bgm: { aurora2: 2.5, caustics: 2, liquid: 1.5, stars: 1.5, galaxy: 1.5, flowLines: 2, ocean: 1, sineLines: 1.5 } },
    minimal: { amp: 0.8, enter: { swipeUp: 1, conveyor: 1 }, hold: { scrollFlow: 0.5 }, exit: { swipeOut: 1, conveyorOut: 0.5 },
      bgm: { lightSweep: 1, splitSlide: 1.5, dotWave: 1, moire: 1, sineLines: 0.5 } },
    dream: { amp: 0.8, enter: { flowIn: 2, ribbonIn: 2, vortexIn: 1, windIn: 1.5 }, hold: { swayFlow: 2, orbitHold: 1.5, rollingWave: 1.5 }, exit: { bubbleUp: 2, flowOut: 1.5 },
      bgm: { bubbles: 2, lavaLamp: 2, bokehDrift: 2, aurora2: 1.5, morphBlob: 1.5, fireflies: 1.5, petals: 1, galaxy: 1 } },
  };
  LM.data.themes.forEach((t) => {
    const x = X[t.id]; if (!x) return;
    t.amp = x.amp;
    Object.assign(t.enter, x.enter); Object.assign(t.hold, x.hold); Object.assign(t.exit, x.exit);
    t.bgm = x.bgm;
  });
  LM.data.tempos = { theme: 'テーマに合わせる', 0.7: 'ゆったり', 1: '標準', 1.3: 'キビキビ', 1.6: '高速' };
})();
