/* GPU-rendered realistic graphics (replaces flat 2D versions that read as cheap):
 *  club    — mirror ball with real facets reflecting a lit room + volumetric beams and wandering light spots,
 *            emissive dance floor with grout / glow / sheen, moving-head beams with haze and gobo breakup
 *  horizon — synthwave scene (slit sun, ridge silhouettes with rim light, anti-aliased perspective grid,
 *            sun reflection, haze), sunset over the sea (scattering sky, lit clouds, wave normals, fresnel,
 *            sun glitter path) and the same sea at dusk without the sun
 *  liquid  — rising liquid (sloshing surface, meniscus, caustics, light shafts, bubbles), lava lamp
 *            (shaded metaballs with subsurface glow and fresnel rim), glossy liquid paint flow
 *  paint   — impasto brush strokes (bristle streaks, ridged edges, dry-brush breakup, wet gloss), paint
 *            splat accent; transitions: dry brush, marker scribble, liquid, paint drip, ink bloom, splash
 * All shaders are premultiplied-alpha layers drawn with drawImage; if WebGL is unavailable the previous
 * 2D painters stay in place. */
'use strict';
(() => {
  const { clamp, hash } = LM.U, E = LM.E;
  const BG = LM.bgm.lib, TR = LM.trans.lib, G = LM.gfx.lib;

  const HEAD = `#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives : enable
#endif
precision highp float;
uniform vec2 R; uniform float T,U,SEED,BEAT,BASS,BT; uniform vec4 OPT; uniform vec3 C0,C1,C2,C3;
#define PI 3.14159265
#define TAU 6.2831853
#ifdef GL_OES_standard_derivatives
float FW(float x){return fwidth(x);}
#else
float FW(float x){return 1.5/R.y;}
#endif
float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
float h21(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*vn(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
float fbm3(vec2 p){float v=0.,a=.5;for(int i=0;i<3;i++){v+=a*vn(p);p=p*2.07+vec2(3.1,1.3);a*=.5;}return v;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float grain(){return h21(gl_FragCoord.xy+fract(T*.7)*91.)-.5;}
`;
  const S = {};

  /* ---------------- club ---------------- */
  S.disco = `
  vec2 bc=vec2(0.,.29); float br=.12+.004*BEAT; vec2 d=p-bc; float dist=length(d), ang=atan(d.y,d.x);
  float haze=.45+1.1*fbm(p*2.6+vec2(T*.04,-T*.025));
  vec3 L=vec3(0.);
  for(int i=0;i<18;i++){ float fi=float(i); float a0=fi/18.*TAU+T*.32+h11(fi+SEED)*.5;
    float da=abs(mod(ang-a0+PI,TAU)-PI); float w=(.012+.02*h11(fi*7.1))*(1.+dist*.6);
    float k=(exp(-(da*da)/(w*w))*.75+exp(-(da*da)/(w*w*.08))*.5)*smoothstep(br,br*1.7,dist)*exp(-dist*1.1);
    vec3 c=mod(fi,3.)<1.?C2:(mod(fi,3.)<2.?C3:mix(C1,vec3(1.),.5));
    L+=c*k*(.55+.7*h11(fi*3.+floor(T*1.5)));}
  L*=haze*(.55+.45*BEAT);
  L+=mix(C2,C3,.5)*exp(-max(dist-br,0.)*5.)*.35*haze;
  for(int i=0;i<44;i++){ float fi=float(i); float a0=h11(fi*1.7+SEED)*TAU+T*(.22+.08*h11(fi)); float rr=.3+h11(fi*3.1)*1.;
    vec2 sp=bc+vec2(cos(a0)*rr*1.7,sin(a0)*rr*.8-.12); vec2 q=(p-sp)*vec2(1.,1.25); float s=length(q); float sz=.008+.012*h11(fi*5.3);
    vec3 c=mix(C2,C3,h11(fi*9.)); c=mix(c,vec3(1.),.25);
    L+=c*(smoothstep(sz,sz*.25,s)*1.1+exp(-s*s/(sz*sz*10.))*.35);}
  vec3 col=L; float a=clamp(lum(L)*1.1,0.,1.);
  float wire=smoothstep(1.5/R.y,0.,abs(p.x))*step(bc.y+br*.95,p.y); col=mix(col,vec3(.55),wire*.9); a=max(a,wire*.9);
  if(dist<br+2./R.y){
    vec2 q=d/br; float z=sqrt(max(0.,1.-dot(q,q))); vec3 n=vec3(q,z);
    float sp=T*.55; mat2 Ry=rot(sp); vec3 nr=n; nr.xz=Ry*n.xz;
    float lat=asin(clamp(nr.y,-1.,1.)), lon=atan(nr.x,nr.z);
    float NL=34.; float fl=(lat/PI+.5)*NL; float li=floor(fl); float latc=((li+.5)/NL-.5)*PI;
    float nlon=max(4.,floor(NL*2.*cos(latc)+.5)); float fo=(lon/TAU+.5)*nlon; float lo=floor(fo); float lonc=((lo+.5)/nlon-.5)*TAU;
    float gx=fract(fl), gy=fract(fo); float gr=smoothstep(0.,.1,gx)*smoothstep(1.,.9,gx)*smoothstep(0.,.1,gy)*smoothstep(1.,.9,gy);
    vec3 fn=vec3(cos(latc)*sin(lonc),sin(latc),cos(latc)*cos(lonc)); fn.xz=rot(-sp)*fn.xz;
    float tilt=h21(vec2(li,lo)+SEED); fn=normalize(fn+vec3(tilt-.5,h21(vec2(lo,li))-.5,0.)*.08);
    vec3 rd=reflect(vec3(0.,0.,-1.),fn);
    float rm=fbm3(rd.xy*3.+rd.z);
    vec3 env=vec3(.16+.22*rm)+C2*pow(max(dot(rd,normalize(vec3(-.7,.25,.65))),0.),5.)*.9+C3*pow(max(dot(rd,normalize(vec3(.4,-.55,.7))),0.),5.)*.8
      +vec3(1.)*pow(max(dot(rd,normalize(vec3(.55,.6,.58))),0.),90.)*9.+mix(C1,vec3(1.),.5)*pow(max(dot(rd,normalize(vec3(-.2,.9,.3))),0.),20.)*.9;
    env*=.55+.9*tilt+.5*BEAT*step(.8,tilt);
    vec3 bcol=mix(vec3(.015),env,gr)*(.35+.65*z)+mix(C2,vec3(1.),.5)*pow(1.-z,3.)*.25;
    bcol=aces(bcol*1.4);
    float ba=smoothstep(br,br-1.5/R.y,dist);
    col=col*(1.-ba)+bcol*ba; a=a+(1.-a)*ba;
  }
  for(int i=0;i<5;i++){ float fi=float(i); float la=(h11(fi*4.1+SEED)-.5)*1.2, lo=h11(fi*2.3+SEED)*TAU+T*.55;
    vec3 n=vec3(cos(la)*sin(lo),sin(la),cos(la)*cos(lo)); if(n.z<.15) continue;
    vec2 g=bc+n.xy*br; vec2 q=p-g; float fl=pow(.5+.5*sin(T*2.3+fi*2.1),6.)*smoothstep(.15,.5,n.z);
    float st=(exp(-abs(q.x)*260.)*exp(-abs(q.y)*18.)+exp(-abs(q.y)*260.)*exp(-abs(q.x)*18.))*.9+exp(-dot(q,q)*9000.)*1.5;
    col+=vec3(1.)*st*fl; a=clamp(a+st*fl,0.,1.); }
  gl_FragColor=vec4(col,a);`;

  S.floor = `
  float hy=.44; float a=0.; vec3 col=vec3(0.);
  if(uv.y<hy+.02){
    float dy=max(hy-uv.y,.0015); float z=.32/dy; float x=p.x*z;
    vec2 w=vec2(x*2.4,z*1.6+T*.25); vec2 id=floor(w), f=fract(w)-.5;
    float bt=floor(BT); float on=step(.42,h21(id+vec2(bt*3.1,bt*1.7)+SEED))*(.55+.45*step(.5,h21(id*1.3+bt)));
    vec3 tc=h21(id+7.1)<.33?C2:(h21(id+7.1)<.66?C3:mix(C1,C2,.5));
    float bx=max(abs(f.x),abs(f.y)); float aaw=FW(w.x)+FW(w.y);
    float tile=smoothstep(.5,.5-.04-aaw,bx);
    float inner=1.-smoothstep(.0,.48,bx);
    vec3 em=tc*on*(.45+1.1*inner*inner)*(.7+.6*BEAT);
    vec3 base=mix(vec3(.025),C0*.25,.5);
    col=mix(vec3(.008),base+em,tile)+em*.15;
    float sheen=exp(-pow((p.x-sin(T*.25)*.5)*2.2,2.))*exp(-dy*6.)*.25; col+=vec3(.9,.95,1.)*sheen*tile;
    float refl=smoothstep(.6,1.,vn(vec2(x*3.,z*.3)))*.12; col+=mix(C2,C3,.5)*refl*tile;
    float fog=exp(-z*.06); col=mix(mix(C0*.5,tc*.25,.3),col,fog);
    col=aces(col*1.3);
    a=smoothstep(hy+.01,hy-.03,uv.y);
  }
  float glow=exp(-abs(uv.y-hy)*30.)*.35*(.7+.5*BEAT); col+=mix(C2,C3,.5)*glow; a=clamp(a+glow,0.,1.);
  gl_FragColor=vec4(col*min(1.,a+glow),a);`;

  S.beams = `
  vec3 L=vec3(0.); float haze=.35+1.2*fbm(p*2.2+vec2(T*.05,T*.02));
  for(int i=0;i<6;i++){ float fi=float(i); vec2 pos=vec2((fi/5.-.5)*1.5*(R.x/R.y)*.8,-.52);
    float th=PI*.5+sin(T*(.35+.12*h11(fi+SEED))+fi*1.9)*.62; vec2 dir=vec2(cos(th),sin(th)); vec2 nrm=vec2(-dir.y,dir.x);
    vec2 v=p-pos; float al=dot(v,dir), pe=dot(v,nrm); float wd=.012+al*.11;
    float k=exp(-pe*pe/(wd*wd)*2.2)*smoothstep(0.,.04,al)*exp(-al*.55);
    float gobo=.6+.4*smoothstep(.2,.8,vn(vec2(pe/max(al,.05)*30.+fi*7.,T*.4)));
    vec3 c=mod(fi,2.)<1.?C2:C3; c=mix(c,vec3(1.),.15);
    L+=c*k*gobo*(.6+.6*h11(fi*5.+floor(BT)))*1.4;
    float lens=length(v-dir*.012); L+=mix(c,vec3(1.),.6)*(exp(-lens*lens*5000.)*2.+exp(-lens*40.)*.35);
    L+=mix(c,vec3(1.),.5)*exp(-abs(v.y+.005)*500.)*exp(-abs(v.x)*14.)*.6; }
  L*=haze*(.75+.6*BEAT);
  gl_FragColor=vec4(L,clamp(lum(L)*1.15,0.,1.));`;

  /* ---------------- horizon ---------------- */
  S.synth = `
  float sunOn=OPT.x, hU=1.-OPT.y; float ar=R.x/R.y; vec3 col;
  vec3 glowC=mix(C2,vec3(1.,.37,.64),.25), lineC=mix(C2,C3,.35);
  if(uv.y>=hU){
    float g=(uv.y-hU)/(1.-hU);
    vec3 skyLo=mix(mix(C2,C3,.45),vec3(1.),.06), skyMid=mix(C0,C3,.35), skyHi=C0*.55;
    col=mix(skyLo,skyMid,smoothstep(0.,.45,g)); col=mix(col,skyHi,smoothstep(.35,1.,g));
    vec2 gs=floor(gl_FragCoord.xy/2.); float st=step(.9975,h21(gs+SEED)); col+=vec3(1.)*st*(.4+.6*pow(.5+.5*sin(T*2.+h21(gs)*40.),3.))*smoothstep(.25,.8,g);
    if(sunOn>.5){
      float r=.27; vec2 sc=vec2(0.,hU-.5+r*.55); float sd=length(p-sc);
      col+=glowC*exp(-max(sd-r,0.)*5.)*.55*(1.+.25*BEAT);
      float sunMask=smoothstep(r+1.2/R.y,r-1.2/R.y,sd);
      float yy=(p.y-(sc.y-r))/(2.*r);
      vec3 sunC=mix(mix(C2,vec3(1.,.24,.5),.4),mix(vec3(1.,.83,.42),vec3(1.,.97,.8),.5),smoothstep(.0,1.,yy));
      float band=0.; if(yy<.6){ float per=.085; float k=fract(yy/per+T*.45); float gw=.12+.6*(1.-yy/.6); float aa2=FW(yy/per)*1.2; band=smoothstep(1.-gw-aa2,1.-gw+aa2,k)*smoothstep(.6,.56,yy); }
      col=mix(col,sunC*1.15,sunMask*(1.-band));
    }
    float rx=uv.x*ar;
    float r1=hU+(.55*abs(vn(vec2(rx*2.2+.3,SEED))-.5)*2.+.45*abs(vn(vec2(rx*5.3,SEED+3.))-.5)*2.)*.13*(.35+.65*smoothstep(0.,.35,abs(uv.x-.5)));
    float r2=hU+(.6*abs(vn(vec2(rx*3.6+7.,SEED+1.))-.5)*2.+.4*abs(vn(vec2(rx*8.,SEED+5.))-.5)*2.)*.07*(.4+.6*smoothstep(0.,.4,abs(uv.x-.5)));
    if(uv.y<r1){ float k=(r1-uv.y)/.13; vec3 m=mix(mix(C0,C3,.25),C0*.35,smoothstep(0.,1.,k)); col=m+glowC*exp(-(r1-uv.y)*R.y*.12)*.6; }
    if(uv.y<r2){ float k=(r2-uv.y)/.07; vec3 m=mix(C0*.45,C0*.2,smoothstep(0.,1.,k)); col=m+glowC*exp(-(r2-uv.y)*R.y*.15)*.9; }
  } else {
    float dy=hU-uv.y; float z=.22/max(dy,.001); float x=p.x*z;
    float zw=z+T*1.4*OPT.z; float lx=abs(fract(x*1.6+.5)-.5)/max(FW(x*1.6),1e-4), lz=abs(fract(zw*.8+.5)-.5)/max(FW(zw*.8),1e-4);
    float line=1.-min(min(lx,lz)/1.4,1.);
    float halo=exp(-min(abs(fract(x*1.6+.5)-.5)/max(FW(x*1.6),1e-4),abs(fract(zw*.8+.5)-.5)/max(FW(zw*.8),1e-4))*.25);
    vec3 fl=mix(mix(C0,glowC,.25),C0*.25,smoothstep(0.,.35,dy));
    float fade=exp(-z*.035);
    col=fl+lineC*(line*1.2+halo*.28*(1.+.6*BEAT))*fade;
    if(sunOn>.5){ float rf=exp(-pow(p.x/(.12+dy*.4),2.))*exp(-dy*3.)*(.65+.35*sin(zw*12.+T*3.)); col+=glowC*rf*.55; }
  }
  col+=glowC*exp(-abs(uv.y-hU)*R.y*.045)*.55;
  col*=1.-.35*pow(length(uv-.5)*1.3,2.);
  gl_FragColor=vec4(col+grain()*.025,1.);`;

  S.sea = `
  float sunK=OPT.x, hU=1.-OPT.y; vec3 col;
  vec2 sp=vec2(.2,hU-.5+.045+.01*sin(T*.03));
  vec3 hor=mix(vec3(1.,.42,.1),C2,.12), pink=mix(vec3(.95,.32,.42),C3,.18), purp=mix(vec3(.36,.16,.45),C0,.25), top=mix(vec3(.05,.05,.17),C0,.3);
  if(sunK<.5){ hor=mix(vec3(.85,.42,.45),C2,.25); pink=mix(vec3(.55,.32,.55),C3,.25); }
  vec3 sunC=vec3(1.,.86,.58);
  if(uv.y>=hU){
    float g=(uv.y-hU)/(1.-hU);
    col=mix(hor,pink,smoothstep(0.,.16,g)); col=mix(col,purp,smoothstep(.12,.45,g)); col=mix(col,top,smoothstep(.4,1.,g));
    vec2 dq=p-sp; float sd=length(dq);
    col+=vec3(1.,.55,.2)*(exp(-sd*2.2)*.55+exp(-sd*9.)*.7)*sunK;
    col+=vec3(1.,.5,.2)*exp(-abs(uv.y-hU)*16.)*exp(-abs(dq.x)*1.3)*.6*sunK;
    float st=fbm(vec2(p.x*1.1+T*.004,(uv.y-hU)*16.)+vec2(0.,SEED))*.7+fbm(vec2(p.x*4.+T*.01,(uv.y-hU)*40.))*.3;
    float band=smoothstep(.03,.1,g)*smoothstep(.5,.2,g);
    float cd=smoothstep(.5,.7,st)*band;
    float lit=exp(-sd*2.)*sunK;
    vec3 under=mix(mix(purp,pink,.35),mix(vec3(1.,.55,.3),vec3(1.,.8,.6),lit),.25+.75*lit);
    float lining=smoothstep(.5,.56,st)*(1.-smoothstep(.56,.66,st))*lit*1.5;
    col=mix(col,under,cd*.92)+vec3(1.,.75,.45)*lining*band;
    col+=vec3(1.,.62,.28)*exp(-sd*38.)*1.2*sunK;
    col=mix(col,sunC*4.,smoothstep(.026,.022,sd)*sunK);
  } else {
    float dy=hU-uv.y; float z=.05/max(dy,.0006); vec2 wp=vec2(p.x*z,z);
    float e=.004*z+.002;
    float h0=0.,hx=0.,hz=0.;
    float fr=1.2, am=.06;
    for(int i=0;i<8;i++){ float fi=float(i); vec2 dir=normalize(vec2(cos(fi*2.39+.4)*.9,1.)); float sp2=sqrt(fr)*.9; float at=am*exp(-fr*e*1.2);
      h0+=at*sin(dot(wp,dir)*fr+T*sp2+fi*1.3); hx+=at*sin(dot(wp+vec2(e,0.),dir)*fr+T*sp2+fi*1.3); hz+=at*sin(dot(wp+vec2(0.,e),dir)*fr+T*sp2+fi*1.3);
      fr*=1.85; am*=.6; }
    vec3 n=normalize(vec3(-(hx-h0)/e,1.,-(hz-h0)/e*.5));
    vec3 v=normalize(vec3(p.x,-dy*1.3-.015,1.));
    vec3 rr=reflect(v,n); float el=clamp(rr.y*1.4,0.,1.);
    vec3 sky=mix(hor,pink,smoothstep(0.,.2,el)); sky=mix(sky,purp,smoothstep(.15,.5,el)); sky=mix(sky,top,smoothstep(.45,1.,el));
    float fres=.025+.975*pow(1.-max(dot(n,-v),0.),5.);
    vec3 water=mix(vec3(.02,.03,.08),C0*.25,.4);
    col=mix(water,sky*.9,clamp(fres*1.6,0.,1.));
    vec3 sdir=normalize(vec3(sp.x,sp.y-(hU-.5),1.)); float sdot=max(dot(rr,sdir),0.);
    float path=exp(-pow((p.x-sp.x)/(.03+dy*.55),2.));
    float rough=mix(900.,60.,clamp(dy*2.2,0.,1.));
    col+=vec3(1.,.72,.38)*(pow(sdot,rough)*12.+pow(sdot,rough*.1)*.35)*sunK;
    col+=mix(hor,pink,.5)*max(n.x*.6+n.z*.4,0.)*.12;
    col+=vec3(1.,.55,.22)*path*exp(-dy*4.)*.25*sunK;
    col=mix(col,mix(hor,pink,.3),exp(-dy*70.)*.6);
  }
  col=1.-exp(-col*1.25);
  col*=1.-.28*pow(length(uv-.5)*1.25,2.);
  gl_FragColor=vec4(col+grain()*.02,1.);`;

  /* ---------------- liquid ---------------- */
  S.caustic = `float caustic(vec2 uv,float t){vec2 p=mod(uv*TAU,TAU)-250.;vec2 i=p;float c=1.,inten=.005;
    for(int n=0;n<4;n++){float tt=t*(1.-(3.5/float(n+1)));i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));c+=1./length(vec2(p.x/(sin(i.x+tt)/inten),p.y/(cos(i.y+tt)/inten)));}
    c/=4.;c=1.17-pow(c,1.4);return pow(abs(c),8.);}`;
  S.liqrise = `
  float ar=R.x/R.y; float lvl=U; float sl=OPT.x;
  float ys=lvl+.013*sin(uv.x*9.*ar+T*2.3)+.008*sin(uv.x*23.*ar-T*3.1)+sl*.035*sin(uv.x*6.*ar-T*9.);
  float d=ys-uv.y; float aa=1.5/R.y;
  vec3 col=vec3(0.); float a=0.;
  float top=smoothstep(-aa,aa,d+.012)*(1.-smoothstep(-aa,aa,d));
  if(top>0.){ vec3 tc=mix(C2,vec3(1.),.35); col=tc*.55*top; a=top*.55; }
  if(d>-aa){
    float dep=clamp(d/max(lvl,.05),0.,1.);
    vec3 body=mix(mix(C2,vec3(1.),.12),C2*.35,pow(dep,.7));
    float ca=caustic(vec2(uv.x*ar,uv.y)*1.6+vec2(0.,T*.05),T*.6+23.)*(1.-dep)*.9;
    float rays=smoothstep(.45,.9,fbm(vec2(uv.x*ar*6.+uv.y*1.5,T*.15)))*(1.-dep)*.35;
    body+=mix(C2,vec3(1.),.6)*(ca+rays);
    float men=exp(-d*R.y*.35)*.9+exp(-abs(d-.012)*R.y*.25)*.25; body+=vec3(1.)*men;
    for(int i=0;i<28;i++){ float fi=float(i); float sp=.05+.1*h11(fi*3.3); float by=fract(T*sp+h11(fi*1.9))*lvl; float bx=h11(fi*7.7+SEED)*ar+.02*sin(T*2.+fi);
      float r=.004+.012*h11(fi*5.1); vec2 q=vec2(uv.x*ar-bx,uv.y-by); float l=length(q);
      float ring=smoothstep(r,r-aa,l)*(.25+.75*smoothstep(r*.55,r,l)); float hl=smoothstep(r*.35,0.,length(q-vec2(-r*.35,r*.35)));
      body=mix(body,mix(body,vec3(1.),.55),ring*.6)+vec3(1.)*hl*.8; }
    float ba=smoothstep(-aa,aa,d);
    col=col*(1.-ba)+body*ba*.97; a=a*(1.-ba)+ba*.97;
  }
  gl_FragColor=vec4(col,a);`;

  S.lavaPre = `
  float FF(vec2 p){ float ar=R.x/R.y; float F=0.;
    for(int i=0;i<8;i++){ float fi=float(i); vec2 c=vec2((h11(fi*3.1+SEED)-.5)*ar*.8+.06*sin(T*.21+fi), sin(T*(.09+.06*h11(fi*1.7))+fi*2.3)*.42);
      float r=.06+.07*h11(fi*5.9); vec2 dd=p-c; F+=r*r/(dot(dd,dd)+1e-4); } return F; }`;
  S.lava = `
  float F=FF(p); float aa=FW(F)+1e-4; float m=smoothstep(1.-aa,1.+aa,F);
  float glow=smoothstep(.35,1.,F)*(1.-m)*.3;
  if(m<=0.&&glow<=0.){gl_FragColor=vec4(0.);return;}
  float e=1.5/R.y;
  float h=sqrt(clamp(1.-1./max(F,1.),0.,1.)), hx=sqrt(clamp(1.-1./max(FF(p+vec2(e,0.)),1.),0.,1.)), hy=sqrt(clamp(1.-1./max(FF(p+vec2(0.,e)),1.),0.,1.));
  vec3 n=normalize(vec3(-(hx-h)/e*.045,-(hy-h)/e*.045,1.));
  vec3 base=mix(C2,mix(C3,C2,.7),clamp(uv.y+.25*fbm(p*2.+T*.05),0.,1.)); base=mix(vec3(lum(base)),base,1.35);
  vec3 Ld=normalize(vec3(-.4,.6,.7)); float dif=max(dot(n,Ld),0.);
  vec3 col=base*(.5+.5*dif)*(1.+.6*(1.-h))+base*.18;
  col+=vec3(1.)*pow(max(dot(reflect(-Ld,n),vec3(0.,0.,1.)),0.),36.)*.6;
  col+=base*pow(1.-n.z,2.5)*.35;
  col=1.-exp(-col*1.3);
  gl_FragColor=vec4(col*m+mix(C2,C3,.5)*glow,max(m,glow));`;
  S.flowPre = `
  float HH(vec2 q){ vec2 w=vec2(fbm(q*.8+vec2(T*.05,0.)),fbm(q*.8+vec2(5.2,1.3)-T*.04)); return fbm(q+w*1.8); }`;
  S.liqflow = `
  vec2 q=p*1.6; float e=.004;
  float h=HH(q), hx=HH(q+vec2(e,0.)), hy=HH(q+vec2(0.,e));
  vec3 n=normalize(vec3(-(hx-h)/e*.28,-(hy-h)/e*.28,1.));
  float band=.5+.5*sin(h*14.+T*.2);
  vec3 base=mix(mix(C0,C3,.7),C2,smoothstep(.25,.75,band)); base=mix(base,mix(C1,C2,.3),smoothstep(.9,1.,band)*.5);
  vec3 rd=reflect(vec3(0.,0.,-1.),n);
  float box=smoothstep(.42,.5,rd.y)*smoothstep(.95,.7,rd.y)*smoothstep(.75,.3,abs(rd.x+.15));
  float rim=smoothstep(.2,.24,rd.x)*smoothstep(.34,.3,rd.x)*smoothstep(-.4,.3,rd.y);
  vec3 env=mix(C0*.35,mix(C3,C0,.4),smoothstep(-.6,.6,rd.y))+vec3(1.)*(box*1.1+rim*.6);
  float fres=.06+.94*pow(1.-n.z,4.);
  vec3 col=base*(.55+.5*max(dot(n,normalize(vec3(-.3,.5,.8))),0.));
  col=mix(col,env,clamp(.25+fres*1.5,0.,.85));
  col+=vec3(1.)*pow(max(dot(rd,normalize(vec3(-.3,.55,.78))),0.),120.)*1.4;
  gl_FragColor=vec4(aces(col*1.1)+grain()*.015,1.);`;

  /* ---------------- paint ---------------- */
  // one brush stroke in local coords: s = along (0..1), c = across (-0.5..0.5 at the nominal edge)
  // returns height (0 = no paint) and writes colour; prog = how far the brush has travelled, tail = where the paint has been lifted
  S.brush = `
  float stroke(float s,float c,float prog,float tail,float seed,float dryEnd,float marker,inout vec3 col,vec3 pc,vec3 pc2){
    if(s<tail-.02||s>prog+.02) return 0.;
    float taper=smoothstep(0.,.05,s)*.25+.75; taper*=1.-smoothstep(.9,1.,s)*.35;
    float edge=.5*taper-.06*vn(vec2(s*24.+seed,c>0.?3.:9.))-.03*vn(vec2(s*90.,seed+(c>0.?1.:5.)));
    edge*=sqrt(clamp((prog-s)/.035,0.,1.))*sqrt(clamp((s-tail+.02)/.035,0.,1.));
    float bri=vn(vec2(c*34.+seed*13.,s*1.6))*.65+vn(vec2(c*85.,s*3.5+seed))*.35;
    float m=1.-smoothstep(edge-.012,edge+.012,abs(c));
    float head=smoothstep(prog+.02,prog-.015,s); float tl=smoothstep(tail-.02,tail+.02,s);
    float dry=smoothstep(.62,1.,s)*dryEnd+smoothstep(prog-.1,prog,s)*.15*(1.-marker)+(tail>.001?smoothstep(tail+.12,tail,s)*.6:0.);
    m*=smoothstep(dry*.85-.08,dry*.85+.08,bri+.15);
    m*=head*tl;
    if(m<=0.) return 0.;
    float ridge=smoothstep(edge-.14,edge-.02,abs(c))*(1.-marker);
    float h=m*(marker>.5?.25+.15*bri:.45+.28*bri+.5*ridge+.3*smoothstep(prog-.06,prog,s)+.25*smoothstep(.1,0.,s-tail));
    vec3 pcol=mix(pc,pc2,smoothstep(.55,.85,vn(vec2(s*4.+seed,c*6.)))*.55);
    pcol*=.9+.16*bri*(1.-marker*.6);
    if(marker>.5) pcol*=.88+.18*vn(vec2(c*40.,s*3.+seed));
    col=pcol; return h;
  }`;
  S.paint = S.brush + `
  float scene(vec2 p,out vec3 col,out float a,out float wet){
    col=vec3(0.); a=0.; float h=0.; wet=0.;
    for(int i=0;i<6;i++){ float fi=float(i); float P=5.2; float off=fi*.87; float cyc=floor((T+off)/P); float lt=mod(T+off,P);
      float sd=h21(vec2(fi,cyc)+SEED);
      vec2 cen=vec2((sd-.5)*1.4,(h21(vec2(cyc,fi)+3.)-.5)*.9);
      float rr=.6+2.4*h21(vec2(fi*3.,cyc)); float sg=h21(vec2(cyc*1.7,fi))<.5?-1.:1.;
      float a0=h21(vec2(fi,cyc*2.))*TAU; float len=.9+.6*h21(vec2(fi+9.,cyc)); float span=len/rr; float w=.1+.1*h21(vec2(cyc,fi*5.));
      vec2 ctr=cen-vec2(cos(a0),sin(a0))*rr;
      vec2 d=p-ctr; float th=atan(d.y,d.x); float s=mod((th-a0)*sg+PI,TAU)-PI; s=s/span; float c=(length(d)-rr)/w;
      float prog=E_out(clamp(lt/1.1,0.,1.)); float fade=1.-smoothstep(P-1.,P-.2,lt);
      vec3 pc=mod(fi,3.)<1.?C2:(mod(fi,3.)<2.?C3:mix(C1,C2,.35)); vec3 pc2=mod(fi,3.)<1.?C3:C2;
      vec3 sc=col; float hh=stroke(s,c,prog,0.,fi*7.+cyc,1.,0.,sc,pc,pc2);
      if(hh>0.){ float k=clamp(hh*4.,0.,1.)*fade; col=a<=.001?sc:mix(col,sc,k); h=max(h*(1.-k),hh*fade); a=max(a,k); wet=mix(wet,1.-smoothstep(1.,3.5,lt),k);} }
    return h; }
  `;
  S.paintMain = `
  vec3 col; float a,wet; float h=scene(p,col,a,wet); if(a<=.001){gl_FragColor=vec4(0.);return;}
  vec3 c1,c2; float a1,a2,w1,w2; float e=1.2/R.y; float hx=scene(p+vec2(e,0.),c1,a1,w1), hy=scene(p+vec2(0.,e),c2,a2,w2);
  vec3 n=normalize(vec3(-(hx-h)/e*.0045,-(hy-h)/e*.0045,1.));
  vec3 Ld=normalize(vec3(-.45,.55,.7)); float dif=max(.55,.6+.45*dot(n,Ld));
  float sp=pow(max(dot(reflect(-Ld,n),vec3(0.,0.,1.)),0.),28.)*(.18+.55*wet);
  col=col*dif+vec3(1.)*sp;
  gl_FragColor=vec4(col*a,a);`;

  // full-frame brush / marker covers (transitions); OPT.x = 1 for marker scribble
  S.brushCover = S.brush + `
  float scene(vec2 uv,out vec3 col,out float a){
    col=vec3(0.); a=0.; float h=0.; float mk=OPT.x; float ar=R.x/R.y;
    for(int i=0;i<14;i++){ float fi=float(i); float N=mk>.5?14.:4.; if(fi>=N) break;
      float d0=fi/N*(mk>.5?.6:.35);
      float pin=clamp((U*2.-d0)/(mk>.5?.42:.62),0.,1.), pout=clamp((U*2.-1.-d0)/(mk>.5?.42:.62),0.,1.);
      float prog=E_inout(pin)*1.12, tail=U>.5?E_inout(pout)*1.12:0.;
      float s,c;
      if(mk>.5){ float ang=-.62; vec2 q=vec2(uv.x*ar,uv.y); vec2 dir=vec2(cos(ang),sin(ang)); vec2 nr=vec2(-dir.y,dir.x);
        float sg=mod(fi,2.)<1.?1.:-1.; float L=ar*1.25+.6; vec2 st=vec2(ar*.5,.5)+nr*((fi+.5)/N-.5)*1.55-dir*sg*L*.5;
        s=dot(q-st,dir*sg)/L; c=dot(q-st,nr)/.2; }
      else { s=(uv.x+.05)/1.1; c=(uv.y-(fi+.5)/N)/(1.55/N); if(mod(fi,2.)>.5) s=1.-s; }
      vec3 pc=mod(fi,2.)<1.?C2:C3; vec3 pc2=mod(fi,2.)<1.?mix(C2,C1,.25):mix(C3,C2,.3);
      vec3 sc=col; float hh=stroke(s,c,prog,tail,fi*5.3+SEED,0.,mk,sc,pc,pc2);
      if(hh>0.){ float cov=clamp(hh*5.,0.,1.); float k=(mk>.5?.9:1.)*cov; col=a<=.001?sc:(mk>.5?mix(col,sc*(a>.5?.82:1.),k):mix(col,sc,cov)); h=mk>.5?max(h,hh):mix(h,hh,cov); a=max(a,k); } }
    return h; }`;
  S.brushMain = `
  vec3 col; float a; float h=scene(uv,col,a); if(a<=.001){gl_FragColor=vec4(0.);return;}
  vec3 c1,c2; float a1,a2; float e=1.3/R.y; float hx=scene(uv+vec2(e*R.y/R.x,0.),c1,a1), hy=scene(uv+vec2(0.,e),c2,a2);
  vec3 n=normalize(vec3(-(hx-h)/e*.004,-(hy-h)/e*.004,1.));
  vec3 Ld=normalize(vec3(-.45,.55,.7)); float dif=max(.55,.62+.42*dot(n,Ld));
  col=col*dif+vec3(1.)*pow(max(dot(reflect(-Ld,n),vec3(0.,0.,1.)),0.),26.)*(OPT.x>.5?.05:.35);
  gl_FragColor=vec4(col*a,a);`;

  // liquid sheet passing up through the frame (cover)
  S.liqCover = `
  float ar=R.x/R.y; float t=U*3.2;
  float lead=-.15+E_inout(clamp(U*2.,0.,1.))*1.3, trail=U<.5?-1.:-.15+E_inout(clamp(U*2.-1.,0.,1.))*1.32;
  float ys=lead+.02*sin(uv.x*7.*ar+t*3.)+.012*sin(uv.x*17.*ar-t*4.)+.03*sin(uv.x*3.*ar+t)*(1.-U);
  float drip=0.; for(int i=0;i<9;i++){ float fi=float(i); float x0=h11(fi*3.7+SEED); float wd=.012+.02*h11(fi*1.3); float ln=(.05+.12*h11(fi*9.1))*smoothstep(0.,.25,U*2.-1.);
    float dx=(uv.x-x0)*ar; drip=max(drip,ln*exp(-dx*dx/(wd*wd))); }
  float yb=trail+.015*sin(uv.x*9.*ar-t*2.)-drip;
  float d=ys-uv.y, db=uv.y-yb; float aa=1.6/R.y;
  float m=smoothstep(-aa,aa,d)*smoothstep(-aa,aa,db);
  if(m<=0.){gl_FragColor=vec4(0.);return;}
  float dep=clamp(min(d,db)*3.,0.,1.);
  vec3 body=mix(mix(C2,vec3(1.),.15),C2*.42,dep);
  body+=mix(C2,vec3(1.),.6)*caustic(vec2(uv.x*ar,uv.y)*1.4,t*.8+11.)*(1.-dep)*.8;
  body+=vec3(1.)*(exp(-d*R.y*.3)*.9+exp(-db*R.y*.35)*.5);
  body=mix(body,body*.7+mix(C3,C2,.5)*.3,smoothstep(.2,.9,fbm(vec2(uv.x*ar*3.,uv.y*2.-t*.3)))*.35);
  gl_FragColor=vec4(body*m,m);`;

  // glossy paint pouring from the top with drips (cover)
  S.dripPre = `
  float a1,a2;
  float field(vec2 uv){ float ar=R.x/R.y; float y0=1.-(-.05+a1*1.25)+.03*vn(vec2(uv.x*ar*4.,SEED));
    float best=y0-uv.y;
    for(int i=0;i<16;i++){ float fi=float(i); float x0=(fi+.5+.6*(h11(fi*3.1+SEED)-.5))/16.; float wd=(.018+.03*h11(fi*1.9))*(1.+.4*a1);
      float ln=(.1+.35*h11(fi*7.3))*a1; float tip=y0-ln; float dx=(uv.x-x0)*ar;
      float side=abs(dx)-wd*(1.+.6*smoothstep(tip+.05,tip,uv.y));
      float bulb=length(vec2(dx,uv.y-tip+wd*.6))-wd*1.5;
      float cyl=max(side,-(uv.y-tip)); best=min(best,min(cyl,bulb)); }
    float top=a2*1.3; best=max(best,top-(1.-uv.y)+.02*vn(vec2(uv.x*ar*5.,3.)));
    return best; }`;
  S.dripMain = `
  a1=E_inout(clamp(U*2.,0.,1.)); a2=E_inout(clamp(U*2.-1.,0.,1.));
  float sd=field(uv); float aa=1.6/R.y; float m=smoothstep(aa,-aa,sd); if(m<=0.){gl_FragColor=vec4(0.);return;}
  float e=1.5/R.y; float th=.035;
  float h=sqrt(clamp(-sd/th,0.,1.)), hx=sqrt(clamp(-field(uv+vec2(e,0.))/th,0.,1.)), hy=sqrt(clamp(-field(uv+vec2(0.,e))/th,0.,1.));
  vec3 n=normalize(vec3(-(hx-h)/e*.008,-(hy-h)/e*.008,1.));
  vec3 base=mix(C2,mix(C2,C0,.35),smoothstep(0.,1.,1.-uv.y)*.5);
  vec3 Ld=normalize(vec3(-.4,.6,.7)); vec3 col=base*(.55+.55*dot(n,Ld));
  col+=vec3(1.)*pow(max(dot(reflect(-Ld,n),vec3(0.,0.,1.)),0.),60.)*.9+vec3(1.)*pow(1.-n.z,4.)*.15;
  gl_FragColor=vec4(col*m,m);`;

  // ink blooming through the frame and clearing again (cover)
  S.inkCover = `
  float ar=R.x/R.y; vec2 q=vec2((uv.x-.5)*ar,uv.y-.5);
  float grow=E_inout(clamp(U*2.,0.,1.))*1.25, clear=U<.5?-1.:E_inout(clamp(U*2.-1.,0.,1.))*1.25;
  float best=1e3, near=1e3;
  for(int i=0;i<4;i++){ float fi=float(i); vec2 c=vec2((h11(fi*2.3+SEED)-.5)*ar*.8,(h11(fi*5.7+SEED)-.5)*.7);
    vec2 d=q-c; float an=atan(d.y,d.x); float r=length(d);
    float warp=.18*fbm(vec2(an*2.+fi*3.,r*3.)+fi)+.06*fbm(q*9.+fi);
    float R0=grow*(.75+.35*h11(fi*9.)); best=min(best,r-R0*(1.+warp)); near=min(near,r); }
  float cl=near-clear*(1.+.35*fbm(q*4.+7.)+.15*fbm(q*12.));
  float aa=2./R.y; float m=smoothstep(aa,-aa,best)*smoothstep(-.025,.025,cl);
  float fringe=smoothstep(.06,0.,abs(best))*.6;
  if(m<=0.&&fringe<=0.){gl_FragColor=vec4(0.);return;}
  float dens=.8+.3*fbm(q*4.+vec2(U*2.,0.))-.25*smoothstep(.0,.05,-best)*0.+.3*smoothstep(.05,0.,-best);
  float gran=vn(gl_FragCoord.xy*.35)*.06;
  float veins=smoothstep(.45,.75,fbm(q*3.5-vec2(0.,U*.8)));
  vec3 ink=C2*(.92-.22*veins)*(.85+.15*dens-gran); ink=mix(ink,C2*.7,smoothstep(.035,0.,-best)*.5);
  float a=clamp(m*.97+fringe*smoothstep(.0,.03,-best+.03)*.3,0.,1.);
  gl_FragColor=vec4(ink*a,a);`;

  // paint splash filling the frame, then a splash-shaped hole reveals the next scene (cover)
  S.splashPre = `
  float splash(vec2 q,float k,float seed){ float an=atan(q.y,q.x), r=length(q);
    float sp=pow(vn(vec2(an*9.,seed)),3.)*.55+pow(vn(vec2(an*23.,seed+4.)),5.)*.35;
    float d=r-k*(.55+sp*1.1)*1.45;
    for(int i=0;i<18;i++){ float fi=float(i); float a0=h11(fi*3.3+seed)*TAU; vec2 dir=vec2(cos(a0),sin(a0)); vec2 c=dir*k*(.75+.9*h11(fi*1.7+seed))*1.3;
      vec2 v=q-c; float al=dot(v,dir), pe=dot(v,vec2(-dir.y,dir.x)); float rr=(.008+.02*h11(fi*5.1+seed))*k*1.4;
      d=min(d,length(vec2(max(al,0.)*.45+min(al,0.),pe))-rr); }
    return d; }`;
  S.splashMain = `
  float ar=R.x/R.y; vec2 q=vec2((uv.x-.5)*ar,uv.y-.5);
  float k1=E_out(clamp(U*2.2,0.,1.)), k2=E_inout(clamp(U*2.-1.,0.,1.));
  float d1=splash(q,k1,SEED), d2=U>.5?splash(q*vec2(1.,1.08),k2*1.25,SEED+11.):1e3;
  float aa=1.6/R.y; float m=smoothstep(aa,-aa,d1)*smoothstep(-aa,aa,d2);
  if(m<=0.){gl_FragColor=vec4(0.);return;}
  float e=1.5/R.y; float th=.05;
  float h=sqrt(clamp(-d1/th,0.,1.)), hx=sqrt(clamp(-splash(q+vec2(e,0.),k1,SEED)/th,0.,1.)), hy=sqrt(clamp(-splash(q+vec2(0.,e),k1,SEED)/th,0.,1.));
  vec3 n=normalize(vec3(-(hx-h)/e*.006,-(hy-h)/e*.006,1.));
  vec3 base=mix(C2,mix(C2,C3,.4),smoothstep(.2,.9,fbm(q*3.)));
  vec3 Ld=normalize(vec3(-.4,.6,.7)); vec3 col=base*(.6+.5*dot(n,Ld))+vec3(1.)*pow(max(dot(reflect(-Ld,n),vec3(0.,0.,1.)),0.),50.)*.8;
  float rim=d2<1e2?smoothstep(.02,0.,d2)*.35:0.; col=mix(col,col*.6,rim);
  gl_FragColor=vec4(col*m,m);`;

  // paint splat accent (square canvas around the phrase)
  S.splatPre = `
  float k;
  float splash(vec2 q){ q.x/=1.3; q.y/=.8; float an=atan(q.y,q.x), r=length(q);
    float sp=pow(vn(vec2(an*7.,SEED)),3.)*.5+pow(vn(vec2(an*19.,SEED+4.)),5.)*.4;
    float d=r-k*(.42+sp*.5);
    for(int i=0;i<14;i++){ float fi=float(i); float a0=h11(fi*3.3+SEED)*TAU; vec2 c=vec2(cos(a0),sin(a0))*k*(.62+.32*h11(fi*1.7+SEED));
      d=min(d,length(q-c)-(.012+.03*h11(fi*5.1+SEED))*k); }
    return d; }`;
  S.splatMain = `
  vec2 q=(uv-.5)*2.; k=E_out(clamp(U*1.6,0.,1.));
  float d=splash(q); float aa=3./R.y; float m=smoothstep(aa,-aa,d)*OPT.x; if(m<=0.){gl_FragColor=vec4(0.);return;}
  float e=2./R.y; float th=.08; float h=sqrt(clamp(-d/th,0.,1.)), hx=sqrt(clamp(-splash(q+vec2(e,0.))/th,0.,1.)), hy=sqrt(clamp(-splash(q+vec2(0.,e))/th,0.,1.));
  vec3 n=normalize(vec3(-(hx-h)/e*.01,-(hy-h)/e*.01,1.));
  vec3 base=mix(C2,mix(C2,C3,.35),smoothstep(.3,.9,fbm(q*2.5)));
  vec3 Ld=normalize(vec3(-.4,.6,.7)); vec3 col=base*(.62+.48*dot(n,Ld))+vec3(1.)*pow(max(dot(reflect(-Ld,n),vec3(0.,0.,1.)),0.),50.)*.7;
  gl_FragColor=vec4(col*m,m);`;

  const EZ = 'float E_out(float t){return 1.-pow(1.-t,3.);}float E_inout(float t){return t<.5?4.*t*t*t:1.-pow(-2.*t+2.,3.)/2.;}\n';
  // shader programs: [prelude (functions), main body]
  const PROG = {
    disco: ['', S.disco], floor: ['', S.floor], beams: ['', S.beams], synth: ['', S.synth], sea: ['', S.sea],
    liqrise: [S.caustic, S.liqrise], lava: [S.lavaPre, S.lava], liqflow: [S.flowPre, S.liqflow],
    paint: [S.paint, S.paintMain], brushCover: [S.brushCover, S.brushMain],
    liqCover: [S.caustic, S.liqCover], inkCover: ['', S.inkCover],
  };
  PROG.dripCover = [S.dripPre, S.dripMain]; PROG.splashCover = [S.splashPre, S.splashMain]; PROG.splat = [S.splatPre, S.splatMain];

  /* ---------------- painter ---------------- */
  class GP {
    constructor() {
      this.cv = document.createElement('canvas'); this.ok = false; this.progs = {};
      try { this.gl = this.cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true, antialias: false }); } catch (e) { this.gl = null; }
      if (!this.gl) return;
      const gl = this.gl; this.der = !!gl.getExtension('OES_standard_derivatives');
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.ok = true;
    }
    prog(id) {
      if (this.progs[id] !== undefined) return this.progs[id];
      const gl = this.gl, P = PROG[id];
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn('glfx', id, gl.getShaderInfoLog(o)); return null; } return o; };
      const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 v;void main(){gl_Position=vec4(v,0.,1.);}');
      const fs = sh(gl.FRAGMENT_SHADER, HEAD + EZ + P[0] + '\nvoid main(){vec2 uv=gl_FragCoord.xy/R;vec2 p=(gl_FragCoord.xy-.5*R)/R.y;' + P[1] + '}');
      if (!vs || !fs) return (this.progs[id] = null);
      const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn('glfx', id, gl.getProgramInfoLog(pr)); return (this.progs[id] = null); }
      const u = {}; ['R', 'T', 'U', 'SEED', 'BEAT', 'BASS', 'BT', 'OPT', 'C0', 'C1', 'C2', 'C3'].forEach((n) => (u[n] = gl.getUniformLocation(pr, n)));
      return (this.progs[id] = { pr, u, loc: gl.getAttribLocation(pr, 'v') });
    }
    render(id, W, H, o, pal) {
      if (!this.ok) return null;
      const P = this.prog(id); if (!P) return null;
      const gl = this.gl; W = Math.max(8, Math.round(W)); H = Math.max(8, Math.round(H));
      if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
      gl.viewport(0, 0, W, H); gl.useProgram(P.pr); gl.enableVertexAttribArray(P.loc); gl.vertexAttribPointer(P.loc, 2, gl.FLOAT, false, 0, 0);
      const c = (h) => LM.U.hex2rgb(h).map((v) => v / 255);
      gl.uniform2f(P.u.R, W, H); gl.uniform1f(P.u.T, o.t || 0); gl.uniform1f(P.u.U, o.u || 0); gl.uniform1f(P.u.SEED, o.seed || 0); gl.uniform1f(P.u.BEAT, o.beat || 0); gl.uniform1f(P.u.BASS, o.bass || 0); gl.uniform1f(P.u.BT, o.bt || 0);
      const op = o.opt || [0, 0, 0, 0]; gl.uniform4f(P.u.OPT, op[0], op[1], op[2], op[3]);
      gl.uniform3fv(P.u.C0, c(pal.bg)); gl.uniform3fv(P.u.C1, c(pal.text)); gl.uniform3fv(P.u.C2, c(pal.accent)); gl.uniform3fv(P.u.C3, c(pal.sub || pal.accent));
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return this.cv;
    }
  }
  let gp = null;
  const painter = () => { if (gp === null) { try { gp = new GP(); } catch (e) { gp = { ok: false }; } } return gp.ok ? gp : null; };
  const scaleFor = (W) => (W > 2200 ? 0.5 : W > 1400 ? 0.66 : 0.85);
  // draw shader `id` over the full frame; returns false when the GPU path is unavailable
  function full(ctx, id, R, o, sc) {
    const g = painter(); if (!g) return false;
    const k = sc || scaleFor(R.W), cv = g.render(id, R.W * k, R.H * k, o, R.pal); if (!cv) return false;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(cv, 0, 0, R.W, R.H); ctx.restore();
    return true;
  }
  LM.glfx = { full, painter, PROG };

  /* ---------------- hook into backgrounds ---------------- */
  const wrapBG = (id, shader, opt, extra) => {
    const b = BG[id]; if (!b) return; const f0 = b.f;
    b.f = (ctx, R) => { const o = Object.assign({ t: R.t, beat: R.beat || 0, bass: R.bass || 0, bt: (R.t * (R.bpm || 120)) / 60, seed: 3, opt }, extra ? extra(R) : {}); if (!full(ctx, shader, R, o)) f0(ctx, R); };
  };
  wrapBG('discoBall', 'disco');
  wrapBG('danceFloor', 'floor');
  wrapBG('movingHeads', 'beams');
  wrapBG('retroSun', 'synth', [1, 0.62, 1, 0]);
  wrapBG('lavaLamp', 'lava');
  wrapBG('liquid', 'liqflow');
  wrapBG('ocean', 'sea', [0, 0.4, 0, 0]);
  wrapBG('paintStrokes', 'paint');
  if (BG.liquidRise) wrapBG('liquidRise', 'liqrise', null, (R) => {
    const per = 60 / (R.bpm || 120), bt = R.t / per, k = Math.floor(bt), f = bt - k, step = k % 8;
    return { u: 0.18 + 0.66 * ((step + E.outBack(clamp(f / 0.35))) / 8), opt: [Math.exp(-f * 4) * (step ? 1 : 0), 0, 0, 0] };
  });
  // realistic sunset over the sea (new)
  BG.gl_sunsetSea = { n: '夕日と海（反射する波）', c: 'グラデーション', full: true, f: (ctx, R) => { if (!full(ctx, 'sea', R, { t: R.t, seed: 2, opt: [1, 0.42, 0, 0] })) LM.synth.draw(ctx, R, { sun: true, hor: 0.6 }); } };
  // synthwave scene used by the 'sunset' / 'grid3d' background types and the retro sun layer
  if (LM.synth) {
    const d0 = LM.synth.draw;
    LM.synth.draw = (ctx, R, o) => { o = o || {}; if (o.sky === false || o.ridges === false || !full(ctx, 'synth', R, { t: R.t, beat: R.beat || 0, seed: 5, opt: [o.sun ? 1 : 0, o.hor || 0.6, o.speed || 1, 0] })) d0(ctx, R, o); };
  }

  /* ---------------- hook into transitions ---------------- */
  const wrapTR = (id, shader, opt) => {
    const L = TR[id]; if (!L) return; const f0 = L.f;
    L.mb = false;
    L.f = (ctx, u, R) => { if (!full(ctx, shader, R, { u, t: u * 3, seed: 7, opt })) f0(ctx, u, R); };
  };
  wrapTR('dryBrush', 'brushCover', [0, 0, 0, 0]);
  wrapTR('scribbleFill', 'brushCover', [1, 0, 0, 0]);
  wrapTR('liquid', 'liqCover');
  wrapTR('liquidDrip', 'dripCover');
  wrapTR('inkBlob', 'inkCover');
  wrapTR('ink', 'inkCover');
  wrapTR('splashFill', 'splashCover');

  /* ---------------- paint splat accent ---------------- */
  if (G.splat) {
    const f0 = G.splat.f;
    G.splat.f = (ctx, R) => {
      const g = painter(), b = R.bb; if (!g || !b) return f0(ctx, R);
      const fade = 1 - E.inQuad(R.x || 0), e = clamp(R.e || 0); if (e <= 0.001 || fade <= 0.01) return;
      const r = Math.max(b.w * 0.6, b.h * 1.1) * 1.25, side = Math.min(1024, Math.max(64, r * 2 * 0.8));
      const cv = g.render('splat', side, side, { u: e, seed: (R.seed || 0) % 97, opt: [fade, 0, 0, 0] }, R.pal); if (!cv) return f0(ctx, R);
      ctx.save(); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(cv, b.cx - r, b.cy - r, r * 2, r * 2); ctx.restore();
    };
  }

  /* themes: the sea sunset joins the warm / nostalgic styles */
  const add = (id, o) => { const t = LM.data.themeById[id]; if (t) t.bgm = Object.assign({}, t.bgm || {}, o); };
  add('citypop', { gl_sunsetSea: 1.5 }); add('ballad', { gl_sunsetSea: 1.2 }); add('acoustic', { gl_sunsetSea: 1 }); add('latin', { gl_sunsetSea: 1.2 }); add('cinematic', { gl_sunsetSea: 1 });
})();
