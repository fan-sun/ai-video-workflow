// 用途：在独立目录验证无旁白Vibe的时间表、渲染、混音与发布包。
// 运行：npm run example:vibe -- <prepare|video|mix|package>。
// 依赖：Node、Python、Chrome、FFmpeg和NVENC；不需要VoxCPM，不记录用户认可。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {initCourseEpisode} from '../../build/common/init_course_episode.mjs';
import {writeVibeTimeline} from '../../build/vibe/vibe_timeline.mjs';
import {makeVisual,coverHtml} from './visuals.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const WORK=path.resolve(process.env.VIBE_EXAMPLE_DIR||path.join(ROOT,'.local/vibe-example'));
const INDEX='course/episodes/01-sunk-cost/制作索引.json';
function write(relative,value){const p=path.join(WORK,relative);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{encoding:'utf8'})}
const read=()=>JSON.parse(fs.readFileSync(path.join(WORK,INDEX),{encoding:'utf8'}));
export function exampleEnvironment(input=process.env,root=ROOT){
  const env={...input,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'};
  for(const key of ['COURSE_PYTHON','CHROME_PATH','COURSE_COVER_CHROME','COURSE_GIT_BASH','PUPPETEER_ROOT'])
    if(env[key]&&/[\\/]/u.test(env[key]))env[key]=path.resolve(root,env[key]);
  return env;
}
function run(command,args){const r=spawnSync(command,args,{cwd:WORK,stdio:'inherit',windowsHide:true,env:exampleEnvironment()});if(r.status!==0)throw new Error(r.error?.message||`${command}失败：${r.status}`)}
async function prepare(){
  fs.mkdirSync(WORK,{recursive:true});
  fs.mkdirSync(path.join(WORK,'build'),{recursive:true});
  fs.cpSync(path.join(ROOT,'build'),path.join(WORK,'build'),{recursive:true,filter:source=>fs.statSync(source).isDirectory()?path.basename(source)!=='__pycache__':/\.(mjs|py)$/u.test(source)});
  fs.cpSync(path.join(ROOT,'templates/course-explainer-3x4'),path.join(WORK,'templates/course-explainer-3x4'),{recursive:true});
  initCourseEpisode(WORK,'01-sunk-cost',{topic:'沉没成本',route:'vibe'});
  const index=read();
  if(index.example&&index.review_output){
    console.log('已同步通用工具，保留已有示例素材；继续video/mix/package。验证修改后的示例画面时，请使用新的VIBE_EXAMPLE_DIR。');return;
  }
  index.example={technical_only:true};index.chapter_titles=['收不回的钱','还能选的时间'];index.acts=index.acts.slice(0,2);
  index.script='course/scripts/01-sunk-cost.md';index.selected_style='示例：深青与暖白';
  write(index.script,'# 沉没成本：技术短示例\n\n花掉的钱收不回来。\n剩下的时间还可以选择。\n');
  for(const act of index.acts){
    const folder=`course/episodes/01-sunk-cost/act${act.act}`;
    act.visual_timing=folder+'/画面时间表.json';act.sfx=folder+'/actions.wav';
    act.visual_source=`course/acts/ep01_sunk-cost/act${act.act}.html`;
    const text=act.act===1?'花掉的钱收不回来。':'剩下的时间还可以选择。';
    write(act.visual_timing,{total_s:4,source_text:text,captions:[{id:`a${act.act}`,start:0,end:4,text,emphasis:act.act===1?['钱']:['时间']}]});
    write(act.visual_source,makeVisual(act.act));
    run('ffmpeg',['-v','error','-y','-f','lavfi','-i',`sine=frequency=${act.act===1?720:540}:sample_rate=48000:duration=4`,'-af','volume=0.06','-ac','2',path.join(WORK,act.sfx)]);
  }
  const coverDir='course/episodes/01-sunk-cost/cover';
  write(coverDir+'/index.html',coverHtml);
  fs.cpSync(path.join(ROOT,'templates/course-explainer-3x4/fonts'),path.join(WORK,coverDir,'fonts'),{recursive:true});
  const cover=path.join(WORK,coverDir,'cover.png');
  run(process.execPath,['build/common/check_course_cover.mjs',coverDir+'/index.html','--out',coverDir+'/qc']);
  fs.copyFileSync(path.join(WORK,coverDir,'qc/index.png'),cover);
  index.cover_output=coverDir+'/cover.png';index.cover_upload_output=index.cover_output;
  index.cover_selection={method:'code',technical_example:true};
  index.bgm={file:'course/episodes/01-sunk-cost/music.wav',gain:.25,source_gain:1,approval:null};
  run('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=9','-af','volume=0.1','-ac','2',path.join(WORK,index.bgm.file)]);
  write(INDEX,index);writeVibeTimeline(path.join(WORK,INDEX),{rootDir:WORK});
  console.log('8秒技术示例就绪；声音是本地合成测试音，不是正式配乐，未伪造用户确认。');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{
  const stage=process.argv[2];
  if(stage==='prepare')await prepare();
  else if(stage==='video')run(process.execPath,['build/common/course_video.mjs','review',INDEX]);
  else if(stage==='mix')run(process.execPath,['build/vibe/mix_video_audio.mjs',INDEX]);
  else if(stage==='package'){
    const index=read();
    if(!index.audio_mix)throw new Error('先完成mix阶段');
    index.publish_copy='pipeline/output/course/ep01_sunk-cost/v1/course_ep01_sunk-cost_v1.txt';
    write(index.publish_copy,'【标题】\nVibe知识大赏｜沉没成本：钱回不来，时间还能选\n\n【发布文案】\n钱已经花掉，下一段时间还可以选择。\n\n【标签】\n#Vibe知识大赏 #沉没成本\n\n【视频总结】\n沉没成本是已经付出且无法收回的钱、时间和精力。判断要不要继续时，需要考虑接下来还要付出什么，以及还能获得什么。过去的投入可以解释舍不得，却不能独自决定未来的选择。\n\n【视频章节】\n00:00–00:04　第一幕 · 收不回的钱\n00:04–00:08　第二幕 · 还能选的时间\n');
    write(INDEX,index);run(process.execPath,['build/common/course_video.mjs','publish',INDEX]);
  }else throw new Error('阶段必须为prepare、video、mix或package');
}catch(error){console.error(error.message);process.exitCode=1;}
