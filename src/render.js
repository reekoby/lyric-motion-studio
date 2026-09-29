/* Deterministic frame renderer: background → cue layer → overlays → WebGL post */
'use strict';
LM.Renderer = (() => {
  const U = LM.U, E = LM.E, M = LM.motion, FX = LM.fx, D = LM.data;
  const { clamp, lerp, hash, mix, rgba, contrast, readable } = U;
  const PI = Math.PI, TAU = Math.PI * 2;
  // blend modes for the background-motion layer (UI key → canvas globalCompositeOperation)
  // SVG erode filters for faux light weights (quantised radius, created on demand)
  const ERODE = new Set();
  function erodeUrl(r) {
    if (typeof document === 'undefined' || !document.body || r < 0.25) return '';
    const k = Math.max(1, Math.min(24, Math.round(r * 2))), id = 'lmEr' + k;
    if (!ERODE.has(k)) {
      const NS = 'http://www.w3.org/2000/svg';
      let svg = document.getElementById('lmFxDefs');
      if (!svg) { svg = document.createElementNS(NS, 'svg'); svg.id = 'lmFxDefs'; svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true'); svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'; document.body.appendChild(svg); }
      const f = document.createElementNS(NS, 'filter'); f.id = id; f.setAttribute('color-interpolation-filters', 'sRGB');
      const m = document.createElementNS(NS, 'feMorphology'); m.setAttribute('operator', 'erode'); m.setAttribute('radius', String(k / 2));
      f.appendChild(m); svg.appendChild(f); ERODE.add(k);
    }
    return `url(#${id})`;
  }
  const BLEND = { normal: 'source-over', screen: 'screen', lighter: 'lighter', lighten: 'lighten', overlay: 'overlay', 'soft-light': 'soft-light', 'hard-light': 'hard-light', 'color-dodge': 'color-dodge', multiply: 'multiply', darken: 'darken', difference: 'difference', exclusion: 'exclusion', luminosity: 'luminosity', color: 'color' };
  const mk = () => document.createElement('canvas');

  /* ---------- project resolution helpers (shared with UI) ---------- */
  function palOf(p, cue) {
    const sc = (cue && cue.scene) || {};
    let c = null;
    if (cue && cue.colors && cue.colors.length >= 3) c = cue.colors;
    else if (p.colors && p.colors.length >= 3) c = p.colors;
    else {
      const pid = p.autoColors && sc.pal ? sc.pal : p.palette;
      c = (D.palById[pid] || D.palById.ink).c;
    }
    let [bg, text, accent, sub] = c;
    if (!sub) sub = mix(text, accent, 0.45);
    if (sc.invert) [bg, text] = [text, bg];
    if (contrast(accent, bg) < 1.6) accent = readable(bg, [sub, text], 2);
    return { bg, text, accent, sub };
  }
  function tracksOf(cue) {
    const lg = cue.motion ? M.legacy(cue.motion) : {};
    return {
      enter: M.enter[cue.enter] ? cue.enter : lg.enter && M.enter[lg.enter] ? lg.enter : 'fade',
      hold: M.hold[cue.hold] ? cue.hold : lg.hold && M.hold[lg.hold] ? lg.hold : 'none',
      exit: M.exit[cue.exit] ? cue.exit : lg.exit && M.exit[lg.exit] ? lg.exit : 'fadeOut',
    };
  }
  function filtersOf(p, cue) {
    const set = new Map();
    const gi = (p.filterIntensity == null ? 0.6 : p.filterIntensity) / 0.6;
    if (!(cue && cue.noGlobalFilters)) (p.filters || []).forEach((id) => FX.list[id] && set.set(id, gi * ((p.filterAmt && p.filterAmt[id]) ?? 1)));
    if (cue) (cue.filters || []).forEach((id) => FX.list[id] && set.set(id, gi * ((cue.filterAmt && cue.filterAmt[id]) ?? (p.filterAmt && p.filterAmt[id]) ?? 1)));
    return set;
  }
  function fontOf(p, cue) {
    const sc = (cue && cue.scene) || {};
    const id = (cue && cue.font) || p.font || sc.font || 'sans';
    const f = D.fontById[id] || D.fontById.sans;
    const w = p.fontWeight && f.ws.includes(p.fontWeight) ? p.fontWeight : f.w;
    const ital = f.id === 'playfair' ? 'italic ' : '';
    const tmpl = `${ital}${w} {S}px "${f.fam}", ${D.JPF}`;
    // Latin companion (欧文): only when the main face is Japanese
    let latin = null, lf = null;
    const isLatinFace = /^英字/.test(f.cat || '');
    const pick = p.latinFont || 'auto';
    if (!isLatinFace && pick !== 'same') {
      lf = D.fontById[pick === 'auto' ? D.LATIN_PAIR[f.id] : pick] || null;
      if (lf) {
        const ws = lf.ws || [lf.w]; const lw = ws.reduce((b, x) => (Math.abs(x - w) < Math.abs(b - w) ? x : b), ws[0]);
        latin = `${lf.id === 'playfair' ? 'italic ' : ''}${lw} {S}px "${lf.fam}", "${f.fam}", ${D.JPF}`;
      }
    }
    // Hangul companion: when the main face has no Hangul (Japanese / Latin faces)
    let korean = null, kf = null;
    const kpick = p.koreanFont || 'auto';
    if (!/^韓国語/.test(f.cat || '')) {
      kf = D.fontById[kpick === 'auto' ? D.KOR_PAIR(f) : kpick] || null;
      if (kf) { const ws = kf.ws || [kf.w]; const kw = ws.reduce((b, x) => (Math.abs(x - w) < Math.abs(b - w) ? x : b), ws[0]); korean = `${kw} {S}px "${kf.fam}", "${f.fam}", ${D.JPF}`; }
    }
    return { f, tmpl, latin, lf, korean, kf };
  }

  /* timing phases for a cue */
  function snapBeat(d, bpm) {
    const beat = 60 / bpm; let best = d, bd = 1e9;
    for (const m of [0.25, 0.5, 1, 1.5, 2, 3]) { const v = m * beat; const e = Math.abs(Math.log(v / d)); if (e < bd) (bd = e), (best = v); }
    return bd < 0.7 ? best : d;
  }
  function phases(p, cues, i, nGlyph, bpm) {
    const c = cues[i], dur = Math.max(1 / 60, c.end - c.start);
    const tr = tracksOf(c);
    const me = M.enter[tr.enter], mx = M.exit[tr.exit];
    const sp = p.speed || 1;
    const sync = p.tempoSync !== false && bpm > 40;
    let ed = (me.per ? me.d * Math.max(1, nGlyph) : me.d) / sp;
    if (sync && !me.per && me.d > 0.05) ed = snapBeat(ed, bpm);
    if (c.ed > 0) ed = c.ed;
    ed = Math.max(0.001, Math.min(ed, dur * (me.per ? 0.62 : 0.45)));
    let xd = (mx.per ? mx.d * Math.max(1, nGlyph) : mx.d) / sp;
    if (sync && !mx.per && mx.d > 0.05) xd = snapBeat(xd, bpm);
    if (c.xd > 0) xd = c.xd;
    xd = Math.min(xd, dur * 0.4, c.xd > 0 ? 3 : 0.9);
    const next = cues[i + 1];
    const gap = next ? Math.max(0, next.start - c.end) : 0.6;
    const tail = Math.min(gap, xd * 0.6);
    return { dur, ed, xd, tail, exitStart: c.end + tail - xd, vEnd: c.end + tail, tr };
  }

  /* ---------------- WebGL post ---------------- */
  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}';
  const FS = `precision highp float;varying vec2 v;
uniform sampler2D T0,T1,T2,T3;uniform vec2 R;uniform float time,seed,S;
uniform float rgb,glitch,block,vhs,scan,noise,vig,pix,poster,half_,bloom,inv,blurMix,zblur,crt,chrom,duo,dither,sepia,heat,hue,tilt,mirror,fish,trgb,psort,slice,liquid,thermal,mono,monoInv,quad,bzoom,lineart;
uniform vec3 duoA,duoB,grade,bgc;uniform vec4 key;uniform vec2 mblur;
float h1(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float b2(vec2 p){p=floor(mod(p,2.0));return mod(2.0*p.x+3.0*p.y,4.0);}
void main(){
 vec2 u=v;
 if(mirror>0.5&&u.x>0.5)u.x=1.0-u.x;
 if(quad>0.5){u=abs(u-0.5)+0.25;}
 if(bzoom>0.0)u=(u-0.5)*(1.0-bzoom)+0.5;
 if(fish>0.0){vec2 c=u-0.5;float r2=dot(c,c);u=0.5+c*(1.0-fish*0.7*r2)/(1.0-fish*0.7*0.25);}
 if(crt>0.0){vec2 cc=u*2.0-1.0;cc*=1.0+crt*0.09*vec2(cc.y*cc.y,cc.x*cc.x);u=cc*0.5+0.5;}
 if(liquid>0.0){u.x+=sin(u.y*9.0+time*2.6)*0.014*liquid+sin(u.y*23.0-time*3.4)*0.005*liquid;u.y+=sin(u.x*7.0+time*2.1)*0.012*liquid;}
 if(slice>0.0){float sb=floor(u.y*7.0);float sd=mod(sb,2.0)*2.0-1.0;u.x=fract(u.x+sd*slice*0.09*(0.45+h1(vec2(sb,floor(time*2.0)+seed))));}
 if(psort>0.0){float row=floor(u.y*R.y/(5.0*S));float st=floor(time*10.0);if(h1(vec2(row*0.37,st+seed))<psort*0.5){float ax=h1(vec2(row,st+3.0));float ln=0.1+0.55*h1(vec2(row,st+7.0));if(u.x>ax&&u.x<ax+ln)u.x=ax+(u.x-ax)*0.03;}}
 if(heat>0.0)u.x+=sin(u.y*38.0+time*5.0)*0.0025*heat+sin(u.y*91.0-time*7.0)*0.001*heat;
 if(vhs>0.0){u.x+=(h1(vec2(floor(u.y*R.y/(3.0*S)),floor(time*30.0)))-0.5)*0.003*vhs+sin(u.y*9.0+time*2.0)*0.0012*vhs;
  float tb=fract(u.y-time*0.13);if(tb<0.018)u.x+=(h1(vec2(u.y*50.0,time))-0.5)*0.03*vhs;}
 if(block>0.0){vec2 b=floor(u*vec2(10.0,22.0));float r=h1(b+floor(time*15.0)+seed);if(r<block*0.25)u.x+=(h1(b+2.0)-0.5)*0.2*block;}
 if(glitch>0.0){float ln=floor(u.y*70.0);float r=h1(vec2(ln,floor(time*24.0)+seed));if(r<glitch*0.3)u.x+=(h1(vec2(ln,7.0))-0.5)*0.12*glitch;}
 if(pix>0.5){vec2 px=vec2(pix)/R;u=(floor(u/px)+0.5)*px;}
 float rs=(rgb+glitch*8.0*S+block*6.0*S)/R.x;vec2 d=vec2(rs,0.0);
 if(chrom>0.0)d+=(u-0.5)*chrom*0.012;
 vec4 cg=texture2D(T0,u);vec4 col=cg;
 if(length(d)>0.00001){vec4 cr=texture2D(T0,u+d),cb=texture2D(T0,u-d);col=vec4(cr.r,cg.g,cb.b,max(cg.a,max(cr.a,cb.a)));}
 if(trgb>0.0){vec4 p1=texture2D(T2,u),p2=texture2D(T3,u);col.g=mix(col.g,p1.g,trgb);col.b=mix(col.b,p2.b,trgb);col.a=max(col.a,max(p1.a,p2.a)*trgb);}
 if(zblur>0.0){vec4 acc=col;for(int i=1;i<12;i++){float k=1.0-float(i)*0.011*zblur;acc+=texture2D(T0,(u-0.5)*k+0.5);}col=acc/12.0;}
 if(length(mblur)>0.0001){vec4 acc=col;for(int i=1;i<16;i++){float k=float(i)/15.-.5;acc+=texture2D(T0,u+mblur*k);}col=acc/16.;}
 if(blurMix>0.0||tilt>0.0){vec4 bl=texture2D(T1,u);float m=blurMix;if(tilt>0.0)m=max(m,smoothstep(0.12,0.42,abs(u.y-0.5))*tilt);col=mix(col,bl,clamp(m,0.0,1.0));}
 if(bloom>0.0){vec4 bl=texture2D(T1,u);col.rgb+=bl.rgb*bloom;col.a=max(col.a,bl.a*bloom*0.7);}
 float a=clamp(col.a,0.0,1.0);vec3 c=a>0.001?col.rgb/a:vec3(0.0);
 if(lineart>0.0){vec2 px=vec2(max(1.0,S*1.5))/R;float l0=dot(texture2D(T0,u).rgb,vec3(.299,.587,.114));float gx=dot(texture2D(T0,u+vec2(px.x,0.)).rgb-texture2D(T0,u-vec2(px.x,0.)).rgb,vec3(.333));float gy=dot(texture2D(T0,u+vec2(0.,px.y)).rgb-texture2D(T0,u-vec2(0.,px.y)).rgb,vec3(.333));float e=clamp(length(vec2(gx,gy))*3.0,0.0,1.0);c=mix(c,mix(duoA,duoB,e),lineart);}
 if(mono>0.0){float vv=max(c.r,max(c.g,c.b)),vb=max(bgc.r,max(bgc.g,bgc.b));float m=step(0.35,max(abs(vv-vb),distance(c,bgc)*0.5));if(monoInv>0.5)m=1.0-m;c=mix(c,vec3(m),mono);}
 if(inv>0.0)c=mix(c,1.0-c,inv);
 c=(c-0.5)*grade.x+0.5+grade.z;float l=dot(c,vec3(0.299,0.587,0.114));c=mix(vec3(l),c,grade.y);
 if(sepia>0.0){vec3 sp=vec3(dot(c,vec3(.393,.769,.189)),dot(c,vec3(.349,.686,.168)),dot(c,vec3(.272,.534,.131)));c=mix(c,sp*0.9+vec3(0.04,0.02,0.0),sepia);}
 if(hue!=0.0){float Y=dot(c,vec3(.299,.587,.114));float I=dot(c,vec3(.596,-.274,-.322));float Q=dot(c,vec3(.211,-.523,.312));float hh=atan(Q,I)+hue;float ch=sqrt(I*I+Q*Q);I=ch*cos(hh);Q=ch*sin(hh);c=vec3(Y+.956*I+.621*Q,Y-.272*I-.647*Q,Y-1.106*I+1.703*Q);}
 if(duo>0.0){float L=dot(c,vec3(.299,.587,.114));c=mix(c,mix(duoA,duoB,smoothstep(0.05,0.95,L)),duo);}
 if(thermal>0.0){float L=dot(c,vec3(.299,.587,.114));vec3 hm=L<0.25?mix(vec3(0.03,0.0,0.14),vec3(0.38,0.02,0.62),L*4.0):L<0.5?mix(vec3(0.38,0.02,0.62),vec3(0.96,0.12,0.28),(L-0.25)*4.0):L<0.75?mix(vec3(0.96,0.12,0.28),vec3(1.0,0.66,0.05),(L-0.5)*4.0):mix(vec3(1.0,0.66,0.05),vec3(1.0,1.0,0.86),(L-0.75)*4.0);c=mix(c,hm,thermal);}
 if(poster>0.5)c=floor(c*poster+0.5)/poster;
 if(half_>0.5){float ang=0.785;mat2 m=mat2(cos(ang),-sin(ang),sin(ang),cos(ang));vec2 pp=m*gl_FragCoord.xy/half_;vec2 f=fract(pp)-0.5;float L=dot(c,vec3(.299,.587,.114));float r=sqrt(clamp(1.0-L,0.0,1.0))*0.66;float dm=1.0-smoothstep(r-0.07,r+0.07,length(f));c=mix(min(c*1.18+0.04,vec3(1.0)),c*0.3,dm);}
 if(dither>0.0){vec2 q=floor(gl_FragCoord.xy/max(1.0,S*2.0));float bay=(4.0*b2(q)+b2(floor(q/2.0))+0.5)/16.0;c=mix(c,step(vec3(bay),c),dither);}
 if(scan>0.0)c*=1.0-scan*0.4*step(0.5,fract(gl_FragCoord.y/max(2.0,3.0*S)));
 if(vhs>0.0){c=mix(c,vec3(dot(c,vec3(0.33))),0.12*vhs);c+=(h1(u*R+time)-0.5)*0.07*vhs;c.r+=0.03*vhs*sin(u.y*R.y*0.5);}
 if(noise>0.0)c+=(h1(u*R+fract(time*7.13)*100.0)-0.5)*0.16*noise;
 if(vig>0.0){float dd=distance(v,vec2(0.5));c*=1.0-smoothstep(0.3,0.85,dd)*vig;}
 if(crt>0.0&&(u.x<0.0||u.x>1.0||u.y<0.0||u.y>1.0)){c=vec3(0.0);if(key.a<0.5&&key.b<-0.5)a=0.0;}
 c=clamp(c,0.0,1.0);
 if(key.a>0.5)gl_FragColor=vec4(mix(key.rgb,c,a),1.0);else gl_FragColor=vec4(c*a,a);
}`;
  const UNI = ['rgb', 'glitch', 'block', 'vhs', 'scan', 'noise', 'vig', 'pix', 'poster', 'half_', 'bloom', 'inv', 'blurMix', 'zblur', 'crt', 'chrom', 'duo', 'dither', 'sepia', 'heat', 'hue', 'tilt', 'mirror', 'fish', 'trgb', 'psort', 'slice', 'liquid', 'thermal', 'mono', 'monoInv', 'quad', 'bzoom', 'lineart'];

  class Renderer {
    constructor(opt = {}) {
      this.out = opt.canvas || mk();
      this.scene = mk(); this.sctx = this.scene.getContext('2d');
      this.layer = mk(); this.lctx = this.layer.getContext('2d');
      this.tmp = mk(); this.tctx = this.tmp.getContext('2d');
      this.blurC = mk(); this.bctx = this.blurC.getContext('2d');
      this.prev = [mk(), mk()];
      this.layoutCache = new Map();
      this.fontCache = new Map();
      this.images = opt.images || {};
      this.audio = opt.audio || null; // {analysis, spectrum(t), waveAt(t)}
      this.gl = null;
      this.useGL = opt.gl !== false && this.initGL();
      if (!this.useGL) this.octx = this.out.getContext('2d');
      this.setSize(opt.W || 1920, opt.H || 1080);
    }
    initGL() {
      try {
        const gl = this.out.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
        if (!gl) return false;
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        gl.useProgram(pr);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        this.tex = [0, 1, 2, 3].map((i) => {
          const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
          gl.uniform1i(gl.getUniformLocation(pr, 'T' + i), i);
          return t;
        });
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        this.u = {};
        UNI.concat(['R', 'time', 'seed', 'S', 'duoA', 'duoB', 'grade', 'bgc', 'key', 'mblur']).forEach((n) => (this.u[n] = gl.getUniformLocation(pr, n)));
        this.gl = gl; this.prog = pr;
        return true;
      } catch (e) {
        console.warn('WebGL post disabled:', e);
        return false;
      }
    }
    setSize(W, H) {
      W = Math.max(2, Math.round(W)); H = Math.max(2, Math.round(H));
      if (this.W === W && this.H === H) return;
      this.W = W; this.H = H; this.S = Math.min(W, H) / 1080; this.minD = Math.min(W, H);
      [this.out, this.scene, this.layer, this.tmp, ...this.prev].forEach((c) => { c.width = W; c.height = H; });
      this.blurC.width = Math.max(2, Math.round(W / 4)); this.blurC.height = Math.max(2, Math.round(H / 4));
      this.layoutCache.clear();
      if (this.gl) this.gl.viewport(0, 0, W, H);
    }
    setProject(p) {
      if (this.p !== p) this.layoutCache.clear();
      this.p = p;
      this.cues = (p.cues || []).slice().sort((a, b) => a.start - b.start);
    }
    invalidate() { this.layoutCache.clear(); this.fontCache.clear(); }

    /* ---------- layout (cached) ---------- */
    getLayout(cue, idx) {
      const p = this.p, sc = cue.scene || {};
      const F = fontOf(p, cue);
      const fl = filtersOf(p, cue);
      const zoom = fl.has('zoom') ? 1.35 + 0.2 * Math.min(2, (p.filterIntensity ?? 0.6) * (fl.get('zoom') || 1)) : 1;
      const lay = LM.layout.lib[sc.layout] ? sc.layout : 'center';
      const scale = (p.textScale || 1) * (cue.textScale || 1);
      const tAdj = +cue.trackAdj || 0, lAdj = cue.latinTrackAdj != null ? +cue.latinTrackAdj : tAdj;
      const TO = { latin: F.latin, korean: F.korean, latinScale: p.latinScale || 1, wakan: p.wakan !== false, yakumono: p.yakumono !== false, latinTrack: (+p.latinTrack || 0) + lAdj, wordSpace: (p.wordSpace || 1) * (cue.wordSpaceAdj || 1), wakanGap: p.wakanGap != null ? +p.wakanGap : 25, yakuAmt: p.yakuAmt != null ? +p.yakuAmt : 1 };
      LM.typo.setOpts(TO);
      const key = [cue.id, cue.text, lay, F.tmpl, F.latin, F.korean, TO.latinScale, TO.wakan, TO.yakumono, TO.latinTrack, TO.wordSpace, TO.wakanGap, TO.yakuAmt, this.W, this.H, scale, zoom, (p.tracking || 0) + tAdj, p.showCredits ? 1 : 0, sc.variant || 0].join('|');
      let Lc = this.layoutCache.get(key);
      if (Lc) return Lc;
      const W = this.W, H = this.H, minD = this.minD;
      const mx = W * (W > H ? 0.075 : 0.085), myT = H * 0.075, myB = H * 0.075 + (p.showCredits ? minD * 0.07 : 0);
      const safe = { x: mx, y: myT, w: W - mx * 2, h: H - myT - myB };
      const parsed = LM.typo.parse(cue.text);
      const ctx = { W, H, S: this.S, minD, font: F.tmpl, lh: 1.2, track: (p.tracking || 0) + tAdj, emphScale: zoom, scale, safe, cy: safe.y + safe.h / 2, maxLines: 4 };
      const rng = U.rng(U.strHash(cue.id + ':' + (sc.variant || 0)));
      let res;
      try { res = LM.layout.lib[lay].f(ctx, parsed, rng); } catch (e) { console.warn('layout error', lay, e); res = LM.layout.lib.center.f(ctx, parsed, rng); }
      // finalize glyphs
      let gl = res.glyphs.filter((g) => !g.space && !/^\s+$/.test(g.ch));
      let wIdx = -1, lastKey = null;
      const seedK = U.strHash(cue.id);
      gl.forEach((g, i) => {
        const wk = g.line + ':' + (g.tok ?? i);
        if (wk !== lastKey) { wIdx++; lastKey = wk; }
        g.wordIdx = wIdx; g.i = i; g.k = i;
        g.r1 = hash(seedK, i, 1); g.r2 = hash(seedK, i, 2); g.r3 = hash(seedK, i, 3);
        g.w = g.w || g.size;
        if (g.ft === undefined && F.latin && LM.typo.isLatinCh(g.ch)) g.ft = F.latin;
      });
      const bb = LM.layout.bbox(gl);
      gl.forEach((g) => (g.xn = bb.w ? (g.x - bb.x) / bb.w : 0.5));
      Lc = { glyphs: gl, lines: res.lines || [], decos: res.decos || [], ghosts: res.ghosts || [], bbox: bb, words: wIdx + 1, font: F, lay, drift: res.drift || 0, seq: res.seq || null, track: res.track || null };
      const kg = gl.filter((g) => g.emph || g.key); Lc.keyBB = kg.length ? LM.layout.bbox(kg) : null;
      if (Lc.seq) { Lc.seqK = []; for (let k = 0; k < Lc.seq.n; k++) { const sg = gl.filter((g) => g.seq === k); Lc.seqK.push(sg.length ? Math.min(...sg.map((g) => g.k)) : 0); } }
      if (Lc.seq) { Lc.seqBB = []; for (let k = 0; k < Lc.seq.n; k++) { const sg = gl.filter((g) => g.seq === k); Lc.seqBB.push(sg.length ? LM.layout.bbox(sg) : bb); } }
      Lc.rE = {}; Lc.rX = {};
      this.layoutCache.set(key, Lc);
      if (this.layoutCache.size > 400) this.layoutCache.delete(this.layoutCache.keys().next().value);
      return Lc;
    }
    fontStr(tmpl, size) { return tmpl.replace('{S}', size.toFixed(2)); }

    bpm() { const p = this.p; if (p.bpm > 0) return p.bpm; const an = this.audio && this.audio.analysis; return an && an.bpm ? an.bpm : 0; }
    tempo() { const b = this.bpm(); return this.p.tempoSync !== false && b > 40 ? clamp(b / 120, 0.6, 1.6) : 1; }
    bgmOf(c) {
      const p = this.p || {};
      if (c && Array.isArray(c.bgm)) return c.bgm;
      if (p.autoBgm && c && c.scene && Array.isArray(c.scene.bgm)) return c.scene.bgm;
      return Array.isArray(p.bgm) ? p.bgm : [];
    }
    drawBgm(ctx, t, beat, pal, cur, prevCue, transparent) {
      const p = this.p, list = this.bgmOf(cur ? cur.c : null);
      const prevList = prevCue ? this.bgmOf(prevCue) : list;
      const lt = cur ? t - cur.c.start : 9;
      const fade = prevList.join() !== list.join() ? clamp(lt / 0.5) : 1;
      const needSpec = list.concat(prevList).some((id) => id === 'eqBars' || id === 'circleSpectrum' || (LM.bgm.lib[id] && LM.bgm.lib[id].spec));
      const needWave = list.concat(prevList).some((id) => LM.bgm.lib[id] && LM.bgm.lib[id].wave);
      const au = this.bands(t);
      const R = { W: this.W, H: this.H, S: this.S, minD: this.minD, t, pal, beat: p.beatSync === false ? 0 : beat, bass: au.bass, mid: au.mid, high: au.high, spec: needSpec && this.audio && this.audio.spectrum ? this.audio.spectrum(t) : null, wave: needWave && this.audio && this.audio.waveAt ? this.audio.waveAt(t, 160) : null, bpm: this.bpm() || 120, title: p.title || '', text: cur ? String(cur.c.text).replace(/[|｜]([^《|｜]+)《[^》]*》/g, '$1').replace(/《[^》]*》/g, '').replace(/[*]/g, '').replace(/\s*\/\s*/g, ' ') : '' };
      const cfg = { amt: p.bgmAmt == null ? 1 : p.bgmAmt, speed: (p.bgmSpeed || 1) * this.tempo() };
      const run = (ids, a) => { if (a <= 0.01) return; ids.forEach((id) => {
        const b = LM.bgm.lib[id]; if (!b || ((transparent || this.imgActive) && b.full)) return;
        ctx.save(); ctx.globalAlpha = a;
        if (b.gpu) {
          if (!this.sbg) this.sbg = new LM.shaderbg.ShaderBG();
          const sc = this.shaderScale || (this.W > 1400 ? 0.6 : 0.75);
          const cv = this.sbg.render(b.gpu, Math.max(8, Math.round(this.W * sc)), Math.max(8, Math.round(this.H * sc)), t * cfg.speed, pal, Object.assign({}, au, { beat: R.beat }));
          if (cv) { ctx.globalAlpha = a * clamp(cfg.amt, 0, 1); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(cv, 0, 0, this.W, this.H); const dim = p.bgmDim == null ? 0.22 : p.bgmDim; if (dim > 0) { ctx.globalAlpha = a * dim; ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, this.W, this.H); } }
        } else LM.bgm.draw(id, ctx, R, cfg);
        ctx.restore(); }); };
      if (fade < 1) run(prevList, 1 - fade);
      run(list, fade);
    }

    /* ---------- instrumental (no-lyric) sections: intro / interlude / outro ---------- */
    gaps() {
      const cs = this.cues, p = this.p, key = cs.map((c) => c.start.toFixed(3) + ':' + c.end.toFixed(3)).join('|') + '|' + p.duration + '|' + (p.gapMin || 1.2);
      if (this._gapK === key) return this._gaps;
      const out = [], min = p.gapMin || 1.2, dur = p.duration || 0;
      let prevEnd = 0, prevI = -1;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (c.start - prevEnd >= min) out.push({ t0: prevEnd, t1: c.start, next: i, prev: prevI, kind: prevI < 0 ? 'intro' : 'inter' });
        const L = this.getLayout(c, i), ph = phases(p, cs, i, L.glyphs.length, this.bpm());
        prevEnd = Math.max(prevEnd, ph.vEnd); prevI = i;
      }
      if (dur - prevEnd >= min) out.push({ t0: prevEnd, t1: dur, next: -1, prev: prevI, kind: cs.length ? 'outro' : 'intro' });
      if (!cs.length && dur > 0) { out.length = 0; out.push({ t0: 0, t1: dur, next: -1, prev: -1, kind: 'intro' }); }
      out.forEach((g, k) => { g.k = k; const sec = LM.model.sectionAt(p, (g.t0 + g.t1) / 2); if (sec && ['intro', 'inter', 'outro', 'bridge', 'C'].includes(sec.type)) g.sec = sec.type; });
      this._gapK = key; this._gaps = out; return out;
    }
    gapAt(t) { for (const g of this.gaps()) if (t >= g.t0 && t < g.t1) return g; return null; }
    // stable id of a gap: the lyric line that follows it (or 'end' for the outro)
    gapKey(g) { const c = g && g.next >= 0 ? this.cues[g.next] : null; return c ? 'n:' + c.id : 'end'; }
    // effective settings for an instrumental section: global gap settings, then this section's own overrides
    gapCfg(g) {
      const p = this.p, ov = (p.gapOv && g && p.gapOv[this.gapKey(g)]) || {};
      const c = {
        fill: p.gapFill || 'auto', bgm: Array.isArray(p.gapBgm) ? p.gapBgm : [], opacity: p.gapOpacity, blend: p.gapBlend,
        amt: p.gapAmt == null ? 1.2 : p.gapAmt, speed: p.gapSpeed == null ? 1.12 : p.gapSpeed, cam: p.gapCam == null ? 1 : p.gapCam,
        every: p.gapEvery == null ? 'auto' : p.gapEvery, flash: p.gapFlash == null ? 1 : p.gapFlash,
        vis: p.gapVisual === false ? 'none' : p.gapVisStyle || 'auto', visAmt: p.gapVisAmt == null ? 1 : p.gapVisAmt,
        label: p.gapLabel !== false, labelText: '', countdown: !!p.gapCountdown, progress: p.gapProgress !== false,
      };
      for (const k of Object.keys(c)) if (ov[k] !== undefined && ov[k] !== null) c[k] = ov[k];
      return c;
    }
    // time of a bar downbeat (bar "1") and bar length — for bar-synced scene changes
    barGrid() {
      const p = this.p, an = this.audio && this.audio.analysis, bpm = this.bpm() || 120, bar = (60 / bpm) * 4;
      if (p.bpm > 0) return { t0: p.beatOffset || 0, bar };
      if (an && an.beats && an.beats.length) return { t0: an.beats[Math.min(an.beats.length - 1, an.downbeat || 0)], bar };
      return { t0: 0, bar };
    }
    // which background scenes play in a gap: rotate every bar-aligned segment, tone-matched to the theme
    gapPlan(g) {
      const p = this.p, B = LM.bgm.lib, cf = this.gapCfg(g);
      const bpm = this.bpm() || 120, bar = (60 / bpm) * 4;
      const seg = cf.every === 'auto' || cf.every == null ? bar * (g.t1 - g.t0 > bar * 12 ? 4 : 2) : +cf.every > 0 ? bar * +cf.every : Math.max(1, g.t1 - g.t0 + bar);
      const visOf = () => (cf.vis && cf.vis !== 'auto' ? cf.vis : this.gapVisOf());
      let pool = [];
      if (cf.bgm.length) pool = cf.bgm.filter((id) => B[id]);
      else if (cf.fill === 'continue' || (!p.autoBgm && p.bgm && p.bgm.length)) {
        const c = this.cues[g.prev >= 0 ? g.prev : g.next]; pool = c ? this.bgmOf(c).slice() : (p.bgm || []).slice();
        if (!pool.length) pool = (p.bgm || []).slice();
        return { seg, lists: [pool.filter((id) => B[id])], vis: visOf(), cf };
      } else {
        const th = LM.data.themeById[p.theme] || {}, w = LM.imgFirst && LM.imgFirst.active(p) && this.imgActive ? LM.imgFirst.pool(th.bgm) : th.bgm || {};
        pool = Object.keys(w).filter((id) => B[id]).sort((a, b) => (w[b] || 0) - (w[a] || 0));
        if (!pool.length) pool = ['gl_mesh', 'gl_grainGrad', 'particles', 'gl_warp'].filter((id) => B[id]);
      }
      const seed = (p.seed || 1) * 131 + g.k * 17, lists = [];
      const full = pool.filter((id) => B[id].full), light = pool.filter((id) => !B[id].full);
      const n = Math.max(1, Math.min(6, Math.ceil((g.t1 - g.t0) / seg)));
      for (let k = 0; k < n; k++) {
        const L = [];
        if (full.length) { let fi = Math.floor(hash(seed, k, 3) * full.length); if (k && full.length > 1 && lists[k - 1][0] === full[fi]) fi = (fi + 1) % full.length; L.push(full[fi]); }
        if (light.length && (hash(seed, k, 5) < 0.75 || !L.length)) L.push(light[Math.floor(hash(seed, k, 7) * light.length)]);
        if (!L.length && pool.length) L.push(pool[k % pool.length]);
        lists.push(L);
      }
      return { seg, lists, vis: visOf(), cf };
    }
    gapVisOf() {
      const id = (this.p.theme || '');
      if (/vj|edm|thermal|edge|vocaloid|metal|rock|hiphop/.test(id)) return 'spectrum';
      if (/ballad|ambient|cinematic|artistmv|acoustic|wa|dream|lofi/.test(id)) return 'title';
      return 'marquee';
    }
    bgmLayer(ctx, ids, a, t, beat, pal, transparent, boost = {}) {
      const p = this.p; if (a <= 0.01) return;
      const au = this.bands(t);
      const needSpec = ids.some((id) => id === 'eqBars' || id === 'circleSpectrum' || (LM.bgm.lib[id] && LM.bgm.lib[id].spec));
      const needWave = ids.some((id) => LM.bgm.lib[id] && LM.bgm.lib[id].wave);
      const R = { W: this.W, H: this.H, S: this.S, minD: this.minD, t, pal, beat: p.beatSync === false ? 0 : beat, bass: au.bass, mid: au.mid, high: au.high, spec: needSpec && this.audio && this.audio.spectrum ? this.audio.spectrum(t) : null, wave: needWave && this.audio && this.audio.waveAt ? this.audio.waveAt(t, 160) : null, bpm: this.bpm() || 120, title: p.title || '', text: boost.text || p.title || '' };
      const cfg = { amt: (p.bgmAmt == null ? 1 : p.bgmAmt) * (boost.amt || 1), speed: (p.bgmSpeed || 1) * this.tempo() * (boost.speed || 1) };
      ids.forEach((id) => {
        const b = LM.bgm.lib[id]; if (!b || ((transparent || this.imgActive) && b.full)) return;
        ctx.save(); ctx.globalAlpha = a;
        if (b.gpu) {
          if (!this.sbg) this.sbg = new LM.shaderbg.ShaderBG();
          const sc = this.shaderScale || (this.W > 1400 ? 0.6 : 0.75);
          const cv = this.sbg.render(b.gpu, Math.max(8, Math.round(this.W * sc)), Math.max(8, Math.round(this.H * sc)), t * cfg.speed, pal, Object.assign({}, au, { beat: R.beat }));
          if (cv) { ctx.globalAlpha = a * clamp(cfg.amt, 0, 1); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(cv, 0, 0, this.W, this.H); const dim = boost.dim != null ? boost.dim : p.bgmDim == null ? 0.22 : p.bgmDim; if (dim > 0) { ctx.globalAlpha = a * dim; ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, this.W, this.H); } }
        } else LM.bgm.draw(id, ctx, R, cfg);
        ctx.restore();
      });
    }
    drawGapScene(ctx, t, beat, pal, g, transparent) {
      const p = this.p, plan = this.gapPlan(g), W = this.W, H = this.H;
      const lt = t - g.t0, BG = this.barGrid();
      // scene boundaries land on real downbeats (every 2 or 4 bars)
      const segIdx = (x) => Math.floor((x - BG.t0) / plan.seg + 1e-6);
      const si = Math.max(0, Math.min(plan.lists.length - 1, segIdx(t) - segIdx(g.t0))), sl = si > 0 ? ((t - BG.t0) % plan.seg + plan.seg) % plan.seg : lt;
      const cur = plan.lists[si] || [], prev = si > 0 ? plan.lists[si - 1] : null;
      // what was playing under the last lyric, so the gap fades in from it
      const before = g.prev >= 0 ? this.bgmOf(this.cues[g.prev]) : [];
      const inK = clamp(lt / 0.8), outK = clamp((g.t1 - t) / 0.45), xf = prev ? clamp(sl / 0.5) : 1;
      const cf = plan.cf || this.gapCfg(g);
      const boost = { amt: cf.amt, speed: cf.speed, dim: Math.min(p.bgmDim == null ? 0.22 : p.bgmDim, 0.06) };
      // bar-synced camera: slow push + beat punch on the background only
      const bpm = this.bpm() || 120, bar = (60 / bpm) * 4;
      const cam = clamp(+cf.cam || 0, 0, 3);
      const z = 1 + cam * (0.04 * clamp(sl / plan.seg) + (p.beatSync === false ? 0 : beat * 0.018)), rot = Math.sin(lt * 0.15) * 0.01 * cam;
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.rotate(rot); ctx.translate(-W / 2, -H / 2);
      if (inK < 1 && before.length) this.bgmLayer(ctx, before, 1 - inK, t, beat, pal, transparent);
      if (prev && xf < 1) this.bgmLayer(ctx, prev, (1 - xf) * inK, t, beat, pal, transparent, boost);
      this.bgmLayer(ctx, cur, xf * inK * (0.35 + 0.65 * outK), t, beat, pal, transparent, boost);
      ctx.restore();
      // scene-change hit on the bar
      if (prev && sl < 0.12 && !transparent && cf.flash > 0) { ctx.save(); ctx.globalAlpha = (1 - sl / 0.12) * 0.35 * clamp(cf.flash, 0, 2); ctx.fillStyle = pal.accent; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      this._gapInfo = { g, si, sl, seg: plan.seg, bar, vis: plan.vis, cf };
    }
    // foreground for instrumental parts: audio-reactive ring / section typography / countdown into the next line
    drawGapFx(ctx, t, beat, pal, g) {
      const p = this.p, W = this.W, H = this.H, S = this.S, md = this.minD, info = this._gapInfo || { vis: this.gapVisOf(), sl: t - g.t0 };
      const cf = (info.g === g && info.cf) || this.gapCfg(g);
      const lt = t - g.t0, len = g.t1 - g.t0, fin0 = clamp(lt / 0.7) * clamp((g.t1 - t) / 0.5), fin = fin0 * clamp(cf.visAmt == null ? 1 : +cf.visAmt, 0, 1);
      if (fin0 <= 0.01) return;
      const vis = cf.vis && cf.vis !== 'auto' ? cf.vis : info.vis || this.gapVisOf();
      const LBL = { intro: 'INTRO', inter: 'INTERLUDE', outro: 'OUTRO', bridge: 'BRIDGE', C: 'BRIDGE' };
      const label = !cf.label ? '' : String(cf.labelText || '').trim().slice(0, 40) || LBL[g.sec || g.kind] || 'INSTRUMENTAL', title = (p.title || '').trim(), artist = (p.artist || '').trim();
      if (vis !== 'none' && fin > 0.01) {
      const F = (w, px) => `${w} ${px.toFixed(1)}px "Anton","Archivo Black","Bebas Neue","Noto Sans JP",sans-serif`;
      ctx.save(); ctx.globalAlpha = fin;
      if (vis === 'spectrum') {
        const sp = this.audio && this.audio.spectrum ? this.audio.spectrum(t) : null, n = 64, r0 = md * (0.16 + beat * 0.012);
        ctx.translate(W / 2, H / 2); ctx.rotate(lt * 0.12);
        for (let i = 0; i < n; i++) {
          const v = sp ? sp[Math.floor((i < n / 2 ? i : n - 1 - i) / (n / 2) * (sp.length - 1))] : 0.3 + 0.3 * Math.abs(Math.sin(i * 0.7 + t * 4)) * (0.5 + beat);
          const a = (i / n) * TAU, len2 = md * (0.02 + v * 0.16);
          ctx.save(); ctx.rotate(a); ctx.fillStyle = i % 2 ? pal.accent : pal.text; ctx.globalAlpha = fin * (0.55 + v * 0.45); ctx.fillRect(-S * 2.2, r0, S * 4.4, len2); ctx.restore();
        }
        ctx.globalAlpha = fin; ctx.strokeStyle = pal.accent; ctx.lineWidth = S * (2 + beat * 5); ctx.beginPath(); ctx.arc(0, 0, r0 * 0.86, 0, TAU); ctx.stroke();
        ctx.rotate(-lt * 0.12); ctx.fillStyle = pal.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; if (label) { ctx.font = F(900, md * 0.045); ctx.fillText(label, 0, -md * 0.012); }
        if (title) { ctx.font = F(label ? 600 : 800, md * (label ? 0.022 : 0.03)); ctx.globalAlpha = fin * 0.8; ctx.fillText(title.toUpperCase(), 0, label ? md * 0.04 : 0); }
      } else if (vis === 'marquee') {
        const txt = [title, label].filter(Boolean).join(' — ') + ' — ', rows = 5, h = H / rows;
        ctx.textBaseline = 'middle'; ctx.lineWidth = Math.max(1, h * 0.012);
        for (let i = 0; i < rows; i++) {
          ctx.font = F(900, h * 0.78); const uw = Math.max(1, ctx.measureText(txt).width), off = ((lt * S * (90 + i * 30) * (i % 2 ? 1 : -1)) % uw + uw) % uw;
          ctx.globalAlpha = fin * (i === 2 ? 0.9 : 0.28);
          for (let x = -off; x < W; x += uw) { if (i === 2) { ctx.fillStyle = pal.accent; ctx.fillText(txt, x, h * (i + 0.5)); } else { ctx.strokeStyle = pal.text; ctx.strokeText(txt, x, h * (i + 0.5)); } }
        }
      } else if (vis === 'title') {
        const q = E.outCubic(clamp(lt / 1.2));
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = pal.text;
        ctx.font = F(400, md * 0.022); ctx.globalAlpha = fin * 0.75; ctx.letterSpacing = (md * 0.012 * (1.6 - q * 0.6)).toFixed(1) + 'px';
        if (label) ctx.fillText(label, W / 2, H / 2 - md * 0.05);
        if (title) { ctx.font = F(700, md * 0.05); ctx.globalAlpha = fin * q; ctx.letterSpacing = (md * 0.004).toFixed(1) + 'px'; ctx.fillText(title, W / 2, H / 2 + md * 0.012); }
        if (artist) { ctx.font = F(400, md * 0.022); ctx.globalAlpha = fin * q * 0.7; ctx.fillText(artist, W / 2, H / 2 + md * 0.07); }
        ctx.letterSpacing = '0px';
        ctx.globalAlpha = fin * 0.6; ctx.fillStyle = pal.accent; const w = md * 0.18 * q; ctx.fillRect(W / 2 - w / 2, H / 2 + md * 0.11, w, Math.max(1, S * 2));
      }
      // progress hairline across the gap
      if (cf.progress) { ctx.globalAlpha = fin * 0.7; ctx.fillStyle = pal.accent; ctx.fillRect(0, H - Math.max(2, S * 3), W * clamp(lt / len), Math.max(2, S * 3)); }
      ctx.restore();
      }
      // countdown into the next line (karaoke style: 3 beats)
      if (cf.countdown && g.next >= 0) {
        const per = 60 / (this.bpm() || 120), left = g.t1 - t, span = Math.min(per * 3, len * 0.8);
        if (left <= span + 0.4) {
          const k = clamp((span + 0.4 - left) / 0.3), n = 3, lit = Math.min(n, Math.floor((span - left) / (span / n)) + 1);
          const nx = String(this.cues[g.next].text || '').replace(/[|｜]([^《|｜]+)《[^》]*》/g, '$1').replace(/《[^》]*》/g, '').replace(/[*]/g, '').replace(/\s*\/\s*/g, ' ');
          ctx.save(); ctx.globalAlpha = k; const y = H * 0.82, r = md * 0.012;
          for (let i = 0; i < n; i++) { ctx.fillStyle = i < n - lit ? pal.accent : rgba(pal.text, 0.35); ctx.beginPath(); ctx.arc(W / 2 + (i - 1) * r * 3.2, y, r, 0, TAU); ctx.fill(); }
          ctx.font = F(600, md * 0.024); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = pal.text; ctx.globalAlpha = k * 0.75; ctx.fillText('NEXT ▸ ' + nx, W / 2, y + r * 2.2);
          ctx.restore();
        }
      }
    }

    seqStart(L, k, dur) { if (L._ct && L.seqK) return Math.max(0, L._ct.ws[Math.min(L._ct.n - 1, L.seqK[k])] - L._c0); return L.seq.starts[k] * dur * 0.9; }
    // per-glyph timing from word timestamps (cue.words: absolute start time per canonical word)
    charTimes(c) {
      if (!Array.isArray(c.words) || !c.words.length) return null;
      const key = c.text + '|' + c.words.join(',') + '|' + c.end;
      if (this._ctK && this._ctK.get(c.id) && this._ctK.get(c.id).key === key) return this._ctK.get(c.id).v;
      const WR = LM.typo.words(c.text), n = WR.n, nw = WR.list.length;
      if (!n || !nw) return null;
      const t = WR.list.map((w, i) => (isFinite(c.words[i]) ? c.words[i] : null));
      for (let i = 0; i < nw; i++) if (t[i] == null) { const p = i ? t[i - 1] : c.start; let j = i; while (j < nw && t[j] == null) j++; const q = j < nw ? t[j] : c.end; for (let k = i; k < j; k++) t[k] = p + ((q - p) * (k - i + 1)) / (j - i + 1); i = j; }
      const cs = new Float32Array(n), ce = new Float32Array(n), ws = new Float32Array(n), wOf = new Int16Array(n), wsByW = new Float32Array(nw);
      WR.list.forEach((w, i) => {
        const a = t[i], b = Math.min(i < nw - 1 ? t[i + 1] : c.end, a + Math.max(0.25, (w.b - w.a) * 0.45));
        wsByW[i] = a;
        for (let k = w.a; k < w.b; k++) { const f0 = (k - w.a) / (w.b - w.a), f1 = (k - w.a + 1) / (w.b - w.a); cs[k] = a + (b - a) * f0; ce[k] = a + (b - a) * f1; ws[k] = a; wOf[k] = i; }
      });
      const v = { cs, ce, ws, wOf, wsByW, n, nw };
      (this._ctK || (this._ctK = new Map())).set(c.id, { key, v });
      return v;
    }
    seqIndex(L, lt, dur) { let k = 0; for (let i = 0; i < L.seq.n; i++) if (lt >= this.seqStart(L, i, dur) - 1e-4) k = i; return k; }
    trackCam(L, lt, dur) {
      const W = this.W, H = this.H, ws = L.track.words;
      const cam = (i) => { const w = ws[i]; return { x: w.cx, y: w.cy, rot: w.rot, z: Math.min((W * 0.74) / Math.max(1, w.w), (H * 0.6) / Math.max(1, w.h)) }; };
      const k = this.seqIndex(L, lt, dur);
      const to = cam(k), from = k > 0 ? cam(k - 1) : Object.assign({}, to, { z: to.z * 0.55, rot: to.rot + 0.35 });
      const u = E.inOutCubic(clamp((lt - this.seqStart(L, k, dur)) / 0.34));
      let dr = to.rot - from.rot; while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2;
      const zm = Math.min(from.z, to.z) * (1 - 0.18 * Math.sin(u * Math.PI));
      const z = u < 0.5 ? lerp(from.z, zm, u * 2) : lerp(zm, to.z, (u - 0.5) * 2);
      return { x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u), rot: from.rot + dr * u, z: z * (1 + 0.02 * (lt - this.seqStart(L, k, dur))) };
    }
    bands(t) {
      const sp = this.audio && this.audio.spectrum ? this.audio.spectrum(t) : null;
      if (!sp) { const b = this.beatAt(t); return { beat: b, bass: b * 0.8, mid: 0.3, high: 0.2 }; }
      const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += sp[i]; return s / (b - a); };
      const f = (v, k) => clamp(Math.pow(v, 1.4) * k);
      return { beat: this.beatAt(t), bass: f(avg(0, 5), 1.6), mid: f(avg(6, 17), 1.8), high: f(avg(18, 31), 2.4) };
    }
    transWin(i) {
      const b = this.bpm(); let w = b > 40 ? clamp(30 / b, 0.16, 0.34) : 0.26;
      const c = this.cues[i], pv = this.cues[i - 1];
      w = Math.min(w, (c.end - c.start) * 0.45, pv ? (pv.end - pv.start) * 0.45 + Math.max(0, c.start - pv.end) : w);
      return Math.max(0.06, w);
    }
    transAt(t) {
      const cs = this.cues;
      for (let i = 1; i < cs.length; i++) {
        const c = cs[i]; if (c.start > t + 0.5) break;
        const id = c.trans; if (!id || id === 'none' || !LM.trans.lib[id]) continue;
        const w = this.transWin(i);
        if (Math.abs(t - c.start) < w) return { id, u: (t - (c.start - w)) / (2 * w), pal: palOf(this.p, c), prevPal: palOf(this.p, cs[i - 1]) };
      }
      return null;
    }
    applyTrans(tr, info, mode) {
      const L = LM.trans.lib[tr.id], ctx = this.sctx, W = this.W, H = this.H;
      if (L.kind === 'cover') {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
        L.f(ctx, tr.u, { W, H, S: this.S, minD: this.minD, pal: tr.pal, prev: tr.prevPal }); ctx.restore(); return;
      }
      const o = L.f(tr.u) || {};
      if (o.tx || o.ty || o.rot || (o.sc && o.sc !== 1) || o.skew) {
        this.tctx.setTransform(1, 0, 0, 1, 0, 0); this.tctx.clearRect(0, 0, W, H); this.tctx.drawImage(this.scene, 0, 0);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
        if (!mode.transparent) { ctx.fillStyle = tr.u < 0.5 ? tr.prevPal.bg : tr.pal.bg; ctx.fillRect(0, 0, W, H); }
        ctx.translate(W / 2 + (o.tx || 0) * W, H / 2 + (o.ty || 0) * H); if (o.rot) ctx.rotate(o.rot); if (o.sc) ctx.scale(o.sc, o.sc); if (o.skew) ctx.transform(1, 0, o.skew, 1, 0, 0);
        ctx.drawImage(this.tmp, -W / 2, -H / 2); ctx.restore();
      }
      if (o.flash) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = o.flash; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      const u = info.post, S = this.S;
      if (o.glitch) u.glitch = Math.max(u.glitch, o.glitch); if (o.block) u.block = Math.max(u.block, o.block);
      if (o.rgb) u.rgb = Math.max(u.rgb, o.rgb * S); if (o.pix) u.pix = Math.max(u.pix, o.pix * S); if (o.blur) u.blurMix = Math.max(u.blurMix, o.blur);
      if (o.zblur) u.zblur = Math.max(u.zblur, o.zblur); if (o.inv) u.inv = 1;
      if (o.mblur) u.mblur = o.mblur;
      if (o.psort) u.psort = Math.max(u.psort, o.psort); if (o.slice) u.slice = Math.max(u.slice, o.slice); if (o.liquid) u.liquid = Math.max(u.liquid, o.liquid); if (o.thermal) u.thermal = Math.max(u.thermal, o.thermal);
    }

    /* ---------- beat envelope ---------- */
    beatAt(t) {
      const p = this.p;
      if (p.beatSync === false) return 0;
      const an = this.audio && this.audio.analysis;
      let beats = an && an.beats;
      if (p.bpm > 0) {
        const per = 60 / p.bpm, off = p.beatOffset || 0;
        const k = Math.floor((t - off) / per);
        const tb = off + k * per;
        return t >= tb ? Math.exp(-(t - tb) * 7) : 0;
      }
      if (!beats || !beats.length) return 0;
      let lo = 0, hi = beats.length - 1;
      if (t < beats[0]) return 0;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (beats[m] <= t) lo = m; else hi = m - 1; }
      return Math.exp(-(t - beats[lo]) * 7);
    }

    /* ---------- main render ---------- */
    render(t, mode = {}) {
      this.mode = mode;
      const p = this.p; if (!p) return;
      const info = this.paint(this.sctx, t, mode);
      const tr = this.p.transOff ? null : this.transAt(t);
      if (tr) this.applyTrans(tr, info, mode);
      if (info.post.trgb > 0) {
        this.paint(this.prev[0].getContext('2d'), t - 2 / 30, Object.assign({}, mode, { noOverlay: true }));
        this.paint(this.prev[1].getContext('2d'), t - 4 / 30, Object.assign({}, mode, { noOverlay: true }));
      }
      this.post(info, t, mode);
      return info;
    }

    // find visible cues at t
    visible(t) {
      const cues = this.cues, out = [];
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        if (c.start > t + 0.001) break;
        const L = this.getLayout(c, i);
        const ph = phases(this.p, cues, i, L.glyphs.length, this.bpm());
        if (t >= c.start && t < ph.vEnd) out.push({ c, i, L, ph });
      }
      return out;
    }
    currentPal(t) {
      const cues = this.cues;
      let c = null, prev = null;
      for (let i = 0; i < cues.length; i++) { if (cues[i].start <= t) { prev = c; c = cues[i]; } else { if (!c) c = cues[i]; break; } }
      return { pal: palOf(this.p, c), prevPal: prev ? palOf(this.p, prev) : null, cue: c, prev };
    }

    paint(ctx, t, mode) {
      const p = this.p, W = this.W, H = this.H, S = this.S;
      this.curT = t;
      const transparent = !!mode.transparent;
      const vis = this.visible(t);
      const cur = vis[vis.length - 1] || null;
      const cp = this.currentPal(t);
      const pal = cur ? palOf(p, cur.c) : cp.pal;
      const beat = this.beatAt(t); this.curBeat = beat;
      const fl = cur ? filtersOf(p, cur.c) : filtersOf(p, null);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
      ctx.clearRect(0, 0, W, H);
      // background
      let bgPal = pal;
      if (cur && cp.prevPal && t - cur.c.start < 0.16 && p.bgCrossfade !== false) {
        const k = E.outQuad((t - cur.c.start) / 0.16);
        bgPal = Object.assign({}, pal, { bg: mix(cp.prevPal.bg, pal.bg, k) });
      }
      this.imgActive = !transparent && this.imgList && this.imgList().length > 0 && !p.imgBgmFull;
      if (!transparent) {
        const hasImg = this.imgList && this.imgList().length > 0;
        // the picture itself can be laid over the plain background (colour / gradient / pattern) with its own opacity and blend mode
        const iOp = clamp(p.imgOpacity == null ? 1 : +p.imgOpacity, 0, 1), iMode = BLEND[p.imgBlend] ? p.imgBlend : 'normal';
        if (hasImg && (iOp < 0.999 || iMode !== 'normal')) {
          this.drawBackground(ctx, bgPal, t, beat, cur);
          const Ic = this._imgLayer || (this._imgLayer = document.createElement('canvas'));
          if (Ic.width !== ctx.canvas.width || Ic.height !== ctx.canvas.height) { Ic.width = ctx.canvas.width; Ic.height = ctx.canvas.height; }
          const ictx = Ic.getContext('2d'); ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.clearRect(0, 0, Ic.width, Ic.height); ictx.setTransform(ctx.getTransform());
          ictx.globalAlpha = 1; ictx.globalCompositeOperation = 'source-over'; ictx.filter = 'none';
          if (iOp > 0.001 && this.drawImages(ictx, t, bgPal, beat)) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = iOp; ctx.globalCompositeOperation = BLEND[iMode]; ctx.drawImage(Ic, 0, 0); ctx.restore(); }
        } else if (!(hasImg && this.drawImages(ctx, t, bgPal, beat))) this.drawBackground(ctx, bgPal, t, beat, cur);
      }
      let gap = !cur ? this.gapAt(t) : null;
      const gcf = gap ? this.gapCfg(gap) : null;
      if (gcf && gcf.fill === 'off') gap = null;
      if (!transparent || (mode.overlays !== false && !mode.noOverlay)) {
        // background motion can be composited over the image / background with its own opacity and blend mode
        // per-phrase override → instrumental-section override → global
        const src = gap ? { o: gcf.opacity, b: gcf.blend } : cur ? { o: cur.c.bgmOpacity, b: cur.c.bgmBlend } : {};
        const bOp = clamp(src.o != null ? +src.o : p.bgmOpacity == null ? 1 : +p.bgmOpacity, 0, 1), bMode = BLEND[src.b] ? src.b : BLEND[p.bgmBlend] ? p.bgmBlend : 'normal';
        const mix = !transparent && (bOp < 0.999 || bMode !== 'normal');
        let bctx = ctx, Lc = null;
        if (mix) {
          Lc = this._bgmLayer || (this._bgmLayer = document.createElement('canvas'));
          if (Lc.width !== ctx.canvas.width || Lc.height !== ctx.canvas.height) { Lc.width = ctx.canvas.width; Lc.height = ctx.canvas.height; }
          bctx = Lc.getContext('2d'); bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, Lc.width, Lc.height); bctx.setTransform(ctx.getTransform());
        }
        if (bOp > 0.001) {
          if (gap) this.drawGapScene(bctx, t, beat, bgPal, gap, transparent);
          else this.drawBgm(bctx, t, beat, bgPal, cur, cp.prevPal ? cp.prev : null, transparent);
        }
        if (mix && bOp > 0.001) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = bOp; ctx.globalCompositeOperation = BLEND[bMode]; ctx.drawImage(Lc, 0, 0); ctx.restore(); }
      }
      if (gap && !mode.noOverlay) this.drawGapFx(ctx, t, beat, bgPal, gap);
      const lt = cur ? t - cur.c.start : 0;
      const bbox = cur ? cur.L.bbox : { x: W * 0.3, y: H * 0.4, w: W * 0.4, h: H * 0.2, cx: W / 2, cy: H / 2 };
      const R = { W, H, S, minD: this.minD, t, lt, pal, beat, bbox, amt: 1, xp: 0, beatFlash: p.beatSync !== false && (fl.has('flash')) };
      if (cur) R.xp = clamp((t - cur.ph.exitStart) / Math.max(0.05, cur.ph.xd));
      const audioFx = fl.has('audioBars') || fl.has('audioWave');
      if (audioFx && this.audio) { R.spec = this.audio.spectrum && this.audio.spectrum(t); R.wave = this.audio.waveAt && this.audio.waveAt(t, 160); }
      const overlayOK = !mode.noOverlay && (!transparent || mode.overlays !== false);
      // under overlays
      if (overlayOK) for (const [id, a] of fl) { const f = FX.list[id]; if (f.k === 'under' && FX.O[id]) { ctx.save(); R.amt = a; FX.O[id](ctx, R); ctx.restore(); } }
      // readability scrim behind the lyric when a busy full-frame background is running
      if (cur && !transparent && p.scrim !== false && this.bgmOf(cur.c).some((id) => LM.bgm.lib[id] && LM.bgm.lib[id].full) && !cur.L.track && !cur.L.seq) {
        const b = cur.L.bbox, r = Math.max(b.w, b.h) * 0.75 + this.minD * 0.08;
        const g = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, r); g.addColorStop(0, rgba(pal.bg, 0.55)); g.addColorStop(1, rgba(pal.bg, 0));
        ctx.save(); ctx.fillStyle = g; ctx.translate(b.cx, b.cy); ctx.scale(1, Math.min(1, (b.h + this.minD * 0.2) / (b.w + this.minD * 0.2)) + 0.25); ctx.translate(-b.cx, -b.cy); ctx.fillRect(b.cx - r, b.cy - r, r * 2, r * 2); ctx.restore();
      }
      // cues
      for (const v of vis) this.drawCue(ctx, v, t, beat, mode);
      // over overlays
      if (overlayOK) for (const [id, a] of fl) { const f = FX.list[id]; if ((f.k === 'over') && FX.O[id]) { ctx.save(); R.amt = a; FX.O[id](ctx, R); ctx.restore(); } }
      // credits
      if (p.showCredits && (p.title || p.artist)) this.drawCredits(ctx, pal, t);
      if (overlayOK && fl.has('letterbox') && !transparent) { ctx.save(); FX.O.letterbox(ctx, R); ctx.restore(); }
      ctx.globalAlpha = 1;
      // post uniforms
      const post = this.postParams(fl, t, lt, cur, beat, pal);
      return { post, pal, cur, fl };
    }

    drawBackground(ctx, pal, t, beat, cur) {
      const p = this.p, W = this.W, H = this.H, S = this.S;
      const bg = p.bg || { type: 'solid' };
      const type = bg.type || 'solid';
      ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
      if (type === 'gradient') {
        const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
        g.addColorStop(0, mix(pal.bg, pal.sub, 0.18)); g.addColorStop(1, mix(pal.bg, pal.accent, 0.3));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      } else if (type === 'radial') {
        const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H / 2, Math.hypot(W, H) * 0.6);
        g.addColorStop(0, mix(pal.bg, pal.sub, 0.22)); g.addColorStop(1, mix(pal.bg, '#000000', 0.35));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      } else if (type === 'mesh' || type === 'aurora') {
        const cols = [pal.accent, pal.sub, mix(pal.accent, pal.text, 0.4)];
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 3; i++) {
          let x, y, r;
          if (type === 'mesh') { x = W * (0.5 + 0.38 * Math.sin(t * 0.13 + i * 2.1)); y = H * (0.5 + 0.34 * Math.cos(t * 0.11 + i * 1.7)); r = this.minD * (0.55 + 0.1 * Math.sin(t * 0.2 + i)); }
          else { x = W * (0.2 + i * 0.3 + 0.1 * Math.sin(t * 0.2 + i)); y = H * (0.25 + 0.1 * Math.sin(t * 0.3 + i * 2)); r = this.minD * 0.6; }
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, rgba(cols[i], type === 'mesh' ? 0.34 : 0.28)); g.addColorStop(1, rgba(cols[i], 0));
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
        if (type === 'aurora') {
          for (let j = 0; j < 3; j++) {
            ctx.beginPath();
            for (let x = 0; x <= W; x += W / 40) { const y = H * (0.3 + j * 0.08) + Math.sin(x / W * 5 + t * 0.4 + j) * H * 0.06; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
            ctx.lineTo(W, 0); ctx.lineTo(0, 0); ctx.closePath();
            ctx.fillStyle = rgba(cols[j], 0.08); ctx.fill();
          }
        }
      } else if (type === 'sunset') {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, pal.bg); g.addColorStop(0.62, mix(pal.bg, pal.accent, 0.55)); g.addColorStop(1, mix(pal.accent, pal.sub, 0.4));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const cx = W / 2, cy = H * 0.62, r = this.minD * 0.26;
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, PI, 0); ctx.closePath(); ctx.clip();
        const sg = ctx.createLinearGradient(0, cy - r, 0, cy); sg.addColorStop(0, mix(pal.sub, '#ffffff', 0.3)); sg.addColorStop(1, pal.accent);
        ctx.fillStyle = sg; ctx.fillRect(cx - r, cy - r, r * 2, r);
        ctx.fillStyle = mix(pal.bg, pal.accent, 0.5);
        for (let i = 0; i < 6; i++) { const yy = cy - r * 0.08 - i * r * 0.14; ctx.fillRect(cx - r, yy, r * 2, r * 0.02 + i * S * 0.9); }
        ctx.restore();
        ctx.globalAlpha = 0.18; this.drawGrid3d(ctx, pal, t, 0.62); ctx.globalAlpha = 1;
      } else if (type === 'grid3d') {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, pal.bg); g.addColorStop(0.55, mix(pal.bg, pal.accent, 0.25)); g.addColorStop(1, pal.bg);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        this.drawGrid3d(ctx, pal, t, 0.55);
      } else if (type === 'image' && bg.image && this.images[bg.image]) {
        const img = this.images[bg.image];
        const k = Math.max(W / img.width, H / img.height) * (1 + 0.04 * Math.sin(t * 0.1));
        const iw = img.width * k, ih = img.height * k;
        if (bg.blur) ctx.filter = `blur(${(bg.blur * S).toFixed(1)}px)`;
        ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
        ctx.filter = 'none';
        ctx.globalAlpha = bg.dim == null ? 0.45 : bg.dim; ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      }
      // pattern (per cue decoration or project pattern)
      const pat = (cur && cur.c.scene && cur.c.scene.decoration && cur.c.scene.decoration !== 'none') ? cur.c.scene.decoration : p.pattern;
      if (pat && pat !== 'none') this.drawPattern(ctx, pat, pal, t, beat);
    }
    drawGrid3d(ctx, pal, t, hor) {
      const W = this.W, H = this.H, S = this.S, hy = H * hor;
      ctx.save(); ctx.strokeStyle = pal.accent; ctx.lineWidth = S * 1.6;
      ctx.beginPath(); ctx.rect(0, hy, W, H - hy); ctx.clip();
      const vp = W / 2;
      for (let i = -14; i <= 14; i++) { ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(vp + i * W * 0.02, hy); ctx.lineTo(vp + i * W * 0.2, H); ctx.stroke(); }
      const off = (t * 0.6) % 1;
      for (let j = 0; j < 14; j++) { const z = (j + off) / 14; const y = hy + (H - hy) * z * z; ctx.globalAlpha = 0.2 + 0.6 * z; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.restore();
    }
    drawPattern(ctx, pat, pal, t, beat) {
      const W = this.W, H = this.H, S = this.S, cx = W / 2, cy = H / 2;
      ctx.save(); ctx.strokeStyle = pal.sub; ctx.fillStyle = pal.sub; ctx.lineWidth = S * 1.2; ctx.globalAlpha = 0.22;
      if (pat === 'rings') { for (let i = 1; i < 9; i++) { ctx.beginPath(); ctx.arc(cx, cy, this.minD * 0.09 * i * (1 + beat * 0.02) + (t * S * 8) % (this.minD * 0.09), 0, PI * 2); ctx.stroke(); } }
      else if (pat === 'grid') { const g = this.minD / 10; for (let x = (W / 2) % g; x < W; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = (H / 2) % g; y < H; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } }
      else if (pat === 'cross') { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, S * 30, 0, PI * 2); ctx.stroke(); }
      else if (pat === 'rules') { const g = this.minD / 16; for (let y = g; y < H; y += g) { ctx.beginPath(); ctx.moveTo(W * 0.04, y); ctx.lineTo(W * 0.96, y); ctx.stroke(); } }
      else if (pat === 'dots') { const g = this.minD / 22; for (let y = g / 2; y < H; y += g) for (let x = g / 2; x < W; x += g) { ctx.beginPath(); ctx.arc(x, y, S * 2.2, 0, PI * 2); ctx.fill(); } }
      else if (pat === 'stripes') { ctx.globalAlpha = 0.1; ctx.translate(cx, cy); ctx.rotate(-PI / 5); const w = S * 34, D2 = Math.hypot(W, H); for (let x = -D2 + (t * S * 20) % (w * 2); x < D2; x += w * 2) ctx.fillRect(x, -D2, w, D2 * 2); }
      else if (pat === 'halftone') { const g = this.minD / 30; for (let y = g / 2; y < H; y += g) for (let x = g / 2; x < W; x += g) { const r = g * 0.45 * (y / H); if (r < 0.3) continue; ctx.beginPath(); ctx.arc(x, y, r, 0, PI * 2); ctx.fill(); } }
      else if (pat === 'geo') { ctx.restore(); ctx.save(); FX.O.geo(ctx, { W, H, S, minD: this.minD, t, pal, amt: 0.7 }); }
      ctx.restore();
    }

    /* ---------- cue ---------- */
    drawCue(ctx, v, t, beat, mode) {
      const p = this.p, { c, L, ph } = v;
      const W = this.W, H = this.H, S = this.S;
      const fl = filtersOf(p, c);
      const pal = palOf(p, c);
      const two = fl.has('twoFrame');
      let tt = two ? Math.floor(t * 15) / 15 : t;
      const lt = tt - c.start;
      const amp = (p.intensity || 1);
      const lx = this.lctx;
      lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalAlpha = 1; lx.filter = 'none'; lx.globalCompositeOperation = 'source-over';
      lx.clearRect(0, 0, W, H);
      // camera
      const cam = (c.scene && c.scene.camera) || p.camera || 'still';
      const hp = clamp(lt / ph.dur);
      lx.save();
      lx.translate(W / 2, H / 2);
      L._ct = this.charTimes(c); L._c0 = c.start;
      if (c.tf) { lx.translate((c.tf.x || 0) * W, (c.tf.y || 0) * H); if (c.tf.r) lx.rotate(c.tf.r); if (c.tf.s && c.tf.s !== 1) lx.scale(c.tf.s, c.tf.s); }
      const camAmp = amp;
      if (cam === 'push') lx.scale(1 + 0.06 * hp * camAmp, 1 + 0.06 * hp * camAmp);
      else if (cam === 'pull') lx.scale(1.06 - 0.06 * hp * camAmp, 1.06 - 0.06 * hp * camAmp);
      else if (cam === 'drift') lx.translate((hp - 0.5) * S * 70 * camAmp, 0);
      else if (cam === 'tilt') lx.rotate((hp - 0.5) * 0.06 * camAmp);
      else if (cam === 'shake') { lx.translate(U.noise1(t * 7, 1) * S * 9 * camAmp, U.noise1(t * 7, 2) * S * 9 * camAmp); lx.rotate(U.noise1(t * 5, 3) * 0.01 * camAmp); }
      else if (cam === 'punch') { const b = Math.max(beat, Math.max(0, 1 - lt / 0.3)); const k = 1 + 0.045 * b * camAmp; lx.scale(k, k); }
      if (L.drift) lx.translate(-hp * W * L.drift * 3, 0);
      L._k = L.seq ? this.seqIndex(L, lt, ph.dur) : -1;
      if (L.track) { const ct = this.trackCam(L, lt, ph.dur); lx.scale(ct.z, ct.z); lx.rotate(-ct.rot); lx.translate(-ct.x, -ct.y); }
      else lx.translate(-W / 2, -H / 2);
      // text style flags
      const st = {
        outline: fl.has('outlineText'), neon: fl.has('neonText'), longShadow: fl.has('longShadow'), marker: fl.has('markerText'), extrude: fl.has('extrude'),
        gradient: fl.has('gradientText'), erode: fl.has('erodeText'), glow: fl.has('glowText'), drop: fl.has('dropShadow'), underline: fl.has('underline'),
      };
      const keyColor = p.keyColor !== false;
      // colors per glyph
      const onAcc = (c.gfx || []).some((id) => id === 'boxSlam' || id === 'splat');
      const colorOf = (g0) => {
        const g = onAcc && !g0.on ? Object.assign({}, g0, { on: 'accent' }) : g0;
        const surf = g.on === 'accent' ? pal.accent : g.on === 'sub' ? pal.sub : pal.bg;
        const wantAccent = g.col === 'accent' || g.emph || (keyColor && g.key && !g.col);
        let want = wantAccent ? (g.on === 'accent' ? pal.bg : pal.accent) : g.on === 'accent' ? pal.bg : pal.text;
        if (contrast(want, surf) < 2.3) want = readable(surf, [g.on === 'accent' ? pal.bg : pal.text, pal.text, pal.bg, pal.sub]);
        const acc = contrast(pal.accent, surf) >= 2.3 ? pal.accent : readable(surf, [pal.sub, pal.text, pal.bg]);
        return { fill: want, acc, surf };
      };
      // decos
      const pe = clamp(lt / Math.max(0.3, ph.ed));
      const px = ph.xd > 0 ? clamp((tt - ph.exitStart) / ph.xd) : (tt >= c.end ? 1 : 0);
      const knock = fl.has('knockout');
      if (knock) { lx.save(); lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalAlpha = 1 - (px > 0 ? E.inQuad(px) : 0); lx.fillStyle = pal.accent; lx.fillRect(0, 0, W, H); lx.restore(); }
      this.drawDecos(lx, L, pal, pe, px, t, ph.tr.exit === 'cut' ? 0 : 1);
      const gfxIds = (c.gfx || []).filter((id) => LM.gfx.lib[id]);
      const GR = gfxIds.length ? { W, H, S, minD: this.minD, pal, bb: L.seq && L._k >= 0 ? L.seqBB[L._k] : L.bbox, kb: L.keyBB, e: clamp(lt / 0.65), lt, hp, beat, x: ph.tr.exit === 'cut' ? 0 : px, seed: U.strHash(c.id) & 1023, title: p.title || '', tAbs: t } : null;
      if (GR) LM.gfx.draw(gfxIds.filter((id) => !LM.gfx.lib[id].top), lx, GR);
      // ghosts behind
      L.ghosts.forEach((gh) => { if (gh.behind || gh.mirrorY == null) this.drawGhost(lx, L, gh, c, ph, tt, pal, colorOf, st); });
      // glyph pass
      const clipE = M.enter[ph.tr.enter].clip, clipX = M.exit[ph.tr.exit].clip;
      const B = { x: L.bbox.x - L.bbox.h * 0.15, y: L.bbox.y - L.bbox.h * 0.15, w: L.bbox.w + L.bbox.h * 0.3, h: L.bbox.h * 1.3, cx: L.bbox.cx, cy: L.bbox.cy };
      lx.save();
      if ((clipE && lt < ph.ed) || (clipX && tt >= ph.exitStart)) {
        lx.beginPath();
        if (clipE && lt < ph.ed) clipE(lx, clamp(lt / ph.ed), B);
        else clipX(lx, clamp((tt - ph.exitStart) / Math.max(0.01, ph.xd)), B);
        lx.clip();
      }
      // echo trail
      if (fl.has('echo')) {
        for (let k = 4; k >= 1; k--) {
          const Ts = this.glyphTransforms(L, c, ph, tt - k * 0.045, beat, amp, v.i);
          const T0 = this.glyphTransforms(L, c, ph, tt, beat, amp, v.i);
          L.glyphs.forEach((g, gi) => {
            const a = Ts[gi], b = T0[gi];
            if (Math.abs((a.x || 0) - (b.x || 0)) + Math.abs((a.y || 0) - (b.y || 0)) + Math.abs((a.sx ?? 1) - (b.sx ?? 1)) * g.size + Math.abs((a.rot || 0) - (b.rot || 0)) * g.size < 1.5 * S) return;
            const cc = colorOf(g);
            this.drawGlyph(lx, g, a, { alphaMul: 0.28 / k, plain: true }, L.font.tmpl, cc.acc, cc, pal);
          });
        }
      }
      const Ts = this.glyphTransforms(L, c, ph, tt, beat, amp, v.i);
      const copies = fl.has('rainbowStack') ? (() => { const cs = [pal.accent, pal.sub, mix(pal.accent, pal.text, 0.5), mix(pal.sub, pal.bg, 0.35), pal.text]; const a = t * 1.3; return [5, 4, 3, 2, 1].map((k) => [Math.cos(a) * k * 0.04, Math.sin(a) * k * 0.03 + k * 0.022, cs[(k - 1) % cs.length], 1]); })() : fl.has('stackColor') ? [[4, pal.sub], [3, pal.accent], [2, pal.sub], [1, pal.accent]].map(([k, col]) => [k * 0.035, k * 0.035, col, 1]) : fl.has('misprint') ? [[0.045, 0.02, pal.accent, 0.9], [-0.035, -0.025, pal.sub, 0.9]] : null;
      if (copies && !knock) copies.forEach(([dx, dy, col, a]) => L.glyphs.forEach((g, gi) => { const T2 = Object.assign({}, Ts[gi], { x: (Ts[gi].x || 0) + g.size * dx, y: (Ts[gi].y || 0) + g.size * dy }); this.drawGlyph(lx, g, T2, { plain: true, alphaMul: a }, L.font.tmpl, col, { fill: col, acc: col, surf: pal.bg }, pal); }));
      if (knock) lx.globalCompositeOperation = 'destination-out';
      L.glyphs.forEach((g, gi) => { const cc = colorOf(g); this.drawGlyph(lx, g, Ts[gi], knock ? { plain: true } : st, L.font.tmpl, g.style === 'outline' && !knock ? null : cc.fill, cc, pal); });
      lx.globalCompositeOperation = 'source-over';
      if (p.ruby !== false) this.drawRuby(lx, L, Ts, pal, colorOf);
      if (GR) LM.gfx.draw(gfxIds.filter((id) => LM.gfx.lib[id].top), lx, GR);
      lx.restore();
      L.ghosts.forEach((gh) => { if (gh.mirrorY != null) this.drawGhost(lx, L, gh, c, ph, tt, pal, colorOf, st); });
      lx.restore();
      // composite layer with transitions
      this.compositeLayer(ctx, fl, c, ph, t, lt, beat, pal);
    }

    glyphTransforms(L, c, ph, t, beat, amp, idx) {
      const me = M.enter[ph.tr.enter], mh = M.hold[ph.tr.hold], mx = M.exit[ph.tr.exit];
      const lt = t - c.start;
      const N = L.glyphs.length;
      const cx = L.bbox.cx, cy = L.bbox.cy;
      const C = { W: this.W, H: this.H, S: this.S, amp, cx, cy, N, gl: L.glyphs, beat, seed: idx, W_: Math.max(1, L.words), tempo: this.tempo(), bb: L.bbox, lt: t - c.start, dur: ph.dur, ct: L._ct || this.charTimes(c), tAbs: t };
      if (!L.rE[ph.tr.enter]) L.rE[ph.tr.enter] = M.ranks(L.glyphs, me.u || 'g', me.o || 'fwd', 11);
      if (!L.rX[ph.tr.exit]) L.rX[ph.tr.exit] = M.ranks(L.glyphs, mx.u || 'g', mx.o || 'fwd', 13);
      const rE = L.rE[ph.tr.enter], rX = L.rX[ph.tr.exit];
      const Pe = clamp(lt / ph.ed), Px = ph.xd > 0 ? clamp((t - ph.exitStart) / ph.xd) : (t >= c.end ? 1 : 0);
      const hp = clamp(lt / ph.dur);
      const out = new Array(N);
      for (let i = 0; i < N; i++) {
        const g = L.glyphs[i];
        const T = { x: 0, y: 0, sx: 1, sy: 1, rot: 0, a: 1, blur: 0 };
        const add = (A) => {
          if (!A) return;
          if (A.x) T.x += A.x; if (A.y) T.y += A.y; if (A.rot) T.rot += A.rot;
          if (A.sx != null) T.sx *= A.sx; if (A.sy != null) T.sy *= A.sy;
          if (A.a != null) T.a *= A.a; if (A.blur) T.blur += A.blur;
          if (A.skx) T.skx = (T.skx || 0) + A.skx;
          if (A.vis === false) T.vis = false;
          if (A.ch) T.ch = A.ch;
          if (A.lineMask) T.lineMask = true;
          if (A.px) T.px = A.px; if (A.py) T.py = A.py;
          if (A.stroke != null) T.stroke = A.stroke; if (A.fillA != null) T.fillA = A.fillA;
          if (A.accent) T.accent = true; if (A.bright) T.bright = Math.max(T.bright || 0, A.bright); if (A.dark) T.dark = Math.max(T.dark || 0, A.dark);
          if (A.slice) T.slice = Math.max(T.slice || 0, A.slice); if (A.split) T.split = (T.split || 0) + A.split;
          if (A.fill != null) T.fill = A.fill;
          if (A.stut) { T.stut = Math.max(T.stut || 0, A.stut); T.stutD = A.stutD; if (A.stutA) T.stutA = A.stutA; }
          if (A.erode) T.erode = Math.max(T.erode || 0, A.erode);
          if (A.wt) T.wt = (T.wt || 0) + A.wt;
          if (A.rgb) T.rgb = (T.rgb || 0) + A.rgb;
          if (A.boxB != null) { T.boxA = A.boxA || 0; T.boxB = A.boxB; }
          if (A.boxBg) T.boxBg = Math.max(T.boxBg || 0, A.boxBg);
          if (A.strips) { T.strips = A.strips; T.stripOff = (T.stripOff || 0) + (A.stripOff || 0); }
        };
        // enter
        let pe = Pe;
        if (me.wt) {
          const n = me.wt === 'char' ? N : Math.max(1, L.words), idx = me.wt === 'char' ? g.k : g.wordIdx;
          const span = Math.min(ph.dur * 0.8, n * Math.max(0.12, 60 / (this.bpm() || 120) / (me.wt === 'char' ? 2 : 1)));
          const ct = C.ct; const tk = ct ? (me.wt === 'char' ? ct.cs[g.k] : ct.ws[g.k]) - c.start : (idx / n) * span;
          add(me.f(clamp((lt - tk) / Math.max(0.05, me.d)), g, C));
        } else {
          if (me.st > 0) pe = clamp((Pe - rE[i] * me.st) / (1 - me.st));
          if (Pe < 1 || pe < 1) add(me.f(pe, g, C));
        }
        // hold
        if (mh && ph.tr.hold !== 'none') add(mh.f(Math.max(0, lt), g, C, hp));
        // exit
        if (Px > 0) {
          let px = Px;
          if (mx.st > 0) px = clamp((Px - rX[i] * mx.st) / (1 - mx.st));
          if (ph.tr.exit === 'cut') { if (t >= c.end) T.vis = false; }
          else if (px > 0) add(mx.f(px, g, C));
        }
        if (L.seq && g.seq != null) {
          const k = L._k != null && L._k >= 0 ? L._k : this.seqIndex(L, lt, ph.dur);
          if (g.seq > k || (!L.seq.keep && g.seq < k)) T.vis = false;
          else if (g.seq === k) { const lk = lt - this.seqStart(L, k, ph.dur); if (lk < 0.16) { const pp = E.outExpo(clamp(lk / 0.16)); const sc = 1 + (1 - pp) * 0.35; T.sx *= sc; T.sy *= sc; T.bright = Math.max(T.bright || 0, (1 - pp) * 0.6); } }
        }
        out[i] = T;
      }
      return out;
    }

    drawGlyph(ctx, g, T, st, tmpl, fill, cc, pal) {
      if (T.vis === false) return;
      const a = (T.a == null ? 1 : T.a) * (g.alpha == null ? 1 : g.alpha) * (st.alphaMul || 1);
      if (a <= 0.004 && !(T.boxB > T.boxA)) return;
      const S = this.S, size = g.size;
      const ch = T.ch || g.ch;
      ctx.save();
      if (T.lineMask) {
        ctx.translate(g.x, g.y); if (g.rot) ctx.rotate(g.rot);
        ctx.beginPath(); ctx.rect(-g.w / 2 - size * 0.12, -size * 0.64, g.w + size * 0.24, size * 1.28); ctx.clip();
        ctx.translate(T.x || 0, T.y || 0);
      } else {
        ctx.translate(g.x + (T.x || 0), g.y + (T.y || 0)); if (g.rot) ctx.rotate(g.rot);
      }
      if (T.px || T.py) ctx.translate(T.px || 0, T.py || 0);
      if (T.rot) ctx.rotate(T.rot);
      if (T.skx) ctx.transform(1, 0, Math.tan(T.skx), 1, 0, 0);
      const sx = T.sx == null ? 1 : T.sx, sy = T.sy == null ? 1 : T.sy;
      if (sx !== 1 || sy !== 1) ctx.scale(Math.abs(sx) < 1e-4 ? 1e-4 : sx, Math.abs(sy) < 1e-4 ? 1e-4 : sy);
      if (T.px || T.py) ctx.translate(-(T.px || 0), -(T.py || 0));
      ctx.globalAlpha = a;
      ctx.font = this.fontStr(g.ft || tmpl, size);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (g.bs && (g.ft || g.rot)) ctx.translate(0, g.bs * size);
      let col = T.accent ? cc.acc : fill || cc.fill;
      const outlineOnly = !fill;
      if (T.bright) col = mix(col, '#ffffff', clamp(T.bright));
      if (T.dark) col = mix(col, cc.surf, clamp(T.dark));
      // thinner weight: morphological erode (works with CJK fonts whose outlines overlap, unlike erasing a stroke)
      const er0 = T.wt < -0.01 && fill ? erodeUrl(size * 0.014 * Math.min(1.2, -T.wt) * Math.abs(ctx.getTransform().a || 1)) : '';
      if (T.blur > 0.35 || er0) ctx.filter = (er0 + (T.blur > 0.35 ? ` blur(${T.blur.toFixed(1)}px)` : '')).trim();
      // テロップ帯: the glyph sits on a solid accent box and switches to the surface colour
      if (T.boxBg > 0.01) { ctx.save(); ctx.filter = 'none'; ctx.fillStyle = cc.acc; ctx.globalAlpha = a * clamp(T.boxBg); ctx.fillRect(-g.w / 2 - size * 0.09, -size * 0.6, g.w + size * 0.18, size * 1.2); ctx.restore(); col = cc.surf; }
      const ink = () => this.glyphInk(ctx, ch, g, T, st, col, cc, pal, outlineOnly);
      // RGB split: offset magenta / cyan copies behind the glyph
      const draw0 = T.rgb > 0.4 ? () => {
        ctx.save(); ctx.shadowColor = 'transparent'; const a0 = ctx.globalAlpha;
        ctx.globalAlpha = a0 * 0.85; ctx.fillStyle = '#ff2a6d'; ctx.fillText(ch, -T.rgb, 0); ctx.fillStyle = '#12d6f0'; ctx.fillText(ch, T.rgb, T.rgb * 0.15);
        ctx.restore(); ink();
      } : ink;
      // letter-repeat stutter: fading copies trailing behind the glyph
      const draw = T.stut > 0.05 ? () => {
        const n = Math.min(8, Math.ceil(T.stut)), dd = T.stutD == null ? g.w * 0.55 : T.stutD, a0 = ctx.globalAlpha;
        for (let k = n; k >= 1; k--) { ctx.save(); ctx.translate(-k * dd, 0); ctx.globalAlpha = a0 * clamp(T.stut - k + 1) * (T.stutA ? T.stutA : 0.2 + 0.55 * (1 - k / (n + 1))); draw0(); ctx.restore(); }
        draw0();
      } : draw0;
      const er = Math.max(T.erode || 0, st.erode ? 0.26 : 0);
      if (T.strips && Math.abs(T.stripOff || 0) > 0.5) {
        const n = T.strips, hw = g.w + size + Math.abs(T.stripOff), h = (size * 1.3) / n;
        for (let k = 0; k < n; k++) {
          ctx.save(); ctx.beginPath(); ctx.rect(-hw, -size * 0.65 + k * h, hw * 2, h + 0.6); ctx.clip();
          ctx.translate((k % 2 ? 1 : -1) * T.stripOff * (0.7 + 0.3 * ((k * 7) % 5) / 4), 0); draw(); ctx.restore();
        }
      } else if (T.split) {
        const hw = g.w + size;
        ctx.save(); ctx.beginPath(); ctx.rect(-hw, -size, hw * 2, size); ctx.clip(); ctx.translate(T.split, 0); draw(); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(-hw, 0, hw * 2, size); ctx.clip(); ctx.translate(-T.split, 0); draw(); ctx.restore();
      } else if (T.slice > 0.02) {
        const n = 4, hw = g.w + size, h = (size * 1.3) / n;
        for (let k = 0; k < n; k++) {
          ctx.save(); ctx.beginPath(); ctx.rect(-hw, -size * 0.65 + k * h, hw * 2, h + 0.5); ctx.clip();
          ctx.translate((hash(g.i, k, Math.floor(this.curT * 20)) - 0.5) * size * 0.5 * T.slice, 0); draw(); ctx.restore();
        }
      } else draw();
      if (T.boxB > T.boxA) { const x0 = -g.w / 2 - size * 0.1, w0 = g.w + size * 0.2; ctx.save(); ctx.filter = 'none'; ctx.globalAlpha = Math.max(a, 0.001) > 0 ? 1 * (st.alphaMul || 1) : 0; ctx.fillStyle = cc.acc; ctx.fillRect(x0 + w0 * T.boxA, -size * 0.6, w0 * (T.boxB - T.boxA) + 0.5, size * 1.2); ctx.restore(); }
      if (er > 0.01 && !st.plain) {
        // grain erosion: punch noise specks out of the ink (steps at 12fps for a printed/stop-motion feel)
        ctx.filter = 'none'; ctx.globalCompositeOperation = 'destination-out';
        const step = Math.floor(this.curT * 12), n = Math.round(24 + er * 150), hw = g.w * 0.62, hh = size * 0.62;
        ctx.globalAlpha = 1; ctx.fillStyle = '#000';
        for (let k = 0; k < n; k++) {
          const x = (hash(g.i, k, step) - 0.5) * 2 * hw, y = (hash(k, g.i + 7, step) - 0.5) * 2 * hh;
          const r = size * (0.012 + 0.06 * hash(k, 3, g.i)) * (0.5 + er * 1.1);
          ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
        }
        if (er > 0.6) { ctx.globalAlpha = clamp((er - 0.6) / 0.45); ctx.fillRect(-hw - size, -hh - size, (hw + size) * 2, (hh + size) * 2); }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }
    glyphInk(ctx, ch, g, T, st, col, cc, pal, outlineOnly) {
      const size = g.size, S = this.S;
      if (st.plain) { ctx.fillStyle = col; outlineOnly ? (ctx.lineWidth = size * 0.03, ctx.strokeStyle = cc.fill, ctx.strokeText(ch, 0, 0)) : ctx.fillText(ch, 0, 0); return; }
      if (st.marker) { ctx.save(); ctx.globalAlpha *= 0.9; ctx.fillStyle = cc.acc === col ? cc.fill : cc.acc; ctx.globalAlpha *= 0.85; ctx.fillRect(-g.w / 2 - size * 0.02, size * 0.1, g.w + size * 0.04, size * 0.34); ctx.restore(); }
      if (st.longShadow || st.extrude) {
        const n = st.extrude ? 10 : 14, d = size * (st.extrude ? 0.009 : 0.014);
        ctx.save();
        for (let k = n; k >= 1; k--) {
          ctx.fillStyle = st.extrude ? mix(cc.acc, '#000000', 0.15 + (k / n) * 0.35) : mix(cc.surf, '#000000', 0.45);
          if (!st.extrude) ctx.globalAlpha *= 1;
          ctx.fillText(ch, k * d, k * d);
        }
        ctx.restore();
      }
      if (st.drop) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = size * 0.14; ctx.shadowOffsetY = size * 0.06; }
      if (st.glow) { ctx.shadowColor = rgba(col, 0.75); ctx.shadowBlur = size * 0.3; }
      let fillStyle = col;
      if (st.gradient) { const gr = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5); gr.addColorStop(0, mix(col, '#ffffff', 0.25)); gr.addColorStop(1, cc.acc === col ? pal.sub : cc.acc); fillStyle = gr; }
      if (st.neon && (T.stroke == null || T.fillA > 0.85)) {
        ctx.save(); ctx.shadowColor = cc.acc; ctx.shadowBlur = size * 0.45; ctx.fillStyle = cc.acc; ctx.fillText(ch, 0, 0);
        ctx.shadowBlur = size * 0.15; ctx.fillText(ch, 0, 0); ctx.restore();
        fillStyle = mix(col, '#ffffff', 0.55);
      }
      if (st.outline && !outlineOnly) { ctx.save(); ctx.shadowColor = 'transparent'; ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.09; ctx.strokeStyle = cc.acc === col ? cc.surf : cc.acc; ctx.strokeText(ch, 0, 0); ctx.restore(); }
      const wt = T.wt ? clamp(T.wt, -1.2, 1.6) : 0;
      if (wt > 0.01 && !outlineOnly) { ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.075 * wt; ctx.strokeStyle = T.fill != null && T.fill < 1 ? mix(col, cc.surf, 0.48) : T.fill === 1 ? cc.acc : fillStyle; ctx.strokeText(ch, 0, 0); ctx.restore(); }
      // karaoke fill
      if (T.fill != null && T.fill < 1) {
        ctx.fillStyle = mix(col, cc.surf, 0.48);
        if (outlineOnly) { ctx.lineWidth = size * 0.03; ctx.strokeStyle = cc.fill; ctx.strokeText(ch, 0, 0); } else ctx.fillText(ch, 0, 0);
        if (T.fill > 0) { ctx.save(); ctx.beginPath(); ctx.rect(-g.w / 2 - size * 0.1, -size, (g.w + size * 0.2) * T.fill, size * 2); ctx.clip(); ctx.fillStyle = cc.acc; ctx.fillText(ch, 0, 0); ctx.restore(); }
      } else if (T.fill === 1) { ctx.fillStyle = cc.acc; ctx.fillText(ch, 0, 0); }
      else if (T.stroke != null) {
        ctx.save(); ctx.shadowColor = 'transparent';
        const Ld = size * 3; ctx.setLineDash([Ld, Ld]); ctx.lineDashOffset = Ld * (1 - T.stroke);
        ctx.lineWidth = Math.max(1, size * 0.025); ctx.strokeStyle = outlineOnly ? cc.fill : col; ctx.strokeText(ch, 0, 0); ctx.restore();
        if (T.fillA > 0 && !outlineOnly) { ctx.globalAlpha *= T.fillA; ctx.fillStyle = fillStyle; ctx.fillText(ch, 0, 0); }
      } else if (outlineOnly) { ctx.lineWidth = Math.max(0.5, size * 0.03 * (1 + wt * 1.6)); ctx.strokeStyle = T.accent ? cc.acc : cc.fill; ctx.strokeText(ch, 0, 0); }
      else { ctx.fillStyle = fillStyle; ctx.fillText(ch, 0, 0); }
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      if (st.underline) { ctx.fillStyle = cc.acc; ctx.fillRect(-g.w / 2 - size * 0.03, size * 0.56, g.w + size * 0.06, Math.max(1, size * 0.06)); }
    }

    drawRuby(ctx, L, Ts, pal, colorOf) {
      const groups = new Map();
      L.glyphs.forEach((g, i) => { if (g.rb) { const a = groups.get(g.rb.id) || { rb: g.rb, gs: [] }; a.gs.push([g, Ts[i]]); groups.set(g.rb.id, a); } });
      if (!groups.size) return;
      const vert = L.lay === 'vertical';
      groups.forEach(({ rb, gs }) => {
        const vis = gs.filter(([, T]) => T.vis !== false); if (!vis.length) return;
        let x = 0, y = 0, sz = 0, a = 1, sc = 0, bl = 0;
        vis.forEach(([g, T]) => { x += g.x + (T.x || 0); y += g.y + (T.y || 0); sz += g.size; sc += Math.abs(T.sy == null ? 1 : T.sy); a = Math.min(a, (T.a == null ? 1 : T.a)); bl += T.blur || 0; });
        const n = vis.length; x /= n; y /= n; sz /= n; sc /= n; if (a < 0.02 || sc < 0.05) return;
        const g0 = vis[0][0], rot = g0.rot || 0, span = gs.reduce((s2, [g]) => s2 + g.w, 0);
        const rs = sz * 0.4 * sc;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a; if (bl / n > 0.4) ctx.filter = `blur(${(bl / n * 0.7).toFixed(1)}px)`;
        ctx.font = this.fontStr(L.font.tmpl, rs); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = colorOf(g0).fill;
        const chars = Array.from(rb.text), tw = ctx.measureText(rb.text).width;
        if (vert) { const step = Math.max(rs * 1.02, (span * sc) / chars.length); chars.forEach((ch, i) => ctx.fillText(ch, sz * 0.62 * sc + rs * 0.5, (i - (chars.length - 1) / 2) * step)); }
        else { const extra = chars.length > 1 && tw < span * sc * 0.95 ? (span * sc - tw) / chars.length : 0; if (extra > 0) { let cx0 = -span * sc / 2 + extra / 2; chars.forEach((ch) => { const w = ctx.measureText(ch).width; ctx.fillText(ch, cx0 + w / 2, -sz * 0.6 * sc - rs * 0.55); cx0 += w + extra; }); } else ctx.fillText(rb.text, 0, -sz * 0.6 * sc - rs * 0.55); }
        ctx.restore();
      });
    }

    drawGhost(lx, L, gh, c, ph, tt, pal, colorOf, st) {
      const Ts = this.glyphTransforms(L, c, ph, tt - (gh.delay || 0), 0, this.p.intensity || 1, 0);
      lx.save();
      const cx = L.bbox.cx, cy = L.bbox.cy;
      if (gh.mirrorY != null) { lx.translate(0, gh.mirrorY * 2); lx.scale(1, -1); }
      if (gh.s) { lx.translate(cx, cy); lx.scale(gh.s, gh.s); lx.translate(-cx, -cy); }
      lx.translate(gh.dx || 0, gh.dy || 0);
      L.glyphs.forEach((g, i) => {
        const cc = colorOf(g);
        let a = gh.a;
        if (gh.fade) a *= clamp(1 - (g.y - L.bbox.y) / Math.max(1, L.bbox.h) * 0.8);
        const fill = gh.style === 'outline' ? null : cc.fill;
        const cc2 = gh.col ? Object.assign({}, cc, { fill: pal[gh.col] || cc.fill }) : cc;
        this.drawGlyph(lx, g, Ts[i], { alphaMul: a, plain: true }, L.font.tmpl, fill, cc2, pal);
      });
      lx.restore();
    }

    drawDecos(ctx, L, pal, pe, px, t, exitFade) {
      const S = this.S;
      L.decos.forEach((d) => {
        if (d.seq != null && d.seq !== L._k) return;
        const col = pal[d.col] || d.col || pal.accent;
        let q = E.outCubic(clamp(pe * 1.4 - (d.i || 0) * 0.04));
        const a0 = (d.a == null ? 1 : d.a) * (exitFade ? 1 - E.inQuad(px) : 1);
        if (a0 <= 0.003) return;
        ctx.save(); ctx.globalAlpha = a0;
        ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = d.lw || S * 2;
        const anim = d.anim || 'none';
        if (anim === 'fade') { ctx.globalAlpha *= q; q = 1; }
        switch (d.t) {
          case 'fn': { d.f(ctx, { t, q, pe, px, pal, S, W: this.W, H: this.H, minD: this.minD, L, r: this, beat: this.curBeat || 0 }); break; }
          case 'rect': {
            let { x, y, w, h } = d;
            if (anim === 'grow-x') w *= q; else if (anim === 'grow-y') h *= q;
            else if (anim === 'pop') { const k = E.outBack(clamp(pe * 1.6 - (d.i || 0) * 0.06)); const cx = x + w / 2, cy = y + h / 2; w *= Math.max(0, k); h *= Math.max(0, k); x = cx - w / 2; y = cy - h / 2; }
            if (d.style === 'stroke') ctx.strokeRect(x, y, w, h); else ctx.fillRect(x, y, w, h);
            break;
          }
          case 'band': {
            ctx.translate(d.cx, d.cy); ctx.rotate(d.rot || 0);
            const w = d.w * (anim === 'grow-x' ? q : 1);
            ctx.fillRect(-d.w / 2, -d.h / 2, w, d.h);
            break;
          }
          case 'line': {
            const k = anim === 'draw' ? q : 1;
            ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(lerp(d.x1, d.x2, k), lerp(d.y1, d.y2, k)); ctx.stroke();
            break;
          }
          case 'ring': {
            if (d.dash) ctx.setLineDash(d.dash);
            const rot = (d.spin || 0) * t;
            ctx.beginPath(); ctx.arc(d.cx, d.cy, d.r, -PI / 2 + rot, -PI / 2 + rot + PI * 2 * (anim === 'draw' ? q : 1)); ctx.stroke();
            break;
          }
          case 'frame': {
            const k = anim === 'draw' ? q : 1, P = (d.w + d.h) * 2 * k;
            ctx.setLineDash([P, 1e5]); ctx.strokeRect(d.x, d.y, d.w, d.h);
            break;
          }
          case 'corners': {
            const L2 = d.len * (anim === 'draw' ? q : 1);
            [[d.x, d.y, 1, 1], [d.x + d.w, d.y, -1, 1], [d.x + d.w, d.y + d.h, -1, -1], [d.x, d.y + d.h, 1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x + sx * L2, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * L2); ctx.stroke(); });
            break;
          }
          case 'spot': {
            const g = ctx.createRadialGradient(d.cx, d.cy, 0, d.cx, d.cy, d.r);
            g.addColorStop(0, rgba(col, 0.9)); g.addColorStop(1, rgba(col, 0));
            ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
            break;
          }
          case 'rays': {
            const n = d.n || 16, rr = Math.hypot(this.W, this.H), rot = (d.spin || 0) * t;
            for (let i = 0; i < n; i++) { const a = rot + (i / n) * PI * 2, w = PI / n * 0.45; ctx.beginPath(); ctx.moveTo(d.cx, d.cy); ctx.lineTo(d.cx + Math.cos(a - w) * rr, d.cy + Math.sin(a - w) * rr); ctx.lineTo(d.cx + Math.cos(a + w) * rr, d.cy + Math.sin(a + w) * rr); ctx.fill(); }
            break;
          }
          case 'marquee': {
            ctx.font = this.fontStr(L.font.tmpl, d.size); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
            const txt = d.text + '　　';
            const w = Math.max(10, ctx.measureText(txt).width);
            const off = (((t * d.speed * this.W * d.dir) % w) + w) % w;
            ctx.globalAlpha *= q;
            for (let x = -off - w; x < this.W + w; x += w) {
              if (d.style === 'outline') { ctx.lineWidth = Math.max(1, d.size * 0.025); ctx.strokeText(txt, x, d.y); } else ctx.fillText(txt, x, d.y);
            }
            break;
          }
          case 'wave': {
            ctx.beginPath();
            for (let x = 0; x <= this.W * q; x += this.S * 8) { const y = d.cy + d.dy + Math.sin((x - this.W / 2) * d.k) * d.amp; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
            ctx.stroke();
            break;
          }
        }
        ctx.restore();
      });
    }

    compositeLayer(ctx, fl, c, ph, t, lt, beat, pal) {
      const W = this.W, H = this.H, S = this.S, L = this.layer;
      const ep = clamp(lt / 0.5), xp = clamp((t - (ph.vEnd - 0.4)) / 0.4);
      const e = E.outCubic(ep), x = E.inCubic(xp);
      ctx.save();
      let tx = 0, ty = 0;
      if (fl.has('shake')) { const a = fl.get('shake'); const k = Math.max(0.35, beat, 1 - ep); tx = U.noise1(t * 14, 7) * S * 16 * a * k; ty = U.noise1(t * 14, 9) * S * 16 * a * k; }
      if (fl.has('warp')) { const w = (1 - e) * 0.6 + x * 0.6 + Math.sin(t * 2) * 0.02; ctx.translate(W / 2, H / 2); ctx.transform(1, 0, w * 0.4, 1 + w * 0.4, 0, 0); ctx.translate(-W / 2, -H / 2); }
      ctx.translate(tx, ty);
      const drawL = () => ctx.drawImage(L, 0, 0);
      const clipDraw = (fn) => { ctx.save(); ctx.beginPath(); fn(); ctx.clip(); drawL(); ctx.restore(); };
      const tr = ['wipe', 'splitHorizontal', 'splitVertical', 'blinds', 'checker', 'clockWipe', 'irisWipe', 'diagonalWipe', 'mosaic', 'glass', 'shred'].find((k) => fl.has(k));
      const inT = ep < 1, outT = xp > 0;
      if (!tr || (!inT && !outT) || (tr === 'shred' && !outT) || ((tr === 'mosaic' || tr === 'glass') && !inT)) drawL();
      else {
        const q = inT ? e : 1 - x; // visible amount
        switch (tr) {
          case 'wipe': clipDraw(() => (inT ? ctx.rect(0, 0, W * q, H) : ctx.rect(W * (1 - q), 0, W * q, H))); break;
          case 'splitHorizontal':
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H / 2); ctx.clip(); ctx.translate(-(1 - q) * W, 0); drawL(); ctx.restore();
            ctx.save(); ctx.beginPath(); ctx.rect(0, H / 2, W, H / 2); ctx.clip(); ctx.translate((1 - q) * W, 0); drawL(); ctx.restore(); break;
          case 'splitVertical':
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W / 2, H); ctx.clip(); ctx.translate(0, -(1 - q) * H); drawL(); ctx.restore();
            ctx.save(); ctx.beginPath(); ctx.rect(W / 2, 0, W / 2, H); ctx.clip(); ctx.translate(0, (1 - q) * H); drawL(); ctx.restore(); break;
          case 'blinds': clipDraw(() => { const n = 10, w = W / n; for (let i = 0; i < n; i++) ctx.rect(i * w, 0, w * q + 0.5, H); }); break;
          case 'checker': clipDraw(() => { const n = 8, w = W / n, rows = Math.ceil(H / w); for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) { const d = ((i + j) % 2) * 0.5; const k = clamp(q * 2 - d); if (k > 0) ctx.rect(i * w + w * (1 - k) / 2, j * w + w * (1 - k) / 2, w * k, w * k); } }); break;
          case 'clockWipe': clipDraw(() => { const r = Math.hypot(W, H); ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, r, -PI / 2, -PI / 2 + PI * 2 * q); ctx.closePath(); }); break;
          case 'irisWipe': clipDraw(() => ctx.arc(W / 2, H / 2, Math.max(0.1, Math.hypot(W, H) * 0.5 * q), 0, PI * 2)); break;
          case 'diagonalWipe': clipDraw(() => { const Lh = W + H, k = q * Lh; ctx.moveTo(-H, H); ctx.lineTo(-H + k + H, H); ctx.lineTo(k, 0); ctx.lineTo(-H, 0); ctx.closePath(); }); break;
          case 'mosaic': {
            const n = 12, w = W / n, rows = Math.ceil(H / w);
            clipDraw(() => { for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) if (hash(i, j, 5) < q) ctx.rect(i * w, j * w, w + 0.5, w + 0.5); });
            ctx.fillStyle = pal.accent;
            for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) { const h = hash(i, j, 5); if (h >= q && h < q + 0.18) { ctx.globalAlpha = 0.85; ctx.fillRect(i * w, j * w, w + 0.5, w + 0.5); } }
            break;
          }
          case 'glass': {
            const B = this.layoutCache.size ? null : null; // unused
            const cols = 3, rows = 2, cw = W / cols, rh = H / rows;
            for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) for (let k = 0; k < 2; k++) {
              const x0 = i * cw, y0 = j * rh; const pts = k ? [[x0, y0], [x0 + cw, y0], [x0, y0 + rh]] : [[x0 + cw, y0], [x0 + cw, y0 + rh], [x0, y0 + rh]];
              const hsh = hash(i, j, k); const off = (1 - q);
              ctx.save(); ctx.globalAlpha = clamp(q * 1.5);
              ctx.translate((hsh - 0.5) * W * 0.5 * off, (hash(i, j, k, 2) - 0.5) * H * 0.5 * off);
              const mx = x0 + cw / 2, my = y0 + rh / 2; ctx.translate(mx, my); ctx.rotate((hsh - 0.5) * 0.8 * off); ctx.translate(-mx, -my);
              ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.closePath(); ctx.clip(); drawL(); ctx.restore();
            }
            break;
          }
          case 'shred': {
            const n = 18, w = W / n;
            for (let i = 0; i < n; i++) { const d = x * H * (0.3 + hash(i, 3) * 0.9) * (i % 2 ? 1 : -1); ctx.save(); ctx.globalAlpha = 1 - x * 0.7; ctx.beginPath(); ctx.rect(i * w, 0, w - S * 2 * x, H); ctx.clip(); ctx.translate(0, d); drawL(); ctx.restore(); }
            break;
          }
        }
      }
      ctx.restore();
    }

    drawCredits(ctx, pal, t) {
      const p = this.p, S = this.S, W = this.W, H = this.H;
      const sz = this.minD * 0.024;
      const F = fontOf(p, null);
      const tmpl = `600 {S}px "${F.f.fam}", ${D.JPF}`;
      ctx.save();
      ctx.font = this.fontStr(tmpl, sz);
      ctx.textBaseline = 'alphabetic';
      const parts = [p.title, p.artist].filter(Boolean);
      const txt = parts.join('   /   ');
      const pos = p.creditPos || 'bl';
      const m = W > H ? W * 0.075 : W * 0.085, y = H - H * 0.06;
      ctx.fillStyle = pal.text; ctx.globalAlpha = 0.85;
      if (pos === 'bc') { ctx.textAlign = 'center'; ctx.fillText(txt, W / 2, y); }
      else if (pos === 'br') { ctx.textAlign = 'right'; ctx.fillText(txt, W - m, y); }
      else if (pos === 'tl') { ctx.textAlign = 'left'; ctx.fillText(txt, m, H * 0.075); }
      else { ctx.textAlign = 'left'; ctx.fillStyle = pal.accent; ctx.fillRect(m, y - sz * 0.85, S * 4, sz * 1.05); ctx.fillStyle = pal.text; ctx.fillText(txt, m + S * 14, y); }
      ctx.restore();
    }

    postParams(fl, t, lt, cur, beat, pal) {
      const S = this.S;
      const g = (id) => (fl.has(id) ? fl.get(id) : 0);
      const u = {}; UNI.forEach((n) => (u[n] = 0));
      const burst = Math.max(0, 1 - lt / 0.28);
      const xb = cur ? clamp((t - (cur.ph.vEnd - 0.3)) / 0.3) : 0;
      if (fl.has('glitch')) u.glitch = g('glitch') * (0.18 + burst * 0.9 + (beat > 0.8 ? 0.4 : 0));
      if (fl.has('glitchCut')) u.glitch = Math.max(u.glitch, g('glitchCut') * Math.max(burst, xb) * 1.2), (u.block = Math.max(u.block, g('glitchCut') * Math.max(burst, xb)));
      if (fl.has('blockGlitch')) u.block = Math.max(u.block, g('blockGlitch') * (0.25 + burst * 0.8 + (beat > 0.8 ? 0.3 : 0)));
      if (fl.has('rgb')) u.rgb = S * (3 + beat * 7) * g('rgb');
      u.trgb = fl.has('timeRgb') ? clamp(g('timeRgb')) : 0;
      u.chrom = g('chromatic');
      u.vhs = g('vhs'); u.scan = clamp(g('scanlines') * 0.6, 0, 1); u.crt = g('crt');
      u.noise = g('noise') * 0.45; u.vig = clamp(g('vignette') * 0.55, 0, 1);
      if (fl.has('pixel')) { const k = Math.max(burst * 1.1, xb); u.pix = k > 0.02 ? S * 40 * g('pixel') * k : 0; }
      if (fl.has('blur')) u.blurMix = Math.max(burst, xb) * clamp(g('blur'));
      u.bloom = g('bloom') * 0.7;
      if (fl.has('posterize')) u.poster = Math.max(2, Math.round(6 - g('posterize') * 2));
      if (fl.has('halftone')) u.half_ = Math.max(3, S * 7 * (0.6 + 0.4 * g('halftone')));
      if (fl.has('invert')) u.inv = lt < 0.1 || (this.p.beatSync !== false && beat > 0.9 && Math.floor(t * 4) % 4 === 0) ? 1 : 0;
      if (fl.has('zoomBlur')) u.zblur = (burst + xb) * 2 * g('zoomBlur') + beat * 0.4;
      u.dither = clamp(g('dither'));
      u.sepia = clamp(g('sepia') * 0.7);
      u.heat = g('heat'); u.tilt = clamp(g('tiltShift')); u.mirror = fl.has('mirrorX') ? 1 : 0; u.fish = clamp(g('fisheye') * 0.5, 0, 1);
      if (fl.has('hueCycle')) u.hue = t * 0.6 * g('hueCycle');
      if (fl.has('pixelSort')) u.psort = clamp(g('pixelSort') * (0.22 + burst * 1.2 + xb * 1.2 + beat * 0.45), 0, 2);
      if (fl.has('sliceShift')) u.slice = g('sliceShift') * (burst * 1.3 + xb * 1.3 + (beat > 0.7 ? beat * 0.7 : 0));
      u.liquid = g('liquidWarp') * (0.8 + beat * 0.5);
      u.thermal = clamp(g('thermal') * 0.9);
      if (fl.has('monoBeat')) { u.mono = clamp(g('monoBeat')); u.monoInv = this.p.beatSync !== false && beat > 0.6 ? 1 : 0; }
      u.quad = fl.has('quadMirror') ? 1 : 0;
      if (fl.has('beatZoom')) u.bzoom = (this.p.beatSync !== false ? beat : 0) * 0.07 * g('beatZoom') + burst * 0.05 * g('beatZoom');
      u.lineart = clamp(g('lineArt'));
      if (fl.has('mosaicBeat') && this.p.beatSync !== false && beat > 0.55) u.pix = Math.max(u.pix, S * (10 + 26 * g('mosaicBeat')) * beat);
      u.step = fl.has('stepFrames') ? Math.max(4, Math.round(13 - 6 * clamp(g('stepFrames'), 0, 1.4))) : 0;
      if (fl.has('duotone')) u.duo = clamp(g('duotone') * 0.85);
      u.duoA = U.hex2rgb(mix(pal.bg, '#000000', 0.3)).map((v) => v / 255);
      u.bgc = U.hex2rgb(pal.bg).map((v) => v / 255);
      u.duoB = U.hex2rgb(pal.accent).map((v) => v / 255);
      let gr = [1, 1, 0];
      if (fl.has('contrastPop')) gr = [1 + 0.3 * g('contrastPop'), 1 + 0.35 * g('contrastPop'), 0];
      if (fl.has('bleach')) gr = [gr[0] * (1 + 0.25 * g('bleach')), gr[1] * (1 - 0.5 * clamp(g('bleach'))), 0.02];
      u.grade = gr;
      return u;
    }

    post(info, t, mode) {
      if (!this.useGL) { this.octx.clearRect(0, 0, this.W, this.H); if (mode.key) { this.octx.fillStyle = mode.key; this.octx.fillRect(0, 0, this.W, this.H); } this.octx.drawImage(this.scene, 0, 0); return; }
      const gl = this.gl, u = info.post, U2 = this.u;
      if (u.bloom > 0 || u.blurMix > 0 || u.tilt > 0) {
        const b = this.bctx; b.clearRect(0, 0, this.blurC.width, this.blurC.height);
        b.filter = `blur(${Math.max(1, this.S * 5).toFixed(1)}px)`;
        b.drawImage(this.scene, 0, 0, this.blurC.width, this.blurC.height); b.filter = 'none';
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex[1]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.blurC);
      }
      if (u.trgb > 0) {
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tex[2]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.prev[0]);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.tex[3]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.prev[1]);
      }
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[0]);
      // コマ落ち: only refresh the source texture a few times per second
      const stepK = u.step > 0 ? Math.floor(t * u.step) : null;
      if (stepK == null || stepK !== this._stepK || Math.abs(t - (this._stepT || 0)) > 1) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scene); this._stepT = t; }
      this._stepK = stepK;
      UNI.forEach((n) => gl.uniform1f(U2[n], u[n] || 0));
      gl.uniform2f(U2.R, this.W, this.H); gl.uniform1f(U2.time, t); gl.uniform1f(U2.seed, (this.p.seed || 0) % 97); gl.uniform1f(U2.S, this.S);
      gl.uniform2f(U2.mblur, u.mblur ? u.mblur[0] : 0, u.mblur ? -u.mblur[1] : 0);
      gl.uniform3fv(U2.duoA, u.duoA); gl.uniform3fv(U2.duoB, u.duoB); gl.uniform3fv(U2.grade, u.grade); if (U2.bgc) gl.uniform3fv(U2.bgc, u.bgc || [0, 0, 0]);
      if (mode.key) { const k = U.hex2rgb(mode.key).map((v) => v / 255); gl.uniform4f(U2.key, k[0], k[1], k[2], 1); }
      else gl.uniform4f(U2.key, 0, 0, mode.transparent ? -1 : 0, 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
  Renderer.BLEND = BLEND; Renderer.palOf = palOf; Renderer.tracksOf = tracksOf; Renderer.filtersOf = filtersOf; Renderer.fontOf = fontOf; Renderer.phases = phases;
  return Renderer;
})();
