// 用途：第三幕32秒完整动画、人物动作和原文字幕。
// 运行：由HyperFrames控制唯一暂停时间轴，任意定位得到相同状态。
// 依赖：scene.js、bridge.js、GSAP；时间和主要空间参数集中在文件头。
const DUR=32;
const WALK={turnStart:22.85,turnDuration:.35,start:23.25,duration:1.95,distance:440,stride:160,stance:.6,doorX:1615};
const CAPTIONS=[
 [0,1.4,'怎么判断'],[1.4,3.6,'自己是不是被过去的投入'],[3.6,5.3,'牵着走'],
 [5.3,8,'想想那张不能退的电影票'],[8,10.4,'电影难看到想走'],[10.4,12.4,'你却因为票都买了'],[12.4,14,'继续坐着'],
 [14,15.5,'换个问题'],[15.5,18.2,'如果这张票没花钱'],[18.2,21.6,'你还愿意再看一小时吗'],
 [21.6,23.2,'无论走还是留'],[23.2,25.4,'票钱都回不来'],[25.4,28,'但剩下的一小时'],[28,32,'你还可以留给别的事']
];
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>{n=clamp(n);return n*n*(3-2*n)};
const progress=(t,start,duration)=>smooth((t-start)/duration);
const mix=(a,b,p)=>a+(b-a)*p;
const show=(e,o)=>set(e,{opacity:clamp(o)});
const move=(e,x,y,s=1,r=0,sx=1)=>set(e,{transform:`translate(${x} ${y}) rotate(${r}) scale(${s*sx} ${s})`});
const path=(e,d)=>set(e,{d});
const textSources=[...document.querySelectorAll('#world text')].map(e=>({e,text:e.textContent}));
const tick={t:SceneSpec.start},tl=gsap.timeline({paused:true});tl.to(tick,{t:SceneSpec.end,duration:SceneSpec.duration,ease:'none'},0);
window.__actCaptions=CAPTIONS;
// 人物骨架由髋、肩、膝和手的实际位置驱动；手掌始终连接前臂。
function drawPerson(p,x,y,{up=0,look=0,walking=0,phase=0,read=0}={}){
 move(p.g,x,y);
 show(p.armBack,1);show(p.backPalm,1);set(p.arm,{'stroke-width':29});
 const swing=Math.sin(phase)*walking,hx=-25*up,hy=-128-112*up,sx=-13-28*up,sy=hy-140;
 const ankle1=-60+49*swing,ankle2=26-49*swing;
 path(p.frontLeg,`M${hx-15} ${hy}Q${-65+30*up-21*swing} ${hy+62} ${ankle1} -18`);
 path(p.backLeg,`M${hx+24} ${hy-2}Q${35-23*up+20*swing} ${hy+72} ${ankle2} -18`);
 path(p.frontShoe,`M${ankle1-13}-23Q${ankle1-35}-20 ${ankle1-42}-2H${ankle1+24}Q${ankle1+29}-17 ${ankle1+13}-23Z`);
 path(p.backShoe,`M${ankle2-12}-22Q${ankle2-23}-18 ${ankle2-32}-1H${ankle2+30}L${ankle2+22}-22Z`);
 path(p.body,`M${sx-38} ${sy-7}Q${sx} ${sy-29} ${sx+41} ${sy-5}L${hx+48} ${hy+16}Q${hx} ${hy+28} ${hx-47} ${hy+11}Z`);
 path(p.seam,`M${sx+9} ${sy+11}L${hx+14} ${hy-3}`);
 const px=mix(hx-92,sx-75,look)+read*50,py=mix(hy-18,sy+40,look)-read*20;
 path(p.arm,`M${sx-24} ${sy+22}Q${sx-72} ${sy+91} ${px} ${py}`);move(p.palm,px,py,1,10+look*25);
 const bx=mix(hx+55,sx+32+28*swing,walking),by=mix(hy-10,hy-35,walking)-read*40;
 path(p.armBack,`M${sx+28} ${sy+18}Q${sx+60} ${sy+76} ${bx} ${by}`);move(p.backPalm,bx,by,1,-10);
 move(p.head,sx-5,sy-49,.72,-look*18+read*17+swing*2);
 set(p.shadow,{rx:95-walking*22,opacity:.45});
 return{x:x+px,y:y+py};
}
// 先面向出口，再前进。支撑脚在地面固定，摆动脚才抬起向前落下。
function drawForwardWalk(p,turn,distance){
 const cycle=distance/WALK.stride,phase=cycle*Math.PI*2;
 const foot=offset=>{const u=(cycle+offset)%1,flight=Math.max(0,(u-WALK.stance)/(1-WALK.stance));return{x:u<WALK.stance?WALK.stride*(WALK.stance/2-u):mix(-48,48,smooth(flight)),lift:32*Math.sin(Math.PI*flight),planted:u<WALK.stance}};
 const f=foot(.5),b=foot(0),bob=distance>0?3*Math.cos(phase*2):0;
 const hx=mix(-25,0,turn),hy=-240+bob*turn,sx=mix(-41,7,turn),sy=-380+bob*turn;
 const fx=mix(-60,f.x,turn),fy=-18-f.lift*turn,bx=mix(26,b.x,turn),by=-18-b.lift*turn;
 path(p.frontLeg,`M${hx-10} ${hy}Q${mix(-35,(hx+fx)/2+25+f.lift*.45,turn)} ${mix(-178,-118-f.lift*.4,turn)} ${fx} ${fy}`);
 path(p.backLeg,`M${hx+16} ${hy}Q${mix(12,(hx+bx)/2+20+b.lift*.4,turn)} ${mix(-170,-118-b.lift*.4,turn)} ${bx} ${by}`);
 const shoe=(e,x,y,oldToe)=>{const toe=mix(oldToe,49,turn),heel=mix(26,-19,turn);path(e,`M${x-12} ${y-5}Q${x+toe*.8} ${y-2} ${x+toe} ${y+17}H${x+heel}Q${x+heel-3} ${y+2} ${x+12} ${y-5}Z`)};
 shoe(p.frontShoe,fx,fy,-42);shoe(p.backShoe,bx,by,-32);
 const half=mix(43,31,turn);
 path(p.body,`M${sx-half} ${sy-7}Q${sx} ${sy-29} ${sx+half} ${sy-5}L${hx+half+2} ${hy+16}Q${hx} ${hy+28} ${hx-half} ${hy+11}Z`);
 path(p.seam,`M${sx+mix(9,23,turn)} ${sy+11}L${hx+mix(14,25,turn)} ${hy-3}`);
 const swing=distance>0?Math.sin(phase):0,qx=mix(30,-10+38*swing,turn),qy=-250;
 path(p.armBack,`M${sx+20} ${sy+20}Q${sx-20+22*swing} ${sy+89} ${qx} ${qy}`);move(p.backPalm,qx,qy,1,-10);
 show(p.armBack,1-turn*2);show(p.backPalm,1-turn*2);
 // 侧身只保留近侧手臂：肩、肘、腕按同一摆角联动，掌根接在腕端。
 const armAngle=.30*swing,shoulderX=mix(-65,sx+4,turn),shoulderY=sy+22;
 const elbowX=mix(-113,shoulderX+Math.sin(armAngle)*70,turn),elbowY=mix(-289,shoulderY+Math.cos(armAngle)*70,turn);
 const px=mix(-117,elbowX+Math.sin(armAngle+.1)*64,turn),py=mix(-258,elbowY+Math.cos(armAngle+.1)*64,turn);
 path(p.arm,`M${shoulderX} ${shoulderY}Q${elbowX} ${elbowY} ${px} ${py}`);set(p.arm,{'stroke-width':mix(29,25,turn)});move(p.palm,px,py,1,mix(10,-armAngle*180/Math.PI,turn));
 move(p.head,sx-5,sy-49,.72);show(p.head,1-turn);move(rightHead,sx+4,sy-49,.72);show(rightHead,turn);
 set(p.shadow,{rx:73});
 return{front:{x:1280+distance+fx,y:807+fy,planted:f.planted,toe_dx:mix(-42,49,turn)},back:{x:1280+distance+bx,y:807+by,planted:b.planted,toe_dx:mix(-32,49,turn)},far_arm_opacity:clamp(1-turn*2),near_arm:{shoulder:[shoulderX,shoulderY],elbow:[elbowX,elbowY],wrist:[px,py]}};
}
function draw(){
 const t=tick.t;
 const caption=CAPTIONS.find(([a,b])=>t>=a&&t<b)||CAPTIONS.at(-1);
 const key=t>=23.2&&t<25.4?'票钱':t>=25.4&&t<28?'一小时':'';
 byId('caption').innerHTML='<span>'+caption[2].replace(key||'\0',key?'<span class="caption-keyword">'+key+'</span>':'')+'</span>';
 // 前幕结果先完整接住，再由其中的选择路径把视线交给票根。
 const bridgeOut=progress(t,.18,1.12);
 byId('bridge').style.opacity=1-bridgeOut;
 byId('bridge').style.transform=`translate(${-210*bridgeOut}px,${-65*bridgeOut}px) scale(${1-.1*bridgeOut})`;
 const opening=drawOpening(t),enter=progress(t,.72,.65);
 const toHand=progress(t,6.8,1.1),toPaid=progress(t,14,.9),outPaid=progress(t,25.5,1.5);
 const cineEnter=progress(t,6.75,1.0),exitCine=progress(t,25.1,2.1),wide=progress(t,18.8,2.75);
 const push=(progress(t,8.4,1.1)-progress(t,12.6,1.05))*.2;
 const cs=1+push-.23*wide,cx=-1200*push-28*wide-exitCine*1650,cy=-620*push+155*wide;
 move(camera,cx,cy,cs);show(cinema,cineEnter*(1-exitCine));show(cinemaShade,(progress(t,14,.7)-progress(t,21.6,.6))*.46);
 const stand=(progress(t,8.85,1.12)-progress(t,11.6,1.4))*.88+progress(t,22.0,.85);
 const look=progress(t,10.0,.6)-progress(t,12.5,.65);
 const turn=progress(t,WALK.turnStart,WALK.turnDuration),travel=progress(t,WALK.start,WALK.duration),distance=WALK.distance*travel;
 const hand=drawPerson(viewer,1280+distance,807,{up:stand,look});
 move(rightHead,0,0);show(rightHead,0);show(viewer.head,1);let feet=null;
 if(turn>0)feet=drawForwardWalk(viewer,turn,distance);
 set(walkLayer,{'clip-path':turn>0?'url(#walk-doorway)':'none'});show(viewer.g,1);
 drawPerson(ghost,1280,807,{look:.1});show(ghost.g,progress(t,21.6,.65)*.3);
 set(seatCushion,{transform:`rotate(${-15*clamp(stand)} -76 3)`});
 // 银幕不是静态贴图：列车穿过地形，投影轮与光照同步运动。
 move(train,-510+((Math.max(0,t-6.8)*157)%1420),115,.8);
 path(hills,`M-480 122L-230 ${-37+7*Math.sin(t)}L-18 72 163-77 403 138 530 90V233H-480Z`);
 set(moon,{cx:155-22*Math.sin(t*.3),cy:-103+7*Math.sin(t*.25)});
 for(let i=0;i<reels.length;i++)set(reels[i],{transform:`rotate(${t*112+i*30})`});
 show(projection,.55+.055*Math.sin(t*5));
 const opened=progress(t,22.55,1.0);
 path(doorLeaf,`M-85-391L${85-143*opened} ${-391+24*opened}V${-3-25*opened}L-85-3Z`);
 path(doorHandle,`M${59-120*opened} ${-197+6*opened}V${-164+6*opened}`);
 show(doorway,opened);show(doorBeam,opened*.84);
 let {x:tx,y:ty,scale:ts,rotation:tr}=opening.ticket;
 tx=mix(tx,hand.x*cs+cx,toHand);ty=mix(ty,hand.y*cs+cy,toHand);ts=mix(ts,.23*cs,toHand);tr=mix(tr,-17+look*17,toHand);
 tx=mix(tx,290,toPaid)-outPaid*710;ty=mix(ty,349,toPaid);ts=mix(ts,.58,toPaid);tr=mix(tr,-8,toPaid);
 move(paidTicket.g,tx,ty,ts,tr);show(paidTicket.g,enter*(1-outPaid));
 show(ticketStage,1-outPaid);
 show(paidTicket.content,progress(t,1.02,.35));show(paidTicket.stamp,progress(t,5.56,.16));
 move(paidTicket.stamp,0,mix(-70,0,progress(t,5.45,.27)),mix(1.3,1,progress(t,5.45,.27)));
 show(ticketDetail,progress(t,14.6,.5)*(1-outPaid));set(ticketDetail,{x:290-outPaid*710});
 // 0元是另一个明确标出的假设，真实的已付票根没有改字或退款。
 const freeIn=progress(t,14.35,.8),freeOut=progress(t,17.8,1.0),flip=progress(t,15.4,.6);
 show(hypothetical,freeIn*(1-freeOut));move(freeTicket.g,960,457,1.0-freeOut*.3,-4+8*flip,Math.max(.06,Math.abs(Math.cos(Math.PI*flip))));
 set(imagined,{opacity:freeIn});
 // 六十片胶片刻度从放映机展开成一小时，再沿仍可选择的方向流向生活。
 const timeIn=progress(t,18.1,.7),top=progress(t,21.3,1.0),flow=progress(t,25.4,2.65),timeOut=progress(t,28.1,.6);
 show(timeStage,timeIn*(1-timeOut));
 const centerY=mix(434,260,top),radius=mix(222,124,top);
 set(halo,{cy:centerY,rx:mix(370,225,top),ry:mix(283,183,top)});
 set(timeHeading,{y:mix(330,188,top)});timeHeading.style.fontSize=mix(38,30,top)+'px';set(timeValue,{y:mix(500,304,top)});timeValue.style.fontSize=mix(110,80,top)+'px';set(timeUnit,{x:mix(1063,1038,top),y:mix(500,300,top)});timeUnit.style.fontSize=mix(32,26,top)+'px';
 show(timeHeading,1-flow);show(timeValue,1-flow);show(timeUnit,1-flow);show(halo,1-flow);
 for(let i=0;i<SceneOptions.minutes;i++){
  const slot=i*59/(SceneOptions.minutes-1),a=i*Math.PI*2/SceneOptions.minutes,uncoil=progress(t,18.15+slot*.021,.48);
  const ox=960+Math.sin(a)*radius,oy=centerY-Math.cos(a)*radius;
  const f=progress(t,25.4+slot*.017,1.05),endX=600+slot*14,endY=690+55*Math.sin(slot*.075);
  const x=mix(mix(1660,ox,uncoil),endX,f),y=mix(mix(60,oy,uncoil),endY,f)-Math.sin(f*Math.PI)*145;
  move(timePieces[i],x,y,mix(.93,.52,top)*(1-.28*f),mix(i*360/SceneOptions.minutes,83,f));show(timePieces[i],uncoil*(1-progress(t,27.2+slot*.012,.6)));
 }
 show(routes,progress(t,21.6,.55)*(1-progress(t,25.5,.7)));set(stayRoute,{'stroke-dashoffset':650*(1-progress(t,21.65,.8))});set(leaveRoute,{'stroke-dashoffset':650*(1-progress(t,21.8,1.0))});
 // 金色时间带接到一张真的桌子：翻开的书、落下的杯子与下一幕的手机。
 const futureIn=progress(t,25.6,1.2);show(future,futureIn);move(futureCamera,950*(1-futureIn),95*(1-futureIn),mix(.85,1,futureIn));
 const read=progress(t,27.4,1.0);drawPerson(reader,958,879,{look:0,read:read});move(reader.g,958,879,1.22);
 move(readerHands,958,879,1.22);show(readerHands,progress(t,26.2,.65));
 show(reader.g,progress(t,26.2,.65));
 move(book,967,700,.62,-5);
 const bookOpen=progress(t,26.25,1.3);set(bookLeft,{transform:`scale(${Math.max(.05,bookOpen)} 1)`});set(bookRight,{transform:`scale(${Math.max(.05,bookOpen)} 1)`});show(pageLines,bookOpen);
 const pageTurn=progress(t,29.0,1.8),pageAngle=Math.cos(pageTurn*Math.PI),reach=267*pageAngle;
 const grip=progress(t,28.65,.35)*(1-progress(t,30.85,.65)),gripX=mix(55,(9+reach*.62)/1.22,grip),gripY=mix(-178,-185,grip);
 path(reader.armBack,`M15-250Q101-212 ${gripX} ${gripY}`);move(reader.backPalm,gripX,gripY,1,20-45*pageTurn);
 path(turnPage,`M0-32Q${reach*.52} ${-145-Math.sin(pageTurn*Math.PI)*80} ${reach} -75V65Q${reach*.55} ${10-Math.sin(pageTurn*Math.PI)*25} 0 90Z`);
 show(turnPage,bookOpen*(1-progress(t,30.85,.4)));
 const cupDrop=progress(t,28.0,.65);move(cup,650,704-(1-cupDrop)*108,.76,-5*(1-cupDrop));show(cup,progress(t,27.9,.2));
 set(steam,{transform:`translate(${Math.sin(t*1.7)*7} ${-Math.sin(t*.9)*5})`});show(lampGlow,.72+.035*Math.sin(t*.6));
 show(phone,progress(t,29.6,.65));
 // 完全隐藏的场景不保留可检索文字，避免SVG聚合Range把已离场内容算进画布。
 // 每帧由原文恢复，往返定位不会丢字；不绕过实际可见文字的检查。
 for(const item of textSources){let opacity=1;for(let p=item.e;p&&p!==byId('root');p=p.parentElement)opacity*=Number(p.getAttribute('opacity')??1);item.e.textContent=opacity>.0001?item.text:''}
 window.__actState={t,stand,look,travel,opened,turn,distance,feet,opening,paidTicketVisible:enter*(1-outPaid),hypothesisVisible:freeIn*(1-freeOut),futureVisible:futureIn,bookOpen,pageTurn,cupDrop};
}
tl.eventCallback('onUpdate',draw);draw();
