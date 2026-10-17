// 用途：校验无旁白字幕和动作时间，生成Vibe整期时间表。
// 运行：node build/vibe/vibe_timeline.mjs <制作索引.json> [--bind-approved-source]。
// 依赖：Node.js；各幕visual_timing为真实画面时间，不生成TTS文件。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {extractActNarration} from '../teaching/course_act_split_preview.mjs';
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
    if (Array.from(plain(caption.text)).length>24)
      throw new Error(`字幕${caption.id}同屏超过24字，请按语义分屏，不能仅延长停留`);
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

export function readVibeSources(index,rootDir) {
  if (index.route!=='vibe'||!Array.isArray(index.acts)||index.acts.length<1||index.acts.length>6
    ||index.acts.some((act,i)=>act.act!==i+1)) throw new Error('Vibe正文需要1～6个连续编号的制作分段');
  if (!index.script||!index.split_preview) throw new Error('Vibe需要script正式稿及split_preview切分预览路径');
  const markdown=fs.readFileSync(path.resolve(rootDir,index.script),{encoding:'utf8'});
  const preview=read(path.resolve(rootDir,index.split_preview));
  const names=['一','二','三','四','五','六'];
  const headings=[...markdown.matchAll(/^##[ \t]*第([^\s幕]+)幕/gmu)].map(match=>match[1]);
  if (headings.length!==index.acts.length||headings.some((name,i)=>name!==names[i])
    ||Object.keys(preview).some(key=>/^act\d+$/u.test(key)&&!index.acts.some(act=>key===`act${act.act}`)))
    throw new Error('正式稿或切分预览的幕数、顺序与制作索引不一致，须连续编号');
  const script=index.acts.map(act=>extractActNarration(markdown,act.act).join(''));
  const split=index.acts.map((act,i)=>{
    const parts=preview[`act${act.act}`];
    if (!plain(script[i])||!Array.isArray(parts)||!parts.length
      ||parts.some(text=>typeof text!=='string'||!plain(text))||plain(script[i])!==plain(parts.join('')))
      throw new Error(`第${act.act}幕正式稿与切分预览不一致；正文须使用“## 第几幕”和“旁白：”格式`);
    return parts;
  });
  return {script,sha256:createHash('sha256').update(JSON.stringify({script,split}),'utf8').digest('hex')};
}

// 只绑定已经获得确认的正文与切分，不创建用户确认，不要求动画已经制作。
export function bindVibeContentApproval(indexFile,{rootDir=process.cwd()}={}) {
  const index=read(indexFile);
  if (index.example||!index.content_approval?.confirmed
    ||typeof index.content_approval.statement!=='string'||!index.content_approval.statement.trim())
    throw new Error('先记录真实的正文与切分确认；技术示例不能绑定用户认可');
  const {sha256}=readVibeSources(index,rootDir);
  if (index.content_approval.source_sha256&&index.content_approval.source_sha256!==sha256) {
    index.review_approval=null;index.publish_bundle=null;
  }
  index.content_approval.source_sha256=sha256;
  fs.writeFileSync(indexFile,JSON.stringify(index,null,2)+'\n',{encoding:'utf8'});
  return sha256;
}

export function assertVibeContent(index,{rootDir=process.cwd(),acts=index.acts,checkPreview=false}={}) {
  if (index.example?.technical_only===true) return;
  const source=readVibeSources(index,rootDir);
  if (!index.content_approval?.confirmed||!index.content_approval.statement||!index.content_approval.source_sha256)
    throw new Error('缺少已确认正文版本绑定，请在内容确认后执行--bind-approved-source');
  if (index.content_approval.source_sha256!==source.sha256)
    throw new Error('确认后的正文或切分版本发生变化，请先按原确认流程核对，不能自动重绑');
  const preview=checkPreview&&index.caption_preview?read(path.resolve(rootDir,index.caption_preview)):null;
  if (checkPreview&&index.caption_preview&&(!preview||typeof preview!=='object'||Array.isArray(preview)
    ||JSON.stringify(Object.keys(preview).sort())!==JSON.stringify(index.acts.map(act=>`act${act.act}`).sort())))
    throw new Error('逐屏字幕预览格式或幕编号不一致，请重跑timeline:vibe');
  for (const act of acts) {
    if (!act.visual_timing) throw new Error(`第${act.act}幕缺少visual_timing`);
    const timing=readVibeTiming(path.resolve(rootDir,act.visual_timing));
    if (plain(timing.source_text)!==plain(source.script[act.act-1]))
      throw new Error(`第${act.act}幕画面时间表与已确认正文不一致，存在漏句或改写`);
    if (preview&&JSON.stringify(preview[`act${act.act}`])!==JSON.stringify(timing.captions.map(c=>c.text)))
      throw new Error(`第${act.act}幕逐屏字幕预览已过期，请重跑timeline:vibe，不能仅比较全文`);
  }
}

export function writeVibeTimeline(indexFile,{rootDir=process.cwd()}={}) {
  const index=read(indexFile);
  if (index.route!=='vibe') throw new Error('视觉时间表入口只用于vibe路线');
  if (!Array.isArray(index.acts)||index.acts.length<1||index.acts.length>6) throw new Error('Vibe需要1～6个连续制作分段');
  assertVibeContent(index,{rootDir});
  let time=0;const captions=[],preview={};
  const acts=index.acts.map((act,i)=>{
    if (act.act!==i+1||!act.visual_timing) throw new Error('各幕必须连续编号并填写visual_timing');
    const timing=readVibeTiming(path.resolve(rootDir,act.visual_timing)),start=time;
    time+=timing.total_s;
    captions.push(...timing.captions.map(c=>({...c,act:act.act,start:start+c.start,end:start+c.end})));
    preview[`act${act.act}`]=timing.captions.map(c=>c.text);
    return {act:act.act,start_s:start,end_s:time,duration_s:timing.total_s};
  });
  const relative=path.posix.join('course/episodes',`${index.episode.replace(/^ep/,'')}-${index.slug}`,'整期时间表.json');
  const out=path.resolve(rootDir,relative);
  const previewRelative=path.posix.join(path.posix.dirname(relative),'逐屏字幕预览.json');
  const key=file=>{const resolved=path.resolve(rootDir,file);return process.platform==='win32'?resolved.toLowerCase():resolved;};
  if ([indexFile,index.script,index.split_preview,...index.acts.map(act=>act.visual_timing)]
    .filter(Boolean).some(file=>key(file)===key(previewRelative)))
    throw new Error('逐屏预览输出路径与输入来源冲突，请将语义预览保存在独立文件后重新核对绑定');
  fs.writeFileSync(out,JSON.stringify({route:'vibe',total_s:time,acts,captions},null,2)+'\n',{encoding:'utf8'});
  fs.writeFileSync(path.resolve(rootDir,previewRelative),JSON.stringify(preview,null,2)+'\n',{encoding:'utf8'});
  index.timeline_summary=relative;
  index.caption_preview=previewRelative;
  index.publish_spec.duration_s=time;
  fs.writeFileSync(indexFile,JSON.stringify(index,null,2)+'\n',{encoding:'utf8'});
  return out;
}

if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(3).some(arg=>arg!=='--bind-approved-source')) throw new Error('未知参数');
    const command=process.argv.includes('--bind-approved-source')?bindVibeContentApproval:writeVibeTimeline;
    console.log(command(path.resolve(process.argv[2]??'')));
  }
  catch(error){console.error(error.message);process.exitCode=1;}
}
