/* Effect catalogue phase 5b — particles (§16 PT-17/19/20/22/23/24/25).
 * A small WebGL point / line renderer draws large particle sets whose positions are computed on the GPU from
 * (particle id, time) — no simulation state, so any frame can be rendered directly:
 *  - Lorenz attractor (150k points, comet head travelling along the orbit, slow 3D turn)        PT-24
 *  - spiral galaxy (140k stars, differential rotation, dust lanes, bright core)                  PT-20
 *  - curl-noise flow (40k streaks advected through a divergence-free field)                     PT-19
 *  - attractor swarm (60k points orbiting moving attractors, beat pulls them in)                PT-22
 * Canvas 2D: plexus network (PT-23), fountain with gravity (PT-17), falling feathers / leaves with flutter (PT-25).
 * Falls back to nothing (the scene stays) if WebGL is not available. */
'use strict';
(() => {
  const U = LM.U, { clamp, lerp, hash, rgba, hex2rgb } = U, BG = LM.bgm.lib, PI = Math.PI, TAU = PI * 2;
  const VS_HEAD = `precision highp float;attribute vec4 a;uniform float T,S,B;uniform vec2 R;uniform vec3 C0,C1,C2;varying vec3 vc;varying float va;
mat3 rY(float t){float c=cos(t),s=sin(t);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);} mat3 rX(float t){float c=cos(t),s=sin(t);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
float h1(float n){return fract(sin(n*12.9898)*43758.5453);}
vec3 g3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float n=i.x+i.y*57.+i.z*113.;
 return mix(mix(mix(vec3(h1(n),h1(n+7.),h1(n+13.)),vec3(h1(n+1.),h1(n+8.),h1(n+14.)),f.x),mix(vec3(h1(n+57.),h1(n+64.),h1(n+70.)),vec3(h1(n+58.),h1(n+65.),h1(n+71.)),f.x),f.y),
 mix(mix(vec3(h1(n+113.),h1(n+120.),h1(n+126.)),vec3(h1(n+114.),h1(n+121.),h1(n+127.)),f.x),mix(vec3(h1(n+170.),h1(n+177.),h1(n+183.)),vec3(h1(n+171.),h1(n+178.),h1(n+184.)),f.x),f.y),f.z)*2.-1.;}
vec4 proj(vec3 p,float fov){float z=p.z+3.2;return vec4(p.x*fov/z*R.y/R.x,p.y*fov/z,0.,1.);} `;
  const FS = `precision highp float;varying vec3 vc;varying float va;uniform float PT;void main(){vec2 q=gl_PointCoord-.5;float d=PT>0.5?1.-smoothstep(.2,.5,length(q)):1.;gl_FragColor=vec4(vc*va*d,va*d);}`;
  const PROGS = {
    lorenz: `void main(){vec3 p=a.xyz;p=rY(T*.16)*rX(.35)*p;vec4 o=proj(p,2.1);gl_Position=o;float z=p.z+3.2;
      float hd=fract(T*.035);float dd=abs(a.w-hd);dd=min(dd,1.-dd);float head=exp(-dd*dd*9000.);
      vc=mix(mix(C1,C0,smoothstep(-.6,.8,p.y)),C2,head*.9);va=(.28+head*1.6+B*.15)*clamp(1.8/z,.3,1.4);gl_PointSize=max(1.,S*(1.3+head*2.2)*2.6/z);}`,
    galaxy: `void main(){float r=a.x,ang=a.y-T*.22/(.18+r)*1.,h=a.z;vec3 p=vec3(cos(ang)*r,h,sin(ang)*r);p=rX(1.05+.06*sin(T*.1))*rY(T*.02)*p;vec4 o=proj(p*1.25,2.2);gl_Position=o;float z=p.z*1.25+3.2;
      float core=exp(-r*r*14.);vc=mix(mix(C1,C0,smoothstep(.05,.7,r)),C2,core);if(a.w>.82)vc*=.25;va=(a.w>.82?.55:.22+core*.8)*clamp(2./z,.4,1.3)*(1.+B*.2);gl_PointSize=max(1.,S*(1.1+core*1.5+(a.w>.97?1.6:0.))*2.4/z);}`,
    curl: `vec3 cu(vec3 p){float e=.08;vec3 dx=vec3(e,0,0),dy=vec3(0,e,0),dz=vec3(0,0,e);
      vec3 px0=g3(p-dx),px1=g3(p+dx),py0=g3(p-dy),py1=g3(p+dy),pz0=g3(p-dz),pz1=g3(p+dz);
      return vec3(py1.z-py0.z-pz1.y+pz0.y,pz1.x-pz0.x-px1.z+px0.z,px1.y-px0.y-py1.x+py0.x)/(2.*e);}
      void main(){float life=4.5,age=fract(T/life+a.x)*life-a.w*.018;vec3 p=vec3(a.y*2.2-1.1,a.z*1.4-.7,h1(a.x*91.)*.6-.3);
      for(int i=0;i<10;i++){p+=cu(p*1.6+vec3(0.,0.,T*.05))*age*.012+vec3(.012,0.,0.)*age;}
      vec4 o=proj(p,2.6);gl_Position=o;float f=smoothstep(0.,.6,age)*(1.-smoothstep(life-1.2,life,age));vc=mix(C0,C1,a.y);va=f*(.95-a.w*.75)*(1.+B*.4);gl_PointSize=S*1.6;}`,
    swarm: `void main(){float k=a.x;vec3 A1=vec3(sin(T*.31)*.8,cos(T*.23)*.45,sin(T*.17)*.4),A2=vec3(cos(T*.27+2.)*.8,sin(T*.19+1.)*.45,cos(T*.13)*.4);
      vec3 c=a.w>.5?A1:A2;float r=(.12+pow(a.y,.6)*.75)*(1.-B*.3);float th=a.z*6.2832+T*(.6+.9/(r+.15))*(a.w>.5?1.:-1.),ph=acos(h1(k*7.)*2.-1.);
      vec3 p=c+r*vec3(sin(ph)*cos(th),cos(ph)*.7,sin(ph)*sin(th));p=rY(T*.05)*p;vec4 o=proj(p,2.2);gl_Position=o;float z=p.z+3.2;
      vc=mix(C0,C1,a.y)*(1.+exp(-r*12.)*.8);va=.42*clamp(2./z,.4,1.3);gl_PointSize=max(1.,S*1.6*2.4/z);}`,
  };
  const N = { lorenz: 150000, galaxy: 140000, curl: 40000, swarm: 60000 };
  let G = null;
  function gl0() {
    if (G !== null) return G;
    try {
      const cv = document.createElement('canvas'), gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
      if (!gl) return (G = false);
      G = { cv, gl, P: {}, B: {} };
    } catch (e) { G = false; }
    return G;
  }
  function data(id) {
    const n = N[id], d = new Float32Array(n * 4);
    if (id === 'lorenz') {
      let x = 0.1, y = 0, z = 0; const dt = 0.0035; for (let i = 0; i < 3000; i++) { const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - (8 / 3) * z; x += dx * dt; y += dy * dt; z += dz * dt; }
      for (let i = 0; i < n; i++) { const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - (8 / 3) * z; x += dx * dt; y += dy * dt; z += dz * dt; d[i * 4] = x / 22; d[i * 4 + 1] = (z - 25) / 22; d[i * 4 + 2] = y / 22; d[i * 4 + 3] = i / n; }
    } else if (id === 'galaxy') {
      for (let i = 0; i < n; i++) { const u = hash(i, 1), arm = Math.floor(hash(i, 2) * 3), r = Math.pow(u, 1.6) * 1.1 + 0.01, sp = (hash(i, 3) - 0.5) * (0.35 + r * 0.25) + (hash(i, 6) - 0.5) * 0.15;
        d[i * 4] = r; d[i * 4 + 1] = arm * TAU / 3 + r * 4.2 + sp; d[i * 4 + 2] = (hash(i, 4) - 0.5) * 0.06 * (1 - r * 0.6) + (hash(i, 7) - 0.5) * 0.02; d[i * 4 + 3] = hash(i, 5); }
    } else if (id === 'curl') {
      // pairs of vertices: head (w=0) and a slightly older copy (w=1) drawn as a line → streak
      for (let i = 0; i < n; i += 2) { const s = hash(i, 1), x = hash(i, 2), y = hash(i, 3); d.set([s, x, y, 0], i * 4); d.set([s, x, y, 1], (i + 1) * 4); }
    } else for (let i = 0; i < n; i++) d.set([hash(i, 1), hash(i, 2), hash(i, 3), hash(i, 4)], i * 4);
    return d;
  }
  function render(id, R) {
    const g = gl0(); if (!g) return null; const gl = g.gl, W = Math.round(R.W), H = Math.round(R.H);
    if (g.cv.width !== W || g.cv.height !== H) { g.cv.width = W; g.cv.height = H; }
    let P = g.P[id];
    if (!P) {
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      try { const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS_HEAD + PROGS[id])); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); P = g.P[id] = { pr, u: {} }; ['T', 'S', 'B', 'R', 'C0', 'C1', 'C2', 'PT'].forEach((k) => (P.u[k] = gl.getUniformLocation(pr, k))); P.a = gl.getAttribLocation(pr, 'a'); }
      catch (e) { console.warn('gpts', id, e.message); g.P[id] = 'bad'; return null; }
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data(id), gl.STATIC_DRAW); P.buf = b;
    }
    if (P === 'bad') return null;
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(P.pr); gl.bindBuffer(gl.ARRAY_BUFFER, P.buf); gl.enableVertexAttribArray(P.a); gl.vertexAttribPointer(P.a, 4, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    const c = (h) => hex2rgb(h).map((v) => v / 255), pal = R.pal;
    gl.uniform1f(P.u.T, R.t); gl.uniform1f(P.u.S, R.S); gl.uniform1f(P.u.B, R.beat || 0); gl.uniform2f(P.u.R, W, H); gl.uniform1f(P.u.PT, id === 'curl' ? 0 : 1);
    gl.uniform3fv(P.u.C0, c(pal.accent)); gl.uniform3fv(P.u.C1, c(pal.sub || pal.accent)); gl.uniform3fv(P.u.C2, c(pal.text));
    if (id === 'curl') gl.drawArrays(gl.LINES, 0, N[id]); else gl.drawArrays(gl.POINTS, 0, N[id]);
    return g.cv;
  }
  const gdef = (id, prog, n, full) => (BG[id] = { n, c: '粒子', full: !!full, gpu3: true, f: (ctx, R) => { const cv = render(prog, R); if (!cv) return; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha *= clamp(R.amt == null ? 1 : R.amt, 0, 1.5); ctx.drawImage(cv, 0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); } });
  gdef('lorenzAttractor', 'lorenz', 'ローレンツ・アトラクタ（15万粒子の軌道）');
  gdef('galaxy', 'galaxy', '渦巻銀河（14万個の星が回る）');
  gdef('curlFlow', 'curl', '流れる粒子（カールノイズの流体）');
  gdef('attractorSwarm', 'swarm', '引き寄せられる粒子の群れ');
  LM.gpts = { render };

  /* ---------- canvas 2D particles ---------- */
  const def = (id, n, f) => (BG[id] = { n, c: '粒子', full: false, f });
  // PT-23 plexus: drifting nodes, links fade with distance, the network tightens on the beat
  def('plexus', 'プレクサス（点と線のネットワーク）', (ctx, R) => {
    const n = 70, pts = [], md = R.minD, t = R.t, link = md * (0.24 + (R.beat || 0) * 0.05);
    for (let i = 0; i < n; i++) pts.push([(hash(i, 1) + 0.07 * Math.sin(t * (0.2 + hash(i, 2) * 0.3) + i)) % 1 * R.W, (hash(i, 3) + 0.07 * Math.cos(t * (0.17 + hash(i, 4) * 0.3) + i * 2)) % 1 * R.H, hash(i, 5)]);
    ctx.save(); ctx.lineWidth = Math.max(1, R.S * 1.5);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], d = Math.hypot(dx, dy); if (d > link) continue; ctx.globalAlpha = Math.pow(1 - d / link, 1.2) * 0.85; ctx.strokeStyle = (i + j) % 3 ? R.pal.sub || R.pal.accent : R.pal.accent; ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke(); }
    pts.forEach(([x, y, h]) => { ctx.globalAlpha = 0.85; ctx.fillStyle = h > 0.85 ? R.pal.text : R.pal.accent; ctx.beginPath(); ctx.arc(x, y, R.S * (2.2 + h * 3), 0, TAU); ctx.fill(); });
    ctx.restore();
  });
  // PT-17 fountain: ballistic particles from the bottom centre, each with its own launch time
  def('fountain', '噴水のように噴き上がる粒子', (ctx, R) => {
    const t = R.t, G0 = R.H * 1.6, life = 1.6, rate = 220, x0 = R.W / 2, y0 = R.H * 1.02;
    ctx.save(); ctx.lineCap = 'round';
    for (let k = Math.floor((t - life) * rate); k <= Math.floor(t * rate); k++) {
      const age = t - k / rate; if (age < 0 || age > life) continue;
      const a = -PI / 2 + (hash(k, 1) - 0.5) * 0.55, v = R.H * (1.45 + hash(k, 2) * 0.35) * (1 + (R.beat || 0) * 0.08), vx = Math.cos(a) * v, vy = Math.sin(a) * v;
      const x = x0 + vx * age, y = y0 + vy * age + 0.5 * G0 * age * age, px = x - vx * 0.04, py = y - (vy + G0 * age) * 0.04;
      ctx.globalAlpha = (1 - age / life) * 0.9; ctx.strokeStyle = hash(k, 3) > 0.7 ? R.pal.text : R.pal.accent; ctx.lineWidth = R.S * (2 + hash(k, 4) * 3); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
    }
    ctx.restore();
  });
  // PT-25 feathers / leaves: flutter (side-to-side glide with a 3D flip) on the way down
  function leaf(ctx, R, kind) {
    const n = 26, t = R.t;
    for (let i = 0; i < n; i++) {
      const sp = 0.06 + hash(i, 1) * 0.05, ph = (t * sp + hash(i, 2)) % 1, y = -R.H * 0.1 + ph * R.H * 1.2, sw = Math.sin(t * (0.9 + hash(i, 3) * 0.7) + i) , x = hash(i, 4) * R.W + sw * R.minD * 0.08;
      const flip = Math.cos(t * (1.3 + hash(i, 5)) + i * 2), rot = sw * 0.9 + hash(i, 6) * TAU, s = R.minD * (0.022 + hash(i, 7) * 0.02);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(Math.max(0.12, Math.abs(flip)), 1); ctx.globalAlpha = 0.85;
      if (kind === 'feather') { ctx.strokeStyle = R.pal.text; ctx.lineWidth = Math.max(1, R.S); ctx.beginPath(); ctx.moveTo(0, -s * 1.6); ctx.lineTo(0, s * 1.6); ctx.stroke(); ctx.fillStyle = rgba(R.pal.text, 0.55); for (let k = -1; k <= 1; k += 2) { ctx.beginPath(); ctx.moveTo(0, -s * 1.5); ctx.quadraticCurveTo(k * s * 0.9, -s * 0.2, 0, s * 1.3); ctx.fill(); } }
      else { const col = flip > 0 ? R.pal.accent : R.pal.sub || R.pal.accent; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -s * 1.4); ctx.quadraticCurveTo(s * 1.1, -s * 0.2, 0, s * 1.4); ctx.quadraticCurveTo(-s * 1.1, -s * 0.2, 0, -s * 1.4); ctx.fill(); ctx.strokeStyle = rgba('#000000', 0.25); ctx.lineWidth = Math.max(0.8, R.S * 0.8); ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(0, s * 1.6); ctx.stroke(); }
      ctx.restore();
    }
  }
  def('feathers', '舞い落ちる羽根', (ctx, R) => leaf(ctx, R, 'feather'));
  def('leaves', 'ひらひら落ちる葉', (ctx, R) => leaf(ctx, R, 'leaf'));

  const D = LM.data, addTo = (id, o) => { const t = D.themeById[id]; if (t) t.bgm = Object.assign({}, t.bgm || {}, o); };
  [['edm', { attractorSwarm: 1, curlFlow: 0.8 }], ['techno', { lorenzAttractor: 1, plexus: 1.2 }], ['vj', { lorenzAttractor: 1.2, curlFlow: 1, attractorSwarm: 1, plexus: 1 }], ['psyche', { curlFlow: 1.2, attractorSwarm: 1 }],
    ['cinematic', { galaxy: 1.2, curlFlow: 0.6 }], ['ambient', { galaxy: 1, curlFlow: 1, feathers: 0.8 }], ['dream', { galaxy: 0.8, feathers: 1, curlFlow: 0.8 }], ['ballad', { feathers: 0.8, galaxy: 0.6 }],
    ['acoustic', { leaves: 1.2 }], ['wa', { leaves: 1 }], ['classical', { feathers: 0.8, galaxy: 0.6 }], ['kids', { fountain: 1 }], ['latin', { fountain: 0.8 }], ['minimal', { plexus: 0.8 }], ['showreel', { plexus: 1, lorenzAttractor: 0.6 }], ['experimental', { lorenzAttractor: 1, attractorSwarm: 1 }]].forEach(([id, o]) => addTo(id, o));
})();
