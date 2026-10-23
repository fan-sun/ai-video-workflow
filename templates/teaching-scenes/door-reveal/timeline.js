// 用途：保留原门扇、人物与迈步动作，替换门后内容。
// 运行：由准备后的index.html加载；时间轴不自行播放。
// 依赖：本地GSAP与VisualOptions。
const options=globalThis.VisualOptions;
document.querySelector('#door-leaf path').setAttribute('fill',options.doorColor);
if(options.roomAsset){const group=document.querySelector('#room-objects');group.replaceChildren();const img=document.createElementNS('http://www.w3.org/2000/svg','image');for(const [k,v] of Object.entries({href:options.roomAsset,x:520,y:180,width:330,height:275,preserveAspectRatio:'xMidYMid meet'}))img.setAttribute(k,v);group.append(img);}
const tl=gsap.timeline({paused:true});
tl.fromTo('#room-objects',{opacity:0,y:0},{opacity:1,y:0,duration:.3,ease:'power3.out',immediateRender:false},1.148);
tl.to('#door-leaf',{svgOrigin:'445 280',scaleX:.18,duration:.85,ease:'power2.inOut'},1.148);
tl.to('#student',{x:410,duration:2,ease:'power1.inOut'},1.748);
tl.to('#leg-a',{rotation:17,svgOrigin:'220 364',duration:.25,yoyo:true,repeat:5,ease:'sine.inOut'},1.798);
tl.to('#leg-b',{rotation:-17,svgOrigin:'244 364',duration:.25,yoyo:true,repeat:5,ease:'sine.inOut'},1.798);
window.__sceneSeek=t=>{tl.pause().totalTime(Math.max(0,Math.min(4.4,t)),false);};
window.__sceneReady=document.fonts.ready;
