/* Background image library: multiple photos, auto / manual switching, Ken Burns, looks, and crafted image transitions */
'use strict';
(() => {
  const R = LM.Renderer, U = LM.U, { clamp, lerp, hash, mix, rgba } = U, E = LM.E, PI = Math.PI, TAU = PI * 2;
  const mk = () => document.createElement('canvas');
  const inOut = (u) => E.inOutCubic(clamp(u));
  // value noise for organic masks
  const hh = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); return lerp(lerp(hh(xi, yi), hh(xi + 1, yi), xf), lerp(hh(xi, yi + 1), hh(xi + 1, yi + 1), xf), yf); };
  const fbm = (x, y) => vn(x, y) * 0.6 + vn(x * 2.3 + 7, y * 2.3 + 3) * 0.28 + vn(x * 5.1 + 1, y * 5.1 + 9) * 0.12;

  /* ---------- transitions: f(ctx, A, B, u, X) — A/B are canvases of the outgoing / incoming image; X = {W,H,S,minD,pal,seed} ---------- */
  const T = {};
  const def = (id, n, c, f) => (T[id] = { n, c, f });
  const draw = (ctx, cv, a = 1) => { if (a <= 0) return; ctx.globalAlpha = a; ctx.drawImage(cv, 0, 0); ctx.globalAlpha = 1; };
  def('dissolve', 'ディゾルブ（クロスフェード）', 'やわらか', (ctx, A, B, u) => { draw(ctx, A); draw(ctx, B, E.inOutQuad ? E.inOutQuad(u) : inOut(u)); });
  def('filmBurn', 'フィルムバーン（光で焼けて切替）', 'やわらか', (ctx, A, B, u, X) => {
    draw(ctx, A); draw(ctx, B, inOut((u - 0.3) / 0.5));
    const k = Math.sin(clamp(u) * PI); ctx.globalCompositeOperation = 'lighter';
    [['#ff6a00', 0.2, 0.3], ['#ff2d55', 0.75, 0.6], ['#ffd166', 0.5 + (u - 0.5) * 0.6, 0.45]].forEach(([c, x, y]) => { const g = ctx.createRadialGradient(X.W * x, X.H * y, 0, X.W * x, X.H * y, X.minD * (0.3 + k)); g.addColorStop(0, rgba(c, 0.85 * k)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, X.W, X.H); });
    ctx.globalCompositeOperation = 'source-over';
  });
  def('inkDissolve', 'インク・ディゾルブ（有機的ににじむ）', 'やわらか', (ctx, A, B, u, X) => {
    draw(ctx, A); const m = X.r.maskCv(); const w = m.width, h = m.height, mx = m.getContext('2d'), img = mx.createImageData(w, h), d = img.data, k = inOut(u);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const n = fbm(x / w * 4 + X.seed, y / h * 4 * (X.H / X.W)) * 0.7 + (x / w) * 0.3; const a = clamp((k * 1.35 - n) / 0.06 + 0.5); d[(y * w + x) * 4 + 3] = a * 255; }
    mx.putImageData(img, 0, 0);
    const t2 = X.r.tmpCv(2), tx = t2.getContext('2d'); tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, X.W, X.H); tx.drawImage(B, 0, 0);
    tx.globalCompositeOperation = 'destination-in'; tx.imageSmoothingEnabled = true; tx.drawImage(m, 0, 0, X.W, X.H); tx.globalCompositeOperation = 'source-over';
    ctx.drawImage(t2, 0, 0);
  });
  def('iris', 'アイリス（円が開く）', 'シェイプ', (ctx, A, B, u, X) => {
    draw(ctx, A); const r = inOut(u) * Math.hypot(X.W, X.H) * 0.55;
    ctx.save(); ctx.beginPath(); ctx.arc(X.W / 2, X.H / 2, r, 0, TAU); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
    if (u > 0 && u < 1) { ctx.strokeStyle = X.pal.accent; ctx.lineWidth = X.S * 6 * (1 - u); ctx.beginPath(); ctx.arc(X.W / 2, X.H / 2, r, 0, TAU); ctx.stroke(); }
  });
  def('diamond', 'ダイヤ型に開く', 'シェイプ', (ctx, A, B, u, X) => {
    draw(ctx, A); const r = inOut(u) * (X.W + X.H) * 0.55, cx = X.W / 2, cy = X.H / 2;
    ctx.save(); ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
  });
  def('diagWipe', '斜めワイプ（光のエッジ）', 'シェイプ', (ctx, A, B, u, X) => {
    draw(ctx, A); const k = inOut(u), sk = X.H * 0.5, x = lerp(-sk, X.W + sk, k);
    ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x + sk, 0); ctx.lineTo(x - sk, X.H); ctx.lineTo(0, X.H); ctx.closePath(); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
    if (u > 0 && u < 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba('#ffffff', 0.8); ctx.lineWidth = X.S * 8; ctx.shadowColor = X.pal.accent; ctx.shadowBlur = X.S * 30; ctx.beginPath(); ctx.moveTo(x + sk, 0); ctx.lineTo(x - sk, X.H); ctx.stroke(); ctx.restore(); }
  });
  def('blinds', 'ブラインド（帯で順に切替）', 'シェイプ', (ctx, A, B, u, X) => {
    draw(ctx, A); const n = 9, w = X.W / n;
    ctx.save(); ctx.beginPath(); for (let i = 0; i < n; i++) { const k = inOut(u * 1.6 - (i / n) * 0.6); ctx.rect(i * w, 0, w * k + 0.5, X.H); } ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
  });
  def('tiles', 'タイル（ランダムに並び替わる）', 'シェイプ', (ctx, A, B, u, X) => {
    draw(ctx, A); const c = 8, r = Math.ceil(c * X.H / X.W), w = X.W / c, h = X.H / r;
    for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
      const k = E.outBack(clamp(u * 2.2 - hash(i, j, X.seed) * 1.2)); if (k <= 0) continue;
      const sw = w * Math.min(1, k), sh = h * Math.min(1, k);
      ctx.drawImage(B, i * w + (w - sw) / 2, j * h + (h - sh) / 2, sw, sh, i * w + (w - sw) / 2, j * h + (h - sh) / 2, sw, sh);
    }
  });
  def('doors', 'ドア（左右に開いて現れる）', 'シェイプ', (ctx, A, B, u, X) => {
    draw(ctx, B); const k = E.inOutCubic(clamp(u)), off = k * X.W * 0.5;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, X.W / 2 - off, X.H); ctx.clip(); ctx.drawImage(A, -off, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(X.W / 2 + off, 0, X.W / 2, X.H); ctx.clip(); ctx.drawImage(A, off, 0); ctx.restore();
    if (k > 0 && k < 1) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(X.W / 2 - off, 0, X.S * 10, X.H); ctx.fillRect(X.W / 2 + off - X.S * 10, 0, X.S * 10, X.H); }
  });
  def('push', 'プッシュ（横に押し出す）', 'スライド', (ctx, A, B, u, X) => { const k = inOut(u); ctx.drawImage(A, -k * X.W, 0); ctx.drawImage(B, (1 - k) * X.W, 0); });
  def('stack', 'スタック（下から重なる）', 'スライド', (ctx, A, B, u, X) => {
    const k = E.outCubic(clamp(u)), s = 1 - 0.08 * k;
    ctx.fillStyle = X.pal.bg; ctx.fillRect(0, 0, X.W, X.H);
    ctx.save(); ctx.translate(X.W / 2, X.H / 2); ctx.scale(s, s); ctx.translate(-X.W / 2, -X.H / 2); ctx.drawImage(A, 0, 0); ctx.restore();
    ctx.fillStyle = `rgba(0,0,0,${0.45 * k})`; ctx.fillRect(0, 0, X.W, X.H);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = X.minD * 0.05; ctx.drawImage(B, 0, (1 - k) * X.H); ctx.restore();
  });
  def('whip', 'ホイップ（流し撮りで振る）', 'スライド', (ctx, A, B, u, X) => {
    const k = inOut(u), dx = -k * X.W, blur = Math.sin(clamp(u) * PI);
    for (let s = 0; s < 6; s++) { const o = (s / 5 - 0.5) * X.W * 0.12 * blur; ctx.globalAlpha = s === 0 ? 1 : 0.22; ctx.drawImage(A, dx + o, 0); ctx.drawImage(B, dx + X.W + o, 0); }
    ctx.globalAlpha = 1;
  });
  def('zoomThrough', 'ズームスルー（突き抜ける）', 'ダイナミック', (ctx, A, B, u, X) => {
    const k = inOut(u), zA = 1 + k * 1.6, zB = 1 + (1 - k) * 0.5, cx = X.W / 2, cy = X.H / 2;
    const Z = (cv, z, a) => { ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); ctx.drawImage(cv, 0, 0); ctx.restore(); };
    Z(B, zB, 1); for (let s = 0; s < 4; s++) Z(A, zA * (1 + s * 0.06 * Math.sin(u * PI)), (1 - k) * (s ? 0.25 : 1));
  });
  def('glitch', 'グリッチ（スライスとRGBずれ）', 'ダイナミック', (ctx, A, B, u, X) => {
    const k = Math.sin(clamp(u) * PI), src = u < 0.5 ? A : B; draw(ctx, src);
    const n = 14, h = X.H / n, step = Math.floor(u * 24);
    for (let i = 0; i < n; i++) { if (hash(i, step, X.seed) > 0.35 + 0.5 * (1 - k)) continue; const o = (hash(i, step + 9) - 0.5) * X.W * 0.25 * k; const cv = hash(i, step + 3) > 0.5 ? B : A; ctx.drawImage(cv, 0, i * h, X.W, h, o, i * h, X.W, h); }
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * k; ctx.filter = 'hue-rotate(90deg)'; ctx.drawImage(src, X.S * 14 * k, 0); ctx.filter = 'hue-rotate(-90deg)'; ctx.drawImage(src, -X.S * 14 * k, 0);
    ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  });
  def('pixelate', 'ピクセル化で切替', 'ダイナミック', (ctx, A, B, u, X) => {
    const k = Math.sin(clamp(u) * PI), src = u < 0.5 ? A : B, px = Math.max(1, Math.round(1 + k * 48 * X.S));
    const t2 = X.r.tmpCv(3), w = Math.max(2, Math.round(X.W / px)), h = Math.max(2, Math.round(X.H / px)); if (t2.width !== w || t2.height !== h) { t2.width = w; t2.height = h; }
    const tx = t2.getContext('2d'); tx.imageSmoothingEnabled = true; tx.drawImage(src, 0, 0, w, h);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(t2, 0, 0, X.W, X.H); ctx.imageSmoothingEnabled = true;
  });
  def('rgbSplit', 'RGB分離カット', 'ダイナミック', (ctx, A, B, u, X) => {
    const k = Math.sin(clamp(u) * PI), src = u < 0.5 ? A : B; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, X.W, X.H);
    ctx.globalCompositeOperation = 'lighter';
    [['#ff0000', -1], ['#00ff00', 0], ['#0000ff', 1]].forEach(([c, d]) => { const t2 = X.r.tmpCv(4 + d + 1), tx = t2.getContext('2d'); tx.globalCompositeOperation = 'source-over'; tx.drawImage(src, 0, 0); tx.globalCompositeOperation = 'multiply'; tx.fillStyle = c; tx.fillRect(0, 0, X.W, X.H); tx.globalCompositeOperation = 'source-over'; ctx.drawImage(t2, d * X.S * 26 * k, d * X.S * 6 * k); });
    ctx.globalCompositeOperation = 'source-over';
  });
  def('flash', 'フラッシュ（白く飛んで切替）', 'ダイナミック', (ctx, A, B, u, X) => {
    draw(ctx, u < 0.5 ? A : B); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = Math.pow(Math.sin(clamp(u) * PI), 1.6); ctx.fillRect(0, 0, X.W, X.H); ctx.globalAlpha = 1;
  });
  def('spinZoom', 'スピンズーム（回転して入れ替わる）', 'ダイナミック', (ctx, A, B, u, X) => {
    const k = inOut(u), cx = X.W / 2, cy = X.H / 2, src = k < 0.5 ? A : B, z = 1 + Math.sin(k * PI) * 0.9, r = (k < 0.5 ? k : k - 1) * 1.2;
    ctx.fillStyle = X.pal.bg; ctx.fillRect(0, 0, X.W, X.H);
    for (let s = 0; s < 5; s++) { ctx.save(); ctx.globalAlpha = s ? 0.18 : 1; ctx.translate(cx, cy); ctx.rotate(r - s * 0.03 * Math.sin(k * PI)); ctx.scale(z, z); ctx.translate(-cx, -cy); ctx.drawImage(src, 0, 0); ctx.restore(); }
  });
  def('shatter', 'シャッター（三角片に割れる）', 'ダイナミック', (ctx, A, B, u, X) => {
    draw(ctx, B); const c = 6, r = Math.ceil(c * X.H / X.W), w = X.W / c, h = X.H / r, k = clamp(u);
    for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) for (let tri = 0; tri < 2; tri++) {
      const d = clamp(k * 1.8 - hash(i, j * 2 + tri, X.seed) * 0.8); if (d >= 1) continue;
      const q = E.inCubic(d), x0 = i * w, y0 = j * h;
      ctx.save(); ctx.translate(x0 + w / 2, y0 + h / 2); ctx.translate((hash(i, j, 3) - 0.5) * X.W * 0.4 * q, q * X.H * 0.8); ctx.rotate((hash(i, j, 4) - 0.5) * 2.5 * q); ctx.translate(-(x0 + w / 2), -(y0 + h / 2));
      ctx.globalAlpha = 1 - q; ctx.beginPath(); if (tri) { ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.lineTo(x0, y0 + h); } else { ctx.moveTo(x0 + w, y0); ctx.lineTo(x0 + w, y0 + h); ctx.lineTo(x0, y0 + h); } ctx.closePath(); ctx.clip(); ctx.drawImage(A, 0, 0); ctx.restore();
    }
  });
  const THEME_POOL = {
    soft: ['dissolve', 'filmBurn', 'inkDissolve', 'iris', 'zoomThrough'],
    pop: ['push', 'tiles', 'blinds', 'diamond', 'stack', 'doors', 'iris'],
    hard: ['glitch', 'pixelate', 'whip', 'flash', 'rgbSplit', 'zoomThrough', 'spinZoom', 'shatter'],
  };
  const poolOf = (theme) => (/ballad|ambient|cinematic|artistmv|acoustic|wa|dream|lofi/.test(theme || '') ? THEME_POOL.soft : /vj|edm|vocaloid|thermal|edge|rock|metal|hiphop|anison/.test(theme || '') ? THEME_POOL.hard : THEME_POOL.pop);

  /* ---------- renderer extensions ---------- */
  const P = R.prototype;
  P.tmpCv = function (k) { this._itc = this._itc || {}; let c = this._itc[k]; if (!c) c = this._itc[k] = mk(); if (k < 3 && (c.width !== this.W || c.height !== this.H)) { c.width = this.W; c.height = this.H; } if (k >= 4 && (c.width !== this.W || c.height !== this.H)) { c.width = this.W; c.height = this.H; } return c; };
  P.maskCv = function () { if (!this._imk) this._imk = mk(); const a = this.W / this.H, w = 160, h = Math.max(16, Math.round(160 / a)); if (this._imk.width !== w || this._imk.height !== h) { this._imk.width = w; this._imk.height = h; } return this._imk; };
  P.imgList = function () { const p = this.p; if (!p || p.imgMode === 'off' || !Array.isArray(p.images)) return []; return p.images.filter((x) => x && x.on !== false && this.images['img:' + x.id]); };
  // change points and which picture plays in each slot
  P.imageSlots = function () {
    const p = this.p, list = this.imgList(); if (!list.length) return null;
    const cues = this.cues, dur = p.duration || 30, N = Math.max(1, p.imgEvery || 2), mode = p.imgChange || 'auto';
    const key = [list.map((x) => x.id).join(','), mode, N, p.imgOrder, p.seed, dur, this.bpm(), cues.map((c) => c.start.toFixed(2) + (c.img || '')).join('|'), (p.sections || []).map((s) => s.t).join(',')].join('#');
    if (this._isK === key) return this._is;
    let bounds = [0];
    if (mode === 'phrase' || mode === 'manual') cues.forEach((c, i) => { if (i > 0 && (mode === 'manual' ? c.img && c.img !== '__auto' : i % N === 0)) bounds.push(c.start); });
    else if (mode === 'bars') { const B = this.barGrid(), seg = B.bar * N; for (let t = B.t0 + seg; t < dur; t += seg) if (t > 0.5) bounds.push(t); }
    else { // auto: section markers, else every N phrases, else every 4 bars
      const secs = (p.sections || []).map((s) => s.t).filter((t) => t > 0.5);
      if (secs.length) bounds.push(...secs);
      else if (cues.length > 1) cues.forEach((c, i) => { if (i > 0 && i % Math.max(2, N) === 0) bounds.push(c.start); });
      else { const B = this.barGrid(); for (let t = B.t0 + B.bar * 4; t < dur; t += B.bar * 4) bounds.push(t); }
    }
    // per-phrase overrides always create a change point
    cues.forEach((c) => { if (c.img && c.img !== '__auto' && !bounds.some((b) => Math.abs(b - c.start) < 0.05)) bounds.push(c.start); });
    bounds = [...new Set(bounds.map((b) => Math.round(b * 1000) / 1000))].sort((a, b) => a - b);
    const order = list.map((x) => x.id);
    if (p.imgOrder === 'shuffle') for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(hash(p.seed || 1, i, 77) * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const slots = []; let seq = 0;
    bounds.forEach((t0, k) => {
      const cue = cues.find((c) => Math.abs(c.start - t0) < 0.05);
      let id;
      if (cue && cue.img && cue.img !== '__auto' && cue.img !== '__none' && list.some((x) => x.id === cue.img)) id = cue.img;
      else if (cue && cue.img === '__none') id = null;
      else { id = order[seq % order.length]; seq++; if (slots.length && slots[slots.length - 1].id === id && order.length > 1) { id = order[seq % order.length]; seq++; } }
      const tr = p.imgTrans && p.imgTrans !== 'auto' ? p.imgTrans : poolOf(p.theme)[Math.floor(hash(p.seed || 1, k, 31) * poolOf(p.theme).length)];
      slots.push({ t0, t1: bounds[k + 1] ?? Math.max(dur, t0 + 1), id, tr: T[tr] ? tr : 'dissolve', k });
    });
    this._isK = key; this._is = slots; return slots;
  };
  // draw one picture with fit, Ken Burns, look and dim into ctx
  // clip time for a video entry: from the start of its slot (default) or locked to the song clock; trim + speed + loop
  P.videoTime = function (ent, slot, t, im) {
    const dur = (im && im.duration) || ent.dur || 0, a = U.clamp(ent.vin || 0, 0, Math.max(0, dur - 0.05)), b = ent.vout > a ? Math.min(ent.vout, dur || ent.vout) : dur || a + 1;
    const span = Math.max(0.05, b - a), sp = ent.speed || 1;
    let x = (ent.sync === 'song' ? t : t - slot.t0) * sp;
    if (ent.sync !== 'song' && slot.t0 > t) x = 0;
    x = ent.loop === false ? U.clamp(x, 0, span - 0.02) : ((x % span) + span) % span;
    return a + x;
  };
  // slots visible at time t (the current one, plus the neighbour during a transition)
  P.activeImageSlots = function (t) {
    const slots = this.imageSlots(); if (!slots || !slots.length) return [];
    const p = this.p; let i = slots.findIndex((s) => t >= s.t0 && t < s.t1); if (i < 0) i = t < slots[0].t0 ? 0 : slots.length - 1;
    const bpm = this.bpm() || 120, dur = p.imgTransDur > 0 ? p.imgTransDur : clamp(60 / bpm, 0.35, 1.2);
    const cur = slots[i], next = slots[i + 1], out = [cur];
    if (next && t > next.t0 - dur / 2) out.push(next); else if (i > 0 && t < cur.t0 + dur / 2) out.push(slots[i - 1]);
    return out;
  };
  // export: decode the exact video frames needed at time t before rendering it
  P.prepareVideos = async function (t) {
    if (!this.images || !this.images.__hasVideo || !this.p || this.p.imgMode === 'off') return;
    for (const sl of this.activeImageSlots(t)) {
      const im = this.images['img:' + sl.id]; if (!im || !im.isVideo || !im.seek) continue;
      const ent = (this.p.images || []).find((x) => x.id === sl.id) || {};
      await im.seek(this.videoTime(ent, sl, t, im));
    }
  };
  P.paintImage = function (ctx, id, slot, t, pal, beat) {
    const p = this.p, W = this.W, H = this.H, im0 = id && this.images['img:' + id];
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
    if (!im0) return;
    const bg = p.bg || {}, ent = (p.images || []).find((x) => x.id === id) || {};
    const im = im0.isVideo ? { width: im0.width, height: im0.height, src: im0.source(this.videoTime(ent, slot, t, im0), ent.speed || 1) } : { width: im0.width, height: im0.height, src: im0 };
    const q = clamp((t - slot.t0 + 0.8) / Math.max(1, slot.t1 - slot.t0 + 1.6));
    let s = Math.max(W / im.width, H / im.height), dx = 0, dy = 0;
    if (p.imgKB !== false && !(im0.isVideo && ent.kb === false)) { const dir = hash(slot.k, 5, p.seed || 1) > 0.5 ? 1 : -1; s *= dir > 0 ? lerp(1.04, 1.16, q) : lerp(1.16, 1.04, q); dx = (hash(slot.k, 6) - 0.5) * 0.06 * W * (q - 0.5) * 2; dy = (hash(slot.k, 7) - 0.5) * 0.05 * H * (q - 0.5) * 2; }
    if (p.imgBeat && p.beatSync !== false) s *= 1 + beat * 0.012;
    const fx = ent.fx == null ? 0.5 : ent.fx, fy = ent.fy == null ? 0.5 : ent.fy;
    const iw = im.width * s, ih = im.height * s, x = (W - iw) * fx + dx, y = (H - ih) * fy + dy;
    const look = p.imgLook || 'natural', blur = bg.blur || 0;
    const f = []; if (blur) f.push(`blur(${(blur * this.S).toFixed(1)}px)`); if (look === 'mono' || look === 'duo') f.push('grayscale(1) contrast(1.12)'); if (look === 'vivid') f.push('saturate(1.35) contrast(1.08)'); if (look === 'fade') f.push('contrast(0.85) saturate(0.8) brightness(1.05)');
    ctx.filter = f.length ? f.join(' ') : 'none';
    ctx.drawImage(im.src, x, y, iw, ih); ctx.filter = 'none';
    if (look === 'duo') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = pal.accent; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = mix(pal.bg, '#000000', 0.55); ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    else if (look === 'tint') { ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = 0.55; ctx.fillStyle = pal.accent; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    const dim = bg.dim == null ? 0.35 : bg.dim; if (dim > 0) { ctx.globalAlpha = dim; ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  };
  // full background with transitions between slots
  P.drawImages = function (ctx, t, pal, beat) {
    const slots = this.imageSlots(); if (!slots) return false;
    const p = this.p; let i = slots.findIndex((s) => t >= s.t0 && t < s.t1); if (i < 0) i = t < slots[0].t0 ? 0 : slots.length - 1;
    const bpm = this.bpm() || 120, dur = p.imgTransDur > 0 ? p.imgTransDur : clamp(60 / bpm, 0.35, 1.2);
    const cur = slots[i];
    // transition window centred on the change point
    const next = slots[i + 1], inN = next && t > next.t0 - dur / 2, inC = i > 0 && t < cur.t0 + dur / 2;
    let A = null, B = null, u = 0, tr = null, sa = null, sb = null;
    if (inN) { sa = cur; sb = next; u = (t - (next.t0 - dur / 2)) / dur; tr = next.tr; }
    else if (inC) { sa = slots[i - 1]; sb = cur; u = (t - (cur.t0 - dur / 2)) / dur; tr = cur.tr; }
    if (!tr || sa.id === sb.id) { this.paintImage(ctx, cur.id, cur, t, pal, beat); return true; }
    A = this.tmpCv(0); B = this.tmpCv(1);
    const ax = A.getContext('2d'), bx = B.getContext('2d'); ax.setTransform(1, 0, 0, 1, 0, 0); bx.setTransform(1, 0, 0, 1, 0, 0);
    this.paintImage(ax, sa.id, sa, t, pal, beat); this.paintImage(bx, sb.id, sb, t, pal, beat);
    ctx.save(); T[tr].f(ctx, A, B, clamp(u), { W: this.W, H: this.H, S: this.S, minD: this.minD, pal, seed: sb.k * 7 + 3, r: this }); ctx.restore();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    return true;
  };
  R.imgTrans = T; R.imgPool = poolOf;
})();
