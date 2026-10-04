// 用途：验证主体停滞检查，尤其是字幕变化掩盖静态主画面的回归。
// 运行：node --test build/check_course_motion.test.mjs
// 依赖：Node.js、FFmpeg、FFprobe。
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeCourseMotion } from './check_course_motion.mjs';

function sample(filter, action) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-motion-'));
  try {
    const video = path.join(dir, 'sample.mkv');
    const result = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i',
      'color=c=black:s=320x240:r=10:d=9', '-vf', filter,
      '-c:v', 'ffv1', video], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    action(video);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('字幕区每秒变化，主体静止到文件末尾仍必须失败', () => {
  sample("drawbox=x=20:y=190:w=280:h=30:color=white:t=fill:enable='lt(mod(t,2),1)'", video => {
    const report = analyzeCourseMotion(video, { crop: '320:160:0:0', maxStillS: 6 });
    assert.equal(report.status, 'failed');
    assert.ok(report.freezes.some(x => x.duration_s >= 8.5));
  });
});

test('主体逐步发生状态变化时通过', () => {
  sample("drawbox=x=40:y=30:w=200:h=100:color=white:t=fill:enable='lt(mod(t,2),1)'", video => {
    assert.equal(analyzeCourseMotion(video, { crop: '320:160:0:0', maxStillS: 6 }).status, 'passed');
  });
});

test('工具或媒体失败不能被当作没有静止区间', () => {
  assert.throws(() => analyzeCourseMotion('missing-course-video.mp4', { crop: '320:160:0:0' }));
});
