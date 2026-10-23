// 用途：沿用EP06分工与交接动作，以真实旁白ID重新定位时间。
// 运行：由准备后的index.html调用createTeachingScene；不自行播放。
// 依赖：本地GSAP、data.js、原场景DOM。
window.createTeachingScene=function(data){
 const tl=gsap.timeline({paused:true}),b=data.beats,c=data.content;
 const text=(selector,value)=>{document.querySelector(selector).textContent=value;};
 text('#s2 h2',c.title);text('#s3 h2',c.handoffTitle);
 c.roles.forEach((v,i)=>text('#a1e'+(20+i)+' .caption',v));
 c.findings.forEach((v,i)=>text('#a1e'+(23+2*i)+' .caption',v));
 c.collected.forEach((v,i)=>text('#a1e'+(32+i)+' .caption',v));
 text('#a1e38 strong',c.reportTitle);text('#a1e38 p',c.reportNote);text('#a1e39',c.question);
 const reveals=[];
 function mark(sel,t,duration,unit){const el=document.querySelector(sel);el.dataset.revealAt=String(t);el.dataset.revealDuration=String(duration);el.dataset.beat=unit;el.setAttribute('aria-label',el.textContent.trim()||'资料交接');reveals.push({selector:sel,start:t,duration,unit});}
 function enter(sel,t){tl.fromTo(sel,{opacity:0,y:18},{opacity:1,y:0,duration:.35,ease:'power2.out',immediateRender:false},t);}
 function appear(sel,t,mode,unit){mark(sel,t,.52,unit);tl.fromTo(sel,{opacity:0,y:mode==='fade'?0:28,scale:1},{opacity:1,y:0,scale:1,duration:.52,ease:'power3.out',immediateRender:false},t);}
 function packet(sel,t,x,y){tl.fromTo(sel+' .packet',{opacity:0,x:0,y:0},{opacity:1,x,y,duration:1.1,ease:'power1.inOut',immediateRender:false},t+.12);tl.to(sel+' .packet',{opacity:0,duration:.2},t+1.22);}
 enter('#s2',b.divide.start);
 for(let i=0;i<3;i++)appear('#a1e'+(20+i),b.divide.start+i*.15,'rise',b.divide.id);
 ['price','feedback','channels'].forEach((key,i)=>{const t=b[key].start;appear('#a1e'+(23+i*2),t,'rise',b[key].id);appear('#a1e'+(24+i*2),t,'fade',b[key].id);packet('#a1e'+(24+i*2),t,0,55);});
 for(let i=0;i<3;i++)appear('#a1e'+(29+i),b.ownership.start+i*.18,'rise',b.ownership.id);
 tl.to('#s2',{opacity:0,y:-18,duration:.2,ease:'power2.in'},b.gather.start-.1);
 enter('#s3',b.gather.start);
 for(let i=0;i<3;i++){appear('#a1e'+(32+i),b.gather.start,'rise',b.gather.id);const t=b.transfer.start+i*.15;appear('#a1e'+(35+i),t,'fade',b.transfer.id);packet('#a1e'+(35+i),t,330-i*330,160);}
 appear('#a1e38',b.report.start,'rise',b.report.id);appear('#a1e39',b.question.start,'rise',b.question.id);
 const strip=document.getElementById('substrip');strip.replaceChildren();
 for(const u of data.units){const d=document.createElement('div');d.className='sub';d.dataset.unit=u.id;const span=document.createElement('span');span.className='subtext';span.textContent=u.text.replace(/[，。！？；：、,.!?;:—…]+$/u,'');d.appendChild(span);strip.appendChild(d);tl.fromTo(d,{opacity:0,y:10},{opacity:1,y:0,duration:.12,ease:'power2.out',immediateRender:false},u.start);tl.to(d,{opacity:0,duration:.1},Math.max(u.start+.12,u.end-.1));}
 window.__teachingReveals=reveals;
 window.__teachingSeek=t=>{tl.pause().totalTime(Math.max(0,Math.min(data.duration,t)),false);window.__teachingState={time:t,unit:data.units.find(u=>t>=u.start&&t<u.end)?.id||null};};
 window.__sceneReady=document.fonts.ready.then(()=>{window.__teachingSeek(0);});
 window.__hf=window.__hf||{};window.__hf.buildReady={main:window.__sceneReady};
 return tl;
};
