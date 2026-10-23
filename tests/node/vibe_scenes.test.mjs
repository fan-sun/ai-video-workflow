// 用途：验证自有场景独立准备、参数边界及源文件保护。
// 运行：node --test tests/node/vibe_scenes.test.mjs
// 依赖：Node.js，不启动浏览器或渲染器。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareScene,catalog} from '../../examples/vibe-scenes/run.mjs';
import {serve} from '../../examples/vibe-styles/run.mjs';
import {once} from 'node:events';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

test('场景可以准备到独立目录，重复准备保持一致，源文件不变',()=>{
  const outRoot=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-scene-'));
  const source=path.join(ROOT,'templates/vibe-scenes/feeling-scale/scale.js');
  const before=fs.readFileSync(source);
  try{
    const out=prepareScene('feeling-scale',{outRoot,preset:'focus'});
    const settings=JSON.parse(fs.readFileSync(path.join(out,'settings.json'),'utf8'));
    assert.equal(settings.ratio,3);assert.equal(settings.rightLabel,'重点任务');
    for(const file of ['index.html','scene.js','scale.js','morph.js','core.js','gl.js','rm.js','fonts/NotoSansSC-700.woff2'])assert.ok(fs.existsSync(path.join(out,file)),file);
    const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
    assert.ok(!/https?:\/\//.test(html),'入口必须完全使用本地依赖');
    assert.ok(!/course\/episodes|specs\//.test(html),'独立场景不可依赖制作档案');
    const first=fs.readFileSync(path.join(out,'settings.js'),'utf8');
    prepareScene('feeling-scale',{outRoot,preset:'focus'});
    assert.equal(fs.readFileSync(path.join(out,'settings.js'),'utf8'),first);
    assert.deepEqual(fs.readFileSync(source),before);
  }finally{fs.rmSync(outRoot,{recursive:true,force:true});}
});
test('拒绝未知条目、越界比例和过长文字',()=>{
  assert.throws(()=>prepareScene('../escape'),/未知场景/);
  assert.throws(()=>prepareScene('feeling-scale',{settings:{ratio:0}}),/比例/);
  assert.throws(()=>prepareScene('feeling-scale',{settings:{rightGlyph:'两个'}}),/单字/);
  assert.throws(()=>prepareScene('feeling-scale',{settings:{title:'过长标题'.repeat(10)}}),/标题/);
});
test('四个新增场景可独立准备原效果和复用版，附带来源和完整依赖',()=>{
  const outRoot=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-scenes-batch-'));
  try{
    for(const id of ['cinema-exit','choice-comparison','attention-contrast','many-worlds']){
      const entry=catalog.find(x=>x.id===id);assert.ok(entry,'场景未登记：'+id);
      assert.ok(entry.variants.original&&entry.variants.demo,'缺少独立版本说明');
      for(const preset of ['original','demo']){
        const out=prepareScene(id,{outRoot,preset});
        for(const file of ['index.html','settings.js','settings.json','adapter.js','来源.json'])assert.ok(fs.existsSync(path.join(out,file)),id+'/'+file);
        const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
        for(const match of html.matchAll(/(?:src=|url\()['"]([^'"]+)/g))assert.ok(fs.existsSync(path.join(out,match[1])),id+'缺少依赖：'+match[1]);
        assert.ok(!html.includes('course/episodes/'),'不得读取原期次');
      }
    }
  }finally{fs.rmSync(outRoot,{recursive:true,force:true});}
});
test('新场景限制无效内容，镜头顺序支持真实替换',()=>{
  const outRoot=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-scene-settings-'));
  try{
    const out=prepareScene('many-worlds',{outRoot,preset:'demo',settings:{focusOrder:[2,0]}});
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out,'settings.json'),'utf8')).focusOrder,[2,0]);
    assert.throws(()=>prepareScene('many-worlds',{outRoot,settings:{focusOrder:[1,1]}}),/不同/);
    assert.throws(()=>prepareScene('cinema-exit',{outRoot,settings:{minutes:0}}),/分钟/);
    assert.throws(()=>prepareScene('attention-contrast',{outRoot,settings:{title:'过长标题六个字'}}),/标题/);
    assert.throws(()=>prepareScene('choice-comparison',{outRoot,settings:{items:[['商品',100]]}}),/12|菜品/);
  }finally{fs.rmSync(outRoot,{recursive:true,force:true});}
});
test('现有预览服务同时提供自有场景和原风格目录',async()=>{
  const server=serve(0);await once(server,'listening');
  try{
    const base='http://127.0.0.1:'+server.address().port;
    for(const file of ['/scenes/','/scene-library/catalog.json','/scene-library/feeling-scale/index.html','/ref/comp/meta.js']){
      const response=await fetch(base+file);assert.equal(response.status,200,file);
    }
    assert.match(await (await fetch(base+'/')).text(),/自有场景/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
