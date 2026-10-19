// 用途：驱动素材预览与参数编辑，播放时钟仅属于预览界面。
// 运行：npm run preview:motion，打开终端给出的地址。
// 依赖：浏览器Canvas 2D与本地演示模块。
import {catalog,drawDemo} from './demos.mjs';
const $=id=>document.getElementById(id),c=document.querySelector('canvas').getContext('2d');
let selected=catalog[0].id,progress=0,playing=false,last=0;
const duration=()=>Math.max(1,Math.min(30,Number($('duration').value)||6));
function options(){return {accent:$('accent').value,shape:$('shape').value,strength:Number($('strength').value),label:$('label').value};}
function paint(){drawDemo(c,selected,progress,options());$('time').value=Math.round(progress*1000);$('clock').value=`${(progress*duration()).toFixed(1)} / ${duration().toFixed(1)}s`;}
function play(value){playing=value;$('play').textContent=value?'暂停':'播放';$('play').setAttribute('aria-pressed',String(value));last=0;}
function select(id){
  const item=catalog.find(x=>x.id===id);selected=id;progress=0;
  document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===id)));
  $('name').textContent=item.name;$('usage').textContent=item.use;$('params').textContent='代码可调：'+item.params;
  $('label').disabled=!['morph','burst'].includes(id);
  $('strength').disabled=!['morph','contact','camera','reflow','burst'].includes(id);paint();
}
for(const [i,item] of catalog.entries()){
  const b=document.createElement('button');b.dataset.id=item.id;b.innerHTML=`<span>0${i+1}</span>${item.name}`;
  b.addEventListener('click',()=>select(item.id));document.querySelector('nav').append(b);
}
$('play').addEventListener('click',()=>play(!playing));
$('time').addEventListener('input',()=>{play(false);progress=Number($('time').value)/1000;paint();});
for(const id of ['accent','shape','strength','label','duration'])$(id).addEventListener('input',paint);
function tick(now){if(playing){if(last)progress=(progress+(now-last)/1000/duration())%1;paint();last=now;}requestAnimationFrame(tick);}
try{await document.fonts.load('700 80px Vibe');await document.fonts.ready;select(selected);play(!matchMedia('(prefers-reduced-motion: reduce)').matches);requestAnimationFrame(tick);}
catch(error){$('error').textContent='预览失败：'+error.message;throw error;}
