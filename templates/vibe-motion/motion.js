// 用途：八类可复用动效的确定性状态计算，不绑定题材、画布或播放时钟。
// 使用：导入所需函数，传入0～1进度；把返回状态绘制为本期对象。
// 依赖：无；浏览器ES模块与Node均可运行，.js兼容现有渲染器。
export const clamp = p => Math.max(0, Math.min(1, p));
export const ease = p => { const q=clamp(p); return q*q*q*(q*(q*6-15)+10); };
const lerp = (a,b,p) => a+(b-a)*p;
const copy = points => points.map(({x,y})=>({x,y}));

/** 沿折线路程推进；用足够密的点列也可表示曲线。 */
export function travel(points, progress) {
  if (!points.length) throw new Error('路径至少需要一个点');
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
  let remaining=lengths.reduce((a,b)=>a+b,0)*clamp(progress);
  const visible=[{...points[0]}];
  for(let i=0;i<lengths.length;i++) {
    const a=points[i],b=points[i+1],length=lengths[i];
    if(length && remaining<length) {
      const p=remaining/length,point={x:lerp(a.x,b.x,p),y:lerp(a.y,b.y,p)};
      visible.push(point);return {point,visible,angle:Math.atan2(b.y-a.y,b.x-a.x)};
    }
    visible.push({...b});remaining-=length;
  }
  const last=points.at(-1),before=points.at(-2)||last;
  return {point:{...last},visible,angle:Math.atan2(last.y-before.y,last.x-before.x)};
}

/** 同一批对象逐个移动到目标；弧度只影响中途，不改变端点。 */
export function morph(from,to,progress,{stagger=.18,arc=80}={}) {
  if(from.length!==to.length) throw new Error('起点与终点数量必须一致');
  const p=clamp(progress);
  if(p===0)return copy(from);if(p===1)return copy(to);
  return from.map((a,i)=>{
    const q=ease((p-stagger*i/Math.max(1,from.length-1))/(1-stagger));
    return {x:lerp(a.x,to[i].x,q),y:lerp(a.y,to[i].y,q)-Math.sin(q*Math.PI)*arc};
  });
}

/** 下落、接触压缩、回弹、稳定；落点为y=0。 */
export function contact(progress,{distance=280,bounce=90,hit=.42}={}) {
  const p=clamp(progress);
  if(p<hit)return {y:-distance*(1-(p/hit)**2),scaleX:1,scaleY:1,shock:0};
  const u=(p-hit)/(1-hit),pulse=Math.sin(Math.PI*clamp(u/.27))*(1-ease(u/.4));
  return {y:u===0||u===1?0:-bounce*Math.sin(Math.PI*u)*Math.exp(-2.8*u),
    scaleX:1+.28*pulse,scaleY:1-.22*pulse,shock:Math.sin(Math.PI*u)*(1-u)};
}

/** 世界坐标的观看中心与尺度变化；所有空间层使用同一返回值。 */
export function camera(from,to,progress) {
  const p=ease(progress);
  return {x:lerp(from.x,to.x,p),y:lerp(from.y,to.y,p),
    scale:lerp(from.scale??1,to.scale??1,p),rotation:lerp(from.rotation??0,to.rotation??0,p)};
}

/** 保持数组下标所对应的身份，筛选后进入不同位置与可见状态。 */
export function reflow(from,to,keep,progress,options={}) {
  if(keep.length!==from.length)throw new Error('筛选条件与对象数量必须一致');
  const p=clamp(progress);
  return morph(from,to,p,options).map((point,i)=>({...point,id:i,opacity:keep[i]?1:1-ease(p)}));
}

/** 返回已显现矩形和前沿；同一主体的底稿与结果共用位置。 */
export function scan(rect,progress) {
  const width=rect.width*ease(progress);
  return {...rect,width,front:rect.x+width};
}

/** 焦点从一个有意义的对象交给另一个对象，位置与半径一起变化。 */
export function focus(from,to,progress) {
  const p=ease(progress);
  return {x:lerp(from.x,to.x,p),y:lerp(from.y,to.y,p),radius:lerp(from.radius,to.radius,p)};
}

/** 可重复定位的冲击粒子；由同一触发位置向外传播并衰减。 */
export function burst(origin,progress,{count=48,seed=7,radius=360}={}) {
  const p=clamp(progress),spread=1-(1-p)**3;
  const noise=i=>{const n=Math.sin((i+1)*127.1+seed*311.7)*43758.5453;return n-Math.floor(n);};
  return Array.from({length:count},(_,i)=>{
    const angle=2*Math.PI*(i/count+(noise(i)-.5)*.08),distance=radius*(.35+.65*noise(i+count))*spread;
    return {x:origin.x+Math.cos(angle)*distance,y:origin.y+Math.sin(angle)*distance,
      angle,size:2+4*noise(i+count*2),opacity:(1-p)**1.5};
  });
}
