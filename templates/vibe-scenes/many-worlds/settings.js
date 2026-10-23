// 用途：本场景可复用参数与范围；原效果和示例在同一实现上运行。
// 运行：通过预览选版本，或使用prepare命令创建设置副本。
// 依赖：无；经典JS可同时由浏览器和Node加载。
globalThis.SceneConfig=(()=>{
 const presets={"original":{"focusOrder":[1,2]},"demo":{"focusOrder":[0,1]}};
 const text=(v,k,n)=>{if(typeof v!=='string'||!v.trim()||[...v].length>n||/[<>"'&\r\n]/.test(v))throw new Error(k+'内容为空、过长或包含不支持的字符');};
 function normalize(input){const v=JSON.parse(JSON.stringify(input));for(const k of Object.keys(v))if(!(k in presets.original))throw new Error('未知参数：'+k);
 if(!Array.isArray(v.focusOrder)||v.focusOrder.length!==2||v.focusOrder.some(n=>!Number.isInteger(n)||n<0||n>2)||v.focusOrder[0]===v.focusOrder[1])throw new Error('镜头须选择两个不同的空间编号0—2');return v;}
 return {presets,normalize};
})();
