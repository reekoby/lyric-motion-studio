/* GPU (GLSL) background shaders — VJ-grade animated backgrounds, palette & audio reactive */
'use strict';
LM.shaderbg = (() => {
  const HEAD = `precision highp float;
uniform vec2 R; uniform float T, BEAT, BASS, MID, HIGH;
uniform vec3 C0, C1, C2, C3; // bg, text, accent, sub
#define PI 3.14159265
#define TAU 6.2831853
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec2 h22(vec2 p){float n=h21(p);return vec2(n,h21(p+n));}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 pal4(float t){t=fract(t);vec3 a=mix(C0,C3,smoothstep(0.,.33,t));a=mix(a,C2,smoothstep(.33,.66,t));return mix(a,C1*0.9+C2*0.1,smoothstep(.66,1.,t)*.6);}
vec3 grad(float t){t=clamp(t,0.,1.);return t<.5?mix(C0,C3,t*2.):mix(C3,C2,t*2.-1.);}
float grain(vec2 f){return h21(f+fract(T)*97.)-.5;}
`;
  // each: [name, category, glsl main body using uv (0..1), p (centered, aspect-correct, y up), a (aspect)]
  const S = {
    tunnel: ['インフィニティ・トンネル', 'VJシェーダー', `
      float r=length(p), an=atan(p.y,p.x);
      float z=.35/max(r,.001)+T*(1.2+BASS*1.5);
      float s=step(.5,fract(z*2.+an/PI*3.))*.7+.3;
      float ring=smoothstep(.12,0.,abs(fract(z*.5)-.5));
      vec3 c=mix(C0,grad(fract(z*.1)),s*.7)+C2*ring*(.6+BEAT);
      c*=smoothstep(0.,.35,r);
      gl_FragColor=vec4(c,1.);`],
    kaleido: ['万華鏡フラクタル', 'VJシェーダー', `
      vec2 q=p*1.4; float t=T*.25;
      float an=atan(q.y,q.x), r=length(q); float N=8.;
      an=mod(an,TAU/N); an=abs(an-PI/N); q=vec2(cos(an),sin(an))*r;
      vec3 c=vec3(0.); float acc=0.;
      for(int i=0;i<6;i++){ q=abs(q)-.45-.08*sin(t+float(i)); q*=rot(t*.7+float(i)*.4); q*=1.25; float d=length(q)*exp(-float(i)*.2); acc+=.035/abs(sin(d*6.+T*1.5)); }
      c=mix(C0,grad(fract(acc*.15+t)),clamp(acc*.35,0.,1.))+C2*clamp(acc*.08*(.6+BASS),0.,1.);
      gl_FragColor=vec4(c,1.);`],
    voronoi: ['ボロノイ細胞', 'VJシェーダー', `
      vec2 q=p*4.; vec2 ip=floor(q), fp=fract(q); float d1=9.,d2=9.; vec2 cid;
      for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(i,j); vec2 o=h22(ip+g); o=.5+.45*sin(T*.8+TAU*o); float d=length(g+o-fp); if(d<d1){d2=d1;d1=d;cid=ip+g;}else if(d<d2)d2=d;}
      float edge=smoothstep(.06,0.,d2-d1);
      vec3 c=mix(C0,grad(h21(cid)),.35+.2*sin(T+h21(cid)*6.))+C2*edge*(1.+BEAT);
      gl_FragColor=vec4(c,1.);`],
    warp: ['ドメインワープ（流体インク）', 'VJシェーダー', `
      vec2 q=p*1.6; float t=T*.12;
      vec2 w1=vec2(fbm(q+t),fbm(q+vec2(5.2,1.3)-t));
      vec2 w2=vec2(fbm(q+3.*w1+vec2(1.7,9.2)+t*1.3),fbm(q+3.*w1+vec2(8.3,2.8)));
      float f=fbm(q+3.5*w2);
      vec3 c=mix(C0,C3,clamp(f*f*2.,0.,1.)); c=mix(c,C2,clamp(length(w1)*.9-.2+BASS*.2,0.,1.)); c=mix(c,C1*.85,clamp(w2.x*w2.x*1.2,0.,1.)*.5);
      gl_FragColor=vec4(c+grain(gl_FragCoord.xy)*.04,1.);`],
    hypno: ['ヒプノリング', 'VJシェーダー', `
      float r=length(p), an=atan(p.y,p.x);
      float v=sin(r*28.-T*4.+an*2.+sin(T*.5)*3.*r);
      float w=.25+BEAT*.35;
      vec3 c=mix(C0,mix(C2,C3,.5+.5*sin(an*3.+T)),smoothstep(w,w+.08,v));
      gl_FragColor=vec4(c*(1.-r*.35),1.);`],
    terrain: ['ワイヤーフレーム山脈', 'VJシェーダー', `
      float hz=.15; vec3 c=mix(C0,C3*.7,smoothstep(-.6,.6,p.y));
      vec2 sp=p-vec2(0.,.35); float sun=smoothstep(.32,.3,length(sp)); float bands=step(.5,fract(sp.y*18.-T*.6))+step(.1,sp.y+.02);
      c=mix(c,mix(C2,vec3(1.,.9,.5),smoothstep(-.3,.3,sp.y)),sun*min(bands,1.));
      if(p.y<hz){ float y=hz-p.y; float z=.6/y; vec2 g=vec2(p.x*z, z+T*2.5);
        float hgt=fbm(g*.25)*2.5*smoothstep(.0,1.5,abs(p.x*z));
        vec2 gl=abs(fract(g+vec2(0.,hgt*.3))-.5); float line=smoothstep(.06*z*.15+.02,0.,min(gl.x,gl.y));
        vec3 gc=C2*line*(1.+BASS)+C0*.4; c=mix(gc,c,smoothstep(3.,14.,z)); }
      gl_FragColor=vec4(c,1.);`],
    hyperspace: ['ハイパースペース', 'VJシェーダー', `
      float an=atan(p.y,p.x), r=length(p); vec3 c=C0*.5;
      for(int i=0;i<3;i++){ float fi=float(i); float n=floor(an*40./PI+fi*13.); float h=h21(vec2(n,fi)); float sp=.4+h*1.5; float z=fract(h*7.+T*sp*(.6+BASS)); float len=.05+z*.35;
        float d=abs(r-z*1.3); float s=smoothstep(len,0.,d)*smoothstep(.0,.2,z)*step(.93,fract(an*40./PI+fi*13.)+.07); c+=mix(C1,C2,h)*s*1.2; }
      gl_FragColor=vec4(c,1.);`],
    mesh: ['メッシュグラデーション', 'グラデーション', `
      vec2 a1=vec2(sin(T*.21),cos(T*.17))*.6, a2=vec2(cos(T*.13+1.),sin(T*.19+2.))*.6, a3=vec2(sin(T*.11+4.),cos(T*.23+1.))*.6, a4=vec2(cos(T*.17+3.),sin(T*.15))*.6;
      vec3 c=vec3(0.); float ws=0.;
      float w=1./pow(length(p-a1)+.15,2.);c+=C2*w;ws+=w; w=1./pow(length(p-a2)+.15,2.);c+=C3*w;ws+=w; w=1./pow(length(p-a3)+.15,2.);c+=C0*w;ws+=w; w=1./pow(length(p-a4)+.15,2.);c+=mix(C1,C2,.5)*w;ws+=w;
      c/=ws; gl_FragColor=vec4(c+grain(gl_FragCoord.xy)*.06,1.);`],
    holo: ['ホログラム（虹色）', 'グラデーション', `
      float n=fbm(p*2.+T*.1); float t=n*2.+p.x*.6+p.y*.4+T*.1;
      vec3 rb=.5+.5*cos(TAU*(t+vec3(0.,.33,.67)));
      vec3 c=mix(rb,mix(C2,C3,.5),.35)*(.75+.35*smoothstep(.3,.8,n)); c=mix(c,vec3(1.),pow(smoothstep(.55,.9,n),3.)*.5);
      gl_FragColor=vec4(c+grain(gl_FragCoord.xy)*.04,1.);`],
    truchet: ['トルシェ模様', 'パターン', `
      vec2 q=p*6.+vec2(T*.3,0.); vec2 id=floor(q), f=fract(q)-.5; float h=h21(id); if(h>.5)f.x=-f.x;
      float d=abs(abs(f.x+f.y)-.5)/1.414; d=min(abs(length(f-.5)-.5),abs(length(f+.5)-.5));
      float line=smoothstep(.07,.04,d); float flow=.5+.5*sin(atan(f.y-.5*sign(f.x+f.y),f.x-.5*sign(f.x+f.y))*4.-T*3.);
      vec3 c=mix(C0,mix(C3,C2,flow),line);
      gl_FragColor=vec4(c,1.);`],
    opart: ['オプアート', 'パターン', `
      vec2 q=p; q+=.15*vec2(sin(q.y*4.+T),cos(q.x*3.-T*.8));
      float v=step(.5,fract((q.x+q.y*.2)*14.+sin(length(q)*6.-T*2.)*.8));
      vec3 c=mix(C0,C1,v); c=mix(c,C2,smoothstep(.25,.0,abs(length(p)-.35-.05*BASS))*.8);
      gl_FragColor=vec4(c,1.);`],
    hexglow: ['ヘキサゴン・パルス', 'パターン', `
      vec2 q=p*6.; vec2 s=vec2(1.,1.732); vec2 a=mod(q,s)-s*.5, b=mod(q-s*.5,s)-s*.5; vec2 g=dot(a,a)<dot(b,b)?a:b; vec2 id=q-g;
      vec2 h=abs(g); float e=max(dot(h,normalize(vec2(1.,1.732))),h.x); float edge=smoothstep(.045,.0,.5-e);
      float pulse=pow(.5+.5*sin(length(id)*.7-T*3.-BASS*3.),3.);
      vec3 c=C0*.8+mix(C3,C2,pulse)*edge*(.5+pulse*1.2)+C2*pulse*.18*(1.-edge);
      gl_FragColor=vec4(c,1.);`],
    checker: ['チェッカー床（レトロ3D）', 'パターン', `
      vec3 c=mix(C0,C3,smoothstep(-.2,.6,p.y));
      if(p.y<0.){ float z=.5/(-p.y); vec2 g=vec2(p.x*z, z+T*3.); float ch=mod(floor(g.x)+floor(g.y),2.); vec3 fc=mix(C0,C2,ch*.8); c=mix(fc,c,smoothstep(2.,25.,z)); }
      c+=C2*smoothstep(.04,0.,abs(p.y))*.8;
      gl_FragColor=vec4(c,1.);`],
    water: ['水面のゆらめき', '自然', `
      vec2 q=p*3.; float t=T*.6; float h=0.;
      for(int i=0;i<4;i++){ float fi=float(i); vec2 d=vec2(cos(fi*1.7),sin(fi*2.3)); h+=sin(dot(q,d)*(2.+fi)+t*(1.+fi*.3))/(1.+fi); }
      float cst=pow(.5+.5*sin(h*3.+fbm(q+t)*4.),6.);
      vec3 c=mix(C0,C3,.35+.15*h)+mix(C1,C2,.3)*cst*.8;
      gl_FragColor=vec4(c,1.);`],
    fire: ['炎（シェーダー）', '自然', `
      vec2 q=vec2(p.x*1.5,p.y+.6); float n=fbm(vec2(q.x*3.,q.y*2.-T*2.2))*1.2; float h=clamp(1.-(q.y+.2)*1.1,0.,1.);
      float f=clamp(n*h*1.8-.15+BASS*.15,0.,1.);
      vec3 c=mix(C0,vec3(.55,.05,.02),smoothstep(.1,.35,f)); c=mix(c,vec3(1.,.42,.08),smoothstep(.35,.6,f)); c=mix(c,vec3(1.,.85,.4),smoothstep(.6,.85,f)); c=mix(c,vec3(1.),smoothstep(.9,1.,f));
      gl_FragColor=vec4(c,1.);`],
    galaxy: ['渦巻銀河', '自然', `
      float r=length(p), an=atan(p.y,p.x); float arms=sin(an*2.-log(r+.001)*5.+T*.4); float d=exp(-r*2.2);
      float n=fbm(p*6.+T*.05); vec3 c=C0*.6+mix(C3,C2,n)*smoothstep(-.2,1.,arms)*d*1.5+C1*pow(d,4.)*.8;
      c+=vec3(1.)*step(.996,h21(floor(gl_FragCoord.xy)))*.8;
      gl_FragColor=vec4(c,1.);`],
    blobs: ['メタボール（ぬめり）', 'グラデーション', `
      float v=0.; for(int i=0;i<6;i++){ float fi=float(i); vec2 c=vec2(sin(T*(.3+fi*.07)+fi*2.),cos(T*(.25+fi*.05)+fi))*.5; v+=(.03+.01*BASS)/dot(p-c,p-c); }
      float m=smoothstep(.9,1.,v); float rim=smoothstep(.8,.95,v)-m;
      vec3 c=mix(C0,mix(C3,C2,clamp(v*.3,0.,1.)),m)+C1*rim*.9;
      gl_FragColor=vec4(c,1.);`],
    laserGrid: ['レーザーグリッド', 'VJシェーダー', `
      vec3 c=C0*.4;
      for(int i=0;i<8;i++){ float fi=float(i); float a=sin(T*.7+fi)*1.2; vec2 o=vec2((fi-3.5)*.25,-.8); vec2 d=vec2(sin(a),cos(a)); float dist=abs(dot(p-o,vec2(-d.y,d.x))); c+=mix(C2,C3,mod(fi,2.))*(.003/dist)*(0.6+BEAT); }
      float scan=smoothstep(.02,0.,abs(fract(p.y*.5-T*.4)-.5)); c+=C2*scan*.3;
      gl_FragColor=vec4(c,1.);`],
    dotwave: ['3Dドットの波', 'パターン', `
      vec2 q=p*18.; vec2 id=floor(q), f=fract(q)-.5; vec2 cp=id/18.; float h=sin(length(cp)*8.-T*3.)*.5+.5+BASS*.3;
      float r=.12+.3*h; float d=smoothstep(r,r-.08,length(f));
      vec3 c=mix(C0,mix(C3,C2,h),d);
      gl_FragColor=vec4(c,1.);`],
    glitchBars: ['データモッシュ・バー', 'VJシェーダー', `
      float row=floor(uv.y*28.); float k=floor(T*6.+h21(vec2(row,1.))*4.); float o=h21(vec2(row,k));
      float x=fract(uv.x*(1.+o*3.)+T*(o-.5)*.6); float band=step(.45+.2*sin(T+row),x);
      vec3 c=mix(C0,mix(C2,C3,o),band*step(.3,o)); c+=C1*step(.985,h21(vec2(floor(uv.x*90.),k+row)))*.8;
      c*= .85+.15*sin(uv.y*R.y*1.5);
      gl_FragColor=vec4(c,1.);`],
    curtain: ['オーロラカーテン', '自然', `
      vec3 c=C0*.7; for(int i=0;i<4;i++){ float fi=float(i); float x=p.x*1.5+fi*.7+sin(p.y*2.+T*.3+fi)*.3; float v=pow(.5+.5*sin(x*6.+T*(.4+fi*.1)),8.)*smoothstep(-.8,.4,p.y)*smoothstep(1.,.2,p.y);
        c+=mix(C3,C2,fi/3.)*v*(.5+.5*fbm(vec2(x*3.,p.y*6.-T*.5))); }
      gl_FragColor=vec4(c,1.);`],
    chrome: ['リキッドクローム', 'グラデーション', `
      vec2 q=p*1.1; float t=T*.12; float e=.03; float n=fbm(q+t); vec2 nrm=vec2(fbm(q+vec2(e,0.)+t)-n,fbm(q+vec2(0.,e)+t)-n)/e;
      float refl=.5+.5*sin(nrm.x*.9+nrm.y*1.3+p.y*3.+T*.4);
      vec3 c=mix(mix(C0,C3,.35),mix(C1,C2,.35),smoothstep(.15,.85,refl)); c+=vec3(1.)*pow(refl,14.)*.7; c*=.8+.25*n;
      gl_FragColor=vec4(c,1.);`],
    spiral: ['スパイラル・バースト', 'VJシェーダー', `
      float r=length(p), an=atan(p.y,p.x); float v=sin(an*6.+log(r+.001)*6.-T*3.);
      vec3 c=mix(C0,mix(C2,C3,.5+.5*sin(r*4.-T)),smoothstep(-.1,.1,v)*(.7+BEAT*.3)); c*=smoothstep(0.,.15,r)*.9+.1;
      gl_FragColor=vec4(c,1.);`],
    spheres: ['レイマーチ・球体空間', 'VJシェーダー（3D）', `
      vec3 ro=vec3(0.,0.,T*1.5), rd=normalize(vec3(p,1.2)); rd.xy*=rot(T*.1); float t=0.; float g=0.;
      for(int i=0;i<48;i++){ vec3 q=ro+rd*t; q=mod(q,2.)-1.; float d=length(q)-.28-.06*BASS; g+=.012/(.02+abs(d)); if(d<.001)break; t+=d; if(t>20.)break; }
      float fog=exp(-t*.12); vec3 c=mix(C0,mix(C3,C2,fog),fog)+C2*g*.04;
      gl_FragColor=vec4(c,1.);`],
    cubes: ['レイマーチ・ネオン立方体', 'VJシェーダー（3D）', `
      vec3 ro=vec3(sin(T*.3)*.5,cos(T*.2)*.3,T*2.), rd=normalize(vec3(p,1.)); rd.xy*=rot(sin(T*.2)*.5); float t=0.,g=0.;
      for(int i=0;i<50;i++){ vec3 q=ro+rd*t; q=mod(q,3.)-1.5; q.xy*=rot(T*.5); vec3 b=abs(q)-vec3(.45); float d=length(max(b,0.))+min(max(b.x,max(b.y,b.z)),0.);
        float e=abs(d); g+=.015/(.03+e*e*40.); if(d<.001)break; t+=max(d,.02); if(t>25.)break; }
      vec3 c=C0*.7+mix(C2,C3,.5+.5*sin(t*.3))*g*.16*(1.+BEAT); c*=exp(-t*.03)+.35;
      gl_FragColor=vec4(c,1.);`],
    grainGrad: ['グレイン・グラデーション', 'グラデーション', `
      float t=uv.x*.6+uv.y*.4+sin(T*.2)*.2+fbm(p*1.2+T*.05)*.5; vec3 c=grad(t); c=mix(c,C2,smoothstep(.6,1.,fbm(p*2.-T*.08))*.5);
      gl_FragColor=vec4(c+grain(gl_FragCoord.xy)*.12,1.);`],
    ripplesGL: ['波紋（シェーダー）', '自然', `
      float v=0.; for(int i=0;i<5;i++){ float fi=float(i); float per=2.5+fi*.4; float ph=fract(T/per+fi*.23); vec2 c=vec2(h21(vec2(fi,floor(T/per+fi*.23)))-.5,h21(vec2(fi+7.,floor(T/per+fi*.23)))-.5)*1.4; float r=length(p-c); v+=sin((r-ph*1.2)*60.)*exp(-abs(r-ph*1.2)*14.)*(1.-ph); }
      vec3 c=mix(C0,C3,.3)+mix(C1,C2,.4)*clamp(v,0.,1.)*.7-C0*clamp(-v,0.,1.)*.3;
      gl_FragColor=vec4(c,1.);`],
    rainGlass: ['雨の窓ガラス', '自然', `
      vec2 q=uv*vec2(R.x/R.y,1.)*vec2(18.,6.); vec2 id=floor(q); float h=h21(id); vec2 f=fract(q)-.5; float ty=fract(T*.2*(0.5+h)+h)*2.-1.;
      vec2 dp=vec2(f.x+sin(q.y*.5+T)*.05, (f.y+ty)*.35); float drop=smoothstep(.09,.06,length(dp)); float trail=smoothstep(.04,.0,abs(f.x))*step(f.y,-ty)*smoothstep(-.5,-ty,f.y)*.5;
      vec2 off=(drop+trail)*vec2(.02,.03); float bl=fbm((uv+off)*3.+T*.02);
      vec3 bg=mix(C0,mix(C3,C2,bl),.35+.3*bl); float rim=smoothstep(.1,.08,length(dp))-drop; vec3 c=bg*(.7)+ (drop*.9+trail*.4)*mix(C1,vec3(1.),.5)*.55 - rim*.25;
      gl_FragColor=vec4(c,1.);`],
  };

  class ShaderBG {
    constructor() { this.cv = document.createElement('canvas'); this.ok = false; this.progs = {}; try { this.gl = this.cv.getContext('webgl', { preserveDrawingBuffer: true, alpha: false, antialias: false }); this.ok = !!this.gl; } catch (e) {} if (this.ok) this.init(); }
    init() {
      const gl = this.gl;
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    }
    prog(id) {
      if (this.progs[id] !== undefined) return this.progs[id];
      const gl = this.gl, sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn('shader', id, gl.getShaderInfoLog(o)); return null; } return o; };
      const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 v;void main(){gl_Position=vec4(v,0.,1.);}');
      const fs = sh(gl.FRAGMENT_SHADER, HEAD + 'void main(){vec2 uv=gl_FragCoord.xy/R;float a=R.x/R.y;vec2 p=(gl_FragCoord.xy-.5*R)/R.y;' + S[id][2] + '}');
      if (!vs || !fs) return (this.progs[id] = null);
      const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(pr)); return (this.progs[id] = null); }
      const u = {}; ['R', 'T', 'BEAT', 'BASS', 'MID', 'HIGH', 'C0', 'C1', 'C2', 'C3'].forEach((n) => (u[n] = gl.getUniformLocation(pr, n)));
      return (this.progs[id] = { pr, u, loc: gl.getAttribLocation(pr, 'v') });
    }
    render(id, W, H, t, pal, au) {
      if (!this.ok || !S[id]) return null;
      const P = this.prog(id); if (!P) return null;
      const gl = this.gl;
      if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
      gl.viewport(0, 0, W, H); gl.useProgram(P.pr);
      gl.enableVertexAttribArray(P.loc); gl.vertexAttribPointer(P.loc, 2, gl.FLOAT, false, 0, 0);
      const c = (h) => LM.U.hex2rgb(h).map((v) => v / 255);
      gl.uniform2f(P.u.R, W, H); gl.uniform1f(P.u.T, t); gl.uniform1f(P.u.BEAT, au.beat || 0); gl.uniform1f(P.u.BASS, au.bass || 0); gl.uniform1f(P.u.MID, au.mid || 0); gl.uniform1f(P.u.HIGH, au.high || 0);
      gl.uniform3fv(P.u.C0, c(pal.bg)); gl.uniform3fv(P.u.C1, c(pal.text)); gl.uniform3fv(P.u.C2, c(pal.accent)); gl.uniform3fv(P.u.C3, c(pal.sub));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return this.cv;
    }
    dispose() { const e = this.gl && this.gl.getExtension('WEBGL_lose_context'); e && e.loseContext(); }
  }

  // register into the background-motion library as full-frame GPU layers
  Object.entries(S).forEach(([id, [n, c]]) => {
    LM.bgm.lib['gl_' + id] = { n, c, full: true, gpu: id, f: () => {} };
  });
  LM.bgm.cats.unshift('VJシェーダー', 'VJシェーダー（3D）', 'グラデーション', 'パターン', '自然');
  return { ShaderBG, list: S };
})();
