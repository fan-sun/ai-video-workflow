// 用途：逐项加载原版20种风格，不修改原动画源码。
// 运行：由本目录server.mjs提供页面。
// 依赖：原项目元数据及本地原版HTML。
const items=window.META,$=id=>document.getElementById(id);
let selected=2,generation=0;
function choose(index){
  selected=(index+items.length)%items.length;const item=items[selected],ticket=++generation;
  $('title').textContent=item.id+' · '+item.zh.join(' / ');$('desc').textContent=item.desc;
  $('tags').replaceChildren(...item.tags.map(tag=>{const el=document.createElement('span');el.textContent=tag;return el;}));
  document.querySelectorAll('nav button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selected)));
  const url='/ref/styles/'+item.dir+'/index.html';$('open').href=url;$('loading').hidden=false;$('loading').textContent='正在加载 '+item.zh.join(' / ')+'…';$('status').textContent=item.id==='19'?'黏土定格首次初始化较慢，请耐心等待；原版播放已验证通过。':'';
  // 换掉整个iframe，释放上一项的循环与WebGL上下文。
  const frame=document.createElement('iframe');frame.id='player';frame.title=item.zh.join(' / ');frame.allow='autoplay; fullscreen';frame.allowFullscreen=true;
  frame.onload=async()=>{
    if(ticket!==generation)return;
    try{
      if(typeof frame.contentWindow.__seek!=='function')throw new Error('原场景没有完成初始化');
      await frame.contentWindow.__seek(0);
      if(ticket!==generation)return;
      $('loading').hidden=true;$('status').textContent=`${item.id} / 20 · 原版实时播放 · ${frame.contentWindow.__duration} 秒循环`;
    }catch(error){if(ticket!==generation)return;$('loading').textContent='加载失败，可尝试单独打开';$('status').textContent=error.message;}
  };
  $('player').replaceWith(frame);frame.src=url;
  const mp4='/prepared/renders/'+item.dir+'/'+item.id+'.mp4';
  $('rendered').hidden=true;
  fetch(mp4,{method:'HEAD'}).then(response=>{
    if(ticket!==generation)return;
    $('rendered').href=mp4;$('rendered').hidden=!response.ok;
  }).catch(()=>{if(ticket===generation)$('rendered').hidden=true;});
  history.replaceState(null,'','#'+item.id);
}
for(const [i,item] of items.entries()){
  const b=document.createElement('button');b.dataset.id=item.id;
  const image=document.createElement('img');image.src='/thumbs/'+item.dir+'-4.5.jpg';image.alt='';image.loading='lazy';
  const label=document.createElement('div'),num=document.createElement('small'),name=document.createElement('strong');
  num.textContent=item.id+' / '+item.en;name.textContent=item.zh.join(' / ');label.append(num,name);b.append(image,label);
  b.onclick=()=>choose(i);document.querySelector('nav').append(b);
}
$('prev').onclick=()=>choose(selected-1);$('next').onclick=()=>choose(selected+1);$('restart').onclick=()=>choose(selected);
const requested=items.findIndex(item=>item.id===location.hash.slice(1));choose(requested<0?selected:requested);
