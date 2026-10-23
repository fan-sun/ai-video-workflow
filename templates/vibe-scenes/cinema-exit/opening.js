// 用途：过去投入在前，以绳子牵动后方人物，并从同一票据接入影院。
// 运行：由同目录motion.js按绝对秒数调用drawOpening。
// 依赖：scene.js的SVG构建器与人物材质；不引入独立时间轴。
const PULL={personX:560,groundY:794,travel:1960,costX:1230,costY:635,costTravel:105,
 tightenAt:1.38,tightenFor:.28,reachAt:1.53,reachFor:.22,leanAt:1.64,leanFor:.25,
 runAt:1.82,runFor:2.63,stride:440,stance:.42,ticketAt:4.45,ticketFor:.85};
const pullStage=byId('pull-stage'),pullCamera=group(pullStage,'pull-camera');
const memories=group(pullCamera,'passing-memories');
const ground=group(pullCamera,'rushing-ground');
const groundLines=[];for(let i=0;i<18;i++)groundLines.push(node('path',{fill:'none',stroke:i%3?'#527987':'#c0b685','stroke-width':i%3?2:3,opacity:i%3?.25:.38},ground));
const pullHalo=node('ellipse',{cx:950,cy:545,rx:625,ry:305,fill:'url(#halo)'},pullCamera);
const speedLines=[];for(let i=0;i<13;i++)speedLines.push(node('path',{fill:'none',stroke:i%3?'#7798a2':'#dac895','stroke-width':i%3?2:3,'stroke-linecap':'round'},pullCamera));
const costBundle=group(pullCamera,'past-cost-bundle');
node('ellipse',{cx:20,cy:39,rx:214,ry:29,fill:'#020f16',opacity:.55,filter:'url(#shadow)'},costBundle);
const receipts=[];
for(let i=0;i<2;i++){
 const g=group(costBundle,'cost-receipt-'+i);
 node('path',{d:'M-66-228H94V-12L80-20 66-12 52-20 38-12 24-20 10-12-4-20-18-12-32-20-46-12-66-20Z',fill:'url(#paper)',stroke:'#a3b5ac','stroke-width':2},g);
 for(let j=0;j<4;j++)node('path',{d:`M-41 ${-196+j*22}H${j%2?36:65}`,stroke:'#7c968e','stroke-width':3},g);
 label(g,'已付',13,-63,'paper-text');receipts.push(g);
}
const pullCoins=[];
for(let i=0;i<3;i++){
 const g=group(costBundle,'pull-coin-'+i);
 node('path',{d:'M-58 0V13Q0 44 58 13V0Z',fill:'#886233'},g);
 node('ellipse',{rx:58,ry:25,fill:'url(#gold)',stroke:'#edd49b','stroke-width':2},g);
 node('ellipse',{rx:43,ry:17,fill:'none',stroke:'#9c7440','stroke-width':2},g);pullCoins.push(g);
}
const costLabel=label(pullCamera,'过去的投入',1325,270,'tag');
const pullRope=group(pullCamera,'pull-rope');
const ropeShadow=node('path',{fill:'none',stroke:'#09191c','stroke-width':10,'stroke-linecap':'round',opacity:.5},pullRope);
const rope=node('path',{fill:'none',stroke:'#e2c48a','stroke-width':5,'stroke-linecap':'round'},pullRope);
const ropeLight=node('path',{fill:'none',stroke:'#f7deb0','stroke-width':1.4,'stroke-linecap':'round',opacity:.65},pullRope);
const knot=node('ellipse',{rx:10,ry:17,fill:'none',stroke:'#e2c48a','stroke-width':4},pullRope);
const pulled=person(pullCamera,'pulled-person');set(pulled.head,{href:'#head-right'});
const grip=node('path',{d:'M-10-4Q0-11 10-5',fill:'none',stroke:'#977755','stroke-width':2.5,'stroke-linecap':'round'},pulled.g);
const nowLabel=label(pullCamera,'现在的选择',585,864,'small');

function drawOpening(t){
 const enter=progress(t,.4,.8),exit=progress(t,4.53,.78),focus=progress(t,4.35,.95);
 const tight=progress(t,PULL.tightenAt,PULL.tightenFor);
 const reach=progress(t,PULL.reachAt,PULL.reachFor),lean=progress(t,PULL.leanAt,PULL.leanFor);
 const u=clamp((t-PULL.runAt)/PULL.runFor),run=progress(t,PULL.runAt,.23);
 const travel=PULL.travel*(.45*u+.55*u*u),personX=PULL.personX+travel,cycle=travel/PULL.stride;
 const phase=cycle*Math.PI*2,energy=run*(.3+.7*u);
 const foot=offset=>{const q=(cycle+offset)%1,flight=clamp((q-PULL.stance)/(1-PULL.stance)),span=PULL.stride*PULL.stance/2;return{x:q<PULL.stance?PULL.stride*(PULL.stance/2-q):mix(-span,span,smooth(flight)),lift:81*Math.sin(Math.PI*flight),planted:q<PULL.stance}};
 const front=foot(.5),back=foot(0),bob=-16*Math.abs(Math.sin(phase))*run;
 const frontX=mix(20,front.x,run),backX=mix(-57,back.x,run),frontY=-18-front.lift*run,backY=-18-back.lift*run;
 const hipY=-238+bob,shoulderX=9+65*lean+6*Math.sin(phase)*run,shoulderY=-379+21*lean+bob;
 const wx=102+75*reach+62*lean,wy=-258-58*reach+bob*.5;
 const elbowX=60+60*reach+60*lean,elbowY=-294-19*reach+bob*.6;
 show(pullStage,enter*(1-exit));
 const cameraScale=1+.075*energy+.06*focus,cameraAngle=(-2.1*energy+.2*Math.sin(phase)*run)*(1-focus);
 const cameraX=62*run-260*focus,cameraY=-26*energy-25*focus+28*(1-enter);
 set(pullCamera,{transform:`translate(${960+cameraX} ${450+cameraY}) rotate(${cameraAngle}) scale(${cameraScale}) translate(${-960-travel} -450)`});
 set(pullHalo,{cx:travel+955});
 const memory=drawMemories(t,travel);
 // 地面与近景碎光从前向后掠过，速度由真实行程控制；主线不随背景消失。
 groundLines.forEach((e,i)=>{const x=travel+(((i*223-travel*1.3)%2240)+2240)%2240-180,y=805+(i%3)*24;path(e,`M${x} ${y}L${x+65+energy*150} ${y-4}`);show(e,.18+energy*.22)});
 speedLines.forEach((e,i)=>{const x=travel+(((i*193-travel*1.7)%2100)+2100)%2100-210,y=i<7?300+i*55:812+(i-7)*6;path(e,`M${x} ${y}L${x+70+energy*210} ${y-7*energy}`);show(e,energy*(i%3?.13:.24)*(1-focus))});
 move(pulled.g,personX,PULL.groundY);
 path(pulled.backLeg,`M16 ${hipY}Q${(backX+16)/2+27+back.lift*.6*run} ${-123+bob-back.lift*.42*run} ${backX} ${backY}`);
 path(pulled.frontLeg,`M-10 ${hipY}Q${(frontX-10)/2+37+front.lift*.6*run} ${-128+bob-front.lift*.42*run} ${frontX} ${frontY}`);
 for(const [e,x,y]of[[pulled.frontShoe,frontX,frontY],[pulled.backShoe,backX,backY]])path(e,`M${x-13} ${y-5}Q${x+35} ${y-4} ${x+49} ${y+17}H${x-19}Q${x-24} ${y+2} ${x-13} ${y-5}Z`);
 path(pulled.body,`M${shoulderX-33} ${shoulderY-7}Q${shoulderX} ${shoulderY-29} ${shoulderX+34} ${shoulderY-5}L34 ${hipY+16}Q0 ${hipY+28}-33 ${hipY+11}Z`);
 path(pulled.seam,`M${shoulderX+23} ${shoulderY+11}L25 ${hipY-3}`);
 move(pulled.head,shoulderX+4,shoulderY-49,.80,10*lean+2*Math.sin(phase)*run);
 show(pulled.armBack,0);show(pulled.backPalm,0);
 path(pulled.arm,`M${shoulderX+4} ${shoulderY+22}Q${elbowX} ${elbowY} ${wx} ${wy}`);set(pulled.arm,{'stroke-width':25});
 move(pulled.palm,wx,wy,1,66-14*reach);move(grip,wx,wy,1,66-14*reach);
 set(pulled.shadow,{rx:88+21*energy,opacity:.43});set(nowLabel,{x:personX});
 show(nowLabel,progress(t,.9,.25)*(1-progress(t,1.6,.2)));
 const bundleX=PULL.costX+travel+PULL.costTravel*progress(t,1.2,.7),bundleY=PULL.costY-20*energy+8*Math.sin(phase+.4)*run;
 move(costBundle,bundleX,bundleY);
 receipts.forEach((e,i)=>{const u=progress(t,.72+i*.22,.62);move(e,52+i*90,-25-i*20-48*(1-u),u,-14+i*27);show(e,u)});
 const weights=[];
 pullCoins.forEach((e,i)=>{const drop=progress(t,.88+i*.24,.35);weights.push(drop);move(e,-54,-18-i*21-(1-drop)*137,1,0);show(e,progress(t,.86+i*.24,.12))});
 set(costLabel,{x:bundleX+30});show(costLabel,progress(t,1.1,.35));
 const hand=[personX+wx+8,PULL.groundY+wy],anchor=[bundleX-104,bundleY-134];
 const slack=135*(1-tight)+3,dx=anchor[0]-hand[0];
 const wave=Math.sin((t-1.64)*29)*14*Math.exp(-Math.max(0,t-1.64)*7)*tight+2.5*Math.sin(phase)*run;
 const ropeD=`M${hand[0]} ${hand[1]}C${hand[0]+dx*.3} ${hand[1]+slack+wave} ${anchor[0]-dx*.25} ${anchor[1]+slack-wave} ${anchor[0]} ${anchor[1]}`;
 path(rope,ropeD);path(ropeShadow,ropeD);path(ropeLight,ropeD);set(ropeLight,{transform:'translate(0 -1)'});move(knot,anchor[0],anchor[1],1,-20);
 show(pullRope,progress(t,.98,.45));
 const ticketRise=progress(t,PULL.ticketAt,PULL.ticketFor),a=cameraAngle*Math.PI/180;
 const lx=(bundleX+4-travel-960)*cameraScale,ly=(bundleY-162-450)*cameraScale;
 const ticketX=960+cameraX+lx*Math.cos(a)-ly*Math.sin(a),ticketY=450+cameraY+lx*Math.sin(a)+ly*Math.cos(a);
 const ticket={x:mix(ticketX,960,ticketRise),y:mix(ticketY,442,ticketRise),scale:mix(.49*cameraScale,1.09,ticketRise),rotation:mix(-10+cameraAngle,-5,ticketRise)};
 return{tight,reach,lean,run,travel,slack,weights,hand,anchor,cycle,step_contacts:Math.floor(cycle*2),memory,energy,front_foot:[personX+frontX,PULL.groundY+frontY+17],back_foot:[personX+backX,PULL.groundY+backY+17],front_planted:front.planted,back_planted:back.planted,person_x:personX,far_arm_opacity:0,ticket};
}
