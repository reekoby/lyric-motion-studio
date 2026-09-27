/* Motion-graphics pack 2 (ref: Motion Array stock motion graphics — backgrounds & transitions):
 * GPU: ink marble, diamond tile flip, gradient tubes, lens discs, prism refraction, stripe zoom, liquid metal marble
 * Canvas overlays: light leaks, anamorphic flare, prism shards, 8mm film gate, light trails, swiss-grit collage
 * Transitions: liquid drip, splash fill, colour burst, hexagon flip, tile scatter, ink blob, scribble fill, dry brush,
 *              collage slam, gradient ribbons, gradient discs, light-leak burn, film roll, doors, prism flash */
'use strict';
(() => {
  const U = LM.U, { clamp, lerp, hash, rgba, mix } = U;
  const E = LM.E, PI = Math.PI, TAU = PI * 2;
  const TR = LM.trans.lib, BG = LM.bgm.lib, SH = LM.shaderbg.list;
  const inOut = (u) => (u < 0.5 ? E.inOutCubic(u * 2) : 1 - E.inOutCubic((u - 0.5) * 2));
  const wrap = (v, m) => ((v % m) + m) % m;
  // value noise (JS)
  const hh = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const sm = (t) => t * t * (3 - 2 * t);
  const vnoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); return lerp(lerp(hh(xi, yi), hh(xi + 1, yi), xf), lerp(hh(xi, yi + 1), hh(xi + 1, yi + 1), xf), yf); };
  const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 5.2, y * 2.1 + 1.3) * 0.3 + vnoise(x * 4.3 + 9.1, y * 4.3 + 3.7) * 0.15;
  // low-res threshold mask painter (organic shapes) → upscaled with smoothing
  const mc = document.createElement('canvas'), mx = mc.getContext('2d');
  function mask(ctx, R, fn, col, res = 170) {
    const a = R.W / R.H, w = Math.round(a >= 1 ? res : res * a), h = Math.round(a >= 1 ? res / a : res);
    if (mc.width !== w || mc.height !== h) { mc.width = w; mc.height = h; }
    const img = mx.createImageData(w, h), d = img.data, [r, g, b] = U.hex2rgb(col);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = fn(x / w, y / h, a); if (v <= 0) continue; const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255 * clamp(v); }
    mx.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(mc, 0, 0, R.W, R.H); ctx.restore();
  }
  const edge = (v, th, k = 0.035) => clamp((v - th) / k + 0.5);

  /* ================= GPU backgrounds ================= */
  const G = {
    inkMarble: ['インク・マーブル（2色の流体）', 'グラデーション', `
      vec2 q=p*1.6; float t=T*.18;
      vec2 w=vec2(fbm(q+vec2(t,-t*.7)),fbm(q+vec2(5.2-t*.6,1.3+t)));
      float n=fbm(q+2.4*w+vec2(0.,t*.5));
      float band=smoothstep(.47,.5,n)-smoothstep(.62,.65,n)*.0;
      float vein=smoothstep(.015,0.,abs(n-.56))*.8;
      vec3 c=mix(C0,C1,band); c=mix(c,C2,vein);
      c+=grain(gl_FragCoord.xy)*.06;
      gl_FragColor=vec4(c,1.);`],
    tileFlip: ['菱形タイルのフリップ', 'パターン', `
      vec2 q=(p*rot(.785398))*6.; vec2 id=floor(q), f=fract(q)-.5;
      float ph=T*1.2+dot(id,vec2(.35,.22))*.9+h21(id)*.6;
      float fl=cos(ph*PI*.5); float s=abs(fl);
      float inside=step(abs(f.x),.46*s)*step(abs(f.y),.46);
      vec3 face=fl>0.?C1:C2; vec3 c=C0; c=mix(c,face*(.75+.25*s),inside);
      c+=(1.-s)*inside*.08+BEAT*.04;
      gl_FragColor=vec4(c,1.);`],
    tubes: ['グラデーション・チューブ', 'パターン', `
      vec2 q=p*3.2+vec2(T*.15,T*.08); vec2 id=floor(q), f=fract(q)-.5;
      if(h21(id)>.5)f.x=-f.x;
      vec2 c1=f-vec2(.5,.5)*sign(f.x+f.y+1e-4);
      float d1=abs(length(f-vec2(.5))-.5), d2=abs(length(f+vec2(.5))-.5);
      float d=min(d1,d2); float an=d1<d2?atan(f.y-.5,f.x-.5):atan(f.y+.5,f.x+.5);
      float tube=smoothstep(.2,.17,d); float sh=1.-pow(d/.2,2.);
      vec3 col=pal4(an/TAU+h21(id)*.3+T*.1);
      vec3 c=mix(C0,col*(.55+.55*sh),tube)+vec3(1.)*pow(max(sh,0.),12.)*tube*.35;
      gl_FragColor=vec4(c,1.);`],
    lensDiscs: ['レンズ状の同心グラデーション', 'グラデーション', `
      vec3 c=C0; float t=T*.3;
      for(int i=0;i<4;i++){ float fi=float(i); vec2 o=vec2(sin(t+fi*1.7)*.55,cos(t*.8+fi*2.1)*.3); float r=length(p-o);
        float R0=.28+.08*sin(t*1.3+fi)+BASS*.05; float band=fract(r*9.-T*.6);
        vec3 g=mix(C2,C3,band); if(r<R0)c=mix(c,g*(0.8+.4*(1.-r/R0)),.92); }
      gl_FragColor=vec4(c,1.);`],
    prism: ['プリズムの屈折光', 'VJシェーダー', `
      vec3 c=C0*.35;
      for(int i=0;i<7;i++){ float fi=float(i); vec2 o=vec2(sin(T*.2+fi*2.3)*.7,cos(T*.17+fi*1.3)*.4);
        vec2 q=(p-o)*rot(T*.1+fi); float s=.12+.1*h21(vec2(fi,3.));
        for(int k=0;k<3;k++){ vec2 qq=q+vec2(float(k)-1.,0.)*.012; float tri=max(abs(qq.x)*.866+qq.y*.5,-qq.y)-s; float m=smoothstep(.01,0.,tri);
          vec3 ch=k==0?vec3(1.,.2,.4):k==1?vec3(.3,1.,.4):vec3(.3,.4,1.); c+=m*ch*mix(C2,C3,h21(vec2(fi,1.)))*.55; } }
      c+=vec3(1.)*BEAT*.05;
      gl_FragColor=vec4(c,1.);`],
    stripeZoom: ['ダイアゴナル・ストライプ・ズーム', 'パターン', `
      float z=1.+.35*sin(T*.7)+BEAT*.1; vec2 q=p*rot(.6+sin(T*.2)*.2)/z;
      float s=step(.5,fract(q.x*5.+T*.4)); float warp=fbm(q*2.+T*.2);
      s=step(.5,fract(q.x*5.+warp*.8+T*.4));
      gl_FragColor=vec4(mix(C0,C1,s),1.);`],
    liquidMarble: ['リキッドメタル・マーブル', 'グラデーション', `
      vec2 q=p*1.2; float t=T*.22; q+=.4*vec2(fbm(q*1.5+t),fbm(q*1.5-t+4.));
      float n=fbm(q*2.+vec2(t*.3,0.)); float l=sin(n*18.+t*2.)*.5+.5;
      vec3 metal=mix(vec3(.05),vec3(.95),pow(l,1.6)); vec3 tint=mix(C0,C2,.35);
      vec3 c=mix(metal,metal*tint*1.6,.35)+pow(l,30.)*.5;
      gl_FragColor=vec4(c,1.);`],
  };
  Object.entries(G).forEach(([id, v]) => { SH[id] = v; BG['gl_' + id] = { n: v[0], c: v[1], full: true, gpu: id, f: () => {} }; });

  /* ================= Canvas backgrounds / overlays ================= */
  const def = (id, n, c, f, full) => (BG[id] = { n, c, f, full: !!full });
  def('lightLeaks', 'ライトリーク（光漏れ）', '光', (ctx, R) => {
    ctx.globalCompositeOperation = 'lighter';
    const cols = ['#ff7a18', '#ff2d55', '#ffd166', R.pal.accent];
    for (let i = 0; i < 4; i++) {
      const fl = 0.55 + 0.45 * Math.sin(R.t * (0.9 + i * 0.37) + i * 2) * Math.sin(R.t * 2.3 + i), x = R.W * (i % 2 ? 1.05 : -0.05) + Math.sin(R.t * 0.3 + i) * R.W * 0.2, y = R.H * (0.2 + i * 0.22) + Math.cos(R.t * 0.25 + i) * R.H * 0.2, r = R.minD * (0.5 + 0.25 * hash(i, 3));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(cols[i], 0.55 * fl * R.amt)); g.addColorStop(1, rgba(cols[i], 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H);
    }
  });
  def('anamorphic', 'アナモルフィック・レンズフレア', '光', (ctx, R) => {
    ctx.globalCompositeOperation = 'lighter';
    const x = R.W * (0.5 + 0.45 * Math.sin(R.t * 0.35)), y = R.H * (0.42 + 0.1 * Math.sin(R.t * 0.21)), col = '#5aa9ff', a = (0.55 + R.beat * 0.35) * R.amt;
    const g = ctx.createLinearGradient(0, y, R.W, y); g.addColorStop(0, rgba(col, 0)); g.addColorStop(clamp(x / R.W), rgba('#dff0ff', a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(0, y - R.S * 2, R.W, R.S * 4); ctx.globalAlpha = 0.5; ctx.fillRect(0, y - R.S * 9, R.W, R.S * 18);
    ctx.globalAlpha = 1; const rg = ctx.createRadialGradient(x, y, 0, x, y, R.minD * 0.18); rg.addColorStop(0, rgba('#ffffff', a)); rg.addColorStop(0.2, rgba(col, a * 0.5)); rg.addColorStop(1, rgba(col, 0)); ctx.fillStyle = rg; ctx.fillRect(0, 0, R.W, R.H);
    for (let i = 1; i <= 4; i++) { const gx = R.W / 2 + (R.W / 2 - x) * (0.4 + i * 0.35), gy = R.H / 2 + (R.H / 2 - y) * (0.4 + i * 0.35), r = R.minD * (0.02 + i * 0.018); ctx.globalAlpha = 0.18; ctx.fillStyle = i % 2 ? col : '#b37cff'; ctx.beginPath(); ctx.arc(gx, gy, r, 0, TAU); ctx.fill(); }
  });
  def('prismShards', 'プリズムの破片（屈折オーバーレイ）', '光', (ctx, R) => {
    ctx.globalCompositeOperation = 'lighter';
    const chs = ['#ff3366', '#33ff88', '#3366ff'];
    for (let i = 0; i < 9; i++) {
      const x = R.W * wrap(hash(i, 1) + R.t * 0.02 * (hash(i, 2) + 0.3), 1.2) - R.W * 0.1, y = R.H * (0.1 + hash(i, 3) * 0.8), s = R.minD * (0.06 + hash(i, 4) * 0.12), rot = R.t * 0.2 * (hash(i, 5) - 0.5) + i;
      chs.forEach((c, k) => { ctx.save(); ctx.translate(x + (k - 1) * s * 0.08, y); ctx.rotate(rot); ctx.globalAlpha = 0.28 * R.amt; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.87, s * 0.5); ctx.lineTo(-s * 0.87, s * 0.5); ctx.closePath(); ctx.fill(); ctx.restore(); });
    }
  });
  def('filmGate', '8mmフィルム（揺れ・傷・ちらつき）', '質感', (ctx, R) => {
    const step = Math.floor(R.t * 18), jx = (hash(step, 1) - 0.5) * R.S * 3, jy = (hash(step, 2) - 0.5) * R.S * 4;
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.08 + 0.06 * hash(step, 3); ctx.fillRect(0, 0, R.W, R.H);
    ctx.globalAlpha = 0.9; const m = R.minD * 0.035; ctx.lineWidth = m; ctx.strokeStyle = '#0b0906'; ctx.strokeRect(jx - m * 0.2, jy - m * 0.2, R.W + m * 0.4, R.H + m * 0.4);
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#f6efe0';
    for (let i = 0; i < 3; i++) if (hash(step, i + 9) > 0.55) { const x = hash(step, i + 20) * R.W; ctx.fillRect(x, 0, R.S * (0.6 + hash(i, step) * 1.4), R.H); }
    for (let i = 0; i < 14; i++) { const x = hash(step, i + 40) * R.W, y = hash(step, i + 60) * R.H, r = R.S * (1 + hash(step, i) * 3.5); ctx.globalAlpha = 0.35; ctx.fillStyle = i % 3 ? '#1a140c' : '#f6efe0'; ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.4 + hash(i, 2)), hash(i, 3) * 3, 0, TAU); ctx.fill(); }
    const g = ctx.createRadialGradient(R.W / 2, R.H / 2, R.minD * 0.3, R.W / 2, R.H / 2, Math.hypot(R.W, R.H) * 0.6); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,12,0,0.55)'); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H);
  });
  def('lightTrails', '光の軌跡（スローシャッター）', '光', (ctx, R) => {
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const col = [R.pal.accent, R.pal.sub, '#ffd166', '#ff4d6d'][i % 4], y0 = R.H * (0.15 + hash(i, 1) * 0.7), amp = R.H * (0.05 + hash(i, 2) * 0.15), k = 2 + hash(i, 3) * 3, ph = R.t * (0.4 + hash(i, 4) * 0.5) + i;
      for (const [lw, a] of [[R.S * 14, 0.08], [R.S * 5, 0.25], [R.S * 1.6, 0.9]]) {
        ctx.strokeStyle = col; ctx.globalAlpha = a * R.amt; ctx.lineWidth = lw; ctx.beginPath();
        const head = wrap(R.t * 0.18 * (0.6 + hash(i, 5)), 1.6) - 0.3;
        for (let s = 0; s <= 40; s++) { const u = head - 0.6 + (s / 40) * 0.6, x = u * R.W, y = y0 + Math.sin(u * k * PI + ph) * amp; s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      }
    }
  });
  // Swiss grit collage: xeroxed paper scraps, primary bars, grid crosses — reshuffles every half beat
  function paperScrap(ctx, x, y, w, h, k, R, ink) {
    ctx.save(); ctx.translate(x, y); ctx.rotate((hash(k, 7) - 0.5) * 0.08);
    ctx.fillStyle = mix('#eeeae2', R.pal.bg, 0.15); ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip(); ctx.fillStyle = ink; ctx.globalAlpha = 0.85;
    const kind = k % 4, s = R.minD * 0.012;
    if (kind === 0) for (let yy = -h / 2; yy < h / 2; yy += s * 1.6) for (let xx = -w / 2; xx < w / 2; xx += s * 1.6) { ctx.beginPath(); ctx.arc(xx, yy, s * 0.5 * (0.3 + 0.7 * hash(xx | 0, yy | 0)), 0, TAU); ctx.fill(); }
    else if (kind === 1) for (let yy = -h / 2; yy < h / 2; yy += s * 1.3) ctx.fillRect(-w / 2, yy, w * (0.3 + 0.7 * hash(k, yy | 0)), s * 0.35);
    else if (kind === 2) { ctx.font = `900 ${(h * 0.9).toFixed(0)}px "Anton","Archivo Black",sans-serif`; ctx.textBaseline = 'middle'; ctx.fillText(String.fromCharCode(65 + (k * 7) % 26) + String.fromCharCode(65 + (k * 11) % 26), -w / 2, 0); }
    else for (let i = 0; i < 40; i++) ctx.fillRect(-w / 2 + hash(k, i) * w, -h / 2 + hash(i, k) * h, s * 0.4, s * (0.4 + hash(i, 3) * 3));
    ctx.restore();
  }
  def('swissGrit', 'スイス・グリット（コラージュ）', '模様', (ctx, R) => {
    const bpm = R.bpm || 120, step = Math.floor(R.t * bpm / 30);
    ctx.fillStyle = mix('#e4e0d8', R.pal.bg, 0.25); ctx.fillRect(0, 0, R.W, R.H);
    ctx.strokeStyle = rgba(R.pal.text, 0.35); ctx.lineWidth = R.S * 1.2; const gs = R.minD / 8;
    for (let x = gs / 2; x < R.W; x += gs) for (let y = gs / 2; y < R.H; y += gs) { ctx.beginPath(); ctx.moveTo(x - R.S * 4, y); ctx.lineTo(x + R.S * 4, y); ctx.moveTo(x, y - R.S * 4); ctx.lineTo(x, y + R.S * 4); ctx.stroke(); }
    for (let i = 0; i < 9; i++) { const k = step * 13 + i; const w = R.minD * (0.15 + hash(k, 1) * 0.35), h = R.minD * (0.08 + hash(k, 2) * 0.3); paperScrap(ctx, hash(k, 3) * R.W, hash(k, 4) * R.H, w, h, k, R, '#1b1b1b'); }
    const bars = [R.pal.accent, '#2940d3', '#f2b233'];
    for (let i = 0; i < 3; i++) { const k = step * 5 + i; ctx.globalAlpha = 0.95; ctx.fillStyle = bars[i]; ctx.fillRect(hash(k, 1) * R.W * 0.8, hash(k, 2) * R.H, R.minD * (0.1 + hash(k, 3) * 0.5), R.minD * (0.03 + hash(k, 4) * 0.08)); }
  }, true);

  /* ================= Transitions ================= */
  const cover = (id, n, f) => (TR[id] = { n, c: 'カバー', kind: 'cover', f });
  const cam = (id, n, f) => (TR[id] = { n, c: 'カメラ', kind: 'cam', f });

  cover('liquidDrip', 'リキッド・ドリップ（液体が垂れる）', (ctx, u, R) => {
    const a = E.inOutCubic(clamp(u * 2)), b = E.inOutCubic(clamp((u - 0.5) * 2)), n = 18, w = R.W / n;
    ctx.fillStyle = R.pal.accent; ctx.beginPath();
    // leading edge with drips going down; trailing edge (drain) from top
    const top = b * R.H * 1.35 - R.H * 0.15;
    ctx.moveTo(0, top);
    for (let i = 0; i <= n; i++) {
      const x = i * w, d = a * R.H * (0.9 + 0.5 * hash(i, 3)) + (hash(i, 5) - 0.5) * R.H * 0.1 * a;
      const cx = x - w / 2, y = Math.max(top, d);
      if (i === 0) ctx.lineTo(0, y); else ctx.quadraticCurveTo(cx - w * 0.4, y + w * 0.5, cx, y + w * 0.35), ctx.quadraticCurveTo(cx + w * 0.4, y + w * 0.5, x, Math.max(top, a * R.H * (0.9 + 0.5 * hash(i + 1, 3))));
    }
    ctx.lineTo(R.W, top); ctx.closePath(); if (a > b) ctx.fill();
    ctx.fillStyle = R.pal.sub; ctx.globalAlpha = 0.9;
    for (let i = 0; i < 10; i++) { const x = hash(i, 7) * R.W, y = (a - b) * R.H * (0.6 + hash(i, 8) * 0.7), r = R.minD * 0.012 * (1 + hash(i, 9) * 2) * (a - b); if (r > 0.5) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.6, 0, 0, TAU); ctx.fill(); } }
  });
  cover('splashFill', 'スプラッシュ（飛沫が広がって満ちる）', (ctx, u, R) => {
    const k = inOut(u), n = 34, D = Math.hypot(R.W, R.H);
    mask(ctx, R, (x, y, a) => {
      let s = 0; for (let i = 0; i < n; i++) { const cx = hash(i, 1) * a, cy = hash(i, 2), r = (0.02 + hash(i, 3) * 0.12) * (0.2 + k * 3.2) * clamp(k * 3 - hash(i, 4) * 1.6 + 0.4); if (r <= 0) continue; const dx = x * a - cx, dy = y - cy; s += (r * r) / (dx * dx + dy * dy + 1e-4); }
      return edge(s, 1, 0.25);
    }, u < 0.5 ? R.pal.accent : R.pal.accent, 150);
  });
  cover('colorBurst', 'カラーバースト（花・星・しぶきが弾ける）', (ctx, u, R) => {
    const cols = [R.pal.accent, R.pal.sub, mix(R.pal.accent, '#ffffff', 0.35), mix(R.pal.sub, R.pal.text, 0.3), '#ffd23f', '#ff5fa2', '#23c4ff', '#2ed47a'];
    const n = 70, D = Math.hypot(R.W, R.H);
    for (let i = 0; i < n; i++) {
      const d = hash(i, 1) * 0.22, a = E.outBack(clamp((u - d) * 3.2)), b = E.inCubic(clamp((u - 0.5 - d * 0.8) * 3));
      const s = a * (1 - b); if (s <= 0.01) continue;
      const ang = hash(i, 2) * TAU, dist = D * 0.5 * hash(i, 3) * (0.3 + a * 0.9), x = R.W / 2 + Math.cos(ang) * dist, y = R.H / 2 + Math.sin(ang) * dist, r = R.minD * (0.16 + hash(i, 4) * 0.3) * s;
      ctx.save(); ctx.translate(x, y); ctx.rotate(hash(i, 5) * TAU + u * 3 * (hash(i, 6) - 0.5)); ctx.fillStyle = cols[i % cols.length]; ctx.beginPath();
      const kind = i % 3, pts = kind === 0 ? 6 : kind === 1 ? 5 : 9;
      for (let k = 0; k <= pts * 16; k++) { const t = (k / (pts * 16)) * TAU, rr = kind === 0 ? r * (0.75 + 0.25 * Math.cos(t * pts)) : kind === 1 ? r * (0.45 + 0.55 * Math.pow(Math.abs(Math.cos(t * pts / 2)), 6)) : r * (0.7 + 0.3 * Math.sin(t * pts) * hash(i, k % 7)); k ? ctx.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : ctx.moveTo(Math.cos(t) * rr, Math.sin(t) * rr); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  });
  cover('hexFlip', 'ヘキサゴン・フリップ（金属タイル）', (ctx, u, R) => {
    const s = R.minD / 9, hw = s * 0.866;
    for (let row = -1, j = 0; row * s * 1.5 < R.H + s; row++, j++) for (let col = -1; col * hw * 2 < R.W + s; col++) {
      const x = col * hw * 2 + (row % 2 ? hw : 0), y = row * s * 1.5, d = (x / R.W) * 0.35 + hash(col, row) * 0.1;
      const a = clamp((u - d * 0.9) * 3.4), b = clamp((u - 0.5 - d * 0.9) * 3.4), p = a - b; if (p <= 0) continue;
      if (p < 0.02) continue;
      ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.02, E.outCubic(Math.min(1, p * 2))), 1);
      const g = ctx.createLinearGradient(-hw, -s, hw, s); g.addColorStop(0, mix(R.pal.accent, '#ffffff', 0.55)); g.addColorStop(0.5, R.pal.accent); g.addColorStop(1, mix(R.pal.accent, '#000000', 0.45));
      ctx.fillStyle = g; ctx.beginPath(); for (let k = 0; k < 6; k++) { const t = PI / 6 + (k * PI) / 3; ctx.lineTo(Math.cos(t) * s * 0.96, Math.sin(t) * s * 0.96); } ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  });
  cover('tileScatter', '菱形タイル散開（ランダムに埋まる）', (ctx, u, R) => {
    const s = R.minD / 7, D = Math.hypot(R.W, R.H);
    ctx.save(); ctx.translate(R.W / 2, R.H / 2); ctx.rotate(PI / 4);
    let k = 0;
    for (let y = -D / 2; y < D / 2; y += s) for (let x = -D / 2; x < D / 2; x += s, k++) {
      const r = hash(k, 3), a = clamp((u - r * 0.3) * 5), b = clamp((u - 0.5 - hash(k, 7) * 0.3) * 5), p = Math.min(a, 1 - b); if (p <= 0) continue;
      const sz = s * p; ctx.fillStyle = (k + Math.floor(y / s)) % 3 ? R.pal.text : R.pal.accent; ctx.fillRect(x + (s - sz) / 2, y + (s - sz) / 2, sz + 0.5, sz + 0.5);
    }
    ctx.restore();
  });
  cover('inkBlob', 'インク・ブロブ（有機的に満ちる）', (ctx, u, R) => {
    const k = inOut(u), dir = u < 0.5 ? 1 : -1;
    mask(ctx, R, (x, y, a) => { const n = fbm(x * a * 2.4 + u * 1.5, y * 2.4 - u); const g = u < 0.5 ? (x * a / a * 0.6 + y * 0.4) : (1 - (x * 0.6 + y * 0.4)); return edge(k * 1.7 - g - (n - 0.5) * 0.9, 0, 0.03); }, R.pal.text, 170);
  });
  cover('scribbleFill', '手描きスクリブル（マーカーで塗りつぶす）', (ctx, u, R) => {
    const a = clamp(u * 2.1), b = clamp((u - 0.5) * 2.1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = R.minD * 0.16; ctx.strokeStyle = R.pal.accent;
    const loops = 11, pts = [];
    for (let i = 0; i <= 220; i++) { const t = i / 220, x = -0.1 + t * 1.2 + Math.cos(t * loops * TAU) * 0.07, y = 0.5 + Math.sin(t * loops * TAU) * 0.55 * (0.6 + 0.4 * Math.sin(t * 7)); pts.push([x * R.W, y * R.H]); }
    const i0 = Math.floor(b * pts.length), i1 = Math.floor(a * pts.length);
    if (i1 - i0 < 2) return;
    ctx.beginPath(); for (let i = i0; i < i1; i++) i === i0 ? ctx.moveTo(pts[i][0], pts[i][1]) : ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    ctx.lineWidth = R.minD * 0.05; ctx.strokeStyle = R.pal.sub; ctx.beginPath(); for (let i = i0; i < i1; i += 2) { const p = pts[i]; i === i0 ? ctx.moveTo(p[0], p[1] + R.minD * 0.05) : ctx.lineTo(p[0], p[1] + R.minD * 0.05); } ctx.stroke();
  });
  cover('dryBrush', 'ドライブラシ（荒い筆が横切る）', (ctx, u, R) => {
    const cols = [R.pal.accent, R.pal.sub, R.pal.text];
    for (let s = 0; s < 3; s++) {
      const d = s * 0.08, a = E.inOutCubic(clamp((u - d) * 2.3)), b = E.inOutCubic(clamp((u - 0.5 - d * 0.6) * 2.3)); if (a <= b) continue;
      const y = R.H * (0.18 + s * 0.32), h = R.H * 0.46, x0 = lerp(-0.2, 1.2, b) * R.W, x1 = lerp(-0.2, 1.2, a) * R.W;
      ctx.save(); ctx.translate(0, y); ctx.rotate(-0.08 + s * 0.05); ctx.fillStyle = cols[s];
      ctx.beginPath(); ctx.moveTo(x0, -h / 2);
      for (let x = x0; x <= x1; x += R.W / 60) ctx.lineTo(x, -h / 2 + (hash(Math.floor(x), s) - 0.5) * h * 0.08);
      ctx.lineTo(x1 + h * 0.15, 0);
      for (let x = x1; x >= x0; x -= R.W / 60) ctx.lineTo(x, h / 2 + (hash(Math.floor(x), s + 5) - 0.5) * h * 0.08);
      ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
      for (let i = 0; i < 26; i++) { const yy = (hash(i, s) - 0.5) * h, len = (x1 - x0) * (0.2 + hash(i, s + 2) * 0.5); ctx.fillRect(x1 - len * 0.2 - hash(i, 9) * 30, yy, len * 0.3, R.S * (1 + hash(i, 4) * 2.5)); }
      ctx.restore();
    }
  });
  cover('collageSlam', 'コラージュ・スラム（紙片が積み重なる）', (ctx, u, R) => {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const d = i / n * 0.38, a = clamp((u - d) * 6), b = clamp((u - 0.5 - (n - i) / n * 0.3) * 6); if (a <= 0 || b >= 1) continue;
      const q = E.outExpo(a), w = R.W * (0.35 + hash(i, 1) * 0.5), h = R.H * (0.25 + hash(i, 2) * 0.5);
      const x = hash(i, 3) * R.W, y = hash(i, 4) * R.H, fromX = (hash(i, 5) > 0.5 ? 1 : -1) * R.W * 0.8 * (1 - q), outX = (hash(i, 6) > 0.5 ? 1 : -1) * R.W * E.inExpo(b);
      if (i % 4 === 3) { ctx.fillStyle = [R.pal.accent, '#2940d3', '#f2b233'][i % 3]; ctx.fillRect(x - w / 2 + fromX + outX, y - h * 0.1, w, h * 0.2); }
      else paperScrap(ctx, x + fromX + outX, y, w, h, i * 17 + 3, R, '#161616');
    }
  });
  cover('ribbonSweep', 'グラデーション・リボン（チューブが埋め尽くす）', (ctx, u, R) => {
    const a = clamp(u * 2.2), b = clamp((u - 0.5) * 2.2), s = R.minD / 4, lw = s * 0.9;
    const cols = [R.pal.accent, R.pal.sub, mix(R.pal.accent, '#ffffff', 0.4), '#ff5fa2', '#23c4ff'];
    let k = 0; ctx.lineCap = 'butt';
    for (let y = 0; y < R.H + s; y += s) for (let x = 0; x < R.W + s; x += s, k++) {
      const d = (x / R.W) * 0.5 + hash(k, 2) * 0.2, p = clamp((a - d) * 3) - clamp((b - d) * 3); if (p <= 0) continue;
      const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s); g.addColorStop(0, cols[k % 5]); g.addColorStop(1, cols[(k + 2) % 5]);
      ctx.strokeStyle = g; ctx.lineWidth = lw;
      const flip = hash(k, 5) > 0.5, c0 = flip ? [x, y] : [x + s, y], c1 = flip ? [x + s, y + s] : [x, y + s], st0 = flip ? 0 : PI / 2, st1 = flip ? PI : -PI / 2;
      ctx.beginPath(); ctx.arc(c0[0], c0[1], s / 2, st0, st0 + (PI / 2) * p); ctx.stroke();
      ctx.beginPath(); ctx.arc(c1[0], c1[1], s / 2, st1, st1 + (PI / 2) * p); ctx.stroke();
    }
  });
  cover('gradientDiscs', 'グラデーション円（ポップに重なる）', (ctx, u, R) => {
    const D = Math.hypot(R.W, R.H);
    for (let i = 0; i < 7; i++) {
      const d = i * 0.035, a = E.outCubic(clamp((u - d) * 2.4)), b = E.inCubic(clamp((u - 0.5 - d * 0.5) * 2.4)); if (a <= 0 || b >= 1) continue;
      const cx = R.W * hash(i, 1), cy = R.H * hash(i, 2), r = D * 0.45 * a * (1 - b);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); const c1 = i % 2 ? R.pal.accent : R.pal.sub, c2 = i % 2 ? R.pal.sub : mix(R.pal.accent, '#ffffff', 0.4);
      for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, k % 2 ? c1 : c2);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    }
  });
  cover('leakBurn', 'ライトリーク・バーン（光で焼けて切替）', (ctx, u, R) => {
    const k = inOut(u);
    ctx.globalCompositeOperation = 'lighter';
    const cols = ['#ff6a00', '#ff2d55', '#ffd166'];
    cols.forEach((c, i) => { const x = R.W * (0.2 + i * 0.3 + (u - 0.5) * 0.5), y = R.H * (0.3 + 0.4 * hash(i, 2)), r = R.minD * (0.4 + k * 1.2); const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(c, 0.9 * k)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H); });
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = rgba('#fff6e8', clamp((k - 0.7) / 0.3) * 0.95); ctx.fillRect(0, 0, R.W, R.H);
  });
  cover('doorsH', 'ドア（左右から閉じて開く）', (ctx, u, R) => {
    const a = E.inOutCubic(clamp(u * 2)), b = E.inOutCubic(clamp((u - 0.5) * 2)), w = (R.W / 2) * (a - b);
    if (w <= 0) return;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = R.minD * 0.04;
    ctx.fillStyle = R.pal.accent; ctx.fillRect(0, 0, w, R.H); ctx.fillStyle = mix(R.pal.accent, '#000000', 0.12); ctx.fillRect(R.W - w, 0, w, R.H); ctx.restore();
    ctx.fillStyle = R.pal.text; ctx.globalAlpha = 0.7; ctx.fillRect(w - R.S * 3, 0, R.S * 3, R.H); ctx.fillRect(R.W - w, 0, R.S * 3, R.H);
  });
  cover('prismFlash', 'プリズム・フラッシュ（屈折光で切替）', (ctx, u, R) => {
    const k = inOut(u), chs = ['#ff3366', '#33ff88', '#3366ff'];
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const x = R.W * hash(i, 1), y = R.H * hash(i, 2), s = R.minD * (0.15 + hash(i, 3) * 0.4) * (0.3 + k * 1.2), rot = hash(i, 4) * TAU + u * 2;
      chs.forEach((c, j) => { ctx.save(); ctx.translate(x + (j - 1) * s * 0.1 * k, y); ctx.rotate(rot); ctx.globalAlpha = 0.35 * k; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.87, s * 0.5); ctx.lineTo(-s * 0.87, s * 0.5); ctx.closePath(); ctx.fill(); ctx.restore(); });
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = rgba('#ffffff', clamp((k - 0.8) / 0.2) * 0.8); ctx.fillRect(0, 0, R.W, R.H);
  });
  cam('filmRoll', 'フィルム送り（コマが縦に流れる）', (u) => { const k = inOut(u); return { ty: (u < 0.5 ? -1 : 1) * k * 0.5, blur: k * 0.5, flash: k > 0.9 ? 0.25 : 0 }; });
  cam('zoomTwist', 'ズーム・ツイスト（回転しながら突き抜け）', (u) => { const k = inOut(u); return { sc: 1 + k * 2.2, rot: (u < 0.5 ? 1 : -1) * k * 0.9, zblur: k * 2, flash: k > 0.92 ? 0.3 : 0 }; });

  /* ================= wire into themes ================= */
  const add = (id, k, o) => { const t = LM.data.themeById[id]; if (t) t[k] = Object.assign({}, t[k] || {}, o); };
  add('jpop', 'tr', { colorBurst: 2, gradientDiscs: 1.5, ribbonSweep: 1.5, splashFill: 1 }); add('jpop', 'bgm', { gl_tubes: 1, lightLeaks: 1, gl_lensDiscs: 1 });
  add('showreel', 'tr', { hexFlip: 1.5, tileScatter: 2, collageSlam: 2, ribbonSweep: 1.5, doorsH: 1.5 }); add('showreel', 'bgm', { gl_tileFlip: 2, swissGrit: 1.5, gl_stripeZoom: 1.5, gl_inkMarble: 1 });
  add('artistmv', 'tr', { inkBlob: 2, leakBurn: 2, filmRoll: 1 }); add('artistmv', 'bgm', { gl_inkMarble: 2, lightLeaks: 1.5, filmGate: 1.5, anamorphic: 1, gl_liquidMarble: 1.5 });
  add('cinematic', 'tr', { leakBurn: 2, filmRoll: 1.5, doorsH: 1 }); add('cinematic', 'bgm', { anamorphic: 2, lightLeaks: 1.5, filmGate: 2 });
  add('ballad', 'tr', { leakBurn: 1.5, inkBlob: 1 }); add('ballad', 'bgm', { lightLeaks: 1.5, anamorphic: 1 });
  add('lofi', 'tr', { scribbleFill: 1.5, dryBrush: 1.5 }); add('lofi', 'bgm', { filmGate: 2, lightLeaks: 1 });
  add('hiphop', 'tr', { dryBrush: 2, scribbleFill: 1.5, collageSlam: 1.5, colorBurst: 1 }); add('hiphop', 'bgm', { swissGrit: 1.5, gl_stripeZoom: 1 });
  add('edge', 'tr', { collageSlam: 2.5, dryBrush: 2, scribbleFill: 2, inkBlob: 1.5 }); add('edge', 'bgm', { swissGrit: 2.5, gl_inkMarble: 1.5, filmGate: 1 });
  add('psyche', 'tr', { colorBurst: 2.5, ribbonSweep: 2.5, gradientDiscs: 2, splashFill: 1.5, liquidDrip: 1.5 }); add('psyche', 'bgm', { gl_tubes: 2.5, gl_lensDiscs: 2, gl_liquidMarble: 1 });
  add('thermalvj', 'tr', { prismFlash: 2, hexFlip: 1.5, zoomTwist: 1.5 }); add('thermalvj', 'bgm', { gl_prism: 2, prismShards: 1.5, lightTrails: 1 });
  add('vj', 'tr', { prismFlash: 2, zoomTwist: 2, hexFlip: 1.5 }); add('vj', 'bgm', { gl_prism: 2, lightTrails: 1.5, anamorphic: 1.5, gl_stripeZoom: 1.5 });
  add('edm', 'tr', { zoomTwist: 2, prismFlash: 1.5 }); add('edm', 'bgm', { gl_prism: 1.5, lightTrails: 1.5, anamorphic: 1 });
  add('citypop', 'tr', { doorsH: 1.5, gradientDiscs: 1.5, ribbonSweep: 1 }); add('citypop', 'bgm', { lightTrails: 2, gl_lensDiscs: 1 });
  add('vocaloid', 'tr', { hexFlip: 2, tileScatter: 2 }); add('vocaloid', 'bgm', { gl_tileFlip: 1.5, prismShards: 1 });
  add('anison', 'tr', { colorBurst: 2, zoomTwist: 1.5, splashFill: 1 }); add('anison', 'bgm', { lightTrails: 1.5, gl_prism: 1 });
  add('dream', 'tr', { inkBlob: 1.5, splashFill: 1.5, prismFlash: 1 }); add('dream', 'bgm', { prismShards: 2, lightLeaks: 2, gl_liquidMarble: 1 });
  add('minimal', 'tr', { tileScatter: 1.5, doorsH: 1.5, inkBlob: 1 }); add('minimal', 'bgm', { gl_tileFlip: 1, gl_stripeZoom: 1 });
  add('wa', 'tr', { inkBlob: 2, dryBrush: 1.5 }); add('wa', 'bgm', { gl_inkMarble: 2 });
})();
