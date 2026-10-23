// 用途：规则面板与动态图形联动，保留原双栏及游标运动。
// 运行：由准备后的index.html加载；__sceneSeek可前后定位。
// 依赖：本地GSAP与VisualOptions；文字是示意，不执行输入代码。
const options=globalThis.VisualOptions;
for(const [sel,key] of [['#code-source b','leftTitle'],['#code-source small','leftNoteText'],['#code-browser b','rightTitle'],['#code-browser small','rightNoteText'],['#code-line-shape','rule1Text'],['#code-line-enter','rule2Text'],['#code-line-text','rule3Text'],['#code-line-move','rule4Text'],['#code-demo-word','objectLabel'],['#code-timeline b','railLabel']])document.querySelector(sel).textContent=options[key];
if(options.objectAsset){const svg=document.querySelector('#code-demo-shape svg');svg.replaceChildren();const img=document.createElementNS('http://www.w3.org/2000/svg','image');for(const [k,v] of Object.entries({href:options.objectAsset,width:140,height:140,preserveAspectRatio:'xMidYMid meet'}))img.setAttribute(k,v);svg.append(img);}
const tl=gsap.timeline({paused:true});
function show(selector,time,from,duration=.55){tl.fromTo(selector,{opacity:0,...from},{opacity:1,x:0,y:0,scale:1,duration,ease:'power2.out',immediateRender:false},time);}
show('#code-source',0,{x:-25});show('#code-browser',.4,{x:25});
show('#code-line-shape',.5,{x:-12},.35);show('#code-line-enter',1,{x:-12},.35);show('#code-line-text',1.5,{x:-12},.35);show('#code-line-move',1.92,{x:-12},.3);
show('#code-timeline',2.231,{y:24});show('#code-demo-shape',2.381,{x:-32});show('#code-demo-word',3.411,{y:18},.45);
for(const [id,t] of [['#code-tick-0',2.381],['#code-tick-1',3.411],['#code-tick-2',4.431]])show(id,t,{y:8},.3);
show('#code-playhead',2.381,{y:0},.15);tl.to('#code-playhead',{x:788,duration:3,ease:'none'},2.581);
tl.to('#code-demo-shape',{y:110,duration:.4,ease:'power2.inOut'},4.431);tl.to('#code-demo-shape',{x:154,duration:.8,ease:'power2.inOut'},4.831);
// 结束暂停点保留落定画面，素材时长不取最后一个动作的结束时间。
tl.addPause(5.8);
window.__sceneSeek=t=>{tl.pause().totalTime(Math.max(0,Math.min(5.8,t)),false);};
window.__sceneReady=document.fonts.ready;
