/* Scene transitions between phrases: cover wipes (shapes/colors) & camera cuts (whip/zoom/spin/glitch) */
'use strict';
LM.trans = (() => {
  const { clamp, lerp, hash, rgba, mix } = LM.U;
  const E = LM.E, PI = Math.PI, TAU = PI * 2;
  // u: 0..1 across the window, cut at 0.5. cover(u): amount the frame is covered (0→1→0)
  const inOut = (u) => (u < 0.5 ? E.inOutCubic(u * 2) : 1 - E.inOutCubic((u - 0.5) * 2));
  const L = {};
  const cover = (id, n, f) => (L[id] = { n, c: 'カバー', kind: 'cover', f });
  const cam = (id, n, f) => (L[id] = { n, c: 'カメラ', kind: 'cam', f });

  // cover painters: (ctx, u, R) — R.pal is the incoming palette, R.prev the outgoing
  cover('colorBlocks', 'カラーブロック（3色が横切る）', (ctx, u, R) => {
    const cols = [R.pal.accent, R.pal.sub, R.pal.bg];
    cols.forEach((c, i) => {
      const d = i * 0.07, a = clamp((u - d) / (0.5 - 0.07 * 2 + 0.001)), b = clamp((u - 0.5 - d * 0.5) / (0.5 - 0.07));
      const lead = E.inOutCubic(a) * R.W, trail = E.inOutCubic(b) * R.W;
      if (lead > trail) { ctx.fillStyle = c; ctx.fillRect(trail, 0, lead - trail + 1, R.H); }
    });
  });
  cover('barsH', '横バー（交互に走る）', (ctx, u, R) => {
    const n = 7, h = R.H / n;
    for (let i = 0; i < n; i++) {
      const d = (i % 2 ? 0.06 : 0) + i * 0.012, a = E.inOutCubic(clamp((u - d) * 2.3)), b = E.inOutCubic(clamp((u - 0.5 - d) * 2.3));
      const dir = i % 2 ? -1 : 1, x0 = dir > 0 ? b * R.W : R.W - a * R.W, x1 = dir > 0 ? a * R.W : R.W - b * R.W;
      ctx.fillStyle = i % 3 === 0 ? R.pal.accent : i % 3 === 1 ? R.pal.sub : R.pal.bg; ctx.fillRect(Math.min(x0, x1), i * h, Math.abs(x1 - x0), h + 1);
    }
  });
  cover('stripesDiag', '斜めストライプ', (ctx, u, R) => {
    const n = 9, D = Math.hypot(R.W, R.H), w = D / n;
    ctx.save(); ctx.translate(R.W / 2, R.H / 2); ctx.rotate(-PI / 4);
    for (let i = 0; i < n; i++) { const k = inOut(clamp(u + (i - n / 2) * 0.012)); ctx.fillStyle = i % 2 ? R.pal.accent : R.pal.sub; ctx.fillRect(-D / 2 + i * w, -D / 2, w + 1, D * k); }
    ctx.restore();
  });
  cover('iris', 'アイリス（円が広がる）', (ctx, u, R) => {
    const D = Math.hypot(R.W, R.H) / 2 + 2, cx = R.W / 2, cy = R.H / 2;
    const out = E.inOutCubic(clamp(u * 2)) * D, inn = E.inOutCubic(clamp((u - 0.5) * 2)) * D;
    ctx.fillStyle = R.pal.accent; ctx.beginPath(); ctx.arc(cx, cy, out, 0, TAU); if (inn > 0) ctx.arc(cx, cy, inn, 0, TAU, true); ctx.fill('evenodd');
    if (u > 0.25 && u < 0.75) { ctx.fillStyle = R.pal.sub; const k = inOut(clamp((u - 0.25) * 2)); ctx.beginPath(); ctx.arc(cx, cy, D * 0.9 * k, 0, TAU); ctx.fill(); }
  });
  cover('diamond', 'ダイヤ型ワイプ', (ctx, u, R) => {
    const D = (R.W + R.H) / 2 + 4, cx = R.W / 2, cy = R.H / 2;
    const dia = (r) => { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); };
    const out = E.inOutCubic(clamp(u * 2)) * D, inn = E.inOutCubic(clamp((u - 0.5) * 2)) * D;
    ctx.fillStyle = R.pal.accent; ctx.beginPath(); dia(out); if (inn > 0) dia(inn); ctx.fill('evenodd');
  });
  cover('splitClose', '上下から閉じて開く', (ctx, u, R) => {
    const k = inOut(u), h = (R.H / 2) * k;
    ctx.fillStyle = R.pal.accent; ctx.fillRect(0, 0, R.W, h + 1); ctx.fillStyle = R.pal.sub; ctx.fillRect(0, R.H - h - 1, R.W, h + 1);
    ctx.fillStyle = R.pal.bg; ctx.fillRect(0, R.H / 2 - R.S * 3, R.W * k, R.S * 6);
  });
  cover('gridPop', 'グリッドタイル', (ctx, u, R) => {
    const s = R.minD / 5, cols = Math.ceil(R.W / s), rows = Math.ceil(R.H / s);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const d = (Math.hypot(x - cols / 2, y - rows / 2) / Math.hypot(cols / 2, rows / 2)) * 0.2;
      const k = u < 0.5 ? E.outBack(clamp((u - d) * 3.2)) : 1 - E.inBack(clamp((u - 0.5 - d) * 3.2));
      if (k <= 0) continue; const w = s * Math.min(1.02, k);
      ctx.fillStyle = (x + y) % 2 ? R.pal.accent : R.pal.sub; ctx.fillRect(x * s + (s - w) / 2, y * s + (s - w) / 2, w, w);
    }
  });
  cover('liquid', 'リキッド（波打つ液体）', (ctx, u, R) => {
    const draw = (lv, col, ph) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, R.H); for (let x = 0; x <= R.W; x += R.W / 40) ctx.lineTo(x, lv + Math.sin(x / R.W * 7 + ph + u * 9) * R.H * 0.05); ctx.lineTo(R.W, R.H); ctx.closePath(); ctx.fill(); };
    if (u < 0.5) { const k = E.inOutCubic(u * 2); draw(R.H * (1.1 - k * 1.25), R.pal.sub, 0); draw(R.H * (1.1 - clamp(k * 1.1 - 0.1) * 1.25), R.pal.accent, 2); }
    else { const k = E.inOutCubic((u - 0.5) * 2); ctx.save(); ctx.translate(0, -R.H * 1.2 * k); draw(-R.H * 0.2, R.pal.accent, 2); ctx.restore(); }
  });
  cover('zigzag', 'ジグザグワイプ', (ctx, u, R) => {
    const k = inOut(u), lead = u < 0.5 ? E.inOutCubic(u * 2) : 1, trail = u < 0.5 ? 0 : E.inOutCubic((u - 0.5) * 2);
    const zz = (x0) => { const s = R.H / 10; for (let y = 0, i = 0; y <= R.H + s; y += s, i++) ctx.lineTo(x0 + (i % 2 ? s * 0.6 : 0), y); };
    ctx.fillStyle = R.pal.accent; ctx.beginPath(); ctx.moveTo(-R.W * 0.1 + trail * R.W * 1.3, 0); zz(-R.W * 0.2 + lead * R.W * 1.3); ctx.lineTo(-R.W * 0.1 + trail * R.W * 1.3, R.H); ctx.closePath(); ctx.fill();
  });
  cover('fan', 'ファン（扇状に回転）', (ctx, u, R) => {
    const D = Math.hypot(R.W, R.H), cx = R.W / 2, cy = R.H / 2;
    for (let i = 0; i < 4; i++) { const a0 = (i / 4) * TAU; const k = u < 0.5 ? E.inOutCubic(u * 2) : 1, s = u < 0.5 ? 0 : E.inOutCubic((u - 0.5) * 2); ctx.fillStyle = i % 2 ? R.pal.accent : R.pal.sub; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, D, a0 + (TAU / 4) * s, a0 + (TAU / 4) * k + 0.01); ctx.closePath(); ctx.fill(); }
  });
  cover('ink', 'インクが広がる', (ctx, u, R) => {
    const D = Math.hypot(R.W, R.H) * 0.62, cx = R.W * 0.5, cy = R.H * 0.5;
    const blob = (r, s) => { for (let i = 0; i <= 64; i++) { const a = (i / 64) * TAU, rr = r * (1 + 0.18 * Math.sin(a * 5 + s) + 0.1 * Math.sin(a * 11 - s * 2)); i ? ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath(); };
    const out = E.inOutCubic(clamp(u * 2)) * D * 1.2, inn = E.inOutCubic(clamp((u - 0.5) * 2)) * D * 1.2;
    ctx.fillStyle = R.pal.accent; ctx.beginPath(); blob(out, 1); if (inn > 1) blob(inn, 3); ctx.fill('evenodd');
  });
  cover('shards', 'ガラスの破片', (ctx, u, R) => {
    const n = 6;
    for (let j = 0; j < 3; j++) for (let i = 0; i < n; i++) {
      const d = hash(i, j) * 0.18, k = u < 0.5 ? E.outCubic(clamp((u - d) * 3)) : 1 - E.inCubic(clamp((u - 0.5 - d) * 3));
      if (k <= 0) continue; const x = (i / n) * R.W, y = (j / 3) * R.H, w = R.W / n, h = R.H / 3;
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate((1 - k) * (hash(i, j, 2) - 0.5) * 2); ctx.scale(k, k);
      ctx.fillStyle = (i + j) % 2 ? R.pal.accent : R.pal.sub; ctx.beginPath(); ctx.moveTo(-w / 2 - 1, -h / 2 - 1); ctx.lineTo(w / 2 + 1, -h / 2 - 1); ctx.lineTo(w / 2 + 1, h / 2 + 1); ctx.lineTo(-w / 2 - 1, h / 2 + 1); ctx.fill(); ctx.restore();
    }
  });
  cover('flashWhite', '白フラッシュ', (ctx, u, R) => { const k = Math.pow(1 - Math.abs(u - 0.5) * 2, 3); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = k; ctx.fillRect(0, 0, R.W, R.H); });
  cover('flashAccent', 'カラーフラッシュ', (ctx, u, R) => { const k = Math.pow(1 - Math.abs(u - 0.5) * 2, 2.5); ctx.fillStyle = R.pal.accent; ctx.globalAlpha = k; ctx.fillRect(0, 0, R.W, R.H); });
  cover('filmBurnCut', 'フィルムバーン', (ctx, u, R) => {
    const k = Math.pow(1 - Math.abs(u - 0.5) * 2, 1.5); ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(R.W * 0.7, R.H * 0.4, 0, R.W * 0.7, R.H * 0.4, R.minD * (0.3 + k * 1.2));
    g.addColorStop(0, rgba('#fff4cf', k)); g.addColorStop(0.4, rgba('#ff8a1f', k * 0.9)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H);
  });

  // camera cuts: return transform & post-fx for the whole frame
  const whip = (dx, dy) => (u) => { const o = u < 0.5 ? -E.inCubic(u * 2) : 1 - E.outCubic((u - 0.5) * 2); const v = 1 - Math.abs(u - 0.5) * 2; return { tx: dx * o, ty: dy * o, mblur: [dx * v * 0.06, dy * v * 0.06] }; };
  cam('whipLeft', 'ホイップ（左へ振る）', whip(-1, 0));
  cam('whipRight', 'ホイップ（右へ振る）', whip(1, 0));
  cam('whipUp', 'ホイップ（上へ振る）', whip(0, -1));
  cam('whipDown', 'ホイップ（下へ振る）', whip(0, 1));
  cam('zoomThrough', 'ズームスルー（突き抜ける）', (u) => { const v = 1 - Math.abs(u - 0.5) * 2; return { sc: u < 0.5 ? 1 + E.inExpo(u * 2) * 5 : lerp(0.35, 1, E.outExpo((u - 0.5) * 2)), zblur: v * 3, flash: Math.pow(v, 6) * 0.6 }; });
  cam('zoomOutIn', 'ズームアウト→イン', (u) => { const v = 1 - Math.abs(u - 0.5) * 2; return { sc: u < 0.5 ? lerp(1, 0.2, E.inCubic(u * 2)) : lerp(3, 1, E.outCubic((u - 0.5) * 2)), zblur: v * 2 }; });
  cam('spin', 'スピン', (u) => { const v = 1 - Math.abs(u - 0.5) * 2; return { rot: u < 0.5 ? E.inCubic(u * 2) * PI * 0.5 : -(1 - E.outCubic((u - 0.5) * 2)) * PI * 0.5, sc: 1 + v * 0.8, zblur: v * 2 }; });
  cam('roll', 'ロール（傾いて切替）', (u) => { const v = 1 - Math.abs(u - 0.5) * 2; return { rot: (u < 0.5 ? E.inCubic(u * 2) : -(1 - E.outCubic((u - 0.5) * 2))) * 0.35, tx: (u < 0.5 ? -E.inCubic(u * 2) : 1 - E.outCubic((u - 0.5) * 2)) * 0.8, mblur: [v * 0.05, 0] }; });
  cam('glitchCut', 'グリッチカット', (u) => { const v = Math.pow(1 - Math.abs(u - 0.5) * 2, 1.5); return { glitch: v * 1.6, block: v * 1.4, rgb: v * 30, tx: (hash(Math.floor(u * 30)) - 0.5) * v * 0.08 }; });
  cam('rgbCut', 'RGB分離カット', (u) => { const v = Math.pow(1 - Math.abs(u - 0.5) * 2, 2); return { rgb: v * 60, sc: 1 + v * 0.15 }; });
  cam('pixelCut', 'ピクセル化カット', (u) => { const v = Math.pow(1 - Math.abs(u - 0.5) * 2, 1.5); return { pix: v * 60 }; });
  cam('blurCut', 'ぼかしカット', (u) => { const v = Math.pow(1 - Math.abs(u - 0.5) * 2, 1.2); return { blur: v, sc: 1 + v * 0.08 }; });
  cam('shakeCut', '衝撃シェイク', (u) => { const v = u > 0.5 ? Math.pow(1 - (u - 0.5) * 2, 2) : 0; const k = Math.floor(u * 40); return { tx: (hash(k, 1) - 0.5) * v * 0.08, ty: (hash(k, 2) - 0.5) * v * 0.08, rot: (hash(k, 3) - 0.5) * v * 0.08, sc: 1 + v * 0.1, flash: v > 0.9 ? 0.4 : 0 }; });
  cam('invertCut', '反転フラッシュ', (u) => ({ inv: Math.abs(u - 0.5) < 0.08 ? 1 : 0 }));
  cam('dolly', 'ドリー（奥へ回り込む）', (u) => { const v = 1 - Math.abs(u - 0.5) * 2; return { sc: u < 0.5 ? 1 + E.inCubic(u * 2) * 1.2 : lerp(0.6, 1, E.outCubic((u - 0.5) * 2)), skew: (u < 0.5 ? E.inCubic(u * 2) : -(1 - E.outCubic((u - 0.5) * 2))) * 0.35, zblur: v * 1.5 }; });

  return { lib: L, inOut };
})();
