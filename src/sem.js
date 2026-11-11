/* Effect catalogue phase 6c — reading the lyric itself (§25 EX-06 / EX-07), on the device, no network.
 * A compact Japanese / English lexicon maps words in a line to motifs (fire, water, sky, light, night, love, …) and
 * to an emotional tone (valence: sad ↔ happy, arousal: calm ↔ intense). Auto direction uses it to
 *  - pick the key word of each line (the emphasised word): motif and emotion words win over plain long words,
 *    and words the song repeats get extra weight (EX-07)
 *  - choose backgrounds and filters that match what the lines talk about, per section, within the style (EX-06)
 *  - lean the energy of a line up or down with its emotional tone. */
'use strict';
LM.sem = (() => {
  const M = {
    fire: { w: '火 炎 燃 焔 熱 焦 灼 炭 灰 花火 fire flame burn blaze ember spark heat', bgm: ['embers', 'fire'], fx: ['heat', 'glowText'], v: 0.2, a: 0.8 },
    water: { w: '水 海 波 雨 涙 川 泳 溺 雫 滴 湖 泡 water ocean sea wave rain tears river drown drop bubble', bgm: ['rain', 'ripples', 'ocean', 'waterDrops', 'caustics', 'bubbles'], fx: ['watercolor', 'bloom'], v: -0.2, a: 0.3 },
    sky: { w: '空 星 月 宇宙 銀河 夜空 流星 惑星 sky star moon space galaxy universe comet planet', bgm: ['stars', 'galaxy', 'meteors', 'warp'], fx: ['bloom'], v: 0.3, a: 0.4 },
    light: { w: '光 輝 太陽 朝 眩 明 照 晴 虹 light shine sun morning bright glow rainbow dawn', bgm: ['godRays', 'lightSweep', 'bokehDrift', 'sunburst'], fx: ['bloom', 'lightLeak'], v: 0.6, a: 0.55 },
    night: { w: '夜 闇 影 暗 黒 深夜 真夜中 night dark shadow black midnight', bgm: ['fireflies', 'stars', 'smoke'], fx: ['vignette'], v: -0.3, a: 0.3 },
    love: { w: '愛 恋 好き 抱 キス 君 あなた ハート 想い love heart kiss hold darling baby', bgm: ['petals', 'bokehDrift', 'fireflies'], fx: ['glowText'], v: 0.6, a: 0.45 },
    flower: { w: '花 桜 咲 散 春 風 葉 flower bloom blossom spring wind petal leaf', bgm: ['petals', 'leaves'], fx: [], v: 0.4, a: 0.35 },
    cold: { w: '雪 冬 冷 凍 氷 白い snow winter cold frozen ice freeze', bgm: ['snow', 'blizzard'], fx: [], v: -0.2, a: 0.25 },
    city: { w: '街 都会 ネオン 電車 ビル 交差点 city neon street train downtown', bgm: ['neonTubes', 'dataRain', 'speedStreaks'], fx: ['neonText', 'anamorphic'], v: 0.1, a: 0.6 },
    dream: { w: '夢 幻 眠 夢見 まどろ dream fantasy sleep wonder', bgm: ['bokehDrift', 'aurora2', 'particles'], fx: ['glowText', 'bloom'], v: 0.3, a: 0.25 },
    time: { w: '時間 時計 永遠 一瞬 秒 明日 昨日 過去 未来 time clock forever moment tomorrow yesterday future past', bgm: ['orbitDots', 'pulseRings'], fx: [], v: 0, a: 0.4 },
    sad: { w: '泣 悲 寂 孤独 痛 傷 さよなら 別れ 消え 失 sad cry lonely alone pain hurt goodbye lost tears broken', bgm: ['rain', 'smoke'], fx: ['vignette', 'filmLook'], v: -0.8, a: 0.3 },
    joy: { w: '笑 楽 嬉 幸 歌 踊 はしゃ happy smile joy dance sing fun party', bgm: ['confetti', 'bouncingBalls', 'floatShapes'], fx: [], v: 0.85, a: 0.75 },
    rage: { w: '怒 叫 壊 戦 憎 狂 破 scream break fight rage hate crazy destroy', bgm: ['glitchBlocks', 'storm', 'lasers'], fx: ['glitch', 'shake'], v: -0.6, a: 0.95 },
    run: { w: '走 飛 翔 駆 跳 超え 進 run fly jump race rush go higher', bgm: ['speedStreaks', 'warp'], fx: ['speedLines'], v: 0.5, a: 0.85 },
  };
  const LEX = [];
  for (const [k, m] of Object.entries(M)) for (const w of m.w.split(/\s+/)) if (w) LEX.push([w.toLowerCase(), k, /[a-z]/.test(w) ? 'en' : 'ja']);
  LEX.sort((a, b) => b[0].length - a[0].length);
  const clean = (s) => String(s || '').replace(/[*^|｜《》]/g, '').replace(/\/+/g, ' ');
  function hits(text) {
    const t = clean(text).toLowerCase(), out = [];
    for (const [w, k, lang] of LEX) {
      let i = -1;
      while ((i = t.indexOf(w, i + 1)) >= 0) {
        if (lang === 'en') { const pre = i > 0 && /[a-z']/.test(t[i - 1]), rest = /^[a-z]*/.exec(t.slice(i + w.length))[0]; if (pre || !/^(|s|es|ed|d|ing|ning|ming|ning|y|ly)$/.test(rest)) continue; } // whole English words (+ simple inflections)
        if (!out.some((h) => i < h.i + h.w.length && h.i < i + w.length)) out.push({ w, k, i });
      }
    }
    return out;
  }
  function analyze(text) {
    const h = hits(text), mo = {}; let v = 0, a = 0;
    h.forEach((x) => { mo[x.k] = (mo[x.k] || 0) + 1; v += M[x.k].v; a += M[x.k].a; });
    const n = h.length;
    return { motifs: mo, hits: h, valence: n ? Math.max(-1, Math.min(1, v / n)) : 0, arousal: n ? a / n : 0.5, n };
  }
  // score of a token for key-word choice (used by the typesetter)
  function score(tok) { const h = hits(tok); return h.length ? 2.5 + h.reduce((s, x) => s + x.w.length * 0.2, 0) : 0; }
  // the dominant motif of a group of lines and matching backgrounds / filters
  function motifOf(texts) { const c = {}; texts.forEach((t) => { const a = analyze(t); for (const k in a.motifs) c[k] = (c[k] || 0) + a.motifs[k]; }); let best = null, bv = 0; for (const k in c) if (c[k] > bv) { bv = c[k]; best = k; } return best ? { k: best, n: bv } : null; }
  const bgmFor = (k, rng) => { const L = (M[k] ? M[k].bgm : []).filter((id) => LM.bgm.lib[id]); return L.length ? L[Math.floor(rng() * L.length)] : null; };
  const fxFor = (k, rng) => { const L = (M[k] ? M[k].fx : []).filter((id) => LM.fx.list[id]); return L.length ? L[Math.floor(rng() * L.length)] : null; };
  return { analyze, score, motifOf, bgmFor, fxFor, M };
})();
