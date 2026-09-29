/* ボカロPV pack: fast-cut kinetic type and HUD / glitch visuals typical of Vocaloid music videos,
 * plus ideas from classic kinetic-typography films (90° camera rolls, stepped zooms, strobing type).
 * motions (enter / hold / exit), background motions, background effects and screen effects. */
'use strict';
(() => {
  const { clamp, lerp, hash, mix } = LM.U;
  const E = LM.E, M = LM.motion, BG = LM.bgm.lib, FX = LM.fx, D = LM.data;
  const PI = Math.PI, TAU = PI * 2;
  const A = (p, k = 3) => Math.min(1, p * k);
  const wrap = (v, m) => ((v % m) + m) % m;
  const KANA = Array.from('アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン０１２３４５６７８９♪♯＃＊＋－×÷＝！？□■△▲○●◇◆');

  /* ================= motions ================= */
  const STEP = [5.2, 2.6, 1.55, 1];
  Object.assign(M.enter, {
    rollIn90: { n: 'ボカロ：90°ロールイン', c: 'ボカロ', d: 0.6, st: 0, u: 'a', f: (p, g, c) => { const q = E.outExpo(p); const T = M.grot({}, g, c, -(1 - q) * PI / 2); M.gsc(T, g, c, lerp(1.6, 1, q)); T.a = A(p, 6); return T; } },
    stepZoom: { n: 'ボカロ：段階ズーム（コマ落ち）', c: 'ボカロ', d: 0.42, st: 0, u: 'a', f: (p, g, c) => { const s = STEP[Math.min(3, Math.floor(p * 4))]; const T = M.gsc({}, g, c, s); if (p < 0.02) T.a = 0; return T; } },
    flashIn: { n: 'ボカロ：反転フラッシュで確定', c: 'ボカロ', d: 0.45, st: 0.3, u: 'g', f: (p, g) => {
      if (p >= 1) return {};
      const k = Math.floor(p * 12), on = k % 2 === 0;
      return { a: p < 0.08 ? 0 : on ? 1 : 0.3, accent: on, bright: on ? 0.35 : 0, x: (hash(g.i, k) - 0.5) * g.size * 0.25 * (1 - p), sx: on ? 1.08 : 1, sy: on ? 1.08 : 1 };
    } },
    rgbIn: { n: 'ボカロ：RGBずれから結像', c: 'ボカロ', d: 0.55, st: 0.25, u: 'g', f: (p, g) => { const q = E.outExpo(p); return { rgb: (1 - q) * g.size * 0.35, x: (hash(g.i, Math.floor(p * 20)) - 0.5) * g.size * 0.45 * (1 - q), a: A(p, 5) }; } },
    coverWipe: { n: 'ボカロ：帯が走り抜けて文字が現れる', c: 'ボカロ', d: 0.55, st: 0.55, u: 'g', f: (p) => ({ boxA: clamp((p - 0.5) / 0.5), boxB: clamp(p / 0.5), a: p < 0.5 ? 0 : 1 }) },
    noiseIn: { n: 'ボカロ：砂嵐から結像', c: 'ボカロ', d: 0.6, st: 0.2, u: 'w', f: (p, g) => { const q = E.outCubic(p); return { erode: (1 - q) * 0.9, slice: (1 - q) * 1.2, rgb: (1 - q) * g.size * 0.12, a: A(p, 6) }; } },
  });
  Object.assign(M.hold, {
    rgbJitter: { n: 'ボカロ：RGBずれ（ビート）', c: 'ボカロ', f: (ht, g, c) => { const k = Math.floor((c.tAbs || ht) * 12); return { rgb: (0.035 + c.beat * 0.22) * g.size * c.amp, x: c.beat > 0.75 ? (hash(g.i, k) - 0.5) * g.size * 0.12 * c.amp : 0 }; } },
    shakeStep: { n: 'ボカロ：コマ打ちガタガタ', c: 'ボカロ', f: (ht, g, c) => { const k = Math.floor((c.tAbs || ht) * 12), a = c.amp * (0.6 + c.beat * 0.8); return { x: (hash(g.i, k) - 0.5) * g.size * 0.09 * a, y: (hash(g.i, k, 2) - 0.5) * g.size * 0.09 * a, rot: (hash(g.i, k, 3) - 0.5) * 0.14 * a }; } },
    tiltStep: { n: 'ボカロ：ビートで傾きが切り替わる', c: 'ボカロ', f: (ht, g, c) => { const k = Math.floor((c.tAbs || ht) * 2 * (c.tempo || 1)); return M.grot({}, g, c, (hash(k, 9, c.seed || 0) - 0.5) * 0.2 * c.amp); } },
    beatInvert: { n: 'ボカロ：ビートで色が反転', c: 'ボカロ', f: (ht, g, c) => (c.beat > 0.55 ? { accent: true, bright: 0.15 } : {}) },
    boxLabel: { n: 'ボカロ：帯テロップに乗せる', c: 'ボカロ', f: () => ({ boxBg: 1 }) },
    boxBeat: { n: 'ボカロ：ビートで帯が反転', c: 'ボカロ', f: (ht, g, c) => (c.beat > 0.5 ? { boxBg: 1 } : {}) },
  });
  Object.assign(M.exit, {
    rollOut90: { n: 'ボカロ：90°ロールアウト', c: 'ボカロ', d: 0.5, st: 0, u: 'a', f: (p, g, c) => { const q = E.inExpo(p); const T = M.grot({}, g, c, q * PI / 2); M.gsc(T, g, c, lerp(1, 0.55, q)); T.a = 1 - E.inQuad(p); return T; } },
    stepZoomOut: { n: 'ボカロ：段階ズームで手前へ', c: 'ボカロ', d: 0.4, st: 0, u: 'a', f: (p, g, c) => { const s = STEP[3 - Math.min(3, Math.floor(p * 4))]; const T = M.gsc({}, g, c, s); if (p > 0.97) T.a = 0; return T; } },
    flashOut: { n: 'ボカロ：反転フラッシュで消える', c: 'ボカロ', d: 0.4, st: 0.3, u: 'g', f: (p, g) => { const k = Math.floor(p * 12), on = k % 2 === 0; return { a: p > 0.92 ? 0 : on ? 1 : 0.25, accent: on, bright: on ? 0.35 : 0, x: (hash(g.i, k) - 0.5) * g.size * 0.25 * p }; } },
    rgbOut: { n: 'ボカロ：RGBずれで砕ける', c: 'ボカロ', d: 0.5, st: 0.25, u: 'g', f: (p, g) => { const q = E.inCubic(p); return { rgb: q * g.size * 0.45, x: (hash(g.i, Math.floor(p * 20)) - 0.5) * g.size * 0.5 * q, a: 1 - E.inQuad(p) }; } },
    coverOut: { n: 'ボカロ：帯が走って文字を消す', c: 'ボカロ', d: 0.5, st: 0.55, u: 'g', f: (p) => ({ boxA: clamp((p - 0.5) / 0.5), boxB: clamp(p / 0.5), a: p < 0.5 ? 1 : 0 }) },
    noiseOut: { n: 'ボカロ：砂嵐に消える', c: 'ボカロ', d: 0.55, st: 0.2, u: 'w', f: (p, g) => { const q = E.inCubic(p); return { erode: q * 1.05, slice: q * 1.3, rgb: q * g.size * 0.15, a: 1 - E.inQuint(p) }; } },
  });

  /* ================= background motions ================= */
  const def = (id, n, c, f, full, extra) => (BG[id] = Object.assign({ n, c, f, full: !!full }, extra || {}));
  def('hudRings', 'HUDリング（回転する円環UI）', 'デジタル', (ctx, R) => {
    const cx = R.W / 2, cy = R.H / 2, r0 = R.minD * 0.16, b = R.beat;
    ctx.lineCap = 'butt';
    for (let i = 0; i < 6; i++) {
      const r = r0 * (1 + i * 0.55) * (1 + b * 0.03 * (i % 2 ? 1 : -1)), sp = (i % 2 ? -1 : 1) * (0.25 + i * 0.12), seg = 3 + (i * 5) % 7;
      ctx.strokeStyle = i % 3 === 0 ? R.pal.accent : R.pal.sub; ctx.globalAlpha = 0.28 + 0.2 * (i % 2) + b * 0.15;
      ctx.lineWidth = R.S * (i % 2 ? 2 : 6 + (i === 2 ? 6 : 0));
      for (let k = 0; k < seg; k++) { const a0 = R.t * sp + (k / seg) * TAU, len = (TAU / seg) * (0.35 + 0.4 * hash(i, k)); ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + len); ctx.stroke(); }
      if (i === 3) { ctx.lineWidth = R.S * 1.5; const n = 72; for (let k = 0; k < n; k++) { const a = k / n * TAU - R.t * 0.2, l = k % 6 ? 6 : 14; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.lineTo(cx + Math.cos(a) * (r + l * R.S), cy + Math.sin(a) * (r + l * R.S)); ctx.stroke(); } }
    }
    ctx.globalAlpha = 0.5; ctx.fillStyle = R.pal.accent; ctx.font = `700 ${(R.S * 12).toFixed(1)}px monospace`; ctx.textAlign = 'center';
    ctx.fillText(String(Math.floor(R.t * 100) % 10000).padStart(4, '0'), cx, cy + r0 * 3.9);
  });
  def('focusLines', '集中線（ビートで脈動）', 'アニメ', (ctx, R) => {
    const n = 120, cx = R.W / 2, cy = R.H / 2, rr = Math.hypot(R.W, R.H) * 0.62, k = Math.floor(R.t * 12);
    ctx.fillStyle = R.pal.text;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (hash(i, k) - 0.5) * 0.04, inner = rr * (0.3 + hash(i, k, 2) * 0.35 - R.beat * 0.12), w = 0.003 + hash(i, k, 3) * 0.01;
      ctx.globalAlpha = (0.25 + hash(i, 5) * 0.35) * Math.min(1, R.amt);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner); ctx.lineTo(cx + Math.cos(a - w) * rr, cy + Math.sin(a - w) * rr); ctx.lineTo(cx + Math.cos(a + w) * rr, cy + Math.sin(a + w) * rr); ctx.fill();
    }
  });
  def('charMatrix', '文字タイルの明滅（カタカナ・記号）', 'デジタル', (ctx, R) => {
    const cols = R.W > R.H ? 16 : 9, s = R.W / cols, rows = Math.ceil(R.H / s), k = Math.floor(R.t * 8), src = (R.text || '').replace(/\s/g, '');
    const chars = src.length > 3 ? Array.from(src).concat(KANA.slice(0, 20)) : KANA;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${(s * 0.62).toFixed(1)}px "Noto Sans JP",sans-serif`;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const h = hash(x, y, k + Math.floor(R.beat * 3)); if (h < 0.55) continue;
      const inv = h > 0.93, ch = chars[Math.floor(hash(x, y, k, 3) * chars.length)];
      if (inv) { ctx.globalAlpha = 0.55; ctx.fillStyle = R.pal.accent; ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2); }
      ctx.globalAlpha = inv ? 0.9 : 0.1 + (h - 0.55) * 0.5; ctx.fillStyle = inv ? R.pal.bg : R.pal.sub; ctx.fillText(ch, x * s + s / 2, y * s + s / 2);
    }
  });
  def('shapeBurst', '図形の連打（ビートで三角・円・四角）', '図形', (ctx, R) => {
    const k = Math.floor(R.t * (R.bpm / 60) * 2), n = 7;
    for (let j = 0; j < 2; j++) {
      const kk = k - j, life = clamp(R.t * (R.bpm / 60) * 2 - kk), fade = 1 - life;
      for (let i = 0; i < n; i++) {
        const x = hash(kk, i, 1) * R.W, y = hash(kk, i, 2) * R.H, sz = R.minD * (0.05 + hash(kk, i, 3) * 0.18) * (1 + E.outCubic(life) * 0.4), kind = Math.floor(hash(kk, i, 4) * 4);
        ctx.save(); ctx.translate(x, y); ctx.rotate(hash(kk, i, 5) * TAU + life * 0.6); ctx.globalAlpha = fade * 0.6 * Math.min(1, R.amt);
        const fill = hash(kk, i, 6) > 0.5; ctx.fillStyle = ctx.strokeStyle = i % 3 ? R.pal.sub : R.pal.accent; ctx.lineWidth = R.S * 5;
        ctx.beginPath();
        if (kind === 0) ctx.arc(0, 0, sz / 2, 0, TAU); else if (kind === 1) ctx.rect(-sz / 2, -sz / 2, sz, sz); else if (kind === 2) { ctx.moveTo(0, -sz / 2); ctx.lineTo(sz / 2, sz / 2.4); ctx.lineTo(-sz / 2, sz / 2.4); ctx.closePath(); } else { ctx.moveTo(-sz / 2, 0); ctx.lineTo(sz / 2, 0); ctx.moveTo(0, -sz / 2); ctx.lineTo(0, sz / 2); }
        fill && kind < 3 ? ctx.fill() : ctx.stroke(); ctx.restore();
      }
    }
  });
  def('scope', 'オシロスコープ波形（音に反応）', 'デジタル', (ctx, R) => {
    const n = 160, y0 = R.H / 2, amp = R.H * 0.22 * (0.5 + R.amt * 0.5), w = R.wave, sp = R.spec;
    for (let L = 0; L < 3; L++) {
      ctx.beginPath(); ctx.strokeStyle = L === 0 ? R.pal.accent : R.pal.sub; ctx.globalAlpha = L === 0 ? 0.75 : 0.25; ctx.lineWidth = R.S * (L === 0 ? 3 : 1.5);
      for (let i = 0; i <= n; i++) {
        const x = (i / n) * R.W, u = i / n;
        let v = w && w.length ? w[Math.floor(u * (w.length - 1))] : sp && sp.length ? (sp[Math.floor(u * (sp.length - 1))] - 0.3) * Math.sin(i * 0.9 + R.t * 20) : Math.sin(u * 18 + R.t * 6) * 0.4 * (0.4 + R.beat) + Math.sin(u * 51 - R.t * 11) * 0.15;
        v *= 1 - L * 0.25; const y = y0 + v * amp + (L - 1) * R.S * 10 * (L ? 1 : 0);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.15; ctx.strokeStyle = R.pal.text; ctx.lineWidth = R.S; const g = R.minD / 8;
    ctx.beginPath(); for (let x = 0; x < R.W; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, R.H); } for (let y = 0; y < R.H; y += g) { ctx.moveTo(0, y); ctx.lineTo(R.W, y); } ctx.stroke();
  }, false, { spec: true, wave: true });
  def('hazardStripe', '警告ストライプ（斜めの帯が流れる）', '模様', (ctx, R) => {
    const bandH = R.minD * 0.16, gap = R.minD * 0.07, off = wrap(R.t * R.S * 140, gap * 2);
    [[0.18, 1], [0.82, -1]].forEach(([yy, dir], j) => {
      const y = R.H * yy + Math.sin(R.t * 0.8 + j) * R.S * 6 + R.beat * R.S * 6 * (j ? -1 : 1);
      ctx.save(); ctx.beginPath(); ctx.rect(0, y - bandH / 2, R.W, bandH); ctx.clip();
      ctx.globalAlpha = 0.85 * Math.min(1, R.amt); ctx.fillStyle = R.pal.accent; ctx.fillRect(0, y - bandH / 2, R.W, bandH);
      ctx.fillStyle = R.pal.bg; ctx.globalAlpha = 0.9;
      for (let x = -gap * 2 + off * dir; x < R.W + bandH; x += gap * 2) { ctx.beginPath(); ctx.moveTo(x, y + bandH / 2); ctx.lineTo(x + gap, y + bandH / 2); ctx.lineTo(x + gap + bandH, y - bandH / 2); ctx.lineTo(x + bandH, y - bandH / 2); ctx.fill(); }
      ctx.restore();
    });
  });
  const nc = document.createElement('canvas'), nx = nc.getContext('2d');
  def('tvStatic', '砂嵐（ビートで乱れる）', 'デジタル', (ctx, R) => {
    const w = Math.max(32, Math.round(R.W / (R.S * 3))), h = Math.max(18, Math.round(R.H / (R.S * 3)));
    if (nc.width !== w || nc.height !== h) { nc.width = w; nc.height = h; }
    const img = nx.createImageData(w, h), d = img.data, k = Math.floor(R.t * 24), tint = LM.U.hex2rgb(R.pal.sub);
    for (let y = 0; y < h; y++) { const band = hash(y >> 2, k, 7) < 0.06 + R.beat * 0.12 ? 1.6 : 1; for (let x = 0; x < w; x++) { const v = Math.min(255, hash(x, y, k) * 255 * band), i = (y * w + x) * 4; d[i] = (v + tint[0]) / 2; d[i + 1] = (v + tint[1]) / 2; d[i + 2] = (v + tint[2]) / 2; d[i + 3] = 255; } }
    nx.putImageData(img, 0, 0);
    ctx.save(); ctx.fillStyle = R.pal.bg; ctx.fillRect(0, 0, R.W, R.H); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 0.35 * Math.min(1.4, R.amt) + R.beat * 0.15; ctx.drawImage(nc, 0, 0, R.W, R.H); ctx.restore();
  }, true);
  def('splitRotate', '2色の回転分割（ビートでカクッと回る）', '画面分割', (ctx, R) => {
    const k = Math.floor(R.t * (R.bpm / 60)), f = clamp((R.t * (R.bpm / 60) - k) / 0.18), a = (k + E.outExpo(f)) * PI / 4, cx = R.W / 2, cy = R.H / 2, L = Math.hypot(R.W, R.H);
    ctx.fillStyle = R.pal.bg; ctx.fillRect(0, 0, R.W, R.H);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.fillStyle = mix(R.pal.accent, R.pal.bg, 0.35); ctx.globalAlpha = 0.85; ctx.fillRect(-L, 0, L * 2, L);
    ctx.globalAlpha = 0.5; ctx.fillStyle = R.pal.sub; ctx.fillRect(-L, -R.S * 3, L * 2, R.S * 6); ctx.restore();
  }, true);

  /* ================= background effects & overlays (エフェクト：装飾) ================= */
  const F = (n, c, k) => ({ n, c, k });
  Object.assign(FX.list, {
    gridPaper: F('方眼（設計図風）', 'over', 'under'),
    glyphNoise: F('散らばる文字化け', 'over', 'under'),
    beatShapes: F('ビートで図形が弾ける', 'over', 'under'),
    hudFrame: F('HUD枠（四隅のトンボ・カウンター）', 'over', 'over'),
    warningTape: F('警告テープ（上下の帯）', 'over', 'over'),
    monoBeat: F('2階調（ビートでネガポジ反転）', 'screen', 'post'),
    quadMirror: F('4面ミラー', 'screen', 'post'),
    mosaicBeat: F('ビートでモザイク', 'screen', 'post'),
    stepFrames: F('コマ落ち（カクカク再生）', 'screen', 'post'),
    beatZoom: F('ビートでズーム', 'screen', 'post'),
    lineArt: F('線画化（輪郭抽出）', 'screen', 'post'),
  });
  const O = FX.O;
  O.gridPaper = (ctx, R) => {
    const g = R.minD / 14; ctx.strokeStyle = R.pal.text; ctx.lineWidth = Math.max(1, R.S * 0.8);
    ctx.globalAlpha = 0.1 * clamp(R.amt, 0, 2); ctx.beginPath();
    for (let x = (R.W / 2) % g; x < R.W; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, R.H); } for (let y = (R.H / 2) % g; y < R.H; y += g) { ctx.moveTo(0, y); ctx.lineTo(R.W, y); } ctx.stroke();
    ctx.globalAlpha = 0.28 * clamp(R.amt, 0, 2); ctx.lineWidth = Math.max(1, R.S * 1.6); ctx.beginPath(); ctx.moveTo(R.W / 2, 0); ctx.lineTo(R.W / 2, R.H); ctx.moveTo(0, R.H / 2); ctx.lineTo(R.W, R.H / 2); ctx.stroke();
    ctx.fillStyle = R.pal.text; ctx.font = `${(R.S * 10).toFixed(1)}px monospace`; ctx.globalAlpha = 0.35 * clamp(R.amt, 0, 2);
    for (let i = 1; i < 6; i++) ctx.fillText(String(i * 10), R.W / 2 + i * g * 2 + R.S * 3, R.H / 2 - R.S * 4);
  };
  O.glyphNoise = (ctx, R) => {
    const k = Math.floor(R.t * 10), n = Math.round(46 * clamp(R.amt, 0, 2)) + Math.round(R.beat * 20);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const s = R.minD * (0.02 + hash(i, k, 3) * 0.05); ctx.font = `700 ${s.toFixed(1)}px "Noto Sans JP",sans-serif`;
      ctx.globalAlpha = 0.15 + hash(i, k, 4) * 0.4; ctx.fillStyle = hash(i, k, 5) > 0.8 ? R.pal.accent : R.pal.text;
      ctx.fillText(KANA[Math.floor(hash(i, k, 6) * KANA.length)], hash(i, k, 1) * R.W, hash(i, k, 2) * R.H);
    }
  };
  O.beatShapes = (ctx, R) => {
    const b = R.beat; if (b < 0.25) return;
    const k = Math.floor(R.t * 4), n = 5;
    for (let i = 0; i < n; i++) {
      const x = hash(k, i, 1) * R.W, y = hash(k, i, 2) * R.H, s = R.minD * (0.04 + hash(k, i, 3) * 0.1) * (1.4 - b * 0.4);
      ctx.save(); ctx.translate(x, y); ctx.rotate(hash(k, i, 4) * TAU); ctx.globalAlpha = b * 0.7 * clamp(R.amt); ctx.strokeStyle = ctx.fillStyle = i % 2 ? R.pal.accent : R.pal.text; ctx.lineWidth = R.S * 4;
      ctx.beginPath(); const kd = i % 3; if (kd === 0) ctx.arc(0, 0, s / 2, 0, TAU); else if (kd === 1) ctx.rect(-s / 2, -s / 2, s, s); else { ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, s / 2.4); ctx.lineTo(-s / 2, s / 2.4); ctx.closePath(); }
      i % 2 ? ctx.stroke() : ctx.fill(); ctx.restore();
    }
  };
  O.hudFrame = (ctx, R) => {
    const m = R.minD * 0.05, L = R.minD * 0.07; ctx.strokeStyle = R.pal.text; ctx.fillStyle = R.pal.text; ctx.lineWidth = R.S * 2.5; ctx.globalAlpha = 0.75 * clamp(R.amt);
    [[m, m, 1, 1], [R.W - m, m, -1, 1], [R.W - m, R.H - m, -1, -1], [m, R.H - m, 1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x + sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * L); ctx.stroke(); });
    ctx.font = `700 ${(R.S * 13).toFixed(1)}px monospace`; ctx.textBaseline = 'middle';
    const tc = (s) => { const f = Math.floor((s % 1) * 30); s = Math.floor(s); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f).padStart(2, '0')}`; };
    ctx.textAlign = 'left'; ctx.fillText(tc(R.t), m + R.S * 12, m + R.S * 14);
    ctx.textAlign = 'right'; ctx.fillText(`${String(Math.round(R.bpm || 120))} BPM`, R.W - m - R.S * 12, m + R.S * 14);
    if (Math.floor(R.t * 2) % 2 === 0) { ctx.fillStyle = R.pal.accent; ctx.beginPath(); ctx.arc(R.W - m - R.S * 12, R.H - m - R.S * 14, R.S * 6, 0, TAU); ctx.fill(); }
    ctx.globalAlpha *= 0.6; ctx.fillStyle = R.pal.text; ctx.textAlign = 'left'; ctx.fillText('▶ ' + '■'.repeat(1 + (Math.floor(R.t * 4) % 8)), m + R.S * 12, R.H - m - R.S * 14);
  };
  O.warningTape = (ctx, R) => {
    const h = R.minD * 0.055, gap = h * 0.9, off = wrap(R.t * R.S * 90, gap * 2);
    [[0, 1], [R.H - h, -1]].forEach(([y, dir]) => {
      ctx.save(); ctx.globalAlpha = 0.95 * clamp(R.amt); ctx.fillStyle = R.pal.accent; ctx.fillRect(0, y, R.W, h);
      ctx.beginPath(); ctx.rect(0, y, R.W, h); ctx.clip(); ctx.fillStyle = mix(R.pal.bg, '#000000', 0.3);
      for (let x = -gap * 2 + off * dir; x < R.W + h; x += gap * 2) { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + gap, y + h); ctx.lineTo(x + gap + h, y); ctx.lineTo(x + h, y); ctx.fill(); }
      ctx.restore();
    });
  };

  /* ================= themes ================= */
  const add = (id, k, o) => { const t = D.themeById[id]; if (t) t[k] = Object.assign({}, t[k] || {}, o); };
  add('vocaloid', 'enter', { rollIn90: 1.5, stepZoom: 2, flashIn: 2, rgbIn: 2, coverWipe: 1.5, noiseIn: 1.5 });
  add('vocaloid', 'hold', { rgbJitter: 2, shakeStep: 1.5, tiltStep: 1.5, beatInvert: 1.5, boxBeat: 1 });
  add('vocaloid', 'exit', { rollOut90: 1.5, stepZoomOut: 1.5, flashOut: 2, rgbOut: 2, coverOut: 1.5, noiseOut: 1.5 });
  add('vocaloid', 'bgm', { hudRings: 2, charMatrix: 2, shapeBurst: 2, focusLines: 1.5, hazardStripe: 1, splitRotate: 1.5, tvStatic: 1, scope: 1 });
  add('vocaloid', 'filters', { gridPaper: 1, glyphNoise: 1.5, beatShapes: 1.5, hudFrame: 1, monoBeat: 1, mosaicBeat: 1, stepFrames: 1, beatZoom: 1.5 });
  add('anison', 'enter', { stepZoom: 1, flashIn: 1 }); add('anison', 'bgm', { focusLines: 1.5, shapeBurst: 1 }); add('anison', 'filters', { beatZoom: 1 });
  add('edm', 'bgm', { hudRings: 1, scope: 1 }); add('edm', 'filters', { stepFrames: 0.8, mosaicBeat: 0.8 });
  add('hiphop', 'enter', { rollIn90: 1 }); add('hiphop', 'exit', { rollOut90: 1 }); add('hiphop', 'filters', { monoBeat: 1 });
  add('rock', 'hold', { shakeStep: 1 }); add('rock', 'bgm', { tvStatic: 1 });
  add('edge', 'filters', { lineArt: 1 }); add('edge', 'bgm', { hazardStripe: 1 });
  add('thermalvj', 'filters', { mosaicBeat: 1 });
  add('showreel', 'enter', { rollIn90: 1.5, stepZoom: 1 }); add('showreel', 'exit', { rollOut90: 1 }); add('showreel', 'filters', { hudFrame: 1 });
  add('minimal', 'filters', { gridPaper: 1 });
})();
