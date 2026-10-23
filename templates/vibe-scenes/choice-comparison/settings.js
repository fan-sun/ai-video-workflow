// 用途：本场景可复用参数与范围；原效果和示例在同一实现上运行。
// 运行：通过预览选版本，或使用prepare命令创建设置副本。
// 依赖：无；经典JS可同时由浏览器和Node加载。
globalThis.SceneConfig=(()=>{
 const presets={"original":{"items":[["招牌拌饭",0],["热汤拉面",1],["鸡肉咖喱",2],["手工水饺",3],["香煎鸡排",4],["牛肉汉堡",5],["三文鱼寿司",6],["鲜虾意面",7],["田园沙拉",8],["芝士披萨",9],["照烧鸡饭",4],["番茄鸡蛋饭",0]],"attempts":[2,5,10,1,7],"phoneTitle":"今晚吃什么"},"demo":{"items":[["菌菇拌饭",0],["番茄汤面",1],["牛肉咖喱",2],["素三鲜饺",3],["香煎鱼排",4],["鸡肉汉堡",5],["鳗鱼寿司",6],["蘑菇意面",7],["牛油果沙拉",8],["培根披萨",9],["照烧鱼饭",4],["杂粮饭",0]],"attempts":[8,3,6,0,9],"phoneTitle":"午餐吃什么"}};
 const text=(v,k,n)=>{if(typeof v!=='string'||!v.trim()||[...v].length>n||/[<>"'&\r\n]/.test(v))throw new Error(k+'内容为空、过长或包含不支持的字符');};
 function normalize(input){const v=JSON.parse(JSON.stringify(input));for(const k of Object.keys(v))if(!(k in presets.original))throw new Error('未知参数：'+k);
 if(!Array.isArray(v.items)||v.items.length!==12)throw new Error('须提供12个菜品');v.items.forEach(a=>{if(!Array.isArray(a)||a.length!==2||!Number.isInteger(a[1])||a[1]<0||a[1]>9)throw new Error('菜品造型编号须为0—9');text(a[0],'菜品名称',6);});if(!Array.isArray(v.attempts)||v.attempts.length!==5||v.attempts.some(n=>!Number.isInteger(n)||n<0||n>11))throw new Error('比较顺序须为5个0—11的编号');text(v.phoneTitle,'手机标题',6);return v;}
 return {presets,normalize};
})();
