// 用途：复制无声教学画面结构及替换素材，不读取讲解或配音时间。
// 运行：node examples/teaching-scenes/visual.mjs <prepare|render> <catalog中的素材ID> [设置JSON]。
// 依赖：Node、项目既有HyperFrames；参数中的素材路径相对项目根目录。
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {runHyperframesHidden} from '../../build/common/hyperframes_hidden.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),LIB=path.join(ROOT,'templates/teaching-scenes');
export const catalog=JSON.parse(fs.readFileSync(path.join(LIB,'catalog.json'),'utf8'));
export function prepareVisualScene(id,{preset='original',settings={},outRoot='.local/teaching-scenes/visuals'}={}){
 const item=catalog.find(x=>x.id===id);if(!item||!['original','demo'].includes(preset))throw new Error('未知无声素材或版本');
 const source=path.join(LIB,id),spec=JSON.parse(fs.readFileSync(path.join(source,'presets.json'),'utf8'));
 const config={...spec[preset],...settings};for(const key of Object.keys(config))if(!(key in spec.original))throw new Error('未知参数：'+key);
 const out=path.resolve(ROOT,outRoot,id,preset);if(out===LIB||out.startsWith(LIB+path.sep))throw new Error('工作副本不能覆盖模板');
 const assets=[];
 for(const [key,value] of Object.entries(config)){
  if(key.endsWith('Asset')){
   if(value===null)continue;
   if(typeof value!=='string')throw new Error('素材路径须为字符串');
   const file=path.resolve(ROOT,value);if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error('素材文件不存在：'+value);
   if(!/\.(svg|png|jpe?g|webp)$/i.test(file))throw new Error('仅支持本地SVG或图片素材');
   const relative='assets/'+key+'-'+path.basename(file);assets.push({file,relative});config[key]=relative;
  }else if(key.endsWith('Color')){if(!/^#[0-9a-f]{6}$/i.test(value))throw new Error('颜色须为六位HEX');}
  else if(typeof value!=='string'||[...value].length>(key.endsWith('Text')?40:10)||/[<>\r\n]/.test(value))throw new Error(key.endsWith('Text')?'说明须为40字以内纯文本':'标签须为10字以内纯文本');
 }
 fs.mkdirSync(out,{recursive:true});fs.cpSync(source,out,{recursive:true});fs.mkdirSync(path.join(out,'assets'),{recursive:true});
 for(const {file,relative} of assets)fs.copyFileSync(file,path.join(out,relative));
 fs.writeFileSync(path.join(out,'settings.js'),'globalThis.VisualOptions='+JSON.stringify(config).replaceAll('<','\\u003c')+';\n','utf8');
 fs.writeFileSync(path.join(out,'settings.json'),JSON.stringify({preset,settings:{...spec[preset],...settings}},null,2)+'\n','utf8');
 return out;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,id,file]=process.argv.slice(2);if(!['prepare','render'].includes(command))throw new Error('用法：prepare或render 素材ID [设置JSON]');
 const out=prepareVisualScene(id,file?JSON.parse(fs.readFileSync(path.resolve(ROOT,file),'utf8')):{});console.log(out);
 if(command==='render'){runHyperframesHidden(['lint',out]);runHyperframesHidden(['render',out,'--output',path.join(out,'preview.mp4'),'--quality','high','--fps','30','--workers','2','--gpu']);}
}
