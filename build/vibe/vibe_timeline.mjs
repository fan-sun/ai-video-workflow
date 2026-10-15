// 用途：校验无旁白字幕和动作时间，生成Vibe整期时间表。
// 运行：node build/vibe/vibe_timeline.mjs <制作索引.json>。
// 依赖：Node.js；各幕visual_timing为真实画面时间，不生成TTS文件。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const read=file=>JSON.parse(fs.readFileSync(file,{encoding:'utf8'}));
const plain=text=>String(text).replace(/[\p{P}\s]/gu,'');

export function assertVibeTimeline(timeline,actCount,duration) {
  if (timeline.route!=='vibe'||!Number.isFinite(timeline.total_s)||timeline.total_s<=0
    ||!Array.isArray(timeline.acts)||timeline.acts.length!==actCount)
    throw new Error('Vibe整期时间表无效');
  let end=0;
  for (const [i,act] of timeline.acts.entries()) {
    if (act.act!==i+1||![act.start_s,act.end_s,act.duration_s].every(Number.isFinite)
      ||act.end_s<=act.start_s||Math.abs(act.start_s-end)>.002
      ||Math.abs(act.end_s-act.start_s-act.duration_s)>.002)
      throw new Error('Vibe各幕时间边界必须连续且时长一致');
    end=act.end_s;
  }
  if (!Number.isFinite(duration)||Math.abs(end-timeline.total_s)>.002||Math.abs(end-duration)>.002)
    throw new Error('Vibe整期时间表总时长与发布规格不一致');
}

export function readVibeTiming(file) {
  const timing=read(file);
  if (!Number.isFinite(timing.total_s)||timing.total_s<=0||!Array.isArray(timing.captions)||!timing.captions.length)
    throw new Error('画面时间表需要正数total_s和非空captions');
  let previous=0;const ids=new Set();
  for (const caption of timing.captions) {
    if (!caption.id||ids.has(caption.id)||!Number.isFinite(caption.start)||!Number.isFinite(caption.end)
      ||caption.start<previous||caption.end<=caption.start||caption.end>timing.total_s||!plain(caption.text))
      throw new Error('字幕时段无效、重叠或ID重复');
    previous=caption.end;ids.add(caption.id);
    if (caption.emphasis!==undefined&&(!Array.isArray(caption.emphasis)
      ||caption.emphasis.some(word=>!word||plain(caption.text).split(word).length!==2)))
      throw new Error('字幕重点必须在对应字幕中恰好出现一次');
  }
  if (!plain(timing.source_text)||plain(timing.source_text)!==timing.captions.map(c=>plain(c.text)).join(''))
    throw new Error('字幕与source_text原文不一致，存在缺字或改稿');
  return timing;
}

export function vibeSubtitleDeclaration(file) {
  const timing=readVibeTiming(file);
  const entries=timing.captions.map(c=>{
    let text=String(c.text).replace(/\p{P}/gu,'').trim();
    for (const word of c.emphasis??[]) text=text.replace(word,`**${word}**`);
    return {s:c.start,e:c.end,t:text};
  });
  return 'const SUBS='+JSON.stringify(entries).replaceAll('<','\\u003c')+';';
}

export function writeVibeTimeline(indexFile,{rootDir=process.cwd()}={}) {
  const index=read(indexFile);
  if (index.route!=='vibe') throw new Error('视觉时间表入口只用于vibe路线');
  if (!Array.isArray(index.acts)||index.acts.length<1||index.acts.length>6) throw new Error('Vibe需要1～6个连续制作分段');
  let time=0;const captions=[];
  const acts=index.acts.map((act,i)=>{
    if (act.act!==i+1||!act.visual_timing) throw new Error('各幕必须连续编号并填写visual_timing');
    const timing=readVibeTiming(path.resolve(rootDir,act.visual_timing)),start=time;
    time+=timing.total_s;
    captions.push(...timing.captions.map(c=>({...c,act:act.act,start:start+c.start,end:start+c.end})));
    return {act:act.act,start_s:start,end_s:time,duration_s:timing.total_s};
  });
  const relative=path.posix.join('course/episodes',`${index.episode.replace(/^ep/,'')}-${index.slug}`,'整期时间表.json');
  const out=path.resolve(rootDir,relative);
  fs.writeFileSync(out,JSON.stringify({route:'vibe',total_s:time,acts,captions},null,2)+'\n',{encoding:'utf8'});
  index.timeline_summary=relative;
  index.publish_spec.duration_s=time;
  fs.writeFileSync(indexFile,JSON.stringify(index,null,2)+'\n',{encoding:'utf8'});
  return out;
}

if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(writeVibeTimeline(path.resolve(process.argv[2]??'')));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
