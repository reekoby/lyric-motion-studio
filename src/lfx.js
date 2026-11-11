/* Effect catalogue phase 6b — experimental treatments of the lyric layer (§25 EX-02/16/17/18).
 * These filters take the finished lyric layer of a line and re-render it:
 *  - SDF chrome / liquid metal: a signed distance field of the letters (jump flooding on the GPU) is lit as a bevelled
 *    chrome slab; the liquid variant smooth-unions the letters with orbiting metaballs that melt into them (EX-02)
 *  - reaction–diffusion: a Gray–Scott Turing pattern grows inside the letters and dies outside, so the pattern
 *    carves itself into the text (EX-16)
 *  - cellular automaton: cells are born next to living neighbours inside the letters, grow the words, and erode away
 *    on the way out (EX-17)
 *  - ink in water: a stable-fluids simulation (advection, pressure projection, curl noise, buoyancy) carries ink shed
 *    by the strokes; on the exit the letters dissolve into it (EX-18)
 * Simulations advance on a fixed step from the start of the line, so a frame is the same in preview and export
 * (state is kept while frames run forward; scrubbing back re-simulates). Needs WebGL2 + float render targets;
 * without them the lyric is drawn as usual. */
'use strict';
LM.lfx = (() => {
  const U = LM.U, clamp = U.clamp, hash = U.hash;
  let G = null;
  const VS = `#version 300 es
in vec2 p;out vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
  const HEAD = `#version 300 es
precision highp float;in vec2 v;out vec4 o;`;
  function gl0() {
    if (G !== null) return G;
    try {
      const cv = document.createElement('canvas'), gl = cv.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
      if (!gl || !gl.getExtension('EXT_color_buffer_float')) return (G = false);
      gl.getExtension('OES_texture_float_linear');
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      G = { cv, gl, P: {}, T: {}, vb: b };
    } catch (e) { G = false; }
    return G;
  }
  function prog(id, fs) {
    const g = G, gl = g.gl; if (g.P[id]) return g.P[id];
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(id + ': ' + gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, HEAD + fs)); gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    return (g.P[id] = { pr, u: {} });
  }
  function tex(w, h, fmt) {
    const gl = G.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    const f = fmt === 'f32' ? [gl.RGBA32F, gl.RGBA, gl.FLOAT] : [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT];
    gl.texImage2D(gl.TEXTURE_2D, 0, f[0], w, h, 0, f[1], f[2], null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fb, w, h };
  }
  // named render targets, re-created when the size changes
  function rt(name, w, h, fmt) { let r = G.T[name]; if (!r || r.w !== w || r.h !== h) { if (r) { G.gl.deleteTexture(r.t); G.gl.deleteFramebuffer(r.fb); } r = G.T[name] = tex(w, h, fmt); if (fmt === 'f32') { const gl = G.gl; gl.bindTexture(gl.TEXTURE_2D, r.t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); } } return r; }
  function upload(name, src) {
    const gl = G.gl; let r = G.T[name]; if (!r) { const t = gl.createTexture(); r = G.T[name] = { t }; }
    gl.bindTexture(gl.TEXTURE_2D, r.t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return r;
  }
  // run a pass: P program, out target (null = canvas), inputs {name: texture}, uniforms {name: value}
  function pass(P, out, ins, uni) {
    const gl = G.gl; gl.useProgram(P.pr);
    if (out) { gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb); gl.viewport(0, 0, out.w, out.h); } else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, G.cv.width, G.cv.height); }
    gl.disable(gl.BLEND); gl.bindBuffer(gl.ARRAY_BUFFER, G.vb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    let unit = 0;
    for (const [k, tx] of Object.entries(ins || {})) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx.t); const l = P.u[k] !== undefined ? P.u[k] : (P.u[k] = gl.getUniformLocation(P.pr, k)); gl.uniform1i(l, unit); unit++; }
    for (const [k, val] of Object.entries(uni || {})) { const l = P.u[k] !== undefined ? P.u[k] : (P.u[k] = gl.getUniformLocation(P.pr, k)); if (l == null) continue; if (typeof val === 'number') gl.uniform1f(l, val); else if (val.length === 2) gl.uniform2f(l, val[0], val[1]); else if (val.length === 3) gl.uniform3f(l, val[0], val[1], val[2]); else gl.uniform4f(l, val[0], val[1], val[2], val[3]); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const rgb = (h) => U.hex2rgb(h).map((x) => x / 255);

  /* ---------- shaders ---------- */
  const FS = {
    // JFA seed: inside / outside points of the letters (alpha ≥ .5); channels: nearest outside xy, nearest inside xy
    seed: `uniform sampler2D L;void main(){float a=texture(L,v).a;o=a>.5?vec4(-1.,-1.,v):vec4(v,-1.,-1.);}`,
    jfa: `uniform sampler2D S;uniform vec2 px;uniform float st;void main(){vec4 b=texture(S,v);float d1=b.x<0.?1e9:distance(b.xy*px,v*px),d2=b.z<0.?1e9:distance(b.zw*px,v*px);
      for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){if(i==0&&j==0)continue;vec4 n=texture(S,v+vec2(i,j)*st/px);
        if(n.x>=0.){float d=distance(n.xy*px,v*px);if(d<d1){d1=d;b.xy=n.xy;}} if(n.z>=0.){float d=distance(n.zw*px,v*px);if(d<d2){d2=d;b.zw=n.zw;}}}o=b;}`,
    // signed distance in pixels (negative inside), from the JFA result
    sdf: `uniform sampler2D S,L;uniform vec2 px;void main(){vec4 b=texture(S,v);float dOut=b.z<0.?999.:length((b.zw-v)*px),dIn=b.x<0.?999.:length((b.xy-v)*px);float a=texture(L,v).a;o=vec4(a>.5?-dIn:dOut,0.,0.,1.);}`,
    chrome: `uniform sampler2D D,L;uniform vec2 px,res;uniform float T,bev,liq,beat,S;uniform vec3 C1,C2,C3;uniform vec4 B0,B1,B2,B3;
      float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
      float sd0(vec2 u){vec2 e=1./res;return (texture(D,u).x*4.+texture(D,u+vec2(e.x,0)).x+texture(D,u-vec2(e.x,0)).x+texture(D,u+vec2(0,e.y)).x+texture(D,u-vec2(0,e.y)).x)*.125;}
      float sd(vec2 u){float d=sd0(u);if(liq>0.){vec2 q=u*res;vec4 B[4];B[0]=B0;B[1]=B1;B[2]=B2;B[3]=B3;for(int i=0;i<4;i++){float r=length(q-B[i].xy)-B[i].z;d=smin(d,r,B[i].w);}}return d;}
      vec3 env(vec3 r){float y=r.y;vec3 c=mix(C3*.35+.08,vec3(1.15),smoothstep(-.35,.75,y));c+=smoothstep(.93,1.,abs(sin(r.x*2.2+T*.4)))*.8;c=mix(c,C1,.25*smoothstep(-.6,.2,-y));c+=C2*.35*smoothstep(.3,1.,r.x);return c;}
      void main(){vec2 e=vec2(1.,0.)/res;float d=sd(v);float a=1.-smoothstep(-.8,.8,d);
        float sh=1.-smoothstep(0.,bev*2.5,sd(v+vec2(-.006,.012)));vec4 base=vec4(0.,0.,0.,.35*sh*(1.-a));
        if(a<=0.){o=base;return;}
        float hx=sd(v+e.xy)-sd(v-e.xy),hy=sd(v+e.yx)-sd(v-e.yx);float k=clamp(-d/bev,0.,1.);float hh=sqrt(1.-pow(1.-k,2.));
        vec3 n=normalize(vec3(-hx,-hy,0.)*(1.-k)*2.2+vec3(0.,0.,1.)*(.25+hh));
        vec3 r=reflect(vec3(0.,0.,-1.),n);vec3 c=env(r);vec3 Ld=normalize(vec3(cos(T*.7),.8,.6+sin(T*.5)*.3));float sp=pow(max(dot(reflect(-Ld,n),vec3(0.,0.,1.)),0.),60.);
        vec4 lc=texture(L,v);vec3 tint=lc.a>.01?lc.rgb/lc.a:C1;float fr=pow(1.-n.z,3.);
        c=c*mix(vec3(1.),tint,.45)*(.7+.3*k)+sp*1.4+fr*C2*.5+beat*.12;
        o=mix(base,vec4(c,1.),a);o.rgb*=o.a;}`,
    // Gray–Scott (U in r, V in g); feed / kill depend on the text mask
    rdInit: `uniform sampler2D L;uniform float sd;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+sd)*43758.5);}void main(){float a=texture(L,v).a;vec2 c=floor(v*vec2(320.,180.));float s=h(c)>.9&&a>.05?1.:0.;o=vec4(1.,s*.9,0.,1.);}`,
    rd: `uniform sampler2D S,L;uniform vec2 px;uniform float sd;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+sd)*43758.5);}void main(){vec2 e=1./px;vec4 c=texture(S,v);vec2 l=-c.rg;
      l+=.2*(texture(S,v+vec2(e.x,0)).rg+texture(S,v-vec2(e.x,0)).rg+texture(S,v+vec2(0,e.y)).rg+texture(S,v-vec2(0,e.y)).rg)+.05*(texture(S,v+e).rg+texture(S,v-e).rg+texture(S,v+vec2(e.x,-e.y)).rg+texture(S,v+vec2(-e.x,e.y)).rg);
      float a=texture(L,v).a;float f=mix(.02,.029,a),k=mix(.075,.057,a);float u=c.r,w=c.g,r=u*w*w;
      u+=1.*l.x-r+f*(1.-u);w+=.5*l.y+r-(f+k)*w;if(a>.2&&h(floor(v*vec2(160.,90.)))>.996)w=max(w,.5);o=vec4(clamp(u,0.,1.),clamp(w,0.,1.),0.,1.);}`,
    rdOut: `uniform sampler2D S,L;uniform vec3 C1,C2;uniform float fadeT,grow;void main(){float w=texture(S,v).g;vec4 lc=texture(L,v);vec3 col=lc.a>.02?lc.rgb/lc.a:C1;
      float m=smoothstep(.16,.3,w);float edge=smoothstep(.08,.16,w)-m;vec3 c=col*m+C2*edge*.8;float a=max(m,edge*.7);
      a=mix(a,lc.a,fadeT);c=mix(c,col,fadeT);o=vec4(c*a,a)*grow;}`,
    // stable fluids
    advect: `uniform sampler2D Vl,Q;uniform vec2 px;uniform float dt,dis;void main(){vec2 u=texture(Vl,v).xy;vec2 p=v-u*dt/px;o=texture(Q,p)*dis;}`,
    force: `uniform sampler2D Vl,Dn;uniform vec2 px;uniform float T,amp,buoy;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){vec2 u=texture(Vl,v).xy;vec2 q=v*vec2(px.x/px.y,1.)*7.+vec2(0.,T*.25);float e=.01;vec2 cu=vec2(n(q+vec2(0,e))-n(q-vec2(0,e)),-(n(q+vec2(e,0))-n(q-vec2(e,0))))/(2.*e);
        float d=texture(Dn,v).a;u+=cu*amp*.0006*px.y+vec2(0.,buoy*d*.02);o=vec4(u*.995,0.,1.);}`,
    div: `uniform sampler2D Vl;uniform vec2 px;void main(){vec2 e=1./px;float d=texture(Vl,v+vec2(e.x,0)).x-texture(Vl,v-vec2(e.x,0)).x+texture(Vl,v+vec2(0,e.y)).y-texture(Vl,v-vec2(0,e.y)).y;o=vec4(d*.5,0.,0.,1.);}`,
    jac: `uniform sampler2D Pr,Dv;uniform vec2 px;void main(){vec2 e=1./px;float p=(texture(Pr,v+vec2(e.x,0)).x+texture(Pr,v-vec2(e.x,0)).x+texture(Pr,v+vec2(0,e.y)).x+texture(Pr,v-vec2(0,e.y)).x-texture(Dv,v).x)*.25;o=vec4(p,0.,0.,1.);}`,
    grad: `uniform sampler2D Vl,Pr;uniform vec2 px;void main(){vec2 e=1./px;vec2 u=texture(Vl,v).xy-.5*vec2(texture(Pr,v+vec2(e.x,0)).x-texture(Pr,v-vec2(e.x,0)).x,texture(Pr,v+vec2(0,e.y)).x-texture(Pr,v-vec2(0,e.y)).x);o=vec4(u,0.,1.);}`,
    inject: `uniform sampler2D Dn,L;uniform float k;void main(){vec4 d=texture(Dn,v);vec4 l=texture(L,v);o=d+l*k;o=min(o,vec4(1.6));}`,
    inkOut: `uniform sampler2D Dn,L;uniform float tA,inkA;void main(){vec4 d=texture(Dn,v);float a=clamp(d.a,0.,1.);vec3 c=d.a>.001?d.rgb/d.a:vec3(0.);
      float g=1.-exp(-a*3.2);vec4 ink=vec4(c*g,g)*inkA;vec4 l=texture(L,v)*tA;o=l+ink*(1.-l.a);}`,
    copy: `uniform sampler2D L;void main(){o=texture(L,v);}`,
  };

  /* ---------- per-line simulation state ---------- */
  const ST = new Map();
  const state = (key) => { let s = ST.get(key); if (!s) { s = { step: -1 }; ST.set(key, s); if (ST.size > 24) ST.delete(ST.keys().next().value); } return s; };

  function sdfPass(L, W, H) {
    const w = Math.max(64, Math.round(W / 2)), h = Math.max(36, Math.round(H / 2)), Lt = upload('L', L);
    let A = rt('jA', w, h, 'f32'), B = rt('jB', w, h, 'f32');
    pass(prog('seed', FS.seed), A, { L: Lt });
    for (let st = Math.pow(2, Math.ceil(Math.log2(Math.max(w, h))) - 1); st >= 1; st = Math.floor(st / 2)) { pass(prog('jfa', FS.jfa), B, { S: A }, { px: [w, h], st }); [A, B] = [B, A]; }
    const D = rt('sdf', w, h); pass(prog('sdf', FS.sdf), D, { S: A, L: Lt }, { px: [w, h] });
    return { D, Lt, w, h };
  }

  const FX = {
    sdfChrome: { n: '立体クロム文字（SDF）', liq: 0 },
    sdfLiquid: { n: '液体金属で溶け合う文字（SDF）', liq: 1 },
    reactionText: { n: '反応拡散の模様で文字が彫られる', sim: 'rd' },
    cellText: { n: 'セルオートマトンで文字が育つ', cpu: 'ca' },
    inkFluid: { n: '墨が水に溶けるように流れる（流体）', sim: 'ink' },
  };
  function apply(id, L, o) {
    const f = FX[id]; if (!f) return null;
    if (f.cpu) return caApply(L, o);
    if (!gl0()) return null;
    const g = G, gl = g.gl, W = o.W, H = o.H; if (g.cv.width !== W || g.cv.height !== H) { g.cv.width = W; g.cv.height = H; }
    try {
      if (f.liq != null) {
        const s = sdfPass(L, W, H), bb = o.bbox || { cx: W / 2, cy: H / 2, w: W * 0.5, h: H * 0.2 }, t = o.t, sc = s.w / W;
        const blob = (i) => { const a = t * (0.6 + i * 0.17) + i * 1.9, r = (bb.h * (0.18 + 0.06 * Math.sin(t * 1.3 + i)) + (o.beat || 0) * bb.h * 0.05) * sc; return [(bb.cx + Math.cos(a) * bb.w * 0.45) * sc, (H - (bb.cy + Math.sin(a * 1.3) * bb.h * 0.7)) * sc, r, bb.h * 0.22 * sc]; };
        const Bs = f.liq ? [0, 1, 2, 3].map(blob) : [[-999, -999, 1, 1], [-999, -999, 1, 1], [-999, -999, 1, 1], [-999, -999, 1, 1]];
        pass(prog('chrome', FS.chrome), null, { D: s.D, L: s.Lt }, { px: [s.w, s.h], res: [s.w, s.h], T: t, bev: Math.max(2.5, o.size * 0.16 * sc), liq: f.liq, beat: o.beat || 0, S: o.S, C1: rgb(o.pal.text), C2: rgb(o.pal.accent), C3: rgb(o.pal.bg), B0: Bs[0], B1: Bs[1], B2: Bs[2], B3: Bs[3] });
        return g.cv;
      }
      if (f.sim === 'rd') {
        const cs = clamp((o.size || 40) / 46, 1, 4), w = Math.max(64, Math.round(W / cs)), h = Math.max(36, Math.round(H / cs)), Lt = upload('L', L), s = state(o.key + '|rd|' + w), step = Math.floor(Math.max(0, o.lt) * 30);
        let A = rt('rdA' + o.key.length % 2, w, h, 'f32'), B = rt('rdB' + o.key.length % 2, w, h, 'f32');
        if (step < s.step || !s.A || s.w !== w) { pass(prog('rdInit', FS.rdInit), A, { L: Lt }, { sd: (U.strHash(o.key) % 1000) * 0.37 }); s.step = 0; s.A = A; s.B = B; s.w = w; }
        A = s.A; B = s.B;
        const iters = Math.min(6000, (step - s.step) * 28);
        for (let i = 0; i < iters; i++) { pass(prog('rd', FS.rd), B, { S: A, L: Lt }, { px: [w, h], sd: (s.step * 28 + i) * 0.013 }); [A, B] = [B, A]; }
        s.A = A; s.B = B; s.step = step;
        pass(prog('rdOut', FS.rdOut), null, { S: A, L: Lt }, { C1: rgb(o.pal.text), C2: rgb(o.pal.accent), fadeT: clamp(o.xp * 1.5, 0, 1) * 0, grow: 1 });
        return g.cv;
      }
      if (f.sim === 'ink') {
        const w = Math.max(64, Math.round(W / 3)), h = Math.max(36, Math.round(H / 3)), Lt = upload('L', L), s = state(o.key + '|ink|' + w), step = Math.floor(Math.max(0, o.lt) * 40);
        const mk = (n) => rt('ink' + n, w, h);
        if (step < s.step || !s.ok || s.w !== w) { for (const n of ['V0', 'V1', 'D0', 'D1', 'P0', 'P1', 'Dv']) { const r = mk(n); gl.bindFramebuffer(gl.FRAMEBUFFER, r.fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } s.V = [mk('V0'), mk('V1')]; s.D = [mk('D0'), mk('D1')]; s.step = 0; s.ok = 1; s.w = w; }
        const n = Math.min(400, step - s.step), dt = 1 / 40;
        for (let i = 0; i < n; i++) {
          const ti = (s.step + i) * dt, exiting = o.exitAt != null && ti >= o.exitAt - (o.start || 0);
          pass(prog('force', FS.force), s.V[1], { Vl: s.V[0], Dn: s.D[0] }, { px: [w, h], T: ti, amp: exiting ? 2.4 : 0.9, buoy: exiting ? 1.4 : 0.5 }); s.V.reverse();
          pass(prog('advect', FS.advect), s.V[1], { Vl: s.V[0], Q: s.V[0] }, { px: [w, h], dt: dt * 60, dis: 0.995 }); s.V.reverse();
          const Dv = mk('Dv'); pass(prog('div', FS.div), Dv, { Vl: s.V[0] }, { px: [w, h] });
          let P0 = mk('P0'), P1 = mk('P1'); gl.bindFramebuffer(gl.FRAMEBUFFER, P0.fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
          for (let j = 0; j < 14; j++) { pass(prog('jac', FS.jac), P1, { Pr: P0, Dv }, { px: [w, h] }); [P0, P1] = [P1, P0]; }
          pass(prog('grad', FS.grad), s.V[1], { Vl: s.V[0], Pr: P0 }, { px: [w, h] }); s.V.reverse();
          pass(prog('inject', FS.inject), s.D[1], { Dn: s.D[0], L: Lt }, { k: exiting ? 0.08 : 0.012 }); s.D.reverse();
          pass(prog('advect', FS.advect), s.D[1], { Vl: s.V[0], Q: s.D[0] }, { px: [w, h], dt: dt * 60, dis: exiting ? 0.996 : 0.99 }); s.D.reverse();
        }
        s.step += n;
        pass(prog('inkOut', FS.inkOut), null, { Dn: s.D[0], L: Lt }, { tA: 1 - clamp(o.xp * 1.6, 0, 1), inkA: 0.85 });
        return g.cv;
      }
    } catch (e) { console.warn('lfx', id, e.message); FX[id].bad = 1; return null; }
    return null;
  }

  /* ---------- cellular automaton (CPU, fixed 15 Hz steps) ---------- */
  const caC = document.createElement('canvas'), caX = caC.getContext('2d', { willReadFrequently: true }), caO = document.createElement('canvas');
  function caApply(L, o) {
    const W = o.W, H = o.H, cw = Math.max(4, Math.round(o.S * 7)), cols = Math.ceil(W / cw), rows = Math.ceil(H / cw), n = cols * rows;
    if (caC.width !== cols || caC.height !== rows) { caC.width = cols; caC.height = rows; }
    caX.clearRect(0, 0, cols, rows); caX.drawImage(L, 0, 0, cols, rows); const px = caX.getImageData(0, 0, cols, rows).data;
    const s = state(o.key + '|ca|' + cols), step = Math.floor(Math.max(0, o.lt) * 15), sd = U.strHash(o.key) % 997;
    if (step < s.step || !s.a || s.a.length !== n) { s.a = new Uint8Array(n); s.age = new Uint16Array(n); s.step = 0; }
    const a = s.a, b = new Uint8Array(n);
    for (let st = s.step; st < step; st++) {
      const die = o.exitAt != null && st / 15 >= o.exitAt - (o.start || 0) ? clamp((st / 15 - (o.exitAt - o.start)) / Math.max(0.2, o.xd || 0.6), 0, 1) : 0;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x, m = px[i * 4 + 3] > 90; let nb = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < cols && yy < rows) nb += a[yy * cols + xx]; }
        let v = a[i];
        if (m) { if (!v && ((nb > 0 && hash(i, st, sd) < 0.38) || hash(i, st, sd + 1) < 0.006)) v = 1; }
        else v = v && (nb === 2 || nb === 3) && hash(i, st, sd + 2) < 0.7 ? 1 : 0;
        if (v && die > 0 && hash(i, st, sd + 3) < die * 0.5 + (nb < 3 ? die * 0.4 : 0)) v = 0;
        b[i] = v; s.age[i] = v ? (a[i] ? Math.min(999, s.age[i] + 1) : 0) : 0;
      }
      a.set(b);
    }
    s.step = Math.max(s.step, step);
    if (caO.width !== W || caO.height !== H) { caO.width = W; caO.height = H; }
    const x = caO.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
    // the real letters stay faintly underneath for legibility
    x.globalAlpha = 0.22 * (1 - clamp(o.xp * 2, 0, 1)); x.drawImage(L, 0, 0); x.globalAlpha = 1;
    const r = cw * 0.42, acc = o.pal.accent;
    for (let y = 0; y < rows; y++) for (let xx = 0; xx < cols; xx++) {
      const i = y * cols + xx; if (!a[i]) continue;
      const k = i * 4, al = px[k + 3], young = s.age[i] < 3, col = al > 20 ? `rgb(${px[k]},${px[k + 1]},${px[k + 2]})` : acc;
      x.fillStyle = young ? acc : col; x.globalAlpha = young ? 1 : 0.95;
      const cx = xx * cw + cw / 2, cy = y * cw + cw / 2; x.beginPath(); x.roundRect ? x.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.35) : x.rect(cx - r, cy - r, r * 2, r * 2); x.fill();
    }
    x.globalAlpha = 1; return caO;
  }
  // register as filters that act on the lyric layer
  LM.fx.cats.exp = '実験';
  for (const [id, f] of Object.entries(FX)) LM.fx.list[id] = { n: f.n, c: 'exp', k: 'layer' };
  return { apply, has: (id) => !!FX[id], ids: Object.keys(FX) };
})();
