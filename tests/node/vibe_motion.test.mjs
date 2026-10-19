// 用途：验证动效素材的定位、对象连续性与参数替换。
// 运行：node --test tests/node/vibe_motion.test.mjs。
// 依赖：Node.js；浏览器画面另由实际预览检查。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';
const moduleUrl = new URL('../../templates/vibe-motion/motion.js', import.meta.url);

test('本地动效模块存在且可独立加载', async () => {
  assert.ok(fs.existsSync(moduleUrl), '尚未实现本地动效模块');
  const m = await import(moduleUrl);
  for (const name of ['travel','morph','contact','camera','reflow','scan','focus','burst'])
    assert.equal(typeof m[name], 'function', name);
});

test('路径按路程推进，分段长度不改变速度，超界时间落在端点', async () => {
  const {travel} = await import(moduleUrl);
  const points = [{x:0,y:0},{x:30,y:0},{x:30,y:70}];
  assert.deepEqual(travel(points,-1).point,{x:0,y:0});
  assert.deepEqual(travel(points,.5).point,{x:30,y:20});
  assert.deepEqual(travel(points,2).point,{x:30,y:70});
  assert.deepEqual(travel([{x:2,y:3},{x:2,y:3}],.5).point,{x:2,y:3});
});

test('重组保留对象顺序和端点，换目标后不修改原数据', async () => {
  const {morph,reflow} = await import(moduleUrl);
  const a=[{x:0,y:0},{x:20,y:40}],b=[{x:100,y:80},{x:90,y:10}];
  const original=JSON.stringify({a,b});
  assert.deepEqual(morph(a,b,0),a);
  assert.deepEqual(morph(a,b,1),b);
  const out=reflow(a,b,[true,false],1);
  assert.equal(out[0].opacity,1);assert.equal(out[1].opacity,0);
  assert.equal(JSON.stringify({a,b}),original);
  assert.throws(()=>morph(a,b.slice(1),.5),/数量/);
});

test('接触先抵达再响应，结束不留下变形', async () => {
  const {contact} = await import(moduleUrl);
  assert.equal(contact(0,{distance:300}).y,-300);
  assert.equal(contact(.42).y,0);
  assert.ok(contact(.47).scaleX>1);
  const end=contact(1);assert.equal(end.y,0);assert.equal(end.scaleX,1);assert.equal(end.scaleY,1);
});

test('任意跳转后回到同一时间得到相同状态，粒子种子可重现', async () => {
  const m=await import(moduleUrl);
  const a=[{x:0,y:0},{x:20,y:40}],b=[{x:100,y:80},{x:90,y:10}];
  const at=p=>({m:m.morph(a,b,p),c:m.contact(p),v:m.camera({x:0,y:0,scale:1},{x:50,y:20,scale:2},p),
    s:m.scan({x:10,y:20,width:100,height:60},p),f:m.focus({x:0,y:0,radius:100},{x:100,y:60,radius:40},p),
    b:m.burst({x:50,y:80},p,{seed:19,count:12})});
  const before=at(.37);at(.95);at(0);assert.deepEqual(at(.37),before);
  assert.notDeepEqual(m.burst({x:0,y:0},.4,{seed:1}),m.burst({x:0,y:0},.4,{seed:2}));
  assert.equal(m.burst({x:0,y:0},.5,{count:9}).length,9);
  assert.equal(m.scan({x:0,y:0,width:80,height:40},1).width,80);
});

test('独立构建可重跑且模块能从构建目录加载，不依赖研究目录', async t => {
  const runner=new URL('../../examples/vibe-motion/run.mjs',import.meta.url);
  assert.ok(fs.existsSync(runner),'尚未实现独立构建入口');
  const {prepareDemo}=await import(runner);
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-motion-'));
  t.after(()=>fs.rmSync(out,{recursive:true,force:true}));
  const first=prepareDemo('morph',out),html=fs.readFileSync(path.join(first,'index.html'),{encoding:'utf8'});
  assert.equal(prepareDemo('morph',out),first);
  assert.equal(fs.readFileSync(path.join(first,'index.html'),{encoding:'utf8'}),html);
  assert.doesNotMatch(html,/__EFFECT__|specs\//);
  // 当前渲染器静态服务只为.js返回可执行模块的MIME类型。
  assert.ok(fs.existsSync(path.join(first,'motion.js')),'构建需提供渲染器可加载的.js素材');
  const demo=await import(pathToFileURL(path.join(first,'demos.js')));
  assert.equal(typeof demo.drawDemo,'function');
  assert.equal(demo.catalog.length,8);
  assert.throws(()=>prepareDemo('../unknown',out),/未知动效/);
});

test('预览首页定位到真实目录，模块可加载且不暴露仓库其他文件', async t => {
  const {serve}=await import('../../examples/vibe-motion/run.mjs');
  const server=serve(0);t.after(()=>server.close());await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const index=await fetch(base);
  const module=await fetch(new URL('app.mjs',index.url));
  assert.equal(module.status,200,'首页相对模块地址不可访问');
  assert.equal((await fetch(base+'/.env')).status,404);
  assert.equal((await fetch(base+'/examples/vibe-motion/%2e%2e/%2e%2e/package.json')).status,404);
});
