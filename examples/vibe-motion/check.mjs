// 用途：检查八类动效的真实浏览器预览、参数替换和时间轴倒退，保存截图。
// 运行：node --env-file-if-exists=.env examples/vibe-motion/check.mjs。
// 依赖：现有Chrome与HyperFrames缓存中的puppeteer-core，不生成正式期次。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {resolveChromeExecutable} from '../../build/common/check_course_cover.mjs';
import {serve,prepareDemo} from './run.mjs';
import {catalog} from './demos.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),OUT=path.join(ROOT,'.local/vibe-motion/check');
const require=createRequire(import.meta.url),roots=[ROOT,process.env.PUPPETEER_ROOT].filter(Boolean);
for(const cache of [process.env.npm_config_cache,process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'npm-cache'),path.join(os.homedir(),'.npm')].filter(Boolean)){
  const npx=path.join(cache,'_npx');if(fs.existsSync(npx))roots.push(...fs.readdirSync(npx).map(x=>path.join(npx,x,'node_modules')));
}
let puppeteer;
for(const root of roots){try{puppeteer=require(require.resolve('puppeteer-core',{paths:[root]}));break;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}}
if(!puppeteer)throw new Error('找不到puppeteer-core；先配置已有渲染环境或指定PUPPETEER_ROOT');
fs.mkdirSync(OUT,{recursive:true});
const server=serve(0);await once(server,'listening');
let browser;const errors=[],report={effects:[],observation:'浏览器定位帧、实际播放状态检查；不等于用户正常速度审片认可'};
try{
  browser=await puppeteer.launch({executablePath:resolveChromeExecutable(),headless:true,args:['--allow-file-access-from-files']});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1440,height:1080,deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>document.querySelector('#name').textContent.length>0);
  if(await page.$eval('#play',e=>e.getAttribute('aria-pressed')==='true'))await page.click('#play');
  const seek=async p=>page.$eval('#time',(e,p)=>{e.value=p*1000;e.dispatchEvent(new Event('input'));},p);
  const hash=async()=>createHash('sha256').update(await page.$eval('canvas',e=>e.toDataURL())).digest('hex');
  for(const item of catalog){
    await page.click(`[data-id="${item.id}"]`);const hashes=[];
    for(const p of [.08,.38,.70,.95]){
      await seek(p);hashes.push(await hash());
      await (await page.$('canvas')).screenshot({path:path.join(OUT,`${item.id}-${Math.round(p*100)}.png`)});
    }
    assert.equal(new Set(hashes).size,4,item.id+'未形成不同状态');
    await seek(.38);assert.equal(await hash(),hashes[1],item.id+'倒退残留');
    await page.$eval('#accent',e=>{e.value='#78cec9';e.dispatchEvent(new Event('input'));});
    assert.notEqual(await hash(),hashes[1],item.id+'颜色参数没有生效');
    await page.$eval('#accent',e=>{e.value='#e9bf74';e.dispatchEvent(new Event('input'));});
    await seek(.8);const beforeShape=await hash();await page.select('#shape','circle');
    assert.notEqual(await hash(),beforeShape,item.id+'形状参数没有生效');
    await page.select('#shape','diamond');
    report.effects.push({id:item.id,state_hashes:hashes,reverse_seek:'passed',parameters:'passed'});
  }
  await page.click('[data-id="morph"]');await seek(.3);const before=await hash();await page.click('#play');
  await new Promise(resolve=>setTimeout(resolve,350));await page.click('#play');assert.notEqual(await hash(),before,'实际播放未推进');
  await seek(.7);await page.screenshot({path:path.join(OUT,'gallery-desktop.png'),fullPage:true});
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'手机预览横向溢出');
  await page.screenshot({path:path.join(OUT,'gallery-mobile.png'),fullPage:true});
  const folder=prepareDemo('morph');await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(folder,'index.html')).href,{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>Boolean(window.__timelines?.main));await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{window.__timelines.main.seek(2.3,false);});const timelineHash=await hash();
  await page.evaluate(()=>{window.__timelines.main.seek(5.8,false);window.__timelines.main.seek(2.3,false);});
  assert.equal(await hash(),timelineHash,'实际时间轴倒退不一致');
  await page.screenshot({path:path.join(OUT,'composition.png')});
  assert.deepEqual(errors,[],'浏览器执行错误');
  report.timeline='passed';report.playback='passed';report.mobile='passed';report.status='passed';
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n',{encoding:'utf8'});
  console.log('通过：8项动效、32个状态、参数替换、倒退定位、实际播放与时间轴接入。报告：'+OUT);
}catch(error){report.status='failed';report.error=error.message;fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n',{encoding:'utf8'});throw error;}
finally{if(browser)await browser.close();server.close();}
