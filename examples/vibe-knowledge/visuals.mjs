// 用途：为8秒Vibe技术示例提供两段独立、可逆定位的动画与代码封面。
// 运行：由同目录run.mjs生成HTML；不作为所有主题的固定画面模板。
// 依赖：已有GSAP和本仓库字体。
export function makeVisual(act) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  @font-face{font-family:Noto;src:url('fonts/NotoSansSC-700.woff2')}*{box-sizing:border-box}body{margin:0;background:#101f2a}
  #root{position:relative;width:1920px;height:1080px;overflow:hidden;color:#f5edda;font-family:Noto}
  canvas{position:absolute;inset:0}#caption{position:absolute;left:140px;right:140px;bottom:90px;text-align:center;font-size:58px;line-height:1.5}
  </style><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script></head>
  <body><div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="4">
  <canvas width="1920" height="1080" data-layout-ignore></canvas><div id="caption"></div></div><script>
  const DUR=4;
  /*__SUBS__*/
  const c=document.querySelector('canvas').getContext('2d'),phase={t:0};
  const tl=gsap.timeline({paused:true});tl.to(phase,{t:DUR,duration:DUR,ease:'none'});
  const clamp=x=>Math.max(0,Math.min(1,x));
  const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
  function circle(x,y,r,fill){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill()}
  function frame(){const t=phase.t;
    c.clearRect(0,0,1920,1080);const gradient=c.createLinearGradient(0,0,1920,1080);
    gradient.addColorStop(0,'#183747');gradient.addColorStop(1,'#07141f');c.fillStyle=gradient;c.fillRect(0,0,1920,1080);
    c.strokeStyle='#436271';c.lineWidth=2;for(let i=0;i<8;i++){const x=i*290-100-t*20;c.beginPath();c.moveTo(960,520);c.lineTo(x,920);c.stroke()}
    c.font='bold 100px Noto';c.fillStyle='#f5edda';c.textAlign='center';c.fillText('${act===1?'花掉的钱':'还有的时间'}',960,185);
    if(${act}===1){
      const rise=ease(t/1.3);c.fillStyle='#607981';c.fillRect(705,645,510,160);c.fillStyle='#091c27';c.fillRect(785,655,350,22);
      for(let i=0;i<3;i++){const p=ease((t-i*.38)/1.2),y=290+p*385;
        c.globalAlpha=1-ease((p-.92)/.08);circle(845+i*115,y,48,'#dab575');circle(845+i*115,y,34,'#edce91');}
      c.globalAlpha=rise;c.font='bold 55px Noto';c.fillStyle='#f5edda';c.fillText('已经付出',960,760);c.globalAlpha=1;
      c.strokeStyle='#dab575';c.lineWidth=5;for(let i=0;i<3;i++){const q=ease((t-1.6-i*.2)/.6);c.beginPath();c.arc(960,660,80+q*110,Math.PI,Math.PI*2);c.globalAlpha=(1-q)*.6;c.stroke()};c.globalAlpha=1;
    }else{
      const p=ease(t/2.8);circle(960,495,192,'#274758');c.strokeStyle='#edce91';c.lineWidth=10;c.beginPath();c.arc(960,495,170,-Math.PI/2,-Math.PI/2+p*Math.PI*1.6);c.stroke();
      c.save();c.translate(960,495);c.rotate(t*1.15);c.strokeStyle='#f5edda';c.lineWidth=12;c.lineCap='round';c.beginPath();c.moveTo(0,0);c.lineTo(0,-135);c.stroke();c.restore();circle(960,495,14,'#dab575');
      for(let i=0;i<2;i++){const q=ease((t-1-i*.3)/1.4);c.strokeStyle=i?'#8bb2b0':'#dab575';c.lineWidth=7;c.beginPath();c.moveTo(960,720);c.quadraticCurveTo(960+(i?1:-1)*200*q,800,960+(i?1:-1)*390*q,745);c.stroke();}
      c.font='bold 43px Noto';c.fillStyle='#f5edda';c.globalAlpha=ease((t-1.7)/.8);c.fillText('继续看',570,715);c.fillText('做别的事',1350,715);c.globalAlpha=1;
    }
    const active=SUBS.find(s=>t>=s.s&&t<s.e),caption=document.getElementById('caption');caption.replaceChildren();
    if(active){const parts=active.t.split('**');parts.forEach((text,i)=>{const span=document.createElement('span');span.textContent=text;if(i%2)span.style.color='#e8c781';caption.append(span)})}
  }
  tl.eventCallback('onUpdate',frame);window.__timelines=window.__timelines||{};window.__timelines["main"]=tl;frame();
  </script></body></html>`;
}
export const coverHtml=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
@font-face{font-family:Noto;src:url('fonts/NotoSansSC-700.woff2')}*{box-sizing:border-box}body{margin:0}
#cover{width:1080px;height:1440px;background:radial-gradient(ellipse at 50% 70%,#284b5b,#07141f);color:#f5edda;font-family:Noto;position:relative;overflow:hidden}
h1{position:absolute;top:580px;left:0;width:100%;margin:0;text-align:center;font-size:175px;letter-spacing:8px}
.clock{position:absolute;left:345px;top:850px;width:390px;height:390px;border:14px solid #e2bd78;border-radius:50%}
.clock:before{content:'';position:absolute;width:12px;height:140px;background:#f5edda;left:175px;top:38px;transform-origin:bottom;transform:rotate(35deg)}
</style><body><div id="cover"><h1 data-role="cover-topic">沉没成本</h1><div class="clock"></div></div></body></html>`;
