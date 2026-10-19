// 用途：把原版绘制接入单条HyperFrames时间轴，保留场景源码。
// 运行：由examples/vibe-styles/run.mjs生成的合成自动加载。
// 依赖：原版Reel、GSAP及准备工具注入的__styleOptions。
(() => {
  const options=window.__styleOptions;
  window.__styleRandom=Reel.rng(17);
  Reel.cfg=defaults=>Object.assign({},defaults,options.sourceConfig);
  Reel.scene=def=>{
    const state={t:0},root=document.getElementById('stage');
    let ready=false;
    const caption=document.createElement('div');
    caption.style.cssText='position:absolute;left:20%;bottom:60px;width:60%;text-align:center;color:#fff5df;font:700 80px/1.3 VibeCaptions,sans-serif;white-space:pre-line;text-shadow:0 3px 8px #000;z-index:999;pointer-events:none';
    root.append(caption);
    const draw=()=>{
      if(!ready)return;
      const t=options.start+state.t;
      if(def.before)def.before(t);
      def.render(t);
      if(def.after)def.after(t);
      const line=options.captions.find(c=>state.t>=c.start&&state.t<c.end);
      caption.textContent=line?line.text.replace(/\p{P}/gu,''):'';
    };
    const tl=gsap.timeline({paused:true});
    tl.to(state,{t:options.duration,duration:options.duration,ease:'none',onUpdate:draw});
    window.__timelines=window.__timelines||{};
    window.__timelines.main=tl;
    window.__styleReady=(async()=>{
      await Promise.all((def.fonts||[]).map(font=>document.fonts.load(font)));
      await document.fonts.load('700 80px VibeCaptions');
      await document.fonts.ready;
      if(def.setup)await def.setup();
      ready=true;draw();
    })();
    // 当前项目固定的HyperFrames版本会等待buildReady中的初始化Promise。
    window.__hf=window.__hf||{};
    window.__hf.buildReady=window.__hf.buildReady||{};
    window.__hf.buildReady.main=window.__styleReady;
    window.__styleReady.catch(error=>{window.__styleError=String(error);console.error(error);});
    window.__styleSeek=async t=>{
      await window.__styleReady;
      const target=Math.max(0,Math.min(options.duration,t));
      if(tl.time()===target)draw();
      else tl.pause().seek(target,false);
    };
    window.__styleCues=(def.cues||[]).filter(c=>c.t>=options.start&&c.t<options.start+options.duration).map(c=>({...c,t:c.t-options.start}));
  };
})();
