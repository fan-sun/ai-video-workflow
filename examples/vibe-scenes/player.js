// 用途：在现有素材库入口浏览自有场景，控制播放、定位和复用版本。
// 运行：npm run preview:styles，打开/scenes/。
// 依赖：同源场景页面；只用一个父页面播放时钟，场景保持暂停时间轴。
(async()=>{
  const $=id=>document.getElementById(id),items=await (await fetch('/scene-library/catalog.json')).json();
  let item=items[0],preset='original',playing=false,time=0,last=0,generation=0,ready=false;
  const resize=()=>{$('player').style.transform='scale('+document.querySelector('.screen').clientWidth/1920+')';};
  new ResizeObserver(resize).observe(document.querySelector('.screen'));
  function seek(value){time=Math.max(0,Math.min(item.duration_s,value));if(ready)$('player').contentWindow.__sceneSeek(time);$('seek').value=time;$('time').textContent=time.toFixed(2)+' / '+item.duration_s.toFixed(2)+'秒';}
  function pause(){playing=false;$('play').textContent='播放';}
  async function load(){
    pause();ready=false;const ticket=++generation;
    $('title').textContent=item.name;$('desc').textContent=item.description;$('source').textContent='来源：'+item.source+' · '+item.range_s[0]+'—'+item.range_s[1]+'秒';
    $('version-note').textContent=item.variants?.[preset]?.note||(preset==='original'?'原效果：得到的乐与失去的痛，1∶2.25。':'复用demo：日常事务与重点任务，1∶3为演示比例。');
    $('tags').replaceChildren(...item.uses.map(value=>{const el=document.createElement('span');el.textContent=value;return el;}));
    document.querySelector('.variants').replaceChildren(...item.presets.map(key=>{const b=document.createElement('button');b.dataset.preset=key;b.textContent=item.variants?.[key]?.label||(key==='original'?'原效果 · 损失厌恶':'复用demo · 精力分配');b.setAttribute('aria-pressed',String(key===preset));b.onclick=()=>{preset=key;load();};return b;}));
    document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scene===item.id)));
    $('status').textContent='正在加载原场景实现…';$('seek').max=item.duration_s;
    const old=$('player'),frame=document.createElement('iframe');frame.id='player';frame.title=item.name;frame.allow='autoplay';old.replaceWith(frame);resize();
    frame.onload=async()=>{try{await frame.contentWindow.__sceneReady;if(ticket!==generation)return;if(!frame.contentWindow.__sceneSeek)throw new Error('场景初始化失败');ready=true;seek(0);$('status').textContent='可以播放、拖动时间，或切换复用demo';}catch(e){$('status').textContent='加载失败：'+e.message;}};
    frame.src='/scene-library/'+item.id+'/index.html?preset='+preset;
    const mp4='/scene-prepared/'+item.id+'/'+preset+'/preview.mp4';$('rendered').hidden=true;
    const response=await fetch(mp4,{method:'HEAD'});if(ticket===generation){$('rendered').href=mp4;$('rendered').hidden=!response.ok;}
    $('settings').href=preset==='focus'?'focus-demo.json':'/scene-library/'+item.id+'/'+(preset==='original'?'settings.js':'demo.json');
  }
  for(const entry of items){const button=document.createElement('button');button.dataset.scene=entry.id;button.textContent=entry.name;const note=document.createElement('small');note.textContent=Number(entry.duration_s.toFixed(2))+'秒 · '+entry.uses.join(' / ');button.append(note);button.onclick=()=>{item=entry;preset='original';load();};document.querySelector('nav').append(button);}
  $('play').onclick=()=>{if(!ready)return;playing=!playing;if(playing&&time>=item.duration_s)seek(0);last=performance.now();$('play').textContent=playing?'暂停':'播放';};
  $('restart').onclick=()=>{if(!ready)return;seek(0);playing=true;last=performance.now();$('play').textContent='暂停';};
  $('seek').oninput=e=>{pause();seek(Number(e.target.value));};
  function tick(now){if(playing&&ready){seek(time+(now-last)/1000);if(time>=item.duration_s)pause();}last=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);
  await load();
})().catch(error=>{document.getElementById('status').textContent='加载失败：'+error.message;});
