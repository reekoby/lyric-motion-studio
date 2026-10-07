/* R&B / soul and House genre packs, plus a physically-styled rain-on-glass renderer.
 * Rain on glass: every drop is a tiny lens that shows the scene behind it inverted and minified, with a dark rim,
 * a bright caustic at the bottom and a specular highlight. Large drops stick and slip down the pane leaving a
 * wiped (sharp) trail and a line of residual beads, while the rest of the window is fogged (out of focus).
 * Everything is a pure function of time so scrubbing and export are deterministic. */
'use strict';
(() => {
  const { clamp, lerp, hash, mix, rgba, noise1 } = LM.U;
  const E = LM.E, M = LM.motion, BG = LM.bgm.lib, FX = LM.fx, G = LM.gfx.lib, TR = LM.trans.lib, D = LM.data;
  const PI = Math.PI, TAU = PI * 2;
  const A = (p, k = 3) => Math.min(1, Math.max(0, p) * k);
  const wrap = (v, m) => ((v % m) + m) % m;
  const gsc = M.gsc;

  /* ================= rain on glass ================= */
  LM.rainGlass = (() => {
    let snap = null, f1 = null, f2 = null, wipe = null, tmp = null;
    const cv = (c, w, h) => { if (!c) c = document.createElement('canvas'); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c; };
    // one drop: a lens over the snapshot + rim / caustic / highlight
    function drop(ctx, x, y, rx, ry, M0, S, refr) {
      if (rx < S * 1.1) { ctx.globalAlpha = 0.35; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - rx * 0.3, y, rx, rx); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x - rx * 0.6, y - rx * 0.6, rx * 0.8, rx * 0.8); ctx.globalAlpha = 1; return; }
      ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.clip();
      if (refr && snap) {
        const dx = M0.a * x + M0.e, dy = M0.d * y + M0.f, K = 4.2, sw = rx * K * M0.a, sh = ry * K * M0.d;
        const sx = clamp(dx - sw, 0, snap.width - 2), sy = clamp(dy - sh, 0, snap.height - 2), ew = Math.min(sw * 2, snap.width - sx), eh = Math.min(sh * 2, snap.height - sy);
        ctx.save(); ctx.translate(x, y); ctx.scale(-1, -1);
        try { ctx.drawImage(snap, sx, sy, ew, eh, -rx, -ry, rx * 2, ry * 2); } catch (e) {}
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
      }
      // dark refracted rim (total internal reflection near the edge)
      let g = ctx.createRadialGradient(x, y - ry * 0.12, Math.min(rx, ry) * 0.45, x, y, Math.max(rx, ry) * 1.02);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g; ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
      // caustic: light gathered at the lower edge
      g = ctx.createRadialGradient(x, y + ry * 0.55, 0, x, y + ry * 0.55, rx * 0.75);
      g.addColorStop(0, 'rgba(255,255,255,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
      ctx.restore();
      // contact shadow on the glass and specular highlight
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = Math.max(0.6, rx * 0.12); ctx.beginPath(); ctx.ellipse(x + rx * 0.06, y + ry * 0.08, rx, ry, 0, 0.15 * PI, 0.85 * PI); ctx.stroke();
      const hx = x - rx * 0.34, hy = y - ry * 0.4, hr = Math.max(0.8, rx * 0.26);
      g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(hx, hy, hr, hr * 0.7, -0.6, 0, TAU); ctx.fill();
    }
    // o: { fog 0..1, density, refract }
    function paint(ctx, R, o) {
      o = o || {};
      const W = R.W, H = R.H, S = R.S || Math.min(W, H) / 1080, t = R.t, amt = R.amt == null ? 1 : R.amt;
      const fog = (o.fog == null ? 0.6 : o.fog) * Math.min(1, amt), dens = (o.density || 1) * Math.min(1.6, Math.max(0.3, amt));
      const src = ctx.canvas, M0 = ctx.getTransform ? ctx.getTransform() : { a: 1, d: 1, e: 0, f: 0 };
      const dw = src.width, dh = src.height, refr = o.refract !== false && dw > 0 && dh > 0;
      const asp = Math.max(W, H) / Math.min(W, H);
      if (refr) {
        snap = cv(snap, dw, dh); const sc = snap.getContext('2d'); sc.setTransform(1, 0, 0, 1, 0, 0); sc.globalCompositeOperation = 'copy'; sc.globalAlpha = 1; sc.drawImage(src, 0, 0); sc.globalCompositeOperation = 'source-over';
      }
      // sliding drops (computed first: their trails wipe the fog)
      const slides = [], beads = [];
      const nS = Math.round(12 * dens * Math.sqrt(asp));
      for (let j = 0; j < nS; j++) {
        const per = 8 + hash(j, 1, 71) * 9, ph = t / per + hash(j, 2, 71), cyc = Math.floor(ph), tau = ph - cyc;
        const x0 = hash(j, cyc, 73) * W, y0 = -H * 0.05 + hash(j, cyc, 74) * H * 0.5, r = S * (13 + hash(j, cyc, 75) * 12);
        const ds = 0.12 + hash(j, cyc, 76) * 0.25, u = clamp((tau - ds) / (1 - ds)), k = 2 + Math.floor(hash(j, cyc, 77) * 4);
        const dist = H * 1.15 - y0 + r * 6, g = u - Math.sin(TAU * k * u) / (TAU * k) * 0.85;
        const y = y0 + dist * g, X = (yy) => x0 + noise1(yy / (S * 110), j * 7 + cyc) * S * 26;
        const fade = tau > 0.92 ? 1 - (tau - 0.92) / 0.08 : 1, rr = r * (1 - u * 0.3) * Math.min(1, tau * 12 + 0.3);
        slides.push({ j, cyc, x0, y0, y, X, rr, u, fade });
        if (u > 0) {
          const step = S * 24;
          for (let n = 0, yy = y0 + step * 0.6; yy < y - rr * 2.2; n++, yy += step * (0.7 + hash(j, cyc, n, 78) * 0.7)) {
            if (hash(j, cyc, n, 79) < 0.35) continue;
            const age = (y - yy) / Math.max(1, dist);
            beads.push({ x: X(yy) + (hash(j, cyc, n, 80) - 0.5) * rr * 0.7, y: yy, r: rr * (0.14 + hash(j, cyc, n, 81) * 0.26) * Math.max(0, 1 - age * 0.6), a: fade });
          }
        }
      }
      // fogged window: the scene behind goes out of focus, trails wipe it clear again
      if (refr && fog > 0.01) {
        const w1 = Math.max(8, Math.round(dw / 6)), h1 = Math.max(8, Math.round(dh / 6)), w2 = Math.max(4, Math.round(dw / 22)), h2 = Math.max(4, Math.round(dh / 22));
        f1 = cv(f1, w1, h1); f2 = cv(f2, w2, h2);
        const c1 = f1.getContext('2d'), c2 = f2.getContext('2d'); c1.imageSmoothingQuality = c2.imageSmoothingQuality = 'high';
        c1.globalCompositeOperation = 'copy'; c1.drawImage(snap, 0, 0, w1, h1); c2.globalCompositeOperation = 'copy'; c2.drawImage(f1, 0, 0, w2, h2); c1.drawImage(f2, 0, 0, w1, h1);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingQuality = 'high';
        ctx.globalAlpha = fog; ctx.drawImage(f1, 0, 0, dw, dh);
        ctx.globalAlpha = fog * 0.5; ctx.fillStyle = 'rgba(205,215,230,0.08)'; ctx.fillRect(0, 0, dw, dh);
        ctx.restore();
        // wiped trails
        wipe = cv(wipe, dw, dh); tmp = cv(tmp, dw, dh);
        const wc = wipe.getContext('2d'); wc.setTransform(1, 0, 0, 1, 0, 0); wc.clearRect(0, 0, dw, dh); wc.setTransform(M0); wc.lineCap = 'round'; wc.strokeStyle = '#fff';
        let any = false;
        slides.forEach((s) => {
          if (s.u <= 0) return; any = true;
          const n = Math.max(2, Math.ceil((s.y - s.y0) / (S * 14)));
          let px = s.X(s.y0), py = s.y0;
          for (let i = 1; i <= n; i++) {
            const yy = s.y0 + ((s.y - s.y0) * i) / n, xx = s.X(yy), age = (s.y - yy) / H;
            wc.globalAlpha = s.fade * clamp(1 - age * 0.9) * 0.95; wc.lineWidth = s.rr * (1.15 - age * 0.4);
            wc.beginPath(); wc.moveTo(px, py); wc.lineTo(xx, yy); wc.stroke(); px = xx; py = yy;
          }
        });
        if (any) {
          const tc = tmp.getContext('2d'); tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = 'copy'; tc.drawImage(snap, 0, 0);
          tc.globalCompositeOperation = 'destination-in'; tc.drawImage(wipe, 0, 0); tc.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(tmp, 0, 0); ctx.restore();
        }
      }
      // static beads that land, sit and evaporate
      ctx.save();
      const nB = Math.round(170 * dens * Math.sqrt(asp));
      for (let i = 0; i < nB; i++) {
        const life = 6 + hash(i, 1, 61) * 10, ph = t / life + hash(i, 2, 61), cyc = Math.floor(ph), f = ph - cyc;
        const x = hash(i, cyc, 63) * W, y = hash(i, cyc, 64) * H, r0 = S * (2.2 + Math.pow(hash(i, cyc, 65), 2.2) * 15);
        const s = Math.min(1, f * 40) * (f > 0.9 ? (1 - f) / 0.1 : 1); if (s <= 0.02) continue;
        drop(ctx, x, y, r0 * s, r0 * s * (0.9 + hash(i, cyc, 66) * 0.15), M0, S, refr && r0 > S * 2.5);
      }
      beads.forEach((b) => { if (b.r > 0.5) { ctx.globalAlpha = b.a; drop(ctx, b.x, b.y, b.r, b.r * 0.95, M0, S, refr && b.r > S * 2.5); ctx.globalAlpha = 1; } });
      slides.forEach((s) => {
        ctx.globalAlpha = s.fade; const x = s.X(s.y), moving = s.u > 0 && s.u < 1;
        if (moving) drop(ctx, s.X(s.y - s.rr * 0.85), s.y - s.rr * 0.85, s.rr * 0.55, s.rr * 0.62, M0, S, refr);
        drop(ctx, x, s.y, s.rr * 0.95, s.rr * (moving ? 1.08 : 0.95), M0, S, refr);
        ctx.globalAlpha = 1;
      });
      ctx.restore();
    }
    return { paint };
  })();

  // screen effect: rain on the window over whatever is behind the lyrics (image, video, background motion)
  Object.assign(FX.list, {
    rainWindow: { n: '雨の窓ガラス（背景が透けて見える）', c: 'screen', k: 'under' },
    strobe: { n: 'ストロボ（裏拍で光る）', c: 'over', k: 'over' },
    goldDust: { n: '金の粒子がきらめく', c: 'over', k: 'over' },
  });
  FX.O.rainWindow = (ctx, R) => LM.rainGlass.paint(ctx, R, { fog: 0.55, density: 1 });
  FX.O.strobe = (ctx, R) => {
    const b = R.beat || 0; if (b < 0.55) return;
    const k = (b - 0.55) / 0.45; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k * k * 0.35 * Math.min(1, R.amt || 1);
    ctx.fillStyle = mix(R.pal.text, '#ffffff', 0.6); ctx.fillRect(0, 0, R.W, R.H);
  };
  FX.O.goldDust = (ctx, R) => {
    const n = Math.round(70 * (R.amt || 1)), gold = mix(R.pal.accent, '#ffcf6a', 0.6); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const z = 0.3 + hash(i, 1, 91) * 0.7, x = wrap(hash(i, 2, 91) * R.W + Math.sin(R.t * 0.2 + i) * R.S * 30, R.W), y = wrap(hash(i, 3, 91) * R.H - R.t * R.S * 14 * z, R.H);
      const tw = Math.pow(Math.max(0, Math.sin(R.t * (1.2 + z * 2) + i * 1.7)), 6), r = R.S * (1 + z * 2.4);
      ctx.globalAlpha = 0.15 + tw * 0.85 * z; ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      if (tw > 0.6) { ctx.globalAlpha = (tw - 0.6) * 1.5 * z; ctx.fillRect(x - r * 5, y - r * 0.15, r * 10, r * 0.3); ctx.fillRect(x - r * 0.15, y - r * 5, r * 0.3, r * 10); }
    }
  };

  /* ================= realistic rain / drops background motions (same ids, rebuilt) ================= */
  const def = (id, n, c, f, full) => (BG[id] = Object.assign(BG[id] || {}, { n, c, f, full: !!full }));
  def('waterDrops', 'ガラスの水滴', '水', (ctx, R) => LM.rainGlass.paint(ctx, R, { fog: 0.35, density: 0.9 }));
  def('rain', '雨', '天気', (ctx, R) => {
    // three depth layers of streaks: far (thin, faint, fast), mid, near (soft, wide); tail fades, head is brightest
    const wind = -0.14 + noise1(R.t * 0.1, 5) * 0.05, col = mix(R.pal.text, '#dfe8f2', 0.4);
    const layers = [[160, 0.35, 0.9, 0.2], [90, 0.65, 1.25, 0.3], [30, 1, 1.7, 0.24]];
    ctx.lineCap = 'round';
    layers.forEach(([n0, z, spd, al], L) => {
      const n = Math.round(n0 * R.amt);
      for (let i = 0; i < n; i++) {
        const len = R.S * (30 + z * 70) * (0.7 + hash(i, L, 3) * 0.6), y = wrap(hash(i, L, 2) + R.t * spd * (0.85 + hash(i, L, 4) * 0.3), 1) * (R.H + len * 2) - len;
        const x = wrap(hash(i, L, 5) * R.W * 1.3 - y * wind * -1, R.W * 1.3) - R.W * 0.15, x2 = x + wind * len, y2 = y + len;
        const g = ctx.createLinearGradient(x, y, x2, y2); g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, al * (0.6 + hash(i, L, 6) * 0.6)));
        ctx.strokeStyle = g; ctx.lineWidth = R.S * (0.6 + z * 1.8); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      }
    });
  });

  /* ================= rain glass shader (rebuilt) ================= */
  if (LM.shaderbg && LM.shaderbg.list && LM.shaderbg.list.rainGlass) LM.shaderbg.list.rainGlass[2] = `
      float AS=R.x/R.y; vec2 q=p; float tt=T;
      // --- drops: two layers of sliding drops with trails + two layers of static beads
      vec2 nrm=vec2(0.); float mask=0., wipe=0.;
      for(int L=0;L<2;L++){
        float fl=float(L); float N=mix(7.,13.,fl); float cw=1./N;
        float X=q.x+fl*.37; float col=floor(X*N); float lx=(fract(X*N)-.5)*cw;
        float h=h21(vec2(col,fl*3.1+1.)), h2=h21(vec2(col,fl*5.7+2.));
        float Y=fract(q.y+.5+h*7.);
        float sp=(.05+.07*h)*(1.-fl*.3); float u=fract(tt*sp+h2); float kk=3.+floor(h*4.);
        float gg=u-sin(TAU*kk*u)/(TAU*kk)*.85; float yd=1.08-gg*1.2;
        float xd=((h2-.5)*.5+.09*sin(yd*9.+h*30.))*cw;
        float r=cw*(.16+.08*h)*(1.-fl*.25);
        vec2 dv=vec2(lx-xd,(Y-yd)*.85); float dl=length(dv); float m=smoothstep(r,r*.75,dl);
        nrm+=dv/r*m; mask=max(mask,m);
        float xt=((h2-.5)*.5+.09*sin(Y*9.+h*30.))*cw; float above=step(yd,Y)*step(Y,1.06);
        float tr=smoothstep(r*.6,r*.15,abs(lx-xt))*above*exp(-(Y-yd)*2.2); wipe=max(wipe,tr);
        float by=fract(Y*28.+h*3.); vec2 bv=vec2(lx-xt-(h21(vec2(col,floor(Y*28.)))-.5)*r*.6,(by-.5)/28.); float br=r*.25*step(.45,h21(vec2(col,floor(Y*28.)+.5)));
        float bm=br>1e-4?smoothstep(br,br*.6,length(bv))*above*step(Y,yd+.9):0.; nrm+=bv/max(br,1e-4)*bm; mask=max(mask,bm);
      }
      for(int L=0;L<2;L++){
        float fl=float(L); float sc=mix(38.,22.,fl); vec2 g=q*sc+fl*13.1; vec2 id=floor(g); vec2 f=fract(g)-.5;
        vec2 n=h22(id+fl); vec2 c=(n-.5)*.65; float life=fract(tt*.07*(.4+n.x)+n.y);
        float r=(.1+.25*pow(h21(id+3.1+fl),2.))*smoothstep(0.,.03,life)*smoothstep(1.,.85,life)*step(mix(.72,.55,fl),h21(id+7.7));
        vec2 d=f-c; float m=r>1e-3?smoothstep(r,r*.75,length(d)):0.;
        nrm+=d/max(r,1e-3)*m*(1.-mask); mask=max(mask,m);
      }
      float clear=max(mask,wipe*.4);
      // --- scene behind the glass: out-of-focus city lights (focus pulled in through water)
      vec2 sq=q-nrm*.11; float bl=mix(1.,.18,clear);
      vec3 c=mix(C0*.45,mix(C0,C3,.45),smoothstep(-.7,.6,sq.y)); c+=(fbm(sq*1.6+tt*.01)-.5)*.07;
      for(int i=0;i<36;i++){
        float fi=float(i); vec2 hh=h22(vec2(fi,3.7)); vec2 cp=vec2((hh.x-.5)*1.15*AS,(hh.y-.6)*1.1+sin(tt*.05+fi)*.01);
        float rr=(.05+.11*h21(vec2(fi,9.1)))*mix(.22,1.,bl); float d=length(sq-cp); float tw=.8+.2*sin(tt*(.3+hh.x)+fi);
        vec3 lc=fi<12.?C2:(fi<24.?C3:mix(C1,vec3(1.,.82,.55),.6));
        float soft=mix(.06,.55,bl); float disc=1.-smoothstep(rr*(1.-soft),rr,d); float ring=bl*smoothstep(rr*.1,0.,abs(d-rr*.93))*.12;
        c+=lc*(disc*.42+ring)*tw*mix(1.6,.75,bl);
      }
      c+=mix(C2,C3,.5)*smoothstep(-.2,-.75,sq.y)*.12*bl;
      // --- drop shading
      float ln=length(nrm);
      c=mix(c,c*1.15+.02,mask*.6);
      c*=1.-smoothstep(.55,1.,ln)*.45*mask;
      c+=smoothstep(.35,0.,length(nrm-vec2(-.35,.45)))*mask*.55;
      c+=smoothstep(.4,0.,length(nrm-vec2(0.,-.6)))*mask*.18;
      c=mix(c,c*.8+vec3(.035,.045,.06),(1.-clear)*.55);
      c+=wipe*(1.-mask)*.025;
      gl_FragColor=vec4(c+grain(gl_FragCoord.xy)*.03,1.);`;

  /* ================= R&B / soul text motions ================= */
  Object.assign(M.enter, {
    silkSlide: { n: 'シルクのように滑り込む', c: 'スライド', d: 1.1, st: 0.5, u: 'g', f: (p, g) => { const q = E.outQuart(p); return { x: -(1 - q) * g.size * 1.6, skx: (1 - q) * 0.35, blur: (1 - q) * g.size * 0.18, a: A(p, 2.5) }; } },
    velvetRise: { n: 'ベルベット：字間を詰めながら浮かぶ', c: 'フェード', d: 1.25, st: 0.35, u: 'g', f: (p, g, c) => { const q = E.outCubic(p); return { y: (1 - q) * g.size * 0.6, x: (g.x - c.cx) * (1 - q) * 0.22, blur: (1 - q) * g.size * 0.22, a: A(p, 2) }; } },
    glowBloomIn: { n: '光がにじんで浮かび上がる', c: 'ぼかし', d: 1.0, st: 0.3, u: 'w', f: (p, g, c) => { const q = E.outCubic(p); const T = gsc({}, g, c, lerp(1.08, 1, q)); T.bright = (1 - q) * 1.1; T.blur = (1 - q) * g.size * 0.3; T.a = A(p, 2); return T; } },
  });
  Object.assign(M.hold, {
    grooveSway: { n: 'グルーヴで揺れる（裏拍で沈む）', c: 'ゆれ', f: (ht, g, c) => { const w = Math.sin(ht * 2.4 * (c.tempo || 1) + g.i * 0.3); return { x: w * g.size * 0.045 * c.amp, rot: w * 0.035 * c.amp, skx: w * 0.06 * c.amp, y: c.beat * g.size * 0.05 * c.amp }; } },
    shimmer: { n: 'つやが文字を流れる', c: '光', f: (ht, g) => ({ bright: Math.pow(Math.max(0, Math.sin(ht * 1.6 - g.i * 0.45)), 10) * 0.75 }) },
  });
  Object.assign(M.exit, {
    smokeOut: { n: '煙のようにほどけて消える', c: 'ぼかし', d: 1.1, st: 0.6, o: 'random', u: 'g', f: (p, g) => { const q = E.outCubic(p), r = g.r1 == null ? hash(g.i, 3) : g.r1; return { y: -q * g.size * (0.6 + r), x: (r - 0.5) * g.size * q, rot: (r - 0.5) * q * 0.6, blur: q * g.size * 0.45, sx: 1 + q * 0.35, a: 1 - E.inQuad(p) }; } },
    silkSlideOut: { n: 'シルクのように滑り去る', c: 'スライド', d: 0.9, st: 0.45, u: 'g', f: (p, g) => { const q = E.inCubic(p); return { x: q * g.size * 1.6, skx: -q * 0.35, blur: q * g.size * 0.18, a: 1 - E.inQuad(p) }; } },
  });

  /* ================= House text motions ================= */
  const flick = (p, n) => Math.floor(p * n) % 2 === 0;
  Object.assign(M.enter, {
    pumpIn: { n: 'ポンピング：ビートで弾けて登場', c: 'ビート', d: 0.55, st: 0.4, u: 'w', f: (p, g, c) => { const T = gsc({}, g, c, lerp(0.45, 1, E.outBack(p))); T.a = A(p, 5); return T; } },
    strobeIn: { n: 'ストロボで点滅しながら登場', c: 'フラッシュ', d: 0.5, st: 0.45, u: 'w', f: (p) => ({ vis: p > 0.75 || flick(p, 12), bright: (1 - p) * 0.8, a: A(p, 6) }) },
    filterSweep: { n: 'フィルターが開くように鮮明に', c: 'ぼかし', d: 0.9, st: 0, u: 'l', f: (p, g) => { const q = E.inOutCubic(p); return { blur: (1 - q) * g.size * 0.6, sy: 1 + (1 - q) * 0.5, bright: (1 - q) * 0.6, a: A(p, 3) }; } },
  });
  Object.assign(M.hold, {
    sidechainPump: { n: 'サイドチェイン：キックで沈んで戻る', c: 'ビート', f: (ht, g, c) => { const T = gsc({}, g, c, 1 - 0.075 * c.beat * c.amp); T.a = 1 - 0.22 * c.beat; return T; } },
    fourFloor: { n: '4つ打ちで跳ねる', c: 'ビート', f: (ht, g, c) => ({ y: -c.beat * g.size * 0.14 * c.amp * (g.wordIdx % 2 ? 0.7 : 1), sy: 1 + c.beat * 0.05 }) },
  });
  Object.assign(M.exit, {
    pumpOut: { n: 'ポンピングで弾け飛ぶ', c: 'ビート', d: 0.5, st: 0.3, u: 'w', f: (p, g, c) => { const q = E.inBack(p); const T = gsc({}, g, c, lerp(1, 1.7, Math.max(0, q))); T.blur = Math.max(0, q) * g.size * 0.2; T.a = 1 - E.inQuad(p); return T; } },
    strobeOut: { n: 'ストロボで点滅して消える', c: 'フラッシュ', d: 0.45, st: 0.45, u: 'w', f: (p) => ({ vis: p < 0.2 || flick(p, 12), bright: p * 0.6, a: 1 - clamp((p - 0.85) / 0.15) }) },
  });

  /* ================= R&B backgrounds ================= */
  def('silkWaves', '光沢のあるシルクがゆらめく', '模様', (ctx, R) => {
    const n = 7, W = R.W, H = R.H, t = R.t * 0.6;
    const cy = (j, x) => H * (-0.12 + j * 0.21) + Math.sin(x / W * TAU * 0.8 + t * 0.25 + j * 0.9) * H * 0.09 + Math.sin(x / W * TAU * 1.7 - t * 0.18 + j) * H * 0.035;
    const base = mix(R.pal.bg, R.pal.sub, 0.35), lite = mix(R.pal.sub, '#ffffff', 0.35), dark = mix(R.pal.bg, '#000000', 0.35);
    for (let j = 0; j < n; j++) {
      const ym = (cy(j, W / 2) + cy(j + 1, W / 2)) / 2, hh = Math.abs(cy(j + 1, W / 2) - cy(j, W / 2)) + 1;
      const g = ctx.createLinearGradient(0, ym - hh * 0.6, 0, ym + hh * 0.6);
      g.addColorStop(0, dark); g.addColorStop(0.35, base); g.addColorStop(0.52, j % 2 ? lite : mix(R.pal.accent, '#ffffff', 0.25)); g.addColorStop(0.62, base); g.addColorStop(1, dark);
      ctx.globalAlpha = 0.85; ctx.fillStyle = g; ctx.beginPath();
      for (let x = 0; x <= W + 1; x += W / 48) ctx.lineTo(x, cy(j, x));
      for (let x = W; x >= -1; x -= W / 48) ctx.lineTo(x, cy(j + 1, x));
      ctx.closePath(); ctx.fill();
    }
  });
  def('vinylSpin', 'レコードがゆっくり回る', '図形', (ctx, R) => {
    const r = R.minD * 0.62, x = R.W * 0.78, y = R.H * 0.62, a = R.t * TAU * 0.55;
    ctx.globalAlpha = 0.95; ctx.fillStyle = mix(R.pal.bg, '#050507', 0.85); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(0.5, R.S * 0.8);
    for (let k = 0.36; k < 0.98; k += 0.012) { ctx.strokeStyle = `rgba(255,255,255,${0.025 + 0.02 * hash(Math.round(k * 1000), 4)})`; ctx.beginPath(); ctx.arc(x, y, r * k, 0, TAU); ctx.stroke(); }
    // static sheen (the light does not turn with the record)
    [[-0.9, 0.12], [PI - 0.9, 0.08]].forEach(([s, al]) => { ctx.globalAlpha = 1; ctx.fillStyle = `rgba(255,255,255,${al})`; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 0.97, s, s + 0.35); ctx.closePath(); ctx.fill(); });
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = R.pal.accent; ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(R.pal.bg, 0.75); ctx.fillRect(-r * 0.2, -r * 0.13, r * 0.4, r * 0.035); ctx.fillRect(-r * 0.14, r * 0.08, r * 0.28, r * 0.025);
    ctx.strokeStyle = rgba(R.pal.bg, 0.5); ctx.lineWidth = R.S * 1.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.27, -0.6, 0.9); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = mix(R.pal.bg, '#000', 0.6); ctx.beginPath(); ctx.arc(x, y, r * 0.025, 0, TAU); ctx.fill();
  });
  def('slowBlinds', 'ブラインド越しの光', '光', (ctx, R) => {
    const D2 = Math.hypot(R.W, R.H), gap = R.minD * 0.11, sh = Math.sin(R.t * 0.18) * gap * 0.35, warm = mix(R.pal.text, '#ffcf8a', 0.5);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(R.W * 0.5, R.H * 0.5); ctx.rotate(-0.42 + Math.sin(R.t * 0.07) * 0.03);
    const g = ctx.createLinearGradient(-D2 / 2, 0, D2 / 2, 0); g.addColorStop(0, rgba(warm, 0)); g.addColorStop(0.35, rgba(warm, 0.16)); g.addColorStop(0.65, rgba(warm, 0.1)); g.addColorStop(1, rgba(warm, 0));
    ctx.fillStyle = g;
    for (let k = -9; k <= 9; k++) { const y = k * gap + sh, h = gap * (0.5 + 0.06 * Math.sin(R.t * 0.5 + k)); ctx.fillRect(-D2 / 2, y, D2, h); }
    ctx.restore();
    for (let i = 0; i < 40 * R.amt; i++) { const x = wrap(hash(i, 1, 33) * R.W + R.t * R.S * 6, R.W), y = wrap(hash(i, 2, 33) * R.H - R.t * R.S * 4, R.H); ctx.globalAlpha = 0.2 + 0.4 * Math.pow(Math.max(0, Math.sin(R.t + i)), 4); ctx.fillStyle = warm; ctx.fillRect(x, y, R.S * 1.6, R.S * 1.6); }
  });
  def('candleBokeh', 'キャンドルの灯りとボケ', '光', (ctx, R) => {
    ctx.globalCompositeOperation = 'lighter';
    const n = Math.round(20 * R.amt);
    for (let i = 0; i < n; i++) {
      const z = 0.3 + hash(i, 1, 44) * 0.7, x = hash(i, 2, 44) * R.W + Math.sin(R.t * 0.15 + i) * R.S * 20, y = R.H * (0.45 + hash(i, 3, 44) * 0.6) - wrap(R.t * R.S * 6 * z, R.H * 0.2);
      const r = R.minD * (0.03 + z * 0.08), fl = 0.65 + 0.35 * (0.5 + 0.5 * noise1(R.t * 3 + i * 7, 9)), col = mix(R.pal.accent, '#ffb04a', 0.55 + 0.4 * hash(i, 4, 44));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, 0.42 * fl)); g.addColorStop(0.7, rgba(col, 0.18 * fl)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });

  /* ================= House backgrounds ================= */
  const bp = (R) => R.t * ((R.bpm || 124) / 60);
  def('discoBall', 'ミラーボールと光の粒', '光', (ctx, R) => {
    const cx = R.W / 2, cy = R.H * 0.17, r = R.minD * 0.095, rot = R.t * 0.6, b = R.beat || 0;
    ctx.strokeStyle = rgba(R.pal.text, 0.35); ctx.lineWidth = R.S * 1.5; ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, cy - r); ctx.stroke();
    // light specks thrown across the room (rotate with the ball)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const n = Math.round(140 * R.amt), cols = [R.pal.text, R.pal.accent, R.pal.sub];
    for (let i = 0; i < n; i++) {
      const th = hash(i, 1, 51) * TAU + rot, el = (hash(i, 2, 51) - 0.35) * 1.4, f = Math.cos(th); if (f < 0.05) continue;
      const x = cx + Math.sin(th) * R.W * 0.75, y = cy + Math.sin(el) * R.H * 0.95 + R.H * 0.25, s = R.minD * (0.005 + hash(i, 3, 51) * 0.009) * (0.6 + f * 0.6);
      ctx.globalAlpha = (0.25 + 0.6 * f) * (0.7 + 0.3 * b); ctx.fillStyle = cols[i % 3];
      ctx.beginPath(); ctx.ellipse(x, y, s * (0.6 + 0.4 * f), s, 0, 0, TAU); ctx.fill();
      if (i % 7 === 0) { ctx.globalAlpha = 0.07 * f; ctx.strokeStyle = cols[i % 3]; ctx.lineWidth = s * 0.6; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); }
    }
    ctx.restore();
    // the ball: facets with a rotating sparkle
    const g0 = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r); g0.addColorStop(0, '#d8dde6'); g0.addColorStop(1, '#2a2d35');
    ctx.globalAlpha = 1; ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    for (let la = -7; la <= 7; la++) {
      const phi = (la / 8) * (PI / 2), cr = Math.cos(phi), m = Math.max(4, Math.round(18 * cr));
      for (let lo = 0; lo < m; lo++) {
        const th = (lo / m) * TAU + rot, z = Math.cos(th) * cr; if (z < 0) continue;
        const x = cx + Math.sin(th) * cr * r, y = cy + Math.sin(phi) * r, s = r * 0.1 * (0.4 + z * 0.6), sp = Math.pow(Math.max(0, Math.sin(th * 3 + R.t * 2 + la)), 12);
        ctx.fillStyle = sp > 0.5 ? '#ffffff' : `rgba(255,255,255,${0.12 + 0.35 * z * hash(la, lo, 5)})`; ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
  });
  def('danceFloor', '光るダンスフロア（ビートで点灯）', '図形', (ctx, R) => {
    const hor = R.H * 0.5, rows = 9, cols = 10, zf = 7, bi = Math.floor(bp(R)), bf = bp(R) - bi, colsP = [R.pal.accent, R.pal.sub, R.pal.text];
    const zAt = (v) => 1 + v * (zf - 1), P = (u, v) => { const z = zAt(v); return [R.W / 2 + (u - 0.5) * R.W * 2.4 / z, hor + (R.H * 1.02 - hor) / z]; };
    for (let r = rows - 1; r >= 0; r--) for (let c = 0; c < cols; c++) {
      const v0 = r / rows, v1 = (r + 1) / rows, u0 = c / cols, u1 = (c + 1) / cols, on = hash(r, c, bi) > 0.6, pv = hash(r, c, bi - 1) > 0.6;
      const a = (on ? 0.2 + 0.65 * (1 - bf) : pv ? 0.12 * (1 - bf) : 0.05) * (1 - r / rows * 0.6);
      const p0 = P(u0, v0), p1 = P(u1, v0), p2 = P(u1, v1), p3 = P(u0, v1);
      ctx.globalAlpha = a; ctx.fillStyle = colsP[(r * 3 + c + bi) % 3]; ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.18 * (1 - r / rows); ctx.strokeStyle = R.pal.text; ctx.lineWidth = Math.max(0.5, R.S * 1.2); ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, hor, 0, hor + R.H * 0.12); g.addColorStop(0, rgba(R.pal.bg, 1)); g.addColorStop(1, rgba(R.pal.bg, 0)); ctx.globalAlpha = 0.9; ctx.fillStyle = g; ctx.fillRect(0, hor - 1, R.W, R.H * 0.12);
  });
  def('movingHeads', 'ムービングライトの光線', '光', (ctx, R) => {
    const n = 6, b = R.beat || 0, beat = Math.floor(bp(R) / 2);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const top = i % 2 === 1, x = R.W * ((i + 0.5) / n), y = top ? -R.S * 10 : R.H + R.S * 10;
      const tgt = (hash(i, beat, 61) - 0.5) * 1.1, prev = (hash(i, beat - 1, 61) - 0.5) * 1.1, k = E.inOutCubic(clamp((bp(R) / 2 - beat) * 2));
      const ang = (top ? PI / 2 : -PI / 2) + lerp(prev, tgt, k) + Math.sin(R.t * 0.6 + i) * 0.1, L = Math.hypot(R.W, R.H) * 0.95, wd = 0.07;
      const col = i % 3 === 0 ? R.pal.accent : i % 3 === 1 ? R.pal.sub : R.pal.text;
      const g = ctx.createLinearGradient(x, y, x + Math.cos(ang) * L, y + Math.sin(ang) * L); g.addColorStop(0, rgba(col, 0.42 + 0.3 * b)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang - wd) * L, y + Math.sin(ang - wd) * L); ctx.lineTo(x + Math.cos(ang + wd) * L, y + Math.sin(ang + wd) * L); ctx.closePath(); ctx.fill();
      const gr = ctx.createRadialGradient(x, y, 0, x, y, R.minD * 0.08); gr.addColorStop(0, rgba(col, 0.8)); gr.addColorStop(1, rgba(col, 0)); ctx.fillStyle = gr; ctx.fillRect(x - R.minD * 0.08, y - R.minD * 0.08, R.minD * 0.16, R.minD * 0.16);
    }
    ctx.restore();
  });
  def('pianoKeys', 'ピアノハウスの鍵盤が光る', '図形', (ctx, R) => {
    const nW = 28, kw = R.W / nW, kh = R.H * 0.17, y0 = R.H - kh, step = Math.floor(bp(R) * 2), bar = Math.floor(bp(R) / 4), f = bp(R) * 2 - step;
    const lit = new Set(); [0, 2, 4].forEach((d, i) => lit.add((Math.floor(hash(bar, 7) * 12) + d * 2 + (step % 2 ? i : 0)) % nW));
    lit.add(Math.floor(hash(step, 9) * nW));
    for (let i = 0; i < nW; i++) {
      const on = lit.has(i), x = i * kw;
      if (on) { const g = ctx.createLinearGradient(0, y0, 0, y0 - R.H * 0.35); g.addColorStop(0, rgba(R.pal.accent, 0.35 * (1 - f * 0.5))); g.addColorStop(1, rgba(R.pal.accent, 0)); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(x, y0 - R.H * 0.35, kw, R.H * 0.35); }
      ctx.globalAlpha = 0.92; ctx.fillStyle = on ? mix(R.pal.accent, '#ffffff', 0.25 * (1 - f)) : mix(R.pal.text, R.pal.bg, 0.12); ctx.fillRect(x + 1, y0, kw - 2, kh);
    }
    for (let i = 0; i < nW; i++) { const m = i % 7; if (m === 2 || m === 6) continue; ctx.globalAlpha = 0.95; ctx.fillStyle = mix(R.pal.bg, '#000', 0.5); ctx.fillRect((i + 1) * kw - kw * 0.3, y0, kw * 0.6, kh * 0.6); }
  });

  /* ================= accent graphics ================= */
  const gdef = (id, n, c, f, top) => (G[id] = { n, c, f, top: !!top });
  gdef('swashUnder', '筆記体のスワッシュ線（下線）', 'ライン', (ctx, R) => {
    const b = R.bb, e = E.inOutCubic(clamp((R.e || 0) / 0.9)), a = 1 - E.inQuad(R.x || 0), y = b.y + b.h * 1.08, x0 = b.x - b.h * 0.2, x1 = b.x + b.w + b.h * 0.3;
    const pts = []; for (let i = 0; i <= 60; i++) { const u = i / 60, x = lerp(x0, x1, u), yy = y + Math.sin(u * PI * 1.2) * b.h * 0.08 - (u > 0.82 ? Math.sin(((u - 0.82) / 0.18) * PI) * b.h * 0.28 : 0); pts.push([x, yy]); }
    const m = Math.max(1, Math.floor(e * 60)); ctx.globalAlpha = a; ctx.strokeStyle = R.pal.accent; ctx.lineCap = 'round';
    for (let i = 1; i <= m; i++) { const u = i / 60; ctx.lineWidth = Math.max(1, b.h * 0.012) * (1 + 6 * Math.sin(u * PI)); ctx.beginPath(); ctx.moveTo(...pts[i - 1]); ctx.lineTo(...pts[i]); ctx.stroke(); }
  });
  gdef('eqUnder', 'イコライザーの下線（ビートで跳ねる）', 'ライン', (ctx, R) => {
    const b = R.bb, a = (1 - E.inQuad(R.x || 0)) * E.outCubic(clamp((R.e || 0) / 0.4)), n = 28, gw = b.w / n, y = b.y + b.h * 1.12;
    ctx.globalAlpha = a;
    for (let i = 0; i < n; i++) { const h = b.h * 0.32 * (0.2 + 0.8 * Math.abs(noise1((R.tAbs || 0) * 3 + i * 0.7, 3))) * (0.45 + 0.55 * (R.beat || 0)); ctx.fillStyle = i % 2 ? R.pal.accent : R.pal.sub; ctx.fillRect(b.x + i * gw + gw * 0.15, y, gw * 0.7, h); }
  });

  /* ================= transitions ================= */
  TR.silkWipe = { n: 'シルクの帯がなでて切り替わる', c: 'カバー', kind: 'cover', f(ctx, u, R) {
    const k = u < 0.5 ? E.inOutCubic(u * 2) : 1 - E.inOutCubic((u - 0.5) * 2); if (k <= 0.001) return;
    const x = lerp(-R.W * 0.4, R.W * 1.4, E.inOutSine(u)), w = R.W * 1.1 * k;
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, rgba(R.pal.sub, 0)); g.addColorStop(0.3, R.pal.sub); g.addColorStop(0.5, mix(R.pal.sub, '#ffffff', 0.35)); g.addColorStop(0.7, R.pal.accent); g.addColorStop(1, rgba(R.pal.accent, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w / 2, 0);
    for (let y = 0; y <= R.H; y += R.H / 20) ctx.lineTo(x + w / 2 + Math.sin(y / R.H * PI * 2 + u * 4) * R.W * 0.06, y);
    for (let y = R.H; y >= 0; y -= R.H / 20) ctx.lineTo(x - w / 2 + Math.sin(y / R.H * PI * 2 + u * 4 + 1) * R.W * 0.06, y);
    ctx.closePath(); ctx.fill();
  } };
  TR.strobeCut = { n: 'ストロボで白黒点滅して切り替わる', c: 'フラッシュ', kind: 'cover', f(ctx, u, R) {
    if (u <= 0.02 || u >= 0.98) return; const k = Math.floor(u * 8);
    ctx.globalAlpha = 1 - Math.abs(u - 0.5) * 1.2; ctx.fillStyle = k % 2 ? '#ffffff' : (k % 4 === 0 ? R.pal.accent : '#000000'); ctx.fillRect(0, 0, R.W, R.H);
  } };

  /* ================= cameras ================= */
  D.cameras.pump = 'サイドチェイン（キックで引いて戻る）';
  D.cameras.groove = 'グルーヴでゆらぐ（横ゆれ）';

  /* ================= themes ================= */
  const NT = [
    { id: 'rnb', n: 'R&B / ソウル', d: '艶やかでスムース。シルク・ゴールド・ゆれるグルーヴ', emoji: '♢', pals: ['wine', 'golden', 'neonoir', 'dusk', 'lavender', 'midnight'], fonts: ['dmserif', 'playfair', 'mincho', 'cormorant', 'serif'],
      layouts: { center: 3, corner: 2, editorial: 1.5, subtitle: 1.5, bigCrop: 1, vertical: 1 },
      enter: { silkSlide: 3, velvetRise: 3, glowBloomIn: 2.5, blurIn: 1.5, blurChars: 1.5, focusPull: 1 },
      hold: { grooveSway: 3, shimmer: 2.5, float: 1.5, drift: 1, zoomSlow: 1 },
      exit: { smokeOut: 3, silkSlideOut: 2, blurOut: 2, fadeOut: 1.5 },
      filters: { glowText: 2, goldDust: 2, bloom: 1.5, dust: 1, rainWindow: 1, letterbox: 0.5 },
      post: ['noise', 'vignette'], bg: ['radial', 'gradient'], camera: { groove: 2.5, drift: 1.5, push: 1.5, still: 1 }, fx: 0.6, maxFx: 1, speed: 0.85, keyColor: false, beat: true, amp: 0.95,
      tr: { silkWipe: 2.5, blurCut: 2, filmBurnCut: 1, flashWhite: 0.5 }, trRate: 0.4,
      gx: { swashUnder: 2.5, glowPulse: 1.5, halo: 1 }, gxRate: 0.3,
      bgm: { silkWaves: 2.5, slowBlinds: 2, candleBokeh: 2, vinylSpin: 1.5, smoke: 1.5, bokehDrift: 1.5, gl_rainGlass: 1, waterDrops: 0.8, gl_mesh: 1 } },
    { id: 'house', n: 'ハウス / ダンス', d: '4つ打ちで跳ねる。ミラーボール・ストロボ・ポンピング', emoji: '◍', pals: ['synth', 'citypop', 'laser', 'vapor', 'cyber', 'eblue', 'candy'], fonts: ['montserrat', 'outfit', 'poppins', 'unbounded', 'gothic', 'mplus'],
      layouts: { center: 2.5, poster: 2.5, wordFlash: 2, stack: 1.5, marquee: 1, cameraTrack: 1 },
      enter: { pumpIn: 3, filterSweep: 2.5, strobeIn: 2, slam: 1, zoomOut: 1, wordSeq: 1 },
      hold: { sidechainPump: 3, fourFloor: 2.5, pulse: 1.5, beatPump: 1.5 },
      exit: { pumpOut: 2.5, strobeOut: 2, zoomThrough: 1, cut: 1 },
      filters: { strobe: 1.5, neonText: 1.5, bloom: 1.5, glowText: 1, audioBars: 0.8, flash: 1 },
      post: ['bloom'], bg: ['radial', 'solid'], camera: { pump: 3, punch: 1.5, zoomStep: 1, still: 0.5 }, fx: 0.7, maxFx: 2, speed: 1.15, keyColor: true, beat: true, amp: 1.2,
      tr: { strobeCut: 2.5, flashAccent: 1.5, zoomThrough: 1.5, whipLeft: 1, colorBlocks: 1 }, trRate: 0.75,
      gx: { eqUnder: 2.5, ringBurst: 1.5, glowPulse: 1.5, lineBurst: 1 }, gxRate: 0.5,
      bgm: { discoBall: 2.5, danceFloor: 2.5, movingHeads: 2.5, pianoKeys: 1.5, dotRipple: 1, gl_laserGrid: 1, gl_spheres: 1 } },
  ];
  // keep only vocabulary that exists in this build
  const LIB = { layouts: LM.layouts || null, enter: M.enter, hold: M.hold, exit: M.exit, filters: FX.list, tr: TR, gx: G, bgm: BG, camera: D.cameras };
  NT.forEach((t) => {
    Object.keys(LIB).forEach((k) => { if (LIB[k] && t[k]) Object.keys(t[k]).forEach((id) => { if (!LIB[k][id]) delete t[k][id]; }); });
    const at = D.themes.findIndex((x) => x.id === (t.id === 'rnb' ? 'hiphop' : 'edm'));
    D.themes.splice(at >= 0 ? at + 1 : D.themes.length, 0, t); D.themeById[t.id] = t;
  });

  /* ================= share with neighbouring genres ================= */
  const add = (id, k, o) => { const t = D.themeById[id]; if (t) t[k] = Object.assign({}, t[k] || {}, o); };
  add('lofi', 'filters', { rainWindow: 1.2 }); add('lofi', 'bgm', { vinylSpin: 0.8, slowBlinds: 0.8 });
  add('ballad', 'filters', { rainWindow: 0.8 }); add('ballad', 'enter', { velvetRise: 1 }); add('ballad', 'exit', { smokeOut: 0.8 });
  add('citypop', 'bgm', { slowBlinds: 1, vinylSpin: 0.8 }); add('citypop', 'hold', { grooveSway: 1 }); add('citypop', 'camera', { groove: 1 });
  add('acoustic', 'bgm', { candleBokeh: 1 }); add('ambient', 'filters', { rainWindow: 0.6 }); add('cinematic', 'filters', { rainWindow: 0.6 });
  add('edm', 'bgm', { movingHeads: 1.2, discoBall: 0.8 }); add('edm', 'hold', { sidechainPump: 1.2 }); add('edm', 'camera', { pump: 1.2 }); add('edm', 'filters', { strobe: 1 });
  add('vj', 'bgm', { movingHeads: 1 }); add('jpop', 'bgm', { discoBall: 0.6 }); add('jpop', 'hold', { fourFloor: 0.8 });
  add('hiphop', 'bgm', { vinylSpin: 1 }); add('hiphop', 'hold', { grooveSway: 0.8 });
})();
