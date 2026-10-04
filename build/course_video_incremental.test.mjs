// 用途：验证单幕缓存复用、预检与片段隔离，防止局部预览冒充正式成片。
// 运行：node --test build/course_video_incremental.test.mjs
// 依赖：Node.js；编排测试使用替身，实际采帧另作短片段验证。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCourseVideoPlan, runCourseVideoPlan, markCourseActComplete, canReuseCourseAct,
  parseCourseVideoOptions, extractCourseLayoutCheckTimes, prepareCourseRange, verifyCourseVideoInputs } from './course_video.mjs';

function fixture(t) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-incremental-'));
  t.after(() => {
    assert.equal(path.dirname(rootDir), path.resolve(os.tmpdir()));
    fs.rmSync(rootDir, {recursive:true, force:true});
  });
  const index = {episode:'ep04', slug:'test', current_version:'v1', timeline_summary:'timeline.json',
    acts:[1,2,3,4].map(act => ({act, audio:`act${act}.wav`, timings:`act${act}.json`,
      visual_source:`act${act}.html`, subtitle_highlights:[], allowed_warnings:{}}))};
  return {rootDir, index};
}

test('单幕完成缓存被随后整期 review 直接复用，单幕不拼接、不登记整期', t => {
  const {rootDir, index} = fixture(t);
  const single = createCourseVideoPlan(index, 'review', {rootDir, act:2});
  const full = createCourseVideoPlan(index, 'review', {rootDir});
  assert.deepEqual(single.acts[0], full.acts[1]);
  assert.deepEqual(single.finalSteps, []);
  const prepare = act => {
    fs.mkdirSync(act.buildDir, {recursive:true});
    // 这里只替换测试计划的文件输入，不改真实工具文件。
    act.inputs = [path.join(rootDir, `act${act.act}.html`)];
    fs.writeFileSync(act.inputs[0], 'source', {encoding:'utf8'});
  };
  runCourseVideoPlan(single, {verifyInputs:()=>{}, canReuseAct:()=>false, prepareAct:prepare,
    executeStep:step=>{ if (step.type === 'decode') fs.writeFileSync(single.acts[0].output, 'video', {encoding:'utf8'}); }});
  full.acts[1].inputs = single.acts[0].inputs;
  const built = [];
  runCourseVideoPlan(full, {verifyInputs:()=>{}, canReuseAct:act => act.act === 2
    && canReuseCourseAct(act, {spawnSyncImpl:()=>({status:0})}),
    prepareAct:act=>built.push(act.act), executeStep:()=>{}, markActComplete:()=>{}});
  assert.deepEqual(built, [1,3,4]);
});

test('缓存依赖内容和验收设置，touch 可复用，改内容、替换输出或收紧 warning 不可复用', t => {
  const {rootDir, index} = fixture(t);
  const act = createCourseVideoPlan(index, 'review', {rootDir, act:1}).acts[0];
  fs.mkdirSync(act.buildDir, {recursive:true});
  const input = path.join(rootDir, 'source.html');
  fs.writeFileSync(input, 'source', {encoding:'utf8'});
  fs.writeFileSync(act.output, 'video', {encoding:'utf8'});
  act.inputs = [input];
  markCourseActComplete(act);
  const opts = {spawnSyncImpl:()=>({status:0})};
  fs.utimesSync(input, new Date(), new Date(Date.now()+10000));
  assert.equal(canReuseCourseAct(act, opts), true);
  fs.writeFileSync(input, 'change', {encoding:'utf8'});
  assert.equal(canReuseCourseAct(act, opts), false);
  fs.writeFileSync(input, 'source', {encoding:'utf8'});
  act.allowedWarnings = {test:1};
  assert.equal(canReuseCourseAct(act, opts), false);
  act.allowedWarnings = {};
  fs.writeFileSync(act.output, 'other', {encoding:'utf8'});
  assert.equal(canReuseCourseAct(act, opts), false);
});

test('预检总会执行浏览器检查，不渲染、不写完成缓存，首现失败立即中断', t => {
  const {rootDir, index} = fixture(t);
  const plan = createCourseVideoPlan(index, 'review', {rootDir, act:2, checkOnly:true});
  const events = [];
  runCourseVideoPlan(plan, {verifyInputs:()=>{}, canReuseAct:()=>{throw new Error('不能读取正式缓存');},
    prepareAct:()=>{}, executeStep:step=>events.push(step.type),
    markActComplete:()=>{throw new Error('不能登记完成');}});
  assert.deepEqual(events, ['check','first-reveal']);
  const complete = createCourseVideoPlan(index, 'review', {rootDir, act:2});
  const failed = [];
  assert.throws(()=>runCourseVideoPlan(complete, {verifyInputs:()=>{}, canReuseAct:()=>false,
    prepareAct:()=>{}, executeStep:step=>{failed.push(step.type); if(step.type==='first-reveal')throw new Error('提前显示');},
    markActComplete:()=>{throw new Error('不应写入');}}), /提前显示/);
  assert.deepEqual(failed, ['check','first-reveal']);
});

test('片段输出独立，旁白同段裁切，不能污染整幕完成缓存', t => {
  const {rootDir, index} = fixture(t);
  const full = createCourseVideoPlan(index, 'review', {rootDir, act:2});
  const range = createCourseVideoPlan(index, 'review', {rootDir, act:2, range:[39,43]});
  const act = range.acts[0];
  assert.notEqual(act.buildDir, full.acts[0].buildDir);
  assert.deepEqual(range.finalSteps, []);
  const mux = act.steps.find(step=>step.type==='mux-wav').args;
  assert.equal(mux[mux.indexOf('-ss')+1], '39');
  assert.equal(mux[mux.indexOf('-t')+1], '4');
  assert.equal(canReuseCourseAct(act), false);
  assert.throws(()=>markCourseActComplete(act), /片段预览不能/);
  fs.mkdirSync(act.buildDir, {recursive:true});
  fs.writeFileSync(path.join(act.buildDir, 'index.html'), '<body><div data-duration="85"></div><script>const DUR=85;</script></body>', {encoding:'utf8'});
  prepareCourseRange(act);
  const html = fs.readFileSync(path.join(act.buildDir, 'index.html'), {encoding:'utf8'});
  assert.match(html, /data-duration="4"/);
  assert.match(html, /time:39/);
  assert.match(html, /time:43, duration:4/);
});

test('单幕允许其他画面尚未制作；只检查选中幕，第四幕收尾门禁不被绕过', t => {
  const {rootDir, index} = fixture(t);
  index.episode='ep12';
  index.acts[2].visual_source=null;
  assert.throws(()=>createCourseVideoPlan(index,'review',{rootDir}), /visual_source/);
  const plan = createCourseVideoPlan(index,'review',{rootDir,act:2});
  assert.ok(!plan.requiredInputs.includes(path.join(rootDir,'act3.wav')));
  assert.doesNotThrow(()=>verifyCourseVideoInputs({...plan, requiredInputs:[], acts:[{act:2}]}));
  assert.throws(()=>verifyCourseVideoInputs({...plan, requiredInputs:[], acts:[{act:4,timings:path.join(rootDir,'missing.json')}]}), /无法读取 timings/);
});

test('参数错误在生产动作前拒绝；enter 转场也覆盖布局检查', t => {
  const {rootDir,index}=fixture(t);
  assert.deepEqual(parseCourseVideoOptions(['--act','2','--range','39:43']), {act:2,range:[39,43]});
  for(const args of [['--unknown'],['--act'],['--range','1:'],['--act','1','--act','2']]) {
    assert.throws(()=>parseCourseVideoOptions(args));
  }
  for(const opts of [{act:0},{act:1.5},{range:[1,2]},{act:2,range:[3,2]},{act:2,range:[1,2],checkOnly:true}]) {
    assert.throws(()=>createCourseVideoPlan(index,'review',{rootDir,...opts}));
  }
  assert.throws(()=>createCourseVideoPlan(index,'publish',{rootDir,act:2}), /仅适用于 review/);
  assert.deepEqual(extractCourseLayoutCheckTimes("const DUR=30;enter('#s1',.18);enter('#s2',10);enter('#s3',20);"),[8.8,18.8,28.8]);
});

test('实际片段与原成片同时间段画面及正式 WAV 对齐', {skip:!process.env.COURSE_PREVIEW_FILE}, t => {
  const clip = process.env.COURSE_PREVIEW_FILE;
  const reference = process.env.COURSE_PREVIEW_REFERENCE;
  const wav = process.env.COURSE_PREVIEW_WAV;
  const start = Number(process.env.COURSE_PREVIEW_START);
  assert.ok(reference && wav && Number.isFinite(start));
  const run = (command,args,encoding='utf8') => {
    const result=spawnSync(command,args,{encoding,windowsHide:true,maxBuffer:16*1024*1024});
    assert.equal(result.status,0,String(result.stderr));
    return result;
  };
  const probe=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,nb_frames', '-of','json',clip]).stdout);
  const duration=Number(probe.format.duration);
  assert.ok(duration>0);
  const result=run('ffmpeg',['-hide_banner','-nostats','-i',reference,'-i',clip,'-filter_complex',
    `[0:v]trim=start=${start}:end=${start+duration},setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]ssim=shortest=1`,
    '-an','-f','null','-']);
  const score=Number(result.stderr.match(/All:([\d.]+)/u)?.[1]);
  assert.ok(score>.98,`片段画面与原成片不一致：SSIM=${score}`);
  const pcm=(file,offset)=>run('ffmpeg',['-v','error','-ss',String(offset),'-i',file,'-t',String(duration),
    '-map','0:a:0','-ar','48000','-ac','1','-f','s16le','-'],null).stdout;
  const actual=pcm(clip,0), expected=pcm(wav,start);
  let xy=0,xx=0,yy=0;
  for(let i=0;i+1<Math.min(actual.length,expected.length);i+=2){
    const x=actual.readInt16LE(i),y=expected.readInt16LE(i);xy+=x*y;xx+=x*x;yy+=y*y;
  }
  const correlation=xy/Math.sqrt(xx*yy);
  assert.ok(correlation>.97,`片段旁白未对齐：相关系数=${correlation}`);
  t.diagnostic(`片段 ${duration}s / ${probe.streams.find(s=>s.codec_type==='video').nb_frames} 帧；SSIM=${score}；旁白相关系数=${correlation}`);
});
