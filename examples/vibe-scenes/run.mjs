// 用途：准备及渲染Vibe自有场景工作副本，浏览沿用现有素材库服务。
// 运行：node --env-file-if-exists=.env examples/vibe-scenes/run.mjs <prepare|render> feeling-scale [设置JSON]
// 依赖：现有HyperFrames工具链；预览运行npm run preview:styles后打开/scenes/。
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runHyperframesHidden} from '../../build/common/hyperframes_hidden.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const LIB=path.join(ROOT,'templates/vibe-scenes');
export const catalog=JSON.parse(fs.readFileSync(path.join(LIB,'catalog.json'),'utf8'));
export function prepareScene(id,{outRoot=path.join(ROOT,'.local/vibe-scenes'),preset='original',settings={}}={}){
  if(!catalog.some(item=>item.id===id))throw new Error('未知场景：'+id);
  const source=path.join(LIB,id),config=fs.readFileSync(path.join(source,'settings.js'),'utf8'),sandbox={};vm.runInNewContext(config,sandbox);
  if(!sandbox.SceneConfig.presets[preset])throw new Error('未知场景版本：'+preset);
  const normalized=sandbox.SceneConfig.normalize({...sandbox.SceneConfig.presets[preset],...settings});
  const out=path.resolve(outRoot,id,preset);
  if(out===source||out.startsWith(LIB+path.sep))throw new Error('工作副本不能覆盖场景库');
  fs.mkdirSync(out,{recursive:true});fs.cpSync(source,out,{recursive:true});
  fs.writeFileSync(path.join(out,'settings.js'),config+'\nglobalThis.SCENE_BUILD_OPTIONS='+JSON.stringify(normalized).replaceAll('<','\\u003c')+';\n','utf8');
  fs.writeFileSync(path.join(out,'settings.json'),JSON.stringify(normalized,null,2)+'\n','utf8');
  if(id==='attention-contrast'){
    for(const file of ['glyphs.js','extra-glyph.js'])vm.runInNewContext(fs.readFileSync(path.join(out,file),'utf8'),sandbox);
    if(!sandbox.SceneGlyphs[normalized.title]){
      const result=spawnSync(process.env.SCENE_PYTHON||'python',[path.join(ROOT,'examples/vibe-scenes/title_glyphs.py'),path.join(out,'fonts/NotoSansSC-700.woff2'),normalized.title,path.join(out,'extra-glyph.js')],{encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
      if(result.status!==0)throw new Error('标题矢量生成失败；请将SCENE_PYTHON设为装有fontTools和Brotli的Python。'+(result.stderr||result.error?.message||''));
    }
  }
  return out;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [command='prepare',id='feeling-scale',file]=process.argv.slice(2);
  if(!['prepare','render'].includes(command))throw new Error('命令须为prepare或render');
  const options=file?JSON.parse(fs.readFileSync(file,'utf8')):{};
  const out=prepareScene(id,options);console.log('场景副本：'+out);
  if(command==='render'){
    runHyperframesHidden(['lint',out]);
    runHyperframesHidden(['render',out,'--output',path.join(out,'preview.mp4'),'--quality','high','--fps','30','--workers','2','--browser-gpu','--gpu']);
  }
}
