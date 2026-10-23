// 用途：同时播放同一结构的原造型与跨主题版本。
// 运行：通过本地素材库服务器打开教学目录。
// 依赖：已导出的四个无声MP4。
document.querySelectorAll('article button').forEach(button=>button.onclick=async()=>{
 const error=document.querySelector('#error');error.textContent='';document.querySelectorAll('video').forEach(v=>v.pause());
 const videos=[...button.closest('article').querySelectorAll('video')];videos.forEach(v=>{v.currentTime=0;});
 try{await Promise.all(videos.map(v=>v.play()));}catch(e){videos.forEach(v=>v.pause());error.textContent='播放失败：'+e.message;}
});
document.querySelectorAll('video').forEach(v=>v.addEventListener('error',()=>document.querySelector('#error').textContent='预览文件无法加载，请按说明重新导出。'));
