import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
let api;try{api=await import('../../examples/teaching-scenes/visual.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
test('无声画面可独立准备，不需要讲解稿、音频或timings，重复准备结果一致',()=>{
 assert.equal(typeof api?.prepareVisualScene,'function','缺少无声素材准备入口');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'teaching-visual-'));
 try{for(const id of ['object-swap','door-reveal','scan-transfer','rule-preview','focus-detail']){
  const out=api.prepareVisualScene(id,{preset:'original',outRoot:temp});const before=fs.readFileSync(path.join(out,'index.html'),'utf8');
  api.prepareVisualScene(id,{preset:'original',outRoot:temp});assert.equal(fs.readFileSync(path.join(out,'index.html'),'utf8'),before);
  assert.ok(!/<audio|<video|substrip|data-beat=/i.test(before));assert.ok(fs.existsSync(path.join(out,'timeline.js')));
 }}finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('新增结构能替换实际对象，长说明有长度边界',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'teaching-visual-'));
 try{
  for(const [id,asset] of [['scan-transfer','photo-input.svg'],['rule-preview','parcel.svg'],['focus-detail','exhibition.svg']]){
   const out=api.prepareVisualScene(id,{preset:'demo',outRoot:temp});
   const settings=fs.readFileSync(path.join(out,'settings.js'),'utf8');assert.ok(settings.includes(asset));
  }
  assert.throws(()=>api.prepareVisualScene('focus-detail',{outRoot:temp,settings:{detail1Text:'字'.repeat(41)}}),/40/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('跨主题示例使用不同图形资产，缺失资产或覆盖模板必须报错',()=>{
 assert.equal(typeof api?.prepareVisualScene,'function','缺少无声素材准备入口');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'teaching-visual-'));
 try{
  const a=api.prepareVisualScene('object-swap',{preset:'demo',outRoot:temp});const e=api.prepareVisualScene('door-reveal',{preset:'demo',outRoot:temp});
  assert.match(fs.readFileSync(path.join(a,'settings.js'),'utf8'),/battery/);assert.match(fs.readFileSync(path.join(e,'settings.js'),'utf8'),/gallery/);
  assert.throws(()=>api.prepareVisualScene('object-swap',{outRoot:temp,settings:{oldAsset:'missing.svg'}}),/素材文件不存在/);
  assert.throws(()=>api.prepareVisualScene('door-reveal',{outRoot:'templates/teaching-scenes'}),/覆盖/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
