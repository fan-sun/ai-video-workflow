// 用途：为保存的原场景提供独立片段时间、素材等待与统一预览状态。
// 运行：由同目录index.html在原场景初始化后调用。
// 依赖：原场景唯一暂停时间轴、SceneSpec和SceneOptions。
window.registerScene=function(tl){
  const callback=tl.eventCallback('onUpdate');
  function update(){
    if(callback)callback.call(tl);
    const local=window.SCENE_REFERENCE?tl.time()-SceneSpec.start:tl.time();
    window.__sceneState={time:local,sourceTime:SceneSpec.start+local,options:SceneOptions,
      event:window.__actState||window.__comparisonFrame||window.__act1Event||window.__act3Event,
      phase:window.__episodeFrame?.phase};
  }
  tl.eventCallback('onUpdate',update);
  window.__sceneSeek=t=>{const local=Math.max(0,Math.min(SceneSpec.duration-0.000001,t)),before=tl.time();tl.time(local+(window.SCENE_REFERENCE?SceneSpec.start:0),false);if(tl.time()===before)update();};
  window.__hf=window.__hf||{};window.__hf.buildReady=window.__hf.buildReady||{};
  window.__sceneReady=window.__hf.buildReady.main=Promise.all([document.fonts.ready,window.__motionReady]).then(()=>{window.__sceneSeek(0);});
  return tl;
};
