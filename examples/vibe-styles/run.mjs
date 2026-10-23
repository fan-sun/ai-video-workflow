// 用途：预览20种本地风格，准备或渲染可接入本期制作的场景片段。
// 运行：npm run preview:styles；node --env-file-if-exists=.env examples/vibe-styles/run.mjs <prepare|render> <编号> [设置JSON]。
// 依赖：Node；渲染使用项目现有HyperFrames、Chrome、FFmpeg。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {runHyperframesHidden} from '../../build/common/hyperframes_hidden.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const LIB=path.join(ROOT,'templates/vibe-styles'),SOURCE=path.join(LIB,'source');
const WORK=path.join(ROOT,'.local/vibe-styles');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(SOURCE,'comp/meta.js'),'utf8'),sandbox);
export const catalog=sandbox.window.META;
export function prepareStyle(id,{outRoot=WORK,start=0,duration=10-start,sourceConfig={},captions=[]}={}){
  const item=catalog.find(x=>x.id===id);
  if(!item)throw new Error('未知风格编号：'+id);
  if(!['03','06','09','02','17','20'].includes(id))throw new Error('该编号尚未适配本项目时间轴；原版预览与源码已保留，当前prepare/render支持03、06、09、02、17、20');
  if(!Number.isFinite(start)||!Number.isFinite(duration)||start<0||duration<=0||start+duration>10)throw new Error('时间范围须位于原场景0—10秒内');
  if(!Array.isArray(captions)||captions.some((c,i)=>!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||c.end>duration||typeof c.text!=='string'||(i>0&&c.start<captions[i-1].end)))throw new Error('字幕时间须有序、不重叠且位于片段内');
  const out=path.resolve(outRoot,item.dir);
  fs.mkdirSync(out,{recursive:true});
  fs.cpSync(path.join(SOURCE,'styles',item.dir),out,{recursive:true});
  fs.cpSync(path.join(SOURCE,'lib'),path.join(out,'lib'),{recursive:true});
  // 只改变构建产物的播放模式，库内原文件保持逐字节一致。
  const corePath=path.join(out,'lib/core.js');
  const core=fs.readFileSync(corePath,'utf8');
  if(!core.includes("const RENDER = Q.has('render');"))throw new Error('原版核心入口变化，须重新核对接入');
  fs.writeFileSync(corePath,core.replace("const RENDER = Q.has('render');",'const RENDER = true;'),'utf8');
  fs.copyFileSync(path.join(SOURCE,'LICENSE'),path.join(out,'LICENSE'));
  fs.mkdirSync(path.join(out,'fonts'),{recursive:true});
  for(const weight of ['400','700'])fs.copyFileSync(path.join(ROOT,`templates/course-explainer-3x4/fonts/NotoSansSC-${weight}.woff2`),path.join(out,`fonts/NotoSansSC-${weight}.woff2`));
  fs.cpSync(path.join(LIB,'fonts'),path.join(out,'fonts'),{recursive:true});
  const fontCSS=fs.readFileSync(path.join(LIB,'fonts.css'),'utf8');
  fs.writeFileSync(path.join(out,'fonts.css'),fontCSS,'utf8');
  const settings={start,duration,sourceConfig,captions};
  const json=JSON.stringify(settings).replace(/</g,'\\u003c');
  let html=fs.readFileSync(path.join(out,'index.html'),'utf8').replaceAll('../../lib/','lib/');
  // 原版17的纸纹使用无种子随机数，适配副本固定种子以保证各渲染worker一致。
  if(id==='17')html=html.replaceAll('Math.random()','window.__styleRandom()');
  html=html.replace('<head>','<head><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><script>window.__styleOptions='+json+';</script><style>'+fontCSS+'</style>');
  const bridge=fs.readFileSync(path.join(LIB,'bridge.js'),'utf8');
  html=html.replace('<script src="lib/core.js"></script>','<script src="lib/core.js"></script><script>'+bridge+'</script>');
  html=html.replace('<div id="stage"></div>',`<div id="stage" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${duration}" style="position:relative;width:1920px;height:1080px;overflow:hidden"></div>`);
  fs.writeFileSync(path.join(out,'index.html'),html,'utf8');
  fs.writeFileSync(path.join(out,'settings.json'),JSON.stringify(settings,null,2)+'\n','utf8');
  return out;
}
export function serve(port=Number(process.env.STYLE_PREVIEW_PORT||5591)){
  const server=http.createServer((req,res)=>{
    try{
      const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      let base=HERE,relative=name==='/'?'index.html':name.slice(1);
      if(name.startsWith('/ref/')){base=SOURCE;relative=name.slice(5);}
      if(name.startsWith('/prepared/')){base=WORK;relative=name.slice(10);}
      if(name.startsWith('/scenes/')){base=path.join(ROOT,'examples/vibe-scenes');relative=name.slice(8)||'index.html';}
      if(name.startsWith('/scene-library/')){base=path.join(ROOT,'templates/vibe-scenes');relative=name.slice(15);}
      if(name.startsWith('/scene-prepared/')){base=path.join(ROOT,'.local/vibe-scenes');relative=name.slice(16);}
      if(name.startsWith('/teaching-scenes/')){base=path.join(ROOT,'examples/teaching-scenes');relative=name.slice(17)||'index.html';}
      if(name.startsWith('/teaching-prepared/')){base=path.join(ROOT,'.local/teaching-scenes');relative=name.slice(19);}
      const file=path.resolve(base,relative),rel=path.relative(base,file);
      if(rel.startsWith('..')||path.isAbsolute(rel)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.md':'text/plain; charset=utf-8','.mp4':'video/mp4','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.json':'application/json; charset=utf-8'};
      const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'};
      if(path.extname(file)==='.mp4'){
        const size=fs.statSync(file).size;headers['Accept-Ranges']='bytes';
        if(req.headers.range){
          const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
          const start=match?Number(match[1]):-1,end=match&&match[2]?Math.min(Number(match[2]),size-1):size-1;
          if(start<0||start>=size||end<start){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}
          res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});
          fs.createReadStream(file,{start,end}).on('error',error=>res.destroy(error)).pipe(res);return;
        }
        headers['Content-Length']=size;
      }
      res.writeHead(200,headers);
      fs.createReadStream(file).on('error',error=>res.destroy(error)).pipe(res);
    }catch(error){res.writeHead(400);res.end('Invalid path');}
  });
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log('20种风格素材库：http://127.0.0.1:'+server.address().port+'/'));
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{
  const [command='serve',id='03',settingsFile]=process.argv.slice(2);
  if(command==='serve')serve();
  else if(['prepare','render'].includes(command)){
    const options=settingsFile?JSON.parse(fs.readFileSync(settingsFile,'utf8')):{};
    const out=prepareStyle(id,options);console.log('合成目录：'+out);
    if(command==='render'){
      const begun=performance.now();
      runHyperframesHidden(['lint',out]);
      runHyperframesHidden(['render',out,'--output',path.join(out,id+'.mp4'),'--quality','high','--fps','30','--workers','2','--gpu']);
      fs.writeFileSync(path.join(out,'render-result.json'),JSON.stringify({elapsed_seconds:(performance.now()-begun)/1000,settings:JSON.parse(fs.readFileSync(path.join(out,'settings.json'),'utf8')),output:id+'.mp4'},null,2)+'\n','utf8');
    }
  }else throw new Error('命令须为serve、prepare或render');
}catch(error){console.error(error);process.exitCode=1;}
