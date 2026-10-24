// 用途：选中的同一文字或图片连续落入结果槽，保持对象身份、字号和基线。
// 运行：由准备后的index.html加载，使用__sceneSeek定位或倒退。
// 依赖：本地GSAP与VisualOptions；无音频、无按时间回调换节点。
const options=globalThis.VisualOptions;
for(const [selector,key] of [['#source-label','sourceLabel'],['#source-text','sourceText'],['#processor-label','processorLabel'],['#candidates-label','candidatesLabel'],['#result-prefix','resultPrefixText'],['#result-hint','resultHintText']])document.querySelector(selector).textContent=options[key];
for(let i=1;i<=3;i++){
 const group=document.querySelector(i===1?'#selected-content':'#candidate'+i+'-content');
 const asset=options['candidate'+i+'Asset'];
 if(asset){
  const image=document.createElementNS('http://www.w3.org/2000/svg','image');
  for(const [key,value] of Object.entries({href:asset,x:-25,y:-43,width:50,height:50,preserveAspectRatio:'xMidYMid meet'}))image.setAttribute(key,value);
  group.replaceChildren(image);
 }else group.querySelector('text').textContent=options['candidate'+i+'Text'];
}
const tl=gsap.timeline({paused:true});
tl.set('#selected-object',{x:772,y:161,opacity:1},0);
tl.to('#moving-card',{opacity:1,duration:.25,ease:'power3.out'},.2);
tl.to('#selected-content',{color:'#102037',duration:.25,ease:'sine.inOut'},.2);
tl.to('#candidate2,#candidate3',{opacity:.28,duration:.25,ease:'sine.inOut'},.2);
tl.to('#selected-object',{x:535,y:557,duration:.9,ease:'power2.inOut'},.65);
// 只收窄背景，文字或图片不缩放、不复制、不淡出；落点直接等于结果槽中心和文字基线。
tl.to('#moving-card',{scaleX:.34,transformOrigin:'50% 50%',duration:.65,ease:'power2.inOut'},.65);
tl.to('#source-slot',{opacity:.28,duration:.3,ease:'power2.out'},.65);
tl.to('#result-slot',{opacity:0,duration:.18,ease:'power2.out'},1.55);
tl.fromTo('#next-slot',{opacity:0,scaleX:0},{opacity:1,scaleX:1,transformOrigin:'left center',duration:.3,ease:'power3.out',immediateRender:false},1.55);
tl.fromTo('#result-hint',{opacity:0,y:8},{opacity:1,y:0,duration:.3,ease:'sine.out',immediateRender:false},1.65);
tl.addPause(2.8);
window.__sceneSeek=t=>{tl.pause().totalTime(Math.max(0,Math.min(2.8,t)),false);};
window.__sceneReady=document.fonts.ready;
