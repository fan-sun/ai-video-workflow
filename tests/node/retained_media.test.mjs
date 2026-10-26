// 用途：验证发布母版与重复副本归档、读取和恢复边界。
// 运行：node --test tests/node/retained_media.test.mjs。
// 依赖：Node.js内置模块；仅操作本测试创建的临时目录。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { recordRetainedMedia, resolveRetainedMedia, restoreRetainedMedia } from '../../build/common/retained_media.mjs';
import { visualArtifact } from '../../build/common/check_course_visual_review.mjs';
import { createRouteCommand } from '../../build/common/route_command.mjs';

async function fixture(t, route = 'vibe') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'retained-media-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = 'pipeline/output/' + (route === 'vibe' ? 'vibe' : 'teaching') + '/ep01_demo/v1/';
  const content = Buffer.from('原始画面、声音与音乐均不变化');
  const entry = { path: base + 'review.mp4', master: base + 'course_ep01_demo_v1_publish.mp4', bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
  await fs.mkdir(path.join(root, base), { recursive: true });
  await fs.writeFile(path.join(root, entry.path), content);
  await fs.writeFile(path.join(root, entry.master), content);
  return { root, base, entry, content };
}

test('生产视觉证据从明确登记的母版读取，仍保留原路径与原摘要', async t => {
  const f = await fixture(t);
  recordRetainedMedia(f.root, f.entry);
  await fs.unlink(path.join(f.root, f.entry.path));
  assert.deepEqual(visualArtifact(f.root, f.entry.path), { path: f.entry.path, sha256: f.entry.sha256 });
  assert.throws(() => visualArtifact(f.root, f.base + 'unknown.mp4'), /不存在|为空/);
});

test('母版变化后拒绝读取和恢复，不以其他发布文件静默替代', async t => {
  const f = await fixture(t);
  recordRetainedMedia(f.root, f.entry);
  await fs.unlink(path.join(f.root, f.entry.path));
  await fs.writeFile(path.join(f.root, f.entry.master), '另一个版本', { encoding: 'utf8' });
  assert.throws(() => resolveRetainedMedia(f.root, f.entry.path), /母版缺失或已变化/);
  assert.throws(() => restoreRetainedMedia(f.root, f.entry.path), /母版缺失或已变化/);
  await assert.rejects(fs.stat(path.join(f.root, f.entry.path)), { code: 'ENOENT' });
});

test('恢复逐字节相同的独立文件，重复操作幂等，不覆盖已有其他内容', async t => {
  const f = await fixture(t);
  recordRetainedMedia(f.root, f.entry);
  await fs.unlink(path.join(f.root, f.entry.path));
  assert.equal(restoreRetainedMedia(f.root, f.entry.path).restored, true);
  assert.deepEqual(await fs.readFile(path.join(f.root, f.entry.path)), f.content);
  const restored = await fs.stat(path.join(f.root, f.entry.path)), master = await fs.stat(path.join(f.root, f.entry.master));
  assert.equal(restored.nlink, 1); assert.notEqual(restored.ino, master.ino);
  assert.equal(restoreRetainedMedia(f.root, f.entry.path).restored, false);
  await fs.writeFile(path.join(f.root, f.entry.path), '用户新修改', { encoding: 'utf8' });
  assert.throws(() => restoreRetainedMedia(f.root, f.entry.path), /拒绝覆盖/);
  assert.equal(await fs.readFile(path.join(f.root, f.entry.master), 'utf8'), f.content.toString('utf8'));
});

test('拒绝通过归档记录的相对跳转串到其他期次', async t => {
  const f = await fixture(t);
  const target = 'pipeline/output/vibe/ep02_other/publish.mp4';
  await fs.mkdir(path.dirname(path.join(f.root, target)), { recursive: true });
  await fs.writeFile(path.join(f.root, target), f.content);
  assert.throws(() => recordRetainedMedia(f.root, { ...f.entry, master: f.base + '../../ep02_other/publish.mp4' }), /无效|越界/);
});

test('生产工具不能用新审片覆盖仍承担归档恢复的发布母版', async t => {
  const f = await fixture(t);
  recordRetainedMedia(f.root, f.entry);
  await fs.writeFile(path.join(f.root, f.entry.path), '新版本内容', { encoding: 'utf8' });
  await fs.writeFile(path.join(f.root, 'index.json'), JSON.stringify({ route: 'vibe', episode: 'ep01', slug: 'demo', current_version: 'v1', review_output: f.entry.path, publish_output: f.entry.master }), { encoding: 'utf8' });
  assert.throws(() => createRouteCommand('vibe', 'publish', ['index.json'], { rootDir: f.root }), /母版|另存/);
  assert.deepEqual(await fs.readFile(path.join(f.root, f.entry.master)), f.content);
});

test('生产前明确要求恢复已归档的输入，通用入口可按索引识别路线', async t => {
  const f = await fixture(t);
  recordRetainedMedia(f.root, f.entry); await fs.unlink(path.join(f.root, f.entry.path));
  await fs.writeFile(path.join(f.root, 'index.json'), JSON.stringify({ route: 'vibe', episode: 'ep01', slug: 'demo', current_version: 'v2', review_output: f.entry.path, publish_output: f.base + 'new_publish.mp4' }), { encoding: 'utf8' });
  assert.throws(() => createRouteCommand('auto', 'publish', ['index.json'], { rootDir: f.root }), /恢复/);
  restoreRetainedMedia(f.root, f.entry.path);
  const plan = createRouteCommand('auto', 'publish', ['index.json'], { rootDir: f.root });
  assert.ok(plan.args.includes('publish'));
});

for (const route of ['vibe', 'course']) test(route + '实际默认输出受母版保护，不能通过清空登记路径绕过', async t => {
  const f = await fixture(t, route); recordRetainedMedia(f.root, f.entry);
  for (const publish of [undefined, route === 'vibe' ? f.base + 'different.mp4' : undefined]) {
    const index = { route, episode: 'ep01', slug: 'demo', current_version: 'v1', review_output: f.entry.path, publish_output: publish };
    await fs.writeFile(path.join(f.root, 'index.json'), JSON.stringify(index), { encoding: 'utf8' });
    assert.throws(() => createRouteCommand(route, 'publish', ['index.json'], { rootDir: f.root }), /母版|另存/);
  }
});
