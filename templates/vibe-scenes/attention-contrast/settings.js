// 用途：本场景可复用参数与范围；原效果和示例在同一实现上运行。
// 运行：通过预览选版本，或使用prepare命令创建设置副本。
// 依赖：无；经典JS可同时由浏览器和Node加载。
globalThis.SceneConfig=(()=>{
 const presets={"original":{"title":"聚光灯效应","attentionLabel":"你以为"},"demo":{"title":"注意力转移","attentionLabel":"先看这里"}};
 const text=(v,k,n)=>{if(typeof v!=='string'||!v.trim()||[...v].length>n||/[<>"'&\r\n]/.test(v))throw new Error(k+'内容为空、过长或包含不支持的字符');};
 function normalize(input){const v=JSON.parse(JSON.stringify(input));for(const k of Object.keys(v))if(!(k in presets.original))throw new Error('未知参数：'+k);
 text(v.title,'标题',5);if([...v.title].length!==5)throw new Error('立体标题须恰好五字');text(v.attentionLabel,'注意标签',5);return v;}
 return {presets,normalize};
})();
