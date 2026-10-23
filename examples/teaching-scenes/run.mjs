// 用途：把本期讲解、实测timings和动作绑定准备为独立教学场景，并导出有讲解的小样。
// 运行：node examples/teaching-scenes/run.mjs <prepare|render> <设置JSON>。
// 依赖：现有HyperFrames、FFmpeg；输入声音由调用方提供，不在此处重新配音。
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {runHyperframesHidden} from '../../build/common/hyperframes_hidden.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),SOURCE=path.join(ROOT,'templates/teaching-scenes/task-handoff');
export const BEAT_KEYS=['divide','price','feedback','channels','ownership','gather','transfer','report','question'];
export const DEFAULT_CONTENT={title:'三个助手，各查一个方向',handoffTitle:'分完工，还要接回来',roles:['竞品调查','反馈调查','渠道调查'],findings:['保留价格资料','归纳用户问题','核对覆盖范围'],collected:['价格','反馈','渠道'],reportTitle:'三份材料',reportNote:'口径尚未对齐',question:'怎样合成能用的建议？'};
export function buildTeachingData(timings,binding,content=DEFAULT_CONTENT){
 const units=timings.phrases.flatMap(p=>p.subtitle_units?.length?p.subtitle_units:[p]).map(u=>({id:u.id,text:u.text,start:u.start,end:u.end}));
 const ids=new Set();let previousEnd=0;
 for(const u of units){if(ids.has(u.id)||typeof u.text!=='string'||!u.text.trim())throw new Error('旁白ID重复或内容缺失');ids.add(u.id);if(!Number.isFinite(u.start)||!Number.isFinite(u.end)||u.end<=u.start||u.start<previousEnd-.001)throw new Error('旁白时间非法或重叠');previousEnd=u.end;}
 if(!Number.isFinite(timings.total)||timings.total<previousEnd-.002)throw new Error('总时长小于旁白结束时间');
 const beats={};let previousStart=-1;const used=new Set();
 for(const key of BEAT_KEYS){const unit=units.find(u=>u.id===binding[key]);if(!unit)throw new Error('动作缺少对应旁白：'+key);if(unit.start<=previousStart)throw new Error('动作与旁白顺序不一致：'+key);beats[key]=unit;previousStart=unit.start;used.add(unit.id);}
 if(used.size!==units.length)throw new Error('存在未覆盖旁白');
 const c={...DEFAULT_CONTENT,...content};for(const key of Object.keys(c))if(!(key in DEFAULT_CONTENT))throw new Error('未知内容字段：'+key);
 const check=(value,max)=>{if(typeof value!=='string'||!value.trim()||[...value].length>max||/[<>\r\n]/.test(value))throw new Error('文字为空、过长或含不支持字符');};
 for(const key of ['roles','findings','collected']){if(!Array.isArray(c[key])||c[key].length!==3)throw new Error('必须有三个任务及对象名称');c[key].forEach(x=>check(x,8));}
 for(const key of ['title','handoffTitle','question'])check(c[key],18);for(const key of ['reportTitle','reportNote'])check(c[key],12);
 return {duration:Math.ceil(timings.total*30-1e-7)/30,audioDuration:timings.total,units,beats,content:c};
}
export function prepareTeachingScene(settings){
 if(settings.id!=='task-handoff'||!['original','demo'].includes(settings.preset))throw new Error('未知教学场景或示例版本');
 const timings=JSON.parse(fs.readFileSync(path.resolve(ROOT,settings.timings),'utf8'));
 const data=buildTeachingData(timings,settings.binding,settings.content);
 const out=path.resolve(ROOT,settings.outRoot||'.local/teaching-scenes',settings.id,settings.preset);
 if(out===SOURCE||out.startsWith(path.join(ROOT,'templates')+path.sep))throw new Error('工作副本不能覆盖素材库');
 const audio=path.resolve(ROOT,settings.audio);if(!fs.existsSync(audio))throw new Error('缺少真实讲解音频：'+audio);
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',audio],{encoding:'utf8',windowsHide:true});
 if(probe.error||probe.status!==0)throw new Error('无法读取讲解音频时长：'+(probe.error?.message||probe.stderr));
 if(!Number.isFinite(Number(probe.stdout))||Math.abs(Number(probe.stdout)-data.audioDuration)>.01)throw new Error('音频时长与timings不一致');
 fs.mkdirSync(out,{recursive:true});fs.cpSync(SOURCE,out,{recursive:true});fs.copyFileSync(audio,path.join(out,'voice.wav'));
 fs.writeFileSync(path.join(out,'index.html'),fs.readFileSync(path.join(SOURCE,'index.html'),'utf8').replace('__DURATION__',String(data.duration)),'utf8');
 fs.writeFileSync(path.join(out,'data.js'),'globalThis.TeachingData='+JSON.stringify(data).replaceAll('<','\\u003c')+';\n','utf8');
 fs.writeFileSync(path.join(out,'settings.json'),JSON.stringify(settings,null,2)+'\n','utf8');
 fs.writeFileSync(path.join(out,'旁白分镜对照.json'),JSON.stringify({duration:data.duration,beats:BEAT_KEYS.map(key=>({key,...data.beats[key]}))},null,2)+'\n','utf8');
 return {out,data};
}
function run(command,args){const r=spawnSync(command,args,{cwd:ROOT,stdio:'inherit',windowsHide:true});if(r.error)throw r.error;if(r.status!==0)throw new Error(command+'失败，退出码'+r.status);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,file]=process.argv.slice(2);if(!['prepare','render'].includes(command)||!file)throw new Error('用法：prepare或render 设置JSON');
 const settings=JSON.parse(fs.readFileSync(path.resolve(ROOT,file),'utf8'));const {out,data}=prepareTeachingScene(settings);console.log('工作副本：'+out);
 if(command==='render'){
  runHyperframesHidden(['lint',out]);runHyperframesHidden(['render',out,'--output',path.join(out,'silent.mp4'),'--quality','high','--fps','30','--workers','2','--gpu']);
  run('ffmpeg',['-v','error','-y','-i',path.join(out,'silent.mp4'),'-i',path.join(out,'voice.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-af','apad','-t',String(data.duration),'-movflags','+faststart',path.join(out,'preview.mp4')]);
 }
}
