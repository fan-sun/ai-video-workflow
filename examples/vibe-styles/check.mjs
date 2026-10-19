// 用途：对照原版与适配版的画面、倒退定位和字幕清除，保存截图。
// 运行：node --env-file-if-exists=.env examples/vibe-styles/check.mjs [两位编号...]。
// 依赖：项目现有Chrome与puppeteer-core；默认检查六种优先素材。
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {once} from 'node:events';
import {resolveChromeExecutable} from '../../build/common/check_course_cover.mjs';
import {prepareStyle,serve,catalog} from './run.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OUT=path.join(ROOT,'.local/vibe-styles/check');fs.mkdirSync(OUT,{recursive:true});
const require=createRequire(import.meta.url),roots=[ROOT,process.env.PUPPETEER_ROOT].filter(Boolean);
for(const cache of [process.env.npm_config_cache,process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'npm-cache'),path.join(os.homedir(),'.npm')].filter(Boolean)){
  const npx=path.join(cache,'_npx');if(fs.existsSync(npx))roots.push(...fs.readdirSync(npx).map(x=>path.join(npx,x,'node_modules')));
}
let puppeteer;for(const root of roots){try{puppeteer=require(require.resolve('puppeteer-core',{paths:[root]}));break;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}}
if(!puppeteer)throw new Error('缺少已有浏览器驱动puppeteer-core');
const ids=process.argv.slice(2).length?process.argv.slice(2):['03','06','09','02','17','20'];
const server=serve(0);await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
let browser;const report={items:[],scope:'原版及适配版定位帧对照、倒退和字幕；非正常速度审美审片'},errors=[];
const digest=data=>createHash('sha256').update(data).digest('hex');
async function comparePixels(page,a,b){
  return page.evaluate(async (a,b)=>{
    const read=async src=>{const im=new Image();im.src='data:image/png;base64,'+src;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
    const x=await read(a),y=await read(b);let total=0,changed=0;
    for(let i=0;i<x.length;i+=4){let peak=0;for(let j=0;j<3;j++){const d=Math.abs(x[i+j]-y[i+j]);total+=d;peak=Math.max(peak,d);}if(peak>12)changed++;}
    return {mean_error:total/(x.length/4*3),changed_ratio:changed/(x.length/4)};
  },Buffer.from(a).toString('base64'),Buffer.from(b).toString('base64'));
}
try{
  browser=await puppeteer.launch({executablePath:resolveChromeExecutable(),headless:true,args:['--use-gl=angle','--use-angle=d3d11'],protocolTimeout:180000});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',request=>{
    const match=new URL(request.url()).pathname.match(/^\/ref\/styles\/([^/]+)\/index\.html$/);
    if(request.isNavigationRequest()&&match){
      // 双方使用相同的本地字体，避免系统字体缺失造成无关排版差异。
      const original=fs.readFileSync(path.join(ROOT,'templates/vibe-styles/source/styles',match[1],'index.html'),'utf8');
      request.respond({status:200,contentType:'text/html; charset=utf-8',body:original.replace('<head>','<head><link rel="stylesheet" href="'+url+'/prepared/'+match[1]+'/fonts.css">')});
    }else request.continue();
  });
  await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
  for(const id of ids){
    const item=catalog.find(x=>x.id===id);assert.ok(item,'未知编号');console.log('检查 '+id);
    prepareStyle(id);
    await page.goto(url+'/ref/styles/'+item.dir+'/index.html?render=1',{waitUntil:'networkidle0',timeout:180000});
    const samples=[1,4.5,7.5],original=[];
    for(const t of samples){
      await page.evaluate(t=>window.__seek(t),t);original.push(await page.screenshot({path:path.join(OUT,id+'-original-'+t+'.png')}));
    }
    await page.evaluate(()=>window.__seek(4.5));
    const sourceReverse=await comparePixels(page,await page.screenshot({path:path.join(OUT,id+'-original-reverse.png')}),original[1]);
    console.log(id+' 原版倒退差异 '+JSON.stringify(sourceReverse));
    await page.goto(url+'/prepared/'+item.dir+'/index.html',{waitUntil:'networkidle0',timeout:180000});
    await page.evaluate(()=>window.__styleReady);
    const adapted=[];
    for(const t of samples){await page.evaluate(t=>window.__styleSeek(t),t);adapted.push(await page.screenshot({path:path.join(OUT,id+'-'+t+'.png')}));}
    assert.equal(new Set(adapted.map(digest)).size,3,id+'画面没有发展');
    const differences=[];
    for(let i=0;i<samples.length;i++){
      const difference=await comparePixels(page,original[i],adapted[i]);differences.push(difference);
      // 原版自身重复定位也存在细小像素差异；记录视觉误差，不声称字节一致。
      assert.ok(difference.mean_error<.15&&difference.changed_ratio<.001,id+'适配后画面差异过大：'+JSON.stringify(difference));
    }
    await page.evaluate(()=>window.__styleSeek(4.5));
    const reverse=await comparePixels(page,await page.screenshot({path:path.join(OUT,id+'-reverse.png')}),adapted[1]);
    assert.ok(reverse.mean_error<.15&&reverse.changed_ratio<.001,id+'倒退残留：'+JSON.stringify(reverse));
    report.items.push({id,source_parity:'passed',reverse_seek:'passed',samples,differences,reverse,sourceReverse});
    console.log(id+' 原版画面对照及倒退通过');
  }
  prepareStyle('03',{start:2,duration:3,captions:[{start:.5,end:1.5,text:'测试字幕。'}]});
  await page.goto(url+'/prepared/03-flat/index.html',{waitUntil:'networkidle0'});
  await page.evaluate(()=>window.__styleSeek(1));
  assert.equal(await page.$eval('#stage>div:last-child',e=>e.textContent),'测试字幕');
  await page.evaluate(()=>window.__styleSeek(.1));
  assert.equal(await page.$eval('#stage>div:last-child',e=>e.textContent),'');
  assert.deepEqual(errors,[]);report.status='passed';report.captions='passed';prepareStyle('03');
}catch(error){report.status='failed';report.error=error.message;throw error;}
finally{report.errors=errors;const name=process.argv.slice(2).length?'report-'+ids.join('-')+'.json':'report.json';fs.writeFileSync(path.join(OUT,name),JSON.stringify(report,null,2)+'\n','utf8');if(browser)await browser.close();server.close();}
