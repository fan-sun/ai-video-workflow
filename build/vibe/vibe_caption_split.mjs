// 用途：从Vibe正式稿生成逐屏初切草稿，报告需人工处理的长句，不生成时间或配音。
// 运行：npm run split:vibe -- <制作索引.json> [--out <另存草稿.json>]。
// 依赖：Node.js；索引的script和split_preview须存在且覆盖相同正文，不要求已有用户确认。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {splitSecondaryPieces} from '../teaching/course_act_split_preview.mjs';
import {readVibeSources} from './vibe_timeline.mjs';

const TARGET=14,SINGLE_LINE_MAX=18,SCREEN_MAX=24;
const PRIMARY='。！？!?',SECONDARY='；;，、：,:';
const plain=text=>String(text).replace(/[\p{P}\s]/gu,'');
const count=text=>Array.from(plain(text)).length;

function pieces(text,separators) {
  const result=[];
  for (const part of splitSecondaryPieces(text,{separators,preserveDoubleQuotes:true})) {
    // 数字中的千位逗号、时间冒号不是断句点；纯标点随前文保留。
    if (result.length&&(!plain(part)||(/\d[,:：]$/u.test(result.at(-1))&&/^\d/u.test(part)))) result[result.length-1]+=part;
    else result.push(part);
  }
  return result;
}

export function splitVibeText(text) {
  if (typeof text!=='string'||!plain(text)) throw new Error('初切需要非空正文');
  const chunks=[],questionSplits=new Set();
  for (const sentence of pieces(text,PRIMARY)) {
    const question=/[?？][”’」』）】》]*$/u.test(sentence);
    if (count(sentence)<=TARGET||(question&&count(sentence)<=SCREEN_MAX)) {chunks.push(sentence);continue;}
    const begin=chunks.length;let buffer='';
    for (const part of pieces(sentence,SECONDARY)) {
      const size=count(buffer+part);
      // 只在当前句内合并短分句，不用教学的36字规则把已切好的字幕合回长屏。
      if (buffer&&size>TARGET&&!(count(buffer)<=4&&size<=SINGLE_LINE_MAX)) {chunks.push(buffer);buffer='';}
      buffer+=part;
    }
    if (buffer) chunks.push(buffer);
    if (question&&chunks.length-begin>1) for(let i=begin;i<chunks.length;i++) questionSplits.add(i);
  }
  if (chunks.join('').replace(/\s/gu,'')!==text.replace(/\s/gu,'')) throw new Error('初切未完整保留原文，停止生成');
  const review_notes=[];
  const captions=chunks.map((text,i)=>{
    const id=`c${String(i+1).padStart(2,'0')}`,characters=count(text);
    const note=(code,message)=>review_notes.push({id,characters,code,message});
    if (characters>SCREEN_MAX) note('over_limit','超过24字且未找到安全断点，人工按语义分屏；专名不得直接截断或改词');
    else if (characters>SINGLE_LINE_MAX) note('two_lines','超过单行18字，人工检查必要双行及每行长度，或继续分屏');
    else if (characters>TARGET) note('long_line','超过常用14字，复核语义与实际阅读空间，保留时记录理由');
    if (questionSplits.has(i)) note('question_split','长问句已跨屏，复核前提、核心问句与指代是否连贯');
    return {id,start:null,end:null,text};
  });
  return {captions,review_notes};
}

export function writeVibeSplitDraft(indexFile,{rootDir=process.cwd(),outFile}={}) {
  const index=JSON.parse(fs.readFileSync(indexFile,{encoding:'utf8'}));
  const source=readVibeSources(index,rootDir);
  const draft={route:'vibe',stage:'automatic_draft',generated_by:'build/vibe/vibe_caption_split.mjs',
    source:{script:index.script,semantic_preview:index.split_preview,sha256:source.sha256},
    note:'全部条目均需人工复核语义、专名、画面动作及阅读窗口；null时间不是成片时间，不自动确认内容。',
    acts:index.acts.map((act,i)=>({act:act.act,total_s:null,source_text:source.script[i],...splitVibeText(source.script[i])}))};
  const out=outFile?path.resolve(rootDir,outFile):path.join(path.dirname(path.resolve(indexFile)),'字幕初切草稿.json');
  const serialized=JSON.stringify(draft,null,2)+'\n';
  if (fs.existsSync(out)) {
    if (fs.readFileSync(out,{encoding:'utf8'})!==serialized) throw new Error('草稿已存在且内容不同，保留原文件；使用--out另存新草稿');
  } else {
    fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,serialized,{encoding:'utf8'});
  }
  return {out,notes:draft.acts.reduce((sum,act)=>sum+act.review_notes.length,0)};
}

if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [indexFile,...args]=process.argv.slice(2);
    if (!indexFile||(args.length&&(args.length!==2||args[0]!=='--out'||!args[1])))
      throw new Error('用法：npm run split:vibe -- <制作索引.json> [--out <另存草稿.json>]');
    const result=writeVibeSplitDraft(path.resolve(indexFile),{outFile:args[1]});
    console.log(`${result.out}\n已执行程序初切，待处理提示${result.notes}项；全部字幕仍须人工复核并填写实际时间。`);
    process.exitCode=result.notes?3:0;
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
