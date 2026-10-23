// 用途：第一幕v15以实际人物注视、回复放下手机及合本补强对照，保留17.1秒点题。
// 运行：由act1-v15.html加载，以正式review逐幕导出；本轮只交付第一幕纯画面。
// 依赖：项目固定Three.js、GSAP、点题字形和已确认字幕；旧V8源码保持原样。
// 用途：聚光灯效应后两幕的咖啡馆机制、夜间回想及可能情境。
// 运行：由act2-v7.html及act3-v7.html加载；唯一暂停GSAP时间轴驱动全部姿态和WebGL绘制。
// 依赖：本地Three.js 0.160.1、GSAP和注入SUBS；连续过程及素材取用见连续过程验证-v6.json。
window.SpotlightFilmV16=(()=>{
  const T=THREE,W=1920,H=1080,PI=Math.PI;
  const C={wall:'#153d48',trim:'#285562',floor:'#234c56',wood:'#ad7350',cream:'#f4e5c8',gold:'#efbd75',skin:'#dfaa86',coral:'#c56a49',mint:'#79a89a',hair:'#302c2a',ink:'#172c34'};
  const clamp=x=>Math.max(0,Math.min(1,x)),mix=(a,b,u)=>a+(b-a)*u;
  const ease=x=>{x=clamp(x);return x*x*(3-2*x);},ramp=(t,a,b)=>ease((t-a)/(b-a));
  const pulse=(t,a,b,c,d)=>ramp(t,a,b)*(1-ramp(t,c,d));
  const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
  let renderer,titleRenderer,scene,camera,people,phone,date,ghost,beam,spot,spotRing,lamp,lightField,titleRoot,letters,labels=[],ready=false;
  let thought,thoughtDate,thoughtRing,thoughtHeads,thoughtBeams,thoughtTrail,conversation;
  let activeAct=1,mechanism,dayScene,dayCamera,memoryTarget,bedroom,readerRoom,bedHead,bedArm,blanket,memoryWindow,replayFrames,projection,reader,bookPage;
  const textRefreshers=[];
  function renderFrame(t){drawFilm(t);}
  function badge(text,w=1.6,h=.9,color=C.coral){
    const g=new T.Group();rounded(g,M.cream,v(),w,h,.10,.12);
    rod(g,material(color),v(-w*.34,h*.42,.07),v(w*.34,h*.42,.07),.035);
    const c=document.createElement('canvas');c.width=1024;c.height=512;
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
    const front=new T.Mesh(new T.PlaneGeometry(w*.88,h*.77),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));front.position.z=.09;g.add(front);
    const refresh=()=>{const ink=c.getContext('2d');ink.clearRect(0,0,1024,512);ink.font='700 330px Noto';ink.fillStyle=color;ink.textAlign='center';ink.textBaseline='middle';ink.fillText(g.userData.word,512,266);texture.needsUpdate=true;};
    g.userData={word:text,refresh,font_em:330/512*h*.77};textRefreshers.push(refresh);return g;
  }
  function setWord(g,text){if(g.userData.word!==text){g.userData.word=text;g.userData.refresh();}}
  function cameraKeys(t,keys){
    let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
    const a=keys[i],b=keys[i+1],u=ramp(t,a[0],b[0]);
    camera.position.set(...[1,2,3].map(k=>mix(a[k],b[k],u)));camera.lookAt(...[4,5,6].map(k=>mix(a[k],b[k],u)));camera.updateMatrixWorld();
  }
  function captionAt(t){const sub=SUBS.find(s=>t>=s.s&&t<s.e);document.getElementById('caption').innerHTML=(sub?.t??'').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');}
  function hideFirstStory(){date.visible=false;ghost.visible=false;thought.visible=false;thoughtTrail.forEach(x=>x.visible=false);conversation.forEach(x=>x.visible=false);beam.visible=false;spot.intensity=0;spotRing.visible=false;lamp.visible=false;titleRoot.visible=false;lightField.visible=false;for(const id of ['date','memory','stateLabel'])document.getElementById(id).style.opacity=0;}
  function dashed(parent,a,b,p,color=C.gold){
    const group=new T.Group();parent.add(group);const points=[];
    for(let i=0;i<24;i++){const u=i/24,vv=(i+.55)/24;if(u>p)break;const p0=a.clone().lerp(b,u),p1=a.clone().lerp(b,Math.min(vv,p));points.push([p0,p1]);rod(group,material(color),p0,p1,.018);}
    return group;
  }
  function initMechanism(){
    mechanism=new T.Group();scene.add(mechanism);
    mechanism.userData.intended=badge('周六',1.7,.98,'#2b6b61');mechanism.userData.intended.position.set(-3.25,3.7,.7);mechanism.add(mechanism.userData.intended);
    mechanism.userData.spoken=badge('周日',1.7,.98,'#a44f35');mechanism.userData.spoken.position.set(-1.23,3.7,.7);mechanism.add(mechanism.userData.spoken);
    const strands=new T.Group();mechanism.add(strands);mechanism.userData.strands=[];
    for(let i=0;i<28;i++){const m=rounded(strands,i%3?M.cream:M.coral,v(),.10,.35,.07,.035);mechanism.userData.strands.push(m);}
    mechanism.userData.flow=[];
    for(let i=0;i<17;i++){const g=new T.Group();mechanism.add(g);rounded(g,i===4?M.coral:i%2?M.mint:M.cream,v(),.42,.24,.065,.08);for(let j=0;j<3;j++)ell(g,M.trim,v((j-1)*.08,0,.05),v(.021,.021,.01));mechanism.userData.flow.push(g);}
    mechanism.userData.recall=badge('周日',1.25,.74,'#a44f35');mechanism.add(mechanism.userData.recall);
    mechanism.userData.projected=[1,2].map((_,i)=>{const g=badge('周日？',1.8,1.0,'#a44f35');mechanism.add(g);return g;});
    const group=new T.Group();mechanism.add(group);mechanism.userData.projectionLines=group;
    mechanism.userData.dashes=[1,2].map((_,k)=>{const a=v(-2.15,3.02,.65),b=v(k?2.1:-.12,3.05,.1);return dashed(group,a,b,1);});
    mechanism.userData.tags={};for(const id of ['intentTag','spokenTag','conversationTag','responseTag','projectionTag']){const el=document.createElement('div');el.id=id;el.className='label';el.style.textShadow='0 3px 14px #153d48';document.getElementById('root').appendChild(el);}
  }
  const CAMERA2=[
    [0,2,3.6,8,-.9,1.95,0],[1.4,1.2,3.8,8,-1.6,2.6,.4],
    [4.5,-2.25,4.25,6.4,-2.25,3.6,.5],[7.3,-1.30,4.1,5.5,-1.25,3.65,.55],
    [10.5,-1.15,4.0,5.2,-1.23,3.65,.55],[13,3.6,5.6,13,0,2.55,.3],
    [16.4,2.8,4.0,9,.3,2.2,.1],[20.5,1.2,3.5,7,.05,2.1,.1],
    [24,3.8,4.9,12,-.15,2.3,0],[27.3,3.1,4.6,11,-.2,2.5,0],
    [30,1.2,3.3,8,-1.6,2.1,.4]
  ];
  function drawMechanism(t){
    if(!ready)return;labels=[];hideFirstStory();cameraKeys(t,CAMERA2);
    people.forEach(p=>pose(p,20.5+t));
    const m=mechanism.userData,intro=ramp(t,1.35,2.2),said=ramp(t,4.5,5.3),unfold=ramp(t,10.5,13.0);
    m.intended.visible=t>=1.35&&t<12.8;m.intended.scale.setScalar(Math.max(.001,intro*(1-unfold*.8)));m.intended.quaternion.copy(camera.quaternion);
    m.spoken.visible=t>=4.5&&t<11.6;m.spoken.scale.setScalar(Math.max(.001,said*(1-ramp(t,10.5,11.6))));m.spoken.quaternion.copy(camera.quaternion);
    m.strands.forEach((mesh,i)=>{
      const u=ramp(t,10.5+i*.018,12.35+i*.018),x=(i%7-3)*.19,y=(Math.floor(i/7)-1.5)*.19;
      const from=v(-1.23+x,3.7+y,.70),to=v(-3.1+i*.23,2.9+Math.sin(i*.65)*.22,.4+Math.sin(i*.25)*.3);
      mesh.visible=t>=10.5&&t<13.1;mesh.position.copy(from.lerp(to,u));mesh.position.y+=Math.sin(u*PI)*(.3+(i%4)*.1);mesh.rotation.set(.1*u,.6*u,u*.2);mesh.scale.setScalar(mix(1,.48,u));
    });
    m.flow.forEach((g,i)=>{
      const age=t-(10.8+i*.8),u=clamp(age/4.7);g.visible=age>=0&&age<=4.7&&t<29.8;
      const reverse=i%2===1;
      g.position.copy(bezier(v(reverse?1.9:-2.1,2.7,.5),v(reverse?1.3:-1.3,3.35,.5),v(reverse?-.1:1.3,3.25,.5),v(reverse?-.1:1.9,2.7,.2),u));
      g.quaternion.copy(camera.quaternion);g.scale.setScalar(.75+.3*Math.sin(u*PI));
    });
    const response=pulse(t,16.4,17.2,20.1,20.8),p=people[1];p.root.rotation.y=p.yaw-.3*response;p.root.rotation.z=-.04*response;
    p.head.rotation.y=.16*response;p.mouth.scale.y=.009*(1+response*(1.6+Math.sin(t*12)));
    p.arms[1].root.rotation.set(-.8-response*.45,0,.3);p.arms[1].elbow.rotation.set(-.7-response*.45,0,0);
    const recall=pulse(t,20.5,22.0,29.1,30.0);m.recall.visible=recall>0;m.recall.position.set(-2.15,3.02,.65);m.recall.quaternion.copy(camera.quaternion);m.recall.scale.setScalar(.45+.8*recall);
    const projection=ramp(t,24,27.6)*(1-ramp(t,29.2,30));
    m.projected.forEach((g,i)=>{g.visible=projection>0;g.position.set(i?2.05:-.15,3.0,.12);g.quaternion.copy(camera.quaternion);g.scale.setScalar(Math.max(.001,.8*projection));});
    m.dashes.forEach((g,i)=>{g.visible=projection>0;g.children.forEach((line,j)=>line.visible=(j+1)/24<=projection);});
    scene.updateMatrixWorld(true);people[0].arms[0].hand.getWorldPosition(phone.position);phone.position.add(v(.015,.10,.07));phone.rotation.set(-.12,.48,-.10);
    label('intentTag','本来想说',v(-3.25,4.4,.8),intro*(1-ramp(t,7.3,8.0)),C.cream,64);
    label('spokenTag','说出口',v(-1.23,4.4,.8),said*(1-ramp(t,9.7,10.5)),C.gold,64);
    label('conversationTag','整段聊天',v(.1,3.65,.3),pulse(t,12.5,13,15.5,16.2),C.cream,64);
    label('responseTag','准备接话',v(-.1,2.9,.15),pulse(t,16.4,17,19.6,20.5),C.cream,64);
    label('projectionTag','以为别人也在意',v(.7,4.0,.3),pulse(t,24.0,24.8,28.9,29.9),C.gold,64);
    captionAt(t);renderer.render(scene,camera);
    window.__spotlightLabels=labels;window.__episodeFrame={act:2,t,phase:t<10.5?'本人知道差别':t<16.4?'局部进入整段交流':t<20.5?'接话产生新回应':'自己的在意投向他人',morph:unfold,response,projection};
  }
  const TYPE_EM=.82,TYPE_GAP=.065,TYPE_DISTANCE=8;
  const material=(color,roughness=.84,extra={})=>new T.MeshStandardMaterial({color,roughness,metalness:0,...extra});
  const M={};for(const [k,c]of Object.entries(C))M[k]=material(c);
  M.skin=material(C.skin,.78);M.skin2=material('#e8bd9b',.78);M.skin3=material('#bb8768',.8);
  M.eye=material('#18252b',.3);M.blush=material('#cd846c');M.white=material('#fff5df');M.blue=material('#598698');M.pants=material('#243b4a');
  const sphere=new T.SphereGeometry(1,32,24),cylinder=new T.CylinderGeometry(1,1,1,32),boxGeo=new T.BoxGeometry(1,1,1);
  function mesh(geo,mat,parent,pos,scale){const m=new T.Mesh(geo,mat);if(pos)m.position.copy(pos);if(scale)m.scale.copy(scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  const ell=(parent,mat,pos,scale)=>mesh(sphere,mat,parent,pos,scale);
  const box=(parent,mat,pos,scale)=>mesh(boxGeo,mat,parent,pos,scale);
  function cyl(parent,mat,pos,r,h){return mesh(cylinder,mat,parent,pos,v(r,h,r));}
  function rod(parent,mat,a,b,r){const d=b.clone().sub(a),m=mesh(new T.CapsuleGeometry(r,Math.max(.001,d.length()-2*r),5,12),mat,parent,a.clone().add(b).multiplyScalar(.5));m.quaternion.setFromUnitVectors(v(0,1,0),d.normalize());return m;}
  function curve(parent,points,r,mat){const c=new T.CatmullRomCurve3(points);return mesh(new T.TubeGeometry(c,30,r,8,false),mat,parent);}
  function rounded(parent,mat,pos,w,h,d,r=.1){const s=new T.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const g=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.025,bevelThickness:.025,curveSegments:12});g.translate(0,0,-d/2);return mesh(g,mat,parent,pos);}
  function shadow(x,z,sx,sz,opacity=.2){const c=document.createElement('canvas');c.width=128;c.height=128;const g=c.getContext('2d'),a=g.createRadialGradient(64,64,3,64,64,64);a.addColorStop(0,`rgba(0,10,18,${opacity})`);a.addColorStop(1,'rgba(0,10,18,0)');g.fillStyle=a;g.fillRect(0,0,128,128);const tex=new T.CanvasTexture(c),p=new T.Mesh(new T.PlaneGeometry(sx,sz),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));p.rotation.x=-PI/2;p.position.set(x,.012,z);scene.add(p);}
  function arch(parent,x,y,w,h,mat,z){const s=new T.Shape(),r=w/2;s.moveTo(-r,0);s.lineTo(r,0);s.lineTo(r,h-r);s.absarc(0,h-r,r,0,PI,false);s.lineTo(-r,0);return mesh(new T.ShapeGeometry(s,48),mat,parent,v(x,y,z));}
  function leaf(parent,at,angle,scale){const m=ell(parent,M.mint,at,v(.10,.30,.025));m.rotation.z=angle;m.rotation.x=.22;m.scale.multiplyScalar(scale);}
  function plant(x,y,z,s=1){const g=new T.Group();g.position.set(x,y,z);g.scale.setScalar(s);scene.add(g);cyl(g,M.cream,v(0,.22,0),.23,.43);const rim=new T.Mesh(new T.TorusGeometry(.23,.035,12,32),M.cream);rim.rotation.x=PI/2;rim.position.y=.44;g.add(rim);for(let i=0;i<5;i++){const a=i*2.4,dx=Math.sin(a)*.32,dy=.95+i*.12;rod(g,M.trim,v(0,.43,0),v(dx,dy,Math.cos(a)*.12),.018);leaf(g,v(dx,dy,Math.cos(a)*.12),-.6*Math.sin(a),1.1);leaf(g,v(dx*.55,dy*.72,.04),.8*Math.cos(a),.8);}return g;}
  function room(){
    box(scene,M.wall,v(0,3.1,-3.25),v(24,8,.25));box(scene,M.floor,v(0,-.08,0),v(30,.16,25));
    box(scene,M.trim,v(0,.61,-3.05),v(24,1.22,.12));box(scene,M.wood,v(0,1.25,-2.98),v(24,.055,.09));
    // 窗口的明面、厚边和桌椅投影共享左上方暖色主光，不靠全屏模糊光斑。
    for(const x of [-3.8,-.7]){
      arch(scene,x,1.72,2.55,3.58,M.wood,-3.02);arch(scene,x,1.86,2.26,3.28,material('#d1dfcc',1,{emissive:'#afbc9c',emissiveIntensity:.1}),-2.96);
      arch(scene,x,2.0,1.98,2.97,material('#c6d9cf',1),-2.92);
      box(scene,M.cream,v(x,3.02,-2.87),v(.075,2.27,.10));box(scene,M.cream,v(x,3.21,-2.86),v(2.02,.075,.10));box(scene,M.wood,v(x,1.82,-2.77),v(2.79,.12,.35));
      const sun=ell(scene,material('#f1cd8d',1),v(x-.42,3.9,-2.90),v(.30,.30,.025));sun.castShadow=false;
    }
    // 右侧低柜与少量陶器形成远景，避免背景空洞或道具散落。
    box(scene,material('#31545b'),v(3.58,.75,-2.61),v(3.2,1.5,.63));box(scene,M.wood,v(3.58,1.53,-2.57),v(3.4,.13,.78));
    for(const x of [2.55,3.6,4.65]){box(scene,M.trim,v(x,.78,-2.26),v(.94,1.32,.05));rod(scene,M.gold,v(x-.07,1.0,-2.20),v(x+.07,1.0,-2.20),.018);}
    plant(4.62,1.60,-2.45,.8);
    const vase=new T.Group();vase.position.set(2.72,1.62,-2.45);scene.add(vase);ell(vase,M.coral,v(0,.26,0),v(.20,.27,.20));cyl(vase,M.coral,v(0,.51,0),.075,.22);
    for(let i=0;i<3;i++){rod(vase,M.wood,v(0,.54,0),v(-.2+i*.2,1.05+i*.1,0),.012);leaf(vase,v(-.2+i*.2,1.05+i*.1,0),i*.6-.5,.45);}
    box(scene,M.wood,v(3.6,3.32,-2.94),v(2.7,.075,.32));
    for(let i=0;i<3;i++)cyl(scene,[M.cream,M.mint,M.coral][i],v(2.8+i*.53,3.48,-2.9),.11,.24);
    // 主体背后的吊灯有明确位置，镜头移动时产生真实遮挡与视差。
    for(const x of [-.25,2.35]){rod(scene,M.ink,v(x,6,-1.1),v(x,4.25,-1.1),.017);const m=mesh(new T.ConeGeometry(.42,.28,40,1,true),M.wood,scene,v(x,4.2,-1.1));m.rotation.x=PI;ell(scene,material('#ffe6b3',.7,{emissive:'#f6d496',emissiveIntensity:.45}),v(x,4.07,-1.1),v(.25,.035,.25));}
    plant(-5.1,0,-.7,1.55);
    // 平面光区对应窗户方向，底部保持蓝绿色，使字幕有稳定的深色承托。
    const patch=new T.Mesh(new T.PlaneGeometry(5.6,3.1),new T.MeshBasicMaterial({color:'#b9c4a4',transparent:true,opacity:.07,depthWrite:false}));patch.rotation.set(-PI/2,0,-.38);patch.position.set(-2.8,.008,1.5);scene.add(patch);
  }
  function chair(x,z,yaw){const g=new T.Group();g.position.set(x,0,z);g.rotation.y=yaw;scene.add(g);ell(g,material('#426d70'),v(0,.78,-.12),v(.52,.50,.18));ell(g,material('#487b7b'),v(0,.65,.14),v(.55,.14,.48));for(const a of [-1,1])for(const b of [-1,1])rod(g,M.wood,v(a*.36,.68,b*.27+.13),v(a*.43,.04,b*.36+.13),.045);shadow(x,z,1.9,1.7,.23);}
  function arm(parent,skin,shirt,side){const root=new T.Group();root.position.set(side*.30,1.43,.03);parent.add(root);const upper=ell(root,shirt,v(0,-.20,0),v(.16,.26,.18));const elbow=new T.Group();elbow.position.set(0,-.38,0);root.add(elbow);ell(elbow,shirt,v(0,-.07,0),v(.142,.13,.145));ell(elbow,skin,v(0,-.24,.005),v(.105,.21,.11));const hand=new T.Group();hand.position.set(0,-.43,0);elbow.add(hand);ell(hand,skin,v(0,-.055,.025),v(.11,.145,.065));ell(hand,skin,v(-side*.09,-.035,.055),v(.045,.082,.046));for(let i=0;i<3;i++)ell(hand,skin,v((i-1)*.045,-.165,.02),v(.023,.055,.028));return{root,elbow,hand};}
  function character(x,z,yaw,kind,standing=false){
    if(!standing)chair(x,z,yaw);const root=new T.Group();root.position.set(x,0,z);root.rotation.y=yaw;scene.add(root);const skin=[M.skin,M.skin2,M.skin3][kind],shirt=[M.coral,M.cream,M.blue][kind];
    // 躯干用连续旋转截面，衣领、袖口、腿和鞋有独立轮廓；不是同一个侧脸换颜色。
    const profile=[[0,.67],[.33,.69],[.40,.82],[.38,1.13],[.35,1.40],[.27,1.54],[0,1.57]].map(([r,y])=>new T.Vector2(r,y));const body=mesh(new T.LatheGeometry(profile,40),shirt,root);body.scale.z=.74;
    const legs=[];if(standing){for(const a of [-1,1]){const leg=new T.Group();leg.position.set(a*.20,.73,0);root.add(leg);rod(leg,M.pants,v(),v(0,-.60,.02),.135);ell(leg,M.ink,v(0,-.64,.12),v(.16,.105,.26));legs.push(leg);}}else{ell(root,M.pants,v(-.21,.68,.31),v(.19,.19,.39));ell(root,M.pants,v(.21,.68,.31),v(.19,.19,.39));for(const a of [-1,1]){rod(root,M.pants,v(a*.22,.64,.51),v(a*.25,.18,.55),.135);ell(root,M.ink,v(a*.25,.12,.65),v(.16,.105,.27));}}
    cyl(root,skin,v(0,1.60,.005),.13,.26);const collar=new T.Mesh(new T.TorusGeometry(.17,.035,8,32),kind===0?material('#a9563a'):shirt);collar.rotation.x=PI/2;collar.position.y=1.52;root.add(collar);
    if(kind===1){for(const a of [-1,1]){const p=ell(root,M.mint,v(a*.20,1.20,.24),v(.14,.35,.06));p.rotation.z=a*-.18;}for(let i=0;i<3;i++)ell(root,M.wood,v(0,1.22-i*.12,.29),v(.018,.018,.018));}
    if(kind===2){for(const a of [-1,1]){const p=ell(root,material('#8bafbb'),v(a*.12,1.38,.27),v(.07,.15,.035));p.rotation.z=a*.4;}box(root,M.cream,v(0,1.19,.29),v(.025,.43,.012));}
    const head=new T.Group();head.position.set(0,1.95,.04);root.add(head);
    if(kind===1){ell(head,M.hair,v(0,.04,-.09),v(.365,.49,.27));ell(head,M.hair,v(-.31,-.18,-.04),v(.13,.28,.19));ell(head,M.hair,v(.31,-.17,-.04),v(.13,.27,.19));}
    ell(head,skin,v(0,-.015,.02),v(.30,.38,.265));
    for(const a of [-1,1]){ell(head,skin,v(a*.296,-.035,.015),v(.065,.10,.065));ell(head,kind===0?M.blush:skin,v(a*.307,-.035,.045),v(.022,.05,.03));}
    // 发型以顺着头骨的毛束收边，不用锯齿轮廓或巨大的尖鼻。
    if(kind!==1){ell(head,M.hair,v(0,.23,-.075),v(.312,.20,.255));for(let i=0;i<6;i++){const p=ell(head,M.hair,v(-.245+i*.087,.275+Math.sin(i*.7)*.03,.075),v(.102,.135,.16));p.rotation.z=-.3;}ell(head,M.hair,v(-.265,.10,-.025),v(.07,.19,.17));ell(head,M.hair,v(.265,.10,-.025),v(.07,.18,.15));}
    else {ell(head,M.hair,v(0,.25,-.06),v(.32,.21,.24));const fringe=ell(head,M.hair,v(-.13,.21,.14),v(.205,.125,.135));fringe.rotation.z=-.3;for(const a of [-1,1]){const e=new T.Mesh(new T.TorusGeometry(.065,.012,8,24),M.gold);e.position.set(a*.31,-.14,.06);head.add(e);}}
    const eyes=[],brows=[];
    for(const a of [-1,1]){const eye=ell(head,M.eye,v(a*.112,.025,.261),v(.026,.037,.016));ell(head,M.white,v(a*.112-.007,.038,.276),v(.008,.009,.004));eyes.push(eye);const brow=rod(head,M.hair,v(a*.112-.042,.115,.247),v(a*.112+.038,.118,.247),.014);brows.push(brow);ell(head,M.blush,v(a*.18,-.09,.229),v(.06,.028,.012));}
    ell(head,skin,v(0,-.045,.285),v(.045,.065,.052));
    const mouth=ell(head,material('#8a5545'),v(0,-.17,.257),v(.048,.009,.013));
    const arms=[arm(root,skin,shirt,-1),arm(root,skin,shirt,1)];
    return{root,head,eyes,brows,mouth,arms,kind,yaw,x,z,body,legs};
  }
  function mug(x,y,z,color){const g=new T.Group();g.position.set(x,y,z);scene.add(g);const m=material(color,.48);cyl(g,m,v(0,.11,0),.115,.20);const rim=new T.Mesh(new T.TorusGeometry(.112,.013,8,32),M.cream);rim.rotation.x=PI/2;rim.position.y=.216;g.add(rim);cyl(g,material('#5b4136'),v(0,.213,0),.096,.005);const handle=new T.Mesh(new T.TorusGeometry(.073,.018,8,24),m);handle.position.set(.125,.12,0);g.add(handle);return g;}
  function props(){
    const tabletop=cyl(scene,M.cream,v(0,1.30,.40),1.42,.13);tabletop.scale.x=1.42*1.38;
    // 圆桌厚边与承托腿统一受光，桌上道具只服务约时间和继续聊天。
    const edge=cyl(scene,M.wood,v(0,1.235,.40),1.42,.075);edge.scale.x=1.38;cyl(scene,M.wood,v(0,.63,.40),.16,1.14);cyl(scene,M.ink,v(0,.07,.40),.68,.11);shadow(0,.4,4.8,3.2,.32);
    mug(-.85,1.38,.60,'#39776f');mug(.72,1.38,-.12,'#e6c494');mug(1.34,1.38,.63,'#708b93');
    const dish=cyl(scene,M.cream,v(-.1,1.38,.85),.25,.024);ell(scene,material('#bc8250'),v(-.1,1.41,.85),v(.11,.025,.075));
    phone=new T.Group();scene.add(phone);rounded(phone,M.ink,v(),.25,.47,.045,.05);rounded(phone,material('#b8d5ca',.7),v(0,0,.027),.21,.38,.009,.026);
    // 手机仅是交流道具，日期文字由同位置的大标注承担，不放必须读的小字。
    for(let i=0;i<3;i++)ell(phone,M.trim,v((i-1)*.05,-.055,.039),v(.012,.012,.004));
    date=new T.Group();scene.add(date);rounded(date,M.cream,v(),.91,.57,.055,.08);rod(date,M.coral,v(-.30,.25,.05),v(.30,.25,.05),.025);
    ghost=new T.Group();scene.add(ghost);const ring=new T.Mesh(new T.TorusGeometry(.51,.018,8,64),new T.MeshBasicMaterial({color:'#edbc76',transparent:true,opacity:.4}));ring.scale.y=.68;ghost.add(ring);
    const coneGeo=new T.ConeGeometry(1,1,64,1,true);coneGeo.translate(0,-.5,0);
    beam=new T.Mesh(coneGeo,new T.MeshBasicMaterial({color:'#f4cf91',transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending}));scene.add(beam);
    spot=new T.SpotLight('#ffd39b',0,12,.25,.8,1);spot.position.set(-1.9,6,1);spot.target.position.set(-2.15,0,.7);scene.add(spot,spot.target);
    spotRing=new T.Mesh(new T.RingGeometry(.72,.74,96),new T.MeshBasicMaterial({color:'#e5b575',transparent:true,opacity:0,depthWrite:false}));spotRing.rotation.x=-PI/2;spotRing.position.set(-2.15,.025,.7);scene.add(spotRing);
  }
  function createHeadline(){
    spotRing.userData.basePositions=new Float32Array(spotRing.geometry.attributes.position.array);
    beam.userData.basePositions=new Float32Array(beam.geometry.attributes.position.array);beam.frustumCulled=false;
    // 造型延续咖啡馆的圆润哑光材质；灯头让前文聚光的来源与转向可见。
    lamp=new T.Group();scene.add(lamp);
    const housing=material('#24414a',.62),brass=material('#bd965b',.42,{metalness:.28});
    cyl(lamp,housing,v(0,.10,0),.29,.48);cyl(lamp,brass,v(0,-.13,0),.30,.045);
    const lens=mesh(new T.CircleGeometry(.25,48),new T.MeshBasicMaterial({color:'#ffe2a1'}),lamp,v(0,-.16,0));lens.rotation.x=PI/2;
    for(const side of [-1,1]){const flap=box(lamp,housing,v(side*.31,-.12,0),v(.18,.22,.49));flap.rotation.z=side*-.25;}
    const bracket=curve(lamp,[v(-.37,.22,0),v(-.36,.48,0),v(.36,.48,0),v(.37,.22,0)],.035,brass);bracket.castShadow=false;
    lamp.traverse(o=>{o.castShadow=false;});
    lightField=new T.Mesh(new T.PlaneGeometry(1.48,1.48),new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{strength:{value:0}},vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 uv0;uniform float strength;void main(){float r=length(uv0*2.-1.);float a=(1.-smoothstep(.78,1.,r))*strength;gl_FragColor=vec4(.082,.239,.282,a);}'}));scene.add(lightField);
    titleRoot=new T.Group();scene.add(titleRoot);letters=[];
    const total=SpotlightGlyphV5.glyphs.reduce((n,g)=>n+g.advance*TYPE_EM,0)+TYPE_GAP*4;let x=-total/2;
    for(const glyph of SpotlightGlyphV5.glyphs){
      const path=new T.ShapePath();
      for(const [op,...args]of glyph.commands){const a=args.map(n=>n*TYPE_EM);if(op==='M')path.moveTo(...a);else if(op==='L')path.lineTo(...a);else if(op==='Q')path.quadraticCurveTo(...a);else if(op==='C')path.bezierCurveTo(...a);else path.currentPath.closePath();}
      const shapes=path.toShapes(),group=new T.Group();titleRoot.add(group);
      // 字体包含重叠轮廓，正面按非零填充生成材质，避免重叠盖面产生细碎闪线。
      const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048;const ink=canvas.getContext('2d');ink.setTransform(2048,0,0,-2048,0,2048*.9);ink.beginPath();
      for(const [op,...a]of glyph.commands){if(op==='M')ink.moveTo(...a);else if(op==='L')ink.lineTo(...a);else if(op==='Q')ink.quadraticCurveTo(...a);else if(op==='C')ink.bezierCurveTo(...a);else ink.closePath();}ink.fillStyle='#ffffff';ink.fill('nonzero');
      const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
      const front=material('#f6d9a4',.47,{map:texture,alphaTest:.2,metalness:.12,emissive:'#a97637',emissiveIntensity:.12,transparent:true});
      const side=material('#896444',.62,{transparent:true});
      const geo=new T.ExtrudeGeometry(shapes,{depth:.115,bevelEnabled:true,bevelSize:.0012,bevelThickness:.003,bevelSegments:2,curveSegments:8});geo.computeBoundingBox();
      const hiddenCap=new T.MeshBasicMaterial({visible:false});const text=mesh(geo,[hiddenCap,side],group,v(0,0,.045));
      const face=mesh(new T.PlaneGeometry(TYPE_EM,TYPE_EM),front,group,v(TYPE_EM/2,TYPE_EM*.4,.17));face.castShadow=false;
      const edge=new T.ExtrudeGeometry(shapes,{depth:.105,bevelEnabled:true,bevelSize:.005,bevelThickness:.005,bevelSegments:2,curveSegments:8});
      const backing=material('#102d36',.82,{transparent:true});mesh(edge,backing,group,v(.006,-.014,.012));
      letters.push({group,text,materials:[front,side,backing],char:glyph.char,x});x+=glyph.advance*TYPE_EM+TYPE_GAP;
    }
    // 透明的概念画布只承载真实立体字；同一场景、相机、光源参与两个绘制层。
    titleRoot.traverse(o=>o.layers.set(1));scene.traverse(o=>{if(o.isLight)o.layers.enable(1);});
  }
  function cameraPoint(x,y,z){return camera.localToWorld(v(x,y,z));}
  function headlineAt(t){
    const lift=ramp(t,15.7,16.7),back=ramp(t,19.06,19.76),u=lift*(1-back),focus=pulse(t,9.2,12.0,19.8,20.15);
    const ground=v(-2.15,.025,.7),center=cameraPoint(0,.65,-8.3),source0=v(-2.15,5.8,.7),source1=cameraPoint(-2.55,1.30,-7.0);
    const pool=ground.clone().lerp(center,u),source=source0.clone().lerp(source1,u);
    spotRing.position.copy(pool);spotRing.quaternion.setFromEuler(new T.Euler(-PI/2,0,0));spotRing.quaternion.slerp(camera.quaternion,u);
    spotRing.scale.set(mix(1+focus*.18,3.8,u),mix(1+focus*.18,1.15,u),1);spotRing.material.opacity=focus*mix(.5,.22,u);
    const positions=spotRing.geometry.attributes.position,base=spotRing.userData.basePositions;positions.array.set(base);
    if(u>0)for(let i=0;i<positions.count;i++){const x=base[i*3],y=base[i*3+1],length=Math.hypot(x,y);if(length>.73){const r=mix(.74,.725,u);positions.setXY(i,x/length*r,y/length*r);}}
    positions.needsUpdate=true;
    lightField.position.copy(pool).add(cameraPoint(0,0,-1).sub(camera.position).normalize().multiplyScalar(.025));lightField.quaternion.copy(spotRing.quaternion);lightField.scale.copy(spotRing.scale);lightField.material.uniforms.strength.value=u*.34;
    // 同一束光从本人抬起，沿标题左→右扫过，落定时打开到完整名称，再返回本人。
    const scan=ramp(t,16.7,17.5),opening=ramp(t,17.35,17.5),scanX=mix(-2.15,2.15,scan)*(1-opening);
    const titleTarget=cameraPoint(scanX,.65,-8.25),target=v(-2.15,.1,.7).lerp(titleTarget,u),direction=target.clone().sub(source),radius=mix(.72+focus*.32,mix(.53,2.75,opening),u);
    beam.position.copy(source);beam.quaternion.setFromUnitVectors(v(0,-1,0),direction.clone().normalize());beam.scale.set(radius,direction.length(),radius);beam.material.opacity=focus*mix(.065,.095,u);
    // 抬起后的光束落在名称所在平面，收窄纵向光口，避免向地面投下无关的大光斑。
    const beamPositions=beam.geometry.attributes.position,original=beam.userData.basePositions;beamPositions.array.set(original);
    if(u>0){
      const oldRotation=beam.quaternion.clone(),right=v(1,0,0).applyQuaternion(camera.quaternion),up=v(0,1,0).applyQuaternion(camera.quaternion);
      for(let i=0;i<beamPositions.count;i++){const x=original[i*3],y=original[i*3+1],z=original[i*3+2],h=-y;const originalPoint=v(x*radius,y*direction.length(),z*radius).applyQuaternion(oldRotation).add(source);const projected=source.clone().addScaledVector(direction,h).addScaledVector(right,x*radius).addScaledVector(up,z*radius*.25);originalPoint.lerp(projected,u);beamPositions.setXYZ(i,originalPoint.x,originalPoint.y,originalPoint.z);}
      beam.position.set(0,0,0);beam.quaternion.identity();beam.scale.set(1,1,1);
    }
    beamPositions.needsUpdate=true;
    spot.position.copy(v(-1.9,6,1).lerp(source,u));spot.target.position.copy(v(-2.15,0,.7).lerp(titleTarget,u));spot.angle=mix(.25,.74,u);spot.intensity=focus*mix(9,28,u);spot.distance=mix(12,direction.length()+.35,u);
    lamp.position.copy(source);lamp.quaternion.setFromUnitVectors(v(0,-1,0),direction.clone().normalize());lamp.scale.setScalar(pulse(t,15.3,15.8,19.5,20.0));lamp.visible=t>15.3&&t<20.0;
    const enter=ramp(t,16.7,16.78),leave=ramp(t,19.06,19.76);document.getElementById('topic').style.opacity=enter*(1-leave);
    titleRoot.position.copy(cameraPoint(0,.24,-TYPE_DISTANCE));titleRoot.quaternion.copy(camera.quaternion);
    const states=[];
    letters.forEach((letter,i)=>{
      const arrival=ramp(t,16.7+i*.09,17.1+i*.10),g=letter.group;g.position.set(letter.x,-.28*(1-arrival)+leave*.14,-.38*(1-arrival));g.rotation.set((1-arrival)*.35,0,(1-arrival)*-.04);g.scale.set(1,mix(.58,1,arrival),1);g.visible=arrival>0&&leave<1;
      letter.materials.forEach(m=>m.opacity=arrival);letter.materials[0].emissiveIntensity=.12+Math.exp(-Math.pow((scan-i/4)*7,2))*.35*(1-opening);states.push(arrival);
    });
    titleRoot.updateMatrixWorld(true);
    const bounds=letters.map(letter=>{const b=letter.text.geometry.boundingBox,m=letter.text.matrixWorld,pts=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const p=v(x,y,z).applyMatrix4(m).project(camera);pts.push([(p.x+1)*960,(1-p.y)*540]);}return{char:letter.char,left:Math.min(...pts.map(p=>p[0])),right:Math.max(...pts.map(p=>p[0])),top:Math.min(...pts.map(p=>p[1])),bottom:Math.max(...pts.map(p=>p[1]))};});
    window.__spotlightTitle={lift:u,focus,scan,opening,arrivals:states,bounds,effective_em_px:TYPE_EM*H/(2*TYPE_DISTANCE*Math.tan(camera.fov*PI/360)),source:source.toArray(),target:target.toArray(),ring:pool.toArray(),opacity:enter*(1-leave)};
    return{focus,title:ramp(t,16.7,17.5)};
  }
  // 镜头先跟随改口和朋友接话，再进入已出现在本人上方的回想空间。
  // 复用素材03的对数尺度推进方法：推进终点已有完整对象与内部过程。
  const CAM=[
    [0,4.6,4.6,10.4,0,1.65,0],[1.7,4.0,4.0,9.2,-.7,1.9,.3],
    [4.2,.2,3.6,6.8,-.35,2.55,.5],[5.7,.7,3.4,6.9,.35,2.2,.2],
    [7.3,2.9,3.4,7.7,.65,1.95,0],[7.8,1.8,3.9,8.2,-.5,2.65,.2],
    [9.3,-2.25,4.25,4.85,-2.25,4.0,.5],[10.4,-2.45,4.23,4.65,-2.2,4.0,.4],
    [12.0,-2.05,4.22,4.55,-2.25,4.0,.4],[12.4,-2.05,4.22,4.55,-2.25,4.0,.4],
    [14.8,3.8,4.8,10.8,-.1,2.2,0],[15.7,3.6,5.0,11.2,-.15,2.0,0],
    [16.7,3.7,5.8,12.8,0,1.7,0],[18.8,3.7,5.8,12.8,0,1.7,0],
    [20.5,2,3.6,8,-.9,1.95,0]
  ];
  function cameraAt(t){
    let i=0;while(i<CAM.length-2&&t>CAM[i+1][0])i++;
    const a=CAM[i],b=CAM[i+1],u=ramp(t,a[0],b[0]);
    const target=v(...[4,5,6].map(k=>mix(a[k],b[k],u)));
    const da=v(a[1]-a[4],a[2]-a[5],a[3]-a[6]),db=v(b[1]-b[4],b[2]-b[5],b[3]-b[6]);
    const distance=Math.exp(mix(Math.log(da.length()),Math.log(db.length()),u));
    camera.position.copy(target).add(da.normalize().lerp(db.normalize(),u).normalize().multiplyScalar(distance));
    camera.lookAt(target);camera.updateMatrixWorld();
  }
  function createContinuousStory(){
    // 交流标记沿人物间的空间前进；日期修正后进入这一过程，不另开说明卡。
    conversation=[];
    for(let i=0;i<10;i++){
      const g=new T.Group();scene.add(g);
      rounded(g,i%2?M.mint:M.cream,v(),.48,.27,.08,.10);
      for(let j=0;j<3;j++)ell(g,M.trim,v((j-1)*.10,0,.06),v(.026,.026,.012));
      ell(g,i%2?M.mint:M.cream,v(-.17,-.15,0),v(.07,.08,.035));
      conversation.push(g);
    }
    // 这是本人担心的情境，始终与真实咖啡馆分开；内部角色不是朋友实际想法的证据。
    thought=new T.Group();thought.position.set(-2.25,4.05,.75);scene.add(thought);
    thoughtTrail=[0,1,2].map(i=>ell(scene,M.cream,v(-2.15-i*.035,2.60+i*.35,.75),v(.045+i*.025,.045+i*.025,.045+i*.025)));
    const back=rounded(thought,material('#1d4b57'),v(0,0,-.95),3.8,2.9,.12,.65);
    back.castShadow=false;
    thoughtRing=new T.Mesh(new T.TorusGeometry(1.35,.055,12,96),M.gold);thoughtRing.position.z=.68;thought.add(thoughtRing);
    const platform=cyl(thought,M.trim,v(0,-.79,-.12),1.52,.12);platform.scale.z=.64;
    thoughtDate=new T.Group();thought.add(thoughtDate);
    rounded(thoughtDate,M.cream,v(),1.42,.82,.12,.12);
    rod(thoughtDate,M.coral,v(-.48,.36,.08),v(.48,.36,.08),.04);
    const face=document.createElement('canvas');face.width=1024;face.height=512;
    const texture=new T.CanvasTexture(face),writing=new T.Mesh(new T.PlaneGeometry(1.25,.62),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
    texture.colorSpace=T.SRGBColorSpace;writing.position.z=.10;thoughtDate.add(writing);
    thoughtDate.userData.drawText=()=>{const g=face.getContext('2d');g.clearRect(0,0,1024,512);g.font='700 280px Noto';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#a44f35';g.fillText('周日',512,256);texture.needsUpdate=true;};
    thoughtHeads=[1,2].map((kind,i)=>{
      const g=people[kind].root.clone(true);g.position.set(i?1.05:-1.05,-.77,-.43);g.scale.setScalar(.39);g.rotation.set(0,i?-.35:.35,0);thought.add(g);return g;
    });
    thoughtBeams=[-1,1].map(side=>{
      const geometry=new T.ConeGeometry(1,1,48,1,true);geometry.translate(0,-.5,0);
      const m=new T.Mesh(geometry,new T.MeshBasicMaterial({color:C.gold,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending}));
      thought.add(m);return m;
    });
  }
  function continuousStoryAt(t){
    const into=ramp(t,7.6,9.3),out=ramp(t,12.4,15.7),present=pulse(t,7.55,8.15,15.1,15.7);
    thought.visible=present>0;thought.scale.setScalar(Math.max(.001,mix(.22,1,into)*(1-out*.72)));
    thought.position.set(-2.25,4.05+out*.1,.75);thought.rotation.y=Math.sin(t*.45)*.025;
    thoughtDate.position.set(0,.27,.12);thoughtDate.rotation.set(0,Math.sin((t-9.3)*1.3)*.08,Math.sin(t*.8)*.025);
    const convergence=ramp(t,9.2,11.7);
    thoughtBeams.forEach((b,i)=>{
      const a=v(i?1.0:-1.0,.10,-.23),end=v(mix(i?.70:-.70,0,convergence),.27,.17),d=end.clone().sub(a);
      b.position.copy(a);b.quaternion.setFromUnitVectors(v(0,-1,0),d.clone().normalize());b.scale.set(.22,d.length(),.22);b.material.opacity=.08*convergence;
    });
    thoughtHeads.forEach((g,i)=>{
      g.rotation.y=(i?-.35:.35)+(i?-.12:.12)*convergence;g.rotation.x=-.08*convergence;
      g.position.x=(i?1:-1)*(1.05-.12*convergence);
      const head=g.children.find(o=>o.type==='Group'&&o.position.y===1.95);if(head)head.rotation.x=-.18*convergence;
    });
    thoughtTrail.forEach(m=>m.visible=present>0&&(into<.85||out>.25));
    for(let i=0;i<conversation.length;i++){
      const age=t-(5.85+i*.95),u=clamp(age/3.0),g=conversation[i];
      g.visible=age>=0&&age<=3.0&&t<15.7;
      const left=i%2===0;
      g.position.copy(bezier(v(left?-.1:1.8,2.5,-.18),v(left?.25:1.65,3.2,.3),v(left?1.45:.40,3.10,.3),v(left?1.85:-.12,2.45,-.12),u));
      g.quaternion.copy(camera.quaternion);g.scale.setScalar(.85+.15*Math.sin(u*PI));
    }
    thought.updateMatrixWorld(true);
    const where=thoughtDate.getWorldPosition(v());
    document.getElementById('memory').style.opacity=0;
    const tag=thought.localToWorld(v(0,.94,-.42));
    label('stateLabel','你担心的目光',tag,out<.2?pulse(t,8.75,9.25,12.2,12.5):0,'#f4e5c8',64);
    const depth=-where.clone().applyMatrix4(camera.matrixWorldInverse).z;
    window.__spotlightProcess={t,memory_enter:into,memory_exit:out,imagined_gaze:convergence,conversation_visible:conversation.filter(g=>g.visible).length,memory_em_px:(280/512*.62)*thought.scale.x*H/(2*depth*Math.tan(camera.fov*PI/360))};
    return present;
  }
  function pose(p,t){
    const k=p.kind,own=k===0,worry=own?ramp(t,7.6,10.3):0,say=own?pulse(t,.3,1,4.9,6.0):pulse(t,5.5+k*.25,6.2+k*.25,14.2,15.4);
    const nod=own?Math.sin(t*2)*.018:Math.sin(t*3+k)*.055*pulse(t,4.2,4.7,6.5,7.5);
    const respond=own?0:ramp(t,6.1,8.0);
    p.root.rotation.y=p.yaw+(k===1?-.35:k===2?.27:0)*respond;
    p.root.rotation.z=own?worry*.045:Math.sin(t*1.15+k)*.013;
    p.head.rotation.set(nod+worry*.09,own?worry*.15:Math.sin(t*.85+k)*.06,own?worry*-.07:0);
    p.head.position.y=1.95+Math.sin(t*1.8+k)*.008-worry*.035;
    p.mouth.scale.y=.009*(1+say*(1.2+Math.sin(t*12+k)*1.0));p.mouth.scale.x=.048*(1-worry*.25);
    for(let i=0;i<2;i++){const blink=Math.pow(Math.max(0,Math.cos(t*1.6+k*2.3)),50);p.eyes[i].scale.y=.037*(1-.86*blink);p.brows[i].rotation.z=-PI/2+(i?1:-1)*worry*.14;}
    const A=p.arms;
    if(own){
      const speak=pulse(t,.35,1.7,4,5.7),correct=pulse(t,4.2,4.6,5.4,6.3);
      A[0].root.rotation.set(-.65-speak*.65+correct*.15,0,-.20-correct*.30);A[0].elbow.rotation.set(-.55-speak*.55,0,0);A[0].hand.rotation.z=.2;
      // 改口的张掌落下，手接着抬到下巴，身体收拢，担心由同一个动作延续。
      A[1].root.rotation.set(-.75-worry*.28-correct*.35,0,.22-worry*.12);A[1].elbow.rotation.set(-.8-worry*1.35,0,.15);A[1].hand.rotation.set(0,0,-.2+worry*.3);
    }else{
      const gest=Math.sin((t-5.6)*1.8+k)*.15*say;
      A[0].root.rotation.set(-.65-respond*.22+gest,0,-.25);A[0].elbow.rotation.set(-1.0-respond*.18,0,0);A[0].hand.rotation.z=-.1;
      A[1].root.rotation.set(-.7-say*.18,0,.28+gest);A[1].elbow.rotation.set(-.72-respond*.37,0,0);A[1].hand.rotation.z=-.2;
    }
  }
  function bezier(a,b,c,d,u){const q=1-u;return a.clone().multiplyScalar(q*q*q).addScaledVector(b,3*q*q*u).addScaledVector(c,3*q*u*u).addScaledVector(d,u*u*u);}
  function label(id,text,pos,opacity,color='#263e43',size=80,rotate=0){
    const el=document.getElementById(id),q=pos.clone().project(camera);el.textContent=text;el.style.fontSize=size+'px';const half=el.offsetWidth/2,x=Math.max(32+half,Math.min(W-32-half,(q.x+1)*960)),y=Math.max(32+size*.6,Math.min(850-size*.6,(1-q.y)*540));el.style.transform='translate('+x+'px,'+y+'px) translate(-50%,-50%) rotate('+rotate+'deg)';el.style.opacity=clamp(opacity);el.style.color=color;if(opacity>.03)labels.push({id,text,x,y,font_size:size,opacity});
  }

  function draw(t){
    if(!ready)return;labels=[];cameraAt(t);people.forEach(p=>pose(p,t));
    // 手机始终由本人左手承托，避免道具离手漂移；右手承担改口及担心的接续表演。
    scene.updateMatrixWorld(true);people[0].arms[0].hand.getWorldPosition(phone.position);phone.position.add(v(.015,.10,.07));phone.rotation.set(-.12,.48,-.10);
    const dateIn=ramp(t,1.4,2.1),travel=ramp(t,2.0,3.9),correct=ramp(t,4.2,5.0),out=ramp(t,6.3,7.3);
    date.position.copy(bezier(v(-2.1,2.55,.8),v(-1.9,3.2,.6),v(-.9,3.18,.5),v(-.35,2.85,.5),travel));
    date.scale.setScalar(Math.max(.001,dateIn*(1-out)));date.quaternion.copy(camera.quaternion);date.rotateY(correct*PI*2);date.visible=dateIn>0&&out<1;
    label('date',correct<.5?'周日':'周六',date.position,dateIn*(1-out)*(.35+.65*Math.abs(Math.cos(correct*PI*2))),correct<.5?'#a44f35':'#2b6b61',80);
    ghost.visible=false;const memoryPresent=continuousStoryAt(t);
    const {focus,title}=headlineAt(t);
    if(t<15.3){beam.material.opacity*=1-memoryPresent;spot.intensity*=1-memoryPresent;spotRing.material.opacity*=1-memoryPresent;}
    const sub=SUBS.find(s=>t>=s.s&&t<s.e);document.getElementById('caption').innerHTML=(sub?.t??'').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
    camera.layers.set(0);renderer.render(scene,camera);const background=scene.background;scene.background=null;camera.layers.set(1);titleRenderer.render(scene,camera);scene.background=background;camera.layers.set(0);
    window.__spotlightLabels=labels;window.__spotlightFrame={t,phone_follows_hand:true,correction:correct,memory:memoryPresent,focus,title,people:people.map(p=>({x:p.root.position.x,yaw:p.root.rotation.y,head:p.head.rotation.y,arm:p.arms[1].elbow.rotation.x}))};
  }
  function initBedroom(){
    hideFirstStory();dayScene=scene;dayCamera=new T.PerspectiveCamera(33,W/H,.1,60);
    memoryTarget=new T.WebGLRenderTarget(1024,576);memoryTarget.texture.colorSpace=T.SRGBColorSpace;
    dayScene.userData.date=badge('周日',1.45,.86,'#a44f35');dayScene.userData.date.position.set(-.35,2.85,.5);dayScene.add(dayScene.userData.date);
    scene=new T.Scene();scene.background=new T.Color('#112e40');scene.fog=new T.Fog('#112e40',25,65);
    scene.add(new T.HemisphereLight('#b9d8e4','#1b2c3c',1.8));
    const key=new T.DirectionalLight('#f6d5ab',3.5);key.position.set(-3,7,6);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-8,right:20,top:9,bottom:-9,near:.5,far:40});key.shadow.normalBias=.025;scene.add(key);
    const fill=new T.DirectionalLight('#8bb5d6',1.8);fill.position.set(5,6,-2);scene.add(fill);
    bedroom=new T.Group();scene.add(bedroom);
    box(bedroom,material('#183c4b'),v(-.8,-.1,0),v(12,.2,10));box(bedroom,material('#142e43'),v(-.8,3,-3.5),v(12,7,.2));
    box(bedroom,material('#244a59'),v(-.8,.65,-3.34),v(12,1.3,.12));box(bedroom,M.wood,v(-.8,1.32,-3.25),v(12,.055,.1));
    arch(bedroom,-3.7,1.7,3.1,3.9,M.wood,-3.19);arch(bedroom,-3.7,1.85,2.84,3.58,material('#0b2038'),-3.13);
    box(bedroom,M.trim,v(-3.7,3.1,-3.0),v(.07,2.6,.08));box(bedroom,M.trim,v(-3.7,3.18,-2.99),v(2.8,.06,.08));
    ell(bedroom,material('#d1dace',1,{emissive:'#a8bdc3',emissiveIntensity:.4}),v(-4.13,4.5,-3.05),v(.34,.34,.025));
    for(let i=0;i<9;i++)ell(bedroom,material('#a6c1cd',1,{emissive:'#a6c1cd',emissiveIntensity:.3}),v(-4.85+(i%4)*.69,2.6+Math.floor(i/4)*.8,-3.06),v(.018,.018,.008));
    box(bedroom,M.wood,v(-.8,.43,.25),v(4.6,.40,2.2));for(const x of [-2.7,1.05])for(const z of [-.65,1.15])box(bedroom,M.wood,v(x,.22,z),v(.15,.45,.15));
    const mattress=rounded(bedroom,material('#d5dbcc'),v(-.8,.78,.25),4.3,2.05,.35,.22);mattress.rotation.x=-PI/2;
    const board=rounded(bedroom,M.wood,v(-3.05,1.1,.25),2.30,1.45,.16,.2);board.rotation.y=PI/2;
    ell(bedroom,M.cream,v(-2.42,1.02,.25),v(.65,.17,.70));
    ell(bedroom,M.coral,v(-1.55,1.08,.25),v(.72,.30,.42));
    blanket=ell(bedroom,material('#457c83'),v(-.25,1.04,.25),v(1.5,.26,.93));
    bedHead=people[0].head.clone(true);bedHead.position.set(-2.30,1.32,.25);bedHead.rotation.set(.05,-.10,1.18);bedroom.add(bedHead);
    bedHead.userData.cheeks=[];bedHead.traverse(o=>{if(o.isMesh&&o.material===M.blush){o.material=o.material.clone();bedHead.userData.cheeks.push(o);}});
    bedArm=people[0].arms[1].root.clone(true);bedArm.position.set(-1.9,1.20,.62);bedArm.rotation.set(-.35,0,1.3);bedroom.add(bedArm);
    box(bedroom,M.wood,v(-3.55,.63,1.8),v(1.0,1.15,.9));cyl(bedroom,M.gold,v(-3.55,1.38,1.8),.22,.14);
    rod(bedroom,M.wood,v(-3.55,1.45,1.8),v(-3.55,1.92,1.8),.045);const shade=mesh(new T.ConeGeometry(.45,.58,40,1,true),material('#efd6ae',.9,{side:T.DoubleSide}),bedroom,v(-3.55,2.05,1.8));
    const lampLight=new T.PointLight('#f2c389',6,7,1.6);lampLight.position.set(-3.55,1.9,1.8);scene.add(lampLight);
    box(bedroom,M.wood,v(2.55,1.15,-2.9),v(1.6,2.3,.5));for(let row=0;row<3;row++){box(bedroom,M.wood,v(2.55,.5+row*.65,-2.58),v(1.55,.07,.55));for(let j=0;j<4;j++)box(bedroom,[M.cream,M.coral,M.mint,M.trim][j],v(2.05+j*.31,.77+row*.65,-2.62),v(.20,.48,.29));}
    memoryWindow=new T.Group();scene.add(memoryWindow);
    rounded(memoryWindow,M.gold,v(0,0,-.02),3.50,2.03,.10,.12);
    const memoryPlane=new T.Mesh(new T.PlaneGeometry(3.34,1.88),new T.MeshBasicMaterial({map:memoryTarget.texture}));memoryPlane.position.z=.06;memoryWindow.add(memoryPlane);
    replayFrames=[];
    for(let i=0;i<7;i++){const g=new T.Group();scene.add(g);rounded(g,M.gold,v(),1.20,.73,.045,.07);const image=new T.Mesh(new T.PlaneGeometry(1.10,.62),new T.MeshBasicMaterial({map:memoryTarget.texture}));image.position.z=.05;g.add(image);replayFrames.push(g);}
    projection=new T.Group();scene.add(projection);projection.userData.routes=[];
    const imaginary=people[2].head.clone(true);imaginary.position.set(3.3,2.3,1.1);imaginary.scale.setScalar(1.3);imaginary.rotation.y=-.2;
    imaginary.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color.lerp(new T.Color('#83b2bb'),.35);o.castShadow=false;}});projection.add(imaginary);
    const imaginedDate=badge('周日？',1.8,1.0,'#a44f35');imaginedDate.position.set(3.3,3.7,.1);projection.add(imaginedDate);
    const route=dashed(projection,v(-1.5,3.4,.5),v(3.3,3.7,.1),1);projection.userData.routes=route.children;
    projection.userData.marker=imaginedDate;
    readerRoom=new T.Group();scene.add(readerRoom);
    box(readerRoom,material('#244653'),v(12,-.1,0),v(8,.2,8));box(readerRoom,material('#1d3d50'),v(12,3,-3),v(8,7,.2));
    box(readerRoom,M.wood,v(14.5,1.5,-2.55),v(2.1,3,.4));for(let k=0;k<4;k++){box(readerRoom,M.wood,v(14.5,.45+k*.68,-2.30),v(2.0,.07,.55));for(let j=0;j<5;j++)box(readerRoom,[M.mint,M.cream,M.coral,M.trim,M.blue][j],v(13.72+j*.37,.72+k*.68,-2.38),v(.22,.48,.27));}
    arch(readerRoom,10.5,1.7,2.6,3.5,M.wood,-2.82);arch(readerRoom,10.5,1.86,2.35,3.18,material('#10263d'),-2.75);
    box(readerRoom,M.trim,v(10.5,3.0,-2.67),v(.07,2.2,.06));
    reader={...people[2],root:people[2].root.clone(true)};reader.root.position.set(12,0,.15);reader.root.rotation.y=-.22;readerRoom.add(reader.root);
    reader.head=reader.root.children.find(o=>o.type==='Group'&&o.position.y===1.95);
    const armRoots=reader.root.children.filter(o=>o.type==='Group'&&o.position.y===1.43);reader.arms=armRoots.map(root=>{const elbow=root.children.find(o=>o.type==='Group');const hand=elbow.children.find(o=>o.type==='Group');return{root,elbow,hand};});
    chair(12,.15,-.22);
    const desk=rounded(readerRoom,M.wood,v(12,1.18,1.0),2.65,1.42,.16,.12);desk.rotation.x=-PI/2;for(const x of [10.9,13.1])for(const z of [.48,1.5])rod(readerRoom,M.wood,v(x,1.12,z),v(x,0,z),.06);
    const binding=rounded(readerRoom,M.coral,v(12,1.32,.86),1.3,.86,.055,.05);binding.rotation.x=-PI/2;
    for(const side of [-1,1]){const page=rounded(readerRoom,M.cream,v(12+side*.31,1.37,.86),.61,.80,.04,.025);page.rotation.x=-PI/2;for(let j=0;j<5;j++)box(readerRoom,M.trim,v(12+side*.31,1.399,.62+j*.10),v(.40,.003,.012));}
    bookPage=new T.Group();bookPage.position.set(12,1.41,.86);readerRoom.add(bookPage);const page=rounded(bookPage,M.cream,v(.29,0,0),.58,.78,.018,.02);page.rotation.x=-PI/2;
    for(let j=0;j<5;j++)box(bookPage,M.trim,v(.29,.015,-.22+j*.10),v(.4,.004,.012));
    const tableLamp=new T.PointLight('#f3d5a8',5,7,1.6);tableLamp.position.set(13.1,2.6,1.1);scene.add(tableLamp);cyl(readerRoom,M.gold,v(13.05,1.40,1.1),.18,.1);rod(readerRoom,M.gold,v(13.05,1.45,1.1),v(13.05,2.1,1.1),.03);mesh(new T.ConeGeometry(.35,.4,32,1,true),M.cream,readerRoom,v(13.05,2.2,1.1));
    for(const id of ['nightTag','replayTag','imaginationTag','possibilityTag']){const el=document.createElement('div');el.id=id;el.className='label';el.style.textShadow='0 3px 14px #112e40';document.getElementById('root').appendChild(el);}
  }
  const CAMERA3=[
    [0,6,5.4,9.2,-.8,1.4,.2],[2.0,4.8,4.8,8,-1.3,2.1,.1],
    [4.2,-1.30,3.15,4.3,-1.30,3.15,-.1],[7.4,-1.3,3.15,3.45,-1.3,3.15,-.1],
    [8.4,3.6,3.8,7.8,-1.2,1.55,.2],[11.8,2.3,3.2,6.5,-1.4,1.65,.25],
    [12.8,2.3,3.2,6.5,-1.4,1.65,.25],[14.4,-1.3,3.15,4.3,-1.3,3.15,-.1],
    [15.8,-1.3,3.15,4.3,-1.3,3.15,-.1],[18.5,5.8,5.5,10,-.8,2.4,.2],
    [22.4,4.5,5.1,9,-.5,2.4,.2],[25.8,4.3,4.3,9,1.0,2.5,.1],
    [30.4,5.5,4.6,10,1.2,2.1,.1],[32.0,5.5,4.6,10,1.2,2.1,.1],
    [33.8,14.8,4.1,8.3,11.9,1.65,.6],
    [36,14,3.5,6.8,12,1.65,.7],[39.4,14,3.5,7.5,12,1.7,.7],
    [41.2,3.5,3.4,7.6,-1.3,1.6,.25],[44.8,4.8,4.6,9.6,-1,1.7,.2],
    [46,4.8,4.6,9.6,-1,1.7,.2]
  ];
  function pointArm(arm,target){
    scene.updateMatrixWorld(true);const shoulder=arm.root.getWorldPosition(v()),direction=target.clone().sub(shoulder),distance=Math.min(.805,Math.max(.08,direction.length()));direction.normalize();
    const bend=v(0,-1,.4).addScaledVector(direction,-v(0,-1,.4).dot(direction)).normalize();
    const a=(.38*.38-.43*.43+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,.38*.38-a*a));
    const elbow=shoulder.clone().addScaledVector(direction,a).addScaledVector(bend,height);
    const parentQ=arm.root.parent.getWorldQuaternion(new T.Quaternion()).invert();arm.root.quaternion.copy(parentQ.multiply(new T.Quaternion().setFromUnitVectors(v(0,-1,0),elbow.clone().sub(shoulder).normalize())));
    scene.updateMatrixWorld(true);const rootQ=arm.root.getWorldQuaternion(new T.Quaternion()).invert(),forearm=target.clone().sub(elbow).normalize().applyQuaternion(rootQ);arm.elbow.quaternion.setFromUnitVectors(v(0,-1,0),forearm);
  }
  function drawBedroom(t){
    if(!ready)return;labels=[];cameraKeys(t,CAMERA3);
    let memoryTime;
    if(t<8.4)memoryTime=mix(2.1,6.4,ramp(t,2,7.6));
    else if(t<15.8)memoryTime=mix(2.1,6.4,ramp(t,12.8,15.8));
    else if(t<22.4)memoryTime=2.1+((t-15.8)%2.2)/2.2*4.3;
    else memoryTime=4.8;
    people.forEach(p=>pose(p,memoryTime));dayCamera.position.set(3.3,3.7,8.1);dayCamera.lookAt(-.45,1.95,.25);dayCamera.updateMatrixWorld();
    const d=dayScene.userData.date;setWord(d,memoryTime>=4.4?'周六':'周日');d.quaternion.copy(dayCamera.quaternion);d.rotation.y+=ramp(memoryTime,4.15,4.65)*PI*2;
    renderer.setRenderTarget(memoryTarget);renderer.render(dayScene,dayCamera);renderer.setRenderTarget(null);
    const grow=ramp(t,1.3,2.6),replay=ramp(t,15.8,18.4),end=ramp(t,39.4,44.8);
    memoryWindow.position.set(-1.3,3.15,-.1);memoryWindow.quaternion.setFromEuler(new T.Euler(0,0,0));
    const settle=ramp(t,7.4,8.8),returnToMemory=ramp(t,12.8,14.4);
    const size=t<12.8?mix(mix(.23,1,grow),.36,settle):t<15.8?mix(.36,1,returnToMemory):mix(1,.32,replay);
    memoryWindow.scale.setScalar(size*(1-end*.6));memoryWindow.visible=t>1.3&&t<44.8;
    memoryWindow.position.lerp(v(-1.6,3.0,-.15),settle*(1-returnToMemory));
    memoryWindow.position.lerp(v(-2.3,3.75,-.2),replay);
    const replayOn=pulse(t,15.8,16.6,28.2,30.3);
    replayFrames.forEach((g,i)=>{
      const start=15.8+i*.55,age=t-start,u=clamp(age/3.6),angle=-.8+i*.42+(t-15.8)*.32;
      g.visible=t>=start&&t<30.3;const launch=memoryWindow.position.clone();
      const target=v(-.7+Math.cos(angle)*3.25,2.6+Math.sin(angle)*.55,1.1+Math.sin(angle)*1.8);
      g.position.copy(launch.lerp(target,ramp(t,start,start+1.6)));g.rotation.set(.08*Math.sin(angle),-.25+angle*.12,.08*Math.sin(angle));g.scale.setScalar(Math.max(.001,(.1+.72*ramp(t,start,start+.8))*(1-ramp(t,28.2,30.3))));
      g.position.y-=ramp(t,28.2,30.3)*1.4;
    });
    const stress=t<8.4?.25:pulse(t,8.4,9.4,40.8,44.5)*(.45+.20*Math.sin(t*2.85)**2);
    bedHead.rotation.set(.05+Math.sin(t*.5)*.025,-.10+stress*.18,1.18-stress*.06);
    bedHead.userData.cheeks.forEach(m=>m.material.color.set(C.skin).lerp(new T.Color('#cc775e'),.35+stress*.55));
    bedArm.rotation.set(-.35,0,1.3+stress*.50);blanket.scale.y=.26+Math.sin(t*1.35)*.005;
    const projectionOn=pulse(t,22.4,24.2,27.2,30.4);projection.visible=projectionOn>0;
    projection.userData.marker.quaternion.copy(camera.quaternion);projection.userData.marker.scale.setScalar(.6+.4*projectionOn);
    projection.userData.routes.forEach((line,i)=>line.visible=(i+1)/24<=projectionOn);
    projection.children[0].position.copy(v(-1.4,3.0,.5).lerp(v(3.3,2.3,1.1),ramp(t,22.4,24.2)));
    projection.children[0].scale.setScalar(Math.max(.001,1.3*projectionOn));
    projection.children[0].rotation.y=-.2-.2*ramp(t,24,27.2);
    const turn=ramp(t,34.2,36.6),angle=turn*PI;bookPage.rotation.z=angle;
    reader.head.rotation.set(.20+Math.sin(t*.6)*.025,.06,0);
    const handTarget=v(12+.44*Math.cos(Math.min(angle,1.7)),1.45+.44*Math.sin(Math.min(angle,1.7)),.86);
    handTarget.lerp(v(12.30,1.43,.72),ramp(t,35.6,36.6));pointArm(reader.arms[1],handTarget);pointArm(reader.arms[0],v(11.75,1.43,.77));
    label('nightTag','回想',memoryWindow.position.clone().add(v(-1.15*memoryWindow.scale.x,.70*memoryWindow.scale.x,.12)),pulse(t,2.5,3.2,7.3,7.9),C.cream,64);
    const replayLabelPosition=t<15.8?memoryWindow.position.clone().add(v(-.8,.82,.12)):v(0,4.05,.4);
    label('replayTag',t<15.8?'当时，只发生一次':'心里，反复重播',replayLabelPosition,t<15.8?pulse(t,14.0,14.3,15.5,15.8):pulse(t,17.0,17.8,21.5,22.4),C.cream,64);
    label('imaginationTag','自己以为',v(2.5,4.65,.1),pulse(t,22.5,23.4,27.3,29.7),C.gold,64);
    label('possibilityTag','可能的此刻',v(12,3.05,.5),pulse(t,33.0,33.6,39.4,39.9),C.cream,64);
    captionAt(t);renderer.render(scene,camera);
    window.__spotlightLabels=labels;window.__episodeFrame={act:3,t,memoryTime,replay:replayOn,projection:projectionOn,reader_page_turn:turn,phase:t<8.4?'同一次口误进入夜间回想':t<12.8?'改口后仍然担心':t<22.4?'一次听见与反复重播':t<30.4?'想象他人也记着':t<39.4?'朋友可能的当下':'回到仍醒着的同一主角'};
  }
  function create(duration,act=1){
    activeAct=act;
    renderer=new T.WebGLRenderer({canvas:document.getElementById('stage'),antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(W,H,false);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.26;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
    titleRenderer=new T.WebGLRenderer({canvas:document.getElementById('topicCanvas'),alpha:true,antialias:true,preserveDrawingBuffer:true});titleRenderer.setPixelRatio(1);titleRenderer.setSize(W,H,false);titleRenderer.outputColorSpace=T.SRGBColorSpace;titleRenderer.toneMapping=T.ACESFilmicToneMapping;titleRenderer.toneMappingExposure=1.26;titleRenderer.setClearColor(0,0);
    scene=new T.Scene();scene.background=new T.Color(C.wall);scene.fog=new T.Fog(C.wall,19,36);camera=new T.PerspectiveCamera(33,W/H,.1,60);
    scene.add(new T.HemisphereLight('#e9f4e4','#264956',2.15));
    const key=new T.DirectionalLight('#ffe2b4',3.8);key.position.set(-5,8,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.5,far:25});key.shadow.normalBias=.025;key.shadow.bias=-.0002;key.shadow.radius=3;scene.add(key);
    const fill=new T.DirectionalLight('#a7d0d6',1.2);fill.position.set(5,4,3);scene.add(fill);const rim=new T.DirectionalLight('#f5c288',1.8);rim.position.set(-2,5,-3);scene.add(rim);
    room();people=[character(-2.15,.52,.52,0),character(-.15,-1.02,.20,1),character(2.05,.02,-.72,2)];props();createHeadline();createContinuousStory();initFilm(act);
    const state={time:SceneSpec.start},tl=gsap.timeline({paused:true});tl.to(state,{time:SceneSpec.end,duration:SceneSpec.duration,ease:'none',onUpdate:()=>renderFrame(state.time)},0);
    window.__motionReady=Promise.all([document.fonts.load('700 80px Noto'),F.photoReady]).then(()=>{thoughtDate.userData.drawText();textRefreshers.forEach(fn=>fn());ready=true;renderFrame(state.time);});window.__spotlightState=state;window.__spotlightRenderer=renderer;
    return tl;
  }
  const F={act:1,labels:['tagA','tagB','tagC','tagD'],photoReady:Promise.resolve()};
  const out3=u=>1-Math.pow(1-clamp(u),3);
  const spring=u=>{u=clamp(u);return u===0||u===1?u:1-Math.exp(-7*u)*Math.cos(u*10);};
  function showScale(g,u){g.visible=u>.001;g.scale.setScalar(Math.max(.001,u));}
  // 相机只在给定的短窗口转换；不把整句阅读时间全部做成慢推。
  function shot(t,keys){let i=0;while(i<keys.length-1&&t>=keys[i+1][0])i++;const b=keys[i],a=keys[Math.max(0,i-1)],u=i===0?1:out3((t-b[0])/Math.max(.001,b[1]));camera.position.set(...[2,3,4].map(k=>mix(a[k],b[k],u)));camera.lookAt(...[5,6,7].map(k=>mix(a[k],b[k],u)));camera.updateMatrixWorld();}
  function world(){const s=new T.Scene();s.background=new T.Color(C.wall);s.fog=new T.Fog(C.wall,25,65);s.add(new T.HemisphereLight('#e9f4e4','#264956',2.15));const key=new T.DirectionalLight('#ffe2b4',3.8);key.position.set(-5,8,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.5,far:30});key.shadow.normalBias=.025;s.add(key);const fill=new T.DirectionalLight('#a7d0d6',1.2);fill.position.set(5,4,3);s.add(fill);const rim=new T.DirectionalLight('#f5c288',1.8);rim.position.set(-2,5,-3);s.add(rim);return s;}
  function panel(parent,texture,w=3.5,h=1.97){const g=new T.Group();parent.add(g);rounded(g,M.gold,v(),w+.12,h+.12,.10,.10);const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,toneMapped:false}));m.position.z=.09;g.add(m);g.userData.image=m;return g;}
  function resetLabels(){for(const id of [...F.labels,'date','memory','stateLabel','nightTag','replayTag','imaginationTag','possibilityTag']){const el=document.getElementById(id);if(el)el.style.opacity=0;}document.getElementById('topic').style.opacity=0;labels=[];}
  function finish(t){captionAt(t);window.__spotlightLabels=labels;window.__episodeFrame={act:activeAct,t,phase:F.phase,labels:labels.map(x=>({...x}))};}
  function clearLegacy(){if(F.attentionPaths){F.attentionPaths.forEach(g=>g.visible=false);F.reply.visible=false;F.bookLeft.rotation.z=0;F.bookCover.scale.x=1;F.bookCover.position.x=0;}date.visible=false;ghost.visible=false;thought.visible=false;thoughtTrail.forEach(x=>x.visible=false);conversation.forEach(x=>x.visible=false);beam.visible=false;spot.intensity=0;spotRing.visible=false;lamp.visible=false;titleRoot.visible=false;lightField.visible=false;dayScene.userData.date.visible=false;}
  function renderCafeTexture(time,target=memoryTarget,cam=dayCamera){
    people.forEach(p=>pose(p,time));clearLegacy();const b=dayScene.userData.date;b.visible=true;setWord(b,time%4<2?'周日':'周六');b.rotation.y=out3((time%4-1.4)/.5)*PI*2;
    cam.position.set(3.3,3.7,8.1);cam.lookAt(-.45,1.95,.25);cam.updateMatrixWorld();renderer.setRenderTarget(target);renderer.render(dayScene,cam);renderer.setRenderTarget(null);b.visible=false;
  }
  function shirt(parent,good=false){
    const g=new T.Group();parent.add(g);const s=new T.Shape();s.moveTo(-.31,1);s.quadraticCurveTo(0,.69,.31,1);s.lineTo(.82,.75);s.lineTo(1.08,.16);s.lineTo(.63,-.04);s.lineTo(.61,-.98);s.quadraticCurveTo(0,-1.07,-.61,-.98);s.lineTo(-.63,-.04);s.lineTo(-1.08,.16);s.lineTo(-.82,.75);s.closePath();
    const body=mesh(new T.ExtrudeGeometry(s,{depth:.065,bevelEnabled:true,bevelSegments:3,bevelSize:.035,bevelThickness:.02,curveSegments:18}),M.cream,g);body.position.z=-.03;
    curve(g,[v(-.29,.99,.09),v(0,.76,.09),v(.29,.99,.09)],.022,material('#c2b69b'));
    for(const a of [-1,1])curve(g,[v(a*.62,-.82,.09),v(a*.60,-.94,.09),v(a*.18,-.98,.09)],.009,material('#cbbda0'));
    const print=new T.Mesh(new T.PlaneGeometry(.78,.83),new T.MeshBasicMaterial({map:good?F.goodTexture:F.photoTexture,transparent:true,toneMapped:false}));print.position.set(0,.03,.095);g.add(print);g.userData={body,print};return g;
  }
  function texture(draw,w=768,h=768){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;}
  function curvedPrint(parent,tex){const geo=new T.PlaneGeometry(.44,.46,20,16);const p=geo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i);p.setZ(i,Math.sqrt(Math.max(.005,.37*.37-x*x))*.74+.012);}geo.computeVertexNormals();const m=new T.Mesh(geo,new T.MeshBasicMaterial({map:tex,transparent:true,side:T.FrontSide,toneMapped:false}));m.position.y=1.16;parent.add(m);return m;}
  function initLab(){
    scene=world();F.lab=scene;room();
    F.student=character(-3.4,1.45,0,0,true);F.student.body.material=M.cream;F.student.root.traverse(o=>{if(o.isMesh&&o.material===M.coral)o.material=M.cream;});F.studentPrint=curvedPrint(F.student.root,F.photoTexture);
    F.classmates=[character(1.5,-.65,.15,1),character(3.45,.25,-.50,2)];
    rounded(scene,M.wood,v(2.55,1.24,.55),3.7,.16,1.45,.10);for(const x of[.92,4.17])for(const z of[.03,1.06])rod(scene,M.wood,v(x,1.15,z),v(x,.02,z),.055);
    F.labBooks=F.classmates.map((p,i)=>{const g=new T.Group();scene.add(g);g.position.set(p.x,1.35,.55);rounded(g,i?M.mint:M.cream,v(),.72,.49,.055,.035).rotation.x=-PI/2;for(let j=0;j<4;j++)box(g,M.trim,v(0,.04,-.14+j*.09),v(.49,.007,.012));return g;});
    const doorway=new T.Group();scene.add(doorway);doorway.position.set(-4.55,0,-.45);rounded(doorway,M.wood,v(0,1.9,0),1.65,3.8,.18,.08);rounded(doorway,M.trim,v(0,1.9,.12),1.42,3.58,.06,.04);ell(doorway,M.gold,v(.49,1.85,.2),v(.055,.055,.06));
    F.shirt=shirt(scene);F.shirt.position.set(-1.6,3.1,1.3);F.goodShirt=shirt(scene,true);F.hanger=new T.Group();scene.add(F.hanger);curve(F.hanger,[v(-.83,0,0),v(0,.38,0),v(.83,0,0)],.026,M.gold);curve(F.hanger,[v(0,.35,0),v(0,.60,0),v(.14,.71,0),v(.22,.60,0)],.025,M.gold);
    F.scan=new T.Group();scene.add(F.scan);rod(F.scan,M.gold,v(-1.1,0,0),v(1.1,0,0),.016);for(const a of[-1,1])ell(F.scan,M.gold,v(a*1.13,0,0),v(.06,.06,.06));
    F.grid=new T.Group();scene.add(F.grid);F.grid.position.set(.4,3.0,2.0);F.cells=[];
    for(let i=0;i<100;i++){const g=rounded(F.grid,material('#60868a'),v(),.25,.25,.07,.035);g.userData.home=v((i%10-4.5)*.34,(4.5-Math.floor(i/10))*.34,0);F.cells.push(g);}
    F.selfTarget=new T.WebGLRenderTarget(1280,720);F.selfTarget.samples=4;F.selfTarget.texture.colorSpace=T.SRGBColorSpace;F.selfCamera=new T.PerspectiveCamera(33,W/H,.05,60);F.selfPanel=panel(scene,F.selfTarget.texture,3.8,2.14);F.selfPanel.position.set(-.7,3.0,2.1);
    F.detailTargets=[0,1,2].map(()=>{const r=new T.WebGLRenderTarget(1280,720);r.samples=4;r.texture.colorSpace=T.SRGBColorSpace;return r;});F.detailPanels=F.detailTargets.map((r,i)=>panel(scene,r.texture,3.8,2.14));
    F.hair=curve(F.student.head,[v(-.08,.30,.08),v(-.03,.53,.12),v(.14,.48,.10),v(.16,.32,.10)],.035,M.hair);
    const stainTex=texture((g,w,h)=>{const a=g.createRadialGradient(w*.45,h*.48,10,w*.5,h*.5,w*.4);a.addColorStop(0,'#916944a8');a.addColorStop(.65,'#99754b77');a.addColorStop(1,'#a9895300');g.fillStyle=a;g.beginPath();g.ellipse(w*.5,h*.5,w*.39,h*.28,-.3,0,PI*2);g.fill();});F.stain=new T.Mesh(new T.PlaneGeometry(.15,.13),new T.MeshBasicMaterial({map:stainTex,transparent:true,depthWrite:false,toneMapped:false}));F.stain.position.set(.13,.96,.29);F.student.root.add(F.stain);
    F.errorWord=badge('周日',.82,.48,'#a44f35');scene.add(F.errorWord);F.focusRings=[0,1,2].map(()=>{const m=new T.Mesh(new T.TorusGeometry(.20,.012,8,64),new T.MeshBasicMaterial({color:C.gold,transparent:true,opacity:1}));scene.add(m);return m;});
    F.labObjects=[F.shirt,F.goodShirt,F.hanger,F.scan,F.grid,F.selfPanel,...F.detailPanels,F.errorWord,...F.focusRings];
  }
  function initCafeLives(){
    scene=F.cafe;
    F.cinema=panel(scene,memoryTarget.texture,3.8,2.14);F.cinema.position.set(-.4,3.3,1.5);F.focusCopies=[0,1,2].map(()=>panel(scene,memoryTarget.texture,2.9,1.63));
    F.friendRecall=badge('？',1.1,.7,C.trim);scene.add(F.friendRecall);F.friendRecall.position.set(1.2,3.1,.3);
    F.friendPhone=new T.Group();scene.add(F.friendPhone);rounded(F.friendPhone,M.ink,v(),.36,.65,.06,.05);rounded(F.friendPhone,material('#adc8bc'),v(0,0,.04),.30,.56,.01,.035);F.bubbles=[];for(let i=0;i<3;i++)F.bubbles.push(rounded(F.friendPhone,i%2?M.mint:M.cream,v(-.015,.15-i*.15,.055),.22,.085,.01,.025));
    F.planner=new T.Group();scene.add(F.planner);F.planner.position.set(1.8,1.42,.68);rounded(F.planner,M.coral,v(),.95,.72,.055,.05).rotation.x=-PI/2;for(const a of[-1,1]){const pg=rounded(F.planner,M.cream,v(a*.23,.04,0),.44,.65,.025,.02);pg.rotation.x=-PI/2;for(let j=0;j<4;j++)box(F.planner,M.trim,v(a*.23,.06,-.23+j*.13),v(.31,.004,.012));}F.plannerPage=new T.Group();F.planner.add(F.plannerPage);rounded(F.plannerPage,M.cream,v(.23,.07,0),.44,.65,.012,.02).rotation.x=-PI/2;
    F.mirror=new T.Group();scene.add(F.mirror);rounded(F.mirror,M.gold,v(),.48,.66,.05,.13);rounded(F.mirror,material('#b4c9bd',.25,{metalness:.35}),v(0,0,.04),.40,.58,.012,.10);const tinyHead=people[2].head.clone(true);tinyHead.position.set(0,-.015,.08);tinyHead.scale.setScalar(.42);F.mirror.add(tinyHead);
    F.cameras=[];F.lifeTargets=[0,1,2].map(()=>{const r=new T.WebGLRenderTarget(960,540);r.samples=4;r.texture.colorSpace=T.SRGBColorSpace;return r;});
    F.cameraScreenPanels=F.lifeTargets.map((r,i)=>{const rig=new T.Group();scene.add(rig);rounded(rig,M.ink,v(),.62,.40,.30,.07);const lens=cyl(rig,M.gold,v(0,0,.23),.17,.22);lens.rotation.x=PI/2;const p=new T.Mesh(new T.PlaneGeometry(.49,.28),new T.MeshBasicMaterial({map:r.texture,toneMapped:false}));p.position.z=-.19;p.rotation.y=PI;rig.add(p);F.cameras.push(rig);return p;});
    F.spots=people.map(p=>{const g=new T.Group();scene.add(g);const source=lamp.clone(true);source.position.set(p.x,4.65,p.z);source.scale.setScalar(.72);source.visible=true;g.add(source);const geo=new T.ConeGeometry(1,1,48,1,true);geo.translate(0,-.5,0);const beam=new T.Mesh(geo,new T.MeshBasicMaterial({color:'#f5d29b',transparent:true,opacity:.17,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));beam.position.set(p.x,4.5,p.z);beam.scale.set(.70,4.45,.70);g.add(beam);const ring=new T.Mesh(new T.RingGeometry(.60,.63,72),new T.MeshBasicMaterial({color:C.gold,transparent:true,opacity:.75,depthWrite:false}));ring.rotation.x=-PI/2;ring.position.set(p.x,.03,p.z);g.add(ring);const light=new T.SpotLight(C.gold,22,9,.25,.5,1);light.position.set(p.x,4.4,p.z);light.target.position.set(p.x,.1,p.z);g.add(light,light.target);return g;});
    scene=F.home;F.endingPanels=F.lifeTargets.slice(1).map(r=>panel(scene,r.texture,2.7,1.52));F.endingPanels.forEach((p,i)=>p.position.set(2.0+i*.1,3.3-i*1.2,-1.6));
    F.lifeCamera=new T.PerspectiveCamera(33,W/H,.05,60);
  }
  function initAct1Details(){
    F.calendar=new T.Group();F.home.add(F.calendar);F.calendar.position.set(1.65,1.90,1.2);F.calendar.rotation.y=-.12;
    box(F.home,M.wood,v(1.65,.58,1.1),v(1.9,1.16,1.1));rounded(F.calendar,M.wood,v(),1.85,1.42,.13,.08);
    rounded(F.calendar,M.cream,v(0,-.04,.09),1.65,1.18,.035,.04);rod(F.calendar,M.coral,v(-.66,.59,.14),v(.66,.59,.14),.035);
    rounded(F.calendar,M.trim,v(0,-.07,.145),1.56,.73,.02,.04);F.calendarLeaf=new T.Group();F.calendar.add(F.calendarLeaf);F.calendarLeaf.position.set(0,.56,.15);rounded(F.calendarLeaf,M.cream,v(0,-.56,0),1.62,1.12,.025,.035);rounded(F.calendarLeaf,M.trim,v(0,-.59,.04),1.54,.72,.025,.04);
    F.friendTarget=new T.WebGLRenderTarget(1280,720);F.friendTarget.samples=4;F.friendTarget.texture.colorSpace=T.SRGBColorSpace;
    F.friendCamera=new T.PerspectiveCamera(33,W/H,.05,60);F.friendWindow=panel(F.cafe,F.friendTarget.texture,3.6,2.025);
    F.friendWindow.userData.image.material.transparent=true;
    F.friendLines=[0,1,2].map(i=>rounded(F.friendWindow,M.cream,v(.64,.25-i*.25,.16),.88-i*.09,.10,.03,.04));
    // 视线在同一个空间里连到本人，不再把人物装进新的想象画框。
    F.attentionPaths=people.slice(1).map(p=>{const g=new T.Group();F.cafe.add(g);const from=v(p.x,2.05,p.z+.16),to=v(-2.15,2.0,.72),mid=from.clone().lerp(to,.5).add(v(0,.48,.26));for(let i=0;i<14;i++){const a=from.clone().lerp(mid,i/14).lerp(mid.clone().lerp(to,i/14),i/14),u=(i+.64)/14,b=from.clone().lerp(mid,u).lerp(mid.clone().lerp(to,u),u);rod(g,new T.MeshBasicMaterial({color:C.gold}),a,b,.025);}return g;});
    F.reply=new T.Group();F.cafe.add(F.reply);rounded(F.reply,M.mint,v(),.36,.18,.035,.055);for(let i=0;i<3;i++)ell(F.reply,M.cream,v((i-1)*.075,0,.035),v(.016,.016,.008));
    F.bookLeft=new T.Group();F.planner.add(F.bookLeft);for(const child of [...F.planner.children])if(child!==F.bookLeft&&child.position.x<-.05)F.bookLeft.add(child);
    const lid=rounded(F.bookLeft,M.coral,v(-.23,.015,0),.47,.70,.035,.025);lid.rotation.x=-PI/2;
    F.bookCover=F.planner.children[0];

  }
  function friendRecallTexture(t){
    people.forEach(p=>pose(p,7+t));clearLegacy();const q=people[1];q.head.rotation.set(.04,-.08,0);q.mouth.scale.y=.009*(1.6+.6*Math.sin(t*14));
    F.friendCamera.position.set(.75,2.95,3.3);F.friendCamera.lookAt(-.10,1.95,-.9);F.friendCamera.updateMatrixWorld();
    renderer.setRenderTarget(F.friendTarget);renderer.render(F.cafe,F.friendCamera);renderer.setRenderTarget(null);
  }
  function initFilm(act){
    F.act=act;initBedroom();F.home=scene;F.cafe=dayScene;F.cafeLights=F.cafe.children.filter(g=>g.isLight).map(g=>[g,g.intensity]);
    F.photoTexture=new T.Texture();F.photoTexture.colorSpace=T.SRGBColorSpace;const photo=new Image();F.photoReady=new Promise((resolve,reject)=>{photo.onload=()=>{F.photoTexture.image=photo;F.photoTexture.needsUpdate=true;resolve();};photo.onerror=()=>reject(new Error('歌手照片未加载'));});photo.src='assets/barry-manilow-1975.jpg';
    F.goodTexture=texture((g,w,h)=>{g.strokeStyle='#c56a49';g.lineWidth=72;g.lineCap='round';g.beginPath();g.moveTo(w*.19,h*.37);g.bezierCurveTo(w*.42,h*.12,w*.58,h*.63,w*.81,h*.35);g.stroke();g.strokeStyle='#285562';g.lineWidth=42;g.beginPath();g.moveTo(w*.19,h*.56);g.bezierCurveTo(w*.42,h*.31,w*.58,h*.82,w*.81,h*.55);g.stroke();});
    initLab();initCafeLives();if(act===1)initAct1Details();for(const id of F.labels){const el=document.createElement('div');el.id=id;el.className='label';el.style.textShadow='0 3px 14px #153d48';document.getElementById('root').appendChild(el);}scene=F.cafe;
  }

  function hideNew(){if(F.friendWindow)F.friendWindow.visible=false;F.labObjects.forEach(g=>g.visible=false);[F.cinema,...F.focusCopies,F.friendRecall,F.friendPhone,F.planner,F.mirror,...F.cameras,...F.spots,...F.endingPanels].forEach(g=>g.visible=false);}
  function labPose(t,daily=false){
    scene=F.lab;const p=F.student;const walk=daily?1:out3((t-15.4)/4.5),step=daily?0:pulse(t,15.4,15.7,19.4,20.2);p.root.position.set(mix(-3.4,-.75,walk),Math.abs(Math.sin(t*7))*step*.055,1.45);p.root.rotation.set(0,daily?.05:mix(.15,.75,pulse(t,15.2,15.5,19.5,20.1)),0);
    p.head.position.set(0,1.95,0);p.head.rotation.set(daily?.02:.18*pulse(t,8,8.5,14.8,15.4),Math.sin(t*.8)*.025,0);p.mouth.scale.set(.048,.009,.013);p.legs.forEach((g,i)=>g.rotation.x=Math.sin(t*7+i*PI)*step*.42);
    p.arms.forEach((a,i)=>{a.root.rotation.set(-.20+Math.sin(t*7+i*PI)*step*.38,0,i?.13:-.13);a.elbow.rotation.set(-.30,0,0);a.hand.rotation.set(0,0,0);});
    p.eyes.forEach(e=>e.scale.y=.037*(1-.85*Math.pow(Math.max(0,Math.cos(t*1.7)),50)));
    const good=!daily&&t>=31.2;F.studentPrint.material.map=(good||daily)?F.goodTexture:F.photoTexture;F.studentPrint.visible=true;F.hair.visible=daily;F.stain.visible=daily;
    if(!daily&&t>=8&&t<15.4){const pull=pulse(t,10.4,10.8,14.6,15.4);pointArm(p.arms[1],p.root.localToWorld(v(.27,1.04,.36)));pointArm(p.arms[0],p.root.localToWorld(v(-.27,1.04,.36)));p.root.rotation.z=-.025*pull;p.head.rotation.x=.22*pull;}
    F.classmates.forEach((q,i)=>{pose(q,8+t*.65);q.root.rotation.y=q.yaw;const glance=pulse(t,18.3+i*.18,18.6+i*.18,19.3+i*.18,19.65+i*.18);q.head.rotation.set(mix(.23,.02,glance),mix(.02,-.38,glance),0);pointArm(q.arms[0],v(q.x-.22,1.44,.64));pointArm(q.arms[1],v(q.x+.23,1.45,.55));});
  }
  function studentTexture(target,focus='body'){
    const p=F.student.root,at=p.localToWorld(focus==='hair'?v(.04,2.3,.1):focus==='stain'?v(.13,.98,.27):focus==='mouth'?v(0,1.85,.25):v(0,1.60,.1));const dist=focus==='body'?3.8:focus==='stain'?1.05:1.55;F.selfCamera.position.copy(at).add(v(.1,.05,dist));F.selfCamera.lookAt(at);F.selfCamera.updateMatrixWorld();
    const old=F.labObjects.map(g=>g.visible);F.labObjects.forEach(g=>g.visible=false);if(focus==='mouth')F.errorWord.visible=old[F.labObjects.indexOf(F.errorWord)];renderer.setRenderTarget(target);renderer.render(F.lab,F.selfCamera);renderer.setRenderTarget(null);F.labObjects.forEach((g,i)=>g.visible=old[i]);
  }
  function lives(t){
    if(F.attentionPaths){F.attentionPaths.forEach(g=>g.visible=false);F.reply.visible=false;F.bookLeft.rotation.z=0;F.bookCover.scale.x=1;F.bookCover.position.x=0;}
    scene=F.cafe;people.forEach(p=>pose(p,8+t));clearLegacy();scene.updateMatrixWorld(true);people[0].arms[0].hand.getWorldPosition(phone.position);phone.position.add(v(.015,.10,.07));phone.rotation.set(-.12,.48,-.10);
    F.friendPhone.visible=true;pointArm(people[1].arms[0],v(-.35,1.85,-.40));scene.updateMatrixWorld(true);people[1].arms[0].hand.getWorldPosition(F.friendPhone.position);F.friendPhone.position.add(v(.02,.12,.12));F.friendPhone.rotation.set(-.12,.15,-.05);F.bubbles.forEach((b,i)=>b.scale.x=.75+.25*out3(((t+i*.35)%1.8)/.6));
    F.planner.visible=true;F.plannerPage.rotation.z=PI*out3((t%3.4)/.8);F.mirror.visible=true;F.mirror.position.set(2.38,2.12,.52);F.mirror.rotation.set(.06,-.27,Math.sin(t*1.5)*.035);pointArm(people[2].arms[1],v(2.36,1.92,.52));pointArm(people[2].arms[0],v(2.12,2.28,.25));people[2].head.rotation.y=.12;
  }
  function act1Attention(t){
    const imaginary=pulse(t,10.4,10.95,12.85,13.55),progress=out3((t-10.55)/.65)*(1-out3((t-13.0)/.5));
    F.attentionPaths.forEach((g,i)=>{g.visible=imaginary>.001;g.children.forEach((m,j)=>m.visible=j/14<progress);});
    people.slice(1).forEach(p=>{const target=Math.atan2(-2.15-p.x,.52-p.z);p.root.rotation.y=mix(p.root.rotation.y,target,imaginary);p.head.rotation.set(mix(.20,-.04,imaginary),0,0);});
    F.friendPhone.visible=imaginary<.95;F.mirror.visible=imaginary<.95;
    if(t>=10.4&&t<13.4)label('tagA',SceneOptions.attentionLabel,v(-2.15,3.02,.55),pulse(t,10.4,10.75,12.85,13.4),C.gold,64);
    window.__act1Attention={imaginary,paths:progress,real_attention:1-imaginary};
  }
  function act1LifeResult(t){
    const phonePerson=people[1],bookPerson=people[2],send=out3((t-22.7)/.45),lower=out3((t-23.25)/.8),close=ramp(t,24.6,25.55);
    F.reply.visible=t>=22.7&&t<23.45;F.reply.scale.setScalar(Math.max(.001,pulse(t,22.7,22.85,23.15,23.45)));
    const held=v(-.32,1.97,-.32),placed=v(.10,1.425,.14);F.friendPhone.position.copy(held.clone().lerp(placed,lower));F.friendPhone.rotation.set(mix(-.12,-PI/2,lower),mix(.15,0,lower),-.05*(1-lower));
    F.reply.position.copy(held).add(v(.12+send*.38,.19+send*.40,.15));F.reply.quaternion.copy(camera.quaternion);
    const pressing=pulse(t,22.45,22.65,22.85,23.05);pointArm(phonePerson.arms[0],F.friendPhone.position.clone().add(v(-.10,0,-.03)));pointArm(phonePerson.arms[1],held.clone().add(v(.10,.05,-.10+.14*pressing)).lerp(v(.18,1.45,-.13),lower));phonePerson.head.rotation.set(.23-.10*lower,-.08,0);
    F.mirror.visible=false;F.plannerPage.rotation.z=0;F.bookLeft.rotation.z=-PI*close;F.bookCover.scale.x=1-close*.48;F.bookCover.position.x=close*.22;
    const bookEdge=F.planner.localToWorld(v(-.40*Math.cos(close*PI),.10+.40*Math.sin(close*PI),.14));pointArm(bookPerson.arms[0],bookEdge);pointArm(bookPerson.arms[1],v(2.12,1.51,.62));bookPerson.head.rotation.set(.23,-.20,0);
    window.__act1LifeResult={reply_sent:send,phone_placed:lower,planner_closed:close};
  }
  function lifeTextures(t){
    lives(t);const hide=[F.cinema,F.friendRecall,...F.cameras,...F.spots],visible=hide.map(x=>x.visible);hide.forEach(x=>x.visible=false);
    const targets=[v(-2.15,1.9,.52),v(-.15,1.85,-1.02),v(2.05,1.9,.02)];targets.forEach((at,i)=>{F.lifeCamera.position.copy(at).add(v(.2,.45,4.7));F.lifeCamera.lookAt(at);F.lifeCamera.updateMatrixWorld();renderer.setRenderTarget(F.lifeTargets[i]);renderer.render(F.cafe,F.lifeCamera);});renderer.setRenderTarget(null);hide.forEach((x,i)=>x.visible=visible[i]);
  }
  function drawAct1(t){
    if(t<5.4){
      scene=F.home;clearLegacy();dayScene.userData.date.visible=true;drawBedroom(16.5+t);resetLabels();
      shot(t,[[0,0,4.2,4.4,9.6,-.7,2.25,.1],[.45,.55,2.9,3.65,8,-1,2.6,.3],[2.5,.4,4.2,4.1,10,-.3,2.2,.8],[4.8,.4,3.3,3.8,8.6,-.8,2.4,.4]]);
      const approach=out3(t/.6),back=out3((t-2.0)/.5);memoryWindow.visible=true;memoryWindow.position.set(mix(-1.2,-2.0,back),mix(3.15,3.45,back),.2);memoryWindow.scale.setScalar(mix(.8+approach*.35,.58,back));memoryWindow.rotation.set(0,-.05,0);
      replayFrames.forEach((g,i)=>{const at=2.7+i*1.0,age=t-at,u=out3(age/.65);g.visible=i<2&&age>=0&&age<1.2;g.position.copy(v(-2,3.45,.2).lerp(v(-.2+i*.6,3.35-i*.4,1.25),u));g.rotation.set(0,-.12,Math.sin(u*PI)*.07);g.scale.setScalar(Math.max(.001,.57*spring(age/.3)*(1-out3((age-.8)/.4))));});
      const second=out3((t-2.7)/.28),third=out3((t-3.7)/.28),flip=t>=3.7?third:second;
      F.calendarLeaf.rotation.x=-PI*flip;F.calendarLeaf.visible=flip<.999;const day=third>.5?'第三天':second>.5?'第二天':'当天';
      const reading=1-pulse(t,t>=3.7?3.7:2.7,t>=3.7?3.74:2.74,t>=3.7?3.88:2.88,t>=3.7?3.98:2.98);
      label('tagA',day,F.calendar.localToWorld(v(0,-.07,.24)),reading,C.cream,64);
      bedHead.rotation.y=-.1+.23*pulse(t,2.6,2.9,3.4,3.6)+.20*pulse(t,3.7,4.0,4.6,4.9);bedArm.rotation.z=1.3+.32*pulse(t,2.7,3.0,4.2,4.8);
      projection.visible=false;F.phase=t<2.5?'A1：夜里仍记得同一次口误':'A1：日历翻到第二、三天，同一口误仍在回放';
      window.__act1Event={id:'A1',calendar_day:day,calendar_flip:flip,memory_present:true};renderer.render(scene,camera);return;
    }
    scene=F.cafe;
    if(t<10.4)friendRecallTexture(t-5.4);else renderCafeTexture(2.2+(t%2.3)*1.5);
    lives(t);
    shot(t,[[0,0,2.7,3.9,8.3,-.5,2.5,.3],[5.4,0,2.7,3.9,8.3,-.5,2.5,.3],[6.15,.45,.5,3.8,7.2,-.7,3.2,.6],[8.85,.42,2.8,3.7,8.8,-.55,2.0,.2],[10.4,.4,2.7,3.9,8.3,-.5,2.0,.25],[13.3,.45,2.8,3.5,7.2,.35,1.9,-.2],[15.8,.45,3.7,5.8,12.8,0,1.7,0],[18.7,.4,2.7,4,8.6,-.3,2.7,.5],[22.3,.42,.65,2.9,4.9,-.15,1.8,-.35],[24.3,.40,3.45,2.9,4.9,1.85,1.6,.4]]);
    if(t<10.4){
      const enter=out3((t-5.4)/.65),missing=out3((t-7.2)/.65),leave=out3((t-9.65)/.6),u=enter*(1-leave),g=F.friendWindow;
      g.visible=u>.001;g.position.copy(v(-2.15,2.65,.65).lerp(v(-.8,3.65,.8),enter));g.position.y-=leave*.55;g.scale.setScalar(Math.max(.001,u));g.rotation.set(0,-.04,0);g.userData.image.material.opacity=1-missing*.20;
      F.friendLines.forEach((m,i)=>{m.scale.x=Math.max(.001,1-out3((t-7.0-i*.13)/.50));m.position.x=.64+i*.04;});
      thoughtTrail.forEach((m,i)=>{m.visible=u>.05;m.position.copy(v(-2.15,2.55,.65).lerp(v(-1.45,2.9,.75),(i+1)/4));});
      const own=people[0];own.head.rotation.y=.25+.35*enter;own.head.rotation.z=-.08*missing;pointArm(own.arms[1],v(-1.93,1.98,.80));
      label('tagB','？',g.localToWorld(v(.66,-.05,.23)),missing*(1-leave),C.cream,112);
      F.phase=t<7.2?'A2：主角尝试回忆朋友说过的话':'A2：朋友的具体话语消失，主角的回忆窗口只留下问号';
      window.__act1Event={id:'A2',recall_owner:'主角',recalled_person:'朋友',missing_words:missing,window_enter:enter,window_leave:leave};
    }else if(t<15.8){
      act1Attention(t);
      F.phase=t<13.3?'A3：想象中朋友抬头，视线集中到本人':'A3：视线收回，朋友的注意回到手里的事';
      if(t>=14.6){beam.visible=spotRing.visible=lightField.visible=true;headlineAt(mix(14.8,15.7,out3((t-14.6)/1.2)));}
      window.__act1Event={id:'A3',...window.__act1Attention};
    }
    if(t>=15.8&&t<18.8){beam.visible=spotRing.visible=lightField.visible=titleRoot.visible=true;headlineAt(15.7+(t-15.8)*1.4);F.phase=t<17.1?'A4：同一束光逐字扫亮立体名称':'A4：聚光灯效应完整落定';window.__act1Event={id:'A4',title_complete:t>=17.1};}
    if(t>=18.7&&t<22.8){const u=spring((t-18.7)/.65),leave=out3((t-21.7)/.65);F.cinema.visible=true;F.cinema.position.set(-.25+leave*4.8,3,.8);F.cinema.scale.setScalar(Math.max(.001,1.38*u*(1-leave*.7)));F.cinema.rotation.set(0,-.1-leave*.8,-.025*(1-u));F.phase='A5：同一记忆成为大屏，侧移后显露真实旁人';window.__act1Event={id:'A5',screen_grow:u,screen_leave:leave};}
    if(t>=22.3){act1LifeResult(t);F.phase='A5：回复发出、手机放到桌面，再合上日程本';window.__act1Event={id:'A5',...window.__act1LifeResult};}
    renderer.render(scene,camera);if(t>=15.8&&t<18.8){const bg=scene.background;scene.background=null;camera.layers.set(1);titleRenderer.render(scene,camera);scene.background=bg;camera.layers.set(0);}
  }
  function drawAct2(t){
    labPose(t);shot(t,[[0,0,-1.4,3.6,8.3,-1.45,2.95,1.2],[4.1,.45,-1.5,3.3,6.8,-1.6,3.05,1.3],[7.6,.55,-1.9,3.3,8,-2,1.95,.9],[15.4,.45,3.3,4.6,11,.1,1.7,.5],[20.7,.5,2.2,4.9,11,.1,2.65,1.1],[29.5,.45,1.1,3.5,8.4,-.6,2.25,1.1],[36,.45,1.2,3.8,9,-.4,2.6,1.1],[38.8,.65,-.7,3.0,7.8,-.7,3.0,2.1]]);
    if(t<8.8){const u=spring(t/.65),give=out3((t-7.6)/1.2);F.shirt.visible=true;F.shirt.position.set(mix(-1.6,-3.4,give),mix(3.1,1.2,give),mix(1.3,1.7,give));F.shirt.scale.setScalar(Math.max(.001,mix(u,.43,give)));F.shirt.rotation.set(.04*(1-give),.08*Math.sin(t*.8),-.035*(1-u));F.hanger.visible=t<8.3;F.hanger.position.set(-1.6,4.03+out3((t-7.6)/.7)*2,1.3);F.hanger.scale.setScalar(Math.max(.001,u));F.scan.visible=t>=4.1&&t<5.0;F.scan.position.set(-1.6,mix(3.7,2.65,out3((t-4.1)/.9)),1.44);label('tagA',t<4.1?'2000年':'巴里·曼尼洛',v(-1.6,4.65,1.3),pulse(t,.15,.45,7.0,7.6),C.gold,64);F.phase='衣架展开T恤，光线扫过真实歌手头像，再交给学生';}
    else if(t<15.4)F.phase='穿着者低头拉住衣料，收肩面对同龄人';
    else if(t<20.7)F.phase='学生迈步入场，同学短暂抬眼后看回书本';
    if(t>=20.7&&t<30){F.grid.visible=true;F.grid.rotation.set(-.05,-.10,0);const enter=out3((t-20.7)/.5),leave=out3((t-29.5)/.5);F.grid.scale.setScalar(Math.max(.001,enter*(1-leave)));F.cells.forEach((m,i)=>{const home=m.userData.home,appear=spring((t-20.7-i*.006)/.35),lit=out3((t-22.1-i*.013)/.38),remove=i>=23&&i<46?out3((t-25.1-(i-23)*.012)/.52):0;m.position.copy(home);m.position.z+=Math.sin(appear*PI)*.4;m.position.x+=remove*(3+(i%4)*.2);m.position.y-=remove*(2.4+(i%3)*.25);m.rotation.set(0,remove*PI*.7,remove*.6);m.scale.setScalar(Math.max(.001,appear*(1-remove)));m.material.color.set(i<23&&t>=25.1?C.mint:i<46&&lit>.01?C.coral:'#60868a');});label('tagA',t<25.1?'近一半':'约23%',v(.3,5.0,2),enter*(1-leave),t<25.1?C.gold:C.mint,88);label('tagB','比例示意',v(.35,.97,2),enter*(1-leave),C.cream,64);F.phase=t<25.1?'估计中近一半被点亮':'高估部分退出，同一比例格留下约23%';}
    if(t>=29.5&&t<33.1){const u=out3((t-29.5)/.65),settle=out3((t-30.7)/.7);F.shirt.visible=true;F.shirt.position.set(-.75-u*2,1.3+u*1.4,1.9);F.shirt.scale.setScalar(.45*(1-u*.4));F.shirt.rotation.set(0,u*.7,0);F.goodShirt.visible=true;F.goodShirt.position.set(mix(2,-.75,settle),mix(3.0,1.2,settle),1.85);F.goodShirt.scale.setScalar(mix(.75,.43,settle));F.goodShirt.rotation.set(0,(1-settle)*-.4,0);F.phase='体面T恤实际交接，胸前图案跟随更换';}
    if(t>=33.1){studentTexture(F.selfTarget);F.selfPanel.visible=true;const grow=out3((t-36)/.55);F.selfPanel.position.set(mix(-1.9,-.7,grow),mix(3.3,3,grow),2.1);F.selfPanel.scale.setScalar(mix(.62,1.12,grow));F.selfPanel.rotation.set(0,mix(.18,0,grow),0);F.phase=t<36?'自己眼里的衣服占据更大画幅，旁人继续低头':'同一主观画幅接入下一幕的特写';label('tagA','自己眼里',v(-1.6,4.55,2),pulse(t,33.1,33.5,36.2,36.6),C.gold,64);}
    renderer.render(scene,camera);
  }
  function drawAct3(t){
    if(t<9.5){labPose(t,true);const p=F.student;const hair=pulse(t,2.6,2.85,3.7,4),pull=pulse(t,3.8,4.0,4.8,5.1),say=pulse(t,5,5.15,6.6,7.0);pointArm(p.arms[1],p.root.localToWorld(v(.24,2.1,.12).lerp(v(.25,1.04,.37),pull)));p.head.rotation.z=-.035*hair;p.mouth.scale.y=.009*(1+say*(1.3+Math.sin(t*19)));p.root.scale.set(1+pull*.025,1,1);F.errorWord.visible=say>.01;F.errorWord.position.copy(p.root.localToWorld(v(.42,1.92,.43)));F.errorWord.scale.setScalar(.45*spring((t-5)/.3));setWord(F.errorWord,t<5.7?'周日':'周六');F.errorWord.rotation.y=out3((t-5.45)/.35)*PI*2;
      for(let i=0;i<3;i++)studentTexture(F.detailTargets[i],['hair','stain','mouth'][i]);studentTexture(F.selfTarget);F.errorWord.visible=false;
      shot(t,[[0,0,-.7,3.0,7.8,-.7,3,2.1],[2.8,.32,-.65,3.0,7.6,-.65,3,2.1],[7,.40,.4,4.1,10,-.4,3,1.5]]);
      const whole=1-out3((t-2.6)/.35);F.selfPanel.visible=whole>.001;F.selfPanel.position.set(-.7,3,2.1);F.selfPanel.rotation.set(0,0,0);F.selfPanel.scale.setScalar(1.12*Math.max(.001,whole));
      const selected=t<3.9?0:t<5?1:2;F.detailPanels.forEach((g,i)=>{const enter=out3((t-2.6-i*.07)/.35),spread=out3((t-7)/.50),active=i===selected;g.visible=enter>0;g.position.set(mix(active?-.65:-.65+(i-selected)*3.6,-3.8+i*3.7,spread),3.0+(i===1?.25:0)*spread,mix(active?2.1:.4,1.2,spread));g.scale.setScalar(enter*mix(active?1.12:.65,.78,spread));g.rotation.set(0,mix(active?0:(i<selected?.24:-.24),.10-i*.10,spread),0);});
      if(t>=2.8&&t<7)label('tagA',['头发','衣服','刚才那句话'][selected],v(-.65,4.65,2.1),1,C.gold,64);F.phase=t<2.8?'同一衣服接成自己眼里的特写':t<7?'真实细节动作快速接管画面':'三重特写展开，占据整个观看范围';renderer.render(scene,camera);return;
    }
    lifeTextures(t);scene=F.cafe;lives(t);shot(t,[[0,0,1.5,3.7,8,0,1.8,.2],[9.5,.48,.5,3.05,5.5,-.22,1.95,-.3],[12.5,.42,3.8,4.5,6.0,1.8,1.45,.6],[14,.42,3.4,3.3,5.5,2.15,2.05,.25],[17,.48,4.8,4.7,11,0,2.2,.2],[21.8,.50,3.0,4.3,10,0,2.1,.2],[24,.5,4.4,5.2,12,0,2,.2]]);
    if(t<17){label('tagA',t<12.5?'没回的消息':t<14?'明天的安排':'自己的样子',t<12.5?v(-.2,2.95,-.3):t<14?v(1.8,2.9,.6):v(2.15,3.1,.25),pulse(t,9.6,9.9,16.5,17),C.cream,64);F.phase='展开各自生活：消息更新、日程翻页、整理镜中自己';}
    if(t>=17&&t<24){const turn=out3((t-19.6)/.7);F.cameras.forEach((g,i)=>{const p=people[i];g.visible=true;g.position.set(p.x,3.25,p.z+1.4);g.scale.setScalar(spring((t-17-i*.08)/.45));const a=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(v(-2.15,1.95,.52),g.position,v(0,1,0))),b=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(v(p.x,1.95,p.z),g.position,v(0,1,0)));g.quaternion.copy(a).slerp(b,turn);g.rotation.x+=out3((t-21.8)/.55)*.35;});F.phase=t<19.6?'想象中的镜头都指向自己':'镜头转回每个人自己的画面';}
    if(t>=24&&t<27){F.cafeLights.forEach(([g,n])=>g.intensity=n*.23);F.spots.forEach((g,i)=>{const u=out3((t-24-i*.12)/.42);g.visible=u>.001;g.children[1].material.opacity=.18*u;g.children[2].material.opacity=.8*u;});F.phase='三束聚光各自落在同一空间里的三个人身上';}
    if(t>=27){scene=F.home;clearLegacy();dayScene.userData.date.visible=true;drawBedroom(40+(t-27)*.72);resetLabels();const shrink=out3((t-27.3)/1.0);memoryWindow.visible=true;memoryWindow.position.set(-1.2,3.3,-.2);memoryWindow.scale.setScalar(mix(.65,.26,shrink));replayFrames.forEach((g,i)=>{g.visible=i<3&&t<28.8;g.scale.setScalar(Math.max(.001,.45*(1-out3((t-27-i*.08)/1.2))));});projection.visible=false;F.endingPanels.forEach((g,i)=>{g.visible=true;g.position.set(2.0+i*.2,3.5-i*1.5,-1.0);g.scale.setScalar(.76*spring((t-28.1-i*.25)/.6));g.rotation.y=-.12;});shot(t,[[0,0,4.8,4.6,10.0,-.4,2.05,.2],[27,.52,4.8,4.6,10,-.4,2.05,.2],[31.2,.65,4.2,4.2,9,-.5,1.9,.2]]);F.phase='自己的回忆退为小窗，他人的日常仍在继续；回到同一主角';}
    renderer.render(scene,camera);
  }
  function drawFilm(t){if(!ready)return;titleRenderer.clear();resetLabels();hideNew();clearLegacy();F.cafeLights.forEach(([g,n])=>g.intensity=n);F.student.root.scale.set(1,1,1);camera.layers.set(0);if(activeAct===1)drawAct1(t);else if(activeAct===2)drawAct2(t);else drawAct3(t);finish(t);}

  return{create};
})();
