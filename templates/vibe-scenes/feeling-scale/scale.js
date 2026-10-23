// 用途：复用20完整蓝图、装配、扫描与材质管线，主体改为受力天平。
// 运行：createFeelingScale20(stage).draw(本幕秒数)，由唯一主时间轴驱动。
// 依赖：core.js、gl.js、rm.js；部件/吊盘/砝码共用同一倾角和投影。
window.createFeelingScale20=function(stage,options){
const weightScale=Math.cbrt(options.ratio), lossImpulse=.08+.36*(options.ratio-1)/1.25;
const {E,clamp,inv,lerp,spring}=Reel,FOC=4.2;
const rm = Reel.RM(stage, {
  bloom: 0.3, th: 1.2, expo: 1.12, vig: 0.26, grain: 0.012, ca: 0.4, contrast: 1.03, sat: 1.0, bands: 8,
  uniforms: `uniform float uE, uScan, uReveal, uFade, uTilt, uSwayG, uSwayL, uDropG, uDropL, uGain, uLoss, uWeightScale; uniform vec3 uRo, uTa; uniform vec2 uSweep; uniform float uYaw;`,
  scene: `
float sdCylY(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x,d.y),0.) + length(max(d,0.)); }
float sdCylX(vec3 p, float r, float h){ return sdCylY(p.yxz, r, h); }
// parts in mic space (exploded by uE). returns (d, part id)
vec2 mic(vec3 p){
  p=rotY(-uYaw)*p;
  float e=uE;
  vec2 d=vec2(1e3,-1.);
  float base=sdRoundBox(p-vec3(0.,-.48-.8*e,0.),vec3(1.06,.16,.6),.10);
  if(base<d.x)d=vec2(base,8.);
  float trim=sdRoundBox(p-vec3(0.,-.325-.8*e,0.),vec3(.88,.028,.49),.025);
  if(trim<d.x)d=vec2(trim,4.);
  float pole=sdCylY(p-vec3(0.,.78-.25*e,0.),.075,1.12);
  if(pole<d.x)d=vec2(pole,7.);
  float foot=sdCylY(p-vec3(0.,-.22-.25*e,0.),.20,.08);
  if(foot<d.x)d=vec2(foot,4.);
  vec3 q=rotZ(-uTilt)*(p-vec3(0.,2.+.55*e,0.));
  float beam=sdCapsule(q,vec3(-1.82,0.,0.),vec3(1.82,0.,0.),.072);
  if(beam<d.x)d=vec2(beam,4.);
  float pivot=sdCylY((p-vec3(0.,2.+.55*e,0.)).xzy,.18,.12);
  if(pivot<d.x)d=vec2(pivot,2.);
  float cap=sdSphere(p-vec3(0.,2.25+.55*e,0.),.11);
  if(cap<d.x)d=vec2(cap,4.);
  for(int i=0;i<2;i++){
    float side=i==0?-1.:1.;
    float sw=i==0?uSwayG:uSwayL;
    float length=1.15+.45*e;
    vec3 joint=vec3(side*(1.75+.65*e)*cos(uTilt),2.+.55*e+side*(1.75+.65*e)*sin(uTilt),0.);
    vec3 pan=joint+vec3(sin(sw)*length,-cos(sw)*length,0.);
    float dish=sdCylY(p-pan,.59,.035);
    if(dish<d.x)d=vec2(dish,4.);
    float rim=sdTorus(p-pan-vec3(0.,.04,0.),vec2(.585,.025));
    if(rim<d.x)d=vec2(rim,2.);
    for(int j=0;j<3;j++){
      float a=float(j)*2.0943951+.5236;
      vec3 edge=pan+vec3(.54*cos(a),.045,.54*sin(a));
      float chain=sdCapsule(p,joint,edge,.018);
      if(chain<d.x)d=vec2(chain,2.);
    }
    float on=i==0?uGain:uLoss;
    if(on>.001){
      float k=(i==0?1.:uWeightScale)*on;
      float drop=i==0?uDropG:uDropL;
      vec3 w=(p-pan-vec3(0.,.045+drop,0.))/k;
      float body=sdCylY(w-vec3(0.,.255,0.),.29,.245);
      float collar=sdCylY(w-vec3(0.,.53,0.),.135,.045);
      float handle=sdTorus((w-vec3(0.,.67,0.)).xzy,vec2(.10,.025));
      float weight=min(body,min(collar,handle))*k;
      if(weight<d.x)d=vec2(weight,i==0?9.:10.);
    }
  }
  return d;
}
const float FLOORY = -.69;
float mapS(vec3 p){ return mic(p).x; }
vec3 nrm(vec3 p){ const vec2 k = vec2(1.,-1.)*.0006;
  return normalize(k.xyy*mapS(p+k.xyy) + k.yyx*mapS(p+k.yyx) + k.yxy*mapS(p+k.yxy) + k.xxx*mapS(p+k.xxx)); }
// march with near-miss tracking (for silhouette lines): returns t (or -1), id, min normalised gap, depth of that gap
vec2 cylHit(vec3 ro, vec3 rd){                     // bounding cylinder around the (exploded) mic
  const float R = 3.5, Y0 = -2.1, Y1 = 5.5;
  float a = dot(rd.xz, rd.xz), b = dot(ro.xz, rd.xz), c = dot(ro.xz, ro.xz) - R*R;
  float disc = b*b - a*c; if (disc < 0.) return vec2(1., -1.);
  float s = sqrt(disc); float t0 = (-b - s) / a, t1 = (-b + s) / a;
  float ty0 = (Y0 - ro.y) / rd.y, ty1 = (Y1 - ro.y) / rd.y; float tlo = min(ty0, ty1), thi = max(ty0, ty1);
  return vec2(max(t0, tlo), min(t1, thi));
}
vec4 marchBP(vec3 ro, vec3 rd, float px, out float gapT){
  float mw = 1e3; gapT = 0.; float idh = -1.;
  vec2 bb = cylHit(ro, rd); if (bb.y < max(bb.x, 0.)) return vec4(-1., -1., 1e3, 0.);
  float t = max(bb.x, 0.);
  for (int i=0;i<150;i++){
    vec2 h = mic(ro + rd*t);
    float w = h.x / (t*px);
    if (w < mw) { mw = w; gapT = t; }
    if (h.x < .0004*t) { idh = h.y; break; }
    t += h.x * .9; if (t > bb.y) { t = -1.; break; }
  }
  return vec4(t, idh, mw, 0.);
}
vec3 bpPaper(vec2 fc){
  vec2 uv = fc / uRes;
  vec3 c = mix(vec3(.006,.026,.04), vec3(.012,.06,.085), smoothstep(1.2, .1, length((uv - vec2(.5,.55)) * vec2(1.4,1.))));
  vec2 g = fc / (uRes.y / 54.); vec2 gm = fc / (uRes.y / 10.8);
  float minor = max(smoothstep(.06, 0., abs(fract(g.x)-.5) - .44), smoothstep(.06, 0., abs(fract(g.y)-.5) - .44));
  float major = max(smoothstep(.04, 0., abs(fract(gm.x)-.5) - .485), smoothstep(.04, 0., abs(fract(gm.y)-.5) - .485));
  c += vec3(.35,.65,.8) * (minor * .022 + major * .05);
  c *= .92 + .08 * fbm2(fc * .02);                                   // paper unevenness
  return c;
}
vec3 blueprint(vec2 fc, vec3 ro, vec3 rd, float px){
  vec3 c = bpPaper(fc);
  float gapT; vec4 h = marchBP(ro, rd, px, gapT);
  float line = 0.;
  // silhouettes: near-miss before a hit far behind, or a miss
  float sil = smoothstep(1.7, .55, h.z);
  if (h.x < 0. || h.x - gapT > .25) line = max(line, sil);
  float yref = h.x > 0. ? (ro + rd*h.x).y : (ro + rd*gapT).y;
  if (h.x > 0.) {
    vec3 p = ro + rd*h.x; vec3 n = nrm(p);
    vec3 tA = normalize(cross(n, abs(n.y) < .9 ? vec3(0.,1.,0.) : vec3(1.,0.,0.))), tB = cross(n, tA);
    float o = h.x * px * 2.2;
    float cr = min(dot(n, nrm(p + tA*o)), dot(n, nrm(p + tB*o)));
    line = max(line, smoothstep(.93, .7, cr));
    c += vec3(.1,.22,.6) * .07 * (.5 + .5*dot(n, normalize(vec3(-.4,.6,.7))));     // a whisper of shading on the parts
    // fine technical detail: grille rings and body ribs
    vec3 lp = rotY(-uYaw) * p;
    if (h.y < 1.5) { float yy = lp.y - .95*uE; line = max(line, .45 * smoothstep(.12, .0, abs(fract(yy / .09) - .5) * .09 / (h.x*px) - .9)); }
  }
  float xr = -yref + 2.6;
  float reveal = smoothstep(uReveal, uReveal - .35, xr);   // draw-on from the top of the exploded stack downwards
  float tip = exp(-pow((xr - uReveal + .12) / .1, 2.)) * step(uReveal, 7.);   // plotter glow on the frontier
  c = mix(c, vec3(.82,.88,1.) + vec3(.6,1.,2.2) * tip, line * max(reveal, tip));
  return c;
}
/* ---------------- the real product ---------------- */
float rectL(vec3 r, vec3 c, vec3 up, vec2 hs, float soft){
  float cz = dot(r, c); if (cz <= 0.) return 0.;
  vec3 u = normalize(cross(up, c)), v = cross(c, u); vec2 q = vec2(dot(r,u), dot(r,v)) / cz;
  vec2 e = smoothstep(hs + soft, hs - soft, abs(q)); return e.x * e.y;
}
vec3 env(vec3 r){
  vec3 c = mix(vec3(.01,.011,.014), vec3(.03,.032,.04), smoothstep(-.3, .8, r.y));
  c += vec3(1.,.97,.93) * 3.2 * rectL(r, normalize(vec3(-.7,.55,.45)), vec3(0.,1.,0.), vec2(.35,.5), .15);
  c += vec3(.75,.85,1.) * 2.2 * rectL(r, normalize(vec3(.85,.3,-.4)), vec3(0.,1.,0.), vec2(.05,.7), .04);
  c += vec3(1.,.8,.6) * 1.4 * rectL(r, normalize(vec3(.1,.95,-.3)), vec3(0.,0.,1.), vec2(.6,.25), .2);
  if (uSweep.y > 0.) c += vec3(1.) * uSweep.y * rectL(r, normalize(vec3(sin(uSweep.x),.2,cos(uSweep.x))), vec3(0.,1.,0.), vec2(.025,1.), .02);
  return c;
}
const vec3 KEY = normalize(vec3(-.7,.55,.45));
float shadowR(vec3 ro, vec3 L){ float r = 1., t = .02; for (int i=0;i<32;i++){ float h = mapS(ro + L*t); r = min(r, 7.*h/t); t += clamp(h, .02, .3); if (r < .002 || t > 6.) break; } return clamp(r,0.,1.); }
float aoR(vec3 p, vec3 n){ float o = 0., s = 1.; for (int i=0;i<5;i++){ float h = .015 + .08*float(i); o += (h - mapS(p + n*h))*s; s *= .7; } return clamp(1. - 2.*o, 0., 1.); }
vec3 shadeReal(vec3 p, vec3 rd, float id){
  vec3 n = nrm(p); vec3 lp = rotY(-uYaw) * p;
  float cosT = max(dot(n,-rd), 0.); vec3 r = reflect(rd, n);
  float sh = shadowR(p + n*.003, KEY), oc = aoR(p, n);
  float dif = clamp(dot(n, KEY), 0., 1.) * sh;
  vec3 col;
  if(id>8.5){
    vec3 enamel=id<9.5?vec3(.12,.34,.23):vec3(.48,.14,.055);
    col=enamel*(dif*1.8+.36*oc)+env(r)*vec3(.26,.20,.13)*schlick(cosT,.11)*.65;
    col+=enamel*.06;
  }else if(id>7.5){
    col=vec3(.016,.045,.053)*(dif*2.+.5*oc)+env(r)*.09*schlick(cosT,.12);
  }else if(id>3.5){
    float brush=.92+.08*sin(lp.y*740.);
    col=env(r)*vec3(.9,.65,.29)*brush*(.42+.42*oc)+vec3(.19,.11,.035)*dif;
  }else{
    col=env(r)*vec3(.72,.8,.82)*(.45+.5*oc)+vec3(.07,.08,.08)*dif;
  }
  return col;
}
vec3 realRender(vec3 ro, vec3 rd){
  float gapT; vec4 h = marchBP(ro, rd, .001, gapT);
  float tf = rd.y < 0. ? (FLOORY - ro.y) / rd.y : 1e9;
  vec3 bg = mix(vec3(.008,.024,.032), vec3(.018,.05,.062), smoothstep(-.2, .5, rd.y));
  bg += vec3(.05,.058,.075) * exp(-pow(length(rd.xy - vec2(.12, .08)) / .42, 2.));
  if (h.x > 0. && h.x < tf) { gDepth = h.x; return shadeReal(ro + rd*h.x, rd, h.y); }
  if (tf < 1e8) {
    vec3 p = ro + rd*tf; gDepth = tf;
    vec3 c = vec3(.012,.03,.037) + vec3(.07,.065,.045) * exp(-dot(p.xz,p.xz)*.5);
    c *= .35 + .65 * shadowR(p + vec3(0.,.002,0.), KEY);
    vec3 rr = reflect(rd, vec3(0.,1.,0.)); float g2; vec4 h2 = marchBP(p, rr, .001, g2);
    if (h2.x > 0.) { vec3 q = p + rr*h2.x; c += shadeReal(q, rr, h2.y) * .16 * exp(-(q.y - FLOORY) * 2.2); }
    return mix(c, bg, smoothstep(4., 12., length(p.xz)));
  }
  gDepth = 40.; return bg;
}
vec3 render(vec2 fc){
  vec2 uv = (2.*fc - uRes) / uRes.y;
  vec3 ro = uRo; vec3 rd = camMat(ro, uTa, 0.) * normalize(vec3(uv, ${FOC.toFixed(2)}));
  float px = 2. / (uRes.y * ${FOC.toFixed(2)});
  float sy = 1. - fc.y / uRes.y;                    // 0 at top
  vec3 col;
  float edge = uScan - sy;
  if (edge > .004) col = realRender(ro, rd);
  else if (edge < -.004) { col = blueprint(fc, ro, rd, px); gDepth = 12.; }
  else { col = mix(blueprint(fc, ro, rd, px), realRender(ro, rd), smoothstep(-.004, .004, edge)); }
  col += vec3(.45,.8,1.) * 2.6 * exp(-pow(edge / .0035, 2.)) * step(.0, uScan) * step(uScan, 1.);   // the scan line
  col += vec3(.25,.55,1.) * .35 * exp(-max(-edge, 0.) / .05) * step(edge, 0.) * step(.0, uScan) * step(uScan, 1.);
  return col * uFade;
}`,
});


const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
return {canvas:rm.canvas,draw(t){
 const sm=(a,b)=>E.inOutCubic(inv(a,b,t)),pulse=(a,b,c,d)=>sm(a,b)*(1-sm(c,d));
 const asm=1-sm(35.45,36.45),scan=t<36.45?-1:t>=37.35?2:sm(36.45,37.35)*1.02-.01;
 const fallG=1.4*(1-E.inQuad(inv(37.45,37.95,t))),fallL=1.8*(1-E.inQuad(inv(38.2,38.7,t)));
 const hit=(start,k,c)=>spring(t-start,{k,c});
 const tilt=.08*hit(37.95,105,12)-lossImpulse*hit(38.7,98,12);
 const sway=(start,a)=>{const dt=Math.max(0,t-start);return a*Math.exp(-dt*2.7)*Math.sin(dt*12);};
 const swG=sway(37.95,.065)-sway(38.7,.035),swL=sway(38.7,.13);
 const close=pulse(38.55,39.05,39.65,40.3),frame=sm(40.1,41.5);
 const yaw=lerp(.48,.12,sm(35.3,37.4))+.12*close;
 const dist=lerp(lerp(15.5,12.8,sm(35.3,37.3))-close,15.4,frame);
 const ta=[.45*close+2.*frame,.8-.08*close,0],ro=[Math.sin(yaw)*dist,3.1,Math.cos(yaw)*dist];
 const w=norm(sub(ta,ro)),u=norm(cross(w,[0,1,0])),v=cross(u,w);
 const project=P=>{const d=sub(P,ro),z=dot(d,w);return [960+dot(d,u)/z*FOC*540,540-dot(d,v)/z*FOC*540,z];};
 const pan=(side,sw)=>{const joint=[side*(1.75+.65*asm)*Math.cos(tilt),2.+.55*asm+side*(1.75+.65*asm)*Math.sin(tilt),0],length=1.15+.45*asm;return [joint[0]+Math.sin(sw)*length,joint[1]-Math.cos(sw)*length,0];};
 const gain=pan(-1,swG),loss=pan(1,swL);
 const weight=(p,k,drop)=>[p[0],p[1]+.045+drop+.31*k,.08];
 rm.set('uE',asm).set('uScan',scan).set('uReveal',lerp(-.4,7.5,sm(35.3,36.5))).set('uFade',1)
   .set('uRo',ro).set('uTa',ta).set('uYaw',0).set('uTilt',tilt).set('uSwayG',swG).set('uSwayL',swL)
   .set('uWeightScale',weightScale).set('uDropG',fallG).set('uDropL',fallL).set('uGain',sm(37.55,37.85)).set('uLoss',sm(38.25,38.55))
   .set('uSweep',[lerp(-1.2,1.2,sm(36.5,40.2)),1.3*Math.sin(Math.PI*inv(36.5,40.2,t))]);
 rm.render(t,{focus:dist,aperture:0,maxCoc:0});
 return {project,gain,loss,gainWeight:weight(gain,1,fallG),lossWeight:weight(loss,weightScale,fallL),tilt,scan,frame,assembled:t>=36.45,solid:t>=37.35,gain_contact:t>=37.95,loss_contact:t>=38.7};
}};
};
