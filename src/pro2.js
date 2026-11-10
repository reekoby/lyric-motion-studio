/* Pro pass, phase 2 of the effect catalogue:
 *  - transitions: solid cover wipes get shutter motion blur + a contact shadow (renderer, flag `mb`), camera cuts
 *    mirror-tile the frame (renderer); rebuilt glass shards; new page turn, cube turn, halftone wipe, star zoom,
 *    swirl, ripple, kaleidoscope, datamosh and snap-zoom cuts
 *  - cameras: handheld, dutch angle, crash zoom, Ken Burns, crane, 2.5D orbit, spiral drift, beat tilt
 *  - karaoke / sung-text holds: glowing wipe, syllable pop, sung text dims, progress underline (vertical text aware)
 *  - emphasis accents: pop, drop, skew snap, glow, wobble, letter spread
 *  - GPU backgrounds: Julia-set zoom, sky that turns from dusk to night
 *  - おまかせ: per-theme motion grammar (easing / stagger order) and twelve new style themes */
'use strict';
(() => {
  const { clamp, lerp, hash, rgba, mix } = LM.U;
  const E = LM.E, M = LM.motion, D = LM.data, PI = Math.PI, TAU = PI * 2;
  const TR = LM.trans.lib, inOut = LM.trans.inOut;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  /* ================= transitions ================= */
  // solid covers that read as flat graphic shapes: averaged over the shutter and shadowed by the renderer
  ['colorBlocks', 'barsH', 'stripesDiag', 'iris', 'diamond', 'splitClose', 'gridPop', 'zigzag', 'fan', 'tornPaper', 'sliceBands', 'hexFlip', 'tileScatter', 'doorsH', 'irisBlades', 'gradientDiscs', 'ribbonSweep', 'liquid', 'ink', 'inkBlob', 'dryBrush', 'scribbleFill', 'collageSlam'].forEach((id) => { if (TR[id]) TR[id].mb = true; });
  const cover = (id, n, f, o = {}) => (TR[id] = Object.assign({ n, c: 'カバー', kind: 'cover', f, mb: true }, o));
  const cam = (id, n, f) => (TR[id] = { n, c: 'カメラ', kind: 'cam', f });
  // glass shards: the frame cracks from an impact point, triangular facets fly past and clear (rebuilt)
  cover('shards', 'ガラスの破片', (ctx, u, R) => {
    // a jittered triangle lattice of glass facets: they fly in from an impact point and lock into a full pane,
    // then the pane breaks and the facets fall away under gravity
    const nx = 7, ny = Math.max(3, Math.round((7 * R.H) / R.W)), cw = R.W / nx, chh = R.H / ny, ix = R.W * 0.55, iy = R.H * 0.45;
    const P = (i, j) => { const e = i > 0 && i < nx && j > 0 && j < ny; return [i * cw + (e ? (hash(i, j, 1) - 0.5) * cw * 0.7 : 0), j * chh + (e ? (hash(i, j, 2) - 0.5) * chh * 0.7 : 0)]; };
    let n = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const a0 = P(i, j), b0 = P(i + 1, j), c0 = P(i, j + 1), d0 = P(i + 1, j + 1);
      for (const t3 of (i + j) % 2 ? [[a0, b0, d0], [a0, d0, c0]] : [[a0, b0, c0], [b0, d0, c0]]) {
        n++;
        const cx = (t3[0][0] + t3[1][0] + t3[2][0]) / 3, cy = (t3[0][1] + t3[1][1] + t3[2][1]) / 3;
        const dist = Math.hypot(cx - ix, cy - iy) / Math.hypot(R.W, R.H), dl = dist * 0.35 + hash(n, 3) * 0.08;
        const kin = E.outCubic(clamp((u - dl * 0.6) / 0.32)), kout = E.inCubic(clamp((u - 0.5 - dl * 0.5) / 0.4));
        if (kin <= 0.001 || kout >= 0.999) continue;
        let vx = cx - ix, vy = cy - iy; const ln = Math.hypot(vx, vy) || 1; vx /= ln; vy /= ln;
        const fly = (1 - kin) * R.minD * (0.5 + hash(n, 4) * 0.6), ox = vx * fly + vx * kout * R.minD * 0.25, oy = vy * fly + kout * kout * R.H * 0.9, rot = ((1 - kin) * 1.6 + kout * 1.2) * (hash(n, 5) - 0.5);
        ctx.save(); ctx.translate(cx + ox, cy + oy); ctx.rotate(rot); ctx.translate(-cx, -cy);
        ctx.beginPath(); ctx.moveTo(t3[0][0], t3[0][1]); ctx.lineTo(t3[1][0], t3[1][1]); ctx.lineTo(t3[2][0], t3[2][1]); ctx.closePath();
        const base = n % 4 === 0 ? R.pal.sub : R.pal.accent, lit = 0.12 + hash(n, 6) * 0.3;
        const g = ctx.createLinearGradient(t3[0][0], t3[0][1], t3[2][0], t3[2][1]); g.addColorStop(0, mix(base, '#ffffff', lit)); g.addColorStop(1, mix(base, '#000000', 0.12 + hash(n, 7) * 0.12));
        ctx.globalAlpha = Math.min(1, kin * 1.5) * (1 - kout * 0.3); ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, R.S * 1.2); ctx.stroke(); ctx.restore();
      }
    }
  });
  // page turn: a page curls across the frame with a highlight along the fold and a shadow under it
  cover('pageTurn', 'ページめくり（紙がめくれて切り替わる）', (ctx, u, R) => {
    const W = R.W, H = R.H, k = u < 0.5 ? E.inOutCubic(u * 2) : 1 - E.inOutCubic((u - 0.5) * 2), x = W * (1.08 - k * 1.2), tilt = H * 0.18;
    if (k <= 0.001) return;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(x, 0); ctx.lineTo(x - tilt, H); ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = R.pal.accent; ctx.fill();
    const curl = Math.min(W * 0.16, (W - x) * 0.4 + 2);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - curl, 0); ctx.lineTo(x - tilt - curl * 0.7, H); ctx.lineTo(x - tilt, H); ctx.closePath();
    const g = ctx.createLinearGradient(x - curl, 0, x, 0); g.addColorStop(0, mix(R.pal.sub, '#ffffff', 0.55)); g.addColorStop(0.55, R.pal.sub); g.addColorStop(1, mix(R.pal.sub, '#000000', 0.35));
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  });
  // cube turn: a colour face swings in on a vertical hinge (fake 3D), the scene face swings out
  cover('cubeTurn', 'キューブ回転（面が回り込む）', (ctx, u, R) => {
    const W = R.W, H = R.H, a = u < 0.5 ? E.inCubic(u * 2) : 1 - E.outCubic((u - 0.5) * 2), w = W * a, sk = H * 0.12 * Math.sin(a * PI);
    if (w <= 0.5) return;
    const right = u < 0.5;
    ctx.beginPath();
    if (right) { ctx.moveTo(W - w, -sk); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W - w, H + sk); } else { ctx.moveTo(0, 0); ctx.lineTo(w, -sk); ctx.lineTo(w, H + sk); ctx.lineTo(0, H); }
    ctx.closePath();
    const g = ctx.createLinearGradient(right ? W - w : 0, 0, right ? W : w, 0);
    g.addColorStop(0, mix(R.pal.accent, '#000000', right ? 0.25 : 0)); g.addColorStop(1, mix(R.pal.accent, '#000000', right ? 0 : 0.25));
    ctx.fillStyle = g; ctx.fill();
  });
  // halftone wipe: dots swell diagonally across the frame and shrink away
  cover('halftoneWipe', 'ハーフトーン・ワイプ（網点が広がる）', (ctx, u, R) => {
    const s = R.minD / 11, cols = Math.ceil(R.W / s) + 1, rows = Math.ceil(R.H / s) + 1;
    ctx.fillStyle = R.pal.accent;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const d = (x / cols) * 0.55 + (y / rows) * 0.25, k = u < 0.5 ? E.inOutCubic(clamp((u * 2 - d) / 0.45)) : 1 - E.inOutCubic(clamp(((u - 0.5) * 2 - d) / 0.45));
      if (k <= 0.01) continue;
      ctx.beginPath(); ctx.arc(x * s + (y % 2 ? s / 2 : 0), y * s, s * 0.78 * k, 0, TAU); ctx.fill();
    }
  });
  // shape zoom: a star scales up through the frame (outgoing), the hole in it reveals the next scene
  cover('starZoom', 'スター・ズーム（星形で突き抜ける）', (ctx, u, R) => {
    const D0 = Math.hypot(R.W, R.H), cx = R.W / 2, cy = R.H / 2;
    const star = (r, rot) => { for (let i = 0; i < 10; i++) { const a = rot + (i * PI) / 5 - PI / 2, rr = i % 2 ? r * 0.45 : r; i ? ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath(); };
    const out = E.inCubic(clamp(u * 2)) * D0 * 1.3, inn = E.outCubic(clamp((u - 0.5) * 2)) * D0 * 1.3;
    ctx.fillStyle = R.pal.accent; ctx.beginPath(); star(Math.max(1, out), u * 0.8); if (inn > 1) star(inn, u * 0.8); ctx.fill('evenodd');
    if (u > 0.3 && u < 0.7) { ctx.fillStyle = R.pal.sub; ctx.beginPath(); star(D0 * 0.9 * inOut(clamp((u - 0.3) / 0.4)), u * 0.8 + 0.3); ctx.fill(); }
  });
  // camera cuts (whole frame transformed / distorted by the post shader)
  const peak = (u, p = 1.5) => Math.pow(1 - Math.abs(u - 0.5) * 2, p);
  cam('swirlCut', 'スワール（渦に巻かれて切替）', (u) => { const v = peak(u, 1.2); return { swirl: (u < 0.5 ? 1 : -1) * v * 7, sc: 1 + v * 0.25, zblur: v * 1.2 }; });
  cam('rippleCut', 'リップル（水面のように揺れて切替）', (u) => { const v = peak(u, 1.3); return { liquid: v * 4.5, sc: 1 + v * 0.06, blur: v * 0.25 }; });
  cam('kaleidoCut', 'カレイド（万華鏡で切替）', (u) => { const v = peak(u, 1); return { quad: v > 0.35 ? 1 : 0, rot: (u - 0.5) * v * 0.9, sc: 1 + v * 0.4, hue: v * 1.2 }; });
  cam('moshCut', 'データモッシュ（にじんで流れて切替）', (u) => { const v = peak(u, 1.1); return { psort: v * 1.4, slice: v * 1.2, melt: u > 0.5 ? v * 0.4 : 0, rgb: v * 18 }; });
  cam('snapZoomCut', 'スナップズーム（一瞬で寄って切替）', (u) => { const v = peak(u, 2); return { sc: u < 0.5 ? 1 + E.inExpo(u * 2) * 0.9 : lerp(1.35, 1, E.outExpo((u - 0.5) * 2)), zblur: v * 2.2, flash: Math.pow(v, 8) * 0.35 }; });

  /* ================= cameras ================= */
  Object.assign(D.cameras, { handheld: '手持ち（リアルな揺れ）', dutch: 'ダッチアングル（傾いた構図）', snapZoom: 'クラッシュズーム（歌い出しで一気に寄る）', kenBurns: 'ケン・バーンズ（斜めにゆっくり寄る）', crane: 'クレーン（上昇しながら寄る）', orbit: '2.5Dオービット（回り込む）', spiralDrift: 'スパイラル（回りながら寄る）', beatTilt: 'ビートで傾きが切り替わる' });
  const N1 = LM.U.noise1;
  LM.cam2 = {
    // layered noise at hand-held frequencies (breathing sway + small jitters), never a pure sine
    handheld: (lx, k) => { const t = k.t, a = k.amp * k.S; lx.translate((N1(t * 0.55, 11) * 14 + N1(t * 1.9, 12) * 4 + N1(t * 6.3, 13) * 1.2) * a, (N1(t * 0.47, 21) * 10 + N1(t * 2.3, 22) * 3.5 + N1(t * 7.1, 23) * 1) * a); lx.rotate((N1(t * 0.4, 31) * 0.008 + N1(t * 2.1, 32) * 0.002) * k.amp); const z = 1.03 + N1(t * 0.3, 41) * 0.008; lx.scale(z, z); },
    dutch: (lx, k) => { const s = hash(k.seed, 5) > 0.5 ? 1 : -1; lx.rotate(s * 0.075 * k.amp); const z = 1.06 + 0.04 * k.hp * k.amp; lx.scale(z, z); },
    snapZoom: (lx, k) => { const q = E.outExpo(clamp(k.lt / 0.22)), o = Math.exp(-6 * Math.max(0, k.lt - 0.22)) * Math.sin(Math.max(0, k.lt - 0.22) * 18) * 0.03; const z = lerp(0.82, 1.08, q) + o * k.amp + 0.02 * k.hp; lx.scale(z, z); },
    kenBurns: (lx, k) => { const s = hash(k.seed, 7) > 0.5 ? 1 : -1, q = E.inOutSine(k.hp); lx.translate(s * (q - 0.5) * k.S * 60 * k.amp, (q - 0.5) * k.S * 26 * k.amp); const z = 1.02 + q * 0.09 * k.amp; lx.scale(z, z); },
    crane: (lx, k) => { const q = E.inOutSine(k.hp); lx.translate(0, (0.5 - q) * k.S * 70 * k.amp); const z = 1 + q * 0.07 * k.amp; lx.scale(z, z); lx.transform(1, 0, 0, 1 - 0.04 * (1 - q) * k.amp, 0, 0); },
    orbit: (lx, k) => { const a = Math.sin((k.t / 6) * TAU) * 0.22 * k.amp; lx.transform(Math.cos(a), Math.sin(a) * 0.08, 0, 1, 0, 0); lx.translate(Math.sin(a) * k.S * 40, 0); },
    spiralDrift: (lx, k) => { const q = E.inOutSine(k.hp); lx.rotate((q - 0.5) * 0.09 * k.amp); const z = 1 + q * 0.08 * k.amp; lx.scale(z, z); },
    beatTilt: (lx, k) => { const per = 60 / (k.bpm || 120), n = Math.floor(k.t / per), f = (k.t - n * per) / per, a0 = (n % 2 ? 1 : -1) * 0.035, a1 = -a0; lx.rotate(lerp(a1, a0, E.outBack(clamp(f / 0.35))) * k.amp); },
  };

  /* ================= karaoke / sung-text holds ================= */
  const kq = (g, c, hp) => { if (c.ct) { const a = c.ct.cs[g.k], b = c.ct.ce[g.k]; return clamp((c.tAbs - a) / Math.max(0.03, b - a)); } return clamp(clamp((hp - 0.04) / 0.9) * c.N - g.k); };
  const kEnd = (g, c, hp) => (c.ct ? c.tAbs - c.ct.ce[g.k] : (clamp((hp - 0.04) / 0.9) * c.N - g.k - 1) * 0.25);
  Object.assign(M.hold, {
    karaokeGlow: { n: 'カラオケ（光る先端で塗られる）', c: '歌詞', f: (ht, g, c, hp) => { const q = kq(g, c, hp), s = Math.sin(PI * q); return { fill: q, y: -s * g.size * 0.07, bright: s * 0.45, sx: 1 + s * 0.05, sy: 1 + s * 0.05 }; } },
    singPop: { n: '歌っている文字がポンと跳ねる', c: '歌詞', f: (ht, g, c, hp) => { const q = kq(g, c, hp); if (q <= 0) return { dark: 0.35 }; if (q >= 1) return { accent: true }; const s = Math.sin(PI * Math.min(1, q * 1.6)) * Math.exp(-2 * q); return { accent: true, y: -s * g.size * 0.22, sx: 1 + s * 0.18, sy: 1 + s * 0.24, bright: s * 0.4 }; } },
    sungDim: { n: '歌い終わった文字が沈んでいく', c: '歌詞', f: (ht, g, c, hp) => { const q = kq(g, c, hp), e = clamp(kEnd(g, c, hp) / 0.6); if (q < 1) return q > 0 ? { bright: Math.sin(PI * q) * 0.35 } : {}; return { dark: e * 0.55, y: E.outCubic(e) * g.size * 0.06, sx: 1 - e * 0.04, sy: 1 - e * 0.04 }; } },
    karaokeBar: { n: '歌に合わせて下線が伸びる', c: '歌詞', f: (ht, g, c, hp) => { const q = kq(g, c, hp); return { uline: q, bright: Math.sin(PI * q) * 0.25 }; } },
  });

  /* ================= emphasis accents ================= */
  if (M.emph) Object.assign(M.emph, {
    popHit: { n: 'ポップ（ぽんと膨らむ）', c: 'はずむ', env: 'elastic', dur: 0.45, peak: { s: 0.2 } },
    dropHit: { n: 'ドロップ（沈んで戻る）', c: 'インパクト', env: 'hit', dur: 0.32, peak: { y: 0.26, sy: -0.08, sx: 0.06 } },
    skewSnap: { n: 'スキュースナップ（斜めにはじく）', c: 'インパクト', env: 'hit', dur: 0.3, peak: { skx: 0.42, x: 0.12 } },
    glowHit: { n: 'グロウ（光って膨らむ）', c: '基本', env: 'pulse', dur: 0.42, peak: { bright: 0.75, s: 0.06 } },
    wobbleHit: { n: 'ウォブル（ぐらっと揺れる）', c: '回転', env: 'elastic', dur: 0.6, peak: { rot: 0.16, sx: 0.05 } },
    spreadHit: { n: 'スプレッド（字間がはじける）', c: 'ウェイト', env: 'elastic', dur: 0.5, peak: { track: 0.2 } },
  });

  /* ================= GPU backgrounds ================= */
  const SL = LM.shaderbg && LM.shaderbg.list;
  if (SL) {
    Object.assign(SL, {
      julia: ['ジュリア集合（フラクタルがうねる）', 'VJシェーダー', `
        vec2 z=p*(1.15-0.12*sin(T*0.11)); z*=rot(T*0.05);
        vec2 c=vec2(-0.745+0.05*cos(T*0.13),0.186+0.05*sin(T*0.17)+BASS*0.02);
        float it=0.; float m=0.;
        for(int i=0;i<90;i++){ z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c; m=dot(z,z); if(m>16.)break; it+=1.; }
        float sm=it-log2(max(1.0001,log2(max(m,1.0001))))+4.;
        float v=it>=89.?0.:sm/90.;
        vec3 col=v<=0.?C0*0.6:pal4(v*2.2+T*0.03);
        col+=C2*pow(v,6.)*(0.6+BEAT*0.6);
        col*=0.85+0.15*smoothstep(1.4,0.2,length(p));
        gl_FragColor=vec4(col+grain(gl_FragCoord.xy)*0.03,1.);`],
      sky: ['夕暮れから夜へ（空のグラデーション）', 'グラデーション', `
        float k=0.5+0.5*sin(T*0.04-1.2);
        float y=uv.y;
        vec3 top=mix(mix(C3,C0,0.4),C0*0.35,k), mid=mix(C2,mix(C3,C0,0.6),k), low=mix(mix(C2,C1,0.35),C3*0.6,k);
        vec3 col=y>0.45?mix(mid,top,smoothstep(0.45,1.,y)):mix(low,mid,smoothstep(0.,0.45,y));
        vec2 sp=vec2(0.68,0.32-0.25*k); float sun=length((uv-sp)*vec2(a,1.)); col+=mix(C1,C2,0.5)*(smoothstep(0.08,0.,sun)*(1.-k)+0.25*exp(-sun*6.)*(1.-k*0.8));
        vec2 g=floor(uv*vec2(a,1.)*180.); float st=step(0.9965,h21(g)); col+=vec3(st)*k*smoothstep(0.35,0.8,y)*(0.6+0.4*sin(T*3.+h21(g)*50.));
        float hz=smoothstep(0.18,0.0,abs(y-0.2)); col=mix(col,mix(C3,C1,0.2),hz*0.18);
        gl_FragColor=vec4(col+grain(gl_FragCoord.xy)*0.025,1.);`],
    });
    LM.bgm.lib.gl_julia = { n: SL.julia[0], c: 'VJシェーダー', full: true, gpu: 'julia', f: () => {} };
    LM.bgm.lib.gl_sky = { n: SL.sky[0], c: 'グラデーション', full: true, gpu: 'sky', f: () => {} };
  }

  /* ================= おまかせ: motion grammar per theme =================
   * Each section picks one timing curve and (sometimes) one stagger order from the theme's grammar, so a
   * section reads as one designed motion language instead of library defaults. */
  const G = {
    _: { p: 0.45, ease: { auto: 3, smooth: 1, snappy: 1, aeEasy: 1 }, so: { auto: 4, center: 1, random: 0.6 } },
    jpop: { p: 0.55, ease: { auto: 2, backInOut: 1.2, snappy: 1, bounceOut: 0.6 }, so: { auto: 3, center: 1, radialOut: 1 } },
    rock: { p: 0.5, ease: { auto: 2, expoInOut: 1.2, snappy: 1.2, steps8: 0.5 }, so: { auto: 3, random: 1.2, edges: 0.6 } },
    metal: { p: 0.5, ease: { auto: 2, expoInOut: 1.2, snappy: 1, steps8: 0.8 }, so: { auto: 3, random: 1.5 } },
    edm: { p: 0.6, ease: { auto: 2, snappy: 1.5, expoInOut: 1, swift: 1 }, so: { auto: 2, radialOut: 1.5, center: 1, ltr: 0.8 } },
    house: { p: 0.6, ease: { auto: 2, snappy: 1.2, swift: 1, backInOut: 0.6 }, so: { auto: 2, center: 1.2, radialOut: 1 } },
    hiphop: { p: 0.5, ease: { auto: 2, snappy: 1.5, steps4: 0.8, swift: 0.8 }, so: { auto: 3, lines: 1, ltr: 1 } },
    rnb: { p: 0.55, ease: { auto: 2, sineInOut: 1.5, aeEasy: 1.2, glide: 1 }, so: { auto: 3, ltr: 1, center: 0.6 } },
    ballad: { p: 0.55, ease: { auto: 2, sineInOut: 1.5, decel: 1.2, aeEasy: 1 }, so: { auto: 3, ltr: 1, lines: 1 } },
    lofi: { p: 0.5, ease: { auto: 2, steps8: 1, sineOut: 1, rough: 0.8 }, so: { auto: 3, ltr: 1 } },
    citypop: { p: 0.55, ease: { auto: 2, smooth: 1.2, swift: 1, circOut: 1 }, so: { auto: 3, diag: 1, ltr: 1 } },
    vocaloid: { p: 0.6, ease: { auto: 2, steps4: 1.2, steps8: 1, snappy: 1 }, so: { auto: 2, random: 1.5, ttb: 0.8, radialOut: 0.8 } },
    anison: { p: 0.55, ease: { auto: 2, expoInOut: 1.2, backInOut: 1, snappy: 1 }, so: { auto: 3, diag: 1.2, center: 0.8 } },
    cinematic: { p: 0.6, ease: { auto: 2, aeEasy: 1.5, decel: 1.2, quintInOut: 0.8 }, so: { auto: 3, center: 1, ltr: 1 } },
    wa: { p: 0.55, ease: { auto: 2, sineInOut: 1.5, decel: 1, aeEasy: 0.8 }, so: { auto: 3, ttb: 1.2, lines: 1 } },
    acoustic: { p: 0.5, ease: { auto: 2, sineOut: 1.2, rough: 0.8, decel: 1 }, so: { auto: 3, ltr: 1 } },
    ambient: { p: 0.55, ease: { auto: 2, sineInOut: 1.5, slowmo: 1, decel: 1 }, so: { auto: 3, radialOut: 1, center: 1 } },
    minimal: { p: 0.6, ease: { auto: 2, quintInOut: 1.2, smooth: 1.2, swift: 1 }, so: { auto: 2, lines: 1.2, ltr: 1, ttb: 0.8 } },
    dream: { p: 0.55, ease: { auto: 2, sineInOut: 1.5, slowmo: 1, elasticInOut: 0.4 }, so: { auto: 3, radialOut: 1, random: 0.8 } },
    showreel: { p: 0.7, ease: { auto: 1, quintInOut: 1.5, swift: 1.2, snappy: 1.2, expoInOut: 1 }, so: { auto: 2, angle: 1, diag: 1, radialOut: 1, lines: 1 } },
    edge: { p: 0.6, ease: { auto: 2, steps4: 1, snappy: 1.2, expoInOut: 1 }, so: { auto: 2, random: 1.2, angle: 0.8, btt: 0.6 } },
    artistmv: { p: 0.6, ease: { auto: 2, aeEasy: 1.2, quintInOut: 1, swift: 1 }, so: { auto: 3, ltr: 1, center: 0.8, lines: 0.8 } },
  };
  const SE_BY = { radialOut: 'easeIn', center: 'easeIn', lines: 'linear', random: 'linear' };
  // pick a grammar for one section (deterministic per rng)
  function grammar(themeId, rng, energy) {
    const g = G[themeId] || G._;
    if (rng() > g.p) return null;
    const ease = rng.weighted(g.ease), so = rng.weighted(g.so);
    const out = {};
    if (ease && ease !== 'auto') out.ease = ease;
    if (so && so !== 'auto') { out.so = so; if (so === 'angle') out.sa = Math.round((rng() * 2 - 1) * 60); if (SE_BY[so] && rng() < 0.5) out.se = SE_BY[so]; else if (energy > 0.7 && rng() < 0.3) out.se = 'expo'; }
    return Object.keys(out).length ? out : null;
  }
  LM.MS.GRAMMAR = G; LM.MS.grammar = grammar;

  /* ================= new おまかせ themes ================= */
  const NT = [
    { id: 'kpop', n: 'K-POP', d: 'シャープで華やか。強いタイポと光沢、キメの多いカット', emoji: '♛', pals: ['candy', 'eblue', 'laser', 'cyber', 'cotton', 'rose'], fonts: ['montserrat', 'outfit', 'gothic', 'anton', 'unbounded'],
      layouts: { poster: 3, wordFlash: 2.5, stack: 2, bigsmall: 2, center: 2, cardDeck: 1, cameraTrack: 1 },
      enter: { scalePunchIn: 3, slideRightIn: 2, wordSlam: 1.5, lightScan: 1.5, skewIn: 1.5, checkerIn: 1, slam: 1 },
      hold: { beatPump: 2, pulse: 2, sidechainPump: 1.2, none: 1, shimmer: 1 },
      exit: { slideBlurOut: 2, zoomThrough: 1.5, cut: 1.5, curtainOut: 1, zoomSmearOut: 1 },
      filters: { glowText: 2, flash: 1.5, bloom: 1.5, sparkle: 1.5, chromatic: 1, gradientText: 1 },
      post: ['bloom'], bg: ['radial', 'gradient', 'mesh'], camera: { punch: 2.5, snapZoom: 2, pump: 1, still: 1 }, fx: 0.7, maxFx: 2, speed: 1.2, keyColor: true, beat: true, amp: 1.2,
      tr: { flashWhite: 2, whipLeft: 1.5, zoomThrough: 1.5, rgbCut: 1, strobeCut: 1, snapZoomCut: 1.5, starZoom: 0.8 }, trRate: 0.6,
      gx: { glowPulse: 2, sparks: 1.5, lineBurst: 1.2, bracketSnap: 1 }, gxRate: 0.45,
      bgm: { gl_holo: 2, gl_prism: 1.5, lightLeaks: 1.5, anamorphic: 1.5, lasers: 1, gl_lensDiscs: 1 } },
    { id: 'hyperpop', n: 'ハイパーポップ / Y2K', d: '過剰でキラキラ。クローム・グリッター・崩し', emoji: '✺', pals: ['candy', 'acid', 'vapor', 'toxic', 'cotton', 'baby'], fonts: ['unbounded', 'rubikglitch', 'bungee', 'mochiy', 'potta'],
      layouts: { scatter: 2.5, poster: 2, grid: 2, textRings: 1.5, fullStack: 1.5, bigCrop: 1.5, wordFlash: 1 },
      enter: { rgbIn: 2, glitchZoom: 2, popcorn: 2, sparkPop: 2, flapIn: 1.5, stepZoom: 1.5, shardsIn: 1.2 },
      hold: { rgbJitter: 2, bounceLoop: 2, spinLetters: 1, colorWave: 2, jelly: 1 },
      exit: { pumpOut: 2, glitchOut: 2, shatter: 1.5, popOut: 2, stutterOut: 1 },
      filters: { sparkle: 2, chromatic: 1.5, rainbowStack: 1.5, stackColor: 1.5, glitch: 1, hueCycle: 1, bloom: 1 },
      post: ['bloom'], bg: ['mesh', 'gradient'], camera: { punch: 2, shake: 1, snapZoom: 2, beatTilt: 1.5 }, fx: 0.85, maxFx: 2, speed: 1.35, keyColor: true, beat: true, amp: 1.35,
      tr: { gradientDiscs: 2, colorBurst: 2, rgbCut: 1.5, zoomTwist: 1.5, tileScatter: 1, swirlCut: 1.2, kaleidoCut: 1 }, trRate: 0.75,
      gx: { sparks: 2, confettiPop: 1.5, stickerTag: 1.5, circleBadge: 1, splat: 1 }, gxRate: 0.6,
      bgm: { gl_chrome: 2, gl_holo: 2, gl_liquidMarble: 1.5, shapeBurst: 1.5, bouncingBalls: 1, gl_blobs: 1 } },
    { id: 'chiptune', n: '8bit / チップチューン', d: 'ドット絵とゲーム画面。コマ打ちとピコピコ点滅', emoji: '▣', pals: ['arcade', 'lime', 'cyber', 'riso', 'eblue'], fonts: ['pressstart', 'vt323', 'mono', 'jbmono', 'stick'],
      layouts: { grid: 3, center: 2, labels: 2, tileWall: 1.5, corner: 1, frame: 1 },
      enter: { typewriter: 2, stepZoom: 2, blinkIn: 2, randomReveal: 2, flapIn: 2, stopMotion: 1.5, checkerIn: 1 },
      hold: { shakeStep: 2, marchStep: 2, bounceLoop: 1.5, caretBlink: 1, none: 1 },
      exit: { backspaceOut: 2, tvOff: 2, dissolve: 2, cut: 1.5, selectDelete: 1 },
      filters: { pixelArt: 2, dither: 1.5, scanlines: 1.5, crt: 1, stepFrames: 1 },
      post: ['scanlines'], bg: ['solid'], camera: { zoomStep: 2, still: 2, punch: 1, beatTilt: 1 }, fx: 0.7, maxFx: 2, speed: 1.2, keyColor: true, beat: true, amp: 1.1,
      tr: { pixelCut: 2.5, gridPop: 2, tileScatter: 1.5, invertCut: 1.5, halftoneWipe: 1, checker: 0 }, trRate: 0.6,
      gx: { squareSpin: 1.5, chevrons: 1.5, orbitDots: 1, tagCorner: 1 }, gxRate: 0.4,
      bgm: { pixelField: 2, checkerScroll: 1.5, gl_checker: 1.5, beatBounce: 1.5, charMatrix: 1 } },
    { id: 'jazz', n: 'ジャズ / スウィング', d: 'スモーキーで上品。金と紺、イタリックと揺れ', emoji: '♫', pals: ['midnight', 'golden', 'wine', 'neonoir', 'dusk'], fonts: ['playfair', 'dmserif', 'cormorant', 'mincho', 'greatvibes'],
      layouts: { center: 3, editorial: 2, spotlight: 2, corner: 1.5, subtitle: 1, frame: 1 },
      enter: { silkSlide: 2.5, velvetRise: 2, handWrite: 1.5, lightScan: 1.5, blurIn: 1.5, curtainIn: 1, liquidFill: 0.8 },
      hold: { grooveSway: 2.5, drift: 2, shimmer: 1.5, swayFlow: 1 },
      exit: { silkSlideOut: 2, blurOut: 2, drainOut: 1.2, fadeOut: 2, dustOut: 0.8 },
      filters: { goldDust: 2, glowText: 1.5, filmScratch: 1, bokeh: 1.5, vignette: 1 },
      post: ['vignette', 'noise'], bg: ['radial', 'solid'], camera: { drift: 2, handheld: 1.5, kenBurns: 1.5, groove: 1.5 }, fx: 0.55, maxFx: 1, speed: 0.9, keyColor: true, beat: false, amp: 0.85,
      tr: { silkWipe: 2, leakBurn: 1.5, irisBlades: 1.2, blurCut: 1.5, pageTurn: 1 }, trRate: 0.3,
      gx: { swashUnder: 2, halo: 1, frameDraw: 1 }, gxRate: 0.3,
      bgm: { candleBokeh: 2, smoke: 1.5, slowBlinds: 2, vinylSpin: 1.5, bokehDrift: 1 } },
    { id: 'funk', n: 'ファンク / ディスコ', d: '70年代のグルーヴ。太いスクリプトと放射ストライプ', emoji: '☀', pals: ['seventies', 'diner', 'citypop', 'sunset', 'mustard'], fonts: ['shrikhand', 'righteous', 'abril', 'alfaslab', 'mochiy'],
      layouts: { stack: 2.5, poster: 2.5, ribbon: 2, wavePath: 2, bigsmall: 1.5, burst: 1 },
      enter: { pumpIn: 2, wordPop: 2, slingshot: 1.5, flapIn: 1, scalePunchIn: 1.5, boomerang: 1.5, rubberChars: 1 },
      hold: { grooveSway: 2.5, fourFloor: 2, marchStep: 1.5, beatPump: 1.5 },
      exit: { pumpOut: 2, slideOut: 1.5, popOut: 1.5, curtainOut: 1, jumpOut: 1 },
      filters: { stripes: 2, sparkle: 1.5, longShadow: 2, extrude: 2, halftone: 1 },
      post: [], bg: ['sunset', 'radial', 'gradient'], camera: { groove: 2.5, pump: 1.5, beatTilt: 1.5, still: 0.5 }, fx: 0.7, maxFx: 2, speed: 1.1, keyColor: true, beat: true, amp: 1.15,
      tr: { colorBlocks: 2, barsH: 1.5, stripesDiag: 2, gradientDiscs: 1.5, iris: 1, halftoneWipe: 1 }, trRate: 0.55,
      gx: { swashUnder: 1.5, sparks: 1.5, halftoneDisc: 1.5, circleBadge: 1 }, gxRate: 0.45,
      bgm: { discoBall: 2, danceFloor: 2, sunburst: 2, stripesScroll: 1.5, opRays: 1 } },
    { id: 'punk', n: 'パンク / ガレージ', d: 'コピー機とガムテープのDIY。荒く速く', emoji: '☠', pals: ['xerox', 'brutal', 'grunge', 'limepunch', 'ink', 'tomato'], fonts: ['marker', 'anton', 'impact', 'stick', 'rocknroll'],
      layouts: { scatter: 2.5, poster: 2.5, diagonal: 2, stack: 2, metaPoster: 1.5, outline: 1 },
      enter: { stamp: 2.5, stopMotion: 2, wordSlam: 2, slam: 1.5, stutterIn: 1.5, strokeDraw: 0.8 },
      hold: { jitter: 2, shakeStep: 2, erodeHold: 1.5, quake: 1 },
      exit: { strikeOut: 2, burnOut: 1.5, shatter: 1.5, collapseOut: 1.5, cut: 1.5 },
      filters: { misprint: 2, erodeText: 1.5, halftone: 1.5, paper: 1.5, filmScratch: 1, shake: 1.5 },
      post: ['noise'], bg: ['solid'], camera: { handheld: 2, shake: 2, punch: 1.5 }, fx: 0.8, maxFx: 2, speed: 1.35, keyColor: true, beat: true, amp: 1.3,
      tr: { tornPaper: 2, collageSlam: 2, scribbleFill: 1.5, shakeCut: 1.5, dryBrush: 1 }, trRate: 0.65,
      gx: { scribbleMarks: 2, strikeOut: 1.5, stickerTag: 1.5, splat: 1.5 }, gxRate: 0.55,
      bgm: { swissGrit: 2, riso: 2, tvStatic: 1, hazardStripe: 1 } },
    { id: 'trap', n: 'トラップ / ドリル', d: '暗く重い低音。黒と鋭い光、叩きつけ', emoji: '⛓', pals: ['blackout', 'neonoir', 'ink', 'laser', 'acidgreen'], fonts: ['anton', 'bigshoulders', 'oswald', 'impact', 'teko'],
      layouts: { poster: 3, bigCrop: 2, stack: 2, center: 1.5, wordFlash: 2, outline: 1 },
      enter: { wordSlam: 2.5, zoomRush: 2, slam: 2, rgbIn: 1.5, weightPunch: 1.5, lightScan: 1 },
      hold: { sidechainPump: 2, quake: 1.5, beatPump: 2, rgbJitter: 1 },
      exit: { cut: 2, dustOut: 1.5, rushOut: 1.5, glitchOut: 1, burnOut: 1 },
      filters: { chromatic: 1.5, contrastPop: 1.5, rgb: 1, vignette: 1.5, speedLines: 1 },
      post: ['vignette', 'noise'], bg: ['solid', 'radial'], camera: { handheld: 2, snapZoom: 2, punch: 2, shake: 1 }, fx: 0.7, maxFx: 2, speed: 1.15, keyColor: true, beat: true, amp: 1.3,
      tr: { shakeCut: 2, rgbCut: 1.5, zoomThrough: 1.5, strobeCut: 1.5, whipDown: 1, moshCut: 1.2 }, trRate: 0.6,
      gx: { slashes: 1.5, speedBars: 1.5, glowPulse: 1 }, gxRate: 0.35,
      bgm: { focusLines: 1.5, lightTrails: 2, gl_glitchBars: 1.5, smoke: 2, lasers: 1 } },
    { id: 'classical', n: 'クラシカル / オーケストラ', d: '荘厳で格調高い。金のセリフ体と光、ゆったり', emoji: '♕', pals: ['golden', 'cream', 'wine', 'paper', 'monofilm'], fonts: ['cormorant', 'mincho', 'shippoB1', 'playfair', 'zenold'],
      layouts: { center: 4, frame: 2, editorial: 1.5, vertical: 1.5, spotlight: 1.5, mirror: 1 },
      enter: { strokeDraw: 2, lightScan: 2, blurIn: 2, curtainIn: 1.5, liquidFill: 1.2, tracking: 1.5, penWrite: 1 },
      hold: { zoomSlow: 2.5, drift: 2, shimmer: 1.5, breathe: 1 },
      exit: { dustOut: 2, blurOut: 2, fadeOut: 2, curtainOut: 1 },
      filters: { goldDust: 2, lightLeak: 1.5, vignette: 1.5, paper: 1, bokeh: 1 },
      post: ['vignette'], bg: ['radial', 'solid'], camera: { crane: 2, kenBurns: 2, push: 1.5, drift: 1 }, fx: 0.5, maxFx: 1, speed: 0.8, keyColor: false, beat: false, amp: 0.8,
      tr: { leakBurn: 2, irisBlades: 1.2, silkWipe: 1.5, blurCut: 1.5, filmBurnCut: 1, pageTurn: 1.2 }, trRate: 0.25,
      gx: { frameDraw: 2, swashUnder: 1.5, halo: 1 }, gxRate: 0.3,
      bgm: { godRays: 2, candleBokeh: 1.5, particles: 1.5, gl_curtain: 1.5, gl_sky: 1 } },
    { id: 'horror', n: 'ホラー / ダーク', d: '不穏で冷たい。ちらつき・傷・燃え尽きる文字', emoji: '☾', pals: ['blackout', 'wine', 'monofilm', 'sumi', 'neonoir'], fonts: ['antique', 'shippoB1', 'kurenaido', 'train', 'cormorant'],
      layouts: { center: 3, vertical: 2, corner: 2, spotlight: 2, subtitle: 1, echo: 1 },
      enter: { flickerType: 2, noiseIn: 1.5, blinkIn: 1.5, waterIn: 1.2, focusPull: 1.5, handWrite: 1, lightScan: 0.8 },
      hold: { flicker: 2, jitter: 1.5, erodeHold: 1.5, glitchHold: 1 },
      exit: { burnOut: 2, dustOut: 2, drainOut: 1.5, tvOff: 1, meltDot: 0.8 },
      filters: { filmScratch: 2, vhs: 1.5, noise: 1.5, vignette: 2, chromatic: 1, erodeText: 1 },
      post: ['noise', 'vignette'], bg: ['solid', 'radial'], camera: { handheld: 2.5, dutch: 2, push: 1.5 }, fx: 0.7, maxFx: 2, speed: 0.9, keyColor: false, beat: false, amp: 0.95,
      tr: { filmBurnCut: 2, invertCut: 1.5, glitchCut: 1.5, meltCut: 1.5, strobeCut: 1, rippleCut: 1 }, trRate: 0.4,
      gx: { scribbleMarks: 1, strikeOut: 1 }, gxRate: 0.15,
      bgm: { smoke: 2, tvStatic: 1.5, filmGate: 2, storm: 1.5 } },
    { id: 'kids', n: 'キッズ / どうよう', d: 'まるくて楽しい。パステル・弾む・紙吹雪', emoji: '✿', pals: ['candy', 'sherbet', 'baby', 'cotton', 'popart', 'mint'], fonts: ['mochiy', 'rounded', 'potta', 'kiwi', 'nunito'],
      layouts: { center: 3, wavePath: 2, bigsmall: 2, stack: 1.5, labels: 1.5, orbit: 1 },
      enter: { bounce: 2.5, springRise: 2, popcorn: 2, wordPop: 2, elastic: 1.5, jumpIn: 1.5 },
      hold: { bounceLoop: 2, jelly: 2, float: 1.5, wave: 1.5, singPop: 1 },
      exit: { popOut: 2, bubbleUp: 2, squashOut: 1.5, jumpOut: 1.5 },
      filters: { confetti: 2, sparkle: 2, dots: 1.5, extrude: 1, markerText: 1 },
      post: [], bg: ['gradient', 'solid', 'mesh'], camera: { still: 2, float: 2, beatTilt: 1 }, fx: 0.6, maxFx: 2, speed: 1.05, keyColor: true, beat: true, amp: 1.1,
      tr: { gradientDiscs: 2, gridPop: 2, colorBurst: 1.5, splashFill: 1.5, iris: 1, halftoneWipe: 1, starZoom: 1.2 }, trRate: 0.5,
      gx: { confettiPop: 2, sparks: 2, scribble: 1, orbitDots: 1 }, gxRate: 0.5,
      bgm: { bubbles: 2, confetti: 1.5, floatShapes: 2, bouncingBalls: 1.5, polkaPulse: 1.5 } },
    { id: 'latin', n: 'ラテン / レゲトン', d: '熱く鮮やか。太陽の配色と腰にくるリズム', emoji: '✹', pals: ['tomato', 'sunset', 'ember', 'mustard', 'terracotta', 'seventies'], fonts: ['shrikhand', 'anton', 'lobster', 'righteous', 'impact'],
      layouts: { poster: 2.5, stack: 2.5, diagonal: 2, bigsmall: 2, ribbon: 1.5, wordFlash: 1 },
      enter: { skewIn: 2, slam: 2, wordPop: 2, slideRightIn: 1.5, scalePunchIn: 1.5, pumpIn: 1 },
      hold: { grooveSway: 2.5, beatPump: 2, marchStep: 1.5, sidechainPump: 1 },
      exit: { slideBlurOut: 2, pumpOut: 1.5, curtainOut: 1, explodeOut: 1 },
      filters: { stripes: 1.5, extrude: 1.5, longShadow: 1.5, sparkle: 1, halftone: 1 },
      post: [], bg: ['sunset', 'radial'], camera: { groove: 2.5, pump: 1.5, punch: 1.5 }, fx: 0.7, maxFx: 2, speed: 1.15, keyColor: true, beat: true, amp: 1.2,
      tr: { colorBlocks: 2, stripesDiag: 1.5, splashFill: 1.5, colorBurst: 1.5, whipRight: 1.5 }, trRate: 0.55,
      gx: { sparks: 1.5, halftoneDisc: 1.5, swashUnder: 1 }, gxRate: 0.4,
      bgm: { sunburst: 2, opWaves: 1.5, confetti: 1, danceFloor: 1.5, stripesScroll: 1.5 } },
    { id: 'techno', n: 'テクノ / インダストリアル', d: 'モノクロの機械仕掛け。グリッド・HUD・反復', emoji: '⌗', pals: ['concrete', 'steel', 'blackout', 'whiteout', 'opred'], fonts: ['spacegrotesk', 'plexmono', 'syncopate', 'rubikmono', 'barlowc'],
      layouts: { columns: 2, grid: 2, metaPoster: 2, tileWall: 1.5, corner: 1.5, stack: 1.5, center: 1 },
      enter: { compressIn: 2, flapIn: 2, lineSplitIn: 1.5, checkerIn: 1.5, condensedIn: 1.5, lightScan: 1.2, randomReveal: 1 },
      hold: { baselineStep: 2, stripHold: 1.5, weightBeat: 1.5, fourFloor: 1.5, none: 1 },
      exit: { trackCollapseOut: 2, curtainOut: 1.5, cut: 2, selectDelete: 1.2 },
      filters: { hudFrame: 2, reticle: 1.5, gridPaper: 1.5, monoBeat: 1, scanlines: 1, barcode: 1 },
      post: [], bg: ['solid'], camera: { zoomStep: 2, still: 2, beatTilt: 1 }, fx: 0.6, maxFx: 2, speed: 1.15, keyColor: true, beat: true, amp: 1.05,
      tr: { sliceBands: 2, barsH: 1.5, strobeCut: 1.5, pixelSortCut: 1.5, doorsH: 1, cubeTurn: 1.2 }, trRate: 0.55,
      gx: { metaHud: 2, hudScan: 1.5, bracketSnap: 1.5, tagCorner: 1 }, gxRate: 0.45,
      bgm: { hudRings: 2, gl_laserGrid: 1.5, squareTunnel: 1.5, hazardStripe: 1, scope: 1.5 } },
  ];
  const LIB = { layouts: LM.layout.lib, enter: M.enter, hold: M.hold, exit: M.exit, filters: LM.fx.list, tr: TR, gx: LM.gfx.lib, bgm: LM.bgm.lib, camera: D.cameras };
  NT.forEach((t) => {
    Object.keys(LIB).forEach((k) => { if (t[k]) Object.keys(t[k]).forEach((id) => { if (!LIB[k][id] || !(t[k][id] > 0)) delete t[k][id]; }); });
    t.pals = t.pals.filter((id) => D.palById[id]); t.fonts = t.fonts.filter((id) => D.fontById[id]);
    if (!D.themeById[t.id]) { D.themes.push(t); D.themeById[t.id] = t; }
  });

  /* ================= existing themes pick up the new vocabulary ================= */
  const add = (id, k, o) => { const t = D.themeById[id]; if (!t) return; const lib = LIB[k] || {}; Object.keys(o).forEach((x) => { if (!lib[x]) delete o[x]; }); t[k] = Object.assign({}, t[k] || {}, o); };
  // cameras
  add('cinematic', 'camera', { kenBurns: 1.5, crane: 1.2, dutch: 0.4 }); add('ballad', 'camera', { kenBurns: 1.5, crane: 1 }); add('ambient', 'camera', { spiralDrift: 1, kenBurns: 1 });
  add('rock', 'camera', { handheld: 2, snapZoom: 1 }); add('metal', 'camera', { handheld: 1.5, snapZoom: 1, dutch: 0.8 }); add('hiphop', 'camera', { handheld: 1.5, snapZoom: 1.2, beatTilt: 1 });
  add('lofi', 'camera', { handheld: 1.2 }); add('anison', 'camera', { snapZoom: 1.5, dutch: 0.8 }); add('edm', 'camera', { snapZoom: 1.2, spiralDrift: 0.6 }); add('vocaloid', 'camera', { beatTilt: 1.5, snapZoom: 1 });
  add('jpop', 'camera', { beatTilt: 1, snapZoom: 0.8 }); add('dream', 'camera', { spiralDrift: 1.5, orbit: 1 }); add('artistmv', 'camera', { handheld: 1.2, kenBurns: 1, orbit: 1 }); add('showreel', 'camera', { orbit: 1.2, snapZoom: 1 });
  add('wa', 'camera', { crane: 1, kenBurns: 1 }); add('acoustic', 'camera', { handheld: 1.5, kenBurns: 1 }); add('rnb', 'camera', { kenBurns: 1, orbit: 0.8 });
  // transitions
  add('jpop', 'tr', { starZoom: 1, halftoneWipe: 0.8 }); add('rock', 'tr', { shards: 1, snapZoomCut: 1 }); add('metal', 'tr', { shards: 1.2, moshCut: 0.8 }); add('edm', 'tr', { swirlCut: 1, kaleidoCut: 1, snapZoomCut: 1 });
  add('psyche', 'tr', { swirlCut: 1.5, kaleidoCut: 1.5, rippleCut: 1 }); add('thermalvj', 'tr', { moshCut: 1.5 }); add('vj', 'tr', { kaleidoCut: 1.2, swirlCut: 1 }); add('vocaloid', 'tr', { moshCut: 1, halftoneWipe: 0.8 });
  add('ballad', 'tr', { rippleCut: 0.8, pageTurn: 0.8 }); add('dream', 'tr', { rippleCut: 1.2, swirlCut: 0.6 }); add('citypop', 'tr', { cubeTurn: 1, halftoneWipe: 1 }); add('showreel', 'tr', { cubeTurn: 1.2, pageTurn: 1, halftoneWipe: 1 });
  add('hiphop', 'tr', { halftoneWipe: 1 }); add('anison', 'tr', { starZoom: 1, snapZoomCut: 1 }); add('wa', 'tr', { pageTurn: 1 }); add('acoustic', 'tr', { pageTurn: 1.2 }); add('lofi', 'tr', { pageTurn: 1 });
  // holds (karaoke family)
  add('jpop', 'hold', { singPop: 1.2, karaokeGlow: 1 }); add('anison', 'hold', { karaokeGlow: 1.2 }); add('ballad', 'hold', { sungDim: 1.2, karaokeGlow: 0.8 }); add('citypop', 'hold', { karaokeBar: 1 });
  add('acoustic', 'hold', { sungDim: 1 }); add('cinematic', 'hold', { sungDim: 0.8 }); add('rnb', 'hold', { karaokeGlow: 1 }); add('vocaloid', 'hold', { singPop: 1 }); add('minimal', 'hold', { karaokeBar: 1 });
  // backgrounds
  add('psyche', 'bgm', { gl_julia: 1.5 }); add('vj', 'bgm', { gl_julia: 1.2 }); add('thermalvj', 'bgm', { gl_julia: 1 }); add('ambient', 'bgm', { gl_sky: 1.5 }); add('ballad', 'bgm', { gl_sky: 1.2 }); add('citypop', 'bgm', { gl_sky: 1.5 }); add('dream', 'bgm', { gl_sky: 1 });

  /* emphasis vocabulary for the new themes + new accents in existing ones (read by the director) */
  LM.director_EMPH = {
    kpop: { scalePunch: 2, glowHit: 1.5, skewSnap: 1.2, colorFlash: 1 }, hyperpop: { popHit: 2, rgbHit: 1.5, wobbleHit: 1.5, elasticHit: 1 }, chiptune: { dropHit: 1.5, jitterHit: 1.5, colorFlash: 1.5, popHit: 1 },
    jazz: { glowHit: 1.5, wobbleHit: 1, pulse: 1.5 }, funk: { popHit: 2, dropHit: 1.5, wobbleHit: 1.2, spreadHit: 1 }, punk: { impact: 2, shake: 1.5, skewSnap: 1.5 },
    trap: { dropHit: 2, impact: 1.5, rgbHit: 1 }, classical: { glowHit: 2, pulse: 1.5, spreadHit: 1 }, horror: { jitterHit: 1.5, blurPulse: 1.5, glowHit: 0.8 },
    kids: { popHit: 2, bounce: 2, wobbleHit: 1.5 }, latin: { popHit: 1.5, dropHit: 1.5, skewSnap: 1.2, scalePunch: 1 }, techno: { spreadHit: 1.5, trackCompress: 1.5, colorFlash: 1, weightHit: 1 },
  };
  LM.director_CALM = ['jazz', 'classical', 'horror'];
})();
