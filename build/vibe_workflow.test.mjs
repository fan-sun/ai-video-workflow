import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {initCourseEpisode} from './init_course_episode.mjs';
import {createCourseVideoPlan,verifyCourseVideoInputs} from './course_video.mjs';
import {checkCourseRelease} from './check_course_release.mjs';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-route-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  initCourseEpisode(root,'01-demo',{topic:'沉没成本',route:'vibe'});
  const file=path.join(root,'course/episodes/01-demo/制作索引.json');
  const index=JSON.parse(fs.readFileSync(file,{encoding:'utf8'}));
  return {root,file,index};
}

test('Vibe初始化保留当前契约，采用横屏、独立封面与视觉时间字段',t=>{
  const {index}=fixture(t);
  assert.equal(index.route,'vibe');
  assert.equal(index.production_contract,'current');
  assert.equal(index.publish_spec.width,1920);
  assert.equal(index.publish_spec.audio_channels,2);
  assert.equal(index.cover_embed.duration_s,0);
  assert.equal(index.acts[0].visual_timing,null);
  assert.equal(index.acts[0].audio,null);
});

test('重复初始化不能把已有课程悄悄切成Vibe',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vibe-route-change-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  initCourseEpisode(root,'01-demo');
  assert.throws(()=>initCourseEpisode(root,'01-demo',{route:'vibe'}),/路线/);
});

test('Vibe环境检查不要求声音克隆模型和参考录音',()=>{
  const r=spawnSync(process.execPath,['build/doctor.mjs','--route','vibe'],{
    encoding:'utf8',windowsHide:true,
    env:{...process.env,VOXCPM_MODEL:'missing-for-vibe',VOXCPM_REF_WAV:'missing-for-vibe.wav'},
  });
  assert.doesNotMatch(r.stdout,/失败：(?:模型|参考|Python\/VoxCPM)/);
});

test('隔离Vibe示例按仓库根目录解析环境里的相对工具路径',async()=>{
  const {exampleEnvironment}=await import('../examples/vibe-knowledge/run.mjs');
  const root=path.resolve('repo');
  const env=exampleEnvironment({COURSE_PYTHON:'.venv/Scripts/python.exe',CHROME_PATH:'browser/chrome.exe',COURSE_GIT_BASH:'bash'},root);
  assert.equal(env.COURSE_PYTHON,path.join(root,'.venv/Scripts/python.exe'));
  assert.equal(env.CHROME_PATH,path.join(root,'browser/chrome.exe'));
  assert.equal(env.COURSE_GIT_BASH,'bash');
});

test('Vibe视觉时间表拒绝缺字、重叠字幕和不匹配的重点',async t=>{
  const {readVibeTiming}=await import('./vibe_timeline.mjs');
  const {root}=fixture(t),file=path.join(root,'timing.json');
  const good={total_s:3,source_text:'票钱回不来。',captions:[{id:'a',start:0,end:3,text:'票钱回不来。',emphasis:['票钱']}]};
  const put=v=>fs.writeFileSync(file,JSON.stringify(v),{encoding:'utf8'});
  put(good);assert.equal(readVibeTiming(file).total_s,3);
  put({...good,captions:[{...good.captions[0],text:'回不来',emphasis:[]}]});
  assert.throws(()=>readVibeTiming(file),/原文|缺字/);
  put({...good,captions:[{...good.captions[0],emphasis:['时间']}]});
  assert.throws(()=>readVibeTiming(file),/重点/);
  put({...good,captions:[{id:'a',start:0,end:2,text:'票钱'},{id:'b',start:1,end:3,text:'回不来'}]});
  assert.throws(()=>readVibeTiming(file),/重叠/);
});

test('Vibe输入预检拒绝根时长不一致和过期的整期边界',t=>{
  const {root,index}=fixture(t);
  index.acts=index.acts.slice(0,1);index.timeline_summary='timeline.json';index.publish_spec.duration_s=3;
  const source=path.join(root,'visual.html'),timings=path.join(root,'timing.json');
  const html=duration=>`<div data-composition-id="main" data-width="1920" data-height="1080" data-duration="${duration}"></div><script>const DUR=3;</script>`;
  fs.writeFileSync(source,html(2),{encoding:'utf8'});
  fs.writeFileSync(timings,JSON.stringify({total_s:3,source_text:'时间',captions:[{id:'a',start:0,end:3,text:'时间'}]}),{encoding:'utf8'});
  const timeline={route:'vibe',total_s:3,acts:[{act:1,start_s:0,end_s:3,duration_s:3}]};
  const put=()=>fs.writeFileSync(path.join(root,'timeline.json'),JSON.stringify(timeline),{encoding:'utf8'});put();
  const plan={rootDir:root,index,requiredInputs:[source,timings],acts:[{act:1,source,timings}]};
  assert.throws(()=>verifyCourseVideoInputs(plan),/data-duration|根.*时长/);
  fs.writeFileSync(source,html(3),{encoding:'utf8'});
  verifyCourseVideoInputs(plan);
  timeline.acts[0].start_s=1;put();
  assert.throws(()=>verifyCourseVideoInputs(plan),/边界|连续/);
  timeline.acts[0].start_s=0;delete timeline.acts[0].duration_s;put();
  assert.throws(()=>verifyCourseVideoInputs(plan),/时长|时间表/);
});

test('Vibe发布复用确认过的高清审片版，拒绝没有确认或确认后改动的媒体',t=>{
  const {root,index}=fixture(t);
  index.content_approval={confirmed:true};
  index.timeline_summary='timeline.json';
  index.review_output='review.mp4';
  index.cover_output='cover.png';
  index.publish_copy='copy.txt';
  index.acts.forEach((a,i)=>{a.visual_timing=`t${i}.json`;a.visual_source=`a${i}.html`;});
  assert.throws(()=>createCourseVideoPlan(index,'publish',{rootDir:root}),/review_approval/);
  fs.writeFileSync(path.join(root,'review.mp4'),'approved',{encoding:'utf8'});
  index.review_approval={confirmed:true,sha256:'wrong'};
  assert.throws(()=>createCourseVideoPlan(index,'publish',{rootDir:root}),/确认.*变化|哈希/);
});

test('独立发布检查失败时撤销过期的发布完成状态',t=>{
  const {root,file,index}=fixture(t);
  index.example={technical_only:true};index.publish_bundle={complete:true};
  fs.writeFileSync(file,JSON.stringify(index),{encoding:'utf8'});
  const r=spawnSync(process.execPath,[path.resolve('build/check_course_release.mjs'),file],{cwd:root,encoding:'utf8',windowsHide:true});
  assert.equal(r.status,1);
  assert.equal(JSON.parse(fs.readFileSync(file,{encoding:'utf8'})).publish_bundle,null);
});

test('混音计划保持100%与25%线性增益，不进行归一化或重编码视频',async t=>{
  const {createAudioMixArgs}=await import('./mix_video_audio.mjs');
  const args=createAudioMixArgs({video:'base.mp4',music:'music.mp3',output:'mix.mp4',duration:3,sourceGain:1,musicGain:.25,sourceChannels:1});
  assert(args.includes('copy'));
  assert.match(args[args.indexOf('-filter_complex')+1],/volume=0.25/);
  assert.match(args[args.indexOf('-filter_complex')+1],/normalize=0/);
  assert.match(args[args.indexOf('-filter_complex')+1],/pan=stereo\|c0=c0\|c1=c0/);
  assert.throws(()=>createAudioMixArgs({duration:3,sourceGain:1,musicGain:NaN}),/增益/);
});

test('静音声道不能掩盖另一声道的削波',async()=>{
  const {readPeakDb}=await import('./mix_video_audio.mjs');
  assert.equal(readPeakDb('Peak level dB: -inf\nPeak level dB: -6.1'),-6.1);
  assert.equal(readPeakDb('Peak level dB: -inf'),-Infinity);
  assert.throws(()=>readPeakDb('Peak level dB: 0.000265\nPeak level dB: -inf'),/削波/);
  assert.throws(()=>readPeakDb('Peak level dB: nan'),/峰值/);
});

test('重复混音保留未变化的确认，改变比例使当前发布验收失效',async t=>{
  const {mixVideoAudio}=await import('./mix_video_audio.mjs');
  const {root,file,index}=fixture(t);
  const run=args=>{
    const r=spawnSync('ffmpeg',['-v','error','-y',...args],{encoding:'utf8',windowsHide:true});
    assert.equal(r.status,0,r.stderr);
  };
  run(['-f','lavfi','-i','color=c=black:s=64x64:r=30:d=1','-f','lavfi','-i','sine=frequency=720:sample_rate=48000:duration=1','-af','volume=0.1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac','2',path.join(root,'base.mp4')]);
  run(['-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=2','-af','volume=0.1','-ac','2',path.join(root,'music.wav')]);
  index.example={technical_only:true};index.review_base_output='base.mp4';index.review_output='base.mp4';
  index.bgm={file:'music.wav',gain:.25,source_gain:1};
  fs.writeFileSync(file,JSON.stringify(index),{encoding:'utf8'});
  mixVideoAudio(file,{rootDir:root});
  const first=JSON.parse(fs.readFileSync(file,{encoding:'utf8'}));
  first.review_approval={confirmed:true,sha256:first.audio_mix.sha256};first.publish_bundle={complete:true};
  fs.writeFileSync(file,JSON.stringify(first),{encoding:'utf8'});
  mixVideoAudio(file,{rootDir:root});
  const same=JSON.parse(fs.readFileSync(file,{encoding:'utf8'}));
  assert.deepEqual(same.review_approval,first.review_approval);assert.equal(same.publish_bundle.complete,true);
  same.bgm.gain=.255;fs.writeFileSync(file,JSON.stringify(same),{encoding:'utf8'});
  const changed=mixVideoAudio(file,{rootDir:root});
  const final=JSON.parse(fs.readFileSync(file,{encoding:'utf8'}));
  assert.equal(final.review_approval,null);assert.equal(final.publish_bundle,null);
  assert.match(changed,/bgm25\.5\.mp4$/);
  final.review_approval={confirmed:true,sha256:final.audio_mix.sha256};final.publish_bundle={complete:true};
  fs.writeFileSync(file,JSON.stringify(final),{encoding:'utf8'});
  const approvedBytes=fs.readFileSync(changed);
  run(['-f','lavfi','-i','color=c=black:s=64x64:r=30:d=1','-f','lavfi','-i','aevalsrc=0.9*sgn(sin(2*PI*997*t))|0.9*sgn(sin(2*PI*997*t)):s=48000:d=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac','2',path.join(root,'base.mp4')]);
  run(['-f','lavfi','-i','aevalsrc=sgn(sin(2*PI*997*t))|sgn(sin(2*PI*997*t)):s=48000:d=2','-ac','2',path.join(root,'music.wav')]);
  assert.throws(()=>mixVideoAudio(file,{rootDir:root}),/削波/);
  assert.equal(fs.readFileSync(changed).equals(approvedBytes),true,'失败的候选混音不能覆盖已确认文件');
  assert.equal(JSON.parse(fs.readFileSync(file,{encoding:'utf8'})).publish_bundle.complete,true);
});

test('Vibe发布检查独立3:4封面和短标题，不要求课程标签、首帧封面或片尾静音',t=>{
  const {root,file,index}=fixture(t);
  const folder='pipeline/output/course/ep01_demo/v1';
  fs.mkdirSync(path.join(root,folder),{recursive:true});
  index.example={technical_only:true};
  index.chapter_titles=['判断'];index.acts=index.acts.slice(0,1);
  index.cover_selection={method:'code'};index.cover_output='course/episodes/01-demo/cover.png';
  index.review_output=folder+'/course_ep01_demo_v1.mp4';
  index.publish_output=folder+'/course_ep01_demo_v1_publish.mp4';
  index.publish_copy=folder+'/course_ep01_demo_v1.txt';
  index.timeline_summary='course/episodes/01-demo/整期时间表.json';
  index.publish_spec.duration_s=3;
  for (const key of ['review_output','publish_output']) fs.writeFileSync(path.join(root,index[key]),'media',{encoding:'utf8'});
  const png=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=white:s=30x40','-frames:v','1',path.join(root,index.cover_output)],{encoding:'utf8',windowsHide:true});
  assert.equal(png.status,0,png.stderr);
  fs.writeFileSync(path.join(root,index.timeline_summary),JSON.stringify({route:'vibe',total_s:3,acts:[{act:1,start_s:0,end_s:3,duration_s:3}]}),{encoding:'utf8'});
  const copy='【标题】\nVibe知识大赏｜沉没成本：为何还舍不得？\n【发布文案】\n钱已经花掉，下一小时还能选择。\n【标签】\n#Vibe知识大赏 #沉没成本\n【视频总结】\n沉没成本是已经付出且无法收回的钱、时间和精力。判断要不要继续时，除了过去的投入，还应看接下来需要付出什么、可能得到什么，以及现实的变化和自己还有哪些选择。\n【视频章节】\n00:00–00:03　第一幕 · 判断\n';
  fs.writeFileSync(path.join(root,index.publish_copy),copy,{encoding:'utf8'});
  const ledger=JSON.parse(fs.readFileSync(path.join(root,'course/episodes.json'),{encoding:'utf8'}));
  Object.assign(ledger.episodes[0],{output:index.publish_output,version:'v1',duration_s:3});
  fs.writeFileSync(path.join(root,'course/episodes.json'),JSON.stringify(ledger),{encoding:'utf8'});
  fs.writeFileSync(file,JSON.stringify(index),{encoding:'utf8'});
  const result=checkCourseRelease(file,{rootDir:root,outroTailVerifier:()=>{throw Error('错误调用片尾静音');},coverWindowVerifier:()=>{throw Error('错误调用首帧封面');}});
  assert.equal(result.ok,true);
  delete index.example;
  index.review_approval={confirmed:true,sha256:'wrong'};
  fs.writeFileSync(file,JSON.stringify(index),{encoding:'utf8'});
  assert.throws(()=>checkCourseRelease(file,{rootDir:root}),/确认.*变化|哈希/);
  index.review_approval.sha256=createHash('sha256').update('media').digest('hex');
  fs.writeFileSync(file,JSON.stringify(index),{encoding:'utf8'});
  assert.equal(checkCourseRelease(file,{rootDir:root}).ok,true);
  fs.writeFileSync(path.join(root,index.publish_output),'changed',{encoding:'utf8'});
  assert.throws(()=>checkCourseRelease(file,{rootDir:root}),/发布版.*审片版/);
  fs.writeFileSync(path.join(root,index.publish_output),'media',{encoding:'utf8'});
  fs.writeFileSync(path.join(root,index.publish_copy),copy.replace('为何还舍不得？','一二三四五六七八九十一二三四五六'),{encoding:'utf8'});
  assert.throws(()=>checkCourseRelease(file,{rootDir:root}),/15/);
});

test('配乐试听引用无音乐底片，不能把已混音版本再次叠加音乐',async t=>{
  const {createMusicPreview}=await import('./preview_video_audio.mjs');
  const {root,file,index}=fixture(t);
  index.review_base_output='base.mp4';index.review_output='already-mixed.mp4';
  index.bgm={file:'music.wav',gain:.25,source_gain:1};
  fs.writeFileSync(path.join(root,'base.mp4'),'media',{encoding:'utf8'});
  fs.writeFileSync(path.join(root,'music.wav'),'music',{encoding:'utf8'});
  fs.writeFileSync(file,JSON.stringify(index),{encoding:'utf8'});
  const output=createMusicPreview(file,{rootDir:root});
  const html=fs.readFileSync(output,{encoding:'utf8'});
  assert.match(html,/base\.mp4/);
  assert.doesNotMatch(html,/already-mixed\.mp4/);
  assert.match(html,/value="25"/);
});

test('Vibe复用分幕渲染，不要求TTS、固定开场或章节覆盖层',async t=>{
  const {writeVibeTimeline}=await import('./vibe_timeline.mjs');
  const {root,file,index}=fixture(t);
  index.example={technical_only:true};
  index.chapter_titles=['票钱'];
  index.acts=index.acts.slice(0,1);
  index.acts[0].visual_timing='course/episodes/01-demo/画面时间表.json';
  index.acts[0].visual_source='course/acts/ep01_demo/index.html';
  fs.writeFileSync(path.join(root,index.acts[0].visual_timing),JSON.stringify({total_s:3,source_text:'票钱回不来',captions:[{id:'a',start:0,end:3,text:'票钱回不来'}]}),{encoding:'utf8'});
  fs.writeFileSync(file,JSON.stringify(index),{encoding:'utf8'});
  writeVibeTimeline(file,{rootDir:root});
  const ready=JSON.parse(fs.readFileSync(file,{encoding:'utf8'}));
  const plan=createCourseVideoPlan(ready,'review',{rootDir:root});
  assert.equal(plan.acts[0].prepare.chapter,null);
  assert.equal(plan.acts[0].prepare.includeCover,false);
  assert(plan.acts[0].steps.find(s=>s.type==='render').args.includes('high'));
  assert.equal(plan.acts[0].audio,null);
  assert(plan.acts[0].steps.some(s=>s.type==='mux-wav'));
  ready.review_base_output='pipeline/output/course/ep01_demo/v1/course_ep01_demo_v1.mp4';
  ready.review_output='pipeline/output/course/ep01_demo/v1/course_ep01_demo_v1_sfx100_bgm25.mp4';
  assert.equal(createCourseVideoPlan(ready,'review',{rootDir:root}).finalOutput,path.resolve(root,ready.review_base_output));
  ready.current_version='v2';
  assert.equal(createCourseVideoPlan(ready,'review',{rootDir:root}).finalOutput,path.resolve(root,'pipeline/output/course/ep01_demo/v2/course_ep01_demo_v2.mp4'));
  ready.cover_selection={method:'code'};ready.cover_output='cover.png';ready.publish_copy='copy.txt';
  ready.publish_output='pipeline/output/course/ep01_demo/v1/course_ep01_demo_v1_publish.mp4';
  const published=createCourseVideoPlan(ready,'publish',{rootDir:root});
  assert.equal(published.finalOutput,path.resolve(root,'pipeline/output/course/ep01_demo/v2/course_ep01_demo_v2_publish.mp4'));
  const cover=published.finalSteps.find(s=>s.type==='copy-cover');
  assert.equal(cover?.output,path.resolve(root,'pipeline/output/course/ep01_demo/v2/cover.png'));
});
