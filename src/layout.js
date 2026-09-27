/* Layouts: arrange glyphs & decorations for one cue */
'use strict';
LM.layout = (() => {
  const { clamp, lerp } = LM.U;
  const T = LM.typo;
  const PI = Math.PI;

  // fit+place helper
  function block(L, P, box, o = {}) {
    if (L.H > L.W * 1.2 && !o.vertical && !o.noGrow) o = Object.assign({}, o, { maxLines: (o.maxLines || L.maxLines || 4) + 2 });
    const f = T.fit(P, Object.assign({ font: L.font, w: box.w, h: box.h, lh: L.lh, track: L.track, emphScale: L.emphScale, emphKey: false, maxLines: L.maxLines || 4 }, o));
    if (L.scale !== 1 && f.size) {
      // user text scale: allow shrink freely, enlarge limited to safe box
      const lim = Math.min(L.safe.w / Math.max(...f.lines.map((l) => l.w), 1), L.safe.h / Math.max(f.lines.reduce((a, l) => a + l.h, 0), 1));
      const k = Math.min(L.scale, lim * 0.98 > 1 ? lim * 0.98 : 1);
      if (L.scale < 1 || k > 1) scaleFit(f, L.scale < 1 ? L.scale : k);
    }
    const pl = T.place(f, box.cx, box.cy, o.align || 'center', { lh: L.lh, vertical: o.vertical });
    return pl;
  }
  function scaleFit(f, k) {
    f.size *= k; f.track *= k;
    f.lines.forEach((l) => { l.w *= k; l.h *= k; l.gs.forEach((g) => { g.adv *= k; g.sz *= k; }); });
  }
  const bbox = (gl) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    gl.forEach((g) => { x0 = Math.min(x0, g.x - g.w / 2); x1 = Math.max(x1, g.x + g.w / 2); y0 = Math.min(y0, g.y - g.size / 2); y1 = Math.max(y1, g.y + g.size / 2); });
    if (x0 > x1) return { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  const rotAround = (gl, cx, cy, a) => {
    const cs = Math.cos(a), sn = Math.sin(a);
    gl.forEach((g) => { const dx = g.x - cx, dy = g.y - cy; g.x = cx + dx * cs - dy * sn; g.y = cy + dx * sn + dy * cs; g.rot = (g.rot || 0) + a; });
  };
  // split parsed text into two halves by tokens
  function splitHalves(P) {
    if (P.segments.length >= 2) {
      const h = Math.ceil(P.segments.length / 2);
      return [{ segments: P.segments.slice(0, h) }, { segments: P.segments.slice(h) }].map(fin);
    }
    const toks = P.segments[0] || [];
    const total = toks.reduce((a, t) => a + t.gs.length, 0);
    let acc = 0, cut = 1;
    for (let i = 0; i < toks.length; i++) { acc += toks[i].gs.length; if (acc >= total / 2) { cut = i + 1; break; } }
    if (toks.length <= 1) {
      const gs = toks[0] ? toks[0].gs : [];
      const m = Math.ceil(gs.length / 2);
      return [{ segments: [[{ gs: gs.slice(0, m) }]] }, { segments: [[{ gs: gs.slice(m) }]] }].map(fin);
    }
    return [{ segments: [toks.slice(0, cut)] }, { segments: [toks.slice(cut)] }].map(fin);
  }
  function fin(p) {
    p.segments = p.segments.filter((s) => s.length && s.some((t) => t.gs.length));
    p.count = p.segments.reduce((a, s) => a + s.reduce((b, t) => b + t.gs.length, 0), 0);
    return p;
  }
  const tag = (gl, props) => gl.forEach((g) => Object.assign(g, props));
  const repText = (P) => P.plain.replace(/\s+/g, ' ');

  const L = {
    poster: { n: '巨大ポスター', c: '中央', f(L, P) {
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w, h: L.safe.h * 0.86 }, { lh: 1.1, maxLines: 4 });
      return { glyphs: r.glyphs, lines: r.lines };
    } },
    center: { n: 'センター（標準）', c: '中央', f(L, P) {
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.82, h: L.safe.h * 0.52 }, { maxLines: 3 });
      return { glyphs: r.glyphs, lines: r.lines };
    } },
    subtitle: { n: '字幕（下部）', c: '中央', f(L, P) {
      const h = L.minD * 0.2, cy = L.safe.y + L.safe.h - h / 2;
      const r = block(L, P, { cx: L.W / 2, cy, w: L.safe.w * 0.92, h }, { maxLines: 2, maxSize: L.minD * 0.075, noGrow: true });
      return { glyphs: r.glyphs, lines: r.lines };
    } },
    vertical: { n: '縦組み', c: '中央', f(L, P) {
      const colLen = L.safe.h * (L.W > L.H ? 0.86 : 0.72), across = L.safe.w * (L.W > L.H ? 0.5 : 0.8);
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: colLen, h: across }, { vertical: true, lh: 1.35, maxLines: 5, align: 'left' });
      const b = bbox(r.glyphs);
      return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'line', x1: b.x + b.w + L.minD * 0.04, y1: b.y, x2: b.x + b.w + L.minD * 0.04, y2: b.y + b.h, col: 'accent', lw: L.S * 3, anim: 'draw' }] };
    } },
    diagonal: { n: '斜め帯', c: '帯', f(L, P) {
      const ang = -0.14;
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.86, h: L.safe.h * 0.42 }, { lh: 1.12, maxLines: 3 });
      const b = bbox(r.glyphs);
      rotAround(r.glyphs, L.W / 2, L.cy, ang);
      r.lines.forEach((l) => (l.rot = ang));
      tag(r.glyphs, { on: 'accent' });
      return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'band', cx: L.W / 2, cy: L.cy, w: Math.hypot(L.W, L.H) * 1.2, h: b.h + L.minD * 0.12, rot: ang, col: 'accent', anim: 'grow-x' }] };
    } },
    echo: { n: '残像スタック', c: '反復', f(L, P) {
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.85, h: L.safe.h * 0.3 }, { maxLines: 2 });
      const b = bbox(r.glyphs), step = b.h * 1.02;
      const ghosts = [];
      for (let k = 1; k <= 3; k++) for (const s of [-1, 1]) ghosts.push({ dy: s * step * k, a: 0.55 / k, style: 'outline', col: 'text', delay: k * 0.06 });
      return { glyphs: r.glyphs, lines: r.lines, ghosts };
    } },
    grid: { n: '文字タイル', c: 'グリッド', f(L, P) {
      const gs = []; P.segments.forEach((s) => s.forEach((t) => t.gs.forEach((g) => { if (!/\s/.test(g.ch)) gs.push(g); })));
      const n = gs.length || 1;
      const aw = L.safe.w * 0.92, ah = L.safe.h * 0.8;
      let best = null;
      for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols), cell = Math.min(aw / cols, ah / rows);
        if (!best || cell > best.cell) best = { cols, rows, cell };
      }
      const { cols, rows } = best; const cell = Math.min(best.cell, L.minD * 0.3 * L.scale);
      const x0 = L.W / 2 - (cols * cell) / 2, y0 = L.cy - (rows * cell) / 2;
      const glyphs = [], decos = [];
      gs.forEach((g, i) => {
        const cx = x0 + (i % cols + 0.5) * cell, cy = y0 + (Math.floor(i / cols) + 0.5) * cell;
        const filled = (i + Math.floor(i / cols)) % 2 === 0;
        const sz = cell * 0.66 * (g.emph ? 1.1 : 1);
        glyphs.push({ ch: g.ch, x: cx, y: cy, size: sz, w: sz, line: Math.floor(i / cols), emph: g.emph, key: g.key, rb: g.rb, on: filled ? 'accent' : 'bg' });
        decos.push({ t: 'rect', x: cx - cell * 0.46, y: cy - cell * 0.46, w: cell * 0.92, h: cell * 0.92, col: filled ? 'accent' : 'text', style: filled ? 'fill' : 'stroke', lw: L.S * 2, a: filled ? 1 : 0.35, anim: 'pop', i });
      });
      return { glyphs, lines: [], decos };
    } },
    orbit: { n: '円環', c: 'グリッド', f(L, P) {
      const gs = []; P.segments.forEach((s) => s.forEach((t) => t.gs.forEach((g) => gs.push(g))));
      const n = gs.length || 1, R = L.minD * 0.32 * clamp(L.scale, 0.6, 1.2);
      const full = n >= 9;
      let size = Math.min((2 * PI * R * 0.9) / (n * 1.05), R * 0.42);
      if (!full) size = Math.min(R * 0.42, (PI * R * 1.1) / n);
      const span = full ? 2 * PI : (n * size * 1.08) / R;
      const glyphs = [];
      gs.forEach((g, i) => {
        const a = -PI / 2 - span / 2 + (full ? (i / n) * span + span / n / 2 : (i + 0.5) * (span / n));
        glyphs.push({ ch: g.ch, x: L.W / 2 + Math.cos(a) * R, y: L.cy + Math.sin(a) * R, size, w: size, rot: a + PI / 2, line: 0, emph: g.emph, key: g.key, rb: g.rb });
      });
      return { glyphs, lines: [], decos: [{ t: 'ring', cx: L.W / 2, cy: L.cy, r: R - size * 0.75, col: 'accent', lw: L.S * 2.5, anim: 'draw' }, { t: 'ring', cx: L.W / 2, cy: L.cy, r: R + size * 0.75, col: 'sub', lw: L.S * 1.2, a: 0.6, dash: [L.S * 4, L.S * 10], spin: 0.15, anim: 'draw' }] };
    } },
    split: { n: '二分割', c: '帯', f(L, P) {
      const [A, B] = splitHalves(P);
      const land = L.W > L.H * 1.15;
      let ga, gb, decos;
      if (land) {
        const w = L.W / 2;
        ga = block(L, A, { cx: w / 2, cy: L.cy, w: w * 0.8, h: L.safe.h * 0.6 }, { maxLines: 3 });
        gb = block(L, B, { cx: w * 1.5, cy: L.cy, w: w * 0.8, h: L.safe.h * 0.6 }, { maxLines: 3 });
        decos = [{ t: 'rect', x: 0, y: 0, w, h: L.H, col: 'accent', anim: 'grow-y' }];
      } else {
        const h = L.H / 2;
        ga = block(L, A, { cx: L.W / 2, cy: h / 2 + L.safe.y * 0.3, w: L.safe.w * 0.9, h: h * 0.62 }, { maxLines: 3 });
        gb = block(L, B, { cx: L.W / 2, cy: h * 1.5 - L.safe.y * 0.3, w: L.safe.w * 0.9, h: h * 0.62 }, { maxLines: 3 });
        decos = [{ t: 'rect', x: 0, y: 0, w: L.W, h, col: 'accent', anim: 'grow-x' }];
      }
      const minS = Math.min(ga.size, gb.size);
      tag(ga.glyphs, { on: 'accent' });
      gb.glyphs.forEach((g) => (g.line += 10));
      return { glyphs: ga.glyphs.concat(gb.glyphs), lines: ga.lines.concat(gb.lines), decos, sizeHint: minS };
    } },
    stairs: { n: '階段', c: '動き', f(L, P) {
      const bw = L.safe.w * 0.7;
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: bw, h: L.safe.h * 0.62 }, { maxLines: 4, minLines: Math.min(3, (P.units ?? P.count) > 5 ? 3 : 2), align: 'left' });
      const k = r.lines.length, step = (L.safe.w - r.w) / Math.max(1, k - 1);
      r.glyphs.forEach((g) => (g.x += (g.line - (k - 1) / 2) * Math.min(step, L.minD * 0.14)));
      r.lines.forEach((l, i) => (l.x += (i - (k - 1) / 2) * Math.min(step, L.minD * 0.14)));
      return { glyphs: r.glyphs, lines: r.lines };
    } },
    outline: { n: 'アウトライン', c: '中央', f(L, P) {
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w, h: L.safe.h * 0.8 }, { lh: 1.1, maxLines: 4 });
      r.glyphs.forEach((g) => { if (!(g.emph || g.key)) g.style = 'outline'; else g.col = 'accent'; });
      return { glyphs: r.glyphs, lines: r.lines };
    } },
    ribbon: { n: '流れる帯', c: '帯', f(L, P) {
      const bandH = L.minD * 0.26;
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.92, h: bandH * 0.72 }, { maxLines: 2 });
      tag(r.glyphs, { on: 'accent' });
      const b = bbox(r.glyphs); const bh = Math.max(bandH, b.h + L.minD * 0.08);
      const txt = repText(P), ms = bh * 0.32;
      return { glyphs: r.glyphs, lines: r.lines, decos: [
        { t: 'marquee', y: L.cy - bh / 2 - ms * 1.2, size: ms, text: txt, speed: 0.06, dir: -1, col: 'sub', a: 0.9, style: 'outline' },
        { t: 'band', cx: L.W / 2, cy: L.cy, w: L.W * 1.1, h: bh, rot: 0, col: 'accent', anim: 'grow-x' },
        { t: 'marquee', y: L.cy + bh / 2 + ms * 1.2, size: ms, text: txt, speed: 0.06, dir: 1, col: 'sub', a: 0.9, style: 'outline' },
      ] };
    } },
    burst: { n: '放射', c: '中央', f(L, P) {
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.76, h: L.safe.h * 0.5 }, { maxLines: 3 });
      return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'rays', cx: L.W / 2, cy: L.cy, n: 18, col: 'accent', a: 0.22, spin: 0.05, anim: 'fade' }] };
    } },
    editorial: { n: 'エディトリアル', c: '誌面', f(L, P) {
      const land = L.W > L.H;
      const bw = L.safe.w * (land ? 0.72 : 0.9);
      const cx = L.safe.x + bw / 2;
      const r = block(L, P, { cx, cy: L.cy, w: bw, h: L.safe.h * 0.56 }, { align: 'left', lh: 1.15, maxLines: 4 });
      const b = bbox(r.glyphs), pad = L.minD * 0.045;
      return { glyphs: r.glyphs, lines: r.lines, decos: [
        { t: 'line', x1: b.x, y1: b.y - pad, x2: L.safe.x + L.safe.w, y2: b.y - pad, col: 'text', lw: L.S * 2, anim: 'draw' },
        { t: 'line', x1: b.x, y1: b.y + b.h + pad, x2: L.safe.x + L.safe.w, y2: b.y + b.h + pad, col: 'text', lw: L.S * 1, a: 0.6, anim: 'draw' },
        { t: 'rect', x: b.x, y: b.y - pad - L.S * 16, w: L.S * 40, h: L.S * 8, col: 'accent', anim: 'grow-x' },
      ] };
    } },
    frame: { n: 'フレーム', c: '誌面', f(L, P) {
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.72, h: L.safe.h * 0.46 }, { maxLines: 3 });
      const b = bbox(r.glyphs), pad = L.minD * 0.07;
      return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'frame', x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2, col: 'accent', lw: L.S * 3, anim: 'draw' }] };
    } },
    corner: { n: 'コーナー', c: '誌面', f(L, P) {
      const bw = L.safe.w * (L.W > L.H ? 0.6 : 0.88), bh = L.safe.h * (L.W > L.H ? 0.4 : 0.34);
      const r = block(L, P, { cx: L.safe.x + bw / 2, cy: L.safe.y + L.safe.h - bh / 2, w: bw, h: bh }, { align: 'left', maxLines: 3 });
      const b = bbox(r.glyphs), len = L.minD * 0.06, pad = L.minD * 0.03;
      return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'corners', x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2, len, col: 'accent', lw: L.S * 3, anim: 'draw' }] };
    } },
    ladder: { n: '交互ステップ', c: '動き', f(L, P) {
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.66, h: L.safe.h * 0.66 }, { maxLines: 4, minLines: (P.units ?? P.count) > 4 ? 2 : 1 });
      r.lines.forEach((l, li) => {
        const target = li % 2 === 0 ? L.safe.x : L.safe.x + L.safe.w - l.w;
        const dx = target - l.x; l.x += dx;
        r.glyphs.forEach((g) => { if (g.line === li) g.x += dx; });
      });
      return { glyphs: r.glyphs, lines: r.lines };
    } },
    mirror: { n: '鏡面反射', c: '反復', f(L, P) {
      const cy = L.cy - L.safe.h * 0.08;
      const r = block(L, P, { cx: L.W / 2, cy, w: L.safe.w * 0.86, h: L.safe.h * 0.36 }, { maxLines: 2 });
      const b = bbox(r.glyphs); const hy = b.y + b.h + L.minD * 0.02;
      return { glyphs: r.glyphs, lines: r.lines, ghosts: [{ mirrorY: hy, a: 0.28, fade: true }], decos: [{ t: 'line', x1: L.safe.x, y1: hy, x2: L.safe.x + L.safe.w, y2: hy, col: 'sub', lw: L.S, a: 0.5, anim: 'draw' }] };
    } },
    depth: { n: '奥行きトンネル', c: '反復', f(L, P) {
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.8, h: L.safe.h * 0.42 }, { maxLines: 3 });
      const ghosts = [];
      for (let k = 1; k <= 6; k++) ghosts.push({ s: Math.pow(0.8, k), dy: -k * L.minD * 0.012, a: 0.5 * Math.pow(0.72, k), style: 'outline', col: k % 2 ? 'accent' : 'sub', delay: k * 0.05, behind: true });
      return { glyphs: r.glyphs, lines: r.lines, ghosts };
    } },
    columns: { n: '二段コラム', c: '誌面', f(L, P) {
      const [A, B] = splitHalves(P);
      const land = L.W > L.H;
      let ga, gb, decos;
      if (land) {
        const cw = L.safe.w * 0.44;
        ga = block(L, A, { cx: L.safe.x + cw / 2, cy: L.cy, w: cw, h: L.safe.h * 0.6 }, { align: 'left', maxLines: 3 });
        gb = block(L, B, { cx: L.safe.x + L.safe.w - cw / 2, cy: L.cy, w: cw, h: L.safe.h * 0.6 }, { align: 'right', maxLines: 3 });
        decos = [{ t: 'line', x1: L.W / 2, y1: L.cy - L.safe.h * 0.3, x2: L.W / 2, y2: L.cy + L.safe.h * 0.3, col: 'accent', lw: L.S * 2, anim: 'draw' }];
      } else {
        const ch = L.safe.h * 0.36;
        ga = block(L, A, { cx: L.W / 2, cy: L.cy - ch * 0.62, w: L.safe.w * 0.9, h: ch }, { align: 'left', maxLines: 3 });
        gb = block(L, B, { cx: L.W / 2, cy: L.cy + ch * 0.62, w: L.safe.w * 0.9, h: ch }, { align: 'right', maxLines: 3 });
        decos = [{ t: 'line', x1: L.safe.x, y1: L.cy, x2: L.safe.x + L.safe.w, y2: L.cy, col: 'accent', lw: L.S * 2, anim: 'draw' }];
      }
      gb.glyphs.forEach((g) => (g.line += 10));
      return { glyphs: ga.glyphs.concat(gb.glyphs), lines: ga.lines.concat(gb.lines), decos };
    } },
    spotlight: { n: 'スポットライト', c: '中央', f(L, P) {
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.7, h: L.safe.h * 0.42 }, { maxLines: 3 });
      return { glyphs: r.glyphs, lines: r.lines, decos: [{ t: 'spot', cx: L.W / 2, cy: L.cy, r: L.minD * 0.55, col: 'sub', a: 0.35, anim: 'fade' }] };
    } },
    wordwall: { n: 'ワードウォール', c: '反復', f(L, P) {
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.8, h: L.safe.h * 0.36 }, { maxLines: 2 });
      const b = bbox(r.glyphs); const txt = repText(P);
      const rows = 9, rh = L.H / rows, decos = [];
      for (let i = 0; i < rows; i++) decos.push({ t: 'marquee', y: rh * (i + 0.5), size: rh * 0.62, text: txt, speed: 0.025 + (i % 3) * 0.01, dir: i % 2 ? 1 : -1, col: 'sub', a: 0.16, style: i % 2 ? 'outline' : 'fill' });
      const pad = L.minD * 0.04;
      decos.push({ t: 'rect', x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2, col: 'bg', anim: 'grow-x' });
      return { glyphs: r.glyphs, lines: r.lines, decos };
    } },
    stack: { n: 'ジャスティファイ積み', c: '誌面', f(L, P) {
      // each line individually sized to equal width
      const f = T.fit(P, { font: L.font, w: L.safe.w * 0.8, h: L.safe.h * 0.8, lh: 1.02, track: L.track, maxLines: 5, minLines: Math.min(3, Math.max(1, Math.round((P.units ?? P.count) / 3))), preferLines: 3 });
      const bw = L.safe.w * 0.78 * Math.min(1, L.scale);
      const lines = f.lines.map((l) => { const k = Math.min(bw / l.w, 3.2); return { l, k }; });
      // keep one very short line (e.g. "I'm") from exploding next to the others
      const kmin = Math.min(...lines.map((o) => o.k)); lines.forEach((o) => (o.k = Math.min(o.k, kmin * 1.65)));
      let totalH = lines.reduce((a, o) => a + o.l.h * o.k, 0);
      const hk = Math.min(1, (L.safe.h * 0.84) / totalH);
      let y = L.cy - (totalH * hk) / 2;
      const glyphs = [], lbox = [];
      lines.forEach(({ l, k }, li) => {
        k *= hk; const lh = l.h * k; const lw = l.w * k; let x = L.W / 2 - lw / 2;
        l.gs.forEach((g) => { glyphs.push({ ch: g.ch, x: x + (g.adv * k) / 2 + (g.off || 0) * k, y: y + lh / 2, size: g.sz * k, w: g.adv * k, line: li, emph: g.emph, key: g.key, tok: g.tok, space: g.space, rb: g.rb, ft: g.ft, cls: g.cls, bs: g.bs }); x += (g.adv + (g.gap || 0) + (g.tr != null ? g.tr : f.track * g.scale)) * k; });
        lbox.push({ x: L.W / 2 - lw / 2, y, w: lw, h: lh, cy: y + lh / 2 });
        y += lh;
      });
      glyphs.forEach((g) => { if (g.line % 2 === 1 && lines.length > 2) g.col = 'accent'; });
      return { glyphs, lines: lbox };
    } },
    bigsmall: { n: 'ジャンプ率（大小）', c: '誌面', f(L, P) {
      // find key/emph token
      const segs = P.segments; let pre = [], key = [], post = [];
      let found = false;
      segs.forEach((s) => s.forEach((t) => {
        const isK = t.gs.some((g) => g.emph || g.key);
        if (isK && !found && !key.length) key.push(t);
        else if (!key.length) pre.push(t); else post.push(t);
      }));
      if (!key.length) return LM.layout.lib.poster.f(L, P);
      const mk = (toks) => fin({ segments: toks.length ? [toks] : [] });
      const kP = mk(key), aP = mk(pre), bP = mk(post);
      const smallH = L.safe.h * 0.11;
      const kb = block(L, kP, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.95, h: L.safe.h * 0.42 }, { maxLines: 2, lh: 1.05 });
      const kbb = bbox(kb.glyphs);
      let glyphs = kb.glyphs.map((g) => Object.assign(g, { col: 'accent', line: 5 }));
      let lines = kb.lines;
      if (aP.count) { const a = block(L, aP, { cx: L.W / 2, cy: kbb.y - smallH * 0.7, w: L.safe.w * 0.8, h: smallH }, { maxLines: 1 }); glyphs = a.glyphs.concat(glyphs); lines = a.lines.concat(lines); }
      if (bP.count) { const b = block(L, bP, { cx: L.W / 2, cy: kbb.y + kbb.h + smallH * 0.7, w: L.safe.w * 0.8, h: smallH }, { maxLines: 1 }); b.glyphs.forEach((g) => (g.line = 9)); glyphs = glyphs.concat(b.glyphs); lines = lines.concat(b.lines); }
      return { glyphs, lines };
    } },
    marquee: { n: '全面スクロール', c: '反復', f(L, P) {
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.9, h: L.safe.h * 0.26 }, { maxLines: 1 });
      const b = bbox(r.glyphs); const txt = repText(P); const rh = b.h * 1.25; const decos = [];
      for (let k = 1; k <= 3; k++) for (const s of [-1, 1]) decos.push({ t: 'marquee', y: L.cy + s * rh * k, size: b.h * 0.92, text: txt, speed: 0.05 + k * 0.012, dir: (k + (s > 0 ? 1 : 0)) % 2 ? 1 : -1, col: k === 1 ? 'accent' : 'text', a: 0.5 / k + 0.1, style: 'outline' });
      return { glyphs: r.glyphs, lines: r.lines, decos, drift: 0.02 };
    } },
    scatter: { n: 'コラージュ', c: '動き', f(L, P, rng) {
      const toks = []; P.segments.forEach((s) => s.forEach((t) => { if (!t.space) toks.push(t); }));
      const groups = []; const G = Math.min(toks.length, toks.length > 6 ? 4 : 3) || 1;
      const per = Math.ceil(toks.length / G);
      for (let i = 0; i < toks.length; i += per) groups.push(fin({ segments: [toks.slice(i, i + per)] }));
      const n = groups.length; const land = L.W > L.H;
      const cols = land ? Math.min(n, 2) : 1, rows = Math.ceil(n / cols);
      const cw = L.safe.w / cols, ch = L.safe.h / rows;
      let glyphs = [], lines = [];
      groups.forEach((gp, i) => {
        const cx = L.safe.x + cw * ((i % cols) + 0.5) + (rng() - 0.5) * cw * 0.12;
        const cy = L.safe.y + ch * (Math.floor(i / cols) + 0.5) + (rng() - 0.5) * ch * 0.12;
        const r = block(L, gp, { cx, cy, w: cw * lerp(0.6, 0.9, rng()), h: ch * 0.7 }, { maxLines: 2 });
        const a = (rng() - 0.5) * 0.18;
        rotAround(r.glyphs, cx, cy, a);
        r.glyphs.forEach((g) => { g.line += i * 10; if (i % 2) g.col = 'accent'; });
        glyphs = glyphs.concat(r.glyphs); lines = lines.concat(r.lines);
      });
      return { glyphs, lines };
    } },
    wavePath: { n: '波線に沿う', c: '動き', f(L, P) {
      const r = block(L, P, { cx: L.W / 2, cy: L.cy, w: L.safe.w * 0.92, h: L.safe.h * 0.22 }, { maxLines: 1 });
      const amp = L.minD * 0.07, k = (2 * PI) / (L.safe.w * 0.8);
      r.glyphs.forEach((g) => { const ph = (g.x - L.W / 2) * k; g.y += Math.sin(ph) * amp; g.rot = Math.atan(Math.cos(ph) * amp * k); });
      return { glyphs: r.glyphs, lines: [], decos: [{ t: 'wave', cy: L.cy, amp, k, col: 'accent', lw: L.S * 2, a: 0.5, dy: r.size * 0.75, anim: 'draw' }] };
    } },
    labels: { n: '帯テロップ', c: '帯', f(L, P) {
      const land = L.W > L.H;
      const bw = L.safe.w * (land ? 0.7 : 0.9);
      const r = block(L, P, { cx: L.safe.x + bw / 2 + L.minD * 0.02, cy: L.cy, w: bw, h: L.safe.h * 0.5 }, { align: 'left', lh: 1.45, maxLines: 4 });
      tag(r.glyphs, { on: 'accent' });
      const pad = r.size * 0.22;
      const decos = r.lines.map((l, i) => ({ t: 'rect', x: l.x - pad, y: l.cy - r.size * 0.62, w: l.w + pad * 2, h: r.size * 1.24, col: 'accent', anim: 'grow-x', i }));
      return { glyphs: r.glyphs, lines: r.lines, decos };
    } },
  };

  const lib = L;
  return { lib, bbox, block, splitHalves };
})();
