// 用途：总览聚焦第二张卡片，放大后叠化进入详情。
// 运行：由准备后的index.html加载；__sceneSeek可前后定位。
// 依赖：本地GSAP与VisualOptions；当前选中位置固定为第二项。
const options=globalThis.VisualOptions;
for(const [sel,key] of [['#repo-doc .path','overviewNoteText'],['#repo-doc .repo-title','overviewTitle'],['#repo-row1','overview1Text'],['#repo-row2','overview2Text'],['#repo-row3','overview3Text'],['#selected-doc .path','detailNoteText'],['#selected-doc .repo-title','detailTitle'],['#detail1','detail1Text'],['#detail2','detail2Text'],['#detail3','detail3Text'],['#selected-doc .small','detailFootText']])document.querySelector(sel).textContent=options[key];
for(let i=1;i<=4;i++){document.querySelector('#link'+i+' b').textContent=options['card'+i+'Title'];document.querySelector('#link'+i+' span').textContent=options['card'+i+'Text'];}
const art=document.querySelector('.detail-art');
if(options.detailAsset){art.src=options.detailAsset;art.style.display='block';document.querySelector('#selected-doc').classList.add('with-art');}else art.remove();
const tl=gsap.timeline({paused:true});
gsap.set('#repo-doc',{opacity:1,x:-30,y:190,scale:.43});gsap.set('.repo-row,.linkcard,#link-lines',{opacity:1});
function show(selector,time,y=25,d=.5){tl.fromTo(selector,{opacity:0,y},{opacity:1,y:0,duration:d,ease:'power3.out',immediateRender:false},time);}
show('#selection',.398,0,.25);tl.to('#link1,#link3,#link4,#repo-doc,#link-lines',{opacity:.15,duration:.4},.398);
tl.to('#link2',{x:-300,y:-130,scale:1.65,duration:.6,ease:'power3.inOut'},.798);
tl.to('#selection,#link2',{opacity:0,duration:.35},1.398);show('#selected-doc',1.298,40,.5);
['#detail1','#detail2','#detail3'].forEach((id,i)=>show(id,1.902+i*.3,12,.3));
// 结束暂停点保留落定画面，素材时长不取最后一个动作的结束时间。
tl.addPause(3.3);
window.__sceneSeek=t=>{tl.pause().totalTime(Math.max(0,Math.min(3.3,t)),false);};
window.__sceneReady=document.fonts.ready;
