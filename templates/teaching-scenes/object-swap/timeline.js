// 用途：固定接口不动，按原动作曲线替换对象；可换成本地SVG或图片。
// 运行：由准备后的index.html加载；时间轴不自行播放。
// 依赖：本地GSAP与VisualOptions。
const options=globalThis.VisualOptions;
document.querySelector('#api-port text').textContent=options.socketLabel;
for(const [selector,label,asset] of [['#provider-a',options.oldLabel,options.oldAsset],['#provider-b',options.newLabel,options.newAsset]]){
 const group=document.querySelector(selector+' svg > g');
 if(asset){group.replaceChildren();const img=document.createElementNS('http://www.w3.org/2000/svg','image');for(const [k,v] of Object.entries({href:asset,x:-14,y:-14,width:228,height:208,preserveAspectRatio:'xMidYMid meet'}))img.setAttribute(k,v);group.append(img);}
 else group.querySelector('text').textContent=label;
}
const tl=gsap.timeline({paused:true});
tl.to('#provider-a',{x:0,y:-180,duration:.75,ease:'power2.inOut'},.4);
tl.to('#provider-a',{opacity:0,duration:.2,ease:'power2.inOut'},1.2);
tl.fromTo('#provider-b',{opacity:0,x:0,y:18},{opacity:1,x:0,y:0,scale:1,duration:.42,ease:'power3.out',immediateRender:false},2.1);
window.__sceneSeek=t=>{tl.pause().totalTime(Math.max(0,Math.min(4.4,t)),false);};
window.__sceneReady=document.fonts.ready;
