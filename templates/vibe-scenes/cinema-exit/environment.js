// 用途：四幕各按场景建立背景纵深和光影，只增强环境，不改主体或字幕。
// 运行：prepare.py复制到各幕；接入原有唯一暂停时间轴，绝对时间绘制。
// 依赖：本幕SVG与原动画；第二幕复用已认可hangar.js，衔接使用前幕背景末帧。
(() => {
 const OPT={w:1920,h:1080,captionY:842,dustCount:65,roomLight:.23,edgeDark:.50};
 const root=document.getElementById('root'),act=Number(root.dataset.backgroundAct);
 const canvas=document.getElementById('environment'),ctx=canvas.getContext('2d');
 const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
 const p=(t,a,d)=>smooth((t-a)/d),lerp=(a,b,u)=>a+(b-a)*u;
 const fract=v=>v-Math.floor(v),ns='http://www.w3.org/2000/svg';
 const dust=Array.from({length:OPT.dustCount},(_,i)=>({x:fract(Math.sin(i*127.1+2)*43758.54)*1920,y:fract(Math.sin(i*89.7+4)*28473.12)*800,r:.7+i%3*.4}));
 // 记录仅有的环境属性修改，供验收恢复后逐点比较全部原主体DOM。
 window.__backgroundEdits=[];
 function change(e,attrs){if(!e)return;for(const[k,v]of Object.entries(attrs)){if(!window.__backgroundEdits.some(x=>x.element===e&&x.key===k))window.__backgroundEdits.push({element:e,key:k,original:e.getAttribute(k)});e.setAttribute(k,v);}}
 function el(tag,attrs,parent){const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e;}
 function rgb(c,a){return `rgba(${c},${a})`;}
 function line(points,c,width=1){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=c;ctx.lineWidth=width;ctx.stroke();}
 function poly(points,c){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=c;ctx.fill();}
 function glow(x,y,rx,ry,c,a){ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,rgb(c,a));g.addColorStop(.45,rgb(c,a*.42));g.addColorStop(1,rgb(c,0));ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();}
 function wash(top,bottom){const g=ctx.createLinearGradient(0,0,0,1080);g.addColorStop(0,top);g.addColorStop(1,bottom);ctx.fillStyle=g;ctx.fillRect(0,0,1920,1080);}
 function layer(alpha,fn){if(alpha<=0)return;ctx.save();ctx.globalAlpha*=alpha;fn();ctx.restore();}
 function transformOf(id){const e=document.getElementById(id),m=e?.transform?.baseVal?.consolidate()?.matrix;return m||{a:1,b:0,c:0,d:1,e:0,f:0};}
 function camera(id,factor,fn){const m=transformOf(id);ctx.save();ctx.translate(m.e*factor,m.f*factor);ctx.scale(1+(m.a-1)*factor,1+(m.d-1)*factor);fn();ctx.restore();}
 function atmospheric(t,amount=1,drift=0){for(let i=0;i<dust.length;i++){const d=dust[i],x=((d.x-drift*(.25+(i%5)*.16))%2000+2000)%2000-40,y=d.y+Math.sin(t*.17+i)*9;ctx.fillStyle=rgb(i%4?'124,157,165':'204,187,145',amount*(.055+(i%4)*.025));ctx.beginPath();ctx.arc(x,y,d.r,0,Math.PI*2);ctx.fill();}}
 function floor(horizon=645,vanish=960,tone='86,117,131',wood=false){
  const g=ctx.createLinearGradient(0,horizon-90,0,1030);g.addColorStop(0,'rgba(18,41,50,0)');g.addColorStop(.34,'rgba(18,41,50,.60)');g.addColorStop(1,'#040d16');poly([[0,horizon-90],[1920,horizon-90],[1920,1080],[0,1080]],g);
  for(let i=-5;i<=5;i++)line([[vanish+i*50,horizon],[vanish+i*380,1080]],rgb(tone,wood?.09:.12),1.2);
  for(let i=0;i<7;i++){const y=horizon+(i*i+1)*9;line([[0,y],[1920,y]],rgb(tone,.06+i*.008),1);}
 }
 function domestic(t,variant='phone'){
  wash('#213747','#091520');
  const shift=-65*p(t,4.7,2.6);
  ctx.save();ctx.translate(shift,0);
  // 完整公寓空间：远处墙面、两侧落地窗和近处木地板有不同的透视尺度。
  poly([[455,110],[1485,110],[1485,655],[455,655]],'#2e4552');
  poly([[-100,-80],[455,110],[455,655],[-100,910]],'#132a3c');
  poly([[1485,110],[2050,-80],[2050,910],[1485,655]],'#26383e');
  line([[-100,-80],[455,110],[1485,110],[2050,-80]],'#78928c',4);
  line([[455,110],[455,655],[1485,655],[1485,110]],'rgba(170,188,174,.32)',3);
  for(let i=0;i<5;i++)line([[495+i*236,125],[495+i*236,641]],'rgba(142,161,159,.13)',2);
  for(const side of[-1,1]){
   const q=side<0?[[15,70],[405,181],[405,614],[15,804]]:[[1538,181],[1905,70],[1905,804],[1538,614]];
   poly(q,'#0d2335');ctx.save();ctx.beginPath();q.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();
   const left=side<0?0:1500;glow(left+200,310,400,450,'96,152,175',.40);
   for(let i=0;i<8;i++){const x=left+i*64,h=125+(i*53)%210;ctx.fillStyle=i%2?'#294651':'#1b3546';ctx.fillRect(x,665-h,52,h+180);for(let j=0;j<5;j++){ctx.fillStyle=j%3?'#7d9492':'#b6a77e';ctx.globalAlpha=.24+(i+j)%3*.09;ctx.fillRect(x+12,685-h+j*35,8,12);}}ctx.globalAlpha=1;
   for(let j=0;j<3;j++)line([[left+40+j*150,60],[left+40+j*150,850]],'#6d8587',8);
   line([[left,397],[left+450,397]],'#68818a',7);ctx.restore();line([...q,q[0]],'#82938b',5);
  }
  const wood=ctx.createLinearGradient(0,650,0,1060);wood.addColorStop(0,'#36484b');wood.addColorStop(1,'#091721');poly([[-100,910],[455,655],[1485,655],[2050,910],[2050,1080],[-100,1080]],wood);
  for(let i=-5;i<=5;i++)line([[960+i*108,655],[960+i*520,1080]],'rgba(166,160,129,.26)',2);
  for(const y of[695,754,840,970])line([[-100,y],[2050,y]],'rgba(139,154,147,.16)',2);
  ctx.save();ctx.filter='blur(8px)';poly([[15,804],[405,614],[860,847],[370,970]],'rgba(135,187,204,.23)');poly([[1538,614],[1905,804],[1500,970],[1100,847]],'rgba(219,180,111,.20)');ctx.restore();
  glow(960,330,570,490,'128,161,164',.12);ctx.restore();atmospheric(t,.65);
 }
 function abstractSpace(t,stage){
  wash('#203342','#081421');
  const turn=p(t,20.6,4.2),center=lerp(960,1250,turn);
  // 半圆展厅的大拱廊与台阶承担空间轮廓，暖光从拱后进入。
  for(let i=-2;i<=2;i++){
   const x=center+i*510,top=85+Math.abs(i)*37,w=355,h=620-top;
   ctx.beginPath();ctx.moveTo(x-w/2,655);ctx.lineTo(x-w/2,top+150);ctx.bezierCurveTo(x-w/2,top-28,x+w/2,top-28,x+w/2,top+150);ctx.lineTo(x+w/2,655);ctx.closePath();
   const g=ctx.createLinearGradient(x-w/2,top,x+w/2,640);g.addColorStop(0,'#112434');g.addColorStop(.55,i===0?'#50615c':'#2d4652');g.addColorStop(1,'#0e2637');ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='rgba(160,177,166,.34)';ctx.lineWidth=12;ctx.stroke();
   line([[x-w/2-26,top+170],[x-w/2-26,674]],'rgba(111,145,151,.42)',14);
  }
  const ground=ctx.createLinearGradient(0,635,0,980);ground.addColorStop(0,'#2d454e');ground.addColorStop(1,'#07131e');ctx.fillStyle=ground;ctx.fillRect(0,655,1920,425);
  for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(center,630,610+i*270,90+i*65,0,0,Math.PI);ctx.strokeStyle=i%2?'#52666a':'#344e58';ctx.lineWidth=18-i*3;ctx.stroke();ctx.strokeStyle='rgba(191,175,132,.30)';ctx.lineWidth=1.7;ctx.stroke();}
  ctx.save();ctx.filter='blur(18px)';poly([[center-110,100],[center+100,100],[center+465,830],[center-430,830]],'rgba(207,183,124,.12)');ctx.restore();
  glow(center,420,700,650,'180,158,107',.16);
  if(stage==='costs')for(let i=0;i<3;i++){const pos=interpolate(t,OBJECT_KEYS[['money','clock','bouquet'][i]]);glow(pos[0],750,290,95,i===1?'125,183,202':'196,164,107',.25*p(t,[7.28,8.95,9.65][i],.7));}
  atmospheric(t,.65);
 }
 function pulling(t){
  wash('#1a2b3e','#07121e');
  const u=clamp((t-1.82)/2.63),travel=1960*(.45*u+.55*u*u);
  glow(1410,420,920,680,'88,139,168',.30);
  // 远侧连续拱廊慢移，近柱与地面快速掠过，强化被向前牵引的速度。
  for(let i=-3;i<10;i++){
   const x=i*400-travel*.25;ctx.fillStyle='#102538';ctx.fillRect(x,70,310,645);
   ctx.beginPath();ctx.moveTo(x,715);ctx.lineTo(x,260);ctx.bezierCurveTo(x,75,x+310,75,x+310,260);ctx.lineTo(x+310,715);ctx.strokeStyle='rgba(111,148,166,.38)';ctx.lineWidth=18;ctx.stroke();
  }
  for(let i=-2;i<8;i++){const x=i*575-travel*.48;poly([[x,0],[x+80,0],[x+110,760],[x-18,760]],'#1d3546');line([[x+80,0],[x+110,760]],'#617b87',5);}
  const g=ctx.createLinearGradient(0,735,0,1000);g.addColorStop(0,'#38505b');g.addColorStop(1,'#091521');ctx.fillStyle=g;ctx.fillRect(0,735,1920,345);
  for(let i=0;i<13;i++){const x=((i*260-travel*.95)%3380+3380)%3380-550;line([[x,735],[x-285,1000]],'rgba(153,179,181,.43)',3);}
  for(const y of[758,812,913])line([[0,y],[1920,y]],'rgba(192,167,113,.28)',3);
  glow(1300,755,640,140,'191,159,102',.22);atmospheric(t,.45,travel*.3);
 }
 function cinemaBackground(t){
  wash('#101c29','#050c15');
  camera('cinema-camera',.48,()=>{
   glow(410,420,1020,660,'109,148,178',.24+.015*Math.sin(t*5));
   // 侧墙的吸音板、台阶和出口侧光延伸到原影院场景之外。
   for(let i=-2;i<9;i++){const x=i*255;poly([[x,15],[x+160,15],[x+194,760],[x+5,760]],i%2?'#0d1d2a':'#11232e');line([[x+164,20],[x+194,760]],'rgba(98,128,149,.14)',2);}
   floor(727,510,'84,112,137');
   for(let i=0;i<5;i++){const y=735+i*i*12;line([[0,y],[1920,y-70]],'rgba(193,165,115,.14)',2);}
   glow(1750,635,280,500,'179,153,103',.14*p(t,22.55,1));
  });
 }
 function readingBackground(t){
  wash('#14242d','#07111a');
  camera('future-camera',.65,()=>{
   glow(1500,480,780,670,'182,152,102',.18);glow(380,220,750,650,'84,124,146',.18);
   ctx.fillStyle='rgba(93,124,132,.08)';ctx.fillRect(125,80,102,580);
   for(let i=0;i<4;i++)line([[70,220+i*102],[300,220+i*102]],'rgba(154,160,145,.14)',2);
   line([[330,40],[330,694]],'rgba(152,157,140,.13)',2);floor(706,1040,'116,134,131',true);
   glow(1430,735,520,150,'198,163,104',.16);
  });
 }
 function relationshipBackground(t){
  domestic(0,'relationship');
  const closing=p(t,23.7,1.7),hall=p(t,13.28,.62)*(1-p(t,18.96,.62));
  const focus=1-p(t,19.05,2.1)*.65;
  layer(p(t,5,1),()=>{wash('#1e303d','#08121c');glow(500,260,850,640,'135,143,143',.30*focus);glow(1560,480,650,630,'179,147,96',(.22+.09*hall)*focus);floor(729,1070,'115,141,151',true);});
  layer(p(t,19,.9),()=>abstractSpace(t,'ending'));
  if(closing>0)glow(1170,472,790,470,'154,171,176',.17*closing);
 }
 function finish(){
  const edge=ctx.createRadialGradient(960,465,350,960,465,1160);edge.addColorStop(0,'rgba(1,6,12,0)');edge.addColorStop(1,`rgba(1,6,12,${OPT.edgeDark})`);ctx.fillStyle=edge;ctx.fillRect(0,0,1920,1080);
  const shade=ctx.createLinearGradient(0,OPT.captionY,0,1000);shade.addColorStop(0,'rgba(3,10,17,0)');shade.addColorStop(1,'rgba(3,10,17,.96)');ctx.fillStyle=shade;ctx.fillRect(0,OPT.captionY,1920,1080-OPT.captionY);
 }
 // 环境材质放进对应世界坐标层，自动跟随该场景原镜头，不覆盖人物与道具。
 const surfaces=[];
 function decorate(which,prefix=''){
  const world=document.getElementById(prefix+'world');if(!world)return;
  const defs=el('defs',{'data-background-layer':'material'},world),id=prefix+'env-';
  function gradient(name,stops,radial=false){const g=el(radial?'radialGradient':'linearGradient',{id:id+name,...(radial?{cx:'.5',cy:'.5',r:'.5'}:{x1:'0',y1:'0',x2:'.8',y2:'1'})},defs);stops.forEach(([at,color,alpha=1])=>el('stop',{offset:at,'stop-color':color,'stop-opacity':alpha},g));return 'url(#'+id+name+')';}
  const wall=gradient('wall',[[0,'#304754'],[.42,'#172e3d'],[1,'#091823']]);
  const floorFill=gradient('floor',[[0,'#34474c'],[.45,'#1a303b'],[1,'#081522']]);
  const light=gradient('light',[[0,'#d6c297',.19],[.5,'#a6bdc2',.045],[1,'#a6bdc2',0]],true);
  const windowFill=gradient('window',[[0,'#203d51'],[.5,'#0a1c2d'],[1,'#30414a']]);
  const curtain=gradient('curtain',[[0,'#142a39'],[.3,'#49636b'],[.55,'#223e4c'],[1,'#0d2331']]);
  const ambience=gradient('ambience',[[0,'#36515f',.65],[.55,'#223b4b',.30],[1,'#142936',0]],true);
  const q=selector=>world.querySelector(selector.replaceAll('@',prefix));
  const added=(parent,name)=>{const g=el('g',{'data-background-layer':name},parent);return g;};
  function behind(parent,name){const g=added(parent,name);parent.insertBefore(g,parent.firstChild);return g;}
  function path(parent,d,fill,stroke=null,width=1,opacity=1){return el('path',{d,fill,...(stroke?{stroke,'stroke-width':width}:{}),...(fill===beam||fill===coolBeam?{filter:'url(#'+id+'soft-light)'}:{}),opacity},parent);}
  function hide(e){change(e,{style:(e.getAttribute('style')||'')+';opacity:0!important'});}
  const warmWall=gradient('warm-wall',[[0,'#746657'],[.40,'#4a4947'],[1,'#1b303b']]);
  const theaterWall=gradient('theater-wall',[[0,'#473844'],[.44,'#283d50'],[1,'#112838']]);
  const timber=gradient('timber',[[0,'#76644e'],[.45,'#514d45'],[1,'#1a2b36']]);
  const beam=gradient('beam',[[0,'#efd6a3',.48],[.50,'#d4c1a0',.18],[1,'#b6c4bb',0]]);
  const coolBeam=gradient('cool-beam',[[0,'#c8e3e6',.35],[.55,'#8dc0cc',.13],[1,'#8dc0cc',0]]);
  const soft=el('filter',{id:id+'soft-light',x:'-40%',y:'-40%',width:'180%',height:'180%'},defs);el('feGaussianBlur',{stdDeviation:10},soft);
  const woodFloor=gradient('wood-floor',[[0,'#675b4c'],[.45,'#384044'],[1,'#0a1824']]);
  const stoneFloor=gradient('stone-floor',[[0,'#334d5d'],[.45,'#1c3343'],[1,'#091824']]);
  for(const name of['wood-floor','stone-floor']){const g=document.getElementById(id+name);g.setAttribute('gradientUnits','userSpaceOnUse');g.setAttribute('x1','0');g.setAttribute('x2','0');g.setAttribute('y1','780');g.setAttribute('y2','1200');}
  function closingMask(group,name){
   const falloff=gradient(name+'-falloff',[[0,'#fff'],[.64,'#fff'],[1,'#fff',0]],true);
   const mask=el('mask',{id:id+name,'maskUnits':'userSpaceOnUse',x:-1200,y:-800,width:4600,height:2800},defs);
   const full=el('rect',{x:-1200,y:-800,width:4600,height:2800,fill:'#fff'},mask);
   el('ellipse',{cx:1050,cy:500,rx:1010,ry:605,fill:falloff},mask);
   group.setAttribute('mask','url(#'+id+name+')');surfaces.push({kind:'closing-mask',prefix,full});
  }
  function roomFloor(parent,y,vanX=950,warm=false){
   path(parent,`M-850 ${y}H2800V1470H-850Z`,warm?woodFloor:stoneFloor);
   for(let i=-6;i<=7;i++)path(parent,`M${vanX+i*145} ${y}L${vanX+i*570} 1470`,'none',warm?'#9d947b':'#688695',2,.36);
   for(const yy of[y+36,y+91,y+177,y+302,y+485])path(parent,`M-850 ${yy}H2800`,'none',warm?'#b1a48a':'#81999f',2,.26);
  }
  function city(parent,x,y,w,h){
   el('rect',{x,y,width:w,height:h,fill:windowFill},parent);
   const sky=el('g',{},parent);el('circle',{cx:x+w*.77,cy:y+h*.22,r:30,fill:'#e2d2ad',opacity:'.75'},sky);
   for(let depth=0;depth<2;depth++)for(let i=0;i<12;i++){
    const bw=w/12.6,bx=x+i*w/12+(depth?10:0),bh=h*(.23+(i*7%9)*.035)+(depth?18:0),by=y+h-bh;
    el('rect',{x:bx,y:by,width:bw,height:bh,fill:depth?'#284d60':'#34556a'},parent);
    for(let j=0;j<4;j++)for(let k=0;k<2;k++)if((i+j+k+depth)%4)el('rect',{x:bx+8+k*bw*.48,y:by+13+j*25,width:7,height:10,fill:(i+j)%3?'#abc6c2':'#e0bd7e',opacity:depth?'.62':'.30'},parent);
   }
   const clouds=el('g',{opacity:'.14'},sky);path(clouds,`M${x+20} ${y+130}Q${x+w*.35} ${y+70} ${x+w*.74} ${y+145}L${x+w*.84} ${y+162}Q${x+w*.40} ${y+125} ${x+20} ${y+150}Z`,'#b5c9cc');
   for(let i=0;i<=3;i++)path(parent,`M${x+i*w/3} ${y}V${y+h}`,'none','#879c98',9,.75);
   path(parent,`M${x} ${y+h*.57}H${x+w}`,'none','#768d92',8,.8);
   el('rect',{x,y,width:w,height:h,fill:'none',stroke:'#a0aa99','stroke-width':11},parent);
   return clouds;
  }
  if(which===3){
   const cine=q('#@cinema-camera');
   if(cine){
    hide(q('#@cinema-wall'));
    for(const e of [...cine.children])if(e.tagName==='path'&&(e.getAttribute('d')==='M-180 674L1720 585 2140 1060H-180Z'||e.getAttribute('stroke')==='#536f75'))hide(e);
    const back=behind(cine,'影院完整环境');
    path(back,'M-900-600H3200V1470H-900Z',theaterWall);
    path(back,'M-900-600H3200L2010 70 10 70Z','#0c1c2c');
    // 深红幕帘和大幅墙面分区在正常尺寸可见，不依赖细小纹理。
    for(const x of[-90,860,1880]){
     path(back,`M${x}-120H${x+130}V675H${x}Z`,'#42323d');
     for(let j=0;j<5;j++)path(back,`M${x+12+j*25}-120Q${x-5+j*25} 250 ${x+15+j*25} 675`,'none',j%2?'#74606a':'#291f2e',12,.60);
    }
    for(const x of[1050,1370,1740]){
     path(back,`M${x} 90H${x+210}V520H${x}Z`,'#1c3445','#536676',3,.85);
     for(let j=0;j<8;j++)path(back,`M${x+18+j*25} 104V505`,'none','#78929b',2,.14);
    }
    for(let i=0;i<5;i++){
     const x=-270+i*610;path(back,`M${x}-180L${500+i*270} 75`,'none','#516777',18,.75);
     path(back,`M${x}-176L${500+i*270} 80`,'none','#b1ac91',2,.45);
    }
    roomFloor(back,667,510,false);
    for(let i=0;i<5;i++){const yy=682+i*i*15;path(back,`M-700 ${yy+48}L1900 ${yy-80}`,'none','#273d4b',22,.95);path(back,`M-700 ${yy+39}L1900 ${yy-89}`,'none','#ceb57c',3,.50);}
    const reflection=path(back,'M155 665L862 612 1585 1010 90 1010Z',coolBeam);
    const projectorBeam=path(back,'M1602 110L175 145 854 558Z',coolBeam,null,1,.80);
    const aisle=el('g',{},back);for(let i=0;i<5;i++)el('rect',{x:1790+i*28,y:690+i*42,width:60,height:7,rx:3,fill:'#e6c990',opacity:'.68'},aisle);
    surfaces.push({kind:'cinema',prefix,reflection,projectorBeam});
   }
   const future=q('#@future-camera');
   if(future){
    hide(q('#@night-window'));
    const back=behind(future,'阅读完整房间');
    path(back,'M-850-600H2800V1470H-850Z',warmWall);
    path(back,'M-850-600H2800L1960 60 130 60Z','#20333e');
    for(const x of[125,1920])path(back,`M${x}-300V820`,'none','#b7ac91',9,.48);
    roomFloor(back,815,1090,true);
    // 左侧嵌入式书架，右侧整面窗景；保留桌上原灯、书、杯子和人物。
    const shelf=el('g',{},back);
    el('rect',{x:150,y:132,width:410,height:536,fill:'#20323c',stroke:'#8d8067','stroke-width':14},shelf);
    for(let row=0;row<4;row++){
     const yy=245+row*129;path(shelf,`M150 ${yy}H560`,'none','#a18c68',10,.85);
     for(let k=0;k<11;k++){const hh=54+(k*17+row*13)%43;el('rect',{x:172+k*33,y:yy-hh-6,width:24,height:hh,fill:['#778581','#9a8061','#526f7a','#b3a07c'][(k+row)%4],opacity:'.85'},shelf);path(shelf,`M${179+k*33} ${yy-hh+6}V${yy-15}`,'none','#c2ba9a',2,.38);}
    }
    const clouds=city(back,1170,65,650,520);
    path(back,'M1170 585H1820L2140 1050 850 1050Z',coolBeam,null,1,.75);
    const warm=el('ellipse',{cx:1440,cy:650,rx:650,ry:490,fill:light},back);
    surfaces.push({kind:'reading',prefix,warm,clouds});
   }
  }
  if(which===4){
   const room=q('#@room-camera'),windowWall=q('#@living-window');
   if(room&&windowWall){
    hide(windowWall);
    for(const e of [...room.children])if(e.tagName==='path'&&(e.getAttribute('d')==='M140 760L1700 650 1870 865H80Z'||e.getAttribute('stroke')==='#547079'))hide(e);
    const back=behind(room,'餐桌完整房间');
    closingMask(back,'room-closing-mask');
    path(back,'M-1000-700H3000V1600H-1000Z',warmWall);
    path(back,'M-1000-700H3000L1760 40 180 40Z','#273a44');
    path(back,'M180 40H1760','none','#c2b494',9,.55);
    for(const x of[185,1735])path(back,`M${x} 40V820`,'none','#a3967b',8,.58);
    roomFloor(back,800,1030,true);
    const newWindow=el('g',{},back),clouds=city(newWindow,335,115,1250,460);
    path(back,'M335 575H1585L1860 1110 90 1110Z',coolBeam,null,1,.75);
    const curtains=[];
    for(const left of[true,false]){
     const x=left?282:1475,g=el('g',{},newWindow);curtains.push(g);
     path(g,`M${x} 98H${x+165}Q${x+107} 355 ${x+144} 614H${x+12}Z`,timber,'#ad9d7d',3);
     for(let j=0;j<5;j++)path(g,`M${x+18+j*28} 104Q${x+10+j*23} 358 ${x+22+j*24} 604`,'none',j%2?'#c4b292':'#534f49',8,.38);
    }
    for(const x of[108,1812]){
     path(back,`M${x} 190V270`,'none','#b9ad8a',6,.9);el('circle',{cx:x,cy:290,r:25,fill:'#e0c28b',stroke:'#917d5c','stroke-width':5},back);
     el('ellipse',{cx:x,cy:340,rx:210,ry:330,fill:light,opacity:'.95'},back);
    }
    surfaces.push({kind:'conversation',prefix,clouds,newWindow,oldWindow:windowWall,curtains,oldCurtains:[...windowWall.querySelectorAll('path')].filter(e=>e.getAttribute('fill')==='#29424b')});
   }
   const hall=q('#@hall-camera');
   if(hall){
    for(const e of [...hall.children])if(e.tagName==='path'&&['M240 145H1680V817H240Z','M240 817H1680L1850 890H120Z'].includes(e.getAttribute('d')))hide(e);
    const back=behind(hall,'玄关完整房间');
    closingMask(back,'hall-closing-mask');
    path(back,'M-900-600H2900V1500H-900Z',warmWall);
    path(back,'M-900-600H2900L1680 145 240 145Z','#293c47');
    path(back,'M-900 145H2900','none','#c2b194',12,.64);
    // 半墙护板、灯光和横纵相交的地板替换原本的大块单色墙。
    path(back,'M-900 510H2900V817H-900Z','#223a45');
    path(back,'M-900 510H2900','none','#a8997f',12,.75);
    for(let i=-2;i<12;i++){const x=i*255;path(back,`M${x} 540H${x+198}V785H${x}Z`,'#2d4650','#5d7277',3,.72);}
    roomFloor(back,817,1110,true);
    for(const x of[575,1330]){
     el('ellipse',{cx:x,cy:285,rx:230,ry:270,fill:light,opacity:'.95'},back);
     path(back,`M${x} 185V255`,'none','#b1a082',7);path(back,`M${x-32} 245H${x+32}L${x+48} 293H${x-48}Z`,'#c9ae7f','#9b8d70',3);
    }
    path(back,'M1430 815H1640L1950 1230 600 1230Z',beam,null,1,.90);
    path(back,'M1410 150L1394 817','none','#d2bd93',7,.7);
   }
  }
 }
 decorate(act);if(act>1)decorate(act-1,'prev-');
 function renderBackground(){
  const t=act<3?playhead.time:tick.t;
  ctx.globalAlpha=1;ctx.setTransform(1,0,0,1,0,0);
  let state;
  if(act===1){
   domestic(t);const costs=p(t,7.0,.9),concept=p(t,14.1,1),choice=p(t,20.65,1);
   layer(costs,()=>abstractSpace(t,'costs'));layer(concept,()=>abstractSpace(t,t<20.65?'concept':'choice'));state=t<7?'室内手机':t<14.1?'投入物件':t<20.65?'概念空间':'下一次选择';
  }else if(act===2){drawHangar(t);state=t<12.5?'研发与竞争':t<28.5?'两组实验':'结果同框';}
  else if(act===3){
   pulling(t);const cinemaIn=p(t,6.75,1),readIn=p(t,25.6,1.2);
   layer(cinemaIn,()=>cinemaBackground(t));layer(readIn,()=>readingBackground(t));state=t<6.75?'牵引通道':t<25.6?'电影院':'阅读房间';
  }else{
   relationshipBackground(t);state=t<5?'回到关系':t<13.3?'餐桌与沟通':t<19?'玄关失约':t<24?'三年投入':'下一年与问号';
  }
  if(act!==2)finish();
  for(const s of surfaces){const time=s.prefix?31.9666667:t;
   if(s.kind==='cinema'){s.reflection.setAttribute('opacity',String(.78+.09*Math.sin(time*5)));s.projectorBeam.setAttribute('opacity',String(.70+.06*Math.sin(time*5)));}
   if(s.kind==='reading'){s.warm.setAttribute('opacity',String(.85+.035*Math.sin(time*.6)));s.clouds.setAttribute('transform','translate('+18*Math.sin(time*.12)+' 0)');}
   if(s.kind==='conversation'){s.newWindow.setAttribute('opacity',s.oldWindow.getAttribute('opacity')||'1');s.clouds.setAttribute('transform','translate('+16*Math.sin(time*.10)+' 0)');s.curtains.forEach((g,i)=>g.setAttribute('transform',s.oldCurtains[i]?.getAttribute('transform')||''));}
   if(s.kind==='closing-mask')s.full.setAttribute('opacity',String(1-p(time,23.7,1.7)));
  }
  const bridgeImage=document.getElementById('background-bridge'),bridge=document.getElementById('bridge');
  // 背景末帧持续覆盖全幅再淡出；不能跟前景缩成小矩形，露出画布边缘。
  if(bridgeImage&&bridge){bridgeImage.style.opacity=bridge.style.opacity;bridgeImage.style.transform='none';}
  window.__backgroundState={act,t,scene:state,bridgeOpacity:bridgeImage?.style.opacity||'0'};
 }
 const previous=tl.eventCallback('onUpdate');
 tl.eventCallback('onUpdate',()=>{if(previous)previous();renderBackground();});
 renderBackground();
})();
