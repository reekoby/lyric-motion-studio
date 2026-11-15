/* Anime-opening / title-sequence pack, part 1 — type, motion, camera and accent graphics.
 * The grammar of TV-animation openings and graphic title sequences, as techniques (no artwork from any title is used):
 *  - limited animation: poses are held and change "on twos" (12 fps) or on the beat instead of easing smoothly,
 *    with smear frames (a glyph stretched along its path for one frame) and 1–2 frame overshoots
 *  - bold type: a cropped giant key word against small lines on plates, slanted colour bands, slanted panels,
 *    a key word running up the edge, boxed credits on a colour band, off-centre credit setting, a rising staircase
 *  - sticker text (thick outline + hard block shadow) and pattern-filled text that stay readable on any colour field
 *  - snap cameras: beat-stepped zoom, dutch-angle flips, whip-in, 12 fps handheld
 * Everything is a pure function of time / beat number so scrubbing and export are deterministic. */
'use strict';
(() => {
  const U = LM.U, { clamp, lerp, hash, mix } = U, E = LM.E, M = LM.motion, D = LM.data;
  const L0 = LM.layout, lib = L0.lib, block = L0.block, bbox = L0.bbox;
  const PI = Math.PI, TAU = PI * 2, CAT = 'アニメOP';
  const A = (p, k = 3) => Math.min(1, Math.max(0, p) * k);
  // hold poses: n steps across 0..1 (always lands exactly on 1)
  const stp = (p, n) => (p >= 1 ? 1 : Math.floor(clamp(p) * n) / n);
  const t12 = (t, f = 12) => Math.floor(t * f) / f;
  const lum = (h) => { const [r, g, b] = U.hex2rgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  LM.animeop = { stp, t12, lum };

  /* ================= palettes ================= */
  const P = (id, n, c) => ({ id, n, cat: 'animeop', c });
  D.palCats.animeop = CAT;
  [P('op_yellow', 'イエローパンチ', ['#ffe500', '#111111', '#ff2d6f', '#00b7ff']), P('op_magenta', 'マゼンタショック', ['#ff2079', '#ffffff', '#ffe600', '#1a1a2e']),
    P('op_cyan', 'シアンダッシュ', ['#00cfff', '#0d0d0d', '#ff3b30', '#fff200']), P('op_red', 'レッドアラート', ['#e8112d', '#ffffff', '#111111', '#ffd400']),
    P('op_black', 'ブラックネオン', ['#0b0b0f', '#ffffff', '#ff2d95', '#24e5ff']), P('op_white', 'ホワイトポップ', ['#f7f6f2', '#111111', '#ff3d00', '#2962ff']),
    P('op_orange', 'オレンジバースト', ['#ff7a00', '#101010', '#ffffff', '#5b2bff']), P('op_violet', 'バイオレットナイト', ['#5a1fd1', '#ffffff', '#b6ff00', '#ff4fa3']),
    P('op_mint', 'ミントウォーク', ['#6fe39a', '#ffffff', '#2f7de1', '#ffd84a']), P('op_noir', 'ノワールレッド', ['#0c0c0e', '#f2efe8', '#d90429', '#8a8a8f']),
    P('op_bluenote', 'ブルーノート', ['#0a0a0a', '#f4f1ea', '#1f6fd6', '#e0b040']), P('op_paper', '切り紙モノクロ', ['#0a0a0a', '#ffffff', '#ffffff', '#9a9a9a']),
    P('op_room', '四畳半カラー', ['#2a251d', '#f3ead2', '#d8a531', '#6fa39a']), P('op_signal', 'シグナルグリッド', ['#0b0a14', '#8ff5e6', '#ff1f4b', '#2233c8']),
  ].forEach((p) => { if (!D.palById[p.id]) { D.palettes.push(p); D.palById[p.id] = p; } });

  /* ================= layouts ================= */
  const fin = (p) => { p.segments = p.segments.filter((s) => s.length && s.some((t) => t.gs.length && !t.space)); p.count = p.segments.reduce((a, s) => a + s.reduce((b, t) => b + t.gs.length, 0), 0); return p; };
  const mk = (toks) => { while (toks.length && toks[0].space) toks = toks.slice(1); while (toks.length && toks[toks.length - 1].space) toks = toks.slice(0, -1); return fin({ segments: toks.length ? [toks] : [] }); };
  const allToks = (P) => { const o = []; P.segments.forEach((s, i) => { s.forEach((t) => o.push(t)); }); return o; };
  // key word (emphasised / detected) vs. the rest; without one, the longest word of a multi-word line
  function keySplit(P) {
    const toks = allToks(P), real = toks.filter((t) => !t.space && t.gs.length);
    if (real.length < 2) return null;
    let k = toks.findIndex((t) => !t.space && t.gs.some((g) => g.emph || g.key));
    if (k < 0) { let best = -1; toks.forEach((t, i) => { if (!t.space && t.gs.length > best) { best = t.gs.length; k = i; } }); }
    return { pre: mk(toks.slice(0, k)), key: mk([toks[k]]), post: mk(toks.slice(k + 1)) };
  }
  // split into n groups of roughly equal length, never inside a word
  function groups(P, n) {
    const toks = allToks(P), total = toks.reduce((a, t) => a + (t.space ? 0 : t.gs.length), 0), out = []; let cur = [], acc = 0, gi = 1;
    toks.forEach((t) => { const len = t.space ? 0 : t.gs.length; if (len && gi < n && cur.some((c) => !c.space) && acc + len / 2 > (total * gi) / n) { out.push(mk(cur)); cur = []; gi++; } cur.push(t); acc += len; });
    if (cur.length) out.push(mk(cur));
    return out.filter((g) => g.count);
  }
  const rotAll = (gl, cx, cy, a) => { const cs = Math.cos(a), sn = Math.sin(a); gl.forEach((g) => { const dx = g.x - cx, dy = g.y - cy; g.x = cx + dx * cs - dy * sn; g.y = cy + dx * sn + dy * cs; g.rot = (g.rot || 0) + a; }); };
  const rowsOf = (gl) => { const m = new Map(); gl.forEach((g) => { const k = Math.round(g.y); if (!m.has(k)) m.set(k, []); m.get(k).push(g); }); return [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]); };
  const shift = (gl, dx, dy) => gl.forEach((g) => { g.x += dx; g.y += dy; });
  // a plate that snaps open in three held poses and snaps shut on exit
  const plateQ = (Dd, d = 0) => { const q = stp(E.outExpo(clamp((Dd.pe - d) * 2.2)), 4); return q * (1 - stp(E.inCubic(clamp(Dd.px * 1.4)), 3)); };
  const latHeavy = (P) => { let j = 0, l = 0; P.segments.forEach((s) => s.forEach((t) => t.gs.forEach((g) => { if (g.cls === 'J' || g.cls === 'JP') j++; else if (!t.space) l++; }))); return l > j; };

  lib.opGiant = { n: '巨大キーワード（はみ出し）＋小さな行のプレート', c: CAT, f(L, P) {
    const ks = keySplit(P), md = L.minD, cx = L.W / 2, ang = -0.075;
    if (!ks) { const r = block(L, P, { cx, cy: L.cy, w: L.safe.w * 1.04, h: L.safe.h * 0.7 }, { maxLines: 2, lh: 1.02 }); r.glyphs.forEach((g) => (g.col = 'accent')); rotAll(r.glyphs, cx, L.cy, ang); return { glyphs: r.glyphs, lines: r.lines }; }
    const kb = block(L, ks.key, { cx, cy: L.cy, w: L.safe.w * 1.06, h: L.safe.h * 0.56 }, { maxLines: latHeavy(ks.key) ? 1 : 2, lh: 1.0 });
    kb.glyphs.forEach((g) => { g.col = 'accent'; g.line = 5; });
    const b = bbox(kb.glyphs), sh = Math.min(L.safe.h * 0.11, md * 0.1), plates = [];
    let glyphs = kb.glyphs, lines = kb.lines;
    const small = (Pp, side) => {
      if (!Pp.count) return;
      const cy = side < 0 ? Math.max(L.safe.y + sh * 0.7, b.y - sh * 0.75) : Math.min(L.safe.y + L.safe.h - sh * 0.7, b.y + b.h + sh * 0.75);
      const r = block(L, Pp, { cx: cx + side * L.safe.w * 0.16, cy, w: L.safe.w * 0.6, h: sh }, { maxLines: 1 });
      r.glyphs.forEach((g) => { g.on = 'sub'; g.line = side < 0 ? 1 : 9; });
      const bb = bbox(r.glyphs); plates.push({ x: bb.x - sh * 0.45, y: bb.cy - sh * 0.62, w: bb.w + sh * 0.9, h: sh * 1.24, side });
      glyphs = side < 0 ? r.glyphs.concat(glyphs) : glyphs.concat(r.glyphs); lines = side < 0 ? r.lines.concat(lines) : lines.concat(r.lines);
    };
    small(ks.pre, -1); small(ks.post, 1);
    rotAll(glyphs, cx, L.cy, ang);
    return { glyphs, lines, decos: [{ t: 'fn', f(ctx, Dd) {
      ctx.save(); ctx.translate(cx, L.cy); ctx.rotate(ang); ctx.translate(-cx, -L.cy);
      plates.forEach((p, i) => { const q = plateQ(Dd, i * 0.12); if (q <= 0) return; ctx.fillStyle = Dd.raw.sub; const w = p.w * q; ctx.fillRect(p.side < 0 ? p.x : p.x + p.w - w, p.y, w, p.h); });
      ctx.restore();
    } }] };
  } };

  lib.opSlant = { n: '斜めの色帯に一行ずつ', c: CAT, f(L, P) {
    const md = L.minD, cx = L.W / 2, ang = -0.105;
    const r = block(L, P, { cx, cy: L.cy, w: L.safe.w * 0.8, h: L.safe.h * 0.62 }, { maxLines: 3, lh: 1.42 });
    const rows = rowsOf(r.glyphs), bands = [];
    rows.forEach((row, i) => {
      const on = i % 2 ? 'sub' : 'accent'; shift(row, (i % 2 ? 1 : -1) * md * 0.05 * (rows.length > 1 ? 1 : 0), 0);
      row.forEach((g) => (g.on = on)); const b = bbox(row), pad = b.h * 0.2;
      bands.push({ y: b.y - pad, h: b.h + pad * 2, x0: b.x - b.h * 0.5, x1: b.x + b.w + b.h * 0.5, on, dir: i % 2 ? 1 : -1 });
    });
    rotAll(r.glyphs, cx, L.cy, ang);
    const far = Math.hypot(L.W, L.H);
    return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'fn', f(ctx, Dd) {
      ctx.save(); ctx.translate(cx, L.cy); ctx.rotate(ang); ctx.translate(-cx, -L.cy);
      bands.forEach((b, i) => {
        const q = plateQ(Dd, i * 0.1); if (q <= 0) return;
        // the band runs off one edge of the frame and stops just past the text
        const xa = b.dir < 0 ? cx - far : b.x0, xb = b.dir < 0 ? b.x1 : cx + far, w = (xb - xa) * q;
        ctx.fillStyle = b.on === 'sub' ? Dd.raw.sub : Dd.raw.accent; ctx.fillRect(b.dir < 0 ? xa : xb - w, b.y, w, b.h);
        ctx.fillStyle = Dd.raw.text; const tk = b.h * 0.09; ctx.fillRect(b.dir < 0 ? xa + w : xb - w - tk, b.y, tk, b.h);
      });
      ctx.restore();
    } }] };
  } };

  lib.opPanels = { n: 'コマ割り（斜めに分割した色面に言葉を配る）', c: CAT, f(L, P) {
    const land = L.W >= L.H, gs = groups(P, land ? 3 : 3), n = gs.length, sl = 0.2, W = L.W, H = L.H;
    if (n < 2) return lib.opGiant.f(L, P);
    let glyphs = [], lines = []; const pans = [];
    const cols = ['accent', null, 'sub'];
    gs.forEach((gp, i) => {
      const u0 = i / n, u1 = (i + 1) / n, on = cols[(i + (n === 2 ? 0 : 0)) % 3];
      const box = land ? { cx: L.safe.x + L.safe.w * (u0 + u1) / 2, cy: L.cy + (i - (n - 1) / 2) * H * 0.06, w: (L.safe.w / n) * 0.78, h: L.safe.h * 0.6 } : { cx: W / 2 + (i - (n - 1) / 2) * W * 0.05, cy: L.safe.y + L.safe.h * (u0 + u1) / 2, w: L.safe.w * 0.86, h: (L.safe.h / n) * 0.62 };
      const r = block(L, gp, box, { maxLines: land ? 3 : 2, lh: 1.08 });
      r.glyphs.forEach((g) => { if (on) g.on = on; g.line = i * 4; });
      glyphs = glyphs.concat(r.glyphs); lines = lines.concat(r.lines); pans.push({ u0, u1, on, i });
    });
    return { glyphs, lines, decos: [{ t: 'fn', f(ctx, Dd) {
      const gut = Dd.minD * 0.012, k = land ? H * sl : W * sl;
      pans.forEach((p) => {
        const q = plateQ(Dd, p.i * 0.09); if (q <= 0) return;
        const a = (land ? W : H) * p.u0 - (p.i ? 0 : k), b = (land ? W : H) * p.u1 + (p.i === n - 1 ? k : 0);
        ctx.save(); ctx.beginPath();
        if (land) { ctx.moveTo(a + k / 2, 0); ctx.lineTo(b + k / 2, 0); ctx.lineTo(b - k / 2, H); ctx.lineTo(a - k / 2, H); } else { ctx.moveTo(0, a + k / 2); ctx.lineTo(W, a - k / 2); ctx.lineTo(W, b - k / 2); ctx.lineTo(0, b + k / 2); }
        ctx.closePath(); ctx.clip();
        if (p.on) { ctx.fillStyle = p.on === 'sub' ? Dd.raw.sub : Dd.raw.accent; const d = p.i % 2 ? 1 : -1; if (land) ctx.fillRect(0, d < 0 ? 0 : H * (1 - q), W, H * q); else ctx.fillRect(d < 0 ? 0 : W * (1 - q), 0, W * q, H); }
        ctx.restore();
        if (p.i) { ctx.strokeStyle = Dd.raw.text; ctx.lineWidth = gut; ctx.beginPath(); if (land) { ctx.moveTo(a + k / 2, 0); ctx.lineTo(a + k / 2 - k * q, H * q); } else { ctx.moveTo(0, a + k / 2); ctx.lineTo(W * q, a + k / 2 - k * q); } ctx.stroke(); }
      });
    } }] };
  } };

  lib.opSideKey = { n: 'キーワードが端を駆け上がる（90°）', c: CAT, f(L, P) {
    const ks = keySplit(P), W = L.W, H = L.H, md = L.minD;
    if (!ks || W < H || !(ks.pre.count + ks.post.count)) return lib.opGiant.f(L, P);
    const toks = allToks(P).filter((t) => !ks.key.segments[0].includes(t)), rest = mk(toks);
    // set the key word horizontally at frame-height width, then turn it to run bottom-to-top along the right edge
    const kb = block(L, ks.key, { cx: W / 2, cy: H / 2, w: H * 0.8, h: W * 0.24 }, { maxLines: 1, noGrow: true });
    kb.glyphs.forEach((g) => { g.col = 'accent'; g.line = 8; });
    const b0 = bbox(kb.glyphs), kx = W - L.safe.x * 0.6 - b0.h / 2;
    shift(kb.glyphs, 0, 0); rotAll(kb.glyphs, W / 2, H / 2, -PI / 2); shift(kb.glyphs, kx - W / 2, 0);
    const lw = kx - b0.h / 2 - md * 0.06 - L.safe.x;
    const r = block(L, rest, { cx: L.safe.x + lw / 2, cy: L.cy, w: lw * 0.92, h: L.safe.h * 0.5 }, { maxLines: 3, lh: 1.15 });
    const rb = bbox(r.glyphs), sx = kx - b0.h / 2 - md * 0.035;
    return { glyphs: r.glyphs.concat(kb.glyphs), lines: r.lines.concat(kb.lines), decos: [{ t: 'fn', f(ctx, Dd) {
      const q = plateQ(Dd); if (q <= 0) return;
      ctx.fillStyle = Dd.pal.text; ctx.fillRect(sx, H * (1 - q), Dd.minD * 0.008, H * q);
      ctx.fillStyle = Dd.pal.accent; ctx.fillRect(rb.x, rb.y + rb.h + md * 0.03, rb.w * q, md * 0.014);
    } }] };
  } };

  lib.opCredit = { n: 'クレジット組み（片寄せ・罫線・大きな余白）', c: CAT, f(L, P, rng) {
    const md = L.minD, right = rng() < 0.5, top = rng() < 0.35, bw = L.safe.w * (L.W >= L.H ? 0.56 : 0.86);
    const cx = L.W >= L.H ? (right ? L.safe.x + L.safe.w - bw / 2 : L.safe.x + bw / 2) : L.W / 2, cy = L.safe.y + L.safe.h * (top ? 0.3 : 0.7);
    const r = block(L, P, { cx, cy, w: bw, h: L.safe.h * 0.36 }, { maxLines: 3, lh: 1.3 });
    const b = bbox(r.glyphs), y0 = b.y - md * 0.035, sq = md * 0.022;
    return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'fn', f(ctx, Dd) {
      const q = plateQ(Dd); if (q <= 0) return;
      ctx.fillStyle = Dd.pal.text; const lw = Math.max(1, Dd.S * 2);
      if (right) ctx.fillRect(L.W - (L.W - b.x) * q, y0, (L.W - b.x) * q, lw); else ctx.fillRect(0, y0, (b.x + b.w) * q, lw);
      ctx.fillStyle = Dd.pal.accent; ctx.fillRect(right ? b.x - sq * 1.6 : b.x + b.w + sq * 0.6, y0 - sq / 2 + lw / 2, sq * q, sq);
      ctx.fillStyle = Dd.pal.sub; for (let i = 0; i < 5; i++) ctx.fillRect(right ? b.x + i * sq * 0.9 : b.x + b.w - sq * 0.4 - i * sq * 0.9, b.y + b.h + md * 0.03, sq * 0.4, sq * 0.9 * (i < 5 * q ? 1 : 0));
    } }] };
  } };

  lib.opBoxLabel = { n: '色帯の上の枠囲み（クレジット札）', c: CAT, f(L, P) {
    const md = L.minD, cx = L.W / 2;
    const r = block(L, P, { cx, cy: L.cy, w: L.safe.w * 0.84, h: L.safe.h * 0.44 }, { maxLines: 2, lh: 1.5 });
    r.glyphs.forEach((g) => (g.on = 'accent'));
    const rows = rowsOf(r.glyphs).map((row) => { const b = bbox(row), p = b.h * 0.16; return { x: b.x - p * 1.6, y: b.y - p, w: b.w + p * 3.2, h: b.h + p * 2 }; });
    const b = bbox(r.glyphs), pad = md * 0.06, by = b.y - pad, bh = b.h + pad * 2;
    return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'fn', f(ctx, Dd) {
      const q = plateQ(Dd); if (q <= 0) return;
      ctx.fillStyle = Dd.raw.accent; ctx.fillRect(0, by + bh * (1 - q) / 2, L.W, bh * q);
      const q2 = plateQ(Dd, 0.18); if (q2 <= 0) return;
      ctx.strokeStyle = Dd.raw.bg; ctx.lineWidth = Math.max(1.5, md * 0.005); ctx.lineJoin = 'miter';
      rows.forEach((rw) => { const w = rw.w * q2; ctx.strokeRect(rw.x + (rw.w - w) / 2, rw.y, w, rw.h); });
    } }] };
  } };

  lib.opStep = { n: '階段（言葉ごとに大きくなって駆け上がる）', c: CAT, f(L, P) {
    const gs = groups(P, 3), n = gs.length, md = L.minD, cx = L.W / 2;
    if (n < 2) return lib.opGiant.f(L, P);
    let glyphs = [], lines = []; const hs = [0.17, 0.27, 0.42].slice(3 - n), tot = hs.reduce((a, b) => a + b, 0);
    let y = L.safe.y + L.safe.h * (1 - tot * 1.08) / 2; const marks = [];
    gs.forEach((gp, i) => {
      const h = L.safe.h * hs[i], u = n > 1 ? i / (n - 1) : 0.5;
      const r = block(L, gp, { cx: L.safe.x + L.safe.w * lerp(0.3, 0.64, u), cy: y + h / 2, w: L.safe.w * lerp(0.5, 0.7, u), h }, { maxLines: 1 });
      r.glyphs.forEach((g) => { g.line = i * 4; if (i === n - 1) g.col = 'accent'; });
      const b = bbox(r.glyphs); marks.push({ x: b.x, y: b.y + b.h + md * 0.012, w: b.w, i });
      glyphs = glyphs.concat(r.glyphs); lines = lines.concat(r.lines); y += h * 1.08;
    });
    rotAll(glyphs, cx, L.cy, -0.06);
    return { glyphs, lines, decos: [{ t: 'fn', f(ctx, Dd) {
      ctx.save(); ctx.translate(cx, L.cy); ctx.rotate(-0.06); ctx.translate(-cx, -L.cy);
      marks.forEach((m) => { const q = plateQ(Dd, m.i * 0.14); if (q <= 0) return; ctx.fillStyle = m.i % 2 ? Dd.pal.sub : Dd.pal.accent; ctx.fillRect(m.x, m.y, m.w * q, md * 0.012 * (1 + m.i)); });
      ctx.restore();
    } }] };
  } };

  /* ================= motions (limited animation) ================= */
  const gsc = M.gsc, side = (g, c) => (hash(g.wordIdx || 0, c.seed || 0, 3) > 0.5 ? 1 : -1);
  Object.assign(M.enter, {
    opSmearIn: { n: 'スミア：一コマ伸びて横から着地', c: CAT, d: 0.34, st: 0.45, u: 'w', f: (p, g, c) => {
      const q = stp(E.outExpo(p), 4), r = 1 - q, d = side(g, c);
      return { x: d * r * c.W * 0.42 * c.amp, sx: 1 + r * 2.6, skx: -d * r * 0.45, a: p > 0.02 ? 1 : 0, accent: r > 0.3 };
    } },
    opSlamPop: { n: '叩きつけ：大→小→定位置の3ポーズ', c: CAT, d: 0.36, st: 0.5, u: 'w', f: (p, g, c) => {
      const k = p >= 1 ? 3 : Math.min(3, Math.floor(p * 4)), s = [2.4, 0.86, 1.08, 1][k], r = [0.16, -0.05, 0.02, 0][k] * (hash(g.wordIdx || 0, 9) > 0.5 ? 1 : -1);
      return { rot: r * c.amp, sx: s, sy: s, a: p > 0.01 ? 1 : 0, bright: k === 0 ? 0.85 : 0 };
    } },
    opCutIn: { n: 'カットイン：ずれた2コマから定位置へ', c: CAT, d: 0.25, st: 0.3, u: 'l', f: (p, g, c) => {
      const k = p >= 1 ? 3 : Math.floor(p * 3), d = side(g, c);
      return { x: [-0.34, 0.12, 0, 0][k] * g.size * d * c.amp, y: [0.1, -0.04, 0, 0][k] * g.size, skx: [-0.3, 0.1, 0, 0][k] * d, a: p > 0.01 ? 1 : 0, accent: k === 0 };
    } },
    opTypeHit: { n: '一文字ずつ打ち込む（1コマ大きく光る）', c: CAT, d: 0.17, per: true, st: 0.96, f: (p) => {
      const k = p >= 1 ? 2 : Math.floor(p * 2), s = [1.55, 1.12, 1][k];
      return { sx: s, sy: s, a: p > 0.01 ? 1 : 0, accent: k === 0, bright: k === 0 ? 0.5 : 0 };
    } },
    opSpinSnap: { n: '90°刻みで回って着地', c: CAT, d: 0.38, st: 0.5, u: 'w', f: (p, g) => {
      const k = p >= 1 ? 4 : Math.floor(p * 4), d = hash(g.wordIdx || 0, 4) > 0.5 ? 1 : -1, s = [0.4, 0.7, 1.15, 0.96, 1][k];
      return { rot: [-PI, -PI / 2, 0.12, -0.03, 0][k] * d, sx: s, sy: s, a: p > 0.01 ? 1 : 0 };
    } },
    opRiseKick: { n: '下から蹴り上がる（つぶれて伸びる）', c: CAT, d: 0.36, st: 0.6, u: 'g', f: (p, g, c) => {
      const k = p >= 1 ? 4 : Math.floor(p * 4);
      return { y: [1.3, -0.22, 0.06, 0, 0][k] * g.size * c.amp, sy: [1.7, 1.25, 0.86, 1, 1][k], sx: [0.6, 0.85, 1.14, 1, 1][k], a: p > 0.01 ? 1 : 0 };
    } },
    opZoomCut: { n: '奥から3コマで迫る', c: CAT, d: 0.3, st: 0, u: 'a', f: (p, g, c) => {
      const k = p >= 1 ? 3 : Math.floor(p * 3), s = [0.32, 0.72, 1.07, 1][k];
      return gsc({ a: p > 0.01 ? 1 : 0, bright: k === 2 ? 0.35 : 0 }, g, c, s);
    } },
  });
  Object.assign(M.hold, {
    opBoil: { n: '作画の揺れ（3コマ打ちで線が息づく）', c: CAT, f: (ht, g, c) => {
      const k = Math.floor(c.tAbs * 8), a = c.amp || 1, i = g.i || 0;
      return { x: (hash(i, k, 1) - 0.5) * g.size * 0.03 * a, y: (hash(i, k, 2) - 0.5) * g.size * 0.03 * a, rot: (hash(i, k, 3) - 0.5) * 0.035 * a, sx: 1 + (hash(i, k, 4) - 0.5) * 0.03, sy: 1 + (hash(i, k, 5) - 0.5) * 0.03 };
    } },
    opBeatPose: { n: 'ビートごとにポーズが切り替わる', c: CAT, f: (ht, g, c) => {
      const b = c.bn || 0, a = c.amp || 1, dt = Math.max(0, c.tAbs - (c.tb == null ? c.tAbs : c.tb)), hit = dt < 0.085 ? 1 : 0;
      const rot = [0, -0.045, 0.03, -0.02][((b % 4) + 4) % 4] * a, s = [1, 1.06, 0.97, 1.1][((b % 4) + 4) % 4] * (1 + hit * 0.07);
      const T = M.grot({}, g, c, rot + hit * rot * 0.6); return gsc(T, g, c, s);
    } },
    opHopWords: { n: '8分で単語が順に跳ねる（コマ送り）', c: CAT, f: (ht, g, c) => {
      const per = 30 / (c.bpm || 120), k = Math.floor(c.tAbs / per), w = g.wordIdx || 0, n = Math.max(1, c.W_ || 1), on = ((k % n) + n) % n === w % n;
      const u = (c.tAbs / per) % 1, y = on ? [-0.3, -0.18, -0.05, 0][Math.min(3, Math.floor(u * 4))] : 0;
      return { y: y * g.size * (c.amp || 1), sy: on && u < 0.25 ? 1.12 : 1, accent: on && u < 0.5 };
    } },
    opSkewRock: { n: 'ビートで左右に切り返す（斜体）', c: CAT, f: (ht, g, c) => {
      const b = c.bn || 0, dt = Math.max(0, c.tAbs - (c.tb == null ? c.tAbs : c.tb)), d = b % 2 ? 1 : -1, o = dt < 0.085 ? 1.7 : 1;
      return { skx: d * 0.15 * o * (c.amp || 1), x: d * g.size * 0.04 * o };
    } },
    opStrobeKey: { n: 'キーワードが2コマで色を打ち替える', c: CAT, f: (ht, g, c) => {
      const k = Math.floor(c.tAbs * 12), key = g.emph || g.key || g.col === 'accent', dt = Math.max(0, c.tAbs - (c.tb == null ? c.tAbs : c.tb));
      return key ? { accent: k % 4 < 2, bright: dt < 0.085 ? 0.6 : 0, sx: dt < 0.085 ? 1.06 : 1, sy: dt < 0.085 ? 1.06 : 1 } : {};
    } },
  });

  Object.assign(M.exit, {
    opSmearOut: { n: 'スミア：伸びて横へ抜ける', c: CAT, d: 0.26, st: 0.35, u: 'w', f: (p, g, c) => {
      const q = stp(E.inExpo(p), 3), d = -side(g, c);
      return { x: d * q * c.W * 0.5 * c.amp, sx: 1 + q * 2.8, skx: -d * q * 0.5, a: p >= 0.98 ? 0 : 1 };
    } },
    opCutOut: { n: '2コマで色が反転して消える', c: CAT, d: 0.17, st: 0, u: 'a', f: (p) => ({ accent: p > 0.02 && p < 0.5, bright: p >= 0.5 ? 0.9 : 0, a: p >= 0.96 ? 0 : 1, sx: p >= 0.5 ? 1.05 : 1, sy: p >= 0.5 ? 0.94 : 1 }) },
    opSquashOut: { n: '上下につぶれて線になって消える', c: CAT, d: 0.25, st: 0.3, u: 'l', f: (p) => {
      const k = Math.min(3, Math.floor(p * 3)); return { sy: [1, 0.45, 0.08, 0.02][k], sx: [1, 1.18, 1.5, 1.7][k], a: p >= 0.97 ? 0 : 1, bright: k >= 2 ? 0.6 : 0 };
    } },
    opKickOut: { n: '蹴り飛ばされて回りながら飛ぶ', c: CAT, d: 0.34, st: 0.5, u: 'w', f: (p, g, c) => {
      const q = stp(E.inQuad(p), 4), d = hash(g.wordIdx || 0, 6) > 0.5 ? 1 : -1;
      return { x: d * q * c.W * 0.22, y: -q * c.H * 0.55 * c.amp, rot: d * q * 1.9, a: p >= 0.98 ? 0 : 1 };
    } },
    opZoomOutCut: { n: '手前へ3コマで突き抜ける', c: CAT, d: 0.25, st: 0, u: 'a', f: (p, g, c) => {
      const k = Math.min(3, Math.floor(p * 3)), s = [1, 1.5, 2.6, 4.5][k]; return gsc({ a: p >= 0.97 ? 0 : [1, 1, 0.85, 0.5][k] }, g, c, s);
    } },
  });

  // limited animation: poses are held, never motion-blurred into each other
  ['enter', 'hold', 'exit'].forEach((k) => Object.keys(M[k]).forEach((id) => { const m = M[k][id]; if (m.c !== CAT || m._nb) return; const f0 = m.f; m.f = (...a) => { const T = f0(...a); T.nomb = true; return T; }; m._nb = true; }));

  /* ================= cameras ================= */
  Object.assign(D.cameras, { opSnap: 'アニメOP：ビートで段階ズーム（コマ打ち）', opDutch: 'アニメOP：行ごとに傾きを切り返す', opWhip: 'アニメOP：ウィップで飛び込み、押し続ける', opHand12: 'アニメOP：コマ落ちの手持ち' });
  Object.assign(LM.cam2 = LM.cam2 || {}, {
    opSnap: (lx, k) => { const b = ((k.bn || 0) % 4 + 4) % 4, dt = Math.max(0, k.t - (k.tb == null ? k.t : k.tb)), z = [1, 1.06, 1.025, 1.11][b] + (dt < 0.085 ? 0.035 : 0); const s = 1 + (z - 1) * k.amp; lx.scale(s, s); lx.rotate([0, 0.006, -0.008, 0.012][b] * k.amp); },
    opDutch: (lx, k) => { const d = k.seed % 2 ? 1 : -1, flip = k.hp > 0.52 ? -0.55 : 1, a = d * flip * 0.055 * k.amp, z = 1.05 + t12(k.hp, 6) * 0.05 * k.amp; lx.rotate(a); lx.scale(z, z); },
    opWhip: (lx, k) => { const u = clamp(k.lt / 0.22), q = stp(E.outExpo(u), 4), d = k.seed % 2 ? 1 : -1; lx.translate(d * (1 - q) * k.W * 0.5 * k.amp, 0); if (q < 1) lx.transform(1, 0, -d * (1 - q) * 0.4, 1, 0, 0); const z = 1.02 + t12(k.hp * k.dur, 12) / Math.max(0.5, k.dur) * 0.07 * k.amp; lx.scale(z, z); },
    opHand12: (lx, k) => { const f = Math.floor(k.t * 12), a = k.amp * k.S; lx.translate((hash(f, 1) - 0.5) * 16 * a, (hash(f, 2) - 0.5) * 12 * a); lx.rotate((hash(f, 3) - 0.5) * 0.014 * k.amp); const z = 1.04 + k.beat * 0.02 * k.amp; lx.scale(z, z); },
  });

  /* ================= accent graphics ================= */
  const G = LM.gfx.lib, gdef = (id, n, f, top) => (G[id] = { n, c: CAT, f, top: !!top });
  const pop = (e, d = 0) => { const k = Math.floor(clamp((e - d) * 1.6) * 6); return [0, 1.35, 0.9, 1.06, 1, 1, 1][k]; };
  gdef('opFlashBurst', 'ベタフラッシュ（ギザギザの吹き出し）', (ctx, R) => {
    const c = R.kb || R.bb, s = pop(R.e); if (s <= 0 || R.x > 0.6) return;
    const rx = (c.w / 2 + R.minD * 0.07) * s, ry = (c.h / 2 + R.minD * 0.06) * s, n = 22, f = Math.floor(R.tAbs * 8);
    const path = (k) => { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU, o = i % 2 ? 1 : 1.32 + hash(i, R.seed, f) * 0.3; const x = c.cx + Math.cos(a) * rx * o * k, y = c.cy + Math.sin(a) * ry * o * k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
    path(1.06); ctx.fillStyle = R.pal.text; ctx.fill(); path(1); ctx.fillStyle = R.pal.sub; ctx.fill();
  });
  gdef('opUnderSlash', '斜めスラッシュの下線', (ctx, R) => {
    const b = R.bb, q = stp(E.outExpo(clamp(R.e * 2)), 4) * (1 - stp(clamp(R.x * 1.5), 3)); if (q <= 0) return;
    const h = R.minD * 0.03, y = b.y + b.h + h * 0.9, x0 = b.x - h, w = (b.w + h * 2) * q, sk = h * 0.9;
    [[R.pal.text, h * 0.35], [R.pal.accent, 0]].forEach(([col, o]) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x0 + sk + o, y + o); ctx.lineTo(x0 + w + sk + o, y + o); ctx.lineTo(x0 + w + o, y + h + o); ctx.lineTo(x0 + o, y + h + o); ctx.closePath(); ctx.fill(); });
  });
  gdef('opArrows', '矢印ラッシュ（コマ送りで走る）', (ctx, R) => {
    const b = R.bb, a = clamp(R.e * 4) * (1 - clamp(R.x * 2)); if (a <= 0) return;
    const s = R.minD * 0.035, y = b.y - s * 1.5, n = Math.max(4, Math.floor(b.w / (s * 1.3))), ph = Math.floor(R.tAbs * 12);
    for (let i = 0; i < n; i++) { const on = ((i - ph) % 5 + 5) % 5; if (on > 2) continue; const x = b.x + i * (b.w / n); ctx.fillStyle = on === 0 ? R.pal.accent : R.pal.text; ctx.globalAlpha = a * (on === 2 ? 0.45 : 1); ctx.beginPath(); ctx.moveTo(x, y - s * 0.5); ctx.lineTo(x + s * 0.5, y - s * 0.5); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.5, y + s * 0.5); ctx.lineTo(x, y + s * 0.5); ctx.lineTo(x + s * 0.5, y); ctx.closePath(); ctx.fill(); }
  }, true);
  gdef('opTicks', 'トンボとカウンター（画面隅の記号）', (ctx, R) => {
    const a = clamp(R.e * 4) * (1 - clamp(R.x * 2)); if (a <= 0) return;
    const m = R.minD * 0.07, l = R.minD * 0.04, lw = Math.max(1, R.S * 2); ctx.globalAlpha = a; ctx.fillStyle = R.pal.text;
    [[m, m], [R.W - m, m], [m, R.H - m], [R.W - m, R.H - m]].forEach(([x, y]) => { ctx.fillRect(x - l, y - lw / 2, l * 2, lw); ctx.fillRect(x - lw / 2, y - l, lw, l * 2); });
    ctx.font = `700 ${(R.minD * 0.036).toFixed(1)}px "JetBrains Mono","Space Mono",monospace`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const fr = Math.floor(R.tAbs * 24); ctx.fillText(`C-${String((R.seed % 90) + 10)}  ${String(Math.floor(fr / 24 / 60)).padStart(2, '0')}:${String(Math.floor(fr / 24) % 60).padStart(2, '0')}+${String(fr % 24).padStart(2, '0')}`, m + l * 1.6, m);
    ctx.fillStyle = R.pal.accent; ctx.fillRect(R.W - m - l * 5, R.H - m - lw * 2, l * 3.4 * ((fr % 24) / 24), lw * 4);
  }, true);
  gdef('opPopShapes', '図形が弾ける（丸・三角・十字）', (ctx, R) => {
    const b = R.bb; if (R.x > 0.5) return;
    for (let i = 0; i < 6; i++) {
      const s = pop(R.e, i * 0.05); if (s <= 0) continue;
      const a = hash(i, R.seed, 1) * TAU, d = Math.max(b.w, b.h) * 0.5 + R.minD * (0.06 + hash(i, R.seed, 2) * 0.12), x = b.cx + Math.cos(a) * d * 1.15, y = b.cy + Math.sin(a) * d * 0.6, r = R.minD * (0.034 + hash(i, R.seed, 3) * 0.04) * s, kind = (i + Math.floor(hash(R.seed, 4) * 4)) % 4;
      ctx.save(); ctx.translate(x, y); ctx.rotate(hash(i, R.seed, 5) * TAU + t12(R.tAbs, 6) * (i % 2 ? 1 : -1)); ctx.fillStyle = ctx.strokeStyle = [R.pal.accent, R.pal.sub, R.pal.text][i % 3]; ctx.lineWidth = r * 0.45;
      if (kind === 0) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); } else if (kind === 1) { ctx.beginPath(); ctx.moveTo(0, -r * 1.2); ctx.lineTo(r * 1.1, r * 0.8); ctx.lineTo(-r * 1.1, r * 0.8); ctx.closePath(); ctx.fill(); } else if (kind === 2) { ctx.fillRect(-r * 1.2, -r * 0.28, r * 2.4, r * 0.56); ctx.fillRect(-r * 0.28, -r * 1.2, r * 0.56, r * 2.4); } else { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
  }, true);

  /* ================= lyric-layer looks: sticker text, pattern-filled text ================= */
  const cvs = {}, cv = (k, W, H) => { const c = cvs[k] || (cvs[k] = document.createElement('canvas')); if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } return c; };
  function sil(src, W, H, col, k) { const c = cv(k, W, H), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'copy'; x.drawImage(src, 0, 0, W, H); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over'; return c; }
  // silhouette of src grown by r px
  function grow(src, W, H, r, col, k) {
    const s = sil(src, W, H, col, k + 's'), c = cv(k, W, H), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
    const n = r > 6 ? 20 : 12; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; x.drawImage(s, Math.cos(a) * r, Math.sin(a) * r); if (r > 5) x.drawImage(s, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); }
    return c;
  }
  const LF = {
    opSticker: { n: 'ステッカー文字（太フチ＋ベタ影）', f(L, o) {
      const { W, H, pal } = o, sz = o.size || 60, r = Math.max(2, sz * 0.065), dark = lum(pal.text) > 0.45, oc = dark ? '#0c0c0e' : '#ffffff';
      const sc = Math.abs(lum(pal.accent) - lum(oc)) > 0.18 ? pal.accent : pal.sub, d = Math.max(3, sz * 0.1), n = Math.max(2, Math.ceil(d / 1.5));
      const g1 = grow(L, W, H, r, oc, 'g1'), g2 = sil(g1, W, H, sc, 'g2'), out = cv('out', W, H), x = out.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
      for (let i = n; i >= 1; i--) x.drawImage(g2, (d * i) / n, (d * i) / n);
      x.drawImage(g1, 0, 0); x.drawImage(L, 0, 0); return out;
    } },
    opPattern: { n: '柄文字（縞と網点の多色パターンで塗る）', f(L, o) {
      if (o.deco) return LF.opSticker.f(L, o); // plates and bands share the layer: a pattern would swallow them, so those lines get the sticker look
      const { W, H, pal, t } = o, sz = o.size || 60, out = cv('out', W, H), x = out.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
      const pt = cv('pt', W, H), q = pt.getContext('2d'); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'copy'; q.drawImage(L, 0, 0); q.globalCompositeOperation = 'source-atop';
      const cols = [pal.accent, '#ffe600', '#00c8ff', '#7a2cff', '#39e75f', '#ff5a1f', '#ff2d95', pal.sub], bh = Math.max(6, sz * 0.2), off = t12(t, 12) * sz * 0.55;
      // horizontal colour bands that scroll, crossed by slanted bands; halftone dots on every other band
      for (let y = -bh, i = 0; y < H + bh; y += bh, i++) { const k = Math.floor((y + off) / bh); q.fillStyle = cols[((k % cols.length) + cols.length) % cols.length]; q.fillRect(0, y + ((off % bh) + bh) % bh - bh, W, bh + 1); }
      q.save(); q.translate(W / 2, H / 2); q.rotate(-0.5); const Dd = Math.hypot(W, H), sw = sz * 0.7;
      for (let xx = -Dd, i = 0; xx < Dd; xx += sw, i++) { if (i % 3) continue; q.fillStyle = cols[(i * 5 + 3) % cols.length]; q.globalAlpha = 0.85; q.fillRect(xx + ((off * 0.6) % (sw * 3)), -Dd, sw * 0.8, Dd * 2); }
      q.restore(); q.globalAlpha = 0.5; q.fillStyle = '#ffffff'; const ds = Math.max(4, sz * 0.085);
      for (let y = 0, j = 0; y < H; y += ds, j++) { if (Math.floor((y + off) / bh) % 2) continue; for (let xx = (j % 2) * ds * 0.5; xx < W; xx += ds) { q.beginPath(); q.arc(xx, y, ds * 0.26, 0, TAU); q.fill(); } }
      q.globalAlpha = 1; q.globalCompositeOperation = 'source-over';
      const oc = lum(pal.bg) > 0.5 ? '#111111' : '#ffffff'; x.drawImage(grow(L, W, H, Math.max(1.5, sz * 0.028), oc, 'g1'), 0, 0); x.drawImage(pt, 0, 0); return out;
    } },
    opOffset: { n: '版ズレ2色（ずれた色版が重なる）', f(L, o) {
      const { W, H, pal } = o, sz = o.size || 60, d = Math.max(2, sz * 0.06), k = Math.floor(o.t * 6), jx = (hash(k, 1) - 0.5) * d * 0.6, jy = (hash(k, 2) - 0.5) * d * 0.6;
      const out = cv('out', W, H), x = out.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
      // a thin keyline in the paper colour keeps the word readable when a plane of its own colour passes behind it
      const kc = lum(pal.text) > 0.45 ? '#0c0c0e' : '#ffffff';
      x.drawImage(sil(L, W, H, pal.sub, 'g2'), -d + jx, d * 0.6 + jy); x.drawImage(sil(L, W, H, pal.accent, 'g3'), d - jx, -d * 0.5 - jy); x.drawImage(grow(L, W, H, Math.max(1.5, sz * 0.03), kc, 'g1'), 0, 0); x.drawImage(L, 0, 0); return out;
    } },
  };
  LM.fx.cats.animeop = CAT;
  for (const [id, f] of Object.entries(LF)) LM.fx.list[id] = { n: f.n, c: 'animeop', k: 'layer' };
  if (LM.lfx) { const h0 = LM.lfx.has, a0 = LM.lfx.apply; LM.lfx.has = (id) => !!LF[id] || h0(id); LM.lfx.apply = (id, L, o) => (LF[id] ? LF[id].f(L, o) : a0(id, L, o)); }

  /* ================= director metadata ================= */
  LM.director_OVR = LM.director_OVR || {};
  const OV = (k, o) => (LM.director_OVR[k] = Object.assign(LM.director_OVR[k] || {}, o));
  OV('enter', { opSmearIn: [0.85, 'snap kinetic'], opSlamPop: [0.92, 'snap bounce'], opCutIn: [0.7, 'snap kinetic'], opTypeHit: [0.65, 'kinetic snap'], opSpinSnap: [0.8, 'snap bounce'], opRiseKick: [0.72, 'bounce snap'], opZoomCut: [0.82, 'snap cinema'] });
  OV('hold', { opBoil: [0.35, 'organic kinetic'], opBeatPose: [0.75, 'snap bounce'], opHopWords: [0.65, 'bounce kinetic'], opSkewRock: [0.7, 'snap kinetic'], opStrobeKey: [0.8, 'snap glitch'] });
  OV('exit', { opSmearOut: [0.82, 'snap kinetic'], opCutOut: [0.6, 'snap kinetic'], opSquashOut: [0.6, 'bounce snap'], opKickOut: [0.85, 'snap bounce'], opZoomOutCut: [0.8, 'snap cinema'] });
  OV('cam', { opSnap: [0.85, 'snap bounce kinetic'], opDutch: [0.55, 'cinema snap'], opWhip: [0.8, 'snap kinetic'], opHand12: [0.5, 'organic cinema'] });
  LM.director_LONG = (LM.director_LONG || []).concat(['opSlant', 'opCredit', 'opBoxLabel', 'opPanels']);
  LM.director_INTENSE = (LM.director_INTENSE || []).concat(['opSmearIn', 'opSlamPop', 'opSpinSnap', 'opZoomCut']);
})();
