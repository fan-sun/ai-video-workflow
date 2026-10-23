// 用途：核对原片场景保留、参数联动、倒退定位以及现有素材库的实际浏览入口。
// 运行：node --env-file-if-exists=.env examples/vibe-scenes/check.mjs
// 依赖：本机Chrome和已有puppeteer-core；原片对照需本地ep05-v11源文件。
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {once} from 'node:events';
import {resolveChromeExecutable} from '../../build/common/check_course_cover.mjs';
import {serve} from '../vibe-styles/run.mjs';
import {prepareScene} from './run.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),OUT=path.join(ROOT,'.local/vibe-scenes/check');
fs.mkdirSync(OUT,{recursive:true});
const require=createRequire(import.meta.url),roots=[ROOT,process.env.PUPPETEER_ROOT].filter(Boolean);
for(const cache of [process.env.npm_config_cache,process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'npm-cache'),path.join(os.homedir(),'.npm')].filter(Boolean)){
  const npx=path.join(cache,'_npx');if(fs.existsSync(npx))roots.push(...fs.readdirSync(npx).map(x=>path.join(npx,x,'node_modules')));
}
let puppeteer;for(const root of roots){try{puppeteer=require(require.resolve('puppeteer-core',{paths:[root]}));break;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}}
if(!puppeteer)throw new Error('缺少已有浏览器驱动puppeteer-core');
const reference=path.join(OUT,'reference');fs.mkdirSync(reference,{recursive:true});
const assetSource=path.join(ROOT,'course/episodes/05-loss-aversion/v11/assets');
fs.cpSync(assetSource,path.join(reference,'assets'),{recursive:true});
fs.cpSync(path.join(ROOT,'templates/vibe-scenes/feeling-scale/fonts'),path.join(reference,'fonts'),{recursive:true});
const html=fs.readFileSync(path.join(ROOT,'course/acts/ep05_loss-aversion/v11/act3.html'),'utf8').replace('/*__SUBS__*/','const SUBS=[];');
fs.writeFileSync(path.join(reference,'index.html'),html,'utf8');
prepareScene('feeling-scale');prepareScene('feeling-scale',{preset:'focus'});
const server=serve(0);await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
let browser;const errors=[],report={status:'running',scope:'源码保持、真实浏览器定位、倒退、布局、参数联动与播放推进；用户视觉认可另行确认'};
async function difference(page,a,b){
  return page.evaluate(async(a,b)=>{
    async function pixels(data){const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const c=canvas.getContext('2d');c.drawImage(img,0,0);return c.getImageData(0,0,img.width,img.height).data;}
    const x=await pixels(a),y=await pixels(b);let sum=0,changed=0;
    for(let i=0;i<x.length;i+=4){let peak=0;for(let j=0;j<3;j++){const d=Math.abs(x[i+j]-y[i+j]);sum+=d;peak=Math.max(peak,d);}if(peak>12)changed++;}
    return {mean:sum/(x.length/4*3),changed_ratio:changed/(x.length/4)};
  },Buffer.from(a).toString('base64'),Buffer.from(b).toString('base64'));
}
try{
  browser=await puppeteer.launch({executablePath:resolveChromeExecutable(),headless:true,args:['--use-gl=angle','--use-angle=d3d11'],protocolTimeout:180000});
  const page=await browser.newPage();page.setDefaultNavigationTimeout(120000);page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
  const times=[2.2,2.8,3.6,6.7,8.2],source=[];
  await page.goto(base+'/scene-prepared/check/reference/index.html',{waitUntil:'networkidle0',timeout:120000});
  await page.evaluate(()=>window.__hf.buildReady.main);
  for(const t of times){await page.evaluate(t=>window.__vibeRender(35.3+t),t);source.push(await page.screenshot({path:path.join(OUT,'source-'+t+'.png')}));}
  console.time('独立场景首次加载');await page.goto(base+'/scene-library/feeling-scale/index.html',{waitUntil:'networkidle0'});await page.evaluate(()=>window.__sceneReady);console.timeEnd('独立场景首次加载');
  report.original=[];
  const original=[];
  for(let i=0;i<times.length;i++){
    const t=times[i];await page.evaluate(t=>window.__sceneSeek(t),t);const shot=await page.screenshot({path:path.join(OUT,'original-'+t+'.png')});original.push(shot);
    const diff=await difference(page,source[i],shot);report.original.push({t,...diff});
    console.log('原版对照',t,JSON.stringify(diff));
    assert.ok(diff.mean<.35&&diff.changed_ratio<.005,'原实现对照差异过大：'+JSON.stringify({t,...diff}));
  }
  await page.evaluate(()=>window.__sceneSeek(2.8));const reverse=await difference(page,await page.screenshot({path:path.join(OUT,'reverse.png')}),original[1]);
  assert.ok(reverse.mean<.15&&reverse.changed_ratio<.001,'倒退残留');report.reverse=reverse;
  const oldState=await page.evaluate(()=>{window.__sceneSeek(8.2);return window.__sceneState;});
  await page.goto(base+'/scene-library/feeling-scale/index.html?preset=focus',{waitUntil:'networkidle0'});await page.evaluate(()=>window.__sceneReady);
  report.focus=[];
  for(const t of [0,1,1.8,2.8,3.6,5.4,6.7,8.2]){
    await page.evaluate(t=>window.__sceneSeek(t),t);await page.screenshot({path:path.join(OUT,'focus-'+t+'.png')});
    const sample=await page.evaluate(()=>({state:window.__sceneState,labels:Array.from(document.querySelectorAll('.label')).filter(el=>Number(getComputedStyle(el).opacity)>.9).map(el=>{const r=el.getBoundingClientRect();return {id:el.id,x:r.x,y:r.y,right:r.right,bottom:r.bottom};})}));
    assert.ok(sample.labels.every(el=>el.x>=0&&el.y>=0&&el.right<=1920&&el.bottom<=1080),'文字超出画面');report.focus.push(sample.state);
  }
  const changedState=report.focus.at(-1);assert.equal(changedState.ratio,3);assert.ok(changedState.tilt<oldState.tilt-.1,'比例没有改变实体倾角');
  assert.ok(changedState.loss[1]<oldState.loss[1],'砝码落点没有跟随倾角');report.parameter_linkage={original:oldState,focus:changedState};
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});await page.goto(base+'/scenes/',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('可以播放'));
  await page.click('[data-preset="focus"]');await page.waitForFunction(()=>document.querySelector('#player').contentWindow.__sceneState?.ratio===3);
  await page.click('#play');await page.waitForFunction(()=>document.querySelector('#player').contentWindow.__sceneState.time>1.5,{timeout:30000});await page.click('#play');
  await page.$eval('#seek',el=>{el.value='8.2';el.dispatchEvent(new Event('input'));});await page.screenshot({path:path.join(OUT,'gallery.png')});
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});await page.screenshot({path:path.join(OUT,'gallery-mobile.png')});
  report.gallery='原效果/复用demo切换、播放推进、拖动及窄屏截图完成';assert.deepEqual(errors,[]);report.status='passed';console.log(JSON.stringify(report,null,2));
}catch(error){report.status='failed';report.error=error.message;throw error;}
finally{report.errors=errors;fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');if(browser)await browser.close();server.close();}
