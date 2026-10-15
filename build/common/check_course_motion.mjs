// 用途：排除字幕和品牌区，检测正式视频主体的连续静止区间。
// 运行：node build/common/check_course_motion.mjs 视频路径 宽:高:x:y 报告路径 [最大静止秒数]
// 依赖：Node.js、FFmpeg、FFprobe；像素变化不等于语义正确，仍须对照旁白复核。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${command} 失败：${result.error?.message ?? result.stderr}`);
  return result;
}

export function analyzeCourseMotion(video, { crop, maxStillS = 6 } = {}) {
  if (!/^\d+:\d+:\d+:\d+$/u.test(crop ?? '')) throw new Error('crop 必须为宽:高:x:y，且排除字幕和品牌区');
  if (!Number.isFinite(maxStillS) || maxStillS <= 0) throw new Error('最大静止秒数必须为正数');
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=codec_type,width,height', '-of', 'json', video]).stdout);
  const stream = probe.streams.find(s => s.codec_type === 'video');
  const total = Number(probe.format.duration);
  const [w, h, x, y] = crop.split(':').map(Number);
  if (!stream || !Number.isFinite(total) || total <= 0 || w <= 0 || h <= 0
    || x + w > stream.width || y + h > stream.height) throw new Error('视频时长或主体裁切区域无效');
  // 按完整时间轴检测，缩小后容忍轻微编码噪声；不能拿循环装饰冒充知识推进。
  const result = run('ffmpeg', ['-hide_banner', '-nostats', '-i', video, '-an',
    '-vf', `crop=${crop},scale=320:-2,format=gray,freezedetect=n=0.001:d=${maxStillS}`,
    '-f', 'null', '-']);
  const freezes = [];
  let start = null;
  for (const match of result.stderr.matchAll(/lavfi\.freezedetect\.freeze_(start|end):\s*([\d.]+)/gu)) {
    if (match[1] === 'start') start = Number(match[2]);
    else if (start !== null) {
      freezes.push({ start_s: start, end_s: Number(match[2]), duration_s: Number((Number(match[2]) - start).toFixed(3)) });
      start = null;
    }
  }
  if (start !== null) freezes.push({ start_s: start, end_s: total, duration_s: Number((total - start).toFixed(3)) });
  return { status: freezes.length ? 'failed' : 'passed', video: path.resolve(video),
    crop, max_still_s: maxStillS, noise: 0.001, duration_s: total, freezes,
    limitation: '仅检测主体像素停滞；仍须按视觉节拍表复核语义，不能证明画面解释正确。' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [video, crop, output, limit] = process.argv.slice(2);
    if (!video || !crop || !output) throw new Error('用法：node build/common/check_course_motion.mjs 视频 宽:高:x:y 报告 [最大静止秒数]');
    const report = analyzeCourseMotion(video, { crop, maxStillS: limit === undefined ? 6 : Number(limit) });
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8' });
    console.log(`主体停滞检查 ${report.status}：${report.freezes.length} 个超过 ${report.max_still_s} 秒的区间；${output}`);
    for (const item of report.freezes) console.log(`  ${item.start_s}–${item.end_s}s (${item.duration_s}s)`);
    process.exitCode = report.status === 'passed' ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
