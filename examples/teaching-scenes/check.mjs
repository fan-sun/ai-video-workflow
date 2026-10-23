// 用途：核验教学动作首次出现、返回播放、原效果与讲解定位。
// 运行：node examples/teaching-scenes/check.mjs；先准备并渲染两个版本。
// 依赖：本机Chrome、已有puppeteer-core及已发布EP06源文件。
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {once} from 'node:events';
import {resolveChromeExecutable} from '../../build/common/check_course_cover.mjs';
import {serve} from '../vibe-styles/run.mjs';import {prepareTeachingScene} from './run.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),OUT=path.join(ROOT,'.local/teaching-scenes/check');
fs.mkdirSync(OUT,{recursive:true});
const require=createRequire(import.meta.url),roots=[ROOT,process.env.PUPPETEER_ROOT].filter(Boolean);
for(const cache of [process.env.npm_config_cache,process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'npm-cache'),path.join(os.homedir(),'.npm')].filter(Boolean)){
 const npx=path.join(cache,'_npx');if(fs.existsSync(npx))roots.push(...fs.readdirSync(npx).map(x=>path.join(npx,x,'node_modules')));
}
let puppeteer;for(const root of roots){try{puppeteer=require(require.resolve('puppeteer-core',{paths:[root]}));break;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}}
if(!puppeteer)throw new Error('缺少已有puppeteer-core');
async function diff(page,a,b){return page.evaluate(async(a,b)=>{
 async function pixels(data){const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return g.getImageData(0,0,c.width,c.height).data;}
 const x=await pixels(a),y=await pixels(b);let sum=0,changed=0;for(let i=0;i<x.length;i+=4){let peak=0;for(let j=0;j<3;j++){const d=Math.abs(x[i+j]-y[i+j]);sum+=d;peak=Math.max(peak,d);}if(peak>12)changed++;}return {mean:sum/(x.length/4*3),changed:changed/(x.length/4)};
},Buffer.from(a).toString('base64'),Buffer.from(b).toString('base64'));}
const source=fs.readFileSync(path.join(ROOT,'course/acts/ep06_multi-agent/act1.html'),'utf8');
const reference=path.join(ROOT,'.local/teaching-scenes/reference');fs.mkdirSync(reference,{recursive:true});fs.cpSync(path.join(ROOT,'templates/teaching-scenes/task-handoff'),reference,{recursive:true});
const funcs=source.slice(source.indexOf('function enter('),source.indexOf('(function(){',source.indexOf('function enter(')));
const actions=source.slice(source.indexOf('enter("#s2",25.426);'),source.indexOf('tl.to("#s0",'))+'tl.to("#s2",{opacity:0,y:-18,duration:.2,ease:"power2.in"},37.924);';
const referenceHTML=fs.readFileSync(path.join(reference,'index.html'),'utf8').split('<script src="gsap.min.js">')[0].replace('__DURATION__','44.416')+'<script src="gsap.min.js"></script><script>const tl=gsap.timeline({paused:true});'+funcs+actions+'window.__timelines={main:tl};window.__teachingSeek=t=>{tl.pause().totalTime(t+25.426,false);};window.__sceneReady=document.fonts.ready;</script></body></html>';
fs.writeFileSync(path.join(reference,'index.html'),referenceHTML,'utf8');
const server=serve(0);await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
const report={status:'running',versions:[],errors:[]};let browser;
try{
 browser=await puppeteer.launch({executablePath:resolveChromeExecutable(),headless:true,protocolTimeout:30000});
 const page=await browser.newPage();await page.setViewport({width:1080,height:1440,deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));
 const snapshots={};
 for(const preset of ['original','demo']){
  const {data}=prepareTeachingScene(JSON.parse(fs.readFileSync(path.join(ROOT,'examples/teaching-scenes/'+preset+'.json'),'utf8')));
  await page.goto(base+'/teaching-prepared/task-handoff/'+preset+'/index.html',{waitUntil:'networkidle0'});await page.evaluate(()=>window.__sceneReady);
  const reveals=await page.evaluate(()=>window.__teachingReveals);const item={preset,reveals:reveals.length,duration:data.duration};
  for(const r of reveals){
   const opacity=async t=>page.evaluate(({t,s})=>{window.__teachingSeek(t);let opacity=1;for(let el=document.querySelector(s);el;el=el.parentElement)opacity*=Number(getComputedStyle(el).opacity);return opacity;},{t,s:r.selector});
   if(r.start>0)assert.ok(await opacity(r.start-.03)<.001,'提前出现：'+r.selector);
   assert.ok(await opacity(r.start+.3)>.15,'对应旁白时未出现：'+r.selector);
  }
  const times=[1,data.beats.channels.start+.8,data.beats.transfer.start+.8,data.beats.question.start+.65];snapshots[preset]=[];
  for(const [i,t] of times.entries()){await page.evaluate(t=>window.__teachingSeek(t),t);await page.screenshot({path:path.join(OUT,preset+'-'+i+'.png')});await page.$eval('#substrip',el=>el.style.visibility='hidden');snapshots[preset].push(await page.screenshot());await page.$eval('#substrip',el=>el.style.visibility='');}
  await page.evaluate(t=>window.__teachingSeek(t),times[1]);await page.$eval('#substrip',el=>el.style.visibility='hidden');item.reverse=await diff(page,snapshots[preset][1],await page.screenshot());assert.ok(item.reverse.mean<.1&&item.reverse.changed<.001,'倒退有残留');
  if(preset==='original'){
   await page.goto(base+'/teaching-prepared/reference/index.html',{waitUntil:'networkidle0'});await page.evaluate(()=>window.__sceneReady);item.source=[];
   for(const [i,t] of times.entries()){await page.evaluate(t=>window.__teachingSeek(t),t);const d=await diff(page,snapshots.original[i],await page.screenshot());item.source.push(d);assert.ok(d.mean<.35&&d.changed<.005,'与原场景存在非预期差异：'+t+' '+JSON.stringify(d));}
  }
  report.versions.push(item);
 }
 await page.setViewport({width:1400,height:1040});await page.goto(base+'/teaching-scenes/narrated-demo.html',{waitUntil:'networkidle0'});
 for(const preset of ['original','demo']){await page.click('[data-preset="'+preset+'"]');await page.waitForFunction(()=>document.querySelector('#video').readyState>=2);await page.waitForFunction(()=>document.querySelectorAll('#lines button').length===9);await page.click('#lines li:nth-child(4) button');await page.waitForFunction(()=>document.querySelector('#video').currentTime>6);await page.$eval('#video',v=>v.play());await page.waitForFunction(()=>!document.querySelector('#video').paused&&document.querySelector('#video').currentTime>7);await page.$eval('#video',v=>v.pause());assert.equal(await page.$eval('#error',el=>el.textContent),'');}
 await page.screenshot({path:path.join(OUT,'gallery.png')});assert.deepEqual(report.errors,[]);report.status='passed';console.log(JSON.stringify(report,null,2));
}catch(e){report.status='failed';report.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');if(browser)await browser.close();server.close();}
