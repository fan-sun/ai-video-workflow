// 用途：消息、箭头和选中目标共同移动，始终管理三个工位的明暗及对应内容。
// 运行：由准备后的index.html加载，使用__sceneSeek定位。
// 依赖：本地GSAP与VisualOptions；无音频，不使用回调修改选中状态。
const options=globalThis.VisualOptions;
const targets=['routeLog','routeAfter','routeFin'];
document.querySelector('#message-label').textContent=options.messageLabel;
for(let i=1;i<=3;i++){
 document.querySelector('#message'+i).textContent=options['message'+i+'Text'];
 document.querySelector('#'+targets[i-1]+' b').textContent=options['target'+i+'Label'];
 const asset=options['target'+i+'Asset'];
 if(asset){
  const prop=document.querySelector('#prop'+i);prop.className='object';prop.style.cssText='width:100px;height:92px';prop.replaceChildren();
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 200 184');
  const image=document.createElementNS(svg.namespaceURI,'image');
  for(const [key,value] of Object.entries({href:asset,width:200,height:184,preserveAspectRatio:'xMidYMid meet'}))image.setAttribute(key,value);
  svg.append(image);prop.append(svg);
 }
}
const tl=gsap.timeline({paused:true});
for(let index=1;index<=2;index++){
 const at=index===1?.7:2.2;
 tl.to('#routing-input',{y:index*212,duration:.65,ease:'power2.inOut'},at);
 tl.to('#target-focus',{y:index*212,duration:.65,ease:'power2.inOut'},at);
 // 强调框在到位时重新显现，移动途中不横跨其他工位造成遮挡。
 tl.to('#target-focus',{opacity:0,duration:.12,ease:'power2.in'},at);
 tl.fromTo('#target-focus',{opacity:0},{opacity:1,duration:.15,ease:'power3.out',immediateRender:false},at+.5);
 // 每次都明确写出全部目标的状态，防止第三个工位漏掉，也支持任意倒退。
 for(let target=0;target<3;target++)tl.to('#'+targets[target],{opacity:target===index?1:.28,duration:.4,ease:'sine.inOut'},at);
 tl.to('#message'+index,{opacity:0,duration:.12,ease:'power2.in'},at);
 tl.fromTo('#message'+(index+1),{opacity:0},{opacity:1,duration:.18,ease:'power3.out',immediateRender:false},at+.15);
}
tl.addPause(4.2);
window.__sceneSeek=t=>{tl.pause().totalTime(Math.max(0,Math.min(4.2,t)),false);};
window.__sceneReady=document.fonts.ready;
