// 用途：生成可直接打开的分轨配乐试听页，不写入用户选定比例。
// 运行：node build/preview_video_audio.mjs <制作索引.json>。
// 依赖：已生成的无BGM底片与bgm.file；浏览器支持本地视频和音频。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function createMusicPreview(indexFile,{rootDir=process.cwd()}={}) {
  const index=JSON.parse(fs.readFileSync(indexFile,{encoding:'utf8'}));
  if(index.route!=='vibe'||!index.bgm?.file)throw new Error('Vibe试听需要bgm.file');
  const base=index.review_base_output??index.review_output;
  if(!base)throw new Error('先生成无BGM底片');
  const output=path.join(path.dirname(indexFile),'配乐试听.html');
  const href=relative=>{
    const file=path.resolve(rootDir,relative);
    if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error('试听素材不存在：'+relative);
    return path.relative(path.dirname(output),file).replaceAll('\\','/').split('/').map(encodeURIComponent).join('/');
  };
  const video=href(base),music=href(index.bgm.file);
  const percent=Number.isFinite(index.bgm.gain)?Math.round(index.bgm.gain*100):8;
  const key=JSON.stringify(`vibe-music-${index.episode}-${index.slug}`).replaceAll('<','\\u003c');
  const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>视频配乐试听</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f2f4f7;color:#172238;font:17px/1.6 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:35px 25px}
  h1{font-size:30px;margin:0 0 20px}.layout{display:grid;grid-template-columns:1.5fr 1fr;gap:25px}video{width:100%;aspect-ratio:16/9;background:#101824;border-radius:10px}
  section{background:white;border:1px solid #dde3eb;border-radius:10px;padding:24px}label{display:block;font-weight:600}output{font-size:40px;color:#2563eb}input{width:100%;accent-color:#2563eb}
  button{font:inherit;padding:8px 14px;border:1px solid #dde3eb;border-radius:7px;background:white;cursor:pointer}p{color:#647086}#status{min-height:28px;font-size:14px}
  @media(max-width:760px){.layout{grid-template-columns:1fr}}
  </style><body><main><h1>把音乐调到刚刚好</h1><div class="layout"><video id="video" src="${video}" controls></video><section>
  <label for="gain">背景音乐音量</label><output id="percent">${percent}%</output><input id="gain" type="range" min="0" max="100" value="${percent}">
  <p>动作音效保持100%。播放、暂停或拖动视频时，音乐跟随视频。</p><button id="original">只听原声</button> <button id="copy">复制这个比例</button><p id="status"></p>
  </section></div><audio id="music" src="${music}"></audio><p>把选定比例交给助手后再合成。当前页面使用独立音轨，正式成片另存。</p></main><script>
  const v=document.getElementById('video'),a=document.getElementById('music'),g=document.getElementById('gain'),status=document.getElementById('status'),key=${key};
  let original=false;const saved=localStorage.getItem(key);if(saved!==null&&Number(saved)>=0&&Number(saved)<=100)g.value=saved;
  function volume(){a.volume=original?0:Number(g.value)/100;document.getElementById('percent').textContent=g.value+'%';localStorage.setItem(key,g.value)}
  function sync(){if(Number.isFinite(a.duration)&&Math.abs(a.currentTime-v.currentTime)>.12)a.currentTime=Math.min(v.currentTime,a.duration)}
  g.addEventListener('input',volume);volume();v.addEventListener('play',()=>{sync();a.play().catch(e=>{status.textContent='音乐播放失败：'+e.message})});
  for(const event of ['pause','ended'])v.addEventListener(event,()=>a.pause());for(const event of ['seeking','timeupdate'])v.addEventListener(event,sync);
  document.getElementById('original').onclick=()=>{original=!original;volume();document.getElementById('original').textContent=original?'恢复配乐':'只听原声';document.getElementById('copy').disabled=original};
  document.getElementById('copy').onclick=async()=>{const text='动作音效100%，背景音乐'+g.value+'%。音乐从视频开头同步播放，随视频结束。';try{await navigator.clipboard.writeText(text);status.textContent='比例已复制'}catch{status.textContent=text}};
  for(const media of [v,a])media.addEventListener('error',()=>{status.textContent='素材加载失败，请检查文件路径及浏览器媒体支持'});
  </script></body></html>`;
  fs.writeFileSync(output,html,{encoding:'utf8'});
  return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(createMusicPreview(path.resolve(process.argv[2]??'')))}catch(error){console.error(error.message);process.exitCode=1}
}
