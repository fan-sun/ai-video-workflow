// 用途：把原第三幕天平段接到独立8.5秒时间轴，保留运动、光照、粒子与投影。
// 运行：打开本目录index.html，由父预览或HyperFrames控制唯一暂停时间轴。
// 依赖：本目录settings、GSAP、Reel、实体天平及砝码形变模块。
window.createScaleScene=function(){
  const requested=new URLSearchParams(location.search).get('preset')||'original';
  if(!SceneConfig.presets[requested])throw new Error('未知预览版本');
  const options=SceneConfig.normalize(globalThis.SCENE_BUILD_OPTIONS||SceneConfig.presets[requested]);
  const {E,inv,lerp}=Reel,START=35.3,DURATION=8.5;
  const canvas=document.getElementById('picture'),g=canvas.getContext('2d');
  const scale=createFeelingScale20(document.getElementById('scale-stage'),options),morph=createWeightMorph06(g,options);
  const sm=(a,b,t)=>E.inOutCubic(inv(a,b,t));
  for(const [id,value] of [['title',options.title],['left-label',options.leftLabel],['right-label',options.rightLabel]])document.getElementById(id).textContent=value;
  document.getElementById('ratio').setAttribute('aria-label',String(options.ratio));
  function label(id,a,x,y){const el=document.getElementById(id);el.style.opacity=a;el.style.left=x+'px';el.style.top=y+'px';}
  function draw(localTime){
    const time=Reel.clamp(localTime,0,DURATION),t=START+time;
    g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.filter='none';g.globalCompositeOperation='source-over';g.clearRect(0,0,1920,1080);
    const state=scale.draw(t);morph.draw(t,state);
    for(const [start,pan,color] of [[37.95,state.gain,'#badbb6'],[38.7,state.loss,'#edac7c']]){
      const dt=t-start;if(dt<0||dt>.55)continue;
      const p=state.project(pan),q=dt/.55;g.save();g.strokeStyle=color;g.globalAlpha=(1-q)*.55;g.lineWidth=4*(1-q)+1;
      g.beginPath();g.ellipse(p[0],p[1],30+q*100,9+q*28,0,0,Math.PI*2);g.stroke();g.restore();
    }
    if(t>=40.7){
      const grow=sm(40.7,41.9,t),a=state.project(state.lossWeight),pts=[a,[a[0]+90,a[1]-90],[1170,550]];
      g.save();g.strokeStyle='#eab58d';g.lineWidth=4;g.lineCap='round';g.beginPath();g.arc(a[0],a[1],7,0,Math.PI*2);g.fillStyle='#eab58d';g.fill();
      g.beginPath();g.moveTo(...pts[0]);const p=grow*2;
      if(p<1)g.lineTo(lerp(pts[0][0],pts[1][0],p),lerp(pts[0][1],pts[1][1],p));
      else{g.lineTo(...pts[1]);g.lineTo(lerp(pts[1][0],pts[2][0],p-1),lerp(pts[1][1],pts[2][1],p-1));}g.stroke();
      const b=state.project(state.gainWeight);g.strokeStyle='#b9d9b2';g.globalAlpha=sm(40.7,41.1,t);g.beginPath();g.moveTo(b[0],b[1]);g.lineTo(b[0]-115*grow,b[1]-80*grow);g.stroke();g.restore();
    }
    const a=sm(37.1,37.45,t),left=state.project(state.gain),right=state.project(state.loss),unit=state.project(state.gainWeight);
    label('left-label',a,left[0],left[1]+100);label('right-label',a,right[0],right[1]+100);
    label('title',sm(36.8,37.2,t),lerp(960,1430,state.frame),lerp(130,180,state.frame));
    label('unit',sm(40.7,41.1,t),unit[0]-155,unit[1]-80);label('times',sm(40.7,41.55,t),1795,470);label('ratio',sm(40.7,41.55,t),1430,410);
    window.__sceneState={time,sourceTime:t,ratio:options.ratio,tilt:state.tilt,gain:state.gain,loss:state.loss,solid:state.solid,leftContact:state.gain_contact,rightContact:state.loss_contact};
  }
  const clock={t:0},tl=gsap.timeline({paused:true});tl.to(clock,{t:DURATION,duration:DURATION,ease:'none',onUpdate:()=>draw(clock.t)},0);
  window.__sceneSeek=t=>{tl.time(Reel.clamp(t,0,DURATION),false);draw(clock.t);};
  window.__hf=window.__hf||{};window.__hf.buildReady=window.__hf.buildReady||{};
  window.__sceneReady=window.__hf.buildReady.main=Promise.all([document.fonts.load('700 300px Noto'),document.fonts.ready]).then(()=>{
    morph.prepare();const ink=document.querySelector('#ratio canvas').getContext('2d');ink.font='700 240px Noto';ink.fillStyle='#edb88e';ink.textAlign='center';ink.textBaseline='alphabetic';
    const text=String(options.ratio),m=ink.measureText(text);ink.clearRect(0,0,650,280);ink.fillText(text,325,(280+m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2);draw(clock.t);
  });
  draw(0);return tl;
};
