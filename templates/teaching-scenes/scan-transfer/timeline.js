// 用途：保留原扫描、结果传递与入账动作，可替换输入和目标图形。
// 运行：由准备后的index.html加载，使用__sceneSeek定位。
// 依赖：本地GSAP与VisualOptions；无音频。
const options=globalThis.VisualOptions;
for(const [id,asset] of [['task-receipt',options.inputAsset],['task-ledger',options.targetAsset]]){
 if(asset){const svg=document.querySelector('#'+id+' svg');svg.replaceChildren();const img=document.createElementNS('http://www.w3.org/2000/svg','image');for(const [k,v] of Object.entries({href:asset,width:200,height:200,preserveAspectRatio:'xMidYMid meet'}))img.setAttribute(k,v);svg.append(img);}
}
document.querySelector('#task-scanner b').textContent=options.scannerLabel;
document.querySelector('#task-ledger b').textContent=options.targetLabel;
const amount=document.querySelector('#task-amount');amount.replaceChildren();const small=document.createElement('small');small.style.cssText='display:block;font-size:21px;margin-bottom:5px';small.textContent=options.dataTitle;amount.append(small,document.createTextNode(options.dataText));
document.querySelector('#ledger-entry').textContent=options.resultText;
const tl=gsap.timeline({paused:true});
function show(selector,time,from,duration=.65){tl.fromTo(selector,{opacity:0,...from},{opacity:1,x:0,y:0,scale:1,duration,ease:'power2.out',immediateRender:false},time);}
show('#task-receipt',0,{x:-25});show('#task-scanner',.3,{scale:.88});
tl.to('#task-receipt',{x:292,y:-5,scale:.64,duration:.85,ease:'sine.inOut'},.65);
tl.fromTo('#task-scanner .scan-line',{y:-8},{y:18,duration:.8,ease:'sine.inOut',immediateRender:false},1.05);
show('#task-amount',1.55,{scale:.85},.6);show('#task-ledger',3.519,{x:25});
tl.to('#task-amount',{x:345,y:20,duration:1.15,ease:'sine.inOut'},3.719);
show('#ledger-entry',4.769,{y:16},.55);tl.to('#task-amount',{opacity:0,duration:.3},4.969);
// 结束暂停点保留落定画面，素材时长不取最后一个动作的结束时间。
tl.addPause(5.4);
window.__sceneSeek=t=>{tl.pause().totalTime(Math.max(0,Math.min(5.4,t)),false);};
window.__sceneReady=document.fonts.ready;
