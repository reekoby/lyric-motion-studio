/* Realism pass on the GPU graphics (club / horizon / liquid / paint).
 * Shared toolkit: quintic gradient noise (smooth derivatives → no blocky highlights), a studio environment
 * (soft key box, strip light, floor bounce, sun glint) and a glossy material with Fresnel, so liquids, chrome,
 * paint and metaballs reflect light the way real surfaces do.
 *  - liquid flow / chrome / liquid marble (one heightfield, three materials)
 *  - metaballs (gl_blobs) and lava lamp: analytic sphere-like normals, glass-like gloss, subsurface glow
 *  - ink in water (gl_inkMarble background, ink / ink-blob transitions): feathered dye clouds and filaments
 *  - oil paint strokes (background + dry-brush / marker covers): bristle grooves, impasto ridges, smeared
 *    two-colour paint, dry-brush breakup, wet gloss
 *  - liquid cover, paint pour with drips (smooth-union), paint splash: all thick and glossy
 *  - sunset / dusk sea: physical camera over a wave field, reflected sky, Fresnel, sun glitter column, lit clouds
 *  - mirror ball: large faceted sphere reflecting a club, fine volumetric beams, drifting light spots
 * Programs replace the ones in LM.glfx.PROG (compiled lazily, so this file only has to run before first use). */
'use strict';
(() => {
  if (!LM.glfx) return;
  const PROG = LM.glfx.PROG, full = LM.glfx.full, BG = LM.bgm.lib;
  const { clamp } = LM.U, E = LM.E;

  const LIB = `
vec2 g2(vec2 p){float h=h21(p)*TAU;return vec2(cos(h),sin(h));}
float gn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(dot(g2(i),f),dot(g2(i+vec2(1,0)),f-vec2(1,0)),u.x),mix(dot(g2(i+vec2(0,1)),f-vec2(0,1)),dot(g2(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y)*.7+.5;}
float sfbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*gn(p);p=rot(.62)*p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
float sfbm2(vec2 p){float v=0.,a=.5;for(int i=0;i<2;i++){v+=a*gn(p);p=rot(.62)*p*2.03+vec2(1.7,9.2);a*=.5;}return v/.75;}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
// studio environment seen in a reflection direction rd (y up, z toward the viewer)
vec3 envS(vec3 rd,float rough){
  float g=rd.y*.5+.5; float sw=.03+rough*.25;
  vec3 c=mix(mix(C0,vec3(0.),.55),mix(mix(C3,C0,.45),vec3(.55),.25),smoothstep(.15,.95,g));
  vec2 k=vec2(rd.x+.32,rd.y-.5);
  float box=smoothstep(.24+sw,.24-sw,abs(k.x))*smoothstep(.15+sw,.15-sw,abs(k.y));
  float strip=smoothstep(.045+sw,.02,abs(rd.x-.6))*smoothstep(.75,.35,abs(rd.y-.05));
  float rim=smoothstep(.04+sw,.0,abs(rd.x+.78))*smoothstep(.7,.2,abs(rd.y));
  float bounce=smoothstep(-.15,-.8,rd.y);
  c+=vec3(1.)*box*5.+mix(vec3(1.),C2,.25)*strip*3.2+mix(vec3(1.),C3,.4)*rim*1.6+mix(C2,C3,.5)*bounce*.45;
  c+=vec3(1.)*pow(max(dot(rd,normalize(vec3(-.36,.62,.7))),0.),mix(400.,40.,rough))*mix(8.,1.5,rough);
  return c;}
vec3 tmK(vec3 c){vec3 o=c-.82;return mix(c,.82+(1.-exp(-o*4.))*.18,step(.82,c));}
vec3 glossy(vec3 n,vec3 base,float metal,float rough){
  vec3 rd=reflect(vec3(0.,0.,-1.),n);
  float ndv=max(n.z,0.); float fr=.04+.96*pow(1.-ndv,5.); fr=mix(fr,1.,metal);
  vec3 L=normalize(vec3(-.4,.6,.7)); float dif=clamp(.22+.78*max(dot(n,L),0.)/.7,0.,1.35);
  vec3 env=envS(rd,rough);
  vec3 spec=env*mix(vec3(1.),base*1.2+.1,metal);
  vec3 col=base*dif*(1.-metal*.85)+spec*clamp(fr*(1.-rough*.4)+metal*.0,0.,1.);
  return col;}
`;

  /* ---------- liquid flow / chrome / marble (OPT.x: 0 glossy paint, 1 chrome, 2 marble) ---------- */
  const flowPre = LIB + `
  float HF(vec2 q){ float t=T*.06;
    vec2 w=vec2(sfbm2(q*.55+vec2(0.,t)),sfbm2(q*.55+vec2(5.2,1.3)-t*.8));
    vec2 w2=vec2(sfbm2(q*.8+w*1.7+vec2(1.7,9.2)+t*.5),sfbm2(q*.8+w*1.7+vec2(8.3,2.8)-t*.4));
    return sfbm(q*.6+w2*1.9); }`;
  const flowMain = `
  float mode=OPT.x; vec2 q=p*1.5+vec2(SEED*3.1,0.); float e=.0035;
  float h=HF(q), hx=HF(q+vec2(e,0.)), hy=HF(q+vec2(0.,e));
  float k=mode>.5&&mode<1.5?.55:(mode<.5?.6:.14);
  vec3 n=normalize(vec3(-(hx-h)/e*k,-(hy-h)/e*k,1.));
  vec3 col;
  if(mode<.5){ float b=h*7.+T*.05; float s=.5+.5*sin(b*TAU*.5); vec3 base=mix(C2,C3,smoothstep(.3,.7,s)); base=mix(base,mix(C1,vec3(1.),.4),smoothstep(.92,.99,s)*.7);
    col=glossy(n,base,0.,.05); }
  else if(mode<1.5){ vec3 base=mix(vec3(.82,.84,.88),mix(C3,C2,.5),.18); col=glossy(n,base,1.,.08)*1.05; }
  else { vec2 mq=q*.9+vec2(h*1.6,h*.8);
    float r1=pow(1.-abs(gn(mq*1.3+vec2(T*.01,0.))*2.-1.),14.), r2=pow(1.-abs(gn(mq*3.1+5.)*2.-1.),26.)*.7, r3=pow(1.-abs(gn(mq*7.+9.)*2.-1.),40.)*.4;
    float cloud=smoothstep(.4,.85,sfbm(q*1.1-2.));
    vec3 stone=mix(mix(C1,vec3(.97,.96,.94),.82),mix(C3,vec3(.86),.5),cloud*.4)*(.95+.05*sfbm2(q*8.));
    vec3 base=mix(stone,mix(C2,C0,.4),clamp(r1*.9+r2+r3,0.,1.));
    base=mix(base,mix(C0,vec3(.1),.4),pow(r1,3.)*.5);
    col=glossy(n,base,.0,.03); }
  col=aces(col*1.05);
  gl_FragColor=vec4(col+grain()*.012,1.);`;
  PROG.liqflow = [flowPre, flowMain];

  /* ---------- metaballs / lava lamp (OPT.x: 0 blobs full frame on a studio backdrop, 1 lava lamp layer) ---------- */
  const blobPre = LIB + `
  vec3 F3(vec2 p){ float ar=R.x/R.y; float F=0.; vec2 G=vec2(0.); float lamp=OPT.x;
    for(int i=0;i<9;i++){ float fi=float(i); float sp=.08+.05*h11(fi*1.7+SEED);
      vec2 c=lamp>.5?vec2((h11(fi*3.1+SEED)-.5)*ar*.7+.07*sin(T*.2+fi),.5*sin(T*sp*.9+h11(fi*9.3)*TAU)):vec2((h11(fi*3.1+SEED)-.5)*ar*.8+.18*sin(T*.21*(1.+h11(fi))+fi*2.),(h11(fi*5.3+SEED)-.5)*.75+.14*cos(T*.17*(1.+h11(fi*2.))+fi));
      float r=(lamp>.5?.07:.07)+(lamp>.5?.07:.06)*h11(fi*5.9+SEED); vec2 d=p-c; float dd=dot(d,d)+1e-5; F+=r*r/dd; G+=-2.*r*r*d/(dd*dd); }
    return vec3(F,G); }`;
  const blobMain = `
  vec3 f=F3(p); float F=f.x; float lamp=OPT.x;
  float aa=FW(F)*1.2+1e-4; float m=smoothstep(1.-aa,1.+aa,F);
  vec3 bg=lamp>.5?vec3(0.):mix(mix(C0,vec3(0.),.35),mix(C0,C3,.25),uv.y)*(1.-.35*length(uv-vec2(.5,.6)));
  float glow=smoothstep(.25,1.,F)*(1.-m);
  float shadow=lamp>.5?0.:smoothstep(.2,1.,F3(p+vec2(-.03,.05)).x)*(1.-m)*.45;
  vec3 col=bg*(1.-shadow)+mix(C2,C3,.5)*glow*(lamp>.5?.35:.18);
  float a=lamp>.5?clamp(glow*.35,0.,1.):1.;
  if(m>0.){
    float h=sqrt(clamp(1.-1./max(F,1.),0.,1.));
    vec2 dh=f.yz/(2.*max(h,.04)*F*F);
    vec3 n=normalize(vec3(-dh*.085,1.));
    float th=clamp(uv.y+.25*sfbm2(p*2.+T*.05),0.,1.);
    vec3 base=mix(C2,mix(C3,C2,.4),th); base=mix(vec3(lum(base)),base,1.25);
    vec3 s=glossy(n,base,0.,.18);
    s+=base*pow(1.-h,3.)*.55*(lamp>.5?1.4:1.);
    s+=mix(base,vec3(1.),.5)*(1.-h)*smoothstep(.0,.6,n.y*-1.)*.25;
    s=tmK(s);
    col=mix(col,s,m); a=max(a,m);
  }
  gl_FragColor=vec4(lamp>.5?col*1.:col,a);`;
  PROG.blobs = [blobPre, blobMain];
  PROG.lava = [blobPre, blobMain];

  /* ---------- ink in water (OPT.x: 0 background, 1 cover; U = progress for the cover) ---------- */
  const inkPre = LIB + `
  float dye(vec2 q,float t,float s){
    vec2 w=vec2(sfbm(q*.7+vec2(t*.05,s)),sfbm(q*.7+vec2(s*1.7,-t*.045)+5.2));
    vec2 w2=q+(w-.5)*2.4; vec2 w3=w2+(vec2(sfbm2(w2*1.6+t*.03),sfbm2(w2*1.6+9.1))-.5)*.9;
    float body=sfbm(w3*1.2+vec2(0.,-t*.03));
    return body; }
  float wisp(vec2 q,float t,float s){ vec2 w=q+(vec2(sfbm2(q*1.2+s+t*.04),sfbm2(q*1.2+s+3.3))-.5)*1.8; float r=1.-abs(gn(w*2.2+vec2(0.,t*.05))*2.-1.); return pow(r,5.); }`;
  const inkMain = `
  float ar=R.x/R.y; vec2 q=vec2((uv.x-.5)*ar,uv.y-.5); float cover=OPT.x;
  float t=cover>.5?U*5.+2.:T;
  float d1=dye(q*1.2,t,SEED), d2=dye(q*1.05+vec2(3.1,1.7),t*1.1,SEED+4.);
  float w1=wisp(q*1.1,t,SEED)*smoothstep(.3,.55,d1), w2=wisp(q*1.3+2.,t,SEED+2.)*smoothstep(.32,.6,d2);
  vec3 tA=mix(C2,C2*C2,.35), tB=mix(C3,C3*C3,.35);
  if(cover>.5){
    float grow=E_inout(clamp(U*2.,0.,1.))*1.7, clr=U<.5?0.:E_inout(clamp(U*2.-1.,0.,1.))*1.7;
    float rad=length(q*vec2(.85,1.15));
    float fr=grow-rad*1.15+(d1-.5)*.9, cl=clr*1.2-rad*.9+(d2-.5)*.8-.35;
    float c1=smoothstep(-.1,.3,fr)*smoothstep(.25,.6,d1+fr*.6), c2=smoothstep(-.05,.35,fr-.1)*smoothstep(.3,.65,d2+fr*.5);
    float hole=smoothstep(-.05,.2,cl); c1*=1.-hole; c2*=1.-hole;
    float a=clamp(max(c1,c2)+w1*.3*(1.-hole),0.,1.);
    vec3 ink=mix(tA,tB,c2/(c1+c2+1e-3)*.6)*(.75+.3*(1.-d1));
    gl_FragColor=vec4(ink*a,a); return; }
  vec3 water=mix(mix(C1,vec3(1.),.7),mix(C1,vec3(.85),.5),uv.y);
  float a1=smoothstep(.38,.72,d1), a2=smoothstep(.42,.76,d2);
  vec3 col=water;
  col*=mix(vec3(1.),tA,a1*.95);
  col*=mix(vec3(1.),tB,a2*.85);
  col*=mix(vec3(1.),tA,w1*.18); col*=mix(vec3(1.),tB,w2*.14);
  col*=1.-smoothstep(.75,.95,d1)*.25;
  col*=1.-.18*pow(length(uv-.5)*1.3,2.);
  gl_FragColor=vec4(col+grain()*.015,1.);`;
  PROG.ink = [inkPre, inkMain];

  /* ---------- oil paint strokes ---------- */
  // one stroke in local coords s (along, 0..1) and c (across, ±0.5 at the nominal edge)
  const brush = LIB + `
  float strokeP(float s,float c,float prog,float tail,float seed,float dryEnd,float marker,out vec3 pcol,vec3 pa,vec3 pb){
    pcol=vec3(0.);
    if(s<tail-.03||s>prog+.03) return 0.;
    float taper=mix(.82,1.,smoothstep(0.,.08,s))*mix(1.,.72,smoothstep(.82,1.,s));
    float wob=(gn(vec2(s*6.+seed,c>0.?2.:7.))-.5)*.08+(gn(vec2(s*40.,seed+(c>0.?1.:5.)))-.5)*.035;
    float edge=.5*taper+wob;
    float hd=clamp((prog-s)/.04,0.,1.), tl=clamp((s-tail+.03)/.04,0.,1.); edge*=sqrt(hd)*sqrt(tl);
    float ac=abs(c);
    float bris=gn(vec2(c*38.+seed*3.,s*1.1))*.5+gn(vec2(c*110.+seed,s*2.4))*.35+gn(vec2(c*9.+seed,s*3.))*.15;
    float body=1.-smoothstep(edge-.03,edge+.01,ac);
    float load=1.-smoothstep(.45,1.,s)*dryEnd-smoothstep(prog-.12,prog,s)*.18*(1.-marker)-(tail>.001?smoothstep(tail+.15,tail,s)*.7:0.);
    float cov=body*smoothstep(.5-load*.55,.62-load*.55,bris+.12*gn(vec2(c*12.,s*9.+seed)));
    if(cov<=0.) return 0.;
    float ridge=smoothstep(edge-.16,edge-.03,ac)*(1.-smoothstep(edge-.03,edge+.005,ac))*(1.-marker);
    float h=cov*(marker>.5?.18+.08*bris:.4+.3*bris+.35*ridge+.3*smoothstep(prog-.07,prog,s)*hd);
    float mixk=smoothstep(.35,.7,gn(vec2(c*1.8+seed,s*.5))*.7+gn(vec2(c*6.+seed*2.,s*1.2))*.3)*.8;
    pcol=mix(pa,pb,mixk);
    pcol*=.94+.08*bris*(1.-marker*.5);
    if(marker>.5) pcol*=.85+.2*gn(vec2(c*30.,s*2.+seed));
    return h*clamp(cov*3.,0.,1.);
  }`;
  const paintPre = brush + `
  float sceneP(vec2 p,out vec3 col,out float a,out float wet){
    col=vec3(0.); a=0.; float h=0.; wet=0.;
    for(int i=0;i<5;i++){ float fi=float(i); float P=6.; float off=fi*1.21; float cyc=floor((T+off)/P); float lt=mod(T+off,P);
      float sd=h21(vec2(fi,cyc)+SEED);
      vec2 cen=vec2((sd-.5)*1.3,(h21(vec2(cyc,fi)+3.)-.5)*.8);
      float rr=.8+2.6*h21(vec2(fi*3.,cyc)); float sg=h21(vec2(cyc*1.7,fi))<.5?-1.:1.;
      float a0=h21(vec2(fi,cyc*2.))*TAU; float len=1.+.6*h21(vec2(fi+9.,cyc)); float span=len/rr; float w=.13+.1*h21(vec2(cyc,fi*5.));
      vec2 ctr=cen-vec2(cos(a0),sin(a0))*rr;
      vec2 d=p-ctr; float th=atan(d.y,d.x); float s=mod((th-a0)*sg+PI,TAU)-PI; s=s/span+.5; float c=(length(d)-rr)/w;
      float prog=E_out(clamp(lt/1.3,0.,1.))*1.05; float fade=1.-smoothstep(P-1.2,P-.2,lt);
      vec3 pa=mod(fi,3.)<1.?C2:(mod(fi,3.)<2.?C3:mix(C1,C2,.35)); vec3 pb=mod(fi,3.)<1.?mix(C3,C1,.2):mix(C2,C1,.25);
      vec3 sc; float hh=strokeP(s,c,prog,0.,fi*7.+cyc,.9,0.,sc,pa,pb);
      if(hh>0.){ float k=clamp(hh*5.,0.,1.)*fade; col=a<=.001?sc:mix(col,sc,k); h=mix(h,hh,k); a=max(a,k); wet=mix(wet,1.-smoothstep(1.2,4.,lt),k);} }
    return h; }`;
  const paintMain = `
  vec3 col; float a,wet; float h=sceneP(p,col,a,wet); if(a<=.001){gl_FragColor=vec4(0.);return;}
  vec3 c1; float a1,w1; float e=1.3/R.y; float hx=sceneP(p+vec2(e,0.),c1,a1,w1), hy=sceneP(p+vec2(0.,e),c1,a1,w1);
  vec3 n=normalize(vec3(-(hx-h)/e*.0055,-(hy-h)/e*.0055,1.));
  vec3 s=glossy(n,col,0.,mix(.45,.12,wet));
  s=mix(col*(.6+.5*dot(n,normalize(vec3(-.4,.6,.7)))),s,.55+.35*wet);
  gl_FragColor=vec4(s*a,a);`;
  PROG.paint = [paintPre, paintMain];

  const coverPre = brush + `
  float sceneC(vec2 uv,out vec3 col,out float a){
    col=vec3(0.); a=0.; float h=0.; float mk=OPT.x; float ar=R.x/R.y;
    for(int i=0;i<14;i++){ float fi=float(i); float N=mk>.5?14.:5.; if(fi>=N) break;
      float d0=fi/N*(mk>.5?.6:.4);
      float pin=clamp((U*2.-d0)/(mk>.5?.42:.6),0.,1.), pout=clamp((U*2.-1.-d0)/(mk>.5?.42:.6),0.,1.);
      float prog=E_inout(pin)*1.15, tail=U>.5?E_inout(pout)*1.15:0.;
      float s,c;
      if(mk>.5){ float ang=-.62; vec2 q=vec2(uv.x*ar,uv.y); vec2 dir=vec2(cos(ang),sin(ang)); vec2 nr=vec2(-dir.y,dir.x);
        float sg=mod(fi,2.)<1.?1.:-1.; float L=ar*1.25+.6; vec2 st=vec2(ar*.5,.5)+nr*((fi+.5)/N-.5)*1.55-dir*sg*L*.5;
        s=dot(q-st,dir*sg)/L; c=dot(q-st,nr)/.21; }
      else { s=(uv.x+.06)/1.12; float y0=(fi+.5)/N+.03*sin(uv.x*3.+fi); c=(uv.y-y0)/(1.5/N); if(mod(fi,2.)>.5) s=1.-s; }
      vec3 pa=mod(fi,2.)<1.?C2:C3; vec3 pb=mod(fi,2.)<1.?mix(C2,C1,.3):mix(C3,C2,.35);
      vec3 sc; float hh=strokeP(s,c,prog,tail,fi*5.3+SEED,0.,mk,sc,pa,pb);
      if(hh>0.){ float cov=clamp(hh*6.,0.,1.); float k=(mk>.5?.92:1.)*cov; col=a<=.001?sc:(mk>.5?mix(col,sc*(a>.5?.84:1.),k):mix(col,sc,cov)); h=mk>.5?max(h,hh):mix(h,hh,cov); a=max(a,k); } }
    return h; }`;
  const coverMain = `
  vec3 col; float a; float h=sceneC(uv,col,a); if(a<=.001){gl_FragColor=vec4(0.);return;}
  vec3 c1; float a1; float e=1.3/R.y; float hx=sceneC(uv+vec2(e*R.y/R.x,0.),c1,a1), hy=sceneC(uv+vec2(0.,e),c1,a1);
  vec3 n=normalize(vec3(-(hx-h)/e*.0075,-(hy-h)/e*.0075,1.));
  vec3 s=OPT.x>.5?col*(.8+.3*dot(n,normalize(vec3(-.4,.6,.7)))):mix(col*(.6+.5*dot(n,normalize(vec3(-.4,.6,.7)))),glossy(n,col,0.,.3),.6);
  gl_FragColor=vec4(s*a,a);`;
  PROG.brushCover = [coverPre, coverMain];

  /* ---------- liquid cover: a glossy body of liquid sweeps up through the frame, leaving drips ---------- */
  const lcPre = LIB + `
  float surfY(float x,float t,float lead){ return lead+.022*sin(x*6.+t*3.)+.012*sin(x*15.-t*4.3)+.03*(sfbm2(vec2(x*1.5,t*.6))-.5); }`;
  const lcMain = `
  float ar=R.x/R.y; float x=uv.x*ar; float t=U*3.2;
  float lead=-.12+E_inout(clamp(U*1.9,0.,1.))*1.3, trail=U<.5?-1.:-.18+E_inout(clamp(U*2.-1.,0.,1.))*1.35;
  float ys=surfY(x,t,lead);
  float drip=0.; for(int i=0;i<10;i++){ float fi=float(i); float x0=h11(fi*3.7+SEED)*ar; float wd=.01+.018*h11(fi*1.3); float ln=(.04+.16*h11(fi*9.1))*smoothstep(0.,.35,U*2.-1.);
    float dx=x-x0; drip=max(drip,ln*(exp(-dx*dx/(wd*wd))*.85+.15*exp(-dx*dx/(wd*wd*.3)))); }
  float yb=trail+.018*sin(x*8.-t*2.)-drip;
  float d=ys-uv.y, db=uv.y-yb; float aa=1.6/R.y;
  float m=smoothstep(-aa,aa,d)*smoothstep(-aa,aa,db); if(m<=0.){gl_FragColor=vec4(0.);return;}
  float e=.004;
  float H0=sfbm2(vec2(x*1.4,uv.y*2.-t*.5)), Hx=sfbm2(vec2((x+e)*1.4,uv.y*2.-t*.5)), Hy=sfbm2(vec2(x*1.4,(uv.y+e)*2.-t*.5));
  vec3 n=normalize(vec3(-(Hx-H0)/e*.03,-(Hy-H0)/e*.03,1.));
  float top=exp(-d*R.y*.045); float bot=exp(-db*R.y*.06);
  n=normalize(n+vec3(0.,top*1.4-bot*.9,0.));
  float dep=clamp(min(d,db)*2.5,0.,1.);
  vec3 base=mix(mix(C2,vec3(1.),.1),C2*.72,dep);
  vec3 col=glossy(n,base,0.,.1);
  col+=mix(C2,vec3(1.),.5)*smoothstep(.55,.9,sfbm(vec2(x*1.2,uv.y*.9)+n.xy*.8+t*.15))*.22;
  col+=vec3(1.)*smoothstep(.7,.95,sfbm2(vec2(x*.8+uv.y*.3,uv.y*4.-t*.6)))*.12;
  col=tmK(col);
  gl_FragColor=vec4(col*m,m);`;
  PROG.liqCover = [lcPre, lcMain];

  /* ---------- paint pour: a thick glossy sheet slides down with long drips (smooth union) ---------- */
  const drPre = LIB + `
  float a1,a2;
  float field(vec2 uv){ float ar=R.x/R.y; float y0=1.-(-.05+a1*1.22)+.025*(sfbm2(vec2(uv.x*ar*3.,SEED))-.5);
    float best=y0-uv.y;
    for(int i=0;i<14;i++){ float fi=float(i); float x0=(fi+.5+.7*(h11(fi*3.1+SEED)-.5))/14.; float wd=(.012+.022*h11(fi*1.9));
      float dl=h11(fi*5.3+SEED)*.25; float ln=(.08+.4*h11(fi*7.3))*clamp((a1-dl)/(1.-dl),0.,1.); float tip=y0-ln; float dx=(uv.x-x0)*ar;
      float yy=clamp((y0-uv.y)/max(ln,.001),0.,1.); float wv=wd*mix(1.,.7,yy);
      float cyl=max(abs(dx)-wv,max(uv.y-y0,tip-uv.y));
      float bulb=length(vec2(dx,uv.y-tip-wd*.2))-wd*1.25;
      best=smin(best,min(cyl,bulb),.035); }
    float top=a2*1.3; best=max(best,top-(1.-uv.y)+.02*(sfbm2(vec2(uv.x*ar*4.,3.))-.5));
    return best-.012*sfbm2(vec2(uv.x*ar*2.5,uv.y*1.5-a1*.8)); }`;
  const drMain = `
  a1=E_inout(clamp(U*2.,0.,1.)); a2=E_inout(clamp(U*2.-1.,0.,1.));
  float sd=field(uv); float aa=1.6/R.y; float m=smoothstep(aa,-aa,sd); if(m<=0.){gl_FragColor=vec4(0.);return;}
  float e=1.5/R.y; float th=.045;
  float h=sqrt(clamp(-sd/th,0.,1.)), hx=sqrt(clamp(-field(uv+vec2(e,0.))/th,0.,1.)), hy=sqrt(clamp(-field(uv+vec2(0.,e))/th,0.,1.));
  vec3 n=normalize(vec3(-(hx-h)/e*.012,-(hy-h)/e*.012,1.));
  vec3 base=mix(C2,mix(C2,C0,.3),smoothstep(0.,1.,1.-uv.y)*.4);
  vec3 col=glossy(n,base,0.,.08);
  col+=vec3(1.)*smoothstep(.62,.9,sfbm2(vec2(uv.x*R.x/R.y*1.2,uv.y*.6+a1*.5)))*.14*h;
  col=tmK(col);
  gl_FragColor=vec4(col*m,m);`;
  PROG.dripCover = [drPre, drMain];

  /* ---------- splash fill + splat accent: thick glossy paint ---------- */
  const spPre = LIB + `
  float splash(vec2 q,float k,float seed){ float an=atan(q.y,q.x), r=length(q);
    float sp=pow(gn(vec2(an*2.9,seed)),3.)*.6+pow(gn(vec2(an*7.3,seed+4.)),5.)*.5;
    float d=r-k*(.5+sp*1.15)*1.45;
    for(int i=0;i<16;i++){ float fi=float(i); float a0=h11(fi*3.3+seed)*TAU; vec2 dir=vec2(cos(a0),sin(a0)); vec2 c=dir*k*(.8+.9*h11(fi*1.7+seed))*1.3;
      vec2 v=q-c; float al=dot(v,dir), pe=dot(v,vec2(-dir.y,dir.x)); float rr=(.01+.022*h11(fi*5.1+seed))*k*1.4;
      d=smin(d,length(vec2(max(al,0.)*.4+min(al,0.),pe))-rr,.02*k); }
    return d; }`;
  const spMain = `
  float ar=R.x/R.y; vec2 q=vec2((uv.x-.5)*ar,uv.y-.5);
  float k1=E_out(clamp(U*2.2,0.,1.)), k2=E_inout(clamp(U*2.-1.,0.,1.));
  float d1=splash(q,k1,SEED), d2=U>.5?splash(q*vec2(1.,1.08),k2*1.25,SEED+11.):1e3;
  float aa=1.6/R.y; float m=smoothstep(aa,-aa,d1)*smoothstep(-aa,aa,d2); if(m<=0.){gl_FragColor=vec4(0.);return;}
  float e=1.5/R.y; float th=.045;
  float h=sqrt(clamp(-d1/th,0.,1.)), hx=sqrt(clamp(-splash(q+vec2(e,0.),k1,SEED)/th,0.,1.)), hy=sqrt(clamp(-splash(q+vec2(0.,e),k1,SEED)/th,0.,1.));
  vec3 n=normalize(vec3(-(hx-h)/e*.01,-(hy-h)/e*.01,1.));
  vec3 base=mix(C2,mix(C2,C3,.45),smoothstep(.3,.8,sfbm(q*2.5)));
  vec3 col=tmK(glossy(n,base,0.,.1));
  float rim=d2<1e2?smoothstep(.025,0.,d2)*.3:0.; col*=1.-rim;
  gl_FragColor=vec4(col*m,m);`;
  PROG.splashCover = [spPre, spMain];
  const stPre = LIB + `
  float k;
  float splash(vec2 q){ q.x/=1.3; q.y/=.8; float an=atan(q.y,q.x), r=length(q);
    float sp=pow(gn(vec2(an*2.4,SEED)),3.)*.55+pow(gn(vec2(an*6.1,SEED+4.)),5.)*.45;
    float d=r-k*(.4+sp*.55);
    for(int i=0;i<12;i++){ float fi=float(i); float a0=h11(fi*3.3+SEED)*TAU; vec2 c=vec2(cos(a0),sin(a0))*k*(.65+.35*h11(fi*1.7+SEED));
      d=smin(d,length(q-c)-(.014+.03*h11(fi*5.1+SEED))*k,.03*k); }
    return d; }`;
  const stMain = `
  vec2 q=(uv-.5)*2.; k=E_out(clamp(U*1.6,0.,1.));
  float d=splash(q); float aa=3./R.y; float m=smoothstep(aa,-aa,d)*OPT.x; if(m<=0.){gl_FragColor=vec4(0.);return;}
  float e=2./R.y; float th=.07; float h=sqrt(clamp(-d/th,0.,1.)), hx=sqrt(clamp(-splash(q+vec2(e,0.))/th,0.,1.)), hy=sqrt(clamp(-splash(q+vec2(0.,e))/th,0.,1.));
  vec3 n=normalize(vec3(-(hx-h)/e*.014,-(hy-h)/e*.014,1.));
  vec3 base=mix(C2,mix(C2,C3,.4),smoothstep(.3,.8,sfbm(q*2.)));
  gl_FragColor=vec4(tmK(glossy(n,base,0.,.1))*m,m);`;
  PROG.splat = [stPre, stMain];

  /* ---------- sea: sunset (OPT.x 1) / dusk (0); OPT.y = horizon height from the bottom ---------- */
  const seaPre = LIB + `
  vec3 skyC(vec2 sp2,float sunK,vec2 sun){
    float y=sp2.y;
    vec3 hor=mix(vec3(1.,.55,.2),C2,.15)*1.25, mid=mix(vec3(.98,.42,.45),C3,.2)*1.1, up=mix(vec3(.42,.22,.55),C0,.25), top=mix(vec3(.08,.08,.22),C0,.3);
    if(sunK<.5){ hor=mix(vec3(.86,.5,.52),C2,.22); mid=mix(vec3(.5,.36,.6),C3,.25); }
    vec3 c=mix(hor,mid,smoothstep(0.,.12,y)); c=mix(c,up,smoothstep(.1,.38,y)); c=mix(c,top,smoothstep(.35,.9,y));
    vec2 d=sp2-sun; float sd=length(d*vec2(1.,1.15));
    c+=vec3(1.,.6,.28)*(exp(-sd*3.)*.5+exp(-sd*11.)*.6)*sunK;
    c+=vec3(1.,.55,.25)*exp(-max(y,0.)*22.)*exp(-abs(d.x)*1.6)*.5*sunK;
    return c; }
  float waveH(vec2 w,float t){ float h=0.; float fr=.9, am=.35;
    for(int i=0;i<6;i++){ float fi=float(i); vec2 dir=normalize(vec2(cos(fi*2.4+.3)*.8,1.)); h+=am*sin(dot(w,dir)*fr+t*sqrt(fr)*1.4+fi*1.7); fr*=1.9; am*=.55; }
    return h+ .18*sfbm2(w*1.7+vec2(0.,t*.2)); }`;
  const seaMain = `
  float sunK=OPT.x, hU=1.-OPT.y; float ar=R.x/R.y;
  vec2 sun=vec2(.18,.075+.01*sin(T*.03));
  vec2 s2=vec2((uv.x-.5)*ar,uv.y-hU);
  vec3 col;
  if(s2.y>=0.){
    col=skyC(s2,sunK,sun);
    // clouds: stretched layers lit from below / toward the sun
    float cy=s2.y; float band=smoothstep(.04,.12,cy)*smoothstep(.55,.2,cy);
    vec2 cq=vec2(s2.x*.9+T*.006,cy*7.);
    float cd=sfbm(cq+vec2(0.,SEED))*.75+sfbm(cq*vec2(3.,2.5)+T*.01)*.25;
    float cov=smoothstep(.5,.72,cd)*band;
    float toS=exp(-length((s2-sun)*vec2(.8,2.))*2.2)*sunK;
    vec3 under=mix(mix(vec3(.45,.24,.45),C0,.3),mix(vec3(1.,.5,.35),vec3(1.,.8,.6),toS),.3+.7*toS)*(.85+.3*sfbm2(cq*2.));
    float lining=smoothstep(.5,.55,cd)*(1.-smoothstep(.55,.66,cd))*toS*1.6;
    col=mix(col,under,cov*.93)+vec3(1.,.78,.5)*lining*band;
    float sd=length((s2-sun)*vec2(1.,1.1));
    col+=vec3(1.,.62,.3)*(exp(-sd*16.)*.9+exp(-sd*40.)*.8)*sunK*(1.-cov*.5);
    col=mix(col,vec3(1.,.82,.55)*4.,smoothstep(.036,.031,sd)*sunK*(1.-cov*.6));
  } else {
    float dy=-s2.y; float camH=.06; float f=1.;
    vec3 d=normalize(vec3(s2.x,s2.y,f)); float t0=camH/max(-d.y,1e-4); vec2 w=d.xz*t0*28.;
    float ep=.02+t0*.6;
    float h=waveH(w,T), hx=waveH(w+vec2(ep,0.),T), hz=waveH(w+vec2(0.,ep),T);
    float fade=exp(-t0*.9);
    vec3 n=normalize(vec3(-(hx-h)/ep*.16*fade,1.,-(hz-h)/ep*.16*fade));
    vec3 r=reflect(d,n); r.y=abs(r.y);
    vec2 rs=vec2(r.x/max(r.z,.05),r.y/max(r.z,.05));
    vec3 sky=skyC(rs,sunK,sun);
    float fr=.02+.98*pow(1.-max(dot(n,-d),0.),5.);
    vec3 deep=mix(vec3(.01,.02,.06),C0*.3,.4);
    col=mix(deep,sky,clamp(fr*1.25,0.,1.));
    vec3 sdir=normalize(vec3(sun.x,sun.y,f));
    float sp=max(dot(r,sdir),0.);
    col+=vec3(1.,.72,.42)*(pow(sp,mix(1600.,180.,clamp(dy*3.,0.,1.)))*14.+pow(sp,40.)*.25)*sunK;
    col=mix(col,skyC(vec2(s2.x,.0),sunK,sun)*.95,exp(-dy*90.)*.75);
  }
  col=1.-exp(-col*1.2);
  col*=1.-.25*pow(length(uv-.5)*1.25,2.);
  gl_FragColor=vec4(col+grain()*.018,1.);`;
  PROG.sea = [seaPre, seaMain];

  /* ---------- mirror ball ---------- */
  const discoPre = LIB + `
  vec3 roomEnv(vec3 rd){
    float g=rd.y*.5+.5; vec3 c=mix(vec3(.12,.11,.14),vec3(.42,.42,.46),smoothstep(.0,1.,g))+mix(C0,C3,.5)*.12;
    c*=.7+.6*vn(rd.xy*6.+rd.z*3.);
    for(int i=0;i<9;i++){ float fi=float(i); float a=fi/9.*TAU+T*.18; vec3 L=normalize(vec3(cos(a),.1+.6*h11(fi+SEED),sin(a)*.8+.5));
      vec3 lc=mod(fi,3.)<1.?C2:(mod(fi,3.)<2.?C3:vec3(1.)); c+=mix(lc,vec3(1.),.3)*(pow(max(dot(rd,L),0.),18.)*2.2+pow(max(dot(rd,L),0.),120.)*4.); }
    c+=vec3(1.)*pow(max(dot(rd,normalize(vec3(.5,.7,.5))),0.),250.)*16.;
    return c; }`;
  const discoMain = `
  vec2 bc=vec2(0.,.2); float br=.19+.003*BEAT; vec2 d=p-bc; float dist=length(d), ang=atan(d.y,d.x);
  float haze=.4+1.1*sfbm2(p*2.2+vec2(T*.05,-T*.03));
  vec3 L=vec3(0.);
  for(int i=0;i<26;i++){ float fi=float(i); float a0=fi/26.*TAU+T*.22+h11(fi+SEED)*.4;
    float da=abs(mod(ang-a0+PI,TAU)-PI); float w=(.006+.012*h11(fi*7.1))*(1.+dist*.4);
    float k=exp(-(da*da)/(w*w))*smoothstep(br,br*1.25,dist)*exp(-dist*1.25);
    vec3 c=mod(fi,3.)<1.?C2:(mod(fi,3.)<2.?C3:vec3(1.)); c=mix(c,vec3(1.),.3);
    L+=c*k*(.35+.8*h11(fi*3.+floor(T*1.2)));}
  L*=haze*(.6+.5*BEAT);
  L+=mix(C2,C3,.5)*exp(-max(dist-br,0.)*4.)*.28*haze;
  for(int i=0;i<60;i++){ float fi=float(i); float a0=h11(fi*1.7+SEED)*TAU+T*(.16+.06*h11(fi)); float rr=.35+h11(fi*3.1)*1.15;
    vec2 sp=bc+vec2(cos(a0)*rr*1.8,sin(a0)*rr*.75-.15); vec2 q=(p-sp)*vec2(1.,1.35+.5*h11(fi*2.)); float s=length(q); float sz=.006+.01*h11(fi*5.3);
    vec3 c=mix(C2,C3,h11(fi*9.)); c=mix(c,vec3(1.),.35);
    L+=c*(smoothstep(sz,sz*.3,s)*1.1+exp(-s*s/(sz*sz*12.))*.3);}
  vec3 col=L; float a=clamp(lum(L)*1.1,0.,1.);
  float wire=smoothstep(1.2/R.y,0.,abs(p.x))*step(bc.y+br*.98,p.y); col=mix(col,vec3(.5),wire); a=max(a,wire);
  if(dist<br+2./R.y){
    vec2 q=d/br; float z=sqrt(max(0.,1.-dot(q,q))); vec3 n=vec3(q,z);
    float sp=T*.45; vec3 nr=n; nr.xz=rot(sp)*n.xz;
    float lat=asin(clamp(nr.y,-1.,1.)), lon=atan(nr.x,nr.z);
    float NL=30.; float fl=(lat/PI+.5)*NL; float li=floor(fl); float latc=((li+.5)/NL-.5)*PI;
    float nlon=max(4.,floor(NL*2.*cos(latc)+.5)); float fo=(lon/TAU+.5)*nlon; float lo=floor(fo); float lonc=((lo+.5)/nlon-.5)*TAU;
    float gx=fract(fl), gy=fract(fo); float aaF=fwidth(fl)+fwidth(fo);
    float gr=smoothstep(0.,.08+aaF,gx)*smoothstep(1.,.92-aaF,gx)*smoothstep(0.,.08+aaF,gy)*smoothstep(1.,.92-aaF,gy);
    vec3 fn=vec3(cos(latc)*sin(lonc),sin(latc),cos(latc)*cos(lonc)); fn.xz=rot(-sp)*fn.xz;
    float tv=h21(vec2(li,lo)+SEED); fn=normalize(fn+vec3(tv-.5,h21(vec2(lo,li))-.5,0.)*.07);
    vec3 rd=reflect(vec3(0.,0.,-1.),fn);
    vec3 env=roomEnv(rd)*(.75+.5*tv)+mix(C2,C3,tv)*.04;
    env*=1.+1.5*BEAT*step(.85,tv);
    vec3 bcol=mix(vec3(.01),env,gr)*(.3+.7*z);
    bcol+=mix(C2,vec3(1.),.5)*pow(1.-z,4.)*.2;
    bcol=aces(bcol*1.3);
    float ba=smoothstep(br,br-1.5/R.y,dist);
    col=col*(1.-ba)+bcol*ba; a=a+(1.-a)*ba;
  }
  for(int i=0;i<6;i++){ float fi=float(i); float la=(h11(fi*4.1+SEED)-.5)*1.2, lo=h11(fi*2.3+SEED)*TAU+T*.45;
    vec3 n=vec3(cos(la)*sin(lo),sin(la),cos(la)*cos(lo)); if(n.z<.2) continue;
    vec2 g=bc+n.xy*br; vec2 q=p-g; float fl=pow(.5+.5*sin(T*2.1+fi*2.1),8.)*smoothstep(.2,.6,n.z);
    float st=(exp(-abs(q.x)*320.)*exp(-abs(q.y)*14.)+exp(-abs(q.y)*320.)*exp(-abs(q.x)*14.))*.8+exp(-dot(q,q)*12000.)*1.6;
    col+=vec3(1.)*st*fl; a=clamp(a+st*fl,0.,1.); }
  gl_FragColor=vec4(col,a);`;
  PROG.disco = [discoPre, discoMain.replace(/fwidth\(/g, 'FW(')];

  /* ---------- hook the backgrounds that were still on the older shaders ---------- */
  const fullBG = (id, prog, opt, n) => { const b = BG[id]; if (!b) return; const f0 = b.f, gpu = b.gpu; delete b.gpu; b.full = true;
    b.f = (ctx, R) => { if (!full(ctx, prog, R, { t: R.t, beat: R.beat || 0, bass: R.bass || 0, bt: (R.t * (R.bpm || 120)) / 60, seed: n || 3, opt })) { if (gpu) { b.gpu = gpu; } else f0(ctx, R); } }; };
  fullBG('gl_chrome', 'liqflow', [1, 0, 0, 0], 4);
  fullBG('gl_liquidMarble', 'liqflow', [2, 0, 0, 0], 6);
  fullBG('gl_inkMarble', 'ink', [0, 0, 0, 0], 2);
  fullBG('gl_blobs', 'blobs', [0, 0, 0, 0], 5);
  // lava lamp keeps its layer look (blobs rising and merging over the scene)
  if (BG.lavaLamp) { const f0 = BG.lavaLamp.f; BG.lavaLamp.f = (ctx, R) => { if (!full(ctx, 'lava', R, { t: R.t, seed: 3, opt: [1, 0, 0, 0] })) f0(ctx, R); }; }
  // ink transitions use the ink-in-water cover
  const TR = LM.trans.lib;
  ['ink', 'inkBlob'].forEach((id) => { const L = TR[id]; if (!L) return; const f0 = L.f; L.mb = false; L.f = (ctx, u, R) => { if (!full(ctx, 'ink', R, { u, t: u * 3, seed: id === 'ink' ? 3 : 8, opt: [1, 0, 0, 0] })) f0(ctx, u, R); }; });
  void clamp; void E;
})();
