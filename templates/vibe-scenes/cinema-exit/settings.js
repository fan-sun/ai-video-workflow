// 用途：本场景可复用参数与范围；原效果和示例在同一实现上运行。
// 运行：通过预览选版本，或使用prepare命令创建设置副本。
// 依赖：无；经典JS可同时由浏览器和Node加载。
globalThis.SceneConfig=(()=>{
 const presets={"original":{"minutes":60,"remainingLabel":"剩下的","stayLabel":"留下","leaveLabel":"离开","ticketLabel":"电影票"},"demo":{"minutes":30,"remainingLabel":"还可安排","stayLabel":"继续看","leaveLabel":"去读书","ticketLabel":"观影票"}};
 const text=(v,k,n)=>{if(typeof v!=='string'||!v.trim()||[...v].length>n||/[<>"'&\r\n]/.test(v))throw new Error(k+'内容为空、过长或包含不支持的字符');};
 function normalize(input){const v=JSON.parse(JSON.stringify(input));for(const k of Object.keys(v))if(!(k in presets.original))throw new Error('未知参数：'+k);
 if(!Number.isInteger(v.minutes)||v.minutes<10||v.minutes>120)throw new Error('分钟须为10—120的整数');for(const k of ['remainingLabel','stayLabel','leaveLabel','ticketLabel'])text(v[k],k,5);return v;}
 return {presets,normalize};
})();
