/* Pro motion pass (phase 1 of the effect catalogue):
 *  - full easing library: Penner in / out / in-out families, CSS-style cubic-bezier with a Newton solver,
 *    curated production curves (Material, After Effects easy ease, snappy expo …), steps, slow-mo, rough
 *  - spatial stagger orders (left → right, top → bottom, radial, diagonal, any angle, line by line) and a
 *    spacing curve for the stagger itself
 *  - unit pivots: word / line / phrase motions scale and rotate around the word / line / phrase centre so
 *    letters move as one block instead of piling onto each other
 *  - script-aware scramble pools (kana stay kana, Latin stays Latin, digits stay digits)
 *  - rebuilt motions that looked cheap (overlapping slides, glyphs visible before they start, isotropic
 *    blur used as motion blur, broken stroke write-on, scramble / slot, shatter without shards …)
 *  - new catalogue entrances / exits (split-flap, liquid fill, light scan, shards, clock / checker wipes,
 *    dust, burn, strike-through, select-and-delete, colour drain)
 * Same ids for rebuilt motions, so existing projects pick up the new look. */
'use strict';
(() => {
  const { clamp, lerp, hash } = LM.U;
  const E = LM.E, M = LM.motion, MS = LM.MS, PI = Math.PI;
  const A = (p, k = 3) => Math.min(1, Math.max(0, p) * k);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  /* ================= easing ================= */
  const fam = (fin) => ({ i: fin, o: (t) => 1 - fin(1 - t), io: (t) => (t < 0.5 ? fin(2 * t) / 2 : 1 - fin(2 - 2 * t) / 2) });
  const bounceOut = (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  };
  const F = {
    sine: fam((t) => 1 - Math.cos((t * PI) / 2)),
    quad: fam((t) => t * t), cubic: fam((t) => t * t * t), quart: fam((t) => t ** 4), quint: fam((t) => t ** 5),
    expo: fam((t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10))),
    circ: fam((t) => 1 - Math.sqrt(1 - Math.min(1, t * t))),
    back: fam((t) => 2.70158 * t * t * t - 1.70158 * t * t),
    elastic: fam((t) => (t <= 0 ? 0 : t >= 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * PI) / 3)))),
    bounce: fam((t) => 1 - bounceOut(1 - t)),
  };
  // CSS cubic-bezier(x1, y1, x2, y2): Newton–Raphson on x(s), bisection fallback
  function bezier(x1, y1, x2, y2) {
    x1 = clamp(+x1 || 0, 0, 1); x2 = clamp(+x2 || 0, 0, 1); y1 = +y1 || 0; y2 = +y2 || 0;
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (s) => ((ax * s + bx) * s + cx) * s, Y = (s) => ((ay * s + by) * s + cy) * s, dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
    const solve = (x) => {
      let s = x;
      for (let i = 0; i < 8; i++) { const e = X(s) - x; if (Math.abs(e) < 1e-6) return s; const d = dX(s); if (Math.abs(d) < 1e-6) break; s -= e / d; }
      let lo = 0, hi = 1; s = x;
      for (let i = 0; i < 30; i++) { const v = X(s); if (Math.abs(v - x) < 1e-6) break; if (x > v) lo = s; else hi = s; s = (lo + hi) / 2; }
      return s;
    };
    return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Y(solve(t)));
  }
  const steps = (n) => (t) => (t >= 1 ? 1 : Math.floor(t * n) / n);
  // rough: a smooth curve with seeded, decaying jitter (hand-keyed feel); still lands exactly on 1
  const rough = (seed = 7) => (t) => { if (t <= 0 || t >= 1) return clamp(t); const base = E.outCubic(t); const n = LM.U.noise1(t * 9, seed) * 0.08 * Math.sin(PI * t); return base + n; };
  const CURVE = {
    smooth: [0.4, 0, 0.2, 1], decel: [0, 0, 0.2, 1], accel: [0.4, 0, 1, 1], snappy: [0.16, 1, 0.3, 1], swift: [0.55, 0, 0.1, 1],
    aeEasy: [0.33, 0, 0.67, 1], aeOut: [0.05, 0.7, 0.1, 1], aeIn: [0.7, 0, 0.84, 0], emph: [0.2, 0, 0, 1], glide: [0.25, 0.1, 0.25, 1],
  };
  const EZ2 = {
    sineIn: () => F.sine.i, sineOut: () => F.sine.o, sineInOut: () => F.sine.io,
    quadInOut: () => F.quad.io, cubicIn: () => F.cubic.i, quartOut: () => F.quart.o, quartInOut: () => F.quart.io,
    quintOut: () => F.quint.o, quintInOut: () => F.quint.io, expoInOut: () => F.expo.io, circOut: () => F.circ.o, circInOut: () => F.circ.io,
    backIn: () => F.back.i, backInOut: () => F.back.io, elasticIn: () => F.elastic.i, elasticInOut: () => F.elastic.io, bounceOut: () => bounceOut, bounceIn: () => F.bounce.i,
    slowmo: () => slowmoFn, steps4: () => steps(4), steps8: () => steps(8), steps12: () => steps(12), rough: (o) => rough((o && o.seed) || 7),
    custom: (o) => { const b = (o && Array.isArray(o.bz) && o.bz.length === 4) ? o.bz : CURVE.smooth; return bezier(b[0], b[1], b[2], b[3]); },
  };
  Object.keys(CURVE).forEach((k) => (EZ2[k] = () => bezier(...CURVE[k])));
  // slow-mo: a quick start, a long gentle middle, a quick finish
  function slowmoFn(t) { if (t <= 0) return 0; if (t >= 1) return 1; const a = 0.15; if (t < a) return E.outCubic(t / a) * 0.32; if (t > 1 - a) return 0.68 + E.inCubic((t - (1 - a)) / a) * 0.32; return 0.32 + ((t - a) / (1 - 2 * a)) * 0.36; }
  // register: the renderer asks MS.EASE[name](o) for the curve, MS.WARP for curves that are safe as a time warp
  const EZN = {
    sineIn: 'サイン・イン（ゆるく加速）', sineOut: 'サイン・アウト（ゆるく減速）', sineInOut: 'サイン・イン・アウト（いちばん柔らかい）',
    quadInOut: 'クアッド・イン・アウト', cubicIn: 'キュービック・イン（加速）', quartOut: 'クォート・アウト（強めの減速）', quartInOut: 'クォート・イン・アウト',
    quintOut: 'クイント・アウト（とても強い減速）', quintInOut: 'クイント・イン・アウト（中央で一気に）', expoInOut: 'エクスポ・イン・アウト（シャープ）',
    circOut: 'サーキュラー・アウト（滑り込んで止まる）', circInOut: 'サーキュラー・イン・アウト',
    backIn: 'バック・イン（引いてから出る）', backInOut: 'バック・イン・アウト（予備動作と行き過ぎ）',
    elasticIn: 'エラスティック・イン', elasticInOut: 'エラスティック・イン・アウト', bounceOut: 'バウンス（床で弾む）', bounceIn: 'バウンス・イン',
    smooth: 'スタンダード（Material）', decel: 'ディセラレート（入場向け）', accel: 'アクセラレート（退場向け）', snappy: 'スナッピー（鋭く止まる）', swift: 'スウィフト（ためて一気に）',
    aeEasy: 'イージーイーズ（After Effects）', aeOut: 'イーズアウト強（AE 80%）', aeIn: 'イーズイン強（AE 80%）', emph: 'エンファサイズ（勢いよく減速）', glide: 'グライド（CSS ease）',
    slowmo: 'スローモー（速い→ゆっくり→速い）', steps4: 'コマ打ち 4段', steps8: 'コマ打ち 8段', steps12: 'コマ打ち 12段', rough: 'ラフ（手付けの揺らぎ）', custom: 'カスタム（ベジェ曲線）',
  };
  const MON = ['sineIn', 'sineOut', 'sineInOut', 'quadInOut', 'cubicIn', 'quartOut', 'quartInOut', 'quintOut', 'quintInOut', 'expoInOut', 'circOut', 'circInOut', 'smooth', 'decel', 'accel', 'snappy', 'swift', 'aeEasy', 'aeOut', 'aeIn', 'emph', 'glide', 'slowmo', 'steps4', 'steps8', 'steps12'];
  if (MS) {
    const ease0 = MS.ease;
    MS.ease = (name, o) => (EZ2[name] ? EZ2[name](o) : ease0(name, o));
    Object.assign(MS.EASE_N, EZN);
    MON.forEach((k) => (MS.WARP[k] = EZ2[k]()));
    MS.bezier = bezier; MS.CURVE = CURVE; MS.EZ_KEYS = Object.keys(MS.EASE_N);
  }
  // expose the families on LM.E as well (motion code reads LM.E.*)
  Object.assign(E, { inSine: F.sine.i, inOutQuart: F.quart.io, inOutCirc: F.circ.io, inCirc: F.circ.i, inOutBack: F.back.io, inElastic: F.elastic.i, inOutElastic: F.elastic.io, inBounce: F.bounce.i, inOutBounce: F.bounce.io, bezier });

  /* ================= stagger orders ================= */
  const SO_N = { auto: '自動（モーションの標準）', fwd: '前から順', rev: '後ろから順', center: '中央から外へ', edges: '外から中央へ', random: 'ランダム', ltr: '左から右へ（行をまたいで）', rtl: '右から左へ', ttb: '上から下へ', btt: '下から上へ', radialOut: '中心から放射状に', radialIn: '外周から中心へ', diag: '斜め（左上→右下）', angle: '角度を指定', lines: '一行ずつ' };
  const SE_N = { linear: '均等', easeIn: 'だんだん詰まる', easeOut: 'だんだん開く', easeInOut: '中央で速く', expo: '最初に集中' };
  const SE = { linear: (r) => r, easeIn: (r) => E.outQuad(r), easeOut: (r) => r * r, easeInOut: (r) => E.inOutCubic(r), expo: (r) => E.outExpo(r) };
  function rank2(glyphs, unit, order, o) {
    const so = (o && o.so) || 'auto', se = (o && o.se) || 'linear';
    const base = so === 'auto' || !SO_N[so] ? M.ranks(glyphs, unit, order, 11)
      : ['fwd', 'rev', 'center', 'edges', 'random'].includes(so) ? M.ranks(glyphs, unit, so, 11 + ((o && o.seedS) || 0)) : spatial(glyphs, unit, so, o);
    const f = SE[se] || SE.linear;
    return se === 'linear' ? base : base.map((r) => clamp(f(r)));
  }
  function spatial(glyphs, unit, so, o) {
    const keyOf = (g) => (unit === 'w' ? g.wordIdx : unit === 'l' ? g.line : unit === 'a' ? 0 : g.k);
    const P = new Map();
    glyphs.forEach((g) => { const k = keyOf(g); const v = P.get(k) || { x: 0, y: 0, n: 0, line: g.line || 0, k: g.k }; v.x += g.x; v.y += g.y; v.n++; P.set(k, v); });
    let cx = 0, cy = 0; P.forEach((v) => { v.x /= v.n; v.y /= v.n; cx += v.x; cy += v.y; }); cx /= P.size || 1; cy /= P.size || 1;
    const ang = ((o && o.sa != null ? +o.sa : 0) * PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    const val = (v) => {
      switch (so) {
        case 'ltr': return v.x; case 'rtl': return -v.x; case 'ttb': return v.y; case 'btt': return -v.y;
        case 'radialOut': return Math.hypot(v.x - cx, v.y - cy); case 'radialIn': return -Math.hypot(v.x - cx, v.y - cy);
        case 'diag': return v.x + v.y; case 'angle': return v.x * ca + v.y * sa;
        case 'lines': return v.line * 1e5 + v.k;
        default: return v.k;
      }
    };
    let lo = Infinity, hi = -Infinity; const R = new Map();
    P.forEach((v, k) => { const q = val(v); R.set(k, q); lo = Math.min(lo, q); hi = Math.max(hi, q); });
    if (so === 'lines') { const ks = [...R.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]); ks.forEach((k, i) => R.set(k, ks.length > 1 ? i / (ks.length - 1) : 0)); return glyphs.map((g) => R.get(keyOf(g))); }
    return glyphs.map((g) => (hi > lo ? (R.get(keyOf(g)) - lo) / (hi - lo) : 0));
  }
  if (MS) Object.assign(MS, { rank2, SO_N, SE_N });

  /* ================= unit pivots ================= */
  const UCK = new WeakMap();
  function uc(g, unit, c) {
    if (unit === 'a' || !c.gl) return { x: c.cx, y: c.cy };
    let m = UCK.get(c.gl); if (!m) { m = { w: new Map(), l: new Map() }; UCK.set(c.gl, m); }
    const isW = unit !== 'l', key = isW ? g.wordIdx : g.line, mm = isW ? m.w : m.l;
    let v = mm.get(key);
    if (!v) { let sx = 0, sy = 0, n = 0; for (const h of c.gl) if ((isW ? h.wordIdx : h.line) === key) { sx += h.x; sy += h.y; n++; } v = n ? { x: sx / n, y: sy / n } : { x: g.x, y: g.y }; mm.set(key, v); }
    return v;
  }
  // scale (and optionally rotate) T around a pivot P instead of the glyph's own centre
  function pivotT(T, g, P, sx, sy, rot) {
    const dx = g.x - P.x, dy = g.y - P.y;
    let nx = dx * sx, ny = dy * sy;
    if (rot) { const cs = Math.cos(rot), sn = Math.sin(rot); const rx = nx * cs - ny * sn, ry = nx * sn + ny * cs; nx = rx; ny = ry; T.rot = (T.rot || 0) + rot; }
    T.x = (T.x || 0) + nx - dx; T.y = (T.y || 0) + ny - dy;
    T.sx = (T.sx == null ? 1 : T.sx) * sx; T.sy = (T.sy == null ? 1 : T.sy) * sy;
    return T;
  }
  if (MS) Object.assign(MS, { uc, pivotT });

  /* ================= script-aware random glyphs ================= */
  const POOL = {
    kata: Array.from('アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'),
    hira: Array.from('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'),
    kanji: Array.from('日月火水木金土山川空海風花雪光夢愛心音色声夜朝星雨歌時間世界明影波街線熱'),
    up: Array.from('ABCDEFGHJKLMNPQRSTUVWXYZ'), lo: Array.from('abcdefghijkmnopqrstuvwxyz'), dig: Array.from('0123456789'),
    hang: Array.from('가나다라마바사아자차카타파하너더러머버서어저처'), sym: Array.from('#%&@$?!<>/=+*'),
  };
  function poolOf(ch) {
    if (!ch) return POOL.sym; const c = ch.codePointAt(0);
    if (c >= 48 && c <= 57) return POOL.dig; if (c >= 65 && c <= 90) return POOL.up; if (c >= 97 && c <= 122) return POOL.lo;
    if (c >= 0xc0 && c <= 0x24f) return /\p{Lu}/u.test(ch) ? POOL.up : POOL.lo;
    if (c >= 0x3040 && c < 0x30a0) return POOL.hira; if (c >= 0x30a0 && c < 0x3100) return POOL.kata;
    if ((c >= 0x4e00 && c < 0xa000) || (c >= 0x3400 && c < 0x4dc0)) return POOL.kanji;
    if (c >= 0xac00 && c < 0xd7b0) return POOL.hang;
    if (c >= 0xff10 && c <= 0xff19) return POOL.dig;
    return POOL.sym;
  }
  const rch = (g, k, salt = 0) => { const pl = poolOf(g.ch); return pl[Math.floor(hash(g.i, k, 31 + salt) * pl.length)]; };
  if (MS) MS.rch = rch;

  /* ================= motion-blur aware blur =================
   * Motions that used an isotropic blur only to fake motion blur keep a trace of it when the renderer's
   * per-glyph motion blur is off, and drop it when it is on (c.mb > 0). */
  const mbK = (c) => (c && c.mb > 0 ? 0.15 : 1);
  const offTop = (g) => -(g.y + g.size * 1.2);
  const offBottom = (g, c) => c.H - g.y + g.size * 1.2;
  const gsc = M.gsc;

  /* ================= rebuilt entrances ================= */
  const ENTER = {
    // slides: letters arrive in an order that never drives one letter through another
    slide: { o: 'rev', f: (p, g, c) => { const q = E.outExpo(p); return { x: -(1 - q) * c.W * 0.3 * c.amp, skx: -(1 - q) * 0.18, a: A(p, 3.5), blur: (1 - q) * g.size * 0.12 * mbK(c) }; } },
    whip: { f: (p, g, c) => { const q = E.outExpo(p); return { x: (1 - q) * c.W * 0.6, blur: (1 - p) * g.size * 0.4 * mbK(c), skx: (1 - q) * 0.35, sx: 1 + (1 - q) * 0.35, a: A(p, 4) }; } },
    smear: { o: 'rev', f: (p, g, c) => { const q = E.outExpo(p); return { x: -(1 - q) * g.size * 5, sx: 1 + (1 - q) * 1.6, blur: (1 - q) * g.size * 0.15 * mbK(c), a: A(p, 3) }; } },
    magnet: { o: 'center', f: (p, g, c) => { const q = E.outExpo(p); return { x: (g.x < c.cx ? -1 : 1) * c.W * 0.55 * (1 - q), skx: (g.x < c.cx ? -1 : 1) * (1 - q) * 0.2, a: A(p, 3) }; } },
    skew: { o: 'rev', f: (p, g, c) => { const q = E.outCubic(p); return { skx: -(1 - q) * 0.8, x: -(1 - E.outExpo(p)) * g.size * 2, a: A(p, 3), blur: (1 - q) * g.size * 0.05 * mbK(c) }; } },
    // drops: start above the frame (not hovering over the line above) and fade in from nothing
    bounce: { f: (p, g, c) => { const q = E.outBounce(p); const k = p < 0.36 ? 0 : 1; return { y: (1 - q) * offTop(g), sy: 1 + (1 - k) * 0.12, sx: 1 - (1 - k) * 0.06, a: A(p, 12) }; } },
    cascade: { f: (p, g) => { const q = E.outBounce(p); return { y: -(1 - q) * g.size * 3, a: A(p, 6) }; } },
    drop: { f: (p, g) => { const q = E.outCubic(p); return { y: -(1 - q) * g.size * 2, rot: (1 - q) * (g.r1 - 0.5) * 0.8, a: A(p, 3) }; } },
    zipper: { f: (p, g, c) => { const q = E.outExpo(p); const d = g.i % 2 ? offTop(g) : offBottom(g, c); return { y: d * (1 - q), sy: 1 + (1 - q) * 0.6, a: A(p, 6) }; } },
    elasticDrop: { f: (p, g) => {
      if (p < 0.55) { const q = E.inQuad(p / 0.55); return { y: (1 - q) * offTop(g), sy: 1 + q * 0.3, sx: 1 - q * 0.15, a: A(p, 10) }; }
      const k = (p - 0.55) / 0.45; const w = Math.exp(-5 * k) * Math.cos(k * 14); return { sy: 1 - 0.35 * w, sx: 1 + 0.3 * w, py: g.size * 0.5 };
    } },
    // group / word scales: the block grows and lands as one piece
    zoomOut: { f: (p, g, c) => { const q = E.outExpo(p); const T = gsc({}, g, c, lerp(2.6, 1, q)); T.a = A(p, 2); T.blur = (1 - q) * g.size * 0.15 * mbK(c); return T; } },
    zoomRush: { f: (p, g, c) => { const q = E.outExpo(p); const P = uc(g, 'w', c); const T = pivotT({}, g, P, lerp(5, 1, q), lerp(5, 1, q)); T.a = A(p, 3); T.blur = (1 - q) * g.size * 0.2 * mbK(c); return T; } },
    wordSeq: { f: (p, g, c) => { if (p <= 0) return { vis: false }; const s = lerp(1.6, 1, E.outExpo(p)); const T = pivotT({}, g, uc(g, 'w', c), s, s); T.bright = (1 - p) * 0.7; return T; } },
    wordSlam: { f: (p, g, c) => {
      if (p <= 0) return { vis: false };
      const s = lerp(3.2, 1, E.outExpo(p)); const T = pivotT({}, g, uc(g, 'w', c), s, s);
      const sh = p < 1 ? (hash(g.wordIdx || 0, Math.floor(p * 20)) - 0.5) * g.size * 0.08 * (1 - p) : 0; T.x += sh; T.blur = (1 - p) * g.size * 0.1 * mbK(c); return T;
    } },
    weightPunch: { f: (p, g, c) => { const q = E.outCubic(p), s = lerp(1.28, 1, E.outBack(p)); const T = pivotT({}, g, uc(g, 'w', c), s, s); T.wt = (1 - q) * 0.9; T.a = A(p, 6); return T; } },
    stepZoom: { f: (p, g, c) => { const S = [2.4, 1.7, 1.25, 1]; const s = S[Math.min(3, Math.floor(p * 4))]; const T = gsc({}, g, c, s); if (p < 0.02) T.a = 0; return T; } },
    splitJoin: { f: (p, g) => { const q = E.outExpo(p); return { split: (1 - q) * g.size * 2.4, a: A(p, 5) }; } },
    stripIn: { f: (p, g) => { const q = E.outExpo(p); return { strips: 6, stripOff: (1 - q) * g.size * 4, a: A(p, 8) }; } },
    heavyLand: null, // patched below (keeps its own logic, rotates the heavy word as one block)
    // write-on: every contour traces its outline, then the ink floods in
    strokeDraw: { d: 1.15, st: 0.45, f: (p, g) => { const s = E.inOutSine(clamp(p / 0.72)); const fA = sstep(0.5, 1, p); return { stroke: s, strokeAcc: 1 - fA, fillA: fA, sx: lerp(1.04, 1, E.outCubic(p)), sy: lerp(1.04, 1, E.outCubic(p)) }; } },
    // decode: same-script random glyphs in a muted tone, each locks in with a short flash
    scramble: { d: 0.95, st: 0.55, f: (p, g) => {
      if (p <= 0) return { a: 0 };
      const lock = 0.74;
      if (p >= lock || g.space) { const q = (p - lock) / (1 - lock); return { bright: Math.max(0, 1 - q * 2.2) * 0.85, sx: lerp(1.08, 1, E.outCubic(clamp(q * 2))), sy: lerp(1.08, 1, E.outCubic(clamp(q * 2))) }; }
      const k = Math.floor(p * 26);
      return { ch: rch(g, k), dark: 0.42, a: 0.55 + 0.45 * A(p, 5) };
    } },
    // slot reel: same-script glyphs roll down, decelerate and settle with a small overshoot
    slot: { d: 1.0, st: 0.45, f: (p, g) => {
      if (p <= 0) return { a: 0 };
      const N = 7, h = g.size * 1.18;
      const u = N * E.outQuart(clamp(p / 0.86)) + (p > 0.86 ? 0 : 0);
      const settle = p > 0.86 ? Math.exp(-7 * (p - 0.86) / 0.14) * Math.sin(((p - 0.86) / 0.14) * PI * 1.5) * 0.18 : 0;
      const uu = u + settle, i = Math.round(uu), fr = uu - i;
      const spd = 1 - E.outQuart(clamp(p / 0.86));
      return { ch: i >= N ? undefined : rch(g, i, 5), y: fr * h, lineMask: true, sy: 1 + spd * 0.22, dark: i >= N ? 0 : 0.3, a: 1 };
    } },
  };
  Object.entries(ENTER).forEach(([id, o]) => { if (o && M.enter[id]) Object.assign(M.enter[id], o); });
  if (M.enter.heavyLand) {
    const f0 = M.enter.heavyLand.f;
    M.enter.heavyLand.f = (p, g, c) => {
      const T = f0(p, g, c);
      if (T && T.rot && p < 0.5) { // the heavy word: rotate the word as one block around its centre
        const q = E.inCubic(p / 0.5), P = uc(g, 'w', c), rot = (1 - q) * (hash(g.wordIdx || 0, 3) > 0.5 ? 1 : -1) * 0.5;
        const R = pivotT({}, g, P, 1, 1, rot); R.y += (1 - q) * offTop(g) * 0.9; R.a = T.a; return R;
      }
      return T;
    };
  }
  /* ================= rebuilt exits ================= */
  const EXIT = {
    slideOut: { o: 'rev', f: (p, g, c) => ({ x: E.inExpo(p) * c.W * 0.6, sx: 1 + E.inExpo(p) * 0.4, blur: p * g.size * 0.3 * mbK(c), a: 1 - E.inQuart(p) }) },
    rushOut: { f: (p, g, c) => { const s = 1 + E.inExpo(p) * 6; const T = pivotT({}, g, uc(g, 'w', c), s, s); T.a = 1 - E.inQuad(p); T.blur = p * g.size * 0.2 * mbK(c); return T; } },
    zoomThrough: { f: (p, g, c) => { const T = gsc({}, g, c, 1 + E.inExpo(p) * 5); T.a = 1 - E.inQuad(p); T.blur = p * g.size * 0.2 * mbK(c); return T; } },
    splitOut: { f: (p, g) => ({ split: -E.inExpo(p) * g.size * 2.4, a: 1 - E.inQuart(p) }) },
    shatter: { d: 0.95, st: 0.25, o: 'random', f: (p) => ({ shard: p, a: 1 }) },
    scrambleOut: { f: (p, g) => (p <= 0.08 || g.space ? { bright: (p / 0.08) * 0.5 } : { ch: rch(g, Math.floor(p * 22) + 99), dark: 0.35, a: 1 - E.inQuad(p) }) },
  };
  Object.entries(EXIT).forEach(([id, o]) => { if (o && M.exit[id]) Object.assign(M.exit[id], o); });

  /* ================= new entrances (catalogue) ================= */
  Object.assign(M.enter, {
    // IN-19 split-flap (パタパタ): the leaf flips through same-script glyphs and stops on the real one
    flapIn: { n: 'パタパタ表示（反転フラップ）', c: 'デジタル', d: 1.05, st: 0.4, f: (p, g) => {
      if (p <= 0) return { a: 0 };
      const N = 6, u = N * E.outCubic(clamp(p / 0.86)), k = Math.min(N - 1, Math.floor(u)), q = k >= N - 1 ? 1 : u - k;
      const chA = k === 0 ? ' ' : rch(g, k - 1, 9), chB = k >= N - 1 ? g.ch : rch(g, k, 9);
      const ca = 1 - sstep(0.86, 1, p); return k >= N - 1 && q >= 1 ? { flap: { a: g.ch, b: g.ch, q: 1, ca } } : { flap: { a: chA, b: chB, q: E.inOutSine(q), ca } };
    } },
    // IN-22 liquid fill: the outline is drawn, colour rises inside it with a sloshing surface
    liquidFill: { n: 'リキッドフィル（液体で満たされる）', c: '手作り', d: 1.2, st: 0.3, f: (p) => ({ liq: E.inOutSine(p), a: A(p, 6) }) },
    // IN-40 light scan: a hot edge sweeps across the phrase, the glyphs appear behind it
    lightScan: { n: 'ライトスキャン（光の帯が走査して出現）', c: 'マスク', d: 0.95, st: 0, u: 'a', f: (p, g, c) => { const bb = c.bb || { x: c.cx - 200, w: 400 }; const pad = g.size * 1.2; return { scanX: bb.x - pad + (bb.w + pad * 2) * E.inOutSine(p), scanW: g.size * 0.55 }; } },
    // IN-44 shards assemble into the glyph (reverse shatter)
    shardsIn: { n: '破片が集まって組み上がる', c: '集合', d: 0.9, st: 0.35, o: 'random', f: (p) => ({ shard: 1 - E.outCubic(p), shardIn: 1 }) },
    // IN-55 / IN-56 mask reveals (feathered by the renderer)
    clockWipe: { n: '時計回りワイプ', c: 'マスク', d: 0.75, st: 0, u: 'a', f: () => ({}), clip: (ctx, p, B) => { const q = E.inOutCubic(p), r = Math.hypot(B.w, B.h); ctx.moveTo(B.cx, B.cy); ctx.arc(B.cx, B.cy, r, -PI / 2, -PI / 2 + PI * 2 * q); ctx.closePath(); } },
    checkerIn: { n: 'チェッカー（市松に開く）', c: 'マスク', d: 0.8, st: 0, u: 'a', f: () => ({}), clip: (ctx, p, B) => {
      const n = 8, m = Math.max(2, Math.round((n * B.h) / Math.max(1, B.w))), cw = B.w / n, chh = B.h / m;
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const d = ((i + j) % 2) * 0.35 + hash(i, j, 3) * 0.25; const q = E.outCubic(clamp((p - d * 0.6) / 0.45)); if (q <= 0) continue; const w = cw * q, h = chh * q; ctx.rect(B.x + i * cw + (cw - w) / 2, B.y + j * chh + (chh - h) / 2, w + 0.5, h + 0.5); }
    } },
    curtainIn: { n: 'カーテン（中央から左右に開く）', c: 'マスク', d: 0.8, st: 0, u: 'a', f: (p, g, c) => { const q = E.outCubic(p); return { x: (g.x - c.cx) * (1 - q) * 0.08 }; }, clip: (ctx, p, B) => { const q = E.inOutCubic(p), w = (B.w / 2) * q; ctx.rect(B.cx - w, B.y, w * 2, B.h); } },
  });
  /* ================= new exits (catalogue) ================= */
  Object.assign(M.exit, {
    // OUT-04 dust: the glyph dissolves from one side into drifting particles
    dustOut: { n: '灰になって崩れる（ディスインテグレート）', c: '飛散', d: 1.1, st: 0.35, f: (p) => ({ dust: p }) },
    // OUT-05 burn: a glowing ember edge eats the glyph from the bottom
    burnOut: { n: '燃え尽きる（炎の縁で焼けて消える）', c: '飛散', d: 1.0, st: 0.3, o: 'random', f: (p) => ({ burn: p }) },
    // OUT-12 strike-through then fade
    strikeOut: { n: '取り消し線を引いて消える', c: '文字送り', d: 0.7, st: 0.55, f: (p) => ({ strike: clamp(p / 0.5), a: 1 - sstep(0.62, 1, p) }) },
    // OUT-11 select all → delete
    selectDelete: { n: '全選択して削除', c: '文字送り', d: 0.6, st: 0.45, f: (p) => (p < 0.78 ? { boxBg: clamp(p / 0.2) } : { vis: false }) },
    // OUT-24 colour drains, only the outline remains, then it fades
    drainOut: { n: '色が抜けて輪郭だけ残る', c: '基本', d: 0.9, st: 0.25, f: (p) => ({ drain: clamp(p / 0.55), a: 1 - sstep(0.6, 1, p) }) },
    clockWipeOut: { n: '時計回りに消える', c: 'マスク', d: 0.6, st: 0, u: 'a', f: () => ({}), clip: (ctx, p, B) => { const q = E.inOutCubic(p), r = Math.hypot(B.w, B.h); ctx.moveTo(B.cx, B.cy); ctx.arc(B.cx, B.cy, r, -PI / 2 + PI * 2 * q, PI * 1.5); ctx.closePath(); } },
    curtainOut: { n: 'カーテン（中央へ閉じる）', c: 'マスク', d: 0.6, st: 0, u: 'a', f: () => ({}), clip: (ctx, p, B) => { const q = 1 - E.inOutCubic(p), w = (B.w / 2) * q; ctx.rect(B.cx - w, B.y, w * 2, B.h); } },
  });

  /* ================= theme pools ================= */
  const D = LM.data, addW = (id, k, o) => { const t = D && D.themeById[id]; if (t) t[k] = Object.assign({}, t[k] || {}, o); };
  addW('citypop', 'enter', { flapIn: 0.8, lightScan: 0.6 }); addW('vocaloid', 'enter', { flapIn: 0.8 }); addW('showreel', 'enter', { flapIn: 0.6, clockWipe: 0.6, checkerIn: 0.6 });
  addW('cinematic', 'enter', { lightScan: 1, curtainIn: 0.6 }); addW('cinematic', 'exit', { dustOut: 0.8, curtainOut: 0.5 });
  addW('ballad', 'enter', { liquidFill: 0.6 }); addW('dream', 'enter', { liquidFill: 0.6, shardsIn: 0.3 }); addW('ambient', 'exit', { dustOut: 1 });
  addW('rock', 'exit', { shatter: 1, burnOut: 0.8 }); addW('metal', 'exit', { burnOut: 1.2, shatter: 1 }); addW('edm', 'enter', { shardsIn: 0.8, lightScan: 0.8 }); addW('edm', 'exit', { shatter: 0.8 });
  addW('hiphop', 'exit', { strikeOut: 0.8, selectDelete: 0.8 }); addW('edge', 'exit', { selectDelete: 1, strikeOut: 1 }); addW('minimal', 'exit', { drainOut: 1 }); addW('minimal', 'enter', { curtainIn: 0.6 });
  addW('jpop', 'enter', { checkerIn: 0.4 }); addW('anison', 'exit', { shatter: 0.8 });
})();
