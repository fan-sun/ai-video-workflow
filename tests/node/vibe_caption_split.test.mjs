// 用途：验证Vibe程序初切、人工复核边界及时间表到逐屏预览的同源交付。
// 运行：node --test tests/node/vibe_caption_split.test.mjs。
// 依赖：Node.js；夹具只写系统临时目录，不修改正式期次。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {bindVibeContentApproval,writeVibeTimeline,assertVibeContent} from '../../build/vibe/vibe_timeline.mjs';

const plain=text=>String(text).replace(/[\p{P}\s]/gu,'');
const count=text=>Array.from(plain(text)).length;
const cli=path.resolve('build/vibe/vibe_caption_split.mjs');
async function splitter() {
  assert.ok(fs.existsSync(cli),'缺少Vibe专用程序初切入口');
  return import('../../build/vibe/vibe_caption_split.mjs');
}
function fixture(t,text='选项多了，有时反而更难决定，甚至干脆不选，这种现象叫选择过载。') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-split-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const put=(name,value)=>{
    const file=path.resolve(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{encoding:'utf8'});
  };
  const folder='course/episodes/01-demo';
  const index={route:'vibe',episode:'ep01',slug:'demo',script:'course/scripts/01-demo.md',
    split_preview:folder+'/旁白切分预览.json',publish_spec:{duration_s:8},
    acts:[{act:1,visual_timing:folder+'/act1.json'}]};
  put(index.script,'## 第一幕\n旁白：'+text+'\n');put(index.split_preview,{act1:[text]});
  const file=path.resolve(root,folder,'制作索引.json');put(file,index);
  const run=(...args)=>spawnSync(process.execPath,[cli,file,...args],{cwd:root,encoding:'utf8',windowsHide:true});
  const load=()=>JSON.parse(fs.readFileSync(file,{encoding:'utf8'}));
  return {root,folder,index,file,put,run,load,text};
}

test('程序把长段初切成屏，保留标点且不生成教学TTS字段',async()=>{
  const {splitVibeText}=await splitter();
  const text='选项多了，有时反而更难决定，甚至干脆不选，这种现象叫选择过载。';
  const result=splitVibeText(text);
  assert.ok(result.captions.length>1);
  assert.equal(result.captions.map(c=>c.text).join(''),text);
  for (const c of result.captions) {
    assert.ok(count(c.text)<=18);assert.equal(c.start,null);assert.equal(c.end,null);
    assert.equal(c.voice_id,undefined);assert.equal(c.pause_after,undefined);
  }
});

test('短句不跨句合并，也不按教学36字阈值重新合成长屏',async()=>{
  const {splitVibeText}=await splitter();
  assert.deepEqual(splitVibeText('不。先停一下。').captions.map(c=>c.text),['不。','先停一下。']);
  const r=splitVibeText('比如，这些已经花掉的钱，不能因为继续等就回来，未来的时间却还能选择。');
  assert.notEqual(r.captions[0].text,'比如，');
  assert.ok(r.captions.every(c=>count(c.text)<=18));
});

test('完整问句可保留，超过单行上限明确要求复核双行，超24字不硬截',async()=>{
  const {splitVibeText}=await splitter();
  const question='如果接下来这一年还是这样，你还愿意继续一起过吗？';
  assert.ok(count(question)>18&&count(question)<=24);
  const r=splitVibeText(question);
  assert.deepEqual(r.captions.map(c=>c.text),[question]);
  assert.ok(r.review_notes.some(n=>n.code==='two_lines'));
  const long='这是一个没有合适标点而且不应该为了满足字数直接从中间截断的完整专有名称';
  const unresolved=splitVibeText(long);
  assert.deepEqual(unresolved.captions.map(c=>c.text),[long]);
  assert.ok(unresolved.review_notes.some(n=>n.code==='over_limit'));
});

test('省略号不把能够单屏的完整问句预先拆断',async()=>{
  const {splitVibeText}=await splitter();
  const text='你选择……还是不选？';
  assert.deepEqual(splitVibeText(text).captions.map(c=>c.text),[text]);
});

test('保留引号内的专名、数字分组、小数、时间及计量单位',async()=>{
  const {splitVibeText}=await splitter();
  const text='他在12:30看到了“时间，金钱与选择”，总价1,234.5元，重2.5kg。';
  const r=splitVibeText(text),parts=r.captions.map(c=>c.text);
  assert.equal(parts.join(''),text);
  for (const token of ['12:30','“时间，金钱与选择”','1,234.5元','2.5kg']) assert.ok(parts.some(p=>p.includes(token)),token);
  const unicode=splitVibeText('𠮷'.repeat(18)+'。');
  assert.equal(unicode.review_notes[0].characters,18);
});

test('英文双引号内的长专名不在逗号处分裂，超限交由人工处理',async()=>{
  const {splitVibeText}=await splitter();
  const name='"International, Business Machines"';
  const r=splitVibeText('看这个名字，'+name+'，先确认它指的是什么。');
  assert.ok(r.captions.some(c=>c.text.includes(name)));
  assert.ok(r.review_notes.some(n=>n.code==='over_limit'));
});

test('CLI初切可重跑且不修改原稿、语义预览、索引或创建确认',async t=>{
  await splitter();const f=fixture(t);const before=fs.readFileSync(f.file);
  const r=f.run();assert.equal(r.status,0,r.stderr);
  const out=path.resolve(f.root,f.folder,'字幕初切草稿.json');
  const data=JSON.parse(fs.readFileSync(out,{encoding:'utf8'}));
  assert.equal(data.generated_by,'build/vibe/vibe_caption_split.mjs');assert.equal(data.stage,'automatic_draft');
  assert.equal(data.acts[0].captions.map(c=>c.text).join(''),f.text);
  assert.equal(data.acts[0].total_s,null);assert.deepEqual(fs.readFileSync(f.file),before);
  const original=fs.readFileSync(out);assert.equal(f.run().status,0);assert.deepEqual(fs.readFileSync(out),original);
  f.put(out,{...data,note:'人工保留内容'});
  assert.notEqual(f.run().status,0);assert.equal(JSON.parse(fs.readFileSync(out,{encoding:'utf8'})).note,'人工保留内容');
  assert.equal(f.run('--out',path.resolve(f.root,f.folder,'另存草稿.json')).status,0);
});

test('CLI对没有安全断点的超长项输出待处理清单及非零退出，不伪造完成',async t=>{
  await splitter();const f=fixture(t,'这是一个没有合适标点而且不应该为了满足字数直接从中间截断的完整专有名称');
  const r=f.run();assert.equal(r.status,3,r.stderr);
  const draft=JSON.parse(fs.readFileSync(path.resolve(f.root,f.folder,'字幕初切草稿.json'),{encoding:'utf8'}));
  assert.ok(draft.acts[0].review_notes.some(n=>n.code==='over_limit'));
  assert.match(r.stdout,/人工复核|待处理/);
});

test('时间表统一导出每条一屏的预览，旧预览不能靠全文相等蒙混过关',t=>{
  const f=fixture(t,'票钱回不来。未来的时间还能选择。');
  const index={...f.index,content_approval:{confirmed:true,statement:'测试夹具确认'}};
  f.put(f.file,index);bindVibeContentApproval(f.file,{rootDir:f.root});
  const captions=[{id:'a',start:0,end:3,text:'票钱回不来。'},{id:'b',start:3,end:8,text:'未来的时间还能选择。'}];
  f.put(index.acts[0].visual_timing,{total_s:8,source_text:f.text,captions});
  writeVibeTimeline(f.file,{rootDir:f.root});
  const updated=f.load();assert.ok(updated.caption_preview,'应登记独立的逐屏预览路径');
  const preview=path.resolve(f.root,updated.caption_preview);
  assert.deepEqual(JSON.parse(fs.readFileSync(preview,{encoding:'utf8'})),{act1:captions.map(c=>c.text)});
  f.put(preview,{act1:[f.text]});
  assert.throws(()=>assertVibeContent(updated,{rootDir:f.root,checkPreview:true}),/逐屏.*预览|预览.*过期/);
  writeVibeTimeline(f.file,{rootDir:f.root});
  assert.doesNotThrow(()=>assertVibeContent(f.load(),{rootDir:f.root,checkPreview:true}));
  const before=fs.readFileSync(preview);
  f.put(index.acts[0].visual_timing,{total_s:8,source_text:'漏句',captions:[{id:'a',start:0,end:8,text:'漏句'}]});
  assert.throws(()=>writeVibeTimeline(f.file,{rootDir:f.root}),/正文/);
  assert.deepEqual(fs.readFileSync(preview),before);
});

test('逐屏预览输出不得覆盖作为确认来源的同名文件',t=>{
  const f=fixture(t,'票钱回不来。未来还能选择。');
  f.index.split_preview=f.folder+'/逐屏字幕预览.json';
  f.index.content_approval={confirmed:true,statement:'测试夹具确认'};
  f.put(f.index.split_preview,{act1:[f.text]});f.put(f.file,f.index);
  bindVibeContentApproval(f.file,{rootDir:f.root});
  f.put(f.index.acts[0].visual_timing,{total_s:8,source_text:f.text,captions:[
    {id:'a',start:0,end:3,text:'票钱回不来。'},{id:'b',start:3,end:8,text:'未来还能选择。'}]});
  const before=fs.readFileSync(path.resolve(f.root,f.index.split_preview));
  assert.throws(()=>writeVibeTimeline(f.file,{rootDir:f.root}),/路径.*冲突|覆盖.*来源/);
  assert.deepEqual(fs.readFileSync(path.resolve(f.root,f.index.split_preview)),before);
});

test('已登记的逐屏预览不能用空值或额外幕绕过检查',t=>{
  const f=fixture(t,'票钱回不来。');
  f.index.content_approval={confirmed:true,statement:'测试夹具确认'};
  f.put(f.file,f.index);bindVibeContentApproval(f.file,{rootDir:f.root});
  f.put(f.index.acts[0].visual_timing,{total_s:8,source_text:f.text,captions:[{id:'a',start:0,end:8,text:f.text}]});
  writeVibeTimeline(f.file,{rootDir:f.root});const index=f.load();
  for (const value of [null,false,0,'',{}, {act1:[f.text],act2:['多出来的字幕。']}]) {
    f.put(index.caption_preview,JSON.stringify(value));
    assert.throws(()=>assertVibeContent(index,{rootDir:f.root,checkPreview:true}),/逐屏.*预览/);
  }
});
