// 用途：按确认的线性增益混合动作声与音乐，复制高清画面并核验输出。
// 运行：node build/mix_video_audio.mjs <制作索引.json>。
// 依赖：FFmpeg、FFprobe；bgm记录音乐文件、增益及用户确认，底片必须已生成。
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(command,args) {
  const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
  if (result.status!==0) throw new Error(result.error?.message||result.stderr||`${command}失败`);
  return result;
}
const probe=file=>JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]).stdout);
export function readPeakDb(levels) {
  const peaks=[...levels.matchAll(/Peak level dB:\s*(\S+)/gu)].map(m=>m[1]==='-inf'?-Infinity:Number(m[1]));
  if (!peaks.length||peaks.some(x=>Number.isNaN(x))) throw new Error('音轨峰值无法核验');
  const peak=Math.max(...peaks);
  if (peak>=0) throw new Error('音轨削波，请降低确认后的混音比例');
  return peak;
}
export function createAudioMixArgs({video,music,output,duration,sourceGain=1,musicGain,sourceChannels=2}) {
  if (![sourceGain,musicGain].every(x=>Number.isFinite(x)&&x>=0&&x<=1)) throw new Error('混音增益必须是0～1的有限数字');
  if (!Number.isFinite(duration)||duration<=0||![1,2].includes(sourceChannels)) throw new Error('混音时长或声道无效');
  const filter=`[0:a]${sourceChannels===1?'pan=stereo|c0=c0|c1=c0,':''}volume=${sourceGain}[sfx];`
    +`[1:a]aresample=48000,volume=${musicGain}[bgm];`
    +`[sfx][bgm]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,atrim=duration=${duration}[a]`;
  return ['-hide_banner','-y','-i',video,'-i',music,'-filter_complex',filter,'-map','0:v:0','-map','[a]',
    '-c:v','copy','-c:a','aac','-b:a','320k','-ar','48000','-ac','2','-t',String(duration),'-movflags','+faststart',output];
}
export function mixVideoAudio(indexFile,{rootDir=process.cwd()}={}) {
  const index=JSON.parse(fs.readFileSync(indexFile,{encoding:'utf8'}));
  if (index.route!=='vibe') throw new Error('当前混音入口用于Vibe路线');
  const bgm=index.bgm;
  if (!bgm?.file||(!index.example&&!bgm.approval?.confirmed)) throw new Error('需要bgm.file及用户确认的音乐比例');
  const sourceGain=bgm.source_gain??1,musicGain=bgm.gain;
  if (!index.review_base_output&&!index.review_output) throw new Error('先生成无BGM审片底片，再混音');
  const base=index.review_base_output??index.review_output;
  const video=path.resolve(rootDir,base),music=path.resolve(rootDir,bgm.file);
  const metadata=probe(video),duration=Number(metadata.format.duration);
  if (Number(probe(music).format.duration)<duration) throw new Error('音乐短于视频，请先准备足够长的音乐或明确循环版本');
  const sourceChannels=metadata.streams.find(s=>s.codec_type==='audio')?.channels;
  const percent=gain=>Number((gain*100).toFixed(6));
  const relative=base.replace(/\.mp4$/u,`_sfx${percent(sourceGain)}_bgm${percent(musicGain)}.mp4`);
  if (relative===base) throw new Error('底片必须是MP4，混音不能覆盖底片');
  const output=path.resolve(rootDir,relative);
  const sourceSha=sha(video),musicSha=sha(music);
  const previous=path.resolve(rootDir,index.review_output??base);
  const previousSha=fs.existsSync(previous)?sha(previous):null;
  const temporaryDir=fs.mkdtempSync(path.join(path.dirname(output),'.mix-'));
  const temporary=path.join(temporaryDir,'candidate.mp4');
  try {
    run('ffmpeg',createAudioMixArgs({video,music,output:temporary,duration,sourceGain,musicGain,sourceChannels}));
    run('ffmpeg',['-v','error','-xerror','-i',temporary,'-f','null','-']);
    const videoHash=file=>run('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-c:v','copy','-f','hash','-hash','sha256','-']).stdout.trim();
    if (videoHash(video)!==videoHash(temporary)) throw new Error('混音后视频编码数据发生变化');
    const levels=run('ffmpeg',['-hide_banner','-i',temporary,'-af','astats=metadata=0:reset=0','-f','null','-']).stderr;
    const peak=readPeakDb(levels);
    const final=probe(temporary),audio=final.streams.find(s=>s.codec_type==='audio');
    if (Math.abs(Number(audio.start_time))>.001||Math.abs(Number(audio.duration)-duration)>.04||audio.channels!==2)
      throw new Error('混音起止、时长或声道不符');
    if (sha(video)!==sourceSha||sha(music)!==musicSha) throw new Error('原媒体发生变化');
    const outputSha=sha(temporary);
    if (index.review_output!==relative||previousSha!==outputSha) {
      index.review_approval=null;index.publish_bundle=null;
    }
    fs.renameSync(temporary,output);
    index.review_base_output=base;index.review_output=relative;
    index.audio_mix={output:relative,sha256:outputSha,base_sha256:sourceSha,music_sha256:musicSha,source_gain:sourceGain,
      music_gain:musicGain,music_start_s:0,duration_s:duration,normalize:false,video_identical:true,full_decode:true,peak_db:peak===-Infinity?'-inf':peak};
    fs.writeFileSync(indexFile,JSON.stringify(index,null,2)+'\n',{encoding:'utf8'});
    fs.writeFileSync(output+'.mix.json',JSON.stringify(index.audio_mix,null,2)+'\n',{encoding:'utf8'});
    return output;
  } finally {
    fs.rmSync(temporary,{force:true});fs.rmdirSync(temporaryDir);
  }
}
if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(mixVideoAudio(path.resolve(process.argv[2]??'')));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
