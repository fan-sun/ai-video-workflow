// 用途：启动本地素材预览，或为指定动效生成并渲染独立技术示例。
// 运行：npm run preview:motion；node examples/vibe-motion/run.mjs <prepare|render> <动效id>。
// 依赖：Node；渲染另用现有HyperFrames、Chrome与FFmpeg环境。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {catalog} from './demos.mjs';
import {runHyperframesHidden} from '../../build/common/hyperframes_hidden.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const WORK=path.join(ROOT,'.local/vibe-motion');
const PORT=Number(process.env.MOTION_PREVIEW_PORT||5588);

export function prepareDemo(effect='morph',outRoot=WORK){
  if(!catalog.some(item=>item.id===effect))throw new Error('未知动效：'+effect);
  const out=path.resolve(outRoot,effect);fs.mkdirSync(path.join(out,'fonts'),{recursive:true});
  fs.copyFileSync(path.join(ROOT,'templates/vibe-motion/motion.js'),path.join(out,'motion.js'));
  const demos=fs.readFileSync(path.join(HERE,'demos.mjs'),{encoding:'utf8'}).replace('../../templates/vibe-motion/motion.js','./motion.js');
  fs.writeFileSync(path.join(out,'demos.js'),demos,{encoding:'utf8'});
  fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({private:true,type:'module'})+'\n',{encoding:'utf8'});
  const html=fs.readFileSync(path.join(HERE,'composition.html'),{encoding:'utf8'}).replace('__EFFECT__',effect);
  fs.writeFileSync(path.join(out,'index.html'),html,{encoding:'utf8'});
  fs.copyFileSync(path.join(ROOT,'templates/course-explainer-3x4/fonts/NotoSansSC-700.woff2'),path.join(out,'fonts/NotoSansSC-700.woff2'));
  return out;
}

export function serve(port=PORT){
  const allowed=['examples/vibe-motion/','templates/vibe-motion/','templates/course-explainer-3x4/fonts/'];
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.md':'text/plain; charset=utf-8','.woff2':'font/woff2'};
  const server=http.createServer((req,res)=>{
    let relative;
    try{
      const url=new URL(req.url,'http://localhost');
      const pathname=decodeURIComponent(url.pathname);
      if(pathname==='/'){res.writeHead(302,{Location:'/examples/vibe-motion/index.html'});res.end();return;}
      relative=pathname.replace(/^\/+/, '');
      const file=path.resolve(ROOT,relative),actual=path.relative(ROOT,file).split(path.sep).join('/');
      if(!allowed.some(prefix=>actual.startsWith(prefix))||!fs.existsSync(file)||!fs.statSync(file).isFile()){
        res.writeHead(404);res.end('Not found');return;
      }
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      fs.createReadStream(file).on('error',error=>res.destroy(error)).pipe(res);
    }catch(error){res.writeHead(400);res.end('Invalid path');}
  });
  server.on('error',error=>{console.error('素材预览启动失败：'+error.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`动效素材库：http://127.0.0.1:${server.address().port}/`));
  return server;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{
  const [command='serve',effect='morph']=process.argv.slice(2);
  if(command==='serve')serve();
  else if(command==='prepare'||command==='render'){
    const folder=prepareDemo(effect);console.log('示例目录：'+folder);
    if(command==='render'){
      runHyperframesHidden(['lint',folder]);
      runHyperframesHidden(['render',folder,'--output',path.join(folder,`${effect}.mp4`),'--quality','high','--fps','30','--workers','2','--gpu']);
    }
  }else throw new Error('命令必须为serve、prepare或render');
}catch(error){console.error(error.message);process.exitCode=1;}
