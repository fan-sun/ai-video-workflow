// 用途：展示本地动效怎样作用于可替换的图形；演示构图不作为成片模板。
// 使用：由预览页或示例合成调用drawDemo(context, id, progress, options)。
// 依赖：本地motion.js；画布按1920×1080绘制。
import * as M from '../../templates/vibe-motion/motion.js';
export const catalog = [
  {id:'travel',name:'路径推进',verb:'条件改变，去向随之改变',use:'流向、分支、绕行、抵达',params:'路径点列、进度；可并行组合多条分支'},
  {id:'morph',name:'形态重组',verb:'同一批对象，形成新的关系',use:'聚合、分离、结构形成',params:'起终点坐标、错峰幅度、移动弧度'},
  {id:'contact',name:'接触响应',verb:'先碰到，再压缩、回弹、落定',use:'投放、落下、触发、受力',params:'下落距离、回弹幅度、接触时刻'},
  {id:'camera',name:'空间推进',verb:'进入局部，看见内部发生的事',use:'局部与整体、内部机制、观看范围',params:'观看中心、尺度、旋转角度'},
  {id:'reflow',name:'分组重排',verb:'对象保留身份，条件决定去留',use:'筛选、群体差异、重新分组',params:'对象坐标、目标位置、保留条件'},
  {id:'scan',name:'扫描显现',verb:'边界经过，状态逐步显现',use:'隐藏结构、材质变化、状态揭示',params:'主体矩形、显现进度；绘制内容可替换'},
  {id:'focus',name:'焦点交接',verb:'先看问题，再把注意交给结果',use:'主次转换、注意范围、关键对象',params:'焦点起终点、半径'},
  {id:'burst',name:'冲击扩散',verb:'变化由触发点传向周围',use:'冲击、释放、转折瞬间的强调',params:'触发点、粒子数量、半径、种子'},
];
const TAU=Math.PI*2,ink='#f5efdf',muted='#93adb8';
const span=(p,a,b)=>M.clamp((p-a)/(b-a));
function line(c,points,color,width=4){c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
function circle(c,x,y,r,color){c.beginPath();c.arc(x,y,Math.max(0,r),0,TAU);c.fillStyle=color;c.fill();}
function text(c,value,x,y,size=64,color=ink,align='center'){c.fillStyle=color;c.font=`700 ${size}px Vibe, sans-serif`;c.textAlign=align;c.textBaseline='middle';c.fillText(value,x,y);}
function ring(c,x,y,r,color,width=3){c.beginPath();c.arc(x,y,r,0,TAU);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function object(c,x,y,r,accent,shape='circle'){
  c.save();c.translate(x,y);
  c.shadowColor=accent;c.shadowBlur=25;
  const g=c.createLinearGradient(-r,-r,r,r);g.addColorStop(0,ink);g.addColorStop(.18,accent);g.addColorStop(1,'#183448');
  c.fillStyle=g;c.strokeStyle=accent;c.lineWidth=3;c.beginPath();
  if(shape==='circle')c.arc(0,0,r,0,TAU);
  else if(shape==='square')c.roundRect(-r,-r,r*2,r*2,r*.2);
  else{c.moveTo(0,-r);c.lineTo(r,0);c.lineTo(0,r);c.lineTo(-r,0);c.closePath();}
  c.fill();c.shadowBlur=0;c.stroke();c.restore();
}
function background(c){
  c.clearRect(0,0,1920,1080);c.fillStyle='#0b1d29';c.fillRect(0,0,1920,1080);
  const g=c.createRadialGradient(960,440,0,960,440,1000);g.addColorStop(0,'#1b3b4b');g.addColorStop(1,'#0b1d29');c.fillStyle=g;c.fillRect(0,0,1920,1080);
  c.save();c.globalAlpha=.22;
  for(let y=300;y<=850;y+=110)line(c,[{x:120,y},{x:1800,y}],'#406372',1);
  c.restore();
}
function particles(c,p,origin,accent,radius,count=70){
  for(const v of M.burst(origin,p,{radius,count})){c.globalAlpha=v.opacity;c.fillStyle=accent;c.fillRect(v.x,v.y,v.size*2,v.size);}
  c.globalAlpha=1;
}
function pathDemo(c,p,o){
  const branch=[{x:280,y:530},{x:740,y:530}],up=[{x:740,y:530},{x:970,y:330},{x:1360,y:330},{x:1630,y:430}],down=[{x:740,y:530},{x:970,y:730},{x:1360,y:730},{x:1630,y:630}];
  const grow=M.travel(branch,span(p,0,.27));line(c,grow.visible,o.accent,10);
  object(c,280,530,70,o.accent,o.shape);text(c,'起点',280,710);
  if(p>.23){
    const a=M.ease(span(p,.23,.38));c.globalAlpha=a;
    c.fillStyle='#10232e';c.fillRect(1100,415,240,220);ring(c,1220,525,115,'#607e88',5);
    text(c,'条件',1220,525,64,muted);c.globalAlpha=1;
  }
  for(const [i,path] of [up,down].entries()){
    const q=span(p,.27,.86);line(c,M.travel(path,q).visible,i?'#77c5c0':o.accent,9);
    for(let n=0;n<5;n++){
      const t=span(p-.025*n,.27,.86),point=M.travel(path,t).point;
      if(p>.27){c.globalAlpha=(1-n/6)*(1-M.ease(span(p,.9,1)));circle(c,point.x,point.y,15-n*2,ink);}
    }
    c.globalAlpha=1;
    if(q>.97){object(c,1630,i?630:430,48,i?'#77c5c0':o.accent,o.shape);}
  }
  if(p<.29)circle(c,grow.point.x,grow.point.y,18,ink);
}
function targetPoint(i,n,shape,radius=300){
  const a=TAU*i/n;
  if(shape==='circle')return {x:960+Math.cos(a)*radius,y:490+Math.sin(a)*radius};
  const r=radius/(Math.abs(Math.cos(a))+Math.abs(Math.sin(a)));
  if(shape==='diamond')return {x:960+Math.cos(a)*r,y:490+Math.sin(a)*r};
  const k=radius/Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a)));
  return {x:960+Math.cos(a)*k,y:490+Math.sin(a)*k};
}
function morphDemo(c,p,o){
  const n=64,from=Array.from({length:n},(_,i)=>({x:715+(i%8)*70,y:245+Math.floor(i/8)*70})),to=from.map((_,i)=>targetPoint(i,n,o.shape));
  const q=span(p,.12,.88),points=M.morph(from,to,q,{stagger:.22,arc:120*o.strength});
  points.forEach((v,i)=>{c.globalAlpha=.15;line(c,[from[i],v],o.accent,1);c.globalAlpha=1;circle(c,v.x,v.y,6+i%3,o.accent);});
  if(p>.8){c.globalAlpha=M.ease(span(p,.8,1));text(c,o.label,960,490,94);c.globalAlpha=1;}
}
function contactDemo(c,p,o){
  const state=M.contact(p,{distance:440,bounce:145*o.strength});
  c.fillStyle='#193644';c.beginPath();c.ellipse(960,765,510,90,0,0,TAU);c.fill();
  c.save();c.translate(960,765);c.scale(1,.2);ring(c,0,0,190+state.shock*600,o.accent,3+state.shock*6);c.restore();
  c.save();c.translate(960,650+state.y);c.scale(state.scaleX,state.scaleY);object(c,0,0,115,o.accent,o.shape);c.restore();
  if(p>.42)particles(c,span(p,.42,.85),{x:960,y:760},o.accent,420*o.strength,52);
}
function cameraDemo(c,p,o){
  const pose=M.camera({x:960,y:500,scale:.58},{x:1760,y:500,scale:1.9*o.strength},span(p,.08,.87));
  c.save();c.translate(960,500);c.scale(pose.scale,pose.scale);c.translate(-pose.x,-pose.y);
  for(let i=0;i<9;i++)line(c,[{x:i*320,y:0},{x:i*320,y:1000}],'#365866',2);
  for(let i=0;i<4;i++){
    const x=260+i*440;c.strokeStyle=i===3?o.accent:'#507584';c.lineWidth=5;c.strokeRect(x,160,360,680);
    if(i!==3){object(c,x+180,500,85,'#466575',o.shape);continue;}
    for(let j=0;j<3;j++){
      const a=TAU*j/3+.65*p,point={x:x+180+Math.cos(a)*88,y:500+Math.sin(a)*88};
      line(c,[{x:x+180,y:500},point],o.accent,3);object(c,point.x,point.y,16,o.accent,o.shape);
    }
    object(c,x+180,500,32,o.accent,o.shape);
  }
  c.restore();
}
function reflowDemo(c,p,o){
  const n=30,from=Array.from({length:n},(_,i)=>({x:420+i%6*190,y:230+Math.floor(i/6)*125})),keep=from.map((_,i)=>i%3===0);
  let selected=0;const to=from.map((v,i)=>keep[i]?{x:1150+selected++%2*210,y:230+Math.floor((selected-1)/2)*125}:{x:v.x,y:1050});
  const q=span(p,.18,.86),points=M.reflow(from,to,keep,q,{arc:100*o.strength});
  points.forEach((v,i)=>{c.globalAlpha=v.opacity;object(c,v.x,v.y,31,keep[i]?o.accent:'#567581',o.shape);});c.globalAlpha=1;
  if(p>.5){c.globalAlpha=M.ease(span(p,.5,.78));text(c,'30 → 10',500,455,112,o.accent);text(c,'保留符合条件的',500,585,64);c.globalAlpha=1;}
}
function scanDemo(c,p,o){
  const rect={x:490,y:200,width:940,height:620};
  function assembly(solid){
    c.save();c.translate(960,510);
    for(let i=0;i<12;i++){
      c.save();c.rotate(TAU*i/12);c.strokeStyle='#7d9ca5';c.lineWidth=3;
      if(solid){c.fillStyle=i%2?o.accent:'#517986';c.shadowColor=o.accent;c.shadowBlur=12;c.fillRect(165,-38,150,76);}
      else c.strokeRect(165,-38,150,76);c.restore();
    }
    if(solid)object(c,0,0,140,o.accent,o.shape);else{ring(c,0,0,140,'#7d9ca5',3);ring(c,0,0,100,'#7d9ca5',2);}
    c.restore();
  }
  assembly(false);const reveal=M.scan(rect,span(p,.1,.9));c.save();c.beginPath();c.rect(rect.x,rect.y,reveal.width,rect.height);c.clip();assembly(true);c.restore();
  if(p>.1&&p<.9){const x=reveal.front;c.shadowColor=o.accent;c.shadowBlur=24;line(c,[{x,y:180},{x,y:840}],o.accent,7);c.shadowBlur=0;}
}
function focusDemo(c,p,o){
  const nodes=[{x:370,y:500,radius:210},{x:960,y:430,radius:230},{x:1550,y:550,radius:210}];
  const q=span(p,.1,.9),f=q<.5?M.focus(nodes[0],nodes[1],q*2):M.focus(nodes[1],nodes[2],(q-.5)*2);
  line(c,nodes,'#567985',5);nodes.forEach((n,i)=>{object(c,n.x,n.y,95,o.accent,o.shape);text(c,['问题','过程','结果'][i],n.x,n.y+180,64);});
  const g=c.createRadialGradient(f.x,f.y,f.radius*.4,f.x,f.y,f.radius*2.4);g.addColorStop(0,'#07172200');g.addColorStop(1,'#071722df');c.fillStyle=g;c.fillRect(0,0,1920,880);
  ring(c,f.x,f.y,f.radius,o.accent,4);circle(c,f.x,f.y-150,7,ink);
}
function burstDemo(c,p,o){
  const q=span(p,.15,.92),scale=1+.2*Math.sin(Math.PI*span(p,0,.22));
  c.save();c.translate(960,480);c.rotate(-.12*(1-M.ease(q)));c.scale(scale,scale);object(c,0,0,145,o.accent,o.shape);c.restore();
  if(p>.15){particles(c,q,{x:960,y:480},o.accent,670*o.strength,120);c.globalAlpha=(1-q)**2;ring(c,960,480,140+q*650,o.accent,8-6*q);c.globalAlpha=1;}
  if(p>.42){c.globalAlpha=M.ease(span(p,.42,.65));text(c,o.label,960,740,100);c.globalAlpha=1;}
}
const drawers={travel:pathDemo,morph:morphDemo,contact:contactDemo,camera:cameraDemo,reflow:reflowDemo,scan:scanDemo,focus:focusDemo,burst:burstDemo};
export function drawDemo(c,id,progress,options={}){
  const item=catalog.find(v=>v.id===id);if(!item)throw new Error('未知动效：'+id);
  const o={accent:'#e9bf74',shape:'diamond',label:'新状态',strength:1,...options};
  c.save();background(c);drawers[id](c,M.clamp(progress),o);
  const shade=c.createLinearGradient(0,840,0,1080);shade.addColorStop(0,'#0b1d2900');shade.addColorStop(.6,'#0b1d29');c.fillStyle=shade;c.fillRect(0,840,1920,240);
  text(c,item.verb.replace(/[，、]/g,''),960,955,80);c.restore();
}
