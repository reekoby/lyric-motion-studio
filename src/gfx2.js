/* Edge accent graphics (ref: Motion Array grunge / brutalist kinetic packs):
 * hand-drawn X & stars, scribbled strike-through, sticker tag, rotating circle badge, brutalist meta HUD, back disc */
'use strict';
(() => {
  const G = LM.gfx.lib;
  const { clamp, lerp, hash } = LM.U;
  const E = LM.E, PI = Math.PI, TAU = PI * 2;
  const fadeX = (R) => 1 - E.inQuad(R.x);
  const def = (id, n, c, f, top) => (G[id] = { n, c, f, top: !!top });
  const FONT = (px, w = 900) => `${w} ${px.toFixed(1)}px "Archivo Black","Anton","Noto Sans JP",sans-serif`;
  // wobbly hand-drawn polyline revealed by progress q
  function hand(ctx, pts, q, seed, amp) {
    const segs = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); tot += l; }
    let rem = tot * clamp(q); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && rem > 0; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], l = segs[i - 1], f = Math.min(1, rem / l); rem -= l;
      const n = Math.max(2, Math.round(l / 6));
      for (let k = 1; k <= n * f; k++) { const u = k / n; ctx.lineTo(lerp(x0, x1, u) + (hash(seed, i, k) - 0.5) * amp, lerp(y0, y1, u) + (hash(seed, k, i + 9) - 0.5) * amp); }
    }
    ctx.stroke();
  }
  const star = (cx, cy, r, rot) => { const p = []; for (let i = 0; i <= 10; i++) { const a = rot + (i / 10) * TAU - PI / 2, rr = i % 2 ? r * 0.42 : r; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return p; };

  def('scribbleMarks', '手描きの×と星が散る', 'エッジ', (ctx, R) => {
    const b = R.bb, n = 7, pad = R.minD * 0.06;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = R.S * 5; ctx.globalAlpha = fadeX(R);
    for (let i = 0; i < n; i++) {
      const side = i % 4, u = hash(i, R.seed, 1);
      const x = side < 2 ? b.x + u * b.w : side === 2 ? b.x - pad * (0.5 + hash(i, 2)) : b.x + b.w + pad * (0.5 + hash(i, 2));
      const y = side === 0 ? b.y - pad * (0.6 + hash(i, 3)) : side === 1 ? b.y + b.h + pad * (0.6 + hash(i, 3)) : b.y + u * b.h;
      const q = clamp(R.e * 2.2 - i * 0.12), s = R.minD * (0.018 + hash(i, 5) * 0.022), rot = hash(i, 6) * PI + Math.sin(R.lt * 3 + i) * 0.2;
      ctx.strokeStyle = i % 3 ? R.pal.accent : R.pal.text;
      if (i % 2) { const c = Math.cos(rot) * s, d = Math.sin(rot) * s; hand(ctx, [[x - c, y - d], [x + c, y + d]], q * 2, i, R.S * 2); hand(ctx, [[x + d, y - c], [x - d, y + c]], q * 2 - 1, i + 3, R.S * 2); }
      else hand(ctx, star(x, y, s, rot), q, i, R.S * 2);
    }
  }, true);

  def('strikeOut', '取り消し線（手描き）', 'エッジ', (ctx, R) => {
    const b = R.kb || R.bb, q = E.outCubic(clamp((R.e - 0.25) * 2.2));
    if (q <= 0) return;
    ctx.strokeStyle = R.pal.accent; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(R.S * 4, b.h * 0.09); ctx.globalAlpha = fadeX(R);
    hand(ctx, [[b.x - b.h * 0.15, b.y + b.h * 0.58], [b.x + b.w + b.h * 0.15, b.y + b.h * 0.42]], q, R.seed, R.S * 3);
    ctx.lineWidth *= 0.55; hand(ctx, [[b.x + b.w * 0.05, b.y + b.h * 0.66], [b.x + b.w * 1.05, b.y + b.h * 0.55]], q * 1.2 - 0.2, R.seed + 1, R.S * 4);
  }, true);

  def('stickerTag', 'ステッカー（斜めラベル）', 'エッジ', (ctx, R) => {
    const b = R.bb, q = E.outBack(clamp(R.e * 1.8 - 0.2)); if (q <= 0) return;
    const labels = ['REAL', 'NEW', 'LIVE', 'NOW', '#1', 'LOVE', 'VIBES', 'HOT'];
    const txt = labels[R.seed % labels.length], fs = R.minD * 0.028;
    ctx.font = FONT(fs); const tw = ctx.measureText(txt).width;
    const x = b.x + b.w * (R.seed % 2 ? 0.08 : 0.72), y = b.y - fs * 0.6;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.14 + (R.seed % 3) * 0.08 + Math.sin(R.lt * 4) * 0.02); ctx.scale(q, q); ctx.globalAlpha = fadeX(R);
    ctx.fillStyle = R.pal.accent; ctx.fillRect(-tw / 2 - fs * 0.45, -fs * 0.72, tw + fs * 0.9, fs * 1.44);
    ctx.fillStyle = R.pal.bg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, fs * 0.05);
    ctx.restore();
  }, true);

  def('circleBadge', '回転する円形バッジ', 'エッジ', (ctx, R) => {
    const b = R.bb, r = R.minD * 0.1, q = E.outBack(clamp(R.e * 1.5)); if (q <= 0) return;
    const cx = Math.min(R.W - r * 1.4, b.x + b.w + r * 0.6), cy = Math.max(r * 1.4, b.y - r * 0.2);
    const txt = ('LYRIC MOTION ● ' + (R.title || 'MUSIC VIDEO') + ' ● ').toUpperCase();
    ctx.save(); ctx.translate(cx, cy); ctx.scale(q, q); ctx.rotate(R.lt * 0.8); ctx.globalAlpha = fadeX(R);
    ctx.fillStyle = R.pal.accent; ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, TAU); ctx.fill();
    const fs = r * 0.2; ctx.font = FONT(fs, 800); ctx.fillStyle = R.pal.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const chs = Array.from(txt), n = chs.length;
    chs.forEach((ch, i) => { const a = (i / n) * TAU; ctx.save(); ctx.rotate(a); ctx.translate(0, -r * 0.78); ctx.fillText(ch, 0, 0); ctx.restore(); });
    ctx.restore();
  });

  def('metaHud', 'ブルータル・メタ情報（番号・タイムコード・バーコード）', 'エッジ', (ctx, R) => {
    const q = E.outExpo(clamp(R.e * 1.4)), m = R.minD * 0.06, fs = R.minD * 0.02;
    ctx.globalAlpha = fadeX(R) * 0.95; ctx.fillStyle = R.pal.text; ctx.font = FONT(fs, 700);
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText('NO.' + String(10 + (R.seed % 89)), m, m);
    ctx.textAlign = 'right'; const t = R.tAbs || R.lt; ctx.fillText(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}:${String(Math.floor((t % 1) * 30)).padStart(2, '0')}`, R.W - m, m);
    ctx.fillRect(m, m + fs * 1.5, (R.W - m * 2) * q, Math.max(1, R.S * 1.5));
    const bx = R.W - m - R.minD * 0.16, by = R.H - m - R.minD * 0.045;
    for (let i = 0; i < 24; i++) ctx.fillRect(bx + i * R.minD * 0.0066, by, R.S * (1 + hash(i, 4) * 3.2), R.minD * 0.045 * q);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('↗ ' + (R.title || 'LYRIC VIDEO').toUpperCase(), m, R.H - m);
    ctx.strokeStyle = R.pal.text; ctx.lineWidth = Math.max(1, R.S * 1.4);
    [[m, R.H / 2], [R.W - m, R.H / 2]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - fs * 0.7, y); ctx.lineTo(x + fs * 0.7, y); ctx.moveTo(x, y - fs * 0.7); ctx.lineTo(x, y + fs * 0.7); ctx.stroke(); });
  });

  def('backDisc', '背面の大きな円（ブルータル）', 'エッジ', (ctx, R) => {
    const b = R.bb, r = Math.min(R.minD * 0.26, Math.max(b.h * 1.1, R.minD * 0.14)), q = E.outBack(clamp(R.e * 1.3));
    const cx = b.x + b.w * (R.seed % 2 ? 0.85 : 0.15), cy = b.cy - b.h * 0.1;
    ctx.globalAlpha = fadeX(R); ctx.fillStyle = R.pal.sub; ctx.beginPath(); ctx.arc(cx, cy, r * q, 0, TAU); ctx.fill();
  });
})();
