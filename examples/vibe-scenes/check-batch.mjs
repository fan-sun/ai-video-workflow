// 用途：核对第二批四个场景的原效果、复用变化、倒退与目录操作。
// 运行：node examples/vibe-scenes/check-batch.mjs；对照文件由本次提取脚本生成。
// 依赖：本机Chrome、已有puppeteer-core及.local/vibe-scenes/source-references。
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {once} from 'node:events';
import {resolveChromeExecutable} from '../../build/common/check_course_cover.mjs';
import {serve} from '../vibe-styles/run.mjs';import {prepareScene,catalog} from './run.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),OUT=path.join(ROOT,'.local/vibe-scenes/batch-check');
const samples={'cinema-exit':[0,3,5.5,9.7],'choice-comparison':[0,1.8,2.7,4.03],'attention-contrast':[0,2.5,4.7,7.7666667],'many-worlds':[0,1.9,4.7,9.03]};
fs.mkdirSync(OUT,{recursive:true});
const require=createRequire(import.meta.url),roots=[ROOT,process.env.PUPPETEER_ROOT].filter(Boolean);
for(const cache of [process.env.npm_config_cache,process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'npm-cache'),path.join(os.homedir(),'.npm')].filter(Boolean)){
 const npx=path.join(cache,'_npx');if(fs.existsSync(npx))roots.push(...fs.readdirSync(npx).map(x=>path.join(npx,x,'node_modules')));
}
let puppeteer;for(const root of roots){try{puppeteer=require(require.resolve('puppeteer-core',{paths:[root]}));break;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}}
if(!puppeteer)throw new Error('缺少已有puppeteer-core');
const server=serve(0);await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
const report={status:'running',scenes:[],errors:[]};let browser;
async function diff(page,a,b){return page.evaluate(async(a,b)=>{
 async function pixels(data){const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return g.getImageData(0,0,c.width,c.height).data;}
 const x=await pixels(a),y=await pixels(b);let sum=0,changed=0;for(let i=0;i<x.length;i+=4){let peak=0;for(let j=0;j<3;j++){const d=Math.abs(x[i+j]-y[i+j]);sum+=d;peak=Math.max(peak,d);}if(peak>12)changed++;}return {mean:sum/(x.length/4*3),changed:changed/(x.length/4)};
},Buffer.from(a).toString('base64'),Buffer.from(b).toString('base64'));}
try{
 browser=await puppeteer.launch({executablePath:resolveChromeExecutable(),headless:true,args:['--use-gl=angle','--use-angle=d3d11'],protocolTimeout:180000});
 for(const [id,times] of Object.entries(samples)){
  const folder=path.join(OUT,id);fs.mkdirSync(folder,{recursive:true});
  for(const preset of ['original','demo'])prepareScene(id,{preset});
  const page=await browser.newPage();page.setDefaultNavigationTimeout(120000);page.on('pageerror',e=>report.errors.push(id+': '+e.message));await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
  const shots={};const item={id,original:[],demo:[]};report.scenes.push(item);
  for(const preset of ['reference','original','demo']){
   const route=preset==='reference'?'/scene-prepared/source-references/'+id+'/index.html':'/scene-prepared/'+id+'/'+preset+'/index.html';
   await page.goto(base+route,{waitUntil:'networkidle0'});await page.evaluate(()=>window.__sceneReady);
   const frames=[];
   for(const t of times){
    await page.evaluate(t=>window.__sceneSeek(t),t);frames.push(await page.screenshot({path:path.join(folder,preset+'-'+t+'.png')}));
    const actual=await page.evaluate(()=>window.__episodeFrame?.t);if(actual!==undefined)assert.ok(Math.abs(actual-(await page.evaluate(()=>window.__sceneState.sourceTime)))<.001,'时间改变但3D画面没有更新');
    if(preset==='original'){
     const d=await diff(page,shots.reference[frames.length-1],frames.at(-1));item.original.push({t,...d});console.log(id,'原版',t,JSON.stringify(d));
     assert.ok(d.mean<.35&&d.changed<.005,'原效果发生明显变化：'+id+' '+t);
    }
    if(preset==='demo')item.demo.push({t,state:await page.evaluate(()=>window.__sceneState)});
   }
   shots[preset]=frames;
   if(preset==='original'){
    await page.evaluate(t=>window.__sceneSeek(t),times[1]);const back=await diff(page,frames[1],await page.screenshot({path:path.join(folder,'reverse.png')}));item.reverse=back;
    assert.ok(back.mean<.15&&back.changed<.001,'倒退存在残留：'+id);
   }
  }
  item.demo_difference=await diff(page,shots.original[2],shots.demo[2]);
  if(id==='attention-contrast')item.demo_difference=await diff(page,shots.original[3],shots.demo[3]);
  assert.ok(item.demo_difference.mean>.05,'变体没有实际视觉变化：'+id);
  item.duration=await page.evaluate(()=>window.__timelines.main.duration());assert.ok(Math.abs(item.duration-catalog.find(x=>x.id===id).duration_s)<.00001);
  if(id==='cinema-exit')assert.equal(await page.evaluate(()=>timePieces.length),30);
  if(id==='choice-comparison')assert.equal(await page.$eval('#menu-title',el=>el.textContent),'午餐吃什么');
  if(id==='attention-contrast')assert.equal(await page.evaluate(()=>SpotlightGlyphV5.text),'注意力转移');
  if(id==='many-worlds')assert.deepEqual(await page.evaluate(()=>SceneOptions.focusOrder),[0,1]);
  item.status='passed';await page.close();
 }
 const page=await browser.newPage();page.setDefaultNavigationTimeout(120000);page.on('pageerror',e=>report.errors.push('gallery: '+e.message));await page.setViewport({width:1440,height:1000});
 await page.goto(base+'/scenes/',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('可以播放'),{timeout:120000});
 assert.equal(await page.$$eval('nav button',els=>els.length),5);
 for(const id of Object.keys(samples)){
  await page.click('[data-scene="'+id+'"]');await page.waitForFunction(id=>document.querySelector('#player').contentWindow.SceneSpec?.id===id&&document.querySelector('#status').textContent.includes('可以播放'),{timeout:120000},id);
  await page.click('[data-preset="demo"]');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('可以播放'),{timeout:120000});
  await page.click('#play');await page.waitForFunction(()=>document.querySelector('#player').contentWindow.__sceneState.time>.4);await page.click('#play');
  assert.ok((await page.$eval('#settings',el=>el.href)).includes(id+'/demo.json'));
 }
 await page.screenshot({path:path.join(OUT,'gallery.png')});await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(OUT,'gallery-mobile.png')});
 report.gallery='五项目录、四项原版与示例切换、播放及参数入口通过';assert.deepEqual(report.errors,[]);report.status='passed';console.log('全部检查通过');
}catch(error){report.status='failed';report.error=error.stack;throw error;}
finally{fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');if(browser)await browser.close();server.close();}
