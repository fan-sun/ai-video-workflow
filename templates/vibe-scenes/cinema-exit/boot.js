// 片段配置在原场景脚本之前初始化。
globalThis.SceneSpec={"id":"cinema-exit","start":21.3,"end":31.3,"duration":10.0};const preset=new URLSearchParams(location.search).get("preset")||"original";if(!SceneConfig.presets[preset])throw new Error("未知版本");globalThis.SceneOptions=SceneConfig.normalize(globalThis.SCENE_BUILD_OPTIONS||SceneConfig.presets[preset]);window.SCENE_REFERENCE=false;
