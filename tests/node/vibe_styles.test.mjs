// 用途：检查风格库准备后的依赖、时间范围和原版内容保护。
// 运行：node --test tests/node/vibe_styles.test.mjs。
// 依赖：Node及仓库内20种源码，无需研究目录或浏览器。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const entry=path.join(root,'examples/vibe-styles/run.mjs');
test('准备风格片段保留依赖并拒绝越界时间',async()=>{
  assert.ok(fs.existsSync(entry),'尚未提供风格接入工具');
  const {prepareStyle}=await import(pathToFileURL(entry).href);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-styles-'));
  try{
    const out=prepareStyle('09',{outRoot:tmp,start:2,duration:3});
    const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
    assert.match(html,/data-duration="3"/);
    assert.match(html,/"start":2/);
    assert.ok(fs.existsSync(path.join(out,'media/city.jpg')));
    assert.ok(fs.existsSync(path.join(out,'lib/gl.js')));
    const before=fs.readFileSync(path.join(out,'index.html'));
    prepareStyle('09',{outRoot:tmp,start:2,duration:3});
    assert.deepEqual(fs.readFileSync(path.join(out,'index.html')),before);
    assert.throws(()=>prepareStyle('../03',{outRoot:tmp}),/编号/);
    assert.throws(()=>prepareStyle('16',{outRoot:tmp}),/尚未适配/);
    assert.throws(()=>prepareStyle('03',{outRoot:tmp,start:9,duration:3}),/时间/);
    assert.throws(()=>prepareStyle('03',{outRoot:tmp,captions:[{start:0,end:11,text:'越界'}]}),/字幕/);
    const editorial=prepareStyle('17',{outRoot:tmp});
    assert.doesNotMatch(fs.readFileSync(path.join(editorial,'index.html'),'utf8'),/Math\.random\(\)/);
    assert.ok(fs.existsSync(path.join(editorial,'fonts/NotoSerifSC-VF.woff2')));
  }finally{
    assert.equal(path.dirname(path.resolve(tmp)),path.resolve(os.tmpdir()));
    fs.rmSync(tmp,{recursive:true,force:true});
  }
});
