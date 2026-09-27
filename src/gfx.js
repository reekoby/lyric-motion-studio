/* Accent graphics — animated vector elements that hit together with the lyric */
'use strict';
LM.gfx = (() => {
  const { clamp, lerp, hash, rgba, mix } = LM.U;
  const E = LM.E, PI = Math.PI, TAU = PI * 2;
  // R: {W,H,S,minD,pal,bb,kb (key bbox),e (0..1 entry progress over ~0.6s),lt,hp,beat,x (exit 0..1),seed,top}
  const G = {};
  const def = (id, n, c, f, top) => (G[id] = { n, c, f, top: !!top });
  const fadeX = (R) => 1 - E.inQuad(R.x);

  def('ringBurst', 'リングバースト', 'インパクト', (ctx, R) => {
    const c = R.kb || R.bb, cx = c.cx, cy = c.cy, base = Math.max(R.bb.w, R.bb.h) * 0.4;
    for (let k = 0; k < 3; k++) {
      const q = clamp(R.e * 1.6 - k * 0.18); if (q <= 0 || q >= 1) continue;
      ctx.globalAlpha = (1 - q) * fadeX(R); ctx.strokeStyle = k % 2 ? R.pal.sub : R.pal.accent; ctx.lineWidth = R.S * (10 - k * 3) * (1 - q) + R.S;
      ctx.beginPath(); ctx.arc(cx, cy, base * (0.5 + E.outCubic(q) * (1.4 + k * 0.4)), 0, TAU); ctx.stroke();
    }
  });
  def('lineBurst', 'ラインバースト（放射）', 'インパクト', (ctx, R) => {
    const c = R.kb || R.bb, q = E.outExpo(clamp(R.e * 1.4)); if (q >= 1 && R.e > 0.9) return;
    const n = 14, r0 = Math.max(c.w, c.h) * 0.6, len = R.minD * 0.25;
    ctx.strokeStyle = R.pal.accent; ctx.lineCap = 'round'; ctx.lineWidth = R.S * 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + hash(i, R.seed) * 0.3, a0 = r0 + q * len * 0.9, a1 = r0 + q * len * (1.2 + hash(i, 2) * 0.5);
      ctx.globalAlpha = (1 - q) * fadeX(R);
      ctx.beginPath(); ctx.moveTo(c.cx + Math.cos(a) * a0, c.cy + Math.sin(a) * a0); ctx.lineTo(c.cx + Math.cos(a) * a1, c.cy + Math.sin(a) * a1); ctx.stroke();
    }
  }, true);
  def('bracketSnap', 'ブラケットが閉じる', 'フレーム', (ctx, R) => {
    const b = R.bb, q = E.outBack(clamp(R.e * 1.3)), pad = R.minD * 0.04, L = R.minD * 0.07, spread = (1 - q) * R.minD * 0.15;
    ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 6; ctx.globalAlpha = clamp(R.e * 3) * fadeX(R);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
      const x = b.cx + sx * (b.w / 2 + pad + spread), y = b.cy + sy * (b.h / 2 + pad + spread);
      ctx.beginPath(); ctx.moveTo(x - sx * L * -0, y - sy * L); ctx.lineTo(x, y); ctx.lineTo(x - sx * L, y); ctx.stroke();
    });
  });
  def('underlineSwipe', '下線スワイプ', 'ライン', (ctx, R) => {
    const b = R.bb, q = E.outExpo(clamp(R.e * 1.5)), x = R.x > 0 ? E.inExpo(R.x) : 0;
    ctx.fillStyle = R.pal.accent; ctx.globalAlpha = 1;
    const x0 = b.x - R.minD * 0.02, w = b.w + R.minD * 0.04;
    ctx.fillRect(x0 + w * x, b.y + b.h + R.minD * 0.02, w * (q - x), R.minD * 0.018);
  });
  def('boxSlam', 'ボックス叩きつけ', 'インパクト', (ctx, R) => {
    const b = R.bb, q = clamp(R.e * 1.4), s = q < 0.6 ? lerp(1.8, 1, E.inQuad(q / 0.6)) : 1 + Math.sin((q - 0.6) / 0.4 * PI * 3) * 0.04 * (1 - q);
    ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(-0.06 + (1 - q) * 0.2); ctx.scale(s, s);
    ctx.globalAlpha = clamp(q * 3) * fadeX(R) * 0.95; ctx.fillStyle = R.pal.accent;
    const pad = R.minD * 0.05; ctx.fillRect(-b.w / 2 - pad, -b.h / 2 - pad * 0.7, b.w + pad * 2, b.h + pad * 1.4); ctx.restore();
  });
  def('scribble', '手書きの丸（キーワード）', '手描き', (ctx, R) => {
    const c = R.kb || R.bb, q = E.inOutCubic(clamp(R.e * 1.1));
    ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 5; ctx.lineCap = 'round'; ctx.globalAlpha = fadeX(R);
    ctx.beginPath(); const n = 80, turns = 1.15;
    for (let i = 0; i <= n * q; i++) { const a = (i / n) * TAU * turns - PI * 0.6; const w = c.w * 0.66 + R.minD * 0.03, h = c.h * 0.75 + R.minD * 0.02; const j = 1 + (hash(i >> 3, R.seed) - 0.5) * 0.08; const x = c.cx + Math.cos(a) * w * j, y = c.cy + Math.sin(a) * h * j; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }, true);
  def('sparks', 'キラッ（星が弾ける）', 'パーティクル', (ctx, R) => {
    const c = R.kb || R.bb;
    for (let i = 0; i < 7; i++) {
      const q = clamp(R.e * 1.4 - i * 0.07); if (q <= 0 || q >= 1) continue;
      const a = hash(i, R.seed) * TAU, d = Math.max(c.w, c.h) * (0.55 + hash(i, 3) * 0.5) * E.outCubic(q), s = R.S * (10 + hash(i, 4) * 14) * Math.sin(q * PI);
      const x = c.cx + Math.cos(a) * d, y = c.cy + Math.sin(a) * d * 0.7;
      ctx.save(); ctx.translate(x, y); ctx.rotate(q * 2); ctx.fillStyle = i % 2 ? '#ffffff' : R.pal.accent; ctx.globalAlpha = fadeX(R);
      ctx.beginPath(); for (let j = 0; j < 8; j++) { const r = j % 2 ? s * 0.2 : s; const aa = (j / 8) * TAU; ctx.lineTo(Math.cos(aa) * r, Math.sin(aa) * r); } ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }, true);
  def('orbitDots', 'ドットが周回', 'パーティクル', (ctx, R) => {
    const b = R.bb, rx = b.w * 0.62 + R.minD * 0.04, ry = b.h * 0.7 + R.minD * 0.04;
    ctx.fillStyle = R.pal.accent; ctx.globalAlpha = clamp(R.e * 2) * fadeX(R);
    for (let i = 0; i < 10; i++) { const a = R.lt * 1.4 + (i / 10) * TAU; const z = Math.sin(a); ctx.beginPath(); ctx.arc(b.cx + Math.cos(a) * rx, b.cy + z * ry * 0.35, R.S * (3 + (z + 1) * 3), 0, TAU); ctx.fill(); }
  });
  def('triSpin', '回転する三角', 'シェイプ', (ctx, R) => {
    const b = R.bb, s = Math.max(b.w, b.h) * 0.62 * E.outBack(clamp(R.e * 1.3));
    ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(R.lt * 0.6); ctx.strokeStyle = R.pal.sub; ctx.lineWidth = R.S * 4; ctx.globalAlpha = 0.8 * fadeX(R);
    ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = -PI / 2 + (k * TAU) / 3; ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); } ctx.closePath(); ctx.stroke(); ctx.restore();
  });
  def('squareSpin', '回転する正方形', 'シェイプ', (ctx, R) => {
    const b = R.bb;
    for (let k = 0; k < 3; k++) {
      const s = Math.max(b.w, b.h) * (0.45 + k * 0.12) * E.outBack(clamp(R.e * 1.4 - k * 0.1));
      ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(PI / 4 + R.lt * (k % 2 ? -0.4 : 0.3)); ctx.strokeStyle = k % 2 ? R.pal.accent : R.pal.sub; ctx.lineWidth = R.S * 2.5; ctx.globalAlpha = 0.7 * fadeX(R);
      ctx.strokeRect(-s, -s, s * 2, s * 2); ctx.restore();
    }
  });
  def('crossSweep', 'クロスライン', 'ライン', (ctx, R) => {
    const q = E.outExpo(clamp(R.e * 1.4));
    ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 3; ctx.globalAlpha = 0.85 * fadeX(R);
    const b = R.bb, L = Math.hypot(R.W, R.H);
    [[-0.35, 1], [0.35, -1]].forEach(([a, d]) => { ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-L / 2 * d, 0); ctx.lineTo((-L / 2 + L * q) * d, 0); ctx.stroke(); ctx.restore(); });
  });
  def('speedBars', 'スピードバー', 'ライン', (ctx, R) => {
    const b = R.bb;
    for (let i = 0; i < 6; i++) {
      const q = E.outExpo(clamp(R.e * 1.3 - i * 0.05)), y = b.y + (b.h * (i + 0.5)) / 6, w = R.W * (0.15 + hash(i, R.seed) * 0.3);
      const x = lerp(-w, b.x - w * 0.2 - hash(i, 5) * R.W * 0.1, q);
      ctx.globalAlpha = 0.7 * fadeX(R) * (1 - q * 0.4); ctx.fillStyle = i % 2 ? R.pal.accent : R.pal.sub; ctx.fillRect(x, y, w, R.S * (4 + hash(i, 6) * 8));
    }
  });
  def('halftoneDisc', '網点の円', 'シェイプ', (ctx, R) => {
    const b = R.bb, rad = Math.max(b.w, b.h) * 0.62 * E.outBack(clamp(R.e * 1.2)), g = R.minD / 55;
    ctx.fillStyle = R.pal.accent; ctx.globalAlpha = 0.75 * fadeX(R);
    for (let y = -rad; y <= rad; y += g) for (let x = -rad; x <= rad; x += g) { const d = Math.hypot(x, y) / rad; if (d > 1) continue; const r = g * 0.48 * (1 - d) * (0.8 + R.beat * 0.3); if (r < 0.4) continue; ctx.beginPath(); ctx.arc(b.cx + x + rad * 0.3, b.cy + y, r, 0, TAU); ctx.fill(); }
  });
  def('chevrons', 'シェブロン（矢印）', 'シェイプ', (ctx, R) => {
    const b = R.bb, q = E.outExpo(clamp(R.e * 1.3));
    ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 6; ctx.lineJoin = 'miter'; ctx.globalAlpha = fadeX(R);
    for (let k = 0; k < 3; k++) { const s = R.minD * 0.035, off = (1 - q) * R.W * 0.3 + k * s * 1.4 + ((R.lt * 2) % 1) * s * 0.4; [[-1], [1]].forEach(([d]) => { const x = b.cx + d * (b.w / 2 + R.minD * 0.04 + off); ctx.beginPath(); ctx.moveTo(x + d * s, b.cy - s); ctx.lineTo(x, b.cy); ctx.lineTo(x + d * s, b.cy + s); ctx.stroke(); }); }
  });
  def('glowPulse', 'ビートで光る後光', 'ライト', (ctx, R) => {
    const b = R.bb, r = Math.max(b.w, b.h) * (0.7 + R.beat * 0.25);
    const g = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, r); g.addColorStop(0, rgba(R.pal.accent, 0.55 * clamp(R.e * 2) * fadeX(R))); g.addColorStop(1, rgba(R.pal.accent, 0));
    ctx.fillStyle = g; ctx.fillRect(b.cx - r, b.cy - r, r * 2, r * 2);
  });
  def('slashes', 'スラッシュ（斜線が走る）', 'ライン', (ctx, R) => {
    const b = R.bb;
    for (let i = 0; i < 4; i++) {
      const q = clamp(R.e * 1.8 - i * 0.12); if (q <= 0 || q >= 1) continue;
      const x = lerp(b.x - b.w * 0.3, b.x + b.w * 1.3, E.inOutCubic(q)) + (i - 1.5) * R.minD * 0.04;
      ctx.globalAlpha = Math.sin(q * PI) * fadeX(R); ctx.fillStyle = i % 2 ? '#ffffff' : R.pal.accent;
      ctx.beginPath(); ctx.moveTo(x, b.y - b.h * 0.3); ctx.lineTo(x + R.S * 18, b.y - b.h * 0.3); ctx.lineTo(x - b.h * 0.5 + R.S * 18, b.y + b.h * 1.3); ctx.lineTo(x - b.h * 0.5, b.y + b.h * 1.3); ctx.fill();
    }
  }, true);
  def('confettiPop', 'クラッカー（紙吹雪が弾ける）', 'パーティクル', (ctx, R) => {
    const c = R.kb || R.bb, cols = [R.pal.accent, R.pal.sub, '#ffffff', '#ffd23f'];
    for (let i = 0; i < 36; i++) {
      const q = clamp(R.lt / 1.4); if (q >= 1) return;
      const a = hash(i, R.seed) * TAU, v = R.minD * (0.3 + hash(i, 2) * 0.5), x = c.cx + Math.cos(a) * v * E.outCubic(q), y = c.cy + Math.sin(a) * v * E.outCubic(q) + q * q * R.minD * 0.5;
      ctx.save(); ctx.translate(x, y); ctx.rotate(q * 10 + i); ctx.scale(1, Math.cos(q * 12 + i)); ctx.globalAlpha = (1 - q) * fadeX(R); ctx.fillStyle = cols[i % 4]; ctx.fillRect(-R.S * 7, -R.S * 3.5, R.S * 14, R.S * 7); ctx.restore();
    }
  }, true);
  def('waveUnder', '波線ライン', 'ライン', (ctx, R) => {
    const b = R.bb, q = E.outCubic(clamp(R.e * 1.3)), y0 = b.y + b.h + R.minD * 0.04;
    ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 4; ctx.globalAlpha = fadeX(R); ctx.beginPath();
    for (let x = 0; x <= b.w * q; x += R.S * 4) { const y = y0 + Math.sin(x / (R.minD * 0.025) - R.lt * 6) * R.minD * 0.012; x ? ctx.lineTo(b.x + x, y) : ctx.moveTo(b.x + x, y); }
    ctx.stroke();
  });
  def('frameDraw', 'フレームが描かれる', 'フレーム', (ctx, R) => {
    const b = R.bb, pad = R.minD * 0.05, q = E.inOutCubic(clamp(R.e * 1.1)), w = b.w + pad * 2, h = b.h + pad * 2, P = (w + h) * 2;
    ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 3; ctx.globalAlpha = fadeX(R); ctx.setLineDash([P * q, P]);
    ctx.strokeRect(b.cx - w / 2, b.cy - h / 2, w, h); ctx.setLineDash([]);
  });
  def('splat', 'ペイントの飛沫', '手描き', (ctx, R) => {
    const b = R.bb, s = E.outBack(clamp(R.e * 1.5)), rr = Math.max(b.w, b.h) * 0.6 * s;
    ctx.fillStyle = R.pal.accent; ctx.globalAlpha = 0.9 * fadeX(R); ctx.beginPath();
    for (let i = 0; i <= 48; i++) { const a = (i / 48) * TAU, r = rr * (0.8 + 0.25 * Math.sin(a * 5 + R.seed) + 0.12 * Math.sin(a * 13)); i ? ctx.lineTo(b.cx + Math.cos(a) * r * 1.2, b.cy + Math.sin(a) * r * 0.75) : ctx.moveTo(b.cx + Math.cos(a) * r * 1.2, b.cy + Math.sin(a) * r * 0.75); }
    ctx.fill();
    for (let i = 0; i < 8; i++) { const a = hash(i, R.seed) * TAU, d = rr * (1.3 + hash(i, 2) * 0.5); ctx.beginPath(); ctx.arc(b.cx + Math.cos(a) * d * 1.2, b.cy + Math.sin(a) * d * 0.75, R.S * (4 + hash(i, 3) * 12) * s, 0, TAU); ctx.fill(); }
  });
  def('halo', '回転する後光リング', 'ライト', (ctx, R) => {
    const b = R.bb, r = Math.max(b.w, b.h) * 0.62 * E.outBack(clamp(R.e * 1.2));
    ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(R.lt * 0.8); ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 3; ctx.setLineDash([R.S * 20, R.S * 12]); ctx.globalAlpha = 0.8 * fadeX(R);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); ctx.rotate(-R.lt * 1.8); ctx.setLineDash([R.S * 4, R.S * 10]); ctx.strokeStyle = R.pal.sub; ctx.beginPath(); ctx.arc(0, 0, r * 1.12, 0, TAU); ctx.stroke(); ctx.restore();
  });
  def('tagCorner', 'タグ（角のアクセント）', 'フレーム', (ctx, R) => {
    const b = R.bb, q = E.outExpo(clamp(R.e * 1.5)), s = R.minD * 0.03;
    ctx.fillStyle = R.pal.accent; ctx.globalAlpha = fadeX(R);
    ctx.fillRect(b.x - s * 1.5, b.y - s * 1.5, s * 4 * q, s); ctx.fillRect(b.x - s * 1.5, b.y - s * 1.5, s, s * 4 * q);
    ctx.fillRect(b.x + b.w + s * 1.5 - s * 4 * q, b.y + b.h + s * 0.5, s * 4 * q, s); ctx.fillRect(b.x + b.w + s * 0.5, b.y + b.h + s * 1.5 - s * 4 * q, s, s * 4 * q);
  });
  def('hudScan', 'HUDスキャン', 'フレーム', (ctx, R) => {
    const b = R.bb, q = E.outCubic(clamp(R.e * 1.2)), pad = R.minD * 0.05;
    ctx.strokeStyle = R.pal.accent; ctx.lineWidth = R.S * 1.5; ctx.globalAlpha = 0.8 * fadeX(R);
    const x = b.x - pad, y = b.y - pad, w = b.w + pad * 2, h = b.h + pad * 2;
    ctx.strokeRect(x, y, w * q, h);
    const sy = y + h * ((R.lt * 0.8) % 1); ctx.globalAlpha = 0.5 * fadeX(R); ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x + w * q, sy); ctx.stroke();
    ctx.fillStyle = R.pal.accent; for (let i = 0; i < 5; i++) ctx.fillRect(x + w + R.S * 8, y + i * R.S * 10, R.S * (6 + hash(i, Math.floor(R.lt * 6)) * 30) * q, R.S * 4);
  });

  function draw(ids, ctx, R) {
    ids.forEach((id) => { const g = G[id]; if (!g) return; ctx.save(); ctx.globalCompositeOperation = 'source-over'; try { g.f(ctx, R); } catch (e) { console.warn('gfx', id, e); } ctx.restore(); });
  }
  return { lib: G, draw };
})();
