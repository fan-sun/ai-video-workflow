// 用途：核验无声通用结构的首现、运动、倒退及换素材预览。
// 运行：node examples/teaching-scenes/check-visuals.mjs；先渲染目录中的原造型与换主题版本。
// 依赖：本机Chrome、已有puppeteer-core与实际渲染的MP4。
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {once} from 'node:events';
import {resolveChromeExecutable} from '../../build/common/check_course_cover.mjs';
import {serve} from '../vibe-styles/run.mjs';import {prepareVisualScene,catalog} from './visual.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),OUT=path.join(ROOT,'.local/teaching-scenes/visual-check');
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
const server=serve(0);await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
const report={status:'running',versions:[],errors:[]};let browser;
try{
 browser=await puppeteer.launch({executablePath:resolveChromeExecutable(),headless:true,protocolTimeout:30000});
 const page=await browser.newPage();await page.setViewport({width:1080,height:1440,deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push(r.status()+' '+r.url());});
 for(const item of catalog){
  const original=[];
  for(const preset of ['original','demo']){
   prepareVisualScene(item.id,{preset});await page.goto(base+'/teaching-prepared/visuals/'+item.id+'/'+preset+'/index.html',{waitUntil:'networkidle0'});await page.evaluate(()=>window.__sceneReady);
   const states=[];let frames=[];
   for(const t of [0,.8,1.4,2.4,3.1,item.duration-.1]){
    await page.evaluate(t=>window.__sceneSeek(t),t);
    states.push(await page.evaluate(()=>{
     const state=id=>{const el=document.querySelector(id);return el?{opacity:Number(getComputedStyle(el).opacity),x:Number(gsap.getProperty(el,'x')),y:Number(gsap.getProperty(el,'y')),scaleX:Number(gsap.getProperty(el,'scaleX'))}:null;};
     return {old:state('#provider-a'),next:state('#provider-b'),room:state('#room-objects'),door:state('#door-leaf'),person:state('#student'),input:state('#task-receipt'),result:state('#ledger-entry'),amount:state('#task-amount'),shape:state('#code-demo-shape'),cursor:state('#code-playhead'),selected:state('#link2'),detail:state('#selected-doc'),lastDetail:state('#detail3')};
    }));
    frames.push(await page.screenshot({path:path.join(OUT,item.id+'-'+preset+'-'+t+'.png')}));
   }
   if(item.id==='object-swap'){
    assert.equal(states[0].next.opacity,0);assert.ok(states[1].old.y<0);assert.equal(states[2].old.opacity,0);assert.ok(states[3].next.opacity>.5);assert.equal(states.at(-1).next.opacity,1);
   }else if(item.id==='door-reveal'){
    assert.equal(states[0].room.opacity,0);assert.ok(states[2].door.scaleX<1);assert.ok(states[3].person.x>0);assert.equal(states.at(-1).person.x,410);assert.equal(states.at(-1).room.opacity,1);
   }else if(item.id==='scan-transfer'){
    assert.equal(states[0].result.opacity,0);assert.ok(states[1].input.x>0);assert.ok(states.at(-1).result.opacity>.99);assert.equal(states.at(-1).amount.opacity,0);
   }else if(item.id==='rule-preview'){
    assert.equal(states[0].shape.opacity,0);assert.equal(states.at(-1).shape.x,154);assert.equal(states.at(-1).shape.y,110);assert.equal(states.at(-1).cursor.x,788);
   }else if(item.id==='focus-detail'){
    assert.equal(states[0].selected.opacity,1);assert.equal(states[0].detail.opacity,0);assert.ok(states[2].selected.x<-290);assert.equal(states.at(-1).detail.opacity,1);assert.equal(states.at(-1).lastDetail.opacity,1);
   }
   await page.evaluate(()=>window.__sceneSeek(.8));const reverse=await diff(page,frames[1],await page.screenshot());assert.ok(reverse.mean<.1&&reverse.changed<.001,'倒退残留');
   const result={id:item.id,preset,reverse,states};
   if(preset==='original')original.push(...frames);
   else{
    result.variantDifference=await diff(page,original.at(-1),frames.at(-1));assert.ok(result.variantDifference.changed>.002,'替换对象没有显示差异');
    const images=await page.$$eval('image,img',els=>els.map(e=>e.getAttribute('href')||e.getAttribute('src')));assert.ok(images.length>0);
    for(const href of images){const code=await page.evaluate(async href=>(await fetch(href)).status,href);assert.equal(code,200);}
   }
   report.versions.push(result);
  }
 }
 await page.setViewport({width:1400,height:1000});await page.goto(base+'/teaching-scenes/',{waitUntil:'networkidle0'});assert.equal(await page.$$eval('video',els=>els.length),catalog.length*2);
 for(const {id} of catalog){await page.click('#'+id+' button');await page.waitForFunction(id=>[...document.querySelectorAll('#'+id+' video')].every(v=>v.ended),{timeout:15000},id);}
 assert.equal(await page.$eval('#error',el=>el.textContent),'');await page.screenshot({path:path.join(OUT,'gallery.png')});
 assert.deepEqual(report.errors,[]);report.status='passed';console.log(catalog.length*2+'版首现、运动、倒退、素材替换及同步播放检查通过。');
}catch(e){report.status='failed';report.error=e.stack;throw e;}
finally{fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');if(browser)await browser.close();server.close();}
