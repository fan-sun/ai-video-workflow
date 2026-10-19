// 用途：验证首次点题16～19秒硬约束、导出一致性及合法无字幕段。
// 运行：node --test tests/node/vibe_topic_reveal.test.mjs。
// 依赖：Node.js；只在临时目录创建测试期次。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bindVibeContentApproval,writeVibeTimeline} from '../../build/vibe/vibe_timeline.mjs';
import {verifyCourseVideoInputs} from '../../build/common/course_video.mjs';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-topic-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const folder='course/episodes/01-demo';
  const put=(name,data)=>{
    const file=path.resolve(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,typeof data==='string'?data:JSON.stringify(data),{encoding:'utf8'});
  };
  const index={route:'vibe',episode:'ep01',slug:'demo',production_contract:'current',
    script:'course/scripts/01-demo.md',split_preview:folder+'/旁白切分预览.json',
    content_approval:{confirmed:true,statement:'仅测试夹具'},
    topic_reveal:{start_s:14,complete_s:17},publish_spec:{duration_s:22,width:1920,height:1080,fps:30},
    acts:[{act:1,visual_timing:'timing.json'}]};
  const file=path.join(root,folder,'制作索引.json');
  put(index.script,'## 第一幕\n旁白：为什么这样？这是测试主题。\n');
  put(index.split_preview,{act1:['为什么这样？这是测试主题。']});
  put('timing.json',{total_s:22,source_text:'为什么这样？这是测试主题。',captions:[
    {id:'a',start:0,end:3,text:'为什么这样？'},
    {id:'b',start:16,end:19,text:'这是测试主题。'}]});
  put('visual.html','<div data-composition-id="main" data-width="1920" data-height="1080" data-duration="22"></div><script>const DUR=22;</script>');
  put(file,index);bindVibeContentApproval(file,{rootDir:root});
  Object.assign(index,JSON.parse(fs.readFileSync(file,{encoding:'utf8'})));
  return {root,file,index,put};
}

for (const complete of [16,17.5,19]) test(`点题${complete}秒完成可导出，保留无字幕动画段`,t=>{
  const f=fixture(t);f.index.topic_reveal.complete_s=complete;f.put(f.file,f.index);
  const out=writeVibeTimeline(f.file,{rootDir:f.root});
  const timeline=JSON.parse(fs.readFileSync(out,{encoding:'utf8'}));
  assert.deepEqual(timeline.topic_reveal,f.index.topic_reveal);
  assert.equal(timeline.captions[0].end,3);assert.equal(timeline.captions[1].start,16);
});

for (const reveal of [undefined,{start_s:10,complete_s:15.999},{start_s:18,complete_s:19.001},
  {start_s:-1,complete_s:17},{start_s:18,complete_s:17},{start_s:14,complete_s:'17'},
  {start_s:14,complete_s:null}]) test(`拒绝缺失或非法点题时刻：${JSON.stringify(reveal)}`,t=>{
  const f=fixture(t);f.index.topic_reveal=reveal;f.put(f.file,f.index);
  const before=fs.readFileSync(f.file);
  assert.throws(()=>writeVibeTimeline(f.file,{rootDir:f.root}),/首次点题|topic_reveal/);
  assert.deepEqual(fs.readFileSync(f.file),before);
});

test('review预检拦截越界及过期点题记录，不能只通过字幕和编码检查',t=>{
  const f=fixture(t);writeVibeTimeline(f.file,{rootDir:f.root});
  const index=JSON.parse(fs.readFileSync(f.file,{encoding:'utf8'}));
  const plan={mode:'review',rootDir:f.root,index,requiredInputs:[],
    acts:[{act:1,source:path.join(f.root,'visual.html'),timings:path.join(f.root,'timing.json')}]};
  assert.doesNotThrow(()=>verifyCourseVideoInputs(plan));
  index.topic_reveal.complete_s=12.6;
  assert.throws(()=>verifyCourseVideoInputs(plan),/首次点题|topic_reveal/);
  index.topic_reveal.complete_s=18;
  assert.throws(()=>verifyCourseVideoInputs(plan),/点题.*过期|点题.*一致/);
});

test('仅技术短示例可不设置点题；正式视频不能沿用该例外',t=>{
  const f=fixture(t);delete f.index.topic_reveal;f.index.example={technical_only:true};
  f.put(f.file,f.index);assert.doesNotThrow(()=>writeVibeTimeline(f.file,{rootDir:f.root}));
  delete f.index.example;f.put(f.file,f.index);
  assert.throws(()=>writeVibeTimeline(f.file,{rootDir:f.root}),/首次点题|topic_reveal/);
});

test('跨幕仍使用正片累计时刻，不把第二幕的局部秒数当作点题时刻',t=>{
  const f=fixture(t);
  f.index.acts.push({act:2,visual_timing:'timing2.json'});
  f.put(f.index.script,'## 第一幕\n旁白：为什么这样？\n## 第二幕\n旁白：这是测试主题。\n');
  f.put(f.index.split_preview,{act1:['为什么这样？'],act2:['这是测试主题。']});
  f.put('timing.json',{total_s:10,source_text:'为什么这样？',captions:[{id:'a',start:0,end:3,text:'为什么这样？'}]});
  f.put('timing2.json',{total_s:12,source_text:'这是测试主题。',captions:[{id:'b',start:6,end:9,text:'这是测试主题。'}]});
  f.put(f.file,f.index);bindVibeContentApproval(f.file,{rootDir:f.root});
  const out=writeVibeTimeline(f.file,{rootDir:f.root});
  const timeline=JSON.parse(fs.readFileSync(out,{encoding:'utf8'}));
  assert.equal(timeline.topic_reveal.complete_s,17);assert.equal(timeline.captions[1].start,16);
  const index=JSON.parse(fs.readFileSync(f.file,{encoding:'utf8'}));index.topic_reveal={start_s:4,complete_s:7};
  f.put(f.file,index);const before=fs.readFileSync(out);
  assert.throws(()=>writeVibeTimeline(f.file,{rootDir:f.root}),/首次点题/);
  assert.deepEqual(fs.readFileSync(out),before);
});

test('点题登记不能超出视频，字幕少也不自动补满空段',t=>{
  const f=fixture(t);
  f.put('timing.json',{total_s:15,source_text:'为什么这样？这是测试主题。',captions:[
    {id:'a',start:0,end:3,text:'为什么这样？'},
    {id:'b',start:12,end:15,text:'这是测试主题。'}]});
  assert.throws(()=>writeVibeTimeline(f.file,{rootDir:f.root}),/首次点题/);
});
