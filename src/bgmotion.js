/* Background motion library — animated layers drawn behind the lyrics (deterministic per time) */
'use strict';
LM.bgm = (() => {
  const U = LM.U, { clamp, lerp, hash, rgba, mix, hex2rgb } = U;
  const PI = Math.PI, TAU = PI * 2;

  // smooth 2D value noise
  const h2 = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 982451653) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const sm = (t) => t * t * (3 - 2 * t);
  function noise2(x, y, s = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
    return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
  }
  const fbm = (x, y, s = 0) => noise2(x, y, s) * 0.55 + noise2(x * 2.1, y * 2.1, s + 1) * 0.3 + noise2(x * 4.3, y * 4.3, s + 2) * 0.15;

  // low-res scalar field → colorized, upscaled (cheap per-pixel effects)
  const fc = document.createElement('canvas'), fx = fc.getContext('2d');
  function field(ctx, R, fn, stops, alpha = 1, res = 110) {
    const aspect = R.W / R.H;
    const w = Math.max(16, Math.round(aspect >= 1 ? res : res * aspect)), h = Math.max(16, Math.round(aspect >= 1 ? res / aspect : res));
    if (fc.width !== w || fc.height !== h) { fc.width = w; fc.height = h; }
    const img = fx.createImageData(w, h), d = img.data;
    const cs = stops.map((s) => [s[0], hex2rgb(s[1]), s[2] == null ? 1 : s[2]]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = clamp(fn(x / w, y / h, aspect));
      let k = 0; while (k < cs.length - 2 && v > cs[k + 1][0]) k++;
      const A = cs[k], B = cs[k + 1], t = clamp((v - A[0]) / Math.max(1e-6, B[0] - A[0]));
      const i = (y * w + x) * 4;
      d[i] = lerp(A[1][0], B[1][0], t); d[i + 1] = lerp(A[1][1], B[1][1], t); d[i + 2] = lerp(A[1][2], B[1][2], t); d[i + 3] = 255 * lerp(A[2], B[2], t);
    }
    fx.putImageData(img, 0, 0);
    ctx.save(); ctx.globalAlpha *= alpha; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fc, 0, 0, R.W, R.H); ctx.restore();
  }
  const dot = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(1.1, r), 0, TAU); ctx.fill(); };
  const wrap = (v, m) => ((v % m) + m) % m;

  // B = {n, c(category), full(bool: covers whole frame), f(ctx,R)} ; R.t is already speed-scaled, R.amt intensity
  const B = {};
  const def = (id, n, c, f, full) => (B[id] = { n, c, f, full: !!full });

  /* ---------- particles ---------- */
  def('particles', '浮遊する粒子', '粒子', (ctx, R) => {
    const n = Math.round(70 * R.amt);
    for (let i = 0; i < n; i++) {
      const x = wrap(hash(i, 1) * R.W + Math.sin(R.t * 0.3 + i) * R.S * 30 + R.t * R.S * 8 * (hash(i, 6) - 0.5), R.W), y = wrap(hash(i, 2) * R.H - R.t * R.S * (10 + hash(i, 3) * 30), R.H);
      ctx.globalAlpha = 0.2 + 0.5 * hash(i, 4); ctx.fillStyle = i % 4 ? R.pal.text : R.pal.accent;
      dot(ctx, x, y, R.S * (1.5 + hash(i, 5) * 4) * (1 + R.beat * 0.3));
    }
  });
  def('fireflies', 'ホタル', '粒子', (ctx, R) => {
    const n = Math.round(36 * R.amt);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const x = (0.05 + 0.9 * noise2(R.t * 0.15, i * 3.1, 7)) * R.W, y = (0.05 + 0.9 * noise2(i * 2.3, R.t * 0.12, 8)) * R.H;
      const tw = 0.5 + 0.5 * Math.sin(R.t * (1.5 + hash(i, 9) * 2) + i * 5);
      const r = R.S * (18 + hash(i, 10) * 16);
      ctx.fillStyle = rgba('#fffbe0', 0.9 * tw); dot(ctx, x, y, R.S * 2.5);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(mix(R.pal.accent, '#fff7b0', 0.5), 0.9 * tw)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; dot(ctx, x, y, r);
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  def('bubbles', '泡', '水', (ctx, R) => {
    const n = Math.round(40 * R.amt);
    ctx.lineWidth = R.S * 1.5;
    for (let i = 0; i < n; i++) {
      const sp = 0.05 + hash(i, 1) * 0.12, r = R.S * (4 + hash(i, 2) * 22);
      const y = R.H + r - wrap(R.t * sp + hash(i, 3), 1) * (R.H + r * 2);
      const x = hash(i, 4) * R.W + Math.sin(R.t * 1.5 + i) * R.S * 14;
      ctx.globalAlpha = 0.45; ctx.strokeStyle = R.pal.text; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff'; dot(ctx, x - r * 0.35, y - r * 0.35, r * 0.18);
    }
  });
  def('embers', '火の粉', '炎', (ctx, R) => {
    const n = Math.round(80 * R.amt);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const life = wrap(R.t * (0.18 + hash(i, 1) * 0.25) + hash(i, 2), 1);
      const x = hash(i, 3) * R.W + Math.sin(life * 8 + i) * R.S * 30 + life * R.S * 60 * (hash(i, 5) - 0.3);
      const y = R.H * (1.02 - life * 1.1);
      ctx.globalAlpha = (1 - life) * 0.9; ctx.fillStyle = life < 0.4 ? '#ffe08a' : life < 0.7 ? '#ff8a2a' : '#d6361e';
      dot(ctx, x, y, R.S * (1.2 + hash(i, 4) * 2.5) * (1 - life * 0.5));
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  def('snow', '雪', '天気', (ctx, R) => {
    const n = Math.round(120 * R.amt); ctx.fillStyle = '#ffffff';
    for (let i = 0; i < n; i++) {
      const z = 0.3 + hash(i, 1) * 0.7;
      const y = wrap(hash(i, 2) + R.t * 0.05 * z, 1) * (R.H + 20) - 10;
      const x = wrap(hash(i, 3) * R.W + Math.sin(R.t * 0.8 * z + i) * R.S * 30 + R.t * R.S * 10, R.W);
      ctx.globalAlpha = 0.35 + 0.55 * z; dot(ctx, x, y, R.S * (1 + z * 4));
    }
  });
  def('blizzard', '吹雪', '天気', (ctx, R) => {
    const n = Math.round(220 * R.amt); ctx.fillStyle = '#ffffff';
    for (let i = 0; i < n; i++) {
      const z = 0.3 + hash(i, 1) * 0.7;
      const x = wrap(hash(i, 3) + R.t * 0.35 * z, 1) * (R.W + 40) - 20, y = wrap(hash(i, 2) + R.t * 0.12 * z + Math.sin(R.t + i) * 0.01, 1) * R.H;
      ctx.globalAlpha = 0.3 + 0.6 * z; ctx.fillRect(x, y, R.S * (2 + z * 8), R.S * (1 + z * 2));
    }
  });
  def('rain', '雨', '天気', (ctx, R) => {
    const n = Math.round(160 * R.amt); ctx.strokeStyle = mix(R.pal.text, R.pal.bg, 0.3); ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const z = 0.3 + hash(i, 1) * 0.7, len = R.S * (18 + z * 45);
      const y = wrap(hash(i, 2) + R.t * (1 + z * 0.8), 1) * (R.H + len) - len;
      const x = hash(i, 3) * R.W * 1.1 - y * 0.12;
      ctx.globalAlpha = 0.12 + 0.3 * z; ctx.lineWidth = R.S * (0.8 + z);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * 0.12, y + len); ctx.stroke();
    }
  });
  def('rainSplash', '雨と水しぶき', '天気', (ctx, R) => {
    B.rain.f(ctx, R);
    const n = Math.round(26 * R.amt); ctx.strokeStyle = R.pal.text; ctx.lineWidth = R.S * 1.2;
    for (let i = 0; i < n; i++) {
      const per = 0.6 + hash(i, 1) * 0.6, ph = wrap(R.t / per + hash(i, 2), 1), k = Math.floor(R.t / per + hash(i, 2));
      const x = hash(i, k, 3) * R.W, y = R.H * (0.78 + hash(i, k, 4) * 0.2);
      ctx.globalAlpha = (1 - ph) * 0.6;
      ctx.beginPath(); ctx.ellipse(x, y, R.S * 30 * ph, R.S * 8 * ph, 0, 0, TAU); ctx.stroke();
    }
  });
  def('waterDrops', 'ガラスの水滴', '水', (ctx, R) => {
    const n = Math.round(45 * R.amt);
    for (let i = 0; i < n; i++) {
      const r = R.S * (4 + hash(i, 1) * 16);
      const slide = hash(i, 2) > 0.6;
      const y0 = hash(i, 3) * R.H, y = slide ? wrap(y0 + R.t * R.S * (20 + hash(i, 4) * 60), R.H + r * 4) - r * 2 : y0;
      const x = hash(i, 5) * R.W + (slide ? Math.sin(R.t + i) * R.S * 3 : 0);
      if (slide) { ctx.globalAlpha = 0.18; ctx.fillStyle = R.pal.text; ctx.fillRect(x - r * 0.25, y - r * 6, r * 0.5, r * 6); }
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.35, rgba(R.pal.text, 0.12)); g.addColorStop(1, rgba(mix(R.pal.bg, '#000', 0.4), 0.45));
      ctx.globalAlpha = 0.85; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r * 0.85, r, 0, 0, TAU); ctx.fill();
    }
  });
  def('ripples', '水面の波紋', '水', (ctx, R) => {
    const n = Math.round(10 * R.amt) + 2; ctx.strokeStyle = R.pal.text;
    for (let i = 0; i < n; i++) {
      const per = 2.2 + hash(i, 1) * 2, ph = wrap(R.t / per + hash(i, 2), 1), k = Math.floor(R.t / per + hash(i, 2));
      const x = hash(i, k, 3) * R.W, y = hash(i, k, 4) * R.H;
      for (let j = 0; j < 3; j++) {
        const q = ph - j * 0.12; if (q <= 0) continue;
        ctx.globalAlpha = (1 - q) * 0.45; ctx.lineWidth = R.S * 2 * (1 - q);
        ctx.beginPath(); ctx.ellipse(x, y, q * R.minD * 0.35, q * R.minD * 0.35 * 0.5, 0, 0, TAU); ctx.stroke();
      }
    }
  });
  def('petals', '花びら', '自然', (ctx, R) => {
    const n = Math.round(45 * R.amt);
    for (let i = 0; i < n; i++) {
      const z = 0.4 + hash(i, 1) * 0.6;
      const y = wrap(hash(i, 2) + R.t * 0.07 * z, 1) * (R.H + 40) - 20, x = wrap(hash(i, 3) + R.t * 0.04 * z, 1) * (R.W + 40) - 20 + Math.sin(R.t * 1.4 + i) * R.S * 30;
      const s = R.S * (6 + z * 9);
      ctx.save(); ctx.translate(x, y); ctx.rotate(R.t * (1 + hash(i, 4)) + i); ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(R.t * 2 + i)));
      ctx.globalAlpha = 0.85; ctx.fillStyle = i % 3 ? mix(R.pal.accent, '#ffd6e3', 0.55) : '#ffe4ec';
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.6, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  });
  def('leaves', '舞う葉', '自然', (ctx, R) => {
    const n = Math.round(30 * R.amt); const cols = ['#d98b2b', '#b5452a', '#8a9a3a', '#e3b341'];
    for (let i = 0; i < n; i++) {
      const y = wrap(hash(i, 2) + R.t * 0.08, 1) * (R.H + 60) - 30, x = wrap(hash(i, 3) - R.t * 0.05, 1) * (R.W + 60) - 30 + Math.sin(R.t * 1.2 + i) * R.S * 40;
      const s = R.S * (10 + hash(i, 1) * 10);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(R.t * 1.5 + i) * 1.5 + i); ctx.scale(1, Math.cos(R.t * 2 + i));
      ctx.globalAlpha = 0.85; ctx.fillStyle = cols[i % 4];
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.6, s, 0); ctx.quadraticCurveTo(0, s * 0.6, -s, 0); ctx.fill(); ctx.restore();
    }
  });
  def('confetti', '紙吹雪（常時）', '粒子', (ctx, R) => {
    const n = Math.round(80 * R.amt), cols = [R.pal.accent, R.pal.sub, R.pal.text, '#ffd23f'];
    for (let i = 0; i < n; i++) {
      const y = wrap(hash(i, 2) + R.t * (0.08 + hash(i, 1) * 0.1), 1) * (R.H + 30) - 15, x = hash(i, 3) * R.W + Math.sin(R.t * 2 + i) * R.S * 24;
      ctx.save(); ctx.translate(x, y); ctx.rotate(R.t * 3 + i); ctx.scale(1, Math.cos(R.t * 5 + i));
      ctx.fillStyle = cols[i % 4]; ctx.fillRect(-R.S * 6, -R.S * 3, R.S * 12, R.S * 6); ctx.restore();
    }
  });
  def('stars', '瞬く星空', '宇宙', (ctx, R) => {
    const n = Math.round(160 * R.amt);
    for (let i = 0; i < n; i++) {
      const tw = 0.5 + 0.5 * Math.sin(R.t * (1 + hash(i, 3) * 3) + i);
      ctx.globalAlpha = 0.15 + 0.8 * tw * hash(i, 4); ctx.fillStyle = i % 9 === 0 ? R.pal.accent : '#ffffff';
      dot(ctx, hash(i, 1) * R.W, hash(i, 2) * R.H, R.S * (0.6 + hash(i, 5) * 1.8));
    }
  });
  def('warp', 'ワープ（星が迫る）', '宇宙', (ctx, R) => {
    const n = Math.round(180 * R.amt), cx = R.W / 2, cy = R.H / 2, D = Math.hypot(R.W, R.H) / 2;
    ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = hash(i, 1) * TAU, z = wrap(hash(i, 2) + R.t * (0.25 + R.beat * 0.2), 1);
      const r0 = Math.pow(z, 2.4) * D, r1 = Math.pow(Math.min(1, z + 0.04), 2.4) * D;
      ctx.globalAlpha = z * 0.9; ctx.lineWidth = R.S * (0.5 + z * 2.5);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
    }
  });
  def('meteors', '流れ星', '宇宙', (ctx, R) => {
    B.stars.f(ctx, Object.assign({}, R, { amt: R.amt * 0.5 }));
    const n = Math.round(6 * R.amt) + 1; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const per = 1.5 + hash(i, 1) * 2.5, ph = wrap(R.t / per + hash(i, 2), 1), k = Math.floor(R.t / per + hash(i, 2));
      if (ph > 0.35) continue;
      const q = ph / 0.35, x0 = hash(i, k, 3) * R.W * 1.2, y0 = hash(i, k, 4) * R.H * 0.5;
      const x = x0 - q * R.W * 0.4, y = y0 + q * R.W * 0.2, L = R.S * 160;
      const g = ctx.createLinearGradient(x, y, x + L, y - L * 0.5); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = R.S * 2.2; ctx.globalAlpha = 1 - q;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + L, y - L * 0.5); ctx.stroke();
    }
  });
  def('galaxy', '銀河の渦', '宇宙', (ctx, R) => {
    const n = Math.round(600 * R.amt), cx = R.W / 2, cy = R.H / 2;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const r = Math.pow(hash(i, 1), 0.6) * R.minD * 0.62, arm = (i % 3) * TAU / 3;
      const a = arm + r / (R.minD * 0.12) + R.t * 0.12 * (1 - r / R.minD) + (hash(i, 2) - 0.5) * 0.5;
      ctx.globalAlpha = 0.5 * (1 - r / (R.minD * 0.7)); ctx.fillStyle = i % 5 ? R.pal.text : R.pal.accent;
      dot(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.55, R.S * (0.6 + hash(i, 3) * 1.5));
    }
    ctx.globalCompositeOperation = 'source-over';
  });

  /* ---------- shapes ---------- */
  def('floatShapes', '浮遊する図形', '図形', (ctx, R) => {
    const n = Math.round(14 * R.amt) + 3; ctx.lineWidth = R.S * 3;
    for (let i = 0; i < n; i++) {
      const x = wrap(hash(i, 1) * R.W + R.t * R.S * 12 * (hash(i, 7) - 0.5) * 3, R.W), y = wrap(hash(i, 2) * R.H - R.t * R.S * 16, R.H);
      const s = R.minD * (0.02 + hash(i, 3) * 0.06) * (1 + R.beat * 0.15);
      ctx.save(); ctx.translate(x, y); ctx.rotate(R.t * (hash(i, 4) - 0.5) * 1.5 + i);
      const col = [R.pal.accent, R.pal.sub, R.pal.text][i % 3]; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.globalAlpha = 0.55;
      const k = i % 5; ctx.beginPath();
      if (k === 0) ctx.arc(0, 0, s, 0, TAU); else if (k === 1) ctx.rect(-s, -s, s * 2, s * 2);
      else if (k === 2) { ctx.moveTo(0, -s); ctx.lineTo(s * 0.87, s * 0.5); ctx.lineTo(-s * 0.87, s * 0.5); ctx.closePath(); }
      else if (k === 3) { ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, s); }
      else { for (let j = 0; j < 6; j++) { const a = j / 6 * TAU; ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); } ctx.closePath(); }
      i % 4 === 0 ? ctx.fill() : ctx.stroke(); ctx.restore();
    }
  });
  def('pulseRings', 'パルスリング', '図形', (ctx, R) => {
    const cx = R.W / 2, cy = R.H / 2, D = Math.hypot(R.W, R.H) / 2; ctx.strokeStyle = R.pal.accent;
    for (let j = 0; j < 8; j++) { const q = wrap(R.t * 0.25 + j / 8, 1); ctx.globalAlpha = (1 - q) * 0.5; ctx.lineWidth = R.S * (1 + 6 * (1 - q)) * (1 + R.beat); ctx.beginPath(); ctx.arc(cx, cy, q * D, 0, TAU); ctx.stroke(); }
  });
  def('squareTunnel', '四角いトンネル', '図形', (ctx, R) => {
    const cx = R.W / 2, cy = R.H / 2; ctx.strokeStyle = R.pal.accent;
    for (let j = 0; j < 14; j++) {
      const z = wrap(j / 14 + R.t * 0.18, 1), s = Math.pow(z, 2.2) * Math.max(R.W, R.H) * 1.1;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(z * 0.8 + R.t * 0.1); ctx.globalAlpha = z * 0.6; ctx.lineWidth = R.S * (1 + z * 5); ctx.strokeRect(-s / 2, -s / 2, s, s); ctx.restore();
    }
  });
  def('triTunnel', '三角トンネル', '図形', (ctx, R) => {
    const cx = R.W / 2, cy = R.H / 2;
    for (let j = 0; j < 12; j++) {
      const z = wrap(j / 12 + R.t * 0.2, 1), s = Math.pow(z, 2) * Math.max(R.W, R.H) * 1.2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-z * 1.2); ctx.globalAlpha = z * 0.7; ctx.strokeStyle = j % 2 ? R.pal.accent : R.pal.sub; ctx.lineWidth = R.S * (1 + z * 6);
      ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = -PI / 2 + k * TAU / 3; ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); } ctx.closePath(); ctx.stroke(); ctx.restore();
    }
  });
  def('orbitDots', '周回するドット', '図形', (ctx, R) => {
    const cx = R.W / 2, cy = R.H / 2;
    for (let r = 1; r <= 5; r++) {
      const rad = R.minD * 0.09 * r, n = 6 + r * 4;
      ctx.fillStyle = r % 2 ? R.pal.accent : R.pal.sub;
      for (let i = 0; i < n; i++) { const a = i / n * TAU + R.t * (r % 2 ? 0.3 : -0.25) / (r * 0.5); ctx.globalAlpha = 0.5; dot(ctx, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, R.S * (2 + r * 0.6) * (1 + R.beat * 0.4)); }
    }
  });
  def('hexPulse', 'ハニカムの明滅', '図形', (ctx, R) => {
    const s = R.minD / 14, hh = s * Math.sqrt(3); ctx.lineWidth = R.S * 1.5;
    for (let row = -1; row < R.H / hh + 1; row++) for (let col = -1; col < R.W / (s * 1.5) + 1; col++) {
      const x = col * s * 1.5, y = row * hh + (col % 2 ? hh / 2 : 0);
      const v = 0.5 + 0.5 * Math.sin(R.t * 2 - Math.hypot(x - R.W / 2, y - R.H / 2) / (R.minD * 0.12));
      ctx.globalAlpha = 0.08 + 0.35 * v * v; ctx.strokeStyle = R.pal.accent; ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; ctx.lineTo(x + Math.cos(a) * s * 0.92, y + Math.sin(a) * s * 0.92); }
      ctx.closePath(); ctx.stroke();
    }
  });
  def('bouncingBalls', '跳ねるボール', '図形', (ctx, R) => {
    const n = Math.round(10 * R.amt) + 3;
    for (let i = 0; i < n; i++) {
      const r = R.minD * (0.02 + hash(i, 1) * 0.04), per = 0.7 + hash(i, 2) * 0.8;
      const ph = wrap(R.t / per + hash(i, 3), 1), y = R.H - r - Math.sin(ph * PI) * R.H * (0.3 + hash(i, 4) * 0.5);
      const x = wrap(hash(i, 5) + R.t * 0.05 * (hash(i, 6) - 0.5), 1) * R.W;
      const sq = ph < 0.08 || ph > 0.92 ? 0.75 : 1;
      ctx.globalAlpha = 0.7; ctx.fillStyle = [R.pal.accent, R.pal.sub, R.pal.text][i % 3];
      ctx.beginPath(); ctx.ellipse(x, y + (1 - sq) * r, r / sq, r * sq, 0, 0, TAU); ctx.fill();
    }
  });
  def('kaleido', '万華鏡', '図形', (ctx, R) => {
    const cx = R.W / 2, cy = R.H / 2, n = 12;
    for (let k = 0; k < n; k++) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(k / n * TAU + R.t * 0.1); if (k % 2) ctx.scale(1, -1);
      for (let j = 0; j < 5; j++) {
        const d = R.minD * (0.08 + j * 0.09) * (1 + 0.1 * Math.sin(R.t * 1.3 + j)), s = R.minD * (0.02 + 0.015 * j);
        ctx.globalAlpha = 0.45; ctx.fillStyle = [R.pal.accent, R.pal.sub, R.pal.text][j % 3];
        ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + s, s * 0.6 + Math.sin(R.t + j) * s * 0.5); ctx.lineTo(d + s * 2, 0); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  });
  def('sunburst', '回転する放射', '光', (ctx, R) => {
    const cx = R.W / 2, cy = R.H / 2, rr = Math.hypot(R.W, R.H), n = 20;
    ctx.fillStyle = R.pal.accent; ctx.globalAlpha = 0.18 + R.beat * 0.1;
    for (let i = 0; i < n; i++) { const a = R.t * 0.12 + i / n * TAU, w = PI / n; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rr, a, a + w); ctx.closePath(); ctx.fill(); }
  });

  /* ---------- patterns ---------- */
  def('stripesScroll', '流れるストライプ', '模様', (ctx, R) => {
    const w = R.S * 40, D = Math.hypot(R.W, R.H), off = wrap(R.t * R.S * 60, w * 2);
    ctx.save(); ctx.translate(R.W / 2, R.H / 2); ctx.rotate(-PI / 4); ctx.fillStyle = R.pal.accent; ctx.globalAlpha = 0.14;
    for (let x = -D + off; x < D; x += w * 2) ctx.fillRect(x, -D, w, D * 2); ctx.restore();
  });
  def('checkerScroll', '市松スクロール', '模様', (ctx, R) => {
    const s = R.minD / 8, ox = wrap(R.t * R.S * 30, s * 2), oy = wrap(R.t * R.S * 18, s * 2);
    ctx.fillStyle = R.pal.sub; ctx.globalAlpha = 0.16;
    for (let y = -s * 2 + oy; y < R.H + s; y += s) for (let x = -s * 2 + ox; x < R.W + s; x += s) if ((Math.round((x - ox) / s) + Math.round((y - oy) / s)) % 2 === 0) ctx.fillRect(x, y, s, s);
  });
  def('dotWave', 'ドットの波', '模様', (ctx, R) => {
    const g = R.minD / 24; ctx.fillStyle = R.pal.accent;
    for (let y = g / 2; y < R.H; y += g) for (let x = g / 2; x < R.W; x += g) {
      const v = 0.5 + 0.5 * Math.sin(x / (R.minD * 0.12) + y / (R.minD * 0.2) - R.t * 2.2);
      ctx.globalAlpha = 0.1 + 0.4 * v; dot(ctx, x, y, g * 0.08 + g * 0.3 * v * (1 + R.beat * 0.3));
    }
  });
  def('halftoneWave', 'ハーフトーンの波', '模様', (ctx, R) => {
    const g = R.minD / 28; ctx.fillStyle = R.pal.text;
    for (let y = g / 2; y < R.H; y += g) for (let x = g / 2; x < R.W; x += g) {
      const v = 0.5 + 0.5 * Math.sin(Math.hypot(x - R.W / 2, y - R.H / 2) / (R.minD * 0.06) - R.t * 3);
      ctx.globalAlpha = 0.22; dot(ctx, x, y, g * 0.48 * v);
    }
  });
  def('moire', 'モアレ', '模様', (ctx, R) => {
    ctx.strokeStyle = R.pal.text; ctx.lineWidth = R.S * 1.5; ctx.globalAlpha = 0.25;
    for (let k = 0; k < 2; k++) {
      const cx = R.W / 2 + Math.cos(R.t * 0.4 + k * PI) * R.minD * 0.12, cy = R.H / 2 + Math.sin(R.t * 0.3 + k * PI) * R.minD * 0.1;
      for (let r = R.S * 12; r < Math.hypot(R.W, R.H) * 0.6; r += R.S * 12) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); }
    }
  });
  def('zigzag', 'ジグザグ', '模様', (ctx, R) => {
    const s = R.minD / 16, off = wrap(R.t * R.S * 40, s * 2); ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 3; ctx.globalAlpha = 0.22;
    for (let y = -s; y < R.H + s; y += s * 1.4) { ctx.beginPath(); for (let x = -s * 2 + off, k = 0; x < R.W + s * 2; x += s, k++) ctx.lineTo(x, y + (k % 2 ? s * 0.5 : 0)); ctx.stroke(); }
  });
  def('flowLines', '流線（フローフィールド）', '模様', (ctx, R) => {
    const n = Math.round(60 * R.amt); ctx.lineWidth = R.S * 1.6;
    for (let i = 0; i < n; i++) {
      let x = hash(i, 1) * R.W, y = hash(i, 2) * R.H;
      ctx.strokeStyle = i % 3 ? R.pal.sub : R.pal.accent; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 24; k++) { const a = noise2(x / (R.minD * 0.3), y / (R.minD * 0.3) + R.t * 0.08, 3) * TAU * 2; x += Math.cos(a) * R.S * 12; y += Math.sin(a) * R.S * 12; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });

  /* ---------- lighting ---------- */
  def('spotlights', 'ステージライト', '光', (ctx, R) => {
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) {
      const x0 = R.W * (0.15 + k * 0.23), a = Math.sin(R.t * 0.7 + k * 1.7) * 0.5 + PI / 2, L = R.H * 1.3, w = 0.16;
      const g = ctx.createLinearGradient(x0, 0, x0 + Math.cos(a) * L, Math.sin(a) * L);
      const col = k % 2 ? R.pal.accent : R.pal.sub;
      g.addColorStop(0, rgba(col, 0.4 + R.beat * 0.2)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, -10); ctx.lineTo(x0 + Math.cos(a - w) * L, Math.sin(a - w) * L); ctx.lineTo(x0 + Math.cos(a + w) * L, Math.sin(a + w) * L); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  def('godRays', '天使のはしご（光芒）', '光', (ctx, R) => {
    ctx.globalCompositeOperation = 'lighter';
    const x0 = R.W * 0.75, y0 = -R.H * 0.15;
    for (let k = 0; k < 9; k++) {
      const a = PI * 0.62 + (k - 4) * 0.07 + Math.sin(R.t * 0.2 + k) * 0.02, L = Math.hypot(R.W, R.H) * 1.2, w = 0.015 + hash(k, 1) * 0.02;
      const g = ctx.createLinearGradient(x0, y0, x0 + Math.cos(a) * L, y0 + Math.sin(a) * L);
      g.addColorStop(0, rgba('#fff4d6', 0.22 * (0.6 + 0.4 * Math.sin(R.t * 0.8 + k)))); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a - w) * L, y0 + Math.sin(a - w) * L); ctx.lineTo(x0 + Math.cos(a + w) * L, y0 + Math.sin(a + w) * L); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  def('lasers', 'レーザー', '光', (ctx, R) => {
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    const a0 = (k) => (k % 2 ? -0.2 - 0.6 * (0.5 + 0.5 * Math.sin(R.t * 1.3 + k)) : -PI + 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(R.t * 1.1 + k)));
    for (let k = 0; k < 8; k++) {
      const x0 = k % 2 ? 0 : R.W, y0 = R.H * (0.85 + hash(k, 1) * 0.15), a = (k % 2 ? -1 : -PI + 1) * 0 + (k % 2 ? -0.2 - 0.6 * (0.5 + 0.5 * Math.sin(R.t * 1.3 + k)) : -PI + 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(R.t * 1.1 + k)));
      const L = Math.hypot(R.W, R.H), col = k % 3 ? R.pal.accent : R.pal.sub;
      ctx.strokeStyle = col;
      [[R.S * 14, 0.12], [R.S * 6, 0.25], [R.S * 2.2, 0.8]].forEach(([w, a]) => { ctx.globalAlpha = a * (0.6 + R.beat * 0.4); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a0(k)) * L, y0 + Math.sin(a0(k)) * L); ctx.stroke(); });
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  def('lightSweep', '光が横切る', '光', (ctx, R) => {
    const ph = wrap(R.t * 0.3, 1.6) - 0.3, x = ph * R.W, w = R.W * 0.25;
    ctx.save(); ctx.translate(x, R.H / 2); ctx.rotate(0.35);
    const g = ctx.createLinearGradient(-w, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-w, -R.H * 1.5, w * 2, R.H * 3); ctx.restore();
  });
  def('neonTubes', 'ネオン管フレーム', '光', (ctx, R) => {
    const m = R.minD * 0.05, fl = hash(Math.floor(R.t * 10), 3) > 0.93 ? 0.3 : 1;
    ctx.lineJoin = 'round';
    [[R.pal.accent, m, 0], [R.pal.sub, m * 1.6, 1]].forEach(([col, mm, k]) => {
      const r = R.S * 30; const x = mm, y = mm, w = R.W - mm * 2, h = R.H - mm * 2;
      const path = () => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); };
      [[R.S * 22, 0.12, col], [R.S * 10, 0.3, col], [R.S * 4, 1, col], [R.S * 1.5, 1, mix(col, '#ffffff', 0.7)]].forEach(([lw, a, cc]) => { ctx.strokeStyle = cc; ctx.lineWidth = lw; ctx.globalAlpha = a * (k ? 0.6 : 0.95) * fl * (0.8 + R.beat * 0.2); path(); ctx.stroke(); });
    });
  });
  def('strobe', 'ストロボ（ビート）', '光', (ctx, R) => {
    if (R.beat < 0.55) return; ctx.globalAlpha = (R.beat - 0.55) * 0.9; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, R.W, R.H);
  });
  def('bokehDrift', '玉ボケ（流れる）', '光', (ctx, R) => {
    const n = Math.round(22 * R.amt) + 4;
    for (let i = 0; i < n; i++) {
      const r = R.minD * (0.03 + hash(i, 1) * 0.1), x = wrap(hash(i, 2) + R.t * 0.015 * (0.5 + hash(i, 3)), 1) * (R.W + r * 2) - r, y = hash(i, 4) * R.H + Math.sin(R.t * 0.4 + i) * R.S * 30;
      const col = [R.pal.accent, R.pal.sub, '#ffffff'][i % 3];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, 0.28)); g.addColorStop(0.8, rgba(col, 0.18)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; dot(ctx, x, y, r);
    }
  });

  /* ---------- digital / glitch ---------- */
  def('glitchBlocks', 'グリッチブロック', 'デジタル', (ctx, R) => {
    const k = Math.floor(R.t * 12), n = Math.round(14 * R.amt * (0.5 + R.beat));
    for (let i = 0; i < n; i++) {
      if (hash(i, k) > 0.7) continue;
      ctx.globalAlpha = 0.25 + hash(i, k, 1) * 0.4; ctx.fillStyle = [R.pal.accent, R.pal.sub, R.pal.text][i % 3];
      ctx.fillRect(hash(i, k, 2) * R.W, hash(i, k, 3) * R.H, R.W * (0.05 + hash(i, k, 4) * 0.3), R.S * (3 + hash(i, k, 5) * 40));
    }
  });
  def('dataRain', 'データの雨', 'デジタル', (ctx, R) => {
    const cols = Math.round(R.W / (R.S * 22)), cw = R.W / cols;
    for (let c = 0; c < cols; c++) {
      const sp = 0.2 + hash(c, 1) * 0.5, head = wrap(R.t * sp + hash(c, 2), 1.4) * R.H, len = R.H * (0.2 + hash(c, 3) * 0.3);
      for (let y = head - len; y < head; y += R.S * 14) {
        const q = (y - (head - len)) / len; if (y < 0 || y > R.H) continue;
        ctx.globalAlpha = q * 0.55; ctx.fillStyle = q > 0.95 ? '#ffffff' : R.pal.accent;
        const bw = cw * (0.2 + hash(c, Math.floor(y), 4) * 0.5); ctx.fillRect(c * cw + (cw - bw) / 2, y, bw, R.S * 8);
      }
    }
  });
  def('scanNoise', '走査ノイズ', 'デジタル', (ctx, R) => {
    const k = Math.floor(R.t * 30);
    for (let i = 0; i < 40; i++) { ctx.globalAlpha = 0.05 + hash(i, k) * 0.12; ctx.fillStyle = hash(i, k, 2) > 0.5 ? '#ffffff' : '#000000'; ctx.fillRect(0, hash(i, k, 1) * R.H, R.W, R.S * (1 + hash(i, k, 3) * 4)); }
    const by = wrap(R.t * 0.2, 1) * R.H; ctx.globalAlpha = 0.12; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, by, R.W, R.S * 30);
  });
  def('pixelField', 'ピクセルの点滅', 'デジタル', (ctx, R) => {
    const s = R.minD / 18, k = Math.floor(R.t * 8);
    for (let y = 0; y < R.H; y += s) for (let x = 0; x < R.W; x += s) { const h = hash(Math.floor(x / s), Math.floor(y / s), k); if (h > 0.9) { ctx.globalAlpha = (h - 0.9) * 4; ctx.fillStyle = h > 0.97 ? R.pal.accent : R.pal.sub; ctx.fillRect(x + 1, y + 1, s - 2, s - 2); } }
  });
  def('eqBars', 'イコライザー（音に反応）', 'デジタル', (ctx, R) => {
    const b = R.spec; const n = b ? b.length : 32, bw = R.W / n;
    for (let i = 0; i < n; i++) {
      const v = b ? b[i] : 0.3 + 0.3 * Math.sin(R.t * 3 + i);
      const h = v * R.H * 0.5, segs = Math.ceil(h / (R.S * 14));
      for (let s = 0; s < segs; s++) { ctx.globalAlpha = 0.25 + 0.4 * (s / Math.max(1, segs)); ctx.fillStyle = s > segs * 0.75 ? R.pal.accent : R.pal.sub; ctx.fillRect(i * bw + bw * 0.12, R.H - (s + 1) * R.S * 14, bw * 0.76, R.S * 10); }
    }
  });
  def('circleSpectrum', '円形スペクトラム（音に反応）', 'デジタル', (ctx, R) => {
    const b = R.spec, n = b ? b.length * 2 : 64, cx = R.W / 2, cy = R.H / 2, r0 = R.minD * 0.3;
    ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 4; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const v = b ? b[i % b.length] : 0.3 + 0.2 * Math.sin(R.t * 4 + i), a = i / n * TAU - PI / 2 + R.t * 0.05;
      ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * (r0 + v * R.minD * 0.18), cy + Math.sin(a) * (r0 + v * R.minD * 0.18)); ctx.stroke();
    }
  });

  /* ---------- split screen ---------- */
  def('splitPanels', '画面分割パネル', '画面分割', (ctx, R) => {
    const n = 4, w = R.W / n;
    for (let i = 0; i < n; i++) {
      const ph = wrap(R.t * 0.25 + i * 0.25, 1), off = Math.sin(ph * TAU) * R.H * 0.08;
      ctx.globalAlpha = 0.16 + 0.1 * (i % 2); ctx.fillStyle = i % 2 ? R.pal.accent : R.pal.sub; ctx.fillRect(i * w, off, w - R.S * 4, R.H);
    }
  });
  def('splitSlide', 'スライドする分割', '画面分割', (ctx, R) => {
    const ph = wrap(R.t * 0.2, 1), k = Math.floor(R.t * 0.2);
    const q = LM.E.inOutCubic(clamp(ph * 3));
    ctx.globalAlpha = 0.35; ctx.fillStyle = k % 2 ? R.pal.accent : R.pal.sub;
    if (k % 2) ctx.fillRect(0, 0, R.W * (0.5 * q + 0.001), R.H); else ctx.fillRect(R.W * (1 - 0.5 * q), 0, R.W * 0.5 * q, R.H);
  });
  def('diagonalSplit', '斜め分割', '画面分割', (ctx, R) => {
    const off = Math.sin(R.t * 0.5) * R.W * 0.1;
    ctx.globalAlpha = 0.3; ctx.fillStyle = R.pal.accent;
    ctx.beginPath(); ctx.moveTo(R.W * 0.55 + off, 0); ctx.lineTo(R.W, 0); ctx.lineTo(R.W, R.H); ctx.lineTo(R.W * 0.35 + off, R.H); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.18; ctx.fillStyle = R.pal.sub;
    ctx.beginPath(); ctx.moveTo(R.W * 0.62 + off, 0); ctx.lineTo(R.W * 0.66 + off, 0); ctx.lineTo(R.W * 0.46 + off, R.H); ctx.lineTo(R.W * 0.42 + off, R.H); ctx.closePath(); ctx.fill();
  });
  def('mosaicFlip', 'タイルが裏返る', '画面分割', (ctx, R) => {
    const s = R.minD / 6;
    for (let y = 0; y < R.H; y += s) for (let x = 0; x < R.W; x += s) {
      const ph = Math.sin(R.t * 1.2 - (x + y) / (R.minD * 0.4)); ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.scale(Math.abs(ph), 1);
      ctx.globalAlpha = 0.18; ctx.fillStyle = ph > 0 ? R.pal.accent : R.pal.sub; ctx.fillRect(-s / 2 + 2, -s / 2 + 2, s - 4, s - 4); ctx.restore();
    }
  });

  /* ---------- waves / liquid ---------- */
  def('ocean', '重なる波', '波', (ctx, R) => {
    for (let j = 0; j < 5; j++) {
      const base = R.H * (0.55 + j * 0.1), amp = R.S * (26 - j * 3) * (1 + R.beat * 0.4), k = (0.004 + j * 0.0012) / R.S;
      ctx.globalAlpha = 0.18 + j * 0.06; ctx.fillStyle = mix(R.pal.accent, R.pal.sub, j / 4);
      ctx.beginPath(); ctx.moveTo(0, R.H);
      for (let x = 0; x <= R.W; x += R.S * 10) ctx.lineTo(x, base + Math.sin(x * k + R.t * (1 + j * 0.3) + j) * amp + Math.sin(x * k * 2.3 - R.t * 0.7) * amp * 0.3);
      ctx.lineTo(R.W, R.H); ctx.closePath(); ctx.fill();
    }
  });
  def('sineLines', 'サイン波ライン', '波', (ctx, R) => {
    ctx.lineWidth = R.S * 2;
    for (let j = 0; j < 12; j++) {
      ctx.strokeStyle = j % 2 ? R.pal.accent : R.pal.sub; ctx.globalAlpha = 0.3; ctx.beginPath();
      for (let x = 0; x <= R.W; x += R.S * 8) { const y = R.H / 2 + Math.sin(x / (R.minD * 0.15) + R.t * 1.5 + j * 0.4) * R.H * 0.25 * Math.sin(j * 0.3 + R.t * 0.3); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
  });
  def('liquid', 'リキッド（液体）', '波', (ctx, R) => {
    field(ctx, R, (x, y, a) => fbm(x * a * 2.5 + R.t * 0.1, y * 2.5 + Math.sin(R.t * 0.2) * 0.5, 4) * 1.1 - 0.1,
      [[0, R.pal.bg, 0], [0.45, R.pal.bg, 0], [0.55, R.pal.sub, 0.6], [0.7, R.pal.accent, 0.8], [1, mix(R.pal.accent, '#fff', 0.3), 0.9]], R.amt * 0.9, 90);
  }, true);
  def('lavaLamp', 'ラバランプ（メタボール）', '波', (ctx, R) => {
    const balls = [0, 1, 2, 3, 4, 5].map((i) => [0.5 + 0.35 * Math.sin(R.t * (0.2 + i * 0.05) + i * 2), 0.5 + 0.38 * Math.cos(R.t * (0.17 + i * 0.04) + i), 0.012 + 0.008 * hash(i, 1)]);
    field(ctx, R, (x, y, a) => { let v = 0; for (const b of balls) { const dx = (x - b[0]) * a, dy = y - b[1]; v += b[2] / (dx * dx + dy * dy + 1e-4); } return v * 0.35; },
      [[0, R.pal.bg, 0], [0.8, R.pal.bg, 0], [0.95, R.pal.accent, 0.85], [1, mix(R.pal.accent, R.pal.sub, 0.5), 0.9]], R.amt, 160);
  }, true);
  def('caustics', '水中の光（コースティクス）', '水', (ctx, R) => {
    field(ctx, R, (x, y, a) => { const X = x * a * 7, Y = y * 7, t = R.t * 0.6; const v = Math.sin(X + Math.sin(Y * 1.3 + t)) + Math.sin(Y * 1.1 + Math.cos(X * 0.9 - t * 1.2)) + Math.sin((X + Y) * 0.7 + t); return Math.pow(1 - Math.abs(v) / 3, 6); },
      [[0, R.pal.bg, 0], [0.5, mix(R.pal.bg, R.pal.sub, 0.4), 0.3], [1, mix(R.pal.sub, '#ffffff', 0.5), 0.8]], R.amt, 120);
  }, true);
  def('plasma', 'プラズマ', '波', (ctx, R) => {
    field(ctx, R, (x, y, a) => { const X = x * a * 4, Y = y * 4, t = R.t * 0.7; return 0.5 + 0.25 * (Math.sin(X + t) + Math.sin(Y * 1.3 - t * 0.8) + Math.sin((X + Y) * 0.8 + t * 0.5) + Math.sin(Math.hypot(X - 2 * a, Y - 2) * 1.5 - t)) / 2; },
      [[0, R.pal.bg, 1], [0.35, mix(R.pal.bg, R.pal.sub, 0.6), 1], [0.65, mix(R.pal.bg, R.pal.accent, 0.7), 1], [1, R.pal.accent, 1]], R.amt * 0.8, 80);
  }, true);
  def('aurora2', 'オーロラ（揺らめき）', '光', (ctx, R) => {
    field(ctx, R, (x, y, a) => { const band = Math.exp(-Math.pow((y - 0.35 - 0.12 * Math.sin(x * a * 3 + R.t * 0.4) - 0.05 * fbm(x * a * 3, R.t * 0.2, 9)) * 5, 2)); return band * (0.5 + 0.5 * fbm(x * a * 8 + R.t * 0.3, y * 2, 5)); },
      [[0, R.pal.bg, 0], [0.3, mix(R.pal.sub, '#3dffb0', 0.4), 0.35], [0.7, mix(R.pal.accent, '#7cf3ff', 0.3), 0.7], [1, '#ffffff', 0.85]], R.amt, 100);
  }, true);

  /* ---------- fire / smoke / weather ---------- */
  def('fire', '炎', '炎', (ctx, R) => {
    field(ctx, R, (x, y, a) => { const n = fbm(x * a * 5, y * 4 + R.t * 1.8, 11); const h = 1 - y; return clamp(n * 1.25 - h * 1.35 + 0.2 + R.beat * 0.08); },
      [[0, R.pal.bg, 0], [0.25, '#5a0d06', 0.4], [0.45, '#c2321a', 0.8], [0.65, '#ff7a1a', 0.95], [0.85, '#ffd24a', 1], [1, '#fff6d0', 1]], R.amt, 90);
  }, true);
  def('smoke', '煙・霧', '天気', (ctx, R) => {
    field(ctx, R, (x, y, a) => fbm(x * a * 2.5 + R.t * 0.06, y * 2.5 - R.t * 0.04, 13) * 1.2 - 0.25,
      [[0, R.pal.bg, 0], [0.4, mix(R.pal.bg, R.pal.text, 0.15), 0.3], [1, mix(R.pal.bg, R.pal.text, 0.45), 0.6]], R.amt, 80);
  }, true);
  def('clouds', '流れる雲', '天気', (ctx, R) => {
    field(ctx, R, (x, y, a) => clamp(fbm(x * a * 2 - R.t * 0.05, y * 3, 17) * 1.6 - 0.55) * (1 - y * 0.6),
      [[0, '#ffffff', 0], [0.5, '#ffffff', 0.35], [1, '#ffffff', 0.8]], R.amt, 80);
  }, true);
  def('storm', '雷雨', '天気', (ctx, R) => {
    const k = Math.floor(R.t * 5), flash = hash(k, 3) > 0.86 || R.beat > 0.9;
    if (flash) { ctx.globalAlpha = 0.25; ctx.fillStyle = '#dfe8ff'; ctx.fillRect(0, 0, R.W, R.H); ctx.globalAlpha = 1; }
    B.rain.f(ctx, Object.assign({}, R, { amt: R.amt * 1.2 }));
    if (flash) {
      ctx.strokeStyle = '#ffffff'; ctx.shadowColor = '#a9c1ff'; ctx.shadowBlur = R.S * 20; ctx.lineWidth = R.S * 2.5; ctx.globalAlpha = 0.9;
      let x = R.W * hash(k, 4), y = 0; ctx.beginPath(); ctx.moveTo(x, y);
      while (y < R.H * 0.8) { x += (hash(k, y) - 0.5) * R.S * 80; y += R.S * (30 + hash(y, k) * 40); ctx.lineTo(x, y); }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
  });

  /* ---------- animation ---------- */
  def('beatCircle', 'ビートで膨らむ円', 'アニメ', (ctx, R) => {
    const r = R.minD * (0.28 + R.beat * 0.07);
    const g = ctx.createRadialGradient(R.W / 2, R.H / 2, r * 0.2, R.W / 2, R.H / 2, r);
    g.addColorStop(0, rgba(R.pal.accent, 0.55)); g.addColorStop(1, rgba(R.pal.accent, 0));
    ctx.fillStyle = g; dot(ctx, R.W / 2, R.H / 2, r);
  });
  def('morphBlob', '変形するブロブ', 'アニメ', (ctx, R) => {
    const cx = R.W / 2, cy = R.H / 2, r = R.minD * 0.32 * (1 + R.beat * 0.06);
    for (let j = 0; j < 2; j++) {
      ctx.globalAlpha = j ? 0.25 : 0.35; ctx.fillStyle = j ? R.pal.sub : R.pal.accent; ctx.beginPath();
      for (let k = 0; k <= 60; k++) { const a = k / 60 * TAU; const rr = r * (1 + 0.12 * Math.sin(a * 3 + R.t * (1.2 + j)) + 0.08 * Math.sin(a * 5 - R.t * 1.7)) * (j ? 1.15 : 1); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    }
  });
  def('gradientShift', 'グラデーション変化', 'アニメ', (ctx, R) => {
    const a = R.t * 0.2, x = Math.cos(a) * R.W, y = Math.sin(a) * R.H;
    const g = ctx.createLinearGradient(R.W / 2 - x, R.H / 2 - y, R.W / 2 + x, R.H / 2 + y);
    g.addColorStop(0, rgba(R.pal.accent, 0.45)); g.addColorStop(0.5, rgba(R.pal.bg, 0)); g.addColorStop(1, rgba(R.pal.sub, 0.45));
    ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H);
  }, true);
  def('retroSun', 'レトロサン＋グリッド', 'アニメ', (ctx, R) => {
    const hy = R.H * 0.62, cx = R.W / 2, r = R.minD * 0.24;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, hy, r, PI, 0); ctx.closePath(); ctx.clip();
    const g = ctx.createLinearGradient(0, hy - r, 0, hy); g.addColorStop(0, '#ffe36e'); g.addColorStop(1, R.pal.accent); ctx.fillStyle = g; ctx.fillRect(cx - r, hy - r, r * 2, r);
    ctx.fillStyle = R.pal.bg; for (let i = 0; i < 6; i++) { const yy = hy - r * 0.1 - i * r * 0.14 + wrap(R.t * R.S * 10, r * 0.14); ctx.fillRect(cx - r, yy, r * 2, r * 0.02 + i * R.S); }
    ctx.restore();
    ctx.save(); ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 1.6; ctx.beginPath(); ctx.rect(0, hy, R.W, R.H - hy); ctx.clip();
    for (let i = -16; i <= 16; i++) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(cx + i * R.W * 0.02, hy); ctx.lineTo(cx + i * R.W * 0.22, R.H); ctx.stroke(); }
    for (let j = 0; j < 14; j++) { const z = (j + wrap(R.t * 0.8, 1)) / 14; const y = hy + (R.H - hy) * z * z; ctx.globalAlpha = 0.2 + 0.6 * z; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(R.W, y); ctx.stroke(); }
    ctx.restore();
  });
  def('speedStreaks', 'スピード線（横流れ）', 'アニメ', (ctx, R) => {
    const n = Math.round(60 * R.amt); ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const y = hash(i, 1) * R.H, L = R.S * (80 + hash(i, 2) * 300), x = R.W + L - wrap(R.t * (1.2 + hash(i, 3) * 1.5) + hash(i, 4), 1) * (R.W + L * 2);
      ctx.strokeStyle = i % 4 ? R.pal.text : R.pal.accent; ctx.globalAlpha = 0.2 + hash(i, 5) * 0.3; ctx.lineWidth = R.S * (1 + hash(i, 6) * 3);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + L, y); ctx.stroke();
    }
  });

  const cats = ['粒子', '天気', '水', '炎', '自然', '宇宙', '図形', '模様', '光', 'デジタル', '画面分割', '波', 'アニメ'];

  /* draw: id, ctx, base R, cfg {amt, speed} */
  function draw(id, ctx, R, cfg = {}) {
    const b = B[id]; if (!b) return;
    const R2 = Object.assign({}, R, { t: R.t * (cfg.speed || 1), amt: (cfg.amt == null ? 1 : cfg.amt) });
    const a0 = ctx.globalAlpha; ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const ga = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'globalAlpha');
    const proxy = a0 < 0.999 ? new Proxy(ctx, { get: (o, k) => { if (k === 'globalAlpha') return o.globalAlpha / a0; const v = o[k]; return typeof v === 'function' ? v.bind(o) : v; }, set: (o, k, v) => { if (k === 'globalAlpha') o.globalAlpha = v * a0; else o[k] = v; return true; } }) : ctx;
    try { b.f(proxy, R2); } catch (e) { console.warn('bgm', id, e); }
    ctx.restore();
  }
  return { lib: B, cats, draw, noise2, fbm };
})();
