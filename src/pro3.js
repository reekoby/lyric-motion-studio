/* Pro pass, phase 3 of the effect catalogue: screen filters (GPU post).
 * Extends the renderer's post shader through LM.POSTX (declarations / uv / sample / colour / final stages and a
 * parameter hook), rebuilds the filters that looked cheap and adds four new groups:
 *  - rebuilt: film grain (luminance-weighted, two-scale, mostly monochrome), bloom with a soft threshold knee,
 *    VHS (chroma bleed + luma softening + tracking band + head-switch noise), CRT (shadow mask, phosphor glow,
 *    rounded bezel), chromatic aberration (7-tap spectral fringe)
 *  - ルック（色）: teal & orange, cross process, infrared, night vision, Game Boy, split tone, single colour,
 *    gradient map, film look, solarize, bit crush
 *  - 画材・印刷: risograph, photocopy, CMYK halftone, oil paint (Kuwahara), watercolour, pencil, cross-hatching,
 *    cel shading, manga screentone, LED wall, LCD subpixels, e-paper
 *  - レンズ・光学: halation, anamorphic streaks, lens distortion, dirty lens, spin blur, rolling shutter
 *  - デジタル崩し: feedback trails, datamosh, kaleidoscope, Voronoi mosaic, hexagon pixels, edge glow, signal jam */
'use strict';
(() => {
  const { clamp } = LM.U;
  const FX = LM.fx, PI = Math.PI;
  const F = (n, c) => ({ n, c, k: 'post' });
  Object.assign(FX.cats, { look: 'ルック（色の仕上げ）', media: '画材・印刷の質感', lens: 'レンズ・光学', digital: 'デジタル崩し' });
  Object.assign(FX.list, {
    tealOrange: F('ティール＆オレンジ（映画調）', 'look'), crossProcess: F('クロスプロセス', 'look'), infrared: F('赤外線写真', 'look'),
    nightVision: F('ナイトビジョン（暗視カメラ）', 'look'), gameboy: F('ゲームボーイ（4階調）', 'look'), splitTone: F('スプリットトーン（影と光で色分け）', 'look'),
    colorKeep: F('1色だけ残す（パートカラー）', 'look'), gradientMap: F('グラデーションマップ（配色で塗り直す）', 'look'), filmLook: F('フィルムルック（粒子・にじみ・揺れ）', 'look'),
    solarize: F('ソラリゼーション', 'look'), bitcrush: F('ビットクラッシュ（極端な減色）', 'look'),
    riso: F('リソグラフ印刷（2色の版ずれ）', 'media'), xerox: F('コピー機（荒いトナー）', 'media'), cmyk: F('CMYK網点（印刷物）', 'media'),
    oilPaint: F('油絵（筆のタッチ）', 'media'), watercolor: F('水彩（にじみと紙）', 'media'), pencil: F('鉛筆スケッチ', 'media'), crosshatch: F('クロスハッチング（線で陰影）', 'media'),
    toon: F('セル画調（トゥーン）', 'media'), mangaTone: F('漫画のスクリーントーン', 'media'), ledWall: F('LEDビジョン（発光ドット）', 'media'),
    lcd: F('液晶の画素（サブピクセル）', 'media'), eInk: F('電子ペーパー', 'media'),
    halation: F('ハレーション（明部の赤いにじみ）', 'lens'), anamorphic: F('アナモルフィック（横に伸びる光）', 'lens'), lensDistort: F('レンズ歪み（樽型）', 'lens'),
    dirtyLens: F('レンズの汚れ（光でにじむ）', 'lens'), spinBlur: F('回転ブラー', 'lens'), rollingShutter: F('ローリングシャッター（ゆがむ揺れ）', 'lens'),
    feedback: F('フィードバック（無限の残像）', 'digital'), datamosh: F('データモッシュ', 'digital'), kaleido: F('カレイドスコープ（万華鏡）', 'digital'),
    voronoi: F('ボロノイ・モザイク', 'digital'), hexPixel: F('ヘキサゴン・ピクセル', 'digital'), edgeGlow: F('エッジグロー（輪郭が光る）', 'digital'), signalJam: F('信号乱れ（アナログ放送）', 'digital'),
  });

  const UNI = ['tealO', 'xproc', 'infra', 'nightV', 'gboy', 'splitT', 'keepC', 'gmap', 'film', 'solar', 'bcrush', 'riso_', 'xerox', 'cmyk', 'oil', 'water', 'pencil', 'hatch', 'toon', 'manga', 'led', 'lcd', 'eink',
    'halo', 'ana', 'lensD', 'dirt', 'spin', 'rshut', 'fb', 'mosh', 'kal', 'vor', 'hexp', 'edgeG', 'jam', 'grainS', 'moshK'];
  const V3 = ['pA', 'pB', 'pC', 'pD'];

  const decl = `
uniform float ${UNI.join(',')};
uniform vec3 ${V3.join(',')};
uniform sampler2D T4;
float Lm(vec3 c){return dot(c,vec3(.299,.587,.114));}
float LT(vec2 q){return dot(texture2D(T0,q).rgb,vec3(.299,.587,.114));}
float vnz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1,0)),f.x),mix(h1(i+vec2(0,1)),h1(i+vec2(1,1)),f.x),f.y);}
float fbz(vec2 p){return vnz(p)*.55+vnz(p*2.1+3.1)*.3+vnz(p*4.3+7.7)*.15;}
float sob(vec2 q,float s){vec2 px=vec2(s)/R;
  float tl=LT(q+px*vec2(-1,1)),t=LT(q+px*vec2(0,1)),tr=LT(q+px*vec2(1,1)),l=LT(q-vec2(px.x,0.)),r=LT(q+vec2(px.x,0.)),bl=LT(q-px),b=LT(q-vec2(0.,px.y)),br=LT(q+px*vec2(1,-1));
  float gx=tr+2.*r+br-tl-2.*l-bl, gy=tl+2.*t+tr-bl-2.*b-br; return length(vec2(gx,gy));}
vec2 ledF=vec2(0.); vec2 hexC=vec2(0.);
`;
  // uv distortions (before sampling)
  const uv = `
 if(lensD>0.0){vec2 c=u-.5;float ar=R.x/R.y;float r2=dot(c*vec2(ar,1.),c*vec2(ar,1.));u=.5+c*(1.+lensD*.22*r2)/(1.+lensD*.22*.3);}
 if(rshut>0.0){u.x+=sin(u.y*2.4-time*3.1)*.012*rshut+sin(u.y*7.-time*5.3)*.003*rshut;}
 if(kal>0.0){float ar=R.x/R.y;vec2 c=(u-.5)*vec2(ar,1.);float rr=length(c),an=atan(c.y,c.x)+time*.06;float sg=6.2831853/6.;an=mod(an,sg);an=abs(an-sg*.5);vec2 k=vec2(cos(an),sin(an))*rr;u=mix(u,.5+k/vec2(ar,1.),kal);}
 if(jam>0.0){float ln=floor(u.y*R.y/(2.*S));float bt=floor(time*12.);float burst=step(.82,h1(vec2(bt,3.)))*jam;
   u.x+=(h1(vec2(ln,bt))-.5)*.012*jam+burst*(h1(vec2(floor(u.y*14.),bt))-.5)*.08;u.y=fract(u.y+burst*.12*h1(vec2(bt,9.)));}
 if(led>0.0){vec2 cs=vec2(max(4.,S*9.*(1.3-led*.4)))/R;ledF=fract(u/cs)-.5;u=(floor(u/cs)+.5)*cs;}
 if(hexp>0.0){float sz=max(5.,S*(16.-hexp*5.));vec2 q=gl_FragCoord.xy/sz;vec2 r=vec2(1.,1.732);vec2 h=r*.5;vec2 a=mod(q,r)-h,b=mod(q-h,r)-h;vec2 g=dot(a,a)<dot(b,b)?a:b;hexC=g;u=(q-g)*sz/R;}
 if(vor>0.0){float sz=max(10.,S*(42.-vor*14.));vec2 q=gl_FragCoord.xy/sz;vec2 ip=floor(q);float md=9.;vec2 best=q;
   for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 c=ip+vec2(float(i),float(j));vec2 pt=c+.5+.42*sin(vec2(h1(c),h1(c+7.))*6.28+time*.6);float d=length(pt-q);if(d<md){md=d;best=pt;}}
   u=best*sz/R;}
 if(film>0.0){u+=vec2(h1(vec2(floor(time*24.),1.))-.5,h1(vec2(floor(time*24.),2.))-.5)*.0016*film;}
`;
  // sample stage: may replace col (premultiplied)
  const smp = `
 if(chrom>0.0){vec2 c=u-.5;float k=chrom*.04;vec3 acc=vec3(0.);vec3 wsum=vec3(0.);
   for(int i=0;i<7;i++){float t=float(i)/6.;vec3 w=vec3(smoothstep(.5,1.,t)+.15*(1.-t),1.-abs(t-.5)*2.,smoothstep(.5,0.,t)+.15*t);acc+=texture2D(T0,.5+c*(1.+(t-.5)*k*2.)).rgb*w;wsum+=w;}
   col.rgb=mix(col.rgb,acc/wsum,clamp(length(c)*2.2,0.,1.));}
 if(vhs>0.0){vec2 px=vec2(S,0.)/R;vec3 yS=vec3(0.),cS=vec3(0.);
   for(int i=-3;i<=3;i++){float fi=float(i);vec3 s1=texture2D(T0,u+px*fi*1.2).rgb;vec3 s2=texture2D(T0,u+px*(fi*4.5+7.)).rgb;
     yS+=vec3(dot(s1,vec3(.299,.587,.114)))/7.;cS+=vec3(dot(s2,vec3(.596,-.274,-.322)),dot(s2,vec3(.211,-.523,.312)),0.)/7.;}
   float Y=yS.x;vec3 rgbV=vec3(Y+.956*cS.x+.621*cS.y,Y-.272*cS.x-.647*cS.y,Y-1.106*cS.x+1.703*cS.y);
   rgbV=mix(vec3(Y),rgbV,1.15)*vec3(1.04,.98,1.02)+vec3(.02,0.,.03);col.rgb=mix(col.rgb,rgbV,clamp(vhs,0.,1.));
   float tb=fract(u.y*.7-time*.11);float band=smoothstep(.0,.015,tb)*smoothstep(.06,.015,tb);col.rgb=mix(col.rgb,col.rgb*.75+vec3(h1(vec2(floor(u.x*R.x/(3.*S)),floor(time*30.)))*.35),band*vhs*.8);
   float hs=smoothstep(.035,0.,u.y);col.rgb=mix(col.rgb,texture2D(T0,vec2(u.x+.04*sin(u.y*300.+time*20.),u.y)).rgb,hs*vhs);}
 if(oil>0.0||water>0.0){float rad=max(3.,S*(oil>0.0?8.+oil*4.:4.)); vec2 px=vec2(rad)/R; vec3 m0=vec3(0.),m1=vec3(0.),m2=vec3(0.),m3=vec3(0.);float v0=0.,v1=0.,v2=0.,v3=0.;
   for(int j=0;j<=2;j++)for(int i=0;i<=2;i++){vec2 o=vec2(float(i),float(j))*.5;
     vec3 a=texture2D(T0,u+vec2(-o.x,-o.y)*px).rgb,b=texture2D(T0,u+vec2(o.x,-o.y)*px).rgb,c=texture2D(T0,u+vec2(-o.x,o.y)*px).rgb,d=texture2D(T0,u+o*px).rgb;
     m0+=a;m1+=b;m2+=c;m3+=d;v0+=Lm(a)*Lm(a);v1+=Lm(b)*Lm(b);v2+=Lm(c)*Lm(c);v3+=Lm(d)*Lm(d);}
   m0/=9.;m1/=9.;m2/=9.;m3/=9.;v0=v0/9.-Lm(m0)*Lm(m0);v1=v1/9.-Lm(m1)*Lm(m1);v2=v2/9.-Lm(m2)*Lm(m2);v3=v3/9.-Lm(m3)*Lm(m3);
   vec3 k=m0;float mv=v0;if(v1<mv){mv=v1;k=m1;}if(v2<mv){mv=v2;k=m2;}if(v3<mv){mv=v3;k=m3;}
   if(oil>0.0){float e=sob(u,S*1.5);float hgt=Lm(k);float hx=Lm(texture2D(T0,u+vec2(S*2.,0.)/R).rgb)-hgt;float hy=Lm(texture2D(T0,u+vec2(0.,S*2.)/R).rgb)-hgt;
     float bru=fbz(vec2(gl_FragCoord.x/(S*2.)+hgt*30.,gl_FragCoord.y/(S*9.)));float lit=clamp(.92+(-hx+hy)*4.+(bru-.5)*.18,.6,1.35);k=k*lit+vec3(1.)*pow(max(-hx+hy,0.)*4.,3.)*.25;col.rgb=mix(col.rgb,k,clamp(oil,0.,1.));}
   else{vec2 w=vec2(fbz(gl_FragCoord.xy/(S*40.)),fbz(gl_FragCoord.xy/(S*40.)+5.))-.5;vec3 bl=texture2D(T1,u+w*.01).rgb;vec3 wc=mix(k,bl,.35);
     float e=sob(u,S*2.);wc*=1.-smoothstep(.15,.6,e)*.35;float paper=.92+.08*fbz(gl_FragCoord.xy/(S*3.));
     float pig=fbz(gl_FragCoord.xy/(S*18.));wc=mix(wc,wc*wc,pig*.25);col.rgb=mix(col.rgb,wc*paper+vec3(.04)*(1.-paper),clamp(water,0.,1.));}}
 if(riso_>0.0){vec2 off=vec2(2.5,-1.8)*S/R*(1.+riso_);float L1=pow(LT(u),.85),L2=pow(LT(u+off),.85);float gp=h1(floor(gl_FragCoord.xy/max(1.,S*2.)));
   vec2 q=gl_FragCoord.xy/max(3.,S*4.);float sc1=(1.-L1)+(gp-.5)*.35,sc2=(1.-L2)*.9+(h1(q*1.7)-.5)*.35;
   float d1=smoothstep(.4,.56,sc1),d2=smoothstep(.55,.7,sc2);vec3 paper=vec3(.97,.95,.9);
   vec3 inkA=pA,inkB=pB;vec3 r=paper*mix(vec3(1.),inkA,d1*.92)*mix(vec3(1.),inkB,d2*.85);col.rgb=mix(col.rgb,r,clamp(riso_,0.,1.));}
 if(xerox>0.0){float L=LT(u);float sp=h1(floor(gl_FragCoord.xy/max(1.,S*1.5))+floor(time*12.));float str=fbz(vec2(gl_FragCoord.x/(S*2.),gl_FragCoord.y/(S*90.)+floor(time*6.)));
   float t=smoothstep(.42,.5,L+(sp-.5)*.18+(str-.5)*.2);vec3 r=mix(vec3(.06),vec3(.96,.95,.93),t);r=mix(r,vec3(.06),step(.997,sp)*t);col.rgb=mix(col.rgb,r,clamp(xerox,0.,1.));}
 if(cmyk>0.0){vec3 rgb=texture2D(T0,u).rgb;float K=1.-max(rgb.r,max(rgb.g,rgb.b));vec3 cmy=(1.-rgb-K)/max(1.-K,.001);float sz=max(4.,S*(8.-cmyk*2.));
   vec3 res=vec3(1.);
   for(int i=0;i<4;i++){float a=i==0?.26:i==1?1.31:i==2?0.:.79;mat2 m=mat2(cos(a),-sin(a),sin(a),cos(a));vec2 q=m*gl_FragCoord.xy/sz;vec2 f=fract(q)-.5;
     float v=i==0?cmy.x:i==1?cmy.y:i==2?cmy.z:K;float d=1.-smoothstep(sqrt(v)*.62-.06,sqrt(v)*.62+.06,length(f));
     vec3 ink=i==0?vec3(0.,.68,.94):i==1?vec3(.93,0.,.55):i==2?vec3(1.,.94,0.):vec3(.08);res*=mix(vec3(1.),ink,d*.95);}
   col.rgb=mix(col.rgb,res*vec3(.98,.97,.94),clamp(cmyk,0.,1.));}
 if(pencil>0.0||hatch>0.0){float L=LT(u);float e=sob(u,S*1.3);vec2 fc=gl_FragCoord.xy/max(1.,S);
   float jit=(fbz(fc*.05)-.5)*2.;float l1=smoothstep(.16,.0,abs(fract((fc.x+fc.y+jit)/5.)-.5)),l2=smoothstep(.16,.0,abs(fract((fc.x-fc.y+jit)/5.)-.5)),l3=smoothstep(.14,.0,abs(fract((fc.x+jit*.5)/4.)-.5));
   float ink=l1*smoothstep(.85,.6,L)+l2*smoothstep(.6,.38,L)+l3*smoothstep(.36,.18,L);ink=clamp(ink,0.,1.);
   vec3 paper=vec3(.97,.96,.93)*(.94+.06*fbz(fc*.15));
   if(pencil>0.0){float grain=fbz(fc*vec2(.6,.08));float stroke=clamp(smoothstep(.12,.5,e)*1.2+ink*(.35+.5*grain)*(1.-L),0.,1.);vec3 r=mix(paper,vec3(.18,.18,.22),stroke*.85);col.rgb=mix(col.rgb,r,clamp(pencil,0.,1.));}
   else{vec3 base=mix(texture2D(T0,u).rgb,vec3(1.),.55);vec3 r=mix(base,pA*.25,clamp(ink*.85+smoothstep(.15,.5,e),0.,1.));col.rgb=mix(col.rgb,r*paper,clamp(hatch,0.,1.));}}
 if(toon>0.0){vec3 s=texture2D(T0,u).rgb;float L=Lm(s);float q=floor(L*4.+.5)/4.;vec3 r=s*(q/max(L,.02));r=mix(vec3(Lm(r)),r,1.25);float e=sob(u,S*1.2);r*=1.-smoothstep(.2,.45,e);col.rgb=mix(col.rgb,r,clamp(toon,0.,1.));}
 if(manga>0.0){float L=LT(u);float e=sob(u,S*1.2);float sz=max(3.,S*5.);mat2 m=mat2(.707,-.707,.707,.707);vec2 f=fract(m*gl_FragCoord.xy/sz)-.5;
   float dot1=1.-smoothstep(.22,.3,length(f));float r=L>.72?1.:L>.42?1.-dot1:L>.2?1.-dot1*1.6:0.;r=clamp(r,0.,1.)*(1.-smoothstep(.18,.4,e));col.rgb=mix(col.rgb,vec3(r)*vec3(.98,.97,.95),clamp(manga,0.,1.));}
 if(edgeG>0.0){float e=sob(u,S*1.5);vec3 ec=mix(pA,vec3(1.),.35)*smoothstep(.08,.5,e)*1.6;col.rgb=mix(col.rgb,col.rgb*.35+ec,clamp(edgeG,0.,1.));col.a=max(col.a,clamp(e,0.,1.));}
 if(ana>0.0){vec3 st=vec3(0.);for(int i=1;i<=10;i++){float o=float(i)*float(i)*1.6*S/R.x;vec3 a=texture2D(T0,u+vec2(o,0.)).rgb,b=texture2D(T0,u-vec2(o,0.)).rgb;st+=(max(a-.62,0.)+max(b-.62,0.))*(1.-float(i)/11.);}
   col.rgb+=st*vec3(.35,.55,1.)*ana*.7;}
 if(halo>0.0){vec3 bl=texture2D(T1,u).rgb;col.rgb+=max(bl-.55,0.)*vec3(1.,.28,.12)*halo*1.6;}
 if(dirt>0.0){vec3 bl=texture2D(T1,u).rgb;float sm=fbz(u*vec2(R.x/R.y,1.)*3.)*.7+fbz(u*14.)*.3;float sp=smoothstep(.55,.95,fbz(u*28.+3.));col.rgb+=max(bl-.3,0.)*(sm*1.2+sp*1.5)*dirt*.9;}
 if(spin>0.0){vec2 c=(u-.5)*vec2(R.x/R.y,1.);vec4 acc=vec4(0.);for(int i=0;i<12;i++){float a=(float(i)/11.-.5)*.07*spin;vec2 r=vec2(c.x*cos(a)-c.y*sin(a),c.x*sin(a)+c.y*cos(a));acc+=texture2D(T0,r/vec2(R.x/R.y,1.)+.5);}col=mix(col,acc/12.,clamp(length(c)*2.,0.,1.));}
 if(fb>0.0){vec2 c=u-.5;float a=.012*fb;vec2 r=vec2(c.x*cos(a)-c.y*sin(a),c.x*sin(a)+c.y*cos(a))*(1.-.018*fb)+.5;vec4 pv=texture2D(T4,r);col.rgb=max(col.rgb,pv.rgb*(.86+.08*fb)*vec3(1.,.97,1.02));col.a=max(col.a,pv.a*.9);}
 if(mosh>0.0){vec2 bk=floor(u*vec2(24.,14.));vec2 fl=(vec2(h1(bk+floor(time*3.)),h1(bk+9.+floor(time*3.)))-.5)*.012*mosh;vec4 pv=texture2D(T4,u-fl);
   float keep=moshK*step(.25,h1(bk+floor(time*8.)));col=mix(col,pv,clamp(keep,0.,.96));}
`;
  // colour stage (vec3 c unpremultiplied), placed after thermal
  const col = `
 if(tealO>0.0){float L=Lm(c);vec3 t=mix(c,c*vec3(.78,1.02,1.12)+vec3(-.03,.03,.06),1.-smoothstep(.15,.6,L));t=mix(t,t*vec3(1.12,1.0,.82)+vec3(.04,.01,-.03),smoothstep(.45,.95,L));t=mix(vec3(Lm(t)),t,1.18);c=mix(c,t,clamp(tealO,0.,1.));}
 if(xproc>0.0){vec3 t=vec3(smoothstep(.05,.95,c.r),pow(c.g,.85)*1.05,c.b*.72+.12);t=mix(vec3(Lm(t)),t,1.25);c=mix(c,t,clamp(xproc,0.,1.));}
 if(infra>0.0){float ir=clamp(c.g*1.4-c.b*.2,0.,1.);vec3 t=mix(vec3(Lm(c))*vec3(.95,.85,.9),vec3(1.,.92,.95),smoothstep(.3,.8,ir));t=mix(t,t*vec3(1.05,.8,.95),.4);c=mix(c,t,clamp(infra,0.,1.));}
 if(nightV>0.0){float L=Lm(c)*1.6+.05;L+=(h1(gl_FragCoord.xy+fract(time*13.)*99.)-.5)*.18;vec3 t=vec3(.15,1.,.25)*L;t*=.85+.15*sin(gl_FragCoord.y*1.3);t*=1.-smoothstep(.25,.62,length((v-.5)*vec2(R.x/R.y*.62,1.)));c=mix(c,t,clamp(nightV,0.,1.));}
 if(gboy>0.0){vec2 q=floor(gl_FragCoord.xy/max(1.,S*2.));float bay=(4.*b2(q)+b2(floor(q/2.))+.5)/16.;float L=clamp(Lm(c)+(bay-.5)*.25,0.,.999);float k=floor(L*4.);
   vec3 t=k<1.?vec3(.06,.22,.06):k<2.?vec3(.19,.38,.19):k<3.?vec3(.55,.67,.06):vec3(.61,.74,.06);c=mix(c,t,clamp(gboy,0.,1.));}
 if(splitT>0.0){float L=Lm(c);vec3 t=c+mix(pB-.5,vec3(0.),smoothstep(.0,.55,L))*.18+mix(vec3(0.),pA-.5,smoothstep(.45,1.,L))*.16;c=mix(c,t,clamp(splitT,0.,1.));}
 if(keepC>0.0){vec3 k=normalize(pA+.001);vec3 n=normalize(c+.001);float s=max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b));float m=smoothstep(.93,.985,dot(k,n))*smoothstep(.12,.3,s);c=mix(c,mix(vec3(Lm(c)),c*1.08,m),clamp(keepC,0.,1.));}
 if(gmap>0.0){float L=Lm(c);vec3 t=L<.33?mix(pD,pB,L/.33):L<.66?mix(pB,pA,(L-.33)/.33):mix(pA,pC,(L-.66)/.34);c=mix(c,t,clamp(gmap,0.,1.));}
 if(solar>0.0){vec3 t=abs(c-.5)*2.;t=1.-t;t=mix(t,t.gbr,.25);c=mix(c,t,clamp(solar,0.,1.));}
 if(bcrush>0.0){vec2 q=floor(gl_FragCoord.xy/max(1.,S*3.));float bay=(4.*b2(q)+b2(floor(q/2.))+.5)/16.;float lv=bcrush>0.8?2.:3.;c=floor(c*lv+bay)/lv;}
 if(led>0.0){float d=length(ledF);float dotm=smoothstep(.45,.3,d);vec3 t=c*2.3*dotm+c*.25*smoothstep(.75,.2,d);c=mix(c,t,clamp(led,0.,1.));}
 if(lcd>0.0){float sz=max(3.,S*3.);float x=mod(gl_FragCoord.x/sz*3.,3.);vec3 m=vec3(step(x,1.),step(1.,x)*step(x,2.),step(2.,x));float ln=smoothstep(.0,.25,fract(gl_FragCoord.y/sz));vec3 t=c*(m*2.9+.25)*ln;c=mix(c,t,clamp(lcd,0.,1.));}
 if(eink>0.0){vec2 q=floor(gl_FragCoord.xy/max(1.,S*1.5));float bay=(4.*b2(q)+b2(floor(q/2.))+.5)/16.;float L=floor(clamp(Lm(c)*1.1+(bay-.5)*.12,0.,1.)*15.)/15.;vec3 t=mix(vec3(.14,.14,.13),vec3(.86,.85,.8),L)*(.97+.03*fbz(gl_FragCoord.xy*.05));c=mix(c,t,clamp(eink,0.,1.));}
 if(film>0.0){float L=Lm(c);vec3 t=c*vec3(1.03,1.0,.95);t=mix(vec3(.06,.05,.07),vec3(.97,.95,.9),t);t=mix(vec3(Lm(t)),t,.88);c=mix(c,t,clamp(film,0.,1.));}
`;
  // final stage (after vignette / crt)
  const fin = `
 if(crt>0.0){vec2 fc=gl_FragCoord.xy;float tri=mod(fc.x/max(1.,S*1.4),3.);vec3 mask=vec3(.6)+vec3(step(tri,1.),step(1.,tri)*step(tri,2.),step(2.,tri))*.8;
   c*=mix(vec3(1.),mask,crt*.55);c+=texture2D(T1,u).rgb*.22*crt;vec2 cc=abs(u-.5)*2.;float corner=smoothstep(1.,.92,max(cc.x,cc.y))*smoothstep(1.08,.96,length(max(cc-.85,0.))*6.+.9);c*=mix(1.,corner,crt);}
 if(grainS>0.0){vec2 gp=gl_FragCoord.xy/max(1.,S*1.15);float fr=fract(time*23.71)*113.;
   float g=(h1(gp+fr)+h1(gp+fr+17.3)+h1(gp*.5+fr*.7))/3.-.5;float L=Lm(c);float w=.55+1.2*L*(1.-L)*2.;
   c+=vec3(g)*grainS*w+vec3(h1(gp+fr+3.)-.5,0.,h1(gp+fr+7.)-.5)*grainS*.18;}
 if(film>0.0){float fl=1.+(h1(vec2(floor(time*24.),5.))-.5)*.05*film;c*=fl;
   float scr=step(.996,h1(vec2(floor(gl_FragCoord.x/max(1.,S*1.5)),floor(time*24.))))*step(.6,h1(vec2(floor(time*24.),11.)));c=mix(c,vec3(.92),scr*.35*film);}
 if(nightV>0.0){vec2 nq=(v-.5)*vec2(R.x/R.y*.62,1.);c*=1.-smoothstep(.46,.52,length(nq))*nightV;}
`;
  LM.POSTX = {
    uni: UNI, v3: V3, decl, uv, smp, col, fin,
    // filter amounts → uniforms (g(id) = amount, 1 = default)
    params(g, u, ctx) {
      const { S, t, beat, burst, pal, hex3, has } = ctx;
      UNI.forEach((n) => (u[n] = 0));
      const c01 = (x) => clamp(x, 0, 1);
      u.tealO = c01(g('tealOrange') * 0.9); u.xproc = c01(g('crossProcess') * 0.85); u.infra = c01(g('infrared') * 0.9); u.nightV = c01(g('nightVision'));
      u.gboy = c01(g('gameboy')); u.splitT = c01(g('splitTone') * 0.9); u.keepC = c01(g('colorKeep')); u.gmap = c01(g('gradientMap') * 0.9);
      u.film = c01(g('filmLook') * 0.85); u.solar = c01(g('solarize') * 0.8); u.bcrush = has('bitcrush') ? clamp(g('bitcrush'), 0.3, 1.2) : 0;
      u.riso_ = c01(g('riso')); u.xerox = c01(g('xerox')); u.cmyk = c01(g('cmyk')); u.oil = c01(g('oilPaint')); u.water = c01(g('watercolor'));
      u.pencil = c01(g('pencil')); u.hatch = c01(g('crosshatch')); u.toon = c01(g('toon')); u.manga = c01(g('mangaTone')); u.led = c01(g('ledWall')); u.lcd = c01(g('lcd') * 0.8); u.eink = c01(g('eInk'));
      u.halo = g('halation') * 0.9 + (has('filmLook') ? 0.35 * g('filmLook') : 0); u.ana = g('anamorphic') * (0.8 + beat * 0.3); u.lensD = clamp(g('lensDistort'), 0, 2); u.dirt = g('dirtyLens');
      u.spin = g('spinBlur') * (0.6 + beat * 0.5 + burst * 0.8); u.rshut = g('rollingShutter') * (0.6 + beat * 0.6);
      u.fb = clamp(g('feedback'), 0, 1.5); u.mosh = clamp(g('datamosh'), 0, 1.5); u.moshK = has('datamosh') ? (burst > 0.6 || beat > 0.92 ? 0 : 0.9) : 0;
      u.kal = c01(g('kaleido')); u.vor = c01(g('voronoi')); u.hexp = c01(g('hexPixel')); u.edgeG = c01(g('edgeGlow')); u.jam = g('signalJam') * (0.5 + burst + beat * 0.4);
      u.grainS = u.noise > 0 ? u.noise * 0.42 : 0; if (has('filmLook')) u.grainS = Math.max(u.grainS, 0.06 * g('filmLook'));
      u.pA = hex3(pal.accent); u.pB = hex3(pal.sub || pal.accent); u.pC = hex3(pal.text); u.pD = hex3(pal.bg);
      u.needBlur = u.halo > 0 || u.dirt > 0 || u.water > 0 || u.crt > 0;
      u.needFB = u.fb > 0 || u.mosh > 0;
      void S; void t; void PI;
    },
  };

  /* themes pick up the new looks */
  const D = LM.data, add = (id, o) => { const t = D.themeById[id]; if (t) t.filters = Object.assign({}, t.filters || {}, o); };
  add('cinematic', { tealOrange: 1.5, halation: 1, anamorphic: 1.2, filmLook: 1 }); add('ballad', { halation: 1, filmLook: 0.8, dirtyLens: 0.8 }); add('lofi', { filmLook: 1.2, watercolor: 0.6, eInk: 0.3 });
  add('citypop', { crossProcess: 1, anamorphic: 0.8, splitTone: 1 }); add('vocaloid', { signalJam: 1, hexPixel: 0.8, edgeGlow: 1 }); add('edm', { anamorphic: 1.2, feedback: 1, kaleido: 0.6, edgeGlow: 0.8 });
  add('house', { anamorphic: 1, feedback: 0.8 }); add('rock', { xerox: 0.8, filmLook: 0.6 }); add('metal', { xerox: 1, solarize: 0.5 }); add('hiphop', { cmyk: 1, xerox: 0.8, riso: 0.8 });
  add('jpop', { toon: 0.6, mangaTone: 0.4 }); add('anison', { toon: 1, mangaTone: 0.8, anamorphic: 0.6 }); add('wa', { watercolor: 1.2, oilPaint: 0.4 }); add('acoustic', { watercolor: 1, pencil: 0.8, filmLook: 0.8 });
  add('ambient', { dirtyLens: 1, halation: 0.6 }); add('dream', { halation: 1.2, dirtyLens: 1, feedback: 0.6 }); add('minimal', { eInk: 0.6, pencil: 0.5 }); add('psyche', { kaleido: 1.5, feedback: 1.2, solarize: 1, gradientMap: 1 });
  add('thermalvj', { datamosh: 1.5, feedback: 1, signalJam: 1 }); add('vj', { feedback: 1.2, kaleido: 1, voronoi: 0.8, edgeGlow: 1 }); add('edge', { xerox: 1.2, riso: 1, bitcrush: 0.6 });
  add('showreel', { gradientMap: 0.8, riso: 0.6 }); add('artistmv', { filmLook: 1.2, halation: 1, anamorphic: 0.8 });
  add('kpop', { anamorphic: 1, halation: 0.6 }); add('hyperpop', { feedback: 1.2, kaleido: 0.8, bitcrush: 0.8, signalJam: 0.6 }); add('chiptune', { gameboy: 1.5, ledWall: 1.2, lcd: 0.8, bitcrush: 1 });
  add('jazz', { filmLook: 1.2, halation: 1, splitTone: 0.8 }); add('funk', { cmyk: 0.8, splitTone: 0.8, filmLook: 0.6 }); add('punk', { xerox: 1.5, riso: 1.2, cmyk: 0.8 });
  add('trap', { nightVision: 0.4, anamorphic: 1, tealOrange: 0.8 }); add('classical', { oilPaint: 1, filmLook: 0.8, halation: 0.6 }); add('horror', { nightVision: 0.8, infrared: 0.8, filmLook: 1, signalJam: 0.6 });
  add('kids', { toon: 1, watercolor: 0.8 }); add('latin', { crossProcess: 0.8, splitTone: 0.8 }); add('techno', { ledWall: 1, lcd: 0.8, edgeGlow: 0.8, eInk: 0.5 });
})();
