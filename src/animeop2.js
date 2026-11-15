/* Anime-opening / title-sequence pack, part 2 — colour fields, screen effects, cuts and the two tones.
 * Backgrounds are flat (no gradients, no blur) and re-compose on the beat number, holding still in between:
 *  beat-cut colour planes, two-tone focus-line burst, racing diagonal stripes, popping primitives, halftone sweep,
 *  giant lyric characters crossing the frame, stepped sunburst, a tinted colour grid with type as texture,
 *  cut-paper bars, floor-plan rectangles under a turning camera, letter fragments on a dot grid, type-texture bands.
 * Screen effects: impact frames (1–2 inverted frames on the downbeat), cel look, stepped beat shake, 2-frame colour
 * flash at each cut, flat speed streaks, slanted corner mattes. Cuts: slanted slashes, star iris, panel cut, focus-line
 * close, impact cut, whip smear. Tones: アニメOP / ハイスピード・ポップ and タイトルバック / グラフィック. */
'use strict';
(() => {
  const U = LM.U, { clamp, lerp, hash, mix, rgba } = U, E = LM.E, D = LM.data, FX = LM.fx;
  const { stp, t12, lum } = LM.animeop, PI = Math.PI, TAU = PI * 2, CAT = 'アニメOP';
  const B = LM.bgm.lib, def = (id, n, f, o) => (B[id] = Object.assign({ n, c: CAT, f, full: false }, o || {}));
  const FLAT = { full: true, flat: true };
  const wrap = (v, m) => ((v % m) + m) % m;
  const per = (R) => 60 / (R.bpm || 120), since = (R) => Math.max(0, (R.tr == null ? R.t : R.tr) - (R.tb == null ? 0 : R.tb));
  // time since the current n-beat block began, and the block's index
  const blk = (R, n) => { const bn = R.bn || 0, k = Math.floor(bn / n); return { k, age: since(R) + (bn - k * n) * per(R) }; };
  const snap = (age, d = 0.16, n = 3) => stp(E.outExpo(clamp(age / d)), n);
  const poly = (ctx, pts) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); };
  const HEAVY = '"Anton","Archivo Black","Dela Gothic One","Noto Sans JP",sans-serif', SLAB = '"Alfa Slab One","Abril Fatface","Noto Serif JP",serif';
  // the running line (or the song title); nothing is printed when there is neither — no placeholder words in instrumental passages
  const txtOf = (R) => (R.text || R.title || '').replace(/\s+/g, ' ').trim();

  /* ================= backgrounds ================= */
  def('opPlanes', '色面カット（2拍ごとに構図が切り替わる）', (ctx, R) => {
    const { W, H, pal } = R, { k, age } = blk(R, R.amt > 1.2 ? 1 : 2), q = snap(age), c = Math.floor(hash(k, 11) * 6), fl = hash(k, 12) > 0.5, A1 = hash(k, 13) > 0.5 ? pal.accent : pal.sub, A2 = A1 === pal.accent ? pal.sub : pal.accent;
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
    ctx.save(); if (fl) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    if (c === 0) { const x = W * lerp(1.3, 0.52, q); ctx.fillStyle = A1; poly(ctx, [[x + H * 0.3, 0], [W * 1.4, 0], [W * 1.4, H], [x - H * 0.3, H]]); ctx.fillStyle = pal.text; poly(ctx, [[x + H * 0.3 - W * 0.012, 0], [x + H * 0.3, 0], [x - H * 0.3, H], [x - H * 0.3 - W * 0.012, H]]); }
    else if (c === 1) { [[A1, 0.2], [A2, 0.09], [pal.text, 0.02]].reduce((x, [col, w], i) => { const ww = W * w, y = H * (1 - snap(age - i * 0.04)) * (i % 2 ? 1 : -1); ctx.fillStyle = col; poly(ctx, [[x + H * 0.12, y], [x + ww + H * 0.12, y], [x + ww - H * 0.12, y + H], [x - H * 0.12, y + H]]); return x + ww + W * 0.012; }, W * 0.05); }
    else if (c === 2) { ctx.fillStyle = A1; ctx.beginPath(); ctx.arc(W * 0.8, H * 0.3, R.minD * 0.62 * q, 0, TAU); ctx.fill(); ctx.fillStyle = A2; ctx.beginPath(); ctx.arc(W * 0.12, H * 0.86, R.minD * 0.2 * snap(age - 0.06), 0, TAU); ctx.fill(); }
    else if (c === 3) { ctx.translate(W / 2, H / 2); ctx.rotate(-0.07); ctx.fillStyle = A1; ctx.fillRect(-W, -H * 0.75, W * 2 * q, H * 0.4); ctx.fillStyle = A2; ctx.fillRect(W - W * 2 * q, H * 0.36, W * 2, H * 0.09); ctx.fillStyle = pal.text; ctx.fillRect(-W, H * 0.47, W * 2 * q, H * 0.012); }
    else if (c === 4) { ctx.fillStyle = A1; poly(ctx, [[0, 0], [W * 0.62 * q, 0], [0, H * 0.78 * q]]); ctx.fillStyle = A2; poly(ctx, [[W, H], [W - W * 0.5 * q, H], [W, H - H * 0.6 * q]]); }
    else { const x = W * 0.36 * q; ctx.fillStyle = A1; ctx.fillRect(0, 0, x, H); ctx.fillStyle = A2; const ds = R.minD * 0.03; for (let j = 0; j * ds < H + ds; j++) for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(x + ds * (i + 0.5 + (j % 2) * 0.5), j * ds, ds * 0.46 * (1 - i / 7), 0, TAU); ctx.fill(); } }
    ctx.restore();
  }, FLAT);

  def('opBurst', '集中線バースト（2色ベタ）', (ctx, R) => {
    const { W, H, pal } = R, f = Math.floor((R.tr == null ? R.t : R.tr) * 8), n = 52, far = Math.hypot(W, H) * 0.6, cx = W / 2, cy = H / 2, hit = since(R) < 0.085 ? 0.9 : 1;
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < n; i++) {
      const a = (i + hash(i, f, 1) * 0.6) / n * TAU, w = (0.35 + hash(i, f, 2) * 0.75) * (TAU / n) * 0.5, rr = (0.74 + hash(i, f, 3) * 0.5) * hit, tx = cx + Math.cos(a) * W * 0.4 * rr, ty = cy + Math.sin(a) * H * 0.36 * rr;
      ctx.fillStyle = i % 4 === 0 ? pal.sub : i % 4 === 2 ? pal.text : pal.accent;
      poly(ctx, [[cx + Math.cos(a - w) * far, cy + Math.sin(a - w) * far], [cx + Math.cos(a + w) * far, cy + Math.sin(a + w) * far], [tx, ty]]);
    }
  }, FLAT);

  def('opStripes', '斜めストライプ疾走', (ctx, R) => {
    const { W, H, pal } = R, far = Math.hypot(W, H), { k } = blk(R, 4), dir = k % 2 ? 1 : -1, seq = [[pal.bg, 0.16], [pal.sub, 0.07], [pal.bg, 0.05], [pal.accent, 0.12], [pal.bg, 0.1], [pal.text, 0.014], [pal.bg, 0.04], [pal.sub, 0.03]];
    const tot = seq.reduce((a, s) => a + s[1], 0) * far, off = wrap(t12(R.t, 24) * far * 0.9 * dir, tot);
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H); ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.62 * (k % 4 < 2 ? 1 : -1));
    for (let x = -far - tot + off; x < far; ) for (const [col, w] of seq) { if (col !== pal.bg) { ctx.fillStyle = col; ctx.fillRect(x, -far, w * far + 1, far * 2); } x += w * far; }
    ctx.restore();
  }, FLAT);

  const shape = (ctx, kind, r) => {
    if (kind === 0) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); } else if (kind === 1) { ctx.lineWidth = r * 0.36; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, TAU); ctx.stroke(); }
    else if (kind === 2) poly(ctx, [[0, -r * 1.15], [r, r * 0.75], [-r, r * 0.75]]);
    else if (kind === 3) { ctx.fillRect(-r, -r * 0.24, r * 2, r * 0.48); ctx.fillRect(-r * 0.24, -r, r * 0.48, r * 2); }
    else if (kind === 4) { ctx.lineWidth = r * 0.3; ctx.lineJoin = 'miter'; ctx.beginPath(); for (let i = 0; i < 6; i++) ctx.lineTo(-r * 1.5 + i * r * 0.6, i % 2 ? -r * 0.4 : r * 0.4); ctx.stroke(); }
    else if (kind === 5) { ctx.lineWidth = r * 0.26; ctx.strokeRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); }
    else { ctx.beginPath(); ctx.arc(0, 0, r, 0, PI); ctx.fill(); }
  };
  def('opShapes', '図形ポップ（拍ごとに丸・三角・十字が弾ける）', (ctx, R) => {
    const { W, H, pal } = R, bn = R.bn || 0, cols = [pal.accent, pal.sub, pal.text];
    for (let b = bn - 1; b <= bn; b++) {
      const age = since(R) + (bn - b) * per(R), kf = Math.floor(clamp(age / 0.25) * 6), s = [0, 1.4, 0.88, 1.07, 1, 1, 1][kf]; if (s <= 0) continue;
      for (let i = 0; i < 5; i++) {
        let x = hash(i, b, 1), y = hash(i, b, 2); const dx = x - 0.5, dy = y - 0.5, d = Math.hypot(dx / 0.34, dy / 0.3);
        if (d < 1) { x = 0.5 + dx / Math.max(0.05, d) * 1.05; y = 0.5 + dy / Math.max(0.05, d) * 1.05; }
        ctx.save(); ctx.translate(clamp(x, 0.03, 0.97) * W, clamp(y, 0.05, 0.95) * H); ctx.rotate(hash(i, b, 3) * TAU + t12(age, 6) * (i % 2 ? 1.2 : -1.2));
        ctx.fillStyle = ctx.strokeStyle = cols[(i + b) % 3 < 0 ? 0 : ((i + b) % 3 + 3) % 3]; ctx.globalAlpha = b < bn && age > per(R) * 1.7 ? 0 : 1;
        shape(ctx, Math.floor(hash(i, b, 4) * 7), R.minD * (0.035 + hash(i, b, 5) * 0.06) * s * Math.min(1.5, R.amt || 1)); ctx.restore();
      }
    }
  });

  def('opHalftone', 'ハーフトーン・スイープ（網点が斜めに流れる）', (ctx, R) => {
    const { W, H, pal } = R, ds = R.minD * 0.036, ph = t12(R.t, 12) * 1.1, bump = since(R) < 0.085 ? 1.18 : 1;
    ctx.fillStyle = pal.sub;
    for (let j = 0; j * ds * 0.87 < H + ds; j++) for (let i = 0; i * ds < W + ds; i++) {
      const x = i * ds + (j % 2) * ds * 0.5, y = j * ds * 0.87, v = Math.sin((x * 0.8 + y) / (R.minD * 0.55) - ph) * 0.5 + 0.5, e = Math.max(0, Math.abs(x / W - 0.5) * 2 - 0.25) + Math.max(0, Math.abs(y / H - 0.5) * 2 - 0.35), r = ds * 0.52 * clamp(v * 1.2 - 0.25) * clamp(e * 1.6) * bump;
      if (r > ds * 0.05) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    }
  });

  def('opKanji', '巨大文字ウォール（歌詞が背景を横切る）', (ctx, R) => {
    const { W, H, pal } = R, txt = txtOf(R), rows = W >= H ? 1 : 2, h = H / rows; if (!txt) return;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (let i = 0; i < rows; i++) {
      ctx.font = `900 ${(h * 0.98).toFixed(1)}px ${HEAVY}`; const unit = txt + '　', uw = Math.max(1, ctx.measureText(unit).width), off = wrap(t12(R.t, 12) * W * 0.55 * (i % 2 ? -1 : 1), uw);
      ctx.fillStyle = mix(pal.bg, pal.sub, 0.34);
      for (let x = -off; x < W; x += uw) ctx.fillText(unit, x, h * (i + 0.53));
    }
  });

  def('opSunray', 'サンバースト（コマ送りで回る2色の放射）', (ctx, R) => {
    const { W, H, pal } = R, n = 18, far = Math.hypot(W, H), cx = W * 0.5, cy = H * 0.6, a0 = t12(R.t, 12) * 0.5 + ((R.bn || 0) % 2 ? PI / n : 0);
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H); ctx.fillStyle = mix(pal.bg, pal.sub, 0.6);
    for (let i = 0; i < n; i += 2) { const a = a0 + (i / n) * TAU, b = a + TAU / n; poly(ctx, [[cx, cy], [cx + Math.cos(a) * far, cy + Math.sin(a) * far], [cx + Math.cos(b) * far, cy + Math.sin(b) * far]]); }
    ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.arc(cx, cy, R.minD * 0.05 * (since(R) < 0.085 ? 1.5 : 1), 0, TAU); ctx.fill();
  }, FLAT);

  def('opGrid', 'カラーグリッド（濃淡のマス目に文字のテクスチャ）', (ctx, R) => {
    const { W, H, pal } = R, land = W >= H, nc = land ? 5 : 3, nr = land ? 4 : 6, bn = R.bn || 0, dk = lum(pal.bg) < 0.5, gut = dk ? pal.bg : '#0b0b0d', g = R.minD * 0.014, cw = W / nc, ch = H / nr, { k, age } = blk(R, 8), txt = txtOf(R);
    ctx.fillStyle = gut; ctx.fillRect(0, 0, W, H);
    const tone = (i, j) => { const s = hash(i, j, 21) < 0.3 ? bn : k * 8, h = hash(i, j, s, 22); return h < 0.2 ? mix(pal.accent, '#000000', 0.28) : h < 0.42 ? pal.accent : h < 0.62 ? mix(pal.accent, '#ffffff', 0.45) : h < 0.82 ? mix(pal.accent, '#ffffff', 0.78) : '#ffffff'; };
    for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) { if (hash(i, j, k, 23) > clamp(age / 0.5) * 1.2 + 0.25) continue; ctx.fillStyle = tone(i, j); ctx.fillRect(i * cw + g / 2, j * ch + g / 2, cw - g, ch - g); }
    // type as texture: rows of slanted slab type printed across the grid, one giant line through the middle
    ctx.save(); ctx.beginPath(); for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) ctx.rect(i * cw + g / 2, j * ch + g / 2, cw - g, ch - g); ctx.clip();
    ctx.fillStyle = mix(pal.accent, '#000000', 0.72); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; const fs = ch * 0.2;
    // small rows only: a giant line here showed up as single stray letters wherever one tile was uncovered
    for (let r = 0, y = fs * 0.8; txt && y < H; r++, y += fs * 1.25) {
      const big = false; ctx.font = big ? `900 ${(ch * 0.62).toFixed(1)}px ${SLAB}` : `italic 800 ${fs.toFixed(1)}px ${SLAB}`; if (big) y += ch * 0.3;
      const unit = txt + (big ? '  ' : '   ') , uw = Math.max(1, ctx.measureText(unit).width), off = wrap(hash(r, 31) * uw + t12(R.t, 12) * R.minD * (big ? 0.12 : 0.05) * (r % 2 ? 1 : -1), uw);
      ctx.globalAlpha = big ? 0.9 : 0.5; for (let x = -off; x < W; x += uw) ctx.fillText(unit, x, y); if (big) y += ch * 0.3;
    }
    ctx.restore();
  }, Object.assign({ plate: true }, FLAT));

  def('opBars', '切り紙バー（白い帯が端から伸びてくる）', (ctx, R) => {
    const { W, H, pal } = R, { k, age } = blk(R, 4), f = Math.floor((R.tr == null ? R.t : R.tr) * 6), n = 5; ctx.fillStyle = pal.text;
    for (let i = 0; i < n; i++) {
      const q = stp(E.outCubic(clamp((age - i * 0.09) / 0.45)), 6); if (q <= 0) continue;
      const sd = Math.floor(hash(i, k, 1) * 4), u = 0.08 + hash(i, k, 2) * 0.84, th = R.minD * (0.034 + hash(i, k, 3) * 0.045), len = (sd % 2 ? W : H) * (0.28 + hash(i, k, 4) * 0.4) * q, tilt = (hash(i, k, 5) - 0.5) * 0.16, j = (m) => (hash(i, f, m) - 0.5) * th * 0.14;
      ctx.save();
      if (sd === 0) ctx.translate(W * u, 0); else if (sd === 2) { ctx.translate(W * u, H); ctx.rotate(PI); } else if (sd === 1) { ctx.translate(0, H * u); ctx.rotate(-PI / 2); } else { ctx.translate(W, H * u); ctx.rotate(PI / 2); }
      ctx.rotate(tilt); poly(ctx, [[-th / 2 + j(1), -th], [th / 2 + j(2), -th], [th / 2 * 0.9 + j(3), len + j(5)], [-th / 2 * 0.86 + j(4), len + j(6) + th * 0.12]]); ctx.restore();
    }
  });

  const roomCache = new Map();
  function rooms(seed) {
    let r = roomCache.get(seed); if (r) return r; r = []; let id = 0;
    const cut = (x, y, w, h, d) => {
      const big = Math.max(w, h), stop = d > 5 || big < 0.2 || (d > 2 && hash(id, seed, 1) < 0.22);
      if (stop) { r.push({ x, y, w, h, c: Math.floor(hash(id, seed, 2) * 7), o: hash(id, seed, 3), id: id++ }); return; }
      const u = 0.34 + hash(id++, seed, 4) * 0.32; if (w > h) { cut(x, y, w * u, h, d + 1); cut(x + w * u, y, w * (1 - u), h, d + 1); } else { cut(x, y, w, h * u, d + 1); cut(x, y + h * u, w, h * (1 - u), d + 1); }
    };
    cut(-1.5, -1.5, 3, 3, 0); if (roomCache.size > 40) roomCache.clear(); roomCache.set(seed, r); return r;
  }
  def('opRooms', '間取り（縁取りの矩形が敷き詰められ、カメラが回る）', (ctx, R) => {
    const { W, H, pal } = R, { k, age } = blk(R, 16), rs = rooms(k & 1023), md = R.minD, tt = t12(R.t, 12), dk = lum(pal.bg) < 0.5, line = dk ? '#050505' : '#1a1712';
    const cols = [pal.accent, pal.sub, mix(pal.bg, pal.text, 0.55), mix(pal.accent, pal.bg, 0.55), mix(pal.sub, pal.text, 0.35), mix(pal.bg, pal.text, 0.2), mix(pal.accent, pal.text, 0.5)];
    ctx.fillStyle = mix(pal.bg, '#000000', 0.25); ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.22 + tt * 0.045 * (k % 2 ? 1 : -1)); const z = md * (0.95 + tt % 40 * 0.004); ctx.translate(Math.sin(tt * 0.11 + k) * md * 0.3, Math.cos(tt * 0.09) * md * 0.2);
    const prog = clamp(age / (per(R) * 6)) * 1.05 + 0.2; ctx.lineWidth = md * 0.009; ctx.lineJoin = 'miter'; ctx.strokeStyle = line;
    rs.forEach((r) => { if (r.o > prog) return; ctx.fillStyle = cols[r.c]; ctx.fillRect(r.x * z, r.y * z, r.w * z, r.h * z); ctx.strokeRect(r.x * z, r.y * z, r.w * z, r.h * z); if (r.id % 4 === 0) { ctx.fillStyle = pal.text; ctx.beginPath(); ctx.arc((r.x + r.w) * z - md * 0.02, (r.y + r.h * 0.5) * z, md * 0.014, PI / 2, PI * 1.5); ctx.fill(); ctx.stroke(); } });
    ctx.restore();
  }, Object.assign({ plate: true }, FLAT));

  def('opParts', '文字のパーツ（点グリッドに棒・弧・丸が並ぶ）', (ctx, R) => {
    const { W, H, pal } = R, land = W >= H, nc = land ? 16 : 9, nr = land ? 9 : 16, cw = W / nc, ch = H / nr, u = Math.min(cw, ch), bn = R.bn || 0, { k } = blk(R, 4);
    ctx.fillStyle = rgba(pal.sub, 0.55); for (let j = 1; j < nr; j++) for (let i = 1; i < nc; i++) ctx.fillRect(i * cw - 1.5 * R.S, j * ch - 1.5 * R.S, 3 * R.S, 3 * R.S);
    // bars run along grid rows; fragments sit on the bars (cut out) or float free
    for (let b = 0; b < 4; b++) { const hr = hash(b, k, 1), row = hr < 0.5 ? Math.floor(hr * 2 * nr * 0.3) : nr - 1 - Math.floor((hr - 0.5) * 2 * nr * 0.3), x0 = Math.floor(hash(b, k, 2) * nc * 0.6), len = 3 + Math.floor(hash(b, k, 3) * nc * 0.6), q = snap(blk(R, 4).age - b * 0.06, 0.2, 4), fromR = hash(b, k, 4) > 0.5; ctx.fillStyle = pal.accent; const w = len * cw * q; ctx.fillRect(fromR ? W - x0 * cw - w : x0 * cw, row * ch + ch * 0.14, w, ch * 0.72); }
    for (let i = 0; i < 26; i++) {
      const life = 2 + Math.floor(hash(i, 5) * 3), b0 = Math.floor((bn + i) / life), age = since(R) + ((bn + i) - b0 * life) * per(R), s = [0, 1.3, 0.9, 1, 1][Math.min(4, Math.floor(clamp(age / 0.2) * 4))]; if (s <= 0) continue;
      const gx = Math.floor(hash(i, b0, 6) * nc), gy = Math.floor(hash(i, b0, 7) * nr), kind = Math.floor(hash(i, b0, 8) * 7), r = u * 0.36 * s;
      ctx.save(); ctx.translate((gx + 0.5) * cw, (gy + 0.5) * ch); ctx.fillStyle = ctx.strokeStyle = hash(i, b0, 9) < 0.62 ? pal.text : hash(i, b0, 9) < 0.85 ? pal.sub : pal.accent; ctx.lineWidth = r * 0.42; ctx.lineCap = 'butt';
      if (kind === 0) ctx.fillRect(-r * 0.2, -r, r * 0.4, r * 2); else if (kind === 1) { ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, TAU); ctx.fill(); } else if (kind === 2) { ctx.beginPath(); ctx.arc(0, 0, r * 0.75, PI, TAU); ctx.stroke(); }
      else if (kind === 3) poly(ctx, [[0, -r * 0.9], [r * 0.9, r * 0.8], [-r * 0.9, r * 0.8]]); else if (kind === 4) { ctx.fillRect(-r * 0.8, -r, r * 0.4, r * 2); ctx.fillRect(-r * 0.8, r * 0.6, r * 1.6, r * 0.4); } else if (kind === 5) { ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, TAU); ctx.stroke(); } else ctx.fillRect(-r, -r * 0.2, r * 2, r * 0.4);
      ctx.restore();
    }
  });

  def('opTypeTex', '文字テクスチャの帯（色面に斜体の文字列が流れる）', (ctx, R) => {
    const { W, H, pal } = R, { k, age } = blk(R, 8), q = snap(age, 0.2, 4), top = k % 2 === 0, bh = H * 0.36 * q, y0 = top ? 0 : H - bh, txt = txtOf(R), fs = R.minD * 0.05;
    ctx.fillStyle = pal.sub; ctx.fillRect(0, y0, W, bh); ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, bh); ctx.clip();
    ctx.fillStyle = mix(pal.sub, lum(pal.sub) > 0.5 ? '#000000' : '#ffffff', 0.8); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (let r = 0, y = (top ? 0 : H - H * 0.36) + fs * 0.7; txt && y < (top ? H * 0.36 : H) + fs; r++, y += fs * 1.2) { ctx.font = `italic ${r % 3 === 1 ? 900 : 700} ${fs.toFixed(1)}px ${SLAB}`; const unit = txt + '  /  ', uw = Math.max(1, ctx.measureText(unit).width), off = wrap(hash(r, 3) * uw + t12(R.t, 12) * R.minD * 0.09 * (r % 2 ? 1 : -1), uw); for (let x = -off; x < W; x += uw) ctx.fillText(unit, x, y); }
    ctx.restore(); ctx.fillStyle = pal.text; ctx.fillRect(0, top ? bh : y0 - R.minD * 0.008, W, R.minD * 0.008);
  });

  /* ================= screen effects ================= */
  FX.cats.animeop = CAT;
  const F = (n, k) => ({ n, c: 'animeop', k }), FO = FX.O;
  Object.assign(FX.list, {
    opFlashCut: F('カット頭の2コマ色フラッシュ', 'over'), opSpeedOver: F('流線（拍ごとに白い筋が横切る）', 'over'), opMatte: F('斜めのコーナーマット（黒帯が拍で動く）', 'over'),
    opImpact: F('インパクトフレーム（小節頭で1〜2コマ反転）', 'post'), opCel: F('セル画調（階調を減らし彩度を上げる）', 'post'), opShake: F('コマ揺れ（拍の頭で3コマ揺れる）', 'post'),
  });
  FO.opFlashCut = (ctx, R) => { const f = Math.floor(R.lt * 24); if (R.lt < 0 || f > 1) return; ctx.globalAlpha = f === 0 ? 1 : 0.5; ctx.fillStyle = f === 0 ? R.pal.accent : '#ffffff'; ctx.fillRect(0, 0, R.W, R.H); };
  FO.opSpeedOver = (ctx, R) => {
    const dt = since(R); if (dt > 0.3) return; const f = Math.floor(dt * 12), b = R.bbox, n = Math.round(12 * clamp(R.amt, 0.4, 1.6)), bn = R.bn || 0; ctx.fillStyle = R.pal.text;
    for (let i = 0; i < n; i++) { const y = hash(i, bn, 1) * R.H; if (b && y > b.y - b.h * 0.1 && y < b.y + b.h * 1.1) continue; const len = R.W * (0.2 + hash(i, bn, 2) * 0.5), th = R.S * (5 + hash(i, bn, 3) * 16), x = (hash(i, bn, 4) * 1.6 - 0.5) * R.W + (bn % 2 ? -1 : 1) * f * R.W * 0.22; ctx.globalAlpha = f > 2 ? 0.5 : 1; poly(ctx, [[x, y], [x + len, y - th / 2], [x + len, y + th / 2]]); }
  };
  FO.opMatte = (ctx, R) => {
    const q = stp(E.outExpo(clamp(R.lt / 0.2)), 3) * (1 - stp(clamp(R.xp * 1.3), 3)), k = (R.bn || 0) % 2, s = R.minD * (0.2 + k * 0.03) * q * clamp(R.amt, 0.5, 1.5); if (s <= 0) return;
    ctx.fillStyle = lum(R.pal.bg) > 0.5 ? '#0c0c0e' : R.pal.text; poly(ctx, [[0, 0], [s * 2.6, 0], [0, s]]); poly(ctx, [[R.W, R.H], [R.W - s * 2.6, R.H], [R.W, R.H - s]]);
    ctx.fillStyle = R.pal.accent; poly(ctx, [[s * 2.6, 0], [s * 2.6 + R.minD * 0.02, 0], [0, s + R.minD * 0.008], [0, s]]);
  };
  const PX = LM.POSTX;
  if (PX) {
    const UN = ['opImp', 'opImpC', 'opCel', 'opSx', 'opSy'];
    PX.uni = PX.uni.concat(UN); PX.decl += `\nuniform float ${UN.join(',')};\n`;
    PX.uv = `\n u+=vec2(opSx,opSy);\n` + PX.uv;
    PX.col += `
 if(opCel>0.0){vec3 q=floor(c*5.+.5)/5.;q=mix(vec3(Lm(q)),q,1.38);q=(q-.5)*1.08+.5;c=mix(c,clamp(q,0.,1.),opCel);}
 if(opImp>0.0){float m=step(.45,Lm(c));vec3 bw=mix(vec3(.97),vec3(.03),m);vec3 tn=mix(pA,vec3(.03),m);c=mix(c,mix(bw,tn,opImpC),opImp);}
`;
    const p0 = PX.params;
    PX.params = function (g, u, ctx) {
      p0.call(this, g, u, ctx); UN.forEach((n) => (u[n] = 0));
      const has = ctx.has, t = ctx.t, dt = ctx.tb == null ? 9 : Math.max(0, t - ctx.tb), bn = ctx.bn || 0;
      if (has('opCel')) u.opCel = clamp(g('opCel') * 0.85);
      if (has('opImpact')) { const a = g('opImpact'), every = a > 1.3 ? 2 : 4, f = Math.floor(dt * 24); if (((bn % every) + every) % every === 0 && f < 3) { u.opImp = f < 2 ? 1 : 0.4; u.opImpC = f === 1 ? 1 : 0; } }
      if (has('opShake')) { const f = Math.floor(dt * 12); if (f < 3) { const a = g('opShake') * [0.012, 0.007, 0.003][f]; u.opSx = (hash(bn, f, 1) - 0.5) * 2 * a; u.opSy = (hash(bn, f, 2) - 0.5) * 2 * a; } }
    };
  }

  /* ================= cuts ================= */
  const TR = LM.trans.lib, cover = (id, n, f) => (TR[id] = { n, c: CAT, kind: 'cover', f }), cam = (id, n, f) => (TR[id] = { n, c: CAT, kind: 'cam', f });
  const io = (u, n = 5) => (u < 0.5 ? stp(E.outCubic(clamp(u * 2.4)), n) : 1 - stp(E.inCubic(clamp((u - 0.5) * 2.4)), n));
  cover('opSlash', 'アニメOP：斜めスラッシュ（3色が切り裂く）', (ctx, u, R) => {
    const cols = [R.pal.accent, R.pal.text, R.pal.sub], sk = 0.42, X = R.W + R.H * sk * 2;
    ctx.save(); ctx.transform(1, 0, -sk, 1, R.H * sk * 0.5, 0);
    cols.forEach((c, i) => { const d = i * 0.06, lead = stp(E.outCubic(clamp((u - d) / 0.36)), 5) * X, trail = stp(E.inCubic(clamp((u - 0.5 - d * 0.6) / 0.38)), 5) * X; if (lead > trail) { ctx.fillStyle = c; ctx.fillRect(-R.H * sk + trail, 0, lead - trail + 1, R.H); } });
    ctx.restore();
  });
  const star = (ctx, cx, cy, r, n, rot, inner) => { for (let i = 0; i <= n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, rr = i % 2 ? r * inner : r; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
  cover('opIrisStar', 'アニメOP：星形アイリス（弾けて開く）', (ctx, u, R) => {
    const Dm = Math.hypot(R.W, R.H) * 0.95, cx = R.W / 2, cy = R.H / 2, out = stp(E.outCubic(clamp(u * 2.3)), 5) * Dm, inn = stp(E.inCubic(clamp((u - 0.5) * 2.3)), 5) * Dm * 1.6;
    ctx.fillStyle = R.pal.accent; ctx.beginPath(); star(ctx, cx, cy, out, 9, u * 1.5, 0.62); if (inn > 0) star(ctx, cx, cy, inn, 9, -u * 1.5, 0.62); ctx.fill('evenodd');
    if (u > 0.2 && u < 0.62) { ctx.fillStyle = R.pal.sub; ctx.beginPath(); star(ctx, cx, cy, out * 0.72, 9, u * 1.5 + 0.17, 0.62); if (inn > 0) star(ctx, cx, cy, inn, 9, -u * 1.5, 0.62); ctx.fill('evenodd'); }
  });
  cover('opPanelCut', 'アニメOP：コマ割りカット（段が互い違いに走る）', (ctx, u, R) => {
    const n = 4, h = R.H / n, cols = [R.pal.accent, R.pal.sub, R.pal.text, R.pal.accent];
    for (let i = 0; i < n; i++) { const d = i * 0.035, a = stp(E.outCubic(clamp((u - d) * 2.5)), 4), b = stp(E.inCubic(clamp((u - 0.5 - d) * 2.5)), 4), dir = i % 2 ? -1 : 1, x0 = dir > 0 ? b * R.W : R.W - a * R.W, x1 = dir > 0 ? a * R.W : R.W - b * R.W; ctx.fillStyle = cols[i]; ctx.fillRect(Math.min(x0, x1), i * h - 1, Math.abs(x1 - x0), h + 2); ctx.fillStyle = R.pal.bg; if (a > 0 && b < 1) ctx.fillRect(0, i * h - R.minD * 0.004, R.W, R.minD * 0.008); }
  });
  cover('opRays', 'アニメOP：集中線が閉じて開く', (ctx, u, R) => {
    const k = io(u, 5), n = 30, far = Math.hypot(R.W, R.H) * 0.62, cx = R.W / 2, cy = R.H / 2; if (k <= 0) return;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + (u < 0.5 ? 0 : PI / n), w = (TAU / n) * 0.5 * (0.5 + k * 0.56), tip = far * (1 - k * (1.02 + hash(i, 3) * 0.1)); ctx.fillStyle = i % 3 === 0 ? R.pal.accent : i % 3 === 1 ? R.pal.text : R.pal.sub; poly(ctx, [[cx + Math.cos(a - w) * far * 1.1, cy + Math.sin(a - w) * far * 1.1], [cx + Math.cos(a + w) * far * 1.1, cy + Math.sin(a + w) * far * 1.1], [cx + Math.cos(a) * Math.max(0, tip), cy + Math.sin(a) * Math.max(0, tip)]]); }
    if (k >= 1) { ctx.fillStyle = R.pal.accent; ctx.fillRect(0, 0, R.W, R.H); }
  });
  cam('opImpactCut', 'アニメOP：インパクトカット（反転の1コマを挟む）', (u) => { const d = Math.abs(u - 0.5), k = io(u, 3); return { sc: 1 + k * 0.22, rot: (u < 0.5 ? 1 : -1) * k * 0.03, inv: d < 0.1 ? 1 : 0, flash: d < 0.035 ? 0.55 : 0 }; });
  cam('opWhipSmear', 'アニメOP：スミア・ウィップ（斜めに伸びて切り替わる）', (u) => { const k = io(u, 4); return { tx: (u < 0.5 ? -1 : 1) * k * 0.55, skew: (u < 0.5 ? 1 : -1) * k * 0.6, sc: 1 + k * 0.08 }; });

  /* ================= tones ================= */
  // ownLook: the tone keeps to its own flat graphic vocabulary (lyric motifs do not swap in photographic backgrounds)
  const common = { post: [], bg: ['solid'], keyColor: true, beat: true, ownLook: true };
  const NT = [
    Object.assign({}, common, { id: 'animeop', n: 'アニメOP / ハイスピード・ポップ', d: 'コマ打ちの切れ、ビビッドな色面、巨大な文字。拍ごとに画が変わる', emoji: '✹',
      pals: ['op_yellow', 'op_magenta', 'op_cyan', 'op_red', 'op_white', 'op_orange', 'op_violet', 'op_black', 'op_mint'], fonts: ['impact', 'rocknroll', 'gothic', 'anton'],
      layouts: { opGiant: 3, opSlant: 2.5, opPanels: 2, opStep: 2, opSideKey: 1.5, opBoxLabel: 1, bigCrop: 1.2, wordFlash: 1.5, poster: 1 },
      enter: { opSmearIn: 3, opSlamPop: 3, opCutIn: 2, opTypeHit: 1.5, opSpinSnap: 1.5, opRiseKick: 2, opZoomCut: 2, slam: 0.8 },
      hold: { opBeatPose: 3, opBoil: 2, opHopWords: 1.5, opSkewRock: 1.5, opStrobeKey: 1, beatPump: 0.8 },
      exit: { opSmearOut: 3, opCutOut: 2.5, opSquashOut: 1.5, opKickOut: 1.5, opZoomOutCut: 2, cut: 2 },
      filters: { opImpact: 2.5, opShake: 2, opFlashCut: 2, opSpeedOver: 2, opCel: 1, opPattern: 1.2, opOffset: 1, opMatte: 1, speedLines: 0.8 }, post: ['opSticker'],
      camera: { opSnap: 3, opWhip: 2, opDutch: 1.5, punch: 1 }, fx: 0.9, maxFx: 3, speed: 1.35, amp: 1.3, react: 35,
      tr: { opSlash: 3, opPanelCut: 2, opRays: 2, opIrisStar: 1.5, opImpactCut: 2.5, opWhipSmear: 2, colorBlocks: 1 }, trRate: 0.9,
      gx: { opFlashBurst: 2, opUnderSlash: 2, opPopShapes: 2, opArrows: 1.5, opTicks: 0.8, lineBurst: 1 }, gxRate: 0.6,
      bgm: { opPlanes: 3, opBurst: 2, opStripes: 2, opShapes: 2, opSunray: 1.5, opHalftone: 1.5, opGrid: 1 } }),
    Object.assign({}, common, { id: 'titleseq', n: 'タイトルバック / グラフィック', d: 'マス目の色面、文字のテクスチャ、切り紙の帯、枠囲みのクレジット。静と動の切り替え', emoji: '▚',
      pals: ['op_noir', 'op_bluenote', 'op_paper', 'op_room', 'op_signal', 'op_black', 'op_red'], fonts: ['bebas', 'gothic', 'mincho', 'alfaslab'],
      layouts: { opCredit: 3, opBoxLabel: 2.5, opPanels: 2, opSideKey: 2, opGiant: 1.5, opSlant: 1, bigCrop: 1, editorial: 1 },
      enter: { opCutIn: 3, opTypeHit: 2.5, opZoomCut: 1, opSmearIn: 1, charMask: 1.5, maskDown: 1 },
      hold: { opBoil: 3, none: 2, opStrobeKey: 1, opBeatPose: 1 },
      exit: { opCutOut: 3, cut: 2, opSquashOut: 1.5, opSmearOut: 1 },
      filters: { opOffset: 2.5, opFlashCut: 1.5, opImpact: 1.2, opMatte: 1.5, opPattern: 0.8, opSticker: 1.5, noise: 1 }, post: ['noise'],
      camera: { opHand12: 2.5, opDutch: 2, still: 1.5, opSnap: 1 }, fx: 0.7, maxFx: 2, speed: 1.15, amp: 1.1, react: 20,
      tr: { opPanelCut: 3, opSlash: 2, opImpactCut: 1.5, barsH: 1, flashWhite: 0.8 }, trRate: 0.75,
      gx: { opTicks: 2.5, opUnderSlash: 1.5, opArrows: 1 }, gxRate: 0.45,
      bgm: { opGrid: 3, opBars: 3, opRooms: 2.5, opParts: 2.5, opTypeTex: 2, opPlanes: 1, opHalftone: 1 } }),
  ];
  NT.forEach((t) => { ['fonts'].forEach((k) => (t[k] = t[k].filter((id) => D.fontById[id]))); if (!t.fonts.length) t.fonts = ['gothic']; D.themes.unshift(t); D.themeById[t.id] = t; });
  LM.director_EMPH = Object.assign(LM.director_EMPH || {}, { animeop: { scalePunch: 2, impact: 2, skewSnap: 1.5, elasticHit: 1, colorFlash: 1.2 }, titleseq: { weightHit: 1.5, colorFlash: 1.5, trackExpand: 1, impact: 1 } });
  const add = (id, k, o) => { const t = D.themeById[id]; if (t) t[k] = Object.assign({}, t[k] || {}, o); };
  add('anison', 'layouts', { opGiant: 1.5, opSlant: 1 }); add('anison', 'enter', { opSmearIn: 1.5, opSlamPop: 1.5 }); add('anison', 'exit', { opSmearOut: 1 }); add('anison', 'bgm', { opBurst: 1.5, opPlanes: 1 }); add('anison', 'tr', { opSlash: 1.5, opRays: 1.5, opImpactCut: 1 }); add('anison', 'filters', { opImpact: 1, opSticker: 1 }); add('anison', 'camera', { opSnap: 1 });
  add('vocaloid', 'bgm', { opParts: 1.5, opShapes: 1 }); add('vocaloid', 'enter', { opTypeHit: 1, opCutIn: 1 }); add('vocaloid', 'tr', { opPanelCut: 1 });
  add('jpop', 'bgm', { opShapes: 1.2, opSunray: 1, opHalftone: 0.8 }); add('jpop', 'filters', { opSticker: 1 }); add('jpop', 'gx', { opPopShapes: 1 });
  add('hiphop', 'bgm', { opTypeTex: 1, opGrid: 0.8 }); add('rock', 'tr', { opSlash: 1, opImpactCut: 1 }); add('cinematic', 'bgm', { opBars: 1 }); add('cinematic', 'layouts', { opCredit: 1 });
})();
