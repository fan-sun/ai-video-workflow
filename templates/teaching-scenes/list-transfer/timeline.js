// 用途：保留同一组三个对象，依次从左栏交到右栏，可替换纸页内容和对象图片。
// 运行：由准备后的index.html加载，使用__sceneSeek定位。
// 依赖：本地GSAP与VisualOptions；无音频。
const options=globalThis.VisualOptions;
document.querySelector('#source-label').textContent=options.sourceLabel;
document.querySelector('#target-label').textContent=options.targetLabel;
document.querySelector('#result').textContent=options.resultText;
for(let i=1;i<=3;i++){
 const page=document.querySelector('#pg'+i);
 page.querySelector('span').textContent=options['row'+i+'Text'];
 const asset=options['row'+i+'Asset'];
 if(asset){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 156 116');
  const image=document.createElementNS(svg.namespaceURI,'image');
  for(const [key,value] of Object.entries({href:asset,width:156,height:116,preserveAspectRatio:'xMidYMid meet'}))image.setAttribute(key,value);
  svg.append(image);page.prepend(svg);
 }
}
const tl=gsap.timeline({paused:true});
for(let i=1;i<=3;i++)tl.fromTo('#pg'+i,{x:0,y:0},{x:522,y:44,duration:.6,ease:'power2.inOut',immediateRender:false},.3+(i-1)*.6);
tl.fromTo('#result',{opacity:0,y:22},{opacity:1,y:0,duration:.35,ease:'power2.out',immediateRender:false},2.25);
tl.addPause(3.3);
window.__sceneSeek=t=>{tl.pause().totalTime(Math.max(0,Math.min(3.3,t)),false);};
window.__sceneReady=document.fonts.ready;
