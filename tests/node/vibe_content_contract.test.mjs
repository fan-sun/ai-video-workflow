// 用途：验证Vibe字幕上限、正文来源与确认版本，防止自填原文自证通过。
// 运行：node --test tests/node/vibe_content_contract.test.mjs。
// 依赖：Node.js；夹具只写入系统临时目录，不修改正式期次。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readVibeTiming,writeVibeTimeline,assertVibeContent} from '../../build/vibe/vibe_timeline.mjs';
import {createCourseVideoPlan,verifyCourseVideoInputs} from '../../build/common/course_video.mjs';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-content-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const put=(relative,value)=>{
    const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{encoding:'utf8'});
  };
  const texts=['票钱回不来。','时间还能选择。'];
  const index={episode:'ep01',slug:'demo',route:'vibe',production_contract:'current',current_version:'v1',
    script:'course/scripts/01-demo.md',split_preview:'course/episodes/01-demo/旁白切分预览.json',
    content_approval:{confirmed:true,statement:'测试夹具确认，不代表真实用户认可'},
    publish_spec:{width:1920,height:1080,fps:30,duration_s:6},
    acts:texts.map((text,i)=>({act:i+1,visual_timing:`t${i+1}.json`,visual_source:`a${i+1}.html`,allowed_warnings:{},subtitle_highlights:[]}))};
  const file=path.join(root,'course/episodes/01-demo/制作索引.json');
  put(index.script,'# 正文\n\n## 第一幕 · 过去\n旁白：'+texts[0]+'\n\n## 第二幕 · 未来\n旁白：'+texts[1]+'\n');
  put(index.split_preview,{act1:[texts[0]],act2:[texts[1]]});
  index.acts.forEach((act,i)=>{
    put(act.visual_timing,{total_s:3,source_text:texts[i],captions:[{id:'a',start:0,end:3,text:texts[i]}]});
    put(act.visual_source,'<div data-composition-id="main" data-width="1920" data-height="1080" data-duration="3"></div><script>const DUR=3;</script>');
  });
  put(path.relative(root,file),index);
  const load=()=>JSON.parse(fs.readFileSync(file,{encoding:'utf8'}));
  const bind=()=>spawnSync(process.execPath,[path.resolve('build/vibe/vibe_timeline.mjs'),file,'--bind-approved-source'],{cwd:root,encoding:'utf8',windowsHide:true});
  return {root,file,index,texts,put,load,bind};
}

test('Vibe同屏最多24个非标点字符，延长停留不能绕过',t=>{
  const {root,put}=fixture(t);const file=path.join(root,'long.json');
  const check=text=>{put('long.json',{total_s:20,source_text:text,captions:[{id:'a',start:0,end:20,text}]});return ()=>readVibeTiming(file);};
  assert.doesNotThrow(check('甲'.repeat(12)+'，\n'+'乙'.repeat(12)+'。'));
  assert.throws(check('甲'.repeat(25)),/24|同屏/);
  assert.throws(check('选项多了，有时反而更难决定，甚至干脆不选，这种现象叫选择过载。'),/24|同屏/);
});

test('绑定已确认正文不需要动画或时间表，重复绑定保留同版审片确认',t=>{
  const f=fixture(t);f.index.acts.forEach(a=>{a.visual_timing=null;a.visual_source=null;});
  f.put(path.relative(f.root,f.file),f.index);
  const r=f.bind();assert.equal(r.status,0,r.stderr);
  const bound=f.load();assert.match(bound.content_approval.source_sha256,/^[a-f0-9]{64}$/);
  assert.equal(bound.timeline_summary,undefined);
  bound.review_approval={confirmed:true,sha256:'existing'};bound.publish_bundle={complete:true};
  f.put(path.relative(f.root,f.file),bound);assert.equal(f.bind().status,0);
  assert.deepEqual(f.load(),bound);
});

test('正式时间表不能只凭confirmed标记跳过正文版本绑定',t=>{
  const f=fixture(t);const before=fs.readFileSync(f.file);
  assert.throws(()=>writeVibeTimeline(f.file,{rootDir:f.root}),/绑定|source_sha256/);
  assert.deepEqual(fs.readFileSync(f.file),before);
});

test('字幕与source_text同时漏字仍会被已确认正文拦截',t=>{
  const f=fixture(t);assert.equal(f.bind().status,0);
  writeVibeTimeline(f.file,{rootDir:f.root});
  const before=fs.readFileSync(f.file);const timeline=path.join(f.root,f.load().timeline_summary);const old=fs.readFileSync(timeline);
  f.put('t1.json',{total_s:3,source_text:'回不来。',captions:[{id:'a',start:0,end:3,text:'回不来。'}]});
  assert.throws(()=>writeVibeTimeline(f.file,{rootDir:f.root}),/第1幕.*正文|原文/);
  assert.deepEqual(fs.readFileSync(f.file),before);assert.deepEqual(fs.readFileSync(timeline),old);
});

test('源稿与预览一同改写后仍须更新确认绑定，旧成片确认随之失效',t=>{
  const f=fixture(t);assert.equal(f.bind().status,0);writeVibeTimeline(f.file,{rootDir:f.root});
  const ready=f.load();ready.review_approval={confirmed:true,sha256:'old-video'};ready.publish_bundle={complete:true};
  f.put(path.relative(f.root,f.file),ready);
  f.put(f.index.script,'## 第一幕\n旁白：已经花掉的钱。\n\n## 第二幕\n旁白：时间还能选择。\n');
  f.put(f.index.split_preview,{act1:['已经花掉的钱。'],act2:[f.texts[1]]});
  f.put('t1.json',{total_s:3,source_text:'已经花掉的钱。',captions:[{id:'a',start:0,end:3,text:'已经花掉的钱。'}]});
  assert.throws(()=>writeVibeTimeline(f.file,{rootDir:f.root}),/确认.*变化|版本/);
  assert.equal(f.bind().status,0);const updated=f.load();
  assert.notEqual(updated.content_approval.source_sha256,ready.content_approval.source_sha256);
  assert.equal(updated.review_approval,null);assert.equal(updated.publish_bundle,null);
  writeVibeTimeline(f.file,{rootDir:f.root});
});

test('正文与切分不一致不能绑定，失败不覆盖原索引',t=>{
  const f=fixture(t);f.put(f.index.split_preview,{act1:['被改写了。'],act2:[f.texts[1]]});
  const before=fs.readFileSync(f.file);const r=f.bind();
  assert.notEqual(r.status,0);assert.match(r.stderr,/第1幕.*切分|预览/);
  assert.deepEqual(fs.readFileSync(f.file),before);
});

test('来源核验拒绝第七幕及重复或乱序的幕标题，不能静默丢弃正文',t=>{
  const f=fixture(t),names=['一','二','三','四','五','六'];
  f.index.acts=names.map((_,i)=>({act:i+1,visual_timing:`t${i+1}.json`}));
  const markdown=names.map((name,i)=>`## 第${name}幕\n旁白：第${i+1}段正文。`).join('\n\n');
  f.put(f.index.script,markdown);
  f.put(f.index.split_preview,Object.fromEntries(names.map((_,i)=>[`act${i+1}`,[`第${i+1}段正文。`]])));
  for (const act of f.index.acts) {
    const text=`第${act.act}段正文。`;
    f.put(act.visual_timing,{total_s:3,source_text:text,captions:[{id:'a',start:0,end:3,text}]});
  }
  f.put(path.relative(f.root,f.file),f.index);assert.equal(f.bind().status,0);
  const approved=f.load();assertVibeContent(approved,{rootDir:f.root});
  for (const text of [markdown+'\n\n## 第七幕\n旁白：新增加的正文。',
    markdown+'\n\n## 第一幕\n旁白：重复编号。',
    markdown.replace('## 第一幕','## 第X幕').replace('## 第二幕','## 第一幕').replace('## 第X幕','## 第二幕')]) {
    f.put(f.index.script,text);
    assert.throws(()=>assertVibeContent(approved,{rootDir:f.root}),/幕.*一致|连续|编号/);
    const before=fs.readFileSync(f.file);assert.notEqual(f.bind().status,0);
    assert.deepEqual(fs.readFileSync(f.file),before);
  }
});

test('单幕渲染预检核对正文且允许后续幕尚无画面',t=>{
  const f=fixture(t);assert.equal(f.bind().status,0);writeVibeTimeline(f.file,{rootDir:f.root});
  const index=f.load();index.acts[1].visual_source=null;index.acts[1].visual_timing=null;
  const plan=createCourseVideoPlan(index,'review',{rootDir:f.root,act:1});
  for (const file of plan.requiredInputs) {
    const relative=path.relative(f.root,file);
    if (!relative.startsWith('templates'+path.sep)) continue;
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.resolve(relative),file);
  }
  verifyCourseVideoInputs(plan);
  f.put('t1.json',{total_s:3,source_text:'回不来。',captions:[{id:'a',start:0,end:3,text:'回不来。'}]});
  assert.throws(()=>verifyCourseVideoInputs(plan),/第1幕.*正文|原文/);
});
