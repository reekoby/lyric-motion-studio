/* Filters / effects catalog and 2D overlay painters */
'use strict';
LM.fx = (() => {
  const { clamp, lerp, hash, rgba, mix, noise1 } = LM.U;
  const E = LM.E;
  const PI = Math.PI;

  // c: trans(切り替え) text(文字装飾) over(装飾・パーティクル) screen(質感・画面効果)
  // k: glyph | layer | over | under | post | time
  const F = (n, c, k, extra) => Object.assign({ n, c, k }, extra || {});
  const list = {
    // --- transitions (layer composite)
    wipe: F('ワイプ', 'trans', 'layer'),
    splitHorizontal: F('上下分割ワイプ', 'trans', 'layer'),
    splitVertical: F('左右分割ワイプ', 'trans', 'layer'),
    blinds: F('ブラインド', 'trans', 'layer'),
    checker: F('市松ワイプ', 'trans', 'layer'),
    clockWipe: F('クロックワイプ', 'trans', 'layer'),
    irisWipe: F('アイリス', 'trans', 'layer'),
    diagonalWipe: F('斜め帯ワイプ', 'trans', 'layer'),
    shred: F('退場：シュレッダー', 'trans', 'layer'),
    mosaic: F('モザイク登場', 'trans', 'layer'),
    glass: F('ガラス破片', 'trans', 'layer'),
    warp: F('ワープ', 'trans', 'layer'),
    zoomBlur: F('ズーム残像', 'trans', 'post'),
    flash: F('登場フラッシュ', 'trans', 'over'),
    pixel: F('ピクセル化で出入り', 'trans', 'post'),
    blur: F('ブラーで出入り', 'trans', 'post'),
    filmBurn: F('フィルムバーン', 'trans', 'over'),
    glitchCut: F('グリッチカット', 'trans', 'post'),
    // --- text decoration (glyph)
    zoom: F('一部拡大（文字サイズ）', 'text', 'glyph'),
    outlineText: F('文字の縁取り', 'text', 'glyph'),
    neonText: F('ネオン発光', 'text', 'glyph'),
    longShadow: F('文字の長い影', 'text', 'glyph'),
    markerText: F('文字のマーカー', 'text', 'glyph'),
    extrude: F('立体押し出し', 'text', 'glyph'),
    gradientText: F('グラデーション文字', 'text', 'glyph'),
    glowText: F('やわらかい光彩', 'text', 'glyph'),
    dropShadow: F('ドロップシャドウ', 'text', 'glyph'),
    underline: F('アンダーライン', 'text', 'glyph'),
    echo: F('文字の残像（トレイル）', 'text', 'time'),
    knockout: F('文字抜き（背景が透ける）', 'text', 'glyph'),
    misprint: F('版ずれ（リソ印刷風）', 'text', 'glyph'),
    stackColor: F('カラースタック（多重）', 'text', 'glyph'),
    rainbowStack: F('サイケ多重押し出し（回転）', 'text', 'glyph'),
    erodeText: F('かすれ・侵食インク', 'text', 'glyph'),
    twoFrame: F('2コマ打ち', 'text', 'time'),
    // --- overlays / particles
    particles: F('粒子', 'over', 'over'),
    confetti: F('紙吹雪', 'over', 'over'),
    sparkle: F('キラッ', 'over', 'over'),
    bokeh: F('玉ボケ', 'over', 'under'),
    snow: F('雪', 'over', 'over'),
    rain: F('雨', 'over', 'over'),
    stars: F('星空', 'over', 'under'),
    dust: F('ほこり・塵', 'over', 'over'),
    lightLeak: F('光漏れ', 'over', 'over'),
    sunflare: F('レンズフレア', 'over', 'over'),
    rays: F('射線', 'over', 'under'),
    speedLines: F('集中線', 'over', 'under'),
    lightning: F('稲妻', 'over', 'over'),
    stripes: F('縞模様', 'over', 'under'),
    dots: F('ドット', 'over', 'under'),
    waveLines: F('波形ライン', 'over', 'under'),
    geo: F('幾何学図形', 'over', 'under'),
    reticle: F('照準線', 'over', 'over'),
    dottedRing: F('ドットの輪', 'over', 'under'),
    barcode: F('バーコード', 'over', 'over'),
    audioBars: F('オーディオバー（音に反応）', 'over', 'under'),
    audioWave: F('オーディオ波形（音に反応）', 'over', 'under'),
    filmScratch: F('フィルム傷', 'over', 'over'),
    paper: F('紙の質感', 'over', 'over'),
    letterbox: F('シネスコ帯', 'over', 'top'),
    // --- screen (post shader)
    glitch: F('グリッチ', 'screen', 'post'),
    blockGlitch: F('ブロックグリッチ', 'screen', 'post'),
    rgb: F('色ずれ', 'screen', 'post'),
    timeRgb: F('時間差RGB分離', 'screen', 'post'),
    chromatic: F('色収差（周辺）', 'screen', 'post'),
    vhs: F('VHSロール', 'screen', 'post'),
    scanlines: F('走査線', 'screen', 'post'),
    crt: F('ブラウン管', 'screen', 'post'),
    noise: F('ノイズ・フィルム粒子', 'screen', 'post'),
    vignette: F('周辺減光', 'screen', 'post'),
    bloom: F('光のにじみ', 'screen', 'post'),
    halftone: F('網点', 'screen', 'post'),
    posterize: F('ポスタライズ', 'screen', 'post'),
    dither: F('ディザ（1bit風）', 'screen', 'post'),
    duotone: F('デュオトーン', 'screen', 'post'),
    sepia: F('ビンテージ', 'screen', 'post'),
    bleach: F('銀残し', 'screen', 'post'),
    contrastPop: F('ハイコントラスト', 'screen', 'post'),
    hueCycle: F('色相シフト', 'screen', 'post'),
    invert: F('カラー反転（瞬間）', 'screen', 'post'),
    heat: F('陽炎ゆらぎ', 'screen', 'post'),
    tiltShift: F('ミニチュア（ティルトシフト）', 'screen', 'post'),
    fisheye: F('魚眼', 'screen', 'post'),
    mirrorX: F('左右ミラー', 'screen', 'post'),
    shake: F('激しくムーブ', 'screen', 'layer'),
    pixelSort: F('ピクセルソート（横ストリーク）', 'screen', 'post'),
    sliceShift: F('スライスずらし（ビート）', 'screen', 'post'),
    liquidWarp: F('液状ゆがみ', 'screen', 'post'),
    thermal: F('サーマル（熱画像）', 'screen', 'post'),
  };
  const cats = { trans: '切り替え・ワイプ', text: '文字装飾', over: '装飾・パーティクル', screen: '質感・画面効果' };

  /* ---------- overlay painters: (ctx, R) ---------- */
  const O = {};
  O.particles = (ctx, R) => {
    const n = Math.round(50 * R.amt);
    for (let i = 0; i < n; i++) {
      const sp = 0.02 + hash(i, 3) * 0.05;
      const x = (hash(i, 1) * R.W + noise1(R.t * 0.3 + i, 5) * R.S * 40) % R.W;
      const y = ((hash(i, 2) - R.t * sp) % 1 + 1) % 1 * R.H;
      const r = R.S * (1 + hash(i, 4) * 3.5);
      ctx.globalAlpha = (0.25 + 0.6 * hash(i, 5)) * (0.6 + 0.4 * Math.sin(R.t * 2 + i));
      ctx.fillStyle = i % 3 ? R.pal.text : R.pal.accent;
      ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill();
    }
  };
  O.dust = (ctx, R) => {
    const n = Math.round(80 * R.amt);
    ctx.fillStyle = R.pal.text;
    for (let i = 0; i < n; i++) {
      const x = ((hash(i, 11) + R.t * 0.01 * (hash(i, 12) - 0.5)) % 1 + 1) % 1 * R.W;
      const y = ((hash(i, 13) + R.t * 0.008) % 1) * R.H;
      ctx.globalAlpha = 0.12 + 0.25 * hash(i, 14);
      ctx.fillRect(x, y, R.S * (0.8 + hash(i, 15) * 1.6), R.S * (0.8 + hash(i, 15) * 1.6));
    }
  };
  O.snow = (ctx, R) => {
    const n = Math.round(90 * R.amt);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < n; i++) {
      const sp = 0.05 + hash(i, 21) * 0.08, r = R.S * (1.5 + hash(i, 22) * 4);
      const y = ((hash(i, 23) + R.t * sp) % 1) * (R.H + 20) - 10;
      const x = hash(i, 24) * R.W + Math.sin(R.t * 1.2 + i) * R.S * 20;
      ctx.globalAlpha = 0.5 + 0.4 * hash(i, 25);
      ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill();
    }
  };
  O.rain = (ctx, R) => {
    const n = Math.round(120 * R.amt);
    ctx.strokeStyle = R.pal.text; ctx.lineWidth = R.S * 1.2;
    for (let i = 0; i < n; i++) {
      const sp = 0.9 + hash(i, 31) * 0.6, len = R.S * (20 + hash(i, 32) * 40);
      const y = ((hash(i, 33) + R.t * sp) % 1) * (R.H + len) - len;
      const x = hash(i, 34) * R.W * 1.1 - y * 0.08;
      ctx.globalAlpha = 0.15 + 0.3 * hash(i, 35);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * 0.08, y + len); ctx.stroke();
    }
  };
  O.stars = (ctx, R) => {
    const n = Math.round(110 * R.amt);
    for (let i = 0; i < n; i++) {
      const x = hash(i, 41) * R.W, y = hash(i, 42) * R.H;
      const tw = 0.5 + 0.5 * Math.sin(R.t * (1 + hash(i, 43) * 3) + i);
      ctx.globalAlpha = 0.2 + 0.7 * tw * hash(i, 44);
      ctx.fillStyle = i % 7 === 0 ? R.pal.accent : R.pal.text;
      const r = R.S * (0.6 + hash(i, 45) * 1.8);
      ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill();
    }
  };
  O.bokeh = (ctx, R) => {
    const n = Math.round(14 * R.amt) + 3;
    for (let i = 0; i < n; i++) {
      const x = (hash(i, 51) * 1.2 - 0.1) * R.W + Math.sin(R.t * 0.2 + i) * R.S * 60;
      const y = (hash(i, 52) * 1.2 - 0.1) * R.H + Math.cos(R.t * 0.17 + i) * R.S * 40;
      const r = R.minD * (0.04 + hash(i, 53) * 0.1);
      const col = [R.pal.accent, R.pal.sub, R.pal.text][i % 3];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(col, 0.28)); g.addColorStop(0.75, rgba(col, 0.16)); g.addColorStop(1, rgba(col, 0));
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(R.t * 0.8 + i);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill();
    }
  };
  O.confetti = (ctx, R) => {
    const n = Math.round(70 * R.amt);
    const cols = [R.pal.accent, R.pal.sub, R.pal.text];
    const age = R.lt; // burst from cue start
    for (let i = 0; i < n; i++) {
      const sp = 0.12 + hash(i, 61) * 0.18;
      const y = ((hash(i, 62) * 0.6 - 0.35) + age * sp) * R.H;
      if (y > R.H + 20 || y < -40) continue;
      const x = hash(i, 63) * R.W + Math.sin(age * 3 + i) * R.S * 30;
      ctx.save(); ctx.translate(x, y); ctx.rotate(age * (2 + hash(i, 64) * 4) + i);
      ctx.scale(1, Math.cos(age * 5 + i));
      ctx.globalAlpha = 0.9; ctx.fillStyle = cols[i % 3];
      ctx.fillRect(-R.S * 6, -R.S * 3, R.S * 12, R.S * 6); ctx.restore();
    }
  };
  O.sparkle = (ctx, R) => {
    const B = R.bbox; const n = Math.round(8 * R.amt) + 2;
    for (let i = 0; i < n; i++) {
      const per = 1.1 + hash(i, 71);
      const ph = ((R.t + hash(i, 72) * per) % per) / per;
      const k = Math.floor((R.t + hash(i, 72) * per) / per);
      const x = B.x - B.w * 0.1 + hash(i, k, 73) * B.w * 1.2, y = B.y - B.h * 0.25 + hash(i, k, 74) * B.h * 1.5;
      const s = Math.sin(ph * PI) * R.S * (14 + hash(i, 75) * 16);
      if (s <= 0.1) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ph * 0.8);
      ctx.globalAlpha = 0.95; ctx.fillStyle = i % 2 ? R.pal.accent : '#ffffff';
      ctx.beginPath();
      for (let j = 0; j < 8; j++) { const r = j % 2 ? s * 0.18 : s; const a = (j / 8) * PI * 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  };
  O.lightLeak = (ctx, R) => {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 2; i++) {
      const x = R.W * (i ? 0.95 : 0.05) + Math.sin(R.t * 0.3 + i * 2) * R.W * 0.15;
      const y = R.H * (i ? 0.1 : 0.85) + Math.cos(R.t * 0.25 + i) * R.H * 0.1;
      const r = R.minD * (0.6 + 0.2 * Math.sin(R.t * 0.4 + i));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const col = i ? mix(R.pal.accent, '#ffb35c', 0.5) : mix(R.pal.sub, '#ff6a3d', 0.4);
      g.addColorStop(0, rgba(col, 0.55 * R.amt)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H);
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  O.sunflare = (ctx, R) => {
    ctx.globalCompositeOperation = 'screen';
    const sx = R.W * (0.18 + 0.05 * Math.sin(R.t * 0.2)), sy = R.H * 0.18;
    const cx = R.W / 2, cy = R.H / 2;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R.minD * 0.35);
    g.addColorStop(0, rgba('#fff4d6', 0.7 * R.amt)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H);
    [0.4, 0.7, 1.15, 1.5].forEach((k, i) => {
      const x = lerp(sx, cx, k * 1.2), y = lerp(sy, cy, k * 1.2), r = R.minD * [0.03, 0.06, 0.02, 0.1][i];
      ctx.fillStyle = rgba(i % 2 ? R.pal.accent : R.pal.sub, 0.18 * R.amt);
      ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  };
  O.rays = (ctx, R) => {
    const n = 16, cx = R.W / 2, cy = R.H / 2, rr = Math.hypot(R.W, R.H);
    ctx.fillStyle = R.pal.accent; ctx.globalAlpha = 0.14 * R.amt;
    const rot = R.t * 0.08;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * PI * 2, w = PI / n * 0.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - w) * rr, cy + Math.sin(a - w) * rr); ctx.lineTo(cx + Math.cos(a + w) * rr, cy + Math.sin(a + w) * rr); ctx.fill();
    }
  };
  O.speedLines = (ctx, R) => {
    const n = 90, cx = R.W / 2, cy = R.H / 2, rr = Math.hypot(R.W, R.H) * 0.6;
    const k = Math.floor(R.t * 15);
    ctx.fillStyle = R.pal.text; ctx.globalAlpha = 0.5 * clamp(R.amt);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + (hash(i, k) - 0.5) * 0.05;
      const inner = rr * (0.45 + hash(i, k, 2) * 0.35), w = 0.004 + hash(i, k, 3) * 0.012;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a - w) * rr * 1.2, cy + Math.sin(a - w) * rr * 1.2);
      ctx.lineTo(cx + Math.cos(a + w) * rr * 1.2, cy + Math.sin(a + w) * rr * 1.2); ctx.fill();
    }
  };
  O.lightning = (ctx, R) => {
    const k = Math.floor(R.t * 6);
    const on = R.lt < 0.25 || hash(k, 81) > 0.8 || R.beat > 0.85;
    if (!on) return;
    ctx.strokeStyle = '#ffffff'; ctx.shadowColor = R.pal.accent; ctx.shadowBlur = R.S * 20;
    for (let b = 0; b < 2; b++) {
      let x = R.W * hash(k, b, 82), y = 0;
      ctx.lineWidth = R.S * (3 - b); ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(x, y);
      while (y < R.H) { x += (hash(k, b, y) - 0.5) * R.S * 90; y += R.S * (30 + hash(k, y, b) * 50); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  };
  O.stripes = (ctx, R) => {
    const w = R.S * 26, off = (R.t * R.S * 40) % (w * 2);
    ctx.save(); ctx.globalAlpha = 0.12 * R.amt; ctx.fillStyle = R.pal.accent;
    ctx.translate(R.W / 2, R.H / 2); ctx.rotate(-PI / 4);
    const D = Math.hypot(R.W, R.H);
    for (let x = -D + off; x < D; x += w * 2) ctx.fillRect(x, -D, w, D * 2);
    ctx.restore();
  };
  O.dots = (ctx, R) => {
    const g = R.S * 36, off = (R.t * R.S * 10) % g;
    ctx.fillStyle = R.pal.sub; ctx.globalAlpha = 0.35 * R.amt;
    for (let y = -g + off; y < R.H + g; y += g) for (let x = -g + off; x < R.W + g; x += g) { ctx.beginPath(); ctx.arc(x, y, R.S * 3, 0, PI * 2); ctx.fill(); }
  };
  O.waveLines = (ctx, R) => {
    ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 1.5;
    for (let j = 0; j < 5; j++) {
      ctx.globalAlpha = 0.25 * R.amt;
      ctx.beginPath();
      for (let x = 0; x <= R.W; x += R.S * 12) {
        const y = R.H * (0.2 + j * 0.15) + Math.sin(x * 0.006 / R.S + R.t * (1 + j * 0.3) + j) * R.S * 26 * (1 + R.beat * 0.8);
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  };
  O.geo = (ctx, R) => {
    const n = 9;
    ctx.lineWidth = R.S * 2.5;
    for (let i = 0; i < n; i++) {
      const x = hash(i, 91) * R.W + Math.sin(R.t * 0.3 + i) * R.S * 40, y = hash(i, 92) * R.H + Math.cos(R.t * 0.25 + i) * R.S * 40;
      const s = R.minD * (0.025 + hash(i, 93) * 0.05);
      ctx.save(); ctx.translate(x, y); ctx.rotate(R.t * (hash(i, 94) - 0.5) + i);
      ctx.strokeStyle = [R.pal.accent, R.pal.sub, R.pal.text][i % 3]; ctx.globalAlpha = 0.5 * R.amt;
      ctx.beginPath();
      const k = i % 3;
      if (k === 0) ctx.arc(0, 0, s, 0, PI * 2);
      else if (k === 1) ctx.rect(-s, -s, s * 2, s * 2);
      else { ctx.moveTo(0, -s); ctx.lineTo(s * 0.87, s * 0.5); ctx.lineTo(-s * 0.87, s * 0.5); ctx.closePath(); }
      ctx.stroke(); ctx.restore();
    }
  };
  O.reticle = (ctx, R) => {
    const B = R.bbox, cx = B.cx, cy = B.cy, r = Math.max(B.w, B.h) * 0.62 + R.S * 20;
    ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 1.5; ctx.globalAlpha = 0.7 * clamp(R.amt);
    const q = E.outCubic(clamp(R.lt / 0.5));
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(R.W * q, cy); ctx.moveTo(cx, R.H); ctx.lineTo(cx, R.H * (1 - q)); ctx.globalAlpha *= 0.4; ctx.stroke();
    ctx.globalAlpha = 0.7 * clamp(R.amt);
    const L = R.S * 22;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
      const x = cx + sx * (B.w / 2 + R.S * 26), y = cy + sy * (B.h / 2 + R.S * 22);
      ctx.beginPath(); ctx.moveTo(x - sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * L); ctx.stroke();
    });
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.05 + R.S * 4, 0, PI * 2); ctx.stroke();
  };
  O.dottedRing = (ctx, R) => {
    const cx = R.W / 2, cy = R.H / 2, r = R.minD * 0.42 * (1 + R.beat * 0.03);
    const n = 72; ctx.fillStyle = R.pal.accent;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + R.t * 0.15;
      ctx.globalAlpha = (0.35 + 0.35 * Math.sin(i * 0.5 + R.t * 3)) * R.amt;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, R.S * 3, 0, PI * 2); ctx.fill();
    }
  };
  O.barcode = (ctx, R) => {
    const y = R.H - R.minD * 0.12, h = R.minD * 0.05, x0 = R.W - R.minD * 0.34;
    let x = x0; const k = Math.floor(R.t * 8);
    ctx.fillStyle = R.pal.text; ctx.globalAlpha = 0.8 * clamp(R.amt);
    for (let i = 0; i < 38; i++) { const w = R.S * (1 + Math.floor(hash(i, k) * 4)); ctx.fillRect(x, y, w, h); x += w + R.S * (1 + Math.floor(hash(i, 2) * 3)); }
  };
  O.audioBars = (ctx, R) => {
    const bands = R.spec; if (!bands) return;
    const n = bands.length, bw = R.W / n;
    ctx.fillStyle = R.pal.accent; ctx.globalAlpha = 0.5 * clamp(R.amt, 0, 1.5);
    for (let i = 0; i < n; i++) { const h = bands[i] * R.H * 0.28; ctx.fillRect(i * bw + bw * 0.15, R.H - h, bw * 0.7, h); }
  };
  O.audioWave = (ctx, R) => {
    const w = R.wave; if (!w) return;
    ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 2.5; ctx.globalAlpha = 0.6 * clamp(R.amt, 0, 1.5);
    ctx.beginPath();
    for (let i = 0; i < w.length; i++) { const x = (i / (w.length - 1)) * R.W, y = R.H * 0.82 + w[i] * R.H * 0.12; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  };
  O.filmScratch = (ctx, R) => {
    const k = Math.floor(R.t * 24);
    ctx.strokeStyle = R.pal.text; ctx.lineWidth = R.S;
    for (let i = 0; i < 3; i++) {
      if (hash(k, i, 101) < 0.45) continue;
      const x = hash(k, i, 102) * R.W; ctx.globalAlpha = 0.25 * R.amt;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (hash(k, i, 103) - 0.5) * R.S * 20, R.H); ctx.stroke();
    }
    ctx.fillStyle = R.pal.text;
    for (let i = 0; i < 10; i++) { ctx.globalAlpha = 0.3 * R.amt; ctx.beginPath(); ctx.arc(hash(k, i, 104) * R.W, hash(k, i, 105) * R.H, R.S * hash(k, i, 106) * 3, 0, PI * 2); ctx.fill(); }
  };
  let paperTile = null;
  O.paper = (ctx, R) => {
    if (!paperTile) {
      paperTile = document.createElement('canvas'); paperTile.width = paperTile.height = 256;
      const c = paperTile.getContext('2d'), id = c.createImageData(256, 256);
      for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (hash(i, 7) - 0.5) * 90 + Math.sin(i * 0.013) * 6; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
      c.putImageData(id, 0, 0);
    }
    ctx.globalAlpha = 0.18 * R.amt; ctx.globalCompositeOperation = 'overlay';
    const pat = ctx.createPattern(paperTile, 'repeat'); ctx.fillStyle = pat;
    ctx.save(); ctx.scale(R.S * 1.5, R.S * 1.5); ctx.fillRect(0, 0, R.W / (R.S * 1.5), R.H / (R.S * 1.5)); ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  };
  O.flash = (ctx, R) => {
    const a = Math.max(0, 1 - R.lt / 0.22);
    const b = R.beatFlash ? R.beat * 0.25 : 0;
    const v = Math.max(a * a * 0.85, b) * clamp(R.amt, 0, 1.2);
    if (v <= 0.01) return;
    ctx.globalAlpha = v; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, R.W, R.H);
  };
  O.filmBurn = (ctx, R) => {
    const e = Math.max(0, 1 - R.lt / 0.45), x = R.xp;
    const v = Math.max(e, x); if (v <= 0.01) return;
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(R.W * 0.8, R.H * 0.3, 0, R.W * 0.8, R.H * 0.3, R.minD * (0.4 + v));
    g.addColorStop(0, rgba('#fff1c1', v)); g.addColorStop(0.4, rgba('#ff7a1a', v * 0.8)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H);
    ctx.globalCompositeOperation = 'source-over';
  };
  O.letterbox = (ctx, R) => {
    const target = R.W / 2.39; let bar = (R.H - target) / 2; bar = bar > R.H * 0.02 ? Math.min(bar, R.H * 0.12) : R.H * 0.06;
    ctx.globalAlpha = 1; ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, R.W, bar); ctx.fillRect(0, R.H - bar, R.W, bar);
  };

  return { list, cats, O };
})();
