// 用途：按示例正式 timings 生成四幕工作台图解。
// 运行：由 examples/context-window/run.mjs 的 video 阶段调用。
// 依赖：GSAP 固定版本及模板内字体；主题采用纸本机械的配色与图形语言。
const titles = ["一次请求的范围", "输入占用容量", "输出也要留空间", "清楚组织信息"];
const notes = ["当前请求 · 输入与输出", "问题 + 对话 + 参考资料", "总容量 ≠ 单独输出上限", "容量更大 ≠ 理解更好"];

export function makeActHtml(act, timings) {
  const start = act === 1 ? timings.phrases[1].start : 0.1;
  const second = timings.phrases[1].start;
  const duration = timings.total;
  const firstMotion = Math.max(0.6, timings.phrases[0].dur - 0.8);
  const secondMotion = Math.max(0.6, timings.phrases[1].dur - 0.6);
  return String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>上下文窗口 · ${act}</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
@font-face{font-family:Noto;src:url("fonts/NotoSansSC-400.woff2");font-weight:400}
@font-face{font-family:Noto;src:url("fonts/NotoSansSC-700.woff2");font-weight:700}
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1440px;background:#f4f0e4;color:#332819;font-family:Noto,sans-serif}
#root{position:relative;width:1080px;height:1440px;overflow:hidden}
.content{width:100%;height:100%;padding:150px 100px 250px;display:flex;flex-direction:column;gap:30px}
.eyebrow{font-size:26px;color:#695236;letter-spacing:5px;margin:0}.title{font-size:70px;line-height:1.3;margin:0;font-weight:700}
.note{font-size:32px;margin:0;color:#695236;opacity:0}#desk{opacity:0}.illustration{width:880px;height:650px;flex:none;margin-top:50px}
.caption{position:absolute;left:80px;right:80px;bottom:126px;height:150px;pointer-events:none}
.sub{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font-size:44px;line-height:1.45;opacity:0;text-wrap:balance}
.subtext{display:block;width:100%;text-wrap:balance}.hl{color:#8c4a12;font-weight:700}
.paper{opacity:0}.capacity{transform-origin:100px 525px;transform:scaleX(0)}
</style></head><body>
<main id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1080" data-height="1440">
<section class="content">
<p class="eyebrow">上下文窗口 · ${String(act).padStart(2, "0")}</p>
<h1 class="title">${titles[act - 1]}</h1>
<p class="note" data-reveal-at="${start}">${notes[act - 1]}</p>
<svg class="illustration" viewBox="0 0 880 650" role="img" aria-label="纸张进入工作台，展示输入和输出占用容量" data-layout-ignore>
<g id="desk" fill="none" stroke="#695236" stroke-width="9" stroke-linejoin="round">
<path d="M70 420 L810 420 L760 465 L120 465 Z" fill="#ded0b5"/><path d="M135 465 V605 M745 465 V605 M135 580 H745"/>
<path d="M110 115 H770 V395 H110 Z" stroke-dasharray="14 12" stroke-width="4" opacity=".65"/>
</g>
<g id="paper1" class="paper" data-reveal-at="${start}" data-reveal-duration="${act === 1 ? secondMotion : firstMotion}" fill="#fffdf7" stroke="#332819" stroke-width="4">
<path d="M150 180 L290 155 L325 360 L185 385 Z"/><path d="M185 220 L275 204 M195 255 L285 239 M201 290 L292 274"/>
</g>
<g id="paper2" class="paper" data-reveal-at="${Math.max(start + 0.7, second)}" data-reveal-duration="${secondMotion}" fill="#fffdf7" stroke="#332819" stroke-width="4">
<path d="M350 160 H500 V375 H350 Z"/><path d="M375 215 H475 M375 255 H475 M375 295 H445"/>
</g>
<g id="paper3" class="paper" data-reveal-at="${Math.max(start + 1.4, second + 0.7)}" data-reveal-duration="${Math.max(0.6, secondMotion - 0.7)}" fill="#ead5ae" stroke="#8c4a12" stroke-width="4">
<path d="M570 175 L710 195 L680 390 L540 370 Z"/><path d="M586 225 L679 240 M580 265 L674 280 M573 305 L648 317"/>
</g>
<path d="M100 525 H780" stroke="#ded0b5" stroke-width="24"/>
<path class="capacity" d="M100 525 H780" stroke="#bd8238" stroke-width="24"/>
<path d="M100 510 V548 M270 510 V548 M440 510 V548 M610 510 V548 M780 510 V548" stroke="#695236" stroke-width="3"/>
</svg></section><div id="substrip" class="caption"></div>
</main><script>
const DUR=${duration};
const tl=gsap.timeline({paused:true});
window.__timelines=window.__timelines||{};
window.__timelines["main"]=tl;
tl.fromTo('.note',{opacity:0,y:18},{opacity:1,y:0,duration:.5,immediateRender:false},${start});
tl.fromTo('#desk',{opacity:0,y:40},{opacity:1,y:0,duration:.65,immediateRender:false},${start});
tl.fromTo('#paper1',{opacity:0,y:-150,rotation:-12},{opacity:1,y:0,rotation:0,duration:${act === 1 ? secondMotion : firstMotion},ease:'power1.inOut',immediateRender:false},${start});
tl.fromTo('#paper2',{opacity:0,x:-80},{opacity:1,x:0,duration:${secondMotion},ease:'power1.inOut',immediateRender:false},${Math.max(start + 0.7, second)});
tl.fromTo('#paper3',{opacity:0,x:120,rotation:10},{opacity:1,x:0,rotation:0,duration:${Math.max(0.6, secondMotion - 0.7)},ease:'power1.inOut',immediateRender:false},${Math.max(start + 1.4, second + 0.7)});
tl.fromTo('.capacity',{scaleX:0},{scaleX:${act === 3 ? 0.75 : 0.9},duration:${Math.max(0.6, duration - start - 0.8)},ease:'none',immediateRender:false},${start});
/*__SUBS__*/
if(typeof SUBS!=='undefined') SUBS.forEach(p=>{
 const d=document.createElement('div');d.className='sub';d.innerHTML='<span class="subtext">'+p.t.replace(/\*\*(.+?)\*\*/g,'<span class="hl">$1</span>')+'</span>';document.getElementById('substrip').appendChild(d);
 tl.fromTo(d,{opacity:0,y:14},{opacity:1,y:0,duration:.22,immediateRender:false},p.s);
 tl.to(d,{opacity:0,duration:.18},Math.max(p.s+.4,p.e-.18));
});
</script></body></html>`;
}
