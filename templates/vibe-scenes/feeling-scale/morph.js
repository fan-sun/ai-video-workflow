// 用途：复用06采样、curl错峰与辉光，把乐/痛字形聚成两枚落盘砝码。
// 运行：prepare()等待字体后执行；draw(秒数,天平状态)跟随同一主时间轴。
// 依赖：06-完整形变核心.js、core.js；两组各6000点，总计12000点。
window.createWeightMorph06=function(g,options){
 const {E,clamp,inv,lerp}=Reel,N=6000,core=createMorph06Core(N);
 const layer=document.createElement('canvas');layer.width=1920;layer.height=1080;const c=layer.getContext('2d');
 const phase=Array.from({length:N*2},()=>core.rnd()*6.28),size=Array.from({length:N*2},()=>.55+Math.pow(core.rnd(),3)*1.6);
 let words=null,weight=null;
 const drawWeight=(ctx,w,h)=>{
  ctx.fillRect(w/2-130,h/2-110,260,220);ctx.fillRect(w/2-55,h/2-155,110,50);
  ctx.lineWidth=22;ctx.beginPath();ctx.arc(w/2,h/2-183,35,0,Math.PI*2);ctx.stroke();
 };
 return {prepare(){
  words=[options.leftGlyph,options.rightGlyph].map(word=>core.samplePoints((ctx,w,h)=>{ctx.font='700 300px Noto';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(word,w/2,h/2+10);},.004,.1));
  weight=core.samplePoints(drawWeight,.0022,.12);
 },draw(t,scene){
  if(!words||t<36.8||t>38.65)return;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,1920,1080);c.globalCompositeOperation='lighter';
  for(let group=0;group<2;group++){
   const start=group?37.65:36.8,end=group?38.55:37.85;
   const reveal=E.outCubic(inv(start,start+.18,t)),fade=1-E.inOutCubic(inv(end-.15,end+.1,t));if(reveal*fade<=0)continue;
   const center=group?scene.lossWeight:scene.gainWeight,k=group?Math.cbrt(options.ratio):1;
   const color=group?[242,158,110]:[174,221,177];
   for(let i=0;i<N;i++){
    const n=i+group*N,j=i*3,raw=clamp((t-start-.3-(weight[j]+.8)*.035)/.45),u=E.inOutCubic(raw);
    let x=lerp(words[group][j],weight[j]*k,u),y=lerp(words[group][j+1],weight[j+1]*k,u),z=lerp(words[group][j+2],weight[j+2]*k,u);
    const swirl=Math.sin(Math.PI*u)*.42;
    if(swirl>.001){const d=core.curl(x*.5+t*.3,y*.5,z*.5+phase[n]);x+=d[0]*swirl;y+=d[1]*swirl;z+=d[2]*swirl;}
    const originY=lerp(group?2.85:2.75,center[1],u);
    const p=scene.project([center[0]+x,originY+y,center[2]+z]);
    const blur=Math.min(1,Math.abs(z)/.5),r=(1.25+blur*4.5)*size[n]*2268/(160*Math.max(7,p[2]));
    c.globalAlpha=(.55+.35*Math.sin(t*3+phase[n]*5)**2)*(1-blur*.6)*reveal*fade;
    const sprite=core.tinted(color.map(v=>v-v%8),8,.22);c.drawImage(sprite,p[0]-r,p[1]-r,r*2,r*2);
   }
  }
  c.globalAlpha=1;c.globalCompositeOperation='source-over';
  g.save();g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='lighter';
  g.filter='blur(14px)';g.globalAlpha=.4;g.drawImage(layer,0,0);
  g.filter='blur(4px)';g.globalAlpha=.45;g.drawImage(layer,0,0);
  g.filter='none';g.globalAlpha=1;g.drawImage(layer,0,0);g.restore();
 }};
};
